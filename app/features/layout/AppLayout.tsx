import type { CSSProperties } from 'react'
import { Outlet } from 'react-router'
import { BarChart3, Calendar, Database, NotebookTabs, User } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from '~/components/ui/sidebar'
import { TooltipProvider } from '~/components/ui/tooltip'
import NavItem from './NavItem'
import SidebarCollapseButton from './SidebarCollapseButton'
import SidebarLogo from './SidebarLogo'

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
    to: '/course-management',
    icon: <NotebookTabs className="h-5 w-5" />,
    label: '课程管理',
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
