import { Document, Packer, Paragraph, TextRun } from 'docx'
import { saveAs } from 'file-saver'
import { jsPDF } from 'jspdf'
import type { SubstituteLesson } from './utils'
import { formatExportFileName } from './utils'

export type SubstituteExportFormat = 'html' | 'markdown' | 'txt' | 'pdf' | 'docx'

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function markdownToHtml(markdown: string) {
  const escaped = markdown.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

  const htmlBody = escaped
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) =>
        line
          .replace(/^##\s+(.*)$/, '<h2>$1</h2>')
          .replace(/^\s*-\s+(.*)$/, '<li>$1</li>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      )

      if (lines.every((line) => line.startsWith('<li>'))) {
        return `<ul>${lines.join('')}</ul>`
      }

      return lines.map((line) => (line.startsWith('<h2>') ? line : `<p>${line}</p>`)).join('')
    })
    .join('')

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>课程信息</title></head><body>${htmlBody}</body></html>`
}

function downloadBlob(content: BlobPart, fileName: string, type: string) {
  saveAs(new Blob([content], { type }), fileName)
}

function wrapPlainText(text: string, maxChars: number) {
  return text.split('\n').flatMap((line) => {
    if (!line) return ['']
    const chunks: string[] = []
    for (let index = 0; index < line.length; index += maxChars) {
      chunks.push(line.slice(index, index + maxChars))
    }
    return chunks
  })
}

function createTextCanvas(lines: string[]) {
  const fontSize = 28
  const lineHeight = 42
  const padding = 48
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建 PDF 画布')
  }

  canvas.width = 1240
  canvas.height = Math.max(1754, padding * 2 + lines.length * lineHeight)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#111111'
  context.font = `${fontSize}px "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif`
  context.textBaseline = 'top'
  lines.forEach((line, index) => {
    context.fillText(line, padding, padding + index * lineHeight)
  })

  return canvas
}

async function exportPdf(markdown: string, fileName: string) {
  const text = markdownToPlainText(markdown) || '暂无课程信息'
  const lines = wrapPlainText(text, 36)
  const canvas = createTextCanvas(lines)
  const image = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imageHeight = (canvas.height / canvas.width) * pageWidth
  let remainingHeight = imageHeight
  let position = 0

  pdf.addImage(image, 'JPEG', 0, position, pageWidth, imageHeight)
  remainingHeight -= pageHeight
  while (remainingHeight > 0) {
    position -= pageHeight
    pdf.addPage()
    pdf.addImage(image, 'JPEG', 0, position, pageWidth, imageHeight)
    remainingHeight -= pageHeight
  }

  pdf.save(`${fileName}.pdf`)
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
    downloadBlob(markdownToHtml(markdown), `${fileName}.html`, 'text/html;charset=utf-8')
    return
  }

  if (format === 'pdf') {
    await exportPdf(markdown, fileName)
    return
  }

  await exportDocx(markdown, fileName)
}
