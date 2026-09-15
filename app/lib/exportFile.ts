import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type ExportFileInput = {
  fileName: string
  mimeType: string
  data: Blob | string | ArrayBuffer | Uint8Array
}

export type ExportFileResult = {
  method: 'download' | 'share'
  canceled?: boolean
}

export function getExportSuccessMessage(result: ExportFileResult) {
  if (result.canceled) return null
  return result.method === 'share' ? '请选择保存位置或分享应用' : '已开始下载'
}

export async function exportFile({ fileName, mimeType, data }: ExportFileInput): Promise<ExportFileResult> {
  const safeName = sanitizeFileName(fileName)
  const blob = toBlob(data, mimeType)

  if (!Capacitor.isNativePlatform()) {
    downloadBlob(blob, safeName)
    return { method: 'download' }
  }

  const path = `export/${safeName}`
  await Filesystem.writeFile({
    path,
    data: shouldWriteAsText(mimeType) ? await blob.text() : await blobToBase64(blob),
    directory: Directory.Cache,
    encoding: shouldWriteAsText(mimeType) ? Encoding.UTF8 : undefined,
    recursive: true,
  })

  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Cache,
  })

  try {
    await Share.share({
      title: safeName,
      files: [uri],
      dialogTitle: '导出文件',
    })
    return { method: 'share' }
  } catch (error) {
    if (isShareCanceled(error)) {
      return { method: 'share', canceled: true }
    }
    throw error
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function toBlob(data: ExportFileInput['data'], mimeType: string) {
  if (data instanceof Blob) return data
  if (typeof data === 'string') return new Blob([data], { type: mimeType })
  if (data instanceof ArrayBuffer) return new Blob([data], { type: mimeType })
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return new Blob([copy.buffer], { type: mimeType })
}

function shouldWriteAsText(mimeType: string) {
  return mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml'
}

function sanitizeFileName(fileName: string) {
  const sanitized = fileName.replace(/[\\/:*?"<>|]/g, '_').trim()
  return sanitized || 'export'
}

function isShareCanceled(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /cancel/i.test(message)
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
