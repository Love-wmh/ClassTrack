import type { BookmarkletAdapter } from '../types'
import { tianjinUniversityOfTechnologyBookmarklet } from './tianjin-university-of-technology'
import { tianjinPolytechnicUniversityBookmarklet } from './tianjin-polytechnic-university'

export const bookmarkletAdapters: BookmarkletAdapter[] = [tianjinUniversityOfTechnologyBookmarklet, tianjinPolytechnicUniversityBookmarklet]

export function getBookmarkletAdapterBySchoolId(schoolId?: string | null): BookmarkletAdapter | undefined {
  if (!schoolId) return undefined
  return bookmarkletAdapters.find((adapter) => adapter.schoolId === schoolId)
}
