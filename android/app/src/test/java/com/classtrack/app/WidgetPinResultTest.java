package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 「刚刚真的放下了一个小工具」这个一次性槽位的语义。
 *
 * <p>它决定 Web 侧面板能不能显示"已添加"，因此两条都关键：**一次性**（否则下一个面板会误显示成功）
 * 与**超时**（否则一次陈旧的成功会一直留着）。
 */
public class WidgetPinResultTest {

    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void consumeIsOneShot() {
        WidgetPinResult.recordConfirmed(12, NOW);

        assertEquals(12, WidgetPinResult.consumeConfirmed(NOW));
        assertEquals("第二次必须为空", -1, WidgetPinResult.consumeConfirmed(NOW));
    }

    @Test
    public void staleConfirmationIsDiscarded() {
        WidgetPinResult.recordConfirmed(12, NOW);

        assertEquals(-1, WidgetPinResult.consumeConfirmed(NOW + WidgetPinResult.TIMEOUT_MS + 1));
    }

    @Test
    public void validRightUpToTheTimeout() {
        WidgetPinResult.recordConfirmed(9, NOW);

        assertEquals(9, WidgetPinResult.consumeConfirmed(NOW + WidgetPinResult.TIMEOUT_MS));
    }

    /** 非法 id 不该被记下来（回调可能带脏值）。 */
    @Test
    public void invalidIdsAreNotRecorded() {
        WidgetPinResult.recordConfirmed(-1, NOW);

        assertEquals(-1, WidgetPinResult.consumeConfirmed(NOW));
    }

    /** 没有确认时读取必须返回"没有"，让面板如实显示"系统没有完成添加"。 */
    @Test
    public void nothingRecordedMeansNoConfirmation() {
        assertEquals(-1, WidgetPinResult.consumeConfirmed(NOW));
        assertFalse(WidgetPinResult.consumeConfirmed(NOW) >= 0);
        assertTrue(WidgetPinResult.TIMEOUT_MS > 0);
    }

    // ---- hasConfirmed：给「无回调复核」用的只读查询（见 WidgetPinObservation） ----

    /**
     * 复核必须先问「回调到了吗」，但**不能把回调取走** —— 取走就等于把「已添加」的权威信号弄丢了。
     */
    @Test
    public void hasConfirmedIsReadOnly() {
        WidgetPinResult.recordConfirmed(12, NOW);

        assertTrue(WidgetPinResult.hasConfirmed(NOW));
        assertTrue("查询本身不得消费", WidgetPinResult.hasConfirmed(NOW));
        assertEquals("回调仍要能交给面板", 12, WidgetPinResult.consumeConfirmed(NOW));
        assertFalse(WidgetPinResult.hasConfirmed(NOW));
    }

    @Test
    public void hasConfirmedIsFalseWhenNothingRecorded() {
        assertFalse(WidgetPinResult.hasConfirmed(NOW));
    }

    @Test
    public void hasConfirmedExpiresOnTheSameTimeout() {
        WidgetPinResult.recordConfirmed(12, NOW);

        assertTrue(WidgetPinResult.hasConfirmed(NOW + WidgetPinResult.TIMEOUT_MS));
        assertFalse(WidgetPinResult.hasConfirmed(NOW + WidgetPinResult.TIMEOUT_MS + 1));
    }

    /** 被取走之后不得再被「查到」，否则复核会在面板已经拿到结果后再报一次「观察到」。 */
    @Test
    public void consumedConfirmationIsNoLongerVisible() {
        WidgetPinResult.recordConfirmed(12, NOW);
        WidgetPinResult.consumeConfirmed(NOW);

        assertFalse(WidgetPinResult.hasConfirmed(NOW));
    }
}
