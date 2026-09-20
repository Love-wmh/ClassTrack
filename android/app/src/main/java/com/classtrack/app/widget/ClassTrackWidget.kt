package com.classtrack.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ExperimentalGlanceApi
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.Action
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
import androidx.glance.layout.Alignment
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
import com.classtrack.app.WidgetFillPlan
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
 * 双栏两区之间的留白按内边距尺度缩放，具体数值由 WidgetLayoutMetrics 给出。
 *
 * 左栏宽度也由度量给出（舒适区间内的固定宽度 + 右栏 `defaultWeight()` 吃掉剩余）：
 * Glance 的 `defaultWeight()` 不接受权重参数，只能等分，所以左栏宽度必须自己算。
 */

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
    val dualColumn = isDualColumn(config, metrics)
    val body = WidgetLinePolicy.resolve(config, plan, dualColumn)

    if (!preview) {
        WidgetDiagnostics.widgetSized(size.width.value.toInt(), size.height.value.toInt())
    }
    // 字号与行距的方案：字号上界由格子尺寸给（格子越大字号越大），再收到「内容刚好放下」处。
    // 传入的是一行行文本的字号基准值（hero 是纵向三行；双栏的课程行是双行行项），顺序与渲染一致。
    val contentWidthDp = size.width.value - 2 * metrics.horizontalPaddingDp
    // allowFit = false：可滚动的区域**不为了「刚好放下」而收字号** —— 内容多了就滚动，字号始终由格子
    // 尺寸决定（产品要求「格子越大字号越大」）。只有不可滚动的双栏左卡才允许收（见 DualColumnBody）。
    val fill = WidgetFillPlan.compute(
        metrics,
        size.height.value - 2 * metrics.verticalPaddingDp,
        bodyTextLines(context, state, hero, body, dualColumn, contentWidthDp),
        false
    )
    WidgetDiagnostics.layoutMetrics(
        (metrics.scale * PERCENT).roundToInt(),
        config.wideLayoutStorageValue(),
        dualColumn
    )
    WidgetDiagnostics.layoutFill(
        (fill.fontScale * PERCENT).roundToInt(),
        (fill.gapDp * 10).roundToInt(),
        (fill.fillRatio * PERCENT).roundToInt()
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
            // 字号用「尺寸驱动 + 刚好放下」之后的版本；列宽/留白仍旧用 metrics（收字号不该挤窄时间列）。
            WidgetBody(context, state, config, plan, body, hero, appWidgetId,
                metrics.withFontBoost(fill.localBoost), size, dualColumn, fill, preview)
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
@Composable
private fun ColumnScope.WidgetBody(context: Context, state: WidgetDisplayState, config: WidgetStyleConfig,
                                   plan: WidgetDayPlan, body: WidgetBodyPlan, hero: WidgetOccurrence,
                                   appWidgetId: Int, metrics: WidgetLayoutMetrics, size: DpSize,
                                   dualColumn: Boolean, fill: WidgetFillPlan, preview: Boolean) {
    val lines = body.lines

    if (preview) {
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp))
            for (line in lines) {
                BodyLineView(context, state, plan, hero, appWidgetId, metrics, fill, line)
            }
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
        DualColumnBody(context, state, plan, body, hero, appWidgetId, metrics, size, fill, openApp)
        return
    }

    CourseList(context, state, plan, hero, appWidgetId, metrics, fill, lines, twoLineRows = false,
        GlanceModifier.fillMaxWidth().defaultWeight(), openApp)
}

/**
 * 正文列表（`LazyColumn`）。单栏与双栏右栏共用它，因此：
 *
 * - 「列表容器 + 每个列表项 + 上下留白项都要挂点击」这条真机教训只在这里实现一次；
 * - `LazyColumn` 的实验性 `@OptIn` 也只在**这一个**地方出现（C2：实验性 API 的 opt-in 数量不增长）。
 *
 * 通过 `modifier` 交出「单栏吃满剩余高度」与「双栏右栏独占一整列」这点差异，行内容本身由调用方给定的
 * 同一份行序列决定。
 */
