import { GraduationCap } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { useSidebar } from '~/components/ui/sidebar'
import { useClassStore } from '~/store'

export default function SidebarLogo() {
  const school = useClassStore((state) => state.school)
  const { isMobile, state } = useSidebar()
  const schoolName = school?.name || '请选择学校'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          aria-label={schoolName}
          className="group/logo flex items-center gap-3 rounded-md border border-sidebar-border bg-white/70 px-3 py-3 shadow-xs transition-all group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none group-data-[collapsible=icon]:hover:bg-sidebar-accent/70"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-900 text-white shadow-xs transition-all group-data-[collapsible=icon]:h-5 group-data-[collapsible=icon]:w-5 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:text-muted-foreground group-data-[collapsible=icon]:shadow-none group-data-[collapsible=icon]:group-hover/logo:text-sidebar-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <h1 className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">ClassTrack</h1>
            <p className="truncate text-xs text-muted-foreground">{schoolName}</p>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" hidden={state !== 'collapsed' || isMobile}>
        {schoolName}
      </TooltipContent>
    </Tooltip>
  )
}
