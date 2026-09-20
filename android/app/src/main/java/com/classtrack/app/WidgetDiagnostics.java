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

    public static void compositionFailed(int errorCode, Throwable throwable) {
        Log.e(TAG, "phase=composition_failed code=" + errorCode + " type=" + (throwable == null ? "none" : throwable.getClass().getSimpleName()));
    }

    /**
     * 记录一次样式保存成功。
     *
     * 只输出白名单内的样式枚举值，不含任何课程内容。
     *
     * @param layoutStyle 样式存储值。
     * @param finishedPolicy 已上完策略存储值。
     */
    public static void styleConfigured(String layoutStyle, String finishedPolicy, String wideLayout) {
        Log.i(TAG, "phase=style_configured style=" + safeStyle(layoutStyle) + " finished=" + safeFinishedPolicy(finishedPolicy)
                + " wide=" + safeWideLayout(wideLayout));
    }

    /**
     * 记录一次渲染用到的排版度量。
     *
     * <p>`scale` 是「度量相对基准放大到几成」，以百分数整数表示（131 = 1.31 倍），`dual` 表示这一帧
     * 是否真的分了栏 —— 「选了双栏但没分栏」有两种完全不同的原因（尺寸不够 / 渲染坏了），这条日志
     * 让它们在 logcat 里就能分开，不必猜。
     *
     * <p>与其它诊断一样：只有数值与白名单枚举，不含任何课程内容。
     *
     * @param scalePercent 缩放百分比（100 表示与基准一致）。
     * @param wideLayout 「大格子表现」存储值。
     * @param dual 这一帧是否分了两栏。
     */
    public static void layoutMetrics(int scalePercent, String wideLayout, boolean dual) {
        Log.i(TAG, "phase=layout_metrics scale=" + Math.max(0, scalePercent) + " wide=" + safeWideLayout(wideLayout)
                + " dual=" + dual);
    }

    /**
     * 记录一次渲染入口读到的状态（只记类型与计数，**不记任何课程内容**）。
     *
     * 这条日志是排查「推送成功但画面没变」的关键：它把「快照有没有读到」与「读到了但界面没更新」
     * 两类问题区分开，避免只能靠猜。
     *
     * @param byteLength 读到的快照 JSON 长度；0 表示没有快照。
     */
    public static void snapshotRead(int byteLength) {
        Log.i(TAG, "phase=snapshot_read bytes=" + Math.max(0, byteLength));
    }

    /**
     * 记录一次 widget 渲染的结果。
     *
     * @param type 状态类型枚举。
     * @param todayItems 今日课表行数。
     * @param heroState hero 状态枚举，可为 `null`。
     */
    public static void widgetRendered(String type, int todayItems, String heroState) {
        Log.i(TAG, "phase=widget_rendered type=" + safeStateType(type) + " today=" + Math.max(0, todayItems)
                + " hero=" + safeHeroState(heroState));
    }

    /**
     * 记录一次真实合成拿到的格子尺寸。
     *
     * 「配置页预览和桌面上不一样」这类问题只能靠尺寸对齐：`SizeMode.Exact` 下这里打的就是真实格子
     * 大小，配置页预览的 `phase=preview_sized` 应当与它一致（会差一点 launcher 自己的内缩）。
     * 只记尺寸，不含任何课程内容。
     *
     * @param widthDp 实际渲染宽度（dp）。
     * @param heightDp 实际渲染高度（dp）。
     */
    public static void widgetSized(int widthDp, int heightDp) {
        Log.i(TAG, "phase=widget_sized w=" + Math.max(0, widthDp) + " h=" + Math.max(0, heightDp));
    }

    /**
     * 记录一次渲染请求命中了多少个 widget 实例。
     *
     * 「刷新了但画面没变」有两种完全不同的原因：没有实例可刷（count=0），或实例拿到了新快照却
     * 没重新执行渲染。这条日志把它们区分开。
     *
     * @param count 命中的实例数。
     */
    public static void renderTargets(int count) {
        Log.i(TAG, "phase=render_targets count=" + Math.max(0, count));
    }

    public static void styleWriteFailed() {
        Log.w(TAG, "phase=style_write_failed");
    }

    public static void styleReadFailed() {
        Log.w(TAG, "phase=style_read_failed");
    }

    /**
     * 配置页的样式预览渲染失败。
     *
     * 预览失败只影响配置页少一张示意图，不影响样式是否保存，因此按警告记录、不带任何异常细节。
     */
    public static void previewFailed() {
        Log.w(TAG, "phase=preview_failed");
    }

    /**
     * 记录配置页预览用的尺寸。
     *
     * 预览与真实小工具必须画在同一个尺寸上，否则预览就是在撒谎。这条日志与 `phase=widget_sized`
     * 应当只差一点 launcher 自己的内缩（真实卡片会比实例选项报告的格子略小）。
     *
     * @param widthDp 预览画布宽度（dp）。
     * @param heightDp 预览画布高度（dp）。
     */
    public static void previewSized(int widthDp, int heightDp) {
        Log.i(TAG, "phase=preview_sized w=" + Math.max(0, widthDp) + " h=" + Math.max(0, heightDp));
    }

    /**
     * 配置页拒绝了非法的 widgetId。
     *
     * 该 Activity 是导出的，任何应用都能拉起它，因此拒绝路径必须留痕，且只记原因分类。
     *
     * @param reason 拒绝原因。
     */
    public static void configRejected(String reason) {
        Log.w(TAG, "phase=config_rejected reason=" + safeCategory(reason));
    }

    /**
     * 与 {@link #safeCategory} 同理：样式值只允许白名单内的固定枚举进入日志。
     *
     * @param value 候选样式值。
     * @return 白名单内的值；否则返回 `unknown`。
     */
    private static String safeStyle(String value) {
        switch (value == null ? "" : value) {
            case "day_list":
            case "next_up":
            case "compact":
                return value;
            default:
                return "unknown";
        }
    }

    /**
     * 与 {@link #safeCategory} 同理：策略值只允许白名单内的固定枚举进入日志。
     *
     * @param value 候选策略值。
     * @return 白名单内的值；否则返回 `unknown`。
     */
    private static String safeFinishedPolicy(String value) {
        switch (value == null ? "" : value) {
            case "show_dim":
            case "hide":
            case "collapse":
                return value;
            default:
                return "unknown";
        }
    }

    /**
     * 与 {@link #safeStyle} 同理：「大格子表现」值只允许白名单内的固定枚举进入日志。
     *
     * @param value 候选表现值。
     * @return 白名单内的值；否则返回 `unknown`。
     */
    private static String safeWideLayout(String value) {
        switch (value == null ? "" : value) {
            case "adaptive":
            case "dense":
            case "two_column":
                return value;
            default:
                return "unknown";
        }
    }

    /**
     * 与 {@link #safeCategory} 同理：状态类型只允许白名单内的固定枚举进入日志。
     *
     * @param value 候选状态类型。
     * @return 白名单内的值；否则返回 `unknown`。
     */
    private static String safeStateType(String value) {
        switch (value == null ? "" : value) {
            case "MISSING":
            case "UNAVAILABLE":
            case "EMPTY":
            case "STALE":
            case "NO_UPCOMING":
            case "READY":
                return value;
            default:
                return "unknown";
        }
    }

    /**
     * 与 {@link #safeCategory} 同理：hero 状态只允许白名单内的固定枚举进入日志。
     *
     * @param value 候选 hero 状态，可为 `null`。
     * @return 白名单内的值；否则返回 `none`。
     */
    private static String safeHeroState(String value) {
        switch (value == null ? "" : value) {
            case "IN_PROGRESS":
            case "UPCOMING":
            case "UPCOMING_OTHER_DAY":
                return value;
            default:
                return "none";
        }
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
            case "invalid_widget_id":
            case "cancelled":
                return value;
            default:
                return "unknown";
        }
    }
}
