package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.appwidget.AppWidgetManager;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.Test;

/**
 * 「这次 pin 该带哪些 extras」的语义。
 *
 * <p>用假 {@link WidgetPinExtras.Sink}（一个 `LinkedHashMap`）覆盖全部组合，因此不需要 Android 运行时。
 * 重点两条：**尺寸键在任何情况下都在**（它是尽力而为的提示，不是厂商能力）、**小米那组键只在探测说
 * 「支持详情页」时才出现**（探测为假就老实退回标准 pin）。
 */
public class WidgetPinExtrasTest {

    private static final String PKG = "com.classtrack.app";
    private static final String CLS = "com.classtrack.app.widget.Cell4x3WidgetReceiver";

    /** 记录所有写入的假 sink。 */
    private static final class FakeSink implements WidgetPinExtras.Sink {
        final Map<String, Object> entries = new LinkedHashMap<>();

        @Override
        public void putString(String key, String value) {
            entries.put(key, value);
        }

        @Override
        public void putInt(String key, int value) {
            entries.put(key, value);
        }
    }

    private static FakeSink applyPlan(WidgetVendorFamily family, boolean modern, boolean detailPageSupported) {
        WidgetPinExtras.Plan plan = WidgetPinExtras.plan(family, modern, detailPageSupported, PKG, CLS, 4 * 70, 3 * 80);
        FakeSink sink = new FakeSink();
        WidgetPinExtras.apply(plan, sink);
        return sink;
    }

    @Test
    public void xiaomiModernWithDetailPageCarriesTheVendorKeys() {
        FakeSink sink = applyPlan(WidgetVendorFamily.XIAOMI, true, true);

        assertEquals(WidgetPinExtras.ADD_TYPE_WIDGET_CENTER_DETAIL, sink.entries.get(WidgetPinExtras.KEY_ADD_TYPE));
        assertEquals(PKG + "/" + CLS, sink.entries.get(WidgetPinExtras.KEY_WIDGET_NAME));
        assertTrue(sink.entries.containsKey(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH));
        assertTrue(sink.entries.containsKey(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT));
    }

    /** 探测说「这台机器不支持详情页」→ 不带那组 extras，退回标准 pin。 */
    @Test
    public void xiaomiModernWithoutDetailPageFallsBackToStandardPin() {
        FakeSink sink = applyPlan(WidgetVendorFamily.XIAOMI, true, false);

        assertFalse(sink.entries.containsKey(WidgetPinExtras.KEY_ADD_TYPE));
        assertFalse(sink.entries.containsKey(WidgetPinExtras.KEY_WIDGET_NAME));
        assertTrue("尺寸提示与厂商能力无关，仍要在", sink.entries.containsKey(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH));
    }

    /** 老系统（MIUI 14 一类）不走厂商专属路径。 */
    @Test
    public void xiaomiOnLegacySystemDoesNotCarryVendorKeys() {
        FakeSink sink = applyPlan(WidgetVendorFamily.XIAOMI, false, true);

        assertFalse(sink.entries.containsKey(WidgetPinExtras.KEY_ADD_TYPE));
        assertTrue(sink.entries.containsKey(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT));
    }

    @Test
    public void otherVendorsNeverCarryTheXiaomiKeys() {
        for (WidgetVendorFamily family : new WidgetVendorFamily[]{
                WidgetVendorFamily.OPPO, WidgetVendorFamily.VIVO, WidgetVendorFamily.HONOR, WidgetVendorFamily.OTHER}) {
            FakeSink sink = applyPlan(family, true, true);
            assertFalse(family + " 不该带小米那组 extras", sink.entries.containsKey(WidgetPinExtras.KEY_ADD_TYPE));
            assertFalse(family + " 不该带 widgetName", sink.entries.containsKey(WidgetPinExtras.KEY_WIDGET_NAME));
            assertTrue(family + " 仍要带尺寸提示", sink.entries.containsKey(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH));
        }
    }

    /** 未识别厂商即使探测为真也不带（探测本身只在小米机型上调用，这里是防御性断言）。 */
    @Test
    public void unknownVendorWithUnknownFamilyStaysStandard() {
        FakeSink sink = applyPlan(WidgetVendorFamily.OTHER, false, false);

        assertEquals(2, sink.entries.size());
        assertTrue(sink.entries.containsKey(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH));
        assertTrue(sink.entries.containsKey(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT));
    }

    @Test
    public void widgetNameFollowsTheOfficialShape() {
        assertEquals("com.classtrack.app/com.classtrack.app.widget.Cell4x3WidgetReceiver",
                WidgetPinExtras.widgetName(PKG, CLS));
    }

    @Test
    public void widgetNameIsSafeWithMissingInputs() {
        assertEquals("/", WidgetPinExtras.widgetName(null, null));
        assertEquals("pkg/", WidgetPinExtras.widgetName("pkg", null));
        assertEquals("/cls", WidgetPinExtras.widgetName(null, "cls"));
    }

    /** 尺寸不允许为负（`appwidget-provider` 的格子数不可能为负，传负数说明上游算错了）。 */
    @Test
    public void negativeSizesAreClampedToZero() {
        WidgetPinExtras.Plan plan = WidgetPinExtras.plan(WidgetVendorFamily.OTHER, false, false, PKG, CLS, -5, -9);

        assertEquals(0, plan.getMinWidthDp());
        assertEquals(0, plan.getMinHeightDp());
    }

    /** 计划的取值与 apply 的落地必须一一对应（防止以后改了一半）。 */
    @Test
    public void planFieldsMatchWhatApplyWrites() {
        WidgetPinExtras.Plan plan = WidgetPinExtras.plan(WidgetVendorFamily.XIAOMI, true, true, PKG, CLS, 210, 160);
        FakeSink sink = new FakeSink();
        WidgetPinExtras.apply(plan, sink);

        assertTrue(plan.isWidgetCenterDetail());
        assertEquals(plan.getWidgetName(), sink.entries.get(WidgetPinExtras.KEY_WIDGET_NAME));
        assertEquals(plan.getMinWidthDp(), sink.entries.get(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH));
        assertEquals(plan.getMinHeightDp(), sink.entries.get(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT));
    }

    /** 空入参不得抛异常：pin 这条链路上不允许因为拼装 extras 崩掉。 */
    @Test
    public void applyToleratesNulls() {
        WidgetPinExtras.apply(null, new FakeSink());
        WidgetPinExtras.apply(WidgetPinExtras.plan(WidgetVendorFamily.XIAOMI, true, true, PKG, CLS, 1, 1), null);
    }
}
