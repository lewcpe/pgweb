import { test, expect } from '@playwright/test';

const user1 = 'user1@example.com';
const user2 = 'user2@example.com';
const dbNameUser1 = `testdb_user1_${Date.now()}`;
let dbIdUser1;

test.describe('Multi-User Isolation', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/databases', {
      data: { name: dbNameUser1 },
      headers: { 'X-Forwarded-Email': user1 }
    });
    if (response.status() === 201) {
      const body = await response.json();
      dbIdUser1 = body.database_id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (dbIdUser1) {
      await request.delete(`/api/databases/${dbIdUser1}`, {
        headers: { 'X-Forwarded-Email': user1 }
      });
    }
  });

  test('User 2 should not be able to see User 1s database in the list', async ({ request }) => {
    const response = await request.get('/api/databases', {
      headers: { 'X-Forwarded-Email': user2 }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.some(db => db.database_id === dbIdUser1)).toBe(false);
  });

  test('User 2 should be rejected when trying to access User 1s database directly', async ({ request }) => {
    const response = await request.get(`/api/databases/${dbIdUser1}`, {
      headers: { 'X-Forwarded-Email': user2 }
    });
    expect(response.status()).toBe(403);
  });

  test('User 2 should be rejected when trying to delete User 1s database', async ({ request }) => {
    const response = await request.delete(`/api/databases/${dbIdUser1}`, {
      headers: { 'X-Forwarded-Email': user2 }
    });
    expect(response.status()).toBe(403);
  });
});