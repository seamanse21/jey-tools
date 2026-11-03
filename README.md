# jey-tools

일상에 필요한 도구들을 만들고 보관하는 저장소.

**도구 바로 쓰기 → https://seamanse21.github.io/jey-tools/tools/**
(폰 브라우저에서 열고 "홈 화면에 추가" 하면 앱처럼 쓸 수 있음)

## 폴더 구조

```
tools/          HTML 도구 (브라우저에서 바로 열림, 설치 불필요)
apps/           실행파일로 만들 파이썬 앱 (앱 하나당 폴더 하나)
.github/workflows/  윈도우/맥 실행파일 자동 빌드
```

## 이 저장소의 규칙 (공개 저장소)

이 저장소는 **공개**다. 커밋한 것은 전부 인터넷에 남고, 나중에 지워도 완전히 사라지지 않는다.

**올려도 되는 것** — 남이 봐도 상관없는 도구 코드.

**절대 올리면 안 되는 것**
- API 토큰, 비밀번호, 인증키 (카카오톡·증권사·메일 등)
- 업무 자료, 개인 기록, 실제 개인정보
- 위 항목이 들어간 설정 파일

토큰이 필요한 자동화는 **별도 비공개 저장소**에 두고, 값은 GitHub Secrets로 넘긴다.
(예: 팟캐스트 봇 → `seamanse21/podcast-automation`)

실수로 올렸다면: 그 토큰을 **먼저 발급처에서 폐기**한 뒤 커밋을 정리한다. 순서를 바꾸면 의미가 없다.

## HTML 도구 쓰는 법

GitHub Pages가 켜져 있어서 `main`에 push하면 1~2분 뒤 자동 반영된다.

- 도구 목록: https://seamanse21.github.io/jey-tools/tools/
- 개별 도구: `https://seamanse21.github.io/jey-tools/tools/파일이름.html`

인터넷이 없을 때는 `tools/` 안의 `.html` 파일을 더블클릭해도 똑같이 동작한다.
(도구는 외부 라이브러리 없이 파일 하나로 완결되게 만든다)

## 실행파일(.exe / .app) 만드는 법

1. GitHub 레포 → **Actions** 탭 클릭
2. 왼쪽에서 **Build desktop app** 선택
3. **Run workflow** 버튼 클릭
4. `app` 칸에 앱 폴더 이름 입력 (예: `sample-timer`)
5. 녹색 체크가 뜨면 그 실행 기록을 열고 아래 **Artifacts**에서 다운로드
   - `sample-timer-windows` → 압축 풀면 `.exe`
   - `sample-timer-macos` → 압축 풀면 `.app`

맥에서 처음 실행할 때 "확인되지 않은 개발자" 경고가 나오면
앱 아이콘 우클릭 → **열기** → **열기** 를 누르면 됩니다.

## 새 HTML 도구 추가하는 법

1. `tools/도구이름.html` 파일을 만든다
2. `tools/index.html` 의 해당 카테고리 `<ul>` 안에 카드 한 줄을 추가한다
3. push하면 끝. 1~2분 뒤 위 주소에서 보인다

### 카테고리

목록 페이지는 두 묶음으로 나뉜다. 파일은 `tools/` 에 평평하게 두고 분류는 `index.html` 에서만 한다.

- **일상 도구** — 생활·업무에 쓰는 것
- **With HwiMin** — 휘민이와 같이 쓰는 학습용

도구가 많아지면 `tools/daily/`, `tools/hwimin/` 처럼 폴더로 나눈다.
단, 그때 기존 주소가 바뀌므로 북마크·홈화면 바로가기를 다시 잡아야 한다.

## 새 앱 추가하는 법

`apps/앱이름/main.py` 로 파일을 만들면 끝입니다.
추가 라이브러리가 필요하면 `apps/앱이름/requirements.txt` 에 적어두세요.
