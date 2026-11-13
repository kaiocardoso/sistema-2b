// Tela do gerente de posto
import { configPostos, rotulosProdutos, getProdutosPermitidos } from "./config.js";
import { estado, salvarPosto, escutarDados, escutarEmprestimos, registrarLog } from "./dados.js";
import { cardPosto } from "./cards.js";
import { montarFormEmprestimo, desenharEmprestimosGerente } from "./emprestimos.js";
import { $, num, temValor, agoraFormatado, aviso, comEspera } from "./util.js";
import { abrirAfericoesGerente } from "./afericoes.js";

export function abrirGerente() {
    const posto = estado.postoAtivo;
    $('tela-gerente').classList.remove('oculto');
    $('gerente-titulo').textContent = posto;

    const produtos = getProdutosPermitidos(posto);
    $('campos-rapidos').innerHTML = produtos.map(p => {
        const max = configPostos[posto][p];
        const info = p === 'arla_b' ? 'unidades' : (max ? `máx. ${num(max)} L` : 'litros');
        return `<div class="campo-grupo"><label class="rotulo" for="rapido-${p}">${rotulosProdutos[p]} <small>${info}</small></label>
            <input type="number" inputmode="decimal" step="any" id="rapido-${p}" class="campo" placeholder="Volume atual">
            <small class="dica" id="rapido-${p}-ant"></small></div>`;
    }).join('');

    $('form-rapido').onsubmit = async (e) => {
        e.preventDefault();
        const valores = {};
        produtos.forEach(p => { valores[p] = { regua: $(`rapido-${p}`).value }; });
        await comEspera(e.submitter, async () => {
            try {
                await salvarPosto({ dataFormatada: agoraFormatado(), tipoEnvio: `Atualização Gerente (${posto})`, valores }, 'atualizacao');
                registrarLog('atualizacao_estoque', 'Atualização rápida de estoque: ' + (produtos.filter(p => valores[p].regua !== '').map(p => `${rotulosProdutos[p]} ${num(Number(valores[p].regua))}`).join(', ') || 'sem valores'));
                aviso('Atualização de estoque salva!');
                $('form-rapido').reset();
            } catch (err) { aviso('Não foi salvo: ' + err.message, 'erro'); }
        });
    };

    montarFormEmprestimo('form-emprestimo-gerente');
    estado.aoMudarDados = () => {
        const info = estado.dados[posto];
        $('gerente-card').innerHTML = cardPosto(posto, info, { comEncerrantesAbertos: true });
        produtos.forEach(p => {
            const r = info?.valores?.[p]?.regua, el = $(`rapido-${p}-ant`);
            if (el) el.textContent = temValor(r) ? `Atual: ${num(Number(r))}` : '';
        });
    };
    estado.aoMudarEmprestimos = desenharEmprestimosGerente;
    estado.aoMudarDados();
    desenharEmprestimosGerente();
    escutarDados();
    escutarEmprestimos();
    abrirAfericoesGerente();
}
