package com.classtrack.app.widget

import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.runtime.snapshots.SnapshotApplyConflictException
import com.classtrack.app.WidgetDiagnostics
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
    /** 撞上并发快照时的最大尝试次数（含首次）。 */
    private const val PUBLISH_ATTEMPTS = 3

    private val latest = mutableStateOf<WidgetDisplayState?>(null)

    /** 每个实例最近一次发布的配置，key = appWidgetId。 */
    private val latestConfigs = mutableStateOf<Map<Int, WidgetStyleConfig>>(emptyMap())

    /**
     * 在可变快照里写一次，**绝不抛出**。
     *
     * 刷新可能发生在广播接收器 / WorkManager 的后台线程上，所以写入要包一层 Snapshot 让合成阶段
     * 观察到变化。但 `Snapshot.withMutableSnapshot` 的 `apply()` 在撞上并发快照时会抛
     * `SnapshotApplyConflictException`，而这个写入点会在**配置页每点一次选项**时被触发
     * （`renderPreviews` → `resolveCurrentState` → `publish`，同时主线程正在做 `RemoteViews.apply`
     * 的真实合成）。平板实测：未捕获时配置页直接 `FATAL EXCEPTION` 崩掉 —— 用户连样式都改不回来。
     *
     * 这个容器是「尽力而为的最新值」，因此这里的契约是「必须写进去、绝不抛出」：先重试有限次，
     * 仍失败就退回普通赋值。普通赋值同样会通知观察者，只是不参与事务合并；失败那次的可变快照
     * 已被丢弃，所以回退不会留下半写状态。
     *
     * @param write 真正写值的动作。
     */
    private inline fun publishSafely(write: () -> Unit) {
        repeat(PUBLISH_ATTEMPTS) { attempt ->
            try {
                Snapshot.withMutableSnapshot(write)
                return
            } catch (conflict: SnapshotApplyConflictException) {
                if (attempt == PUBLISH_ATTEMPTS - 1) {
                    WidgetDiagnostics.renderCacheConflict()
                }
            }
        }
        write()
    }

    /** 发布最新解析结果。
     *
     * @param state 刚解析出的状态。
     */
    fun publish(state: WidgetDisplayState) {
        publishSafely { latest.value = state }
    }

    /**
     * 发布某个实例的最新配置。
     *
     * @param appWidgetId 实例 id。
     * @param config 该实例最新配置。
     */
    fun publishConfig(appWidgetId: Int, config: WidgetStyleConfig) {
        publishSafely { latestConfigs.value = latestConfigs.value + (appWidgetId to config) }
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
