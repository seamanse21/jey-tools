<?php
/* 나스 상태 확인용. 문제 해결이 끝나면 지워도 되는 파일이다. */
header('Content-Type: text/plain; charset=utf-8');

echo "PHP 버전      : " . phpversion() . "\n";

$user = '(모름)';
if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
    $info = posix_getpwuid(posix_geteuid());
    if (is_array($info) && isset($info['name'])) $user = $info['name'];
} elseif (function_exists('get_current_user')) {
    $user = get_current_user();
}
echo "웹서버 실행 계정: " . $user . "\n";
echo "폴더 위치      : " . dirname(__FILE__) . "\n\n";

$base = dirname(__FILE__);
$targets = array('.', 'data', 'photos', 'receipts', 'seed');
foreach ($targets as $t) {
    $p = $base . '/' . $t;
    echo str_pad($t, 10) . " 있음:" . (is_dir($p) ? 'O' : 'X')
       . "  읽기:" . (is_readable($p) ? 'O' : 'X')
       . "  쓰기:" . (is_writable($p) ? 'O' : 'X') . "\n";
}
echo "\n";
foreach (array('index.html', 'api.php', 'seed/seed.json', 'data/members.json') as $f) {
    $p = $base . '/' . $f;
    echo str_pad($f, 20) . " 있음:" . (is_file($p) ? 'O' : 'X')
       . "  읽기:" . (is_readable($p) ? 'O' : 'X') . "\n";
}

echo "\n실제로 써보기: ";
$test = $base . '/data/_write_test.txt';
if (!is_dir($base . '/data')) @mkdir($base . '/data', 0775, true);
$r = @file_put_contents($test, 'ok');
if ($r === false) {
    echo "실패 — data 폴더에 쓰기 권한이 없습니다\n";
} else {
    @unlink($test);
    echo "성공 — 저장 가능합니다\n";
}

echo "\napi.php 문법 확인: ";
$api = $base . '/api.php';
if (!is_file($api)) {
    echo "api.php 파일이 없습니다\n";
} else {
    $src = file_get_contents($api);
    if (function_exists('token_get_all')) {
        $old = error_reporting(0);
        $ok = true;
        try { token_get_all($src, TOKEN_PARSE); } catch (Throwable $e) { $ok = false; $msg = $e->getMessage(); }
        catch (Exception $e) { $ok = false; $msg = $e->getMessage(); }
        error_reporting($old);
        echo $ok ? "이상 없음\n" : ("문법 오류 — " . $msg . "\n");
    } else {
        echo "확인 불가\n";
    }
}
