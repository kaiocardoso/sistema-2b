// Funções de apoio usadas em várias telas

export const $ = (id) => document.getElementById(id);

// Evita que textos vindos do banco virem código na página
export function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const num = (v) => Number(v).toLocaleString('pt-BR');
export const temValor = (v) => v !== "" && v !== undefined && v !== null;

export function hojeISO() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

export const agoraFormatado = () =>
    `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

export const dataBR = (iso) => String(iso || '').split('-').reverse().join('/');

// Início e fim de um dia (em milissegundos), para buscar no histórico
export function limitesDoDia(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return [new Date(a, m - 1, d, 0, 0, 0).getTime(), new Date(a, m - 1, d, 23, 59, 59, 999).getTime()];
}

// ---------- Avisos na tela (substituem os alertas) ----------
export function aviso(texto, tipo = 'ok') {
    let caixa = $('avisos');
    if (!caixa) { caixa = document.createElement('div'); caixa.id = 'avisos'; document.body.appendChild(caixa); }
    const el = document.createElement('div');
    el.className = `aviso aviso-${tipo}`;
    el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    el.textContent = texto;
    caixa.appendChild(el);
    setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 300); }, tipo === 'erro' ? 7000 : 4000);
}

// Botão em espera enquanto salva (evita salvar duas vezes)
export async function comEspera(botao, tarefa) {
    if (!botao) return tarefa();
    const texto = botao.innerHTML;
    botao.disabled = true; botao.classList.add('esperando');
    try { return await tarefa(); }
    finally { botao.disabled = false; botao.classList.remove('esperando'); botao.innerHTML = texto; }
}

// Janela para digitar um número (substitui o prompt do navegador)
export function pedirNumero(titulo, mensagem) {
    return new Promise((resolve) => {
        const fundo = document.createElement('div');
        fundo.className = 'janela-fundo';
        fundo.innerHTML = `
            <div class="janela janela-pequena" role="dialog" aria-modal="true">
                <h3>${esc(titulo)}</h3>
                <p class="texto-suave">${esc(mensagem)}</p>
                <input type="number" inputmode="decimal" step="any" min="0" class="campo" placeholder="Litros">
                <div class="acoes">
                    <button type="button" class="botao botao-claro" data-r="cancelar">Cancelar</button>
                    <button type="button" class="botao botao-azul" data-r="ok">Confirmar</button>
                </div>
            </div>`;
        document.body.appendChild(fundo);
        const input = fundo.querySelector('input');
        const fechar = (v) => { fundo.remove(); resolve(v); };
        fundo.addEventListener('click', (e) => {
            if (e.target === fundo || e.target.dataset.r === 'cancelar') fechar(null);
            if (e.target.dataset.r === 'ok') fechar(input.value);
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fechar(input.value); if (e.key === 'Escape') fechar(null); });
        setTimeout(() => input.focus(), 50);
    });
}

// Janela de confirmação (substitui o confirm do navegador)
export function confirmar(titulo, mensagem, textoOk = 'Confirmar', perigo = false) {
    return new Promise((resolve) => {
        const fundo = document.createElement('div');
        fundo.className = 'janela-fundo';
        fundo.innerHTML = `
            <div class="janela janela-pequena" role="dialog" aria-modal="true">
                <h3>${esc(titulo)}</h3>
                <p class="texto-suave">${esc(mensagem)}</p>
                <div class="acoes">
                    <button type="button" class="botao botao-claro" data-r="nao">Voltar</button>
                    <button type="button" class="botao ${perigo ? 'botao-vermelho' : 'botao-verde'}" data-r="sim">${esc(textoOk)}</button>
                </div>
            </div>`;
        document.body.appendChild(fundo);
        fundo.addEventListener('click', (e) => {
            if (e.target === fundo || e.target.dataset.r === 'nao') { fundo.remove(); resolve(false); }
            if (e.target.dataset.r === 'sim') { fundo.remove(); resolve(true); }
        });
    });
}
