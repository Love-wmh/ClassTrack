package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 「无回调复核命中」槽位的语义。
 *
 * <p>重点与 {@code WidgetPinResultTest} 同源：**一次性**（一次复核结论不能被读两次，否则面板会重复说
 * 「新增了一张」）与**超时**（陈旧命中会让之后打开的面板误显示「已添加」）。另外多钉一条：**非正数不记录**
 * ——它是「没有新实例」，不是一个有效结论。
 */
public class WidgetPinObservationTest {

    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void consumeIsOneShot() {
        WidgetPinObservation.record(1, NOW);

        assertEquals(1, WidgetPinObservation.consume(NOW));
        assertEquals("第二次必须是「没有结论」", 0, WidgetPinObservation.consume(NOW));
    }

    @Test
    public void staleObservationIsDiscarded() {
        WidgetPinObservation.record(2, NOW);

        assertEquals(0, WidgetPinObservation.consume(NOW + WidgetPinObservation.TIMEOUT_MS + 1));
    }

    @Test
    public void validRightUpToTheTimeout() {
        WidgetPinObservation.record(2, NOW);

        assertEquals(2, WidgetPinObservation.consume(NOW + WidgetPinObservation.TIMEOUT_MS));
    }

    /** `<= 0` 表示「差集没算出新实例」，不是一次命中。 */
    @Test
    public void nonPositiveCountsAreNotRecorded() {
        WidgetPinObservation.record(0, NOW);
        assertEquals(0, WidgetPinObservation.consume(NOW));

        WidgetPinObservation.record(-3, NOW);
        assertEquals(0, WidgetPinObservation.consume(NOW));
    }

    @Test
    public void clearDoesNotLeaveAnythingBehind() {
        WidgetPinObservation.record(1, NOW);
        WidgetPinObservation.clear();

        assertEquals(0, WidgetPinObservation.consume(NOW));
    }

    /** 多次命中取**最后一次**：同一次等待窗口里只应有一次结论。 */
    @Test
    public void laterRecordOverwritesEarlierOne() {
        WidgetPinObservation.record(1, NOW);
        WidgetPinObservation.record(3, NOW + 1000);

        assertEquals(3, WidgetPinObservation.consume(NOW + 1000));
        assertEquals(0, WidgetPinObservation.consume(NOW + 1000));
    }

    /** 诊断用的只读查询：不消费、超时后为 false。 */
    @Test
    public void hasFreshObservationIsReadOnlyAndExpires() {
        assertFalse(WidgetPinObservation.hasFreshObservation(NOW));

        WidgetPinObservation.record(1, NOW);
        assertTrue(WidgetPinObservation.hasFreshObservation(NOW));
        assertTrue("查询本身不消费", WidgetPinObservation.hasFreshObservation(NOW));
        assertEquals(1, WidgetPinObservation.consume(NOW));

        WidgetPinObservation.record(1, NOW);
        assertFalse(WidgetPinObservation.hasFreshObservation(NOW + WidgetPinObservation.TIMEOUT_MS + 1));
    }
}
