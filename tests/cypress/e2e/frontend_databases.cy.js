describe('Frontend Database Operations', () => {
  beforeEach(() => {
    cy.setCookie('__x_email', 'test@example.com');
    cy.visit('/', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'clipboard', {
          value: {
            writeText: cy.stub().as('clipboardWriteText').resolves(),
          },
          configurable: true,
        });
      },
    }); // Visit the base URL of the frontend application
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

  it('should create a new user and show the generated password', () => {
    const dbName = `test_db_${Date.now()}`;
    const userName = `test_user_${Date.now()}`;

    // Create a database first
    cy.get('button:contains("Create Database")').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('#name').type(dbName);
    cy.get('button[type="submit"]:contains("Create Database")').click();
    //cy.get('#dashboard-db-list').should('contain', dbName);
    cy.get('tbody tr')
      .filter(`:contains("${dbName}")`)
      .should('contain', dbName) // Assert the row contains the expected name
      .find('button:contains("View Details")') // Find the specific button within that row
      .click();

    // Navigate to the database details page
    cy.contains(dbName).click();
    cy.url().should('include', '/databases/');
    cy.wait(1000); // Wait for the page to load

    // Click the "Create User" button
    cy.get('button#create-user-on-page:contains("Create User")').click();

    // Fill out the form
    cy.get('input#username').type(userName);
    cy.get('button[type="submit"]:contains("Create User")').click();

    // Assert that the dialog with the generated password is shown
    cy.get('[role="dialog"]').should('contain', 'User Created Successfully');
    cy.get('input[type="password"]').should('be.visible');

    // Click "Done" to close the dialog
    cy.get('button:contains("Done")').click();
    cy.get('[role="dialog"]').should('not.exist');

    // Assert that the new user is listed on the page
    cy.get('body').should('contain', userName);
  });
});''