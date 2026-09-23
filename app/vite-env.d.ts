/// <reference types="vite/client" />

/**
 * 本项目自定义的构建期环境变量（Vite 只把 `VITE_` 前缀的变量暴露给客户端）。
 *
 * 目前只有一个：更新检测的调试开关。它只在本地为验收构建的测试包里设置，
 * CI 的两条发布轨道都不设，因此正式包里的调试注入路径恒不生效。
 */
interface ImportMetaEnv {
  /** 等于 `'1'` 时，更新检查会用 `localStorage` 里的假 release 数据替代 GitHub 响应。 */
  readonly VITE_UPDATE_DEBUG?: string
}
