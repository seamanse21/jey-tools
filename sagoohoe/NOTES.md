# 사구회 관리 사이트 — 구현 메모

사용 설명은 `README.md`. 이 문서는 나중에 손볼 때 읽을 구조·결정 기록이다.

## 설계 결정

**왜 서버 프레임워크를 안 썼나.** 나스(Synology Web Station)에 폴더째 올려 두면 끝나야 한다는 조건이
제일 컸다. DB·빌드·패키지 설치가 들어가면 나스 사정이 바뀔 때마다 손이 간다.
그래서 정적 HTML + `api.php` 한 장 + `data/*.json` 구조로 갔다.
외부 라이브러리는 하나도 안 쓴다 (저장소 공통 규칙).

**저장 위치를 자동으로 고른다.** `store.js` 가 켜질 때 `api.php?ping=1` 을 한 번 때려 본다.

| 응답 | 모드 | 저장 위치 | 사진·영수증 |
|---|---|---|---|
| `{ok:true}` | server | 나스 `data/*.json` | `photos/`, `receipts/` 에 실제 파일 |
| 그 외 (404·PHP 꺼짐·`file://`) | local | 브라우저 localStorage | 1100px 로 줄여 data URL |

PHP 가 없어도 화면이 다 뜨고 눌러볼 수 있다. 미리보기·시연용으로 쓸모가 있어서 남겼다.

**초기 자료는 `seed/seed.json` 하나로.** 자료가 아직 없을 때 `api.php` 가 이 파일에서 해당 부분을
꺼내 `data/` 에 심고 돌려준다. 클라이언트에 초기화 분기를 두지 않으려고 서버 쪽에 뒀다.
처음엔 `seed/<store>.json` 으로 쪼갰는데, 없는 파일마다 404 가 찍혀서 한 파일로 합쳤다.

**공개 저장소라 실제 기록은 커밋하지 않는다.** `data/`, `photos/`, `receipts/` 는 `.gitignore` 에 있다.
`seed/seed.json` 의 회칙 초안에도 회원 실명을 넣지 않았다 (제3조는 "9명으로 한다" 로만).
실명이 든 `data/members.json` 과 회칙은 Jey 에게 전달한 zip 안에만 있다.

## 파일

```
index.html          껍데기 (상단바 + 탭 + 모달/토스트 자리)
assets/store.js     저장 계층. 모드 판정, 읽기/쓰기(350ms 디바운스), 업로드, 이미지 축소, 백업
assets/ui.js        h() DOM 헬퍼, 금액·날짜 포맷, 모달, 토스트, 첨부 위젯, 복사/다운로드
assets/app.js       해시 라우터(#/dues 등), "나" 선택, 모드 배지, 백업 버튼
assets/page-*.js    화면 5개. 각각 window.PAGES[이름] = function(view, params) 로 등록
api.php             ping / store 읽기·쓰기 / 파일 업로드
seed/seed.json      첫 설치용 초기 자료 (설정 + 회칙 초안)
```

ES 모듈이 아니라 평범한 `<script>` 다. `file://` 로 열어도 돌아가야 해서 그렇게 했다.

## 자료 구조

```jsonc
settings  { monthlyDue, kmPerLiter, fuelPrice, startYear, chairman, treasurer, dueYearly:{"2006":30000} }
members   [ { id:"m1", name, active, joinedAt } ]
rules     { articles:[{id,title,body,since}], history:[{id,at,reason,by,snapshot:[...articles]}] }
history   { meetings:[{ id, date, season, place, attendees:[mid], memo, spend,
                        photos:[{name,url}], agendas:[{id,title,body,proposer,votes:{mid:"찬성"},status}] }] }
dues      { years: { "2026": { "m1": { "3": 50000 } } } }      // 금액 그대로 저장, 0 이면 키를 지움
expenses  { seq, requests:[{ id,no,applicantId,meetingId,date,status,statusNote,memo,
                             trips:[{mode,note,roundTrip,amount,receipts,km,toll,tollReceipts,kmPerLiter,fuelPrice}],
                             items:[{label,amount,receipts}] }] }
```

