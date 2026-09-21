package com.classtrack.app.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.RadioGroup
import android.widget.TextView
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.appcompat.app.AppCompatActivity
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.classtrack.app.R
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetPendingPreset
import com.classtrack.app.WidgetProviders
import com.classtrack.app.WidgetStyleConfig
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
 * 2. 页面里的三张样式预览是**真实合成结果**（同一份快照数据 + 该实例的真实尺寸），因此页面上会出现
 *    课程数据。这是 2026-09-20 按用户要求（「预览必须和真实小工具一样」）做的取舍：第三方应用只要
 *    拿到一个**有效**的 widgetId 就能拉起本页看到课表。之所以接受：这些数据本来就贴在桌面上，
 *    攻击者要读取本页内容仍需额外权限（无障碍/投屏授权），且本页不把数据回传给调用方；
 * 3. Intent 里只有整数 widgetId，不接收 URL、文件或任意 payload。
 */
class WidgetConfigActivity : AppCompatActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    /** 正在进行的预览渲染；连续切换选项时只保留最后一次结果。 */
    private var previewJob: Job? = null

    private lateinit var layoutGroup: RadioGroup
    private lateinit var finishedGroup: RadioGroup
    private lateinit var finishedSection: TextView
    private lateinit var finishedHint: TextView
    private lateinit var wideGroup: RadioGroup
    private lateinit var wideSection: TextView
    private lateinit var wideHint: TextView
    private lateinit var presetHint: TextView
    private lateinit var previewDayList: FrameLayout
    private lateinit var previewNextUp: FrameLayout
    private lateinit var previewCompact: FrameLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 放置流程要求：默认返回 CANCELED，只有用户点了「确定」才改成 OK。
        // 否则用户中途退出会被 launcher 当成「已成功添加」，桌面上留下一个没配置过的实例。
        setResult(Activity.RESULT_CANCELED)

        appWidgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID

        val rejectReason = rejectReason(appWidgetId)
        if (rejectReason != null) {
            WidgetDiagnostics.configRejected(rejectReason)
            finish()
            return
        }

        setContentView(R.layout.activity_widget_config)
        layoutGroup = findViewById(R.id.widget_config_layout_group)
        finishedGroup = findViewById(R.id.widget_config_finished_group)
        finishedSection = findViewById(R.id.widget_config_finished_section)
        finishedHint = findViewById(R.id.widget_config_finished_hint)
        wideGroup = findViewById(R.id.widget_config_wide_group)
        wideSection = findViewById(R.id.widget_config_wide_section)
        wideHint = findViewById(R.id.widget_config_wide_hint)
        presetHint = findViewById(R.id.widget_config_preset_hint)
        previewDayList = findViewById(R.id.widget_config_preview_day_list)
        previewNextUp = findViewById(R.id.widget_config_preview_next_up)
        previewCompact = findViewById(R.id.widget_config_preview_compact)

        layoutGroup.setOnCheckedChangeListener { _, _ ->
            // 「紧凑」既不显示列表，也就同时让「已上完」与「大格子表现」失效，两处灰显一起更新。
            updateFinishedSectionState()
            updateWideSectionState()
        }
        // 预览随「已上完」的选项实时重渲：这个选项直接决定列表里有几行。
        finishedGroup.setOnCheckedChangeListener { _, _ -> requestPreviews() }
        // 「大格子表现」同样会改变列表内容，改一个选项就要重渲三张预览。
        wideGroup.setOnCheckedChangeListener { _, _ ->
            updateWideSectionState()
            requestPreviews()
        }
        findViewById<Button>(R.id.widget_config_confirm).setOnClickListener { saveAndFinish() }
        findViewById<Button>(R.id.widget_config_cancel).setOnClickListener { finish() }

        restoreSelection()

        // 预览按实例的真实尺寸渲染，需要等第一遍布局量出可用宽度之后才能定缩放比例。
        window.decorView.post { requestPreviews() }
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
    /**
     * 校验 widgetId 确实属于本应用。
     *
     * @param id 来自 Intent 的实例 id。
     * @return `null` 表示通过；否则是**白名单里的**拒绝原因（写日志用，不含任何用户数据）。
     */
    private fun rejectReason(id: Int): String? {
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return REJECT_REASON_INVALID
        val info = AppWidgetManager.getInstance(this).getAppWidgetInfo(id) ?: return REJECT_REASON_UNKNOWN_INSTANCE
        // 接受**全部** provider（2×2 / 2×3 / 4×2 / 4×3 / 6×3）：只认某一个会让其它档的实例
        // 点「样式」时被我们自己的校验拒掉，用户看到的是「设置打不开」。
        return if (WidgetProviders.isOurs(info.provider)) null else REJECT_REASON_FOREIGN_PROVIDER
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

            // 应用内「添加到桌面」带过来的预设：**只在本次配置流程里预选**，用户改了就按用户改的存。
            // 一次性消费（读取即清），因此不会影响之后新增的实例。
            val preset = WidgetPendingPreset.consume(System.currentTimeMillis())
            val effective = if (preset == null) {
                stored
            } else {
                WidgetDiagnostics.presetApplied(preset.getId())
                presetHint.text = getString(R.string.widget_config_preset_hint, preset.getCellLabel())
                presetHint.visibility = View.VISIBLE
                WidgetStyleConfig(preset.getLayoutStyle(), stored.finishedPolicy, preset.getWideLayout())
            }

            layoutGroup.check(layoutRadioId(effective.layoutStyle))
            finishedGroup.check(finishedRadioId(effective.finishedPolicy))
            wideGroup.check(wideRadioId(effective.wideLayout))
            updateFinishedSectionState()
            updateWideSectionState()
        }
    }

    /**
     * 保存并只刷新这一个实例。
     *
     * 保存动作交给应用级作用域的 [WidgetConfigBridge]：本页随后就会 `finish()`，
     * 写在自己作用域上会随页面取消，表现为「设置了但没生效」。
     */
    private fun saveAndFinish() {
        WidgetConfigBridge.save(
            applicationContext,
            appWidgetId,
            WidgetStyleConfig(selectedLayout(), selectedFinishedPolicy(), selectedWideLayout())
        )
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

    /**
     * 「大格子表现」在「紧凑」样式下三项都无从生效，因此整组弱化并说明，而不是默默无视。
     *
     * 与 [updateFinishedSectionState] 同一判据（都来自 [WidgetStyleConfig.isWideLayoutEffective]），
     * 页面与渲染层因此不会出现「页面说有效、渲染却不生效」的矛盾。
     */
    private fun updateWideSectionState() {
        val effective = WidgetStyleConfig(selectedLayout(), selectedFinishedPolicy(), selectedWideLayout())
            .isWideLayoutEffective
        val alpha = if (effective) ENABLED_ALPHA else DISABLED_ALPHA

        wideSection.alpha = alpha
        wideGroup.alpha = alpha
        for (index in 0 until wideGroup.childCount) {
            wideGroup.getChildAt(index).isEnabled = effective
        }
        wideHint.visibility = if (effective) View.GONE else View.VISIBLE
    }

    /**
     * 请求重渲三张样式预览。
     *
     * 取消上一次尚未完成的渲染：连续点选项时只有最后一次结果该落到界面上。
     */
    private fun requestPreviews() {
        previewJob?.cancel()
        previewJob = scope.launch { renderPreviews() }
    }

    /**
     * 用**真实合成结果**渲染三张样式预览。
     *
     * 解析快照要读 SharedPreferences 并解析上百 KB JSON，放到默认调度器；`RemoteViews.apply`
     * 会 inflate 视图，必须留在主线程。
     *
     * 三张预览都用当前选中的「已上完」策略，因此用户一改选项就能看到列表怎么变。
     */
    private suspend fun renderPreviews() {
        val state = withContext(Dispatchers.Default) {
            WidgetRefreshController.resolveCurrentState(applicationContext, System.currentTimeMillis())
        }
        val size = instanceSizeDp()
        val scale = previewScale(size)
        WidgetDiagnostics.previewSized(size.width.value.toInt(), size.height.value.toInt())

        for ((container, style) in previewTargets()) {
            val config = WidgetStyleConfig(style, selectedFinishedPolicy())
            val rendered = withContext(Dispatchers.Default) {
                WidgetPreviewRenderer.render(applicationContext, size, state, config, appWidgetId)
            } ?: continue
            // 预览只是「锦上添花」：渲染或显示万一失败，也绝不能让配置页崩掉——否则用户连样式都改不回来。
            try {
                showPreview(container, rendered, size, scale)
            } catch (error: RuntimeException) {
                WidgetDiagnostics.previewFailed()
            }
        }
    }

    /** @return 三种样式各自要填的预览容器。 */
    private fun previewTargets(): List<Pair<FrameLayout, WidgetStyleConfig.LayoutStyle>> = listOf(
        previewDayList to WidgetStyleConfig.LayoutStyle.DAY_LIST,
        previewNextUp to WidgetStyleConfig.LayoutStyle.NEXT_UP,
        previewCompact to WidgetStyleConfig.LayoutStyle.COMPACT
    )

    /**
     * 该实例的格子尺寸：预览就按这个尺寸渲染。
     *
     * `OPTION_APPWIDGET_MIN_WIDTH/HEIGHT` 在 Android 12+ 由 launcher 随缩放更新，拿到的就是当前格子
     * 大小；取不到时退化为约 4×3 的常见尺寸。
     *
     * 小工具用 `SizeMode.Exact`，真实渲染用的就是这个尺寸，所以预览与桌面卡片画在同一张画布上。
     * 反过来，上一版声明了几档固定候选尺寸，真实渲染用的是「命中那一档」、比格子小：预览列出三行课、
     * 桌面只剩 hero；若按候选尺寸画预览，课程名又会被截成「毛泽东思…」。
     *
     * @return 预览画布尺寸（dp）。
     */
    private fun instanceSizeDp(): DpSize {
        val options = AppWidgetManager.getInstance(this).getAppWidgetOptions(appWidgetId)
        val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, DEFAULT_PREVIEW_WIDTH_DP)
        val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, DEFAULT_PREVIEW_HEIGHT_DP)
        return DpSize(width.coerceAtLeast(MIN_PREVIEW_DP).dp, height.coerceAtLeast(MIN_PREVIEW_DP).dp)
    }

    /**
     * 预览的等比缩放比例。
     *
     * 只做视觉缩放、**不改渲染尺寸**：改渲染尺寸会让 Glance 按新高度挑另一套布局分支，预览就会
     * 显示真实小工具上不存在的内容。
     *
     * @param size 实例真实尺寸。
     * @return 不超过 1 的缩放比例。
     */
    private fun previewScale(size: DpSize): Float {
        val slotWidthPx = previewDayList.width
        if (slotWidthPx <= 0) return 1f
        val realWidthPx = size.width.value * resources.displayMetrics.density
        if (realWidthPx <= 0f) return 1f
        return (slotWidthPx / realWidthPx).coerceAtMost(1f)
    }

    /**
     * 把一张真实渲染结果放进预览容器。
     *
     * @param container 预览容器。
     * @param remoteViews 真实合成的结果。
     * @param size 实例真实尺寸（dp）。
     * @param scale 等比缩放比例。
     */
    private fun showPreview(container: FrameLayout, remoteViews: RemoteViews, size: DpSize, scale: Float) {
        val density = resources.displayMetrics.density
        val widthPx = (size.width.value * density).toInt()
        val heightPx = (size.height.value * density).toInt()

        // 必须用 Application 上下文 inflate：Activity 的 LayoutInflater 上装着 AppCompat 的视图替换工厂，
        // 会把 RemoteViews 布局里的框架控件换成 AppCompat* 版本，而 RemoteViews 的反射只接受框架类，
        // apply() 时会直接抛 ActionException 崩掉进程（真机 Android 16 实测）。宿主 launcher 没有这个工厂，
        // 因此 Application 上下文才等价于宿主实际 inflate 出来的布局。
        val view = remoteViews.apply(applicationContext, container)
        container.removeAllViews()
        container.addView(view, FrameLayout.LayoutParams(widthPx, heightPx))

        view.pivotX = 0f
        view.pivotY = 0f
        view.scaleX = scale
        view.scaleY = scale

        // 缩放是绘制期变换，不会改变测量结果，所以容器高度要显式按缩放后的尺寸给。
        container.layoutParams = container.layoutParams.apply { height = (heightPx * scale).toInt() }
        container.requestLayout()
    }

    private fun selectedLayout(): WidgetStyleConfig.LayoutStyle = when (layoutGroup.checkedRadioButtonId) {
        R.id.widget_config_layout_next_up -> WidgetStyleConfig.LayoutStyle.NEXT_UP
        R.id.widget_config_layout_compact -> WidgetStyleConfig.LayoutStyle.COMPACT
        R.id.widget_config_layout_day_list -> WidgetStyleConfig.LayoutStyle.DAY_LIST
        // 默认（含未选中）都是「自动」：它也是新实例的默认状态。
        else -> WidgetStyleConfig.LayoutStyle.AUTO
    }

    private fun selectedFinishedPolicy(): WidgetStyleConfig.FinishedPolicy = when (finishedGroup.checkedRadioButtonId) {
        R.id.widget_config_finished_hide -> WidgetStyleConfig.FinishedPolicy.HIDE
        R.id.widget_config_finished_collapse -> WidgetStyleConfig.FinishedPolicy.COLLAPSE
        else -> WidgetStyleConfig.FinishedPolicy.SHOW_DIM
    }

    private fun layoutRadioId(style: WidgetStyleConfig.LayoutStyle): Int = when (style) {
        WidgetStyleConfig.LayoutStyle.NEXT_UP -> R.id.widget_config_layout_next_up
        WidgetStyleConfig.LayoutStyle.COMPACT -> R.id.widget_config_layout_compact
        WidgetStyleConfig.LayoutStyle.DAY_LIST -> R.id.widget_config_layout_day_list
        else -> R.id.widget_config_layout_auto
    }

    private fun selectedWideLayout(): WidgetStyleConfig.WideLayout = when (wideGroup.checkedRadioButtonId) {
        R.id.widget_config_wide_dense -> WidgetStyleConfig.WideLayout.DENSE
        R.id.widget_config_wide_two_column -> WidgetStyleConfig.WideLayout.TWO_COLUMN
        else -> WidgetStyleConfig.WideLayout.ADAPTIVE
    }

    private fun wideRadioId(wide: WidgetStyleConfig.WideLayout): Int = when (wide) {
        WidgetStyleConfig.WideLayout.DENSE -> R.id.widget_config_wide_dense
        WidgetStyleConfig.WideLayout.TWO_COLUMN -> R.id.widget_config_wide_two_column
        else -> R.id.widget_config_wide_adaptive
    }

    private fun finishedRadioId(policy: WidgetStyleConfig.FinishedPolicy): Int = when (policy) {
        WidgetStyleConfig.FinishedPolicy.HIDE -> R.id.widget_config_finished_hide
        WidgetStyleConfig.FinishedPolicy.COLLAPSE -> R.id.widget_config_finished_collapse
        else -> R.id.widget_config_finished_show_dim
    }

    private companion object {
        /** 拒绝原因分类；必须与 `WidgetDiagnostics` 的白名单一致。 */
        const val REJECT_REASON_INVALID = "invalid_widget_id"

        /** 系统查不到这个实例（已删除 / 尚未绑定）。 */
        const val REJECT_REASON_UNKNOWN_INSTANCE = "unknown_instance"

        /** 实例的 provider 不是我们的小工具。 */
        const val REJECT_REASON_FOREIGN_PROVIDER = "foreign_provider"

        /** 取不到实例尺寸时的退化尺寸（约 4×3 格），避免预览塌成 0 高。 */
        const val DEFAULT_PREVIEW_WIDTH_DP = 250
        const val DEFAULT_PREVIEW_HEIGHT_DP = 180

        /** 画布尺寸下限：异常选项不该把预览压成一条线。 */
        const val MIN_PREVIEW_DP = 80

        /** 有效选项的视觉强度。 */
        const val ENABLED_ALPHA = 1.0f

        /** 无效选项的视觉强度。 */
        const val DISABLED_ALPHA = 0.4f
    }
}
