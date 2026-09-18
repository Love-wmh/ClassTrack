package com.classtrack.app;

/** Builds the idempotent page hook used to capture only the configured schedule response. */
public final class ScheduleCaptureScript {
    private ScheduleCaptureScript() {}

    public static String create() {
        return "(()=>{if(window.__classTrackScheduleHookInstalled)return;window.__classTrackScheduleHookInstalled=true;const target='" + ScheduleResponseValidator.TARGET_PATH + "';const send=(url,body)=>{try{const u=new URL(String(url),location.href);if(u.protocol==='https:'&&u.host==='" + ScheduleResponseValidator.TARGET_HOST + "'&&u.pathname===target&&typeof body==='string'&&body.length<" + ScheduleResponseValidator.MAX_PAYLOAD_BYTES + "&&window.CourseImportBridge){window.CourseImportBridge.onScheduleResponse(u.href,body)}}catch(_){}};const open=XMLHttpRequest.prototype.open;const sendXhr=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(method,url){this.__classTrackUrl=url;return open.apply(this,arguments)};XMLHttpRequest.prototype.send=function(){this.addEventListener('load',()=>{if(typeof this.responseText==='string')send(this.__classTrackUrl,this.responseText)});return sendXhr.apply(this,arguments)};const originalFetch=window.fetch;window.fetch=function(){return originalFetch.apply(this,arguments).then(response=>{try{const url=response.url||arguments[0];response.clone().text().then(body=>send(url,body)).catch(()=>{})}catch(_){}return response})}})()";
    }
}
