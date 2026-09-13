// Baidoa Bedrock ICT Campus - Progressive Web App Installer & Offline Handler
(function () {
  'use strict';

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    console.log('[PWA] Running in standalone PWA mode');
    return;
  }

  var deferredPrompt = null;
  var modal = null;
  var floatingBtn = null;
  var promptedKey = 'bedrock-pwa-prompted';

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function storageAvailable() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  }

  function setPrompted() {
    if (storageAvailable()) localStorage.setItem(promptedKey, Date.now().toString());
  }

  function shouldAutoPrompt() {
    if (!storageAvailable()) return true;
    var last = localStorage.getItem(promptedKey);
    if (!last) return true;
    var elapsed = Date.now() - parseInt(last, 10);
    return elapsed > (24 * 60 * 60 * 1000); // 24 hours between automatic popups
  }

  function closeModal() {
    if (modal) {
      modal.remove();
      modal = null;
    }
  }

  function launchNativeInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choiceResult) {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted installation');
        if (floatingBtn) floatingBtn.style.display = 'none';
      }
      deferredPrompt = null;
      closeModal();
      setPrompted();
    });
    return true;
  }

  // Open the download/install modal
  function showInstallModal() {
    if (modal || document.getElementById('bedrock-pwa-modal')) return;

    modal = document.createElement('div');
    modal.id = 'bedrock-pwa-modal';
    modal.className = 'bedrock-pwa-overlay';

    var box = document.createElement('div');
    box.className = 'bedrock-pwa-dialog';

    var closeX = document.createElement('button');
    closeX.className = 'bedrock-pwa-close';
    closeX.innerHTML = '&times;';
    closeX.setAttribute('aria-label', 'Close dialog');
    closeX.addEventListener('click', function () {
      closeModal();
      setPrompted();
    });
    box.appendChild(closeX);

    // School Logo & Header
    var header = document.createElement('div');
    header.className = 'bedrock-pwa-header';
    header.innerHTML = [
      '<div class="bedrock-pwa-logo-wrap">',
      '  <img src="/images/icons/icon-192.png" alt="Baidoa Bedrock ICT Campus" class="bedrock-pwa-logo" onerror="this.src=\'/images/BEDRCOK LOGO.JPG\'">',
      '  <span class="bedrock-pwa-badge"><i class="fas fa-check-circle"></i> Official</span>',
      '</div>',
      '<h3 class="bedrock-pwa-title">Baidoa Bedrock ICT Campus</h3>',
      '<p class="bedrock-pwa-tag">Official Student &amp; Staff Mobile Application</p>'
    ].join('');
    box.appendChild(header);

    // Features list
    var features = document.createElement('div');
    features.className = 'bedrock-pwa-features';
    features.innerHTML = [
      '<div class="bp-feat"><i class="fas fa-graduation-cap"></i><span>Instant Exam Results &amp; Honors</span></div>',
      '<div class="bp-feat"><i class="fas fa-calendar-alt"></i><span>Live Timetable &amp; Attendance</span></div>',
      '<div class="bp-feat"><i class="fas fa-book-reader"></i><span>Digital Library &amp; Past Papers</span></div>',
      '<div class="bp-feat"><i class="fas fa-bolt"></i><span>Lightning Fast &amp; Works Offline</span></div>'
    ].join('');
    box.appendChild(features);

    // Action Area
    var actions = document.createElement('div');
    actions.className = 'bedrock-pwa-actions';

    if (deferredPrompt) {
      // Native one-click install available
      var directBtn = document.createElement('button');
      directBtn.className = 'btn-pwa-primary';
      directBtn.innerHTML = '<i class="fas fa-download me-2"></i>Install App on This Device';
      directBtn.addEventListener('click', function () {
        launchNativeInstall();
      });
      actions.appendChild(directBtn);
    } else if (isIOS()) {
      // iOS Safari specific guide
      var iosGuide = document.createElement('div');
      iosGuide.className = 'bedrock-pwa-guide';
      iosGuide.innerHTML = [
        '<div class="guide-title"><i class="fab fa-apple me-1"></i> How to Install on iPhone / iPad:</div>',
        '<ol class="guide-steps">',
        '  <li>Tap the <strong>Share</strong> icon <span class="ios-icon">⎋</span> (at the bottom of Safari).</li>',
        '  <li>Scroll down and tap <strong>"Add to Home Screen"</strong> <span class="ios-icon"><i class="fas fa-plus-square"></i></span>.</li>',
        '  <li>Tap <strong>"Add"</strong> in the top right corner.</li>',
        '</ol>',
        '<div class="guide-preview">',
        '  <img src="/images/icons/icon-192.png" alt="Icon">',
        '  <div><strong>Baidoa Bedrock ICT</strong><br><small>Will appear as an app on your Home Screen</small></div>',
        '</div>'
      ].join('');
      actions.appendChild(iosGuide);

      var gotItBtn = document.createElement('button');
      gotItBtn.className = 'btn-pwa-primary mt-2';
      gotItBtn.textContent = 'Got It, Let\'s Do It';
      gotItBtn.addEventListener('click', function () {
        closeModal();
        setPrompted();
      });
      actions.appendChild(gotItBtn);
    } else {
      // Android or Desktop Chrome/Edge without prompt yet
      var genGuide = document.createElement('div');
      genGuide.className = 'bedrock-pwa-guide';
      genGuide.innerHTML = [
        '<div class="guide-title"><i class="fas fa-mobile-alt me-1"></i> Quick 2-Step Installation:</div>',
        '<ol class="guide-steps">',
        '  <li>Tap the browser menu <strong>(3 dots ⋮)</strong> in the top-right corner.</li>',
        '  <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>',
        '  <li>Confirm to add <strong>Baidoa Bedrock ICT Campus</strong> to your device!</li>',
        '</ol>'
      ].join('');
      actions.appendChild(genGuide);

      var tryInstallBtn = document.createElement('button');
      tryInstallBtn.className = 'btn-pwa-primary mt-2';
      tryInstallBtn.innerHTML = '<i class="fas fa-download me-2"></i>Confirm &amp; Install';
      tryInstallBtn.addEventListener('click', function () {
        if (!launchNativeInstall()) {
          tryInstallBtn.innerHTML = '<i class="fas fa-info-circle me-1"></i> Follow the steps above from browser menu';
          tryInstallBtn.disabled = true;
          tryInstallBtn.style.opacity = '0.7';
        }
      });
      actions.appendChild(tryInstallBtn);
    }

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn-pwa-dismiss';
    dismissBtn.textContent = 'Maybe Later';
    dismissBtn.addEventListener('click', function () {
      closeModal();
      setPrompted();
    });
    actions.appendChild(dismissBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeModal();
        setPrompted();
      }
    });

    document.body.appendChild(modal);
  }

  // Create persistent Floating Download Pill
  function createFloatingDownloadButton() {
    if (floatingBtn || document.getElementById('bedrock-pwa-floating-btn')) return;

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'bedrock-pwa-floating-btn';
    floatingBtn.className = 'bedrock-pwa-float';
    floatingBtn.setAttribute('title', 'Download & Install Baidoa Bedrock ICT Campus App');
    floatingBtn.innerHTML = [
      '<div class="pwa-float-content">',
      '  <img src="/images/icons/icon-192.png" alt="Bedrock ICT Logo" class="pwa-float-logo" onerror="this.src=\'/images/BEDRCOK LOGO.JPG\'">',
      '  <div class="pwa-float-text">',
      '    <span class="pwa-float-title">Download App</span>',
      '    <span class="pwa-float-sub">Bedrock ICT</span>',
      '  </div>',
      '  <span class="pwa-float-icon"><i class="fas fa-download"></i></span>',
      '</div>'
    ].join('');

    floatingBtn.addEventListener('click', function (e) {
      e.preventDefault();
      showInstallModal();
    });

    document.body.appendChild(floatingBtn);
  }

  // Inject Styles for PWA UI
  function injectStyles() {
    if (document.getElementById('bedrock-pwa-styles')) return;
    var style = document.createElement('style');
    style.id = 'bedrock-pwa-styles';
    style.textContent = [
      '/* Bedrock ICT Campus PWA Styles */',
      '.bedrock-pwa-overlay {',
      '  position: fixed; inset: 0; z-index: 999999; background: rgba(9, 45, 82, 0.75);',
      '  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);',
      '  display: flex; align-items: center; justify-content: center; padding: 16px;',
      '  animation: bpFadeIn .25s cubic-bezier(0.4, 0, 0.2, 1);',
      '}',
      '.bedrock-pwa-dialog {',
      '  background: #ffffff; border-radius: 24px; max-width: 410px; width: 100%;',
      '  padding: 26px 22px 20px; box-shadow: 0 25px 70px rgba(9, 45, 82, 0.45);',
      '  position: relative; animation: bpPopUp .3s cubic-bezier(0.34, 1.56, 0.64, 1);',
      '  color: #1c2230; font-family: "Poppins", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  border: 2px solid #e6f2fb; box-sizing: border-box; max-height: 90vh; overflow-y: auto;',
      '}',
      '.bedrock-pwa-close {',
      '  position: absolute; top: 14px; right: 14px; background: #f0f4f8; border: none;',
      '  width: 32px; height: 32px; border-radius: 50%; font-size: 20px; line-height: 1;',
      '  color: #8a96a3; cursor: pointer; display: flex; align-items: center; justify-content: center;',
      '  transition: all 0.2s;',
      '}',
      '.bedrock-pwa-close:hover { background: #e6f2fb; color: #0d4f8c; transform: scale(1.05); }',
      '.bedrock-pwa-header { text-align: center; margin-bottom: 16px; }',
      '.bedrock-pwa-logo-wrap { position: relative; width: 78px; height: 78px; margin: 0 auto 10px; }',
      '.bedrock-pwa-logo {',
      '  width: 78px; height: 78px; border-radius: 20px; object-fit: cover;',
      '  border: 3px solid #f5a623; box-shadow: 0 8px 24px rgba(13, 79, 140, 0.25);',
      '  background: #ffffff;',
      '}',
      '.bedrock-pwa-badge {',
      '  position: absolute; bottom: -6px; right: -8px; background: linear-gradient(135deg, #0d4f8c, #1a7fd4);',
      '  color: #fff; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 12px;',
      '  border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.15);',
      '}',
      '.bedrock-pwa-title { font-size: 1.15rem; font-weight: 800; color: #0d4f8c; margin: 0 0 3px; }',
      '.bedrock-pwa-tag { font-size: 0.78rem; color: #5a6b7c; margin: 0; font-weight: 500; }',
      '.bedrock-pwa-features {',
      '  background: #f4f8fc; border-radius: 14px; padding: 12px 14px; margin-bottom: 18px;',
      '  border: 1px solid #e2edf7;',
      '}',
      '.bp-feat { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; font-weight: 600; color: #2a3b4c; margin-bottom: 7px; }',
      '.bp-feat:last-child { margin-bottom: 0; }',
      '.bp-feat i { color: #f5a623; font-size: 0.95rem; width: 18px; text-align: center; }',
      '.bedrock-pwa-guide {',
      '  background: #fef9f0; border: 1.5px dashed #f5a623; border-radius: 14px; padding: 12px 14px; margin-bottom: 12px;',
      '  text-align: left;',
      '}',
      '.guide-title { font-weight: 700; font-size: 0.84rem; color: #b45309; margin-bottom: 6px; }',
      '.guide-steps { margin: 0 0 10px; padding-left: 20px; font-size: 0.78rem; line-height: 1.6; color: #334155; }',
      '.guide-steps li { margin-bottom: 4px; }',
      '.ios-icon { display: inline-block; background: #e2e8f0; padding: 1px 6px; border-radius: 4px; font-weight: 700; margin: 0 2px; }',
      '.guide-preview {',
      '  display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 10px; padding: 8px;',
      '  border: 1px solid #fed7aa; font-size: 0.75rem;',
      '}',
      '.guide-preview img { width: 34px; height: 34px; border-radius: 8px; border: 1px solid #f5a623; }',
      '.btn-pwa-primary {',
      '  width: 100%; padding: 12px 16px; border: none; border-radius: 14px;',
      '  background: linear-gradient(135deg, #0d4f8c 0%, #1a7fd4 100%); color: #ffffff;',
      '  font-size: 0.92rem; font-weight: 700; cursor: pointer; transition: all 0.2s;',
      '  box-shadow: 0 6px 20px rgba(13, 79, 140, 0.35);',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.btn-pwa-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(13, 79, 140, 0.45); }',
      '.btn-pwa-dismiss {',
      '  width: 100%; padding: 9px; margin-top: 6px; border: none; background: transparent;',
      '  color: #718096; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: color 0.2s;',
      '}',
      '.btn-pwa-dismiss:hover { color: #0d4f8c; text-decoration: underline; }',
      '/* Floating Download Pill */',
      '.bedrock-pwa-float {',
      '  position: fixed; bottom: 20px; right: 20px; z-index: 1040;',
      '  background: linear-gradient(135deg, #092d52 0%, #0d4f8c 60%, #1a7fd4 100%);',
      '  color: #fff; border-radius: 50px; padding: 6px 14px 6px 8px;',
      '  box-shadow: 0 8px 25px rgba(9, 45, 82, 0.4), 0 0 0 2px #f5a623;',
      '  cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);',
      '  user-select: none; -webkit-user-select: none;',
      '}',
      '.bedrock-pwa-float:hover {',
      '  transform: translateY(-4px) scale(1.04);',
      '  box-shadow: 0 12px 30px rgba(9, 45, 82, 0.5), 0 0 0 3px #f5a623;',
      '}',
      '.pwa-float-content { display: flex; align-items: center; gap: 9px; }',
      '.pwa-float-logo {',
      '  width: 34px; height: 34px; border-radius: 50%; border: 2px solid #f5a623;',
      '  background: #fff; object-fit: cover; flex-shrink: 0;',
      '}',
      '.pwa-float-text { display: flex; flex-direction: column; line-height: 1.15; }',
      '.pwa-float-title { font-size: 0.82rem; font-weight: 800; color: #ffffff; letter-spacing: 0.2px; }',
      '.pwa-float-sub { font-size: 0.64rem; color: #f5a623; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }',
      '.pwa-float-icon {',
      '  width: 26px; height: 26px; border-radius: 50%; background: #f5a623; color: #092d52;',
      '  display: flex; align-items: center; justify-content: center; font-size: 0.72rem;',
      '  margin-left: 2px; flex-shrink: 0;',
      '}',
      '@media (max-width: 576px) {',
      '  .bedrock-pwa-float {',
      '    bottom: 16px; right: 14px; padding: 5px 12px 5px 6px;',
      '    box-shadow: 0 6px 20px rgba(9, 45, 82, 0.35), 0 0 0 2px #f5a623;',
      '  }',
      '  body.has-bottom-nav .bedrock-pwa-float,',
      '  .bottom-nav:not(.d-none) ~ .bedrock-pwa-float {',
      '    bottom: 76px !important;',
      '  }',
      '  .pwa-float-logo { width: 30px; height: 30px; }',
      '  .pwa-float-title { font-size: 0.76rem; }',
      '  .pwa-float-sub { font-size: 0.6rem; }',
      '  .pwa-float-icon { width: 22px; height: 22px; font-size: 0.65rem; }',
      '  .bedrock-pwa-dialog { padding: 22px 18px 16px; border-radius: 20px; }',
      '}',
      '@keyframes bpFadeIn { from { opacity: 0; } to { opacity: 1; } }',
      '@keyframes bpPopUp { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then(function (reg) {
          console.log('[PWA] Service Worker active with scope:', reg.scope);
        })
        .catch(function (err) {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // Intercept beforeinstallprompt
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt captured');
    if (floatingBtn) {
      floatingBtn.classList.add('has-prompt');
    }
  });

  window.addEventListener('appinstalled', function () {
    console.log('[PWA] Baidoa Bedrock ICT Campus installed successfully');
    deferredPrompt = null;
    closeModal();
    if (floatingBtn) floatingBtn.style.display = 'none';
  });

  // Global trigger function for any download button across the site
  window.showBedrockPwaInstall = function () {
    showInstallModal();
  };

  // Wire up any elements on page with .pwa-install-btn
  document.addEventListener('click', function (e) {
    var target = e.target.closest('.pwa-install-btn, [data-pwa-install]');
    if (target) {
      e.preventDefault();
      showInstallModal();
    }
  });

  // Initialize once DOM is ready
  function init() {
    injectStyles();
    createFloatingDownloadButton();

    // Auto-prompt after 2.5 seconds if not prompted in past 24 hours
    if (shouldAutoPrompt()) {
      window.setTimeout(function () {
        showInstallModal();
      }, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
