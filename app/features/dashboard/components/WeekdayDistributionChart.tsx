import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame } from './ChartFrame'
import { getWeekdayDistributionConfig } from '../distributionCharts'

type WeekdayDistributionChartProps = {
  data: Array<Record<string, string | number>>
  /** 「出勤统计」是否开启；关闭时只画「总课次」系列（见 `distributionCharts.ts`）。 */
  attendanceEnabled: boolean
}

export function WeekdayDistributionChart({ data, attendanceEnabled }: WeekdayDistributionChartProps) {
  const { description, series } = getWeekdayDistributionConfig(attendanceEnabled)

  return (
    <ChartFrame title="星期分布" description={description}>
      <div className="h-60 min-w-0 overflow-hidden sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
            {series.map((item) => (
              <Bar key={item.key} dataKey={item.key} fill={item.fill} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}
