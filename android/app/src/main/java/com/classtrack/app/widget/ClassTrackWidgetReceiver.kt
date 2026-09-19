package com.classtrack.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * 小工具的宿主接收器。
 *
 * `exported="true"` 是 AppWidget 框架的硬要求：小工具宿主（launcher / 系统）需要能向我们投递
 * `ACTION_APPWIDGET_UPDATE`。它只读取本应用的私有偏好并更新自己的 widget，**不接受任何外部
 * 输入数据**，因此导出本身不构成数据暴露面；待跳转路由也是白名单校验过的（见 `WidgetPendingRoute`）。
 *
 * 这里**刻意不使用 `goAsync()` + 协程**：
 * 1. `goAsync()` 在这些回调里并不总是可用，实测会在真机上返回 `null`，
 *    随后 `pending.finish()` 抛 NPE 并把整个进程干掉 —— 而进程在更新途中被杀，
 *    正是桌面小工具反复显示空白（只剩 initialLayout）的真实原因；
 * 2. 这几个回调只需要「把边界链续上」，交给持久化的 WorkManager 更简单、更可靠，
 *    也不需要接收器在数秒内自行完成工作。
 *
 * 真正需要即时完成的重算（L2 跨零点/改时间、L3 精确闹钟）由各自的 `onReceive` 负责，
 * 那里 `goAsync()` 是合法的，且已做判空。
 */
class ClassTrackWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ClassTrackWidget()

    /**
     * 系统在 widget 被添加、尺寸变化以及 `updatePeriodMillis` 到期时都会走到这里 —— 也就是 L5。
     *
     * `super.onUpdate` 已经会让 Glance 重新执行 `provideGlance` 完成渲染，所以这里只需要
     * 入队一次幂等刷新来续上边界链，不必自己渲染一遍。
     */
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetRefreshScheduler.enqueueImmediate(context.applicationContext)
    }

    /** 第一个实例被添加：开始维护边界链。 */
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetRefreshScheduler.enqueueImmediate(context.applicationContext)
    }

    /** 最后一个实例被移除：取消排程，避免没有 widget 时仍空转。 */
    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetRefreshScheduler.cancelAll(context.applicationContext)
        WidgetBoundaryAlarms.cancel(context.applicationContext)
    }

    /** 尺寸变化时也续一次边界链，保证响应式布局能按新高度重排。 */
    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        WidgetRefreshScheduler.enqueueImmediate(context.applicationContext)
    }
}
