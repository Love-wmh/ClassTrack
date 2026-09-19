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
import androidx.glance.layout.Box
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
import com.classtrack.app.WidgetDateLabel
import com.classtrack.app.WidgetDayItem
import com.classtrack.app.WidgetDayPlan
import com.classtrack.app.WidgetDayListPolicy
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetOccurrence
import com.classtrack.app.WidgetPendingRoute
import com.classtrack.app.WidgetStyleConfig
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 卡片内边距；横向略大于纵向，文字块看起来更稳。 */
private val HORIZONTAL_PADDING = 14.dp
private val VERTICAL_PADDING = 12.dp

/** 卡片圆角；比同屏其它卡片更圆一点，视觉上更柔和。 */
private val CARD_RADIUS = 20.dp

/** 课表行距：首行与汇总行之间留出呼吸感，其余行更紧。 */
private val ROW_GAP_FIRST = 6.dp
private val ROW_GAP = 4.dp

/** hero 区块与下方课表之间的间距。 */
private val HERO_GAP = 6.dp

/**
 * ClassTrack 桌面小工具。
 *
 * 它只负责渲染已经解析好的状态与配置：所有「现在该显示哪节课」的判断都在
 * [WidgetRefreshController.resolveCurrentState] 里完成，所有「今天哪几行要显示」的判断都在
 * [WidgetDayListPolicy] 里完成，因此这里没有任何时间比较，也就不会出现「渲染逻辑和排程逻辑各算一套」。
 *
 * <p>**响应式**：这里用 `SizeMode.Exact`，于是 `LocalSize` 就是宿主格子的真实尺寸 —— 用户把格子拉成
 * 任意大小，布局都按真实尺寸自适应，而不是先声明几档固定尺寸再去命中其中一档。上一版把渲染绑在
 * 「命中了哪一档」上，真机上直接退化成「只显示一节课」；声明几档尺寸还会让配置页预览与桌面卡片
 * 各按不同的档位渲染（预览 250×180 列出三行课，桌面 180×140 只剩 hero）。
 *
 * <p>自适应靠的是布局本身，而不是算术：hero 与汇总行按内容占位，课程行交给可滚动列表吃掉剩余
 * 高度 —— 格子高就多显示几行，格子矮就少显示几行并允许滑动。
 */
class ClassTrackWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // SharedPreferences 读取 + 上百 KB JSON 解析放到 IO 线程，不要占用 Glance 的合成线程。
        val state = withContext(Dispatchers.IO) {
            WidgetRefreshController.resolveCurrentState(context, System.currentTimeMillis())
        }
        val config = withContext(Dispatchers.IO) { readConfigSafely(context, id) }
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)

        // 配置与状态一样按实例缓存：`provideGlance` 不会随每次 update 重新执行，若不缓存，
        // 配置页保存后合成层仍会用闭包里的旧配置渲染（真机实测：切成紧凑后切不回去）。
        WidgetRenderCache.publishConfig(appWidgetId, config)

        WidgetDiagnostics.widgetRendered(state.type.name, state.todayItems.size, state.heroState?.name)

        provideContent {
            WidgetContent(
                WidgetRenderCache.latest() ?: state,
                WidgetRenderCache.latestConfig(appWidgetId, config),
                appWidgetId
            )
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

/**
 * 三种样式共用的小工具正文。
 *
 * <p>布局是自适应而非按尺寸分支：hero 与汇总行按内容占位，课程行交给可滚动列表吃掉剩余高度。
 * 格子大就多显示几行、格子小就少显示几行并允许滑动，因此这里没有任何按尺寸写死的阈值 ——
 * 用户把格子拉成任意大小都成立，也不需要预先声明「支持哪几档尺寸」。
 */
@Composable
internal fun WidgetContent(state: WidgetDisplayState, config: WidgetStyleConfig, appWidgetId: Int,
                           preview: Boolean = false) {
    val context = LocalContext.current
    val hero = state.hero
    // 「列今天还是列明天」的裁决只在这里做一次：三种样式共用，避免各自重算导致文案与列表打架。
    val plan = WidgetDayPlan.resolve(state.todayItems, state.nextDayItems, config.finishedPolicy)

    if (!preview) {
        val size = LocalSize.current
        WidgetDiagnostics.widgetSized(size.width.value.toInt(), size.height.value.toInt())
    }

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(ColorProvider(R.color.widget_surface))
            .cornerRadius(CARD_RADIUS)
            // 只留横向内边距：纵向留白交给内容自己带（见 WidgetBody），否则滚动时顶部会残留一条固定白边。
            .padding(horizontal = HORIZONTAL_PADDING)
            .clickable(actionStartActivity(scheduleIntent(context))),
    ) {
        if (!state.isReady || hero == null) {
            Spacer(modifier = GlanceModifier.height(VERTICAL_PADDING))
            Text(text = promptText(context, state), maxLines = 3, style = bodyStyle(R.color.widget_text_muted))
        } else {
            WidgetBody(context, state, config, plan, hero, appWidgetId, preview)
        }
    }
}

