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

  if (body) options.body = body
  if (token) options.headers.Authorization = `Bearer ${token}`

  return cy.request(options)
})

// Login and get session token
Cypress.Commands.add('login', () => {
  return cy.apiRequest('POST', '/auth/login', null, null).then((loginResponse) => {
    // Verify we have a redirect location
    if (!loginResponse.headers.location) {
      throw new Error('Login response did not contain redirect location');
    }
    
    const dexUrl = loginResponse.headers.location;
    cy.log(`Redirecting to Dex login: ${dexUrl}`);
    
    return cy.request({
      method: 'POST',
      url: dexUrl,
      form: true,
      body: {
        login: 'test@example.com',
        password: 'testpassword'
      },
      followRedirect: false
    })
  }).then((dexResponse) => {
    // Follow callback redirect to get session cookie
    return cy.request({
      method: 'GET',
      url: dexResponse.headers.location,
      followRedirect: false
    })
  })
})

// Custom command to create a test database
Cypress.Commands.add('createTestDatabase', (dbName, token) => {
  return cy.apiRequest('POST', '/api/databases', { name: dbName }, token)
})

// Custom command to delete a test database
Cypress.Commands.add('deleteTestDatabase', (dbId, token) => {
  return cy.apiRequest('DELETE', `/api/databases/${dbId}`, null, token)
})