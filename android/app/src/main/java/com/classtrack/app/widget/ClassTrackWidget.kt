package com.classtrack.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ExperimentalGlanceApi
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
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
import com.classtrack.app.WidgetDayItem
import com.classtrack.app.WidgetDayListPolicy
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetOccurrence
import com.classtrack.app.WidgetPendingRoute
import com.classtrack.app.WidgetStyleConfig
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 声明的候选尺寸。
 *
 * 这些值**不是**渲染分支的依据：实际布局只按 [LocalSize] 决定，因为用户可以把 widget 拉到任意大小，
 * 而且在 Android 12 以下系统不会给出多尺寸集合，`AppWidgetUtilsKt.findBestSize()` 只会挑最接近的一档
 * （provider 的 min 尺寸成为回退基准）。上一版正是把渲染绑在「命中了哪一档」上，才在真实设备上
 * 退化成「只显示一节课」。
 */
private val SUPPORTED_SIZES = setOf(
    DpSize(110.dp, 110.dp),
    DpSize(180.dp, 140.dp),
    DpSize(250.dp, 180.dp),
    DpSize(250.dp, 260.dp)
)

/** 低于这个高度就不画汇总行，把有限的空间让给课程本身。 */
private val SUMMARY_MIN_HEIGHT = 110.dp

/** 「接下来」样式低于这个高度就只留 hero 卡片，不再接列表。 */
private val NEXT_UP_LIST_MIN_HEIGHT = 150.dp

/**
 * ClassTrack 桌面小工具。
 *
 * 它只负责渲染已经解析好的状态与配置：所有「现在该显示哪节课」的判断都在
 * [WidgetRefreshController.resolveCurrentState] 里完成，所有「今天哪几行要显示」的判断都在
 * [WidgetDayListPolicy] 里完成，因此这里没有任何时间比较，也就不会出现「渲染逻辑和排程逻辑各算一套」。
 */
class ClassTrackWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Responsive(SUPPORTED_SIZES)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // SharedPreferences 读取 + 上百 KB JSON 解析放到 IO 线程，不要占用 Glance 的合成线程。
        val state = withContext(Dispatchers.IO) {
            WidgetRefreshController.resolveCurrentState(context, System.currentTimeMillis())
        }
        val config = withContext(Dispatchers.IO) { readConfigSafely(context, id) }
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)

        WidgetDiagnostics.widgetRendered(state.type.name, state.todayItems.size, state.heroState?.name)

        provideContent {
            // 必须在这里读最新解析结果，而不是直接用上面那个闭包变量：`provideGlance` 不会随每次
            // update 重新执行，直接用闭包会让画面停在上一帧（见 WidgetRenderCache 的说明）。
            WidgetContent(WidgetRenderCache.latest() ?: state, config, appWidgetId)
        }
    }

    override fun onCompositionError(context: Context, appWidgetId: GlanceId, appWidgetErrorCode: Int, throwable: Throwable) {
        WidgetDiagnostics.compositionFailed(appWidgetErrorCode, throwable)
        super.onCompositionError(context, appWidgetId, appWidgetErrorCode, throwable)
    }
}

/**
 * 读取实例配置，任何失败都回退默认值。
 *
 * 配置读取失败绝不能让小工具变空白：样式只是锦上添花，课程才是主体。
 * 这里只捕获 `RuntimeException` 与 `IOException`，**不捕获 `CancellationException`**，
 * 否则会吞掉 Glance 自己的协程取消。
 *
 * @param context 任意 Context。
 * @param glanceId 该实例的 Glance id。
 * @return 该实例的配置；读取失败时为默认配置。
 */
private suspend fun readConfigSafely(context: Context, glanceId: GlanceId): WidgetStyleConfig = try {
    WidgetStyleState.read(context, glanceId)
} catch (error: RuntimeException) {
    WidgetDiagnostics.styleReadFailed()
    WidgetStyleConfig.defaults()
} catch (error: IOException) {
    WidgetDiagnostics.styleReadFailed()
    WidgetStyleConfig.defaults()
}

@Composable
private fun WidgetContent(state: WidgetDisplayState, config: WidgetStyleConfig, appWidgetId: Int) {
    val context = LocalContext.current
    val availableHeight = LocalSize.current.height
    val hero = state.hero

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(ColorProvider(R.color.widget_surface))
            .cornerRadius(16.dp)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .clickable(actionStartActivity(scheduleIntent(context))),
    ) {
        if (!state.isReady || hero == null) {
            Text(text = promptText(context, state), maxLines = 3, style = bodyStyle(R.color.widget_text_muted))
            return@Column
        }

        when (config.layoutStyle) {
            WidgetStyleConfig.LayoutStyle.COMPACT -> CompactBody(context, state, hero, appWidgetId)
            WidgetStyleConfig.LayoutStyle.NEXT_UP -> NextUpBody(context, state, config, hero, appWidgetId, availableHeight)
            else -> DayListBody(context, state, config, appWidgetId, availableHeight)
        }
    }
}

