// Service worker: permite instalar o app e abre a tela mesmo com internet ruim.
// Sempre busca a versão mais nova na internet; a cópia guardada só é usada sem conexão.
// Os dados do banco (Firebase) nunca são guardados aqui.

const VERSAO = '2026-11-03-v3';
const PREFIXO = 'postos2b:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIXO + VERSAO;

const ARQUIVOS = [
    './', './index.html', './manifest.webmanifest', './css/estilo.css',
    './js/app.js', './js/config.js', './js/firebase.js', './js/dados.js', './js/util.js', './js/icones.js',
    './js/secoes.js', './js/cards.js', './js/caixa.js', './js/gerente.js', './js/gestor.js',
    './js/emprestimos.js', './js/historico.js', './js/instalar.js',
    './img/logo-2b.png', './img/icone-192.png', './img/favicon-48.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(chaves => Promise.all(chaves.filter(k => k.startsWith(PREFIXO) && k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    e.respondWith(
        fetch(req)
            .then(res => {
                if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
                return res;
            })
            .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
    );
});
