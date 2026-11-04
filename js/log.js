// Tela do registro de atividades (só para gestores com acesso a todos os postos)
import { buscarLog } from "./dados.js";
import { $, esc, num, temValor, hojeISO, limitesDoDia, dataBR } from "./util.js";
import { icone } from "./icones.js";

const GRUPOS = {
    emprestimo_criado: 'emprestimos', emprestimo_devolucao: 'emprestimos', emprestimo_quitado: 'emprestimos', emprestimo_excluido: 'emprestimos',
    fechamento: 'fechamentos', correcao: 'fechamentos',
    encerrantes: 'estoque', atualizacao_estoque: 'estoque',
    login: 'acessos'
};
const ICONES = {
    emprestimo_criado: 'mais', emprestimo_devolucao: 'troca', emprestimo_quitado: 'check', emprestimo_excluido: 'alerta',
    fechamento: 'check', correcao: 'lapis', encerrantes: 'relogio', atualizacao_estoque: 'raio', login: 'usuario'
};
const PAPEIS = { gestor: 'Gestor', gerente: 'Gerente', caixa: 'Caixa' };

let registros = [];

export function iniciarLog() {
    $('log-data').max = hojeISO();
    $('log-data').value = hojeISO();
    $('log-data').onchange = carregarLog;
    $('log-tipo').onchange = desenhar;
    carregarLog();
}

export async function carregarLog() {
    const lista = $('log-lista');
    lista.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
    try {
        const [inicio, fim] = limitesDoDia($('log-data').value || hojeISO());
        registros = await buscarLog(inicio, fim);
        desenhar();
    } catch (e) {
        console.error(e);
        lista.innerHTML = '<div class="vazio-lista">Não foi possível carregar o registro de atividades.</div>';
    }
}

function copiaEmprestimo(c) {
    const linha = (rotulo, valor) => temValor(valor) ? `<div class="log-copia-linha"><span>${rotulo}</span><b>${esc(valor)}</b></div>` : '';
    return `<details class="log-copia"><summary>Ver dados do empréstimo excluído</summary>
        ${linha('Quem emprestou', c.origem)}${linha('Quem recebeu', c.destino)}${linha('Combustível', c.produto)}
        ${linha('Litragem', temValor(c.volume) ? num(Number(c.volume)) + ' L' : '')}${linha('Já devolvido', temValor(c.devolvido) ? num(Number(c.devolvido)) + ' L' : '')}
        ${linha('Situação', c.status)}${linha('Data', dataBR(c.data))}${linha('Criado por', c.criadoPor)}${linha('Última alteração', c.atualizadoPor)}
    </details>`;
}

function desenhar() {
    const filtro = $('log-tipo').value;
    const itens = registros.filter(r => filtro === 'tudo' || GRUPOS[r.acao] === filtro);
    $('log-qtd').textContent = `${itens.length} registro${itens.length === 1 ? '' : 's'}`;
    $('log-lista').innerHTML = itens.length ? itens.map(r => `
        <div class="log-item log-${GRUPOS[r.acao] || 'outros'} ${r.acao === 'emprestimo_excluido' ? 'log-perigo' : ''}">
            <span class="log-icone">${icone(ICONES[r.acao] || 'relogio')}</span>
            <div class="log-corpo">
                <div class="log-topo">
                    <b>${esc(r.nome || r.email)}</b>
                    ${r.papel ? `<span class="chip chip-cinza">${esc(PAPEIS[r.papel] || r.papel)}</span>` : ''}
                    <span class="log-hora">${new Date(Number(r.quando)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                <p>${esc(r.detalhe)}</p>
                ${r.copia ? copiaEmprestimo(r.copia) : ''}
            </div>
        </div>`).join('')
        : '<div class="vazio-lista">Nenhuma atividade registrada neste dia.</div>';
}
