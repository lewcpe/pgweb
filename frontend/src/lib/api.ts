// frontend/src/lib/api.ts

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
  listDatabases: () => {
    console.warn("listDatabases is using mock data");
    return Promise.resolve([
      { database_id: 'sim1', pg_database_name: 'sim_db_1', status: 'active' },
      { database_id: 'sim2', pg_database_name: 'sim_db_2', status: 'soft_deleted' },
    ]);
  },
  createDatabase: (name: string) => {
    console.warn("createDatabase is using mock data");
    return Promise.resolve({ name, database_id: `sim_${Math.random().toString(36).substring(7)}`, status: 'pending_creation' });
  },
  getDatabaseDetails: (databaseId: string) => {
    console.warn("getDatabaseDetails is using mock data");
    return Promise.resolve({ database_id: databaseId, pg_database_name: `sim_db_${databaseId}`, status: 'active' });
  },
  deleteDatabase: (databaseId: string) => {
    console.warn("deleteDatabase is using mock data");
    return Promise.resolve({ message: `DELETE to /databases/${databaseId} simulated successfully`});
  },

  // PostgreSQL User Management (can remain mocked)
  listPGUsers: (databaseId: string) => {
    console.warn("listPGUsers is using mock data");
    return Promise.resolve([
      { pg_user_id: 'sim_pguser1', pg_username: 'sim_reader', permission_level: 'read' },
    ]);
  },
  createPGUser: (databaseId: string, username: string, permissionLevel: string) => {
    console.warn("createPGUser is using mock data");
    return Promise.resolve({ username, permission_level: permissionLevel, pg_user_id: 'sim_pguser_new' });
  },
  regeneratePGUserPassword: (databaseId: string, pgUserId: string) => {
    console.warn("regeneratePGUserPassword is using mock data");
    return Promise.resolve({ message: "Password regenerated (mocked)." });
  },
  // Placeholder for logout, if it needs to be an API call.
  // If logout is just a redirect, it might not need an api.ts entry.
  // logout: () => request('POST', '/auth/logout'), // Example
};
