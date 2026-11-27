<?php
/* 사구회 — 접속 비밀번호 설정 페이지
 * 여기서 아이디·비밀번호를 정하면 사이트에 들어올 때 로그인 화면이 먼저 뜬다.
 * 로그인 창을 서버(기본 인증)가 아니라 사이트 안에 두는 이유는,
 * 카카오톡 같은 앱 내장 브라우저가 서버 로그인 창을 띄우지 못하기 때문이다.
 * 비밀번호는 암호화(bcrypt)해서 data/auth.php 에 저장한다.
 */

$dir      = dirname(__FILE__);
$dataDir  = $dir . '/data';
$authFile = $dataDir . '/auth.php';
$htaccess = $dir . '/.htaccess';
$htpasswd = $dir . '/.htpasswd';     // 예전 방식에서 쓰던 파일 — 있으면 지운다
$msg = ''; $msgType = '';

function h($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

$selfPath = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
$sitePath = preg_replace('#[^/]*$#', '', strtok($selfPath, '?'));

/* 기록·사진 폴더는 주소를 직접 쳐도 안 열리게 막는다 */
function guard($dir) {
    $made = array();
    foreach (array('data', 'photos', 'receipts', 'seed') as $f) {
        $d = $dir . '/' . $f;
        if (!is_dir($d)) continue;
        $g = $d . '/.htaccess';
        if (!is_file($g) || strpos((string)@file_get_contents($g), 'denied') === false) {
            if (@file_put_contents($g, "Require all denied\n") !== false) $made[] = $f;
        }
    }
    return $made;
}

function writeAuth($dataDir, $authFile, $accounts) {
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0775, true)) return 'data 폴더를 만들 수 없습니다.';
    $php = "<?php\n/* 사구회 접속 정보. 비밀번호는 암호화되어 있어 되돌려 볼 수 없습니다.\n"
         . "   admin  = 운영진 (모든 항목을 고칠 수 있음)\n"
         . "   member = 회원 9명 공용 (사진 올리기와 정산금 신청만) */\n"
         . "\$SG_AUTH = array(\n";
    foreach ($accounts as $role => $a) {
        $hash = password_hash($a['pw'], PASSWORD_BCRYPT);
        if ($hash === false) return '비밀번호를 암호화하지 못했습니다.';
        $php .= "    " . var_export($role, true) . " => array(\n"
              . "        'id'   => " . var_export($a['id'], true) . ",\n"
              . "        'hash' => " . var_export($hash, true) . "\n"
              . "    ),\n";
    }
    $php .= ");\n";
    if (@file_put_contents($authFile, $php) === false)
        return 'data/auth.php 를 쓰지 못했습니다. 폴더 쓰기 권한을 확인해 주세요.';
    @chmod($authFile, 0640);
    return '';
}

