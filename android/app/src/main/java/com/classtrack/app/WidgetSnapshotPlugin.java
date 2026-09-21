package com.classtrack.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.classtrack.app.widget.WidgetPinResultReceiver;
import com.classtrack.app.widget.WidgetRefreshBridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Web → 原生 的快照通道，以及小工具精度等级的查询/授权入口。
 *
 * Web 侧把算好的课表快照（绝对 epoch + 预格式化文案）推过来，这里只做三件事：
 * 校验、落盘、触发小工具刷新。原生侧不解析 localStorage、不重算周次、不做日期运算。
 */
@CapacitorPlugin(name = "WidgetSnapshot")
public class WidgetSnapshotPlugin extends Plugin {
    /** 确认回调的 PendingIntent request code（固定值即可：同一时刻只会有一个待确认的放置请求）。 */
    private static final int PIN_CALLBACK_REQUEST_CODE = 4711;

    @PluginMethod
    public void pushSnapshot(PluginCall call) {
        String snapshotJson = call.getString("snapshotJson");
        if (snapshotJson == null || snapshotJson.isEmpty()) {
            WidgetDiagnostics.snapshotRejected("invalid", 0);
            call.reject("快照数据为空", "INVALID_PAYLOAD");
            return;
        }

        int byteLength = snapshotJson.getBytes(StandardCharsets.UTF_8).length;
        if (byteLength > WidgetSnapshotStore.MAX_PAYLOAD_BYTES) {
            WidgetDiagnostics.snapshotRejected("too_large", byteLength);
            call.reject("快照数据超过大小上限", "PAYLOAD_TOO_LARGE");
            return;
        }

        if (WidgetSnapshotParser.parse(snapshotJson) == null) {
            WidgetDiagnostics.snapshotRejected("invalid", byteLength);
            call.reject("快照格式无效", "INVALID_PAYLOAD");
            return;
        }

        if (!WidgetSnapshotStore.write(getContext(), snapshotJson)) {
            WidgetDiagnostics.snapshotRejected("storage", byteLength);
            call.reject("快照写入失败", "STORAGE_ERROR");
            return;
        }

        // 只有确认落盘之后才 resolve：否则 Web 侧会以为推送成功，而小工具可能仍读到旧值。
        WidgetDiagnostics.snapshotStored(byteLength);
        WidgetRefreshBridge.requestRefresh(getContext());
        call.resolve();
    }

    /**
     * 读取并清空「点击小工具时带来的待跳转路由」。
     *
     * 永远 resolve，不 reject：没有待跳转是正常情况，Web 层只需要拿到 `null` 然后什么都不做。
     */
    @PluginMethod
    public void consumePendingRoute(PluginCall call) {
        JSObject result = new JSObject();
        result.put("route", WidgetPendingRoute.consumePendingRoute());
        call.resolve(result);
    }

