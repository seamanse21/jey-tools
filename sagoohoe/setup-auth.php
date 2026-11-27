<?php
/* 사구회 — 접속 비밀번호 설정 페이지
 * 이 페이지에서 비밀번호를 걸면 .htaccess / .htpasswd 가 만들어지고,
 * 그 뒤로는 사이트 전체(자료 파일·사진·영수증 포함)가 비밀번호 없이는 열리지 않는다.
 * 비밀번호는 암호화해서 저장하므로 이 파일이나 대화에 원문이 남지 않는다.
 */

$dir       = dirname(__FILE__);
$htaccess  = $dir . '/.htaccess';
$htpasswd  = $dir . '/.htpasswd';
$msg = '';
$msgType = '';

function h($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

/* 지금 보고 있는 주소에서 사이트 경로를 뽑아낸다 (/sagoohoe/) */
$selfPath = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
$sitePath = preg_replace('#[^/]*$#', '', strtok($selfPath, '?'));

function writeAuth($dir, $htaccess, $htpasswd, $id, $pass) {
    $hash = password_hash($pass, PASSWORD_BCRYPT);
    if ($hash === false) return '비밀번호를 암호화하지 못했습니다.';
    if (@file_put_contents($htpasswd, $id . ':' . $hash . "\n") === false)
        return '.htpasswd 를 쓰지 못했습니다. 폴더 쓰기 권한을 확인해 주세요.';
    @chmod($htpasswd, 0640);

    $conf = "AuthType Basic\n"
          . "AuthName \"Sagoohoe members only\"\n"
          . "AuthUserFile " . $htpasswd . "\n"
          . "Require valid-user\n\n"
          . "<FilesMatch \"^\\.ht\">\n"
          . "    Require all denied\n"
          . "</FilesMatch>\n";
    if (@file_put_contents($htaccess, $conf) === false)
        return '.htaccess 를 쓰지 못했습니다. 폴더 쓰기 권한을 확인해 주세요.';
    @chmod($htaccess, 0644);
    return '';
}

/* 설정이 실제로 먹었는지 서버가 스스로 확인한다 */
function selfCheck($sitePath) {
    $port = isset($_SERVER['SERVER_PORT']) ? (int)$_SERVER['SERVER_PORT'] : 80;
    $tries = array($port, 80);
    $ctx = stream_context_create(array('http' => array(
        'timeout' => 4, 'ignore_errors' => true, 'follow_location' => 0
    )));
    foreach (array_unique($tries) as $p) {
        if ($p === 443) continue;
        $http_response_header = array();
        $r = @file_get_contents('http://127.0.0.1:' . $p . $sitePath, false, $ctx);
        if ($r !== false && isset($http_response_header[0]))
            return (strpos($http_response_header[0], '401') !== false);
    }
    return null;   // 확인 불가
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = isset($_POST['action']) ? $_POST['action'] : '';
    if ($action === 'off') {
        @unlink($htaccess);
        @unlink($htpasswd);
        $msg = '잠금을 풀었습니다. 이제 주소만 알면 누구나 들어올 수 있습니다.';
        $msgType = 'warn';
    } else {
        $id   = trim(isset($_POST['id']) ? $_POST['id'] : '');
        $p1   = isset($_POST['p1']) ? $_POST['p1'] : '';
        $p2   = isset($_POST['p2']) ? $_POST['p2'] : '';
        if ($id === '' || !preg_match('/^[A-Za-z0-9._-]{2,20}$/', $id)) {
            $msg = '아이디는 숫자나 영문으로 2자 이상 적어 주세요.'; $msgType = 'no';
        } elseif (strlen($p1) < 4) {
            $msg = '비밀번호는 4자 이상으로 해주세요.'; $msgType = 'no';
        } elseif ($p1 !== $p2) {
            $msg = '비밀번호 두 칸이 서로 다릅니다.'; $msgType = 'no';
        } else {
            $err = writeAuth($dir, $htaccess, $htpasswd, $id, $p1);
            if ($err !== '') { $msg = $err; $msgType = 'no'; }
            else {
                $ok = selfCheck($sitePath);
                if ($ok === true)       { $msg = '잠금이 걸렸습니다. 이제 아이디와 비밀번호를 아는 사람만 들어올 수 있습니다.'; $msgType = 'ok'; }
                elseif ($ok === false)  { $msg = '파일은 만들었는데 아직 잠기지 않았습니다. 아래 "직접 확인하기"를 눌러 시크릿 창에서 확인해 주세요.'; $msgType = 'warn'; }
                else                    { $msg = '파일을 만들었습니다. 서버가 스스로 확인하지는 못했으니 아래 "직접 확인하기"로 꼭 확인해 주세요.'; $msgType = 'warn'; }
            }
        }
    }
}

$on = is_file($htaccess) && is_file($htpasswd);
$curId = '';
if (is_file($htpasswd)) {
    $line = trim((string)@file_get_contents($htpasswd));
    if ($line !== '') { $parts = explode(':', $line); $curId = $parts[0]; }
}
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사구회 접속 잠금</title>
<link rel="stylesheet" href="assets/app.css">
</head>
<body>
<main class="view" style="max-width:620px">
  <h1 style="font-size:20px">사구회 접속 잠금</h1>
  <p class="small muted">아이디와 비밀번호를 하나 정해 9명에게 알려주면, 그 둘을 아는 사람만 사이트에 들어올 수 있습니다.
     회비 기록·영수증 파일까지 전부 같이 잠깁니다. <b>둘 다 숫자로만 정해도 됩니다.</b></p>

  <?php if ($msg !== ''): ?>
    <div class="card" style="border-color:var(--<?php echo $msgType === 'ok' ? 'ok' : ($msgType === 'no' ? 'no' : 'warn'); ?>)">
      <b><?php echo h($msg); ?></b>
    </div>
  <?php endif; ?>

  <div class="card">
    <div class="spread" style="margin-bottom:12px">
      <h2 style="font-size:16px;margin:0">현재 상태</h2>
      <span class="tag <?php echo $on ? 'ok' : 'no'; ?>"><?php echo $on ? '잠김' : '누구나 접속 가능'; ?></span>
    </div>
    <?php if ($on): ?>
      <p class="small">아이디: <b><?php echo h($curId); ?></b> · 비밀번호는 암호화되어 있어 다시 볼 수 없습니다.
         잊었으면 아래에서 새로 정하면 됩니다.</p>
    <?php else: ?>
      <p class="small">아직 잠겨 있지 않습니다. 지금 바로 설정하세요.</p>
    <?php endif; ?>
  </div>

  <form method="post" class="card">
    <h2 style="font-size:16px"><?php echo $on ? '비밀번호 바꾸기' : '비밀번호 걸기'; ?></h2>
    <div class="grid" style="margin-top:10px">
      <div><label class="f">아이디 — 숫자만 써도 됩니다 (2자 이상)</label>
        <input name="id" value="<?php echo h($curId !== '' ? $curId : '49'); ?>" autocomplete="username"></div>
      <div><label class="f">비밀번호 — 숫자만 써도 됩니다 (4자 이상)</label>
        <input type="password" name="p1" autocomplete="new-password"></div>
      <div><label class="f">비밀번호 다시 입력</label>
        <input type="password" name="p2" autocomplete="new-password"></div>
    </div>
    <div class="row end" style="margin-top:14px">
      <button class="btn pri" type="submit">저장</button>
    </div>
    <p class="tiny muted" style="margin-top:10px">비밀번호는 암호화(bcrypt)해서 보관합니다. 이 화면에도, 파일에도 원문은 남지 않습니다.<br>
       아이디 숫자 2자리 + 비밀번호 숫자 4자리면 충분히 간단합니다 (예: 아이디 <code>49</code>, 비밀번호 <code>1234</code>).
       더 단단히 하고 싶으면 자릿수를 늘리면 됩니다.</p>
  </form>

  <?php if ($on): ?>
  <div class="card">
    <h2 style="font-size:16px">확인과 해제</h2>
    <p class="small">제대로 잠겼는지 보려면 <b>시크릿 창</b>(⌘⇧N)으로 아래 주소를 열어 보세요. 로그인 창이 떠야 정상입니다.</p>
    <p class="small"><code><?php echo h($sitePath); ?></code></p>
    <form method="post" onsubmit="return confirm('잠금을 풀면 주소만 알면 누구나 들어올 수 있습니다. 계속할까요?');">
      <input type="hidden" name="action" value="off">
      <button class="btn danger" type="submit">잠금 해제</button>
    </form>
  </div>
  <?php endif; ?>

  <p class="tiny muted">문제가 생겨 사이트 전체가 안 열리면, File Station 에서 이 폴더의 <b>.htaccess</b> 파일을 지우면 원래대로 돌아옵니다.
     (File Station 오른쪽 위 <b>설정 → 숨김 파일 표시</b> 를 켜야 보입니다)</p>
</main>
</body>
</html>
