import { MarkdownEditor } from '~/components/markdown/MarkdownEditor'
import { SubstituteToolbar } from './components/SubstituteToolbar'
import { useSubstituteManagement } from './hooks/useSubstituteManagement'

export default function SubstituteManagementPage() {
  const {
    markdown,
    previewMarkdown,
    previewNonce,
    editorNonce,
    selectedDates,
    exportFormat,
    isExporting,
    selectedDateCount,
    setMarkdown,
    setSelectedDates,
    setExportFormat,
    handleImportTomorrow,
    handleImportSelectedDates,
    handleExport,
  } = useSubstituteManagement()

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden bg-background p-5 md:p-6">
      <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-col gap-4">
        <SubstituteToolbar
          selectedDates={selectedDates}
          exportFormat={exportFormat}
          isExporting={isExporting}
          selectedDateCount={selectedDateCount}
          onSelectedDatesChange={setSelectedDates}
          onExportFormatChange={setExportFormat}
          onImportTomorrow={handleImportTomorrow}
          onImportSelectedDates={handleImportSelectedDates}
          onExport={handleExport}
        />

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-xs">
            <div className="border-b px-4 py-3 text-sm font-medium">编辑</div>
            <MarkdownEditor
              key={`editor-${editorNonce}`}
              value={markdown}
              onChange={setMarkdown}
              className="flex-1"
              placeholder="导入课程后会在这里生成代课记录，也可以继续手动编辑。"
            />
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-xs">
            <div className="border-b px-4 py-3 text-sm font-medium">预览</div>
            <MarkdownEditor key={`preview-${previewNonce}`} value={previewMarkdown} readonly className="flex-1" placeholder="暂无内容" />
          </div>
        </div>
      </div>
    </div>
  )
}