/**
 * 正文里的一行。
 *
 * 把正文表达成「行的序列」，是为了让真实渲染与配置页预览共用同一份顺序与同一个渲染函数
 * （[BodyLineView]）：两侧唯一的差别只是把序列装进 `LazyColumn` 还是普通 `Column`（见 [WidgetBody]），
 * 因此预览不可能与桌面漂移。
 */
private sealed interface BodyLine {
    /** hero：状态标签 +「样式」入口 + 课程名 + 时间与教室。 */
    data object Hero : BodyLine

    /** 汇总行：「明天 周一 · 共 3 节」+「样式」入口；今天没课时这一行就是「今天无课」。 */
    data object Summary : BodyLine

    /** 「紧凑」样式底部的计数行。 */
    data object Counter : BodyLine

    /** 「已上完 N 节」。 */
    data object Collapsed : BodyLine

    /** 「下一节 · 10月8日 周四 08:00 高等数学」。 */
    data object NextOther : BodyLine

    /** 一行课程；[Course.index] 用来给首行留多一点与汇总行之间的间距。 */
    data class Course(val item: WidgetDayItem, val index: Int) : BodyLine
}

/**
 * 按样式算出正文的行序列。
 *
 * <p>三种样式「显示多少内容」的构成全在这里，而且是纯函数：调整顺序或增删行会同时作用到真机与预览。
 *
 * <p>「紧凑」样式**不会**因为格子变大而加内容 —— 它的定位就是只显示一节课（R8）。
 *
 * <p>「接下来」样式在列课表时不补「下一节」提示：hero 已经说明了下一节课，再补一行是重复信息。
 */
private fun bodyLines(state: WidgetDisplayState, style: WidgetStyleConfig.LayoutStyle,
                      plan: WidgetDayPlan): List<BodyLine> {
    if (style == WidgetStyleConfig.LayoutStyle.COMPACT) {
        return listOf(BodyLine.Hero, BodyLine.Counter)
    }

    val lines = mutableListOf<BodyLine>()
    if (style == WidgetStyleConfig.LayoutStyle.NEXT_UP) lines += BodyLine.Hero

    if (plan.hasRows()) {
        lines += BodyLine.Summary
        plan.rows.forEachIndexed { index, item -> lines += BodyLine.Course(item, index) }
        if (plan.collapsedFinishedCount > 0) lines += BodyLine.Collapsed
        // 已经在列明天的课了，再补一行「下一节是明天 …」就是把同一节课说两遍。
        if (style == WidgetStyleConfig.LayoutStyle.DAY_LIST
            && plan.source != WidgetDayPlan.Source.TOMORROW) lines += BodyLine.NextOther
    } else {
        // 没有课程行时，汇总行自己就是「今天无课 / 今天已无课」；紧凑样式由计数行表达同一件事。
        if (style == WidgetStyleConfig.LayoutStyle.DAY_LIST) lines += BodyLine.Summary
        if (plan.collapsedFinishedCount > 0) lines += BodyLine.Collapsed
        lines += BodyLine.NextOther
    }
    return lines
}

/**
 * 正文：整张卡片共用一条滚动轴。
 *
 * <p>真机把行序列装进 `LazyColumn` 并让它吃掉卡片剩余高度 —— hero、汇总行、课程行一起滚，而不是
 * 「上方固定 + 下方一小块区域可滚」。后者在真机上很难用：可滚区域常常只剩一两行高，手指一滑就到底。
 *
 * <p>格子高就多显示几行、格子矮就少显示几行，全由布局自己决定，因此没有任何按尺寸写死的阈值。
 *
 * <p>配置页预览不能走 `LazyColumn`：它靠 launcher 的 `RemoteViewsService` 填行，在没有 `AppWidgetHost`
 * 的普通 `View` 里会渲染成空列表。预览改用普通 `Column`，行内容与顺序完全一样（截图里被截掉的那半行，
 * 在桌面上就是「还能往下滑」的提示）。
 *
 * <p>上下留白也算内容的一部分（序列首尾各一项），不挂在卡片内边距上：否则滚动时顶部会留下一条永不动
 * 的白边，看起来像「上面有一条固定的白条」（真机回测报的就是这个）。
 */
