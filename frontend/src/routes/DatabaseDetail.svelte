<script lang="ts">
  import { onMount } from 'svelte';
  import api from '$lib/api'; // Corrected path to $lib
  import SvelteTable from 'svelte-table'; // For PG Users table
  import UserActionButtons from '$lib/components/UserActionButtons.svelte';
  
  export let navigate: (path: string) => void;

  /**
   * @typedef {Object} DbDetails
   * @property {string} database_id
   * @property {string} pg_database_name
   * @property {string} status
   * @property {string} owner_user_id // Assuming this comes from API
   * @property {string} created_at
   * // Add other fields as per your API response for GET /databases/{database_id}
   */

  /**
   * @typedef {Object} PgUser
   * @property {string} pg_user_id
   * @property {string} pg_username
   * @property {'read' | 'write'} permission_level
   * @property {string} status // e.g., 'active', 'pending_creation'
   * @property {string} [password] // Only present on creation/regeneration
   */

  const pathParts = window.location.pathname.split('/');
  const databaseId = pathParts[pathParts.length - 1];

  /** @type {DbDetails | null} */
  let dbDetails = null;
  /** @type {PgUser[]} */
  let pgUsers = [];
  let isLoading = true;
  let error: string | null = null;
  let pgUserError: string | null = null;
  let pgUserSuccess: string | null = null;


  let showCreateUserModal = false;
  let newPgUsername = "";
  /** @type {'read' | 'write'} */
  let newPgUserPermission = 'read';
  let isSubmittingUser = false;

  async function fetchData() {
    console.log("Loading user data");
    isLoading = true;
    error = null;
    try {
      dbDetails = await api.getDatabaseDetails(databaseId);
      pgUsers = await api.listPGUsers(databaseId) || []; // Ensure pgUsers is an array
    } catch (err) {
      console.error("Error fetching database details or PG users:", err);
      error = err instanceof Error ? err.message : 'Failed to load data.';
    } finally {
      isLoading = false;
    }
  }

  onMount(fetchData);

  async function handleCreatePgUser() {
    if (!newPgUsername.trim()) {
      pgUserError = "PostgreSQL username cannot be empty.";
      return;
    }
    // Basic validation for pg_username (as per API.md)
    if (newPgUsername.length < 3 || newPgUsername.length > 63 || !/^[a-z][a-z0-9_]*$/.test(newPgUsername) || newPgUsername.startsWith('pg_')) {
        pgUserError = "Invalid PostgreSQL username format or length.";
        return;
    }

    isSubmittingUser = true;
    pgUserError = null;
    pgUserSuccess = null;
    try {
      const newUser = await api.createPGUser(databaseId, newPgUsername, newPgUserPermission);
      pgUsers = [...pgUsers, newUser]; // Add new user to the list
      pgUserSuccess = `User ${newUser.pg_username} created. Password: ${newUser.password || 'Check API response'}`;
      newPgUsername = "";
      newPgUserPermission = 'read';
      showCreateUserModal = false;
      setTimeout(() => pgUserSuccess = null, 10000); // Clear success message
    } catch (err) {
      console.error("Error creating PostgreSQL user:", err);
      pgUserError = err instanceof Error ? err.message : 'Failed to create user.';
    } finally {
      isSubmittingUser = false;
    }
  }

 const pgUserTableColumns = [
   { key: 'pg_username', title: 'Username', sortable: true },
   { key: 'permission_level', title: 'Permissions', sortable: true },
   { key: 'status', title: 'Status', sortable: true },
   {
     key: 'actions',
     title: 'Actions',
     renderValue: (/** @type {PgUser} */ user) => ({
       component: UserActionButtons, // This will be a new component
       props: { user, onRegenerate: () => handleRegeneratePassword(user.pg_user_id, user.pg_username) }
     })
   }
 ];

   function openCreateUserModal() {
    console.log("Create User Model");
    // Clear any previous errors when opening the modal
    pgUserError = null;
    newPgUsername = "";
    newPgUserPermission = 'read';
    showCreateUserModal = true;
  }


  async function handleRegeneratePassword(pgUserId: string, pgUsername: string) {
    if (!confirm(`Are you sure you want to regenerate the password for ${pgUsername}?`)) return;
    pgUserError = null;
    pgUserSuccess = null;
    try {
      const result = await api.regeneratePGUserPassword(databaseId, pgUserId);
      pgUserSuccess = `New password for ${pgUsername}: ${result.password}. Please save it securely.`;
      // No need to refetch users, password is not stored in the list view
      setTimeout(() => pgUserSuccess = null, 15000); // Clear success message
    } catch (err) {
      console.error("Error regenerating password:", err);
      pgUserError = err instanceof Error ? err.message : 'Failed to regenerate password.';
    }
  }


</script>

