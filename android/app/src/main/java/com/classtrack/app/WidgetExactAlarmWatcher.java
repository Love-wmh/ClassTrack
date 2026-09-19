package com.classtrack.app;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import com.classtrack.app.widget.WidgetRefreshBridge;

/**
 * 观察「闹钟与提醒」授权的授予/撤销（L3 精度的开关）。
 *
 * 用户在系统设置里改完权限后，系统会发出
 * {@link AlarmManager#ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED}，但它**只能被
 * 运行时注册的接收器收到**（manifest 声明收不到）。因此这里在插件加载时注册、销毁时反注册，
 * 覆盖住「用户切到系统设置授权再切回来」这个最常见的路径。
 *
 * 无论授权是变成 granted 还是 revoked，都直接走同一条幂等刷新：授予时重新武装精确闹钟，
 * 撤销时精确闹钟的重新武装会自动取消它并回退到 WorkManager。因此这里
 * 不需要分支判断，也不会因为状态竞态而留下悬空的闹钟。
 */
public final class WidgetExactAlarmWatcher {
    private WidgetExactAlarmWatcher() {}

    private static boolean registered;

    private static final BroadcastReceiver RECEIVER = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (context == null) return;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
            if (!AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(intent.getAction())) return;
            // Java 调用 Kotlin 的全部跨语言面就是这一个静态方法。
            WidgetRefreshBridge.requestRefresh(context);
        }
    };

    /**
     * 注册授权变化监听；重复调用是安全的。
     *
     * @param context 任意 Context。
     */
    public static void register(Context context) {
        if (registered || context == null) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;

        try {
            context.getApplicationContext().registerReceiver(RECEIVER,
                    new IntentFilter(AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED));
            registered = true;
        } catch (RuntimeException ignored) {
            // 注册失败只意味着少了一条精度回调，L3 仍会在下一次刷新时重新评估，不影响可用性。
            registered = false;
        }
    }

    /**
     * 反注册监听；未注册时是安全的空操作。
     *
     * @param context 任意 Context。
     */
    public static void unregister(Context context) {
        if (!registered || context == null) return;

        try {
            context.getApplicationContext().unregisterReceiver(RECEIVER);
        } catch (RuntimeException ignored) {
            // 已经不存在（例如进程被回收）时无需处理。
        } finally {
            registered = false;
        }
    }
}
