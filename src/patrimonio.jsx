// Contas do Património, importação de transações (Degiro / Trade Republic),
// comparação entre anos, chat e a caixa genérica para pedir valores.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  GraficoBarras, meses, Ico, anos, _fmtEUR, VC_DEFAULT
} from './base';

// Caixa genérica para pedir valores (substitui o prompt() do browser).
// pedido = { titulo, texto?, campos: [{ k, label, tipo: 'month'|'number'|'text'|'lista', valor, opcoes? }], botao?, onOk(valores) }
const PedirDados = ({ pedido, theme, onFechar }) => {
  const [v, setV] = useState(() => Object.fromEntries((pedido.campos || []).map(c => [c.k, c.valor != null ? c.valor : (c.tipo === 'lista' ? [] : '')])));
  const claro = theme === 'light';
  const inp = `w-full rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500/40 ${claro ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'}`;
  const ok = () => { const fn = pedido.onOk; onFechar(); if (fn) fn(v); };
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <form onSubmit={e => { e.preventDefault(); ok(); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }}
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
        <h3 className="font-semibold"><Ico e="📊"/>Comparar anos</h3>
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
      <GraficoBarras height={180} aria={`Receitas por mês, ${anoA} e ${anoB}`}
        rotulos={meses.map(nome => nome.slice(0, 3))}
        series={[{ nome: String(anoA), cor: corA, valores: dA.recMes }, { nome: String(anoB), cor: corB, valores: dB.recMes }]}
        apagado={i => i >= ateMes} />
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

const CSS_BASE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
body, button, input, select, textarea { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
body { font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.text-\\[8px\\], .text-\\[9px\\] { font-size: 10.5px !important; line-height: 1.3 !important; }
.text-\\[10px\\], .text-\\[11px\\] { font-size: 12px !important; line-height: 1.35 !important; }
html[data-tema="escuro"] .text-slate-500 { color: #8a97ab; }
html[data-tema="escuro"] .text-slate-600 { color: #6f7d93; }
html[data-tema="escuro"] .placeholder-slate-500::placeholder, html[data-tema="escuro"] input::placeholder, html[data-tema="escuro"] textarea::placeholder { color: #7c899e; }
html[data-tema="claro"] .text-slate-400 { color: #6b7789; }
.ico { width: 1.05em; height: 1.05em; display: inline-block; vertical-align: -0.16em; margin-right: .45em; flex-shrink: 0; opacity: .85; }
.ico-nav { margin-right: .35em; }
.ico-solo { margin-right: 0; }
html[data-tema="escuro"] .tile { background: rgba(15, 23, 42, .45); border: 1px solid rgba(71, 85, 105, .5); }
html[data-tema="claro"] .tile { background: #f8fafc; border: 1px solid #e2e8f0; }
html[data-tema="escuro"] { --graf-grelha: rgba(148, 163, 184, .12); --graf-base: rgba(148, 163, 184, .35); --graf-eixo: #8a97ab; --graf-texto: #f1f5f9; --graf-fundo: #1e293b; --graf-caixa: #0f172a; --graf-caixa-borda: #334155; }
html[data-tema="claro"] { --graf-grelha: #eef2f6; --graf-base: #cbd5e1; --graf-eixo: #64748b; --graf-texto: #0f172a; --graf-fundo: #ffffff; --graf-caixa: #ffffff; --graf-caixa-borda: #e2e8f0; }
/* Tema claro: peças antigas que tinham cores escuras fixas passam a claras */
html[data-tema="claro"] .bg-slate-900, html[data-tema="claro"] .bg-slate-800 { background-color: #ffffff; }
html[data-tema="claro"] [class^="bg-slate-900/"], html[data-tema="claro"] [class*=" bg-slate-900/"], html[data-tema="claro"] [class^="bg-slate-800/"], html[data-tema="claro"] [class*=" bg-slate-800/"] { background-color: rgba(255, 255, 255, .85); }
html[data-tema="claro"] .bg-slate-700, html[data-tema="claro"] .bg-slate-600 { background-color: #e2e8f0; }
html[data-tema="claro"] [class^="bg-slate-700/"], html[data-tema="claro"] [class*=" bg-slate-700/"], html[data-tema="claro"] [class^="bg-slate-600/"], html[data-tema="claro"] [class*=" bg-slate-600/"] { background-color: #f1f5f9; }
html[data-tema="claro"] .hover\\:bg-slate-600:hover, html[data-tema="claro"] .hover\\:bg-slate-700:hover, html[data-tema="claro"] [class*="hover:bg-slate-700/"]:hover, html[data-tema="claro"] [class*="hover:bg-slate-600/"]:hover { background-color: #e2e8f0; }
html[data-tema="claro"] .border-slate-600, html[data-tema="claro"] .border-slate-700, html[data-tema="claro"] [class^="border-slate-700/"], html[data-tema="claro"] [class*=" border-slate-700/"], html[data-tema="claro"] [class^="border-slate-600/"], html[data-tema="claro"] [class*=" border-slate-600/"] { border-color: #e2e8f0; }
html[data-tema="claro"] .divide-slate-700 > * + *, html[data-tema="claro"] .divide-slate-600 > * + * { border-color: #e2e8f0; }
html[data-tema="claro"] .text-slate-300 { color: #334155; }
html[data-tema="claro"] .text-slate-200, html[data-tema="claro"] .text-slate-100 { color: #1e293b; }
html[data-tema="claro"] input.text-white, html[data-tema="claro"] select.text-white, html[data-tema="claro"] textarea.text-white, html[data-tema="claro"] .bg-slate-700.text-white, html[data-tema="claro"] .bg-slate-600.text-white, html[data-tema="claro"] .bg-slate-800 .text-white:not([class*="bg-"]), html[data-tema="claro"] .bg-slate-900 .text-white:not([class*="bg-"]), html[data-tema="claro"] [class^="bg-slate-700/"], html[data-tema="claro"] [class*=" bg-slate-700/"].text-white { color: #0f172a; }
html[data-tema="claro"] .hover\\:text-white:not([class*="bg-"]):hover { color: #0f172a; }
`;

// Ajustes só para o telemóvel (ecrãs < 640px). As classes m-* não fazem nada no computador.
const CSS_MOBILE = `
.m-br{display:none}
@media (max-width: 639px){
  .m-row{flex-wrap:wrap;row-gap:.375rem}
  .m-row>.m-hide{display:none!important}
  .m-row>.m-l1{order:-1}
  .m-row>.m-desc{order:-1;flex:1 1 0%;min-width:0;width:auto}
  .m-row>.m-br{display:block;order:-1;flex-basis:100%;height:0}
  .m-row>.m-grow{flex:1 1 0%;width:auto;min-width:0}
  .m-wrap{flex-wrap:wrap;row-gap:.5rem}
  .m-gap2{gap:.5rem!important}
  .m-ml-auto{margin-left:auto}
  .m-num{font-size:.8rem!important;line-height:1.15rem!important;overflow-wrap:anywhere}
  .m-fab{display:none!important}
  .m-fab-txt{display:none}
  .m-pad{padding-bottom:7.5rem!important}
}
`;

export {
  PedirDados, txNumero, txR2, txParseCSV, txEhDegiro, txLerDegiro, TX_MESES, txEhTradeRepublic,
  txLerTradeRepublic, txDias, txParecida, txMaisProxima, txMarcarDuplicados, txDuplicadosProvaveis, txTextoPDF, txLerFicheiro,
  PAT_COMP, PAT_CONTAS_BASE, PAT_CATS_LIQUIDEZ, patChave, patEhLiquidez, patItemLiq, patRegras, patId,
  patNum, patStr, patIdx, patKey, patSoma, patIso, patFimMes, patDataAceite,
  PAT_DATAS_INICIAIS, patCorte, patIdxHoje, patTemPortfolio, patHistoricoPortfolio, patRotulo, patTotais, patSerie,
  patDetalhe, patReservado, patSaldosExtrato, patPoupanca, patRetornoReal, patTxConta, patTxLiquido, patTxEntre,
  patVida, patRetorno, patInvestDoPortfolio, patListaCreditos, patCreditoNoMes, patRascunho, patLimpar, patSugestaoAportes,
  patMovimentos, patEstadoMeses, patImportar, patRegistosEfetivos, cmpDadosAno, CompararAnos, CHAT_URLS, ChatTexto,
  ChatGemini, CSS_BASE, CSS_MOBILE
};
