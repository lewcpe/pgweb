<script lang="ts">
  import { onMount } from 'svelte';
  import api from '$lib/api';

  export let navigate: (path: string) => void;

  let dbName = '';
  let isLoading = false;
  let error: string | null = null;
  let successMessage: string | null = null;

  // Database name validation rules from API.md:
  // 3-63 chars, alphanumeric, underscores, hyphens, start/end with alphanumeric,
  // no "pg_" or "postgres" prefix.
  let nameError: string | null = null;

  function validateDbName(name: string): boolean {
    nameError = null;
    if (name.length < 3 || name.length > 63) {
      nameError = 'Name must be between 3 and 63 characters.';
      return false;
    }
    if (!/^[a-zA-Z0-9]/.test(name) || !/[a-zA-Z0-9]$/.test(name)) {
      nameError = 'Name must start and end with an alphanumeric character.';
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      nameError = 'Name can only contain alphanumeric characters, underscores, and hyphens.';
      return false;
    }
    if (name.startsWith('pg_') || name.startsWith('postgres')) {
      nameError = 'Name cannot start with "pg_" or "postgres".';
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    error = null;
    successMessage = null;
    if (!validateDbName(dbName)) {
      return;
    }

    isLoading = true;
    try {
      const newDb = await api.createDatabase(dbName);
      successMessage = `Database "${newDb.pg_database_name || newDb.name}" created successfully! Status: ${newDb.status}`;
      // Optionally, navigate to the database list or detail page
      // navigate('/databases'); 
      // For now, just clear the form
      dbName = ''; 
      setTimeout(() => successMessage = null, 5000); // Clear message after 5s
    } catch (e) {
      console.error("Failed to create database:", e);
      error = e instanceof Error ? e.message : 'Failed to create database';
    } finally {
      isLoading = false;
    }
  }

  $: if (dbName) validateDbName(dbName); // Re-validate on change

</script>

<div class="container mx-auto p-4">
  <h2 class="text-2xl font-bold mb-6">Create New Database</h2>

  <form on:submit|preventDefault={handleSubmit} class="space-y-4 max-w-md">
    <div>
      <label for="dbName" class="block text-sm font-medium text-gray-700">Database Name:</label>
      <input 
        type="text" 
        id="dbName" 
        bind:value={dbName}
        class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none sm:text-sm"
        class:border-red-500={nameError}
        class:border-gray-300={!nameError}
        placeholder="my_new_database"
        required
        aria-describedby="name-error"
      />
      {#if nameError}
        <p id="name-error" class="mt-1 text-xs text-red-600">{nameError}</p>
      {/if}
    </div>

    {#if error}
      <p class="text-sm text-red-600 bg-red-100 p-3 rounded-md">{error}</p>
    {/if}
    {#if successMessage}
      <p class="text-sm text-green-600 bg-green-100 p-3 rounded-md">{successMessage}</p>
    {/if}

    <div class="flex items-center space-x-4">
      <button 
        type="submit" 
        disabled={isLoading || nameError || !dbName}
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {#if isLoading}
          Creating...
        {:else}
          Create Database
        {/if}
      </button>
      <button 
        type="button" 
        on:click={() => navigate('/databases')}
        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none"
      >
        Cancel
      </button>
    </div>
  </form>
</div>