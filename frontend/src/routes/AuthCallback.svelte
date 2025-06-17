<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing'; // Or use the navigate function from App.svelte if passed as prop
  import { authStore, setAuthenticated, setUnauthenticated } from '../lib/authStore';
  import api from '../lib/api'; // Assuming api.ts exports default

  onMount(async () => {
    try {
      // In a real OIDC flow, the backend handles the code exchange
      // and establishes a session. This frontend callback page then
      // fetches user details to confirm session validity and get user info.
      const user = await api.getMe(); // Call the /api/me endpoint

      if (user && user.id) { // Adjust 'user.id' based on actual /api/me response
        setAuthenticated(user);
        window.location.href = '/'; // Redirect to Dashboard after login
      } else {
        // This case might happen if /api/me doesn't return a user even after OIDC login
        // or if the /api/me response is not as expected.
        console.error('AuthCallback: /api/me did not return a valid user.', user);
        setUnauthenticated('Login failed: Could not retrieve user details.');
        window.location.href = '/login'; // Redirect to Login page
      }
    } catch (error) {
      console.error('AuthCallback error:', error);
      setUnauthenticated(error.message || 'Login failed due to an error.');
      window.location.href = '/login'; // Redirect to Login page on error
    }
  });
</script>

<div>
  <p>Authenticating, please wait...</p>
</div>

<style>
  div {
    text-align: center;
    margin-top: 50px;
    font-style: italic;
  }
</style>
