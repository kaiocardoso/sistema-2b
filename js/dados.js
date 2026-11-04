// Estado da sessão + leitura e gravação no banco
import { db, auth, ref, set, get, push, serverTimestamp, onValue, query, orderByChild, orderByKey, equalTo, startAt, endAt, CAMINHO } from "./firebase.js";
import { configPostos, DOMINIO_LOGIN, LOGIN_ADMIN, HORA_VIRADA_DO_DIA } from "./config.js";

export const estado = {
    perfil: null,            // { papel, nome, postos, todos }
    postos: [],              // postos que o usuário pode ver
    postoAtivo: "",          // posto do caixa/gerente
    dados: {},               // { posto: situação atual }
    emprestimos: {},         // { id: empréstimo }
    aoMudarDados: () => {},
    aoMudarEmprestimos: () => {}
};

const escutas = [];
let avisouErro = false;
let aoErroLeitura = () => {};
export const quandoErroLeitura = (fn) => { aoErroLeitura = fn; };

function erroLeitura(e) {
    console.error("Erro de leitura:", e);
    if (!avisouErro) { avisouErro = true; aoErroLeitura(e); }
}

export const chavePerfil = (email) => email.toLowerCase().replace(/\./g, ',');

export async function carregarPerfil(email) {
    if (email.toLowerCase() === `${LOGIN_ADMIN}@${DOMINIO_LOGIN}`) {
        return { papel: 'admin', nome: 'ADMINISTRADOR', todos: true, postos: Object.fromEntries(Object.keys(configPostos).map(p => [p, true])) };
    }
    const snap = await get(ref(db, `${CAMINHO.perfis}/${chavePerfil(email)}`));
    return snap.exists() ? snap.val() : null;
}

export function iniciarEstado(perfil) {
    estado.perfil = perfil;
    estado.postos = Object.keys(perfil.postos || {}).filter(p => perfil.postos[p] === true && configPostos[p]);
    estado.postoAtivo = (perfil.papel === 'gestor' || perfil.papel === 'admin') ? "" : estado.postos[0];
}

export function pararEscutas() {
    escutas.splice(0).forEach(f => { try { f(); } catch (e) { /* já parada */ } });
}

// Situação atual de cada posto permitido, em tempo real
export function escutarDados() {
    estado.postos.forEach(p => {
        escutas.push(onValue(ref(db, `${CAMINHO.dados}/${p}`), (snap) => {
            if (snap.exists()) estado.dados[p] = snap.val(); else delete estado.dados[p];
            estado.aoMudarDados(p);
        }, erroLeitura));
    });
}

// Empréstimos: gestor geral lê tudo; os demais só os que envolvem seus postos
export function escutarEmprestimos() {
    const partes = {};
    const juntar = () => { estado.emprestimos = Object.assign({}, ...Object.values(partes)); estado.aoMudarEmprestimos(); };
    const base = ref(db, CAMINHO.emprestimos);
    if (estado.perfil.todos === true) {
        escutas.push(onValue(base, (snap) => { partes.todos = snap.val() || {}; juntar(); }, erroLeitura));
    } else {
        estado.postos.forEach(p => ['origem', 'destino'].forEach(campo => {
            escutas.push(onValue(query(base, orderByChild(campo), equalTo(p)), (snap) => { partes[`${campo}|${p}`] = snap.val() || {}; juntar(); }, erroLeitura));
        }));
    }
}

// Registros do histórico de um posto entre dois horários (ms)
export async function buscarHistorico(posto, inicio, fim) {
    const q = query(ref(db, `${CAMINHO.historico}/${posto}`), orderByKey(), startAt(String(inicio)), endAt(String(fim)));
    const snap = await get(q);
    return snap.val() || {};
}

// Salva a situação do posto e acrescenta um registro no histórico.
// "evento" diz o que gerou o registro: 'fechamento', 'correcao', 'encerrantes' ou 'atualizacao'.
// Só 'fechamento' e 'correcao' contam nas vendas do dia.
// "enviadoPor" é conferido pelas regras do banco.
export async function salvarPosto(dadosNovos, evento, extrasHistorico = {}) {
    const posto = estado.postoAtivo;
    const { evento: _e, substitui: _s, substituiData: _d, ...anterior } = estado.dados[posto] || {};
    const novo = { ...anterior, ...dadosNovos, enviadoPor: auth.currentUser.email, enviadoPorNome: estado.perfil.nome };
    await set(ref(db, `${CAMINHO.dados}/${posto}`), novo);
    estado.dados[posto] = novo;
    const ts = String(Date.now());
    await set(ref(db, `${CAMINHO.historico}/${posto}/${ts}`), { ...novo, evento, ...extrasHistorico });
    return ts;
}

