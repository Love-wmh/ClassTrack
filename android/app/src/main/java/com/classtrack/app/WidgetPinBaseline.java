package com.classtrack.app;

/**
 * 发起「添加到桌面」请求**之前**该 provider 已有的实例 id 集合。
 *
 * <p>用途只有一个：回调带回的 id 不可信时（实测 AOSP Launcher3 发回 `0`），用"集合差集"找出用户刚放下的
 * 那个实例（见 {@link WidgetPinTargets}）。因此它必须与请求同时写入、且**只属于这一次请求**。
 *
 * <p>语义与 {@link WidgetPendingPreset} 一致：一次性 + 5 分钟超时。超时是必须的 —— 否则一次旧的请求基线
 * 会让**之后**的一次回调把某个碰巧新增的实例误判成本次结果。
 *
 * <p>纯逻辑（只依赖传入的时刻），可被 JUnit 覆盖（见 {@code WidgetPinBaselineTest}）。
 */
public final class WidgetPinBaseline {

    /** 与待消费预设同寿命：超过它这次 pin 请求就当作没发生过。 */
    public static final long TIMEOUT_MS = 5 * 60 * 1000L;

    private static volatile int[] appWidgetIds = new int[0];
    private static volatile boolean recorded;
    private static volatile long recordedAtMs;

    private WidgetPinBaseline() {
    }

    /**
     * 记录基线（覆盖上一次未消费的记录）。
     *
     * @param ids 当前实例 id 集合；`null` 视为空集合。空集合是**有效**记录（用户还没有任何实例），
     *     必须与「没记录过」区分开：前者可以安全做差集，后者不行。
     * @param nowEpochMs 记录时刻。
     */
    public static synchronized void record(int[] ids, long nowEpochMs) {
        appWidgetIds = ids == null ? new int[0] : ids.clone();
        recorded = true;
        recordedAtMs = nowEpochMs;
    }

    /**
     * 读取并清空（一次性）。
     *
     * @param nowEpochMs 读取时刻。
     * @return 仍然有效的实例 id 集合（可能是空集合）；**没有记录或已超时返回 `null`** ——
     *     调用方必须把 `null` 当作「不知道」而不是「没有实例」，否则差集会退化成「当前全集」，
     *     把预设写到用户所有旧卡片上。
     */
    public static synchronized int[] consume(long nowEpochMs) {
        int[] ids = appWidgetIds;
        boolean had = recorded;
        long at = recordedAtMs;
        clear();
        if (!had || nowEpochMs - at > TIMEOUT_MS) {
            return null;
        }
        return ids;
    }

    /** 丢弃基线（预设无效、系统不支持一键添加、或请求未被受理时调用）。 */
    public static synchronized void clear() {
        appWidgetIds = new int[0];
        recorded = false;
        recordedAtMs = 0L;
    }
}
