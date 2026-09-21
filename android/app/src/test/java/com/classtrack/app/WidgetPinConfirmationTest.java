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
 *
 * <p>2026-09-21 口径变更：写的是**该预设的样式**，不再是 `AUTO`。过去 `AUTO` 靠「按尺寸最近邻匹配」兜住
 * 样式，那条路径已删除 —— 若还写 `AUTO`，1×2 会被渲染成「接下来」，与卡片名字不符。
 */
public class WidgetPinConfirmationTest {

    @Test
    public void maintainedPresetsCarryTheirOwnStyle() {
        WidgetStyleConfig threeTwo = WidgetPinConfirmation.planFor(42, WidgetPreset.parse(WidgetPreset.ID_CELL_3X2));

        assertNotNull(threeTwo);
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, threeTwo.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, threeTwo.getWideLayout());
        // 预设没有表达过「已上完」策略，不该替用户决定 → 沿用默认值。
        assertEquals(WidgetStyleConfig.defaults().getFinishedPolicy(), threeTwo.getFinishedPolicy());

        WidgetStyleConfig oneTwo = WidgetPinConfirmation.planFor(7, WidgetPreset.parse(WidgetPreset.ID_CELL_1X2));
        assertNotNull(oneTwo);
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, oneTwo.getLayoutStyle());
    }

    /** 收起档的预设仍在白名单里（存量槽位/日志兼容），判决也必须给出它自己的样式而不是默认。 */
    @Test
    public void retiredPresetsStillResolveToTheirOwnStyle() {
        WidgetStyleConfig config = WidgetPinConfirmation.planFor(11, WidgetPreset.parse("cell_4x3"));

        assertNotNull(config);
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, config.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, config.getWideLayout());
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
