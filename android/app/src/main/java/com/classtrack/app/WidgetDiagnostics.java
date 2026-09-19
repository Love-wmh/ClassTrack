package com.classtrack.app;

import android.util.Log;

/**
 * 小工具的诊断日志。
 *
 * 与 {@link CourseImportDiagnostics} 同一约定：固定 tag、只输出阶段/字节数/固定枚举值，
 * **绝不输出课程名、教室、时间或快照正文**。
 */
public final class WidgetDiagnostics {
    static final String TAG = "ClassTrack.Widget";

    private WidgetDiagnostics() {}

    public static void snapshotRejected(String phase, int byteLength) {
        Log.w(TAG, "phase=" + phase + " bytes=" + Math.max(0, byteLength));
    }

    public static void snapshotStored(int byteLength) {
        Log.i(TAG, "phase=snapshot_stored bytes=" + Math.max(0, byteLength));
    }

    public static void refreshRequested(String trigger) {
        Log.i(TAG, "phase=refresh_requested trigger=" + safeCategory(trigger));
    }

    public static void snapshotUnavailable(String reason) {
        Log.w(TAG, "phase=snapshot_unavailable reason=" + safeCategory(reason));
    }

    public static void exactAlarmUnavailable(String reason) {
        Log.i(TAG, "phase=exact_alarm_unavailable reason=" + safeCategory(reason));
    }

    public static void schedulingCancelled() {
        Log.i(TAG, "phase=scheduling_cancelled");
    }

    public static void refreshFailed() {
        Log.w(TAG, "phase=refresh_failed");
    }

    /**
     * 只允许白名单内的固定枚举值进入日志。
     *
     * 调用点传的都是编译期字面量，这里再加一层白名单，避免以后有人顺手把带业务内容的
     * 字符串传进来，从而破坏「日志不含课程载荷」的约束。
     *
     * @param value 候选枚举值。
     * @return 白名单内的值；否则返回 `unknown`。
     */
    private static String safeCategory(String value) {
        switch (value == null ? "" : value) {
            case "plugin_push":
            case "boundary_alarm":
            case "boundary_work":
            case "time_change":
            case "widget_update":
            case "revoked":
            case "unsupported":
            case "empty":
            case "invalid":
            case "read_failed":
                return value;
            default:
                return "unknown";
        }
    }
}