회비는 **금액**으로 저장한다 (bool 아님). 부분 납입과 연도별 회비 변동을 담으려면 이래야 했다.
회칙 개정 이력은 diff 가 아니라 **전문 스냅샷**이다. 9명짜리 모임 규모에서는 이게 제일 안 헷갈린다.

## 계산 규칙

- 자차 유류비 = `총 운행거리 ÷ 연비기준(기본 10km/L) × 유가단가`, `Math.round`
- 안건 자동 판정 = 찬성 > 참석자 ÷ 2 면 가결, 반대 ≥ 찬성이면 부결, 나머지는 보류. 손으로 덮어쓸 수 있다
- 회비 "미납" = **지난 달까지만** 센다. 올해면 이번 달까지, 지난해면 12개월, 내년이면 0.
  (연말까지의 미래분을 미납으로 세면 11월에 미납이 500만원으로 찍혀서 쓸모가 없었다)

## 손봤던 버그 (같은 실수 반복 방지)

1. **`[hidden]` 이 안 먹던 모달.** `.modal{display:flex}` 가 `[hidden]` 의 `display:none` 을 이겨서,
   닫힌 모달이 화면 전체에서 클릭을 가로채고 있었다. `[hidden]{display:none!important}` 로 해결.
2. **`change` 이벤트 의존.** 입력칸을 `onchange` 로 받으면 포커스가 빠져야 값이 들어간다.
   모바일에서 숫자 입력하고 바로 탭을 옮기면 값이 날아간다. 글자·숫자 입력은 전부 `oninput` 으로 바꿨다
   (셀렉트·체크박스만 `change`). 저장은 어차피 350ms 디바운스라 부담 없다.
3. **회비 칸 토글이 한 방향으로만.** 클릭 핸들러가 렌더 시점 금액을 클로저에 가둬 놓고,
   `refresh()` 는 버튼을 새로 만들지 않아서 두 번째 클릭이 먹지 않았다. 핸들러 안에서 현재 값을 다시 읽게 고쳤다.
4. **합계 상자 초기화 순서.** `drawTrips()` 가 아직 만들어지지 않은 `totalBox` 를 건드려 터졌다.
   상자를 먼저 만들고 자리에만 나중에 붙인다.
5. **한글 파일명 다운로드.** Chromium 이 비ASCII `download` 속성을 버리고 `download` 라는 이름으로
   저장해서, 백업 파일명을 `sagoohoe-backup-YYYY-MM-DD.json` 으로 바꿨다.

## 검증

Playwright 로 PHP 띄운 상태(31개)·PHP 없는 상태(6개)·업로드(6개)를 돌렸고 전부 통과했다.
확인한 것: 저장 모드 판정, 회비 칸 토글/월 일괄/금액 직접 입력/서버 파일 반영, 모임·참석자·안건 투표
가결·부결, 자차 유류비 계산(420km → 71,400원), 영수증 없는 제출 차단, 승인→지급완료 상태 흐름,
회칙 개정 확정과 이력 전문, 사진·영수증 업로드와 실제 파일 생성, 백업 내려받기,
390px 폭에서 가로 넘침 0, 다크 모드.

테스트 스크립트는 세션 임시 폴더에 있었고 저장소에 남기지 않았다.
다시 돌리려면 `php -S 127.0.0.1:8777 -t .` 띄우고 Playwright 로 같은 흐름을 밟으면 된다.

## 나스에 실제로 올리면서 겪은 것 (DSM 7)

**QuickConnect 로는 Web Station 사이트가 안 열린다.** QuickConnect 는 DSM 관리 화면만 중계한다.
집 안에서는 나스 IP(`192.168.0.210`), 밖에서는 DDNS(`seamanse.synology.me`) 로 들어가야 한다.

**`.php` 만 500 이 났던 이유.** Web Station → 웹 서비스 → 기본 서비스의 PHP 가
"구성되지 않음" 이었다. PHP 8.2 패키지는 깔려 있었는데 서비스에 연결만 안 된 상태.
연결하고 저장하면 잠시 503(Apache 가 PHP-FPM 을 아직 못 잡음)이 나는데, 재부팅하면 풀린다.

