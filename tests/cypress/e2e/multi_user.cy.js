describe('Multi-User Isolation', () => {
  const user1 = 'user1@example.com';
  const user2 = 'user2@example.com';
  const dbNameUser1 = `testdb_user1_${Date.now()}`;
  let dbIdUser1;

  before(() => {
    // User 1 creates a database
    cy.login('trustedHeader', user1);
    cy.createTestDatabase(dbNameUser1).then((response) => {
      expect(response.status).to.eq(201);
      dbIdUser1 = response.body.database_id;
    });
  });

  after(() => {
    // Clean up the database created by user 1
    if (dbIdUser1) {
      cy.login('trustedHeader', user1);
      cy.deleteTestDatabase(dbIdUser1);
    }
  });

  it('User 2 should not be able to see User 1s database in the list', () => {
    cy.login('trustedHeader', user2);
    cy.apiRequest('GET', '/api/databases').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array');
      expect(response.body.some(db => db.database_id === dbIdUser1)).to.be.false;
    });
  });

  it('User 2 should be rejected when trying to access User 1s database directly', () => {
    cy.login('trustedHeader', user2);
    cy.apiRequest('GET', `/api/databases/${dbIdUser1}`).then((response) => {
      expect(response.status).to.eq(403); // Forbidden
    });
  });

  it('User 2 should be rejected when trying to delete User 1s database', () => {
    cy.login('trustedHeader', user2);
    cy.apiRequest('DELETE', `/api/databases/${dbIdUser1}`).then((response) => {
      expect(response.status).to.eq(403); // Forbidden
    });
  });
});
