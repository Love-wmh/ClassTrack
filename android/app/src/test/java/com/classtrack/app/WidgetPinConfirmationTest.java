package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * pin 确认回调的**判决**逻辑。
 *
 * <p>为什么必须单测：真机上这条链路无法反复重放（要用户的桌面确认，而且实测 OEM launcher 会静默吞掉请求），
 * 所以"这一次该不该写、写成什么"必须在这里钉死。
 */
public class WidgetPinConfirmationTest {

    @Test
    public void validIdAndPendingPresetProduceThatPresetsConfig() {
        WidgetStyleConfig config = WidgetPinConfirmation.planFor(42, WidgetPreset.parse("cell_4x3"));

        assertNotNull(config);
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, config.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, config.getWideLayout());
        // 预设没有表达过「已上完」策略，不该替用户决定 → 沿用默认值。
        assertEquals(WidgetStyleConfig.defaults().getFinishedPolicy(), config.getFinishedPolicy());
    }

    @Test
    public void compactPresetMapsToCompactStyle() {
        WidgetStyleConfig config = WidgetPinConfirmation.planFor(7, WidgetPreset.parse("cell_2x2"));

        assertNotNull(config);
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, config.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, config.getWideLayout());
    }

    /** 没有待消费预设（用户没选、或槽位超时）→ 不写：绝不替用户改样式。 */
    @Test
    public void noPendingPresetMeansNoWrite() {
        assertNull(WidgetPinConfirmation.planFor(42, null));
    }

    /** 非法实例 id → 不写（回调也可能被伪造/带脏值）。 */
    @Test
    public void invalidIdsAreRejected() {
        assertNull(WidgetPinConfirmation.planFor(-1, WidgetPreset.parse("cell_4x3")));
        assertNull(WidgetPinConfirmation.planFor(Integer.MIN_VALUE, WidgetPreset.parse("cell_4x3")));
    }
}