/* 기록 파일이 주소로 직접 열리지 않는지 서버가 스스로 확인한다 */
function selfCheck($sitePath) {
    $port = isset($_SERVER['SERVER_PORT']) ? (int)$_SERVER['SERVER_PORT'] : 80;
    $ctx = stream_context_create(array('http' => array(
        'timeout' => 4, 'ignore_errors' => true, 'follow_location' => 0
    )));
    foreach (array_unique(array($port, 80)) as $p) {
        if ($p === 443) continue;
        $http_response_header = array();
        $r = @file_get_contents('http://127.0.0.1:' . $p . $sitePath . 'data/members.json', false, $ctx);
        if (isset($http_response_header[0])) {
            return (strpos($http_response_header[0], '200') === false);
        }
    }
    return null;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = isset($_POST['action']) ? $_POST['action'] : '';
    if ($action === 'off') {
        @unlink($authFile);
        $msg = '잠금을 풀었습니다. 이제 주소만 알면 누구나 들어올 수 있습니다.';
        $msgType = 'warn';
    } else {
        $aId = trim(isset($_POST['aid']) ? $_POST['aid'] : '');
        $aPw = isset($_POST['apw']) ? $_POST['apw'] : '';
        $mId = trim(isset($_POST['mid']) ? $_POST['mid'] : '');
        $mPw = isset($_POST['mpw']) ? $_POST['mpw'] : '';
        $okId = '/^[A-Za-z0-9._-]{2,20}$/';
        if (!preg_match($okId, $aId) || !preg_match($okId, $mId)) {
            $msg = '아이디는 숫자나 영문으로 2자 이상 적어 주세요.'; $msgType = 'no';
        } elseif (strlen($aPw) < 4 || strlen($mPw) < 4) {
            $msg = '비밀번호는 4자 이상으로 해주세요.'; $msgType = 'no';
        } elseif ($aId === $mId) {
            $msg = '운영진 아이디와 회원 아이디는 서로 달라야 합니다.'; $msgType = 'no';
        } else {
            $err = writeAuth($dataDir, $authFile, array(
                'admin'  => array('id' => $aId, 'pw' => $aPw),
                'member' => array('id' => $mId, 'pw' => $mPw)
            ));
            if ($err !== '') { $msg = $err; $msgType = 'no'; }
            else {
                guard($dir);
                /* 예전 기본 인증 방식의 흔적을 걷어낸다 */
                @unlink($htpasswd);
                @file_put_contents($htaccess, "<FilesMatch \"^\\.ht\">\n    Require all denied\n</FilesMatch>\n");
                $ok = selfCheck($sitePath);
                if ($ok === true)      { $msg = '잠금이 걸렸습니다. 이제 사이트를 열면 로그인 화면이 먼저 뜹니다.'; $msgType = 'ok'; }
                elseif ($ok === false) { $msg = '로그인은 걸렸지만, 기록 파일이 주소로 직접 열리는 상태입니다. 아래 안내를 봐주세요.'; $msgType = 'warn'; }
                else                   { $msg = '설정했습니다. 서버가 스스로 확인하지는 못했으니 아래 "확인하기" 로 직접 봐주세요.'; $msgType = 'warn'; }
            }
        }
    }
}

