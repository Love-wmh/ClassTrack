package com.classtrack.app;

/**
 * 桌面小工具在**某个真实格子尺寸**下要用的排版度量。
 *
 * <p>背景：这一版之前所有度量（字号、内边距、行距、列宽、圆角）都是写死的绝对值，格子被拉大后
 * 内容不跟着变，用户看到的是「字小 + 大片空白」，平板上最明显。这里把度量做成**尺寸的连续函数**，
 * 渲染层只负责把数值转成 `Dp`/`sp`。
 *
 * <p>三条必须保住的约束：
 *
 * <ol>
 *   <li>**下限锁死 1.0**：2×2 与手机 4×3 的输出与改动前逐值相同，「小格子不回归」由构造保证，
 *       不靠人眼比对；</li>
 *   <li>**取两个维度里更紧的那个**（`min`）：只要有一边还是手机尺寸就不放大，避免横长竖矮的格子上
 *       字号把行挤出卡片；</li>
 *   <li>**不许用尺寸档位或尺寸阈值**：没有 `SizeMode.Responsive` 那样的候选集合，也没有
 *       「高度小于 N 就不显示某区块」的分支 —— 放大只是算术，不是分支。</li>
 * </ol>
 *
 * <p>2026-09-20 第二轮（真机比对后）补了两件事：
 *
 * <ol>
 *   <li>**度量落网格**：字号落 0.5sp、其余落 1dp。缩放算出来的 5.24dp / 20.96sp 这种「程序员间距」
 *       在视觉上是脏的，落网格后才像设计稿；</li>
 *   <li>**双栏的排布参数**：左卡宽度、两区间距与卡内留白也在这里算（见 {@link #getDualHeaderWidthDp()}、
 *       {@link #getDualGapDp()}、{@link #getHeroInnerPaddingDp()}）。子卡片**只存在于双栏**：产品负责人
 *       在真机对比后明确否掉了单栏下的主卡化 —— 只有「一整列就是一张卡」的双栏才需要它，单栏保持
 *       「卡片上就是一段文字」。</li>
 * </ol>
 *
 * <p>纯函数：不碰 Android，可被 JUnit 直接覆盖（见 {@code WidgetLayoutMetricsTest}）。
 */
public final class WidgetLayoutMetrics {

    /**
     * 标定基准宽度：**2×2 最小格**（2026-09-20 实测 179×210dp）。
     *
     * <p>这里从「手机 4×3」改成「2×2」是产品负责人在真机比对后的要求：**格子越大字号越大应当是默认事实**，
     * 而不是「先按 4×3 定死、再想办法填满」。于是 2×2 = 1.0（与改动前逐值相同），手机 4×3 ≈ 1.53，
     * 平板 4×3 顶到上限 2.0。
     */
    public static final float W_REF = 179f;

    /** 标定基准高度：2×2 最小格实测。 */
    public static final float H_REF = 210f;

    /** 缩放下限：与 2×2 一致 —— 更小的格子保持 2×2 的字号，绝不缩小。 */
    public static final float MIN_SCALE = 1f;

    /** 缩放上限：防失控的常量（平板 4×3 的 419/210 ≈ 2.0 正好落在它上面）。 */
    public static final float MAX_SCALE = 2f;

    /** 允许分两栏的最小宽度：再窄下去两栏各自都读不通。这是**布局可行性下限**，不是内容可见性阈值。 */
    private static final float DUAL_MIN_WIDTH_DP = 320f;

    /**
     * 允许分两栏的最小宽高比。
     *
     * <p>取 1.25 而不是 1.15 是实测定下来的：手机 4×3 的真实宽高比是 373/321 ≈ 1.162，用 1.15 会让
     * 手机默认格子也满足判据，「双栏只在宽格子上生效」这条就名存实亡了。1.25 把手机 4×3（1.162）挡在
     * 外面，同时平板 4×3（733/419 ≈ 1.75）与平板 6×4（≈1.97）都在里面。
     */
    private static final float DUAL_MIN_ASPECT = 1.25f;

