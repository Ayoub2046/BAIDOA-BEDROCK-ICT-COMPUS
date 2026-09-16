// Baidoa Bedrock ICT Campus - Progressive Web App Installer & Offline Handler
(function () {
  'use strict';

  var INSTALLED_KEY = 'bedrock-pwa-installed';
  var DISMISSED_KEY = 'bedrock-pwa-dismissed';

  // Ensure BedrockDialog is globally loaded for all pages
  if (!window.BedrockDialog && !document.querySelector('script[src*="bedrock-dialog"]')) {
    var bdScript = document.createElement('script');
    bdScript.src = '/JS/bedrock-dialog.js';
    bdScript.async = false;
    document.head.appendChild(bdScript);
  }

  // Check if running in standalone mode (already installed as PWA)
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://');

  if (isStandalone) {
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch (e) {}
    // Purge any existing install buttons/modals
    cleanUpInstallUI();
    return;
  }

  function isInstalled() {
    try {
      return localStorage.getItem(INSTALLED_KEY) === '1' || isStandalone;
    } catch (e) {
      return false;
    }
  }

  function wasDismissedThisSession() {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markDismissedThisSession() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch (e) {}
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  var ADMIN_PATHS = [
    '/HTML/admin', '/HTML/teacher-dashboard', '/HTML/teacher.html',
    '/HTML/student.html', '/HTML/user.html', '/HTML/admin-login',
    '/HTML/classmanagment', '/HTML/attendance', '/HTML/exam',
    '/HTML/results-approval', '/HTML/clearance', '/HTML/fee-',
    '/HTML/recycle-bin', '/HTML/seceurity', '/HTML/content',
    '/HTML/report', '/HTML/communications', '/HTML/timetable',
    '/HTML/gallery-admin', '/HTML/library.html', '/HTML/resulty',
    '/HTML/Admin Profile', '/HTML/Admin Settings'
  ];

  function isAdminPage() {
    var p = window.location.pathname;
    return ADMIN_PATHS.some(function (a) { return p.includes(a); });
  }

  // Purge any floating install buttons from any side or position
  function cleanUpInstallUI() {
    var oldFloat = document.getElementById('bedrock-pwa-floating-btn');
    if (oldFloat) oldFloat.remove();
    var oldBtn = document.getElementById('pwa-install-btn');
    if (oldBtn) oldBtn.remove();
    document.querySelectorAll('.pwa-install-btn, .bedrock-pwa-float').forEach(function (el) {
      el.remove();
    });
  }

  var deferredPrompt = null;
  var modal = null;

  function closeModal() {
    if (modal) {
      modal.style.opacity = '0';
      modal.style.transform = 'scale(0.95)';
      setTimeout(function () {
        if (modal) {
          modal.remove();
          modal = null;
        }
      }, 250);
    }
  }

  function markInstalledAndHide() {
    try {
      localStorage.setItem(INSTALLED_KEY, '1');
    } catch (e) {}
    closeModal();
    cleanUpInstallUI();
  }

  function launchNativeInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (result) {
      if (result.outcome === 'accepted') {
        console.log('[PWA] User accepted installation prompt');
        markInstalledAndHide();
      } else {
        console.log('[PWA] User dismissed install prompt');
        closeModal();
        markDismissedThisSession();
      }
      deferredPrompt = null;
    });
    return true;
  }

  // ─── Build Install Modal (Only on First Visit, Completely Hidden After Install) ─────
  function showInstallModal() {
    if (isInstalled()) return;
    if (modal || document.getElementById('bedrock-pwa-modal')) return;

    injectStyles();

    modal = document.createElement('div');
    modal.id = 'bedrock-pwa-modal';
    modal.className = 'bedrock-pwa-overlay';

    var box = document.createElement('div');
    box.className = 'bedrock-pwa-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Install Baidoa Bedrock ICT Campus Application');

    // Close button (X)
    var closeX = document.createElement('button');
    closeX.className = 'bedrock-pwa-close';
    closeX.innerHTML = '&times;';
    closeX.setAttribute('aria-label', 'Close');
    closeX.addEventListener('click', function () {
      closeModal();
      markDismissedThisSession();
    });
    box.appendChild(closeX);

    // Header: Logo + Campus Name
    var header = document.createElement('div');
    header.className = 'bedrock-pwa-header';
    header.innerHTML = [
      '<div class="bedrock-pwa-logo-wrap">',
      '  <img src="/images/icons/icon-192.png" alt="Baidoa Bedrock ICT Campus" class="bedrock-pwa-logo"',
      '       onerror="this.src=\'/images/BEDRCOK LOGO.JPG\'">',
      '  <span class="bedrock-pwa-badge"><i class="fas fa-check-circle"></i> Official</span>',
      '</div>',
      '<h3 class="bedrock-pwa-title">Baidoa Bedrock ICT Campus</h3>',
      '<p class="bedrock-pwa-tag">Official Student &amp; Academic Mobile Application</p>'
    ].join('');
    box.appendChild(header);

    // Explanatory message
    var desc = document.createElement('p');
    desc.className = 'bedrock-pwa-desc';
    desc.textContent = 'Install our app for easy, one-tap access directly from your phone screen. Check exam results, attendance, timetable, and campus library anytime without typing the website name in your browser!';
    box.appendChild(desc);

    // Features list
    var features = document.createElement('div');
    features.className = 'bedrock-pwa-features';
    features.innerHTML = [
      '<div class="bp-feat"><i class="fas fa-bolt"></i><span>1-Tap Instant Access from Home Screen</span></div>',
      '<div class="bp-feat"><i class="fas fa-graduation-cap"></i><span>Check Exam Results &amp; Academic Honors</span></div>',
      '<div class="bp-feat"><i class="fas fa-calendar-check"></i><span>Daily Attendance &amp; Class Timetable</span></div>',
      '<div class="bp-feat"><i class="fas fa-book-reader"></i><span>Digital Library &amp; Campus Notices</span></div>'
    ].join('');
    box.appendChild(features);

    // Actions container
    var actions = document.createElement('div');
    actions.className = 'bedrock-pwa-actions';

    if (deferredPrompt) {
      // Android Chrome / Edge — Native 1-Tap Install
      var directBtn = document.createElement('button');
      directBtn.className = 'btn-pwa-primary';
      directBtn.innerHTML = '<i class="fas fa-download me-2"></i>Install App Now';
      directBtn.addEventListener('click', function () {
        launchNativeInstall();
      });
      actions.appendChild(directBtn);

    } else if (isIOS()) {
      // iOS Safari Guide
      var iosGuide = document.createElement('div');
      iosGuide.className = 'bedrock-pwa-guide';
      iosGuide.innerHTML = [
        '<div class="guide-title"><i class="fab fa-apple me-1"></i> How to Install on iPhone / iPad:</div>',
        '<ol class="guide-steps">',
        '  <li>Tap the <strong>Share</strong> icon <span class="ios-share-icon"><i class="fas fa-arrow-up-from-bracket"></i></span> at the bottom of Safari.</li>',
        '  <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>',
        '  <li>Tap <strong>"Add"</strong> in the top right corner.</li>',
        '</ol>'
      ].join('');
      actions.appendChild(iosGuide);

      var gotItBtn = document.createElement('button');
      gotItBtn.className = 'btn-pwa-primary mt-2';
      gotItBtn.textContent = "Got It — Add to Home Screen";
      gotItBtn.addEventListener('click', function () {
        closeModal();
        markDismissedThisSession();
      });
      actions.appendChild(gotItBtn);

    } else {
      // General Android / Browser Instructions
      var genGuide = document.createElement('div');
      genGuide.className = 'bedrock-pwa-guide';
      genGuide.innerHTML = [
        '<div class="guide-title"><i class="fas fa-mobile-alt me-1"></i> Install to Home Screen:</div>',
        '<ol class="guide-steps">',
        '  <li>Tap your browser menu <strong>(⋮ 3 dots)</strong> in the top-right.</li>',
        '  <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>',
        '</ol>'
      ].join('');
      actions.appendChild(genGuide);

      var tryBtn = document.createElement('button');
      tryBtn.className = 'btn-pwa-primary mt-2';
      tryBtn.innerHTML = '<i class="fas fa-download me-2"></i>Install Application';
      tryBtn.addEventListener('click', function () {
        if (!launchNativeInstall()) {
          tryBtn.innerHTML = '<i class="fas fa-info-circle me-1"></i>Tap browser menu ⋮ to install';
          tryBtn.disabled = true;
          tryBtn.style.opacity = '0.7';
        }
      });
      actions.appendChild(tryBtn);
    }

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn-pwa-dismiss';
    dismissBtn.textContent = 'Maybe Later';
    dismissBtn.addEventListener('click', function () {
      closeModal();
      markDismissedThisSession();
    });
    actions.appendChild(dismissBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    // Dismiss when clicking outer dark backdrop
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeModal();
        markDismissedThisSession();
      }
    });

    document.body.appendChild(modal);
    setTimeout(function () {
      closeX.focus();
    }, 50);
  }

  // ─── Styles for Install Modal ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('bedrock-pwa-styles')) return;
    var s = document.createElement('style');
    s.id = 'bedrock-pwa-styles';
    s.textContent = `
/* ── Bedrock PWA Installation Modal ── */
.bedrock-pwa-overlay {
  position: fixed; inset: 0; z-index: 999999;
  background: rgba(9, 45, 82, 0.85);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  display: flex; align-items: center; justify-content: center;
  padding: 18px;
  animation: bpFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transition: opacity 0.25s ease, transform 0.25s ease;
}

@keyframes bpFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.bedrock-pwa-dialog {
  background: #ffffff;
  border-radius: 24px;
  width: 100%; max-width: 440px;
  max-height: 92vh;
  overflow-y: auto;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  position: relative;
  padding: 28px 24px 24px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  animation: bpSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes bpSlideUp {
  from { opacity: 0; transform: translateY(25px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.bedrock-pwa-close {
  position: absolute; top: 16px; right: 18px;
  background: #f0f4f8; border: none; border-radius: 50%;
  width: 34px; height: 34px; font-size: 20px; line-height: 1;
  color: #556987; cursor: pointer; display: flex; align-items: center;
  justify-content: center; transition: all 0.2s ease;
}
.bedrock-pwa-close:hover {
  background: #e2e8f0; color: #0d4f8c; transform: scale(1.08);
}

.bedrock-pwa-header {
  text-align: center; margin-bottom: 14px;
}

.bedrock-pwa-logo-wrap {
  position: relative; display: inline-block; margin-bottom: 12px;
}
.bedrock-pwa-logo {
  width: 76px; height: 76px; border-radius: 20px;
  box-shadow: 0 8px 24px rgba(13, 79, 140, 0.35);
  border: 3px solid #f5a623; object-fit: cover;
}
.bedrock-pwa-badge {
  position: absolute; bottom: -4px; right: -8px;
  background: #10b981; color: #fff; font-size: 11px;
  font-weight: 700; padding: 2px 7px; border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
  display: flex; align-items: center; gap: 3px;
}

.bedrock-pwa-title {
  font-family: 'Poppins', system-ui, sans-serif;
  font-size: 1.25rem; font-weight: 700; color: #092d52;
  margin: 0 0 4px; letter-spacing: -0.2px; line-height: 1.3;
}
.bedrock-pwa-tag {
  font-size: 0.84rem; color: #5b6b79; margin: 0; font-weight: 500;
}

.bedrock-pwa-desc {
  font-size: 0.88rem; color: #4a5568; line-height: 1.5;
  text-align: center; margin: 0 0 16px;
  background: #f8fafc; padding: 12px 14px; border-radius: 12px;
  border-left: 3px solid #1a7fd4;
}

.bedrock-pwa-features {
  display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;
}
.bp-feat {
  display: flex; align-items: center; gap: 12px;
  font-size: 0.86rem; color: #2d3748; font-weight: 500;
  padding: 8px 12px; background: #f0f7ff; border-radius: 10px;
}
.bp-feat i {
  color: #1a7fd4; width: 18px; text-align: center; font-size: 1rem; flex-shrink: 0;
}

.bedrock-pwa-guide {
  background: #fff8e8; border: 1px solid #fde09d;
  border-radius: 14px; padding: 14px; margin-bottom: 12px; text-align: left;
}
.guide-title {
  font-weight: 700; font-size: 0.88rem; color: #7c4800; margin-bottom: 8px;
  display: flex; align-items: center;
}
.guide-steps {
  margin: 0; padding-left: 20px; font-size: 0.82rem; color: #4a3410; line-height: 1.6;
}

.bedrock-pwa-actions {
  display: flex; flex-direction: column; gap: 9px;
}
.btn-pwa-primary {
  background: linear-gradient(135deg, #1a7fd4 0%, #0d4f8c 100%);
  color: #ffffff; border: none; border-radius: 14px;
  padding: 14px 20px; font-size: 0.98rem; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 18px rgba(13, 79, 140, 0.4);
  transition: all 0.2s ease;
  font-family: 'Poppins', system-ui, sans-serif;
  letter-spacing: 0.2px;
}
.btn-pwa-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(13, 79, 140, 0.5);
  background: linear-gradient(135deg, #228ee6 0%, #0f5799 100%);
}
.btn-pwa-primary:active {
  transform: translateY(0);
}

.btn-pwa-dismiss {
  background: transparent; color: #718096; border: none;
  font-size: 0.86rem; font-weight: 600; padding: 10px; cursor: pointer;
  transition: color 0.2s; font-family: inherit;
}
.btn-pwa-dismiss:hover {
  color: #2d3748;
}

/* Ensure no floating download buttons ever show */
.bedrock-pwa-float, #bedrock-pwa-floating-btn, #pwa-install-btn {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
`;
    document.head.appendChild(s);
  }

  // ─── Register Service Worker ──────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then(function (reg) {
          console.log('[PWA] Service Worker active, scope:', reg.scope);
        })
        .catch(function (err) {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // ─── Listen for Installability ────────────────────────────────────────────
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt fired — app is installable');
  });

  window.addEventListener('appinstalled', function () {
    console.log('[PWA] App successfully installed!');
    deferredPrompt = null;
    markInstalledAndHide();
  });

  // ─── Public API (if called anywhere) ──────────────────────────────────────
  window.showBedrockPwaInstall = showInstallModal;

  // ─── Initialize ───────────────────────────────────────────────────────────
  function init() {
    cleanUpInstallUI();

    if (isInstalled()) return; // Already installed, do nothing

    // Automatic Popup on FIRST visit per session — skips admin pages
    if (!wasDismissedThisSession() && !isAdminPage()) {
      window.setTimeout(function () {
        if (!isInstalled() && !wasDismissedThisSession()) {
          showInstallModal();
        }
      }, 1400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
