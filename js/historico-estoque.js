// Janela com o histórico de estoque (régua) de um posto
import { configPostos, rotulosProdutos, getProdutosPermitidos, unidade } from "./config.js";
import { buscarHistorico, analisarHistorico } from "./dados.js";
import { esc, num, temValor, hojeISO, somarDias, dataBR, limitesDoDia } from "./util.js";
import { nivelDe } from "./cards.js";

const hora = (ts) => new Date(Number(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataHora = (ts) => `${new Date(Number(ts)).toLocaleDateString('pt-BR').slice(0, 5)} ${hora(ts)}`;

// Leituras de estoque do período: fechamentos, correções e atualizações do gerente.
// Envios só de encerrantes não contam (eles repetiam o estoque anterior);
// fechamentos substituídos por correção também não.
async function leiturasEstoque(posto, inicio, fim) {
    const hist = await buscarHistorico(posto, inicio, fim);
    const { substituidos } = analisarHistorico(hist);
    const vistos = new Set(), leituras = [];
    Object.entries(hist || {}).filter(([ts]) => /^[0-9]+$/.test(ts)).sort((a, b) => a[0] - b[0]).forEach(([ts, r]) => {
        if (!r || substituidos.has(ts) || r.evento === 'encerrantes') return;
        if (!r.evento) {   // registros antigos: cada envio conta uma vez
            const chave = (r.tipoEnvio || '') + '|' + (r.dataFormatada || ts);
            if (vistos.has(chave)) return;
            vistos.add(chave);
        }
        const valores = {};
        Object.entries(r.valores || {}).forEach(([p, v]) => { if (temValor(v?.regua)) valores[p] = Number(v.regua); });
        if (!Object.keys(valores).length) return;
        const tipo = r.evento === 'correcao' ? 'Correção' : (r.evento === 'atualizacao' || /Atualiza/.test(r.tipoEnvio || '')) ? 'Atualização do gerente' : 'Fechamento';
        const nome = (r.evento === 'fechamento' || r.evento === 'correcao' || !r.evento) && r.responsavelFechamento ? r.responsavelFechamento : (r.enviadoPorNome || '');
        leituras.push({ ts: Number(ts), tipo, nome, valores });
    });
    return leituras;
}

function grafico(pontos, max, inicio, fim) {
    const L = 300, A = 70, x = (t) => ((t - inicio) / Math.max(1, fim - inicio)) * L;
    const topo = Math.max(max || 0, ...pontos.map(p => p.v), 1);
    const y = (v) => A - (v / topo) * (A - 6) - 3;
    const linha = pontos.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    return `<svg class="estoque-grafico" viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" aria-hidden="true">
        ${max ? `<line x1="0" x2="${L}" y1="${y(max)}" y2="${y(max)}" class="linha-capacidade"/>
                 <line x1="0" x2="${L}" y1="${y(max * .15)}" y2="${y(max * .15)}" class="linha-baixo"/>` : ''}
        ${pontos.length > 1 ? `<polygon points="0,${A} ${linha} ${x(pontos.at(-1).t).toFixed(1)},${A} ${x(pontos[0].t).toFixed(1)},${A}" class="area"/><polyline points="${linha}" class="linha"/>` : ''}
        ${pontos.map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.2" class="ponto"/>`).join('')}
    </svg>`;
}

export function abrirHistoricoEstoque(posto) {
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo janela-dinamica';
    fundo.innerHTML = `
        <div class="janela janela-estoque" role="dialog" aria-modal="true">
            <div class="janela-topo">
                <div><p class="saudacao-dia">Histórico de estoque</p><h2>${esc(posto)}</h2></div>
                <button type="button" class="botao-fechar" data-fechar aria-label="Fechar">&times;</button>
            </div>
            <div class="historico-controle">
                <label class="rotulo" for="he-dias">Período</label>
                <select id="he-dias" class="campo">
                    <option value="3">Últimos 3 dias</option>
                    <option value="7" selected>Últimos 7 dias</option>
                    <option value="15">Últimos 15 dias</option>
                    <option value="30">Últimos 30 dias</option>
                </select>
            </div>
            <div class="he-conteudo"></div>
        </div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.classList.add('fechando'); document.removeEventListener('keydown', tecla); setTimeout(() => fundo.remove(), 200); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
    const select = fundo.querySelector('#he-dias');
    select.onchange = () => carregar(fundo, posto, Number(select.value));
    carregar(fundo, posto, 7);
}

async function carregar(fundo, posto, n) {
    const caixa = fundo.querySelector('.he-conteudo');
    caixa.innerHTML = '<div class="esqueleto esqueleto-grande"></div><div class="esqueleto"></div>';
    const [inicio] = limitesDoDia(somarDias(hojeISO(), -(n - 1)));
    const fim = Date.now();
    let leituras;
    try { leituras = await leiturasEstoque(posto, inicio, fim); }
    catch (e) { console.error(e); caixa.innerHTML = '<div class="vazio-lista">Não foi possível carregar o histórico.</div>'; return; }
    if (!leituras.length) { caixa.innerHTML = '<div class="vazio-lista">Nenhuma leitura de estoque neste período.</div>'; return; }

    const produtos = getProdutosPermitidos(posto);
    const cards = produtos.map(p => {
        const pontos = leituras.filter(l => p in l.valores).map(l => ({ t: l.ts, v: l.valores[p] }));
        if (!pontos.length) return '';
        const max = p === 'arla_b' ? 0 : (configPostos[posto][p] || 0);
        const atual = pontos.at(-1).v, vals = pontos.map(x => x.v);
        const pct = max ? Math.round((atual / max) * 100) : null;
        return `<div class="estoque-produto">
            <div class="tanque-linha"><span class="tanque-nome">${rotulosProdutos[p]}</span>
                <span class="tanque-valor">${num(atual)} <small>${max ? '/ ' + num(max) + ' L' : unidade(p)}</small></span>
                ${pct !== null ? `<span class="tanque-pct nivel-${nivelDe(pct)}">${pct}%</span>` : ''}</div>
            ${grafico(pontos, max, inicio, fim)}
            <div class="estoque-faixa"><span>Mínimo: <b>${num(Math.min(...vals))}</b></span><span>Máximo: <b>${num(Math.max(...vals))}</b></span><span>${pontos.length} leitura${pontos.length > 1 ? 's' : ''}</span></div>
        </div>`;
    }).join('');

    const usados = produtos.filter(p => leituras.some(l => p in l.valores));
    const linhas = leituras.slice().reverse().map(l => `<tr>
        <td><b>${dataHora(l.ts)}</b><small>${esc(l.tipo)}${l.nome ? ' · ' + esc(l.nome) : ''}</small></td>
        ${usados.map(p => `<td>${p in l.valores ? num(l.valores[p]) : '–'}</td>`).join('')}
    </tr>`).join('');

    caixa.innerHTML = `
        <p class="texto-suave he-legenda"><span class="leg leg-cap"></span> capacidade do tanque &nbsp; <span class="leg leg-baixo"></span> nível baixo (15%)</p>
        <div class="estoque-produtos">${cards}</div>
        <h4 class="rotulo-lista">Todas as leituras · ${leituras.length}</h4>
        <div class="tabela-rolagem"><table class="tabela-estoque">
            <thead><tr><th>Quando</th>${usados.map(p => `<th>${rotulosProdutos[p]}</th>`).join('')}</tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>`;
}