/**
 * 「全天课表」：汇总行 + 今天一整天的课。
 *
 * 列表用可滚动列表而不是按高度截断，因此「格子小」只会让它需要滑动，而不会让用户看不到后面的课。
 */
@Composable
private fun ColumnScope.DayListBody(context: Context, state: WidgetDisplayState, config: WidgetStyleConfig,
                                    appWidgetId: Int, availableHeight: Dp) {
    val plan = WidgetDayListPolicy.apply(state.todayItems, config.finishedPolicy)
    val showSummary = availableHeight >= SUMMARY_MIN_HEIGHT

    if (showSummary) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text(text = daySummaryText(context, state, plan.rows.size), maxLines = 1,
                modifier = GlanceModifier.defaultWeight(), style = captionStyle(R.color.widget_text_muted))
            StyleEntry(context, appWidgetId)
        }
    } else {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Spacer(modifier = GlanceModifier.defaultWeight())
            StyleEntry(context, appWidgetId)
        }
    }

    if (plan.rows.isEmpty()) {
        if (!showSummary) {
            Text(text = context.getString(R.string.widget_day_no_class), maxLines = 2,
                style = bodyStyle(R.color.widget_text_muted))
        }
        NextOtherDayLine(context, state)
        return
    }

    DayRows(plan.rows)

    if (plan.collapsedFinishedCount > 0) {
        Text(text = context.getString(R.string.widget_finished_count, plan.collapsedFinishedCount), maxLines = 1,
            style = captionStyle(R.color.widget_text_muted))
    }
    NextOtherDayLine(context, state)
}

/** 「接下来」：hero 大卡片 + 今天的课表。 */
@Composable
private fun ColumnScope.NextUpBody(context: Context, state: WidgetDisplayState, config: WidgetStyleConfig,
                                   hero: WidgetOccurrence, appWidgetId: Int, availableHeight: Dp) {
    HeroSection(context, state, hero, appWidgetId)

    if (availableHeight < NEXT_UP_LIST_MIN_HEIGHT) return

    val plan = WidgetDayListPolicy.apply(state.todayItems, config.finishedPolicy)
    if (plan.rows.isEmpty()) {
        NextOtherDayLine(context, state)
        return
    }

    Spacer(modifier = GlanceModifier.height(8.dp))
    Text(text = daySummaryText(context, state, plan.rows.size), maxLines = 1,
        style = captionStyle(R.color.widget_text_muted))
    DayRows(plan.rows)
    if (plan.collapsedFinishedCount > 0) {
        Text(text = context.getString(R.string.widget_finished_count, plan.collapsedFinishedCount), maxLines = 1,
            style = captionStyle(R.color.widget_text_muted))
    }
}

/** 「紧凑」：只显示正在上 / 接下来的一节课 + 一行计数。 */
@Composable
private fun ColumnScope.CompactBody(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence, appWidgetId: Int) {
    HeroSection(context, state, hero, appWidgetId)

    Spacer(modifier = GlanceModifier.height(4.dp))
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Text(text = compactCounterText(context, state), maxLines = 1,
            modifier = GlanceModifier.defaultWeight(), style = captionStyle(R.color.widget_text_muted))
        StyleEntry(context, appWidgetId)
    }
}

/**
 * 可滚动的课程行列表。
 *
 * 依赖 Glance 的 `LazyColumn`（底层是平台原生的集合型 widget），因此文件里唯一一处
 * `@OptIn(ExperimentalGlanceApi::class)` 就在这里 —— 详见 design.md D15。
 */
@OptIn(ExperimentalGlanceApi::class)
@Composable
private fun ColumnScope.DayRows(rows: List<WidgetDayItem>) {
    Spacer(modifier = GlanceModifier.height(4.dp))
    LazyColumn(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
        items(rows.size) { index -> DayRow(rows[index]) }
    }
}

/** 一行课程：时间 + 课程名 + 教室；正在上的那行用强调色，已上完的用弱化色。 */
@Composable
private fun DayRow(item: WidgetDayItem) {
    val occurrence = item.occurrence
    val nameColor = when (item.phase) {
        WidgetDayItem.Phase.IN_PROGRESS -> R.color.widget_accent
        WidgetDayItem.Phase.FINISHED -> R.color.widget_text_muted
        else -> R.color.widget_text_primary
    }

    Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 3.dp)) {
        Text(text = if (item.isInProgress) "●" else " ", maxLines = 1,
            modifier = GlanceModifier.width(12.dp), style = captionStyle(R.color.widget_accent))
        Text(text = occurrence.startLabel, maxLines = 1, modifier = GlanceModifier.width(44.dp),
            style = bodyStyle(R.color.widget_text_secondary))
        Text(text = occurrence.name, maxLines = 1, modifier = GlanceModifier.defaultWeight(),
            style = bodyStyle(nameColor))
        if (occurrence.classroom.isNotBlank()) {
            Text(text = occurrence.classroom, maxLines = 1, style = captionStyle(R.color.widget_text_muted))
        }
    }
}

