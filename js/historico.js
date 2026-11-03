// Janela do histórico (LMC e auditoria)
import { bicosPostos, rotulosProdutos, getProdutosPermitidos, unidade } from "./config.js";
import { estado, buscarHistorico, analisarHistorico } from "./dados.js";
import { $, esc, num, temValor, hojeISO, limitesDoDia } from "./util.js";

export function abrirHistorico(soMeuPosto) {
    const select = $('historico-posto');
    const postos = soMeuPosto ? [estado.postoAtivo] : estado.postos;
    select.innerHTML = postos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    select.disabled = soMeuPosto;
    const data = $('historico-data');
    data.max = hojeISO(); data.value = hojeISO();
    select.onchange = carregar; data.onchange = carregar;
    $('janela-historico').classList.remove('oculto');
    carregar();
}

export function fecharHistorico() { $('janela-historico').classList.add('oculto'); }

const hora = (ts) => new Date(Number(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

async function carregar() {
    const posto = $('historico-posto').value, dia = $('historico-data').value;
    if (!posto || !dia) return;
    const lista = $('historico-lista');
    lista.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
    try {
        const [inicio, fim] = limitesDoDia(dia);
        const dados = await buscarHistorico(posto, inicio, fim);
        const analise = analisarHistorico(dados, dia);
        const chaves = Object.keys(dados).filter(ts => /^[0-9]+$/.test(ts)).sort((a, b) => b - a);
        lista.innerHTML = chaves.length
            ? chaves.map((ts, i) => registro(dados[ts], ts, posto, analise, i)).join('')
            : '<div class="vazio-lista">Nenhum registro neste dia.</div>';
    } catch (e) {
        console.error(e);
        lista.innerHTML = '<div class="vazio-lista">Erro ao buscar o histórico.</div>';
    }
}

// Etiqueta de cada registro: o que ele foi e se conta nas vendas
function etiqueta(info, ts, analise) {
    if (analise.substituidos.has(ts)) return ['Substituído por correção', 'chip-cinza', true];
    switch (info.evento) {
        case 'fechamento': return ['Fechamento de turno', 'chip-verde'];
        case 'correcao': return [`Correção do fechamento das ${hora(info.substitui)}`, 'chip-azul'];
        case 'encerrantes': return ['Encerrantes', 'chip-amarelo'];
        case 'atualizacao': return ['Atualização do gerente', 'chip-amarelo'];
    }
    if (analise.idsValidos.has(ts)) return ['Fechamento de turno', 'chip-verde'];
    return [info.tipoEnvio || 'Envio', 'chip-cinza'];
}

// Nos fechamentos, mostra o nome digitado pelo caixa; nos outros, o login que enviou
const quemFez = (info) => ((info.evento === 'fechamento' || info.evento === 'correcao') && info.responsavelFechamento) ? info.responsavelFechamento : info.enviadoPorNome;

function registro(info, ts, posto, analise, i = 0) {
    const [texto, cor, riscado] = etiqueta(info, ts, analise);
    const tanques = getProdutosPermitidos(posto).map(p => {
        const v = info?.valores?.[p]?.regua;
        return `<div class="registro-linha"><span>${rotulosProdutos[p]}</span>${temValor(v) ? `<strong>${num(Number(v))} ${unidade(p)}</strong>` : '<span class="sem-info">–</span>'}</div>`;
    }).join('');
    const bicos = info?.encerrantes
        ? (bicosPostos[posto] || []).map(b => {
            const e = info.encerrantes[b.id];
            return `<div class="registro-linha"><span>Bico ${b.id}</span>${temValor(e) ? `<strong>${num(Number(e))}</strong>` : '<span class="sem-info">–</span>'}</div>`;
        }).join('')
        : '<p class="texto-suave">Sem encerrantes.</p>';
    return `<div class="registro ${riscado ? 'substituido' : ''} entrar" style="--i:${Math.min(i, 8)}">
        <div class="registro-topo"><span>${new Date(Number(ts)).toLocaleTimeString('pt-BR')}${quemFez(info) ? ' · ' + esc(quemFez(info)) : ''}</span><span class="chip ${cor}">${esc(texto)}</span></div>
        <div class="registro-corpo">
            <div><h4 class="titulo-tanques">Tanques</h4>${tanques}</div>
            <div><h4 class="titulo-encerrantes">Encerrantes</h4>${bicos}</div>
        </div>
    </div>`;
}
