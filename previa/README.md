# Sistema Postos 2B

Controle de estoque, fechamento de turno, encerrantes e empréstimos de combustível da Rede 2B.
Funciona no navegador e pode ser instalado como aplicativo (celular e computador).

## Pastas

| Pasta / arquivo | O que tem |
| --- | --- |
| `index.html` | A estrutura das telas |
| `css/estilo.css` | Cores, fontes, animações e o visual (celular e computador) |
| `js/config.js` | **Postos, tanques e bicos.** Para mudar capacidade de tanque, bicos ou postos, é aqui |
| `js/app.js` | Login e escolha da tela de cada perfil |
| `js/caixa.js` | Tela do caixa: encerrantes e fechamento de turno |
| `js/gerente.js` | Tela do gerente de posto |
| `js/gestor.js` | Painel do gestor e vendas do dia |
| `js/emprestimos.js` | Empréstimos entre postos |
| `js/historico.js` | Janela do histórico (LMC) |
| `js/cards.js` | Card com tanques e encerrantes de cada posto |
| `js/secoes.js` | Seções que abrem e fecham (e lembram como cada pessoa deixou) |
| `js/icones.js` | Ícones usados nas telas |
| `js/instalar.js` | Botão "Instalar app" e instruções para iPhone |
| `js/dados.js` | Leitura e gravação no banco (Firebase) |
| `js/firebase.js` | Conexão com o Firebase |
| `manifest.webmanifest` | Nome, cores e ícones do aplicativo |
| `sw.js` | Permite instalar o app; sempre busca a versão mais nova |
| `img/` | Logo e ícones do aplicativo |
| `firebase/database.rules.json` | Cópia das regras de segurança publicadas no Firebase |

## Segurança

- Nenhuma senha fica no código. O login é conferido pelo Firebase Authentication.
- Quem pode ler ou gravar o quê é decidido pelas regras do banco (`firebase/database.rules.json`), e não pela página.
- Os perfis (quem é gestor, gerente ou caixa, e de quais postos) ficam no nó `perfis` do banco e só podem ser alterados pelo console do Firebase.

## Publicação

O site é publicado pelo GitHub Pages a partir da branch `main`. Cada alteração salva aqui entra no ar em 1 a 2 minutos.
Ao mudar arquivos, aumente a `VERSAO` no começo do `sw.js` para os aplicativos instalados pegarem a novidade.
