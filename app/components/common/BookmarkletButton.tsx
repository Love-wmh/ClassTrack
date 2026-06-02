import { useCallback } from 'react'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'

interface BookmarkletButtonProps {
  href: string
}

export function BookmarkletButton({ href }: BookmarkletButtonProps) {
  const setRef = useCallback(
    (node: HTMLAnchorElement | null) => {
      if (node && href) {
        node.setAttribute('href', href)
      }
    },
    [href]
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="secondary">
            <a ref={setRef} href="#" onClick={(event) => event.preventDefault()}>
              数据导出器
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">请拖拽到浏览器书签栏/收藏栏以安装</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
