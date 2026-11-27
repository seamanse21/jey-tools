<?php
/* 사구회 — 나스 저장용 API + 로그인
 *  GET  api.php?ping=1              → 상태 확인 (저장 가능 여부, 로그인 필요 여부)
 *  POST api.php?login=1             → 로그인 {id, pw}
 *  POST api.php?logout=1            → 로그아웃
 *  GET  api.php?store=dues          → data/dues.json 읽기
 *  POST api.php?store=dues          → data/dues.json 쓰기
 *  POST api.php?upload=photos       → photos/ 에 파일 올리기 (multipart, 필드명 file)
 *  GET  api.php?file=photos/a.jpg   → 올린 파일 내려주기 (로그인한 사람만)
 *
 * 사진·영수증·기록 파일은 폴더째 직접 접근을 막아두고(각 폴더의 .htaccess),
 * 반드시 이 파일을 거쳐서만 나간다. 로그인 창을 사이트 안에 두는 이유는
 * 카카오톡 같은 앱 내장 브라우저가 서버 기본 인증 창을 띄우지 못하기 때문이다.
 *
 * 나스마다 PHP 버전이 달라서 옛 버전(5.4+)에서도 돌아가게 썼다.
 */

@ini_set('display_errors', '0');

function sg_shutdown() {
    $e = error_get_last();
    if ($e && in_array($e['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR), true)) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode(array(
            'ok' => false,
            'error' => 'PHP 오류: ' . $e['message'],
            'file' => basename($e['file']) . ':' . $e['line'],
            'php' => phpversion()
        ));
    }
}
register_shutdown_function('sg_shutdown');

$base    = dirname(__FILE__);
$dataDir = $base . '/data';
$method  = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

