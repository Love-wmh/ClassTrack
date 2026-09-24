import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame } from './ChartFrame'
import { getSectionDistributionConfig } from '../distributionCharts'

type SectionDistributionChartProps = {
  data: Array<{ name: string; total: number; attended: number; absent: number }>
  /** 「出勤统计」是否开启；关闭时只画「总课次」系列（见 `distributionCharts.ts`）。 */
  attendanceEnabled: boolean
}

export function SectionDistributionChart({ data, attendanceEnabled }: SectionDistributionChartProps) {
  const { description, series } = getSectionDistributionConfig(attendanceEnabled)

  return (
    <ChartFrame title="节次分布" description={description}>
      <div className="h-60 min-w-0 overflow-hidden sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
            {series.map((item) => (
              <Bar key={item.key} dataKey={item.key} name={item.name} fill={item.fill} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}
