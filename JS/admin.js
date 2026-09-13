// Global Sidebar Toggle & Navigation Logic for all Admin Pages
function initAdminSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    let sidebarBackdrop = document.getElementById('sidebar-backdrop');

    if (!sidebar) return;

    // Dynamically insert backdrop if it does not exist in DOM
    if (!sidebarBackdrop) {
        sidebarBackdrop = document.createElement('div');
        sidebarBackdrop.id = 'sidebar-backdrop';
        sidebarBackdrop.className = 'sidebar-backdrop';
        document.body.appendChild(sidebarBackdrop);
    }

    // Add mobile close button into sidebar header if missing
    const sidebarHeader = sidebar.querySelector('.sidebar-header');
    if (sidebarHeader && !sidebarHeader.querySelector('.sidebar-close-btn')) {
        sidebarHeader.style.position = 'relative';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-sm btn-link text-white d-lg-none sidebar-close-btn';
        closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;font-size:1.2rem;text-decoration:none;opacity:0.85;padding:4px;';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', () => {
            sidebar.classList.remove('toggled', 'open', 'show');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active', 'show');
        });
        sidebarHeader.appendChild(closeBtn);
    }

    function openSidebar() {
        sidebar.classList.add('toggled', 'open', 'show');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active', 'show');
    }

    function closeSidebar() {
        sidebar.classList.remove('toggled', 'open', 'show');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active', 'show');
    }

    function toggleSidebar(e) {
        if (e) e.stopPropagation();
        if (sidebar.classList.contains('toggled') || sidebar.classList.contains('open') || sidebar.classList.contains('show')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    // Bind toggler
    if (sidebarToggler && !sidebarToggler.dataset.sbBound) {
        sidebarToggler.dataset.sbBound = 'true';
        sidebarToggler.addEventListener('click', toggleSidebar);
        sidebarToggler.addEventListener('touchstart', (e) => {
            e.preventDefault();
            toggleSidebar(e);
        }, { passive: false });
    }

    // Bind backdrop
    if (sidebarBackdrop && !sidebarBackdrop.dataset.sbBound) {
        sidebarBackdrop.dataset.sbBound = 'true';
        sidebarBackdrop.addEventListener('click', closeSidebar);
        sidebarBackdrop.addEventListener('touchstart', (e) => {
            e.preventDefault();
            closeSidebar();
        }, { passive: false });
    }

    // Auto-close on nav link click on mobile
    sidebar.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 992) {
                closeSidebar();
            }
        });
    });

    // Close when ESC key is pressed
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });

    // Global Logout Logic
    const logout = () => {
        sessionStorage.removeItem('isAdminLoggedIn');
        sessionStorage.removeItem('adminProfile');
        sessionStorage.removeItem('activeUser');
        window.location.href = 'admin-login.html';
    };

    document.querySelectorAll('#logout-link, #logout-link-dropdown').forEach(link => {
        if (!link.dataset.lgBound) {
            link.dataset.lgBound = 'true';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminSidebar);
} else {
    initAdminSidebar();
}
