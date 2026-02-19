/* ============================================================
   Passcode Gate
   Client-side access protection using SHA-256 (Web Crypto API).
   Auth state persists for the duration of the browser session
   via sessionStorage so the prompt only appears once per tab.
   ============================================================ */
'use strict';

(function () {
    // SHA-256 digest of the passcode (never stored in plain text).
    var HASH      = 'fee89e23974ad71d79987ae01f05eb7e2ed16de1383b35dc33b799b1b2d050c0';
    var STORE_KEY = 'smb_auth';

    async function sha256(str) {
        var buf  = new TextEncoder().encode(str);
        var hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash))
                    .map(function (b) { return b.toString(16).padStart(2, '0'); })
                    .join('');
    }

    // Already authenticated this session — the inline <head> script has
    // already added .smb-authed to <html>, so the overlay is CSS-hidden.
    // Nothing left to wire up.
    if (sessionStorage.getItem(STORE_KEY) === HASH) return;

    document.addEventListener('DOMContentLoaded', function () {
        var overlay = document.getElementById('passcode-overlay');
        var input   = document.getElementById('passcode-input');
        var form    = document.getElementById('passcode-form');
        var errMsg  = document.getElementById('passcode-error');

        if (!overlay) return;

        input.focus();

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            var hash = await sha256(input.value);

            if (hash === HASH) {
                sessionStorage.setItem(STORE_KEY, HASH);
                overlay.classList.add('unlocking');
                setTimeout(function () { overlay.remove(); }, 420);
            } else {
                errMsg.hidden = false;
                input.value   = '';
                input.focus();
                // Restart shake animation by forcing reflow
                input.classList.remove('shake');
                void input.offsetWidth;
                input.classList.add('shake');
            }
        });
    });
})();
