// frontend/public/app.js

(function() {
    // Centralized event listeners or app-wide setup can go here.

    // Close dialogs when a button with class "cancel-dialog" inside them is clicked
    document.addEventListener('click', function(event) {
        if (event.target.matches('.cancel-dialog')) {
            const dialogId = event.target.dataset.dialogid;
            if (dialogId) {
                const dialog = document.getElementById(dialogId);
                if (dialog && typeof dialog.close === 'function') {
                    dialog.close();
                } else {
                    console.warn(`Dialog with ID ${dialogId} not found or not a dialog.`);
                }
            }
        }
        // Also handle PicoCSS's default close button within dialogs <article><header><a class="close">
        if (event.target.matches('dialog article header a.close')) {
            const dialog = event.target.closest('dialog');
            if (dialog && typeof dialog.close === 'function') {
                dialog.close();
                event.preventDefault(); // Prevent potential navigation if href="#"
            }
        }
    });

    // Close dialogs when clicking on their backdrop
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', function(event) {
            // If the click is directly on the dialog element itself (the backdrop)
            if (event.target === dialog) {
                dialog.close();
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

    async function displayUserEmail() {
        const emailDisplayElement = document.getElementById('user-email-display');
        if (!emailDisplayElement) {
            console.error("User email display element not found.");
            return;
        }

        try {
            const userInfo = await window.api.getMe();
            if (userInfo && userInfo.email) {
                emailDisplayElement.textContent = userInfo.email;
            } else {
                emailDisplayElement.textContent = ''; // Or "Not logged in" / Anonymous
                console.log("User info or email not available.");
            }
        } catch (error) {
            // If /api/me fails (e.g. 401), oauth2-proxy should handle the redirect.
            // If it's another error, we log it. The user might not see an email.
            console.error("Error fetching user info:", error);
            emailDisplayElement.textContent = ''; // Clear any previous text
        }
    }

    // Display user email on load
    displayUserEmail();

    console.log("App initialized.");

})();
