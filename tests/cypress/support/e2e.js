Cypress.Commands.overwrite("log", function(log, ...args) {
  if (Cypress.browser.isHeadless) {
    return cy.task("log", args, { log: false }).then(() => {
      return log(...args);
    });
  } else {
    console.log(...args);
    return log(...args);
  }
});
// Global setup for backend API tests
Cypress.Commands.add('apiRequest', (method, endpoint, body = null, token = null) => {
  const options = {
    method: method,
    url: `${Cypress.config().baseUrl}${endpoint}`,
    headers: {
      'Content-Type': 'application/json'
    },
    failOnStatusCode: false
  }

  // Add X-Forwarded-Email header if available from trusted header login
  if (Cypress.env('X-Forwarded-Email')) {
    options.headers['X-Forwarded-Email'] = Cypress.env('X-Forwarded-Email');
  }

  if (body) options.body = body
  if (token) options.headers.Authorization = `Bearer ${token}`

  return cy.request(options).then((response) => {
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      // If it's a redirect, return the redirect response
      return { ...response, isRedirect: true, redirectUrl: response.headers.location };
    }
    return response;
  });
});

// Login and get session token
Cypress.Commands.add('login', (method = 'oidc') => {
  if (method === 'oidc') {
    // OIDC Login Flow (existing)
    // Step 1: Initiate OIDC login from backend
    return cy.request({
      method: 'GET',
      url: `${Cypress.config().baseUrl}/auth/oidc/login`,
      failOnStatusCode: false,
      followRedirect: false, // Do not follow automatically, we need to inspect headers
    }).then((loginResponse) => {
      if (!loginResponse.headers.location) {
        throw new Error('Initial login response did not contain redirect location');
      }
      const dexAuthUrl = loginResponse.headers.location;
      cy.log(`Redirecting to Dex auth: ${dexAuthUrl}`);

      // Step 2: Follow redirect to Dex authorization endpoint
      return cy.request({
        method: 'GET',
        url: dexAuthUrl,
        followRedirect: false, // Do not follow automatically, we need to inspect headers
      });
    }).then((dexAuthResponse) => {
      if (!dexAuthResponse.headers.location) {
        throw new Error('Dex auth response did not contain redirect location');
      }
      const dexLoginFormUrl = dexAuthResponse.headers.location;
      cy.log(`Redirecting to Dex login form: ${dexLoginFormUrl}`);

      // Extract query parameters from dexLoginFormUrl
      const urlParams = new URLSearchParams(dexLoginFormUrl.split('?')[1]);
      const oidcParams = {};
      for (const [key, value] of urlParams.entries()) {
        oidcParams[key] = value;
      }

      // Step 3: Submit the login form to Dex
      // The form action is /dex/auth, and the fields are 'login' and 'password'
      return cy.request({
        method: 'POST',
        url: `http://dex:5556/dex/auth`, // Corrected URL based on HTML inspection
        form: true,
        body: {
          ...oidcParams, // Include all OIDC parameters
          login: 'test@example.com',
          password: 'testpassword',
        },
        followRedirect: false, // Do not follow automatically, we need to inspect headers
      });
    }).then((dexLoginResponse) => {
      if (!dexLoginResponse.headers.location) {
        throw new Error('Dex login form submission did not contain redirect location');
      }
      const dexRedirectUrl = dexLoginResponse.headers.location;
      cy.log(`Dex redirected to: ${dexRedirectUrl}`);

      // Dex redirects to a URL like /dex/auth/local?...&redirect_uri=http%3A%2F%2Fbackend%3A8080%2Fauth%2Fcallback&...
      // We need to extract the actual redirect_uri from its query parameters.
      const url = new URL(`http://dex:5556${dexRedirectUrl}`); // Use a base URL for parsing
      const actualBackendCallbackUrl = url.searchParams.get('redirect_uri');

      if (!actualBackendCallbackUrl) {
        throw new Error('Could not extract actual redirect_uri from Dex redirect URL');
      }

      cy.log(`Following actual backend callback: ${decodeURIComponent(actualBackendCallbackUrl)}`);

      // Step 4: Follow the final redirect to the backend's OIDC callback
      // This request should set the session cookie in Cypress
      return cy.request({
        method: 'GET',
        url: decodeURIComponent(actualBackendCallbackUrl),
        followRedirect: true, // Allow Cypress to follow this final redirect
      });
    });
  } else if (method === 'trustedHeader') {
    // Trusted Header Login Flow
    cy.log('Performing trusted header login...');
    return cy.request({
      method: 'GET',
      url: `${Cypress.config().baseUrl}/api/me`, // Any protected endpoint will trigger auth
      headers: {
        'X-Forwarded-Email': 'test@example.com', // Simulate oauth2-proxy header
      },
      failOnStatusCode: false,
    }).then((response) => {
      if (response.status !== 200) {
        throw new Error(`Trusted header login failed with status: ${response.status}`);
      }
      Cypress.env('X-Forwarded-Email', 'test@example.com'); // Store email for subsequent requests
      cy.log('Trusted header login successful.');
      return cy.wrap(response);
    });
  } else {
    throw new Error(`Unsupported login method: ${method}`);
  }
});

// Custom command to create a test database
Cypress.Commands.add('createTestDatabase', (dbName, token) => {
  return cy.apiRequest('POST', '/api/databases', { name: dbName }, token)
})

// Custom command to delete a test database
Cypress.Commands.add('deleteTestDatabase', (dbId, token) => {
  return cy.apiRequest('DELETE', `/api/databases/${dbId}`, null, token)
})