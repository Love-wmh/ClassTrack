package com.classtrack.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class CourseImportDiagnosticsTest {
    @Test
    public void consoleMessagesBecomeFixedCategories() {
        assertEquals("network", CourseImportDiagnostics.classifyConsoleMessage("Failed to fetch https://example.test?token=secret"));
        assertEquals("security", CourseImportDiagnostics.classifyConsoleMessage("SecurityError: blocked by CORS"));
        assertEquals("syntax", CourseImportDiagnostics.classifyConsoleMessage("SyntaxError: unexpected token"));
        assertEquals("script", CourseImportDiagnostics.classifyConsoleMessage("account=secret password=secret"));
        assertEquals("empty", CourseImportDiagnostics.classifyConsoleMessage(null));
    }

    @Test
    public void safeUrlProjectionNeverKeepsQueryOrFragmentOrDecodedControlCharacters() {
        String safe = CourseImportDiagnostics.safeUrl("https://jwxt.tjut.edu.cn/path%0Aaccount=secret?password=secret#fragment");
        assertEquals("https://jwxt.tjut.edu.cn/path%0Aaccount=secret", safe);
    }
}
