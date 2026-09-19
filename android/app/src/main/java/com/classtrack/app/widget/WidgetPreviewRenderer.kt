package com.classtrack.app.widget

import android.content.Context
import android.os.Bundle
import android.widget.RemoteViews
import androidx.compose.ui.unit.DpSize
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetStyleConfig

/**
 * 配置页样式预览的真实渲染器。
 *
 * **为什么不再用静态示意图**：静态 mock 与真实合成是两套代码。真机实测（Android 16）里
 * 「配置页预览的课表」与「桌面上的小工具」完全对不上：预览永远是「周三 6 节课」的示例数据，
 * 而真实卡片在周末只有两行并留下大片空白。用户因此明确要求预览必须与真实小工具一致。
 *
 * 这里直接复用**同一套 Glance 组合**（[WidgetContent]）渲染出真实 `RemoteViews`，再用
 * `RemoteViews.apply` 放进配置页 —— 数据、字体、间距、空状态全部来自真实渲染路径，不会再漂移。
 *
 * **与真实实例的唯一差别**：预览里的课程行走普通 `Column` 而不是 `LazyColumn`（原因见 [DayRows]）。
 * 行渲染函数相同，视觉上等价于可滚动列表顶部的若干行。
 *
 * **依赖的实验 API**：`GlanceRemoteViews` 需要 `@OptIn(ExperimentalGlanceRemoteViewsApi::class)`。
 * 它与 `ClassTrackWidget` 里那处 `ExperimentalGlanceApi` 是两件事：前者只用于配置页预览，即使将来
 * 被移除也只影响预览，回退路径是恢复静态 mock 布局。
 */
internal object WidgetPreviewRenderer {

    /**
     * 渲染一张预览。
     *
     * 预览与真实小工具用**同一个尺寸**：小工具的 `sizeMode` 是 `SizeMode.Exact`，`LocalSize` 就是宿主
     * 格子大小，所以这里按实例选项读到的格子尺寸渲染即可，两边画在同一张画布上。
     *
     * 上一版声明了几档固定候选尺寸（`SizeMode.Responsive`），真实渲染会用「命中那一档」的尺寸，而
     * 配置页拿到的却是格子的原始尺寸，两边不一致：预览列出三行课、桌面只剩 hero。改成 `Exact` 之后
     * 这类不一致从源头消失了。
     * @param size 该实例在宿主里的格子尺寸（dp）；由调用方从 `AppWidgetManager` 的实例选项读取。
     * @param state 当前解析出的真实状态。
     * @param config 要预览的样式配置。
     * @param appWidgetId 实例 id，仅用于生成与真实小工具一致的点击目标。
     * @return 真实合成的 RemoteViews；失败时为 `null`（调用方留空，不影响配置页可用）。
     */
    @OptIn(ExperimentalGlanceRemoteViewsApi::class)
    suspend fun render(context: Context, size: DpSize, state: WidgetDisplayState, config: WidgetStyleConfig,
                       appWidgetId: Int): RemoteViews? = try {
        GlanceRemoteViews()
            .compose(context, size, null, Bundle.EMPTY) {
                WidgetContent(state, config, appWidgetId, preview = true)
            }
            .remoteViews
    } catch (error: RuntimeException) {
        // 预览失败只是配置页少一张示意图，绝不能让配置页崩掉或阻止用户保存样式。
        WidgetDiagnostics.previewFailed()
        null
    }
}
