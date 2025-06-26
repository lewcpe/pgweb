"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, DatabaseIcon, Calendar, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CreateDatabaseDialog } from "@/components/create-database-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface DatabaseType {
  id: string
  name: string
  status: "active" | "pending_creation" | "error"
  createdAt: string
  owner: string
}

export default function DashboardPage() {
  const [databases, setDatabases] = useState<DatabaseType[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    fetchDatabases()
  }, [])

  const fetchDatabases = async () => {
    try {
      setLoading(true)
      // Mock API call - replace with actual API
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const mockDatabases: DatabaseType[] = [
        {
          id: "1",
          name: "production-db",
          status: "active",
          createdAt: "2024-01-15T10:30:00Z",
          owner: "john.doe@example.com",
        },
        {
          id: "2",
          name: "staging-db",
          status: "active",
          createdAt: "2024-01-10T14:20:00Z",
          owner: "john.doe@example.com",
        },
        {
          id: "3",
          name: "test-db",
          status: "pending_creation",
          createdAt: "2024-01-20T09:15:00Z",
          owner: "john.doe@example.com",
        },
      ]
      setDatabases(mockDatabases)
    } catch (error) {
      console.error("Failed to fetch databases:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDatabaseCreated = (newDatabase: DatabaseType) => {
    setDatabases((prev) => [newDatabase, ...prev])
    setCreateDialogOpen(false)
  }

  const getStatusColor = (status: DatabaseType["status"]) => {
    switch (status) {
      case "active":
        return "bg-green-500"
      case "pending_creation":
        return "bg-yellow-500"
      case "error":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusText = (status: DatabaseType["status"]) => {
    switch (status) {
      case "active":
        return "Active"
      case "pending_creation":
        return "Creating"
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Databases</h1>
          <p className="text-muted-foreground mt-2">Manage your PostgreSQL databases and users</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Database
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardHeader>
            <CardTitle>Databases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : databases.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <DatabaseIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No databases found</h3>
            <p className="text-muted-foreground mb-4">Get started by creating your first PostgreSQL database</p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Database
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0">
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {databases.map((database) => (
                  <TableRow key={database.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{database.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`${getStatusColor(database.status)} text-white`}>
                        <Activity className="h-3 w-3 mr-1" />
                        {getStatusText(database.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{database.owner}</TableCell>
                    <TableCell>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 mr-2" />
                        {formatDate(database.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/databases/${database.id}`}>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateDatabaseDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onDatabaseCreated={handleDatabaseCreated}
      />
    </div>
  )
}
