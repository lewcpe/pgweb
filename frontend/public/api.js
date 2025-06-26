// frontend/public/api.js

// Since we assume oauth2-proxy is in front, API calls are relative to the current domain.
// The VITE_API_BASE_URL is no longer needed.
const API_BASE_URL = '/api'; // Or just '' if requests are like '/api/databases'

async function request(method, path, data) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        // 'credentials: 'include'' is usually default for same-origin,
        // but explicit can be good. oauth2-proxy relies on cookies.
        credentials: 'include',
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${path}`, options);

        if (response.status === 204) { // No Content
            return null;
        }

        let responseBody;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            responseBody = await response.json();
        } else {
            // Handle non-JSON responses, potentially errors not in JSON format
            const responseText = await response.text();
            responseBody = { message: responseText }; // Wrap text in a standard-ish error object
            if (!response.ok) {
                 throw new Error(responseText || `API request failed with status ${response.status}`);
            }
        }

        if (!response.ok) {
            // Try to get a meaningful error message from JSON body, otherwise status text
            const errorMessage = responseBody?.message || responseBody?.error || response.statusText || `API request failed with status ${response.status}`;
            const error = new Error(errorMessage);
            error.status = response.status; // Attach status code to the error object
            if (responseBody && typeof responseBody === 'object') {
                error.body = responseBody; // Attach full body if it's an object
            }
            throw error;
        }

        return responseBody;
    } catch (error) {
        console.error(`API Error (${method} ${path}):`, error.message);
        // If it's a network error or something not from the server's response,
        // it might not have error.status.
        // The error is re-thrown so the caller can handle it.
        throw error;
    }
}

const api = {
    // Auth - /api/me is useful to check if a user is logged in / get user info
    // Even with oauth2-proxy, the backend /api/me endpoint would be protected by it.
    getMe: () => request('GET', '/me'),

    // Database Management
    listDatabases: () => request('GET', '/databases'),
    createDatabase: (name) => request('POST', '/databases', { name }),
    getDatabaseDetails: (databaseId) => request('GET', `/databases/${databaseId}`),
    deleteDatabase: (databaseId) => request('DELETE', `/databases/${databaseId}`),

    // PostgreSQL User Management
    listPGUsers: (databaseId) => request('GET', `/databases/${databaseId}/pgusers`),
    createPGUser: (databaseId, username, permission_level) =>
        request('POST', `/databases/${databaseId}/pgusers`, { username, permission_level }),
    regeneratePGUserPassword: (databaseId, pgUserId) =>
        request('POST', `/databases/${databaseId}/pgusers/${pgUserId}/regenerate-password`),
    deletePGUser: (databaseId, pgUserId) =>
        request('DELETE', `/databases/${databaseId}/pgusers/${pgUserId}`),
};

// Make it available globally or as a module if using <script type="module">
// For simplicity with multiple script files, attaching to window for now.
window.api = api;
