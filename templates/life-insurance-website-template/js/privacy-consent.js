/* Basic consent: no Google script, request or cookieless ping before opt-in. */
(function () {
  'use strict';
  if (window.EnergeliaPrivacy) return;
  var config = document.getElementById('privacy-config');
  if (!config) return;
  var key = 'energelia_privacy_v2', version = config.dataset.version;
  var enabled = config.dataset.analytics === '1', gaId = config.dataset.gaId;
  var banner = document.getElementById('cookieConsentBanner');
  var dialog = document.getElementById('cookiePreferences');
  var checkbox = document.getElementById('cookieAnalytics');
  var loaded = false, previousFocus, memoryChoice = null;
  function read() {
    var item = memoryChoice;
    if (!item) {
      try { item = JSON.parse(localStorage.getItem(key)); } catch (_) {}
    }
    if (item && item.version === version && typeof item.analytics === 'boolean' &&
        Number.isFinite(item.savedAt) && Number.isFinite(item.expiresAt) &&
        item.savedAt <= Date.now() && item.expiresAt > Date.now() && item.expiresAt > item.savedAt) return item;
    return null;
  }
  function clearTrackingCookies() {
    var domains = [location.hostname, ''];
    var parts = location.hostname.split('.');
    while (parts.length > 1) { domains.push('.' + parts.join('.')); parts.shift(); }
    document.cookie.split(';').forEach(function (part) {
      var name = part.trim().split('=')[0];
      if (!/^(_ga($|_)|_gid$|_gat|_gcl_|_gac_)/.test(name)) return;
      domains.forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : '') + (location.protocol === 'https:' ? '; Secure' : '');
      });
    });
  }
  function startAnalytics() {
    if (!enabled || loaded || !/^G-[A-Z0-9]+$/.test(gaId)) return;
    loaded = true;
    window['ga-disable-' + gaId] = false;
    window.dataLayer = [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {analytics_storage:'granted', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
    window.gtag('js', new Date());
    window.gtag('config', gaId, {
      cookie_expires:15552000, cookie_update:false,
      allow_google_signals:false, allow_ad_personalization_signals:false,
      page_location:location.origin + location.pathname,
      page_referrer:document.referrer ? document.referrer.split(/[?#]/)[0] : ''
    });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
    document.head.appendChild(script);
  }
  function close() {
    if (dialog.open) dialog.close();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function save(analytics) {
    var expiry = new Date(); expiry.setMonth(expiry.getMonth() + 6);
    var item = {version:version, savedAt:Date.now(), expiresAt:expiry.getTime(), analytics:enabled && analytics};
    try { localStorage.setItem(key, JSON.stringify(item)); memoryChoice = null; } catch (_) { memoryChoice = item; }
    try { localStorage.removeItem('energelia_cookie_consent'); } catch (_) {}
    if (banner) banner.hidden = true; close();
    if (!item.analytics) {
      window['ga-disable-' + gaId] = true;
      // Stop event handlers immediately, then unload an already running library.
      window.gtag = function () {};
      clearTrackingCookies();
      if (loaded) location.reload();
    } else startAnalytics();
  }
  function preferences() {
    previousFocus = document.activeElement;
    var item = read();
    if (checkbox) checkbox.checked = enabled && !!(item && item.analytics);
    if (!dialog.open) dialog.showModal();
  }
  document.querySelectorAll('[data-cookie-preferences]').forEach(function (button) { button.addEventListener('click', preferences); });
  document.querySelectorAll('[data-cookie-reject]').forEach(function (button) { button.addEventListener('click', function () { save(false); }); });
  document.querySelectorAll('[data-cookie-accept]').forEach(function (button) { button.addEventListener('click', function () { save(true); }); });
  var saveButton = document.getElementById('cookieSaveBtn');
  if (saveButton) saveButton.addEventListener('click', function () { save(!!(checkbox && checkbox.checked)); });
  function resetPreviousChoices() {
    memoryChoice = null;
    try { localStorage.removeItem(key); localStorage.removeItem('energelia_cookie_consent'); } catch (_) {}
    clearTrackingCookies();
    close();
    if (loaded) { window['ga-disable-' + gaId] = true; window.gtag = function () {}; location.reload(); }
  }
  var resetButton = document.getElementById('cookieResetBtn');
  if (resetButton) resetButton.addEventListener('click', resetPreviousChoices);
  document.getElementById('cookieCloseBtn').addEventListener('click', close);
  dialog.addEventListener('close', function () { if (previousFocus && previousFocus.isConnected) previousFocus.focus(); });
  function sync() {
    var item = read();
    if (!item || !item.analytics || !enabled) {
      window['ga-disable-' + gaId] = true;
      clearTrackingCookies();
      if (loaded) { window.gtag = function () {}; location.reload(); return; }
    }
    if (banner) banner.hidden = !enabled || !!item;
    if (item && item.analytics) startAnalytics();
  }
  window.addEventListener('storage', function (event) { if (event.key === key || event.key === null) { memoryChoice = null; sync(); } });
  window.addEventListener('pageshow', sync);
  setInterval(sync, 60000);
  window.EnergeliaPrivacy = {open:preferences, revoke:function () { if (enabled) save(false); else resetPreviousChoices(); }};
  sync();
})();
