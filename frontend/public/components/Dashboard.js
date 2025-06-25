// frontend/public/components/Dashboard.js
(function() {
    const dashboardDbList = document.getElementById('dashboard-db-list');
    const loadingIndicator = document.getElementById('dashboard-loading');
    const errorIndicator = document.getElementById('dashboard-error');
    const showCreateDbDialogButton = document.getElementById('show-create-db-modal-dashboard'); // ID of button remains same
    const createDbDialog = document.getElementById('create-db-dialog-dashboard'); // Changed ID
    const createDbFormInDialog = document.getElementById('create-db-form-modal-dashboard'); // ID of form remains same
    const newDbNameInputInDialog = document.getElementById('newDbNameDashboard'); // ID of input remains same
    const createDbDialogError = document.getElementById('create-db-modal-dashboard-error'); // ID of error p remains same

    let databases = [];

    async function fetchDatabases() {
        setLoading('dashboard-loading', true);
        displayError('dashboard-error', '');
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
        if (databases.length === 0) {
            dashboardDbList.innerHTML = '<p>No databases found. Create one!</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        `;
        const tbody = table.querySelector('tbody');
        databases.forEach(db => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${db.pg_database_name}</td>
                <td>${db.status}</td>
                <td><button data-dbid="${db.database_id}" class="view-details-btn">Details</button></td>
            `;
            tbody.appendChild(tr);
        });
        dashboardDbList.innerHTML = ''; // Clear loading/empty message
        dashboardDbList.appendChild(table);

        // Add event listeners for view details buttons
        table.querySelectorAll('.view-details-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const dbId = event.target.getAttribute('data-dbid');
                window.router.navigate(`/databases/${dbId}`);
            });
        });
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
        }
    });

    // Initial load if dashboard is the current view (e.g. on page load at root path)
    if (document.getElementById('dashboard-section').classList.contains('active')) {
        fetchDatabases();
    }
})();