@OptIn(ExperimentalGlanceApi::class)
@Composable
private fun CourseList(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan,
                       hero: WidgetOccurrence, appWidgetId: Int, metrics: WidgetLayoutMetrics,
                       fill: WidgetFillPlan, lines: List<WidgetBodyLine>, twoLineRows: Boolean,
                       modifier: GlanceModifier, openApp: Action) {
    LazyColumn(modifier = modifier.clickable(openApp)) {
        // 首尾留白仍是卡片自己的纵向内边距：它不参与「余量分配」，否则小格子的上下留白也会跟着变
        // （2×2 与改动前的逐像素一致性就是被这一点打破的，真机比对时抓到的）。
        item { Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp).clickable(openApp)) }
        items(lines.size) { index ->
            Box(modifier = GlanceModifier.fillMaxWidth()
                .padding(top = listGap(lines[index], metrics, fill, spaceEveryLine = twoLineRows))
                .clickable(openApp)) {
                BodyLineView(context, state, plan, hero, appWidgetId, metrics, fill, lines[index],
                    twoLineRows = twoLineRows)
            }
        }
        item { Spacer(modifier = GlanceModifier.height(metrics.verticalPaddingDp.dp).clickable(openApp)) }
    }
}

/**
 * 列表项之间的间距。
 *
 * <p>基础值是改动前就验证过的两档（首行 6dp、其余 4dp），再加上填充方案分给行距的余量：格子越高行距越松，
 * 但每份不超过 8dp，不会松成一张稀疏表格。首行始终多留一点，和汇总行拉开层次。
 */
private fun listGap(line: WidgetBodyLine, metrics: WidgetLayoutMetrics, fill: WidgetFillPlan,
                    spaceEveryLine: Boolean): Dp {
    // 单栏沿用改动前的口径：**只有课程行**带上行间距（hero / 汇总行自己带好了与下方的距离），
    // 这条口径是 2×2 与改动前逐像素一致的来源之一。双栏是新的排布，才给每一段都留间距。
    if (!spaceEveryLine && line.kind != WidgetBodyLine.Kind.COURSE) return 0.dp
    val extra = (fill.gapDp - metrics.rowGapDp).coerceAtLeast(0f)
    // 注意用 **line.index（课程序号）** 而不是列表位置：列表第 0 项是汇总行，用列表位置会让第一节课
    // 拿不到「首行多留一点」的那 2dp（真机逐像素比对抓到过一次）。
    return if (line.kind == WidgetBodyLine.Kind.COURSE && line.index == 0) {
        (metrics.rowGapFirstDp + extra).dp
    } else {
        fill.gapDp.dp
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
@Composable
private fun ColumnScope.DualColumnBody(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan,
                           body: WidgetBodyPlan, hero: WidgetOccurrence, appWidgetId: Int,
                           metrics: WidgetLayoutMetrics, size: DpSize, fill: WidgetFillPlan,
                           openApp: Action) {
    val headerLines = body.lines.take(body.headerLineCount)
    val listLines = body.lines.drop(body.headerLineCount)
    // 左卡与右栏**各自求字号**：左卡内容少（三块），同样的空间能放下更大的字；用一个全局字号会被右栏
    // 拖小，于是左卡中缝反而留出一块空白（真机比对时就是这么发现的）。
    val leftFill = WidgetFillPlan.compute(
        metrics,
        size.height.value - 2 * metrics.verticalPaddingDp - 2 * metrics.heroInnerPaddingDp,
        headerTextLines(context, state, hero, headerLines,
            metrics.dualHeaderWidthDp - 2 * metrics.heroInnerPaddingDp),
        true
    )
    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight().clickable(openApp)) {
        // 左区：一整张主卡（占满高度、有分层表面、内容从顶部起排），而不是「Hero 的三行文字」。
        // 第一版双栏只是把行序列对半切，左栏因此变成一条很窄的空白，看起来像排坏了。
        //
        // 顶部对齐而不是垂直居中：右栏第一行是汇总行，左卡第一行是状态标签，两者顶部对齐后左右两区
        // 有一条共同的首行基线；居中会让左侧文字浮在中间，跟右侧错开，看起来像没对齐。
        Box(
            modifier = GlanceModifier
                .width(metrics.dualHeaderWidthDp.dp)
                .fillMaxHeight()
                .clickable(openApp),
        ) {
            // 左卡内部是**三段**：顶部块（状态标签 + 课名）/ 中缝（下一节）/ 底部块（时间 · 教室 +
            // 今天还有 N 节）。两个等权重的 Spacer 把余量摊到中缝上下，于是那半张卡不再是一个空洞 ——
            // 这是「中缝放真信息 + 均分余量」的组合，而不是靠留白撑场面。
            Column(modifier = GlanceModifier.fillMaxSize()) {
                val bottomLine = remainingTodayText(context, state)
                val heroLine = headerLines.firstOrNull { it.kind == WidgetBodyLine.Kind.HERO }
                val leftMetrics = metrics.withFontBoost(leftFill.localBoost)
                if (heroLine != null) {
                    HeroHeading(context, state, hero, appWidgetId, leftMetrics, heroLine.titleMaxLines)
                }
                Spacer(modifier = GlanceModifier.fillMaxWidth().defaultWeight())
                for (line in headerLines) {
                    if (line.kind == WidgetBodyLine.Kind.MID_NEXT) {
                        BodyLineView(context, state, plan, hero, appWidgetId, leftMetrics, leftFill, line)
                    }
                }
                Spacer(modifier = GlanceModifier.fillMaxWidth().defaultWeight())
                HeroDetail(context, hero, leftMetrics)
                if (bottomLine != null) {
                    Text(text = bottomLine, maxLines = 1,
                        style = captionStyle(leftMetrics, R.color.widget_text_muted))
                }
            }
        }

        Spacer(modifier = GlanceModifier.width(metrics.dualGapDp.dp))

        // 右区：当天课表。汇总行不再挂「样式」入口（入口只在左区保留一个）。
        Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight()) {
            CourseList(context, state, plan, hero, appWidgetId, metrics, fill, listLines, twoLineRows = true,
                GlanceModifier.fillMaxWidth().defaultWeight(), openApp)
        }
    }
}

