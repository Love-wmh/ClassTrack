package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 厂商专属能力开关的语义。
 *
 * <p>这里钉住三件事：**门槛的边界**（33 不给用、34 给用、未识别厂商永不给用）、**探测结果为假时不带
 * extras**（小米的详情页能力要靠系统回答，不能拍脑袋）、**荣耀一条专属能力都不能有**。
 */
public class WidgetVendorSupportTest {

    private static final int BELOW_FLOOR = WidgetVendorSupport.MODERN_SDK_FLOOR - 1;
    private static final int AT_FLOOR = WidgetVendorSupport.MODERN_SDK_FLOOR;

    @Test
    public void modernFloorIsAndroid14() {
        assertEquals(34, WidgetVendorSupport.MODERN_SDK_FLOOR);
    }

    @Test
    public void modernBoundaryIsExact() {
        assertFalse("Android 13（MIUI 14 一类）不给厂商专属能力", WidgetVendorSupport.isModern(BELOW_FLOOR, WidgetVendorFamily.XIAOMI));
        assertTrue(WidgetVendorSupport.isModern(AT_FLOOR, WidgetVendorFamily.XIAOMI));
        assertTrue(WidgetVendorSupport.isModern(36, WidgetVendorFamily.VIVO));
    }

    @Test
    public void unknownVendorIsNeverModern() {
        assertFalse(WidgetVendorSupport.isModern(36, WidgetVendorFamily.OTHER));
        assertFalse(WidgetVendorSupport.isModern(36, null));
    }

    /** 小米 extras 的四组：探测为假的组合必须**不带**（退回标准 pin）。 */
    @Test
    public void xiaomiWidgetCenterExtrasRequireDetection() {
        assertTrue(WidgetVendorSupport.usesWidgetCenterExtras(AT_FLOOR, WidgetVendorFamily.XIAOMI, true));
        assertFalse("探测说不支持详情页 → 不带 extras",
                WidgetVendorSupport.usesWidgetCenterExtras(AT_FLOOR, WidgetVendorFamily.XIAOMI, false));
        assertFalse("老系统不带",
                WidgetVendorSupport.usesWidgetCenterExtras(BELOW_FLOOR, WidgetVendorFamily.XIAOMI, true));
        assertFalse("非小米不带",
                WidgetVendorSupport.usesWidgetCenterExtras(AT_FLOOR, WidgetVendorFamily.OPPO, true));
    }

    @Test
    public void shortcutPermissionHintIsXiaomiOnlyAndModern() {
        assertTrue(WidgetVendorSupport.showsShortcutPermissionHint(AT_FLOOR, WidgetVendorFamily.XIAOMI));
        assertFalse(WidgetVendorSupport.showsShortcutPermissionHint(BELOW_FLOOR, WidgetVendorFamily.XIAOMI));
        assertFalse(WidgetVendorSupport.showsShortcutPermissionHint(AT_FLOOR, WidgetVendorFamily.OPPO));
        assertFalse(WidgetVendorSupport.showsShortcutPermissionHint(AT_FLOOR, WidgetVendorFamily.VIVO));
        assertFalse(WidgetVendorSupport.showsShortcutPermissionHint(AT_FLOOR, WidgetVendorFamily.HONOR));
    }

    @Test
    public void widgetGalleryButtonIsVivoOnlyAndModern() {
        assertTrue(WidgetVendorSupport.showsWidgetGalleryButton(AT_FLOOR, WidgetVendorFamily.VIVO));
        assertFalse(WidgetVendorSupport.showsWidgetGalleryButton(BELOW_FLOOR, WidgetVendorFamily.VIVO));
        assertFalse(WidgetVendorSupport.showsWidgetGalleryButton(AT_FLOOR, WidgetVendorFamily.XIAOMI));
        assertFalse(WidgetVendorSupport.showsWidgetGalleryButton(AT_FLOOR, WidgetVendorFamily.OPPO));
        assertFalse(WidgetVendorSupport.showsWidgetGalleryButton(AT_FLOOR, WidgetVendorFamily.HONOR));
    }

    /**
     * 荣耀的**全部**专属开关都是 false。
     *
     * <p>荣耀官方文档明确「遵循 Google 原生 widget 开发规范」，所以它身上只允许有文案差异。这条断言存在的
     * 意义是：以后谁想给荣耀顺手加个 extras 或提示，测试会立刻拦下来。
     */
    @Test
    public void honorHasNoVendorSpecificCapabilityAtAll() {
        for (int sdkInt : new int[]{AT_FLOOR, 35, 36}) {
            assertFalse(WidgetVendorSupport.usesWidgetCenterExtras(sdkInt, WidgetVendorFamily.HONOR, true));
            assertFalse(WidgetVendorSupport.showsShortcutPermissionHint(sdkInt, WidgetVendorFamily.HONOR));
            assertFalse(WidgetVendorSupport.showsWidgetGalleryButton(sdkInt, WidgetVendorFamily.HONOR));
        }
    }

    /** OPPO 在零审核口径下没有任何应用内加桌能力，所以它同样不许出现按钮或提示（只留文案）。 */
    @Test
    public void oppoGetsOnlyCopyNoButtons() {
        assertFalse(WidgetVendorSupport.usesWidgetCenterExtras(36, WidgetVendorFamily.OPPO, true));
        assertFalse(WidgetVendorSupport.showsShortcutPermissionHint(36, WidgetVendorFamily.OPPO));
        assertFalse(WidgetVendorSupport.showsWidgetGalleryButton(36, WidgetVendorFamily.OPPO));
    }
}
