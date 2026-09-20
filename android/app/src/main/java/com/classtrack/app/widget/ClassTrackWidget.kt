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
import androidx.glance.layout.fillMaxHeight
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
import com.classtrack.app.WidgetBodyLine
import com.classtrack.app.WidgetBodyPlan
import com.classtrack.app.WidgetDateLabel
import com.classtrack.app.WidgetDayItem
import com.classtrack.app.WidgetDayPlan
import com.classtrack.app.WidgetDiagnostics
import com.classtrack.app.WidgetDisplayState
import com.classtrack.app.WidgetLayoutMetrics
import com.classtrack.app.WidgetLinePolicy
import com.classtrack.app.WidgetOccurrence
import com.classtrack.app.WidgetPendingRoute
import com.classtrack.app.WidgetStyleConfig
import java.io.IOException
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 双栏布局时左栏（hero / 汇总）占正文宽度的比例；右栏拿剩下的部分。
 *
 * 用「按真实宽度算出的固定宽度 + 右栏 defaultWeight()」而不是两栏都按权重分：
 * Glance 的 `defaultWeight()` 不接受权重参数（只能等分），左栏宽度必须自己算。
 */
private const val DUAL_HEADER_WEIGHT = 0.42f

/** 双栏两列之间的间距，按横向内边距的尺度走。 */
private const val DUAL_COLUMN_GAP_DP = 10f

/**
 * ClassTrack 桌面小工具。
 *
 * 它只负责渲染已经解析好的状态与配置：所有「现在该显示哪节课」的判断都在
 * [WidgetRefreshController.resolveCurrentState] 里完成，所有「今天哪几行要显示」的判断都在
 * [WidgetDayPlan] + [WidgetLinePolicy] 里完成，所有排版度量都在 [WidgetLayoutMetrics] 里算好。
 * 因此这里没有任何时间比较、没有任何尺寸分支，也就不会出现「渲染逻辑和排程逻辑各算一套」。
 *
 * <p>**响应式**：这里用 `SizeMode.Exact`，于是 `LocalSize` 就是宿主格子的真实尺寸。度量由
 * [WidgetLayoutMetrics] 按真实尺寸**连续**算出（含 1.0 下限），布局结构本身仍由内容与可用空间决定：
 * hero 与汇总行按内容占位，课程行交给可滚动列表吃掉剩余高度 —— 格子高就多显示几行，格子矮就少显示
 * 几行并允许滑动。既不声明尺寸档位，也没有「高度小于 N 就不显示某区块」这类阈值。
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
 * <p>布局是自适应而非按尺寸分支：度量由真实尺寸连续算出，结构交给布局本身决定，因此这里没有任何
 * 按尺寸写死的阈值 —— 用户把格子拉成任意大小都成立，也不需要预先声明「支持哪几档尺寸」。
 */
@Composable
internal fun WidgetContent(state: WidgetDisplayState, config: WidgetStyleConfig, appWidgetId: Int,
                           preview: Boolean = false) {
    val context = LocalContext.current
    val hero = state.hero
    // 「列今天还是列明天」的裁决只在这里做一次：三种样式共用，避免各自重算导致文案与列表打架。
    val plan = WidgetDayPlan.resolve(state.todayItems, state.nextDayItems, config.finishedPolicy)
    // 度量与行序列都按真实格子尺寸算：预览走同一份代码，因此预览不可能与桌面漂移。
    val size = LocalSize.current
    val metrics = WidgetLayoutMetrics.resolve(size.width.value, size.height.value)
    val body = WidgetLinePolicy.resolve(config, plan)
    val dualColumn = isDualColumn(config, metrics)

    if (!preview) {
        WidgetDiagnostics.widgetSized(size.width.value.toInt(), size.height.value.toInt())
    }
    WidgetDiagnostics.layoutMetrics(
        (metrics.scale * PERCENT).roundToInt(),
        config.wideLayoutStorageValue(),
        dualColumn
    )

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(ColorProvider(R.color.widget_surface))
            .cornerRadius(metrics.cardRadiusDp.dp)
            // 只留横向内边距：纵向留白交给内容自己带（见 WidgetBody），否则滚动时顶部会残留一条固定白边。
            .padding(horizontal = metrics.horizontalPaddingDp.dp)
            .clickable(actionStartActivity(scheduleIntent(context))),
    ) {
        if (!state.isReady || hero == null) {
            Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp))
            Text(text = promptText(context, state), maxLines = 3,
                style = captionStyle(metrics, R.color.widget_text_muted))
        } else {
            WidgetBody(context, state, config, plan, body, hero, appWidgetId, metrics, size, dualColumn, preview)
        }
    }
}

