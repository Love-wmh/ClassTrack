import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame } from './ChartFrame'

type WeekdayDistributionChartProps = {
  data: Array<Record<string, string | number>>
}

export function WeekdayDistributionChart({ data }: WeekdayDistributionChartProps) {
  return (
    <ChartFrame title="星期分布" description="观察一周内课程负担和缺勤分布。">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar dataKey="总课次" fill="#111827" radius={[4, 4, 0, 0]} />
            <Bar dataKey="已上" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="缺勤" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}
