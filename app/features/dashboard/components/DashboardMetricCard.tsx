import type { ReactNode } from 'react'
import { Card, CardContent } from '~/components/ui/card'

type DashboardMetricCardProps = {
  title: string
  value: string | number
  description: string
  icon: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

const toneClassName = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
}

export function DashboardMetricCard({ title, value, description, icon, tone = 'default' }: DashboardMetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-md ${toneClassName[tone]}`}>{icon}</div>
      </CardContent>
    </Card>
  )
}
