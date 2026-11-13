// Manutenção e ocorrências do posto (gerente registra; gerente e gestores atualizam a situação)
import { bicosPostos } from "./config.js";
import { estado, criarOcorrencia, atualizarOcorrencia, buscarOcorrencias, registrarLog } from "./dados.js";
import { $, esc, aviso, comEspera, confirmar, pedirTexto } from "./util.js";
import { icone } from "./icones.js";

export const CATEGORIAS = ['Bomba / bico', 'Tanque / vazamento', 'Elétrica / iluminação', 'Sistema / computador / maquininha', 'Estrutura / pista / cobertura', 'Compressor / calibrador', 'Segurança', 'Limpeza / ambiental', 'Outros'];
const PRIORIDADES = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const STATUS = { aberto: 'Aberto', andamento: 'Em andamento', resolvido: 'Resolvido' };
const ordemPrio = { alta: 0, media: 1, baixa: 2 };

const dataHora = (ms) => ms ? new Date(Number(ms)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const diasAberto = (ms) => Math.max(0, Math.floor((Date.now() - Number(ms)) / 86400000));

// cache das ocorrências carregadas: posto -> lista
const cache = {};

function cartao(posto, o, mostrarPosto) {
    const aberto = o.status !== 'resolvido';
    const d = diasAberto(o.criadoEm);
    return `<article class="ocorrencia prio-${o.prioridade} st-${o.status}">
        <header class="oc-topo">
            <div class="oc-chips">
                <span class="chip chip-prio-${o.prioridade}">${PRIORIDADES[o.prioridade] || o.prioridade}</span>
                <span class="chip chip-st-${o.status}">${STATUS[o.status] || o.status}</span>
                <span class="chip chip-cinza">${esc(o.categoria)}${o.bico ? ' · bico ' + esc(o.bico) : ''}</span>
            </div>
            ${aberto ? `<span class="oc-dias">${d === 0 ? 'aberto hoje' : `aberto há ${d} dia${d > 1 ? 's' : ''}`}</span>` : ''}
        </header>
        ${mostrarPosto ? `<p class="oc-posto">${esc(posto)}</p>` : ''}
        <p class="oc-desc">${esc(o.descricao)}</p>
        ${o.solucao ? `<p class="oc-solucao">${icone('check')} <b>Solução:</b> ${esc(o.solucao)}</p>` : ''}
        <footer class="oc-rodape">
            <span>Aberto em ${dataHora(o.criadoEm)} por ${esc(o.criadoPorNome || o.criadoPor)}${o.atualizadoEm ? ` · última atualização ${dataHora(o.atualizadoEm)} por ${esc(o.atualizadoPorNome || o.atualizadoPor)}` : ''}</span>
            ${aberto ? `<span class="oc-acoes">
                ${o.status === 'aberto' ? `<button type="button" class="botao botao-claro botao-mini" data-oc="andamento" data-posto="${esc(posto)}" data-id="${o.id}">Em andamento</button>` : ''}
                <button type="button" class="botao botao-sucesso botao-mini" data-oc="resolver" data-posto="${esc(posto)}" data-id="${o.id}">${icone('check')} Resolvido</button>
            </span>` : ''}
        </footer>
    </article>`;
}

const ordenarAbertos = (lista) => lista.filter(x => x.o.status !== 'resolvido').sort((a, b) => (ordemPrio[a.o.prioridade] - ordemPrio[b.o.prioridade]) || (a.o.criadoEm - b.o.criadoEm));
const ordenarResolvidos = (lista) => lista.filter(x => x.o.status === 'resolvido').sort((a, b) => (b.o.atualizadoEm || 0) - (a.o.atualizadoEm || 0));

function resumo(el, n, alta) {
    if (!el) return;
    el.innerHTML = n ? `${alta ? icone('alerta') + ' ' : ''}${n} aberta${n > 1 ? 's' : ''}` : 'Nada em aberto';
    el.className = `chip secao-resumo ${alta ? 'chip-vermelho' : n ? 'chip-amarelo' : 'chip-verde'}`;
}

// ---------- Tela do gerente ----------
export function abrirManutencaoGerente() {
    const posto = estado.postoAtivo;
    $('oc-categoria').innerHTML = CATEGORIAS.map(c => `<option>${c}</option>`).join('');
    $('oc-bico').innerHTML = '<option value="">Não é de um bico específico</option>' + (bicosPostos[posto] || []).map(b => `<option value="${b.id}">Bico ${b.id} · ${esc(b.produto)}</option>`).join('');
    $('form-ocorrencia').onsubmit = async (e) => {
        e.preventDefault();
        const descricao = $('oc-descricao').value.trim().replace(/\s+/g, ' ');
        if (descricao.length < 3) { aviso('Descreva o problema.', 'erro'); return $('oc-descricao').focus(); }
        const dados = { categoria: $('oc-categoria').value, prioridade: $('oc-prioridade').value, descricao: descricao.slice(0, 500), ...($('oc-bico').value ? { bico: $('oc-bico').value } : {}) };
        await comEspera(e.submitter, async () => {
            try {
                await criarOcorrencia(posto, dados);
                registrarLog('ocorrencia', `Registrou ocorrência (${PRIORIDADES[dados.prioridade]}) em ${dados.categoria}${dados.bico ? ', bico ' + dados.bico : ''}: ${dados.descricao}`);
                aviso('Ocorrência registrada!');
                $('form-ocorrencia').reset();
                carregarGerente();
            } catch (err) { console.error(err); aviso('Não foi salvo: ' + err.message, 'erro'); }
        });
    };
    carregarGerente();
}

async function carregarGerente() {
    const posto = estado.postoAtivo;
    $('oc-abertas').innerHTML = '<div class="esqueleto"></div>';
    try {
        cache[posto] = await buscarOcorrencias(posto);
        const lista = cache[posto].map(o => ({ posto, o }));
        const abertos = ordenarAbertos(lista), resolvidos = ordenarResolvidos(lista).slice(0, 15);
        $('oc-abertas').innerHTML = abertos.map(x => cartao(posto, x.o, false)).join('') || '<div class="vazio-lista">Nenhuma ocorrência em aberto. 👍</div>';
        $('oc-resolvidas').innerHTML = resolvidos.map(x => cartao(posto, x.o, false)).join('') || '<div class="vazio-lista">Nenhuma ocorrência resolvida ainda.</div>';
        resumo($('gerente-oc-resumo'), abertos.length, abertos.some(x => x.o.prioridade === 'alta'));
    } catch (e) { console.error(e); $('oc-abertas').innerHTML = '<div class="vazio-lista">Não foi possível carregar as ocorrências.</div>'; }
}

// ---------- Painel do gestor ----------
export async function carregarManutencaoGestor() {
    $('gestor-oc-abertas').innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
    const lista = [];
    for (const posto of estado.postos) {
        try { cache[posto] = await buscarOcorrencias(posto); cache[posto].forEach(o => lista.push({ posto, o })); }
        catch (e) { console.error(e); }
    }
    const abertos = ordenarAbertos(lista), resolvidos = ordenarResolvidos(lista).slice(0, 15);
    $('gestor-oc-abertas').innerHTML = abertos.map(x => cartao(x.posto, x.o, true)).join('') || '<div class="vazio-lista">Nenhuma ocorrência em aberto nos postos. 👍</div>';
    $('gestor-oc-resolvidas').innerHTML = resolvidos.map(x => cartao(x.posto, x.o, true)).join('') || '<div class="vazio-lista">Nenhuma ocorrência resolvida ainda.</div>';
    resumo($('gestor-oc-resumo'), abertos.length, abertos.some(x => x.o.prioridade === 'alta'));
}

// ---------- Botões "Em andamento" / "Resolvido" ----------
export function ativarAcoesOcorrencia() {
    document.addEventListener('click', async (e) => {
        const botao = e.target.closest('[data-oc]');
        if (!botao) return;
        const posto = botao.dataset.posto, o = (cache[posto] || []).find(x => x.id === botao.dataset.id);
        if (!o) return;
        let mudanca;
        if (botao.dataset.oc === 'andamento') {
            if (!await confirmar('Em andamento', `Marcar "${o.descricao}" como em andamento?`, 'Confirmar')) return;
            mudanca = { status: 'andamento' };
        } else {
            const solucao = await pedirTexto('Ocorrência resolvida', 'O que foi feito para resolver?', 'Ex.: técnico trocou a mangueira', 'Resolver');
            if (solucao === null) return;
            if (!solucao) return aviso('Escreva o que foi feito.', 'erro');
            mudanca = { status: 'resolvido', solucao: solucao.slice(0, 500) };
        }
        await comEspera(botao, async () => {
            try {
                await atualizarOcorrencia(posto, o, mudanca);
                registrarLog('ocorrencia', `${mudanca.status === 'resolvido' ? 'Resolveu' : 'Colocou em andamento'} a ocorrência de ${posto}: ${o.descricao}${mudanca.solucao ? '. Solução: ' + mudanca.solucao : ''}`);
                aviso(mudanca.status === 'resolvido' ? 'Ocorrência resolvida!' : 'Ocorrência em andamento.');
                if ($('tela-gerente') && !$('tela-gerente').classList.contains('oculto')) carregarGerente(); else carregarManutencaoGestor();
            } catch (err) { console.error(err); aviso('Não foi possível atualizar: ' + err.message, 'erro'); }
        });
    });
}
