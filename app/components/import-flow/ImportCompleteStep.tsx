import { CheckCircle2 } from 'lucide-react'

type ImportCompleteStepProps = {
  title: string
  description: string
}

export function ImportCompleteStep({ title, description }: ImportCompleteStepProps) {
  return (
    <div className="flex flex-col items-center rounded-md border bg-muted/30 px-6 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
        <CheckCircle2 className="size-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
