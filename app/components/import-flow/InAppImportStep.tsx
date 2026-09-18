import { CourseImportShell, type CourseImportShellStatus } from './CourseImportShell'

type InAppImportStepProps = {
  term: string
  onTermChange: (term: string) => void
  firstWeekStartDate: string | null
  onFirstWeekStartDateChange: (date: string | null) => void
  status: 'idle' | 'opening' | 'captured' | 'failed'
  error: string | null
}

export function InAppImportStep({
  term,
  onTermChange,
  firstWeekStartDate,
  onFirstWeekStartDateChange,
  status,
  error,
}: InAppImportStepProps) {
  const shellStatus: CourseImportShellStatus = status

  return (
    <CourseImportShell
      term={term}
      onTermChange={onTermChange}
      firstWeekStartDate={firstWeekStartDate}
      onFirstWeekStartDateChange={onFirstWeekStartDateChange}
      status={shellStatus}
      error={error}
    />
  )
}
