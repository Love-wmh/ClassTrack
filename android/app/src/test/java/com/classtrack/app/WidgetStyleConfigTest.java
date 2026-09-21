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
    public void defaultsAreNextUpWithDimmedFinishedClasses() {
        WidgetStyleConfig config = WidgetStyleConfig.defaults();

        // 2026-09-21 起默认为「接下来」：这是本轮收缩后的核心档，配置页一级也只留它。
        // 样式不再按尺寸自动匹配（那条路径已删除），未显式配置的实例按 provider 预设解析
        // （见 WidgetStyleResolverTest）。
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, config.getLayoutStyle());
        assertEquals(WidgetStyleConfig.FinishedPolicy.SHOW_DIM, config.getFinishedPolicy());
    }

    @Test
    public void parseReadsEveryValidCombination() {
        assertEquals(WidgetStyleConfig.LayoutStyle.DAY_LIST, WidgetStyleConfig.parse("day_list", "show_dim").getLayoutStyle());
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, WidgetStyleConfig.parse("next_up", "hide").getLayoutStyle());
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, WidgetStyleConfig.parse("compact", "collapse").getLayoutStyle());
        // `auto` 仍可解析（历史实例存过它），只是不再是默认值、也不再出现在配置页 UI 上。
        assertEquals(WidgetStyleConfig.LayoutStyle.AUTO, WidgetStyleConfig.parse("auto", "show_dim").getLayoutStyle());
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

    @Test
    public void wideLayoutDefaultsToAdaptiveAndIsTolerantOfDirtyValues() {
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, WidgetStyleConfig.defaults().getWideLayout());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, WidgetStyleConfig.parseWideLayout(null));
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, WidgetStyleConfig.parseWideLayout(""));
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, WidgetStyleConfig.parseWideLayout("no_such_value"));
        assertEquals(WidgetStyleConfig.WideLayout.DENSE, WidgetStyleConfig.parseWideLayout("  Dense "));
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, WidgetStyleConfig.parseWideLayout("TWO_COLUMN"));
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE,
                new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.NEXT_UP, null, null).getWideLayout());
    }

    /** 三个存储值都必须能原样解析回来，否则用户的选择会在下次渲染时被静默丢弃。 */
    @Test
    public void wideLayoutStorageValueRoundTrips() {
        for (WidgetStyleConfig.WideLayout wide : WidgetStyleConfig.WideLayout.values()) {
            WidgetStyleConfig original = new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.NEXT_UP,
                    WidgetStyleConfig.FinishedPolicy.SHOW_DIM, wide);
            WidgetStyleConfig restored = WidgetStyleConfig.parse(original.layoutStyleStorageValue(),
                    original.finishedPolicyStorageValue(), original.wideLayoutStorageValue());

            assertEquals("大格子表现往返后必须一致：" + wide, wide, restored.getWideLayout());
        }
    }

    /** 「紧凑」样式不显示课表，因此课程行增强与双栏对它都无效果（配置页据此灰显）。 */
    @Test
    public void wideLayoutOnlyAppliesToStylesThatRenderAList() {
        assertFalse(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.COMPACT, WidgetStyleConfig.FinishedPolicy.SHOW_DIM,
                WidgetStyleConfig.WideLayout.DENSE).isWideLayoutEffective());
        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.DAY_LIST, WidgetStyleConfig.FinishedPolicy.SHOW_DIM,
                WidgetStyleConfig.WideLayout.DENSE).isWideLayoutEffective());
        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.NEXT_UP, WidgetStyleConfig.FinishedPolicy.SHOW_DIM,
                WidgetStyleConfig.WideLayout.TWO_COLUMN).isWideLayoutEffective());
    }


    /**
     * @return 「大格子表现」这个选项对当前样式是否有效。
     *
     * <p>与「已上完策略」同源：「紧凑」样式不显示课表，课程行增强与双栏都无从生效。
     *     配置页按同一判据灰显，渲染层也按同一判据忽略它，两处不会打架。
     */

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

    /**
     * 二级区自动展开的判据：只有全部落在默认值时，一级区才够用。
     *
     * <p>反过来说：任何一项偏离默认都必须展开 —— 否则用户进页面看到一级是「接下来」，
     * 会以为自己的设置丢了（二级区默认折叠，见 design D6）。
     */
    @Test
    public void advancedSectionIsNeededWhenAnythingLeavesTheDefaults() {
        assertFalse(WidgetStyleConfig.defaults().needsAdvancedSection());
        assertFalse(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.NEXT_UP,
                WidgetStyleConfig.FinishedPolicy.SHOW_DIM, WidgetStyleConfig.WideLayout.ADAPTIVE).needsAdvancedSection());

        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.DAY_LIST,
                WidgetStyleConfig.FinishedPolicy.SHOW_DIM, WidgetStyleConfig.WideLayout.ADAPTIVE).needsAdvancedSection());
        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.NEXT_UP,
                WidgetStyleConfig.FinishedPolicy.HIDE, WidgetStyleConfig.WideLayout.ADAPTIVE).needsAdvancedSection());
        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.NEXT_UP,
                WidgetStyleConfig.FinishedPolicy.SHOW_DIM, WidgetStyleConfig.WideLayout.DENSE).needsAdvancedSection());
        // 历史存储值（`auto` / `two_column`）也属于「落在二级区里」：`auto` 无法在一级里表达，必须展开。
        assertTrue(new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.AUTO,
                WidgetStyleConfig.FinishedPolicy.SHOW_DIM, WidgetStyleConfig.WideLayout.TWO_COLUMN).needsAdvancedSection());
    }
}
