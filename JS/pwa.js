// Baidoa Bedrock ICT Campus - Progressive Web App Installer & Handler
(function () {
  'use strict';

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  var deferredPrompt = null;
  var modal = null;
  var pendingInstall = false;
  var installWaitTimer = null;
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

  function shouldPrompt() {
    if (!storageAvailable()) return true;
    var last = localStorage.getItem(promptedKey);
    if (!last) return true;
    // Prompt again after 3 days if dismissed
    var elapsed = Date.now() - parseInt(last, 10);
    return elapsed > (3 * 24 * 60 * 60 * 1000);
  }

  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
  }

  function launchInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choiceResult) {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
      }
      deferredPrompt = null;
      closeModal();
      setPrompted();
    });
    return true;
  }

  function showInstructions() {
    if (!modal) return;
    var steps;
    if (isIOS()) {
      steps = [
        'Tap the Share icon at the bottom of Safari',
        'Scroll down and select "Add to Home Screen"',
        'Tap "Add" in top-right to install'
      ];
    } else {
      steps = [
        'Tap the browser menu (three dots in top right)',
        'Tap "Add to Home screen" or "Install App"',
        'Confirm installation'
      ];
    }

    var box = modal.querySelector('.bedrock-pwa-box');
    if (!box) return;
    box.innerHTML = '';

    var icon = document.createElement('img');
    icon.src = '/images/icons/icon-192.png';
    icon.alt = 'Bedrock Logo';
    icon.style.cssText = 'width:64px;height:64px;border-radius:14px;display:block;margin:0 auto 12px;object-fit:cover;box-shadow:0 4px 12px rgba(13,79,140,0.25);';
    box.appendChild(icon);

    var title = document.createElement('h3');
    title.textContent = 'Install Bedrock ICT App';
    title.style.cssText = 'margin:0 0 14px;font-size:18px;text-align:center;color:#0d4f8c;font-weight:700;';
    box.appendChild(title);

    var list = document.createElement('ol');
    list.style.cssText = 'margin:0 0 20px;padding-left:22px;font-size:13.5px;line-height:1.8;color:#333;text-align:left;';
    steps.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;
      list.appendChild(li);
    });
    box.appendChild(list);

    var doneBtn = document.createElement('button');
    doneBtn.textContent = 'Got it';
    doneBtn.style.cssText = [
      'width:100%;padding:12px;border:none;border-radius:10px;',
      'background:linear-gradient(135deg,#0d4f8c,#1a73e8);color:#fff;',
      'font-size:14.5px;font-weight:600;cursor:pointer;'
    ].join('');
    doneBtn.addEventListener('click', closeModal);
    box.appendChild(doneBtn);
  }

  function showModal() {
    if (modal || document.getElementById('bedrock-pwa-modal')) return;
    if (!shouldPrompt()) return;

    modal = document.createElement('div');
    modal.id = 'bedrock-pwa-modal';
    modal.style.cssText = [
      'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.6);',
      'display:flex;align-items:center;justify-content:center;padding:20px;',
      'animation:bedrockFadeIn .25s ease;'
    ].join('');
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { closeModal(); setPrompted(); }
    });

    var box = document.createElement('div');
    box.className = 'bedrock-pwa-box';
    box.style.cssText = [
      'background:#fff;border-radius:20px;max-width:370px;width:100%;',
      'padding:26px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);',
      'text-align:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#222;',
      'animation:bedrockPopIn .3s cubic-bezier(.34,1.56,.64,1);'
    ].join('');
    box.addEventListener('click', function (e) { e.stopPropagation(); });

    var icon = document.createElement('img');
    icon.src = '/images/icons/icon-192.png';
    icon.alt = 'Bedrock ICT Campus';
    icon.style.cssText = 'width:76px;height:76px;border-radius:18px;display:block;margin:0 auto 14px;box-shadow:0 6px 18px rgba(13,79,140,.3);object-fit:cover;';
    box.appendChild(icon);

    var title = document.createElement('h2');
    title.textContent = 'Baidoa Bedrock ICT Campus';
    title.style.cssText = 'margin:0 0 6px;font-size:19px;color:#0d4f8c;font-weight:800;';
    box.appendChild(title);

    var sub = document.createElement('p');
    sub.textContent = 'Install our app for quick 1-tap access to Exam Results, Student Attendance, Timetables, and Library — works fast even with slow connection.';
    sub.style.cssText = 'margin:0 0 20px;font-size:13.5px;line-height:1.55;color:#555;';
    box.appendChild(sub);

    var installBtn = document.createElement('button');
    installBtn.textContent = 'Install App';
    installBtn.style.cssText = [
      'width:100%;padding:13px;border:none;border-radius:12px;',
      'background:linear-gradient(135deg,#0d4f8c,#1a73e8);color:#fff;',
      'font-size:15px;font-weight:700;cursor:pointer;',
      'box-shadow:0 6px 20px rgba(13,79,140,.35);transition:transform .15s;'
    ].join('');
    installBtn.addEventListener('click', function () {
      if (launchInstall()) return;
      if (isAndroid()) {
        pendingInstall = true;
        installBtn.disabled = true;
        installBtn.textContent = 'Preparing installation…';
        installWaitTimer = setTimeout(function () {
          pendingInstall = false;
          installBtn.disabled = false;
          installBtn.textContent = 'Install App';
          if (!launchInstall()) showInstructions();
        }, 4000);
      } else {
        showInstructions();
      }
    });
    box.appendChild(installBtn);

    var laterBtn = document.createElement('button');
    laterBtn.textContent = 'Maybe Later';
    laterBtn.style.cssText = [
      'width:100%;padding:10px;margin-top:8px;border:none;background:none;',
      'color:#777;font-size:13.5px;font-weight:600;cursor:pointer;'
    ].join('');
    laterBtn.addEventListener('click', function () { closeModal(); setPrompted(); });
    box.appendChild(laterBtn);

    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  var style = document.createElement('style');
  style.textContent = [
    '@keyframes bedrockFadeIn{from{opacity:0}to{opacity:1}}',
    '@keyframes bedrockPopIn{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}'
  ].join('\n');
  document.head.appendChild(style);

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then(function (reg) {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);
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
    if (pendingInstall) {
      launchInstall();
    } else {
      showModal();
    }
  });

  window.addEventListener('appinstalled', function () {
    console.log('[PWA] Bedrock ICT app installed successfully');
    deferredPrompt = null;
    pendingInstall = false;
    if (installWaitTimer) clearTimeout(installWaitTimer);
    closeModal();
    setPrompted();
  });

  // Prompt automatically after 3 seconds on first visit
  window.setTimeout(showModal, 3000);
})();
