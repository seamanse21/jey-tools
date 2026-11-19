# 10분 키즈뉴스 (받는 쪽) — kids-issue.html

## 무엇
발행한 주차별 호를 **PDF로 내려받는 페이지**. 만드는 도구가 아니라 받는 도구다.

목록(`tools/index.html`) 자리는 두 번 바뀌었다.

| 때 | 어떻게 |
|---|---|
| 2026-11-18 | 목록에는 이 페이지만 두고 만드는 도구 두 개(`kids-cards.html` 카드뉴스, `kids-weekly.html` 발행기)를 뺐다 |
| 2026-11-19 | **`10minkids` 분류를 만들고 세 개를 모두 넣었다.** Jey 요청 |

그 사이에도 **두 도구는 파일을 지우지 않았다** — 주소로 직접 들어가면 쓸 수 있었고,
특히 발행기는 PDF 를 뽑을 때 쓰므로 지우면 안 된다.
같은 날 `kids-news.html` 하루한장 키즈신문은 **파일까지 지웠다.** 되살리려면
`git log --diff-filter=D -- tools/kids-news.html` 로 지운 커밋을 찾아 복원한다.

## 동작
- `tools/issues/index.json` 을 읽어 호 목록을 그린다
- PDF 경로는 **`./issues/pdf/<week>.pdf` 로 규칙으로 만든다.** `index.json` 에 적지 않는다 —
  그 파일은 발행 쪽 작업으로 다시 만들어질 수 있어서, 거기 적어 두면 날아간다
- 그 주소로 `HEAD` 를 때려 보고 있으면 내려받기 버튼, 없으면
  "아직 PDF 가 없습니다" + 발행기 링크
- `Content-Length` 로 용량을 같이 보여 준다
- `download` 속성으로 `10분키즈뉴스_제1호_2026-11-23.pdf` 로 저장되게 한다

## 새 호 PDF 만드는 법
발행기 화면에서 **🖨 전체 인쇄 / PDF** → "PDF로 저장" 해도 되고,
세션에서 뽑으려면 로컬 서버를 띄우고 헤드리스로 찍는다.

```
python3 -m http.server 8899        # 저장소 루트에서
```

```
node mkpdf.js <주차파일.json> <나갈 경로.pdf>
```

`mkpdf.js` 가 하는 일 — `kids-weekly.html` 을 열고,
`fetch('./issues/<file>')` 로 원고를 받아 페이지 안의 `applyIssue(o)` 를 부른 뒤,
`.page.skip` 을 전부 걷고 `page.pdf({format:'A4', printBackground:true, margin:0})`.

- **`applyIssue` 가 전역에 노출되어 있어서 가능한 방식**이다. 발행기를 고칠 때 이 함수
  이름을 바꾸면 PDF 만들기가 조용히 깨진다
- 원고 적용 뒤 **4초쯤 기다려야** 한다. 레이아웃이 비동기로 흘러서 바로 찍으면 빈 칸이 남는다
- 2026-11-23 제1호 기준 **14쪽 / 4.0MB**
  (표지, 보호자 안내, 5일×2장, 주말 한 번 더, 한 주 어휘 모아보기)
  발행기 설명문에는 12쪽이라고 적혀 있는데 실제로는 14쪽이다

## 파일
- `tools/issues/index.json` — 호 목록 (발행 쪽에서 관리)
- `tools/issues/<week>.json` — 주차 원고
- `tools/issues/pdf/<week>.pdf` — 이 페이지가 찾는 곳
