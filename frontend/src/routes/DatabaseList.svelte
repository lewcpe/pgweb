<script lang="ts">
  import { onMount } from 'svelte';
  import api from '$lib/api';
  import SvelteTable from 'svelte-table';
  import ActionButtons from '$lib/components/ActionButtons.svelte';

  /**
   * @typedef {Object} Database
   * @property {string} database_id - The UUID of the database.
   * @property {string} pg_database_name - The actual name of the PostgreSQL database.
   * @property {string} status - The current status of the database (e.g., 'active', 'pending_creation', 'soft_deleted').
   * @property {string} created_at - ISO string for creation date.
   * @property {string} [owner_id] - Optional: UUID of the owner.
   */

  /** @type {Database[]} */
  let databases = [];
  let isLoading = true;
  /** @type {Error | null} */
  let error = null;

  // Props that might be passed by App.svelte's router
  export let navigate: (path: string) => void;

  onMount(async () => {
    isLoading = true;
    error = null;
    try {
      const result = await api.listDatabases();
      // Ensure result is an array, as API might return various structures
      databases = Array.isArray(result) ? result : [];
    } catch (e) {
      console.error("Failed to load databases:", e);
      error = e instanceof Error ? e : new Error('Failed to load databases');
    } finally {
      isLoading = false;
    }
  });
</script>

<div class="container mx-auto p-4">
  <h2 class="text-2xl font-bold mb-4">My Databases</h2>

  {#if isLoading}
    <p>Loading databases...</p>
  {:else if error}
    <p class="text-red-500">Error loading databases: {error.message}</p>
  {:else if databases.length === 0}
    <p>No databases found. <a href="/databases/new" on:click|preventDefault={() => navigate('/databases/new')} class="text-blue-500 hover:underline">Create one?</a></p>
  {:else}
    <SvelteTable
      columns={[
        { key: 'pg_database_name', title: 'Name', sortable: true, value: (row) => row.pg_database_name },
        { key: 'status', title: 'Status', sortable: true, value: (row) => row.status },
        {
          key: 'created_at',
          title: 'Created',
          sortable: true,
          value: (row) => new Date(row.created_at).toLocaleDateString()
        },
        {
          key: 'actions',
          title: 'Actions',
          value: (row) => row, // Pass the whole row for actions
          renderValue: (row) => ({
            component: ActionButtons, // We'll create this component next
            props: { database: row, navigateFn: navigate }
          })
        }
      ]}
      rows={databases}
      classTable="min-w-full divide-y divide-gray-200"
      classThead="bg-gray-50"
      classTh="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
      classTbody="bg-white divide-y divide-gray-200"
      classTr="hover:bg-gray-50"
      classTd="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
    />
  {/if}

  <div class="mt-6">
    <button on:click={() => navigate('/databases/new')} class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
      Create New Database
    </button>
  </div>
</div>