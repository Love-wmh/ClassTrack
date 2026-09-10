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

async function exportPdf(markdown: string, fileName: string) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const text = markdownToPlainText(markdown)
  const lines = pdf.splitTextToSize(text || '暂无课程信息', 515)
  pdf.setFontSize(12)
  pdf.text(lines, 40, 48)
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
