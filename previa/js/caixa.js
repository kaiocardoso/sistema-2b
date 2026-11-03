// Tela do caixa / pista: encerrantes e fechamento de turno
import { bicosPostos, rotulosProdutos, getProdutosPermitidos, unidade } from "./config.js";
import { estado, salvarPosto, escutarDados, buscarHistorico, analisarHistorico } from "./dados.js";
import { $, esc, num, temValor, agoraFormatado, aviso, comEspera, hojeISO, limitesDoDia } from "./util.js";
import { icone } from "./icones.js";
import { abrirSecao } from "./secoes.js";

let produtos = [];
let ultimoFechamento = null;   // { ts, reg } do último fechamento de hoje
let correcao = null;           // fechamento que está sendo corrigido

const TEXTO_BOTAO = `${icone('mensagem')} Salvar e copiar para o WhatsApp`;
const TEXTO_BOTAO_CORRECAO = `${icone('mensagem')} Salvar correção e copiar para o WhatsApp`;
const horaDe = (ts) => new Date(Number(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function abrirCaixa() {
    const posto = estado.postoAtivo;
    $('tela-caixa').classList.remove('oculto');
    $('caixa-titulo').textContent = posto;
    montarFormularios();
    desenharReferencia();
    estado.aoMudarDados = (p) => { if (p === posto) desenharReferencia(); };
    escutarDados();
    carregarUltimoFechamento();
}

// Os campos são montados UMA VEZ, para não apagar o que está sendo digitado
function montarFormularios() {
    const posto = estado.postoAtivo;
    const bicos = bicosPostos[posto] || [];
    produtos = getProdutosPermitidos(posto);
    $('caixa-qtd-bicos').textContent = `${bicos.length} bicos`;
    $('caixa-qtd-produtos').textContent = `${produtos.length} produtos`;

    $('campos-encerrantes').innerHTML = bicos.map(b => `
        <div class="campo-grupo">
            <label class="rotulo" for="bico-${b.id}"><span class="bico-numero">${b.id}</span> ${esc(b.produto)}</label>
            <input type="number" inputmode="decimal" step="any" id="bico-${b.id}" class="campo" placeholder="Leitura atual">
            <small class="dica" id="bico-${b.id}-ant"></small>
        </div>`).join('');

    const campo = (p, tipo, rotulo, dica = '') => `
        <div class="celula">
            <label for="${p}-${tipo}">${rotulo}</label>
            <input type="number" inputmode="decimal" step="any" id="${p}-${tipo}" class="campo" data-produto="${p}">
            ${dica}
        </div>`;
    $('planilha-linhas').innerHTML = produtos.map(p => `
        <div class="linha-produto">
            <div class="produto-nome">${rotulosProdutos[p]} <small>${unidade(p) === 'un' ? 'unidades' : 'litros'}</small></div>
            ${campo(p, 'ini', 'Est. inicial', `<small class="dica" id="${p}-ant"></small>`)}
            ${campo(p, 'des', 'Descarga')}
            ${campo(p, 'ven', 'Vendido')}
            <div class="celula"><label>Est. final</label><div id="${p}-fin" class="resultado">0</div></div>
            ${campo(p, 'reg', 'Régua')}
            <div class="celula"><label>Diferença</label><div id="${p}-dif" class="resultado">0</div></div>
        </div>`).join('');
    $('total-vendido').textContent = '0';
    $('botao-fechamento').innerHTML = TEXTO_BOTAO;

    $('planilha-linhas').oninput = (e) => { if (e.target.dataset.produto) calcularLinha(e.target.dataset.produto); };
    $('form-encerrantes').onsubmit = salvarEncerrantes;
    $('form-planilha').onsubmit = salvarPlanilha;
    $('ultimo-fechamento').onclick = (e) => { if (e.target.closest('[data-correcao="editar"]')) iniciarCorrecao(); };
    $('modo-correcao').onclick = (e) => { if (e.target.closest('[data-correcao="cancelar"]')) cancelarCorrecao(); };
}

function calcularLinha(p) {
    const v = (t) => Number($(`${p}-${t}`).value) || 0;
    const fin = v('ini') + v('des') - v('ven');
    const dif = v('reg') - fin;
    $(`${p}-fin`).textContent = num(fin);
    const difEl = $(`${p}-dif`);
    difEl.textContent = num(dif);
    difEl.className = 'resultado ' + (dif < 0 ? 'negativo' : dif > 0 ? 'positivo' : '');
    difEl.dataset.valor = dif;
    atualizarTotal();
}

// Total em litros (o ARLA balde é contado em unidades, por isso fica à parte)
function totais() {
    const litros = produtos.filter(p => p !== 'arla_b').reduce((s, p) => s + (Number($(`${p}-ven`).value) || 0), 0);
    const balde = produtos.includes('arla_b') ? (Number($('arla_b-ven').value) || 0) : 0;
    return { litros, balde };
}

function atualizarTotal() {
    const { litros, balde } = totais();
    const el = $('total-vendido');
    el.textContent = num(litros);
    $('total-balde').textContent = balde ? `+ ${num(balde)} un de ARLA balde` : '';
    const barra = el.closest('.total-vendido');
    barra.classList.remove('pulso'); void barra.offsetWidth; barra.classList.add('pulso');
}

function limparPlanilha() {
    $('form-planilha').reset();
    produtos.forEach(p => {
        $(`${p}-fin`).textContent = '0';
        const d = $(`${p}-dif`); d.textContent = '0'; d.className = 'resultado'; d.dataset.valor = 0;
    });
    $('total-vendido').textContent = '0';
    $('total-balde').textContent = '';
}

function desenharReferencia() {
    const posto = estado.postoAtivo;
    const info = estado.dados[posto];

    // Valores anteriores ao lado de cada campo
    (bicosPostos[posto] || []).forEach(b => {
        const e = info?.encerrantes?.[b.id];
        const el = $(`bico-${b.id}-ant`);
        if (el) el.textContent = temValor(e) ? `Anterior: ${num(Number(e))}` : '';
    });
    produtos.forEach(p => {
        const r = info?.valores?.[p]?.regua;
        const el = $(`${p}-ant`);
        if (el) el.textContent = temValor(r) ? `Anterior: ${num(Number(r))}` : '';
    });

    if (!info) {
        $('caixa-referencia').innerHTML = '<p class="vazio-lista">Nenhum registro anterior para este posto.</p>';
        $('caixa-ref-data').textContent = 'Sem registros';
        return;
    }
    $('caixa-ref-data').textContent = info.dataFormatada || info.dataEncerrantes || 'Registrado';

    const tanques = getProdutosPermitidos(posto).map(p => {
        const r = info?.valores?.[p]?.regua;
        return `<div class="ref-linha"><span>${rotulosProdutos[p]}</span><strong>${temValor(r) ? num(Number(r)) + ' ' + unidade(p) : '–'}</strong></div>`;
    }).join('');
    const bicos = info.encerrantes
        ? (bicosPostos[posto] || []).map(b => {
            const e = info.encerrantes[b.id];
            return `<div class="ref-linha"><span>Bico ${b.id} · ${esc(b.produto)}</span><strong>${temValor(e) ? num(Number(e)) : '–'}</strong></div>`;
        }).join('')
        : '<p class="texto-suave">Sem encerrantes salvos.</p>';

    $('caixa-referencia').innerHTML = `
        <div class="ref-bloco"><h4>Estoque final anterior</h4>${tanques}</div>
        <div class="ref-bloco"><h4>Encerrantes anteriores</h4><div class="ref-rolagem">${bicos}</div></div>`;
}

// ---------- Último fechamento e correção ----------
const litrosDe = (reg) => Object.entries(reg?.valores || {}).reduce((s, [p, v]) => p === 'arla_b' ? s : s + (Number(v?.vendido) || 0), 0);

async function carregarUltimoFechamento() {
    const caixa = $('ultimo-fechamento');
    try {
        const hoje = hojeISO();
        const [inicio, fim] = limitesDoDia(hoje);
        const { validos } = analisarHistorico(await buscarHistorico(estado.postoAtivo, inicio, fim), hoje);
        ultimoFechamento = validos.at(-1) || null;
    } catch (e) {
        console.error(e);
        ultimoFechamento = null;
    }
    desenharUltimoFechamento();
    caixa.classList.remove('oculto');
}

function desenharUltimoFechamento() {
    const caixa = $('ultimo-fechamento');
    if (correcao) { caixa.classList.add('oculto'); return; }
    caixa.classList.remove('oculto');
    if (!ultimoFechamento) {
        caixa.innerHTML = `<span class="ultimo-texto">${icone('relogio')} Nenhum fechamento enviado hoje ainda.</span>`;
        return;
    }
    const { ts, reg } = ultimoFechamento;
    caixa.innerHTML = `
        <span class="ultimo-texto">${icone('check')} Último fechamento de hoje: <b>${horaDe(ts)}</b> · ${num(litrosDe(reg))} L${reg.evento === 'correcao' ? ' <span class="chip chip-azul">corrigido</span>' : ''}</span>
        <button type="button" class="botao botao-claro botao-mini" data-correcao="editar">${icone('lapis')} Editar último fechamento</button>`;
}

function iniciarCorrecao() {
    if (!ultimoFechamento) return;
    correcao = ultimoFechamento;
    limparPlanilha();
    produtos.forEach(p => {
        const v = correcao.reg.valores?.[p] || {};
        $(`${p}-ini`).value = v.inicial ?? '';
        $(`${p}-des`).value = v.descarga ?? '';
        $(`${p}-ven`).value = v.vendido ?? '';
        $(`${p}-reg`).value = v.regua ?? '';
        calcularLinha(p);
    });
    $('modo-correcao').innerHTML = `
        <div class="correcao-texto">${icone('lapis')}<div><b>Corrigindo o fechamento das ${horaDe(correcao.ts)}</b>
        <span>Os valores enviados foram carregados abaixo. Corrija o que estiver errado e salve: o fechamento anterior será substituído e não soma de novo nas vendas do dia.</span></div></div>
        <button type="button" class="botao botao-claro botao-mini" data-correcao="cancelar">Cancelar correção</button>`;
    $('modo-correcao').classList.remove('oculto');
    $('botao-fechamento').innerHTML = TEXTO_BOTAO_CORRECAO;
    desenharUltimoFechamento();
    abrirSecao('caixa-fechamento');
    $('modo-correcao').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelarCorrecao() {
    correcao = null;
    limparPlanilha();
    $('modo-correcao').classList.add('oculto');
    $('botao-fechamento').innerHTML = TEXTO_BOTAO;
    desenharUltimoFechamento();
}

// ---------- Salvar ----------
async function salvarEncerrantes(e) {
    e.preventDefault();
    const enc = {};
    (bicosPostos[estado.postoAtivo] || []).forEach(b => enc[b.id] = $(`bico-${b.id}`).value);
    await comEspera(e.submitter, async () => {
        try {
            await salvarPosto({ dataEncerrantes: agoraFormatado(), encerrantes: enc }, 'encerrantes');
            aviso('Leituras dos encerrantes salvas!');
            $('form-encerrantes').reset();
        } catch (err) {
            aviso('Não foi salvo: ' + err.message, 'erro');
        }
    });
}

async function salvarPlanilha(e) {
    e.preventDefault();
    const posto = estado.postoAtivo;
    const corrigindo = correcao;
    const valores = {};
    let txt = corrigindo ? `✏️ *CORREÇÃO do fechamento das ${horaDe(corrigindo.ts)}*\n` : '';
    txt += `📊 *FECHAMENTO - 2B*\n🏢 Posto: ${posto}\n🕒 Horário: ${new Date().toLocaleString('pt-BR')}\n\n`;

    produtos.forEach(p => {
        const s = (t) => $(`${p}-${t}`).value;
        const [iStr, dStr, vStr, rStr] = [s('ini'), s('des'), s('ven'), s('reg')];
        valores[p] = { regua: rStr, vendido: vStr, inicial: iStr, descarga: dStr };
        const i = Number(iStr) || 0, d = Number(dStr) || 0, v = Number(vStr) || 0, r = Number(rStr) || 0;
        const dif = Number($(`${p}-dif`).dataset.valor) || 0;
        if (i > 0 || d > 0 || v > 0 || rStr !== "") {
            const u = unidade(p);
            txt += `⛽ *${rotulosProdutos[p]}*\nInicial: ${i} ${u} | Descarga: ${d} ${u}\nVendido: ${v} ${u} | Régua: ${r} ${u}\n*Diferença:* ${dif < 0 ? '🔴' : '🟢'} ${dif} ${u}\n\n`;
        }
    });

    let txtEnc = `🔢 *ENCERRANTES DOS BICOS*\n`, temEnc = false;
    (bicosPostos[posto] || []).forEach(b => {
        let val = ($(`bico-${b.id}`)?.value || '').trim();
        if (val === '' && estado.dados[posto]?.encerrantes) val = estado.dados[posto].encerrantes[b.id] || '';
        if (val !== '') { temEnc = true; txtEnc += `Bico ${b.id}: ${val}\n`; }
    });
    if (temEnc) txt += txtEnc + '\n';
    const { litros, balde } = totais();
    txt += `💧 *TOTAL VENDIDO (LITROS):* ${num(litros)} L`;
    if (balde) txt += `\n🪣 *ARLA BALDE:* ${num(balde)} un`;

    // Copia primeiro: o navegador só deixa copiar logo após o clique
    let copiou = false;
    try { await navigator.clipboard.writeText(txt); copiou = true; } catch (err) { /* sem permissão */ }

    await comEspera(e.submitter, async () => {
        try {
            const extras = corrigindo ? { substitui: String(corrigindo.ts), ...(corrigindo.reg.dataFormatada ? { substituiData: corrigindo.reg.dataFormatada } : {}) } : {};
            await salvarPosto({ dataFormatada: agoraFormatado(), tipoEnvio: "Fechamento de Turno", valores }, corrigindo ? 'correcao' : 'fechamento', extras);
        } catch (err) {
            aviso('A planilha NÃO foi salva: ' + err.message + '\nNão apague os dados e tente de novo.', 'erro');
            return;
        }
        const msg = corrigindo ? 'Correção salva! O fechamento anterior foi substituído.' : 'Fechamento salvo!';
        aviso(copiou ? `${msg} O texto foi copiado, é só colar no WhatsApp.` : `${msg} Mas não deu para copiar o texto.`, copiou ? 'ok' : 'info');
        cancelarCorrecao();
        carregarUltimoFechamento();
    });
}
