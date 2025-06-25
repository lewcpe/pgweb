describe('Frontend Database Operations', () => {
  beforeEach(() => {
    // Set X-Forwarded-Email header for all requests to simulate authentication
    cy.intercept('*', (req) => {
      req.headers['x-forwarded-email'] = 'test@example.com';
    });
    cy.visit('/'); // Visit the base URL of the frontend application
  });

  it('should display the database list on the main page', () => {
    cy.get('#dashboard-db-list').should('be.visible');
  });

  it('should navigate to the create database page', () => {
    cy.get('a[data-path="/databases/new"]').click();
    cy.get('#databasecreateform-section').should('be.visible');
  });

  it('should allow creating a new database', () => {
    const dbName = `test_db_${Date.now()}`;
    cy.get('a[data-path="/databases/new"]').click();
    cy.get('#dbNameInput').type(dbName);
    cy.get('#create-db-submit').click();
    cy.get('#dashboard-db-list').should('contain', dbName);
  });
});