package com.classtrack.app;

/**
 * 「用户刚在应用内点了某个预设添加小工具」这个事实的一次性槽位。
 *
 * <p>为什么需要它：`requestPinAppWidget` 只能请求系统去放置，**无法把「用户选的是哪个预设」带进新实例的
 * 配置流程**（launcher 会用自己的 options bundle 绑定实例，自定义 extra 不保证送达）。因此把选中的预设先
 * 写在这里，等新实例的配置页打开时读走 —— 与 [WidgetPendingRoute] 是同一套范式，避免再造一种「待处理状态」。
 *
 * <p>三条硬约束：
 *
 * <ol>
 *   <li>**一次性**：读走即清，不能让一次选择影响之后新增的实例；</li>
 *   <li>**有超时**：用户点了添加却在系统弹窗上取消，槽位会一直留着；超过 {@link #TIMEOUT_MS} 视为失效；</li>
 *   <li>**可显式清除**：`onDeleted` 等清理路径要能主动丢弃它。</li>
 * </ol>
 *
 * <p>纯逻辑（只依赖调用方传入的时刻），可被 JUnit 直接覆盖（见 {@code WidgetPendingPresetTest}）。
 */
public final class WidgetPendingPreset {

    /** 槽位有效期：用户从点「添加到桌面」到系统弹窗确认，正常在几秒内，5 分钟足够宽松。 */
    public static final long TIMEOUT_MS = 5 * 60 * 1000L;

    private static volatile String pendingId;
    private static volatile long writtenAtMs;

    private WidgetPendingPreset() {
    }

    /**
     * 记录用户选中的预设。
     *
     * @param presetId 预设标识；不在白名单内时按「未选预设」处理（写入空值），避免脏值污染新实例。
     * @param nowEpochMs 写入时刻。
     */
    public static synchronized void set(String presetId, long nowEpochMs) {
        WidgetPreset preset = WidgetPreset.parse(presetId);
        pendingId = preset == null ? null : preset.getId();
        writtenAtMs = preset == null ? 0L : nowEpochMs;
    }

    /**
     * 读取并清空预设（一次性）。
     *
     * @param nowEpochMs 读取时刻，用于判定是否已超时。
     * @return 仍然有效的预设；没有、已消费或已超时都返回 `null`。
     */
    public static synchronized WidgetPreset consume(long nowEpochMs) {
        String id = pendingId;
        long written = writtenAtMs;
        pendingId = null;
        writtenAtMs = 0L;
        if (id == null || nowEpochMs - written > TIMEOUT_MS) {
            return null;
        }
        return WidgetPreset.parse(id);
    }

    /**
     * 读取但**不消费**槽位（渲染侧兜底用）。
     *
     * <p>渲染发生在每个实例上，如果在这里消费，第一个渲染的**老**实例会把槽位吃掉、新实例反而拿不到。
     * 因此分成 peek + 消费两步：只有真的写进了一个「从未配置过」的实例之后才 {@link #consume()}。
     *
     * @return 仍然有效的预设；没有或已超时返回 `null`。
     */
    public static WidgetPreset peek() {
        return peek(System.currentTimeMillis());
    }

    /**
     * 读取但不消费（可注入时刻，便于单测）。
     *
     * @param nowEpochMs 读取时刻。
     * @return 仍然有效的预设；没有或已超时返回 `null`。
     */
    public static WidgetPreset peek(long nowEpochMs) {
        String id = pendingId;
        long written = writtenAtMs;
        if (id == null || nowEpochMs - written > TIMEOUT_MS) {
            return null;
        }
        return WidgetPreset.parse(id);
    }

    /** 消费槽位（调用方确认成功写入之后调用）。 */
    public static synchronized void consume() {
        pendingId = null;
        writtenAtMs = 0L;
    }

    /** 丢弃槽位（实例被删除、pin 失败等清理路径调用）。 */
    public static synchronized void clear() {
        pendingId = null;
        writtenAtMs = 0L;
    }
}
