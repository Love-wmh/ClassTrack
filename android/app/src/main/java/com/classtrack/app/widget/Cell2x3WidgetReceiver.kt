package com.classtrack.app.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * 2x3 这一档尺寸的小工具 provider。
 *
 * 为什么要按尺寸注册多个 provider：`requestPinAppWidget` 的尺寸提示会被 launcher 忽略（实测 Launcher3
 * 只认 provider 自己声明的 `targetCellWidth/Height`），因此**唯一可靠的做法**是每个尺寸各注册一个 provider ——
 * 用户在系统拾取器里挑好尺寸，放下即带对应样式，完全不依赖 pin 回调（真机 ColorOS 会静默丢掉那个请求）。
 *
 * 与其它 provider 的差异只有元数据（`res/xml/widget_info_2x3.xml`）与默认样式（见 `WidgetProviderRegistry`）；
 * 渲染逻辑完全共用 `ClassTrackWidget`。行为注意事项与 `ClassTrackWidgetReceiver` 一致：
 * **绝不在这里用 `goAsync()`**（见那个类的注释：实测会返回 null 并因 NPE 杀进程，表现为小工具空白）。
 */
class Cell2x3WidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ClassTrackWidget()
}
