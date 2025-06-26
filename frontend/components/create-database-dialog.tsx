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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle } from "lucide-react"

interface Database {
  id: string
  name: string
  status: "active" | "pending_creation" | "error"
  createdAt: string
  owner: string
}

interface CreateDatabaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDatabaseCreated: (database: Database) => void
}

export function CreateDatabaseDialog({ open, onOpenChange, onDatabaseCreated }: CreateDatabaseDialogProps) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const validateDatabaseName = (name: string): string | null => {
    if (!name.trim()) {
      return "Database name is required"
    }
    if (name.length < 3) {
      return "Database name must be at least 3 characters long"
    }
    if (name.length > 63) {
      return "Database name must be less than 64 characters"
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
      return "Database name must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores"
    }
    if (name.startsWith("pg_") || name.startsWith("template")) {
      return "Database name cannot start with reserved prefixes (pg_, template)"
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationError = validateDatabaseName(name)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setLoading(true)
      setError("")

      // Mock API call - replace with actual API
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const newDatabase: Database = {
        id: Date.now().toString(),
        name: name.trim(),
        status: "pending_creation",
        createdAt: new Date().toISOString(),
        owner: "john.doe@example.com",
      }

      onDatabaseCreated(newDatabase)
      setName("")
    } catch (error) {
      setError("Failed to create database. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen)
      if (!newOpen) {
        setName("")
        setError("")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Database</DialogTitle>
          <DialogDescription>
            Create a new PostgreSQL database. Choose a unique name that follows the naming conventions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Database Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-database"
                disabled={loading}
                className={error ? "border-red-500" : ""}
              />
              <p className="text-sm text-muted-foreground">
                Must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores.
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
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Database
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
