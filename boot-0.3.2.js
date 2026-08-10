const BUILD = '0.3.2-alpha';
document.documentElement.dataset.appBuild = BUILD;
window.__BEDROCK_WEB_EDITOR_BOOT__ = BUILD;

async function purgeOldEditorCaches() {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('bedrock-web-editor-'))
      .map(key => caches.delete(key)));
  } catch (error) {
    console.warn('Could not clear old Bedrock Web Editor caches', error);
  }
}

async function unregisterOldWorkers() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs
      .filter(reg => reg.scope === new URL('./', location.href).href)
      .map(reg => reg.unregister()));
  } catch (error) {
    console.warn('Could not unregister old Bedrock Web Editor workers', error);
  }
}

function showFatal(error) {
  console.error('Bedrock Web Editor v0.3.2 bootstrap failure', error);
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `v0.3.2 bootstrap failed: ${error?.message || error}`;
    toast.dataset.kind = 'err';
    toast.classList.add('show');
  }
}

try {
  await purgeOldEditorCaches();
  await unregisterOldWorkers();

  // Unique query guarantees an older cache-first service worker cannot return
  // the stale v0.3 bootstrap that caused the Firefox startup crash.
  await import('./app.js?controller=0.3.2-r2');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const reg = await navigator.serviceWorker.register('./service-worker-0.3.2.js', {
      updateViaCache: 'none'
    });
    try { await reg.update(); } catch (_) {}
  }
} catch (error) {
  showFatal(error);
}
