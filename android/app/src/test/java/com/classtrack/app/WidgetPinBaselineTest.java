package com.classtrack.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertNull;
import org.junit.Test;

/**
 * pin 请求基线（请求前已有实例集合）的语义。
 *
 * <p>两条都关键：**一次性**（一次请求的基线不能被下两次回调复用）、**超时**（否则一次旧请求的基线会让
 * 之后的一次回调把某个碰巧新增的实例误判成本次结果）。
 */
public class WidgetPinBaselineTest {

    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void consumeIsOneShot() {
        WidgetPinBaseline.record(new int[]{5, 7}, NOW);

        assertArrayEquals(new int[]{5, 7}, WidgetPinBaseline.consume(NOW));
        assertNull("第二次必须是「不知道」", WidgetPinBaseline.consume(NOW));
    }

    @Test
    public void staleBaselineIsDiscarded() {
        WidgetPinBaseline.record(new int[]{5}, NOW);

        assertNull(WidgetPinBaseline.consume(NOW + WidgetPinBaseline.TIMEOUT_MS + 1));
    }

    @Test
    public void validRightUpToTheTimeout() {
        WidgetPinBaseline.record(new int[]{5}, NOW);

        assertArrayEquals(new int[]{5}, WidgetPinBaseline.consume(NOW + WidgetPinBaseline.TIMEOUT_MS));
    }

    @Test
    public void clearDoesNotLeaveAnythingBehind() {
        WidgetPinBaseline.record(new int[]{5}, NOW);
        WidgetPinBaseline.clear();

        assertNull(WidgetPinBaseline.consume(NOW));
    }

    /** 空集合是**有效**记录（用户还没有任何实例），必须能被读出并与「没记录过」区分开。 */
    @Test
    public void emptyBaselineIsStillAValidRecord() {
        WidgetPinBaseline.record(new int[0], NOW);

        assertArrayEquals(new int[0], WidgetPinBaseline.consume(NOW));
    }

    /** 没记录过 / 已超时 → `null`（= 不知道），而不是空集合。 */
    @Test
    public void missingRecordIsReportedAsNullNotAsEmpty() {
        assertNull(WidgetPinBaseline.consume(NOW));
        WidgetPinBaseline.record(new int[]{5}, NOW);
        WidgetPinBaseline.consume(NOW);
        assertNull("取走之后必须变成「不知道」", WidgetPinBaseline.consume(NOW));
    }

    @Test
    public void nullIdsAreTreatedAsEmpty() {
        WidgetPinBaseline.record(null, NOW);

        assertArrayEquals(new int[0], WidgetPinBaseline.consume(NOW));
    }
}