/**
 * 把行序列折算成「一行行文本的字号基准值」，交给 {@link WidgetFillPlan} 估算内容高度。
 *
 * <p>估算保守优先：hero 的课名按行判决给的最大行数算（双栏左卡确实会画到两行），宁可少分一点余量，
 * 也不能让内容被裁 —— 上一轮真机裁字就是这么来的。
 */
private fun headerTextLines(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence,
                            lines: List<WidgetBodyLine>, widthDp: Float): List<WidgetFillPlan.TextLine> {
    val out = mutableListOf<WidgetFillPlan.TextLine>()
    for (line in lines) {
        when (line.kind) {
            WidgetBodyLine.Kind.HERO -> {
                out += WidgetFillPlan.TextLine(CAPTION_BASE_SP, 1, heroLabel(context, state, hero).length, widthDp)
                out += WidgetFillPlan.TextLine(TITLE_BASE_SP, maxOf(1, line.titleMaxLines), hero.name.length, widthDp)
                out += WidgetFillPlan.TextLine(BODY_BASE_SP, 1, heroDetailText(context, hero).length, widthDp)
            }
            else -> {
                val text = nextUpAfterHero(state)?.occurrence
                val label = if (text == null) "" else context.getString(R.string.widget_mid_next, text.startLabel, text.name)
                out += WidgetFillPlan.TextLine(BODY_BASE_SP, 2, label.length, widthDp)
            }
        }
    }
    // 左卡底部两块：时间 · 教室 +「今天还有 N 节」
    out += WidgetFillPlan.TextLine(BODY_BASE_SP, 1, heroDetailText(context, hero).length, widthDp)
    out += WidgetFillPlan.TextLine(CAPTION_BASE_SP, 1,
        (remainingTodayText(context, state) ?: "").length, widthDp)
    return out
}

private fun bodyTextLines(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence,
                          body: WidgetBodyPlan, dualColumn: Boolean, listWidthDp: Float): List<WidgetFillPlan.TextLine> {
    val out = mutableListOf<WidgetFillPlan.TextLine>()
    for (line in body.lines) {
        when (line.kind) {
            WidgetBodyLine.Kind.HERO -> {
                out += WidgetFillPlan.TextLine(CAPTION_BASE_SP, 1, heroLabel(context, state, hero).length, listWidthDp)
                out += WidgetFillPlan.TextLine(TITLE_BASE_SP, maxOf(1, line.titleMaxLines), hero.name.length, listWidthDp)
                out += WidgetFillPlan.TextLine(BODY_BASE_SP, 1, heroDetailText(context, hero).length, listWidthDp)
            }
            WidgetBodyLine.Kind.COURSE -> {
                val item = line.item
                out += WidgetFillPlan.TextLine(BODY_BASE_SP, if (dualColumn) 2 else 1,
                    item.occurrence.name.length + TIME_LABEL_LENGTH, listWidthDp)
                out += WidgetFillPlan.TextLine(CAPTION_BASE_SP, 1, metaLength(context, item, line.isShowSections), listWidthDp)
            }
            WidgetBodyLine.Kind.FOOTER_LAST -> {
                val last = state.todayItems.lastOrNull()?.occurrence
                val text = if (last == null) "" else context.getString(R.string.widget_footer_last, last.startLabel, last.name)
                out += WidgetFillPlan.TextLine(CAPTION_BASE_SP, 2, text.length, listWidthDp)
            }
            else -> {
                out += WidgetFillPlan.TextLine(CAPTION_BASE_SP, 1, SUMMARY_LENGTH, listWidthDp)
            }
        }
    }
    return out
}

