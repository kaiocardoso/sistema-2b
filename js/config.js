// ================================================================
// CONFIGURAÇÕES DA REDE 2B
// Para mudar tanques, bicos ou postos, é aqui.
// ================================================================

// Identificação do projeto no Firebase (é pública: quem protege os
// dados são as regras do banco + o login).
export const firebaseConfig = {
    apiKey: "AIzaSyDkmGD9zn6bcTmryrkF3HR3-4IeIqUl7d4",
    authDomain: "rede-2b.firebaseapp.com",
    databaseURL: "https://rede-2b-default-rtdb.firebaseio.com",
    projectId: "rede-2b",
    storageBucket: "rede-2b.firebasestorage.app",
    messagingSenderId: "121568912278",
    appId: "1:121568912278:web:b0a3e1573ed3219a72b3b7"
};

// Os logins são e-mails internos: nome + "@rede2b.app".
// Nenhuma senha fica no código: quem confere é o Firebase.
export const DOMINIO_LOGIN = "rede2b.app";

// Administrador (modo desenvolvedor): acesso total + registro de atividades.
// O e-mail precisa bater com o das regras do banco (firebase/database.rules.json).
export const LOGIN_ADMIN = "admin";

export const gestores = { "ZICO": "zico", "GILMACIO": "gilmacio", "SABINO": "sabino", "MARCOS HENRIQUE": "marcos.henrique" };

export const slugPostos = {
    "GOMES SERPA": "gomesserpa", "POSTO CARIPARE": "caripare", "NOSSO POSTO": "nossoposto",
    "POSTO MATOPIBA": "matopiba", "POSTO FLEX": "flex", "POSTO DIVISA": "divisa", "POSTO URUCUIA": "urucuia"
};

// Capacidade dos tanques (litros). arla_b = balde, contado em unidades.
export const configPostos = {
    "GOMES SERPA": { comum: 10000, s500: 10000, s10: 10000 },
    "POSTO CARIPARE": { comum: 10000, s500: 10000, s10: 10000 },
    "NOSSO POSTO": { comum: 15000, vpower: 10000, etanol: 10000, s500: 10000, s10: 30000, arla_g: 3000, arla_b: 0 },
    "POSTO MATOPIBA": { comum: 15000, etanol: 7500, s500: 7500, s10: 15000, arla_g: 3000, arla_b: 0 },
    "POSTO FLEX": { comum: 15000, vpower: 15000, etanol: 7500, s500: 7500, s10: 15000 },
    "POSTO DIVISA": { comum: 20000, vpower: 10000, etanol: 10000, s500: 20000, s10: 45000, arla_g: 9000, arla_b: 0 },
    "POSTO URUCUIA": { comum: 20000, vpower: 10000, etanol: 10000, s500: 20000, s10: 30000, arla_g: 3000, arla_b: 0 }
};

