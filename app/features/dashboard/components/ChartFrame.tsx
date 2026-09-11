import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

type ChartFrameProps = {
  title: string
  description?: string
  children: ReactNode
}

export function ChartFrame({ title, description, children }: ChartFrameProps) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="px-4 sm:px-5">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden px-3 sm:px-5">{children}</CardContent>
    </Card>
  )
}
