/* Service worker do "Produção vs Pontuação" (versão iPhone / navegador).
   Guarda uma cópia do app (index.html) só pra ele abrir sem internet.
   Regra: SEMPRE tenta a internet primeiro (assim a versão nova aparece sozinha);
   se não houver internet (ou a conexão travar), abre a cópia guardada.
   Não mexe em nada de outros sites (Supabase, Google...) nem em version.json. */

const CACHE = 'pontospro-app-v1';
const ESCOPO = self.registration.scope;               // ex.: https://19bruno94.github.io/pontospro-app/
const PAGINA = new URL('index.html', ESCOPO).href;

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        try {
            const cache = await caches.open(CACHE);
            const resp = await fetch(PAGINA, { cache: 'no-cache' });
            if (resp.ok) await cache.put(PAGINA, resp);
        } catch (err) { /* sem internet agora: instala assim mesmo e guarda na primeira abertura online */ }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;                     // outros sites: direto na internet
    const caminho = url.origin + url.pathname;                          // ignora ?query e #trecho
    if (caminho !== ESCOPO && caminho !== PAGINA) return;               // version.json, sw.js etc.: internet normal
    e.respondWith(paginaInternetPrimeiro(e));
});

function esperar(ms) {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function paginaInternetPrimeiro(e) {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(PAGINA);
    // sempre revalida com o servidor (sem usar a cópia velha do navegador) e atualiza a cópia guardada
    const rede = fetch(PAGINA, { cache: 'no-cache' }).then((resp) => {
        if (resp && resp.ok) cache.put(PAGINA, resp.clone());
        return resp;
    });
    rede.catch(() => {});                                               // evita erro solto se perder a corrida
    e.waitUntil(rede.catch(() => {}));                                  // deixa terminar de guardar mesmo se já respondemos
    try {
        // com cópia guardada, não espera mais que 4 s por uma internet ruim; sem cópia, espera até 25 s
        const resp = await Promise.race([rede, esperar(guardada ? 4000 : 25000)]);
        if (resp && resp.ok) return resp;
        if (guardada) return guardada;
        if (resp) return resp;
    } catch (err) {
        if (guardada) return guardada;
    }
    return new Response('Sem internet e o app ainda não foi guardado neste aparelho. Abra uma vez com internet.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
