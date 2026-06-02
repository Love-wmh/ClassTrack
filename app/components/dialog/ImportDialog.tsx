import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { BackupImportStep } from '~/components/import-flow/BackupImportStep'
import { BookmarkletInstallStep } from '~/components/import-flow/BookmarkletInstallStep'
import { BookmarkletRunStep } from '~/components/import-flow/BookmarkletRunStep'
import { ImportSchoolStep } from '~/components/import-flow/ImportSchoolStep'
import { ParserImportStep } from '~/components/import-flow/ParserImportStep'
import { Stepper, StepperActions } from '~/components/stepper'
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
      return <BookmarkletRunStep onOpenEducationalSystem={importFlow.handleOpenEducationalSystem} />
    }

    return (
      <ParserImportStep
        inputRef={importFlow.parserFileInputRef}
        fileName={importFlow.parserFile?.name}
        selectedParserId={importFlow.selectedParserId}
        onFileChange={importFlow.handleParserFileChange}
        onParserChange={importFlow.setSelectedParserId}
      />
    )
  }

  return (
    <Dialog open={importFlow.showImportDialog} onOpenChange={importFlow.handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入课程数据</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <Stepper steps={importFlow.steps} currentStep={importFlow.currentStep} />
          {renderStepContent()}
        </div>

        <DialogFooter>
          <StepperActions
            canGoBack={importFlow.canGoBack}
            isLastStep={importFlow.isLastStep}
            primaryLabel={importFlow.primaryLabel}
            primaryDisabled={importFlow.primaryDisabled}
            onBack={importFlow.goBack}
            onPrimary={importFlow.handlePrimaryAction}
            onCancel={() => importFlow.handleOpenChange(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
