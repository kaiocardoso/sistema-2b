// Empréstimos de combustível entre postos (gestor e gerente)
import { configPostos, produtosEmprestimo } from "./config.js";
import { estado, criarEmprestimo, atualizarDevolucao, excluirEmprestimo, responsavel } from "./dados.js";
import { $, esc, num, dataBR, hojeISO, aviso, comEspera, pedirNumero, confirmar } from "./util.js";

// Monta o formulário de novo empréstimo dentro de um <form>
export function montarFormEmprestimo(idForm) {
    const form = $(idForm);
    const opcoesPostos = Object.keys(configPostos).map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    form.innerHTML = `
        <div><label class="rotulo">Data</label><input type="date" name="data" class="campo" required value="${hojeISO()}"></div>
        <div><label class="rotulo">Origem (saiu de)</label><select name="origem" class="campo" required><option value="">Selecione...</option>${opcoesPostos}</select></div>
        <div><label class="rotulo">Destino (foi para)</label><select name="destino" class="campo" required><option value="">Selecione...</option>${opcoesPostos}</select></div>
        <div><label class="rotulo">Combustível</label><select name="produto" class="campo" required>${produtosEmprestimo.map(p => `<option>${p}</option>`).join('')}</select></div>
        <div><label class="rotulo">Litragem (L)</label><input type="number" inputmode="decimal" step="any" min="1" name="volume" class="campo" placeholder="Ex: 5000" required></div>
        <button type="submit" class="botao botao-vermelho">Registrar</button>`;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const dados = { data: f.get('data'), origem: f.get('origem'), destino: f.get('destino'), produto: f.get('produto'), volume: Number(f.get('volume')) };
        if (dados.origem === dados.destino) return aviso('A origem e o destino não podem ser o mesmo posto.', 'erro');
        if (!estado.postos.includes(dados.origem) && !estado.postos.includes(dados.destino)) return aviso('Você só pode registrar empréstimos que envolvam o(s) seu(s) posto(s).', 'erro');
        if (!(dados.volume > 0)) return aviso('Informe uma litragem válida.', 'erro');
        await comEspera(e.submitter, async () => {
            try {
                await criarEmprestimo(dados);
                aviso('Empréstimo registrado!');
                form.volume.value = '';
            } catch (err) { aviso('Erro: ' + err.message, 'erro'); }
        });
    };
}

const idsOrdenados = () => Object.keys(estado.emprestimos).filter(id => /^[0-9]+$/.test(id)).sort((a, b) => b - a);

function cartaoEmprestimo(id, emp, acoes) {
    const devolvido = Number(emp.devolvido) || 0;
    const volume = Number(emp.volume) || 0;
    const auditoria = emp.atualizadoPor || emp.criadoPor || 'Sistema';
    return `<div class="emprestimo">
        <div>
            <div class="emprestimo-topo"><span>${esc(dataBR(emp.data))}</span><span class="etiqueta etiqueta-azul">${esc(emp.produto)}</span></div>
            <div class="emprestimo-rota"><span class="origem">${esc(emp.origem)}</span> → <span class="destino">${esc(emp.destino)}</span></div>
        </div>
        <div class="emprestimo-numeros">
            <div><span>Emprestado</span><strong>${num(volume)} L</strong></div>
            <div><span>Devolvido</span><strong>${num(devolvido)} L</strong></div>
            <div class="falta"><span>Falta</span><strong>${num(volume - devolvido)} L</strong></div>
        </div>
        ${acoes ? `<div class="emprestimo-acoes">${acoes}</div>` : ''}
        <div class="emprestimo-auditoria">${esc(auditoria)}</div>
    </div>`;
}

const botoesPendente = (id, podeExcluir) => `
    <button type="button" class="botao botao-claro botao-mini" data-emp-acao="parcial" data-id="${id}">Devolução parcial</button>
    <button type="button" class="botao botao-verde botao-mini" data-emp-acao="quitar" data-id="${id}">Quitar</button>
    ${podeExcluir ? `<button type="button" class="botao botao-texto" data-emp-acao="excluir" data-id="${id}">Excluir</button>` : ''}`;

// Lista para o gestor: pendentes + últimos 5 quitados
export function desenharEmprestimosGestor() {
    const pend = [], pagos = [];
    idsOrdenados().forEach(id => {
        const emp = estado.emprestimos[id];
        if ((emp.status || 'pendente') === 'pendente') pend.push(cartaoEmprestimo(id, emp, botoesPendente(id, true)));
        else if (emp.status === 'pago' && pagos.length < 5) pagos.push(cartaoEmprestimo(id, emp, ''));
    });
    $('gestor-pendentes').innerHTML = pend.join('') || '<div class="vazio-lista">Nenhum empréstimo pendente.</div>';
    $('gestor-pagos').innerHTML = pagos.join('') || '<div class="vazio-lista">Nenhum empréstimo quitado ainda.</div>';
}

// Lista para o gerente: pendentes que envolvem o posto dele
export function desenharEmprestimosGerente() {
    const posto = estado.postoAtivo;
    const pend = idsOrdenados()
        .filter(id => { const e = estado.emprestimos[id]; return (e.origem === posto || e.destino === posto) && (e.status || 'pendente') === 'pendente'; })
        .map(id => cartaoEmprestimo(id, estado.emprestimos[id], botoesPendente(id, false)));
    $('gerente-pendentes').innerHTML = pend.join('') || '<div class="vazio-lista">Nenhum empréstimo pendente envolvendo o seu posto.</div>';
}

// Cliques nos botões dos empréstimos (um único "ouvinte" para a página)
export function ativarAcoesEmprestimo() {
    document.addEventListener('click', async (e) => {
        const botao = e.target.closest('[data-emp-acao]');
        if (!botao) return;
        const id = botao.dataset.id;
        const emp = estado.emprestimos[id];
        if (!emp) return;
        const volume = Number(emp.volume), devolvido = Number(emp.devolvido) || 0;

        try {
            if (botao.dataset.empAcao === 'parcial') {
                const val = await pedirNumero('Devolução parcial', `Quantos litros de ${emp.produto} voltaram para ${emp.origem}? Faltam ${num(volume - devolvido)} L.`);
                if (val === null || String(val).trim() === '') return;
                const agora = Number(String(val).replace(',', '.'));
                if (isNaN(agora) || agora <= 0) return aviso('Valor inválido.', 'erro');
                await comEspera(botao, () => atualizarDevolucao(id, Math.min(devolvido + agora, volume), `Devol. parcial de ${num(agora)}L por ${responsavel()}`));
                aviso('Devolução registrada.');
            } else if (botao.dataset.empAcao === 'quitar') {
                if (!await confirmar('Quitar empréstimo', `Confirmar que os ${num(volume)} L de ${emp.produto} foram totalmente devolvidos?`, 'Quitar')) return;
                await comEspera(botao, () => atualizarDevolucao(id, volume, `Quitado por ${responsavel()}`));
                aviso('Empréstimo quitado.');
            } else if (botao.dataset.empAcao === 'excluir') {
                if (!await confirmar('Excluir empréstimo', 'Use só para lançamentos feitos por engano. Essa ação não pode ser desfeita.', 'Excluir', true)) return;
                await comEspera(botao, () => excluirEmprestimo(id));
                aviso('Empréstimo excluído.');
            }
        } catch (err) {
            aviso('Erro: ' + err.message, 'erro');
        }
    });
}
