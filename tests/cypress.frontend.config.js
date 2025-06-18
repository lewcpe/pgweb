const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://frontend:5173',
    specPattern: 'cypress/e2e/frontend_*.cy.js', // Only include frontend specific tests
    supportFile: 'cypress/support/e2e.js', // Keep the same support file for now
    setupNodeEvents(on, config) {
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
      });
    },
  },
})