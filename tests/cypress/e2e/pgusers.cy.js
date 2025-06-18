describe('PostgreSQL User Management API', () => {
  const testDbName = `testdb_${Date.now()}`
  const testUser = `testuser_${Date.now()}`
  let testDbId
  let testUserId
  let authToken

  before(() => {
    // Login and get token
    cy.login().then(() => {
      // Get session token from cookies
      return cy.getCookie('session').then((cookie) => {
        authToken = cookie.value

        // Create a test database
        return cy.createTestDatabase(testDbName, authToken).then((dbResponse) => {
          if (dbResponse.status === 201) {
            testDbId = dbResponse.body.database_id

            // Create a test user
            return cy.createTestUser(testDbId, testUser, authToken).then((userResponse) => {
              if (userResponse.status === 201) {
                testUserId = userResponse.body.user_id
              }
            })
          }
        })
      })
    })
  })

  after(() => {
    // Clean up test database
    if (testDbId) {
      cy.deleteTestDatabase(testDbId, authToken)
    }
  })

  it('should create a new PostgreSQL user', () => {
    const username = `newuser_${Date.now()}`
    cy.apiRequest('POST', `/api/databases/${testDbId}/pgusers`, {
      username: username,
      permission_level: 'read'
    }, authToken).then((response) => {
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
    }, authToken).then((response) => {
      expect(response.status).to.eq(400)
    })
  })
})