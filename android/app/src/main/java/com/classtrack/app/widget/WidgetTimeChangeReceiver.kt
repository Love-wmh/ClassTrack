package com.classtrack.app.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * L2 精度层：跨零点、用户改时间、换时区时**立即**重算重排。
 *
 * 这三个广播在处理系统的隐式广播豁免清单里，因此可以用 manifest 声明接收，而且
 * `ACTION_DATE_CHANGED` 精确发生在本地零点 —— 这一步把「跨零点后仍显示昨天的剩余课程」
 * 这个真实缺陷压到零窗口，且完全不需要任何权限。
 *
 * 它是**跨进程**被唤醒的：此时可能既没有 Activity 也没有 Capacitor Bridge，因此这里
 * 只调用与 WorkManager 任务共用的幂等入口，不依赖任何前台状态。
 */
class WidgetTimeChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in WATCHED_ACTIONS) return

        // 接收器在主线程回调，且必须在数秒内返回；goAsync 让重算可以在后台线程完成。
        // goAsync() 在极端时序下可能返回 null；判空而不是直接 finish()，
        // 否则会以 NPE 杀掉整个进程（这类崩溃曾让小工具反复显示空白）。
        val pending = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                WidgetRefreshController.refresh(appContext, TRIGGER)
            } finally {
                pending?.finish()
            }
        }
    }

    private companion object {
        const val TRIGGER = "time_change"

        val WATCHED_ACTIONS = setOf(
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED
        )
    }
}
