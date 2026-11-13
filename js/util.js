// Funções de apoio usadas em várias telas
import { icone } from "./icones.js";

export const $ = (id) => document.getElementById(id);

// Evita que textos vindos do banco virem código na página
export function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const num = (v) => Number(v).toLocaleString('pt-BR');
export const temValor = (v) => v !== "" && v !== undefined && v !== null;

export const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hojeISO = () => isoDe(new Date());
export function somarDias(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    return isoDe(new Date(a, m - 1, d + n));
}
export function diaDaSemana(iso, curto = true) {
    const [a, m, d] = iso.split('-').map(Number);
    const t = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: curto ? 'short' : 'long' }).replace('.', '');
    return t.charAt(0).toUpperCase() + t.slice(1);
}

export const agoraFormatado = () =>
    `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

export const dataBR = (iso) => String(iso || '').split('-').reverse().join('/');

export function limitesDoDia(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return [new Date(a, m - 1, d, 0, 0, 0).getTime(), new Date(a, m - 1, d, 23, 59, 59, 999).getTime()];
}

export function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function dataPorExtenso() {
    const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
}

const semMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Número que "sobe" até o valor final
export function contarAte(el, valor, sufixo = '') {
    if (!el) return;
    if (semMovimento() || !valor) { el.textContent = num(valor) + sufixo; return; }
    const inicio = performance.now(), duracao = 900;
    const passo = (t) => {
        const p = Math.min(1, (t - inicio) / duracao);
        const suave = 1 - Math.pow(1 - p, 3);
        el.textContent = num(Math.round(valor * suave)) + sufixo;
        if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
}

// ---------- Avisos na tela ----------
export function aviso(texto, tipo = 'ok') {
    let caixa = $('avisos');
    if (!caixa) { caixa = document.createElement('div'); caixa.id = 'avisos'; document.body.appendChild(caixa); }
    const el = document.createElement('div');
    el.className = `aviso aviso-${tipo}`;
    el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    el.innerHTML = `${icone(tipo === 'erro' ? 'alerta' : 'check')}<span></span>`;
    el.querySelector('span').textContent = texto;
    caixa.appendChild(el);
    setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 350); }, tipo === 'erro' ? 7000 : 4000);
}

// Botão em espera enquanto salva (evita salvar duas vezes)
export async function comEspera(botao, tarefa) {
    if (!botao) return tarefa();
    botao.disabled = true; botao.classList.add('esperando');
    try { return await tarefa(); }
    finally { botao.disabled = false; botao.classList.remove('esperando'); }
}

function janela(html, aoClicar) {
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo janela-dinamica';
    fundo.innerHTML = `<div class="janela janela-pequena" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.classList.add('fechando'); setTimeout(() => fundo.remove(), 200); };
    fundo.addEventListener('click', (e) => aoClicar(e, fechar, fundo));
    return fundo;
}

// Janela para digitar um número
export function pedirNumero(titulo, mensagem) {
    return new Promise((resolve) => {
        const fundo = janela(`
            <h3>${esc(titulo)}</h3>
            <p class="texto-suave">${esc(mensagem)}</p>
            <input type="number" inputmode="decimal" step="any" min="0" class="campo" placeholder="Litros">
            <div class="acoes">
                <button type="button" class="botao botao-claro" data-r="cancelar">Cancelar</button>
                <button type="button" class="botao botao-primario" data-r="ok">Confirmar</button>
            </div>`, (e, fechar) => {
                if (e.target === e.currentTarget || e.target.closest('[data-r="cancelar"]')) { fechar(); resolve(null); }
                if (e.target.closest('[data-r="ok"]')) { fechar(); resolve(input.value); }
            });
        const input = fundo.querySelector('input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { fundo.remove(); resolve(input.value); }
            if (e.key === 'Escape') { fundo.remove(); resolve(null); }
        });
        setTimeout(() => input.focus(), 60);
    });
}

// Janela para digitar um texto (ex.: motivo)
export function pedirTexto(titulo, mensagem, placeholder = '', textoOk = 'Anular') {
    return new Promise((resolve) => {
        const fundo = janela(`
            <h3>${esc(titulo)}</h3>
            <p class="texto-suave">${esc(mensagem)}</p>
            <input type="text" class="campo" maxlength="300" placeholder="${esc(placeholder)}">
            <div class="acoes">
                <button type="button" class="botao botao-claro" data-r="cancelar">Cancelar</button>
                <button type="button" class="botao ${textoOk === 'Anular' ? 'botao-perigo' : 'botao-sucesso'}" data-r="ok">${esc(textoOk)}</button>
            </div>`, (e, fechar) => {
                if (e.target === e.currentTarget || e.target.closest('[data-r="cancelar"]')) { fechar(); resolve(null); }
                if (e.target.closest('[data-r="ok"]')) { fechar(); resolve(input.value.trim()); }
            });
        const input = fundo.querySelector('input');
        setTimeout(() => input.focus(), 60);
    });
}

// Janela de confirmação
export function confirmar(titulo, mensagem, textoOk = 'Confirmar', perigo = false) {
    return new Promise((resolve) => {
        janela(`
            <h3>${esc(titulo)}</h3>
            <p class="texto-suave">${esc(mensagem)}</p>
            <div class="acoes">
                <button type="button" class="botao botao-claro" data-r="nao">Voltar</button>
                <button type="button" class="botao ${perigo ? 'botao-perigo' : 'botao-sucesso'}" data-r="sim">${esc(textoOk)}</button>
            </div>`, (e, fechar) => {
                if (e.target === e.currentTarget || e.target.closest('[data-r="nao"]')) { fechar(); resolve(false); }
                if (e.target.closest('[data-r="sim"]')) { fechar(); resolve(true); }
            });
    });
}

// Janela só com informação (ex.: como instalar no iPhone)
export function informar(titulo, html) {
    janela(`
        <h3>${esc(titulo)}</h3>
        <div class="texto-informacao">${html}</div>
        <div class="acoes"><button type="button" class="botao botao-primario" data-r="ok">Entendi</button></div>`,
        (e, fechar) => { if (e.target === e.currentTarget || e.target.closest('[data-r="ok"]')) fechar(); });
}
