import type { Class, ClassParser } from '../types'

// 解析器模板：复制此文件并修改 parse 函数来创建新的解析器
// 1. 修改 id 为唯一标识符（建议使用 kebab-case）
// 2. 修改 name 为解析器显示名称
// 3. 修改 description 为解析器描述
// 4. 实现 parse 函数，将原始数据转换为 Class[] 格式

export const yourUniversityParser: ClassParser = {
  id: 'your-university',
  name: '你的学校名称',
  description: '适用于XXX教务系统导出的JSON课程表',
  parse: (data: any): Class[] => {
    // TODO: 实现你的解析逻辑
    // 参考 tianjin-university-of-technology.ts 中的实现
    return []
  },
}
