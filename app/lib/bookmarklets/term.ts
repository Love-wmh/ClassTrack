export type AcademicTermRule = {
  fallStartsMonth?: number
  springStartsMonth?: number
}

const DEFAULT_FALL_STARTS_MONTH = 8
const DEFAULT_SPRING_STARTS_MONTH = 2

export function resolveChineseAcademicTerm(now: Date, rule: AcademicTermRule = {}) {
  const fallStartsMonth = rule.fallStartsMonth ?? DEFAULT_FALL_STARTS_MONTH
  const springStartsMonth = rule.springStartsMonth ?? DEFAULT_SPRING_STARTS_MONTH
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  if (month >= fallStartsMonth) {
    return `${year}-${year + 1}-1`
  }

  if (month >= springStartsMonth) {
    return `${year - 1}-${year}-2`
  }

  return `${year - 1}-${year}-1`
}
