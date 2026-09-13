// Baidoa Bedrock ICT Campus - Progressive Web App Installer & Offline Handler
(function () {
  'use strict';

  var INSTALLED_KEY = 'bedrock-pwa-installed';
  var PROMPTED_KEY  = 'bedrock-pwa-prompted';

  // If already installed (running as standalone PWA), do nothing at all
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    console.log('[PWA] Running in standalone mode — hiding install UI');
    // Mark installed so we never show the button again
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch(e){}
    return;
  }

  // If the user previously installed and we know about it, hide everything
  function isInstalled() {
    try { return localStorage.getItem(INSTALLED_KEY) === '1'; } catch(e) { return false; }
  }

  var deferredPrompt = null;
  var modal          = null;
  var floatingBtn    = null;

  function storageAvailable() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  }

  // Check if the user has already dismissed the modal THIS session
  function wasPromptedThisSession() {
    try { return sessionStorage.getItem(PROMPTED_KEY) === '1'; } catch(e) { return false; }
  }
  function markPromptedThisSession() {
    try { sessionStorage.setItem(PROMPTED_KEY, '1'); } catch(e) {}
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function closeModal() {
    if (modal) {
      modal.style.animation = 'bpFadeOut .2s ease forwards';
      setTimeout(function() {
        if (modal) { modal.remove(); modal = null; }
      }, 200);
    }
  }

  function hideFloatingBtn() {
    if (floatingBtn) {
      floatingBtn.style.transition = 'opacity 0.4s, transform 0.4s';
      floatingBtn.style.opacity = '0';
      floatingBtn.style.transform = 'scale(0.7) translateY(20px)';
      setTimeout(function() {
        if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
      }, 400);
    }
  }

  function markInstalledAndHide() {
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch(e){}
    closeModal();
    hideFloatingBtn();
  }

  function launchNativeInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (result) {
      if (result.outcome === 'accepted') {
        console.log('[PWA] Installed!');
        markInstalledAndHide();
      } else {
        closeModal();
        markPromptedThisSession();
      }
      deferredPrompt = null;
    });
    return true;
  }

  // ─── Build Install Modal ───────────────────────────────────────────────────
  function showInstallModal() {
    if (modal || document.getElementById('bedrock-pwa-modal')) return;
    if (isInstalled()) return;

    modal = document.createElement('div');
    modal.id = 'bedrock-pwa-modal';
    modal.className = 'bedrock-pwa-overlay';

    var box = document.createElement('div');
    box.className = 'bedrock-pwa-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Install Baidoa Bedrock ICT Campus App');

    // Close button
    var closeX = document.createElement('button');
    closeX.className = 'bedrock-pwa-close';
    closeX.innerHTML = '&times;';
    closeX.setAttribute('aria-label', 'Close');
    closeX.addEventListener('click', function () {
      closeModal();
      markPromptedThisSession();
    });
    box.appendChild(closeX);

    // Header: Logo + School Name
    var header = document.createElement('div');
    header.className = 'bedrock-pwa-header';
    header.innerHTML = [
      '<div class="bedrock-pwa-logo-wrap">',
      '  <img src="/images/icons/icon-192.png" alt="Baidoa Bedrock ICT Campus" class="bedrock-pwa-logo"',
      '       onerror="this.src=\'/images/BEDRCOK LOGO.JPG\'">',
      '  <span class="bedrock-pwa-badge"><i class="fas fa-check-circle"></i> Official</span>',
      '</div>',
      '<h3 class="bedrock-pwa-title">Baidoa Bedrock ICT Campus</h3>',
      '<p class="bedrock-pwa-tag">Official Student &amp; Staff Mobile Application</p>'
    ].join('');
    box.appendChild(header);

    // Features
    var features = document.createElement('div');
    features.className = 'bedrock-pwa-features';
    features.innerHTML = [
      '<div class="bp-feat"><i class="fas fa-graduation-cap"></i><span>Instant Exam Results &amp; Honors</span></div>',
      '<div class="bp-feat"><i class="fas fa-calendar-alt"></i><span>Live Timetable &amp; Attendance</span></div>',
      '<div class="bp-feat"><i class="fas fa-book-reader"></i><span>Digital Library &amp; Past Papers</span></div>',
      '<div class="bp-feat"><i class="fas fa-bolt"></i><span>Fast &amp; Works Offline</span></div>'
    ].join('');
    box.appendChild(features);

    // Actions
    var actions = document.createElement('div');
    actions.className = 'bedrock-pwa-actions';

    if (deferredPrompt) {
      // Android Chrome / Edge — one-tap install available
      var directBtn = document.createElement('button');
      directBtn.className = 'btn-pwa-primary';
      directBtn.innerHTML = '<i class="fas fa-download me-2"></i>Install App on This Device';
      directBtn.addEventListener('click', function () { launchNativeInstall(); });
      actions.appendChild(directBtn);

    } else if (isIOS()) {
      // iOS Safari — manual guide
      var iosGuide = document.createElement('div');
      iosGuide.className = 'bedrock-pwa-guide';
      iosGuide.innerHTML = [
        '<div class="guide-title"><i class="fab fa-apple me-1"></i> How to Install on iPhone / iPad:</div>',
        '<ol class="guide-steps">',
        '  <li>Tap the <strong>Share</strong> icon <span class="ios-icon">&#9650;</span> at the bottom of Safari.</li>',
        '  <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>',
        '  <li>Tap <strong>"Add"</strong> in the top right corner.</li>',
        '</ol>',
        '<div class="guide-preview">',
        '  <img src="/images/icons/apple-touch-icon.png" alt="App Icon">',
        '  <div><strong>Baidoa Bedrock ICT</strong><br><small>Appears as an app on your Home Screen</small></div>',
        '</div>'
      ].join('');
      actions.appendChild(iosGuide);

      var gotItBtn = document.createElement('button');
      gotItBtn.className = 'btn-pwa-primary mt-2';
      gotItBtn.textContent = "Got It — Let's Do It!";
      gotItBtn.addEventListener('click', function () { closeModal(); markPromptedThisSession(); });
      actions.appendChild(gotItBtn);

    } else {
      // Android without beforeinstallprompt (e.g., Firefox, Samsung) — manual guide
      var genGuide = document.createElement('div');
      genGuide.className = 'bedrock-pwa-guide';
      genGuide.innerHTML = [
        '<div class="guide-title"><i class="fas fa-mobile-alt me-1"></i> Install in 2 Steps:</div>',
        '<ol class="guide-steps">',
        '  <li>Tap the browser menu <strong>(⋮ three dots)</strong> in the top-right.</li>',
        '  <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>',
        '</ol>'
      ].join('');
      actions.appendChild(genGuide);

      var tryBtn = document.createElement('button');
      tryBtn.className = 'btn-pwa-primary mt-2';
      tryBtn.innerHTML = '<i class="fas fa-download me-2"></i>Install App';
      tryBtn.addEventListener('click', function () {
        if (!launchNativeInstall()) {
          tryBtn.innerHTML = '<i class="fas fa-info-circle me-1"></i>Use browser menu ⋮ to install';
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
      markPromptedThisSession();
    });
    actions.appendChild(dismissBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    // Click outside to dismiss
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { closeModal(); markPromptedThisSession(); }
    });

    document.body.appendChild(modal);
    // Focus trap for accessibility
    setTimeout(function() { closeX.focus(); }, 50);
  }

  // ─── Floating Download Pill ────────────────────────────────────────────────
  // Don't show on admin/teacher/staff pages — they don't need it
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
    return ADMIN_PATHS.some(function(a) { return p.includes(a); });
  }

  function createFloatingBtn() {
    if (floatingBtn || document.getElementById('bedrock-pwa-floating-btn')) return;
    if (isInstalled()) return;
    if (isAdminPage()) return;

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'bedrock-pwa-floating-btn';
    floatingBtn.className = 'bedrock-pwa-float';
    floatingBtn.setAttribute('title', 'Install Baidoa Bedrock ICT Campus App');
    floatingBtn.setAttribute('role', 'button');
    floatingBtn.setAttribute('tabindex', '0');
    floatingBtn.innerHTML = [
      '<div class="pwa-float-content">',
      '  <img src="/images/icons/icon-192.png" alt="Bedrock ICT" class="pwa-float-logo"',
      '       onerror="this.src=\'/images/BEDRCOK LOGO.JPG\'">',
      '  <div class="pwa-float-text">',
      '    <span class="pwa-float-title">Install App</span>',
      '    <span class="pwa-float-sub">Bedrock ICT</span>',
      '  </div>',
      '  <span class="pwa-float-icon"><i class="fas fa-download"></i></span>',
      '</div>'
    ].join('');

    function handleClick(e) {
      e.preventDefault();
      if (deferredPrompt) {
        launchNativeInstall();
      } else {
        showInstallModal();
      }
    }
    floatingBtn.addEventListener('click', handleClick);
    floatingBtn.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); }
    });

    document.body.appendChild(floatingBtn);
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('bedrock-pwa-styles')) return;
    var s = document.createElement('style');
    s.id = 'bedrock-pwa-styles';
    s.textContent = `
/* ── Bedrock PWA Styles ── */
.bedrock-pwa-overlay {
  position: fixed; inset: 0; z-index: 999999;
  background: rgba(9,45,82,0.82);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0 0 0 0;
  animation: bpFadeIn .25s ease;
}
@media (min-width: 480px) {
  .bedrock-pwa-overlay { align-items: center; padding: 16px; }
}
.bedrock-pwa-dialog {
  background: #fff; border-radius: 24px 24px 0 0; max-width: 420px; width: 100%;
  padding: 28px 22px 32px; box-shadow: 0 -10px 60px rgba(9,45,82,0.5);
  position: relative; animation: bpSlideUp .35s cubic-bezier(0.34,1.56,0.64,1);
  color: #1c2230; font-family: 'Poppins', system-ui, -apple-system, sans-serif;
  max-height: 92vh; overflow-y: auto; box-sizing: border-box;
}
@media (min-width: 480px) {
  .bedrock-pwa-dialog {
    border-radius: 24px; animation: bpPopUp .35s cubic-bezier(0.34,1.56,0.64,1);
    padding: 28px 24px 24px; box-shadow: 0 25px 70px rgba(9,45,82,0.45);
    border: 2px solid #e6f2fb;
  }
}
/* Drag indicator for mobile bottom sheet */
.bedrock-pwa-dialog::before {
  content: ''; display: block; width: 40px; height: 4px;
  background: #e2e8f0; border-radius: 4px; margin: 0 auto 18px;
}
@media (min-width: 480px) { .bedrock-pwa-dialog::before { display: none; } }

.bedrock-pwa-close {
  position: absolute; top: 14px; right: 14px; background: #f0f4f8; border: none;
  width: 32px; height: 32px; border-radius: 50%; font-size: 20px; line-height: 1;
  color: #8a96a3; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.bedrock-pwa-close:hover { background: #e6f2fb; color: #0d4f8c; transform: scale(1.08); }

.bedrock-pwa-header { text-align: center; margin-bottom: 16px; }
.bedrock-pwa-logo-wrap { position: relative; width: 80px; height: 80px; margin: 0 auto 12px; }
.bedrock-pwa-logo {
  width: 80px; height: 80px; border-radius: 22px; object-fit: cover;
  border: 3px solid #f5a623; box-shadow: 0 8px 24px rgba(13,79,140,.25); background: #fff;
}
.bedrock-pwa-badge {
  position: absolute; bottom: -7px; right: -10px;
  background: linear-gradient(135deg, #0d4f8c, #1a7fd4);
  color: #fff; font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 12px;
  border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.15); white-space: nowrap;
}
.bedrock-pwa-title { font-size: 1.15rem; font-weight: 800; color: #0d4f8c; margin: 0 0 4px; }
.bedrock-pwa-tag  { font-size: 0.78rem; color: #5a6b7c; margin: 0; font-weight: 500; }

.bedrock-pwa-features {
  background: #f4f8fc; border-radius: 14px; padding: 12px 14px; margin-bottom: 18px;
  border: 1px solid #e2edf7;
}
.bp-feat { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; font-weight: 600; color: #2a3b4c; margin-bottom: 7px; }
.bp-feat:last-child { margin-bottom: 0; }
.bp-feat i { color: #f5a623; font-size: 0.95rem; width: 18px; text-align: center; }

.bedrock-pwa-guide {
  background: #fef9f0; border: 1.5px dashed #f5a623; border-radius: 14px;
  padding: 12px 14px; margin-bottom: 12px; text-align: left;
}
.guide-title  { font-weight: 700; font-size: 0.84rem; color: #b45309; margin-bottom: 6px; }
.guide-steps  { margin: 0 0 10px; padding-left: 20px; font-size: 0.78rem; line-height: 1.65; color: #334155; }
.guide-steps li { margin-bottom: 4px; }
.ios-icon { display: inline-block; background: #e2e8f0; padding: 1px 6px; border-radius: 4px; font-weight: 700; }
.guide-preview {
  display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 10px;
  padding: 8px; border: 1px solid #fed7aa; font-size: 0.75rem;
}
.guide-preview img { width: 34px; height: 34px; border-radius: 8px; border: 1px solid #f5a623; }

.btn-pwa-primary {
  width: 100%; padding: 13px 16px; border: none; border-radius: 14px;
  background: linear-gradient(135deg, #0d4f8c 0%, #1a7fd4 100%); color: #fff;
  font-size: 0.93rem; font-weight: 700; cursor: pointer; transition: all 0.2s;
  box-shadow: 0 6px 20px rgba(13,79,140,.35);
  display: flex; align-items: center; justify-content: center;
  font-family: inherit;
}
.btn-pwa-primary:hover  { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(13,79,140,.45); }
.btn-pwa-primary:active { transform: translateY(0); }
.btn-pwa-dismiss {
  width: 100%; padding: 9px; margin-top: 7px; border: none; background: transparent;
  color: #718096; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: color .2s;
  font-family: inherit;
}
.btn-pwa-dismiss:hover { color: #0d4f8c; text-decoration: underline; }
.mt-2 { margin-top: 8px !important; }

/* ── Floating Download Pill ── */
.bedrock-pwa-float {
  position: fixed; bottom: 22px; right: 18px; z-index: 10040;
  background: linear-gradient(135deg, #092d52 0%, #0d4f8c 55%, #1a7fd4 100%);
  color: #fff; border-radius: 50px; padding: 7px 14px 7px 8px;
  box-shadow: 0 8px 25px rgba(9,45,82,.45), 0 0 0 2px #f5a623;
  cursor: pointer; transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
  user-select: none; -webkit-user-select: none;
  animation: bpFloatIn .5s .8s both;
}
.bedrock-pwa-float:hover {
  transform: translateY(-4px) scale(1.05);
  box-shadow: 0 12px 30px rgba(9,45,82,.5), 0 0 0 3px #f5a623;
}
.pwa-float-content { display: flex; align-items: center; gap: 9px; }
.pwa-float-logo {
  width: 34px; height: 34px; border-radius: 50%; border: 2px solid #f5a623;
  background: #fff; object-fit: cover; flex-shrink: 0;
}
.pwa-float-text  { display: flex; flex-direction: column; line-height: 1.18; }
.pwa-float-title { font-size: 0.82rem; font-weight: 800; color: #fff; letter-spacing: .2px; }
.pwa-float-sub   { font-size: 0.63rem; color: #f5a623; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
.pwa-float-icon  {
  width: 26px; height: 26px; border-radius: 50%; background: #f5a623; color: #092d52;
  display: flex; align-items: center; justify-content: center; font-size: 0.72rem;
  margin-left: 2px; flex-shrink: 0;
}
@media (max-width: 576px) {
  .bedrock-pwa-float { bottom: 16px; right: 12px; padding: 6px 12px 6px 7px; }
  .pwa-float-logo  { width: 30px; height: 30px; }
  .pwa-float-title { font-size: 0.76rem; }
  .pwa-float-sub   { font-size: 0.6rem; }
  .pwa-float-icon  { width: 22px; height: 22px; font-size: 0.65rem; }
}

@keyframes bpFadeIn    { from { opacity:0; } to { opacity:1; } }
@keyframes bpFadeOut   { from { opacity:1; } to { opacity:0; } }
@keyframes bpSlideUp   { from { transform: translateY(100%); opacity:0; } to { transform: translateY(0); opacity:1; } }
@keyframes bpPopUp     { from { transform: scale(0.88) translateY(24px); opacity:0; } to { transform: scale(1) translateY(0); opacity:1; } }
@keyframes bpFloatIn   { from { transform: translateY(30px) scale(0.8); opacity:0; } to { transform: translateY(0) scale(1); opacity:1; } }
`;
    document.head.appendChild(s);
  }

  // ─── Service Worker Registration ─────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then(function (reg) {
          console.log('[PWA] SW registered, scope:', reg.scope);
        })
        .catch(function (err) {
          console.warn('[PWA] SW registration failed:', err);
        });
    });
  }

  // ─── Listen for installability ────────────────────────────────────────────
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt — app is installable');
    // If floating button exists, pulse it to signal it's ready
    if (floatingBtn) floatingBtn.classList.add('is-ready');
  });

  window.addEventListener('appinstalled', function () {
    console.log('[PWA] App installed!');
    deferredPrompt = null;
    markInstalledAndHide();
  });

  // ─── Public API ───────────────────────────────────────────────────────────
  window.showBedrockPwaInstall = showInstallModal;

  // Wire any .pwa-install-btn or [data-pwa-install] elements across pages
  document.addEventListener('click', function (e) {
    var target = e.target.closest('.pwa-install-btn, [data-pwa-install]');
    if (target) {
      e.preventDefault();
      if (deferredPrompt) { launchNativeInstall(); } else { showInstallModal(); }
    }
  });

  // ─── Initialize ──────────────────────────────────────────────────────────
  function init() {
    if (isInstalled()) return; // Already installed, show nothing

    injectStyles();
    createFloatingBtn(); // Skips on admin pages automatically

    // Show modal automatically on FIRST visit per session — only on public pages
    if (!wasPromptedThisSession() && !isAdminPage()) {
      // Small delay so page content loads first
      window.setTimeout(function () {
        if (!isInstalled()) showInstallModal();
      }, 1800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
