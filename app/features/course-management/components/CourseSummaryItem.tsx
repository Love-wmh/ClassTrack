type CourseSummaryItemProps = {
  label: string
  value: string
}

export function CourseSummaryItem({ label, value }: CourseSummaryItemProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  )
}
