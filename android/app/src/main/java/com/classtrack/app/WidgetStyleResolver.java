package com.classtrack.app;

/**
 * 把实例的**存储配置**与**当前实际尺寸**解析成一份可直接渲染的配置。
 *
 * <p>存在的理由：产品要求「用户改了格子尺寸后样式要匹配上」（2026-09-21），因此当实例处于
 * {@link WidgetStyleConfig.LayoutStyle#AUTO} 时，样式、宽格表现与行项形态都要由**当前尺寸**决定。
 * 尺寸只有渲染那一刻才知道（Glance 的 `LocalSize`），所以这一步必须在合成时做、且必须是纯函数
 * （可 JUnit 覆盖，见 {@code WidgetStyleResolverTest}）。
 *
 * <p>优先级（从高到低）：
 *
 * <ol>
 *   <li>**用户显式选择**（`day_list` / `next_up` / `compact`）——手动永远优先，尺寸变化不再改它；</li>
 *   <li>`AUTO` + 可用尺寸 → {@link WidgetPreset#match}（连续最近邻，无阈值分支）；</li>
 *   <li>`AUTO` + 尺寸不可用（0 / 负 / 还没测量到）→ 该实例的 provider 对应预设；</li>
 *   <li>都没有 → 最小档预设（宁可给一个确定的形态，也不留"未定义"）。</li>
 * </ol>
 *
 * <p>注意「已上完的课怎么处理」**不参与**这套解析：它是用户独立的显式选择，自动匹配只决定
 * 样式 + 宽格表现 + 行项形态（design D3b）。
 */
public final class WidgetStyleResolver {

    private WidgetStyleResolver() {
    }

    /**
     * 解析出真正用于渲染的配置。
     *
     * @param config 实例的存储配置；`null` 时按默认配置处理。
     * @param widthDp 当前格子宽度（dp）；`<= 0` 视为不可用。
     * @param heightDp 当前格子高度（dp）；`<= 0` 视为不可用。
     * @param providerPreset 该实例的 provider 对应的预设（见 {@code WidgetProviders.presetForAppWidgetId}）；
     *     尺寸不可用时用它兜底，可为 `null`。
     * @return 可直接渲染的配置：`layoutStyle` 一定不是 `AUTO`。
     */
    public static WidgetStyleConfig effective(WidgetStyleConfig config, float widthDp, float heightDp,
                                              WidgetPreset providerPreset) {
        WidgetStyleConfig base = config == null ? WidgetStyleConfig.defaults() : config;
        if (base.getLayoutStyle() != WidgetStyleConfig.LayoutStyle.AUTO) {
            // 手动优先：用户显式选过样式就原样返回，尺寸变化不再影响它。
            return base;
        }

        WidgetPreset matched = matchPreset(widthDp, heightDp, providerPreset);
        return new WidgetStyleConfig(matched.getLayoutStyle(), base.getFinishedPolicy(), matched.getWideLayout());
    }

    /**
     * 选一档预设：优先按真实尺寸最近邻，尺寸不可用时退回 provider 那档。
     *
     * @param widthDp 当前宽度（dp）。
     * @param heightDp 当前高度（dp）。
     * @param providerPreset provider 对应的预设；可为 `null`。
     * @return 选中的预设；永不为 `null`。
     */
    public static WidgetPreset matchPreset(float widthDp, float heightDp, WidgetPreset providerPreset) {
        if (!(widthDp > 0f) || !(heightDp > 0f)) {
            return providerPreset != null ? providerPreset : WidgetPreset.all().get(0);
        }
        return WidgetPreset.match(widthDp, heightDp);
    }
}
