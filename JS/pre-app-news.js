// JS/pre-app-news.js
// Handles displaying urgent campus news, announcements, and push notification prompt BEFORE entering the app or logging in.

(function () {
    const DISMISS_KEY = 'bedrock_pre_app_news_dismissed';

    // Inject Pre-App Modal HTML & Styles into document
    function injectNewsModalStyles() {
        if (document.getElementById('pre-app-news-styles')) return;
        const style = document.createElement('style');
        style.id = 'pre-app-news-styles';
        style.textContent = `
            .pre-app-news-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(8px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                animation: fadeInBg 0.3s ease;
            }
            @keyframes fadeInBg {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .pre-app-news-card {
                background: #ffffff;
                border-radius: 16px;
                max-width: 520px;
                width: 100%;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                overflow: hidden;
                border: 1px solid rgba(226, 232, 240, 0.8);
                animation: slideUpNews 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes slideUpNews {
                from { opacity: 0; transform: translateY(20px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .pre-app-news-header {
                background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                color: #ffffff;
                padding: 1.25rem 1.5rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .pre-app-news-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: #ffffff;
                font-size: 0.75rem;
                font-weight: 700;
                padding: 0.25rem 0.65rem;
                border-radius: 50px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .pre-app-news-badge.urgent {
                background: #ef4444;
                border-color: #f87171;
            }
            .pre-app-news-body {
                padding: 1.5rem;
                max-height: 60vh;
                overflow-y: auto;
            }
            .pre-app-news-item {
                margin-bottom: 1.25rem;
                padding-bottom: 1.25rem;
                border-bottom: 1px solid #f1f5f9;
            }
            .pre-app-news-item:last-child {
                margin-bottom: 0;
                padding-bottom: 0;
                border-bottom: none;
            }
            .pre-app-news-title {
                font-size: 1.05rem;
                font-weight: 700;
                color: #0f172a;
                margin-bottom: 0.35rem;
            }
            .pre-app-news-content {
                font-size: 0.875rem;
                color: #475569;
                line-height: 1.5;
            }
            .pre-app-news-footer {
                background: #f8fafc;
                padding: 1rem 1.5rem;
                border-top: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 0.75rem;
            }
            .pre-app-btn-enter {
                background: #1e3c72;
                color: #ffffff;
                font-weight: 600;
                font-size: 0.875rem;
                padding: 0.5rem 1.25rem;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .pre-app-btn-enter:hover {
                background: #2a5298;
            }
            .pre-app-btn-notify {
                background: #f0fdf4;
                color: #166534;
                border: 1px solid #bbf7d0;
                font-size: 0.8rem;
                font-weight: 600;
                padding: 0.4rem 0.85rem;
                border-radius: 8px;
                cursor: pointer;
            }
            .pre-app-btn-notify:hover {
                background: #dcfce7;
            }
        `;
        document.head.appendChild(style);
    }

    // Check if news was already dismissed today
    function isDismissedToday() {
        try {
            const lastDismissed = localStorage.getItem(DISMISS_KEY);
            if (!lastDismissed) return false;
            const today = new Date().toISOString().split('T')[0];
            return lastDismissed === today;
        } catch (e) {
            return false;
        }
    }

    // Save dismiss preference
    function setDismissedToday(dontShowAgain) {
        try {
            if (dontShowAgain) {
                const today = new Date().toISOString().split('T')[0];
                localStorage.setItem(DISMISS_KEY, today);
            }
        } catch (e) {}
    }

    // Request Notification permission from user screen
    async function requestScreenNotifications() {
        if (!('Notification' in window)) {
            alert('Notifications are not supported on this device/browser.');
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                    const reg = await navigator.serviceWorker.ready;
                    const sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: null
                    }).catch(() => null);

                    if (sub) {
                        fetch('/api/announcements/subscribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys, user_role: 'guest' })
                        });
                    }
                }
                alert('🔔 Screen notifications enabled! You will now receive news and alerts on your screen.');
            } else {
                alert('Notification permission denied or dismissed.');
            }
        } catch (err) {
            console.warn('Push subscription error:', err);
        }
    }

    // Main initialization function
    async function checkAndShowPreAppNews() {
        if (isDismissedToday()) return;

        try {
            const res = await fetch('/api/announcements/active');
            if (!res.ok) return;
            const announcements = await res.json();
            if (!announcements || announcements.length === 0) return;

            injectNewsModalStyles();

            const backdrop = document.createElement('div');
            backdrop.className = 'pre-app-news-backdrop';
            backdrop.id = 'pre-app-news-modal';

            const urgentItem = announcements.find(a => a.is_urgent);
            const badgeClass = urgentItem ? 'pre-app-news-badge urgent' : 'pre-app-news-badge';
            const badgeText = urgentItem ? '🚨 Urgent Campus Notice' : '📢 Campus News & Updates';

            const itemsHtml = announcements.map(a => `
                <div class="pre-app-news-item">
                    <div class="d-flex align-items-center justify-content-between mb-1">
                        <span class="badge ${a.is_urgent ? 'bg-danger' : 'bg-primary'} mb-1">${a.category || 'Campus News'}</span>
                        <small class="text-muted" style="font-size:0.75rem;">${new Date(a.created_at || Date.now()).toLocaleDateString()}</small>
                    </div>
                    <div class="pre-app-news-title">${a.title}</div>
                    <div class="pre-app-news-content">${a.content}</div>
                </div>
            `).join('');

            backdrop.innerHTML = `
                <div class="pre-app-news-card">
                    <div class="pre-app-news-header">
                        <div>
                            <span class="${badgeClass}"><i class="fas fa-bullhorn"></i> ${badgeText}</span>
                            <h5 style="margin:0.5rem 0 0;font-weight:800;font-size:1.15rem;color:#fff;">Baidoa Bedrock ICT Campus</h5>
                        </div>
                        <button type="button" id="btn-close-pre-news" style="background:transparent;border:none;color:#fff;font-size:1.25rem;cursor:pointer;opacity:0.8;">&times;</button>
                    </div>
                    <div class="pre-app-news-body">
                        ${itemsHtml}
                    </div>
                    <div class="pre-app-news-footer">
                        <div class="d-flex align-items-center gap-2">
                            <input type="checkbox" id="chk-dont-show" style="cursor:pointer;">
                            <label for="chk-dont-show" style="font-size:0.8rem;color:#64748b;cursor:pointer;margin:0;">Don't show again today</label>
                        </div>
                        <div class="d-flex gap-2">
                            <button type="button" class="pre-app-btn-notify" id="btn-enable-push" title="Enable OS screen alerts">
                                <i class="fas fa-bell me-1"></i>Enable Alerts
                            </button>
                            <button type="button" class="pre-app-btn-enter" id="btn-enter-app">
                                Enter App <i class="fas fa-arrow-right ms-1"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const closeBtn = backdrop.querySelector('#btn-close-pre-news');
            const enterBtn = backdrop.querySelector('#btn-enter-app');
            const dontShowChk = backdrop.querySelector('#chk-dont-show');
            const enablePushBtn = backdrop.querySelector('#btn-enable-push');

            function dismissModal() {
                setDismissedToday(dontShowChk.checked);
                backdrop.remove();
            }

            if (closeBtn) closeBtn.addEventListener('click', dismissModal);
            if (enterBtn) enterBtn.addEventListener('click', dismissModal);
            if (enablePushBtn) enablePushBtn.addEventListener('click', () => {
                requestScreenNotifications();
            });

        } catch (err) {
            console.warn('Pre-app news error:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndShowPreAppNews);
    } else {
        checkAndShowPreAppNews();
    }
})();
