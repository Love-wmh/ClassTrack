package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;

import org.junit.Test;

/**
 * 「存储配置 + 该实例的 provider」→「可直接渲染的配置」。
 *
 * <p>2026-09-21 口径变更后只剩三级：
 * **显式选择赢**、**AUTO 用 provider 预设的样式**、**都没有时给默认**。
 * 「按尺寸自动匹配」那条路径已删除（连同 `WidgetPreset#match`），因此这里不再有尺寸入参。
 * 另外「已上完策略」不参与解析 —— 它是用户独立的显式选择。
 */
public class WidgetStyleResolverTest {

    private static WidgetStyleConfig auto() {
        return new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.AUTO,
                WidgetStyleConfig.FinishedPolicy.HIDE);
    }

    /** 手动优先：用户显式选过样式，provider 与尺寸都不再影响它。 */
    @Test
    public void explicitStyleAlwaysWins() {
        WidgetStyleConfig explicit = new WidgetStyleConfig(WidgetStyleConfig.LayoutStyle.DAY_LIST,
                WidgetStyleConfig.FinishedPolicy.COLLAPSE, WidgetStyleConfig.WideLayout.DENSE);

        WidgetStyleConfig resolved = WidgetStyleResolver.effective(explicit,
                WidgetPreset.parse(WidgetPreset.ID_CELL_6X3));

        assertSame("显式配置必须原样返回，不复制也不改写", explicit, resolved);
        assertEquals(WidgetStyleConfig.LayoutStyle.DAY_LIST, resolved.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.DENSE, resolved.getWideLayout());
    }

    /** AUTO（历史存储值 / 从未配置）：样式与宽格表现都来自该实例 provider 那档预设。 */
    @Test
    public void autoFollowsTheProviderPreset() {
        WidgetStyleConfig threeTwo = WidgetStyleResolver.effective(auto(),
                WidgetPreset.parse(WidgetPreset.ID_CELL_3X2));
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, threeTwo.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, threeTwo.getWideLayout());

        // 为什么这条最重要：1×2 的默认样式是「紧凑」。落错档就等于卡片名与实物不符。
        WidgetStyleConfig oneTwo = WidgetStyleResolver.effective(auto(),
                WidgetPreset.parse(WidgetPreset.ID_CELL_1X2));
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, oneTwo.getLayoutStyle());

        // 收起档同样按预设解析：桌面上遗留的 4×3 实例仍要拿到它原本的（双栏能力）表现。
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN,
                WidgetStyleResolver.effective(auto(), WidgetPreset.parse(WidgetPreset.ID_CELL_4X3)).getWideLayout());
    }

    /** 「已上完策略」是用户独立的显式选择，解析不许覆盖它。 */
    @Test
    public void finishedPolicySurvivesResolution() {
        assertEquals(WidgetStyleConfig.FinishedPolicy.HIDE,
                WidgetStyleResolver.effective(auto(), WidgetPreset.parse(WidgetPreset.ID_CELL_3X2)).getFinishedPolicy());
    }

    /** 连 provider 都不知道（实例刚被删除 / 外部组件）时给默认配置，而不是留「未定义」。 */
    @Test
    public void unknownProviderFallsBackToDefaults() {
        WidgetStyleConfig resolved = WidgetStyleResolver.effective(auto(), null);

        assertNotNull(resolved);
        assertEquals(WidgetStyleConfig.DEFAULT_LAYOUT_STYLE, resolved.getLayoutStyle());
        assertEquals(WidgetStyleConfig.DEFAULT_WIDE_LAYOUT, resolved.getWideLayout());
        // 用户的「已上完」选择仍要保留。
        assertEquals(WidgetStyleConfig.FinishedPolicy.HIDE, resolved.getFinishedPolicy());
    }

    /** `null` 配置（读取失败）也必须有确定结果。 */
    @Test
    public void nullConfigIsTreatedAsDefaults() {
        WidgetStyleConfig resolved = WidgetStyleResolver.effective(null, null);

        assertNotNull(resolved);
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, resolved.getLayoutStyle());
    }

    /** 解析后的配置一定不是 AUTO —— 下游（行判决、渲染）不许再遇到"未决定"的状态。 */
    @Test
    public void resolvedConfigIsNeverAuto() {
        for (WidgetPreset preset : WidgetPreset.all()) {
            WidgetStyleConfig resolved = WidgetStyleResolver.effective(auto(), preset);
            assertEquals(preset.getId(), preset.getLayoutStyle(), resolved.getLayoutStyle());
        }
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, WidgetStyleResolver.effective(auto(), null).getLayoutStyle());
    }
}
