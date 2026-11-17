// Leitura dos XML de compra de combustível (NF-e e CT-e), direto no navegador.
import { cnpjPostos, configPostos } from "./config.js";

// Códigos ANP mais comuns (o restante é identificado pela descrição)
const CODIGOS_ANP = {
    '320102001': 'comum', '320102002': 'vpower', '320102003': 'vpower', '320102005': 'vpower',
    '810101001': 'etanol', '810101002': 'etanol', '810101003': 'etanol',
    '820101033': 's10', '820101034': 's10', '820101011': 's500', '820101012': 's500', '820101013': 's500'
};

// Identifica o produto pela descrição (V-Power diesel S10 vai para S10; gasolina aditivada/V-Power para "vpower")
export function produtoPelaDescricao(txt) {
    const t = String(txt || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/ARLA/.test(t)) return 'arla_g';
    if (/S[\s-]?10\b|S-10'|S10'/.test(t) || /DIESEL.*S\s?-?10/.test(t)) return 's10';
    if (/S[\s-]?500/.test(t)) return 's500';
    if (/DIESEL/.test(t)) return null;          // diesel sem dizer S10/S500: confirmar
    if (/GASOLINA|GAS\.?\s/.test(t)) return /ADITIV|V-?POWER|PREMIUM|PODIUM/.test(t) ? 'vpower' : 'comum';
    if (/ETANOL|ALCOOL/.test(t)) return 'etanol';
    return null;
}

const so = (n) => String(n || '').replace(/\D/g, '');
const txt = (el, tag) => el?.getElementsByTagName(tag)?.[0]?.textContent?.trim() || '';
const dataDe = (dh) => (dh || '').slice(0, 10);

// Número da NF a partir da chave de 44 dígitos (posições 26 a 34)
export const numeroDaChave = (chave) => chave && chave.length === 44 ? String(Number(chave.slice(25, 34))) : '';

// Placa, motorista e lacres que vêm nas informações da nota (ajudam o gerente a conferir)
function transporteNFe(doc) {
    const partes = [];
    const placa = txt(doc.getElementsByTagName('veicTransp')[0], 'placa') || Array.from(doc.getElementsByTagName('obsCont')).find(o => /PLACA/i.test(o.getAttribute('xCampo') || ''))?.textContent?.trim();
    if (placa) partes.push('Placa ' + placa);
    const info = txt(doc, 'infAdFisco') + ' ' + txt(doc, 'infCpl');
    const mot = info.match(/Motorista\s*[:=]\s*([A-Z][A-Z ]{3,40}?)(?:\s+CPF|\s*$|\s*[\/,])/i);
    if (mot) partes.push('Motorista ' + mot[1].trim());
    const trecho = info.match(/Lacre[^:]*:\s*(?:[A-Z]{2}\/\d+\/\s*\d+\/\d+\/\d+:\s*)?([\d\s\/,]+)/i);
    const lacres = trecho ? (trecho[1].match(/\d{5,}/g) || []) : [];
    if (lacres.length) partes.push(`Lacres (${lacres.length}): ${lacres.map(l => l.replace(/^0+(?=\d{6})/, '')).join(', ')}`);
    return partes.join(' · ').slice(0, 300);
}

