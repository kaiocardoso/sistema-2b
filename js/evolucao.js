// Evolução do estoque: estoque inicial + notas recebidas ± empréstimos − vendas = estoque esperado,
// comparado com a régua dos fechamentos. Começa em INICIO_EVOLUCAO (quando todos os postos já usavam o sistema).
import { configPostos, rotulosProdutos, getProdutosPermitidos, INICIO_EVOLUCAO, TOLERANCIA_ESTOQUE, diaDasVendasPelaHora } from "./config.js";
import { estado, buscarHistorico, analisarHistorico, buscarCargas } from "./dados.js";
import { produtoPelaDescricao } from "./xml-cargas.js";
import { esc, num, temValor, hojeISO, somarDias, dataBR, limitesDoDia, aviso, comEspera } from "./util.js";
import { icone } from "./icones.js";

const n = (v) => Number(v) || 0;
const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(Math.round(v)));
const pctTxt = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const hora = (ts) => new Date(Number(ts)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const nomePosto = (s) => String(s || '').toUpperCase().trim().replace(/^POSTO\s+/, '');
const mesmoPosto = (a, b) => nomePosto(a) === nomePosto(b);
const diaDe = (ms) => diaDasVendasPelaHora(new Date(Number(ms)));
// "2026-11-14T10:30" → dia das vendas (até 04:00 conta no dia anterior)
const diaDaDataHora = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || '');
    return m ? diaDasVendasPelaHora(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0))) : '';
};

const PROD_EMPRESTIMO = { 'DIESEL S-10': 's10', 'DIESEL S-500': 's500', 'GAS. COMUM': 'comum', 'GAS. ADITIVADA': 'vpower', 'ETANOL': 'etanol' };
const produtoEmprestimo = (txt) => PROD_EMPRESTIMO[String(txt || '').toUpperCase().trim()] || produtoPelaDescricao(txt);

export const produtosEvolucao = (posto) => getProdutosPermitidos(posto).filter(p => p !== 'arla_b');

