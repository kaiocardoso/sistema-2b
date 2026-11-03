// Painel do gestor
import { rotulosProdutos, slugPostos } from "./config.js";
import { estado, escutarDados, escutarEmprestimos, buscarHistorico } from "./dados.js";
import { cardPosto, tanquesBaixos } from "./cards.js";
import { montarFormEmprestimo, desenharEmprestimosGestor } from "./emprestimos.js";
import { $, esc, num, hojeISO, limitesDoDia, contarAte } from "./util.js";
import { icone } from "./icones.js";

export function abrirGestor() {
    $('tela-gestor').classList.remove('oculto');
    $('gestor-titulo').textContent = nomeBonito(estado.perfil.nome);
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
    atualizarVendasHoje();
}

const nomeBonito = (n) => String(n).toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());

// Soma os fechamentos de turno enviados hoje
export async function atualizarVendasHoje() {
    const geral = $('vendas-geral'), porPosto = $('vendas-postos');
    geral.innerHTML = '<div class="esqueleto esqueleto-grande"></div><div class="esqueleto"></div><div class="esqueleto"></div>';
    porPosto.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';

    const [inicio, fim] = limitesDoDia(hojeISO());
    const totais = {};
    let totalRede = 0;
    const linhas = [];

    for (const posto of estado.postos) {
        const vendas = {};
        let totalPosto = 0;
        try {
            const hist = await buscarHistorico(posto, inicio, fim);
            Object.values(hist).forEach(reg => {
                if (reg.tipoEnvio !== "Fechamento de Turno") return;
                Object.entries(reg.valores || {}).forEach(([p, v]) => {
                    if (!rotulosProdutos[p]) return;
                    const n = Number(v?.vendido) || 0;
                    if (n > 0) { vendas[p] = (vendas[p] || 0) + n; totais[p] = (totais[p] || 0) + n; totalPosto += n; totalRede += n; }
                });
            });
        } catch (e) { console.error('Erro ao buscar vendas', e); }
        linhas.push({ posto, totalPosto, vendas });
    }

    const resumo = $('gestor-total-resumo');
    resumo.textContent = totalRede ? `${num(totalRede)} L hoje` : 'Sem vendas ainda';

    if (!totalRede) {
        geral.innerHTML = '<div class="vazio-lista">As vendas do dia aparecem aqui assim que as pistas enviarem os fechamentos de turno.</div>';
    } else {
        geral.innerHTML = `
            <div class="kpi-total"><span>Total da rede hoje</span><strong><span id="kpi-total-valor">0</span> L</strong></div>
            <div class="kpi-produtos">${Object.entries(totais).sort((a, b) => b[1] - a[1]).map(([p, n], i) =>
                `<div class="kpi-produto entrar" style="--i:${i}"><span>${rotulosProdutos[p]}</span><strong>${num(n)} L</strong></div>`).join('')}</div>`;
        contarAte($('kpi-total-valor'), totalRede);
    }

    const maior = Math.max(1, ...linhas.map(l => l.totalPosto));
    porPosto.innerHTML = linhas.sort((a, b) => b.totalPosto - a.totalPosto).map(({ posto, totalPosto, vendas }, i) => `
        <div class="venda-posto ${totalPosto ? '' : 'vazio'} entrar" style="--i:${i}">
            <div class="venda-posto-linha">
                <strong>${esc(posto)}</strong>
                <span>${totalPosto ? num(totalPosto) + ' L' : 'sem fechamento hoje'}</span>
            </div>
            <div class="barra barra-fina"><div class="nivel-verde" style="--pct:${Math.round((totalPosto / maior) * 100)}%"></div></div>
            ${totalPosto ? `<p class="venda-detalhe">${Object.entries(vendas).map(([p, n]) => `${rotulosProdutos[p]}: <b>${num(n)} L</b>`).join(' · ')}</p>` : ''}
        </div>`).join('');
}
