import type { BookmarkletAdapter } from '../types'
import { tianjinUniversityOfTechnologyBookmarklet } from './tianjin-university-of-technology'

export const bookmarkletAdapters: BookmarkletAdapter[] = [tianjinUniversityOfTechnologyBookmarklet]

export function getBookmarkletAdapterBySchoolId(schoolId?: string | null): BookmarkletAdapter | undefined {
  if (!schoolId) return undefined
  return bookmarkletAdapters.find((adapter) => adapter.schoolId === schoolId)
}
