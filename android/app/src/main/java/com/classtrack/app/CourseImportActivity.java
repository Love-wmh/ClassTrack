package com.classtrack.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.http.SslError;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class CourseImportActivity extends AppCompatActivity {
    private static final String EXTRA_TERM = "term";
    private static final String EXTRA_RESULT_FILE = "resultFile";
    private static final String EXTRA_SOURCE_URL = "sourceUrl";
    private static final long CAPTURE_TIMEOUT_MS = 8_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private TextView statusView;
    private ProgressBar progressBar;
    private Button importButton;
    private String term;
    private String capturedBody;
    private String capturedUrl;
    private File handedOffFile;
    private boolean waitingForCapture;
    private String resultErrorCode;
    private String resultErrorMessage;
    private boolean finishingImport;
    private boolean destroyed;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        term = getIntent().getStringExtra(EXTRA_TERM);
        if (term == null) {
            finishWithError("INVALID_ADAPTER", "学年学期代码无效");
            return;
        }

        cleanupStaleResultFiles();
        setTitle("应用内导入课程表");
        setContentView(createContentView());
        configureWebView();
        webView.loadUrl(ScheduleResponseValidator.ENTRY_URL);
    }

    private void cleanupStaleResultFiles() {
        File[] files = getCacheDir().listFiles((directory, name) -> name.startsWith("classtrack-course-import-") && name.endsWith(".json"));
        if (files == null) return;
        for (File file : files) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(16, 12, 16, 12);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        Button backButton = new Button(this);
        backButton.setText("返回");
        backButton.setOnClickListener(view -> onBackPressed());
        Button refreshButton = new Button(this);
        refreshButton.setText("刷新");
        refreshButton.setOnClickListener(view -> {
            capturedBody = null;
            capturedUrl = null;
            resultErrorCode = null;
            resultErrorMessage = null;
            setStatus("正在刷新教务页面…");
            webView.reload();
        });
        toolbar.addView(backButton, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        toolbar.addView(refreshButton, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(toolbar);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        root.addView(progressBar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 4));

        statusView = new TextView(this);
        statusView.setTextSize(14);
        statusView.setTextColor(Color.DKGRAY);
        statusView.setPadding(0, 8, 0, 8);
        statusView.setText("正在打开天津理工大学教务系统…");
        root.addView(statusView);

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        importButton = new Button(this);
        importButton.setText("导入当前课表");
        importButton.setOnClickListener(view -> requestCurrentSchedule());
        root.addView(importButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return root;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        android.webkit.CookieManager.getInstance().setAcceptCookie(true);
        webView.addJavascriptInterface(new CourseImportBridge(), "CourseImportBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !ScheduleResponseValidator.isAllowedPageUrl(request.getUrl().toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!ScheduleResponseValidator.isAllowedPageUrl(url)) return;
                resultErrorCode = null;
                resultErrorMessage = null;
                setStatus("教务页面已打开，请登录并进入课表详情页。");
                injectCaptureHook();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    setRecoverableError("NETWORK_ERROR", "教务页面加载失败，请检查网络后刷新重试。");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                setRecoverableError("NETWORK_ERROR", "教务页面安全连接失败，请检查网络后重试。");
            }
        });
    }

    private void injectCaptureHook() {
        if (webView == null || destroyed) return;
        webView.evaluateJavascript(ScheduleCaptureScript.create(), null);
    }

    private void requestCurrentSchedule() {
        if (waitingForCapture || finishingImport || destroyed) return;
        if (capturedBody != null && capturedUrl != null) {
            persistAndFinish();
            return;
        }
        if (!ScheduleResponseValidator.isAllowedPageUrl(webView.getUrl())) {
            setStatus("请先进入天津理工大学教务页面后重试。");
            return;
        }

        waitingForCapture = true;
        importButton.setEnabled(false);
        setStatus("正在读取当前课表响应…");
        injectCaptureHook();
        String termJson = JSONObject.quote(term);
        String requestScript = "(async()=>{try{const r=await fetch(" + JSONObject.quote(ScheduleResponseValidator.TARGET_PATH)
                + ",{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({XNXQDM:"
                + termJson + "}).toString()});return r.ok?'ok':'http-'+r.status}catch(e){return 'network-error'}})()";
        webView.evaluateJavascript(requestScript, value -> {
            if (value != null && waitingForCapture && (value.contains("network-error") || value.contains("http-"))) {
                waitingForCapture = false;
                importButton.setEnabled(true);
                setRecoverableError("NETWORK_ERROR", "课表请求失败，请确认已登录并检查网络后重试。");
            }
        });
        handler.postDelayed(() -> {
            if (!waitingForCapture) return;
            waitingForCapture = false;
            importButton.setEnabled(true);
            setRecoverableError("NOT_LOGGED_IN_OR_NO_SCHEDULE", "未捕获到课表响应，请进入或刷新课表详情页后重试。");
        }, CAPTURE_TIMEOUT_MS);
    }

    private void persistAndFinish() {
        if (finishingImport) return;
        if (capturedBody == null || capturedUrl == null || !ScheduleResponseValidator.isValidTargetResponse(capturedUrl, webView.getUrl(), capturedBody)) {
            setStatus("当前没有有效课表，请进入或刷新课表详情页后重试。");
            return;
        }
        finishingImport = true;
        importButton.setEnabled(false);
        File resultFile = null;
        try {
            resultFile = File.createTempFile("classtrack-course-import-", ".json", getCacheDir());
            try (FileOutputStream output = new FileOutputStream(resultFile)) {
                output.write(capturedBody.getBytes(StandardCharsets.UTF_8));
            }
            Intent result = new Intent();
            result.putExtra(EXTRA_RESULT_FILE, resultFile.getAbsolutePath());
            result.putExtra(EXTRA_SOURCE_URL, capturedUrl);
            handedOffFile = resultFile;
            setResult(Activity.RESULT_OK, result);
            finish();
        } catch (Exception exception) {
            if (resultFile != null) {
                //noinspection ResultOfMethodCallIgnored
                resultFile.delete();
            }
            finishingImport = false;
            importButton.setEnabled(true);
            setStatus("课表响应保存失败，请重试。");
        }
    }

    private void finishWithError(String code, String message) {
        Intent result = new Intent();
        result.putExtra("errorCode", code);
        result.putExtra("errorMessage", message);
        setResult(Activity.RESULT_CANCELED, result);
        finish();
    }

    private void setStatus(String message) {
        if (statusView != null) statusView.setText(message);
    }

    private void setRecoverableError(String code, String message) {
        resultErrorCode = code;
        resultErrorMessage = message;
        setStatus(message);
    }

    @Override
    public void onBackPressed() {
        if (waitingForCapture) {
            waitingForCapture = false;
            importButton.setEnabled(true);
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            Intent result = new Intent();
            if (resultErrorCode != null) {
                result.putExtra("errorCode", resultErrorCode);
                result.putExtra("errorMessage", resultErrorMessage);
            }
            setResult(Activity.RESULT_CANCELED, result);
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        waitingForCapture = false;
        handler.removeCallbacksAndMessages(null);
        if (handedOffFile == null && capturedBody != null) {
            // Nothing is persisted until the user explicitly requests an import.
            capturedBody = null;
            capturedUrl = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("CourseImportBridge");
            webView.destroy();
        }
        super.onDestroy();
    }

    private final class CourseImportBridge {
        @JavascriptInterface
        public void onScheduleResponse(String url, String body) {
            if (destroyed || webView == null) return;
            runOnUiThread(() -> {
                if (destroyed || webView == null || !ScheduleResponseValidator.isValidTargetResponse(url, webView.getUrl(), body)) return;
                capturedUrl = url;
                capturedBody = body;
                resultErrorCode = null;
                resultErrorMessage = null;
                setStatus("已捕获课表响应，可点击“导入当前课表”。");
                if (waitingForCapture) {
                    waitingForCapture = false;
                    importButton.setEnabled(true);
                    persistAndFinish();
                }
            });
        }
    }

}