    /**
     * 应用内「添加到桌面」：请求 launcher 放置一个本应用的小工具实例。
     *
     * <p>**尺寸提示是尽力而为**：`extras` 里带上目标格子的 `OPTION_APPWIDGET_MIN_WIDTH/HEIGHT`，但
     * Android 只规定这些 key 存在，并未规定 launcher 会采纳；实测结论与文案降级写在 spec 里。因此无论
     * 尺寸提示是否生效，**样式与「大格子表现」都仍然一键设好**（走 [WidgetPendingPreset]）。
     *
     * <p>支持性由 `AppWidgetManager.isRequestPinAppWidgetSupported()` 决定，为假时不发起请求、不留下槽位，
     * 直接返回 `{supported:false}`，由 Web 侧展示「手动添加」的图文说明。
     */
    @PluginMethod
    public void requestPinWidget(PluginCall call) {
        String presetId = call.getString("preset");
        WidgetPreset preset = WidgetPreset.parse(presetId);
        if (preset == null) {
            WidgetDiagnostics.pinResult(false, false);
            call.reject("预设无效", "INVALID_PAYLOAD");
            return;
        }

        WidgetDiagnostics.pinRequested(preset.getId());
        // 开始一次新尝试：记下请求时刻并清掉上一次「退过后台」的记录 —— 旧记录会让这次误判成
        // 「确认界面已经出现过」，于是面板不肯提前提示用户（见 PinAttemptState 的注释）。
        PinAttemptState.reset(System.currentTimeMillis());

        Context context = getContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported();
        if (!supported) {
            // 不支持就不要留下槽位：否则用户下次从桌面手动放置时会被塞进这次选的预设。
            WidgetPendingPreset.clear();
            WidgetPinBaseline.clear();
            WidgetDiagnostics.pinResult(false, false);
            JSObject unsupported = new JSObject();
            unsupported.put("supported", false);
            unsupported.put("requested", false);
            call.resolve(unsupported);
            return;
        }

        // pin 的目标是**这一档预设对应的 provider**（五个 provider 各管一档尺寸）。
        ComponentName provider = WidgetProviders.rendererFor(context, preset);
        if (provider == null) {
            // 理论上不可能（预设表与 provider 注册表一一对应）；如实报「不支持」，不猜一个组件。
            WidgetPendingPreset.clear();
            WidgetPinBaseline.clear();
            WidgetDiagnostics.pinResult(false, false);
            JSObject unmapped = new JSObject();
            unmapped.put("supported", false);
            unmapped.put("requested", false);
            call.resolve(unmapped);
            return;
        }

        WidgetPendingPreset.set(preset.getId(), System.currentTimeMillis());
        // 记录「请求前已有哪些实例」：回调带回的 id 不可信（实测 AOSP Launcher3 发回 0），
        // 需要用它做差集找出用户刚放下的实例（见 WidgetPinTargets）。**跨全部 provider** 取并集 ——
        // 用户可能从任何一档放下实例，只记 4×3 会让其它档的差集算错。
        WidgetPinBaseline.record(WidgetProviders.allAppWidgetIds(context), System.currentTimeMillis());

        // 厂商分诊：**只用来决定 extras 与提示**，不用来判断能力（能力结论只来自行为探测）。
        WidgetVendorFamily family = WidgetVendorFamily.detect(Build.MANUFACTURER, Build.BRAND);
        boolean modern = WidgetVendorSupport.isModern(Build.VERSION.SDK_INT, family);
        boolean detailPageSupported = WidgetVendorProbe.detailPageSupported(context, family);
        WidgetDiagnostics.pinVendor(family.wireName(), modern, detailPageSupported);

        Bundle extras = new Bundle();
        WidgetPinExtras.apply(
                WidgetPinExtras.plan(family, modern, detailPageSupported,
                        context.getPackageName(), provider.getClassName(),
                        Math.round(preset.getWidthDp()), Math.round(preset.getHeightDp())),
                new WidgetPinExtras.Sink() {
                    @Override
                    public void putString(String key, String value) {
                        extras.putString(key, value);
                    }

                    @Override
                    public void putInt(String key, int value) {
                        extras.putInt(key, value);
                    }
                });

        // 必须传 successCallback：它的返回值只表示「请求已受理」，与是否真的放下无关。
        // 系统在用户确认后广播到这个 receiver，并带回新实例 id（见 WidgetPinResultReceiver）。
        PendingIntent callback = PendingIntent.getBroadcast(
                context,
                PIN_CALLBACK_REQUEST_CODE,
                new Intent(context, WidgetPinResultReceiver.class)
                        .setAction(WidgetPinResultReceiver.ACTION_PIN_CONFIRMED),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        boolean requested;
        try {
            requested = manager.requestPinAppWidget(provider, extras, callback);
        } catch (RuntimeException error) {
            // 个别 ROM 在这里抛（例如 launcher 未实现该 API）：按「没发起」如实返回，不崩。
            requested = false;
        }
        if (!requested) {
            WidgetPendingPreset.clear();
            WidgetPinBaseline.clear();
        }

        WidgetDiagnostics.pinResult(true, requested);
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("requested", requested);
        call.resolve(result);
    }

    /**
     * 读取并清空「刚刚真的放下了一个小工具」的确认结果。
     *
     * <p>Web 侧的面板在请求之后轮询它：只有 `confirmed=true` 才显示"已添加"。
     * 与 `consumePendingRoute` 同构的一次性读取；`appWidgetId` 为空时返回 `null`。
     */
    @PluginMethod
    public void consumePinResult(PluginCall call) {
        int appWidgetId = WidgetPinResult.consumeConfirmed(System.currentTimeMillis());
        JSObject result = new JSObject();
        result.put("confirmed", appWidgetId >= 0);
        result.put("appWidgetId", appWidgetId >= 0 ? appWidgetId : JSObject.NULL);
        call.resolve(result);
    }

    /**
     * 读取本次「添加到桌面」尝试的观测事实，供面板判定「系统有没有弹出确认界面」。
     *
     * <p>只返回两个时刻（毫秒）与一个纯判定结果：Web 侧据此在约 2 秒后就能催促用户走手动步骤，
     * 而不是干等满超时。**这不是失败结论** —— 面板必须继续轮询 {@link #consumePinResult}，
     * 确认回调到达时仍要翻成成功（真机 ColorOS 丢请求，但别的 launcher 可能只是慢）。
     */
    @PluginMethod
    public void getPinAttempt(PluginCall call) {
        long requestedAtMs = PinAttemptState.requestedAtMs();
        long backgroundedAtMs = PinAttemptState.backgroundedAtMs();
        long nowMs = System.currentTimeMillis();
        JSObject result = new JSObject();
        result.put("requested", requestedAtMs > 0);
        result.put("requestedAtMs", requestedAtMs);
        result.put("shouldFailFast", PinAttempt.shouldFailFast(requestedAtMs, nowMs, backgroundedAtMs));
        call.resolve(result);
    }

    /**
     * 问一次厂商分诊结果，供 Web 面板决定「显示哪些引导」。
     *
     * <p>无副作用、可重复调用：只做纯字符串识别 + 一次小米能力探测（按进程缓存）。
     *
     * <p>**它不回答「能不能 pin」** —— 那是行为探测的结论（探针 + 确认回调 + 无回调复核）。
     * 返回的 `shortcutHint` / `galleryButton` 都只是「该不该显示入口」，不是「这条路一定有效」。
     */
    @PluginMethod
    public void getPinCapability(PluginCall call) {
        Context context = getContext();
        WidgetVendorFamily family = WidgetVendorFamily.detect(Build.MANUFACTURER, Build.BRAND);
        boolean modern = WidgetVendorSupport.isModern(Build.VERSION.SDK_INT, family);
        boolean detailPageSupported = WidgetVendorProbe.detailPageSupported(context, family);
        if (family == WidgetVendorFamily.XIAOMI) {
            // 真机取证的唯一入口（开放项 V1/V3）：要能区分「不支持小米Widget」与「支持但不支持详情页」。
            WidgetDiagnostics.widgetCenterProbe(WidgetVendorProbe.widgetSupported(context, family), detailPageSupported);
        }

        JSObject result = new JSObject();
        result.put("family", family.wireName());
        result.put("modern", modern);
        result.put("shortcutHint", WidgetVendorSupport.showsShortcutPermissionHint(Build.VERSION.SDK_INT, family));
        result.put("galleryButton", WidgetVendorSupport.showsWidgetGalleryButton(Build.VERSION.SDK_INT, family));
        call.resolve(result);
    }

    /**
     * 「无回调复核」：等待窗口末尾用实例差集判断「桌面上是不是真的多出来一张卡片」。
     *
     * <p><b>为什么需要它</b>：确认回调「成功才触发」，而部分厂商桌面**根本不触发**（见 spec 的 pin 条目）。
     * 只认回调的实现在那些设备上会永远显示「未完成」，哪怕卡片已经躺在桌面上。
     *
     * <p><b>两条边界</b>：
     *
     * <ol>
     *   <li>确认回调已经到过 → 一律 `observed=false`：回调是权威信号，不该被「观察到」的措辞覆盖。</li>
     *   <li>基线不可用（`peek` 返回 `null`，没记录或已超时）→ 差集不成立，`WidgetPinTargets.resolve` 会返回空数组，
     *       因此**不会**误判成功（把差集当全集会把预设写到用户所有旧卡片上）。</li>
     * </ol>
     *
     * <p>只返回 `{observed, count}`，**不返回实例 id**。重复调用会重新计算（差集是确定性的，结论一致）。
     */
    @PluginMethod
    public void consumePinObservation(PluginCall call) {
        Context context = getContext();
        long nowMs = System.currentTimeMillis();

        int observedCount = WidgetPinObservation.consume(nowMs);
        if (observedCount == 0 && !WidgetPinResult.hasConfirmed(nowMs)) {
            // 基线用 peek（不消费）：回调可能在复核之后才到，那时还要用同一份基线兜「回调 id 不可信」。
            int[] fresh = WidgetPinTargets.resolve(
                    WidgetPinBaseline.peek(nowMs), WidgetProviders.allAppWidgetIds(context), -1);
            if (fresh.length > 0) {
                WidgetPinObservation.record(fresh.length, nowMs);
                observedCount = WidgetPinObservation.consume(nowMs);
                WidgetDiagnostics.pinObserved(observedCount);
            }
        }

        JSObject result = new JSObject();
        result.put("observed", observedCount > 0);
        result.put("count", observedCount);
        call.resolve(result);
    }

    /**
     * 小米：「创建桌面快捷方式」权限的导航入口。
     *
     * <p>**只跳转，不判断权限** —— 公开 SDK 里没有 `OP_REQUEST_PIN_SHORTCUT`，想检测只能反射 + 硬编码
     * 操作码，那是私有 API 直连（见 design D4）。所以这里永远只是「把用户送到可能能改的地方」。
     *
     * <p>优先级：MIUI 权限编辑页 → 系统应用详情页 → 什么都不做。任何一步抛 `RuntimeException`
     *（页面存在但不可导出也是常见情形）都按「没启动」如实返回，不崩、不弹红错。
     */
    @PluginMethod
    public void openPinShortcutPermissionSettings(PluginCall call) {
        Context context = getContext();
        String packageName = context.getPackageName();

        Intent miui = new Intent("miui.intent.action.APP_PERM_EDITOR")
                .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                .putExtra("extra_pkgname", packageName)
                .putExtra("extra_type", 1);
        Intent appDetails = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + packageName));

