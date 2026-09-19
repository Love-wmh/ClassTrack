import { AlarmClock, BadgeCheck } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { useWidgetPrecision } from './hooks/useWidgetPrecision'

/**
 * 桌面小工具的精度设置（design-appendix D12）。
 *
 * 这里**必须如实**：基础模式在息屏深度省电时最长可能延迟约 30 分钟才切换课程，
 * 因此文案不能写成「实时」。同时要说明「显示的课程名始终正确」——那是结构性的保证，
 * 与延迟不是一回事。
 */
export default function WidgetPrecisionSettings() {
  const { supported, status, isRequesting, requestExactAlarmPermission } = useWidgetPrecision()

  // 浏览器 / PWA 上整节不渲染：避免出现点击后没有任何反应的死按钮。
  if (!supported) return null

  const isExact = status?.exact === true
  const needsPermission = status?.available === true && !isExact

  return (
    <Card id="card-widget-precision">
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle>桌面小工具</CardTitle>
          <CardDescription>小工具会显示接下来的一节课和今天剩余课程，并在课程开始、结束时自动切换。</CardDescription>
        </div>
        <Badge variant={isExact ? 'default' : 'secondary'} className="self-start">
          {isExact ? '精确' : '基础'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {isExact
            ? '精确模式已开启：课程开始或结束时，即使手机正在休眠也会按点切换。显示的课程名在任何模式下都是正确的。'
            : '基础模式不需要任何特殊权限。息屏深度省电时，课程切换最长可能延迟约 30 分钟；显示的课程名在任何模式下都是正确的。'}
        </p>

        {status === null && <p className="text-sm text-muted-foreground">正在读取当前精度状态…</p>}

        {needsPermission && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">精确模式需要在系统设置里授予「闹钟与提醒」权限。</p>
            <Button
              className="min-h-11 w-full sm:min-h-9 sm:w-auto"
              type="button"
              variant="outline"
              disabled={isRequesting}
              onClick={() => void requestExactAlarmPermission()}
            >
              <AlarmClock aria-hidden="true" />
              开启精确切换
            </Button>
          </div>
        )}

        {isExact && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <BadgeCheck className="size-4" aria-hidden="true" />
              已获得系统授权
            </p>
            <Button
              className="min-h-11 w-full sm:min-h-9 sm:w-auto"
              type="button"
              variant="ghost"
              disabled={isRequesting}
              onClick={() => void requestExactAlarmPermission()}
            >
              前往系统设置
            </Button>
          </div>
        )}

        {status?.available === false && <p className="text-sm text-muted-foreground">当前系统版本不需要该权限，小工具已经是精确的。</p>}
      </CardContent>
    </Card>
  )
}
