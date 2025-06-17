<script lang="ts">
  // Import route components
  import { onMount } from 'svelte'; // Ensure onMount is imported
  import Login from './routes/Login.svelte';
  import Dashboard from './routes/Dashboard.svelte';
  import DatabaseDetail from './routes/DatabaseDetail.svelte'; // Corrected path
  import DatabaseList from './routes/DatabaseList.svelte';
  import DatabaseCreateForm from './routes/DatabaseCreateForm.svelte'; // Added DatabaseCreateForm import
  import AuthCallback from './routes/AuthCallback.svelte';
  import { authStore, setAuthenticated, setUnauthenticated, type User } from './lib/authStore';
  import api from './lib/api';

  let currentPath = window.location.pathname;
  let Component: any;

  let currentUser: User | null = null;
  let isAuthenticated: boolean = false;
  let isLoadingSession = true; // Optional: for showing a loading indicator

  async function checkCurrentUserSession() {
    try {
      const user = await api.getMe(); // Call /api/me
      if (user && user.id) { // Adjust 'user.id' based on your actual User model from backend
        setAuthenticated(user);
      } else {
        // No active session, or /api/me returned unexpected data
        setUnauthenticated();
      }
    } catch (error) {
      // Error calling /api/me (e.g., network error, 401 Unauthorized if no cookie)
      // This is an expected state if the user is not logged in.
      setUnauthenticated();
      console.log('Session check failed or no active session:', error.message);
    } finally {
      isLoadingSession = false; // Hide loading indicator
      // After checking session, update component based on current path and auth state
      // This is important because auth state might have changed
      updateComponentForPath(window.location.pathname);
    }
  }

  onMount(() => {
    checkCurrentUserSession();
  });

  authStore.subscribe(value => {
    const previousIsAuthenticated = isAuthenticated;
    isAuthenticated = value.isAuthenticated;
    currentUser = value.user;

    // If authentication status changes, or if we just finished loading the session,
    // re-evaluate the component for the current path.
    if (previousIsAuthenticated !== isAuthenticated || !isLoadingSession) {
       updateComponentForPath(window.location.pathname); // Use window.location.pathname to get the most current path
    }
  });

  async function handleLogout() {
    try {
      // Optional: Call a backend logout endpoint if your OIDC setup requires it
      // await api.logout();

      const oidcLogoutUrl = import.meta.env.VITE_OIDC_LOGOUT_URL || 'http://localhost:8080/auth/oidc/logout';

      // Clear local auth state first
      setUnauthenticated();

      // Redirect to OIDC provider for logout
      window.location.href = oidcLogoutUrl;
    } catch (error) {
      console.error('Logout failed:', error);
      setUnauthenticated(); // Ensure local state is cleared
      navigate('/login'); // Fallback redirect to login
    }
  }

  function updateComponentForPath(path: string) {
    if (!isAuthenticated && path !== '/login' && path !== '/auth/callback') {
      // If not authenticated and trying to access a protected route,
      // redirect to /login by calling navigate.
      // The navigate function itself will then call updateComponentForPath again.
      navigate('/login');
      return;
    }

    if (path === '/login') {
      Component = Login;
    } else if (path === '/auth/callback') {
      Component = AuthCallback;
    } else if (isAuthenticated && path === '/databases') {
      Component = DatabaseList;
    } else if (isAuthenticated && path === '/databases/new') { // Added route for DatabaseCreateForm
      Component = DatabaseCreateForm;
    } else if (isAuthenticated && path.startsWith('/databases/')) {
      Component = DatabaseDetail;
    } else if (isAuthenticated && path === '/') {
      Component = Dashboard;
    } else if (isAuthenticated) {
      // Authenticated user on an unknown path, redirect to Dashboard
      navigate('/');
    } else {
      // Unauthenticated user on a path other than /login or /auth/callback (should be caught by the guard above)
      // If somehow reached, ensure Component is Login
      Component = Login;
    }
  }

  // Initial component determination
  // updateComponentForPath(currentPath); // This will now be called by authStore subscription or checkCurrentUserSession

  // Listen to popstate events
  window.addEventListener('popstate', () => {
    currentPath = window.location.pathname;
    updateComponentForPath(currentPath);
  });

  // Updated navigate function
  function navigate(path: string) {
    if (!isAuthenticated && path !== '/login' && path !== '/auth/callback') {
      // If trying to navigate to a protected route while logged out,
      // change path to /login.
      currentPath = '/login';
      window.history.pushState({}, '', currentPath);
    } else {
      currentPath = path;
      window.history.pushState({}, '', currentPath);
    }
    updateComponentForPath(currentPath);
  }
</script>

<main>
  {#if isLoadingSession}
    <div><p>Loading session...</p></div>
  {:else}
    <header>
      <h1>PostgreSQL Self-Service</h1>
      <nav>
        {#if isAuthenticated}
          <a href="/" on:click|preventDefault={() => navigate('/')}>Dashboard</a> |
          <a href="/databases" on:click|preventDefault={() => navigate('/databases')}>Databases</a> |
          <span>Welcome, {currentUser?.username || 'User'}!</span> |
          <button on:click|preventDefault={handleLogout} class="logout-button">Logout</button>
        {:else}
          <a href="/login" on:click|preventDefault={() => navigate('/login')}>Login</a>
        {/if}
      </nav>
    </header>

    {#if isAuthenticated}
      <svelte:component this={Component} {navigate} />
    {:else if currentPath === '/login' || currentPath === '/auth/callback'}
      <!-- Allow Login and AuthCallback components if not authenticated -->
      <svelte:component this={Component} {navigate} />
    {:else}
      <!--
        This block should ideally not be reached if !isAuthenticated
        and path is not /login or /auth/callback, due to the redirect
        in updateComponentForPath.
        If it is reached, it means updateComponentForPath didn't redirect,
        so we explicitly render Login or nothing.
        Forcing a render of Login if not authenticated and not on an allowed public path.
        Component might be undefined here if initial path was protected and unauthenticated.
      -->
      <svelte:component this={Login} {navigate} />
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f4f4f4;
  }
  main {
    padding: 1em;
    max-width: 1200px;
    margin: auto;
  }
  header {
    background-color: #333;
    color: white;
    padding: 1em;
    text-align: center;
  }
  nav a {
    color: white;
    margin: 0 0.5em;
    text-decoration: none;
  }
  nav a:hover {
    text-decoration: underline;
  }
</style>
