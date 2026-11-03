// Tela do gerente de posto
import { configPostos, rotulosProdutos, getProdutosPermitidos } from "./config.js";
import { estado, salvarPosto, escutarDados, escutarEmprestimos } from "./dados.js";
import { cardPosto } from "./cards.js";
import { montarFormEmprestimo, desenharEmprestimosGerente } from "./emprestimos.js";
import { $, num, agoraFormatado, aviso, comEspera } from "./util.js";

export function abrirGerente() {
    const posto = estado.postoAtivo;
    $('tela-gerente').classList.remove('oculto');
    $('gerente-titulo').textContent = posto;

    const produtos = getProdutosPermitidos(posto);
    $('campos-rapidos').innerHTML = produtos.map(p => {
        const max = configPostos[posto][p];
        const info = p === 'arla_b' ? 'unidades' : (max ? `máx. ${num(max)} L` : 'litros');
        return `<div><label class="rotulo" for="rapido-${p}">${rotulosProdutos[p]} <small>${info}</small></label>
            <input type="number" inputmode="decimal" step="any" id="rapido-${p}" class="campo" placeholder="Volume atual"></div>`;
    }).join('');

    $('form-rapido').onsubmit = async (e) => {
        e.preventDefault();
        const valores = {};
        produtos.forEach(p => { valores[p] = { regua: $(`rapido-${p}`).value }; });
        await comEspera(e.submitter, async () => {
            try {
                await salvarPosto({ dataFormatada: agoraFormatado(), tipoEnvio: `Atualização Gerente (${posto})`, valores });
                aviso('Atualização de estoque salva!');
                $('form-rapido').reset();
            } catch (err) { aviso('Não foi salvo: ' + err.message, 'erro'); }
        });
    };

    montarFormEmprestimo('form-emprestimo-gerente');
    estado.aoMudarDados = () => { $('gerente-card').innerHTML = cardPosto(posto, estado.dados[posto]); };
    estado.aoMudarEmprestimos = desenharEmprestimosGerente;
    estado.aoMudarDados();
    desenharEmprestimosGerente();
    escutarDados();
    escutarEmprestimos();
}
