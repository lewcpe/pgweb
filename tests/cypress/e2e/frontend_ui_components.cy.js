describe('Frontend UI Components', () => {
  beforeEach(() => {
    cy.setCookie('__x_email', 'test@example.com');
    cy.visit('/');
  });

  it('should display the database list and not the other sections', () => {
    cy.get('#dashboard-section').should('be.visible');
  });
});