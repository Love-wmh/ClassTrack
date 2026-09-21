package com.classtrack.app;

import java.util.Locale;

/**
 * 「这台设备是哪个厂商的 ROM」的识别结果。
 *
 * <p><b>它只允许影响三件事</b>：手动引导文案（哪家的入口叫什么）、小米专属 extras 与权限提示是否启用、
 * vivo 是否出现「去组件库添加」按钮。<b>严禁</b>用它直接断言「支持 / 不支持 pin」——那是行为探测的结论
 * （见 {@link PinAttempt} 与 {@link WidgetPinObservation}）。理由有设备级证据：社区口径说 ColorOS「会弹
 * 确认框」，而本仓真机实测（PKR110 / ColorOS / Android 16）是「确认页起了却从不置前、且不发回调」；
 * 同一家不同 ROM 版本的行为都会漂移，所以厂商名只能用来选文案，不能用来下能力结论。
 *
 * <p><b>为什么识别规则要分「精确」与「包含」两档</b>：小米的旧品牌名就是两个字 `Mi`，只能用**精确匹配**
 * 才安全；而 `mi` 作为**子串**会误伤 `Micromax`、`Microsoft` 这类其它厂商（它们跑的是接近 AOSP 的桌面，
 * 被当成小米会给出完全错误的引导）。因此 `Mi` 走精确匹配，`Xiaomi` / `Redmi` / `POCO` 这些足够独特的
 * 品牌名才走包含匹配。
 *
 * <p>纯逻辑（只依赖传入的字符串），可被 JUnit 覆盖（见 {@code WidgetVendorFamilyTest}）。
 */
public enum WidgetVendorFamily {

    /** 小米 / 红米 / POCO（HyperOS、MIUI）。 */
    XIAOMI,

    /** OPPO / 一加 / realme（ColorOS）。 */
    OPPO,

    /** vivo / iQOO（OriginOS、Funtouch OS）。 */
    VIVO,

    /** 荣耀（MagicOS / MagicUI）。 */
    HONOR,

    /** 未识别、空串或 `null`。**华为现役机型也归这里**：能跑到本段代码的华为设备是鸿蒙 5.0 以下的
     * EMUI 老系统，按「不适配老系统」的口径走通用引导，是有意归类而不是遗漏。 */
    OTHER;

    /** 识别失败时的归属。 */
    public static final WidgetVendorFamily FALLBACK = OTHER;

    private static final String[] NO_TOKENS = new String[0];

    /**
     * 识别厂商族。
     *
     * @param manufacturer {@code Build.MANUFACTURER}；`null` 安全。
     * @param brand {@code Build.BRAND}；`null` 安全。
     * @return 命中的厂商族；两个入参都没命中时返回 {@link #FALLBACK}（不会抛异常）。
     */
    public static WidgetVendorFamily detect(String manufacturer, String brand) {
        String first = normalize(manufacturer);
        String second = normalize(brand);
        // 顺序即优先级：两个字段同时命中不同厂商时，按本枚举的声明顺序取第一个
        // （实测不会发生，但把规则写死比"看运气"好）。
        for (WidgetVendorFamily family : new WidgetVendorFamily[]{XIAOMI, OPPO, VIVO, HONOR}) {
            if (family.matches(first) || family.matches(second)) {
                return family;
            }
        }
        return FALLBACK;
    }

    /** @return 该族用于**精确**匹配的整串品牌名。 */
    String[] exactTokens() {
        return this == XIAOMI ? new String[]{"mi"} : NO_TOKENS;
    }

    /** @return 该族用于**包含**匹配的品牌名（都足够独特，不会出现在别家厂商名里）。 */
    String[] containsTokens() {
        switch (this) {
            case XIAOMI:
                return new String[]{"xiaomi", "redmi", "poco"};
            case OPPO:
                return new String[]{"oppo", "oneplus", "realme"};
            case VIVO:
                return new String[]{"vivo", "iqoo"};
            case HONOR:
                return new String[]{"honor", "hihonor"};
            default:
                return NO_TOKENS;
        }
    }

    /** 包级可见而不是 private：同包的 {@code WidgetVendorFamilyTest} 要能直接断言「兜底族不匹配任何输入」。 */
    boolean matches(String value) {
        if (value.isEmpty()) {
            return false;
        }
        for (String token : exactTokens()) {
            if (value.equals(token)) {
                return true;
            }
        }
        for (String token : containsTokens()) {
            if (value.contains(token)) {
                return true;
            }
        }
        return false;
    }

    /** 去空白 + {@link Locale#ROOT} 小写；`null` 变空串（于是永不匹配）。 */
    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * @return 传给 Web 的线名（小写）。Web 侧的 `WidgetVendorFamily` 联合类型必须与本枚举一一对应，
     *     这条一致性由 `widgetPinPresets.test.ts` 读本文件源码断言。
     */
    public String wireName() {
        switch (this) {
            case XIAOMI:
                return "xiaomi";
            case OPPO:
                return "oppo";
            case VIVO:
                return "vivo";
            case HONOR:
                return "honor";
            default:
                return "other";
        }
    }
}
