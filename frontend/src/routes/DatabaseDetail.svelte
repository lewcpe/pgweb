<script lang="ts">
  import { onMount } from 'svelte';
  import api from '../lib/api'; // Corrected path
  export let navigate: (path: string) => void; // For potential navigation from this page

  // This would typically come from a router parameter
  const pathParts = window.location.pathname.split('/');
  const databaseId = pathParts[pathParts.length - 1];

  let dbDetails: any = null; // Replace 'any' with a proper type
  let pgUsers: any[] = []; // Replace 'any'
  let isLoading = true;
  let error: string | null = null;

  let showCreateUserModal = false;
  let newPgUsername = "";

  onMount(async () => {
    try {
      // dbDetails = await api.getDatabaseDetails(databaseId);
      // pgUsers = await api.listPGUsers(databaseId);
      // Simulated API calls
      setTimeout(() => {
        dbDetails = { database_id: databaseId, pg_database_name: `db_${databaseId.substring(0,4)}`, status: 'active', owner_user_id: 'user123' };
        pgUsers = [
          { pg_user_id: 'pguser1', pg_username: 'reader_user', permission_level: 'read', status: 'active' },
          { pg_user_id: 'pguser2', pg_username: 'writer_user', permission_level: 'write', status: 'active' },
        ];
        isLoading = false;
      }, 1000);
    } catch (err) {
      error = (err as Error).message;
      isLoading = false;
    }
  });

  async function handleCreatePgUser() {
    if (!newPgUsername.trim()) {
      alert("PostgreSQL username cannot be empty.");
      return;
    }
    try {
      // const newUser = await api.createPGUser(databaseId, newPgUsername); // permission_level too
      // pgUsers = [...pgUsers, newUser];
      alert(`Simulating creation of PG user: ${newPgUsername} for DB ${databaseId}`); // Placeholder
      pgUsers = [...pgUsers, { pg_user_id: Math.random().toString(), pg_username: newPgUsername, permission_level: 'read', status: 'pending_creation' }];
      newPgUsername = "";
      showCreateUserModal = false;
    } catch (err) {
      alert(`Error creating PostgreSQL user: ${(err as Error).message}`);
    }
  }
</script>

<div>
  {#if isLoading}
    <p>Loading database details...</p>
  {:else if error}
    <p style="color: red;">Error loading details: {error}</p>
  {:else if !dbDetails}
    <p>Database not found.</p>
  {:else}
    <h2>Database: {dbDetails.pg_database_name}</h2>
    <p>Status: {dbDetails.status}</p>
    <p>ID: {dbDetails.database_id}</p>

    <h3>PostgreSQL Users</h3>
    <button on:click={() => showCreateUserModal = true}>Create New PG User</button>
    {#if pgUsers.length === 0}
      <p>No PostgreSQL users found for this database.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Permissions</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each pgUsers as user (user.pg_user_id)}
            <tr>
              <td>{user.pg_username}</td>
              <td>{user.permission_level}</td>
              <td>{user.status}</td>
              <td>
                <button>Regenerate Password</button>
                <!-- More actions -->
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

{#if showCreateUserModal}
<div class="modal">
  <div class="modal-content">
    <h3>Create New PostgreSQL User</h3>
    <input type="text" bind:value={newPgUsername} placeholder="Enter PG username" />
    <!-- Add permission level selector here -->
    <button on:click={handleCreatePgUser}>Create</button>
    <button on:click={() => showCreateUserModal = false}>Cancel</button>
  </div>
</div>
{/if}

<style>
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background-color: #f0f0f0; }
  button { margin-right: 5px; }
  .modal { /* Same as Dashboard modal style */
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0,0,0,0.5); display: flex;
    align-items: center; justify-content: center;
  }
  .modal-content { background-color: white; padding: 20px; border-radius: 5px; }
</style>
