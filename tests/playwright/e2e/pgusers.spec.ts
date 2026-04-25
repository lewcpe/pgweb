import { test, expect } from '@playwright/test';

const testDbName = `testdb_${Date.now()}`;
const testUser = `testuser_${Date.now()}`;
let testDbId;
let testUserId;

test.describe('PostgreSQL User Management API', () => {
  test.beforeAll(async ({ request }) => {
    const dbResponse = await request.post('/api/databases', {
      data: { name: testDbName },
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    if (dbResponse.status() === 201) {
      const dbBody = await dbResponse.json();
      testDbId = dbBody.database_id;

      const userResponse = await request.post(`/api/databases/${testDbId}/pgusers`, {
        data: { username: testUser, permission_level: 'read' },
        headers: { 'X-Forwarded-Email': 'test@example.com' }
      });
      if (userResponse.status() === 201) {
        const userBody = await userResponse.json();
        testUserId = userBody.pg_user_id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testDbId) {
      await request.delete(`/api/databases/${testDbId}`, {
        headers: { 'X-Forwarded-Email': 'test@example.com' }
      });
    }
  });

  test('should create a new PostgreSQL user', async ({ request }) => {
    const username = `newuser_${Date.now()}`;
    const response = await request.post(`/api/databases/${testDbId}/pgusers`, {
      data: { username, permission_level: 'read' },
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('pg_user_id');
    expect(body.pg_username).toBe(username);
    expect(body.permission_level).toBe('read');
    expect(body).toHaveProperty('password');
  });

  test('should reject invalid username', async ({ request }) => {
    const response = await request.post(`/api/databases/${testDbId}/pgusers`, {
      data: { username: `bad name ${Date.now()}`, permission_level: 'write' },
      headers: { 'X-Forwarded-Email': 'test@example.com' }
    });
    expect([400, 409]).toContain(response.status());
  });
});