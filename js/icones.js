// Ícones simples (desenhados em linha) usados nas telas
const caminhos = {
    seta: '<path d="m6 9 6 6 6-6"/>',
    bomba: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M15 11h2a2 2 0 0 1 2 2v3.5a1.5 1.5 0 0 0 3 0V9l-3-3"/><path d="M7.5 7h5"/>',
    loja: '<path d="M3 9.5 4.6 4h14.8L21 9.5"/><path d="M4 9.5V20h16V9.5"/><path d="M3 9.5h18"/><path d="M10 20v-5h4v5"/>',
    grafico: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-8"/><path d="M22 20H2"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    tanque: '<path d="M4 19a8.5 8.5 0 1 1 16 0"/><path d="m12 14 4-4.5"/><circle cx="12" cy="14.5" r="1.2"/>',
    raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    troca: '<path d="M7 7h12l-3.5-3.5"/><path d="M17 17H5l3.5 3.5"/>',
    baixar: '<path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 21h14"/>',
    sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    mensagem: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.6-4.2A8.5 8.5 0 1 1 20.5 11.5z"/>',
    atualizar: '<path d="M20 11a8 8 0 0 0-14.6-4.5"/><path d="M4 13a8 8 0 0 0 14.6 4.5"/><path d="M4 3.5V8h4.5"/><path d="M20 20.5V16h-4.5"/>',
    flecha: '<path d="M4 12h15"/><path d="m14 6 6 6-6 6"/>',
    alerta: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17.2v.3"/>',
    compartilhar: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    lapis: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'
};

export function icone(nome, classe = '') {
    return `<svg class="icone ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos[nome] || ''}</svg>`;
}

// Troca cada <i data-icone="nome"> pelo desenho correspondente
export function aplicarIcones(raiz = document) {
    raiz.querySelectorAll('i[data-icone]').forEach(el => {
        const tmp = document.createElement('span');
        tmp.innerHTML = icone(el.dataset.icone, el.className);
        el.replaceWith(tmp.firstChild);
    });
}
