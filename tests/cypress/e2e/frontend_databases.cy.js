describe('Frontend Database Operations', () => {
  beforeEach(() => {
    // Set X-Forwarded-Email header for all requests to simulate authentication
    cy.intercept('*', (req) => {
      req.headers['x-forwarded-email'] = 'test@example.com';
    });
    cy.visit('/'); // Visit the base URL of the frontend application
  });

  it('should display the dashboard after successful login simulation', () => {
    cy.url().should('include', '/dashboard');
    cy.contains('Welcome to pgweb').should('be.visible');
  });

  it('should navigate to the database list and display existing databases', () => {
    cy.get('a[href="/databases"]').click();
    cy.url().should('include', '/databases');
    cy.contains('Database List').should('be.visible');
    // Assuming there might be some default databases or we'll mock them later
    // cy.get('.database-item').should('have.length.at.least', 1);
  });

  it('should allow creating a new database', () => {
    const dbName = `test_db_${Date.now()}`;
    cy.get('a[href="/databases"]').click();
    cy.url().should('include', '/databases');
    cy.contains('Create New Database').click();
    cy.url().should('include', '/databases/create');
    cy.get('input[name="name"]').type(dbName);
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/databases');
    cy.contains(dbName).should('be.visible');
  });

  // Add more tests for viewing database details, editing, deleting, etc.
});