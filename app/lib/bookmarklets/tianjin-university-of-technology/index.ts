import type { BookmarkletAdapter } from '../../types'
import { createScript } from './script'

export const tianjinUniversityOfTechnologyBookmarklet: BookmarkletAdapter = {
  id: 'tianjin-university-of-technology-bookmarklet',
  schoolId: 'tianjin-university-of-technology',
  name: '天津理工大学教务课表导出',
  description: '登录天津理工大学教务系统后，请在课表页面执行书签脚本导出课程表 JSON。',
  educationalSystemUrl: 'https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do',
  defaultTerm: '2025-2026-2',
  createScript,
}
