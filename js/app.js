// Ponto de partida: login e escolha da tela de cada perfil
import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "./firebase.js";
import { DOMINIO_LOGIN, gestores, slugPostos } from "./config.js";
import { estado, carregarPerfil, iniciarEstado, pararEscutas, quandoErroLeitura } from "./dados.js";
import { abrirCaixa } from "./caixa.js";
import { abrirGerente } from "./gerente.js";
import { abrirGestor, atualizarVendasHoje } from "./gestor.js";
import { abrirHistorico, fecharHistorico } from "./historico.js";
import { ativarAcoesEmprestimo } from "./emprestimos.js";
import { $, aviso, comEspera } from "./util.js";

// ---------- Tela de login ----------
let perfilEscolhido = 'caixa';

function preencherOpcoesLogin() {
    const nomes = perfilEscolhido === 'gestor'
        ? Object.keys(gestores).map(n => [n, n.charAt(0) + n.slice(1).toLowerCase().replace(/ (\w)/g, (m, l) => ' ' + l.toUpperCase())])
        : Object.keys(slugPostos).map(p => [p, p]);
    $('login-quem').innerHTML = nomes.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    $('login-quem-rotulo').textContent = perfilEscolhido === 'gestor' ? 'Gestor' : 'Posto';
    $('login-senha').placeholder = { caixa: 'Senha do caixa / posto', gerente: 'Senha do gerente', gestor: 'Senha do gestor' }[perfilEscolhido];
}

document.querySelectorAll('.aba').forEach(aba => aba.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(a => a.classList.toggle('ativa', a === aba));
    perfilEscolhido = aba.dataset.perfil;
    preencherOpcoesLogin();
    $('login-senha').value = '';
    $('login-senha').focus();
}));

function usuarioDoLogin() {
    const quem = $('login-quem').value;
    if (perfilEscolhido === 'gestor') return gestores[quem];
    return `${perfilEscolhido}.${slugPostos[quem]}`;
}

function mensagemErroLogin(e) {
    const c = e?.code || '';
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(c)) return 'Senha incorreta!';
    if (c === 'auth/too-many-requests') return 'Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.';
    if (c === 'auth/network-request-failed') return 'Sem conexão com a internet.';
    if (c === 'auth/user-disabled') return 'Este login está desativado. Fale com o gestor.';
    return 'Não foi possível entrar. Código do erro: ' + (c || e?.message || 'desconhecido');
}

$('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const senha = $('login-senha').value;
    if (!senha) return aviso('Digite a senha.', 'erro');
    await comEspera($('login-botao'), async () => {
        try {
            await signInWithEmailAndPassword(auth, `${usuarioDoLogin()}@${DOMINIO_LOGIN}`, senha);
            $('login-senha').value = '';
        } catch (err) {
            console.error(err);
            aviso(mensagemErroLogin(err), 'erro');
        }
    });
});

// ---------- Depois do login ----------
quandoErroLeitura(() => aviso('Sem permissão para ler parte dos dados. Avise o gestor do sistema.', 'erro'));

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
        const perfil = await carregarPerfil(user.email);
        if (!perfil) {
            aviso('Este login não tem perfil cadastrado. Fale com o gestor do sistema.', 'erro');
            await signOut(auth);
            return;
        }
        entrar(perfil);
    } catch (err) {
        console.error(err);
        aviso('Não foi possível carregar seu perfil.', 'erro');
        await signOut(auth);
    }
});

function entrar(perfil) {
    iniciarEstado(perfil);
    $('tela-login').classList.add('oculto');
    $('usuario').classList.remove('oculto');
    const titulo = { gestor: `Gestor: ${perfil.nome}`, gerente: `Gerente: ${estado.postoAtivo}`, caixa: `Caixa: ${estado.postoAtivo}` }[perfil.papel];
    $('usuario-nome').textContent = titulo || perfil.nome;

    if (perfil.papel === 'gestor') abrirGestor();
    else if (perfil.papel === 'gerente') abrirGerente();
    else if (perfil.papel === 'caixa') abrirCaixa();
    else { aviso('Perfil inválido. Fale com o gestor do sistema.', 'erro'); sair(); }
}

async function sair() {
    pararEscutas();
    await signOut(auth);
    location.reload();
}

// ---------- Botões gerais (um único "ouvinte") ----------
document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao]');
    if (!alvo) return;
    const acao = alvo.dataset.acao;
    if (acao === 'sair') sair();
    if (acao === 'historico-gerente') abrirHistorico(true);
    if (acao === 'historico-gestor') abrirHistorico(false);
    if (acao === 'fechar-historico') fecharHistorico();
    if (acao === 'atualizar-vendas') comEspera(alvo, atualizarVendasHoje);
});
$('janela-historico').addEventListener('click', (e) => { if (e.target.id === 'janela-historico') fecharHistorico(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharHistorico(); });

ativarAcoesEmprestimo();
preencherOpcoesLogin();