@OptIn(ExperimentalGlanceApi::class)
@Composable
private fun ColumnScope.WidgetBody(context: Context, state: WidgetDisplayState, config: WidgetStyleConfig,
                                   plan: WidgetDayPlan, hero: WidgetOccurrence, appWidgetId: Int,
                                   preview: Boolean) {
    val lines = bodyLines(state, config.layoutStyle, plan)

    if (preview) {
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            Spacer(modifier = GlanceModifier.height(VERTICAL_PADDING))
            for (line in lines) BodyLineView(context, state, plan, hero, appWidgetId, line)
            Spacer(modifier = GlanceModifier.height(VERTICAL_PADDING))
        }
        return
    }

    // 点击必须同时挂在**列表容器**与**每一个列表项**上，不能只挂在外层根布局：
    // 真机上 `LazyColumn` 底层是 RemoteViews 集合里的 `ListView`，它几乎铺满整张卡片，`AbsListView`
    // 会把触摸事件自己吃掉，于是挂在根布局上的点击收不到任何点击（真机复现：点卡片没反应、打不开 App）。
    // 项级点击是集合型 widget 的标准做法，容器级点击则覆盖列表项之间的空隙与下方留白。
    val openApp = actionStartActivity(scheduleIntent(context))

    LazyColumn(
        modifier = GlanceModifier.fillMaxWidth().defaultWeight().clickable(openApp),
    ) {
        item { Spacer(modifier = GlanceModifier.height(VERTICAL_PADDING).clickable(openApp)) }
        items(lines.size) { index ->
            Box(modifier = GlanceModifier.fillMaxWidth().clickable(openApp)) {
                BodyLineView(context, state, plan, hero, appWidgetId, lines[index])
            }
        }
        item { Spacer(modifier = GlanceModifier.height(VERTICAL_PADDING).clickable(openApp)) }
    }
}

/** 渲染正文中的一行；真实渲染与配置页预览共用它，因此两条路径的视觉不会漂移。 */
@Composable
private fun BodyLineView(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan,
                         hero: WidgetOccurrence, appWidgetId: Int, line: BodyLine) {
    when (line) {
        BodyLine.Hero -> HeroSection(context, state, hero, appWidgetId)
        BodyLine.Summary -> SummaryRow(context, plan, appWidgetId)
        BodyLine.Counter -> CounterRow(context, state, plan, appWidgetId)
        BodyLine.Collapsed -> CollapsedLine(context, plan)
        BodyLine.NextOther -> NextOtherDayLine(context, state)
        is BodyLine.Course -> DayRow(line.item, rowGap(line.index))
    }
}

/** 汇总行：左侧说明这是哪一天、多少节课，右侧「样式」入口。 */
@Composable
private fun SummaryRow(context: Context, plan: WidgetDayPlan, appWidgetId: Int) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Text(text = daySummaryText(context, plan), maxLines = 1,
            modifier = GlanceModifier.defaultWeight(), style = captionStyle(R.color.widget_text_muted))
        StyleEntry(context, appWidgetId)
    }
}

/** 「已上完 N 节」折叠计数行；「已上完」策略选的不是折叠时什么都不画。 */
@Composable
private fun CollapsedLine(context: Context, plan: WidgetDayPlan) {
    if (plan.collapsedFinishedCount <= 0) return
    Text(text = context.getString(R.string.widget_finished_count, plan.collapsedFinishedCount), maxLines = 1,
        style = captionStyle(R.color.widget_text_muted))
}

/** 「紧凑」底部的计数行。 */
@Composable
private fun CounterRow(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan, appWidgetId: Int) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Text(text = compactCounterText(context, state, plan), maxLines = 1,
            modifier = GlanceModifier.defaultWeight(), style = captionStyle(R.color.widget_text_muted))
        StyleEntry(context, appWidgetId)
    }
}

/** 首行贴近汇总行时留多一点空隙，其余行更紧。 */
private fun rowGap(index: Int) = if (index == 0) ROW_GAP_FIRST else ROW_GAP

