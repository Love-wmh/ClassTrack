package com.classtrack.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 小工具的宿主接收器。
 *
 * `exported="true"` 是 AppWidget 框架的硬要求：小工具宿主（launcher / 系统）需要能向我们投递
 * `ACTION_APPWIDGET_UPDATE`。它只读取本应用的私有偏好并更新自己的 widget，**不接受任何外部
 * 输入数据**，因此导出本身不构成数据暴露面；待跳转路由也是白名单校验过的（见 `WidgetPendingRoute`）。
 */
class ClassTrackWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ClassTrackWidget()

    /**
     * 系统在 widget 被添加、尺寸变化以及 `updatePeriodMillis` 到期时都会走到这里 —— 也就是 L5。
     *
     * `super.onUpdate` 已经会让 Glance 重新执行 `provideGlance` 完成渲染，所以这里只需要把
     * 边界链续上（`rescheduleOnly`），不必再渲染一遍。
     */
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        runInBackground(context) { WidgetRefreshController.rescheduleOnly(it, WidgetRefreshWorker.TRIGGER_WIDGET_UPDATE) }
    }

    /** 第一个实例被添加：开始维护边界链。 */
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        runInBackground(context) { WidgetRefreshController.rescheduleOnly(it, WidgetRefreshWorker.TRIGGER_WIDGET_UPDATE) }
    }

    /** 最后一个实例被移除：取消排程，避免没有 widget 时仍空转。 */
    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetRefreshScheduler.cancelAll(context)
        WidgetBoundaryAlarms.cancel(context)
    }

    /**
     * `onUpdate`/`onEnabled` 都运行在主线程的广播回调里，必须在数秒内返回；
     * 用 `goAsync` 把重算挪到后台线程完成。
     *
     * @param context 回调拿到的 Context。
     * @param block 需要在后台执行的重排逻辑。
     */
    private fun runInBackground(context: Context, block: suspend (Context) -> Unit) {
        val pending = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                block(appContext)
            } finally {
                pending.finish()
            }
        }
    }

    /** 尺寸变化时也刷新一次选项，保证响应式布局能按新高度重排。 */
    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        runInBackground(context) { WidgetRefreshController.rescheduleOnly(it, WidgetRefreshWorker.TRIGGER_WIDGET_UPDATE) }
    }
}
