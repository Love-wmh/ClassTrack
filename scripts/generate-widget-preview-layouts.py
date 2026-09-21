#!/usr/bin/env python3
"""生成五份「选择器预览示意图」（res/layout/widget_preview_<cells>.xml）。

为什么要生成而不是手写五份：这些 mock 必须与 `WidgetLayoutMetrics` 的度量、以及各 provider 的默认样式
严格一致（上一版就是因为手写、又没写清同步条件，注释里连"标定基准是 4×3"都留成了旧的）。把公式放在
一处、按档位求值，五份之间就不可能互相漂移；改动度量或默认样式时重跑本脚本即可。

用法：python3 scripts/generate-widget-preview-layouts.py [--check]

`--check` 只校验磁盘上的文件与生成结果一致（CI/门禁用），不写盘。
"""
from __future__ import annotations

import math
import pathlib
import sys

# 与 WidgetLayoutMetrics 的基础常量保持一致（改了那边必须同步这里）。
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
BASE_STYLE_ENTRY_PADDING_DP = 8.0
DUAL_HEADER_SHARE = 0.36
DUAL_HEADER_MIN_DP = 220.0
DUAL_HEADER_MAX_DP = 360.0
DUAL_GAP_DP = 12.0
HERO_INNER_PADDING_DP = 14.0

SP_STEP = 0.5
DP_STEP = 1.0


def snap(value: float, step: float) -> float:
    return round(value / step) * step


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


class Provider:
    """一档 provider：格子数、标定尺寸（dp）、拾取器里的标签与它画的 mock 结构。"""

    def __init__(self, cells: str, width_dp: float, height_dp: float, label: str, shape: str) -> None:
        self.cells = cells
        self.width_dp = width_dp
        self.height_dp = height_dp
        self.label = label
        self.shape = shape  # compact | single | single_dense | dual
        self.scale = clamp(min(width_dp / W_REF, height_dp / H_REF), MIN_SCALE, MAX_SCALE)
        self.pad_scale = math.sqrt(self.scale)

    # ---- 来自 WidgetLayoutMetrics 的度量 ----
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
    def style_entry_padding_dp(self) -> float:
        return snap(BASE_STYLE_ENTRY_PADDING_DP * self.pad_scale, DP_STEP)

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
    Provider("2x2", 179.0, 210.0, "课表 · 极简 2×2", "compact"),
    Provider("2x3", 179.0, 315.0, "课表 · 手机 2×3", "single"),
    Provider("4x2", 373.0, 210.0, "课表 · 宽横 4×2", "single_tight"),
    Provider("4x3", 373.0, 321.0, "课表 · 标准 4×3", "single"),
    Provider("6x3", 1142.0, 419.0, "课表 · 宽屏 6×3", "dual"),
]

# 示意用的示例课程（与 res/values/strings.xml 的 widget_preview_* 一致，不是任何用户数据）。
ROWS = [
    ("@string/widget_preview_time_1", "@string/widget_preview_name_1", "@string/widget_preview_room_1"),
    ("@string/widget_preview_time_2", "@string/widget_preview_name_2", "@string/widget_preview_room_2"),
    ("@string/widget_preview_time_3", "@string/widget_preview_name_3", "@string/widget_preview_room_3"),
]


def num(value: float) -> str:
    """把度量写成 XML 里的数字（整数就不带小数点）。"""
    return str(int(value)) if float(value).is_integer() else str(value)


