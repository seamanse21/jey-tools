#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""이미지 모델이 뱉은 캐릭터 그림을 릴스에 넣을 수 있는 PNG 로 바꾼다.

  python3 import-poses.py            # _raw/ 전부
  python3 import-poses.py kid        # 아이만

## 넣는 곳 → 나오는 곳
    brand/poses/_raw/kid/ask.png   →   brand/poses/kid/ask.png   (800×1800 투명)
    brand/poses/_raw/mom/think.png →   brand/poses/mom/think.png

파일 이름이 곧 포즈 이름이다. `neutral` 은 **반드시 있어야 한다** — 배율 기준이다.

## 하는 일 세 가지

**1. 배경을 뗀다.** 테두리에서 흘려보내며 지우므로 **눈 흰자·이빨 같은 안쪽 흰색은 살아남는다.**
   - 모델이 「투명 배경」을 시키면 **투명 체크무늬를 그림으로 그려 버리는 일이 잦다.**
     2026-11-26 에 실제로 그랬다(알파 채널이 아예 없고 회색 109/190 이 픽셀로 구워져 나왔다).
   - 그래서 회색 체크무늬 · 흰색 · 마젠타 · 연두를 전부 배경으로 본다. **배경은 신경 쓰지 말고 뽑으면 된다.**

**2. 포즈마다 크기가 튀지 않게 맞춘다.**
   포즈별 bbox 높이로 맞추면 **팔을 든 포즈만 작아진다**(bbox 가 커지니까).
   그래서 **`neutral` 한 장에서 배율을 정하고 나머지에 그대로 쓴다.**

**3. 발바닥을 같은 높이에 앉힌다.** 안 그러면 포즈가 바뀔 때 캐릭터가 위아래로 튄다.

## 엄마와 아이의 키 차이
둘은 **각자의 `neutral` 로 배율을 잡되, 그 배율은 공유한다.** 엄마를 기준으로 맞추므로
아이가 상대적으로 작게 들어간다. 키 비율이 깨지면 릴스에서 둘이 또래로 보인다.
"""
import sys, pathlib
from collections import deque
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
RAW, OUT = HERE / "poses/_raw", HERE / "poses"
CW, CH, FLOOR, HEADROOM = 800, 1800, 60, 60      # 캔버스 · 바닥 여백 · 위 여백


def is_bg(p):
    r, g, b = p[:3]
    if abs(r - g) <= 14 and abs(g - b) <= 14 and 85 <= r <= 255:
        return True                                   # 회색 체크무늬 · 흰색
    if r > 200 and g < 80 and b > 200: return True    # 마젠타
    if r < 80 and g > 200 and b < 80:  return True    # 연두
    return False


def cut(path):
    """테두리에서 흘려보내며 배경을 지우고, 남은 그림만 잘라 돌려준다."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    def push(x, y):
        if not seen[y * w + x] and is_bg(px[x, y]):
            seen[y * w + x] = 1; q.append((x, y))
    for x in range(w): push(x, 0); push(x, h - 1)
    for y in range(h): push(0, y); push(w - 1, y)
    while q:
        x, y = q.popleft(); px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h: push(nx, ny)
    bb = im.getbbox()
    return im.crop(bb) if bb else None


# ── 크기 기준 ────────────────────────────────────────────────
# 캔버스 안에서 **서 있는 키**가 이만큼이면 맞다. 엄마 1501, 아이는 그 75%.
TARGET_H = {"mom": 1501, "kid": 1123}

# 팔이 머리 위로 올라가는 포즈만 따로 — 이것들은 bbox 높이가 키가 아니다
ARMS_UP = {"kid": {"ask"}, "mom": {"pointup", "one"}}

# 팔 든 포즈용 보조 기준: 발목선 폭 (위 키 목표에서 역산한 값)
TARGET_ANKLE = {"mom": 197, "kid": 224}


def ankle_width(img):
    """발목선 폭. 포즈가 바뀌어도 다리는 그대로다."""
    px, (w, h) = img.load(), img.size
    y = h - max(1, round(h * 0.06))
    xs = [x for x in range(w) if px[x, y][3] > 0]
    return (max(xs) - min(xs)) if xs else 0


def scale_for(who, name, img):
    """포즈마다 어느 기준으로 줄일지 고른다.

    **팔이 머리 위로 안 가는 포즈**(대부분)는 bbox 높이가 곧 키다 → 높이로 맞춘다.
    **팔 든 포즈**는 bbox 가 손끝까지라 높이를 못 쓴다 → 발목 폭으로 맞춘다.

    처음엔 전부 발목 폭으로 했는데, **다른 계정에서 뽑은 배치는 다리 굵기 비율이 달라**
    키가 5~7% 작게 나왔다 (2026-11-26, hold·compare). 그래서 높이를 1순위로 올렸다.
    """
    if name in ARMS_UP.get(who, ()):
        aw = ankle_width(img)
        return (TARGET_ANKLE[who] / aw, f"발목 {aw}") if aw >= 8 else (None, "발목을 못 잼")
    return TARGET_H[who] / img.height, f"키 {img.height}"


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    whos = [d.name for d in sorted(RAW.iterdir()) if d.is_dir() and d.name in TARGET_H] if RAW.exists() else []
    if only: whos = [w for w in whos if w == only]
    if not whos:
        sys.exit(f"{RAW} 아래에 kid/ · mom/ 폴더를 만들고 그림을 넣으세요.")

    for who in whos:
        (OUT / who).mkdir(parents=True, exist_ok=True)
        print(f"\n[{who}]  목표 키 {TARGET_H[who]}px")
        for f in sorted((RAW / who).iterdir()):
            if f.suffix.lower() not in (".png", ".webp", ".jpg", ".jpeg"): continue
            img = cut(f)
            if not img: print(f"  {f.stem:10s} ⚠ 그림을 못 찾음"); continue
            sc, how = scale_for(who, f.stem, img)
            if not sc: print(f"  {f.stem:10s} ⚠ {how}"); continue
            r = img.resize((max(1, round(img.width*sc)), max(1, round(img.height*sc))), Image.LANCZOS)
            if r.height > CH - FLOOR:
                print(f"  {f.stem:10s} ⚠ {r.height}px — 캔버스({CH-FLOOR})를 넘음")
            cv = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
            cv.paste(r, ((CW - r.width)//2, CH - FLOOR - r.height), r)
            cv.save(OUT / who / f"{f.stem}.png")
            print(f"  {f.stem:10s} {how:9s} → ×{sc:.3f}  {r.width}×{r.height}")


if __name__ == "__main__":
    main()