// Calcula tudo de um posto no período
export async function calcularEvolucao(posto, isoIni, isoFim = hojeISO()) {
    if (isoIni < INICIO_EVOLUCAO) isoIni = INICIO_EVOLUCAO;
    const produtos = produtosEvolucao(posto);
    const [inicioBusca] = limitesDoDia(somarDias(isoIni, -5));
    const [, fimBusca] = limitesDoDia(somarDias(isoFim, 2));
    const [hist, cargas] = await Promise.all([buscarHistorico(posto, inicioBusca, Math.min(fimBusca, Date.now() + 60000)), buscarCargas(posto, 300)]);
    const { validos } = analisarHistorico(hist);
    validos.sort((a, b) => a.ts - b.ts);

    const dias = [];
    for (let d = isoIni; d <= isoFim; d = somarDias(d, 1)) dias.push(d);
    const R = {};   // produto -> resultado
    produtos.forEach(p => R[p] = { inicial: null, inicialDe: '', dias: {}, entradas: 0, notas: [], empEntrada: 0, empSaida: 0, devSemData: 0, vendas: 0, descargaCaixa: 0, ultimaRegua: null, ultimaReguaTs: null });
    const D = (p, d) => R[p].dias[d] ||= { vendas: 0, entradas: 0, emp: 0, descarga: 0, regua: null, fechamentos: 0 };

    // estoque inicial: régua do último fechamento antes do período; senão o "estoque inicial" do 1º fechamento
    produtos.forEach(p => {
        const antes = validos.filter(v => v.dia < isoIni && temValor(v.reg?.valores?.[p]?.regua));
        if (antes.length) { const u = antes.at(-1); R[p].inicial = n(u.reg.valores[p].regua); R[p].inicialDe = `régua do fechamento de ${hora(u.ts)}`; return; }
        const prim = validos.find(v => v.dia >= isoIni && v.dia <= isoFim && temValor(v.reg?.valores?.[p]?.inicial));
        if (prim) { R[p].inicial = n(prim.reg.valores[p].inicial); R[p].inicialDe = `estoque inicial do 1º fechamento (${hora(prim.ts)})`; }
    });

    // vendas, descarga informada e régua do fim de cada dia (último fechamento do dia)
    validos.forEach(({ ts, reg, dia }) => {
        if (dia < isoIni || dia > isoFim) return;
        produtos.forEach(p => {
            const v = reg.valores?.[p];
            if (!v) return;
            const x = D(p, dia);
            x.fechamentos++;
            x.vendas += n(v.vendido); R[p].vendas += n(v.vendido);
            x.descarga += n(v.descarga); R[p].descargaCaixa += n(v.descarga);
            if (temValor(v.regua)) { x.regua = n(v.regua); R[p].ultimaRegua = n(v.regua); R[p].ultimaReguaTs = Number(ts); }
        });
    });

    // notas recebidas (pela data e hora da descarga)
    cargas.filter(c => c.status === 'recebida' && c.recebimento?.data).forEach(c => {
        const dia = diaDaDataHora(c.recebimento.data);
        if (dia < isoIni || dia > isoFim) return;
        Object.entries(c.itens || {}).forEach(([p, l]) => {
            if (!R[p]) return;
            D(p, dia).entradas += n(l); R[p].entradas += n(l);
            R[p].notas.push({ dia, litros: n(l), numero: c.numero, fornecedor: c.fornecedor });
        });
    });

    // empréstimos: saiu do posto (−) ou entrou no posto (+); devoluções ao contrário
    Object.values(estado.emprestimos || {}).forEach(e => {
        const p = produtoEmprestimo(e.produto);
        if (!p || !R[p]) return;
        const sai = mesmoPosto(e.origem, posto), entra = mesmoPosto(e.destino, posto);
        if (!sai && !entra) return;
        const s = sai ? -1 : 1, vol = n(e.volume);
        if (e.data >= isoIni && e.data <= isoFim) {
            D(p, e.data).emp += s * vol;
            if (s < 0) R[p].empSaida += vol; else R[p].empEntrada += vol;
        }
        let comData = 0;
        Object.entries(e.devolucoes || {}).forEach(([ts, l]) => {
            comData += n(l);
            const dia = diaDe(ts);
            if (dia < isoIni || dia > isoFim) return;
            D(p, dia).emp -= s * n(l);
            if (s < 0) R[p].empEntrada += n(l); else R[p].empSaida += n(l);
        });
        // devoluções antigas não têm data: entram só no total, se o empréstimo é do período
        const semData = Math.max(0, n(e.devolvido) - comData);
        if (semData && e.data >= isoIni && e.data <= isoFim) R[p].devSemData += -s * semData;
    });

    // estoque esperado dia a dia e diferença com a régua
    produtos.forEach(p => {
        const r = R[p];
        let livro = r.inicial, difAnterior = 0, disponivelDia = r.inicial;
        r.linhas = dias.map(d => {
            const x = r.dias[d] || { vendas: 0, entradas: 0, emp: 0, descarga: 0, regua: null, fechamentos: 0 };
            if (livro === null) return { d, ...x, esperado: null, difAcum: null, difDia: null };
            const base = (disponivelDia ?? 0) + x.entradas + Math.max(0, x.emp);
            livro += x.entradas + x.emp - x.vendas;
            let difAcum = null, difDia = null, pctDia = null;
            if (x.regua !== null) {
                difAcum = x.regua - livro; difDia = difAcum - difAnterior; difAnterior = difAcum;
                pctDia = base > 0 ? difDia / base : 0;
                disponivelDia = x.regua;
            } else disponivelDia = livro;
            return { d, ...x, esperado: livro, difAcum, difDia, pctDia, okDia: pctDia === null || Math.abs(pctDia) <= TOLERANCIA_ESTOQUE };
        });
        r.esperado = r.inicial === null ? null : r.inicial + r.entradas + r.empEntrada - r.empSaida + r.devSemData - r.vendas;
        r.diferenca = r.esperado === null || r.ultimaRegua === null ? null : r.ultimaRegua - r.esperado;
        r.disponivel = (r.inicial || 0) + r.entradas + r.empEntrada;
        r.pct = r.diferenca === null || !r.disponivel ? null : r.diferenca / r.disponivel;
        r.ok = r.pct === null || Math.abs(r.pct) <= TOLERANCIA_ESTOQUE;
    });
    return { posto, isoIni, isoFim, produtos, R };
}

