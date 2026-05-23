import type { Route } from './+types/home'
import ClassSchedule from '../components/ClassSchedule'

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'ClassTrack - 课程表' },
    { name: 'description', content: '课程表管理应用' },
  ]
}

export default function Home() {
  return <ClassSchedule />
}