    // 以下基准值就是改动前写死在 ClassTrackWidget.kt 里的常量，scale = 1 时必须逐值等于它们。
    private static final float BASE_TITLE_SP = 16f;
    private static final float BASE_BODY_SP = 13f;
    private static final float BASE_CAPTION_SP = 11f;
    private static final float BASE_HORIZONTAL_PADDING_DP = 14f;
    private static final float BASE_VERTICAL_PADDING_DP = 12f;
    private static final float BASE_CARD_RADIUS_DP = 20f;
    private static final float BASE_ROW_GAP_FIRST_DP = 6f;
    private static final float BASE_ROW_GAP_DP = 4f;
    private static final float BASE_HERO_GAP_DP = 6f;
    private static final float BASE_TIME_COLUMN_DP = 44f;
    private static final float BASE_MARKER_COLUMN_DP = 12f;
    private static final float BASE_STYLE_ENTRY_PADDING_DP = 8f;
    /**
     * 「信息加密」时「第几节」那一列的宽度。
     *
     * <p>按最长的现实取值定：`第11-12节` 在 11sp 下约 52dp，取 64dp 留出余量。定得太窄会真真切切地
     * 把节次截成「第9-1…」（平板实测过），所以这个数字不是装饰性的。
     */
    private static final float BASE_SECTIONS_COLUMN_DP = 64f;

    /** 字号落网格的步长（sp）：半磅是这套字号下肉眼能分辨的最小一档。 */
    private static final float SP_STEP = 0.5f;

    /** 其余度量落网格的步长（dp）。 */
    private static final float DP_STEP = 1f;

    /**
     * 一行文本占的高度 = 字号 × 本系数。
     *
     * <p>**实测标定，不是猜的**：平板 4×3 截图上四行课表的行距是 51px(280dpi) = 29.1dp，减掉 5dp 行距 →
     * 17sp 字号的行盒 24.1dp → 系数 1.42。上一轮用「字号 × 1.45」估算主卡高度却在真机上裁掉了 hero 首行，
     * 根因不是系数，而是漏算了「样式」按钮（带内边距）会让标签行更高 —— 见 {@link WidgetFillPlan}。
     */
    public static final float LINE_HEIGHT_FACTOR = 1.42f;

    /** 行高估算的安全系数：宁可少分一点余量，也不能让内容被裁（1.02 是实测下来既不裁切也不留白的取值）。 */
    public static final float LINE_HEIGHT_SAFETY = 1.02f;

    /**
     * 字号落网格：与渲染层用的取整规则**完全一致**。
     *
     * <p>估算必须用同一个取整结果，否则会出现「估算 19.88sp、实际渲染 20sp」这种系统性偏小 ——
     * 偏小的估算会让内容放不下，正是上一轮真机裁字的成因。
     *
     * @param sp 未取整的字号。
     * @return 落到 0.5sp 网格上的字号。
     */
    public static float snappedSp(float sp) {
        return Math.max(0f, Math.round(sp * 2f) / 2f);
    }

    /** 内容高度估算时用的行盒高度（dp）；入参应当已经过 {@link #snappedSp(float)}。 */
    public static float estimateLineHeightDp(float fontSizeSp) {
        return Math.max(0f, fontSizeSp) * LINE_HEIGHT_FACTOR * LINE_HEIGHT_SAFETY;
    }

    /** 双栏时左栏（主卡）占正文宽度的比例，以及它的下限/上限（dp）。 */
    private static final float DUAL_HEADER_SHARE = 0.36f;
    private static final float DUAL_HEADER_MIN_DP = 220f;
    private static final float DUAL_HEADER_MAX_DP = 360f;

    /** 双栏两区之间的留白（dp，随内边距尺度缩放）。 */
    private static final float DUAL_GAP_DP = 12f;

    /** 双栏左卡的内部留白（dp，随内边距尺度缩放）。 */
    private static final float HERO_INNER_PADDING_DP = 14f;

