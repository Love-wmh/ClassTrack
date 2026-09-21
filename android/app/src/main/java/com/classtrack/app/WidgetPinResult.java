package com.classtrack.app;

/**
 * 「刚刚真的有一个小工具被放下」这个事实的一次性槽位（供 Web 侧轮询）。
 *
 * <p>为什么需要它：`requestPinAppWidget` 的返回值与真实结果无关（它只表示"请求已受理"）。唯一能知道
 * 「用户确认了、小工具真的放下了」的途径是 `successCallback` 回调，而回调发生在应用多半处于后台的时候。
 * 因此把确认结果先存在这里，等 Web 侧的面板轮询取走 —— 与 `consumePendingRoute` 同一套范式。
 *
 * <p>超时（{@link #TIMEOUT_MS}）是必须的：否则一次陈旧的确认会让**之后**打开的面板误显示"已添加"。
 *
 * <p>纯逻辑（只依赖传入的时刻），可被 JUnit 覆盖（见 {@code WidgetPinResultTest}）。
 */
public final class WidgetPinResult {

    /** 确认结果的保留时间：面板最多轮询 10 秒，1 分钟足够宽松又不会串到下一次操作。 */
    public static final long TIMEOUT_MS = 60 * 1000L;

    private static volatile int confirmedAppWidgetId = -1;
    private static volatile long confirmedAtMs;

    private WidgetPinResult() {
    }

    /**
     * 记录一次确认。
     *
     * @param appWidgetId 系统通过 `EXTRA_APPWIDGET_ID` 带回的新实例 id。
     * @param nowEpochMs 记录时刻。
     */
    public static synchronized void recordConfirmed(int appWidgetId, long nowEpochMs) {
        if (appWidgetId < 0) {
            return;
        }
        confirmedAppWidgetId = appWidgetId;
        confirmedAtMs = nowEpochMs;
    }

    /**
     * 读取并清空（一次性）。
     *
     * @param nowEpochMs 读取时刻。
     * @return 仍然有效的实例 id；没有、已取走或已超时返回 `-1`。
     */
    public static synchronized int consumeConfirmed(long nowEpochMs) {
        int id = confirmedAppWidgetId;
        long at = confirmedAtMs;
        confirmedAppWidgetId = -1;
        confirmedAtMs = 0L;
        if (id < 0 || nowEpochMs - at > TIMEOUT_MS) {
            return -1;
        }
        return id;
    }

    /**
     * **不消费**地查一次「确认回调是否已经到过」。
     *
     * <p>给「无回调复核」用（见 {@link WidgetPinObservation}）：复核只在**没有**确认回调时才该报「观察到
     * 卡片变多了」。这里必须只是查、不能取走 —— {@link #consumeConfirmed(long)} 会把结果交给 Web 面板，
     * 抢在面板之前取走就等于把「已添加」的权威信号弄丢了。
     *
     * @param nowEpochMs 查询时刻。
     * @return 是否有一个仍然有效的确认；不改变槽位状态。
     */
    public static synchronized boolean hasConfirmed(long nowEpochMs) {
        return confirmedAppWidgetId >= 0 && nowEpochMs - confirmedAtMs <= TIMEOUT_MS;
    }
}
