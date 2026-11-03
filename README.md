# jey-tools

일상에 필요한 도구들을 만들고 보관하는 저장소.

## 폴더 구조

```
tools/          HTML 도구 (브라우저에서 바로 열림, 설치 불필요)
apps/           실행파일로 만들 파이썬 앱 (앱 하나당 폴더 하나)
.github/workflows/  윈도우/맥 실행파일 자동 빌드
```

## HTML 도구 쓰는 법

`tools/` 안의 `.html` 파일을 더블클릭하면 브라우저에서 바로 열립니다.
GitHub Pages를 켜면 폰에서도 주소로 접속 가능합니다.
(Settings → Pages → Source: `main` / root)

주소 형식: `https://seamanse21.github.io/jey-tools/tools/파일이름.html`

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

## 새 앱 추가하는 법

`apps/앱이름/main.py` 로 파일을 만들면 끝입니다.
추가 라이브러리가 필요하면 `apps/앱이름/requirements.txt` 에 적어두세요.
