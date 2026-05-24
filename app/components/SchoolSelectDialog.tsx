import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { useClassStore } from '~/store/classStore'
import { schools } from '~/lib/parsers'

export default function SchoolSelectDialog() {
  const { showSchoolDialog, selectedSchool, setShowSchoolDialog, setSelectedSchool, setSchool, setShowImportDialog, setSelectedParserId } =
    useClassStore()

  const handleSchoolChange = (schoolId: string) => {
    const school = schools.find((s) => s.id === schoolId)
    setSelectedSchool(school || null)
    if (school) {
      setSelectedParserId(school.parserId)
    }
  }

  const handleConfirm = () => {
    if (selectedSchool) {
      setSchool(selectedSchool)
      setShowSchoolDialog(false)
      setShowImportDialog(true)
    }
  }

  return (
    <Dialog open={showSchoolDialog} onOpenChange={setShowSchoolDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择学校</DialogTitle>
          <DialogDescription>请选择您的学校，以便我们为您提供合适的课程表解析器</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="school">学校</Label>
            <Select value={selectedSchool?.id} onValueChange={handleSchoolChange}>
              <SelectTrigger>
                <SelectValue placeholder="请选择学校" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleConfirm} disabled={!selectedSchool}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
