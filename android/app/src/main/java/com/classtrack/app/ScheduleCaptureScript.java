package com.classtrack.app;

/** Builds the idempotent page hook used to capture only the configured schedule response. */
public final class ScheduleCaptureScript {
    private ScheduleCaptureScript() {}

    public static String create() {
        return create("static-test-session");
    }

    public static String create(String hookNonce) {
        String safeNonce = hookNonce == null ? "invalid" : hookNonce.replace("\\", "\\\\").replace("'", "\\'");
        return "(()=>{const hookNonce='" + safeNonce + "';"
                + "if(window.__classTrackScheduleHookInstalled){window.__classTrackScheduleHookNonce=hookNonce;return;}"
                + "window.__classTrackScheduleHookInstalled=true;window.__classTrackScheduleHookNonce=hookNonce;"
                + "const target='" + ScheduleResponseValidator.TARGET_PATH + "';"
                + "const max=" + ScheduleResponseValidator.MAX_PAYLOAD_BYTES + ";"
                + "const sizeOf=body=>{try{return new TextEncoder().encode(body).length}catch(_){try{return new Blob([body]).size}catch(_){return body.length*4}}};"
                + "const send=(url,body,nonce)=>{try{const u=new URL(String(url),location.href);"
                + "const safeUrl=u.origin+u.pathname;const bytes=typeof body==='string'?sizeOf(body):-1;"
                + "if(u.protocol==='https:'&&u.hostname==='" + ScheduleResponseValidator.TARGET_HOST + "'"
                + "&&u.username===''&&u.password===''&&(u.port===''||u.port==='443')&&u.pathname===target&&typeof body==='string'){"
                + "if(bytes>max){if(window.CourseImportBridge&&window.CourseImportBridge.onScheduleResponseTooLarge){"
                + "window.CourseImportBridge.onScheduleResponseTooLarge(safeUrl,bytes,nonce)}return;}"
                + "if(window.CourseImportBridge){window.CourseImportBridge.onScheduleResponse(safeUrl,body,nonce)}}}catch(_){} };"
                + "const open=XMLHttpRequest.prototype.open;const sendXhr=XMLHttpRequest.prototype.send;"
                + "XMLHttpRequest.prototype.open=function(method,url){this.__classTrackUrl=url;this.__classTrackHookNonce=window.__classTrackScheduleHookNonce;return open.apply(this,arguments)};"
                + "XMLHttpRequest.prototype.send=function(){this.addEventListener('load',()=>{if(typeof this.responseText==='string')"
                + "send(this.__classTrackUrl,this.responseText,this.__classTrackHookNonce)});return sendXhr.apply(this,arguments)};"
                + "const originalFetch=window.fetch;window.fetch=function(){const requestNonce=window.__classTrackScheduleHookNonce;return originalFetch.apply(this,arguments).then(response=>{"
                + "try{const url=response.url||arguments[0];response.clone().text().then(body=>send(url,body,requestNonce)).catch(()=>{})}catch(_){}return response})}})()";
    }
}
