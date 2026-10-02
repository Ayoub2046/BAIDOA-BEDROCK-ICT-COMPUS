/**
 * push-subscribe.js
 * Persistent notification subscription handler.
 * Shows a bottom banner on ALL pages if the user has not yet subscribed.
 * Auto-subscribes on permission grant.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'bedrock_push_subscribed';
    var API_BASE = '/api/announcements';

    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        var rawData = window.atob(base64);
        var output = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; ++i) { output[i] = rawData.charCodeAt(i); }
        return output;
    }

    function getUserRole() {
        try {
            var u = JSON.parse(sessionStorage.getItem('activeUser') || localStorage.getItem('activeUser') || '{}');
            if (u && u.role) return u.role.toLowerCase();
            // Try common patterns
            var role = sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || 'student';
            return role.toLowerCase();
        } catch (e) { return 'student'; }
    }

    async function doSubscribe() {
        if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) return false;
        try {
            var reg = await navigator.serviceWorker.ready;
            var keyRes = await fetch(API_BASE + '/vapid-public-key');
            if (!keyRes.ok) return false;
            var keyData = await keyRes.json();
            if (!keyData.publicKey) return false;

            var existingSub = await reg.pushManager.getSubscription();
            var sub = existingSub;
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
                });
            }
            if (!sub) return false;

            var subObj = sub.toJSON();
            var role = getUserRole();

            var resp = await fetch(API_BASE + '/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subObj.endpoint, keys: subObj.keys, user_role: role })
            });
            if (resp.ok) {
                try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
                console.log('[PushSubscribe] Subscribed successfully as: ' + role);
                return true;
            }
        } catch (err) {
            console.warn('[PushSubscribe] Error:', err.message);
        }
        return false;
    }

    window.enableLockScreenPushNotifications = async function () {
        if (!('Notification' in window)) {
            alert('Push notifications are not supported in this browser.');
            return false;
        }
        try {
            var perm = Notification.permission;
            if (perm === 'default') {
                perm = await Notification.requestPermission();
            }
            if (perm === 'granted') {
                return await doSubscribe();
            }
        } catch (e) {
            console.warn('[PushSubscribe] Permission error:', e);
        }
        return false;
    };

    function injectBannerStyles() {
        if (document.getElementById('push-banner-style')) return;
        var s = document.createElement('style');
        s.id = 'push-banner-style';
        s.textContent = `
#bedrock-push-banner {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 9999990;
    background: linear-gradient(90deg, #0d4f8c 0%, #1a7fd4 100%);
    color: #fff;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.35);
    font-family: 'Poppins', system-ui, sans-serif;
    font-size: 0.875rem;
    animation: slideUpBanner 0.4s ease;
}
@keyframes slideUpBanner {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
#bedrock-push-banner .push-msg {
    display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
}
#bedrock-push-banner .push-icon {
    font-size: 1.5rem; flex-shrink: 0;
}
#bedrock-push-banner .push-text strong {
    display: block; font-size: 0.95rem; font-weight: 700;
}
#bedrock-push-banner .push-text span {
    font-size: 0.78rem; opacity: 0.88;
}
#bedrock-push-banner .push-actions {
    display: flex; gap: 8px; flex-shrink: 0;
}
#btn-push-allow {
    background: #fff; color: #0d4f8c;
    border: none; border-radius: 20px;
    padding: 8px 18px; font-weight: 700; font-size: 0.83rem;
    cursor: pointer; white-space: nowrap;
    transition: all 0.2s;
}
#btn-push-allow:hover { background: #e0eeff; transform: scale(1.04); }
#btn-push-dismiss {
    background: transparent; color: rgba(255,255,255,0.75);
    border: 1px solid rgba(255,255,255,0.4); border-radius: 20px;
    padding: 8px 14px; font-size: 0.78rem; font-weight: 600;
    cursor: pointer; white-space: nowrap;
    transition: all 0.2s;
}
#btn-push-dismiss:hover { color: #fff; border-color: #fff; }
`;
        document.head.appendChild(s);
    }

    function showBanner() {
        if (document.getElementById('bedrock-push-banner')) return;
        injectBannerStyles();

        var banner = document.createElement('div');
        banner.id = 'bedrock-push-banner';
        banner.setAttribute('role', 'alert');
        banner.innerHTML = `
            <div class="push-msg">
                <span class="push-icon">🔔</span>
                <div class="push-text">
                    <strong>Get Instant Campus Alerts on Your Phone!</strong>
                    <span>Enable push notifications and receive urgent news, exam results & announcements even when your phone is locked.</span>
                </div>
            </div>
            <div class="push-actions">
                <button id="btn-push-allow">✅ Allow Notifications</button>
                <button id="btn-push-dismiss">Not Now</button>
            </div>
        `;
        document.body.appendChild(banner);

        var allowBtn = document.getElementById('btn-push-allow');
        var dismissBtn = document.getElementById('btn-push-dismiss');

        if (allowBtn) allowBtn.addEventListener('click', async function () {
            allowBtn.textContent = 'Enabling...';
            allowBtn.disabled = true;
            var success = await window.enableLockScreenPushNotifications();
            if (success) {
                banner.innerHTML = `<div class="push-msg"><span class="push-icon">✅</span><div class="push-text"><strong>You are now subscribed!</strong><span>You will receive campus announcements directly on your phone lock screen.</span></div></div>`;
                setTimeout(function () { if (banner) banner.remove(); }, 3000);
            } else {
                allowBtn.textContent = 'Try Again';
                allowBtn.disabled = false;
            }
        });

        if (dismissBtn) dismissBtn.addEventListener('click', function () {
            try { sessionStorage.setItem('push_banner_dismissed', '1'); } catch (e) {}
            banner.remove();
        });
    }

    async function init() {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

        // If already subscribed via stored flag, silently re-register to stay fresh
        if (localStorage.getItem(STORAGE_KEY) === '1' && Notification.permission === 'granted') {
            doSubscribe();
            return;
        }

        // If already granted but never registered to server
        if (Notification.permission === 'granted') {
            var success = await doSubscribe();
            if (success) return;
        }

        // If denied, do nothing
        if (Notification.permission === 'denied') return;

        // If default (never asked) → show banner
        if (Notification.permission === 'default' && sessionStorage.getItem('push_banner_dismissed') !== '1') {
            // Wait 3 seconds after page load so it doesn't interrupt the page load
            setTimeout(showBanner, 3000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
