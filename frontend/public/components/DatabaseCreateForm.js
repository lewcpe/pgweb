// frontend/public/components/DatabaseCreateForm.js
(function() {
    const section = document.getElementById('databasecreateform-section');
    const form = document.getElementById('create-db-form');
    const dbNameInput = document.getElementById('dbNameInput');
    const nameErrorDisplay = document.getElementById('db-name-error');
    const formErrorDisplay = document.getElementById('create-db-form-error');
    const formSuccessDisplay = document.getElementById('create-db-form-success');
    const submitButton = document.getElementById('create-db-submit');
    const cancelButton = document.getElementById('cancel-create-db');

    function validateDbName(name) {
        displayError('db-name-error', ''); // Clear previous error

        if (name.length < 3 || name.length > 63) {
            displayError('db-name-error', 'Name must be between 3 and 63 characters.');
            return false;
        }
        if (!/^[a-zA-Z0-9]/.test(name) || !/[a-zA-Z0-9]$/.test(name)) {
            displayError('db-name-error', 'Name must start and end with an alphanumeric character.');
            return false;
        }
        // Original Svelte used /^[a-zA-Z0-9_-]+$/ which allows hyphens.
        // The API.md might be more restrictive if it implies only alphanumeric and underscore.
        // Sticking to Svelte component's logic: alphanumeric, underscores, hyphens.
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            displayError('db-name-error', 'Name can only contain alphanumeric characters, underscores, and hyphens.');
            return false;
        }
        if (name.startsWith('pg_') || name.startsWith('postgres')) {
            displayError('db-name-error', 'Name cannot start with "pg_" or "postgres".');
            return false;
        }
        return true;
    }

    dbNameInput.addEventListener('input', () => {
        validateDbName(dbNameInput.value);
        // Disable submit button if name is invalid or empty
        submitButton.disabled = !validateDbName(dbNameInput.value) || !dbNameInput.value.trim();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const dbName = dbNameInput.value.trim();

        displayError('create-db-form-error', '');
        displaySuccess('create-db-form-success', '');

        if (!validateDbName(dbName)) {
            submitButton.disabled = true;
            return;
        }

        setLoadingState(true);

        try {
            const newDb = await window.api.createDatabase(dbName);
            displaySuccess('create-db-form-success', `Database "${newDb.pg_database_name || newDb.name}" created successfully! Status: ${newDb.status}`);
            dbNameInput.value = ''; // Clear the form
            // Optionally navigate away, e.g., to the new DB's detail page or list
            // window.router.navigate('/databases');
        } catch (err) {
            console.error("Failed to create database:", err);
            displayError('create-db-form-error', `Failed to create database: ${err.message}`);
        } finally {
            setLoadingState(false);
            // Re-check validation for button state, in case input was cleared
            submitButton.disabled = !validateDbName(dbNameInput.value) || !dbNameInput.value.trim();

        }
    });

    function setLoadingState(isLoading) {
        submitButton.disabled = isLoading;
        submitButton.textContent = isLoading ? 'Creating...' : 'Create Database';
    }

    cancelButton.addEventListener('click', () => {
        window.router.navigate('/databases'); // Or to dashboard, depending on preference
    });

    document.addEventListener('viewchanged', (event) => {
        if (event.detail.sectionId === 'databasecreateform-section') {
            // Reset form state when view becomes active
            dbNameInput.value = '';
            displayError('db-name-error', '');
            displayError('create-db-form-error', '');
            displaySuccess('create-db-form-success', '');
            setLoadingState(false);
            submitButton.disabled = true; // Initially disabled as name is empty
            dbNameInput.focus();
        }
    });

    // Initial state setup if this view is loaded directly
     if (section.classList.contains('active')) {
        dbNameInput.value = '';
        displayError('db-name-error', '');
        displayError('create-db-form-error', '');
        displaySuccess('create-db-form-success', '');
        setLoadingState(false);
        submitButton.disabled = true;
        dbNameInput.focus();
    }

})();
