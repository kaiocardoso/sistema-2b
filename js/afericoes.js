// Aferições semanais dos bicos (gerente registra; gestores acompanham)
import { bicosPostos, AFERICAO_VOLUME_L, AFERICAO_TOLERANCIA_ML, AFERICAO_PRAZO_DIAS } from "./config.js";
import { estado, salvarAfericao, buscarAfericoes, registrarLog } from "./dados.js";
import { $, esc, num, hojeISO, dataBR, aviso, comEspera, confirmar } from "./util.js";
import { icone } from "./icones.js";

const TOL = AFERICAO_TOLERANCIA_ML;
const situacao = (ml) => ml === null || ml === undefined || ml === '' ? 'sem' : Math.abs(Number(ml)) <= TOL ? 'ok' : 'fora';
const sinal = (ml) => `${Number(ml) > 0 ? '+' : ''}${num(Number(ml))} mL`;
const diasDesde = (iso) => { const [a, m, d] = iso.split('-').map(Number); return Math.floor((Date.now() - new Date(a, m - 1, d).getTime()) / 86400000); };

function contar(af) {
    const vals = Object.values(af.bicos || {}).filter(v => v !== null && v !== '');
    return { total: vals.length, fora: vals.filter(v => situacao(v) === 'fora').length };
}

// ---------- Tela do gerente ----------
export function abrirAfericoesGerente() {
    const posto = estado.postoAtivo;
    const bicos = bicosPostos[posto] || [];
    $('afericao-regra').innerHTML = `Teste com a medida padrão de <b>${AFERICAO_VOLUME_L} litros</b>. Informe a diferença em <b>mL</b>: positivo se passou do traço, negativo se faltou. Tolerância: <b>até ±${TOL} mL</b>. Deixe vazio o bico que não foi aferido.`;
    $('campos-afericao').innerHTML = bicos.map(b => `
        <div class="campo-grupo afericao-bico" data-bico="${b.id}">
            <label class="rotulo" for="af-${b.id}"><span class="bico-numero">${b.id}</span> ${esc(b.produto)}</label>
            <div class="campo-com-unidade"><input type="number" inputmode="numeric" step="1" id="af-${b.id}" class="campo" placeholder="0"><span>mL</span></div>
            <small class="dica" id="af-${b.id}-sit"></small>
            <input type="text" id="af-${b.id}-obs" class="campo campo-obs-bico" maxlength="200" placeholder="Ocorrência no bico (opcional)">
        </div>`).join('');
    $('af-data').max = hojeISO(); $('af-data').value = hojeISO();
    $('campos-afericao').oninput = (e) => {
        const caixa = e.target.closest('.afericao-bico');
        if (!caixa || e.target.classList.contains('campo-obs-bico')) return;
        const v = e.target.value.trim();
        const s = situacao(v === '' ? null : Number(v));
        caixa.classList.toggle('af-ok', s === 'ok'); caixa.classList.toggle('af-fora', s === 'fora');
        $(`af-${caixa.dataset.bico}-sit`).textContent = s === 'ok' ? '✓ Dentro da tolerância' : s === 'fora' ? `⚠ Fora da tolerância (limite ±${TOL} mL)` : '';
    };
    $('form-afericao').onsubmit = salvar;
    carregarHistorico();
}