<div class="container mx-auto p-4">
  {#if isLoading}
    <p>Loading database details...</p>
  {:else if error}
    <p class="text-red-500 bg-red-100 p-3 rounded-md">Error loading details: {error}</p>
  {:else if !dbDetails}
    <p class="text-orange-500 bg-orange-100 p-3 rounded-md">Database not found.</p>
  {:else}
    <div class="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
      <div class="px-4 py-5 sm:px-6">
        <h2 class="text-2xl font-bold leading-tight text-gray-900">Database: {dbDetails.pg_database_name}</h2>
        <p class="mt-1 max-w-2xl text-sm text-gray-500">Details and configuration.</p>
      </div>
      <div class="border-t border-gray-200 px-4 py-5 sm:p-0">
        <dl class="sm:divide-y sm:divide-gray-200">
          <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt class="text-sm font-medium text-gray-500">Status</dt>
            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
              <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                    class:bg-green-100={dbDetails.status === 'active'} class:text-green-800={dbDetails.status === 'active'}
                    class:bg-yellow-100={dbDetails.status?.includes('pending')} class:text-yellow-800={dbDetails.status?.includes('pending')}
                    class:bg-red-100={dbDetails.status?.includes('delete')} class:text-red-800={dbDetails.status?.includes('delete')}
              >
                {dbDetails.status}
              </span>
            </dd>
          </div>
          <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt class="text-sm font-medium text-gray-500">Database ID</dt>
            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono">{dbDetails.database_id}</dd>
          </div>
          <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt class="text-sm font-medium text-gray-500">Owner User ID</dt>
            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono">{dbDetails.owner_user_id || 'N/A'}</dd>
          </div>
           <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt class="text-sm font-medium text-gray-500">Created At</dt>
            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{new Date(dbDetails.created_at).toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="mb-6">
      <h3 class="text-xl font-semibold mb-3 text-gray-800">PostgreSQL Users</h3>
      <button on:click={openCreateUserModal} class="mb-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
        Create New PG User
      </button>
      
      {#if pgUserError}
        <p class="my-2 text-sm text-red-600 bg-red-100 p-3 rounded-md">{pgUserError}</p>
      {/if}
      {#if pgUserSuccess}
        <p class="my-2 text-sm text-green-600 bg-green-100 p-3 rounded-md">{pgUserSuccess}</p>
      {/if}

      {#if pgUsers.length === 0}
        <p class="text-gray-600">No PostgreSQL users found for this database.</p>
      {:else}
        <SvelteTable
          columns={pgUserTableColumns}
          rows={pgUsers}
          classTable="min-w-full divide-y divide-gray-200 shadow sm:rounded-lg"
          classThead="bg-gray-50"
          classTh="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
          classTbody="bg-white divide-y divide-gray-200"
          classTr="hover:bg-gray-50"
          classTd="px-6 py-4 whitespace-nowrap text-sm"
        />
      {/if}
    </div>
     <button type="button" on:click={() => navigate('/databases')} class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none">
        Back to Databases
      </button>
  {/if}
</div>

<!-- Modal for creating a new PostgreSQL user -->
{#if showCreateUserModal}
  <div id="create-user-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-50" on:click|self={() => { showCreateUserModal = false; pgUserError = null; }}>
    <div class="relative mx-auto p-6 border w-full max-w-md shadow-lg rounded-md bg-white" on:click|stopPropagation>
      <div class="mt-3">
        <h3 class="text-lg leading-6 font-medium text-gray-900 text-center">Create New PostgreSQL User</h3>
        <form on:submit|preventDefault={handleCreatePgUser} class="mt-4 space-y-4">
          <div>
            <label for="pgUsername" class="block text-sm font-medium text-gray-700">Username:</label>
            <input
              type="text"
              id="pgUsername"
              bind:value={newPgUsername}
              class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="e.g., my_app_user"
              required
            />
          </div>
          <div>
            <label for="pgUserPermission" class="block text-sm font-medium text-gray-700">Permission Level:</label>
            <select
              id="pgUserPermission"
              bind:value={newPgUserPermission}
              class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="read">Read-only</option>
              <option value="write">Read/Write</option>
            </select>
          </div>
          {#if pgUserError}
            <p class="text-sm text-red-600 bg-red-100 p-2 rounded-md">{pgUserError}</p>
          {/if}
          <div class="flex justify-end items-center pt-4 space-x-2">
            <button
              type="button"
              on:click={() => { showCreateUserModal = false; pgUserError = null; }}
              class="px-4 py-2 bg-gray-200 text-gray-700 text-base font-medium rounded-md hover:bg-gray-300 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingUser}
              class="px-4 py-2 bg-blue-600 text-white text-base font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {#if isSubmittingUser} Creating... {:else} Create User {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

