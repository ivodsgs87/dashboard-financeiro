
const functions = require('firebase-functions');

// Importar funções do Salt Edge (se existirem)
// const saltEdge = require('./saltEdge');

// Importar função de processamento de faturas
const { processInvoice } = require('./processInvoice');

// Exportar todas as funções
exports.processInvoice = processInvoice;

// Se tiveres as funções do Salt Edge, descomenta:
// exports.createCustomer = saltEdge.createCustomer;
// exports.listBanks = saltEdge.listBanks;
// etc...
