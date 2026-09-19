package com.classtrack.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class PublicAssetPathResolverTest {
    @Test
    public void mapsRootSuffixesToIndex() {
        assertEquals("public/index.html", PublicAssetPathResolver.toAssetPath(null));
        assertEquals("public/index.html", PublicAssetPathResolver.toAssetPath(""));
        assertEquals("public/index.html", PublicAssetPathResolver.toAssetPath("/"));
        assertEquals("public/nested/index.html", PublicAssetPathResolver.toAssetPath("nested/"));
    }

    @Test
    public void preservesFileSuffixes() {
        assertEquals("public/index.html", PublicAssetPathResolver.toAssetPath("index.html"));
        assertEquals("public/assets/app.js", PublicAssetPathResolver.toAssetPath("assets/app.js"));
    }
}
