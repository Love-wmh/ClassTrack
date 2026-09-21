package com.classtrack.app;

/**
 * 本次「添加到桌面」尝试的两项可观测事实：**请求发出的时刻**与**我们有没有退到后台**。
 *
 * <p>判据的使用方是 {@link PinAttempt#shouldFailFast}：确认界面真的出现时会把我们挤到后台（AOSP 实测
 * `mCurrentFocus` 变成 launcher 的确认页、我们的 Activity 收到 `onPause`）；ColorOS 那种「起了界面却从不置前」
 * 的失败现场则一直把我们留在前台。两者合起来就能在约 2 秒内判定"确认界面不会来了"。
 *
 * <p>为什么放在一个类里：这两个时刻只在**同一次尝试**内才有意义，分开存必然出现"请求换了、后台记录还是旧的"
 * 这类错配。{@link #reset(long)} 是唯一的开始点，它同时钉住两者。
 *
 * <p>**只记时刻，不记内容**：符合「状态与日志只含数值」的既有约束。
 * 纯逻辑（只依赖传入的时刻），可被 JUnit 覆盖（见 {@code PinAttemptStateTest}）。
 */
public final class PinAttemptState {

    /** 没有进行中的尝试。 */
    private static volatile long requestedAtMs;
    private static volatile long backgroundedAtMs;

    private PinAttemptState() {
    }

    /**
     * 开始一次新的尝试：记下请求时刻并清掉上一次的后台记录。
     *
     * @param nowEpochMs 请求发出的时刻。
     */
    public static synchronized void reset(long nowEpochMs) {
        requestedAtMs = Math.max(0L, nowEpochMs);
        backgroundedAtMs = 0L;
    }

    /**
     * 记录「退到后台」。
     *
     * <p>保留**第一次**的时刻而不是最后一次：判定只关心"有没有退过"，第一次更接近「确认界面刚出现」的时刻。
     * 没有进行中的尝试时忽略（避免把与 pin 无关的后台切换算进来）。
     *
     * @param nowEpochMs 当前时刻。
     */
    public static synchronized void recordBackgrounded(long nowEpochMs) {
        if (requestedAtMs <= 0 || nowEpochMs <= 0 || backgroundedAtMs > 0) {
            return;
        }
        backgroundedAtMs = nowEpochMs;
    }

    /** @return 请求发出的时刻；`0` 表示当前没有进行中的尝试。 */
    public static long requestedAtMs() {
        return requestedAtMs;
    }

    /** @return 退到后台的时刻；`0` 表示本次尝试期间一直前台（或没有进行中的尝试）。 */
    public static long backgroundedAtMs() {
        return backgroundedAtMs;
    }

    /** 结束尝试（例如拿到确认回调之后）。 */
    public static synchronized void clear() {
        requestedAtMs = 0L;
        backgroundedAtMs = 0L;
    }
}
