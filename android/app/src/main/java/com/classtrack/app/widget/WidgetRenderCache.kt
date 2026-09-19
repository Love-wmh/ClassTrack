package com.classtrack.app.widget

import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshots.Snapshot
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetStyleConfig

/**
 * 最近一次解析出的渲染状态与每实例配置（进程内可观察容器）。
 *
 * **为什么必须有它**：Glance 只在会话建立时执行一次 `provideGlance`，之后的 `update` / `updateAll`
 * 只重新执行 `provideContent` 的合成，而闭包里捕获的是那次 `provideGlance` 时的旧状态与旧配置。
 * 实测后果（真机 Android 16）：
 * - 时间推进 / 推送新快照后，小工具仍显示上一帧（例如第一节课已结束却仍标「进行中」）；
 * - **配置页切换样式后，小工具仍显示旧样式 —— 表现为「切成紧凑后就再也切不回去」**。
 * 把「最新状态」与「各实例最新配置」放进这个容器、由合成阶段读取之后，L1–L5 的每次刷新与
 * 配置页的每次保存都会真正反映到画面上。
 *
 * **它不改变数据来源**：状态的唯一来源是 `WidgetRefreshController.resolveCurrentState`
 * （读 SharedPreferences 里的快照 + 显式传入的 now）；配置的唯一来源是 `WidgetStyleState`
 * （Glance 状态容器）。这里只是「最新结果」的发布点。
 *
 * **生命周期**：进程内。进程重启后由 `provideGlance` 重新播种；配置缺失时合成回退到
 * `provideGlance` 自己读到的值。
 */
internal object WidgetRenderCache {
    private val latest = mutableStateOf<WidgetDisplayState?>(null)

    /** 每个实例最近一次发布的配置，key = appWidgetId。 */
    private val latestConfigs = mutableStateOf<Map<Int, WidgetStyleConfig>>(emptyMap())

    /**
     * 发布最新解析结果。
     *
     * @param state 刚解析出的状态。
     */
    fun publish(state: WidgetDisplayState) {
        // 刷新可能发生在广播接收器 / WorkManager 的后台线程上；包一层 Snapshot 让合成阶段能观察到变化。
        Snapshot.withMutableSnapshot { latest.value = state }
    }

    /**
     * 发布某个实例的最新配置。
     *
     * @param appWidgetId 实例 id。
     * @param config 该实例最新配置。
     */
    fun publishConfig(appWidgetId: Int, config: WidgetStyleConfig) {
        Snapshot.withMutableSnapshot {
            latestConfigs.value = latestConfigs.value + (appWidgetId to config)
        }
    }

    /** @return 最近一次解析结果；从未解析过时为 `null`。 */
    fun latest(): WidgetDisplayState? = latest.value

    /**
     * 取某个实例的最新配置。
     *
     * @param appWidgetId 实例 id。
     * @param fallback 缓存缺失时回退的值（通常是 `provideGlance` 自己读到的配置）。
     * @return 该实例最新配置。
     */
    fun latestConfig(appWidgetId: Int, fallback: WidgetStyleConfig): WidgetStyleConfig =
        latestConfigs.value[appWidgetId] ?: fallback
}
