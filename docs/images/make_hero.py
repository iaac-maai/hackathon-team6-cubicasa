"""Draws docs/images/hero.svg, the animation at the top of the README, from real data:
plan 1191 goes through the v3 network, the 5,000 plans light up on the map from the closest
to the farthest (the same shading as the app), then the five closest homes appear.

Run from the repository root with the server's environment:
  02_model_server/.venv/bin/python docs/images/make_hero.py
"""
import base64
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "02_model_server"))
from preprocessing import preprocess  # the same preparation as the server

APP = ROOT / "01_autoencoder" / "model_app"
PLAN = ROOT / "02_model_server" / "examples" / "plan_high_quality_architectural_1191.png"
OUT = Path(__file__).with_name("hero.svg")

ids = json.loads((APP / "collection_ids.json").read_text())
codes = np.load(APP / "collection_codes_v3.npy")
atlas = np.load(APP / "atlas_v3_xy.npy")
with np.load(ROOT / "02_model_server" / "collection_plans_128.npz") as c:
    plans = c["images"]
    assert c["ids"].tolist() == ids

session = ort.InferenceSession(str(APP / "floorplan_ae_v3.onnx"), providers=["CPUExecutionProvider"])
code, _ = session.run(None, {"image": preprocess(Image.open(PLAN), 128)})
distances = np.linalg.norm(codes - code[0], axis=1)
order = np.argsort(distances, kind="stable")
nearest = order[:5]
rank = np.empty(len(ids))
rank[order] = np.arange(len(ids)) / (len(ids) - 1)  # 0 = the closest plan, 1 = the farthest


def ramp(p):  # the app's colour scale (src/scale.ts)
    t = min(1, max(0, p)) ** 0.7
    near, far = (27, 38, 52), (222, 227, 233)
    return "#%02x%02x%02x" % tuple(round(a + (b - a) * t) for a, b in zip(near, far))


def shown(d):  # as the app shows a distance: the server rounds to 2 decimals, the page to 1, half up
    return f"{math.floor(round(float(d), 2) * 10 + 0.5) / 10:.1f}"


