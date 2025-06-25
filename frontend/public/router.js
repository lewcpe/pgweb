// frontend/public/router.js
(function() {
    const contentSections = document.querySelectorAll('.content-section');
    const navLinks = document.querySelectorAll('nav a[data-path]');

    function updateView(path) {
        // Default to 'My Databases' (dashboard-section) if path is empty or just "/"
        if (path === '' || path === '/') {
            path = '/';
        }

        let targetSectionId = '';
        let pageTitle = 'PostgreSQL Self-Service';
        let detailId = null; // To store extracted ID for detail/manage pages

        // New routing logic
        if (path === '/') { // Main page: lists all user's databases
            targetSectionId = 'dashboard-section'; // This is now the main list of DBs
            pageTitle = 'My Databases | PostgreSQL Self-Service';
        } else if (path === '/databases/new') { // Page to create a new database
            targetSectionId = 'databasecreateform-section';
            pageTitle = 'Create New Database | PostgreSQL Self-Service';
        } else if (path.startsWith('/databases/') && path.endsWith('/manage')) { // Page to manage a specific database (details and users)
            targetSectionId = 'databasemanage-section';
            const pathParts = path.split('/');
            detailId = pathParts[2]; // Assumes path like /databases/{id}/manage
            pageTitle = `Manage Database | PostgreSQL Self-Service`;
        } else if (path.startsWith('/databases/')) {
            // Fallback for old /databases/{id} path, redirect to /databases/{id}/manage
            // Or, decide if this path should show a simplified view or error.
            // For now, let's redirect to the new manage path.
            const pathParts = path.split('/');
            const dbId = pathParts[2];
            if (dbId && dbId !== 'new') { // Ensure it's an ID and not the 'new' keyword
                const newPath = `/databases/${dbId}/manage`;
                history.replaceState({ path: newPath }, '', newPath); // Update URL
                updateView(newPath); // Recurse with the new path
                return; // Important: exit current updateView call
            } else {
                // If it's /databases/ or an invalid sub-path, redirect to main page
                console.warn(`Invalid or old database path: ${path}. Redirecting to My Databases.`);
                history.replaceState({ path: '/' }, '', '/');
                updateView('/');
                return;
            }
        }
        // Note: The old '/databases' path (which showed databaselist-section) is removed.
        // The nav link for it was also removed in index.html.
        // If a user manually types /databases, it will be caught by the startsWith('/databases/')
        // and redirected to '/' if it doesn't match /databases/:id/manage or /databases/new.
        else {
            // Fallback for any other unknown paths
            console.warn(`Unknown path: ${path}. Redirecting to My Databases.`);
            path = '/'; // Set path to default for event dispatch
            targetSectionId = 'dashboard-section';
            pageTitle = 'My Databases | PostgreSQL Self-Service';
            history.replaceState({ path: '/' }, '', '/'); // Update URL without new history entry
        }

        document.title = pageTitle;

        contentSections.forEach(section => {
            if (section.id === targetSectionId) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });

        // Dispatch a custom event that components can listen to
        document.dispatchEvent(new CustomEvent('viewchanged', {
            detail: {
                path: path, // current logical path (could be the original or the redirected one)
                sectionId: targetSectionId, // DOM ID of the section shown
                id: detailId // e.g. database_id for manage view
            }
        }));
    }

    function navigate(path) {
        history.pushState({ path }, '', path);
        updateView(path);
    }

    // Initial view based on current URL path
    updateView(window.location.pathname);

    // Handle browser back/forward
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.path) {
            updateView(event.state.path);
        } else {
            // Fallback for cases where state is null (e.g. initial page load, or manual URL change)
            updateView(window.location.pathname);
        }
    });

    // Handle clicks on nav links
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const path = link.getAttribute('data-path');
            if (path !== window.location.pathname) {
                navigate(path);
            }
        });
    });

    // Expose navigate function globally for other scripts to use
    window.router = {
        navigate: navigate,
        getCurrentPath: () => window.location.pathname
    };

})();
