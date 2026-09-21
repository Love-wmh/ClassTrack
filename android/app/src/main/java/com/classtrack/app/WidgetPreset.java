package com.classtrack.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 一档**按尺寸命名**的预设：目标格子 + 布局样式 + 大格子表现 + （用于尺寸匹配的）标定样本。
 *
 * <p>为什么按尺寸命名（2026-09-21 产品口径变更）：预设同时承担两件事 —— 拾取器里的一个 provider、
 * pin 面板里的一张卡。两者都要靠"多大格子"来说话，因此标识与文案都以格子为准（`cell_4x3` / `4×3`），
 * 不再用 `phone_standard` 这种与设备绑定的名字（同一个 4×3 在手机与平板上都存在）。
 *
 * <p>**标定样本**（{@code samples}）：同一个格子数在不同设备族上的 dp 尺寸不同（实测手机 4×3 =
 * 373×321dp、平板 4×3 = 733×419dp），所以每档预设可以带多个实测样本。样本现在**只**服务
 * {@link #getWidthDp()} / {@link #getHeightDp()}（pin 的尺寸提示）—— 「按尺寸自动匹配样式」那条路径已于
 * 2026-09-21 删除：样式改为由用户显式选择、或该实例 provider 那档预设的样式决定（见 design D3）。
 *
 * <p>纯函数、不碰 Android，可被 JUnit 直接覆盖（见 {@code WidgetPresetTest}）。
 */
public final class WidgetPreset {

    /** 预设标识；同时也是 Web → 原生传参与日志里用的白名单值。 */
    public static final String ID_CELL_2X2 = "cell_2x2";
    public static final String ID_CELL_2X3 = "cell_2x3";
    public static final String ID_CELL_4X2 = "cell_4x2";
    public static final String ID_CELL_4X3 = "cell_4x3";
    public static final String ID_CELL_6X3 = "cell_6x3";

    /** 维护档（2026-09-21 起只有这两档进系统拾取器）：3×2「接下来」、1×2「紧凑」。 */
    public static final String ID_CELL_3X2 = "cell_3x2";
    public static final String ID_CELL_1X2 = "cell_1x2";

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
    /** 手机 3×2 = 276×210dp（2026-09-20 真机实测）；1×2 = 97×210dp（**估算值**，待真机量测校准，见 A6）。 */
    private static final Sample PHONE_3X2 = new Sample(276f, 210f);
    private static final Sample PHONE_1X2 = new Sample(97f, 210f);

    private static final List<WidgetPreset> ALL = Arrays.asList(
            // 两档维护档在前（与 WidgetProviderRegistry 的顺序一致）：这两个 provider 会进拾取器，
            // 其余五档只是保留数据供存量实例与归属校验使用。
            new WidgetPreset(ID_CELL_3X2, 3, 2, WidgetStyleConfig.LayoutStyle.NEXT_UP,
                    WidgetStyleConfig.WideLayout.ADAPTIVE, Arrays.asList(PHONE_3X2)),
            new WidgetPreset(ID_CELL_1X2, 1, 2, WidgetStyleConfig.LayoutStyle.COMPACT,
                    WidgetStyleConfig.WideLayout.ADAPTIVE, Arrays.asList(PHONE_1X2)),
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

    /** @return 全部预设（顺序：维护档在前，随后是收起档 —— 与 {@code WidgetProviderRegistry} 一致）。 */
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

    /** @return 所有标定样本（只用于 pin 的尺寸提示，见 {@link #getWidthDp()}）。 */
    public List<Sample> getSamples() {
        return new ArrayList<>(samples);
    }
}
