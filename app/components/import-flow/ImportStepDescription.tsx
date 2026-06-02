type ImportStepDescriptionProps = {
  steps: string[]
}

export function ImportStepDescription({ steps }: ImportStepDescriptionProps) {
  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
      <ol className="list-decimal space-y-1 pl-5">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  )
}