guard($dir);
$on = is_file($authFile);
$curAdmin = ''; $curMember = '';
if ($on) {
    $SG_AUTH = null;
    include $authFile;
    if (is_array($SG_AUTH)) {
        if (isset($SG_AUTH['admin']['id']))  $curAdmin  = $SG_AUTH['admin']['id'];
        if (isset($SG_AUTH['member']['id'])) $curMember = $SG_AUTH['member']['id'];
        if ($curAdmin === '' && isset($SG_AUTH['id'])) $curAdmin = $SG_AUTH['id'];   // 예전 방식
    }
}
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사구회 접속 잠금</title>
<link rel="stylesheet" href="assets/app.css?v=4">
</head>
<body>
<main class="view" style="max-width:620px">
  <h1 style="font-size:20px">사구회 접속 잠금</h1>
  <p class="small muted">비밀번호를 <b>두 벌</b> 정합니다. <b>운영진용</b>은 모든 항목을 고칠 수 있고,
     <b>회원용</b>은 사진 올리기와 정산금 신청만 할 수 있습니다. 회원용만 9명에게 알려주세요.
     아이디·비밀번호 모두 숫자로만 정해도 됩니다.</p>

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
      <p class="small">운영진 아이디: <b><?php echo h($curAdmin !== '' ? $curAdmin : '(없음)'); ?></b> ·
         회원 아이디: <b><?php echo h($curMember !== '' ? $curMember : '(없음)'); ?></b><br>
         비밀번호는 암호화되어 있어 다시 볼 수 없습니다. 잊었으면 아래에서 새로 정하면 됩니다.</p>
      <?php if ($curMember === ''): ?>
        <p class="small" style="color:var(--warn)"><b>회원용 계정이 아직 없습니다.</b> 아래에서 두 벌을 같이 정해 주세요.</p>
      <?php endif; ?>
    <?php else: ?>
      <p class="small">아직 잠겨 있지 않습니다. 지금 바로 설정하세요.</p>
    <?php endif; ?>
  </div>

  <form method="post" class="card">
    <h2 style="font-size:16px"><?php echo $on ? '비밀번호 바꾸기' : '비밀번호 걸기'; ?></h2>
    <h3 style="font-size:14px;margin-top:14px">운영진용 (나만 씁니다 — 모든 항목 수정 가능)</h3>
    <div class="grid g2" style="margin-top:6px">
      <div><label class="f">아이디 (2자 이상)</label>
        <input name="aid" value="<?php echo h($curAdmin !== '' ? $curAdmin : '10'); ?>" autocomplete="off"></div>
      <div><label class="f">비밀번호 (4자 이상)</label>
        <input type="password" name="apw" autocomplete="new-password"></div>
    </div>
    <h3 style="font-size:14px;margin-top:18px">회원용 (9명에게 알려줄 것 — 사진·정산 신청만)</h3>
    <div class="grid g2" style="margin-top:6px">
      <div><label class="f">아이디 (2자 이상)</label>
        <input name="mid" value="<?php echo h($curMember !== '' ? $curMember : '49'); ?>" autocomplete="off"></div>
      <div><label class="f">비밀번호 (4자 이상)</label>
        <input type="password" name="mpw" autocomplete="new-password"></div>
    </div>
    <div class="row end" style="margin-top:14px">
      <button class="btn pri" type="submit">저장</button>
    </div>
    <p class="tiny muted" style="margin-top:14px">두 벌을 한 번에 저장합니다. 비밀번호는 암호화(bcrypt)해서 보관하므로
       이 화면에도, 파일에도 원문은 남지 않습니다. 운영진 아이디와 회원 아이디는 서로 달라야 합니다.<br>
       숫자 2자리 아이디 + 4자리 비밀번호면 충분히 간단합니다. 더 단단히 하고 싶으면 자릿수를 늘리면 됩니다.</p>
  </form>

  <?php if ($on): ?>
  <div class="card">
    <h2 style="font-size:16px">확인과 해제</h2>
    <p class="small">제대로 걸렸는지 보려면 <b>시크릿 창</b>으로 사이트를 열어 보세요. 로그인 화면이 떠야 정상입니다.</p>
    <p class="small"><a href="<?php echo h($sitePath); ?>" target="_blank">사이트 열기</a> ·
       <a href="<?php echo h($sitePath); ?>data/members.json" target="_blank">기록 파일 직접 열어보기</a>
       (이쪽은 <b>Forbidden</b> 이 떠야 정상입니다)</p>
    <form method="post" onsubmit="return confirm('잠금을 풀면 주소만 알면 누구나 들어올 수 있습니다. 계속할까요?');">
      <input type="hidden" name="action" value="off">
      <button class="btn danger" type="submit">잠금 해제</button>
    </form>
  </div>
  <?php endif; ?>

  <div class="card">
    <h2 style="font-size:16px">누가 무엇을 할 수 있나</h2>
    <table style="font-size:13px">
      <thead><tr><th class="name">항목</th><th>운영진</th><th>회원</th></tr></thead>
      <tbody>
        <tr><td class="name">회비 입력·수정</td><td>O</td><td class="muted">보기만</td></tr>
        <tr><td class="name">모임 기록·안건·투표</td><td>O</td><td class="muted">보기만</td></tr>
        <tr><td class="name">모임 사진 올리기</td><td>O</td><td>O</td></tr>
        <tr><td class="name">정산금 신청·영수증 첨부</td><td>O</td><td>O</td></tr>
        <tr><td class="name">정산 승인·반려·지급</td><td>O</td><td class="muted">불가</td></tr>
        <tr><td class="name">회칙 수정</td><td>O</td><td class="muted">보기만</td></tr>
        <tr><td class="name">설정 · 백업</td><td>O</td><td class="muted">불가</td></tr>
      </tbody>
    </table>
  </div>

  <p class="tiny muted">카카오톡 등 앱 안에서 열어도 로그인 화면이 그대로 뜹니다.
     한 번 로그인하면 그 기기에서는 한동안 다시 묻지 않습니다.</p>
</main>
</body>
</html>