/**
 * 这一帧要不要分两栏。
 *
 * 三个条件缺一不可：用户显式选了「双栏」、这个样式真的有课表可放（「紧凑」没有）、
 * 以及当前格子宽高比够宽。**判据是几何比值，不是设备类型** —— 宽矮的手机格子也会分栏，这是刻意的。
 *
 * @param config 该实例的配置。
 * @param metrics 当前尺寸的度量。
 * @return 是否分两栏。
 */
private fun isDualColumn(config: WidgetStyleConfig, metrics: WidgetLayoutMetrics): Boolean =
    config.isWideLayoutEffective &&
        config.wideLayout == WidgetStyleConfig.WideLayout.TWO_COLUMN &&
        metrics.isDualColumn

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
                                   plan: WidgetDayPlan, body: WidgetBodyPlan, hero: WidgetOccurrence,
                                   appWidgetId: Int, metrics: WidgetLayoutMetrics, size: DpSize,
                                   dualColumn: Boolean, preview: Boolean) {
    val lines = body.lines

    if (preview) {
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp))
            for (line in lines) BodyLineView(context, state, plan, hero, appWidgetId, metrics, line)
            Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp))
        }
        return
    }

    // 点击必须同时挂在**列表容器**与**每一个列表项**上，不能只挂在外层根布局：
    // 真机上 `LazyColumn` 底层是 RemoteViews 集合里的 `ListView`，它几乎铺满整张卡片，`AbsListView`
    // 会把触摸事件自己吃掉，于是挂在根布局上的点击收不到任何点击（真机复现：点卡片没反应、打不开 App）。
    // 项级点击是集合型 widget 的标准做法，容器级点击则覆盖列表项之间的空隙与下方留白。
    val openApp = actionStartActivity(scheduleIntent(context))

    if (dualColumn) {
        // 左栏宽度按真实格子宽度算：扣除两侧横向内边距后取 DUAL_HEADER_WEIGHT 的比例。
        val contentWidthDp = size.width.value - 2 * metrics.horizontalPaddingDp
        DualColumnBody(context, state, plan, body, hero, appWidgetId, metrics,
            (contentWidthDp * DUAL_HEADER_WEIGHT).dp, openApp)
        return
    }

    LazyColumn(
        modifier = GlanceModifier.fillMaxWidth().defaultWeight().clickable(openApp),
    ) {
        item { Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp).clickable(openApp)) }
        items(lines.size) { index ->
            Box(modifier = GlanceModifier.fillMaxWidth().clickable(openApp)) {
                BodyLineView(context, state, plan, hero, appWidgetId, metrics, lines[index])
            }
        }
        item { Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp).clickable(openApp)) }
    }
}

/**
 * 双栏排布：左栏放首行（hero 或汇总行），右栏放其余全部行。
 *
 * <p>两栏装的是**同一份行序列**，只是切了一刀，因此分栏不会增删信息，也不会让预览与桌面漂移。
 * 左栏整块可点，右栏与单栏一样把点击挂在列表容器与每个列表项上。
 *
 * <p>右栏的 `LazyColumn` 放进 `Row` 的weight 子列是本项目唯一没用过的组合（宿主需要给集合一个有界
 * 高度）。若某个宿主给不出有界高度（表现为右栏空列表），按 design 的回退方案把右栏换成普通 `Column`
 * 加高度截断；这条只在用户显式选择「双栏」时生效，默认样式不受影响。
 */
@OptIn(ExperimentalGlanceApi::class)
@Composable
private fun ColumnScope.DualColumnBody(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan,
                           body: WidgetBodyPlan, hero: WidgetOccurrence, appWidgetId: Int,
                           metrics: WidgetLayoutMetrics, headerWidth: Dp,
                           openApp: androidx.glance.action.Action) {
    val headerLines = body.lines.take(body.headerLineCount)
    val listLines = body.lines.drop(body.headerLineCount)

    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight().clickable(openApp)) {
        Column(modifier = GlanceModifier.width(headerWidth).fillMaxHeight().clickable(openApp)) {
            Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp))
            for (line in headerLines) BodyLineView(context, state, plan, hero, appWidgetId, metrics, line)
        }

        Spacer(modifier = GlanceModifier.width((DUAL_COLUMN_GAP_DP * metrics.padScale).dp))

        Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight().clickable(openApp)) {
            LazyColumn(modifier = GlanceModifier.fillMaxWidth().defaultWeight().clickable(openApp)) {
                item { Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp).clickable(openApp)) }
                items(listLines.size) { index ->
                    Box(modifier = GlanceModifier.fillMaxWidth().clickable(openApp)) {
                        BodyLineView(context, state, plan, hero, appWidgetId, metrics, listLines[index])
                    }
                }
                item { Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp).clickable(openApp)) }
            }
        }
    }
}

