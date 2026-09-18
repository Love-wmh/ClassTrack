package com.classtrack.app;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ScheduleCaptureScriptTest {
    @Test
    public void installsAnIdempotentXhrAndFetchHookForTheConfiguredBridge() {
        String script = ScheduleCaptureScript.create();

        assertTrue(script.contains("__classTrackScheduleHookInstalled"));
        assertTrue(script.contains("XMLHttpRequest.prototype"));
        assertTrue(script.contains("window.fetch"));
        assertTrue(script.contains(ScheduleResponseValidator.TARGET_PATH));
        assertTrue(script.contains("u.username===''&&u.password===''"));
        assertTrue(script.contains("window.CourseImportBridge.onScheduleResponse"));
        assertTrue(script.contains("onScheduleResponseTooLarge"));
        assertTrue(script.contains("hookNonce"));
        assertTrue(script.contains("requestNonce"));
        assertTrue(script.contains("response.clone().text()"));
        assertTrue(script.contains("u.origin+u.pathname"));
        assertTrue(script.contains("new Blob([body]).size"));
        assertTrue(!script.contains("onScheduleResponse(u.href"));
        assertTrue(!script.contains("onScheduleResponseTooLarge(u.href"));
        assertTrue(script.contains(String.valueOf(ScheduleResponseValidator.MAX_PAYLOAD_BYTES)));
        assertTrue(!script.contains("console.log"));
        assertTrue(!script.contains("responseText,body"));
    }
}