/** hero 卡片：状态标签（含「样式」入口）+ 课程名 + 时间与教室。 */
@Composable
private fun ColumnScope.HeroSection(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence, appWidgetId: Int) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Text(text = heroLabel(context, state, hero), maxLines = 1,
            modifier = GlanceModifier.defaultWeight(), style = captionStyle(R.color.widget_accent))
        StyleEntry(context, appWidgetId)
    }

    Text(text = hero.name, maxLines = 2, style = titleStyle())

    val timeRange = context.getString(R.string.widget_time_range, hero.startLabel, hero.endLabel)
    val detail = if (hero.classroom.isBlank()) timeRange
    else context.getString(R.string.widget_time_and_room, timeRange, hero.classroom)
    Text(text = detail, maxLines = 1, style = bodyStyle(R.color.widget_text_secondary))
}

/**
 * 「样式」入口：打开该实例的配置页。
 *
 * 与 widget 主体的点击区域不重叠（主体打开 App，这里打开配置页），两者都只携带固定常量或
 * widgetId，不携带任何课程数据。
 */
@Composable
private fun StyleEntry(context: Context, appWidgetId: Int) {
    Text(
        text = context.getString(R.string.widget_style_entry),
        maxLines = 1,
        modifier = GlanceModifier.padding(start = 8.dp).clickable(actionStartActivity(configIntent(context, appWidgetId))),
        style = captionStyle(R.color.widget_accent)
    )
}

/** 今天已无课、但后面还有课时，补一行「下一节」。 */
@Composable
private fun NextOtherDayLine(context: Context, state: WidgetDisplayState) {
    val hero = state.hero ?: return
    if (state.heroState != WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY) return

    Text(
        text = context.getString(R.string.widget_next_other_day_line, hero.weekdayLabel, hero.startLabel, hero.name),
        maxLines = 1,
        style = captionStyle(R.color.widget_accent)
    )
}

/** hero 的状态标签。 */
private fun heroLabel(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence): String =
    when (state.heroState) {
        WidgetDisplayState.HeroState.IN_PROGRESS -> context.getString(R.string.widget_hero_in_progress)
        WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY ->
            context.getString(R.string.widget_hero_upcoming_other_day, hero.weekdayLabel)
        else -> context.getString(R.string.widget_hero_upcoming, hero.sections)
    }

/**
 * 汇总行文案。
 *
 * 计数用**可见行数**而不是整天课程数：选了「不显示已上完的课」时，如果仍写「共 6 节」而列表只有
 * 两行，用户会以为列表坏了。
 *
 * @param context 任意 Context。
 * @param state 已解析状态。
 * @param visibleRows 当前实际渲染的行数。
 * @return 汇总文案。
 */
private fun daySummaryText(context: Context, state: WidgetDisplayState, visibleRows: Int): String {
    if (visibleRows <= 0) return context.getString(R.string.widget_day_no_class)

    for (item in state.todayItems) {
        val weekday = item.occurrence.weekdayLabel
        if (weekday.isNotBlank()) return context.getString(R.string.widget_day_summary, weekday, visibleRows)
    }
    return context.getString(R.string.widget_day_summary_no_weekday, visibleRows)
}

/** 「紧凑」样式底部那行计数。 */
private fun compactCounterText(context: Context, state: WidgetDisplayState): String =
    if (state.todayRemainingCount > 0) context.getString(R.string.widget_today_remaining_count, state.todayRemainingCount)
    else context.getString(R.string.widget_day_no_class)

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
 * 点击 widget 主体时打开的 Intent。
 *
 * 只携带一个固定路由常量，Web 层会把它白名单校验后再用于导航；不携带任何课程数据，
 * 因此即使该 Intent 被其它应用观测到也不会泄露信息。
 */
private fun scheduleIntent(context: Context): Intent =
    Intent(context, MainActivity::class.java)
        .setAction(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_LAUNCHER)
        .putExtra(WidgetPendingRoute.EXTRA_ROUTE, WidgetPendingRoute.ROUTE_SCHEDULE)

/**
 * 打开该实例配置页的 Intent。
 *
 * 用 `ACTION_APPWIDGET_CONFIGURE` + 显式组件：launcher 放置时走 provider 的 `android:configure`，
 * 这里让用户可以在放置之后再次修改。配置页会自行校验 widgetId 的归属（见 `WidgetConfigActivity`）。
 */
private fun configIntent(context: Context, appWidgetId: Int): Intent =
    Intent(context, WidgetConfigActivity::class.java)
        .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

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
