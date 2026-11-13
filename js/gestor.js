// Painel do gestor
import { rotulosProdutos, slugPostos, unidade } from "./config.js";
import { estado, escutarDados, escutarEmprestimos } from "./dados.js";
import { cardPosto, tanquesBaixos } from "./cards.js";
import { montarFormEmprestimo, desenharEmprestimosGestor } from "./emprestimos.js";
import { $, esc, num, hojeISO, somarDias, dataBR, diaDaSemana, contarAte } from "./util.js";
import { vendasDoPeriodo } from "./vendas.js";
import { icone } from "./icones.js";
import { iniciarLog } from "./log.js";
import { abrirHistoricoPosto } from "./historico-posto.js";
import { carregarAfericoesGestor } from "./afericoes.js";
import { carregarManutencaoGestor } from "./manutencao.js";

export function abrirGestor() {
    $('tela-gestor').classList.remove('oculto');
    const admin = estado.perfil.papel === 'admin';
    iniciarAbas();
    $('gestor-titulo').textContent = admin ? 'Administrador' : nomeBonito(estado.perfil.nome);
    $('chip-admin').classList.toggle('oculto', !admin);
    montarFormEmprestimo('form-emprestimo-gestor');

    // Um espaço fixo por posto: quando um posto muda, só o card dele é redesenhado
    $('gestor-postos').innerHTML = estado.postos.map((p, i) =>
        `<div class="posto-espaco entrar" style="--i:${i}" id="espaco-${slugPostos[p] || i}"></div>`).join('');
    const desenharPosto = (p) => {
        const el = $(`espaco-${slugPostos[p]}`);
        if (el) el.innerHTML = cardPosto(p, estado.dados[p]);
        const baixos = estado.postos.reduce((s, q) => s + tanquesBaixos(q, estado.dados[q]), 0);
        const alerta = $('gestor-alerta');
        alerta.innerHTML = baixos ? `${icone('alerta')} ${baixos} tanque${baixos > 1 ? 's' : ''} baixo${baixos > 1 ? 's' : ''}` : `${estado.postos.length} postos`;
        alerta.className = `chip secao-resumo ${baixos ? 'chip-vermelho' : 'chip-cinza'}`;
    };
    estado.postos.forEach(desenharPosto);
    estado.aoMudarDados = desenharPosto;
    estado.aoMudarEmprestimos = desenharEmprestimosGestor;
    desenharEmprestimosGestor();
    escutarDados();
    escutarEmprestimos();
    iniciarVendas();
    atualizarVendasHoje();
    carregarAfericoesGestor();
    carregarManutencaoGestor();
    // registro de atividades: só para o administrador
    if (admin) { $('secao-log').classList.remove('oculto'); iniciarLog(); }
}

const nomeBonito = (n) => String(n).toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());