/** 课程行里「时间 + 课名」占的文字量（时间那一列也占宽度，一起算进去）。 */
private const val TIME_LABEL_LENGTH = 6

/** 汇总/计数一类行的典型长度：它们是固定句式，估算用常数即可。 */
private const val SUMMARY_LENGTH = 18

private fun metaLength(context: Context, item: WidgetDayItem, showSections: Boolean): Int {
    var length = item.occurrence.classroom.length
    if (showSections && item.occurrence.sections.isNotBlank()) {
        length += item.occurrence.sections.length + 3
    }
    return length
}

/** 行高估算用的字号基准值：与行判决给出的字体角色一一对应。 */
private const val TITLE_BASE_SP = 16f
private const val BODY_BASE_SP = 13f
private const val CAPTION_BASE_SP = 11f

/** 渲染正文中的一行；真实渲染与配置页预览共用它，因此两条路径的视觉不会漂移。 */
@Composable
private fun BodyLineView(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan,
                         hero: WidgetOccurrence, appWidgetId: Int, metrics: WidgetLayoutMetrics,
                         fill: WidgetFillPlan, line: WidgetBodyLine,
                         twoLineRows: Boolean = false) {
    when (line.kind) {
        WidgetBodyLine.Kind.HERO -> HeroSection(context, state, hero, appWidgetId, metrics, line.titleMaxLines)
        WidgetBodyLine.Kind.SUMMARY -> SummaryRow(context, state, plan, appWidgetId, metrics, line.isShowCounts, true)
        WidgetBodyLine.Kind.SUMMARY_COUNTS -> SummaryCountsRow(context, state, plan, metrics)
        WidgetBodyLine.Kind.COUNTER -> CounterRow(context, state, plan, appWidgetId, metrics)
        WidgetBodyLine.Kind.COLLAPSED -> CollapsedLine(context, plan, metrics)
        WidgetBodyLine.Kind.NEXT_OTHER -> NextOtherDayLine(context, state, metrics)
        WidgetBodyLine.Kind.MID_NEXT -> MidNextRow(context, state, metrics)
        WidgetBodyLine.Kind.FOOTER_LAST -> FooterLastRow(context, state, metrics)
        WidgetBodyLine.Kind.COURSE -> DayRow(context, line.item, metrics, line.isShowSections, twoLineRows)
    }
}

/**
 * 双栏富内容：汇总行下面那行当天计数（「已上完 1 节 · 还有 2 节」）。
 *
 * <p>数据来自既有状态（{@code todayFinishedCount} / {@code todayRemainingCount}），
 * **不需要任何额外刷新**：这是本轮填充方案的基本要求。
 */
@Composable
private fun SummaryCountsRow(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan,
                             metrics: WidgetLayoutMetrics) {
    if (plan.source != WidgetDayPlan.Source.TODAY) return
    Text(text = context.getString(R.string.widget_counts_summary, state.todayFinishedCount,
            state.todayRemainingCount), maxLines = 1,
        style = captionStyle(metrics, R.color.widget_text_muted))
}

/** 双栏左卡中缝：「下一节 16:00 线性代数 D402」。当天没有后续课时不画。 */
@Composable
private fun MidNextRow(context: Context, state: WidgetDisplayState, metrics: WidgetLayoutMetrics) {
    val item = nextUpAfterHero(state) ?: return
    val occurrence = item.occurrence
    Text(text = context.getString(R.string.widget_mid_next, occurrence.startLabel, occurrence.name), maxLines = 2,
        style = bodyStyle(metrics, R.color.widget_text_secondary))
}