// Dia a que as vendas de um fechamento pertencem.
// - Fechamentos novos dizem o dia ("diaVendas"), escolhido pelo caixa.
// - Os outros usam a hora do envio; enviados da meia-noite até HORA_VIRADA_DO_DIA
//   contam para o dia anterior.
export function diaDasVendas(ts, r) {
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r?.diaVendas || '')) return r.diaVendas;
    let d = new Date(Number(ts));
    // registros antigos copiavam o fechamento: a data/hora dele está em "dataFormatada"
    const m = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4}) às ([0-9]{2}):([0-9]{2})/.exec(r?.dataFormatada || '');
    if (!r?.evento && m) d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
    if (d.getHours() < HORA_VIRADA_DO_DIA) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Quais registros do histórico são fechamentos de verdade (e contam nas vendas).
// - Registros novos dizem o próprio "evento".
// - Registros antigos (antes desta versão) copiavam o último fechamento a cada envio de
//   encerrantes. Para não contar a cópia de novo, cada fechamento antigo conta uma vez só
//   (pela data e hora do fechamento).
// - Um fechamento corrigido ("substituído") deixa de contar; vale a correção.
// Com "iso", devolve só os fechamentos cujas vendas são daquele dia.
export function analisarHistorico(hist, iso = null) {
    const entradas = Object.entries(hist || {}).filter(([ts]) => /^[0-9]+$/.test(ts)).sort((x, y) => x[0] - y[0]);
    const substituidosTs = new Set(), substituidasDatas = new Set();
    entradas.forEach(([, r]) => {
        if (r?.evento !== 'correcao') return;
        if (r.substitui) substituidosTs.add(String(r.substitui));
        if (r.substituiData) substituidasDatas.add(r.substituiData);
    });
    const validos = [], substituidos = new Set(), vistos = new Set();
    entradas.forEach(([ts, r]) => {
        if (!r) return;
        if (r.evento) {
            if (r.evento !== 'fechamento' && r.evento !== 'correcao') return;
            if (substituidosTs.has(ts)) { substituidos.add(ts); return; }
        } else {
            if (r.tipoEnvio !== 'Fechamento de Turno') return;
            const quando = r.dataFormatada || ts;
            if (vistos.has(quando)) return;
            vistos.add(quando);
            if (substituidosTs.has(ts) || substituidasDatas.has(quando)) { substituidos.add(ts); return; }
        }
        const dia = diaDasVendas(ts, r);
        if (!iso || dia === iso) validos.push({ ts, reg: r, dia });
    });
    return { validos, substituidos, idsValidos: new Set(validos.map(v => v.ts)) };
}

export function responsavel() {
    if (estado.perfil.papel === 'admin') return 'Administrador';
    return estado.perfil.papel === 'gestor' ? `Gestor: ${estado.perfil.nome}` : `Gerente: ${estado.postoAtivo}`;
}

export async function criarEmprestimo({ data, origem, destino, produto, volume }) {
    const timestamp = Date.now();
    const quem = responsavel();
    const email = auth.currentUser.email;
    await set(ref(db, `${CAMINHO.emprestimos}/${timestamp}`), {
        data, origem, destino, produto, volume, devolvido: 0, status: 'pendente', timestamp,
        criadoPor: quem, atualizadoPor: `Criado por ${quem}`,
        criadoPorEmail: email, atualizadoPorEmail: email
    });
}

export async function atualizarDevolucao(id, novoDevolvido, log) {
    const emp = estado.emprestimos[id];
    const volume = Number(emp.volume);
    // mantém os campos do jeito que foram gravados (empréstimos antigos podem ter outro formato)
    await set(ref(db, `${CAMINHO.emprestimos}/${id}`), {
        ...emp,
        devolvido: novoDevolvido,
        status: novoDevolvido >= volume ? 'pago' : 'pendente',
        atualizadoPor: log,
        atualizadoPorEmail: auth.currentUser.email
    });
}

// ---------- Registro de atividades (log) ----------
// Grava quem fez, o quê e quando (hora do servidor). Se falhar, não atrapalha a ação principal.
export async function registrarLog(acao, detalhe, extras = {}) {
    try {
        if (!auth.currentUser || !estado.perfil) return;
        await set(push(ref(db, CAMINHO.log)), {
            quando: serverTimestamp(),
            email: auth.currentUser.email,
            nome: String(estado.perfil.nome || '').slice(0, 80),
            papel: estado.perfil.papel || '',
            posto: estado.postoAtivo || '',
            acao,
            detalhe: String(detalhe || '').slice(0, 500),
            ...extras
        });
    } catch (e) {
        console.warn('Não foi possível gravar no registro de atividades', e);
    }
}

export async function buscarLog(inicio, fim) {
    const snap = await get(query(ref(db, CAMINHO.log), orderByChild('quando'), startAt(inicio), endAt(fim)));
    return Object.entries(snap.val() || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.quando - a.quando);
}

export async function excluirEmprestimo(id) {
    await set(ref(db, `${CAMINHO.emprestimos}/${id}`), null);
}
