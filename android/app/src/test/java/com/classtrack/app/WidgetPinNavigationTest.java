package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 导航判决与 vivo 跳转 URI 的语义。
 *
 * <p>这里**逐字钉住 URI 形态**，并把「官方文档自相矛盾」这件事固化成一条断言：参数名取官方**示例代码**
 * 的 `comType`（正文写的是 `cmpType`）。这样做的好处是：真机确认（开放项 V5）如果发现该用另一个名字，
 * 改动只会发生在 `VIVO_GALLERY_COMP_TYPE_KEY` 这一个常量上，而这条断言会立刻提示「行为变了」。
 */
public class WidgetPinNavigationTest {

    private static final String PKG = "com.classtrack.app";
    private static final String CLS = "com.classtrack.app.widget.Cell4x3WidgetReceiver";

    @Test
    public void galleryUriMatchesTheOfficialShape() {
        assertEquals(
                "vivo://com.bbk.launcher2/origin?pkg=com.classtrack.app"
                        + "&classname=com.classtrack.app.widget.Cell4x3WidgetReceiver"
                        + "&comType=0&locType=1",
                WidgetPinNavigation.widgetGalleryUri(PKG, CLS));
    }

    /** 参数名依官方**示例代码**，不是正文里的 `cmpType`。 */
    @Test
    public void compTypeComesFromTheOfficialCodeSample() {
        assertEquals("comType", WidgetPinNavigation.VIVO_GALLERY_COMP_TYPE_KEY);

        String uri = WidgetPinNavigation.widgetGalleryUri(PKG, CLS);
        assertTrue(uri.contains("comType=0"));
        assertFalse("正文写的 cmpType 不是本实现的取值", uri.contains("cmpType"));
    }

    /** 有意不做 URL 编码：包名与类名都是 `[A-Za-z0-9._]`，编码反而可能让厂商侧解析失败。 */
    @Test
    public void uriLeavesDotsAndPackageSeparatorsIntact() {
        String uri = WidgetPinNavigation.widgetGalleryUri(PKG, CLS);

        assertTrue("点号必须原样保留", uri.contains("pkg=com.classtrack.app"));
        assertFalse("不能出现 %2E 之类的转义", uri.contains("%2E"));
        assertFalse("每个参数之间只用一个 & 分隔", uri.contains("&&"));
    }

    /** 单测钉住「用单个 `&`」这个选择：官方示例写作 `&&`，那是笔误。 */
    @Test
    public void uriUsesSingleAmpersandsEvenThoughTheSampleWroteTwo() {
        String uri = WidgetPinNavigation.widgetGalleryUri(PKG, CLS);

        assertEquals(3, uri.split("&", -1).length - 1);
        assertEquals(1, uri.split("\\?", -1).length - 1);
    }

    @Test
    public void uriIsWellFormedWithMissingInputs() {
        assertEquals("vivo://com.bbk.launcher2/origin?pkg=&classname=&comType=0&locType=1",
                WidgetPinNavigation.widgetGalleryUri(null, null));
        assertEquals("vivo://com.bbk.launcher2/origin?pkg=a&classname=&comType=0&locType=1",
                WidgetPinNavigation.widgetGalleryUri("a", null));
    }

    @Test
    public void galleryPackageAndPermissionAreTheDocumentedOnes() {
        assertEquals("com.bbk.launcher2", WidgetPinNavigation.VIVO_LAUNCHER_PACKAGE);
        assertEquals("com.bbk.launcher2.permission.JUMP_ORIGIN", WidgetPinNavigation.VIVO_GALLERY_PERMISSION);
    }

    /** 小米权限引导：能跳 MIUI 页就跳它，否则退应用详情页，都不行什么都不做。四个组合全测（穷尽）。 */
    @Test
    public void shortcutPermissionStepIsExhaustive() {
        assertEquals(WidgetPinNavigation.Step.MIUI_PERMISSION,
                WidgetPinNavigation.shortcutPermissionStep(true, true));
        assertEquals("MIUI 页可跳时不必退到应用详情页",
                WidgetPinNavigation.Step.MIUI_PERMISSION, WidgetPinNavigation.shortcutPermissionStep(true, false));
        assertEquals(WidgetPinNavigation.Step.APP_DETAILS,
                WidgetPinNavigation.shortcutPermissionStep(false, true));
        assertEquals("都不行就什么都不做，且不抛异常",
                WidgetPinNavigation.Step.NONE, WidgetPinNavigation.shortcutPermissionStep(false, false));
    }

    @Test
    public void galleryStepIsBinary() {
        assertEquals(WidgetPinNavigation.Step.WIDGET_GALLERY, WidgetPinNavigation.galleryStep(true));
        assertEquals(WidgetPinNavigation.Step.NONE, WidgetPinNavigation.galleryStep(false));
    }

    /** `NONE` 是「什么都没发生」，调用方据此不弹错、不影响任何功能路径。 */
    @Test
    public void noneIsDistinctFromEveryRealStep() {
        WidgetPinNavigation.Step none = WidgetPinNavigation.Step.NONE;

        assertFalse(none == WidgetPinNavigation.Step.MIUI_PERMISSION);
        assertFalse(none == WidgetPinNavigation.Step.APP_DETAILS);
        assertFalse(none == WidgetPinNavigation.Step.WIDGET_GALLERY);
    }
}
