// Separador Património, importação de transações (Degiro / Trade Republic),
// comparação entre anos e a caixa genérica para pedir valores.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  meses, anos, _fmtEUR
} from './base';
import {
  VC_DEFAULT
} from './vendaCasa';

// Caixa genérica para pedir valores (substitui o prompt() do browser).
// pedido = { titulo, texto?, campos: [{ k, label, tipo: 'month'|'number'|'text'|'lista', valor, opcoes? }], botao?, onOk(valores) }
const PedirDados = ({ pedido, theme, onFechar }) => {
  const [v, setV] = useState(() => Object.fromEntries((pedido.campos || []).map(c => [c.k, c.valor != null ? c.valor : (c.tipo === 'lista' ? [] : '')])));
  const claro = theme === 'light';
  const inp = `w-full rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500/40 ${claro ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'}`;
  const ok = () => { const fn = pedido.onOk; onFechar(); if (fn) fn(v); };
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <form onSubmit={e => { e.preventDefault(); ok(); }} onKeyDown={e => { if (e.key === 'Escape') onFechar(); }}
        className={`${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'} border rounded-2xl p-5 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto`}>
        <h3 className="text-lg font-semibold mb-1">{pedido.titulo}</h3>
        {pedido.texto && <p className={`text-sm mb-3 ${claro ? 'text-slate-600' : 'text-slate-400'}`}>{pedido.texto}</p>}
        <div className="space-y-3 mt-3">
          {(pedido.campos || []).map((c, i) => c.tipo === 'lista' ? (
            <fieldset key={c.k}>
              <legend className={`text-xs mb-1 ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{c.label}</legend>
              <div className={`rounded-xl border divide-y ${claro ? 'border-slate-200 divide-slate-200' : 'border-slate-700 divide-slate-700/60'}`}>
                {(c.opcoes || []).map(o => (
                  <label key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-500 flex-shrink-0" checked={(v[c.k] || []).includes(o.id)}
                      onChange={e => setV({ ...v, [c.k]: e.target.checked ? [...(v[c.k] || []), o.id] : (v[c.k] || []).filter(x => x !== o.id) })} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label key={c.k} className="flex flex-col gap-1">
              <span className={`text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{c.label}</span>
              <input type={c.tipo || 'text'} step={c.tipo === 'number' ? 'any' : undefined} inputMode={c.tipo === 'number' ? 'decimal' : undefined} autoFocus={i === 0}
                value={v[c.k]} onChange={e => setV({ ...v, [c.k]: e.target.value })} className={inp} />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className={`px-4 py-2 text-sm rounded-xl ${claro ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>Cancelar</button>
          <button type="submit" className="px-4 py-2 text-sm rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium">{pedido.botao || 'OK'}</button>
        </div>
      </form>
    </div>, document.body);
};

// ══ IMPORTAR TRANSAÇÕES: lógica ═════════════════════════════════════════════
// Lê o ficheiro de transações da Degiro (CSV) e o extrato da Trade Republic (PDF)
// e devolve linhas no formato de G.transacoes. Só compras e vendas de investimentos:
// depósitos, levantamentos, juros e pagamentos com cartão ficam de fora.
const txNumero = v => {
  let s = String(v == null ? '' : v).replace(/[\s  €$]/g, '');
  if (!s) return 0;
  const p = s.lastIndexOf('.'), c = s.lastIndexOf(',');
  if (p >= 0 && c >= 0) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const txR2 = v => Math.round(v * 100) / 100;
const txParseCSV = texto => {
  const t = String(texto || '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/)[0] || '';
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = ''; linhas.push(linha); linha = [];
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => String(c).trim() !== ''));
};
const txEhDegiro = texto => /ISIN/i.test(String(texto || '').slice(0, 600)) && /(Order ID|ID da Ordem)/i.test(String(texto || '').slice(0, 600));
const txLerDegiro = texto => {
  const linhas = txParseCSV(texto);
  if (linhas.length < 2) return [];
  const cab = linhas[0].map(c => String(c).trim().toLowerCase());
  const col = (re, alt) => { const i = cab.findIndex(c => re.test(c)); return i >= 0 ? i : alt; };
  const cData = col(/^(date|data)$/, 0), cHora = col(/^(time|hora)$/, 1), cProd = col(/^(product|produto)$/, 2), cIsin = col(/^isin$/, 3);
  const cQtd = col(/^quant/, 6), cPreco = col(/^(price|pre[cç]o)/, 7);
  const cValor = col(/^(value eur|valor eur|value|valor)$/, 11);
  const cFx = col(/autofx/, -1), cCustos = col(/(transaction|custos|comiss)/, 14), cOrdem = col(/(order id|id da ordem)/, cab.length - 1);
  const ordens = [], porId = {};
  let ultima = null;
  linhas.slice(1).forEach(l => {
    const d = String(l[cData] || '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!d) {
      // Linha de continuação: o nome do produto era comprido e partiu para a linha seguinte
      const resto = String(l[cProd] || '').trim();
      if (ultima && resto && !ultima.produto.includes(resto)) ultima.produto += ' ' + resto;
      const ord = String(l[cOrdem] || '').trim();
      if (ultima && ord && ultima.semOrdem) { ultima.ordem += ord; }
      return;
    }
    const data = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
    const qtd = txNumero(l[cQtd]);
    if (!qtd) { ultima = null; return; }
    const isin = String(l[cIsin] || '').trim();
    const ordemLida = String(l[cOrdem] || '').trim();
    const chave = ordemLida || `${data} ${String(l[cHora] || '').trim()} ${isin} ${qtd}`;
    const custos = Math.abs(txNumero(l[cCustos])) + (cFx >= 0 ? Math.abs(txNumero(l[cFx])) : 0);
    let o = porId[chave];
    if (!o || o.data !== data || o.isin !== isin) {
      o = porId[chave] = { data, isin, produto: String(l[cProd] || '').trim(), qtd: 0, valor: 0, custos: 0, preco: Math.abs(txNumero(l[cPreco])), ordem: chave, semOrdem: !ordemLida };
      ordens.push(o);
    }
    // Uma ordem pode ser executada em várias partes: junta-se tudo numa só linha
    o.qtd += qtd; o.valor += txNumero(l[cValor]); o.custos += custos;
    ultima = o;
  });
  return ordens.filter(o => o.qtd !== 0).map(o => {
    const q = Math.abs(o.qtd), v = txR2(Math.abs(o.valor));
    return {
      data: o.data, tipo: o.qtd > 0 ? 'compra' : 'venda', categoria: 'ETF',
      ticker: o.produto.replace(/\s+/g, ' ').trim(), corretora: 'Degiro',
      quantidade: Math.round(q * 1e6) / 1e6, precoUnitario: q ? Math.round(v / q * 1e4) / 1e4 : 0,
      valorTotal: v, comissao: txR2(o.custos), notas: o.isin ? `ISIN ${o.isin}` : '',
      isin: o.isin, importId: `degiro:${o.ordem}`,
    };
  });
};
const TX_MESES = { jan: 1, fev: 2, feb: 2, mar: 3, 'mär': 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, okt: 10, nov: 11, dez: 12, dec: 12 };
const txEhTradeRepublic = texto => /trade republic/i.test(String(texto || ''));
// No extrato da Trade Republic as compras aparecem como
//   "06 out. 2026 Comércio Buy trade XF000ETH0019 Ethereum, quantity: 0.020598 51,04 €"
// O valor já inclui a comissão (o extrato não a mostra em separado).
const txLerTradeRepublic = texto => {
  const t = String(texto || '').replace(/[\s  ]+/g, ' ');
  const re = /(\d{1,2}) ([A-Za-zçãäé]{3})[a-zçãäé]*\.? (\d{4}) [^\d€]{0,40}?(Buy trade|Sell trade|Savings plan execution) ([A-Z]{2}[A-Z0-9]{9}\d) (.+?), quantity: ([\d.,]+) ((?:\d{1,3}(?: \d{3})*|\d+)(?:[.,]\d{2}))\s?€/g;
  const out = []; let m;
  while ((m = re.exec(t))) {
    const mes = TX_MESES[m[2].toLowerCase()];
    if (!mes) continue;
    const data = `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const isin = m[5], nome = m[6].trim(), q = txNumero(m[7]), v = txR2(txNumero(m[8]));
    if (!q || !v) continue;
    const cripto = /^XF000/.test(isin);
    out.push({
      data, tipo: /^Sell/i.test(m[4]) ? 'venda' : 'compra', categoria: cripto ? 'CRIPTO' : 'ETF',
      ticker: nome, corretora: 'Trade Republic', quantidade: q, precoUnitario: Math.round(v / q * 1e4) / 1e4,
      valorTotal: v, comissao: 0, notas: `ISIN ${isin}`, isin, importId: `tr:${data}:${isin}:${q}:${v}`,
    });
  }
  // Juros do dinheiro parado e dividendos: são rendimento, não dinheiro que puseste.
  // Entram como "dividendo" e por isso não contam para o "puseste".
  const DATA = '(\\d{1,2}) ([A-Za-zçãäé]{3})[a-zçãäé]*\\.? (\\d{4}) ', VALOR = ' ((?:\\d{1,3}(?: \\d{3})*|\\d+)(?:[.,]\\d{2}))\\s?€';
  const dataDe = x => { const mes = TX_MESES[x[2].toLowerCase()]; return mes ? `${x[3]}-${String(mes).padStart(2, '0')}-${x[1].padStart(2, '0')}` : null; };
  const reJ = new RegExp(DATA + '(?:Juros|Interest|Zinsen|Intereses|Intérêts) (?:Your interest payment|Interest payment)' + VALOR, 'g');
  while ((m = reJ.exec(t))) {
    const data = dataDe(m), v = txR2(txNumero(m[4]));
    if (!data || !v) continue;
    out.push({ data, tipo: 'dividendo', categoria: 'FE', ticker: 'Juros Trade Republic', corretora: 'Trade Republic', quantidade: 1, precoUnitario: v,
      valorTotal: v, comissao: 0, notas: 'Juros do dinheiro parado', isin: '', importId: `tr:juros:${data}:${v}` });
  }
  const reD = new RegExp(DATA + '[^\\d€]{0,40}?Cash Dividend for ISIN ([A-Z]{2}[A-Z0-9]{9}\\d)[^€]{0,80}?' + VALOR, 'g');
  while ((m = reD.exec(t))) {
    const data = dataDe(m), v = txR2(txNumero(m[5]));
    if (!data || !v) continue;
    out.push({ data, tipo: 'dividendo', categoria: 'ETF', ticker: `Dividendo ${m[4]}`, corretora: 'Trade Republic', quantidade: 1, precoUnitario: v,
      valorTotal: v, comissao: 0, notas: `ISIN ${m[4]}`, isin: m[4], importId: `tr:div:${data}:${m[4]}:${v}` });
  }
  return out;
};
// Marca o que já existe: importado antes (mesma referência) ou registado à mão
// (mesmo dia, mesmo tipo e valor quase igual — com ou sem a comissão incluída).
// Uma transação registada à mão "parece" a mesma que uma importada se for do mesmo tipo,
// tiver até 10 dias de diferença e o valor for quase igual (com ou sem a comissão).
const txDias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const txParecida = (manual, imp) => {
  if (!manual || !imp || manual.tipo !== imp.tipo || !manual.data || !imp.data) return false;
  if (!(txDias(manual.data, imp.data) <= 10)) return false;
  const vm = patNum(manual.valorTotal), vi = patNum(imp.valorTotal), ci = patNum(imp.comissao);
  const tol = Math.max(1.5, vi * 0.01);
  return Math.abs(vm - vi) <= tol || Math.abs(vm - (vi + ci)) <= tol;
};
const txMaisProxima = (alvo, lista, usados, teste) => {
  let melhor = -1, dist = Infinity;
  lista.forEach((t, k) => {
    if (usados.has(k) || !teste(t)) return;
    const d = txDias(t.data, alvo.data);
    if (d < dist) { dist = d; melhor = k; }
  });
  return melhor;
};
const txMarcarDuplicados = (novas, existentes) => {
  const ex = (existentes || []).filter(Boolean);
  const ids = new Set(ex.map(t => t.importId).filter(Boolean));
  const usados = new Set();
  return (novas || []).map(n => {
    if (n.importId && ids.has(n.importId)) return { ...n, dup: 'importada' };
    const i = txMaisProxima(n, ex, usados, t => !t.importId && txParecida(t, n));
    if (i >= 0) { usados.add(i); return { ...n, dup: 'manual' }; }
    return { ...n, dup: null };
  });
};
// Pares já gravados que parecem a mesma compra: uma registada à mão e outra importada.
const txDuplicadosProvaveis = transacoes => {
  const todas = (transacoes || []).filter(Boolean);
  const imp = todas.filter(t => t.importId), usados = new Set(), pares = [];
  todas.filter(t => !t.importId).forEach(m => {
    const i = txMaisProxima(m, imp, usados, t => txParecida(m, t));
    if (i >= 0) { usados.add(i); pares.push({ manual: m, importada: imp[i] }); }
  });
  return pares;
};
// Texto de um PDF (usa a pdf.js, carregada só quando é precisa)
const txTextoPDF = async arrayBuffer => {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      s.onload = resolve; s.onerror = () => reject(new Error('Não consegui carregar o leitor de PDF. Verifica a ligação à internet.'));
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let txt = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    txt += tc.items.map(it => it.str).join('\n') + '\n';
  }
  return txt;
};
// Devolve { origem, linhas } a partir de um ficheiro escolhido pelo utilizador
const txLerFicheiro = async file => {
  const nome = String(file.name || '').toLowerCase();
  if (nome.endsWith('.pdf') || file.type === 'application/pdf') {
    const txt = await txTextoPDF(await file.arrayBuffer());
    if (!txEhTradeRepublic(txt)) throw new Error('Este PDF não parece ser um extrato da Trade Republic.');
    return { origem: 'Trade Republic', linhas: txLerTradeRepublic(txt) };
  }
  const txt = await file.text();
  if (txEhDegiro(txt)) return { origem: 'Degiro', linhas: txLerDegiro(txt) };
  throw new Error('Não reconheci o ficheiro. Aceito o CSV de transações da Degiro e o extrato em PDF da Trade Republic.');
};

// ══ PATRIMÓNIO: lógica ══════════════════════════════════════════════════════
// Um registo por mês, guardado por COMPONENTES (e não só um total), para que
// qualquer vista futura possa ser recalculada a partir do detalhe.
//   G.patrimonio = { registos: { 'AAAA-M': registo }, eventos: [{id, data, texto}] }
//   registo = { investItens:[{desc,cat,val}], liquidez:[{id,nome,val}], imoveis:[…],
//               outros:[…], dividas:[{…, creditoId?}], aportes, levantamentos, amortizacao,
//               nota, fechadoEm, importado? }
const PAT_COMP = [
  { k: 'invest', label: 'Investimentos', cor: '#3b82f6' },
  { k: 'liquidez', label: 'Liquidez', cor: '#059669' },
  { k: 'imoveis', label: 'Imóveis', cor: '#d97706' },
  { k: 'outros', label: 'Outros ativos', cor: '#8b5cf6' },
  { k: 'dividas', label: 'Dívidas', cor: '#ef4444' }
];
const PAT_CONTAS_BASE = ['ABanca', 'Activo Bank', 'Revolut'];
// Categorias do Portfolio que são dinheiro parado e não investimento exposto ao
// mercado. Contam como Liquidez, para não distorcerem o retorno dos investimentos.
const PAT_CATS_LIQUIDEZ = ['FE'];
const patChave = desc => String(desc || '').trim().toLowerCase();
// Primeiro vale a tua escolha, linha a linha (G.patrimonio.dinheiro). Sem escolha, a
// categoria FE e a linha do saldo chamada "Trade Republic" (conta de passagem: recebe
// receitas e paga impostos e amortizações — não é investimento).
const patEhLiquidez = (i, regras) => {
  if (!i) return false;
  const r = (regras || {})[patChave(i.desc)];
  if (r === true || r === false) return r;
  if (PAT_CATS_LIQUIDEZ.includes(i.cat)) return true;
  // Só a linha do saldo: "Trade Republic", "Trade Republic (saldo)", "TR conta"… Uma linha de
  // cripto ou de ETF comprados na Trade (ex.: "Trade Republic Cripto") continua a ser investimento.
  if (i.cat === 'CRIPTO') return false;
  return /^\s*trade\s*republic\s*(\(?\s*(saldo|conta|cash|dinheiro|juros)\s*\)?)?\s*$/i.test(i.desc || '');
};
// Usa a marca já calculada no item, se existir
const patItemLiq = i => (i && typeof i.liq === 'boolean') ? i.liq : patEhLiquidez(i);
const patRegras = G => ((G || {}).patrimonio || {}).dinheiro || {};

const patId = () => Date.now() + Math.random();
const patNum = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
const patStr = v => (v === '' || v == null) ? '' : String(v);
// Aceita 'AAAA-M', 'AAAA-MM' e 'AAAA-MM-DD' (a app usa os três formatos).
const patIdx = key => { const [y, m] = String(key || '').split('-').map(Number); return (y || 0) * 12 + ((m || 1) - 1); };
const patKey = idx => `${Math.floor(idx / 12)}-${(idx % 12) + 1}`;
const patSoma = l => (l || []).reduce((a, x) => a + patNum(x.val), 0);
// Dia a que se referem os valores do Portfolio de um mês. Por defeito é o último dia
// do mês; se o Portfolio foi atualizado noutro dia (por exemplo no dia 3 do mês
// seguinte, já depois de uma compra), é esse dia que separa o que conta para cada mês.
const patIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const patFimMes = idx => patIso(new Date(Math.floor(idx / 12), (idx % 12) + 1, 0));
const patDataAceite = (idx, data) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return false;
  const ini = patIso(new Date(Math.floor(idx / 12), idx % 12, 1)), max = patIso(new Date(Math.floor(idx / 12), (idx % 12) + 1, 20));
  return data >= ini && data <= max;
};
// Meses preenchidos antes de a app guardar o dia: ordenado + 2 dias, indicado pelo Ivo.
// Valem enquanto não houver uma data escolhida à mão nem uma atualização nova do Portfolio.
const PAT_DATAS_INICIAIS = { '2026-7': '2026-07-04', '2026-8': '2026-08-02', '2026-9': '2026-09-04', '2026-10': '2026-10-07' };
const patCorte = (G, M, idx) => {
  const key = patKey(idx);
  const manual = ((((G || {}).patrimonio || {}).datas) || {})[key];
  if (patDataAceite(idx, manual)) return manual;
  const auto = ((M || {})[key] || {}).portfolioData;
  if (patDataAceite(idx, auto)) return auto;
  return patDataAceite(idx, PAT_DATAS_INICIAIS[key]) ? PAT_DATAS_INICIAIS[key] : patFimMes(idx);
};
const patIdxHoje = () => { const h = new Date(); return h.getFullYear() * 12 + h.getMonth(); };
// Um mês só "tem portfolio" se tiver valores. Ao editar qualquer outra coisa num mês
// novo, a app copia a lista por defeito (tudo a zero) — isso não conta como preenchido.
const patTemPortfolio = p => Array.isArray(p) && p.some(x => patNum(x && x.val) !== 0);

// Histórico do Portfolio SEM depender do botão Snapshot: junta os snapshots
// antigos com o que está guardado em cada mês (que prevalece).
const patHistoricoPortfolio = (guardado, M) => {
  const mapa = {}, hoje = patIdxHoje();
  (guardado || []).forEach(h => { if (h && h.date) mapa[patIdx(h.date)] = patNum(h.total); });
  Object.keys(M || {}).forEach(k => {
    const p = (M[k] || {}).portfolio, i = patIdx(k);
    if (patTemPortfolio(p) && i <= hoje) mapa[i] = patSoma(p);
  });
  return Object.keys(mapa).map(Number).sort((a, b) => a - b).map(i => ({ date: patKey(i), total: mapa[i] }));
};
const patRotulo = idx => `${meses[idx % 12].slice(0, 3)}/${String(Math.floor(idx / 12)).slice(2)}`;

const patTotais = rec => {
  const r = rec || {};
  const itens = r.investItens || [];
  const invest = patSoma(itens.filter(i => !patItemLiq(i)));
  const liquidez = patSoma(r.liquidez) + patSoma(itens.filter(patItemLiq)), imoveis = patSoma(r.imoveis);
  const outros = patSoma(r.outros), dividas = patSoma(r.dividas);
  const capital = invest + liquidez + outros;               // sem casa nem dívida
  // Dinheiro da venda da casa guardado para comprar imóvel: está dentro da liquidez,
  // mas não é dinheiro "livre". Nunca pode ser mais do que o dinheiro que existe.
  const reservado = Math.max(0, Math.min(patNum(r.reservado != null ? r.reservado : r.reservadoAuto), liquidez));
  return { invest, liquidez, imoveis, outros, dividas, capital, reservado, livre: capital - reservado, total: capital + imoveis - dividas };
};

const patSerie = registos => Object.entries(registos || {})
  .map(([key, rec]) => ({ key: patKey(patIdx(key)), idx: patIdx(key), rec, ...patTotais(rec) }))
  .sort((a, b) => a.idx - b.idx);

// Por registo: variações e separação entre o que foi posto (aportes) e o que o
// mercado rendeu. Snapshots antigos (importados) não entram, nem como ponto de
// partida: não têm movimentos e podem ter o fundo de emergência misturado no total.
const patDetalhe = serie => serie.map((s, i) => {
  const prev = i > 0 ? serie[i - 1] : null;
  const temFluxos = !!prev && !s.rec.importado && !prev.rec.importado;
  const fluxo = temFluxos ? patNum(s.rec.aportes) - patNum(s.rec.levantamentos) - patNum(s.rec.amortizacao) : null;
  return {
    ...s, prev, fluxo,
    resultado: temFluxos ? s.invest - prev.invest - fluxo : null,
    dCapital: prev ? s.capital - prev.capital : null,
    dTotal: prev ? s.total - prev.total : null,
    salto: prev ? s.idx - prev.idx : 0
  };
});

// Dinheiro da venda da casa que ainda está reservado para imobiliário num dado mês,
// segundo o separador Venda de Casa: o líquido da venda menos o que já foi gasto ou
// investido até ao dia do Portfolio desse mês. Antes da data da venda é zero.
const patReservado = (G, M, idx) => {
  const vc = { ...VC_DEFAULT, ...((G || {}).vendaCasa || {}) };
  const corte = patCorte(G, M, idx);
  if (!vc.dataVenda || String(vc.dataVenda).slice(0, 10) > corte) return 0;
  const venda = patNum(vc.valorVenda), amort = patNum(vc.creditoAmortizado);
  const liquido = venda - venda * patNum(vc.comissaoPct) / 100 - amort - amort * patNum(vc.penalizacaoPct) / 100
    - patNum(vc.custoEscritura) - patNum(vc.rendasAdiantadas) - patNum(vc.outrosCustos);
  const saiu = (vc.movimentos || []).filter(m => m && (m.tipo === 'gasto' || m.tipo === 'investido') && (!m.data || String(m.data).slice(0, 10) <= corte))
    .reduce((a, m) => a + patNum(m.val), 0);
  const aRepor = (vc.repor || []).reduce((a, r) => a + patNum(r && r.val), 0);
  return Math.max(0, Math.round((liquido - saiu - aRepor) * 100) / 100);
};

// Saldo de cada conta num dado dia, tirado dos extratos importados (separador Extrato):
// o saldo que vem no último movimento dessa conta até esse dia.
const patSaldosExtrato = (G, corte) => {
  const contas = (G || {}).contas || [], out = [];
  contas.forEach(c => {
    const txs = ((G || {}).extrato || []).filter(t => t && t.contaId === c.id && t.saldo != null && isFinite(Number(t.saldo)) && t.data && String(t.data).slice(0, 10) <= corte);
    if (!txs.length) return;
    const maxData = txs.reduce((a, t) => String(t.data).slice(0, 10) > a ? String(t.data).slice(0, 10) : a, '');
    const doDia = txs.filter(t => String(t.data).slice(0, 10) === maxData);
    // Vários movimentos no mesmo dia: o último é o primeiro da lista se o ficheiro vinha do mais recente para o mais antigo
    const descendente = String(txs[0].data) >= String(txs[txs.length - 1].data);
    const ult = descendente ? doDia[0] : doDia[doDia.length - 1];
    out.push({ contaId: c.id, nome: c.nome || c.banco || 'Conta', banco: c.banco || '', saldo: Math.round(Number(ult.saldo) * 100) / 100, data: maxData });
  });
  return out;
};

// Poupança por mês: quanto o património total cresceu sem ser por causa do mercado.
// Conta o dinheiro que ficou nas contas ou foi investido e a dívida que desceu.
// Meses em que o valor dos imóveis mudou (reavaliação, compra, venda) ficam de fora da média.
const patPoupanca = (det, M) => det.filter(d => d.resultado != null).map(d => {
  let receitas = 0;
  for (let i = d.prev.idx + 1; i <= d.idx; i++) {
    const v = (M || {})[patKey(i)] || {};
    receitas += [...(v.regCom || []), ...(v.regSem || [])].reduce((a, r) => a + patNum(r.val), 0);
  }
  const casaMudou = Math.abs(d.imoveis - d.prev.imoveis) >= 1;
  const semRes = x => x.total - x.reservado;
  return { idx: d.idx, meses: d.salto || 1, receitas, casaMudou, poupanca: (semRes(d) - semRes(d.prev)) - d.resultado - (d.imoveis - d.prev.imoveis) };
});

// Retorno real por ano (XIRR): a taxa anual que explica as tuas compras, nas datas em que
// as fizeste, e o valor de hoje. Devolve também quanto puseste por mês nos últimos 12 meses.
const patRetornoReal = (G, itens, hojeIso) => {
  const regras = patRegras(G), valorCat = {};
  (itens || []).forEach(i => { if (!i.liq && !patEhLiquidez(i, regras)) valorCat[i.cat] = (valorCat[i.cat] || 0) + patNum(i.val); });
  const txs = ((G || {}).transacoes || []).filter(t => patTxConta(t, regras) && valorCat[t.categoria] > 0 && String(t.data) <= hojeIso);
  if (!txs.length) return null;
  const cats = [...new Set(txs.map(t => t.categoria))];
  const valor = cats.reduce((a, c) => a + valorCat[c], 0);
  const dia = iso => Date.parse(String(iso).slice(0, 10)) / 864e5, t1 = dia(hojeIso);
  const fluxos = txs.map(t => ({ t: (t1 - dia(t.data)) / 365.25, v: -patTxLiquido(t) }));
  const van = r => fluxos.reduce((a, x) => a + x.v * Math.pow(1 + r, x.t), 0) + valor;
  let lo = -0.95, hi = 5, taxa = null;
  if (van(lo) * van(hi) < 0) {
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (van(lo) * van(mid) <= 0) hi = mid; else lo = mid; }
    taxa = (lo + hi) / 2;
  }
  const lim = new Date(Date.parse(hojeIso)); lim.setFullYear(lim.getFullYear() - 1);
  const limIso = patIso(lim);
  const ult12 = txs.filter(t => String(t.data) > limIso).reduce((a, t) => a + patTxLiquido(t), 0);
  return { taxa, mediaMensal: ult12 / 12, cats, desde: txs.map(t => t.data).sort()[0], valor };
};

// Transações que contam como "pôr ou tirar dinheiro dos investimentos"
const patTxConta = (t, regras) => !!t && !!t.data && (t.tipo === 'compra' || t.tipo === 'venda')
  && t.categoria !== 'CREDITO' && !patEhLiquidez({ desc: t.ticker, cat: t.categoria }, regras);
const patTxLiquido = t => t.tipo === 'compra' ? patNum(t.valorTotal) + patNum(t.comissao) : -Math.max(0, patNum(t.valorTotal) - patNum(t.comissao));
const patTxEntre = (G, M, de, ate) => {
  const regras = patRegras(G), a = patCorte(G, M, de - 1), b = patCorte(G, M, ate);
  return ((G || {}).transacoes || []).filter(t => patTxConta(t, regras) && t.data > a && t.data <= b)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
};
// Ganho desde a primeira compra, por categoria: o que vale hoje no Portfolio menos
// tudo o que lá foi posto segundo as Transações. Não depende do histórico mensal.
const patVida = (G, itens, ateIdx) => {
  const regras = patRegras(G), cats = {};
  ((G || {}).transacoes || []).forEach(t => {
    if (!patTxConta(t, regras) || patIdx(t.data) > ateIdx) return;
    const c = cats[t.categoria || '—'] = cats[t.categoria || '—'] || { cat: t.categoria || '—', posto: 0, n: 0, desde: t.data, valor: 0 };
    c.posto += patTxLiquido(t); c.n++; if (t.data < c.desde) c.desde = t.data;
  });
  (itens || []).forEach(i => { if (cats[i.cat] && !i.liq && !patEhLiquidez(i, regras)) cats[i.cat].valor += patNum(i.val); });
  const linhas = Object.values(cats).map(c => ({ ...c, ganho: c.valor - c.posto, pct: c.posto > 0 ? (c.valor - c.posto) / c.posto : null }))
    .sort((a, b) => b.valor - a.valor);
  const boas = linhas.filter(l => l.valor > 0 && l.posto > 0);
  const valor = patSoma(boas.map(l => ({ val: l.valor }))), posto = patSoma(boas.map(l => ({ val: l.posto })));
  return {
    linhas, cats: boas.map(l => l.cat), valor, posto, ganho: valor - posto, pct: posto > 0 ? (valor - posto) / posto : null,
    n: boas.reduce((a, l) => a + l.n, 0), desde: boas.length ? boas.map(l => l.desde).sort()[0] : null
  };
};

// Retorno dos investimentos ponderado pelo tempo (Dietz modificado, encadeado).
const patRetorno = det => {
  let fator = 1, resultado = 0, aportes = 0, mesesN = 0, periodos = 0, inicio = null, variacao = 0;
  det.forEach(d => {
    if (d.resultado == null) return;
    if (inicio == null) inicio = d.prev.idx;
    resultado += d.resultado; aportes += d.fluxo; variacao += d.invest - d.prev.invest;
    const base = d.prev.invest + d.fluxo / 2;
    if (base > 0) { fator *= 1 + d.resultado / base; mesesN += d.salto; periodos++; }
  });
  return {
    resultado, aportes, periodos, meses: mesesN, inicio, variacao,
    twr: periodos ? fator - 1 : null,
    anual: (mesesN >= 12 && fator > 0) ? Math.pow(fator, 12 / mesesN) - 1 : null
  };
};

const patInvestDoPortfolio = portfolio => (portfolio || [])
  .filter(p => p.cat !== 'CREDITO' && patNum(p.val) !== 0)   // amortização não é ativo: já está na dívida
  .map(p => ({ desc: p.desc || 'Sem nome', cat: p.cat || '—', val: patNum(p.val) }));

const patListaCreditos = G => {
  if (Array.isArray(G.creditos) && G.creditos.length) return G.creditos;
  if (G.credito && patNum(G.credito.dividaAtual) > 0) {
    return [{ ...G.credito, id: 'legado', nome: 'Crédito Habitação', tipo: 'habitacao', estado: 'ativo', valorBem: G.credito.valorCasa }];
  }
  return [];
};

// Dívida (e valor do imóvel) num dado mês, pelo histórico do separador Crédito.
const patCreditoNoMes = (G, idx) => {
  const dividas = [], imoveis = [];
  patListaCreditos(G).forEach(c => {
    if (c.estado === 'planeado') return;
    if (c.estado === 'liquidado' && c.dataLiquidacao && patIdx(c.dataLiquidacao) <= idx) return;
    const ent = (c.historico || []).filter(e => e && e.date && patIdx(e.date) <= idx)
      .sort((a, b) => patIdx(b.date) - patIdx(a.date))[0];
    if (!ent) return;
    dividas.push({ id: patId(), nome: c.nome || 'Crédito', val: patNum(ent.divida), creditoId: c.id });
    if ((c.tipo || 'habitacao') === 'habitacao' && patNum(c.valorBem) > 0) {
      imoveis.push({ id: patId(), nome: 'Casa', val: patNum(c.valorBem) });
    }
  });
  return { dividas, imoveis };
};

// Rascunho do mês: o registo guardado, ou uma proposta pré-preenchida.
const patRascunho = ({ registos, key, portfolio, G, M }) => {
  const copia = l => (l || []).map(x => ({ ...x, id: x.id || patId(), val: patStr(x.val) }));
  const mov = patMovimentos(G, M, registos, key);
  const z = v => v ? patStr(v) : '';
  const ex = (registos || {})[key];
  if (ex) {
    return {
      existe: true, importado: !!ex.importado, fechadoEm: ex.fechadoEm || null, movManual: !!ex.movManual,
      investItens: (ex.investItens || []).map(i => ({ ...i })),
      liquidez: copia(ex.liquidez), imoveis: copia(ex.imoveis), outros: copia(ex.outros), dividas: copia(ex.dividas),
      // Um registo importado ainda não tem movimentos: propõe os das Transações
      aportes: ex.importado ? z(mov.aportes) : patStr(ex.aportes), levantamentos: ex.importado ? z(mov.levantamentos) : patStr(ex.levantamentos),
      amortizacao: ex.importado ? z(mov.amortizacao) : patStr(ex.amortizacao),
      origemMov: ex.importado ? mov.origem : null,
      reservado: ex.reservado != null ? patStr(ex.reservado) : '',
      nota: ex.nota || ''
    };
  }
  const idx = patIdx(key);
  const prev = patSerie(registos).filter(s => s.idx < idx).pop();
  const manuais = prev ? (prev.rec.dividas || []).filter(d => d.creditoId == null) : [];
  // Mês corrente: valores atuais do separador Crédito. Mês passado: o histórico desse mês.
  const passado = idx < patIdxHoje();
  const hist = passado ? patCreditoNoMes(G, idx) : null;
  const ativos = patListaCreditos(G).filter(c => c.estado === 'ativo');
  const dividasCredito = passado ? hist.dividas.map(d => ({ ...d, val: patStr(d.val) }))
    : ativos.map(c => ({ id: patId(), nome: c.nome || 'Crédito', val: patStr(patNum(c.dividaAtual)), creditoId: c.id }));
  const imoveisCredito = passado ? hist.imoveis.map(d => ({ ...d, val: patStr(d.val) }))
    : ativos.filter(c => (c.tipo || 'habitacao') === 'habitacao' && patNum(c.valorBem) > 0)
        .map(c => ({ id: patId(), nome: 'Casa', val: patStr(patNum(c.valorBem)) }));
  return {
    existe: false, importado: false, fechadoEm: null,
    investItens: patInvestDoPortfolio(portfolio),
    liquidez: prev ? copia(prev.rec.liquidez) : PAT_CONTAS_BASE.map(n => ({ id: patId(), nome: n, val: '' })),
    imoveis: prev ? copia(prev.rec.imoveis) : imoveisCredito,
    outros: prev ? copia(prev.rec.outros) : [],
    dividas: [...dividasCredito, ...copia(manuais)],
    aportes: z(mov.aportes), levantamentos: z(mov.levantamentos), amortizacao: z(mov.amortizacao), origemMov: mov.origem, reservado: '', nota: ''
  };
};

const patLimpar = d => {
  const limpa = l => (l || [])
    .map(x => ({ id: x.id || patId(), nome: (x.nome || '').trim(), val: patNum(x.val), ...(x.creditoId != null ? { creditoId: x.creditoId } : {}) }))
    .filter(x => x.nome || x.val);
  return {
    investItens: (d.investItens || []).map(i => ({ desc: i.desc, cat: i.cat, val: patNum(i.val) })),
    liquidez: limpa(d.liquidez), imoveis: limpa(d.imoveis), outros: limpa(d.outros), dividas: limpa(d.dividas),
    aportes: patNum(d.aportes), levantamentos: patNum(d.levantamentos), amortizacao: patNum(d.amortizacao),
    ...(d.movManual ? { movManual: true } : {}),
    ...(d.reservado != null && String(d.reservado).trim() !== '' ? { reservado: patNum(d.reservado) } : {}),
    nota: (d.nota || '').trim(), fechadoEm: new Date().toISOString()
  };
};

// Sugestão de aportes: investimentos marcados como feitos na Alocação, desde o último registo.
const patSugestaoAportes = (M, registos, key, regras) => {
  const idx = patIdx(key);
  const prev = patSerie(registos).filter(s => s.idx < idx).pop();
  const de = Math.max(prev ? prev.idx + 1 : idx, idx - 23);
  let tot = 0;
  for (let i = de; i <= idx; i++) {
    ((M[patKey(i)] || {}).inv || []).forEach(x => { if (x.done && x.cat !== 'CREDITO' && !patEhLiquidez(x, regras)) tot += patNum(x.val); });
  }
  return tot;
};

// Movimentos desde o último registo, lidos do separador Transações:
//   compra → aporte · venda → levantamento. Categoria CREDITO e dinheiro parado ficam de fora.
// Dividendos não contam: são resultado, não dinheiro novo. Sem transações no
// período, usa os investimentos marcados como feitos na Alocação.
const patMovimentos = (G, M, registos, key) => {
  const idx = patIdx(key);
  const prev = patSerie(registos).filter(s => s.idx < idx).pop();
  const de = Math.max(prev ? prev.idx + 1 : idx, idx - 23);
  const r2 = v => Math.round(v * 100) / 100;
  const regras = patRegras(G);
  let aportes = 0, levantamentos = 0, amortizacao = 0, nCompras = 0, nVendas = 0;
  const desdeData = patCorte(G, M, de - 1), ateData = patCorte(G, M, idx);
  ((G || {}).transacoes || []).forEach(t => {
    if (!t || !t.data) return;
    if (!(t.data > desdeData && t.data <= ateData)) return;
    const v = patNum(t.valorTotal);
    if (patEhLiquidez({ desc: t.ticker, cat: t.categoria }, regras)) return;   // mexer em dinheiro parado não é investir
    if (t.categoria === 'CREDITO') return;   // amortizações saem do dinheiro (Trade), não dos investimentos
    const com = patNum(t.comissao);   // a comissão também é dinheiro que saiu do teu bolso
    if (t.tipo === 'compra') { nCompras++; aportes += v + com; }
    else if (t.tipo === 'venda') { nVendas++; levantamentos += Math.max(0, v - com); }
  });
  if (nCompras + nVendas > 0) {
    return { origem: 'transacoes', aportes: r2(aportes), levantamentos: r2(levantamentos), amortizacao: r2(amortizacao), nCompras, nVendas };
  }
  const aloc = patSugestaoAportes(M || {}, registos, key, regras);
  return { origem: aloc > 0 ? 'alocacao' : null, aportes: r2(aloc), levantamentos: 0, amortizacao: 0, nCompras: 0, nVendas: 0 };
};

// Estado dos últimos n meses, para se ver de relance o que falta preencher.
//   portfolio: 'ok' (tem valores próprios) · 'igual' (valores iguais aos do mês
//   anterior — provavelmente copiado e não atualizado) · 'falta' (sem valores)
//   · 'antes' (anterior ao primeiro mês com dados)
const patEstadoMeses = (G, M, n) => {
  const mm = M || {}, hoje = patIdxHoje(), regras = patRegras(G);
  // Só as linhas de investimento: o saldo das contas muda sempre, mas o valor de um ETF
  // nunca fica igual de um mês para o outro — se ficou, não foi atualizado.
  const assin = p => JSON.stringify(patInvestDoPortfolio(p).filter(i => !patEhLiquidez(i, regras)).map(i => [patChave(i.desc), i.val]).sort());
  const tx = {};
  ((G || {}).transacoes || []).forEach(t => {
    if (!t || !t.data || (t.tipo !== 'compra' && t.tipo !== 'venda') || t.categoria === 'CREDITO') return;
    if (patEhLiquidez({ desc: t.ticker, cat: t.categoria }, regras)) return;
    const i = patIdx(t.data); tx[i] = (tx[i] || 0) + 1;
  });
  // Meses anteriores ao primeiro mês com dados não são "em falta": ainda não usavas a app
  const comDados = Object.keys(mm).filter(k => patTemPortfolio((mm[k] || {}).portfolio)).map(patIdx);
  const primeiro = comDados.length ? Math.min(...comDados) : hoje;
  const out = [];
  for (let i = hoje - (n - 1); i <= hoje; i++) {
    const key = patKey(i), p = (mm[key] || {}).portfolio, ant = (mm[patKey(i - 1)] || {}).portfolio;
    const tem = patTemPortfolio(p);
    out.push({
      idx: i, key, transacoes: tx[i] || 0,
      portfolio: i < primeiro ? 'antes' : !tem ? 'falta' : (patTemPortfolio(ant) && assin(p) === assin(ant)) ? 'igual' : 'ok'
    });
  }
  return out;
};

// Importa os snapshots antigos do Portfolio (e o histórico do Crédito) como registos.
const patImportar = (G, M, existentes) => {
  const regs = existentes || (G.patrimonio || {}).registos || {};
  const detalhe = G.portfolioDetail || {};
  const novos = {};
  (G.portfolioHist || []).forEach(h => {
    if (!h || !h.date) return;
    const idx = patIdx(h.date), key = patKey(idx);
    if (regs[key] || novos[key]) return;
    const pm = ((M || {})[key] || {}).portfolio || [];
    const det = detalhe[h.date] || detalhe[key] || [];
    const comCat = det.map(d => {
      const ref = pm.find(p => p.id === d.id) || pm.find(p => p.desc === d.desc);
      return { desc: d.desc || 'Sem nome', cat: ref ? ref.cat : '—', val: patNum(d.val) };
    });
    const excl = patSoma(comCat.filter(i => i.cat === 'CREDITO'));
    let itens = comCat.filter(i => i.cat !== 'CREDITO' && i.val);
    const total = patNum(h.total) - excl;
    if (!itens.length || Math.abs(patSoma(itens) - total) > 1) {
      itens = total ? [{ desc: 'Portfólio (total)', cat: '—', val: total }] : [];
    }
    const { dividas, imoveis } = patCreditoNoMes(G, idx);
    novos[key] = {
      investItens: itens, liquidez: [], imoveis, outros: [], dividas,
      aportes: 0, levantamentos: 0, amortizacao: 0, nota: '', fechadoEm: null, importado: true
    };
  });
  return novos;
};

// Os registos que a app realmente usa. Nada depende de carregar num botão:
//   1. o que guardaste (com os investimentos sempre lidos do Portfolio desse mês);
//   2. meses em que atualizaste o Portfolio mas não guardaste → registo automático;
//   3. snapshots antigos sem mais dados → registo importado.
const patRegistosEfetivos = (G, M) => {
  const guard = ((G || {}).patrimonio || {}).registos || {};
  const mm = M || {}, hoje = patIdxHoje(), out = {};
  Object.entries(guard).forEach(([k, r]) => {
    const key = patKey(patIdx(k)), p = (mm[key] || {}).portfolio;
    out[key] = patTemPortfolio(p) ? { ...r, investItens: patInvestDoPortfolio(p) } : r;
  });
  const autos = [...new Set(Object.keys(mm).map(k => patKey(patIdx(k))))]
    .filter(k => !out[k] && patTemPortfolio((mm[k] || {}).portfolio) && patIdx(k) <= hoje)
    .sort((a, b) => patIdx(a) - patIdx(b));
  Object.entries(patImportar(G || {}, mm, out)).forEach(([k, r]) => { if (!autos.includes(k)) out[k] = r; });
  autos.forEach(key => {
    const d = patRascunho({ registos: out, key, portfolio: mm[key].portfolio, G: G || {}, M: mm });
    out[key] = { ...patLimpar(d), fechadoEm: null, auto: true };
  });
  // Um registo guardado não fica preso ao valor do dia em que foi guardado: o que puseste
  // segue sempre as Transações, a não ser que tenha sido corrigido à mão.
  // Um snapshot antigo cujo Portfolio desse mês tem as linhas com categoria deixa de ser "sem detalhe":
  // sabe-se o que é investimento e o que é dinheiro, e o que lá puseste vem das Transações.
  const temCategorias = r => (r.investItens || []).some(i => i.cat && i.cat !== '—');
  const guardados = new Set(Object.keys(guard).map(k => patKey(patIdx(k))));
  Object.keys(out).sort((a, b) => patIdx(a) - patIdx(b)).forEach(key => {
    const r = out[key];
    if (!r || r.movManual || r.auto) return;
    if (r.importado && !temCategorias(r)) return;
    if (!r.importado && !guardados.has(key)) return;
    const base = { ...out }; delete base[key];
    const mov = patMovimentos(G || {}, mm, base, key);
    if (r.importado) { out[key] = { ...r, importado: false, deSnapshot: true, aportes: mov.aportes, levantamentos: mov.levantamentos }; return; }
    if (mov.origem !== 'transacoes') return;
    out[key] = { ...r, aportes: mov.aportes, ...(patNum(r.amortizacao) === 0 ? { levantamentos: mov.levantamentos } : {}) };
  });
  const regras = patRegras(G);
  Object.keys(out).forEach(k => {
    if (!out[k].importado) out[k] = { ...out[k], reservadoAuto: patReservado(G || {}, mm, patIdx(k)) };
    out[k] = { ...out[k], investItens: (out[k].investItens || []).map(i => ({ ...i, liq: patEhLiquidez(i, regras) })) };
  });
  return out;
};
// ══ COMPARAR ANOS ═══════════════════════════════════════════════════════════
// Dois anos lado a lado: receitas, despesas (do Extrato), investido (das Transações),
// juros/dividendos e património. Por defeito compara os mesmos meses dos dois anos.
const cmpDadosAno = (G, M, y, ateMes) => {
  const recMes = Array(12).fill(0), porCliente = {};
  let horas = 0, alocado = 0;
  Object.entries(M || {}).forEach(([k, v]) => {
    const [a, m] = String(k).split('-').map(Number);
    if (a !== y || !(m >= 1 && m <= ateMes) || !v) return;
    [...(v.regCom || []), ...(v.regSem || [])].forEach(r => { const x = patNum(r.val); recMes[m - 1] += x; porCliente[r.cid] = (porCliente[r.cid] || 0) + x; });
    horas += patNum(v.horasTrabalhadas);
    alocado += (v.inv || []).reduce((s2, i) => s2 + patNum(i.val), 0);
  });
  const noAno = d => { const dd = String(d || ''); return Number(dd.slice(0, 4)) === y && Number(dd.slice(5, 7)) <= ateMes; };
  let despesas = 0, nDesp = 0;
  ((G || {}).extrato || []).forEach(t => {
    if (!t || t.tipo !== 'despesa' || !noAno(t.data)) return;
    const v = patNum(t.valorReal != null ? t.valorReal : t.valor);
    if (v < 0) { despesas += -v; nDesp++; }
  });
  const regras = patRegras(G);
  let investido = 0, nTx = 0, rendimento = 0;
  ((G || {}).transacoes || []).forEach(t => {
    if (!t || !noAno(t.data)) return;
    if (t.tipo === 'dividendo') { rendimento += patNum(t.valorTotal); return; }
    if (!patTxConta(t, regras)) return;
    investido += patTxLiquido(t); nTx++;
  });
  const receitas = recMes.reduce((a, b) => a + b, 0);
  const mesesComReceita = recMes.filter(x => x > 0).length;
  return { receitas, recMes, porCliente, horas, alocado, despesas, nDesp, investido, nTx, rendimento, mesesComReceita };
};
const CompararAnos = ({ G, M, theme, anoAtual, mesAtual }) => {
  const escuro = theme !== 'light';
  const anosComDados = useMemo(() => {
    const set = new Set();
    Object.entries(M || {}).forEach(([k, v]) => { if (v && ((v.regCom || []).length || (v.regSem || []).length || patTemPortfolio(v.portfolio))) set.add(Number(String(k).split('-')[0])); });
    ((G || {}).transacoes || []).forEach(t => { if (t && t.data) set.add(Number(String(t.data).slice(0, 4))); });
    set.add(anoAtual);
    return [...set].filter(a => a > 2000).sort((a, b) => b - a);
  }, [G, M, anoAtual]);
  const [anoB, setAnoB] = useState(anoAtual);
  const [anoA, setAnoA] = useState(anoAtual - 1);
  const hoje = new Date();
  const envolveAnoCorrente = anoA === hoje.getFullYear() || anoB === hoje.getFullYear();
  const [mesmosMeses, setMesmosMeses] = useState(false);
  const ateMes = mesmosMeses && envolveAnoCorrente ? hoje.getMonth() + 1 : 12;
  const serie = useMemo(() => patSerie(patRegistosEfetivos(G, M)), [G, M]);
  const dA = useMemo(() => cmpDadosAno(G, M, anoA, ateMes), [G, M, anoA, ateMes]);
  const dB = useMemo(() => cmpDadosAno(G, M, anoB, ateMes), [G, M, anoB, ateMes]);
  const patFim = y => { const r = serie.filter(x => x.idx <= y * 12 + ateMes - 1 && x.idx >= y * 12).pop(); return r || null; };
  const pA = patFim(anoA), pB = patFim(anoB);
  const f = v => _fmtEUR.format(isFinite(v) ? v : 0);
  const sub = escuro ? 'text-slate-400' : 'text-slate-500';
  const corA = '#d97706', corB = '#3b82f6';
  const sel = `rounded-lg px-2 py-1 text-sm border ${escuro ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`;
  const linhas = [
    { l: 'Receitas', a: dA.receitas, b: dB.receitas, fm: f },
    { l: 'Média por mês com receita', a: dA.mesesComReceita ? dA.receitas / dA.mesesComReceita : 0, b: dB.mesesComReceita ? dB.receitas / dB.mesesComReceita : 0, fm: f },
    ...(dA.horas || dB.horas ? [{ l: 'Horas trabalhadas', a: dA.horas, b: dB.horas, fm: v => `${Math.round(v)} h`, neutro: true }] : []),
    ...(dA.nDesp || dB.nDesp ? [
      { l: 'Despesas (do Extrato)', a: dA.despesas, b: dB.despesas, fm: f, menosEhBom: true, falta: [!dA.nDesp, !dB.nDesp] },
      ...(dA.nDesp && dB.nDesp ? [{ l: 'Receitas − despesas', a: dA.receitas - dA.despesas, b: dB.receitas - dB.despesas, fm: f }] : [])
    ] : []),
    { l: dA.nTx || dB.nTx ? 'Investido (Transações)' : 'Investido (Alocação)', a: dA.nTx || dB.nTx ? dA.investido : dA.alocado, b: dA.nTx || dB.nTx ? dB.investido : dB.alocado, fm: f },
    ...(dA.rendimento || dB.rendimento ? [{ l: 'Juros e dividendos recebidos', a: dA.rendimento, b: dB.rendimento, fm: f }] : []),
    ...(pA || pB ? [
      { l: 'Património financeiro no fim', a: pA ? pA.capital : null, b: pB ? pB.capital : null, fm: f, nota: [pA && patRotulo(pA.idx), pB && patRotulo(pB.idx)] },
      { l: 'Património total no fim', a: pA && !pA.rec.importado ? pA.total : null, b: pB && !pB.rec.importado ? pB.total : null, fm: f }
    ] : [])
  ];
  const maxMes = Math.max(1, ...dA.recMes, ...dB.recMes);
  const clientes = (G.clientes || []).map(c => ({ nome: c.nome, a: dA.porCliente[c.id] || 0, b: dB.porCliente[c.id] || 0 }))
    .filter(c => c.a > 0 || c.b > 0).sort((x, y) => (y.a + y.b) - (x.a + x.b)).slice(0, 8);
  const delta = (a, b, menosEhBom, neutro) => {
    if (a == null || b == null) return <span className={sub}>—</span>;
    const d = b - a, p = a !== 0 ? d / Math.abs(a) * 100 : null;
    const bom = menosEhBom ? d <= 0 : d >= 0;
    const cor = neutro || Math.abs(d) < 0.005 ? sub : bom ? 'text-emerald-500' : 'text-red-400';
    if (p == null) return <span className={sub}>{Math.abs(d) < 0.005 ? '—' : 'novo'}</span>;
    return <span className={cor}>{d > 0 ? '+' : ''}{p.toFixed(0)}%</span>;
  };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold">📊 Comparar anos</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Primeiro ano" value={anoA} onChange={e => setAnoA(Number(e.target.value))} className={sel}>{anosComDados.map(a => <option key={a} value={a}>{a}</option>)}{!anosComDados.includes(anoA) && <option value={anoA}>{anoA}</option>}</select>
          <span className={sub}>vs</span>
          <select aria-label="Segundo ano" value={anoB} onChange={e => setAnoB(Number(e.target.value))} className={sel}>{anosComDados.map(a => <option key={a} value={a}>{a}</option>)}</select>
          {envolveAnoCorrente && (
            <label className={`flex items-center gap-1.5 text-xs ${sub} cursor-pointer`}>
              <input type="checkbox" className="accent-blue-500" checked={mesmosMeses} onChange={e => setMesmosMeses(e.target.checked)} /> só Janeiro a {meses[hoje.getMonth()]}
            </label>
          )}
        </div>
      </div>
      <p className={`text-xs mb-3 ${sub}`}>{ateMes < 12 ? `Janeiro a ${meses[ateMes - 1]} de cada ano, para a comparação ser justa.` : envolveAnoCorrente ? `Ano inteiro de cada lado. ${hoje.getFullYear()} ainda não acabou: para comparar os mesmos meses, marca «só Janeiro a ${meses[hoje.getMonth()]}».` : 'Ano inteiro de cada lado.'}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className={`text-xs ${sub}`}><th className="text-left font-normal py-1"></th>
            <th className="text-right font-normal"><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: corA }} />{anoA}{ateMes < 12 ? <span className="block text-[10px]">Jan–{meses[ateMes - 1].slice(0, 3)}</span> : anoA === hoje.getFullYear() && <span className="block text-[10px]">até agora</span>}</th>
            <th className="text-right font-normal"><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: corB }} />{anoB}{ateMes < 12 ? <span className="block text-[10px]">Jan–{meses[ateMes - 1].slice(0, 3)}</span> : anoB === hoje.getFullYear() && <span className="block text-[10px]">até agora</span>}</th>
            <th className="text-right font-normal">Diferença</th></tr></thead>
          <tbody>
            {linhas.map(r => (
              <tr key={r.l} className={`border-t ${escuro ? 'border-slate-700/40' : 'border-slate-200'}`}>
                <td className="py-1.5">{r.l}</td>
                <td className="text-right">{r.a == null || (r.falta && r.falta[0]) ? <span className={sub}>sem dados</span> : r.fm(r.a)}{r.nota && r.nota[0] ? <span className={`block text-[10px] ${sub}`}>{r.nota[0]}</span> : null}</td>
                <td className="text-right font-semibold">{r.b == null || (r.falta && r.falta[1]) ? <span className={`font-normal ${sub}`}>sem dados</span> : r.fm(r.b)}{r.nota && r.nota[1] ? <span className={`block text-[10px] font-normal ${sub}`}>{r.nota[1]}</span> : null}</td>
                <td className="text-right">{r.falta && (r.falta[0] || r.falta[1]) ? <span className={sub}>—</span> : delta(r.a, r.b, r.menosEhBom, r.neutro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-medium text-sm mt-5 mb-2">Receitas mês a mês</p>
      <div className="flex items-end gap-1 sm:gap-2 h-32" role="img" aria-label={`Receitas por mês, ${anoA} e ${anoB}`}>
        {meses.map((nome, i) => (
          <div key={nome} className={`flex-1 flex flex-col items-center justify-end h-full ${i >= ateMes ? 'opacity-30' : ''}`} title={`${nome}: ${anoA} ${f(dA.recMes[i])} · ${anoB} ${f(dB.recMes[i])}`}>
            <div className="flex items-end gap-0.5 w-full h-full">
              <div className="flex-1 rounded-t" style={{ height: `${(dA.recMes[i] / maxMes) * 100}%`, background: corA, minHeight: dA.recMes[i] > 0 ? 2 : 0 }} />
              <div className="flex-1 rounded-t" style={{ height: `${(dB.recMes[i] / maxMes) * 100}%`, background: corB, minHeight: dB.recMes[i] > 0 ? 2 : 0 }} />
            </div>
            <span className={`text-[10px] mt-1 ${sub}`}>{nome.slice(0, 3)}</span>
          </div>
        ))}
      </div>
      {clientes.length > 0 && (<>
        <p className="font-medium text-sm mt-5 mb-2">Receitas por cliente</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {clientes.map(c => (
                <tr key={c.nome} className={`border-t ${escuro ? 'border-slate-700/40' : 'border-slate-200'}`}>
                  <td className="py-1.5">{c.nome}</td>
                  <td className="text-right">{c.a ? f(c.a) : <span className={sub}>—</span>}</td>
                  <td className="text-right font-semibold">{c.b ? f(c.b) : <span className={`font-normal ${sub}`}>—</span>}</td>
                  <td className="text-right w-16">{c.a && c.b ? delta(c.a, c.b) : <span className={sub}>{c.b ? 'novo' : 'saiu'}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
      {!(dA.nDesp && dB.nDesp) && <p className={`text-xs mt-3 ${sub}`}>As despesas só aparecem nos anos com extratos importados no separador Extrato.</p>}
    </div>
  );
};

// ══ CHAT COM O GEMINI ═══════════════════════════════════════════════════════
// Painel de conversa. A pergunta e um resumo dos números (sem nomes, NIF nem IBAN) vão para a
// Firebase Function "chatFinancas", que fala com o Gemini com a mesma chave da leitura de faturas.
const CHAT_URLS = [
  'https://us-central1-dashboard-financas-f2b55.cloudfunctions.net/chatFinancas'
];
const ChatTexto = ({ texto }) => (
  <div className="space-y-1.5">
    {String(texto || '').split(/\n{2,}/).map((par, i) => (
      <p key={i} className="whitespace-pre-wrap">
        {par.split(/(\*\*[^*]+\*\*)/g).map((b, j) => /^\*\*[^*]+\*\*$/.test(b) ? <strong key={j}>{b.slice(2, -2)}</strong> : <React.Fragment key={j}>{b.replace(/^\s*[*-]\s+/gm, '• ')}</React.Fragment>)}
      </p>
    ))}
  </div>
);
const ChatGemini = ({ aberto, onFechar, mensagens, setMensagens, obterContexto, user, theme }) => {
  const [texto, setTexto] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [verResumo, setVerResumo] = useState(false);
  const fimRef = useRef(null);
  const claro = theme === 'light';
  useEffect(() => { if (fimRef.current) fimRef.current.scrollIntoView({ block: 'end' }); }, [mensagens, aEnviar, aberto]);
  if (!aberto) return null;
  const enviar = async (pergunta) => {
    const q = String(pergunta || '').trim();
    if (!q || aEnviar) return;
    const nova = [...mensagens, { papel: 'user', texto: q }];
    setMensagens(nova); setTexto(''); setAEnviar(true);
    try {
      const token = user && user.getIdToken ? await user.getIdToken() : '';
      let resp = null, erro = null;
      for (const url of CHAT_URLS) {
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ mensagens: nova.filter(m => !m.erro), contexto: obterContexto() }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.resposta) { resp = j.resposta; break; }
          erro = r.status === 404 ? 'O chat ainda não está publicado no servidor. Faz "firebase deploy --only functions" no teu computador.' : (j.error && j.error.message) || `Erro ${r.status}`;
        } catch (e) { erro = 'Não consegui ligar ao servidor. Se ainda não publicaste a função, faz "firebase deploy --only functions".'; }
      }
      setMensagens([...nova, resp ? { papel: 'model', texto: resp } : { papel: 'model', texto: erro || 'Sem resposta.', erro: true }]);
    } finally { setAEnviar(false); }
  };
  const sugestoes = ['Como estou este ano comparado com o anterior?', 'Quanto devo pôr de lado para impostos?', 'Estou a poupar o suficiente para o FIRE?', 'Resume o meu património em 3 frases.'];
  return createPortal(
    <div className={`fixed z-[70] bottom-0 right-0 sm:bottom-4 sm:right-4 w-full sm:w-[400px] h-[80vh] sm:h-[600px] flex flex-col rounded-t-2xl sm:rounded-2xl border shadow-2xl ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'}`} role="dialog" aria-label="Chat com o Gemini">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
        <div>
          <p className="font-semibold">✨ Perguntar ao Gemini</p>
          <button onClick={() => setVerResumo(!verResumo)} className="text-[11px] text-blue-400 hover:text-blue-300">{verResumo ? 'esconder' : 'ver'} o que é enviado</button>
        </div>
        <div className="flex items-center gap-1">
          {mensagens.length > 0 && <button onClick={() => setMensagens([])} className="text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-slate-200" title="Começar conversa nova">Limpar</button>}
          <button onClick={onFechar} aria-label="Fechar" className="px-2 py-1 text-slate-400 hover:text-slate-200">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {verResumo && <pre className={`text-[11px] whitespace-pre-wrap rounded-xl p-3 ${claro ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>{obterContexto()}</pre>}
        {mensagens.length === 0 && (
          <div className="space-y-3">
            <p className={claro ? 'text-slate-600' : 'text-slate-400'}>Pergunta o que quiseres sobre as tuas finanças. Cada pergunta leva um resumo dos teus números, sem nomes, NIF nem IBAN.</p>
            <p className="text-xs text-amber-500">Usa o nível gratuito do Gemini: a Google pode usar estas conversas para melhorar os produtos dela.</p>
            <div className="flex flex-wrap gap-2">
              {sugestoes.map(q => <button key={q} onClick={() => enviar(q)} className={`text-left text-xs px-3 py-2 rounded-xl border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>{q}</button>)}
            </div>
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.papel === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.papel === 'user' ? 'bg-blue-500 text-white' : m.erro ? 'bg-red-500/10 text-red-400 border border-red-500/30' : (claro ? 'bg-slate-100' : 'bg-slate-800')}`}>
              {m.papel === 'user' ? <p className="whitespace-pre-wrap">{m.texto}</p> : <ChatTexto texto={m.texto} />}
            </div>
          </div>
        ))}
        {aEnviar && <p className="text-slate-400 text-xs">A pensar…</p>}
        <div ref={fimRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); enviar(texto); }} className={`flex gap-2 p-3 border-t ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={1} placeholder="Escreve a tua pergunta…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
          className={`flex-1 resize-none rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500/40 ${claro ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-600 text-white'}`} />
        <button type="submit" disabled={aEnviar || !texto.trim()} className="px-4 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium disabled:opacity-40">Enviar</button>
      </form>
    </div>, document.body);
};

// ══ PATRIMÓNIO: componentes ═════════════════════════════════════════════════

const patFmtK = v => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace('.', ',') + 'M €';
  if (a >= 1000) return (v / 1000).toFixed(a >= 100000 ? 0 : 1).replace('.', ',') + 'k €';
  return Math.round(v) + ' €';
};

// Linhas editáveis de um componente (contas, imóveis, dívidas…)
const PatLinhas = ({ titulo, cor, linhas, onChange, inp, sub, dica, placeholder, fixas = [], onMoverFixa }) => {
  const upd = (id, campo, v) => onChange(linhas.map(l => l.id === id ? { ...l, [campo]: v } : l));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />{titulo}
        </p>
        <span className="text-sm font-semibold">{_fmtEUR.format(patSoma(linhas) + patSoma(fixas))}</span>
      </div>
      {dica && <p className={`text-[11px] mb-1.5 ${sub}`}>{dica}</p>}
      {fixas.length > 0 && (
        <div className="space-y-1 mb-2">
          {fixas.map((x, k) => (
            <div key={k} className={`flex justify-between gap-3 text-sm ${sub}`}>
              <span className="truncate">{x.desc} <span className="text-xs">· do Portfolio</span>
                {onMoverFixa && <button onClick={() => onMoverFixa(x)} title="Contar esta linha como investimento" className="ml-2 text-[11px] text-blue-400 hover:text-blue-300">← é investimento</button>}
              </span><span className="flex-shrink-0">{_fmtEUR.format(patNum(x.val))}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        {linhas.map(l => (
          <div key={l.id} className="flex items-center gap-1.5">
            <input type="text" value={l.nome} onChange={e => upd(l.id, 'nome', e.target.value)} placeholder={placeholder || 'Nome'} className={`${inp} flex-1 min-w-0`} />
            <input type="number" inputMode="decimal" value={l.val} onChange={e => upd(l.id, 'val', e.target.value)} placeholder="0" className={`${inp} w-28 text-right`} />
            <button onClick={() => onChange(linhas.filter(x => x.id !== l.id))} aria-label={`Remover ${l.nome || 'linha'}`} className="text-red-400 hover:text-red-300 px-1 flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...linhas, { id: patId(), nome: '', val: '' }])} className={`mt-1.5 text-xs ${sub} hover:text-blue-400`}>+ Adicionar linha</button>
    </div>
  );
};

// Gráfico de evolução: posiciona os pontos pelo mês real, por isso os meses em
// falta ficam visíveis (segmento tracejado) em vez de serem escondidos.
const PatChart = ({ pontos, eventos, theme }) => {
  const [hi, setHi] = useState(null);
  const [larg, setLarg] = useState(800);
  const ref = useRef(null);
  const caixa = useRef(null);
  useEffect(() => {
    const medir = () => { if (caixa.current && caixa.current.clientWidth) setLarg(caixa.current.clientWidth); };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  if (!pontos.length) return null;

  // 1 unidade do viewBox = 1 px real, para o texto manter o tamanho em qualquer ecrã
  const W = Math.max(300, larg), H = W < 520 ? 220 : 260, pl = W < 520 ? 48 : 58, pr = W < 520 ? 56 : 66, pt = 28, pb = 30;
  const i0 = pontos[0].idx, i1 = pontos[pontos.length - 1].idx, span = i1 - i0;
  const X = idx => span ? pl + ((idx - i0) / span) * (W - pl - pr) : (pl + W - pr) / 2;
  const vals = pontos.map(p => p.v);
  let lo = Math.min(...vals), top = Math.max(...vals);
  if (lo >= 0 && lo < top * 0.5) lo = 0;
  else lo -= ((top - lo) || Math.abs(top) || 1) * 0.15;
  top += ((top - lo) || 1) * 0.1;
  const Y = v => pt + (1 - (v - lo) / ((top - lo) || 1)) * (H - pt - pb);

  const bruto = (top - lo) / 4, p10 = Math.pow(10, Math.floor(Math.log10(bruto || 1))), f = bruto / p10;
  const passo = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p10;
  const ticks = [];
  for (let t = Math.ceil(lo / passo) * passo; t <= top; t += passo) ticks.push(t);

  const escuro = theme !== 'light';
  const grelha = escuro ? '#334155' : '#e2e8f0';
  const tinta = escuro ? '#94a3b8' : '#64748b';
  const tintaForte = escuro ? '#e2e8f0' : '#1e293b';
  const superficie = escuro ? '#1e293b' : '#ffffff';
  const linha = '#3b82f6';

  const rotulosX = [];
  pontos.forEach((p, i) => {
    const x = X(p.idx);
    const ult = rotulosX[rotulosX.length - 1];
    if (i === 0 || i === pontos.length - 1 || !ult || x - ult.x > 70) {
      if (i === pontos.length - 1 && ult && x - ult.x < 50) rotulosX.pop();
      rotulosX.push({ x, t: patRotulo(p.idx) });
    }
  });
  const evs = (eventos || []).filter(e => e.idx >= i0 && e.idx <= i1);

  const mover = clientX => {
    const r = ref.current && ref.current.getBoundingClientRect();
    if (!r || !r.width) return;
    const xv = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pontos.forEach((p, i) => { const d = Math.abs(X(p.idx) - xv); if (d < bd) { bd = d; best = i; } });
    setHi(best);
  };
  const h = hi != null && pontos[hi] ? pontos[hi] : null;
  const hx = h ? X(h.idx) : 0;
  const ult = pontos[pontos.length - 1];

  return (
    <div className="relative" ref={caixa}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img"
        aria-label="Evolução do património ao longo do tempo"
        onMouseMove={e => mover(e.clientX)} onMouseLeave={() => setHi(null)}
        onTouchStart={e => mover(e.touches[0].clientX)} onTouchMove={e => mover(e.touches[0].clientX)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={Y(t)} y2={Y(t)} stroke={grelha} strokeWidth="1" />
            <text x={pl - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill={tinta}>{patFmtK(t)}</text>
          </g>
        ))}
        {rotulosX.map((r, i) => <text key={i} x={r.x} y={H - 8} textAnchor="middle" fontSize="11" fill={tinta}>{r.t}</text>)}
        {evs.map((e, i) => (
          <g key={e.id}>
            <line x1={X(e.idx)} x2={X(e.idx)} y1={pt - 4} y2={H - pb} stroke={tinta} strokeWidth="1" strokeDasharray="2 4" />
            <circle cx={X(e.idx)} cy={pt - 13} r="9" fill={superficie} stroke={tinta} strokeWidth="1" />
            <text x={X(e.idx)} y={pt - 9} textAnchor="middle" fontSize="10" fontWeight="600" fill={tintaForte}>{e.n}</text>
          </g>
        ))}
        {pontos.slice(1).map((p, i) => {
          const a = pontos[i];
          return <line key={p.idx} x1={X(a.idx)} y1={Y(a.v)} x2={X(p.idx)} y2={Y(p.v)} stroke={linha} strokeWidth="2"
            strokeLinecap="round" strokeDasharray={p.idx - a.idx > 1 ? '3 6' : undefined} opacity={p.idx - a.idx > 1 ? 0.6 : 1} />;
        })}
        {h && <line x1={hx} x2={hx} y1={pt} y2={H - pb} stroke={tinta} strokeWidth="1" />}
        {pontos.map((p, i) => (
          <circle key={p.idx} cx={X(p.idx)} cy={Y(p.v)} r={hi === i ? 6 : 4}
            fill={p.importado ? superficie : linha} stroke={p.importado ? linha : superficie} strokeWidth="2" />
        ))}
        <text x={X(ult.idx) + 10} y={Y(ult.v) + 4} fontSize="12" fontWeight="600" fill={tintaForte}>{patFmtK(ult.v)}</text>
      </svg>
      {h && (
        <div className={`absolute top-0 z-10 pointer-events-none rounded-lg border px-3 py-2 text-xs shadow-xl min-w-[170px] ${escuro ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
          style={{ left: `${(hx / W) * 100}%`, transform: hx > W * 0.62 ? 'translateX(-104%)' : 'translateX(4%)' }}>
          <p className="font-semibold mb-1">{patRotulo(h.idx)}{h.importado ? ' · importado' : ''}</p>
          {h.tip.map(([l, v, forte]) => (
            <p key={l} className={`flex justify-between gap-4 ${forte ? 'font-semibold' : ''}`}>
              <span className={forte ? '' : (escuro ? 'text-slate-400' : 'text-slate-500')}>{l}</span><span>{v}</span>
            </p>
          ))}
          {(eventos || []).filter(e => e.idx === h.idx).map(e => (
            <p key={e.id || e.n} className={`mt-1 pt-1 border-t max-w-[240px] whitespace-normal ${escuro ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'}`}>
              <span className="font-semibold">{e.n}.</span> {e.texto}{e.data ? <span className={escuro ? 'text-slate-500' : 'text-slate-400'}> · {String(e.data).slice(0, 10).split('-').reverse().join('/')}</span> : null}
            </p>
          ))}
          {h.nota && <p className={`mt-1 pt-1 border-t max-w-[240px] whitespace-normal ${escuro ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'}`}>{h.nota}</p>}
        </div>
      )}
    </div>
  );
};

const Patrimonio = ({ G, uG, M, mesKey, portfolio, temPortfolioProprio, theme, onIrParaMes, onAbrirTab }) => {
  const pat = G.patrimonio || {};
  const guardados = pat.registos || {};
  // Guardados + automáticos + importados. O histórico nunca depende de um clique.
  const efetivos = useMemo(() => patRegistosEfetivos(G, M), [G, M]);
  const eventos = pat.eventos || [];
  const idxSel = patIdx(mesKey);
  const guardado = guardados[mesKey];
  // Base para o rascunho deste mês: sem o registo automático dele próprio
  const registos = useMemo(() => {
    if (guardado || !(efetivos[mesKey] && efetivos[mesKey].auto)) return efetivos;
    const r = { ...efetivos }; delete r[mesKey]; return r;
  }, [efetivos, mesKey, guardado]);
  const ehAuto = !guardado && !!(efetivos[mesKey] && efetivos[mesKey].auto);
  const assinatura = JSON.stringify(guardado || null);

  const [vista, setVista] = useState('capital');           // 'capital' | 'total'
  const [periodo, setPeriodo] = useState(0);               // meses; 0 = tudo
  const [graf, setGraf] = useState('valor');               // 'valor' | 'mercado': o que o gráfico mostra
  const [semReservado, setSemReservado] = useState(true);  // esconder o dinheiro reservado para imobiliário
  const [draft, setDraft] = useState(() => patRascunho({ registos, key: mesKey, portfolio, G, M }));
  const [anosAbertos, setAnosAbertos] = useState({});
  const [novoEv, setNovoEv] = useState({ data: '', texto: '' });
  const [confirmaApagar, setConfirmaApagar] = useState(false);
  const [ajuda, setAjuda] = useState(false);          // textos de ajuda
  const [mais, setMais] = useState(false);            // casa, dívidas, outros
  const [editMov, setEditMov] = useState(false);      // corrigir movimentos
  const [sec, setSec] = useState({ ev: false, hist: false });

  // Recriar o rascunho só quando muda o mês ou o registo guardado desse mês —
  // nunca a meio da edição.
  useEffect(() => {
    setDraft(patRascunho({ registos, key: mesKey, portfolio, G, M }));
    setConfirmaApagar(false); setEditMov(false); setMais(false);
  }, [mesKey, assinatura]); // eslint-disable-line

  const f = v => _fmtEUR.format(isFinite(v) ? v : 0);
  const sinal = v => (v > 0 ? '+' : '') + f(v);
  const pct = v => (v > 0 ? '+' : '') + (v * 100).toFixed(1).replace('.', ',') + '%';

  const setPat = patch => uG('patrimonio', { ...pat, ...patch });
  const serie = patSerie(efetivos);
  const det = patDetalhe(serie);
  const haReservado = serie.some(x => x.reservado > 0);
  const semRes = vista === 'capital' && semReservado && haReservado;
  const campo = vista === 'invest' ? 'invest' : vista === 'capital' ? (semRes ? 'livre' : 'capital') : 'total';
  const nomeVista = vista === 'invest' ? 'Investimentos' : vista === 'capital' ? (semRes ? 'Património financeiro livre' : 'Património financeiro') : 'Património total';

  const ultimo = det[det.length - 1] || null;
  // Ponto de partida do período escolhido: o último registo até N meses atrás
  // Um mês em que o Portfolio ficou igual ao anterior não serve de ponto de partida: o valor
  // só se acerta no mês seguinte. Recua-se até ao último mês realmente atualizado.
  const naoAtualizado = d => !!d && d.resultado != null && Math.abs(d.invest - d.prev.invest) < 0.005 && Math.abs(d.fluxo) >= 0.5;
  const primeiro = (() => {
    let p0 = (periodo && ultimo ? det.filter(d => d.idx <= ultimo.idx - periodo).pop() : null) || det[0] || null;
    while (p0 && naoAtualizado(p0)) { const ant = det.find(d => d.idx === p0.prev.idx); if (!ant) break; p0 = ant; }
    return p0;
  })();
  const recuou = !!(periodo && ultimo && primeiro && primeiro.idx < ultimo.idx - periodo && det.some(d => d.idx === ultimo.idx - periodo));
  const janela = primeiro ? det.filter(d => d.idx > primeiro.idx) : [];
  const ret = patRetorno(janela);
  const vida = ultimo ? patVida(G, ultimo.rec.investItens, ultimo.idx) : { linhas: [], cats: [] };
  const usaVida = !periodo && vida.cats.length > 0;   // "Início": conta desde a primeira compra, pelas Transações
  const dups = txDuplicadosProvaveis(G.transacoes);
  const dupIds = new Set(dups.map(d => d.manual.id));
  const rotData = d => patRotulo(patIdx(d));
  // "O que mudou": passos que somam do valor inicial ao de hoje
  const mud = (() => {
    const comDet = janela.filter(d => d.resultado != null), semDet = janela.filter(d => d.resultado == null);
    const dC = d => d[campo] - d.prev[campo];
    const soma = (l, fn) => l.reduce((a, d) => a + fn(d), 0);
    const mercado = soma(comDet, d => d.resultado);
    const casa = vista === 'total' ? soma(comDet, d => (d.imoveis - d.dividas) - (d.prev.imoveis - d.prev.dividas)) : 0;
    return { nCom: comDet.length, semDetalhe: soma(semDet, dC), nSem: semDet.length, fimSem: semDet.length ? semDet[semDet.length - 1].idx : null,
      mercado, casa, dinheiro: soma(comDet, dC) - mercado - casa };
  })();
  // Quanto a dívida desceu no mesmo período (pelo histórico do Crédito): explica saídas grandes de dinheiro
  const descidaDividaPeriodo = primeiro && ultimo && primeiro !== ultimo
    ? Math.round((patSoma(patCreditoNoMes(G, primeiro.idx).dividas) - patSoma(patCreditoNoMes(G, ultimo.idx).dividas)) * 100) / 100 : 0;
  const rendimentoRecebido = (G.transacoes || []).filter(t => t && t.tipo === 'dividendo').reduce((a, t) => a + patNum(t.valorTotal), 0);
  const varTotal = ultimo && primeiro ? ultimo[campo] - primeiro[campo] : 0;
  const varPct = primeiro && primeiro[campo] > 0 ? varTotal / primeiro[campo] : null;
  // De onde vem a variação. Um snapshot antigo não separa investimentos de liquidez, por isso aí não se mostra.
  const partesVar = (ultimo && primeiro && ultimo !== primeiro && !primeiro.rec.importado) ? [
    ['investimentos', ultimo.invest - primeiro.invest],
    ['dinheiro nas contas', (ultimo.liquidez - primeiro.liquidez) - (semRes ? ultimo.reservado - primeiro.reservado : 0)],
    ['outros', ultimo.outros - primeiro.outros],
    ...(vista === 'total' ? [['casa', ultimo.imoveis - primeiro.imoveis], ['dívida', -(ultimo.dividas - primeiro.dividas)]] : [])
  ].filter(([, v]) => Math.abs(v) >= 0.5).map(([n, v]) => `${n} ${sinal(v)}`).join(' · ') : '';

  // Rascunho → totais ao vivo
  const regras = patRegras(G);
  const itensDraft = draft.investItens.map(i => ({ ...i, liq: patEhLiquidez(i, regras) }));
  const reservadoAutoSel = patReservado(G, M, idxSel);
  const tDraft = patTotais({ ...draft, investItens: itensDraft, reservado: String(draft.reservado == null ? '' : draft.reservado).trim() !== '' ? patNum(draft.reservado) : null, reservadoAuto: reservadoAutoSel });
  const itensInvest = itensDraft.filter(i => !i.liq);
  const itensLiquidez = itensDraft.filter(i => i.liq);
  // Mover uma linha do Portfolio entre "investimento" e "dinheiro" (vale para todos os meses)
  const marcarDinheiro = (item, ehDinheiro) => setPat({ dinheiro: { ...regras, [patChave(item.desc)]: ehDinheiro } });
  const sujo = !draft.existe || JSON.stringify(patLimpar(draft), (k, v) => k === 'fechadoEm' ? undefined : v)
    !== JSON.stringify({ ...patLimpar(patRascunho({ registos, key: mesKey, portfolio, G, M })) }, (k, v) => k === 'fechadoEm' ? undefined : v);
  const anterior = serie.filter(s => s.idx < idxSel).pop() || null;
  const mov = patMovimentos(G, M, registos, mesKey);
  const corteSel = patCorte(G, M, idxSel);
  // Saldos sugeridos pelo Extrato (menos as contas que já vêm do Portfolio, como a Trade Republic)
  const saldosExtrato = patSaldosExtrato(G, corteSel).filter(x => !itensLiquidez.some(i => { const a = patChave(i.desc), b = patChave(x.nome); return a === b || a.includes(b) || b.includes(a); }));
  const linhaDaConta = x => draft.liquidez.find(l => { const a = patChave(l.nome), b = patChave(x.nome), c = patChave(x.banco); return a && (a === b || a.includes(b) || b.includes(a) || (c && (a === c || a.includes(c) || c.includes(a)))); });
  const saldosDiferentes = saldosExtrato.filter(x => { const l = linhaDaConta(x); return !l || Math.abs(patNum(l.val) - x.saldo) > 0.005; });
  const usarSaldosExtrato = () => {
    let liq = draft.liquidez.map(l => ({ ...l }));
    saldosExtrato.forEach(x => {
      const l = linhaDaConta(x);
      if (l) liq = liq.map(y => y.id === l.id ? { ...y, val: String(x.saldo) } : y);
      else liq.push({ id: patId(), nome: x.nome, val: String(x.saldo) });
    });
    setDraft({ ...draft, liquidez: liq });
  };
  const movDifere = mov.origem === 'transacoes' && !!draft.movManual && (patNum(draft.aportes) !== mov.aportes
    || patNum(draft.levantamentos) + patNum(draft.amortizacao) !== mov.levantamentos + mov.amortizacao);
  const fluxoDraft = patNum(draft.aportes) - patNum(draft.levantamentos) - patNum(draft.amortizacao);
  const saidasDraft = patNum(draft.levantamentos) + patNum(draft.amortizacao);
  // Se a dívida desceu desde o último registo, é provável que parte tenha saído dos investimentos
  const descidaDivida = anterior ? Math.round((anterior.dividas - tDraft.dividas) * 100) / 100 : 0;
  const mercadoDraft = anterior ? tDraft.invest - anterior.invest - fluxoDraft : 0;
  // Amortização paga com os investimentos: desconta dos levantamentos para não contar duas vezes
  const usarDescida = () => setDraft({
    ...draft, amortizacao: String(descidaDivida),
    levantamentos: patNum(draft.levantamentos) > 0 ? (String(Math.max(0, Math.round((patNum(draft.levantamentos) - descidaDivida) * 100) / 100) || '')) : draft.levantamentos
  });

  const guardar = () => setPat({ registos: { ...guardados, [mesKey]: patLimpar(draft) } });
  const apagar = () => { const r = { ...guardados }; delete r[mesKey]; setPat({ registos: r }); };

  // Meses sem registo entre o primeiro registo e hoje
  const estado = useMemo(() => patEstadoMeses(G, M, 12), [G, M]);
  const estSel = estado.find(e => e.idx === idxSel) || null;
  const porTratar = estado.filter(e => e.portfolio === 'falta' || e.portfolio === 'igual').length;

  // Eventos numerados por ordem cronológica
  const evOrd = [...eventos].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
    .map((e, i) => ({ ...e, n: i + 1, idx: patIdx(e.data) }));
  const addEvento = () => {
    if (!novoEv.texto.trim()) return;
    const data = novoEv.data || `${Math.floor(idxSel / 12)}-${String((idxSel % 12) + 1).padStart(2, '0')}-01`;
    setPat({ eventos: [...eventos, { id: patId(), data, texto: novoEv.texto.trim() }] });
    setNovoEv({ data: '', texto: '' });
  };

  const visiveis = periodo && ultimo ? det.filter(d => d.idx >= Math.min(ultimo.idx - periodo, primeiro ? primeiro.idx : ultimo.idx)) : det;
  const pontos = visiveis.map(d => ({
    idx: d.idx, v: d[campo], importado: !!d.rec.importado, nota: d.rec.nota,
    tip: [
      [nomeVista, f(d[campo]), true],
      ...(vista === 'invest' ? [] : [['Investimentos', f(d.invest)]]), ...(vista === 'invest' ? [] : [['Liquidez', f(d.liquidez)]]), ...(vista !== 'invest' && d.reservado > 0 ? [['— reservado para imobiliário', f(d.reservado)]] : []), ...(vista === 'invest' ? [] : [['Outros ativos', f(d.outros)]]),
      ...(vista === 'total' ? [['Imóveis', f(d.imoveis)], ['Dívidas', '−' + f(d.dividas)]] : []),
      ...(d.resultado != null ? [
        ...(patNum(d.rec.amortizacao) ? [['Amortização de crédito', '−' + f(patNum(d.rec.amortizacao))]] : []),
        ['Puseste (líquido)', sinal(d.fluxo)], ['Mercado', sinal(d.resultado)]
      ] : [])
    ]
  }));

  // Gráfico só do mercado: o que os investimentos renderam, acumulado mês a mês (sem o dinheiro que puseste)
  const pontosMercado = (() => {
    const com = visiveis.filter(d => d.resultado != null && (!primeiro || d.idx > primeiro.idx || !periodo));
    if (!com.length) return [];
    let acum = 0;
    const out = [{ idx: com[0].prev.idx, v: 0, tip: [['Ponto de partida', f(0), true]] }];
    com.forEach((d, i) => {
      acum += d.resultado;
      // Mês em que o Portfolio não foi atualizado: o valor acerta-se no seguinte, por isso não se desenha este ponto
      if (Math.abs(d.invest - d.prev.invest) < 0.005 && Math.abs(d.fluxo) >= 0.5 && i < com.length - 1) return;
      out.push({ idx: d.idx, v: acum, nota: d.rec.nota, tip: [
        ['Mercado, acumulado', sinal(acum), true], ['Mercado neste mês', sinal(d.resultado)],
        ['Investimentos', f(d.invest)], ['Puseste (líquido)', sinal(d.fluxo)]
      ] });
    });
    return out;
  })();
  const verMercado = graf === 'mercado';
  // Poupança no período escolhido
  const poup = (() => {
    const l = patPoupanca(janela, M);
    const validos = l.filter(x => !x.casaMudou);
    const meses = validos.reduce((a, x) => a + x.meses, 0), tot = validos.reduce((a, x) => a + x.poupanca, 0), rec = validos.reduce((a, x) => a + x.receitas, 0);
    return { l, meses, media: meses ? tot / meses : 0, total: tot, receitas: rec, taxa: rec > 0 ? tot / rec : null, max: Math.max(1, ...l.map(x => Math.abs(x.poupanca))) };
  })();

  const exportarCSV = () => {
    const n = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
    const cab = ['Mês', 'Investimentos', 'Liquidez', 'Imóveis', 'Outros ativos', 'Dívidas', 'Património financeiro', 'Património total', 'Aportes', 'Levantamentos', 'Amortização de crédito', 'Resultado mercado', 'Origem', 'Nota'];
    const linhasCsv = det.map(d => [
      `${Math.floor(d.idx / 12)}-${String((d.idx % 12) + 1).padStart(2, '0')}`,
      n(d.invest), n(d.liquidez), n(d.imoveis), n(d.outros), n(d.dividas), n(d.capital), n(d.total),
      d.fluxo == null ? '' : n(patNum(d.rec.aportes)), d.fluxo == null ? '' : n(patNum(d.rec.levantamentos)), d.fluxo == null ? '' : n(patNum(d.rec.amortizacao)),
      n(d.resultado), d.rec.importado ? 'importado' : d.rec.auto ? 'automático' : 'guardado',
      '"' + (d.rec.nota || '').replace(/"/g, '""') + '"'
    ].join(';'));
    const blob = new Blob(['﻿' + [cab.join(';'), ...linhasCsv].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `patrimonio_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ── estilos ──
  const escuro = theme !== 'light';
  const card = `backdrop-blur-sm rounded-2xl border p-4 sm:p-5 ${escuro ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white/80 border-slate-200 shadow-sm'}`;
  const inp = escuro
    ? 'bg-slate-700/50 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50'
    : 'bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  const sub = escuro ? 'text-slate-400' : 'text-slate-500';
  const linhaB = escuro ? 'border-slate-700/50' : 'border-slate-200';
  const tile = `rounded-xl p-3 ${escuro ? 'bg-slate-700/30' : 'bg-slate-100'}`;
  const chip = on => `px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${on ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : (escuro ? 'bg-slate-700/40 border-slate-600 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-500')}`;
  const corDelta = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : '';
  const seta = v => v > 0 ? '▲ ' : v < 0 ? '▼ ' : '';

  // Composição do último registo
  const ativosComp = ultimo ? PAT_COMP.filter(c => c.k !== 'dividas' && (vista === 'total' || c.k !== 'imoveis'))
    .map(c => ({ ...c, v: ultimo[c.k] })).filter(c => c.v > 0) : [];
  const brutos = ativosComp.reduce((a, c) => a + c.v, 0);

  const anosTab = [...new Set(det.map(d => Math.floor(d.idx / 12)))].sort((a, b) => b - a);
  const anoAberto = y => anosAbertos[y] != null ? anosAbertos[y] : y === anosTab[0];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">

      {/* Cabeçalho: três perguntas, três blocos */}
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold">💎 Património</h3>
            <p className={`text-xs ${sub}`}>
              {vista === 'invest' ? 'Só o que está exposto ao mercado (ETF, cripto, PPR…) — sem o dinheiro nas contas nem a Trade Republic.' : vista === 'capital' ? 'Investimentos + dinheiro nas contas (inclui a Trade Republic) — sem casa nem dívida.' : 'Todos os ativos, incluindo imóveis, menos as dívidas.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              <button className={chip(vista === 'invest')} onClick={() => setVista('invest')}>Só investimentos</button>
              <button className={chip(vista === 'capital')} onClick={() => setVista('capital')}>Património financeiro</button>
              <button className={chip(vista === 'total')} onClick={() => setVista('total')}>Património total</button>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Período da caixa do meio e do gráfico">
              {[[1, '1M'], [3, '3M'], [6, '6M'], [12, '1A'], [36, '3A'], [0, 'Tudo']].map(([m, l]) => (
                <button key={l} className={chip(periodo === m)} aria-pressed={periodo === m} onClick={() => setPeriodo(m)}>{l}</button>
              ))}
            </div>
            {vista === 'capital' && haReservado && (
              <button className={chip(semReservado)} aria-pressed={semReservado} onClick={() => setSemReservado(!semReservado)} title="O dinheiro da venda da casa guardado para comprar imóvel">
                {semReservado ? '✓ ' : ''}Sem o dinheiro reservado para imobiliário
              </button>
            )}
          </div>
        </div>

        {!ultimo ? (
          <p className={`text-sm ${sub}`}>Ainda não há dados. Assim que atualizares o Portfolio de um mês, ele aparece aqui sozinho.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1 — Quanto tens */}
            <div className={`${tile} !p-4`}>
              <p className={`text-sm ${sub}`}>Tens hoje</p>
              <p className="text-3xl font-bold tabular-nums mt-1">{f(ultimo[campo])}</p>
              <p className={`text-sm mt-2 ${sub}`}>
                {vista === 'invest'
                  ? (() => {
                      const porCat = {};
                      (ultimo.rec.investItens || []).forEach(i => { if (!patItemLiq(i)) porCat[i.cat || '—'] = (porCat[i.cat || '—'] || 0) + patNum(i.val); });
                      const l = Object.entries(porCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
                      return l.map(([c, v], i) => <React.Fragment key={c}>{i > 0 ? ' · ' : ''}{c} <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(v)}</strong></React.Fragment>);
                    })()
                  : vista === 'total'
                  ? <>financeiro <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(ultimo.capital)}</strong> · casa menos dívida <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(ultimo.imoveis - ultimo.dividas)}</strong></>
                  : <>investimentos <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(ultimo.invest)}</strong> · contas <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(ultimo.liquidez + ultimo.outros - ultimo.reservado)}</strong>{ultimo.reservado > 0 && <> · reservado <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(ultimo.reservado)}</strong></>}</>}
              </p>
            </div>
            {/* 2 — O que mudou no período */}
            <div className={`${tile} !p-4`}>
              <p className={`text-sm ${sub}`} title={recuou ? `O Portfolio de ${patRotulo(ultimo.idx - periodo)} não foi atualizado, por isso a comparação parte do último mês com valores certos.` : undefined}>Mudou {primeiro && primeiro !== ultimo ? `desde ${patRotulo(primeiro.idx)}` : ''}{recuou ? ' *' : ''}</p>
              {!primeiro || primeiro === ultimo ? <p className="text-3xl font-bold mt-1">—</p> : (<>
                <p className={`text-3xl font-bold tabular-nums mt-1 ${corDelta(varTotal)}`}>{sinal(varTotal)}</p>
                <p className={`text-sm mt-2 ${sub}`}>
                  {mud.nCom > 0
                    ? <><button onClick={() => setGraf(graf === 'mercado' ? 'valor' : 'mercado')} aria-pressed={graf === 'mercado'} title="Ver no gráfico só o que o mercado rendeu" className={`underline decoration-dotted underline-offset-4 hover:text-blue-400 ${graf === 'mercado' ? 'text-blue-400' : ''}`}>mercado</button> <strong className={corDelta(mud.mercado)}>{sinal(mud.mercado)}</strong> · {(() => {
                        const resto = varTotal - mud.mercado;
                        const forteCls = escuro ? 'text-slate-200' : 'text-slate-700';
                        if (vista === 'total') return <>resto <strong className={forteCls}>{sinal(resto)}</strong></>;
                        if (vista === 'invest') return <>{resto >= 0 ? 'puseste' : 'tiraste'} <strong className={forteCls}>{f(Math.abs(resto))}</strong></>;
                        return <>{resto >= 0 ? 'entrou' : 'saiu'} <strong className={forteCls}>{f(Math.abs(resto))}</strong>
                          {resto < -1000 && descidaDividaPeriodo >= 1000 && <> · a dívida desceu <strong className={forteCls}>{f(descidaDividaPeriodo)}</strong></>}</>;
                      })()}</>
                    : 'ainda sem detalhe neste período'}
                </p>
              </>)}
            </div>
            {/* 3 — Os investimentos estão a render? Com "Tudo": desde a primeira compra. Com um período: só esse período. */}
            <div className={`${tile} !p-4`}>
              {periodo > 0 ? (<>
                <p className={`text-sm ${sub}`}>Investimentos renderam{ret.periodos ? ` desde ${patRotulo(ret.inicio)}` : ''}</p>
                {ret.periodos ? (<>
                  <p className={`text-3xl font-bold tabular-nums mt-1 ${corDelta(ret.resultado)}`}>{sinal(ret.resultado)}{ret.twr != null && <span className="text-base font-semibold"> {pct(ret.twr)}</span>}</p>
                  <p className={`text-sm mt-2 ${sub}`}>puseste <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(ret.aportes)}</strong> · valem <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(ultimo.invest)}</strong></p>
                </>) : (<>
                  <p className="text-3xl font-bold mt-1">—</p>
                  <p className={`text-sm mt-2 ${sub}`}>sem detalhe neste período</p>
                </>)}
              </>) : (<>
                <p className={`text-sm ${sub}`}>Investimentos renderam{vida.cats.length > 0 ? ` desde ${rotData(vida.desde)}` : ''}</p>
                {vida.cats.length > 0 ? (<>
                  <p className={`text-3xl font-bold tabular-nums mt-1 ${corDelta(vida.ganho)}`}>{sinal(vida.ganho)}{vida.pct != null && <span className="text-base font-semibold"> {pct(vida.pct)}</span>}</p>
                  <p className={`text-sm mt-2 ${sub}`}>puseste <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(vida.posto)}</strong> · valem <strong className={escuro ? 'text-slate-200' : 'text-slate-700'}>{f(vida.valor)}</strong></p>
                </>) : (<>
                  <p className="text-3xl font-bold mt-1">—</p>
                  <p className={`text-sm mt-2 ${sub}`}>importa as transações para ver</p>
                </>)}
              </>)}
            </div>
          </div>
        )}

        {ultimo && (
          <div className="mt-3">
            <button onClick={() => setSec({ ...sec, contas: !sec.contas })} aria-expanded={!!sec.contas} className="text-xs text-blue-400 hover:text-blue-300">
              {sec.contas ? '▾' : '▸'} Ver as contas{dups.length > 0 ? ` · ${dups.length} ${dups.length === 1 ? 'transação parece repetida' : 'transações parecem repetidas'}` : ''}
            </button>
            {sec.contas && (
              <div className="mt-3 space-y-4 text-sm">
                {primeiro && primeiro !== ultimo && (
                  <div>
                    <p className="font-medium mb-2">O que mudou desde {patRotulo(primeiro.idx)}, passo a passo</p>
                    <div className="flex flex-wrap items-stretch gap-x-2 gap-y-2 text-sm">
                      {[
                        { l: `Em ${patRotulo(primeiro.idx)}`, v: f(primeiro[campo]) },
                        ...(mud.nSem ? [{ l: `Sem detalhe até ${patRotulo(mud.fimSem)}`, v: sinal(mud.semDetalhe), cor: sub, t: 'Nestes meses a app só tem o total guardado, por isso não sabe separar o que o mercado rendeu do dinheiro que entrou ou saiu.' }] : []),
                        ...(mud.nCom ? [
                          { l: mud.mercado >= 0 ? 'O mercado rendeu' : 'O mercado tirou', v: sinal(mud.mercado), cor: corDelta(mud.mercado), t: 'Variação do valor dos investimentos, descontado o dinheiro que lá puseste ou tiraste.' },
                          ...(vista === 'total' && Math.abs(mud.casa) >= 0.5 ? [{ l: 'Casa e dívida', v: sinal(mud.casa), cor: corDelta(mud.casa), t: 'Variação do valor dos imóveis menos a variação das dívidas (amortizar a dívida faz isto subir).' }] : []),
                          { l: vista === 'invest' ? (mud.dinheiro >= 0 ? 'Puseste' : 'Tiraste') : mud.dinheiro >= 0 ? 'Entrou dinheiro novo' : 'Saiu dinheiro', v: sinal(mud.dinheiro), cor: vista === 'invest' ? '' : corDelta(mud.dinheiro), t: vista === 'invest' ? 'Compras menos vendas, com comissões, pelas Transações.' : mud.dinheiro >= 0 ? 'O que poupaste: dinheiro que entrou nas contas e nos investimentos vindo de fora.' : 'Dinheiro que saiu das contas e dos investimentos: amortizações do crédito, impostos, gastos.' }
                        ] : []),
                        { l: `Hoje (${patRotulo(ultimo.idx)})`, v: f(ultimo[campo]), forte: true }
                      ].map((p, i, arr) => (
                        <React.Fragment key={p.l}>
                          <div title={p.t || undefined} className={`rounded-lg px-3 py-2 ${escuro ? 'bg-slate-800/60' : 'bg-white'} ${p.t ? 'cursor-help' : ''}`}>
                            <p className={`text-[11px] ${sub}`}>{p.l}</p>
                            <p className={`tabular-nums ${p.forte ? 'font-bold' : 'font-semibold'} ${p.cor || ''}`}>{p.v}</p>
                          </div>
                          {i < arr.length - 1 && <span className={`self-center ${sub}`} aria-hidden="true">→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                    <p className={`text-xs mt-2 ${sub}`}>
                      {ret.periodos > 0 && Math.abs(ret.aportes) >= 0.5 && <>Pelo meio passaste <strong>{f(Math.abs(ret.aportes))}</strong> {ret.aportes >= 0 ? 'das contas para os investimentos' : 'dos investimentos para as contas'} (não muda o total). </>}
                      {rendimentoRecebido > 0 && <>Desde sempre recebeste <strong>{f(rendimentoRecebido)}</strong> em juros e dividendos.</>}
                    </p>
                  </div>
                )}
                {dups.length > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <p className="text-amber-500 font-medium">{dups.length === 1 ? 'Há 1 compra que parece estar' : `Há ${dups.length} compras que parecem estar`} duas vezes nas Transações: registada à mão e também importada.</p>
                    <p className={`mt-1 ${sub}`}>Enquanto lá estiverem, o "puseste" fica a mais e o rendimento a menos ({f(patSoma(dups.map(d => ({ val: Math.abs(patTxLiquido(d.manual)) }))))} no total).</p>
                    {onAbrirTab && <button onClick={() => onAbrirTab('transacoes')} className="mt-1.5 text-blue-400 hover:text-blue-300">Abrir as Transações para as apagar →</button>}
                  </div>
                )}
                {vida.linhas.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Desde a primeira compra, por categoria</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs tabular-nums">
                        <thead><tr className={sub}><th className="text-left font-normal py-1">Categoria</th><th className="text-right font-normal">Vale hoje</th><th className="text-right font-normal">Puseste</th><th className="text-right font-normal">Rendeu</th></tr></thead>
                        <tbody>
                          {vida.linhas.map(l => (
                            <tr key={l.cat} className="border-t border-slate-700/30">
                              <td className="py-1">{l.cat} <span className={sub}>· {l.n} tr. desde {rotData(l.desde)}</span></td>
                              <td className="text-right">{l.valor > 0 ? f(l.valor) : <span className="text-amber-500">sem valor no Portfolio</span>}</td>
                              <td className="text-right">{f(l.posto)}</td>
                              <td className={`text-right ${l.valor > 0 ? corDelta(l.ganho) : ''}`}>{l.valor > 0 ? `${sinal(l.ganho)}${l.pct != null ? ` (${pct(l.pct)})` : ''}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className={`mt-1 text-xs ${sub}`}>Só é fiel se as Transações tiverem todas as compras dessa categoria e a categoria tiver o mesmo nome no Portfolio.</p>
                  </div>
                )}
                <div>
                  <p className="font-medium mb-1">Mês a mês {periodo ? (periodo === 1 ? '(último mês)' : `(últimos ${periodo} meses)`) : '(desde o início)'}</p>
                  {janela.filter(d => d.resultado != null).length === 0 && <p className={`text-xs ${sub}`}>Ainda não há dois meses seguidos com detalhe neste período.</p>}
                  <div className="space-y-2">
                    {janela.filter(d => d.resultado != null).slice().reverse().map(d => {
                      const txs = patTxEntre(G, M, Math.max(d.prev.idx + 1, d.idx - 23), d.idx);
                      const somaTx = txs.reduce((a, t) => a + patTxLiquido(t), 0);
                      return (
                        <div key={d.idx} className={`rounded-xl p-3 ${escuro ? 'bg-slate-700/30' : 'bg-slate-100'}`}>
                          <p className="text-xs">
                            <strong>{patRotulo(d.idx)}</strong> · investimentos {f(d.prev.invest)} → {f(d.invest)} ({sinal(d.invest - d.prev.invest)}) · puseste {f(d.fluxo)} · <span className={corDelta(d.resultado)}>renderam {sinal(d.resultado)}</span>
                          </p>
                          {txs.length > 0 ? (
                            <ul className={`mt-1.5 text-xs ${sub} space-y-0.5`}>
                              {txs.map(t => (
                                <li key={t.id} className="flex justify-between gap-2">
                                  <span className="truncate">{String(t.data).split('-').reverse().join('/')} · {t.tipo === 'venda' ? 'venda' : 'compra'} · {t.ticker || t.categoria} · {t.corretora || '—'} · {t.importId ? 'importada' : 'à mão'}{dupIds.has(t.id) && <span className="text-amber-500"> · repetida?</span>}</span>
                                  <span className="flex-shrink-0">{sinal(patTxLiquido(t))}</span>
                                </li>
                              ))}
                            </ul>
                          ) : <p className={`mt-1 text-xs ${sub}`}>Sem compras nem vendas nas Transações neste mês.</p>}
                          <p className={`mt-1 text-xs ${sub}`}>Conta compras de {patCorte(G, M, Math.max(d.prev.idx, d.idx - 24)).split('-').reverse().join('/')} (exclusive) a {patCorte(G, M, d.idx).split('-').reverse().join('/')}.</p>
                          {Math.abs(d.invest - d.prev.invest) < 0.005 && <p className="mt-1 text-xs text-amber-500">O Portfolio de {patRotulo(d.idx)} está igual ao de {patRotulo(d.prev.idx)}: não foi atualizado, por isso parece que perdeste tudo o que puseste neste mês. O valor acerta-se no mês seguinte.</p>}
                          {Math.abs(somaTx - d.fluxo) > 0.5 && <p className="mt-1 text-xs text-amber-500">O valor usado ({f(d.fluxo)}) é diferente da soma das Transações ({f(somaTx)}): foi corrigido à mão nesse mês, ou vem da Alocação.</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Evolução */}
      {det.length > 0 && (
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold">{verMercado ? 'O que o mercado rendeu (acumulado)' : `Evolução — ${nomeVista}`}</h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5" role="group" aria-label="O que o gráfico mostra">
                <button className={chip(!verMercado)} aria-pressed={!verMercado} onClick={() => setGraf('valor')}>Valor</button>
                <button className={chip(verMercado)} aria-pressed={verMercado} onClick={() => setGraf('mercado')}>Só o mercado</button>
              </div>
              <span className={`text-xs ${sub}`}>{periodo ? (periodo === 1 ? 'último mês' : `últimos ${periodo} meses`) : 'desde o início'}</span>
            </div>
          </div>
          {verMercado ? (
            pontosMercado.length > 1 ? (<>
              <PatChart key="mercado" pontos={pontosMercado} eventos={evOrd} theme={theme} />
              <p className={`text-xs mt-1 ${sub}`}>Ganho ou perda dos investimentos sem contar o dinheiro que lá puseste. Começa em zero em {patRotulo(pontosMercado[0].idx)}{pontosMercado[0].idx > (visiveis[0] ? visiveis[0].idx : 0) ? ', o primeiro mês com detalhe neste período' : ''}.</p>
            </>) : <p className={`text-sm py-6 text-center ${sub}`}>Ainda não há meses com detalhe neste período para separar o mercado do dinheiro que puseste.</p>
          ) : pontos.length > 1 ? <PatChart key="valor" pontos={pontos} eventos={evOrd} theme={theme} />
            : <p className={`text-sm py-6 text-center ${sub}`}>O gráfico aparece a partir do segundo registo.</p>}
        </div>
      )}

      {/* Poupança */}
      {poup.l.length > 0 && (
        <div className={card}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h3 className="font-semibold">Poupança</h3>
              <p className={`text-xs ${sub}`}>{periodo ? (periodo === 1 ? 'último mês' : `últimos ${periodo} meses`) : 'desde o início'} · o que ficou teu sem contar o mercado</p>
            </div>
            <div className="flex items-baseline gap-4">
              <p><span className={`text-2xl font-bold tabular-nums ${corDelta(poup.media)}`}>{f(poup.media)}</span><span className={`text-sm ${sub}`}> por mês</span></p>
              {poup.taxa != null && <p><span className="text-2xl font-bold tabular-nums">{(poup.taxa * 100).toFixed(0)}%</span><span className={`text-sm ${sub}`}> das receitas</span></p>}
            </div>
          </div>
          {poup.l.length > 1 && (
            <div className="flex items-stretch gap-1 sm:gap-2 h-28 mt-4" role="img" aria-label="Poupança por mês">
              {poup.l.map(x => (
                <div key={x.idx} className={`flex-1 flex flex-col ${x.casaMudou ? 'opacity-40' : ''}`} title={`${patRotulo(x.idx)}: ${sinal(x.poupanca)}${x.receitas > 0 ? ` · receitas ${f(x.receitas)}` : ''}${x.casaMudou ? ' · o valor dos imóveis mudou, fica fora da média' : ''}`}>
                  <div className="flex-1 flex items-end justify-center">{x.poupanca > 0 && <div className="w-full max-w-[28px] rounded-t" style={{ height: `${(x.poupanca / poup.max) * 100}%`, minHeight: 2, background: '#059669' }} />}</div>
                  <div className={`h-px ${escuro ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  <div className="flex-1 flex items-start justify-center">{x.poupanca < 0 && <div className="w-full max-w-[28px] rounded-b" style={{ height: `${(-x.poupanca / poup.max) * 100}%`, minHeight: 2, background: '#ef4444' }} />}</div>
                  <span className={`text-[10px] text-center ${sub}`}>{patRotulo(x.idx).slice(0, 3)}</span>
                </div>
              ))}
            </div>
          )}
          <p className={`text-xs mt-2 ${sub}`}>Dinheiro que ficou nas contas ou foi investido, mais a dívida que desceu. As receitas são antes de impostos, por isso a percentagem real sobre o que recebes é mais alta.</p>
        </div>
      )}

      {/* Composição */}
      {ultimo && brutos > 0 && (
        <div className={card}>
          <h3 className="font-semibold mb-3">Composição em {patRotulo(ultimo.idx)}</h3>
          <div className="flex h-4 w-full gap-0.5 mb-3">
            {ativosComp.map(c => <div key={c.k} title={`${c.label}: ${f(c.v)}`} className="h-full first:rounded-l last:rounded-r" style={{ width: `${(c.v / brutos) * 100}%`, background: c.cor }} />)}
          </div>
          <div className="space-y-1.5 text-sm">
            {ativosComp.map(c => (
              <div key={c.k} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.cor }} />{c.label}</span>
                <span><span className="font-semibold">{f(c.v)}</span> <span className={`text-xs ${sub}`}>{((c.v / brutos) * 100).toFixed(1).replace('.', ',')}%</span></span>
              </div>
            ))}
            {vista === 'total' && (
              <>
                <div className={`flex items-center justify-between gap-3 pt-1.5 border-t ${linhaB}`}>
                  <span className={sub}>Ativos brutos</span><span className="font-semibold">{f(brutos)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#ef4444' }} />Dívidas</span>
                  <span className="font-semibold">−{f(ultimo.dividas)}</span>
                </div>
                <div className={`flex items-center justify-between gap-3 pt-1.5 border-t ${linhaB}`}>
                  <span className="font-semibold">Património líquido</span><span className="font-bold">{f(ultimo.total)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Registo do mês */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-lg font-semibold">📝 {meses[idxSel % 12]} {Math.floor(idxSel / 12)}</h3>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${!draft.existe ? (ehAuto ? 'text-blue-400 bg-blue-500/15 border-blue-500/40' : 'text-amber-400 bg-amber-500/15 border-amber-500/40') : draft.importado ? 'text-blue-400 bg-blue-500/15 border-blue-500/40' : 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40'}`}>
              {!draft.existe ? (ehAuto ? 'Automático' : 'Portfolio por atualizar') : draft.importado ? 'Snapshot antigo' : `✓ Registado${draft.fechadoEm ? ' em ' + new Date(draft.fechadoEm).toLocaleDateString('pt-PT') : ''}`}
            </span>
            <button onClick={() => setAjuda(!ajuda)} aria-label="Ajuda" aria-expanded={ajuda} className={chip(ajuda)}>?</button>
          </div>
        </div>

        {ajuda && (
          <div className={`mb-4 rounded-xl p-3 text-xs space-y-1.5 ${escuro ? 'bg-slate-700/30 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
            <p>Cada mês entra no histórico sozinho, assim que atualizas o Portfolio — não há snapshot para fazer. Só precisas de guardar aqui se quiseres corrigir saldos, movimentos ou deixar uma nota.</p>
            <p><strong>Investimentos</strong> vêm do separador Portfolio — é lá que se editam. <strong>Liquidez</strong> são os saldos das contas. O Fundo de Emergência e a Trade Republic do Portfolio entram aqui sozinhos — é dinheiro parado, não conta para o retorno dos investimentos. Se alguma linha estiver do lado errado, usa "é dinheiro →" ou "← é investimento"; a escolha vale para todos os meses.</p>
            <p><strong>Casa e dívidas</strong> só contam na vista "Património total". Os créditos ativos vêm do separador Crédito.</p>
            <p><strong>Puseste / tiraste</strong> vem das Transações (compras e vendas) ou, sem transações, da Alocação. Serve para separar o teu esforço do que o mercado fez. Amortização é dinheiro dos investimentos usado para abater dívida — não é perda.</p>
          </div>
        )}

        {/* Estado dos últimos 12 meses: o que está preenchido e o que falta */}
        <div className="mb-5">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <p className="text-sm font-medium">Últimos 12 meses</p>
            <p className={`text-xs ${porTratar ? 'text-amber-400' : sub}`}>{porTratar ? `${porTratar} ${porTratar === 1 ? 'mês' : 'meses'} por confirmar` : 'tudo preenchido'}</p>
          </div>
          <div className="grid grid-cols-6 lg:grid-cols-12 gap-1.5">
            {estado.map(e => {
              const cor = e.portfolio === 'ok' ? 'text-emerald-400' : e.portfolio === 'igual' ? 'text-amber-400' : e.portfolio === 'antes' ? sub : 'text-red-400';
              const txt = e.portfolio === 'ok' ? 'Portfolio atualizado' : e.portfolio === 'igual' ? 'Portfolio igual ao mês anterior' : e.portfolio === 'antes' ? 'antes do primeiro mês com dados' : 'Portfolio por atualizar';
              return (
                <button key={e.idx} onClick={() => onIrParaMes(e.key)} title={`${patRotulo(e.idx)}: ${txt}, ${e.transacoes} ${e.transacoes === 1 ? 'transação' : 'transações'}`}
                  aria-label={`${patRotulo(e.idx)}: ${txt}, ${e.transacoes} transações`} aria-pressed={e.idx === idxSel}
                  className={`rounded-lg border px-1 py-1.5 text-center transition-all ${e.idx === idxSel ? 'border-blue-500/60 bg-blue-500/15' : (escuro ? 'border-slate-700 bg-slate-700/20 hover:bg-slate-700/40' : 'border-slate-200 bg-slate-50 hover:bg-slate-100')}`}>
                  <span className="block text-[11px] font-medium">{patRotulo(e.idx)}</span>
                  <span className={`block text-sm font-bold leading-tight ${cor}`}>{e.portfolio === 'ok' ? '✓' : e.portfolio === 'igual' ? '=' : e.portfolio === 'antes' ? '–' : '✕'}</span>
                  <span className={`block text-[10px] ${sub}`}>{e.transacoes} tr.</span>
                </button>
              );
            })}
          </div>
          <p className={`text-[11px] mt-1.5 ${sub}`}>✓ Portfolio atualizado · = igual ao mês anterior (confirma se atualizaste) · ✕ por atualizar · "tr." = transações registadas nesse mês. Clica num mês para o abrir.</p>
        </div>

        {estSel && (estSel.portfolio === 'falta' || estSel.portfolio === 'igual') && (
          <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 ${escuro ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
            <p className="text-xs flex-1 min-w-[200px]">
              {estSel.portfolio === 'falta'
                ? `O Portfolio de ${patRotulo(idxSel)} ainda não tem valores. Enquanto não tiver, este mês não entra no histórico.`
                : `Os investimentos no Portfolio de ${patRotulo(idxSel)} têm exatamente os mesmos valores do mês anterior. Se foi só uma cópia, falta atualizá-los.`}
            </p>
            {onAbrirTab && <button onClick={() => onAbrirTab('portfolio')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white">Abrir o Portfolio deste mês →</button>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
          {/* Investimentos (vêm do Portfolio) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#3b82f6' }} />Investimentos</p>
              <span className="text-sm font-semibold">{f(tDraft.invest)}</span>
            </div>
            {itensInvest.length === 0 ? <p className={`text-xs ${sub}`}>Sem investimentos neste registo.</p> : (
              <div className="space-y-1">
                {itensInvest.map((i, k) => (
                  <div key={k} className={`flex justify-between gap-3 text-sm ${sub}`}>
                    <span className="truncate">{i.desc}
                      <button onClick={() => marcarDinheiro(i, true)} title="Esta linha é dinheiro parado, não investimento" className="ml-2 text-[11px] text-blue-400 hover:text-blue-300">é dinheiro →</button>
                    </span><span className="flex-shrink-0">{f(patNum(i.val))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <PatLinhas titulo="Liquidez" cor="#059669" linhas={draft.liquidez} fixas={itensLiquidez} onMoverFixa={x => marcarDinheiro(x, false)} onChange={l => setDraft({ ...draft, liquidez: l })} inp={inp} sub={sub} placeholder="Conta" />
            {saldosDiferentes.length > 0 && (
              <div className={`mt-3 rounded-xl p-3 text-xs ${escuro ? 'bg-slate-700/30' : 'bg-slate-100'}`}>
                <p className="font-medium">Saldos encontrados no Extrato</p>
                <ul className={`mt-1 space-y-0.5 ${sub}`}>
                  {saldosDiferentes.map(x => (
                    <li key={x.contaId} className="flex justify-between gap-2"><span>{x.nome} · saldo de {x.data.split('-').reverse().join('/')}</span><span>{f(x.saldo)}</span></li>
                  ))}
                </ul>
                <button onClick={usarSaldosExtrato} className="mt-2 px-3 py-1.5 rounded-lg font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-400">Usar estes saldos</button>
                <span className={`ml-2 ${sub}`}>depois carrega em Guardar</span>
              </div>
            )}
            {(G.vendaCasa || reservadoAutoSel > 0 || tDraft.reservado > 0) && (
              <div className={`mt-3 rounded-xl p-3 text-xs ${escuro ? 'bg-slate-700/30' : 'bg-slate-100'}`}>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="pat-reservado" className="font-medium">Desta liquidez, reservado para imobiliário</label>
                  <input id="pat-reservado" type="number" inputMode="decimal" value={draft.reservado == null ? '' : draft.reservado} placeholder={String(reservadoAutoSel || 0)}
                    onChange={e => setDraft({ ...draft, reservado: e.target.value })} className={`${inp} !w-28 !py-1 text-right text-xs`} />
                </div>
                <p className={`mt-1 ${sub}`}>
                  {String(draft.reservado == null ? '' : draft.reservado).trim() !== '' ? 'Valor posto à mão para este mês (apaga o campo para voltar ao automático).' : reservadoAutoSel > 0 ? `Automático: ${f(reservadoAutoSel)}, do separador Venda de Casa (líquido da venda menos o que já gastaste ou investiste).` : 'Fica a zero até pores a data da venda no separador Venda de Casa.'}
                  {' '}Livre: <strong>{f(tDraft.livre)}</strong>.
                  {(String(draft.reservado == null ? '' : draft.reservado).trim() !== '' ? patNum(draft.reservado) : reservadoAutoSel) > tDraft.liquidez + 0.5 && <span className="text-amber-500"> O reservado é maior do que o dinheiro nas contas deste mês: atualiza os saldos da Liquidez.</span>}
                </p>
                {onAbrirTab && <button onClick={() => onAbrirTab('vendacasa')} className="mt-1 text-blue-400 hover:text-blue-300">Abrir Venda de Casa →</button>}
              </div>
            )}
          </div>
        </div>

        {/* Casa, dívidas e outros — recolhido por defeito */}
        <div className={`mt-5 pt-4 border-t ${linhaB}`}>
          <button onClick={() => setMais(!mais)} aria-expanded={mais} className="w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-left">
            <span className="text-sm font-medium">{mais ? '▾' : '▸'} Casa, dívidas e outros</span>
            <span className={`text-xs ${sub}`}>Imóveis {f(tDraft.imoveis)} · Dívidas {f(tDraft.dividas)}{tDraft.outros ? ` · Outros ${f(tDraft.outros)}` : ''}</span>
          </button>
          {mais && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5 mt-4">
              <PatLinhas titulo="Imóveis" cor="#d97706" linhas={draft.imoveis} onChange={l => setDraft({ ...draft, imoveis: l })} inp={inp} sub={sub} placeholder="Imóvel" />
              <PatLinhas titulo="Dívidas" cor="#ef4444" linhas={draft.dividas} onChange={l => setDraft({ ...draft, dividas: l })} inp={inp} sub={sub} placeholder="Dívida" />
              <PatLinhas titulo="Outros ativos" cor="#8b5cf6" linhas={draft.outros} onChange={l => setDraft({ ...draft, outros: l })} inp={inp} sub={sub} placeholder="Ex.: Investimento imobiliário" />
            </div>
          )}
        </div>

        {/* Movimentos — uma frase, com "corrigir" */}
        <div className={`mt-4 pt-4 border-t ${linhaB}`}>
          <label className={`mb-3 flex flex-wrap items-center gap-2 text-xs ${sub}`}>
          <span>Os valores do Portfolio de {patRotulo(idxSel)} são do dia</span>
          <input type="date" value={corteSel} min={patIso(new Date(Math.floor(idxSel / 12), idxSel % 12, 1))} max={patIso(new Date(Math.floor(idxSel / 12), (idxSel % 12) + 1, 20))}
            onChange={e => { if (patDataAceite(idxSel, e.target.value)) setPat({ datas: { ...(pat.datas || {}), [mesKey]: e.target.value } }); }}
            className={`${inp} !w-auto !py-1 text-xs`} aria-label="Dia a que se referem os valores do Portfolio" />
          <span>· compras até este dia contam para {patRotulo(idxSel)}, as seguintes para o mês a seguir</span>
        </label>
          {!anterior ? (
            <p className={`text-sm ${sub}`}>Primeiro registo. A partir do próximo, a app mostra quanto puseste e quanto o mercado rendeu.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm">
                  Desde {patRotulo(anterior.idx)} puseste <strong>{f(patNum(draft.aportes))}</strong>
                  {saidasDraft > 0 && <> e tiraste <strong>{f(saidasDraft)}</strong></>}
                  {patNum(draft.amortizacao) > 0 && <span className={sub}> ({f(patNum(draft.amortizacao))} para amortizar crédito)</span>}
                  .{anterior.rec.importado
                    ? <span className={sub}> O mês anterior é um snapshot antigo sem detalhe, por isso o rendimento do mercado só é calculado a partir do próximo.</span>
                    : <> O mercado {mercadoDraft >= 0 ? 'rendeu' : 'tirou'} <strong className={corDelta(mercadoDraft)}>{f(Math.abs(mercadoDraft))}</strong>.</>}
                </p>
                <button onClick={() => setEditMov(!editMov)} aria-expanded={editMov} className="text-xs text-blue-400 hover:text-blue-300">{editMov ? 'fechar' : 'corrigir'}</button>
              </div>
              {!editMov && descidaDivida >= 5000 && patNum(draft.amortizacao) === 0 && (anterior.invest - tDraft.invest) >= descidaDivida * 0.5 && (
                <button onClick={usarDescida} className="mt-2 block text-left text-xs text-blue-400 hover:text-blue-300">
                  A dívida desceu {f(descidaDivida)} — foi amortização paga com os investimentos? Contar como tal
                </button>
              )}
              {editMov && (
                <div className="mt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1"><span className={`text-xs ${sub}`}>Puseste (aportes)</span>
                      <input type="number" inputMode="decimal" value={draft.aportes} onChange={e => setDraft({ ...draft, aportes: e.target.value, movManual: true })} placeholder="0" className={`${inp} text-right`} /></label>
                    <label className="flex flex-col gap-1"><span className={`text-xs ${sub}`}>Tiraste para gastar</span>
                      <input type="number" inputMode="decimal" value={draft.levantamentos} onChange={e => setDraft({ ...draft, levantamentos: e.target.value, movManual: true })} placeholder="0" className={`${inp} text-right`} /></label>
                    <label className="flex flex-col gap-1"><span className={`text-xs ${sub}`}>Tiraste para amortizar crédito</span>
                      <input type="number" inputMode="decimal" value={draft.amortizacao} onChange={e => setDraft({ ...draft, amortizacao: e.target.value, movManual: true })} placeholder="0" className={`${inp} text-right`} /></label>
                  </div>
                  <p className={`text-xs mt-2 ${sub}`}>
                    {mov.origem === 'transacoes' ? `Transações neste período: ${mov.nCompras} ${mov.nCompras === 1 ? 'compra' : 'compras'}, ${mov.nVendas} ${mov.nVendas === 1 ? 'venda' : 'vendas'}.`
                      : mov.origem === 'alocacao' ? 'Sem transações neste período — valor da Alocação.' : 'Sem transações nem Alocação neste período.'}
                  </p>
                  {onAbrirTab && <button onClick={() => onAbrirTab('transacoes')} className="mt-1.5 block text-left text-xs text-blue-400 hover:text-blue-300">Abrir as Transações →</button>}
                  {movDifere && (
                    <button onClick={() => setDraft({ ...draft, movManual: false, aportes: mov.aportes ? String(mov.aportes) : '', levantamentos: mov.levantamentos ? String(mov.levantamentos) : '', amortizacao: mov.amortizacao ? String(mov.amortizacao) : '' })}
                      className="mt-1.5 block text-left text-xs text-blue-400 hover:text-blue-300">↻ Repor os valores das Transações</button>
                  )}
                  {descidaDivida > 0 && patNum(draft.amortizacao) === 0 && (
                    <button onClick={usarDescida} className="mt-1.5 block text-left text-xs text-blue-400 hover:text-blue-300">
                      A dívida desceu {f(descidaDivida)} — contar como amortização
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <label className="flex flex-col gap-1 mt-4">
          <span className={`text-xs ${sub}`}>Nota (opcional)</span>
          <textarea value={draft.nota} onChange={e => setDraft({ ...draft, nota: e.target.value })} rows={1} placeholder="O que explica os números deste mês?" className={`${inp} w-full resize-y`} />
        </label>

        {ehAuto && <p className={`text-xs mt-3 ${sub}`}>Este mês já está no histórico, calculado sozinho a partir do Portfolio. Não precisas de guardar nada — só se corrigires algum valor.</p>}
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-4 border-t ${linhaB}`}>
          <div><p className={`text-xs ${sub}`}>Património financeiro</p><p className="font-bold">{f(tDraft.capital)}</p></div>
          <div><p className={`text-xs ${sub}`}>Património total</p><p className="font-bold">{f(tDraft.total)}</p></div>
          <div className="ml-auto flex items-center gap-2">
            {draft.existe && (confirmaApagar
              ? <><span className={`text-xs ${sub}`}>Apagar este registo?</span>
                  <button onClick={apagar} className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30">Sim, apagar</button>
                  <button onClick={() => setConfirmaApagar(false)} className={chip(false)}>Cancelar</button></>
              : <button onClick={() => setConfirmaApagar(true)} className="px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10">Apagar</button>)}
            {!confirmaApagar && (
              <button onClick={guardar} disabled={!sujo && !draft.importado}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all ${(!sujo && !draft.importado) ? 'bg-slate-500/40 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}>
                {!draft.existe ? (ehAuto ? 'Guardar correções' : 'Guardar') : draft.importado ? 'Confirmar' : sujo ? 'Guardar alterações' : 'Guardado'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Acontecimentos */}
      <div className={card}>
        <button onClick={() => setSec({ ...sec, ev: !sec.ev })} aria-expanded={sec.ev} className="w-full flex items-center justify-between gap-3 text-left">
          <h3 className="font-semibold">{sec.ev ? '▾' : '▸'} 📌 Acontecimentos</h3>
          <span className={`text-xs ${sub}`}>{evOrd.length ? `${evOrd.length} ${evOrd.length === 1 ? 'marco' : 'marcos'}` : 'venda da casa, mudança de trabalho…'}</span>
        </button>
        {sec.ev && (<div className="mt-3">
        {evOrd.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {evOrd.map(e => (
              <div key={e.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${escuro ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                <span className={`w-5 h-5 rounded-full border text-[10px] font-semibold flex items-center justify-center flex-shrink-0 ${escuro ? 'border-slate-500' : 'border-slate-400'}`}>{e.n}</span>
                <span className={`text-xs flex-shrink-0 ${sub}`}>{(e.data || '').split('-').reverse().join('/')}</span>
                <span className="text-sm flex-1 min-w-0 truncate">{e.texto}</span>
                <button onClick={() => setPat({ eventos: eventos.filter(x => x.id !== e.id) })} aria-label="Remover acontecimento" className="text-red-400 hover:text-red-300 px-1">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input type="date" value={novoEv.data} onChange={e => setNovoEv({ ...novoEv, data: e.target.value })} className={inp} />
          <input type="text" value={novoEv.texto} onChange={e => setNovoEv({ ...novoEv, texto: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') addEvento(); }}
            placeholder="Ex.: Vendi a casa" className={`${inp} flex-1 min-w-[180px]`} />
          <button onClick={addEvento} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white">+ Adicionar</button>
        </div>
        </div>)}
      </div>

      {/* Histórico detalhado */}
      {det.length > 0 && (
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setSec({ ...sec, hist: !sec.hist })} aria-expanded={sec.hist} className="flex-1 text-left">
              <h3 className="font-semibold">{sec.hist ? '▾' : '▸'} 📚 Histórico detalhado</h3>
            </button>
            {sec.hist ? <button onClick={exportarCSV} className={chip(false)}>⬇ Exportar CSV</button>
              : <span className={`text-xs ${sub}`}>{det.length} {det.length === 1 ? 'registo' : 'registos'}</span>}
          </div>
          {sec.hist && (<div className="mt-3">
          {anosTab.map(y => {
            const linhasAno = det.filter(d => Math.floor(d.idx / 12) === y).reverse();
            const fim = linhasAno[0], ini = linhasAno[linhasAno.length - 1];
            const base = ini.prev || ini;
            return (
              <div key={y} className={`border-t ${linhaB} first:border-t-0`}>
                <button onClick={() => setAnosAbertos({ ...anosAbertos, [y]: !anoAberto(y) })} className="w-full flex items-center justify-between gap-3 py-2.5 text-left">
                  <span className="font-semibold">{anoAberto(y) ? '▾' : '▸'} {y} <span className={`text-xs font-normal ${sub}`}>{linhasAno.length} {linhasAno.length === 1 ? 'registo' : 'registos'}</span></span>
                  <span className="text-sm">{f(fim[campo])} <span className={`text-xs ${corDelta(fim[campo] - base[campo])}`}>{base !== fim ? sinal(fim[campo] - base[campo]) : ''}</span></span>
                </button>
                {anoAberto(y) && (
                  <div className="overflow-x-auto pb-2">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead>
                        <tr className={sub}>
                          {['Mês', 'Investim.', 'Liquidez', 'Outros', ...(vista === 'total' ? ['Imóveis', 'Dívidas'] : []), nomeVista, 'Variação', 'Puseste', 'Amortiz.', 'Mercado'].map((c, i) => (
                            <th key={c} className={`font-medium py-1.5 px-2 ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhasAno.map(d => {
                          const dv = vista === 'invest' ? (d.prev ? d.invest - d.prev.invest : null) : vista === 'capital' ? d.dCapital : d.dTotal;
                          return (
                            <tr key={d.idx} onClick={() => onIrParaMes(d.key)} title={d.rec.nota || 'Abrir este mês'}
                              className={`cursor-pointer border-t ${linhaB} ${d.idx === idxSel ? (escuro ? 'bg-blue-500/10' : 'bg-blue-50') : (escuro ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50')}`}>
                              <td className="py-1.5 px-2 text-left font-medium">{patRotulo(d.idx)}{d.rec.importado && <span className={`ml-1 text-[10px] font-normal ${sub}`}>imp.</span>}{d.rec.auto && <span className={`ml-1 text-[10px] font-normal ${sub}`}>auto</span>}{d.rec.nota && <span className={`ml-1 text-[10px] font-normal ${sub}`}>nota</span>}</td>
                              <td className="py-1.5 px-2 text-right">{f(d.invest)}</td>
                              <td className="py-1.5 px-2 text-right">{f(d.liquidez)}</td>
                              <td className="py-1.5 px-2 text-right">{f(d.outros)}</td>
                              {vista === 'total' && <td className="py-1.5 px-2 text-right">{f(d.imoveis)}</td>}
                              {vista === 'total' && <td className="py-1.5 px-2 text-right">{d.dividas ? '−' + f(d.dividas) : f(0)}</td>}
                              <td className="py-1.5 px-2 text-right font-semibold">{f(d[campo])}</td>
                              <td className={`py-1.5 px-2 text-right ${dv != null ? corDelta(dv) : sub}`}>{dv != null ? sinal(dv) : '—'}</td>
                              <td className={`py-1.5 px-2 text-right ${d.fluxo == null ? sub : ''}`}>{d.fluxo != null ? sinal(d.fluxo) : '—'}</td>
                              <td className={`py-1.5 px-2 text-right ${patNum(d.rec.amortizacao) ? '' : sub}`}>{patNum(d.rec.amortizacao) ? '−' + f(patNum(d.rec.amortizacao)) : '—'}</td>
                              <td className={`py-1.5 px-2 text-right ${d.resultado != null ? corDelta(d.resultado) : sub}`}>{d.resultado != null ? sinal(d.resultado) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          <p className={`text-[11px] mt-2 ${sub}`}>auto = calculado sozinho a partir do Portfolio · imp. = snapshot antigo · clica numa linha para abrir esse mês.</p>
          </div>)}
        </div>
      )}
    </div>
  );
};

export {
  PedirDados, txNumero, txR2, txParseCSV, txEhDegiro, txLerDegiro, TX_MESES, txEhTradeRepublic,
  txLerTradeRepublic, txDias, txParecida, txMaisProxima, txMarcarDuplicados, txDuplicadosProvaveis, txTextoPDF, txLerFicheiro,
  PAT_COMP, PAT_CONTAS_BASE, PAT_CATS_LIQUIDEZ, patChave, patEhLiquidez, patItemLiq, patRegras, patId,
  patNum, patStr, patIdx, patKey, patSoma, patIso, patFimMes, patDataAceite,
  PAT_DATAS_INICIAIS, patCorte, patIdxHoje, patTemPortfolio, patHistoricoPortfolio, patRotulo, patTotais, patSerie,
  patDetalhe, patReservado, patSaldosExtrato, patPoupanca, patRetornoReal, patTxConta, patTxLiquido, patTxEntre,
  patVida, patRetorno, patInvestDoPortfolio, patListaCreditos, patCreditoNoMes, patRascunho, patLimpar, patSugestaoAportes,
  patMovimentos, patEstadoMeses, patImportar, patRegistosEfetivos, cmpDadosAno, CompararAnos, CHAT_URLS, ChatTexto,
  ChatGemini, patFmtK, PatLinhas, PatChart, Patrimonio
};
