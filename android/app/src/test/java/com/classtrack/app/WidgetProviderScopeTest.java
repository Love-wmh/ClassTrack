package com.classtrack.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * 「组件启用状态」判决：幂等 + 两个方向。
 *
 * <p>为什么要单测：真机上没法反复重放「启动 → 组件被禁用 → 重启」这条链路，而写错一次的后果很难看出来
 * （拾取器里多一条 / 少一条），所以判决必须在纯函数层面钉死。
 */
public class WidgetProviderScopeTest {

    /** 常量必须与 `PackageManager.COMPONENT_ENABLED_STATE_*` 对齐：执行侧直接透传，不做映射。 */
    @Test
    public void stateConstantsMatchThePlatformValues() {
        assertEquals(0, WidgetProviderScope.DEFAULT);
        assertEquals(1, WidgetProviderScope.ENABLED);
        assertEquals(2, WidgetProviderScope.DISABLED);
        assertEquals(-1, WidgetProviderScope.NO_WRITE);
    }

    /** 收起档：任何非「已禁用」的状态都要写成禁用。 */
    @Test
    public void retiredProvidersGetDisabled() {
        assertEquals(WidgetProviderScope.DISABLED, WidgetProviderScope.plan(false, WidgetProviderScope.DEFAULT));
        assertEquals(WidgetProviderScope.DISABLED, WidgetProviderScope.plan(false, WidgetProviderScope.ENABLED));
    }

    /** 收起档 + 已经禁用 → 什么都不写（幂等的核心：重复启动不产生 Binder 写）。 */
    @Test
    public void retiredProvidersAlreadyDisabledAreLeftAlone() {
        assertEquals(WidgetProviderScope.NO_WRITE, WidgetProviderScope.plan(false, WidgetProviderScope.DISABLED));
    }

    /** 维护档只「从禁用恢复」，绝不主动 enable：不覆盖系统/用户的显式状态。 */
    @Test
    public void maintainedProvidersAreOnlyReEnabledWhenWeHadDisabledThem() {
        assertEquals(WidgetProviderScope.ENABLED, WidgetProviderScope.plan(true, WidgetProviderScope.DISABLED));
        assertEquals(WidgetProviderScope.NO_WRITE, WidgetProviderScope.plan(true, WidgetProviderScope.DEFAULT));
        assertEquals(WidgetProviderScope.NO_WRITE, WidgetProviderScope.plan(true, WidgetProviderScope.ENABLED));
    }

    /** 未知状态值按「不是已禁用」处理：宁可写成目标态，也不要因为读了怪值而漏收敛。 */
    @Test
    public void unknownCurrentStateStillConverges() {
        assertEquals(WidgetProviderScope.DISABLED, WidgetProviderScope.plan(false, 999));
        assertEquals(WidgetProviderScope.NO_WRITE, WidgetProviderScope.plan(true, 999));
    }

    /** 连续两次判决同一组输入必须给出同样结果（幂等，不看历史）。 */
    @Test
    public void planIsPure() {
        for (boolean maintained : new boolean[]{true, false}) {
            for (int state : new int[]{WidgetProviderScope.DEFAULT, WidgetProviderScope.ENABLED, WidgetProviderScope.DISABLED}) {
                assertEquals(WidgetProviderScope.plan(maintained, state), WidgetProviderScope.plan(maintained, state));
            }
        }
    }
}
