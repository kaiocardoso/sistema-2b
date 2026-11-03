// Aplicativo instalável (celular e computador)
import { aviso, informar } from "./util.js";
import { icone } from "./icones.js";

let pedidoDeInstalacao = null;

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const jaInstalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function mostrarBotoes(mostrar) {
    document.querySelectorAll('[data-acao="instalar"]').forEach(b => b.classList.toggle('oculto', !mostrar));
}

export function iniciarInstalacao() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker não registrado', e));
    }
    if (jaInstalado()) return;

    // Chrome, Edge e Android avisam quando o app pode ser instalado
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        pedidoDeInstalacao = e;
        mostrarBotoes(true);
    });
    window.addEventListener('appinstalled', () => {
        pedidoDeInstalacao = null;
        mostrarBotoes(false);
        aviso('Aplicativo instalado! Agora ele aparece junto dos seus outros apps.');
    });
    // No iPhone a instalação é pelo botão Compartilhar do Safari
    if (ehIOS) mostrarBotoes(true);
}

export async function instalar() {
    if (pedidoDeInstalacao) {
        pedidoDeInstalacao.prompt();
        const { outcome } = await pedidoDeInstalacao.userChoice;
        pedidoDeInstalacao = null;
        if (outcome === 'accepted') mostrarBotoes(false);
        return;
    }
    if (ehIOS) {
        informar('Instalar no iPhone', `
            <ol class="passos-instalar">
                <li>Abra este site no <b>Safari</b>.</li>
                <li>Toque no botão <b>Compartilhar</b> ${icone('compartilhar')} (quadrado com uma seta para cima).</li>
                <li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>
                <li>Toque em <b>Adicionar</b>. O ícone da 2B vai aparecer na tela do celular.</li>
            </ol>`);
        return;
    }
    informar('Instalar o aplicativo', `
        <p>No menu do navegador (os três pontinhos), procure <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</p>`);
}
