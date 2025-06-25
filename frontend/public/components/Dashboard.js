// frontend/public/components/Dashboard.js
(function() {
    const dashboardDbList = document.getElementById('dashboard-db-list');
    const loadingIndicator = document.getElementById('dashboard-loading');
    const errorIndicator = document.getElementById('dashboard-error');
    const showCreateDbModalButton = document.getElementById('show-create-db-modal-dashboard');
    const createDbModal = document.getElementById('create-db-modal-dashboard-container');
    const createDbFormModal = document.getElementById('create-db-form-modal-dashboard');
    const newDbNameInputModal = document.getElementById('newDbNameDashboard');
    const createDbModalError = document.getElementById('create-db-modal-dashboard-error');

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

    async function handleCreateDatabaseModal(event) {
        event.preventDefault();
        const dbName = newDbNameInputModal.value.trim();
        if (!dbName) {
            displayError('create-db-modal-dashboard-error', "Database name cannot be empty.");
            return;
        }

        // Basic validation (can be expanded based on actual Svelte component validation)
        // For now, just check if it's empty. More complex validation is in DatabaseCreateForm.js
        displayError('create-db-modal-dashboard-error', '');

        try {
            const newDb = await window.api.createDatabase(dbName);
            databases.push(newDb); // Add to local cache
            renderDatabases(); // Re-render the list
            newDbNameInputModal.value = ''; // Clear input
            createDbModal.classList.remove('active'); // Close modal
        } catch (err) {
            console.error("Error creating database from modal:", err);
            displayError('create-db-modal-dashboard-error', `Error: ${err.message}`);
        }
    }

    showCreateDbModalButton.addEventListener('click', () => {
        newDbNameInputModal.value = '';
        displayError('create-db-modal-dashboard-error', ''); // Clear previous errors
        createDbModal.classList.add('active');
        newDbNameInputModal.focus();
    });

    createDbFormModal.addEventListener('submit', handleCreateDatabaseModal);

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