// Empréstimos ainda não quitados que envolvem o posto
export function emprestimosAbertos(posto) {
    return Object.values(estado.emprestimos || {})
        .filter(e => e.status !== 'pago' && (mesmoPosto(e.origem, posto) || mesmoPosto(e.destino, posto)))
        .map(e => ({ ...e, falta: Math.max(0, n(e.volume) - n(e.devolvido)), deve: mesmoPosto(e.destino, posto) }))
        .filter(e => e.falta > 0)
        .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
}

function quadroEmprestimos(posto, isoIni) {
    const lista = emprestimosAbertos(posto);
    if (!lista.length) return `<div class="evo-emprestimos evo-emp-vazio">${icone('check')} Nenhum empréstimo em aberto envolvendo este posto.</div>`;
    return `<div class="evo-emprestimos">
        <p class="evo-emp-titulo">${icone('troca')} <b>${lista.length} empréstimo${lista.length > 1 ? 's' : ''} em aberto</b>: podem explicar parte da diferença</p>
        <ul>${lista.map(e => `<li>
            ${e.deve ? `<b>${esc(posto)}</b> deve <b>${num(e.falta)} L</b> de ${esc(e.produto)} ao <b>${esc(e.origem)}</b>`
                     : `<b>${esc(e.destino)}</b> deve <b>${num(e.falta)} L</b> de ${esc(e.produto)} a este posto`}
            <small>${e.data ? 'emprestado em ' + dataBR(e.data) : 'sem data'} · ${num(n(e.volume))} L${n(e.devolvido) ? `, ${num(n(e.devolvido))} L já devolvidos` : ''} · ${e.data && e.data >= isoIni ? 'já entra na conta acima' : '<b>antes do período: não entra na conta</b>'}</small>
        </li>`).join('')}</ul>
    </div>`;
}

// ---------- Janela ----------
function resumoProduto(p, r) {
    const max = configPostos[r.posto]?.[p];
    if (r.inicial === null) return `<div class="evo-produto"><div class="evo-topo"><strong>${rotulosProdutos[p]}</strong></div><p class="texto-suave">Sem fechamento com régua no período.</p></div>`;
    const linha = (rot, v, cls = '', extra = '') => `<div class="evo-linha ${cls}"><span>${rot}${extra ? `<small>${extra}</small>` : ''}</span><b>${v}</b></div>`;
    const chip = r.diferenca === null ? '' : `<span class="chip ${r.ok ? 'chip-verde' : 'chip-vermelho'}">${r.ok ? icone('check') : icone('alerta')} ${r.diferenca < 0 ? 'Falta' : r.diferenca > 0 ? 'Sobra' : 'Sem diferença'} ${sinal(r.diferenca)} L · ${pctTxt(r.pct)}</span>`;
    return `<div class="evo-produto ${r.ok ? '' : 'evo-fora'}">
        <div class="evo-topo"><strong>${rotulosProdutos[p]}</strong>${chip}</div>
        ${linha('Estoque inicial', num(r.inicial) + ' L', '', r.inicialDe)}
        ${linha('+ Compras recebidas', num(r.entradas) + ' L', 'evo-mais', `${r.notas.length} nota${r.notas.length !== 1 ? 's' : ''}${r.descargaCaixa ? ` · caixas informaram ${num(r.descargaCaixa)} L de descarga` : ''}`)}
        ${r.empEntrada ? linha('+ Empréstimos recebidos / devolvidos ao posto', num(r.empEntrada) + ' L', 'evo-mais') : ''}
        ${r.empSaida ? linha('− Emprestado / devolvido a outro posto', num(r.empSaida) + ' L', 'evo-menos') : ''}
        ${r.devSemData ? linha('± Devoluções sem data registrada', sinal(r.devSemData) + ' L', '') : ''}
        ${linha('− Vendas', num(r.vendas) + ' L', 'evo-menos')}
        ${linha('= Estoque esperado', num(Math.round(r.esperado)) + ' L', 'evo-total')}
        ${linha('Régua do último fechamento', r.ultimaRegua === null ? '–' : num(r.ultimaRegua) + ' L', 'evo-regua', r.ultimaReguaTs ? hora(r.ultimaReguaTs) + (max ? ` · ${Math.round(r.ultimaRegua / max * 100)}% do tanque` : '') : '')}
    </div>`;
}

