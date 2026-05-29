import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame } from './ChartFrame'

type SectionDistributionChartProps = {
  data: Array<{ name: string; total: number; attended: number; absent: number }>
}

export function SectionDistributionChart({ data }: SectionDistributionChartProps) {
  return (
    <ChartFrame title="节次分布" description="按上课节次统计课程密度和完成情况。">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar dataKey="total" name="总课次" fill="#111827" radius={[4, 4, 0, 0]} />
            <Bar dataKey="attended" name="已上" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="absent" name="缺勤" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}
