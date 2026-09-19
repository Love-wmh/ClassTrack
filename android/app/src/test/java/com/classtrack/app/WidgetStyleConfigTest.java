package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * {@link WidgetStyleConfig} 的解析与回退行为。
 *
 * 这些配置来自配置页写入的 Glance 状态，是外部输入，因此「脏值不炸、回退默认」必须被断言覆盖，
 * 而不是靠实现里「看起来写了 if」来判断。
 */
public class WidgetStyleConfigTest {
    @Test
    public void defaultsAreDayListWithDimmedFinishedClasses() {
        WidgetStyleConfig config = WidgetStyleConfig.defaults();

        assertEquals(WidgetStyleConfig.LayoutStyle.DAY_LIST, config.getLayoutStyle());
        assertEquals(WidgetStyleConfig.FinishedPolicy.SHOW_DIM, config.getFinishedPolicy());
    }

    @Test
    public void parseReadsEveryValidCombination() {
        assertEquals(WidgetStyleConfig.LayoutStyle.DAY_LIST, WidgetStyleConfig.parse("day_list", "show_dim").getLayoutStyle());
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, WidgetStyleConfig.parse("next_up", "hide").getLayoutStyle());
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, WidgetStyleConfig.parse("compact", "collapse").getLayoutStyle());
        assertEquals(WidgetStyleConfig.FinishedPolicy.HIDE, WidgetStyleConfig.parse("next_up", "hide").getFinishedPolicy());
        assertEquals(WidgetStyleConfig.FinishedPolicy.COLLAPSE, WidgetStyleConfig.parse("compact", "collapse").getFinishedPolicy());
    }

    @Test
    public void parseIsTolerantOfCaseAndSurroundingWhitespace() {
        WidgetStyleConfig config = WidgetStyleConfig.parse("  NEXT_UP ", "\tCollapse\n");

        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, config.getLayoutStyle());
        assertEquals(WidgetStyleConfig.FinishedPolicy.COLLAPSE, config.getFinishedPolicy());
    }

    @Test
    public void unknownOrMissingValuesFallBackToDefaultsInsteadOfThrowing() {
        assertEquals(WidgetStyleConfig.defaults().getLayoutStyle(), WidgetStyleConfig.parse(null, null).getLayoutStyle());
        assertEquals(WidgetStyleConfig.defaults().getFinishedPolicy(), WidgetStyleConfig.parse(null, null).getFinishedPolicy());
        assertEquals(WidgetStyleConfig.defaults().getLayoutStyle(), WidgetStyleConfig.parse("", "").getLayoutStyle());
        assertEquals(WidgetStyleConfig.defaults().getLayoutStyle(), WidgetStyleConfig.parse("no_such_style", "no_such_policy").getLayoutStyle());
        assertEquals(WidgetStyleConfig.defaults().getFinishedPolicy(), WidgetStyleConfig.parse("no_such_style", "no_such_policy").getFinishedPolicy());
    }

    @Test
    public void nullEnumsInConstructorFallBackToDefaults() {
        WidgetStyleConfig config = new WidgetStyleConfig(null, null);

        assertEquals(WidgetStyleConfig.defaults().getLayoutStyle(), config.getLayoutStyle());
        assertEquals(WidgetStyleConfig.defaults().getFinishedPolicy(), config.getFinishedPolicy());
    }

    /** 存储值必须能原样解析回来，否则用户的选择会在下次渲染时被静默丢弃。 */
    @Test
    public void storageValuesRoundTripForEveryCombination() {
        for (WidgetStyleConfig.LayoutStyle style : WidgetStyleConfig.LayoutStyle.values()) {
            for (WidgetStyleConfig.FinishedPolicy policy : WidgetStyleConfig.FinishedPolicy.values()) {
                WidgetStyleConfig original = new WidgetStyleConfig(style, policy);
                WidgetStyleConfig restored = WidgetStyleConfig.parse(original.layoutStyleStorageValue(),
                        original.finishedPolicyStorageValue());

                assertEquals("样式往返后必须一致：" + style, style, restored.getLayoutStyle());
                assertEquals("策略往返后必须一致：" + policy, policy, restored.getFinishedPolicy());
            }
        }
    }

    /**
     * 只有「紧凑」样式不显示列表，因此「已上完的课」对它无效果。
     * 配置页要据此提示用户，不能让用户以为设置坏了。
     */
    @Test
    public void finishedPolicyOnlyAppliesToStylesThatRenderAList() {
        assertFalse(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.COMPACT, WidgetStyleConfig.FinishedPolicy.HIDE)
                .isFinishedPolicyEffective());
        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.DAY_LIST, WidgetStyleConfig.FinishedPolicy.HIDE)
                .isFinishedPolicyEffective());
        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.NEXT_UP, WidgetStyleConfig.FinishedPolicy.HIDE)
                .isFinishedPolicyEffective());
    }
}
