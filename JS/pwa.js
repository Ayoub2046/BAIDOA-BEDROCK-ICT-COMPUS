(function () {
  'use strict';

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  var deferredPrompt = null;
  var modal = null;
  var pendingInstall = false;
  var installWaitTimer = null;
  var promptedKey = 'elif-pwa-prompted';

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
    if (storageAvailable()) localStorage.setItem(promptedKey, '1');
  }

  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
  }

  function launchInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
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
        'Tap the Share button in Safari',
        'Scroll down and tap Add to Home Screen',
        'Tap Add to finish installing the app'
      ];
    } else {
      steps = [
        'Open the browser menu (three dots)',
        'Tap Add to Home screen or Install app',
        'Confirm to install the Elif PU app'
      ];
    }

    var box = modal.querySelector('.elif-pwa-box');
    box.innerHTML = '';

    var icon = document.createElement('img');
    icon.src = '/images/icons/icon-192.png';
    icon.alt = 'Elif PU';
    icon.style.cssText = 'width:60px;height:60px;border-radius:14px;display:block;margin:0 auto 14px;';
    box.appendChild(icon);

    var title = document.createElement('h3');
    title.textContent = 'Install Baidoa Bedrock ICT Campus';
    title.style.cssText = 'margin:0 0 16px;font-size:19px;text-align:center;color:#0f510e;font-weight:700;';
    box.appendChild(title);

    var list = document.createElement('ol');
    list.style.cssText = 'margin:0 0 20px;padding-left:20px;font-size:14px;line-height:2;color:#333;text-align:left;';
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
      'background:linear-gradient(135deg,#0f510e,#1b9e1b);color:#fff;',
      'font-size:15px;font-weight:600;cursor:pointer;'
    ].join('');
    doneBtn.addEventListener('click', closeModal);
    box.appendChild(doneBtn);
  }

  function showModal() {
    if (modal || document.getElementById('elif-pwa-modal')) return;
    if (storageAvailable() && localStorage.getItem(promptedKey)) return;

    modal = document.createElement('div');
    modal.id = 'elif-pwa-modal';
    modal.style.cssText = [
      'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);',
      'display:flex;align-items:center;justify-content:center;padding:20px;',
      'animation:elifFadeIn .25s ease;'
    ].join('');
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { closeModal(); setPrompted(); }
    });

    var box = document.createElement('div');
    box.className = 'elif-pwa-box';
    box.style.cssText = [
      'background:#fff;border-radius:18px;max-width:360px;width:100%;',
      'padding:26px;box-shadow:0 16px 50px rgba(0,0,0,.3);',
      'text-align:center;font-family:inherit;color:#222;',
      'animation:elifPopIn .3s ease;'
    ].join('');
    box.addEventListener('click', function (e) { e.stopPropagation(); });

    var icon = document.createElement('img');
    icon.src = '/images/icons/icon-192.png';
    icon.alt = 'Elif PU';
    icon.style.cssText = 'width:72px;height:72px;border-radius:18px;display:block;margin:0 auto 14px;box-shadow:0 4px 14px rgba(15,81,14,.3);';
    box.appendChild(icon);

    var title = document.createElement('h2');
    title.textContent = 'Install the Elif PU App';
    title.style.cssText = 'margin:0 0 8px;font-size:20px;color:#0f510e;font-weight:800;';
    box.appendChild(title);

    var sub = document.createElement('p');
    sub.textContent = 'Get results, attendance, timetable and library access right on your home screen — even offline.';
    sub.style.cssText = 'margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;';
    box.appendChild(sub);

    var installBtn = document.createElement('button');
    installBtn.textContent = 'Install Now';
    installBtn.style.cssText = [
      'width:100%;padding:13px;border:none;border-radius:10px;',
      'background:linear-gradient(135deg,#0f510e,#1b9e1b);color:#fff;',
      'font-size:16px;font-weight:700;cursor:pointer;',
      'box-shadow:0 6px 18px rgba(15,81,14,.35);'
    ].join('');
    installBtn.addEventListener('click', function () {
      if (launchInstall()) return;
      if (isAndroid()) {
        pendingInstall = true;
        installBtn.disabled = true;
        installBtn.textContent = 'Preparing install…';
        installWaitTimer = setTimeout(function () {
          pendingInstall = false;
          installBtn.disabled = false;
          installBtn.textContent = 'Install Now';
          if (!launchInstall()) showInstructions();
        }, 6000);
      } else {
        showInstructions();
      }
    });
    box.appendChild(installBtn);

    var laterBtn = document.createElement('button');
    laterBtn.textContent = 'Not now';
    laterBtn.style.cssText = [
      'width:100%;padding:10px;margin-top:8px;border:none;background:none;',
      'color:#888;font-size:14px;font-weight:600;cursor:pointer;'
    ].join('');
    laterBtn.addEventListener('click', function () { closeModal(); setPrompted(); });
    box.appendChild(laterBtn);

    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  var style = document.createElement('style');
  style.textContent = [
    '@keyframes elifFadeIn{from{opacity:0}to{opacity:1}}',
    '@keyframes elifPopIn{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}'
  ].join('\n');
  document.head.appendChild(style);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(function () {});
  }

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
    deferredPrompt = null;
    pendingInstall = false;
    if (installWaitTimer) clearTimeout(installWaitTimer);
    closeModal();
    setPrompted();
  });

  window.setTimeout(showModal, 2500);
})();
