import type { ClassParser } from '../../types'
import { parse } from './parser'

export const tianjinUniversityOfTechnologyParser: ClassParser = {
  id: 'tianjin-university-of-technology',
  name: '天津理工大学',
  description: '适用于天津理工大学教务系统导出的JSON课程表',
  parse,
}
