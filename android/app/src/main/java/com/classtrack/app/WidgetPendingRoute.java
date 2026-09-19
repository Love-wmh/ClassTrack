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

    /**
     * 课表页在客户端的路由。
     *
     * 课表是 `app/routes.ts` 里的 **index 路由**，因此这里必须是 `/`，写成 `/schedule` 会让
     * 客户端路由匹配失败并渲染 404 —— 而 ErrorBoundary 会替换整棵树，连带把小工具同步组件
     * 一起卸载掉。这条契约由 `app/lib/native-widget-route.test.ts` 用真实路由表守住。
     */
    public static final String ROUTE_SCHEDULE = "/";

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
