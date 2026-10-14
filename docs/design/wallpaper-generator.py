"""DHWS desktop wallpaper concepts, 3840x2160."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

HERE = os.path.dirname(__file__)
W, H = 3840, 2160
SS = 2  # supersample for smooth curves
DARK, LIGHT, BLUE = (69, 71, 74), (188, 189, 192), (74, 180, 240)
FONT = os.path.join(HERE, 'Michroma.ttf')
BADGE = '/Volumes/DH-DEV/Websites/DH-Website-New/public/wales-prestige-awards-2027-28-winner.jpg'
TAG = 'WEB DESIGN SERVICE OF THE YEAR'
SUB = 'WALES PRESTIGE AWARDS 2027/28'


def bez(p0, p1, p2, p3, n=48):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
                    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def rounded_br(x0, y0, x1, y1, r, n=24):
    """Rect with only the bottom-right corner rounded."""
    import math
    pts = [(x0, y0), (x1, y0), (x1, y1 - r)]
    for i in range(n + 1):
        a = i / n * math.pi / 2
        pts.append((x1 - r + r * math.cos(a), y1 - r + r * math.sin(a)))
    pts.append((x0, y1))
    return pts


def mark(size, dark=DARK, light=LIGHT):
    """The DH two-bar mark, drawn as vectors. Returns RGBA, width=size."""
    bw, bh, gap = 313, 107, 48
    s = size * SS / bw
    img = Image.new('RGBA', (int(bw * s) + 2, int((bh * 2 + gap) * s) + 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    S = lambda pts, oy=0: [(x * s, (y + oy) * s) for x, y in pts]
    # top bar
    d.polygon(S(rounded_br(100, 0, bw, bh, 40)), fill=light)
    d.polygon(S([(0, 0)] + bez((105, 0), (148, 0), (172, 55), (172, bh)) + [(0, bh)]), fill=dark)
    # bottom bar
    oy = bh + gap
    d.polygon(S(rounded_br(100, 0, bw, bh, 40), oy), fill=light)
    import math
    tl = [(44 - 44 * math.cos(i / 20 * math.pi / 2), 44 - 44 * math.sin(i / 20 * math.pi / 2)) for i in range(21)]
    d.polygon(S(tl + bez((172, 0), (172, 52), (148, bh), (105, bh)) + [(0, bh)], oy), fill=dark)
    return img.resize((img.width // SS, img.height // SS), Image.LANCZOS)


def text_w(d, txt, f, spacing):
    return sum(d.textlength(ch, font=f) for ch in txt) + spacing * (len(txt) - 1)


def draw_spaced(d, xy, txt, f, fill, spacing, anchor='l'):
    x, y = xy
    if anchor == 'm':
        x -= text_w(d, txt, f, spacing) / 2
    elif anchor == 'r':
        x -= text_w(d, txt, f, spacing)
    for ch in txt:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + spacing


def wordmark(d, cx, y, size, web=(0, 0, 0), anchor='m'):
    f = ImageFont.truetype(FONT, size)
    parts = [('DH', BLUE), ('WEB', web), ('SERVICES', BLUE)]
    sp = size * 0.08
    total = sum(text_w(d, p, f, sp) for p, _ in parts) + sp * 2
    x = cx - total / 2 if anchor == 'm' else cx
    for p, c in parts:
        draw_spaced(d, (x, y), p, f, c, sp)
        x += text_w(d, p, f, sp) + sp


def gradient(c0, c1, diag=True):
    g = Image.new('RGB', (W, H))
    px = g.load()
    small = Image.new('RGB', (384, 216))
    sp = small.load()
    for yy in range(216):
        for xx in range(384):
            t = (xx / 384 * 0.6 + yy / 216 * 0.4) if diag else yy / 216
            sp[xx, yy] = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    return small.resize((W, H), Image.BICUBIC)


# 1. Graphite: centred logo + award line, dark
def graphite():
    im = gradient((24, 25, 28), (12, 12, 14))
    m = mark(760)
    im.paste(m, ((W - m.width) // 2, 640), m)
    d = ImageDraw.Draw(im)
    wordmark(d, W / 2, 1320, 84, web=(235, 235, 240))
    f = ImageFont.truetype(FONT, 30)
    draw_spaced(d, (W / 2, 1530), TAG, f, (200, 200, 205), 10, 'm')
    draw_spaced(d, (W / 2, 1585), SUB, f, (232, 84, 30), 10, 'm')
    return im


# 2. Oversized mark bleeding off the right, tone-on-tone; desktop icons stay clear on the left
def oversize():
    im = gradient((30, 31, 34), (16, 16, 18))
    m = mark(2400, dark=(40, 41, 44), light=(50, 51, 55))
    im.paste(m, (W - 1450, (H - m.height) // 2), m)
    d = ImageDraw.Draw(im)
    right, base = W - 220, H - 560
    f = ImageFont.truetype(FONT, 50)
    wm_w = sum(text_w(d, p, f, 4) for p in ('DH', 'WEB', 'SERVICES')) + 8
    wordmark(d, right - wm_w, base, 50, web=(235, 235, 240), anchor='l')
    sm = mark(130)
    im.paste(sm, (int(right - wm_w - 170), base - 22), sm)
    f = ImageFont.truetype(FONT, 24)
    draw_spaced(d, (right, base + 100), TAG, f, (190, 190, 196), 7, 'r')
    draw_spaced(d, (right, base + 145), SUB, f, (232, 84, 30), 7, 'r')
    return im


# 3. Light: matches the website
def light():
    im = gradient((247, 247, 249), (229, 229, 233))
    m = mark(640)
    im.paste(m, ((W - m.width) // 2, 700), m)
    d = ImageDraw.Draw(im)
    wordmark(d, W / 2, 1290, 76, web=(29, 29, 31))
    f = ImageFont.truetype(FONT, 28)
    draw_spaced(d, (W / 2, 1480), TAG, f, (110, 110, 115), 9, 'm')
    draw_spaced(d, (W / 2, 1532), SUB, f, (214, 76, 26), 9, 'm')
    return im


# 4. Award: logo left, real Prestige badge right, divided by a blue rule
def award():
    im = gradient((22, 23, 26), (10, 10, 12))
    d = ImageDraw.Draw(im)
    m = mark(560)
    im.paste(m, (1000, 760), m)
    wordmark(d, 1000, 1290, 52, web=(235, 235, 240), anchor='l')
    d.rectangle((2160, 720, 2166, 1440), fill=BLUE)
    # badge on a white rounded card so its own white background reads as intentional
    b = Image.open(BADGE).convert('RGB')
    bh = 620
    b = b.resize((int(b.width * bh / b.height), bh), Image.LANCZOS)
    card = Image.new('RGBA', (b.width + 120, bh + 120), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle((0, 0, card.width - 1, card.height - 1), 48, fill=(255, 255, 255))
    card.paste(b, (60, 60))
    im.paste(card, (2340, (H - card.height) // 2 - 60), card)
    f = ImageFont.truetype(FONT, 26)
    draw_spaced(d, (2340 + card.width / 2, (H + card.height) // 2 - 10), TAG, f, (200, 200, 205), 8, 'm')
    return im


for name, fn in [('1-graphite', graphite), ('2-oversize', oversize), ('3-light', light), ('4-award', award)]:
    img = fn()
    img.save(os.path.join(HERE, f'{name}.png'), optimize=True)
    img.resize((1280, 720), Image.LANCZOS).save(os.path.join(HERE, f'{name}-preview.jpg'), quality=88)
    print(name)
