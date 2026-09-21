package com.classtrack.app;

/**
 * 「等待窗口结束时，桌面上**确实多出来**一张我们的卡片」这个事实的一次性槽位。
 *
 * <p><b>它为什么存在</b>：`requestPinAppWidget` 的第三个参数（PendingIntent）**成功才触发**，而华为/荣耀类
 * 桌面**根本不触发**它。只认回调的实现，在这些设备上会永远显示「未完成」——哪怕卡片已经躺在桌面上。
 * 这个槽位就是那条「没有回调也算数」的分支：等待窗口末尾用 {@link WidgetPinTargets#resolve} 跑一次差集，
 * 有新实例就把它记下来，让 Web 面板如实说「检测到桌面上新增了一张课表卡片」。
 *
 * <p><b>它只能说明「多了一张卡片」，不能说明是谁放的</b>：用户完全可能在同一时间自己从拾取器拖了一张。
 * 因此命中时的文案必须带限定句（「如果不是你刚添加的，请忽略」），而不是断言成功——这是刻意的取舍，
 * 换来的是「不发回调的厂商上不再误报失败」。
 *
 * <p><b>为什么只存数值</b>：槽位里只有命中时刻与新实例个数，不存 id、不存任何内容。沿用「状态与日志只含
 * 数值」的既有约束（见 {@link WidgetPinResult}）。
 *
 * <p><b>为什么要超时</b>：与 {@link WidgetPinResult} 同理——一次陈旧的命中会让**之后**打开的面板误显示
 * 「已添加」。5 分钟与 pin 基线同寿命。
 *
 * <p>纯逻辑（只依赖传入的时刻与计数），可被 JUnit 覆盖（见 {@code WidgetPinObservationTest}）。
 */
public final class WidgetPinObservation {

    /** 与 pin 基线同寿命：超过它这次复核就当作没发生过。 */
    public static final long TIMEOUT_MS = 5 * 60 * 1000L;

    private static volatile int freshCount;
    private static volatile long recordedAtMs;

    private WidgetPinObservation() {
    }

    /**
     * 记录一次复核命中。
     *
     * @param observedFreshCount 差集算出来的新实例个数；`<= 0` 视为「没命中」，不记录。
     * @param nowEpochMs 记录时刻。
     */
    public static synchronized void record(int observedFreshCount, long nowEpochMs) {
        if (observedFreshCount <= 0) {
            return;
        }
        freshCount = observedFreshCount;
        recordedAtMs = nowEpochMs;
    }

    /**
     * 读取并清空（一次性）。
     *
     * @param nowEpochMs 读取时刻。
     * @return 仍然有效的「新实例个数」；没有记录、已取走或已超时返回 `0`。
     */
    public static synchronized int consume(long nowEpochMs) {
        int count = freshCount;
        long at = recordedAtMs;
        clear();
        if (count <= 0 || nowEpochMs - at > TIMEOUT_MS) {
            return 0;
        }
        return count;
    }

    /** 丢弃复核结论（开始新的 pin 请求、或已经用确认回合作出判决时调用）。 */
    public static synchronized void clear() {
        freshCount = 0;
        recordedAtMs = 0L;
    }

    /** @return 是否有仍然有效的命中（不消费）。仅供诊断与单测使用。 */
    public static synchronized boolean hasFreshObservation(long nowEpochMs) {
        return freshCount > 0 && nowEpochMs - recordedAtMs <= TIMEOUT_MS;
    }
}