    private final float scale;
    private final float padScale;
    /** 局部字号系数（由 {@link WidgetFillPlan} 给的「刚好放下」值），只影响字号，不影响列宽与留白。 */
    private final float fontBoost;
    private final boolean dualColumn;
    private final float widthDp;
    private final float heightDp;

    private WidgetLayoutMetrics(float scale, float padScale, boolean dualColumn, float widthDp, float heightDp) {
        this(scale, padScale, dualColumn, widthDp, heightDp, 1f);
    }

    private WidgetLayoutMetrics(float scale, float padScale, boolean dualColumn, float widthDp, float heightDp,
            float fontBoost) {
        this.fontBoost = fontBoost;
        this.scale = scale;
        this.padScale = padScale;
        this.dualColumn = dualColumn;
        this.widthDp = widthDp;
        this.heightDp = heightDp;
    }

    /**
     * 按真实格子尺寸算出这一套度量。
     *
     * @param widthDp 宿主格子的真实宽度（dp），来自 `LocalSize`。
     * @param heightDp 宿主格子的真实高度（dp）。
     * @return 度量集合；尺寸非法（非有限值或非正数）时退化为 scale = 1 的一套基准度量。
     */
    public static WidgetLayoutMetrics resolve(float widthDp, float heightDp) {
        if (!isUsable(widthDp) || !isUsable(heightDp)) {
            return new WidgetLayoutMetrics(MIN_SCALE, 1f, false, 0f, 0f);
        }
        // 两边比值取小的那个：纸面上限由更紧的那个维度决定。
        float raw = Math.min(widthDp / W_REF, heightDp / H_REF);
        float scale = Math.min(Math.max(raw, MIN_SCALE), MAX_SCALE);
        // 内边距与圆角比字号保守：大格子上不该被内边距吃掉内容区。
        float padScale = (float) Math.sqrt(scale);
        // 分栏要求：足够宽 + 够横。两个判据都是几何可行性下限，与设备类型无关。
        boolean dual = widthDp >= DUAL_MIN_WIDTH_DP && widthDp >= heightDp * DUAL_MIN_ASPECT;
        return new WidgetLayoutMetrics(scale, padScale, dual, widthDp, heightDp);
    }

