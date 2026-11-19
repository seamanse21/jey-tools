#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""발행기가 autoFit 으로 정하는 본문 글자 크기를 호별로 재서 기준 안인지 본다.

  python3 tools/measure-fs.py 2026-12-07 2026-12-14
  python3 tools/measure-fs.py --all

기준은 docs/kids-paper-strategy.md §3 의 본문 10.5~11pt.
autoFit 은 넘치지 않는 선에서 가장 큰 크기를 고르므로
**글자가 많을수록 폰트가 작아진다.** 폰트가 크게 나오면 본문이 모자란 것이고,
작게 나오면 본문이 넘치는 것이다. nums 줄을 늘려도 폰트는 작아진다.
"""
import json, pathlib, re, subprocess, sys

TOOLS = pathlib.Path(__file__).resolve().parent
LO, HI = 10.5, 11.0
BOOT = """
<script>
(function(){
  const ISSUE = __DATA__;
  function go(){
    applyIssue(ISSUE); showAll = true; applyVisibility(); autoFit();
    document.title = "FS:" + S.days.map(d => d.fs).join(",");
  }
  if (document.readyState === 'complete') setTimeout(go, 400);
  else window.addEventListener('load', () => setTimeout(go, 400));
})();
</script>
"""


def chrome():
    root = pathlib.Path.home() / ".cache/hyperframes/chrome"
    for p in root.rglob("chrome-headless-shell"):
        if p.is_file():
            return p
    sys.exit("렌더용 Chrome 을 못 찾았어요. anim-reel doctor --fix 를 먼저 돌리세요.")


def measure(week, exe):
    src = TOOLS / "issues" / f"{week}.json"
    if not src.exists():
        print(f"{week}: 원고가 없어요"); return []
    data = json.loads(src.read_text(encoding="utf-8"))
    html = (TOOLS / "kids-weekly.html").read_text(encoding="utf-8")
    html = html.replace("</body>", BOOT.replace("__DATA__", json.dumps(data, ensure_ascii=False)) + "</body>")
    tmp = TOOLS / f"_measure_{week}.html"
    tmp.write_text(html, encoding="utf-8")
    try:
        out = subprocess.run([str(exe), "--headless", "--disable-gpu", "--no-sandbox",
                              "--virtual-time-budget=9000", "--dump-dom", tmp.as_uri()],
                             capture_output=True, text=True, timeout=180).stdout
    finally:
        tmp.unlink(missing_ok=True)
    m = re.search(r"<title>FS:([0-9.,]+)</title>", out)
    if not m:
        print(f"{week}: 측정 실패"); return []
    sizes = [float(x) for x in m.group(1).split(",")]
    rows, bad = [], 0
    print(week)
    for d, fs in zip(data["days"], sizes):
        n = len(d["body"].replace("\n", "").replace("*", ""))
        if fs > HI:
            tag, hint = "크다", "본문을 늘리세요"
        elif fs < LO:
            tag, hint = "작다", "본문을 줄이세요"
        else:
            tag, hint = "OK", ""
        if tag != "OK":
            bad += 1
        print(f"   {d['head'][:18]:<20} {n:>4}자  {fs:>5}pt  {tag:<3} {hint}")
        rows.append((d["head"], n, fs, tag))
    print(f"   → 기준({LO}~{HI}pt) 벗어난 기사 {bad}개")
    return rows


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "--all":
        args = sorted(p.stem for p in (TOOLS / "issues").glob("20*.json"))
    exe = chrome()
    for w in args:
        measure(w, exe)
