package com.classtrack.app.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetStyleConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * 配置页保存设置的入口（Java/Kotlin 之外只有一个调用方：`WidgetConfigActivity`）。
 *
 * 与 [WidgetRefreshBridge] 一样使用应用级协程作用域而不是 Activity 的生命周期：用户点「确定」后
 * 配置页会立刻 `finish()`，如果写入还挂在 Activity 的作用域上，就会随页面一起被取消，
 * 表现为「设置了但没生效」。
 *
 * 写入成功后立刻刷新该实例（只刷新这一个，不动其它实例）。
 */
object WidgetConfigBridge {
    /** 应用级协程作用域：写入是短任务，不应随配置页的生命周期取消。 */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * 保存某个实例的配置并刷新它。
     *
     * @param context 任意 Context；为 `null` 时静默返回。
     * @param appWidgetId 目标实例 id（已由配置页校验过归属）。
     * @param config 要保存的配置。
     */
    @JvmStatic
    fun save(context: Context?, appWidgetId: Int, config: WidgetStyleConfig) {
        val appContext = context?.applicationContext ?: return

        scope.launch {
            try {
                val manager = GlanceAppWidgetManager(appContext)
                val glanceId = manager.getGlanceIdBy(appWidgetId)
                WidgetStyleState.write(appContext, glanceId, config)
                // 先发布再 update：update 只重合成、不重跑 provideGlance，
                // 合成层必须能读到这份新配置，否则样式切换在画面上不生效。
                WidgetRenderCache.publishConfig(appWidgetId, config)
                ClassTrackWidget().update(appContext, glanceId)
                WidgetDiagnostics.styleConfigured(config.layoutStyleStorageValue(), config.finishedPolicyStorageValue())
            } catch (error: RuntimeException) {
                // 写失败不能让配置页崩掉：用户看到的是样式没变，而不是应用退出。
                WidgetDiagnostics.styleWriteFailed()
            }
        }
    }

    /**
     * 清除某个实例的配置。实例被删除时调用，避免 id 复用后串味。
     *
     * @param context 任意 Context；为 `null` 时静默返回。
     * @param appWidgetId 被删除的实例 id。
     */
    @JvmStatic
    fun clear(context: Context?, appWidgetId: Int) {
        val appContext = context?.applicationContext ?: return

        scope.launch {
            try {
                WidgetStyleState.clear(appContext, appWidgetId)
            } catch (error: RuntimeException) {
                WidgetDiagnostics.styleWriteFailed()
            }
        }
    }
}
