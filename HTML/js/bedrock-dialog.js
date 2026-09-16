/**
 * Baidoa Bedrock ICT Campus - Modern Bedrock Dialog & Popout System
 * Universal replacement for native browser confirm() and alert() dialogs.
 * 
 * Usage:
 *   await BedrockDialog.confirm({
 *     title: 'Remove Student',
 *     message: 'Are you sure you want to remove <strong>"Adan"</strong>?',
 *     confirmText: 'Remove Student',
 *     cancelText: 'Cancel',
 *     type: 'danger', // 'danger' | 'warning' | 'info' | 'success'
 *     icon: 'fa-user-minus'
 *   });
 * 
 *   await BedrockDialog.alert({
 *     title: 'Success',
 *     message: 'Student assigned successfully!',
 *     type: 'success'
 *   });
 */

(function () {
  'use strict';

  // Inject styles if not present
  function ensureStyles() {
    if (document.getElementById('bedrock-dialog-styles')) return;
    var style = document.createElement('style');
    style.id = 'bedrock-dialog-styles';
    style.textContent = `
      .bd-dialog-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.25rem;
        background: rgba(10, 25, 47, 0.65);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.22s;
      }
      .bd-dialog-overlay.bd-show {
        opacity: 1;
        visibility: visible;
      }
      .bd-dialog-card {
        position: relative;
        width: 100%;
        max-width: 440px;
        background: #ffffff;
        border-radius: 22px;
        padding: 28px 24px 24px 24px;
        box-shadow: 0 24px 60px -12px rgba(13, 79, 140, 0.25), 0 0 0 1px rgba(13, 79, 140, 0.08);
        text-align: center;
        transform: scale(0.92) translateY(12px);
        opacity: 0;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-out;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-sizing: border-box;
      }
      .bd-dialog-overlay.bd-show .bd-dialog-card {
        transform: scale(1) translateY(0);
        opacity: 1;
      }
      .bd-dialog-overlay.bd-closing .bd-dialog-card {
        transform: scale(0.94) translateY(8px);
        opacity: 0;
        transition: transform 0.16s ease-in, opacity 0.15s ease-in;
      }

      /* Dark mode */
      [data-theme="dark"] .bd-dialog-card,
      body.dark-mode .bd-dialog-card {
        background: #0f1d33;
        color: #f1f5f9;
        box-shadow: 0 25px 65px -10px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.1);
      }

      /* Icon Badge */
      .bd-dialog-icon-wrap {
        width: 68px;
        height: 68px;
        margin: 0 auto 18px auto;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.85rem;
        position: relative;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .bd-dialog-overlay.bd-show .bd-dialog-icon-wrap {
        transform: scale(1);
        animation: bdIconPulse 0.6s ease-out;
      }
      @keyframes bdIconPulse {
        0% { transform: scale(0.6); opacity: 0; }
        60% { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); }
      }

      /* Icon Type Styles */
      .bd-type-danger .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
        color: #dc2626;
        box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.12);
      }
      [data-theme="dark"] .bd-type-danger .bd-dialog-icon-wrap,
      body.dark-mode .bd-type-danger .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, rgba(220, 38, 38, 0.28) 0%, rgba(185, 28, 28, 0.38) 100%);
        color: #f87171;
        box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.15);
      }

      .bd-type-warning .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        color: #d97706;
        box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.12);
      }
      [data-theme="dark"] .bd-type-warning .bd-dialog-icon-wrap,
      body.dark-mode .bd-type-warning .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, rgba(217, 119, 6, 0.28) 0%, rgba(180, 83, 9, 0.38) 100%);
        color: #fbbf24;
        box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.15);
      }

      .bd-type-success .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
        color: #10b981;
        box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.12);
      }
      [data-theme="dark"] .bd-type-success .bd-dialog-icon-wrap,
      body.dark-mode .bd-type-success .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.28) 0%, rgba(5, 150, 105, 0.38) 100%);
        color: #34d399;
        box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.15);
      }

      .bd-type-info .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
        color: #0284c7;
        box-shadow: 0 0 0 8px rgba(2, 132, 199, 0.12);
      }
      [data-theme="dark"] .bd-type-info .bd-dialog-icon-wrap,
      body.dark-mode .bd-type-info .bd-dialog-icon-wrap {
        background: linear-gradient(135deg, rgba(13, 79, 140, 0.32) 0%, rgba(2, 132, 199, 0.38) 100%);
        color: #38bdf8;
        box-shadow: 0 0 0 8px rgba(13, 79, 140, 0.2);
      }

      /* Typography */
      .bd-dialog-title {
        font-size: 1.3rem;
        font-weight: 700;
        color: #0d284e;
        margin: 0 0 10px 0;
        line-height: 1.3;
      }
      [data-theme="dark"] .bd-dialog-title,
      body.dark-mode .bd-dialog-title {
        color: #f8fafc;
      }

      .bd-dialog-message {
        font-size: 0.95rem;
        color: #475569;
        line-height: 1.55;
        margin: 0 0 22px 0;
        word-break: break-word;
      }
      [data-theme="dark"] .bd-dialog-message,
      body.dark-mode .bd-dialog-message {
        color: #94a3b8;
      }
      .bd-dialog-message strong {
        color: #0d4f8c;
      }
      [data-theme="dark"] .bd-dialog-message strong,
      body.dark-mode .bd-dialog-message strong {
        color: #60a5fa;
      }

      /* Prompt Input */
      .bd-dialog-input {
        width: 100%;
        padding: 11px 16px;
        font-size: 0.95rem;
        border-radius: 12px;
        border: 1.5px solid #cbd5e1;
        outline: none;
        margin-bottom: 20px;
        box-sizing: border-box;
        transition: border-color 0.2s, box-shadow 0.2s;
        background: #f8fafc;
        color: #1e293b;
      }
      .bd-dialog-input:focus {
        border-color: #0d4f8c;
        box-shadow: 0 0 0 3px rgba(13, 79, 140, 0.15);
        background: #ffffff;
      }
      [data-theme="dark"] .bd-dialog-input,
      body.dark-mode .bd-dialog-input {
        background: #1e293b;
        color: #f8fafc;
        border-color: #334155;
      }
      [data-theme="dark"] .bd-dialog-input:focus,
      body.dark-mode .bd-dialog-input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
      }

      /* Actions Layout */
      .bd-dialog-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-top: 4px;
      }

      /* Buttons */
      .bd-dialog-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 11px 22px;
        font-size: 0.95rem;
        font-weight: 600;
        border-radius: 9999px;
        border: none;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        text-decoration: none;
        outline: none;
        flex: 1;
        min-height: 44px;
        box-sizing: border-box;
      }
      .bd-dialog-btn:hover {
        transform: translateY(-1.5px);
      }
      .bd-dialog-btn:active {
        transform: translateY(0);
      }

      /* Cancel Button */
      .bd-dialog-btn-cancel {
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      .bd-dialog-btn-cancel:hover {
        background: #e2e8f0;
        color: #1e293b;
      }
      [data-theme="dark"] .bd-dialog-btn-cancel,
      body.dark-mode .bd-dialog-btn-cancel {
        background: #1e293b;
        color: #94a3b8;
        border-color: #334155;
      }
      [data-theme="dark"] .bd-dialog-btn-cancel:hover,
      body.dark-mode .bd-dialog-btn-cancel:hover {
        background: #334155;
        color: #f8fafc;
      }

      /* Primary Confirm Buttons */
      .bd-type-danger .bd-dialog-btn-confirm {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(220, 38, 38, 0.35);
      }
      .bd-type-danger .bd-dialog-btn-confirm:hover {
        box-shadow: 0 6px 18px rgba(220, 38, 38, 0.45);
      }

      .bd-type-warning .bd-dialog-btn-confirm {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(217, 119, 6, 0.35);
      }
      .bd-type-warning .bd-dialog-btn-confirm:hover {
        box-shadow: 0 6px 18px rgba(217, 119, 6, 0.45);
      }

      .bd-type-success .bd-dialog-btn-confirm {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
      }
      .bd-type-success .bd-dialog-btn-confirm:hover {
        box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45);
      }

      .bd-type-info .bd-dialog-btn-confirm {
        background: linear-gradient(135deg, #0d4f8c 0%, #1976d2 100%);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(13, 79, 140, 0.35);
      }
      .bd-type-info .bd-dialog-btn-confirm:hover {
        box-shadow: 0 6px 18px rgba(13, 79, 140, 0.45);
      }

      /* Single action (alert) */
      .bd-dialog-actions.bd-single-btn .bd-dialog-btn-confirm {
        flex: 0 1 200px;
      }

      @media (max-width: 480px) {
        .bd-dialog-card {
          padding: 24px 18px 20px 18px;
          max-width: 92vw;
        }
        .bd-dialog-title {
          font-size: 1.15rem;
        }
        .bd-dialog-message {
          font-size: 0.9rem;
        }
        .bd-dialog-actions {
          flex-direction: column-reverse;
          gap: 8px;
        }
        .bd-dialog-btn {
          width: 100%;
          flex: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Smart defaults inferred from text
  function inferIntent(msg) {
    var lower = String(msg || '').toLowerCase();
    if (lower.includes('delete') || lower.includes('remove') || lower.includes('revoke') || lower.includes('destroy') || lower.includes('bin') || lower.includes('reject')) {
      return {
        type: 'danger',
        icon: lower.includes('remove') ? 'fas fa-user-minus' : 'fas fa-trash-alt',
        confirmText: lower.includes('remove') ? 'Remove' : 'Delete',
        title: 'Confirm Action'
      };
    }
    if (lower.includes('unlock') || lower.includes('restore') || lower.includes('reset') || lower.includes('lock') || lower.includes('hold')) {
      return {
        type: 'warning',
        icon: 'fas fa-exclamation-triangle',
        confirmText: 'Proceed',
        title: 'Warning'
      };
    }
    if (lower.includes('approve') || lower.includes('release') || lower.includes('success') || lower.includes('activate') || lower.includes('reinstate')) {
      return {
        type: 'success',
        icon: 'fas fa-check-circle',
        confirmText: 'Approve',
        title: 'Confirm'
      };
    }
    return {
      type: 'info',
      icon: 'fas fa-question-circle',
      confirmText: 'Confirm',
      title: 'Please Confirm'
    };
  }

  // Active modal reference
  var currentOverlay = null;

  function closeDialog(overlay, callback, result) {
    if (!overlay) return;
    overlay.classList.add('bd-closing');
    overlay.classList.remove('bd-show');
    setTimeout(function () {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (currentOverlay === overlay) {
        currentOverlay = null;
      }
      if (typeof callback === 'function') {
        callback(result);
      }
    }, 200);
  }

  var BedrockDialog = {
    /**
     * Show a custom confirmation modal.
     * @param {Object|string} options
     * @returns {Promise<boolean>}
     */
    confirm: function (options) {
      ensureStyles();
      return new Promise(function (resolve) {
        var opt = typeof options === 'string' ? { message: options } : (options || {});
        var inferred = inferIntent(opt.message);

        var type = opt.type || inferred.type;
        var title = opt.title || inferred.title;
        var message = opt.message || '';
        var confirmText = opt.confirmText || inferred.confirmText;
        var cancelText = opt.cancelText || 'Cancel';
        var icon = opt.icon || inferred.icon;

        // Clean any existing open dialog
        if (currentOverlay) {
          closeDialog(currentOverlay);
        }

        var overlay = document.createElement('div');
        overlay.className = 'bd-dialog-overlay bd-type-' + type;
        currentOverlay = overlay;

        var card = document.createElement('div');
        card.className = 'bd-dialog-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        card.innerHTML = `
          <div class="bd-dialog-icon-wrap">
            <i class="${icon}"></i>
          </div>
          <h3 class="bd-dialog-title">${title}</h3>
          <div class="bd-dialog-message">${message}</div>
          <div class="bd-dialog-actions">
            <button type="button" class="bd-dialog-btn bd-dialog-btn-cancel" id="bd-btn-cancel">
              ${cancelText}
            </button>
            <button type="button" class="bd-dialog-btn bd-dialog-btn-confirm" id="bd-btn-confirm">
              ${confirmText}
            </button>
          </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // Force reflow for CSS animation
        void overlay.offsetWidth;
        overlay.classList.add('bd-show');

        var btnConfirm = card.querySelector('#bd-btn-confirm');
        var btnCancel = card.querySelector('#bd-btn-cancel');

        // Focus confirm or cancel
        if (type === 'danger') {
          btnCancel.focus();
        } else {
          btnConfirm.focus();
        }

        btnConfirm.addEventListener('click', function () {
          closeDialog(overlay, resolve, true);
        });

        btnCancel.addEventListener('click', function () {
          closeDialog(overlay, resolve, false);
        });

        // Click outside to cancel
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) {
            closeDialog(overlay, resolve, false);
          }
        });

        // Keyboard handler
        function onKeyDown(e) {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKeyDown);
            closeDialog(overlay, resolve, false);
          } else if (e.key === 'Enter' && document.activeElement !== btnCancel) {
            document.removeEventListener('keydown', onKeyDown);
            closeDialog(overlay, resolve, true);
          }
        }
        document.addEventListener('keydown', onKeyDown);
      });
    },

    /**
     * Show a custom alert modal.
     * @param {Object|string} options
     * @returns {Promise<void>}
     */
    alert: function (options) {
      ensureStyles();
      return new Promise(function (resolve) {
        var opt = typeof options === 'string' ? { message: options } : (options || {});
        var isErr = String(opt.message || '').toLowerCase().includes('error') ||
                    String(opt.message || '').toLowerCase().includes('failed');
        var isSuccess = String(opt.message || '').toLowerCase().includes('success') ||
                        String(opt.message || '').toLowerCase().includes('saved') ||
                        String(opt.message || '').toLowerCase().includes('approved');

        var type = opt.type || (isErr ? 'danger' : (isSuccess ? 'success' : 'info'));
        var defaultTitle = isErr ? 'Notice' : (isSuccess ? 'Success' : 'Information');
        var title = opt.title || defaultTitle;
        var message = opt.message || '';
        var confirmText = opt.confirmText || 'OK';
        var defaultIcon = type === 'danger' ? 'fas fa-exclamation-circle' :
                          type === 'success' ? 'fas fa-check-circle' :
                          type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle';
        var icon = opt.icon || defaultIcon;

        if (currentOverlay) {
          closeDialog(currentOverlay);
        }

        var overlay = document.createElement('div');
        overlay.className = 'bd-dialog-overlay bd-type-' + type;
        currentOverlay = overlay;

        var card = document.createElement('div');
        card.className = 'bd-dialog-card';
        card.setAttribute('role', 'alertdialog');
        card.setAttribute('aria-modal', 'true');

        card.innerHTML = `
          <div class="bd-dialog-icon-wrap">
            <i class="${icon}"></i>
          </div>
          <h3 class="bd-dialog-title">${title}</h3>
          <div class="bd-dialog-message">${message}</div>
          <div class="bd-dialog-actions bd-single-btn">
            <button type="button" class="bd-dialog-btn bd-dialog-btn-confirm" id="bd-btn-alert-ok">
              ${confirmText}
            </button>
          </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        void overlay.offsetWidth;
        overlay.classList.add('bd-show');

        var btnOk = card.querySelector('#bd-btn-alert-ok');
        btnOk.focus();

        btnOk.addEventListener('click', function () {
          closeDialog(overlay, resolve);
        });

        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) {
            closeDialog(overlay, resolve);
          }
        });

        function onKeyDown(e) {
          if (e.key === 'Escape' || e.key === 'Enter') {
            document.removeEventListener('keydown', onKeyDown);
            closeDialog(overlay, resolve);
          }
        }
        document.addEventListener('keydown', onKeyDown);
      });
    },

    /**
     * Show a custom prompt modal.
     * @param {Object|string} options
     * @returns {Promise<string|null>}
     */
    prompt: function (options) {
      ensureStyles();
      return new Promise(function (resolve) {
        var opt = typeof options === 'string' ? { message: options } : (options || {});
        var title = opt.title || 'Input Required';
        var message = opt.message || '';
        var placeholder = opt.placeholder || '';
        var defaultValue = opt.defaultValue || '';
        var confirmText = opt.confirmText || 'Submit';
        var cancelText = opt.cancelText || 'Cancel';
        var icon = opt.icon || 'fas fa-pen';

        if (currentOverlay) {
          closeDialog(currentOverlay);
        }

        var overlay = document.createElement('div');
        overlay.className = 'bd-dialog-overlay bd-type-info';
        currentOverlay = overlay;

        var card = document.createElement('div');
        card.className = 'bd-dialog-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        card.innerHTML = `
          <div class="bd-dialog-icon-wrap">
            <i class="${icon}"></i>
          </div>
          <h3 class="bd-dialog-title">${title}</h3>
          ${message ? `<div class="bd-dialog-message">${message}</div>` : ''}
          <input type="text" class="bd-dialog-input" id="bd-prompt-val" placeholder="${placeholder}" value="${defaultValue}">
          <div class="bd-dialog-actions">
            <button type="button" class="bd-dialog-btn bd-dialog-btn-cancel" id="bd-btn-prompt-cancel">
              ${cancelText}
            </button>
            <button type="button" class="bd-dialog-btn bd-dialog-btn-confirm" id="bd-btn-prompt-ok">
              ${confirmText}
            </button>
          </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        void overlay.offsetWidth;
        overlay.classList.add('bd-show');

        var input = card.querySelector('#bd-prompt-val');
        var btnOk = card.querySelector('#bd-btn-prompt-ok');
        var btnCancel = card.querySelector('#bd-btn-prompt-cancel');

        input.focus();
        input.select();

        btnOk.addEventListener('click', function () {
          closeDialog(overlay, resolve, input.value);
        });

        btnCancel.addEventListener('click', function () {
          closeDialog(overlay, resolve, null);
        });

        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) {
            closeDialog(overlay, resolve, null);
          }
        });

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            closeDialog(overlay, resolve, input.value);
          }
        });

        function onKeyDown(e) {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKeyDown);
            closeDialog(overlay, resolve, null);
          }
        }
        document.addEventListener('keydown', onKeyDown);
      });
    }
  };

  // Expose globally
  window.BedrockDialog = BedrockDialog;
  window.bedrockConfirm = BedrockDialog.confirm;
  window.bedrockAlert = BedrockDialog.alert;
  window.bedrockPrompt = BedrockDialog.prompt;

  // Intercept default window.alert to automatically use BedrockDialog.alert
  try {
    window.alert = function (msg) {
      BedrockDialog.alert(msg);
    };
  } catch (e) {}

})();
