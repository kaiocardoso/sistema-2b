// Empréstimos de combustível entre postos (gestor e gerente)
import { configPostos, produtosEmprestimo } from "./config.js";
import { estado, criarEmprestimo, atualizarDevolucao, excluirEmprestimo, responsavel, registrarLog } from "./dados.js";
import { $, esc, num, dataBR, hojeISO, aviso, comEspera, pedirNumero, confirmar } from "./util.js";
import { icone } from "./icones.js";

export function montarFormEmprestimo(idForm) {
    const form = $(idForm);
    const opcoesPostos = Object.keys(configPostos).map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    form.innerHTML = `
        <div><label class="rotulo">Data</label><input type="date" name="data" class="campo" required value="${hojeISO()}"></div>
        <div><label class="rotulo">Quem emprestou (saiu de)</label><select name="origem" class="campo" required><option value="">Selecione...</option>${opcoesPostos}</select></div>
        <div><label class="rotulo">Quem recebeu (vai devolver)</label><select name="destino" class="campo" required><option value="">Selecione...</option>${opcoesPostos}</select></div>
        <div><label class="rotulo">Combustível</label><select name="produto" class="campo" required>${produtosEmprestimo.map(p => `<option>${p}</option>`).join('')}</select></div>
        <div><label class="rotulo">Litragem (L)</label><input type="number" inputmode="decimal" step="any" min="1" name="volume" class="campo" placeholder="Ex: 5000" required></div>
        <button type="submit" class="botao botao-primario">${icone('check')} Registrar</button>`;
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
                registrarLog('emprestimo_criado', `Registrou empréstimo: ${dados.destino} recebeu ${num(dados.volume)} L de ${dados.produto} do ${dados.origem} (data ${dataBR(dados.data)})`);
                aviso('Empréstimo registrado!');
                form.volume.value = '';
            } catch (err) { aviso('Erro: ' + err.message, 'erro'); }
        });
    };
}

const idsOrdenados = () => Object.keys(estado.emprestimos).filter(id => /^[0-9]+$/.test(id)).sort((a, b) => b - a);

const jaDesenhou = new Set();   // anima só na primeira vez

function cartaoEmprestimo(id, emp, acoes, i, animar) {
    const devolvido = Number(emp.devolvido) || 0;
    const volume = Number(emp.volume) || 0;
    const pct = volume > 0 ? Math.min(100, Math.round((devolvido / volume) * 100)) : 0;
    const pago = emp.status === 'pago';
    const auditoria = emp.atualizadoPor || emp.criadoPor || 'Sistema';
    return `<article class="emprestimo ${pago ? 'pago' : ''} ${animar ? 'entrar' : ''}" style="--i:${Math.min(i, 8)}">
        <div class="emp-cabeca">
            <span class="chip chip-azul">${esc(emp.produto)}</span>
            <span class="emp-data">${esc(dataBR(emp.data))}</span>
        </div>
        <p class="emp-frase">${pago
            ? `<b class="devedor">${esc(emp.destino)}</b> devolveu <b>${num(volume)} L</b> para <b class="credor">${esc(emp.origem)}</b>`
            : `<b class="devedor">${esc(emp.destino)}</b> deve <b>${num(volume - devolvido)} L</b> para <b class="credor">${esc(emp.origem)}</b>`}</p>
        <p class="emp-origem">${icone('troca')} Saiu do ${esc(emp.origem)} e foi para o ${esc(emp.destino)}</p>
        <div class="emp-progresso">
            <div class="barra"><div class="nivel-${pago ? 'ok' : 'azul'}" style="--pct:${pct}%"></div></div>
            <p>${pago ? `${icone('check')} Quitado · ${num(volume)} L devolvidos`
                      : `<strong>${num(devolvido)}</strong> de ${num(volume)} L devolvidos · <span class="falta">faltam ${num(volume - devolvido)} L</span>`}</p>
        </div>
        <div class="emp-rodape">
            <span class="emp-auditoria">${esc(auditoria)}</span>
            ${acoes ? `<div class="emp-acoes">${acoes}</div>` : ''}
        </div>
    </article>`;
}

