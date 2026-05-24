import type { ClassParser, School } from '../types'

// 导入所有解析器
// 新增解析器：在 parsers/ 目录下创建新文件，然后在此处导入
import { tianjinUniversityOfTechnologyParser } from './tianjin-university-of-technology'
import { tianjinPolytechnicUniversityParser } from './tianjin-polytechnic-university'

// 解析器注册表
export const parsers: ClassParser[] = [tianjinUniversityOfTechnologyParser, tianjinPolytechnicUniversityParser]

// 学校列表（学校与解析器不绑定，选择学校后仍可自由选择任意解析器）
export const schools: School[] = [
  {
    id: 'tianjin-university-of-technology',
    name: '天津理工大学',
  },
  {
    id: 'tianjin-polytechnic-university',
    name: '天津工业大学',
  },
]

// 根据ID获取解析器
export function getParserById(id: string): ClassParser | undefined {
  return parsers.find((p) => p.id === id)
}
