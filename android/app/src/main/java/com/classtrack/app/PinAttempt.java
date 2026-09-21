package com.classtrack.app;

/**
 * 「请求已发出、但几乎可以确定系统没有弹出确认界面」的判定。
 *
 * <p>**为什么需要它**：真机（PKR110 / ColorOS / Android 16）实测，`requestPinAppWidget` 会让 launcher 启动
 * `AddItemActivity`（action `CONFIRM_PIN_APPWIDGET`），但它**从不置前**，于是既没有确认界面、也没有确认回调
 * —— 用户点了按钮之后要干等满超时才被告知失败。这个判定把"白等"压到 2 秒。
 *
 * <p>判据来自两个现场的差异：确认界面**真的出现时**会把我们挤到后台（AOSP 模拟器实测：`mCurrentFocus`
 * 变成 launcher 的 `QuickstepAddItemActivity`，我们的 Activity 收到 `onPause`）；而 ColorOS 的失败现场里
 * 我们的 Activity **一直是前台**。因此在应用内用 `onPause` 就能区分，不需要任何权限、也不读系统窗口状态。
 *
 * <p>**这是推断而不是事实**，所以调用方必须：只把它当"催促用户看手动步骤"的信号，
 * 继续等确认回调（回调到了就翻成成功）。文案也要写成「系统没有弹出确认界面」而不是断言失败。
 *
 * <p>纯函数（只依赖传入的时刻），可被 JUnit 覆盖（见 {@code PinAttemptTest}）。
 */
public final class PinAttempt {

    /** 探测窗口：请求发出后多久还没退过后台，就认为确认界面不会来了。 */
    public static final long PROBE_DELAY_MS = 2000L;

    private PinAttempt() {
    }

    /**
     * 是否已经可以判定「系统没有弹出确认界面」。
     *
     * @param requestedAtMs 请求发出的时刻（原生侧在发起 pin 时记录）。
     * @param nowMs 当前时刻。
     * @param backgroundedAtMs 请求期间**最后一次**退到后台的时刻；`0`（或任何表示"没退过"的值）表示没退过。
     * @return true 表示可以催促用户走手动步骤（**不表示请求已失败**，回调仍可能到达）。
     */
    public static boolean shouldFailFast(long requestedAtMs, long nowMs, long backgroundedAtMs) {
        if (requestedAtMs <= 0 || nowMs < requestedAtMs) {
            // 没请求过，或时钟被回拨：宁可不判，也不能误报（用户会以为功能坏了）。
            return false;
        }
        if (backgroundedAtMs > 0) {
            // 退过后台 = 确认界面（或别的系统界面）出现过。它可能还在、也可能被误取消，
            // 但两种情况下等回调都比催用户更正确。
            return false;
        }
        return nowMs - requestedAtMs >= PROBE_DELAY_MS;
    }
}