$STORES   = array('settings', 'members', 'rules', 'history', 'dues', 'expenses');
$KINDS    = array('photos', 'receipts');
$EXT_OK   = array('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'pdf');
$MAX_FILE = 25 * 1024 * 1024;
$MAX_BODY = 20 * 1024 * 1024;
$MIME = array(
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
    'webp' => 'image/webp', 'gif' => 'image/gif', 'heic' => 'image/heic',
    'heif' => 'image/heif', 'pdf' => 'application/pdf'
);

/* ── 로그인 상태 유지 (60일) ── */
$cookiePath = preg_replace('#[^/]*$#', '', strtok(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/', '?'));
if ($cookiePath === '') $cookiePath = '/';
@session_name('SGSESS');
@session_set_cookie_params(60 * 60 * 24 * 60, $cookiePath, '', false, true);
@session_start();

function jflags() {
    $f = 0;
    if (defined('JSON_UNESCAPED_UNICODE')) $f = $f | JSON_UNESCAPED_UNICODE;
    if (defined('JSON_UNESCAPED_SLASHES')) $f = $f | JSON_UNESCAPED_SLASHES;
    return $f;
}
function out($a, $code = 200) {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        http_response_code($code);
    }
    echo json_encode($a, jflags());
    exit;
}
function fail($msg, $code = 400) { out(array('ok' => false, 'error' => $msg), $code); }
function enc($data) {
    $f = jflags();
    if (defined('JSON_PRETTY_PRINT')) $f = $f | JSON_PRETTY_PRINT;
    return json_encode($data, $f);
}
function rand_hex($n) {
    if (function_exists('random_bytes')) return bin2hex(random_bytes($n));
    if (function_exists('openssl_random_pseudo_bytes')) return bin2hex(openssl_random_pseudo_bytes($n));
    $s = '';
    for ($i = 0; $i < $n * 2; $i++) $s .= dechex(mt_rand(0, 15));
    return $s;
}

/* ── 직접 접근 차단막을 폴더마다 깔아 둔다 (없으면 만든다) ── */
function sg_guard($base) {
    $folders = array('data', 'photos', 'receipts', 'seed');
    foreach ($folders as $f) {
        $d = $base . '/' . $f;
        if (!is_dir($d)) continue;
        $g = $d . '/.htaccess';
        if (!is_file($g)) @file_put_contents($g, "Require all denied\n");
    }
}

/* ── 비밀번호 설정 읽기 ── */
function sg_conf($dataDir) {
    $f = $dataDir . '/auth.php';
    if (!is_file($f)) return null;
    $SG_AUTH = null;
    include $f;
    if (is_array($SG_AUTH) && isset($SG_AUTH['id']) && isset($SG_AUTH['hash'])) return $SG_AUTH;
    return null;
}
function sg_ok($conf) {
    if ($conf === null) return true;                       // 아직 잠그지 않았으면 통과
    return !empty($_SESSION['sg_ok']);
}
function sg_need($conf) {
    if (!sg_ok($conf)) out(array('ok' => false, 'error' => '로그인이 필요합니다.', 'auth' => 'required'), 401);
}

/* ── 로그인 실패 제한 (같은 주소에서 10번 틀리면 10분 쉼) ── */
function sg_fail_file($dataDir) { return $dataDir . '/_login_fail.json'; }
function sg_fail_load($dataDir) {
    $f = sg_fail_file($dataDir);
    if (!is_file($f)) return array();
    $j = json_decode((string)@file_get_contents($f), true);
    return is_array($j) ? $j : array();
}
function sg_ip() { return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '?'; }
function sg_locked($dataDir) {
    $all = sg_fail_load($dataDir);
    $me = isset($all[sg_ip()]) ? $all[sg_ip()] : null;
    if ($me && isset($me['until']) && $me['until'] > time()) return (int)ceil(($me['until'] - time()) / 60);
    return 0;
}
function sg_fail_add($dataDir) {
    $all = sg_fail_load($dataDir);
    $ip = sg_ip();
    $now = time();
    foreach ($all as $k => $v) { if (!isset($v['at']) || $v['at'] < $now - 3600) unset($all[$k]); }
    $n = (isset($all[$ip]['n']) ? (int)$all[$ip]['n'] : 0) + 1;
    $all[$ip] = array('n' => $n, 'at' => $now, 'until' => ($n >= 10 ? $now + 600 : 0));
    @file_put_contents(sg_fail_file($dataDir), json_encode($all));
}
function sg_fail_clear($dataDir) {
    $all = sg_fail_load($dataDir);
    unset($all[sg_ip()]);
    @file_put_contents(sg_fail_file($dataDir), json_encode($all));
}

$conf = sg_conf($dataDir);

/* ── 상태 확인 ── */
if (isset($_GET['ping'])) {
    if (!is_dir($dataDir)) @mkdir($dataDir, 0775, true);
    sg_guard($base);
    out(array(
        'ok'    => is_dir($dataDir) && is_writable($dataDir),
        'php'   => phpversion(),
        'write' => is_writable($dataDir) ? 'ok' : 'no',
        'auth'  => ($conf === null ? 'none' : (sg_ok($conf) ? 'ok' : 'required'))
    ));
}

/* ── 로그인 ── */
if (isset($_GET['login'])) {
    if ($method !== 'POST') fail('POST 만 받습니다.', 405);
    if ($conf === null) out(array('ok' => true, 'auth' => 'none'));
    $wait = sg_locked($dataDir);
    if ($wait > 0) out(array('ok' => false, 'error' => '너무 여러 번 틀렸습니다. ' . $wait . '분 뒤에 다시 시도해 주세요.'), 429);

    $raw = file_get_contents('php://input');
    $in = json_decode((string)$raw, true);
    if (!is_array($in)) $in = $_POST;
    $id = isset($in['id']) ? trim((string)$in['id']) : '';
    $pw = isset($in['pw']) ? (string)$in['pw'] : '';

    $good = ($id === $conf['id']) && password_verify($pw, $conf['hash']);
    if (!$good) {
        sleep(1);
        sg_fail_add($dataDir);
        out(array('ok' => false, 'error' => '아이디나 비밀번호가 맞지 않습니다.'), 401);
    }
    sg_fail_clear($dataDir);
    $_SESSION['sg_ok'] = true;
    out(array('ok' => true, 'auth' => 'ok'));
}

/* ── 로그아웃 ── */
if (isset($_GET['logout'])) {
    $_SESSION = array();
    @session_destroy();
    out(array('ok' => true, 'auth' => 'required'));
}

/* ── 올린 파일 내려주기 ── */
if (isset($_GET['file'])) {
    sg_need($conf);
    $rel = (string)$_GET['file'];
    if (strpos($rel, "\0") !== false || strpos($rel, '..') !== false) fail('잘못된 경로입니다.');
    $parts = explode('/', $rel);
    if (count($parts) < 2 || !in_array($parts[0], $KINDS, true)) fail('잘못된 경로입니다.');
    $full = realpath($base . '/' . $rel);
    $root = realpath($base . '/' . $parts[0]);
    if ($full === false || $root === false || strpos($full, $root) !== 0 || !is_file($full)) fail('파일이 없습니다.', 404);

    $ext = strtolower(pathinfo($full, PATHINFO_EXTENSION));
    if (!isset($MIME[$ext])) fail('내려줄 수 없는 파일입니다.');
    header('Content-Type: ' . $MIME[$ext]);
    header('Content-Length: ' . filesize($full));
    header('Cache-Control: private, max-age=604800');
    header('Content-Disposition: inline; filename="' . basename($full) . '"');
    readfile($full);
    exit;
}

/* ── 자료 읽기·쓰기 ── */
if (isset($_GET['store'])) {
    sg_need($conf);
    $name = (string)$_GET['store'];
    if (!in_array($name, $STORES, true)) fail('알 수 없는 자료 이름입니다.');
    $file = $dataDir . '/' . $name . '.json';

    if ($method === 'GET') {
        if (!is_file($file)) {
            $seedFile = $base . '/seed/seed.json';
            if (is_file($seedFile)) {
                $seed = json_decode((string)file_get_contents($seedFile), true);
                if (is_array($seed) && array_key_exists($name, $seed)) {
                    if (!is_dir($dataDir)) @mkdir($dataDir, 0775, true);
                    @file_put_contents($file, enc($seed[$name]));
                    out(array('ok' => true, 'data' => $seed[$name], 'seeded' => true));
                }
            }
            out(array('ok' => true, 'data' => null));
        }
        $raw = file_get_contents($file);
        $data = json_decode($raw, true);
        if ($data === null && trim($raw) !== 'null') fail('저장된 파일이 깨졌습니다: ' . $name . '.json', 500);
        out(array('ok' => true, 'data' => $data));
    }

    if ($method !== 'POST') fail('GET 또는 POST 만 받습니다.', 405);

    $raw = file_get_contents('php://input');
    if ($raw === false) fail('본문을 읽지 못했습니다.');
    if (strlen($raw) > $MAX_BODY) fail('자료가 너무 큽니다.', 413);
    $parsed = json_decode($raw, true);
    if ($parsed === null && trim($raw) !== 'null') fail('JSON 형식이 아닙니다.');

    if (!is_dir($dataDir) && !@mkdir($dataDir, 0775, true)) fail('data 폴더를 만들 수 없습니다.', 500);

    if (is_file($file)) {
        $bak = $dataDir . '/_backup';
        if (!is_dir($bak)) @mkdir($bak, 0775, true);
        $stamp = $bak . '/' . $name . '-' . date('Ymd') . '.json';
        if (!is_file($stamp)) @copy($file, $stamp);
    }

    $tmp = $file . '.tmp' . getmypid();
    $pretty = enc($parsed);
    if ($pretty === false) fail('JSON 으로 바꾸지 못했습니다.', 500);
    if (@file_put_contents($tmp, $pretty) === false) fail('파일을 쓰지 못했습니다. 폴더 권한을 확인해 주세요.', 500);
    if (!@rename($tmp, $file)) { @unlink($tmp); fail('파일을 저장하지 못했습니다.', 500); }
    @chmod($file, 0664);
    out(array('ok' => true, 'bytes' => strlen($pretty)));
}

/* ── 파일 올리기 ── */
if (isset($_GET['upload'])) {
    sg_need($conf);
    if ($method !== 'POST') fail('POST 만 받습니다.', 405);
    $kind = (string)$_GET['upload'];
    if (!in_array($kind, $KINDS, true)) fail('알 수 없는 올리기 종류입니다.');
    if (!isset($_FILES['file'])) fail('파일이 없습니다.');

    $f = $_FILES['file'];
    $err = isset($f['error']) ? $f['error'] : UPLOAD_ERR_NO_FILE;
    if ($err !== UPLOAD_ERR_OK) fail('올리기 중 오류 (코드 ' . $err . ')');
    $size = isset($f['size']) ? $f['size'] : 0;
    if ($size > $MAX_FILE) fail('파일이 너무 큽니다. 25MB 이하로 올려 주세요.', 413);

    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $EXT_OK, true)) fail('사진 또는 PDF 만 올릴 수 있습니다.');

    $rawFolder = isset($_POST['folder']) ? (string)$_POST['folder'] : '';
    $folder = preg_replace('/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_-]/u', '', $rawFolder);
    $folder = substr((string)$folder, 0, 40);
    $dir = $base . '/' . $kind . ($folder !== '' ? '/' . $folder : '');
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) fail($kind . ' 폴더를 만들 수 없습니다.', 500);
    sg_guard($base);

    $safe = preg_replace('/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ._-]/u', '_', pathinfo((string)$f['name'], PATHINFO_FILENAME));
    $safe = substr((string)$safe, 0, 40);
    $file = date('Ymd-His') . '-' . substr(rand_hex(3), 0, 6) . ($safe !== '' ? '-' . $safe : '') . '.' . $ext;

    if (!@move_uploaded_file($f['tmp_name'], $dir . '/' . $file)) fail('파일을 옮기지 못했습니다. 폴더 권한을 확인해 주세요.', 500);
    @chmod($dir . '/' . $file, 0664);

    out(array('ok' => true, 'path' => $kind . ($folder !== '' ? '/' . $folder : '') . '/' . $file));
}

fail('무엇을 할지 알 수 없습니다. ?ping=1 · ?store=이름 · ?upload=photos 를 쓰세요.', 404);
