package com.classtrack.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;

/**
 * 「维护面收缩」的执行侧：把**收起档**的 receiver 组件禁用掉，让系统拾取器里只剩维护档。
 *
 * <p>为什么必须靠禁用组件：拾取器只列**启用中**的 `AppWidgetProvider`，而拾取器里的尺寸标签又来自
 * provider 自己的 `targetCellWidth/Height`（pin 的 extras 会被 launcher 忽略）。所以要「只提供两档」，
 * 唯一的开关就是组件启用状态。
 *
 * <p>判决在 {@link WidgetProviderScope}（纯函数、有单测）；这里只做机械读写：
 * 读当前状态 → {@link WidgetProviderScope#plan} → **不一致才写**（幂等，重复启动 0 次写入）。
 * 禁用清单由 {@link WidgetProviderRegistry#retiredEntries()} 推导，不另抄一份 —— 漏一档就会在拾取器里多一条。
 *
 * <p>**代价（已与产品确认并接受）**：被禁用的 provider 不再收到 `APPWIDGET_UPDATE`，桌面上这些尺寸的
 * 存量实例会停止刷新，且应用更新时可能被系统清除。类、清单与元数据全部保留，因此这是**可逆**的
 * —— 回滚时必须显式把状态写回 `COMPONENT_ENABLED_STATE_DEFAULT`（见任务 implement.md 的回滚清单）。
 */
public final class WidgetProviderScopeGate {

    private WidgetProviderScopeGate() {
    }

    /**
     * 收敛一次组件启用状态。**每次应用启动调用**（重装 / 清数据后同样生效）。
     *
     * @param context 任意 Context（用 `getPackageManager()` 与组件名，不需要 Activity）。
     */
    public static void apply(Context context) {
        if (context == null) {
            return;
        }
        PackageManager manager = context.getPackageManager();
        if (manager == null) {
            return;
        }
        int retired = 0;
        int written = 0;
        for (WidgetProviderRegistry.Entry entry : WidgetProviderRegistry.retiredEntries()) {
            ComponentName component = WidgetProviders.componentFor(context, entry.getReceiverClassName());
            if (component == null) {
                // 类不存在（重命名/被删）：跳过。注册表与代码的不一致由跨层测试拦，不在这里猜。
                continue;
            }
            retired++;
            // 禁用（`enabled=false`）是「用户级」的显式状态：`DONT_KILL_APP` 避免顺手重启自己的进程。
            int currentState = manager.getComponentEnabledSetting(component);
            int planned = WidgetProviderScope.plan(entry.isMaintained(), currentState);
            if (planned == WidgetProviderScope.NO_WRITE) {
                continue;
            }
            manager.setComponentEnabledSetting(component, planned, PackageManager.DONT_KILL_APP);
            written++;
        }
        WidgetDiagnostics.scopeConverged(retired, written);
    }
}
