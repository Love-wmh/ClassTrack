package com.classtrack.app.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * L3 精确闹钟的落点。
 *
 * 由 [WidgetBoundaryAlarms] 的 `PendingIntent` 触发，整条边界链就是靠它一格一格往下走：
 * 收到后重算一次，并把下一个边界重新武装。它同样必须在进程冷启动时可用，因此不依赖
 * Activity 或 Bridge，只走共用的幂等入口。
 *
 * 接收器在 manifest 里声明为 `exported=false`：只有我们自己的 `PendingIntent` 能触发它。
 */
class WidgetBoundaryAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_BOUNDARY_ALARM) return

        val pending = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                WidgetRefreshController.refresh(appContext, TRIGGER)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        /** 只在本包内使用，但接收器需要能被 manifest 按名字实例化，因此这里是 public。 */
        const val ACTION_BOUNDARY_ALARM = "com.classtrack.app.action.WIDGET_BOUNDARY_ALARM"

        private const val TRIGGER = "boundary_alarm"
    }
}
