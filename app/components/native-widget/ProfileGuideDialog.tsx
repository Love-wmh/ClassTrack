import { UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { isNativeWidgetSnapshotAvailable } from '~/lib/native-widget-snapshot'
import {
  PROFILE_GUIDE_DESCRIPTION,
  PROFILE_GUIDE_PRIMARY_ACTION,
  PROFILE_GUIDE_SECONDARY_ACTION,
  PROFILE_GUIDE_TITLE,
} from '~/lib/profile-guide'
import { useClassStore } from '~/store'

type ProfileGuideBodyProps = {
  onPrimary: () => void
  onSecondary: () => void
}

/**
 * 第二段引导的**内容**（标题 / 说明 / 两个按钮），不含 Dialog 外壳。
 *
 * 与 `WidgetGuideBody` 同一处理：单独导出是为了可测 —— Radix 的 `Dialog` 内容走 Portal，
 * `renderToStaticMarkup` 渲染不出内容，而仓库的组件测试正是用静态渲染做的。
 */
export function ProfileGuideBody({ onPrimary, onSecondary }: ProfileGuideBodyProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserRound className="size-5 text-primary" />
          {PROFILE_GUIDE_TITLE}
        </DialogTitle>
        <DialogDescription>{PROFILE_GUIDE_DESCRIPTION}</DialogDescription>
      </DialogHeader>

      <DialogFooter className="gap-2 sm:justify-end">
        <Button variant="outline" onClick={onSecondary}>
          {PROFILE_GUIDE_SECONDARY_ACTION}
        </Button>
        <Button onClick={onPrimary}>{PROFILE_GUIDE_PRIMARY_ACTION}</Button>
      </DialogFooter>
    </>
  )
}

/**
 * 加桌引导关闭后的**一次性**引导：可以去个人中心做更多设置（挂载点在 `root.tsx`，与加桌引导并列）。
 *
 * **打开条件是 `showProfileGuide && !widgetPinSheetOpen`**：用户点「去添加」时加桌面板会随即打开，
 * 第二段引导要等面板关掉之后再出现，不叠在面板上；点「知道了」时面板没开，于是立刻出现。
 * 这样就不需要额外的「待弹」标志 —— 面板的开合状态本身就是那个标志。
 *
 * **不在安卓原生时返回 `null`**，理由与加桌引导相同（那里没有桌面小卡片，也就没有「加桌完成」这回事）。
 */
export default function ProfileGuideDialog() {
  const navigate = useNavigate()
  const showProfileGuide = useClassStore((state) => state.showProfileGuide)
  const setShowProfileGuide = useClassStore((state) => state.setShowProfileGuide)
  const widgetPinSheetOpen = useClassStore((state) => state.widgetPinSheetOpen)

  if (!isNativeWidgetSnapshotAvailable()) return null

  const close = () => setShowProfileGuide(false)

  return (
    <Dialog open={showProfileGuide && !widgetPinSheetOpen} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-w-md" data-guide="profile">
        <ProfileGuideBody
          onSecondary={close}
          onPrimary={() => {
            close()
            navigate('/profile')
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
