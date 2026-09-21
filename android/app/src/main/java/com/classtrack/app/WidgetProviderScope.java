package com.classtrack.app;

/**
 * 「组件启用状态」的**判决**：某个 provider 组件此刻应该被写成什么状态。
 *
 * <p>为什么要这一层纯逻辑（不 import 任何 `android.*`）：真机上没法反复重放「启动 → 组件被禁用 → 重启」
 * 这条链路，而写错一次的后果又很难看出来（拾取器里多出一条 / 少一条）。因此把判决抽成纯函数由 JUnit 钉住，
 * 执行侧（`WidgetProviderScopeGate`）只做机械读写。
 *
 * <p>常量值与 `PackageManager.COMPONENT_ENABLED_STATE_*` **一一对齐**（DEFAULT=0 / ENABLED=1 / DISABLED=2）：
 * 执行侧把读到的 `getComponentEnabledSetting()` 直接传进来、把返回值直接写回
 * `setComponentEnabledSetting()`，中间不做任何映射，避免多一层翻译出错。
 */
public final class WidgetProviderScope {

    /** 组件状态：跟随清单默认（`PackageManager.COMPONENT_ENABLED_STATE_DEFAULT`）。 */
    public static final int DEFAULT = 0;

    /** 组件状态：显式启用（`PackageManager.COMPONENT_ENABLED_STATE_ENABLED`）。 */
    public static final int ENABLED = 1;

    /** 组件状态：显式禁用（`PackageManager.COMPONENT_ENABLED_STATE_DISABLED`）。 */
    public static final int DISABLED = 2;

    /** 判决结果：已经收敛，不要写（避免每次启动都做无意义的 Binder 写）。 */
    public static final int NO_WRITE = -1;

    private WidgetProviderScope() {
    }

    /**
     * 判决这次要不要写、写成什么。
     *
     * <p>为什么这么定：
     *
     * <ul>
     *   <li>**收起档一律禁用**：产品要求拾取器里只剩维护档，而 picker 只列启用中的组件；</li>
     *   <li>**维护档只从禁用恢复，绝不主动 enable**：我们不覆盖系统或用户的显式状态，避免成为组件状态的
     *       第二个主人（清单默认态就很好）；</li>
     *   <li>**幂等**：已经处于目标态就返回 {@link #NO_WRITE}，重复启动不产生任何写入。</li>
     * </ul>
     *
     * @param maintained 这一档是否属于维护档（见 {@code WidgetProviderRegistry.Entry}）。
     * @param currentState 当前组件状态：{@link #DEFAULT} / {@link #ENABLED} / {@link #DISABLED}
     *     （直接把 `PackageManager.getComponentEnabledSetting()` 的结果传进来）。
     * @return 要写入的状态，或 {@link #NO_WRITE} 表示什么都不用做。
     */
    public static int plan(boolean maintained, int currentState) {
        if (maintained) {
            return currentState == DISABLED ? ENABLED : NO_WRITE;
        }
        return currentState == DISABLED ? NO_WRITE : DISABLED;
    }
}
