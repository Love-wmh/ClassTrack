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

    /**
     * `peek` 不消费、`consume` 才消费。
     *
     * <p>确认回调里必须先 peek（拿到要写的预设）、写成功之后再 consume —— 写失败时槽位要留着，
     * 用户下次手动放置仍能拿到这个预设。
     */
    @Test
    public void peekDoesNotConsumeButConsumeDoes() {
        WidgetPendingPreset.set(WidgetPreset.ID_TABLET_WIDE, NOW);

        assertEquals(WidgetPreset.ID_TABLET_WIDE, WidgetPendingPreset.peek(NOW).getId());
        assertEquals(WidgetPreset.ID_TABLET_WIDE, WidgetPendingPreset.peek(NOW).getId());
        WidgetPendingPreset.consume();
        assertNull("consume 之后必须为空", WidgetPendingPreset.peek(NOW));
    }

    @Test
    public void clearDiscardsWithoutConsuming() {
        WidgetPendingPreset.set(WidgetPreset.ID_PHONE_MINIMAL, NOW);
        WidgetPendingPreset.clear();

        assertNull(WidgetPendingPreset.consume(NOW));
    }
}
