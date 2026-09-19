package com.classtrack.app.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState

/**
 * L3 精度层：把下一次切换排成**精确闹钟**，使课程开始/结束时即使设备处于深度休眠也按点触发。
 *
 * 代价是需要在系统设置里授予「闹钟与提醒」（`SCHEDULE_EXACT_ALARM`，Android 14+ 默认拒绝），
 * 因此这一层是**用户可选的增强**：未授权时静默回退到 WorkManager（L4）+ 系统 30 分钟兜底（L5），
 * 功能完整可用，只是精度降级。任何情况下都不会因此崩溃或弹错误。
 *
 * 已知限制（见 design-appendix D12）：精确闹钟不随重启保留，且我们刻意不申请
 * `RECEIVE_BOOT_COMPLETED`；开机后需要等应用被打开或首次系统广播来重新武装。
 */
internal object WidgetBoundaryAlarms {
    /** 固定请求码：全应用同一时刻只保留一个边界闹钟。 */
    private const val REQUEST_CODE = 4711

    /**
     * 判断当前是否具备精确闹钟能力。
     *
     * @param context 任意 Context。
     * @return API 31 以下恒为 true（该权限从 Android 12 才存在）；以上取决于用户授权。
     */
    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(AlarmManager::class.java) ?: return false
        return manager.canScheduleExactAlarms()
    }

    /**
     * 武装下一个边界；不具备精确能力或没有边界时取消已有闹钟。
     *
     * @param context 任意 Context。
     * @param state 当前渲染状态。
     * @param nowEpochMs 当前时刻，用于识别已经过期的边界。
     */
    fun armNextBoundary(context: Context, state: WidgetDisplayState, nowEpochMs: Long) {
        val boundary = state.nextBoundaryEpochMs
        if (boundary == null || !canScheduleExact(context)) {
            cancel(context)
            return
        }

        val manager = context.getSystemService(AlarmManager::class.java) ?: return
        try {
            // 先取消同一个 PendingIntent，保证同一时刻只有一个边界闹钟。
            manager.cancel(pendingIntent(context))
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, boundary.coerceAtLeast(nowEpochMs), pendingIntent(context))
        } catch (error: SecurityException) {
            // 授权可能在 canScheduleExact 与这里之间被撤销；静默回退到 L4，不得崩溃。
            WidgetDiagnostics.exactAlarmUnavailable("revoked")
            cancel(context)
        }
    }

    /**
     * 取消边界闹钟，用于 widget 实例全部移除或授权被撤销时。
     *
     * @param context 任意 Context。
     */
    fun cancel(context: Context) {
        val manager = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = pendingIntent(context)
        manager.cancel(intent)
        intent.cancel()
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, WidgetBoundaryAlarmReceiver::class.java)
            .setAction(WidgetBoundaryAlarmReceiver.ACTION_BOUNDARY_ALARM)
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
