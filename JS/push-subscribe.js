/**
 * push-subscribe.js — Baidoa Bedrock ICT Campus
 * Cross-browser / cross-platform push notification subscription handler.
 * Works on: Android Chrome, Android Firefox, Android Edge, Desktop browsers.
 * iOS Safari: Requires PWA install (Add to Home Screen) — shown automatically.
 */
(function () {
    'use strict';

    var SUB_KEY = 'bedrock_push_subscribed';
    var DISMISS_KEY = 'push_banner_dismissed_ts';
    var API = '/api/announcements';

    // ── Platform Detection ────────────────────────────────────────────────────
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    function isStandalone() {
        return window.navigator.standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches ||
            document.referrer.includes('android-app://');
    }
    function supportsPush() {
        return 'serviceWorker' in navigator &&
            'Notification' in window &&
            'PushManager' in window;
    }
    function isHTTPS() {
        return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    }

    // ── VAPID Helper ──────────────────────────────────────────────────────────
    function urlBase64ToUint8Array(b64) {
        var padding = '='.repeat((4 - b64.length % 4) % 4);
        var base64 = (b64 + padding).replace(/\-/g, '+').replace(/_/g, '/');
        var raw = window.atob(base64);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }

    // ── Get User Role ─────────────────────────────────────────────────────────
    function getUserRole() {
        try {
            var stores = [sessionStorage, localStorage];
            for (var i = 0; i < stores.length; i++) {
                var u = JSON.parse(stores[i].getItem('activeUser') || '{}');
                if (u && u.role) return u.role.toLowerCase();
                var r = stores[i].getItem('userRole');
                if (r) return r.toLowerCase();
            }
        } catch (e) {}
        return 'student';
    }

    // ── Core Subscribe Logic ──────────────────────────────────────────────────
    async function doSubscribe() {
        try {
            var reg = await navigator.serviceWorker.ready;
            if (!reg.pushManager) throw new Error('PushManager not available');

            // Fetch VAPID public key from backend
            var keyRes = await fetch(API + '/vapid-public-key');
            if (!keyRes.ok) throw new Error('Could not fetch VAPID key from server');
            var keyData = await keyRes.json();
            if (!keyData.publicKey) throw new Error('No VAPID public key returned');

            // Check for existing subscription
            var sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
                });
            }
            if (!sub) throw new Error('Push subscription failed');

            var subJson = sub.toJSON();
            var role = getUserRole();

            var resp = await fetch(API + '/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                    user_role: role
                })
            });
            if (!resp.ok) throw new Error('Server rejected subscription');

            try { localStorage.setItem(SUB_KEY, Date.now().toString()); } catch (e) {}
            console.log('[Push] ✅ Subscribed as: ' + role + ' | endpoint: ' + subJson.endpoint.substring(0, 60) + '...');
            return { success: true, role: role };
        } catch (err) {
            console.warn('[Push] ❌ Subscribe error:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ── Global enable function (called by buttons / admin panel) ─────────────
    window.enableLockScreenPushNotifications = async function () {
        if (!supportsPush()) {
            if (isIOS() && !isStandalone()) {
                showIOSInstallGuide();
            }
            return false;
        }
        if (!isHTTPS()) {
            console.warn('[Push] HTTPS required for push notifications');
            return false;
        }
        var perm = Notification.permission;
        if (perm === 'default') {
            perm = await Notification.requestPermission();
        }
        if (perm === 'granted') {
            var result = await doSubscribe();
            return result.success;
        }
        return false;
    };

    // ── Styles ────────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('bps-style')) return;
        var s = document.createElement('style');
        s.id = 'bps-style';
        s.textContent = `
/* ── Bedrock Push Notification Banner ── */
#bps-banner {
    position: fixed; bottom: 0; left: 0; right: 0;
    z-index: 9999990;
    background: linear-gradient(135deg, #0a3d6b, #1565c0);
    color: #fff;
    padding: 14px 18px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
    box-shadow: 0 -3px 18px rgba(0,0,0,0.4);
    font-family: 'Poppins', system-ui, sans-serif;
    font-size: 0.875rem;
    animation: bpsSlide 0.35s ease;
}
@keyframes bpsSlide { from { transform: translateY(100%); } to { transform: translateY(0); } }
#bps-banner .bps-msg { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
#bps-banner .bps-icon { font-size: 1.6rem; flex-shrink: 0; }
#bps-banner .bps-text strong { display: block; font-size: 0.9rem; font-weight: 700; }
#bps-banner .bps-text span { font-size: 0.77rem; opacity: 0.85; }
#bps-banner .bps-btns { display: flex; gap: 8px; flex-shrink: 0; }
#bps-allow {
    background: #fff; color: #0a3d6b;
    border: none; border-radius: 20px;
    padding: 8px 20px; font-weight: 700; font-size: 0.83rem;
    cursor: pointer; transition: all 0.2s;
}
#bps-allow:hover { background: #e3f0ff; }
#bps-allow:disabled { opacity: 0.6; cursor: default; }
#bps-dismiss {
    background: transparent; color: rgba(255,255,255,0.7);
    border: 1px solid rgba(255,255,255,0.35); border-radius: 20px;
    padding: 8px 14px; font-size: 0.78rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
}
#bps-dismiss:hover { color: #fff; border-color: #fff; }

/* ── iOS Guide Modal ── */
#bps-ios-modal {
    position: fixed; inset: 0; z-index: 9999999;
    background: rgba(10,30,60,0.85); backdrop-filter: blur(8px);
    display: flex; align-items: flex-end; justify-content: center;
    padding: 16px;
}
#bps-ios-card {
    background: #fff; border-radius: 20px 20px 16px 16px;
    width: 100%; max-width: 460px; padding: 24px 22px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: bpsSlide 0.3s ease;
    position: relative;
}
#bps-ios-card h5 { font-weight: 800; color: #0a3d6b; margin: 0 0 4px; }
#bps-ios-card p { font-size: 0.85rem; color: #475569; margin: 0 0 16px; }
#bps-ios-steps { list-style: none; padding: 0; margin: 0 0 18px; }
#bps-ios-steps li {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 0.85rem; color: #1e293b; padding: 8px 0;
    border-bottom: 1px solid #f1f5f9;
}
#bps-ios-steps li:last-child { border: none; }
#bps-ios-steps .step-num {
    background: #0a3d6b; color: #fff;
    width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 700; flex-shrink: 0; margin-top: 1px;
}
#bps-ios-close {
    width: 100%; background: #0a3d6b; color: #fff;
    border: none; border-radius: 12px; padding: 12px;
    font-weight: 700; font-size: 0.9rem; cursor: pointer;
}
`;
        document.head.appendChild(s);
    }

    // ── Banner for Android / Desktop browsers ─────────────────────────────────
    function showSubscribeBanner() {
        if (document.getElementById('bps-banner')) return;
        injectStyles();
        var b = document.createElement('div');
        b.id = 'bps-banner';
        b.role = 'alert';
        b.innerHTML =
            '<div class="bps-msg">' +
            '<span class="bps-icon">🔔</span>' +
            '<div class="bps-text">' +
            '<strong>Get Exam Results & Campus News on Your Phone Lock Screen!</strong>' +
            '<span>Tap Allow — receive WhatsApp-style alerts even when your phone is locked.</span>' +
            '</div></div>' +
            '<div class="bps-btns">' +
            '<button id="bps-allow">✅ Allow Notifications</button>' +
            '<button id="bps-dismiss">Not Now</button>' +
            '</div>';
        document.body.appendChild(b);

        document.getElementById('bps-allow').addEventListener('click', async function () {
            var btn = this;
            btn.textContent = '⏳ Enabling…';
            btn.disabled = true;
            var ok = await window.enableLockScreenPushNotifications();
            if (ok) {
                b.innerHTML = '<div class="bps-msg"><span class="bps-icon">✅</span><div class="bps-text"><strong>You\'re subscribed!</strong><span>You\'ll now receive push notifications on your phone screen.</span></div></div>';
                setTimeout(function () { if (b) b.remove(); }, 4000);
            } else {
                btn.textContent = '🔔 Try Again';
                btn.disabled = false;
            }
        });

        document.getElementById('bps-dismiss').addEventListener('click', function () {
            // Dismiss for 12 hours only so it comes back
            try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch (e) {}
            b.remove();
        });
    }

    // ── iOS PWA Install Guide ─────────────────────────────────────────────────
    function showIOSInstallGuide() {
        if (document.getElementById('bps-ios-modal')) return;
        injectStyles();
        var m = document.createElement('div');
        m.id = 'bps-ios-modal';
        m.innerHTML =
            '<div id="bps-ios-card">' +
            '<h5>📱 iPhone / iPad: Enable Push Notifications</h5>' +
            '<p>Apple requires you to install this site as an app to receive lock-screen notifications.</p>' +
            '<ol id="bps-ios-steps">' +
            '<li><span class="step-num">1</span><span>Tap the <strong>Share button</strong> <span style="font-size:1.1em">⬆️</span> at the bottom of your Safari browser.</span></li>' +
            '<li><span class="step-num">2</span><span>Scroll down and tap <strong>"Add to Home Screen"</strong>.</span></li>' +
            '<li><span class="step-num">3</span><span>Tap <strong>"Add"</strong> in the top-right corner.</span></li>' +
            '<li><span class="step-num">4</span><span>Open the app from your <strong>home screen icon</strong> and tap Allow when prompted.</span></li>' +
            '</ol>' +
            '<button id="bps-ios-close">Got It ✓</button>' +
            '</div>';
        document.body.appendChild(m);
        var closeBtn = document.getElementById('bps-ios-close');
        if (closeBtn) closeBtn.addEventListener('click', function () { m.remove(); });
        m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    }

    // ── Main Init ─────────────────────────────────────────────────────────────
    async function init() {
        // iOS not in PWA mode — show install guide
        if (isIOS() && !isStandalone()) {
            var lastDismiss = parseInt(localStorage.getItem(DISMISS_KEY) || '0');
            var hoursSince = (Date.now() - lastDismiss) / 3600000;
            if (hoursSince > 12) {
                setTimeout(showIOSInstallGuide, 4000);
            }
            return;
        }

        // iOS in PWA mode — try to subscribe directly
        if (isIOS() && isStandalone()) {
            if (supportsPush() && Notification.permission === 'granted') {
                doSubscribe();
            } else if (supportsPush() && Notification.permission !== 'denied') {
                var perm = await Notification.requestPermission().catch(function() { return 'denied'; });
                if (perm === 'granted') doSubscribe();
            }
            return;
        }

        if (!supportsPush() || !isHTTPS()) return;

        // Already subscribed and granted → silently re-register to stay fresh
        if (Notification.permission === 'granted') {
            doSubscribe();
            return;
        }

        // Denied → nothing we can do
        if (Notification.permission === 'denied') return;

        // Default (never asked) → show banner
        var lastDismiss = parseInt(localStorage.getItem(DISMISS_KEY) || '0');
        var hoursSince = (Date.now() - lastDismiss) / 3600000;
        if (hoursSince > 12) {
            setTimeout(showSubscribeBanner, 3000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
