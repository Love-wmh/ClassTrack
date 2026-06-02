import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { FileSelector } from '~/components/common/FileSelector'
import { useClassStore } from '~/store'
import { parsers, getParserById } from '~/lib/parsers'
import { getBookmarkletAdapterBySchoolId } from '~/lib/bookmarklets'

const IMPORT_STEPS = ['安装书签脚本', '打开课表页面', '上传 JSON 文件'] as const

type ImportStep = 0 | 1 | 2

export default function ImportDialog() {
  const { showImportDialog, school, selectedSchool, selectedParserId, setShowImportDialog, setSelectedParserId, importClasses, setIsInitialized } = useClassStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [currentStep, setCurrentStep] = useState<ImportStep>(0)
  const importSchool = selectedSchool || school
  const bookmarkletAdapter = getBookmarkletAdapterBySchoolId(importSchool?.id)
  const [term, setTerm] = useState(bookmarkletAdapter?.defaultTerm || '')
  const bookmarkletHref = useMemo(() => bookmarkletAdapter?.createScript({ term }) || '', [bookmarkletAdapter, term])

  useEffect(() => {
    if (showImportDialog && importSchool && !selectedParserId) {
      const matchedParser = getParserById(importSchool.id)
      if (matchedParser) {
        setSelectedParserId(matchedParser.id)
      }
    }
  }, [showImportDialog, importSchool, selectedParserId, setSelectedParserId])

  useEffect(() => {
    if (showImportDialog) {
      setCurrentStep(0)
      setSelectedFile(null)
      setTerm(bookmarkletAdapter?.defaultTerm || '')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [showImportDialog, bookmarkletAdapter])

  const setBookmarkletRef = useCallback((node: HTMLAnchorElement | null) => {
    if (node && bookmarkletHref) {
      node.setAttribute('href', bookmarkletHref)
    }
  }, [bookmarkletHref])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
  }

  const handleCopyBookmarklet = async () => {
    if (!bookmarkletHref) return

    try {
      await navigator.clipboard.writeText(bookmarkletHref)
      toast.success('书签脚本已复制')
    } catch (err) {
      toast.error('复制失败，请手动拖拽书签按钮')
      console.error(err)
    }
  }

  const handleOpenEducationalSystem = () => {
    if (!bookmarkletAdapter) return
    window.open(bookmarkletAdapter.educationalSystemUrl, '_blank', 'noopener,noreferrer')
    setCurrentStep(2)
  }

  const handleImport = async () => {
    if (!selectedFile || !selectedParserId) {
      toast.error('请选择文件和解析器')
      return
    }

    try {
      const text = await selectedFile.text()
      const data = JSON.parse(text)
      const parser = getParserById(selectedParserId)

      if (!parser) {
        throw new Error('解析器未找到')
      }

      const classes = importClasses(data, parser.parse)
      if (classes.length === 0) {
        throw new Error('未解析到课程数据')
      }

      setShowImportDialog(false)
      setIsInitialized(true)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      toast.error('文件解析失败，请检查是否选择了正确的解析器')
      console.error(err)
    }
  }

  const renderStepContent = () => {
    if (!bookmarkletAdapter) {
      return (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          当前学校暂未配置书签脚本导出器，请先让贡献者在 <code className="rounded bg-muted px-1 py-0.5">app/lib/bookmarklets</code> 中新增适配器。
        </div>
      )
    }

    if (currentStep === 0) {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="term">学年学期代码</Label>
            <Input id="term" value={term} placeholder={bookmarkletAdapter.defaultTerm} onChange={(event) => setTerm(event.target.value)} />
            <p className="text-xs text-muted-foreground">该参数会写入书签脚本，重新修改后需要重新拖拽或复制书签。</p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="space-y-1">
              <Label>{bookmarkletAdapter.name}</Label>
              <p className="text-sm text-muted-foreground">{bookmarkletAdapter.description}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary">
                <a ref={setBookmarkletRef} href="#" onClick={(event) => event.preventDefault()}>
                  拖到书签栏保存
                </a>
              </Button>
              <Button type="button" variant="outline" onClick={handleCopyBookmarklet}>
                复制书签脚本
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">如果看不到书签栏，可先显示浏览器书签栏，再把按钮拖到书签栏。</p>
          </div>
        </div>
      )
    }

    if (currentStep === 1) {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
            <p className="font-medium text-foreground">操作步骤</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>点击下方按钮打开学校教务系统课程表页面。</li>
              <li>在新标签页登录，并确认已经进入课程表页面。</li>
              <li>点击浏览器书签栏里的“拖到书签栏保存”脚本。</li>
              <li>脚本会自动下载课程表 JSON 文件。</li>
              <li>回到 ClassTrack 上传该 JSON 文件。</li>
            </ol>
          </div>
          <Button type="button" className="w-full" onClick={handleOpenEducationalSystem}>
            打开课程表页面
          </Button>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file">课程表 JSON 文件</Label>
          <FileSelector
            ref={fileInputRef}
            id="file"
            accept=".json"
            fileName={selectedFile?.name}
            placeholder="请选择书签脚本导出的 JSON 文件"
            onChange={handleFileChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="parser">解析器</Label>
          <Select value={selectedParserId || ''} onValueChange={setSelectedParserId}>
            <SelectTrigger>
              <SelectValue placeholder="请选择解析器" />
            </SelectTrigger>
            <SelectContent>
              {parsers.map((parser) => (
                <SelectItem key={parser.id} value={parser.id}>
                  {parser.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedParserId && <p className="text-sm text-muted-foreground">{parsers.find((parser) => parser.id === selectedParserId)?.description}</p>}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>通过课程表 JSON 导入</DialogTitle>
          <DialogDescription>安装学校专属书签脚本，导出教务系统课程响应 JSON，再解析为 ClassTrack 课程。</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {IMPORT_STEPS.map((step, index) => (
              <div key={step} className={`rounded-md border px-3 py-2 text-sm ${currentStep === index ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground'}`}>
                <span className="mr-2 font-medium">{index + 1}</span>
                {step}
              </div>
            ))}
          </div>

          {renderStepContent()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowImportDialog(false)}>
            取消
          </Button>
          {currentStep > 0 && (
            <Button variant="outline" onClick={() => setCurrentStep((currentStep - 1) as ImportStep)}>
              上一步
            </Button>
          )}
          {currentStep < 2 ? (
            <Button onClick={() => setCurrentStep((currentStep + 1) as ImportStep)} disabled={!bookmarkletAdapter || (currentStep === 0 && !term)}>
              下一步
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={!selectedFile || !selectedParserId}>
              导入
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
