import { http, HttpResponse } from 'msw'
import { DatabaseDetails, PgUser, PgUserWithPassword, BackupJob } from '@/types/types'

const mockDatabases: DatabaseDetails[] = [
  {
    database_id: 'db-001',
    owner_user_id: 'user-123',
    owner_email: 'alice@example.com',
    pg_database_name: 'production_db',
    status: 'active',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
  },
  {
    database_id: 'db-002',
    owner_user_id: 'user-456',
    owner_email: 'bob@example.com',
    pg_database_name: 'staging_db',
    status: 'active',
    created_at: '2024-02-20T14:45:00Z',
    updated_at: '2024-02-20T14:45:00Z',
  },
  {
    database_id: 'db-003',
    owner_user_id: 'user-123',
    owner_email: 'alice@example.com',
    pg_database_name: 'test_db',
    status: 'pending_creation',
    created_at: '2024-03-10T09:00:00Z',
    updated_at: '2024-03-10T09:00:00Z',
  },
  {
    database_id: 'db-current',
    owner_user_id: 'current-user',
    owner_email: 'current@example.com',
    pg_database_name: 'my_current_db',
    status: 'active',
    created_at: '2024-03-15T08:00:00Z',
    updated_at: '2024-03-15T08:00:00Z',
  },
]

const mockUsers: Record<string, PgUser[]> = {
  'db-001': [
    {
      pg_user_id: 'pu-001',
      pg_username: 'app_readonly',
      permission_level: 'read',
      status: 'active',
      created_at: '2024-01-15T11:00:00Z',
    },
    {
      pg_user_id: 'pu-002',
      pg_username: 'app_admin',
      permission_level: 'write',
      status: 'active',
      created_at: '2024-01-15T11:05:00Z',
    },
  ],
  'db-002': [
    {
      pg_user_id: 'pu-003',
      pg_username: 'staging_user',
      permission_level: 'write',
      status: 'active',
      created_at: '2024-02-20T15:00:00Z',
    },
  ],
  'db-current': [
    {
      pg_user_id: 'pu-101',
      pg_username: 'readonly_user',
      permission_level: 'read',
      status: 'active',
      created_at: '2024-03-15T08:30:00Z',
    },
    {
      pg_user_id: 'pu-102',
      pg_username: 'admin_user',
      permission_level: 'write',
      status: 'active',
      created_at: '2024-03-15T08:35:00Z',
    },
  ],
}

export const handlers = [
  http.get('/api/databases', async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return HttpResponse.json(mockDatabases)
  }),

  http.get('/api/databases/:id', async ({ params }) => {
    await new Promise(resolve => setTimeout(resolve, 300))
    const db = mockDatabases.find(d => d.database_id === params.id)
    if (!db) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json(db)
  }),

  http.post('/api/databases', async ({ request }) => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const body = await request.json() as { name: string }
    const newDb: DatabaseDetails = {
      database_id: `db-${Date.now()}`,
      owner_user_id: 'current-user',
      owner_email: 'current@example.com',
      pg_database_name: body.name,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockDatabases.push(newDb)
    return HttpResponse.json(newDb, { status: 201 })
  }),

  http.delete('/api/databases/:id', async ({ params }) => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const index = mockDatabases.findIndex(d => d.database_id === params.id)
    if (index !== -1) {
      mockDatabases.splice(index, 1)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/databases/:id/pgusers', async ({ params }) => {
    await new Promise(resolve => setTimeout(resolve, 300))
    const users = mockUsers[params.id as string] || []
    return HttpResponse.json(users)
  }),

  http.post('/api/databases/:id/pgusers', async ({ params, request }) => {
    await new Promise(resolve => setTimeout(resolve, 800))
    const body = await request.json() as { username: string; permission: 'read' | 'write' }
    const newUser: PgUserWithPassword = {
      pg_user_id: `pu-${Date.now()}`,
      pg_username: body.username,
      permission_level: body.permission,
      status: 'active',
      created_at: new Date().toISOString(),
      password: `mock-password-${Date.now()}`,
    }
    if (!mockUsers[params.id as string]) {
      mockUsers[params.id as string] = []
    }
    mockUsers[params.id as string]!.push(newUser)
    return HttpResponse.json(newUser, { status: 201 })
  }),

  http.post('/api/databases/:id/pgusers/:userId/regenerate-password', async ({ params }) => {
    await new Promise(resolve => setTimeout(resolve, 600))
    const users = mockUsers[params.id as string] || []
    const user = users.find(u => u.pg_user_id === params.userId)
    if (!user) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json({ new_password: `new-password-${Date.now()}` })
  }),

  http.delete('/api/databases/:id/pgusers/:userId', async ({ params }) => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const users = mockUsers[params.id as string] || []
    const index = users.findIndex(u => u.pg_user_id === params.userId)
    if (index !== -1) {
      users.splice(index, 1)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/databases/:id/backup', async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const job: BackupJob = {
      backup_job_id: `bj-${Date.now()}`,
      database_id: 'db-001',
      status: 'pending',
      file_size: 0,
      created_at: new Date().toISOString(),
    }
    return HttpResponse.json(job, { status: 202 })
  }),

  http.get('/api/databases/:id/backup/:jobId', async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
    const job: BackupJob = {
      backup_job_id: 'bj-completed',
      database_id: 'db-001',
      status: 'completed',
      file_size: 1024 * 512,
      created_at: new Date(Date.now() - 10000).toISOString(),
      completed_at: new Date().toISOString(),
    }
    return HttpResponse.json(job)
  }),

  http.get('/api/databases/:id/backup/:jobId/download', async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const mockDump = new Uint8Array([0x50, 0x47, 0x44, 0x4d, 0x50]) // "PGDMP" magic bytes
    return new HttpResponse(mockDump, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename=mock_db.dump',
      },
    })
  }),

  http.post('/api/databases/:id/restore', async () => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    return HttpResponse.json({ message: 'Database restored successfully' })
  }),
]