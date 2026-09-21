package com.classtrack.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;


/**
 * {@link WidgetProviderRegistry} 的 Android 桥接：把纯数据里的 receiver 类名变成 `ComponentName`，
 * 并提供"跨所有 provider"的常用查询。
 *
 * <p>为什么必须集中在这里：从 2026-09-21 起我们有**五个** provider（2×2 / 2×3 / 4×2 / 4×3 / 6×3），
 * 而 pin 的基线集合、回调后的实例集合、配置页的归属校验都必须覆盖**全部** provider ——
 * 任何一处只认某一个 provider，都会表现为"某个尺寸的小工具点『样式』打不开"或"pin 后样式没落上"。
 *
 * <p>纯数据的正确性由 {@code WidgetProviderRegistryTest} 覆盖；本类只做机械转换。
 */
public final class WidgetProviders {

    private WidgetProviders() {
    }

    /** @return 全部 provider 组件（顺序与注册表一致）。 */
    public static List<ComponentName> renderers(Context context) {
        List<ComponentName> components = new ArrayList<>();
        for (String className : WidgetProviderRegistry.receiverClassNames()) {
            Class<?> receiverClass = resolve(className);
            if (receiverClass != null) {
                components.add(new ComponentName(context, receiverClass));
            }
        }
        return components;
    }

    private static Class<?> resolve(String className) {
        try {
            // 用类名反射即可：注册表里的名字就是清单里声明的组件名，类都在本模块内。
            return Class.forName(className);
        } catch (ClassNotFoundException | LinkageError error) {
            return null;
        }
    }

    /**
     * 某个组件对应的预设。
     *
     * @param component provider 组件；`null` 安全。
     * @return 对应预设；不是我们的 provider 时返回 `null`。
     */
    public static WidgetPreset presetFor(ComponentName component) {
        if (component == null) {
            return null;
        }
        return WidgetProviderRegistry.presetFor(component.getClassName());
    }

    /** @return 该组件是否是我们的小工具 provider（配置页的归属校验用）。 */
    public static boolean isOurs(ComponentName component) {
        return presetFor(component) != null;
    }

    /**
     * 某个实例来自哪个 provider（→ 它的预设）。
     *
     * <p>"放置即带样式"的判据：**问系统这个实例属于谁**，而不是猜"哪个实例是新的"（后者有竞态，已被删除）。
     *
     * @param context 任意 Context。
     * @param appWidgetId 实例 id。
     * @return 对应预设；实例不存在、已删除或不属于我们时返回 `null`。
     */
    public static WidgetPreset presetForAppWidgetId(Context context, int appWidgetId) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        try {
            android.appwidget.AppWidgetProviderInfo info = manager.getAppWidgetInfo(appWidgetId);
            return info == null ? null : presetFor(info.provider);
        } catch (RuntimeException error) {
            // 个别 ROM 在实例已被删除时抛；按"不知道"处理，由调用方走默认样式。
            return null;
        }
    }

    /**
     * 全部 provider 的实例 id（并集、升序、去重）。
     *
     * <p>pin 的基线集合与"回调之后"的集合都必须用它：用户可能从任何一个 provider 放下实例。
     *
     * @param context 任意 Context。
     * @return 全部实例 id；没有任何实例时返回空数组。
     */
    public static int[] allAppWidgetIds(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        List<Integer> ids = new ArrayList<>();
        for (ComponentName component : renderers(context)) {
            int[] providerIds = manager.getAppWidgetIds(component);
            if (providerIds == null) {
                continue;
            }
            for (int id : providerIds) {
                if (id >= 0 && !ids.contains(id)) {
                    ids.add(id);
                }
            }
        }
        int[] result = new int[ids.size()];
        for (int index = 0; index < ids.size(); index++) {
            result[index] = ids.get(index);
        }
        Arrays.sort(result);
        return result;
    }
}
