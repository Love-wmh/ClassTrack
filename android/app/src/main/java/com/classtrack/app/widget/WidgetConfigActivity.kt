package com.classtrack.app.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.classtrack.app.R
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetStyleConfig
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * 单个 widget 实例的样式配置页。
 *
 * 由 launcher 在**放置时**通过 provider 的 `android:configure` 打开；放置之后也可以从 widget 里的
 * 「样式」入口再次打开（`ACTION_APPWIDGET_CONFIGURE`）。配置按实例保存，因此桌面上可以有多个
 * 样式各不相同的实例。
 *
 * **安全边界**（本 Activity 必须 `exported="true"` 才能被 launcher 拉起，因此这是新增攻击面）：
 * 1. `EXTRA_APPWIDGET_ID` 一律当作不可信输入：必须存在、且 provider 就是本应用的小工具接收器，
 *    否则立即以 `RESULT_CANCELED` 退出，不做任何写入；
 * 2. 页面**不显示任何课程数据**，只有样式名与静态示意图，所以即使被第三方应用启动也读不到课表；
 * 3. Intent 里只有整数 widgetId，不接收 URL、文件或任意 payload。
 */
class WidgetConfigActivity : AppCompatActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private lateinit var layoutGroup: RadioGroup
    private lateinit var finishedGroup: RadioGroup
    private lateinit var finishedSection: TextView
    private lateinit var finishedHint: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 放置流程要求：默认返回 CANCELED，只有用户点了「确定」才改成 OK。
        // 否则用户中途退出会被 launcher 当成「已成功添加」，桌面上留下一个没配置过的实例。
        setResult(Activity.RESULT_CANCELED)

        appWidgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (!belongsToThisApp(appWidgetId)) {
            WidgetDiagnostics.configRejected(REJECT_REASON)
            finish()
            return
        }

        setContentView(R.layout.activity_widget_config)
        layoutGroup = findViewById(R.id.widget_config_layout_group)
        finishedGroup = findViewById(R.id.widget_config_finished_group)
        finishedSection = findViewById(R.id.widget_config_finished_section)
        finishedHint = findViewById(R.id.widget_config_finished_hint)

        layoutGroup.setOnCheckedChangeListener { _, _ -> updateFinishedSectionState() }
        findViewById<Button>(R.id.widget_config_confirm).setOnClickListener { saveAndFinish() }
        findViewById<Button>(R.id.widget_config_cancel).setOnClickListener { finish() }

        restoreSelection()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    /**
     * 校验 widgetId 确实属于本应用。
     *
     * @param id 来自 Intent 的实例 id。
     * @return 该 id 有效，且其 provider 就是本应用的小工具接收器。
     */
    private fun belongsToThisApp(id: Int): Boolean {
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return false

        val info = AppWidgetManager.getInstance(this).getAppWidgetInfo(id) ?: return false
        return info.provider == ComponentName(this, ClassTrackWidgetReceiver::class.java)
    }

    /** 读取该实例已保存的配置并回显到选项上。 */
    private fun restoreSelection() {
        scope.launch {
            val stored = try {
                val glanceId = GlanceAppWidgetManager(this@WidgetConfigActivity).getGlanceIdBy(appWidgetId)
                WidgetStyleState.read(this@WidgetConfigActivity, glanceId)
            } catch (error: RuntimeException) {
                WidgetStyleConfig.defaults()
            } catch (error: IOException) {
                WidgetStyleConfig.defaults()
            }

            layoutGroup.check(layoutRadioId(stored.layoutStyle))
            finishedGroup.check(finishedRadioId(stored.finishedPolicy))
            updateFinishedSectionState()
        }
    }

    /**
     * 保存并只刷新这一个实例。
     *
     * 保存动作交给应用级作用域的 [WidgetConfigBridge]：本页随后就会 `finish()`，
     * 写在自己作用域上会随页面取消，表现为「设置了但没生效」。
     */
    private fun saveAndFinish() {
        WidgetConfigBridge.save(applicationContext, appWidgetId, WidgetStyleConfig(selectedLayout(), selectedFinishedPolicy()))
        setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        finish()
    }

    /**
     * 「紧凑」样式不显示课程列表，因此「已上完的课」对它没有效果。
     *
     * 这里把该区块整体弱化并给出说明，而不是默默无视用户的点击 —— 否则用户会以为设置坏了。
     */
    private fun updateFinishedSectionState() {
        val effective = WidgetStyleConfig(selectedLayout(), selectedFinishedPolicy()).isFinishedPolicyEffective
        val alpha = if (effective) ENABLED_ALPHA else DISABLED_ALPHA

        finishedSection.alpha = alpha
        finishedGroup.alpha = alpha
        for (index in 0 until finishedGroup.childCount) {
            finishedGroup.getChildAt(index).isEnabled = effective
        }
        finishedHint.visibility = if (effective) View.GONE else View.VISIBLE
    }

    private fun selectedLayout(): WidgetStyleConfig.LayoutStyle = when (layoutGroup.checkedRadioButtonId) {
        R.id.widget_config_layout_next_up -> WidgetStyleConfig.LayoutStyle.NEXT_UP
        R.id.widget_config_layout_compact -> WidgetStyleConfig.LayoutStyle.COMPACT
        else -> WidgetStyleConfig.LayoutStyle.DAY_LIST
    }

    private fun selectedFinishedPolicy(): WidgetStyleConfig.FinishedPolicy = when (finishedGroup.checkedRadioButtonId) {
        R.id.widget_config_finished_hide -> WidgetStyleConfig.FinishedPolicy.HIDE
        R.id.widget_config_finished_collapse -> WidgetStyleConfig.FinishedPolicy.COLLAPSE
        else -> WidgetStyleConfig.FinishedPolicy.SHOW_DIM
    }

    private fun layoutRadioId(style: WidgetStyleConfig.LayoutStyle): Int = when (style) {
        WidgetStyleConfig.LayoutStyle.NEXT_UP -> R.id.widget_config_layout_next_up
        WidgetStyleConfig.LayoutStyle.COMPACT -> R.id.widget_config_layout_compact
        else -> R.id.widget_config_layout_day_list
    }

    private fun finishedRadioId(policy: WidgetStyleConfig.FinishedPolicy): Int = when (policy) {
        WidgetStyleConfig.FinishedPolicy.HIDE -> R.id.widget_config_finished_hide
        WidgetStyleConfig.FinishedPolicy.COLLAPSE -> R.id.widget_config_finished_collapse
        else -> R.id.widget_config_finished_show_dim
    }

    private companion object {
        /** 拒绝原因分类；必须与 `WidgetDiagnostics` 的白名单一致。 */
        const val REJECT_REASON = "invalid_widget_id"

        /** 有效选项的视觉强度。 */
        const val ENABLED_ALPHA = 1.0f

        /** 无效选项的视觉强度。 */
        const val DISABLED_ALPHA = 0.4f
    }
}
