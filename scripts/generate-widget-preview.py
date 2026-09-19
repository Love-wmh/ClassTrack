#!/usr/bin/env python3
"""生成小工具在选择器里的预览图（res/drawable-nodpi/widget_preview.png）。

为什么需要这个脚本，而不是直接把一张图丢进仓库：

- `android:previewLayout`（Android 12+）由 launcher 渲染，只认布局资源，无法直接用 PNG；
  因此 PNG 服务于 **Android 12 以下** 的小工具选择器（那里只认 `previewImage`）。
- 之前 `previewImage` 指向 `@mipmap/ic_launcher`，用户在选择器里看到的是 App 图标，
  这正是「没有做好预览」的原始问题。
- 图是用系统自带的 Noto Sans CJK 渲染的**示意图**（样式与 widget_preview_day_list.xml 一致），
  不是设备截图。改动真实样式时必须同步更新本脚本与三份 mock 布局，否则预览会撒谎。

用法：python3 scripts/generate-widget-preview.py
"""

from PIL import Image, ImageDraw, ImageFont

# 2x 密度：widget 约 250x180dp → 500x360px，与真机上的观感一致。
SCALE = 2
WIDTH = 250 * SCALE
HEIGHT = 180 * SCALE
PADDING = 12 * SCALE
CORNER = 16 * SCALE

SURFACE = (255, 255, 255)
TEXT_PRIMARY = (28, 28, 30)
TEXT_SECONDARY = (75, 85, 99)
TEXT_MUTED = (107, 114, 128)
ACCENT = (37, 99, 235)

REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# 与 res/values/strings.xml 的 widget_preview_* 保持一致；改了要一起改。
SUMMARY = "今天 周三 · 共 6 节"
STYLE_ENTRY = "样式"
ROWS = [
    ("08:00", "高等数学", "A101", TEXT_MUTED, False),
    ("10:00", "大学物理", "B203", TEXT_MUTED, False),
    ("14:00", "数据结构", "C305", ACCENT, True),
    ("16:00", "英语", "D102", TEXT_PRIMARY, False),
    ("18:00", "体育", "操场", TEXT_PRIMARY, False),
    ("19:30", "选修课", "A201", TEXT_PRIMARY, False),
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def main() -> None:
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([(0, 0), (WIDTH - 1, HEIGHT - 1)], radius=CORNER, fill=SURFACE)

    caption = font(REGULAR, 11 * SCALE)
    body = font(REGULAR, 13 * SCALE)
    body_bold = font(BOLD, 13 * SCALE)

    y = PADDING

    # 汇总行：左边日期与节数，右边「样式」入口（与运行期一致）。
    draw.text((PADDING, y), SUMMARY, font=caption, fill=TEXT_MUTED)
    entry_width = draw.textlength(STYLE_ENTRY, font=caption)
    draw.text((WIDTH - PADDING - entry_width, y), STYLE_ENTRY, font=caption, fill=ACCENT)
    y += 11 * SCALE + 12

    for index, (time_label, name, room, name_color, live) in enumerate(ROWS):
        draw.text((PADDING, y), time_label, font=body, fill=TEXT_SECONDARY)
        row_font = body_bold if live else body
        draw.text((PADDING + 48 * SCALE, y), name, font=row_font, fill=name_color)
        room_width = draw.textlength(room, font=caption)
        draw.text((WIDTH - PADDING - room_width, y + 2), room, font=caption, fill=TEXT_MUTED)
        if live:
            draw.text((PADDING - 12 * SCALE, y), "●", font=caption, fill=ACCENT)
        y += 13 * SCALE + 16
        if index == len(ROWS) - 1:
            break

    output = "android/app/src/main/res/drawable-nodpi/widget_preview.png"
    image.save(output)
    print(f"wrote {output} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
