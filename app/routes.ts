import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  layout('routes/_layout.tsx', [
    index('routes/schedule.tsx'),
    route('dashboard', 'routes/dashboard.tsx'),
    route('course-management', 'routes/course-management.tsx'),
    route('data-management', 'routes/data-management.tsx'),
    route('profile', 'routes/profile.tsx'),
  ]),
] satisfies RouteConfig
