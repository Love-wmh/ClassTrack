package com.classtrack.app;

/**
 * 一个「预设」：把「目标格子 + 布局样式 + 大格子表现」打包成用户一眼能懂的一种摆法。
 *
 * <p>为什么需要它：小工具在任意尺寸上都能渲染，但**只有少数几个尺寸被验证过是「显示完美」的**
 * （内容刚好铺满、不裁切、不溢出）。与其让用户自己把格子拖到一个没人验证过的尺寸，不如在应用内给出
 * 几个预设，一键按预设添加。
 *
 * <p>本类只承载**原生侧需要的那部分**：样式、大格子表现、目标格子（用于配置页提示与 pin 的尺寸提示）。
 * 展示用的名称/说明写在 Web 侧，避免同一份文案在两处各写一遍。
 *
 * <p>纯函数、不碰 Android，可被 JUnit 直接覆盖（见 {@code WidgetPresetTest}）。
 */
public final class WidgetPreset {

    /** 预设标识；同时也是 Web → 原生传参与日志里用的白名单值。 */
    public static final String ID_PHONE_MINIMAL = "phone_minimal";
    public static final String ID_PHONE_STANDARD = "phone_standard";
    public static final String ID_PHONE_WIDE = "phone_wide";
    public static final String ID_TABLET_DUAL = "tablet_dual";
    public static final String ID_TABLET_WIDE = "tablet_wide";

    /** 目标格子的宽度（dp），来自真机实测，用于 pin 的尺寸提示。 */
    private static final float PHONE_2X2_W = 179f;
    private static final float PHONE_2X2_H = 210f;
    private static final float PHONE_4X2_W = 373f;
    private static final float PHONE_4X2_H = 210f;
    private static final float PHONE_4X3_W = 373f;
    private static final float PHONE_4X3_H = 321f;
    private static final float TABLET_4X3_W = 733f;
    private static final float TABLET_4X3_H = 419f;
    private static final float TABLET_6X3_W = 1142f;
    private static final float TABLET_6X3_H = 419f;

    private final String id;
    private final String cellLabel;
    private final WidgetStyleConfig.LayoutStyle layoutStyle;
    private final WidgetStyleConfig.WideLayout wideLayout;
    private final float widthDp;
    private final float heightDp;

    private WidgetPreset(String id, String cellLabel, WidgetStyleConfig.LayoutStyle layoutStyle,
            WidgetStyleConfig.WideLayout wideLayout, float widthDp, float heightDp) {
        this.id = id;
        this.cellLabel = cellLabel;
        this.layoutStyle = layoutStyle;
        this.wideLayout = wideLayout;
        this.widthDp = widthDp;
        this.heightDp = heightDp;
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
        switch (id.trim().toLowerCase(java.util.Locale.ROOT)) {
            case ID_PHONE_MINIMAL:
                return new WidgetPreset(ID_PHONE_MINIMAL, "2×2", WidgetStyleConfig.LayoutStyle.COMPACT,
                        WidgetStyleConfig.WideLayout.ADAPTIVE, PHONE_2X2_W, PHONE_2X2_H);
            case ID_PHONE_STANDARD:
                return new WidgetPreset(ID_PHONE_STANDARD, "4×3", WidgetStyleConfig.LayoutStyle.NEXT_UP,
                        WidgetStyleConfig.WideLayout.ADAPTIVE, PHONE_4X3_W, PHONE_4X3_H);
            case ID_PHONE_WIDE:
                return new WidgetPreset(ID_PHONE_WIDE, "4×2", WidgetStyleConfig.LayoutStyle.NEXT_UP,
                        WidgetStyleConfig.WideLayout.ADAPTIVE, PHONE_4X2_W, PHONE_4X2_H);
            case ID_TABLET_DUAL:
                return new WidgetPreset(ID_TABLET_DUAL, "4×3", WidgetStyleConfig.LayoutStyle.NEXT_UP,
                        WidgetStyleConfig.WideLayout.TWO_COLUMN, TABLET_4X3_W, TABLET_4X3_H);
            case ID_TABLET_WIDE:
                return new WidgetPreset(ID_TABLET_WIDE, "6×3", WidgetStyleConfig.LayoutStyle.NEXT_UP,
                        WidgetStyleConfig.WideLayout.TWO_COLUMN, TABLET_6X3_W, TABLET_6X3_H);
            default:
                return null;
        }
    }

    /** @return 预设标识（白名单内的固定值）。 */
    public String getId() {
        return id;
    }

    /** @return 目标格子的展示文案，如 `4×3`；只用于提示，不是布局输入。 */
    public String getCellLabel() {
        return cellLabel;
    }

    /** @return 该预设选的布局样式。 */
    public WidgetStyleConfig.LayoutStyle getLayoutStyle() {
        return layoutStyle;
    }

    /** @return 该预设选的「大格子表现」。 */
    public WidgetStyleConfig.WideLayout getWideLayout() {
        return wideLayout;
    }

    /** @return 目标格子宽度（dp）。 */
    public float getWidthDp() {
        return widthDp;
    }

    /** @return 目标格子高度（dp）。 */
    public float getHeightDp() {
        return heightDp;
    }
}