async function salvar(e) {
    e.preventDefault();
    const posto = estado.postoAtivo;
    const responsavel = $('af-responsavel').value.trim().replace(/\s+/g, ' ');
    const data = $('af-data').value;
    if (!responsavel) { aviso('Digite o nome de quem fez a aferição.', 'erro'); return $('af-responsavel').focus(); }
    if (!data || data > hojeISO()) { aviso('Confira a data da aferição.', 'erro'); return $('af-data').focus(); }
    const bicos = {}, ocorrencias = {};
    (bicosPostos[posto] || []).forEach(b => {
        const v = $(`af-${b.id}`).value.trim(); if (v !== '') bicos[b.id] = Math.round(Number(v));
        const o = $(`af-${b.id}-obs`).value.trim().replace(/\s+/g, ' '); if (o) ocorrencias[b.id] = o.slice(0, 200);
    });
    const n = Object.keys(bicos).length;
    if (!n) return aviso('Informe o resultado de pelo menos um bico.', 'erro');
    if (Object.values(bicos).some(v => Math.abs(v) > 2000)) return aviso('Confira os valores: use mililitros (ex.: 40 ou -60).', 'erro');
    const fora = Object.values(bicos).filter(v => situacao(v) === 'fora').length;
    const total = (bicosPostos[posto] || []).length;
    if (n < total && !await confirmar('Aferição incompleta', `Foram informados ${n} de ${total} bicos. Salvar mesmo assim?`, 'Salvar')) return;
    await comEspera(e.submitter, async () => {
        try {
            await salvarAfericao(posto, { data, responsavel, bicos, ...(Object.keys(ocorrencias).length ? { ocorrencias } : {}), observacao: $('af-obs').value.trim().slice(0, 300) });
            registrarLog('afericao', `Aferição de ${dataBR(data)}: ${n} bico(s) aferido(s), ${fora ? fora + ' fora da tolerância' : 'todos dentro da tolerância'}${Object.keys(ocorrencias).length ? `, ${Object.keys(ocorrencias).length} ocorrência(s) em bicos` : ''}. Responsável: ${responsavel}`);
            aviso(fora ? `Aferição salva. Atenção: ${fora} bico(s) fora da tolerância.` : 'Aferição salva! Todos dentro da tolerância.', fora ? 'info' : 'ok');
            $('form-afericao').reset(); $('af-data').value = hojeISO();
            document.querySelectorAll('.afericao-bico').forEach(c => { c.classList.remove('af-ok', 'af-fora'); });
            document.querySelectorAll('[id$="-sit"]').forEach(el => { if (el.id.startsWith('af-')) el.textContent = ''; });
            carregarHistorico();
        } catch (err) { console.error(err); aviso('Não foi salvo: ' + err.message, 'erro'); }
    });
}

async function carregarHistorico() {
    const lista = $('afericoes-lista');
    lista.innerHTML = '<div class="esqueleto"></div>';
    try {
        const afs = await buscarAfericoes(estado.postoAtivo);
        resumoChip($('gerente-af-resumo'), afs[0]);
        lista.innerHTML = afs.length ? afs.map((a, i) => cartao(estado.postoAtivo, a, i === 0)).join('') : '<div class="vazio-lista">Nenhuma aferição registrada ainda.</div>';
    } catch (e) { console.error(e); lista.innerHTML = '<div class="vazio-lista">Não foi possível carregar as aferições.</div>'; }
}

function resumoChip(el, ultima) {
    if (!el) return;
    if (!ultima) { el.textContent = 'Nenhuma aferição'; el.className = 'chip chip-vermelho secao-resumo'; return; }
    const d = diasDesde(ultima.data), { fora } = contar(ultima);
    el.textContent = d > AFERICAO_PRAZO_DIAS ? `Atrasada (${d} dias)` : fora ? `${fora} bico(s) fora` : `Em dia · ${dataBR(ultima.data).slice(0, 5)}`;
    el.className = `chip secao-resumo ${d > AFERICAO_PRAZO_DIAS || fora ? 'chip-vermelho' : 'chip-verde'}`;
}

