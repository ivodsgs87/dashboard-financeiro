// Separador "Trabalho": pastas e subpastas por cliente, tarefas com estados, cronómetro,
// notas/reuniões e orçamento automático. Substitui o ClickUp. Só é descarregado quando se abre.
// Os dados (trab) vêm do OrcamentoApp, que os guarda no Firestore; aqui só se lê e se pede para mudar.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TRAB_ESTADOS, TRAB_VAZIO, trabId, trabDia, trabMsTempo, trabHoras, trabACorrer, trabEntrega,
  cuPreco, trabValor, trabValorAuto, trabPecas, trabRelogio, cuPecas, CU_TIPOS, CU_NOMES_EN, CU_CAMPOS_PRECO, CU_PRECOS_PADRAO, cuPresetCliente, cuEur, cuLerHoras, cuHorasTxt,
  meses, Card, trabParar,
} from './base';

// ── Operações (recebem os dados e devolvem os dados novos) ──
const agoraIso = () => new Date().toISOString();
const eur = v => cuEur(Math.round(Number(v) || 0));
// Tempo com minutos: 1m, 25m, 4h, 4h 29m (até 1 minuto conta como 1m)
const tempoTxt = h => { const ms = (Number(h) || 0) * 3600000; if (ms <= 0) return '0m'; const min = Math.max(1, Math.floor(ms / 60000 + 1e-6)); const hh = Math.floor(min / 60), mm = min % 60; return hh ? (mm ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`; };
const CORES_PASTA = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
const filhasDe = (trab, paiId, cid) => (trab.pastas || []).filter(p => (p.paiId || null) === (paiId || null) && (paiId ? true : String(p.cid) === String(cid)))
  .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), 'pt', { numeric: true }));
const descendentes = (trab, id) => {
  const out = [id];
  for (let i = 0; i < out.length; i++) (trab.pastas || []).forEach(p => { if (p.paiId === out[i]) out.push(p.id); });
  return out;
};
const caminho = (trab, id) => {
  const out = [];
  let p = (trab.pastas || []).find(x => x.id === id);
  while (p) { out.unshift(p); const pai = p.paiId; p = pai ? (trab.pastas || []).find(x => x.id === pai) : null; }
  return out;
};
const opNovaPasta = (trab, { cid, paiId, nome, cor }) => {
  const id = trabId();
  return [{ ...trab, pastas: [...(trab.pastas || []), { id, cid, paiId: paiId || null, nome: nome || 'Nova pasta', cor: cor || CORES_PASTA[(trab.pastas || []).length % CORES_PASTA.length], criada: agoraIso(), notas: [], orcamento: {} }] }, id];
};
const opPasta = (trab, id, patch) => ({ ...trab, pastas: (trab.pastas || []).map(p => (p.id === id ? { ...p, ...patch } : p)) });
const opFavorito = (trab, id) => { const f = new Set(trab.favoritos || []); if (f.has(id)) f.delete(id); else f.add(id); return { ...trab, favoritos: [...f] }; };
// Passar uma pasta (com subpastas e tarefas) para outro cliente
const opMudarCliente = (trab, id, cid) => {
  const ids = new Set(descendentes(trab, id));
  return { ...trab, pastas: (trab.pastas || []).map(p => (ids.has(p.id) ? { ...p, cid } : p)), tarefas: (trab.tarefas || []).map(t => (ids.has(t.pastaId) ? { ...t, cid } : t)) };
};
// ── Reorganizar uma pasta (ex.: "2026") por meses, em vez de pastas por jogo ──
// Cada lista final (pasta sem subpastas) vai para a pasta do mês dela: o mês lê-se do nome
// ("44 - Mahjong - Oct") ou, se não estiver no nome, das datas das tarefas. As pastas que
// ficarem vazias desaparecem. Nada se perde: as tarefas continuam nas mesmas listas.
const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MES_CHAVE = { jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12 };
const mesDoNome = nome => {
  const ms = [...String(nome || '').toLowerCase().matchAll(/(?:^|[^a-zà-ú])(jan|feb|fev|mar|apr|abr|may|mai|jun|jul|aug|ago|sep|set|oct|out|nov|dec|dez)[a-zà-ú]*(?![a-zà-ú])/g)];
  return ms.length ? MES_CHAVE[ms[ms.length - 1][1]] : null;
};
const numDoNome = nome => { const m = /^\s*(\d+)/.exec(String(nome || '')); return m ? Number(m[1]) : 9999; };
const planoPorMeses = (trab, raizId) => {
  const ids = descendentes(trab, raizId).filter(id => id !== raizId);
  const pastas = (trab.pastas || []).filter(p => ids.includes(p.id));
  const folhas = pastas.filter(p => !(trab.pastas || []).some(f => f.paiId === p.id));
  return folhas.map(f => {
    let m = mesDoNome(f.nome);
    if (!m) {
      const conta = {};
      (trab.tarefas || []).filter(t => t.pastaId === f.id).forEach(t => { const d = t.feita || t.review || t.iniciada || t.criada; if (d) { const k = new Date(d).getMonth() + 1; conta[k] = (conta[k] || 0) + 1; } });
      const melhor = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
      m = melhor ? Number(melhor[0]) : null;
    }
    return { pasta: f, mes: m };
  });
};
const opPorMeses = (trab, raizId) => {
  const raiz = (trab.pastas || []).find(p => p.id === raizId);
  if (!raiz) return trab;
  const plano = planoPorMeses(trab, raizId);
  let pastas = [...(trab.pastas || [])];
  const mesPasta = {};
  // reaproveita pastas de mês que já existam dentro da raiz
  pastas.filter(p => p.paiId === raizId && p.mesNum).forEach(p => { mesPasta[p.mesNum] = p.id; });
  plano.forEach(({ mes }) => {
    const k = mes || 0;
    if (mesPasta[k]) return;
    const id = trabId() + 'm' + k;
    mesPasta[k] = id;
    pastas.push({ id, cid: raiz.cid, paiId: raizId, nome: k ? MESES_NOMES[k - 1] : 'Sem mês', mesNum: k || 99, ordem: k || 99, cor: '#64748b', criada: new Date().toISOString(), notas: [], orcamento: {} });
  });
  const destino = {};
  plano.forEach(({ pasta, mes }) => { destino[pasta.id] = mesPasta[mes || 0]; });
  pastas = pastas.map(p => (destino[p.id] ? { ...p, paiId: destino[p.id], ordem: numDoNome(p.nome) } : p));
  // apaga as pastas antigas que ficaram sem nada (sem subpastas nem tarefas)
  const temTarefas = new Set((trab.tarefas || []).map(t => t.pastaId));
  let mudou = true;
  while (mudou) {
    mudou = false;
    const comFilhas = new Set(pastas.map(p => p.paiId).filter(Boolean));
    const antes = pastas.length;
    pastas = pastas.filter(p => p.id === raizId || p.mesNum || comFilhas.has(p.id) || temTarefas.has(p.id) || destino[p.id] || !descendentes(trab, raizId).includes(p.id));
    if (pastas.length !== antes) mudou = true;
  }
  const vivos = new Set(pastas.map(p => p.id));
  return { ...trab, pastas, favoritos: (trab.favoritos || []).filter(f => vivos.has(f)) };
};
const opApagarPasta = (trab, id) => {
  const ids = new Set(descendentes(trab, id));
  return { ...trab, pastas: (trab.pastas || []).filter(p => !ids.has(p.id)), tarefas: (trab.tarefas || []).filter(t => !ids.has(t.pastaId)), favoritos: (trab.favoritos || []).filter(f => !ids.has(f)) };
};
const opNovaTarefa = (trab, { pastaId, cid, nome, prazo, pecas }) => ({
  ...trab, tarefas: [...(trab.tarefas || []), { id: trabId(), pastaId: pastaId || null, cid: cid ?? null, nome: nome.trim(), estado: 'todo', criada: agoraIso(), prazo: prazo || '', tempos: [], notas: '', ...(pecas ? { pecas } : {}) }],
});
const opTarefa = (trab, id, fn) => ({ ...trab, tarefas: (trab.tarefas || []).map(t => (t.id === id ? fn(t) : t)) });
const opParar = trabParar;
const opIniciar = (trab, id) => opTarefa(opParar(trab), id, t => ({
  ...t, tempos: [...(t.tempos || []), { id: trabId(), ini: agoraIso(), fim: null }],
  estado: t.estado === 'todo' ? 'curso' : t.estado, iniciada: t.iniciada || agoraIso(),
}));
// Mudar o estado regista sozinho quando começaste, quando foi para review e quando terminaste
const opEstado = (trab, id, estado) => {
  const base = estado === 'feito' || estado === 'review' ? opTarefa(trab, id, t => ({ ...t, tempos: (t.tempos || []).map(x => (x.fim ? x : { ...x, fim: agoraIso() })) })) : trab;
  return opTarefa(base, id, t => {
    const n = { ...t, estado };
    if (estado !== 'todo' && !n.iniciada) n.iniciada = agoraIso();
    if (estado === 'review' && !n.review) n.review = agoraIso();
    if (estado === 'feito' && !n.feita) n.feita = agoraIso();
    if (estado === 'todo' || estado === 'curso') { n.feita = null; }
    return n;
  });
};

// ── Peças pequenas ──
const useClaro = theme => theme === 'light';
const EstadoPill = ({ estado, onMudar, theme, compacto = false }) => {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const e = TRAB_ESTADOS.find(x => x.id === estado) || TRAB_ESTADOS[0];
  const claro = useClaro(theme);
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" onClick={() => setAberto(!aberto)} title="Mudar o estado"
        className={compacto ? 'inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/10' : 'inline-flex items-center gap-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide px-2 py-1 text-white whitespace-nowrap'}
        style={compacto ? undefined : { background: e.cor }}>
        {compacto ? <IcoEstado id={e.id} cor={e.cor} size={13} /> : <span className="w-2 h-2 rounded-full" style={{ background: e.cor }} />}
        {!compacto && e.nome}
      </button>
      {aberto && (
        <div className={`absolute z-40 left-0 top-full mt-1 w-44 rounded-xl border p-1 shadow-xl animate-fadeInScale ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
          {TRAB_ESTADOS.map(x => (
            <button key={x.id} type="button" onClick={() => { setAberto(false); if (x.id !== estado) onMudar(x.id); }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left ${x.id === estado ? (claro ? 'bg-slate-100' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              <IcoEstado id={x.id} cor={x.cor} />{x.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
const BotaoCrono = ({ aCorrer, onIniciar, onParar, theme, pequeno = false }) => {
  const claro = useClaro(theme);
  const tam = pequeno ? 'w-6 h-6' : 'w-7 h-7';
  return aCorrer
    ? <button type="button" onClick={onParar} title="Parar o cronómetro" aria-label="Parar o cronómetro" className={`${tam} inline-flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm`}><svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="currentColor" /></svg></button>
    : <button type="button" onClick={onIniciar} title="Começar o cronómetro" aria-label="Começar o cronómetro" className={`${tam} inline-flex items-center justify-center rounded-full border ${claro ? 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600' : 'border-slate-600 text-slate-400 hover:border-blue-400 hover:text-blue-300'}`}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg></button>;
};
// Horas de uma tarefa a contar ao segundo enquanto o cronómetro corre
const HorasVivas = ({ t }) => {
  const corre = (t.tempos || []).some(x => !x.fim);
  const [, setTic] = useState(0);
  useEffect(() => { if (!corre) return undefined; const i = setInterval(() => setTic(x => x + 1), 1000); return () => clearInterval(i); }, [corre]);
  const ms = (t.tempos || []).reduce((a, x) => a + trabMsTempo(x), 0);
  if (!ms) return <span className="opacity-40">—</span>;
  return <span className={`tabular-nums ${corre ? 'text-red-400 font-semibold' : ''}`}>{corre ? trabRelogio(ms) : tempoTxt(ms / 3600000)}</span>;
};
const dataCurta = iso => { const d = trabDia(iso); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ''; };
const dataHora = iso => { if (!iso) return '—'; const d = new Date(iso); return `${dataCurta(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const paraInputLocal = iso => { if (!iso) return ''; const d = new Date(iso); return `${trabDia(iso)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ── Linha de uma tarefa ──
const LinhaTarefa = ({ t, cu, clientes, theme, onAbrir, mudar, mostrarPasta, nomePasta }) => {
  const claro = useClaro(theme);
  const corre = (t.tempos || []).some(x => !x.fim);
  const v = trabValor(t, cu, clientes);
  const hoje = trabDia(new Date().toISOString());
  const atrasada = t.prazo && t.prazo < hoje && t.estado !== 'feito' && t.estado !== 'review';
  return (
    <div className={`group flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-xl border transition-colors ${corre ? (claro ? 'border-red-200 bg-red-50/60' : 'border-red-500/30 bg-red-500/5') : claro ? 'border-transparent hover:border-slate-200 hover:bg-slate-50' : 'border-transparent hover:border-slate-700 hover:bg-white/[0.03]'}`}>
      <EstadoPill estado={t.estado} theme={theme} compacto onMudar={e => mudar(tr => opEstado(tr, t.id, e))} />
      <button type="button" onClick={() => onAbrir(t.id)} className={`flex-1 min-w-0 text-left ${t.estado === 'feito' ? 'opacity-60' : ''}`}>
        <span className={`block truncate text-sm ${t.estado === 'feito' ? 'line-through decoration-slate-500/60' : ''}`}>{t.nome}</span>
        {(mostrarPasta && nomePasta) && <span className={`block truncate text-[11px] ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{nomePasta}</span>}
      </button>
      {t.prazo && <span className={`hidden sm:inline text-xs tabular-nums ${atrasada ? 'text-red-400 font-medium' : claro ? 'text-slate-500' : 'text-slate-400'}`} title="Prazo">{dataCurta(t.prazo)}</span>}
      <span className={`w-14 text-right text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}><HorasVivas t={t} /></span>
      <span className={`hidden sm:inline w-16 text-right text-xs tabular-nums ${v ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'opacity-40'}`}>{v ? eur(v) : '—'}</span>
      <BotaoCrono aCorrer={corre} theme={theme} onIniciar={() => mudar(tr => opIniciar(tr, t.id))} onParar={() => mudar(opParar)} />
    </div>
  );
};

// ── Lista de tarefas agrupada por estado ──
// Ordem dos grupos na lista (o que está a mexer primeiro)
const ORDEM_GRUPOS = ['feito', 'review', 'curso', 'todo']; // como no ClickUp
const ICONE_ESTADO = {
  todo: <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.2 1.6" />,
  aprovar: <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.2 1.6" />,
  curso: <><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" /></>,
  review: <><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6 1.5a4.5 4.5 0 1 1-4.5 4.5H6z" fill="currentColor" /></>,
  feito: <><circle cx="6" cy="6" r="5" fill="currentColor" /><path d="m3.6 6.1 1.6 1.6 3.2-3.3" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>,
};
const IcoEstado = ({ id, cor, size = 12 }) => <svg width={size} height={size} viewBox="0 0 12 12" style={{ color: cor }} aria-hidden="true">{ICONE_ESTADO[id] || ICONE_ESTADO.todo}</svg>;
const haQuanto = iso => {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (d <= 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  return dataCurta(iso) + '/' + String(trabDia(iso)).slice(2, 4);
};
const useLargo = (q = '(min-width: 900px)') => {
  const [l, setL] = useState(() => typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : true);
  useEffect(() => { if (!window.matchMedia) return undefined; const m = window.matchMedia(q); const f = () => setL(m.matches); m.addEventListener ? m.addEventListener('change', f) : m.addListener(f); return () => { m.removeEventListener ? m.removeEventListener('change', f) : m.removeListener(f); }; }, []);
  return l;
};
// Colunas da tabela: em ecrãs médios saem "Criada" e "Terminada" para o nome ter espaço
const COLS = 'grid grid-cols-[minmax(0,1fr)_132px_96px_108px_84px_96px_84px] items-center gap-x-3';
const COLS_CURTO = 'grid grid-cols-[minmax(0,1fr)_124px_108px_76px_80px] items-center gap-x-3';
// Grupos fechados/abertos (fica lembrado)
const useGruposFechados = () => {
  const [f, setF] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('trab-grupos-fechados')) || []); } catch (e) { return new Set(); } });
  const alternar = id => setF(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('trab-grupos-fechados', JSON.stringify([...n])); } catch (e) { /* sem armazenamento */ } return n; });
  return [f, alternar];
};
const LinhaTabela = ({ t, cu, clientes, theme, mudar, onAbrir, nomePasta, cheio = true }) => {
  const claro = useClaro(theme);
  const corre = (t.tempos || []).some(x => !x.fim);
  const v = trabValor(t, cu, clientes);
  const hoje = trabDia(new Date().toISOString());
  const atrasada = t.prazo && t.prazo < hoje && t.estado !== 'feito' && t.estado !== 'review';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [editar, setEditar] = useState(false);
  const gravarNome = v => { setEditar(false); const n = v.trim(); if (n && n !== t.nome) mudar(tr => opTarefa(tr, t.id, x => ({ ...x, nome: n }))); };
  return (
    <div className={`${cheio ? COLS : COLS_CURTO} group px-3 h-11 border-b text-[13px] transition-colors ${corre ? (claro ? 'bg-red-50/70 border-red-100' : 'bg-red-500/[0.06] border-red-500/10') : claro ? 'border-slate-100 hover:bg-slate-50' : 'border-white/[0.04] hover:bg-white/[0.03]'}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <EstadoPill estado={t.estado} theme={theme} compacto onMudar={e => mudar(tr => opEstado(tr, t.id, e))} />
        {editar ? (
          <input autoFocus defaultValue={t.nome} onFocus={e => e.target.select()} onBlur={e => gravarNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setEditar(false); } }}
            className={`flex-1 min-w-0 h-8 px-2 rounded-md text-[13px] font-medium outline-none ring-2 ring-blue-500 ${claro ? 'bg-white' : 'bg-slate-800'}`} aria-label="Nome da tarefa" />
        ) : (
          <>
            <button type="button" onClick={() => onAbrir(t.id)} className="min-w-0 text-left">
              <span className={`block truncate font-medium ${t.estado === 'feito' ? (claro ? 'text-slate-500' : 'text-slate-400') : ''}`} title={t.nome}>{t.nome}</span>
              {nomePasta && <span className={`block truncate text-[11px] -mt-0.5 ${sub}`}>{nomePasta}</span>}
            </button>
            <button type="button" onClick={() => setEditar(true)} className={`shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`} title="Mudar o nome" aria-label="Mudar o nome">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13l-3 1 1-3 8.5-8.5z" strokeLinejoin="round" /></svg>
            </button>
            {t.notas && <span className={`text-[11px] ${sub}`} title="Tem notas">📝</span>}
          </>
        )}
      </div>
      <div><EstadoPill estado={t.estado} theme={theme} onMudar={e => mudar(tr => opEstado(tr, t.id, e))} /></div>
      {cheio && <div className={sub}>{haQuanto(t.criada)}</div>}
      <div className="flex items-center gap-2">
        <BotaoCrono aCorrer={corre} theme={theme} pequeno onIniciar={() => mudar(tr => opIniciar(tr, t.id))} onParar={() => mudar(opParar)} />
        <span className={sub}><HorasVivas t={t} /></span>
      </div>
      <div className={`tabular-nums ${atrasada ? 'text-red-400 font-medium' : sub}`}>{t.prazo ? dataCurta(t.prazo) : '—'}</div>
      {cheio && <div className={sub}>{t.feita ? haQuanto(t.feita) : '—'}</div>}
      <div className={`text-right tabular-nums ${v ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'opacity-40'}`}>{v ? eur(v) : '—'}</div>
    </div>
  );
};
const ListaTarefas = ({ tarefas, trab, cu, clientes, theme, mudar, onAbrir, mostrarPasta, onCriarNoEstado }) => {
  const claro = useClaro(theme);
  const largo = useLargo();
  const cheio = useLargo('(min-width: 1400px)');
  const [fechados, alternar] = useGruposFechados();
  const [novaEm, setNovaEm] = useState(null);
  const [txt, setTxt] = useState('');
  const nomePasta = t => (mostrarPasta ? caminho(trab, t.pastaId).map(p => p.nome).slice(-2).join(' / ') : '');
  const grupos = ORDEM_GRUPOS.map(id => ({ ...TRAB_ESTADOS.find(e => e.id === id), lista: tarefas.filter(t => t.estado === id) })).filter(g => g.lista.length || (onCriarNoEstado && g.id === 'todo'));
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const criar = id => { if (txt.trim()) { onCriarNoEstado(txt, id); setTxt(''); } };
  if (!grupos.length) return <p className={`px-2 py-6 text-sm ${sub}`}>Sem tarefas.</p>;
  return (
    <div className="space-y-5">
      {grupos.map(g => {
        const fechado = fechados.has(g.id);
        const valor = g.lista.reduce((a, t) => a + trabValor(t, cu, clientes), 0);
        const horas = g.lista.reduce((a, t) => a + trabHoras(t), 0);
        return (
          <section key={g.id}>
            <div className="flex items-center gap-2 mb-1.5">
              <button type="button" onClick={() => alternar(g.id)} className={`w-5 h-5 inline-flex items-center justify-center rounded ${sub} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label={fechado ? 'Abrir grupo' : 'Fechar grupo'}>
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: fechado ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} aria-hidden="true"><path d="M1.5 3 5 7l3.5-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: g.cor }}>
                <IcoEstado id={g.id} cor="#fff" size={11} />{g.nome}
              </span>
              <span className={`text-xs ${sub}`}>{g.lista.length}</span>
              {(valor > 0 || horas > 0) && <span className={`text-xs ${sub}`}>· {horas > 0 ? tempoTxt(horas) : ''}{horas > 0 && valor > 0 ? ' · ' : ''}{valor > 0 ? eur(valor) : ''}</span>}
            </div>
            {!fechado && (
              <div className={`rounded-xl border ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
                {largo && g.lista.length > 0 && (
                  <div className={`${cheio ? COLS : COLS_CURTO} px-3 h-8 border-b text-[11px] font-medium ${claro ? 'border-slate-100 text-slate-400' : 'border-white/[0.05] text-slate-500'}`}>
                    <span>Nome</span><span>Estado</span>{cheio && <span>Criada</span>}<span>Tempo</span><span>Prazo</span>{cheio && <span>Terminada</span>}<span className="text-right">Valor</span>
                  </div>
                )}
                {g.lista.map(t => (largo
                  ? <LinhaTabela key={t.id} t={t} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={onAbrir} nomePasta={nomePasta(t)} cheio={cheio} />
                  : <div key={t.id} className={`border-b px-1 ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}><LinhaTarefa t={t} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={onAbrir} mostrarPasta={!!mostrarPasta} nomePasta={nomePasta(t)} /></div>))}
                {onCriarNoEstado && (novaEm === g.id ? (
                  <div className="flex items-center gap-2 px-3 h-11">
                    <IcoEstado id={g.id} cor={g.cor} />
                    <input autoFocus value={txt} onChange={e => setTxt(e.target.value)} placeholder="Nome da tarefa — Enter para criar, Esc para sair"
                      onKeyDown={e => { if (e.key === 'Enter') criar(g.id); if (e.key === 'Escape') { e.stopPropagation(); setNovaEm(null); setTxt(''); } }}
                      onBlur={() => { if (!txt.trim()) setNovaEm(null); }}
                      className="flex-1 bg-transparent text-[13px] focus:outline-none" />
                    <button type="button" onClick={() => criar(g.id)} className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white">Criar</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setNovaEm(g.id); setTxt(''); }} className={`w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left ${sub} ${claro ? 'hover:bg-slate-50' : 'hover:bg-white/[0.03]'}`}>+ Adicionar tarefa</button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

// ── Escrever uma tarefa nova (com o valor a aparecer enquanto escreves) ──
// Sugestões ao escrever uma tarefa nova: tipos de tarefa (com o nome em inglês, como no ClickUp) e nomes já usados
const semAcentos = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const sugestoesTarefa = (txt, cu, preco, nomesUsados) => {
  const m = /^\s*(\d+)\s*x?\s*(.*)$/i.exec(txt);
  const qtd = m && m[1] ? Number(m[1]) : null;
  const resto = semAcentos(m ? m[2] : txt).trim();
  if (!resto && !qtd) return [];
  const n = qtd || 1;
  const tipos = tiposDe(cu).filter(t => preco(t.id) > 0 || String(t.id).startsWith('x_'));
  const out = [];
  tipos.forEach(t => {
    const en = CU_NOMES_EN[t.id];
    const rot = en ? en[n === 1 ? 0 : 1] : t.nome;
    const alvos = [rot, t.nome, t.curto || '', en ? en[0] : ''].map(semAcentos);
    if (!resto || alvos.some(a => a.startsWith(resto) || a.split(/[\s/]+/).some(w => w.startsWith(resto)))) out.push({ k: 't:' + t.id, tipo: t.id, n, texto: `${n}x ${rot} - `, rot: `${n}x ${rot}`, sub: t.nome, valor: preco(t.id) * n });
  });
  if (resto && ['extra', 'ideation', 'ideacao', 'hora', 'call', 'reuniao', 'meeting'].some(a => a.startsWith(resto) || resto.startsWith(a))) out.push({ k: 'h', tipo: 'extra', n: 1, texto: 'Ideation / Extra work', rot: 'Ideation / Extra work', sub: 'à hora', valor: null });
  if (resto.length >= 2) {
    nomesUsados.filter(x => semAcentos(x).includes(resto) && !out.some(o => o.texto.trim() === x)).slice(0, 4)
      .forEach(x => out.push({ k: 'n:' + x, tipo: null, n: 0, texto: x, rot: x, sub: 'já usado', valor: null }));
  }
  return out.slice(0, 8);
};
const NovaTarefa = ({ onCriar, cid, cu, clientes, theme, inputClass, semPasta, nomesUsados = [] }) => {
  const [txt, setTxt] = useState('');
  const [prazo, setPrazo] = useState('');
  const [tipoEsc, setTipoEsc] = useState(null);
  const [foco, setFoco] = useState(false);
  const [ativa, setAtiva] = useState(-1);
  const inRef = useRef(null);
  const claro = useClaro(theme);
  const preco = tipo => cuPreco(cu, clientes, cid, tipo);
  const pecasEsc = tipoEsc ? { [tipoEsc.tipo]: tipoEsc.n } : null;
  const preview = txt.trim() ? trabValor({ nome: txt, cid, tempos: [], pecas: pecasEsc }, cu, clientes) : 0;
  const pecas = pecasEsc ? Object.entries(pecasEsc).map(([tipo, n]) => ({ tipo, n })).filter(p => p.tipo !== 'extra') : txt.trim() ? cuPecas(txt).filter(p => p.tipo !== 'outro') : [];
  const sug = foco && !semPasta && !tipoEsc ? sugestoesTarefa(txt, cu, preco, nomesUsados) : [];
  const escolher = o => {
    setTxt(o.texto);
    setTipoEsc(o.tipo ? { tipo: o.tipo, n: o.n } : null);
    setAtiva(-1);
    setTimeout(() => { const el = inRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
  };
  const criar = () => { if (!txt.trim()) return; onCriar(txt.replace(/\s*-\s*$/, ''), prazo, pecasEsc); setTxt(''); setTipoEsc(null); setAtiva(-1); };
  const nomeTipo = id => { const t = tiposDe(cu, { [id]: 1 }).find(x => x.id === id); return t ? (t.curto || t.nome) : id; };
  return (
    <div className={`relative rounded-xl border p-2 ${claro ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900/30'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <input ref={inRef} value={txt} onChange={e => { setTxt(e.target.value); setAtiva(-1); if (!e.target.value.trim()) setTipoEsc(null); }}
            onFocus={() => setFoco(true)} onBlur={() => setTimeout(() => setFoco(false), 150)}
            onKeyDown={e => {
              if (sug.length && e.key === 'ArrowDown') { e.preventDefault(); setAtiva(a => (a + 1) % sug.length); return; }
              if (sug.length && e.key === 'ArrowUp') { e.preventDefault(); setAtiva(a => (a <= 0 ? sug.length - 1 : a - 1)); return; }
              if (sug.length && (e.key === 'Tab') && !e.shiftKey) { e.preventDefault(); escolher(sug[Math.max(0, ativa)]); return; }
              if (e.key === 'Enter') { if (ativa >= 0 && sug[ativa]) escolher(sug[ativa]); else criar(); }
              if (e.key === 'Escape') { e.stopPropagation(); setFoco(false); }
            }}
            placeholder={semPasta ? 'Escolhe uma pasta à esquerda para criar tarefas' : 'Nova tarefa — começa a escrever (ex.: "new", "var", "2x ite")'} disabled={semPasta}
            className={`${inputClass} text-sm py-2`} role="combobox" aria-expanded={sug.length > 0} aria-autocomplete="list" />
          {sug.length > 0 && (
            <div role="listbox" className={`absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border shadow-xl overflow-hidden animate-modalIn ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
              {sug.map((o, i) => (
                <button key={o.k} type="button" role="option" aria-selected={i === ativa} onMouseDown={e => e.preventDefault()} onClick={() => escolher(o)} onMouseEnter={() => setAtiva(i)}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 text-left text-sm ${i === ativa ? (claro ? 'bg-blue-50' : 'bg-blue-500/15') : ''}`}>
                  <span className="flex-1 min-w-0 truncate">{o.rot}</span>
                  <span className={`text-[11px] ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{o.sub}</span>
                  {o.valor ? <span className={`text-xs tabular-nums ${claro ? 'text-emerald-700' : 'text-emerald-400'}`}>{eur(o.valor)}</span> : null}
                </button>
              ))}
              <p className={`px-3 py-1 text-[10px] border-t ${claro ? 'text-slate-400 border-slate-100' : 'text-slate-500 border-white/[0.06]'}`}>↑↓ para escolher · Tab ou Enter para usar · depois escreve o resto (ex.: o jogo)</p>
            </div>
          )}
        </div>
        <label className={`flex items-center gap-2 text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>Prazo
          <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} title="Prazo de entrega (opcional)" disabled={semPasta} className={`${inputClass} !w-auto text-sm py-2`} />
        </label>
        <button type="button" onClick={criar} disabled={!txt.trim() || semPasta} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">Adicionar</button>
      </div>
      {txt.trim() && (
        <p className={`mt-1.5 px-1 text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>
          {tipoEsc && <button type="button" onClick={() => setTipoEsc(null)} className="mr-1.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400" title="Tirar o tipo escolhido">{tipoEsc.tipo === 'extra' ? 'À hora' : `${tipoEsc.n} × ${nomeTipo(tipoEsc.tipo)}`} ✕</button>}
          {!tipoEsc && (pecas.length ? pecas.map(p => `${p.n} × ${nomeTipo(p.tipo)}`).join(' + ') : 'Tarefa sem peças (conta à hora)')}
          {preview > 0 && <> · vale <strong className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(preview)}</strong></>}
          <> · fica criada hoje, {dataCurta(new Date().toISOString())}</>
        </p>
      )}
    </div>
  );
};

// ── Notas e reuniões (de uma pasta ou de um cliente) ──
const Notas = ({ notas, onMudar, theme, inputClass }) => {
  const claro = useClaro(theme);
  const [nova, setNova] = useState({ tipo: 'reuniao', titulo: '', texto: '', data: trabDia(new Date().toISOString()) });
  const [editar, setEditar] = useState(null);
  const lista = [...(notas || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const guardar = () => {
    if (!nova.titulo.trim() && !nova.texto.trim()) return;
    onMudar([...(notas || []), { ...nova, id: trabId(), criada: agoraIso() }]);
    setNova({ tipo: nova.tipo, titulo: '', texto: '', data: trabDia(new Date().toISOString()) });
  };
  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-3 space-y-2 ${claro ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900/30'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex rounded-lg p-0.5 text-xs ${claro ? 'bg-slate-100' : 'bg-slate-800'}`}>
            {[['reuniao', 'Reunião'], ['nota', 'Nota']].map(([k, n]) => (
              <button key={k} type="button" onClick={() => setNova({ ...nova, tipo: k })} className={`px-2.5 py-1 rounded-md ${nova.tipo === k ? (claro ? 'bg-white shadow-sm' : 'bg-slate-600 text-white') : ''}`}>{n}</button>
            ))}
          </div>
          <input type="date" value={nova.data} onChange={e => setNova({ ...nova, data: e.target.value })} className={`${inputClass} !w-auto text-sm py-1`} />
          <input value={nova.titulo} onChange={e => setNova({ ...nova, titulo: e.target.value })} placeholder={nova.tipo === 'reuniao' ? 'Ex.: Kick-off Halloween' : 'Título'} className={`${inputClass} flex-1 min-w-[160px] text-sm py-1`} />
        </div>
        <textarea value={nova.texto} onChange={e => setNova({ ...nova, texto: e.target.value })} rows={3} placeholder={nova.tipo === 'reuniao' ? 'O que se falou, decisões, próximos passos…' : 'Escreve aqui…'} className={`${inputClass} text-sm`} />
        <div className="flex justify-end"><button type="button" onClick={guardar} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Guardar</button></div>
      </div>
      {lista.map(n => (
        <div key={n.id} className={`rounded-xl border p-3 ${claro ? 'border-slate-200' : 'border-slate-700/70'}`}>
          {editar === n.id ? (
            <div className="space-y-2">
              <input defaultValue={n.titulo} id={`nt-${n.id}`} className={`${inputClass} text-sm py-1`} />
              <textarea defaultValue={n.texto} id={`nx-${n.id}`} rows={4} className={`${inputClass} text-sm`} />
              <div className="flex justify-end gap-2">
                <button type="button" className="text-xs text-slate-400" onClick={() => setEditar(null)}>Cancelar</button>
                <button type="button" className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white" onClick={() => {
                  const ti = document.getElementById(`nt-${n.id}`).value, tx = document.getElementById(`nx-${n.id}`).value;
                  onMudar((notas || []).map(x => (x.id === n.id ? { ...x, titulo: ti, texto: tx } : x))); setEditar(null);
                }}>Guardar</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${n.tipo === 'reuniao' ? 'bg-violet-500/15 text-violet-400' : 'bg-slate-500/15 text-slate-400'}`}>{n.tipo === 'reuniao' ? 'Reunião' : 'Nota'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.titulo || '(sem título)'}</p>
                  <p className={`text-[11px] ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{dataCurta(n.data)}/{String(n.data || '').slice(0, 4)}</p>
                </div>
                <button type="button" className="text-xs text-slate-400 hover:text-blue-400" onClick={() => setEditar(n.id)}>Editar</button>
                <button type="button" className="text-xs text-slate-400 hover:text-red-400" onClick={() => { if (window.confirm('Apagar esta nota?')) onMudar((notas || []).filter(x => x.id !== n.id)); }}>Apagar</button>
              </div>
              {n.texto && <p className={`mt-2 text-sm whitespace-pre-wrap ${claro ? 'text-slate-700' : 'text-slate-300'}`}>{n.texto}</p>}
            </>
          )}
        </div>
      ))}
      {!lista.length && <p className={`text-sm ${claro ? 'text-slate-400' : 'text-slate-500'}`}>Ainda não há notas.</p>}
    </div>
  );
};

// ── Campo de número que só grava ao sair (não perde o foco enquanto escreves) ──
const NumIn = ({ valor, onGravar, className, placeholder, title, decimal = true }) => (
  <input key={String(valor ?? '')} defaultValue={valor ?? ''} placeholder={placeholder} title={title} inputMode={decimal ? 'decimal' : 'numeric'}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    onBlur={e => { const x = e.target.value.trim(); const atual = valor == null ? '' : String(valor); if (x !== atual) onGravar(x === '' ? null : (Number(x.replace(',', '.')) || 0)); }}
    className={className} />
);
const nomeTipo = id => { const t = CU_TIPOS.find(x => x.id === id); return t ? (t.curto || t.nome) : id; };
const TIPOS_PECA = CU_TIPOS.filter(t => !t.porHora);

// ── Orçamento da pasta: campos por tipo de peça, com quantidade, preço e valor ──
const Orcamento = ({ pasta, tarefas, cid, cu, clientes, theme, inputClass, onMudar, nomeCliente, onVerPrecos }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const orc = pasta.orcamento || {};
  const preco = tipo => cuPreco(cu, clientes, cid, tipo);
  const diaria = preco('dia'), hora = preco('hora');
  // Quantidades que vêm das tarefas da pasta (e subpastas)
  const auto = {};
  let horasExtra = 0, entregue = 0;
  const dias = new Set();
  tarefas.forEach(t => {
    trabPecas(t).forEach(p => { if (p.tipo === 'extra' || p.tipo === 'outro') horasExtra += trabHoras(t); else auto[p.tipo] = (auto[p.tipo] || 0) + p.n; });
    (t.tempos || []).forEach(x => { if (trabMsTempo(x) > 0) dias.add(trabDia(x.ini)); });
    if (trabEntrega(t)) entregue += trabValor(t, cu, clientes);
  });
  const qtdMao = orc.qtd || {};
  const precoMao = orc.preco || {};
  const qtd = tipo => (qtdMao[tipo] != null ? Number(qtdMao[tipo]) || 0 : auto[tipo] || 0);
  const pu = tipo => (precoMao[tipo] != null ? Number(precoMao[tipo]) || 0 : preco(tipo));
  // Linhas: os tipos com preço para este cliente, mais os que aparecem nas tarefas
  const tipos = tiposDe(cu, { ...auto, ...qtdMao }).filter(t => preco(t.id) > 0 || auto[t.id] || qtdMao[t.id] != null);
  const linhas = tipos.map(t => ({ id: t.id, nome: t.curto || t.nome, q: qtd(t.id), p: pu(t.id), auto: auto[t.id] || 0, mao: qtdMao[t.id] != null }));
  const hExtra = orc.horas != null ? Number(orc.horas) || 0 : horasExtra;
  const nDias = orc.dias != null ? Number(orc.dias) || 0 : dias.size;
  const subtotalPecas = linhas.reduce((a, l) => a + l.q * l.p, 0);
  const vExtra = diaria > 0 ? 0 : hExtra * hora;
  const vDias = diaria > 0 ? nDias * diaria : 0;
  const extras = (orc.extras || []).map(e => ({ ...e, v: Number(String(e.val ?? '').replace(',', '.')) || 0 }));
  const vExtras = extras.reduce((a, e) => a + e.v, 0);
  const total = subtotalPecas + vExtra + vDias + vExtras;
  const final = orc.acordado != null && orc.acordado !== '' ? Number(orc.acordado) : null;
  const ref = final ?? total;
  const setOrc = patch => onMudar({ ...orc, ...patch });
  // Subcontratações: o que pagas a outros freelancers (tarefas com custo + linhas à mão)
  const custosTarefas = tarefas.filter(t => Number(t.custoOutsourcing) > 0).map(t => ({ id: t.id, nome: t.nome, quem: t.outsourcing || '', v: Number(t.custoOutsourcing) || 0 }));
  const custosMao = (orc.custos || []).map(e => ({ ...e, v: Number(String(e.val ?? '').replace(',', '.')) || 0 }));
  const totalCustos = custosTarefas.reduce((a, c) => a + c.v, 0) + custosMao.reduce((a, c) => a + c.v, 0);
  const liquido = ref - totalCustos;
  const mudarCusto = (i, patch) => setOrc({ custos: (orc.custos || []).map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const setMapa = (campo, tipo, v) => { const m = { ...(orc[campo] || {}) }; if (v == null) delete m[tipo]; else m[tipo] = v; setOrc({ [campo]: m }); };
  const estados = [['rascunho', 'Rascunho'], ['enviado', 'Enviado'], ['aprovado', 'Aprovado'], ['faturado', 'Faturado']];
  const cel = `${inputClass} !w-full text-sm py-1 text-right tabular-nums`;
  const linha = `grid grid-cols-[minmax(0,1fr)_52px_64px_74px] sm:grid-cols-[minmax(0,1fr)_76px_96px_104px] items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5`;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
      <div className={`rounded-xl border ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
        <div className={`${linha} h-9 border-b text-[11px] font-medium ${claro ? 'border-slate-100 text-slate-400' : 'border-white/[0.05] text-slate-500'}`}>
          <span>Item</span><span className="text-right">Qtd.</span><span className="text-right">Preço</span><span className="text-right">Valor</span>
        </div>
        {linhas.map(l => (
          <div key={l.id} className={`${linha} border-b ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
            <span className="text-sm min-w-0 truncate">{l.nome}{l.mao && l.auto !== l.q && <span className={`ml-2 text-[11px] ${sub}`} title="Nas tarefas há outra quantidade">tarefas: {l.auto}</span>}</span>
            <NumIn valor={qtdMao[l.id] ?? null} placeholder={String(l.auto)} decimal={false} title="Vazio = conta pelas tarefas" onGravar={v => setMapa('qtd', l.id, v)} className={cel} />
            <NumIn valor={precoMao[l.id] ?? null} placeholder={String(preco(l.id))} title="Vazio = preço do cliente" onGravar={v => setMapa('preco', l.id, v)} className={cel} />
            <span className={`text-right text-sm tabular-nums ${l.q * l.p ? '' : 'opacity-40'}`}>{eur(l.q * l.p)}</span>
          </div>
        ))}
        {diaria > 0 ? (
          <div className={`${linha} border-b ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
            <span className="text-sm">Dias</span>
            <NumIn valor={orc.dias ?? null} placeholder={String(dias.size)} decimal={false} onGravar={v => setOrc({ dias: v })} className={cel} />
            <span className={`text-right text-sm ${sub}`}>{eur(diaria)}</span>
            <span className="text-right text-sm tabular-nums">{eur(vDias)}</span>
          </div>
        ) : (
          <div className={`${linha} border-b ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
            <span className="text-sm leading-tight">Horas extra <span className={`block sm:inline text-[11px] ${sub}`}>(registadas: {tempoTxt(horasExtra)})</span></span>
            <NumIn valor={orc.horas ?? null} placeholder={String(Math.round(horasExtra * 100) / 100).replace('.', ',')} title="Horas (ex.: 4,5)" onGravar={v => setOrc({ horas: v })} className={cel} />
            <span className={`text-right text-sm ${sub}`}>{eur(hora)}/h</span>
            <span className="text-right text-sm tabular-nums">{eur(vExtra)}</span>
          </div>
        )}
        {extras.map((e, i) => (
          <div key={i} className={`grid grid-cols-[minmax(0,1fr)_92px_24px] sm:grid-cols-[minmax(0,1fr)_128px_104px_28px] items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 border-b ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
            <input defaultValue={e.desc || ''} placeholder="Ex.: AI Credits, acerto, licença…" onBlur={ev => setOrc({ extras: orc.extras.map((x, k) => (k === i ? { ...x, desc: ev.target.value } : x)) })} className={`${inputClass} !w-full text-sm py-1 col-span-3 sm:col-span-1`} />
            <input type="date" defaultValue={e.data || trabDia(new Date().toISOString())} title="Mês em que conta nas receitas" onBlur={ev => setOrc({ extras: orc.extras.map((x, k) => (k === i ? { ...x, data: ev.target.value } : x)) })} className={`${inputClass} !w-full text-xs py-1 col-span-1`} />
            <NumIn valor={e.val === '' ? null : e.val} placeholder="€ (pode ser negativo)" onGravar={v => setOrc({ extras: orc.extras.map((x, k) => (k === i ? { ...x, val: v } : x)) })} className={cel} />
            <button type="button" className={`text-xs ${sub} hover:text-red-400`} onClick={() => setOrc({ extras: orc.extras.filter((_, k) => k !== i) })} aria-label="Tirar linha">✕</button>
          </div>
        ))}
        <div className="px-3 py-2"><button type="button" className="text-xs text-blue-400 hover:text-blue-300" onClick={() => setOrc({ extras: [...(orc.extras || []), { desc: '', val: '', data: trabDia(new Date().toISOString()) }] })}>+ Linha à parte (AI Credits, compras, acertos…)</button></div>
        <div className={`${linha} border-t ${claro ? 'border-slate-200' : 'border-white/[0.08]'}`}>
          <span className="text-sm font-semibold col-span-3">Total calculado</span>
          <span className="text-right text-base font-bold tabular-nums">{eur(total)}</span>
        </div>
        <div className={`${linha} pb-3`}>
          <span className="text-sm font-semibold col-span-3">Valor final <span className={`font-normal text-[11px] ${sub}`}>o que vais faturar (vazio = total)</span></span>
          <NumIn valor={orc.acordado ?? null} placeholder={String(Math.round(total))} onGravar={v => setOrc({ acordado: v })} className={`${cel} font-semibold`} />
        </div>
        {/* Subcontratações */}
        <div className={`border-t px-2 sm:px-3 pt-3 pb-2 ${claro ? 'border-slate-200 bg-slate-50/60' : 'border-white/[0.08] bg-black/10'}`}>
          <p className="text-sm font-semibold">Subcontratações <span className={`font-normal text-[11px] ${sub}`}>o que pagas a outros freelancers — desconta no que te fica</span></p>
          <div className="mt-1.5">
            {custosTarefas.map(c => (
              <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_104px] items-center gap-2 py-1 text-sm">
                <span className="min-w-0 truncate" title="Vem do campo Outsourcing da tarefa">{c.quem ? <strong className="font-medium">{c.quem}</strong> : null}{c.quem ? ' · ' : ''}<span className={sub}>{c.nome}</span></span>
                <span className="text-right tabular-nums text-red-400">−{eur(c.v)}</span>
              </div>
            ))}
            {custosMao.map((e, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_92px_24px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_128px_104px_28px] items-center gap-1.5 sm:gap-2 py-1">
                <input defaultValue={e.quem || ''} placeholder="Quem (ex.: Ana)" onBlur={ev => mudarCusto(i, { quem: ev.target.value.trim() })} className={`${inputClass} !w-full text-sm py-1 col-span-3 sm:col-span-1`} />
                <input defaultValue={e.desc || ''} placeholder="O quê (ex.: 3 vídeos)" onBlur={ev => mudarCusto(i, { desc: ev.target.value })} className={`${inputClass} !w-full text-sm py-1 col-span-3 sm:col-span-1`} />
                <input type="date" defaultValue={e.data || trabDia(new Date().toISOString())} title="Mês em que desconta" onBlur={ev => mudarCusto(i, { data: ev.target.value })} className={`${inputClass} !w-full text-xs py-1`} />
                <NumIn valor={e.val === '' ? null : e.val} placeholder="€ que pagas" onGravar={v => mudarCusto(i, { val: v })} className={cel} />
                <button type="button" className={`text-xs ${sub} hover:text-red-400`} onClick={() => setOrc({ custos: (orc.custos || []).filter((_, k) => k !== i) })} aria-label="Tirar subcontratação">✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-1 text-xs text-blue-400 hover:text-blue-300" onClick={() => setOrc({ custos: [...(orc.custos || []), { quem: '', desc: '', val: '', data: trabDia(new Date().toISOString()) }] })}>+ Subcontratação</button>
          {!custosTarefas.length && !custosMao.length && <p className={`mt-1 text-[11px] ${sub}`}>Também podes pôr o custo dentro de cada tarefa (campo Outsourcing) — aparece aqui sozinho.</p>}
          {totalCustos > 0 && (
            <div className="mt-2 pt-2 border-t border-dashed border-slate-500/30 grid grid-cols-[minmax(0,1fr)_104px] gap-2 text-sm">
              <span className={sub}>Total subcontratado</span><span className="text-right tabular-nums text-red-400">−{eur(totalCustos)}</span>
              <span className="font-semibold">Fica para ti</span><span className={`text-right tabular-nums font-bold ${liquido >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}`}>{eur(liquido)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-3 xl:grid-cols-1 gap-2">
          {[['A faturar', eur(ref)], ...(totalCustos > 0 ? [['Fica para ti', eur(liquido)]] : []), ['Já entregue', eur(entregue)], ['Falta entregar', eur(Math.max(0, ref - entregue))]].map(([k, v]) => (
            <div key={k} className={`rounded-xl p-3 ${claro ? 'bg-slate-100' : 'bg-slate-800/60'}`}><p className={`text-[11px] ${sub}`}>{k}</p><p className="text-lg font-semibold tabular-nums">{v}</p></div>
          ))}
        </div>
        {ref > 0 && (
          <div>
            <div className={`flex justify-between text-[11px] mb-1 ${sub}`}><span>Já entregaste</span><span className="tabular-nums">{Math.round(Math.min(100, (entregue / ref) * 100))}% do valor</span></div>
            <div className={`h-2 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700/60'}`}><div className="h-full rounded-full bg-emerald-500 progress-animated" style={{ width: `${Math.min(100, (entregue / ref) * 100)}%` }} /></div>
          </div>
        )}
        {final != null && Math.abs(final - total) >= 1 && <p className={`text-xs ${sub}`}>Diferença para o calculado: {final > total ? '+' : '−'}{eur(Math.abs(final - total))}</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className={`text-xs ${sub} mr-1`} title="Só para te organizares; não muda as contas">Orçamento:</span>
          {estados.map(([k, n]) => (
            <button key={k} type="button" onClick={() => setOrc({ estado: k })} className={`px-2.5 py-1 rounded-full text-xs border ${(orc.estado || 'rascunho') === k ? 'border-violet-400 bg-violet-500/15 text-violet-400' : claro ? 'border-slate-200 text-slate-500' : 'border-slate-700 text-slate-400'}`}>{n}</button>
          ))}
        </div>
        <p className={`text-[11px] ${sub}`}>Marca em que ponto está o orçamento (rascunho, enviado ao cliente, aprovado, faturado). É só para te organizares — não muda as contas.</p>
        <p className={`text-[11px] ${sub}`}>As quantidades vêm das tarefas desta pasta; escreve por cima para mudar. As linhas à parte entram nas receitas estimadas no mês da data delas; as subcontratações descontam nesse mês.</p>
        {onVerPrecos && <button type="button" onClick={onVerPrecos} className="text-xs text-blue-400 hover:text-blue-300">✏️ Mudar os preços de {nomeCliente || 'este cliente'} →</button>}
      </div>
    </div>
  );
};

// ── Preços do cliente (alimentam o valor das tarefas, os orçamentos e as receitas estimadas) ──
const PrecosCliente = ({ cid, nome, cu, clientes, theme, inputClass, onPrecos }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const precos = (cu && cu.precos) || {};
  const meus = (precos.porCliente || {})[cid] || {};
  const pre = cuPresetCliente(clientes, cid);
  const padrao = { ...CU_PRECOS_PADRAO, ...(precos.padrao || {}) };
  const gravar = (campo, v) => {
    const pc = { ...meus };
    if (v == null) delete pc[campo]; else pc[campo] = v;
    onPrecos({ ...precos, porCliente: { ...(precos.porCliente || {}), [cid]: pc } });
  };
  return (
    <div className="space-y-3 max-w-3xl">
      <p className={`text-sm ${sub}`}>Preços de <strong className={claro ? 'text-slate-800' : 'text-slate-100'}>{nome}</strong>. Contam no valor de cada tarefa, nos orçamentos e nas receitas estimadas. Vazio = usa o padrão.</p>
      <div className={`rounded-xl border ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
        {[...tiposDe(cu), ...CAMPOS_EXTRA_PRECO].map(t => {
          const base = pre[t.id] != null ? pre[t.id] : padrao[t.id];
          return (
            <div key={t.id} className={`grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 px-3 py-1.5 border-b last:border-b-0 ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
              <span className="text-sm">{t.nome}</span>
              <NumIn valor={meus[t.id] ?? null} placeholder={base != null ? String(base) : '—'} onGravar={v => gravar(t.id, v)} className={`${inputClass} !w-full text-sm py-1 text-right tabular-nums`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Detalhe de uma tarefa (painel lateral) ──
const PRIORIDADES = [['urgente', 'Urgente', '#ef4444'], ['alta', 'Alta', '#f59e0b'], ['normal', 'Normal', '#3b82f6'], ['baixa', 'Baixa', '#94a3b8']];
const FORMATOS = ['9:16', '1:1', '4:5', '16:9'];
const DetalheTarefa = ({ t, trab, cu, clientes, theme, inputClass, mudar, onFechar }) => {
  const claro = useClaro(theme);
  const [hManual, setHManual] = useState('');
  const [diaManual, setDiaManual] = useState(trabDia(new Date().toISOString()));
  const [maisTipos, setMaisTipos] = useState(false);
  const [varias, setVarias] = useState(false);
  const [gravou, setGravou] = useState(false);
  useEffect(() => { if (!gravou) return undefined; const i = setTimeout(() => setGravou(false), 1600); return () => clearTimeout(i); }, [gravou]);
  useEffect(() => { const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [onFechar]);
  if (!t) return null;
  const set = patch => mudar(tr => opTarefa(tr, t.id, x => ({ ...x, ...patch })));
  const v = trabValor(t, cu, clientes);
  const vAuto = trabValorAuto(t, cu, clientes);
  const corre = (t.tempos || []).some(x => !x.fim);
  const pastasCli = (trab.pastas || []).filter(p => String(p.cid) === String(t.cid));
  const caminhoTxt = p => caminho(trab, p.id).map(x => x.nome).join(' / ');
  const lab = `text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`;
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const caixa = `rounded-xl border p-3 ${claro ? 'border-slate-200' : 'border-slate-700'}`;
  // Peças da tarefa: à mão (t.pecas) ou lidas do nome
  const pecasAtuais = {}; trabPecas(t).forEach(p => { if (p.tipo !== 'outro' && p.tipo !== 'extra') pecasAtuais[p.tipo] = (pecasAtuais[p.tipo] || 0) + p.n; });
  const temMao = t.pecas && Object.keys(t.pecas).length > 0;
  const preco = tipo => cuPreco(cu, clientes, t.cid, tipo);
  const tiposVis = tiposDe(cu, pecasAtuais).filter(x => maisTipos || preco(x.id) > 0 || pecasAtuais[x.id]);
  const setPeca = (tipo, n) => { const base = temMao ? { ...t.pecas } : { ...pecasAtuais }; if (!n) delete base[tipo]; else base[tipo] = n; set({ pecas: base }); };
  const horasTarefa = trabHoras(t);
  const est = Number(t.estimativa) || 0;
  const prio = PRIORIDADES.find(x => x[0] === t.prioridade);
  const custo = Number(t.custoOutsourcing) || 0;
  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }} style={{ background: 'rgba(0,0,0,.45)' }}>
      <div className={`w-full max-w-xl h-full overflow-y-auto shadow-2xl animate-slideInRight ${claro ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}>
        <div className={`sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b ${claro ? 'bg-white/95 border-slate-200' : 'bg-slate-900/95 border-slate-700'}`}>
          <EstadoPill estado={t.estado} theme={theme} onMudar={e => mudar(tr => opEstado(tr, t.id, e))} />
          {prio && <span className="text-xs font-medium" style={{ color: prio[2] }}>⚑ {prio[1]}</span>}
          <span className="flex-1" />
          <span className={`text-sm tabular-nums ${sub}`}><HorasVivas t={t} /></span>
          <BotaoCrono aCorrer={corre} theme={theme} onIniciar={() => mudar(tr => opIniciar(tr, t.id))} onParar={() => mudar(opParar)} />
          <button type="button" onClick={onFechar} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/10" aria-label="Fechar">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <textarea key={t.id + 'n'} defaultValue={t.nome} rows={2} onBlur={e => { const n = e.target.value.trim(); if (n && n !== t.nome) set({ nome: n }); }}
            className={`w-full bg-transparent text-lg font-semibold resize-none focus:outline-none rounded-lg px-1 ${claro ? 'focus:bg-slate-50' : 'focus:bg-white/5'}`} />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 min-w-0 col-span-2"><span className={lab}>Pasta</span>
              <select value={t.pastaId || ''} onChange={e => set({ pastaId: e.target.value || null })} className={`${inputClass} text-sm py-1.5`}>
                {pastasCli.map(p => <option key={p.id} value={p.id}>{caminhoTxt(p)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Prazo</span>
              <input type="date" value={t.prazo || ''} onChange={e => set({ prazo: e.target.value })} className={`${inputClass} text-sm py-1.5`} />
            </label>
            <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Prioridade</span>
              <select value={t.prioridade || ''} onChange={e => set({ prioridade: e.target.value || null })} className={`${inputClass} text-sm py-1.5`}>
                <option value="">—</option>{PRIORIDADES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Estimativa de horas</span>
              <NumIn valor={t.estimativa ?? null} placeholder="ex.: 6" onGravar={x => set({ estimativa: x })} className={`${inputClass} text-sm py-1.5`} />
            </label>
            <div className="flex flex-col gap-1 min-w-0"><span className={lab}>Tempo vs estimativa</span>
              <p className={`text-sm py-1.5 tabular-nums ${est && horasTarefa > est ? 'text-red-400' : ''}`}>{tempoTxt(horasTarefa)}{est ? ` de ${tempoTxt(est)} (${Math.round(horasTarefa / est * 100)}%)` : ''}</p>
            </div>
          </div>

          {/* Valor da tarefa: peças por tipo, com preço do cliente */}
          <div className={caixa}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Valor</p>
              <p className={`text-lg font-semibold tabular-nums ${claro ? 'text-emerald-700' : 'text-emerald-400'}`}>{eur(v)}</p>
            </div>
            {(() => {
              const pecasT = trabPecas(t);
              const porHora = pecasT.some(p => p.tipo === 'extra' || p.tipo === 'outro');
              const tiposCom = Object.keys(pecasAtuais);
              const simples = !porHora && tiposCom.length === 1 && pecasAtuais[tiposCom[0]] === 1;
              const multi = !porHora && (tiposCom.length > 1 || (tiposCom.length === 1 && pecasAtuais[tiposCom[0]] > 1));
              const verQtd = varias || multi;
              const chip = on => `px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'border-blue-400 bg-blue-500/15 text-blue-400 font-medium' : claro ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-white/5'}`;
              const linhaHoras = porHora && (
                <div className="grid grid-cols-[minmax(0,1fr)_64px_72px_80px] items-center gap-2 text-sm">
                  <span>Horas (à hora)</span><span className="text-right tabular-nums">{tempoTxt(horasTarefa)}</span>
                  <span className={`text-right text-xs ${sub}`}>× {eur(preco('hora'))}/h</span>
                  <span className="text-right tabular-nums">{preco('dia') > 0 ? 'nos dias' : eur(horasTarefa * preco('hora'))}</span>
                </div>
              );
              return (
                <>
                  {!verQtd ? (
                    <div>
                      <span className={lab}>O que é esta tarefa? <span className={gravou ? 'text-emerald-400' : 'opacity-70'}>{gravou ? '✓ gravado' : '— carrega noutro para mudar, grava logo'}</span></span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {tiposVis.map(x => (
                          <button key={x.id} type="button" onClick={() => { set({ pecas: { [x.id]: 1 } }); setGravou(true); }} className={chip(simples && tiposCom[0] === x.id)}>
                            {x.curto || x.nome} <span className="opacity-60 tabular-nums">{eur(preco(x.id))}</span>
                          </button>
                        ))}
                        <button type="button" onClick={() => { set({ pecas: { extra: 1 } }); setGravou(true); }} className={chip(porHora)}>
                          À hora <span className="opacity-60 tabular-nums">{preco('dia') > 0 ? `${eur(preco('dia'))}/dia` : `${eur(preco('hora'))}/h`}</span>
                        </button>
                      </div>
                      {porHora && <div className="mt-2">{linhaHoras}</div>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {tiposVis.map(x => {
                        const n = pecasAtuais[x.id] || 0;
                        return (
                          <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_64px_72px_80px] items-center gap-2 text-sm">
                            <span className={n ? '' : sub}>{x.curto || x.nome}</span>
                            <NumIn valor={n || null} placeholder="0" decimal={false} onGravar={q => setPeca(x.id, q || 0)} className={`${inputClass} !w-full text-sm py-1 text-right`} />
                            <span className={`text-right text-xs ${sub}`}>× {eur(preco(x.id))}</span>
                            <span className="text-right tabular-nums">{n ? eur(n * preco(x.id)) : '—'}</span>
                          </div>
                        );
                      })}
                      {linhaHoras}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {!multi && <button type="button" className="text-blue-400 hover:text-blue-300" onClick={() => setVarias(!varias)}>{varias ? 'só uma peça' : 'várias peças nesta tarefa'}</button>}
                    <button type="button" className="text-blue-400 hover:text-blue-300" onClick={() => setMaisTipos(!maisTipos)}>{maisTipos ? 'menos tipos' : 'mais tipos'}</button>
                    {temMao ? <button type="button" className={`${sub} hover:text-blue-400`} onClick={() => set({ pecas: null })}>voltar a ler do nome</button> : <span className={sub}>lido do nome da tarefa</span>}
                  </div>
                </>
              );
            })()}
            <div className={`mt-3 pt-3 border-t grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
              <span className="text-sm">Valor final <span className={`text-[11px] ${sub}`}>(vazio = {eur(vAuto)})</span></span>
              <NumIn valor={t.valorManual ?? null} placeholder={String(Math.round(vAuto))} onGravar={x => set({ valorManual: x })} className={`${inputClass} !w-full text-sm py-1 text-right font-semibold`} />
            </div>
          </div>

          {/* Entrega */}
          <div className={`${caixa} space-y-3`}>
            <p className="text-sm font-medium">Entrega</p>
            <div>
              <span className={lab}>Formatos</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {FORMATOS.map(f => { const on = (t.formatos || []).includes(f); return (
                  <button key={f} type="button" onClick={() => set({ formatos: on ? (t.formatos || []).filter(x => x !== f) : [...(t.formatos || []), f] })}
                    className={`px-2.5 py-1 rounded-md text-xs border ${on ? 'border-blue-400 bg-blue-500/15 text-blue-400' : claro ? 'border-slate-200 text-slate-500' : 'border-slate-700 text-slate-400'}`}>{f}</button>
                ); })}
              </div>
            </div>
            <label className="flex flex-col gap-1"><span className={lab}>Link da entrega (Frame.io, Drive…)</span>
              <div className="flex gap-2">
                <input key={t.id + 'l' + (t.link || '')} defaultValue={t.link || ''} placeholder="https://" onBlur={e => { if (e.target.value !== (t.link || '')) set({ link: e.target.value.trim() }); }} className={`${inputClass} text-sm py-1.5`} />
                {t.link && <a href={t.link} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white flex items-center">Abrir</a>}
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!t.faturada} onChange={e => set({ faturada: e.target.checked })} />
              Já faturada ao cliente
            </label>
          </div>

          {/* Outsourcing */}
          <div className={`${caixa} space-y-2`}>
            <p className="text-sm font-medium">Subcontratação <span className={`font-normal text-xs ${sub}`}>(se passaste a tarefa a outro freelancer — desconta no mês em que a entregas)</span></p>
            <div className="grid grid-cols-2 gap-2">
              <input key={t.id + 'q' + (t.outsourcing || '')} defaultValue={t.outsourcing || ''} placeholder="Quem fez" onBlur={e => { if (e.target.value !== (t.outsourcing || '')) set({ outsourcing: e.target.value.trim() }); }} className={`${inputClass} text-sm py-1.5`} />
              <NumIn valor={t.custoOutsourcing ?? null} placeholder="Quanto lhe pagas (€)" onGravar={x => set({ custoOutsourcing: x })} className={`${inputClass} text-sm py-1.5`} />
            </div>
            {custo > 0 && <p className="text-sm">Margem: <strong className={v - custo >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}>{eur(v - custo)}</strong> <span className={sub}>({v ? Math.round((v - custo) / v * 100) : 0}%)</span></p>}
          </div>

          {/* Tempo */}
          <div className={caixa}>
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium">Tempo</p><p className="text-sm tabular-nums font-semibold"><HorasVivas t={t} /></p></div>
            <div className="space-y-1">
              {(t.tempos || []).slice().reverse().map(x => (
                <div key={x.id} className="flex items-center gap-2 text-xs">
                  <input type="datetime-local" defaultValue={paraInputLocal(x.ini)} key={x.ini} onBlur={e => { if (!e.target.value) return; const ini = new Date(e.target.value).toISOString(); mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: y.tempos.map(z => (z.id === x.id ? { ...z, ini } : z)) }))); }} className={`${inputClass} !w-auto text-xs py-1`} />
                  <span className="opacity-50">→</span>
                  {x.fim ? <input type="datetime-local" defaultValue={paraInputLocal(x.fim)} key={x.fim} onBlur={e => { if (!e.target.value) return; const fim = new Date(e.target.value).toISOString(); mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: y.tempos.map(z => (z.id === x.id ? { ...z, fim } : z)) }))); }} className={`${inputClass} !w-auto text-xs py-1`} />
                    : <span className="text-red-400 font-medium">a correr</span>}
                  <span className="flex-1 text-right tabular-nums">{tempoTxt(trabMsTempo(x) / 3600000)}</span>
                  <button type="button" className="text-slate-400 hover:text-red-400" aria-label="Apagar este tempo" onClick={() => mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: y.tempos.filter(z => z.id !== x.id) })))}>✕</button>
                </div>
              ))}
              {!(t.tempos || []).length && <p className={lab}>Ainda sem tempo registado. Usa o ▶ ou acrescenta à mão.</p>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input type="date" value={diaManual} onChange={e => setDiaManual(e.target.value)} className={`${inputClass} !w-auto text-xs py-1`} />
              <input value={hManual} onChange={e => setHManual(e.target.value)} placeholder="ex.: 2h30" className={`${inputClass} !w-24 text-xs py-1`} />
              <button type="button" className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white disabled:opacity-40" disabled={!cuLerHoras(hManual)} onClick={() => {
                const h = cuLerHoras(hManual); if (!h) return;
                const ini = new Date(`${diaManual}T09:00`); const fim = new Date(ini.getTime() + h * 3600000);
                mudar(tr => opTarefa(tr, t.id, y => ({ ...y, iniciada: y.iniciada || ini.toISOString(), tempos: [...(y.tempos || []), { id: trabId(), ini: ini.toISOString(), fim: fim.toISOString(), manual: true }] })));
                setHManual('');
              }}>+ Acrescentar</button>
            </div>
          </div>

          <div className={`${caixa} text-xs space-y-1`}>
            <p className="text-sm font-medium mb-1">Registo automático</p>
            {[['Criada', t.criada], ['Começada', t.iniciada], ['Posta em review', t.review], ['Terminada', t.feita]].map(([k, d]) => (
              <div key={k} className="flex justify-between"><span className={lab}>{k}</span><span className="tabular-nums">{dataHora(d)}</span></div>
            ))}
          </div>

          <label className="flex flex-col gap-1"><span className={lab}>Notas da tarefa</span>
            <textarea key={t.id + 'x'} defaultValue={t.notas || ''} rows={4} onBlur={e => { if (e.target.value !== (t.notas || '')) set({ notas: e.target.value }); }} className={`${inputClass} text-sm`} placeholder="Feedback do cliente, ideias, referências…" />
          </label>
          <div className="flex justify-between">
            <button type="button" className="text-xs text-slate-400 hover:text-blue-400" onClick={() => mudar(tr => ({ ...tr, tarefas: [...tr.tarefas, { ...t, id: trabId(), nome: t.nome + ' (cópia)', estado: 'todo', tempos: [], criada: agoraIso(), iniciada: null, review: null, feita: null, faturada: false }] }))}>Duplicar</button>
            <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => { if (window.confirm('Apagar esta tarefa?')) { mudar(tr => ({ ...tr, tarefas: tr.tarefas.filter(x => x.id !== t.id) })); onFechar(); } }}>Apagar tarefa</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Árvore de pastas ──
const NoPasta = ({ p, trab, nivel, sel, setSel, abertas, alternar, theme, contar, onFav, onSub }) => {
  const claro = useClaro(theme);
  const fav = (trab.favoritos || []).includes(p.id);
  const filhas = filhasDe(trab, p.id);
  const aberta = abertas.has(p.id);
  const ativo = sel.tipo === 'pasta' && sel.id === p.id;
  const n = contar(p.id);
  return (
    <div>
      <div className={`group flex items-center gap-1 rounded-lg pr-2 text-sm cursor-pointer ${ativo ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`} style={{ paddingLeft: 4 + nivel * 14 }}>
        <button type="button" onClick={() => alternar(p.id)} className={`w-5 h-6 inline-flex items-center justify-center ${filhas.length ? '' : 'invisible'} ${claro ? 'text-slate-400' : 'text-slate-500'}`} aria-label={aberta ? 'Fechar' : 'Abrir'}>
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: aberta ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} aria-hidden="true"><path d="M3 1.5 7 5l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <button type="button" onClick={() => setSel({ tipo: 'pasta', id: p.id })} className="flex-1 min-w-0 flex items-start gap-2 py-1.5 text-left">
          <span className="w-2.5 h-2.5 mt-[5px] rounded-[3px] flex-shrink-0" style={{ background: p.cor || '#64748b' }} />
          <span className="break-words leading-snug">{p.nome}</span>
        </button>
        <button type="button" onClick={() => onSub(p)} title="Nova subpasta" aria-label={`Nova subpasta em ${p.nome}`}
          className={`w-5 h-5 inline-flex items-center justify-center rounded text-[15px] leading-none opacity-0 group-hover:opacity-100 ${claro ? 'text-slate-400 hover:text-blue-600' : 'text-slate-500 hover:text-blue-400'}`}>+</button>
        <button type="button" onClick={() => onFav(p.id)} title={fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'} aria-label={fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'}
          className={`w-5 h-5 inline-flex items-center justify-center rounded text-[13px] leading-none ${fav ? 'text-amber-400' : `opacity-0 group-hover:opacity-100 ${claro ? 'text-slate-400 hover:text-amber-500' : 'text-slate-500 hover:text-amber-400'}`}`}>{fav ? '★' : '☆'}</button>
        {n > 0 && <span className={`text-[11px] tabular-nums w-5 text-right ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{n}</span>}
      </div>
      {aberta && filhas.map(f => <NoPasta key={f.id} p={f} trab={trab} nivel={nivel + 1} sel={sel} setSel={setSel} abertas={abertas} alternar={alternar} theme={theme} contar={contar} onFav={onFav} onSub={onSub} />)}
    </div>
  );
};

// ── Visão geral (sem pasta escolhida) ──
// ── Tipos de tarefa (base de dados): nome, preço padrão e preço de cada cliente ──
// Os tipos de base vêm da app; podes mudar-lhes o nome, escondê-los ou criar tipos novos.
const tiposDe = (cu, usados = {}) => {
  const ocultos = new Set((cu && cu.tiposOcultos) || []);
  const nomes = (cu && cu.tiposNomes) || {};
  const base = CU_TIPOS.filter(t => !t.porHora).map(t => (nomes[t.id] ? { ...t, nome: nomes[t.id], curto: nomes[t.id] } : t));
  return [...base, ...((cu && cu.tiposExtra) || [])].filter(t => !ocultos.has(t.id) || usados[t.id]);
};
const CAMPOS_EXTRA_PRECO = [
  { id: 'hora', nome: 'Hora (extras / ideação)' },
  { id: 'dia', nome: 'Diária (cada dia com horas = 1 dia)' },
  { id: 'retainer', nome: 'Mínimo mensal garantido' },
];
const TiposTarefa = ({ cu, clientes, theme, inputClass, onPrecos, onCu }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const borda = claro ? 'border-slate-100' : 'border-white/[0.05]';
  const [novo, setNovo] = useState('');
  const [verOcultos, setVerOcultos] = useState(false);
  const precos = (cu && cu.precos) || {};
  const padrao = { ...CU_PRECOS_PADRAO, ...(precos.padrao || {}) };
  const ocultos = new Set((cu && cu.tiposOcultos) || []);
  const nomes = (cu && cu.tiposNomes) || {};
  const extra = (cu && cu.tiposExtra) || [];
  const clis = clientes.filter(c => c.estado !== 'antigo');
  const todos = [...CU_TIPOS.filter(t => !t.porHora).map(t => ({ ...t, base: true, nome: nomes[t.id] || t.nome })), ...extra.map(t => ({ ...t, base: false }))];
  const linhas = todos.filter(t => verOcultos || !ocultos.has(t.id));
  const gravarPadrao = (tipo, v) => { const p = { ...(precos.padrao || {}) }; if (v == null) delete p[tipo]; else p[tipo] = v; onPrecos({ ...precos, padrao: p }); };
  const gravarCli = (cid, tipo, v) => {
    const pc = { ...((precos.porCliente || {})[cid] || {}) };
    if (v == null) delete pc[tipo]; else pc[tipo] = v;
    onPrecos({ ...precos, porCliente: { ...(precos.porCliente || {}), [cid]: pc } });
  };
  const valCli = (cid, tipo) => { const pc = (precos.porCliente || {})[cid] || {}; return pc[tipo] != null && pc[tipo] !== '' ? pc[tipo] : null; };
  const herdado = (cid, tipo) => { const pre = cuPresetCliente(clientes, cid); return pre[tipo] != null ? pre[tipo] : padrao[tipo]; };
  const mudarNome = (t, v) => {
    if (!v) return;
    if (t.base) { const n = { ...nomes }; const orig = (CU_TIPOS.find(x => x.id === t.id) || {}).nome; if (v === orig) delete n[t.id]; else n[t.id] = v; onCu({ tiposNomes: n }); }
    else onCu({ tiposExtra: extra.map(x => (x.id === t.id ? { ...x, nome: v, curto: v } : x)) });
  };
  const alternarOculto = t => { const s = new Set(ocultos); if (s.has(t.id)) s.delete(t.id); else s.add(t.id); onCu({ tiposOcultos: [...s] }); };
  const criar = () => {
    const nome = novo.trim(); if (!nome) return;
    const id = 'x_' + nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) + '_' + Date.now().toString(36).slice(-4);
    onCu({ tiposExtra: [...extra, { id, nome, curto: nome, plural: nome.toLowerCase() }] });
    setNovo('');
  };
  const cel = `${inputClass} !w-full text-sm py-1 text-right tabular-nums`;
  const cols = { gridTemplateColumns: `minmax(200px,1.6fr) 96px repeat(${clis.length}, minmax(88px,1fr)) 72px` };
  const minW = 200 + 96 + clis.length * 88 + 72;
  const linha = (t, campo) => (
    <div className={`grid items-center gap-2 px-3 py-1.5 border-b ${borda} ${t && ocultos.has(t.id) ? 'opacity-50' : ''}`} style={cols}>
      {campo ? <span className="text-sm">{campo.nome}</span> : (
        <TxtIn valor={t.nome} onGravar={v => mudarNome(t, v)} className={`${inputClass} !w-full text-sm py-1`} />
      )}
      <NumIn valor={(precos.padrao || {})[(campo || t).id] ?? null} placeholder={CU_PRECOS_PADRAO[(campo || t).id] != null ? String(CU_PRECOS_PADRAO[(campo || t).id]) : '—'} onGravar={v => gravarPadrao((campo || t).id, v)} className={cel} />
      {clis.map(c => {
        const id = (campo || t).id;
        const h = herdado(c.id, id);
        return <NumIn key={c.id} valor={valCli(c.id, id)} placeholder={h != null && h !== 0 ? String(h) : '—'} onGravar={v => gravarCli(c.id, id, v)} className={cel} />;
      })}
      <div className="flex justify-end gap-1">
        {t && <button type="button" onClick={() => alternarOculto(t)} className={`text-xs ${sub} hover:text-blue-400`} title={ocultos.has(t.id) ? 'Voltar a mostrar nas tarefas' : 'Esconder das tarefas'}>{ocultos.has(t.id) ? 'mostrar' : 'esconder'}</button>}
        {t && !t.base && <button type="button" onClick={() => { if (window.confirm(`Apagar o tipo "${t.nome}"? As tarefas que o usam ficam sem valor automático.`)) onCu({ tiposExtra: extra.filter(x => x.id !== t.id) }); }} className={`text-xs ${sub} hover:text-red-400`} aria-label={`Apagar ${t.nome}`}>✕</button>}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <p className={`text-sm ${sub}`}>Os tipos que escolhes em cada tarefa, com o preço padrão e o de cada cliente. Vazio = usa o valor cinzento (o padrão ou a tabela do cliente). Estes preços alimentam o valor das tarefas, os orçamentos e as receitas estimadas.</p>
      <div className={`rounded-xl border overflow-x-auto ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
        <div style={{ minWidth: minW }}>
          <div className={`grid items-end gap-2 px-3 h-10 pb-1.5 border-b text-[11px] font-medium ${claro ? 'border-slate-200 text-slate-400' : 'border-white/[0.08] text-slate-500'}`} style={cols}>
            <span>Tipo de tarefa</span><span className="text-right">Padrão</span>
            {clis.map(c => <span key={c.id} className="text-right truncate" title={c.nome}><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: c.cor || '#64748b' }} />{c.nome}</span>)}
            <span />
          </div>
          {linhas.map(t => <React.Fragment key={t.id}>{linha(t)}</React.Fragment>)}
          <div className={`px-3 py-2 border-b ${borda} flex flex-wrap items-center gap-2`}>
            <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') criar(); }} placeholder="Novo tipo (ex.: Playable ad)" className={`${inputClass} !w-56 text-sm py-1`} />
            <button type="button" onClick={criar} className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">+ Tipo</button>
            {ocultos.size > 0 && <button type="button" onClick={() => setVerOcultos(!verOcultos)} className={`text-xs ${sub} hover:text-blue-400`}>{verOcultos ? 'esconder os escondidos' : `ver escondidos (${ocultos.size})`}</button>}
          </div>
          <p className={`px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Outros preços</p>
          {CAMPOS_EXTRA_PRECO.map(campo => <React.Fragment key={campo.id}>{linha(null, campo)}</React.Fragment>)}
        </div>
      </div>
    </div>
  );
};

// ── Clientes: ficha única (geral, faturação, regras dos recibos, números) que alimenta o resto da app ──
const PAISES_RECIBO = [['PT', '🇵🇹 Portugal'], ['UE', '🇪🇺 UE'], ['Fora UE', '🌍 Fora UE']];
const MOEDAS = ['EUR', 'USD', 'GBP', 'CHF'];
// Números de um cliente: faturado (recibos), horas e tarefas (Trabalho)
const numerosCliente = (c, trab, faturado, ano, mesNum, cu, clientes) => {
  const f = (faturado || {})[c.id] || {};
  const meses12 = f[ano] || Array(12).fill(0);
  const fatAno = meses12.reduce((a, v) => a + v, 0);
  const fatAnt = (f[ano - 1] || []).reduce((a, v) => a + v, 0);
  let horasAno = 0, emCurso = 0, porEntregar = 0, entregueMes = 0;
  const pref = `${ano}-`;
  const prefMes = `${ano}-${String(mesNum).padStart(2, '0')}-`;
  (trab.tarefas || []).forEach(t => {
    if (String(t.cid) !== String(c.id)) return;
    (t.tempos || []).forEach(x => { if (trabDia(x.ini).startsWith(pref)) horasAno += trabMsTempo(x) / 3600000; });
    if (t.estado === 'curso') emCurso += 1;
    if (t.estado !== 'feito' && t.estado !== 'review') porEntregar += trabValor(t, cu, clientes);
    if (trabEntrega(t).startsWith(prefMes)) entregueMes += trabValor(t, cu, clientes);
  });
  let ultimo = null;
  Object.keys(f).map(Number).sort((a, b) => b - a).some(a => { const i = (f[a] || []).map((v, k) => (v ? k : -1)).filter(k => k >= 0).pop(); if (i != null && i >= 0) { ultimo = `${meses[i]} ${a}`; return true; } return false; });
  return { meses12, fatAno, fatAnt, horasAno, emCurso, porEntregar, entregueMes, ultimo, eurHora: horasAno > 0 ? fatAno / horasAno : 0 };
};
const Campo = ({ rot, children, largo }) => (
  <label className={`flex flex-col gap-1 min-w-0 ${largo ? 'sm:col-span-2' : ''}`}><span className="text-xs text-slate-400">{rot}</span>{children}</label>
);
const TxtIn = ({ valor, onGravar, className, placeholder, type = 'text' }) => (
  <input key={String(valor ?? '')} type={type} defaultValue={valor ?? ''} placeholder={placeholder} className={className}
    onBlur={e => { const v = e.target.value.trim(); if (v !== String(valor ?? '')) onGravar(v); }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
);
const FichaCliente = ({ c, trab, faturado, ano, mesNum, cu, clientes, theme, inputClass, onCliente, onCriarDoClickUp, onIrPrecos }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const caixa = `rounded-xl border p-4 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`;
  const [novaTag, setNovaTag] = useState('');
  if (c.soTrabalho) {
    return (
      <div className={`${caixa} max-w-xl space-y-3`}>
        <p className="text-sm">O cliente <strong>{c.nome}</strong> veio do ClickUp e ainda não existe na app, por isso ainda não tem ficha, preços próprios nem recibos.</p>
        <button type="button" onClick={onCriarDoClickUp} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Criar o cliente "{c.nome}"</button>
        <p className={`text-xs ${sub}`}>As pastas e tarefas dele passam para o cliente novo.</p>
      </div>
    );
  }
  const fat = c.fat || {};
  const rec = c.recibo || {};
  const set = patch => onCliente(c.id, patch);
  const setFat = patch => set({ fat: { ...fat, ...patch } });
  const setRec = patch => set({ recibo: { ...rec, ...patch } });
  const n = numerosCliente(c, trab, faturado, ano, mesNum, cu, clientes);
  const tags = c.tags || [];
  const juntarTag = () => { const v = novaTag.trim().replace(/^#/, ''); if (v && !tags.includes(v)) set({ tags: [...tags, v] }); setNovaTag(''); };
  const ic = `${inputClass} text-sm py-1.5`;
  const chip = on => `px-2.5 py-1 rounded-full text-xs border ${on ? 'border-blue-400 bg-blue-500/15 text-blue-400 font-medium' : claro ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-white/5'}`;
  const maxMes = Math.max(1, ...n.meses12);
  const regime = rec.regime || ((rec.pais || 'PT') === 'Fora UE' ? 'sem' : 'com');
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="space-y-4 min-w-0">
        <div className={caixa}>
          <p className="text-sm font-semibold mb-3">Geral</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rot="Nome na app"><TxtIn valor={c.nome} onGravar={v => v && set({ nome: v })} className={ic} /></Campo>
            <Campo rot="Cor">
              <div className="flex flex-wrap gap-1.5 py-1">{CORES_PASTA.map(cor => <button key={cor} type="button" onClick={() => set({ cor })} className={`w-6 h-6 rounded-md ${c.cor === cor ? 'ring-2 ring-offset-2 ring-blue-500 ' + (claro ? 'ring-offset-white' : 'ring-offset-slate-900') : ''}`} style={{ background: cor }} aria-label={`Cor ${cor}`} />)}</div>
            </Campo>
            <Campo rot="Outros nomes (separados por vírgulas — o OCR e o ClickUp reconhecem o cliente por eles)" largo>
              <TxtIn valor={(c.aliases || []).join(', ')} onGravar={v => set({ aliases: [...new Set(v.split(',').map(a => a.trim()).filter(Boolean))] })} placeholder="ex.: Anorak Games, Anorak" className={ic} />
            </Campo>
            <Campo rot="Tags" largo>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map(t => <span key={t} className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs ${claro ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200'}`}>#{t}<button type="button" onClick={() => set({ tags: tags.filter(x => x !== t) })} className="w-4 h-4 rounded-full hover:text-red-400" aria-label={`Tirar ${t}`}>×</button></span>)}
                <input value={novaTag} onChange={e => setNovaTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); juntarTag(); } }} onBlur={juntarTag} placeholder="+ tag (ex.: gaming)" className={`${inputClass} !w-40 text-xs py-1`} />
              </div>
            </Campo>
            <Campo rot="Estado">
              <div className="flex gap-1.5">{[['ativo', 'Ativo'], ['pausa', 'Em pausa'], ['antigo', 'Antigo']].map(([k, nm]) => <button key={k} type="button" onClick={() => set({ estado: k })} className={chip((c.estado || 'ativo') === k)}>{nm}</button>)}</div>
            </Campo>
          </div>
        </div>

        <div className={caixa}>
          <p className="text-sm font-semibold mb-3">Faturação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rot="Nome legal (como vai na fatura)" largo><TxtIn valor={fat.nomeLegal} onGravar={v => setFat({ nomeLegal: v })} placeholder="ex.: Anorak Games GmbH" className={ic} /></Campo>
            <Campo rot="NIF / VAT"><TxtIn valor={fat.nif} onGravar={v => setFat({ nif: v })} placeholder="ex.: DE123456789" className={ic} /></Campo>
            <Campo rot="Email de faturação"><TxtIn type="email" valor={fat.email} onGravar={v => setFat({ email: v })} placeholder="invoices@…" className={ic} /></Campo>
            <Campo rot="Morada" largo><TxtIn valor={fat.morada} onGravar={v => setFat({ morada: v })} placeholder="Rua, código postal, cidade, país" className={ic} /></Campo>
            <Campo rot="Moeda">
              <select value={fat.moeda || 'EUR'} onChange={e => setFat({ moeda: e.target.value })} className={ic}>{MOEDAS.map(m => <option key={m} value={m}>{m}</option>)}</select>
            </Campo>
            <Campo rot="Prazo de pagamento (dias)"><NumIn valor={fat.prazoDias ?? null} placeholder="30" decimal={false} onGravar={v => setFat({ prazoDias: v })} className={ic} /></Campo>
          </div>
        </div>

        <div className={caixa}>
          <p className="text-sm font-semibold">Regras dos recibos</p>
          <p className={`text-xs mb-3 ${sub}`}>Quando escolhes este cliente num recibo, o país, o IVA e a retenção vêm já preenchidos.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rot="País do cliente">
              <div className="flex flex-wrap gap-1.5">{PAISES_RECIBO.map(([k, nm]) => <button key={k} type="button" onClick={() => setRec({ pais: k, regime: k === 'Fora UE' ? 'sem' : (rec.regime === 'sem' && rec.pais === 'Fora UE' ? 'com' : rec.regime || 'com') })} className={chip((rec.pais || 'PT') === k)}>{nm}</button>)}</div>
            </Campo>
            <Campo rot="Onde entram os recibos">
              <div className="flex flex-wrap gap-1.5">{[['com', 'Com taxas'], ['sem', 'Sem taxas']].map(([k, nm]) => <button key={k} type="button" onClick={() => setRec({ regime: k })} className={chip(regime === k)}>{nm}</button>)}</div>
            </Campo>
            {(rec.pais || 'PT') === 'PT' && (
              <>
                <Campo rot="IVA (%)"><NumIn valor={rec.taxaIva ?? null} placeholder="23" onGravar={v => setRec({ taxaIva: v })} className={ic} /></Campo>
                <Campo rot="Retenção na fonte (%)"><NumIn valor={rec.taxaRet ?? null} placeholder="padrão" onGravar={v => setRec({ taxaRet: v })} className={ic} /></Campo>
              </>
            )}
            {(rec.pais || 'PT') !== 'PT' && <p className={`text-xs sm:col-span-2 ${sub}`}>Fora de Portugal o recibo vai sem IVA nem retenção (autoliquidação / exportação de serviços).</p>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className={caixa}>
          <p className="text-sm font-semibold mb-3">Números de {ano}</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Faturado', eur(n.fatAno), n.fatAnt ? `${ano - 1}: ${eur(n.fatAnt)}` : ''],
              ['Por entregar', eur(n.porEntregar), 'tarefas ainda abertas'],
              ['Entregue este mês', eur(n.entregueMes), meses[mesNum - 1]],
              ['Horas', tempoTxt(n.horasAno), n.emCurso ? `${n.emCurso} em curso` : ''],
              ['€ / hora', n.eurHora ? eur(n.eurHora) : '—', 'faturado ÷ horas'],
              ['Último recibo', n.ultimo || '—', ''],
            ].map(([k, v, nota]) => (
              <div key={k} className={`rounded-lg p-2.5 ${claro ? 'bg-slate-100' : 'bg-slate-800/60'}`}>
                <p className={`text-[11px] ${sub}`}>{k}</p>
                <p className="text-base font-semibold tabular-nums">{v}</p>
                {nota && <p className={`text-[10px] ${sub}`}>{nota}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-end gap-1 h-16" aria-label="Faturado por mês">
            {n.meses12.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${meses[i]}: ${eur(v)}`}>
                <div className="w-full rounded-sm" style={{ height: `${Math.max(v ? 4 : 2, (v / maxMes) * 52)}px`, background: v ? (c.cor || '#3b82f6') : (claro ? '#e2e8f0' : '#334155') }} />
                <span className={`text-[9px] ${sub}`}>{meses[i].charAt(0)}</span>
              </div>
            ))}
          </div>
        </div>
        <button type="button" onClick={onIrPrecos} className="text-xs text-blue-400 hover:text-blue-300">✏️ Preços de {c.nome} →</button>
        <p className={`text-[11px] ${sub}`}>O NIF e a morada ficam só na app — não vão no resumo do chat.</p>
      </div>
    </div>
  );
};
const ListaClientes = ({ clientes, trab, faturado, ano, mesNum, cu, theme, onAbrir, onNovo }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [nome, setNome] = useState('');
  const [verAntigos, setVerAntigos] = useState(false);
  const linhas = clientes.map(c => ({ c, n: c.soTrabalho ? null : numerosCliente(c, trab, faturado, ano, mesNum, cu, clientes) }));
  const visiveis = linhas.filter(l => verAntigos || (l.c.estado || 'ativo') !== 'antigo').sort((a, b) => ((b.n && b.n.fatAno) || 0) - ((a.n && a.n.fatAno) || 0));
  const nAntigos = linhas.length - linhas.filter(l => (l.c.estado || 'ativo') !== 'antigo').length;
  const cols = 'grid grid-cols-[minmax(0,1fr)_88px_88px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_96px_96px_80px_80px] items-center gap-3 px-3';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={e => { e.preventDefault(); if (nome.trim()) { onNovo(nome.trim()); setNome(''); } }} className="flex gap-2">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do cliente novo" className={`text-sm rounded-lg border px-3 py-1.5 ${claro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'}`} />
          <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">+ Cliente</button>
        </form>
        <div className="flex-1" />
        {nAntigos > 0 && <button type="button" onClick={() => setVerAntigos(!verAntigos)} className={`text-xs ${sub} hover:text-blue-400`}>{verAntigos ? 'Esconder antigos' : `Ver antigos (${nAntigos})`}</button>}
      </div>
      <div className={`rounded-xl border ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
        <div className={`${cols} h-9 border-b text-[11px] font-medium ${claro ? 'border-slate-100 text-slate-400' : 'border-white/[0.05] text-slate-500'}`}>
          <span>Cliente</span><span className="hidden md:block">Tags</span><span className="text-right">Faturado {ano}</span><span className="text-right">Por entregar</span><span className="hidden md:block text-right">Horas</span><span className="hidden md:block text-right">€/h</span>
        </div>
        {visiveis.map(({ c, n }) => (
          <button key={c.id} type="button" onClick={() => onAbrir(c.id)} className={`${cols} w-full py-2 text-left border-b last:border-b-0 ${claro ? 'border-slate-100 hover:bg-slate-50' : 'border-white/[0.04] hover:bg-white/[0.03]'} ${(c.estado || 'ativo') === 'antigo' ? 'opacity-50' : ''}`}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: c.cor || '#64748b' }}>{String(c.nome || '?').charAt(0).toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{c.nome}</span>
                <span className={`block text-[11px] truncate ${sub}`}>{c.soTrabalho ? 'só no ClickUp — falta criar' : [c.recibo && c.recibo.pais, c.estado === 'pausa' ? 'em pausa' : c.estado === 'antigo' ? 'antigo' : '', c.fat && c.fat.nomeLegal].filter(Boolean).join(' · ') || 'sem ficha preenchida'}</span>
              </span>
            </span>
            <span className="hidden md:flex flex-wrap gap-1 min-w-0">{(c.tags || []).map(t => <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] ${claro ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-slate-300'}`}>#{t}</span>)}</span>
            <span className="text-right text-sm tabular-nums">{n ? eur(n.fatAno) : '—'}</span>
            <span className="text-right text-sm tabular-nums">{n ? eur(n.porEntregar) : '—'}</span>
            <span className="hidden md:block text-right text-sm tabular-nums">{n ? tempoTxt(n.horasAno) : '—'}</span>
            <span className="hidden md:block text-right text-sm tabular-nums">{n && n.eurHora ? eur(n.eurHora) : '—'}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Timesheet semanal (como no ClickUp): tarefas × dias, com totais e edição direta ──
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const segundaDe = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const maisDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// "1h30", "1h 30m", "1:30", "90m", "45", "1,5h" → horas (número sem unidade: até 12 = horas, acima = minutos)
const lerDuracao = txt => {
  const s = String(txt || '').trim().toLowerCase().replace(',', '.');
  if (!s || s === '-' || s === '—') return 0;
  let m = /^(\d+):(\d{1,2})$/.exec(s); if (m) return Number(m[1]) + Number(m[2]) / 60;
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n <= 12 ? n : n / 60; }
  m = /^(\d+(?:\.\d+)?)\s*h\s*(?:(\d+)\s*(?:m|min)?)?$/.exec(s); if (m) return Number(m[1]) + (Number(m[2]) || 0) / 60;
  m = /^(\d+)\s*(?:m|min)$/.exec(s); if (m) return Number(m[1]) / 60;
  return null;
};
// Pôr o total de um dia numa tarefa: acrescenta um registo ou encurta/tira os últimos desse dia
const opDefinirDia = (trab, id, dia, horas) => opTarefa(trab, id, t => {
  let tempos = (t.tempos || []).slice();
  const correr = tempos.filter(x => !x.fim && trabDia(x.ini) === dia).reduce((a, x) => a + trabMsTempo(x), 0);
  const doDia = tempos.filter(x => x.fim && trabDia(x.ini) === dia);
  const atual = doDia.reduce((a, x) => a + trabMsTempo(x), 0);
  const alvo = Math.max(0, Math.round((horas * 3600000 - correr) / 60000) * 60000);
  if (alvo > atual) {
    const ultimo = doDia.reduce((a, x) => Math.max(a, Date.parse(x.fim)), 0);
    const ini = ultimo || Date.parse(`${dia}T09:00:00`);
    tempos.push({ id: trabId() + 'ts', ini: new Date(ini).toISOString(), fim: new Date(ini + alvo - atual).toISOString(), manual: true });
    return { ...t, iniciada: t.iniciada || new Date(ini).toISOString(), tempos };
  }
  let cortar = atual - alvo;
  if (cortar <= 0) return t;
  const ordem = doDia.slice().sort((a, b) => Date.parse(b.ini) - Date.parse(a.ini));
  const tirar = new Set(), encurtar = {};
  for (const x of ordem) {
    if (cortar <= 0) break;
    const d = trabMsTempo(x);
    if (d <= cortar) { tirar.add(x.id); cortar -= d; } else { encurtar[x.id] = new Date(Date.parse(x.fim) - cortar).toISOString(); cortar = 0; }
  }
  tempos = tempos.filter(x => !tirar.has(x.id)).map(x => (encurtar[x.id] ? { ...x, fim: encurtar[x.id] } : x));
  return { ...t, tempos };
});
const CelulaTempo = ({ ms, onGravar, claro, fds }) => {
  const [edit, setEdit] = useState(false);
  const txt = ms > 0 ? tempoTxt(ms / 3600000) : '—';
  if (edit) {
    return (
      <input autoFocus defaultValue={ms > 0 ? tempoTxt(ms / 3600000) : ''} placeholder="ex.: 1h30" onFocus={e => e.target.select()}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setEdit(false); } }}
        onBlur={e => { const h = lerDuracao(e.target.value); setEdit(false); if (h != null && Math.abs(h * 3600000 - ms) >= 30000) onGravar(h); }}
        className={`w-full h-full px-2 text-right text-sm tabular-nums outline-none ring-2 ring-blue-500 rounded ${claro ? 'bg-white' : 'bg-slate-800'}`} />
    );
  }
  return (
    <button type="button" onClick={() => setEdit(true)} title="Carrega para escrever o tempo deste dia"
      className={`w-full h-full px-2 text-right text-sm tabular-nums ${ms > 0 ? 'font-medium' : claro ? 'text-slate-300' : 'text-slate-600'} ${fds ? (claro ? 'bg-slate-50' : 'bg-white/[0.02]') : ''} ${claro ? 'hover:bg-blue-50' : 'hover:bg-blue-500/10'}`}>{txt}</button>
  );
};
const Timesheet = ({ trab, mudar, clientes, theme, onAbrir }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const borda = claro ? 'border-slate-200' : 'border-white/[0.07]';
  const [inicio, setInicio] = useState(() => segundaDe(new Date()));
  const [semFds, setSemFds] = useState(() => { try { return localStorage.getItem('trab-ts-semfds') === '1'; } catch (e) { return false; } });
  const [soCli, setSoCli] = useState('');
  const [juntas, setJuntas] = useState([]);
  const [abertas, setAbertas] = useState({});
  const [procurar, setProcurar] = useState(null);
  const [, setTic] = useState(0);
  const corre = trabACorrer(trab);
  useEffect(() => { if (!corre) return undefined; const i = setInterval(() => setTic(x => x + 1), 30000); return () => clearInterval(i); }, [!!corre]);
  const dias = Array.from({ length: 7 }, (_, i) => maisDias(inicio, i));
  const diasK = dias.map(d => trabDia(d.toISOString()));
  const visiveis = dias.map((d, i) => i).filter(i => !semFds || i < 5);
  const hojeK = trabDia(new Date().toISOString());
  const estaSemana = segundaDe(new Date()).getTime() === inicio.getTime();
  const fim = dias[6];
  const tituloSem = `${inicio.getDate()} ${MESES_CURTO[inicio.getMonth()]} – ${fim.getDate()} ${MESES_CURTO[fim.getMonth()]}${fim.getFullYear() !== new Date().getFullYear() ? ' ' + fim.getFullYear() : ''}`;
  const nomeCli = cid => { const c = (clientes || []).find(x => String(x.id) === String(cid)); return c ? c.nome : String(cid || '').startsWith('cu:') ? String(cid).slice(3) : 'Sem cliente'; };
  // Horas por tarefa e dia
  const linhas = [];
  (trab.tarefas || []).forEach(t => {
    if (soCli && String(t.cid) !== soCli) return;
    const porDia = {}; let primeiro = null; const regs = [];
    (t.tempos || []).forEach(x => {
      const d = trabDia(x.ini);
      const k = diasK.indexOf(d);
      if (k < 0) return;
      porDia[k] = (porDia[k] || 0) + trabMsTempo(x);
      regs.push(x);
      if (!primeiro || x.ini < primeiro) primeiro = x.ini;
    });
    if (regs.length || juntas.includes(t.id)) linhas.push({ t, porDia, primeiro: primeiro || '9', regs, total: Object.values(porDia).reduce((a, v) => a + v, 0) });
  });
  linhas.sort((a, b) => a.primeiro.localeCompare(b.primeiro));
  const totDia = diasK.map((_, k) => linhas.reduce((a, l) => a + (l.porDia[k] || 0), 0));
  const totSem = visiveis.reduce((a, k) => a + totDia[k], 0);
  const META = 8 * 3600000;
  const barra = ms => {
    if (!ms) return <div className={`h-1 rounded-full ${claro ? 'bg-slate-200' : 'bg-slate-700/60'}`} />;
    const azul = Math.min(ms, META) / Math.max(ms, META) * 100;
    return (
      <div className={`h-1 rounded-full overflow-hidden flex ${claro ? 'bg-slate-200' : 'bg-slate-700/60'}`} title={ms > META ? `${tempoTxt((ms - META) / 3600000)} acima das 8h` : `${tempoTxt(ms / 3600000)} de 8h`}>
        <div className="h-full bg-blue-500" style={{ width: `${azul}%` }} />
        {ms > META && <div className="h-full bg-red-500 flex-1" />}
      </div>
    );
  };
  const estreito = typeof window !== 'undefined' && window.innerWidth < 640;
  const colTarefa = estreito ? 170 : 220;
  const cols = `minmax(${colTarefa}px,1fr) repeat(${visiveis.length}, minmax(72px,124px)) minmax(80px,124px)`;
  const fundoFixo = claro ? 'bg-white' : 'bg-slate-900';
  const mudarFds = v => { setSemFds(v); try { localStorage.setItem('trab-ts-semfds', v ? '1' : '0'); } catch (e) { /* sem armazenamento */ } };
  const est = id => TRAB_ESTADOS.find(e => e.id === id) || TRAB_ESTADOS[0];
  const candidatas = procurar != null ? (trab.tarefas || []).filter(t => !linhas.some(l => l.t.id === t.id) && (!soCli || String(t.cid) === soCli) && t.nome.toLowerCase().includes(procurar.trim().toLowerCase()))
    .sort((a, b) => (a.estado === 'feito') - (b.estado === 'feito') || String(b.criada).localeCompare(String(a.criada))).slice(0, 8) : [];
  const caminhoTxt = t => [nomeCli(t.cid), ...(t.pastaId ? caminho(trab, t.pastaId).map(p => p.nome) : [])].join(' / ');
  const hm = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const cliUsados = [...new Set((trab.tarefas || []).map(t => String(t.cid ?? '')))].filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <button type="button" onClick={() => setInicio(maisDias(inicio, -7))} className={`w-8 h-8 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`} aria-label="Semana anterior">‹</button>
          <button type="button" onClick={() => setInicio(maisDias(inicio, 7))} className={`w-8 h-8 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`} aria-label="Semana seguinte">›</button>
        </div>
        <h3 className="text-lg font-semibold">{tituloSem}</h3>
        {!estaSemana && <button type="button" onClick={() => setInicio(segundaDe(new Date()))} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Esta semana</button>}
        <div className="flex-1" />
        <select value={soCli} onChange={e => setSoCli(e.target.value)} className={`text-xs rounded-lg border px-2 py-1.5 ${claro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'}`} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {cliUsados.map(c => <option key={c} value={c}>{nomeCli(c)}</option>)}
        </select>
        <button type="button" role="switch" aria-checked={semFds} onClick={() => mudarFds(!semFds)} className="inline-flex items-center gap-2 text-xs">
          <span className={`relative inline-block w-8 h-[18px] rounded-full transition-colors ${semFds ? 'bg-blue-500' : claro ? 'bg-slate-300' : 'bg-slate-600'}`}>
            <span className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform" style={{ transform: semFds ? 'translateX(14px)' : 'none' }} />
          </span>
          Esconder fins de semana
        </button>
      </div>
      <div className={`rounded-xl border overflow-x-auto ${borda} ${claro ? 'bg-white' : 'bg-slate-900/30'}`}>
        <div style={{ minWidth: colTarefa + visiveis.length * 72 + 80 }}>
          <div className={`grid border-b ${borda}`} style={{ gridTemplateColumns: cols }}>
            <div className={`sticky left-0 z-[2] px-3 py-2 text-xs font-medium flex items-end ${fundoFixo} ${sub}`}>Tarefa / onde está</div>
            {visiveis.map(k => (
              <div key={k} className={`px-2 py-2 border-l ${borda} ${k >= 5 ? (claro ? 'bg-slate-50' : 'bg-white/[0.02]') : ''}`}>
                <p className={`text-[11px] ${diasK[k] === hojeK ? 'text-blue-400 font-semibold' : sub}`}>{DIAS_SEM[dias[k].getDay()]}, {dias[k].getDate()} {MESES_CURTO[dias[k].getMonth()]}</p>
                <p className="text-sm font-semibold tabular-nums whitespace-nowrap mb-1.5">{tempoTxt(totDia[k] / 3600000)}</p>
                {barra(totDia[k])}
              </div>
            ))}
            <div className={`px-2 py-2 border-l ${borda}`}>
              <p className={`text-[11px] ${sub}`}>Total</p>
              <p className="text-sm font-semibold tabular-nums mb-1.5">{tempoTxt(totSem / 3600000)}</p>
              {barra(totSem / Math.max(1, visiveis.length) * 1)}
            </div>
          </div>
          {linhas.map(({ t, porDia, regs }) => {
            const e = est(t.estado);
            const aberta = !!abertas[t.id];
            const tot = visiveis.reduce((a, k) => a + (porDia[k] || 0), 0);
            return (
              <div key={t.id} className={`border-b last:border-b-0 ${borda}`}>
                <div className="grid min-h-[48px]" style={{ gridTemplateColumns: cols }}>
                  <div className={`sticky left-0 z-[2] flex items-start gap-1.5 px-2 py-1.5 min-w-0 ${fundoFixo}`}>
                    <button type="button" onClick={() => setAbertas({ ...abertas, [t.id]: !aberta })} className={`mt-0.5 w-5 h-5 shrink-0 text-[10px] ${sub} transition-transform`} style={{ transform: aberta ? 'rotate(90deg)' : 'none' }} aria-label={aberta ? 'Esconder registos' : 'Ver registos'}>▶</button>
                    <div className="min-w-0">
                      <button type="button" onClick={() => onAbrir(t.id)} className="text-sm font-medium text-left hover:underline break-words">{t.nome}</button>
                      <p className={`flex items-center gap-1.5 text-[11px] ${sub} min-w-0`}><IcoEstado id={e.id} cor={e.cor} size={11} /><span className="shrink-0">{e.nome}</span><span>·</span><span className="truncate" title={caminhoTxt(t)}>{caminhoTxt(t)}</span></p>
                    </div>
                  </div>
                  {visiveis.map(k => (
                    <div key={k} className={`border-l ${borda}`}>
                      <CelulaTempo ms={porDia[k] || 0} claro={claro} fds={k >= 5} onGravar={h => mudar(tr => opDefinirDia(tr, t.id, diasK[k], h))} />
                    </div>
                  ))}
                  <div className={`border-l ${borda} flex items-center justify-end gap-1 px-2 text-sm font-semibold tabular-nums`}>
                    {tot > 0 ? tempoTxt(tot / 3600000) : '—'}
                    {juntas.includes(t.id) && !regs.length && <button type="button" onClick={() => setJuntas(juntas.filter(x => x !== t.id))} className={`ml-1 text-xs ${sub} hover:text-red-400`} aria-label="Tirar da semana">✕</button>}
                  </div>
                </div>
                {aberta && (
                  <div className={`px-9 pb-2 space-y-0.5 ${sub}`}>
                    {regs.length === 0 && <p className="text-xs">Sem registos nesta semana. Carrega num dia para escrever o tempo.</p>}
                    {regs.slice().sort((a, b) => a.ini.localeCompare(b.ini)).map(x => (
                      <div key={x.id} className="flex items-center gap-3 text-xs">
                        <span className="w-20">{DIAS_SEM[new Date(x.ini).getDay()]}, {new Date(x.ini).getDate()}</span>
                        <span className="tabular-nums w-28">{hm(x.ini)} – {x.fim ? hm(x.fim) : 'agora'}</span>
                        <span className={`tabular-nums w-16 ${claro ? 'text-slate-700' : 'text-slate-200'}`}>{tempoTxt(trabMsTempo(x) / 3600000)}</span>
                        {x.fim && <button type="button" onClick={() => mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: (y.tempos || []).filter(z => z.id !== x.id) })))} className="hover:text-red-400" aria-label="Apagar registo">✕</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!linhas.length && <p className={`px-4 py-8 text-sm text-center ${sub}`}>Sem horas registadas nesta semana.</p>}
          <div className={`relative px-3 py-2.5 border-t ${borda}`}>
            {procurar == null ? (
              <button type="button" onClick={() => setProcurar('')} className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>+ Adicionar tarefa</button>
            ) : (
              <div className="max-w-md">
                <input autoFocus value={procurar} onChange={e => setProcurar(e.target.value)} placeholder="Procura a tarefa…" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setProcurar(null); } }}
                  onBlur={() => setTimeout(() => setProcurar(null), 150)} className={`w-full text-sm rounded-lg border px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'}`} />
                <div className={`mt-1 rounded-lg border shadow-lg overflow-hidden ${borda} ${claro ? 'bg-white' : 'bg-slate-800'}`}>
                  {candidatas.map(t => (
                    <button key={t.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setJuntas([...juntas, t.id]); setProcurar(null); }} className={`w-full text-left px-3 py-1.5 ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
                      <p className="text-sm">{t.nome}</p><p className={`text-[11px] ${sub}`}>{est(t.estado).nome} · {caminhoTxt(t)}</p>
                    </button>
                  ))}
                  {!candidatas.length && <p className={`px-3 py-2 text-xs ${sub}`}>Nenhuma tarefa encontrada.</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className={`text-[11px] ${sub}`}>Carrega numa célula para escrever o tempo desse dia (ex.: 1h30, 45m, 2:15). Se baixares, tira-se do fim dos registos desse dia. A barra fica vermelha acima das 8h.</p>
    </div>
  );
};

const VisaoGeral = ({ trab, cu, clientes, theme, mudar, onAbrir, ano, mesNum }) => {
  const claro = useClaro(theme);
  const em7 = trabDia(new Date(Date.now() + 7 * 86400000).toISOString());
  const abertas = (trab.tarefas || []).filter(t => t.estado !== 'feito');
  const curso = abertas.filter(t => t.estado === 'curso');
  const review = abertas.filter(t => t.estado === 'review');
  const prazos = abertas.filter(t => t.estado === 'todo' && t.prazo && t.prazo <= em7).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const pref = `${ano}-${String(mesNum).padStart(2, '0')}-`;
  const porCli = {};
  (trab.tarefas || []).forEach(t => {
    const c = (porCli[t.cid] = porCli[t.cid] || { h: 0, v: 0, n: 0, dias: new Set() });
    (t.tempos || []).forEach(x => { const d = trabDia(x.ini); if (d.startsWith(pref)) { c.h += trabMsTempo(x) / 3600000; c.dias.add(d); } });
    if (trabEntrega(t).startsWith(pref)) { c.v += trabValor(t, cu, clientes); c.n += 1; }
  });
  // Quem paga à diária: cada dia com horas conta como um dia
  Object.entries(porCli).forEach(([cid, c]) => { const d = cuPreco(cu, clientes, cid, 'dia'); if (d > 0) { c.v += c.dias.size * d; c.porDia = d; } });
  const nomeCli = id => ((clientes || []).find(c => String(c.id) === String(id)) || {}).nome || 'Sem cliente';
  const corCli = id => ((clientes || []).find(c => String(c.id) === String(id)) || {}).cor || '#64748b';
  const Bloco = ({ titulo, lista, vazio }) => (
    <Card className="min-w-0">
      <h3 className="font-semibold mb-2 text-sm">{titulo} <span className={`font-normal ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{lista.length}</span></h3>
      <div className="space-y-0.5">
        {lista.slice(0, 12).map(t => <LinhaTarefa key={t.id} t={t} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={onAbrir} mostrarPasta nomePasta={`${nomeCli(t.cid)} · ${caminho(trab, t.pastaId).map(p => p.nome).slice(-1)[0] || ''}`} />)}
        {!lista.length && <p className={`text-xs px-1 ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{vazio}</p>}
      </div>
    </Card>
  );
  const linhasCli = Object.entries(porCli).filter(([, c]) => c.h > 0 || c.v > 0);
  return (
    <div className="space-y-4">
      {linhasCli.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3 text-sm">{meses[mesNum - 1]} até agora</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {linhasCli.map(([cid, c]) => (
              <div key={cid} className={`rounded-xl p-3 ${claro ? 'bg-slate-100' : 'bg-slate-800/60'}`} style={{ borderLeft: `3px solid ${corCli(cid)}` }}>
                <p className="text-sm font-medium">{nomeCli(cid)}</p>
                <p className="text-lg font-semibold tabular-nums">{eur(c.v)}</p>
                <p className={`text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{c.porDia ? `${c.dias.size} dia${c.dias.size === 1 ? '' : 's'} × ${eur(c.porDia)}` : `${c.n} entregue${c.n === 1 ? '' : 's'}`} · {tempoTxt(c.h)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Bloco({ titulo: 'Em curso', lista: curso, vazio: 'Nada em curso.' })}
        {Bloco({ titulo: 'Em review', lista: review, vazio: 'Nada à espera do cliente.' })}
      </div>
      {Bloco({ titulo: `Prazos até ${dataCurta(em7)}`, lista: prazos, vazio: 'Sem prazos nos próximos 7 dias.' })}
      {!(trab.tarefas || []).length && (
        <Card>
          <p className="text-sm">Começa por escolher um cliente à esquerda e criar uma pasta (por exemplo "2026" → "6_Mahjong" → "44 - Mahjong - Oct"). Depois escreve as tarefas como no ClickUp: <strong>"2x New Videos - Halloween"</strong>. A app calcula o valor, regista os tempos e faz o orçamento sozinha.</p>
        </Card>
      )}
    </div>
  );
};

// ── Importar de um ficheiro (exportação feita a partir do ClickUp) ──
const importarFicheiro = async (file, trab, clientes) => {
  const j = JSON.parse(await file.text());
  if (!j || !Array.isArray(j.pastas) || !Array.isArray(j.tarefas)) throw new Error('Este ficheiro não tem o formato certo.');
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Cliente da app com o mesmo nome do espaço do ClickUp; se não houver, fica um "cliente" só do Trabalho
  const cidDe = nome => { if (!nome) return null; const c = (clientes || []).find(x => norm(x.nome) === norm(nome)) || (clientes || []).find(x => norm(x.nome).length >= 3 && (norm(x.nome).includes(norm(nome)) || norm(nome).includes(norm(x.nome)))); return c ? c.id : 'cu:' + nome; };
  const jaP = new Set((trab.pastas || []).map(p => p.origem).filter(Boolean));
  const jaT = new Set((trab.tarefas || []).map(t => t.origem).filter(Boolean));
  const mapaId = {};
  (trab.pastas || []).forEach(p => { if (p.origem) mapaId[p.origem] = p.id; });
  const novasP = [];
  j.pastas.forEach(p => {
    if (jaP.has(p.origem)) return;
    const id = trabId() + novasP.length;
    mapaId[p.origem] = id;
    novasP.push({ id, origem: p.origem, cid: cidDe(p.cliente), clienteNome: p.cliente || '', paiOrigem: p.paiOrigem || null, nome: p.nome, cor: p.cor || CORES_PASTA[novasP.length % CORES_PASTA.length], ordem: p.ordem ?? 0, criada: agoraIso(), notas: [], orcamento: {} });
  });
  novasP.forEach(p => { p.paiId = p.paiOrigem ? (mapaId[p.paiOrigem] || null) : null; delete p.paiOrigem; });
  const novasT = j.tarefas.filter(t => !jaT.has(t.origem)).map((t, i) => ({
    id: trabId() + 't' + i, origem: t.origem, pastaId: mapaId[t.pastaOrigem] || null, cid: cidDe(t.cliente), nome: t.nome, estado: t.estado === 'aprovar' ? 'todo' : (t.estado || 'todo'),
    criada: t.criada || agoraIso(), iniciada: t.iniciada || null, review: t.review || null, feita: t.feita || null, prazo: t.prazo || '', notas: t.notas || '',
    tempos: (t.tempos || []).map((x, k) => ({ id: trabId() + k, ini: x.ini, fim: x.fim })),
  }));
  // Tarefas já importadas antes: só se acrescentam os tempos que faltam (o resto que mudaste na app fica)
  const porOrigem = {};
  j.tarefas.forEach(t => { if (t.origem) porOrigem[t.origem] = t; });
  let atualizadas = 0;
  const antigas = (trab.tarefas || []).map(t => {
    const n = t.origem && porOrigem[t.origem];
    if (!n) return t;
    const jaIni = new Set((t.tempos || []).map(x => x.ini));
    const novos = (n.tempos || []).filter(x => !jaIni.has(x.ini)).map((x, k) => ({ id: trabId() + 'u' + k, ini: x.ini, fim: x.fim }));
    if (!novos.length) return t;
    atualizadas += 1;
    return { ...t, tempos: [...(t.tempos || []), ...novos].sort((a, b) => String(a.ini).localeCompare(String(b.ini))), iniciada: t.iniciada || n.iniciada || null };
  });
  return [{ ...trab, pastas: [...(trab.pastas || []), ...novasP], tarefas: [...antigas, ...novasT] }, novasP.length, novasT.length, atualizadas];
};

// ══ O separador ══
const Trabalho = ({ trab: trabIn, mudar, modo, clientes: clientesIn, cu, theme, inputClass: icIn, ano, mesNum, showToast, onPrecos, faturado, onCliente, onNovoCliente, onCu }) => {
  const inputClass = `${icIn || ''} w-full min-w-0`;
  const trab = trabIn || TRAB_VAZIO;
  const claro = useClaro(theme);
  const clientes = useMemo(() => {
    const app = (clientesIn || []).filter(c => !/reembolso/i.test(c.nome || ''));
    const extra = {};
    ((trabIn && trabIn.pastas) || []).forEach(p => { if (typeof p.cid === 'string' && p.cid.startsWith('cu:') && !extra[p.cid]) extra[p.cid] = { id: p.cid, nome: p.clienteNome || p.cid.slice(3), cor: '#64748b', soTrabalho: true }; });
    return [...app, ...Object.values(extra)];
  }, [clientesIn, trabIn]);
  const [sel, setSelEstado] = useState(() => { try { return JSON.parse(localStorage.getItem('trab-sel')) || { tipo: 'geral' }; } catch (e) { return { tipo: 'geral' }; } });
  const setSel = v => { setSelEstado(v); setArvoreMob(false); try { localStorage.setItem('trab-sel', JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
  const [abertas, setAbertas] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('trab-abertas')) || []); } catch (e) { return new Set(); } });
  const alternar = id => setAbertas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('trab-abertas', JSON.stringify([...n])); } catch (e) { /* sem armazenamento */ } return n; });
  const [aba, setAba] = useState('tarefas');
  const [tarefaAberta, setTarefaAberta] = useState(null);
  const [procura, setProcura] = useState('');
  const [arvoreMob, setArvoreMob] = useState(false);
  const [semArvore, setSemArvore] = useState(() => { try { return localStorage.getItem('trab-sem-arvore') === '1'; } catch (e) { return false; } });
  const alternarArvore = () => setSemArvore(v => { try { localStorage.setItem('trab-sem-arvore', v ? '0' : '1'); } catch (e) { /* sem armazenamento */ } return !v; });
  const ficheiroRef = useRef(null);

  // Estado antigo "Por aprovar" passa a "Por começar"
  useEffect(() => { if ((trab.tarefas || []).some(t => t.estado === 'aprovar')) mudar(tr => ({ ...tr, tarefas: tr.tarefas.map(t => (t.estado === 'aprovar' ? { ...t, estado: 'todo' } : t)) })); }, [trab.tarefas]); // eslint-disable-line react-hooks/exhaustive-deps
  const pasta = sel.tipo === 'pasta' ? (trab.pastas || []).find(p => p.id === sel.id) : null;
  const cidSel = pasta ? pasta.cid : sel.tipo === 'cliente' ? sel.id : null;
  const cliente = clientes.find(c => String(c.id) === String(cidSel));
  useEffect(() => { if (sel.tipo === 'pasta' && !pasta) setSelEstado({ tipo: 'geral' }); }, [sel.tipo, pasta]);

  const abertasPorPasta = useMemo(() => {
    const m = {};
    (trab.tarefas || []).forEach(t => { if (t.estado !== 'feito' && t.pastaId) m[t.pastaId] = (m[t.pastaId] || 0) + 1; });
    return m;
  }, [trab.tarefas]);
  const contar = id => descendentes(trab, id).reduce((a, x) => a + (abertasPorPasta[x] || 0), 0);

  let tarefas = [];
  if (pasta) { const ids = new Set(descendentes(trab, pasta.id)); tarefas = (trab.tarefas || []).filter(t => ids.has(t.pastaId)); }
  else if (sel.tipo === 'cliente') tarefas = (trab.tarefas || []).filter(t => String(t.cid) === String(sel.id));
  if (procura.trim()) {
    const q = procura.trim().toLowerCase();
    tarefas = (pasta || sel.tipo === 'cliente' ? tarefas : (trab.tarefas || [])).filter(t => t.nome.toLowerCase().includes(q));
  }
  const ordenar = l => l.slice().sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999') || String(a.criada).localeCompare(String(b.criada)));
  tarefas = ordenar(tarefas);

  const [pedir, setPedir] = useState(null); // { titulo, valor, ok }
  const novaPasta = (cid, paiId) => setPedir({ titulo: paiId ? 'Nome da subpasta' : 'Nome da pasta', valor: '', ok: nome => {
    let novoId = null;
    mudar(tr => { const [n, id] = opNovaPasta(tr, { cid, paiId, nome }); novoId = id; return n; });
    if (paiId) setAbertas(prev => new Set([...prev, paiId]));
    setTimeout(() => { if (novoId) setSel({ tipo: 'pasta', id: novoId }); }, 0);
  } });
  const criarTarefa = (txt, prazo, pecas) => {
    if (!pasta) return;
    mudar(tr => opNovaTarefa(tr, { pastaId: pasta.id, cid: pasta.cid, nome: txt, prazo, pecas }));
  };
  const importar = async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (modo === 'g' && !window.confirm('Ainda não tens a regra do Firestore para o Trabalho, por isso tudo fica no documento principal (que tem um limite de 1 MB). Importar o ClickUp ocupa ~200 KB. Queres importar mesmo assim?')) return;
    try {
      const [n, np, nt, nu] = await importarFicheiro(f, trab, clientes);
      mudar(() => n);
      showToast && showToast(np || nt || nu ? `Importado: ${np} pastas e ${nt} tarefas novas${nu ? ` · ${nu} tarefas com tempos atualizados` : ''}` : 'Nada de novo para importar', 'success');
    } catch (err) { showToast && showToast(err.message || 'Não consegui ler o ficheiro', 'error'); }
  };

  const tarefaSel = (trab.tarefas || []).find(t => t.id === tarefaAberta);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';

  const arvore = (
    <div className="space-y-3">
      <button type="button" onClick={() => setSel({ tipo: 'geral' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left ${sel.tipo === 'geral' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <span aria-hidden="true">🏠</span> Visão geral
      </button>
      <button type="button" onClick={() => setSel({ tipo: 'timesheet' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'timesheet' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <span aria-hidden="true">⏱</span> Timesheet
      </button>
      {onCliente && (
        <button type="button" onClick={() => setSel({ tipo: 'clientes' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'clientes' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <span aria-hidden="true">👥</span> Clientes
        </button>
      )}
      {onCu && onPrecos && (
        <button type="button" onClick={() => setSel({ tipo: 'tipos' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'tipos' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <span aria-hidden="true">🏷</span> Tipos e preços
        </button>
      )}
      {(trab.favoritos || []).length > 0 && (
        <div>
          <p className={`px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Favoritos</p>
          {(trab.favoritos || []).map(id => (trab.pastas || []).find(p => p.id === id)).filter(Boolean).map(p => {
            const ativo = sel.tipo === 'pasta' && sel.id === p.id;
            const n = contar(p.id);
            return (
              <div key={p.id} className={`group flex items-center gap-2 px-2 rounded-lg text-sm ${ativo ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
                <button type="button" onClick={() => setSel({ tipo: 'pasta', id: p.id })} className="flex-1 min-w-0 flex items-start gap-2 py-1.5 text-left" title={caminho(trab, p.id).map(x => x.nome).join(' / ')}>
                  <span className="w-2.5 h-2.5 mt-[5px] rounded-[3px] flex-shrink-0" style={{ background: p.cor || '#64748b' }} />
                  <span className="break-words leading-snug">{p.nome}</span>
                </button>
                <button type="button" onClick={() => mudar(tr => opFavorito(tr, p.id))} className="text-amber-400 text-[13px] opacity-60 group-hover:opacity-100" title="Tirar dos favoritos" aria-label="Tirar dos favoritos">★</button>
                {n > 0 && <span className={`text-[11px] tabular-nums w-5 text-right ${sub}`}>{n}</span>}
              </div>
            );
          })}
        </div>
      )}
      <p className={`px-2 -mb-1 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Clientes</p>
      {clientes.filter(c => c.estado !== 'antigo' || (sel.tipo === 'cliente' && String(sel.id) === String(c.id)) || (pasta && String(pasta.cid) === String(c.id))).map(c => {
        const raiz = filhasDe(trab, null, c.id);
        const ativo = sel.tipo === 'cliente' && String(sel.id) === String(c.id);
        return (
          <div key={c.id}>
            <div className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg ${ativo ? (claro ? 'bg-slate-200/70' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              <button type="button" onClick={() => setSel({ tipo: 'cliente', id: c.id })} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: c.cor || '#64748b' }}>{String(c.nome || '?').charAt(0).toUpperCase()}</span>
                <span className="text-sm font-semibold truncate">{c.nome}</span>
              </button>
              <button type="button" onClick={() => novaPasta(c.id, null)} className={`w-6 h-6 rounded-md text-base leading-none ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`} title="Nova pasta" aria-label={`Nova pasta em ${c.nome}`}>+</button>
            </div>
            <div className="ml-1">{raiz.map(p => <NoPasta key={p.id} p={p} trab={trab} nivel={0} sel={sel} setSel={setSel} abertas={abertas} alternar={alternar} theme={theme} contar={contar} onFav={id => mudar(tr => opFavorito(tr, id))} onSub={pp => novaPasta(pp.cid, pp.id)} />)}</div>
          </div>
        );
      })}
      {!clientes.length && <p className={`text-xs ${sub}`}>Adiciona primeiro os teus clientes em 👥 Clientes.</p>}
    </div>
  );

  const titulo = pasta ? pasta.nome : sel.tipo === 'cliente' ? (cliente ? cliente.nome : 'Cliente') : sel.tipo === 'timesheet' ? 'Timesheet' : sel.tipo === 'clientes' ? 'Clientes' : sel.tipo === 'tipos' ? 'Tipos de tarefa e preços' : 'Visão geral';
  const migalhas = pasta ? [cliente ? cliente.nome : '', ...caminho(trab, pasta.id).slice(0, -1).map(p => p.nome)].filter(Boolean) : [];
  const notasAlvo = pasta ? (pasta.notas || []) : sel.tipo === 'cliente' ? ((trab.notasCliente || {})[sel.id] || []) : [];
  const mudarNotas = notas => mudar(tr => (pasta ? opPasta(tr, pasta.id, { notas }) : { ...tr, notasCliente: { ...(tr.notasCliente || {}), [sel.id]: notas } }));
  const abas = pasta ? [['tarefas', 'Tarefas'], ['notas', 'Notas e reuniões'], ['orcamento', 'Orçamento']] : sel.tipo === 'cliente' ? [...(onCliente ? [['ficha', 'Ficha']] : []), ['tarefas', 'Tarefas'], ['notas', 'Notas e reuniões'], ['precos', 'Preços']] : [];
  const abaAtual = abas.some(a => a[0] === aba) ? aba : 'tarefas';
  const valorAberto = tarefas.filter(t => t.estado !== 'feito').reduce((a, t) => a + trabValor(t, cu, clientes), 0);
  const horasTot = tarefas.reduce((a, t) => a + trabHoras(t), 0);

  // Nomes de tarefas já usados neste cliente (mais recentes primeiro), para as sugestões
  const nomesUsados = useMemo(() => {
    if (!pasta) return [];
    const vistos = new Set();
    return (trab.tarefas || []).filter(t => String(t.cid) === String(pasta.cid)).sort((a, b) => String(b.criada || '').localeCompare(String(a.criada || '')))
      .map(t => t.nome).filter(n => { if (vistos.has(n)) return false; vistos.add(n); return true; }).slice(0, 300);
  }, [trab.tarefas, pasta && pasta.cid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pastas de ano (raiz) que ainda têm subpastas que não são meses → podem ser organizadas por meses
  const porOrganizar = p => p && !p.mesNum && (!p.paiId || /^\s*\d{4}\s*$/.test(p.nome)) && (trab.pastas || []).some(f => f.paiId === p.id && !f.mesNum);
  const anosPorOrganizar = sel.tipo === 'cliente' ? filhasDe(trab, null, sel.id).filter(porOrganizar) : [];
  const organizarCliente = () => {
    const planos = anosPorOrganizar.map(p => ({ p, n: planoPorMeses(trab, p.id).length }));
    if (window.confirm(`Organizar por meses: ${planos.map(x => `${x.p.nome} (${x.n} listas)`).join(', ')}?\n\nCada lista vai para a pasta do mês dela. As pastas por jogo que ficarem vazias desaparecem. As tarefas não mudam.`)) mudar(tr => anosPorOrganizar.reduce((acc, p) => opPorMeses(acc, p.id), tr));
  };

  if (modo === 'carregar') return <div className="py-16 text-center text-slate-400 text-sm">A carregar o teu trabalho…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setArvoreMob(!arvoreMob)} className={`lg:hidden px-3 py-2 text-sm rounded-lg border ${claro ? 'border-slate-200' : 'border-slate-700'}`}>📁 Pastas</button>
        <button type="button" onClick={alternarArvore} title={semArvore ? 'Mostrar as pastas' : 'Esconder as pastas (mais espaço para as tarefas)'} aria-label={semArvore ? 'Mostrar as pastas' : 'Esconder as pastas'}
          className={`hidden lg:inline-flex w-9 h-9 items-center justify-center rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100 text-slate-500' : 'border-slate-700 hover:bg-white/5 text-slate-400'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />{semArvore ? <path d="m13 10 2 2-2 2" /> : <path d="m16 10-2 2 2 2" />}</svg>
        </button>
        <input value={procura} onChange={e => setProcura(e.target.value)} placeholder="Procurar tarefas…" className={`${inputClass} flex-1 min-w-[160px] max-w-sm text-sm py-2`} />
        <span className="flex-1" />
        {modo === 'g' && <span className="text-[11px] text-amber-400" title="As regras do Firestore ainda não deixam gravar à parte. Os dados ficam no documento principal.">a gravar no documento principal</span>}
        <button type="button" onClick={() => ficheiroRef.current && ficheiroRef.current.click()} className={`px-3 py-2 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Importar do ClickUp</button>
        <input ref={ficheiroRef} type="file" accept=".json,application/json" className="hidden" onChange={importar} />
      </div>
      <div className={`grid grid-cols-1 gap-5 items-start ${semArvore ? '' : 'lg:grid-cols-[330px_minmax(0,1fr)]'}`}>
        <aside className={`${arvoreMob ? 'block' : 'hidden'} ${semArvore ? 'lg:hidden' : 'lg:block'} lg:sticky lg:top-[150px] rounded-2xl border p-2 lg:max-h-[calc(100vh-170px)] overflow-y-auto ${claro ? 'bg-white/80 border-slate-200' : 'bg-slate-800/50 border-slate-700/50'}`}>{arvore}</aside>
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-0 w-full sm:w-auto sm:flex-1">
              {migalhas.length > 0 && <p className={`text-xs truncate ${sub}`}>{migalhas.join(' / ')}</p>}
              <div className="flex items-center gap-2">
                {pasta && <span className="w-3 h-3 rounded" style={{ background: pasta.cor }} />}
                <h2 className="text-xl font-bold truncate">{titulo}</h2>
              </div>
            </div>
            {(pasta || sel.tipo === 'cliente') && (
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${sub}`}>
                <span><strong className={claro ? 'text-slate-800' : 'text-slate-100'}>{tarefas.filter(t => t.estado !== 'feito').length}</strong> por acabar</span>
                <span><strong className={claro ? 'text-slate-800' : 'text-slate-100'}>{tempoTxt(horasTot)}</strong> registadas</span>
                <span><strong className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(valorAberto)}</strong> por entregar</span>
              </div>
            )}
          </div>
          {anosPorOrganizar.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={organizarCliente} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>📅 Organizar {anosPorOrganizar.map(p => p.nome).join(' e ')} por meses</button>
            </div>
          )}
          {pasta && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => mudar(tr => opFavorito(tr, pasta.id))} className={`px-2.5 py-1 text-xs rounded-lg border ${(trab.favoritos || []).includes(pasta.id) ? 'border-amber-400/50 text-amber-400' : claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>{(trab.favoritos || []).includes(pasta.id) ? '★ Favorito' : '☆ Favorito'}</button>
              {!pasta.paiId && (
                <select value={String(pasta.cid ?? '')} onChange={e => { const v = e.target.value; const c = clientes.find(x => String(x.id) === v); if (c) mudar(tr => opMudarCliente(tr, pasta.id, c.id)); }}
                  className={`text-xs rounded-lg border px-2 py-1 bg-transparent ${claro ? 'border-slate-200' : 'border-slate-700'}`} title="Cliente desta pasta">
                  {clientes.map(c => <option key={c.id} value={String(c.id)} className={claro ? '' : 'bg-slate-800'}>{c.nome}</option>)}
                </select>
              )}
              {porOrganizar(pasta) && (
                <button type="button" onClick={() => {
                  const plano = planoPorMeses(trab, pasta.id);
                  const porMes = {}; plano.slice().sort((a, b) => (a.mes || 99) - (b.mes || 99)).forEach(x => { const n = x.mes ? MESES_NOMES[x.mes - 1] : 'Sem mês'; porMes[n] = (porMes[n] || 0) + 1; });
                  const resumo = Object.entries(porMes).map(([n, q]) => `${n}: ${q}`).join(', ');
                  if (window.confirm(`Organizar "${pasta.nome}" por meses?\n\n${plano.length} listas vão para pastas de mês (${resumo}). As pastas por jogo que ficarem vazias desaparecem. As tarefas não mudam.`)) mudar(tr => opPorMeses(tr, pasta.id));
                }} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>📅 Organizar por meses</button>
              )}
              <button type="button" onClick={() => novaPasta(pasta.cid, pasta.id)} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>+ Subpasta</button>
              <button type="button" onClick={() => setPedir({ titulo: 'Novo nome da pasta', valor: pasta.nome, ok: n => mudar(tr => opPasta(tr, pasta.id, { nome: n })) })} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Mudar o nome</button>
              <div className="flex items-center gap-1">
                {CORES_PASTA.map(c => <button key={c} type="button" onClick={() => mudar(tr => opPasta(tr, pasta.id, { cor: c }))} className={`w-4 h-4 rounded ${pasta.cor === c ? 'ring-2 ring-offset-1 ring-offset-transparent ring-white/70' : ''}`} style={{ background: c }} aria-label="Cor da pasta" />)}
              </div>
              <span className="flex-1" />
              <button type="button" onClick={() => { const n = descendentes(trab, pasta.id).length - 1; const nt = tarefas.length; if (window.confirm(`Apagar "${pasta.nome}"${n ? `, ${n} subpasta${n === 1 ? '' : 's'}` : ''}${nt ? ` e ${nt} tarefa${nt === 1 ? '' : 's'}` : ''}?`)) { mudar(tr => opApagarPasta(tr, pasta.id)); setSel({ tipo: 'geral' }); } }} className="px-2.5 py-1 text-xs rounded-lg text-red-400 hover:bg-red-500/10">Apagar pasta</button>
            </div>
          )}
          {abas.length > 0 && (
            <div className={`flex gap-1 border-b ${claro ? 'border-slate-200' : 'border-slate-700/60'}`}>
              {abas.map(([k, n]) => (
                <button key={k} type="button" onClick={() => setAba(k)} className={`px-3 py-2 text-sm -mb-px border-b-2 ${abaAtual === k ? 'border-blue-500 font-semibold' : `border-transparent ${sub} hover:text-current`}`}>
                  {n}{k === 'notas' && notasAlvo.length ? <span className={`ml-1 text-xs ${sub}`}>{notasAlvo.length}</span> : null}
                </button>
              ))}
            </div>
          )}
          {sel.tipo === 'geral' && !procura.trim() && <VisaoGeral trab={trab} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={setTarefaAberta} ano={ano} mesNum={mesNum} />}
          {sel.tipo === 'timesheet' && !procura.trim() && <Timesheet trab={trab} mudar={mudar} clientes={clientes} theme={theme} onAbrir={setTarefaAberta} />}
          {sel.tipo === 'tipos' && !procura.trim() && <TiposTarefa cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} onPrecos={onPrecos} onCu={onCu} />}
          {sel.tipo === 'clientes' && !procura.trim() && <ListaClientes clientes={clientes} trab={trab} faturado={faturado} ano={ano} mesNum={mesNum} cu={cu} theme={theme}
            onAbrir={id => { setSel({ tipo: 'cliente', id }); setAba('ficha'); }}
            onNovo={nome => { const id = onNovoCliente(nome); if (id != null) { setSel({ tipo: 'cliente', id }); setAba('ficha'); } }} />}
          {abaAtual === 'ficha' && sel.tipo === 'cliente' && cliente && !procura.trim() && (
            <FichaCliente c={cliente} trab={trab} faturado={faturado} ano={ano} mesNum={mesNum} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass}
              onCliente={onCliente} onIrPrecos={() => setAba('precos')}
              onCriarDoClickUp={() => {
                const velho = cliente.id;
                const id = onNovoCliente(cliente.nome, { cor: cliente.cor && cliente.cor !== '#64748b' ? cliente.cor : undefined, aliases: [cliente.nome] });
                if (id == null) return;
                mudar(tr => ({ ...tr, pastas: (tr.pastas || []).map(p => (String(p.cid) === String(velho) ? { ...p, cid: id } : p)), tarefas: (tr.tarefas || []).map(t => (String(t.cid) === String(velho) ? { ...t, cid: id } : t)) }));
                setSel({ tipo: 'cliente', id });
              }} />
          )}
          {((sel.tipo !== 'geral' && sel.tipo !== 'timesheet' && sel.tipo !== 'clientes' && sel.tipo !== 'tipos') || procura.trim()) && abaAtual === 'tarefas' && (
            <div className="space-y-3">
              {pasta && <NovaTarefa onCriar={criarTarefa} cid={pasta.cid} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} nomesUsados={nomesUsados} />}
              {sel.tipo === 'cliente' && !procura.trim() && !filhasDe(trab, null, sel.id).length && (
                <Card><p className="text-sm">Ainda não há pastas para {cliente ? cliente.nome : 'este cliente'}. Carrega no <strong>+</strong> ao lado do nome, à esquerda.</p></Card>
              )}
              <div>
                <ListaTarefas tarefas={tarefas} trab={trab} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={setTarefaAberta} mostrarPasta={!pasta || descendentes(trab, pasta.id).length > 1}
                  onCriarNoEstado={pasta ? (txt, estado) => mudar(tr => { const n = opNovaTarefa(tr, { pastaId: pasta.id, cid: pasta.cid, nome: txt, prazo: '' }); const nova = n.tarefas[n.tarefas.length - 1]; return estado === 'todo' ? n : opEstado(n, nova.id, estado); }) : null} />
              </div>
            </div>
          )}
          {abaAtual === 'notas' && (pasta || sel.tipo === 'cliente') && <Notas notas={notasAlvo} onMudar={mudarNotas} theme={theme} inputClass={inputClass} />}
          {abaAtual === 'precos' && sel.tipo === 'cliente' && onPrecos && (
            <PrecosCliente cid={sel.id} nome={cliente ? cliente.nome : ''} cu={cu} clientes={clientesIn} theme={theme} inputClass={inputClass} onPrecos={onPrecos} />
          )}
          {abaAtual === 'orcamento' && pasta && (
            <Orcamento pasta={pasta} tarefas={tarefas} cid={pasta.cid} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass}
              nomeCliente={cliente ? cliente.nome : ''} onVerPrecos={onPrecos ? () => { setSel({ tipo: 'cliente', id: pasta.cid }); setAba('precos'); } : null}
              onMudar={orcamento => mudar(tr => opPasta(tr, pasta.id, { orcamento }))} />
          )}
        </section>
      </div>
      {pedir && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] p-4 bg-black/50 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) setPedir(null); }}>
          <form onSubmit={e => { e.preventDefault(); const v = e.target.elements.nome.value.trim(); if (v) pedir.ok(v); setPedir(null); }}
            className={`w-full max-w-sm rounded-2xl border p-4 shadow-2xl animate-modalIn ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
            <p className="text-sm font-semibold mb-2">{pedir.titulo}</p>
            <input name="nome" autoFocus defaultValue={pedir.valor} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPedir(null); } }} placeholder="Ex.: 44 - Mahjong - Oct" className={`${inputClass} text-sm py-2`} />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPedir(null)} className={`px-3 py-1.5 text-sm rounded-lg ${sub}`}>Cancelar</button>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}
      {tarefaSel && <DetalheTarefa t={tarefaSel} trab={trab} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} mudar={mudar} onFechar={() => setTarefaAberta(null)} />}
    </div>
  );
};

export { Trabalho };