    /**
     * @param value 待判定的尺寸。
     * @return 该尺寸是否可用于缩放计算。
     */
    private static boolean isUsable(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value) && value > 0f;
    }

    /**
     * 把数值落到 step 的整数倍上（四舍五入）。
     *
     * <p>落网格不会破坏「连续」这条要求：它只是量化，仍然单调不减，也仍然没有任何「按尺寸选档位」的
     * 分支。收益是 5.24dp 这类间距变成 5dp，行与行之间看起来是设计过的。
     *
     * @param value 待量化的数值。
     * @param step 步长（正数）。
     * @return 量化后的数值。
     */
    private static float snap(float value, float step) {
        return Math.round(value / step) * step;
    }

    /**
     * @param value 待夹取的数值。
     * @param min 下限。
     * @param max 上限。
     * @return 夹取后的数值。
     */
    private static float clamp(float value, float min, float max) {
        return Math.min(Math.max(value, min), max);
    }

    /** @return 统一缩放因子，恒在 [{@link #MIN_SCALE}, {@link #MAX_SCALE}] 内。 */
    /**
     * @param boost 局部字号系数（≤ 1）。
     * @return 只改了字号的副本：列宽、内边距、行距都不动 —— 收字号是为了「刚好放下」，
     *     不应该顺手把时间列也挤窄。
     */
    public WidgetLayoutMetrics withFontBoost(float boost) {
        float clamped = Math.min(Math.max(boost, 0.5f), 1f);
        if (Math.abs(clamped - fontBoost) < 0.001f) {
            return this;
        }
        return new WidgetLayoutMetrics(scale, padScale, dualColumn, widthDp, heightDp, clamped);
    }

    public float getScale() {
        return scale;
    }

    /** @return 内边距与圆角的缩放因子（比 {@link #getScale()} 保守）。 */
    public float getPadScale() {
        return padScale;
    }

    /** @return hero 课名字号（sp）。 */
    public float getTitleSp() {
        return snap(BASE_TITLE_SP * scale * fontBoost, SP_STEP);
    }

    /** @return 正文字号（sp）。 */
    public float getBodySp() {
        return snap(BASE_BODY_SP * scale * fontBoost, SP_STEP);
    }

    /** @return 说明字号（sp）。 */
    public float getCaptionSp() {
        return snap(BASE_CAPTION_SP * scale * fontBoost, SP_STEP);
    }

    /** @return 卡片横向内边距（dp）。 */
    public float getHorizontalPaddingDp() {
        return snap(BASE_HORIZONTAL_PADDING_DP * padScale, DP_STEP);
    }

    /** @return 卡片纵向内边距（dp）。 */
    public float getVerticalPaddingDp() {
        return snap(BASE_VERTICAL_PADDING_DP * padScale, DP_STEP);
    }

    /** @return 卡片圆角（dp）。 */
    public float getCardRadiusDp() {
        return snap(BASE_CARD_RADIUS_DP * padScale, DP_STEP);
    }

    /** @return 首行课程与汇总行之间的行距（dp）。 */
    public float getRowGapFirstDp() {
        return snap(BASE_ROW_GAP_FIRST_DP * scale, DP_STEP);
    }

    /** @return 其余行之间的行距（dp）。 */
    public float getRowGapDp() {
        return snap(BASE_ROW_GAP_DP * scale, DP_STEP);
    }

    /** @return hero 区块与下方课表之间的间距（dp）。 */
    public float getHeroGapDp() {
        return snap(BASE_HERO_GAP_DP * scale, DP_STEP);
    }

    /** @return 课程行的时间列宽（dp）。 */
    public float getTimeColumnDp() {
        return snap(BASE_TIME_COLUMN_DP * scale, DP_STEP);
    }

    /** @return 「正在上」标记列宽（dp）。 */
    public float getMarkerColumnDp() {
        return snap(BASE_MARKER_COLUMN_DP * scale, DP_STEP);
    }

    /** @return 「样式」入口的左内边距（dp）。 */
    public float getStyleEntryPaddingDp() {
        return snap(BASE_STYLE_ENTRY_PADDING_DP * padScale, DP_STEP);
    }

    /** @return 双栏左卡（「现在这节课」那张卡）的内部留白（dp）。 */
    public float getHeroInnerPaddingDp() {
        return snap(HERO_INNER_PADDING_DP * padScale, DP_STEP);
    }

    /**
     * @return 双栏左卡的宽度（dp）。
     *
     * <p>取「正文宽度的一个比例」再夹进舒适区间，而不是死板的百分比：极窄的双栏卡片保底 220dp
     * （再窄课名就要逐字换行），极宽的卡片封顶 360dp（再宽的话一行会被拉得太长、读起来费劲）。
     */
    public float getDualHeaderWidthDp() {
        float contentWidth = Math.max(0f, widthDp - 2 * getHorizontalPaddingDp());
        return snap(clamp(contentWidth * DUAL_HEADER_SHARE, DUAL_HEADER_MIN_DP, DUAL_HEADER_MAX_DP), DP_STEP);
    }

    /** @return 双栏两区之间的留白（dp）。 */
    public float getDualGapDp() {
        return snap(DUAL_GAP_DP * padScale, DP_STEP);
    }

    /**
     * @return 「信息加密」时节次列的宽度（dp）；不加密时这一列不参与布局。
     */
    public float getSectionsColumnDp() {
        return snap(BASE_SECTIONS_COLUMN_DP * scale, DP_STEP);
    }

    /**
     * @return 当前尺寸是否支持把正文分两栏。只有用户显式选了「双栏」时渲染层才会参考它；
     *     不满足时保持单栏（配置页对此有如实说明）。
     */
    public boolean isDualColumn() {
        return dualColumn;
    }
}