/** 双栏列表底部：「今天最后一节 19:00 数据结构 A101」。 */
@Composable
private fun FooterLastRow(context: Context, state: WidgetDisplayState, metrics: WidgetLayoutMetrics) {
    val last = state.todayItems.lastOrNull() ?: return
    Text(text = context.getString(R.string.widget_footer_last, last.occurrence.startLabel, last.occurrence.name),
        maxLines = 2, style = captionStyle(metrics, R.color.widget_text_muted))
}

/**
 * @return hero 之后的第一节「还没开始」的课；没有则为 `null`。
 *
 * <p>用 hero 在当天的位置做切分，而不是比较时间：这样「hero 是正在上的那一节」与「hero 是接下来那一节」
 * 两种情况都成立，也不会因为秒级误差选错行。
 */
private fun nextUpAfterHero(state: WidgetDisplayState): WidgetDayItem? {
    val hero = state.hero ?: return null
    var passedHero = false
    for (item in state.todayItems) {
        if (!passedHero) {
            if (item.occurrence == hero) passedHero = true
            continue
        }
        if (item.phase == WidgetDayItem.Phase.UPCOMING) return item
    }
    return null
}

/**
 * 汇总行：左侧说明这是哪一天、多少节课，右侧「样式」入口。
 *
 * @param showCounts 「信息加密」时为 `true`，在汇总文案后追加当天已上完的节数。
 */
@Composable
private fun SummaryRow(context: Context, state: WidgetDisplayState, plan: WidgetDayPlan, appWidgetId: Int,
                       metrics: WidgetLayoutMetrics, showCounts: Boolean, styleEntryOnSummary: Boolean) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Text(text = summaryText(context, state, plan, showCounts), maxLines = 1,
            modifier = GlanceModifier.defaultWeight(), style = captionStyle(metrics, R.color.widget_text_muted))
        if (styleEntryOnSummary) StyleEntry(context, appWidgetId, metrics)
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
private fun DayRow(context: Context, item: WidgetDayItem, metrics: WidgetLayoutMetrics,
                   showSections: Boolean, twoLines: Boolean) {
    val occurrence = item.occurrence
    val nameColor = when (item.phase) {
        WidgetDayItem.Phase.IN_PROGRESS -> R.color.widget_accent
        WidgetDayItem.Phase.FINISHED -> R.color.widget_text_muted
        else -> R.color.widget_text_primary
    }

    if (twoLines) {
        // 双栏的右栏又宽又高：课名允许两行、教室挪到课名下面。
        // 一行的 700dp 宽卡片把教室推到最右边，眼睛要从课名跳到屏幕另一头才读得到。
        val meta = buildList {
            if (occurrence.sections.isNotBlank()) add(context.getString(R.string.widget_sections_suffix, occurrence.sections))
            if (occurrence.classroom.isNotBlank()) add(occurrence.classroom)
        }.joinToString(" · ")

        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text(text = if (item.isInProgress) "●" else " ", maxLines = 1,
                modifier = GlanceModifier.width(metrics.markerColumnDp.dp),
                style = captionStyle(metrics, R.color.widget_accent))
            Text(text = occurrence.startLabel, maxLines = 1,
                modifier = GlanceModifier.width(metrics.timeColumnDp.dp),
                style = bodyStyle(metrics, R.color.widget_text_secondary))
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(text = occurrence.name, maxLines = 2, style = bodyStyle(metrics, nameColor))
                if (meta.isNotBlank()) {
                    Text(text = meta, maxLines = 1, style = captionStyle(metrics, R.color.widget_text_muted))
                }
            }
        }
        return
    }

    Row(modifier = GlanceModifier.fillMaxWidth()) {
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
 * 单栏与预览里的 hero：状态标签（含「样式」入口）+ 课程名 + 时间与教室，末尾留一段与课表之间的间距。
 *
 * <p>这里**刻意不套子卡片**：产品负责人在真机对比后明确否掉了单栏下的主卡化 —— 单栏本来就是
 * 「一段文字 + 下面的课表」，凭空加一层底色只会多出一个框。子卡片只存在于双栏（见 [HeroCard]）。
 *
 * <p>课名行数由行判决给出：默认一行（真机 4×2 上两行会把卡片撑满，留给下方「剩余课程」的位置就只剩
 * 一丝），用户在「大格子表现」里选「信息加密」时才放宽到两行。
 */
@Composable
private fun HeroSection(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence, appWidgetId: Int,
                        metrics: WidgetLayoutMetrics, titleMaxLines: Int) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        HeroHeading(context, state, hero, appWidgetId, metrics, titleMaxLines)
        HeroDetail(context, hero, metrics)
        Spacer(modifier = GlanceModifier.height(metrics.heroGapDp.dp))
    }
}

