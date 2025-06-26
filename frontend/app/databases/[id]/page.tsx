"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Database, Users, Calendar, Activity, Plus, Key, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CreatePgUserDialog } from "@/components/create-pguser-dialog"
import { RegeneratePasswordDialog } from "@/components/regenerate-password-dialog"
import { DeleteDatabaseDialog } from "@/components/delete-database-dialog"
import { DeletePgUserDialog } from "@/components/delete-pguser-dialog"

interface DatabaseDetails {
  id: string
  name: string
  status: "active" | "pending_creation" | "error"
  createdAt: string
  owner: string
  description?: string
}

interface PgUser {
  id: string
  username: string
  permission: "read" | "write"
  status: "active" | "pending"
  createdAt: string
}

export default function DatabaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const databaseId = params.id as string

  const [database, setDatabase] = useState<DatabaseDetails | null>(null)
  const [pgUsers, setPgUsers] = useState<PgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [pgUsersLoading, setPgUsersLoading] = useState(true)
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false)
  const [regeneratePasswordDialog, setRegeneratePasswordDialog] = useState<{
    open: boolean
    user: PgUser | null
  }>({ open: false, user: null })
  const [deletePgUserDialog, setDeletePgUserDialog] = useState<{
    open: boolean
    user: PgUser | null
  }>({ open: false, user: null })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    fetchDatabaseDetails()
    fetchPgUsers()
  }, [databaseId])

  const fetchDatabaseDetails = async () => {
    try {
      setLoading(true)
      // Mock API call - replace with actual API
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const mockDatabase: DatabaseDetails = {
        id: databaseId,
        name: `database-${databaseId}`,
        status: "active",
        createdAt: "2024-01-15T10:30:00Z",
        owner: "john.doe@example.com",
        description: "Production database for the main application",
      }

      setDatabase(mockDatabase)
    } catch (error) {
      console.error("Failed to fetch database details:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPgUsers = async () => {
    try {
      setPgUsersLoading(true)
      // Mock API call - replace with actual API
      await new Promise((resolve) => setTimeout(resolve, 800))

      const mockPgUsers: PgUser[] = [
        {
          id: "1",
          username: "app_user",
          permission: "write",
          status: "active",
          createdAt: "2024-01-15T11:00:00Z",
        },
        {
          id: "2",
          username: "readonly_user",
          permission: "read",
          status: "active",
          createdAt: "2024-01-16T09:30:00Z",
        },
        {
          id: "3",
          username: "analytics_user",
          permission: "read",
          status: "pending",
          createdAt: "2024-01-20T14:15:00Z",
        },
      ]

      setPgUsers(mockPgUsers)
    } catch (error) {
      console.error("Failed to fetch PostgreSQL users:", error)
    } finally {
      setPgUsersLoading(false)
    }
  }

  const handleUserCreated = (newUser: PgUser) => {
    setPgUsers((prev) => [newUser, ...prev])
    setCreateUserDialogOpen(false)
  }

  const handlePasswordRegenerated = (userId: string, newPassword: string) => {
    // In a real app, you might want to show a success message
    setRegeneratePasswordDialog({ open: false, user: null })
  }

  const handleUserDeleted = (userId: string) => {
    setPgUsers((prev) => prev.filter((user) => user.id !== userId))
    setDeletePgUserDialog({ open: false, user: null })
  }

  const handleDatabaseDeleted = () => {
    router.push("/dashboard")
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500"
      case "pending_creation":
      case "pending":
        return "bg-yellow-500"
      case "error":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Active"
      case "pending_creation":
        return "Creating"
      case "pending":
        return "Pending"
      case "error":
        return "Error"
      default:
        return "Unknown"
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  if (!database) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertDescription>Database not found or failed to load.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Database className="h-8 w-8" />
                {database.name}
              </h1>
              <Badge variant="secondary" className={`${getStatusColor(database.status)} text-white`}>
                <Activity className="h-3 w-3 mr-1" />
                {getStatusText(database.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">Database details and user management</p>
          </div>
        </div>
        <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Database
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Database Information</CardTitle>
            <CardDescription>Basic information about this database</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Name:</span>
              <span>{database.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Owner:</span>
              <span>{database.owner}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Created:</span>
              <span>{formatDate(database.createdAt)}</span>
            </div>
            {database.description && (
              <div>
                <span className="font-medium">Description:</span>
                <p className="text-muted-foreground mt-1">{database.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>Overview of database usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">PostgreSQL Users:</span>
              <Badge variant="secondary">{pgUsers.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Active Users:</span>
              <Badge variant="secondary">{pgUsers.filter((u) => u.status === "active").length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Write Access:</span>
              <Badge variant="secondary">{pgUsers.filter((u) => u.permission === "write").length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>PostgreSQL Users</CardTitle>
              <CardDescription>Manage database users and their permissions</CardDescription>
            </div>
            <Button onClick={() => setCreateUserDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pgUsersLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : pgUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No users found</h3>
              <p className="text-muted-foreground mb-4">Create your first PostgreSQL user to get started</p>
              <Button onClick={() => setCreateUserDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-48">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pgUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      <Badge variant={user.permission === "write" ? "default" : "secondary"}>{user.permission}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`${getStatusColor(user.status)} text-white`}>
                        {getStatusText(user.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRegeneratePasswordDialog({ open: true, user })}
                        >
                          <Key className="h-4 w-4 mr-2" />
                          Regenerate Password
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeletePgUserDialog({ open: true, user })}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreatePgUserDialog
        open={createUserDialogOpen}
        onOpenChange={setCreateUserDialogOpen}
        onUserCreated={handleUserCreated}
        databaseId={databaseId}
      />

      <RegeneratePasswordDialog
        open={regeneratePasswordDialog.open}
        onOpenChange={(open) => setRegeneratePasswordDialog({ open, user: null })}
        user={regeneratePasswordDialog.user}
        onPasswordRegenerated={handlePasswordRegenerated}
        databaseId={databaseId}
      />

      <DeleteDatabaseDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        database={database}
        onDatabaseDeleted={handleDatabaseDeleted}
      />

      <DeletePgUserDialog
        open={deletePgUserDialog.open}
        onOpenChange={(open) => setDeletePgUserDialog({ open, user: null })}
        user={deletePgUserDialog.user}
        onUserDeleted={handleUserDeleted}
        databaseId={databaseId}
      />
    </div>
  )
}
