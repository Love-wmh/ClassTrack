package com.classtrack.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import android.net.http.SslError;

public class CourseImportActivity extends AppCompatActivity {
    private static final String ADAPTER_ID = "tianjin-university-of-technology";
    private static final String EXTRA_ADAPTER_ID = "adapterId";
    private static final String EXTRA_TERM = "term";
    private static final String EXTRA_FIRST_WEEK_START_DATE = "firstWeekStartDate";
    private static final String EXTRA_RESULT_FILE = "resultFile";
    private static final String EXTRA_SOURCE_URL = "sourceUrl";
    private static final String SHELL_URL = "https://appassets.androidplatform.net/index.html?native-shell=1";
    private static final String SHELL_HOST = "appassets.androidplatform.net";
    private static final long CAPTURE_TIMEOUT_MS = 8_000L;
    private static final float MIN_SHELL_HEIGHT_DP = 112f;
    private static final float MAX_SHELL_HEIGHT_DP = 480f;

    private enum SessionState {
        IDLE,
        ACADEMIC_LOADING,
        ACADEMIC_READY,
        CAPTURE_WAITING,
        CAPTURED,
        HANDING_OFF,
        ERROR,
        CANCELLED
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final String sessionId = UUID.randomUUID().toString().substring(0, 8);
    private FrameLayout rootView;
    private WebView shellWebView;
    private WebView academicWebView;
    private WebViewAssetLoader assetLoader;
    private String term;
    private String firstWeekStartDate;
    private String capturedBody;
    private String capturedUrl;
    private File handedOffFile;
    private String resultErrorCode;
    private String resultErrorMessage;
    private SessionState state = SessionState.IDLE;
    private int shellHeightPx;
    private long captureGeneration;
    private String captureHookNonce;
    private boolean shellReady;
    private boolean academicPageFailed;
    private boolean finishingImport;
    private boolean destroyed;
    private boolean sessionActive = true;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String adapterId = getIntent().getStringExtra(EXTRA_ADAPTER_ID);
        term = getIntent().getStringExtra(EXTRA_TERM);
        if (!ADAPTER_ID.equals(adapterId)) {
            finishWithError("INVALID_ADAPTER", "课程导入适配器无效");
            return;
        }
        firstWeekStartDate = getIntent().getStringExtra(EXTRA_FIRST_WEEK_START_DATE);
        if (term == null || !term.matches("\\d{4}-\\d{4}-[12]")) {
            finishWithError("INVALID_ADAPTER", "学年学期代码无效");
            return;
        }
        if (firstWeekStartDate == null || !firstWeekStartDate.matches("\\d{4}-\\d{2}-\\d{2}")) {
            finishWithError("INVALID_ADAPTER", "第一周日期无效");
            return;
        }

        cleanupStaleResultFiles();
        CourseImportDiagnostics.activityCreated(sessionId);
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new PublicAssetsPathHandler(this))
                .build();
        rootView = new FrameLayout(this);
        shellWebView = createWebView(true);
        academicWebView = createWebView(false);
        FrameLayout.LayoutParams academicParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        academicParams.topMargin = 0;
        rootView.addView(academicWebView, academicParams);
        rootView.addView(shellWebView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        academicWebView.setVisibility(View.GONE);
        setContentView(rootView);
        configureShellWebView();
        configureAcademicWebView();
        CourseImportDiagnostics.navigationStarted(SHELL_URL, true, true);
        shellWebView.loadUrl(SHELL_URL);
        updateShellState();
    }

    private static final class PublicAssetsPathHandler implements WebViewAssetLoader.PathHandler {
        private final WebViewAssetLoader.AssetsPathHandler delegate;

        private PublicAssetsPathHandler(android.content.Context context) {
            delegate = new WebViewAssetLoader.AssetsPathHandler(context);
        }

