// Conexão com o Firebase (banco + login)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, push, serverTimestamp, onValue, query, orderByChild, orderByKey, equalTo, startAt, endAt, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// A sessão dura enquanto a aba estiver aberta
try { await setPersistence(auth, browserSessionPersistence); } catch (e) { console.warn('Persistência padrão', e); }

export { ref, set, get, push, serverTimestamp, onValue, query, orderByChild, orderByKey, equalTo, startAt, endAt, limitToLast, signInWithEmailAndPassword, signOut, onAuthStateChanged };

// Caminhos no banco (os mesmos desde a primeira versão do sistema)
export const CAMINHO = {
    perfis: 'perfis',
    dados: 'postos_2b_dados_oficial',
    historico: 'postos_2b_historico',
    emprestimos: 'postos_2b_emprestimos',
    log: 'postos_2b_log',
    afericoes: 'postos_2b_afericoes',
    manutencao: 'postos_2b_manutencao'
};
