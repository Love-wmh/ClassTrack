import { ChevronLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useSidebar } from '~/components/ui/sidebar'
import { cn } from '~/lib/utils'

export default function SidebarCollapseButton() {
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
      aria-label={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
      title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
      onClick={toggleSidebar}
    >
      <ChevronLeft className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')} />
    </Button>
  )
}
