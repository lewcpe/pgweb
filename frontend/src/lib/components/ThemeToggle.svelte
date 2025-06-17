<script lang="ts">
  import { theme } from '$lib/stores/theme';
  import type { Writable } from 'svelte/store';

  // Assuming 'Theme' type is defined in your theme.js or a .d.ts file
  // For now, let's define it here for clarity if not globally available.
  /**
   * @typedef {'light' | 'dark' | 'system'} ThemeType
   */

  /** @type {Writable<ThemeType>} */
  const currentTheme = theme;

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    currentTheme.set(target.value as ThemeType);
  }
</script>

<div>
  <label for="theme-select">Theme:</label>
  <select id="theme-select" value={$currentTheme} on:change={handleChange}>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
    <option value="system">System</option>
  </select>
</div>

<style>
  div {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 4px;
    background-color: #f0f0f0;
  }
  label {
    font-weight: bold;
  }
  select {
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #ccc;
  }
  .dark div {
    background-color: #333;
    color: #fff;
  }
  .dark select {
    background-color: #444;
    color: #fff;
    border-color: #555;
  }
</style>