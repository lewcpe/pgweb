// frontend/public/app.js

(function() {
    // Centralized event listeners or app-wide setup can go here.

    // Example: Close modals when "cancel" button inside them is clicked
    document.querySelectorAll('.modal .cancel-modal').forEach(button => {
        button.addEventListener('click', (event) => {
            const modal = event.target.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Example: Close modals when clicking outside the modal content
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (event) => {
            // If the click is directly on the modal backdrop (not its content)
            if (event.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Helper function to display errors
    window.displayError = function(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = message;
            el.style.display = message ? 'block' : 'none';
        }
    };

    // Helper function to display success messages
    window.displaySuccess = function(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = message;
            el.style.display = message ? 'block' : 'none';
            if (message) {
                setTimeout(() => {
                    el.style.display = 'none';
                    el.textContent = '';
                }, 5000); // Auto-hide after 5 seconds
            }
        }
    };

    // Helper function to show/hide loading indicators
    window.setLoading = function(elementId, isLoading) {
        const el = document.getElementById(elementId);
        if (el) {
            el.style.display = isLoading ? 'block' : 'none';
        }
    };


    // Initial check for user session (optional, but good for UI feedback)
    // Since oauth2-proxy handles actual auth, this is more about updating UI if user info is available.
    // For now, we'll assume if API calls work, user is authenticated.
    // If an API call returns 401/403, oauth2-proxy should ideally handle redirect.
    // If not, the API function in api.js will throw an error, and individual component
    // JS should handle that (e.g., by showing an error message).

    console.log("App initialized.");

})();
