describe('PostgreSQL User Management API', () => {
  const testDbName = `testdb_${Date.now()}`
  const testUser = `testuser_${Date.now()}`
  let testDbId
  let testUserId
  let authToken

  before(() => {
    // Login and get token using trustedHeader method
    cy.login('trustedHeader').then(() => {
      // For trustedHeader auth, the session cookie is set directly by the backend
      // No need to explicitly get it from Dex or pass authToken
      // Create a test database
      return cy.createTestDatabase(testDbName).then((dbResponse) => {
        if (dbResponse.status === 201) {
          testDbId = dbResponse.body.database_id

          // Create a test user
          return cy.createTestUser(testDbId, testUser).then((userResponse) => {
            if (userResponse.status === 201) {
              testUserId = userResponse.body.user_id
            }
          })
        }
      })
    })
  })

  after(() => {
    // Clean up test database
    if (testDbId) {
      cy.deleteTestDatabase(testDbId)
    }
  })

  it('should create a new PostgreSQL user', () => {
    const username = `newuser_${Date.now()}`
    cy.apiRequest('POST', `/api/databases/${testDbId}/pgusers`, {
      username: username,
      permission_level: 'read'
    }).then((response) => {
      expect(response.status).to.eq(201)
      expect(response.body).to.have.property('pg_user_id')
      expect(response.body.pg_username).to.eq(username)
      expect(response.body.permission_level).to.eq('read')
      expect(response.body).to.have.property('password')
    })
  })

  it('should return 400 for invalid username', () => {
    cy.apiRequest('POST', `/api/databases/${testDbId}/pgusers`, {
      username: 'invalid user!',
      permission_level: 'write'
    }).then((response) => {
      expect(response.status).to.eq(400)
    })
  })
})