package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CourseImportNavigationPolicyTest {
    @Test
    public void acceptsOnlyExplicitHttpsHostsPortsAndPaths() {
        assertTrue(CourseImportNavigationPolicy.isAllowedNavigationUrl(ScheduleResponseValidator.ENTRY_URL));
        assertTrue(CourseImportNavigationPolicy.isAllowedNavigationUrl(
                "https://jwxt.tjut.edu.cn/authserver/login?service=secret"));
        assertTrue(CourseImportNavigationPolicy.isAllowedNavigationUrl(
                "https://authserver.tjut.edu.cn/authserver/login"));
        assertTrue(CourseImportNavigationPolicy.isAllowedNavigationUrl(
                "https://authserver.tjut.edu.cn/authserver/login/deeper"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("http://jwxt.tjut.edu.cn/authserver"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://example.com/authserver"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://authserver.tjut.edu.cn/jwapp/sys/wdkb"));
        assertEquals("path", CourseImportNavigationPolicy.evaluateNavigation(
                "https://authserver.tjut.edu.cn/jwapp/sys/wdkb").getReason());
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://authserver.tjut.edu.cn/other"));
        assertEquals("path", CourseImportNavigationPolicy.evaluateNavigation(
                "https://authserver.tjut.edu.cn/other").getReason());
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://jwxt.tjut.edu.cn:8443/authserver"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl(
                "https://user:password@jwxt.tjut.edu.cn/authserver"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("intent://jwxt.tjut.edu.cn/authserver"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://jwxt.tjut.edu.cn/other"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://jwxt.tjut.edu.cn/jwapp/sys/wdkb%2Fother"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://jwxt.tjut.edu.cn/authserver-other"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl("https://jwxt.tjut.edu.cn/authserver%2F..%2Fother"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl(
                "https://jwxt.tjut.edu.cn/authserver/%2e%2e/jwapp/sys/wdkb"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl(
                "https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/../authserver"));
        assertFalse(CourseImportNavigationPolicy.isAllowedNavigationUrl(
                "https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/%252e%252e/authserver"));
    }

    @Test
    public void safeUrlDropsCredentialsQueriesAndFragments() {
        String unsafe = "https://user:password@jwxt.tjut.edu.cn/authserver/login?ticket=secret#fragment";
        assertEquals("https://jwxt.tjut.edu.cn/authserver/login", CourseImportNavigationPolicy.safeUrlForLog(unsafe));
        assertNull(CourseImportNavigationPolicy.safeUrlForResult(unsafe));
        assertEquals("https://jwxt.tjut.edu.cn/authserver/login", CourseImportNavigationPolicy.safeUrlForResult(
                "https://jwxt.tjut.edu.cn/authserver/login?ticket=secret#fragment"));
        assertNull(CourseImportNavigationPolicy.safeUrlForResult("http://jwxt.tjut.edu.cn/authserver"));
    }

    @Test
    public void navigationAllowlistDoesNotExpandCaptureAllowlist() {
        String authPage = "https://jwxt.tjut.edu.cn/authserver/login";
        String endpoint = "https://jwxt.tjut.edu.cn" + ScheduleResponseValidator.TARGET_PATH;
        assertTrue(CourseImportNavigationPolicy.isAllowedNavigationUrl(authPage));
        assertFalse(ScheduleResponseValidator.isTargetUrl(authPage, ScheduleResponseValidator.ENTRY_URL));
        assertTrue(ScheduleResponseValidator.isTargetUrl(endpoint, authPage));
        assertFalse(ScheduleResponseValidator.isTargetUrl("https://jwxt.tjut.edu.cn/other", authPage));
    }
}
