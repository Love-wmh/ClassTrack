package com.classtrack.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 快探针的判定规则。
 *
 * <p>为什么必须钉住：这条规则决定「用户点完按钮后多久看到失败提示」。判错两个方向都糟 ——
 * 误判（用户面前正弹着确认界面却说"系统没弹"）会让人以为功能坏了；漏判则退回"干等满超时"的旧体验。
 */
public class PinAttemptTest {

    private static final long REQUESTED_AT = 1_800_000_000_000L;

    /** 请求已过探测窗口、期间一直前台 = ColorOS 的失败现场 → 可以提前催促用户走手动步骤。 */
    @Test
    public void foregroundForLongEnoughMeansFailFast() {
        assertTrue(PinAttempt.shouldFailFast(REQUESTED_AT, REQUESTED_AT + PinAttempt.PROBE_DELAY_MS, 0L));
        assertTrue(PinAttempt.shouldFailFast(REQUESTED_AT, REQUESTED_AT + 5000L, 0L));
    }

    /** 还没到探测窗口：不许提前下结论（确认界面可能要 1 秒才起来）。 */
    @Test
    public void beforeTheProbeDelayItIsTooEarly() {
        assertFalse(PinAttempt.shouldFailFast(REQUESTED_AT, REQUESTED_AT, 0L));
        assertFalse(PinAttempt.shouldFailFast(REQUESTED_AT, REQUESTED_AT + PinAttempt.PROBE_DELAY_MS - 1L, 0L));
    }

    /** 期间退过后台 = 确认界面（或系统界面）确实出现过 → 等回调，绝不催用户。 */
    @Test
    public void backgroundedSinceTheRequestBlocksFailFast() {
        assertFalse(PinAttempt.shouldFailFast(REQUESTED_AT, REQUESTED_AT + 5000L, REQUESTED_AT + 100L));
        // 即使后台时刻晚于现在（时钟跳变）也一样：只要退过就不判。
        assertFalse(PinAttempt.shouldFailFast(REQUESTED_AT, REQUESTED_AT + 5000L, REQUESTED_AT + 6000L));
    }

    /** 没有进行中的请求 → 永远不判（否则面板一打开就可能显示「系统没有弹出确认界面」）。 */
    @Test
    public void noActiveAttemptNeverFailsFast() {
        assertFalse(PinAttempt.shouldFailFast(0L, REQUESTED_AT + 5000L, 0L));
        assertFalse(PinAttempt.shouldFailFast(-1L, REQUESTED_AT + 5000L, 0L));
    }

    /** 时钟被回拨（now < requested）→ 宁可不判，也不能误报。 */
    @Test
    public void clockGoingBackwardsNeverFailsFast() {
        assertFalse(PinAttempt.shouldFailFast(REQUESTED_AT + 5000L, REQUESTED_AT, 0L));
    }
}
