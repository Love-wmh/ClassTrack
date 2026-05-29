import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { FileSelector } from '~/components/common/FileSelector'
import { useClassStore } from '~/store'
import { parsers, getParserById } from '~/lib/parsers'

export default function ImportDialog() {
  const { showImportDialog, selectedSchool, selectedParserId, setShowImportDialog, setSelectedParserId, importClasses, setIsInitialized } = useClassStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    if (showImportDialog && selectedSchool && !selectedParserId) {
      const matchedParser = getParserById(selectedSchool.id)
      if (matchedParser) {
        setSelectedParserId(matchedParser.id)
      }
    }
  }, [showImportDialog, selectedSchool, selectedParserId, setSelectedParserId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
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

  return (
    <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导入课程表</DialogTitle>
          <DialogDescription>请选择您的课程表JSON文件，并选择对应的解析器</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">课程表文件</Label>
            <FileSelector
              ref={fileInputRef}
              id="file"
              accept=".json"
              fileName={selectedFile?.name}
              placeholder="请选择课程表 JSON 文件"
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
            {selectedParserId && (
              <p className="text-sm text-muted-foreground">{parsers.find((p) => p.id === selectedParserId)?.description}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowImportDialog(false)}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={!selectedFile || !selectedParserId}>
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
