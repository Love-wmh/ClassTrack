package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * 「待消费预设」槽位的语义：一次性、有超时、脏值不写入。
 *
 * <p>这三条直接对应 A8：从应用内添加 → 配置页预填 → 保存；再来一个实例时槽位必须已经空了，
 * 否则新实例会莫名其妙继承上一次的预设。
 */
public class WidgetPendingPresetTest {

    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void consumeIsOneShot() {
        WidgetPendingPreset.set(WidgetPreset.ID_TABLET_DUAL, NOW);

        WidgetPreset first = WidgetPendingPreset.consume(NOW);
        assertEquals(WidgetPreset.ID_TABLET_DUAL, first.getId());
        assertNull("第二次读必须为空，否则会影响下一个实例", WidgetPendingPreset.consume(NOW));
    }

    @Test
    public void expiredSlotIsDiscarded() {
        WidgetPendingPreset.set(WidgetPreset.ID_PHONE_STANDARD, NOW);

        assertNull(WidgetPendingPreset.consume(NOW + WidgetPendingPreset.TIMEOUT_MS + 1));
    }

    /** 刚好在有效期内不该被判成过期：边界两侧都要有断言。 */
    @Test
    public void slotIsValidRightUpToTheTimeout() {
        WidgetPendingPreset.set(WidgetPreset.ID_PHONE_STANDARD, NOW);

        assertEquals(WidgetPreset.ID_PHONE_STANDARD,
                WidgetPendingPreset.consume(NOW + WidgetPendingPreset.TIMEOUT_MS).getId());
    }

    @Test
    public void unknownIdNeverGetsStored() {
        WidgetPendingPreset.set("not_a_preset", NOW);

        assertNull(WidgetPendingPreset.consume(NOW));
    }

    /** 领取是**原子**的：连续两次 claim 只有第一次拿得到，因此预设不可能落到两个实例上。 */
    @Test
    public void claimIsAtomicAndOneShot() {
        WidgetPendingPreset.set(WidgetPreset.ID_TABLET_DUAL, NOW);

        assertEquals(WidgetPreset.ID_TABLET_DUAL, WidgetPendingPreset.claim().getId());
        assertNull(WidgetPendingPreset.claim());
    }

    /** peek 不消费：渲染侧要先把「实例是不是新的」判断完，才决定要不要领取。 */
    @Test
    public void peekDoesNotConsume() {
        WidgetPendingPreset.set(WidgetPreset.ID_TABLET_WIDE, NOW);

        assertEquals(WidgetPreset.ID_TABLET_WIDE, WidgetPendingPreset.peek(NOW).getId());
        assertEquals("peek 之后仍然可以被领取", WidgetPreset.ID_TABLET_WIDE, WidgetPendingPreset.claim().getId());
    }

    @Test
    public void clearDiscardsWithoutConsuming() {
        WidgetPendingPreset.set(WidgetPreset.ID_PHONE_MINIMAL, NOW);
        WidgetPendingPreset.clear();

        assertNull(WidgetPendingPreset.consume(NOW));
    }
}
