// Janela do histórico (LMC e auditoria)
import { bicosPostos, rotulosProdutos, getProdutosPermitidos, unidade } from "./config.js";
import { estado, buscarHistorico } from "./dados.js";
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

async function carregar() {
    const posto = $('historico-posto').value, dia = $('historico-data').value;
    if (!posto || !dia) return;
    const lista = $('historico-lista');
    lista.innerHTML = '<p class="texto-carregando">Buscando lançamentos...</p>';
    try {
        const [inicio, fim] = limitesDoDia(dia);
        const dados = await buscarHistorico(posto, inicio, fim);
        const chaves = Object.keys(dados).sort((a, b) => b - a);
        lista.innerHTML = chaves.length
            ? chaves.map(ts => registro(dados[ts], new Date(Number(ts)).toLocaleTimeString('pt-BR'), posto)).join('')
            : '<div class="vazio-lista">Nenhum registro neste dia.</div>';
    } catch (e) {
        console.error(e);
        lista.innerHTML = '<div class="vazio-lista">Erro ao buscar o histórico.</div>';
    }
}

function registro(info, hora, posto) {
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
    return `<div class="registro">
        <div class="registro-topo"><span>${esc(hora)}${info.enviadoPorNome ? ' · ' + esc(info.enviadoPorNome) : ''}</span><span class="etiqueta etiqueta-azul">${esc(info.tipoEnvio || 'Envio')}</span></div>
        <div class="registro-corpo">
            <div><h4 style="color:var(--vermelho)">Tanques</h4>${tanques}</div>
            <div><h4 style="color:var(--azul)">Encerrantes</h4>${bicos}</div>
        </div>
    </div>`;
}
