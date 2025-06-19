describe('Frontend UI Components', () => {
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
        console.error('enableMockApi function not found on window object.');
        // Optionally, fail the test if mocking is critical.
        // Given these tests are less API-dependent, a console error might suffice.
        // However, for consistency with other tests, throwing an error is better.
        throw new Error('enableMockApi function not found on window object. Frontend app might not have exposed it.');
      }
    });
  });

  it('should toggle theme between light and dark mode', () => {
    // Assuming a theme toggle button exists and changes a class on the body or a parent element
    cy.get('[data-testid="theme-toggle"]').as('themeToggle');

    // Check initial theme (assuming light by default)
    cy.get('html').should('not.have.class', 'dark');

    // Toggle to dark mode
    cy.get('@themeToggle').click();
    cy.get('html').should('have.class', 'dark');

    // Toggle back to light mode
    cy.get('@themeToggle').click();
    cy.get('html').should('not.have.class', 'dark');
  });

  // Add more tests for other UI components like ActionButtons, UserActionButtons, etc.
  it('should display action buttons and respond to clicks', () => {
    // This test assumes ActionButtons are visible on the dashboard or a specific page
    // You might need to navigate to a specific route if these buttons are not globally visible
    cy.visit('/dashboard'); // Or the relevant page where ActionButtons are present

    cy.get('[data-testid="action-button-example"]').should('be.visible').click();
    // Assert on the effect of the click, e.g., a modal appears, a notification shows, etc.
    // cy.contains('Action performed!').should('be.visible');
  });
});