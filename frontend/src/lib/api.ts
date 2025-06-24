// frontend/src/lib/api.ts

const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!VITE_API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set. Please set it in your environment variables.');
}

async function request(method: string, path: string, data?: any) {

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
