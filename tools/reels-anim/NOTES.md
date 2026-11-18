# B안 — anim-reel 릴스

> A안(자체 템플릿) 규칙은 `../reels/NOTES.md` 에 있다. **서로 덮지 않는다.**
> 비교 방법은 `../../docs/reel-ab-test.md`.

## 결론 — 2026-11-18 확인

**이 컨테이너에서 끝까지 돌아간다.** 대본 → AI 목소리 → 장면 → MP4 까지 전부.
실제로 60.2초 영상 하나를 뽑아 확인했다 (1080×1920 · 30fps · H.264 + AAC).

렌더 시간은 **1분 영상에 약 2분**. 소프트웨어 GPU 라 느리지만 쓸 만하다.

## 소스는 저장소에 두지 않는다

`anim-reel` 은 남이 만든 스킬이고 **LICENSE 파일이 없다.**
`jey-tools` 는 공개 저장소라 그대로 커밋하면 안 된다.

→ 규칙 묶음은 **구글 드라이브 `10분 키즈뉴스/anim-reel-rules.zip`** 에 두었다 (338KB).
원본은 맥의 `~/.claude/skills/anim-reel`.

## 여기서 돌리는 법

1. 드라이브에서 `anim-reel-rules.zip` 을 받아 빈 폴더에 푼다.
2. `node tools/reel.mjs doctor --fix` — HyperFrames 렌더러와 렌더용 Chrome 을 받는다 (1분).
3. 아래 두 가지를 손본 뒤에 쓴다. **안 하면 조용히 실패한다.**

### 고쳐야 하는 것 두 가지

이 컨테이너는 바깥 통신이 전부 HTTPS 프록시를 거친다. anim-reel 은 그걸 모른다.

**① 파이썬 쪽 — AI 목소리 (`tools/tts.py`)**
`edge_tts.Communicate` 가 환경변수를 안 읽어서 `speech.platform.bing.com` 에
DNS 단계부터 실패한다. `synth()` 에서 프록시를 넘겨 줘야 한다.

```python
proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or None
kw = {"proxy": proxy} if proxy else {}
com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch,
                           boundary="WordBoundary", **kw)
```

맥에서는 `HTTPS_PROXY` 가 비어 있어 영향이 없다.

**② Node 쪽 — 폰트·효과음 받기**
Node 22 의 `fetch` 는 기본적으로 프록시를 무시한다. 환경변수 하나로 해결된다.

```
NODE_USE_ENV_PROXY=1 node tools/fetch_assets.mjs "<릴스 폴더>"
```

`build` · `render` 에도 똑같이 붙인다.

### 열어 둔 네트워크 호스트 (2026-11-18 추가)

| 호스트 | 쓰임 |
|---|---|
| `speech.platform.bing.com` | AI 목소리 (edge-tts) |
| `assets.mixkit.co` | 효과음 37개 |
| `cdn.jsdelivr.net` | Pretendard 폰트 |

`fonts.googleapis.com` · `fonts.gstatic.com` 은 전부터 열려 있었다.

### 아직 안 깐 것

받아쓰기 엔진(whisper, 0.6~1.6GB)은 **내 녹음·내 영상을 넣을 때만** 필요하다.
AI 목소리만 쓰면 없어도 된다. 필요해지면 `doctor --fix --whisper`.

## A안과 무엇이 다른가 — 같은 물건이 아니다

| | A안 (자체) | B안 (anim-reel) |
|---|---|---|
| 길이 | **20초** | **60초** (기본 30~45초, 예제는 60초) |
| 소리 | 없음. 인스타에서 음원 얹음 | **AI 내레이션 + 효과음** 내장 |
| 화면 | 사진/그래픽 + 큰 자막 | 종이 질감 + 키네틱 자막 + UI 목업 |
| 만드는 법 | 원고 JSON → 5개 자동 생성 | 주제 한 줄 → 대본부터 새로 |
| 렌더 | 20초에 약 40초 | 60초에 약 2분 |

**둘은 성격이 다르다.** A안은 소리 없이 넘기며 보는 짧은 정보 카드고,
B안은 목소리로 끌고 가는 설명 영상이다. 어느 쪽이 7세~초4 학부모에게 먹히는지는
숫자로만 알 수 있다.

## 먼저 확인한 문제 하나

**렌더 결과의 프레임 0 이 비어 있다** (종이 질감만, 글자 없음).
A안에서 방금 고친 것과 똑같은 문제다. 인스타 자동 썸네일이 백지로 잡힌다.

→ B안을 실제로 올릴 거면 첫 장면이 t=0 부터 보이게 고치거나,
커버 이미지를 따로 만들어 올려야 한다.

## 쓸 때 주의

- 예제 대본은 **anim-reel 자신을 홍보하는 내용**이다. `timing.json` 의
  `sentences` 와 `sfx` 를 전부 우리 대본으로 갈아야 한다. 그대로 두면 안 된다.
- 예제 대본의 마무리가 "댓글에 OO 남기시면 보내드릴게요" 식이다.
  우리 퍼널은 **프로필 링크 → 랜딩 → 이메일** 이므로 그대로 쓰지 않는다.
- AI 목소리를 쓰면 인스타 업로드 때 **"AI 정보" 라벨**을 켜는 게 안전하다.
- 대본을 고치면 반드시 `voice` 를 다시 돌린다. 안 그러면 자막과 소리가 어긋난다.
