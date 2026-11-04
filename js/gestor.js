// Painel do gestor
import { rotulosProdutos, slugPostos, unidade } from "./config.js";
import { estado, escutarDados, escutarEmprestimos, buscarHistorico, analisarHistorico } from "./dados.js";
import { cardPosto, tanquesBaixos } from "./cards.js";
import { montarFormEmprestimo, desenharEmprestimosGestor } from "./emprestimos.js";
import { $, esc, num, hojeISO, limitesDoDia, contarAte } from "./util.js";
import { icone } from "./icones.js";
import { iniciarLog } from "./log.js";

export function abrirGestor() {
    $('tela-gestor').classList.remove('oculto');
    const admin = estado.perfil.papel === 'admin';
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
    atualizarVendasHoje();
    // registro de atividades: só para o administrador
    if (admin) { $('secao-log').classList.remove('oculto'); iniciarLog(); }
}

const nomeBonito = (n) => String(n).toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());

// Soma os fechamentos de turno enviados hoje (cada fechamento conta uma vez só)
export async function atualizarVendasHoje() {
    const geral = $('vendas-geral'), porPosto = $('vendas-postos');
    geral.innerHTML = '<div class="esqueleto esqueleto-grande"></div><div class="esqueleto"></div>';
    porPosto.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';

    const hoje = hojeISO();
    const [inicio, fim] = limitesDoDia(hoje);
    const totais = {};
    let totalRede = 0;
    const comVenda = [], semVenda = [];

    for (const posto of estado.postos) {
        const vendas = {};
        let totalPosto = 0, ultimo = null, qtd = 0, nome = '';
        try {
            const { validos } = analisarHistorico(await buscarHistorico(posto, inicio, fim), hoje);
            qtd = validos.length;
            validos.forEach(({ ts, reg }) => {
                ultimo = ts; nome = reg.responsavelFechamento || '';
                Object.entries(reg.valores || {}).forEach(([p, v]) => {
                    if (!rotulosProdutos[p]) return;
                    const n = Number(v?.vendido) || 0;
                    if (n <= 0) return;
                    vendas[p] = (vendas[p] || 0) + n;
                    totais[p] = (totais[p] || 0) + n;
                    if (p !== 'arla_b') { totalPosto += n; totalRede += n; }
                });
            });
        } catch (e) { console.error('Erro ao buscar vendas', e); }
        (qtd ? comVenda : semVenda).push({ posto, totalPosto, vendas, ultimo, qtd, nome });
    }

    $('gestor-total-resumo').textContent = totalRede ? `${num(totalRede)} L hoje` : 'Sem vendas ainda';

    if (!comVenda.length) {
        geral.innerHTML = '<div class="vazio-lista">As vendas do dia aparecem aqui assim que as pistas enviarem os fechamentos de turno.</div>';
    } else {
        geral.innerHTML = `
            <div class="kpi-total"><span>Total da rede hoje</span><strong><span id="kpi-total-valor">0</span> L</strong>
                <small>${comVenda.reduce((s, x) => s + x.qtd, 0)} fechamento(s) de ${comVenda.length} posto(s)</small></div>
            <div class="kpi-produtos">${ordenarProdutos(totais).map(([p, n], i) =>
                `<div class="kpi-produto entrar" style="--i:${i}"><span>${rotulosProdutos[p]}</span><strong>${num(n)} ${unidade(p)}</strong></div>`).join('')}</div>`;
        contarAte($('kpi-total-valor'), totalRede);
    }

    const hora = (ts) => new Date(Number(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    porPosto.innerHTML = comVenda.sort((a, b) => b.totalPosto - a.totalPosto).map(({ posto, totalPosto, vendas, ultimo, qtd, nome }, i) => {
        const itens = ordenarProdutos(vendas);
        const maior = Math.max(1, ...itens.filter(([p]) => p !== 'arla_b').map(([, n]) => n));
        return `<article class="venda-posto entrar" style="--i:${i}">
            <header class="venda-posto-topo">
                <div><strong>${esc(posto)}</strong><small>${qtd} fechamento${qtd > 1 ? 's' : ''} · último às ${hora(ultimo)}${nome ? ' · ' + esc(nome) : ''}</small></div>
                <span class="venda-posto-total">${num(totalPosto)} L</span>
            </header>
            <div class="venda-produtos">${itens.map(([p, n]) => `
                <div class="venda-produto ${p.startsWith('arla') ? 'arla' : ''}">
                    <div class="venda-produto-linha"><span>${rotulosProdutos[p]}</span><b>${num(n)} ${unidade(p)}</b></div>
                    ${p === 'arla_b' ? '' : `<div class="barra barra-fina"><div class="nivel-verde" style="--pct:${Math.round((n / maior) * 100)}%"></div></div>`}
                </div>`).join('')}
            </div>
        </article>`;
    }).join('') + (semVenda.length ? `
        <div class="sem-fechamento">
            <span>${icone('relogio')} Sem fechamento hoje:</span>
            ${semVenda.map(({ posto }) => `<span class="chip chip-cinza">${esc(posto)}</span>`).join('')}
        </div>` : '');
}

// Combustíveis primeiro (do maior para o menor), ARLA no fim
function ordenarProdutos(obj) {
    return Object.entries(obj).sort((a, b) => {
        const arlaA = a[0].startsWith('arla'), arlaB = b[0].startsWith('arla');
        if (arlaA !== arlaB) return arlaA ? 1 : -1;
        return b[1] - a[1];
    });
}
