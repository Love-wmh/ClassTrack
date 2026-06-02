// 天津理工大学教务系统原始课程数据类型
export interface RawClass {
  KCM: string // 课程名称
  SKJS: string // 授课教师
  JASMC: string // 教室名称
  KSSJ: string // 开始时间
  JSSJ: string // 结束时间
  SKXQ: number // 上课星期 (1-7)
  KSJC: number // 开始节次
  JSJC: number // 结束节次
  SKZC: string // 上课周次 (二进制字符串)
  XNXQDM: string // 学年学期代码
  KCH: string // 课程号
  JXBID: string // 教学班ID
  KCXZDM_DISPLAY: string // 课程性质显示
  KCLBDM_DISPLAY: string // 课程类别显示
}
