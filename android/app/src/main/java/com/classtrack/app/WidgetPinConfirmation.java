package com.classtrack.app;

/**
 * 收到 pin 确认回调时的**判决**：这一次该不该把预设写进实例、写成什么。
 *
 * <p>与「怎么写」（Glance 状态容器、刷新桥）分开，是为了让判决可 JUnit 覆盖 —— 真机上这条链路无法
 * 反复重放（要用户的桌面确认），所以判决逻辑必须靠单测钉住。
 *
 * <p>纯函数：不碰 Android。
 */
public final class WidgetPinConfirmation {

    private WidgetPinConfirmation() {
    }

    /**
     * 判决一次确认回调。
     *
     * @param appWidgetId 回调带回的实例 id；非法（负数）时一律不写。
     * @param pendingPreset 待消费的预设；为 `null`（没有选过预设、或槽位已超时）时只记日志、不写。
     * @return 要写入该实例的配置；`null` 表示这一次不做任何写入。
     */
    public static WidgetStyleConfig planFor(int appWidgetId, WidgetPreset pendingPreset) {
        if (appWidgetId < 0 || pendingPreset == null) {
            return null;
        }
        // 只覆盖样式与「大格子表现」：已上完策略沿用默认值 —— 预设没有表达过这一项，不该替用户决定。
        return new WidgetStyleConfig(
                pendingPreset.getLayoutStyle(),
                WidgetStyleConfig.defaults().getFinishedPolicy(),
                pendingPreset.getWideLayout());
    }
}
