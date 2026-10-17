// Separador "Banco": as contas, transações e orçamentos do Bilance, com as análises do mês.
// Os dados vêm de ficheiros «bilance-dados-….json» no Google Drive (uma tarefa agendada do Claude grava-os
// todas as manhãs) ou de um ficheiro importado à mão. Ficam guardados no browser para abrir logo.
// Nada disto vai para a base de dados da app nem para o GitHub.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Info, Ico, BIL_CAT_PT, BIL_CAT_COR, BIL_CAT_ICO } from './base';

const LS_CACHE = 'bilance-v1';
const LS_UI = 'banco-ui';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const _eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const _eur0 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur = v => _eur.format(Number(v) || 0);
const eur0 = v => _eur0.format(Math.round(Number(v) || 0));
const eurK = v => { const a = Math.abs(v); return a >= 10000 ? `${(v / 1000).toFixed(0)}K €` : a >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')}K €` : `${Math.round(v)} €`; };
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const mesDe = iso => String(iso || '').slice(0, 7);
const mesSeguinte = (m, n = 1) => { let [y, mm] = m.split('-').map(Number); mm += n; while (mm > 12) { mm -= 12; y++; } while (mm < 1) { mm += 12; y--; } return `${y}-${String(mm).padStart(2, '0')}`; };
const nomeMes = m => { const [y, mm] = m.split('-').map(Number); return `${MESES[mm - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`; };
const lerLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

// Categorias do Bilance em português, cores e ícones: em base.jsx (também usadas nas Despesas)
const CAT_PT = BIL_CAT_PT, CAT_COR = BIL_CAT_COR, CAT_ICO = BIL_CAT_ICO;

// ── Ler o que vem do Bilance (o formato compacto da app ou as linhas tal como a ligação ao Bilance as dá) ──
const _diaLisboa = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
const dataLisboa = iso => { const d = new Date(iso); return isNaN(d) ? '' : _diaLisboa.format(d); };
const normTx = t => {
  if (!t || typeof t !== 'object') return null;
  if (t.i && t.d) return t;
  if (!t.id) return null;
  const d = (t.hasCanonicalLocalDateTime && t.localDate) ? t.localDate : (t.dateTime ? dataLisboa(t.dateTime) : '') || t.localDate || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const o = { i: t.id, d, t: t.title || '', v: Number(t.amount) || 0 };
  if (t.analyticsAmount != null && Number(t.analyticsAmount) !== o.v) o.a = Number(t.analyticsAmount) || 0;
  if (t.type === 'transfer') { o.x = 1; if (t.fromAccountId) o.de = t.fromAccountId; if (t.toAccountId) o.para = t.toAccountId; }
  if (t.accountId) o.c = t.accountId;
  const cs = Array.isArray(t.categories) ? t.categories : [];
  if (cs.length === 1) o.k = cs[0].id; else if (cs.length) o.k = cs.map(c => [c.id, Number(c.value) || 0]);
  if (Array.isArray(t.tags) && t.tags.length) o.g = t.tags.map(g => g.id || g);
  if (t.recurringId) o.r = 1;
  if (t.note) o.n = t.note;
  if (t.status === 'pending') o.p = 1;
  return o;
};
const normContexto = c => {
  if (!c || typeof c !== 'object') return null;
  if (Array.isArray(c.contas)) return c;
  if (!Array.isArray(c.accounts)) return null;
  const dd = c.dataDictionary || {};
  return {
    sincronizado: (c.dataFreshness || {}).latestSyncCompletedAt || null,
    contas: c.accounts.map(a => ({ id: a.id, nome: a.name, banco: String(a.type || '').replace(/ account$/i, ''), saldo: Number(a.balance) || 0, noTotal: a.includedInTotalBalance !== false, ...(a.transactionsHidden ? { escondida: true } : {}) })),
    orcamentos: (c.budgets || []).filter(b => b.currentLimit).map(b => ({ titulo: b.title, limite: Number(b.currentLimit.amount) || 0, categorias: b.categoryIds || [], ...(b.accountIds ? { contas: b.accountIds } : {}), ...(b.period && b.period !== 'monthly' ? { periodo: b.period } : {}) })),
    categorias: (dd.categories || []).filter(x => !/:other$/.test(x.id) && (!CAT_PT[x.id] || !!x.separated !== x.id.startsWith('c07'))).map(x => ({ id: x.id, titulo: String(x.title || '').trim(), pai: x.parentId || null, ...(x.separated ? { separada: true } : {}) })),
    tags: Object.fromEntries((dd.tags || []).map(t => [t.id, String(t.title || '').trim()])),
  };
};
// Um ficheiro pode ser: o da app ({app:'orcamento-bilance', transacoes, contexto}), a resposta da ligação
// ({transactions:[…]}) ou o contexto ({accounts:[…]}). Devolve { geradoEm, de, ate, contexto, transacoes }.
const lerFicheiroBilance = texto => {
  let j; try { j = JSON.parse(texto); } catch (e) { throw new Error('O ficheiro não é JSON.'); }
  const partes = Array.isArray(j) ? j : [j];
  const out = { geradoEm: null, de: null, ate: null, contexto: null, transacoes: [] };
  for (const p of partes) {
    if (!p || typeof p !== 'object') continue;
    if (p.geradoEm && (!out.geradoEm || p.geradoEm > out.geradoEm)) out.geradoEm = p.geradoEm;
    if (p.de) out.de = !out.de || p.de < out.de ? p.de : out.de;
    if (p.ate) out.ate = !out.ate || p.ate > out.ate ? p.ate : out.ate;
    const ctx = normContexto(p.contexto) || normContexto(p.contextoBilance) || normContexto(p);
    if (ctx) out.contexto = ctx;
    const lista = p.transacoes || p.transactions || (Array.isArray(p) ? p : null);
    if (Array.isArray(lista)) out.transacoes.push(...lista.map(normTx).filter(Boolean));
  }
  if (!out.contexto && !out.transacoes.length) throw new Error('Não encontrei transações nem contas do Bilance neste ficheiro.');
  if (!out.geradoEm) out.geradoEm = new Date().toISOString();
  return out;
};
// Junta um ficheiro ao que já está guardado. Um ficheiro mais recente substitui as transações do período que cobre
// (assim apanha as que mudaram de categoria ou foram apagadas no Bilance); um mais antigo só acrescenta as que faltam.
const juntarBilance = (base, f) => {
  const b = base || { geradoEm: null, contexto: null, transacoes: [] };
  const novo = !b.geradoEm || f.geradoEm >= b.geradoEm;
  const ids = new Set(f.transacoes.map(x => x.i));
  let lista = b.transacoes || [];
  if (novo) {
    const de = f.de || (f.transacoes.length ? f.transacoes.reduce((m, x) => (x.d < m ? x.d : m), '9999') : null);
    const ate = f.ate || (f.transacoes.length ? f.transacoes.reduce((m, x) => (x.d > m ? x.d : m), '0000') : null);
    lista = lista.filter(x => !ids.has(x.i) && !(de && ate && x.d >= de && x.d <= ate));
    lista = lista.concat(f.transacoes);
  } else {
    const tem = new Set(lista.map(x => x.i));
    lista = lista.concat(f.transacoes.filter(x => !tem.has(x.i)));
  }
  lista.sort((x, y) => (x.d < y.d ? 1 : x.d > y.d ? -1 : 0));
  return { geradoEm: novo ? f.geradoEm : b.geradoEm, contexto: (novo && f.contexto) || b.contexto || f.contexto, transacoes: lista };
};

// Vai ao Drive buscar os ficheiros do Bilance que ainda não foram lidos e junta-os ao que está no browser.
// Sem comJanela só usa um acesso que já exista (não abre a janela da Google). Devolve null se não houver acesso.
let _aSincronizar = null;
const sincronizarBilance = (carregar, conta, comJanela) => {
  if (_aSincronizar && !comJanela) return _aSincronizar;
  const p = (async () => {
    const mod = await carregar();
    if (comJanela && mod.carregarGis) await mod.carregarGis().catch(() => {});
    const fs = await mod.bilanceListar(conta, comJanela);
    if (!fs) return null;
    let d = lerLS(LS_CACHE, null) || { ids: [], geradoEm: null, contexto: null, transacoes: [] };
    const vistos = new Set(d.ids || []);
    const novos = fs.filter(f => !vistos.has(f.id)).sort((a, b) => String(a.createdTime || a.name).localeCompare(String(b.createdTime || b.name)));
    let n = 0;
    for (const f of novos) {
      try { const txt = await mod.bilanceBaixar(conta, f.id, comJanela); const fic = lerFicheiroBilance(txt); d = { ...juntarBilance(d, fic), ids: [...(d.ids || []), f.id] }; n++; }
      catch (e) { d = { ...d, ids: [...(d.ids || []), f.id] }; console.warn('Ficheiro do Bilance ignorado:', f.name, e); }
    }
    if (novos.length) { gravarLS(LS_CACHE, d); try { window.dispatchEvent(new Event('bilance-atualizado')); } catch (e) { /* */ } }
    return { d: novos.length ? d : null, n, total: fs.length };
  })();
  _aSincronizar = p; p.finally(() => { if (_aSincronizar === p) _aSincronizar = null; });
  return p;
};

// ── Contas do mês ──
const montarCats = ctx => {
  const m = {};
  Object.keys(CAT_PT).forEach(id => { m[id] = { id, titulo: CAT_PT[id], pai: id.includes('_') ? id.split('_')[0] : null, separada: id.startsWith('c07') }; });
  ((ctx && ctx.categorias) || []).forEach(c => { m[c.id] = { id: c.id, titulo: CAT_PT[c.id] || c.titulo, pai: c.pai || null, separada: CAT_PT[c.id] ? !!c.separada : (!!c.separada || String(c.pai || '').startsWith('c07')) }; });
  return m;
};
const principalDe = (cats, id) => { const s = String(id || 'c10'); if (s.includes(':')) return s.split(':')[0]; const c = cats[s]; return c && c.pai ? c.pai : (c ? s : (s.includes('_') ? s.split('_')[0] : s)); };
const nomeCat = (cats, id) => { const s = String(id || ''); if (s.endsWith(':other')) { const p = s.split(':')[0]; return `${(cats[p] || {}).titulo || p}: Outros`; } return (cats[s] || {}).titulo || CAT_PT[s] || 'Sem categoria'; };
// Partes de uma transação: [[categoria, valor que conta nas análises]]
const partesTx = t => {
  const a = t.a != null ? t.a : t.v;
  if (!a) return [];
  if (Array.isArray(t.k)) { const soma = t.k.reduce((s, [, v]) => s + v, 0) || t.v || 1; return t.k.map(([id, v]) => [id, a * (v / soma)]); }
  return [[t.k || 'c10', a]];
};
const daConta = (t, conta) => !conta || t.c === conta || t.de === conta || t.para === conta;
const resumoMes = (txs, cats) => {
  const r = { gasto: 0, ganho: 0, separado: 0, porPrinc: {}, porSub: {}, porDia: {}, comerciantes: {} };
  for (const t of txs) {
    for (const [id, val] of partesTx(t)) {
      const p = principalDe(cats, id);
      if (p === 'c11' || p === 'c15') continue;
      if ((cats[id] && cats[id].separada) || (cats[p] && cats[p].separada)) { r.separado += val; continue; }
      r.porDia[t.d] = (r.porDia[t.d] || 0) + val;
      if (p === 'c08') { r.ganho += val; r.porSub[id] = (r.porSub[id] || 0) + val; continue; }
      r.gasto -= val;
      r.porPrinc[p] = (r.porPrinc[p] || 0) - val;
      r.porSub[id] = (r.porSub[id] || 0) - val;
      if (val < 0) { const k = norm(t.t).replace(/\s+/g, ' ').trim() || '—'; const c = r.comerciantes[k] || (r.comerciantes[k] = { nome: t.t || '—', total: 0, n: 0 }); c.total -= val; c.n++; }
    }
  }
  return r;
};
const casaCategoria = (lista, cats, id) => { const s = String(id || ''); const p = principalDe(cats, s); return lista.includes(s) || lista.includes(p) || (s.endsWith(':other') && lista.includes(p)); };
const gastoOrcamento = (b, txs, cats) => {
  let g = 0;
  for (const t of txs) {
    if (b.contas && !b.contas.some(c => daConta(t, c))) continue;
    for (const [id, val] of partesTx(t)) if (casaCategoria(b.categorias || [], cats, id)) g -= val;
  }
  return g;
};

// ── Peças do ecrã ──
const Bolinha = ({ id, cats, tam = 32 }) => {
  const p = principalDe(cats, id);
  return <span className="inline-flex items-center justify-center rounded-full flex-shrink-0 text-white" style={{ width: tam, height: tam, background: CAT_COR[p] || '#64748b', fontSize: tam * 0.45 }} aria-hidden="true">{CAT_ICO[p] || '•'}</span>;
};
const Barra = ({ frac, cor, fundo }) => (
  <div className="h-2 rounded-full overflow-hidden" style={{ background: fundo }}>
    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, frac * 100))}%`, background: cor }} />
  </div>
);
const Donut = ({ fatias, tam = 132, esp = 16, centro, fundo }) => {
  const R = (tam - esp) / 2, C = 2 * Math.PI * R;
  const total = fatias.reduce((s, f) => s + Math.max(0, f.v), 0);
  let acc = 0;
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} className="flex-shrink-0">
      <circle cx={tam / 2} cy={tam / 2} r={R} fill="none" stroke={fundo} strokeWidth={esp} />
      {total > 0 && fatias.filter(f => f.v > 0).map((f, i) => { const l = (f.v / total) * C; const el = <circle key={i} cx={tam / 2} cy={tam / 2} r={R} fill="none" stroke={f.cor} strokeWidth={esp} strokeDasharray={`${Math.max(0, l - 1.5)} ${C}`} strokeDashoffset={-acc} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />; acc += l; return el; })}
      {centro}
    </svg>
  );
};

const Banco = ({ theme, showToast, contaDrive = '', carregar, mesAtivo, onMes, gastosBanco }) => {
  const claro = theme === 'light';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const linha = claro ? 'border-slate-200' : 'border-slate-700/60';
  const fundoBarra = claro ? '#e2e8f0' : 'rgba(148,163,184,.18)';
  const chip = (on) => `px-3 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap transition-colors ${on ? (claro ? 'bg-violet-600 text-white' : 'bg-violet-500 text-white') : (claro ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300')}`;
  const [dados, setDados] = useState(() => lerLS(LS_CACHE, null));
  const [estado, setEstado] = useState(null); // {a:'a ler'} | {erro} | {semLigacao} | {ok, n}
  const ui0 = lerLS(LS_UI, {});
  const [mesLocal, setMesLocal] = useState(mesDe(hojeIso()));
  const mes = mesAtivo || mesLocal;
  const setMes = f => { const v = typeof f === 'function' ? f(mes) : f; if (onMes) onMes(v); else setMesLocal(v); };
  const [conta, setConta] = useState(ui0.conta || '');
  const [catSel, setCatSel] = useState(null);
  const [pesq, setPesq] = useState('');
  const [nReg, setNReg] = useState(60);
  const [verSubs, setVerSubs] = useState(null);
  const fileRef = useRef(null);
  const regRef = useRef(null);
  useEffect(() => { gravarLS(LS_UI, { conta }); }, [conta]);

  const guardar = d => { setDados(d); const ok = gravarLS(LS_CACHE, d); try { window.dispatchEvent(new Event('bilance-atualizado')); } catch (e) { /* */ } if (!ok) showToast && showToast('O browser não deixou guardar os dados do Bilance (falta espaço). Ficam só até fechares a app.', 'error'); };

  const atualizar = async (comJanela) => {
    if (!carregar) return;
    setEstado({ a: true });
    try {
      const r = await sincronizarBilance(carregar, contaDrive, comJanela);
      if (!r) { setEstado({ semLigacao: true }); return; }
      if (r.d) setDados(r.d);
      setEstado({ ok: true, n: r.n, total: r.total });
      if (comJanela && showToast) showToast(r.n ? `🏦 ${r.n === 1 ? 'Um ficheiro novo' : `${r.n} ficheiros novos`} do Bilance` : '🏦 Já estava tudo atualizado');
    } catch (e) { setEstado({ erro: e.message || String(e) }); }
  };
  useEffect(() => { atualizar(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const importar = async files => {
    let d = lerLS(LS_CACHE, null) || { ids: [], geradoEm: null, contexto: null, transacoes: [] };
    const textos = []; let nTx = 0;
    for (const file of files) {
      try { const txt = await file.text(); const fic = lerFicheiroBilance(txt); d = { ...juntarBilance(d, fic), ids: d.ids || [] }; nTx += fic.transacoes.length; textos.push(txt); }
      catch (e) { showToast && showToast(`${file.name}: ${e.message || e}`, 'error'); }
    }
    if (!textos.length) return;
    guardar(d); showToast && showToast(`🏦 Importado: ${nTx} transações`);
    // Também vai para o Drive (ficheiro novo, nunca por cima de outro) para os outros dispositivos o verem
    if (!carregar) return;
    try {
      const mod = await carregar(); if (mod.carregarGis) await mod.carregarGis().catch(() => {});
      for (const txt of textos) {
        const r = await mod.bilanceGuardar(contaDrive, `bilance-dados-${hojeIso()}-importado-${Date.now().toString(36)}.json`, txt);
        if (r && r.id) { const c = lerLS(LS_CACHE, null); if (c) { c.ids = [...(c.ids || []), r.id]; gravarLS(LS_CACHE, c); } }
      }
      showToast && showToast('☁ Também ficou guardado no Drive, para os outros dispositivos');
    } catch (e) { showToast && showToast(`Ficou só neste dispositivo: não consegui guardar no Drive (${e.message || e}).`, 'error'); }
  };

  const ctx = (dados && dados.contexto) || null;
  const cats = useMemo(() => montarCats(ctx), [ctx]);
  const txs = (dados && dados.transacoes) || [];
  const contasVis = ((ctx && ctx.contas) || []).filter(c => !c.escondida);
  const nomeConta = id => ((ctx && ctx.contas) || []).find(c => c.id === id)?.nome || 'Conta';
  const tagNome = id => (ctx && ctx.tags && ctx.tags[id]) || null;
  const meses = useMemo(() => { const s = new Set(txs.map(t => mesDe(t.d))); s.add(mesDe(hojeIso())); return [...s].sort(); }, [txs]);
  const txMes = useMemo(() => txs.filter(t => mesDe(t.d) === mes && daConta(t, conta)), [txs, mes, conta]);
  const R = useMemo(() => resumoMes(txMes, cats), [txMes, cats]);
  // Média dos 3 meses anteriores com dados (para comparar cada categoria)
  const media3 = useMemo(() => {
    const ant = meses.filter(m => m < mes).slice(-3); if (!ant.length) return null;
    const soma = {}; let ganho = 0, gasto = 0;
    ant.forEach(m => { const r = resumoMes(txs.filter(t => mesDe(t.d) === m && daConta(t, conta)), cats); Object.entries(r.porPrinc).forEach(([k, v]) => { soma[k] = (soma[k] || 0) + v; }); ganho += r.ganho; gasto += r.gasto; });
    Object.keys(soma).forEach(k => { soma[k] /= ant.length; });
    return { porPrinc: soma, ganho: ganho / ant.length, gasto: gasto / ant.length, n: ant.length };
  }, [txs, meses, mes, conta, cats]);
  const ult6 = useMemo(() => { const out = []; for (let i = 5; i >= 0; i--) { const m = mesSeguinte(mes, -i); const r = resumoMes(txs.filter(t => mesDe(t.d) === m && daConta(t, conta)), cats); out.push({ m, ganho: r.ganho, gasto: r.gasto, tem: txs.some(t => mesDe(t.d) === m) }); } return out; }, [txs, mes, conta, cats]);
  const orc = useMemo(() => ((ctx && ctx.orcamentos) || []).filter(b => !b.periodo).map(b => ({ ...b, gasto: gastoOrcamento(b, txs.filter(t => mesDe(t.d) === mes), cats) })), [ctx, txs, mes, cats]);
  const cats_ord = Object.entries(R.porPrinc).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => b[1] - a[1]);
  const comerc = Object.values(R.comerciantes).sort((a, b) => b.total - a.total).slice(0, 10);
  const ehMesAtual = mes === mesDe(hojeIso());
  const hoje = hojeIso();
  const diaHoje = Number(hoje.slice(8, 10));
  const diasMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();

  const registos = useMemo(() => {
    const q = norm(pesq.trim());
    return txMes.filter(t => {
      if (catSel) { const ps = partesTx(t).map(([id]) => id).concat(Array.isArray(t.k) ? t.k.map(x => x[0]) : [t.k || 'c10']); if (!ps.some(id => id === catSel || principalDe(cats, id) === catSel)) return false; }
      if (q) { const txt = norm(`${t.t} ${nomeCat(cats, Array.isArray(t.k) ? t.k[0][0] : t.k)} ${(t.g || []).map(tagNome).join(' ')} ${t.n || ''} ${String(Math.abs(t.v)).replace('.', ',')}`); if (!q.split(/\s+/).every(p => txt.includes(p))) return false; }
      return true;
    });
  }, [txMes, catSel, pesq, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const porDiaReg = useMemo(() => { const g = []; let atual = null; registos.slice(0, nReg).forEach(t => { if (!atual || atual.d !== t.d) { atual = { d: t.d, l: [], tot: 0 }; g.push(atual); } atual.l.push(t); atual.tot += partesTx(t).reduce((s, [id, v]) => { const p = principalDe(cats, id); return p === 'c11' || p === 'c15' ? s : s + v; }, 0); }); return g; }, [registos, nReg, cats]);
  const escolherCat = id => { setCatSel(c => (c === id ? null : id)); setNReg(60); setTimeout(() => regRef.current && regRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };

  const saldoTotal = ((ctx && ctx.contas) || []).filter(c => c.noTotal !== false && !c.escondida).reduce((s, c) => s + (Number(c.saldo) || 0), 0);
  const sinc = ctx && ctx.sincronizado ? new Date(String(ctx.sincronizado).replace(/(\.\d{3})\d+/, '$1') + (/[zZ]|[+-]\d\d:?\d\d$/.test(ctx.sincronizado) ? '' : 'Z')) : null;
  const sincTxt = sinc && !isNaN(sinc) ? `${sinc.toISOString().slice(0, 10) === hoje ? 'hoje' : `${sinc.getDate()}/${sinc.getMonth() + 1}`} às ${String(sinc.getHours()).padStart(2, '0')}:${String(sinc.getMinutes()).padStart(2, '0')}` : null;
  const dataLonga = iso => { const d = new Date(`${iso}T12:00:00`); const dif = Math.round((new Date(`${hoje}T12:00:00`) - d) / 86400000); const s = `${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; return dif === 0 ? `Hoje · ${s}` : dif === 1 ? `Ontem · ${s}` : s; };

  // ── Sem dados ainda ──
  if (!txs.length && !ctx) return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><Ico e="🏦"/>Banco</h2>
        <p className={`text-sm ${sub} mb-4`}>Aqui aparecem as contas, as transações e os orçamentos do Bilance, com as análises de cada mês.</p>
        {estado && estado.a && <p className="text-sm mb-3">A procurar os dados do Bilance no Drive…</p>}
        {estado && estado.semLigacao && <p className={`text-sm mb-3 ${sub}`}>Para ler sozinha do Drive, a app precisa de acesso. Carrega em «Ir buscar ao Drive».</p>}
        {estado && estado.ok && !estado.total && <p className={`text-sm mb-3 ${sub}`}>Ainda não há ficheiros do Bilance no Drive. A tarefa agendada grava um todas as manhãs; até lá podes importar o ficheiro à mão.</p>}
        {estado && estado.erro && <p className="text-sm mb-3 text-red-400">{estado.erro}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => atualizar(true)} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium">☁ Ir buscar ao Drive</button>
          <button type="button" onClick={() => fileRef.current && fileRef.current.click()} className={`px-4 py-2 rounded-xl text-sm ${claro ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`}>⬆ Importar ficheiro</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple className="hidden" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) importar(f); }} />
      </Card>
    </div>
  );

  const maxBar6 = Math.max(1, ...ult6.map(x => Math.max(x.ganho, x.gasto)));
  const taxa = R.ganho > 0 ? (R.ganho - R.gasto) / R.ganho : null;
  // calendário: semanas a começar à segunda
  const primeiro = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1);
  const vazios = (primeiro.getDay() + 6) % 7;
  const maxDia = Math.max(1, ...Object.values(R.porDia).map(v => Math.abs(v)).filter(v => v < 20000));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cabeçalho: mês, contas, atualizar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto max-w-full pb-0.5">
          <button type="button" className={chip(!conta)} onClick={() => setConta('')}>Todas as contas</button>
          {contasVis.filter(c => txs.some(t => daConta(t, c.id))).map(c => <button key={c.id} type="button" className={chip(conta === c.id)} onClick={() => setConta(c.id)}>{c.nome}</button>)}
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs">
          <span className={sub}>{estado && estado.a ? 'A atualizar…' : sincTxt ? `Bilance sincronizado ${sincTxt}` : ''}</span>
          <Info>Os dados vêm do Bilance. Todas as manhãs uma tarefa agendada do Claude grava um ficheiro «bilance-dados» no teu Drive (pasta «Bilance (dados para a app)») e a app lê-o sozinha. «Atualizar» vai lá ver se há ficheiros novos; «Importar» junta um ficheiro à mão. Os dados ficam no teu Drive e neste browser — não vão para o GitHub nem para a base de dados da app.</Info>
          <button type="button" onClick={() => atualizar(true)} className={`px-2.5 py-1.5 rounded-lg ${claro ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`} title="Ir ver ao Drive se há dados novos">☁ Atualizar</button>
          <button type="button" onClick={() => fileRef.current && fileRef.current.click()} className={`px-2.5 py-1.5 rounded-lg ${claro ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`} title="Importar um ficheiro do Bilance">⬆</button>
          <input ref={fileRef} type="file" accept=".json,application/json" multiple className="hidden" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) importar(f); }} />
        </div>
      </div>
      {estado && estado.erro && <p className="text-xs text-red-400">Não consegui ler o Drive: {estado.erro}</p>}
      {gastosBanco}

      {/* Gasto / Ganho / Total */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
            <div className="flex items-center gap-6 sm:gap-10">
              <Donut tam={128} esp={14} fundo={fundoBarra} fatias={cats_ord.map(([k, v]) => ({ v, cor: CAT_COR[k] || '#64748b' }))}
                centro={<><text x="64" y="58" textAnchor="middle" className="fill-current" style={{ fontSize: 13, opacity: .6 }}>−</text><text x="64" y="76" textAnchor="middle" className="fill-current" style={{ fontSize: 17, fontWeight: 700 }}>{eur0(R.gasto)}</text><text x="64" y="92" textAnchor="middle" className="fill-current" style={{ fontSize: 10, opacity: .6 }}>Gasto</text></>} />
              <Donut tam={128} esp={14} fundo={fundoBarra} fatias={[{ v: R.ganho, cor: CAT_COR.c08 }]}
                centro={<><text x="64" y="58" textAnchor="middle" className="fill-current" style={{ fontSize: 13, opacity: .6 }}>+</text><text x="64" y="76" textAnchor="middle" className="fill-current" style={{ fontSize: 17, fontWeight: 700 }}>{eur0(R.ganho)}</text><text x="64" y="92" textAnchor="middle" className="fill-current" style={{ fontSize: 10, opacity: .6 }}>Ganho</text></>} />
            </div>
            <div className="flex-1 w-full space-y-3">
              <div className={`flex items-center justify-between rounded-xl border ${linha} px-4 py-3`}>
                <span className="font-semibold">Total de {MESES[Number(mes.slice(5, 7)) - 1]}</span>
                <span className={`text-lg font-bold ${R.ganho - R.gasto >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{R.ganho - R.gasto >= 0 ? '+' : ''}{eur0(R.ganho - R.gasto)}</span>
              </div>
              <div className="flex items-center justify-between text-sm px-1">
                <span className={sub}>Taxa de poupança <Info>(Ganho − Gasto) ÷ Ganho. Os investimentos (ETF, PPR, filhos…) não contam como gasto, tal como no Bilance; as transferências entre as tuas contas também não.</Info></span>
                <span className="font-semibold">{taxa == null ? '—' : `${Math.round(taxa * 100)}%`}</span>
              </div>
              {media3 && <div className="flex items-center justify-between text-sm px-1">
                <span className={sub}>Gasto vs média de {media3.n === 1 ? '1 mês' : `${media3.n} meses`} antes</span>
                <span className={`font-semibold ${R.gasto > media3.gasto ? 'text-red-400' : 'text-emerald-500'}`}>{R.gasto > media3.gasto ? '+' : '−'}{eur0(Math.abs(R.gasto - media3.gasto))}</span>
              </div>}
              {R.separado !== 0 && <div className="flex items-center justify-between text-sm px-1">
                <span className={sub}>Investido / poupado (à parte)</span>
                <span className="font-semibold text-violet-400">{eur0(-R.separado)}</span>
              </div>}
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-1.5"><Ico e="🏦"/>Saldo total</h3>
            <span className="text-xl font-bold">{eur0(saldoTotal)}</span>
          </div>
          <div className="space-y-1.5">
            {contasVis.filter(c => Math.abs(c.saldo) >= 0.5).sort((a, b) => b.saldo - a.saldo).map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{c.nome} <span className={`text-xs ${sub}`}>{c.banco && c.banco !== c.nome ? c.banco : ''}</span></span>
                <span className="font-medium tabular-nums">{eur(c.saldo)}</span>
              </div>
            ))}
          </div>
          <p className={`text-[11px] mt-3 ${sub}`}>Saldos da última sincronização do Bilance{sincTxt ? ` (${sincTxt})` : ''}.</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Categorias */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Para onde foi o dinheiro</h3>
            {media3 && <span className={`text-[11px] ${sub}`}>vs média</span>}
          </div>
          {!cats_ord.length && <p className={`text-sm ${sub}`}>Sem gastos neste mês.</p>}
          <div className="space-y-1">
            {cats_ord.map(([k, v]) => {
              const med = media3 ? media3.porPrinc[k] || 0 : null;
              const dif = med != null ? v - med : 0;
              const subs = Object.entries(R.porSub).filter(([id]) => principalDe(cats, id) === k && id !== k).sort((a, b) => b[1] - a[1]);
              return (
                <div key={k}>
                  <div className={`flex items-center gap-3 rounded-lg px-1.5 py-1.5 cursor-pointer ${catSel === k ? (claro ? 'bg-violet-50' : 'bg-violet-500/10') : (claro ? 'hover:bg-slate-50' : 'hover:bg-white/5')}`} onClick={() => setVerSubs(s => (s === k ? null : k))}>
                    <Bolinha id={k} cats={cats} tam={30} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{nomeCat(cats, k)}</span>
                        <span className="tabular-nums font-semibold">{eur(-v)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1"><Barra frac={R.gasto > 0 ? v / R.gasto : 0} cor={CAT_COR[k] || '#64748b'} fundo={fundoBarra} /></div>
                        <span className={`text-[11px] w-9 text-right ${sub}`}>{R.gasto > 0 ? Math.round((v / R.gasto) * 100) : 0}%</span>
                        {med != null && <span className={`text-[11px] w-16 text-right tabular-nums ${Math.abs(dif) < 5 ? sub : dif > 0 ? 'text-red-400' : 'text-emerald-500'}`}>{Math.abs(dif) < 5 ? '=' : `${dif > 0 ? '+' : '−'}${eur0(Math.abs(dif))}`}</span>}
                      </div>
                    </div>
                  </div>
                  {verSubs === k && (
                    <div className="ml-11 mb-2 space-y-0.5">
                      {subs.map(([id, sv]) => (
                        <button key={id} type="button" onClick={() => escolherCat(id)} className={`w-full flex items-center justify-between text-xs px-2 py-1 rounded ${catSel === id ? (claro ? 'bg-violet-100' : 'bg-violet-500/15') : (claro ? 'hover:bg-slate-100' : 'hover:bg-white/5')}`}>
                          <span className="truncate">{nomeCat(cats, id)}</span><span className="tabular-nums">{eur(-sv)}</span>
                        </button>
                      ))}
                      <button type="button" onClick={() => escolherCat(k)} className="text-xs text-violet-400 hover:underline px-2">Ver os registos de {nomeCat(cats, k)} →</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {R.ganho > 0 && (
            <div className={`mt-3 pt-3 border-t ${linha}`}>
              <div className="flex items-center gap-3 px-1.5 cursor-pointer" onClick={() => escolherCat('c08')}>
                <Bolinha id="c08" cats={cats} tam={30} />
                <span className="flex-1 text-sm font-medium">Rendimento</span>
                <span className="text-sm font-semibold text-emerald-500 tabular-nums">+{eur(R.ganho)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Orçamentos */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Orçamentos do Bilance</h3>
            {orc.length > 0 && <span className={`text-xs ${sub}`}>{eur0(orc.reduce((s, b) => s + b.gasto, 0))} de {eur0(orc.reduce((s, b) => s + b.limite, 0))}</span>}
          </div>
          {!orc.length && <p className={`text-sm ${sub}`}>Não há orçamentos mensais no Bilance.</p>}
          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {orc.map(b => {
              const frac = b.limite > 0 ? b.gasto / b.limite : 0;
              const esperado = ehMesAtual ? diaHoje / diasMes : 1;
              const cor = frac > 1 ? '#ef4444' : frac > esperado + 0.1 ? '#f59e0b' : '#22c55e';
              return (
                <div key={b.titulo}>
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate font-medium">{b.titulo}</span>
                    <span className="tabular-nums whitespace-nowrap">{eur0(b.limite)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-0.5 mb-1">
                    <span className={sub}>{eur(b.gasto)} gastos</span>
                    <span className={frac > 1 ? 'text-red-400' : sub}>{frac > 1 ? `${eur(b.gasto - b.limite)} acima` : `${eur(b.limite - b.gasto)} livres`}</span>
                  </div>
                  <div className="relative">
                    <Barra frac={frac} cor={cor} fundo={fundoBarra} />
                    {ehMesAtual && <span className={`absolute top-[-2px] h-3 w-0.5 ${claro ? 'bg-slate-500' : 'bg-slate-300'}`} style={{ left: `${Math.min(100, esperado * 100)}%` }} title="Onde devias estar hoje, a gastar por igual ao longo do mês" />}
                  </div>
                </div>
              );
            })}
          </div>
          {ehMesAtual && orc.length > 0 && <p className={`text-[11px] mt-3 ${sub}`}>O traço mostra onde devias ir hoje se gastasses por igual o mês todo. Os limites mudam-se no Bilance.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Calendário */}
        <Card>
          <h3 className="font-semibold mb-3">Dia a dia</h3>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DIAS_SEM.map(d => <div key={d} className={`text-[10px] sm:text-xs ${sub}`}>{d}</div>)}
            {Array.from({ length: vazios }).map((_, i) => <div key={`v${i}`} />)}
            {Array.from({ length: diasMes }).map((_, i) => {
              const d = `${mes}-${String(i + 1).padStart(2, '0')}`; const v = R.porDia[d]; const fut = d > hoje;
              const alfa = v ? Math.min(1, Math.abs(v) / maxDia) * 0.55 + 0.1 : 0;
              return (
                <button key={d} type="button" disabled={!v} onClick={() => { setPesq(''); setCatSel(null); setNReg(400); setTimeout(() => { const el = document.getElementById(`banco-dia-${d}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); }}
                  className={`rounded-lg py-1 sm:py-1.5 text-left px-1.5 border ${d === hoje ? 'border-violet-500' : claro ? 'border-slate-200' : 'border-slate-700/50'} ${fut ? 'opacity-40' : ''}`}
                  style={v ? { background: v > 0 ? `rgba(245,163,0,${alfa})` : `rgba(239,68,68,${alfa * 0.6})` } : undefined}>
                  <div className="text-[10px] sm:text-[11px] opacity-70">{i + 1}</div>
                  <div className="text-[10px] sm:text-xs font-semibold tabular-nums truncate">{v ? `${v > 0 ? '+' : '−'}${eurK(Math.abs(v))}` : ' '}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Últimos 6 meses */}
        <Card>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold">Últimos 6 meses</h3>
            <span className={`text-xs ${sub}`}>ganho · gasto</span>
          </div>
          <div className="flex items-end justify-between gap-2 h-48">
            {ult6.map(x => (
              <button key={x.m} type="button" onClick={() => { setMes(x.m); setNReg(60); }} className={`flex-1 flex flex-col items-center justify-end h-full gap-1 rounded-lg pt-1 ${x.m === mes ? (claro ? 'bg-violet-50' : 'bg-violet-500/10') : ''}`} title={x.tem ? `${nomeMes(x.m)}: ganho ${eur0(x.ganho)}, gasto ${eur0(x.gasto)}` : `${nomeMes(x.m)}: sem dados do Bilance`}>
                {x.tem ? <>
                  <span className="text-[10px] tabular-nums text-amber-500">+{eurK(x.ganho)}</span>
                  <div className="w-full flex items-end justify-center gap-1" style={{ height: '70%' }}>
                    <div className="w-1/3 rounded-t" style={{ height: `${(x.ganho / maxBar6) * 100}%`, background: CAT_COR.c08 }} />
                    <div className="w-1/3 rounded-t" style={{ height: `${(x.gasto / maxBar6) * 100}%`, background: '#ef4444' }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-red-400">−{eurK(x.gasto)}</span>
                </> : <span className={`text-[10px] ${sub}`}>sem dados</span>}
                <span className={`text-[11px] ${x.m === mes ? 'font-semibold' : sub}`}>{MESES_C[Number(x.m.slice(5, 7)) - 1]}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Onde mais gastaste */}
      {comerc.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-2">Onde mais gastaste</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {comerc.map(c => (
              <button key={c.nome} type="button" onClick={() => { setPesq(c.nome); setCatSel(null); setNReg(60); setTimeout(() => regRef.current && regRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className={`flex items-center justify-between gap-2 py-2 border-b ${linha} text-sm text-left hover:text-violet-400`}>
                <span className="truncate">{c.n > 1 && <span className="inline-block text-[10px] font-bold bg-violet-600 text-white rounded px-1 mr-1.5">{c.n}×</span>}{c.nome}</span>
                <span className="tabular-nums font-medium">{eur(-c.total)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Registos */}
      <div ref={regRef} className="scroll-mt-24">
        <Card>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="font-semibold mr-auto">Registos <span className={`text-sm font-normal ${sub}`}>· {registos.length}</span></h3>
            {catSel && <button type="button" onClick={() => setCatSel(null)} className={chip(true)}>{nomeCat(cats, catSel)} ✕</button>}
            <input value={pesq} onChange={e => { setPesq(e.target.value); setNReg(60); }} placeholder="Procurar…" className={`px-3 py-1.5 rounded-lg text-sm w-44 sm:w-56 border ${claro ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-700'}`} />
          </div>
          {!registos.length && <p className={`text-sm ${sub}`}>Nada neste mês{catSel || pesq ? ' com esse filtro' : ''}.</p>}
          <div className="space-y-4">
            {porDiaReg.map(g => (
              <div key={g.d} id={`banco-dia-${g.d}`} className="scroll-mt-24">
                <div className={`flex items-center justify-between text-xs mb-1 ${sub}`}>
                  <span className="first-letter:uppercase">{dataLonga(g.d)}</span>
                  <span className="tabular-nums">{g.tot >= 0 ? '+' : '−'}{eur(Math.abs(g.tot))}</span>
                </div>
                <div className={`rounded-xl border ${linha} divide-y ${claro ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
                  {g.l.map(t => {
                    const k0 = Array.isArray(t.k) ? t.k[0][0] : (t.k || 'c10');
                    const transf = t.x || principalDe(cats, k0) === 'c11';
                    return (
                      <div key={t.i} className="flex items-center gap-3 px-3 py-2">
                        <Bolinha id={k0} cats={cats} tam={30} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{t.t || '—'}{t.p && <span className={`ml-1.5 text-[10px] ${sub}`}>pendente</span>}</div>
                          <div className={`text-xs truncate ${sub}`}>
                            {Array.isArray(t.k) ? t.k.map(([id]) => nomeCat(cats, id)).join(' + ') : nomeCat(cats, k0)}
                            {!conta && (t.c || t.de || t.para) ? ` · ${transf && t.de && t.para ? `${nomeConta(t.de)} → ${nomeConta(t.para)}` : nomeConta(t.c || t.de || t.para)}` : ''}
                          </div>
                        </div>
                        {(t.g || []).map(tagNome).filter(Boolean).slice(0, 2).map(n => <span key={n} className={`hidden sm:inline text-[11px] px-2 py-0.5 rounded-full ${claro ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/15 text-emerald-300'}`}># {n}</span>)}
                        <span className={`text-sm tabular-nums font-semibold whitespace-nowrap ${transf ? sub : t.v > 0 ? 'text-emerald-500' : ''}`}>{transf ? '' : t.v > 0 ? '+' : '−'}{eur(Math.abs(t.v))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {registos.length > nReg && <button type="button" onClick={() => setNReg(n => n + 100)} className="mt-3 w-full py-2 rounded-xl text-sm text-violet-400 hover:underline">Mostrar mais ({registos.length - nReg})</button>}
        </Card>
      </div>
    </div>
  );
};

export { Banco, sincronizarBilance, lerFicheiroBilance, juntarBilance, resumoMes, montarCats, gastoOrcamento };
export const FICHEIRO_APP = 'banco';