def header(provider: Provider, shape_note: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!--
  选择器预览示意图（静态 mock）：**{provider.label}** 这一档放下去会长什么样。

  用法：`android:previewLayout`（Android 12+ 的选择器会渲染它，让用户看到真实长相而不是 App 图标）。
  同一档在 Android 12 以下回退到 `android:previewImage="@drawable/widget_preview_{provider.cells}"`
  （由 scripts/generate-widget-preview-images.py 生成，尺寸与内容必须与本文件一致）。

  **本文件由 scripts/generate-widget-preview-layouts.py 生成，不要手改**（改了会在生成脚本的校验模式下失败）。
  生成依据：
  - 标定尺寸 {num(provider.width_dp)}×{num(provider.height_dp)}dp → `WidgetLayoutMetrics` 的 scale = {provider.scale:.2f}、
    padScale = {provider.pad_scale:.2f}（W_REF/H_REF = {num(W_REF)}×{num(H_REF)}，下界 {num(MIN_SCALE)}）；
  - 默认样式：{shape_note}。

  **什么时候必须重跑本脚本**：改了 `WidgetLayoutMetrics` 的基础常量/参考格/上下界、改了该档的默认样式
  或行项形态、改了 `WidgetProviderRegistry` 里的标定尺寸。

  **只能用 RemoteViews 白名单内的类**（FrameLayout / LinearLayout / TextView / ImageView 等）：
  这里曾出现 <View> 子节点，launcher inflate 时抛 `Class not allowed to be inflated android.view.View`，
  桌面直接显示「Can't load widget」。同理不要用 `Space` —— 间距一律用 layout_marginTop。
  文案来自 @string/widget_preview_*，是示例课程，不是任何用户数据。
-->
"""


def hero_block(provider: Provider, label: str = "@string/widget_preview_hero_label") -> str:
    return f"""    <!-- hero 标签行：状态标签 +「样式」入口（与运行期一致） -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="{label}"
            android:textColor="@color/widget_accent"
            android:textSize="{num(provider.caption_sp)}sp" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:paddingStart="{num(provider.style_entry_padding_dp)}dp"
            android:text="@string/widget_preview_style_entry"
            android:textColor="@color/widget_accent"
            android:textSize="{num(provider.caption_sp)}sp" />
    </LinearLayout>

    <!-- hero 课程名：真实渲染只给一行 -->
    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="@string/widget_preview_hero_name"
        android:textColor="@color/widget_text_primary"
        android:textSize="{num(provider.title_sp)}sp"
        android:textStyle="bold" />

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="@string/widget_preview_hero_time"
        android:textColor="@color/widget_text_secondary"
        android:textSize="{num(provider.body_sp)}sp" />
"""


def summary_block(provider: Provider, with_counts: bool) -> str:
    counts = ""
    if with_counts:
        counts = f"""
    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="@string/widget_preview_counts"
        android:textColor="@color/widget_text_muted"
        android:textSize="{num(provider.caption_sp)}sp" />
"""
    return f"""    <!-- 汇总行：与 hero 之间留 {num(provider.hero_gap_dp)}dp（运行期是 hero 末尾的 Spacer） -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="{num(provider.hero_gap_dp)}dp"
        android:orientation="horizontal">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="@string/widget_preview_summary"
            android:textColor="@color/widget_text_muted"
            android:textSize="{num(provider.caption_sp)}sp" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="@string/widget_preview_style_entry"
            android:textColor="@color/widget_accent"
            android:textSize="{num(provider.caption_sp)}sp" />
    </LinearLayout>
{counts}"""


def course_row(provider: Provider, index: int, first: bool) -> str:
    time_label, name_label, room_label = ROWS[index]
    margin = provider.row_gap_first_dp if first else provider.row_gap_dp
    return f"""    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="{num(margin)}dp"
        android:orientation="horizontal">

        <TextView
            android:layout_width="{num(provider.time_column_dp)}dp"
            android:layout_height="wrap_content"
            android:text="{time_label}"
            android:textColor="@color/widget_text_secondary"
            android:textSize="{num(provider.body_sp)}sp" />

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:ellipsize="end"
            android:maxLines="1"
            android:text="{name_label}"
            android:textColor="@color/widget_text_primary"
            android:textSize="{num(provider.body_sp)}sp" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="{room_label}"
            android:textColor="@color/widget_text_muted"
            android:textSize="{num(provider.caption_sp)}sp" />
    </LinearLayout>
"""


def counter_block(provider: Provider) -> str:
    return f"""    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="{num(provider.hero_gap_dp)}dp"
        android:text="@string/widget_preview_counter"
        android:textColor="@color/widget_text_muted"
        android:textSize="{num(provider.caption_sp)}sp" />
"""


def single_column(provider: Provider, rows: int, with_counts: bool) -> str:
    body = hero_block(provider) + summary_block(provider, with_counts)
    for index in range(rows):
        body += course_row(provider, index, first=(index == 0))
    return body


def compact_column(provider: Provider) -> str:
    return hero_block(provider) + counter_block(provider)


def dual_column(provider: Provider) -> str:
    inner = f"""                <TextView
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:text="@string/widget_preview_hero_label"
                    android:textColor="@color/widget_accent"
                    android:textSize="{num(provider.caption_sp)}sp" />

                <TextView
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:ellipsize="end"
                    android:maxLines="2"
                    android:text="@string/widget_preview_hero_name"
                    android:textColor="@color/widget_text_primary"
                    android:textSize="{num(provider.title_sp)}sp"
                    android:textStyle="bold" />

                <TextView
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:layout_marginTop="{num(provider.hero_gap_dp)}dp"
                    android:text="@string/widget_preview_hero_time"
                    android:textColor="@color/widget_text_secondary"
                    android:textSize="{num(provider.body_sp)}sp" />

                <TextView
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:text="@string/widget_preview_counter"
                    android:textColor="@color/widget_text_muted"
                    android:textSize="{num(provider.caption_sp)}sp" />
"""
    right = summary_block(provider, True)
    for index in range(2):
        right += course_row(provider, index, first=(index == 0))
    return f"""    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

        <!-- 左卡：「现在这节课」的三段（顶部信息 / 时间教室 / 今天还有几节） -->
        <LinearLayout
            android:layout_width="{num(provider.dual_header_width_dp)}dp"
            android:layout_height="wrap_content"
            android:background="@drawable/widget_preview_surface_inner"
            android:orientation="vertical"
            android:padding="{num(provider.hero_inner_padding_dp)}dp">

{inner}        </LinearLayout>

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_marginStart="{num(provider.dual_gap_dp)}dp"
            android:layout_weight="1"
            android:orientation="vertical">

{right}        </LinearLayout>
    </LinearLayout>
"""


def render(provider: Provider) -> str:
    if provider.shape == "compact":
        shape_note = "「极简」= 只画 hero + 「今天还有 N 节」（没有课程列表）"
        body = compact_column(provider)
    elif provider.shape == "dual":
        shape_note = "「双栏」= 左卡 + 右侧课表（宽度足够时运行期才真的分栏，平板 6×3 满足）"
        body = dual_column(provider)
    elif provider.shape == "single_tight":
        shape_note = "单栏「接下来」= hero + 汇总行 + 课程行（这一档高度小，列表可滚动）"
        body = single_column(provider, rows=2, with_counts=False)
    else:
        shape_note = "单栏「接下来」= hero + 汇总行 + 课程行（列表可滚动）"
        body = single_column(provider, rows=2 if provider.cells == "2x3" else 3, with_counts=False)

    return header(provider, shape_note) + f"""<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:background="@drawable/widget_preview_surface"
    android:orientation="vertical"
    android:paddingStart="{num(provider.hpad)}dp"
    android:paddingEnd="{num(provider.hpad)}dp"
    android:paddingTop="{num(provider.vpad)}dp"
    android:paddingBottom="{num(provider.vpad)}dp">

{body}</LinearLayout>
"""


def main() -> int:
    check_only = "--check" in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    layout_dir = root / "android/app/src/main/res/layout"
    failures = []
    for provider in PROVIDERS:
        target = layout_dir / f"widget_preview_{provider.cells}.xml"
        content = render(provider)
        # XML 注释里不能出现连续两个连字符（aapt 直接拒绝）；这里显式拦一道 —— 上一版就是
        # 把 `--check` 写进注释后才发现这个限制的。
        for line in content.splitlines():
            body = line.split("<!--", 1)[1] if "<!--" in line else line
            body = body.rstrip()
            if body.endswith("-->"):
                body = body[: -len("-->")]
            if "--" in body:
                raise SystemExit(f"{target.name} 的注释里出现了 --（XML 不允许）：{line.strip()[:80]}")
        if check_only:
            current = target.read_text(encoding="utf-8") if target.exists() else ""
            if current != content:
                failures.append(str(target))
            continue
        target.write_text(content, encoding="utf-8")
        print(f"wrote {target.relative_to(root)} (scale={provider.scale:.2f})")
    if check_only and failures:
        print("以下预览布局与生成结果不一致（重跑 scripts/generate-widget-preview-layouts.py）：")
        for name in failures:
            print(f"  {name}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
