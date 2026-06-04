import React from 'react'
import { NavLink } from 'react-router'
import { SidebarMenuButton } from '~/components/ui/sidebar'
import { cn } from '~/lib/utils'

type NavItemProps = {
  to: string
  icon: React.ReactNode
  label: string
}

export default function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink to={to} end>
      {({ isActive }) => (
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={label}
          className={cn(
            'h-10 gap-3 px-3 py-2.5 text-sm font-medium transition-colors group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
          )}
        >
          <span>
            {icon}
            <span className="group-data-[collapsible=icon]:hidden">{label}</span>
          </span>
        </SidebarMenuButton>
      )}
    </NavLink>
  )
}