function cartao(posto, a, aberto) {
    const { total, fora } = contar(a);
    const nOc = Object.keys(a.ocorrencias || {}).length;
    const bicos = (bicosPostos[posto] || []).map(b => {
        const v = a.bicos?.[b.id];
        const s = situacao(v);
        const oc = a.ocorrencias?.[b.id];
        return `<div class="af-linha af-${s}"><span><b>Bico ${b.id}</b> · ${esc(b.produto)}</span><strong>${s === 'sem' ? 'não aferido' : sinal(v)}</strong></div>${oc ? `<p class="af-oc-bico">${icone('alerta')} ${esc(oc)}</p>` : ''}`;
    }).join('');
    return `<details class="af-cartao ${fora ? 'com-fora' : ''}" ${aberto ? 'open' : ''}>
        <summary>
            <span><b>${dataBR(a.data)}</b><small>${esc(a.responsavel || '')} · ${total} bico(s)${nOc ? ` · ${nOc} ocorrência(s)` : ''}</small></span>
            <span class="chip ${fora ? 'chip-vermelho' : 'chip-verde'}">${fora ? `${icone('alerta')} ${fora} fora` : `${icone('check')} tudo ok`}</span>
        </summary>
        <div class="af-corpo">${bicos}${a.observacao ? `<p class="af-obs"><b>Observação:</b> ${esc(a.observacao)}</p>` : ''}</div>
    </details>`;
}

// ---------- Painel do gestor ----------
// resumo no topo da aba "Aferições e manutenção"
export function resumoAba(qual, pendencias, titulo, detalhe) {
    const card = $(`campo-${qual}`);
    if (!card) return;
    card.querySelector('strong').textContent = titulo;
    card.querySelector('small').textContent = detalhe;
    card.classList.toggle('alerta', pendencias > 0);
    card.dataset.pend = pendencias;
    const total = ['af', 'oc'].reduce((s, q) => s + (Number($(`campo-${q}`)?.dataset.pend) || 0), 0);
    const badge = $('aba-campo-alerta');
    badge.textContent = total; badge.classList.toggle('oculto', !total);
}

export async function carregarAfericoesGestor() {
    const caixa = $('gestor-afericoes');
    caixa.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
    const linhas = [];
    let alertas = 0, foraTotal = 0, atrasados = 0;
    for (const posto of estado.postos) {
        let afs = [];
        try { afs = await buscarAfericoes(posto, 5); } catch (e) { console.error(e); }
        const ultima = afs[0];
        const d = ultima ? diasDesde(ultima.data) : null;
        const { fora } = ultima ? contar(ultima) : { fora: 0 };
        const atrasada = !ultima || d > AFERICAO_PRAZO_DIAS;
        if (atrasada || fora) alertas++;
        if (atrasada) atrasados++;
        foraTotal += fora;
        linhas.push(`<details class="af-posto ${atrasada || fora ? 'alerta' : ''}">
            <summary>
                <span><b>${esc(posto)}</b><small>${ultima ? `Última: ${dataBR(ultima.data)} (${d === 0 ? 'hoje' : d === 1 ? 'ontem' : d + ' dias atrás'}) · ${esc(ultima.responsavel || '')}` : 'Nenhuma aferição registrada'}</small></span>
                <span class="af-posto-chips">
                    ${atrasada ? `<span class="chip chip-vermelho">${icone('relogio')} ${ultima ? 'atrasada' : 'pendente'}</span>` : ''}
                    ${ultima ? (fora ? `<span class="chip chip-vermelho">${icone('alerta')} ${fora} bico(s) fora</span>` : `<span class="chip chip-verde">${icone('check')} tudo ok</span>`) : ''}
                </span>
            </summary>
            <div class="af-posto-corpo">${afs.length ? afs.map((a, i) => cartao(posto, a, i === 0)).join('') : '<div class="vazio-lista">Sem aferições.</div>'}</div>
        </details>`);
    }
    caixa.innerHTML = linhas.join('');
    const chip = $('gestor-af-resumo');
    chip.innerHTML = alertas ? `${icone('alerta')} ${alertas} posto(s) com pendência` : 'Tudo em dia';
    chip.className = `chip secao-resumo ${alertas ? 'chip-vermelho' : 'chip-verde'}`;
    resumoAba('af', alertas, alertas ? `${alertas} posto(s) com pendência` : 'Tudo em dia', `${foraTotal} bico(s) fora da tolerância · ${atrasados} posto(s) sem aferir há mais de ${AFERICAO_PRAZO_DIAS} dias`);
}
