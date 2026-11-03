// Seções que abrem e fecham (o sistema lembra como cada pessoa deixou)

const chave = (id) => `postos2b:secao:${id}`;

function lerEstado(id, padrao) {
    try { const v = localStorage.getItem(chave(id)); if (v !== null) return v === '1'; } catch (e) { /* sem armazenamento */ }
    return padrao;
}
function salvarEstado(id, aberta) {
    try { localStorage.setItem(chave(id), aberta ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
}

// Para cards desenhados depois (ex.: encerrantes de cada posto)
export const estaAberta = (id, padrao = false) => lerEstado(id, padrao);

function aplicar(secao, aberta) {
    secao.classList.toggle('aberta', aberta);
    const cabeca = secao.querySelector(':scope > .secao-cabeca, :scope > .sub-cabeca');
    if (cabeca) cabeca.setAttribute('aria-expanded', aberta ? 'true' : 'false');
}

export function abrirSecao(id) {
    const secao = document.querySelector(`[data-secao="${id}"]`);
    if (secao) { aplicar(secao, true); salvarEstado(id, true); }
}

export function iniciarSecoes() {
    document.querySelectorAll('[data-secao]').forEach(secao => {
        aplicar(secao, lerEstado(secao.dataset.secao, secao.dataset.padrao !== 'fechada'));
    });
    // Um único "ouvinte" serve para as seções fixas e para as desenhadas depois
    document.addEventListener('click', (e) => {
        const cabeca = e.target.closest('.secao-cabeca, .sub-cabeca');
        if (!cabeca) return;
        const secao = cabeca.parentElement;
        if (!secao?.dataset.secao) return;
        const aberta = !secao.classList.contains('aberta');
        aplicar(secao, aberta);
        salvarEstado(secao.dataset.secao, aberta);
    });
}
