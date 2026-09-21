package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import org.junit.Test;

/**
 * 厂商族识别的语义。
 *
 * <p>两类断言都很关键：**该认出来的要认出来**（不然小米/vivo 的专属路径永远不会启用），**不该认出来的
 * 绝不能认**（把 Micromax 当成小米会给出完全错误的引导，比不识别更糟）。
 */
public class WidgetVendorFamilyTest {

    @Test
    public void detectsTheFourVendorFamilies() {
        assertEquals(WidgetVendorFamily.XIAOMI, WidgetVendorFamily.detect("Xiaomi", "Xiaomi"));
        assertEquals(WidgetVendorFamily.OPPO, WidgetVendorFamily.detect("OPPO", "OPPO"));
        assertEquals(WidgetVendorFamily.VIVO, WidgetVendorFamily.detect("vivo", "vivo"));
        assertEquals(WidgetVendorFamily.HONOR, WidgetVendorFamily.detect("HONOR", "HONOR"));
    }

    @Test
    public void detectsSubBrands() {
        assertEquals(WidgetVendorFamily.XIAOMI, WidgetVendorFamily.detect("Xiaomi", "Redmi"));
        assertEquals(WidgetVendorFamily.XIAOMI, WidgetVendorFamily.detect("Xiaomi", "POCO"));
        assertEquals(WidgetVendorFamily.OPPO, WidgetVendorFamily.detect("OnePlus", "OnePlus"));
        assertEquals(WidgetVendorFamily.OPPO, WidgetVendorFamily.detect("realme", "realme"));
        assertEquals(WidgetVendorFamily.VIVO, WidgetVendorFamily.detect("vivo", "iQOO"));
    }

    @Test
    public void isCaseAndWhitespaceInsensitive() {
        assertEquals(WidgetVendorFamily.XIAOMI, WidgetVendorFamily.detect("  xIaOmI  ", "REDMI"));
        assertEquals(WidgetVendorFamily.VIVO, WidgetVendorFamily.detect("ViVo", null));
    }

    /** 两个字段分别命中同一家时，结论不变（不同 ROM 把信息放在不同字段里）。 */
    @Test
    public void eitherFieldIsEnough() {
        assertEquals(WidgetVendorFamily.HONOR, WidgetVendorFamily.detect("HONOR", "unknown"));
        assertEquals(WidgetVendorFamily.HONOR, WidgetVendorFamily.detect("unknown", "HONOR"));
    }

    /**
     * 旧品牌名 `Mi` 必须**精确匹配**才算小米。
     *
     * <p>反例是重点：`Micromax` / `Microsoft` 都会命中 `mi` 这个**子串**，但它们跑的是接近 AOSP 的桌面，
     * 被当成小米就会给出「去小部件中心搜安卓小部件」这种错误引导。
     */
    @Test
    public void bareMiIsExactMatchOnly() {
        assertEquals(WidgetVendorFamily.XIAOMI, WidgetVendorFamily.detect("Mi", "Mi"));
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("Micromax", "Micromax"));
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("Microsoft", "Microsoft"));
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("HMD Global", "Nokia"));
    }

    /**
     * 华为归 {@code OTHER} 是**有意**的：能跑到本段代码的华为设备是鸿蒙 5.0 以下的 EMUI 老系统，
     * 按「不适配老系统」的口径走通用引导。
     */
    @Test
    public void huaweiFallsBackOnPurpose() {
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("HUAWEI", "HUAWEI"));
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("Huawei", "HUAWEI"));
    }

    @Test
    public void unknownAndMissingInputsFallBackWithoutThrowing() {
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect(null, null));
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("", "   "));
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("Samsung", "Samsung"));
        assertEquals(WidgetVendorFamily.OTHER, WidgetVendorFamily.detect("Google", "google"));
    }

    /** 无 token 的族（{@code OTHER}）对任何输入都不匹配——它是兜底，不是模式。 */
    @Test
    public void otherMatchesNothing() {
        assertFalse(WidgetVendorFamily.OTHER.matches("Xiaomi"));
        assertFalse(WidgetVendorFamily.OTHER.matches(""));
    }
}
