package com.classtrack.app.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.classtrack.app.PinAttemptState
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetPendingPreset
import com.classtrack.app.WidgetPinBaseline
import com.classtrack.app.WidgetPinConfirmation
import com.classtrack.app.WidgetPinResult
import com.classtrack.app.WidgetPinTargets
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * 「添加到桌面」的确认回调。
 *
 * <p>**为什么必须走这条回调**：`requestPinAppWidget` 的返回值只表示"请求已受理"，与是否真的放下无关；
 * 而是否弹确认界面完全由 launcher 决定（真机 ColorOS 实测：launcher 起了 `AddItemActivity`
 * （`CONFIRM_PIN_APPWIDGET`）却从不置前，最终一个小工具都没放下，而我们的面板却已经显示"已添加"）。
 * 因此只有本回调才意味着成功。但**回调带回的 id 不可信**：实测 AOSP Launcher3 发的
 * `EXTRA_APPWIDGET_ID` 是 `0`（真实新实例是 8），于是 `getGlanceIdBy(0)` 抛异常、预设静默丢失 ——
 * 所以目标实例由 [WidgetPinTargets] 两级判决：信得过就用回调 id，否则用「请求前后实例集合的差集」。
 *
 * <p>本类只做两件事，都用不到主线程：
 *
 * <ol>
 *   <li>把「待消费预设」写进**这一个**实例（确定性的 id，不需要"猜哪个实例是新的"）；</li>
 *   <li>把确认结果记进 [WidgetPinResult]，等 Web 侧面板轮询取走。</li>
 * </ol>
 *
 * <p>**`goAsync()` 在这里是允许的**：spec 里「绝不 goAsync」那条规则针对的是 `AppWidgetProvider` 的回调
 * （那里的 `pendingResult` 可能为 null，且被 kill 会让卡片停在 `initialLayout`）；本类只是普通
 * `BroadcastReceiver`，且必须异步写 Glance 状态。仍然判空、且任何路径都要 `finish()`，不能把广播拖死。
 */
class WidgetPinResultReceiver : BroadcastReceiver() {

    companion object {
        /** 确认回调的广播 action（只在本应用内部使用）。 */
        const val ACTION_PIN_CONFIRMED = "com.classtrack.app.action.PIN_CONFIRMED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val callbackAppWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        )
        WidgetDiagnostics.pinConfirmed(callbackAppWidgetId)
        // 这次尝试结束了：清掉观测事实，面板下一次请求从零开始（否则旧的「退过后台」会污染下次判定）。
        PinAttemptState.clear()

        val applicationContext = context.applicationContext
        val provider = ComponentName(applicationContext, ClassTrackWidgetReceiver::class.java)
        val manager = AppWidgetManager.getInstance(applicationContext)
        val current = manager.getAppWidgetIds(provider)
        val baseline = WidgetPinBaseline.consume(System.currentTimeMillis())
        val targets = WidgetPinTargets.resolve(baseline, current, callbackAppWidgetId)
        if (targets.isEmpty()) {
            // 找不到用户刚放下的实例：宁可什么都不写，也不能猜一个（会把预设盖到别人的卡片上）。
            // 预设槽位**不消费** —— 若 launcher 随后拉起配置页，它仍能拿到这个预设。
            WidgetDiagnostics.pinConfirmedUnresolved()
            return
        }

        val pending = WidgetPendingPreset.peek()
        val config = WidgetPinConfirmation.planFor(targets.first(), pending)
        if (config == null) {
            // 没有待消费预设（用户没选预设、或槽位已超时）：只记日志，不替用户改样式。
            return
        }

        // Web 侧只关心「真的放下了」：目标实例已确定，趁早记下来，避免用户等满 10 秒。
        WidgetPinResult.recordConfirmed(targets.first(), System.currentTimeMillis())

        val pendingResult = goAsync() ?: return
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        scope.launch {
            try {
                val glanceIds = GlanceAppWidgetManager(applicationContext)
                for (target in targets) {
                    WidgetStyleState.write(applicationContext, glanceIds.getGlanceIdBy(target), config)
                }
                // 写成功才消费槽位：写失败时留着它，用户下次手动放置仍能拿到这个预设。
                WidgetPendingPreset.consume()
                WidgetRefreshBridge.requestRefresh(applicationContext)
            } catch (error: RuntimeException) {
                WidgetDiagnostics.styleWriteFailed()
            } catch (error: IOException) {
                WidgetDiagnostics.styleWriteFailed()
            } finally {
                pendingResult.finish()
            }
        }
    }
}
