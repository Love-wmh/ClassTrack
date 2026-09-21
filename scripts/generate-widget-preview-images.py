#!/usr/bin/env python3
"""生成五档小工具在选择器里的预览图（res/drawable-nodpi/widget_preview_<cells>.png）。

为什么需要它，而不是直接把图丢进仓库：

- `android:previewLayout`（Android 12+）由 launcher 渲染，只认布局资源，用不上 PNG；
  因此 PNG 服务于 **Android 12 以下** 的选择器（那里只认 `previewImage`）。
  上一条历史教训：`previewImage` 曾经指向 `@mipmap/ic_launcher`，用户在选择器里看到的是 App 图标。
- 图是**示意图**，不是设备截图：按各档的标定尺寸与 `WidgetLayoutMetrics` 的度量（与
  `generate-widget-preview-layouts.py` 同一套公式）画出来，因此与那份 XML mock 一致。
  五档各一张是关键：只给一张会让老系统上的用户看到「尺寸与实际不符」的预览。

用法：python3 scripts/generate-widget-preview-images.py

改了 `WidgetLayoutMetrics` 的基础常量/参考格/上下界、或改了某档的默认样式时，必须重跑本脚本
（同时重跑 `generate-widget-preview-layouts.py`），否则预览会撒谎。
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFont

# 与 generate-widget-preview-layouts.py / WidgetLayoutMetrics 保持一致。
W_REF = 179.0
H_REF = 210.0
MIN_SCALE = 1.0
MAX_SCALE = 2.0
BASE_TITLE_SP = 16.0
BASE_BODY_SP = 13.0
BASE_CAPTION_SP = 11.0
BASE_HORIZONTAL_PADDING_DP = 14.0
BASE_VERTICAL_PADDING_DP = 12.0
BASE_ROW_GAP_FIRST_DP = 6.0
BASE_ROW_GAP_DP = 4.0
BASE_HERO_GAP_DP = 6.0
BASE_TIME_COLUMN_DP = 44.0
DUAL_HEADER_SHARE = 0.36
DUAL_HEADER_MIN_DP = 220.0
DUAL_HEADER_MAX_DP = 360.0
DUAL_GAP_DP = 12.0
HERO_INNER_PADDING_DP = 14.0
SP_STEP = 0.5
DP_STEP = 1.0

# 与 res/values/strings.xml 的 widget_preview_* 保持一致；改了要一起改。
HERO_LABEL = "正在进行"
HERO_NAME = "数据结构"
HERO_TIME = "14:00 - 15:35 · C305"
# 「紧凑」样式把 hero 明细拆成两行：时间范围 + 教室（窄格里一行必被裁掉，而裁掉的正好是教室）。
HERO_TIME_RANGE = "14:00 - 15:35"
HERO_ROOM = "C305"
SUMMARY = "今天 周三 · 共 6 节"
COUNTS = "已上完 2 节 · 还有 3 节"
STYLE_ENTRY = "样式"
COUNTER = "今天还有 2 节"
ROWS = [
    ("08:00", "高等数学", "A101"),
    ("10:00", "大学物理", "B203"),
    ("14:00", "数据结构", "C305"),
    # 主课（14:00 数据结构）之后的两节：「紧凑」样式把它们列在主课下方，与计数行「今天还有 2 节」对得上。
    ("16:00", "线性代数", "D401"),
    ("18:00", "体育", "操场"),
]

# 「紧凑」样式画在主课之后的课程行（ROWS 下标）。
COMPACT_FOLLOW_UP_ROWS = (3, 4)

SURFACE = (255, 255, 255)
SURFACE_INNER = (242, 244, 248)
TEXT_PRIMARY = (28, 28, 30)
TEXT_SECONDARY = (75, 85, 99)
TEXT_MUTED = (107, 114, 128)
ACCENT = (37, 99, 235)

REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# 每 dp 画多少像素（2 = 与真机观感接近，且 6×3 平板尺寸也还放得下）。
PIXELS_PER_DP = 2


def snap(value: float, step: float) -> float:
    return round(value / step) * step


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


class Provider:
    def __init__(self, cells: str, width_dp: float, height_dp: float, shape: str) -> None:
        self.cells = cells
        self.width_dp = width_dp
        self.height_dp = height_dp
        self.shape = shape
        self.scale = clamp(min(width_dp / W_REF, height_dp / H_REF), MIN_SCALE, MAX_SCALE)
        self.pad_scale = self.scale ** 0.5

    def dp(self, value: float) -> int:
        return int(round(value * PIXELS_PER_DP))

    @property
    def hpad(self) -> float:
        return snap(BASE_HORIZONTAL_PADDING_DP * self.pad_scale, DP_STEP)

    @property
    def vpad(self) -> float:
        return snap(BASE_VERTICAL_PADDING_DP * self.pad_scale, DP_STEP)

    @property
    def title_sp(self) -> float:
        return snap(BASE_TITLE_SP * self.scale, SP_STEP)

    @property
    def body_sp(self) -> float:
        return snap(BASE_BODY_SP * self.scale, SP_STEP)

    @property
    def caption_sp(self) -> float:
        return snap(BASE_CAPTION_SP * self.scale, SP_STEP)

    @property
    def row_gap_first_dp(self) -> float:
        return snap(BASE_ROW_GAP_FIRST_DP * self.scale, DP_STEP)

    @property
    def row_gap_dp(self) -> float:
        return snap(BASE_ROW_GAP_DP * self.scale, DP_STEP)

    @property
    def hero_gap_dp(self) -> float:
        return snap(BASE_HERO_GAP_DP * self.scale, DP_STEP)

    @property
    def time_column_dp(self) -> float:
        return snap(BASE_TIME_COLUMN_DP * self.scale, DP_STEP)

    @property
    def hero_inner_padding_dp(self) -> float:
        return snap(HERO_INNER_PADDING_DP * self.pad_scale, DP_STEP)

    @property
    def dual_gap_dp(self) -> float:
        return snap(DUAL_GAP_DP * self.pad_scale, DP_STEP)

    @property
    def dual_header_width_dp(self) -> float:
        content = max(0.0, self.width_dp - 2 * self.hpad)
        return snap(clamp(content * DUAL_HEADER_SHARE, DUAL_HEADER_MIN_DP, DUAL_HEADER_MAX_DP), DP_STEP)


PROVIDERS = [
    # 维护档在前（与 WidgetProviderRegistry 的顺序一致）：这两档是拾取器里真正提供的那两个。
    Provider("3x2", 276.0, 210.0, "single_tight"),
    Provider("1x2", 97.0, 210.0, "compact"),
    Provider("2x2", 179.0, 210.0, "compact"),
    Provider("2x3", 179.0, 315.0, "single"),
    Provider("4x2", 373.0, 210.0, "single_tight"),
    Provider("4x3", 373.0, 321.0, "single"),
    Provider("6x3", 1142.0, 419.0, "dual"),
]


def font(path: str, size_dp: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, max(8, int(round(size_dp * PIXELS_PER_DP))))


def draw_hero(draw: ImageDraw.ImageDraw, provider: Provider, x: int, y: int, width: int,
              stacked_detail: bool = False) -> int:
    caption = font(REGULAR, provider.caption_sp)
    title = font(BOLD, provider.title_sp)
    body = font(REGULAR, provider.body_sp)

    draw.text((x, y), HERO_LABEL, font=caption, fill=ACCENT)
    entry_width = draw.textlength(STYLE_ENTRY, font=caption)
    draw.text((x + width - entry_width, y), STYLE_ENTRY, font=caption, fill=ACCENT)
    y += provider.dp(provider.caption_sp * 1.5)

    draw.text((x, y), HERO_NAME, font=title, fill=TEXT_PRIMARY)
    y += provider.dp(provider.title_sp * 1.35)

    if stacked_detail:
        # 时间与教室分两行：窄格里「14:00 - 15:35 · C305」会被画布裁掉后半截，教室就消失了。
        draw.text((x, y), HERO_TIME_RANGE, font=body, fill=TEXT_SECONDARY)
        y += provider.dp(provider.body_sp * 1.4)
        draw.text((x, y), HERO_ROOM, font=caption, fill=TEXT_MUTED)
        y += provider.dp(provider.caption_sp * 1.4)
        return y

    draw.text((x, y), HERO_TIME, font=body, fill=TEXT_SECONDARY)
    y += provider.dp(provider.body_sp * 1.4)
    return y


def draw_summary(draw: ImageDraw.ImageDraw, provider: Provider, x: int, y: int, width: int, counts: bool) -> int:
    caption = font(REGULAR, provider.caption_sp)
    y += provider.dp(provider.hero_gap_dp)
    draw.text((x, y), SUMMARY, font=caption, fill=TEXT_MUTED)
    entry_width = draw.textlength(STYLE_ENTRY, font=caption)
    draw.text((x + width - entry_width, y), STYLE_ENTRY, font=caption, fill=ACCENT)
    y += provider.dp(provider.caption_sp * 1.5)
    if counts:
        draw.text((x, y), COUNTS, font=caption, fill=TEXT_MUTED)
        y += provider.dp(provider.caption_sp * 1.4)
    return y


def draw_compact_rows(draw: ImageDraw.ImageDraw, provider: Provider, x: int, y: int, width: int, count: int,
                      start: int = 0) -> int:
    """窄卡行项：课名一行、「时间 · 教室」一行（运行期紧凑样式的 RowForm.COMPACT）。"""
    body = font(REGULAR, provider.body_sp)
    caption = font(REGULAR, provider.caption_sp)
    for index in range(start, min(start + count, len(ROWS))):
        time_label, name, room = ROWS[index]
        y += provider.dp(provider.row_gap_dp)
        draw.text((x, y), name, font=body, fill=TEXT_PRIMARY)
        y += provider.dp(provider.body_sp * 1.35)
        draw.text((x, y), f"{time_label} · {room}", font=caption, fill=TEXT_MUTED)
        y += provider.dp(provider.caption_sp * 1.4)
    return y


def draw_rows(draw: ImageDraw.ImageDraw, provider: Provider, x: int, y: int, width: int, count: int,
              start: int = 0) -> int:
    body = font(REGULAR, provider.body_sp)
    caption = font(REGULAR, provider.caption_sp)
    for index in range(start, min(start + count, len(ROWS))):
        time_label, name, room = ROWS[index]
        y += provider.dp(provider.row_gap_first_dp if index == 0 else provider.row_gap_dp)
        draw.text((x, y), time_label, font=body, fill=TEXT_SECONDARY)
        draw.text((x + provider.dp(provider.time_column_dp + 4), y), name, font=body, fill=TEXT_PRIMARY)
        room_width = draw.textlength(room, font=caption)
        draw.text((x + width - room_width, y + provider.dp(1)), room, font=caption, fill=TEXT_MUTED)
        y += provider.dp(provider.body_sp * 1.4)
    return y


def render(provider: Provider) -> Image.Image:
    width = provider.dp(provider.width_dp)
    height = provider.dp(provider.height_dp)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([(0, 0), (width - 1, height - 1)], radius=provider.dp(20 * provider.pad_scale), fill=SURFACE)

    x = provider.dp(provider.hpad)
    content_width = width - 2 * x

    if provider.shape == "dual":
        left_width = provider.dp(provider.dual_header_width_dp)
        inner = provider.dp(provider.hero_inner_padding_dp)
        draw.rounded_rectangle([(x, provider.dp(provider.vpad)), (x + left_width, height - provider.dp(provider.vpad))],
                               radius=provider.dp(16 * provider.pad_scale), fill=SURFACE_INNER)
        y = provider.dp(provider.vpad) + inner
        y = draw_hero(draw, provider, x + inner, y, left_width - 2 * inner)
        draw.text((x + inner, y), COUNTER, font=font(REGULAR, provider.caption_sp), fill=TEXT_MUTED)

        right_x = x + left_width + provider.dp(provider.dual_gap_dp)
        right_width = width - x - right_x
        y = provider.dp(provider.vpad)
        y = draw_summary(draw, provider, right_x, y - provider.dp(provider.hero_gap_dp), right_width, counts=True)
        draw_rows(draw, provider, right_x, y, right_width, count=2)
        return image

    y = provider.dp(provider.vpad)
    if provider.shape == "compact":
        # 主课明细两行（与运行期的 stackedDetail 一致），下面接计数行与主课之后的课。
        y = draw_hero(draw, provider, x, y, content_width, stacked_detail=True)
        draw.text((x, y + provider.dp(provider.hero_gap_dp)), COUNTER,
                  font=font(REGULAR, provider.caption_sp), fill=TEXT_MUTED)
        y += provider.dp(provider.hero_gap_dp + provider.caption_sp * 1.5)
        draw_compact_rows(draw, provider, x, y, content_width, count=len(COMPACT_FOLLOW_UP_ROWS),
                           start=COMPACT_FOLLOW_UP_ROWS[0])
        return image

    y = draw_hero(draw, provider, x, y, content_width)

    y = draw_summary(draw, provider, x, y, content_width, counts=False)
    draw_rows(draw, provider, x, y, content_width, count=2 if provider.shape == "single_tight" else 2)
    return image


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    out_dir = root / "android/app/src/main/res/drawable-nodpi"
    for provider in PROVIDERS:
        image = render(provider)
        target = out_dir / f"widget_preview_{provider.cells}.png"
        image.save(target)
        print(f"wrote {target.relative_to(root)} ({image.width}x{image.height}, scale={provider.scale:.2f})")


if __name__ == "__main__":
    main()
