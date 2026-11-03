// Tela do caixa / pista: encerrantes e fechamento de turno
import { bicosPostos, rotulosProdutos, getProdutosPermitidos, unidade } from "./config.js";
import { estado, salvarPosto, escutarDados } from "./dados.js";
import { $, esc, num, temValor, agoraFormatado, aviso, comEspera } from "./util.js";

let produtos = [];

export function abrirCaixa() {
    const posto = estado.postoAtivo;
    $('tela-caixa').classList.remove('oculto');
    $('caixa-titulo').textContent = posto;
    montarFormularios();
    desenharReferencia();
    estado.aoMudarDados = (p) => { if (p === posto) desenharReferencia(); };
    escutarDados();
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

    $('planilha-linhas').oninput = (e) => { if (e.target.dataset.produto) calcularLinha(e.target.dataset.produto); };
    $('form-encerrantes').onsubmit = salvarEncerrantes;
    $('form-planilha').onsubmit = salvarPlanilha;
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
    const total = produtos.reduce((s, prod) => s + (Number($(`${prod}-ven`).value) || 0), 0);
    const totalEl = $('total-vendido');
    totalEl.textContent = num(total);
    totalEl.parentElement.classList.remove('pulso'); void totalEl.offsetWidth; totalEl.parentElement.classList.add('pulso');
}

function limparPlanilha() {
    $('form-planilha').reset();
    $('total-vendido').textContent = '0';
    produtos.forEach(p => {
        $(`${p}-fin`).textContent = '0';
        const d = $(`${p}-dif`); d.textContent = '0'; d.className = 'resultado'; d.dataset.valor = 0;
    });
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

async function salvarEncerrantes(e) {
    e.preventDefault();
    const enc = {};
    (bicosPostos[estado.postoAtivo] || []).forEach(b => enc[b.id] = $(`bico-${b.id}`).value);
    await comEspera(e.submitter, async () => {
        try {
            await salvarPosto({ dataEncerrantes: agoraFormatado(), encerrantes: enc });
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
    const valores = {};
    let txt = `📊 *FECHAMENTO - 2B*\n🏢 Posto: ${posto}\n🕒 Horário: ${new Date().toLocaleString('pt-BR')}\n\n`;

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
    txt += `💧 *TOTAL VENDIDO (LITROS):* ${$('total-vendido').textContent} L`;

    // Copia primeiro: o navegador só deixa copiar logo após o clique
    let copiou = false;
    try { await navigator.clipboard.writeText(txt); copiou = true; } catch (err) { /* sem permissão */ }

    await comEspera(e.submitter, async () => {
        try {
            await salvarPosto({ dataFormatada: agoraFormatado(), tipoEnvio: "Fechamento de Turno", valores });
        } catch (err) {
            aviso('A planilha NÃO foi salva: ' + err.message + '\nNão apague os dados e tente de novo.', 'erro');
            return;
        }
        aviso(copiou ? 'Fechamento salvo e copiado! É só colar no WhatsApp.' : 'Fechamento salvo, mas não deu para copiar o texto.', copiou ? 'ok' : 'info');
        limparPlanilha();
    });
}