def png(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


# ---- layout --------------------------------------------------------------------------
W, H = 1200, 560
MAP_X, MAP_Y, MAP = 330, 64, 456
BUCKETS = 20
DUR = 12  # seconds for one loop
FONT = "font-family='Helvetica Neue, Helvetica, Arial, sans-serif'"
xy = np.column_stack([MAP_X + atlas[:, 0] * MAP, MAP_Y + (1 - atlas[:, 1]) * MAP])  # y upwards, as in the notebook

css = [
    ".fade{animation:fade %ds cubic-bezier(.16,1,.3,1) infinite}" % DUR,
    "@keyframes fade{0%{opacity:0}4%,93%{opacity:1}100%{opacity:0}}",
    ".plan{animation:plan %ds cubic-bezier(.16,1,.3,1) infinite}" % DUR,
    "@keyframes plan{0%,3%{opacity:0;transform:translateX(-40px)}10%,93%{opacity:1;transform:none}100%{opacity:0;transform:none}}",
]
dots = []
for b in reversed(range(BUCKETS)):  # pale first, so the closest plans end up on top
    members = np.where(np.minimum((rank * BUCKETS).astype(int), BUCKETS - 1) == b)[0]
    colour = ramp((b + 0.5) / BUCKETS)
    start = 14 + b * 26 / BUCKETS  # the wave: % of the loop at which this shade arrives
    css.append(".d%d{animation:d%d %ds ease-out infinite}" % (b, b, DUR))
    css.append("@keyframes d%d{0%%,%.1f%%{stroke:#dee3e9}%.1f%%,92%%{stroke:%s}99%%{stroke:#dee3e9}}" % (b, start, start + 3, colour))
    path = "".join("M%.1f %.1fh0" % (x, y) for x, y in xy[members])
    dots.append(f"<path class='d{b}' d='{path}' stroke='{colour}'/>")

you = xy[nearest].mean(axis=0)
rings = "".join(f"<circle cx='{x:.1f}' cy='{y:.1f}' r='7'/>" for x, y in xy[nearest])
css += [
    ".course{animation:course %ds cubic-bezier(.16,1,.3,1) infinite;transform-box:fill-box;transform-origin:center}" % DUR,
    "@keyframes course{0%,42%{opacity:0;transform:scale(.4)}47%,93%{opacity:1;transform:none}100%{opacity:0}}",
]

rows = []
for i, index in enumerate(nearest):
    y = 92 + i * 88
    thumb = png(Image.fromarray(255 - plans[index]))
    css.append(".r%d{animation:r%d %ds cubic-bezier(.16,1,.3,1) infinite}" % (i, i, DUR))
    css.append("@keyframes r%d{0%%,%d%%{opacity:0;transform:translateX(40px)}%d%%,93%%{opacity:1;transform:none}100%%{opacity:0;transform:none}}"
               % (i, 50 + 3 * i, 56 + 3 * i))
    rows.append(
        f"<g class='r{i}'><rect x='880' y='{y}' width='72' height='72' fill='#fff' stroke='#dde1e5'/>"
        f"<image href='{thumb}' x='880' y='{y}' width='72' height='72'/>"
        f"<text x='968' y='{y + 30}' fill='#c93b1b' font-size='22' font-weight='700'>{i + 1}</text>"
        f"<text x='992' y='{y + 30}' fill='#1b2129' font-size='15'>Plan {ids[index].split('/')[-1]}</text>"
        f"<text x='1160' y='{y + 30}' fill='#46505c' font-size='15' text-anchor='end'>{shown(distances[index])}</text>"
        f"<line x1='968' y1='{y + 44}' x2='1160' y2='{y + 44}' stroke='#dde1e5'/></g>"
    )

uploaded = Image.open(PLAN).convert("L")
uploaded.thumbnail((440, 440))
median = float(np.median(distances))
title = "Plan precedents: a floor plan in, the five closest homes out of 5,000"
desc = (f"Plan 1191 comes in. On the map of the 5,000 CubiCasa5K plans, as the v3 network arranges them, the plans light up "
        f"from the closest to the farthest. Rings mark the five matches and your plan sits at their middle. Then the five "
        f"closest homes appear with their distances: {', '.join(shown(distances[i]) for i in nearest)}; the median plan is at {median:.1f}.")

svg = f"""<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' width='{W}' height='{H}' role='img' aria-labelledby='t d' {FONT}>
<title id='t'>{title}</title><desc id='d'>{desc}</desc>
<style>{''.join(css)}@media (prefers-reduced-motion:reduce){{*{{animation:none!important}}}}</style>
<rect width='{W}' height='{H}' fill='#fff'/>
<g class='fade'>
<line x1='40' y1='40' x2='290' y2='40' stroke='#1b2129' stroke-width='2'/><text x='40' y='62' fill='#1b2129' font-size='17' font-weight='700'>Your plan</text>
<line x1='{MAP_X}' y1='40' x2='{MAP_X + MAP}' y2='40' stroke='#1b2129' stroke-width='2'/><text x='{MAP_X}' y='62' fill='#1b2129' font-size='17' font-weight='700'>Compared with all 5,000 plans</text>
<line x1='880' y1='40' x2='1160' y2='40' stroke='#1b2129' stroke-width='2'/><text x='880' y='62' fill='#1b2129' font-size='17' font-weight='700'>Five closest homes</text>
<text fill='#636c77' font-size='13'><tspan x='40' y='420'>Real data: the v3 network and plan 1191.</tspan><tspan x='40' y='438'>Darker dots are closer to it;</tspan><tspan x='40' y='456'>the median plan is at {median:.1f}.</tspan></text>
</g>
<g class='plan'><rect x='40' y='92' width='250' height='250' fill='#fff' stroke='#dde1e5'/><image href='{png(uploaded)}' x='45' y='97' width='240' height='240'/>
<text x='40' y='366' fill='#636c77' font-size='13'>plan 1191, as uploaded</text></g>
<g fill='none' stroke-linecap='round' stroke-width='3.2'>{''.join(dots)}</g>
<g class='course' fill='none' stroke='#c93b1b' stroke-width='2'>{rings}<path d='M{you[0] - 7:.1f} {you[1]:.1f}h14M{you[0]:.1f} {you[1] - 7:.1f}v14' stroke-width='2.6'/></g>
<g class='course'><text x='{you[0] + 12:.1f}' y='{you[1] - 10:.1f}' fill='#c93b1b' font-size='13' font-weight='700' stroke='#fff' stroke-width='3' paint-order='stroke'>Your plan</text></g>
{''.join(rows)}
</svg>
"""
OUT.write_text(svg)
print(OUT.name, f"{len(svg) / 1024:.0f} KB", [ids[i].split('/')[-1] for i in nearest], [shown(distances[i]) for i in nearest], round(median, 1))