/** 渲染正文中的一行；真实渲染与配置页预览共用它，因此两条路径的视觉不会漂移。 */
@Composable
private fun BodyLineView(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan,
                         hero: WidgetOccurrence, appWidgetId: Int, metrics: WidgetLayoutMetrics,
                         line: WidgetBodyLine) {
    when (line.kind) {
        WidgetBodyLine.Kind.HERO -> HeroSection(context, state, hero, appWidgetId, metrics, line.titleMaxLines)
        WidgetBodyLine.Kind.SUMMARY -> SummaryRow(context, state, plan, appWidgetId, metrics, line.isShowCounts)
        WidgetBodyLine.Kind.COUNTER -> CounterRow(context, state, plan, appWidgetId, metrics)
        WidgetBodyLine.Kind.COLLAPSED -> CollapsedLine(context, plan, metrics)
        WidgetBodyLine.Kind.NEXT_OTHER -> NextOtherDayLine(context, state, metrics)
        WidgetBodyLine.Kind.COURSE -> DayRow(context, line.item, rowGap(line.index, metrics), metrics, line.isShowSections)
    }
}

/**
 * 汇总行：左侧说明这是哪一天、多少节课，右侧「样式」入口。
 *
 * @param showCounts 「信息加密」时为 `true`，在汇总文案后追加当天已上完的节数。
 */
@Composable
private fun SummaryRow(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan, appWidgetId: Int,
                       metrics: WidgetLayoutMetrics, showCounts: Boolean) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Text(text = summaryText(context, state, plan, showCounts), maxLines = 1,
            modifier = GlanceModifier.defaultWeight(), style = captionStyle(metrics, R.color.widget_text_muted))
        StyleEntry(context, appWidgetId, metrics)
    }
}

/**
 * 汇总行文案；「信息加密」时补一句当天已上完多少节。
 *
 * 只在列**今天**时补：列明天时「已上完 N 节」说的是今天，混在一起会被误读成明天已经上完了。
 *
 * @param showCounts 是否追加当天计数。
 * @return 汇总文案。
 */
private fun summaryText(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan, showCounts: Boolean): String {
    val base = daySummaryText(context, plan)
    if (!showCounts || plan.source != WidgetDayPlan.Source.TODAY || state.todayFinishedCount <= 0) return base
    return base + " · " + context.getString(R.string.widget_finished_count, state.todayFinishedCount)
}

/** 「已上完 N 节」折叠计数行；「已上完」策略选的不是折叠时什么都不画。 */
@Composable
private fun CollapsedLine(context: Context, plan: WidgetDayPlan, metrics: WidgetLayoutMetrics) {
    if (plan.collapsedFinishedCount <= 0) return
    Text(text = context.getString(R.string.widget_finished_count, plan.collapsedFinishedCount), maxLines = 1,
        style = captionStyle(metrics, R.color.widget_text_muted))
}

/** 「紧凑」底部的计数行。 */
@Composable
private fun CounterRow(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan, appWidgetId: Int,
                       metrics: WidgetLayoutMetrics) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Text(text = compactCounterText(context, state, plan), maxLines = 1,
            modifier = GlanceModifier.defaultWeight(), style = captionStyle(metrics, R.color.widget_text_muted))
        StyleEntry(context, appWidgetId, metrics)
    }
}

/** 首行贴近汇总行时留多一点空隙，其余行更紧。 */
private fun rowGap(index: Int, metrics: WidgetLayoutMetrics): Dp =
    if (index == 0) metrics.rowGapFirstDp.dp else metrics.rowGapDp.dp

/**
 * 一行课程：时间（+ 可选节次）+ 课程名 + 教室；正在上的那行用强调色，已上完的用弱化色。
 *
 * @param showSections 「信息加密」时为 `true`，时间右侧多一列「第 3-4 节」。
 */
