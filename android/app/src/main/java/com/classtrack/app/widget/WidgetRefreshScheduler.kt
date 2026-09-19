package com.classtrack.app.widget

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetDiagnostics
import java.util.concurrent.TimeUnit

/**
 * L4 精度层：用 WorkManager 的一次性任务把刷新对齐到下一个时间边界。
 *
 * 这是**没有精确闹钟授权时的默认路径**（L3 见 [WidgetBoundaryAlarms]）。WorkManager 的交付
 * 不精确：深 Doze 期间会被推到维护窗口；但渲染时总是用绝对 epoch 与当前时钟重新比较，
 * 所以「晚到」只会导致短暂仍显示上一节，不会算错。
 *
 * 刻意**不使用** PeriodicWorkRequest：周期兜底改由 `appwidget-provider` 的
 * `updatePeriodMillis`（L5）承担 —— 那条路径由系统闹钟投递，不依赖 WorkManager 自身的
 * 数据库与进程唤醒，更独立也更省电。
 */
internal object WidgetRefreshScheduler {
    /** 唯一工作名：同一次刷新只会保留一个待执行的边界任务。 */
    private const val BOUNDARY_WORK_NAME = "widget-boundary-refresh"

    /** 进程可能被杀时用的持久化兜底，与边界任务分开命名，避免互相 REPLACE。 */
    private const val IMMEDIATE_WORK_NAME = "widget-immediate-refresh"

    /**
     * 把下一次刷新排到 `state.nextBoundaryEpochMs`。
     *
     * @param context 任意 Context。
     * @param state 当前解析出的渲染状态；`nextBoundaryEpochMs` 为 null 时取消排程。
     * @param nowEpochMs 当前时刻。
     */
    fun scheduleNextBoundary(context: Context, state: WidgetDisplayState, nowEpochMs: Long) {
        val boundary = state.nextBoundaryEpochMs
        if (boundary == null) {
            cancelBoundary(context)
            return
        }

        // 已经过期的边界（例如设备刚从长时间休眠中醒来）按「立即执行」处理。
        val delayMs = (boundary - nowEpochMs).coerceAtLeast(0L)
        val request = OneTimeWorkRequestBuilder<WidgetRefreshWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .setInputData(workDataOf(WidgetRefreshWorker.KEY_TRIGGER to WidgetRefreshWorker.TRIGGER_BOUNDARY_WORK))
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(BOUNDARY_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    /**
     * 入队一次「尽快执行」的刷新。
     *
     * 用于插件落盘之后的持久化兜底：即使进程在渲染完成前被杀，WorkManager 仍会把这次刷新补上。
     *
     * @param context 任意 Context。
     */
    fun enqueueImmediate(context: Context) {
        val request = OneTimeWorkRequestBuilder<WidgetRefreshWorker>()
            .setInputData(workDataOf(WidgetRefreshWorker.KEY_TRIGGER to WidgetRefreshWorker.TRIGGER_WIDGET_UPDATE))
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    /**
     * 取消全部排程，用于最后一个 widget 实例被移除时避免空转。
     *
     * @param context 任意 Context。
     */
    fun cancelAll(context: Context) {
        val manager = WorkManager.getInstance(context)
        manager.cancelUniqueWork(BOUNDARY_WORK_NAME)
        manager.cancelUniqueWork(IMMEDIATE_WORK_NAME)
        WidgetDiagnostics.schedulingCancelled()
    }

    private fun cancelBoundary(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(BOUNDARY_WORK_NAME)
    }
}
