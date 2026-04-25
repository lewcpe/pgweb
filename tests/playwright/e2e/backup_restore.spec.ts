import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const AUTH_EMAIL = 'test@example.com';
const authHeaders = { 'X-Forwarded-Email': AUTH_EMAIL };
const PG_ADMIN_DSN = 'postgres://test_admin:test_password@localhost:5432';

test.describe('Database Backup and Restore E2E', () => {
  const timestamp = Date.now();
  const testDbName = `bkpdb_${timestamp}`;
  const pgUsername = `appuser_${timestamp}`;
  let testDbId: string;
  let pgUserId: string;
  let pgPassword: string;
  let backupJobId: string;

  const adminClient = () =>
    new Client({
      connectionString: `${PG_ADMIN_DSN}/${testDbName}`,
    });

  test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/databases', {
      data: { name: testDbName },
      headers: authHeaders,
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    testDbId = body.database_id;
  });

  test.afterAll(async ({ request }) => {
    if (testDbId) {
      await request.delete(`/api/databases/${testDbId}`, { headers: authHeaders });
    }
  });

  test('should create a database and return owner email', async ({ request }) => {
    const response = await request.get(`/api/databases/${testDbId}`, {
      headers: authHeaders,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.pg_database_name).toBe(testDbName);
    expect(body.status).toBe('active');
    expect(body.owner_email).toBe(AUTH_EMAIL);
  });

  test('should create a PG user in the database', async ({ request }) => {
    const response = await request.post(`/api/databases/${testDbId}/pgusers`, {
      data: { username: pgUsername, permission_level: 'write' },
      headers: authHeaders,
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('pg_user_id');
    expect(body.pg_username).toBe(pgUsername);
    expect(body.permission_level).toBe('write');
    expect(body).toHaveProperty('password');
    pgUserId = body.pg_user_id;
    pgPassword = body.password;
  });

  test('should list PG users including the created user', async ({ request }) => {
    const response = await request.get(`/api/databases/${testDbId}/pgusers`, {
      headers: authHeaders,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.some((u: any) => u.pg_user_id === pgUserId)).toBe(true);
  });

  test('should create a table and insert records', async () => {
    const client = adminClient();
    await client.connect();

    await client.query(`
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        in_stock BOOLEAN DEFAULT true
      )
    `);

    const { rows: tableCheck } = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products')"
    );
    expect(tableCheck[0].exists).toBe(true);

    await client.query(`
      INSERT INTO products (name, price, in_stock) VALUES
        ('Widget A', 19.99, true),
        ('Widget B', 29.99, true),
        ('Widget C', 9.50, false)
    `);

    const { rows } = await client.query('SELECT * FROM products ORDER BY id');
    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe('Widget A');
    expect(rows[0].price).toBe('19.99');
    expect(rows[1].name).toBe('Widget B');
    expect(rows[2].name).toBe('Widget C');
    expect(rows[2].in_stock).toBe(false);

    await client.end();
  });

  test('should verify data exists before backup', async () => {
    const client = adminClient();
    await client.connect();

    const { rows } = await client.query('SELECT count(*) FROM products');
    expect(parseInt(rows[0].count)).toBe(3);

    await client.end();
  });

  test('should initiate a backup job', async ({ request }) => {
    const response = await request.post(`/api/databases/${testDbId}/backup`, {
      headers: authHeaders,
    });
    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body).toHaveProperty('backup_job_id');
    expect(body.database_id).toBe(testDbId);
    expect(['pending', 'in_progress']).toContain(body.status);
    backupJobId = body.backup_job_id;
  });

  test('should reject duplicate backup while one is in progress', async ({ request }) => {
    const response = await request.post(`/api/databases/${testDbId}/backup`, {
      headers: authHeaders,
    });
    expect(response.status()).toBe(409);
  });

  test('should reject restore while backup is in progress', async ({ request }) => {
    const response = await request.post(`/api/databases/${testDbId}/restore`, {
      headers: {
        ...authHeaders,
        'Content-Type': 'application/octet-stream',
      },
      data: Buffer.from('fake-dump-data'),
    });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('backup');
  });

  test('should poll backup status until completed', async ({ request }) => {
    test.setTimeout(120_000);

    let status = 'pending';
    let attempts = 0;
    const maxAttempts = 60;

    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
      const response = await request.get(
        `/api/databases/${testDbId}/backup/${backupJobId}`,
        { headers: authHeaders },
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      status = body.status;
      attempts++;
    }

    expect(status).toBe('completed');
  });

  test('should download the backup file', async ({ request }) => {
    const response = await request.get(
      `/api/databases/${testDbId}/backup/${backupJobId}/download`,
      { headers: authHeaders },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/octet-stream');
    expect(response.headers()['content-disposition']).toContain(`${testDbName}.dump`);

    const body = await response.body();
    expect(body.length).toBeGreaterThan(0);

    const magic = body.subarray(0, 5).toString();
    expect(magic).toContain('PGDMP');
  });

  test('should restore the database from the downloaded dump', async ({ request }) => {
    test.setTimeout(120_000);

    const downloadResponse = await request.get(
      `/api/databases/${testDbId}/backup/${backupJobId}/download`,
      { headers: authHeaders },
    );
    expect(downloadResponse.status()).toBe(200);
    const dumpData = await downloadResponse.body();

    const restoreResponse = await request.post(
      `/api/databases/${testDbId}/restore`,
      {
        headers: {
          ...authHeaders,
          'Content-Type': 'application/octet-stream',
        },
        data: dumpData,
      },
    );
    expect(restoreResponse.status()).toBe(202);
    const job = await restoreResponse.json();
    expect(job).toHaveProperty('backup_job_id');
    expect(job.type).toBe('restore');
    expect(['pending', 'in_progress']).toContain(job.status);

    // Reject backup while restore is in progress
    const backupWhileRestore = await request.post(`/api/databases/${testDbId}/backup`, {
      headers: authHeaders,
    });
    expect(backupWhileRestore.status()).toBe(409);
    const conflictBody = await backupWhileRestore.json();
    expect(conflictBody.error).toContain('restore');

    // Poll until restore completes
    let status = job.status;
    let attempts = 0;
    const maxAttempts = 60;
    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollResponse = await request.get(
        `/api/databases/${testDbId}/restore/${job.backup_job_id}`,
        { headers: authHeaders },
      );
      expect(pollResponse.status()).toBe(200);
      const pollBody = await pollResponse.json();
      status = pollBody.status;
      attempts++;
    }
    expect(status).toBe('completed');
  });

  test('should verify table and records survive restore', async () => {
    const client = adminClient();
    await client.connect();

    const { rows } = await client.query('SELECT * FROM products ORDER BY id');
    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe('Widget A');
    expect(rows[0].price).toBe('19.99');
    expect(rows[0].in_stock).toBe(true);
    expect(rows[1].name).toBe('Widget B');
    expect(rows[1].price).toBe('29.99');
    expect(rows[2].name).toBe('Widget C');
    expect(rows[2].price).toBe('9.50');
    expect(rows[2].in_stock).toBe(false);

    await client.end();
  });

  test('should still list PG users after restore', async ({ request }) => {
    const response = await request.get(`/api/databases/${testDbId}/pgusers`, {
      headers: authHeaders,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.some((u: any) => u.pg_user_id === pgUserId)).toBe(true);
  });

  test('should reject backup for non-active database', async ({ request }) => {
    const delResponse = await request.delete(`/api/databases/${testDbId}`, {
      headers: authHeaders,
    });
    expect(delResponse.status()).toBe(200);

    const backupResponse = await request.post(`/api/databases/${testDbId}/backup`, {
      headers: authHeaders,
    });
    expect(backupResponse.status()).toBe(400);
  });
});