        @Override
        public WebResourceResponse handle(String path) {
            String assetPath = path == null ? "" : path;
            if (assetPath.startsWith("/")) assetPath = assetPath.substring(1);
            return delegate.handle("public/" + assetPath);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createWebView(boolean shell) {
        WebView view = new WebView(this);
        view.setBackgroundColor(0x00000000);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(!shell);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setAllowFileAccessFromFileURLs(false);
        view.getSettings().setAllowUniversalAccessFromFileURLs(false);
        view.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (!shell) {
            android.webkit.CookieManager.getInstance().setAcceptCookie(true);
            view.addJavascriptInterface(new CourseImportBridge(), "CourseImportBridge");
        } else {
            view.addJavascriptInterface(new CourseImportShellBridge(), "CourseImportShell");
        }
        return view;
    }

    private void configureShellWebView() {
        shellWebView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!isShellOriginUrl(url)) return blockedShellResource();
                WebResourceResponse response = assetLoader.shouldInterceptRequest(request.getUrl());
                return response == null ? blockedShellResource() : response;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (isShellUrl(url)) return false;
                CourseImportDiagnostics.navigationBlocked(url, "shell-origin");
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                CourseImportDiagnostics.pageStarted(url, true);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!isShellUrl(url) || destroyed) return;
                shellReady = true;
                CourseImportDiagnostics.pageFinished(url, view.getProgress());
                updateShellState();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    CourseImportDiagnostics.networkError(request.getUrl().toString(), true, error == null ? -1 : error.getErrorCode());
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                CourseImportDiagnostics.httpError(
                        request.getUrl().toString(),
                        request.isForMainFrame(),
                        errorResponse == null ? -1 : errorResponse.getStatusCode());
            }
        });
        shellWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                if (message != null) {
                    CourseImportDiagnostics.consoleError(
                            message.messageLevel() == null ? "unknown" : message.messageLevel().name(),
                            message.sourceId(),
                            message.lineNumber(),
                            message.message());
                }
                return true;
            }
        });
    }

    private void configureAcademicWebView() {
        academicWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                CourseImportNavigationPolicy.Decision decision = CourseImportNavigationPolicy.evaluateNavigation(url);
                CourseImportDiagnostics.navigationStarted(url, true, decision.isAllowed());
                if (!decision.isAllowed()) {
                    CourseImportDiagnostics.navigationBlocked(url, decision.getReason());
                    setRecoverableError("INVALID_URL", "此登录跳转不在允许范围内，请返回后重试。");
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                CourseImportNavigationPolicy.Decision decision = CourseImportNavigationPolicy.evaluateNavigation(url);
                CourseImportDiagnostics.pageStarted(url, true);
                if (!decision.isAllowed()) {
                    CourseImportDiagnostics.navigationBlocked(url, decision.getReason());
                    view.stopLoading();
                    setRecoverableError("INVALID_URL", "此教务页面不在允许范围内，请返回后重试。");
                    return;
                }
                if (!destroyed) {
                    academicPageFailed = false;
                    clearCapture();
                    state = SessionState.ACADEMIC_LOADING;
                    updateShellState();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (destroyed) return;
                CourseImportDiagnostics.pageFinished(url, view.getProgress());
                if (!CourseImportNavigationPolicy.isAllowedNavigationUrl(url)) {
                    view.stopLoading();
                    setRecoverableError("INVALID_URL", "此教务页面不在允许范围内，请返回后重试。");
                    return;
                }
                if (academicPageFailed) return;
                state = SessionState.ACADEMIC_READY;
                resultErrorCode = null;
                resultErrorMessage = null;
                updateShellState();
                injectCaptureHook();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                boolean mainFrame = request.isForMainFrame();
                int statusCode = errorResponse == null ? -1 : errorResponse.getStatusCode();
                CourseImportDiagnostics.httpError(request.getUrl().toString(), mainFrame, statusCode);
                if (!mainFrame) return;
                academicPageFailed = true;
                setRecoverableError("NETWORK_ERROR", "教务页面返回异常，请检查网络后刷新重试。");
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                boolean mainFrame = request.isForMainFrame();
                CourseImportDiagnostics.networkError(request.getUrl().toString(), mainFrame, error == null ? -1 : error.getErrorCode());
                if (mainFrame) {
                    academicPageFailed = true;
                    setRecoverableError("NETWORK_ERROR", "教务页面加载失败，请检查网络后刷新重试。");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                CourseImportDiagnostics.sslError(error == null ? view.getUrl() : error.getUrl(), error);
                handler.cancel();
                String pageUrl = CourseImportNavigationPolicy.safeUrlForLog(view.getUrl());
                String errorUrl = CourseImportNavigationPolicy.safeUrlForLog(error == null ? null : error.getUrl());
                if (error == null || (pageUrl != null && pageUrl.equals(errorUrl))) {
                    academicPageFailed = true;
                    setRecoverableError("NETWORK_ERROR", "教务页面安全连接失败，请检查网络后重试。");
                }
            }
        });
        academicWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                if (message != null) {
                    CourseImportDiagnostics.consoleError(
                            message.messageLevel() == null ? "unknown" : message.messageLevel().name(),
                            message.sourceId(),
                            message.lineNumber(),
                            message.message());
                }
                return true;
            }
        });
    }

    private boolean isShellOriginUrl(String url) {
        try {
            java.net.URI uri = new java.net.URI(url);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && SHELL_HOST.equalsIgnoreCase(uri.getHost())
                    && uri.getRawUserInfo() == null
                    && uri.getPort() == -1;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isShellUrl(String url) {
        try {
            java.net.URI uri = new java.net.URI(url);
            return isShellOriginUrl(url)
                    && "/index.html".equals(uri.getPath())
                    && "native-shell=1".equals(uri.getQuery());
        } catch (Exception ignored) {
            return false;
        }
    }

    private WebResourceResponse blockedShellResource() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
    }

    private void startAcademic(String requestedTerm, String requestedDate) {
        if (destroyed || !sessionActive || state != SessionState.IDLE && state != SessionState.ERROR) return;
        if (requestedTerm == null || requestedDate == null
                || !requestedTerm.matches("\\d{4}-\\d{4}-[12]")
                || !requestedDate.matches("\\d{4}-\\d{2}-\\d{2}")) {
            setRecoverableError("INVALID_ADAPTER", "学年学期或第一周日期无效。");
            return;
        }
        term = requestedTerm;
        firstWeekStartDate = requestedDate;
        resultErrorCode = null;
        resultErrorMessage = null;
        clearCapture();
        state = SessionState.ACADEMIC_LOADING;
        academicWebView.setVisibility(View.VISIBLE);
        updateShellState();
        CourseImportDiagnostics.navigationStarted(ScheduleResponseValidator.ENTRY_URL, true, true);
        academicWebView.loadUrl(ScheduleResponseValidator.ENTRY_URL);
    }

    private void retryAcademic() {
        if (destroyed || finishingImport
                || (state != SessionState.ERROR && state != SessionState.ACADEMIC_LOADING && state != SessionState.CAPTURE_WAITING)) return;
        resultErrorCode = null;
        resultErrorMessage = null;
        clearCapture();
        String currentUrl = academicWebView.getUrl();
        state = SessionState.ACADEMIC_LOADING;
        academicWebView.setVisibility(View.VISIBLE);
        updateShellState();
        if (CourseImportNavigationPolicy.isAllowedNavigationUrl(currentUrl)) {
            academicWebView.reload();
        } else {
            CourseImportDiagnostics.navigationStarted(ScheduleResponseValidator.ENTRY_URL, true, true);
            academicWebView.loadUrl(ScheduleResponseValidator.ENTRY_URL);
        }
    }

    private void refreshAcademic() {
        if (destroyed || finishingImport || academicWebView.getVisibility() != View.VISIBLE
                || (state != SessionState.ACADEMIC_READY && state != SessionState.CAPTURED && state != SessionState.CAPTURE_WAITING)) return;
        resultErrorCode = null;
        resultErrorMessage = null;
        clearCapture();
        state = SessionState.ACADEMIC_LOADING;
        updateShellState();
        academicWebView.reload();
    }

    private void injectCaptureHook() {
        if (academicWebView == null || destroyed || !sessionActive) return;
        captureHookNonce = sessionId + "-" + captureGeneration;
        academicWebView.evaluateJavascript(ScheduleCaptureScript.create(captureHookNonce), null);
        CourseImportDiagnostics.captureHookInjected(academicWebView.getUrl());
    }

    private void requestCurrentSchedule() {
        if (destroyed || finishingImport) return;
        CourseImportDiagnostics.importRequested(state.name());
        if (state == SessionState.CAPTURED && capturedBody != null && capturedUrl != null) {
            persistAndFinish();
            return;
        }
        if (state != SessionState.ACADEMIC_READY && state != SessionState.CAPTURE_WAITING) return;
        if (!CourseImportNavigationPolicy.isAllowedNavigationUrl(academicWebView.getUrl())) {
            setRecoverableError("INVALID_URL", "请先进入允许的天津理工大学教务页面后重试。");
            return;
        }

        clearCaptureTimeout();
        waitingForCapture = true;
        state = SessionState.CAPTURE_WAITING;
        updateShellState();
        injectCaptureHook();
        String termJson = JSONObject.quote(term);
        String requestScript = "(async()=>{try{const r=await fetch(" + JSONObject.quote(ScheduleResponseValidator.TARGET_PATH)
                + ",{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({XNXQDM:"
                + termJson + "}).toString()});return r.ok?'ok':'http-'+r.status}catch(e){return 'network-error'}})()";
        final long generation = captureGeneration;
        academicWebView.evaluateJavascript(requestScript, value -> {
            if (!destroyed && waitingForCapture && generation == captureGeneration && value != null
                    && (value.contains("network-error") || value.contains("http-"))) {
                waitingForCapture = false;
                clearCaptureTimeout();
                setRecoverableError("NETWORK_ERROR", "课表请求失败，请确认已登录并检查网络后重试。");
            }
        });
        handler.postDelayed(() -> {
            if (!destroyed && waitingForCapture && generation == captureGeneration) {
                waitingForCapture = false;
                CourseImportDiagnostics.captureTimeout(academicWebView.getUrl());
                setRecoverableError("NOT_LOGGED_IN_OR_NO_SCHEDULE", "未捕获到课表响应，请进入或刷新课表详情页后重试。");
            }
        }, CAPTURE_TIMEOUT_MS);
    }

    private boolean waitingForCapture;

    private void persistAndFinish() {
        if (finishingImport || destroyed) return;
        if (state != SessionState.CAPTURED || capturedBody == null || capturedUrl == null
                || !ScheduleResponseValidator.isValidTargetResponse(capturedUrl, academicWebView.getUrl(), capturedBody)) {
            setRecoverableError("NOT_LOGGED_IN_OR_NO_SCHEDULE", "当前没有有效课表，请进入或刷新课表详情页后重试。");
            return;
        }
        String safeSourceUrl = CourseImportNavigationPolicy.safeUrlForResult(capturedUrl);
        if (safeSourceUrl == null) {
            setRecoverableError("PAYLOAD_READ_FAILED", "课表响应来源无效，请刷新课表页面后重试。");
            return;
        }
        finishingImport = true;
        state = SessionState.HANDING_OFF;
        updateShellState();
        File resultFile = null;
        try {
            resultFile = File.createTempFile("classtrack-course-import-", ".json", getCacheDir());
            try (FileOutputStream output = new FileOutputStream(resultFile)) {
                output.write(capturedBody.getBytes(StandardCharsets.UTF_8));
            }
            Intent result = new Intent();
            result.putExtra(EXTRA_RESULT_FILE, resultFile.getAbsolutePath());
            result.putExtra(EXTRA_SOURCE_URL, safeSourceUrl);
            result.putExtra(EXTRA_TERM, term);
            result.putExtra(EXTRA_FIRST_WEEK_START_DATE, firstWeekStartDate);
            handedOffFile = resultFile;
            CourseImportDiagnostics.resultFile("created", capturedBody.getBytes(StandardCharsets.UTF_8).length, true, true);
            setResult(Activity.RESULT_OK, result);
            finish();
        } catch (Exception ignored) {
            if (resultFile != null) {
                //noinspection ResultOfMethodCallIgnored
                resultFile.delete();
            }
            CourseImportDiagnostics.resultFile("created", 0, true, false);
            finishingImport = false;
            setRecoverableError("PAYLOAD_READ_FAILED", "课表响应保存失败，请重试。");
        }
    }

    private void finishWithError(String code, String message) {
        Intent result = new Intent();
        result.putExtra("errorCode", code);
        result.putExtra("errorMessage", message);
        setResult(Activity.RESULT_CANCELED, result);
        finish();
    }

    private void setRecoverableError(String code, String message) {
        if (destroyed) return;
        clearCapture();
        resultErrorCode = code;
        resultErrorMessage = message;
        state = SessionState.ERROR;
        clearCaptureTimeout();
        updateShellState();
    }

    private void clearCapture() {
        capturedBody = null;
        capturedUrl = null;
        waitingForCapture = false;
        captureGeneration++;
        captureHookNonce = null;
        clearCaptureTimeout();
    }

    private void clearCaptureTimeout() {
        handler.removeCallbacksAndMessages(null);
    }

    private void updateShellState() {
        updateAcademicLayout();
        if (!shellReady || shellWebView == null || destroyed) return;
        try {
            JSONObject safeState = new JSONObject();
            safeState.put("state", state.name());
            safeState.put("messageKey", messageKey());
            safeState.put("errorCode", resultErrorCode == null ? JSONObject.NULL : resultErrorCode);
            safeState.put("term", term);
            safeState.put("firstWeekStartDate", firstWeekStartDate);
            safeState.put("canRetry", state == SessionState.ERROR || state == SessionState.ACADEMIC_LOADING || state == SessionState.CAPTURE_WAITING);
            safeState.put("canRefresh", state == SessionState.ACADEMIC_READY || state == SessionState.CAPTURED || state == SessionState.CAPTURE_WAITING);
            safeState.put("canImport", state == SessionState.ACADEMIC_READY || state == SessionState.CAPTURED);
            safeState.put("contentSlotActive", academicWebView.getVisibility() == View.VISIBLE);
            shellWebView.evaluateJavascript("window.__classTrackNativeState(" + safeState + ");", null);
        } catch (Exception ignored) {
            CourseImportDiagnostics.consoleError("state", SHELL_URL, 0, "state-update-failed");
        }
    }

    private String messageKey() {
        switch (state) {
            case ACADEMIC_LOADING:
                return "academicLoading";
            case ACADEMIC_READY:
                return "academicReady";
            case CAPTURE_WAITING:
                return "captureWaiting";
            case CAPTURED:
                return "captured";
            case HANDING_OFF:
                return "handingOff";
            case ERROR:
                return "error";
            case CANCELLED:
                return "cancelled";
            case IDLE:
            default:
                return "idle";
        }
    }

    private void updateAcademicLayout() {
        if (shellWebView == null || academicWebView == null) return;
        boolean active = state == SessionState.ACADEMIC_LOADING || state == SessionState.ACADEMIC_READY
                || state == SessionState.CAPTURE_WAITING || state == SessionState.CAPTURED || state == SessionState.HANDING_OFF;
        FrameLayout.LayoutParams shellParams = (FrameLayout.LayoutParams) shellWebView.getLayoutParams();
        FrameLayout.LayoutParams academicParams = (FrameLayout.LayoutParams) academicWebView.getLayoutParams();
        if (active) {
            int fallbackHeight = (int) (MIN_SHELL_HEIGHT_DP * getResources().getDisplayMetrics().density);
            shellParams.height = shellHeightPx > 0 ? shellHeightPx : fallbackHeight;
            shellParams.gravity = android.view.Gravity.TOP;
            academicParams.topMargin = shellParams.height;
            academicParams.height = ViewGroup.LayoutParams.MATCH_PARENT;
            academicWebView.setVisibility(View.VISIBLE);
        } else {
            shellParams.height = ViewGroup.LayoutParams.MATCH_PARENT;
            shellParams.gravity = android.view.Gravity.TOP;
            academicParams.topMargin = 0;
            academicParams.height = ViewGroup.LayoutParams.MATCH_PARENT;
            academicWebView.setVisibility(View.GONE);
        }
        shellWebView.setLayoutParams(shellParams);
        academicWebView.setLayoutParams(academicParams);
    }

    private void cancelActivity() {
        if (destroyed || finishingImport) return;
        CourseImportDiagnostics.cancelled();
        state = SessionState.CANCELLED;
        resultErrorCode = null;
        resultErrorMessage = null;
        clearCapture();
        setResult(Activity.RESULT_CANCELED, new Intent());
        finish();
    }

    @Override
    public void onBackPressed() {
        if (destroyed || finishingImport) return;
        boolean hadHistory = academicWebView != null && academicWebView.canGoBack();
        CourseImportDiagnostics.backPressed(hadHistory, waitingForCapture, capturedBody != null);
        if (waitingForCapture) {
            clearCapture();
            state = SessionState.ACADEMIC_READY;
            updateShellState();
            return;
        }
        if (academicWebView != null && academicWebView.getVisibility() == View.VISIBLE && academicWebView.canGoBack()) {
            academicWebView.goBack();
            return;
        }
        cancelActivity();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        sessionActive = false;
        clearCaptureTimeout();
        clearCapture();
        boolean shellAttached = shellWebView != null && shellWebView.getParent() != null;
        boolean academicAttached = academicWebView != null && academicWebView.getParent() != null;
        destroyWebView(shellWebView, "CourseImportShell");
        destroyWebView(academicWebView, "CourseImportBridge");
        CourseImportDiagnostics.activityDestroyed(shellAttached, academicAttached, handedOffFile != null);
        super.onDestroy();
    }

    private void destroyWebView(@Nullable WebView view, String bridgeName) {
        if (view == null) return;
        view.stopLoading();
        view.removeJavascriptInterface(bridgeName);
        view.setWebChromeClient(null);
        view.setWebViewClient(null);
        ViewGroup parent = (ViewGroup) view.getParent();
        if (parent != null) parent.removeView(view);
        view.destroy();
    }

    private void cleanupStaleResultFiles() {
        File[] files = getCacheDir().listFiles((directory, name) -> name.startsWith("classtrack-course-import-") && name.endsWith(".json"));
        if (files == null) return;
        for (File file : files) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    private final class CourseImportShellBridge {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                if (destroyed || !isShellUrl(shellWebView.getUrl())) return;
                shellReady = true;
                updateShellState();
            });
        }

        @JavascriptInterface
        public void resize(float heightCssPx) {
            runOnUiThread(() -> {
                if (destroyed || !shellReady || !isShellUrl(shellWebView.getUrl()) || !Float.isFinite(heightCssPx)) return;
                float density = getResources().getDisplayMetrics().density;
                int heightPx = (int) (heightCssPx * density);
                int min = (int) (MIN_SHELL_HEIGHT_DP * density);
                int max = (int) (MAX_SHELL_HEIGHT_DP * density);
                shellHeightPx = Math.max(min, Math.min(max, heightPx));
                updateAcademicLayout();
            });
        }

        @JavascriptInterface
        public void startAcademic(String requestedTerm, String requestedDate) {
            runOnUiThread(() -> {
                if (!isShellBridgeActive()) return;
                CourseImportActivity.this.startAcademic(requestedTerm, requestedDate);
            });
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> {
                if (!isShellBridgeActive()) return;
                retryAcademic();
            });
        }

        @JavascriptInterface
        public void refreshAcademic() {
            runOnUiThread(() -> {
                if (!isShellBridgeActive()) return;
                refreshAcademic();
            });
        }

        @JavascriptInterface
        public void back() {
            runOnUiThread(() -> {
                if (!isShellBridgeActive()) return;
                onBackPressed();
            });
        }

        @JavascriptInterface
        public void requestImport() {
            runOnUiThread(() -> {
                if (!isShellBridgeActive()) return;
                requestCurrentSchedule();
            });
        }

        @JavascriptInterface
        public void cancel() {
            runOnUiThread(() -> {
                if (!isShellBridgeActive()) return;
                cancelActivity();
            });
        }
    }

    private boolean isShellBridgeActive() {
        return !destroyed && shellReady && shellWebView != null && isShellUrl(shellWebView.getUrl());
    }

    private final class CourseImportBridge {
        @JavascriptInterface
        public void onScheduleResponse(String url, String body, String callbackNonce) {
            if (destroyed || !sessionActive || !sessionId.equals(callbackNonce == null ? "" : callbackNonce.split("-", 2)[0])) return;
            runOnUiThread(() -> {
                if (destroyed || academicWebView == null || !callbackNonce.equals(captureHookNonce)) return;
                boolean accepted = ScheduleResponseValidator.isValidTargetResponse(url, academicWebView.getUrl(), body);
                CourseImportDiagnostics.captureCandidate(url, body == null ? 0 : body.getBytes(StandardCharsets.UTF_8).length, accepted,
                        accepted ? "accepted" : "validator-rejected");
                if (!accepted) return;
                capturedUrl = url;
                capturedBody = body;
                resultErrorCode = null;
                resultErrorMessage = null;
                waitingForCapture = false;
                clearCaptureTimeout();
                state = SessionState.CAPTURED;
                updateShellState();
            });
        }

        @JavascriptInterface
        public void onScheduleResponseTooLarge(String url, int byteLength, String callbackNonce) {
            if (destroyed || !sessionActive || !sessionId.equals(callbackNonce == null ? "" : callbackNonce.split("-", 2)[0])) return;
            runOnUiThread(() -> {
                if (destroyed || academicWebView == null || !callbackNonce.equals(captureHookNonce)
                        || byteLength <= ScheduleResponseValidator.MAX_PAYLOAD_BYTES
                        || !ScheduleResponseValidator.isTargetUrl(url, academicWebView.getUrl())) return;
                CourseImportDiagnostics.captureCandidate(url, byteLength, false, "payload-too-large");
                setRecoverableError("PAYLOAD_TOO_LARGE", "课表响应超过大小限制，请刷新课表页面后重试。");
            });
        }
    }
}
