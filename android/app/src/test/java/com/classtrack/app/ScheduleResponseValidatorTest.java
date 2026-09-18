package com.classtrack.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ScheduleResponseValidatorTest {
    private static final String ENDPOINT = "https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do";
    private static final String PAYLOAD = "{\"datas\":{\"cxxszhxqkb\":{\"rows\":[{\"KCM\":\"高等数学\"}]}}}";

    @Test
    public void acceptsOnlyTheConfiguredHttpsEndpoint() {
        assertTrue(ScheduleResponseValidator.isTargetUrl(ENDPOINT, ScheduleResponseValidator.ENTRY_URL));
        assertFalse(ScheduleResponseValidator.isTargetUrl("http://jwxt.tjut.edu.cn" + ScheduleResponseValidator.TARGET_PATH, ScheduleResponseValidator.ENTRY_URL));
        assertFalse(ScheduleResponseValidator.isTargetUrl("https://example.com" + ScheduleResponseValidator.TARGET_PATH, ScheduleResponseValidator.ENTRY_URL));
        assertFalse(ScheduleResponseValidator.isTargetUrl("https://jwxt.tjut.edu.cn:8443" + ScheduleResponseValidator.TARGET_PATH, ScheduleResponseValidator.ENTRY_URL));
        assertTrue(ScheduleResponseValidator.isTargetUrl(ENDPOINT + "?term=secret#fragment", ScheduleResponseValidator.ENTRY_URL));
        assertFalse(ScheduleResponseValidator.isTargetUrl("https://user:password@jwxt.tjut.edu.cn" + ScheduleResponseValidator.TARGET_PATH, ScheduleResponseValidator.ENTRY_URL));
        assertFalse(ScheduleResponseValidator.isTargetUrl("https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/modules/xskcb%2Fcxxszhxqkb.do", ScheduleResponseValidator.ENTRY_URL));
    }

    @Test
    public void acceptsScheduleRowsAndRejectsUnrelatedPayloads() {
        assertTrue(ScheduleResponseValidator.isValidTargetResponse(ENDPOINT, ScheduleResponseValidator.ENTRY_URL, PAYLOAD));
        assertFalse(ScheduleResponseValidator.isValidTargetResponse(ENDPOINT, ScheduleResponseValidator.ENTRY_URL, "<html>login</html>"));
        assertFalse(ScheduleResponseValidator.isValidTargetResponse(ENDPOINT, ScheduleResponseValidator.ENTRY_URL, "{\"datas\":{\"cxxszhxqkb\":{\"rows\":[]}}}"));
        assertFalse(ScheduleResponseValidator.isValidTargetResponse(ENDPOINT, ScheduleResponseValidator.ENTRY_URL, "{\"datas\":{\"cxxszhxqkb\":{\"rows\":[{\"KCM\":\" \"}]}}}"));
    }

    @Test
    public void rejectsOversizedResponse() {
        String oversized = "{\"datas\":{\"cxxszhxqkb\":{\"rows\":[{\"KCM\":\"" + "x".repeat(ScheduleResponseValidator.MAX_PAYLOAD_BYTES) + "\"}]}}}";
        assertFalse(ScheduleResponseValidator.isValidTargetResponse(ENDPOINT, ScheduleResponseValidator.ENTRY_URL, oversized));
    }
}
