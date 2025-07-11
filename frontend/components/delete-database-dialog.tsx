"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertTriangle } from "lucide-react"
import { deleteDatabase } from "@/lib/api"
import { DatabaseDetails } from "@/types/types"

interface DeleteDatabaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  database: DatabaseDetails | null
  onDatabaseDeleted: () => void
}

export function DeleteDatabaseDialog({ open, onOpenChange, database, onDatabaseDeleted }: DeleteDatabaseDialogProps) {
  const [confirmationText, setConfirmationText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const isConfirmationValid = confirmationText === database?.pg_database_name

  const handleDelete = async () => {
    if (!isConfirmationValid) return

    try {
      setLoading(true)
      setError("")

      if (database) {
        await deleteDatabase(database.database_id)
        onDatabaseDeleted()
      }
    } catch (error) {
      setError("Failed to delete database. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen)
      if (!newOpen) {
        setConfirmationText("")
        setError("")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete Database
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the database and all its data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> This will permanently delete the database "{database?.pg_database_name}" and all its data.
              This action cannot be undone.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="confirmation">
              Type <strong>{database?.pg_database_name}</strong> to confirm deletion
            </Label>
            <Input
              id="confirmation"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={database?.pg_database_name}
              disabled={loading}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading || !isConfirmationValid}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Database
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
