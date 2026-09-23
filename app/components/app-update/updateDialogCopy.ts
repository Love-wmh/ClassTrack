/**
 * 「发现新版本」模态框的文案与纯文本清理。
 *
 * 与组件**分文件**：`app/components/app-update/UpdateAvailableDialog.tsx` 只导出组件，
 * 否则会触发 `react-refresh/only-export-components`（本仓库把它当 error，`--max-warnings 0` 下警告也会失败）。
 */

export const UPDATE_DOWNLOAD_ACTION = '去下载'
export const UPDATE_LATER_ACTION = '稍后'
export const UPDATE_SKIP_ACTION = '跳过此版本'

/**
 * 去掉 markdown 的粗体标记，让纯文本读起来干净些。
 *
 * release 正文按**纯文本**渲染（prd T5）：它是远端内容，`marked` 的输出未经净化，
 * 直接 `dangerouslySetInnerHTML` 会在 WebView 里开出一个脚本注入面 —— 而这个 WebView 的
 * localStorage 里放着用户的全部课程数据。这里只做纯文本层面的最小清理，
 * 不解析 HTML、不生成任何标签，因此不会引入注入面。
 *
 * @param notes release 正文原文。
 * @returns 去掉 `**` 并裁掉首尾空白后的纯文本。
 */
export function formatReleaseNotes(notes: string): string {
  return notes.replaceAll('**', '').trim()
}
