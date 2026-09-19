package com.classtrack.app.widget

import android.content.Context
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetSnapshotParser
import com.classtrack.app.WidgetSnapshotStore
import androidx.glance.appwidget.updateAll
import com.classtrack.app.WidgetStateResolver

/**
 * 所有刷新路径的**唯一收敛点**：读快照 → 重算状态 → 重排下一次触发（+ 按需重新渲染）。
 *
 * L1（插件推送）、L2（跨零点/改时间/换时区）、L3（精确闹钟）、L4（WorkManager 边界任务）、
 * L5（系统 30 分钟广播）都调用这里，因此整条链是幂等的：谁先到、到了几次都不影响结果，
 * 也不存在「两套逻辑各算一遍」的分叉风险。
 */
internal object WidgetRefreshController {
    /**
     * 按给定时刻解析当前应该显示什么。
     *
     * @param context 任意 Context。
     * @param nowEpochMs 当前时刻；由调用方显式传入，便于把「渲染」与「排程」用同一个 now。
     * @return 渲染状态，永不为 null。
     */
    fun resolveCurrentState(context: Context, nowEpochMs: Long): WidgetDisplayState {
        val snapshotJson = WidgetSnapshotStore.read(context)
        return WidgetStateResolver.resolve(WidgetSnapshotParser.parse(snapshotJson), nowEpochMs)
    }

    /**
     * 完整刷新：重新渲染 widget，并重排 L3 与 L4 两层的下一次触发。
     *
     * @param context 任意 Context。
     * @param trigger 触发来源，仅用于诊断日志（必须是固定枚举值）。
     */
    suspend fun refresh(context: Context, trigger: String) {
        val nowEpochMs = System.currentTimeMillis()
        // 先解析一次：渲染与排程必须基于同一个 now，否则两次 System.currentTimeMillis()
        // 之间的偏差会让边界与画面错开一帧。
        val state = resolveCurrentState(context, nowEpochMs)
        renderAll(context)
        reschedule(context, state, nowEpochMs)
        WidgetDiagnostics.refreshRequested(trigger)
    }

    /**
     * 只重排下一次触发，不重新渲染。
     *
     * 供 `ClassTrackWidgetReceiver.onUpdate` 使用：Glance 自己已经会重新执行 `provideGlance`
     * 完成渲染，这里只需把边界链续上，避免同一次广播里渲染两遍。
     *
     * @param context 任意 Context。
     * @param trigger 触发来源，仅用于诊断日志。
     */
    suspend fun rescheduleOnly(context: Context, trigger: String) {
        val nowEpochMs = System.currentTimeMillis()
        val state = resolveCurrentState(context, nowEpochMs)
        reschedule(context, state, nowEpochMs)
        WidgetDiagnostics.refreshRequested(trigger)
    }

    private fun reschedule(context: Context, state: WidgetDisplayState, nowEpochMs: Long) {
        WidgetBoundaryAlarms.armNextBoundary(context, state, nowEpochMs)
        WidgetRefreshScheduler.scheduleNextBoundary(context, state, nowEpochMs)
    }

    /**
     * 重新渲染全部 widget 实例。
     *
     * `updateAll` 会让 Glance 重新执行 `provideGlance`，由它自己再读一次快照并按当时的时钟渲染，
     * 因此这里不需要把 state 传进渲染层。
     *
     * @param context 任意 Context。
     */
    private suspend fun renderAll(context: Context) {
        try {
            ClassTrackWidget().updateAll(context)
        } catch (error: RuntimeException) {
            // 渲染失败不该让调用方（可能是广播接收器）崩溃；下一次排程仍会重试。
            WidgetDiagnostics.refreshFailed()
        }
    }
}
