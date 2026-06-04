import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并组件传入的 className，并处理 Tailwind 工具类冲突。
 *
 * 这个函数先通过 `clsx` 过滤条件类名、数组和对象写法，再通过
 * `tailwind-merge` 保留同组工具类中的最后一个有效值，避免出现
 * `px-2 px-4` 这类互相覆盖但仍同时存在的 class。
 *
 * @param inputs 任意数量的 className 输入，支持字符串、数组、对象和条件值。
 * @returns 合并并去重后的 className 字符串。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
