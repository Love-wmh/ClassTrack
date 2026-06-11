import type { ReactNode } from 'react'

type CourseDetailItemProps = {
  label: string
  value: string
  icon?: ReactNode
}

export function CourseDetailItem({ icon, label, value }: CourseDetailItemProps) {
  return (
    <div className="flex h-11 min-w-0 items-center gap-2 rounded-md bg-muted px-4 text-sm text-muted-foreground">
      {icon && <div className="shrink-0">{icon}</div>}
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
    </div>
  )
}
