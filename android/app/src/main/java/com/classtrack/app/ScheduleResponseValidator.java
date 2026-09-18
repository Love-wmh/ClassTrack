package com.classtrack.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.nio.charset.StandardCharsets;

/** Validates the narrow response contract used by the Tianjin University of Technology adapter. */
public final class ScheduleResponseValidator {
    public static final String TARGET_HOST = "jwxt.tjut.edu.cn";
    public static final String TARGET_PATH = "/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do";
    public static final String ENTRY_URL = "https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do";
    public static final int MAX_PAYLOAD_BYTES = 512 * 1024;

    private ScheduleResponseValidator() {}

    public static boolean isAllowedPageUrl(String value) {
        if (value == null) return false;
        URI uri = parseUri(value);
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && TARGET_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    public static boolean isTargetUrl(String value, String currentPageUrl) {
        if (value == null || !isAllowedPageUrl(currentPageUrl)) return false;
        URI uri = parseUri(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && TARGET_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && TARGET_PATH.equals(uri.getPath());
    }

    private static URI parseUri(String value) {
        try {
            return new URI(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static boolean isValidTargetResponse(String url, String currentPageUrl, String body) {
        if (!isTargetUrl(url, currentPageUrl) || body == null) return false;
        if (body.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) return false;

        try {
            JSONObject payload = new JSONObject(body);
            JSONObject datas = payload.optJSONObject("datas");
            JSONObject schedule = datas == null ? null : datas.optJSONObject("cxxszhxqkb");
            JSONArray rows = schedule == null ? null : schedule.optJSONArray("rows");
            if (rows == null || rows.length() == 0) return false;
            JSONObject firstRow = rows.optJSONObject(0);
            return firstRow != null && firstRow.optString("KCM", "").trim().length() > 0;
        } catch (Exception ignored) {
            return false;
        }
    }
}
