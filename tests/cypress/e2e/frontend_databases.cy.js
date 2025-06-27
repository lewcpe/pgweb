describe('Frontend Database Operations', () => {
  beforeEach(() => {
    cy.setCookie('__x_email', 'test@example.com');
    cy.visit('/'); // Visit the base URL of the frontend application
  });

  it('should display the database list on the main page', () => {
    cy.get('#dashboard-db-list').should('be.visible');
  });

  it('should open the create database dialog', () => {
    cy.get('button:contains("Create Database")').click();
    cy.get('[role="dialog"]').should('be.visible');
  });

  it('should allow creating a new database', () => {
    const dbName = `test_db_${Date.now()}`;
    cy.get('button:contains("Create Database")').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('#name').type(dbName);
    cy.get('button[type="submit"]:contains("Create Database")').click(); // More specific selector
    cy.get('#dashboard-db-list').should('contain', dbName);
  });
});