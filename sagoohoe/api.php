<?php
/* 사구회 — 나스 저장용 작은 API
 *  GET  api.php?ping=1            → 서버 저장이 가능한지 확인
 *  GET  api.php?store=dues        → data/dues.json 읽기
 *  POST api.php?store=dues        → data/dues.json 쓰기 (본문은 JSON)
 *  POST api.php?upload=photos     → photos/ 에 파일 올리기 (multipart, 필드명 file)
 *  POST api.php?upload=receipts   → receipts/ 에 파일 올리기
 * 이 파일은 사이트 폴더 안에 그냥 두면 됩니다. PHP 가 꺼져 있으면
 * 사이트는 자동으로 "브라우저에만 저장" 모드로 동작합니다.
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const STORES   = ['settings', 'members', 'rules', 'history', 'dues', 'expenses'];
const KINDS    = ['photos', 'receipts'];
const EXT_OK   = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'pdf'];
const MAX_FILE = 25 * 1024 * 1024;   // 파일 하나 25MB
const MAX_BODY = 20 * 1024 * 1024;   // JSON 본문 20MB

function out(array $a, int $code = 200): void {
    http_response_code($code);
    echo json_encode($a, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400): void { out(['ok' => false, 'error' => $msg], $code); }

$base = __DIR__;
$dataDir = $base . '/data';

/* ── 확인 ── */
if (isset($_GET['ping'])) {
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0775, true)) {
        fail('data 폴더를 만들 수 없습니다. 폴더 쓰기 권한을 확인해 주세요.', 500);
    }
    out(['ok' => is_writable($dataDir), 'php' => PHP_VERSION]);
}

/* ── 자료 읽기·쓰기 ── */
if (isset($_GET['store'])) {
    $name = (string)$_GET['store'];
    if (!in_array($name, STORES, true)) fail('알 수 없는 자료 이름입니다.');
    $file = $dataDir . '/' . $name . '.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (!is_file($file)) {
            /* 아직 아무것도 저장된 적이 없으면 seed/seed.json 의 초기 자료를 심는다 */
            $seedFile = $base . '/seed/seed.json';
            if (is_file($seedFile)) {
                $seed = json_decode((string)file_get_contents($seedFile), true);
                if (is_array($seed) && array_key_exists($name, $seed)) {
                    if (!is_dir($dataDir)) @mkdir($dataDir, 0775, true);
                    @file_put_contents($file, json_encode($seed[$name],
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
                    out(['ok' => true, 'data' => $seed[$name], 'seeded' => true]);
                }
            }
            out(['ok' => true, 'data' => null]);
        }
        $raw = file_get_contents($file);
        $data = json_decode((string)$raw, true);
        if ($data === null && trim((string)$raw) !== 'null') fail('저장된 파일이 깨졌습니다: ' . $name . '.json', 500);
        out(['ok' => true, 'data' => $data]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('GET 또는 POST 만 받습니다.', 405);

    $raw = file_get_contents('php://input');
    if ($raw === false) fail('본문을 읽지 못했습니다.');
    if (strlen($raw) > MAX_BODY) fail('자료가 너무 큽니다.', 413);
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
    $pretty = json_encode($parsed, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($pretty === false) fail('JSON 으로 바꾸지 못했습니다.', 500);
    if (@file_put_contents($tmp, $pretty) === false) fail('파일을 쓰지 못했습니다. 폴더 권한을 확인해 주세요.', 500);
    if (!@rename($tmp, $file)) { @unlink($tmp); fail('파일을 저장하지 못했습니다.', 500); }
    @chmod($file, 0664);
    out(['ok' => true, 'bytes' => strlen($pretty)]);
}

/* ── 파일 올리기 ── */
if (isset($_GET['upload'])) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST 만 받습니다.', 405);
    $kind = (string)$_GET['upload'];
    if (!in_array($kind, KINDS, true)) fail('알 수 없는 올리기 종류입니다.');
    if (!isset($_FILES['file'])) fail('파일이 없습니다.');

    $f = $_FILES['file'];
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail('올리기 중 오류 (코드 ' . $f['error'] . ')');
    if (($f['size'] ?? 0) > MAX_FILE) fail('파일이 너무 큽니다. 25MB 이하로 올려 주세요.', 413);

    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, EXT_OK, true)) fail('사진 또는 PDF 만 올릴 수 있습니다.');

    /* 폴더 이름은 영문·숫자·한글·하이픈만 남긴다 (경로 타고 올라가기 방지) */
    $folder = preg_replace('/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_-]/u', '', (string)($_POST['folder'] ?? ''));
    $folder = substr((string)$folder, 0, 40);
    $dir = $base . '/' . $kind . ($folder !== '' ? '/' . $folder : '');
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) fail($kind . ' 폴더를 만들 수 없습니다.', 500);

    $safe = preg_replace('/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ._-]/u', '_', pathinfo((string)$f['name'], PATHINFO_FILENAME));
    $safe = substr((string)$safe, 0, 40);
    $file = date('Ymd-His') . '-' . substr(bin2hex(random_bytes(3)), 0, 6) . ($safe !== '' ? '-' . $safe : '') . '.' . $ext;

    if (!@move_uploaded_file($f['tmp_name'], $dir . '/' . $file)) fail('파일을 옮기지 못했습니다. 폴더 권한을 확인해 주세요.', 500);
    @chmod($dir . '/' . $file, 0664);

    out(['ok' => true, 'path' => $kind . ($folder !== '' ? '/' . $folder : '') . '/' . $file]);
}

fail('무엇을 할지 알 수 없습니다. ?ping=1 · ?store=이름 · ?upload=photos 를 쓰세요.', 404);
