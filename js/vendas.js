// Soma das vendas por dia (usada no painel do gestor)
import { rotulosProdutos } from "./config.js";
import { estado, buscarHistorico, analisarHistorico } from "./dados.js";
import { limitesDoDia, somarDias } from "./util.js";

// Vendas de cada dia entre dois dias (inclusive), separadas por posto e por produto.
// Busca até 2 dias depois do fim, porque fechamentos atrasados (depois da meia-noite)
// ou corrigidos depois ainda pertencem ao dia certo.
export async function vendasDoPeriodo(isoInicio, isoFim) {
    const [inicio] = limitesDoDia(isoInicio);
    const [, fim] = limitesDoDia(somarDias(isoFim, 2));
    const porDia = {};
    for (const posto of estado.postos) {
        let validos = [];
        try {
            ({ validos } = analisarHistorico(await buscarHistorico(posto, inicio, fim)));
        } catch (e) { console.error('Erro ao buscar vendas', posto, e); }
        validos.forEach(({ ts, reg, dia }) => {
            if (dia < isoInicio || dia > isoFim) return;
            const D = porDia[dia] ||= { total: 0, qtd: 0, postos: {}, produtos: {} };
            const P = D.postos[posto] ||= { total: 0, qtd: 0, vendas: {}, ultimo: null, nome: '' };
            P.qtd++; D.qtd++;
            if (!P.ultimo || Number(ts) > Number(P.ultimo)) { P.ultimo = ts; P.nome = reg.responsavelFechamento || ''; }
            Object.entries(reg.valores || {}).forEach(([p, v]) => {
                if (!rotulosProdutos[p]) return;
                const n = Number(v?.vendido) || 0;
                if (n <= 0) return;
                P.vendas[p] = (P.vendas[p] || 0) + n;
                D.produtos[p] = (D.produtos[p] || 0) + n;
                if (p !== 'arla_b') { P.total += n; D.total += n; }   // ARLA balde é em unidades
            });
        });
    }
    return porDia;
}
