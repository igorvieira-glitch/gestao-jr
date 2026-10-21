/* Gestão JR · service worker
   Guarda só a tela de abertura do app (deste site). O sistema em si (Apps Script)
   nunca passa por aqui: abre sempre direto do Google, igual ao navegador. */
const VERSAO = 'gestao-jr-v1';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-192.png', './icons/maskable-512.png', './icons/favicon.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Google, Ahgora etc.: nunca interceptados
  if (url.pathname.endsWith('.user.js')) return;              // monitor: sempre a versão mais nova
  if (req.mode === 'navigate') {
    /* rede primeiro (pega atualizações); sem internet, abre a cópia guardada */
    e.respondWith(fetch(req).then((r) => {
      const copia = r.clone(); caches.open(VERSAO).then((c) => c.put('./index.html', copia)).catch(() => {});
      return r;
    }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
