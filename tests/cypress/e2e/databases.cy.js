describe('Database Management API', () => {
  const testDbName = `testdb_${Date.now()}`
  let testDbId
  let authToken

  before(() => {
    // Login and get token using trustedHeader method
    
    cy.login('trustedHeader').then(() => {
      // For trustedHeader auth, the session cookie is set directly by the backend
      // No need to explicitly get it from Dex or pass authToken
      // Create a test database to use in our tests
      cy.createTestDatabase(testDbName).then((response) => {
        if (response.status === 201) {
          testDbId = response.body.database_id
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

  it('should create a new database', () => {
    const dbName = `newdb_${Date.now()}`
    cy.apiRequest('POST', '/api/databases', { name: dbName }).then((response) => {
      expect(response.status).to.eq(201)
      expect(response.body).to.have.property('database_id')
      expect(response.body.pg_database_name).to.eq(dbName)
      expect(response.body.status).to.eq('active')
    })
  })

  it('should return 400 for invalid database name', () => {
    cy.apiRequest('POST', '/api/databases', { name: 'invalid name!' }).then((response) => {
      expect(response.status).to.eq(400)
    })
  })

  it('should list databases', () => {
    cy.apiRequest('GET', '/api/databases', null).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.be.an('array')
      expect(response.body.some(db => db.database_id === testDbId)).to.be.true
    })
  })

  it('should get database details', () => {
    cy.apiRequest('GET', `/api/databases/${testDbId}`, null).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.database_id).to.eq(testDbId)
      expect(response.body.pg_database_name).to.eq(testDbName)
    })
  })

  it('should return 400 for invalid database ID format', () => {
    cy.apiRequest('GET', '/api/databases/non-existent-id', null).then((response) => {
      expect(response.status).to.eq(400)
    })
  })

  it('should soft-delete a database', () => {
    cy.apiRequest('DELETE', `/api/databases/${testDbId}`, null).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.database.status).to.eq('soft_deleted')
    })
  })
})