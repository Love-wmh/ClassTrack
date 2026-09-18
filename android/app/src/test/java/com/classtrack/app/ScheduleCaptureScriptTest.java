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
        assertTrue(script.contains("window.CourseImportBridge.onScheduleResponse"));
    }
}
