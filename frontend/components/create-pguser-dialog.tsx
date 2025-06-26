"use client"

import type React from "react"

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, Copy, Eye, EyeOff } from "lucide-react"

interface PgUser {
  id: string
  username: string
  permission: "read" | "write"
  status: "active" | "pending"
  createdAt: string
}

interface CreatePgUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated: (user: PgUser) => void
  databaseId: string
}

export function CreatePgUserDialog({ open, onOpenChange, onUserCreated, databaseId }: CreatePgUserDialogProps) {
  const [username, setUsername] = useState("")
  const [permission, setPermission] = useState<"read" | "write">("read")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [createdUser, setCreatedUser] = useState<{
    user: PgUser
    password: string
  } | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const validateUsername = (username: string): string | null => {
    if (!username.trim()) {
      return "Username is required"
    }
    if (username.length < 3) {
      return "Username must be at least 3 characters long"
    }
    if (username.length > 63) {
      return "Username must be less than 64 characters"
    }
    if (!/^[a-z][a-z0-9_]*$/.test(username)) {
      return "Username must start with a letter and contain only lowercase letters, numbers, and underscores"
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationError = validateUsername(username)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setLoading(true)
      setError("")

      // Mock API call - replace with actual API
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const newUser: PgUser = {
        id: Date.now().toString(),
        username: username.trim(),
        permission,
        status: "active",
        createdAt: new Date().toISOString(),
      }

      const generatedPassword =
        Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + "123!"

      setCreatedUser({ user: newUser, password: generatedPassword })
      onUserCreated(newUser)
    } catch (error) {
      setError("Failed to create user. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen)
      if (!newOpen) {
        setUsername("")
        setPermission("read")
        setError("")
        setCreatedUser(null)
        setShowPassword(false)
      }
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (createdUser) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>User Created Successfully</DialogTitle>
            <DialogDescription>
              The PostgreSQL user has been created. Please save the password as it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Make sure to copy and save the password before closing this dialog. You won't be able to see it again.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div>
                <Label>Username</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={createdUser.user.username} readOnly />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(createdUser.user.username)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label>Password</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input type={showPassword ? "text" : "password"} value={createdUser.password} readOnly />
                  <Button variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(createdUser.password)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label>Permission</Label>
                <Input value={createdUser.user.permission} readOnly className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create PostgreSQL User</DialogTitle>
          <DialogDescription>
            Create a new PostgreSQL user for this database. Choose a username and permission level.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="app_user"
                disabled={loading}
                className={error ? "border-red-500" : ""}
              />
              <p className="text-sm text-muted-foreground">
                Must start with a letter and contain only lowercase letters, numbers, and underscores.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="permission">Permission Level</Label>
              <Select value={permission} onValueChange={(value: "read" | "write") => setPermission(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read Only</SelectItem>
                  <SelectItem value="write">Read & Write</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {permission === "read"
                  ? "User can only read data from the database"
                  : "User can read and write data to the database"}
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !username.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
