package com.classtrack.app.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * L4 的边界刷新任务，同时也是 L1 的持久化兜底。
 *
 * 它只做一件事：调用 [WidgetRefreshController.refresh]，因此与精确闹钟、系统广播走的是
 * 同一条幂等通路。任务失败也不需要重试策略 —— 下一次边界排程会自然覆盖它。
 */
class WidgetRefreshWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val trigger = inputData.getString(KEY_TRIGGER) ?: TRIGGER_BOUNDARY_WORK
        WidgetRefreshController.refresh(applicationContext, trigger)
        return Result.success()
    }

    companion object {
        /** 输入数据的键名，用于把触发来源带进诊断日志。 */
        const val KEY_TRIGGER = "trigger"

        /** 由边界一次性任务触发。 */
        const val TRIGGER_BOUNDARY_WORK = "boundary_work"

        /** 系统 `updatePeriodMillis` 广播或 widget 增删时触发。 */
        const val TRIGGER_WIDGET_UPDATE = "widget_update"
    }
}
