// frontend/public/components/DatabaseList.js
(function() {
    const section = document.getElementById('databaselist-section');
    const tableContainer = document.getElementById('databaselist-table-container');
    const loadingIndicator = document.getElementById('databaselist-loading');
    const errorIndicator = document.getElementById('databaselist-error');
    const goToCreateDbFormButton = document.getElementById('goto-create-db-form');

    let databases = [];

    async function fetchDatabasesList() {
        setLoading('databaselist-loading', true);
        displayError('databaselist-error', '');
        tableContainer.innerHTML = ''; // Clear previous table

        try {
            databases = await window.api.listDatabases();
            renderDatabaseListTable();
        } catch (err) {
            console.error("Error loading databases for list view:", err);
            displayError('databaselist-error', `Error loading databases: ${err.message}`);
        } finally {
            setLoading('databaselist-loading', false);
        }
    }

    function renderDatabaseListTable() {
        if (databases.length === 0) {
            tableContainer.innerHTML = `<p>No databases found. <a href="#" id="create-new-db-link-from-list">Create one?</a></p>`;
            document.getElementById('create-new-db-link-from-list')?.addEventListener('click', (e) => {
                e.preventDefault();
                window.router.navigate('/databases/new');
            });
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created</th>
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
                <td>${new Date(db.created_at).toLocaleDateString()}</td>
                <td>
                    <button data-dbid="${db.database_id}" class="view-details-list-btn">Details</button>
                    <!-- Delete button can be added here if needed -->
                </td>
            `;
            tbody.appendChild(tr);
        });
        tableContainer.innerHTML = ''; // Clear loading/empty message
        tableContainer.appendChild(table);

        // Add event listeners for view details buttons
        table.querySelectorAll('.view-details-list-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const dbId = event.target.getAttribute('data-dbid');
                window.router.navigate(`/databases/${dbId}`);
            });
        });
    }

    goToCreateDbFormButton.addEventListener('click', () => {
        window.router.navigate('/databases/new');
    });

    document.addEventListener('viewchanged', (event) => {
        if (event.detail.sectionId === 'databaselist-section') {
            fetchDatabasesList();
        }
    });

    // Initial load if this section is active
    if (section.classList.contains('active')) {
        fetchDatabasesList();
    }
})();
