// Cargas de combustível (notas de compra)
// Administrador lança (XML da NF-e/CT-e ou manual) → aparece "A caminho" para o posto
// → gerente marca como recebida (data, responsável, régua antes/depois, lacres, observação).
import { configPostos, rotulosProdutos, TOLERANCIA_ESTOQUE, unidade, diaDasVendasPelaHora } from "./config.js";
import { estado, cargaExiste, lancarCarga, registrarDescarga, estornarRecebimento, dadosEmprestimo, editarCarga, cancelarCarga, buscarCargas, registrarLog, sincronizarDescargasCaixa } from "./dados.js";
import { lerXML, numeroDaChave } from "./xml-cargas.js";
import { $, esc, num, dataBR, hojeISO, aviso, comEspera, confirmar, pedirTexto } from "./util.js";
import { icone } from "./icones.js";

const PRODUTOS_CARGA = ['s10', 's500', 'comum', 'vpower', 'etanol', 'arla_g', 'arla_b'];
const STATUS = { a_caminho: 'A caminho', parcial: 'Descarga parcial', recebida: 'Recebida', cancelada: 'Cancelada' };
const ORIGEM = { nfe: 'NF-e', cte: 'CT-e', manual: 'Manual' };

export const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (ms) => ms ? new Date(Number(ms)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const dataHoraLocal = (s) => s ? s.replace(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2}:\d{2})?.*/, (_, a, m, d, h) => `${d}/${m}/${a.slice(2)}${h ? ' ' + h : ''}`) : '';
const totalLitros = (c) => Object.values(c.itens || {}).reduce((s, l) => s + Number(l || 0), 0);
const ehAdmin = () => estado.perfil?.papel === 'admin';
const podeReceber = () => ['gerente', 'gestor', 'admin'].includes(estado.perfil?.papel);
const produtosDoPosto = (posto) => posto && configPostos[posto] ? PRODUTOS_CARGA.filter(p => p in configPostos[posto]) : PRODUTOS_CARGA;

