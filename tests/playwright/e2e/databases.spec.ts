import { test, expect } from '@playwright/test';

const testDbName = `testdb_${Date.now()}`;
let testDbId;

test.describe('Database Management API', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/databases', {
      data: { name: testDbName },
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    if (response.status() === 201) {
      const body = await response.json();
      testDbId = body.database_id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testDbId) {
      await request.delete(`/api/databases/${testDbId}`, {
        headers: { 'X-Forwarded-Email': 'test@example.com' }
      });
    }
  });

  test('should create a new database', async ({ request }) => {
    const dbName = `newdb_${Date.now()}`;
    const response = await request.post('/api/databases', {
      data: { name: dbName },
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('database_id');
    expect(body.pg_database_name).toBe(dbName);
    expect(body.status).toBe('active');
  });

  test('should return 400 for invalid database name', async ({ request }) => {
    const response = await request.post('/api/databases', {
      data: { name: 'invalid name!' },
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect(response.status()).toBe(400);
  });

  test('should list databases', async ({ request }) => {
    const response = await request.get('/api/databases', {
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.some(db => db.database_id === testDbId)).toBe(true);
  });

  test('should get database details', async ({ request }) => {
    const response = await request.get(`/api/databases/${testDbId}`, {
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.database_id).toBe(testDbId);
    expect(body.pg_database_name).toBe(testDbName);
  });

  test('should return 400 for invalid database ID format', async ({ request }) => {
    const response = await request.get('/api/databases/non-existent-id', {
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect(response.status()).toBe(400);
  });

  test('should soft-delete a database', async ({ request }) => {
    const response = await request.delete(`/api/databases/${testDbId}`, {
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.database.status).toBe('soft_deleted');
  });
});