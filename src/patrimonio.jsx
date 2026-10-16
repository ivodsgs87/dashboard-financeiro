// Contas do Património, importação de transações (Degiro / Trade Republic),
// comparação entre anos, chat e a caixa genérica para pedir valores.
import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { createPortal } from 'react-dom';
import {
  StableInput, GraficoLinhas, GraficoBarras, meses, Ico, anos, _fmtEUR, clienteDoNome,
  CU_TIPOS, trabDia, trabMsTempo, trabHoras, trabEntrega, trabPecas, trabValor, ehNaoFaturacao,
  idsNaoFaturacao, faturacaoDoMes, taxaPoupancaDe, TemaCtx, Info, VC_DEFAULT
} from './base';

// Caixa genérica para pedir valores (substitui o prompt() do browser).
// pedido = { titulo, texto?, campos: [{ k, label, tipo: 'month'|'number'|'text'|'lista', valor, opcoes? }], botao?, onOk(valores) }
const PedirDados = ({ pedido, theme, onFechar }) => {
  const [v, setV] = useState(() => Object.fromEntries((pedido.campos || []).map(c => [c.k, c.valor != null ? c.valor : (c.tipo === 'lista' ? [] : '')])));
  const claro = theme === 'light';
  const inp = `w-full rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500/40 ${claro ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'}`;
  const ok = () => { const fn = pedido.onOk; onFechar(); if (fn) fn(v); };
  return createPortal(
    <div className="animate-backdropIn fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <form onSubmit={e => { e.preventDefault(); ok(); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }}
        className={`animate-modalIn ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'} border rounded-2xl p-5 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto`}>
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
// «2026-09» → «Set/26» (datas do histórico da dívida)
const rotuloAnoMes = ym => { const m = /^(\d{4})-(\d{1,2})/.exec(String(ym || '')); return m ? patRotulo(Number(m[1]) * 12 + Number(m[2]) - 1) : (ym || ''); };

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
    imoveis: prev && (prev.rec.imoveis || []).some(x => patNum(x.val) > 0) ? copia(prev.rec.imoveis) : imoveisCredito, // sem imóveis no mês anterior: vai buscar a casa ao separador Crédito
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
  const nfCmp = idsNaoFaturacao(G && G.clientes); // reembolsos e afins não são faturação
  let horas = 0, alocado = 0;
  Object.entries(M || {}).forEach(([k, v]) => {
    const [a, m] = String(k).split('-').map(Number);
    if (a !== y || !(m >= 1 && m <= ateMes) || !v) return;
    [...(v.regCom || []), ...(v.regSem || [])].forEach(r => { if (nfCmp.has(String(r.cid))) return; const x = patNum(r.val); recMes[m - 1] += x; porCliente[r.cid] = (porCliente[r.cid] || 0) + x; });
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
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead><tr className={`text-xs ${sub}`}><th className="text-left font-normal py-1"></th>
            <th className="text-right font-normal pl-2"><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: corA }} />{anoA}{ateMes < 12 ? <span className="block text-[10px]">Jan–{meses[ateMes - 1].slice(0, 3)}</span> : anoA === hoje.getFullYear() && <span className="block text-[10px]">até agora</span>}</th>
            <th className="text-right font-normal pl-2"><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: corB }} />{anoB}{ateMes < 12 ? <span className="block text-[10px]">Jan–{meses[ateMes - 1].slice(0, 3)}</span> : anoB === hoje.getFullYear() && <span className="block text-[10px]">até agora</span>}</th>
            <th className="text-right font-normal pl-2">Diferença</th></tr></thead>
          <tbody>
            {linhas.map(r => (
              <tr key={r.l} className={`border-t ${escuro ? 'border-slate-700/40' : 'border-slate-200'}`}>
                <td className="py-1.5">{r.l}</td>
                <td className="text-right pl-2">{r.a == null || (r.falta && r.falta[0]) ? <span className={sub}>sem dados</span> : r.fm(r.a)}{r.nota && r.nota[0] ? <span className={`block text-[10px] ${sub}`}>{r.nota[0]}</span> : null}</td>
                <td className="text-right font-semibold pl-2">{r.b == null || (r.falta && r.falta[1]) ? <span className={`font-normal ${sub}`}>sem dados</span> : r.fm(r.b)}{r.nota && r.nota[1] ? <span className={`block text-[10px] font-normal ${sub}`}>{r.nota[1]}</span> : null}</td>
                <td className="text-right pl-2">{r.falta && (r.falta[0] || r.falta[1]) ? <span className={sub}>—</span> : delta(r.a, r.b, r.menosEhBom, r.neutro)}</td>
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
          <table className="w-full text-xs sm:text-sm tabular-nums">
            <tbody>
              {clientes.map(c => (
                <tr key={c.nome} className={`border-t ${escuro ? 'border-slate-700/40' : 'border-slate-200'}`}>
                  <td className="py-1.5">{c.nome}</td>
                  <td className="text-right pl-2">{c.a ? f(c.a) : <span className={sub}>—</span>}</td>
                  <td className="text-right font-semibold pl-2">{c.b ? f(c.b) : <span className={`font-normal ${sub}`}>—</span>}</td>
                  <td className="text-right w-14 pl-2">{c.a && c.b ? delta(c.a, c.b) : <span className={sub}>{c.b ? 'novo' : 'saiu'}</span>}</td>
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
          <p className="font-semibold"><Ico e="✨"/>Perguntar ao Gemini</p>
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

// Peças do "O meu ano" (ao nível do módulo para não remontarem a cada render)
const AnoCaixa = ({ children, className = '' }) => {
  const claro = useContext(TemaCtx) === 'light';
  return <div className={`rounded-2xl border p-4 sm:p-5 ${claro ? 'bg-white/80 border-slate-200 shadow-sm hover-lift' : 'bg-slate-800/50 border-slate-700/50 hover-lift'} ${className}`}>{children}</div>;
};
const AnoVer = ({ onIr, tab, t = 'ver detalhe' }) => <button onClick={() => onIr(tab)} className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap">{t} →</button>;
const AnoBarra = ({ v, cor }) => {
  const claro = useContext(TemaCtx) === 'light';
  return <div className={`h-1.5 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700'}`}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: cor }} /></div>;
};
const AnoNum = ({ rot, val, cor, nota, barra, ir, onIr }) => {
  const claro = useContext(TemaCtx) === 'light';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  return (
    <AnoCaixa className="!p-4">
      <div className="flex items-start justify-between gap-2"><p className={`text-xs ${sub}`}>{rot}</p>{ir && <AnoVer onIr={onIr} tab={ir} t="ver" />}</div>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${cor || (claro ? 'text-slate-900' : 'text-white')}`}>{val}</p>
      {barra}
      {nota && <p className={`text-xs mt-1.5 ${sub}`}>{nota}</p>}
    </AnoCaixa>
  );
};
// ── "O meu ano": o essencial do ano num só ecrã ──
// Componente ao nível do módulo (não remonta quando a app redesenha). Só lê dados; para mexer, os links levam aos separadores.
// Cartãozinho que abre por baixo de uma frase do «Em resumo»: as contas e os números por trás
// d = { linhas: [[rótulo, valor, destaque]], tabela: { cab, linhas }, lista: [{ rot, v, txt, cor }], nota }
const AnoDetalhe = ({ d, ir, onIr }) => {
  const claro = useContext(TemaCtx) === 'light';
  const sub = claro ? 'text-slate-500' : 'text-slate-400', forte = claro ? 'text-slate-800' : 'text-slate-100';
  const max = d.lista && d.lista.length ? Math.max(1, ...d.lista.map(x => Math.abs(x.v) || 0)) : 1;
  return (
    <div className={`mt-1.5 ml-7 rounded-lg border p-3 text-xs space-y-2.5 ${claro ? 'border-slate-200 bg-slate-50' : 'border-slate-700/70 bg-slate-900/50'}`}>
      {d.linhas && d.linhas.length > 0 && (
        <div className="space-y-1">
          {d.linhas.map(([r, v, b], k) => <div key={k} className={`flex justify-between gap-3 ${b ? `pt-1 border-t ${claro ? 'border-slate-200' : 'border-slate-700/70'}` : ''}`}><span className={sub}>{r}</span><span className={`tabular-nums text-right ${b ? 'font-semibold' : ''} ${forte}`}>{v}</span></div>)}
        </div>
      )}
      {d.tabela && (
        <table className="w-full tabular-nums">
          <thead><tr className={sub}>{d.tabela.cab.map((c, k) => <th key={k} className={`font-medium pb-1 ${k ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
          <tbody>{d.tabela.linhas.map((l, k) => <tr key={k}>{l.map((c, j) => <td key={j} className={`py-0.5 ${j ? `text-right ${forte}` : sub}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      )}
      {d.lista && d.lista.length > 0 && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {d.lista.map((x, k) => (
            <div key={k}>
              <div className="flex justify-between gap-3"><span className={`truncate ${forte}`}>{x.rot}</span><span className={`tabular-nums whitespace-nowrap ${sub}`}>{x.txt}</span></div>
              <AnoBarra v={(Math.abs(x.v) || 0) / max * 100} cor={x.cor || '#3b82f6'} />
            </div>
          ))}
        </div>
      )}
      {d.nota && <p className={`leading-relaxed ${sub}`}>{d.nota}</p>}
      {ir && onIr && <div className="text-right"><AnoVer onIr={onIr} tab={ir} t="abrir" /></div>}
    </div>
  );
};
// €/h por cliente ao longo dos meses: o valor das tarefas entregues em cada mês (aos preços das tarefas; as subcontratadas
// pela margem) a dividir pelas horas do cronómetro nessas mesmas tarefas — assim uma tarefa começada num mês e entregue
// no seguinte não dá picos falsos. Cada cliente com a sua cor; ligas e desligas cada linha na lista.
const LS_EH_OCULTOS = 'eh-ocultos';
const EH_CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];
const EuroHoraClientes = ({ trab, G, ano, claro }) => {
  const [ocultos, setOcultos] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(LS_EH_OCULTOS) || '[]')); } catch (e) { return new Set(); } });
  const alternar = id => setOcultos(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem(LS_EH_OCULTOS, JSON.stringify([...n])); } catch (e) { /* sem armazenamento */ } return n; });
  const clientes = G.clientes || [];
  const dados = useMemo(() => {
    const porCli = {}; const tot = Array.from({ length: 12 }, () => ({ v: 0, h: 0 }));
    ((trab && trab.tarefas) || []).forEach(t => {
      const ent = trabEntrega(t); if (!ent.startsWith(`${ano}-`)) return;
      const h = trabHoras(t); if (!(h > 0.05)) return; // sem horas registadas não dá para saber o €/h
      const c = clientes.find(x => String(x.id) === String(t.cid)); if (!c) return;
      const v = (Number(trabValor(t, G.clickup, clientes)) || 0) - (Number(t.custoOutsourcing) || 0);
      const m = Number(ent.slice(5, 7)) - 1;
      const pc = porCli[c.id] || (porCli[c.id] = { c, meses: Array.from({ length: 12 }, () => ({ v: 0, h: 0 })), v: 0, h: 0 });
      pc.meses[m].v += v; pc.meses[m].h += h; pc.v += v; pc.h += h; tot[m].v += v; tot[m].h += h;
    });
    const usados = tot.map((x, i) => (x.h > 0 ? i : -1)).filter(i => i >= 0);
    return { lista: Object.values(porCli).sort((a, b) => b.h - a.h), tot, ini: usados.length ? usados[0] : -1, fim: usados.length ? usados[usados.length - 1] : -1 };
  }, [trab, G.clickup, clientes, ano]); // eslint-disable-line react-hooks/exhaustive-deps
  if (dados.ini < 0) return null;
  const idx = Array.from({ length: dados.fim - dados.ini + 1 }, (_, k) => dados.ini + k);
  const corDe = (x, k) => x.c.cor || EH_CORES[k % EH_CORES.length];
  const horas = h => `${h < 10 ? (Math.round(h * 10) / 10).toString().replace('.', ',') : Math.round(h)} h`;
  const totV = dados.tot.reduce((a, x) => a + x.v, 0), totH = dados.tot.reduce((a, x) => a + x.h, 0);
  const brutas = [
    ...dados.lista.map((x, k) => ({ id: String(x.c.id), x, cor: corDe(x, k) })).filter(s => !ocultos.has(s.id)).map(({ x, cor }) => ({
      nome: x.c.nome, cor, pontos: true,
      valores: idx.map(i => (x.meses[i].h > 0 ? x.meses[i].v / x.meses[i].h : null)),
      fracos: idx.map(i => x.meses[i].h < 5),
      nomeTip: j => `${x.c.nome} · ${horas(x.meses[idx[j]].h)}`,
    })),
    ...(!ocultos.has('_todos') ? [{ nome: 'Todos', cor: claro ? '#64748b' : '#94a3b8', tracejado: true, pontos: true,
      valores: idx.map(i => (dados.tot[i].h > 0 ? dados.tot[i].v / dados.tot[i].h : null)), fracos: idx.map(i => dados.tot[i].h < 5),
      nomeTip: j => `Todos · ${horas(dados.tot[idx[j]].h)}` }] : []),
  ];
  // Um mês com muito poucas horas (ex.: 1,5 h numa tarefa grande) dava um €/h enorme e esmagava as outras linhas:
  // esses pontos ficam no topo do gráfico (claros) e o valor certo aparece ao passar o rato
  const fortes = brutas.flatMap(s => s.valores.filter((v, i) => v != null && !s.fracos[i]));
  const limite = fortes.length ? Math.max(...fortes) * 1.3 : Infinity;
  const series = brutas.map(s => ({ ...s, valoresTip: s.valores, valores: s.valores.map((v, i) => (v != null && s.fracos[i] && v > limite ? limite : v)) }));
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const item = (id, nome, cor, med, h, tracejado) => {
    const ligado = !ocultos.has(id);
    return (
      <button key={id} type="button" onClick={() => alternar(id)} aria-pressed={ligado}
        className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-sm transition-opacity ${ligado ? '' : 'opacity-40'} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={tracejado ? { border: `2px dashed ${cor}` } : { background: cor }} />
        <span className="flex-1 min-w-0 truncate">{nome}</span>
        <span className="text-right flex-shrink-0">
          <span className="block font-semibold tabular-nums">{med ? `${_fmtEUR.format(Math.round(med))}/h` : '—'}</span>
          <span className={`block text-[11px] ${sub}`}>{horas(h)}</span>
        </span>
      </button>
    );
  };
  return (
    <AnoCaixa>
      <div className="flex items-center gap-2 mb-3">
        <h3 className={`font-semibold ${claro ? 'text-slate-900' : 'text-white'}`}><Ico e="⏱"/>Valor por hora</h3>
        <Info rotulo="Como é calculado" largura={300}>Em cada mês: o valor das tarefas entregues nesse mês (aos preços das tarefas; as subcontratadas contam pela tua margem) a dividir pelas horas do cronómetro nessas tarefas. Só entram tarefas com horas registadas. Pontos claros: menos de 5 h nesse mês (pouco para tirar conclusões).</Info>
        <span className={`ml-auto text-xs ${sub}`}>{ano}</span>
      </div>
      {series.length === 0 ? <p className={`text-sm py-10 text-center ${sub}`}>Liga pelo menos um cliente na lista.</p> : null}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {series.length > 0 && <GraficoLinhas series={series} rotulos={idx.map(i => meses[i].slice(0, 3))} height={240} formatarValor={v => `${_fmtEUR.format(Math.round(v))}/h`} aria="Valor por hora, por cliente" />}
        </div>
        <div className="lg:w-60 flex-shrink-0 grid grid-cols-2 lg:grid-cols-1 gap-0.5 content-start">
          {item('_todos', 'Todos', claro ? '#64748b' : '#94a3b8', totH > 0 ? totV / totH : 0, totH, true)}
          {dados.lista.map((x, k) => item(String(x.c.id), x.c.nome, corDe(x, k), x.h > 0 ? x.v / x.h : 0, x.h, false))}
        </div>
      </div>
    </AnoCaixa>
  );
};
const MeuAno = ({ G, M, ano, theme, metas, totais, serie, impostos, onIr, trab = null, onMeta = null }) => {
  const [editarMetas, setEditarMetas] = useState(false);
  const [insAberto, setInsAberto] = useState(null); // a frase do «Em resumo» que está aberta
  const [verJogos, setVerJogos] = useState(false);
  const claro = theme === 'light';
  const card = claro ? 'bg-white/80 border-slate-200 shadow-sm hover-lift' : 'bg-slate-800/50 border-slate-700/50 hover-lift';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const forte = claro ? 'text-slate-900' : 'text-white';
  const f = v => _fmtEUR.format(isFinite(v) ? Math.round(v) : 0);
  const pct = v => `${Math.round(v)}%`;
  const hoje = new Date();
  const anoHoje = hoje.getFullYear(), mesHoje = hoje.getMonth() + 1;
  const ateMes = ano < anoHoje ? 12 : ano === anoHoje ? mesHoje : 0;
  const nfAno = idsNaoFaturacao(G.clientes); // reembolsos e afins não são faturação
  const recDe = (y, m) => faturacaoDoMes(M[`${y}-${m}`], nfAno);
  const recMes = Array.from({ length: 12 }, (_, i) => (i < ateMes ? recDe(ano, i + 1) : 0));
  const rec = recMes.reduce((a, v) => a + v, 0);
  let ultMesDados = 0; recMes.forEach((v, i) => { if (v > 0) ultMesDados = i + 1; });
  const nMeses = Math.max(ultMesDados, ano < anoHoje ? 12 : 0);
  const proj = ano < anoHoje ? rec : (nMeses >= 2 ? rec / nMeses * 12 : rec);
  const metaRec = Number(metas && metas.receitas) || 0;
  const metaMes = metaRec / 12;
  const recAntes = Array.from({ length: Math.max(1, nMeses) }, (_, i) => recDe(ano - 1, i + 1)).reduce((a, v) => a + v, 0);
  const poupado = (Number(totais.investAnual) || 0) + (Number(totais.amortAnual) || 0);
  // Impostos (só há previsão para o ano corrente)
  const pi = ano === anoHoje ? impostos : null;
  const pagosAno = (G.impostosPagos || []).filter(p => String(p.data || '').startsWith(`${ano}-`)).reduce((a, p) => a + (Number(p.valor) || 0), 0);
  // Património financeiro (investimentos + dinheiro): fim do ano anterior → último registo do ano
  const pIni = [...serie].reverse().find(s => s.idx <= ano * 12 - 1) || serie.find(s => Math.floor(s.idx / 12) === ano) || null;
  const pFim = [...serie].reverse().find(s => s.idx <= ano * 12 + 11 && Math.floor(s.idx / 12) === ano) || null;
  const dPat = pIni && pFim && pFim !== pIni ? pFim.capital - pIni.capital : null;
  // Clientes (sem reembolsos)
  const clis = Object.entries(totais.receitasPorCliente || {}).map(([id, c]) => ({ ...c, id })).filter(c => c.total > 0 && !ehNaoFaturacao(c)).sort((a, b) => b.total - a.total);
  const totCli = clis.reduce((a, c) => a + c.total, 0);
  // Horas: as do Trabalho (cronómetro/registos) quando existem; senão as escritas à mão
  let horasMao = 0; for (let m = 1; m <= 12; m++) horasMao += Number((M[`${ano}-${m}`] || {}).horasTrabalhadas) || 0;
  // Trabalho do ano: entregas, peças por tipo, jogos e subcontratação
  const tw = { horas: 0, horasCli: {}, valor: 0, n: 0, pecas: {}, jogos: {}, custoSub: 0, valorSub: 0 };
  const clientesG = G.clientes || [];
  const jogoDe = {}; ((trab && trab.pastas) || []).forEach(p => { if (p.jogoId) jogoDe[p.id] = p.jogoId; });
  ((trab && trab.tarefas) || []).forEach(t => {
    (t.tempos || []).forEach(x => { if (trabDia(x.ini).startsWith(`${ano}-`)) { const h = trabMsTempo(x) / 3600000; tw.horas += h; tw.horasCli[t.cid] = (tw.horasCli[t.cid] || 0) + h; } });
    if (!trabEntrega(t).startsWith(`${ano}-`)) return;
    const v = trabValor(t, G.clickup, clientesG);
    tw.valor += v; tw.n += 1;
    trabPecas(t).forEach(pc => { if (pc.tipo !== 'extra' && pc.tipo !== 'outro') tw.pecas[pc.tipo] = (tw.pecas[pc.tipo] || 0) + pc.n; });
    const j = jogoDe[t.pastaId]; if (j) tw.jogos[j] = (tw.jogos[j] || 0) + v;
    const c = Number(t.custoOutsourcing) || 0; if (c > 0) { tw.custoSub += c; tw.valorSub += v; }
  });
  const horas = tw.horas > 0 ? tw.horas : horasMao;
  const nomeTipo = id => { const x = CU_TIPOS.find(y => y.id === id); return x ? x : { nome: id, plural: id }; };
  const pecasTxt = Object.entries(tw.pecas).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${n} ${n === 1 ? (nomeTipo(id).curto || nomeTipo(id).nome).toLowerCase() : nomeTipo(id).plural}`);
  const jogosTop = Object.entries(tw.jogos).map(([id, v]) => ({ j: ((trab && trab.jogos) || []).find(x => x.id === id), v })).filter(x => x.j && x.v > 0).sort((a, b) => b.v - a.v);
  // Dívida
  const dIni = Number(totais.dividaInicio) || 0, dAtual = Number(totais.dividaAtual) || 0;

  // Frases do resumo
  const F = [];
  const bom = (t, ir, d) => F.push({ t, cor: 'text-emerald-400', s: '✓', ir, d });
  const aviso = (t, ir, d) => F.push({ t, cor: 'text-amber-400', s: '!', ir, d });
  const info = (t, ir, d) => F.push({ t, cor: sub, s: '•', ir, d });
  const mesesTxt = n => `${n} ${n === 1 ? 'mês' : 'meses'}`;
  const sinal = v => `${v >= 0 ? '+' : '−'}${f(Math.abs(v))}`;
  if (metaRec > 0 && rec > 0) {
    const faltaM = 12 - nMeses;
    const dMeta = ano < anoHoje
      ? { linhas: [['Faturado no ano', f(rec)], ['Meta', f(metaRec)], [rec >= metaRec ? 'Acima da meta' : 'Abaixo da meta', `${f(Math.abs(rec - metaRec))} (${pct(rec / metaRec * 100)})`, true]] }
      : { linhas: [[`Faturado até agora (${mesesTxt(nMeses)})`, f(rec)], ['Média por mês', f(nMeses ? rec / nMeses : 0)], ['Projeção (média × 12)', f(proj), true], ['Meta do ano', f(metaRec)], [proj >= metaRec ? 'Acima da meta' : 'Falta para a meta', f(Math.abs(proj - metaRec)), true]],
        nota: rec >= metaRec ? 'Já passaste a meta do ano.' : faltaM > 0 ? `Para chegar à meta faltam ${f(metaRec - rec)}: ${f((metaRec - rec) / faltaM)}/mês nos ${mesesTxt(faltaM)} que faltam (a tua média até agora é ${f(nMeses ? rec / nMeses : 0)}/mês).` : null };
    if (ano < anoHoje) (rec >= metaRec ? bom : aviso)(`Fechaste o ano com ${f(rec)}, ${pct(rec / metaRec * 100)} da meta de ${f(metaRec)}.`, 'performance', dMeta);
    else if (proj >= metaRec) bom(`Ao ritmo atual fechas o ano com cerca de ${f(proj)}: ${f(proj - metaRec)} acima da meta.`, 'performance', dMeta);
    else aviso(`Ao ritmo atual fechas o ano com cerca de ${f(proj)}: faltam ${f(metaRec - proj)} para a meta. Precisavas de ${f((metaRec - rec) / Math.max(1, 12 - nMeses))}/mês daqui para a frente.`, 'performance', dMeta);
  }
  if (recAntes > 0 && rec > 0) {
    const d = (rec - recAntes) / recAntes * 100;
    const nM = Math.max(1, nMeses);
    (d >= 0 ? bom : aviso)(`${d >= 0 ? '+' : '−'}${pct(Math.abs(d))} face ao mesmo período de ${ano - 1} (${f(recAntes)}).`, 'performance', {
      linhas: [[`${ano} (${meses[0].slice(0, 3).toLowerCase()}–${meses[nM - 1].slice(0, 3).toLowerCase()})`, f(rec)], [`${ano - 1} (os mesmos meses)`, f(recAntes)], ['Diferença', `${sinal(rec - recAntes)} (${d >= 0 ? '+' : '−'}${pct(Math.abs(d))})`, true]],
      tabela: { cab: ['', String(ano), String(ano - 1), ''], linhas: Array.from({ length: nM }, (_, i) => { const a = recMes[i], b = recDe(ano - 1, i + 1); return [meses[i].slice(0, 3), f(a), f(b), a === b ? '' : sinal(a - b)]; }) },
    });
  }
  const comDados = recMes.slice(0, nMeses).map((v, i) => ({ v, i })).filter(x => x.v > 0);
  if (comDados.length >= 3) {
    const best = comDados.reduce((a, b) => (b.v > a.v ? b : a)), worst = comDados.reduce((a, b) => (b.v < a.v ? b : a));
    const media = comDados.reduce((a, x) => a + x.v, 0) / comDados.length;
    info(`Melhor mês: ${meses[best.i]} (${f(best.v)}). Mais fraco: ${meses[worst.i]} (${f(worst.v)}).`, 'historico', {
      lista: comDados.map(x => ({ rot: meses[x.i], v: x.v, txt: `${f(x.v)}${x.v >= media ? '' : ` · ${f(media - x.v)} abaixo da média`}`, cor: x.i === best.i ? '#059669' : x.i === worst.i ? '#d97706' : '#3b82f6' })),
      nota: `Média dos ${mesesTxt(comDados.length)} com receitas: ${f(media)}/mês.`,
    });
  }
  if (clis.length && totCli > 0) {
    const s = clis[0].total / totCli * 100;
    const dCli = {
      lista: clis.map(c => ({ rot: c.nome, v: c.total, txt: `${f(c.total)} · ${pct(c.total / totCli * 100)}`, cor: c.cor || '#64748b' })),
      nota: clis.length > 1 ? `Sem ${clis[0].nome}, os outros ${clis.length - 1 === 1 ? 'cliente faturou' : `${clis.length - 1} clientes faturaram`} ${f(totCli - clis[0].total)}.` : `${clis[0].nome} é o único cliente deste ano.`,
    };
    if (s >= 60) aviso(`${clis[0].nome} vale ${pct(s)} do que faturaste: estás muito dependente de um cliente.`, 'receitas', dCli);
    else info(`O maior cliente (${clis[0].nome}) vale ${pct(s)} da faturação.`, 'receitas', dCli);
  }
  if (pi && pi.irsEstimado > 0) {
    const v = pi.irsAPagarReceber;
    (v >= 0 ? bom : aviso)(`IRS de ${ano}: com o que já foi retido, deves ${v >= 0 ? 'receber' : 'pagar'} cerca de ${f(Math.abs(v))} em ${ano + 1}.`, 'resumo', {
      linhas: [
        ['Recibos do ano (projeção até dezembro)', f(pi.recAnualIRS)],
        ['Rendimento coletável', f(pi.rendColetavel)],
        ['IRS estimado', f(pi.irsEstimado)],
        [`Já retido${pi.porConta > 0 ? ' e pago por conta' : ''}`, f(pi.irsRetencoes)],
        [v >= 0 ? `A receber em ${ano + 1}` : `A pagar em ${ano + 1}`, f(Math.abs(v)), true],
      ],
      nota: `É uma estimativa: projeta os recibos até ao fim do ano e usa os escalões de ${ano}${pi.irsCfg && pi.irsCfg.conjunto ? ', em tributação conjunta (com o rendimento da Sara)' : ''}. O valor certo só sai na declaração.${v < 0 && ano === anoHoje ? ` Se quiseres pô-lo de lado aos poucos: ${f(-v / Math.max(1, 12 - mesHoje + 1))}/mês até dezembro.` : ''}`,
    });
  }
  const liqAno = Number(totais.liquidoAnual) || 0;
  if (liqAno > 0 && poupado > 0) {
    const t = taxaPoupancaDe(poupado, liqAno);
    (t >= 20 ? bom : info)(`Puseste de lado ${f(poupado)} (investido + amortizado): ${pct(t)} do que ficou depois dos impostos.`, 'invest', {
      linhas: [['Investido', f(totais.investAnual)], ['Amortizado no crédito', f(totais.amortAnual)], ['Total posto de lado', f(poupado), true], ['O que ficou depois dos impostos', f(liqAno)], ['Taxa de poupança', pct(t), true]],
      nota: t > 100 ? 'Mais de 100%: puseste de lado mais do que o que entrou este ano depois dos impostos — usaste também dinheiro que já tinhas (ou de outras entradas, como reembolsos).' : `Por mês, em média: ${f(poupado / Math.max(1, nMeses))} postos de lado.`,
    });
  }
  if (dIni > 0 && dAtual > 0 && dIni > dAtual) bom(`A dívida da casa desceu ${f(dIni - dAtual)} este ano (agora ${f(dAtual)}).`, 'credito', {
    linhas: [['No início do ano', f(dIni)], ['Agora', f(dAtual)], ['Desceu', `${f(dIni - dAtual)} (${pct((dIni - dAtual) / dIni * 100)})`, true], ['Amortizado à parte este ano', f(totais.amortAnual)]],
    nota: 'A descida inclui as prestações normais (a parte de capital) e as amortizações extra.',
  });
  if (dPat != null) {
    const pts = serie.filter(x => x.idx >= pIni.idx && x.idx <= pFim.idx);
    (dPat >= 0 ? bom : aviso)(`Investimentos + dinheiro: ${dPat >= 0 ? '+' : '−'}${f(Math.abs(dPat))} desde ${patRotulo(pIni.idx)} (${f(pFim.capital)} em ${patRotulo(pFim.idx)}).`, 'patrimonio', {
      linhas: [[`Em ${patRotulo(pIni.idx)}`, f(pIni.capital)], [`Em ${patRotulo(pFim.idx)}`, f(pFim.capital)], ['Diferença', sinal(dPat), true], ['Investido este ano', f(totais.investAnual)]],
      lista: pts.map((x, k) => ({ rot: patRotulo(x.idx), v: x.capital, txt: `${f(x.capital)}${k ? ` (${sinal(x.capital - pts[k - 1].capital)})` : ''}`, cor: k && x.capital < pts[k - 1].capital ? '#d97706' : '#8b5cf6' })),
      nota: dPat < 0 && (Number(totais.investAnual) || 0) > 0 ? 'Desceu apesar do que investiste: a diferença vem da desvalorização dos investimentos (ou de dinheiro que saiu) nesse período.' : null,
    });
  }
  if (horas > 0 && rec > 0) {
    const porCli = tw.horas > 0 ? Object.entries(tw.horasCli).map(([cid, h]) => { const c = clis.find(x => String(x.id) === String(cid)) || clientesG.find(x => String(x.id) === String(cid)); const fat = (clis.find(x => String(x.id) === String(cid)) || {}).total || 0; return { rot: c ? c.nome : 'Sem cliente', v: h, txt: `${Math.round(h)} h${fat > 0 && h > 0 ? ` · ${_fmtEUR.format(fat / h)}/h` : ''}`, cor: (c && c.cor) || '#64748b' }; }).filter(x => x.v >= 0.5).sort((a, b) => b.v - a.v) : [];
    info(`${Math.round(horas)} h trabalhadas${tw.horas > 0 ? ' (registadas no Trabalho)' : ''} · ${_fmtEUR.format(rec / horas)}/h faturado.`, tw.horas > 0 ? 'trabalho' : 'performance', {
      linhas: [['Horas', `${Math.round(horas)} h`], ['Faturado', f(rec)], ['Por hora', `${_fmtEUR.format(rec / horas)}/h`, true], ['Por mês, em média', `${Math.round(horas / Math.max(1, nMeses))} h`]],
      lista: porCli,
      nota: porCli.length ? 'Por cliente: as horas registadas e o que cada um te pagou por hora.' : null,
    });
  }
  if (pecasTxt.length) info(`Entregaste ${pecasTxt.slice(0, 3).join(', ')}${pecasTxt.length > 3 ? ' e mais' : ''}.`, 'trabalho', {
    lista: Object.entries(tw.pecas).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ rot: nomeTipo(id).plural ? nomeTipo(id).plural.charAt(0).toUpperCase() + nomeTipo(id).plural.slice(1) : id, v: n, txt: String(n), cor: '#0ea5e9' })),
    linhas: [['Tarefas entregues', String(tw.n)], ['Valor pelos preços', f(tw.valor)]],
  });
  if (jogosTop.length) info(`O jogo que mais rendeu foi ${jogosTop[0].j.nome} (${f(jogosTop[0].v)}).`, 'trabalho', {
    lista: jogosTop.map(({ j, v }) => ({ rot: j.nome, v, txt: `${f(v)} · ${pct(v / Math.max(1, tw.valor) * 100)}`, cor: j.cor || '#64748b' })),
    nota: 'Pelos preços das tarefas entregues este ano (a percentagem é do total entregue).',
  });
  if (tw.custoSub > 0) info(`Subcontrataste ${f(tw.custoSub)}: margem de ${f(tw.valorSub - tw.custoSub)} nesse trabalho.`, 'trabalho', {
    linhas: [['Valor desse trabalho (pelos preços)', f(tw.valorSub)], ['Pago a freelancers', f(tw.custoSub)], ['Margem', `${f(tw.valorSub - tw.custoSub)} (${pct((tw.valorSub - tw.custoSub) / Math.max(1, tw.valorSub) * 100)})`, true]],
  });

  // Mês a mês: o ano anterior ao lado, o mês em curso à parte e uns números por baixo
  const recAnt = Array.from({ length: 12 }, (_, i) => recDe(ano - 1, i + 1));
  const temAnt = recAnt.some(v => v > 0);
  const mesCurso = ano === anoHoje ? mesHoje - 1 : -1; // índice do mês que ainda não acabou
  const fechados = recMes.map((v, i) => ({ v, i })).filter(x => x.i < ateMes && x.i !== mesCurso && x.v > 0);
  const melhorM = fechados.length ? fechados.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const mediaM = fechados.length ? fechados.reduce((a, x) => a + x.v, 0) / fechados.length : 0;
  const naMeta = metaMes > 0 ? fechados.filter(x => x.v >= metaMes).length : 0;
  const corAnt = claro ? '#cbd5e1' : '#475569';
  const ritmoOk = metaRec > 0 && proj >= metaRec;
  const metasL = [
    { l: 'Faturação', v: rec, m: metaRec, cor: '#3b82f6' },
    { l: 'Investimentos', v: Number(totais.investAnual) || 0, m: Number(metas && metas.investimentos) || 0, cor: '#8b5cf6' },
    { l: 'Amortização', v: Number(totais.amortAnual) || 0, m: Number(metas && metas.amortizacao) || 0, cor: '#10b981' },
  ].filter(x => x.m > 0);
  const fracao = ano < anoHoje ? 1 : ano === anoHoje ? (mesHoje - 1 + hoje.getDate() / 31) / 12 : 0;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h2 className={`text-xl sm:text-2xl font-bold ${forte}`}>O meu {ano}</h2>
        <p className={`text-sm ${sub}`}>{ano === anoHoje ? `Até ${hoje.getDate()} de ${meses[mesHoje - 1].toLowerCase()} · ${nMeses} ${nMeses === 1 ? 'mês' : 'meses'} com receitas` : ano < anoHoje ? 'Ano fechado' : 'Ano ainda por começar'}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AnoNum onIr={onIr} rot="Faturado" val={f(rec)} ir="receitas"
          barra={metaRec > 0 ? <div className="mt-2"><AnoBarra v={rec / metaRec * 100} cor="#3b82f6" /></div> : null}
          nota={metaRec > 0 ? `${pct(rec / metaRec * 100)} da meta de ${f(metaRec)}` : 'Sem meta definida'} />
        <AnoNum onIr={onIr} rot={ano < anoHoje ? 'Total do ano' : 'Projeção para o ano'} val={f(proj)} cor={metaRec > 0 ? (ritmoOk ? 'text-emerald-400' : 'text-amber-400') : undefined} ir="performance"
          nota={metaRec > 0 ? (ritmoOk ? `No ritmo certo · +${f(proj - metaRec)} acima da meta` : `Abaixo do ritmo · faltam ${f(metaRec - proj)}`) : `${nMeses} meses de dados`} />
        <AnoNum onIr={onIr} rot={`Impostos de ${ano}`} val={pi ? f(pi.totalImpostos) : '—'} cor="text-orange-400" ir="impostos"
          nota={pi ? `SS ${f(pi.ssAnual)} · IVA ${f(pi.ivaAPagar)} · IRS ${f(pi.irsEstimado)}` : pagosAno > 0 ? `Pagaste ${f(pagosAno)} durante ${ano}` : 'Previsão só para o ano corrente'} />
        <AnoNum onIr={onIr} rot="Posto de lado" val={f(poupado)} cor="text-violet-400" ir="invest"
          nota={(Number(totais.liquidoAnual) || 0) > 0 ? `${pct(taxaPoupancaDe(poupado, Number(totais.liquidoAnual)))} do que ficou depois dos impostos · investido ${f(totais.investAnual)} + amortizado ${f(totais.amortAnual)}` : 'Investido + amortizado'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:items-start">
        <AnoCaixa className="lg:col-span-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className={`font-semibold ${forte}`}><Ico e="📊"/>Mês a mês</h3>
            <AnoVer onIr={onIr} tab="performance" />
          </div>
          <GraficoBarras height={260} aria={`Faturação por mês em ${ano}${temAnt ? ` e em ${ano - 1}` : ''}`}
            rotulos={meses.map(m => m.slice(0, 3))}
            series={[
              ...(temAnt ? [{ nome: String(ano - 1), valores: recAnt, cor: corAnt }] : []),
              { nome: String(ano), valores: recMes, cor: (i, v) => (i >= ateMes ? '#64748b' : i === mesCurso ? '#3b82f6' : metaMes > 0 ? (v >= metaMes ? '#059669' : '#d97706') : '#3b82f6') },
            ]}
            referencia={metaMes > 0 ? { valor: metaMes, nome: 'Meta mensal' } : null}
            tituloTip={i => `${meses[i]}${i === mesCurso ? ' (em curso)' : ''}`}
            extraTip={i => (temAnt && recAnt[i] > 0 && i < ateMes && i !== mesCurso ? [{ nome: `vs ${ano - 1}`, valor: `${recMes[i] >= recAnt[i] ? '+' : '−'}${pct(Math.abs(recMes[i] - recAnt[i]) / recAnt[i] * 100)}` }] : [])}
            apagado={i => i >= ateMes} />
          <div className={`flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-xs ${sub}`}>
            {metaMes > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#059669' }} />Acima da meta</span>}
            {metaMes > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#d97706' }} />Abaixo</span>}
            {mesCurso >= 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#3b82f6' }} />Em curso</span>}
            {temAnt && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: corAnt }} />{ano - 1}</span>}
            {metaMes > 0 && <span>– – Meta mensal {f(metaMes)}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {[
              ['Média por mês', fechados.length ? f(mediaM) : '—', fechados.length ? `${fechados.length} ${fechados.length === 1 ? 'mês fechado' : 'meses fechados'}` : ''],
              ['Melhor mês', melhorM ? f(melhorM.v) : '—', melhorM ? meses[melhorM.i] : ''],
              metaMes > 0 ? ['Meses na meta', fechados.length ? `${naMeta} de ${fechados.length}` : '—', `meta de ${f(metaMes)}/mês`] : ['Total do ano', f(rec), ''],
              recAntes > 0 ? [`Face a ${ano - 1}`, `${rec >= recAntes ? '+' : '−'}${pct(Math.abs(rec - recAntes) / recAntes * 100)}`, `${f(recAntes)} no mesmo período`] : ['Projeção', f(proj), ano === anoHoje ? 'ao ritmo atual' : ''],
            ].map(([r, v, n]) => (
              <div key={r} className={`rounded-xl px-3 py-2 ${claro ? 'bg-slate-50' : 'bg-white/[0.03]'}`}>
                <p className={`text-[11px] ${sub}`}>{r}</p>
                <p className={`text-base font-semibold tabular-nums ${forte}`}>{v}</p>
                {n && <p className={`text-[11px] truncate ${sub}`}>{n}</p>}
              </div>
            ))}
          </div>
        </AnoCaixa>
        <AnoCaixa className="lg:col-span-2">
          <h3 className={`font-semibold mb-3 ${forte}`}><Ico e="💬"/>Em resumo</h3>
          {F.length ? (
            <ul className="space-y-2.5">
              {F.map((x, i) => (
                <li key={i} className="text-sm leading-snug">
                  {x.d ? (
                    <button type="button" onClick={() => setInsAberto(a => (a === i ? null : i))} aria-expanded={insAberto === i} title={insAberto === i ? 'Fechar' : 'Ver os números'}
                      className={`group w-full flex gap-2.5 text-left rounded-lg -mx-1.5 px-1.5 py-1 -my-1 ${insAberto === i ? (claro ? 'bg-slate-100' : 'bg-white/5') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${x.cor} ${claro ? 'bg-slate-100' : 'bg-slate-700/60'}`}>{x.s}</span>
                      <span className={`flex-1 ${claro ? 'text-slate-700' : 'text-slate-200'}`}>{x.t}</span>
                      <svg width="10" height="10" viewBox="0 0 12 12" className={`flex-shrink-0 mt-1.5 transition-transform ${sub} ${insAberto === i ? '' : 'opacity-40 group-hover:opacity-100'}`} style={{ transform: insAberto === i ? 'rotate(90deg)' : 'none' }} aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  ) : (
                    <div className="flex gap-2.5">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${x.cor} ${claro ? 'bg-slate-100' : 'bg-slate-700/60'}`}>{x.s}</span>
                      <span className={claro ? 'text-slate-700' : 'text-slate-200'}>{x.t}</span>
                    </div>
                  )}
                  {x.d && insAberto === i && <AnoDetalhe d={x.d} ir={x.ir} onIr={onIr} />}
                </li>
              ))}
            </ul>
          ) : <p className={`text-sm ${sub}`}>Ainda não há dados suficientes para este ano.</p>}
        </AnoCaixa>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnoCaixa>
          <div className="flex items-center justify-between gap-2 mb-3"><h3 className={`font-semibold ${forte}`}><Ico e="🎯"/>Metas</h3>{onMeta ? <button onClick={() => setEditarMetas(v => !v)} className="text-xs text-blue-400 hover:text-blue-300">{editarMetas ? 'feito' : 'editar'}</button> : <AnoVer onIr={onIr} tab="resumo" t="editar" />}</div>
          {editarMetas && onMeta ? (
            <div className="space-y-2.5">
              {[['receitas', 'Faturação (€)'], ['investimentos', 'Investimentos (€)'], ['amortizacao', 'Amortização (€)'], ['horasMensais', 'Horas por mês']].map(([k, rot]) => (
                <label key={k} className="flex items-center justify-between gap-3 text-sm">
                  <span className={sub}>{rot}</span>
                  <StableInput key={`meta-ano-${k}-${ano}`} type="number" initialValue={Number(metas && metas[k]) || 0} onSave={v => onMeta(k, Math.max(0, Number(v) || 0))}
                    className={`w-28 rounded-lg px-2 py-1 text-right tabular-nums border ${claro ? 'bg-white border-slate-300' : 'bg-slate-900/60 border-slate-600'}`} />
                </label>
              ))}
              <p className={`text-[11px] ${sub}`}>Metas de {ano}. Gravam quando sais do campo.</p>
            </div>
          ) : metasL.length ? (
            <div className="space-y-3">
              {metasL.map(x => {
                const p = x.v / x.m * 100, esperado = fracao * 100;
                return (
                  <div key={x.l}>
                    <div className="flex justify-between text-sm mb-1"><span>{x.l}</span><span className="tabular-nums"><span className={forte}>{f(x.v)}</span> <span className={sub}>/ {f(x.m)}</span></span></div>
                    <AnoBarra v={p} cor={x.cor} />
                    <p className={`text-[11px] mt-1 ${p >= esperado - 5 ? 'text-emerald-400' : 'text-amber-400'}`}>{pct(p)}{ano === anoHoje ? ` · devias ir em ~${pct(esperado)}` : ''}</p>
                  </div>
                );
              })}
            </div>
          ) : <p className={`text-sm ${sub}`}>Ainda não tens metas para {ano} — carrega em «editar».</p>}
        </AnoCaixa>
        <AnoCaixa>
          <div className="flex items-center justify-between gap-2 mb-3"><h3 className={`font-semibold ${forte}`}><Ico e="🏛"/>Património</h3><AnoVer onIr={onIr} tab="patrimonio" /></div>
          {pFim ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className={`text-xs ${sub}`}>Investimentos + dinheiro ({patRotulo(pFim.idx)})</p>
                <p className={`text-xl font-bold tabular-nums ${forte}`}>{f(pFim.capital)}</p>
                {dPat != null && <p className={`text-xs ${dPat >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{dPat >= 0 ? '+' : '−'}{f(Math.abs(dPat))}{pIni.capital > 0 ? ` (${dPat >= 0 ? '+' : '−'}${pct(Math.abs(dPat) / pIni.capital * 100)})` : ''} desde {patRotulo(pIni.idx)}</p>}
              </div>
              {dAtual > 0 && (
                <div>
                  <p className={`text-xs ${sub}`}>Dívida da casa</p>
                  <p className={`text-xl font-bold tabular-nums ${forte}`}>{f(dAtual)}</p>
                  {dIni > dAtual && <p className="text-xs text-emerald-400">−{f(dIni - dAtual)} desde janeiro</p>}
                </div>
              )}
            </div>
          ) : <p className={`text-sm ${sub}`}>Atualiza o Património para veres a evolução.</p>}
        </AnoCaixa>
        <AnoCaixa>
          <div className="flex items-center justify-between gap-2 mb-3"><h3 className={`font-semibold ${forte}`}><Ico e="👥"/>Clientes</h3><AnoVer onIr={onIr} tab="receitas" /></div>
          {clis.length ? (
            <div className="space-y-2.5">
              {clis.slice(0, 4).map(c => (
                <div key={c.nome}>
                  <div className="flex justify-between text-sm mb-1"><span className="flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.cor || '#64748b' }} /><span className="truncate">{c.nome}</span></span><span className="tabular-nums">{f(c.total)} <span className={`text-xs ${sub}`}>{pct(c.total / totCli * 100)}</span></span></div>
                  <AnoBarra v={c.total / totCli * 100} cor={c.cor || '#64748b'} />
                </div>
              ))}
              {clis.length > 4 && <p className={`text-xs ${sub}`}>+{clis.length - 4} outros</p>}
              {horas > 0 && <p className={`text-xs pt-1 ${sub}`} title="€/h faturado = o que faturaste ÷ as horas registadas">{Math.round(horas)} h trabalhadas · {_fmtEUR.format(rec / horas)}/h faturado</p>}
              {tw.horas > 0 && clis.some(c => tw.horasCli[c.id] > 0) && <p className={`text-xs ${sub}`}>€/h faturado por cliente: {clis.filter(c => tw.horasCli[c.id] > 0).slice(0, 4).map(c => `${c.nome} ${_fmtEUR.format(c.total / tw.horasCli[c.id])}`).join(' · ')}</p>}
            </div>
          ) : <p className={`text-sm ${sub}`}>Sem recibos neste ano.</p>}
        </AnoCaixa>
      </div>

      {tw.n > 0 && (
        <AnoCaixa>
          <div className="flex items-center justify-between gap-2 mb-3"><h3 className={`font-semibold ${forte}`}><Ico e="🗂"/>Trabalho de {ano}</h3><AnoVer onIr={onIr} tab="trabalho" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <p className={`text-xs ${sub}`}>Entregue (pelos preços)</p>
              <p className={`text-xl font-bold tabular-nums ${forte}`}>{f(tw.valor)}</p>
              <p className={`text-xs ${sub}`}>{tw.n} tarefa{tw.n === 1 ? '' : 's'}{tw.horas > 0 ? ` · ${Math.round(tw.horas)} h registadas` : ''}</p>
            </div>
            <div>
              <p className={`text-xs mb-1 ${sub}`}>Peças entregues</p>
              {pecasTxt.length ? <ul className={`text-sm space-y-0.5 ${forte}`}>{pecasTxt.slice(0, 5).map(x => <li key={x}>{x}</li>)}</ul> : <p className={`text-sm ${sub}`}>—</p>}
            </div>
            <div>
              <p className={`text-xs mb-1 ${sub}`}>Jogos que mais renderam</p>
              {jogosTop.length ? (
                <div className="space-y-1.5">
                  {jogosTop.slice(0, verJogos ? jogosTop.length : 4).map(({ j, v }) => (
                    <div key={j.id}>
                      <div className="flex justify-between text-sm"><span className="flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: j.cor || '#64748b' }} /><span className={`truncate ${forte}`}>{j.nome}</span></span><span className={`tabular-nums ${forte}`}>{f(v)}</span></div>
                      <AnoBarra v={v / jogosTop[0].v * 100} cor={j.cor || '#64748b'} />
                    </div>
                  ))}
                  {jogosTop.length > 4 && <button type="button" onClick={() => setVerJogos(v => !v)} aria-expanded={verJogos} className="text-xs text-blue-400 hover:text-blue-300">{verJogos ? 'Ver menos' : `Ver mais (${jogosTop.length - 4})`}</button>}
                </div>
              ) : <p className={`text-sm ${sub}`}>Liga as listas aos jogos no Trabalho para veres aqui.</p>}
            </div>
            <div>
              <p className={`text-xs ${sub}`}>Subcontratado</p>
              <p className={`text-xl font-bold tabular-nums ${tw.custoSub > 0 ? 'text-red-400' : forte}`}>{tw.custoSub > 0 ? `−${f(tw.custoSub)}` : f(0)}</p>
              <p className={`text-xs ${sub}`}>{tw.custoSub > 0 ? `Margem nesse trabalho: ${f(tw.valorSub - tw.custoSub)} (${pct((tw.valorSub - tw.custoSub) / Math.max(1, tw.valorSub) * 100)})` : 'Nada subcontratado este ano'}</p>
            </div>
          </div>
        </AnoCaixa>
      )}
      <EuroHoraClientes trab={trab} G={G} ano={ano} claro={claro} />
    </div>
  );
};

const CSS_BASE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Emoji:wght@400..700&display=swap');
/* Emojis da app em versão "de linha", de uma só cor (seguem a cor do texto), como os ícones — em vez dos coloridos */
body, button, input, select, textarea { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Emoji', sans-serif; }
/* O que tu escreves nas notas mantém os emojis a cores */
.emoji-cor, .emoji-cor * { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
body { font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.text-\\[8px\\], .text-\\[9px\\] { font-size: 10.5px !important; line-height: 1.3 !important; }
.text-\\[10px\\], .text-\\[11px\\] { font-size: 12px !important; line-height: 1.35 !important; }
html[data-tema="escuro"] .text-slate-500 { color: #8a97ab; }
html[data-tema="escuro"] .text-slate-600 { color: #6f7d93; }
html[data-tema="escuro"] .placeholder-slate-500::placeholder, html[data-tema="escuro"] input::placeholder, html[data-tema="escuro"] textarea::placeholder { color: #7c899e; }
html[data-tema="claro"] .text-slate-400 { color: #6b7789; }
/* Tema claro: textos coloridos (-400) ficavam pálidos no fundo branco; usa o tom mais escuro */
html[data-tema="claro"] .text-emerald-400 { color: #059669; } html[data-tema="claro"] .text-green-400 { color: #16a34a; }
html[data-tema="claro"] .text-amber-400 { color: #b45309; } html[data-tema="claro"] .text-yellow-400 { color: #a16207; }
html[data-tema="claro"] .text-orange-400 { color: #ea580c; } html[data-tema="claro"] .text-red-400 { color: #dc2626; }
html[data-tema="claro"] .text-violet-400 { color: #7c3aed; } html[data-tema="claro"] .text-purple-400 { color: #9333ea; }
html[data-tema="claro"] .text-blue-400 { color: #2563eb; } html[data-tema="claro"] .text-cyan-400 { color: #0891b2; }
html[data-tema="claro"] .text-pink-400 { color: #db2777; } html[data-tema="claro"] .text-teal-400 { color: #0d9488; }
/* Computador (ecrãs largos): as páginas compridas passam a 2 colunas */
@media (min-width: 1280px) {
  .pag-2col { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; align-items: start; }
  .pag-2col.pag-2col > * { margin-top: 0 !important; margin-bottom: 0 !important; }
  .pag-2col > .col-toda { grid-column: 1 / -1; }
  .pag-2col > .col-esq { grid-column: 1; }
  .pag-2col > .col-dir { grid-column: 2; grid-row: 2 / span 3; }
}
/* Os tons -300 (feitos para o tema escuro) também ficavam quase invisíveis no branco */
html[data-tema="claro"] .text-amber-300, html[data-tema="claro"] .text-yellow-300 { color: #b45309; } html[data-tema="claro"] .text-emerald-300, html[data-tema="claro"] .text-green-300 { color: #047857; }
html[data-tema="claro"] .text-blue-300, html[data-tema="claro"] .text-sky-300 { color: #1d4ed8; } html[data-tema="claro"] .text-red-300 { color: #b91c1c; } html[data-tema="claro"] .text-orange-300 { color: #c2410c; }
html[data-tema="claro"] .text-purple-300 { color: #7e22ce; } html[data-tema="claro"] .text-violet-300 { color: #6d28d9; } html[data-tema="claro"] .text-cyan-300 { color: #0e7490; } html[data-tema="claro"] .text-pink-300 { color: #be185d; }
.ico { width: 1.05em; height: 1.05em; display: inline-block; vertical-align: -0.16em; margin-right: .45em; flex-shrink: 0; opacity: .85; }
.ico-nav { margin-right: .35em; }
.ico-solo { margin-right: 0; }
/* Caixas dentro de cartões: só o fundo, sem contorno (menos linhas — o aspeto de «O meu ano») */
html[data-tema="escuro"] .tile { background: rgba(15, 23, 42, .42); border: 1px solid transparent; }
html[data-tema="claro"] .tile { background: #f1f5f9; border: 1px solid transparent; }
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

/* Painel no telemóvel: cartões secundários escondidos até carregar em "Ver mais" */
@media (max-width:639px) { .m-mais-fechado .m-mais { display: none !important; } }
/* Os controlos do browser (calendários das datas, meses, horas, listas) seguem o tema da app: ícones brancos no escuro.
   (O index.css invertia só o ícone das datas — com o tema certo já não é preciso.) */
html input[type="date"]::-webkit-calendar-picker-indicator, html input[type="month"]::-webkit-calendar-picker-indicator,
html input[type="datetime-local"]::-webkit-calendar-picker-indicator, html input[type="time"]::-webkit-calendar-picker-indicator { filter: none; opacity: .8; cursor: pointer; }
/* Ecrãs tácteis: botões que só aparecem ao passar o rato ficam sempre visíveis */
@media (hover: none) { .group .group-hover\\:opacity-100, .group .group-hover\\:opacity-70 { opacity: 1 !important; } }
`;

// Botão "Manter sempre ligado" para a conta do Drive dos recibos (usa as funções do Trabalho, carregadas só quando é preciso)
const LigacaoDriveRecibos = ({ conta, carregar, showToast }) => {
  const [mod, setMod] = useState(null);
  const [ligado, setLigado] = useState(false);
  const [aLigar, setALigar] = useState(false);
  useEffect(() => { let vivo = true; carregar().then(async m => { if (!vivo) return; setMod(m); m.carregarGis().catch(() => {}); await m.sincronizarSempre(); if (vivo) setLigado(m.ligadoSempre(conta || '_')); }).catch(() => {}); return () => { vivo = false; }; }, [conta]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mod) return null;
  return ligado
    ? <p className="text-xs text-emerald-500"><Ico e="🔒"/>Ligado ao Drive{conta ? ` (${conta})` : ''} · <button className="underline text-slate-500 hover:text-red-400" onClick={async () => { try { await mod.desligarDriveSempre(conta); setLigado(false); } catch (e) { showToast(e.message || String(e), 'error'); } }}>Desligar</button></p>
    : <button disabled={aLigar} onClick={async () => { setALigar(true); try { const j = await mod.ligarDriveSempre(conta); setLigado(true); showToast(`Drive ligado${j.email ? ` (${j.email})` : ''} — os recibos passam a ir sozinhos`); } catch (e) { showToast(e.message || String(e), 'error'); } setALigar(false); }}
        className="px-2.5 py-1 text-xs rounded-lg border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"><Ico e="🔒"/>Manter sempre ligado</button>;
};
// Recibos verdes ↔ Google Drive. Corre sozinho (ao abrir a app, ao voltar à janela, de 10 em 10 minutos) e no botão
// «Sincronizar agora»: envia para o Drive os recibos com PDF que lá faltam, e os PDFs que só estão no Drive juntam-se
// ao registo certo em Receitas (o mesmo cliente e valor, perto da data). Os que não dá para saber ficam numa lista.
let ULTIMO_ID_REC = 0;
const novoIdRecibo = () => { const t = Date.now(); ULTIMO_ID_REC = t > ULTIMO_ID_REC ? t : ULTIMO_ID_REC + 1; return ULTIMO_ID_REC; };
const DRIVE_REC_FALHAS = new Set(); // recibos com PDF que não deu para abrir (para não tentar sempre)
const idDriveDe = u => (/\/d\/([A-Za-z0-9_-]{10,})/.exec(String(u || '')) || [])[1] || null;
const dataDoRecibo = (d, nome) => (d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.data || '')) ? d.data : '') || ((/(\d{4}-\d{2}-\d{2})/.exec(String(nome || '')) || [])[1] || '');
// O registo de Receitas a que um recibo verde pertence (ou porque não deu para saber)
const alvoReciboDrive = (M, clientes, d, nomeFich, usados) => {
  const v = d ? Number(d.valorIliquido) || 0 : 0;
  const dataR = dataDoRecibo(d, nomeFich);
  if (!d) return { motivo: 'a IA não conseguiu ler o PDF' };
  if (!(v > 0) || !dataR) return { motivo: 'não consegui ler o valor ou a data' };
  const c = clienteDoNome(clientes, d.nomeCliente);
  const tR = Date.parse(dataR); const [y0, m0] = dataR.split('-').map(Number); const mR = y0 * 12 + m0 - 1;
  const cands = [];
  Object.entries(M || {}).forEach(([k, md]) => {
    const [ya, ma] = k.split('-').map(Number); if (!ya || !ma || !md) return;
    const dm = ya * 12 + ma - 1 - mR; if (dm < -2 || dm > 3) return;
    [['regCom', md.regCom], ['regSem', md.regSem]].forEach(([lista, l]) => (l || []).forEach(x => {
      if (usados.has(`${k}:${x.id}`) || x.driveUrl) return;
      if (c && String(x.cid) !== String(c.id)) return;
      // já tem o PDF do recibo na app (o PDF da fatura não conta): este ficheiro do Drive é esse mesmo — só fica ligado
      const soLigar = !!((x.ficheiro || x.ficheiroUrl) && (x.reciboVerde || !x.faturaId));
      if (Math.abs((Number(x.valIliq ?? x.val) || 0) - v) > 1) return;
      const dias = /^\d{4}-\d{2}-\d{2}/.test(String(x.data || '')) ? Math.abs(Date.parse(String(x.data).slice(0, 10)) - tR) / 864e5 : null;
      const forte = dias != null && dias <= 5;
      if ((!c || soLigar) && !forte) return; // sem saber o cliente (ou se já tem PDF), só com o mesmo valor e a mesma data
      if (!forte && (dm < -1 || dm > 2)) return;
      cands.push({ k, lista, r: x, soLigar, p: forte ? dias : 10 + Math.abs(dm) });
    }));
  });
  cands.sort((a, b) => a.p - b.p);
  if (cands.length === 1 || (cands.length > 1 && cands[0].p < cands[1].p)) return { alvo: cands[0], c, v, dataR };
  return { c, v, dataR, motivo: cands.length > 1 ? 'há mais do que um registo com este valor' : !c ? `não sei de que cliente é${d.nomeCliente ? ` («${d.nomeCliente}»)` : ''}` : 'ainda não há um registo com este valor em Receitas' };
};
const sincronizarRecibosComDrive = async ({ cfg, M, clientes, mod, ignorados = [], pendAntes = [], onEnviar, onJuntar, progresso = () => {} }) => {
  const regs = [];
  Object.entries(M || {}).forEach(([k, md]) => [['regCom', md && md.regCom], ['regSem', md && md.regSem]].forEach(([lista, l]) => (l || []).forEach(r => regs.push({ k, lista, r }))));
  // 1) Drive → app
  progresso('A ver a pasta dos recibos no Drive…');
  const todosDrive = await mod.listarRecibosDrive({ pastaUrl: cfg.pasta, conta: cfg.conta });
  // só os anos que a app tem (os recibos de anos antigos, sem registos, não interessam)
  const anosApp = Object.entries(M || {}).filter(([, md]) => md && ((md.regCom || []).length || (md.regSem || []).length)).map(([k]) => Number(k.split('-')[0])).filter(Boolean);
  const anoMin = anosApp.length ? Math.min(...anosApp) : new Date().getFullYear();
  const noDrive = todosDrive.filter(f => { const segAno = (f.caminho || []).map(x => String(x).trim()).find(x => /^\d{4}$/.test(x)); const a = segAno ? Number(segAno) : Number(String(f.modifiedTime || '').slice(0, 4)) || Number((/(20\d{2})/.exec(f.name) || [])[1]) || 0; return a >= anoMin; });
  // Depois de juntar um recibo do Drive ao registo, fica arrumado em Cliente / Ano / Trimestre
  // (o trimestre é o da data do recibo)
  const arrumar = async (f, data, r0) => { const r = r0 || { cid: null }; const cl = (clientes || []).find(c => String(c.id) === String(r.cid)); if (!cl || !mod.arrumarNoDrive || !data) return; try { await mod.arrumarNoDrive({ conta: cfg.conta, pastaUrl: cfg.pasta, fileId: f.id, cliente: cl.nome, data }); } catch (e) { /* fica onde está */ } };
  const ligadosId = new Set(regs.map(x => idDriveDe(x.r.driveUrl)).filter(Boolean));
  const ligadosNome = new Set(regs.map(x => x.r.driveNome).filter(Boolean));
  // O mesmo PDF duas vezes no Drive (ex.: uma cópia enviada antes de a app o reconhecer): mesmo tamanho que um já ligado
  const tamLigado = new Map(todosDrive.filter(f => (ligadosId.has(f.id) || ligadosNome.has(f.name)) && Number(f.size)).map(f => [Number(f.size), f]));
  const copias = [];
  const soltos = noDrive.filter(f => {
    if (ligadosId.has(f.id) || ligadosNome.has(f.name) || ignorados.includes(f.id)) return false;
    const igual = Number(f.size) && tamLigado.get(Number(f.size));
    if (igual && igual.id !== f.id) { copias.push({ id: f.id, nome: f.name, url: f.webViewLink, igualA: igual.name }); return false; }
    return true;
  });
  // o que a IA já leu noutras vezes (os que ficaram por juntar) não volta a ser lido
  const lidos = new Map(pendAntes.map(p => [p.id, p.d || null]));
  const ficheiros = new Map();
  const porLer = soltos.filter(f => !lidos.has(f.id));
  let n = 0;
  const fila = [...porLer];
  const ler = async () => { for (let f = fila.shift(); f; f = fila.shift()) { n += 1; progresso(`A ler os recibos novos do Drive (${n} de ${porLer.length})…`); let file = null, d = null; try { file = await mod.ficheiroDoDrive(cfg.conta, f); ficheiros.set(f.id, file); d = await mod.lerFaturaIA(file); } catch (e) { /* fica por juntar */ } lidos.set(f.id, d ? { nomeCliente: d.nomeCliente || '', descricao: d.descricao || '', valorIliquido: Number(d.valorIliquido) || 0, valorIva: Number(d.valorIva) || 0, taxaIva: d.taxaIva != null ? Number(d.taxaIva) || 0 : null, retencaoIRS: Number(d.retencaoIRS) || 0, pais: d.pais || '', data: d.data || '' } : null); } };
  await Promise.all([ler(), ler(), ler()]);
  let juntos = 0, ligados = 0; const semPar = []; const usados = new Set();
  for (const f of soltos) {
    const d = lidos.get(f.id) || null;
    const res = alvoReciboDrive(M, clientes, d, f.name, usados);
    if (res.alvo) {
      const { k, r } = res.alvo;
      usados.add(`${k}:${r.id}`);
      if (res.alvo.soLigar) { await onJuntar(k, r.id, { driveUrl: f.webViewLink, driveNome: f.name, dataRecibo: res.dataR }, null); ligados += 1; await arrumar(f, res.dataR, r); continue; }
      let file = ficheiros.get(f.id) || null;
      if (!file) { try { file = await mod.ficheiroDoDrive(cfg.conta, f); } catch (e) { file = null; } }
      const valores = r.reciboVerde ? {} : { val: res.v, valIliq: res.v, iva: Number(d.valorIva) || 0, ...(d.taxaIva != null ? { taxaIva: Number(d.taxaIva) || 0 } : {}), retIRS: Number(d.retencaoIRS) || 0, ...(d.pais ? { pais: d.pais } : {}), reciboVerde: true };
      await onJuntar(k, r.id, { ...valores, driveUrl: f.webViewLink, driveNome: f.name, dataRecibo: res.dataR }, file);
      juntos += 1;
      await arrumar(f, res.dataR, r);
    } else semPar.push({ id: f.id, nome: f.name, url: f.webViewLink, d, cid: res.c ? res.c.id : null, motivo: res.motivo, resumo: d ? `${d.nomeCliente || '?'} · ${res.v ? `${res.v.toFixed(2)} €` : 'sem valor'}${res.dataR ? ` · ${res.dataR}` : ''}` : '' });
  }
  // 2) App → Drive: os recibos com PDF que ainda não estão lá
  const faltam = regs.filter(x => (x.r.ficheiro || x.r.ficheiroUrl) && !x.r.driveUrl && (x.r.reciboVerde || !x.r.faturaId) && !usados.has(`${x.k}:${x.r.id}`) && !DRIVE_REC_FALHAS.has(`${x.k}:${x.r.id}`));
  let enviados = 0, semAcesso = 0; const usadosDrive = new Set();
  for (let i = 0; i < faltam.length; i++) {
    const { k, r } = faltam[i];
    progresso(`A enviar para o Drive os recibos que lá faltam (${i + 1} de ${faltam.length})…`);
    let f = null;
    try {
      if (r.ficheiro) { const [cab, dados] = String(r.ficheiro).split(','); const tipo = r.ficheiroTipo || ((/data:([^;]+)/.exec(cab) || [])[1]) || 'application/pdf'; const bin = atob(dados); const u8 = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j); f = new File([u8], r.ficheiroNome || 'recibo.pdf', { type: tipo }); }
      else { const res = await fetch(r.ficheiroUrl); if (res.ok) f = new File([await res.blob()], r.ficheiroNome || 'recibo.pdf', { type: r.ficheiroTipo || 'application/pdf' }); }
    } catch (e) { f = null; }
    if (!f) { semAcesso += 1; DRIVE_REC_FALHAS.add(`${k}:${r.id}`); continue; }
    // já está no Drive (um PDF com exatamente o mesmo tamanho, ainda sem dono): liga-se a esse, não vai outra cópia
    const mesmo = soltos.find(x => Number(x.size) === f.size && !semPar.some(y => y.id === x.id && y.cid != null && String(y.cid) !== String(r.cid)) && !usadosDrive.has(x.id));
    if (mesmo) { usadosDrive.add(mesmo.id); await onJuntar(k, r.id, { driveUrl: mesmo.webViewLink, driveNome: mesmo.name }, null); ligados += 1; const [ky, km] = String(k).split('-').map(Number); await arrumar(mesmo, /^\d{4}-\d{2}-\d{2}/.test(String(r.data || '')) ? String(r.data).slice(0, 10) : `${ky}-${String(km).padStart(2, '0')}-01`, r); const iP = semPar.findIndex(y => y.id === mesmo.id); if (iP >= 0) semPar.splice(iP, 1); continue; }
    if (await onEnviar(k, r.id, f, r)) enviados += 1; else DRIVE_REC_FALHAS.add(`${k}:${r.id}`);
  }
  return { juntos, ligados, enviados, semAcesso, semPar, lidos: porLer.length, copias };
};
const resumoRecibosDrive = (o, auto) => [o.juntos ? `${o.juntos} recibo${o.juntos === 1 ? '' : 's'} do Drive junto${o.juntos === 1 ? '' : 's'} aos registos em Receitas` : '', o.ligados ? `${o.ligados} já ${o.ligados === 1 ? 'tinha' : 'tinham'} o PDF — ${o.ligados === 1 ? 'ficou ligado' : 'ficaram ligados'} ao do Drive` : '', o.enviados ? `${o.enviados} enviado${o.enviados === 1 ? '' : 's'} para o Drive` : '', !auto && o.semAcesso ? `${o.semAcesso} com PDF que não consegui abrir para enviar` : '', o.semPar.length ? `${o.semPar.length} no Drive por juntar (Trabalho → cliente → Recibos)` : '', !auto && (o.copias || []).length ? `${o.copias.length} PDF${o.copias.length === 1 ? '' : 's'} repetido${o.copias.length === 1 ? '' : 's'} no Drive (${o.copias.map(c => `${c.nome} = ${c.igualA}`).join('; ')}) — podes apagar a cópia` : ''].filter(Boolean).join(' · ');
// Definições → Recibos no Google Drive: o botão e a lista dos que ficaram por juntar
const SincronizarRecibosDrive = ({ estado, onCorrer, pend = [], clientes = [], onCriar, onIgnorar, aAbrir }) => (
  <div className="space-y-2">
    <button type="button" disabled={!!(estado && estado.a)} onClick={onCorrer} className="px-2.5 py-1 text-xs rounded-lg border border-sky-500/50 text-sky-400 hover:bg-sky-500/10 disabled:opacity-50">{estado && estado.a ? 'A sincronizar…' : '☁ Sincronizar agora'}</button>
    <p className="text-[11px] text-slate-500">{estado && estado.a ? estado.a : estado && estado.feito ? estado.feito : 'A app também faz isto sozinha: ao abrir, quando voltas à janela e de 10 em 10 minutos.'}</p>
    {pend.length > 0 && (
      <div className="space-y-1.5">
        <p className="text-[11px] text-amber-500">No Drive, por juntar a um registo:</p>
        {pend.map(f => {
          const c = f.cid != null ? clientes.find(x => String(x.id) === String(f.cid)) : null;
          return (
            <div key={f.id} className="text-[11px] rounded-lg px-2 py-1.5 bg-amber-500/10 text-amber-500">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{f.nome}</a>
              <span className="opacity-80"> — {f.motivo}{f.resumo ? ` · ${f.resumo}` : ''}{c ? ` · ${c.nome}` : ''}</span>
              <span className="flex gap-2 mt-1">
                <button type="button" disabled={aAbrir === f.id} onClick={() => onCriar(f)} className="px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-50">{aAbrir === f.id ? 'A abrir…' : 'Criar em Receitas'}</button>
                <button type="button" onClick={() => onIgnorar(f.id)} className="px-1.5 py-0.5 opacity-80 hover:opacity-100">Ignorar</button>
              </span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
// ── Trabalho guardado por anos: um documento base (pastas, jogos, freelancers…) e um por ano com as tarefas ──
// Cada tarefa fica no ano em que foi criada (não muda de ano). Assim nenhum documento chega ao limite de 1 MB.
const anoDaTarefa = t => { const a = String((t && t.criada) || '').slice(0, 4); return /^\d{4}$/.test(a) ? a : String(new Date().getFullYear()); };
const dividirTrabalho = (trab, anosAntes = []) => {
  const porAno = {};
  ((trab && trab.tarefas) || []).forEach(t => { const a = anoDaTarefa(t); (porAno[a] = porAno[a] || []).push(t); });
  anosAntes.forEach(a => { if (!porAno[a]) porAno[a] = []; }); // anos que ficaram vazios também se gravam (vazios)
  const { tarefas, ...resto } = trab || {};
  const docs = { dados: { ...resto, versaoArmazem: 2, anosTarefas: Object.keys(porAno).filter(a => porAno[a].length).sort() } };
  Object.entries(porAno).forEach(([a, ts]) => { docs[`tarefas-${a}`] = { ano: Number(a), tarefas: ts }; });
  return docs;
};
// Junta o que vem da base de dados; diz também se é preciso passar (ou voltar a passar) para o formato por anos
const juntarTrabalho = docs => {
  const base = docs.dados || null;
  const chavesAnos = Object.keys(docs).filter(k => /^tarefas-\d{4}$/.test(k)).sort();
  const dosAnos = chavesAnos.flatMap(k => (docs[k] && docs[k].tarefas) || []);
  const { tarefas: tarefasBase, versaoArmazem, anosTarefas, ...resto } = base || {};
  if (base && versaoArmazem === 2) return { trab: { ...resto, tarefas: dosAnos }, migrar: false, anos: chavesAnos };
  // Formato antigo (tudo num documento) — ou um dispositivo com a app antiga voltou a gravar assim
  if (base && (tarefasBase || []).length) {
    if (!chavesAnos.length) return { trab: { ...resto, tarefas: tarefasBase }, migrar: true, anos: chavesAnos };
    // Já estava por anos e um dispositivo antigo gravou tudo na base: junta as duas (a da base ganha nas tarefas repetidas), sem perder nenhuma
    const m = new Map(dosAnos.map(t => [t.id, t])); tarefasBase.forEach(t => m.set(t.id, t));
    return { trab: { ...resto, tarefas: [...m.values()] }, migrar: true, anos: chavesAnos };
  }
  if (chavesAnos.length) return { trab: { ...resto, tarefas: dosAnos }, migrar: true, anos: chavesAnos };
  return { trab: base ? { ...resto, tarefas: [] } : null, migrar: false, anos: [] };
};
const semCarimbo = o => JSON.stringify(o, (k, v) => (k === 'atualizado' ? undefined : v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, kk) => { a[kk] = v[kk]; return a; }, {}) : v)); // a ordem das chaves não conta

export {
  PedirDados, txNumero, txR2, txParseCSV, txEhDegiro, txLerDegiro, TX_MESES, txEhTradeRepublic,
  txLerTradeRepublic, txDias, txParecida, txMaisProxima, txMarcarDuplicados, txDuplicadosProvaveis, txTextoPDF, txLerFicheiro,
  PAT_COMP, PAT_CONTAS_BASE, PAT_CATS_LIQUIDEZ, patChave, patEhLiquidez, patItemLiq, patRegras, patId,
  patNum, patStr, patIdx, patKey, patSoma, patIso, patFimMes, patDataAceite,
  PAT_DATAS_INICIAIS, patCorte, patIdxHoje, patTemPortfolio, patHistoricoPortfolio, patRotulo, rotuloAnoMes, patTotais,
  patSerie, patDetalhe, patReservado, patSaldosExtrato, patPoupanca, patRetornoReal, patTxConta, patTxLiquido,
  patTxEntre, patVida, patRetorno, patInvestDoPortfolio, patListaCreditos, patCreditoNoMes, patRascunho, patLimpar,
  patSugestaoAportes, patMovimentos, patEstadoMeses, patImportar, patRegistosEfetivos, cmpDadosAno, CompararAnos, CHAT_URLS,
  ChatTexto, ChatGemini, AnoCaixa, AnoVer, AnoBarra, AnoNum, AnoDetalhe, LS_EH_OCULTOS,
  EH_CORES, EuroHoraClientes, MeuAno, CSS_BASE, CSS_MOBILE, LigacaoDriveRecibos, novoIdRecibo, DRIVE_REC_FALHAS,
  idDriveDe, dataDoRecibo, alvoReciboDrive, sincronizarRecibosComDrive, resumoRecibosDrive, SincronizarRecibosDrive, anoDaTarefa, dividirTrabalho,
  juntarTrabalho, semCarimbo
};
export const FICHEIRO_APP = 'patrimonio';
