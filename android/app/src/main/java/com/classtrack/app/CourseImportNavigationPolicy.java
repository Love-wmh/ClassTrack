package com.classtrack.app;

import java.net.URI;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Keeps page navigation policy separate from the exact schedule-response capture policy. */
public final class CourseImportNavigationPolicy {
    private static final Set<String> ALLOWED_NAVIGATION_HOSTS;
    private static final Set<String> ALLOWED_NAVIGATION_PATH_PREFIXES;

    static {
        Set<String> hosts = new HashSet<>();
        // The authentication page observed for the configured adapter remains on this host.
        // Add future CAS hosts here explicitly after device verification; never use a wildcard.
        hosts.add(ScheduleResponseValidator.TARGET_HOST);
        ALLOWED_NAVIGATION_HOSTS = Collections.unmodifiableSet(hosts);

        Set<String> paths = new HashSet<>();
        // Main-frame navigation is limited to the JinZhi app and the observed same-host CAS.
        paths.add("/jwapp/sys/wdkb");
        paths.add("/authserver");
        ALLOWED_NAVIGATION_PATH_PREFIXES = Collections.unmodifiableSet(paths);
    }

    private CourseImportNavigationPolicy() {}

    public static Decision evaluateNavigation(String value) {
        if (value == null) return Decision.blocked("missing-url", null);

        URI uri;
        try {
            uri = new URI(value);
        } catch (Exception ignored) {
            return Decision.blocked("malformed-url", null);
        }

        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme)) {
            return Decision.blocked("scheme", safeUrl(uri));
        }
        if (uri.getRawUserInfo() != null) {
            return Decision.blocked("userinfo", safeUrl(uri));
        }
        if (uri.getHost() == null) {
            return Decision.blocked("host", safeUrl(uri));
        }
        if (uri.getPort() != -1 && uri.getPort() != 443) {
            return Decision.blocked("port", safeUrl(uri));
        }
        if (hasPathTraversal(uri)) {
            return Decision.blocked("path-traversal", safeUrl(uri));
        }

        String host = uri.getHost().toLowerCase(Locale.ROOT);
        if (!ALLOWED_NAVIGATION_HOSTS.contains(host)) {
            return Decision.blocked("host", safeUrl(uri));
        }
        if (!isAllowedNavigationPath(uri.getRawPath())) {
            return Decision.blocked("path", safeUrl(uri));
        }
        return Decision.allowed(safeUrl(uri));
    }

    public static boolean isAllowedNavigationUrl(String value) {
        return evaluateNavigation(value).isAllowed();
    }

    /** Compatibility name retained for the existing Activity Result boundary. */
    public static boolean isAllowedPageUrl(String value) {
        return isAllowedNavigationUrl(value);
    }

    public static String safeUrlForLog(String value) {
        if (value == null) return null;
        try {
            return safeUrl(new URI(value));
        } catch (Exception ignored) {
            return null;
        }
    }

    public static String safeUrlForResult(String value) {
        if (value == null) return null;
        try {
            URI uri = new URI(value);
            if (!isSafeHttpsUri(uri)) return null;
            return safeUrl(uri);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isSafeHttpsUri(URI uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
                && uri.getHost() != null
                && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private static boolean hasPathTraversal(URI uri) {
        String rawPath = uri.getRawPath();
        String decodedPath = uri.getPath();
        if (rawPath == null || decodedPath == null) return true;

        String rawLower = rawPath.toLowerCase(Locale.ROOT);
        if (rawLower.contains("%2e") || rawLower.contains("%2f") || rawLower.contains("%5c") || rawLower.contains("%25")) {
            return true;
        }

        for (String segment : decodedPath.replace('\\', '/').split("/", -1)) {
            if (".".equals(segment) || "..".equals(segment)) return true;
        }
        return false;
    }


    private static boolean isAllowedNavigationPath(String path) {
        if (path == null || path.isEmpty()) return false;
        for (String prefix : ALLOWED_NAVIGATION_PATH_PREFIXES) {
            if (path.equals(prefix) || path.startsWith(prefix + "/")) return true;
        }
        return false;
    }

    private static String safeUrl(URI uri) {
        if (uri == null || uri.getHost() == null) return null;
        StringBuilder value = new StringBuilder();
        if (uri.getScheme() != null) value.append(uri.getScheme().toLowerCase(Locale.ROOT)).append("://");
        value.append(uri.getHost().toLowerCase(Locale.ROOT));
        if (uri.getPort() == 443) value.append(":443");
        String path = uri.getRawPath();
        value.append(path == null || path.isEmpty() ? "/" : path);
        return value.toString();
    }

    public static final class Decision {
        private final boolean allowed;
        private final String reason;
        private final String safeUrl;

        private Decision(boolean allowed, String reason, String safeUrl) {
            this.allowed = allowed;
            this.reason = reason;
            this.safeUrl = safeUrl;
        }

        private static Decision allowed(String safeUrl) {
            return new Decision(true, null, safeUrl);
        }

        private static Decision blocked(String reason, String safeUrl) {
            return new Decision(false, reason, safeUrl);
        }

        public boolean isAllowed() {
            return allowed;
        }

        public String getReason() {
            return reason;
        }

        public String getSafeUrl() {
            return safeUrl;
        }
    }
}
