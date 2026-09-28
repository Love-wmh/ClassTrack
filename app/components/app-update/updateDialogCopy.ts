/**
 * 「发现新版本」模态框的按钮文案。
 *
 * 与组件**分文件**：`app/components/app-update/UpdateAvailableDialog.tsx` 只导出组件，
 * 否则会触发 `react-refresh/only-export-components`（`--max-warnings 0` 下警告也会失败）。
 *
 * 更新说明的渲染不在这里：它按 markdown 走 `releaseNotes.tsx` 的 token → React 元素映射。
 * 2026-09-28 之前这里有一个 `formatReleaseNotes`（只把 `**` 去掉的纯文本清理），
 * 改成真实渲染之后它不再需要，已删除。
 */

export const UPDATE_DOWNLOAD_ACTION = '去下载'
export const UPDATE_LATER_ACTION = '稍后'
export const UPDATE_SKIP_ACTION = '跳过此版本'
