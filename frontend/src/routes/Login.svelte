<script lang="ts">
  const oidcLoginUrl = import.meta.env.VITE_OIDC_LOGIN_URL || 'http://localhost:8080/auth/oidc/login';

  function handleLogin() {
    // In a real app, this would redirect to the backend which then redirects to OIDC
    window.location.href = oidcLoginUrl;
  }
</script>

<div>
  <h2>Login</h2>
  <p>Please log in to manage your PostgreSQL databases.</p>
  <button on:click={handleLogin}>Login with OIDC Provider</button>
</div>

<style>
  div { text-align: center; margin-top: 50px; }
  button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
</style>
