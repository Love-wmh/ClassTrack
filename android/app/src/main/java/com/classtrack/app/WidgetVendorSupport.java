package com.classtrack.app;

/**
 * 「这台机器算不算最新系统，以及它能不能用某家专属的那点能力」——**全部厂商相关判断的唯一出处**。
 *
 * <p><b>为什么必须集中在一个类里</b>：这些开关散落到插件、Web 文案、UI 里之后，「荣耀必须一条专属能力都
 * 不触发」这类不变量就没人能验证了。集中之后它变成可断言的事实（见 {@code WidgetVendorSupportTest}）。
 *
 * <p><b>三个开关的含义</b>（都与 prd 的 R6/R7/R9 一一对应）：
 *
 * <ul>
 *   <li>{@link #usesWidgetCenterExtras} —— 小米「打开小部件中心详情页」的 extras；
 *   <li>{@link #showsShortcutPermissionHint} —— 小米「创建桌面快捷方式」权限提示；
 *   <li>{@link #showsWidgetGalleryButton} —— vivo「去组件库添加」按钮。
 * </ul>
 *
 * <p><b>{@code HONOR} 三个开关全是 {@code false}</b>：荣耀官方文档明确「遵循 Google 原生 widget 开发
 * 规范」，没有可加的厂商能力，所以荣耀身上只允许有**文案**差异。这条由 JUnit 钉住，免得日后被顺手加上。
 *
 * <p>纯逻辑（只依赖传入的数值与枚举），可被 JUnit 覆盖（见 {@code WidgetVendorSupportTest}）。
 */
public final class WidgetVendorSupport {

    /**
     * 算作「最新系统」的 SDK 下限：Android 14（API 34）。
     *
     * <p>定这个数的依据是各家的产品线对应关系：HyperOS 1 / ColorOS 14 / OriginOS 4 / MagicOS 8 起才是
     * Android 14+；而 MIUI 13–14（A12/A13）、realme UI 3–4、Funtouch OS 13 这些**老系统**按产品口径
     * 不做专属适配——它们会落在通用引导上。门槛写成常量是为了将来上调时只改一处。
     */
    public static final int MODERN_SDK_FLOOR = 34;

    private WidgetVendorSupport() {
    }

    /**
     * 是否属于「最新系统 + 已识别厂商」。
     *
     * @param sdkInt {@code Build.VERSION.SDK_INT}。
     * @param family 厂商族。
     * @return true 表示允许使用厂商专属能力/文案；未识别厂商（{@link WidgetVendorFamily#OTHER}）恒为 false。
     */
    public static boolean isModern(int sdkInt, WidgetVendorFamily family) {
        return sdkInt >= MODERN_SDK_FLOOR && family != null && family != WidgetVendorFamily.OTHER;
    }

    /**
     * 小米：是否带上「打开小部件中心详情页」的那组 extras。
     *
     * <p><b>为什么要传 {@code detailPageSupported}</b>：小米自己提供了探测接口
     * （`content://com.miui.personalassistant.widget.external` 的 `isMiuiWidgetDetailPageSupported`），
     * 官方原话是「部分机型支持小米Widget…但**不支持调起小米Widget 详情页**。这部分机型添加小部件的方式与
     * 旧版系统一致」。既然系统愿意回答，就不要拍脑袋——探测为假时不带这组 extras，老老实实退回标准 pin。
     *
     * @param sdkInt {@code Build.VERSION.SDK_INT}。
     * @param family 厂商族。
     * @param detailPageSupported 小米探测接口的结论；探测失败/非小米机型传 false。
     */
    public static boolean usesWidgetCenterExtras(int sdkInt, WidgetVendorFamily family,
            boolean detailPageSupported) {
        return usesWidgetCenterExtrasFor(family, isModern(sdkInt, family), detailPageSupported);
    }

    /**
     * 与 {@link #usesWidgetCenterExtras(int, WidgetVendorFamily, boolean)} 同一条判断，只是收 {@code modern}
     * 布尔而不是 {@code sdkInt}。
     *
     * <p>存在的原因只有一个：{@link WidgetPinExtras} 是纯逻辑、拿不到 {@code Build.VERSION}，但**不能**自己
     * 再写一遍 {@code family == XIAOMI && modern && detailPageSupported}——那会变成第二份决策，迟早与这里漂移。
     * 两边共用这一个实现。
     */
    public static boolean usesWidgetCenterExtrasFor(WidgetVendorFamily family, boolean modern,
            boolean detailPageSupported) {
        return family == WidgetVendorFamily.XIAOMI && modern && detailPageSupported;
    }

    /**
     * 小米：是否在面板上提示「创建桌面快捷方式」权限。
     *
     * <p>这条的依据是**社区实测口径**（非厂商官方文档）：该权限关闭时 pin 会静默失败。因此它只做
     * **提示与导航**，绝不做事先判定——公开 SDK 里连 `AppOpsManager.OP_REQUEST_PIN_SHORTCUT` 都不存在，
     * 想判定只能靠反射 + 硬编码操作码，那是私有 API 直连。
     */
    public static boolean showsShortcutPermissionHint(int sdkInt, WidgetVendorFamily family) {
        return family == WidgetVendorFamily.XIAOMI && isModern(sdkInt, family);
    }

    /**
     * vivo：是否出现「去组件库添加」按钮。
     *
     * <p>依据是 vivo 官方适配指南第 7 节：跳转组件库需要「（1）申请权限 （2）使用显式 intent」，而这里的
     * 「申请权限」= 在清单里声明 `com.bbk.launcher2.permission.JUMP_ORIGIN`，**不是平台审批**。
     */
    public static boolean showsWidgetGalleryButton(int sdkInt, WidgetVendorFamily family) {
        return family == WidgetVendorFamily.VIVO && isModern(sdkInt, family);
    }
}
