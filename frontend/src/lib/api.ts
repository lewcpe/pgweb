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
  listDatabases: () => request('GET', '/databases'),

  createDatabase: (name: string) => request('POST', '/databases', { name }),

  getDatabaseDetails: (databaseId: string) => request('GET', `/databases/${databaseId}`),

  deleteDatabase: (databaseId: string) => {
    console.warn("deleteDatabase is using mock data");
    return Promise.resolve({ message: `DELETE to /databases/${databaseId} simulated successfully`});
  },

  // PostgreSQL User Management
  listPGUsers: (databaseId: string) => request('GET', `/databases/${databaseId}/pgusers`),

  createPGUser: (databaseId: string, username: string, permission_level: 'read' | 'write') =>
    request('POST', `/databases/${databaseId}/pgusers`, { username, permission_level }),

  regeneratePGUserPassword: (databaseId: string, pgUserId: string) => {
    console.warn("regeneratePGUserPassword is using mock data");
    return Promise.resolve({ message: "Password regenerated (mocked)." });
  },
  // Placeholder for logout, if it needs to be an API call.
  // If logout is just a redirect, it might not need an api.ts entry.
  // logout: () => request('POST', '/auth/logout'), // Example
};
