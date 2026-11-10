// Ponto de partida: login e escolha da tela de cada perfil
import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "./firebase.js";
import { DOMINIO_LOGIN, LOGIN_ADMIN, gestores, slugPostos } from "./config.js";
import { estado, carregarPerfil, iniciarEstado, pararEscutas, quandoErroLeitura, registrarLog } from "./dados.js";
import { abrirCaixa } from "./caixa.js";
import { abrirGerente } from "./gerente.js";
import { abrirGestor, atualizarVendasHoje } from "./gestor.js";
import { abrirHistorico, fecharHistorico } from "./historico.js";
import { ativarAcoesEmprestimo } from "./emprestimos.js";
import { aplicarIcones } from "./icones.js";
import { iniciarSecoes } from "./secoes.js";
import { iniciarInstalacao, instalar } from "./instalar.js";
import { carregarLog } from "./log.js";
import { abrirHistoricoEstoque } from "./historico-estoque.js";
import { $, aviso, comEspera, saudacao, dataPorExtenso } from "./util.js";

aplicarIcones();
iniciarSecoes();
iniciarInstalacao();

// ---------- Tela de login ----------
let perfilEscolhido = 'caixa';
let entrouAgora = false;
const nomeBonito = (n) => String(n).toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());

function preencherOpcoesLogin() {
    const opcoes = perfilEscolhido === 'gestor'
        ? Object.keys(gestores).map(n => [n, nomeBonito(n)])
        : Object.keys(slugPostos).map(p => [p, p]);
    $('login-quem').innerHTML = opcoes.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
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

// Modo administrador: só a senha (o login é fixo)
let modoAdmin = false;
function alternarModoAdmin() {
    modoAdmin = !modoAdmin;
    document.querySelector('.abas').classList.toggle('oculto', modoAdmin);
    $('login-quem').parentElement.classList.toggle('oculto', modoAdmin);
    document.querySelector('.login-caixa h1').textContent = modoAdmin ? 'Administrador' : 'Bem-vindo!';
    $('login-senha').placeholder = modoAdmin ? 'Senha do administrador' : { caixa: 'Senha do caixa / posto', gerente: 'Senha do gerente', gestor: 'Senha do gestor' }[perfilEscolhido];
    document.querySelector('[data-acao="modo-admin"]').textContent = modoAdmin ? 'Voltar ao login normal' : 'Acesso do administrador';
    $('login-senha').value = '';
    $('login-senha').focus();
}

function usuarioDoLogin() {
    if (modoAdmin) return LOGIN_ADMIN;
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
            entrouAgora = true;   // registra a entrada no log (só quando a pessoa digita a senha)
            await signInWithEmailAndPassword(auth, `${usuarioDoLogin()}@${DOMINIO_LOGIN}`, senha);
            $('login-senha').value = '';
        } catch (err) {
            entrouAgora = false;
            console.error(err);
            aviso(mensagemErroLogin(err), 'erro');
            const caixa = document.querySelector('.login-caixa');
            caixa.classList.remove('tremer'); void caixa.offsetWidth; caixa.classList.add('tremer');
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
    if (entrouAgora) { entrouAgora = false; registrarLog('login', 'Entrou no sistema'); }
    $('tela-login').classList.add('oculto');
    $('usuario').classList.remove('oculto');
    const nome = { admin: 'Administrador', gestor: nomeBonito(perfil.nome), gerente: `Gerente ${estado.postoAtivo}`, caixa: `Caixa ${estado.postoAtivo}` }[perfil.papel] || perfil.nome;
    $('usuario-nome').textContent = nome;
    $('usuario-avatar').textContent = (perfil.papel === 'gestor' ? perfil.nome : perfil.papel).charAt(0).toUpperCase();
    document.querySelectorAll('[data-hoje]').forEach(el => el.textContent = dataPorExtenso());
    document.querySelectorAll('[data-ola]').forEach(el => el.textContent = saudacao());

    if (perfil.papel === 'gestor' || perfil.papel === 'admin') abrirGestor();
    else if (perfil.papel === 'gerente') abrirGerente();
    else if (perfil.papel === 'caixa') abrirCaixa();
    else { aviso('Perfil inválido. Fale com o gestor do sistema.', 'erro'); sair(); }
}

async function sair() {
    pararEscutas();
    await signOut(auth);
    location.reload();
}

// ---------- Botões gerais ----------
document.addEventListener('click', (e) => {
    const estoque = e.target.closest('[data-estoque-posto]');
    if (estoque) return abrirHistoricoEstoque(estoque.dataset.estoquePosto);
    const alvo = e.target.closest('[data-acao]');
    if (!alvo) return;
    const acao = alvo.dataset.acao;
    if (acao === 'sair') sair();
    if (acao === 'modo-admin') alternarModoAdmin();
    if (acao === 'instalar') instalar();
    if (acao === 'historico-gerente') abrirHistorico(true);
    if (acao === 'historico-gestor') abrirHistorico(false);
    if (acao === 'fechar-historico') fecharHistorico();
    if (acao === 'atualizar-vendas') comEspera(alvo, atualizarVendasHoje);
    if (acao === 'atualizar-log') comEspera(alvo, carregarLog);
});
$('janela-historico').addEventListener('click', (e) => { if (e.target.id === 'janela-historico') fecharHistorico(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharHistorico(); });

// Aviso de internet
const atualizarConexao = () => $('sem-internet').classList.toggle('oculto', navigator.onLine);
window.addEventListener('online', atualizarConexao);
window.addEventListener('offline', atualizarConexao);
atualizarConexao();

ativarAcoesEmprestimo();
preencherOpcoesLogin();
