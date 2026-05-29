import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartFrame } from './ChartFrame'

type BreakdownItem = {
  name: string
  total: number
}

type CategoryBreakdownChartProps = {
  data: BreakdownItem[]
  title: string
  description: string
}

const colors = ['#111827', '#6b7280', '#9ca3af', '#d1d5db', '#10b981', '#f59e0b', '#ef4444', '#3b82f6']

export function CategoryBreakdownChart({ data, title, description }: CategoryBreakdownChartProps) {
  return (
    <ChartFrame title={title} description={description}>
      <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="total" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 self-center">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="truncate">{item.name}</span>
              </div>
              <span className="font-medium">{item.total}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartFrame>
  )
}
