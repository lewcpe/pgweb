// frontend/src/lib/api.ts

const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
const VITE_MOCK_API = import.meta.env.VITE_MOCK_API === 'true';

// Define mock data structures
const mockData = {
  getMe: { id: 'mock-user-id', username: 'mockuser', email: 'mockuser@example.com', is_superuser: false },
  listDatabases: [
    { id: 'db1', name: 'Mock DB 1', status: 'running', owner_username: 'mockuser', created_at: new Date().toISOString(), pg_host: 'mock-host-db1', pg_port: 5432, pg_database: 'mock_db_1' },
    { id: 'db2', name: 'Mock DB 2', status: 'provisioning', owner_username: 'mockuser', created_at: new Date().toISOString(), pg_host: 'mock-host-db2', pg_port: 5432, pg_database: 'mock_db_2' },
  ],
  createDatabase: (data: any) => ({
    id: `db${Math.floor(Math.random() * 1000)}`,
    name: data.name,
    status: 'provisioning',
    owner_username: 'mockuser',
    created_at: new Date().toISOString(),
    pg_host: `mock-host-${data.name.toLowerCase().replace(/\s+/g, '-')}`,
    pg_port: 5432,
    pg_database: data.name.toLowerCase().replace(/\s+/g, '_')
  }),
  getDatabaseDetails: (databaseId: string) => {
    const db = mockData.listDatabases.find(db => db.id === databaseId);
    if (db) {
      return { ...db, owner: 'mockuser', creation_date: db.created_at }; // Example: more details
    }
    return { message: "Database not found" }; // Should ideally be a 404 error
  },
  deleteDatabaseSuccess: { message: "Database deleted successfully (mocked)" },
  listPGUsers: (databaseId: string) => [
    { id: 'pguser1', username: 'user_read', permission_level: 'read', created_at: new Date().toISOString(), database_id: databaseId },
    { id: 'pguser2', username: 'user_write', permission_level: 'write', created_at: new Date().toISOString(), database_id: databaseId },
  ],
  createPGUser: (databaseId: string, data: any) => ({
    id: `pguser${Math.floor(Math.random() * 1000)}`,
    username: data.username,
    permission_level: data.permission_level,
    created_at: new Date().toISOString(),
    database_id: databaseId,
    // password field is typically not returned, or only on creation if absolutely necessary
  }),
  regeneratePGUserPasswordSuccess: { message: "Password regenerated (mocked)." },
};

async function request(method: string, path: string, data?: any) {
  if (VITE_MOCK_API) {
    console.warn(`VITE_MOCK_API is enabled. Returning mock data for ${method} ${path}`);
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay

    if (method === 'GET' && path === '/me') {
      return Promise.resolve(mockData.getMe);
    }
    if (method === 'GET' && path === '/databases') {
      return Promise.resolve(mockData.listDatabases);
    }
    if (method === 'POST' && path === '/databases') {
      return Promise.resolve(mockData.createDatabase(data));
    }
    if (method === 'GET' && path.startsWith('/databases/') && !path.includes('/pgusers')) {
      const databaseId = path.split('/')[2];
      return Promise.resolve(mockData.getDatabaseDetails(databaseId));
    }
    if (method === 'DELETE' && path.startsWith('/databases/')) {
      // const databaseId = path.split('/')[2]; // Not used by current mock
      return Promise.resolve(mockData.deleteDatabaseSuccess);
    }
    if (method === 'GET' && path.includes('/pgusers')) {
      const databaseId = path.split('/')[2];
      return Promise.resolve(mockData.listPGUsers(databaseId));
    }
    if (method === 'POST' && path.includes('/pgusers')) {
      const databaseId = path.split('/')[2];
      return Promise.resolve(mockData.createPGUser(databaseId, data));
    }
    if (method === 'POST' && path.includes('/regenerate-password')) {
      // const databaseId = path.split('/')[2]; // Not used by current mock
      // const pgUserId = path.split('/')[4]; // Not used by current mock
      return Promise.resolve(mockData.regeneratePGUserPasswordSuccess);
    }

    console.error(`No mock defined for ${method} ${path}`);
    return Promise.reject(new Error(`No mock defined for ${method} ${path}`));
  }

  // Real fetch logic:
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${VITE_API_BASE_URL}${path}`, options);

    if (response.status === 204) {
      return null;
    }

    let responseBody;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      const responseText = await response.text();
      responseBody = { message: responseText };
      if (!response.ok) {
         throw new Error(responseText || `API request failed with status ${response.status}`);
      }
    }

    if (!response.ok) {
      const errorMessage = responseBody?.message || responseBody?.error || `API request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return responseBody;

  } catch (error) {
    console.error(`API Error (${method} ${path}):`, error);
    throw error;
  }
}

export default {
  // Auth
  getMe: () => request('GET', '/me'),

  // Database Management
  listDatabases: () => request('GET', '/databases'),
  createDatabase: (name: string) => request('POST', '/databases', { name }),
  getDatabaseDetails: (databaseId: string) => request('GET', `/databases/${databaseId}`),
  deleteDatabase: (databaseId: string) => request('DELETE', `/databases/${databaseId}`),

  // PostgreSQL User Management
  listPGUsers: (databaseId: string) => request('GET', `/databases/${databaseId}/pgusers`),
  createPGUser: (databaseId: string, username: string, permission_level: 'read' | 'write') =>
    request('POST', `/databases/${databaseId}/pgusers`, { username, permission_level }),
  regeneratePGUserPassword: (databaseId: string, pgUserId: string) =>
    request('POST', `/databases/${databaseId}/pgusers/${pgUserId}/regenerate-password`),
};
