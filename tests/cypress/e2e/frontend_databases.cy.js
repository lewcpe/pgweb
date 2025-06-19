describe('Frontend Database Operations', () => {
  beforeEach(() => {
    // Set X-Forwarded-Email header for all requests to simulate authentication
    cy.intercept('*', (req) => {
      req.headers['x-forwarded-email'] = 'test@example.com';
    });
    cy.visit('/'); // Visit the base URL of the frontend application
    cy.window().then((win) => {
      if (win.enableMockApi) {
        win.enableMockApi(true);
      } else {
        // Log an error or throw to fail the test if the function isn't found.
        // This helps in debugging setup issues.
        console.error('enableMockApi function not found on window object.');
        // To make the test fail if mocking can't be enabled:
        throw new Error('enableMockApi function not found on window object. Frontend app might not have exposed it.');
      }
    });
  });

  it('should display the dashboard after successful login simulation', () => {
    cy.url().should('include', '/dashboard');
    cy.contains('Welcome to pgweb').should('be.visible');
  });

  it('should navigate to the database list and display existing databases', () => {
    cy.get('a[href="/databases"]').click();
    cy.url().should('include', '/databases');
    cy.contains('Database List').should('be.visible');
    // Check for mock databases
    cy.contains('mockdb1').should('be.visible');
    cy.contains('another_db').should('be.visible');
  });

  it('should allow creating a new database', () => {
    const dbName = `test_db_mock_${Date.now()}`; // Differentiate mock test dbs
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