// Painel do gestor
import { rotulosProdutos } from "./config.js";
import { estado, escutarDados, escutarEmprestimos, buscarHistorico } from "./dados.js";
import { cardPosto } from "./cards.js";
import { montarFormEmprestimo, desenharEmprestimosGestor } from "./emprestimos.js";
import { $, esc, num, hojeISO, limitesDoDia } from "./util.js";

export function abrirGestor() {
    $('tela-gestor').classList.remove('oculto');
    $('gestor-titulo').textContent = estado.perfil.nome;
    montarFormEmprestimo('form-emprestimo-gestor');

    const desenharPostos = () => { $('gestor-postos').innerHTML = estado.postos.map(p => cardPosto(p, estado.dados[p])).join(''); };
    estado.aoMudarDados = desenharPostos;
    estado.aoMudarEmprestimos = desenharEmprestimosGestor;
    desenharPostos();
    desenharEmprestimosGestor();
    escutarDados();
    escutarEmprestimos();
    atualizarVendasHoje();
}

// Soma os fechamentos de turno enviados hoje
export async function atualizarVendasHoje() {
    const geral = $('vendas-geral'), porPosto = $('vendas-postos');
    geral.innerHTML = '<p class="texto-carregando">Calculando as vendas de hoje...</p>';
    porPosto.innerHTML = '';

    const [inicio, fim] = limitesDoDia(hojeISO());
    const totais = {};
    let totalRede = 0;
    const blocos = [];

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

        blocos.push(totalPosto > 0
            ? `<div class="venda-posto"><div class="venda-posto-topo"><span>${esc(posto)}</span><b>${num(totalPosto)} L</b></div>
                ${Object.entries(vendas).map(([p, n]) => `<div class="venda-posto-linha"><span>${rotulosProdutos[p]}</span><strong>${num(n)} L</strong></div>`).join('')}</div>`
            : `<div class="venda-posto vazio"><div class="venda-posto-topo"><span>${esc(posto)}</span></div><p class="texto-suave-claro">Nenhum fechamento hoje ainda.</p></div>`);
    }

    geral.innerHTML = Object.keys(totais).length === 0
        ? '<p class="texto-suave-claro">As vendas do dia aparecem aqui assim que as pistas enviarem os fechamentos de turno.</p>'
        : `<div class="venda-total"><span>Total da rede hoje</span><strong>${num(totalRede)} L</strong></div>` +
          Object.entries(totais).map(([p, n]) => `<div class="venda-produto"><span>${rotulosProdutos[p]}</span><strong>${num(n)} L</strong></div>`).join('');
    porPosto.innerHTML = blocos.join('');
}
