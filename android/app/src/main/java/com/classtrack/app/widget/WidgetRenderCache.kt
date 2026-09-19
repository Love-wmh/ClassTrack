package com.classtrack.app.widget

import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshots.Snapshot
import com.classtrack.app.WidgetDisplayState

/**
 * 最近一次解析出的渲染状态（进程内可观察容器）。
 *
 * **为什么必须有它**：Glance 只在会话建立时执行一次 `provideGlance`，之后的 `update` / `updateAll`
 * 只重新执行 `provideContent` 的合成，而闭包里捕获的是那次 `provideGlance` 时的旧状态。
 * 实测后果（Android 17 模拟器）：把系统时间从 15:25 推到 16:30、或推送新快照后，小工具仍显示上一帧
 * （例如第一节课 15:20 已结束，却还标着「进行中」）。把最新解析结果放进这个容器、由合成阶段读取之后，
 * L1–L5 的每一次刷新都会真正反映到画面上。
 *
 * **它不改变数据来源**：状态的唯一来源仍然是 `WidgetRefreshController.resolveCurrentState`
 * （读 SharedPreferences 里的快照 + 显式传入的 now），这里只是一个「最新结果」的发布点。
 *
 * **生命周期**：进程内。进程重启后由 `provideGlance` 重新播种，因此不会长期缺失；缺失时合成回退到
 * `provideGlance` 自己解析出的状态。
 */
internal object WidgetRenderCache {
    private val latest = mutableStateOf<WidgetDisplayState?>(null)

    /**
     * 发布最新解析结果。
     *
     * @param state 刚解析出的状态。
     */
    fun publish(state: WidgetDisplayState) {
        // 刷新可能发生在广播接收器 / WorkManager 的后台线程上；包一层 Snapshot 让合成阶段能观察到变化。
        Snapshot.withMutableSnapshot { latest.value = state }
    }

    /** @return 最近一次解析结果；从未解析过时为 `null`。 */
    fun latest(): WidgetDisplayState? = latest.value
}
