package com.classtrack.app;

/**
 * 把实例的**存储配置**解析成一份可直接渲染的配置。
 *
 * <p>为什么还需要这一层：存储值来自外部（配置页写入的 Glance 状态、pin 判决写入的配置），
 * 可能是脏值、也可能是历史口径留下的值（`auto` / `two_column`）。渲染侧不该自己判这些，
 * 因此这里做一次纯函数解析，保证送进渲染的配置**一定不是 `AUTO`**。
 *
 * <p>优先级（从高到低）：
 *
 * <ol>
 *   <li>**用户显式选择**（`day_list` / `next_up` / `compact`）—— 原样返回，不做任何改写；</li>
 *   <li>`AUTO`（历史存储值 / 从未配置）→ **该实例 provider 那档预设的样式**（见 {@link WidgetPreset}）；</li>
 *   <li>连 provider 都不知道 → 默认配置（「接下来」+ 跟随尺寸）。</li>
 * </ol>
 *
 * <p>**2026-09-21 口径变更**：这里原先还有一条「按当前尺寸最近邻匹配预设」的路径（连同
 * {@code WidgetPreset.match} 一起删除）。现在样式不再随尺寸变化 —— 尺寸只影响度量与自适应填充。
 * 保留第 2 条而不是直接落默认，是为了让「pin 时写入失败 / 槽位超时」这类异常路径仍能落回该档
 * 正确的样式（1×2 的默认样式是「紧凑」，不能落成「接下来」）。
 *
 * <p>注意「已上完的课怎么处理」**不参与**这套解析：它是用户独立的显式选择，解析只决定样式与宽格表现。
 */
public final class WidgetStyleResolver {

    private WidgetStyleResolver() {
    }

    /**
     * 解析出真正用于渲染的配置。
     *
     * @param config 实例的存储配置；`null` 时按默认配置处理。
     * @param providerPreset 该实例的 provider 对应的预设（见 {@code WidgetProviders.presetForAppWidgetId}）；
     *     未显式选择时用它决定样式，可为 `null`。
     * @return 可直接渲染的配置：`layoutStyle` 一定不是 `AUTO`。
     */
    public static WidgetStyleConfig effective(WidgetStyleConfig config, WidgetPreset providerPreset) {
        WidgetStyleConfig base = config == null ? WidgetStyleConfig.defaults() : config;
        if (base.getLayoutStyle() != WidgetStyleConfig.LayoutStyle.AUTO) {
            // 手动优先：用户显式选过样式就原样返回，尺寸与 provider 都不再影响它。
            return base;
        }
        if (providerPreset == null) {
            // 连 provider 都不知道（实例已被删除的瞬间、或外部组件）：给一个确定的默认形态。
            return new WidgetStyleConfig(WidgetStyleConfig.DEFAULT_LAYOUT_STYLE, base.getFinishedPolicy(),
                    WidgetStyleConfig.DEFAULT_WIDE_LAYOUT);
        }
        return new WidgetStyleConfig(providerPreset.getLayoutStyle(), base.getFinishedPolicy(),
                providerPreset.getWideLayout());
    }
}