// Diferença entre o que a régua mediu e o que veio na nota (por produto)
export function conferencia(itens, antes = {}, depois = {}) {
    return Object.entries(itens || {}).map(([p, nota]) => {
        const a = antes[p], d = depois[p];
        if (a === undefined || a === '' || d === undefined || d === '') return { p, nota: Number(nota), medido: null };
        const medido = Number(d) - Number(a), dif = medido - Number(nota), pct = Number(nota) ? dif / Number(nota) : 0;
        return { p, nota: Number(nota), medido, dif, pct, ok: Math.abs(pct) <= TOLERANCIA_ESTOQUE };
    });
}
const sinal = (n) => (n > 0 ? '+' : '') + num(Math.round(n));
const pctTxt = (x) => (x > 0 ? '+' : '') + (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';

function linhaConferencia(r) {
    if (r.medido === null) return '';
    return `<li class="${r.ok ? 'conf-ok' : 'conf-fora'}"><b>${rotulosProdutos[r.p] || r.p}</b>: régua mediu ${num(Math.round(r.medido))} L de ${num(r.nota)} L
        → <b>${sinal(r.dif)} L (${pctTxt(r.pct)})</b> ${r.ok ? 'dentro da tolerância' : r.dif < 0 ? 'FALTA acima de 0,6%' : 'SOBRA acima de 0,6%'}</li>`;
}

// Quanto de cada produto já foi resolvido (descarregado aqui ou mandado a outro posto)
export function recebidoPorProduto(c) {
    if (c.recebimento && !c.descargas) return { ...(c.itens || {}) };
    const r = {};
    Object.values(c.descargas || {}).forEach(d => {
        Object.entries(d.itens || {}).forEach(([p, l]) => { r[p] = (r[p] || 0) + Number(l || 0); });
        Object.entries(d.transferencias || {}).forEach(([p, t]) => { r[p] = (r[p] || 0) + Number(t.litros || 0); });
    });
    return r;
}
const faltaPorProduto = (c) => { const r = recebidoPorProduto(c); return Object.fromEntries(Object.entries(c.itens || {}).map(([p, l]) => [p, Math.max(0, Number(l) - (r[p] || 0))])); };
const PROD_EMPRESTIMO = { s10: 'DIESEL S-10', s500: 'DIESEL S-500', comum: 'GAS. COMUM', vpower: 'GAS. ADITIVADA', etanol: 'ETANOL' };
const ordenarDescargas = (c) => Object.entries(c.descargas || {}).sort((a, b) => String(a[1].data).localeCompare(String(b[1].data)) || (a[1].em - b[1].em));

function blocoDescargas(c) {
    const lista = ordenarDescargas(c);
    if (!lista.length) return '';
    const falta = faltaPorProduto(c), pend = Object.entries(falta).filter(([, l]) => l > 0);
    return `<div class="carga-recebimento">
        ${lista.map(([, d], i) => `<p>${icone('check')} <b>${lista.length > 1 ? `${i + 1}ª descarga` : 'Descarga'} em ${dataHoraLocal(d.data)}</b> · ${Object.entries(d.itens || {}).filter(([, l]) => l > 0).map(([p, l]) => `${num(l)} ${unidade(p)} de ${rotulosProdutos[p] || p}`).join(', ') || 'nada descarregado aqui'} · ${esc(d.responsavel)}${d.lacres === true ? ' · lacres conferidos' : d.lacres === false ? ' · <b>lacres NÃO conferidos</b>' : ''}</p>
            ${Object.entries(d.transferencias || {}).map(([p, t]) => `<p class="carga-transf">${icone('troca')} ${num(t.litros)} L de ${rotulosProdutos[p] || p} foram para o <b>${esc(t.posto)}</b> (empréstimo)</p>`).join('')}
            ${d.obs ? `<p class="carga-obs">${icone('mensagem')} ${esc(d.obs)}</p>` : ''}`).join('')}
        ${pend.length ? `<p class="carga-falta">${icone('caminhao')} <b>Falta descarregar:</b> ${pend.map(([p, l]) => `${num(l)} ${unidade(p)} de ${rotulosProdutos[p] || p}`).join(', ')} (ficou no caminhão)</p>` : ''}
    </div>`;
}

function ultimaConfirmacao(c) {
    const ds = Object.values(c.descargas || {}).sort((a, b) => (b.em || 0) - (a.em || 0));
    const u = ds[0] || c.recebimento;
    return u?.em ? ` · recebimento confirmado por <b>${esc(u.porNome || u.por)}</b> em ${dataHora(u.em)}` : '';
}

// ---------- Cartão de uma carga ----------
function cartao(c, { mostrarPosto }) {
    const rec = c.recebimento, itens = Object.entries(c.itens || {});
    const conf = rec ? conferencia(c.itens, rec.reguaAntes, rec.reguaDepois).filter(r => r.medido !== null) : [];
    const fora = conf.some(r => !r.ok);
    return `<article class="carga st-${c.status}">
        <header class="oc-topo">
            <div class="oc-chips">
                <span class="chip chip-carga-${c.status}">${c.status === 'a_caminho' || c.status === 'parcial' ? icone('caminhao') + ' ' : ''}${STATUS[c.status] || c.status}</span>
                <span class="chip chip-cinza">${ORIGEM[c.origem] || c.origem}${c.numero ? ' nº ' + esc(c.numero) : ''}</span>
                ${fora ? `<span class="chip chip-vermelho">${icone('alerta')} diferença na régua</span>` : ''}
            </div>
            <span class="carga-valor">${reais(c.valor)}</span>
        </header>
        ${mostrarPosto ? `<p class="oc-posto">${esc(c.posto)}</p>` : ''}
        <p class="carga-fornecedor">${esc(c.fornecedor)} <small>· emitida em ${dataBR(c.dataEmissao)}</small></p>
        <div class="carga-itens">${itens.map(([p, l]) => `<span class="carga-item"><small>${rotulosProdutos[p] || esc(p)}</small><b>${num(l)} ${unidade(p)}</b></span>`).join('')}
            ${itens.length > 1 ? `<span class="carga-item carga-total"><small>Total</small><b>${num(totalLitros(c))} L</b></span>` : ''}</div>
        ${c.transporte ? `<p class="carga-obs">${icone('caminhao')} ${esc(c.transporte)}</p>` : ''}
        ${c.obs ? `<p class="carga-obs">${icone('mensagem')} ${esc(c.obs)}</p>` : ''}
        ${blocoDescargas(c)}
        ${c.estorno && c.status === 'a_caminho' ? `<p class="carga-obs">${icone('alerta')} Recebimento estornado em ${dataHora(c.estorno.em)}${c.estorno.motivo ? ': ' + esc(c.estorno.motivo) : ''}</p>` : ''}
        ${rec && !c.descargas ? `<div class="carga-recebimento">
            <p>${icone('check')} <b>Recebida em ${dataHoraLocal(rec.data)}</b> · ${esc(rec.responsavel)}${rec.lacres === true ? ' · lacres conferidos' : rec.lacres === false ? ' · <b>lacres NÃO conferidos</b>' : ''}</p>
            ${conf.length ? `<ul class="carga-conf">${conf.map(linhaConferencia).join('')}</ul>` : ''}
            ${rec.obs ? `<p class="carga-obs">${icone('mensagem')} ${esc(rec.obs)}</p>` : ''}
        </div>` : ''}
        ${c.cancelamento ? `<p class="carga-obs">${icone('alerta')} Cancelada${c.cancelamento.motivo ? ': ' + esc(c.cancelamento.motivo) : ''}</p>` : ''}
        <footer class="oc-rodape">
            <span>Lançada em ${dataHora(c.criadoEm)}${c.editadoEm ? ` · editada em ${dataHora(c.editadoEm)}` : ''}${ultimaConfirmacao(c)}</span>
            <span class="oc-acoes">
                ${(c.status === 'a_caminho' || c.status === 'parcial') && podeReceber() ? `<button type="button" class="botao botao-sucesso botao-mini" data-carga="receber" data-posto="${esc(c.posto)}" data-id="${esc(c.id)}">${icone('check')} ${c.status === 'parcial' ? 'Registrar o restante' : 'Registrar descarga'}</button>` : ''}
                ${ehAdmin() && (c.status === 'recebida' || c.status === 'parcial') ? `<button type="button" class="botao botao-claro botao-mini" data-carga="estornar" data-posto="${esc(c.posto)}" data-id="${esc(c.id)}">${icone('atualizar')} Estornar recebimento</button>` : ''}
                ${ehAdmin() && c.status !== 'cancelada' ? `<button type="button" class="botao botao-claro botao-mini" data-carga="editar" data-posto="${esc(c.posto)}" data-id="${esc(c.id)}">${icone('lapis')} Editar</button>` : ''}
                ${ehAdmin() && c.status === 'a_caminho' ? `<button type="button" class="botao botao-perigo botao-mini" data-carga="cancelar" data-posto="${esc(c.posto)}" data-id="${esc(c.id)}">Cancelar</button>` : ''}
            </span>
        </footer>
    </article>`;
}

// cache: posto -> lista de cargas
const cache = {};
const acharCarga = (posto, id) => (cache[posto] || []).find(c => c.id === id);
const porEmissao = (a, b) => String(a.dataEmissao).localeCompare(String(b.dataEmissao)) || (a.criadoEm - b.criadoEm);
const ordenar = (l) => l.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

function resumoChip(el, n) {
    if (!el) return;
    el.innerHTML = n ? `${icone('caminhao')} ${n} a caminho` : 'Nada a caminho';
    el.className = `chip secao-resumo ${n ? 'chip-amarelo' : 'chip-cinza'}`;
}

// ---------- Tela do gerente ----------
export async function carregarCargasGerente() {
    const posto = estado.postoAtivo;
    $('cargas-caminho').innerHTML = '<div class="esqueleto"></div>';
    try {
        cache[posto] = ordenar(await buscarCargas(posto));
        const caminho = cache[posto].filter(c => c.status === 'a_caminho' || c.status === 'parcial').sort(porEmissao);
        const recebidas = cache[posto].filter(c => c.status === 'recebida').sort(porRecebimento).slice(0, 15);
        $('cargas-caminho').innerHTML = caminho.map(c => cartao(c, {})).join('') || '<div class="vazio-lista">Nenhuma carga a caminho no momento.</div>';
        $('cargas-recebidas').innerHTML = recebidas.map(c => cartao(c, {})).join('') || '<div class="vazio-lista">Nenhuma carga recebida ainda.</div>';
        resumoChip($('gerente-cargas-resumo'), caminho.length);
        sincronizarDescargasCaixa(posto, cache[posto]).catch(e => console.warn('Sincronizar descargas', e));
    } catch (e) { console.error(e); $('cargas-caminho').innerHTML = '<div class="vazio-lista">Não foi possível carregar as cargas.</div>'; }
}

// Quando o recebimento foi confirmado (última descarga registrada)
export const momentoRecebimento = (c) => Math.max(Number(c.recebimento?.em) || 0, ...Object.values(c.descargas || {}).map(d => Number(d.em) || 0), 0);
const porRecebimento = (a, b) => momentoRecebimento(b) - momentoRecebimento(a) || (b.criadoEm || 0) - (a.criadoEm || 0);
const semAcento = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const casaBusca = (c, termo) => !termo || semAcento([c.posto, c.numero, c.fornecedor, c.transporte, c.obs, c.chave, ...Object.keys(c.itens || {}).map(p => rotulosProdutos[p])].join(' ')).includes(semAcento(termo));

// ---------- Painel do gestor / administrador ----------
let todasGestor = [], limiteRecebidas = 30;
export async function carregarCargasGestor() {
    $('gestor-cargas-caminho').innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
    const todas = [];
    for (const posto of estado.postos) {
        try { cache[posto] = ordenar(await buscarCargas(posto)); todas.push(...cache[posto]); }
        catch (e) { console.error(e); }
    }
    todasGestor = ordenar(todas);
    desenharListasGestor();
    // acerta as descargas que o caixa enxerga (inclui as registradas antes desta versão)
    for (const posto of estado.postos) { try { await sincronizarDescargasCaixa(posto, cache[posto] || []); } catch (e) { console.warn('Sincronizar descargas', posto, e); } }
}

function desenharListasGestor() {
    const termo = ($('cargas-busca')?.value || '').trim();
    const lista = todasGestor.filter(c => casaBusca(c, termo));
    const caminho = lista.filter(c => c.status === 'a_caminho' || c.status === 'parcial').sort(porEmissao);
    const todasRecebidas = lista.filter(c => c.status === 'recebida').sort(porRecebimento);
    const recebidas = todasRecebidas.slice(0, limiteRecebidas);
    const canceladas = lista.filter(c => c.status === 'cancelada').slice(0, 15);
    const nada = (t) => `<div class="vazio-lista">${termo ? 'Nada encontrado para "' + esc(termo) + '".' : t}</div>`;
    $('gestor-cargas-caminho').innerHTML = caminho.map(c => cartao(c, { mostrarPosto: true })).join('') || nada('Nenhuma carga a caminho.');
    $('gestor-cargas-recebidas').innerHTML = (recebidas.map(c => cartao(c, { mostrarPosto: true })).join('') || nada('Nenhuma carga recebida ainda.'))
        + (todasRecebidas.length > recebidas.length ? `<button type="button" class="botao botao-claro" id="cargas-mais-recebidas">Mostrar mais (${todasRecebidas.length - recebidas.length} restantes)</button>` : '');
    $('gestor-cargas-canceladas').innerHTML = canceladas.map(c => cartao(c, { mostrarPosto: true })).join('') || nada('Nenhuma.');
    const caminhoTodas = todasGestor.filter(c => c.status === 'a_caminho' || c.status === 'parcial');
    resumoChip($('gestor-cargas-resumo'), caminhoTodas.length);
    const litros = caminho.reduce((s, c) => s + Object.values(faltaPorProduto(c)).reduce((a, b) => a + b, 0), 0), valor = caminho.reduce((s, c) => s + Number(c.valor || 0), 0);
    const alerta = $('aba-cargas-alerta');
    if (alerta) { alerta.textContent = caminhoTodas.length; alerta.classList.toggle('oculto', !caminhoTodas.length); }
    $('gestor-cargas-totais').innerHTML = caminho.length
        ? `<div class="resumo-card"><span>A caminho</span><strong>${caminho.length} carga${caminho.length > 1 ? 's' : ''}</strong><small>${num(litros)} L</small></div>
           <div class="resumo-card"><span>Valor a caminho</span><strong>${reais(valor)}</strong><small>soma das notas</small></div>`
        : '';
    if (ehAdmin()) $('cargas-admin').classList.remove('oculto');
}

const recarregar = () => { if (!$('tela-gerente').classList.contains('oculto')) carregarCargasGerente(); else carregarCargasGestor(); };

// ---------- Lançamento (só administrador): importar XML ou manual ----------
let rascunhos = [];
let seq = 0;

function editor(r) {
    const prods = produtosDoPosto(r.posto);
    const linhas = r.itens.length ? r.itens : [{ produto: '', litros: '' }];
    return `<div class="carga-editor" data-rid="${r.rid}">
        <div class="carga-editor-topo">
            <strong>${r.tipo === 'manual' ? 'Lançamento manual' : `${ORIGEM[r.tipo]} · ${esc(r.nomeArquivo || '')}`}</strong>
            <button type="button" class="botao-fechar" data-rasc="remover" aria-label="Descartar">&times;</button>
        </div>
        ${r.aviso ? `<p class="carga-aviso">${icone('alerta')} ${esc(r.aviso)}</p>` : ''}
        ${r.duplicada ? `<p class="carga-aviso">${icone('alerta')} Esta nota já foi lançada no sistema.</p>` : ''}
        <div class="grade-2">
            <div><label class="rotulo">Posto</label><select class="campo" data-f="posto" ${r.editando ? 'disabled' : ''}><option value="">Escolha…</option>${Object.keys(configPostos).map(p => `<option ${p === r.posto ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
            <div><label class="rotulo">Fornecedor</label><input class="campo" data-f="fornecedor" maxlength="120" value="${esc(r.fornecedor || '')}"></div>
            <div><label class="rotulo">Nº da nota</label><input class="campo" data-f="numero" maxlength="20" value="${esc(r.numero || '')}"></div>
            <div><label class="rotulo">Emissão</label><input type="date" class="campo" data-f="dataEmissao" value="${esc(r.dataEmissao || '')}"></div>
            <div><label class="rotulo">Valor da nota (R$)</label><input type="number" step="0.01" min="0" inputmode="decimal" class="campo" data-f="valor" value="${r.valor ?? ''}"></div>
            <div><label class="rotulo">Transporte (opcional)</label><input class="campo" data-f="transporte" maxlength="300" value="${esc(r.transporte || '')}" placeholder="Placa, motorista…"></div>
        </div>
        <label class="rotulo">Produtos e litros</label>
        ${r.descricaoCarga && !r.itens.length ? `<p class="dica">A nota diz: "${esc(r.descricaoCarga)}"${r.litrosTotal ? `, total ${num(r.litrosTotal)} L` : ''}. Informe os litros de cada produto.</p>` : ''}
        <div class="carga-linhas">${linhas.map((i, k) => `<div class="carga-linha">
            <select class="campo" data-item="produto"><option value="">Produto…</option>${prods.map(p => `<option value="${p}" ${p === i.produto ? 'selected' : ''}>${rotulosProdutos[p]}</option>`).join('')}</select>
            <input type="number" min="1" step="1" inputmode="numeric" class="campo" data-item="litros" placeholder="Litros (balde: unidades)" value="${i.litros || ''}">
            ${linhas.length > 1 ? `<button type="button" class="botao-fechar" data-rasc="tirar-linha" data-k="${k}" aria-label="Tirar">&times;</button>` : '<span></span>'}
        </div>${i.descricao ? `<small class="dica">${esc(i.descricao)}${i.aviso ? ' · ' + esc(i.aviso) : ''}</small>` : ''}`).join('')}</div>
        <button type="button" class="botao botao-claro botao-mini" data-rasc="mais-linha">${icone('mais')} Outro produto</button>
        <div><label class="rotulo">Observação (opcional)</label><input class="campo" data-f="obs" maxlength="300" value="${esc(r.obs || '')}"></div>
        ${r.editando && !r.recebida ? '' : `<div class="carga-ja-recebida">
            ${r.editando ? '' : `<label class="caixa-marcar"><input type="checkbox" data-f="jaRecebida" ${r.jaRecebida ? 'checked' : ''}> Já chegou no posto (lançar como recebida)</label>`}
            <div class="${r.jaRecebida || r.recebida ? '' : 'oculto'}" data-bloco-recebida><label class="rotulo">Data e hora em que chegou</label><input type="datetime-local" class="campo" data-f="dataRecebida" value="${esc(r.dataRecebida || '')}"></div>
        </div>`}
        <button type="button" class="botao botao-primario" data-rasc="lancar">${icone('check')} ${r.editando ? 'Salvar alterações' : 'Lançar carga (fica "A caminho")'}</button>
    </div>`;
}

function desenharRascunhos() {
    if (!$('cargas-rascunhos')) return;
    $('cargas-rascunhos').innerHTML = rascunhos.filter(r => !r.editando).map(editor).join('');
    $('cargas-lancar-todas').classList.toggle('oculto', rascunhos.filter(r => !r.editando).length < 2);
}

// Lê o que está digitado no editor para o rascunho
function lerEditor(r) {
    const el = document.querySelector(`.carga-editor[data-rid="${r.rid}"]`);
    if (!el) return r;
    el.querySelectorAll('[data-f]').forEach(f => { if (!f.disabled) r[f.dataset.f] = f.type === 'checkbox' ? f.checked : f.value.trim(); });
    r.itens = Array.from(el.querySelectorAll('.carga-linha')).map((l, k) => ({
        ...(r.itens[k] || {}), produto: l.querySelector('[data-item="produto"]').value, litros: l.querySelector('[data-item="litros"]').value
    }));
    return r;
}

// Confere e monta o registro para gravar (ou devolve o erro)
function montar(r) {
    if (!r.posto) return { erro: 'Escolha o posto.' };
    if (!r.fornecedor) return { erro: 'Informe o fornecedor.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.dataEmissao || '')) return { erro: 'Informe a data de emissão.' };
    const itens = {};
    for (const i of r.itens) {
        if (!i.produto && !i.litros) continue;
        if (!i.produto) return { erro: 'Escolha o produto de cada linha.' };
        const l = Math.round(Number(i.litros));
        if (!(l > 0)) return { erro: `Informe os litros de ${rotulosProdutos[i.produto]}.` };
        itens[i.produto] = (itens[i.produto] || 0) + l;
    }
    if (!Object.keys(itens).length) return { erro: 'Informe ao menos um produto com os litros.' };
    if ((r.jaRecebida || r.recebida) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.dataRecebida || '')) return { erro: 'Informe a data e hora em que a carga chegou.' };
    const c = {
        origem: r.tipo, fornecedor: r.fornecedor.slice(0, 120), dataEmissao: r.dataEmissao, itens,
        valor: Math.max(0, Math.round(Number(String(r.valor || 0).replace(',', '.')) * 100) / 100) || 0
    };
    if (r.numero) c.numero = String(r.numero).slice(0, 20);
    if (r.chave && r.chave.length === 44) c.chave = r.chave;
    if (r.chaveCTe && r.chaveCTe.length === 44) c.chaveCTe = r.chaveCTe;
    if (r.transporte) c.transporte = r.transporte.slice(0, 300);
    if (r.obs) c.obs = r.obs.slice(0, 300);
    return { c };
}

async function lancar(r, botao) {
    lerEditor(r);
    if (!r.editando && r.duplicada) { aviso(`Esta nota já foi lançada para ${r.posto}. Descarte ou edite a que já existe.`, 'erro'); return false; }
    const { c, erro } = montar(r);
    if (erro) { aviso(erro, 'erro'); return false; }
    return comEspera(botao, async () => {
        try {
            if (r.editando) {
                const orig = acharCarga(r.posto, r.id);
                const novo = { ...orig, ...c };
                if (orig.recebimento && !orig.descargas && r.dataRecebida) novo.recebimento = { ...orig.recebimento, data: r.dataRecebida };
                ['numero', 'transporte', 'obs'].forEach(k => { if (!(k in c)) delete novo[k]; });
                await editarCarga(r.posto, novo, orig);
                registrarLog('carga', `Editou a carga ${c.numero ? 'NF ' + c.numero + ' ' : ''}de ${r.posto}: ${resumoItens(c.itens)}, ${reais(c.valor)}`);
                aviso('Carga atualizada!');
            } else {
                if (c.chave && await cargaExiste(r.posto, c.chave)) { r.duplicada = true; desenharRascunhos(); aviso('Esta nota já foi lançada para ' + r.posto + '.', 'erro'); return false; }
                await lancarCarga(r.posto, c, r.jaRecebida ? { data: r.dataRecebida, responsavel: 'Lançada já recebida' } : null);
                registrarLog('carga', `Lançou carga ${c.numero ? 'NF ' + c.numero + ' ' : ''}para ${r.posto} (${c.fornecedor}): ${resumoItens(c.itens)}, ${reais(c.valor)}${r.jaRecebida ? ', já recebida em ' + dataHoraLocal(r.dataRecebida) : ''}`);
                aviso(`Carga lançada para ${r.posto}!`);
            }
            rascunhos = rascunhos.filter(x => x !== r);
            desenharRascunhos();
            if (r.editando) fecharEdicao();
            return true;
        } catch (err) { console.error(err); aviso('Não foi salvo: ' + err.message, 'erro'); return false; }
    });
}

const resumoItens = (itens) => Object.entries(itens).map(([p, l]) => `${rotulosProdutos[p] || p} ${num(l)} L`).join(', ');

async function importarArquivos(files) {
    let lidos = 0;
    for (const f of files) {
        const texto = await f.text();
        const d = lerXML(texto, f.name);
        if (d.erro) { aviso(`${f.name}: ${d.erro}`, 'erro'); continue; }
        if (d.chave && rascunhos.some(r => r.chave === d.chave && r.posto === d.posto)) { aviso(`${f.name}: nota repetida, já está na lista.`, 'erro'); continue; }
        const r = { ...d, rid: ++seq, jaRecebida: !!$('cargas-ja-recebidas')?.checked, dataRecebida: d.dhEmi || (d.dataEmissao ? d.dataEmissao + 'T12:00' : '') };
        if (r.posto && r.chave) { try { r.duplicada = await cargaExiste(r.posto, r.chave); } catch (e) { /* confere de novo ao lançar */ } }
        rascunhos.push(r); lidos++;
    }
    desenharRascunhos();
    if (lidos) aviso(`${lidos} arquivo${lidos > 1 ? 's' : ''} lido${lidos > 1 ? 's' : ''}. Confira e lance.`);
}

// Rascunho já preenchido (vem da conferência da evolução: "descarga sem nota")
export function novoRascunhoCarga({ posto, produto, litros, dataRecebida }) {
    document.querySelector('[data-aba-gestor="cargas"]')?.click();
    rascunhos.push({ rid: ++seq, tipo: 'manual', posto, itens: [{ produto, litros }], dataEmissao: (dataRecebida || hojeISO()).slice(0, 10), jaRecebida: true, dataRecebida, aviso: 'Preenchido pela descarga do caixa. Se tiver o XML da nota, prefira importar o XML e descarte este.' });
    desenharRascunhos();
    setTimeout(() => document.querySelector('#cargas-rascunhos .carga-editor:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
}

// Edição (admin): abre o editor dentro de uma janela
let janelaEdicao = null;
function fecharEdicao() { if (janelaEdicao) { janelaEdicao.remove(); janelaEdicao = null; } rascunhos = rascunhos.filter(r => !r.editando); desenharRascunhos(); }
function abrirEdicao(c) {
    rascunhos = rascunhos.filter(r => !r.editando);
    const r = {
        rid: ++seq, editando: true, id: c.id, tipo: c.origem, posto: c.posto, fornecedor: c.fornecedor, numero: c.numero || '', dataEmissao: c.dataEmissao,
        valor: c.valor, transporte: c.transporte || '', obs: c.obs || '', chave: c.chave, recebida: !!c.recebimento && !c.descargas, dataRecebida: c.recebimento?.data || '', nomeArquivo: c.numero ? 'nº ' + c.numero : '',
        itens: Object.entries(c.itens || {}).map(([produto, litros]) => ({ produto, litros }))
    };
    rascunhos.push(r);
    janelaEdicao = document.createElement('div');
    janelaEdicao.className = 'janela-fundo';
    janelaEdicao.innerHTML = `<div class="janela janela-carga" role="dialog" aria-modal="true"><div class="janela-topo"><h2>Editar carga</h2><button type="button" class="botao-fechar" data-rasc="fechar-edicao" aria-label="Fechar">&times;</button></div><div id="carga-edicao"></div></div>`;
    document.body.appendChild(janelaEdicao);
    $('carga-edicao').innerHTML = editor(r);
}

// ---------- Descarga (gerente / gestor / administrador), inteira ou em partes ----------
function abrirRecebimento(c) {
    const falta = faltaPorProduto(c);
    const prods = Object.keys(c.itens || {}).filter(p => falta[p] > 0);
    const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const outros = Object.keys(configPostos).filter(p => p !== c.posto);
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo';
    fundo.innerHTML = `<div class="janela janela-carga" role="dialog" aria-modal="true">
        <div class="janela-topo"><div><h2>${c.status === 'parcial' ? 'Registrar o restante' : 'Registrar descarga'}</h2><p class="texto-suave">${esc(c.posto)} · ${esc(c.fornecedor)}${c.numero ? ' · NF ' + esc(c.numero) : ''}</p></div>
            <button type="button" class="botao-fechar" data-r="fechar" aria-label="Fechar">&times;</button></div>
        ${c.transporte ? `<p class="carga-aviso carga-lacres">${icone('caminhao')} ${esc(c.transporte)}</p>` : ''}
        <form id="form-recebimento">
            <div class="grade-2">
                <div><label class="rotulo" for="rec-data">Data e hora da descarga</label><input type="datetime-local" id="rec-data" class="campo" value="${agora}" required></div>
                <div><label class="rotulo" for="rec-resp">Quem conferiu</label><input id="rec-resp" class="campo" maxlength="60" placeholder="Nome de quem acompanhou" required></div>
            </div>
            <p class="dica">Informe quanto foi <b>descarregado neste posto agora</b>. Se não coube tudo no tanque, diga o que aconteceu com o restante.</p>
            <div class="rec-produtos">${prods.map(p => `<div class="rec-produto" data-prod="${p}">
                <strong>${rotulosProdutos[p] || p} <small>nota: ${num(c.itens[p])} ${unidade(p)}${falta[p] < c.itens[p] ? ` · falta: ${num(falta[p])}` : ''}</small></strong>
                <div><label class="rotulo" for="rec-qtd-${p}">Descarregado aqui</label><input type="number" min="0" step="1" inputmode="numeric" id="rec-qtd-${p}" class="campo" data-qtd="${p}" value="${falta[p]}"></div>
                <div class="rec-resto oculto" data-resto="${p}">
                    <p class="rec-resto-txt"></p>
                    <label class="caixa-marcar"><input type="radio" name="resto-${p}" value="caminhao" checked> Ficou no caminhão (descarrega depois)</label>
                    ${PROD_EMPRESTIMO[p] ? `<label class="caixa-marcar"><input type="radio" name="resto-${p}" value="outro"> Foi para outro posto (vira empréstimo)</label>
                    <select class="campo oculto" data-destino="${p}"><option value="">Qual posto recebeu?</option>${outros.map(o => `<option>${esc(o)}</option>`).join('')}</select>` : ''}
                </div>
            </div>`).join('')}</div>
            <label class="caixa-marcar"><input type="checkbox" id="rec-lacres"> Lacres conferidos e intactos</label>
            <div><label class="rotulo" for="rec-obs">Observação (opcional)</label><input id="rec-obs" class="campo" maxlength="300" placeholder="Ex.: tanque cheio, resto amanhã"></div>
            <div class="acoes">
                <button type="button" class="botao botao-claro" data-r="fechar">Voltar</button>
                <button type="submit" class="botao botao-sucesso">${icone('check')} Confirmar</button>
            </div>
        </form></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-r="fechar"]')) fechar(); });
    const atualizarResto = () => prods.forEach(p => {
        const q = Math.max(0, Math.round(Number(fundo.querySelector(`[data-qtd="${p}"]`).value || 0)));
        const resto = falta[p] - q, bloco = fundo.querySelector(`[data-resto="${p}"]`);
        bloco.classList.toggle('oculto', resto <= 0);
        bloco.querySelector('.rec-resto-txt').innerHTML = resto > 0 ? `Restante: <b>${num(resto)} ${unidade(p)}</b>` : '';
        const outro = fundo.querySelector(`input[name="resto-${p}"][value="outro"]`)?.checked;
        fundo.querySelector(`[data-destino="${p}"]`)?.classList.toggle('oculto', !outro);
    });
    fundo.addEventListener('input', atualizarResto);
    fundo.addEventListener('change', atualizarResto);
    atualizarResto();
    $('form-recebimento').onsubmit = async (e) => {
        e.preventDefault();
        const responsavel = $('rec-resp').value.trim().replace(/\s+/g, ' ');
        if (responsavel.length < 2) return aviso('Informe quem conferiu a descarga.', 'erro');
        const dataHoraDesc = $('rec-data').value.slice(0, 16);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dataHoraDesc)) return aviso('Informe a data e a hora da descarga.', 'erro');
        const itens = {}, transferencias = {}, emprestimos = {};
        let completa = true;
        for (const p of prods) {
            const q = Math.round(Number(fundo.querySelector(`[data-qtd="${p}"]`).value || 0));
            if (q < 0 || q > falta[p]) return aviso(`${rotulosProdutos[p]}: descarregado não pode passar de ${num(falta[p])}.`, 'erro');
            itens[p] = q;
            const resto = falta[p] - q;
            if (resto <= 0) continue;
            if (fundo.querySelector(`input[name="resto-${p}"][value="outro"]`)?.checked) {
                const destino = fundo.querySelector(`[data-destino="${p}"]`).value;
                if (!destino) return aviso(`${rotulosProdutos[p]}: escolha o posto que recebeu o restante.`, 'erro');
                const [a, m, d] = [dataHoraDesc.slice(0, 4), dataHoraDesc.slice(5, 7), dataHoraDesc.slice(8, 10)];
                const dia = diaDasVendasPelaHora(new Date(+a, +m - 1, +d, +dataHoraDesc.slice(11, 13), +dataHoraDesc.slice(14, 16)));
                const emp = dadosEmprestimo({ data: dia, origem: c.posto, destino, produto: PROD_EMPRESTIMO[p], volume: resto });
                emprestimos[emp.id] = emp.dados;
                transferencias[p] = { posto: destino, litros: resto, emprestimo: emp.id };
            } else completa = false;
        }
        if (!Object.values(itens).some(q => q > 0) && !Object.keys(transferencias).length) return aviso('Informe quanto foi descarregado.', 'erro');
        const desc = { data: dataHoraDesc, responsavel: responsavel.slice(0, 60), lacres: $('rec-lacres').checked, itens };
        if (Object.keys(transferencias).length) desc.transferencias = transferencias;
        if ($('rec-obs').value.trim()) desc.obs = $('rec-obs').value.trim().slice(0, 300);
        // produtos da nota que já estavam completos continuam completos
        if (!desc.lacres && !await confirmar('Lacres', 'Os lacres NÃO foram marcados como conferidos. Confirmar mesmo assim?', 'Confirmar')) return;
        await comEspera(e.submitter, async () => {
            try {
                await registrarDescarga(c.posto, c, desc, completa ? 'recebida' : 'parcial', emprestimos);
                const partes = Object.entries(itens).filter(([, q]) => q > 0).map(([p, q]) => `${rotulosProdutos[p]} ${num(q)} L`);
                const transf = Object.entries(transferencias).map(([p, t]) => `${num(t.litros)} L de ${rotulosProdutos[p]} para o ${t.posto} (empréstimo)`);
                registrarLog('carga', `Registrou descarga ${completa ? 'final' : 'parcial'} da carga ${c.numero ? 'NF ' + c.numero + ' ' : ''}em ${c.posto}: ${partes.join(', ') || 'nada aqui'}${transf.length ? '; ' + transf.join(', ') : ''}. Conferida por ${desc.responsavel}`);
                aviso(completa ? 'Descarga registrada. Carga recebida!' : 'Descarga parcial registrada. O restante continua a caminho.');
                fechar();
                recarregar();
            } catch (err) { console.error(err); aviso('Não foi salvo: ' + err.message, 'erro'); }
        });
    };
}

