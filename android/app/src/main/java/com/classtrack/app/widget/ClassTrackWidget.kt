package com.classtrack.app.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.classtrack.app.MainActivity
import com.classtrack.app.R
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetOccurrence
import com.classtrack.app.WidgetPendingRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 声明支持的尺寸；实际用哪套布局由 [LocalSize] 的当前高度决定。 */
private val SUPPORTED_SIZES = setOf(
    DpSize(180.dp, 60.dp),
    DpSize(250.dp, 140.dp),
    DpSize(250.dp, 200.dp)
)

/**
 * ClassTrack 桌面小工具。
 *
 * 它只负责渲染已经解析好的状态：所有「现在该显示哪节课」的判断都在
 * [WidgetRefreshController.resolveCurrentState] 里完成，因此这里没有任何时间比较，
 * 也就不会出现「渲染逻辑和排程逻辑各算一套」的分叉。
 */
class ClassTrackWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Responsive(SUPPORTED_SIZES)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // SharedPreferences 读取 + 上百 KB JSON 解析放到 IO 线程，不要占用 Glance 的合成线程。
        val state = withContext(Dispatchers.IO) {
            WidgetRefreshController.resolveCurrentState(context, System.currentTimeMillis())
        }
        provideContent { WidgetContent(state) }
    }

    override fun onCompositionError(context: Context, appWidgetId: GlanceId, appWidgetErrorCode: Int, throwable: Throwable) {
        WidgetDiagnostics.compositionFailed(appWidgetErrorCode, throwable)
        super.onCompositionError(context, appWidgetId, appWidgetErrorCode, throwable)
    }
}

@Composable
private fun WidgetContent(state: WidgetDisplayState) {
    val context = LocalContext.current
    val availableHeight = LocalSize.current.height

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(ColorProvider(R.color.widget_surface))
            .cornerRadius(16.dp)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .clickable(actionStartActivity(scheduleIntent(context))),
    ) {
        val hero = state.hero
        if (!state.isReady || hero == null) {
            Text(text = promptText(context, state), maxLines = 3, style = bodyStyle(R.color.widget_text_muted))
            return@Column
        }

        HeroSection(context, state, hero)

        val maxRows = maxRemainingRows(availableHeight)
        val remaining = state.todayRemaining
        if (maxRows > 0 && remaining.isNotEmpty()) {
            Spacer(modifier = GlanceModifier.height(8.dp))
            Text(text = context.getString(R.string.widget_today_remaining), maxLines = 1, style = captionStyle(R.color.widget_text_muted))
            remaining.take(maxRows).forEach { occurrence -> RemainingRow(occurrence) }
            val hidden = remaining.size - maxRows
            if (hidden > 0) {
                Text(text = context.getString(R.string.widget_more_remaining, hidden), maxLines = 1, style = captionStyle(R.color.widget_text_muted))
            }
        }
    }
}

@Composable
private fun HeroSection(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence) {
    val label = when (state.heroState) {
        WidgetDisplayState.HeroState.IN_PROGRESS -> context.getString(R.string.widget_hero_in_progress)
        WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY ->
            context.getString(R.string.widget_hero_upcoming_other_day, hero.weekdayLabel)
        else -> context.getString(R.string.widget_hero_upcoming, hero.sections)
    }
    Text(text = label, maxLines = 1, style = captionStyle(R.color.widget_accent))

    Text(text = hero.name, maxLines = 2, style = titleStyle())

    val timeRange = context.getString(R.string.widget_time_range, hero.startLabel, hero.endLabel)
    val detail = if (hero.classroom.isBlank()) timeRange else context.getString(R.string.widget_time_and_room, timeRange, hero.classroom)
    Text(text = detail, maxLines = 1, style = bodyStyle(R.color.widget_text_secondary))
}

@Composable
private fun RemainingRow(occurrence: WidgetOccurrence) {
    Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 3.dp)) {
        Text(text = occurrence.startLabel, maxLines = 1, modifier = GlanceModifier.width(52.dp), style = bodyStyle(R.color.widget_text_secondary))
        Text(text = occurrence.name, maxLines = 1, style = bodyStyle(R.color.widget_text_primary))
    }
}

/**
 * 没有任何可用课程时的引导文案。
 *
 * 把五种「没内容」的原因分开，是为了让用户在学期末看到「本学期课程已结束」，
 * 而不是被误导成「课表丢了」。
 */
private fun promptText(context: Context, state: WidgetDisplayState): String = when (state.type) {
    WidgetDisplayState.Type.MISSING -> context.getString(R.string.widget_prompt_sync)
    WidgetDisplayState.Type.UNAVAILABLE -> context.getString(R.string.widget_prompt_set_semester)
    WidgetDisplayState.Type.EMPTY -> context.getString(R.string.widget_prompt_import)
    WidgetDisplayState.Type.STALE -> context.getString(R.string.widget_prompt_stale)
    WidgetDisplayState.Type.NO_UPCOMING -> context.getString(R.string.widget_no_upcoming)
    WidgetDisplayState.Type.READY -> context.getString(R.string.widget_no_upcoming)
}

/**
 * 依据当前高度决定还能塞下几行「今日剩余」。
 *
 * 用高度而不是用命中的 `Responsive` 尺寸来判定，是因为用户可以把 widget 拉到任意大小，
 * 只有当前高度才真正决定会不会溢出。
 *
 * @param height 当前 widget 高度。
 * @return 最多显示的行数；0 表示只显示「接下来」那一节（2x1 等紧凑尺寸）。
 */
private fun maxRemainingRows(height: Dp): Int = when {
    height < 110.dp -> 0
    height < 180.dp -> 4
    else -> 7
}

/**
 * 点击 widget 时打开的 Intent。
 *
 * 只携带一个固定路由常量，Web 层会把它白名单校验后再用于导航；不携带任何课程数据，
 * 因此即使该 Intent 被其它应用观测到也不会泄露信息。
 */
private fun scheduleIntent(context: Context): Intent =
    Intent(context, MainActivity::class.java)
        .setAction(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_LAUNCHER)
        .putExtra(WidgetPendingRoute.EXTRA_ROUTE, WidgetPendingRoute.ROUTE_SCHEDULE)

private fun titleStyle() = TextStyle(
    color = ColorProvider(R.color.widget_text_primary),
    fontSize = 16.sp,
    fontWeight = FontWeight.Bold
)

private fun bodyStyle(colorRes: Int) = TextStyle(
    color = ColorProvider(colorRes),
    fontSize = 13.sp,
    fontWeight = FontWeight.Normal
)

private fun captionStyle(colorRes: Int) = TextStyle(
    color = ColorProvider(colorRes),
    fontSize = 11.sp,
    fontWeight = FontWeight.Medium
)
