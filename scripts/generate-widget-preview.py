#!/usr/bin/env python3
"""生成小工具在选择器里的预览图（res/drawable-nodpi/widget_preview.png）。

为什么需要这个脚本，而不是直接把一张图丢进仓库：

- `android:previewLayout`（Android 12+）由 launcher 渲染，只认布局资源，无法直接用 PNG；
  因此 PNG 服务于 **Android 12 以下** 的小工具选择器（那里只认 `previewImage`）。
- 之前 `previewImage` 指向 `@mipmap/ic_launcher`，用户在选择器里看到的是 App 图标，
  这正是「没有做好预览」的原始问题。
- 图是用系统自带的 Noto Sans CJK 渲染的**示意图**（与 `res/layout/widget_preview_next_up.xml` 一致），
  不是设备截图。它画的是**默认样式「接下来」**，因为选择器要给的是「放下去会得到什么」。
  改动真实样式、或改动默认样式时，必须同步更新本脚本与那份 mock 布局，否则预览会撒谎（design.md D14）。

用法：python3 scripts/generate-widget-preview.py
"""

from PIL import Image, ImageDraw, ImageFont

# 2x 密度：widget 约 250x180dp → 500x360px，与真机上的观感一致。
SCALE = 2
WIDTH = 250 * SCALE
HEIGHT = 180 * SCALE
PADDING_H = 14 * SCALE
PADDING_V = 12 * SCALE
CORNER = 20 * SCALE

SURFACE = (255, 255, 255)
TEXT_PRIMARY = (28, 28, 30)
TEXT_SECONDARY = (75, 85, 99)
TEXT_MUTED = (107, 114, 128)
ACCENT = (37, 99, 235)

REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# 与 res/values/strings.xml 的 widget_preview_* 保持一致；改了要一起改。
HERO_LABEL = "正在进行 · 第 3-4 节"
HERO_NAME = "数据结构"
HERO_TIME = "14:00 - 15:35 · C305"
SUMMARY = "今天 周三 · 共 6 节"
STYLE_ENTRY = "样式"
ROWS = [
    ("08:00", "高等数学", "A101"),
    ("10:00", "大学物理", "B203"),
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def main() -> None:
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([(0, 0), (WIDTH - 1, HEIGHT - 1)], radius=CORNER, fill=SURFACE)

    caption = font(REGULAR, 11 * SCALE)
    body = font(REGULAR, 13 * SCALE)
    title = font(BOLD, 16 * SCALE)

    y = PADDING_V

    # hero 标签行：左边状态标签，右边「样式」入口。
    draw.text((PADDING_H, y), HERO_LABEL, font=caption, fill=ACCENT)
    entry_width = draw.textlength(STYLE_ENTRY, font=caption)
    draw.text((WIDTH - PADDING_H - entry_width, y), STYLE_ENTRY, font=caption, fill=ACCENT)
    y += 11 * SCALE + 8

    # hero 课程名：真实渲染只给一行，超出省略。
    draw.text((PADDING_H, y), HERO_NAME, font=title, fill=TEXT_PRIMARY)
    y += 16 * SCALE + 6

    draw.text((PADDING_H, y), HERO_TIME, font=body, fill=TEXT_SECONDARY)
    y += 13 * SCALE + 6 * SCALE

    # 汇总行。
    draw.text((PADDING_H, y), SUMMARY, font=caption, fill=TEXT_MUTED)
    entry_width = draw.textlength(STYLE_ENTRY, font=caption)
    draw.text((WIDTH - PADDING_H - entry_width, y), STYLE_ENTRY, font=caption, fill=ACCENT)
    y += 11 * SCALE + 6 * SCALE

    # 课表行：时间列 44dp，教室右对齐。
    for index, (time_label, name, room) in enumerate(ROWS):
        draw.text((PADDING_H, y), time_label, font=body, fill=TEXT_SECONDARY)
        draw.text((PADDING_H + 48 * SCALE, y), name, font=body, fill=TEXT_PRIMARY)
        room_width = draw.textlength(room, font=caption)
        draw.text((WIDTH - PADDING_H - room_width, y + 2), room, font=caption, fill=TEXT_MUTED)
        y += 13 * SCALE + (6 if index == 0 else 4) * SCALE

    output = "android/app/src/main/res/drawable-nodpi/widget_preview.png"
    image.save(output)
    print(f"wrote {output} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
