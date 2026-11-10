// Relatório de vendas: mês fechado, 7 ou 15 dias. Exporta para Excel (CSV) ou PDF (impressão).
import { rotulosProdutos, unidade } from "./config.js";
import { estado, registrarLog } from "./dados.js";
import { vendasDoPeriodo } from "./vendas.js";
import { esc, num, hojeISO, somarDias, dataBR, diaDaSemana, aviso, comEspera } from "./util.js";

const ORDEM = ['comum', 'vpower', 'etanol', 's500', 's10', 'arla_g', 'arla_b'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function opcoesPeriodo() {
    const h = new Date();
    const meses = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(h.getFullYear(), h.getMonth() - i, 1);
        return { valor: `mes:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, texto: `${MESES[d.getMonth()]} de ${d.getFullYear()}${i === 0 ? ' (mês atual, até hoje)' : ''}` };
    });
    return [{ valor: 'dias:7', texto: 'Últimos 7 dias' }, { valor: 'dias:15', texto: 'Últimos 15 dias' }, ...meses];
}

// Mês: do dia 1 ao último dia do mês (o mês atual vai até hoje). Nunca mistura meses.
function intervalo(valor) {
    const hoje = hojeISO();
    if (valor.startsWith('dias:')) {
        const n = Number(valor.slice(5));
        return { inicio: somarDias(hoje, -(n - 1)), fim: hoje, titulo: `Últimos ${n} dias` };
    }
    const [a, m] = valor.slice(4).split('-').map(Number);
    const inicio = `${a}-${String(m).padStart(2, '0')}-01`;
    const ultimo = new Date(a, m, 0).getDate();
    let fim = `${a}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
    if (fim > hoje) fim = hoje;
    return { inicio, fim, titulo: `${MESES[m - 1]} de ${a}` };
}

const diasEntre = (ini, fim) => { const r = []; for (let d = ini; d <= fim; d = somarDias(d, 1)) r.push(d); return r; };

async function montarDados(valorPeriodo, postoEscolhido) {
    const { inicio, fim, titulo } = intervalo(valorPeriodo);
    const postos = postoEscolhido === 'todos' ? estado.postos : [postoEscolhido];
    const porDia = await vendasDoPeriodo(inicio, fim, postos);
    const dias = diasEntre(inicio, fim);
    const totalPosto = {}, produtosPosto = {}, qtdPosto = {}, produtos = {};
    let total = 0, qtd = 0;
    dias.forEach(d => Object.entries(porDia[d]?.postos || {}).forEach(([p, P]) => {
        totalPosto[p] = (totalPosto[p] || 0) + P.total; total += P.total;
        qtdPosto[p] = (qtdPosto[p] || 0) + P.qtd; qtd += P.qtd;
        produtosPosto[p] ||= {};
        Object.entries(P.vendas).forEach(([prod, v]) => { produtosPosto[p][prod] = (produtosPosto[p][prod] || 0) + v; produtos[prod] = (produtos[prod] || 0) + v; });
    }));
    const usados = ORDEM.filter(p => produtos[p]);
    return { inicio, fim, titulo, postos, porDia, dias, totalPosto, produtosPosto, qtdPosto, produtos, usados, total, qtd };
}

// ---------- Excel (CSV com ; e vírgula decimal, abre direto no Excel em português) ----------
function baixarCSV(D) {
    const c = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const n = (v) => v ? String(v).replace('.', ',') : '0';
    const cab = ['Dia', 'Dia da semana', 'Posto', 'Fechamentos', 'Total (L)', ...D.usados.map(p => `${rotulosProdutos[p]} (${unidade(p)})`)];
    const linhas = [[`Relatório de vendas - Rede 2B - ${D.titulo} (${dataBR(D.inicio)} a ${dataBR(D.fim)})`], [], cab];
    D.dias.forEach(d => D.postos.forEach(p => {
        const P = D.porDia[d]?.postos?.[p];
        if (!P) return;
        linhas.push([dataBR(d), diaDaSemana(d, false), p, P.qtd, n(P.total), ...D.usados.map(x => n(P.vendas[x]))]);
    }));
    linhas.push([]);
    D.postos.forEach(p => { if (D.totalPosto[p] !== undefined) linhas.push(['TOTAL DO POSTO', '', p, D.qtdPosto[p], n(D.totalPosto[p]), ...D.usados.map(x => n(D.produtosPosto[p][x])) ]); });
    linhas.push(['TOTAL GERAL', '', '', D.qtd, n(D.total), ...D.usados.map(x => n(D.produtos[x]))]);
    linhas.push([], ['ARLA balde é contado em unidades e não entra no total em litros.'], [`Gerado em ${new Date().toLocaleString('pt-BR')} por ${estado.perfil.nome}`]);
    const texto = '﻿' + linhas.map(l => l.map(c).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `vendas-2b-${D.inicio}-a-${D.fim}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- PDF (página de impressão) ----------
function imprimir(D) {
    const multi = D.postos.length > 1;
    const th = (t) => `<th>${t}</th>`;
    const tabelaPostos = multi ? `
        <h3>Por posto</h3>
        <table><thead><tr>${th('Posto')}${th('Fech.')}${th('Total (L)')}${D.usados.map(p => th(rotulosProdutos[p])).join('')}</tr></thead><tbody>
        ${D.postos.filter(p => D.totalPosto[p] !== undefined).sort((a, b) => D.totalPosto[b] - D.totalPosto[a]).map(p => `<tr><td>${esc(p)}</td><td>${D.qtdPosto[p]}</td><td><b>${num(D.totalPosto[p])}</b></td>${D.usados.map(x => `<td>${D.produtosPosto[p][x] ? num(D.produtosPosto[p][x]) : '–'}</td>`).join('')}</tr>`).join('')}
        </tbody></table>
        ${D.postos.filter(p => D.totalPosto[p] === undefined).length ? `<p class="obs">Sem fechamentos no período: ${D.postos.filter(p => D.totalPosto[p] === undefined).map(esc).join(', ')}.</p>` : ''}` : '';
    const colunasDia = multi ? D.postos : D.usados;
    const tabelaDias = `
        <h3>Dia a dia</h3>
        <table><thead><tr>${th('Dia')}${th('Fech.')}${th('Total (L)')}${colunasDia.map(c => th(multi ? esc(c) : rotulosProdutos[c])).join('')}</tr></thead><tbody>
        ${D.dias.map(d => { const X = D.porDia[d]; return `<tr class="${X ? '' : 'vazio'}"><td>${diaDaSemana(d)} ${dataBR(d)}</td><td>${X?.qtd || '–'}</td><td><b>${X ? num(X.total) : '–'}</b></td>${colunasDia.map(c => { const v = multi ? X?.postos?.[c]?.total : X?.produtos?.[c]; return `<td>${v ? num(v) : '–'}</td>`; }).join('')}</tr>`; }).join('')}
        <tr class="total"><td>TOTAL</td><td>${D.qtd}</td><td>${num(D.total)}</td>${colunasDia.map(c => { const v = multi ? D.totalPosto[c] : D.produtos[c]; return `<td>${v ? num(v) : '–'}</td>`; }).join('')}</tr>
        </tbody></table>`;
    const area = document.createElement('div');
    area.id = 'relatorio-impressao';
    area.innerHTML = `
        <header><img src="img/logo-2b.png" alt=""><div><h1>Relatório de vendas</h1><p>${multi ? 'Rede 2B · ' + D.postos.length + ' postos' : esc(D.postos[0])}</p></div>
            <div class="periodo"><b>${esc(D.titulo)}</b><span>${dataBR(D.inicio)} a ${dataBR(D.fim)}</span></div></header>
        <div class="resumo">
            <div><span>Total vendido</span><b>${num(D.total)} L</b></div>
            <div><span>Fechamentos</span><b>${D.qtd}</b></div>
            <div><span>Média por dia</span><b>${num(Math.round(D.total / Math.max(1, D.dias.filter(d => D.porDia[d]).length)))} L</b></div>
        </div>
        <h3>Por produto</h3>
        <table class="centro"><thead><tr>${D.usados.map(p => th(rotulosProdutos[p])).join('')}</tr></thead><tbody><tr>${D.usados.map(p => `<td><b>${num(D.produtos[p])} ${unidade(p)}</b></td>`).join('')}</tr></tbody></table>
        ${tabelaPostos}${tabelaDias}
        <p class="obs">Cada fechamento conta uma vez; correções substituem o fechamento original. ARLA balde é contado em unidades e não entra no total em litros.</p>
        <footer>Gerado em ${new Date().toLocaleString('pt-BR')} por ${esc(estado.perfil.nome)} · Sistema Postos 2B</footer>`;
    document.getElementById('relatorio-impressao')?.remove();
    document.body.appendChild(area);
    const img = area.querySelector('img');
    const ir = () => { window.print(); setTimeout(() => area.remove(), 1000); };
    if (img.complete) setTimeout(ir, 100); else { img.onload = ir; img.onerror = ir; }
}

export function abrirRelatorio() {
    const gestor = estado.perfil.papel === 'gestor' || estado.perfil.papel === 'admin';
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo janela-dinamica';
    fundo.innerHTML = `
        <div class="janela janela-pequena janela-relatorio" role="dialog" aria-modal="true">
            <h3>Relatório de vendas</h3>
            <div><label class="rotulo" for="rel-periodo">Período</label>
                <select id="rel-periodo" class="campo">${opcoesPeriodo().map(o => `<option value="${o.valor}" ${o.valor.startsWith('mes:') && o.texto.includes('atual') ? 'selected' : ''}>${o.texto}</option>`).join('')}</select></div>
            ${gestor && estado.postos.length > 1 ? `<div><label class="rotulo" for="rel-posto">Postos</label>
                <select id="rel-posto" class="campo"><option value="todos">Todos os ${estado.postos.length} postos</option>${estado.postos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></div>` : ''}
            <p class="texto-suave" id="rel-datas"></p>
            <div class="rel-botoes">
                <button type="button" class="botao botao-sucesso" data-rel="excel">Baixar planilha (Excel)</button>
                <button type="button" class="botao botao-primario" data-rel="pdf">Imprimir / salvar PDF</button>
            </div>
            <div class="acoes"><button type="button" class="botao botao-claro" data-rel="fechar">Fechar</button></div>
        </div>`;
    document.body.appendChild(fundo);
    const periodo = fundo.querySelector('#rel-periodo');
    const atualizarDatas = () => { const { inicio, fim } = intervalo(periodo.value); fundo.querySelector('#rel-datas').textContent = `De ${dataBR(inicio)} a ${dataBR(fim)}.`; };
    periodo.onchange = atualizarDatas; atualizarDatas();
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', async (e) => {
        if (e.target === fundo || e.target.closest('[data-rel="fechar"]')) return fechar();
        const botao = e.target.closest('[data-rel="excel"], [data-rel="pdf"]');
        if (!botao) return;
        const posto = fundo.querySelector('#rel-posto')?.value || (gestor ? 'todos' : estado.postoAtivo);
        await comEspera(botao, async () => {
            try {
                const D = await montarDados(periodo.value, posto);
                if (!D.qtd) return aviso('Nenhum fechamento neste período.', 'info');
                registrarLog('relatorio', `Exportou relatório de vendas (${botao.dataset.rel === 'pdf' ? 'PDF' : 'Excel'}): ${D.titulo}, ${posto === 'todos' ? 'todos os postos' : posto}`);
                if (botao.dataset.rel === 'excel') { baixarCSV(D); aviso('Planilha baixada!'); }
                else { fechar(); imprimir(D); }
            } catch (err) { console.error(err); aviso('Não foi possível gerar o relatório.', 'erro'); }
        });
    });
}
