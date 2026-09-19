package com.classtrack.app;

/**
 * 点击小工具时携带的待跳转路由。
 *
 * 这个值会从 `Intent` extra 流到 Web 层并用于单页导航，因此**必须白名单化**：
 * 只接受编译期常量 [ROUTE_SCHEDULE]，其它任何字符串都丢弃。这样即使有外部应用构造
 * 同名 extra 也无法把任意路径注入客户端路由。
 */
public final class WidgetPendingRoute {
    public static final String EXTRA_ROUTE = "classtrack_widget_route";

    public static final String ROUTE_SCHEDULE = "/schedule";

    private static volatile String pendingRoute;

    private WidgetPendingRoute() {}

    /**
     * 记录一次待消费的路由。
     *
     * @param route 候选路由；不在白名单内时清空，避免旧的待跳转残留。
     */
    public static void setPendingRoute(String route) {
        pendingRoute = ROUTE_SCHEDULE.equals(route) ? ROUTE_SCHEDULE : null;
    }

    /**
     * 读取并清空待跳转路由。
     *
     * @return 白名单内的路由；没有待跳转时返回 `null`。
     */
    public static String consumePendingRoute() {
        String route = pendingRoute;
        pendingRoute = null;
        return route;
    }
}
