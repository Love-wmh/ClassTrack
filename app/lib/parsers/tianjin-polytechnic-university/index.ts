import type { ClassParser } from '../../types'
import { parse } from './parser'

export const tianjinPolytechnicUniversityParser: ClassParser = {
  id: 'tianjin-polytechnic-university',
  name: '天津工业大学',
  description: '适用于天津工业大学教务系统导出的JSON课程表',
  parse,
}
