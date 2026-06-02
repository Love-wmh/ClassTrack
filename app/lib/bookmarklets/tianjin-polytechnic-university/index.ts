import type { BookmarkletAdapter } from '../../types'
import { createScript } from './script'

export const tianjinPolytechnicUniversityBookmarklet: BookmarkletAdapter = {
  id: 'tianjin-polytechnic-university-bookmarklet',
  schoolId: 'tianjin-polytechnic-university',
  name: '天津工业大学教务课表导出',
  description: '登录天津工业大学教务系统后，请在课表页面执行书签脚本导出课程表 JSON。',
  educationalSystemUrl: 'https://jwxt.tiangong.edu.cn/jwapp/sys/wdkb/*default/index.do',
  defaultTerm: '2025-2026-2',
  createScript,
}
