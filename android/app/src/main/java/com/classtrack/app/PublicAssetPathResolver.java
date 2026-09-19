package com.classtrack.app;

/** Resolves shell URL suffixes to paths in the packaged public asset directory. */
public final class PublicAssetPathResolver {
    private PublicAssetPathResolver() {}

    public static String resolveSuffixPath(String suffixPath) {
        if (suffixPath == null || suffixPath.isEmpty() || "/".equals(suffixPath)) {
            return "index.html";
        }
        if (suffixPath.endsWith("/")) {
            return suffixPath + "index.html";
        }
        return suffixPath;
    }

    public static String toAssetPath(String suffixPath) {
        String normalized = suffixPath != null && suffixPath.startsWith("/")
                ? suffixPath.substring(1)
                : suffixPath;
        return "public/" + resolveSuffixPath(normalized);
    }
}
