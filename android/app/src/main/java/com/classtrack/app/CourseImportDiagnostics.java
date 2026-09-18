package com.classtrack.app;

import android.net.http.SslError;
import android.util.Log;

/** Emits only fixed diagnostic fields; URLs and page error text never pass through to logcat. */
public final class CourseImportDiagnostics {
    public static final String TAG = "ClassTrack.CourseImport";

    private CourseImportDiagnostics() {}

    public static void activityCreated(String sessionId) {
        Log.i(TAG, "phase=activity_created session=" + safeSession(sessionId) + " adapter=tianjin-university-of-technology");
    }

    public static void navigationStarted(String url, boolean mainFrame, boolean allowed) {
        Log.i(TAG, "phase=navigation_started mainFrame=" + mainFrame + " allowed=" + allowed + " url=" + safeUrl(url));
    }

    public static void navigationBlocked(String url, String reason) {
        Log.w(TAG, "phase=navigation_blocked url=" + safeUrl(url) + " reason=" + safeCategory(reason));
    }

    public static void pageStarted(String url, boolean mainFrame) {
        Log.i(TAG, "phase=page_started mainFrame=" + mainFrame + " url=" + safeUrl(url));
    }

    public static void pageFinished(String url, int progress) {
        Log.i(TAG, "phase=page_finished progress=" + clamp(progress, 0, 100) + " url=" + safeUrl(url));
    }

    public static void httpError(String url, boolean mainFrame, int statusCode) {
        Log.w(TAG, "phase=http_error mainFrame=" + mainFrame + " status=" + clamp(statusCode, 0, 999) + " url=" + safeUrl(url));
    }

    public static void sslError(String url, SslError error) {
        int primaryError = error == null ? -1 : error.getPrimaryError();
        Log.e(TAG, "phase=ssl_error error=" + primaryError + " url=" + safeUrl(url));
    }

    public static void networkError(String url, boolean mainFrame, int errorCode) {
        Log.e(TAG, "phase=network_error mainFrame=" + mainFrame + " code=" + errorCode + " url=" + safeUrl(url));
    }

    public static void consoleError(String level, String sourceUrl, int lineNumber, String message) {
        Log.w(TAG, "phase=console_error level=" + safeCategory(level) + " category=" + classifyConsoleMessage(message)
                + " line=" + Math.max(0, lineNumber) + " url=" + safeUrl(sourceUrl));
    }

    public static void captureHookInjected(String url) {
        Log.i(TAG, "phase=capture_hook_injected url=" + safeUrl(url));
    }

    public static void captureCandidate(String url, int byteLength, boolean accepted, String reason) {
        Log.i(TAG, "phase=capture_candidate accepted=" + accepted + " bytes=" + Math.max(0, byteLength)
                + " reason=" + safeCategory(reason) + " url=" + safeUrl(url));
    }

    public static void captureTimeout(String url) {
        Log.w(TAG, "phase=capture_timeout url=" + safeUrl(url));
    }

    public static void importRequested(String state) {
        Log.i(TAG, "phase=import_requested state=" + safeCategory(state));
    }

    public static void backPressed(boolean hadHistory, boolean waiting, boolean hasCapture) {
        Log.i(TAG, "phase=back_pressed history=" + hadHistory + " waiting=" + waiting + " capture=" + hasCapture);
    }

    public static void cancelled() {
        Log.i(TAG, "phase=cancelled");
    }

    public static void resultFile(String phase, int byteLength, boolean privateDirectory, boolean success) {
        Log.i(TAG, "phase=result_file_" + safeCategory(phase) + " bytes=" + Math.max(0, byteLength)
                + " private=" + privateDirectory + " success=" + success);
    }

    public static void activityDestroyed(boolean shellAttached, boolean academicAttached, boolean handedOff) {
        Log.i(TAG, "phase=activity_destroyed shellAttached=" + shellAttached + " academicAttached=" + academicAttached
                + " handedOff=" + handedOff);
    }

    public static String safeUrl(String value) {
        String safeUrl = CourseImportNavigationPolicy.safeUrlForLog(value);
        return safeUrl == null ? "[invalid]" : safeUrl;
    }

    public static String classifyConsoleMessage(String message) {
        if (message == null || message.isEmpty()) return "empty";
        String lower = message.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("network") || lower.contains("failed to fetch")) return "network";
        if (lower.contains("syntax")) return "syntax";
        if (lower.contains("security") || lower.contains("cors")) return "security";
        return "script";
    }

    private static String safeSession(String value) {
        if (value == null || value.isEmpty()) return "none";
        return value.replaceAll("[^a-zA-Z0-9_-]", "");
    }

    private static String safeCategory(String value) {
        if (value == null || value.isEmpty()) return "unknown";
        return value.replaceAll("[^A-Za-z0-9_-]", "_");
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
