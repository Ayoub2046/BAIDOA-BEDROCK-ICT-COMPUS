// js/mai.js

// --- Part 1: Public Website Active Nav Link ---
(function () {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    let activeLink = Array.from(navLinks).find(link => link.getAttribute('href') === currentPage);
    navLinks.forEach(link => link.classList.remove('active'));
    if (activeLink) activeLink.classList.add('active');
})();

document.addEventListener('DOMContentLoaded', () => {

    // --- Global Sidebar Toggle Logic for all Admin Pages ---
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    if (sidebar && sidebarToggler) {
        sidebarToggler.addEventListener('click', () => {
            sidebar.classList.toggle('toggled');
        });
    }

    // --- Global Logout Logic ---
    const logoutLink = document.getElementById('logout-link');
    const logoutLinkDropdown = document.getElementById('logout-link-dropdown');

    const logout = () => {
        sessionStorage.removeItem('isAdminLoggedIn');
        sessionStorage.removeItem('activeUser');
        window.location.href = 'admin-login.html';
    };

    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    if (logoutLinkDropdown) {
        logoutLinkDropdown.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // --- Part 2: Admin Dashboard Functionality ---
    if (document.body.classList.contains('dashboard-page')) {

        // --- THEME TOGGLE ---
        const themeToggle = document.getElementById('theme-toggle');
        const sunIcon = document.getElementById('sun-icon');
        const moonIcon = document.getElementById('moon-icon');

        const applyTheme = (theme) => {
            document.body.classList.toggle('dark-mode', theme === 'dark');
            if (sunIcon) sunIcon.style.display = theme === 'dark' ? 'inline-block' : 'none';
            if (moonIcon) moonIcon.style.display = theme === 'light' ? 'inline-block' : 'none';
            localStorage.setItem('theme', theme);
        };

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
                applyTheme(newTheme);
            });
            applyTheme(localStorage.getItem('theme') || 'light');
        }

        // --- SPA NAVIGATION ---
        const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
        const contentSections = document.querySelectorAll('.content-section');
        const pageTitle = document.getElementById('page-title');
        sidebarLinks.forEach(link => {
            if (link.getAttribute('href') === '#') {
                link.addEventListener('click', e => {
                    e.preventDefault();
                    const targetId = link.getAttribute('data-target');
                    if (!targetId) return;
                    if (pageTitle) pageTitle.textContent = link.querySelector('span').textContent.trim();
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                    contentSections.forEach(s => s.classList.toggle('active', s.id === targetId));
                });
            }
        });

        // --- MOCK DATABASE ---
        let students = [];
        let teachers = [
            { id: 1, name: 'Abdirisack Isack Bule', subject: 'Mathematics', email: 'Abdirisack12@gmail.com', phone: '12345678' },
            { id: 2, name: 'Abduwali Ali', subject: 'Physics', email: 'Abduwali12@gmail.com', phone: '12345678' },
        ];

        // --- RENDER FUNCTIONS ---
        const studentModalEl = document.getElementById('studentModal');
        const teacherModalEl = document.getElementById('teacherModal');
        const studentModal = studentModalEl ? new bootstrap.Modal(studentModalEl) : null;
        const teacherModal = teacherModalEl ? new bootstrap.Modal(teacherModalEl) : null;

        function renderStudentTable() { }
        function renderTeacherTable() {
            const tbody = document.getElementById('teacher-table-body');
            if (!tbody) return;
            tbody.innerHTML = teachers.map(t => `
                <tr>
                    <td>T-${String(t.id).padStart(3, '0')}</td><td>${t.name}</td><td>${t.subject}</td><td>${t.email}</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-edit" data-id="${t.id}" data-type="teacher"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-delete" data-id="${t.id}" data-type="teacher"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('');
        }

        // --- TEACHER CRUD LOGIC ---
        const btnAddTeacher = document.getElementById('btn-add-teacher');
        if (btnAddTeacher) {
            btnAddTeacher.addEventListener('click', () => {
                const form = document.getElementById('teacherForm');
                document.getElementById('teacherModalTitle').textContent = 'Add New Teacher';
                form.reset();
                form.dataset.mode = 'add';
                teacherModal.show();
            });
        }

        const teacherForm = document.getElementById('teacherForm');
        if (teacherForm) {
            teacherForm.addEventListener('submit', e => {
                e.preventDefault();
                const form = e.target;
                const mode = form.dataset.mode;
                const data = {
                    name: form.elements.name.value, subject: form.elements.subject.value,
                    email: form.elements.email.value, phone: form.elements.phone.value,
                };
                if (mode === 'add') {
                    data.id = Date.now();
                    teachers.push(data);
                } else {
                    const id = parseInt(form.dataset.id);
                    const index = teachers.findIndex(t => t.id === id);
                    teachers[index] = { id, ...data };
                }
                renderTeacherTable();
                teacherModal.hide();
            });
        }

        const teacherTableBody = document.getElementById('teacher-table-body');
        if (teacherTableBody) {
            teacherTableBody.addEventListener('click', e => {
                const button = e.target.closest('button');
                if (!button) return;
                const id = parseInt(button.dataset.id);

                if (button.classList.contains('btn-edit')) {
                    const teacher = teachers.find(t => t.id === id);
                    const form = document.getElementById('teacherForm');
                    document.getElementById('teacherModalTitle').textContent = 'Edit Teacher';
                    form.dataset.mode = 'edit';
                    form.dataset.id = id;
                    form.elements.name.value = teacher.name;
                    form.elements.subject.value = teacher.subject;
                    form.elements.email.value = teacher.email;
                    form.elements.phone.value = teacher.phone;
                    teacherModal.show();
                } else if (button.classList.contains('btn-delete')) {
                    if (confirm('Are you sure you want to delete this teacher?')) {
                        teachers = teachers.filter(t => t.id !== id);
                        renderTeacherTable();
                    }
                }
            });
        }

        // --- INITIAL RENDER ---
        renderStudentTable();
        renderTeacherTable();
    }
});
