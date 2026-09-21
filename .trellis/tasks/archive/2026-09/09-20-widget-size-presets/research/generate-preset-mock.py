#!/usr/bin/env python3
"""生成「预设形态」纸面小样（before / after 对照）——规划用，不是设备截图。

它按 design.md 的公式**算出**每个预设目标尺寸上的度量，再画出来：
- 同一份算法既是小样、又是「到底装不装得下」的验算（`--check` 会打印占比表）；
- 行高系数取**实测标定值**（见文件底部 CALIBRATION 注释），不是手感数字。

用法：
    python3 .trellis/tasks/09-20-widget-size-presets/research/generate-preset-mock.py [输出目录]
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- 字体与画布

REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

PX_PER_DP = 2  # 纸面 2 倍密度，便于观察

COLORS = {
    "card": (22, 24, 29),
    "surface": (44, 44, 49),
    "accent": (96, 165, 250),
    "primary": (238, 240, 244),
    "secondary": (176, 182, 192),
    "muted": (128, 134, 146),
    "guide": (232, 90, 90),
}


def font(path: str, size_dp: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, max(1, int(round(size_dp * PX_PER_DP))))


# ---------------------------------------------------------------- 度量模型（镜像 Java）

# 参考格子 = 2×2（能放下的最小格），而不是原来的手机 4×3。
# 这样「格子越大字号越大」是**默认事实**：2×2 = 1.0，手机 4×3 ≈ 1.53，平板 4×3 = 顶到上限 2.0。
W_REF, H_REF = 179.0, 210.0
MIN_SCALE, MAX_SCALE = 1.0, 2.0
# 实测标定：平板 4×3 上四行课表的行距 51px(280dpi)=29.1dp，减去行距 5dp → 17sp 字号行盒 24.1dp
LINE_FACTOR = 1.42
LINE_FACTOR_SAFETY = 1.05
DP_STEP, SP_STEP = 1.0, 0.5
MAX_EXTRA_PER_GAP_DP = 8.0          # 每份余量上限（design D2.2）
FONT_BOOST_CAP = 2.0                # 字号上限 = 既有的全局 maxScale（尺寸越大字号越大）
DUAL_MIN_WIDTH_DP, DUAL_MIN_ASPECT = 320.0, 1.25
DUAL_HEADER_SHARE, DUAL_HEADER_MIN, DUAL_HEADER_MAX = 0.36, 220.0, 360.0

BASE = dict(title_sp=16.0, body_sp=13.0, caption_sp=11.0, pad_h=14.0, pad_v=12.0,
            radius=20.0, gap_first=6.0, gap=4.0, hero_gap=6.0, time_col=44.0,
            marker_col=12.0, style_pad=8.0, sections_col=64.0, hero_inner_pad=14.0,
            dual_gap=12.0)


def snap(v: float, step: float) -> float:
    return round(v / step) * step


@dataclass
class Metrics:
    w: float
    h: float
    scale: float
    pad_scale: float
    dual: bool
    boost: float = 1.0

    def sp(self, base: float) -> float:
        return snap(base * self.scale * self.boost, SP_STEP)

    def dp(self, base: float) -> float:
        """随内边距尺度缩放的量（内边距、行距、圆角…）。"""
        return snap(base * self.pad_scale, DP_STEP)

    def dp_scale(self, base: float) -> float:
        """随字号尺度缩放的量（列宽）。"""
        return snap(base * self.scale, DP_STEP)

    def line_box(self, sp: float) -> float:
        return sp * LINE_FACTOR * LINE_FACTOR_SAFETY

    def dual_header_w(self) -> float:
        content = max(0.0, self.w - 2 * self.dp(BASE["pad_h"]))
        return snap(min(max(content * DUAL_HEADER_SHARE, DUAL_HEADER_MIN), DUAL_HEADER_MAX), DP_STEP)


def resolve(w: float, h: float, boost: float = 1.0) -> Metrics:
    scale = min(max(min(w / W_REF, h / H_REF), MIN_SCALE), MAX_SCALE)
    pad_scale = scale ** 0.5
    dual = w >= DUAL_MIN_WIDTH_DP and w >= h * DUAL_MIN_ASPECT
    return Metrics(w, h, scale, pad_scale, dual, boost)


# ---------------------------------------------------------------- 内容模型

@dataclass
class Line:
    kind: str                      # hero | summary | course | mid
    texts: list[tuple[str, str, str]] = field(default_factory=list)  # (role, text, color)
    # 行盒估算用的字号组：hero 是**三行纵向堆叠**（标签/课名/时间教室），course 是**一行横向**，
    # 所以这里必须是「纵向堆叠的各行字号」，不能只看最大字号 —— 第一版就是因为把 hero 当成一行，
    # 把内容高算小了近 40%。
    stack: tuple[float, ...] = ()


HERO = Line("hero", [
    ("caption", "接下来 · 第 5-6 节", "accent"),
    ("title", "毛泽东思想和中国特色社会主义理论体系概论", "primary"),
    ("body", "14:00 - 15:40 · B203", "secondary"),
], stack=(11, 16, 13))
MID = Line("mid", [("body", "下一节 16:00 线性代数 D402", "muted")], stack=(13,))
SUMMARY = Line("summary", [("caption", "今天 周日 · 共 4 节", "muted")], stack=(11,))
COURSES = [
    ("10:00", "大学物理", "C305"),
    ("14:00", "毛泽东思想和中国特色社会主义理论体系概论", "B203"),
    ("16:00", "线性代数", "D402"),
    ("19:00", "数据结构", "A101"),
]
TOMORROW_SUMMARY = Line("summary", [("caption", "明天 周一 · 共 3 节", "muted")], stack=(11,))
COUNTER = Line("summary", [("caption", "今天还有 2 节", "muted")], stack=(11,))
TOMORROW_COURSES = [("08:00", "体育", "操场"), ("10:00", "英语", "A203"), ("14:00", "概率论", "B105")]


def course_lines(rows, two_lines: bool = False, now_taller: bool = False) -> list[Line]:
    out = []
    for i, (t, n, r) in enumerate(rows):
        stack = (13, 11) if two_lines else (13,)
        if now_taller and i == 0:                 # 第一行 = 正在进行：加高（约 1.4 倍）
            stack = tuple(sp * 1.4 for sp in stack)
        out.append(Line("course", [("body", t, "secondary"), ("body", n, "primary"), ("caption", r, "muted")], stack))
    return out


@dataclass
class Preset:
    key: str
    name: str
    cell: str
    w: float
    h: float
    style: str                     # compact | next_up
    wide: str                      # adaptive | two_column
    boost_ok: bool
    tomorrow: bool = False
    mid_row: bool = True           # 双栏左卡中缝放「下一节」
    gap_cap: float = MAX_EXTRA_PER_GAP_DP
    title_lines: int = 1           # 双栏左卡允许 2 行（DUAL_HERO_TITLE_LINES）
    # 静态富内容（全部由渲染时刻已有的数据算出，不需要新刷新）
    row_two_lines: bool = False    # 课程行双行：课名 / 节次 · 教室
    summary_two_lines: bool = False  # 汇总行两行：今天…共 N 节 / 已上完 x 节 · 还有 y 节
    footer_last: bool = False      # 列表底部：今天最后一节 …
    mid_two_lines: bool = False    # 左卡中缝两行：下一节 / 本周进度
    now_taller: bool = False       # 「正在进行」那一行加高并带左侧强调条
    note: str = ""


PRESETS = [
    Preset("phone_minimal", "手机 · 极简", "2×2", 179, 210, "compact", "adaptive", False, title_lines=2,
           note="hero + 下一节 + 今天还有 N 节；课名换行到 2 行"),
    Preset("phone_standard", "手机 · 标准", "4×3", 373, 321, "next_up", "adaptive", False, title_lines=2),
    Preset("tablet_dual", "平板 · 双栏（纯几何·已否）", "4×3", 733, 419, "next_up", "two_column", True, title_lines=2),
    Preset("tablet_wide", "平板 · 宽屏（今天+明天·已否）", "6×3", 1142, 419, "next_up", "two_column", True, tomorrow=True),
    Preset("tablet_dual_d", "平板 · 双栏（静态富内容·采用）", "4×3", 733, 419, "next_up", "two_column", True,
           title_lines=2, row_two_lines=True, summary_two_lines=True, footer_last=True, mid_two_lines=True,
           now_taller=True, note="不接明天、不需要新刷新，全靠渲染时刻已有的数据"),
    Preset("tablet_wide_d", "平板 · 宽屏（静态富内容·采用）", "6×3", 1142, 419, "next_up", "two_column", True,
           title_lines=2, row_two_lines=True, summary_two_lines=True, footer_last=True, mid_two_lines=True,
           now_taller=True),
    Preset("phone_wide", "手机 · 宽横", "4×2", 373, 210, "next_up", "adaptive", False, title_lines=2),
]


# ---------------------------------------------------------------- 高度与填充

def hero(preset: Preset) -> Line:
    stack = (11,) + (16,) * max(1, preset.title_lines) + (13,)
    return Line("hero", HERO.texts, stack)


def lines_for(preset: Preset, m: Metrics) -> dict[str, list[Line]]:
    """返回 {区域: 行序列}。compact 只画 hero + 计数行（C3：不显示列表）。"""
    if preset.style == "compact":
        # 紧凑样式也补「下一节」：2×2 只有一张卡的时候，「今天还有什么」比留白有用
        return {"body": [hero(preset), MID, COUNTER]}
    courses = course_lines(COURSES, preset.row_two_lines, preset.now_taller)
    today = [hero(preset), SUMMARY] + courses
    tomorrow = [TOMORROW_SUMMARY] + course_lines(TOMORROW_COURSES) if preset.tomorrow else []
    if m.dual and preset.wide == "two_column":
        header = [hero(preset)] + ([MID] if preset.mid_row else [])
        lst = [SUMMARY] + courses
        if preset.summary_two_lines:
            lst.insert(1, Line("summary", [("caption", "已上完 1 节 · 还有 2 节", "muted")], (11,)))
        if preset.footer_last:
            lst.append(Line("summary", [("caption", "今天最后一节 19:00 数据结构 A101", "muted")], (11,)))
        return {"header": header, "list": lst + tomorrow}
    return {"body": [hero(preset), SUMMARY] + courses + tomorrow}


def fit_local_factor(m: Metrics, lines: list[Line], avail: float, gap: float, first_gap: float,
                     lo: float = 0.6, hi: float = 1.0) -> float:
    """把不可滚动的区域（双栏左卡）缩到放得下；返回局部字号系数（≤1）。"""
    def height(factor: float) -> float:
        total = 0.0
        for i, line in enumerate(lines):
            total += first_gap if i == 0 else gap
            for sp in line.stack:
                total += m.line_box(m.sp(sp) * factor)
        return total
    if height(hi) <= avail * 0.98:
        return hi
    for _ in range(20):
        mid = (lo + hi) / 2
        if height(mid) <= avail * 0.98:
            lo = mid
        else:
            hi = mid
    return round(lo, 2)


def block_height(lines: list[Line], m: Metrics, gap: float, first_gap: float) -> float:
    total = 0.0
    for i, line in enumerate(lines):
        if i == 0:
            total += 0.0 if first_gap == 0 else first_gap
        else:
            total += gap
        for sp in line.stack:
            total += m.line_box(m.sp(sp))
    return total


def height_at(m: Metrics, lines: list[Line], boost: float, gap: float, first_gap: float) -> float:
    mm = resolve(m.w, m.h, boost)
    h = 0.0
    for i, line in enumerate(lines):
        h += first_gap if i == 0 else gap
        for sp in line.stack:
            h += mm.line_box(mm.sp(sp))
    return h


def solve_fit(m: Metrics, lines: list[Line], avail: float, gap: float, first_gap: float,
              lo: float = 0.6) -> float:
    """解「刚好放下的绝对字号系数」：上界是尺寸驱动的 m.scale（格子越大越能放大），
    下界 0.6（内容实在太多时的兜底，靠滚动而不是继续缩）。"""
    hi = m.scale
    if hi <= lo or height_at(m, lines, 1.0, gap, first_gap) <= avail * 0.98:
        return hi
    for _ in range(20):
        mid = (lo + hi) / 2
        if height_at(m, lines, mid / m.scale, gap, first_gap) <= avail * 0.98:
            lo = mid
        else:
            hi = mid
    return round(lo, 2)


def fill(m: Metrics, lines: list[Line], avail: float, gap_base: float, first_gap: float,
         allow_boost: bool = False, gap_cap: float = MAX_EXTRA_PER_GAP_DP) -> dict:
    """**解「能放下的最大字号」**（产品原则：格子越大字号越大），再把剩下的余量分给行距。

    旧模型是「先定字号、再摊余量」，于是大格子里永远是一片留白；现在反过来：在 [尺寸缩放, 全局上限]
    里二分找最大的字号缩放，使内容高度不超过可用高度（留 2% 安全余量），余量才给行距（≤gap_cap）。
    """
    if not lines:
        return dict(boost=1.0, gap=gap_base, pad=0.0, content=0.0, slack=avail, fill=0.0)
    # allow_fit=false：不做局部拟合，直接用尺寸驱动的字号（内容溢出就滚动，单栏就是这样）
    boost = (solve_fit(m, lines, avail, gap_base, first_gap) / m.scale) if (allow_boost and m.scale > 0) else 1.0
    m2 = resolve(m.w, m.h, boost)
    content = height_at(m, lines, boost, gap_base, first_gap)
    slack = avail - content
    share = min(max(slack / (len(lines) + 1), 0.0), gap_cap)
    gap = gap_base + share
    pad = share / 2
    content_after = content + share * (len(lines) - 1) + 2 * pad
    fill_ratio = min(1.0, content_after / avail) if avail > 0 else 0.0
    return dict(boost=boost, gap=gap, pad=pad, content=content_after, slack=slack, fill=fill_ratio, base_content=content)


# ---------------------------------------------------------------- 绘制

_SCRATCH = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def wrap_lines(text: str, f, width_dp: float, max_lines: int) -> list[str]:
    """按实测宽度折行；最多 max_lines 行，末行超出用「…」收尾。"""
    width_px = width_dp * PX_PER_DP
    if width_px <= 0:
        return [text]
    lines: list[str] = []
    rest = text
    while rest:
        if _SCRATCH.textlength(rest, font=f) <= width_px:
            lines.append(rest)
            break
        cut = 1
        while cut < len(rest) and _SCRATCH.textlength(rest[: cut + 1], font=f) <= width_px:
            cut += 1
        if len(lines) == max_lines - 1:
            tail = rest
            while tail and _SCRATCH.textlength(tail + "…", font=f) > width_px:
                tail = tail[:-1]
            lines.append(tail + "…")
            break
        lines.append(rest[:cut])
        rest = rest[cut:]
    return lines or [""]


def measure_text_blocks(entries: list[tuple[str, float, float]], m: Metrics) -> float:
    """entries = [(text, sp, width_dp)]：逐条折行后累计行盒高度。"""
    total = 0.0
    for text, sp, width in entries:
        f = font(REGULAR, m.sp(sp))
        n = len(wrap_lines(text, f, width, 3))
        total += n * m.line_box(m.sp(sp))
    return total


def dtext(draw, x_dp, y_dp, text, f, color, max_w_dp=None):
    """带宽度约束的绘制（超出就用「…」截断），返回文本宽度(dp)。"""
    x, y = x_dp * PX_PER_DP, y_dp * PX_PER_DP
    if max_w_dp is not None:
        limit = max_w_dp * PX_PER_DP
        if draw.textlength(text, font=f) > limit:
            while text and draw.textlength(text + "…", font=f) > limit:
                text = text[:-1]
            text += "…"
    draw.text((x, y), text, font=f, fill=color)
    return draw.textlength(text, font=f) / PX_PER_DP


def render_block(draw, m: Metrics, lines: list[Line], lines_h: list[Line], x0: float, y0: float,
                 width: float, gap: float, first_gap: float, style_entry: bool, sections: bool,
                 title_lines: int = 1) -> float:
    """画一段行序列（用填充后的行距），返回结束的 y(dp)。"""
    y = y0 + first_gap
    cap = font(REGULAR, m.sp(11))
    body = font(REGULAR, m.sp(13))
    title = font(BOLD, m.sp(16))
    fonts = {"caption": cap, "body": body, "title": title}
    style_drawn = False
    for line in lines:
        box = sum(m.line_box(m.sp(sp)) for sp in line.stack)
        if line.kind == "course":
            time, name, room = [t for _, t, _ in line.texts]
            two_lines = len(line.stack) >= 2
            dtext(draw, x0, y + 2, time, body, COLORS["secondary"])
            left = x0 + m.dp_scale(BASE["time_col"]) + m.dp_scale(BASE["marker_col"])
            avail_w = width - (left - x0)
            if two_lines:
                # 课名先折行（最多 2 行），再画「节次 · 教室」；宽卡片上教室就在课名下面
                name_lines = wrap_lines(name, body, avail_w, 2)
                for i, seg in enumerate(name_lines):
                    dtext(draw, left, y + 2 + i * m.line_box(m.sp(13)) * 0.92, seg, body, COLORS["primary"])
                meta_y = y + 2 + len(name_lines) * m.line_box(m.sp(13)) * 0.92
                dtext(draw, left, meta_y, f"第 3-4 节 · {room}", cap, COLORS["muted"], avail_w)
            else:
                room_w = draw.textlength(room, font=cap) / PX_PER_DP
                name_lines = wrap_lines(name, body, avail_w - room_w - 4, 2)
                for i, seg in enumerate(name_lines):
                    dtext(draw, left, y + 2 + i * m.line_box(m.sp(13)) * 0.92, seg, body, COLORS["primary"])
                dtext(draw, x0 + width - room_w, y + 3, room, cap, COLORS["muted"])
        else:
            y_inner = y
            for i, (role, text, color) in enumerate(line.texts):
                f = fonts[role]
                avail = width
                if style_entry and i == 0 and not style_drawn:
                    style_drawn = True
                    entry_w = draw.textlength("样式", font=cap) / PX_PER_DP + 2 * m.dp(BASE["style_pad"])
                    avail = width - entry_w - 6
                    dtext(draw, x0 + width - entry_w + m.dp(BASE["style_pad"]), y_inner, "样式", cap, COLORS["accent"])
                if role == "title":
                    # 课名按实测宽度折行（最多 title_lines 行），不再硬截断
                    segs = wrap_lines(text, f, avail, title_lines)
                    for i, seg in enumerate(segs):
                        dtext(draw, x0, y_inner + i * m.line_box(m.sp(16)) * 0.95, seg, f, COLORS[color])
                else:
                    dtext(draw, x0, y_inner, text, f, COLORS[color], avail)
                y_inner += m.line_box(m.sp({"caption": 11, "body": 13, "title": 16}[role]))
        y += box + gap
    return y


def draw_left_card(preset: Preset, m: Metrics, head_lines, mid_draw, detail_lines, w_dp: float, h_dp: float) -> Image.Image:
    """把左卡画在独立画布上再贴回整卡：这样字号过大时是**裁切**（真实行为），而不是溢出到右栏。"""
    W, H = int(round(w_dp * PX_PER_DP)), int(round(h_dp * PX_PER_DP))
    im = Image.new("RGB", (W, H), COLORS["surface"])
    draw = ImageDraw.Draw(im)
    inner = m.dp(BASE["hero_inner_pad"])
    head_h = block_height(head_lines, m, 0.0, 0.0)
    mid_h = block_height(mid_draw, m, 0.0, 0.0) if mid_draw else 0.0
    detail_h = block_height(detail_lines, m, 0.0, 0.0)
    slack = max(0.0, H / PX_PER_DP - 2 * inner - head_h - mid_h - detail_h)
    render_block(draw, m, head_lines, [], inner, inner, w_dp - 2 * inner, 0, 0, True, False,
                 title_lines=preset.title_lines)
    if mid_draw:
        render_block(draw, m, mid_draw, [], inner, inner + head_h + slack / 2, w_dp - 2 * inner, 0, 0, False, False)
    render_block(draw, m, detail_lines, [], inner, H / PX_PER_DP - inner - detail_h, w_dp - 2 * inner, 0, 0, False, False)
    return im


def draw_card(preset: Preset, m: Metrics, filled: bool, label: str) -> Image.Image:
    W, H = int(round(m.w * PX_PER_DP)), int(round(m.h * PX_PER_DP))
    im = Image.new("RGB", (W, H), (14, 15, 18))
    draw = ImageDraw.Draw(im)
    radius = m.dp(BASE["radius"]) * PX_PER_DP
    draw.rounded_rectangle([0, 0, W - 1, H - 1], radius=radius, fill=COLORS["card"])
    pad_h, pad_v = m.dp(BASE["pad_h"]), m.dp(BASE["pad_v"])
    avail = m.h - 2 * pad_v
    areas = lines_for(preset, m)
    gap_base = m.dp(BASE["gap"])
    first_gap = m.dp(BASE["gap_first"])
    stats = {}

    if "header" in areas:
        # 双栏：左卡（撑满高度，三段分布）+ 右栏列表
        head_w = m.dual_header_w()
        left_x, right_x = pad_h, pad_h + head_w + m.dp(BASE["dual_gap"])
        right_w = m.w - 2 * pad_h - head_w - m.dp(BASE["dual_gap"])
        radius_px = int(radius)
        left_h = m.h - 2 * pad_v
        inner = m.dp(BASE["hero_inner_pad"])
        header = areas["header"]
        head_lines = [l for l in header if l.kind == "hero"]
        mid_lines = [l for l in header if l.kind == "mid"]
        head_h = block_height(head_lines, m, 0.0, 0.0)
        mid_h = block_height(mid_lines, m, 0.0, 0.0)
        detail_h = m.line_box(m.sp(13)) + m.line_box(m.sp(11))          # 时间教室 + 今天还有 N 节
        mid_h = block_height(mid_lines, m, 0, 0) * (2 if preset.mid_two_lines else 1)
        slack = (m.h - 2 * inner) - head_h - detail_h
        if filled and mid_lines:
            slack -= mid_h
            y_mid = inner + head_h + slack / 2
        else:
            y_mid = None
        mid_draw = (mid_lines + [Line("summary", [("caption", "第 1 周 / 共 20 周", "muted")], (11,))]) \
            if (filled and preset.mid_two_lines and mid_lines) else ([mid_lines[0]] if (filled and mid_lines) else [])
        detail_lines = [Line("hero", [("body", "14:00 - 15:40 · B203", "secondary")], (13,)),
                        Line("summary", [("caption", "今天还有 2 节", "muted")], (11,))]
        card = draw_left_card(preset, m, head_lines, mid_draw, detail_lines, head_w, left_h)
        mask = Image.new("L", card.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, card.width - 1, card.height - 1], radius=radius_px, fill=255)
        draw._image.paste(card, (int(left_x * PX_PER_DP), int(pad_v * PX_PER_DP)), mask)
        if filled:
            left_fit = solve_fit(m, header, m.h - 2 * inner, 0, 0)
            right_fit = solve_fit(m, areas["list"], avail, gap_base, first_gap)
            shared = min(left_fit, right_fit, m.scale)
            shared = max(shared, 0.6)
            m = resolve(m.w, m.h, shared / m.scale)
            st = fill(m, areas["list"], avail, gap_base, first_gap, allow_boost=True,
                      gap_cap=preset.gap_cap)
        else:
            base_content = block_height(areas["list"], m, gap_base, first_gap)
            st = dict(boost=1.0, gap=gap_base, pad=0.0, content=base_content,
                      slack=avail - base_content, fill=base_content / avail)
        render_block(draw, m, areas["list"], [], right_x, pad_v, right_w, st["gap"], first_gap + st["pad"], True, False)
        left_fill = min(1.0, (head_h + detail_h + (mid_h if y_mid is not None else 0)) / (m.h - 2 * inner))
        stats = dict(left=left_fill, right=st["fill"], boost=st["boost"], gap=st["gap"], slack=st["slack"])
    else:
        body_lines = areas["body"]
        st = fill(m, body_lines, avail, gap_base, first_gap, allow_boost=preset.boost_ok,
                  gap_cap=preset.gap_cap) if filled else \
            dict(boost=1.0, gap=gap_base, pad=0.0, slack=avail - block_height(body_lines, m, gap_base, first_gap),
                 fill=block_height(body_lines, m, gap_base, first_gap) / avail)
        cap = first_gap + st["pad"] if filled else first_gap
        render_block(draw, m, body_lines, [], pad_h, pad_v, m.w - 2 * pad_h, st["gap"], cap, True, False,
                     title_lines=preset.title_lines)
        stats = dict(left=None, right=st["fill"], boost=st["boost"], gap=st["gap"], slack=st["slack"])

    tag = font(REGULAR, 10)
    draw.text((6 * PX_PER_DP, 4 * PX_PER_DP), label, font=tag, fill=COLORS["guide"])
    return im, stats


# ---------------------------------------------------------------- 主流程

def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out, exist_ok=True)
    rows = []
    sheets = []
    for preset in PRESETS:
        m = resolve(preset.w, preset.h)
        before, sb = draw_card(preset, m, False, f"{preset.name} {preset.cell} · 现状")
        after, sa = draw_card(preset, m, True, f"{preset.name} {preset.cell} · 预设目标")
        gap_x = 24
        sheet = Image.new("RGB", (before.width + after.width + gap_x * 3, before.height + 40), (10, 10, 12))
        sheet.paste(before, (gap_x, 30))
        sheet.paste(after, (before.width + gap_x * 2, 30))
        font_tag = font(REGULAR, 11)
        ImageDraw.Draw(sheet).text((gap_x, 6 * PX_PER_DP), f"{preset.name}  {preset.cell}  {preset.w:.0f}×{preset.h:.0f}dp"
                                   f"  scale={m.scale:.2f} dual={m.dual}", font=font_tag, fill=COLORS["primary"])
        path = os.path.join(out, f"preset-mock-{preset.key}.png")
        sheet.save(path)
        sheets.append((preset, sheet))
        rows.append((preset, m, sb, sa))
    # 汇总表
    print(f"{'预设':<18}{'格子':<8}{'scale':<7}{'可用高':<8}{'现状内容':<10}{'现状占比':<10}{'目标内容':<10}{'目标占比':<10}{'行距':<7}{'字号':<7}")
    for preset, m, sb, sa in rows:
        avail = m.h - 2 * m.dp(BASE["pad_v"])
        print(f"{preset.name:<18}{preset.cell:<8}{m.scale:<7.2f}{avail:<8.0f}"
              f"{sb['right'] * avail:<10.0f}{sb['right'] * 100:<10.0f}%"
              f"{sa['right'] * avail:<10.0f}{sa['right'] * 100:<10.0f}%"
              f"{sa['gap']:<7.1f}{'×' + format(sa['boost'] * m.scale, '.2f'):<7}")
    # 对照总图（缩放到统一高度）
    target_h = 520
    tiles = []
    for preset, sheet in sheets:
        ratio = target_h / sheet.height
        tiles.append(sheet.resize((int(sheet.width * ratio), target_h)))
    total_w = sum(t.width for t in tiles) + 20 * (len(tiles) + 1)
    contact = Image.new("RGB", (total_w, target_h + 40), (8, 8, 10))
    x = 20
    for t in tiles:
        contact.paste(t, (x, 20))
        x += t.width + 20
    contact.save(os.path.join(out, "preset-mock-contact-sheet.png"))
    print("\n输出目录:", out)


if __name__ == "__main__":
    main()
