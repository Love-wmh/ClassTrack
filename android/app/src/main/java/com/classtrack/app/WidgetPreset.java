package com.classtrack.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 一档**按尺寸命名**的预设：目标格子 + 布局样式 + 大格子表现 + （用于尺寸匹配的）标定样本。
 *
 * <p>为什么按尺寸命名（2026-09-21 产品口径变更）：预设现在同时承担三件事 ——
 * 拾取器里的一个 provider、pin 面板里的一张卡、以及**尺寸变化后自动匹配的目标**。
 * 三者都要靠"多大格子"来说话，因此标识与文案都以格子为准（`cell_4x3` / `4×3`），
 * 不再用 `phone_standard` 这种与设备绑定的名字（同一个 4×3 在手机与平板上都存在）。
 *
 * <p>**标定样本**（{@code samples}）：同一个格子数在不同设备族上的 dp 尺寸不同（实测手机 4×3 =
 * 373×321dp、平板 4×3 = 733×419dp），所以每档预设可以带多个实测样本；
 * {@link #match(float, float)} 用"到最近样本的归一化距离"选档，因此不需要任何 `if (height &lt; N)` 阈值。
 *
 * <p>纯函数、不碰 Android，可被 JUnit 直接覆盖（见 {@code WidgetPresetTest} / {@code WidgetPresetMatchTest}）。
 */
public final class WidgetPreset {

    /** 预设标识；同时也是 Web → 原生传参与日志里用的白名单值。 */
    public static final String ID_CELL_2X2 = "cell_2x2";
    public static final String ID_CELL_2X3 = "cell_2x3";
    public static final String ID_CELL_4X2 = "cell_4x2";
    public static final String ID_CELL_4X3 = "cell_4x3";
    public static final String ID_CELL_6X3 = "cell_6x3";

    /** 一个标定样本：某设备族上"这个格子数"实测到的 dp 尺寸。 */
    public static final class Sample {
        final float widthDp;
        final float heightDp;

        Sample(float widthDp, float heightDp) {
            this.widthDp = widthDp;
            this.heightDp = heightDp;
        }
    }

    private static final Sample PHONE_2X2 = new Sample(179f, 210f);
    private static final Sample PHONE_2X3 = new Sample(179f, 315f);
    private static final Sample PHONE_4X2 = new Sample(373f, 210f);
    private static final Sample PHONE_4X3 = new Sample(373f, 321f);
    private static final Sample TABLET_4X3 = new Sample(733f, 419f);
    private static final Sample PHONE_6X3 = new Sample(537f, 315f);
    private static final Sample TABLET_6X3 = new Sample(1142f, 419f);

    private static final List<WidgetPreset> ALL = Arrays.asList(
            new WidgetPreset(ID_CELL_2X2, 2, 2, WidgetStyleConfig.LayoutStyle.COMPACT,
                    WidgetStyleConfig.WideLayout.ADAPTIVE, Arrays.asList(PHONE_2X2)),
            new WidgetPreset(ID_CELL_2X3, 2, 3, WidgetStyleConfig.LayoutStyle.NEXT_UP,
                    WidgetStyleConfig.WideLayout.ADAPTIVE, Arrays.asList(PHONE_2X3)),
            new WidgetPreset(ID_CELL_4X2, 4, 2, WidgetStyleConfig.LayoutStyle.NEXT_UP,
                    WidgetStyleConfig.WideLayout.ADAPTIVE, Arrays.asList(PHONE_4X2)),
            new WidgetPreset(ID_CELL_4X3, 4, 3, WidgetStyleConfig.LayoutStyle.NEXT_UP,
                    // 「双栏能力」而不是"永远双栏"：渲染侧本来就要求几何允许（宽 ≥ 320dp 且 宽 ≥ 高×1.25），
                    // 手机 4×3（比例 1.16）自动退单栏、平板 4×3（比例 1.75）才分两栏。
                    WidgetStyleConfig.WideLayout.TWO_COLUMN, Arrays.asList(PHONE_4X3, TABLET_4X3)),
            new WidgetPreset(ID_CELL_6X3, 6, 3, WidgetStyleConfig.LayoutStyle.NEXT_UP,
                    WidgetStyleConfig.WideLayout.TWO_COLUMN, Arrays.asList(TABLET_6X3, PHONE_6X3)));

    private final String id;
    private final int cellWidth;
    private final int cellHeight;
    private final WidgetStyleConfig.LayoutStyle layoutStyle;
    private final WidgetStyleConfig.WideLayout wideLayout;
    private final List<Sample> samples;

    private WidgetPreset(String id, int cellWidth, int cellHeight, WidgetStyleConfig.LayoutStyle layoutStyle,
            WidgetStyleConfig.WideLayout wideLayout, List<Sample> samples) {
        this.id = id;
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;
        this.layoutStyle = layoutStyle;
        this.wideLayout = wideLayout;
        this.samples = samples;
    }

    /** @return 全部预设（顺序 = pin 面板里的卡片顺序：从小到大）。 */
    public static List<WidgetPreset> all() {
        return ALL;
    }

    /**
     * 按标识取预设。
     *
     * @param id Web 侧传来的预设标识；大小写不敏感。
     * @return 对应预设；标识为空、未知或不是字符串时返回 `null`（调用方据此走「未选预设」的默认行为）。
     */
    public static WidgetPreset parse(String id) {
        if (id == null) {
            return null;
        }
        String normalized = id.trim().toLowerCase(java.util.Locale.ROOT);
        for (WidgetPreset preset : ALL) {
            if (preset.id.equals(normalized)) {
                return preset;
            }
        }
        return null;
    }

    /**
     * 按**当前尺寸**选最合适的一档（口径变更见 design D3b）。
     *
     * <p>规则是**连续最近邻**：对每档预设取"到它所有标定样本里最近的那个"的归一化欧氏距离，选最小的那一档。
     * 因为样本是实测 dp 值，所以这里不需要任何离散阈值分支。
     *
     * <p>并列时的裁决顺序：**格子面积更小的档优先**（内容更少，不会显得空），再按标识字典序（保证确定性）。
     *
     * @param widthDp 实例当前宽度（dp）；非正数时按最小档处理。
     * @param heightDp 实例当前高度（dp）；非正数时按最小档处理。
     * @return 最合适的一档；永不为 `null`（预设表非空）。
     */
    public static WidgetPreset match(float widthDp, float heightDp) {
        if (!(widthDp > 0f) || !(heightDp > 0f)) {
            return ALL.get(0);
        }
        WidgetPreset best = null;
        double bestDistance = Double.MAX_VALUE;
        for (WidgetPreset preset : ALL) {
            double distance = preset.distanceTo(widthDp, heightDp);
            if (best == null || distance < bestDistance || (distance == bestDistance && preset.isPreferableTo(best))) {
                best = preset;
                bestDistance = distance;
            }
        }
        return best;
    }

    private double distanceTo(float widthDp, float heightDp) {
        double best = Double.MAX_VALUE;
        for (Sample sample : samples) {
            double dw = (widthDp - sample.widthDp) / sample.widthDp;
            double dh = (heightDp - sample.heightDp) / sample.heightDp;
            double distance = Math.sqrt(dw * dw + dh * dh);
            if (distance < best) {
                best = distance;
            }
        }
        return best;
    }

    private boolean isPreferableTo(WidgetPreset other) {
        int area = cellWidth * cellHeight;
        int otherArea = other.cellWidth * other.cellHeight;
        if (area != otherArea) {
            return area < otherArea;
        }
        return id.compareTo(other.id) < 0;
    }

    /** @return 预设标识（白名单内的固定值）。 */
    public String getId() {
        return id;
    }

    /** @return 目标格子数（宽）。 */
    public int getCellWidth() {
        return cellWidth;
    }

    /** @return 目标格子数（高）。 */
    public int getCellHeight() {
        return cellHeight;
    }

    /** @return 目标格子的展示文案，如 `4×3`；只用于提示，不是布局输入。 */
    public String getCellLabel() {
        return cellWidth + "×" + cellHeight;
    }

    /** @return 该预设选的布局样式。 */
    public WidgetStyleConfig.LayoutStyle getLayoutStyle() {
        return layoutStyle;
    }

    /** @return 该预设选的「大格子表现」。 */
    public WidgetStyleConfig.WideLayout getWideLayout() {
        return wideLayout;
    }

    /** @return 目标格子宽度（dp）：第一个标定样本，用于 pin 的尺寸提示。 */
    public float getWidthDp() {
        return samples.get(0).widthDp;
    }

    /** @return 目标格子高度（dp）。 */
    public float getHeightDp() {
        return samples.get(0).heightDp;
    }

    /** @return 所有标定样本（供测试与匹配规则使用）。 */
    public List<Sample> getSamples() {
        return new ArrayList<>(samples);
    }
}
