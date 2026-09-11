import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

import { Button } from '~/components/ui/button'

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <aside
      aria-live="polite"
      className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border bg-background p-3 shadow-lg"
    >
      <p className="text-sm">ClassTrack 有新版本可用</p>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        <RefreshCw />
        立即更新
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="暂不更新" onClick={() => setNeedRefresh(false)}>
        <X />
      </Button>
    </aside>
  )
}
