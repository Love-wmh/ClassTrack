package com.classtrack.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 更新检测用到的原生能力。
 *
 * <p>目前只有一个方法：跳到本应用的通知设置页。之所以需要原生实现 —— Web 层拿不到任何能打开系统
 * 设置页的能力，`@capacitor/local-notifications` 与 `@capacitor/app` 都没有这个 API，
 * 而「通知权限被拒绝」时必须给用户一条能自己走通的路（参考 {@code WidgetSnapshotPlugin} 里
 * {@code requestExactAlarmPermission} 的同类做法）。
 *
 * <p>方法与 {@code NotificationSettingsTargets} 的职责边界：本类只做 Intent 装配与错误吞咽，
 * 「该跳哪几页、按什么顺序、什么值算合法」全在纯类里，那部分由 JVM 单测钉住。
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    /**
     * 打开本应用的通知设置页。
     *
     * <p>入参：`channelId`（可选）—— 有值时优先直达该渠道的设置页，用户能单独开关「应用更新」这一类提醒。
     *
     * <p>**永不 reject**：调用方在设置卡片里，失败只意味着「这个 ROM 没有这一页」，应当给文案提示
     * 而不是抛错。返回值 `{ launched: boolean }`，`false` 表示三级候选全部起不来。
     */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        JSObject result = new JSObject();
        result.put("launched", false);

        if (getActivity() == null) {
            // Activity 已销毁（例如正在后台收到调用）时什么都不做。
            call.resolve(result);
            return;
        }

        String packageName = getContext().getPackageName();
        for (NotificationSettingsTargets.Target target : NotificationSettingsTargets.ordered(
                Build.VERSION.SDK_INT, packageName, call.getString("channelId"))) {
            try {
                Intent intent = new Intent(target.action).setData(Uri.parse(target.data));
                if (target.extraKey != null) {
                    intent.putExtra(target.extraKey, target.extraValue);
                }
                getActivity().startActivity(intent);
                result.put("launched", true);
                break;
            } catch (RuntimeException error) {
                // 这一页在这个 ROM 上不存在（或渠道已被删除）：继续试下一个目标。
            }
        }

        call.resolve(result);
    }
}