**`phpcheck.php` 가 실행 계정을 잘못 보고했다.** Synology PHP 는 `posix_*` 함수가 막혀 있어
`get_current_user()` 로 넘어가는데, 이건 프로세스 사용자가 아니라 **스크립트 파일의 주인**을 돌려준다.
그래서 `seamanse` 로 찍혔지만 실제 웹서버 계정은 `http` 였다. 이것 때문에 엉뚱한 계정에
권한을 주느라 한 바퀴 돌았다. 권한 문제를 볼 때는 계정 이름을 믿지 말고
**`is_writable()` 결과와 실제 쓰기 테스트**로 판단하는 게 맞다.

**폴더 권한.** File Station → 폴더 우클릭 → 속성 → 권한 → 생성 에서 사용자 `http` 에
읽기+쓰기를 주고, **"이 폴더, 하위 폴더 및 파일에 적용"** 을 반드시 켜야 한다.
관리자 계정(seamanse 등)으로 규칙을 만들면 "관리자라 적용되지 않는다"는 안내가 뜨고 실제로 안 먹는다.

## 접속 잠금 (setup-auth.php)

백엔드가 Apache 2.4 라서 `.htaccess` 기본 인증을 쓴다. 앱 코드를 건드리지 않고
**정적 파일까지 한 번에** 막을 수 있는 게 결정적이었다. 앱 안에 로그인 화면을 만드는 쪽도
검토했지만, 그 경우 `data/*.json` 과 `photos/` 를 따로 가려야 해서
(`<?php exit; ?>` 접두사를 붙이거나 PHP 로 스트리밍) 코드가 훨씬 늘어난다.

`setup-auth.php` 가 하는 일은 `.htpasswd`(bcrypt) 와 `.htaccess` 를 쓰는 것뿐이고,
쓰고 나서 `http://127.0.0.1:<포트><경로>` 로 스스로 요청해 401 이 돌아오는지 확인한다
(`AllowOverride None` 이면 조용히 안 먹기 때문에 이 확인이 필요하다).

Apache 를 띄워 실제로 검증했다: 비로그인 401(메인·`data/*.json`·`api.php`·`assets`·`photos/`·`seed`),
`.htaccess`/`.htpasswd` 는 로그인해도 403, 올바른 자격증명이면 200,
틀린 비밀번호 401, 비밀번호 변경 후 옛 비밀번호 401, 입력 검증 실패 시 기존 잠금 유지,
잠금 상태에서 Playwright 로 회비 저장까지 정상 동작.

## 고칠 때 (앞으로 계속 수정할 예정)

브라우저가 옛 `assets/*.js` 를 들고 있으면 "고쳤는데 그대로"가 된다.
그래서 `index.html` 이 자산을 `?v=1` 로 불러온다. **자산을 고칠 때마다 이 번호를 올리고
`index.html` 도 같이 올려야 한다.** 번호만 바뀌면 브라우저가 새로 받는다.

나스에 올릴 때는 바뀐 파일만 덮어쓴다. `data/`, `photos/`, `receipts/` 는 **절대 덮어쓰지 않는다**
— 거기에 실제 기록이 들어 있다. `.htaccess` 와 `.htpasswd` 도 건드리지 않는다 (잠금이 풀린다).

## 남은 것 / 다음에 할 만한 것

- 회칙 초안의 경조사 금액이 `○○○,○○○원` placeholder 다. 실제 금액 확인 후 채워야 한다
- 학교명도 `○○초등학교` 로 비어 있다
- 지출 쪽은 정산 신청만 있다. 경조사 지출·모임 지출 장부를 넣으면 "현재 잔고"를 제대로 뽑을 수 있다
- 계정이 9명 공용 하나다. 누가 무엇을 고쳤는지는 남지 않는다.
  사람별로 끊고 싶으면 `.htpasswd` 에 줄을 9개 넣으면 되고, 설정 페이지를 그에 맞게 늘리면 된다
- DDNS 로 열려 있어 HTTP 다. Synology 인증서(Let's Encrypt)를 붙이면 HTTPS 로 올릴 수 있다