function tabelaProduto(p, r) {
    if (r.inicial === null) return '';
    const linhas = r.linhas.slice().reverse().map(l => `<tr class="${l.okDia ? '' : 'evo-dia-fora'}">
        <td><b>${dataBR(l.d).slice(0, 5)}</b></td>
        <td>${l.vendas ? num(l.vendas) : '–'}</td>
        <td>${l.entradas ? num(l.entradas) : '–'}${l.descarga && l.descarga !== l.entradas ? `<small>caixa: ${num(l.descarga)}</small>` : ''}</td>
        <td>${l.emp ? sinal(l.emp) : '–'}</td>
        <td>${l.esperado === null ? '–' : num(Math.round(l.esperado))}</td>
        <td>${l.regua === null ? '<small>sem fechamento</small>' : num(l.regua)}</td>
        <td>${l.difDia === null ? '–' : `${sinal(l.difDia)}<small>${pctTxt(l.pctDia)}</small>`}</td>
        <td>${l.difAcum === null ? '–' : sinal(l.difAcum)}</td>
    </tr>`).join('');
    return `<details class="evo-detalhe"><summary>${icone('seta')} Dia a dia · ${rotulosProdutos[p]}</summary>
        <div class="tabela-rolagem"><table class="tabela-estoque tabela-evo">
            <thead><tr><th>Dia</th><th>Vendas</th><th>Compras</th><th>Empr.</th><th>Esperado</th><th>Régua</th><th>Dif. do dia</th><th>Dif. acumulada</th></tr></thead>
            <tbody>${linhas}</tbody></table></div></details>`;
}

