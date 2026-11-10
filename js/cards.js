// Card com a situação de um posto (tanques + encerrantes)
import { configPostos, bicosPostos, rotulosProdutos, getProdutosPermitidos, slugPostos } from "./config.js";
import { esc, num, temValor } from "./util.js";
import { icone } from "./icones.js";
import { estaAberta } from "./secoes.js";

export const nivelDe = (pct) => pct < 15 ? 'baixo' : pct < 30 ? 'medio' : 'ok';

// Menor nível entre os tanques com leitura (para alertas)
export function tanquesBaixos(posto, info) {
    return getProdutosPermitidos(posto).filter(p => {
        const r = info?.valores?.[p]?.regua, max = configPostos[posto][p] || 0;
        return p !== 'arla_b' && temValor(r) && max > 0 && (Number(r) / max) * 100 < 15;
    }).length;
}

const quem = (info) => (info?.tipoEnvio === 'Fechamento de Turno' && info.responsavelFechamento) ? info.responsavelFechamento : info?.enviadoPorNome;

export function cardPosto(posto, info, { comEncerrantesAbertos = false } = {}) {
    const tanques = getProdutosPermitidos(posto).map(p => {
        const r = info?.valores?.[p]?.regua;
        const tem = temValor(r);
        const q = tem ? Number(r) : 0;
        if (p === 'arla_b') {
            return `<div class="tanque">
                <div class="tanque-linha"><span class="tanque-nome">${rotulosProdutos[p]}</span>
                ${tem ? `<span class="tanque-valor">${num(q)} <small>un</small></span>` : '<span class="tanque-valor vazio">sem leitura</span>'}</div>
            </div>`;
        }
        const max = configPostos[posto][p] || 0;
        const pct = tem && max > 0 ? Math.round((q / max) * 100) : 0;
        const nivel = tem ? nivelDe(pct) : 'sem';
        return `<div class="tanque">
            <div class="tanque-linha">
                <span class="tanque-nome">${rotulosProdutos[p]}</span>
                ${tem ? `<span class="tanque-valor">${num(q)} <small>/ ${num(max)} L</small></span><span class="tanque-pct nivel-${nivel}">${pct}%</span>`
                      : '<span class="tanque-valor vazio">sem leitura</span>'}
            </div>
            ${max > 0 ? `<div class="barra"><div class="nivel-${nivel}" style="--pct:${Math.max(0, Math.min(100, pct))}%"></div></div>` : ''}
        </div>`;
    }).join('');

    let encerrantes = '';
    if (info?.encerrantes) {
        const id = `enc-${slugPostos[posto] || 'posto'}`;
        const aberta = estaAberta(id, comEncerrantesAbertos);
        const bicos = (bicosPostos[posto] || []).map(b => {
            const e = info.encerrantes[b.id];
            return `<div class="bico" title="${esc(b.produto)}"><span>Bico ${b.id}</span><strong>${temValor(e) ? num(Number(e)) : '–'}</strong></div>`;
        }).join('');
        encerrantes = `<div class="sub-secao encerrantes ${aberta ? 'aberta' : ''}" data-secao="${id}">
            <button type="button" class="sub-cabeca" aria-expanded="${aberta}">
                Encerrantes <span class="chip chip-azul">${(bicosPostos[posto] || []).length} bicos</span>
                <small>${esc(info.dataEncerrantes || '')}</small>
                ${icone('seta', 'secao-seta')}
            </button>
            <div class="secao-corpo"><div class="secao-interno"><div class="encerrantes-lista">${bicos}</div></div></div>
        </div>`;
    }

    const baixos = tanquesBaixos(posto, info);
    return `<article class="card-posto ${info ? '' : 'sem-envio'}">
        <header class="card-posto-topo">
            <div>
                <h3>${esc(posto)}</h3>
                <p class="quando">${icone('relogio')} ${esc(info?.dataFormatada || 'Nenhum envio ainda')}${quem(info) ? ' · ' + esc(quem(info)) : ''}</p>
            </div>
            ${baixos ? `<span class="chip chip-vermelho">${icone('alerta')} ${baixos} baixo${baixos > 1 ? 's' : ''}</span>`
                     : `<span class="chip ${info?.tipoEnvio ? 'chip-verde' : 'chip-cinza'}">${esc(info?.tipoEnvio ? (info.tipoEnvio === 'Fechamento de Turno' ? 'Fechamento' : 'Atualização') : 'Pendente')}</span>`}
        </header>
        ${info ? `<div class="tanques">${tanques}</div>` : `<div class="posto-sem-envio">${icone('tanque')}<span>Este posto ainda não enviou nenhum lançamento.</span></div>`}
        ${encerrantes}
        ${info ? `<button type="button" class="botao-historico-estoque" data-estoque-posto="${esc(posto)}">${icone('grafico')} Ver histórico do estoque</button>` : ''}
    </article>`;
}
