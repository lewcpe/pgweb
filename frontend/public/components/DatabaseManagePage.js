// frontend/public/components/DatabaseManagePage.js
(function() {
    const section = document.getElementById('databasemanage-section'); // Updated section ID
    const dbManageName = document.getElementById('db-manage-name'); // Updated ID
    const dbDetailContent = document.getElementById('db-detail-content'); // ID remains same as per index.html
    const loadingIndicator = document.getElementById('db-detail-loading'); // ID remains same
    const errorIndicator = document.getElementById('db-detail-error'); // ID remains same
    const backToMainDbListButton = document.getElementById('back-to-main-db-list'); // Updated ID

    const pgUsersTableContainer = document.getElementById('pg-users-table-container-manage'); // Updated ID
    const showCreatePgUserDialogButton = document.getElementById('show-create-pg-user-modal-manage'); // Updated ID
    const createPgUserDialog = document.getElementById('create-pg-user-dialog'); // Dialog ID is global, remains same
    const createPgUserFormInDialog = document.getElementById('create-pg-user-form'); // Form ID in dialog, remains same
    const pgUsernameInput = document.getElementById('pgUsernameInput'); // Input in dialog
    const pgUserPermissionInput = document.getElementById('pgUserPermissionInput'); // Input in dialog
    const pgUserDbIdInput = document.getElementById('pgUserDbId'); // Hidden input in dialog
    const pgUserModalError = document.getElementById('create-pg-user-modal-error'); // Error p in dialog
    const pgUserGlobalError = document.getElementById('pg-user-error-manage'); // Updated ID for page-level errors
    const pgUserGlobalSuccess = document.getElementById('pg-user-success-manage'); // Updated ID for page-level success

    let currentDbId = null;
    let dbDetails = null;
    let pgUsers = [];

    async function fetchDatabaseDetails(databaseId) {
        setLoading(loadingIndicator.id, true);
        displayError(errorIndicator.id, '');
        displaySuccess(pgUserGlobalSuccess.id, ''); // Clear user-related success messages
        displayError(pgUserGlobalError.id, '');   // Clear user-related error messages
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
            displayError(errorIndicator.id, `Error loading details: ${err.message || 'Unknown error'}`);
            dbManageName.textContent = 'Database Management'; // Reset title
        } finally {
            setLoading(loadingIndicator.id, false);
        }
    }

    function renderDatabaseDetails() {
        if (!dbDetails) {
            dbManageName.textContent = 'Database Not Found';
            dbDetailContent.innerHTML = '<p>Could not load database details.</p>';
            return;
        }
        dbManageName.textContent = `Manage Database: ${dbDetails.pg_database_name}`;
        dbDetailContent.innerHTML = `
            <p><strong>Status:</strong> ${dbDetails.status}</p>
            <p><strong>Database ID:</strong> <code>${dbDetails.database_id}</code></p>
            <p><strong>Owner User ID:</strong> <code>${dbDetails.owner_user_id || 'N/A'}</code></p>
            <p><strong>Created At:</strong> ${new Date(dbDetails.created_at).toLocaleString()}</p>
            <p><strong>Internal Host:</strong> <code>${dbDetails.internal_host || 'N/A'}</code></p>
            <p><strong>External Host:</strong> <code>${dbDetails.external_host || 'N/A'}</code></p>
            <p><strong>Port:</strong> <code>${dbDetails.port || 'N/A'}</code></p>
            <p><strong>Default Username:</strong> <code>${dbDetails.default_user || 'N/A'}</code></p>
            <!-- Add more details as needed -->
        `;
    }

    function renderPgUsersTable() {
        // Clear previous messages related to PG users before re-rendering table
        displayError(pgUserGlobalError.id, '');
        // Do not clear success messages here, they should persist until next action or navigation

        if (pgUsers.length === 0) {
            pgUsersTableContainer.innerHTML = '<p>No PostgreSQL users found for this database. You can create one.</p>';
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
            tr.setAttribute('data-pguserid', user.pg_user_id); // For easier row removal
            tr.innerHTML = `
                <td>${user.pg_username}</td>
                <td>${user.permission_level}</td>
                <td>${user.status}</td>
                <td>
                    <button data-userid="${user.pg_user_id}" data-username="${user.pg_username}" class="regenerate-pw-btn">Regenerate Password</button>
                    <button data-userid="${user.pg_user_id}" data-username="${user.pg_username}" class="delete-pg-user-btn" style="background-color: var(--pico-muted-error-background); color: var(--pico-muted-error-foreground);">Delete User</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        pgUsersTableContainer.innerHTML = ''; // Clear "no users" message or old table
        pgUsersTableContainer.appendChild(table);

        // Add event listeners for regenerate password buttons
        table.querySelectorAll('.regenerate-pw-btn').forEach(button => {
            button.addEventListener('click', handleRegeneratePassword);
        });
        // Add event listeners for delete user buttons
        table.querySelectorAll('.delete-pg-user-btn').forEach(button => {
            button.addEventListener('click', handleDeletePgUser);
        });
    }

    async function handleRegeneratePassword(event) {
        const userId = event.target.getAttribute('data-userid');
        const username = event.target.getAttribute('data-username');
        if (confirm(`Are you sure you want to regenerate the password for user "${username}"?`)) {
            try {
                const result = await window.api.regeneratePGUserPassword(currentDbId, userId);
                displaySuccess(pgUserGlobalSuccess.id, `New password for ${username}: ${result.new_password}. Please save it securely.`);
                displayError(pgUserGlobalError.id, ''); // Clear any previous errors
            } catch (err) {
                console.error("Error regenerating password:", err);
                displayError(pgUserGlobalError.id, `Failed to regenerate password for ${username}: ${err.body?.message || err.message}`);
                displaySuccess(pgUserGlobalSuccess.id, ''); // Clear any previous success messages
            }
        }
    }

    async function handleDeletePgUser(event) {
        const userId = event.target.getAttribute('data-userid');
        const username = event.target.getAttribute('data-username');

        if (confirm(`Are you sure you want to delete the PostgreSQL user "${username}"? This action cannot be undone.`)) {
            // Consider adding a loading state specific to the user table if needed
            try {
                await window.api.deletePGUser(currentDbId, userId); // Assumes api.js will have this
                displaySuccess(pgUserGlobalSuccess.id, `PostgreSQL user "${username}" deleted successfully.`);
                displayError(pgUserGlobalError.id, ''); // Clear any previous errors

                // Refresh user list
                pgUsers = pgUsers.filter(user => user.pg_user_id !== userId);
                if (pgUsers.length === 0) {
                     pgUsersTableContainer.innerHTML = '<p>No PostgreSQL users found for this database. You can create one.</p>';
                } else {
                    // More efficient: remove the specific row
                    const rowToRemove = pgUsersTableContainer.querySelector(`tr[data-pguserid="${userId}"]`);
                    if (rowToRemove) {
                        rowToRemove.remove();
                    } else { // Fallback to re-render (should not happen ideally)
                        renderPgUsersTable(); // This will clear success message, so we re-display it if needed after re-render.
                        // Re-displaying might be complex if renderPgUsersTable clears it.
                        // For now, direct DOM manipulation is better.
                    }
                }
            } catch (err) {
                console.error(`Error deleting PG user ${username} (ID: ${userId}):`, err);
                displayError(pgUserGlobalError.id, `Error deleting user "${username}": ${err.body?.message || err.message}`);
                displaySuccess(pgUserGlobalSuccess.id, ''); // Clear any previous success messages
            }
        }
    }

    if (showCreatePgUserDialogButton) {
        showCreatePgUserDialogButton.addEventListener('click', () => {
            if (createPgUserDialog) {
                pgUsernameInput.value = '';
                pgUserPermissionInput.value = 'read'; // Default permission
                displayError(pgUserModalError.id, ''); // Clear previous dialog errors
                createPgUserDialog.showModal();
                pgUsernameInput.focus();
            } else {
                console.error("Create PG User Dialog (manage page) not found");
            }
        });
    } else {
        console.error("Show Create PG User Dialog Button (manage page) not found. ID: show-create-pg-user-modal-manage");
    }


    if (createPgUserFormInDialog) {
        createPgUserFormInDialog.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = pgUsernameInput.value.trim();
            const permission = pgUserPermissionInput.value;
            const databaseId = pgUserDbIdInput.value;

            if (!username) {
                displayError(pgUserModalError.id, "PostgreSQL username cannot be empty.");
                return;
            }
            if (username.length < 3 || username.length > 63 || !/^[a-z][a-z0-9_]*$/.test(username) || username.startsWith('pg_')) {
                displayError(pgUserModalError.id, "Invalid PostgreSQL username format or length (3-63, starts with letter, a-z0-9_, no pg_ prefix).");
                return;
            }
            displayError(pgUserModalError.id, '');

            try {
                const newUser = await window.api.createPGUser(databaseId, username, permission);
                pgUsers.push(newUser);
                renderPgUsersTable(); // Re-render
                if (createPgUserDialog) createPgUserDialog.close();
                // Display success message using the page-level success element
                displaySuccess(pgUserGlobalSuccess.id, `User ${newUser.pg_username} created. Password: ${newUser.password || 'Use generated password from backend'}. Please save it securely.`);
                displayError(pgUserGlobalError.id, ''); // Clear any previous page errors
            } catch (err) {
                console.error("Error creating PostgreSQL user:", err);
                const message = err.body?.message || err.message;
                displayError(pgUserModalError.id, `Error: ${message}`); // Show error in modal
            }
        });
    } else {
        console.error("Create PG User Form in Dialog not found");
    }

    if (backToMainDbListButton) {
        backToMainDbListButton.addEventListener('click', () => {
            window.router.navigate('/'); // Navigate to the main database list (front page)
        });
    } else {
         console.error("Back to Main DB List button not found. ID: back-to-main-db-list");
    }


    document.addEventListener('viewchanged', (event) => {
        if (event.detail.sectionId === 'databasemanage-section') { // Listen for the correct section ID
            const dbId = event.detail.id;
            if (dbId) {
                fetchDatabaseDetails(dbId);
            } else {
                displayError(errorIndicator.id, 'No database ID provided for management view.');
                dbManageName.textContent = 'Database Management';
            }
        } else {
            // Clear sensitive info if navigating away from this page
            dbManageName.textContent = 'Database Management';
            dbDetailContent.innerHTML = '';
            pgUsersTableContainer.innerHTML = '';
            displayError(errorIndicator.id, '');
            displayError(pgUserGlobalError.id, '');
            displaySuccess(pgUserGlobalSuccess.id, '');
            currentDbId = null;
            // dbDetails = null; // Already cleared by emptying content
            // pgUsers = [];
        }
    });

    // Initial load if this section is active (e.g. direct navigation to a DB manage URL)
    if (section && section.classList.contains('active')) {
        const path = window.router.getCurrentPath();
        if (path.startsWith('/databases/') && path.endsWith('/manage')) {
            const pathParts = path.split('/');
            const dbId = pathParts[2];
            if (dbId) {
                 fetchDatabaseDetails(dbId);
            }
        }
    }
})();
