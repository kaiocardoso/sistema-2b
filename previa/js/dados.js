// Estado da sessão + leitura e gravação no banco
import { db, auth, ref, set, get, onValue, query, orderByChild, orderByKey, equalTo, startAt, endAt, CAMINHO } from "./firebase.js";
import { configPostos } from "./config.js";

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
    const snap = await get(ref(db, `${CAMINHO.perfis}/${chavePerfil(email)}`));
    return snap.exists() ? snap.val() : null;
}

export function iniciarEstado(perfil) {
    estado.perfil = perfil;
    estado.postos = Object.keys(perfil.postos || {}).filter(p => perfil.postos[p] === true && configPostos[p]);
    estado.postoAtivo = perfil.papel === 'gestor' ? "" : estado.postos[0];
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

// Salva a situação do posto e acrescenta uma cópia no histórico.
// "enviadoPor" é conferido pelas regras do banco.
export async function salvarPosto(dadosNovos) {
    const posto = estado.postoAtivo;
    const novo = { ...(estado.dados[posto] || {}), ...dadosNovos, enviadoPor: auth.currentUser.email, enviadoPorNome: estado.perfil.nome };
    await set(ref(db, `${CAMINHO.dados}/${posto}`), novo);
    estado.dados[posto] = novo;
    await set(ref(db, `${CAMINHO.historico}/${posto}/${Date.now()}`), novo);
}

export function responsavel() {
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
    await set(ref(db, `${CAMINHO.emprestimos}/${id}`), {
        ...emp, volume,
        devolvido: novoDevolvido,
        status: novoDevolvido >= volume ? 'pago' : 'pendente',
        atualizadoPor: log,
        atualizadoPorEmail: auth.currentUser.email
    });
}

export async function excluirEmprestimo(id) {
    await set(ref(db, `${CAMINHO.emprestimos}/${id}`), null);
}
