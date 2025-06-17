<script lang="ts">
  /**
   * @typedef {Object} Database
   * @property {string} database_id
   * @property {string} pg_database_name
   * @property {string} status
   * @property {string} created_at
   */
  
  /** @type {Database} */
  export let database;
  /** @type {(path: string) => void} */
  export let navigateFn;

  function handleViewDetails() {
    if (navigateFn && database && database.database_id) {
      navigateFn(`/databases/${database.database_id}`);
    }
  }

  // Placeholder for delete functionality
  function handleDelete() {
    if (database && database.database_id) {
      // TODO: Implement delete confirmation and API call
      alert(`Delete database ${database.pg_database_name} (ID: ${database.database_id}) - (Not implemented yet)`);
    }
  }
</script>

<div class="flex space-x-2">
  <button 
    on:click={handleViewDetails} 
    class="bg-blue-500 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2 rounded"
    title="View Details"
  >
    View
  </button>
  <button 
    on:click={handleDelete} 
    class="bg-red-500 hover:bg-red-700 text-white text-xs font-bold py-1 px-2 rounded"
    title="Delete Database"
    disabled={database?.status === 'soft_deleted' || database?.status === 'pending_deletion'}
  >
    Delete
  </button>
</div>