// ---------- Abas do painel ----------
function mostrarAba(aba) {
    document.querySelectorAll('[data-aba-gestor]').forEach(b => b.classList.toggle('ativa', b.dataset.abaGestor === aba));
    document.querySelectorAll('#tela-gestor [data-aba]').forEach(el => el.classList.toggle('fora-aba', el.dataset.aba !== aba));
    try { localStorage.setItem('postos2b:aba-gestor', aba); } catch (e) { /* sem armazenamento */ }
}
function iniciarAbas() {
    document.querySelectorAll('[data-aba-gestor]').forEach(b => b.onclick = () => { mostrarAba(b.dataset.abaGestor); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    let aba = 'painel';
    try { aba = localStorage.getItem('postos2b:aba-gestor') || 'painel'; } catch (e) { /* */ }
    mostrarAba(aba === 'campo' ? 'campo' : 'painel');
}

// ---------- Vendas do dia escolhido + últimos dias ----------
const hora = (ts) => new Date(Number(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaCurto = (iso) => dataBR(iso).slice(0, 5);

export function iniciarVendas() {
    const campo = $('vendas-dia');
    campo.max = hojeISO(); campo.value = hojeISO();
    campo.onchange = () => desenharDia(campo.value || hojeISO());
    $('historico-vendas-dias').onchange = carregarHistoricoVendas;
    $('historico-vendas').onclick = (e) => {
        const alvo = e.target.closest('[data-dia]');
        if (!alvo) return;
        campo.value = alvo.dataset.dia;
        desenharDia(alvo.dataset.dia);
        $('vendas-dia').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    // tocar no card de um posto abre o histórico de vendas dele
    $('vendas-postos').onclick = (e) => {
        const card = e.target.closest('[data-posto]');
        if (card) abrirHistoricoPosto(card.dataset.posto);
    };
    $('vendas-postos').onkeydown = (e) => {
        const card = e.target.closest('[data-posto]');
        if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirHistoricoPosto(card.dataset.posto); }
    };
}

// Botão "Atualizar": recarrega o dia escolhido e os últimos dias
export async function atualizarVendasHoje() {
    await Promise.all([desenharDia($('vendas-dia').value || hojeISO()), carregarHistoricoVendas()]);
}

async function desenharDia(iso) {
    const geral = $('vendas-geral'), porPosto = $('vendas-postos');
    geral.innerHTML = '<div class="esqueleto esqueleto-grande"></div><div class="esqueleto"></div>';
    porPosto.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';

    const dia = (await vendasDoPeriodo(iso, iso))[iso] || { total: 0, qtd: 0, postos: {}, produtos: {} };
    const ehHoje = iso === hojeISO();
    const nomeDia = ehHoje ? 'hoje' : `${diaDaSemana(iso)} ${dataBR(iso)}`;
    $('gestor-total-resumo').textContent = dia.total ? `${num(dia.total)} L ${ehHoje ? 'hoje' : 'em ' + diaCurto(iso)}` : (ehHoje ? 'Sem vendas ainda' : 'Sem vendas');

    const comVenda = estado.postos.filter(p => dia.postos[p]).map(p => ({ posto: p, ...dia.postos[p] }));
    const semVenda = estado.postos.filter(p => !dia.postos[p]);

    if (!comVenda.length) {
        geral.innerHTML = `<div class="vazio-lista">${ehHoje ? 'As vendas do dia aparecem aqui assim que as pistas enviarem os fechamentos de turno.' : `Nenhum fechamento com vendas de ${dataBR(iso)}.`}</div>`;
    } else {
        geral.innerHTML = `
            <div class="kpi-total"><span>Total da rede ${ehHoje ? 'hoje' : 'em ' + dataBR(iso)}</span><strong><span id="kpi-total-valor">0</span> L</strong>
                <small>${dia.qtd} fechamento(s) de ${comVenda.length} posto(s)</small></div>
            <div class="kpi-produtos">${ordenarProdutos(dia.produtos).map(([p, n], i) =>
                `<div class="kpi-produto entrar" style="--i:${i}"><span>${rotulosProdutos[p]}</span><strong>${num(n)} ${unidade(p)}</strong></div>`).join('')}</div>`;
        contarAte($('kpi-total-valor'), dia.total);
    }

    porPosto.innerHTML = comVenda.sort((a, b) => b.total - a.total).map(({ posto, total, vendas, ultimo, qtd, nome }, i) => {
        const itens = ordenarProdutos(vendas);
        const maior = Math.max(1, ...itens.filter(([p]) => p !== 'arla_b').map(([, n]) => n));
        return `<article class="venda-posto clicavel entrar" style="--i:${i}" data-posto="${esc(posto)}" tabindex="0" role="button" aria-label="Ver histórico de vendas do ${esc(posto)}">
            <header class="venda-posto-topo">
                <div><strong>${esc(posto)}</strong><small>${qtd} fechamento${qtd > 1 ? 's' : ''} · último às ${hora(ultimo)}${nome ? ' · ' + esc(nome) : ''}</small></div>
                <span class="venda-posto-total">${num(total)} L</span>
            </header>
            <div class="venda-produtos">${itens.map(([p, n]) => `
                <div class="venda-produto ${p.startsWith('arla') ? 'arla' : ''}">
                    <div class="venda-produto-linha"><span>${rotulosProdutos[p]}</span><b>${num(n)} ${unidade(p)}</b></div>
                    ${p === 'arla_b' ? '' : `<div class="barra barra-fina"><div class="nivel-verde" style="--pct:${Math.round((n / maior) * 100)}%"></div></div>`}
                </div>`).join('')}
            </div>
            <footer class="venda-posto-rodape">${icone('grafico')} Ver histórico do posto ${icone('flecha')}</footer>
        </article>`;
    }).join('') + (semVenda.length ? `
        <div class="sem-fechamento">
            <span>${icone('relogio')} Sem fechamento ${ehHoje ? 'hoje' : 'neste dia'}:</span>
            ${semVenda.map(p => `<button type="button" class="chip chip-cinza chip-botao" data-posto="${esc(p)}" title="Ver histórico do ${esc(p)}">${esc(p)}</button>`).join('')}
        </div>` : '');
    $('vendas-dia-nome').textContent = nomeDia;
}

async function carregarHistoricoVendas() {
    const caixa = $('historico-vendas');
    const n = Number($('historico-vendas-dias').value) || 7;
    const fim = hojeISO(), inicio = somarDias(fim, -(n - 1));
    caixa.innerHTML = '<div class="esqueleto esqueleto-grande"></div>';
    const porDia = await vendasDoPeriodo(inicio, fim);
    const dias = Array.from({ length: n }, (_, i) => somarDias(inicio, i));
    const totais = dias.map(d => porDia[d]?.total || 0);
    const soma = totais.reduce((a, b) => a + b, 0);
    const comVenda = totais.filter(t => t > 0).length;
    const maior = Math.max(1, ...totais);
    const melhor = dias[totais.indexOf(Math.max(...totais))];

    caixa.innerHTML = `
        <div class="historico-resumo">
            <div><span>Total em ${n} dias</span><strong>${num(soma)} L</strong></div>
            <div><span>Média por dia</span><strong>${num(Math.round(soma / Math.max(1, comVenda)))} L</strong></div>
            <div><span>Melhor dia</span><strong>${soma ? `${diaCurto(melhor)} · ${num(Math.max(...totais))} L` : '–'}</strong></div>
        </div>
        <div class="grafico-dias ${n > 15 ? 'grafico-largo' : ''}" role="img" aria-label="Vendas por dia">
            ${dias.map((d, i) => `
                <button type="button" class="grafico-coluna ${d === fim ? 'hoje' : ''}" data-dia="${d}" title="${diaDaSemana(d, false)} ${dataBR(d)}: ${num(totais[i])} L">
                    <span class="grafico-valor">${totais[i] ? (totais[i] >= 1000 ? (totais[i] / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : num(totais[i])) : ''}</span>
                    <span class="grafico-barra"><span style="--pct:${Math.round((totais[i] / maior) * 100)}%"></span></span>
                    <span class="grafico-dia">${diaDaSemana(d)}<br>${diaCurto(d)}</span>
                </button>`).join('')}
        </div>
        <div class="historico-dias">${dias.slice().reverse().map(d => {
            const D = porDia[d];
            return `<button type="button" class="historico-dia ${D ? '' : 'vazio'}" data-dia="${d}">
                <span class="historico-dia-data"><b>${diaDaSemana(d)} ${dataBR(d)}</b>${d === fim ? ' <span class="chip chip-verde">hoje</span>' : ''}</span>
                <span class="historico-dia-info">${D ? `${D.qtd} fechamento${D.qtd > 1 ? 's' : ''} · ${Object.keys(D.postos).length} posto${Object.keys(D.postos).length > 1 ? 's' : ''}` : 'sem fechamentos'}</span>
                <span class="historico-dia-total">${D ? num(D.total) + ' L' : '–'}</span>
            </button>`;
        }).join('')}</div>
        <p class="texto-suave historico-dica">Toque num dia para ver os detalhes por posto.</p>`;
    caixa.querySelectorAll('.grafico-dias').forEach(g => { g.scrollLeft = g.scrollWidth; });  // abre nos dias mais recentes
}

// Combustíveis primeiro (do maior para o menor), ARLA no fim
function ordenarProdutos(obj) {
    return Object.entries(obj).sort((a, b) => {
        const arlaA = a[0].startsWith('arla'), arlaB = b[0].startsWith('arla');
        if (arlaA !== arlaB) return arlaA ? 1 : -1;
        return b[1] - a[1];
    });
}
