import type { CSSProperties } from 'react'
import { Outlet } from 'react-router'
import { BarChart3, Calendar, ChevronLeft, Database, GraduationCap, User } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from '~/components/ui/sidebar'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'
import { useClassStore } from '~/store'
import { cn } from '~/lib/utils'
import NavItem from './NavItem'

const navItems = [
  {
    to: '/',
    icon: <Calendar className="h-5 w-5" />,
    label: '课程表',
  },
  {
    to: '/dashboard',
    icon: <BarChart3 className="h-5 w-5" />,
    label: '数据看板',
  },
  {
    to: '/data-management',
    icon: <Database className="h-5 w-5" />,
    label: '数据管理',
  },
  {
    to: '/profile',
    icon: <User className="h-5 w-5" />,
    label: '个人中心',
  },
]

function SidebarLogo() {
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

function SidebarCollapseButton() {
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

export default function AppLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider className="h-screen min-h-0 bg-background" style={{ '--sidebar-width-icon': '4rem' } as CSSProperties}>
        <Sidebar collapsible="icon" className="border-sidebar-border bg-sidebar">
          <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-3">
            <SidebarLogo />
          </SidebarHeader>

          <SidebarContent className="px-3 py-4 group-data-[collapsible=icon]:px-2">
            <SidebarMenu className="space-y-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavItem to={item.to} icon={item.icon} label={item.label} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="mt-auto p-0 pb-4">
            <div className="flex justify-end px-4 group-data-[collapsible=icon]:px-3">
              <SidebarCollapseButton />
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="overflow-hidden">
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
