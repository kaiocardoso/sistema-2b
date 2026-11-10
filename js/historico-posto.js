// Janela com o histórico de vendas de um posto (abre ao tocar no card do posto em "Vendas")
import { rotulosProdutos, unidade } from "./config.js";
import { vendasDoPosto } from "./vendas.js";
import { esc, num, hojeISO, somarDias, dataBR, diaDaSemana } from "./util.js";
import { icone } from "./icones.js";

const hora = (ts) => new Date(Number(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const curto = (iso) => dataBR(iso).slice(0, 5);
const ordenar = (obj) => Object.entries(obj).sort((a, b) => (a[0].startsWith('arla') - b[0].startsWith('arla')) || b[1] - a[1]);

export function abrirHistoricoPosto(posto) {
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo janela-dinamica';
    fundo.innerHTML = `
        <div class="janela janela-posto" role="dialog" aria-modal="true">
            <div class="janela-topo">
                <div><p class="saudacao-dia">Histórico de vendas</p><h2>${esc(posto)}</h2></div>
                <button type="button" class="botao-fechar" data-fechar aria-label="Fechar">&times;</button>
            </div>
            <div class="historico-controle">
                <label class="rotulo" for="hp-dias">Período</label>
                <select id="hp-dias" class="campo">
                    <option value="7">Últimos 7 dias</option>
                    <option value="15">Últimos 15 dias</option>
                    <option value="30">Últimos 30 dias</option>
                </select>
            </div>
            <div class="hp-conteudo"></div>
        </div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.classList.add('fechando'); document.removeEventListener('keydown', tecla); setTimeout(() => fundo.remove(), 200); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', (e) => {
        if (e.target === fundo || e.target.closest('[data-fechar]')) return fechar();
        const col = e.target.closest('[data-hp-dia]');
        if (col) {
            const item = fundo.querySelector(`details[data-dia="${col.dataset.hpDia}"]`);
            if (item) { item.open = true; item.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }
    });
    const select = fundo.querySelector('#hp-dias');
    select.onchange = () => carregar(fundo, posto, Number(select.value));
    carregar(fundo, posto, 7);
}

async function carregar(fundo, posto, n) {
    const caixa = fundo.querySelector('.hp-conteudo');
    caixa.innerHTML = '<div class="esqueleto esqueleto-grande"></div><div class="esqueleto"></div>';
    const fim = hojeISO(), inicio = somarDias(fim, -(n - 1));
    let porDia;
    try { porDia = await vendasDoPosto(posto, inicio, fim); }
    catch (e) { console.error(e); caixa.innerHTML = '<div class="vazio-lista">Não foi possível carregar o histórico.</div>'; return; }

    const dias = Array.from({ length: n }, (_, i) => somarDias(inicio, i));
    const totais = dias.map(d => porDia[d]?.total || 0);
    const soma = totais.reduce((a, b) => a + b, 0);
    const comVenda = totais.filter(Boolean).length;
    const maior = Math.max(1, ...totais);
    const melhor = dias[totais.indexOf(Math.max(...totais))];
    const produtos = {};
    Object.values(porDia).forEach(D => Object.entries(D.produtos).forEach(([p, v]) => produtos[p] = (produtos[p] || 0) + v));
    const maiorProd = Math.max(1, ...Object.entries(produtos).filter(([p]) => p !== 'arla_b').map(([, v]) => v));
    const qtdFech = Object.values(porDia).reduce((s, D) => s + D.fechamentos.length, 0);

    caixa.innerHTML = `
        <div class="historico-resumo">
            <div><span>Total em ${n} dias</span><strong>${num(soma)} L</strong></div>
            <div><span>Média por dia</span><strong>${num(Math.round(soma / Math.max(1, comVenda)))} L</strong></div>
            <div><span>Melhor dia</span><strong>${soma ? `${curto(melhor)} · ${num(Math.max(...totais))} L` : '–'}</strong></div>
        </div>
        <div class="grafico-dias ${n > 15 ? 'grafico-largo' : ''}" role="img" aria-label="Vendas por dia">
            ${dias.map((d, i) => `
                <button type="button" class="grafico-coluna ${d === fim ? 'hoje' : ''}" data-hp-dia="${d}" title="${diaDaSemana(d, false)} ${dataBR(d)}: ${num(totais[i])} L">
                    <span class="grafico-valor">${totais[i] ? (totais[i] >= 1000 ? (totais[i] / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : num(totais[i])) : ''}</span>
                    <span class="grafico-barra"><span style="--pct:${Math.round((totais[i] / maior) * 100)}%"></span></span>
                    <span class="grafico-dia">${diaDaSemana(d)}<br>${curto(d)}</span>
                </button>`).join('')}
        </div>
        ${Object.keys(produtos).length ? `
        <h4 class="rotulo-lista">Por produto no período · ${qtdFech} fechamento${qtdFech === 1 ? '' : 's'}</h4>
        <div class="hp-produtos">${ordenar(produtos).map(([p, v]) => `
            <div class="venda-produto ${p.startsWith('arla') ? 'arla' : ''}">
                <div class="venda-produto-linha"><span>${rotulosProdutos[p]}</span><b>${num(v)} ${unidade(p)}</b></div>
                ${p === 'arla_b' ? '' : `<div class="barra barra-fina"><div class="nivel-verde" style="--pct:${Math.round((v / maiorProd) * 100)}%"></div></div>`}
            </div>`).join('')}</div>` : ''}
        <h4 class="rotulo-lista">Dia a dia</h4>
        <div class="hp-dias">${dias.slice().reverse().map(d => {
            const D = porDia[d];
            if (!D) return `<div class="hp-dia vazio"><span><b>${diaDaSemana(d)} ${dataBR(d)}</b></span><span>sem fechamento</span></div>`;
            return `<details class="hp-dia" data-dia="${d}">
                <summary>
                    <span><b>${diaDaSemana(d)} ${dataBR(d)}</b>${d === fim ? ' <span class="chip chip-verde">hoje</span>' : ''}<small>${D.fechamentos.length} fechamento${D.fechamentos.length > 1 ? 's' : ''}</small></span>
                    <span class="hp-dia-total">${num(D.total)} L</span>
                </summary>
                <div class="hp-dia-detalhe">
                    <div class="hp-bloco"><h5>Produtos</h5>${ordenar(D.produtos).map(([p, v]) => `<div class="registro-linha"><span>${rotulosProdutos[p]}</span><strong>${num(v)} ${unidade(p)}</strong></div>`).join('')}</div>
                    <div class="hp-bloco"><h5>Fechamentos</h5>${D.fechamentos.map(f => `<div class="registro-linha"><span>${icone('relogio')} ${new Date(Number(f.ts)).toLocaleDateString('pt-BR').slice(0, 5)} às ${hora(f.ts)}${f.nome ? ' · ' + esc(f.nome) : ''}${f.correcao ? ' <span class="chip chip-azul">corrigido</span>' : ''}</span><strong>${num(f.litros)} L</strong></div>`).join('')}</div>
                </div>
            </details>`;
        }).join('')}</div>`;
    caixa.querySelectorAll('.grafico-dias').forEach(g => { g.scrollLeft = g.scrollWidth; });  // abre nos dias mais recentes
}