function lerNFe(doc) {
    const inf = doc.getElementsByTagName('infNFe')[0];
    const chave = so(inf.getAttribute('Id'));
    const dest = so(txt(doc.getElementsByTagName('dest')[0], 'CNPJ'));
    const itens = [];
    Array.from(doc.getElementsByTagName('det')).forEach(det => {
        const prod = det.getElementsByTagName('prod')[0];
        const comb = det.getElementsByTagName('comb')[0];
        const descricao = txt(prod, 'xProd') + (comb ? ' ' + txt(comb, 'descANP') : '');
        let produto = CODIGOS_ANP[txt(comb, 'cProdANP')] || produtoPelaDescricao(descricao);
        let litros = Number(txt(prod, 'qCom')) || 0;
        const un = txt(prod, 'uCom').toUpperCase();
        if (/M3|M³/.test(un)) litros *= 1000;
        if (!/^L|LT|LITRO|M3|M³/.test(un) && !comb) return;   // item que não é combustível (ex.: frete)
        itens.push({ produto, litros: Math.round(litros), descricao: txt(prod, 'xProd') });
    });
    return {
        tipo: 'nfe', chave, numero: txt(doc.getElementsByTagName('ide')[0], 'nNF'),
        dataEmissao: dataDe(txt(doc.getElementsByTagName('ide')[0], 'dhEmi') || txt(doc.getElementsByTagName('ide')[0], 'dEmi')),
        fornecedor: txt(doc.getElementsByTagName('emit')[0], 'xNome'),
        cnpjDestino: dest, valor: Number(txt(doc.getElementsByTagName('ICMSTot')[0], 'vNF')) || 0,
        itens, transporte: transporteNFe(doc)
    };
}

function lerCTe(doc) {
    const inf = doc.getElementsByTagName('infCte')[0];
    const infCarga = doc.getElementsByTagName('infCarga')[0];
    const chaveNF = so(txt(doc.getElementsByTagName('infNFe')[0], 'chave'));
    let litros = 0;
    Array.from(infCarga?.getElementsByTagName('infQ') || []).forEach(q => {
        if (txt(q, 'cUnid') === '04' || /^L|LT|LITRO/i.test(txt(q, 'tpMed'))) litros = Number(txt(q, 'qCarga')) || 0;
    });
    const proPred = txt(infCarga, 'proPred');
    const produto = produtoPelaDescricao(proPred);
    const diversos = /DIVERSOS/i.test(proPred) || !produto;
    return {
        tipo: 'cte', chave: chaveNF, chaveCTe: so(inf.getAttribute('Id')), numero: numeroDaChave(chaveNF),
        dataEmissao: dataDe(txt(doc.getElementsByTagName('ide')[0], 'dhEmi')),
        fornecedor: txt(doc.getElementsByTagName('rem')[0], 'xNome'),
        cnpjDestino: so(txt(doc.getElementsByTagName('dest')[0], 'CNPJ')),
        valor: Number(txt(infCarga, 'vCarga')) || 0,
        // CT-e não traz a litragem por produto: com um produto só e litros informados, já vem preenchido
        itens: diversos ? [] : [{ produto, litros: Math.round(litros), descricao: proPred }],
        litrosTotal: Math.round(litros),
        descricaoCarga: proPred,
        transporte: txt(doc.getElementsByTagName('compl')[0], 'xObs').replace(/\s+/g, ' ').slice(0, 300)
    };
}

// Lê um arquivo XML e devolve a carga (ou { erro })
export function lerXML(texto, nomeArquivo = '') {
    let doc;
    try { doc = new DOMParser().parseFromString(texto, 'application/xml'); } catch (e) { return { erro: 'Arquivo inválido', nomeArquivo }; }
    if (doc.getElementsByTagName('parsererror').length) return { erro: 'Não é um XML válido', nomeArquivo };
    let c;
    if (doc.getElementsByTagName('infNFe').length && doc.getElementsByTagName('det').length) c = lerNFe(doc);
    else if (doc.getElementsByTagName('infCte').length) c = lerCTe(doc);
    else return { erro: 'Não é NF-e nem CT-e', nomeArquivo };
    c.nomeArquivo = nomeArquivo;
    c.posto = cnpjPostos[c.cnpjDestino] || '';
    if (!c.posto) c.aviso = `CNPJ de destino ${c.cnpjDestino} não é de nenhum posto cadastrado`;
    // produto que o posto não tem: avisa
    c.itens.forEach(i => { if (i.produto && c.posto && !(i.produto in (configPostos[c.posto] || {}))) i.aviso = 'o posto não tem este produto cadastrado'; });
    return c;
}
