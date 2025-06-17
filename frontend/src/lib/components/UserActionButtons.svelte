<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /**
   * @typedef {Object} PgUser
   * @property {string} pg_user_id
   * @property {string} pg_username
   * @property {'read' | 'write'} permission_level
   * @property {string} status
   */

  /** @type {PgUser} */
  export let user;
  export let onRegenerate: () => void;
  // export let onDelete: () => void; // Future: for deleting a PG user

  const dispatch = createEventDispatcher();

  function handleRegenerate() {
    if (onRegenerate) {
      onRegenerate();
    }
  }

  // function handleDelete() {
  //   if (onDelete) {
  //     onDelete();
  //   }
  // }
</script>

<div class="flex space-x-1">
  <button 
    on:click={handleRegenerate}
    class="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold py-1 px-2 rounded"
    title="Regenerate Password for {user.pg_username}"
    disabled={user.status !== 'active'}
  >
    Regen Pwd
  </button>
  <!-- 
  <button 
    on:click={handleDelete}
    class="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-1 px-2 rounded"
    title="Delete User {user.pg_username}"
    disabled={user.status !== 'active'}
  >
    Delete
  </button> 
  -->
</div>