import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { BackupImportStep } from '~/components/import-flow/BackupImportStep'
import { BookmarkletInstallStep } from '~/components/import-flow/BookmarkletInstallStep'
import { BookmarkletRunStep } from '~/components/import-flow/BookmarkletRunStep'
import { ImportCompleteStep } from '~/components/import-flow/ImportCompleteStep'
import { ImportSchoolStep } from '~/components/import-flow/ImportSchoolStep'
import { ParserImportStep } from '~/components/import-flow/ParserImportStep'
import { Stepper } from '~/components/import-flow/Stepper'
import { useImportFlow } from '~/components/import-flow/useImportFlow'

export default function ImportDialog() {
  const importFlow = useImportFlow()

  const renderStepContent = () => {
    if (importFlow.currentStep === 0) {
      return (
        <ImportSchoolStep
          selectedSchool={importFlow.activeSchool}
          selectedImportMethod={importFlow.selectedImportMethod}
          onSchoolChange={importFlow.setSelectedSchool}
          onImportMethodChange={importFlow.setSelectedImportMethod}
        />
      )
    }

    if (importFlow.isBackupImport) {
      if (importFlow.isLastStep) {
        return <ImportCompleteStep title={importFlow.completeMessage.title} description={importFlow.completeMessage.description} />
      }

      return (
        <BackupImportStep
          inputRef={importFlow.backupFileInputRef}
          fileName={importFlow.backupFile?.name}
          onChange={importFlow.handleBackupFileChange}
        />
      )
    }

    if (importFlow.currentStep === 1) {
      return (
        <BookmarkletInstallStep
          adapter={importFlow.bookmarkletAdapter}
          term={importFlow.term}
          bookmarkletHref={importFlow.bookmarkletHref}
          onTermChange={importFlow.setTerm}
          onCopyBookmarklet={importFlow.handleCopyBookmarklet}
        />
      )
    }

    if (importFlow.currentStep === 2) {
      return (
        <div className="space-y-4">
          <BookmarkletRunStep onOpenEducationalSystem={importFlow.handleOpenEducationalSystem} />
          <ParserImportStep
            inputRef={importFlow.parserFileInputRef}
            fileName={importFlow.parserFile?.name}
            selectedParserId={importFlow.selectedParserId}
            onFileChange={importFlow.handleParserFileChange}
            onParserChange={importFlow.setSelectedParserId}
          />
        </div>
      )
    }

    return <ImportCompleteStep title={importFlow.completeMessage.title} description={importFlow.completeMessage.description} />
  }

  return (
    <Dialog open={importFlow.showImportDialog} onOpenChange={importFlow.handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入课程数据</DialogTitle>
          <DialogDescription>选择学校与导入方式，并按步骤完成课程数据导入。</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <Stepper steps={importFlow.steps} currentStep={importFlow.currentStep} />
          {renderStepContent()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => importFlow.handleOpenChange(false)}>
            取消
          </Button>
          {importFlow.canGoBack && !importFlow.isLastStep && (
            <Button variant="outline" onClick={importFlow.goBack}>
              上一步
            </Button>
          )}
          <Button onClick={importFlow.handlePrimaryAction} disabled={importFlow.primaryDisabled}>
            {importFlow.primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
