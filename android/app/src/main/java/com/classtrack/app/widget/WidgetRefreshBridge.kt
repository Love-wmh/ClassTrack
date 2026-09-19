package com.classtrack.app.widget

import android.content.Context
import com.classtrack.app.WidgetDiagnostics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Java 侧触发刷新的唯一入口（L1）。
 *
 * `WidgetSnapshotPlugin`（Java）在快照落盘成功后调用 `WidgetRefreshBridge.requestRefresh(context)`；
 * 这是本任务里 **Java ↔ Kotlin 的全部跨语言面**：一个静态方法、参数只有 Context、没有返回值。
 * 把面压到最小，是为了让 Glance 的 Kotlin/suspend API 与既有的 Java Capacitor 插件之间
 * 只存在一个可控的连接点。
 *
 * 两次动作刻意都做：
 * 1. 立即在内存里渲染 —— 让用户在推送后马上看到新内容（C1）；
 * 2. 入队一个 0 延迟的 WorkManager 任务 —— 万一进程在渲染完成前被杀，这次刷新仍会被补上。
 * 两条路径都指向同一个幂等入口，重复执行无副作用。
 */
object WidgetRefreshBridge {
    /** 应用级协程作用域：刷新是短任务，且不应随任何 Activity 生命周期取消。 */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * 请求一次刷新。
     *
     * @param context 任意 Context；为 `null` 时静默返回（插件在极端情况下可能拿不到 Context）。
     */
    @JvmStatic
    fun requestRefresh(context: Context?) {
        val appContext = context?.applicationContext ?: return

        scope.launch {
            try {
                WidgetRefreshController.refresh(appContext, TRIGGER)
            } catch (error: RuntimeException) {
                // 刷新失败不应影响插件对 Web 侧的 resolve：快照本身已经落盘成功了。
                WidgetDiagnostics.refreshFailed()
            }
        }

        WidgetRefreshScheduler.enqueueImmediate(appContext)
    }

    private const val TRIGGER = "plugin_push"
}
