import { Badge } from '~/components/ui/badge'

type CourseBadgeProps = {
  label: string
}

export function CourseBadge({ label }: CourseBadgeProps) {
  return (
    <Badge className="flex h-11 shrink-0 items-center rounded-md border-0 bg-muted px-4 text-sm text-muted-foreground shadow-none hover:bg-muted">
      {label}
    </Badge>
  )
}