@Composable
private fun DayRow(context: Context, item: WidgetDayItem, topPadding: Dp, metrics: WidgetLayoutMetrics,
                   showSections: Boolean) {
    val occurrence = item.occurrence
    val nameColor = when (item.phase) {
        WidgetDayItem.Phase.IN_PROGRESS -> R.color.widget_accent
        WidgetDayItem.Phase.FINISHED -> R.color.widget_text_muted
        else -> R.color.widget_text_primary
    }

    Row(modifier = GlanceModifier.fillMaxWidth().padding(top = topPadding)) {
        Text(text = if (item.isInProgress) "●" else " ", maxLines = 1,
            modifier = GlanceModifier.width(metrics.markerColumnDp.dp),
            style = captionStyle(metrics, R.color.widget_accent))
        Text(text = occurrence.startLabel, maxLines = 1, modifier = GlanceModifier.width(metrics.timeColumnDp.dp),
            style = bodyStyle(metrics, R.color.widget_text_secondary))
        if (showSections && occurrence.sections.isNotBlank()) {
            // 节次单独占一列而不是塞进时间列：塞进去会把「08:00」这一列撑歪，各行就不再对齐了。
            Text(text = context.getString(R.string.widget_sections_suffix, occurrence.sections), maxLines = 1,
                modifier = GlanceModifier.width(metrics.sectionsColumnDp.dp),
                style = captionStyle(metrics, R.color.widget_text_muted))
        }
        Text(text = occurrence.name, maxLines = 1, modifier = GlanceModifier.defaultWeight(),
            style = bodyStyle(metrics, nameColor))
        if (occurrence.classroom.isNotBlank()) {
            Text(text = occurrence.classroom, maxLines = 1, style = captionStyle(metrics, R.color.widget_text_muted))
        }
    }
}


/**
 * hero：状态标签（含「样式」入口）+ 课程名 + 时间与教室，末尾留一段与课表之间的间距。
 *
 * <p>课名行数由行判决给出：默认一行（真机 4×2 上两行会把卡片撑满，留给下方「剩余课程」的位置就只剩
 * 一丝），用户在「大格子表现」里选「信息加密」时才放宽到两行。
 */
@Composable
private fun HeroSection(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence, appWidgetId: Int,
                        metrics: WidgetLayoutMetrics, titleMaxLines: Int) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text(text = heroLabel(context, state, hero), maxLines = 1,
                modifier = GlanceModifier.defaultWeight(), style = captionStyle(metrics, R.color.widget_accent))
            StyleEntry(context, appWidgetId, metrics)
        }

        Text(text = hero.name, maxLines = titleMaxLines, style = titleStyle(metrics))

        val timeRange = context.getString(R.string.widget_time_range, hero.startLabel, hero.endLabel)
        val detail = if (hero.classroom.isBlank()) timeRange
        else context.getString(R.string.widget_time_and_room, timeRange, hero.classroom)
        Text(text = detail, maxLines = 1, style = bodyStyle(metrics, R.color.widget_text_secondary))

        Spacer(modifier = GlanceModifier.height(metrics.heroGapDp.dp))
    }
}

/**
 * 「样式」入口：打开该实例的配置页。
 *
 * 与 widget 主体的点击区域不重叠（主体打开 App，这里打开配置页），两者都只携带固定常量或
 * widgetId，不携带任何课程数据。
 */
@Composable
private fun StyleEntry(context: Context, appWidgetId: Int, metrics: WidgetLayoutMetrics) {
    Text(
        text = context.getString(R.string.widget_style_entry),
        maxLines = 1,
        modifier = GlanceModifier
            .padding(start = metrics.styleEntryPaddingDp.dp)
            .clickable(actionStartActivity(configIntent(context, appWidgetId))),
        style = captionStyle(metrics, R.color.widget_accent)
    )
}

/** 今天已无课、但后面还有课时，补一行「下一节 · 10月8日 周四 08:00 高等数学」。 */
@Composable
private fun NextOtherDayLine(context: Context, state: WidgetDisplayState, metrics: WidgetLayoutMetrics) {
    val hero = state.hero ?: return
    if (state.heroState != WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY) return

    Text(
        text = context.getString(R.string.widget_next_other_day_line, heroDayLabel(hero), hero.startLabel, hero.name),
        maxLines = 1,
        style = captionStyle(metrics, R.color.widget_accent)
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

/** 缩放百分比换算：日志里用整数百分数，避免打印浮点尾数。 */
private const val PERCENT = 100f

private fun titleStyle(metrics: WidgetLayoutMetrics) = TextStyle(
    color = ColorProvider(R.color.widget_text_primary),
    fontSize = metrics.titleSp.sp,
    fontWeight = FontWeight.Bold
)

private fun bodyStyle(metrics: WidgetLayoutMetrics, colorRes: Int) = TextStyle(
    color = ColorProvider(colorRes),
    fontSize = metrics.bodySp.sp,
    fontWeight = FontWeight.Normal
)

private fun captionStyle(metrics: WidgetLayoutMetrics, colorRes: Int) = TextStyle(
    color = ColorProvider(colorRes),
    fontSize = metrics.captionSp.sp,
    fontWeight = FontWeight.Medium
)
