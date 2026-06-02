import { useCallback } from 'react'
import { Button } from '~/components/ui/button'

interface BookmarkletButtonProps {
  href: string
}

export function BookmarkletButton({ href }: BookmarkletButtonProps) {
  const setRef = useCallback((node: HTMLAnchorElement | null) => {
    if (node && href) {
      node.setAttribute('href', href)
    }
  }, [href])

  return (
    <Button asChild variant="secondary">
      <a ref={setRef} href="#" onClick={(event) => event.preventDefault()}>
        拖到书签栏保存
      </a>
    </Button>
  )
}
