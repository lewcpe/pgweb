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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertTriangle, Trash2 } from "lucide-react"
import { deletePgUser } from "@/lib/api"
import { PgUser } from "@/types/types"

interface DeletePgUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: PgUser | null
  onUserDeleted: (userId: string) => void
  databaseId: string
}

export function DeletePgUserDialog({ open, onOpenChange, user, onUserDeleted, databaseId }: DeletePgUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleDelete = async () => {
    if (!user) return

    try {
      setLoading(true)
      setError("")

      await deletePgUser(databaseId, user.pg_user_id)
      onUserDeleted(user.pg_user_id)
      onOpenChange(false)
    } catch (error) {
      setError("Failed to delete user. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen)
      if (!newOpen) {
        setError("")
      }
    }
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Delete PostgreSQL User
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the PostgreSQL user and revoke all access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> Deleting the user "{user.pg_username}" will permanently remove their access to the
              database. Any applications using this user will lose connectivity.
            </AlertDescription>
          </Alert>

          <div className="space-y-3 p-4 bg-muted rounded-lg">
            <div className="flex justify-between">
              <span className="font-medium">Username:</span>
              <span>{user.pg_username}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Permission:</span>
              <span className="capitalize">{user.permission_level}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Status:</span>
              <span className="capitalize">{user.status}</span>
            </div>
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
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