export function abrirEvolucao(posto) {
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo janela-dinamica';
    const hoje = hojeISO(), mes = hoje.slice(0, 8) + '01';
    const opcoes = [[INICIO_EVOLUCAO, `Desde ${dataBR(INICIO_EVOLUCAO).slice(0, 5)} (início)`], [mes, 'Este mês'], [somarDias(hoje, -6), 'Últimos 7 dias'], [somarDias(hoje, -14), 'Últimos 15 dias']]
        .filter(([d], i, a) => d >= INICIO_EVOLUCAO && a.findIndex(x => x[0] === d) === i);
    fundo.innerHTML = `
        <div class="janela janela-estoque janela-evo" role="dialog" aria-modal="true">
            <div class="janela-topo">
                <div><p class="saudacao-dia">Evolução do estoque</p><h2>${esc(posto)}</h2></div>
                <button type="button" class="botao-fechar" data-fechar aria-label="Fechar">&times;</button>
            </div>
            <div class="historico-controle">
                <label class="rotulo" for="evo-periodo">Período</label>
                <select id="evo-periodo" class="campo">${opcoes.map(([d, t]) => `<option value="${d}">${t}</option>`).join('')}</select>
            </div>
            <button type="button" class="botao botao-claro botao-mini evo-botao-rel" data-evo-relatorio="${esc(posto)}">${icone('baixar')} Relatório deste posto (PDF ou texto)</button>
            <p class="texto-suave evo-legenda">Estoque inicial + notas recebidas ± empréstimos − vendas = estoque esperado. A diferença para a régua é aceitável até <b>0,6%</b> do estoque disponível (inicial + recebido).</p>
            <div class="evo-conteudo"></div>
        </div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.classList.add('fechando'); document.removeEventListener('keydown', tecla); setTimeout(() => fundo.remove(), 200); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', (e) => {
        if (e.target === fundo || e.target.closest('[data-fechar]')) fechar();
        if (e.target.closest('[data-evo-relatorio]')) abrirRelatorioEvolucao(posto);
    });
    const sel = fundo.querySelector('#evo-periodo');
    const carregar = async () => {
        const caixa = fundo.querySelector('.evo-conteudo');
        caixa.innerHTML = '<div class="esqueleto esqueleto-grande"></div><div class="esqueleto"></div>';
        try {
            const ev = await calcularEvolucao(posto, sel.value);
            const lista = ev.produtos.map(p => ({ p, r: { ...ev.R[p], posto } }));
            caixa.innerHTML = `<p class="evo-periodo">${dataBR(ev.isoIni)} a ${dataBR(ev.isoFim)}</p>
                ${quadroEmprestimos(posto, ev.isoIni)}
                <div class="evo-produtos">${lista.map(x => resumoProduto(x.p, x.r)).join('')}</div>
                ${lista.map(x => tabelaProduto(x.p, x.r)).join('')}`;
        } catch (e) { console.error(e); caixa.innerHTML = '<div class="vazio-lista">Não foi possível calcular a evolução.</div>'; }
    };
    sel.onchange = carregar;
    carregar();
}

// ---------- Resumo de todos os postos (painel do gestor, aba Cargas) ----------
export async function carregarEvolucaoGestor() {
    const el = document.getElementById('gestor-evolucao');
    if (!el) return;
    el.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
    const linhas = [];
    for (const posto of estado.postos) {
        try {
            const ev = await calcularEvolucao(posto, INICIO_EVOLUCAO);
            const prods = ev.produtos.filter(p => ev.R[p].diferenca !== null);
            const fora = prods.filter(p => !ev.R[p].ok);
            const abertos = emprestimosAbertos(posto).length;
            linhas.push(`<button type="button" class="evo-posto ${fora.length ? 'evo-fora' : ''}" data-evolucao-posto="${esc(posto)}">
                <strong>${esc(posto)}</strong>
                <span class="evo-chips">${prods.map(p => { const r = ev.R[p]; return `<span class="chip ${r.ok ? 'chip-verde' : 'chip-vermelho'}">${rotulosProdutos[p]} ${sinal(r.diferenca)} L</span>`; }).join('') || '<span class="chip chip-cinza">sem dados</span>'}${abertos ? `<span class="chip chip-azul">${icone('troca')} ${abertos} empréstimo${abertos > 1 ? 's' : ''} em aberto</span>` : ''}</span>
                ${icone('flecha')}
            </button>`);
        } catch (e) { console.error(e); linhas.push(`<div class="evo-posto"><strong>${esc(posto)}</strong><span class="chip chip-cinza">não foi possível calcular</span></div>`); }
    }
    el.innerHTML = linhas.join('');
}

// ---------- Relatório da evolução (impressão / PDF e texto para copiar) ----------
async function calcularVarios(postos) {
    const lista = [];
    for (const posto of postos) {
        try { lista.push(await calcularEvolucao(posto, INICIO_EVOLUCAO)); }
        catch (e) { console.error(e); lista.push({ posto, erro: true }); }
    }
    return lista;
}

const statusTxt = (r) => r.diferenca === null ? 'sem dados' : r.ok ? 'OK' : (r.diferenca < 0 ? 'FALTA' : 'SOBRA') + ' acima de 0,6%';

export function textoEvolucao(lista) {
    const L = [`EVOLUÇÃO DO ESTOQUE - REDE 2B`, `Período: ${dataBR(INICIO_EVOLUCAO)} a ${dataBR(hojeISO())} · gerado em ${new Date().toLocaleString('pt-BR')}`, `Conta: inicial + compras ± empréstimos − vendas = esperado; diferença = régua − esperado (tolerância 0,6% do inicial + recebido)`, ''];
    lista.forEach(ev => {
        L.push(`=== ${ev.posto} ===`);
        if (ev.erro) { L.push('não foi possível calcular', ''); return; }
        const abertos = emprestimosAbertos(ev.posto);
        ev.produtos.forEach(p => {
            const r = ev.R[p];
            if (r.inicial === null) { L.push(`${rotulosProdutos[p]}: sem fechamento com régua`); return; }
            L.push(`${rotulosProdutos[p]}: inicial ${num(r.inicial)} (${r.inicialDe}) | compras ${num(r.entradas)} em ${r.notas.length} nota(s)${r.descargaCaixa ? ` [caixas informaram descarga ${num(r.descargaCaixa)}]` : ''} | empr. +${num(r.empEntrada)} −${num(r.empSaida)}${r.devSemData ? ` | devol. sem data ${sinal(r.devSemData)}` : ''} | vendas ${num(r.vendas)} | esperado ${num(Math.round(r.esperado))} | régua ${r.ultimaRegua === null ? '-' : num(r.ultimaRegua)}${r.ultimaReguaTs ? ' em ' + hora(r.ultimaReguaTs) : ''} | DIF ${r.diferenca === null ? '-' : sinal(r.diferenca) + ' L (' + pctTxt(r.pct) + ')'} ${statusTxt(r)}`);
            if (r.notas.length) L.push(`   notas: ${r.notas.map(x => `${dataBR(x.dia).slice(0, 5)} ${num(x.litros)}L${x.numero ? ' NF' + x.numero : ''}`).join('; ')}`);
            L.push(`   dia a dia (dia: vendas/compras/empr./régua/dif.dia): ${r.linhas.filter(l => l.vendas || l.entradas || l.emp || l.regua !== null).map(l => `${dataBR(l.d).slice(0, 5)}: ${num(l.vendas)}/${num(l.entradas)}/${sinal(l.emp) || 0}/${l.regua === null ? '-' : num(l.regua)}/${l.difDia === null ? '-' : sinal(l.difDia)}${l.descarga && l.descarga !== l.entradas ? ` (caixa desc. ${num(l.descarga)})` : ''}`).join(' · ')}`);
        });
        L.push(abertos.length ? `Empréstimos em aberto: ${abertos.map(e => `${e.deve ? ev.posto + ' deve ' + num(e.falta) + 'L de ' + e.produto + ' ao ' + e.origem : e.destino + ' deve ' + num(e.falta) + 'L de ' + e.produto + ' a este posto'} (${e.data ? dataBR(e.data) : 'sem data'}${e.data && e.data >= INICIO_EVOLUCAO ? ', na conta' : ', antes do período'})`).join('; ')}` : 'Empréstimos em aberto: nenhum');
        L.push('');
    });
    return L.join('\n');
}

function imprimirEvolucao(lista) {
    const th = (t) => `<th>${t}</th>`;
    const blocos = lista.map(ev => {
        if (ev.erro) return `<h3>${esc(ev.posto)}</h3><p class="obs">Não foi possível calcular.</p>`;
        const abertos = emprestimosAbertos(ev.posto);
        const linhas = ev.produtos.map(p => {
            const r = ev.R[p];
            if (r.inicial === null) return `<tr class="vazio"><td>${rotulosProdutos[p]}</td><td colspan="8">sem fechamento com régua</td></tr>`;
            return `<tr><td>${rotulosProdutos[p]}</td><td>${num(r.inicial)}</td><td>${num(r.entradas)}</td><td>${sinal(r.empEntrada - r.empSaida + r.devSemData) || '0'}</td><td>${num(r.vendas)}</td><td><b>${num(Math.round(r.esperado))}</b></td><td>${r.ultimaRegua === null ? '–' : num(r.ultimaRegua)}</td><td><b>${r.diferenca === null ? '–' : sinal(r.diferenca)}</b></td><td class="${r.ok ? '' : 'fora'}">${r.pct === null ? '–' : pctTxt(r.pct)} ${r.ok ? '' : '⚠'}</td></tr>`;
        }).join('');
        const diasFora = ev.produtos.flatMap(p => (ev.R[p].linhas || []).filter(l => !l.okDia).map(l => `${dataBR(l.d).slice(0, 5)} ${rotulosProdutos[p]} ${sinal(l.difDia)} L (${pctTxt(l.pctDia)})`));
        return `<h3>${esc(ev.posto)}</h3>
            <table><thead><tr>${th('Produto')}${th('Inicial')}${th('Compras')}${th('Empr.')}${th('Vendas')}${th('Esperado')}${th('Régua')}${th('Diferença')}${th('%')}</tr></thead><tbody>${linhas}</tbody></table>
            ${diasFora.length ? `<p class="obs"><b>Dias acima de 0,6%:</b> ${diasFora.map(esc).join('; ')}</p>` : ''}
            <p class="obs"><b>Empréstimos em aberto:</b> ${abertos.length ? abertos.map(e => esc(e.deve ? `deve ${num(e.falta)} L de ${e.produto} ao ${e.origem}` : `${e.destino} deve ${num(e.falta)} L de ${e.produto}`) + ` (${e.data ? dataBR(e.data) : 'sem data'}${e.data && e.data >= INICIO_EVOLUCAO ? '' : ', fora da conta'})`).join('; ') : 'nenhum'}</p>`;
    }).join('');
    const area = document.createElement('div');
    area.id = 'relatorio-impressao';
    area.innerHTML = `
        <header><img src="img/logo-2b.png" alt=""><div><h1>Evolução do estoque</h1><p>${lista.length > 1 ? 'Rede 2B · ' + lista.length + ' postos' : esc(lista[0].posto)}</p></div>
            <div class="periodo"><b>Desde ${dataBR(INICIO_EVOLUCAO)}</b><span>${dataBR(INICIO_EVOLUCAO)} a ${dataBR(hojeISO())}</span></div></header>
        <p class="obs">Estoque inicial (régua do último fechamento antes de ${dataBR(INICIO_EVOLUCAO)}) + compras recebidas ± empréstimos − vendas = estoque esperado. Diferença = régua do último fechamento − esperado. Tolerância: 0,6% do estoque disponível (inicial + recebido).</p>
        ${blocos}
        <footer>Gerado em ${new Date().toLocaleString('pt-BR')} por ${esc(estado.perfil.nome)} · Sistema Postos 2B</footer>`;
    document.getElementById('relatorio-impressao')?.remove();
    document.body.appendChild(area);
    const img = area.querySelector('img');
    const ir = () => { window.print(); setTimeout(() => area.remove(), 1000); };
    if (img.complete) setTimeout(ir, 100); else { img.onload = ir; img.onerror = ir; }
}

async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch (e) {
        const t = document.createElement('textarea'); t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* */ }
        t.remove(); return ok;
    }
}

export function abrirRelatorioEvolucao(postoFixo = null) {
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo janela-dinamica';
    fundo.innerHTML = `
        <div class="janela janela-pequena janela-relatorio" role="dialog" aria-modal="true">
            <h3>Relatório da evolução do estoque</h3>
            <p class="texto-suave">De ${dataBR(INICIO_EVOLUCAO)} até hoje.</p>
            ${!postoFixo && estado.postos.length > 1 ? `<div><label class="rotulo" for="relevo-posto">Postos</label>
                <select id="relevo-posto" class="campo"><option value="todos">Todos os ${estado.postos.length} postos</option>${estado.postos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></div>` : ''}
            <div class="rel-botoes">
                <button type="button" class="botao botao-primario" data-relevo="pdf">Imprimir / salvar PDF</button>
                <button type="button" class="botao botao-sucesso" data-relevo="copiar">Copiar texto (WhatsApp ou análise)</button>
            </div>
            <textarea id="relevo-texto" class="campo oculto" rows="8" readonly></textarea>
            <div class="acoes"><button type="button" class="botao botao-claro" data-relevo="fechar">Fechar</button></div>
        </div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', async (e) => {
        if (e.target === fundo || e.target.closest('[data-relevo="fechar"]')) return fechar();
        const botao = e.target.closest('[data-relevo="pdf"], [data-relevo="copiar"]');
        if (!botao) return;
        const escolha = postoFixo || fundo.querySelector('#relevo-posto')?.value || 'todos';
        const postos = escolha === 'todos' ? estado.postos : [escolha];
        await comEspera(botao, async () => {
            try {
                const lista = await calcularVarios(postos);
                if (botao.dataset.relevo === 'pdf') { fechar(); imprimirEvolucao(lista); return; }
                const texto = textoEvolucao(lista);
                const area = fundo.querySelector('#relevo-texto');
                area.value = texto; area.classList.remove('oculto');
                aviso(await copiar(texto) ? 'Texto copiado! É só colar.' : 'Selecione o texto abaixo e copie.');
            } catch (err) { console.error(err); aviso('Não foi possível gerar o relatório.', 'erro'); }
        });
    });
}
