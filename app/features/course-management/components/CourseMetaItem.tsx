import type { ReactNode } from 'react'

type CourseMetaItemProps = {
  icon: ReactNode
  label: string
  value: string
}

export function CourseMetaItem({ icon, label, value }: CourseMetaItemProps) {
  return (
    <div className="flex items-start gap-3 rounded-md bg-muted/30 p-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
