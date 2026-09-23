import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '~/lib/utils'

/**
 * 开关。
 *
 * 用 `radix-ui` 统一包的 `Switch`（与 `select.tsx` / `avatar.tsx` 同款导入），
 * 而不是新加 `@radix-ui/react-switch` 依赖 —— 它已经作为 `radix-ui` 的依赖存在于依赖树里。
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/35',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-background shadow-xs transition-transform',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
