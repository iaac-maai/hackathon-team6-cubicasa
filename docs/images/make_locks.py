# Draws docs/images/locks.svg: the three locks of the app in order, then your own searches.
# A vermilion dot runs along the four rules and inks each step as it passes. Run: python make_locks.py
# Without motion (prefers-reduced-motion) the drawing is simply the finished state.

INK, INK2, INK3, RULE, WELL, RED = "#1b2129", "#46505c", "#636c77", "#dde1e5", "#f4f5f6", "#c93b1b"
LOOP = 11  # seconds
X0, STEP, W = 40, 290, 250  # left of the first step, distance between steps, width of a step

steps = [
    ("Team password", "from the course hand-in"),
    ("Your account", "email and password, or Google"),
    ("The terms", "they open when you sign up"),
    ("Your searches", "only you see them"),
]
# when the dot starts and ends each rule, in % of the loop
runs = [(4, 13), (17, 26), (30, 39), (43, 52)]

css, body = [], []


def rule(name, keyframes, selector_css=""):
    css.append(f".{name}{{animation:{name} {LOOP}s cubic-bezier(.65,0,.35,1) infinite{selector_css}}}@keyframes {name}{{{keyframes}}}")


body.append(f"<rect width='1200' height='250' fill='#fff'/>")
for i, ((title, line), (a, b)) in enumerate(zip(steps, runs)):
    x = X0 + i * STEP
    # the grey rule, and the ink rule drawn over it as the dot runs
    body.append(f"<line x1='{x}' y1='36' x2='{x + W}' y2='36' stroke='{RULE}' stroke-width='2'/>")
    rule(f"ink{i}", f"0%,{a}%{{stroke-dashoffset:1;opacity:1}}{b}%,93%{{stroke-dashoffset:0;opacity:1}}98%,100%{{stroke-dashoffset:0;opacity:0}}")
    body.append(f"<line class='ink{i}' pathLength='1' stroke-dasharray='1' x1='{x}' y1='36' x2='{x + W}' y2='36' stroke='{INK}' stroke-width='3'/>")
    # number, title and line; the title turns from grey to ink when the dot arrives
    body.append(f"<text x='{x}' y='70' font-size='15' fill='{INK3}' letter-spacing='1'>0{i + 1}</text>")
    rule(f"t{i}", f"0%,{a}%{{fill:#b9c0c7}}{a + 3}%,93%{{fill:{INK}}}99%,100%{{fill:#b9c0c7}}")
    body.append(f"<text class='t{i}' x='{x}' y='108' font-size='31' font-weight='700' fill='{INK}' letter-spacing='-0.5'>{title}</text>")
    body.append(f"<text x='{x}' y='138' font-size='19' fill='{INK2}'>{line}</text>")


def appear(name, start, extra=""):
    rule(name, f"0%,{start}%{{opacity:0;transform:translateY(6px)}}{start + 3}%,93%{{opacity:1;transform:none}}98%,100%{{opacity:0;transform:none}}", extra)


# 1, the password field fills with dots one by one
x = X0
body.append(f"<rect x='{x}' y='166' width='{W}' height='46' fill='none' stroke='{INK3}' stroke-width='1.5'/>")
for j in range(8):
    start = 5 + j * 0.9
    rule(f"p{j}", f"0%,{start:.1f}%{{opacity:0}}{start + 0.4:.1f}%,93%{{opacity:1}}98%,100%{{opacity:0}}")
    body.append(f"<circle class='p{j}' cx='{x + 22 + j * 20}' cy='189' r='5' fill='{INK}'/>")

# 2, two ways in
x = X0 + STEP
for k, (label, dx, w) in enumerate([("Email", 0, 104), ("Google", 118, 132)]):
    appear(f"a{k}", 19 + k * 3)
    body.append(f"<g class='a{k}'><rect x='{x + dx}' y='166' width='{w}' height='46' fill='{WELL if k else '#fff'}' stroke='{INK}' stroke-width='1.5'/>"
                f"<text x='{x + dx + w / 2}' y='195' font-size='18' font-weight='600' fill='{INK}' text-anchor='middle'>{label}</text></g>")

# 3, the box gets ticked
x = X0 + 2 * STEP
body.append(f"<rect x='{x}' y='172' width='32' height='32' fill='#fff' stroke='{INK}' stroke-width='2'/>")
rule("tick", f"0%,34%{{stroke-dashoffset:1}}38%,93%{{stroke-dashoffset:0}}98%,100%{{stroke-dashoffset:1}}")
body.append(f"<path class='tick' pathLength='1' stroke-dasharray='1' d='M{x + 7} {189} l7 7 l12 -14' fill='none' stroke='{RED}' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/>")
body.append(f"<text x='{x + 46}' y='195' font-size='18' fill='{INK}'>I agree</text>")

# 4, your saved searches: the logo of the app, then two more rows
x = X0 + 3 * STEP
for k in range(3):
    appear(f"s{k}", 53 + k * 3)
    y = 160 + k * 28
    if k == 0:
        thumb = (f"<rect x='{x}' y='{y}' width='22' height='22' fill='#fff' stroke='{INK}' stroke-width='2'/>"
                 f"<rect x='{x + 1}' y='{y + 1}' width='11' height='9' fill='#4477aa'/><rect x='{x + 1}' y='{y + 10}' width='11' height='11' fill='#ccbb44'/>"
                 f"<rect x='{x + 12}' y='{y + 1}' width='9' height='20' fill='#ee6677'/>")
    else:
        thumb = f"<rect x='{x}' y='{y}' width='22' height='22' fill='{WELL}' stroke='{INK3}' stroke-width='1'/>"
    body.append(f"<g class='s{k}'>{thumb}<line x1='{x + 34}' y1='{y + 11}' x2='{x + 34 + (190 - k * 40)}' y2='{y + 11}' stroke='{RULE if k else INK2}' stroke-width='6' stroke-linecap='round'/></g>")

# the dot: it sits at the end of the last rule, and the loop brings it there from the first one
moves = []
for i, (a, b) in enumerate(runs):
    start = X0 + i * STEP - (X0 + 3 * STEP + W)
    moves.append(f"{a}%{{transform:translateX({start}px)}}{b}%{{transform:translateX({start + W}px)}}")
rule("dot", "0%{transform:translateX(-1120px);opacity:0}3%{opacity:1}" + "".join(moves) + "93%{transform:none;opacity:1}98%,100%{transform:none;opacity:0}")
body.append(f"<circle class='dot' cx='{X0 + 3 * STEP + W}' cy='36' r='8' fill='{RED}'/>")

desc = ("Four steps along a line. 01 Team password, from the course hand-in: a field fills with dots. "
        "02 Your account, email and password, or Google. 03 The terms, which open when you sign up: a box gets ticked, I agree. "
        "04 Your searches: only you see them.")
svg = f"""<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 250' width='1200' height='250' role='img' aria-labelledby='t d' font-family='Helvetica Neue, Helvetica, Arial, sans-serif'>
<title id='t'>How you get in: three locks, then your own searches</title><desc id='d'>{desc}</desc>
<style>{''.join(css)}@media (prefers-reduced-motion:reduce){{*{{animation:none!important}}}}</style>
{chr(10).join(body)}
</svg>
"""
open("locks.svg", "w").write(svg)
print("locks.svg", len(svg), "bytes")
