const base = new URL('.', import.meta.url);

async function gunzip(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${url.pathname}: HTTP ${res.status}`);
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser does not support DecompressionStream.');
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function importSameOriginSource(source) {
  // IMPORTANT: do not use a data: URL here. Firefox gives data: modules an
  // opaque origin, which makes imports of same-site modules such as
  // leveldb-adapter.js fail. A blob: module inherits this page's origin.
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

try {
  let source = await gunzip(new URL('./app-v3.payload.gz?v=0.3.3-firefox', base));
  source = source.replaceAll('__BASE__', base.href);
  await importSameOriginSource(source);
  document.documentElement.dataset.loaderBuild = '0.3.3-firefox';
} catch (error) {
  console.error('Bedrock Web Editor v0.3.3 failed to start', error);
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `v0.3.3 startup failed: ${error.message}`;
    toast.dataset.kind = 'err';
    toast.classList.add('show');
  }
}
