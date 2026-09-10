import { Document, Packer, Paragraph, TextRun } from 'docx'
import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { marked } from 'marked'
import type { SubstituteLesson } from './utils'
import { formatExportFileName } from './utils'

export type SubstituteExportFormat = 'html' | 'markdown' | 'txt' | 'pdf' | 'docx'

const markdownBodyStyle = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 48px 56px;
    font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #171717;
    background: #ffffff;
  }
  h1, h2, h3, h4, h5, h6 {
    margin: 1.4em 0 0.6em;
    line-height: 1.35;
    font-weight: 650;
  }
  h1 { font-size: 28px; }
  h2 { font-size: 22px; padding-bottom: 8px; border-bottom: 1px solid #e5e5e5; }
  h3 { font-size: 18px; }
  p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
  ul, ol { padding-left: 1.5em; }
  li { margin: 0.25em 0; }
  strong { font-weight: 650; }
  img { max-width: 100%; height: auto; display: block; margin: 12px 0; }
  blockquote {
    margin-left: 0;
    padding: 8px 16px;
    color: #525252;
    border-left: 3px solid #d4d4d4;
    background: #fafafa;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre {
    padding: 12px 16px;
    overflow: auto;
    background: #f5f5f5;
    border-radius: 8px;
  }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e5e5e5; padding: 8px 10px; text-align: left; }
`

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function markdownToHtmlDocument(markdown: string, title = '课程信息') {
  const body = marked.parse(markdown || '暂无课程信息', { async: false, gfm: true, breaks: true })
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title><style>${markdownBodyStyle}</style></head><body>${body}</body></html>`
}

function downloadBlob(content: BlobPart, fileName: string, type: string) {
  saveAs(new Blob([content], { type }), fileName)
}

function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'))
  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve()
            return
          }
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        })
    )
  )
}

async function renderMarkdownFrame(markdown: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.left = '-10000px'
  frame.style.top = '0'
  frame.style.width = '794px'
  frame.style.height = '1123px'
  frame.style.border = '0'
  frame.style.opacity = '0'
  frame.style.pointerEvents = 'none'
  document.body.appendChild(frame)

  const frameDocument = frame.contentDocument
  if (!frameDocument) {
    frame.remove()
    throw new Error('无法创建 PDF 渲染容器')
  }

  frameDocument.open()
  frameDocument.write(markdownToHtmlDocument(markdown))
  frameDocument.close()
  await waitForImages(frameDocument.body)
  return frame
}

async function exportPdf(markdown: string, fileName: string) {
  const frame = await renderMarkdownFrame(markdown)
  const frameDocument = frame.contentDocument
  const root = frameDocument?.body
  if (!root) {
    frame.remove()
    throw new Error('无法创建 PDF 渲染容器')
  }

  try {
    const canvas = await html2canvas(root, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 794,
      onclone: (clonedDocument, clonedElement) => {
        clonedDocument.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove())
        const style = clonedDocument.createElement('style')
        style.textContent = markdownBodyStyle
        clonedDocument.head.appendChild(style)
        clonedDocument.documentElement.style.background = '#ffffff'
        clonedDocument.body.style.background = '#ffffff'
        clonedDocument.body.style.color = '#171717'
        clonedElement.style.background = '#ffffff'
        clonedElement.style.color = '#171717'
      },
      ignoreElements: (element) => element.tagName === 'SCRIPT',
    })
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imageWidth = pageWidth
    const pageCanvas = document.createElement('canvas')
    const pageContext = pageCanvas.getContext('2d')
    if (!pageContext) {
      throw new Error('无法创建 PDF 分页画布')
    }

    const pageHeightPx = Math.floor((pageHeight / imageWidth) * canvas.width)
    let loadedHeight = 0
    let pageIndex = 0

    while (loadedHeight < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - loadedHeight)
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight
      pageContext.fillStyle = '#ffffff'
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      pageContext.drawImage(canvas, 0, loadedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      const pageImage = pageCanvas.toDataURL('image/jpeg', 0.95)
      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(pageImage, 'JPEG', 0, 0, imageWidth, (sliceHeight / canvas.width) * imageWidth)
      loadedHeight += sliceHeight
      pageIndex += 1
    }

    pdf.save(`${fileName}.pdf`)
  } finally {
    frame.remove()
  }
}

async function exportDocx(markdown: string, fileName: string) {
  const paragraphs = markdownToPlainText(markdown)
    .split('\n')
    .map((line) => new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Microsoft YaHei' })] }))

  const document = new Document({
    sections: [
      {
        children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun('暂无课程信息')] })],
      },
    ],
  })

  const blob = await Packer.toBlob(document)
  saveAs(blob, `${fileName}.docx`)
}

export async function exportSubstituteMarkdown(markdown: string, format: SubstituteExportFormat, lessons: SubstituteLesson[]) {
  const fileName = lessons.length > 0 ? formatExportFileName(lessons.map((lesson) => lesson.date)) : '课程信息'

  if (format === 'markdown') {
    downloadBlob(markdown, `${fileName}.md`, 'text/markdown;charset=utf-8')
    return
  }

  if (format === 'txt') {
    downloadBlob(markdownToPlainText(markdown), `${fileName}.txt`, 'text/plain;charset=utf-8')
    return
  }

  if (format === 'html') {
    downloadBlob(markdownToHtmlDocument(markdown, fileName), `${fileName}.html`, 'text/html;charset=utf-8')
    return
  }

  if (format === 'pdf') {
    await exportPdf(markdown, fileName)
    return
  }

  await exportDocx(markdown, fileName)
}
