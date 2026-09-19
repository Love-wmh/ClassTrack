package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.net.URI;

import org.junit.Test;

public class CourseImportShellUrlTest {
    @Test
    public void shellUrlUsesRootRouteAndExactQuery() throws Exception {
        URI uri = new URI(CourseImportShellUrl.SHELL_URL);

        assertEquals("https", uri.getScheme());
        assertEquals(CourseImportShellUrl.SHELL_HOST, uri.getHost());
        assertEquals(-1, uri.getPort());
        assertEquals("/", uri.getPath());
        assertEquals(CourseImportShellUrl.SHELL_QUERY, uri.getQuery());
        assertTrue(CourseImportShellUrl.isShellUrl(CourseImportShellUrl.SHELL_URL));
    }

    @Test
    public void shellUrlRejectsUnsafeOrNonBootVariants() {
        assertFalse(CourseImportShellUrl.isShellUrl("https://appassets.androidplatform.net/index.html?native-shell=1"));
        assertFalse(CourseImportShellUrl.isShellUrl("http://appassets.androidplatform.net/?native-shell=1"));
        assertFalse(CourseImportShellUrl.isShellUrl("https://evil.example.com/?native-shell=1"));
        assertFalse(CourseImportShellUrl.isShellUrl("https://appassets.androidplatform.net:8443/?native-shell=1"));
        assertFalse(CourseImportShellUrl.isShellUrl("https://user@appassets.androidplatform.net/?native-shell=1"));
        assertFalse(CourseImportShellUrl.isShellUrl("https://appassets.androidplatform.net/?native-shell=0"));
        assertFalse(CourseImportShellUrl.isShellUrl(""));
        assertFalse(CourseImportShellUrl.isShellUrl(null));
    }

    @Test
    public void shellUrlRequiresAnExplicitRootPath() {
        // A URL without an explicit path is not the loaded boot URL, so it must not gate shell readiness.
        assertFalse(CourseImportShellUrl.isShellUrl("https://appassets.androidplatform.net?native-shell=1"));
        assertFalse(CourseImportShellUrl.isShellUrl("https://appassets.androidplatform.net/#native-shell=1"));
    }

    @Test
    public void originPredicateStillAllowsSameOriginResources() {
        assertTrue(CourseImportShellUrl.isShellOriginUrl("https://appassets.androidplatform.net/assets/app.js"));
        assertTrue(CourseImportShellUrl.isShellOriginUrl("https://appassets.androidplatform.net/index.html"));
    }
}