const botoesPendente = (id, podeExcluir) => `
    <button type="button" class="botao botao-claro botao-mini" data-emp-acao="parcial" data-id="${id}">Devolução parcial</button>
    <button type="button" class="botao botao-sucesso botao-mini" data-emp-acao="quitar" data-id="${id}">${icone('check')} Quitar</button>
    ${podeExcluir ? `<button type="button" class="botao botao-texto" data-emp-acao="excluir" data-id="${id}">Excluir</button>` : ''}`;

const resumo = (el, n) => { el.textContent = n ? `${n} pendente${n > 1 ? 's' : ''}` : 'Nenhum pendente'; el.classList.toggle('chip-amarelo', n > 0); el.classList.toggle('chip-cinza', !n); };

export function desenharEmprestimosGestor() {
    const pend = [], pagos = [];
    const animar = !jaDesenhou.has('gestor');
    idsOrdenados().forEach(id => {
        const emp = estado.emprestimos[id];
        if ((emp.status || 'pendente') === 'pendente') pend.push(cartaoEmprestimo(id, emp, botoesPendente(id, true), pend.length, animar));
        else if (emp.status === 'pago' && pagos.length < 5) pagos.push(cartaoEmprestimo(id, emp, '', pagos.length, animar));
    });
    if (pend.length || pagos.length) jaDesenhou.add('gestor');
    $('gestor-pendentes').innerHTML = pend.join('') || '<div class="vazio-lista">Nenhum empréstimo pendente.</div>';
    $('gestor-pagos').innerHTML = pagos.join('') || '<div class="vazio-lista">Nenhum empréstimo quitado ainda.</div>';
    resumo($('gestor-emp-qtd'), pend.length);
}

export function desenharEmprestimosGerente() {
    const posto = estado.postoAtivo;
    const animar = !jaDesenhou.has('gerente');
    const ids = idsOrdenados().filter(id => { const e = estado.emprestimos[id]; return (e.origem === posto || e.destino === posto) && (e.status || 'pendente') === 'pendente'; });
    if (ids.length) jaDesenhou.add('gerente');
    $('gerente-pendentes').innerHTML = ids.map((id, i) => cartaoEmprestimo(id, estado.emprestimos[id], botoesPendente(id, false), i, animar)).join('')
        || '<div class="vazio-lista">Nenhum empréstimo pendente envolvendo o seu posto.</div>';
    resumo($('gerente-emp-qtd'), ids.length);
}

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
                const novo = Math.min(devolvido + agora, volume);
                await comEspera(botao, () => atualizarDevolucao(id, novo, `Devol. parcial de ${num(agora)}L por ${responsavel()}`));
                registrarLog('emprestimo_devolucao', `Devolução parcial de ${num(agora)} L de ${emp.produto}: ${emp.destino} devolveu para ${emp.origem}. Faltavam ${num(volume - devolvido)} L, agora faltam ${num(volume - novo)} L`, { emprestimo: id });
                aviso('Devolução registrada.');
            } else if (botao.dataset.empAcao === 'quitar') {
                if (!await confirmar('Quitar empréstimo', `Confirmar que os ${num(volume)} L de ${emp.produto} foram totalmente devolvidos?`, 'Quitar')) return;
                await comEspera(botao, () => atualizarDevolucao(id, volume, `Quitado por ${responsavel()}`));
                registrarLog('emprestimo_quitado', `Quitou empréstimo: ${emp.destino} devolveu os ${num(volume)} L de ${emp.produto} para ${emp.origem} (empréstimo de ${dataBR(emp.data)})`, { emprestimo: id });
                aviso('Empréstimo quitado.');
            } else if (botao.dataset.empAcao === 'excluir') {
                if (!await confirmar('Excluir empréstimo', 'Use só para lançamentos feitos por engano. Essa ação não pode ser desfeita.', 'Excluir', true)) return;
                await comEspera(botao, () => excluirEmprestimo(id));
                registrarLog('emprestimo_excluido', `Excluiu empréstimo: ${emp.destino} devia ${num(volume - devolvido)} L de ${emp.produto} para ${emp.origem} (empréstimo de ${num(volume)} L em ${dataBR(emp.data)})`, { emprestimo: id, copia: emp });
                aviso('Empréstimo excluído.');
            }
        } catch (err) {
            console.error(err);
            aviso(/permission/i.test(err.message) ? 'Sem permissão para alterar este empréstimo. Avise o gestor do sistema.' : 'Erro: ' + err.message, 'erro');
        }
    });
}
