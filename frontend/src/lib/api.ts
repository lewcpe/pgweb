// frontend/src/lib/api.ts

let USE_MOCK_API = false;
let mockApiCallLog: { path: string; method: string; body?: any; timestamp: string }[] = [];

export function enableMockApi(enable: boolean) {
  USE_MOCK_API = enable;
  console.log(`Mock API is now ${USE_MOCK_API ? 'enabled' : 'disabled'}`);
}

export function getMockApiCallLog() {
  return [...mockApiCallLog]; // Return a copy
}

export function clearMockApiCallLog() {
  mockApiCallLog = [];
}

async function mockRequest(path: string, options?: RequestInit) {
  const method = options?.method?.toUpperCase() || 'GET';
  let parsedBody: any = undefined;
  if (options?.body) {
    try {
      if (typeof options.body === 'string') {
        parsedBody = JSON.parse(options.body);
      } else {
        // If body is not a string, it might be FormData or other types.
        // For simplicity in logging, we'll just indicate its presence or type.
        // Or, if you expect it to be an object already, you can assign it directly.
        // This part might need adjustment based on how `options.body` is actually used.
        parsedBody = options.body; // Assuming it could be an object if not string
      }
    } catch (e) {
      console.warn('[Mock API] Failed to parse request body for logging:', options.body, e);
      parsedBody = { error: 'Failed to parse body', original: options.body };
    }
  }

  mockApiCallLog.push({
    path,
    method,
    body: parsedBody,
    timestamp: new Date().toISOString(),
  });
  console.log(`[Mock API] Logged: ${method} ${path}`, parsedBody);


  // The existing body parsing for routing logic:
  const routeBody = options?.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};


  const createMockResponse = (status: number, statusText: string, responseBody: any, isJson: boolean = true) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: new Headers(isJson ? {'Content-Type': 'application/json'} : {}),
      json: () => Promise.resolve(responseBody),
      text: () => Promise.resolve(isJson ? JSON.stringify(responseBody) : responseBody),
    } as unknown as Response);
  };

  // GET /me
  if (method === 'GET' && path === '/me') {
    return createMockResponse(200, 'OK', { email: 'test@example.com', name: 'Test User' });
  }

  // GET /databases
  if (method === 'GET' && path === '/databases') {
    return createMockResponse(200, 'OK', [
      { database_id: 'db1', pg_database_name: 'mockdb1', status: 'active' },
      { database_id: 'db2', pg_database_name: 'another_db', status: 'active' },
    ]);
  }

  // POST /databases
  if (method === 'POST' && path === '/databases') {
    const { name } = routeBody; // Use routeBody here
    if (name === 'invalid name!') {
      return createMockResponse(400, 'Bad Request', { message: 'Invalid database name' });
    }
    return createMockResponse(201, 'Created', {
      database_id: `db_${name.replace(/\s+/g, '_')}`, // simple id generation
      pg_database_name: name,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // GET /databases/:databaseId
  const dbDetailsMatch = path.match(/^\/databases\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && dbDetailsMatch) {
    const databaseId = dbDetailsMatch[1];
    if (databaseId === 'non-existent-id') {
      return createMockResponse(404, 'Not Found', { message: 'Database not found' });
    }
    return createMockResponse(200, 'OK', {
      database_id: databaseId,
      pg_database_name: `mockdb_${databaseId}`,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // DELETE /databases/:databaseId
  const dbDeleteMatch = path.match(/^\/databases\/([a-zA-Z0-9_-]+)$/);
  if (method === 'DELETE' && dbDeleteMatch) {
    const databaseId = dbDeleteMatch[1];
    // In a real mock, you might want to "mark" this ID as deleted for subsequent calls
    return createMockResponse(200, 'OK', {
      database: { database_id: databaseId, status: 'soft_deleted' },
      message: 'Database soft-deleted successfully'
    });
  }

  // GET /databases/:databaseId/pgusers
  const pgUsersListMatch = path.match(/^\/databases\/([a-zA-Z0-9_-]+)\/pgusers$/);
  if (method === 'GET' && pgUsersListMatch) {
    // const databaseId = pgUsersListMatch[1];
    return createMockResponse(200, 'OK', [
      { pg_user_id: 'user1', pg_username: 'mockuser1', permission_level: 'read' },
      { pg_user_id: 'user2', pg_username: 'writer', permission_level: 'write' },
    ]);
  }

  // POST /databases/:databaseId/pgusers
  const pgUserCreateMatch = path.match(/^\/databases\/([a-zA-Z0-9_-]+)\/pgusers$/);
  if (method === 'POST' && pgUserCreateMatch) {
    // const databaseId = pgUserCreateMatch[1];
    const { username, permission_level } = routeBody; // Use routeBody here
    if (username === 'invalid user!') {
      return createMockResponse(400, 'Bad Request', { message: 'Invalid username' });
    }
    return createMockResponse(201, 'Created', {
      pg_user_id: `user_${username.replace(/\s+/g, '_')}`, // simple id generation
      pg_username: username,
      permission_level: permission_level || 'read',
      password: 'mockpassword123', // Static password for mock
    });
  }

  // POST /databases/:databaseId/pgusers/:pgUserId/regenerate-password
  const regeneratePasswordMatch = path.match(/^\/databases\/([a-zA-Z0-9_-]+)\/pgusers\/([a-zA-Z0-9_-]+)\/regenerate-password$/);
  if (method === 'POST' && regeneratePasswordMatch) {
    // const databaseId = regeneratePasswordMatch[1];
    // const pgUserId = regeneratePasswordMatch[2];
    return createMockResponse(200, 'OK', {
      message: "Password regenerated (mocked).",
      password: "newMockPassword456"
    });
  }

  // Default: Not Found
  return createMockResponse(404, 'Not Found', { message: `Mock API endpoint ${method} ${path} not found` });
}

const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

async function request(method: string, path: string, data?: any) {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      // No explicit 'Authorization' header here, assuming session cookies are used
      // and handled automatically by the browser.
    },
    credentials: 'include', // Important: To send cookies to the backend API, even if it's on a different subdomain/port in development
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  // Conditionally use mockRequest or real fetch
  if (USE_MOCK_API) {
    // Note: mockRequest needs to be adapted to return a structure that the rest of the function can process,
    // or the processing logic needs to be part of mockRequest itself.
    // For now, let's assume mockRequest returns a Response-like object.
    // We also need to ensure the method and data are passed correctly.
    // The current mockRequest signature is (path, options), let's adapt the call.
    return mockRequest(path, options).then(async mockResponse => {
      // This part mimics the processing of a real response
      if (mockResponse.status === 204) {
        return null;
      }
      let responseBody;
      const contentType = mockResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseBody = await mockResponse.json();
      } else {
        const responseText = await mockResponse.text();
        responseBody = { message: responseText };
        if (!mockResponse.ok) {
           throw new Error(responseText || `Mock API request failed with status ${mockResponse.status}`);
        }
      }
      if (!mockResponse.ok) {
        const errorMessage = responseBody?.message || responseBody?.error || `Mock API request failed with status ${mockResponse.status}`;
        throw new Error(errorMessage);
      }
      return responseBody;
    });
  }

  // Real fetch logic:
  try {
    const response = await fetch(`${VITE_API_BASE_URL}${path}`, options);

    if (response.status === 204) { // No Content
      return null;
    }

    // Try to parse JSON, but fallback if body is empty or not JSON
    let responseBody;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      // For non-JSON responses, just return text, or handle based on status
      // This is a basic handling, might need refinement based on actual API behavior
      const responseText = await response.text();
      responseBody = { message: responseText };
      if (!response.ok) {
         // If it's an error and not JSON, the text itself might be the error message
         throw new Error(responseText || `API request failed with status ${response.status}`);
      }
    }

    if (!response.ok) {
      // Use the error message from the JSON body if available
      const errorMessage = responseBody?.message || responseBody?.error || `API request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return responseBody;

  } catch (error) {
    console.error(`API Error (${method} ${path}):`, error);
    // Re-throw the error so it can be caught by the caller (e.g., in AuthCallback.svelte)
    // Or transform it into a more specific error object if desired
    throw error;
  }
}

// Keep the existing exported functions.
// The mock logic within them for other endpoints can remain for now if they are not critical for auth.
// However, the /me endpoint used by getMe must not be mocked.

export default {
  // Auth
  getMe: () => request('GET', '/me'), // This will now use the real 'request' function

  // Database Management (can remain mocked if not part of this task's immediate scope)
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
  // Placeholder for logout, if it needs to be an API call.
  // If logout is just a redirect, it might not need an api.ts entry.
  // logout: () => request('POST', '/auth/logout'), // Example
};