export const bicosPostos = {
    "GOMES SERPA": [ { id: 1, produto: "Gasolina Comum" }, { id: 2, produto: "Diesel S10" }, { id: 3, produto: "Diesel S500 Comum" } ],
    "POSTO CARIPARE": [ { id: 1, produto: "Gasolina Comum" }, { id: 2, produto: "Diesel S-10" }, { id: 3, produto: "Gasolina Comum" }, { id: 4, produto: "Diesel S500" } ],
    "NOSSO POSTO": [ { id: 1, produto: "Gasolina Comum" }, { id: 2, produto: "Gasolina Comum" }, { id: 3, produto: "Etanol Comum" }, { id: 4, produto: "Gasolina Aditivada" }, { id: 5, produto: "Shell V-Power Diesel S10" }, { id: 6, produto: "Shell V-Power Diesel S10" }, { id: 7, produto: "Diesel S500" }, { id: 8, produto: "Diesel S500" }, { id: 9, produto: "Shell V-Power Diesel S10" }, { id: 10, produto: "Shell V-Power Diesel S10" }, { id: 11, produto: "Diesel S500" }, { id: 12, produto: "Diesel S500" } ],
    "POSTO MATOPIBA": [ { id: 1, produto: "Gasolina Comum" }, { id: 2, produto: "Gasolina Comum" }, { id: 3, produto: "Gasolina Comum" }, { id: 4, produto: "Gasolina Comum" }, { id: 5, produto: "Etanol" }, { id: 6, produto: "Etanol" }, { id: 7, produto: "Diesel Comum" }, { id: 8, produto: "Diesel Comum" }, { id: 9, produto: "Diesel S10" }, { id: 10, produto: "Diesel S10" } ],
    "POSTO FLEX": [ { id: 1, produto: "Gasolina Comum" }, { id: 2, produto: "V-Power Etanol Aditivado" }, { id: 3, produto: "Diesel S500 Comum" }, { id: 4, produto: "Gasolina Aditivada V-Power" }, { id: 5, produto: "Evolux Diesel S10 Aditivado" }, { id: 6, produto: "Gasolina Aditivada V-Power" }, { id: 7, produto: "Gasolina Comum" }, { id: 8, produto: "V-Power Etanol Aditivado" } ],
    "POSTO DIVISA": [ { id: 1, produto: "V-Power Diesel S-10" }, { id: 2, produto: "V-Power Diesel S-10" }, { id: 3, produto: "V-Power Diesel S-10" }, { id: 4, produto: "Diesel S500 Comum" }, { id: 5, produto: "Gasolina Comum" }, { id: 6, produto: "Gasolina Comum" }, { id: 7, produto: "V-Power Gasolina Aditivada" }, { id: 8, produto: "Etanol Hidratado" }, { id: 9, produto: "V-Power Diesel S-10" }, { id: 10, produto: "V-Power Diesel S-10" }, { id: 11, produto: "V-Power Diesel S-10" }, { id: 12, produto: "Diesel S500 Comum" }, { id: 13, produto: "Diesel S500 Comum" } ],
    "POSTO URUCUIA": [ { id: 1, produto: "V-Power Diesel S-10" }, { id: 2, produto: "V-Power Diesel S-10" }, { id: 3, produto: "Diesel S500" }, { id: 4, produto: "Diesel S500" }, { id: 5, produto: "Diesel S500" }, { id: 6, produto: "V-Power Etanol Aditivado" }, { id: 7, produto: "Gasolina Comum" }, { id: 8, produto: "Gasolina Aditivada" }, { id: 9, produto: "V-Power Etanol Aditivado" }, { id: 10, produto: "Gasolina Comum" }, { id: 11, produto: "Gasolina Aditivada" }, { id: 12, produto: "V-Power Diesel S-10" }, { id: 13, produto: "V-Power Diesel S-10" }, { id: 14, produto: "Gasolina Comum" }, { id: 15, produto: "V-Power Diesel S-10" }, { id: 16, produto: "Gasolina Comum" }, { id: 17, produto: "V-Power Diesel S-10" }, { id: 18, produto: "V-Power Diesel S-10" } ]
};

export const rotulosProdutos = { s10: "DIESEL S-10", s500: "DIESEL S-500", comum: "GAS. COMUM", vpower: "GAS. ADITIVADA", etanol: "ETANOL", arla_g: "ARLA A GRANEL", arla_b: "ARLA BALDE" };

// Combustíveis que podem ser emprestados (precisa bater com as regras do banco)
export const produtosEmprestimo = ["DIESEL S-10", "DIESEL S-500", "GAS. COMUM", "GAS. ADITIVADA", "ETANOL"];

export function getProdutosPermitidos(posto) {
    const base = Object.keys(configPostos[posto] || {});
    if (base.includes('arla_g') && !base.includes('arla_b')) base.push('arla_b');
    return base;
}

export const unidade = (p) => p === 'arla_b' ? 'un' : 'L';

// Fechamentos salvos da meia-noite até esta hora (inclusive, ex.: 04:00) contam para o dia anterior
// (o turno que termina às 23:59 muitas vezes é registrado depois da meia-noite).
// Depois desse horário, contam para o dia em curso.
export const HORA_VIRADA_DO_DIA = 4;

// Aferição dos bicos: medida padrão de 20 litros. Tolerância de ±100 mL (0,5%).
export const AFERICAO_VOLUME_L = 20;
export const AFERICAO_TOLERANCIA_ML = 100;
export const AFERICAO_PRAZO_DIAS = 7;

export function diaDasVendasPelaHora(data) {
    const minutos = data.getHours() * 60 + data.getMinutes();
    const d = minutos <= HORA_VIRADA_DO_DIA * 60 ? new Date(data.getFullYear(), data.getMonth(), data.getDate() - 1) : data;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
