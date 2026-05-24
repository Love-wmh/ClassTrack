import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [layout('routes/_layout.tsx', [index('routes/schedule.tsx'), route('profile', 'routes/profile.tsx')])] satisfies RouteConfig
