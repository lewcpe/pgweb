// frontend/public/components/Dashboard.js
(function() {
    const dashboardDbList = document.getElementById('dashboard-db-list');
    const loadingIndicator = document.getElementById('dashboard-loading');
    const errorIndicator = document.getElementById('dashboard-error');
    const successIndicator = document.createElement('p'); // For success messages like deletion
    successIndicator.className = 'success';
    successIndicator.style.display = 'none';
    // Insert success indicator after error indicator
    if(errorIndicator && errorIndicator.parentNode) {
        errorIndicator.parentNode.insertBefore(successIndicator, errorIndicator.nextSibling);
    }


    const showCreateDbDialogButton = document.getElementById('show-create-db-modal-dashboard');
    const createDbDialog = document.getElementById('create-db-dialog-dashboard');
    const createDbFormInDialog = document.getElementById('create-db-form-modal-dashboard');
    const newDbNameInputInDialog = document.getElementById('newDbNameDashboard');
    const createDbDialogError = document.getElementById('create-db-modal-dashboard-error');

    let databases = [];

    // Function to display success messages specifically for this component
    function displayDashboardSuccess(message) {
        successIndicator.textContent = message;
        successIndicator.style.display = message ? 'block' : 'none';
        if (message) {
            setTimeout(() => {
                successIndicator.style.display = 'none';
                successIndicator.textContent = '';
            }, 5000); // Auto-hide after 5 seconds
        }
    }


    async function fetchDatabases() {
        setLoading('dashboard-loading', true);
        displayError('dashboard-error', ''); // Clear previous errors
        displayDashboardSuccess(''); // Clear previous success messages
        dashboardDbList.innerHTML = ''; // Clear previous list

        try {
            databases = await window.api.listDatabases();
            renderDatabases();
        } catch (err) {
            console.error("Error loading databases for dashboard:", err);
            displayError('dashboard-error', `Error loading databases: ${err.message}`);
        } finally {
            setLoading('dashboard-loading', false);
        }
    }

    function renderDatabases() {
        const activeDatabases = databases.filter(db => db.status !== 'soft_deleted');

        if (activeDatabases.length === 0) {
            dashboardDbList.innerHTML = '<p>No active databases found. Create one!</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        `;
        const tbody = table.querySelector('tbody');
        activeDatabases.forEach(db => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-dbid', db.database_id); // For easier row removal
            tr.innerHTML = `
                <td>${db.pg_database_name}</td>
                <td>${db.status}</td>
                <td>${new Date(db.created_at).toLocaleDateString()}</td>
                <td>
                    <button data-dbid="${db.database_id}" class="manage-db-btn">Manage</button>
                    <button data-dbid="${db.database_id}" data-dbname="${db.pg_database_name}" class="delete-db-btn" style="background-color: var(--pico-muted-error-background); color: var(--pico-muted-error-foreground);">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        dashboardDbList.innerHTML = ''; // Clear loading/empty message
        dashboardDbList.appendChild(table);

        // Add event listeners for manage buttons
        table.querySelectorAll('.manage-db-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const dbId = event.target.getAttribute('data-dbid');
                window.router.navigate(`/databases/${dbId}/manage`); // Navigate to the new manage page
            });
        });

        // Add event listeners for delete buttons
        table.querySelectorAll('.delete-db-btn').forEach(button => {
            button.addEventListener('click', handleDeleteDatabase);
        });
    }

    async function handleDeleteDatabase(event) {
        const dbId = event.target.getAttribute('data-dbid');
        const dbName = event.target.getAttribute('data-dbname');

        if (confirm(`Are you sure you want to delete the database "${dbName}"? This action cannot be undone.`)) {
            setLoading('dashboard-loading', true); // Use main loading indicator for now
            displayError('dashboard-error', '');
            displayDashboardSuccess('');


            try {
                await window.api.deleteDatabase(dbId);
                displayDashboardSuccess(`Database "${dbName}" deleted successfully.`);
                // Refresh list by removing the row or re-fetching
                databases = databases.filter(db => db.database_id !== dbId);
                if (databases.length === 0) { // If last database was deleted
                    dashboardDbList.innerHTML = '<p>No databases found. Create one!</p>';
                } else {
                    // More efficient: remove the specific row
                    const rowToRemove = dashboardDbList.querySelector(`tr[data-dbid="${dbId}"]`);
                    if (rowToRemove) {
                        rowToRemove.remove();
                    } else { // Fallback to re-render (should not happen ideally)
                        renderDatabases();
                    }
                }
            } catch (err) {
                console.error(`Error deleting database ${dbName} (ID: ${dbId}):`, err);
                displayError('dashboard-error', `Error deleting database "${dbName}": ${err.message}`);
            } finally {
                setLoading('dashboard-loading', false);
            }
        }
    }


    async function handleCreateDatabaseDialog(event) {
        event.preventDefault();
        const dbName = newDbNameInputInDialog.value.trim();
        if (!dbName) {
            displayError('create-db-modal-dashboard-error', "Database name cannot be empty."); // Error ID is okay
            return;
        }

        // Basic validation (can be expanded based on actual Svelte component validation)
        // For now, just check if it's empty. More complex validation is in DatabaseCreateForm.js
        displayError('create-db-modal-dashboard-error', '');

        try {
            // Note: The API in api.js was updated to expect { name: dbName }
            // but the backend might expect { pg_database_name: dbName }.
            // Let's assume api.js handles the correct parameter naming for now.
            // If createDatabase fails, check this. The current api.js has:
            // createDatabase: (name) => request('POST', '/databases', { name }),
            // This should be correct if backend expects {"name": "foo"}
            // If backend expects {"pg_database_name": "foo"}, then api.js should be:
            // createDatabase: (name) => request('POST', '/databases', { pg_database_name: name }),
            // For now, proceeding with `dbName` as the direct value.
            const newDb = await window.api.createDatabase(dbName);
            databases.push(newDb); // Add to local cache
            // displayDashboardSuccess(`Database "${newDb.pg_database_name}" created successfully.`); // Dialog closing & list update is enough
            renderDatabases(); // Re-render the list
            newDbNameInputInDialog.value = ''; // Clear input
            if (createDbDialog) createDbDialog.close(); // Close dialog
        } catch (err) {
            console.error("Error creating database from dialog:", err);
            // Check if error.body.message exists from the new api.js error handling
            const message = err.body?.message || err.message;
            displayError('create-db-modal-dashboard-error', `Error: ${message}`);
        }
    }

    showCreateDbDialogButton.addEventListener('click', () => {
        if (createDbDialog) {
            newDbNameInputInDialog.value = '';
            displayError('create-db-modal-dashboard-error', ''); // Clear previous errors
            createDbDialog.showModal();
            newDbNameInputInDialog.focus();
        } else {
            console.error("Create DB Dialog not found");
        }
    });

    if (createDbFormInDialog) {
        createDbFormInDialog.addEventListener('submit', handleCreateDatabaseDialog);
    } else {
        console.error("Create DB Form in Dialog not found");
    }


    // Listen for view changes to load data if this section becomes active
    document.addEventListener('viewchanged', (event) => {
        if (event.detail.sectionId === 'dashboard-section') {
            fetchDatabases();
        } else {
            // When navigating away, clear the dashboard content to prevent it from showing on other pages.
            dashboardDbList.innerHTML = '';
            displayError('dashboard-error', '');
            displayDashboardSuccess('');
        }
    });

    // Initial load if dashboard is the current view (e.g. on page load at root path)
    if (document.getElementById('dashboard-section').classList.contains('active')) {
        fetchDatabases();
    }
})();
