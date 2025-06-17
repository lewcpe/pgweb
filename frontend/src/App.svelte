<script lang="ts">
  // Import route components
  // This is a simple router placeholder. For a real app, use a library like svelte-routing or svelte-navigator.
  import Login from './routes/Login.svelte';
  import Dashboard from './routes/Dashboard.svelte';
  import DatabaseDetail from './routes/DatabaseDetail.svelte'; // Corrected path

  let currentPath = window.location.pathname;

  // Basic router logic
  let Component: any; // Using 'any' for simplicity here, could be more specific
  if (currentPath === '/login') {
    Component = Login;
  } else if (currentPath.startsWith('/databases/')) {
    Component = DatabaseDetail; // Needs to handle dynamic part of path
  } else {
    Component = Dashboard; // Default to Dashboard
  }

  // Listen to popstate events to handle browser back/forward
  window.addEventListener('popstate', () => {
    currentPath = window.location.pathname;
    // Re-evaluate Component based on new path (simplified)
    if (currentPath === '/login') {
        Component = Login;
      } else if (currentPath.startsWith('/databases/')) {
        Component = DatabaseDetail;
      } else {
        Component = Dashboard;
      }
  });

  // Function to navigate, for use by child components or links
  function navigate(path: string) {
    window.history.pushState({}, '', path);
    currentPath = path; // Update currentPath to trigger re-render if needed
    // Re-evaluate Component based on new path (simplified)
    if (currentPath === '/login') {
        Component = Login;
      } else if (currentPath.startsWith('/databases/')) {
        Component = DatabaseDetail;
      } else {
        Component = Dashboard;
      }
  }
</script>

<main>
  <header>
    <h1>PostgreSQL Self-Service</h1>
    <nav>
      <a href="/" on:click|preventDefault={() => navigate('/')}>Dashboard</a> |
      <a href="/login" on:click|preventDefault={() => navigate('/login')}>Login</a>
    </nav>
  </header>

  <svelte:component this={Component} {navigate} />
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
