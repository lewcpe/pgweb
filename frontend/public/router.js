// frontend/public/router.js
(function() {
    const contentSections = document.querySelectorAll('.content-section');
    const navLinks = document.querySelectorAll('nav a[data-path]');

    function updateView(path) {
        // Default to dashboard if path is empty or just "/"
        if (path === '' || path === '/') {
            path = '/'; // Or map to a default section like 'dashboard-section'
        }

        let targetSectionId = '';
        let pageTitle = 'PostgreSQL Self-Service';

        // Simple routing logic based on path
        if (path === '/') {
            targetSectionId = 'dashboard-section';
            pageTitle = 'Dashboard | PostgreSQL Self-Service';
        } else if (path === '/databases') {
            targetSectionId = 'databaselist-section';
            pageTitle = 'My Databases | PostgreSQL Self-Service';
        } else if (path.startsWith('/databases/') && path.endsWith('/new')) {
            targetSectionId = 'databasecreateform-section';
            pageTitle = 'Create Database | PostgreSQL Self-Service';
        } else if (path.startsWith('/databases/')) {
            targetSectionId = 'databasedetail-section';
            const dbId = path.split('/')[2]; // Assumes path like /databases/{id}
            // We'll need to pass dbId to the rendering function for this section
            // For now, just show the section. Data loading will be handled by its specific JS.
            pageTitle = `Database Details | PostgreSQL Self-Service`;
            // The DatabaseDetail.js will extract the ID from the path itself.
        } else {
            // Fallback for unknown paths - could be a 404 section or redirect to dashboard
            console.warn(`Unknown path: ${path}. Redirecting to dashboard.`);
            path = '/';
            targetSectionId = 'dashboard-section';
            pageTitle = 'Dashboard | PostgreSQL Self-Service';
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

        // Dispatch a custom event that components can listen to, to trigger data loading etc.
        // Pass the path and any params (like dbId)
        const detailId = path.startsWith('/databases/') && !path.endsWith('/new') ? path.split('/')[2] : null;
        document.dispatchEvent(new CustomEvent('viewchanged', {
            detail: {
                path: path, // current logical path
                sectionId: targetSectionId, // DOM ID of the section shown
                id: detailId // e.g. database_id for detail view
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
