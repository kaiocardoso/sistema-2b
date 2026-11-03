// Card com a situação de um posto (tanques + encerrantes)
import { configPostos, bicosPostos, rotulosProdutos, getProdutosPermitidos } from "./config.js";
import { esc, num, temValor } from "./util.js";

export function cardPosto(posto, info) {
    const tanques = getProdutosPermitidos(posto).map(p => {
        const r = info?.valores?.[p]?.regua;
        const tem = temValor(r);
        const q = tem ? Number(r) : 0;
        if (p === 'arla_b') {
            return `<div class="tanque"><div class="tanque-info"><span>${rotulosProdutos[p]}</span>${tem ? `<span>${num(q)} un</span>` : '<span class="sem-info">Sem informação</span>'}</div></div>`;
        }
        const max = configPostos[posto][p] || 0;
        const pct = tem && max > 0 ? Math.round((q / max) * 100) : 0;
        const nivel = pct < 15 ? 'nivel-baixo' : pct < 30 ? 'nivel-medio' : 'nivel-ok';
        const texto = tem ? `${num(q)} / ${num(max)} L <b>(${pct}%)</b>` : '<span class="sem-info">Sem informação</span>';
        return `<div class="tanque">
            <div class="tanque-info"><span>${rotulosProdutos[p]}</span><span>${texto}</span></div>
            ${max > 0 ? `<div class="barra"><div class="${tem ? nivel : ''}" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>` : ''}
        </div>`;
    }).join('');

    let encerrantes = '';
    if (info?.encerrantes) {
        const bicos = (bicosPostos[posto] || []).map(b => {
            const e = info.encerrantes[b.id];
            return `<div class="bico" title="${esc(b.produto)}"><span>Bico ${b.id}</span><strong>${temValor(e) ? num(Number(e)) : '–'}</strong></div>`;
        }).join('');
        encerrantes = `<div class="encerrantes">
            <div class="encerrantes-topo"><h4>Encerrantes</h4><span class="etiqueta etiqueta-azul">${esc(info.dataEncerrantes || 'Atualizado')}</span></div>
            <div class="encerrantes-lista">${bicos}</div>
        </div>`;
    }

    return `<article class="card-posto">
        <div class="card-posto-topo">
            <div><h3>${esc(posto)}</h3><p class="quando">${esc(info?.dataFormatada || 'Sem envio')}${info?.enviadoPorNome ? ' · ' + esc(info.enviadoPorNome) : ''}</p></div>
            <span class="etiqueta ${info?.tipoEnvio ? 'etiqueta-amarela' : 'etiqueta-cinza'}">${esc(info?.tipoEnvio || 'Pendente')}</span>
        </div>
        ${tanques}
        ${encerrantes}
    </article>`;
}
