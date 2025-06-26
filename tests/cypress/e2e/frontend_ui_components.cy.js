describe('Frontend UI Components', () => {
  beforeEach(() => {
    // Set X-Forwarded-Email header for all requests to simulate authentication
    cy.intercept('*', (req) => {
      req.headers['x-forwarded-email'] = 'test@example.com';
    });
    cy.visit('/'); // Visit the base URL of the frontend application
  });

  it('should display the database list and not the other sections', () => {
    cy.get('#dashboard-section').should('be.visible');
    cy.get('#databasemanage-section').should('not.be.visible');
    cy.get('#databasecreateform-section').should('not.be.visible');
  });
});