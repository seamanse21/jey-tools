<?php
/* 사구회 — 나스 저장용 작은 API
 *  GET  api.php?ping=1            → 서버 저장이 가능한지 확인
 *  GET  api.php?store=dues        → data/dues.json 읽기
 *  POST api.php?store=dues        → data/dues.json 쓰기 (본문은 JSON)
 *  POST api.php?upload=photos     → photos/ 에 파일 올리기 (multipart, 필드명 file)
 *  POST api.php?upload=receipts   → receipts/ 에 파일 올리기
 *
 * 나스마다 PHP 버전이 달라서 옛 버전(5.4+)에서도 돌아가게 썼다.
 * 최신 문법(타입 선언, const 배열, ?? 연산자)을 일부러 쓰지 않는다.
 */

@ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

/* 치명적 오류가 나도 500 대신 이유가 담긴 JSON 을 돌려준다 */
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

$STORES  = array('settings', 'members', 'rules', 'history', 'dues', 'expenses');
$KINDS   = array('photos', 'receipts');
$EXT_OK  = array('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'pdf');
$MAX_FILE = 25 * 1024 * 1024;   // 파일 하나 25MB
$MAX_BODY = 20 * 1024 * 1024;   // JSON 본문 20MB

function out($a, $code = 200) {
    http_response_code($code);
    $flags = 0;
    if (defined('JSON_UNESCAPED_UNICODE')) $flags = $flags | JSON_UNESCAPED_UNICODE;
    if (defined('JSON_UNESCAPED_SLASHES')) $flags = $flags | JSON_UNESCAPED_SLASHES;
    echo json_encode($a, $flags);
    exit;
}
function fail($msg, $code = 400) { out(array('ok' => false, 'error' => $msg), $code); }

function enc($data) {
    $flags = 0;
    if (defined('JSON_UNESCAPED_UNICODE')) $flags = $flags | JSON_UNESCAPED_UNICODE;
    if (defined('JSON_UNESCAPED_SLASHES')) $flags = $flags | JSON_UNESCAPED_SLASHES;
    if (defined('JSON_PRETTY_PRINT'))      $flags = $flags | JSON_PRETTY_PRINT;
    return json_encode($data, $flags);
}
function rand_hex($n) {
    if (function_exists('random_bytes')) return bin2hex(random_bytes($n));
    if (function_exists('openssl_random_pseudo_bytes')) return bin2hex(openssl_random_pseudo_bytes($n));
    $s = '';
    for ($i = 0; $i < $n * 2; $i++) $s .= dechex(mt_rand(0, 15));
    return $s;
}

$base    = dirname(__FILE__);
$dataDir = $base . '/data';
$method  = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

/* ── 확인 ── */
if (isset($_GET['ping'])) {
    if (!is_dir($dataDir)) @mkdir($dataDir, 0775, true);
    out(array(
        'ok'      => is_dir($dataDir) && is_writable($dataDir),
        'php'     => phpversion(),
        'dataDir' => is_dir($dataDir) ? 'ok' : 'none',
        'write'   => is_writable($dataDir) ? 'ok' : 'no'
    ));
}

/* ── 자료 읽기·쓰기 ── */
if (isset($_GET['store'])) {
    $name = (string)$_GET['store'];
    if (!in_array($name, $STORES, true)) fail('알 수 없는 자료 이름입니다.');
    $file = $dataDir . '/' . $name . '.json';

    if ($method === 'GET') {
        if (!is_file($file)) {
            /* 아직 아무것도 저장된 적이 없으면 seed/seed.json 의 초기 자료를 심는다 */
            $seedFile = $base . '/seed/seed.json';
            if (is_file($seedFile)) {
                $seed = json_decode(file_get_contents($seedFile), true);
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

    /* 직전 내용을 하루 단위로 백업해 둔다 (실수로 지웠을 때 대비) */
    if (is_file($file)) {
        $bak = $dataDir . '/_backup';
        if (!is_dir($bak)) @mkdir($bak, 0775, true);
        $stamp = $bak . '/' . $name . '-' . date('Ymd') . '.json';
        if (!is_file($stamp)) @copy($file, $stamp);
    }

    /* 같은 폴더의 임시 파일에 쓴 뒤 바꿔치기 — 쓰는 중에 끊겨도 원본이 남는다 */
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

    /* 폴더 이름은 영문·숫자·한글·하이픈만 남긴다 (경로 타고 올라가기 방지) */
    $rawFolder = isset($_POST['folder']) ? (string)$_POST['folder'] : '';
    $folder = preg_replace('/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_-]/u', '', $rawFolder);
    $folder = substr((string)$folder, 0, 40);
    $dir = $base . '/' . $kind . ($folder !== '' ? '/' . $folder : '');
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) fail($kind . ' 폴더를 만들 수 없습니다.', 500);

    $safe = preg_replace('/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ._-]/u', '_', pathinfo((string)$f['name'], PATHINFO_FILENAME));
    $safe = substr((string)$safe, 0, 40);
    $file = date('Ymd-His') . '-' . substr(rand_hex(3), 0, 6) . ($safe !== '' ? '-' . $safe : '') . '.' . $ext;

    if (!@move_uploaded_file($f['tmp_name'], $dir . '/' . $file)) fail('파일을 옮기지 못했습니다. 폴더 권한을 확인해 주세요.', 500);
    @chmod($dir . '/' . $file, 0664);

    out(array('ok' => true, 'path' => $kind . ($folder !== '' ? '/' . $folder : '') . '/' . $file));
}

fail('무엇을 할지 알 수 없습니다. ?ping=1 · ?store=이름 · ?upload=photos 를 쓰세요.', 404);
