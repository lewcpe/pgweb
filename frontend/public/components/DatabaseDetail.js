// frontend/public/components/DatabaseDetail.js
(function() {
    const section = document.getElementById('databasedetail-section');
    const dbDetailName = document.getElementById('db-detail-name');
    const dbDetailContent = document.getElementById('db-detail-content');
    const loadingIndicator = document.getElementById('db-detail-loading');
    const errorIndicator = document.getElementById('db-detail-error');
    const backToDbListButton = document.getElementById('back-to-db-list');

    const pgUsersTableContainer = document.getElementById('pg-users-table-container');
    const showCreatePgUserDialogButton = document.getElementById('show-create-pg-user-modal'); // Button ID remains the same
    const createPgUserDialog = document.getElementById('create-pg-user-dialog'); // Changed ID
    const createPgUserFormInDialog = document.getElementById('create-pg-user-form'); // Form ID remains the same
    const pgUsernameInput = document.getElementById('pgUsernameInput');
    const pgUserPermissionInput = document.getElementById('pgUserPermissionInput');
    const pgUserDbIdInput = document.getElementById('pgUserDbId'); // Hidden input to store current DB ID for the modal
    const pgUserModalError = document.getElementById('create-pg-user-modal-error');
    const pgUserGlobalError = document.getElementById('pg-user-error');
    const pgUserGlobalSuccess = document.getElementById('pg-user-success');


    let currentDbId = null;
    let dbDetails = null;
    let pgUsers = [];

    async function fetchDatabaseDetails(databaseId) {
        setLoading('db-detail-loading', true);
        displayError('db-detail-error', '');
        dbDetailContent.innerHTML = '';
        pgUsersTableContainer.innerHTML = '';
        currentDbId = databaseId; // Store currentDbId
        pgUserDbIdInput.value = databaseId; // Set for the modal form

        try {
            dbDetails = await window.api.getDatabaseDetails(databaseId);
            pgUsers = await window.api.listPGUsers(databaseId) || [];
            renderDatabaseDetails();
            renderPgUsersTable();
        } catch (err) {
            console.error(`Error loading details for database ${databaseId}:`, err);
            displayError('db-detail-error', `Error loading details: ${err.message}`);
            dbDetailName.textContent = 'Database Details';
        } finally {
            setLoading('db-detail-loading', false);
        }
    }

    function renderDatabaseDetails() {
        if (!dbDetails) {
            dbDetailName.textContent = 'Database Not Found';
            dbDetailContent.innerHTML = '<p>Could not load database details.</p>';
            return;
        }
        dbDetailName.textContent = `Database: ${dbDetails.pg_database_name}`;
        // Basic display, can be enhanced with a definition list or more structure
        dbDetailContent.innerHTML = `
            <dl>
                <dt>Status:</dt><dd>${dbDetails.status}</dd>
                <dt>Database ID:</dt><dd><mono>${dbDetails.database_id}</mono></dd>
                <dt>Owner User ID:</dt><dd><mono>${dbDetails.owner_user_id || 'N/A'}</mono></dd>
                <dt>Created At:</dt><dd>${new Date(dbDetails.created_at).toLocaleString()}</dd>
            </dl>
        `;
    }

    function renderPgUsersTable() {
        displayError('pg-user-error', ''); // Clear global pg user error
        // displaySuccess('pg-user-success', ''); // Clear global success

        if (pgUsers.length === 0) {
            pgUsersTableContainer.innerHTML = '<p>No PostgreSQL users found for this database.</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Permissions</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        pgUsers.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.pg_username}</td>
                <td>${user.permission_level}</td>
                <td>${user.status}</td>
                <td>
                    <button data-userid="${user.pg_user_id}" data-username="${user.pg_username}" class="regenerate-pw-btn">Regenerate Password</button>
                    <!-- Delete user button can be added here -->
                </td>
            `;
            tbody.appendChild(tr);
        });
        pgUsersTableContainer.innerHTML = '';
        pgUsersTableContainer.appendChild(table);

        // Add event listeners for regenerate password buttons
        table.querySelectorAll('.regenerate-pw-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const userId = event.target.getAttribute('data-userid');
                const username = event.target.getAttribute('data-username');
                if (confirm(`Are you sure you want to regenerate the password for ${username}?`)) {
                    try {
                        const result = await window.api.regeneratePGUserPassword(currentDbId, userId);
                        displaySuccess('pg-user-success', `New password for ${username}: ${result.new_password}. Please save it securely.`);
                        // No need to refetch users, list doesn't show password
                    } catch (err) {
                        console.error("Error regenerating password:", err);
                        displayError('pg-user-error', `Failed to regenerate password: ${err.message}`);
                    }
                }
            });
        });
    }

    showCreatePgUserDialogButton.addEventListener('click', () => {
        if (createPgUserDialog) {
            pgUsernameInput.value = '';
            pgUserPermissionInput.value = 'read'; // Default permission
            displayError('create-pg-user-modal-error', ''); // Clear previous dialog errors
            createPgUserDialog.showModal();
            pgUsernameInput.focus();
        } else {
            console.error("Create PG User Dialog not found");
        }
    });

    if (createPgUserFormInDialog) {
        createPgUserFormInDialog.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = pgUsernameInput.value.trim();
            const permission = pgUserPermissionInput.value;
            const databaseId = pgUserDbIdInput.value; // Get dbId from hidden input

            if (!username) {
                displayError('create-pg-user-modal-error', "PostgreSQL username cannot be empty.");
                return;
            }
            // Basic validation (from Svelte component)
            if (username.length < 3 || username.length > 63 || !/^[a-z][a-z0-9_]*$/.test(username) || username.startsWith('pg_')) {
                displayError('create-pg-user-modal-error', "Invalid PostgreSQL username format or length (3-63, starts with letter, a-z0-9_, no pg_ prefix).");
                return;
            }

            displayError('create-pg-user-modal-error', '');

            try {
                // Current api.js: createPGUser: (databaseId, username, permission_level) => request('POST', `/databases/${databaseId}/pgusers`, { username, permission_level }),
                // This seems correct if backend expects { "username": "...", "permission_level": "..." }
                const newUser = await window.api.createPGUser(databaseId, username, permission);
                pgUsers.push(newUser);
                renderPgUsersTable(); // Re-render
                if (createPgUserDialog) createPgUserDialog.close();
                displaySuccess('pg-user-success', `User ${newUser.pg_username} created. Password: ${newUser.password || 'Use generated password from backend'}. Please save it securely.`);
            } catch (err) {
                console.error("Error creating PostgreSQL user:", err);
                const message = err.body?.message || err.message;
                displayError('create-pg-user-modal-error', `Error: ${message}`);
            }
        });
    } else {
        console.error("Create PG User Form in Dialog not found");
    }

    backToDbListButton.addEventListener('click', () => {
        window.router.navigate('/databases');
    });

    document.addEventListener('viewchanged', (event) => {
        if (event.detail.sectionId === 'databasedetail-section') {
            const dbId = event.detail.id;
            if (dbId) {
                fetchDatabaseDetails(dbId);
            } else {
                // This case should ideally be handled by router redirecting to a valid page
                displayError('db-detail-error', 'No database ID provided.');
                dbDetailName.textContent = 'Database Details';
            }
        } else {
            // Clear sensitive info if navigating away from this page
            dbDetailName.textContent = 'Database Details';
            dbDetailContent.innerHTML = '';
            pgUsersTableContainer.innerHTML = '';
            displayError('pg-user-error', '');
            displaySuccess('pg-user-success', '');
            currentDbId = null;
        }
    });

    // Initial load if this section is active (e.g. direct navigation to a DB detail URL)
    if (section.classList.contains('active')) {
        const pathParts = window.location.pathname.split('/');
        const dbId = pathParts.length > 2 && pathParts[1] === 'databases' ? pathParts[2] : null;
        if (dbId && !dbId.endsWith('new')) { // ensure it's not /databases/new
             fetchDatabaseDetails(dbId);
        }
    }
})();