/** hero 的上半块：状态标签（右侧带「样式」入口）+ 课程名。单栏与双栏左卡共用。 */
@Composable
private fun HeroHeading(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence, appWidgetId: Int,
                        metrics: WidgetLayoutMetrics, titleMaxLines: Int) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text(text = heroLabel(context, state, hero), maxLines = 1,
                modifier = GlanceModifier.defaultWeight(), style = captionStyle(metrics, R.color.widget_accent))
            StyleEntry(context, appWidgetId, metrics)
        }

        Text(text = hero.name, maxLines = titleMaxLines, style = titleStyle(metrics))
    }
}

/** hero 的下半块：时间 · 教室。单栏与双栏左卡共用。 */
@Composable
private fun HeroDetail(context: Context, hero: WidgetOccurrence, metrics: WidgetLayoutMetrics) {
    Text(text = heroDetailText(context, hero), maxLines = 1,
        style = bodyStyle(metrics, R.color.widget_text_secondary))
}

/** 「14:00 - 15:40 · B203」：渲染与高度估算共用同一份文案，避免两处写法漂移。 */
private fun heroDetailText(context: Context, hero: WidgetOccurrence): String {
    val timeRange = context.getString(R.string.widget_time_range, hero.startLabel, hero.endLabel)
    return if (hero.classroom.isBlank()) timeRange
    else context.getString(R.string.widget_time_and_room, timeRange, hero.classroom)
}

/**
 * 双栏左卡：上半是状态标签（含「样式」入口）与课程名，下半是时间、教室与「今天还有 N 节」。
 *
 * <p>**只在双栏使用**。产品负责人在真机对比后否掉了单栏下的主卡化：单栏的卡片本来就是「一段文字 +
 * 下面的课表」，凭空加一层底色反而多出一个框。而双栏左卡是「一整列就是一张卡」，它必须有边界和内部
 * 排布，否则那半张卡会显得空。
 *
 * <p>**为什么两端对齐而不是居中**：卡片比内容高时，堆在顶部会在底部留一片死白，居中又会让它与右边
 * 课表首行错开。这里用「吃掉余量的 Spacer」把顶部块与底部块拉开 —— 一眼看过去是信息撑满的一张卡。
 *
 * @param titleMaxLines 课名允许的行数（双栏给两行，长课名不必截成「毛泽东思想和中国…」）。
 * @param bottomLine 底部副信息（「今天还有 N 节」）；为 `null` 时不画。
 */
@Composable
private fun HeroCard(context: Context, state: WidgetDisplayState, hero: WidgetOccurrence, appWidgetId: Int,
                     metrics: WidgetLayoutMetrics, titleMaxLines: Int, bottomLine: String?) {
    Box(
        modifier = GlanceModifier
            .fillMaxWidth()
            .fillMaxHeight()
            .background(ColorProvider(R.color.widget_surface_card))
            .cornerRadius(metrics.cardRadiusDp.dp)
            .padding(metrics.heroInnerPaddingDp.dp),
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            HeroHeading(context, state, hero, appWidgetId, metrics, titleMaxLines)

            Spacer(modifier = GlanceModifier.fillMaxWidth().defaultWeight())

            Column(modifier = GlanceModifier.fillMaxWidth()) {
                HeroDetail(context, hero, metrics)

                if (bottomLine != null) {
                    Text(text = bottomLine, maxLines = 1,
                        style = captionStyle(metrics, R.color.widget_text_muted))
                }
            }
        }
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

/**
 * 主卡底部的副信息：「今天还有 N 节」。
 *
 * @param context 任意 Context。
 * @param state 当前渲染状态。
 * @return 文案；今天没有剩余课时返回 `null`（不画空行）。
 */
private fun remainingTodayText(context: Context, state: WidgetDisplayState): String? =
    if (state.todayRemainingCount > 0) {
        context.getString(R.string.widget_today_remaining_count, state.todayRemainingCount)
    } else {
        null
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
