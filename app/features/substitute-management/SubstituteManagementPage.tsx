import { MarkdownEditor } from '~/components/markdown/MarkdownEditor'
import { Button } from '~/components/ui/button'
import { useIsMobile } from '~/hooks/use-mobile'
import { SubstituteToolbar } from './components/SubstituteToolbar'
import { useSubstituteManagement } from './hooks/useSubstituteManagement'

export default function SubstituteManagementPage() {
  const isMobile = useIsMobile()
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
    <div className="substitute-management-page relative flex h-full min-w-0 w-full flex-1 flex-col overflow-hidden bg-background p-3 sm:p-5 md:p-6">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 overflow-y-auto sm:gap-4 lg:overflow-hidden">
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

        <div className="grid min-h-0 flex-1 gap-3 sm:gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-card shadow-xs lg:min-h-0">
            <div className="hidden border-b px-4 py-3 text-sm font-medium md:block">编辑</div>
            <MarkdownEditor
              key={`editor-${editorNonce}-${isMobile ? 'mobile' : 'desktop'}`}
              value={markdown}
              onChange={setMarkdown}
              compact={isMobile}
              className="flex-1"
              placeholder="导入课程后会在这里生成代课记录，也可以继续手动编辑。"
            />
          </div>
          <div className="hidden min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-md border bg-card shadow-xs md:flex lg:min-h-0">
            <div className="border-b px-4 py-3 text-sm font-medium">预览</div>
            <MarkdownEditor key={`preview-${previewNonce}`} value={previewMarkdown} readonly className="flex-1" placeholder="暂无内容" />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="h-10 min-h-11 w-full shrink-0 bg-card font-medium text-foreground shadow-xs hover:bg-muted md:hidden"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? '导出中...' : '导出当前记录'}
        </Button>
      </div>
    </div>
  )
}