        WidgetPinNavigation.Step step = WidgetPinNavigation.shortcutPermissionStep(
                isResolvable(context, miui), isResolvable(context, appDetails));

        boolean launched = false;
        if (step == WidgetPinNavigation.Step.MIUI_PERMISSION) {
            launched = startQuietly(miui);
        } else if (step == WidgetPinNavigation.Step.APP_DETAILS) {
            launched = startQuietly(appDetails);
        }
        WidgetDiagnostics.pinNavigation(step.wireName(), launched);

        JSObject result = new JSObject();
        result.put("launched", launched);
        result.put("step", step.wireName());
        call.resolve(result);
    }

    /**
     * vivo：跳到「原子组件库」里本应用的页面（vivo 官方适配指南第 7 节）。
     *
     * <p>**同样只跳转**：未上架审核的组件会不会出现在组件库里是未知的（开放项 V5），所以面板上的按钮
     * 只说「打开组件库」，手动步骤仍然常驻。跳不动就静默退回文案。
     */
    @PluginMethod
    public void openWidgetGallery(PluginCall call) {
        Context context = getContext();
        Intent gallery = widgetGalleryIntent(context);
        WidgetPinNavigation.Step step = WidgetPinNavigation.galleryStep(
                gallery != null && isResolvable(context, gallery));

        boolean launched = step == WidgetPinNavigation.Step.WIDGET_GALLERY && startQuietly(gallery);
        WidgetDiagnostics.pinNavigation(step.wireName(), launched);

        JSObject result = new JSObject();
        result.put("launched", launched);
        result.put("step", step.wireName());
        call.resolve(result);
    }

    /**
     * 构造 vivo 组件库跳转 Intent。
     *
     * <p>`classname` 取**注册表里的第一档 provider**：官方文档描述的目标是「该应用适配的所有原子组件的
     * 页面」（不是某一个组件），所以取哪一档不影响落点；取不到任何 provider 时返回 `null`，由调用方按
     * 「这条路走不通」处理。
     */
    private Intent widgetGalleryIntent(Context context) {
        List<ComponentName> renderers = WidgetProviders.renderers(context);
        if (renderers.isEmpty()) {
            return null;
        }
        String providerClassName = renderers.get(0).getClassName();
        return new Intent(Intent.ACTION_VIEW)
                .setPackage(WidgetPinNavigation.VIVO_LAUNCHER_PACKAGE)
                .setData(Uri.parse(WidgetPinNavigation.widgetGalleryUri(context.getPackageName(), providerClassName)));
    }

    /** @return 该 Intent 是否在系统里能解析到目标页；异常一律按「不能」处理。 */
    private boolean isResolvable(Context context, Intent intent) {
        if (context == null || intent == null) {
            return false;
        }
        try {
            return context.getPackageManager().resolveActivity(intent, 0) != null;
        } catch (RuntimeException error) {
            return false;
        }
    }

    /**
     * 启动一个「走不通也无所谓」的页面。
     *
     * <p>`resolveActivity` 通过但 `startActivity` 抛 `SecurityException`（页面存在、但**不可导出**）是
     * MIUI 权限页上真实存在的情形，因此这里必须捕获；返回 `false` 表示「什么都没发生」，调用方只记一条诊断。
     */
    private boolean startQuietly(Intent intent) {
        if (intent == null) {
            return false;
        }
        try {
            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                getContext().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    /**
     * 查询精确闹钟（L3）的可用性，供应用内的精度设置节如实展示当前等级。
     */
    @PluginMethod
    public void getExactAlarmStatus(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
        result.put("available", available);
        result.put("exact", available && canScheduleExactAlarms());
        call.resolve(result);
    }

    /**
     * 跳转系统「闹钟与提醒」设置页。
     *
     * **只跳设置页**：既不在应用内自行请求，也不假装已授权。用户返回后由
     * [@link WidgetExactAlarmWatcher] 或下一次前台刷新重新评估真实状态。
     */
    @PluginMethod
    public void requestExactAlarmPermission(PluginCall call) {
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            // 该权限从 Android 12 才存在，低版本本来就是精确的。
            result.put("launched", false);
            result.put("exact", true);
            call.resolve(result);
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            result.put("launched", true);
        } catch (RuntimeException error) {
            // 部分 ROM 没有这个设置页；不把它当成失败，用户仍可从系统设置手动授权。
            WidgetDiagnostics.exactAlarmUnavailable("unsupported");
            result.put("launched", false);
        }

        result.put("exact", canScheduleExactAlarms());
        call.resolve(result);
    }

    /**
     * 应用回到前台时通知 Web 层重新计算并推送。
     *
     * `Bridge.onResume()` 会遍历已注册插件调用这里，因此不需要额外引入 `@capacitor/app`。
     */
    @Override
    protected void handleOnResume() {
        notifyListeners("resumed", null);
    }

    /**
     * 插件加载时开始观察精确闹钟授权变化。
     *
     * 该广播只能被运行时注册的接收器收到，插件存活期正好覆盖「用户切到系统设置授权再切回来」
     * 这个最常见的路径。
     */
    @Override
    public void load() {
        WidgetExactAlarmWatcher.register(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        WidgetExactAlarmWatcher.unregister(getContext());
    }

    /**
     * 读取当前是否已获得精确闹钟授权。
     *
     * @return API 31 以下恒为 true；以上取决于用户是否在系统设置中授予。
     */
    private boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;

        Context context = getContext();
        if (context == null) return false;
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        return manager != null && manager.canScheduleExactAlarms();
    }
}