/** 一行课程：时间 + 课程名 + 教室；正在上的那行用强调色，已上完的用弱化色。 */
@Composable
private fun DayRow(item: WidgetDayItem, topPadding: Dp) {
    val occurrence = item.occurrence
    val nameColor = when (item.phase) {
        WidgetDayItem.Phase.IN_PROGRESS -> R.color.widget_accent
        WidgetDayItem.Phase.FINISHED -> R.color.widget_text_muted
        else -> R.color.widget_text_primary
    }

    Row(modifier = GlanceModifier.fillMaxWidth().padding(top = topPadding)) {
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

/**
 * hero：状态标签（含「样式」入口）+ 课程名 + 时间与教室，末尾留一段与课表之间的间距。
 *
 * <p>课程名只给**一行**：真机 4×2 上原来的两行标题会把卡片撑满，留给下方「剩余课程」的位置就只剩
 * 一丝。一行省略号 + 下面多列两节课，比「标题占满上半张卡片」有用得多。
 *
 * <p>自带 `Column` 而不是做成 `ColumnScope` 扩展：它现在是 `LazyColumn` 里的一项，需要自己是一个
 * 完整的容器。
 */
@Composable
private fun HeroSection(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence, appWidgetId: Int) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text(text = heroLabel(context, state, hero), maxLines = 1,
                modifier = GlanceModifier.defaultWeight(), style = captionStyle(R.color.widget_accent))
            StyleEntry(context, appWidgetId)
        }

        Text(text = hero.name, maxLines = 1, style = titleStyle())

        val timeRange = context.getString(R.string.widget_time_range, hero.startLabel, hero.endLabel)
        val detail = if (hero.classroom.isBlank()) timeRange
        else context.getString(R.string.widget_time_and_room, timeRange, hero.classroom)
        Text(text = detail, maxLines = 1, style = bodyStyle(R.color.widget_text_secondary))

        Spacer(modifier = GlanceModifier.height(HERO_GAP))
    }
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

/** 今天已无课、但后面还有课时，补一行「下一节 · 10月8日 周四 08:00 高等数学」。 */
@Composable
private fun NextOtherDayLine(context: Context, state: WidgetDisplayState) {
    val hero = state.hero ?: return
    if (state.heroState != WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY) return

    Text(
        text = context.getString(R.string.widget_next_other_day_line, heroDayLabel(hero), hero.startLabel, hero.name),
        maxLines = 1,
        style = captionStyle(R.color.widget_accent)
    )
}

/** hero 的状态标签。 */
private fun heroLabel(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence): String =
    when (state.heroState) {
        WidgetDisplayState.HeroState.IN_PROGRESS -> context.getString(R.string.widget_hero_in_progress)
        WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY ->
            context.getString(R.string.widget_hero_upcoming_other_day, heroDayLabel(hero))
        else -> context.getString(R.string.widget_hero_upcoming, hero.sections)
    }

/**
 * 一节课所属自然日的「日期 + 星期」文案。
 *
 * 长假期间只写「周一」看不出是哪一天，带上「10月8日」用户才能一眼看出那不是今天的课。
 */
private fun heroDayLabel(hero: WidgetOccurrence): String =
    WidgetDateLabel.withWeekday(hero.dayKey, hero.weekdayLabel)

/**
 * 汇总行文案。
 *
 * 计数用**可见行数**而不是整天课程数：选了「不显示已上完的课」时，如果仍写「共 6 节」而列表只有
 * 两行，用户会以为列表坏了。
 *
 * 列明天的课时必须写「明天」：同一个数字写成「今天 周四 · 共 4 节」，会让用户在周日以为当天要上课。
 *
 * @param context 任意 Context。
 * @param plan 「列今天还是列明天」的裁决结果。
 * @return 汇总文案。
 */
private fun daySummaryText(context: Context, plan: WidgetDayPlan): String = when (plan.source) {
    WidgetDayPlan.Source.TOMORROW -> if (plan.weekdayLabel.isBlank())
        context.getString(R.string.widget_day_summary_tomorrow_no_weekday, plan.rows.size)
    else context.getString(R.string.widget_day_summary_tomorrow, plan.weekdayLabel, plan.rows.size)

    WidgetDayPlan.Source.TODAY -> if (plan.weekdayLabel.isBlank())
        context.getString(R.string.widget_day_summary_no_weekday, plan.rows.size)
    else context.getString(R.string.widget_day_summary, plan.weekdayLabel, plan.rows.size)

    else -> emptyDayText(context, plan)
}

/**
 * 没有课程行可列时的文案。
 *
 * 「今天已无课」（课上完了）与「今天无课」（本来就没课）必须分开；两者都不能写成「明天有课」，
 * 下一节课在哪天由 [NextOtherDayLine] 用绝对日期表达。
 */
private fun emptyDayText(context: Context, plan: WidgetDayPlan): String =
    if (plan.isTodayHadClasses) context.getString(R.string.widget_day_no_class)
    else context.getString(R.string.widget_day_empty)

/** 「紧凑」样式底部那行计数；今天没课时说清是「明天」还是「今天无课」。 */
private fun compactCounterText(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan): String =
    when (plan.source) {
        WidgetDayPlan.Source.TODAY -> if (state.todayRemainingCount > 0)
            context.getString(R.string.widget_today_remaining_count, state.todayRemainingCount)
        else context.getString(R.string.widget_day_no_class)

        WidgetDayPlan.Source.TOMORROW -> context.getString(R.string.widget_tomorrow_count, plan.rows.size)

        else -> emptyDayText(context, plan)
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
