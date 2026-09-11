import type { CSSProperties } from 'react'
import { Outlet } from 'react-router'
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
import MobileBottomNav from './MobileBottomNav'
import NavItem from './NavItem'
import { navigationItems } from './navigation'
import SidebarCollapseButton from './SidebarCollapseButton'
import SidebarLogo from './SidebarLogo'

export default function AppLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider
        className="app-viewport flex-col overflow-hidden bg-background md:flex-row"
        style={{ '--sidebar-width-icon': '4rem' } as CSSProperties}
      >
        <Sidebar collapsible="icon" className="border-sidebar-border bg-sidebar">
          <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-3">
            <SidebarLogo />
          </SidebarHeader>

          <SidebarContent className="px-3 py-4 group-data-[collapsible=icon]:px-2">
            <SidebarMenu className="space-y-1">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavItem to={item.to} icon={<item.icon className="h-5 w-5" />} label={item.label} />
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

        <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </SidebarInset>
        <MobileBottomNav />
      </SidebarProvider>
    </TooltipProvider>
  )
}