// ---------- Botões ----------
let ativado = false;
export function ativarCargas() {
    if (ativado) return; ativado = true;
    document.addEventListener('input', (e) => { if (e.target.id === 'cargas-busca') { limiteRecebidas = 30; desenharListasGestor(); } });
    document.addEventListener('change', (e) => {
        if (e.target.id === 'cargas-arquivo') { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) importarArquivos(fs); }
        const ed = e.target.closest('.carga-editor');
        if (ed && e.target.dataset.f === 'jaRecebida') ed.querySelector('[data-bloco-recebida]').classList.toggle('oculto', !e.target.checked);
        if (e.target.id === 'cargas-ja-recebidas') rascunhos.filter(r => !r.editando).forEach(r => { lerEditor(r); r.jaRecebida = e.target.checked; reDesenhar(r); });
        if (ed && e.target.dataset.f === 'posto') { const r = rascunhos.find(x => x.rid === Number(ed.dataset.rid)); if (r) { lerEditor(r); r.aviso = ''; r.duplicada = false; reDesenhar(r); } }
    });
    document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-carga],[data-rasc],#cargas-manual,#cargas-lancar-todas,#cargas-mais-recebidas');
        if (!b) return;
        if (b.id === 'cargas-mais-recebidas') { limiteRecebidas += 30; desenharListasGestor(); return; }
        if (b.id === 'cargas-manual') { rascunhos.push({ rid: ++seq, tipo: 'manual', itens: [], dataEmissao: hojeISO(), jaRecebida: !!$('cargas-ja-recebidas')?.checked }); desenharRascunhos(); return; }
        if (b.id === 'cargas-lancar-todas') {
            for (const r of rascunhos.filter(x => !x.editando)) lerEditor(r);
            const erros = rascunhos.filter(r => !r.editando).map(r => montar(r).erro).filter(Boolean);
            if (erros.length) return aviso(`Falta completar ${erros.length} carga(s): ${erros[0]}`, 'erro');
            let n = 0;
            for (const r of [...rascunhos.filter(x => !x.editando)]) if (await lancar(r, b)) n++;
            if (n) carregarCargasGestor();
            return;
        }
        if (b.dataset.rasc) {
            if (b.dataset.rasc === 'fechar-edicao') return fecharEdicao();
            const ed = b.closest('.carga-editor'), r = rascunhos.find(x => x.rid === Number(ed?.dataset.rid));
            if (!r) return;
            if (b.dataset.rasc === 'remover') { if (r.editando) return fecharEdicao(); rascunhos = rascunhos.filter(x => x !== r); return desenharRascunhos(); }
            lerEditor(r);
            if (b.dataset.rasc === 'mais-linha') { r.itens.push({ produto: '', litros: '' }); return reDesenhar(r); }
            if (b.dataset.rasc === 'tirar-linha') { r.itens.splice(Number(b.dataset.k), 1); return reDesenhar(r); }
            if (b.dataset.rasc === 'lancar') { if (await lancar(r, b)) recarregar(); }
            return;
        }
        const c = acharCarga(b.dataset.posto, b.dataset.id);
        if (!c) return;
        if (b.dataset.carga === 'receber') abrirRecebimento(c);
        if (b.dataset.carga === 'editar') abrirEdicao(c);
        if (b.dataset.carga === 'estornar') {
            const transf = Object.values(c.descargas || {}).flatMap(d => Object.values(d.transferencias || {}));
            const motivo = await pedirTexto('Estornar recebimento', `A carga ${c.numero ? 'NF ' + c.numero + ' ' : ''}de ${c.posto} volta para "a caminho" e as descargas registradas são desfeitas${transf.length ? `, junto com ${transf.length} empréstimo(s) criado(s) nelas` : ''}.`, 'Motivo (ex.: registrei 62 mil mas só descarregou 45 mil)', 'Estornar');
            if (motivo === null) return;
            await comEspera(b, async () => {
                try {
                    await estornarRecebimento(c.posto, c, motivo || 'sem motivo');
                    registrarLog('carga', `Estornou o recebimento da carga ${c.numero ? 'NF ' + c.numero + ' ' : ''}de ${c.posto}${motivo ? ': ' + motivo : ''}`);
                    aviso('Recebimento estornado. A carga voltou para "a caminho".');
                    recarregar();
                } catch (err) { aviso('Não foi possível estornar: ' + err.message, 'erro'); }
            });
        }
        if (b.dataset.carga === 'cancelar') {
            const motivo = await pedirTexto('Cancelar carga', `Cancelar a carga ${c.numero ? 'NF ' + c.numero : ''} de ${c.posto}? Ela sai da lista "A caminho".`, 'Motivo (ex.: lançada em duplicidade)', 'Anular');
            if (motivo === null) return;
            await comEspera(b, async () => {
                try {
                    await cancelarCarga(c.posto, c, motivo || 'sem motivo');
                    registrarLog('carga', `Cancelou a carga ${c.numero ? 'NF ' + c.numero + ' ' : ''}de ${c.posto}${motivo ? ': ' + motivo : ''}`);
                    aviso('Carga cancelada.');
                    recarregar();
                } catch (err) { aviso('Não foi possível cancelar: ' + err.message, 'erro'); }
            });
        }
    });
}

// Redesenha só um editor (na lista ou na janela de edição)
function reDesenhar(r) {
    const el = document.querySelector(`.carga-editor[data-rid="${r.rid}"]`);
    if (!el) return desenharRascunhos();
    const tmp = document.createElement('div'); tmp.innerHTML = editor(r); el.replaceWith(tmp.firstElementChild);
}

export { numeroDaChave };
