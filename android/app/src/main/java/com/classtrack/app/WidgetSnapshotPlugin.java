package com.classtrack.app;

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

import com.classtrack.app.widget.ClassTrackWidgetReceiver;
import com.classtrack.app.widget.WidgetPinResultReceiver;
import com.classtrack.app.widget.WidgetRefreshBridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;

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

        WidgetPendingPreset.set(preset.getId(), System.currentTimeMillis());
        // 记录「请求前已有哪些实例」：回调带回的 id 不可信（实测 AOSP Launcher3 发回 0），
        // 需要用它做差集找出用户刚放下的实例（见 WidgetPinTargets）。
        WidgetPinBaseline.record(
                manager.getAppWidgetIds(new ComponentName(context, ClassTrackWidgetReceiver.class)),
                System.currentTimeMillis());

        Bundle extras = new Bundle();
        extras.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, Math.round(preset.getWidthDp()));
        extras.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, Math.round(preset.getHeightDp()));

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
            requested = manager.requestPinAppWidget(
                    new ComponentName(context, ClassTrackWidgetReceiver.class), extras, callback);
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
