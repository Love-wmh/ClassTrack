import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Upload } from 'lucide-react'
import { useClassStore } from '~/store'
import { parsers, getParserById } from '~/lib/parsers'

export default function ImportDialog() {
  const { showImportDialog, selectedSchool, selectedParserId, setShowImportDialog, setSelectedParserId, importClasses, setIsInitialized } = useClassStore()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
  }

  const handleImport = async () => {
    if (!selectedFile || !selectedParserId) {
      setError('请选择文件和解析器')
      return
    }

    try {
      const text = await selectedFile.text()
      const data = JSON.parse(text)
      const parser = getParserById(selectedParserId)

      if (!parser) {
        throw new Error('解析器未找到')
      }

      importClasses(data, parser.parse)
      setShowImportDialog(false)
      setIsInitialized(true)
      setSelectedFile(null)
      setError(null)
    } catch (err) {
      setError('文件解析失败，请检查文件格式')
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
            <div className="flex items-center gap-2">
              <Input id="file" type="file" accept=".json" onChange={handleFileChange} className="cursor-pointer" />
            </div>
            {selectedFile && <p className="text-sm text-muted-foreground">已选择: {selectedFile.name}</p>}
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

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowImportDialog(false)}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={!selectedFile || !selectedParserId}>
            <Upload className="w-4 h-4 mr-2" />
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
