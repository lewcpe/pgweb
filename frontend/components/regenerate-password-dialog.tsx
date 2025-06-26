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
import { Loader2, AlertCircle, Copy, Eye, EyeOff, Key } from "lucide-react"
import { regeneratePgUserPassword } from "@/lib/api"
import { PgUser } from "@/types/types"

interface RegeneratePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: PgUser | null
  onPasswordRegenerated: (userId: string, newPassword: string) => void
  databaseId: string
}

export function RegeneratePasswordDialog({
  open,
  onOpenChange,
  user,
  onPasswordRegenerated,
  databaseId,
}: RegeneratePasswordDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const handleRegenerate = async () => {
    if (!user) return

    try {
      setLoading(true)
      setError("")

      const { newPassword } = await regeneratePgUserPassword(databaseId, user.pg_user_id)
      setNewPassword(newPassword)
      onPasswordRegenerated(user.pg_user_id, newPassword)
    } catch (error) {
      setError("Failed to regenerate password. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen)
      if (!newOpen) {
        setError("")
        setNewPassword("")
        setShowPassword(false)
      }
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Regenerate Password
          </DialogTitle>
          <DialogDescription>
            Generate a new password for the PostgreSQL user "{user.pg_username}". The old password will no longer work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!newPassword ? (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This action will generate a new password and invalidate the current one. Make sure to update any
                  applications using this user.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={user.pg_username} readOnly />
              </div>

              <div className="space-y-2">
                <Label>Permission</Label>
                <Input value={user.permission_level} readOnly />
              </div>
            </>
          ) : (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Password regenerated successfully! Make sure to copy and save the new password before closing this
                  dialog.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div>
                  <Label>Username</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={user.pg_username} readOnly />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(user.pg_username)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>New Password</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type={showPassword ? "text" : "password"} value={newPassword} readOnly />
                    <Button variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(newPassword)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          {!newPassword ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleRegenerate} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Regenerate Password
              </Button>
            </>
          ) : (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
