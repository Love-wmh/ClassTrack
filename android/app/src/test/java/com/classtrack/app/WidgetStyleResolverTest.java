package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;

import org.junit.Test;

/**
 * 「存储配置 + 当前尺寸」→「可直接渲染的配置」。
 *
 * <p>这是产品 2026-09-21 口径变更（「改尺寸后要匹配上」）的落点，四条优先级缺一不可：
 * **显式选择赢**、**AUTO 按尺寸匹配**、**尺寸不可用时退回 provider**、**都没有时给最小档**。
 * 另外「已上完策略」不参与自动匹配 —— 它是用户独立的显式选择。
 */
public class WidgetStyleResolverTest {

    private static WidgetStyleConfig auto() {
        return new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.AUTO,
                WidgetStyleConfig.FinishedPolicy.HIDE);
    }

    /** 手动优先：用户显式选过样式，尺寸再怎么变都不改它。 */
    @Test
    public void explicitStyleAlwaysWins() {
        WidgetStyleConfig explicit = new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.DAY_LIST,
                WidgetStyleConfig.FinishedPolicy.COLLAPSE, WidgetStyleConfig.WideLayout.DENSE);

        WidgetStyleConfig resolved = WidgetStyleResolver.effective(explicit, 1142f, 419f,
                WidgetPreset.parse(WidgetPreset.ID_CELL_6X3));

        assertSame("显式配置必须原样返回，不复制也不改写", explicit, resolved);
        assertEquals(WidgetStyleConfig.LayoutStyle.DAY_LIST, resolved.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.DENSE, resolved.getWideLayout());
    }

    /** AUTO：样式与宽格表现都来自当前尺寸匹配到的那一档。 */
    @Test
    public void autoFollowsTheMatchedPreset() {
        WidgetStyleConfig compact = WidgetStyleResolver.effective(auto(), 179f, 210f, null);
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, compact.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, compact.getWideLayout());

        WidgetStyleConfig tablet = WidgetStyleResolver.effective(auto(), 1142f, 419f, null);
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, tablet.getWideLayout());

        // 同一个实例被拖大：4×3 → 6×3，宽格表现随之变化（这就是「改尺寸后要匹配上」）。
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN,
                WidgetStyleResolver.effective(auto(), 373f, 321f, null).getWideLayout());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE,
                WidgetStyleResolver.effective(auto(), 179f, 315f, null).getWideLayout());
    }

    /** 「已上完策略」是用户独立的显式选择，自动匹配不许覆盖它。 */
    @Test
    public void finishedPolicySurvivesAutoMatching() {
        assertEquals(WidgetStyleConfig.FinishedPolicy.HIDE,
                WidgetStyleResolver.effective(auto(), 179f, 210f, null).getFinishedPolicy());
    }

    /** 尺寸不可用（还没测量到 / 异常值）时退回该实例 provider 那档，而不是随手给一档。 */
    @Test
    public void unusableSizeFallsBackToTheProviderPreset() {
        WidgetPreset tablet = WidgetPreset.parse(WidgetPreset.ID_CELL_6X3);

        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN,
                WidgetStyleResolver.effective(auto(), 0f, 0f, tablet).getWideLayout());
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN,
                WidgetStyleResolver.effective(auto(), -5f, 200f, tablet).getWideLayout());
    }

    /** 连 provider 都不知道时给最小档：宁可给一个确定的形态，也不留"未定义"。 */
    @Test
    public void noSizeAndNoProviderFallsBackToTheSmallestPreset() {
        WidgetStyleConfig resolved = WidgetStyleResolver.effective(auto(), 0f, 0f, null);

        assertNotNull(resolved);
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, resolved.getLayoutStyle());
    }

    /** `null` 配置（读取失败）也必须有确定结果。 */
    @Test
    public void nullConfigIsTreatedAsDefaults() {
        WidgetStyleConfig resolved = WidgetStyleResolver.effective(null, 373f, 321f, null);

        assertNotNull(resolved);
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, resolved.getLayoutStyle());
    }

    /** 解析后的配置一定不是 AUTO —— 下游（行判决、渲染）不许再遇到"未决定"的状态。 */
    @Test
    public void resolvedConfigIsNeverAuto() {
        for (WidgetPreset preset : WidgetPreset.all()) {
            WidgetStyleConfig resolved = WidgetStyleResolver.effective(auto(), 373f, 321f, preset);
            assertEquals(preset.getId(), WidgetStyleConfig.LayoutStyle.NEXT_UP, resolved.getLayoutStyle());
        }
    }
}
