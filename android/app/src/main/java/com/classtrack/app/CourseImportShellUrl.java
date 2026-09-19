package com.classtrack.app;

import java.net.URI;

/** 原生 shell 是静态资产服务的客户端路由 SPA，因此引导路径必须匹配应用的 index 路由。 */
public final class CourseImportShellUrl {
    public static final String SHELL_HOST = "appassets.androidplatform.net";
    public static final String SHELL_BOOT_PATH = "/";
    public static final String SHELL_QUERY = "native-shell=1";
    public static final String SHELL_URL = "https://" + SHELL_HOST + SHELL_BOOT_PATH + "?" + SHELL_QUERY;

    private CourseImportShellUrl() {}

    public static boolean isShellOriginUrl(String url) {
        try {
            URI uri = new URI(url);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && SHELL_HOST.equalsIgnoreCase(uri.getHost())
                    && uri.getRawUserInfo() == null
                    && uri.getPort() == -1;
        } catch (Exception ignored) {
            return false;
        }
    }

    public static boolean isShellUrl(String url) {
        try {
            URI uri = new URI(url);
            String path = uri.getPath();
            return isShellOriginUrl(url)
                    && (path == null || path.isEmpty() || SHELL_BOOT_PATH.equals(path))
                    && SHELL_QUERY.equals(uri.getQuery());
        } catch (Exception ignored) {
            return false;
        }
    }
}
