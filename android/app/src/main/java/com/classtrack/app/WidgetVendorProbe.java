package com.classtrack.app;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;

/**
 * 小米官方「系统能力探测」接口的薄封装：**问系统「这台机器有没有小部件中心详情页」**。
 *
 * <p>为什么值得为它写一个类：官方文档明确写了「部分机型支持小米Widget（包含曝光刷新等特性），但**不支持
 * 调起小米Widget 详情页**。这部分机型添加小部件的方式与旧版系统一致」。既然系统愿意回答，就不该拍脑袋
 * 决定要不要带那组 extras（见 {@link WidgetPinExtras}）。
 *
 * <p>接口形态（官方示例，`@WorkerThread`）：
 *
 * <pre>
 * Uri uri = Uri.parse("content://com.miui.personalassistant.widget.external");
 * Bundle b = resolver.call(uri, "isMiuiWidgetDetailPageSupported", null, null);
 * boolean supported = b != null &amp;&amp; b.getBoolean("isMiuiWidgetDetailPageSupported");
 * </pre>
 *
 * <p><b>三条硬约束</b>：
 *
 * <ol>
 *   <li>**只在小米机型上调用**：别家没有这个 Provider，跨进程 call 白花代价，还可能触发未知行为。</li>
 *   <li>**失败一律当 false**：`Provider` 不存在、抛异常、返回 `null`、键缺失 —— 全部按「不支持」处理，
 *       退回标准 pin + 引导。探测失败绝不能让 pin 崩掉或卡住。</li>
 *   <li>**只缓存成功的结果**：一次 `RuntimeException`（例如进程刚起、Provider 还没就绪）不该被缓存成
 *       「永远不支持」。所以缓存槽只在拿到真实回答时写入。</li>
 * </ol>
 *
 * <p>本类是 Android 依赖的薄封装（`ContentResolver` / `Bundle`），因此**不写纯逻辑单测**；判定逻辑
 * （拿到 boolean 之后怎么办）全部在 {@link WidgetVendorSupport} 与 {@link WidgetPinExtras} 里，由 JUnit 覆盖。
 */
public final class WidgetVendorProbe {

    /** 小米小部件系统能力的 ContentProvider 授权名（官方文档）。 */
    static final String AUTHORITY = "content://com.miui.personalassistant.widget.external";

    /** 问「这台机器是否支持小米Widget」。 */
    static final String METHOD_WIDGET_SUPPORTED = "isMiuiWidgetSupported";

    /** 问「这台机器是否支持调起小米Widget 详情页」——**决定 pin 带不带那组 extras 的就是它**。 */
    static final String METHOD_DETAIL_PAGE_SUPPORTED = "isMiuiWidgetDetailPageSupported";

    private static volatile Boolean miuiWidgetSupported;
    private static volatile Boolean detailPageSupported;

    private WidgetVendorProbe() {
    }

    /**
     * 这台小米机器能不能调起「小部件中心详情页」。
     *
     * @param context 任意 Context。
     * @param family 厂商族；**非小米直接返回 false 且不发起跨进程调用**。
     * @return 支持则 true；非小米、探测失败、探测无回答一律 false。
     */
    public static boolean detailPageSupported(Context context, WidgetVendorFamily family) {
        if (family != WidgetVendorFamily.XIAOMI || context == null) {
            return false;
        }
        Boolean cached = detailPageSupported;
        if (cached != null) {
            return cached;
        }
        Boolean probed = probe(context, METHOD_DETAIL_PAGE_SUPPORTED);
        if (probed == null) {
            // 探测本身失败：如实返回「不支持」，但**不缓存**，下次还有机会拿到真实回答。
            return false;
        }
        detailPageSupported = probed;
        return probed;
    }

    /**
     * 这台小米机器是否支持小米Widget（含曝光刷新等特性）。
     *
     * <p>当前只用于诊断取证（真机确认开放项 V1/V3 时需要它区分「不支持小米Widget」与「支持但不支持详情页」），
     * 不参与任何功能分支。
     */
    public static boolean widgetSupported(Context context, WidgetVendorFamily family) {
        if (family != WidgetVendorFamily.XIAOMI || context == null) {
            return false;
        }
        Boolean cached = miuiWidgetSupported;
        if (cached != null) {
            return cached;
        }
        Boolean probed = probe(context, METHOD_WIDGET_SUPPORTED);
        if (probed == null) {
            return false;
        }
        miuiWidgetSupported = probed;
        return probed;
    }

    /** 清掉进程缓存（只给单测/诊断用；线上没有重新探测的时机）。 */
    static void resetCacheForTest() {
        miuiWidgetSupported = null;
        detailPageSupported = null;
    }

    /**
     * @return 系统给出的回答；**没有回答**（异常 / 返回 null / 键缺失）时返回 `null`，由调用方决定怎么处理。
     */
    private static Boolean probe(Context context, String method) {
        try {
            Bundle result = context.getContentResolver().call(Uri.parse(AUTHORITY), method, null, null);
            if (result == null || !result.containsKey(method)) {
                return null;
            }
            return result.getBoolean(method, false);
        } catch (RuntimeException error) {
            // Provider 不存在（非小米）、被禁用、或跨进程调用被拒：按「没有回答」处理。
            return null;
        }
    }
}
