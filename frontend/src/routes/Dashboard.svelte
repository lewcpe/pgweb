<script lang="ts">
  import { onMount } from 'svelte';
  import api from '../lib/api'; // Corrected path
  export let navigate: (path: string) => void;


  let databases: any[] = []; // Replace 'any' with a proper type later
  let isLoading = true;
  let error: string | null = null;
  let showCreateModal = false;
  let newDbName = "";

  onMount(async () => {
    try {
      databases = await api.listDatabases();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      isLoading = false;
    }
  });

  async function handleCreateDatabase() {
    if (!newDbName.trim()) {
      alert("Database name cannot be empty.");
      return;
    }
    try {
      const newDb = await api.createDatabase(newDbName);
      databases = [...databases, newDb];
      newDbName = "";
      showCreateModal = false;
    } catch (err) {
      alert(`Error creating database: ${(err as Error).message}`);
    }
  }

  function viewDatabaseDetails(dbId: string) {
    navigate(`/databases/${dbId}`);
  }
</script>

<div>
  <h2>My Databases</h2>
  <button on:click={() => showCreateModal = true}>Create New Database</button>

  {#if isLoading}
    <p>Loading databases...</p>
  {:else if error}
    <p style="color: red;">Error loading databases: {error}</p>
  {:else if databases.length === 0}
    <p>No databases found. Create one!</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each databases as db (db.database_id)}
          <tr>
            <td>{db.pg_database_name}</td>
            <td>{db.status}</td>
            <td>
              <button on:click={() => viewDatabaseDetails(db.database_id)}>Details</button>
              <!-- Add more actions like delete, etc. -->
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if showCreateModal}
  <div class="modal">
    <div class="modal-content">
      <h3>Create New Database</h3>
      <input type="text" bind:value={newDbName} placeholder="Enter database name" />
      <button on:click={handleCreateDatabase}>Create</button>
      <button on:click={() => showCreateModal = false}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background-color: #f0f0f0; }
  button { margin-right: 5px; }
  .modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0,0,0,0.5); display: flex;
    align-items: center; justify-content: center;
  }
  .modal-content { background-color: white; padding: 20px; border-radius: 5px; }
</style>
