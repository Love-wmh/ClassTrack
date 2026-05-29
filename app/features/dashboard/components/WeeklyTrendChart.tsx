import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame } from './ChartFrame'

type WeeklyTrendChartProps = {
  data: Array<Record<string, string | number>>
}

export function WeeklyTrendChart({ data }: WeeklyTrendChartProps) {
  return (
    <ChartFrame title="周趋势" description="按周统计应上、已上、缺勤和未标记课次。">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
            <Legend />
            <Bar dataKey="已上" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="缺勤" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="未标记" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="应上" stroke="#111827" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}
