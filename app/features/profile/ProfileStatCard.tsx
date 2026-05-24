import type { ReactNode } from 'react'
import { Card, CardContent } from '~/components/ui/card'

type ProfileStatCardProps = {
  label: string
  value: ReactNode
  description?: ReactNode
}

export default function ProfileStatCard({ label, value, description }: ProfileStatCardProps) {
  return (
    <Card className="border-gray-100 shadow-sm">
      <CardContent className="p-4">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</div>
        {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
      </CardContent>
    </Card>
  )
}
