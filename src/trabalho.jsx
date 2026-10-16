// Separador "Trabalho": pastas e subpastas por cliente, tarefas com estados, cronómetro,
// notas/reuniões e orçamento automático. Substitui o ClickUp. Só é descarregado quando se abre.
// Os dados (trab) vêm do OrcamentoApp, que os guarda no Firestore; aqui só se lê e se pede para mudar.
import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  TRAB_ESTADOS, TRAB_VAZIO, trabId, trabDia, trabMsTempo, trabHoras, trabACorrer, trabEntrega,
  cuPreco, trabValor, trabValorAuto, trabPecas, trabRelogio, cuPecas, CU_TIPOS, CU_NOMES_EN, CU_CAMPOS_PRECO, CU_PRECOS_PADRAO, cuPresetCliente, cuEur, cuLerHoras, cuHorasTxt,
  meses, Card, trabParar, trabPorTipo, trabSugerirEstimativa, confirmar, avisoApp, paisDoCliente, NOME_PAIS_RECIBO, ehNaoFaturacao, PROCESS_INVOICE_URLS,
} from './base';
import { auth } from './firebase';

// Ícones de linha (mesmo estilo do resto da app), em vez de emojis
const ICONES_T = {
  casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  relogio: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9.5 2.5h5"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pessoas: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.65a3.5 3.5 0 0 1 0 6.7"/>',
  freelancer: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20v-1.5A3.5 3.5 0 0 1 6.5 15h5"/><path d="M14.5 20l1-3.5 4.5-4.5 2.5 2.5-4.5 4.5z"/>',
  etiqueta: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.25"/>',
  pasta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  jogo: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="17.5" cy="13.8" r=".9"/>',
  lapis: '<path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M12.5 6.5l5 5"/>',
  nota: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  criativos: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5 6 9M14 5l-2 4M20 5l-2 4"/><path d="m10.5 12 4 2.5-4 2.5z"/>',
  todas: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
};
const IcoT = ({ n, className = 'w-4 h-4' }) => (
  <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONES_T[n] || '' }} />
);
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
// ── Jogos (base de dados por cliente): cada lista de um jogo fica com a cor dele ──
// Uma lista "44 - Mahjong - Oct" é do jogo "Mahjong". Os jogos guardam a cor, outros nomes,
// a pasta do Google Drive e a spreadsheet (para mais tarde automatizar uploads).
const CORES_JOGO = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#84cc16', '#f43f5e', '#0ea5e9', '#d946ef', '#f59e0b', '#10b981'];
const MES_FIM_RE = /[\s\-–_]*\b(jan|janeiro|january|feb|february|fev|fevereiro|mar|march|marco|março|apr|april|abr|abril|may|mai|maio|jun|june|junho|jul|july|julho|aug|august|ago|agosto|sep|sept|september|set|setembro|oct|october|out|outubro|nov|november|novembro|dec|december|dez|dezembro)\.?\s*$/i;
const jogoDoNome = nome => String(nome || '').replace(/^\s*\d+\s*[-–_.]?\s*/, '').replace(MES_FIM_RE, '').replace(/_+/g, ' ').replace(/\s*[-–]\s*$/, '').trim();
const ehListaDeJogo = nome => /^\s*\d+\s*[-–_]/.test(String(nome || '')) || MES_FIM_RE.test(String(nome || ''));
const normJ = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const tokensJ = x => normJ(x).split(' ').filter(w => w.length > 1);
const jogoCombina = (j, nome) => {
  const a = tokensJ(nome);
  if (!a.length) return false;
  return [j.nome, ...(j.aliases || [])].some(n => { const b = tokensJ(n); return b.length > 0 && (a.every(w => b.includes(w)) || b.every(w => a.includes(w))); });
};
const acharJogo = (jogos, cid, nome) => (jogos || []).find(j => String(j.cid) === String(cid) && jogoCombina(j, nome));
// Liga as listas de um cliente aos jogos (cria os que faltam, com cores diferentes). dicas: { pastaId: nome do jogo }
const opDetetarJogos = (trab, cid, dicas = {}) => {
  let jogos = [...(trab.jogos || [])];
  const pastas = trab.pastas || [];
  const folhas = pastas.filter(p => String(p.cid) === String(cid) && !p.mesNum && !pastas.some(f => f.paiId === p.id));
  const atrib = {};
  folhas.forEach(p => {
    if (p.jogoId && jogos.some(j => j.id === p.jogoId)) return;
    const dica = dicas[p.id];
    if (!dica && !ehListaDeJogo(p.nome)) return;
    const daLista = jogoDoNome(p.nome);
    const nomeJ = dica || daLista;
    if (!nomeJ) return;
    let j = acharJogo(jogos, cid, nomeJ) || (daLista ? acharJogo(jogos, cid, daLista) : null);
    if (!j) {
      const usadas = new Set(jogos.filter(x => String(x.cid) === String(cid)).map(x => x.cor));
      const cor = CORES_JOGO.find(c => !usadas.has(c)) || CORES_JOGO[jogos.length % CORES_JOGO.length];
      j = { id: trabId() + 'j' + jogos.length, cid, nome: nomeJ, cor, aliases: [], criada: agoraIso() };
      jogos.push(j);
    }
    if (daLista && normJ(daLista) !== normJ(j.nome) && !(j.aliases || []).some(a => normJ(a) === normJ(daLista))) {
      const novo = { ...j, aliases: [...(j.aliases || []), daLista] };
      jogos = jogos.map(x => (x.id === j.id ? novo : x));
      j = novo;
    }
    atrib[p.id] = j.id;
  });
  const cor = Object.fromEntries(jogos.map(j => [j.id, j.cor]));
  return { ...trab, jogos, pastas: pastas.map(p => (atrib[p.id] ? { ...p, jogoId: atrib[p.id], cor: cor[atrib[p.id]] } : p)) };
};
// Uma lista nova (ou com nome novo) liga-se sozinha ao jogo, se já existir
const opAutoJogo = (trab, pastaId) => {
  const p = (trab.pastas || []).find(x => x.id === pastaId);
  if (!p || p.jogoId || p.mesNum || !ehListaDeJogo(p.nome)) return trab;
  const j = acharJogo(trab.jogos, p.cid, jogoDoNome(p.nome));
  return j ? opPasta(trab, pastaId, { jogoId: j.id, cor: j.cor }) : trab;
};
const opJogo = (trab, id, patch) => ({
  ...trab,
  jogos: (trab.jogos || []).map(j => (j.id === id ? { ...j, ...patch } : j)),
  pastas: patch.cor ? (trab.pastas || []).map(p => (p.jogoId === id ? { ...p, cor: patch.cor } : p)) : trab.pastas,
});
const opNovoJogo = (trab, cid, nome) => {
  const usadas = new Set((trab.jogos || []).filter(x => String(x.cid) === String(cid)).map(x => x.cor));
  const cor = CORES_JOGO.find(c => !usadas.has(c)) || CORES_JOGO[(trab.jogos || []).length % CORES_JOGO.length];
  const n = { ...trab, jogos: [...(trab.jogos || []), { id: trabId() + 'j', cid, nome, cor, aliases: [], criada: agoraIso() }] };
  return opDetetarJogos(n, cid);
};
const opApagarJogo = (trab, id) => ({ ...trab, jogos: (trab.jogos || []).filter(j => j.id !== id), pastas: (trab.pastas || []).map(p => (p.jogoId === id ? { ...p, jogoId: null } : p)) });
const opPorMeses = (trab, raizId) => {
  const raiz = (trab.pastas || []).find(p => p.id === raizId);
  if (!raiz) return trab;
  const plano = planoPorMeses(trab, raizId);
  // Dica do jogo de cada lista: a pasta antiga logo abaixo da raiz (ex.: "6_Mahjong")
  const dicas = {};
  plano.forEach(({ pasta }) => {
    const cam = caminho(trab, pasta.id);
    const i = cam.findIndex(x => x.id === raizId);
    const topo = i >= 0 ? cam[i + 1] : null;
    if (topo && topo.id !== pasta.id && !topo.mesNum) dicas[pasta.id] = jogoDoNome(topo.nome);
  });
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
  return opDetetarJogos({ ...trab, pastas, favoritos: (trab.favoritos || []).filter(f => vivos.has(f)) }, raiz.cid, dicas);
};
const opApagarPasta = (trab, id) => {
  const ids = new Set(descendentes(trab, id));
  return { ...trab, pastas: (trab.pastas || []).filter(p => !ids.has(p.id)), tarefas: (trab.tarefas || []).filter(t => !ids.has(t.pastaId)), favoritos: (trab.favoritos || []).filter(f => !ids.has(f)) };
};
const opNovaTarefa = (trab, { id, pastaId, cid, nome, prazo, pecas }) => ({
  ...trab, tarefas: [...(trab.tarefas || []), { id: id || trabId(), pastaId: pastaId || null, cid: cid ?? null, nome: nome.trim(), estado: 'todo', criada: agoraIso(), prazo: prazo || '', tempos: [], notas: '', ...(pecas ? { pecas } : {}) }],
});
const opTarefa = (trab, id, fn) => ({ ...trab, tarefas: (trab.tarefas || []).map(t => (t.id === id ? fn(t) : t)) });
const opParar = trabParar;
// Mudar o dia em que a tarefa foi entregue (para review / terminada) — é este dia que conta nas receitas do mês
const comEntregaEm = (x, dia) => {
  if (!dia || (x.estado !== 'review' && x.estado !== 'feito')) return x;
  const iso = new Date(`${dia}T18:00`).toISOString();
  return { ...x, ...(x.review || x.estado === 'review' ? { review: iso } : {}), ...(x.feita || x.estado === 'feito' ? { feita: iso } : {}) };
};
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
        className={compacto ? 'inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/10' : 'inline-flex items-center justify-center min-w-[96px] rounded-md text-[10.5px] font-bold uppercase tracking-wide px-2 py-1 text-white whitespace-nowrap'}
        style={compacto ? undefined : { background: e.cor }}>
        {compacto ? <IcoEstado id={e.id} cor={e.cor} size={13} /> : e.nome}
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
// Prazos: com o ano quando não é o deste ano (um «15/11» de 2025 parecia um prazo futuro)
const dataPrazo = iso => { const d = trabDia(iso); if (!d) return ''; return d.slice(0, 4) === String(new Date().getFullYear()) ? dataCurta(iso) : `${dataCurta(iso)}/${d.slice(2, 4)}`; };
const dataHora = iso => { if (!iso) return '—'; const d = new Date(iso); return `${dataCurta(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const paraInputLocal = iso => { if (!iso) return ''; const d = new Date(iso); return `${trabDia(iso)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// Links para o lançador do PC (aeproj://): ao carregar mostra «A abrir…» (e não deixa carregar duas vezes);
// se a app do PC aparecer (a janela do browser perde o foco), mostra «✓ Enviado ao PC» por uns segundos.
const LinkPC = ({ href, onClick, className = '', title, txtAbrir = 'A abrir…', txtOk = 'Enviado ao PC', children }) => {
  const [estado, setEstado] = useState(null);
  const [larg, setLarg] = useState(null);
  const tms = useRef([]);
  useEffect(() => () => tms.current.forEach(clearTimeout), []);
  const clicar = e => {
    if (estado === 'abrir') { e.preventDefault(); return; }
    if (onClick) onClick(e);
    setLarg(e.currentTarget.offsetWidth || null);
    setEstado('abrir');
    let saiu = false;
    const blur = () => { saiu = true; };
    window.addEventListener('blur', blur);
    tms.current.push(setTimeout(() => {
      window.removeEventListener('blur', blur);
      if (saiu) { setEstado('ok'); tms.current.push(setTimeout(() => { setEstado(null); setLarg(null); }, 2500)); } else { setEstado(null); setLarg(null); }
    }, 2500));
  };
  return (
    <a href={href} onClick={clicar} aria-busy={estado === 'abrir'} title={title} className={`${className} ${estado ? 'justify-center' : ''}`} style={larg ? { minWidth: larg } : undefined}>
      {estado === 'abrir'
        ? <><svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>{txtAbrir}</>
        : estado === 'ok' ? <span className="text-emerald-500">✓ {txtOk}</span> : children}
    </a>
  );
};
// Ecrã de telemóvel (< 640 px): uma só consulta partilhada por todas as linhas
const MQ_TEL = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 639px)') : null;
const ouvirTel = cb => { if (!MQ_TEL) return () => {}; if (MQ_TEL.addEventListener) MQ_TEL.addEventListener('change', cb); else MQ_TEL.addListener(cb); return () => { if (MQ_TEL.removeEventListener) MQ_TEL.removeEventListener('change', cb); else MQ_TEL.removeListener(cb); }; };
const useTelemovel = () => useSyncExternalStore(ouvirTel, () => !!(MQ_TEL && MQ_TEL.matches), () => false);

// ── Linha de uma tarefa ──
// Somar tempo à mão: carregas no tempo, escreves (ex.: 30m, 1h30) e ao sair soma-se ao que já lá estava
const opSomarTempo = (trab, id, horas) => {
  const ms = Math.round(horas * 60) * 60000;
  if (!(ms > 0)) return trab;
  const fim = Date.now();
  return opTarefa(trab, id, t => ({ ...t, iniciada: t.iniciada || new Date(fim - ms).toISOString(), tempos: [...(t.tempos || []), { id: trabId() + 's', ini: new Date(fim - ms).toISOString(), fim: new Date(fim).toISOString(), manual: true }] }));
};
const TempoSomar = ({ t, mudar, claro, className = '' }) => {
  const [edit, setEdit] = useState(false);
  if (edit) {
    return (
      <input autoFocus placeholder="+ ex.: 30m" aria-label="Tempo a somar"
        onBlur={e => { setEdit(false); const h = lerDuracao(e.target.value); if (h > 0) mudar(tr => opSomarTempo(tr, t.id, h)); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.value = ''; setEdit(false); } }}
        className={`w-20 h-7 px-1.5 rounded-md text-xs tabular-nums outline-none ring-2 ring-blue-500 ${claro ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-100'}`} />
    );
  }
  return (
    <button type="button" onClick={() => setEdit(true)} title="Carrega para somar tempo (ex.: 30m, 1h30)"
      className={`${className} rounded px-1 -mx-1 tabular-nums ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`}><HorasVivas t={t} /></button>
  );
};
// Carregar em qualquer parte da linha abre a tarefa — menos no que já faz outra coisa (botões, caixas, menus, links, ícones)
const ALVOS_DA_LINHA = 'button, a, input, select, textarea, label, summary, [role], [contenteditable="true"], [data-sem-abrir]';
const cliqueNaLinha = (e, abrir) => {
  const linha = e.currentTarget;
  if (e.defaultPrevented || e.button !== 0 || !linha.contains(e.target)) return; // cliques que vêm de menus noutra camada (portais) não contam
  for (let n = e.target; n && n !== linha; n = n.parentElement) {
    if (n.matches && n.matches(ALVOS_DA_LINHA)) return;
    const pos = window.getComputedStyle(n).position;
    if (pos === 'absolute' || pos === 'fixed') return; // dentro de um menu/popover aberto a partir da linha
  }
  const sel = window.getSelection && window.getSelection();
  if (sel && !sel.isCollapsed && linha.contains(sel.anchorNode)) return; // estavas a selecionar texto
  abrir();
};
const LinhaTarefa = ({ t, cu, clientes, theme, onAbrir, mudar, mostrarPasta, nomePasta }) => {
  const claro = useClaro(theme);
  const corre = (t.tempos || []).some(x => !x.fim);
  const v = trabValor(t, cu, clientes);
  const hoje = trabDia(new Date().toISOString());
  const atrasada = t.prazo && t.prazo < hoje && t.estado !== 'feito' && t.estado !== 'review';
  const tel = useTelemovel();
  if (tel) {
    const fraco = claro ? 'text-slate-500' : 'text-slate-400';
    const temIcones = (t.anexos || []).length > 0 || (t.notas && String(t.notas).trim());
    return (
      <div onClick={e => cliqueNaLinha(e, () => onAbrir(t.id))} className={`group cursor-pointer flex items-start gap-2.5 px-2 py-2 rounded-xl border transition-colors ${corre ? (claro ? 'border-red-200 bg-red-50 shadow-[inset_3px_0_0_0_#ef4444]' : 'border-red-500/30 bg-red-500/[0.08] shadow-[inset_3px_0_0_0_#ef4444]') : 'border-transparent'}`}>
        <span className="pt-0.5"><EstadoPill estado={t.estado} theme={theme} compacto onMudar={e => { avisarEstadoPC(t, e); mudar(tr => opEstado(tr, t.id, e)); }} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <button type="button" onClick={() => onAbrir(t.id)} className={`flex-1 min-w-0 text-left ${t.estado === 'feito' ? 'opacity-60' : ''}`}>
              <NomeTarefa t={t} cu={cu} claro={claro} prefixo={etiquetaTipo(t, cu) ? 'nunca' : 'sempre'} className={`text-sm ${t.estado === 'feito' ? 'line-through decoration-slate-500/60' : ''}`} />
            </button>
            {v > 0 && <span className={`shrink-0 text-xs tabular-nums ${claro ? 'text-emerald-700' : 'text-emerald-400'}`}>{eur(v)}</span>}
          </div>
          <div className={`mt-0.5 flex items-center gap-1.5 min-w-0 text-[11px] ${fraco}`}>
            <EtiquetaTipo t={t} cu={cu} claro={claro} maxw="max-w-[40%]" />
            {t.prazo && <span className={`shrink-0 tabular-nums ${atrasada ? 'text-red-400 font-medium' : ''}`} title="Prazo">{dataPrazo(t.prazo)}</span>}
            {(t.freelancerId || t.outsourcing) && <QuemFaz t={t} claro={claro} editavel={false} className="shrink-0 max-w-[90px]" />}
            {temIcones && (
              <span className="shrink-0 inline-flex items-center gap-1">
                {(t.anexos || []).length > 0 && <IcoA n="clip" className="w-3 h-3" />}
                {t.notas && String(t.notas).trim() && <IcoT n="nota" className="w-3 h-3" />}
              </span>
            )}
            {(mostrarPasta && nomePasta) && <span className="flex-1 min-w-0 truncate">{nomePasta}</span>}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <BotaoCrono aCorrer={corre} theme={theme} onIniciar={() => { if (t.estado === 'todo') avisarEstadoPC(t, 'curso'); mudar(tr => opIniciar(tr, t.id)); }} onParar={() => mudar(opParar)} />
          <span className={`text-[11px] ${fraco}`}><TempoSomar t={t} mudar={mudar} claro={claro} /></span>
        </div>
      </div>
    );
  }
  return (
    <div onClick={e => cliqueNaLinha(e, () => onAbrir(t.id))} className={`group cursor-pointer flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-xl border transition-colors ${corre ? (claro ? 'border-red-200 bg-red-50 shadow-[inset_3px_0_0_0_#ef4444]' : 'border-red-500/30 bg-red-500/[0.08] shadow-[inset_3px_0_0_0_#ef4444]') : claro ? 'border-transparent hover:border-slate-200 hover:bg-slate-50' : 'border-transparent hover:border-slate-700 hover:bg-white/[0.03]'}`}>
      <EstadoPill estado={t.estado} theme={theme} compacto onMudar={e => { avisarEstadoPC(t, e); mudar(tr => opEstado(tr, t.id, e)); }} />
      <button type="button" onClick={() => onAbrir(t.id)} className={`flex-1 min-w-0 text-left ${t.estado === 'feito' ? 'opacity-60' : ''}`}>
        <NomeTarefa t={t} cu={cu} claro={claro} prefixo={etiquetaTipo(t, cu) ? 'sm:hidden' : 'sempre'} className={`text-sm ${t.estado === 'feito' ? 'line-through decoration-slate-500/60' : ''}`} />
        {(mostrarPasta && nomePasta) && <span className={`block truncate text-[11px] ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{nomePasta}</span>}
      </button>
      <LinkDrive t={t} claro={claro} />
      <BotaoTrello t={t} mudar={mudar} claro={claro} alinhar="dir" />
      <LinkFolha t={t} claro={claro} />
      {((t.anexos || []).length > 0 || (t.notas && String(t.notas).trim())) && (
        <span className={`shrink-0 inline-flex items-center gap-1 ${claro ? 'text-slate-400' : 'text-slate-500'}`}>
          {(t.anexos || []).length > 0 && <span title={`${t.anexos.length} anexo${t.anexos.length === 1 ? '' : 's'}`}><IcoA n="clip" className="w-3.5 h-3.5" /></span>}
          {t.notas && String(t.notas).trim() && <span title="Tem notas"><IcoT n="nota" className="w-3.5 h-3.5" /></span>}
        </span>
      )}
      {(t.freelancerId || t.outsourcing) && <QuemFaz t={t} claro={claro} editavel={false} className="shrink-0 max-w-[110px]" />}
      <EtiquetaTipo t={t} cu={cu} claro={claro} className="hidden sm:inline-block" />
      {t.prazo && <span className={`hidden sm:inline text-xs tabular-nums ${atrasada ? 'text-red-400 font-medium' : claro ? 'text-slate-500' : 'text-slate-400'}`} title="Prazo">{dataPrazo(t.prazo)}</span>}
      <span className={`min-w-[3.5rem] text-right text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}><TempoSomar t={t} mudar={mudar} claro={claro} /></span>
      <span className={`hidden sm:inline w-16 text-right text-xs tabular-nums ${v ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'opacity-40'}`}>{v ? eur(v) : '—'}</span>
      <BotaoCrono aCorrer={corre} theme={theme} onIniciar={() => { if (t.estado === 'todo') avisarEstadoPC(t, 'curso'); mudar(tr => opIniciar(tr, t.id)); }} onParar={() => mudar(opParar)} />
      {APAGAR.pedir && <button type="button" onClick={e => { e.stopPropagation(); APAGAR.pedir(t); }} className={`shrink-0 w-6 h-6 hidden sm:group-hover:inline-flex focus:inline-flex items-center justify-center rounded-md ${claro ? 'text-slate-400' : 'text-slate-500'} hover:text-red-400`} title="Apagar a tarefa" aria-label="Apagar a tarefa">
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>}
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
// Nome · Tipo · ícones (anexo, notas, Trello, Drive, spreadsheet) · Estado · Quem faz · Prioridade · Criada · Tempo · Prazo · Terminada · Valor
const COLS = 'grid grid-cols-[minmax(0,1fr)_112px_130px_96px_100px_64px_68px_88px_48px_68px_60px] items-center gap-x-2.5';
const COLS_CURTO = 'grid grid-cols-[minmax(0,1fr)_100px_130px_96px_88px_64px_88px_48px_60px] items-center gap-x-2.5';
// Grupos fechados/abertos (fica lembrado)
const useGruposFechados = () => {
  const [f, setF] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('trab-grupos-fechados')) || []); } catch (e) { return new Set(); } });
  const alternar = id => setF(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('trab-grupos-fechados', JSON.stringify([...n])); } catch (e) { /* sem armazenamento */ } return n; });
  return [f, alternar];
};
// Etiqueta verde com o tipo de criativo (Vídeo novo, 2× Iteração, À hora…)
const etiquetaTipo = (t, cu) => {
  const ps = trabPecas(t);
  if (ps.some(p => p.tipo === 'extra' || p.tipo === 'outro')) return ps.filter(p => p.tipo !== 'extra' && p.tipo !== 'outro').length ? null : 'À hora';
  const usados = {}; ps.forEach(p => { usados[p.tipo] = 1; });
  const tipos = tiposDe(cu, usados);
  return ps.map(p => { const x = tipos.find(y => y.id === p.tipo); return `${p.n > 1 ? p.n + '× ' : ''}${x ? (x.curto || x.nome) : p.tipo}`; }).join(' + ') || null;
};
// Tons próximos do verde (verde → azul-petróleo → azul), para distinguir os tipos sem virar arco-íris
const MATIZ_TIPO = { video: 152, variacao: 174, iteracao: 190, ai_clip: 182, hook: 136, aso: 163, video3d: 144, banner: 204, banner_var: 214, icone: 222, feature: 198, screenshots: 208 };
const matizTipo = id => { if (MATIZ_TIPO[id] != null) return MATIZ_TIPO[id]; let h = 0; String(id || '').split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) % 997; }); return 130 + (h % 90); };
const EtiquetaTipo = ({ t, cu, claro, className = '', maxw = 'max-w-[45%]' }) => {
  const txt = etiquetaTipo(t, cu);
  if (!txt) return null;
  const p0 = trabPecas(t).find(p => p.tipo !== 'extra' && p.tipo !== 'outro');
  const cls = `${className} shrink-0 ${maxw} truncate px-1.5 py-px rounded-md text-[11px] font-medium`;
  if (!p0) return <span className={`${cls} ${claro ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' : 'bg-white/5 text-slate-300 ring-1 ring-white/10'}`} title={txt}>{txt}</span>;
  const h = matizTipo(p0.tipo);
  const est = claro
    ? { background: `hsl(${h} 70% 95%)`, color: `hsl(${h} 70% 27%)`, boxShadow: `inset 0 0 0 1px hsl(${h} 55% 82%)` }
    : { background: `hsla(${h}, 70%, 45%, .12)`, color: `hsl(${h} 62% 62%)`, boxShadow: `inset 0 0 0 1px hsla(${h}, 70%, 50%, .22)` };
  return <span className={cls} style={est} title={txt}>{txt}</span>;
};
// Nome da tarefa partido: "1x Variation + 1x Iteration - Monthly Earnings V4 - Surprise Intro"
// → { prefixo: '1x Variation + 1x Iteration', conceito: 'Monthly Earnings', versao: 'V4', variacao: 'Surprise Intro' }
const partesNomeTarefa = (nome, cu) => {
  const s = String(nome || '').trim();
  const segs = s.split(/\s[-–—]\s/).map(x => x.trim()).filter(Boolean);
  let prefixo = '';
  if (segs.length > 1 && (/^\d+\s*[x×]\s/i.test(segs[0]) || /^extra work$/i.test(segs[0]) || ehRotuloTipo(segs[0], cu))) prefixo = segs.shift();
  else if (segs.length === 1 && /^\d+\s*[x×]\s/i.test(segs[0])) {
    // "1x New Video- Nurse IQ Interview" (hífen colado): parte no primeiro hífen
    const m = /^(.+?)\s*[-–—]\s*(.+)$/.exec(segs[0]);
    if (!m) return { prefixo: '', conceito: segs[0], versao: '', variacao: '' };
    prefixo = m[1].trim(); segs[0] = m[2].trim();
  }
  let conceito = segs.shift() || '';
  let versao = '';
  const m = /^(.*?)\s+(V\d+(?:\s*[+&/,]\s*V?\d+)*)$/i.exec(conceito);
  if (m && m[1].trim()) { conceito = m[1].trim(); versao = m[2].toUpperCase().replace(/\s+/g, ''); }
  else if (/^V\d+$/i.test(conceito) && segs.length) { versao = conceito.toUpperCase(); conceito = segs.shift(); }
  return { prefixo, conceito, versao, variacao: segs.join(' - ') };
};
// Mostra o nome com o conceito em destaque, a versão numa etiqueta e a variação mais apagada.
// prefixo: 'sempre' | 'nunca' | 'semTipo' (só aparece quando não há etiqueta de tipo ao lado) | classes CSS (ex.: 'sm:hidden')
const NomeTarefa = ({ t, cu, claro, prefixo = 'sempre', quebra = false, className = '' }) => {
  const p = partesNomeTarefa(t.nome, cu);
  const feito = t.estado === 'feito';
  const fraco = claro ? 'text-slate-500' : 'text-slate-400';
  const mostrarPref = p.prefixo && (prefixo === 'sempre' || (prefixo === 'semTipo' && !etiquetaTipo(t, cu)) || (prefixo !== 'nunca' && prefixo !== 'semTipo' && prefixo !== 'sempre'));
  const clsPref = prefixo !== 'nunca' && prefixo !== 'semTipo' && prefixo !== 'sempre' ? prefixo : '';
  const chip = `inline-block align-[1px] ml-1.5 px-1 rounded text-[10.5px] leading-[16px] font-semibold tabular-nums ${claro ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/25'} ${feito ? 'opacity-60' : ''}`;
  return (
    <span className={`block ${quebra ? 'break-words' : 'truncate'} ${className}`} title={t.nome}>
      {mostrarPref && <span className={`${clsPref} text-[11.5px] font-medium tabular-nums ${claro ? 'text-teal-700/80' : 'text-teal-300/70'} mr-1.5`}>{p.prefixo}</span>}
      {p.conceito ? <span className={`font-medium ${feito ? fraco : ''}`}>{p.conceito}</span> : !mostrarPref && <span className={`font-medium ${feito ? fraco : ''}`}>{p.prefixo || t.nome}</span>}
      {p.versao && <span className={chip}>{p.versao}</span>}
      {p.variacao && <span className={`font-normal ${fraco}`}><span className="mx-1.5 opacity-60" aria-hidden="true">·</span>{p.variacao}</span>}
    </span>
  );
};
const LinhaTabela =({ t, cu, clientes, theme, mudar, onAbrir, nomePasta, cheio = true, marcada = false, algumaMarcada = false, onMarcar }) => {
  const claro = useClaro(theme);
  const corre = (t.tempos || []).some(x => !x.fim);
  const v = trabValor(t, cu, clientes);
  const hoje = trabDia(new Date().toISOString());
  const atrasada = t.prazo && t.prazo < hoje && t.estado !== 'feito' && t.estado !== 'review';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [editar, setEditar] = useState(false);
  const editavaNoClique = useRef(false); // carregar na linha para acabar de mudar o nome não abre a tarefa
  const gravarNome = v => { setEditar(false); const n = v.trim(); if (n && n !== t.nome) mudar(tr => opTarefa(tr, t.id, x => ({ ...x, nome: n }))); };
  return (
    <div onMouseDownCapture={() => { editavaNoClique.current = editar; }} onClick={e => { if (!editar && !editavaNoClique.current) cliqueNaLinha(e, () => onAbrir(t.id)); }} className={`${cheio ? COLS : COLS_CURTO} group ${editar ? '' : 'cursor-pointer'} px-3 ${nomePasta ? 'h-11' : 'h-[38px]'} border-b text-[13px] transition-colors ${marcada ? (claro ? 'bg-blue-50 border-blue-100' : 'bg-blue-500/[0.08] border-blue-500/10') : corre ? (claro ? 'bg-red-50 border-red-100 shadow-[inset_3px_0_0_0_#ef4444]' : 'bg-red-500/[0.09] border-red-500/10 shadow-[inset_3px_0_0_0_#ef4444]') : claro ? 'border-slate-100 hover:bg-slate-50' : 'border-white/[0.04] hover:bg-white/[0.03]'}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {onMarcar && (
          <input type="checkbox" checked={marcada} onChange={() => {}} onClick={e => { e.stopPropagation(); onMarcar(t.id, e.shiftKey); }}
            className={`-ml-1 w-3.5 h-3.5 shrink-0 accent-blue-500 cursor-pointer ${marcada || algumaMarcada ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`} aria-label={`Selecionar ${t.nome}`} title="Selecionar (Shift para várias seguidas)" />
        )}
        <EstadoPill estado={t.estado} theme={theme} compacto onMudar={e => { avisarEstadoPC(t, e); mudar(tr => opEstado(tr, t.id, e)); }} />
        {editar ? (
          <input autoFocus defaultValue={t.nome} onFocus={e => e.target.select()} onBlur={e => gravarNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setEditar(false); } }}
            className={`flex-1 min-w-0 h-8 px-2 rounded-md text-[13px] font-medium outline-none ring-2 ring-blue-500 ${claro ? 'bg-white' : 'bg-slate-800'}`} aria-label="Nome da tarefa" />
        ) : (
          <>
            <button type="button" onClick={() => onAbrir(t.id)} className="min-w-0 text-left">
              <NomeTarefa t={t} cu={cu} claro={claro} prefixo="semTipo" />
              {nomePasta && <span className={`block truncate text-[11px] -mt-0.5 ${sub}`}>{nomePasta}</span>}
            </button>
            <button type="button" onClick={() => setEditar(true)} className={`shrink-0 w-6 h-6 hidden group-hover:inline-flex focus:inline-flex items-center justify-center rounded-md ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`} title="Mudar o nome" aria-label="Mudar o nome">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13l-3 1 1-3 8.5-8.5z" strokeLinejoin="round" /></svg>
            </button>
            {APAGAR.pedir && <button type="button" onClick={e => { e.stopPropagation(); APAGAR.pedir(t); }} className={`shrink-0 w-6 h-6 hidden group-hover:inline-flex focus:inline-flex items-center justify-center rounded-md ${sub} hover:text-red-400 ${claro ? 'hover:bg-red-50' : 'hover:bg-red-500/10'}`} title="Apagar a tarefa" aria-label="Apagar a tarefa">
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>}
          </>
        )}
      </div>
      <div className="min-w-0 flex"><EtiquetaTipo t={t} cu={cu} claro={claro} maxw="max-w-full" /></div>
      <div className="grid grid-cols-[repeat(5,26px)] items-center justify-items-center">
        <span className="inline-flex">{(t.anexos || []).length > 0 && <ClipAnexos anexos={t.anexos} claro={claro} sub={sub} cid={t.cid} />}</span>
        <span className="inline-flex">{t.notas && String(t.notas).trim() && <button type="button" onClick={e => { e.stopPropagation(); onAbrir(t.id); }} className={`inline-flex items-center px-1 h-5 rounded ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} title={`Notas: ${String(t.notas).slice(0, 300)}`} aria-label="Ver as notas da tarefa"><IcoT n="nota" className="w-3.5 h-3.5" /></button>}</span>
        <span className="inline-flex"><BotaoTrello t={t} mudar={mudar} claro={claro} /></span>
        <span className="inline-flex"><LinkDrive t={t} claro={claro} /></span>
        <span className="inline-flex"><LinkFolha t={t} claro={claro} /></span>
      </div>
      <div className="flex justify-center"><EstadoPill estado={t.estado} theme={theme} onMudar={e => { avisarEstadoPC(t, e); mudar(tr => opEstado(tr, t.id, e)); }} /></div>
      <div className="min-w-0 flex justify-center"><QuemFaz t={t} mudar={mudar} claro={claro} /></div>
      <div>
        {(() => { const pr = PRIORIDADES.find(x => x[0] === t.prioridade); return (
          <select value={t.prioridade || ''} onChange={e => mudar(tr => opTarefa(tr, t.id, x => ({ ...x, prioridade: e.target.value || null })))} aria-label="Prioridade"
            className={`w-full appearance-none bg-transparent text-[12px] text-center [text-align-last:center] rounded-md px-1.5 py-1 cursor-pointer outline-none ${pr ? 'font-medium' : sub} ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} style={pr ? { color: pr[2] } : undefined}>
            <option value="" className={claro ? '' : 'bg-slate-800 text-slate-300'}>—</option>
            {PRIORIDADES.map(([k, n, c]) => <option key={k} value={k} className={claro ? '' : 'bg-slate-800'} style={{ color: c }}>⚑ {n}</option>)}
          </select>
        ); })()}
      </div>
      {cheio && <div className={`text-center ${sub}`}>{haQuanto(t.criada)}</div>}
      <div className="flex items-center gap-2">
        <BotaoCrono aCorrer={corre} theme={theme} pequeno onIniciar={() => { if (t.estado === 'todo') avisarEstadoPC(t, 'curso'); mudar(tr => opIniciar(tr, t.id)); }} onParar={() => mudar(opParar)} />
        <TempoSomar t={t} mudar={mudar} claro={claro} className={sub} />
      </div>
      <div className={`text-center tabular-nums ${atrasada ? 'text-red-400 font-medium' : sub}`}>{t.prazo ? dataPrazo(t.prazo) : '—'}</div>
      {cheio && <div className={`text-center ${sub}`}>{t.feita ? haQuanto(t.feita) : '—'}</div>}
      <div className={`text-right tabular-nums ${v ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'opacity-40'}`}>{v ? eur(v) : '—'}</div>
    </div>
  );
};
const ListaTarefas = ({ tarefas, trab, cu, clientes, theme, mudar, onAbrir, mostrarPasta, onCriarNoEstado, comCliente = false }) => {
  const claro = useClaro(theme);
  const largo = useLargo();
  const cheio = useLargo('(min-width: 1400px)');
  const [fechados, alternar] = useGruposFechados();
  const [novaEm, setNovaEm] = useState(null);
  const [txt, setTxt] = useState('');
  const nomeCliT = t => { const c = (clientes || []).find(x => String(x.id) === String(t.cid)); return c ? c.nome : String(t.cid || '').replace(/^cu:/, ''); };
  const nomePasta = t => { if (!mostrarPasta) return ''; const pp = caminho(trab, t.pastaId).map(p => p.nome).slice(-2).join(' / '); return comCliente ? [nomeCliT(t), pp].filter(Boolean).join(' · ') : pp; };
  // Ordenar por coluna (carrega no título; outra vez inverte; à terceira volta ao normal) — sempre dentro de cada estado
  const [ordem, setOrdemEstado] = useState(() => { try { return JSON.parse(localStorage.getItem('trab-ordem')) || null; } catch (e) { return null; } });
  const setOrdem = o => { setOrdemEstado(o); try { localStorage.setItem('trab-ordem', JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } };
  const clicarOrdem = col => setOrdem(!ordem || ordem.col !== col ? { col, dir: 1 } : ordem.dir === 1 ? { col, dir: -1 } : null);
  const chaveOrdem = {
    nome: t => String(t.nome || '').toLowerCase(),
    tipo: t => (etiquetaTipo(t, cu) || '').toLowerCase(),
    quem: t => { const f = FREE.lista.find(x => x.id === t.freelancerId); return (f ? f.nome : t.outsourcing || '').toLowerCase(); },
    prio: t => { const i = PRIORIDADES.findIndex(x => x[0] === t.prioridade); return i < 0 ? null : i; },
    criada: t => t.criada || null,
    tempo: t => trabHoras(t) || null,
    prazo: t => t.prazo || null,
    feita: t => t.feita || t.review || null,
    valor: t => trabValor(t, cu, clientes) || null,
  };
  const ordenar = lista => {
    if (!ordem || !chaveOrdem[ordem.col]) return lista;
    const k = chaveOrdem[ordem.col];
    return lista.map(t => [t, k(t)]).sort((a, b) => {
      const x = a[1], y = b[1];
      const vx = x == null || x === '', vy = y == null || y === '';
      if (vx || vy) return vx === vy ? 0 : vx ? 1 : -1; // vazios sempre no fim
      return (x < y ? -1 : x > y ? 1 : 0) * ordem.dir;
    }).map(a => a[0]);
  };
  const grupos = ORDEM_GRUPOS.map(id => ({ ...TRAB_ESTADOS.find(e => e.id === id), lista: ordenar(tarefas.filter(t => t.estado === id)) })).filter(g => g.lista.length || (onCriarNoEstado && g.id === 'todo'));
  const cabOrdem = (col, txt, alinhar = '') => {
    const ativo = ordem && ordem.col === col;
    return (
      <button type="button" onClick={() => clicarOrdem(col)} title={`Ordenar por ${txt.toLowerCase()}`}
        className={`flex items-center min-w-0 ${alinhar === 'centro' ? 'justify-center' : alinhar === 'dir' ? 'justify-end' : 'justify-start'} ${ativo ? 'text-blue-400' : ''} hover:text-blue-400`}>
        <span className="relative whitespace-nowrap">{txt}{ativo && <span className={`absolute top-1/2 -translate-y-1/2 text-[8px] ${alinhar === 'dir' ? 'right-full mr-0.5' : 'left-full ml-0.5'}`}>{ordem.dir === -1 ? '▼' : '▲'}</span>}</span>
      </button>
    );
  };
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const criar = id => { if (txt.trim()) { onCriarNoEstado(txt, id); setTxt(''); } };
  // Seleção de várias tarefas (para mudar o prazo, o estado ou a prioridade de uma vez)
  const [marcadas, setMarcadas] = useState(() => new Set());
  const ultimaMarcada = useRef(null);
  const visiveis = grupos.filter(g => !fechados.has(g.id)).flatMap(g => g.lista.map(t => t.id));
  const idsTodos = new Set(tarefas.map(t => t.id));
  const sel = [...marcadas].filter(id => idsTodos.has(id));
  const marcar = (id, shift) => setMarcadas(prev => {
    const n = new Set(prev);
    if (shift && ultimaMarcada.current && visiveis.includes(ultimaMarcada.current)) {
      const a = visiveis.indexOf(ultimaMarcada.current), b = visiveis.indexOf(id);
      visiveis.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => n.add(x));
    } else if (n.has(id)) n.delete(id); else n.add(id);
    ultimaMarcada.current = id;
    return n;
  });
  const limparSel = () => { setMarcadas(new Set()); ultimaMarcada.current = null; };
  useEffect(() => {
    if (!sel.length) return undefined;
    const esc = e => { if (e.key === 'Escape' && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.closest('[role=toolbar]'))) { e.stopPropagation(); limparSel(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [sel.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const emTodas = fn => { const ids = new Set(sel); mudar(tr => ({ ...tr, tarefas: (tr.tarefas || []).map(x => (ids.has(x.id) ? fn(x) : x)) })); };
  const estadoTodas = e => { const ids = [...sel]; mudar(tr => ids.reduce((acc, id) => opEstado(acc, id, e), tr)); };
  if (!grupos.length) return <p className={`px-2 py-6 text-sm ${sub}`}>Sem tarefas.</p>;
  return (
    <div className="space-y-5">
      {sel.length > 0 && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl border shadow-2xl animate-modalIn max-w-[calc(100vw-2rem)] ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`} role="toolbar" aria-label="Ações para as tarefas selecionadas">
          <span className="text-sm font-semibold px-1">{sel.length} selecionada{sel.length === 1 ? '' : 's'}</span>
          <span className={`w-px h-5 ${claro ? 'bg-slate-200' : 'bg-slate-700'}`} />
          <label className={`flex items-center gap-1.5 text-xs ${sub}`}>Prazo
            <input type="date" onChange={e => { if (e.target.value) emTodas(x => ({ ...x, prazo: e.target.value })); }} className={`rounded-lg border px-2 py-1 text-xs ${claro ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-600 text-slate-100'}`} aria-label="Prazo para as selecionadas" />
          </label>
          <button type="button" onClick={() => emTodas(x => ({ ...x, prazo: null }))} className={`text-xs ${sub} hover:text-red-400`}>Tirar prazo</button>
          <span className={`w-px h-5 ${claro ? 'bg-slate-200' : 'bg-slate-700'}`} />
          <label className={`flex items-center gap-1.5 text-xs ${sub}`} title="Para tarefas já entregues: o dia em que as entregaste (é esse dia que conta nas receitas)">Entregues em
            <input type="date" onChange={e => { if (e.target.value) emTodas(x => comEntregaEm(x, e.target.value)); }} className={`rounded-lg border px-2 py-1 text-xs ${claro ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-600 text-slate-100'}`} />
          </label>
          <select value="" onChange={e => { if (e.target.value) estadoTodas(e.target.value); }} className={`rounded-lg border px-2 py-1 text-xs ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`} aria-label="Estado para as selecionadas">
            <option value="">Estado…</option>
            {TRAB_ESTADOS.map(e2 => <option key={e2.id} value={e2.id}>{e2.nome}</option>)}
          </select>
          <select value="" onChange={e => { const v = e.target.value; if (v) emTodas(x => ({ ...x, prioridade: v === '-' ? null : v })); }} className={`rounded-lg border px-2 py-1 text-xs ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`} aria-label="Prioridade para as selecionadas">
            <option value="">Prioridade…</option>
            {PRIORIDADES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            <option value="-">Sem prioridade</option>
          </select>
          <button type="button" onClick={limparSel} className={`ml-1 w-7 h-7 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} title="Limpar a seleção (Esc)" aria-label="Limpar a seleção">✕</button>
        </div>
      )}
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
              {largo && g.lista.length > 1 && (() => { const todas = g.lista.every(x => marcadas.has(x.id)); return (
                <button type="button" onClick={() => setMarcadas(prev => { const n = new Set(prev); g.lista.forEach(x => (todas ? n.delete(x.id) : n.add(x.id))); return n; })} className={`text-[11px] ${sub} hover:text-blue-400 ${sel.length ? '' : 'opacity-0 hover:opacity-100 focus:opacity-100'}`}>{todas ? 'Desmarcar' : 'Selecionar todas'}</button>
              ); })()}
              {(valor > 0 || horas > 0) && <span className={`text-xs ${sub}`}>· {horas > 0 ? tempoTxt(horas) : ''}{horas > 0 && valor > 0 ? ' · ' : ''}{valor > 0 ? eur(valor) : ''}</span>}
            </div>
            {!fechado && (
              <div className={`rounded-xl border ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
                {largo && g.lista.length > 0 && (
                  <div className={`${cheio ? COLS : COLS_CURTO} px-3 h-8 border-b text-[11px] font-medium ${claro ? 'border-slate-100 text-slate-400' : 'border-white/[0.05] text-slate-500'}`}>
                    {cabOrdem('nome', 'Nome')}{cabOrdem('tipo', 'Tipo')}{(() => {
                      // Só mostra o ícone de cada coluna quando alguma tarefa deste grupo o pode ter (ex.: jogos sem Trello não mostram o do Trello)
                      const jg = x => (trab ? jogoDaTarefa(trab, x) : null);
                      const tem = {
                        anexo: g.lista.some(x => (x.anexos || []).length),
                        notas: g.lista.some(x => x.notas && String(x.notas).trim()),
                        trello: g.lista.some(x => (x.trello && x.trello.url) || usaTrello(jg(x))),
                        drive: g.lista.some(x => x.drive && x.drive.url),
                        folha: g.lista.some(x => { const j = jg(x); return j && !j.semJogo && j.sheet; }),
                      };
                      return (
                        <span className="grid grid-cols-[repeat(5,26px)] justify-items-center" aria-hidden="true">
                          <span>{tem.anexo && <IcoA n="clip" className="w-3 h-3 opacity-70" />}</span>
                          <span>{tem.notas && <IcoT n="nota" className="w-3 h-3 opacity-70" />}</span>
                          <span>{tem.trello && <IcoTrello s={11} />}</span>
                          <span>{tem.drive && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l6 10-4 7H6l-4-7z" /></svg>}</span>
                          <span>{tem.folha && <IcoFolha s={11} />}</span>
                        </span>
                      );
                    })()}<span className="text-center">Estado</span>{cabOrdem('quem', 'Quem faz', 'centro')}{cabOrdem('prio', 'Prioridade', 'centro')}{cheio && cabOrdem('criada', 'Criada', 'centro')}{cabOrdem('tempo', 'Tempo')}{cabOrdem('prazo', 'Prazo', 'centro')}{cheio && cabOrdem('feita', 'Terminada', 'centro')}{cabOrdem('valor', 'Valor', 'dir')}
                  </div>
                )}
                {g.lista.map(t => (largo
                  ? <LinhaTabela key={t.id} t={t} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={onAbrir} nomePasta={nomePasta(t)} cheio={cheio} marcada={marcadas.has(t.id)} algumaMarcada={sel.length > 0} onMarcar={marcar} />
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
// Sugestões ao escrever uma tarefa nova: só tipos de tarefa (com o nome em inglês, como no ClickUp)
const semAcentos = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const sugestoesTarefa = (txt, cu, preco) => {
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
  return out.slice(0, 8);
};
const NovaTarefa = ({ onCriar, cid, cu, clientes, theme, inputClass, semPasta, jogoTrello }) => {
  const [txt, setTxt] = useState('');
  const [paraTrello, setParaTrello] = useState(() => { try { return localStorage.getItem('trab-novo-trello') === '1'; } catch (e) { return false; } });
  const mudarParaTrello = v => { setParaTrello(v); try { localStorage.setItem('trab-novo-trello', v ? '1' : '0'); } catch (e) { /* */ } };
  const comTrello = !!(usaTrello(jogoTrello) && jogoTrello.trelloLista);
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
  const sug = foco && !semPasta && !tipoEsc ? sugestoesTarefa(txt, cu, preco) : [];
  const escolher = o => {
    setTxt(o.texto);
    setTipoEsc(o.tipo ? { tipo: o.tipo, n: o.n } : null);
    setAtiva(-1);
    setTimeout(() => { const el = inRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
  };
  const criar = () => { if (!txt.trim()) return; onCriar(txt.replace(/\s*-\s*$/, ''), prazo, pecasEsc, { trello: comTrello && paraTrello }); setTxt(''); setTipoEsc(null); setAtiva(-1); };
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
        {comTrello && (
          <button type="button" onClick={() => mudarParaTrello(!paraTrello)} aria-pressed={paraTrello} aria-label="Criar também o cartão no Trello"
            title={paraTrello ? `Vai criar também o cartão no Trello (${jogoTrello.trelloNome || 'quadro do jogo'} · ${jogoTrello.trelloLista.nome}). Carrega para não criar.` : 'Carrega para criar também o cartão no Trello'}
            className={`relative shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg border ${paraTrello ? 'border-sky-500/60 bg-sky-500/15 text-sky-500' : claro ? 'border-slate-200 text-slate-300 hover:text-sky-500' : 'border-slate-700 text-slate-600 hover:text-sky-400'}`}>
            <IcoTrello s={15} />
            {paraTrello && <span className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-sky-500 inline-flex items-center justify-center"><svg width="7" height="7" viewBox="0 0 10 10" aria-hidden="true"><path d="m2 5.2 2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
          </button>
        )}
        <button type="button" onClick={criar} disabled={!txt.trim() || semPasta} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">Adicionar</button>
      </div>
      {txt.trim() && (
        <p className={`mt-1.5 px-1 text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>
          {tipoEsc && <button type="button" onClick={() => setTipoEsc(null)} className="mr-1.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400" title="Tirar o tipo escolhido">{tipoEsc.tipo === 'extra' ? 'À hora' : `${tipoEsc.n} × ${nomeTipo(tipoEsc.tipo)}`} ✕</button>}
          {!tipoEsc && (pecas.length ? pecas.map(p => `${p.n} × ${nomeTipo(p.tipo)}`).join(' + ') : 'Tarefa sem peças (conta à hora)')}
          {preview > 0 && <> · vale <strong className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(preview)}</strong></>}
          <> · fica criada hoje, {dataCurta(new Date().toISOString())}</>
          {comTrello && paraTrello && <> · e vai para o Trello ({jogoTrello.trelloLista.nome})</>}
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
                <button type="button" className="text-xs text-slate-400 hover:text-red-400" onClick={async () => { if (await confirmar('Apagar esta nota?')) onMudar((notas || []).filter(x => x.id !== n.id)); }}>Apagar</button>
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
// Quantidade com setas ▲▼ (para não teres de escrever)
const QtdIn = ({ valor, onGravar, className, claro, rotulo }) => {
  const v = Number(valor) || 0;
  const seta = `flex-1 flex items-center justify-center text-[10px] leading-none rounded ${claro ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`;
  return (
    <div className="flex items-stretch gap-1 min-w-0">
      <input key={String(valor ?? '')} defaultValue={v || ''} placeholder="0" inputMode="numeric" aria-label={rotulo ? `Quantidade de ${rotulo}` : 'Quantidade'}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur={e => { const x = Math.max(0, parseInt(e.target.value, 10) || 0); if (x !== v) onGravar(x); }}
        className={`${className} flex-1 min-w-0`} />
      <div className="flex flex-col w-5 shrink-0 gap-px">
        <button type="button" tabIndex={-1} onClick={() => onGravar(v + 1)} className={seta} aria-label={rotulo ? `Mais ${rotulo}` : 'Mais um'}>▲</button>
        <button type="button" tabIndex={-1} disabled={v <= 0} onClick={() => onGravar(Math.max(0, v - 1))} className={`${seta} disabled:opacity-30`} aria-label={rotulo ? `Menos ${rotulo}` : 'Menos um'}>▼</button>
      </div>
    </div>
  );
};
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
        {onVerPrecos && <button type="button" onClick={onVerPrecos} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><IcoT n="lapis" className="w-3.5 h-3.5" /> Mudar os preços de {nomeCliente || 'este cliente'} →</button>}
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

// 📎 na lista de tarefas: um anexo abre logo; vários mostram uma lista para escolher
// Ícone "no Drive": a tarefa já foi enviada (abre a pasta com os ficheiros)
// Jogos com spreadsheet (tracker) não usam o Trello: o link vai para a spreadsheet
const usaTrello = j => !!(j && !j.semJogo && j.trello && !j.sheet);
const IcoTrello = ({ s = 12 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><rect x="7" y="7" width="4" height="9" rx="1" fill="currentColor" /><rect x="13" y="7" width="4" height="5" rx="1" fill="currentColor" /></svg>;
// O link da pasta do Drive já foi juntado a este cartão do Trello?
// Todas as versões enviadas para o Drive (V1, V2…) com os links ainda por juntar a este cartão
const versoesDrive = d => (d ? [d, ...(d.anteriores || [])] : []).filter(x => x && x.url && (x.enviados || []).length);
const porPartilhar = (t, cartao) => versoesDrive(t.drive).filter(d => !(d.trello && d.trello.ok && d.trello.cartao === cartao));
// Cartão a que os links do Drive desta tarefa foram juntados (para voltar a ligar se a ligação se perdeu)
const cartaoLembrado = t => (t.trello || t.trelloSolto ? null : (versoesDrive(t.drive).map(d => d.trello && d.trello.ok && d.trello.cartao).find(Boolean) || null));
const linkNoTrello = t => !!(t.trello && t.trello.id && versoesDrive(t.drive).length && !porPartilhar(t, t.trello.id).length);
// Junta ao cartão o link de cada versão que ainda lá não está (como anexo); devolve o Drive já marcado
const partilharNoTrello = async (t, cartao) => {
  const pend = porPartilhar(t, cartao).sort((a, b) => versaoDaPasta(a) - versaoDaPasta(b));
  const feitos = new Set(); let erro = null;
  for (const d of pend) {
    const nome = d.nomeBase || d.pasta || 'Drive';
    try {
      // Só como anexo (fica em "Anexos" e aparece na atividade) — comentário + anexo parecia repetido
      await chamarTrello('anexar', { cartao, url: d.url, nome });
      feitos.add(d.pastaId || d.pasta);
    } catch (e) { erro = String(e.message || e); break; }
  }
  const em = new Date().toISOString();
  const marca = d => (feitos.has(d.pastaId || d.pasta) ? { ...d, trello: { ok: true, em, cartao } } : d);
  const drive = t.drive ? { ...marca(t.drive), ...(t.drive.anteriores ? { anteriores: t.drive.anteriores.map(marca) } : {}) } : t.drive;
  return { drive, n: feitos.size, erro };
};
// Já está no Trello: ícone azul (abre o cartão); com o visto verde quando o link do Drive já lá está
const LinkTrello = ({ t, claro }) => {
  if (!(t.trello && t.trello.url)) return null;
  const partilhado = linkNoTrello(t);
  const lista = listaDoCartao(t.trello.id);
  const corL = corListaTrello(lista);
  return (
    <a href={t.trello.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} aria-label="Abrir o cartão do Trello"
      title={`${lista ? `Trello: lista "${lista}"` : 'No Trello'}${partilhado ? ' · já com o link do Drive' : ' · ainda sem o link do Drive'}\n${t.trello.nome || ''}`}
      className={`shrink-0 relative inline-flex items-center px-1 h-5 rounded-md ${corL === 'review' ? 'text-amber-500' : corL === 'ok' ? 'text-emerald-500' : 'text-sky-500'} ${claro ? 'hover:bg-sky-50' : 'hover:bg-sky-500/10'}`}>
      <IcoTrello />
      {partilhado && <span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 inline-flex items-center justify-center ring-2 ${claro ? 'ring-white' : 'ring-slate-900'}`}><svg width="6" height="6" viewBox="0 0 10 10" aria-hidden="true"><path d="m2 5.2 2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
    </a>
  );
};
// Atalho na lista: tarefa de um jogo com quadro do Trello mas ainda sem cartão → ícone cinzento para enviar
const BotaoTrello = ({ t, mudar, claro, alinhar = 'esq' }) => {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');
  const [parecidos, setParecidos] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = e => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  if (t.trello && t.trello.url) return <LinkTrello t={t} claro={claro} />;
  const trab = TRAB_ATUAL.trab;
  const jogo = trab ? jogoDaTarefa(trab, t) : null;
  if (!usaTrello(jogo)) return null;
  const ligar = c => {
    mudar(tr => opTarefa(tr, t.id, x => ({ ...x, trello: { id: c.id, url: c.url, nome: c.nome }, trelloSolto: false })));
    // A tarefa já tinha versões no Drive: junta logo esses links ao cartão
    if (porPartilhar(t, c.id).length) partilharNoTrello(t, c.id).then(r => { if (r.n) mudar(tr => opTarefa(tr, t.id, x => ({ ...x, drive: r.drive }))); });
  };
  const abrir = async () => {
    setAberto(true); setMsg(''); setParecidos(null);
    try { const cs = await cartoesTrello(jogo.trello); setParecidos(parecidosTrello(cs, t.nome)); }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
  };
  const criar = async () => {
    setOcupado(true); setMsg('');
    try { const r = await criarCartaoTrello(jogo, nomeCartaoTarefa(jogo, t)); ligar(r); setAberto(false); }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
    setOcupado(false);
  };
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button type="button" onClick={e => { e.stopPropagation(); if (aberto) setAberto(false); else abrir(); }} title="Ainda não está no Trello — carregar para enviar" aria-label="Enviar para o Trello"
        className={`inline-flex items-center px-1 h-5 rounded-md ${aberto ? 'text-sky-500' : claro ? 'text-slate-300 hover:text-sky-500' : 'text-slate-600 hover:text-sky-400'} ${claro ? 'hover:bg-sky-50' : 'hover:bg-sky-500/10'}`}>
        <IcoTrello />
      </button>
      {aberto && (
        <span onClick={e => e.stopPropagation()} className={`absolute z-40 top-full mt-1 ${alinhar === 'dir' ? 'right-0' : 'left-0'} w-72 rounded-xl border shadow-xl p-3 space-y-2 text-left text-xs font-normal ${claro ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
          <span className="block text-[13px] font-medium">Enviar para o Trello</span>
          <span className={`block ${sub}`}>{jogo.trelloNome || 'Quadro do jogo'}{jogo.trelloLista ? <> · lista <b>{jogo.trelloLista.nome}</b></> : ''}</span>
          {jogo.trelloLista && <span className={`block px-2 py-1 rounded-md break-words ${claro ? 'bg-slate-100' : 'bg-white/5'}`} title="Nome do cartão">{nomeCartaoTarefa(jogo, t)}</span>}
          {jogo.trelloLista
            ? <button type="button" disabled={ocupado} onClick={criar} className="w-full px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">{ocupado ? 'A criar…' : '+ Criar cartão'}</button>
            : <span className="block text-amber-500">Escolhe primeiro a lista dos cartões novos no jogo (cliente → Jogos).</span>}
          {parecidos == null && !msg && <span className={`block ${sub}`}>A procurar cartões parecidos…</span>}
          {parecidos && parecidos.length > 0 && (
            <span className="block">
              <span className={`block mb-1 ${sub}`}>Ou liga a um que já existe:</span>
              <span className={`block rounded-lg border divide-y ${claro ? 'border-slate-200 divide-slate-200' : 'border-slate-700 divide-slate-700/60'}`}>
                {parecidos.map(c => (
                  <span key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate hover:text-blue-400" title={c.nome}>{c.nome}</a>
                    <button type="button" onClick={() => { ligar(c); setAberto(false); }} className="shrink-0 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">Ligar</button>
                  </span>
                ))}
              </span>
            </span>
          )}
          {msg && <span className="block text-red-400">{msg}</span>}
        </span>
      )}
    </span>
  );
};
const IcoFolha = ({ s = 12 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 9v12" /></svg>;
// Spreadsheet do jogo: verde com visto quando o nome já lá foi posto (abre nessa linha); cinzento quando ainda não
const LinkFolha = ({ t, claro }) => {
  const trab = TRAB_ATUAL.trab;
  const jogo = trab ? jogoDaTarefa(trab, t) : null;
  if (!jogo || jogo.semJogo || !jogo.sheet) return null;
  const folha = versoesDrive(t.drive).map(d => d.folha).find(f => f && f.ok) || (t.drive && t.drive.folha);
  const ok = !!(folha && folha.ok);
  const id = (/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(jogo.sheet)) || [])[1];
  const url = ok && id && folha.gid != null ? `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${folha.gid}&range=A${folha.linha}` : jogo.sheet;
  return (
    <a href={urlAbrir(url, t.cid)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} aria-label="Abrir a spreadsheet"
      title={ok ? `Já está na spreadsheet${folha.tab ? ` (${folha.tab}, linha ${folha.linha})` : ''}` : t.estado === 'feito' ? 'Abrir a spreadsheet do jogo (a app não registou esta tarefa lá)' : 'Ainda não está na spreadsheet — abrir a spreadsheet do jogo'}
      className={`shrink-0 relative inline-flex items-center px-1 h-5 rounded-md ${ok ? 'text-emerald-500' : claro ? 'text-slate-300 hover:text-emerald-600' : 'text-slate-600 hover:text-emerald-400'} ${claro ? 'hover:bg-emerald-50' : 'hover:bg-emerald-500/10'}`}>
      <IcoFolha />
      {ok && <span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 inline-flex items-center justify-center ring-2 ${claro ? 'ring-white' : 'ring-slate-900'}`}><svg width="6" height="6" viewBox="0 0 10 10" aria-hidden="true"><path d="m2 5.2 2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
    </a>
  );
};
const LinkDrive = ({ t, claro }) => {
  const d = t.drive;
  if (!d || !d.url) return null;
  const n = (d.enviados || []).length;
  return (
    <a href={urlAbrir(d.url, t.cid)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className={`shrink-0 inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[11px] font-medium text-emerald-500 ${claro ? 'hover:bg-emerald-50' : 'hover:bg-emerald-500/10'}`}
      title={`No Drive${n ? `: ${(d.enviados || []).map(x => x.nome).join(', ')}` : ''} — abrir a pasta ${d.pasta || ''}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3h8l6 10-4 7H6l-4-7z" /><path d="M8 3l8 17M16 3L6 20M2 13h20" opacity=".55" /></svg>
      {n ? n : ''}
    </a>
  );
};
const ClipAnexos = ({ anexos, claro, sub, cid }) => {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const abrir = a => abrirLink(a.url, cid);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" onClick={e => { e.stopPropagation(); if (anexos.length === 1) abrir(anexos[0]); else setAberto(!aberto); }}
        className={`inline-flex items-center gap-0.5 px-1 rounded text-[11px] ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`}
        title={anexos.length === 1 ? `Abrir ${anexos[0].nome}` : `${anexos.length} anexos`}>
        <IcoA n="clip" className="w-3.5 h-3.5" />{anexos.length}
      </button>
      {aberto && (
        <span className={`absolute z-30 top-full left-0 mt-1 w-64 rounded-xl border shadow-xl py-1 ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
          {anexos.map(a => (
            <button key={a.id} type="button" onClick={e => { e.stopPropagation(); setAberto(false); abrir(a); }} className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              <IcoA n={tipoAnexo(a) === 'imagem' ? 'ficheiro' : tipoAnexo(a)} className={`w-4 h-4 ${tipoAnexo(a) === 'pdf' ? 'text-red-400' : tipoAnexo(a) === 'link' ? 'text-blue-400' : sub}`} />
              <span className="truncate">{a.nome}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
};
// ── Anexos de uma tarefa (brief, referências): ficheiros no Firebase Storage + links ──
const tamanhoTxt = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const tipoAnexo = a => {
  if (a.tipo === 'link') return 'link';
  const m = String(a.mime || ''), n = String(a.nome || '').toLowerCase();
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(n)) return 'imagem';
  if (m.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/.test(n)) return 'video';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  return 'ficheiro';
};
const nomeDoLink = url => {
  try {
    const u = new URL(url);
    if (/docs\.google\.com\/presentation/.test(url)) return 'Google Slides';
    if (/docs\.google\.com\/document/.test(url)) return 'Google Docs';
    if (/docs\.google\.com\/spreadsheets/.test(url)) return 'Google Sheets';
    if (/drive\.google\.com/.test(url)) return 'Google Drive';
    if (/figma\.com/.test(url)) return 'Figma';
    if (/frame\.io/.test(url)) return 'Frame.io';
    return u.hostname.replace(/^www\./, '');
  } catch (e) { return url; }
};
const ICONE_ANEXO = {
  pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zm0 3v2"/>',
  ficheiro: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  clip: '<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>',
};
const IcoA = ({ n, className = 'w-5 h-5' }) => <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONE_ANEXO[n] || ICONE_ANEXO.ficheiro }} />;
const MAX_ANEXO = 100 * 1048576;
// Pré-visualização: Google Slides/Docs/Sheets/Drive, Figma, YouTube, Vimeo, PDF e vídeos
const googleId = url => { const m = /\/d\/([a-zA-Z0-9_-]{15,})/.exec(url) || /[?&]id=([a-zA-Z0-9_-]{15,})/.exec(url); return m ? m[1] : null; };
const ehGoogle = url => /(docs|drive)\.google\.com/.test(url || '');
// Google Slides: o link pode apontar para um slide (…#slide=id.XXXX) — a pré-visualização mostra esse slide
const slideDoLink = url => { const m = /[#&?]slide=id\.([\w-]+)/.exec(url || ''); return m ? m[1] : null; };
// Conta Google com que os links do Google abrem (?authuser=…). O browser tem de ter essa conta com sessão iniciada.
// Preenchido pelo Trabalho em cada render: conta geral + conta própria de cada cliente.
const CONTA_LINKS = { padrao: '', porCliente: {} };
// Freelancers (preenchido pelo Trabalho em cada render) — para mostrar e mudar "quem faz" nas listas
const FREE = { lista: [] };
const NAV_FREE = { abrir: null };
const APAGAR = { pedir: null }; // pedir para apagar uma tarefa (abre a caixa de confirmação do Trabalho)
const ConfirmarApagar = ({ t, claro, onSim, onNao }) => {
  useEffect(() => { const k = e => { if (e.key === 'Escape') { e.stopPropagation(); onNao(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const comAnexos = (t.anexos || []).some(a => a.caminho);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-backdropIn" style={{ background: claro ? 'rgba(15,23,42,.3)' : 'rgba(0,0,0,.55)' }} onMouseDown={e => { if (e.target === e.currentTarget) onNao(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="apagar-titulo" className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl animate-modalIn ${claro ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
        <p id="apagar-titulo" className="text-base font-semibold">Apagar esta tarefa?</p>
        <p className={`mt-1.5 text-sm break-words ${claro ? 'text-slate-600' : 'text-slate-300'}`}>“{t.nome}”</p>
        <p className={`mt-2 text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>Não dá para desfazer.{comAnexos ? ' Os anexos dela também são apagados.' : ''} Não mexe em nada no Drive nem no Trello.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onNao} className={`px-3 py-1.5 text-sm rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/5'}`}>Cancelar</button>
          <button type="button" onClick={onSim} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white">Apagar</button>
        </div>
      </div>
    </div>
  );
}; // abrir a página de um freelancer (preenchido pelo Trabalho)
const tarefasDoFreelancer = (trab, f) => (trab.tarefas || []).filter(t => t.freelancerId === f.id || (!t.freelancerId && t.outsourcing && normJ(t.outsourcing) === normJ(f.nome)));
const FREE_CORES = ['#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#6366f1', '#84cc16', '#0ea5e9', '#d946ef'];
const corFreelancer = f => { if (!f) return '#94a3b8'; if (f.cor) return f.cor; const i = FREE.lista.findIndex(x => x.id === f.id); return FREE_CORES[(i < 0 ? 0 : i) % FREE_CORES.length]; };
// Pôr a tarefa a ser feita por um freelancer (ou por ti): o custo vem da tabela de preços dele, se houver
const opAtribuir = (trab, tid, fid) => ({ ...trab, tarefas: (trab.tarefas || []).map(t => {
  if (t.id !== tid) return t;
  const f = (trab.freelancers || []).find(x => x.id === fid);
  if (!f) return { ...t, freelancerId: null, outsourcing: '', custoOutsourcing: null };
  const c = custoFreelancer(f, t);
  return { ...t, freelancerId: f.id, outsourcing: f.nome, ...(c != null ? { custoOutsourcing: c } : {}) };
}) });
// "Quem faz": etiqueta com a cor da pessoa; na tabela dá para mudar ali mesmo
const QuemFaz = ({ t, mudar, claro, editavel = true, className = '' }) => {
  const f = FREE.lista.find(x => x.id === t.freelancerId);
  const nome = f ? f.nome : (t.outsourcing || '');
  const cor = f ? corFreelancer(f) : '#94a3b8';
  const chipCls = 'inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-full text-[11px] font-semibold truncate';
  const chipIn = <><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} /><span className="truncate">{nome}</span></>;
  // Com freelancer: carregar no nome abre a página dela (todas as tarefas numa vista)
  const chip = nome
    ? (f && NAV_FREE.abrir
      ? <button type="button" onClick={e => { e.stopPropagation(); NAV_FREE.abrir(f.id); }} className={`${chipCls} hover:brightness-125 hover:underline underline-offset-2`} style={{ background: `${cor}26`, color: cor }} title={`Ver todas as tarefas de ${nome}`}>{chipIn}</button>
      : <span className={chipCls} style={{ background: `${cor}26`, color: cor }}>{chipIn}</span>)
    : <span className={`text-[12px] px-1.5 ${claro ? 'text-slate-400' : 'text-slate-500'}`}>Eu</span>;
  if (!editavel || !mudar || !FREE.lista.length) return <span className={`inline-flex min-w-0 ${className}`} title={nome ? `Feita por ${nome}` : 'Feita por ti'}>{chip}</span>;
  const escolher = (
    <select value={t.freelancerId || ''} onChange={e => mudar(tr => opAtribuir(tr, t.id, e.target.value || null))} aria-label="Quem faz" className="absolute inset-0 w-full opacity-0 cursor-pointer">
      <option value="">Eu (ninguém)</option>
      {FREE.lista.filter(x => x.estado !== 'antigo' || x.id === t.freelancerId).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
    </select>
  );
  if (f && NAV_FREE.abrir) {
    return (
      <span className={`group/qf inline-flex items-center gap-0.5 min-w-0 max-w-full ${className}`}>
        <span className="min-w-0 inline-flex">{chip}</span>
        <span className={`relative shrink-0 w-0 overflow-hidden group-hover/qf:w-5 focus-within:w-5 h-5 inline-flex items-center justify-center rounded-md ${claro ? 'text-slate-400 hover:bg-slate-200/70' : 'text-slate-500 hover:bg-white/10'}`} title="Mudar quem faz">
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {escolher}
        </span>
      </span>
    );
  }
  return (
    <span className={`relative inline-flex min-w-0 max-w-full rounded-md ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'} ${className}`} title={nome ? `Feita por ${nome} (mudar)` : 'Feita por ti (mudar)'}>
      {chip}
      {escolher}
    </span>
  );
};
// Reserva para impostos (%) das Definições — para mostrar a margem depois de impostos nas tarefas subcontratadas
const RESERVA = { taxa: null };
const TRAB_ATUAL = { trab: null, cu: null }; // para os botões do Trello nas linhas saberem o jogo da tarefa
const contaDe = cid => String((cid != null && CONTA_LINKS.porCliente[String(cid)]) || CONTA_LINKS.padrao || '').trim();
const comConta = (url, cid) => {
  const conta = contaDe(cid);
  if (!conta || !/^https?:\/\/(docs|drive|sheets|slides|forms)\.google\.com\//i.test(url || '')) return url;
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/u\/\d+(?=\/)/, '');
    u.searchParams.set('authuser', conta);
    return u.toString();
  } catch (e) { return url; }
};
// Para abrir (não para pré-visualizar): passa pela escolha de conta do Google com o email certo.
// Se essa conta ainda não tiver sessão neste browser, o Google pede para entrar com ela e depois segue para o ficheiro.
const urlAbrir = (url, cid) => {
  const conta = contaDe(cid);
  const u = comConta(url, cid);
  if (!conta || u === url) return u;
  return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(conta)}&continue=${encodeURIComponent(u)}`;
};
const abrirLink = (url, cid) => { try { window.open(urlAbrir(url, cid), '_blank', 'noopener,noreferrer'); } catch (e) { /* bloqueado */ } };
const urlPrevia = (a, cid) => {
  const u = a.url || '';
  const tp = tipoAnexo(a);
  if (tp === 'pdf' || tp === 'video') return u;
  if (tp !== 'link') return null;
  if (ehGoogle(u)) {
    const id = googleId(u); if (!id) return null;
    if (/presentation/.test(u)) { const sl = slideDoLink(u); return comConta(`https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false${sl ? `&slide=id.${sl}` : ''}`, cid); }
    if (/document/.test(u)) return comConta(`https://docs.google.com/document/d/${id}/preview`, cid);
    if (/spreadsheets/.test(u)) return comConta(`https://docs.google.com/spreadsheets/d/${id}/preview`, cid);
    return comConta(`https://drive.google.com/file/d/${id}/preview`, cid);
  }
  if (/figma\.com\/(file|design|proto|board)/.test(u)) return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(u)}`;
  let m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/.exec(u); if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = /vimeo\.com\/(\d+)/.exec(u); if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
};
// Miniaturas a tentar, por ordem (se uma falhar, passa à seguinte)
const miniaturas = (a, cid) => {
  const u = a.url || '';
  if (tipoAnexo(a) !== 'link') return [];
  if (ehGoogle(u)) {
    const id = googleId(u); if (!id) return [];
    const geral = comConta(`https://drive.google.com/thumbnail?id=${id}&sz=w640`, cid);
    const sl = /presentation/.test(u) ? slideDoLink(u) : null;
    return sl ? [comConta(`https://docs.google.com/presentation/d/${id}/export/png?id=${id}&pageid=${encodeURIComponent(sl)}`, cid), geral] : [geral];
  }
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/.exec(u); if (m) return [`https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`];
  return [];
};
const MiniLink = ({ a, sub, cid, inteiro }) => {
  const [falhas, setFalhas] = useState(0);
  const lista = miniaturas(a, cid);
  const src = lista[falhas];
  let dominio = ''; try { dominio = new URL(a.url).hostname; } catch (e) { /* url estranho */ }
  if (src) return <img key={src} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhas(n => n + 1)} className={`w-full h-full ${inteiro ? 'object-contain bg-black/30' : 'object-cover object-top bg-white'}`} />;
  return (
    <span className="flex flex-col items-center justify-center gap-1.5 w-full h-full text-blue-400">
      {dominio ? <img src={`https://www.google.com/s2/favicons?domain=${dominio}&sz=64`} alt="" className="w-8 h-8 rounded" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <IcoA n="link" className="w-8 h-8" />}
      <span className={`text-[10px] uppercase tracking-wide opacity-80 ${sub}`}>{nomeDoLink(a.url)}</span>
    </span>
  );
};
const AnexosTarefa = ({ t, trab, mudar, onEnviar, onApagarFicheiro, claro, sub, caixa, inputClass, showToast }) => {
  const anexos = t.anexos || [];
  const [envios, setEnvios] = useState([]); // { id, nome, p }
  const [arrastar, setArrastar] = useState(false);
  const [link, setLink] = useState(null);
  const [verImagem, setVerImagem] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [editConta, setEditConta] = useState(false);
  const temGoogle = anexos.some(a => tipoAnexo(a) === 'link' && ehGoogle(a.url));
  const contaUsada = contaDe(t.cid);
  const contaDoCliente = t.cid != null && !!CONTA_LINKS.porCliente[String(t.cid)];
  useEffect(() => {
    if (!previa && !verImagem) return undefined;
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setPrevia(null); setVerImagem(null); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [previa, verImagem]);
  const inRef = useRef(null);
  const juntar = a => mudar(tr => opTarefa(tr, t.id, x => ({ ...x, anexos: [...(x.anexos || []), a] })));
  const enviar = lista => {
    const fs = Array.from(lista || []);
    if (!fs.length) return;
    if (!onEnviar) { if (showToast) showToast('Os anexos ainda não estão disponíveis aqui.', 'error'); return; }
    fs.forEach(f => {
      if (f.size > MAX_ANEXO) { if (showToast) showToast(`"${f.name}" tem mais de 100 MB. Põe-no no Drive e junta o link.`, 'error'); return; }
      const id = trabId() + 'a';
      const nome = f.name || `colado-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      setEnvios(v => [...v, { id, nome, p: 0 }]);
      onEnviar(`trabalho/${t.id}/${id}-${nome.replace(/[^\w.\-]+/g, '_')}`, f, p => setEnvios(v => v.map(x => (x.id === id ? { ...x, p } : x))))
        .then(r => { juntar({ id, tipo: 'ficheiro', nome, mime: f.type || '', tamanho: f.size, url: r.url, caminho: r.caminho, criado: agoraIso() }); })
        .catch(e => {
          console.error('Anexo:', e);
          const semPermissao = /unauthorized|permission|storage\/unknown|retry-limit|bucket/i.test(String(e && (e.code || e.message)));
          if (showToast) showToast(semPermissao ? 'Não consegui guardar o anexo: falta ligar o Storage na Firebase (vê as instruções que te dei).' : `Não consegui enviar "${nome}".`, 'error');
        })
        .finally(() => setEnvios(v => v.filter(x => x.id !== id)));
    });
  };
  const apagar = async a => {
    if (!await confirmar(`Tirar "${a.nome}" desta tarefa?`)) return;
    mudar(tr => opTarefa(tr, t.id, x => ({ ...x, anexos: (x.anexos || []).filter(y => y.id !== a.id) })));
    // Só apaga o ficheiro se nenhuma outra tarefa (ex.: uma cópia) o usar
    const usado = (trab.tarefas || []).some(o => o.id !== t.id && (o.anexos || []).some(y => y.caminho && y.caminho === a.caminho));
    if (a.caminho && !usado && onApagarFicheiro) onApagarFicheiro(a.caminho);
  };
  // Sem anexos, o campo do link já aparece aberto (95% dos briefs são links)
  const campoLink = link || (!anexos.length ? { url: '', nome: '' } : null);
  const setCampo = patch => setLink({ ...(link || { url: '', nome: '' }), ...patch });
  const gravarLink = () => {
    const url = (link && link.url || '').trim();
    if (!url) { setLink(null); return; }
    const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    juntar({ id: trabId() + 'l', tipo: 'link', nome: (link.nome || '').trim() || nomeDoLink(u), url: u, criado: agoraIso() });
    setLink(null);
  };
  useEffect(() => {
    // Colar uma imagem (Ctrl+V) enquanto a tarefa está aberta
    const colar = e => {
      const fs = Array.from((e.clipboardData && e.clipboardData.files) || []);
      const alvo = e.target && e.target.tagName;
      if (alvo === 'INPUT' || alvo === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (fs.length) { e.preventDefault(); enviar(fs); return; }
      // Colar um link (ou vários) do brief: fica logo junto à tarefa
      const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
      const urls = [...new Set(txt.match(/https?:\/\/[^\s<>"']+/g) || [])];
      if (!urls.length) return;
      e.preventDefault();
      urls.forEach((u, i) => juntar({ id: trabId() + 'l' + i, tipo: 'link', nome: nomeDoLink(u), url: u, criado: agoraIso() }));
    };
    document.addEventListener('paste', colar);
    return () => document.removeEventListener('paste', colar);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const cartao = `group relative rounded-lg border overflow-hidden ${claro ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/50'}`;
  return (
    <div className={`${caixa} space-y-2.5 transition-colors ${arrastar ? (claro ? 'ring-2 ring-blue-400 bg-blue-50' : 'ring-2 ring-blue-500 bg-blue-500/10') : ''}`}
      onDragOver={e => { if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); setArrastar(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastar(false); }}
      onDrop={e => { e.preventDefault(); setArrastar(false); if (e.dataTransfer.files && e.dataTransfer.files.length) { enviar(e.dataTransfer.files); return; } const u = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text') || '').split(/\s+/).find(x => /^https?:\/\//.test(x)); if (u) juntar({ id: trabId() + 'l', tipo: 'link', nome: nomeDoLink(u), url: u, criado: agoraIso() }); }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold flex items-center gap-1.5"><IcoA n="clip" className="w-4 h-4" /> Brief e anexos {anexos.length > 0 && <span className={`text-xs font-normal ${sub}`}>{anexos.length}</span>}</p>
        <div className="flex items-center gap-1.5">
          {temGoogle && !editConta && <button type="button" onClick={() => setEditConta(true)} title={`Os links do Google abrem com a conta ${contaUsada || 'principal do browser'} — carrega para mudar`} aria-label="Conta Google dos links"
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${claro ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/10'}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></button>}
          {anexos.length > 0 && <button type="button" onClick={() => setLink({ url: '', nome: '', foco: true })} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">+ Link</button>}
          <button type="button" onClick={() => inRef.current && inRef.current.click()} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Carregar ficheiro</button>
          <input ref={inRef} type="file" multiple className="hidden" onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
        </div>
      </div>
      {campoLink && (
        <div className="grid grid-cols-[minmax(0,1fr)_140px_auto] gap-2">
          <input autoFocus={!!campoLink.foco} value={campoLink.url} aria-label="Link do brief" onChange={e => setCampo({ url: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') gravarLink(); if (e.key === 'Escape' && link) { e.stopPropagation(); setLink(null); } }}
            onBlur={e => { if (/^https?:\/\/\S+$/i.test(e.target.value.trim()) && !(e.relatedTarget && e.relatedTarget.dataset && e.relatedTarget.dataset.link)) gravarLink(); }} placeholder="https://docs.google.com/… (brief, Figma, Drive…)" className={`${inputClass} text-sm py-1.5`} />
          <input value={campoLink.nome} data-link="1" onChange={e => setCampo({ nome: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') gravarLink(); }} placeholder="Nome (opcional)" className={`${inputClass} text-sm py-1.5`} />
          <button type="button" data-link="1" onClick={gravarLink} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Juntar</button>
        </div>
      )}
      {temGoogle && (
        editConta ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs ${sub}`}>Abrir os links do Google com a conta</span>
            <input autoFocus type="email" defaultValue={trab.contaGoogle || ''} placeholder="ex.: ivo@estudio.com"
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setEditConta(false); } }}
              onBlur={e => { const v = e.target.value.trim(); mudar(tr => ({ ...tr, contaGoogle: v })); setEditConta(false); }}
              className={`${inputClass} !w-60 text-xs py-1`} />
            <span className={`text-[11px] ${sub}`}>Vazio = a conta principal deste browser</span>
          </div>
        ) : null
      )}
      {(anexos.length > 0 || envios.length > 0) ? (
        <div className="flex flex-wrap justify-center items-start gap-2">
          {anexos.map(a => {
            const tp = tipoAnexo(a);
            // Google Slides: cartão mais largo e no formato do slide (16:9), sem cortar nada
            const slides = tp === 'link' && /docs\.google\.com\/presentation/.test(a.url || '');
            return (
              <div key={a.id} className={`${cartao} ${slides ? 'w-full sm:w-[calc(66.666%-0.25rem)]' : 'w-[calc(50%-0.25rem)] sm:w-[calc(33.333%-0.34rem)]'}`}>
                {tp === 'imagem' ? (
                  <button type="button" onClick={() => setVerImagem(a)} className="block w-full aspect-[4/3] bg-black/20" title={a.nome}><img src={a.url} alt={a.nome} loading="lazy" className="w-full h-full object-cover" /></button>
                ) : tp === 'video' ? (
                  <button type="button" onClick={() => setPrevia(a)} className="block w-full aspect-[4/3] bg-black/40" title={a.nome}><video src={`${a.url}#t=0.5`} preload="metadata" muted className="w-full h-full object-cover pointer-events-none" /></button>
                ) : tp === 'link' && tipoGoogle(a.url) && googleId(a.url) ? (
                  <button type="button" onClick={() => setPrevia(a)} className={`block w-full ${slides ? 'aspect-video' : 'aspect-[4/3]'} overflow-hidden`} title={`Ver ${a.nome} em grande (editar, copiar o texto, descarregar os vídeos)`}><MiniLink a={a} sub={sub} cid={t.cid} inteiro={slides} /></button>
                ) : tp === 'link' ? (
                  <a href={urlAbrir(a.url, t.cid)} target="_blank" rel="noopener noreferrer" className={`block w-full ${slides ? 'aspect-video' : 'aspect-[4/3]'} overflow-hidden`} title={`Abrir ${a.nome}`}><MiniLink a={a} sub={sub} cid={t.cid} inteiro={slides} /></a>
                ) : (
                  <button type="button" onClick={() => (urlPrevia(a, t.cid) ? setPrevia(a) : abrirLink(a.url, t.cid))} className={`flex flex-col items-center justify-center gap-1.5 w-full aspect-[4/3] ${tp === 'pdf' ? 'text-red-400' : sub}`} title={a.nome}>
                    <IcoA n={tp} className="w-8 h-8" />
                    <span className="text-[10px] uppercase tracking-wide opacity-80">{tp === 'pdf' ? 'PDF' : (String(a.nome).split('.').pop() || '').slice(0, 5)}</span>
                  </button>
                )}
                <div className="px-2 py-1.5">
                  <a href={urlAbrir(a.url, t.cid)} target="_blank" rel="noopener noreferrer" className="block text-xs font-medium truncate hover:underline" title={a.nome}>{a.nome}</a>
                  <p className={`text-[10px] ${sub}`}>{a.tamanho ? tamanhoTxt(a.tamanho) : 'link'} · {dataCurta(a.criado)}</p>
                </div>
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <a href={urlAbrir(a.url, t.cid)} target="_blank" rel="noopener noreferrer" className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-black/60 text-white text-xs" title="Abrir noutro separador" aria-label={`Abrir ${a.nome} noutro separador`}>↗</a>
                  <button type="button" onClick={() => apagar(a)} className="w-6 h-6 rounded-md bg-black/60 text-white text-xs" aria-label={`Tirar ${a.nome}`}>✕</button>
                </div>
              </div>
            );
          })}
          {envios.map(x => (
            <div key={x.id} className={`${cartao} w-[calc(50%-0.25rem)] sm:w-[calc(33.333%-0.34rem)] p-2 flex flex-col justify-center gap-1.5 aspect-[4/3]`}>
              <p className="text-xs truncate">{x.nome}</p>
              <div className={`h-1.5 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700'}`}><div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round(x.p * 100)}%` }} /></div>
              <p className={`text-[10px] ${sub}`}>A enviar… {Math.round(x.p * 100)}%</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={`text-[11px] ${sub}`}>Ou arrasta para aqui um PDF, imagens ou vídeos.</p>
      )}
      {previa && tipoAnexo(previa) === 'link' && tipoGoogle(previa.url) && googleId(previa.url) && <PreviaGoogle a={previa} cid={t.cid} tarefa={t} mudar={mudar} onFechar={() => setPrevia(null)} />}
      {previa && !(tipoAnexo(previa) === 'link' && tipoGoogle(previa.url) && googleId(previa.url)) && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col p-2 sm:p-6 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) setPrevia(null); }}>
          <div className="flex items-center gap-2 mb-2 text-white">
            <p className="flex-1 min-w-0 text-sm font-medium truncate">{previa.nome}</p>
            <a href={urlAbrir(previa.url, t.cid)} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs rounded-lg bg-white/15 hover:bg-white/25">Abrir ↗</a>
            <button type="button" onClick={() => setPrevia(null)} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25" aria-label="Fechar">✕</button>
          </div>
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-black">
            {tipoAnexo(previa) === 'video'
              ? <video src={previa.url} controls autoPlay className="w-full h-full object-contain" />
              : <iframe src={urlPrevia(previa, t.cid)} title={previa.nome} className="w-full h-full bg-white" allow="autoplay; fullscreen; clipboard-write" allowFullScreen />}
          </div>
          {ehGoogle(previa.url) && <p className="mt-2 text-[11px] text-white/60">{`Se não aparecer, o ficheiro não está partilhado com ${contaUsada || 'a conta Google principal deste browser'} — ou essa conta não tem sessão iniciada neste browser.`}</p>}
        </div>
      )}
      {verImagem && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 animate-backdropIn" onMouseDown={() => setVerImagem(null)}>
          <img src={verImagem.url} alt={verImagem.nome} className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};
// ── Brief do Google em grande: editar aqui mesmo, copiar o texto e descarregar os vídeos que estão nos slides ──
const tipoGoogle = url => (/docs\.google\.com\/presentation/.test(url || '') ? 'slides' : /docs\.google\.com\/document/.test(url || '') ? 'docs' : /docs\.google\.com\/spreadsheets/.test(url || '') ? 'sheets' : /drive\.google\.com\/(file|open|uc)/.test(url || '') ? 'drive' : null);
const urlEditarGoogle = (url, cid) => {
  const id = googleId(url), tg = tipoGoogle(url);
  if (!id || !tg) return null;
  if (tg === 'drive') return comConta(`https://drive.google.com/file/d/${id}/preview`, cid);
  const sl = tg === 'slides' ? slideDoLink(url) : null;
  const gid = tg === 'sheets' ? (/[#&?]gid=(\d+)/.exec(url) || [])[1] : null;
  return comConta(`https://docs.google.com/${{ slides: 'presentation', docs: 'document', sheets: 'spreadsheets' }[tg]}/d/${id}/edit${gid ? `?gid=${gid}` : ''}`, cid) + (sl ? `#slide=id.${sl}` : gid ? `#gid=${gid}` : '');
};
// Pedido às APIs da Google com a conta dos links do cliente (se o acesso expirou, pede outro e tenta de novo)
// A conta com que a app está mesmo a falar com a Google (pode não ser a que está nos links, se escolheste outra na janela da Google)
const contaRealGoogle = async conta => { try { const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${await tokenDrive(conta)}` } }); const j = await r.json(); return (j.user && j.user.emailAddress) || ''; } catch (e) { return ''; } };
// Links antigos partilhados por link trazem uma "resourcekey" que o Drive pede à parte
const chaveRecurso = url => { const id = googleId(url), m = /[?&]resourcekey=([\w-]+)/i.exec(url || ''); return id && m ? { 'X-Goog-Drive-Resource-Keys': `${id}/${m[1]}` } : {}; };
const pedirGoogle = async (conta, url, comoTexto, cab = {}) => {
  const ir = async forcar => fetch(url, { headers: { Authorization: `Bearer ${await tokenDrive(conta, forcar)}`, ...cab } });
  let r = await ir(false);
  if (r.status === 401) r = await ir(true);
  if (!r.ok) {
    let m = `Erro ${r.status} da Google`, razao = '';
    try {
      const j = await r.json();
      if (j.error) { m = j.error.message || m; razao = ((j.error.errors || [])[0] || {}).reason || ((j.error.details || []).find(d => d.reason) || {}).reason || j.error.status || ''; }
    } catch (e) { /* sem JSON */ }
    const apiDesligada = /SERVICE_DISABLED|accessNotConfigured/i.test(razao) || /has not been used|is disabled/i.test(m);
    let txt = m;
    if (apiDesligada) txt = m;
    else if (/cannotExport|cannotDownload|cannotCopy/i.test(razao) || /cannot be (exported|downloaded)/i.test(m)) txt = 'Quem fez este ficheiro desligou as opções de copiar e descarregar para quem só tem acesso de leitura. Abre-o no Google e pede ao cliente acesso de edição (ou que volte a ligar «Os leitores podem descarregar, imprimir e copiar»).';
    else if (r.status === 403 || r.status === 404) {
      const real = await contaRealGoogle(conta);
      txt = r.status === 404 ? 'Não encontrei este ficheiro com ' : 'Sem acesso a este ficheiro com ';
      txt += real ? `a conta ${real}` : `a conta ${conta || 'Google'}`;
      txt += real && conta && real.toLowerCase() !== conta.toLowerCase() ? ` — mas os links deste cliente abrem com ${conta}. Liga essa conta ao Drive da app (Trabalho › definições do Drive) ou escolhe-a na janela da Google.` : '. Confirma no Google que o ficheiro está partilhado com ela.';
    }
    const er = new Error(txt);
    er.status = r.status; er.razao = razao; er.original = m;
    er.ativar = apiDesligada ? ((/(https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s"]+)/.exec(m) || [])[1] || 'https://console.cloud.google.com/apis/library/slides.googleapis.com') : '';
    er.recente = apiDesligada && /recently|few minutes/i.test(m);
    throw er;
  }
  return comoTexto ? r.text() : r.json();
};
const limparTexto = t => String(t || '').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MIME_GSLIDES = 'application/vnd.google-apps.presentation';
// ── Ler um .pptx no browser (é um zip): texto de cada slide, notas e vídeos que estão lá dentro ──
// Os vídeos de um .pptx vêm "guardados" sem compressão: ficam como pedaços do ficheiro original, sem copiar nada.
const lerZip = async blob => {
  const u16 = (v, o) => v.getUint16(o, true), u32 = (v, o) => v.getUint32(o, true);
  const cauda = Math.min(blob.size, 65557);
  const fim = new DataView(await blob.slice(blob.size - cauda).arrayBuffer());
  let e = -1; for (let i = fim.byteLength - 22; i >= 0; i--) if (u32(fim, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Este ficheiro não parece um PowerPoint (.pptx) válido.');
  const n = u16(fim, e + 10), tamCD = u32(fim, e + 12), iniCD = u32(fim, e + 16);
  const cd = new DataView(await blob.slice(iniCD, iniCD + tamCD).arrayBuffer());
  const dec = new TextDecoder();
  const entradas = {};
  for (let i = 0, o = 0; i < n && o < cd.byteLength; i++) {
    if (u32(cd, o) !== 0x02014b50) break;
    const metodo = u16(cd, o + 10), tamC = u32(cd, o + 20), tamU = u32(cd, o + 24), ln = u16(cd, o + 28), le = u16(cd, o + 30), lc = u16(cd, o + 32), loc = u32(cd, o + 42);
    const nome = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + o + 46, ln));
    entradas[nome] = { metodo, tamC, tamU, loc };
    o += 46 + ln + le + lc;
  }
  const dados = async nome => {
    const x = entradas[nome]; if (!x) return null;
    const h = new DataView(await blob.slice(x.loc, x.loc + 30).arrayBuffer());
    const ini = x.loc + 30 + u16(h, 26) + u16(h, 28);
    const pedaco = blob.slice(ini, ini + x.tamC);
    if (x.metodo === 0) return pedaco;
    if (x.metodo === 8 && typeof DecompressionStream !== 'undefined') return new Response(pedaco.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    throw new Error('Formato de compressão que não sei ler.');
  };
  return { entradas, dados, texto: async nome => { const b = await dados(nome); return b ? b.text() : ''; } };
};
const xmlTexto = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const paragrafosXml = xml => String(xml || '').split(/<\/a:p>/).map(p => (p.match(/<a:t>([^<]*)<\/a:t>|<a:t\/>/g) || []).map(t => xmlTexto(t.replace(/<\/?a:t\/?>/g, ''))).join('')).map(x => x.trim()).filter(Boolean).join('\n');
const relsXml = xml => { const out = {}; (String(xml || '').match(/<Relationship\b[^>]*>/g) || []).forEach(r => { const g = k => (new RegExp(`${k}="([^"]*)"`).exec(r) || [])[1] || ''; out[g('Id')] = { tipo: g('Type'), alvo: g('Target'), externo: g('TargetMode') === 'External' }; }); return out; };
const juntarCaminho = (base, rel) => { const p = String(rel || '').startsWith('/') ? [] : base.split('/').slice(0, -1); rel.split('/').forEach(s => { if (s === '..') p.pop(); else if (s && s !== '.') p.push(s); }); return p.join('/'); };
const lerPptx = async blob => {
  const z = await lerZip(blob);
  const pres = await z.texto('ppt/presentation.xml');
  const relsP = relsXml(await z.texto('ppt/_rels/presentation.xml.rels'));
  let ordem = (pres.match(/<p:sldId\b[^>]*>/g) || []).map(s => (/r:id="([^"]+)"/.exec(s) || [])[1]).map(id => relsP[id] && juntarCaminho('ppt/presentation.xml', relsP[id].alvo)).filter(Boolean);
  if (!ordem.length) ordem = Object.keys(z.entradas).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  const slides = [];
  for (let i = 0; i < ordem.length; i++) {
    const cam = ordem[i];
    const xml = await z.texto(cam);
    const rels = relsXml(await z.texto(cam.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')));
    const videos = [], vistos = new Set(), imagens = [];
    const EXT_VIDEO = /\.(mp4|m4v|mov|webm|avi|wmv|mkv|mpe?g)$/i;
    Object.values(rels).forEach(r => {
      if (/\/image$/.test(r.tipo) && !r.externo) { const a = juntarCaminho(cam, r.alvo); if (a && z.entradas[a] && /\.(png|jpe?g|gif|webp)$/i.test(a) && !imagens.some(x => x.caminho === a)) imagens.push({ caminho: a, nome: a.split('/').pop(), tamanho: z.entradas[a].tamU }); return; }
      // ligações ao Drive / YouTube (o Google guarda assim os vídeos metidos pelo Slides num .pptx)
      const drv = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]{15,})/.exec(r.alvo) || /docs\.google\.com\/[^"]*?[?&]id=([\w-]{15,})/.exec(r.alvo);
      if (drv && !vistos.has(drv[1])) { vistos.add(drv[1]); videos.push({ id: drv[1], fonte: 'DRIVE', ligacao: true }); return; }
      const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(r.alvo);
      if (yt && !vistos.has(yt[1])) { vistos.add(yt[1]); videos.push({ id: yt[1], fonte: 'YOUTUBE' }); return; }
      const alvoInt = !r.externo && juntarCaminho(cam, r.alvo);
      const ehVideo = /\/(video|media)$/.test(r.tipo) || (alvoInt && EXT_VIDEO.test(alvoInt));
      if (!ehVideo) return;
      if (r.externo) { videos.push({ nome: r.alvo.split('/').pop(), externo: r.alvo }); return; }
      const alvo = juntarCaminho(cam, r.alvo);
      if (vistos.has(alvo) || !z.entradas[alvo]) return;
      vistos.add(alvo);
      videos.push({ caminho: alvo, nome: alvo.split('/').pop(), tamanho: z.entradas[alvo].tamU });
    });
    let notas = '';
    const rNotas = Object.values(rels).find(r => /\/notesSlide$/.test(r.tipo));
    if (rNotas) notas = paragrafosXml((await z.texto(juntarCaminho(cam, rNotas.alvo))).replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?type="sldNum"[\s\S]*?<\/p:sp>/g, ''));
    // ligações ao Drive escritas no próprio slide (fora das relações)
    (xml.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)[\w-]{15,}/g) || []).forEach(u => { const id = /([\w-]{15,})$/.exec(u)[1]; if (!vistos.has(id)) { vistos.add(id); videos.push({ id, fonte: 'DRIVE', ligacao: true }); } });
    slides.push({ n: i + 1, texto: paragrafosXml(xml), notas, videos, imagens });
  }
  // imagens do modelo (logótipo, fundos): aparecem em metade dos slides ou mais — não são referências
  const vezes = {}; slides.forEach(s => s.imagens.forEach(x => { vezes[x.caminho] = (vezes[x.caminho] || 0) + 1; }));
  slides.forEach(s => { s.imagens = s.imagens.filter(x => slides.length < 3 || vezes[x.caminho] < slides.length / 2); });
  // vídeos que estão no ficheiro mas não consegui ligar a nenhum slide: aparecem na mesma
  const usados = new Set([].concat(...slides.map(s => s.videos.map(v => v.caminho).filter(Boolean))));
  const soltos = Object.keys(z.entradas).filter(k => /^ppt\/media\//.test(k) && /\.(mp4|m4v|mov|webm|avi|wmv|mkv|mpe?g)$/i.test(k) && !usados.has(k)).map(k => ({ caminho: k, nome: k.split('/').pop(), tamanho: z.entradas[k].tamU, solto: true }));
  const media = Object.keys(z.entradas).filter(k => /^ppt\/media\//.test(k)).map(k => k.split('/').pop());
  return { slides, dados: z.dados, soltos, media };
};
// ── A apresentação/documento do brief, já lido: slides (texto + vídeos) ou só texto ──
const BRIEFS_LIDOS = new Map(); // fica em memória enquanto a app está aberta (o último .pptx não volta a ser descarregado)
const descarregarDrive = async (conta, id, cab, onProg) => {
  const ir = async forcar => fetch(`${DRV}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await tokenDrive(conta, forcar)}`, ...cab } });
  let r = await ir(false);
  if (r.status === 401) r = await ir(true);
  if (!r.ok) {
    let razao = ''; try { const j = await r.json(); razao = ((j.error && j.error.errors) || [])[0] ? j.error.errors[0].reason : ''; } catch (e) { /* sem JSON */ }
    throw new Error(/cannotDownload/i.test(razao) ? 'Quem fez este ficheiro desligou o «descarregar» para quem só tem acesso de leitura — pede ao cliente acesso de edição.' : r.status === 403 || r.status === 404 ? `Sem acesso a este ficheiro com a conta ${conta || 'Google'}.` : `Erro ${r.status} do Drive`);
  }
  const total = Number(r.headers.get('Content-Length')) || 0;
  if (!r.body || !r.body.getReader) return r.blob();
  const leitor = r.body.getReader(); const partes = []; let n = 0;
  for (;;) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); n += value.length; if (onProg) onProg(total ? Math.min(1, n / total) : null, n); }
  return new Blob(partes);
};
// Exporta um ficheiro do Google (ex.: Slides → .pptx) e devolve-o (o Google só exporta até ~10 MB)
const exportarDrive = async (conta, id, mime, cab = {}) => {
  const ir = async forcar => fetch(`${DRV}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mime)}`, { headers: { Authorization: `Bearer ${await tokenDrive(conta, forcar)}`, ...cab } });
  let r = await ir(false);
  if (r.status === 401) r = await ir(true);
  if (!r.ok) { let m = `Erro ${r.status} da Google`; try { const j = await r.json(); if (j.error) m = /exportSizeLimitExceeded|too large/i.test(JSON.stringify(j.error)) ? 'a apresentação é grande demais para exportar' : (j.error.message || m); } catch (e) { /* sem JSON */ } throw new Error(m); }
  return r.blob();
};
const lerBrief = async (conta, url, onProg) => {
  const id = googleId(url), cab = chaveRecurso(url);
  const meta = await pedirGoogle(conta, `${DRV}/${encodeURIComponent(id)}?fields=name,mimeType,size,modifiedTime&supportsAllDrives=true`, false, cab);
  const chave = `${id}|${meta.modifiedTime}`;
  if (BRIEFS_LIDOS.has(chave)) return BRIEFS_LIDOS.get(chave);
  let res;
  if (meta.mimeType === MIME_PPTX || /\.pptx$/i.test(meta.name || '')) {
    const blob = await descarregarDrive(conta, id, cab, onProg);
    const p = await lerPptx(blob);
    const ligados = [].concat(...p.slides.map(s => s.videos.filter(v => v.ligacao)));
    await Promise.all(ligados.map(async v => {
      try { const f = await pedirGoogle(conta, `${DRV}/${encodeURIComponent(v.id)}?fields=name,size,mimeType,thumbnailLink&supportsAllDrives=true`); Object.assign(v, { nome: f.name, tamanho: Number(f.size) || 0, mini: f.thumbnailLink || '', naoVideo: !/^video\//.test(f.mimeType || '') }); }
      catch (e) { v.erro = e.message; }
    }));
    p.slides.forEach(s => { s.videos = s.videos.filter(v => !v.naoVideo); });
    res = { tipo: 'pptx', nome: meta.name, slides: p.slides, dados: p.dados, soltos: p.soltos, media: p.media };
  } else if (meta.mimeType === MIME_GSLIDES) {
    try {
      const j = await pedirGoogle(conta, `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(id)}?fields=${encodeURIComponent('slides(objectId,pageElements,slideProperties(notesPage(pageElements)))')}`, false, cab);
      const daForma = els => { const out = []; const ver = es => (es || []).forEach(e => { if (e.shape && e.shape.text) out.push((e.shape.text.textElements || []).map(x => (x.textRun && x.textRun.content) || '').join('')); if (e.table) (e.table.tableRows || []).forEach(rw => (rw.tableCells || []).forEach(c => c.text && out.push((c.text.textElements || []).map(x => (x.textRun && x.textRun.content) || '').join('')))); if (e.elementGroup) ver(e.elementGroup.children); }); ver(els); return out.map(x => x.trim()).filter(Boolean).join('\n'); };
      const vids = els => { const out = []; const ver = es => (es || []).forEach(e => { if (e.video && e.video.id) out.push({ id: e.video.id, fonte: e.video.source }); if (e.elementGroup) ver(e.elementGroup.children); }); ver(els); return out; };
      const altDe = els => { const out = []; const ver = es => (es || []).forEach(e => { if (e.title) out.push(e.title); if (e.description) out.push(e.description); if (e.elementGroup) ver(e.elementGroup.children); }); ver(els); return out.join('\n'); };
      const nImgs = els => { let k = 0; const ver = es => (es || []).forEach(e => { if (e.image) k++; if (e.elementGroup) ver(e.elementGroup.children); }); ver(els); return k; };
      const slides = (j.slides || []).map((sl, i) => ({ n: i + 1, objectId: sl.objectId, texto: daForma(sl.pageElements), notas: daForma(((sl.slideProperties || {}).notesPage || {}).pageElements), alt: altDe(sl.pageElements), nImagens: nImgs(sl.pageElements), videos: vids(sl.pageElements) }));
      await Promise.all([].concat(...slides.map(s => s.videos)).filter(v => v.fonte === 'DRIVE').map(async v => {
        try { const f = await pedirGoogle(conta, `${DRV}/${encodeURIComponent(v.id)}?fields=name,size,thumbnailLink&supportsAllDrives=true`); Object.assign(v, { nome: f.name, tamanho: Number(f.size) || 0, mini: f.thumbnailLink || '' }); }
        catch (e) { v.erro = e.message; }
      }));
      res = { tipo: 'gslides', nome: meta.name, slides };
    } catch (e) {
      if (!e.ativar) throw e;
      // sem a API do Google Slides: pelo menos o texto (sem separar por slide e sem os vídeos)
      const t = await pedirGoogle(conta, `${DRV}/${encodeURIComponent(id)}/export?mimeType=text%2Fplain`, true, cab);
      res = { tipo: 'texto', nome: meta.name, texto: limparTexto(t), avisoApi: e };
    }
  } else if (/^application\/vnd\.google-apps\.(document|spreadsheet)$/.test(meta.mimeType)) {
    const t = await pedirGoogle(conta, `${DRV}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(/spreadsheet/.test(meta.mimeType) ? 'text/csv' : 'text/plain')}`, true, cab);
    res = { tipo: 'texto', nome: meta.name, texto: limparTexto(t) };
  } else {
    res = { tipo: 'outro', nome: meta.name, texto: '' };
  }
  BRIEFS_LIDOS.clear(); // só guarda o último (um .pptx com vídeos pode ser grande)
  BRIEFS_LIDOS.set(chave, res);
  return res;
};
// O slide desta tarefa: o do link (se apontar para um slide) ou o que tiver no texto as palavras do nome da tarefa
const PALAVRAS_VAZIAS = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'que', 'com', 'para', 'dos', 'das', 'vid', 'video', 'videos', 'ban', 'banner', 'static', 'statics', 'new', 'iteration', 'iteracao', 'variation', 'variacao']);
const palavrasDe = x => semAcentos(x).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^v\d+$/.test(w) && !/^\d+$/.test(w) && !PALAVRAS_VAZIAS.has(w)).filter((w, i, a) => a.indexOf(w) === i);
// Com o conceito preenchido (Nomes dos ficheiros), procura por ele; senão pelo nome da tarefa (sem o " - variação")
const palavrasTarefa = t => { const fx = (t && t.ficheiros) || {}; return fx.conceito ? palavrasDe(fx.conceito) : palavrasDe(String((t && t.nome) || '').split(/\s[-–—]\s/)[0]); };
const slideDaTarefa = (slides, url, t) => {
  if (!slides || !slides.length) return null;
  // 1) escolhido à mão nesta tarefa (no brief, «★ Qual é o slide desta tarefa?»)
  const bs = t && t.briefSlide;
  if (bs && bs.id === googleId(url)) {
    const porId = bs.objectId && slides.find(s => s.objectId === bs.objectId); if (porId) return porId.n;
    if (bs.n && slides[bs.n - 1]) return bs.n;
  }
  // 2) o link aponta para um slide
  const sl = slideDoLink(url);
  if (sl) {
    const porId = slides.find(s => s.objectId === sl); if (porId) return porId.n;
    const m = /^p(\d+)$/.exec(sl); if (m && slides[+m[1] - 1]) return +m[1];
  }
  // 3) o brief só tem um slide
  if (slides.length === 1) return 1;
  // 4) o slide que tem as palavras do nome (no texto, nas notas ou no texto alternativo das imagens)
  const ws = palavrasTarefa(t);
  if (!ws.length) return null;
  let melhor = null, mp = 0;
  slides.forEach(s => {
    const txt = ' ' + semAcentos(`${s.texto || ''} ${s.notas || ''} ${s.alt || ''}`).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const titulo = ' ' + semAcentos(String(s.texto).split('\n').slice(0, 2).join(' ')).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const p = ws.filter(w => txt.includes(` ${w} `)).length / ws.length + ws.filter(w => titulo.includes(` ${w} `)).length / ws.length * 0.5;
    if (p > mp) { mp = p; melhor = s.n; }
  });
  return mp >= 0.6 ? melhor : null;
};
// Guarda um ficheiro do Drive no PC: escolhes a pasta (ex.: Assets\Footage do projeto) e vai direto para lá, sem passar pela memória
const guardarDoDrive = async (conta, f, onProg, destinoDado) => {
  let token = await tokenDrive(conta); // 1.º o acesso (pode abrir a janela da Google), depois a janela de guardar
  let destino = destinoDado || null;
  if (!destino && window.showSaveFilePicker) {
    try { destino = await window.showSaveFilePicker({ id: 'brief-videos', suggestedName: f.nome || 'video.mp4' }); }
    catch (e) { if (e && e.name === 'AbortError') return false; destino = null; }
  }
  const ir = tk => fetch(`${DRV}/${encodeURIComponent(f.id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tk}` } });
  let r = await ir(token);
  if (r.status === 401) { token = await tokenDrive(conta, true); r = await ir(token); }
  if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? `A conta ${conta || 'Google'} não tem acesso a este ficheiro.` : `Erro ${r.status} do Drive`);
  const total = Number(r.headers.get('Content-Length')) || f.tamanho || 0;
  let n = 0;
  const contar = new TransformStream({ transform(ch, ctl) { n += ch.length; if (onProg && total) onProg(Math.min(1, n / total)); ctl.enqueue(ch); } });
  if (destino) { await r.body.pipeThrough(contar).pipeTo(await destino.createWritable()); return true; }
  const blob = await new Response(r.body.pipeThrough(contar)).blob();
  guardarBlobComo(blob, f.nome || 'video.mp4');
  return true;
};
const guardarBlobComo = (blob, nome) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); };
// Um vídeo que já está em memória (de dentro de um .pptx): escolhes a pasta e fica lá
const guardarBlob = async (blob, nome) => {
  if (window.showSaveFilePicker) {
    let destino = null;
    try { destino = await window.showSaveFilePicker({ id: 'brief-videos', suggestedName: nome }); }
    catch (e) { if (e && e.name === 'AbortError') return false; }
    if (destino) { const w = await destino.createWritable(); await w.write(blob); await w.close(); return true; }
  }
  guardarBlobComo(blob, nome);
  return true;
};
// ── A pasta Assets\Refs do projeto desta tarefa (pela pasta dos projetos que escolheste para os exports) ──
const nomeLivre = async (dir, nome) => {
  const m = /^(.*?)(\.[^.]+)?$/.exec(nome);
  for (let i = 1; i < 200; i++) { const n = i === 1 ? nome : `${m[1]}_${i}${m[2] || ''}`; try { await dir.getFileHandle(n); } catch (e) { return n; } }
  return `${Date.now()}_${nome}`;
};
const pastaDoProjetoDaTarefa = async (tarefa, pedir) => {
  if (!tarefa || typeof window === 'undefined' || !window.showDirectoryPicker) return null;
  const raiz = await idbLer('raiz-projetos');
  if (!raiz || !(await permissaoLer(raiz, pedir))) return null;
  const nf = nomesFicheiros(TRAB_ATUAL.trab, tarefa);
  if (!nf || !nf.conceito) return null;
  const kc = `proj:${nf.jogo ? nf.jogo.id : ''}:${slugF(nf.conceito)}`;
  let alvo = await idbLer(kc);
  if (alvo && alvo.dir) { try { const it = alvo.dir.entries(); await it.next(); } catch (e) { alvo = null; } } // mudou de nome/sítio
  if (!alvo || !alvo.dir) {
    const cli = (TRAB_ATUAL.clientes || []).find(c => String(c.id) === String(tarefa.cid));
    const a = await acharExportsConceito(raiz, { conceito: nf.conceito, jogo: nf.jogo ? nf.jogo.nome : '', cliente: cli ? cli.nome : '' });
    if (!a || !a.proj) return null;
    alvo = { dir: a.proj, projeto: a.projeto };
    await idbGravar(kc, { ...alvo, em: Date.now() });
  }
  let assets = null; try { assets = await alvo.dir.getDirectoryHandle('Assets'); } catch (e) { /* sem Assets */ }
  if (!assets) return { projeto: alvo.projeto || alvo.dir.name, proj: alvo.dir, refs: null };
  const refs = await assets.getDirectoryHandle('Refs', { create: true }); // as referências do brief (vídeos e imagens) ficam à parte da Footage
  return { projeto: alvo.projeto || alvo.dir.name, proj: alvo.dir, refs };
};
// Textos do slide prontos para o After: as falas do guião (QUEM: "…") e os outros textos entre aspas (cartões, end card, hooks)
const textosParaAE = texto => {
  const falas = [], ecra = [], visto = new Set();
  String(texto || '').split('\n').forEach(linha => {
    const l = linha.trim(); if (!l) return;
    const f = /^([A-Z][A-Za-z0-9 .'’()&/-]{0,30}):\s*["“”](.+?)["“”]\s*$/.exec(l);
    if (f && f[1] === f[1].toUpperCase()) { falas.push({ quem: f[1].trim(), txt: f[2].trim() }); return; }
    const re = /["“]([^"“”]{2,160})["”]/g; let m;
    while ((m = re.exec(l))) { const t = m[1].trim(); const k = t.toLowerCase(); if (t && !visto.has(k)) { visto.add(k); ecra.push(t); } }
  });
  const naFala = t => falas.some(x => x.txt.toLowerCase().includes(t.toLowerCase())); // "cold open on «…»" repete uma fala
  return { falas, ecra: ecra.filter(t => !naFala(t)) };
};
const BlocoTextosAE = ({ slide, copiar, copiado }) => {
  const { falas, ecra } = textosParaAE(slide.texto);
  if (!falas.length && !ecra.length) return null;
  const linha = (txt, k) => (
    <li key={k} className="group flex items-start gap-2 py-1">
      <span className="flex-1 min-w-0 select-text">{txt}</span>
      <button type="button" onClick={() => copiar(txt, k)} className="shrink-0 text-[11px] text-blue-300 hover:underline opacity-70 group-hover:opacity-100">{copiado === k ? '✓' : 'Copiar'}</button>
    </li>
  );
  return (
    <div className="rounded-xl p-3 sm:p-4 bg-blue-500/10 ring-1 ring-blue-400/40 space-y-3">
      <p className="text-[11px] uppercase tracking-wide text-blue-200 font-semibold">Para o After — textos do slide {slide.n}</p>
      {ecra.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">Textos no ecrã <span className="text-white/50 font-normal">(cartões, end card, hooks)</span></p><button type="button" onClick={() => copiar(ecra.join('\n'), 'ae-ecra')} className="text-[11px] text-blue-300 hover:underline">{copiado === 'ae-ecra' ? '✓ Copiados' : `Copiar os ${ecra.length}`}</button></div>
          <ul className="text-sm divide-y divide-white/5">{ecra.map((t, i) => linha(t, `ae-e${i}`))}</ul>
        </div>
      )}
      {falas.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">Falas <span className="text-white/50 font-normal">(para legendas)</span></p><button type="button" onClick={() => copiar(falas.map(x => x.txt).join('\n'), 'ae-falas')} className="text-[11px] text-blue-300 hover:underline">{copiado === 'ae-falas' ? '✓ Copiadas' : `Copiar as ${falas.length}`}</button></div>
          <ul className="text-sm divide-y divide-white/5">{falas.map((x, i) => (
            <li key={i} className="group flex items-start gap-2 py-1">
              <span className="shrink-0 w-24 truncate text-[11px] text-white/50 pt-0.5">{x.quem}</span>
              <span className="flex-1 min-w-0 select-text">{x.txt}</span>
              <button type="button" onClick={() => copiar(x.txt, `ae-f${i}`)} className="shrink-0 text-[11px] text-blue-300 hover:underline opacity-70 group-hover:opacity-100">{copiado === `ae-f${i}` ? '✓' : 'Copiar'}</button>
            </li>
          ))}</ul>
        </div>
      )}
      <p className="text-[11px] text-white/45">«Copiar os …» copia um por linha — no After, cola numa layer de texto e cada linha fica numa linha.</p>
    </div>
  );
};
// Depois de criar (ou abrir) a pasta do projeto: copia sozinho os assets do slide da tarefa (vídeos e imagens) para Assets\Refs.
// Diz sempre o que aconteceu (antes falhava em silêncio quando faltava a pasta dos projetos ou a ligação à Google).
const BRIEF_A_COPIAR = new Set();
const trazerBriefParaRefs = async (t, showToast) => {
  const aviso = (txt, tipo = 'info') => { if (showToast) showToast(txt, tipo); };
  if (!t || BRIEF_A_COPIAR.has(t.id) || typeof window === 'undefined') return;
  const a = (t.anexos || []).find(x => tipoAnexo(x) === 'link' && googleId(x.url) && (tipoGoogle(x.url) === 'slides' || /\.pptx$/i.test(x.nome || '')));
  if (!a) return; // a tarefa não tem brief em slides: nada a fazer
  if (!window.showDirectoryPicker) { aviso('Os assets do brief só vão sozinhos para a pasta do projeto no Chrome ou no Edge.'); return; }
  const conta = contaDe(t.cid);
  if (!(tokenGuardadoDe(conta) || ligadoSempre(conta || '_'))) { aviso('Para copiar os assets do brief para a pasta Refs, abre o brief nesta tarefa uma vez (liga a conta Google).'); return; }
  BRIEF_A_COPIAR.add(t.id);
  try {
    // A pasta dos projetos (ex.: C:\WORK): se ainda não a escolheste, pede-a já (ainda dentro do clique)
    let raiz = await idbLer('raiz-projetos');
    if (!raiz) {
      aviso('Escolhe a pasta onde estão os teus projetos (ex.: C:\\WORK) — é só desta vez.');
      try { raiz = await window.showDirectoryPicker({ id: 'projetos', mode: 'readwrite' }); await idbGravar('raiz-projetos', raiz); }
      catch (e) { aviso('Sem a pasta dos projetos não consigo copiar os assets do brief. Escolhe-a quando quiseres no painel Enviar para o Drive.', 'error'); return; }
    }
    if (!(await permissaoLer(raiz, true))) { aviso('O browser não deu acesso à pasta dos projetos — os assets do brief não foram copiados.', 'error'); return; }
    let d = null;
    for (let i = 0; i < 24 && !d; i++) { d = await pastaDoProjetoDaTarefa(t, false).catch(() => null); if (!d || !d.refs) { d = null; if (i === 1) aviso('À espera da pasta do projeto para copiar o brief…'); await new Promise(ok => setTimeout(ok, 5000)); } }
    if (!d) { aviso(`Não encontrei a pasta deste projeto (com a pasta Assets) dentro de ${raiz.name} — os assets do brief não foram copiados.`, 'error'); return; }
    const doc = await lerBrief(conta, a.url);
    if (!doc || !doc.slides) { aviso('Não consegui ler os slides do brief.', 'error'); return; }
    const n = slideDaTarefa(doc.slides, a.url, t);
    if (!n) { aviso(`O brief tem ${doc.slides.length} slides e não sei qual é o desta tarefa. Abre o brief na tarefa e escolhe-o em «★ Qual é o slide desta tarefa?» — os assets vão logo para a Refs.`, 'info'); return; }
    const sl = doc.slides[n - 1];
    const vids = (sl.videos || []).filter(v => v.caminho || (v.fonte === 'DRIVE' && !v.erro && v.id));
    let imgs = (sl.imagens || []).filter(x => x.caminho && doc.dados).map(x => ({ ...x, dados: doc.dados }));
    // Google Slides: as imagens vêm da apresentação exportada em .pptx (a API dos Slides não as deixa descarregar)
    if (doc.tipo === 'gslides' && sl.nImagens) {
      try { const p = await lerPptx(await exportarDrive(conta, googleId(a.url), MIME_PPTX, chaveRecurso(a.url))); const sp = p.slides[n - 1]; if (sp) imgs = (sp.imagens || []).map(x => ({ ...x, dados: p.dados })); }
      catch (e) { aviso(`Não deu para tirar as imagens do slide ${n} (${(e && e.message) || e}) — copio só os vídeos.`); }
    }
    if (!vids.length && !imgs.length) { aviso(`O slide ${n} do brief não tem vídeos nem imagens para copiar.`); return; }
    const pre = palavrasTitulo(t.nome) || 'brief';
    let feitos = 0, ja = 0;
    for (const x of [...vids, ...imgs]) {
      const nome = x.caminho ? `${pre}_slide${n}_${x.nome}` : (x.nome || 'video.mp4');
      try { await d.refs.getFileHandle(nome); ja++; continue; } catch (e) { /* ainda não está lá */ }
      const fh = await d.refs.getFileHandle(nome, { create: true });
      if (x.caminho) { const bl = await (x.dados || doc.dados)(x.caminho); const w = await fh.createWritable(); await w.write(bl); await w.close(); }
      else await guardarDoDrive(conta, { ...x, nome }, null, fh);
      feitos++;
    }
    const oque = (k, ex) => `${k} ${k === 1 ? 'ficheiro' : 'ficheiros'}${ex}`;
    if (feitos) aviso(`Copiei ${oque(feitos, '')} do slide ${n} do brief para ${d.projeto}\\Assets\\Refs.`, 'success');
    else if (ja) aviso(`Os assets do slide ${n} do brief já estavam em ${d.projeto}\\Assets\\Refs.`);
  } catch (e) { aviso(`Não consegui copiar os assets do brief: ${(e && e.message) || e}`, 'error'); }
  finally { BRIEF_A_COPIAR.delete(t.id); }
};
const VideoDoPptx = ({ blob, nome }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => { const tipo = /\.webm$/i.test(nome) ? 'video/webm' : /\.mov$/i.test(nome) ? 'video/quicktime' : 'video/mp4'; const u = URL.createObjectURL(new Blob([blob], { type: tipo })); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob, nome]);
  return url ? <video src={url} controls autoPlay className="w-full max-h-[60vh] rounded-lg bg-black object-contain" /> : null;
};
// ── Frames de um vídeo do brief: uma folha com 8 frames (com os tempos), para colar onde quiseres ──
const framesDoVideo = async (blob, n = 8) => {
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
    await new Promise((ok, falha) => { v.onloadedmetadata = ok; v.onerror = () => falha(new Error('Não consegui abrir o vídeo.')); });
    const dur = v.duration && isFinite(v.duration) ? v.duration : 1;
    const w = 300, h = Math.round(w * (v.videoHeight || 16) / (v.videoWidth || 9)), cols = 4, rows = Math.ceil(n / cols), topo = 26;
    const c = document.createElement('canvas'); c.width = cols * w + (cols + 1) * 6; c.height = rows * (h + topo) + (rows + 1) * 6;
    const g = c.getContext('2d'); g.fillStyle = '#111827'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.05, dur * (i + 0.5) / n);
      await new Promise(ok => { v.onseeked = ok; v.currentTime = Math.max(0, t); });
      const x = 6 + (i % cols) * (w + 6), y = 6 + Math.floor(i / cols) * (h + topo + 6);
      g.drawImage(v, x, y + topo, w, h);
      g.fillStyle = '#e5e7eb'; g.font = '600 15px system-ui, sans-serif'; g.fillText(`${i + 1} · ${fmtDur(t)}`, x + 4, y + 18);
    }
    return await new Promise(ok => c.toBlob(ok, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
};
const PreviaGoogle = ({ a, cid, tarefa, mudar, onFechar }) => {
  const tg = tipoGoogle(a.url);
  const conta = contaDe(cid);
  const abas = tg === 'slides' ? [['editar', 'Editar'], ['texto', 'Texto'], ['videos', 'Vídeos']] : tg === 'drive' ? [['editar', 'Ver']] : [['editar', 'Editar'], ['texto', tg === 'sheets' ? 'Texto (1.ª folha)' : 'Texto']];
  const [aba, setAba] = useState('editar');
  const [doc, setDoc] = useState(null); // o que lerBrief devolveu | { erro, ativar, recente, original }
  const [aCarregar, setACarregar] = useState(null); // null | { p, n }
  const [prog, setProg] = useState({});
  const [verV, setVerV] = useState(null); // chave do vídeo aberto
  const [blobV, setBlobV] = useState({}); // chave → Blob (vídeos do .pptx)
  const [copiado, setCopiado] = useState('');
  const [chaveIframe, setChaveIframe] = useState(0);
  const refSlide = useRef(null);
  const carregar = async () => {
    if (doc && !doc.erro) return doc;
    setACarregar({ p: null, n: 0 });
    try { const d = await lerBrief(conta, a.url, (p, n) => setACarregar({ p, n })); setDoc(d); setACarregar(null); return d; }
    catch (e) { setDoc({ erro: e.message, ativar: e.ativar, recente: e.recente, original: e.original }); setACarregar(null); return null; }
  };
  const abrir = async qual => { setAba(qual); if (qual !== 'editar') await carregar(); };
  // Nos slides, lê logo em fundo (para saber qual é o slide desta tarefa) — só se já houver acesso, sem abrir janelas da Google
  useEffect(() => {
    if (tg !== 'slides') return;
    const k = contaDe(cid) || '_'; const c = tokensDrive[k];
    if ((c && c.exp > Date.now() + 60000) || ligadoSempre(k)) carregar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const slides = doc && doc.slides;
  const nTarefa = slides ? slideDaTarefa(slides, a.url, tarefa) : null;
  const slideT = nTarefa ? slides[nTarefa - 1] : null;
  const tituloSlide = s => (s && String(s.texto || '').split('\n')[0]) || '';
  // Abre já no slide da tarefa — a não ser que haja o bloco «Para o After» (que fica no topo e é o que interessa)
  useEffect(() => { if (aba !== 'texto' || !refSlide.current || !slideT) return; const tx = textosParaAE(slideT.texto); if (!tx.falas.length && !tx.ecra.length) refSlide.current.scrollIntoView({ block: 'start' }); }, [aba, nTarefa, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // URL do editor já no slide da tarefa (quando dá para saber)
  const urlEditor = (() => {
    const base = urlEditarGoogle(a.url, cid);
    if (!slideT || slideDoLink(a.url)) return base;
    if (slideT.objectId) return `${base.split('#')[0]}#slide=id.${slideT.objectId}`;
    if (doc && doc.tipo === 'pptx') return `${base.split('#')[0]}#slide=id.p${slideT.n}`; // nos .pptx abertos no Google, os slides costumam chamar-se p1, p2…
    return base;
  })();
  const copiar = async (txt, qual) => { try { await navigator.clipboard.writeText(txt); setCopiado(qual); setTimeout(() => setCopiado(''), 1500); } catch (e) { /* sem acesso à área de transferência */ } };
  // O slide desta tarefa, escolhido à mão (fica guardado na tarefa; é o que vai para a Refs)
  const marcarSlide = n => {
    const s = slides && slides[n - 1]; if (!s || !tarefa || !mudar) return;
    mudar(tr => opTarefa(tr, tarefa.id, x => ({ ...x, briefSlide: { id: googleId(a.url), n, ...(s.objectId ? { objectId: s.objectId } : {}) } })));
    if (aba !== 'editar') setAba('editar');
    setChaveIframe(k => k + 1);
  };
  const [framesK, setFramesK] = useState({}); // chave do vídeo → 'a fazer' | 'ok' | 'erro:…'
  const copiarFrames = (v, k) => {
    setFramesK(x => ({ ...x, [k]: 'a fazer' }));
    const fazer = (async () => { const blob = v.caminho ? await blobDoPptx(v) : await videoDoDrive(conta, { id: v.id, nome: v.nome }); return framesDoVideo(blob); })();
    // A imagem entra na área de transferência quando estiver pronta (o Chrome deixa, porque o pedido começou num clique)
    navigator.clipboard.write([new ClipboardItem({ 'image/png': fazer })])
      .then(() => setFramesK(x => ({ ...x, [k]: 'ok' })))
      .catch(async e => { try { const b = await fazer; guardarBlobComo(b, `frames_${(v.nome || 'video').replace(/\.[^.]+$/, '')}.png`); setFramesK(x => ({ ...x, [k]: 'ok-ficheiro' })); } catch (e2) { setFramesK(x => ({ ...x, [k]: `erro:${e2.message || e.message}` })); } });
  };
  const blobDoPptx = async v => { if (blobV[v.caminho]) return blobV[v.caminho]; const b = await doc.dados(v.caminho); setBlobV(x => ({ ...x, [v.caminho]: b })); return b; };
  // Para onde vão os vídeos: a Assets\Refs do projeto (se a app souber qual é), senão escolhes tu
  const [destino, setDestino] = useState(null); // null (por ver) | { projeto, footage } | 'nenhum'
  const verDestino = async pedir => {
    if (destino && destino !== 'nenhum') return destino;
    if (destino === 'nenhum' && !pedir) return null;
    try { const d = await pastaDoProjetoDaTarefa(tarefa, pedir); setDestino(d && d.refs ? d : 'nenhum'); return d && d.refs ? d : null; } catch (e) { setDestino('nenhum'); return null; }
  };
  useEffect(() => { if (aba === 'videos' && !destino) verDestino(false); }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps
  const descarregar = async (v, ondeEscolho) => {
    const k = v.caminho || v.id;
    setProg(p => ({ ...p, [k]: 0 }));
    try {
      const nome = v.caminho ? `${(tarefa && palavrasTitulo(tarefa.nome)) || 'brief'}_slide${v.slide}_${v.nome}` : (v.nome || 'video.mp4');
      const d = ondeEscolho ? null : await verDestino(true);
      let ok, fh = null;
      if (d && d.refs) { fh = await d.refs.getFileHandle(await nomeLivre(d.refs, nome), { create: true }); }
      if (v.caminho) {
        const blob = await blobDoPptx(v);
        if (fh) { const w = await fh.createWritable(); await w.write(blob); await w.close(); ok = true; } else ok = await guardarBlob(blob, nome);
      } else ok = await guardarDoDrive(conta, { ...v, nome }, x => setProg(p => ({ ...p, [k]: x })), fh);
      setProg(p => ({ ...p, [k]: ok ? (fh ? `ok:${d.projeto}\\Assets\\Refs\\${fh.name}` : 'ok') : undefined }));
    } catch (e) { setProg(p => ({ ...p, [k]: `erro:${e.message}` })); }
  };
  const descarregarFicheiro = async () => {
    const id = googleId(a.url);
    try { const f = await pedirGoogle(conta, `${DRV}/${encodeURIComponent(id)}?fields=name,size&supportsAllDrives=true`, false, chaveRecurso(a.url)); await descarregar({ id, nome: f.name, tamanho: Number(f.size) || 0 }); }
    catch (e) { setProg(p => ({ ...p, [id]: `erro:${e.message}` })); }
  };
  const estadoProg = x => (x == null ? null : x === 'ok' ? <span className="text-emerald-400">✓ Guardado</span> : String(x).startsWith('ok:') ? <span className="text-emerald-400" title={String(x).slice(3)}>✓ Guardado em {String(x).slice(3).split('\\').slice(0, -1).join('\\')}</span> : String(x).startsWith('erro:') ? <span className="text-red-300">{String(x).slice(5)}</span> : <span className="tabular-nums">{Math.round(x * 100)}%</span>);
  const btn = 'px-3 py-1.5 text-xs rounded-lg bg-white/15 hover:bg-white/25 text-white';
  const idF = googleId(a.url);
  const todosVideos = slides ? [].concat(...slides.map(s => (s.videos || []).map(v => ({ ...v, slide: s.n }))), ((doc && doc.soltos) || []).map(v => ({ ...v, slide: 0 }))) : [];
  const videosOrd = todosVideos.slice().sort((x, y) => (y.slide === nTarefa) - (x.slide === nTarefa) || (x.slide || 999) - (y.slide || 999));
  const textoTudo = slides ? slides.map(s => `── Slide ${s.n} ──\n${s.texto}${s.notas ? `\n\nNotas: ${s.notas}` : ''}`).join('\n\n') : (doc && doc.texto) || '';
  const erroBox = d => (
    <div className="max-w-xl space-y-2 text-sm">
      {d.ativar
        ? <>
            <p>{d.recente ? 'A Google diz que a API do Google Slides foi ligada há pouco — às vezes demora até 5–10 minutos a ficar ativa. Espera um pouco e carrega em «Tentar outra vez».' : <>Para separar o texto por slide e ver os vídeos, falta ligar a <strong>API do Google Slides</strong> no projeto Google da app. É grátis e só se faz uma vez: abre o link, carrega em <strong>Ativar</strong> e espera uns minutos.</>}</p>
            <p className="text-[11px] text-white/50">Tem de ser no projeto que o link abre (o da app). {d.original ? `Resposta da Google: ${d.original}` : ''}</p>
            <div className="flex gap-2"><a href={d.ativar} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Ligar a API do Google Slides ↗</a><button type="button" onClick={() => { setDoc(null); abrir(aba); }} className={btn}>Tentar outra vez</button></div>
          </>
        : <><p className="text-red-300">Não consegui ler o ficheiro: {d.erro}</p><button type="button" onClick={() => { setDoc(null); abrir(aba); }} className={btn}>Tentar outra vez</button></>}
    </div>
  );
  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col p-2 sm:p-5 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="flex flex-wrap items-center gap-2 mb-2 text-white">
        <p className="min-w-0 flex-1 text-sm font-medium truncate">{(doc && doc.nome) || a.nome}</p>
        {slides && slides.length > 1 && (
          <select value={nTarefa || ''} onChange={e => { const n = Number(e.target.value); if (n) marcarSlide(n); }} aria-label="O slide desta tarefa"
            title="O slide do brief que é desta tarefa (é o que a app usa para os assets da Refs e para abrir o brief no sítio certo)"
            className={`max-w-[260px] px-2.5 py-1.5 text-xs rounded-lg font-medium cursor-pointer outline-none ${slideT ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-white/10 text-amber-300 ring-1 ring-amber-400/70 hover:bg-white/15'}`}>
            {!slideT && <option value="">★ Qual é o slide desta tarefa?</option>}
            {slides.map(s => <option key={s.n} value={s.n} className="bg-slate-800 text-white">★ Slide {s.n}{tituloSlide(s) ? ` · ${tituloSlide(s).slice(0, 40)}` : ''}</option>)}
          </select>
        )}
        {slideT && (
          <button type="button" onClick={() => { if (aba !== 'editar') setAba('editar'); setChaveIframe(k => k + 1); }} className="px-2.5 py-1.5 text-xs rounded-lg bg-white/10 text-amber-300 hover:bg-white/20" title={`Voltar ao slide desta tarefa: ${tituloSlide(slideT) || `slide ${slideT.n}`}`}>
            {slides && slides.length > 1 ? 'Ir ao slide' : `★ Slide ${slideT.n}`}
          </button>
        )}
        {abas.length > 1 && (
          <div role="tablist" className="flex rounded-lg bg-white/10 p-0.5">
            {abas.map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => abrir(k)} className={`px-3 py-1 text-xs rounded-md ${aba === k ? 'bg-white text-slate-900 font-medium' : 'text-white/80 hover:text-white'}`}>{n}{k === 'videos' && todosVideos.length ? ` (${todosVideos.length})` : ''}</button>)}
          </div>
        )}
        {tg === 'drive' && <button type="button" onClick={descarregarFicheiro} className={btn}>Descarregar {estadoProg(prog[idF])}</button>}
        <a href={urlAbrir(a.url, cid)} target="_blank" rel="noopener noreferrer" className={btn}>Abrir no Google ↗</a>
        <button type="button" onClick={onFechar} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25" aria-label="Fechar">✕</button>
      </div>
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-white">
        {aba === 'editar' && <iframe key={chaveIframe} src={urlEditor} title={a.nome} className="w-full h-full bg-white" allow="autoplay; fullscreen; clipboard-read; clipboard-write" allowFullScreen />}
        {aba !== 'editar' && (
          <div className="h-full overflow-auto bg-slate-900 text-slate-100 p-4 sm:p-6">
            {aCarregar && <p className="text-sm text-white/70">{aCarregar.n ? `A descarregar a apresentação… ${aCarregar.p != null ? `${Math.round(aCarregar.p * 100)}%` : tamanhoTxt(aCarregar.n)}` : 'A carregar…'}</p>}
            {!aCarregar && doc && doc.erro && erroBox(doc)}
            {!aCarregar && doc && !doc.erro && aba === 'texto' && (
              <div className="max-w-3xl mx-auto space-y-3">
                {doc.avisoApi && <p className="text-[11px] text-amber-300">Sem a API do Google Slides não consigo separar o texto por slide nem ver os vídeos (vê o separador Vídeos).</p>}
                {slideT && <BlocoTextosAE slide={slideT} copiar={copiar} copiado={copiado} />}
                <div className="flex items-center justify-between gap-2"><p className="text-xs text-white/60">Seleciona o que quiseres e Ctrl+C — ou copia tudo.</p><button type="button" onClick={() => copiar(textoTudo, 'tudo')} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white">{copiado === 'tudo' ? '✓ Copiado' : 'Copiar tudo'}</button></div>
                {slides ? slides.map(s => (
                  <div key={s.n} ref={s.n === nTarefa ? refSlide : null} className={`rounded-xl p-3 sm:p-4 scroll-mt-2 ${s.n === nTarefa ? 'bg-amber-400/10 ring-2 ring-amber-400' : 'bg-white/5'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className={`text-[11px] uppercase tracking-wide ${s.n === nTarefa ? 'text-amber-300 font-semibold' : 'text-white/50'}`}>Slide {s.n}{s.n === nTarefa ? ' · ★ desta tarefa' : ''}</p>
                      {s.n !== nTarefa && slides.length > 1 && mudar && <button type="button" onClick={() => marcarSlide(s.n)} className="ml-auto text-[11px] text-amber-300 hover:underline">★ É este o desta tarefa</button>}
                      {(s.texto || s.notas) && <button type="button" onClick={() => copiar(`${s.texto}${s.notas ? `\n\n${s.notas}` : ''}`, `s${s.n}`)} className="text-[11px] text-blue-300 hover:underline">{copiado === `s${s.n}` ? '✓ Copiado' : 'Copiar'}</button>}
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed select-text">{s.texto || '(sem texto)'}</pre>
                    {s.notas && <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-white/60 select-text">Notas: {s.notas}</pre>}
                  </div>
                )) : <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed select-text">{doc.texto || '(sem texto)'}</pre>}
              </div>
            )}
            {!aCarregar && doc && !doc.erro && aba === 'videos' && (
              doc.avisoApi ? erroBox(doc.avisoApi) : !videosOrd.length ? (
                <div className="space-y-2 text-sm text-white/70">
                  <p>Não encontrei vídeos dentro desta apresentação.</p>
                  {doc.tipo === 'pptx' && <p className="text-[11px] text-white/45">Ficheiros de imagem/vídeo dentro do .pptx: {(doc.media || []).length ? doc.media.join(', ') : 'nenhum'}. {slideT ? `Ligações no slide ${slideT.n}: ${(slideT.videos || []).length}.` : ''} (Manda-me isto se o vídeo estiver lá e eu não o encontrar.)</p>}
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-2">
                  {videosOrd.map(v => {
                    const k = v.caminho || v.id || v.externo;
                    const daTarefa = v.slide === nTarefa;
                    return (
                      <div key={`${v.slide}-${k}`} className={`rounded-xl p-3 space-y-2 border ${daTarefa ? 'bg-amber-400/10 border-amber-400' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          {v.mini ? <img src={v.mini} alt="" referrerPolicy="no-referrer" className="w-20 h-12 object-cover rounded-md bg-black" /> : <span className="w-20 h-12 rounded-md bg-black/40 inline-flex items-center justify-center"><IcoA n="video" className="w-5 h-5" /></span>}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{v.nome || (v.fonte === 'YOUTUBE' ? 'Vídeo do YouTube' : 'Vídeo')}</p>
                            <p className={`text-xs ${daTarefa ? 'text-amber-300' : 'text-white/60'}`}>{v.slide ? `Slide ${v.slide}` : 'Não sei em que slide está'}{daTarefa ? ' · ★ desta tarefa' : ''}{v.tamanho ? ` · ${tamanhoTxt(v.tamanho)}` : ''}{v.erro ? ` · ${v.erro}` : ''}{v.externo ? ' · ligado a um ficheiro fora da apresentação' : ''}</p>
                          </div>
                          {(v.caminho || (v.fonte === 'DRIVE' && !v.erro)) && <>
                            <button type="button" onClick={async () => { if (verV === k) { setVerV(null); return; } if (v.caminho) await blobDoPptx(v); setVerV(k); }} className={btn}>{verV === k ? 'Fechar' : '▶ Ver'}</button>
                            <button type="button" onClick={() => descarregar(v)} disabled={typeof prog[k] === 'number'} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60" title={destino && destino !== 'nenhum' ? `Guarda em ${destino.projeto}\\Assets\\Refs` : 'Escolhes onde guardar'}>{destino && destino !== 'nenhum' ? 'Guardar em Refs' : 'Descarregar'}</button>
                            {destino && destino !== 'nenhum' && <button type="button" onClick={() => descarregar(v, true)} disabled={typeof prog[k] === 'number'} className="text-[11px] text-white/60 hover:text-white underline-offset-2 hover:underline">noutro sítio…</button>}
                          </>}
                          {(v.caminho || (v.fonte === 'DRIVE' && !v.erro)) && <button type="button" onClick={() => copiarFrames(v, k)} disabled={framesK[k] === 'a fazer'} className={btn} title="Copia uma imagem com 8 frames do vídeo (com os tempos), para colares onde quiseres">{framesK[k] === 'a fazer' ? 'A tirar frames…' : framesK[k] === 'ok' ? '✓ Frames copiados' : framesK[k] === 'ok-ficheiro' ? '✓ Frames descarregados' : 'Frames → Claude'}</button>}
                          {String(framesK[k] || '').startsWith('erro:') && <span className="text-xs text-red-300">{String(framesK[k]).slice(5)}</span>}
                          {v.fonte === 'YOUTUBE' && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noopener noreferrer" className={btn}>Abrir no YouTube ↗</a>}
                          {prog[k] != null && <span className="text-xs">{estadoProg(prog[k])}</span>}
                        </div>
                        {verV === k && (v.caminho ? (blobV[v.caminho] ? <VideoDoPptx blob={blobV[v.caminho]} nome={v.nome} /> : null) : <VerVideo conta={conta} ficheiros={[{ id: v.id, nome: v.nome }]} claro={false} sub="text-white/60" iniciar />)}
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-white/50">{destino && destino !== 'nenhum' ? `Os vídeos vão para ${destino.projeto}\\Assets\\Refs (o nome nunca substitui um ficheiro que já lá esteja).` : 'Ao descarregar escolhes a pasta. Para irem direto para a Assets\\Refs do projeto, a app precisa de saber onde estão os teus projetos (escolhe-a uma vez no painel do Drive › «Encontrar os exports sozinho») e a tarefa tem de ter o conceito preenchido.'}</p>
                </div>
              )
            )}
          </div>
        )}
      </div>
      {aba === 'editar' && <p className="mt-2 text-[11px] text-white/60">{slideT ? `★ O slide desta tarefa é o ${slideT.n}${tituloSlide(slideT) ? ` («${tituloSlide(slideT)}»)` : ''} — se te perderes, carrega no botão amarelo. ` : ''}{`Se aparecer em branco ou a pedir para entrar, o ficheiro não está partilhado com ${conta || 'a conta Google principal deste browser'} (ou essa conta não tem sessão neste browser) — usa «Abrir no Google».`}</p>}
    </div>
  );
};
// Lista de verificação simples dentro da tarefa
const ChecklistTarefa = ({ t, mudar, claro, sub, caixa, inputClass }) => {
  const itens = t.checklist || [];
  const [novo, setNovo] = useState('');
  const set = lista => mudar(tr => opTarefa(tr, t.id, x => ({ ...x, checklist: lista })));
  const feitos = itens.filter(i => i.ok).length;
  return (
    <div className={`${caixa} space-y-1.5`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Checklist</p>
        {itens.length > 0 && <span className={`text-xs tabular-nums ${sub}`}>{feitos}/{itens.length}</span>}
      </div>
      {itens.length > 0 && <div className={`h-1 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700'}`}><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(feitos / itens.length) * 100}%` }} /></div>}
      {itens.map(i => (
        <div key={i.id} className="group flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!i.ok} onChange={e => set(itens.map(x => (x.id === i.id ? { ...x, ok: e.target.checked } : x)))} className="accent-emerald-500" />
          <span className={`flex-1 min-w-0 ${i.ok ? `line-through ${sub}` : ''}`}>{i.txt}</span>
          <button type="button" onClick={() => set(itens.filter(x => x.id !== i.id))} className={`text-xs opacity-0 group-hover:opacity-100 ${sub} hover:text-red-400`} aria-label="Tirar">✕</button>
        </div>
      ))}
      <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && novo.trim()) { set([...itens, { id: trabId() + 'c', txt: novo.trim(), ok: false }]); setNovo(''); } }}
        placeholder="+ Juntar item (Enter)" className={`${inputClass} text-sm py-1.5`} />
    </div>
  );
};

// ── Detalhe de uma tarefa (painel lateral) ──
const PRIORIDADES = [['urgente', 'Urgente', '#ef4444'], ['alta', 'Alta', '#f59e0b'], ['normal', 'Normal', '#3b82f6'], ['baixa', 'Baixa', '#94a3b8']];
const FORMATOS = ['9:16', '1:1', '4:5', '16:9'];
// Notas da tarefa: gravam enquanto escreves (e ao fechar a tarefa), não só ao sair do campo
const NotasDaTarefa = ({ t, set, inputClass, lab, sub }) => {
  const [v, setV] = useState(t.notas || '');
  const vRef = useRef(t.notas || ''); const ultimo = useRef(t.notas || '');
  const timer = useRef(null);
  const setRef = useRef(set); setRef.current = set;
  const [gravado, setGravado] = useState(false);
  const gravar = () => {
    clearTimeout(timer.current); timer.current = null;
    if (vRef.current === ultimo.current) return;
    ultimo.current = vRef.current;
    setRef.current({ notas: vRef.current });
    setGravado(true);
  };
  useEffect(() => () => gravar(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!gravado) return undefined; const i = setTimeout(() => setGravado(false), 1500); return () => clearTimeout(i); }, [gravado]);
  return (
    <label className="flex flex-col gap-1">
      <span className={`${lab} flex items-center gap-2`}>Notas da tarefa{gravado && <span className={`text-[11px] font-normal ${sub}`}>✓ gravado</span>}</span>
      <textarea value={v} rows={3} onChange={e => { setV(e.target.value); vRef.current = e.target.value; clearTimeout(timer.current); timer.current = setTimeout(gravar, 700); }} onBlur={gravar}
        className={`${inputClass} text-sm`} placeholder="Feedback do cliente, ideias, referências…" />
    </label>
  );
};
// Menu "⋯" do cabeçalho da tarefa: as ações que se usam pouco (fica fora do DetalheTarefa para não perder o estado "aberto")
const MenuMais = ({ claro, itens }) => {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); } };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc, true); };
  }, [aberto]);
  const cls = perigo => `w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${perigo ? 'text-red-400 hover:bg-red-500/10' : claro ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-200 hover:bg-white/5'}`;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(a => !a)} aria-haspopup="menu" aria-expanded={aberto} aria-label="Mais ações" title="Mais ações"
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xl leading-none ${aberto ? (claro ? 'bg-slate-100' : 'bg-white/10') : ''} ${claro ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/10'}`}>⋯</button>
      {aberto && (
        <div role="menu" className={`absolute right-0 top-full mt-1 z-50 min-w-[300px] whitespace-nowrap rounded-xl border shadow-xl py-1 ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-600'}`}>
          {itens.filter(Boolean).map((it, i) => (it === '-'
            ? <div key={i} className={`my-1 border-t ${claro ? 'border-slate-200' : 'border-slate-700'}`} />
            : it.href
              ? <a key={i} role="menuitem" href={it.href} title={it.title} onClick={() => { setAberto(false); if (it.onClick) it.onClick(); }} className={cls(it.perigo)}>{it.txt}</a>
              : <button key={i} type="button" role="menuitem" title={it.title} onClick={() => { setAberto(false); it.onClick(); }} className={cls(it.perigo)}>{it.txt}</button>
          ))}
        </div>
      )}
    </div>
  );
};
// No ecrã grande a janela da tarefa cabe toda no ecrã: cada coluna rola sozinha se precisar
const COL_XL = 'xl:h-full xl:overflow-y-auto xl:pr-1 xl:-mr-1 [scrollbar-width:thin]';
const DetalheTarefa = ({ t, trab, cu, clientes, theme, inputClass, mudar, onFechar, onEnviarAnexo, onApagarAnexo, showToast, notasDe, onAbrirNota, onNovaNota }) => {
  const claro = useClaro(theme);
  const [hManual, setHManual] = useState('');
  const [diaManual, setDiaManual] = useState(trabDia(new Date().toISOString()));
  const [maisTipos, setMaisTipos] = useState(false);
  const [varias, setVarias] = useState(false);
  const [gravou, setGravou] = useState(false);
  const [nomeLivre, setNomeLivre] = useState(false);
  const [verFinal, setVerFinal] = useState(false); // "Valor à mão" aberto
  const [verSub, setVerSub] = useState(false); // "Subcontratei" aberto
  const [verManual, setVerManual] = useState(false); // "Juntar tempo à mão" aberto
  useEffect(() => { if (!gravou) return undefined; const i = setTimeout(() => setGravou(false), 1600); return () => clearTimeout(i); }, [gravou]);
  useEffect(() => { const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [onFechar]);
  if (!t) return null;
  const set = patch => mudar(tr => opTarefa(tr, t.id, x => ({ ...x, ...patch })));
  const v = trabValor(t, cu, clientes);
  const vAuto = trabValorAuto(t, cu, clientes);
  const corre = (t.tempos || []).some(x => !x.fim);
  const pastasCli = (trab.pastas || []).filter(p => String(p.cid) === String(t.cid));
  const caminhoTxt = p => caminho(trab, p.id).map(x => x.nome).join(' / ');
  const lab = `text-[13px] ${claro ? 'text-slate-500' : 'text-slate-400'}`;
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const caixa = `rounded-xl border p-3.5 ${claro ? 'border-slate-200' : 'border-slate-700'}`;
  const titCaixa = 'text-[15px] font-semibold';
  // Peças da tarefa: à mão (t.pecas) ou lidas do nome
  const pecasAtuais = {}; trabPecas(t).forEach(p => { if (p.tipo !== 'outro' && p.tipo !== 'extra') pecasAtuais[p.tipo] = (pecasAtuais[p.tipo] || 0) + p.n; });
  const temMao = t.pecas && Object.keys(t.pecas).length > 0;
  const preco = tipo => cuPreco(cu, clientes, t.cid, tipo);
  const tiposVis = tiposDe(cu, pecasAtuais).filter(x => maisTipos || preco(x.id) > 0 || pecasAtuais[x.id]);
  // Escolher o tipo muda o início do nome ("1x Variation - …"); o conceito fica como está
  const pecasNome = contarPecas(trabPecas(t));
  const conceitoAtual = conceitoDoNome(t.nome, cu);
  const prefixo = prefixoDoTipo(pecasNome, cu);
  const aplicarTipo = (pecasNovas, conceito = conceitoAtual) => {
    const limpas = {}; Object.entries(pecasNovas || {}).forEach(([k, n]) => { if (Number(n) > 0) limpas[k] = Number(n); });
    const nome = nomeComTipo(limpas, conceito, cu) || t.nome;
    const lidas = contarPecas(cuPecas(nome));
    set({ nome, pecas: !Object.keys(limpas).length || mesmasPecas(lidas, limpas) ? null : limpas });
    setGravou(true);
  };
  const gravarConceito = txt => {
    const v = String(txt || '').trim();
    if (!v || v === conceitoAtual) return;
    if (conceitoDoNome(v, cu) !== v) { set({ nome: v, pecas: null }); return; } // escreveste o nome todo ("2x New Videos - …")
    if (!prefixo) { set({ nome: v }); return; }
    aplicarTipo(temMao ? t.pecas : pecasNome, v);
  };
  const setPeca = (tipo, n) => { const base = temMao ? { ...t.pecas } : { ...pecasAtuais }; if (!n) delete base[tipo]; else base[tipo] = n; aplicarTipo(base); };
  const horasTarefa = trabHoras(t);
  const est = Number(t.estimativa) || 0;
  const prio = PRIORIDADES.find(x => x[0] === t.prioridade);
  const custo = Number(t.custoOutsourcing) || 0;
  const comFicheiros = (trab.jogos || []).some(j => String(j.cid) === String(t.cid));
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 lg:p-6 animate-backdropIn backdrop-blur-md" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }} style={{ background: claro ? 'rgba(15,23,42,.25)' : 'rgba(0,0,0,.45)' }}>
      <div className={`w-full max-w-[1760px] h-full sm:h-auto sm:max-h-full overflow-y-auto xl:overflow-hidden xl:flex xl:flex-col shadow-2xl sm:rounded-2xl border animate-modalIn ${claro ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-900 text-slate-100 border-slate-700'}`}>
        <div className={`sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b ${claro ? 'bg-white/95 border-slate-200' : 'bg-slate-900/95 border-slate-700'}`}>
          <EstadoPill estado={t.estado} theme={theme} onMudar={e => { avisarEstadoPC(t, e); mudar(tr => opEstado(tr, t.id, e)); }} />
          {prio && <span className="text-xs font-medium" style={{ color: prio[2] }}>⚑ {prio[1]}</span>}
          <span className="flex-1" />
            {(() => {
              const btnTopo = `hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium border`;
              const neutro = claro ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-slate-700 text-slate-300 hover:bg-white/5';
              return (<>
                {t.pastaPC
                  ? <LinkPC href={linkAEPasta(trab, t, clientes)} onClick={() => trazerBriefParaRefs(t, showToast)} className={`${btnTopo} ${neutro}`} title="Abre a pasta do projeto no Explorador (se ainda não existir, o lançador pergunta se a cria)"><IcoT n="pasta" className="w-3.5 h-3.5" />Abrir pasta</LinkPC>
                  : <LinkPC txtAbrir="A criar…" href={linkAECriar(trab, t, clientes)} onClick={() => { mudar(tr => opTarefa(tr, t.id, x => ({ ...x, pastaPC: { em: agoraIso() } }))); trazerBriefParaRefs(t, showToast); }} className={`${btnTopo} ${neutro}`} title={`Cria a pasta do projeto no PC (${ESTRUTURA_PROJETO.map(x => x.split('/')[0]).filter((x, i, a) => a.indexOf(x) === i).join(', ')}…) com o nome da tarefa, cria o projeto do After Effects (com as pastas 00.MASTERCOMPS…) e fixa a pasta em 1.º no Acesso rápido do Explorador. Se já existir, só a abre.`}><IcoT n="pasta" className="w-3.5 h-3.5" />Criar pastas e projeto</LinkPC>}
                <LinkPC href={linkAEAbrir(trab, t, clientes)} className={`${btnTopo} ${claro ? 'border-blue-200 text-blue-700 hover:bg-blue-50' : 'border-blue-500/30 text-blue-300 hover:bg-blue-500/10'}`} title="Abre o projeto desta tarefa no After Effects (precisa do lançador AbrirAE instalado no PC)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>Abrir no After Effects</LinkPC>
              </>);
            })()}
          <span className={`text-sm tabular-nums ml-1 ${sub}`}><HorasVivas t={t} /></span>
          <BotaoCrono aCorrer={corre} theme={theme} onIniciar={() => { if (t.estado === 'todo') avisarEstadoPC(t, 'curso'); mudar(tr => opIniciar(tr, t.id)); }} onParar={() => mudar(opParar)} />
          {(() => {
            const np = nomeProjetoTarefa(trab, t);
            const naFatura = t.faturaId && t.faturaId !== 'fora';
            const fora = !!(t.faturaId || t.faturada);
            return <MenuMais claro={claro} itens={[
              { txt: '↺ Trocar o projeto do After', href: `${linkAEAbrir(trab, t, clientes)}&escolher=1`, title: 'Abriu o projeto errado? Mostra a lista para escolheres o desta tarefa (fica guardado)' },
              np && { txt: '✎ Mudar o nome da pasta e do .aep', href: linkAERenomear(trab, t, clientes, np), title: `Mudar o nome da pasta do projeto, do .aep e do collect (@Source) para ${np} — fecha antes o projeto no After Effects` },
              '-',
              !naFatura && { txt: fora ? '✓ Já faturada fora da app — desmarcar' : '€ Marcar como já faturada (fora da app)', title: 'As tarefas faturadas fora da app não entram nas faturas', onClick: () => set(fora ? { faturaId: null, faturada: false } : { faturaId: 'fora' }) },
              { txt: '⧉ Duplicar tarefa', onClick: () => mudar(tr => ({ ...tr, tarefas: [...tr.tarefas, { ...t, id: trabId(), nome: t.nome + ' (cópia)', estado: 'todo', tempos: [], criada: agoraIso(), iniciada: null, review: null, feita: null, faturada: false, faturaId: null, drive: null, link: '', trello: null, trelloSolto: false, entregaEm: null, pastaPC: null, ficheiros: t.ficheiros ? { conceito: t.ficheiros.conceito } : undefined }] })) },
              { txt: '🗑 Apagar tarefa', perigo: true, onClick: async () => { if (APAGAR.pedir) { APAGAR.pedir(t); return; } if (await confirmar(`Apagar esta tarefa?${(t.anexos || []).some(x => x.caminho) ? ' Os anexos dela também são apagados.' : ''}`)) {
                const outros = new Set((trab.tarefas || []).filter(o => o.id !== t.id).flatMap(o => (o.anexos || []).map(x => x.caminho)).filter(Boolean));
                (t.anexos || []).forEach(x => { if (x.caminho && !outros.has(x.caminho) && onApagarAnexo) onApagarAnexo(x.caminho); });
                mudar(tr => ({ ...tr, tarefas: tr.tarefas.filter(x => x.id !== t.id) })); onFechar();
              } } },
            ]} />;
          })()}
          <button type="button" onClick={onFechar} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/10" aria-label="Fechar">✕</button>
        </div>
        <div className={`p-4 lg:p-5 grid grid-cols-1 gap-4 lg:gap-5 items-start xl:items-stretch xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)] ${comFicheiros ? 'lg:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.15fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'}`}>
         <div className={`space-y-3 min-w-0 ${COL_XL}`}>
          {nomeLivre || !prefixo ? (
            <label className="flex flex-col gap-1 min-w-0">
              <span className={`${lab} flex items-center gap-2`}>Nome da tarefa{prefixo && <button type="button" onClick={() => setNomeLivre(false)} className="ml-auto text-blue-400 hover:text-blue-300">Só o conceito</button>}{!prefixo && <span className="ml-auto opacity-70">escolhe o tipo em Valor e o início do nome aparece sozinho</span>}</span>
              <textarea key={t.id + 'n' + t.nome} defaultValue={t.nome} rows={1} aria-label="Nome da tarefa"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                onBlur={e => { const n = e.target.value.trim(); if (n && n !== t.nome) { set({ nome: n }); setGravou(true); } else if (!n) e.target.value = t.nome; }}
                className={`${inputClass} text-base font-semibold resize-none overflow-hidden py-2 leading-snug`} />
            </label>
          ) : (
            <div className="flex flex-col gap-1 min-w-0">
              <span className={`${lab} flex items-center gap-2`} title="O início vem do tipo (em Valor); escreves só o conceito">Nome da tarefa<button type="button" onClick={() => setNomeLivre(true)} className="ml-auto shrink-0 text-blue-400 hover:text-blue-300">Editar o nome todo</button></span>
              <div className={`flex items-stretch rounded-lg border overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 ${claro ? 'border-slate-300 bg-white' : 'border-slate-600 bg-slate-800'}`}>
                <span className={`shrink-0 flex items-center px-3 py-1.5 text-sm font-semibold max-w-[45%] sm:max-w-none sm:whitespace-nowrap border-r ${claro ? 'bg-blue-50 text-blue-700 border-slate-200' : 'bg-blue-500/10 text-blue-300 border-slate-700'}`} title="Muda quando escolhes o tipo em Valor">{prefixo}</span>
                <textarea key={t.id + 'c' + t.nome} defaultValue={conceitoAtual} rows={1} aria-label="Conceito da tarefa" placeholder="Conceito (ex.: Monthly earnings - variation)"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                  onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                  ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                  onBlur={e => gravarConceito(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent px-3 py-2 text-base font-semibold resize-none overflow-hidden leading-snug outline-none" />
              </div>
            </div>
          )}

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
          </div>

          <AnexosTarefa t={t} trab={trab} mudar={mudar} onEnviar={onEnviarAnexo} onApagarFicheiro={onApagarAnexo} claro={claro} sub={sub} caixa={caixa} inputClass={inputClass} showToast={showToast} />

          <NotasDaTarefa key={t.id + 'x'} t={t} set={set} inputClass={inputClass} lab={lab} sub={sub} />

          <ChecklistTarefa t={t} mudar={mudar} claro={claro} sub={sub} caixa={caixa} inputClass={inputClass} />

          {onAbrirNota && <NotasLigadas lista={notasDe ? notasDe('tarefa', t.id) : []} onAbrir={onAbrirNota} onNova={onNovaNota ? () => onNovaNota('tarefa', t.id, t.nome) : null} claro={claro} sub={sub} caixa={caixa} titulo="Notas sobre esta tarefa" />}

         </div>
         <div className={`space-y-3 min-w-0 ${COL_XL}`}>
          {/* Valor da tarefa: peças por tipo, com preço do cliente */}
          <div className={caixa}>
            <div className="flex items-center justify-between mb-2">
              <p className={titCaixa}>Valor</p>
              <p className={`text-xl font-semibold tabular-nums ${claro ? 'text-emerald-700' : 'text-emerald-400'}`}>{eur(v)}</p>
            </div>
            {(() => {
              const pecasT = trabPecas(t);
              const porHora = pecasT.some(p => p.tipo === 'extra' || p.tipo === 'outro');
              const tiposCom = Object.keys(pecasAtuais);
              const simples = !porHora && tiposCom.length === 1 && pecasAtuais[tiposCom[0]] === 1;
              const multi = !porHora && (tiposCom.length > 1 || (tiposCom.length === 1 && pecasAtuais[tiposCom[0]] > 1));
              const verQtd = varias || multi;
              const chip = on => `px-3 py-1 rounded-full text-[13px] border transition-colors ${on ? 'border-blue-400 bg-blue-500/15 text-blue-400 font-medium' : claro ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-white/5'}`;
              const linhaHoras = porHora && (
                <div className="grid grid-cols-[minmax(0,1fr)_92px_72px_80px] items-center gap-2 text-sm">
                  <span>Horas (à hora)</span><span className="text-right tabular-nums">{tempoTxt(horasTarefa)}</span>
                  <span className={`text-right text-xs ${sub}`}>× {eur(preco('hora'))}/h</span>
                  <span className="text-right tabular-nums">{preco('dia') > 0 ? 'nos dias' : eur(horasTarefa * preco('hora'))}</span>
                </div>
              );
              return (
                <>
                  {!verQtd ? (
                    <div>
                      <span className={lab}>Tipo {gravou && <span className="text-emerald-400">✓ gravado</span>}</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {tiposVis.map(x => (
                          <button key={x.id} type="button" onClick={() => aplicarTipo({ [x.id]: 1 })} className={chip(simples && tiposCom[0] === x.id)}>
                            {x.curto || x.nome} <span className="opacity-60 tabular-nums">{eur(preco(x.id))}</span>
                          </button>
                        ))}
                        <button type="button" onClick={() => aplicarTipo({ extra: 1 })} className={chip(porHora)}>
                          À hora <span className="opacity-60 tabular-nums">{preco('dia') > 0 ? `${eur(preco('dia'))}/dia` : `${eur(preco('hora'))}/h`}</span>
                        </button>
                      </div>
                      {porHora && <div className="mt-2">{linhaHoras}</div>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between -mt-1 mb-1">
                        <span className={lab}>Várias peças nesta tarefa</span>
                        <button type="button" onClick={() => { if (multi) { const k = Object.keys(pecasAtuais).sort((a, b) => preco(b) * pecasAtuais[b] - preco(a) * pecasAtuais[a])[0]; if (k) aplicarTipo({ [k]: 1 }); } setVarias(false); }}
                          title={multi ? 'Volta a uma só peça (fica a de maior valor)' : 'Fechar'} aria-label="Fechar várias peças"
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${claro ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/10'}`}>✕</button>
                      </div>
                      {tiposVis.map(x => {
                        const n = pecasAtuais[x.id] || 0;
                        return (
                          <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_92px_72px_80px] items-center gap-2 text-sm">
                            <span className={n ? '' : sub}>{x.curto || x.nome}</span>
                            <QtdIn valor={n || null} rotulo={x.curto || x.nome} claro={claro} onGravar={q => setPeca(x.id, q || 0)} className={`${inputClass} !w-full text-sm py-1 text-right`} />
                            <span className={`text-right text-xs ${sub}`}>× {eur(preco(x.id))}</span>
                            <span className="text-right tabular-nums">{n ? eur(n * preco(x.id)) : '—'}</span>
                          </div>
                        );
                      })}
                      {linhaHoras}
                    </div>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                    {!verQtd && <button type="button" className="text-blue-400 hover:text-blue-300" onClick={() => setVarias(true)}>Várias peças</button>}
                    <button type="button" className="text-blue-400 hover:text-blue-300" onClick={() => setMaisTipos(!maisTipos)}>{maisTipos ? 'Menos tipos' : 'Mais tipos'}</button>
                    {!(verFinal || t.valorManual != null) && <button type="button" className="text-blue-400 hover:text-blue-300" title="Escrever o valor a faturar à mão (por defeito é o total das peças)" onClick={() => setVerFinal(true)}>Valor à mão</button>}
                    {!(verSub || t.freelancerId || t.outsourcing || custo > 0) && <button type="button" className="text-blue-400 hover:text-blue-300" title="Se passaste a tarefa a outro freelancer — desconta no mês em que a entregas" onClick={() => setVerSub(true)}>Subcontratei</button>}
                    {temMao && <button type="button" className={`${sub} hover:text-blue-400`} onClick={() => set({ pecas: null })}>Voltar a ler do nome</button>}
                  </div>
                </>
              );
            })()}
            {(verFinal || t.valorManual != null) && (
              <div className={`mt-3 pt-3 border-t grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-2 ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
                <span className="text-sm">Valor à mão <span className={`text-xs ${sub}`}>(vazio = {eur(vAuto)})</span></span>
                <NumIn valor={t.valorManual ?? null} placeholder={String(Math.round(vAuto))} onGravar={x => set({ valorManual: x })} className={`${inputClass} !w-full text-sm py-1 text-right font-semibold`} />
                <button type="button" onClick={() => { if (t.valorManual != null) set({ valorManual: null }); setVerFinal(false); }} title="Voltar ao valor das peças" aria-label="Tirar o valor à mão" className={`w-7 h-7 rounded-lg ${claro ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/10'}`}>✕</button>
              </div>
            )}
            {/* Subcontratação (só aparece se passaste a tarefa a alguém) */}
            {(verSub || t.freelancerId || t.outsourcing || custo > 0) && (
              <div className={`mt-3 pt-3 border-t space-y-2 ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm" title="Se passaste a tarefa a outro freelancer — desconta no mês em que a entregas">Subcontratação</p>
                  {!(t.freelancerId || t.outsourcing || custo > 0) && <button type="button" onClick={() => setVerSub(false)} aria-label="Fechar subcontratação" className={`w-7 h-7 rounded-lg ${claro ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/10'}`}>✕</button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(trab.freelancers || []).length > 0 ? (
                    <select value={t.freelancerId || (t.outsourcing ? '__' : '')} onChange={e => {
                      const f = (trab.freelancers || []).find(x => x.id === e.target.value);
                      if (!f) { set({ freelancerId: null, outsourcing: '', custoOutsourcing: null }); return; }
                      const c = custoFreelancer(f, t);
                      set({ freelancerId: f.id, outsourcing: f.nome, ...(c != null ? { custoOutsourcing: c } : {}) });
                    }} className={`${inputClass} text-sm py-1.5`}>
                      <option value="">Ninguém (fiz eu)</option>
                      {t.outsourcing && !t.freelancerId && <option value="__">{t.outsourcing}</option>}
                      {(trab.freelancers || []).filter(f => f.estado !== 'antigo' || f.id === t.freelancerId).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  ) : (
                    <input key={t.id + 'q' + (t.outsourcing || '')} defaultValue={t.outsourcing || ''} placeholder="Quem fez" onBlur={e => { if (e.target.value !== (t.outsourcing || '')) set({ outsourcing: e.target.value.trim() }); }} className={`${inputClass} text-sm py-1.5`} />
                  )}
                  <NumIn valor={t.custoOutsourcing ?? null} placeholder="Quanto lhe pagas (€)" onGravar={x => set({ custoOutsourcing: x })} className={`${inputClass} text-sm py-1.5`} />
                </div>
                {(() => { const f = (trab.freelancers || []).find(x => x.id === t.freelancerId); const c = custoFreelancer(f, t); return f ? <p className={`text-xs ${sub}`}>{c != null ? <>Pela tabela de {f.nome}: {eur(c)}{Math.abs(c - custo) >= 0.5 && <> · <button type="button" onClick={() => set({ custoOutsourcing: c })} className="text-blue-400 hover:text-blue-300">Usar este valor</button></>}</> : `${f.nome} não tem preço para este tipo — escreve o valor (ou junta-o em Freelancers).`}</p> : null; })()}
                {custo > 0 && <p className="text-sm">Margem: <strong className={v - custo >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}>{eur(v - custo)}</strong> <span className={sub}>({v ? Math.round((v - custo) / v * 100) : 0}%)</span></p>}
                {custo > 0 && RESERVA.taxa != null && (() => {
                  // Nos recibos verdes o imposto é sobre o valor todo da tarefa: o que pagas ao freelancer não o reduz
                  const imp = v * RESERVA.taxa / 100; const liq = v - custo - imp;
                  return (
                    <p className="text-sm" title={`Imposto calculado sobre os ${eur(v)} da tarefa (o que pagas ao freelancer não baixa o imposto nos recibos verdes)`}>
                      Depois de impostos: <strong className={liq >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}>{eur(liq)}</strong> <span className={sub}>({v ? Math.round(liq / v * 100) : 0}%) · reserva de {String(RESERVA.taxa).replace('.', ',')}% = {eur(imp)}</span>
                    </p>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Entrega */}
          <div className={`${caixa} space-y-3`}>
            <p className={titCaixa}>Entrega</p>
            <div>
              <span className={lab}>Formatos</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {FORMATOS.map(f => { const on = (t.formatos || []).includes(f); return (
                  <button key={f} type="button" onClick={() => set({ formatos: on ? (t.formatos || []).filter(x => x !== f) : [...(t.formatos || []), f] })}
                    className={`px-3 py-1 rounded-md text-[13px] border ${on ? 'border-blue-400 bg-blue-500/15 text-blue-400' : claro ? 'border-slate-200 text-slate-500' : 'border-slate-700 text-slate-400'}`}>{f}</button>
                ); })}
              </div>
            </div>
            <label className="flex flex-col gap-1"><span className={lab}>Link da entrega</span>
              <div className="flex gap-2">
                <input key={t.id + 'l' + (t.link || '')} defaultValue={t.link || ''} placeholder="https://… (Frame.io, Drive)" onBlur={e => { if (e.target.value !== (t.link || '')) set({ link: e.target.value.trim() }); }} className={`${inputClass} text-sm py-1.5`} />
                {t.link && <a href={urlAbrir(t.link, t.cid)} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white flex items-center">Abrir</a>}
              </div>
            </label>
            {t.faturaId && t.faturaId !== 'fora' ? (
              <p className="text-sm text-emerald-500" title="Para tirar, anula a fatura no separador Faturas do cliente">✓ Na fatura nº {((trab.faturas || []).find(f => f.id === t.faturaId) || {}).numero || '?'}</p>
            ) : (t.faturaId || t.faturada) ? (
              <p className="text-sm text-emerald-500">✓ Já faturada fora da app <span className={sub}>— não entra nas faturas ·</span> <button type="button" onClick={() => set({ faturaId: null, faturada: false })} className={`${sub} underline hover:text-blue-400`}>desmarcar</button></p>
            ) : null}
          </div>

          {/* Tempo */}
          <div className={caixa}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className={titCaixa}>Tempo</p>
              <span className="flex-1" />
              <button type="button" onClick={() => setVerManual(m => !m)} className={`text-[13px] ${verManual ? sub : 'text-blue-400 hover:text-blue-300'}`} title="Juntar horas que não ficaram no cronómetro">{verManual ? 'Fechar' : '+ Tempo à mão'}</button>
              <label className={`flex items-center gap-1.5 text-[13px] ${sub}`} title="Opcional: quantas horas achas que vai levar">Estimativa
                <NumIn valor={t.estimativa ?? null} placeholder="—" onGravar={x => set({ estimativa: x })} className={`${inputClass} !w-16 text-sm py-1 text-right`} />
              </label>
              <p className={`text-sm tabular-nums font-semibold ${est && horasTarefa > est ? 'text-red-400' : ''}`}><HorasVivas t={t} />{est ? <span className={`ml-1 text-xs font-normal ${sub}`}>({Math.round(horasTarefa / est * 100)}%)</span> : null}</p>
            </div>
            {(() => {
              // Estimativa sugerida pelo teu histórico (só quando ainda não puseste uma) e quanto estás a ganhar por hora nesta tarefa
              const sug = !est && t.estado !== 'feito' ? trabSugerirEstimativa(t, trab, cu, clientes) : null;
              const eh = (t.estado === 'review' || t.estado === 'feito') && horasTarefa >= 0.25 && v > 0 ? v / horasTarefa : 0; // só no fim: a meio, o valor todo a dividir por poucas horas engana
              if (!sug && !eh) return null;
              const nomeT = id => { const x = tiposDe(cu).find(y => y.id === id); return x ? (x.curto || x.nome).toLowerCase() : id; };
              const que = sug && (sug.tipos.length === 1 ? `${sug.amostras} tarefa${sug.amostras === 1 ? '' : 's'} de ${nomeT(sug.tipos[0])}` : `${sug.amostras} tarefas com estas peças`);
              return (
                <div className={`-mt-0.5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] ${sub}`}>
                  {sug && <span>Sugestão: <b className={claro ? 'text-slate-700' : 'text-slate-200'}>≈ {tempoTxt(sug.h)}</b> <span className="opacity-80">(média de {que}{sug.soCliente ? ' deste cliente' : ''})</span> · <button type="button" onClick={() => set({ estimativa: sug.h })} className="text-blue-400 hover:text-blue-300">usar</button></span>}
                  {eh > 0 && <span className="ml-auto tabular-nums" title={`Valor da tarefa (${eur(v)}) ÷ horas registadas (${tempoTxt(horasTarefa)})`}>{eur(eh)}/h</span>}
                </div>
              );
            })()}
            <GraficoTempo t={t} mudar={mudar} claro={claro} inputClass={inputClass} est={est} />
            {verManual && <div className={`mt-3 pt-3 border-t flex flex-wrap items-center gap-2 ${claro ? 'border-slate-200' : 'border-white/[0.06]'}`}>
              <input type="date" value={diaManual} onChange={e => setDiaManual(e.target.value)} aria-label="Dia" className={`${inputClass} !w-auto text-sm py-1`} />
              <input autoFocus value={hManual} onChange={e => setHManual(e.target.value)} placeholder="ex.: 2h30" aria-label="Horas" className={`${inputClass} !w-24 text-sm py-1`} />
              <button type="button" className="text-sm px-3 py-1 rounded-lg bg-blue-600 text-white disabled:opacity-40" disabled={!cuLerHoras(hManual)} onClick={() => {
                const h = cuLerHoras(hManual); if (!h) return;
                const ini = new Date(`${diaManual}T09:00`); const fim = new Date(ini.getTime() + h * 3600000);
                mudar(tr => opTarefa(tr, t.id, y => ({ ...y, iniciada: y.iniciada || ini.toISOString(), tempos: [...(y.tempos || []), { id: trabId(), ini: ini.toISOString(), fim: fim.toISOString(), manual: true }] })));
                setHManual('');
              }}>+ Acrescentar</button>
            </div>}
          </div>

          <div className={`flex flex-wrap gap-x-4 gap-y-0.5 text-xs px-1 ${sub}`}>
            {[['Criada', 'criada', t.criada], ['Começada', 'iniciada', t.iniciada], ['Review', 'review', t.review], ['Terminada', 'feita', t.feita]].filter(([, , d]) => d).map(([k, campo, d]) => (
              <label key={k} className="inline-flex items-center gap-1 cursor-pointer" title={campo === 'review' || campo === 'feita' ? 'Carrega para mudar (o dia da entrega conta nas receitas desse mês)' : 'Carrega para mudar'}>
                {k}
                <input type="datetime-local" defaultValue={paraInputLocal(d)} key={campo + d} style={{ colorScheme: claro ? 'light' : 'dark' }} onBlur={e => { if (e.target.value) { const iso = new Date(e.target.value).toISOString(); if (iso !== d) set({ [campo]: iso }); } }}
                  className={`tabular-nums bg-transparent border-0 p-0 text-xs rounded hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500 ${claro ? 'text-slate-600' : 'text-slate-300'}`} />
              </label>
            ))}
          </div>

         </div>
         {comFicheiros && (
           <div className={`min-w-0 lg:col-span-2 xl:col-span-1 ${COL_XL}`}>
             <NomesFicheiros t={t} trab={trab} set={set} mudar={mudar} claro={claro} inputClass={inputClass} lab={lab} sub={sub} caixa={caixa} />
           </div>
         )}
        </div>
      </div>
    </div>
  );
};

// ── Árvore de pastas ──
const NoPasta = ({ p, trab, nivel, sel, setSel, abertas, alternar, theme, contar, onFav, onSub, onRenomear }) => {
  const claro = useClaro(theme);
  const [editar, setEditar] = useState(false);
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
        {editar ? (
          <div className="flex-1 min-w-0 flex items-center gap-2 py-1">
            <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: p.cor || '#64748b' }} />
            <input autoFocus defaultValue={p.nome} onFocus={e => e.target.select()} aria-label="Nome da pasta"
              onBlur={e => { setEditar(false); const v = e.target.value.trim(); if (v && v !== p.nome && onRenomear) onRenomear(p.id, v); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setEditar(false); } }}
              className={`flex-1 min-w-0 h-7 px-1.5 rounded-md text-sm outline-none ring-2 ring-blue-500 ${claro ? 'bg-white' : 'bg-slate-800'}`} />
          </div>
        ) : (
          <button type="button" onClick={() => setSel({ tipo: 'pasta', id: p.id })} onDoubleClick={() => onRenomear && setEditar(true)} className="flex-1 min-w-0 flex items-start gap-2 py-1.5 text-left">
            <span className="w-2.5 h-2.5 mt-[5px] rounded-[3px] flex-shrink-0" style={{ background: p.cor || '#64748b' }} />
            <span className="break-words leading-snug">{p.nome}</span>
          </button>
        )}
        {onRenomear && !editar && (
          <button type="button" onClick={() => setEditar(true)} title="Mudar o nome" aria-label={`Mudar o nome de ${p.nome}`}
            className={`w-5 h-5 inline-flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus:opacity-100 ${claro ? 'text-slate-400 hover:text-blue-600' : 'text-slate-500 hover:text-blue-400'}`}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13l-3 1 1-3 8.5-8.5z" strokeLinejoin="round" /></svg>
          </button>
        )}
        <button type="button" onClick={() => onSub(p)} title="Nova subpasta" aria-label={`Nova subpasta em ${p.nome}`}
          className={`w-5 h-5 inline-flex items-center justify-center rounded text-[15px] leading-none opacity-0 group-hover:opacity-100 ${claro ? 'text-slate-400 hover:text-blue-600' : 'text-slate-500 hover:text-blue-400'}`}>+</button>
        <button type="button" onClick={() => onFav(p.id)} title={fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'} aria-label={fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'}
          className={`w-5 h-5 inline-flex items-center justify-center rounded text-[13px] leading-none ${fav ? 'text-amber-400' : `opacity-0 group-hover:opacity-100 ${claro ? 'text-slate-400 hover:text-amber-500' : 'text-slate-500 hover:text-amber-400'}`}`}>{fav ? '★' : '☆'}</button>
        {n > 0 && <span className={`text-[11px] tabular-nums w-5 text-right ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{n}</span>}
      </div>
      {aberta && filhas.map(f => <NoPasta key={f.id} p={f} trab={trab} nivel={nivel + 1} sel={sel} setSel={setSel} abertas={abertas} alternar={alternar} theme={theme} contar={contar} onFav={onFav} onSub={onSub} onRenomear={onRenomear} />)}
    </div>
  );
};

// ── Visão geral (sem pasta escolhida) ──
// ── Freelancers (a quem subcontratas): dados e tabela de preços de cada um ──
const opFreelancer = (trab, id, patch) => ({ ...trab, freelancers: (trab.freelancers || []).map(f => (f.id === id ? { ...f, ...patch } : f)) });
const opNovoFreelancer = (trab, nome, extra = {}) => ({ ...trab, freelancers: [...(trab.freelancers || []), { id: trabId() + 'f', nome, estado: 'ativo', precos: {}, criada: agoraIso(), ...extra }] });
// Quanto custa uma tarefa feita por um freelancer, pela tabela dele (null se faltar algum preço)
const custoFreelancer = (f, t) => {
  if (!f) return null;
  const pr = f.precos || {};
  let v = 0, falta = false;
  trabPecas(t).forEach(p => {
    if (p.tipo === 'extra' || p.tipo === 'outro') { if (pr.hora) v += Number(pr.hora) * trabHoras(t); else falta = true; }
    else if (pr[p.tipo] != null && pr[p.tipo] !== '') v += Number(pr[p.tipo]) * p.n; else falta = true;
  });
  return falta ? null : Math.round(v * 100) / 100;
};
const Freelancers = ({ trab, mudar, cu, clientes, ano, theme, inputClass, abrirId, onVer }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [nome, setNome] = useState('');
  const [aberto, setAberto] = useState(abrirId || null);
  const lista = (trab.freelancers || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
  const tipos = [...tiposDe(cu), { id: 'hora', nome: 'Hora' }];
  const ic = `${inputClass} text-sm py-1.5`;
  const stats = f => {
    const ts = tarefasDoFreelancer(trab, f);
    const doAno = ts.filter(t => trabEntrega(t).startsWith(`${ano}-`));
    const pago = doAno.reduce((a, t) => a + (Number(t.custoOutsourcing) || 0), 0);
    const faturado = doAno.reduce((a, t) => a + trabValor(t, cu, clientes), 0);
    return { n: ts.length, nAno: doAno.length, pago, margem: faturado - pago };
  };
  return (
    <div className="space-y-3">
      <div className={`flex flex-wrap items-center gap-2 text-xs ${sub}`}>
        <span>Emails aos freelancers saem da conta</span>
        <TxtIn type="email" valor={trab.contaEmailFree} onGravar={v => mudar(tr => ({ ...tr, contaEmailFree: v }))} placeholder="o-teu@gmail.com" className={`${inputClass} !w-60 text-sm py-1.5`} />
        <span className="text-[11px]">(o Gmail abre com esta conta — tem de ter sessão iniciada neste browser)</span>
      </div>
      <form onSubmit={e => { e.preventDefault(); if (nome.trim()) { mudar(tr => opNovoFreelancer(tr, nome.trim())); setNome(''); } }} className="flex flex-wrap gap-2">
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do freelancer" className={`${inputClass} !w-56 text-sm py-1.5`} />
        <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">+ Freelancer</button>
      </form>
      {!lista.length && <p className={`text-sm ${sub}`}>Ainda não tens freelancers. Junta-os aqui com a tabela de preços deles: quando escolheres um freelancer numa tarefa, o custo calcula-se sozinho.</p>}
      <div className="space-y-2">
        {lista.map(f => {
          const st = stats(f);
          const set = patch => mudar(tr => opFreelancer(tr, f.id, patch));
          const pr = f.precos || {};
          const setPreco = (tipo, v) => { const p = { ...pr }; if (v == null) delete p[tipo]; else p[tipo] = v; set({ precos: p }); };
          const ab = aberto === f.id;
          return (
            <div key={f.id} className={`rounded-xl border ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'} ${f.estado === 'antigo' ? 'opacity-60' : ''}`}>
              <div className="flex items-center">
              <button type="button" onClick={() => setAberto(ab ? null : f.id)} className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left">
                <span className={`text-[10px] ${sub} transition-transform`} style={{ transform: ab ? 'rotate(90deg)' : 'none' }}>▶</span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corFreelancer(f) }} />
                <span className="font-semibold text-sm">{f.nome}</span>
                <span className={`text-xs ${sub}`}>{tipos.filter(x => pr[x.id] != null && pr[x.id] !== '').slice(0, 4).map(x => `${x.curto || x.nome} ${eur(pr[x.id])}${x.id === 'hora' ? '/h' : ''}`).join(' · ') || 'sem preços'}</span>
                <span className="flex-1" />
                <span className={`text-xs ${sub}`}>{st.nAno} tarefa{st.nAno === 1 ? '' : 's'} em {ano} · pago <strong className="text-red-400">{eur(st.pago)}</strong>{st.nAno ? <> · margem <strong className={st.margem >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}>{eur(st.margem)}</strong></> : null}</span>
              </button>
              {onVer && <button type="button" onClick={() => onVer(f.id)} className="shrink-0 mr-2 px-2.5 py-1 text-xs rounded-lg text-blue-400 hover:bg-blue-500/10">Tarefas →</button>}
              </div>
              {ab && (
                <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 px-3 pb-3 pt-1 border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
                    <Campo rot="Nome"><TxtIn valor={f.nome} onGravar={v => v && set({ nome: v })} className={ic} /></Campo>
                    <Campo rot="Email"><TxtIn type="email" valor={f.email} onGravar={v => set({ email: v })} placeholder="nome@…" className={ic} /></Campo>
                    <Campo rot="NIF / VAT"><TxtIn valor={f.nif} onGravar={v => set({ nif: v })} className={ic} /></Campo>
                    <Campo rot="IBAN"><TxtIn valor={f.iban} onGravar={v => set({ iban: v })} placeholder="PT50…" className={ic} /></Campo>
                    <Campo rot="Faz (ex.: vídeo, 3D, banners)" largo><TxtIn valor={f.faz} onGravar={v => set({ faz: v })} className={ic} /></Campo>
                    <Campo rot="Notas" largo><TxtIn valor={f.notas} onGravar={v => set({ notas: v })} placeholder="prazos, como prefere receber briefings…" className={ic} /></Campo>
                    <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                      <span className={`text-xs mr-1 ${sub}`}>Cor</span>
                      {FREE_CORES.map(c => <button key={c} type="button" onClick={() => set({ cor: c })} aria-label={`Cor ${c}`} className={`w-5 h-5 rounded-full ${corFreelancer(f) === c ? 'ring-2 ring-offset-2 ' + (claro ? 'ring-slate-400 ring-offset-white' : 'ring-white/70 ring-offset-slate-900') : ''}`} style={{ background: c }} />)}
                    </div>
                    <div className="flex items-center gap-3 sm:col-span-2">
                      {[['ativo', 'Ativo'], ['antigo', 'Já não trabalha comigo']].map(([k, n]) => <button key={k} type="button" onClick={() => set({ estado: k })} className={`px-2.5 py-1 rounded-full text-xs border ${(f.estado || 'ativo') === k ? 'border-blue-400 bg-blue-500/15 text-blue-400' : claro ? 'border-slate-200 text-slate-600' : 'border-slate-700 text-slate-300'}`}>{n}</button>)}
                      <span className="flex-1" />
                      <button type="button" onClick={async () => { if (await confirmar(`Apagar "${f.nome}"? As tarefas onde aparece ficam como estão.`)) mudar(tr => ({ ...tr, freelancers: (tr.freelancers || []).filter(x => x.id !== f.id), tarefas: (tr.tarefas || []).map(x => (x.freelancerId === f.id ? { ...x, freelancerId: null, outsourcing: x.outsourcing || f.nome } : x)) })); }} className="text-xs text-red-400 hover:text-red-300">Apagar</button>
                    </div>
                  </div>
                  <div>
                    <p className={`text-xs mb-1.5 ${sub}`}>Quanto lhe pagas por cada tipo</p>
                    <div className={`rounded-lg border ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}>
                      {tipos.map(x => (
                        <div key={x.id} className={`grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2 px-2 py-1 border-b last:border-b-0 ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
                          <span className={`text-sm ${pr[x.id] != null ? '' : sub}`}>{x.curto || x.nome}{x.id === 'hora' ? ' (€/h)' : ''}</span>
                          <NumIn valor={pr[x.id] ?? null} placeholder="—" onGravar={v => setPreco(x.id, v)} className={`${inputClass} !w-full text-sm py-1 text-right tabular-nums`} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className={`text-[11px] ${sub}`}>O NIF e o IBAN ficam só na app — não vão no resumo do chat.</p>
    </div>
  );
};

// ── Estatísticas de um freelancer (na página dele) ──
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const EstatFreelancer = ({ tarefas, trab, cu, clientes, ano, claro }) => {
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const forte = claro ? 'text-slate-800' : 'text-slate-100';
  const cartao = `rounded-xl border p-3 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`;
  const entregues = tarefas.filter(t => trabEntrega(t));
  const doAno = entregues.filter(t => trabEntrega(t).startsWith(`${ano}-`));
  const custo = t => Number(t.custoOutsourcing) || 0;
  const pago = doAno.reduce((a, t) => a + custo(t), 0);
  const faturado = doAno.reduce((a, t) => a + trabValor(t, cu, clientes), 0);
  const margem = faturado - pago;
  // A tempo: entregue (review/feito) até ao prazo
  const comPrazo = entregues.filter(t => t.prazo);
  const aTempo = comPrazo.filter(t => trabEntrega(t) <= t.prazo).length;
  // Dias desde que a tarefa foi criada até ir para review
  const dias = entregues.map(t => { const a = Date.parse(t.criada), b = Date.parse(t.review || t.feita); return a && b && b >= a ? (b - a) / 86400000 : null; }).filter(x => x != null);
  const mediaDias = dias.length ? dias.reduce((a, x) => a + x, 0) / dias.length : null;
  const porMes = MESES_CURTOS.map((m, i) => { const k = `${ano}-${String(i + 1).padStart(2, '0')}`; const ts = doAno.filter(t => trabEntrega(t).startsWith(k)); const pg = ts.reduce((a, t) => a + custo(t), 0); return { m, n: ts.length, pago: pg, margem: ts.reduce((a, t) => a + trabValor(t, cu, clientes), 0) - pg }; });
  const maxMes = Math.max(1, ...porMes.map(x => x.pago + Math.max(0, x.margem)));
  const agrupar = chave => { const o = {}; entregues.forEach(t => { const k = chave(t) || '—'; const x = o[k] || (o[k] = { k, n: 0, pago: 0, fat: 0 }); x.n++; x.pago += custo(t); x.fat += trabValor(t, cu, clientes); }); return Object.values(o).sort((a, b) => b.n - a.n).slice(0, 8); };
  const porTipo = agrupar(t => etiquetaTipo(t, cu));
  const porJogo = agrupar(t => { const j = jogoDaTarefa(trab, t); return j ? j.nome : ''; });
  const kpi = (rot, val, extra, cor) => (
    <div className={cartao}>
      <p className={`text-[11px] ${sub}`}>{rot}</p>
      <p className={`text-lg font-semibold tabular-nums ${cor || forte}`}>{val}</p>
      {extra && <p className={`text-[11px] ${sub}`}>{extra}</p>}
    </div>
  );
  const lista = (titulo, linhas) => (
    <div className={cartao}>
      <p className="text-sm font-medium mb-2">{titulo}</p>
      {!linhas.length ? <p className={`text-xs ${sub}`}>Ainda sem entregas.</p> : (
        <div className="space-y-1">
          {linhas.map(x => (
            <div key={x.k} className="grid grid-cols-[minmax(0,1fr)_36px_72px_64px] items-center gap-2 text-xs">
              <span className="truncate" title={x.k}>{x.k}</span>
              <span className={`text-right tabular-nums ${sub}`}>{x.n}×</span>
              <span className="text-right tabular-nums text-red-400" title="Pago">{eur(x.pago)}</span>
              <span className={`text-right tabular-nums ${x.fat - x.pago >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}`} title="Margem">{x.fat ? `${Math.round((x.fat - x.pago) / x.fat * 100)}%` : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi(`Entregues em ${ano}`, doAno.length, `${entregues.length} no total`)}
        {kpi(`Pago em ${ano}`, eur(pago), doAno.length ? `média ${eur(pago / doAno.length)} por tarefa` : null, 'text-red-400')}
        {kpi(`Margem em ${ano}`, eur(margem), faturado ? `${Math.round(margem / faturado * 100)}% do que faturaste` : null, margem >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400')}
        {kpi('Entregas a tempo', comPrazo.length ? `${Math.round(aTempo / comPrazo.length * 100)}%` : '—', `${comPrazo.length ? `${aTempo} de ${comPrazo.length} com prazo` : 'sem prazos'}${mediaDias != null ? ` · ${mediaDias < 1 ? '<1' : Math.round(mediaDias)} dia${Math.round(mediaDias) === 1 ? '' : 's'} em média` : ''}`)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className={cartao}>
          <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium">Por mês ({ano})</p><span className={`text-[11px] ${sub}`}><span className="inline-block w-2 h-2 rounded-sm bg-red-400/80 mr-1" />pago <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/80 ml-2 mr-1" />margem</span></div>
          <div className="flex items-stretch gap-1 h-28">
            {porMes.map(x => (
              <div key={x.m} className="flex-1 h-full flex flex-col items-center gap-1 min-w-0" title={`${x.m}: ${x.n} tarefa${x.n === 1 ? '' : 's'} · pago ${eur(x.pago)} · margem ${eur(x.margem)}`}>
                <div className="w-full flex-1 min-h-0 flex flex-col justify-end">
                  {x.margem > 0 && <div className="w-full rounded-t-sm bg-emerald-500/80" style={{ height: `${x.margem / maxMes * 100}%` }} />}
                  {x.pago > 0 && <div className={`w-full bg-red-400/80 ${x.margem > 0 ? '' : 'rounded-t-sm'}`} style={{ height: `${x.pago / maxMes * 100}%` }} />}
                </div>
                <span className={`text-[10px] ${x.n ? forte : sub}`}>{x.m}</span>
              </div>
            ))}
          </div>
        </div>
        {lista('Por tipo', porTipo)}
        {lista('Por jogo', porJogo)}
      </div>
    </div>
  );
};

// ── Nomes dos ficheiros: JOGO_TIPO_CONCEITO_V4_VARIAÇÃO_4X5_59S_071026 ──
const TIPO_FICHEIRO = { video: 'VID', variacao: 'VID', iteracao: 'VID', hook: 'VID', aso: 'VID', ai_clip: 'VID', video3d: 'VID', banner: 'BAN', banner_var: 'BAN', icone: 'ICO', feature: 'FG', screenshots: 'SS' };
const slugF = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const iniciaisJogo = nome => tokensJ(nome).map(w => w[0]).join('').toUpperCase().slice(0, 4);
// Nome da tarefa = "1x Variation - Conceito" (o início sai do tipo escolhido em Valor; tu escreves só o conceito)
const ehRotuloTipo = (txt, cu) => {
  const x = String(txt || '').trim().toLowerCase();
  if (!x) return false;
  if (/^(extra|idea|ideation|ideia|ideação)\b/.test(x)) return true;
  const ts = tiposDe(cu);
  return [...Object.values(CU_NOMES_EN).flat(), ...ts.map(t => t.nome), ...ts.map(t => t.curto)].some(n => n && n.toLowerCase() === x);
};
const conceitoDoNome = (nome, cu) => {
  let s = String(nome || '').trim();
  s = s.replace(/\s\+\s*\d+\s*x\s[^+]*?(?=\s[-–—]\s|\s\+\s|$)/gi, ''); // " + 1x Iteration"
  const m = /^(\d+\s*x\s+)?(.*?)\s[-–—]\s([\s\S]*)$/i.exec(s);
  if (m && (m[1] || ehRotuloTipo(m[2], cu))) return m[3].trim();
  if (/^\d+\s*x\s/i.test(s) || ehRotuloTipo(s, cu)) return '';
  return s;
};
const prefixoDoTipo = (pecas, cu) => {
  const ordem = tiposDe(cu, pecas).map(t => t.id);
  const ents = Object.entries(pecas || {}).filter(([, n]) => Number(n) > 0).sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]));
  if (ents.some(([k]) => k === 'extra')) return 'Extra work';
  return ents.filter(([k]) => k !== 'outro').map(([k, n]) => `${n}x ${nomeTipoEN(k, Number(n), cu)}`).join(' + ');
};
const nomeComTipo = (pecas, conceito, cu) => [prefixoDoTipo(pecas, cu), String(conceito || '').trim()].filter(Boolean).join(' - ');
const contarPecas = lista => { const o = {}; lista.forEach(p => { if (p.n > 0) o[p.tipo] = (o[p.tipo] || 0) + p.n; }); return o; };
const mesmasPecas = (a, b) => { const k = o => JSON.stringify(Object.keys(o).filter(x => o[x] > 0).sort().map(x => [x, Number(o[x])])); return k(a) === k(b); };
const jogoDaTarefa = (trab, t) => {
  const p = (trab.pastas || []).find(x => x.id === t.pastaId);
  if (!p) return null;
  return (trab.jogos || []).find(j => j.id === p.jogoId) || acharJogo(trab.jogos, t.cid, jogoDoNome(p.nome)) || { nome: jogoDoNome(p.nome), semJogo: true };
};
// Variação e duração são de cada versão (a V2 pode ter variação e a V1 não): ficam em ficheiros.porVersao[n]
const CAMPOS_VERSAO = ['variacao', 'duracao'];
const versaoDaPasta = d => Number((d && (d.versao || (/_V(\d+)(?:_|$)/.exec(String(d.pasta || '')) || [])[1])) || 0);
// Variação de uma versão já enviada, lida do nome da pasta no Drive (CONCEITO_V1_VARIAÇÃO) — para tarefas antigas
const variacaoEnviada = (t, v) => {
  if (!t || !t.drive) return undefined;
  const d = [t.drive, ...(t.drive.anteriores || [])].find(x => x && versaoDaPasta(x) === Number(v));
  if (!d || !d.pasta) return undefined;
  const m = new RegExp(`_V${Number(v)}(?:_(.+))?$`).exec(String(d.pasta));
  return m ? (m[1] || '') : undefined;
};
const campoVersao = (fx, v, k, t) => {
  const pv = fx && fx.porVersao && fx.porVersao[String(v)];
  if (pv && pv[k] !== undefined) return pv[k];
  if (k === 'variacao') { const e = variacaoEnviada(t, v); if (e !== undefined) return e; }
  return (fx || {})[k];
};
const versoesEnviadas = t => [...new Set([t.drive, ...((t.drive && t.drive.anteriores) || [])].filter(Boolean).map(versaoDaPasta).filter(n => n > 0))].sort((a, b) => a - b);
// Mudar um campo de uma versão sem mexer nas versões já enviadas (que ficam com o valor que tinham)
const fxComVersao = (fx, t, v, patch) => {
  const pv = { ...(fx.porVersao || {}) };
  const vs = String(v);
  Object.keys(patch).forEach(k => {
    if (!CAMPOS_VERSAO.includes(k)) return;
    versoesEnviadas(t).forEach(n => { const s = String(n); if (s !== vs && !(pv[s] && pv[s][k] !== undefined)) pv[s] = { ...(pv[s] || {}), [k]: campoVersao(fx, s, k, t) ?? '' }; });
    pv[vs] = { ...(pv[vs] || {}), [k]: patch[k] ?? '' };
  });
  return { ...fx, ...patch, porVersao: pv };
};
// Versões deste conceito já usadas por OUTRAS tarefas do mesmo jogo (enviadas ou já com versão escrita) — nunca se repete conceito + versão
const tipoFicheiro = t => { const fx = t.ficheiros || {}; const tipoP = trabPecas(t).find(p => p.tipo !== 'extra' && p.tipo !== 'outro'); return slugF(fx.tipo) || (tipoP ? (TIPO_FICHEIRO[tipoP.tipo] || slugF(tipoP.tipo).slice(0, 3)) : 'VID'); };
const versoesDeOutras = (trab, t, conceitoSlug) => {
  const j = jogoDaTarefa(trab, t);
  if (!j || !conceitoSlug) return [];
  const tipo = tipoFicheiro(t); // vídeos e banners têm nomes diferentes (VID / BAN…), por isso contam à parte
  const out = new Set();
  (trab.tarefas || []).forEach(x => {
    if (x.id === t.id) return;
    const jx = jogoDaTarefa(trab, x);
    if (!jx || (j.id ? jx.id !== j.id : slugF(jx.nome) !== slugF(j.nome))) return;
    const fx = x.ficheiros || {};
    if (slugF(fx.conceito || conceitoDoNome(x.nome)) !== conceitoSlug || tipoFicheiro(x) !== tipo) return;
    versoesEnviadas(x).forEach(n => out.add(n));
    if (Number(fx.versao) > 0) out.add(Number(fx.versao));
  });
  return [...out].sort((a, b) => a - b);
};
const nomesFicheiros = (trab, t, vForcada) => {
  const fx = t.ficheiros || {};
  const jogo = jogoDaTarefa(trab, t);
  const cod = slugF((jogo && jogo.codigo) || (jogo ? iniciaisJogo(jogo.nome) : '')) || 'JOGO';
  const tipoP = trabPecas(t).find(p => p.tipo !== 'extra' && p.tipo !== 'outro');
  const tipo = tipoFicheiro(t);
  const conceito = slugF(fx.conceito || conceitoDoNome(t.nome));
  const vNum = String(vForcada || fx.versao || (t.drive && (/_V(\d+)(?:_|$)/.exec(String(t.drive.pasta || '')) || [])[1]) || (() => { const o = versoesDeOutras(trab, t, conceito); return o.length ? Math.max(...o) + 1 : 1; })()).replace(/^v/i, ''); // sem versão: a seguinte às das outras tarefas deste conceito (ou V1)
  const versao = `V${vNum}`; // sem versão: V1
  const variacao = slugF(campoVersao(fx, vNum, 'variacao', t));
  const duracaoV = campoVersao(fx, vNum, 'duracao');
  const dia = fx.data || trabDia(new Date().toISOString()); // a data do nome é a do dia do export, a não ser que escolhas outra
  const ddmmyy = dia ? `${dia.slice(8, 10)}${dia.slice(5, 7)}${dia.slice(2, 4)}` : '';
  const dur = duracaoV ? `${Math.round(Number(duracaoV))}S` : '';
  const base = [conceito, versao, variacao].filter(Boolean).join('_');
  const formatos = (t.formatos && t.formatos.length ? t.formatos : []);
  return {
    jogo, cod, tipo, conceito, dia, base, ddmmyy, dur, vNum,
    pasta: conceito ? `${conceito} / ${base}` : '',
    ficheiros: formatos.map(f => ({ formato: f, nome: [cod, tipo, base, f.replace(':', 'X'), dur, ddmmyy].filter(Boolean).join('_') })),
  };
};
// "Abrir no After Effects": link aeproj:// tratado pelo lançador AbrirAE instalado no PC (procura o .aep pelo conceito,
// também no disco de arquivo, e lembra-se do projeto escolhido para cada tarefa)
const temaApp = () => { try { return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro'; } catch (e) { return 'escuro'; } };
const linkAE = (trab, t, clientes) => {
  const nf = nomesFicheiros(trab, t);
  const cli = (clientes || []).find(c => String(c.id) === String(t.cid));
  // só a versão que tu escolheste (ou a da pasta enviada para o Drive) — sem isso não desempata por versão
  const v = String((t.ficheiros && t.ficheiros.versao) || (/_V(\d+)(?:_|$)/.exec(String((t.drive && t.drive.pasta) || '')) || [])[1] || '').replace(/^v/i, '');
  const p = new URLSearchParams({ id: String(t.id), cliente: (cli && cli.nome) || '', jogo: (nf.jogo && nf.jogo.nome) || '', conceito: nf.conceito || '', versao: v ? `V${v}` : '', ...(t.pastaPC ? { pc: '1' } : {}), estado: t.estado || 'todo', tema: temaApp() }); // pc=1: a pasta foi criada pela app (o lançador procura-a pela marca da tarefa)
  return `aeproj://abrir/?${p.toString()}`;
};
// "Mudar o nome no PC": o lançador muda a pasta do projeto, o .aep mais recente e o collect da @Source para este nome
// Leva o nome de um export desta tarefa: o lançador encontra a pasta do projeto pela @Exports onde ele está (é a certa, mesmo com projetos parecidos)
const exportDaTarefa = t => { const vs = versoesDrive(t.drive).slice().sort((x, y) => String(y.em || '').localeCompare(String(x.em || ''))); const e = vs.map(d => (d.enviados || [])[0]).find(Boolean); return e ? e.nome : ''; };
const linkAERenomear = (trab, t, clientes, novo, ficheiro) => { const f = ficheiro || exportDaTarefa(t); return linkAE(trab, t, clientes).replace('aeproj://abrir/?', 'aeproj://renomear/?') + `&novo=${encodeURIComponent(novo)}${f ? `&ficheiro=${encodeURIComponent(f)}` : ''}`; };
// "Criar pastas no PC": o lançador cria a pasta do projeto (cliente › jogo › ano › Videos) com a tua estrutura e fixa-a no Acesso rápido
const ESTRUTURA_PROJETO = ['@Exports', 'Assets/Audio/VO', 'Assets/Audio/Music', 'Assets/Audio/Sfx', 'Assets/Footage', 'Assets/Images', 'Assets/Refs', 'Projects/AE', 'Projects/PRE'];
// Pastas dentro do projeto do After Effects (painel do projeto), criado na versão mais recente que tiveres instalada
const ESTRUTURA_AE = ['00.MASTERCOMPS', '01.PRECOMPS', '02.ASSETS/AUDIO/MUSIC', '02.ASSETS/AUDIO/SFX', '02.ASSETS/AUDIO/VO', '02.ASSETS/FOOTAGE', '02.ASSETS/IMAGES', '02.ASSETS/PSD+AI', '03.AE'];
const linkAECriar = (trab, t, clientes) => {
  const p = new URLSearchParams(linkAE(trab, t, clientes).replace(/^aeproj:\/\/abrir\/\?/, ''));
  const nf = nomesFicheiros(trab, t);
  const nome = nomeProjetoTarefa(trab, t) || palavrasTitulo(String(conceitoDoNome(t.nome, TRAB_ATUAL.cu) || t.nome || '').split(/\s[-–—]\s/)[0]);
  p.set('novo', String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const anoP = (caminho(trab, t.pastaId).find(x => /^\s*\d{4}\s*$/.test(x.nome)) || {}).nome; // o ano da pasta da tarefa na app (2026 / Outubro / …)
  p.set('ano', String(anoP ? anoP.trim() : new Date(t.criada || Date.now()).getFullYear()));
  p.set('sub', ['BAN', 'ICO', 'FG', 'SS'].includes(nf.tipo) ? 'Statics' : 'Videos');
  p.set('estrutura', ESTRUTURA_PROJETO.join('|'));
  p.set('ae', '1');
  p.set('pastasAE', ESTRUTURA_AE.join('|'));
  p.set('estado', t.estado || 'todo'); // a pasta fica logo com a cor do estado
  return `aeproj://criar/?${p.toString()}`;
};
// Cor da pasta no PC pelo estado da tarefa (e "Feito" tira-a do Acesso rápido): só no Windows e só se a pasta foi criada pela app.
// É chamado no próprio clique (o Chrome só abre links aeproj:// a partir de um clique).
const ehWindows = () => typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent || '');
const avisarEstadoPC = (t, estado) => {
  if (!t || !estado || estado === t.estado || !ehWindows() || !TRAB_ATUAL.trab || !nomeProjetoTarefa(TRAB_ATUAL.trab, t)) return; // sem pasta no PC, o lançador não faz nada
  try {
    const p = new URLSearchParams(linkAECriar(TRAB_ATUAL.trab, t, TRAB_ATUAL.clientes).replace(/^aeproj:\/\/criar\/\?/, ''));
    ['estrutura', 'pastasAE', 'ae'].forEach(k => p.delete(k));
    p.set('estado', estado); p.set('antes', t.estado || 'todo');
    const a = document.createElement('a'); a.href = `aeproj://estado/?${p.toString()}`; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { /* sem lançador: não faz mal */ }
};
// "Abrir no After Effects": leva também o nome e o sítio da pasta do projeto, para o lançador ir primeiro à pasta exata da tarefa
const linkAEAbrir = (trab, t, clientes) => { const p = new URLSearchParams(linkAECriar(trab, t, clientes).replace(/^aeproj:\/\/criar\/\?/, '')); p.delete('estrutura'); return `aeproj://abrir/?${p.toString()}`; };
// "Abrir pasta": abre a pasta do projeto no Explorador (se não existir, o lançador pergunta se a cria)
const linkAEPasta = (trab, t, clientes) => linkAECriar(trab, t, clientes).replace(/^aeproj:\/\/criar\//, 'aeproj://pasta/');
const nomeProjetoTarefa = (trab, t) => {
  const nf = nomesFicheiros(trab, t);
  if (!nf.conceito) return '';
  const vs = [...versoesEnviadas(t), Number((t.ficheiros && t.ficheiros.versao) || 0)].filter(n => n > 0);
  return nomePastaProjeto(nf.conceito, vs, v => campoVersao(t.ficheiros, v, 'variacao', t));
};
const copiar = txt => {
  try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(txt); return; } } catch (e) { /* tenta o método antigo */ }
  try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch (e) { /* sem acesso à área de transferência */ }
};
// ── Enviar os exports para o Google Drive do cliente (com a conta Google desse cliente) ──
// Login pela Google (só pede autorização para o Drive); os ficheiros vão direto do computador para o Drive,
// para a pasta CONCEITO / CONCEITO_V2_VARIAÇÃO dentro da pasta do jogo, já com o nome certo.
const GOOGLE_CLIENT_ID_T = '1001287643592-cjgh7ng34pql5asln7qca0n52rvhp90t.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRV = 'https://www.googleapis.com/drive/v3/files';
// O acesso da Google dura 1 hora: fica guardado no browser (sobrevive a recarregar a página e a outras tabs)
// e, depois da 1.ª autorização, renovar já não pede para escolher a conta.
const LS_TOK = 'drive-tokens';
const LS_OK = 'drive-autorizado';
const tokensDrive = (() => { try { const o = JSON.parse(localStorage.getItem(LS_TOK) || '{}'); Object.keys(o).forEach(k => { if (!(o[k] && o[k].exp > Date.now() + 60000)) delete o[k]; }); return o; } catch (e) { return {}; } })();
const guardarTokens = () => { try { localStorage.setItem(LS_TOK, JSON.stringify(tokensDrive)); } catch (e) { /* sem localStorage */ } };
const jaAutorizou = k => { try { return (JSON.parse(localStorage.getItem(LS_OK) || '[]')).includes(k); } catch (e) { return false; } };
const marcarAutorizou = k => { try { const l = JSON.parse(localStorage.getItem(LS_OK) || '[]'); if (!l.includes(k)) localStorage.setItem(LS_OK, JSON.stringify([...l, k])); } catch (e) { /* */ } };
const tokenGuardadoDe = email => { const c = tokensDrive[email || '_']; return c && c.exp > Date.now() + 60000 ? c.t : null; };
const carregarGis = () => new Promise((ok, falha) => {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) { ok(); return; }
  if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; document.head.appendChild(s); }
  const t0 = Date.now();
  const i = setInterval(() => { if (window.google && window.google.accounts && window.google.accounts.oauth2) { clearInterval(i); ok(); } else if (Date.now() - t0 > 12000) { clearInterval(i); falha(new Error('Não consegui carregar o login da Google.')); } }, 150);
});
const tokenPopup = (email, forcar = false) => new Promise((ok, falha) => {
  const k = email || '_'; const c = tokensDrive[k];
  if (!forcar && c && c.exp > Date.now() + 60000) { ok(c.t); return; }
  if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) { falha(new Error('O login da Google ainda não carregou. Tenta outra vez.')); return; }
  const cl = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID_T, scope: DRIVE_SCOPE, hint: email || undefined,
    callback: r => { if (r && r.access_token) { tokensDrive[k] = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 }; guardarTokens(); marcarAutorizou(k); ok(r.access_token); } else falha(new Error((r && (r.error_description || r.error)) || 'A Google não deu autorização.')); },
    error_callback: e => falha(new Error(e && e.type === 'popup_closed' ? 'Fechaste a janela do login da Google.' : e && e.type === 'popup_failed_to_open' ? 'O browser bloqueou a janela do login (permite pop-ups para a app).' : 'O login da Google falhou.')),
  });
  cl.requestAccessToken({ prompt: c || jaAutorizou(k) ? '' : 'select_account' });
});
// Ligação permanente (Firebase Function "driveAcesso"): a app pede um acesso novo ao servidor, sem janela da Google
const DRIVE_FN = 'https://us-central1-dashboard-financas-f2b55.cloudfunctions.net/driveAcesso';
const LS_SEMPRE = 'drive-sempre';
const lerSempre = () => { try { return JSON.parse(localStorage.getItem(LS_SEMPRE) || '[]'); } catch (e) { return []; } };
const ligadoSempre = email => lerSempre().includes(String(email || '_').toLowerCase());
const marcarSempre = (emails, sim) => { try { const l = new Set(lerSempre()); emails.filter(Boolean).forEach(e => (sim ? l.add(String(e).toLowerCase()) : l.delete(String(e).toLowerCase()))); localStorage.setItem(LS_SEMPRE, JSON.stringify([...l])); } catch (e) { /* */ } };
// ── Trello (pela Firebase Function "trello": a chave e o token ficam só no servidor) ──
const TRELLO_FN = 'https://us-central1-dashboard-financas-f2b55.cloudfunctions.net/trello';
const chamarTrello = async (acao, dados = {}) => {
  const u = auth && auth.currentUser;
  if (!u) throw new Error('Entra na app primeiro.');
  const idt = await u.getIdToken();
  let r;
  try { r = await fetch(TRELLO_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idt}` }, body: JSON.stringify({ acao, ...dados }) }); }
  catch (e) { throw new Error('Não consegui falar com o servidor da app.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 404 && !(j.error && j.error.codigo) ? 'A função "trello" ainda não está publicada (falta o deploy das functions).' : (j.error && j.error.message) || `Erro ${r.status}`);
  return j;
};
const cacheCartoes = new Map(); // quadro → { em, lista }
// Em que lista do Trello está cada cartão (só para ver — a app não mexe nas listas). Preenchido ao abrir as listas de tarefas.
const TRELLO_ESTADO = { listas: {}, cartaoLista: {}, cartaoQuadro: {} }; // listas: quadro → { idLista: nome }
const cacheListas = new Map(); // quadro → { em }
const listasTrello = async quadro => {
  const c = cacheListas.get(quadro);
  if (c && Date.now() - c.em < 10 * 60000) return TRELLO_ESTADO.listas[quadro] || {};
  const q = await chamarTrello('quadro', { quadro });
  const m = {}; (q.listas || []).forEach(l => { m[l.id] = l.nome; });
  TRELLO_ESTADO.listas[quadro] = m; cacheListas.set(quadro, { em: Date.now() });
  return m;
};
const listaDoCartao = id => { const q = TRELLO_ESTADO.cartaoQuadro[id]; const l = TRELLO_ESTADO.cartaoLista[id]; return q && l ? ((TRELLO_ESTADO.listas[q] || {})[l] || null) : null; };
// Cor da lista: Review → laranja; aprovado/feito → verde; o resto fica azul
const corListaTrello = nome => (!nome ? null : /review|revis/i.test(nome) ? 'review' : /aprov|approv|done|feito|final|complet|publish|live|entreg/i.test(nome) ? 'ok' : null);
const cartoesTrello = async (quadro, fresco = false) => {
  const c = cacheCartoes.get(quadro);
  if (!fresco && c && Date.now() - c.em < 120000) return c.lista;
  const j = await chamarTrello('cartoes', { quadro });
  cacheCartoes.set(quadro, { em: Date.now(), lista: j.cartoes || [] });
  return j.cartoes || [];
};
// Cria o cartão na lista do jogo — mas, se já houver um com o mesmo nome (a Sophie pode tê-lo criado), liga a esse
// O cartão leva sempre o nome do jogo à frente: "Mahjong - 1x Variation - …"
const nomeCartao = (jogo, nome) => {
  const n = String(nome || '').trim(); const j = String((jogo && jogo.nome) || '').trim();
  if (!j || normJ(n).startsWith(normJ(j))) return n;
  return `${j} - ${n}`;
};
// Nome do cartão a partir do ficheiro final: "Jogo - 1x Iteration - Conceito V2 - Variação" (não do nome da tarefa; a V1 não leva versão)
const emTitulo = x => String(x || '').split(/(\s+)/).map(w => (/^\s+$/.test(w) || !w ? w : (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) && w.length <= 4) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
// Nome "Tipo - Conceito [Vn] - Variação" a partir dos campos dos ficheiros (a partir da V2 leva a versão)
const nomeBaseTarefa = (t, vForcada, legivel) => {
  const cu = TRAB_ATUAL.cu;
  const fx = t.ficheiros || {};
  const v = String(vForcada || fx.versao || versaoDaPasta(t.drive) || '1');
  let conceito = String(fx.conceito || conceitoDoNome(t.nome, cu) || '').trim();
  // "UGC_SIGNS" (como está no Drive) → "Ugc Signs" no nome da tarefa
  const doNome = legivel ? String(conceitoDoNome(t.nome, cu) || '').split(/\s[-–—]\s/)[0].replace(/\s+V\d+$/i, '').trim() : '';
  if (legivel && doNome && slugF(doNome) === slugF(conceito)) conceito = doNome; // como já estava escrito na tarefa (ex.: "UGC signs")
  else if (legivel) conceito = /^[A-Z0-9_]+$/.test(conceito) && /_|[A-Z]{2}/.test(conceito) ? conceito.split('_').filter(Boolean).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') : conceito.replace(/_/g, ' ');
  let variacao = String(campoVersao(fx, v, 'variacao', t) || '').trim();
  // Cada palavra com maiúscula ("everyday savings" → "Everyday Savings"); siglas como UGC ficam como estão
  if (legivel) { conceito = emTitulo(conceito); variacao = emTitulo(variacao.replace(/_/g, ' ')); }
  const prefixo = prefixoDoTipo(contarPecas(trabPecas(t)), cu);
  const vN = Number(String(v).replace(/^v/i, '')) || 1;
  return conceito ? [prefixo, vN > 1 ? `${conceito} V${vN}` : conceito, variacao].filter(Boolean).join(' - ') : t.nome;
};
const nomeCartaoTarefa = (jogo, t) => nomeCartao(jogo, nomeBaseTarefa(t, null, true));
const criarCartaoTrello = async (jogo, nomeTarefa) => {
  const nome = nomeCartao(jogo, nomeTarefa);
  if (!jogo || !jogo.trello) throw new Error('Este jogo não tem quadro do Trello.');
  if (!jogo.trelloLista) throw new Error('Escolhe primeiro a lista dos cartões novos no jogo (cliente → Jogos).');
  const n = String(nome || '').trim();
  if (!n) throw new Error('Falta o nome do cartão.');
  const cs = await cartoesTrello(jogo.trello, true);
  const sem = String(nomeTarefa || '').trim().toLowerCase();
  const igual = cs.find(c => c.nome.trim().toLowerCase() === n.toLowerCase()) || cs.find(c => c.nome.trim().toLowerCase() === sem);
  if (igual) return { id: igual.id, url: igual.url, nome: igual.nome, jaExistia: true };
  const c = await chamarTrello('criar', { lista: jogo.trelloLista.id, nome: n });
  cacheCartoes.delete(jogo.trello);
  return { id: c.id, url: c.url, nome: c.nome };
};
// Cartões com nome parecido ao da tarefa (para ligar a um que a Sophie já criou)
const parecidosTrello = (cartoes, nome) => {
  const pal = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !/^\d+x$/.test(w) && !['new', 'video', 'variation', 'iteration', 'the'].includes(w)));
  const a = pal(nome);
  if (!a.size) return [];
  return cartoes.map(c => { const b = pal(c.nome); let k = 0; a.forEach(w => { if (b.has(w)) k++; }); return { ...c, pts: k / a.size }; })
    .filter(c => c.pts >= 0.5).sort((x, y) => y.pts - x.pts).slice(0, 6);
};
const chamarDriveFn = async (acao, dados = {}) => {
  const u = auth && auth.currentUser;
  if (!u) { const e = new Error('Entra na app primeiro.'); e.codigo = 'sessao'; throw e; }
  const idt = await u.getIdToken();
  let r;
  try { r = await fetch(DRIVE_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idt}` }, body: JSON.stringify({ acao, ...dados }) }); }
  catch (e) { const er = new Error('Não consegui falar com o servidor da app.'); er.codigo = 'rede'; throw er; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const er = new Error(r.status === 404 ? 'A função "driveAcesso" ainda não está publicada (falta fazer o deploy das functions).' : (j.error && j.error.message) || `Erro ${r.status}`); er.codigo = r.status === 404 ? 'sem_funcao' : (j.error && j.error.codigo); throw er; }
  return j;
};
let estadoSempre = null;
const sincronizarSempre = () => {
  if (!estadoSempre) estadoSempre = chamarDriveFn('estado').then(j => { const es = (j.contas || []).map(c => String(c.email || '').toLowerCase()).filter(Boolean); const l = lerSempre(); try { localStorage.setItem(LS_SEMPRE, JSON.stringify([...es, ...(es.length && l.includes('_') ? ['_'] : [])])); } catch (e) { /* */ } return es; }).catch(() => null);
  return estadoSempre;
};
const guardarAcesso = (chaves, j) => { chaves.filter(Boolean).forEach(k => { tokensDrive[k] = { t: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 }; }); guardarTokens(); };
const tokenDrive = async (email, forcar = false) => {
  const k = email || '_'; const c = tokensDrive[k];
  if (!forcar && c && c.exp > Date.now() + 60000) return c.t;
  if (ligadoSempre(k)) {
    try { const j = await chamarDriveFn('token', { conta: email || undefined }); guardarAcesso([k, j.email], j); return j.access_token; }
    catch (e) { if (e.codigo === 'religar' || e.codigo === 'sem_ligacao') marcarSempre([k], false); /* sem servidor: usa a janela da Google */ }
  }
  return tokenPopup(email, forcar);
};
const ligarDriveSempre = email => new Promise((ok, falha) => {
  if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) { falha(new Error('O login da Google ainda não carregou. Tenta outra vez.')); return; }
  const cl = window.google.accounts.oauth2.initCodeClient({
    client_id: GOOGLE_CLIENT_ID_T, scope: `openid email ${DRIVE_SCOPE}`, ux_mode: 'popup', login_hint: email || undefined, select_account: !email,
    callback: async r => {
      if (!r || !r.code) { falha(new Error((r && (r.error_description || r.error)) || 'A Google não deu autorização.')); return; }
      try { const j = await chamarDriveFn('ligar', { code: r.code, conta: email || undefined }); guardarAcesso([email || '_', j.email], j); marcarSempre([email || '_', j.email], true); marcarAutorizou(email || '_'); estadoSempre = null; ok(j); }
      catch (e) { falha(e); }
    },
    error_callback: e => falha(new Error(e && e.type === 'popup_closed' ? 'Fechaste a janela da Google.' : e && e.type === 'popup_failed_to_open' ? 'O browser bloqueou a janela da Google (permite pop-ups para a app).' : 'A ligação à Google falhou.')),
  });
  cl.requestCode();
});
// ── Google Tasks (para o "Hey Google"): liga a conta do telemóvel com acesso permanente (pelo mesmo servidor do Drive) ──
const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1/';
const ligarGoogleTasks = () => new Promise((ok, falha) => {
  carregarGis().then(() => {
    const cl = window.google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID_T, scope: `openid email ${DRIVE_SCOPE} ${TASKS_SCOPE}`, ux_mode: 'popup', select_account: true,
      callback: async r => {
        if (!r || !r.code) { falha(new Error((r && (r.error_description || r.error)) || 'A Google não deu autorização.')); return; }
        if (r.scope && !String(r.scope).includes(TASKS_SCOPE)) { falha(new Error('Faltou marcar a caixa do Google Tasks na janela da Google. Tenta outra vez.')); return; }
        try { const j = await chamarDriveFn('ligar', { code: r.code }); guardarAcesso([j.email], j); marcarSempre([j.email], true); estadoSempre = null; ok(j.email); }
        catch (e) { falha(e); }
      },
      error_callback: e => falha(new Error(e && e.type === 'popup_closed' ? 'Fechaste a janela da Google.' : e && e.type === 'popup_failed_to_open' ? 'O browser bloqueou a janela da Google (permite pop-ups para a app).' : 'A ligação à Google falhou.')),
    });
    cl.requestCode();
  }).catch(falha);
});
// Pedido à API do Google Tasks com a conta ligada (se o acesso guardado não tiver o Tasks, pede outro ao servidor)
const pedirTasks = async (conta, caminho, opts = {}) => {
  const vez = async forcar => {
    const tk = await tokenDrive(conta, forcar);
    const r = await fetch(TASKS_API + caminho, { ...opts, headers: { Authorization: `Bearer ${tk}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    return r;
  };
  let r = await vez(false);
  if (r.status === 401 || r.status === 403) r = await vez(true);
  if (!r.ok) {
    let m = `Erro ${r.status} do Google Tasks`;
    try { const j = await r.json(); if (j.error && j.error.message) m = j.error.message; } catch (e) { /* sem JSON */ }
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(m)) m = 'A Google Tasks API ainda não está ligada no Google Cloud (APIs e serviços › Biblioteca › Google Tasks API › Ativar).';
    else if (r.status === 403) m = 'Esta conta não deu acesso ao Google Tasks. Volta a ligar a conta e deixa a caixa do Tasks marcada.';
    throw new Error(m);
  }
  return r.status === 204 ? null : r.json();
};
const desligarDriveSempre = async email => {
  await chamarDriveFn('desligar', { conta: email || '_' });
  marcarSempre([email || '_'], false); delete tokensDrive[email || '_']; guardarTokens(); estadoSempre = null;
};
// Que versões de um conceito já estão no Drive (pastas CONCEITO / CONCEITO_V1, _V2…) e que conceitos há no jogo
const cacheConceitos = {};
const distTxt = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; } } return d[b.length]; };
const conceitoParecido = (x, y) => { const a = slugF(x), b = slugF(y); if (!a || !b) return false; if (a.includes(b) || b.includes(a)) return true; let k = 0; while (k < a.length && a[k] === b[k]) k++; return k >= 5 || distTxt(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 5)); };
const conceitosNoDrive = async (token, raiz, forcar) => {
  const c = cacheConceitos[raiz];
  if (!forcar && c && Date.now() - c.em < 5 * 60000) return c.pastas;
  const fs = await filhosDrive(token, raiz, true);
  cacheConceitos[raiz] = { pastas: fs, em: Date.now() };
  return fs;
};
const versoesNoDrive = async (token, raiz, conceito) => {
  const fs = await conceitosNoDrive(token, raiz, true);
  const pc = fs.find(x => slugF(x.name) === slugF(conceito));
  if (!pc) return { existe: false, versoes: [] };
  const subs = await filhosDrive(token, pc.id, true);
  const re = new RegExp(`^${slugF(conceito)}_V(\\d+)(?:_|$)`);
  const versoes = [...new Set(subs.map(x => { const m = re.exec(slugF(x.name)); return m ? Number(m[1]) : null; }).filter(Boolean))].sort((a, b) => a - b);
  return { existe: true, nome: pc.name, versoes };
};
const driveApi = async (token, url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (!r.ok) { let m = `Erro ${r.status} do Drive`; try { const j = await r.json(); if (j.error && j.error.message) m = j.error.message; } catch (e) { /* sem JSON */ } const er = new Error(m); er.status = r.status; throw er; }
  return r.status === 204 ? null : r.json();
};
const idPastaDrive = url => { const m = /folders\/([A-Za-z0-9_-]{10,})/.exec(String(url || '')) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(String(url || '')); return m ? m[1] : null; };
const filhosDrive = async (token, pai, pastas) => {
  const q = encodeURIComponent(`'${pai}' in parents and trashed=false${pastas ? " and mimeType='application/vnd.google-apps.folder'" : " and mimeType!='application/vnd.google-apps.folder'"}`);
  const j = await driveApi(token, `${DRV}?q=${q}&fields=files(id,name,webViewLink,modifiedTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return j.files || [];
};
// Acha a pasta pelo nome (sem ligar a maiúsculas; a da versão aceita nomes mais compridos, ex.: _MIDDLE_EAST) ou cria-a
const pastaDrive = async (token, pai, nome, aceitarMaisLongo) => {
  const fs = await filhosDrive(token, pai, true);
  const alvo = slugF(nome);
  const f = fs.find(x => slugF(x.name) === alvo) || (aceitarMaisLongo ? fs.find(x => slugF(x.name).startsWith(alvo + '_')) : null);
  if (f) return { ...f, nova: false };
  const c = await driveApi(token, `${DRV}?supportsAllDrives=true&fields=id,name,webViewLink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [pai] }) });
  return { ...c, nova: true };
};
const enviarParaDrive = async (token, { file, nome, pasta, idExistente }, onProg) => {
  const url = idExistente ? `https://www.googleapis.com/upload/drive/v3/files/${idExistente}?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,modifiedTime` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,modifiedTime';
  const tipo = file.type || 'application/octet-stream';
  const r = await fetch(url, { method: idExistente ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipo, 'X-Upload-Content-Length': String(file.size) }, body: JSON.stringify(idExistente ? { name: nome } : { name: nome, parents: [pasta] }) });
  if (!r.ok) { let m = `Erro ${r.status} ao começar o envio`; try { const j = await r.json(); if (j.error && j.error.message) m = j.error.message; } catch (e) { /* sem JSON */ } throw new Error(m); }
  const loc = r.headers.get('Location') || r.headers.get('location');
  if (!loc) throw new Error('O Drive não respondeu com o endereço de envio.');
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open('PUT', loc);
    x.setRequestHeader('Content-Type', tipo);
    x.upload.onprogress = e => { if (e.lengthComputable && onProg) onProg(e.loaded / e.total); };
    x.onload = () => { if (x.status >= 200 && x.status < 300) { try { ok(JSON.parse(x.responseText || '{}')); } catch (e) { ok({}); } } else falha(new Error(`Erro ${x.status} no envio`)); };
    x.onerror = () => falha(new Error('A ligação falhou a meio do envio.'));
    x.send(file);
  });
};
const lerVideo = file => new Promise(ok => {
  if (!/^video\//.test(file.type || '') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) { if (/^image\//.test(file.type || '')) { const im = new Image(); const u = URL.createObjectURL(file); im.onload = () => { ok({ w: im.naturalWidth, h: im.naturalHeight, dur: 0 }); URL.revokeObjectURL(u); }; im.onerror = () => { ok(null); URL.revokeObjectURL(u); }; im.src = u; return; } ok(null); return; }
  const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
  const u = URL.createObjectURL(file); let feito = false;
  const fim = x => { if (feito) return; feito = true; URL.revokeObjectURL(u); ok(x); };
  v.onloadedmetadata = () => fim({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
  v.onerror = () => fim(null);
  setTimeout(() => fim(null), 6000);
  v.src = u;
});
const formatoDoFicheiro = (nome, meta) => {
  const m = /(?:^|[^0-9])(9|1|4|16)\s*[x:×_]\s*(16|1|5|9)(?:[^0-9]|$)/i.exec(String(nome || ''));
  if (m) { const f = `${m[1]}:${m[2]}`; if (FORMATOS.includes(f)) return f; }
  if (meta && meta.w && meta.h) { const r = meta.w / meta.h; return FORMATOS.slice().sort((a, b) => { const [a1, a2] = a.split(':').map(Number), [b1, b2] = b.split(':').map(Number); return Math.abs(a1 / a2 - r) - Math.abs(b1 / b2 - r); })[0]; }
  return null;
};
const copiarComLink = async (texto, url) => {
  try {
    if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      const html = `<a href="${String(url).replace(/"/g, '&quot;')}">${String(texto).replace(/</g, '&lt;')}</a>`;
      await navigator.clipboard.write([new window.ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })]);
      return true;
    }
  } catch (e) { /* tenta só o texto */ }
  copiar(texto); return false;
};
// Junta "NOME com link" na primeira linha vazia da coluna A da tab certa (só Google Sheets; um .xlsx não dá para editar assim)
const juntarNaSpreadsheet = async (token, sheetUrl, nome, link, nomesJogo = []) => {
  const id = (/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(sheetUrl || '')) || [])[1];
  if (!id) return { erro: 'O link da spreadsheet não parece certo.' };
  const gid = Number((/[#&?]gid=(\d+)/.exec(String(sheetUrl)) || [])[1] ?? NaN);
  const meta = await driveApi(token, `${DRV}/${id}?fields=mimeType,name&supportsAllDrives=true`);
  if (meta.mimeType !== 'application/vnd.google-apps.spreadsheet') return { xlsx: true, nomeFicheiro: meta.name };
  const ss = await driveApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title,gridProperties)`);
  const folhas = (ss.sheets || []).map(x => x.properties);
  // A tab do jogo: pelo nome (ex.: "Sniper Creative tracker" para o Sniper Battle); senão a do link (gid)
  const GENERICAS = /^(battle|game|games|the|creative|tracker|mobile|clash|world|super)$/i;
  const palavras = [...new Set(nomesJogo.flatMap(n => String(n || '').split(/[^A-Za-zÀ-ÿ0-9]+/)).filter(w => w.length >= 4 && !GENERICAS.test(w)).map(w => w.toLowerCase()))];
  const peloNome = palavras.length ? folhas.find(x => palavras.some(w => x.title.toLowerCase().includes(w))) : null;
  const f = peloNome || folhas.find(x => x.sheetId === gid) || (folhas.length === 1 ? folhas[0] : null);
  if (!f) return { erro: 'Não sei em que tab escrever — abre a tab do jogo na spreadsheet e copia esse link para o jogo (cliente → Jogos).' };
  const vals = await driveApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${f.title}'!A:A`)}`);
  const linhas = vals.values || [];
  const ja = linhas.findIndex(l => String((l && l[0]) || '').trim().toUpperCase() === String(nome).toUpperCase());
  if (ja >= 0) return { ok: true, linha: ja + 1, tab: f.title, gid: f.sheetId, jaExistia: true };
  const linha = linhas.length; // 0-based: a seguir à última preenchida
  // A linha nova fica igual à de cima (formato e as caixinhas das networks, por marcar) e depois leva o nome com o link
  const nCols = Math.min(26, Number(f.gridProperties && f.gridProperties.columnCount) || 10);
  const copiarDeCima = linha >= 2 ? ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION'].map(pasteType => ({ copyPaste: {
    source: { sheetId: f.sheetId, startRowIndex: linha - 1, endRowIndex: linha, startColumnIndex: 0, endColumnIndex: nCols },
    destination: { sheetId: f.sheetId, startRowIndex: linha, endRowIndex: linha + 1, startColumnIndex: 0, endColumnIndex: nCols }, pasteType } })) : [];
  await driveApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [...copiarDeCima, { updateCells: {
    start: { sheetId: f.sheetId, rowIndex: linha, columnIndex: 0 },
    rows: [{ values: [{ userEnteredValue: { stringValue: nome }, textFormatRuns: [{ startIndex: 0, format: { link: { uri: link } } }] }] }],
    fields: 'userEnteredValue,textFormatRuns',
  } }] }) });
  return { ok: true, linha: linha + 1, tab: f.title, gid: f.sheetId };
};
// Nomes que estão na coluna A de uma tab (nome → n.º da linha), com cache de 1 minuto — para o ícone da spreadsheet acompanhar o que mudas à mão
const cacheFolhas = new Map();
const linhasDaFolha = async (token, sheetUrl, tab, forcar) => {
  const id = (/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(sheetUrl || '')) || [])[1];
  if (!id || !tab) return null;
  const k = `${id}|${tab}`; const c = cacheFolhas.get(k);
  if (!forcar && c && Date.now() - c.em < 60000) return c.nomes;
  const vals = await driveApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A:A`)}`);
  const nomes = new Map(); (vals.values || []).forEach((l, i) => { const n = String((l && l[0]) || '').trim().toUpperCase(); if (n && !nomes.has(n)) nomes.set(n, i + 1); });
  cacheFolhas.set(k, { em: Date.now(), nomes });
  return nomes;
};
// Tira da spreadsheet as linhas com estes nomes (coluna A da tab do jogo) — para refazer pela ordem certa
const tirarDaSpreadsheet = async (token, sheetUrl, nomes, nomesJogo = []) => {
  const id = (/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(sheetUrl || '')) || [])[1];
  if (!id) return { erro: 'O link da spreadsheet não parece certo.' };
  const ss = await driveApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title,gridProperties)`);
  const folhas = (ss.sheets || []).map(x => x.properties);
  const gid = Number((/[#&?]gid=(\d+)/.exec(String(sheetUrl)) || [])[1] ?? NaN);
  const GENERICAS = /^(battle|game|games|the|creative|tracker|mobile|clash|world|super)$/i;
  const palavras = [...new Set(nomesJogo.flatMap(n => String(n || '').split(/[^A-Za-zÀ-ÿ0-9]+/)).filter(w => w.length >= 4 && !GENERICAS.test(w)).map(w => w.toLowerCase()))];
  const f = (palavras.length ? folhas.find(x => palavras.some(w => x.title.toLowerCase().includes(w))) : null) || folhas.find(x => x.sheetId === gid) || (folhas.length === 1 ? folhas[0] : null);
  if (!f) return { erro: 'Não sei qual é a tab deste jogo na spreadsheet.' };
  const vals = await driveApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${f.title}'!A:A`)}`);
  const alvo = new Set(nomes.filter(Boolean).map(n => String(n).trim().toUpperCase()));
  const linhas = (vals.values || []).map((l, i) => (alvo.has(String((l && l[0]) || '').trim().toUpperCase()) ? i : -1)).filter(i => i > 0).sort((a, b) => b - a);
  if (linhas.length) await driveApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: linhas.map(i => ({ deleteDimension: { range: { sheetId: f.sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } })) }) });
  return { ok: true, apagadas: linhas.length, tab: f.title };
};
// Tab do jogo numa spreadsheet: pelo nome (ex.: "Sniper Creative tracker"), senão a do link (gid), senão a única
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const tabDoJogo = (folhas, sheetUrl, nomesJogo) => {
  const gid = Number((/[#&?]gid=(\d+)/.exec(String(sheetUrl || '')) || [])[1] ?? NaN);
  const GENERICAS = /^(battle|game|games|the|creative|tracker|mobile|clash|world|super)$/i;
  const palavras = [...new Set(nomesJogo.flatMap(n => String(n || '').split(/[^A-Za-zÀ-ÿ0-9]+/)).filter(w => w.length >= 4 && !GENERICAS.test(w)).map(w => w.toLowerCase()))];
  return (palavras.length ? folhas.find(x => palavras.some(w => x.title.toLowerCase().includes(w))) : null) || folhas.find(x => x.sheetId === gid) || (folhas.length === 1 ? folhas[0] : null) || folhas[0] || null;
};
// Cria uma spreadsheet nova (Google Sheets, na conta do cliente) com uma tab por jogo.
// Com modelo: copia a tab do tracker de outro jogo (cabeçalho, caixinhas das networks, cores) e tira as linhas antigas.
// Fica na mesma pasta do Drive que a spreadsheet do modelo.
const criarFolhaTracker = async (token, { titulo, jogos, modelo, aviso = () => {} }) => {
  let modeloId = null, modeloTab = null, pasta = null;
  if (modelo && modelo.sheet) {
    modeloId = (/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(modelo.sheet)) || [])[1] || null;
    if (modeloId) {
      aviso(`A ler o tracker do ${modelo.nome}…`);
      const meta = await driveApi(token, `${DRV}/${modeloId}?fields=mimeType,parents&supportsAllDrives=true`);
      if (meta.mimeType !== 'application/vnd.google-apps.spreadsheet') throw new Error(`A spreadsheet do ${modelo.nome} é um ficheiro Excel — escolhe outro modelo (tem de ser Google Sheets).`);
      pasta = (meta.parents || [])[0] || null;
      const ss = await driveApi(token, `${SHEETS}/${modeloId}?fields=sheets.properties(sheetId,title,gridProperties)`);
      modeloTab = tabDoJogo((ss.sheets || []).map(x => x.properties), modelo.sheet, [modelo.nome, modelo.nomeFatura, ...(modelo.aliases || [])]);
    }
  }
  aviso('A criar a spreadsheet…');
  const nova = await driveApi(token, SHEETS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: { title: titulo } }) });
  const id = nova.spreadsheetId;
  const vazia = nova.sheets && nova.sheets[0] && nova.sheets[0].properties.sheetId;
  if (pasta) {
    try {
      const f = await driveApi(token, `${DRV}/${id}?fields=parents&supportsAllDrives=true`);
      await driveApi(token, `${DRV}/${id}?addParents=${pasta}&removeParents=${(f.parents || []).join(',')}&supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (e) { pasta = null; /* fica no "O meu disco" */ }
  }
  const palavraModelo = modelo ? String(modelo.nome || '').split(/\s+/)[0] : '';
  const tabs = [];
  for (const j of jogos) {
    aviso(`A preparar a tab do ${j.nome}… (${tabs.length + 1}/${jogos.length})`);
    let tab;
    if (modeloId && modeloTab) {
      const cp = await driveApi(token, `${SHEETS}/${modeloId}/sheets/${modeloTab.sheetId}:copyTo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationSpreadsheetId: id }) });
      const re = palavraModelo ? new RegExp(palavraModelo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
      const titulo0 = re && re.test(modeloTab.title) ? modeloTab.title.replace(re, j.nome) : `${j.nome} Creative tracker`;
      // Onde acabam os cabeçalhos: a primeira linha com um criativo (nome com link) — senão só a linha 1
      const g = await driveApi(token, `${SHEETS}/${id}?ranges=${encodeURIComponent(`'${cp.title}'!A1:A60`)}&fields=sheets.data.rowData.values(hyperlink,textFormatRuns,formattedValue)`);
      const linhas = ((((g.sheets || [])[0] || {}).data || [])[0] || {}).rowData || [];
      const temLink = c => !!(c && (c.hyperlink || (c.textFormatRuns || []).some(r => r.format && r.format.link)));
      let cab = linhas.findIndex(r => temLink((r.values || [])[0]));
      if (cab < 1) cab = 1;
      const nLin = Number(cp.gridProperties && cp.gridProperties.rowCount) || 1000;
      const nCol = Number(cp.gridProperties && cp.gridProperties.columnCount) || 26;
      await driveApi(token, `${SHEETS}/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [
        { updateSheetProperties: { properties: { sheetId: cp.sheetId, title: titulo0, index: tabs.length }, fields: 'title,index' } },
        ...(nLin > cab ? [{ updateCells: { range: { sheetId: cp.sheetId, startRowIndex: cab, endRowIndex: nLin, startColumnIndex: 0, endColumnIndex: nCol }, fields: 'userEnteredValue,textFormatRuns,note' } }] : []),
      ] }) });
      tab = { sheetId: cp.sheetId, title: titulo0 };
    } else {
      const titulo0 = `${j.nome} Creative tracker`;
      const r = await driveApi(token, `${SHEETS}/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: titulo0, index: tabs.length, gridProperties: { frozenRowCount: 1 } } } }] }) });
      const sid = r.replies[0].addSheet.properties.sheetId;
      await driveApi(token, `${SHEETS}/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [{ updateCells: { start: { sheetId: sid, rowIndex: 0, columnIndex: 0 }, rows: [{ values: ['Creative', 'Notes'].map(v => ({ userEnteredValue: { stringValue: v }, userEnteredFormat: { textFormat: { bold: true } } })) }], fields: 'userEnteredValue,userEnteredFormat.textFormat.bold' } }] }) });
      tab = { sheetId: sid, title: titulo0 };
    }
    tabs.push({ jogoId: j.id, gid: tab.sheetId, tab: tab.title });
  }
  if (vazia != null && tabs.length) await driveApi(token, `${SHEETS}/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: vazia } }] }) });
  return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit`, tabs, naPasta: !!pasta };
};
// Pasta de exports no PC (para mudar o nome dos ficheiros): guardada no browser (IndexedDB) para não perguntar sempre
let usarPastaExports = false;
const idbPastas = () => new Promise((ok, falha) => { const r = indexedDB.open('app-pastas', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); });
const idbLer = async k => { try { const db = await idbPastas(); return await new Promise(ok => { const q = db.transaction('h').objectStore('h').get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } };
const idbGravar = async (k, v) => { try { const db = await idbPastas(); await new Promise(ok => { const tx = db.transaction('h', 'readwrite'); tx.objectStore('h').put(v, k); tx.oncomplete = ok; tx.onerror = ok; }); } catch (e) { /* sem IndexedDB */ } };
// Pastas de exports conhecidas (uma por projeto, ou uma pasta-mãe): a app procura lá dentro e lembra-se
// da subpasta onde encontrou os ficheiros, ligada ao projeto (lista) e ao jogo.
const IGNORAR_PASTAS = /cache|auto-save|autosave|node_modules|^\.|^\$|backup/i;
const pastasConhecidas = async () => { const l = await idbLer('exports-lista'); const v = await idbLer('exports'); return [...(Array.isArray(l) ? l : []), ...(v && !(l || []).length ? [{ dir: v, em: 0 }] : [])]; };
const lembrarPasta = async (dir, chaves) => {
  const l = (await pastasConhecidas()).filter(x => x && x.dir);
  const fora = [];
  for (const x of l) { let igual = false; try { igual = await x.dir.isSameEntry(dir); } catch (e) { /* */ } if (!igual) fora.push(x); }
  await idbGravar('exports-lista', [{ dir, ...chaves, em: Date.now() }, ...fora].slice(0, 40));
};
const permissaoPasta = async (d, pedir) => {
  try {
    let p = await d.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && pedir) p = await d.requestPermission({ mode: 'readwrite' });
    return p === 'granted';
  } catch (e) { return false; }
};
const escolherPastaExports = async inicio => {
  if (!window.showDirectoryPicker) throw new Error('este browser não deixa (usa o Chrome)');
  const o = { id: 'exports', mode: 'readwrite' };
  if (inicio) o.startIn = inicio;
  try { return await window.showDirectoryPicker(o); } catch (e) { if (inicio && e && e.name === 'TypeError') return window.showDirectoryPicker({ id: 'exports', mode: 'readwrite' }); throw e; }
};
// Procura o ficheiro (o mesmo, não só o mesmo nome) dentro da pasta e subpastas (até 5 níveis) e muda-lhe o nome
const procurarNaPasta = async (raiz, h) => {
  const fila = [[raiz, 0]]; let vistos = 0;
  while (fila.length && vistos < 4000) {
    const [dir, nivel] = fila.shift(); vistos++;
    const subs = [];
    try {
      for await (const [nome, e] of dir.entries()) {
        if (e.kind === 'file') { if (e.name === h.name || nome === h.name) { if (await e.isSameEntry(h)) return { dir, nome }; } }
        else if (nivel < 5 && !IGNORAR_PASTAS.test(nome)) subs.push(e);
      }
    } catch (e) { /* pasta sem acesso */ }
    subs.forEach(d => fila.push([d, nivel + 1]));
  }
  return null;
};
// NUNCA escreve por cima de outro ficheiro: se o nome novo já existir na pasta, pára e avisa.
// Só apaga o original depois de confirmar que a cópia com o nome novo ficou com o mesmo tamanho.
// ── Pasta do projeto no PC (a de cima da @Exports): nome "Conceito_V1_V2", ou "Conceito_V1_Variação" se só tiver uma versão ──
const palavrasTitulo = x => { const txt = String(x || '').trim(); const tudoMaiusc = txt === txt.toUpperCase() && txt.split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean).length > 1; /* uma sigla sozinha (ex.: GP) fica como está */ return txt.split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean).map(w => (!tudoMaiusc && w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('_'); };
const nomePastaProjeto = (conceito, versoes, variacaoDe) => {
  const c = palavrasTitulo(conceito); if (!c) return '';
  const vs = [...new Set(versoes)].filter(n => n > 0).sort((a, b) => a - b);
  if (!vs.length) return c;
  if (vs.length > 1) return `${c}_${vs.map(v => `V${v}`).join('_')}`;
  const va = palavrasTitulo(variacaoDe(vs[0]) || '');
  return [c, `V${vs[0]}`, va].filter(Boolean).join('_');
};
// Versões que estão na pasta dos exports para este conceito (pelos nomes dos ficheiros: …_CONCEITO_V2_…)
const versoesNaPasta = async (dir, conceito) => {
  const c = slugF(conceito); const out = new Set();
  try { for await (const [nome, e] of dir.entries()) { if (e.kind !== 'file') continue; const k = slugF(nome); if (c && !k.includes(c)) continue; const m = new RegExp(`${c}_V(\\d+)(?:_|$)`).exec(k) || /_V(\d+)(?:_|$)/.exec(k); if (m) out.add(Number(m[1])); } } catch (e) { /* sem acesso */ }
  return [...out];
};
const renomearEm = async ({ dir, nome }, novo) => {
  if (nome === novo) return dir.getFileHandle(nome);
  let existe = false;
  try { await dir.getFileHandle(novo); existe = true; } catch (e) { /* não existe: ótimo */ }
  if (existe) { const er = new Error(`já existe um ficheiro "${novo}" na pasta "${dir.name}" — não mexi em nada`); er.name = 'JaExiste'; throw er; }
  const src = await (await dir.getFileHandle(nome)).getFile();
  const nh = await dir.getFileHandle(novo, { create: true });
  try {
    const w = await nh.createWritable();
    await src.stream().pipeTo(w);
    const copia = await nh.getFile();
    if (copia.size !== src.size) throw new Error(`a cópia de "${nome}" não ficou completa`);
  } catch (e) {
    try { await dir.removeEntry(novo); } catch (e2) { /* */ }
    throw e;
  }
  await dir.removeEntry(nome);
  return nh;
};
// Ficheiros arrastados para uma tarefa: ficam guardados ao fechar a janela (memória) e ao recarregar a página
// (o browser guarda o "acesso" a cada ficheiro, não o vídeo). Também se guarda o histórico de nomes, para desfazer.
const cacheEnvio = new Map();
const cacheHist = new Map();
const assinaturaLista = l => JSON.stringify(l.map(x => [x.id, x.formato, x.renomeado, x.nomeAntigo, x.handle ? x.handle.name : x.file && x.file.name]));
// ── Fila de envios: os envios continuam quando mudas de tarefa ou de separador, um de cada vez, com um quadro no canto do ecrã ──
const FILA = { itens: [], ouvir: new Set(), tema: null, abrir: null };
const ENVIANDO = new Map(); // tarefaId → id do envio
const filaAvisar = () => { FILA.ouvir.forEach(f => { try { f(); } catch (e) { /* */ } }); };
const filaPor = (id, patch) => { FILA.itens = FILA.itens.map(x => (x.id === id ? { ...x, ...patch } : x)); filaAvisar(); };
let filaCadeia = Promise.resolve();
// Espera pela sua vez; devolve a função que deixa passar o seguinte
const filaVez = () => { const antes = filaCadeia; let soltar; const minha = new Promise(ok => { soltar = ok; }); filaCadeia = antes.then(() => minha); return antes.then(() => soltar); };
const filaAtivos = () => FILA.itens.filter(x => x.estado === 'na fila' || x.estado === 'a enviar');
const avisoSair = e => { if (filaAtivos().length) { e.preventDefault(); e.returnValue = ''; } };
let filaRaiz = null;
const montarFila = () => {
  if (filaRaiz || typeof document === 'undefined') return;
  const el = document.createElement('div'); el.id = 'fila-envios'; document.body.appendChild(el);
  filaRaiz = createRoot(el); filaRaiz.render(<FilaEnvios />);
  window.addEventListener('beforeunload', avisoSair);
};
const filaNovo = item => { FILA.itens = [...FILA.itens.filter(x => x.estado === 'na fila' || x.estado === 'a enviar' || Date.now() - (x.fim || 0) < 30 * 60000), item]; montarFila(); filaAvisar(); };
const avisarNoBrowser = (titulo, corpo) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden && document.hasFocus()) return; // estás a ver a app: chega o quadro no canto
    const n = new Notification(titulo, { body: corpo, tag: 'fila-envios' });
    n.onclick = () => { try { window.focus(); n.close(); } catch (e) { /* */ } };
  } catch (e) { /* sem notificações */ }
};
const FilaEnvios = () => {
  const [, setTic] = useState(0);
  const [min, setMin] = useState(false);
  const [copiadoF, setCopiadoF] = useState('');
  useEffect(() => { const f = () => setTic(x => x + 1); FILA.ouvir.add(f); return () => FILA.ouvir.delete(f); }, []);
  const itens = FILA.itens;
  if (!itens.length) return null;
  const tema = FILA.tema || (() => { try { return localStorage.getItem('dashboard-theme') || 'dark'; } catch (e) { return 'dark'; } })();
  const claro = tema === 'light';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const ativos = filaAtivos();
  const nFich = l => l.reduce((a, x) => a + (x.total || 0), 0);
  const feitosFich = ativos.reduce((a, x) => a + (x.feitos || 0), 0);
  const titulo = ativos.length ? `A enviar ${Math.min(feitosFich + 1, nFich(ativos))} de ${nFich(ativos)} ficheiro${nFich(ativos) === 1 ? '' : 's'}` : itens.some(x => x.estado === 'erro') ? 'Envios com problemas' : 'Envios terminados';
  const tirar = id => { FILA.itens = FILA.itens.filter(x => x.id !== id); filaAvisar(); };
  return (
    <div className={`fixed z-[90] right-3 bottom-20 sm:right-5 sm:bottom-24 w-[min(360px,calc(100vw-24px))] rounded-2xl border shadow-2xl ${claro ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'}`} role="region" aria-label="Fila de envios para o Drive">
      <div className={`flex items-center gap-2 px-3.5 py-2.5 ${min ? '' : `border-b ${claro ? 'border-slate-100' : 'border-slate-800'}`}`}>
        {ativos.length > 0 && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" aria-hidden="true" />}
        <span className="flex-1 text-[13px] font-semibold" aria-live="polite">{titulo}</span>
        <button type="button" onClick={() => setMin(m => !m)} className={`w-7 h-7 rounded-md text-sm ${sub} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label={min ? 'Mostrar a fila' : 'Esconder a fila'} aria-expanded={!min}>{min ? '▴' : '–'}</button>
        {!ativos.length && <button type="button" onClick={() => { FILA.itens = []; filaAvisar(); }} className={`w-7 h-7 rounded-md text-sm ${sub} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label="Fechar a fila">✕</button>}
      </div>
      {!min && (
        <div className="max-h-[50vh] overflow-y-auto">
          {itens.slice().reverse().map((x, i) => (
            <div key={x.id} className={`px-3.5 py-2.5 space-y-1.5 ${i ? `border-t ${claro ? 'border-slate-100' : 'border-slate-800'}` : ''}`}>
              <div className="flex items-center gap-2 text-[12.5px]">
                {x.estado === 'feito' && <span className="text-emerald-500 shrink-0" aria-hidden="true">✓</span>}
                {x.estado === 'erro' && <span className="text-red-400 shrink-0" aria-hidden="true">⚠</span>}
                {FILA.abrir ? <button type="button" onClick={() => FILA.abrir && FILA.abrir(x.tarefaId)} className="flex-1 min-w-0 truncate text-left font-semibold hover:underline" title="Abrir a tarefa">{x.titulo}</button> : <span className="flex-1 min-w-0 truncate font-semibold">{x.titulo}</span>}
                <span className={`shrink-0 tabular-nums ${sub}`}>{x.estado === 'a enviar' ? `${Math.round((x.prog || 0) * 100)}%` : x.estado === 'na fila' ? 'na fila' : x.estado === 'feito' ? `${x.feitos} enviado${x.feitos === 1 ? '' : 's'}` : ''}</span>
                {(x.estado === 'feito' || x.estado === 'erro') && <button type="button" onClick={() => tirar(x.id)} className={`shrink-0 text-xs ${sub} hover:text-red-400`} aria-label={`Tirar ${x.titulo} da fila`}>✕</button>}
              </div>
              {x.estado === 'a enviar' && (
                <>
                  <div className={`h-1.5 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700'}`}><div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((x.prog || 0) * 100)}%` }} /></div>
                  <p className={`text-[11px] ${sub}`}>{x.atual ? `${x.atual} · ` : ''}{x.feitos || 0} de {x.total} feito{x.total === 1 ? '' : 's'}</p>
                </>
              )}
              {x.estado === 'erro' && <p className="text-[11px] text-red-400">{x.erro}</p>}
              {x.estado === 'feito' && x.link && (
                <div className="flex items-center gap-3 text-[11.5px]">
                  <button type="button" onClick={() => { copiar(x.link); setCopiadoF(x.id); setTimeout(() => setCopiadoF(''), 1400); }} className="text-blue-500 hover:underline">{copiadoF === x.id ? '✓ link copiado' : 'Copiar link'}</button>
                  <a href={x.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Abrir no Drive ↗</a>
                </div>
              )}
            </div>
          ))}
          {ativos.length > 0 && <p className={`px-3.5 pb-2.5 text-[10.5px] ${sub}`}>Podes mudar de tarefa ou de separador: o envio continua. Não feches a app até acabar.</p>}
        </div>
      )}
    </div>
  );
};
// ── Exports novos encontrados sozinhos: a app procura a @Exports do projeto deste conceito na pasta dos projetos (ex.: C:\WORK) ──
const EXT_EXPORT = /\.(mp4|mov|m4v|webm|png|jpe?g|webp|gif)$/i;
const IGNORAR_PROJ = /^(\(Footage\)|@Source|Adobe After Effects Auto-Save|\$RECYCLE\.BIN|System Volume Information|node_modules|\..*)$/i;
const palavrasP = x => normJ(x).split(' ').filter(w => w.length >= 3 && !/^v\d+$/.test(w) && !/^\d+$/.test(w));
const permissaoLer = async (d, pedir) => { try { let p = await d.queryPermission({ mode: 'readwrite' }); if (p !== 'granted' && pedir) p = await d.requestPermission({ mode: 'readwrite' }); return p === 'granted'; } catch (e) { return false; } };
const acharExportsConceito = async (raiz, { conceito, jogo, cliente }) => {
  const pc = palavrasP(conceito), pj = palavrasP(jogo), pk = palavrasP(cliente);
  if (!pc.length) return null;
  const tem = (nome, ps) => { const n = ` ${normJ(nome)} `; return ps.filter(w => n.includes(` ${w} `) || n.includes(w)).length; };
  const achados = [];
  const fila = [[raiz, 0, []]]; let vistos = 0;
  while (fila.length && vistos < 5000) {
    const [dir, nivel, cam] = fila.shift(); vistos++;
    const subs = [];
    try {
      for await (const [nome, e] of dir.entries()) {
        if (e.kind !== 'directory') continue;
        if (nome.toLowerCase() === '@exports') { achados.push({ dir: e, proj: dir, projeto: cam[cam.length - 1] || '', cam }); continue; }
        if (IGNORAR_PROJ.test(nome) || nivel >= 7) continue;
        subs.push([e, nome]);
      }
    } catch (e) { /* pasta sem acesso */ }
    // À entrada, se houver uma pasta com o nome do cliente (ou do jogo), procura só aí
    let escolher = subs;
    if (nivel <= 1 && (pk.length || pj.length)) { const f = subs.filter(([, n]) => (pk.length && tem(n, pk) === pk.length) || (pj.length && tem(n, pj) === pj.length)); if (f.length) escolher = f; }
    escolher.forEach(([e, n]) => fila.push([e, nivel + 1, [...cam, n]]));
  }
  const pontos = a => { const np = tem(a.projeto, pc) / pc.length; if (np < 1) return 0; return np + (pj.length ? tem(a.cam.join(' '), pj) / pj.length * 0.3 : 0); };
  const l = achados.map(a => ({ ...a, p: pontos(a) })).filter(a => a.p > 0).sort((x, y) => y.p - x.p || x.projeto.length - y.projeto.length);
  return l[0] || null;
};
const exportsNovos = async (dirExp, { desde, ignorar }) => {
  const out = [];
  for await (const [nome, e] of dirExp.entries()) {
    if (e.kind !== 'file' || !EXT_EXPORT.test(nome) || ignorar.has(nome)) continue;
    try { const f = await e.getFile(); if (f.lastModified >= desde) out.push({ handle: e, file: f }); } catch (err) { /* em uso */ }
  }
  return out.sort((a, b) => a.file.name.localeCompare(b.file.name));
};
// Vídeo ampliado: janela grande por cima da app (não é ecrã inteiro); continua do ponto onde estava
const fmtDur = x => { const t = Math.max(0, Math.round(Number(x) || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const durDoNomeF = n => { const m = /_(\d{1,4})S(?:_|\.)/i.exec(String(n || '')); return m ? Number(m[1]) : null; };
const IcoAmpliar = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>;
const VideoGrande = ({ url, imagem, formato, nome, tempo = 0, onFechar, opcoes, atual, onEscolher, aCarregar }) => {
  const ref = useRef(null);
  useEffect(() => {
    const f = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onFechar(ref.current ? ref.current.currentTime : tempo); } };
    window.addEventListener('keydown', f, true);
    const ov = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', f, true); document.body.style.overflow = ov; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [fw, fh] = String(formato || '9:16').split(':').map(Number);
  const r = fw && fh ? fw / fh : 9 / 16;
  // O maior possível dentro de 92% da largura e 82% da altura da janela
  const est = r >= 1 ? { width: `min(92vw, calc(82vh * ${r}))`, aspectRatio: `${fw} / ${fh}` } : { height: `min(82vh, calc(92vw / ${r}))`, aspectRatio: `${fw} / ${fh}` };
  const fechar = () => onFechar(ref.current ? ref.current.currentTime : tempo);
  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 p-3 bg-black/85" onMouseDown={e => { if (e.target === e.currentTarget) fechar(); }} role="dialog" aria-label={`Vídeo ${formato || ''} ampliado`}>
      <div className="flex items-center gap-2 max-w-[92vw]">
        {nome && <span className="text-xs text-slate-300 truncate max-w-[60vw]" title={nome}>{nome}</span>}
        {(opcoes || []).length > 1 && (opcoes.map(x => (
          <button key={x.id} type="button" onClick={() => onEscolher(x.id)} aria-pressed={x.id === atual}
            className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${x.id === atual ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-500 text-slate-200 hover:bg-white/10'}`}>{x.formato || '?'}</button>
        )))}
        <button type="button" onClick={fechar} className="ml-2 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white text-lg leading-none" aria-label="Fechar o vídeo ampliado">✕</button>
      </div>
      {url ? (imagem ? <img src={url} alt={nome || ''} className="rounded-xl bg-black object-contain shadow-2xl max-w-[92vw] max-h-[82vh]" style={est} />
        : <video ref={ref} key={url} src={url} controls autoPlay playsInline className="rounded-xl bg-black object-contain shadow-2xl max-w-[92vw] max-h-[82vh]" style={est}
            onLoadedMetadata={e => { try { if (tempo && tempo < e.currentTarget.duration) e.currentTarget.currentTime = tempo; } catch (err) { /* */ } }} />)
        : <div className="rounded-xl bg-slate-900 flex items-center justify-center text-sm text-slate-300 max-w-[92vw] max-h-[82vh]" style={est}>{aCarregar || 'A carregar…'}</div>}
      <p className="text-[11px] text-slate-400">Esc ou clicar fora para fechar</p>
    </div>,
    document.body,
  );
};
// Pré-visualização do export (o 9:16 primeiro), logo que se arrastam os ficheiros — dá para trocar de formato
const ehImagemF = f => !!f && (/^image\//.test(f.type || '') || /\.(png|jpe?g|webp|gif)$/i.test(f.name || ''));
// Resolução de cada formato (vídeo)
const RES_FORMATO = { '9:16': [1080, 1920], '4:5': [1080, 1350], '16:9': [1920, 1080], '1:1': [1080, 1080] };
const ORDEM_FORMATOS = ['9:16', '4:5', '16:9', '1:1'];
const segTxt = s => `${(Math.round(s * 100) / 100).toFixed(2).replace('.', ',')} s`;
// Verificação antes de enviar: resolução certa para o formato, formatos pedidos em Entrega todos lá, mesma duração em todos
const verificarExports = (lista, pedidos) => {
  const erros = [], avisos = [];
  const vids = (lista || []).filter(x => x.file && !ehImagemF(x.file) && x.formato);
  if (!vids.length) return { erros, avisos, ok: null };
  vids.forEach(x => {
    const m = x.meta; const esp = RES_FORMATO[x.formato];
    if (!m || !m.w || !m.h) { avisos.push(`Não consegui ler a resolução e a duração do ${x.formato} (o browser não abre este tipo de vídeo) — confirma tu.`); return; }
    const [a, b] = x.formato.split(':').map(Number);
    if (Math.abs(m.w / m.h - a / b) > 0.01) erros.push(`O ${x.formato} tem ${m.w}×${m.h} — essa resolução não é ${x.formato}${esp ? ` (devia ser ${esp[0]}×${esp[1]})` : ''}.`);
    else if (esp && (m.w !== esp[0] || m.h !== esp[1])) avisos.push(`O ${x.formato} tem ${m.w}×${m.h} — o normal é ${esp[0]}×${esp[1]}.`);
  });
  const comDur = vids.filter(x => x.meta && x.meta.dur > 0);
  const durs = comDur.map(x => x.meta.dur);
  const durIguais = durs.length < 2 || Math.max(...durs) - Math.min(...durs) <= 0.03; // menos de 1 frame
  if (!durIguais) erros.push(`As durações não são iguais: ${comDur.slice().sort((p, q) => ORDEM_FORMATOS.indexOf(p.formato) - ORDEM_FORMATOS.indexOf(q.formato)).map(x => `${x.formato} = ${segTxt(x.meta.dur)}`).join(' · ')}.`);
  const tem = new Set(vids.map(x => x.formato));
  const ped = (pedidos || []).filter(f => RES_FORMATO[f]);
  const faltam = ped.filter(f => !tem.has(f));
  if (faltam.length) erros.push(`Falta${faltam.length === 1 ? '' : 'm'} o${faltam.length === 1 ? '' : 's'} ${faltam.join(', ')} (pedido${faltam.length === 1 ? '' : 's'} em Entrega).`);
  const aMais = [...tem].filter(f => ped.length && !ped.includes(f));
  if (aMais.length) avisos.push(`${aMais.join(', ')} não está marcado em Entrega.`);
  if (!ped.length) avisos.push('Marca os formatos em Entrega para eu confirmar que não falta nenhum.');
  const ok = !erros.length ? `${[...tem].sort((p, q) => ORDEM_FORMATOS.indexOf(p) - ORDEM_FORMATOS.indexOf(q)).join(' · ')}${durs.length ? ` · ${durs.length > 1 ? 'todos com ' : ''}${segTxt(durs[0])}` : ''}${vids.every(x => x.meta && x.meta.w) ? ' · resoluções certas' : ''}` : null;
  return { erros, avisos, ok };
};
const ehVideoF = f => !!f && (/^video\//.test(f.type || '') || /\.(mp4|mov|m4v|webm)$/i.test(f.name || ''));
// Miniatura de um vídeo/imagem do PC (um frame a meio segundo), no formato dele
const MiniaturaFicheiro = ({ file, formato, alto = 40 }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (!file) return undefined; const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  const [a, b] = String(formato || '16:9').split(':').map(Number);
  const larg = Math.round(alto * ((a && b) ? a / b : 16 / 9));
  const est = { width: Math.max(24, larg), height: alto };
  if (!url) return <span className="shrink-0 rounded-md bg-black/30" style={est} />;
  return ehImagemF(file)
    ? <img src={url} alt="" aria-hidden="true" className="shrink-0 rounded-md object-cover bg-black" style={est} />
    : <video src={`${url}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} className="shrink-0 rounded-md object-cover bg-black pointer-events-none" style={est} />;
};
// Os formatos pedidos em Entrega: os que já tens (✓) e os que faltam (assinalados)
const FormatosPedidos = ({ pedidos, tem, claro, compacto = false }) => {
  const ped = ORDEM_FORMATOS.filter(f => (pedidos || []).includes(f));
  if (!ped.length) return null;
  const faltam = ped.filter(f => !tem.has(f));
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compacto ? 'text-[11px]' : 'text-xs'}`} aria-label={faltam.length ? `Faltam ${faltam.join(', ')}` : 'Todos os formatos pedidos'}>
      {ped.map(f => tem.has(f)
        ? <span key={f} className={`px-1.5 py-0.5 rounded-md font-semibold ${claro ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/15 text-blue-300'}`}>{f} ✓</span>
        : <span key={f} className={`px-1.5 py-0.5 rounded-md font-semibold border border-dashed ${claro ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-amber-400/70 text-amber-300 bg-amber-500/10'}`} title="Pedido em Entrega e ainda sem ficheiro">{f} em falta</span>)}
    </div>
  );
};
const PreviewExport = ({ lista, claro, sub, pedidos }) => {
  const vis = lista.filter(x => x.file && (ehVideoF(x.file) || ehImagemF(x.file)));
  const [esc, setEsc] = useState(null);
  const item = vis.find(x => x.id === esc) || vis.find(x => x.formato === '9:16') || vis[0] || null;
  const [url, setUrl] = useState(null);
  const [grande, setGrande] = useState(null); // { tempo }
  const refV = useRef(null);
  const [agoraP, setAgoraP] = useState(0);
  const ficheiro = item ? item.file : null;
  useEffect(() => { setAgoraP(0); }, [ficheiro]);
  useEffect(() => {
    if (!ficheiro) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(ficheiro); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [ficheiro]);
  if (!item || !url) return null;
  const [fw, fh] = String(item.formato || '9:16').split(':').map(Number);
  const larg = !fw || !fh ? 140 : fw / fh >= 1.3 ? 260 : fw / fh >= 0.95 ? 190 : fw / fh >= 0.75 ? 170 : 140;
  const est = { width: larg, maxWidth: '100%', aspectRatio: fw && fh ? `${fw} / ${fh}` : undefined };
  return (
    <div className="shrink-0 space-y-1.5" style={{ width: larg, maxWidth: '100%' }}>
      {ehImagemF(item.file)
        ? <img src={url} alt={`Pré-visualização ${item.formato || ''}`} className="rounded-lg object-contain bg-black" style={est} />
        : <div className="relative"><video ref={refV} key={url} src={url} controls muted playsInline preload="metadata" className="rounded-lg bg-black object-contain" style={est} aria-label={`Pré-visualização do ${item.formato || 'vídeo'}`} onTimeUpdate={e => setAgoraP(e.currentTarget.currentTime)} /><button type="button" onClick={() => { const v = refV.current; const tempo = v ? v.currentTime : 0; if (v) v.pause(); setGrande({ tempo }); }} title="Ver em grande" aria-label="Ver em grande" className="absolute top-1.5 right-1.5 z-[1] w-8 h-8 inline-flex items-center justify-center rounded-lg bg-black/60 hover:bg-black/80 text-white shadow"><IcoAmpliar /></button></div>}
      {!ehImagemF(item.file) && item.meta && item.meta.dur > 0 && <p className={`text-[11px] tabular-nums ${sub}`} aria-label="Duração">{agoraP > 0 ? <><b className={claro ? 'text-slate-700' : 'text-slate-200'}>{fmtDur(agoraP)}</b> / {fmtDur(item.meta.dur)}</> : <>Duração: <b className={claro ? 'text-slate-700' : 'text-slate-200'}>{fmtDur(item.meta.dur)}</b></>}</p>}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Ver outro formato">
        {(vis.length > 1 || (pedidos || []).some(f => !vis.some(x => x.formato === f))) && vis.map(x => (
          <button key={x.id} type="button" onClick={() => setEsc(x.id)} aria-pressed={x.id === item.id}
            className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold border ${x.id === item.id ? 'bg-blue-600 border-blue-600 text-white' : claro ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-white/5'}`}>{x.formato || '?'}</button>
        ))}
        {ORDEM_FORMATOS.filter(f => (pedidos || []).includes(f) && !vis.some(x => x.formato === f)).map(f => <span key={'f' + f} title="Pedido em Entrega e ainda sem ficheiro" className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold border border-dashed ${claro ? 'border-amber-500 text-amber-700' : 'border-amber-400/70 text-amber-300'}`}>{f} em falta</span>)}
      </div>
      {grande && <VideoGrande url={url} imagem={ehImagemF(item.file)} formato={item.formato} nome={`${item.file.name}${item.meta && item.meta.dur ? ` · ${fmtDur(item.meta.dur)}` : ''}`} tempo={grande.tempo} opcoes={vis.map(x => ({ id: x.id, formato: x.formato }))} atual={item.id} onEscolher={id => setEsc(id)}
        onFechar={t2 => { setGrande(null); const v = refV.current; if (v && t2) { try { v.currentTime = t2; } catch (e) { /* */ } } }} />}
    </div>
  );
};
const EnviarDrive = ({ t, trab, r, set, mudar, claro, sub, inputClass, versaoLote, setVersaoLote, infoVersao, setInfoVersao }) => {
  const [lista, setLista] = useState(() => cacheEnvio.get(t.id) || []); // { id, file, meta, formato, estado, prog, erro }
  const [aEnviar, setAEnviarS] = useState(false);
  const setAEnviar = v => { aEnviarRef.current = v; setAEnviarS(v); };
  const [msg, setMsg] = useState('');
  const [resultado, setResultado] = useState(t.drive || null);
  // Se a tarefa mudar por fora (ex.: a spreadsheet foi conferida, ou outro dispositivo), o painel acompanha
  const aEnviarRef = useRef(false);
  useEffect(() => { if (!aEnviarRef.current) setResultado(r0 => (t.drive ? { ...t.drive, ...(r0 && r0.trelloN && r0.pastaId === t.drive.pastaId ? { trelloN: r0.trelloN } : {}) } : null)); }, [t.drive]);
  // Envio desta tarefa a decorrer de uma abertura anterior do painel (fechaste e voltaste): acompanha pela fila
  const [, setTicF] = useState(0);
  useEffect(() => { const f = () => { setTicF(x => x + 1); if (!aEnviarRef.current && (ENVIANDO.has(t.id) || cacheEnvio.has(t.id))) setLista(cacheEnvio.get(t.id) || []); }; FILA.ouvir.add(f); return () => FILA.ouvir.delete(f); }, [t.id]);
  const [verSug, setVerSug] = useState(null);
  const [renomeados, setRenomeados] = useState(null); // itens enviados que ainda podem mudar de nome no PC
  const [noDrive, setNoDrive] = useState(null); // ficheiros na pasta do Drive desta tarefa
  const [aApagar, setAApagar] = useState(null);
  const [ocupadoDrive, setOcupadoDrive] = useState(false);
  const [sempre, setSempre] = useState(() => ligadoSempre(contaDe(t.cid) || '_'));
  const [aLigar, setALigar] = useState(false);
  useEffect(() => { let vivo = true; sincronizarSempre().then(() => { if (vivo) setSempre(ligadoSempre(contaDe(t.cid) || '_')); }); return () => { vivo = false; }; }, [t.cid]);
  const inRef = useRef(null);
  const [arrastarD, setArrastarD] = useState(false);
  useEffect(() => { carregarGis().catch(() => {}); }, []);
  const [historico, setHistorico] = useState(() => cacheHist.get(t.id) || []); // [{ itemId, handle, antes, depois }] — nomes que a app mudou no PC
  const carregado = useRef(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const h = await idbLer(`renomes-${t.id}`);
      if (vivo && Array.isArray(h) && !cacheHist.has(t.id)) setHistorico(h);
      if (!cacheEnvio.has(t.id)) {
        const g = await idbLer(`envio-${t.id}`);
        if (vivo && Array.isArray(g) && g.length) {
          const itens = [];
          for (const x of g) { let file = null; try { if ((await x.handle.queryPermission({ mode: 'read' })) === 'granted') file = await x.handle.getFile(); } catch (e) { /* sem acesso até carregares */ } itens.push({ ...x, file, estado: 'pronto', prog: 0 }); }
          if (vivo) setLista(l => (l.length ? l : itens));
        }
      }
      carregado.current = true;
    })();
    return () => { vivo = false; };
  }, [t.id]);
  const assin = assinaturaLista(lista);
  useEffect(() => {
    cacheEnvio.set(t.id, lista);
    if (!carregado.current) return;
    const guardar = lista.filter(x => x.handle && x.estado !== 'feito').map(x => ({ id: x.id, handle: x.handle, formato: x.formato, meta: x.meta || null, renomeado: !!x.renomeado, nomeAntigo: x.nomeAntigo || null }));
    idbGravar(`envio-${t.id}`, guardar.length ? guardar : null);
  }, [assin]); // eslint-disable-line react-hooks/exhaustive-deps
  const gravarHistorico = h => { setHistorico(h); cacheHist.set(t.id, h); idbGravar(`renomes-${t.id}`, h.length ? h : null); };
  const semAcesso = lista.filter(x => !x.file);
  const darAcesso = async () => {
    for (const x of semAcesso) { try { let p = await x.handle.queryPermission({ mode: 'read' }); if (p !== 'granted') p = await x.handle.requestPermission({ mode: 'read' }); if (p === 'granted') { const f = await x.handle.getFile(); mudarItem(x.id, { file: f }); } } catch (e) { mudarItem(x.id, { erro: 'Não encontrei este ficheiro no PC (mudou de sítio ou foi apagado?)', estado: 'erro' }); } }
  };
  const jogo = r.jogo && !r.jogo.semJogo ? r.jogo : null;
  const statics = ['BAN', 'ICO', 'FG', 'SS'].includes(r.tipo);
  const raizUrl = jogo ? (statics ? jogo.driveStatics : jogo.drive) : null;
  const raiz = idPastaDrive(raizUrl);
  const conta = contaDe(t.cid);
  const fx = t.ficheiros || {};
  // Versão: a que escreveste; senão a da última vez que esta tarefa foi enviada; senão a adivinhada pelo Drive
  // Versão da última vez que ESTA tarefa foi enviada — só conta se for o mesmo conceito
  const versaoAnterior = (() => { if (!t.drive || (t.drive.conceito && slugF(t.drive.conceito) !== slugF(r.conceito))) return null; const m = /_V(\d+)(?:_|$)/.exec(String(t.drive.pasta || '')); return m ? m[1] : null; })();
  // Tarefa com várias peças (ex.: vídeo novo + iteração): cada lote de exports pode ter a sua versão (V1, V2…)
  const pecasN = trabPecas(t).reduce((a, p) => a + (Number(p.n) || 1), 0);
  const versoesTarefa = [...new Set([t.drive, ...((t.drive && t.drive.anteriores) || [])].filter(Boolean).map(d => Number(d.versao || (/_V(\d+)(?:_|$)/.exec(String(d.pasta || '')) || [])[1])).filter(n => n > 0))].sort((a, b) => a - b);
  const versaoConfirmada = v => String(versaoLote || fx.versao || v || versaoAnterior || '').replace(/^v/i, '');
  const versaoDe = v => versaoConfirmada(v) || String(r.vNum || '1'); // sem versão em lado nenhum: a dos nomes lá em cima (o Drive confirma ao enviar)
  const baseDe = v => [r.conceito, versaoDe(v) ? `V${versaoDe(v)}` : '', slugF(campoVersao(fx, versaoDe(v), 'variacao', t))].filter(Boolean).join('_');
  const nomeBase = [r.cod, r.tipo, baseDe(verSug)].filter(Boolean).join('_');
  // Duração: a que escreveste para esta versão; senão a do próprio vídeo; só no fim a de outra versão
  const durPropria = vv => { const pv = fx.porVersao && fx.porVersao[String(vv)]; return pv && pv.duracao !== undefined ? pv.duracao : undefined; };
  const durDe = (item, v = verSug) => { const vv = versaoDe(v); const mdur = item.meta && item.meta.dur ? Math.round(item.meta.dur) : null;
    if (mdur && versoesTarefa.includes(Number(vv))) return mdur; // a substituir: a duração é a do vídeo novo
    const pr = durPropria(vv); if (pr) return pr; const m = item.meta && item.meta.dur ? Math.round(item.meta.dur) : null; return m || campoVersao(fx, vv, 'duracao') || null; };
  const nomeDe = item => (item.handle ? item.handle.name : item.file ? item.file.name : '');
  const vLoteAtual = versaoDe(verSug);
  const dursLote = [...new Set(lista.map(x => (x.meta && x.meta.dur ? Math.round(x.meta.dur) : null)).filter(Boolean))];
  useEffect(() => {
    if (!lista.length || versoesTarefa.includes(Number(vLoteAtual)) || durPropria(vLoteAtual) || dursLote.length !== 1) return;
    set({ ficheiros: fxComVersao(fx, t, vLoteAtual, { duracao: dursLote[0] }) });
  }, [lista.length, vLoteAtual, dursLote.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const nomeFinal = (item, v = verSug) => { const ext = (/\.[a-z0-9]{2,4}$/i.exec(nomeDe(item)) || ['.mp4'])[0].toLowerCase(); const d = durDe(item, v); return [r.cod, r.tipo, baseDe(v), item.formato ? item.formato.replace(':', 'X') : 'FORMATO', d ? `${d}S` : '', r.ddmmyy].filter(Boolean).join('_') + ext; };
  // Adivinhar a versão pelas pastas que já estão no Drive (CONCEITO_V1, _V2…): vídeo novo → a seguinte; variação/iteração → a última
  // Cada entrega nova (vídeo novo, variação ou iteração) é uma versão nova do conceito: nunca reaproveita a de outro vídeo
  const novoVideo = true;
  const adivinharVersao = async token => {
    const info = await versoesNoDrive(token, raiz, r.conceito);
    setInfoVersao({ ...info, conceito: r.conceito });
    const max = Math.max(0, ...info.versoes, ...versoesDeOutras(trab, t, r.conceito));
    return String(novoVideo ? max + 1 : Math.max(1, max));
  };
  const verVersoes = async () => {
    try {
      const tk = tokenGuardado() || await tokenDrive(conta); const v = await adivinharVersao(tk);
      if (!fx.versao && !versaoAnterior) { setVerSug(v); if (novoVideo) set({ ficheiros: { ...fx, versao: v } }); } // vídeo novo: a versão seguinte fica logo escrita
    }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
  };
  // Com sessão da Google aberta, a app vai logo ver as versões quando o conceito muda
  useEffect(() => { if (raiz && r.conceito && (tokenGuardado() || ligadoSempre(conta || '_'))) verVersoes(); }, [raiz, r.conceito]); // eslint-disable-line react-hooks/exhaustive-deps
  const tokenGuardado = () => tokenGuardadoDe(conta);
  // Exports novos na @Exports do projeto (pasta dos projetos escolhida uma vez; o Chrome lembra-se)
  const [achados, setAchados] = useState(null); // { projeto, dir, itens: [{ handle, file }], nada }
  const [estadoExp, setEstadoExp] = useState(''); // '' | 'sem-raiz' | 'sem-licenca' | 'a procurar'
  const [expDesligado, setExpDesligado] = useState(() => { try { return localStorage.getItem('exp-auto-off') === '1'; } catch (e) { return false; } });
  const ignoradosRef = useRef(new Set());
  const procurarExports = async (pedir, novaRaiz = false) => {
    if (!r.conceito || typeof window === 'undefined' || !window.showDirectoryPicker || expDesligado) return;
    let raizP = novaRaiz ? null : await idbLer('raiz-projetos');
    if (!raizP) {
      if (!pedir) { setEstadoExp('sem-raiz'); return; }
      try { raizP = await window.showDirectoryPicker({ id: 'projetos', mode: 'readwrite' }); await idbGravar('raiz-projetos', raizP); } catch (e) { return; }
    }
    if (!(await permissaoLer(raizP, pedir))) { setEstadoExp('sem-licenca'); return; }
    setEstadoExp('a procurar');
    try {
      const kc = `exp:${jogo ? jogo.id : ''}:${slugF(r.conceito)}`;
      let alvo = novaRaiz ? null : await idbLer(kc);
      let dirExp = alvo && alvo.dir;
      if (dirExp) { try { const it = dirExp.entries(); await it.next(); } catch (e) { dirExp = null; } } // a pasta mudou de nome ou de sítio: procura outra vez
      if (!dirExp) {
        const cli = (TRAB_ATUAL.clientes || []).find(c => String(c.id) === String(t.cid));
        const a = await acharExportsConceito(raizP, { conceito: r.conceito, jogo: jogo ? jogo.nome : '', cliente: cli ? cli.nome : '' });
        if (a) { dirExp = a.dir; alvo = { dir: a.dir, projeto: a.projeto }; await idbGravar(kc, { ...alvo, em: Date.now() }); }
      }
      if (!dirExp) { setAchados({ projeto: '', itens: [], nada: true }); setEstadoExp(''); return; }
      const ignorar = new Set([...ignoradosRef.current, ...versoesDoConceito(trab, t, slugF(r.conceito)).flatMap(x => x.ficheiros.map(f => f.nome)), ...lista.map(x => nomeDe(x))]);
      const ult = Math.max(0, ...versoesDrive(t.drive).map(d => Date.parse(d.em) || 0));
      const desde = ult ? ult + 1000 : (Date.parse(t.criada) || 0) - 12 * 3600000;
      const itens0 = await exportsNovos(dirExp, { desde, ignorar });
      const itens = await Promise.all(itens0.map(async x => ({ ...x, meta: await lerVideo(x.file) }))); // resolução e duração, para avisar já aqui
      setAchados({ projeto: (alvo && alvo.projeto) || dirExp.name, dir: dirExp, itens });
    } catch (e) { /* sem acesso */ }
    setEstadoExp('');
  };
  useEffect(() => { setAchados(null); setEstadoExp(''); if (!lista.length && !aEnviarRef.current) procurarExports(false); }, [t.id, r.conceito]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ao voltar do After Effects (a janela da app volta a ter foco), vê outra vez
  useEffect(() => {
    let ult = 0;
    const f = () => { if (Date.now() - ult < 15000 || aEnviarRef.current) return; ult = Date.now(); if (!(cacheEnvio.get(t.id) || []).length) procurarExports(false); };
    window.addEventListener('focus', f); return () => window.removeEventListener('focus', f);
  }, [t.id, r.conceito, expDesligado]); // eslint-disable-line react-hooks/exhaustive-deps
  const usarAchados = async () => {
    const a = achados; if (!a || !a.itens.length) return;
    setAchados(null);
    if (a.dir) await lembrarPasta(a.dir, chaves);
    await juntar(a.itens.map(x => x.file), a.itens.map(x => x.handle));
  };
  const juntar = async (fs, handles = []) => {
    setMsg('');
    const novos = [];
    const arr = Array.from(fs || []);
    for (let i = 0; i < arr.length; i++) { const f = arr[i]; if (!f) continue; const meta = await lerVideo(f); novos.push({ id: Math.random().toString(36).slice(2), file: f, handle: handles[i] || null, nomeAntigo: f.name, meta, formato: formatoDoFicheiro(f.name, meta), estado: 'pronto', prog: 0 }); }
    // Ficheiros que já têm o nome de uma versão enviada (ex.: …_UGC_SIGNS_V2_…, exportados de novo depois de feedback): são para substituir essa versão
    const cS = slugF(r.conceito);
    const vsNomes = [...new Set(novos.map(x => { const k = slugF(x.file.name); const m = cS && k.includes(cS) ? new RegExp(`${cS}_V(\\d+)(?:_|$)`).exec(k) : null; return m ? Number(m[1]) : null; }))];
    if (!lista.length && vsNomes.length === 1 && vsNomes[0] && versoesTarefa.includes(vsNomes[0])) { setVersaoLote(String(vsNomes[0])); setEscolha({ tipo: 'substituir', v: vsNomes[0], porque: `os ficheiros já têm o nome da V${vsNomes[0]} — parece uma correção` }); }
    else if (!lista.length && versoesTarefa.length) {
      const atualV = Number(versaoLote || fx.versao || versaoAnterior || 0);
      const nova = Math.max(...versoesTarefa, ...(((infoVersao && infoVersao.conceito === r.conceito && infoVersao.versoes) || [])), ...versoesDeOutras(trab, t, r.conceito)) + 1;
      if (!atualV || versoesTarefa.includes(atualV)) setVersaoLote(String(nova));
      setEscolha({ tipo: 'nova', v: !atualV || versoesTarefa.includes(atualV) ? nova : atualV, porque: 'os ficheiros não têm o nome de nenhuma versão enviada — parece outro vídeo ou variação' });
    }
    setLista(l => [...l, ...novos]);
    // Se já tens sessão na Google, a versão aparece logo
    const tk = tokenGuardado();
    if (tk && raiz && r.conceito && !fx.versao && !versaoAnterior && !verSug) { try { setVerSug(await adivinharVersao(tk)); } catch (e) { /* adivinha ao enviar */ } }
  };
  const temVersao = !!versaoConfirmada(verSug);
  const comHandle = lista.filter(x => x.handle && x.formato && x.estado !== 'feito');
  // Mudar o nome no PC: 1.º tenta o "move" do Chrome; se não der, procura o ficheiro nas pastas de exports
  // que a app já conhece (primeiro a deste projeto) e cria lá o ficheiro com o nome novo, apagando o antigo.
  const chaves = { pastaId: t.pastaId || null, jogoId: jogo ? jogo.id : null };
  const renomearFicheiros = async (alvos, escolhida = null, desfazer = false) => {
    let ok = 0; const erros = []; const faltam = []; const feitos = [];
    let conhecidas = null;
    // Segurança: dois ficheiros nunca podem ficar com o mesmo nome (um apagaria o outro)
    const iguais = alvos.map(a => a.novo).filter((n, i, arr) => arr.indexOf(n) !== i);
    if (iguais.length) return { ok: 0, erros: [`dois ficheiros ficavam com o mesmo nome (${iguais[0]}) — muda o formato de um deles. Não mexi em nada`], faltam: [] };
    for (const a of alvos) {
      const h = a.handle;
      if (!h) { erros.push('sem acesso ao ficheiro'); continue; }
      if (h.name === a.novo) { ok++; a.feito = true; continue; }
      const antes = h.name;
      let feito = false;
      if (false && typeof h.move === 'function' && !usarPastaExports) { // desligado: o move() do Chrome pode escrever por cima de um ficheiro com o mesmo nome
        try {
          let perm = h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'granted';
          if (perm !== 'granted' && h.requestPermission) perm = await h.requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') { await h.move(a.novo); feito = true; }
        } catch (e) { usarPastaExports = true; }
      }
      if (!feito) {
        try {
          let onde = escolhida ? await procurarNaPasta(escolhida, h) : null;
          if (!onde) {
            if (!conhecidas) {
              const pts = x => (chaves.pastaId && x.pastaId === chaves.pastaId ? 4 : 0) + (chaves.jogoId && x.jogoId === chaves.jogoId ? 2 : 0);
              conhecidas = (await pastasConhecidas()).filter(x => x && x.dir).sort((x, y) => pts(y) - pts(x) || (y.em || 0) - (x.em || 0));
            }
            // 1.º as que já têm autorização; depois pede autorização às 3 mais prováveis
            for (const pedir of [false, true]) {
              for (const x of pedir ? conhecidas.slice(0, 3) : conhecidas) {
                if (!(await permissaoPasta(x.dir, pedir))) continue;
                onde = await procurarNaPasta(x.dir, h);
                if (onde) break;
              }
              if (onde) break;
            }
          }
          if (onde) { a.handleNovo = await renomearEm(onde, a.novo); a.pastaDir = onde.dir; feito = true; await lembrarPasta(onde.dir, chaves); }
          else faltam.push(a);
        } catch (e) { erros.push(e && e.name === 'SecurityError' ? 'clica outra vez (o browser pediu um clique novo)' : String((e && e.message) || e)); }
      }
      if (feito) {
        ok++; a.feito = true;
        const nh = a.handleNovo || h;
        feitos.push({ itemId: a.id || null, handle: nh, antes, depois: a.novo });
        if (a.id) { try { const f = await nh.getFile(); mudarItem(a.id, { file: f, handle: nh, renomeado: !desfazer }); } catch (e) { mudarItem(a.id, { renomeado: !desfazer }); } }
      }
    }
    if (feitos.length && !desfazer) {
      // Histórico para desfazer: guarda sempre o nome ORIGINAL (se mudaste duas vezes, volta ao primeiro)
      let h = [...historico];
      const novos = feitos.map(f => { const i = h.findIndex(x => x.depois === f.antes); if (i < 0) return f; const orig = h[i]; h.splice(i, 1); return { ...f, antes: orig.antes }; });
      gravarHistorico([...novos, ...h].slice(0, 30));
      // A tarefa fica com os formatos, a versão e a duração destes ficheiros (para os nomes aparecerem lá em cima)
      const its = lista.filter(x => alvos.some(a => a.feito && a.id === x.id));
      if (its.length) {
        const durs = its.map(x => durDe(x)).filter(Boolean);
        const vR = versaoDe(verSug);
        const fx2 = !campoVersao(fx, vR, 'duracao') && durs.length ? fxComVersao(fx, t, vR, { duracao: durs[0] }) : fx;
        const fxN = { ...fx2, ...(!fx.versao ? { versao: vR } : {}) };
        // O nome da tarefa fica igual ao dos ficheiros (Tipo - Conceito Vn - Variação)
        const nomeN = r.conceito ? nomeBaseTarefa({ ...t, ficheiros: fxN }, vR, true) : '';
        set({ formatos: [...new Set([...(t.formatos || []), ...its.map(x => x.formato).filter(Boolean)])], ficheiros: fxN, ...(nomeN && nomeN !== t.nome ? { nome: nomeN } : {}) });
      }
    }
    return { ok, erros, faltam, pastaDir: (alvos.find(a => a.feito && a.pastaDir) || {}).pastaDir || null, desfazer };
  };
  // Depois de mudar os nomes: propõe também o nome da pasta do projeto e do .aep (Conceito_V1_V2) — quem muda é o lançador do After Effects
  const [pastaProj, setPastaProj] = useState(null); // { novo }
  const proporPastaProjeto = async dirExports => {
    if (!dirExports || !r.conceito) return;
    const vs = await versoesNaPasta(dirExports, r.conceito);
    const vsT = [...new Set([...vs, ...versoesTarefa, Number(versaoDe(verSug))])].filter(n => n > 0);
    const novo = nomePastaProjeto(r.conceito, vsT, v => campoVersao(fx, v, 'variacao', t));
    setPastaProj(novo ? { novo } : null);
  };
  const desfazerNomes = async () => {
    const alvos = historico.map(x => ({ id: x.itemId && lista.some(y => y.id === x.itemId) ? x.itemId : null, handle: x.handle, novo: x.antes }));
    const { ok, erros, faltam } = await renomearFicheiros(alvos, null, true);
    gravarHistorico(historico.filter((x, i) => !alvos[i].feito));
    setPedirPasta(null);
    setMsg(ok ? `↩ ${ok} ficheiro${ok === 1 ? '' : 's'} com o nome anterior outra vez${faltam.length ? ` · ${faltam.length} não encontrei` : ''}` : `⚠ Não consegui voltar ao nome anterior: ${erros[0] || (faltam.length ? 'não encontrei os ficheiros nas pastas que conheço' : 'sem autorização')}.`);
  };
  const [pedirPasta, setPedirPasta] = useState(null); // { alvos, depois } quando não encontrou os ficheiros
  const fimRenomear = ({ ok, erros, faltam, pastaDir }, alvos, depois) => {
    setPedirPasta(faltam.length ? { alvos: faltam, depois } : null);
    if (ok && pastaDir) proporPastaProjeto(pastaDir).catch(() => {});
    if (depois && ok && !faltam.length) setRenomeados(null);
    const pl = n => (n === 1 ? '' : 's');
    setMsg(faltam.length
      ? `${ok ? `✓ ${ok} renomeado${pl(ok)}. ` : ''}Não sei em que pasta ${faltam.length === 1 ? 'está' : 'estão'} ${faltam.length === 1 ? faltam[0].handle.name : `${faltam.length} ficheiros`} — escolhe a pasta dos exports deste projeto (ou a pasta onde tens todos os projetos).`
      : ok ? `✓ ${ok} ficheiro${pl(ok)} renomeado${pl(ok)} no PC${erros.length ? ` · ${erros[0]}` : ''}` : `⚠ Não consegui mudar o nome no PC: ${erros[0] || 'sem autorização'}.`);
  };
  const escolherEContinuar = async () => {
    if (!pedirPasta) return;
    let dir;
    try {
      const recente = (await pastasConhecidas()).filter(x => x && x.dir).sort((x, y) => (y.em || 0) - (x.em || 0))[0];
      dir = await escolherPastaExports(recente ? recente.dir : undefined);
    } catch (e) { if (!(e && e.name === 'AbortError')) setMsg(`⚠ ${e.message || e}`); return; }
    await lembrarPasta(dir, {});
    setMsg('A procurar os ficheiros nessa pasta…');
    fimRenomear(await renomearFicheiros(pedirPasta.alvos, dir), pedirPasta.alvos, pedirPasta.depois);
  };
  const renomearAgora = async () => {
    if (!temVersao && raiz && r.conceito) {
      try {
        const tk = tokenGuardado() || await tokenDrive(conta);
        const v = await adivinharVersao(tk); setVerSug(v);
        setMsg(`Versão confirmada no Drive: V${v}. Carrega outra vez em "Renomear no PC".`);
        return; // o browser pede um clique novo para deixar mexer nos ficheiros
      } catch (e) { setMsg(`⚠ ${e.message || e}`); return; }
    }
    const alvos = comHandle.map(it => ({ id: it.id, handle: it.handle, novo: nomeFinal(it) }));
    fimRenomear(await renomearFicheiros(alvos), alvos, false);
  };
  const renomearNoPc = async itens => {
    const alvos = itens.map(it => ({ handle: it.handle, novo: it.nomeNovo }));
    fimRenomear(await renomearFicheiros(alvos), alvos, true);
  };
  const [menuEntrega, setMenuEntrega] = useState(null); // pastaId com o ⋯ aberto
  const [nomesEntrega, setNomesEntrega] = useState(null); // pastaId com os nomes à vista
  const [videoEntrega, setVideoEntrega] = useState(null); // pastaId com o vídeo à vista
  const [verPasta, setVerPasta] = useState(null); // registo da versão cuja pasta estás a ver
  const verDrive = async (d0) => {
    const d = d0 || resultado;
    if (!d || !d.pastaId) return;
    setOcupadoDrive(true); setVerPasta(d);
    try { const tk = tokenGuardado() || await tokenDrive(conta); const fs = await filhosDrive(tk, d.pastaId, false); setNoDrive(fs.sort((a, b) => a.name.localeCompare(b.name))); }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
    setOcupadoDrive(false);
  };
  const juntarFolhaAgora = async () => {
    if (!resultado || !jogo || !jogo.sheet) return;
    setOcupadoDrive(true); setMsg('A juntar à spreadsheet…');
    let folha;
    try { const tk = tokenGuardado() || await tokenDrive(conta); folha = await juntarNaSpreadsheet(tk, jogo.sheet, resultado.nomeBase, resultado.url, [jogo.nome, jogo.nomeFatura, ...(jogo.aliases || [])]); }
    catch (e) { folha = { erro: String(e.message || e) }; }
    const reg = { ...resultado, folha }; setResultado(reg); set({ drive: reg }); setMsg('');
    setOcupadoDrive(false);
  };
  // Anular o envio de uma versão (ex.: foi para a V3 por engano): ficheiros e pasta para o lixo do Drive,
  // tira a linha da spreadsheet e a tarefa deixa de ter essa versão (o número fica livre outra vez)
  const [anular, setAnular] = useState(null); // pastaId à espera de confirmação
  // Pastas de versões que foram para o lixo do Drive (ou apagadas): a tarefa deixa de as mostrar como enviadas
  useEffect(() => {
    const vsD = [t.drive, ...((t.drive && t.drive.anteriores) || [])].filter(d => d && d.pastaId);
    if (!vsD.length) return undefined;
    let vivo = true;
    (async () => {
      const tk = tokenGuardado() || (ligadoSempre(conta || '_') ? await tokenDrive(conta).catch(() => null) : null);
      if (!tk) return;
      const mortas = [];
      for (const d of vsD) {
        try { const f = await driveApi(tk, `${DRV}/${d.pastaId}?fields=id,trashed&supportsAllDrives=true`); if (f && f.trashed) mortas.push(d); }
        catch (e) { if (e.status === 404) mortas.push(d); }
      }
      if (!vivo || !mortas.length) return;
      const ids = new Set(mortas.map(d => d.pastaId));
      const ficam = vsD.filter(d => !ids.has(d.pastaId)).map(({ anteriores, ...x }) => x).sort((x, y) => String(y.em || '').localeCompare(String(x.em || '')));
      const reg = ficam.length ? { ...ficam[0], ...(ficam.length > 1 ? { anteriores: ficam.slice(1) } : {}) } : null;
      setResultado(reg); set({ drive: reg, ...(reg ? { link: reg.url } : { link: '' }) });
      setMsg(`${mortas.map(d => `V${versaoDaPasta(d) || '?'}`).join(' e ')} ${mortas.length === 1 ? 'estava' : 'estavam'} no lixo do Drive — já não ${mortas.length === 1 ? 'aparece' : 'aparecem'} como enviada${mortas.length === 1 ? '' : 's'} nesta tarefa.`);
    })();
    return () => { vivo = false; };
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tirar uma versão só desta tarefa (ex.: veio de outra tarefa ao duplicar) — não mexe no Drive nem na spreadsheet
  const esquecerVersao = d => {
    const todas = [resultado, ...((resultado && resultado.anteriores) || [])].filter(x => x && x.pastaId && x.pastaId !== d.pastaId).map(({ anteriores, ...x }) => x);
    todas.sort((x, y) => String(y.em || '').localeCompare(String(x.em || '')));
    const reg = todas.length ? { ...todas[0], ...(todas.length > 1 ? { anteriores: todas.slice(1) } : {}) } : null;
    setResultado(reg); set({ drive: reg, ...(reg ? {} : { link: '' }) });
    setAnular(null);
    setMsg(`A V${versaoDaPasta(d) || '?'} já não está ligada a esta tarefa (no Drive e na spreadsheet ficou tudo igual).`);
  };
  const anularEnvio = async d => {
    if (!d || !d.pastaId) return;
    if (anular !== d.pastaId) { setAnular(d.pastaId); return; }
    setOcupadoDrive(true); setMsg(`A anular o envio da V${versaoDaPasta(d) || '?'}…`);
    try {
      const tk = tokenGuardado() || await tokenDrive(conta);
      // Só os ficheiros que ESTA tarefa enviou (a pasta pode ter ficheiros de outra tarefa com a mesma versão)
      const todosF = await filhosDrive(tk, d.pastaId, false);
      const meus = d.enviados || [];
      const fs = todosF.filter(f => meus.some(e => (e.id && e.id === f.id) || e.nome === f.name));
      for (const f of fs) await driveApi(tk, `${DRV}/${f.id}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      const subs = await filhosDrive(tk, d.pastaId, true);
      const sobram = todosF.length - fs.length;
      if (!subs.length && !sobram) await driveApi(tk, `${DRV}/${d.pastaId}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      let folhaTxt = '';
      if (jogo.sheet && d.nomeBase) { try { const tr = await tirarDaSpreadsheet(tk, jogo.sheet, [d.nomeBase], [jogo.nome, jogo.nomeFatura, ...(jogo.aliases || [])]); if (tr.apagadas) folhaTxt = ' e a linha da spreadsheet'; } catch (e) { /* fica */ } }
      const todas = [resultado, ...((resultado && resultado.anteriores) || [])].filter(x => x && x.pastaId && x.pastaId !== d.pastaId).map(({ anteriores, ...x }) => x);
      todas.sort((x, y) => String(y.em || '').localeCompare(String(x.em || '')));
      const reg = todas.length ? { ...todas[0], ...(todas.length > 1 ? { anteriores: todas.slice(1) } : {}) } : null;
      const v = versaoDaPasta(d);
      const fx0 = t.ficheiros || {};
      const fichNovo = String(fx0.versao || '') === String(v) && reg ? { ...fx0, versao: String(versaoDaPasta(reg) || '') } : fx0;
      setResultado(reg); set({ drive: reg, link: reg ? reg.url : '', ficheiros: fichNovo });
      if (infoVersao) setInfoVersao(null);
      setMsg(`↩ Envio da V${v || '?'} anulado: ${fs.length} ficheiro${fs.length === 1 ? '' : 's'}${subs.length || sobram ? '' : ' e a pasta'} no lixo do Drive${sobram ? ` (a pasta fica: tem ${sobram} ficheiro${sobram === 1 ? '' : 's'} que não são desta tarefa)` : ''}${folhaTxt}. ${t.trello && t.trello.id ? 'O link no cartão do Trello fica — apaga-o lá se quiseres. ' : ''}Para voltar aos nomes antigos no PC usa "Voltar ao nome anterior".`);
    } catch (e) { setMsg(`⚠ Não consegui anular: ${e.message || e}`); }
    setAnular(null); setOcupadoDrive(false);
  };
  // Spreadsheet com todas as versões desta tarefa, pela ordem (V1, V2…): tira as linhas que lá estejam e volta a juntá-las
  const [tirarFolha, setTirarFolha] = useState(false);
  const versoesFolha = () => (resultado ? [resultado, ...(resultado.anteriores || [])] : []).filter(d => d && d.url && d.nomeBase).sort((x, y) => versaoDaPasta(x) - versaoDaPasta(y));
  const refazerFolha = async soTirar => {
    const vs = versoesFolha();
    if (!vs.length || !jogo || !jogo.sheet) return;
    setOcupadoDrive(true); setMsg(soTirar ? 'A tirar da spreadsheet…' : 'A pôr na spreadsheet pela ordem das versões…');
    const nomesJ = [jogo.nome, jogo.nomeFatura, ...(jogo.aliases || [])];
    try {
      const tk = tokenGuardado() || await tokenDrive(conta);
      const tirou = await tirarDaSpreadsheet(tk, jogo.sheet, vs.map(d => d.nomeBase), nomesJ);
      if (tirou.erro) throw new Error(tirou.erro);
      const folhas = {};
      if (!soTirar) for (const d of vs) folhas[d.nomeBase] = await juntarNaSpreadsheet(tk, jogo.sheet, d.nomeBase, d.url, nomesJ);
      const comFolha = d => (d && d.nomeBase && vs.includes(d) ? { ...d, folha: soTirar ? null : folhas[d.nomeBase] } : d);
      const reg = { ...comFolha(resultado), ...(resultado.anteriores ? { anteriores: resultado.anteriores.map(comFolha) } : {}) };
      setResultado(reg); set({ drive: reg });
      setMsg(soTirar ? `✓ Tirei ${tirou.apagadas} linha${tirou.apagadas === 1 ? '' : 's'} da spreadsheet (${tirou.tab}).` : `✓ Na spreadsheet pela ordem: ${vs.map(d => `V${versaoDaPasta(d) || '?'}`).join(', ')} (${tirou.tab}).`);
    } catch (e) { setMsg(`⚠ Spreadsheet: ${e.message || e}`); }
    setTirarFolha(false);
    setOcupadoDrive(false);
  };
  const apagarNoDrive = async f => {
    if (aApagar !== f.id) { setAApagar(f.id); return; }
    setOcupadoDrive(true);
    try {
      const tk = tokenGuardado() || await tokenDrive(conta);
      await driveApi(tk, `${DRV}/${f.id}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      setNoDrive(l => (l || []).filter(x => x.id !== f.id));
      mudarRegisto((verPasta || resultado).pastaId, x => ({ ...x, enviados: (x.enviados || []).filter(e => e.id !== f.id && e.nome !== f.name) }));
      setMsg(`🗑 ${f.name} foi para o lixo do Drive (dá para recuperar lá durante 30 dias).`);
    } catch (e) { setMsg(`⚠ Não consegui apagar: ${e.message || e}`); }
    setAApagar(null); setOcupadoDrive(false);
  };
  // Todos os tamanhos desta pasta de uma vez (vão para o lixo do Drive; a pasta fica)
  const apagarTodosNoDrive = async () => {
    const fs = noDrive || [];
    if (!fs.length) return;
    if (aApagar !== '*') { setAApagar('*'); return; }
    setOcupadoDrive(true);
    const foram = [];
    try {
      const tk = tokenGuardado() || await tokenDrive(conta);
      for (const f of fs) {
        try { await driveApi(tk, `${DRV}/${f.id}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); foram.push(f); } catch (e) { /* segue para o próximo */ }
      }
    } catch (e) { setMsg(`⚠ Não consegui apagar: ${e.message || e}`); }
    if (foram.length) {
      const ids = new Set(foram.map(f => f.id)), nomes = new Set(foram.map(f => f.name));
      setNoDrive(l => (l || []).filter(x => !ids.has(x.id)));
      mudarRegisto((verPasta || resultado).pastaId, x => ({ ...x, enviados: (x.enviados || []).filter(e => !ids.has(e.id) && !nomes.has(e.nome)) }));
      setMsg(foram.length === fs.length ? `🗑 Os ${foram.length} ficheiros foram para o lixo do Drive (dá para recuperar lá durante 30 dias).` : `⚠ Só consegui apagar ${foram.length} de ${fs.length} ficheiros.`);
    }
    setAApagar(null); setOcupadoDrive(false);
  };
  // Também na memória da app: se fechares a tarefa a meio do envio, ao voltar vês o ponto em que está
  const mudarItem = (id, patch) => { const f = l => l.map(x => (x.id === id ? { ...x, ...patch } : x)); cacheEnvio.set(t.id, f(cacheEnvio.get(t.id) || lista)); setLista(f); };
  const repetidos = lista.filter(x => x.formato).map(x => x.formato).filter((f, i, a) => a.indexOf(f) !== i);
  // Verificação antes de enviar (só vídeos): se houver problemas, o botão fica bloqueado até carregares em "Enviar mesmo assim"
  const verif = statics ? { erros: [], avisos: [], ok: null } : verificarExports(lista, t.formatos);
  const assinaturaVerif = lista.map(x => `${x.id}:${x.formato}:${x.meta ? `${x.meta.w}x${x.meta.h}@${x.meta.dur}` : '-'}`).join('|') + '/' + (t.formatos || []).join(',');
  const [ignorarVerif, setIgnorarVerif] = useState('');
  const verifIgnorada = ignorarVerif === assinaturaVerif;
  // Vídeo novo com uma versão que já existe no Drive (e que não é a desta tarefa): não deixa avançar
  // "Esta entrega é…": nova versão ou substituir uma enviada (é o que decide a versão dos ficheiros)
  const [escolha, setEscolha] = useState(null); // { tipo: 'nova'|'substituir', v, porque }
  // Registos das versões enviadas por esta tarefa
  const regVersoes = () => (resultado ? [resultado, ...(resultado.anteriores || [])] : []).filter(d => d && d.url);
  const mudarRegisto = (pastaId, fn) => {
    if (!resultado) return;
    const m = d => (d && d.pastaId === pastaId ? fn(d) : d);
    const reg = { ...m(resultado), ...(resultado.anteriores ? { anteriores: resultado.anteriores.map(m) } : {}) };
    setResultado(reg); set({ drive: reg });
  };
  const nomesJogo = () => [jogo.nome, jogo.nomeFatura, ...(jogo.aliases || [])];
  // Spreadsheet de uma versão: juntar ou tirar
  const folhaVersao = async (d, tirar) => {
    if (!d || !jogo || !jogo.sheet || !d.nomeBase) return;
    setOcupadoDrive(true); setMsg(tirar ? 'A tirar da spreadsheet…' : 'A juntar à spreadsheet…');
    try {
      const tk = tokenGuardado() || await tokenDrive(conta);
      if (tirar) {
        const tr = await tirarDaSpreadsheet(tk, jogo.sheet, [d.nomeBase], nomesJogo());
        if (tr.erro) throw new Error(tr.erro);
        mudarRegisto(d.pastaId, x => ({ ...x, folha: null }));
        setMsg(`✓ V${versaoDaPasta(d) || '?'} tirada da spreadsheet (${tr.apagadas} linha${tr.apagadas === 1 ? '' : 's'}).`);
      } else {
        const folha = await juntarNaSpreadsheet(tk, jogo.sheet, d.nomeBase, d.url, nomesJogo());
        mudarRegisto(d.pastaId, x => ({ ...x, folha }));
        setMsg(folha && folha.ok ? `✓ V${versaoDaPasta(d) || '?'} na spreadsheet (${folha.tab}, linha ${folha.linha}).` : `⚠ Spreadsheet: ${(folha && folha.erro) || 'não consegui'}`);
      }
    } catch (e) { setMsg(`⚠ Spreadsheet: ${e.message || e}`); }
    setOcupadoDrive(false);
  };
  // Voltar à versão anterior dos ficheiros (o Drive guarda as versões antigas de cada ficheiro durante uns 30 dias)
  const [restaurar, setRestaurar] = useState(null); // pastaId à espera de confirmação
  const restaurarVersao = async d => {
    if (!d || !d.pastaId) return;
    if (restaurar !== d.pastaId) { setRestaurar(d.pastaId); return; }
    setRestaurar(null); setOcupadoDrive(true); setMsg('A procurar as versões anteriores no Drive…');
    let ok = 0, sem = 0; const nomes = {};
    try {
      const tk = tokenGuardado() || await tokenDrive(conta);
      const fs = await filhosDrive(tk, d.pastaId, false);
      for (const f of fs) {
        const rv = await driveApi(tk, `${DRV}/${f.id}/revisions?fields=revisions(id,modifiedTime,originalFilename,mimeType)&pageSize=200`);
        const revs = rv.revisions || [];
        if (revs.length < 2) { sem++; continue; }
        const ant = revs[revs.length - 2];
        setMsg(`A recuperar ${ant.originalFilename || f.name}…`);
        const resp = await fetch(`${DRV}/${f.id}/revisions/${ant.id}?alt=media`, { headers: { Authorization: `Bearer ${tk}` } });
        if (!resp.ok) { sem++; continue; }
        const blob = await resp.blob();
        const nome = ant.originalFilename || f.name;
        await enviarParaDrive(tk, { file: new File([blob], nome, { type: ant.mimeType || blob.type || 'video/mp4' }), nome, idExistente: f.id });
        if (nome !== f.name) nomes[f.name] = nome;
        ok++;
      }
      if (Object.keys(nomes).length) mudarRegisto(d.pastaId, x => ({ ...x, enviados: (x.enviados || []).map(e => (nomes[e.nome] ? { ...e, nome: nomes[e.nome] } : e)) }));
      setMsg(ok ? `✓ V${versaoDaPasta(d) || '?'}: ${ok} ficheiro${ok === 1 ? '' : 's'} de volta à versão anterior${sem ? ` · ${sem} sem versão anterior no Drive` : ''}.` : '⚠ O Drive não tem versões anteriores destes ficheiros (só existem depois de uma substituição, e duram cerca de 30 dias).');
    } catch (e) { setMsg(`⚠ Não consegui recuperar: ${e.message || e}`); }
    setOcupadoDrive(false);
  };
  const versaoEscolhida = Number(versaoDe(verSug));
  const infoAtual = infoVersao && infoVersao.conceito === r.conceito ? infoVersao : null;
  const outrasV = versoesDeOutras(trab, t, r.conceito);
  const proximaVersao = Math.max(0, ...((infoAtual && infoAtual.versoes) || []), ...outrasV, ...versoesTarefa) + 1;
  const versaoOcupada = !!(novoVideo && ((infoAtual && infoAtual.versoes.includes(versaoEscolhida)) || outrasV.includes(versaoEscolhida)) && String(versaoAnterior || '') !== String(versaoEscolhida) && !versoesTarefa.includes(versaoEscolhida));
  const pronto = lista.length > 0 && lista.every(x => x.formato && x.file) && !repetidos.length && raiz && r.conceito && !versaoOcupada && (!verif.erros.length || verifIgnorada);
  const enviar = async (subst = {}, opcoes = {}) => {
    if (!pronto || aEnviar || ENVIANDO.has(t.id)) return null;
    setAEnviar(true);
    // Fila: um envio de cada vez; os outros esperam (e continuam mesmo que feches a tarefa)
    const idF = `${t.id}:${Date.now()}`;
    ENVIANDO.set(t.id, idF);
    filaNovo({ id: idF, tarefaId: t.id, titulo: `${nomeBonitoC(r.conceito)} V${versaoDe(verSug)}`, total: lista.length, feitos: 0, prog: 0, estado: 'na fila', em: Date.now() });
    if (filaAtivos().length > 1) setMsg('Na fila: começa quando acabar o envio que está a decorrer (vê o quadro no canto).');
    const soltar = await filaVez();
    filaPor(idF, { estado: 'a enviar' });
    setMsg('A entrar na Google…');
    try {
      let token;
      try { token = await tokenDrive(conta); } catch (e) { throw e; }
      setMsg('A preparar as pastas…');
      let pConceito, pVersao;
      try {
        pConceito = await pastaDrive(token, raiz, r.conceito, false);
      } catch (e) {
        if (e.status === 401) { token = await tokenDrive(conta, true); pConceito = await pastaDrive(token, raiz, r.conceito, false); }
        else if (e.status === 404) throw new Error(`A conta ${conta || 'Google'} não vê a pasta do jogo. Confirma o link no separador Jogos e que a pasta está partilhada com essa conta.`);
        else throw e;
      }
      // Versão: escrita, da última vez, ou adivinhada agora pelo Drive
      let v = versaoLote || fx.versao || versaoAnterior || verSug;
      if (!v) { setMsg('A ver as versões que já estão no Drive…'); v = await adivinharVersao(token); setVerSug(v); }
      else if (novoVideo) {
        // Confirma no Drive que esta versão ainda não existe (um vídeo novo nunca vai para a pasta de outro)
        const info = await versoesNoDrive(token, raiz, r.conceito);
        setInfoVersao({ ...info, conceito: r.conceito });
        const outrasAgora = versoesDeOutras(trab, t, r.conceito);
        if ((info.versoes.includes(Number(v)) || outrasAgora.includes(Number(v))) && String(versaoAnterior || '') !== String(v) && !versoesTarefa.includes(Number(v))) {
          const prox = Math.max(0, ...info.versoes, ...outrasAgora, ...versoesTarefa) + 1;
          throw new Error(`Já existe um ${r.conceito}_V${v} (é de outro vídeo). Esta tem de ser a V${prox} — carrega em "Usar V${prox}".`);
        }
      }
      const nomeVersao = baseDe(v) || r.conceito;
      pVersao = nomeVersao === r.conceito ? pConceito : await pastaDrive(token, pConceito.id, nomeVersao, true);
      const existentes = await filhosDrive(token, pVersao.id, false);
      // A substituir uma versão já enviada: o ficheiro com o mesmo formato troca o antigo, mesmo que a duração ou a data no nome tenham mudado
      const chaveF = n => slugF(String(n || '').replace(/\.[A-Za-z0-9]{2,5}$/, '')).replace(/_\d+S(?=_|$)/, '').replace(/_\d{6}$/, '');
      const substituir = versoesTarefa.includes(Number(v));
      const usados = new Set();
      const enviados = [];
      const paraRenomear = [];
      let nSubst = 0;
      for (const item0 of lista) {
        const item = subst[item0.id] ? { ...item0, ...subst[item0.id] } : item0; // ficheiro acabado de renomear no PC
        const nome = nomeFinal(item, v);
        const ex = existentes.find(f => f.name === nome && !usados.has(f.id)) || (substituir ? existentes.find(f => !usados.has(f.id) && chaveF(f.name) === chaveF(nome)) : null);
        if (ex) usados.add(ex.id);
        // O ficheiro ainda está lá? (se a pasta do projeto mudou de nome depois de o arrastares, o browser perde-o)
        let ficheiro = item.file;
        try { await ficheiro.slice(0, 1).arrayBuffer(); } catch (e) {
          try { ficheiro = item.handle ? await item.handle.getFile() : null; if (ficheiro) await ficheiro.slice(0, 1).arrayBuffer(); } catch (e2) { ficheiro = null; }
        }
        if (!ficheiro) { mudarItem(item.id, { estado: 'erro', erro: 'Já não encontro este ficheiro no PC (a pasta ou o nome mudaram depois de o arrastares). Tira-o (✕) e arrasta-o outra vez.' }); continue; }
        mudarItem(item.id, { estado: 'a enviar', prog: 0, file: ficheiro });
        setMsg(`A enviar ${nome}…`);
        const nFeitos = enviados.length;
        filaPor(idF, { titulo: `${nomeBonitoC(r.conceito)} V${v}`, atual: item.formato || '', feitos: nFeitos, prog: nFeitos / lista.length });
        try {
          const res = await enviarParaDrive(token, { file: ficheiro, nome, pasta: pVersao.id, idExistente: ex ? ex.id : null }, p => { mudarItem(item.id, { prog: p }); filaPor(idF, { prog: (nFeitos + p) / lista.length }); });
          mudarItem(item.id, { estado: 'feito', prog: 1, substituido: !!ex }); if (ex) nSubst++;
          enviados.push({ nome, id: res.id || (ex && ex.id) || null, formato: item.formato });
          if (item.handle && !item.renomeado && item.handle.name !== nome) paraRenomear.push({ handle: item.handle, nomeNovo: nome });
        } catch (e) { mudarItem(item.id, { estado: 'erro', erro: String(e.message || e) }); }
      }
      const url = pVersao.webViewLink || `https://drive.google.com/drive/folders/${pVersao.id}`;
      // As pastas de outras versões já enviadas por esta tarefa ficam guardadas (ex.: V1 do vídeo novo + V2 da iteração)
      const antes = [t.drive, ...((t.drive && t.drive.anteriores) || [])].filter(d => d && d.pastaId && d.pastaId !== pVersao.id).map(({ anteriores, ...d }) => d);
      const reg = { pastaId: pVersao.id, url, pasta: pVersao.name || nomeVersao, versao: String(v), conceito: pConceito.name, nomeBase: [r.cod, r.tipo, baseDe(v)].filter(Boolean).join('_'), enviados, em: new Date().toISOString(), ...(antes.length ? { anteriores: antes.slice(0, 10) } : {}) };
      setRenomeados(paraRenomear.length ? paraRenomear : null);
      setResultado(reg);
      const durs = lista.map(x => durDe(x, v)).filter(Boolean);
      const formatos = [...new Set([...(t.formatos || []), ...lista.map(x => x.formato)])];
      const durV = (versoesTarefa.includes(Number(v)) && durs.length ? durs[0] : null) || campoVersao(fx, String(v), 'duracao') || (durs.length ? durs[0] : null);
      const fxEnv = { ...fxComVersao(fx, t, v, { variacao: campoVersao(fx, String(v), 'variacao', t) ?? '', duracao: durV ?? null }), versao: String(v) };
      const nomeEnv = r.conceito ? nomeBaseTarefa({ ...t, ficheiros: fxEnv }, v, true) : '';
      set({ drive: reg, link: url, formatos, ficheiros: fxEnv, ...(nomeEnv && nomeEnv !== t.nome ? { nome: nomeEnv } : {}) });
      // Spreadsheet do jogo: se for uma Google Sheet, junta a linha sozinha (nome com o link da pasta)
      let folha = null;
      if (opcoes.juntarFolha && jogo.sheet && enviados.length) { // só quando escolhes "Juntar à spreadsheet"
        setMsg('A juntar à spreadsheet…');
        try { folha = await juntarNaSpreadsheet(token, jogo.sheet, reg.nomeBase, url, [jogo.nome, jogo.nomeFatura, ...(jogo.aliases || [])]); } catch (e) { folha = { erro: String(e.message || e) }; }
        reg.folha = folha;
        set({ drive: reg });
        setResultado({ ...reg });
      }
      // Trello: junta o link da pasta ao cartão desta tarefa (não mexe na lista do cartão)
      if (t.trello && t.trello.id && enviados.length) {
        setMsg('A juntar o link ao cartão do Trello…');
        // Esta versão e as anteriores que ainda não estejam no cartão (ex.: a V1 enviada antes de haver cartão)
        const res = await partilharNoTrello({ ...t, drive: reg }, t.trello.id);
        const novo = res.drive;
        if (res.erro && !(novo.trello && novo.trello.ok && novo.trello.cartao === t.trello.id)) novo.trello = { erro: res.erro };
        Object.assign(reg, novo);
        set({ drive: novo }); setResultado({ ...novo, trelloN: res.n });
      }
      setMsg(enviados.length === lista.length ? `✓ ${enviados.length} ficheiro${enviados.length === 1 ? '' : 's'} no Drive${nSubst ? ` (${nSubst === enviados.length ? 'todos substituídos' : `${nSubst} substituído${nSubst === 1 ? '' : 's'}`} — o link é o mesmo)` : ''}` : `Enviei ${enviados.length} de ${lista.length}. Vê os erros em baixo e tenta outra vez.`);
      if (enviados.length === lista.length) { setLista([]); cacheEnvio.set(t.id, []); idbGravar(`envio-${t.id}`, null); setVersaoLote(null); setEscolha(null); }
      const tudo = enviados.length === lista.length;
      filaPor(idF, tudo ? { estado: 'feito', feitos: enviados.length, prog: 1, link: url, fim: Date.now() } : { estado: 'erro', feitos: enviados.length, erro: `Enviei ${enviados.length} de ${lista.length}. Abre a tarefa para ver os erros.`, fim: Date.now() });
      avisarNoBrowser(tudo ? `✓ ${nomeBonitoC(r.conceito)} V${v} no Drive` : `⚠ ${nomeBonitoC(r.conceito)} V${v}: envio incompleto`, tudo ? `${enviados.length} ficheiro${enviados.length === 1 ? '' : 's'} enviado${enviados.length === 1 ? '' : 's'}. O link está na fila (canto do ecrã).` : `Enviei ${enviados.length} de ${lista.length}.`);
      setAEnviar(false); ENVIANDO.delete(t.id); soltar();
      return reg;
    } catch (e) {
      setMsg(`⚠ ${e.message || e}`);
      filaPor(idF, { estado: 'erro', erro: String(e.message || e), fim: Date.now() });
      avisarNoBrowser(`⚠ O envio de ${nomeBonitoC(r.conceito)} falhou`, String(e.message || e));
    }
    setAEnviar(false); ENVIANDO.delete(t.id); soltar();
    return null;
  };
  // Um só botão: muda o nome no PC (se escolheste) e envia; a spreadsheet só se marcaste a caixa
  const [mudarNoPc, setMudarNoPc] = useState(true);
  const [juntarAFolha, setJuntarAFolha] = useState(false);
  const renomearEEnviar = async () => {
    // Para avisar no fim, mesmo que estejas noutra janela (o browser pergunta uma vez)
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch (e) { /* */ }
    const subst = {};
    const porMudar = mudarNoPc ? comHandle.filter(x => !x.renomeado && x.handle && x.handle.name !== nomeFinal(x)) : [];
    if (porMudar.length) {
      if (!temVersao && raiz && r.conceito) {
        try { const tk = tokenGuardado() || await tokenDrive(conta); const v = await adivinharVersao(tk); setVerSug(v); setMsg(`Versão confirmada no Drive: V${v}. Carrega outra vez no botão.`); } catch (e) { setMsg(`⚠ ${e.message || e}`); }
        return; // o browser pede um clique novo para deixar mexer nos ficheiros
      }
      const alvos = porMudar.map(it => ({ id: it.id, handle: it.handle, novo: nomeFinal(it) }));
      const res = await renomearFicheiros(alvos);
      fimRenomear(res, alvos, false);
      for (const a of alvos) if (a.feito && a.handleNovo) { try { subst[a.id] = { handle: a.handleNovo, file: await a.handleNovo.getFile(), renomeado: true }; } catch (e) { /* fica o que estava */ } }
      if (res.faltam.length || res.erros.length) return; // primeiro resolve os nomes (a mensagem diz o quê)
    }
    await enviar(subst, { juntarFolha: juntarAFolha && !!(jogo && jogo.sheet) });
  };
  const btn = `px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`;
  if (!jogo) return null;
  return (
    <div className={`mt-3 pt-3 border-t space-y-2 ${claro ? 'border-slate-200' : 'border-slate-700/60'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[15px] font-semibold flex-1">Enviar para o Drive</p>
        {raiz && r.conceito && <span className={`text-xs truncate max-w-[60%] ${sub}`} title={`${statics ? 'Statics' : 'Vídeos'} › ${r.conceito} › ${baseDe(verSug)}`}>📁 {baseDe(verSug)}</span>}
      </div>
      {!raiz ? <p className={`text-xs ${sub}`}>Junta o link da pasta do Drive {statics ? 'dos banners/statics' : 'dos vídeos'} no jogo {jogo.nome} (cliente → Jogos).</p> : (
        <>
          {ENVIANDO.has(t.id) && !aEnviar && <p className="text-xs text-blue-400">A enviar esta tarefa… acompanha no quadro no canto do ecrã (podes continuar a trabalhar).</p>}
          {!lista.length && !aEnviar && !expDesligado && (() => {
            const linha = `flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${sub}`;
            const lnk = 'text-blue-500 hover:underline';
            if (achados && achados.itens.length) return (
              <div className={`rounded-xl border ${claro ? 'border-blue-200 bg-blue-50/60' : 'border-blue-500/40 bg-blue-500/[0.07]'}`}>
                <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
                  <IcoT n="pasta" className={`w-5 h-5 mt-0.5 ${claro ? 'text-blue-600' : 'text-blue-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Encontrei {achados.itens.length} export{achados.itens.length === 1 ? '' : 's'} novo{achados.itens.length === 1 ? '' : 's'}</p>
                    <p className={`text-[11.5px] ${sub}`}>Na @Exports de <code className={claro ? 'text-slate-700' : 'text-slate-200'}>{achados.projeto}</code> · desde o último envio</p>
                  </div>
                </div>
                {(() => {
                  const fmtA = x => formatoDoFicheiro(x.file.name, x.meta);
                  const durs = achados.itens.map(x => (x.meta && x.meta.dur > 0 ? x.meta.dur : null)).filter(Boolean);
                  const freq = d => durs.filter(x => Math.abs(x - d) <= 0.03).length;
                  const durRef0 = durs.length ? durs.slice().sort((p, q) => freq(q) - freq(p))[0] : null; // a mais comum
                  const empate = durs.length > 1 && durRef0 != null && freq(durRef0) < 2; // ninguém repete: não dá para saber qual está certa
                  const durRef = empate ? null : durRef0;
                  const tem = new Set(achados.itens.map(fmtA).filter(Boolean));
                  return (
                    <>
                      <div className="px-3">
                        {achados.itens.map(x => {
                          const f = fmtA(x); const m = x.meta; const esp = f && RES_FORMATO[f];
                          const resMal = m && m.w && f && (() => { const [a, b] = f.split(':').map(Number); return Math.abs(m.w / m.h - a / b) > 0.01; })();
                          const resInvulgar = !resMal && m && m.w && esp && (m.w !== esp[0] || m.h !== esp[1]);
                          const durMal = m && m.dur > 0 && ((durRef && Math.abs(m.dur - durRef) > 0.03) || empate);
                          const quando = (() => { const mm = Math.round((Date.now() - x.file.lastModified) / 60000); return mm < 1 ? 'agora' : mm < 60 ? `há ${mm} min` : mm < 1440 ? `há ${Math.round(mm / 60)} h` : dataCurta(new Date(x.file.lastModified).toISOString()); })();
                          return (
                            <div key={x.file.name} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2 border-t text-xs ${claro ? 'border-blue-100' : 'border-blue-500/15'}`}>
                              <MiniaturaFicheiro file={x.file} formato={f} alto={40} />
                              <div className="min-w-0">
                                <code className="block truncate" title={x.file.name}>{x.file.name}</code>
                                <span className={`block tabular-nums ${resMal || durMal ? 'text-amber-500' : sub}`}>
                                  {[m && m.w ? `${m.w}×${m.h}` : null, m && m.dur > 0 ? segTxt(m.dur) : null, `${(x.file.size / 1048576).toFixed(0)} MB`, quando].filter(Boolean).join(' · ')}
                                  {resMal ? ` · não é ${f}${esp ? ` (devia ser ${esp[0]}×${esp[1]})` : ''}` : resInvulgar ? ` · o normal é ${esp[0]}×${esp[1]}` : ''}
                                  {durMal ? (empate ? ' · duração diferente dos outros' : ` · ${m.dur < durRef ? 'menos' : 'mais'} ${segTxt(Math.abs(m.dur - durRef))} que os outros`) : ''}
                                </span>
                              </div>
                              <span className={`shrink-0 font-semibold ${f ? (claro ? 'text-blue-700' : 'text-blue-300') : 'text-amber-500'}`}>{f ? `${f} ✓` : 'formato?'}</span>
                            </div>
                          );
                        })}
                      </div>
                      {!statics && (t.formatos || []).length > 0 && <div className={`px-3 pt-2 border-t ${claro ? 'border-blue-100' : 'border-blue-500/15'}`}><FormatosPedidos pedidos={t.formatos} tem={tem} claro={claro} /></div>}
                    </>
                  );
                })()}
                <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => { achados.itens.forEach(x => ignoradosRef.current.add(x.file.name)); setAchados({ ...achados, itens: [] }); }} className={`px-3 py-1.5 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-white' : 'border-slate-600 hover:bg-white/5'}`}>Ignorar</button>
                  <button type="button" onClick={usarAchados} className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Usar {achados.itens.length === 1 ? 'este' : `estes ${achados.itens.length}`}</button>
                </div>
              </div>
            );
            if (estadoExp === 'a procurar') return <p className={linha}>A procurar exports novos na pasta dos projetos…</p>;
            if (estadoExp === 'sem-raiz') return <p className={linha}><button type="button" onClick={() => procurarExports(true)} className={lnk} title="A app passa a encontrar sozinha os exports novos na @Exports do projeto">Encontrar os exports sozinho (escolher a pasta dos projetos)</button><button type="button" onClick={() => { setExpDesligado(true); try { localStorage.setItem('exp-auto-off', '1'); } catch (e) { /* */ } }} className={`${sub} hover:text-red-400`} aria-label="Não mostrar mais">✕</button></p>;
            if (estadoExp === 'sem-licenca') return <p className={linha}><button type="button" onClick={() => procurarExports(true)} className={lnk}>Procurar exports novos</button><span>(o browser pede autorização à pasta dos projetos)</span></p>;
            if (achados && achados.nada) return <p className={linha}>Não encontrei o projeto de {nomeBonitoC(r.conceito)} na pasta dos projetos. <button type="button" onClick={() => procurarExports(true, true)} className={lnk}>Escolher outra pasta</button></p>;
            if (achados) return <p className={linha}>Sem exports novos em <code>{achados.projeto}</code>. <button type="button" onClick={() => procurarExports(true)} className={lnk}>Ver outra vez</button></p>;
            return null;
          })()}
          <div
            onDragOver={e => { e.preventDefault(); if (!arrastarD) setArrastarD(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastarD(false); }} onDrop={e => {
              e.preventDefault(); setArrastarD(false);
              const its = Array.from(e.dataTransfer.items || []).filter(i => i.kind === 'file');
              const hs = its.map(i => (typeof i.getAsFileSystemHandle === 'function' ? i.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null)));
              const fs = its.length ? its.map(i => i.getAsFile()) : Array.from(e.dataTransfer.files || []);
              Promise.all(hs).then(h => juntar(fs, h));
            }}
            onClick={() => inRef.current && inRef.current.click()}
            className={`rounded-xl border-2 border-dashed px-3 ${lista.length ? 'py-4 min-h-[72px]' : 'py-8 min-h-[150px]'} flex flex-col items-center justify-center gap-1 text-center cursor-pointer transition-colors ${arrastarD ? 'border-blue-400 bg-blue-500/10' : claro ? 'border-slate-300 hover:bg-slate-50' : 'border-slate-600 hover:bg-white/[0.03]'} ${sub}`}>
            <span className={`text-2xl leading-none ${arrastarD ? 'text-blue-400' : ''}`}>⬇</span>
            <span className={`text-sm font-medium ${claro ? 'text-slate-700' : 'text-slate-200'}`}>{lista.length ? 'Arrasta mais exports' : 'Arrasta os exports para aqui'}</span>
            <span className="text-xs">ou carrega para escolher</span>
            <input ref={inRef} type="file" multiple accept="video/*,image/*" className="hidden" onChange={e => { juntar(e.target.files); e.target.value = ''; }} />
          </div>
          {lista.length > 0 && (() => {
            // "Esta entrega é…": nova versão ou substituir uma que já foi enviada
            const atual = Number(versaoDe(verSug));
            const subst = versoesTarefa.includes(atual);
            const nova = versoesTarefa.length ? (subst ? Math.max(...versoesTarefa, ...((infoAtual && infoAtual.versoes) || []), ...outrasV) + 1 : atual) : atual;
            const vSub = subst ? atual : (escolha && escolha.tipo === 'substituir' ? escolha.v : Math.max(0, ...versoesTarefa));
            const cartao = (on, cor) => `text-left p-3 rounded-xl border-2 flex flex-col gap-1 disabled:opacity-50 ${on ? (cor === 'amber' ? 'border-amber-500 bg-amber-500/10' : 'border-blue-500 bg-blue-500/10') : claro ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-700 hover:bg-white/[0.03]'}`;
            const bola = (on, cor) => <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${on ? (cor === 'amber' ? 'border-4 border-amber-500 bg-white' : 'border-4 border-blue-500 bg-white') : `border-2 ${claro ? 'border-slate-300' : 'border-slate-500'}`}`} />;
            if (!versoesTarefa.length) return <p className={`text-xs ${sub}`}>Esta entrega é a <b className={claro ? 'text-slate-800' : 'text-slate-100'}>V{atual}</b> (a primeira desta tarefa){pecasN > 1 ? ` · esta tarefa tem ${pecasN} peças: cada uma vai para a sua pasta` : ''}.</p>;
            return (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Esta entrega é…</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" disabled={aEnviar} onClick={() => { setVersaoLote(String(nova)); setEscolha({ tipo: 'nova', v: nova }); }} className={cartao(!subst)} aria-pressed={!subst}>
                    <span className="flex items-center gap-2 text-sm font-semibold">{bola(!subst)}Nova versão · V{nova}</span>
                    <span className={`text-[11px] leading-snug ${sub}`}>Outro vídeo ou outra variação.</span>
                  </button>
                  <div className={cartao(subst, 'amber')}>
                    <button type="button" disabled={aEnviar} onClick={() => { setVersaoLote(String(vSub)); setEscolha({ tipo: 'substituir', v: vSub }); }} className="text-left flex flex-col gap-1" aria-pressed={subst}>
                      <span className="flex items-center gap-2 text-sm font-semibold">{bola(subst, 'amber')}Substituir a V{vSub}</span>
                      <span className={`text-[11px] leading-snug ${sub}`}>Correção depois de feedback. O link do Drive, a linha da spreadsheet e o Trello ficam iguais.</span>
                    </button>
                    {versoesTarefa.length > 1 && (
                      <select value={String(vSub)} disabled={aEnviar} onChange={e => { setVersaoLote(e.target.value); setEscolha({ tipo: 'substituir', v: Number(e.target.value) }); }} className={`${inputClass} !w-auto text-xs py-1 mt-1`} aria-label="Versão a substituir">
                        {versoesTarefa.slice().reverse().map(n => <option key={n} value={n}>V{n}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                {escolha && escolha.porque && <p className={`text-[11px] ${sub}`}>Sugestão da app: <b>{escolha.tipo === 'substituir' ? `substituir a V${escolha.v}` : 'nova versão'}</b> — {escolha.porque}.</p>}
                {pecasN > 1 && <p className={`text-[10px] ${sub}`}>Esta tarefa tem {pecasN} peças: cada uma vai para a sua pasta.</p>}
              </div>
            );
          })()}
          {lista.length > 0 && (
            <div className="space-y-1.5">
              <p className={`text-[11px] uppercase tracking-wide ${sub}`}>{versoesTarefa.includes(Number(versaoDe(verSug))) ? `O que troca na V${versaoDe(verSug)}` : 'Nomes que vão ficar'}</p>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
              <PreviewExport lista={lista} claro={claro} sub={sub} pedidos={statics ? [] : t.formatos} />
              <div className="flex-1 min-w-0 w-full space-y-2">
              {lista.map(item => (
                <div key={item.id} className="text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <select value={item.formato || ''} onChange={e => mudarItem(item.id, { formato: e.target.value || null })} disabled={aEnviar} className={`${inputClass} !w-20 text-xs py-1`} aria-label="Formato">
                      <option value="">?</option>{FORMATOS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <code className="flex-1 min-w-0 break-all leading-snug" title={`${nomeDe(item)} → ${nomeFinal(item)}`}>{nomeFinal(item)}</code>
                    <span className={`shrink-0 tabular-nums ${sub}`}>{item.file ? `${(item.file.size / 1048576).toFixed(0)} MB` : 'sem acesso'}</span>
                    {!aEnviar && item.estado !== 'feito' && <button type="button" onClick={() => setLista(l => l.filter(x => x.id !== item.id))} className={`shrink-0 ${sub} hover:text-red-400`} aria-label="Tirar">✕</button>}
                  </div>
                  {(item.estado === 'a enviar' || item.estado === 'feito') && <div className={`h-1 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700'}`}><div className={`h-full ${item.estado === 'feito' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.round(item.prog * 100)}%` }} /></div>}
                  {item.estado === 'erro' && <p className="text-red-400">{item.erro}</p>}
                  <p className={`truncate text-[10px] opacity-70 ${sub}`}>{item.renomeado && item.nomeAntigo && item.nomeAntigo !== nomeDe(item) ? <>✓ renomeado no PC · era {item.nomeAntigo}</> : <>de {nomeDe(item)}</>}{item.meta && item.meta.w ? ` · ${item.meta.w}×${item.meta.h}` : ''}{item.meta && item.meta.dur ? ` · ${segTxt(item.meta.dur)}` : ''}</p>
                </div>
              ))}
              </div>
              </div>
              {repetidos.length > 0 && <p className="text-xs text-amber-500">Há dois ficheiros com o mesmo formato ({[...new Set(repetidos)].join(', ')}).</p>}
              {lista.some(x => !x.formato) && <p className="text-xs text-amber-500">Escolhe o formato dos ficheiros com "?".</p>}
              {lista.some(x => x.estado !== 'feito') && (verif.erros.length > 0 ? (
                <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 text-[13px] ${verifIgnorada ? (claro ? 'border-slate-200' : 'border-slate-700') : 'border-red-500/50 bg-red-500/[0.07]'}`} role="alert">
                  <p className={`font-semibold ${verifIgnorada ? sub : 'text-red-400'}`}>{verifIgnorada ? 'Vais enviar mesmo com estes problemas:' : 'Antes de enviar, confirma:'}</p>
                  {verif.erros.map((e, i) => <p key={'e' + i} className={verifIgnorada ? sub : (claro ? 'text-red-700' : 'text-red-300')}>✕ {e}</p>)}
                  {verif.avisos.map((e, i) => <p key={'a' + i} className="text-amber-500">⚠ {e}</p>)}
                  <div className="flex justify-end pt-0.5">
                    {verifIgnorada
                      ? <button type="button" onClick={() => setIgnorarVerif('')} className={`text-xs ${sub} hover:text-blue-400 underline`}>Afinal não</button>
                      : <button type="button" onClick={() => setIgnorarVerif(assinaturaVerif)} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-300 hover:bg-white' : 'border-slate-600 hover:bg-white/5'}`} title="Ex.: só o 9:16 para aprovação do cliente">Enviar mesmo assim</button>}
                  </div>
                </div>
              ) : verif.ok ? (
                <div className="space-y-0.5 text-[13px]">
                  <p className="text-emerald-500">✓ Verificado: {verif.ok}</p>
                  {verif.avisos.map((e, i) => <p key={'a' + i} className="text-amber-500">⚠ {e}</p>)}
                </div>
              ) : null)}
              <div className={`rounded-lg border p-2.5 space-y-1.5 text-xs ${claro ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/40'}`}>
                {comHandle.length > 0 ? (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={mudarNoPc} onChange={e => setMudarNoPc(e.target.checked)} disabled={aEnviar} className="accent-blue-500" /> Mudar também o nome dos ficheiros no PC</label>
                ) : <p className={sub} title="O browser só deixa mudar o nome de ficheiros arrastados do Explorador (no Chrome)">Para mudar o nome no PC, arrasta os ficheiros do Explorador.</p>}
                {jogo.sheet && <label className="flex items-center gap-2"><input type="checkbox" checked={juntarAFolha} onChange={e => setJuntarAFolha(e.target.checked)} disabled={aEnviar} className="accent-blue-500" /> Juntar à spreadsheet</label>}
                {r.conceito && <p className={sub}>A tarefa passa a chamar-se <b className={claro ? 'text-slate-700' : 'text-slate-200'}>{nomeBaseTarefa({ ...t, ficheiros: { ...fx, versao: String(versaoDe(verSug)) } }, versaoDe(verSug), true)}</b>.</p>}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {(() => { const vA = Number(versaoDe(verSug)); const sub2 = versoesTarefa.includes(vA); const vaiMudar = mudarNoPc && comHandle.some(x => !x.renomeado && x.handle && x.handle.name !== nomeFinal(x));
                  return <button type="button" disabled={!pronto || aEnviar || ENVIANDO.has(t.id)} onClick={renomearEEnviar} className={`px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 ${sub2 ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}`}>{aEnviar ? 'A enviar…' : sub2 ? `${vaiMudar ? 'Renomear e substituir' : 'Substituir'} ${lista.length} na V${vA}` : `${vaiMudar ? 'Renomear e enviar' : 'Enviar'} V${vA}`}</button>; })()}
              </div>
            </div>
          )}
          {versaoOcupada && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-500">
              <span>⚠ Já existe um {r.conceito}_V{versaoEscolhida} (é de outro vídeo). Esta tem de ser a <b>V{proximaVersao}</b>.</span>
              <button type="button" onClick={() => { set({ ficheiros: { ...fx, versao: String(proximaVersao) } }); setVerSug(String(proximaVersao)); if (versaoLote) setVersaoLote(String(proximaVersao)); }} className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-medium">Usar V{proximaVersao}</button>
            </div>
          )}
          {msg && <p className={`text-xs ${/^⚠/.test(msg) ? 'text-red-400' : /^✓/.test(msg) ? 'text-emerald-500' : sub}`}>{msg}</p>}
          {semAcesso.length > 0 && (
            <button type="button" onClick={darAcesso} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/15 border border-blue-500/50 text-blue-400 hover:bg-blue-500/25">🔓 Voltar a abrir os {semAcesso.length} ficheiro{semAcesso.length === 1 ? '' : 's'} (o browser pede autorização depois de recarregar)</button>
          )}
          {pedirPasta && (
            <button type="button" onClick={escolherEContinuar} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-500 hover:bg-amber-500/25">📁 Escolher a pasta dos exports</button>
          )}
          {renomeados && renomeados.length > 0 && (
            <button type="button" onClick={() => renomearNoPc(renomeados)} className={`${btn} !border-emerald-500/50 text-emerald-500`}>✏ Dar o mesmo nome {renomeados.length === 1 ? 'ao ficheiro' : `aos ${renomeados.length} ficheiros`} no PC</button>
          )}
          {/* Entregas: uma linha por versão enviada, com tudo o resto no ⋯ */}
          {regVersoes().length > 0 && (() => {
            const vs = regVersoes().slice().sort((x, y) => versaoDaPasta(y) - versaoDaPasta(x));
            const item = 'w-full text-left px-2 py-1.5 rounded-md text-xs disabled:opacity-40 ' + (claro ? 'hover:bg-slate-100' : 'hover:bg-white/10');
            const grupo = txt => <p className={`px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide ${sub}`}>{txt}</p>;
            return (
              <div className="space-y-2 pt-1">
                <p className="text-sm font-medium">Entregas desta tarefa</p>
                {vs.map(d => {
                  const v = versaoDaPasta(d);
                  const varia = campoVersao(t.ficheiros || {}, v, 'variacao', t) || '';
                  const naFolha = d.folha && d.folha.ok;
                  const aberto = menuEntrega === d.pastaId;
                  const nomesAb = nomesEntrega === d.pastaId;
                  const videoAb = videoEntrega === d.pastaId;
                  const linkFolha = naFolha && jogo.sheet ? (() => { const id = (/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(jogo.sheet)) || [])[1]; return id && d.folha.gid != null ? `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${d.folha.gid}&range=A${d.folha.linha}` : jogo.sheet; })() : null;
                  return (
                    <div key={d.pastaId || d.url} className={`rounded-xl border ${aberto ? 'border-blue-500/60' : claro ? 'border-slate-200' : 'border-slate-700/70'} ${claro ? 'bg-white' : 'bg-slate-900/30'}`}>
                      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
                        <span className={`shrink-0 inline-flex items-center justify-center min-w-[2.25rem] h-7 px-1.5 rounded-md text-sm font-semibold ${claro ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/15 text-blue-300'}`}>{v ? `V${v}` : '—'}</span>
                        {(d.enviados || []).some(e => e.id) && <MiniaturaVersao ficheiros={d.enviados} conta={conta} claro={claro} rotulo={`Ver o vídeo da V${v}`} onClick={() => setVideoEntrega(videoAb ? null : d.pastaId)} />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" title={d.pasta}>{varia ? emTitulo(varia) : (d.pasta || '')}</p>
                          <p className={`text-[11px] ${sub}`}>{d.em ? new Date(d.em).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : ''}{(d.enviados || []).length ? ` · ${d.enviados.length} ficheiro${d.enviados.length === 1 ? '' : 's'}` : ''}{jogo.sheet ? <> · {naFolha ? <span className="text-emerald-500">✓ spreadsheet, linha {d.folha.linha}</span> : <span className="text-amber-500">não está na spreadsheet</span>}</> : null}</p>
                        </div>
                        <button type="button" onClick={() => setMenuEntrega(aberto ? null : d.pastaId)} aria-expanded={aberto} aria-label={`Mais opções da ${v ? `V${v}` : 'versão'}`} className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg border ${aberto ? 'border-blue-500 text-blue-400' : claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 sm:pl-[3.6rem] text-xs">
                        <a href={urlAbrir(d.url, t.cid)} target="_blank" rel="noopener noreferrer" className={btn}>Drive ↗</a>
                        {jogo.sheet && (naFolha ? <a href={urlAbrir(linkFolha, t.cid)} target="_blank" rel="noopener noreferrer" className={btn}>Spreadsheet ↗</a>
                          : <button type="button" disabled={ocupadoDrive || !d.nomeBase} onClick={() => folhaVersao(d, false)} className={`${btn} !border-blue-500/50 text-blue-400 disabled:opacity-40`}>Juntar à spreadsheet</button>)}
                        {(d.enviados || []).some(e => e.id) && <button type="button" onClick={() => setVideoEntrega(videoAb ? null : d.pastaId)} className={`${btn} ${videoAb ? '!border-blue-500/60 text-blue-400' : ''}`} aria-expanded={videoAb}>{videoAb ? 'Esconder vídeo' : '▶ Vídeo'}</button>}
                        {(d.enviados || []).length > 0 && <button type="button" onClick={() => setNomesEntrega(nomesAb ? null : d.pastaId)} className={btn} aria-expanded={nomesAb}>{nomesAb ? 'Esconder nomes' : 'Nomes'}</button>}
                      </div>
                      {videoAb && <div className="px-3 pb-3 sm:pl-[3.6rem]"><VerVideo key={d.pastaId} conta={conta} ficheiros={d.enviados} claro={claro} sub={sub} iniciar /></div>}
                      {nomesAb && (
                        <div className="px-3 pb-2.5 sm:pl-[3.6rem] space-y-1">
                          {(d.enviados || []).map((e, i) => <div key={i} className="flex items-center gap-2 text-xs"><span className={`w-9 shrink-0 ${sub}`}>{e.formato}</span><code className="flex-1 min-w-0 break-all leading-snug">{e.nome}</code><button type="button" onClick={() => { copiar(e.nome); setMsg(`✓ Copiado: ${e.nome}`); }} className={btn}>Copiar</button></div>)}
                        </div>
                      )}
                      {aberto && (
                        <div role="menu" className={`mx-3 mb-3 rounded-lg border p-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 ${claro ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                          <div>
                            {grupo('Drive')}
                            <button type="button" role="menuitem" disabled={aEnviar} onClick={() => { setVersaoLote(String(v)); setEscolha({ tipo: 'substituir', v }); setMenuEntrega(null); setMsg(`Arrasta os exports novos da V${v} para a caixa lá em cima: trocam os ficheiros dela no Drive.`); if (inRef.current && inRef.current.parentElement) inRef.current.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className={item}>Substituir ficheiros</button>
                            <button type="button" role="menuitem" disabled={ocupadoDrive} onClick={() => { verDrive(d); setMenuEntrega(null); }} className={item}>Ver / apagar ficheiros</button>
                            <button type="button" role="menuitem" disabled={ocupadoDrive} onClick={() => restaurarVersao(d)} onBlur={() => setTimeout(() => setRestaurar(x => (x === d.pastaId ? null : x)), 200)} className={`${item} ${restaurar === d.pastaId ? 'text-amber-500 font-medium' : ''}`}>{restaurar === d.pastaId ? 'Confirmar: voltar à versão anterior' : 'Voltar à versão anterior'}</button>
                          </div>
                          {jogo.sheet && (
                            <div>
                              {grupo('Spreadsheet')}
                              <button type="button" role="menuitem" disabled={ocupadoDrive || naFolha || !d.nomeBase} onClick={() => folhaVersao(d, false)} className={item}>Juntar</button>
                              <button type="button" role="menuitem" disabled={ocupadoDrive || versoesFolha().length < 1} onClick={() => refazerFolha(false)} className={item} title="Tira as linhas desta tarefa e volta a pô-las pela ordem das versões">Refazer pela ordem</button>
                              <button type="button" role="menuitem" disabled={ocupadoDrive || !d.nomeBase} onClick={() => folhaVersao(d, true)} className={item}>Tirar</button>
                            </div>
                          )}
                          {historico.length > 0 && (
                            <div className={`sm:col-span-1 border-t pt-1.5 ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
                              {grupo('No PC')}
                              <button type="button" role="menuitem" disabled={aEnviar} onClick={() => { setMenuEntrega(null); desfazerNomes(); }} className={item} title={historico.map(x => `${x.depois} → ${x.antes}`).join('\n')}>Voltar aos nomes anteriores ({historico.length})</button>
                            </div>
                          )}
                          <div className={`border-t pt-1.5 ${claro ? 'border-slate-200' : 'border-slate-700'} ${historico.length > 0 ? '' : 'sm:col-span-2'}`}>
                            {grupo('Desfazer')}
                            <button type="button" role="menuitem" disabled={ocupadoDrive} onClick={() => anularEnvio(d)} onBlur={() => setTimeout(() => setAnular(a => (a === d.pastaId ? null : a)), 200)} className={`${item} ${anular === d.pastaId ? 'text-red-400 font-medium' : 'text-red-400'}`} title="Os ficheiros que esta tarefa enviou vão para o lixo do Drive (os de outras tarefas ficam), sai da spreadsheet e o número fica livre">{anular === d.pastaId ? `Confirmar: anular a V${v || ''}` : 'Anular o envio (lixo do Drive)'}</button>
                            <button type="button" role="menuitem" onClick={() => { esquecerVersao(d); setMenuEntrega(null); }} className={item} title="Só desliga esta versão desta tarefa — o Drive e a spreadsheet ficam como estão">Só tirar desta tarefa</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {resultado && resultado.trello && <p className={`text-xs ${resultado.trello.ok ? 'text-emerald-500' : 'text-red-400'}`}>{resultado.trello.ok ? (resultado.trelloN > 1 ? `✓ ${resultado.trelloN} links juntados ao cartão do Trello` : '✓ Link juntado ao cartão do Trello') : `Não consegui juntar o link ao Trello: ${resultado.trello.erro}`}</p>}
                {/* Pasta e projeto no PC: no fim, quando tudo estiver enviado */}
                {nomeProjetoTarefa(trab, t) && (
                  <div className={`rounded-xl border p-3 space-y-2 ${claro ? 'border-slate-200 bg-slate-50' : 'border-slate-700/70 bg-slate-800/40'}`}>
                    <p className="text-sm font-medium">Pasta e projeto no PC</p>
                    <p className={`text-[11px] ${sub}`}>Muda o nome da pasta do projeto, do .aep e do collect da @Source. Fecha antes o projeto no After Effects — o lançador mostra-te o que vai mudar antes de mexer.</p>
                    <div className="flex items-center gap-2">
                      <input value={pastaProj ? pastaProj.novo : nomeProjetoTarefa(trab, t)} onChange={e => setPastaProj({ novo: e.target.value })} aria-label="Nome novo da pasta e do projeto" className={`${inputClass} flex-1 min-w-0 text-xs py-1.5 font-mono`} />
                      {lista.some(x => x.estado !== 'feito')
                        ? <span className={`shrink-0 text-[11px] ${sub}`} title="Envia primeiro — se a pasta mudar de nome antes, o browser perde os ficheiros">Envia primeiro</span>
                        : <a href={linkAERenomear(trab, t, null, (pastaProj ? pastaProj.novo : nomeProjetoTarefa(trab, t)).trim(), (historico[0] && historico[0].depois) || '')} onClick={() => setTimeout(() => setPastaProj(null), 500)} className={`${btn} shrink-0`}>Mudar no PC</a>}
                      <LinkPC href={linkAEPasta(trab, t, TRAB_ATUAL.clientes)} className={`${btn} shrink-0`} title="Abrir a pasta do projeto no Explorador">Abrir pasta</LinkPC>
                    </div>
                    <a href={`aeproj://modelo/?tema=${temaApp()}`} className={`inline-block text-[11px] ${sub} hover:text-blue-400`} title="Os projetos novos do After Effects passam a ser uma cópia deste .aep (com as tuas comps, pastas e definições). Os que já existem não mudam.">Escolher o meu projeto modelo do After Effects…</a>
                  </div>
                )}
              </div>
            );
          })()}
          {noDrive && (
            <div className={`rounded-lg border ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
              <div className={`flex items-center gap-2 px-3 py-1.5 border-b text-xs ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
                <span className="font-medium flex-1 min-w-0 truncate">No Drive · {(verPasta || resultado || {}).pasta}</span>
                {noDrive.length > 1 && (aApagar === '*' ? (
                  <>
                    <button type="button" disabled={ocupadoDrive} onClick={apagarTodosNoDrive} className="shrink-0 px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-500 text-white disabled:opacity-50">{ocupadoDrive ? 'A apagar…' : `Apagar os ${noDrive.length}`}</button>
                    <button type="button" onClick={() => setAApagar(null)} className={`shrink-0 ${sub} hover:text-blue-400`}>Não</button>
                  </>
                ) : <button type="button" disabled={ocupadoDrive} onClick={apagarTodosNoDrive} className={`shrink-0 px-2 py-0.5 rounded-md border ${claro ? 'border-slate-200 text-slate-600' : 'border-slate-700 text-slate-300'} hover:text-red-400 hover:border-red-400/50`} title="Manda todos os tamanhos desta versão para o lixo do Drive">Apagar todos</button>)}
                <button type="button" disabled={ocupadoDrive} onClick={() => verDrive(verPasta)} className={`${sub} hover:text-blue-400`} title="Atualizar">↻</button>
                <button type="button" onClick={() => { setNoDrive(null); setAApagar(null); }} className={`w-6 h-6 rounded-md ${claro ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/10'}`} aria-label="Fechar a lista do Drive">✕</button>
              </div>
              {!noDrive.length ? <p className={`px-3 py-2 text-xs ${sub}`}>A pasta está vazia.</p> : (
                <div className="divide-y divide-slate-500/10">
                  {noDrive.map(f => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <a href={f.webViewLink ? urlAbrir(f.webViewLink, t.cid) : undefined} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 break-all hover:text-blue-400">{f.name}</a>
                      {aApagar === f.id ? (
                        <>
                          <button type="button" disabled={ocupadoDrive} onClick={() => apagarNoDrive(f)} className="shrink-0 px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-500 text-white disabled:opacity-50">Apagar</button>
                          <button type="button" onClick={() => setAApagar(null)} className={`shrink-0 ${sub} hover:text-blue-400`}>Não</button>
                        </>
                      ) : <button type="button" onClick={() => apagarNoDrive(f)} className={`shrink-0 ${sub} hover:text-red-400`} aria-label={`Apagar ${f.name} do Drive`} title="Apagar do Drive (vai para o lixo)">🗑</button>}
                    </div>
                  ))}
                </div>
              )}
              <p className={`px-3 py-1.5 text-[10px] ${sub}`}>Para substituir um vídeo, arrasta a versão nova para cima: fica com o mesmo nome e troca a antiga.</p>
            </div>
          )}
          <div className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs ${sub}`}>
            {!sempre && <span className="flex-1 min-w-[160px] truncate" title="Os ficheiros vão direto do computador para o Drive — nada fica guardado na app.">Conta: {conta ? <b>{conta}</b> : 'a tua conta Google'}</span>}
            {sempre ? (
              <span className="text-emerald-500 opacity-80" title={`Drive ligado: ${conta || 'a tua conta Google'}. Os ficheiros vão direto do computador para o Drive — nada fica guardado na app.`}>🔒 {conta || 'Drive ligado'} · <button type="button" onClick={async () => { try { await desligarDriveSempre(conta); setSempre(false); setMsg('Desliguei a ligação permanente ao Drive desta conta.'); } catch (e) { setMsg(`⚠ ${e.message || e}`); } }} className={`underline ${sub} hover:text-red-400`}>Desligar</button></span>
            ) : (
              <button type="button" disabled={aLigar} onClick={async () => { setALigar(true); try { const j = await ligarDriveSempre(conta); setSempre(true); setMsg(`✓ Drive ligado para sempre${j.email ? ` (${j.email})` : ''} — já não precisas de entrar na Google.`); } catch (e) { setMsg(`⚠ ${e.message || e}`); } setALigar(false); }}
                className="px-2 py-0.5 rounded-md border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50" title="A app fica com acesso permanente ao Drive desta conta (guardado cifrado no servidor). Podes desligar quando quiseres.">🔒 Manter sempre ligado</button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
// ── Versões deste conceito (desta e de outras tarefas, e as que só estão no Drive), com os nomes dos ficheiros ──
const formatoDoNomeF = n => { const m = /_(\d+)X(\d+)(?:_|\.|$)/i.exec(String(n || '')); return m ? `${m[1]}:${m[2]}` : ''; };
const versoesDoConceito = (trab, t, conceitoSlug) => {
  const j = jogoDaTarefa(trab, t);
  if (!j || !conceitoSlug) return [];
  const tipo = tipoFicheiro(t);
  const out = [];
  (trab.tarefas || []).forEach(x => {
    const jx = jogoDaTarefa(trab, x);
    if (!jx || (j.id ? jx.id !== j.id : slugF(jx.nome) !== slugF(j.nome)) || tipoFicheiro(x) !== tipo) return;
    versoesDrive(x.drive).forEach(d => {
      if (slugF(d.conceito || (x.ficheiros || {}).conceito || conceitoDoNome(x.nome)) !== conceitoSlug) return;
      const v = versaoDaPasta(d);
      if (!v) return;
      out.push({ v, pastaId: d.pastaId, pasta: d.pasta, tarefa: x, propria: x.id === t.id, variacao: campoVersao(x.ficheiros || {}, v, 'variacao', x) || '', em: d.em, url: d.url, ficheiros: (d.enviados || []).map(e => ({ nome: e.nome, formato: e.formato || formatoDoNomeF(e.nome) })) });
    });
  });
  return out;
};
const cacheVersoesD = {};
const versoesComFicheirosNoDrive = async (token, raiz, conceito) => {
  const k = raiz + '|' + conceito;
  const c = cacheVersoesD[k];
  if (c && Date.now() - c.em < 5 * 60000) return c.lista;
  const fs = await conceitosNoDrive(token, raiz);
  const pc = fs.find(x => slugF(x.name) === slugF(conceito));
  let lista = [];
  if (pc) {
    const q = encodeURIComponent(`'${pc.id}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`);
    const subs = ((await driveApi(token, `${DRV}?q=${q}&fields=files(id,name,webViewLink,createdTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`)) || {}).files || [];
    const re = new RegExp(`^${slugF(conceito)}_V(\\d+)(?:_(.+))?$`);
    lista = (await Promise.all(subs.map(async s => {
      const m = re.exec(slugF(s.name));
      if (!m) return null;
      const fich = await filhosDrive(token, s.id, false).catch(() => []);
      return { v: Number(m[1]), pastaId: s.id, pasta: s.name, em: s.createdTime || '', variacao: m[2] ? emTitulo(m[2].toLowerCase().replace(/_/g, ' ')) : '', url: s.webViewLink || `https://drive.google.com/drive/folders/${s.id}`, ficheiros: fich.map(f => ({ nome: f.name, id: f.id, formato: formatoDoNomeF(f.name) })).sort((a, b) => a.nome.localeCompare(b.nome)) };
    }))).filter(Boolean);
  }
  cacheVersoesD[k] = { lista, em: Date.now() };
  return lista;
};
const VersoesConceito = ({ t, trab, conceito, raizD, contaD, claro, sub, mostrarDrive }) => {
  const [aberto, setAberto] = useState(() => { try { return localStorage.getItem('trab-versoes-abertas') === '1'; } catch (e) { return false; } });
  const [doDrive, setDoDrive] = useState(null); // { conceito, lista }
  const [aVer, setAVer] = useState(false);
  const [semAcesso, setSemAcesso] = useState(false);
  const [copiado, setCopiado] = useState('');
  useEffect(() => { if (!copiado) return undefined; const i = setTimeout(() => setCopiado(''), 1400); return () => clearTimeout(i); }, [copiado]);
  const locais = versoesDoConceito(trab, t, conceito);
  const carregar = async pedir => {
    if (!raizD || !conceito || aVer) return;
    const tk = tokenGuardadoDe(contaD) || (pedir || ligadoSempre(contaD || '_') ? await tokenDrive(contaD).catch(() => null) : null);
    if (!tk) { setSemAcesso(true); return; }
    setSemAcesso(false); setAVer(true);
    try { const lista = await versoesComFicheirosNoDrive(tk, raizD, conceito); setDoDrive({ conceito, lista }); } catch (e) { /* sem acesso */ }
    setAVer(false);
  };
  useEffect(() => { if (aberto && mostrarDrive && (!doDrive || doDrive.conceito !== conceito)) carregar(false); }, [aberto, conceito, raizD]); // eslint-disable-line react-hooks/exhaustive-deps
  // Junta: o Drive manda nos nomes (estão como lá ficaram); a app junta a tarefa e a data
  const drv = doDrive && doDrive.conceito === conceito ? doDrive.lista : [];
  const porV = new Map();
  locais.forEach(l => { if (!porV.has(l.v)) porV.set(l.v, []); porV.get(l.v).push({ ...l }); });
  drv.forEach(d => {
    const lst = porV.get(d.v) || [];
    const igual = lst.find(l => l.pastaId === d.pastaId) || (lst.length === 1 && !lst[0].pastaId ? lst[0] : null);
    if (igual) { if (d.ficheiros.length) igual.ficheiros = d.ficheiros; if (!igual.url) igual.url = d.url; if (d.pasta) igual.pasta = d.pasta; }
    else { lst.push({ ...d, soDrive: true }); porV.set(d.v, lst); }
  });
  const linhas = [...porV.values()].flat().sort((a, b) => a.v - b.v);
  const nums = [...new Set(linhas.map(l => l.v))];
  if (!linhas.length && !(mostrarDrive && raizD)) return null;
  const alternar = () => { const n = !aberto; setAberto(n); try { localStorage.setItem('trab-versoes-abertas', n ? '1' : '0'); } catch (e) { /* */ } };
  const btnCopiar = (txt, k, rot = 'Copiar') => <button type="button" onClick={() => { copiar(txt); setCopiado(k); }} className={`shrink-0 px-1.5 py-px text-[10.5px] rounded border ${copiado === k ? 'border-emerald-400 text-emerald-400' : claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>{copiado === k ? '✓' : rot}</button>;
  return (
    <div className="-mt-1">
      <button type="button" onClick={alternar} aria-expanded={aberto} className={`inline-flex items-center gap-1.5 text-[11px] ${sub} hover:text-blue-400`}>
        <svg width="9" height="9" viewBox="0 0 12 12" className="shrink-0 transition-transform" style={{ transform: aberto ? 'rotate(90deg)' : 'none' }} aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {nums.length ? <>Versões deste conceito: <b className={claro ? 'text-slate-700' : 'text-slate-200'}>{nums.map(n => `V${n}`).join(' · ')}</b></> : 'Versões deste conceito no Drive'}
      </button>
      {aberto && (
        <div className={`mt-1.5 rounded-lg border divide-y ${claro ? 'border-slate-200 divide-slate-100 bg-slate-50/60' : 'border-white/[0.07] divide-white/[0.05] bg-white/[0.02]'}`}>
          {linhas.map((l, i) => {
            // Uma linha por versão, com o nome da pasta do Drive (ex.: UGC_SIGNS_V2_SPLIT_SCREEN)
            const pastaN = l.pasta || [conceito, `V${l.v}`, slugF(l.variacao || '')].filter(Boolean).join('_');
            return (
              <div key={(l.pastaId || '') + l.v + i} className="group/v flex items-center gap-2 min-w-0 px-2.5 py-1.5">
                <span className={`shrink-0 px-1 rounded text-[10.5px] leading-[16px] font-semibold tabular-nums ${claro ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/25'}`}>V{l.v}</span>
                <code className={`min-w-0 truncate text-[11.5px] ${claro ? 'text-slate-700' : 'text-slate-200'}`} title={l.ficheiros.length ? l.ficheiros.map(f => f.nome).join('\n') : pastaN}>{pastaN}</code>
                <span className={`min-w-0 truncate text-[11px] ${sub}`} title={l.tarefa ? l.tarefa.nome : ''}>{[l.em ? dataCurta(l.em) : '', l.propria ? 'esta tarefa' : l.soDrive ? 'só no Drive' : ''].filter(Boolean).join(' · ')}</span>
                <span className="flex-1" />
                <span className="sm:opacity-0 sm:group-hover/v:opacity-100 focus-within:opacity-100">{btnCopiar(pastaN, i + ':p')}</span>
                {l.url && <a href={urlAbrir(l.url, t.cid)} target="_blank" rel="noopener noreferrer" className={`shrink-0 text-[11px] ${sub} hover:text-blue-400`} title="Abrir a pasta no Drive">Drive ↗</a>}
              </div>
            );
          })}
          {mostrarDrive && raizD && (aVer || semAcesso || !linhas.length) && (
            <p className={`px-2.5 py-2 text-[11px] ${sub}`}>
              {aVer ? 'A ver o Drive…' : semAcesso ? <button type="button" onClick={() => carregar(true)} className="text-blue-400 hover:text-blue-300">Ver também as que estão no Drive</button> : 'Ainda não há versões deste conceito.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
// ── Criativos: todos os conceitos e versões de um cliente, por jogo — nomes dos ficheiros e atalhos para o After Effects ──
const ESTADOS_V = [
  { id: 'enviada', nome: 'Enviada', cor: '#60a5fa' },
  { id: 'review', nome: 'Em review', cor: '#f59e0b' },
  { id: 'feedback', nome: 'Com feedback', cor: '#fb923c' },
  { id: 'aprovada', nome: 'Aprovada', cor: '#10b981' },
  { id: 'ganhou', nome: 'Ganhou nos testes', cor: '#22c55e' },
  { id: 'perdeu', nome: 'Não resultou', cor: '#94a3b8' },
];
const nomeBonitoC = s => { const x = String(s || '').trim(); return /[a-z]/.test(x) ? emTitulo(x) : emTitulo(x.toLowerCase().replace(/_/g, ' ')); };
const chaveVersaoC = (jogoId, slug, v) => `${jogoId}|${slug}|${v || 0}`;
const paramsAE = ({ trab, t, clientes, jogo, conceito, v }) => {
  if (t) { const p = new URLSearchParams(linkAEAbrir(trab, t, clientes).replace(/^aeproj:\/\/abrir\/\?/, '')); if (v) p.set('versao', `V${v}`); return p; }
  const cli = (clientes || []).find(c => String(c.id) === String(jogo && jogo.cid));
  return new URLSearchParams({ id: '', cliente: (cli && cli.nome) || '', jogo: (jogo && jogo.nome) || '', conceito: conceito || '', versao: v ? `V${v}` : '', tema: temaApp() });
};
const linkAEPara = o => `aeproj://abrir/?${paramsAE(o).toString()}`;
// "Abrir a pasta de exports" (lançador AbrirAE): encontra o projeto pelo nome de um export e abre a @Exports
const linkExportsPara = (o, ficheiro) => { const p = paramsAE(o); if (ficheiro) p.set('ficheiro', ficheiro); return `aeproj://exports/?${p.toString()}`; };
const abrirLinkExterno = url => { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
const versaoDoNomeT = (nome, cu) => { const m = /V(\d+)/i.exec(partesNomeTarefa(nome, cu).versao || ''); return m ? Number(m[1]) : null; };
const criativosDoCliente = (trab, cid, cu) => {
  const jogos = (trab.jogos || []).filter(j => String(j.cid) === String(cid) && !j.semJogo);
  const porJogo = new Map(jogos.map(j => [j.id, { jogo: j, conceitos: new Map() }]));
  (trab.tarefas || []).forEach(t => {
    if (String(t.cid) !== String(cid)) return;
    const j = jogoDaTarefa(trab, t);
    if (!j || j.semJogo || !porJogo.has(j.id)) return;
    const fx = t.ficheiros || {};
    // Do nome da tarefa: "Bear Chase V2 - Variação" → conceito "Bear Chase" (a versão e a variação ficam à parte)
    const nomeC = String(fx.conceito || String(conceitoDoNome(t.nome, cu) || '').split(/\s[-–—]\s/)[0].replace(/\s+V\d+$/i, '') || '').trim();
    const slug = slugF(nomeC);
    if (!slug || /^\d+\s*x\s*\d+$/i.test(nomeC)) return;
    const g = porJogo.get(j.id);
    let c = g.conceitos.get(slug);
    if (!c) { c = { slug, nome: nomeBonitoC(nomeC), versoes: [], tarefas: [], ultimo: '' }; g.conceitos.set(slug, c); }
    c.tarefas.push(t);
    const tipoF = tipoFicheiro(t);
    const vsEnv = new Set();
    versoesDrive(t.drive).forEach(d => {
      if (d.conceito && slugF(d.conceito) !== slug) return;
      const v = versaoDaPasta(d);
      if (!v) return;
      vsEnv.add(v);
      c.versoes.push({ k: `${t.id}:${d.pastaId || v}`, v, t, pastaId: d.pastaId, url: d.url, em: d.em, tipoF, variacao: nomeBonitoC(campoVersao(fx, v, 'variacao', t) || ''), folha: d.folha, enviada: true,
        ficheiros: (d.enviados || []).map(e => ({ nome: e.nome, id: e.id, formato: e.formato || formatoDoNomeF(e.nome) })) });
    });
    const vp = Number(fx.versao) || versaoDoNomeT(t.nome, cu) || 1; // sem versão no nome = V1 (a V1 não leva versão)
    if (!vsEnv.size || (t.estado !== 'feito' && vp && !vsEnv.has(vp))) {
      if (!(vp && vsEnv.has(vp))) c.versoes.push({ k: `${t.id}:plan`, v: vp, t, em: t.criada, tipoF, planeada: true, ficheiros: [],
        variacao: nomeBonitoC((vp ? campoVersao(fx, vp, 'variacao', t) : fx.variacao) || partesNomeTarefa(t.nome, cu).variacao || '') });
    }
  });
  porJogo.forEach(g => g.conceitos.forEach(c => {
    c.versoes.sort((a, b) => (a.v || 999) - (b.v || 999) || String(a.em || '').localeCompare(String(b.em || '')));
    c.ultimo = c.versoes.reduce((m, x) => (String(x.em || '') > m ? String(x.em || '') : m), '');
  }));
  return porJogo;
};
// A lista onde fica uma tarefa nova de um jogo: a do mês atual; senão a da última tarefa do jogo
const pastaParaNovaC = (trab, jogo, tarefasJogo) => {
  const hoje = new Date(); const ano = hoje.getFullYear(), mes = hoje.getMonth() + 1;
  const folhas = (trab.pastas || []).filter(p => p.jogoId === jogo.id && !(trab.pastas || []).some(f => f.paiId === p.id));
  const info = p => { const ch = caminho(trab, p.id); const m = ch.find(x => x.mesNum); const a = ch.find(x => /^\s*\d{4}\s*$/.test(x.nome)); return { p, ano: a ? Number(a.nome.trim()) : 0, mes: m ? m.mesNum : 0 }; };
  const l = folhas.map(info);
  const atual = l.find(x => x.ano === ano && x.mes === mes);
  if (atual) return atual.p.id;
  const ult = tarefasJogo.slice().sort((a, b) => String(b.criada || '').localeCompare(String(a.criada || '')))[0];
  return ult ? ult.pastaId : null;
};
// Miniatura que o Drive gera para cada vídeo (pedida com a tua sessão; se falhar, não aparece)
// Guardadas no browser (são pequenas, ~20 KB): da 2.ª vez aparecem logo, sem pedir nada ao Drive
const cacheMiniaturas = new Map();
const CACHE_MINI = 'app-miniaturas';
const chaveMini = id => `https://cache.app/mini/${encodeURIComponent(id)}`;
const miniaturaGuardada = async fileId => { try { const c = await caches.open(CACHE_MINI); const r = await c.match(chaveMini(fileId)); return r ? URL.createObjectURL(await r.blob()) : null; } catch (e) { return null; } };
const miniaturaDrive = async (token, fileId) => {
  if (cacheMiniaturas.has(fileId)) return cacheMiniaturas.get(fileId);
  const p = (async () => {
    const g = await miniaturaGuardada(fileId);
    if (g) return g;
    if (!token) return null;
    try {
      const j = await driveApi(token, `${DRV}/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`);
      if (!j || !j.thumbnailLink) return null; // o Drive ainda está a preparar a miniatura (acabado de enviar)
      const link = j.thumbnailLink.replace(/=s\d+$/, '=s320');
      let r = null;
      try { r = await fetch(link); } catch (e) { r = null; }
      if (!r || !r.ok) { try { r = await fetch(link, { headers: { Authorization: `Bearer ${token}` } }); } catch (e) { r = null; } }
      if (!r || !r.ok) return link; // mostra pelo link (vale umas horas), sem guardar
      const blob = await r.blob();
      try { const c = await caches.open(CACHE_MINI); await c.put(chaveMini(fileId), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })); } catch (e) { /* sem espaço */ }
      return URL.createObjectURL(blob);
    } catch (e) { cacheMiniaturas.delete(fileId); return null; }
  })();
  cacheMiniaturas.set(fileId, p);
  return p;
};
const MiniaturaC = ({ fileId, conta, claro, className }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!fileId) return;
      const g = cacheMiniaturas.has(fileId) ? null : await miniaturaGuardada(fileId); // guardada: aparece logo
      if (g) { cacheMiniaturas.set(fileId, Promise.resolve(g)); if (vivo) setSrc(g); return; }
      const tk = tokenGuardadoDe(conta) || (ligadoSempre(conta || '_') ? await tokenDrive(conta).catch(() => null) : null);
      const u = await miniaturaDrive(tk, fileId); if (vivo && u) setSrc(u);
    })();
    return () => { vivo = false; };
  }, [fileId, conta]);
  if (!src) return null;
  return <img src={src} alt="" className={className || `w-[72px] h-[72px] object-cover rounded-lg shrink-0 ring-1 ${claro ? 'ring-slate-200' : 'ring-white/10'}`} />;
};
const MiniaturaVersao = ({ ficheiros, conta, claro, onClick, rotulo }) => {
  const f = (ficheiros || []).filter(x => x && x.id).sort((a, b) => ((ORDEM_FMT.indexOf(a.formato) + 1) || 9) - ((ORDEM_FMT.indexOf(b.formato) + 1) || 9))[0];
  if (!f) return null;
  const [fw, fh] = String(f.formato || '9:16').split(':').map(Number);
  const r = fw && fh ? fw / fh : 9 / 16;
  const alto = 56; const larg = Math.round(Math.min(100, Math.max(32, alto * r)));
  return (
    <button type="button" onClick={onClick} className={`relative shrink-0 rounded-md overflow-hidden ring-1 ${claro ? 'bg-slate-200 ring-slate-200' : 'bg-slate-800 ring-white/10'} group/mini`} style={{ width: larg, height: alto }} aria-label={rotulo || 'Ver o vídeo'} title={rotulo || 'Ver o vídeo'}>
      <MiniaturaC fileId={f.id} conta={conta} claro={claro} className="absolute inset-0 w-full h-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/mini:bg-black/30 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="white" className="opacity-0 group-hover/mini:opacity-100 drop-shadow" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
    </button>
  );
};
// ── Ver o vídeo de uma versão enviada: vem do Drive do cliente (nada fica guardado na app nem na Firebase).
// O browser guarda os últimos 10 que viste, para abrirem logo da próxima vez; os mais antigos saem sozinhos. ──
const CACHE_VID = 'app-videos';
const LS_VID = 'videos-vistos';
const MAX_VID = 10;
const chaveVid = id => `https://cache.app/video/${encodeURIComponent(id)}`;
const listaVid = () => { try { return JSON.parse(localStorage.getItem(LS_VID)) || []; } catch (e) { return []; } };
const marcarVid = async (c, id) => {
  const l = [id, ...listaVid().filter(x => x !== id)];
  for (const fora of l.slice(MAX_VID)) { try { await c.delete(chaveVid(fora)); } catch (e) { /* */ } }
  try { localStorage.setItem(LS_VID, JSON.stringify(l.slice(0, MAX_VID))); } catch (e) { /* */ }
};
const videoDoDrive = async (conta, f, onProg) => {
  let c = null;
  try { c = await caches.open(CACHE_VID); const r = await c.match(chaveVid(f.id)); if (r) { marcarVid(c, f.id); return r.blob(); } } catch (e) { c = null; }
  const pedir = async forcar => { const tk = await tokenDrive(conta, forcar); return fetch(`${DRV}/${encodeURIComponent(f.id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tk}` } }); };
  let r = await pedir(false);
  if (r.status === 401) r = await pedir(true);
  if (!r.ok) throw new Error(r.status === 404 ? 'Este ficheiro já não está no Drive (foi apagado ou substituído).' : r.status === 403 ? `A conta ${conta || 'Google'} não tem acesso a este ficheiro.` : `Erro ${r.status} do Drive`);
  const total = Number(r.headers.get('Content-Length')) || 0;
  const tipo = r.headers.get('Content-Type') || (/\.(png|jpe?g|webp|gif)$/i.test(f.nome || '') ? 'image/png' : /\.webm$/i.test(f.nome || '') ? 'video/webm' : 'video/mp4');
  let blob;
  if (r.body && r.body.getReader) {
    const leitor = r.body.getReader(); const partes = []; let n = 0;
    for (;;) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); n += value.length; if (onProg && total) onProg(Math.min(1, n / total)); }
    blob = new Blob(partes, { type: tipo });
  } else blob = await r.blob();
  if (c) { try { await c.put(chaveVid(f.id), new Response(blob, { headers: { 'Content-Type': tipo } })); await marcarVid(c, f.id); } catch (e) { /* sem espaço: só não fica guardado */ } }
  return blob;
};
const ORDEM_FMT = ['9:16', '4:5', '1:1', '16:9'];
const VerVideo = ({ conta, ficheiros, claro, sub, iniciar = false, largura }) => {
  const fs = (ficheiros || []).filter(f => f && f.id).slice().sort((a, b) => ((ORDEM_FMT.indexOf(a.formato) + 1) || 9) - ((ORDEM_FMT.indexOf(b.formato) + 1) || 9));
  const [esc, setEsc] = useState(null);
  const [tocar, setTocar] = useState(iniciar);
  const [url, setUrl] = useState(null);
  const [prog, setProg] = useState(null);
  const [erro, setErro] = useState('');
  const [grande, setGrande] = useState(null); // { tempo }
  const refV = useRef(null);
  const [dur, setDur] = useState(null);
  const [agoraT, setAgoraT] = useState(0);
  const f = fs.find(x => x.id === esc) || fs[0] || null;
  useEffect(() => { setDur(null); setAgoraT(0); }, [f && f.id]);
  useEffect(() => {
    setUrl(null); setErro('');
    if (!tocar || !f) { setProg(null); return undefined; }
    let vivo = true; let u = null;
    setProg(0);
    videoDoDrive(conta, f, p => { if (vivo) setProg(p); })
      .then(b => { if (!vivo) return; u = URL.createObjectURL(b); setUrl(u); setProg(null); })
      .catch(e => { if (vivo) { setErro(String((e && e.message) || e)); setProg(null); } });
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
  }, [tocar, f && f.id, conta]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const [fw, fh] = String(f.formato || '9:16').split(':').map(Number);
  const larg = largura || (!fw || !fh ? 160 : fw / fh >= 1.3 ? 300 : fw / fh >= 0.95 ? 220 : fw / fh >= 0.75 ? 200 : 160);
  const est = { width: larg, maxWidth: '100%', aspectRatio: fw && fh ? `${fw} / ${fh}` : '9 / 16' };
  const imagem = /\.(png|jpe?g|webp|gif)$/i.test(f.nome || '');
  return (
    <div className="shrink-0 space-y-1.5" style={{ width: larg, maxWidth: '100%' }}>
      {url ? (imagem ? <img src={url} alt={f.nome} className="rounded-lg bg-black object-contain" style={est} />
        : <div className="relative"><video ref={refV} key={url} src={url} controls autoPlay={!grande} playsInline className="rounded-lg bg-black object-contain" style={est} aria-label={`Vídeo ${f.formato || ''}`}
            onLoadedMetadata={e => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); }} onTimeUpdate={e => setAgoraT(e.currentTarget.currentTime)} /><button type="button" onClick={() => { const v = refV.current; const tempo = v ? v.currentTime : 0; if (v) v.pause(); setTocar(true); setGrande({ tempo }); }} title="Ver em grande" aria-label="Ver em grande" className="absolute top-1.5 right-1.5 z-[1] w-8 h-8 inline-flex items-center justify-center rounded-lg bg-black/60 hover:bg-black/80 text-white shadow"><IcoAmpliar /></button></div>)
        : (
          <button type="button" onClick={() => setTocar(true)} disabled={prog != null} className="relative block rounded-lg overflow-hidden bg-slate-900 ring-1 ring-black/10" style={est} aria-label={`Ver o ${imagem ? 'banner' : 'vídeo'} ${f.formato || ''}`} title={f.nome}>
            <MiniaturaC fileId={f.id} conta={conta} claro={claro} className="absolute inset-0 w-full h-full object-cover opacity-80" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-11 h-11 rounded-full bg-white/90 text-slate-900 shadow-lg inline-flex items-center justify-center">
                {prog != null ? <span className="text-[10px] font-semibold tabular-nums">{Math.round(prog * 100)}%</span> : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
              </span>
            </span>
            {prog != null && <span className="absolute left-0 right-0 bottom-0 h-1 bg-black/40"><span className="block h-full bg-blue-500 transition-all" style={{ width: `${Math.round(prog * 100)}%` }} /></span>}
            {!imagem && durDoNomeF(f.nome) && prog == null && <span className="absolute right-1.5 bottom-1.5 px-1.5 py-px rounded bg-black/70 text-white text-[10.5px] font-semibold tabular-nums">{fmtDur(durDoNomeF(f.nome))}</span>}
          </button>
        )}
      {prog != null && <p className={`text-[10.5px] ${sub}`}>A trazer do Drive…</p>}
      {erro && <p className="text-[11px] text-red-400">{erro}</p>}
      {!imagem && (dur || durDoNomeF(f.nome)) && <p className={`text-[11px] tabular-nums ${sub}`} aria-label="Duração">{url && dur ? <><b className={claro ? 'text-slate-700' : 'text-slate-200'}>{fmtDur(agoraT)}</b> / {fmtDur(dur)}</> : <>Duração: <b className={claro ? 'text-slate-700' : 'text-slate-200'}>{fmtDur(dur || durDoNomeF(f.nome))}</b></>}</p>}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Ver outro formato">
        {fs.length > 1 && fs.map(x => (
          <button key={x.id} type="button" onClick={() => { setEsc(x.id); setTocar(true); }} aria-pressed={x.id === f.id}
            className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold border ${x.id === f.id ? 'bg-blue-600 border-blue-600 text-white' : claro ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-white/5'}`}>{x.formato || '?'}</button>
        ))}
      </div>
      {grande && <VideoGrande url={url} imagem={imagem} formato={f.formato} nome={`${f.nome}${dur ? ` · ${fmtDur(dur)}` : ''}`} tempo={grande.tempo} opcoes={fs.map(x => ({ id: x.id, formato: x.formato }))} atual={f.id} onEscolher={id => setEsc(id)}
        aCarregar={erro || (prog != null ? `A trazer do Drive… ${Math.round(prog * 100)}%` : 'A carregar…')}
        onFechar={t2 => { setGrande(null); const v = refV.current; if (v && t2) { try { v.currentTime = t2; } catch (e) { /* */ } } }} />}
    </div>
  );
};
const Criativos = ({ trab, mudar, clientes, cu, theme, onAbrir, showToast, inputClass, focarProcura }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const forte = claro ? 'text-slate-800' : 'text-slate-100';
  const borda = claro ? 'border-slate-200' : 'border-slate-700/60';
  const cartao = `rounded-2xl border ${claro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-800/80 border-slate-600/50 shadow-lg shadow-black/25'}`;
  const btn = `inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-lg border whitespace-nowrap ${claro ? 'border-slate-200 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-white/5 text-slate-200'}`;
  const clis = clientes.filter(c => (trab.jogos || []).some(j => String(j.cid) === String(c.id) && !j.semJogo));
  const lerSel = () => { try { return JSON.parse(localStorage.getItem('criativos-sel')) || {}; } catch (e) { return {}; } };
  const [selC, setSelC] = useState(lerSel);
  const gravarSel = s => { setSelC(s); try { localStorage.setItem('criativos-sel', JSON.stringify(s)); } catch (e) { /* */ } };
  // Cliente: o que escolheste; senão o da tarefa mais recente com jogo
  const cidAuto = (() => { const t = (trab.tarefas || []).filter(x => (trab.jogos || []).some(j => String(j.cid) === String(x.cid))).sort((a, b) => String(b.criada || '').localeCompare(String(a.criada || '')))[0]; return t ? t.cid : (clis[0] && clis[0].id); })();
  const cid = clis.some(c => String(c.id) === String(selC.cid)) ? selC.cid : cidAuto;
  const dados = useMemo(() => criativosDoCliente(trab, cid, cu), [trab.tarefas, trab.jogos, trab.pastas, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const conta = contaDe(cid);
  const info = trab.versoesInfo || {};
  const [tipoF, setTipoF] = useState('todos'); // todos | VID | BAN
  const [ordem, setOrdemS] = useState(() => { try { return localStorage.getItem('criativos-ordem') || 'recentes'; } catch (e) { return 'recentes'; } });
  const setOrdem = v => { setOrdemS(v); try { localStorage.setItem('criativos-ordem', v); } catch (e) { /* */ } };
  const [q, setQ] = useState('');
  const procRef = useRef(null);
  useEffect(() => { if (focarProcura && procRef.current) procRef.current.focus(); }, [focarProcura]);
  // Jogos, por estúdio, com o número de versões
  const jogosL = [...dados.values()].map(g => ({ ...g, n: [...g.conceitos.values()].reduce((a, c) => a + c.versoes.length, 0), ultimo: [...g.conceitos.values()].reduce((m, c) => (c.ultimo > m ? c.ultimo : m), '') }));
  const jogoAuto = jogosL.slice().sort((a, b) => b.ultimo.localeCompare(a.ultimo))[0];
  const jogoId = jogosL.some(g => g.jogo.id === selC.jogoId) ? selC.jogoId : (jogoAuto && jogoAuto.jogo.id);
  const g = dados.get(jogoId);
  const estudios = [...new Set(jogosL.map(x => String(x.jogo.estudio || '').trim()))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'pt'));
  // Drive: conceitos e versões que só lá estão (pedidos ao abrir)
  const [drvConceitos, setDrvConceitos] = useState({}); // raiz → [{ name, id, webViewLink }]
  const [drvVersoes, setDrvVersoes] = useState({}); // raiz|slug → lista | 'a ver'
  const raizDe = (jogo, tipo) => idPastaDrive(tipo === 'BAN' ? jogo.driveStatics : jogo.drive);
  const tokenSemJanela = async () => tokenGuardadoDe(conta) || (ligadoSempre(conta || '_') ? tokenDrive(conta).catch(() => null) : null);
  useEffect(() => {
    if (!g) return undefined;
    let vivo = true;
    (async () => {
      const raiz = raizDe(g.jogo, 'VID'); if (!raiz || drvConceitos[raiz]) return;
      const tk = await tokenSemJanela(); if (!tk || !vivo) return;
      try { const fs = await conceitosNoDrive(tk, raiz); if (vivo) setDrvConceitos(o => ({ ...o, [raiz]: fs })); } catch (e) { /* sem acesso */ }
    })();
    return () => { vivo = false; };
  }, [jogoId, conta]); // eslint-disable-line react-hooks/exhaustive-deps
  // O que já se leu do Drive fica guardado neste computador: os criativos antigos aparecem logo, com miniaturas e vídeo
  const drvCarregado = useRef(false);
  useEffect(() => {
    let vivo = true;
    idbLer('criativos-drive').then(c => {
      if (!vivo) return; drvCarregado.current = true;
      if (!c) return;
      if (c.conceitos) setDrvConceitos(o => ({ ...c.conceitos, ...o }));
      if (c.versoes) setDrvVersoes(o => { const n = { ...c.versoes }; Object.entries(o).forEach(([k, v]) => { if (Array.isArray(v) || !n[k]) n[k] = v; }); return n; });
    });
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if (!drvCarregado.current) return undefined;
    const tm = setTimeout(() => {
      const versoes = {}; Object.entries(drvVersoes).forEach(([k, v]) => { if (Array.isArray(v)) versoes[k] = v; });
      const conceitos = {}; Object.entries(drvConceitos).forEach(([k, v]) => { if (Array.isArray(v)) conceitos[k] = v.map(f => ({ id: f.id, name: f.name, webViewLink: f.webViewLink })); });
      idbGravar('criativos-drive', { conceitos, versoes, em: Date.now() });
    }, 800);
    return () => clearTimeout(tm);
  }, [drvVersoes, drvConceitos]);
  // Importar tudo o que está no Drive deste cliente (todos os jogos, todos os conceitos e versões, mesmo de antes da app)
  const [importa, setImporta] = useState(null); // { feitos, total, versoes, jogo } | null
  const importarDrive = async () => {
    if (importa) return;
    const tk = await tokenDrive(conta).catch(() => null);
    if (!tk) { if (showToast) showToast(`Preciso de acesso ao Drive com ${conta || 'a tua conta Google'}.`, 'error'); return; }
    const jogos = (trab.jogos || []).filter(j => String(j.cid) === String(cid) && !j.semJogo && idPastaDrive(j.drive));
    if (!jogos.length) { if (showToast) showToast('Nenhum jogo deste cliente tem a pasta do Drive preenchida (separador Jogos).', 'error'); return; }
    setImporta({ feitos: 0, total: 0, versoes: 0, jogo: '' });
    const fila = [];
    for (const j of jogos) {
      const raiz = idPastaDrive(j.drive);
      setImporta(x => ({ ...x, jogo: j.nome }));
      try {
        const fs = await conceitosNoDrive(tk, raiz, true);
        setDrvConceitos(o => ({ ...o, [raiz]: fs }));
        fs.filter(f => { const k = slugF(f.name); return k && !/_V\d+$/.test(k); }).forEach(f => fila.push({ raiz, slug: slugF(f.name) }));
      } catch (e) { /* sem acesso a este jogo */ }
    }
    setImporta(x => ({ ...x, total: fila.length }));
    let feitos = 0, nv = 0;
    const trabalhar = async () => {
      while (fila.length) {
        const it = fila.shift();
        try { const l = await versoesComFicheirosNoDrive(tk, it.raiz, it.slug); nv += l.length; setDrvVersoes(o => ({ ...o, [`${it.raiz}|${it.slug}`]: l })); } catch (e) { /* salta */ }
        feitos++; setImporta(x => (x ? { ...x, feitos, versoes: nv } : x));
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar()]);
    setImporta(null);
    if (showToast) showToast(`Pronto: ${nv} ${nv === 1 ? 'versão' : 'versões'} do Drive em ${feitos} conceitos. Ficam guardadas neste computador.`, 'success');
  };
  const verNoDrive = async (jogo, c, pedir) => {
    const raiz = raizDe(jogo, c.versoes[0] && c.versoes[0].tipoF === 'BAN' ? 'BAN' : 'VID'); if (!raiz) return;
    const k = `${raiz}|${c.slug}`;
    if (drvVersoes[k] && !pedir) return;
    const tk = (await tokenSemJanela()) || (pedir ? await tokenDrive(conta).catch(() => null) : null);
    if (!tk) { setDrvVersoes(o => ({ ...o, [k]: 'sem acesso' })); return; }
    setDrvVersoes(o => ({ ...o, [k]: 'a ver' }));
    try { const l = await versoesComFicheirosNoDrive(tk, raiz, c.slug); setDrvVersoes(o => ({ ...o, [k]: l })); } catch (e) { setDrvVersoes(o => ({ ...o, [k]: 'sem acesso' })); }
  };
  // Junta as versões da app com as do Drive (o Drive manda nos nomes dos ficheiros)
  const versoesDe = (jogo, c) => {
    const raiz = raizDe(jogo, c.versoes[0] && c.versoes[0].tipoF === 'BAN' ? 'BAN' : 'VID');
    const drv = Array.isArray(drvVersoes[`${raiz}|${c.slug}`]) ? drvVersoes[`${raiz}|${c.slug}`] : [];
    const l = c.versoes.map(x => ({ ...x }));
    drv.forEach(d => {
      const igual = l.find(x => x.pastaId && x.pastaId === d.pastaId) || l.find(x => !x.pastaId && x.v === d.v && x.planeada && x.t && x.t.estado === 'feito');
      if (igual) { if (d.ficheiros.length) igual.ficheiros = d.ficheiros; if (!igual.url) igual.url = d.url; if (!igual.pastaId) igual.pastaId = d.pastaId; }
      else l.push({ ...d, k: `drv:${d.pastaId}`, soDrive: true, tipoF: 'VID', variacao: nomeBonitoC(d.variacao) });
    });
    return l.sort((a, b) => (a.v || 999) - (b.v || 999));
  };
  // Dia de entrega de uma versão: o envio para o Drive; senão o dia em que a tarefa foi entregue
  const entregaDe = x => (x.enviada || x.soDrive ? (x.em || '') : (x.t ? trabEntrega(x.t) : '')) || '';
  const estadoDe = (jogo, c, x) => {
    const m = (info[chaveVersaoC(jogo.id, c.slug, x.v)] || {}).estado;
    if (m) { const e = ESTADOS_V.find(y => y.id === m); if (e) return { ...e, manual: true }; }
    if (x.soDrive) return { id: '', nome: 'Só no Drive', cor: '#94a3b8' };
    const et = x.t ? x.t.estado : '';
    if (x.planeada) return et === 'feito' ? { id: '', nome: 'Entregue (fora da app)', cor: '#94a3b8' } : et === 'review' ? { id: '', nome: 'Em review', cor: '#f59e0b' } : et === 'curso' ? { id: '', nome: 'Em curso', cor: '#3b82f6' } : { id: '', nome: 'Por começar', cor: '#94a3b8' };
    return et === 'review' ? { id: '', nome: 'Em review', cor: '#f59e0b' } : et === 'feito' ? { id: '', nome: 'Entregue', cor: '#10b981' } : { id: '', nome: 'Enviada', cor: '#60a5fa' };
  };
  const mudarInfo = (jogo, c, v, patch) => mudar(tr => { const k = chaveVersaoC(jogo.id, c.slug, v); const cur = (tr.versoesInfo || {})[k] || {}; const novo = { ...cur, ...patch }; Object.keys(novo).forEach(x => { if (novo[x] == null || novo[x] === '' || (Array.isArray(novo[x]) && !novo[x].length)) delete novo[x]; }); const vi = { ...(tr.versoesInfo || {}) }; if (Object.keys(novo).length) vi[k] = novo; else delete vi[k]; return { ...tr, versoesInfo: vi }; });
  const etiquetasDe = (jogo, c, v) => (info[chaveVersaoC(jogo.id, c.slug, v)] || {}).etiquetas || [];
  // Formatos: os que as outras versões do conceito têm e esta não (pode faltar um tamanho)
  const formatosConceito = l => { const cont = {}; l.forEach(x => [...new Set(x.ficheiros.map(f => f.formato).filter(Boolean))].forEach(f => { cont[f] = (cont[f] || 0) + 1; })); return Object.keys(cont).filter(f => cont[f] >= 2).sort((a, b) => ['9:16', '4:5', '1:1', '16:9'].indexOf(a) - ['9:16', '4:5', '1:1', '16:9'].indexOf(b)); };
  // Conceitos que só estão no Drive (sem tarefas na app)
  const raizG = g ? raizDe(g.jogo, 'VID') : null;
  const soDriveC = g && raizG && Array.isArray(drvConceitos[raizG]) ? drvConceitos[raizG].filter(f => { const k = slugF(f.name); return k && !g.conceitos.has(k) && !/_V\d+$/.test(k) && !(trab.jogos || []).some(j => String(j.cid) === String(g.jogo.cid) && j.id !== g.jogo.id && [j.nome, j.codigo].filter(Boolean).some(n => slugF(n) === k)); }) : [];
  const conceitosL = g ? [
    ...[...g.conceitos.values()].filter(c => tipoF === 'todos' || c.versoes.some(x => (tipoF === 'BAN' ? ['BAN', 'ICO', 'FG', 'SS'].includes(x.tipoF) : !['BAN', 'ICO', 'FG', 'SS'].includes(x.tipoF)))),
    ...(tipoF === 'BAN' ? [] : soDriveC.map(f => { const dv = drvVersoes[`${raizG}|${slugF(f.name)}`]; return { slug: slugF(f.name), nome: nomeBonitoC(f.name), versoes: [], tarefas: [], ultimo: Array.isArray(dv) ? dv.reduce((m, x) => (x.em > m ? x.em : m), '') : '', soDrive: true, pastaUrl: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}` }; })),
  ].sort((a, b) => (ordem === 'nome' ? a.nome.localeCompare(b.nome, 'pt') : (b.ultimo || '').localeCompare(a.ultimo || '') || a.nome.localeCompare(b.nome, 'pt'))) : [];
  const [abertos, setAbertos] = useState(() => new Set());
  const [nomesAb, setNomesAb] = useState(() => new Set());
  const [tocarK, setTocarK] = useState(null); // versão cujo vídeo começa a tocar ao abrir
  const alternar = (setF, k) => setF(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const primeiro = conceitosL[0] && conceitosL[0].slug;
  const aberto = c => (abertos.has(`${jogoId}|${c.slug}`) ? true : abertos.has(`${jogoId}|${c.slug}|fechado`) ? false : c.slug === primeiro);
  useEffect(() => { if (!g) return; conceitosL.filter(aberto).forEach(c => verNoDrive(g.jogo, c, false)); }, [jogoId, abertos, primeiro]); // eslint-disable-line react-hooks/exhaustive-deps
  const [copiadoK, setCopiadoK] = useState('');
  useEffect(() => { if (!copiadoK) return undefined; const i = setTimeout(() => setCopiadoK(''), 1400); return () => clearTimeout(i); }, [copiadoK]);
  const copiarK = (txt, k) => { copiar(txt); setCopiadoK(k); };
  // + Nova versão: cria a tarefa já com o conceito e a versão seguinte, na lista do mês do jogo
  const [menuNova, setMenuNova] = useState(null);
  useEffect(() => {
    if (!menuNova) return undefined;
    const fechar = e => { if (!(e.target.closest && e.target.closest('[data-menu-nova]'))) setMenuNova(null); };
    document.addEventListener('mousedown', fechar); return () => document.removeEventListener('mousedown', fechar);
  }, [menuNova]);
  const novaVersao = (jogo, c, tipo) => {
    setMenuNova(null);
    const vs = versoesDe(jogo, c).map(x => x.v || 0);
    const prox = Math.max(0, ...vs) + 1;
    const tarefasJogo = (trab.tarefas || []).filter(t => { const j = jogoDaTarefa(trab, t); return j && j.id === jogo.id; });
    const pastaId = pastaParaNovaC(trab, jogo, c.tarefas.length ? c.tarefas : tarefasJogo);
    if (!pastaId) { if (showToast) showToast(`Não encontrei uma lista do ${jogo.nome} onde pôr a tarefa. Cria-a primeiro numa pasta do jogo.`, 'error'); return; }
    const pecas = { [tipo]: 1 };
    const fx = { conceito: c.nome, versao: String(prox) };
    const nome = nomeBaseTarefa({ nome: c.nome, pecas, ficheiros: fx }, prox, true);
    const id = trabId();
    mudar(tr => opTarefa(opNovaTarefa(tr, { id, pastaId, cid: jogo.cid, nome, pecas }), id, x => ({ ...x, ficheiros: fx })));
    const p = (trab.pastas || []).find(x => x.id === pastaId);
    if (showToast) showToast(`Tarefa criada: ${nome}${p ? ` (em ${p.nome})` : ''}`, 'success');
    if (onAbrir) setTimeout(() => onAbrir(id), 0);
  };
  // ── Pesquisa (em todos os clientes): conceitos, variações, nomes de ficheiros, tarefas e etiquetas ──
  const qn = normJ(q).trim();
  const resultados = useMemo(() => {
    if (!qn) return [];
    const palavras = qn.split(/\s+/).filter(Boolean);
    const out = [];
    clis.forEach(cl => {
      const d = cl.id === cid ? dados : criativosDoCliente(trab, cl.id, cu);
      d.forEach(gg => {
        // também os conceitos e as versões que só estão no Drive (importados ou já vistos)
        const raizV = raizDe(gg.jogo, 'VID');
        const extra = raizV && Array.isArray(drvConceitos[raizV]) ? drvConceitos[raizV].filter(f => { const k = slugF(f.name); return k && !gg.conceitos.has(k) && !/_V\d+$/.test(k); }).map(f => ({ slug: slugF(f.name), nome: nomeBonitoC(f.name), versoes: [], tarefas: [], soDrive: true, pastaUrl: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}` })) : [];
        [...gg.conceitos.values(), ...extra].forEach(c => versoesDe(gg.jogo, c).forEach(x => {
          const et = ((info[chaveVersaoC(gg.jogo.id, c.slug, x.v)] || {}).etiquetas || []).join(' ');
          const txt = normJ([gg.jogo.nome, c.nome, c.slug.replace(/_/g, ' '), x.variacao, x.t && x.t.nome, et, ...x.ficheiros.map(f => f.nome.replace(/_/g, ' '))].join(' '));
          if (palavras.every(p => txt.includes(p))) out.push({ jogo: gg.jogo, c, x, cliente: cl });
        }));
      });
    });
    return out.sort((a, b) => String(b.x.em || '').localeCompare(String(a.x.em || ''))).slice(0, 60);
  }, [qn, trab.tarefas, trab.jogos, trab.versoesInfo, cid, drvConceitos, drvVersoes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selR, setSelR] = useState(0);
  useEffect(() => { setSelR(0); }, [qn]);
  const marcar = txt => {
    const s = String(txt || ''); if (!qn) return s;
    const ps = qn.split(/\s+/).filter(Boolean); const n = s.split('').map(ch => { const x = (ch.normalize('NFD')[0] || '').toLowerCase(); return /[a-z0-9]/.test(x) ? x : ' '; }).join('');
    const marcas = new Array(s.length).fill(false);
    ps.forEach(p => { let i = n.indexOf(p); while (i >= 0) { for (let k = i; k < i + p.length && k < s.length; k++) marcas[k] = true; i = n.indexOf(p, i + 1); } });
    const out = []; let i = 0;
    while (i < s.length) { const m = marcas[i]; let j = i; while (j < s.length && marcas[j] === m) j++; out.push(m ? <mark key={i} className={`rounded px-0.5 ${claro ? 'bg-amber-200 text-slate-900' : 'bg-amber-700/70 text-amber-50'}`}>{s.slice(i, j)}</mark> : <React.Fragment key={i}>{s.slice(i, j)}</React.Fragment>); i = j; }
    return out;
  };
  const teclaProcura = e => {
    if (!resultados.length) { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelR(i => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelR(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault(); const r = resultados[selR]; if (!r) return;
      if ((e.ctrlKey || e.metaKey) && r.x.t) { if (onAbrir) onAbrir(r.x.t.id); }
      else abrirLinkExterno(linkAEPara({ trab, t: r.x.t, clientes, jogo: r.jogo, conceito: r.c.slug, v: r.x.v }));
    } else if (e.key === 'Escape') { e.stopPropagation(); setQ(''); }
  };
  const chipV = (v, forte2) => <span className={`inline-flex items-center justify-center min-w-[34px] h-[22px] px-1.5 rounded-md text-xs font-semibold tabular-nums ${forte2 ? (claro ? 'bg-blue-100 text-blue-800' : 'bg-blue-500/25 text-blue-200') : claro ? 'bg-slate-100 text-slate-700' : 'bg-slate-700/60 text-slate-200'}`}>{v ? `V${v}` : 'V?'}</span>;
  const pontoEstado = e => <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: e.cor }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: e.cor }} />{e.nome}</span>;
  const listaNomes = (x, k) => (
    <div className={`rounded-xl border ${claro ? 'border-slate-200 bg-slate-50' : 'border-slate-700/60 bg-slate-900/40'}`}>
      {x.ficheiros.map((f, i) => (
        <div key={f.nome + i} className={`group/n flex items-center gap-2 px-3 py-1.5 ${i ? `border-t ${claro ? 'border-slate-200' : 'border-slate-700/50'}` : ''}`}>
          <span className={`w-9 shrink-0 text-[11px] font-semibold ${claro ? 'text-blue-700' : 'text-blue-300'}`}>{f.formato || '—'}</span>
          <code className={`flex-1 min-w-0 break-all text-[11.5px] leading-snug ${claro ? 'text-slate-700' : 'text-slate-300'}`}>{qn ? marcar(f.nome) : f.nome}</code>
          <button type="button" onClick={() => copiarK(f.nome, `${k}:${i}`)} className={`shrink-0 px-2 py-0.5 text-[11px] rounded-md border ${copiadoK === `${k}:${i}` ? 'border-emerald-400 text-emerald-500' : `${claro ? 'border-slate-200 hover:bg-white' : 'border-slate-700 hover:bg-white/5'} sm:opacity-0 sm:group-hover/n:opacity-100 focus:opacity-100`}`}>{copiadoK === `${k}:${i}` ? '✓' : 'Copiar'}</button>
        </div>
      ))}
    </div>
  );
  const linhaVersao = (jogo, c, x, l, fmts, comConceito = false) => {
    const k = `${jogo.id}|${c.slug}|${x.k}`;
    const e = estadoDe(jogo, c, x);
    const temN = x.ficheiros.length > 0;
    const abN = nomesAb.has(k);
    const tem = new Set(x.ficheiros.map(f => f.formato));
    const faltam = temN ? fmts.filter(f => !tem.has(f)) : [];
    const ultimaV = l[l.length - 1] === x;
    const ets = etiquetasDe(jogo, c, x.v);
    const o = { trab, t: x.t, clientes, jogo, conceito: c.slug, v: x.v };
    return (
      <div key={x.k} className={`border-t ${claro ? 'border-slate-100' : 'border-slate-700/40'} ${abN ? (claro ? 'bg-blue-50/40' : 'bg-blue-500/[0.04]') : ''}`}>
        {/* Carregar na linha (fora dos botões) abre e fecha os detalhes */}
        <div onClick={e => { if (e.target.closest && e.target.closest('a,button,select,input,label,[role=menu]')) return; alternar(setNomesAb, k); }} className="cursor-pointer flex flex-wrap sm:grid sm:grid-cols-[44px_minmax(0,1fr)_150px_48px_52px_150px_auto] items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-2.5">
          {chipV(x.v, ultimaV && !x.soDrive)}
          <div className="min-w-0 flex-1 sm:flex-none flex items-center gap-2.5">
            {x.ficheiros.some(f => f.id) && <MiniaturaVersao ficheiros={x.ficheiros} conta={conta} claro={claro} rotulo={`Ver o vídeo da V${x.v}`} onClick={() => { setTocarK(k); setNomesAb(s0 => { const n = new Set(s0); n.add(k); return n; }); }} />}
            <div className="min-w-0 flex-1">
            {(x.variacao || comConceito) && <p className="text-[13.5px] truncate" title={`${comConceito ? `${c.nome}${x.variacao ? ' · ' : ''}` : ''}${x.variacao || ''}`}>{comConceito && <b className="font-semibold">{c.nome}{x.variacao ? ' · ' : ''}</b>}{x.variacao ? (qn ? marcar(x.variacao) : x.variacao) : ''}</p>}
            {x.t ? <button type="button" onClick={() => onAbrir && onAbrir(x.t.id)} className={`block max-w-full truncate text-left hover:text-blue-400 hover:underline ${x.variacao || comConceito ? `text-[11.5px] ${sub}` : 'text-[13px]'}`} title={`Abrir a tarefa: ${x.t.nome}`}>{x.t.nome}</button> : <p className={`text-[11.5px] ${sub}`}>sem tarefa na app</p>}
            {ets.length > 0 && <p className="flex flex-wrap gap-1 mt-0.5">{ets.map(et => <span key={et} className={`text-[10.5px] px-1.5 rounded-full ${claro ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/15 text-violet-300'}`}>{et}</span>)}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 w-full sm:w-auto order-last sm:order-none">
            {[...tem].filter(Boolean).map(f => <span key={f} className={`text-[11px] px-1.5 py-px rounded-md ${claro ? 'bg-slate-100 text-slate-700' : 'bg-slate-700/50 text-slate-200'}`}>{f}</span>)}
            {faltam.map(f => <span key={f} className="text-[11px] px-1.5 rounded-md border border-dashed border-amber-500/70 text-amber-500" title={`Falta o ${f}? As outras versões deste conceito têm.`}>{f}?</span>)}
            {!temN && <span className={`text-[11px] ${sub}`}>{x.planeada && !(x.t && x.t.estado === 'feito') ? 'ainda sem ficheiros' : '—'}</span>}
          </div>
          <span className={`text-xs tabular-nums ${claro ? 'text-slate-700' : 'text-slate-200'}`} title="Duração do vídeo">{(() => { const d = x.ficheiros.map(f => durDoNomeF(f.nome)).find(Boolean) || (x.t && Number(campoVersao(x.t.ficheiros || {}, x.v, 'duracao'))) || null; return d ? fmtDur(d) : ''; })()}</span>
          <span className={`text-xs tabular-nums ${sub}`}>{x.em ? dataCurta(x.em) : ''}</span>
          <label className="relative inline-flex items-center min-w-0" title="Estado desta versão (escolhe à mão: aprovada, ganhou nos testes…)">
            <span className="sr-only">Estado da V{x.v}</span>
            {pontoEstado(e)}
            <select value={(info[chaveVersaoC(jogo.id, c.slug, x.v)] || {}).estado || ''} onChange={ev => mudarInfo(jogo, c, x.v, { estado: ev.target.value || null })} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`Estado da V${x.v}`}>
              <option value="">Automático ({e.manual ? 'pela tarefa' : e.nome})</option>
              {ESTADOS_V.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          <div className="flex items-center justify-end gap-1.5 ml-auto">
            {x.ficheiros.some(f => f.id) && <button type="button" onClick={() => { if (abN) { alternar(setNomesAb, k); return; } setTocarK(k); setNomesAb(s0 => { const n = new Set(s0); n.add(k); return n; }); }} className={btn} aria-label={abN ? `Fechar a V${x.v}` : `Ver o vídeo da V${x.v}`} title={abN ? 'Fechar' : 'Ver o vídeo (vem do Drive)'}><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></button>}
            <LinkPC href={linkAEPara(o)} className={btn} title="Abrir o projeto no After Effects" txtAbrir="…" txtOk="">AE</LinkPC>
            {x.url && <a href={urlAbrir(x.url, jogo.cid)} target="_blank" rel="noopener noreferrer" className={btn} title="Abrir a pasta desta versão no Drive">Drive</a>}
            <button type="button" onClick={() => alternar(setNomesAb, k)} aria-expanded={abN} className={`${btn} ${abN ? (claro ? '!bg-blue-50 !border-blue-300 !text-blue-700' : '!bg-blue-500/15 !border-blue-500/50 !text-blue-200') : ''}`}>{abN ? 'Fechar ▴' : temN ? 'Nomes' : 'Mais'}</button>
          </div>
        </div>
        {abN && (
          <div className="px-3 sm:pl-[72px] sm:pr-4 pb-3 space-y-2">
            <div className="flex gap-3 items-start">
              {temN && x.ficheiros.some(f => f.id) && <VerVideo key={x.k} conta={conta} ficheiros={x.ficheiros} claro={claro} sub={sub} iniciar={tocarK === k} largura={150} />}
              <div className="flex-1 min-w-0">{temN ? listaNomes(x, k) : <p className={`text-xs ${sub}`}>{x.planeada ? 'Esta versão ainda não foi enviada pela app.' : 'Sem nomes guardados.'}</p>}</div>
            </div>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs ${sub}`}>
              {temN && x.ficheiros.length > 1 && <button type="button" onClick={() => copiarK(x.ficheiros.map(f => f.nome).join('\n'), `${k}:todos`)} className="text-blue-500 hover:underline">{copiadoK === `${k}:todos` ? '✓ copiados' : `Copiar os ${x.ficheiros.length} nomes`}</button>}
              {temN && <a href={linkExportsPara(o, x.ficheiros[0].nome)} className="text-blue-500 hover:underline" title="Abre a @Exports do projeto no Explorador (precisa do lançador AbrirAE atualizado)">Abrir a pasta de exports</a>}
              {x.folha && x.folha.ok && <span>Spreadsheet: linha {x.folha.linha}</span>}
              <label className="inline-flex items-center gap-1.5 min-w-[220px] flex-1">
                <span className="shrink-0">Etiquetas</span>
                <input key={ets.join(',')} defaultValue={ets.join(', ')} placeholder="ex.: voz feminina, UGC, hook" onBlur={ev => { const l2 = [...new Set(ev.target.value.split(',').map(s => s.trim()).filter(Boolean))]; if (l2.join(',') !== ets.join(',')) mudarInfo(jogo, c, x.v, { etiquetas: l2 }); }} onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }} className={`${inputClass} flex-1 min-w-0 !py-1 text-xs`} aria-label={`Etiquetas da V${x.v}`} />
              </label>
            </div>
          </div>
        )}
      </div>
    );
  };
  // Mês/ano de um conceito: de quando foram entregues as versões (ex.: "Set 2026" ou "Set → Out 2026")
  const MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const mesCurto = k => { const [a, m] = String(k).split('-').map(Number); return a && m ? `${MES_CURTO[m - 1]} ${a}` : ''; };
  const mesesDoConceito = (jogo, c) => { const ds = versoesDe(jogo, c).map(entregaDe).filter(Boolean).map(d => d.slice(0, 7)).sort(); return ds.length ? { de: ds[0], ate: ds[ds.length - 1] } : null; };
  const etiquetaMeses = mc => (!mc ? '' : mc.de === mc.ate ? mesCurto(mc.de) : mc.de.slice(0, 4) === mc.ate.slice(0, 4) ? `${MES_CURTO[Number(mc.de.slice(5, 7)) - 1]} → ${mesCurto(mc.ate)}` : `${mesCurto(mc.de)} → ${mesCurto(mc.ate)}`);
  const cartaoConceito = (jogo, c) => {
    const kc = `${jogo.id}|${c.slug}`;
    const ab = aberto(c);
    const l = versoesDe(jogo, c);
    const fmts = formatosConceito(l);
    const raiz = raizDe(jogo, l[0] && l[0].tipoF === 'BAN' ? 'BAN' : 'VID');
    const estD = drvVersoes[`${raiz}|${c.slug}`];
    const prox = Math.max(0, ...l.map(x => x.v || 0)) + 1;
    const ult = l.filter(x => x.t).slice(-1)[0];
    const pastaC = c.pastaUrl || (raiz && Array.isArray(drvConceitos[raiz]) ? (() => { const f = drvConceitos[raiz].find(y => slugF(y.name) === c.slug); return f ? (f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`) : null; })() : null);
    const resumo = l.length ? l.slice(0, 4).map(x => `V${x.v || '?'}${x.variacao ? ` ${x.variacao}` : ''}`).join(' · ') + (l.length > 4 ? ` · +${l.length - 4}` : '') : (c.soDrive ? 'só no Drive (antes da app)' : '');
    const o = { trab, t: ult ? ult.t : null, clientes, jogo, conceito: c.slug, v: ult ? ult.v : null };
    const alternarC = () => { setAbertos(s => { const n = new Set(s); if (ab) { n.delete(kc); n.add(`${kc}|fechado`); } else { n.add(kc); n.delete(`${kc}|fechado`); } return n; }); if (!ab) verNoDrive(jogo, c, false); };
    return (
      <section key={kc} className={cartao}>
        {/* Toda a faixa do conceito abre e fecha (menos os botões à direita) */}
        <div onClick={e => { if (e.target.closest && e.target.closest('a,button,select,input,[role=menu]')) return; alternarC(); }} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-2 sm:px-3 py-2.5 cursor-pointer rounded-t-2xl ${ab ? '' : 'rounded-b-2xl'} ${claro ? 'hover:bg-slate-50' : 'hover:bg-white/[0.02]'}`}>
          <button type="button" onClick={alternarC} aria-expanded={ab} className="flex-1 min-w-[200px] flex items-center gap-2 text-left py-0.5">
            <span className={`w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`}><svg width="12" height="12" viewBox="0 0 12 12" className={`transition-transform ${sub}`} style={{ transform: ab ? 'rotate(90deg)' : 'none' }} aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 min-w-0"><span className={`text-[15px] font-semibold truncate ${forte}`}>{c.nome}</span>{(() => { const em = etiquetaMeses(mesesDoConceito(jogo, c)); return em ? <span className={`shrink-0 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md ${claro ? 'bg-slate-100 text-slate-600' : 'bg-slate-700/70 text-slate-300'}`}>{em}</span> : null; })()}</span>
              <span className={`block text-xs truncate ${sub}`}>{l.length ? `${l.length} ${l.length === 1 ? 'versão' : 'versões'} · ` : ''}{ab ? (c.ultimo ? `última a ${dataCurta(c.ultimo)}` : '') : resumo}</span>
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            {pastaC && <a href={urlAbrir(pastaC, jogo.cid)} target="_blank" rel="noopener noreferrer" className={btn}>Pasta do Drive ↗</a>}
            <div className="relative" data-menu-nova="1">
              <button type="button" onClick={() => setMenuNova(menuNova === kc ? null : kc)} aria-expanded={menuNova === kc} className={btn}>+ Nova versão (V{prox})</button>
              {menuNova === kc && (
                <div className={`absolute right-0 top-full mt-1 z-40 w-48 rounded-xl border shadow-2xl py-1 ${claro ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-100'}`} role="menu">
                  <p className={`px-3 pt-1 pb-1.5 text-[11px] ${sub}`}>V{prox} de {c.nome} é…</p>
                  {[['variacao', 'Variação'], ['iteracao', 'Iteração'], ['video', 'Vídeo novo'], ['banner_var', 'Variação de banner']].map(([id, txt]) => (
                    <button key={id} type="button" role="menuitem" onClick={() => novaVersao(jogo, c, id)} className={`w-full px-3 py-2 text-sm text-left ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>{txt}</button>
                  ))}
                </div>
              )}
            </div>
            <LinkPC href={linkAEPara(o)} className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white`} title="Abrir o projeto deste conceito no After Effects">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M10 11l4 2.5-4 2.5z" /></svg>Abrir no AE</LinkPC>
          </div>
        </div>
        {ab && (
          <div>
            <div className={`hidden sm:grid grid-cols-[44px_minmax(0,1fr)_150px_48px_52px_150px_auto] gap-x-3 px-4 py-1.5 border-t text-[10.5px] uppercase tracking-wide ${sub} ${claro ? 'border-slate-100' : 'border-slate-700/40'}`}>
              <span>Versão</span><span>Variação · tarefa</span><span>Formatos</span><span>Duração</span><span>Data</span><span>Estado</span><span className="text-right">Atalhos</span>
            </div>
            {l.map(x => linhaVersao(jogo, c, x, l, fmts))}
            {!l.length && <p className={`px-4 py-3 border-t text-xs ${sub} ${claro ? 'border-slate-100' : 'border-slate-700/40'}`}>{estD === 'a ver' ? 'A ver o Drive…' : 'Ainda sem versões.'}</p>}
            {(estD === 'a ver' || estD === 'sem acesso') && l.length > 0 && (
              <p className={`px-4 py-2 border-t text-[11px] ${sub} ${claro ? 'border-slate-100' : 'border-slate-700/40'}`}>
                {estD === 'a ver' ? 'A ver se há versões só no Drive…' : <button type="button" onClick={() => verNoDrive(jogo, c, true)} className="text-blue-500 hover:underline">Ver também as versões que estão no Drive</button>}
              </p>
            )}
          </div>
        )}
      </section>
    );
  };
  if (!clis.length) return <p className={`text-sm ${sub}`}>Ainda não tens jogos. Junta-os no separador Jogos de um cliente.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`flex-1 min-w-[260px] flex items-center gap-2 h-11 px-3 rounded-xl border ${claro ? 'bg-white border-slate-300 focus-within:border-blue-500' : 'bg-slate-900/60 border-slate-600 focus-within:border-blue-500'}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={sub} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input ref={procRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={teclaProcura} placeholder="Procurar conceito, variação, nome de ficheiro, tarefa ou etiqueta…" aria-label="Procurar nos criativos" className="flex-1 min-w-0 bg-transparent outline-none text-sm" />
          {q ? <button type="button" onClick={() => setQ('')} className={`text-xs ${sub} hover:text-blue-400`} aria-label="Limpar a procura">✕</button> : <kbd className={`hidden sm:inline text-[10.5px] font-mono px-1.5 py-0.5 rounded border ${claro ? 'border-slate-300 text-slate-500' : 'border-slate-600 text-slate-400'}`}>Ctrl K</kbd>}
        </label>
        {!qn && clis.length > 1 && (
          <select value={String(cid)} onChange={e => gravarSel({ cid: e.target.value })} className={`h-11 rounded-xl border px-3 text-sm bg-transparent ${claro ? 'border-slate-300' : 'border-slate-600'}`} aria-label="Cliente">
            {clis.map(c => <option key={c.id} value={String(c.id)} className={claro ? '' : 'bg-slate-800'}>{c.nome}</option>)}
          </select>
        )}
        {!qn && (
          <select value={tipoF} onChange={e => setTipoF(e.target.value)} className={`h-11 rounded-xl border px-3 text-sm bg-transparent ${claro ? 'border-slate-300' : 'border-slate-600'}`} aria-label="Tipo">
            <option value="todos" className={claro ? '' : 'bg-slate-800'}>Vídeos e banners</option>
            <option value="VID" className={claro ? '' : 'bg-slate-800'}>Só vídeos</option>
            <option value="BAN" className={claro ? '' : 'bg-slate-800'}>Só banners</option>
          </select>
        )}
        {!qn && (
          <button type="button" onClick={importarDrive} disabled={!!importa} className={`h-11 inline-flex items-center gap-2 px-3 rounded-xl border text-sm whitespace-nowrap ${claro ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/5'} disabled:opacity-80`} title="Lê do Drive todos os conceitos e versões deste cliente (também os de antes da app), com miniaturas e vídeo. Fica guardado neste computador.">
            {importa ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" aria-hidden="true" />{importa.total ? `A importar… ${importa.feitos}/${importa.total}` : `A ler ${importa.jogo || 'o Drive'}…`}</> : <>⤓ Importar do Drive</>}
          </button>
        )}
        {!qn && (
          <select value={ordem} onChange={e => setOrdem(e.target.value)} className={`h-11 rounded-xl border px-3 text-sm bg-transparent ${claro ? 'border-slate-300' : 'border-slate-600'}`} aria-label="Ordem">
            <option value="recentes" className={claro ? '' : 'bg-slate-800'}>Conceitos: mais recentes</option>
            <option value="entrega" className={claro ? '' : 'bg-slate-800'}>Por ordem de entrega</option>
            <option value="entrega-antiga" className={claro ? '' : 'bg-slate-800'}>Por entrega (mais antigas primeiro)</option>
            <option value="nome" className={claro ? '' : 'bg-slate-800'}>Conceitos: por nome</option>
          </select>
        )}
      </div>

      {qn ? (
        <div className="space-y-2">
          <p className={`text-xs ${sub}`}>{resultados.length ? `${resultados.length === 60 ? '60+' : resultados.length} ${resultados.length === 1 ? 'versão' : 'versões'} · ↑ ↓ escolher · Enter abre no AE · Ctrl+Enter abre a tarefa` : 'Nada encontrado. Procura também por partes do nome do ficheiro (ex.: 9X16, V3).'}</p>
          {resultados.length > 0 && (
            <div className={`${cartao} overflow-hidden`}>
              {resultados.map((r, i) => {
                const k = `res|${r.jogo.id}|${r.c.slug}|${r.x.k}`;
                const e = estadoDe(r.jogo, r.c, r.x);
                const o = { trab, t: r.x.t, clientes, jogo: r.jogo, conceito: r.c.slug, v: r.x.v };
                const abN = nomesAb.has(k);
                return (
                  <div key={k} className={`${i ? `border-t ${claro ? 'border-slate-100' : 'border-slate-700/40'}` : ''} ${i === selR ? (claro ? 'bg-blue-50' : 'bg-blue-500/10') : ''}`} onMouseEnter={() => setSelR(i)}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-2.5">
                      {chipV(r.x.v, i === selR)}
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm truncate"><b className="font-semibold">{marcar(r.c.nome)}</b>{r.x.variacao ? <> · {marcar(r.x.variacao)}</> : null}</p>
                        <p className={`text-xs truncate ${sub}`}>{clis.length > 1 ? `${r.cliente.nome} · ` : ''}{r.jogo.nome} · {r.x.em ? dataCurta(r.x.em) : ''} · <span style={{ color: e.cor }}>{e.nome}</span></p>
                      </div>
                      <LinkPC href={linkAEPara(o)} className={i === selR ? 'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white' : btn}>Abrir no AE</LinkPC>
                      {r.x.t && <button type="button" onClick={() => onAbrir && onAbrir(r.x.t.id)} className={btn}>Tarefa</button>}
                      {r.x.ficheiros.length > 0 && <button type="button" onClick={() => alternar(setNomesAb, k)} aria-expanded={abN} className={btn}>Nomes{abN ? ' ▴' : ''}</button>}
                    </div>
                    {(abN || (i === selR && r.x.ficheiros.some(f => normJ(f.nome.replace(/_/g, ' ')).includes(qn.split(/\s+/)[0])))) && r.x.ficheiros.length > 0 && <div className="px-3 sm:pl-[60px] pb-3">{listaNomes(r.x, k)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-4 items-start">
          <nav aria-label="Jogos" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 lg:sticky lg:top-[150px]">
            {estudios.map(est => (
              <React.Fragment key={est || '-'}>
                {(estudios.length > 1 || est) && <p className={`hidden lg:block px-2 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide ${sub}`}>{est || 'Outros'}</p>}
                {jogosL.filter(x => String(x.jogo.estudio || '').trim() === est).sort((a, b) => String(a.jogo.nome).localeCompare(String(b.jogo.nome), 'pt')).map(x => {
                  const at = x.jogo.id === jogoId;
                  return (
                    <button key={x.jogo.id} type="button" onClick={() => gravarSel({ cid, jogoId: x.jogo.id })} aria-current={at ? 'true' : undefined}
                      className={`shrink-0 flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-left ${at ? (claro ? 'bg-blue-50 text-blue-800 font-semibold' : 'bg-blue-500/15 text-blue-100 font-semibold') : claro ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/5 text-slate-300'}`}>
                      <span className="truncate">{x.jogo.nome}</span><span className={`text-xs tabular-nums ${at ? '' : sub}`}>{x.n}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </nav>
          <div className="min-w-0 space-y-3">
            {g && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className={`text-lg font-semibold ${forte}`}>{g.jogo.nome}</h3>
                <span className={`text-xs ${sub}`}>{[g.jogo.codigo, g.jogo.estudio, `${conceitosL.length} conceito${conceitosL.length === 1 ? '' : 's'}`, `${[...g.conceitos.values()].reduce((a, c) => a + c.versoes.length, 0)} versões na app`].filter(Boolean).join(' · ')}</span>
              </div>
            )}
            {g && ordem === 'nome' && conceitosL.map(c => cartaoConceito(g.jogo, c))}
            {g && ordem === 'recentes' && (() => {
              // Conceitos agrupados pelo mês da última entrega: cada mês num cartão, com o que foi entregue nesse mês
              const grupos = []; const emCurso = []; const semData = [];
              conceitosL.forEach(c => {
                const mc = mesesDoConceito(g.jogo, c);
                if (!mc) { (c.tarefas.some(t => t.estado !== 'feito') ? emCurso : semData).push(c); return; }
                let gr = grupos.find(x => x.k === mc.ate); if (!gr) { gr = { k: mc.ate, l: [] }; grupos.push(gr); }
                gr.l.push(c);
              });
              grupos.sort((a, b) => b.k.localeCompare(a.k));
              const entreguesNoMes = k => conceitosL.reduce((n, c) => n + versoesDe(g.jogo, c).filter(x => (entregaDe(x) || '').slice(0, 7) === k).length, 0);
              const caixa = (chave, titulo, extra, l) => (
                <div key={chave} className={`rounded-2xl p-2 sm:p-3 space-y-2 ${claro ? 'bg-slate-100/80 ring-1 ring-slate-200' : 'bg-slate-900/50 ring-1 ring-slate-700/50'}`}>
                  <p className="px-1 flex flex-wrap items-baseline gap-x-2"><span className={`text-sm font-semibold ${forte}`}>{titulo}</span><span className={`text-xs ${sub}`}>{extra}</span></p>
                  {l.map(c => cartaoConceito(g.jogo, c))}
                </div>
              );
              return (
                <>
                  {emCurso.length > 0 && caixa('curso', 'Em curso', `${emCurso.length} ${emCurso.length === 1 ? 'conceito' : 'conceitos'} ainda por entregar`, emCurso)}
                  {grupos.map(gr => { const nv = entreguesNoMes(gr.k); const [a, m] = gr.k.split('-').map(Number); return caixa(gr.k, `${MESES_NOMES[m - 1]} ${a}`, `${gr.l.length} ${gr.l.length === 1 ? 'conceito' : 'conceitos'} · ${nv} ${nv === 1 ? 'versão entregue' : 'versões entregues'}`, gr.l); })}
                  {semData.length > 0 && caixa('sem', 'Sem data', `${semData.length} ${semData.length === 1 ? 'conceito' : 'conceitos'} (só no Drive ainda por ver, ou sem envio)`, semData)}
                </>
              );
            })()}
            {g && /^entrega/.test(ordem) && (() => {
              // Todas as versões do jogo pela ordem em que foram entregues (agrupadas por mês); as que faltam entregar ficam em cima
              const antiga = ordem === 'entrega-antiga';
              const todas = conceitosL.flatMap(c => versoesDe(g.jogo, c).map(x => ({ c, x, d: entregaDe(x), l: null })));
              const porEntregar = todas.filter(r => !r.d && r.x.t && r.x.t.estado !== 'feito');
              const entregues = todas.filter(r => r.d).sort((a, b) => (antiga ? a.d.localeCompare(b.d) : b.d.localeCompare(a.d)));
              const semData = todas.filter(r => !r.d && !(r.x.t && r.x.t.estado !== 'feito'));
              const meses = [];
              entregues.forEach(r => { const k = r.d.slice(0, 7); let m = meses.find(y => y.k === k); if (!m) { m = { k, l: [] }; meses.push(m); } m.l.push(r); });
              const nomeMes = k => { const [a, mm] = k.split('-').map(Number); return `${MESES_NOMES[mm - 1] || ''} ${a}`; };
              const bloco = (titulo, l, chave) => (
                <section key={chave} className={`${cartao} overflow-hidden`}>
                  <p className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{titulo} <span className="font-normal normal-case tracking-normal">· {l.length} {l.length === 1 ? 'versão' : 'versões'}</span></p>
                  {l.map(r => { const lc = versoesDe(g.jogo, r.c); return <React.Fragment key={`${r.c.slug}|${r.x.k}`}>{linhaVersao(g.jogo, r.c, r.x, lc, formatosConceito(lc), true)}</React.Fragment>; })}
                </section>
              );
              const faltaDrive = conceitosL.filter(c => !Array.isArray(drvVersoes[`${raizDe(g.jogo, c.versoes[0] && c.versoes[0].tipoF === 'BAN' ? 'BAN' : 'VID')}|${c.slug}`]));
              return (
                <>
                  {faltaDrive.length > 0 && <p className={`text-xs ${sub}`}>Aqui estão as versões que a app conhece. <button type="button" onClick={async () => { for (const c of faltaDrive) await verNoDrive(g.jogo, c, true); }} className="text-blue-500 hover:underline">Juntar também as que só estão no Drive ({faltaDrive.length} conceito{faltaDrive.length === 1 ? '' : 's'})</button></p>}
                  {porEntregar.length > 0 && bloco('Por entregar', porEntregar, 'por')}
                  {meses.map(m => bloco(nomeMes(m.k), m.l, m.k))}
                  {semData.length > 0 && bloco('Sem data de entrega', semData, 'sem')}
                  {!todas.length && <p className={`text-sm ${sub}`}>Ainda sem versões neste jogo.</p>}
                </>
              );
            })()}
            {g && !conceitosL.length && <p className={`text-sm ${sub}`}>Ainda não há conceitos neste jogo. Aparecem quando escreves o conceito em "Nomes dos ficheiros" de uma tarefa.</p>}
          </div>
        </div>
      )}
    </div>
  );
};
const NomesFicheiros = ({ t, trab, set, mudar, claro, inputClass, lab, sub, caixa }) => {
  const fx = t.ficheiros || {};
  // Versão do lote de exports que estás a preparar (V2, V3…): os nomes lá em cima mostram essa
  const [versaoLote, setVersaoLote] = useState(null);
  const [infoVersao, setInfoVersao] = useState(null); // versões do conceito que já estão no Drive { conceito, existe, versoes }
  useEffect(() => { setVersaoLote(null); setInfoVersao(null); }, [t.id]);
  const r = nomesFicheiros(trab, t, versaoLote);
  const enviadas = versoesEnviadas(t);
  const vEnviada = enviadas.includes(Number(r.vNum));
  const proximaV = enviadas.length ? Math.max(...enviadas) + 1 : 1;
  const [avisoV, setAvisoV] = useState('');
  const [mudarV, setMudarV] = useState(false);
  const [tentV, setTentV] = useState(0);
  // Conceito + versão nunca se repetem: se a versão já existe (no Drive ou noutra tarefa deste conceito), passa sozinha para a seguinte livre
  const [versaoMudada, setVersaoMudada] = useState('');
  const infoV = infoVersao && infoVersao.conceito === r.conceito ? infoVersao : null;
  const noDriveV = infoV ? infoV.versoes : [];
  const outrasV = versoesDeOutras(trab, t, r.conceito);
  const vAtualN = Number(r.vNum);
  const ocupadaV = !!r.conceito && !enviadas.includes(vAtualN) && (noDriveV.includes(vAtualN) || outrasV.includes(vAtualN));
  const livreV = Math.max(0, ...noDriveV, ...outrasV, ...enviadas) + 1;
  useEffect(() => { setVersaoMudada(''); }, [t.id, r.conceito]);
  // A versão fica guardada na tarefa logo que há conceito: assim esse número fica reservado para ela (as outras passam à seguinte)
  useEffect(() => {
    if (ocupadaV || fx.versao || versaoLote || !r.conceito || enviadas.length) return;
    setF({ versao: String(r.vNum) });
  }, [r.conceito, r.vNum, fx.versao, ocupadaV]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ocupadaV) return;
    setVersaoMudada(`Já existe um ${r.conceito}_V${vAtualN} ${noDriveV.includes(vAtualN) ? 'no Drive' : 'noutra tarefa'} (é de outro vídeo) — passei esta para a V${livreV}.`);
    setF({ versao: String(livreV) });
    if (versaoLote) setVersaoLote(String(livreV));
    setTentV(x => x + 1);
  }, [ocupadaV, vAtualN, r.conceito, livreV]); // eslint-disable-line react-hooks/exhaustive-deps
  const gravarVersao = txt => {
    const n = String(txt || '').replace(/^v/i, '').trim();
    setAvisoV('');
    if (n && enviadas.includes(Number(n)) && String(n) !== String(r.vNum)) { setAvisoV(`A V${n} já foi enviada — os ficheiros novos são a V${proximaV} (ou outra que ainda não exista).`); setTentV(x => x + 1); return; }
    setF({ versao: n });
    if (versaoLote) setVersaoLote(n || null);
  };
  const [copiado, setCopiado] = useState('');
  useEffect(() => { if (!copiado) return undefined; const i = setTimeout(() => setCopiado(''), 1400); return () => clearTimeout(i); }, [copiado]);
  const setF = patch => set({ ficheiros: { ...fx, ...patch } });
  const setFV = patch => set({ ficheiros: fxComVersao(fx, t, r.vNum, patch) });
  const [nomesFechados] = useState(() => { try { return localStorage.getItem('trab-nomes-fechados') === '1'; } catch (e) { return false; } });
  const [blocosAbertos, setBlocosAbertos] = useState({});
  useEffect(() => { setBlocosAbertos({}); }, [t.id]);
  const ic = `${inputClass} text-sm py-1.5`;
  // Conceitos que já estão no Drive deste jogo: sugere-os ao escrever e avisa se o nome é novo (evita gralhas → V1 por engano)
  const jogoD = r.jogo && !r.jogo.semJogo ? r.jogo : null;
  const raizD = jogoD ? idPastaDrive(['BAN', 'ICO', 'FG', 'SS'].includes(r.tipo) ? jogoD.driveStatics : jogoD.drive) : null;
  const contaD = contaDe(t.cid);
  const [conceitosD, setConceitosD] = useState(() => (raizD && cacheConceitos[raizD] ? cacheConceitos[raizD].pastas.map(x => x.name) : null));
  const [aVerD, setAVerD] = useState(false);
  const [txtConceito, setTxtConceito] = useState(null);
  const carregarConceitos = async pedir => {
    if (!raizD || aVerD) return;
    const tk = tokenGuardadoDe(contaD) || (pedir || ligadoSempre(contaD || '_') ? await tokenDrive(contaD).catch(() => null) : null);
    if (!tk) return;
    setAVerD(true);
    try { setConceitosD((await conceitosNoDrive(tk, raizD)).map(x => x.name).sort((a, b) => a.localeCompare(b))); } catch (e) { /* sem acesso */ }
    setAVerD(false);
  };
  useEffect(() => { if (raizD && !conceitosD) carregarConceitos(false); }, [raizD]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lista do menu: conceitos que estão no Drive + os das outras tarefas deste jogo (sem repetir)
  const [menuC, setMenuC] = useState(false);
  const [marcadoC, setMarcadoC] = useState(0);
  const conceitosLocais = useMemo(() => {
    if (!jogoD) return [];
    const out = [];
    // Só conceitos escritos em "Nomes dos ficheiros" noutras tarefas deste jogo (nunca nomes de tarefas)
    (trab.tarefas || []).forEach(x => { if (x.id === t.id) return; const j = jogoDaTarefa(trab, x); if (!j || j.id !== jogoD.id) return; const c = x.ficheiros && x.ficheiros.conceito; if (c && !/^\d+\s*x\s*\d+$/i.test(c)) out.push(c); });
    return out;
  }, [trab.tarefas, jogoD && jogoD.id, t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const opcoesC = useMemo(() => {
    const vistos = new Map();
    // Pastas que não são conceitos deste jogo: as de outros jogos do cliente e as de versões soltas (…_V1)
    const outros = new Set((trab.jogos || []).filter(j => jogoD && String(j.cid) === String(jogoD.cid) && j.id !== jogoD.id).flatMap(j => [j.nome, j.nomeFatura, j.codigo, ...(j.aliases || [])]).map(slugF).filter(x => x && x.length >= 3));
    const naoConceito = n => { const k = slugF(n); return /_V\d+$/.test(k) || [...outros].some(o => k === o || k.startsWith(o + '_')); };
    (conceitosD || []).forEach(n => { const k = slugF(n); if (k && !naoConceito(n) && !vistos.has(k)) vistos.set(k, { nome: n, drive: true }); });
    conceitosLocais.forEach(n => { const k = slugF(n); if (k && !vistos.has(k)) vistos.set(k, { nome: n, drive: false }); });
    return [...vistos.values()].sort((a, b) => (b.drive - a.drive) || a.nome.localeCompare(b.nome, 'pt'));
  }, [conceitosD, conceitosLocais, trab.jogos, jogoD && jogoD.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const txtFiltro = txtConceito != null ? txtConceito : '';
  const filtradasC = (txtFiltro.trim() ? opcoesC.filter(o => slugF(o.nome).includes(slugF(txtFiltro)) || conceitoParecido(o.nome, txtFiltro)) : opcoesC).slice(0, 40);
  const escolherC = n => { setF({ conceito: n }); setTxtConceito(null); setMenuC(false); };
  const conceitoAtual = txtConceito != null ? txtConceito : (fx.conceito || conceitoDoNome(t.nome));
  const conceitoNovo = conceitosD && conceitoAtual && !conceitosD.some(n => slugF(n) === slugF(conceitoAtual));
  const parecidos = conceitoNovo ? conceitosD.filter(n => conceitoParecido(n, conceitoAtual)).slice(0, 4) : [];
  // Clientes sem jogos (ex.: Hendrik) têm outro workflow: a secção não aparece
  if (!(trab.jogos || []).some(j => String(j.cid) === String(t.cid))) return null;
  const botaoCopiar = (txt, k) => <button type="button" onClick={() => { copiar(txt); setCopiado(k); }} className={`shrink-0 px-2 py-1 text-[11px] rounded-md border ${copiado === k ? 'border-emerald-400 text-emerald-400' : claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>{copiado === k ? '✓ copiado' : 'Copiar'}</button>;
  return (
    <div className={`${caixa} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">Nomes dos ficheiros</p>
        <span className={`text-[13px] ${sub}`}>{r.jogo ? `${r.jogo.nome} (${r.cod})` : 'sem jogo'}{r.jogo && !r.jogo.codigo ? ' · código no separador Jogos' : ''}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <label className="flex flex-col gap-1 col-span-2 sm:col-span-3 min-w-0"><span className={lab}>Conceito</span>
          <div className="relative">
            <input value={txtConceito != null ? txtConceito : (fx.conceito || '')} placeholder={conceitoDoNome(t.nome) || 'ex.: Enemy at the gates'} className={`${ic} pr-7`} autoComplete="off" aria-label="Conceito"
              onFocus={() => { setMenuC(true); setMarcadoC(0); if (!conceitosD) carregarConceitos(false); }}
              onChange={e => { setTxtConceito(e.target.value); setMenuC(true); setMarcadoC(0); }}
              onBlur={e => { const v = e.target.value.trim(); setMenuC(false); if (v !== (fx.conceito || '')) setF({ conceito: v }); setTxtConceito(null); }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMenuC(true); setMarcadoC(i => Math.min(i + 1, filtradasC.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcadoC(i => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (menuC && filtradasC[marcadoC] && txtConceito != null && txtConceito.trim()) { escolherC(filtradasC[marcadoC].nome); } e.currentTarget.blur(); }
                else if (e.key === 'Escape' && menuC) { e.stopPropagation(); setMenuC(false); }
              }} />
            <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); setMenuC(m => !m); if (!conceitosD) carregarConceitos(false); }} className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] ${sub} hover:text-blue-400`} aria-label="Ver conceitos">▼</button>
            {menuC && (filtradasC.length > 0 || aVerD) && (
              <div className={`absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-xl py-1 ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-600'}`}>
                {aVerD && !filtradasC.length && <p className={`px-3 py-1.5 text-xs ${sub}`}>A ver o Drive…</p>}
                {filtradasC.map((o, i) => (
                  <button key={o.nome} type="button" onMouseDown={e => { e.preventDefault(); escolherC(o.nome); }} onMouseEnter={() => setMarcadoC(i)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${i === marcadoC ? (claro ? 'bg-blue-50' : 'bg-blue-500/15') : ''}`}>
                    <span className="flex-1 min-w-0 truncate">{o.nome}</span>
                    <span className={`shrink-0 text-[10px] ${o.drive ? 'text-emerald-500' : sub}`}>{o.drive ? 'no Drive' : 'tarefas'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>
        <div className="flex flex-col gap-1 min-w-0"><span className={lab}>Versão</span>
          {mudarV ? <TxtIn key={'ver' + tentV + r.vNum} valor={versaoLote || fx.versao || r.vNum} onGravar={v => { gravarVersao(v); setMudarV(false); }} placeholder="ex.: 4" className={ic} />
            : <button type="button" onClick={() => setMudarV(true)} title="A versão decide-se ao enviar (nova ou substituir). Carrega só se precisares de a mudar à mão." className={`${ic} text-left font-semibold`}>V{versaoLote || fx.versao || r.vNum}</button>}
        </div>
        <label className="flex flex-col gap-1 col-span-1 sm:col-span-2 min-w-0"><span className={lab}>Variação</span>{vEnviada ? <input key={'var' + r.vNum} disabled value={campoVersao(fx, r.vNum, 'variacao', t) || ''} placeholder="—" title={`A V${r.vNum} já foi enviada: a variação fica como foi`} className={`${ic} opacity-60 cursor-not-allowed`} /> : <TxtIn key={'var' + r.vNum} valor={campoVersao(fx, r.vNum, 'variacao', t)} onGravar={v => setFV({ variacao: v })} placeholder="ex.: Reaction" className={ic} />}</label>
        <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Duração (s)</span>{vEnviada ? <input key={'dur' + r.vNum} disabled value={campoVersao(fx, r.vNum, 'duracao') ?? ''} placeholder="—" title={`A V${r.vNum} já foi enviada`} className={`${ic} opacity-60 cursor-not-allowed`} /> : <NumIn key={'dur' + r.vNum} valor={campoVersao(fx, r.vNum, 'duracao') ?? null} placeholder="59" decimal={false} onGravar={v => setFV({ duracao: v })} className={ic} />}</label>
        <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Tipo</span><TxtIn valor={fx.tipo} onGravar={v => setF({ tipo: v })} placeholder={r.tipo} className={ic} /></label>
        <label className="flex flex-col gap-1 col-span-2 min-w-0"><span className={lab}>Data</span><input key={t.id + 'fd' + (fx.data || '')} type="date" defaultValue={fx.data || r.dia} onBlur={e => { if (e.target.value && e.target.value !== (fx.data || r.dia)) setF({ data: e.target.value }); }} className={ic} /></label>
      </div>
      {(() => {
        // Uma só linha de estado (avisos importantes primeiro)
        if (raizD && conceitosD && conceitoNovo) return <p className="-mt-1 text-xs text-amber-500">Conceito novo: a pasta no Drive é criada no 1.º envio (V1).{parecidos.length > 0 && <> Querias dizer {parecidos.map((n, i) => <React.Fragment key={n}>{i ? ', ' : ' '}<button type="button" onClick={() => { setF({ conceito: n }); setTxtConceito(null); }} className="underline text-blue-400 hover:text-blue-300">{n}</button></React.Fragment>)}?</>}</p>;
        if (avisoV) return <p className="-mt-1 text-xs text-amber-500">⚠ {avisoV}</p>;
        if (versaoMudada) return <p className="-mt-1 text-xs text-amber-500">⚠ {versaoMudada}</p>;
        return (
          <p className={`-mt-1 text-xs ${sub}`}>
            {vEnviada ? <>A V{r.vNum} já foi enviada — vês tudo em <b>Entregas</b>, lá em baixo. Para a corrigir, arrasta os exports novos e escolhe <b>Substituir</b>.</> : <>Próxima entrega: <b>V{r.vNum}</b>.</>}
            {raizD && !conceitosD ? <> <button type="button" disabled={aVerD} onClick={() => carregarConceitos(true)} className="text-blue-400 hover:text-blue-300 disabled:opacity-50">{aVerD ? 'A ver o Drive…' : 'Ver conceitos no Drive'}</button></> : raizD && conceitoAtual ? <span className="text-emerald-500"> · pasta do conceito no Drive ✓</span> : null}
          </p>
        );
      })()}
      {r.conceito && <VersoesConceito key={t.id} t={t} trab={trab} conceito={r.conceito} raizD={raizD} contaD={contaD} claro={claro} sub={sub} mostrarDrive={!!(raizD && !(conceitosD && conceitoNovo))} />}
      {(() => {
        // A versão que estás a preparar (em cima) + as que já foram enviadas com esta tarefa (ficam guardadas, por baixo)
        const blocos = [];
        if (!vEnviada && r.ficheiros.length) blocos.push({ k: 'atual', v: Number(r.vNum), pasta: r.pasta, ficheiros: r.ficheiros, atual: true });
        // As versões já enviadas estão em "Entregas" (lá em baixo), com os nomes de cada uma
        if (!blocos.length) return vEnviada ? null : <p className={`text-[13px] ${sub}`}>Escolhe os formatos em Entrega para veres os nomes.</p>;
        const abertoDe = b => (blocosAbertos[b.k] != null ? blocosAbertos[b.k] : b.atual ? !nomesFechados : vEnviada && String(b.v) === String(r.vNum));
        const alternarBloco = b => { const novo = !abertoDe(b); setBlocosAbertos(o => ({ ...o, [b.k]: novo })); if (b.atual) { try { localStorage.setItem('trab-nomes-fechados', novo ? '0' : '1'); } catch (e) { /* */ } } };
        return (
          <div className="space-y-2">
            {blocos.map(b => {
              const ab = abertoDe(b);
              return (
                <div key={b.k} className={`space-y-1.5 ${b.atual ? '' : `rounded-lg border px-2 py-1.5 ${claro ? 'border-slate-200 bg-slate-50/60' : 'border-white/[0.06] bg-white/[0.02]'}`}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => alternarBloco(b)} aria-expanded={ab} title={ab ? 'Esconder os nomes' : 'Mostrar os nomes'} className={`flex-1 min-w-0 flex items-center gap-2 text-left rounded-md -ml-1 pl-1 ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
                      <svg width="10" height="10" viewBox="0 0 12 12" className={`shrink-0 transition-transform ${sub}`} style={{ transform: ab ? 'rotate(90deg)' : 'none' }} aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className={`shrink-0 ${b.atual ? sub : 'text-emerald-500'}`}><IcoT n="pasta" className="w-3.5 h-3.5" /></span>
                      <code className="flex-1 min-w-0 truncate text-xs" title={b.pasta}>{b.pasta}</code>
                      <span className={`shrink-0 text-[10px] px-1.5 py-px rounded ${b.atual ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-500'}`}>{b.atual ? `V${b.v} · nova` : `V${b.v} · enviada`}</span>
                      {!ab && <span className={`shrink-0 text-[11px] ${sub}`}>{b.ficheiros.length} vídeo{b.ficheiros.length === 1 ? '' : 's'}</span>}
                    </button>
                    {b.url && <a href={urlAbrir(b.url, t.cid)} target="_blank" rel="noopener noreferrer" className={`shrink-0 px-2 py-1 text-[11px] rounded-md border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`} title="Abrir a pasta no Drive">Drive ↗</a>}
                    {botaoCopiar(b.pasta.split(' / ').pop(), b.k + ':pasta')}
                  </div>
                  {ab && b.ficheiros.map((f, i) => (
                    <div key={(f.formato || '') + i} className="flex items-center gap-2"><span className={`text-xs w-9 shrink-0 ${sub}`}>{f.formato}</span><code className="flex-1 min-w-0 break-all leading-snug text-xs" title={f.nome}>{f.nome}</code>{botaoCopiar(f.nome, b.k + ':' + i)}</div>
                  ))}
                  {ab && b.ficheiros.length > 1 && <div className="flex justify-end">{botaoCopiar(b.ficheiros.map(f => f.nome).join('\n'), b.k + ':todos')}</div>}
                </div>
              );
            })}
          </div>
        );
      })()}
      <EnviarDrive t={t} trab={trab} r={r} set={set} mudar={mudar} claro={claro} sub={sub} inputClass={inputClass} versaoLote={versaoLote} setVersaoLote={setVersaoLote} infoVersao={infoVersao} setInfoVersao={setInfoVersao} />
      <TrelloTarefa t={t} trab={trab} set={set} claro={claro} sub={sub} />
    </div>
  );
};

// ── Criar uma spreadsheet (tracker) para vários jogos de uma vez ──
const CriarFolha = ({ cid, jogos, mudar, claro, sub, inputClass, onFechar, estudioInicial = '' }) => {
  const modelos = jogos.filter(j => /docs\.google\.com\/spreadsheets\/d\//.test(String(j.sheet || '')));
  // Estúdios (ex.: Bear Hug, Hyp Games): escolhem os jogos de uma vez; o nome fica guardado em cada jogo
  const estudios = [...new Set(jogos.map(j => String(j.estudio || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  const doEstudio = e => jogos.filter(j => e && String(j.estudio || '').trim().toLowerCase() === e.trim().toLowerCase());
  const [sel, setSel] = useState(() => new Set(doEstudio(estudioInicial).filter(j => !j.sheet).map(j => j.id)));
  const [estudio, setEstudio] = useState(estudioInicial);
  const [titulo, setTitulo] = useState(estudioInicial ? `${estudioInicial} — Creative tracker` : 'Creative tracker');
  const [tituloMexido, setTituloMexido] = useState(false);
  const escolherEstudio = e => {
    setEstudio(e);
    const dele = jogos.filter(j => String(j.estudio || '').trim().toLowerCase() === e.trim().toLowerCase());
    if (dele.length) setSel(new Set(dele.map(j => j.id)));
    if (!tituloMexido) setTitulo(e.trim() ? `${e.trim()} — Creative tracker` : 'Creative tracker');
  };
  const [modeloId, setModeloId] = useState(() => (modelos[0] ? modelos[0].id : ''));
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState(null);
  const escolhidos = jogos.filter(j => sel.has(j.id));
  const modelo = modelos.find(j => j.id === modeloId) || null;
  const criar = async () => {
    if (!escolhidos.length || !titulo.trim()) return;
    setOcupado(true); setMsg('A ligar à conta Google…');
    try {
      const conta = contaDe(cid);
      const tk = tokenGuardadoDe(conta) || await tokenDrive(conta);
      const r = await criarFolhaTracker(tk, { titulo: titulo.trim(), jogos: escolhidos, modelo, aviso: setMsg });
      const est = estudio.trim();
      mudar(tr => r.tabs.reduce((acc, x) => opJogo(acc, x.jogoId, { sheet: `${r.url}#gid=${x.gid}`, ...(est ? { estudio: est } : {}) }), tr));
      setFeito(r); setMsg('');
    } catch (e) { setMsg(`Não consegui criar: ${e.message || e}`); }
    setOcupado(false);
  };
  const caixa = `rounded-xl border p-3 space-y-3 ${claro ? 'border-blue-200 bg-blue-50/60' : 'border-blue-500/30 bg-blue-500/[0.06]'}`;
  if (feito) return (
    <div className={caixa}>
      <p className="text-sm font-medium text-emerald-500">✓ Spreadsheet criada{feito.naPasta && modelo ? ` na mesma pasta do tracker do ${modelo.nome}` : ' no teu Drive'}.</p>
      <p className={`text-xs ${sub}`}>Tabs: {feito.tabs.map(x => x.tab).join(' · ')}. Já ficou ligada a cada jogo — a partir de agora, ao enviar para o Drive, o nome entra na tab certa, e o Trello deixa de aparecer nestes jogos.</p>
      <div className="flex flex-wrap gap-2">
        <a href={urlAbrir(feito.url, cid)} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Abrir a spreadsheet ↗</a>
        <button type="button" onClick={onFechar} className={`px-3 py-1.5 text-sm rounded-lg border ${claro ? 'border-slate-200 hover:bg-white' : 'border-slate-600 hover:bg-white/5'}`}>Fechar</button>
      </div>
    </div>
  );
  return (
    <div className={caixa}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">📊 Nova spreadsheet de tracker</p>
        <button type="button" onClick={onFechar} disabled={ocupado} className={`text-xs ${sub} hover:text-red-400`} aria-label="Fechar">✕</button>
      </div>
      <div>
        <p className={`text-xs mb-1 ${sub}`}>Estúdio</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {estudios.map(e => (
            <button key={e} type="button" aria-pressed={estudio === e} onClick={() => escolherEstudio(estudio === e ? '' : e)}
              className={`px-2.5 py-1 text-xs rounded-lg border ${estudio === e ? 'border-blue-500 bg-blue-600 text-white' : claro ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-slate-600 hover:bg-white/5'}`}>{e}</button>
          ))}
          <input value={estudios.includes(estudio) ? '' : estudio} onChange={e => escolherEstudio(e.target.value)} placeholder={estudios.length ? 'ou outro (ex.: Hyp Games)' : 'ex.: Bear Hug'} aria-label="Nome do estúdio"
            className={`${inputClass} !w-48 text-xs py-1`} />
        </div>
        <p className={`text-[11px] mt-1 ${sub}`}>{estudios.length ? 'Carregar num estúdio escolhe os jogos dele.' : 'Escreve o estúdio e escolhe os jogos dele — fica guardado para a próxima vez.'}</p>
      </div>
      <label className="block"><span className={`text-xs ${sub}`}>Nome da spreadsheet</span>
        <input value={titulo} onChange={e => { setTitulo(e.target.value); setTituloMexido(true); }} placeholder="ex.: Bear Hug — Creative tracker" className={`${inputClass} text-sm py-1.5 mt-1`} /></label>
      <div>
        <p className={`text-xs mb-1 ${sub}`}>Jogos (uma tab para cada)</p>
        <div className="flex flex-wrap gap-1.5">
          {jogos.map(j => {
            const on = sel.has(j.id);
            return (
              <button key={j.id} type="button" aria-pressed={on} onClick={() => setSel(p => { const n = new Set(p); if (n.has(j.id)) n.delete(j.id); else n.add(j.id); return n; })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border ${on ? 'border-blue-500 bg-blue-600 text-white' : claro ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-slate-600 hover:bg-white/5'}`}>
                <span className="w-2 h-2 rounded-sm" style={{ background: j.cor }} />{j.nome}{j.estudio && j.estudio !== estudio ? <span className={on ? 'text-white/70' : sub}>· {j.estudio}</span> : null}{j.sheet ? <span className={on ? 'text-white/80' : sub} title="Já tem spreadsheet — se o escolheres, fica com a nova">·📊</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block"><span className={`text-xs ${sub}`}>Copiar as colunas de</span>
        <select value={modeloId} onChange={e => setModeloId(e.target.value)} className={`${inputClass} text-sm py-1.5 mt-1`}>
          {modelos.map(j => <option key={j.id} value={j.id}>Tracker do {j.nome}</option>)}
          <option value="">Nenhum (só "Creative" e "Notes")</option>
        </select></label>
      <p className={`text-[11px] ${sub}`}>{modelo ? `Copia a tab do ${modelo.nome} (cabeçalho, caixinhas das networks, cores) sem as linhas dos criativos, e guarda a spreadsheet na mesma pasta do Drive.` : 'Fica no "O meu disco" da conta do cliente — depois podes mudá-la de pasta.'}{contaDe(cid) ? ` Conta: ${contaDe(cid)}.` : ''}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado || !escolhidos.length || !titulo.trim()} onClick={criar} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{ocupado ? 'A criar…' : `Criar com ${escolhidos.length} tab${escolhidos.length === 1 ? '' : 's'}`}</button>
        {msg && <span className={`text-xs ${/^Não consegui/.test(msg) ? 'text-red-400' : sub}`}>{msg}</span>}
      </div>
    </div>
  );
};
// ── Jogos de um cliente (cartões com cor, outros nomes, Drive e spreadsheet) ──
const JogosCliente = ({ cid, trab, cu, clientes, ano, theme, inputClass, mudar, notasDe, onAbrirNota, onNovaNota }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [nome, setNome] = useState('');
  const [corAberta, setCorAberta] = useState(null);
  const [novaFolha, setNovaFolha] = useState(false); // false | true | 'Nome do estúdio'
  const jogos = (trab.jogos || []).filter(j => String(j.cid) === String(cid)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
  const listas = (trab.pastas || []).filter(p => String(p.cid) === String(cid));
  const semJogo = listas.filter(p => !p.jogoId && !p.mesNum && ehListaDeJogo(p.nome) && !listas.some(f => f.paiId === p.id));
  const stats = j => {
    const ls = listas.filter(p => p.jogoId === j.id);
    const ids = new Set(ls.map(p => p.id));
    const ts = (trab.tarefas || []).filter(t => ids.has(t.pastaId));
    const valor = ts.filter(t => trabEntrega(t).startsWith(`${ano}-`)).reduce((a, t) => a + trabValor(t, cu, clientes), 0);
    return { listas: ls.length, tarefas: ts.length, valor };
  };
  const ic = `${inputClass} text-sm py-1.5`;
  const link = url => (url && /^https?:\/\//.test(url) ? <a href={urlAbrir(url, cid)} target="_blank" rel="noopener noreferrer" className="shrink-0 px-2 text-blue-400 hover:text-blue-300" title="Abrir">↗</a> : null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={e => { e.preventDefault(); if (nome.trim()) { mudar(tr => opNovoJogo(tr, cid, nome.trim())); setNome(''); } }} className="flex gap-2">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do jogo (ex.: Mahjong)" className={`${inputClass} !w-56 text-sm py-1.5`} />
          <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">+ Jogo</button>
        </form>
        {semJogo.length > 0 && <button type="button" onClick={() => mudar(tr => opDetetarJogos(tr, cid))} className={`px-3 py-1.5 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} inline-flex items-center gap-1.5`}><IcoT n="jogo" className="w-3.5 h-3.5" /> Detetar os jogos pelos nomes das listas ({semJogo.length})</button>}
        {jogos.length > 0 && !novaFolha && <button type="button" onClick={() => setNovaFolha(true)} className={`px-3 py-1.5 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} inline-flex items-center gap-1.5`}><IcoFolha s={13} /> Criar spreadsheet para vários jogos</button>}
      </div>
      {novaFolha && <CriarFolha key={String(novaFolha)} cid={cid} jogos={jogos} mudar={mudar} claro={claro} sub={sub} inputClass={inputClass} estudioInicial={typeof novaFolha === 'string' ? novaFolha : ''} onFechar={() => setNovaFolha(false)} />}
      {!jogos.length && <p className={`text-sm ${sub}`}>Ainda não há jogos. Cria um, ou deteta-os pelos nomes das listas (ex.: "44 - Mahjong - Oct" → Mahjong).</p>}
      {jogos.length > 0 && (() => {
        // Uma linha por jogo, agrupados por estúdio (desliza para o lado em ecrãs pequenos)
        const COLS = 'grid grid-cols-[210px_120px_84px_170px_120px_190px_190px_190px_220px_150px_150px_24px] gap-2 items-start';
        const cab = ['Jogo', 'Estúdio', 'Código', 'Outros nomes', 'Nome na fatura', 'Drive — vídeos', 'Drive — statics', 'Spreadsheet', 'Trello', 'Este ano', 'Notas', ''];
        const grupos = {};
        jogos.forEach(j => { const e = String(j.estudio || '').trim(); (grupos[e] = grupos[e] || []).push(j); });
        const nomesG = Object.keys(grupos).sort((x, y) => (!x) - (!y) || x.localeCompare(y, 'pt'));
        const celula = (rot, el) => <label className="block min-w-0"><span className="sr-only">{rot}</span>{el}</label>;
        const fundo = claro ? 'bg-white' : 'bg-slate-900';
        return (
          <div className={`rounded-xl border overflow-x-auto ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/40'}`}>
            <div className="min-w-max">
              <div className={`${COLS} px-3 py-2 text-[11px] uppercase tracking-wide border-b ${sub} ${claro ? 'border-slate-200' : 'border-white/[0.06]'}`}>
                {cab.map((c, i) => <span key={i} className={i === 0 ? `sticky left-0 z-10 ${fundo}` : ''}>{c}</span>)}
              </div>
              {nomesG.map(e => (
                <div key={e || '_'}>
                  <div className={`flex items-center gap-2 px-3 py-2 ${claro ? 'bg-slate-50' : 'bg-white/[0.03]'}`}>
                    <span className={`sticky left-3 text-sm font-semibold ${e ? '' : sub}`}>{e || 'Sem estúdio'}</span>
                    <span className={`text-xs ${sub}`}>{grupos[e].length} jogo{grupos[e].length === 1 ? '' : 's'}</span>
                    {e && grupos[e].some(j => !j.sheet) && <button type="button" onClick={() => setNovaFolha(e)} className="sticky left-48 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><IcoFolha s={12} /> Criar spreadsheet para {e}</button>}
                  </div>
                  {grupos[e].map(j => {
                    const st = stats(j);
                    const set = patch => mudar(tr => opJogo(tr, j.id, patch));
                    return (
                      <div key={j.id} className={`border-t ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
                        <div className={`${COLS} px-3 py-2`}>
                          <div className={`sticky left-0 z-10 flex items-center gap-2 ${fundo}`}>
                            <button type="button" onClick={() => setCorAberta(corAberta === j.id ? null : j.id)} className="w-5 h-5 rounded-md shrink-0 ring-1 ring-black/10" style={{ background: j.cor }} aria-label={`Cor de ${j.nome}`} title="Mudar a cor" />
                            <TxtIn valor={j.nome} onGravar={v => v && set({ nome: v })} className={`${ic} font-semibold`} />
                          </div>
                          {celula('Estúdio', <TxtIn valor={j.estudio} onGravar={v => set({ estudio: v.trim() })} placeholder="estúdio" list={`estudios-${cid}`} className={ic} />)}
                          {celula('Código', <TxtIn valor={j.codigo} onGravar={v => set({ codigo: v })} placeholder="código" className={ic} />)}
                          {celula('Outros nomes (vírgulas)', <TxtIn valor={(j.aliases || []).join(', ')} onGravar={v => set({ aliases: [...new Set(v.split(',').map(a => a.trim()).filter(Boolean))] })} placeholder="outros nomes, vírgulas" className={ic} />)}
                          {celula('Nome na fatura', <TxtIn valor={j.nomeFatura} onGravar={v => set({ nomeFatura: v })} placeholder={j.nome} className={ic} />)}
                          {celula('Pasta do Drive — vídeos', <div className="flex items-center"><TxtIn valor={j.drive} onGravar={v => set({ drive: v })} placeholder="drive.google.com/…" className={ic} />{link(j.drive)}</div>)}
                          {celula('Pasta do Drive — banners / statics', <div className="flex items-center"><TxtIn valor={j.driveStatics} onGravar={v => set({ driveStatics: v })} placeholder="(opcional)" className={ic} />{link(j.driveStatics)}</div>)}
                          {celula('Spreadsheet', <div className="flex items-center"><TxtIn valor={j.sheet} onGravar={v => set({ sheet: v })} placeholder="docs.google.com/spreadsheets/…" className={ic} />{link(j.sheet)}</div>)}
                          {j.sheet && j.trello ? <p className={`text-[11px] leading-snug pt-1 ${sub}`}>Escondido (tem spreadsheet). <button type="button" onClick={() => set({ trello: '', trelloLista: null })} className="text-blue-400 hover:text-blue-300">Tirar</button></p>
                            : j.sheet ? <span className={`text-[11px] pt-1.5 ${sub}`}>— (usa a spreadsheet)</span>
                            : <TrelloJogo j={j} set={set} ic={ic} sub={sub} claro={claro} link={link} semRotulo />}
                          <p className={`text-xs leading-snug pt-1 ${sub}`}>{st.listas} lista{st.listas === 1 ? '' : 's'} · {st.tarefas} tarefa{st.tarefas === 1 ? '' : 's'}<br /><span className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(st.valor)}</span> em {ano}</p>
                          <div className="min-w-0">{onAbrirNota && <NotasLigadas compacto lista={notasDe ? notasDe('jogo', j.id) : []} onAbrir={onAbrirNota} onNova={onNovaNota ? () => onNovaNota('jogo', j.id, j.nome) : null} claro={claro} sub={sub} />}</div>
                          <button type="button" onClick={async () => { if (await confirmar(`Apagar o jogo "${j.nome}"? As listas e as tarefas ficam como estão.`)) mudar(tr => opApagarJogo(tr, j.id)); }} className={`pt-1.5 text-xs ${sub} hover:text-red-400`} aria-label={`Apagar ${j.nome}`}>✕</button>
                        </div>
                        {corAberta === j.id && (
                          <div className="sticky left-0 flex flex-wrap gap-1.5 px-3 pb-2 pl-10">{CORES_JOGO.map(c => <button key={c} type="button" onClick={() => { set({ cor: c }); setCorAberta(null); }} className={`w-6 h-6 rounded-md ${j.cor === c ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`} style={{ background: c }} aria-label={`Cor ${c}`} />)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <datalist id={`estudios-${cid}`}>{[...new Set(jogos.map(j => String(j.estudio || '').trim()).filter(Boolean))].map(e => <option key={e} value={e} />)}</datalist>
          </div>
        );
      })()}
      <p className={`text-[11px] ${sub}`}>As listas novas com o nome do jogo (ex.: "45 - Mahjong - Nov") ligam-se sozinhas e ficam com a cor dele. O código, a pasta do Drive e a spreadsheet vão servir para dar nome aos ficheiros e fazer o upload automático mais tarde.</p>
    </div>
  );
};

// Trello do jogo: o quadro e a lista onde a app cria os cartões novos
const TrelloJogo = ({ j, set, ic, sub, claro, link, semRotulo }) => {
  const [listas, setListas] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = async () => {
    setMsg('A ler o quadro…');
    try { const q = await chamarTrello('quadro', { quadro: j.trello }); setListas(q.listas || []); setMsg(`✓ ${q.nome}`); if (!j.trelloNome || j.trelloNome !== q.nome) set({ trelloNome: q.nome }); }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
  };
  return (
    <div className="space-y-1.5">
      <Campo rot="Quadro do Trello (opcional)" escondido={semRotulo}><div className="flex items-center"><TxtIn valor={j.trello} onGravar={v => { set({ trello: v, trelloLista: v ? j.trelloLista : null }); setListas(null); setMsg(''); }} placeholder="https://trello.com/b/…" className={ic} />{link(j.trello)}</div></Campo>
      {j.trello && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={sub}>Cartões novos vão para:</span>
          {listas ? (
            <select value={(j.trelloLista && j.trelloLista.id) || ''} onChange={e => { const l = listas.find(x => x.id === e.target.value); set({ trelloLista: l ? { id: l.id, nome: l.nome } : null }); }} className={`${ic} !w-auto text-xs py-1`}>
              <option value="">— escolhe a lista —</option>
              {listas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          ) : (
            <>
              <b>{j.trelloLista ? j.trelloLista.nome : 'ainda não escolhida'}</b>
              <button type="button" onClick={carregar} className="text-blue-400 hover:text-blue-300">{j.trelloLista ? 'Mudar' : 'Escolher a lista'}</button>
            </>
          )}
          {msg && <span className={/^⚠/.test(msg) ? 'text-red-400' : sub}>{msg}</span>}
        </div>
      )}
    </div>
  );
};
// Cartão do Trello da tarefa: criar (com o nome da tarefa) ou ligar a um que já existe
const TrelloTarefa = ({ t, trab, set, claro, sub }) => {
  const jogo = jogoDaTarefa(trab, t);
  const quadro = jogo && !jogo.semJogo && (usaTrello(jogo) || (t.trello && t.trello.id)) ? jogo.trello : null;
  const [parecidos, setParecidos] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');
  const nomeAuto = jogo && !jogo.semJogo ? nomeCartaoTarefa(jogo, t) : t.nome;
  const [nome, setNome] = useState(nomeAuto);
  useEffect(() => { setNome(nomeAuto); setParecidos(null); setMsg(''); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNome(nomeAuto); }, [nomeAuto]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!quadro) return null;
  const btn = `px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} disabled:opacity-50`;
  const procurar = async () => {
    setOcupado(true); setMsg('');
    try { const cs = await cartoesTrello(quadro, true); const ps = parecidosTrello(cs, t.nome); setParecidos(ps); if (!ps.length) setMsg('Não encontrei nenhum cartão com um nome parecido.'); }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
    setOcupado(false);
  };
  const criar = async () => {
    setOcupado(true); setMsg('');
    try {
      const r = await criarCartaoTrello(jogo, nome.trim() || t.nome);
      set({ trello: { id: r.id, url: r.url, nome: r.nome }, trelloSolto: false });
      setMsg(r.jaExistia ? '✓ Já havia um cartão com este nome — liguei a esse.' : `✓ Cartão criado em "${jogo.trelloLista.nome}".`);
      if (porPartilhar(t, r.id).length) { setOcupado(false); await partilharDrive(r.id); }
    } catch (e) { setMsg(`⚠ ${e.message || e}`); }
    setOcupado(false);
  };
  // Junta ao cartão os links das versões já enviadas que ainda lá não estão
  const partilharDrive = async (cartao = t.trello && t.trello.id) => {
    if (!cartao || !porPartilhar(t, cartao).length) return;
    setOcupado(true);
    const r = await partilharNoTrello(t, cartao);
    if (r.n) set({ drive: r.drive });
    setMsg(r.erro ? `⚠ ${r.erro}` : `✓ ${r.n === 1 ? 'Link do Drive juntado' : `${r.n} links do Drive juntados`} ao cartão.`);
    setOcupado(false);
  };
  return (
    <div className={`mt-3 pt-3 border-t space-y-2 ${claro ? 'border-slate-200' : 'border-slate-700/60'}`}>
      <p className="text-sm font-medium">Trello <span className={`text-xs font-normal ${sub}`}>· {jogo.trelloNome || 'quadro do jogo'}</span></p>
      {t.trello && t.trello.id ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a href={t.trello.url} target="_blank" rel="noopener noreferrer" className={`${btn} !border-blue-500/50 text-blue-400`}>Abrir o cartão ↗</a>
          <span className={`truncate max-w-[60%] ${sub}`} title={t.trello.nome}>{t.trello.nome}</span>
          {listaDoCartao(t.trello.id) && <span className={`px-1.5 py-px rounded text-[11px] font-medium ${corListaTrello(listaDoCartao(t.trello.id)) === 'review' ? 'bg-amber-500/15 text-amber-500' : corListaTrello(listaDoCartao(t.trello.id)) === 'ok' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-sky-500/15 text-sky-500'}`} title="Lista onde o cartão está no Trello">{listaDoCartao(t.trello.id)}</span>}
          <button type="button" onClick={() => set({ trello: null, trelloSolto: true })} className={`${sub} hover:text-red-400`} title="Desligar este cartão da tarefa (não apaga nada no Trello)">Desligar</button>
          {linkNoTrello(t)
            ? <p className="w-full text-[11px] text-emerald-500">✓ O link da pasta do Drive já está neste cartão.</p>
            : versoesDrive(t.drive).length
              ? <p className={`w-full text-[11px] ${sub}`}>{(() => { const pend = porPartilhar(t, t.trello.id); return pend.length === versoesDrive(t.drive).length ? 'O link do Drive ainda não está no cartão.' : `Falta juntar ${pend.map(d => `V${versaoDaPasta(d)}`).join(', ')} ao cartão.`; })()} <button type="button" disabled={ocupado} onClick={() => partilharDrive()} className="text-blue-400 hover:text-blue-300 disabled:opacity-50">{ocupado ? 'A juntar…' : 'Juntar agora'}</button></p>
              : <p className={`w-full text-[11px] ${sub}`}>Quando enviares para o Drive, a app junta o link da pasta a este cartão.</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input value={nome} onChange={e => setNome(e.target.value)} className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/40 ${claro ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700'}`} aria-label="Nome do cartão" />
            <button type="button" disabled={ocupado || !nome.trim()} onClick={criar} className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{ocupado ? '…' : '+ Criar cartão'}</button>
            <button type="button" disabled={ocupado} onClick={procurar} className={`shrink-0 ${btn}`}>Ligar a um que já existe</button>
          </div>
          {jogo.trelloLista ? <p className={`text-[11px] ${sub}`}>Vai para a lista "{jogo.trelloLista.nome}".</p> : <p className="text-[11px] text-amber-500">Escolhe a lista dos cartões novos no jogo (cliente → Jogos).</p>}
          {parecidos && parecidos.length > 0 && (
            <div className={`rounded-lg border divide-y ${claro ? 'border-slate-200 divide-slate-200' : 'border-slate-700 divide-slate-700/60'}`}>
              {parecidos.map(c => (
                <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate hover:text-blue-400" title={c.nome}>{c.nome}</a>
                  <button type="button" onClick={() => { set({ trello: { id: c.id, url: c.url, nome: c.nome }, trelloSolto: false }); setParecidos(null); setMsg('✓ Ligado.'); partilharDrive(c.id); }} className="shrink-0 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">Ligar</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {msg && <p className={`text-xs ${/^⚠/.test(msg) ? 'text-red-400' : /^✓/.test(msg) ? 'text-emerald-500' : sub}`}>{msg}</p>}
    </div>
  );
};

// ── Tempo de uma tarefa em gráfico: uma linha por dia, cada sessão é uma barra (passa o rato para ver, carrega para editar) ──
const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const GraficoTempo = ({ t, mudar, claro, inputClass, est }) => {
  const [selId, setSelId] = useState(null);
  const corre = (t.tempos || []).some(x => !x.fim);
  const [, setTic] = useState(0);
  useEffect(() => { if (!corre) return undefined; const i = setInterval(() => setTic(x => x + 1), 30000); return () => clearInterval(i); }, [corre]);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const agora = Date.now();
  const sessoes = (t.tempos || []).map(x => ({ x, ini: Date.parse(x.ini), fim: x.fim ? Date.parse(x.fim) : agora })).filter(q => q.ini && q.fim > q.ini);
  // Parte as sessões que passam da meia-noite (cada bocado fica no seu dia)
  const segs = [];
  sessoes.forEach(q => {
    let a = q.ini;
    while (a < q.fim) {
      const d = new Date(a); const dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const b = Math.min(q.fim, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime());
      segs.push({ q, dia: dia0, h0: (a - dia0) / 3600000, h1: (b - dia0) / 3600000 });
      a = b;
    }
  });
  const dias = [...new Set(segs.map(x => x.dia))].sort((a, b) => a - b);
  let hMin = segs.length ? Math.floor(Math.min(...segs.map(x => x.h0))) : 9;
  let hMax = segs.length ? Math.ceil(Math.max(...segs.map(x => x.h1))) : 18;
  if (hMax - hMin < 6) { const falta = 6 - (hMax - hMin); hMin = Math.max(0, hMin - Math.ceil(falta / 2)); hMax = Math.min(24, hMin + 6); hMin = Math.max(0, hMax - 6); }
  const span = hMax - hMin;
  const passo = span > 12 ? 3 : span > 6 ? 2 : 1;
  const marcas = []; for (let h = Math.ceil(hMin / passo) * passo; h <= hMax; h += passo) marcas.push(h);
  const pct = h => `${((h - hMin) / span) * 100}%`;
  const totalH = sessoes.reduce((a, q) => a + (q.fim - q.ini), 0) / 3600000;
  const sel = sessoes.find(q => q.x.id === selId);
  const grelha = claro ? 'bg-slate-200' : 'bg-white/[0.06]';
  const atualizar = (id, patch) => mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: (y.tempos || []).map(z => (z.id === id ? { ...z, ...patch } : z)) })));
  if (!sessoes.length) return <p className={`text-xs ${sub}`}>Sem tempo registado.</p>;
  return (
    <div className="space-y-2">
      {est > 0 && (
        <div title={`${tempoTxt(totalH)} de ${tempoTxt(est)} estimadas`}>
          <div className={`relative h-1.5 rounded-full overflow-hidden ${grelha}`}>
            <div className={`absolute inset-y-0 left-0 rounded-full ${totalH > est ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, totalH / est * 100)}%` }} />
          </div>
          <p className={`mt-0.5 text-[10px] text-right ${totalH > est ? 'text-red-400' : sub}`}>{totalH > est ? `+${tempoTxt(totalH - est)} acima da estimativa` : `faltam ${tempoTxt(est - totalH)} para a estimativa`}</p>
        </div>
      )}
      <div className="space-y-1.5" title="Passa o rato por uma barra para ver as horas · carrega para mudar ou apagar">
        {dias.map(dia => {
          const ds = segs.filter(x => x.dia === dia);
          const tot = ds.reduce((a, x) => a + (x.h1 - x.h0), 0);
          const d = new Date(dia);
          return (
            <div key={dia} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <div className="leading-tight">
                <p className="text-[11px] font-medium">{DIAS_SEM[d.getDay()]} {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}</p>
                <p className={`text-[10px] tabular-nums ${sub}`}>{tempoTxt(tot)}</p>
              </div>
              <div className={`relative h-6 rounded-md ${claro ? 'bg-slate-100' : 'bg-white/[0.03]'}`}>
                {marcas.map(h => <span key={h} className={`absolute inset-y-0 w-px ${grelha}`} style={{ left: pct(h) }} />)}
                {ds.map((x, i) => {
                  const q = x.q; const ativo = selId === q.x.id; const aCorrer = !q.x.fim;
                  const doisDias = new Date(q.ini).getDate() !== new Date(q.fim).getDate();
                  const meio = ((x.h0 + x.h1) / 2 - hMin) / span;
                  const lado = meio > 0.62 ? 'right-0' : meio < 0.38 ? 'left-0' : 'left-1/2 -translate-x-1/2';
                  return (
                    <button key={q.x.id + i} type="button" onClick={() => setSelId(ativo ? null : q.x.id)}
                      className={`group/bar absolute top-1 bottom-1 rounded-[4px] transition-[filter] hover:brightness-125 hover:z-40 focus:outline-none ${aCorrer ? 'bg-red-500 animate-pulse' : q.x.manual ? 'bg-sky-400/70' : 'bg-blue-500'} ${ativo ? 'ring-2 ring-offset-1 ' + (claro ? 'ring-slate-800 ring-offset-white' : 'ring-white ring-offset-slate-900') : ''}`}
                      style={{ left: pct(x.h0), width: `max(4px, calc(${pct(x.h1)} - ${pct(x.h0)}))` }} aria-label={`Sessão ${hhmm(q.ini)} a ${aCorrer ? 'agora' : hhmm(q.fim)}`}>
                      <span className={`pointer-events-none absolute top-full ${lado} mt-1.5 z-30 hidden group-hover/bar:block whitespace-nowrap rounded-md px-2 py-1 text-[11px] shadow-lg ${claro ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}>
                        {hhmm(q.ini)} → {aCorrer ? 'agora' : `${hhmm(q.fim)}${doisDias ? ' (dia seg.)' : ''}`} · <b>{tempoTxt((q.fim - q.ini) / 3600000)}</b>{q.x.manual ? ' · à mão' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
          <span />
          <div className="relative h-3">
            {marcas.map(h => <span key={h} className={`absolute -translate-x-1/2 text-[9px] tabular-nums ${sub}`} style={{ left: pct(h) }}>{h}h</span>)}
          </div>
        </div>
      </div>
      {sel ? (
        <div className={`rounded-lg border p-2 flex flex-wrap items-center gap-2 text-xs ${claro ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.03]'}`}>
          <input type="datetime-local" defaultValue={paraInputLocal(sel.x.ini)} key={'i' + sel.x.id + sel.x.ini} style={{ colorScheme: claro ? 'light' : 'dark' }} onBlur={e => { if (e.target.value) atualizar(sel.x.id, { ini: new Date(e.target.value).toISOString() }); }} className={`${inputClass} !w-auto text-xs py-1`} aria-label="Início" />
          <span className="opacity-50">→</span>
          {sel.x.fim ? <input type="datetime-local" defaultValue={paraInputLocal(sel.x.fim)} key={'f' + sel.x.id + sel.x.fim} style={{ colorScheme: claro ? 'light' : 'dark' }} onBlur={e => { if (e.target.value) atualizar(sel.x.id, { fim: new Date(e.target.value).toISOString() }); }} className={`${inputClass} !w-auto text-xs py-1`} aria-label="Fim" />
            : <span className="text-red-400 font-medium">a correr</span>}
          <span className="ml-auto flex items-center gap-1">
            <span className="font-semibold tabular-nums mr-1">{tempoTxt((sel.fim - sel.ini) / 3600000)}</span>
            <button type="button" className="px-2 py-1 rounded-md text-red-400 hover:bg-red-500/10" onClick={() => { mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: (y.tempos || []).filter(z => z.id !== sel.x.id) }))); setSelId(null); }}>Apagar</button>
            <button type="button" className={`px-1.5 py-1 rounded-md ${sub} hover:text-current`} onClick={() => setSelId(null)} aria-label="Fechar">✕</button>
          </span>
        </div>
      ) : sessoes.some(q => q.x.manual) ? <p className={`text-xs ${sub}`}><span className="inline-block w-2 h-2 rounded-sm bg-sky-400/70 align-middle" /> posto à mão</p> : null}
    </div>
  );
};

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
        {t && !t.base && <button type="button" onClick={async () => { if (await confirmar(`Apagar o tipo "${t.nome}"? As tarefas que o usam ficam sem valor automático.`)) onCu({ tiposExtra: extra.filter(x => x.id !== t.id) }); }} className={`text-xs ${sub} hover:text-red-400`} aria-label={`Apagar ${t.nome}`}>✕</button>}
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

// Notas (do separador Notas) que falam de um cliente, jogo ou tarefa
const NotasLigadas = ({ lista, onAbrir, onNova, claro, sub, caixa, titulo = 'Notas', compacto = false }) => {
  if (!onAbrir) return null;
  const l = lista || [];
  if (!l.length && !compacto) return (
    <div className={`flex items-center justify-between gap-2 px-1 text-[13px] ${sub}`}>
      <span className="flex items-center gap-1.5" title="Escreve @ numa nota (separador Notas) para a ligar a isto"><IcoT n="nota" className="w-4 h-4" /> {titulo}: nenhuma</span>
      {onNova && <button type="button" onClick={onNova} className="text-blue-400 hover:text-blue-300">+ Nova nota</button>}
    </div>
  );
  return (
    <div className={compacto ? 'space-y-1' : `${caixa} space-y-1.5`}>
      {!compacto && <div className="flex items-center justify-between gap-2"><p className="text-[15px] font-semibold flex items-center gap-1.5"><IcoT n="nota" className="w-4 h-4" /> {titulo} {l.length > 0 && <span className={`text-xs font-normal ${sub}`}>{l.length}</span>}</p>
        {onNova && <button type="button" onClick={onNova} className="text-[13px] text-blue-400 hover:text-blue-300">+ Nova nota</button>}</div>}
      {l.slice(0, compacto ? 3 : 6).map(p => (
        <button key={p.id} type="button" onClick={() => onAbrir(p.id)} className={`w-full text-left px-2 py-1.5 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <span className="block text-sm truncate">{p.titulo || 'Sem título'}</span>
          {!compacto && <span className={`block text-[11px] truncate ${sub}`}>{p.txt ? p.txt.slice(0, 90) : ''}</span>}
        </button>
      ))}
      {l.length > (compacto ? 3 : 6) && <p className={`px-2 text-[11px] ${sub}`}>+{l.length - (compacto ? 3 : 6)} no separador Notas</p>}
      {compacto && onNova && <button type="button" onClick={onNova} className="px-2 text-[11px] text-blue-400 hover:text-blue-300">+ Nova nota</button>}
    </div>
  );
};
// Recibos de um cliente (os que juntas em Receitas), por ano
// ── Pré-visualização de um PDF (ou imagem) ao lado da lista: ecrã inteiro, descarregar e abrir noutro separador ──
// doc = { chave, titulo, sub, obter: () => ({ url, nome, tipo, blob?, revogar? }) | Promise }
// ── Leitor de PDF próprio (pdf.js): sem barras do Chrome, a página ocupa a largura toda e ajusta-se ao ecrã inteiro ──
let PDFJS_P = null;
const carregarPdfJs = () => {
  if (window.pdfjsLib) { if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; return Promise.resolve(window.pdfjsLib); }
  if (!PDFJS_P) {
    PDFJS_P = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => { PDFJS_P = null; falha(new Error('Não consegui carregar o leitor de PDF.')); };
      document.head.appendChild(s);
    });
  }
  return PDFJS_P;
};
// Uma página desenhada à largura pedida (nítida em ecrãs retina)
const PaginaPdf = ({ pdf, n, largura, onClick, cursor }) => {
  const ref = useRef(null);
  const [alt, setAlt] = useState(null);
  useEffect(() => {
    let tarefa = null, vivo = true;
    (async () => {
      const pg = await pdf.getPage(n);
      if (!vivo || !ref.current) return;
      const v1 = pg.getViewport({ scale: 1 });
      const esc = largura / v1.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const vp = pg.getViewport({ scale: esc * dpr });
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      tarefa = pg.render({ canvasContext: cv.getContext('2d'), viewport: vp });
      await tarefa.promise;
      if (!vivo || !ref.current) return;
      // troca só no fim (não pisca enquanto redesenha)
      const alvo = ref.current; alvo.width = cv.width; alvo.height = cv.height; alvo.getContext('2d').drawImage(cv, 0, 0);
      setAlt(Math.round(v1.height * esc));
    })().catch(() => {});
    return () => { vivo = false; if (tarefa) try { tarefa.cancel(); } catch (e) { /* */ } };
  }, [pdf, n, largura]);
  return <canvas ref={ref} onClick={onClick} className={`block bg-white shadow-lg rounded-[2px] ${onClick ? cursor || 'cursor-zoom-in' : ''}`} style={{ width: largura, height: alt || Math.round(largura * 1.414) }} />;
};
const VisorPdf = ({ dados, cheio, onAmpliar, claro }) => {
  const caixa = useRef(null);
  const [larg, setLarg] = useState(0);
  const [altCx, setAltCx] = useState(0);
  const [pdf, setPdf] = useState(null);
  const [erro, setErro] = useState(null);
  const [razao, setRazao] = useState(1.414); // altura / largura da 1.ª página
  const [inteira, setInteira] = useState(false); // no ecrã inteiro: a página toda à vista (ou à largura)
  useEffect(() => {
    const el = caixa.current; if (!el) return undefined;
    const medir = () => { const w = Math.floor(el.clientWidth); setLarg(x => (Math.abs(x - w) >= 6 ? w : x)); setAltCx(Math.floor(el.clientHeight)); };
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', medir);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', medir); };
  }, []);
  useEffect(() => {
    let vivo = true, doc = null;
    setPdf(null); setErro(null);
    carregarPdfJs().then(lib => lib.getDocument({ data: dados.slice(0) }).promise).then(async d => { doc = d; if (!vivo) { d.destroy(); return; } try { const v = (await d.getPage(1)).getViewport({ scale: 1 }); if (vivo && v.width) setRazao(v.height / v.width); } catch (e) { /* */ } if (vivo) setPdf(d); }).catch(e => { if (vivo) setErro(String((e && e.message) || e)); });
    return () => { vivo = false; if (doc) doc.destroy(); };
  }, [dados]);
  // No painel: a página ocupa a largura toda; no ecrã inteiro: grande, mas não mais do que dá para ler sem andar de lado
  const wLarg = Math.max(160, Math.min(larg - (cheio ? 40 : 24), 4000));
  const w = cheio && inteira && altCx ? Math.max(160, Math.min(wLarg, Math.floor((altCx - 48) / razao))) : wLarg;
  const paginas = pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : [];
  return (
    <div ref={caixa} className={`h-full overflow-auto ${cheio ? 'py-6' : 'py-3'}`}>
      {erro ? <p className="p-6 text-sm text-center text-amber-500">{erro}</p>
        : !pdf || !larg ? <p className={`p-6 text-sm text-center ${claro ? 'text-slate-500' : 'text-slate-400'}`}>A abrir…</p>
        : <div className="flex flex-col items-center gap-3">{paginas.map(n => <PaginaPdf key={n} pdf={pdf} n={n} largura={w} onClick={!cheio ? onAmpliar : () => setInteira(x => !x)} cursor={cheio && !inteira ? 'cursor-zoom-out' : 'cursor-zoom-in'} />)}</div>}
    </div>
  );
};
const IcoDoc = ({ d }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const PainelDoc = ({ doc, claro, vazio }) => {
  const [res, setRes] = useState(null);
  const [grande, setGrande] = useState(false); // ampliado por cima da página (sem ocupar o ecrã todo)
  const chave = doc ? doc.chave : null;
  useEffect(() => {
    let vivo = true; let criado = null;
    setRes(doc ? { aCarregar: true } : null);
    if (!doc) return undefined;
    (async () => {
      const r = await doc.obter();
      if (r && r.revogar) { if (!vivo) { URL.revokeObjectURL(r.url); return; } criado = r.url; }
      if (!r || !(r.url || r.blob || r.baixar)) { if (vivo) setRes({ erro: 'Esta fatura não tem PDF guardado.' }); return; }
      const ePdf = !/^image\//.test(r.tipo || '');
      // Os bytes do PDF, para o leitor próprio: o que já está em memória → o endereço (se o servidor deixar) → o Drive
      let bytes = null;
      if (ePdf) {
        try { if (r.blob) bytes = await r.blob.arrayBuffer(); } catch (e) { /* */ }
        if (!bytes && r.url && !/drive\.google\.com\//.test(r.url)) { try { const x = await fetch(r.url); if (x.ok) bytes = await x.arrayBuffer(); } catch (e) { /* sem acesso direto */ } }
        if (!bytes && r.baixar) { try { bytes = await (await r.baixar()).arrayBuffer(); } catch (e) { /* */ } }
      }
      if (vivo) setRes({ ...r, bytes });
    })().catch(e => { if (vivo) setRes({ erro: String((e && e.message) || e) }); });
    return () => { vivo = false; if (criado) URL.revokeObjectURL(criado); };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setGrande(false); }, [chave]);
  // Esc fecha o ampliado (e não chega ao resto da app, que usaria o Esc para voltar atrás)
  useEffect(() => {
    if (!grande) return undefined;
    const k = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); setGrande(false); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [grande]);
  const ok = res && (res.url || res.bytes);
  const imagem = ok && /^image\//.test(res.tipo || '');
  const blobDe = () => (res.blob ? res.blob : res.bytes ? new Blob([res.bytes], { type: res.tipo || 'application/pdf' }) : null);
  const descarregar = async () => {
    if (!ok) return;
    const b0 = blobDe(); if (b0) { guardarBlobComo(b0, res.nome || 'documento.pdf'); return; }
    if (res.baixar) { try { guardarBlobComo(await res.baixar(), res.nome || 'documento.pdf'); return; } catch (e) { /* tenta abrir */ } }
    try { const r = await fetch(res.url); if (!r.ok) throw new Error(String(r.status)); guardarBlobComo(await r.blob(), res.nome || 'documento.pdf'); }
    catch (e) { window.open(res.url, '_blank', 'noopener'); } // sem acesso direto: abre, e descarrega-se no visualizador
  };
  const abrirFora = () => { const b0 = blobDe(); if (b0) { const u = URL.createObjectURL(b0); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); return; } if (res.url) window.open(res.url, '_blank', 'noopener'); };
  const btn = escuro => `w-7 h-7 inline-flex items-center justify-center rounded-md ${escuro ? 'text-slate-300 hover:bg-white/10' : claro ? 'text-slate-500 hover:bg-slate-200/70' : 'text-slate-300 hover:bg-white/10'} disabled:opacity-40`;
  const cabecalho = (escuro, extra, fim) => (
    <div className={`flex items-center gap-1 pl-3 pr-1.5 h-10 shrink-0 ${escuro ? 'bg-neutral-900 text-slate-100 border-b border-white/[0.06]' : claro ? 'bg-white border-b border-slate-200' : 'bg-slate-900 border-b border-white/[0.06]'}`}>
      <p className="flex-1 min-w-0 truncate text-[13px]"><span className="font-semibold">{doc ? doc.titulo : 'Pré-visualização'}</span>{doc && doc.sub && <span className={`ml-2 text-[11px] ${!escuro && claro ? 'text-slate-500' : 'text-slate-400'}`}>{doc.sub}</span>}</p>
      {extra}
      <button type="button" onClick={descarregar} disabled={!ok} className={btn(escuro)} title="Descarregar" aria-label="Descarregar"><IcoDoc d="M12 4v11M7 11l5 5 5-5M5 20h14" /></button>
      <button type="button" onClick={abrirFora} disabled={!ok} className={btn(escuro)} title="Abrir noutro separador" aria-label="Abrir noutro separador"><IcoDoc d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" /></button>
      {fim}
    </div>
  );
  const conteudo = emGrande => (!doc ? <p className={`p-6 text-sm text-center ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{vazio || 'Escolhe um documento para o veres aqui.'}</p>
    : !res || res.aCarregar ? <p className={`p-6 text-sm text-center ${claro && !emGrande ? 'text-slate-500' : 'text-slate-400'}`}>A abrir…</p>
    : res.erro ? <p className="p-6 text-sm text-center text-amber-500">{res.erro}</p>
    : imagem ? <div className="w-full h-full overflow-auto flex items-start justify-center p-3"><img src={res.url} alt={res.nome || ''} onClick={!emGrande ? () => setGrande(true) : undefined} className={`max-w-full shadow-lg ${emGrande ? '' : 'cursor-zoom-in'}`} /></div>
    : res.bytes ? <VisorPdf dados={res.bytes} cheio={emGrande} onAmpliar={() => setGrande(true)} claro={claro} />
    // sem acesso aos bytes (ex.: ficheiro antigo noutro servidor): o leitor do browser, sem barras e à largura
    : <iframe key={res.url} src={res.url} title={doc.titulo} className="w-full h-full border-0 bg-white" />);
  return (
    <>
      <div className={`flex flex-col overflow-hidden rounded-xl border h-[calc(100vh-170px)] min-h-[420px] ${claro ? 'border-slate-200' : 'border-white/[0.06]'}`}>
        {cabecalho(false, <button type="button" onClick={() => setGrande(true)} disabled={!ok} className={btn(false)} title="Ampliar" aria-label="Ampliar"><IcoDoc d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></button>)}
        <div className={`flex-1 min-h-0 ${claro ? 'bg-slate-100' : 'bg-slate-950/50'}`}>{conteudo(false)}</div>
      </div>
      {grande && ok && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/70 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) setGrande(false); }}>
          <div className="flex flex-col overflow-hidden rounded-xl shadow-2xl bg-neutral-900 w-[min(960px,94vw)] h-[92vh] animate-modalIn" role="dialog" aria-modal="true" aria-label={doc ? doc.titulo : 'Documento'}>
            {cabecalho(true, null, <button type="button" onClick={() => setGrande(false)} className={`${btn(true)} ml-1`} title="Fechar (Esc)" aria-label="Fechar"><IcoDoc d="M6 6l12 12M18 6L6 18" /></button>)}
            <div className="flex-1 min-h-0">{conteudo(true)}</div>
          </div>
        </div>, document.body)}
    </>
  );
};
const RecibosCliente = ({ lista, onAbrirFicheiro, onJuntarFicheiro, onIrMes, claro, sub, obterFicheiro, onImportar, showToast, inputClass, pendDrive = [], contaDrive = '', onIgnorarDrive, onSincDrive, recSinc, cfgDrive, onCfgDrive }) => {
  // Pasta dos recibos no Drive (a mesma de Definições → Recibos no Google Drive)
  const cfgD = cfgDrive || {};
  const [verCfg, setVerCfg] = useState(false);
  const [sempreR, setSempreR] = useState(() => ligadoSempre(cfgD.conta || '_'));
  useEffect(() => { let vivo = true; sincronizarSempre().then(() => { if (vivo) setSempreR(ligadoSempre(cfgD.conta || '_')); }); return () => { vivo = false; }; }, [cfgD.conta]);
  const [aLigarR, setALigarR] = useState(false);
  const ligarSempreR = async () => {
    setALigarR(true);
    try { await carregarGis(); await ligarDriveSempre(cfgD.conta || undefined); setSempreR(true); if (showToast) showToast('☁ Drive ligado: a app passa a ir buscar os recibos sozinha'); if (onSincDrive) setTimeout(onSincDrive, 500); }
    catch (e) { avisoApp(e.message || String(e)); }
    setALigarR(false);
  };
  const [verOutros, setVerOutros] = useState(false);
  const [aEnviar, setAEnviar] = useState(null);
  const inRef = useRef(null); const alvo = useRef(null);
  const [anoAberto, setAnoAberto] = useState(null);
  const largoDoc = useLargo('(min-width: 1536px)'); // ecrã largo: o recibo vê-se ao lado da lista
  const [docSel, setDocSel] = useState(null);
  const [imp, setImp] = useState(null); // importar vários recibos: { linhas: [{ id, file, lendo, d, data, valor, acao }], aGuardar }
  const anos = [...new Set((lista || []).map(r => r.ano))].sort((a, b) => b - a);
  const num = v => Number(v) || 0;
  const ili = r => (r.valIliq != null && r.valIliq !== '' ? num(r.valIliq) : num(r.val));
  // ── Importar recibos verdes (vários de uma vez): a IA lê cada um; se já houver um registo deste cliente com o mesmo
  // valor (ex.: o que a fatura criou), junta-se a esse; senão cria um novo no mês da data — como o «Importar Fatura» das Receitas
  // Registos deste cliente com o mesmo valor (±1 €) que ainda não têm o PDF do recibo: primeiro os da mesma data
  const candidatosDe = (v, data) => {
    if (!(v > 0) || !/^\d{4}-\d{2}-\d{2}/.test(String(data || ''))) return [];
    const [y0, m0] = String(data).split('-').map(Number); const t0 = y0 * 12 + m0 - 1; const tD = Date.parse(String(data).slice(0, 10));
    return (lista || []).map(r => {
      const dd = r.ano * 12 + r.mes - 1 - t0;
      const dias = /^\d{4}-\d{2}-\d{2}/.test(String(r.data || '')) ? Math.abs(Date.parse(String(r.data).slice(0, 10)) - tD) / 864e5 : null;
      return { r, dd, p: dias != null && dias <= 5 ? dias : 10 + Math.abs(dd), forte: dias != null && dias <= 5 };
    }).filter(({ r, dd, forte }) => (forte || (dd >= -1 && dd <= 2)) && !r.driveUrl && !(r.temFicheiro && (r.reciboVerde || !r.faturaId)) && Math.abs(ili(r) - v) <= 1)
      .sort((a, b) => a.p - b.p).map(x => x.r);
  };
  const ivAc = l => (l.acao && l.acao !== 'novo' && l.acao !== 'fora' ? l.acao : null);
  const mudarImp = (id, patch) => setImp(x => (x ? { ...x, linhas: x.linhas.map(l => (l.id === id ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)) } : x));
  const juntarRecibos = async ficheiros => {
    const novas = Array.from(ficheiros || []).filter(f => /pdf|image/.test(f.type || '') || /\.(pdf|png|jpe?g|webp)$/i.test(f.name)).map(f => ({ id: trabId() + Math.random().toString(36).slice(2, 6), file: f, lendo: true, d: null, data: '', valor: '', acao: '' }));
    if (!novas.length) return;
    setImp(x => ({ ...(x || {}), linhas: [...((x && x.linhas) || []), ...novas] }));
    const fila = [...novas];
    const ler = async () => {
      for (let l = fila.shift(); l; l = fila.shift()) {
        let d = null; try { d = await lerFaturaIA(l.file); } catch (e) { d = null; }
        const data = dataIAValida(d && d.data);
        const v = d ? Math.round((Number(d.valorIliquido) || 0) * 100) / 100 : 0;
        // destino sugerido: o primeiro registo com o mesmo valor que ainda não foi escolhido por outra linha
        setImp(x => {
          if (!x) return x;
          const usados = new Set(x.linhas.map(ivAc).filter(Boolean));
          const c = candidatosDe(v, data).find(r => !usados.has(`${r.k}|${r.id}`));
          return { ...x, linhas: x.linhas.map(y => (y.id === l.id ? { ...y, lendo: false, d, data, valor: v > 0 ? String(v) : '', acao: c ? `${c.k}|${c.id}` : 'novo' } : y)) };
        });
      }
    };
    await Promise.all([ler(), ler(), ler()]);
  };
  const [aTrazer, setATrazer] = useState(null);
  const trazerDoDrive = async lista2 => {
    setATrazer(lista2.length === 1 ? lista2[0].id : 'todos');
    const novas = [];
    for (const p of lista2) {
      try {
        const file = await ficheiroDoDrive(contaDrive, { id: p.id, name: p.nome });
        const data = dataIAValida(p.d && p.d.data) || ((/(\d{4}-\d{2}-\d{2})/.exec(p.nome) || [])[1] || '');
        const v = p.d ? Math.round((Number(p.d.valorIliquido) || 0) * 100) / 100 : 0;
        novas.push({ id: trabId() + Math.random().toString(36).slice(2, 6), file, lendo: false, d: p.d || null, data, valor: v > 0 ? String(v) : '', acao: '', drive: { id: p.id, url: p.url, nome: p.nome } });
      } catch (e) { avisoApp(`Não consegui abrir ${p.nome} do Drive: ${e.message || e}`); }
    }
    setImp(x => {
      const linhas = [...((x && x.linhas) || [])];
      novas.forEach(l => { if (linhas.some(y => y.drive && y.drive.id === l.drive.id)) return; const usados = new Set(linhas.map(ivAc).filter(Boolean)); const c = candidatosDe(Number(l.valor) || 0, l.data).find(r => !usados.has(`${r.k}|${r.id}`)); linhas.push({ ...l, acao: c ? `${c.k}|${c.id}` : 'novo' }); });
      return { ...(x || {}), linhas };
    });
    setATrazer(null);
  };
  const guardarImp = async () => {
    const L = (imp && imp.linhas) || [];
    const vai = L.filter(l => l.acao !== 'fora');
    const falta = vai.find(l => !l.data || !(num(String(l.valor).replace(',', '.')) > 0));
    if (falta) { avisoApp(`Falta a data ou o valor em ${falta.file.name}.`); return; }
    setImp(x => ({ ...x, aGuardar: true }));
    let juntos = 0, novos = 0, erros = 0;
    for (const l of vai) {
      const [k, id] = l.acao !== 'novo' ? l.acao.split('|') : [null, null];
      const r0 = k ? (lista || []).find(r => r.k === k && String(r.id) === id) : null;
      try {
        await onImportar({ file: l.file, d: { ...(l.d || {}), data: l.data, valorIliquido: num(String(l.valor).replace(',', '.')) }, alvo: r0 ? { k: r0.k, id: r0.id } : null, drive: l.drive || null });
        if (r0) juntos += 1; else novos += 1;
      } catch (e) { console.error('Importar recibo:', e); erros += 1; }
    }
    setImp(null);
    const txt = [juntos ? `${juntos} junto${juntos === 1 ? '' : 's'} ao registo que já existia` : '', novos ? `${novos} registo${novos === 1 ? '' : 's'} novo${novos === 1 ? '' : 's'} em Receitas` : '', erros ? `${erros} com erro` : ''].filter(Boolean).join(' · ');
    if (showToast) showToast(`Recibos importados: ${txt}`, erros ? 'error' : undefined); else if (erros) avisoApp(txt);
  };
  const mesNome = data => { const [a, m] = String(data || '').split('-').map(Number); return a && m ? `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]} ${a}` : '—'; };
  const icI = `${inputClass || ''} text-sm py-1.5`;
  const caixaImp = imp && (() => {
    const L = imp.linhas; const lendo = L.filter(l => l.lendo).length; const vai = L.filter(l => l.acao !== 'fora').length;
    return (
      <div className={`rounded-xl border p-3 space-y-3 ${claro ? 'border-blue-200 bg-blue-50/50' : 'border-blue-500/30 bg-blue-500/[0.05]'}`}
        onDragOver={e => { if (Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); }}
        onDrop={e => { if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); juntarRecibos(e.dataTransfer.files); } }}>
        <p className="text-sm font-medium">Importar recibos verdes</p>
        <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm cursor-pointer text-center ${claro ? 'border-slate-300 hover:bg-white' : 'border-slate-600 hover:bg-white/5'}`}>
          <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={e => { juntarRecibos(e.target.files); e.target.value = ''; }} />
          <span>📎</span><span>Escolhe os PDFs dos recibos (podes escolher vários) ou arrasta-os para aqui</span>
        </label>
        <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer ${sub} hover:text-blue-400`}>
          <input type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={e => { juntarRecibos(e.target.files); e.target.value = ''; }} />
          📁 ou escolhe uma pasta do computador (junta todos os PDFs que lá estão)
        </label>
        {L.length > 0 && (
          <div className={`rounded-lg border overflow-x-auto ${claro ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900/40'}`}>
            <div className={`hidden sm:grid grid-cols-[minmax(0,1fr)_140px_110px_minmax(0,1.3fr)_24px] gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${sub}`}><span>Ficheiro</span><span>Data</span><span className="text-right">Ilíquido</span><span>Fica em</span><span /></div>
            {L.map(l => {
              const v = num(String(l.valor).replace(',', '.'));
              const cands = candidatosDe(v, l.data);
              const outros = new Set(L.filter(y => y.id !== l.id).map(ivAc).filter(Boolean));
              return (
                <div key={l.id} className={`grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_140px_110px_minmax(0,1.3fr)_24px] gap-2 px-2 py-1.5 items-center border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'} ${l.acao === 'fora' ? 'opacity-50' : ''}`}>
                  <span className="col-span-2 sm:col-span-1 min-w-0 text-xs">
                    <span className="block truncate" title={l.file.name}>{l.drive ? '☁ ' : ''}{l.file.name}</span>
                    {l.lendo ? <span className="text-blue-400">a ler…</span> : !l.d ? <span className="text-amber-500">a IA não leu — põe a data e o valor</span> : <span className={`${sub} block truncate`} title={l.d.nomeCliente || ''}>{l.d.nomeCliente || '?'}{num(l.d.retencaoIRS) ? ` · ret. ${eur(l.d.retencaoIRS)}` : ''}{num(l.d.valorIva) ? ` · IVA ${eur(l.d.valorIva)}` : ''}</span>}
                  </span>
                  <input type="date" value={l.data} onChange={e => mudarImp(l.id, { data: e.target.value })} aria-label="Data do recibo" className={icI} />
                  <input type="number" step="0.01" value={l.valor} onChange={e => mudarImp(l.id, { valor: e.target.value })} aria-label="Valor ilíquido" placeholder={l.lendo ? 'a ler…' : '0,00'} className={`${icI} text-right tabular-nums`} />
                  <select value={l.acao} disabled={l.lendo} onChange={e => mudarImp(l.id, { acao: e.target.value })} aria-label="Onde fica" className={`col-span-2 sm:col-span-1 ${icI}`}>
                    {l.lendo && <option value="">…</option>}
                    {cands.map(r => { const k = `${r.k}|${r.id}`; return <option key={k} value={k} disabled={outros.has(k)}>Juntar a «{r.desc || 'Recibo'}» · {mesNome(`${r.ano}-${r.mes}`)} · {eur(ili(r))}{r.faturaId ? ' (da fatura)' : ''}</option>; })}
                    <option value="novo">Criar registo novo em {mesNome(l.data)}</option>
                    <option value="fora">Não importar</option>
                  </select>
                  <button type="button" onClick={() => setImp(x => ({ ...x, linhas: x.linhas.filter(y => y.id !== l.id) }))} className={`text-xs ${sub} hover:text-red-400`} aria-label="Tirar esta linha">✕</button>
                </div>
              );
            })}
          </div>
        )}
        <p className={`text-[11px] ${sub}`}>A IA lê a data, o valor, o IVA e a retenção. Se já houver um registo deste cliente com o mesmo valor (por exemplo, o que a fatura criou), o recibo junta-se a esse; senão, cria um registo novo «com taxas» no mês da data. O PDF fica guardado na app e vai para a pasta dos recibos no Drive.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={guardarImp} disabled={imp.aGuardar || lendo > 0 || !vai} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{imp.aGuardar ? 'A importar…' : lendo ? `A ler ${lendo} PDF${lendo === 1 ? '' : 's'}…` : `Importar ${vai || ''} recibo${vai === 1 ? '' : 's'}`}</button>
          <button type="button" onClick={() => setImp(null)} className={`px-3 py-1.5 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Cancelar</button>
        </div>
      </div>
    );
  })();
  const barraImp = (onImportar || onSincDrive) && (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {onSincDrive && <button type="button" onClick={onSincDrive} disabled={!!(recSinc && recSinc.a)} className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-60" title="Vai à pasta dos recibos no Drive: junta os PDFs aos registos e envia os que lá faltam (a app também faz isto sozinha)">{recSinc && recSinc.a ? 'A ver o Drive…' : '☁ Ver o Drive agora'}</button>}
      {onImportar && !imp && <button type="button" onClick={() => setImp({ linhas: [] })} className="text-xs text-blue-400 hover:text-blue-300" title="Junta vários recibos verdes de uma vez: a IA lê cada um">+ Importar recibos</button>}
    </div>
  );
  const pendMeus = pendDrive.filter(p => p.cid != null);
  const pendOutros = pendDrive.filter(p => p.cid == null);
  const linhaPend = p => (
    <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline truncate max-w-full sm:max-w-[45%]" title={p.nome}>{p.nome}</a>
      <span className="opacity-80">— {p.motivo}{p.resumo ? ` · ${p.resumo}` : ''}</span>
      <span className="flex-1" />
      {onImportar && <button type="button" onClick={() => trazerDoDrive([p])} disabled={!!aTrazer} className="px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-60">{aTrazer === p.id ? 'A abrir…' : 'Rever e importar'}</button>}
      {onIgnorarDrive && <button type="button" onClick={() => onIgnorarDrive(p.id)} className="px-1.5 py-0.5 opacity-80 hover:opacity-100" title="Não interessa: deixa de aparecer (fica no Drive)">Ignorar</button>}
    </div>
  );
  const avisoDrive = (recSinc && (recSinc.a || recSinc.feito || recSinc.semLigacao)) || pendDrive.length > 0 ? (
    <div className="space-y-1.5">
      {recSinc && (recSinc.a || recSinc.feito) && <p className={`text-[11px] ${sub}`}>☁ {recSinc.a || recSinc.feito}</p>}
      {recSinc && recSinc.semLigacao && !sempreR && <p className="text-[11px] text-amber-500">☁ Para ir buscar os recibos ao Drive sozinha, a app precisa que a conta fique sempre ligada — em «Recibos no Google Drive», mais abaixo, carrega em «Manter sempre ligado».</p>}
      {pendOutros.length > 0 && (
        <div className={`rounded-lg px-3 py-1.5 text-xs ${claro ? 'bg-slate-100' : 'bg-white/[0.03]'} ${sub}`}>
          <button type="button" onClick={() => setVerOutros(v => !v)} className="hover:text-blue-400">{verOutros ? '▾' : '▸'} {pendOutros.length} recibo{pendOutros.length === 1 ? '' : 's'} no Drive de clientes que não reconheci</button>
          {verOutros && <div className="mt-1.5 space-y-1.5 text-amber-500">{pendOutros.map(linhaPend)}</div>}
        </div>
      )}
      {pendMeus.length > 0 && (
        <div className="rounded-lg px-3 py-2 bg-amber-500/10 text-amber-500 text-xs space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0">☁ {pendMeus.length === 1 ? 'Há 1 recibo deste cliente no Drive que não consegui juntar sozinho' : `Há ${pendMeus.length} recibos deste cliente no Drive que não consegui juntar sozinho`}:</span>
            {onImportar && pendMeus.length > 1 && <button type="button" onClick={() => trazerDoDrive(pendMeus)} disabled={!!aTrazer} className="px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-60">{aTrazer === 'todos' ? 'A abrir…' : 'Rever todos'}</button>}
          </div>
          {pendMeus.map(linhaPend)}
        </div>
      )}
    </div>
  ) : null;
  // Caixa da pasta dos recibos no Drive (fechada; abre sozinha se ainda não houver pasta)
  const abertoCfg = verCfg || !cfgD.pasta;
  const caixaCfg = onCfgDrive && (
    <div className={`rounded-xl border p-4 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
      <button type="button" onClick={() => setVerCfg(v => !v)} className="w-full flex items-center gap-2 text-left">
        <span className={`text-[10px] ${sub}`} style={{ transform: abertoCfg ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        <span className="text-sm font-semibold flex-1">Recibos no Google Drive</span>
        <span className={`text-xs ${cfgD.pasta && sempreR ? 'text-sky-400' : cfgD.pasta ? 'text-amber-500' : sub}`}>{!cfgD.pasta ? '☁ por ligar' : sempreR ? '☁ Drive ligado' : '☁ falta «Manter sempre ligado»'}</span>
      </button>
      {abertoCfg && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <CampoF rot="Pasta dos recibos no Drive (link)">
            <TxtIn valor={cfgD.pasta} onGravar={v => onCfgDrive({ pasta: String(v || '').trim() })} placeholder="https://drive.google.com/drive/folders/…" className={icI} />
            {cfgD.pasta && !idPastaDrive(cfgD.pasta) && <span className="text-[11px] text-red-400">Este link não parece de uma pasta do Drive.</span>}
          </CampoF>
          <CampoF rot="Conta Google dessa pasta">
            <TxtIn valor={cfgD.conta} onGravar={v => onCfgDrive({ conta: String(v || '').trim() })} placeholder="ex.: o teu gmail" className={icI} />
          </CampoF>
          {cfgD.pasta && (sempreR
            ? <p className="sm:col-span-2 text-xs text-emerald-500">🔒 Sempre ligado{cfgD.conta ? ` (${cfgD.conta})` : ''}: a app vai buscar os recibos sozinha.</p>
            : <p className="sm:col-span-2 text-xs text-amber-500 flex flex-wrap items-center gap-2">Para a app ir buscar os recibos sozinha, esta conta tem de ficar sempre ligada.
                <button type="button" disabled={aLigarR} onClick={ligarSempreR} className="px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-60">{aLigarR ? 'A ligar…' : 'Manter sempre ligado'}</button>
              </p>)}
          <p className={`sm:col-span-2 text-[11px] ${sub}`}>É a mesma pasta para todos os clientes (também está em Definições). Cada recibo com PDF vai para lá em <strong>Ano / Nº_Trimestre</strong>; e os PDFs que lá pões juntam-se sozinhos ao registo certo em Receitas (mesmo cliente e valor, perto da data). As pastas que a app usa ficam verdes no Drive. A app nunca apaga nada no Drive.</p>
        </div>
      )}
    </div>
  );
  if (!anos.length) return <div className="space-y-3">{barraImp}{avisoDrive}{caixaImp}{!imp && <p className={`text-sm ${sub}`}>Ainda não há recibos deste cliente.{onImportar ? ' Importa-os aqui ou em Receitas.' : ' Junta-os em Receitas.'}</p>}{caixaCfg}</div>;
  const mesesN = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dataTxt = r => (r.data && /^\d{4}-\d{2}-\d{2}/.test(r.data) ? `${r.data.slice(8, 10)}/${r.data.slice(5, 7)}` : `${mesesN[r.mes - 1]}`);
  const semPdf = (lista || []).filter(r => !r.temFicheiro).length;
  const chaveR = r => `${r.k}:${r.id}`;
  const comPainel = largoDoc && !!obterFicheiro;
  // Por defeito, o recibo mais recente que tem PDF
  const rSel = (lista || []).find(r => chaveR(r) === docSel) || (lista || []).find(r => r.temFicheiro) || null;
  const docPrev = comPainel && rSel ? {
    chave: `${chaveR(rSel)}:${rSel.temFicheiro ? 1 : 0}:${rSel.ficheiroUrl || ''}`,
    titulo: rSel.desc || 'Recibo', sub: `${dataTxt(rSel)} ${rSel.ano} · ilíquido ${eur(ili(rSel))}${num(rSel.retIRS) ? ` · retido ${eur(rSel.retIRS)}` : ''}`,
    obter: async () => { if (!rSel.temFicheiro) throw new Error('Este recibo ainda não tem o PDF — junta-o com «+ PDF».'); return obterFicheiro(rSel.k, rSel.id); },
  } : null;
  const abrirR = r => { if (comPainel) { setDocSel(chaveR(r)); return; } if (onAbrirFicheiro) onAbrirFicheiro(r.k, r.id); };
  return (
    <div className={comPainel ? 'grid grid-cols-[minmax(0,50rem)_minmax(0,1fr)] gap-4 items-start' : ''}>
    <div className="space-y-4 min-w-0">
      <input ref={inRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={async e => {
        const f = e.target.files && e.target.files[0]; e.target.value = ''; const r = alvo.current; if (!f || !r) return;
        setAEnviar(`${r.k}:${r.id}`);
        try { await onJuntarFicheiro(r.k, r.id, f); } catch (er) { console.error('Recibo:', er); avisoApp('Não consegui enviar o PDF.'); }
        setAEnviar(null);
      }} />
      <div className="flex flex-wrap items-start gap-2">
        {semPdf > 0 ? <p className={`flex-1 min-w-0 text-xs ${sub}`}>{semPdf} recibo{semPdf === 1 ? '' : 's'} sem PDF guardado na app. Usa «+ PDF» num recibo, ou «+ Importar recibos» para juntar vários de uma vez.</p> : <span className="flex-1" />}
        {barraImp}
      </div>
      {avisoDrive}
      {caixaImp}
      {anos.map((a, i) => {
        const rs = lista.filter(r => r.ano === a);
        const aberto = anoAberto == null ? i === 0 : anoAberto === a;
        const tot = rs.reduce((x, r) => x + ili(r), 0), totIva = rs.reduce((x, r) => x + num(r.iva), 0), totRet = rs.reduce((x, r) => x + num(r.retIRS), 0);
        return (
          <div key={a} className={`rounded-xl border ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`}>
            <button type="button" onClick={() => setAnoAberto(aberto ? -1 : a)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left">
              <span className={`text-[10px] ${sub}`} style={{ transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
              <span className="font-semibold">{a}</span>
              <span className={`text-xs ${sub}`}>{rs.length} recibo{rs.length === 1 ? '' : 's'}</span>
              <span className="flex-1" />
              <span className="text-sm tabular-nums"><span className={sub}>ilíquido </span><strong>{eur(tot)}</strong></span>
              {totIva > 0 && <span className={`text-xs tabular-nums ${sub}`}>IVA {eur(totIva)}</span>}
              {totRet > 0 && <span className={`text-xs tabular-nums ${sub}`}>retido {eur(totRet)}</span>}
            </button>
            {aberto && (
              <div className={`border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}>
                <div className={`hidden md:grid grid-cols-[64px_minmax(0,1fr)_96px_80px_80px_96px_170px] gap-3 px-3 h-8 items-center text-[11px] font-medium ${claro ? 'text-slate-400' : 'text-slate-500'}`}>
                  <span>Data</span><span>Descrição</span><span className="text-right">Ilíquido</span><span className="text-right">IVA</span><span className="text-right">Retenção</span><span className="text-right">Recebido</span><span />
                </div>
                {rs.map(r => (
                  <div key={`${r.k}:${r.id}`} onClick={comPainel ? e => { if (!e.target.closest('button,a')) setDocSel(chaveR(r)); } : undefined}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[64px_minmax(0,1fr)_96px_80px_80px_96px_170px] gap-x-3 gap-y-0.5 px-3 py-2 items-center border-t text-sm ${comPainel ? 'cursor-pointer' : ''} ${comPainel && rSel && chaveR(rSel) === chaveR(r) ? (claro ? 'bg-blue-50' : 'bg-blue-500/10') : ''} ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
                    <span className={`hidden md:block tabular-nums ${sub}`}>{dataTxt(r)}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{r.desc || 'Recibo'}</span>
                      <span className={`flex flex-wrap gap-1.5 text-[11px] ${sub}`}>
                        <span className="md:hidden">{dataTxt(r)} ·</span>
                        <span className={`px-1.5 rounded ${r.tipo === 'sem' ? (claro ? 'bg-slate-100' : 'bg-white/5') : (claro ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/10 text-blue-300')}`}>{r.tipo === 'sem' ? 'Sem taxas' : 'Com taxas'}</span>
                        {r.pais && <span>{r.pais}</span>}{r.emitidoPorSara && <span>emitido pela Sara</span>}
                      </span>
                    </span>
                    <span className="text-right tabular-nums md:order-none font-medium md:font-normal">{eur(ili(r))}<span className={`md:hidden block text-[11px] ${sub}`}>{num(r.iva) ? `IVA ${eur(r.iva)} · ` : ''}{num(r.retIRS) ? `ret. ${eur(r.retIRS)}` : ''}</span></span>
                    <span className={`hidden md:block text-right tabular-nums ${sub}`}>{num(r.iva) ? eur(r.iva) : '—'}</span>
                    <span className={`hidden md:block text-right tabular-nums ${sub}`}>{num(r.retIRS) ? eur(r.retIRS) : '—'}</span>
                    <span className="hidden md:block text-right tabular-nums">{eur(r.val)}</span>
                    <span className="col-span-2 md:col-span-1 flex justify-end items-center gap-1 whitespace-nowrap">
                      {r.temFicheiro && (onAbrirFicheiro || comPainel) && <button type="button" onClick={() => abrirR(r)} className={`px-2 py-1 rounded-md text-xs ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'} text-emerald-400 inline-flex items-center gap-1`} title="Abrir o recibo">📎 PDF</button>}
                      {!r.temFicheiro && onJuntarFicheiro && <button type="button" disabled={aEnviar === `${r.k}:${r.id}`} onClick={() => { alvo.current = r; if (inRef.current) inRef.current.click(); }} className={`px-2 py-1 rounded-md text-xs ${sub} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'} hover:text-blue-400`} title="Este recibo ainda não tem o PDF — junta-o aqui">{aEnviar === `${r.k}:${r.id}` ? 'A enviar…' : '+ PDF'}</button>}
                      {onIrMes && <button type="button" onClick={() => onIrMes(r.ano, r.mes)} className={`px-2 py-1 rounded-md text-xs text-blue-400 ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} title="Ver em Receitas">Receitas →</button>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {caixaCfg}
    </div>
    {comPainel && <div className="sticky top-[150px] min-w-0"><PainelDoc doc={docPrev} claro={claro} vazio="Nenhum recibo deste cliente tem PDF guardado na app." /></div>}
    </div>
  );
};
const PDF_LARG = { F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500], F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556], F3: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500] };

// ── PDF da fatura (sem bibliotecas): Helvetica, A4, mesmo desenho dos modelos ──
const pdfBytes = s => { const out = []; for (const ch of String(s == null ? '' : s)) { const c = ch.codePointAt(0); const m = { 0x20AC: 0x80, 0x2013: 0x96, 0x2014: 0x97, 0x2019: 0x92, 0x2018: 0x91, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2026: 0x85 }; if (m[c]) out.push(m[c]); else if (c >= 32 && c < 256) out.push(c); else if (c === 10 || c === 9) out.push(32); else out.push(63); } return out; };
const pdfLarg = (s, f, tam) => pdfBytes(s).reduce((a, c) => a + (PDF_LARG[f][c - 32] || 500), 0) * tam / 1000;
const pdfTxt = s => pdfBytes(s).map(c => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : String.fromCharCode(c))).join('');
// Só no PDF da fatura (em inglês, para clientes estrangeiros): 1,234.56 €. No ecrã, cuEur (o formato da app)
const eurFatura = v => `${(Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const gerarPdfFatura = d => {
  const ops = [];
  const T = (x, y, s, f = 'F1', tam = 8.5, cinza = null) => { if (s == null || s === '') return; ops.push(`BT ${cinza != null ? `${cinza} g ` : '0 g '}/${f} ${tam} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfTxt(s)}) Tj ET`); };
  const TD = (xd, y, s, f, tam) => T(xd - pdfLarg(s, f, tam), y, s, f, tam);
  const TC = (xc, y, s, f, tam) => T(xc - pdfLarg(s, f, tam) / 2, y, s, f, tam);
  const L = (x1, y1, x2, y2, w = 0.6) => ops.push(`0 G ${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  const R = (x, y, w, h, cinza) => ops.push(`${cinza} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  const E = 53, D = 497, DIV = 372, TAM = 8.5;
  const e = d.emissor || {};
  T(E, 770, e.nome || '', 'F2', 13);
  T(362, 764, 'INVOICE', 'F1', 22, 0.45);
  let y = 718;
  [e.morada1, e.morada2, e.telefone, e.nif ? `NIF: ${e.nif}` : ''].filter(Boolean).forEach(l => { T(E, y, l); y -= 12.5; });
  TD(367, 718, 'DATE:', 'F2', TAM); TD(D, 718, d.data || '', 'F1', TAM);
  TD(367, 705.5, 'INVOICE #', 'F2', TAM); TD(D, 705.5, String(d.numero || ''), 'F1', TAM);
  TD(367, 693, 'FOR:', 'F2', TAM); TD(D, 693, e.para || '', 'F3', TAM);
  y = Math.min(y, 680) - 4; T(E, y, 'Bill To:', 'F2', TAM); y -= 17;
  (d.cliente || []).filter(Boolean).forEach(l => { T(E, y, l); y -= 12.5; });
  // Tabela
  let topo = Math.min(582, y - 18);
  const cab = 23;
  L(E, topo, D + 1, topo, 1.2); L(E, topo - cab, D + 1, topo - cab, 1.2);
  TC((E + DIV) / 2, topo - 15, 'DESCRIPTION', 'F2', TAM); TC((DIV + D) / 2, topo - 15, 'AMOUNT', 'F2', TAM);
  let yy = topo - cab;
  const larguraTxt = DIV - E - 8;
  const partir = (titulo, resto) => {
    const fichas = [];
    String(titulo || '').split(/(\s+)/).filter(Boolean).forEach(p => fichas.push({ t: p, f: 'F2' }));
    String(resto || '').split(/(\s+)/).filter(Boolean).forEach(p => fichas.push({ t: p, f: 'F1' }));
    const linhas = [[]]; let w = 0;
    fichas.forEach(fc => { const lw = pdfLarg(fc.t, fc.f, TAM); if (w + lw > larguraTxt && /\S/.test(fc.t) && linhas[linhas.length - 1].length) { linhas.push([]); w = 0; } if (!linhas[linhas.length - 1].length && !/\S/.test(fc.t)) return; linhas[linhas.length - 1].push(fc); w += lw; });
    return linhas;
  };
  const linhasT = d.linhas || [];
  const nLinhas = Math.max(11, linhasT.length);
  for (let i = 0; i < nLinhas; i++) {
    const ln = linhasT[i];
    const partes = ln ? partir(ln.titulo, ln.resto) : [];
    const h = Math.max(23, 12 + partes.length * 11);
    partes.forEach((pl, k) => { let x = E + 4; pl.forEach(fc => { T(x, yy - 10 - k * 11, fc.t, fc.f, TAM); x += pdfLarg(fc.t, fc.f, TAM); }); });
    if (ln && ln.valor != null && ln.valor !== '') TC((DIV + D) / 2, yy - 10, eurFatura(ln.valor), 'F1', TAM);
    yy -= h; L(E, yy, D + 1, yy, 0.6);
  }
  // Total (e IVA, se houver)
  const extra = [];
  if (d.ivaTaxa > 0) { extra.push(['SUBTOTAL', d.subtotal]); extra.push([`VAT ${d.ivaTaxa}%`, d.ivaValor]); }
  extra.push(['TOTAL', d.total]);
  const fimTabela = yy;
  L(E, topo, E, fimTabela, 1.2); L(DIV, topo, DIV, fimTabela, 1.2); L(D + 1, topo, D + 1, fimTabela, 1.2);
  extra.forEach(([rot, v]) => { R(DIV, yy - 18, D + 1 - DIV, 18, 0.93); L(DIV, yy, D + 1, yy, 0.6); TD(DIV - 4, yy - 12.5, rot, 'F2', TAM); TC((DIV + D) / 2, yy - 12.5, eurFatura(v), 'F1', TAM); L(DIV, yy - 18, D + 1, yy - 18, 0.6); L(DIV, yy, DIV, yy - 18, 0.6); L(D + 1, yy, D + 1, yy - 18, 0.6); yy -= 18; });
  yy -= 13;
  if (d.notaIva) { const pal = String(d.notaIva).split(/(\s+)/); let lin = ''; pal.forEach(p => { if (pdfLarg(lin + p, 'F1', TAM) > D - E && lin.trim()) { T(E, yy, lin.trim()); yy -= 11; lin = p.trim() ? p : ''; } else lin += p; }); if (lin.trim()) { T(E, yy, lin.trim()); yy -= 11; } }
  yy -= 38;
  (d.pagamento || []).filter(Boolean).forEach(l => { T(E, yy, l); yy -= 12; });
  yy -= 18;
  TC(286, yy, d.obrigado || 'THANK YOU!', 'F2', TAM);
  // Montar o ficheiro
  const conteudo = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
  ];
  let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (${pdfTxt(`Invoice ${d.numero || ''}`)}) /Producer (Dashboard) >> >>\nstartxref\n${xref}\n%%EOF`;
  const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xFF;
  return u8;
};

// ── Faturas do mês (Trabalho → cliente → Faturas): tarefas entregues no mês, agrupadas por jogo ──
const MESES_EN_F = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "4_Invoice_September_26.pdf" → { numero: '4', mes: '2026-09' } (também nomes em português e meses abreviados)
const lerNomeFatura = nome => {
  const sx = String(nome || '').replace(/\.[a-z0-9]{2,4}$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nM = /^\s*(\d{1,5})(?!\d)/.exec(sx) || /(?:invoice|fatura|factura|n[o.º°])\s*[_\-\s#]*(\d{1,5})(?!\d)/.exec(sx);
  const en = MESES_EN_F.map(x => x.toLowerCase()), pt = MESES_PT_F.map(x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const tok = sx.split(/[^a-z0-9]+/).filter(Boolean);
  let mes = null;
  for (let i = 0; i < tok.length && !mes; i++) {
    const t = tok[i]; if (t.length < 3) continue;
    let m = en.findIndex(x => x === t || (t.length === 3 && x.startsWith(t))); if (m < 0) m = pt.findIndex(x => x === t || (t.length === 3 && x.startsWith(t)));
    const y = tok[i + 1] || '';
    if (m >= 0 && /^(\d{2}|\d{4})$/.test(y)) mes = `${y.length === 2 ? 2000 + Number(y) : Number(y)}-${String(m + 1).padStart(2, '0')}`;
  }
  return { numero: nM ? String(Number(nM[1])) : '', mes };
};
// Lê a fatura com a IA (a mesma função do «Importar Fatura» das Receitas): valor sem IVA e data
const lerFaturaIA = async file => {
  const base64 = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => falha(r.error); r.readAsDataURL(file); });
  for (const url of PROCESS_INVOICE_URLS || []) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { base64, mediaType: file.type || 'application/pdf' } }) });
      if (!res.ok) continue;
      const j = await res.json();
      if (j && j.result && j.result.success && j.result.data) return j.result.data;
    } catch (e) { /* tenta o endereço seguinte */ }
  }
  return null;
};
const dataIAValida = x => { const s2 = String(x || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(s2)) return ''; const [aa, mm, dd] = s2.split('-').map(Number); const t = new Date(aa, mm - 1, dd); return t.getFullYear() === aa && t.getMonth() === mm - 1 && t.getDate() === dd ? s2 : ''; };
const ultimoDiaDe = mes => { const [a, m] = String(mes).split('-').map(Number); return a && m ? `${a}-${String(m).padStart(2, '0')}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}` : ''; };
const MESES_PT_F = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ORDEM_TIPOS_F = ['video', 'variacao', 'iteracao', 'hook', 'aso', 'ai_clip', 'video3d', 'banner', 'banner_var', 'icone', 'feature', 'screenshots'];
const NOTA_IVA_UE = 'VAT: 0% – Exempt under Article 6 (6) (a) of the Portuguese VAT Code (Intra-Community supply of services)';
const NOTA_IVA_FORA_UE = 'VAT: 0% – Not subject to Portuguese VAT under Article 6 (6) (a) of the Portuguese VAT Code (services supplied to a business established outside the EU)';
const notaIvaPais = pais => (pais === 'UE' ? NOTA_IVA_UE : pais === 'Fora UE' ? NOTA_IVA_FORA_UE : '');
const dataEN = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y ? `${MESES_EN_F[m - 1]} ${d}, ${y}` : ''; };
const horasF = h => `${Math.round(h * 10) / 10}h`;
const nomeTipoEN = (tipo, n, cu) => { const en = CU_NOMES_EN[tipo]; if (en) return en[n === 1 ? 0 : 1]; const t = tiposDe(cu, { [tipo]: 1 }).find(x => x.id === tipo); return t ? t.nome : tipo; };
// Linhas automáticas: uma por jogo, com as peças somadas e o valor das tarefas (+ linhas à parte dos orçamentos)
const linhasAutoFatura = (trab, tarefas, extras, cu, clientes) => {
  const grupos = new Map();
  const grupo = (key, titulo) => { if (!grupos.has(key)) grupos.set(key, { key, titulo, pecas: {}, horas: 0, soltas: [], extras: [], valor: 0, tarefas: [], extrasIds: [] }); return grupos.get(key); };
  tarefas.forEach(t => {
    const j = jogoDaTarefa(trab, t);
    const g = grupo(j && j.id ? j.id : j && j.nome ? `n:${j.nome}` : 'outros', j ? (j.nomeFatura || j.nome) : 'Other');
    trabPecas(t).forEach(p => {
      if (p.tipo === 'extra' || p.tipo === 'outro') { const h = trabHoras(t); if (h > 0) g.horas += h; else g.soltas.push(conceitoDoNome(t.nome) || t.nome); }
      else g.pecas[p.tipo] = (g.pecas[p.tipo] || 0) + p.n;
    });
    g.valor += trabValor(t, cu, clientes); g.tarefas.push(t.id);
  });
  extras.forEach(x => {
    const p = (trab.pastas || []).find(y => y.id === x.pastaId) || {};
    const j = (trab.jogos || []).find(y => y.id === p.jogoId);
    const g = grupo(j ? j.id : 'outros', j ? (j.nomeFatura || j.nome) : 'Other');
    g.extras.push(x.desc); g.valor += x.val; g.extrasIds.push(x.key);
  });
  return [...grupos.values()].map(g => {
    const tipos = [...ORDEM_TIPOS_F.filter(t => g.pecas[t]), ...Object.keys(g.pecas).filter(t => !ORDEM_TIPOS_F.includes(t))];
    const partes = tipos.map(t => `${g.pecas[t]}x ${nomeTipoEN(t, g.pecas[t], cu)}`);
    g.soltas.forEach(s => partes.push(s));
    if (g.horas > 0) partes.push(`Extra work (${horasF(g.horas)})`);
    g.extras.forEach(s => partes.push(s));
    return { id: `a:${g.key}`, titulo: g.titulo, resto: partes.length ? ` - ${partes.join(' + ')}` : '', valor: Math.round(g.valor * 100) / 100, tarefas: g.tarefas, extras: g.extrasIds };
  });
};
const CampoF = ({ rot, children, largo }) => <label className={`flex flex-col gap-1 min-w-0 ${largo ? 'sm:col-span-2' : ''}`}><span className="text-xs text-slate-500">{rot}</span>{children}</label>;
const FaturasCliente = ({ c, trab, mudar, cu, clientes, ano, mesNum, theme, inputClass, onEnviarAnexo, onCriarRecibo, onApagarRecibo, showToast, onAbrirTarefa, recibos = [], contaDriveRecibos = '' }) => {
  const claro = useClaro(theme);
  const largoDoc = useLargo('(min-width: 1536px)'); // ecrã largo: a fatura vê-se ao lado da lista
  const [docSel, setDocSel] = useState(null); // id da fatura em pré-visualização, ou 'rascunho'
  const fd = trab.faturasDrive || {};
  const contaFD = fd.conta || contaDriveRecibos || '';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const caixa = `rounded-xl border p-4 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`;
  const ic = `${inputClass} text-sm py-1.5`;
  const [mes, setMes] = useState(() => { try { const x = localStorage.getItem('trab-fat-mes'); localStorage.removeItem('trab-fat-mes'); if (x) { const [a, m] = x.split('-').map(Number); if (a && m) return { a, m }; } } catch (e) { /* sem armazenamento */ } return { a: ano, m: mesNum }; });
  const pref = `${mes.a}-${String(mes.m).padStart(2, '0')}-`;
  const mesK = pref.slice(0, 7);
  const cid = c.id;
  const doCliente = (trab.tarefas || []).filter(t => String(t.cid) === String(cid));
  const faturas = (trab.faturas || []).filter(f => String(f.cid) === String(cid)).sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.numero || 0) - (a.numero || 0));
  const daApp = faturas.filter(f => !f.antiga);
  const inicio = daApp.length ? daApp.map(f => f.mes).sort()[0] : null;
  // Tarefas do mês ainda por faturar, já faturadas, e as que ficaram para trás
  const doMes = doCliente.filter(t => trabEntrega(t).startsWith(pref));
  const jaFat = t => !!(t.faturaId || t.faturada);
  const porFaturar = doMes.filter(t => !jaFat(t));
  const jaFaturadas = doMes.filter(jaFat);
  const atrasadas = inicio ? doCliente.filter(t => !jaFat(t) && trabEntrega(t) && trabEntrega(t) < pref && trabEntrega(t).slice(0, 7) >= inicio) : [];
  const porEntregar = doCliente.filter(t => t.estado === 'todo' || t.estado === 'curso');
  const [incluirAtras, setIncluirAtras] = useState(true);
  const [verTarefasL, setVerTarefasL] = useState(() => { try { return localStorage.getItem('fat-ver-tarefas') === '1'; } catch (e) { return false; } }); // as tarefas por baixo de cada linha
  const alternarTarefasL = () => setVerTarefasL(v => { try { localStorage.setItem('fat-ver-tarefas', v ? '0' : '1'); } catch (e) { /* */ } return !v; });
  const extrasMes = [];
  (trab.pastas || []).filter(p => String(p.cid) === String(cid)).forEach(p => ((p.orcamento && p.orcamento.extras) || []).forEach((e, i) => {
    const v = Number(String(e.val ?? '').replace(',', '.')) || 0;
    if (v && !e.faturaId && String(e.data || '').startsWith(pref)) extrasMes.push({ key: `${p.id}:${i}`, pastaId: p.id, desc: e.desc || 'Extra', val: v });
  }));
  const tarefasFatura = [...porFaturar, ...(incluirAtras ? atrasadas : [])];
  const semPreco = tarefasFatura.filter(t => !(trabValor(t, cu, clientes) > 0));
  // Tarefas que estão numa lista de outro mês (ex.: lista de setembro acabada a 1 de outubro) — podem já ter sido faturadas
  const mesDaLista = t => { const p = (trab.pastas || []).find(x => x.id === t.pastaId); if (!p) return null; return p.mesNum || mesDoNome(p.nome) || null; };
  const deOutraLista = porFaturar.filter(t => { const m = mesDaLista(t); return m && m !== mes.m; });
  const marcarFora = lista => { const ids = new Set(lista.map(t => t.id)); mudar(tr => ({ ...tr, tarefas: (tr.tarefas || []).map(t => (ids.has(t.id) ? { ...t, faturaId: 'fora' } : t)) })); };
  const auto = linhasAutoFatura(trab, tarefasFatura, extrasMes, cu, clientes);
  // Rascunho da fatura deste cliente e mês: fica gravado (sais e voltas e está tudo como deixaste)
  const chaveRasc = `${cid}_${mesK}`;
  const rasc = (trab.rascunhosFatura || {})[chaveRasc] || {};
  const setRasc = fn => mudar(tr => { const todos = { ...(tr.rascunhosFatura || {}) }; todos[chaveRasc] = fn(todos[chaveRasc] || {}); return { ...tr, rascunhosFatura: todos }; });
  const campoRasc = k => v => setRasc(r => ({ ...r, [k]: typeof v === 'function' ? v(r[k]) : v }));
  const edicoes = rasc.edicoes || {};
  const manuais = rasc.manuais || [];
  const setEdicoes = f => setRasc(r => ({ ...r, edicoes: typeof f === 'function' ? f(r.edicoes || {}) : f }));
  const setManuais = f => setRasc(r => ({ ...r, manuais: typeof f === 'function' ? f(r.manuais || []) : f }));
  const linhas = [...auto.filter(l => !(edicoes[l.id] && edicoes[l.id].fora)).map(l => ({ ...l, ...(edicoes[l.id] || {}) })), ...manuais];
  const fat = c.fat || {};
  // País do cliente (o da ficha, ou adivinhado pelo NIF/VAT, morada ou recibos verdes): decide o IVA e a frase da fatura
  const provPais = paisDoCliente(c, recibos);
  const paisCli = provPais ? provPais.pais : 'PT';
  const recCli = c.recibo || {};
  const ivaTaxa = fat.ivaFatura != null && fat.ivaFatura !== '' ? (Number(fat.ivaFatura) || 0) : paisCli === 'PT' ? (recCli.taxaIva != null && recCli.taxaIva !== '' ? Number(recCli.taxaIva) : 23) : 0;
  const subtotal = Math.round(linhas.reduce((a, l) => a + (Number(l.valor) || 0), 0) * 100) / 100;
  const ivaValor = Math.round(subtotal * ivaTaxa) / 100;
  const total = Math.round((subtotal + ivaValor) * 100) / 100;
  const proximoN = faturas.length ? Math.max(...faturas.map(f => Number(f.numero) || 0)) + 1 : (Number(fat.proxFatura) || 1);
  const ultimoDia = `${mes.a}-${String(mes.m).padStart(2, '0')}-${String(new Date(mes.a, mes.m, 0).getDate()).padStart(2, '0')}`;
  const numero = rasc.numero != null && rasc.numero !== '' ? rasc.numero : (rasc.numero === '' ? '' : null);
  const data = rasc.data || null;
  const setNumero = campoRasc('numero');
  const setData = campoRasc('data');
  const nFinal = numero != null ? numero : proximoN;
  const dFinal = data || ultimoDia;
  const em = trab.emissor || {};
  // Tipo de trabalho ("FOR:") desta fatura: o da última fatura deste cliente → o da ficha → o geral
  const parasAntes = [...new Set(faturas.map(f => f.para).filter(Boolean))];
  const paraSugerido = parasAntes[0] || fat.paraFatura || (em.para != null ? em.para : 'Motion Graphics');
  const pFinal = rasc.para != null ? rasc.para : paraSugerido;
  const [verEmissor, setVerEmissor] = useState(!em.nome);
  const setEm = patch => mudar(tr => ({ ...tr, emissor: { ...(tr.emissor || {}), ...patch } }));
  const proxMes = mes.m === 12 ? { a: mes.a + 1, m: 1 } : { a: mes.a, m: mes.m + 1 };
  const registar = rasc.registar !== false;
  const setRegistar = campoRasc('registar');
  const mesRec = rasc.mesRec || null;
  const setMesRec = campoRasc('mesRec');
  const recK = mesRec || `${proxMes.a}-${proxMes.m}`;
  const [aGerar, setAGerar] = useState(false);
  const mudarMes = d => setMes(x => { let m = x.m + d, a = x.a; if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; } return { a, m }; });
  const linhasCliente = [fat.nomeLegal || c.nome, fat.nif ? `VAT No: ${fat.nif}` : '', fat.morada || ''];
  const dadosPdf = () => ({
    emissor: { nome: em.nome, morada1: em.morada1, morada2: em.morada2, telefone: em.telefone, nif: em.nif, para: pFinal },
    data: dataEN(dFinal), numero: nFinal, cliente: linhasCliente,
    linhas: linhas.map(l => ({ titulo: l.titulo, resto: l.resto, valor: Number(l.valor) || 0 })),
    subtotal, ivaTaxa, ivaValor, total,
    notaIva: fat.notaIva === '-' ? '' : fat.notaIva != null && fat.notaIva !== '' ? fat.notaIva : (ivaTaxa > 0 ? '' : notaIvaPais(paisCli)), // clientes portugueses: sem a frase da isenção
    pagamento: ['Payment via bank transfer to:', [em.iban ? `IBAN: ${em.iban}` : '', em.swift ? `SWIFT/BIC: ${em.swift}` : ''].filter(Boolean).join(' ')],
  });
  const nomeFicheiro = (n, iso) => { const [y, m] = String(iso).split('-').map(Number); return `${n}_Invoice_${MESES_EN_F[(m || 1) - 1]}_${String(y).slice(2)}.pdf`; };
  const descarregar = (u8, nome) => { const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
  const verPdf = u8 => { const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })); window.open(url, '_blank', 'noopener'); };
  const avisos = [];
  if (!em.nome || !em.iban) avisos.push('Faltam os teus dados (nome, morada, NIF, IBAN) — preenche em "Os meus dados".');
  if (!fat.nomeLegal) avisos.push('Falta o nome legal do cliente na Ficha → Faturação.');
  if (!provPais) avisos.push(`Não sei o país do cliente (Ficha → Regras dos recibos, ou o VAT na Faturação): assumi Portugal${ivaTaxa ? `, com IVA de ${ivaTaxa}%` : ''}.`);
  if (faturas.some(f => Number(f.numero) === Number(nFinal))) avisos.push(`Já existe uma fatura nº ${nFinal} deste cliente.`);
  if (faturas.some(f => f.mes === mesK)) avisos.push(`Já fizeste uma fatura de ${MESES_PT_F[mes.m - 1]} para este cliente — esta junta só o que ficou de fora.`);
  const gerar = async () => {
    if (!linhas.length || !(total > 0)) { if (showToast) showToast('Não há nada para faturar neste mês.', 'error'); return; }
    if (!em.nome) { setVerEmissor(true); if (showToast) showToast('Preenche primeiro os teus dados.', 'error'); return; }
    setAGerar(true);
    try {
      const u8 = gerarPdfFatura(dadosPdf());
      const nome = nomeFicheiro(nFinal, dFinal);
      descarregar(u8, nome);
      let pdf = null;
      if (onEnviarAnexo) { try { const r = await onEnviarAnexo(`faturas/${cid}/${trabId()}-${nome}`, new File([u8], nome, { type: 'application/pdf' })); pdf = { url: r.url, caminho: r.caminho, nome }; } catch (e) { console.error('Fatura PDF:', e); } }
      const idsT = new Set(linhas.flatMap(l => l.tarefas || []));
      const idsX = new Set(linhas.flatMap(l => l.extras || []));
      const reg = { id: trabId(), cid, numero: Number(nFinal), data: dFinal, mes: mesK, para: pFinal, linhas: linhas.map(l => ({ titulo: l.titulo, resto: l.resto, valor: Number(l.valor) || 0 })), subtotal, ivaTaxa, ivaValor, total, notaIva: dadosPdf().notaIva, tarefas: [...idsT], extras: [...idsX], pdf, criada: new Date().toISOString() };
      if (registar && onCriarRecibo) { const r2 = onCriarRecibo({ cid, mesK: recK, numero: Number(nFinal), valor: subtotal, pdf, faturaId: reg.id, mesFatura: mes.m }); if (r2) reg.recibo = r2; }
      mudar(tr => ({
        ...tr,
        faturas: [...(tr.faturas || []), reg],
        rascunhosFatura: (({ [chaveRasc]: _x, ...resto }) => resto)(tr.rascunhosFatura || {}),
        tarefas: (tr.tarefas || []).map(t => (idsT.has(t.id) ? { ...t, faturaId: reg.id } : t)),
        pastas: (tr.pastas || []).map(p => (p.orcamento && (p.orcamento.extras || []).some((e, i) => idsX.has(`${p.id}:${i}`)) ? { ...p, orcamento: { ...p.orcamento, extras: p.orcamento.extras.map((e, i) => (idsX.has(`${p.id}:${i}`) ? { ...e, faturaId: reg.id } : e)) } } : p)),
      }));
      if (showToast) showToast(`Fatura nº ${nFinal} gerada${pdf ? ' e guardada' : ''}${registar && onCriarRecibo ? ' · registada em Receitas' : ''}`);
      setDocSel(reg.id);
      if (fd.pasta) enviarFaturaDrive(reg, new File([u8], nome, { type: 'application/pdf' }), false, true);
    } catch (e) { console.error('Fatura:', e); if (showToast) showToast('Não consegui gerar a fatura.', 'error'); }
    setAGerar(false);
  };
  const anular = async f => {
    if (!await confirmar(f.antiga ? `Tirar a fatura nº ${f.numero} desta lista?${(f.tarefas || []).length ? ' As tarefas que deste como faturadas voltam a ficar por faturar.' : ''}` : `Anular a fatura nº ${f.numero}? As tarefas voltam a ficar por faturar.`)) return;
    // O registo que a fatura criou em Receitas: sai também (senão, ao gerar a fatura outra vez, contava a dobrar)
    if (f.recibo && onApagarRecibo && await confirmar(`Tirar também o registo desta fatura em Receitas?\n\nSe já lhe juntaste o recibo verde ou o PDF, fica lá (apagas à mão se for preciso).`, { ok: 'Tirar', perigo: true, cancelar: 'Deixar ficar' })) {
      const r = onApagarRecibo(f.recibo, f.id, f.pdf && f.pdf.caminho);
      if (showToast) showToast(r === 'apagado' ? 'Registo em Receitas tirado' : r === 'fica' ? 'O registo em Receitas tem o recibo verde/PDF — ficou lá' : 'Não encontrei o registo em Receitas');
    }
    mudar(tr => ({
      ...tr,
      faturas: (tr.faturas || []).filter(x => x.id !== f.id),
      tarefas: (tr.tarefas || []).map(t => (t.faturaId === f.id ? (({ faturaId, ...r }) => r)(t) : t)),
      pastas: (tr.pastas || []).map(p => (p.orcamento && (p.orcamento.extras || []).some(e => e.faturaId === f.id) ? { ...p, orcamento: { ...p.orcamento, extras: p.orcamento.extras.map(e => (e.faturaId === f.id ? (({ faturaId, ...r }) => r)(e) : e)) } } : p)),
    }));
  };
  // Faturas antigas (feitas fora da app): várias de uma vez; o nº e o mês vêm do nome do ficheiro, o valor e a data a IA lê do PDF
  const [antigas, setAntigas] = useState(null); // { linhas: [{ id, ficheiro, numero, data, mes, valor, lendo, lido }], marcar, aGuardar }
  const mudarLinhaA = (id, patch) => setAntigas(x => (x ? { ...x, linhas: x.linhas.map(l => (l.id === id ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)) } : x));
  const juntarFicheiros = async lista => {
    // Cada item é um ficheiro, ou { file, drive } quando vem do Drive (fica já ligado a esse ficheiro)
    const novas = Array.from(lista || []).map(it => { const f = it && it.file ? it.file : it; const n = lerNomeFatura(f.name); return { id: trabId() + Math.random().toString(36).slice(2, 6), ficheiro: f, drive: (it && it.drive) || null, numero: n.numero, mes: n.mes || '', data: n.mes ? ultimoDiaDe(n.mes) : '', valor: '', lendo: true, mesDoNome: !!n.mes }; });
    if (!novas.length) return;
    setAntigas(x => ({ marcar: true, ...(x || {}), linhas: [...((x && x.linhas) || []), ...novas] }));
    // Três de cada vez (é mais rápido e não sobrecarrega a função)
    const fila = [...novas];
    const ler = async () => { for (let l = fila.shift(); l; l = fila.shift()) await lerUma(l); };
    const lerUma = async l => {
      let d = null; try { d = await lerFaturaIA(l.ficheiro); } catch (e) { d = null; }
      const v = d ? Number(d.valorIliquido) || Number(d.totalDocumento) || 0 : 0;
      const dataIA = dataIAValida(d && d.data);
      mudarLinhaA(l.id, x => ({ lendo: false, lido: !!d, valor: x.valor !== '' ? x.valor : (v > 0 ? String(Math.round(v * 100) / 100) : ''), data: dataIA || x.data, mes: x.mesDoNome ? x.mes : (dataIA ? dataIA.slice(0, 7) : x.mes) }));
    };
    await Promise.all([ler(), ler(), ler()]);
  };
  const novaAntiga = () => setAntigas({ marcar: true, linhas: [] });
  const linhaSemPdf = () => { const m = new Date(); m.setDate(0); const mes = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`; setAntigas(x => ({ ...x, linhas: [...x.linhas, { id: trabId() + 'm', ficheiro: null, numero: '', mes, data: ultimoDiaDe(mes), valor: '', lendo: false }] })); };
  const tarefasDoMesAntiga = m => (m ? doCliente.filter(t => !jaFat(t) && trabEntrega(t).startsWith(`${m}-`)) : []);
  const guardarAntigas = async () => {
    const A = antigas; if (!A || !A.linhas.length) return;
    const nums = A.linhas.map(l => Number(l.numero));
    const falta = A.linhas.find(l => !l.numero || !l.data || !l.mes || !(Number(String(l.valor).replace(',', '.')) > 0));
    if (falta) { if (showToast) showToast(`Falta o nº, a data, o mês ou o valor${falta.ficheiro ? ` em ${falta.ficheiro.name}` : ''}.`, 'error'); return; }
    const rep = A.linhas.find((l, i) => faturas.some(f => Number(f.numero) === Number(l.numero)) || nums.indexOf(Number(l.numero)) !== i);
    if (rep) { if (showToast) showToast(`A fatura nº ${rep.numero} já existe (ou está repetida).`, 'error'); return; }
    setAntigas({ ...A, aGuardar: true });
    const regs = []; const usadas = new Set(); let erroPdf = 0;
    for (const l of A.linhas) {
      let pdf = null;
      if (l.ficheiro && onEnviarAnexo) {
        try { const nome = l.ficheiro.name || `${l.numero}_Invoice.pdf`; const r = await onEnviarAnexo(`faturas/${cid}/${trabId()}-${nome.replace(/[^\w.\-]+/g, '_')}`, l.ficheiro); pdf = { url: r.url, caminho: r.caminho, nome }; }
        catch (e) { console.error('Fatura antiga PDF:', e); erroPdf += 1; }
      }
      const valor = Number(String(l.valor).replace(',', '.')) || 0;
      const ids = A.marcar ? tarefasDoMesAntiga(l.mes).map(t => t.id).filter(id => !usadas.has(id)) : [];
      ids.forEach(id => usadas.add(id));
      regs.push({ id: trabId() + regs.length, cid, numero: Number(l.numero), data: l.data, mes: l.mes, para: '', linhas: [{ titulo: `Fatura nº ${l.numero}`, resto: '', valor }], subtotal: valor, ivaTaxa: 0, ivaValor: 0, total: valor, tarefas: ids, extras: [], pdf, antiga: true, criada: new Date().toISOString(), ...(l.drive ? { drive: l.drive } : {}), _ficheiro: l.drive ? null : l.ficheiro });
    }
    const paraDrive = regs.filter(r => r._ficheiro); regs.forEach(r => { delete r._ficheiro; });
    const daFat = {}; regs.forEach(r => r.tarefas.forEach(id => { daFat[id] = r.id; }));
    const idsDrive = new Set(regs.filter(r => r.drive).map(r => r.drive.id));
    mudar(tr => ({ ...tr, faturas: [...(tr.faturas || []), ...regs], tarefas: (tr.tarefas || []).map(t => (daFat[t.id] ? { ...t, faturaId: daFat[t.id] } : t)), faturasDrivePend: (tr.faturasDrivePend || []).filter(p => !idsDrive.has(p.id)) }));
    setAntigas(null);
    if (fd.pasta) (async () => { for (const r of paraDrive) await enviarFaturaDrive(r, A.linhas.find(l => Number(l.numero) === r.numero).ficheiro, true); })();
    if (showToast) showToast(`${regs.length} fatura${regs.length === 1 ? '' : 's'} junta${regs.length === 1 ? '' : 's'}${usadas.size ? ` · ${usadas.size} tarefa${usadas.size === 1 ? '' : 's'} dada${usadas.size === 1 ? '' : 's'} como faturada${usadas.size === 1 ? '' : 's'}` : ''}${erroPdf ? ` · ${erroPdf} PDF não ${erroPdf === 1 ? 'ficou guardado' : 'ficaram guardados'}` : ''}`, erroPdf ? 'error' : undefined);
  };
  // ── Google Drive: cada fatura vai para FATURAS / cliente / ano / mês; o que lá estiver e não estiver aqui, vem para cá ──
  const ligarDrive = (id, out) => mudar(tr => ({ ...tr, faturas: (tr.faturas || []).map(f => (f.id === id ? { ...f, drive: { id: out.id, url: out.url || out.webViewLink, nome: out.nome || out.name, ...((out.mod || out.modifiedTime) ? { mod: out.mod || out.modifiedTime } : {}) } } : f)), faturasDrivePend: (tr.faturasDrivePend || []).filter(p => p.id !== out.id) }));
  const nomePdfDe = f => (f.pdf && f.pdf.nome) || nomeFicheiro(f.numero, f.data);
  const enviarFaturaDrive = async (f, ficheiro, calado, novaVersao) => {
    if (!fd.pasta || !ficheiro) return null;
    try {
      const out = await guardarFaturaNoDrive({ ficheiro, nome: nomePdfDe(f), cliente: c.nome, mes: f.mes, pastaUrl: fd.pasta, conta: contaFD, novaVersao });
      ligarDrive(f.id, out);
      if (showToast && !calado) showToast(out.novaVersao ? `☁ Fatura nº ${f.numero} atualizada no Drive (a versão anterior ficou guardada no histórico do ficheiro)` : out.jaExistia ? `☁ Fatura nº ${f.numero}: já estava no Drive` : `☁ Fatura nº ${f.numero} no Drive`);
      return out;
    } catch (e) { console.error('Fatura → Drive:', e); if (showToast) showToast(`A fatura nº ${f.numero} não foi para o Drive: ${e.message || e}`, 'error'); return null; }
  };
  const pdfDaFatura = f => gerarPdfFatura({ ...dadosPdf(), emissor: { ...dadosPdf().emissor, para: f.para || dadosPdf().emissor.para }, data: dataEN(f.data), numero: f.numero, linhas: f.linhas, subtotal: f.subtotal, ivaTaxa: f.ivaTaxa, ivaValor: f.ivaValor, total: f.total, notaIva: f.notaIva });
  const [aSinc, setASinc] = useState(false);
  const sincronizarDrive = async () => {
    if (!fd.pasta || aSinc) return;
    setASinc(true);
    try {
      const noDrive = await listarFaturasDrive({ cliente: c.nome, pastaUrl: fd.pasta, conta: contaFD });
      const idsDrive = new Set(noDrive.map(x => x.id));
      const usados = new Set();
      let enviadas = 0, ligadas = 0, semPdf = 0;
      // 1) as da app que ainda não estão no Drive
      for (const f of faturas) {
        if (f.drive && idsDrive.has(f.drive.id)) { usados.add(f.drive.id); continue; }
        const igual = noDrive.find(x => !usados.has(x.id) && (x.name === nomePdfDe(f) || (lerNomeFatura(x.name).numero && Number(lerNomeFatura(x.name).numero) === Number(f.numero))));
        if (igual) { usados.add(igual.id); ligarDrive(f.id, igual); ligadas += 1; continue; }
        let fich = null;
        if (f.pdf && f.pdf.url) { try { const r = await fetch(f.pdf.url); if (r.ok) fich = new File([await r.blob()], nomePdfDe(f), { type: 'application/pdf' }); } catch (e) { /* sem acesso direto */ } }
        if (!fich && !f.antiga) fich = new File([pdfDaFatura(f)], nomePdfDe(f), { type: 'application/pdf' });
        if (!fich) { semPdf += 1; continue; }
        const out = await enviarFaturaDrive(f, fich, true);
        if (out) { usados.add(out.id); enviadas += 1; }
      }
      // 2) as do Drive que não estão na app: vêm para a lista de «Juntar faturas antigas», já lidas pela IA, para confirmares
      const novos = noDrive.filter(x => !usados.has(x.id));
      if (novos.length) {
        const itens = [];
        for (const x of novos) { try { itens.push({ file: await ficheiroDoDrive(contaFD, x), drive: { id: x.id, url: x.webViewLink, nome: x.name, mod: x.modifiedTime } }); } catch (e) { console.error('Drive → app:', e); } }
        if (itens.length) juntarFicheiros(itens);
      }
      if (showToast) showToast([enviadas ? `${enviadas} enviada${enviadas === 1 ? '' : 's'} para o Drive` : '', ligadas ? `${ligadas} ligada${ligadas === 1 ? '' : 's'} à que já lá estava` : '', novos.length ? `${novos.length} no Drive que não ${novos.length === 1 ? 'estava' : 'estavam'} aqui — confirma e carrega em Juntar` : '', semPdf ? `${semPdf} sem PDF para enviar` : ''].filter(Boolean).join(' · ') || 'Está tudo igual no Drive e aqui ✓');
    } catch (e) { console.error('Sincronizar faturas:', e); if (showToast) showToast(`Não consegui falar com o Drive: ${e.message || e}`, 'error'); }
    setASinc(false);
  };
  // O que a verificação automática encontrou no Drive e não conseguiu juntar sozinha
  const pendDrive = (trab.faturasDrivePend || []).filter(p => !p.cid || String(p.cid) === String(cid));
  const [aRever, setARever] = useState(null);
  const reverPend = async p => {
    setARever(p.id);
    try { const file = await ficheiroDoDrive(contaFD, { id: p.id, name: p.nome }); juntarFicheiros([{ file, drive: { id: p.id, url: p.url, nome: p.nome, mod: p.mod } }]); }
    catch (e) { if (showToast) showToast(`Não consegui abrir ${p.nome} do Drive: ${e.message || e}`, 'error'); }
    setARever(null);
  };
  const ignorarPend = p => mudar(tr => ({ ...tr, faturasDrivePend: (tr.faturasDrivePend || []).filter(x => x.id !== p.id), faturasDriveIgnorar: [...new Set([...(tr.faturasDriveIgnorar || []), p.id])].slice(-500) }));
  const setFD = patch => mudar(tr => ({ ...tr, faturasDrive: { ...(tr.faturasDrive || {}), ...patch } }));
  const [sempreFD, setSempreFD] = useState(() => ligadoSempre(contaFD || '_'));
  useEffect(() => { let vivo = true; sincronizarSempre().then(() => { if (vivo) setSempreFD(ligadoSempre(contaFD || '_')); }); return () => { vivo = false; }; }, [contaFD]);
  const ligarSempreFD = async () => {
    try { await carregarGis(); await ligarDriveSempre(contaFD || undefined); setSempreFD(true); if (showToast) showToast('☁ Drive ligado: a app passa a ver as faturas novas sozinha'); }
    catch (e) { if (showToast) showToast(e.message || String(e), 'error'); }
  };
  // Pré-visualização ao lado (ecrãs largos)
  const fPrev = docSel === 'rascunho' ? null : (faturas.find(f => f.id === docSel) || faturas[0] || null);
  const jsonRasc = docSel === 'rascunho' ? JSON.stringify(dadosPdf()) : '';
  const docPrev = docSel === 'rascunho'
    ? { chave: `rasc:${jsonRasc}`, titulo: `Rascunho da fatura nº ${nFinal}`, sub: `${MESES_PT_F[mes.m - 1]} ${mes.a} · ${cuEur(total)}`, obter: () => { const blob = new Blob([gerarPdfFatura(dadosPdf())], { type: 'application/pdf' }); return { url: URL.createObjectURL(blob), blob, nome: nomeFicheiro(nFinal, dFinal), tipo: 'application/pdf', revogar: true }; } }
    : fPrev ? {
      chave: `${fPrev.id}:${(fPrev.pdf && fPrev.pdf.url) || ''}:${(fPrev.drive && fPrev.drive.mod) || ''}:${fPrev.total}`,
      titulo: `Fatura nº ${fPrev.numero}`, sub: `${MESES_PT_F[Number(String(fPrev.mes).slice(5, 7)) - 1] || ''} ${String(fPrev.mes).slice(0, 4)} · ${cuEur(fPrev.total)}${fPrev.antiga ? ' · antiga' : ''}`,
      obter: () => {
        const nomeP = nomePdfDe(fPrev);
        const baixar = fPrev.drive && fPrev.drive.id ? () => descarregarDriveSemJanela(contaFD, fPrev.drive.id) : undefined;
        if (fPrev.pdf && fPrev.pdf.url) return { url: fPrev.pdf.url, nome: nomeP, tipo: tipoDoNome(nomeP), baixar };
        if (fPrev.antiga) return fPrev.drive && fPrev.drive.id ? { url: `https://drive.google.com/file/d/${fPrev.drive.id}/preview`, nome: fPrev.drive.nome || nomeP, tipo: tipoDoNome(fPrev.drive.nome || nomeP), baixar } : null;
        const blob = new Blob([pdfDaFatura(fPrev)], { type: 'application/pdf' });
        return { url: URL.createObjectURL(blob), blob, nome: nomePdfDe(fPrev), tipo: 'application/pdf', revogar: true };
      },
    } : null;
  const abrirAntiga = f => { if (largoDoc) { setDocSel(f.id); return; } if (f.pdf && f.pdf.url) { window.open(f.pdf.url, '_blank', 'noopener'); return; } if (f.antiga && f.drive && f.drive.url) { window.open(f.drive.url, '_blank', 'noopener'); return; } verPdf(gerarPdfFatura({ ...dadosPdf(), emissor: { ...dadosPdf().emissor, para: f.para || dadosPdf().emissor.para }, data: dataEN(f.data), numero: f.numero, linhas: f.linhas, subtotal: f.subtotal, ivaTaxa: f.ivaTaxa, ivaValor: f.ivaValor, total: f.total, notaIva: f.notaIva })); };
  const chip = `px-2 py-0.5 rounded-md text-[11px]`;
  return (
    <div className={largoDoc ? 'grid grid-cols-[minmax(0,50rem)_minmax(0,1fr)] gap-4 items-start' : ''}>
    <div className={`space-y-4 min-w-0 ${largoDoc ? '' : 'max-w-4xl'}`}>
      <div className={caixa}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button type="button" onClick={() => mudarMes(-1)} className={`w-8 h-8 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label="Mês anterior">‹</button>
          <p className="font-semibold">Fatura de {MESES_PT_F[mes.m - 1]} de {mes.a}</p>
          <button type="button" onClick={() => mudarMes(1)} className={`w-8 h-8 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label="Mês seguinte">›</button>
          <span className="flex-1" />
          <span className={`text-xs ${sub}`}>{porFaturar.length} tarefa{porFaturar.length === 1 ? '' : 's'} entregue{porFaturar.length === 1 ? '' : 's'} por faturar{jaFaturadas.length ? ` · ${jaFaturadas.length} já faturada${jaFaturadas.length === 1 ? '' : 's'}` : ''}</span>
        </div>
        {/* Verificações */}
        <div className="space-y-1.5 mb-3 text-xs">
          {atrasadas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 bg-amber-500/10 text-amber-500">
              <span className="flex-1 min-w-0">⚠ {atrasadas.length} tarefa{atrasadas.length === 1 ? '' : 's'} de meses anteriores ficaram por faturar: {atrasadas.slice(0, 4).map(t => t.nome).join(' · ')}{atrasadas.length > 4 ? '…' : ''}</span>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={incluirAtras} onChange={e => setIncluirAtras(e.target.checked)} className="accent-amber-500" /> Juntar a esta fatura</label>
            </div>
          )}
          {deOutraLista.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 bg-amber-500/10 text-amber-500">
              <span className="flex-1 min-w-0">⚠ {deOutraLista.length} tarefa{deOutraLista.length === 1 ? ' está numa lista' : 's estão em listas'} de outro mês mas {deOutraLista.length === 1 ? 'foi entregue' : 'foram entregues'} em {MESES_PT_F[mes.m - 1]}: {deOutraLista.map((t, k) => <React.Fragment key={t.id}>{k > 0 && ' · '}<button type="button" onClick={() => onAbrirTarefa && onAbrirTarefa(t.id)} className="underline hover:no-underline">{t.nome}</button> (lista de {MESES_PT_F[(mesDaLista(t) || 1) - 1]}, entregue a {trabEntrega(t).slice(8, 10)}/{trabEntrega(t).slice(5, 7)})</React.Fragment>)}. Se já {deOutraLista.length === 1 ? 'a' : 'as'} faturaste nesse mês:</span>
              <button type="button" onClick={() => marcarFora(deOutraLista)} className="px-2 py-1 rounded-md border border-amber-500/40 hover:bg-amber-500/10">Já faturada{deOutraLista.length === 1 ? '' : 's'} — tirar</button>
            </div>
          )}
          {semPreco.length > 0 && (
            <div className="rounded-lg px-3 py-2 bg-red-500/10 text-red-400 space-y-1">
              <p>⚠ Sem preço — carrega na tarefa para corrigir:</p>
              {semPreco.map(t => {
                const j = jogoDaTarefa(trab, t);
                const hora = trabPecas(t).some(p => p.tipo === 'extra' || p.tipo === 'outro');
                const porque = hora && !(trabHoras(t) > 0) ? 'é à hora mas não tem tempo registado — junta o tempo ou põe o valor final'
                  : hora ? 'é à hora mas este cliente não tem preço à hora — põe o valor final'
                  : 'o tipo não tem preço para este cliente — escolhe o tipo ou põe o valor final';
                return (
                  <p key={t.id} className="pl-3">
                    {onAbrirTarefa ? <button type="button" onClick={() => onAbrirTarefa(t.id)} className="underline underline-offset-2 hover:text-red-300">{t.nome}</button> : t.nome}
                    {j ? <span className="opacity-70"> ({j.nome})</span> : null} — {porque}.
                  </p>
                );
              })}
            </div>
          )}
          {!inicio && <div className={`rounded-lg px-3 py-2 ${claro ? 'bg-slate-50' : 'bg-white/[0.03]'} ${sub}`}>É a primeira fatura deste cliente na app. A partir daqui, a app avisa se alguma tarefa entregue ficar por faturar.</div>}
          {porEntregar.length > 0 && <div className={sub}>{porEntregar.length} tarefa{porEntregar.length === 1 ? '' : 's'} ainda por entregar (Por começar / Em curso) — entram na fatura do mês em que passarem a Review ou Feito.</div>}
          {porFaturar.length === 0 && !atrasadas.length && !extrasMes.length && <div className={sub}>Nenhuma tarefa entregue neste mês por faturar.</div>}
        </div>
        {/* Linhas */}
        <div className={`rounded-xl border overflow-hidden ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
          <div className={`grid grid-cols-[minmax(0,1fr)_110px_28px] gap-2 px-3 h-8 items-center text-[11px] font-semibold uppercase tracking-wide ${claro ? 'bg-slate-50 text-slate-500' : 'bg-white/[0.03] text-slate-400'}`}><span>Descrição</span><span className="text-right">Valor</span><span /></div>
          {linhas.map((l, i) => {
            const ed = (patch) => { if (String(l.id).startsWith('m:')) setManuais(ms => ms.map(x => (x.id === l.id ? { ...x, ...patch } : x))); else setEdicoes(e => ({ ...e, [l.id]: { ...(e[l.id] || {}), ...patch } })); };
            return (
              <div key={l.id} className={`grid grid-cols-[minmax(0,1fr)_110px_28px] gap-2 px-3 py-2 items-start border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}>
                <div className="flex flex-col sm:flex-row gap-1.5 min-w-0">
                  <input value={l.titulo} onChange={e => ed({ titulo: e.target.value })} placeholder="Projeto" className={`${ic} sm:!w-40 font-semibold`} />
                  <textarea rows={1} value={l.resto} onChange={e => ed({ resto: e.target.value.replace(/\n/g, ' ') })} placeholder=" - 3x New Videos" aria-label="Descrição"
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }}
                    className={`${ic} flex-1 min-w-0 resize-none overflow-hidden leading-snug`} />
                </div>
                <input type="number" step="0.01" value={l.valor} onChange={e => ed({ valor: e.target.value === '' ? '' : Number(e.target.value) })} className={`${ic} text-right tabular-nums`} />
                <button type="button" onClick={() => (String(l.id).startsWith('m:') ? setManuais(ms => ms.filter(x => x.id !== l.id)) : ed({ fora: true }))} className={`h-8 text-xs ${sub} hover:text-red-400`} title="Tirar esta linha" aria-label="Tirar esta linha">✕</button>
                {(l.tarefas || []).length > 0 && !verTarefasL && <button type="button" onClick={alternarTarefasL} className={`col-span-3 justify-self-start text-[11px] ${sub} hover:text-blue-400`} title="Ver as tarefas desta linha (e das outras)">▸ {l.tarefas.length} tarefa{l.tarefas.length === 1 ? '' : 's'}</button>}
                {(l.tarefas || []).length > 0 && verTarefasL && <p className={`col-span-3 text-[11px] ${sub}`}><button type="button" onClick={alternarTarefasL} className="hover:text-blue-400" title="Esconder as tarefas">▾ {l.tarefas.length} tarefa{l.tarefas.length === 1 ? '' : 's'}:</button> {l.tarefas.map(id => doCliente.find(t => t.id === id)).filter(Boolean).map((t, k) => <React.Fragment key={t.id}>{k > 0 && ' · '}<button type="button" onClick={() => onAbrirTarefa && onAbrirTarefa(t.id)} className="hover:text-blue-400 hover:underline" title="Abrir a tarefa">{t.nome}</button></React.Fragment>)}</p>}
              </div>
            );
          })}
          <div className={`flex items-center gap-3 px-3 py-2 border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}>
            <button type="button" onClick={() => setManuais(ms => [...ms, { id: `m:${trabId()}`, titulo: '', resto: 'AI Credits', valor: '' }])} className="text-xs text-blue-400 hover:text-blue-300">+ Linha (AI Credits, extra…)</button>
            {Object.values(edicoes).some(e => e.fora) && <button type="button" onClick={() => setEdicoes(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { ...v, fora: false }])))} className={`text-xs ${sub} hover:text-blue-400`}>Repor linhas tiradas</button>}
            <span className="flex-1" />
            {ivaTaxa > 0 && <span className={`text-xs ${sub}`}>IVA {ivaTaxa}%: {cuEur(ivaValor)}</span>}
            <span className="text-sm">Total <strong className="tabular-nums">{cuEur(total)}</strong></span>
          </div>
        </div>
        {/* Cabeçalho e ações */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <CampoF rot="Fatura nº"><input type="number" value={nFinal} onChange={e => setNumero(e.target.value === '' ? '' : Number(e.target.value))} className={ic} /></CampoF>
          <CampoF rot="Data"><input type="date" value={dFinal} onChange={e => setData(e.target.value)} className={ic} /></CampoF>
          <CampoF rot={'Tipo de trabalho ("FOR:")'} largo>
            <input value={pFinal} onChange={e => setRasc(r => ({ ...r, para: e.target.value }))} list={`para-${cid}`} placeholder="ex.: UA Creative Work" className={ic} />
            <datalist id={`para-${cid}`}>{[...new Set([...parasAntes, fat.paraFatura, em.para].filter(Boolean))].map(x => <option key={x} value={x} />)}</datalist>
          </CampoF>
          <CampoF rot="Registar em Receitas" largo>
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={registar} onChange={e => setRegistar(e.target.checked)} className="accent-blue-500" disabled={!onCriarRecibo} />
              <select value={recK} onChange={e => setMesRec(e.target.value)} disabled={!registar} className={`${ic} flex-1`}>
                {[0, 1, 2].map(d => { const mm = ((mes.m - 1 + d) % 12) + 1, aa = mes.a + Math.floor((mes.m - 1 + d) / 12); return <option key={d} value={`${aa}-${mm}`}>em {MESES_PT_F[mm - 1]} {aa}{d === 1 ? ' (quando pagam)' : ''}</option>; })}
              </select>
            </span>
          </CampoF>
        </div>
        {avisos.length > 0 && <ul className="mt-3 space-y-1 text-xs text-amber-500">{avisos.map(a => <li key={a}>• {a}</li>)}</ul>}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button type="button" onClick={() => (largoDoc ? setDocSel('rascunho') : verPdf(gerarPdfFatura(dadosPdf())))} disabled={!linhas.length} className={`px-3 py-2 text-sm rounded-lg border disabled:opacity-40 ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Pré-visualizar PDF</button>
          <button type="button" onClick={gerar} disabled={aGerar || !linhas.length} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">{aGerar ? 'A gerar…' : `Gerar fatura nº ${nFinal}`}</button>
          <span className={`text-xs ${sub}`}>Descarrega o PDF, guarda-o aqui e marca as tarefas como faturadas.</span>
        </div>
      </div>

      {/* Os meus dados */}
      <div className={caixa}>
        <button type="button" onClick={() => setVerEmissor(v => !v)} className="w-full flex items-center gap-2 text-left">
          <span className={`text-[10px] ${sub}`} style={{ transform: verEmissor ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
          <span className="text-sm font-semibold flex-1">Os meus dados (aparecem em todas as faturas) e o Drive</span>
          {!em.nome && <span className="text-xs text-amber-500">por preencher</span>}
          {em.nome && <span className={`text-xs ${fd.pasta ? 'text-sky-400' : sub}`}>{fd.pasta ? '☁ Drive ligado' : '☁ Drive por ligar'}</span>}
        </button>
        {verEmissor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <CampoF rot="Nome"><TxtIn valor={em.nome} onGravar={v => setEm({ nome: v })} placeholder="O teu nome" className={ic} /></CampoF>
            <CampoF rot="Telefone"><TxtIn valor={em.telefone} onGravar={v => setEm({ telefone: v })} placeholder="(+351)…" className={ic} /></CampoF>
            <CampoF rot="Morada (linha 1)"><TxtIn valor={em.morada1} onGravar={v => setEm({ morada1: v })} placeholder="Rua…" className={ic} /></CampoF>
            <CampoF rot="Morada (linha 2)"><TxtIn valor={em.morada2} onGravar={v => setEm({ morada2: v })} placeholder="Código postal, localidade" className={ic} /></CampoF>
            <CampoF rot="NIF"><TxtIn valor={em.nif} onGravar={v => setEm({ nif: v })} placeholder="PT…" className={ic} /></CampoF>
            <CampoF rot={'Tipo de trabalho por defeito ("FOR:") — cada cliente pode ter o seu na Ficha'}><TxtIn valor={em.para != null ? em.para : 'Motion Graphics'} onGravar={v => setEm({ para: v })} className={ic} /></CampoF>
            <CampoF rot="IBAN"><TxtIn valor={em.iban} onGravar={v => setEm({ iban: v })} placeholder="PT50 …" className={ic} /></CampoF>
            <CampoF rot="SWIFT/BIC"><TxtIn valor={em.swift} onGravar={v => setEm({ swift: v })} className={ic} /></CampoF>
            <p className={`sm:col-span-2 text-[11px] ${sub}`}>Ficam só na tua base de dados da app (não no código). O nome legal, o VAT e a morada do cliente vêm da Ficha → Faturação; o IVA e a nota do IVA também se mudam lá.</p>
            <div className={`sm:col-span-2 mt-1 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 ${claro ? 'border-slate-100' : 'border-white/[0.06]'}`}>
              <p className="sm:col-span-2 text-sm font-semibold">☁ Faturas no Google Drive</p>
              <CampoF rot="Pasta das faturas no Drive (link)">
                <TxtIn valor={fd.pasta} onGravar={v => setFD({ pasta: String(v || '').trim() })} placeholder="https://drive.google.com/drive/folders/…" className={ic} />
                {fd.pasta && !idPastaDrive(fd.pasta) && <span className="text-[11px] text-red-400">Este link não parece de uma pasta do Drive.</span>}
              </CampoF>
              <CampoF rot="Conta Google dessa pasta">
                <TxtIn valor={fd.conta} onGravar={v => setFD({ conta: String(v || '').trim() })} placeholder={contaDriveRecibos || 'a mesma dos recibos'} className={ic} />
              </CampoF>
              <label className="sm:col-span-2 flex items-start gap-2 text-xs">
                <input type="checkbox" checked={fd.auto !== false} onChange={e => setFD({ auto: e.target.checked })} className="accent-blue-500 mt-0.5" />
                <span>Juntar sozinho as faturas novas que aparecerem nessa pasta (por exemplo, as que guardas no PC numa pasta sincronizada com o Drive). Se a mesma fatura for guardada outra vez (corrigida), atualiza a que já existe — nunca fica a dobrar.</span>
              </label>
              {fd.pasta && fd.auto !== false && !sempreFD && (
                <p className="sm:col-span-2 text-xs text-amber-500 flex flex-wrap items-center gap-2">Para a app ver o Drive sozinha, esta conta tem de ficar sempre ligada.
                  <button type="button" onClick={ligarSempreFD} className="px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/10">Manter sempre ligado</button>
                </p>
              )}
              <p className={`sm:col-span-2 text-[11px] ${sub}`}>Cada fatura fica em <strong>pasta das faturas / Cliente / Ano / Mês</strong> (se guardares uma solta na pasta principal, a app arruma-a). O nº e o mês vêm do nome do ficheiro (ex.: 8_Invoice_October_26.pdf). As pastas que a app usa ficam verdes no Drive, para se ver que estão ligadas à app. A app nunca apaga nada no Drive.</p>
            </div>
          </div>
        )}
      </div>

      {/* Faturas feitas */}
      <div className={caixa}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold">Faturas emitidas</p>
          <span className="flex items-center gap-3">
            {fd.pasta && <button type="button" onClick={sincronizarDrive} disabled={aSinc} className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-60" title={`Envia para o Drive as que lá faltam e traz as que estão no Drive e não estão aqui (FATURAS / ${c.nome} / ano / mês)`}>{aSinc ? 'A ver o Drive…' : '☁ Sincronizar com o Drive'}</button>}
            {!antigas && <button type="button" onClick={novaAntiga} className="text-xs text-blue-400 hover:text-blue-300" title="Faturas que fizeste fora da app: ficam aqui com o PDF, para as teres à mão">+ Juntar faturas antigas</button>}
          </span>
        </div>
        {pendDrive.length > 0 && (
          <div className="mb-3 rounded-lg px-3 py-2 bg-amber-500/10 text-amber-500 text-xs space-y-1.5">
            <p>☁ {pendDrive.length === 1 ? 'Há 1 fatura no Drive que não consegui juntar sozinho' : `Há ${pendDrive.length} faturas no Drive que não consegui juntar sozinho`}:</p>
            {pendDrive.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline truncate max-w-full sm:max-w-[45%]" title={p.nome}>{p.nome}</a>
                <span className="opacity-80">— {p.motivo}{!p.cid ? ' (se for deste cliente, carrega em Rever)' : ''}</span>
                <span className="flex-1" />
                <button type="button" onClick={() => reverPend(p)} disabled={aRever === p.id} className="px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-60">{aRever === p.id ? 'A abrir…' : 'Rever e juntar'}</button>
                <button type="button" onClick={() => ignorarPend(p)} className="px-1.5 py-0.5 opacity-80 hover:opacity-100" title="Não é uma fatura deste cliente: deixa de aparecer aqui (fica no Drive)">Ignorar</button>
              </div>
            ))}
          </div>
        )}
        {antigas && (() => {
          const L = antigas.linhas;
          const lendo = L.filter(l => l.lendo).length;
          const nums = L.map(l => Number(l.numero));
          const mesesSel = [...new Set(L.map(l => l.mes).filter(Boolean))];
          const nT = new Set(mesesSel.flatMap(m => tarefasDoMesAntiga(m).map(t => t.id))).size;
          const nomeMes = m => { const [a, mm] = String(m).split('-').map(Number); return a && mm ? `${MESES_PT_F[mm - 1]} ${a}` : ''; };
          return (
            <div className={`mb-3 rounded-xl border p-3 space-y-3 ${claro ? 'border-blue-200 bg-blue-50/50' : 'border-blue-500/30 bg-blue-500/[0.05]'}`}
              onDragOver={e => { if (Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); }}
              onDrop={e => { if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); juntarFicheiros(e.dataTransfer.files); } }}>
              <p className="text-sm font-medium">Juntar faturas feitas fora da app</p>
              <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm cursor-pointer text-center ${claro ? 'border-slate-300 hover:bg-white' : 'border-slate-600 hover:bg-white/5'}`}>
                <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={e => { juntarFicheiros(e.target.files); e.target.value = ''; }} />
                <span>📎</span><span>Escolhe os PDFs (podes escolher vários) ou arrasta-os para aqui</span>
              </label>
              {L.length > 0 && (
                <div className={`rounded-lg border overflow-x-auto ${claro ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900/40'}`}>
                  <div className={`hidden sm:grid grid-cols-[minmax(0,1fr)_70px_140px_110px_170px_24px] gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${sub}`}><span>Ficheiro</span><span>Nº</span><span>Data</span><span className="text-right">Valor s/ IVA</span><span>Trabalho de</span><span /></div>
                  {L.map((l, i) => {
                    const repetida = l.numero && (faturas.some(f => Number(f.numero) === Number(l.numero)) || nums.indexOf(Number(l.numero)) !== i);
                    return (
                      <div key={l.id} className={`grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_70px_140px_110px_170px_24px] gap-2 px-2 py-1.5 items-center border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}>
                        <span className="col-span-2 sm:col-span-1 text-xs truncate" title={l.ficheiro ? l.ficheiro.name : ''}>{l.ficheiro ? l.ficheiro.name : <span className={sub}>sem PDF</span>}{l.lendo ? <span className="ml-2 text-blue-400">a ler…</span> : l.ficheiro && !l.lido ? <span className="ml-2 text-amber-500" title="A IA não conseguiu ler este PDF: põe o valor à mão">não li o valor</span> : null}</span>
                        <input type="number" value={l.numero} onChange={e => mudarLinhaA(l.id, { numero: e.target.value })} aria-label="Fatura nº" placeholder="nº" className={`${ic} ${repetida ? '!ring-2 !ring-red-500' : ''}`} title={repetida ? 'Já existe uma fatura com este nº' : undefined} />
                        <input type="date" value={l.data} onChange={e => mudarLinhaA(l.id, { data: e.target.value })} aria-label="Data" className={ic} />
                        <input type="number" step="0.01" value={l.valor} onChange={e => mudarLinhaA(l.id, { valor: e.target.value })} aria-label="Valor sem IVA" placeholder={l.lendo ? 'a ler…' : '0,00'} className={`${ic} text-right tabular-nums`} />
                        <input type="month" value={l.mes} onChange={e => mudarLinhaA(l.id, { mes: e.target.value })} aria-label="Trabalho de" className={ic} />
                        <button type="button" onClick={() => setAntigas(x => ({ ...x, linhas: x.linhas.filter(y => y.id !== l.id) }))} className={`text-xs ${sub} hover:text-red-400`} aria-label="Tirar esta linha">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={linhaSemPdf} className={`text-xs ${sub} hover:text-blue-400`}>+ Uma sem PDF</button>
              {nT > 0 && (
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={antigas.marcar} onChange={e => setAntigas(x => ({ ...x, marcar: e.target.checked }))} className="accent-blue-500 mt-0.5" />
                  <span>Dar como faturadas as {nT} tarefa{nT === 1 ? '' : 's'} entregue{nT === 1 ? '' : 's'} em {mesesSel.map(nomeMes).join(', ')} que ainda estão por faturar</span>
                </label>
              )}
              <p className={`text-[11px] ${sub}`}>O nº e o mês vêm do nome do ficheiro (ex.: 4_Invoice_September_26) e a IA lê o valor e a data do PDF — confirma antes de juntar. Não cria nada em Receitas: as faturas antigas normalmente já lá estão.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={guardarAntigas} disabled={antigas.aGuardar || lendo > 0 || !L.length} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{antigas.aGuardar ? 'A guardar…' : lendo ? `A ler ${lendo} PDF${lendo === 1 ? '' : 's'}…` : `Juntar ${L.length || ''} fatura${L.length === 1 ? '' : 's'}`}</button>
                <button type="button" onClick={() => setAntigas(null)} className={`px-3 py-1.5 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Cancelar</button>
              </div>
            </div>
          );
        })()}
        {!faturas.length ? (!antigas && <p className={`text-sm ${sub}`}>Ainda nenhuma.</p>) : (
          <div className="space-y-1">
            {faturas.map(f => (
              <div key={f.id} onClick={largoDoc ? e => { if (!e.target.closest('button,a')) setDocSel(f.id); } : undefined}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 rounded-lg ${largoDoc ? 'cursor-pointer' : ''} ${largoDoc && fPrev && fPrev.id === f.id && docSel !== 'rascunho' ? (claro ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-blue-500/10 ring-1 ring-blue-500/30') : (claro ? 'hover:bg-slate-50' : 'hover:bg-white/[0.03]')}`}>
                <span className="font-medium tabular-nums w-12">nº {f.numero}</span>
                <span className={`text-sm ${sub}`}>{MESES_PT_F[Number(String(f.mes).slice(5, 7)) - 1]} {String(f.mes).slice(0, 4)}</span>
                {(f.tarefas || []).length > 0 && <span className={`${chip} ${claro ? 'bg-slate-100' : 'bg-white/5'}`}>{f.tarefas.length} tarefas</span>}
                {f.antiga && <span className={`${chip} ${claro ? 'bg-slate-100 text-slate-500' : 'bg-white/5 text-slate-400'}`} title="Feita fora da app">antiga</span>}
                {f.recibo && <span className={`${chip} bg-emerald-500/10 text-emerald-500`}>em Receitas</span>}
                {f.drive && f.drive.url && <a href={f.drive.url} target="_blank" rel="noopener noreferrer" className={`${chip} bg-sky-500/10 text-sky-400 hover:bg-sky-500/20`} title={`No Google Drive: ${f.drive.nome || ''}${f.doDrive ? ' (juntada sozinha a partir do Drive)' : ''}`}>☁ Drive</a>}
                {f.corrigida && <span className={`${chip} bg-amber-500/10 text-amber-500`} title="Foi guardada outra vez no Drive e a app atualizou-a">corrigida</span>}
                <span className="flex-1" />
                <span className="tabular-nums font-medium">{cuEur(f.total)}</span>
                {(!f.antiga || (f.pdf && f.pdf.url) || (f.drive && f.drive.url)) && <button type="button" onClick={() => abrirAntiga(f)} className="px-2 py-1 rounded-md text-xs text-emerald-400 hover:bg-white/10">📎 PDF</button>}
                <button type="button" onClick={() => anular(f)} className={`px-2 py-1 rounded-md text-xs ${sub} hover:text-red-400`}>{f.antiga ? 'Tirar' : 'Anular'}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    {largoDoc && <div className="sticky top-[150px] min-w-0"><PainelDoc doc={docPrev} claro={claro} vazio="Ainda não há faturas deste cliente." /></div>}
    </div>
  );
};

// ── Clientes: ficha única (geral, faturação, regras dos recibos, números) que alimenta o resto da app ──
const PAISES_RECIBO = [['PT', 'Portugal'], ['UE', 'UE'], ['Fora UE', 'Fora da UE']];
const MOEDAS = ['EUR', 'USD', 'GBP', 'CHF'];
// Números de um cliente: faturado (recibos), horas e tarefas (Trabalho)
const numerosCliente = (c, trab, faturado, ano, mesNum, cu, clientes) => {
  const f = (faturado || {})[c.id] || {};
  const meses12 = f[ano] || Array(12).fill(0);
  // Faturado: até ao mês de hoje (como em «O meu ano»); o que já está registado nos meses seguintes aparece à parte
  const hojeF = new Date(); const ateM = ano < hojeF.getFullYear() ? 12 : ano === hojeF.getFullYear() ? hojeF.getMonth() + 1 : 0;
  const fatAno = meses12.slice(0, ateM).reduce((a, v) => a + v, 0);
  const fatDepois = meses12.slice(ateM).reduce((a, v) => a + v, 0);
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
  return { meses12, fatAno, fatDepois, fatAnt, horasAno, emCurso, porEntregar, entregueMes, ultimo, eurHora: horasAno > 0 ? fatAno / horasAno : 0 };
};
const Campo = ({ rot, children, largo, escondido }) => (
  <label className={`flex flex-col gap-1 min-w-0 ${largo ? 'sm:col-span-2' : ''}`}><span className={escondido ? 'sr-only' : 'text-xs text-slate-400'}>{rot}</span>{children}</label>
);
const TxtIn = ({ valor, onGravar, className, placeholder, type = 'text', list, onFocus, onInput }) => (
  <input key={String(valor ?? '')} type={type} defaultValue={valor ?? ''} placeholder={placeholder} className={className} list={list} onFocus={onFocus} onInput={onInput}
    onBlur={e => { const v = e.target.value.trim(); if (v !== String(valor ?? '')) onGravar(v); }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
);
const FichaCliente = ({ c, trab, faturado, ano, mesNum, cu, clientes, theme, inputClass, onCliente, onCriarDoClickUp, onIrPrecos, onApagar, notas, onAbrirNota, onNovaNota, recibos = [] }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const caixa = `rounded-xl border p-4 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`;
  const [novaTag, setNovaTag] = useState('');
  if (c.soTrabalho) {
    return (
      <div className={`${caixa} max-w-xl space-y-3`}>
        <p className="text-sm">O cliente <strong>{c.nome}</strong> tem pastas no Trabalho mas ainda não existe na lista de clientes da app, por isso ainda não tem ficha, preços próprios nem recibos.</p>
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
  const provPais = paisDoCliente(c, recibos); // o da ficha, ou adivinhado pelo NIF/VAT, morada ou recibos verdes
  const paisEf = (provPais && provPais.pais) || 'PT';
  const regime = rec.regime || (paisEf === 'Fora UE' ? 'sem' : 'com');
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
            <Campo rot="Outros nomes (separados por vírgulas — o OCR reconhece o cliente por eles)" largo>
              <TxtIn valor={(c.aliases || []).join(', ')} onGravar={v => set({ aliases: [...new Set(v.split(',').map(a => a.trim()).filter(Boolean))] })} placeholder="ex.: Anorak Games, Anorak" className={ic} />
            </Campo>
            <Campo rot="Conta Google dos briefs (os links do Google deste cliente abrem com ela)" largo>
              <TxtIn type="email" valor={c.contaGoogle} onGravar={v => set({ contaGoogle: v.trim() })} placeholder={trab.contaGoogle ? `Vazio = ${trab.contaGoogle}` : 'ex.: ivo@estudio.com — vazio = a conta principal do browser'} className={ic} />
            </Campo>
            <Campo rot="Tags" largo>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map(t => <span key={t} className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs ${claro ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200'}`}>#{t}<button type="button" onClick={() => set({ tags: tags.filter(x => x !== t) })} className="w-4 h-4 rounded-full hover:text-red-400" aria-label={`Tirar ${t}`}>×</button></span>)}
                <input value={novaTag} onChange={e => setNovaTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); juntarTag(); } }} onBlur={juntarTag} placeholder="+ tag (ex.: gaming)" className={`${inputClass} !w-40 text-xs py-1`} />
              </div>
            </Campo>
            <Campo rot="Estado">
              <div className="flex flex-wrap items-center gap-1.5">{[['ativo', 'Ativo'], ['pausa', 'Em pausa'], ['antigo', 'Antigo']].map(([k, nm]) => <button key={k} type="button" onClick={() => set({ estado: k })} className={chip((c.estado || 'ativo') === k)}>{nm}</button>)}
                {onApagar && <button type="button" onClick={async () => { const np = (trab.pastas || []).filter(p => String(p.cid) === String(c.id)).length; if (await confirmar(`Apagar o cliente "${c.nome}"?${np ? `\n\nTem ${np} pasta${np === 1 ? '' : 's'} no Trabalho, que ficam sem cliente.` : ''}\nOs recibos dele não são apagados. Se só já não trabalhas com ele, marca-o como "Antigo".`)) onApagar(c.id); }} className="ml-auto text-xs text-red-400 hover:text-red-300">Apagar cliente</button>}
              </div>
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
            <Campo rot="Diária na tabela do cliente (só para referência — não muda as contas)"><NumIn valor={fat.diariaRef ?? null} placeholder="—" onGravar={v => setFat({ diariaRef: v })} className={ic} /></Campo>
            <Campo rot="Lembretes" largo><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!fat.semFatura} onChange={e => setFat({ semFatura: e.target.checked })} className="accent-blue-500" /> Não faço faturas a este cliente (não lembrar nos Passos do mês)</label></Campo>
            <Campo rot="Não é faturação" largo>
              <label className="inline-flex items-start gap-2 text-sm"><input type="checkbox" checked={ehNaoFaturacao(c)} disabled={/reembolso/i.test(c.nome || '')} onChange={e => set({ naoFaturacao: e.target.checked })} className="accent-blue-500 mt-1" />
                <span>Não é trabalho (ex.: reembolso do IRS) — o dinheiro conta no mês em que entra, mas fica fora da faturação, das metas, do €/h e dos impostos.{/reembolso/i.test(c.nome || '') && <span className={`block text-xs ${sub}`}>Já está assim por ter «reembolso» no nome.</span>}</span>
              </label>
            </Campo>
            <Campo rot={'Tipo de trabalho na fatura ("FOR:") — depois sugere o da última fatura'}><TxtIn valor={fat.paraFatura} onGravar={v => setFat({ paraFatura: v.trim() })} placeholder="ex.: UA Creative Work, Motion Work" className={ic} /></Campo>
            <Campo rot="Próximo nº de fatura (só até fazeres a primeira na app)"><NumIn valor={fat.proxFatura ?? null} placeholder="1" decimal={false} onGravar={v => setFat({ proxFatura: v })} className={ic} /></Campo>
            <Campo rot="IVA na fatura (%)"><NumIn valor={fat.ivaFatura ?? null} placeholder={paisEf === 'PT' ? String(rec.taxaIva != null && rec.taxaIva !== '' ? rec.taxaIva : 23) : '0'} onGravar={v => setFat({ ivaFatura: v })} className={ic} /></Campo>
            <Campo rot={`Nota do IVA na fatura (vazio = ${paisEf === 'PT' ? 'sem frase, por ser cliente português' : 'frase da isenção'}; "-" = nenhuma)`} largo><TxtIn valor={fat.notaIva} onGravar={v => setFat({ notaIva: v })} placeholder={paisEf === 'PT' ? 'Sem frase' : notaIvaPais(paisEf)} className={ic} /></Campo>
          </div>
        </div>

        <div className={caixa}>
          <p className="text-sm font-semibold">Regras dos recibos</p>
          <p className={`text-xs mb-3 ${sub}`}>Quando escolhes este cliente num recibo, o país, o IVA e a retenção vêm já preenchidos.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rot="País do cliente">
              <div className="flex flex-wrap gap-1.5">{PAISES_RECIBO.map(([k, nm]) => <button key={k} type="button" onClick={() => setRec({ pais: k, regime: k === 'Fora UE' ? 'sem' : (rec.regime === 'sem' && paisEf === 'Fora UE' ? 'com' : rec.regime || 'com') })} className={`${chip(paisEf === k)} ${!rec.pais && paisEf === k ? 'border-dashed' : ''}`}>{nm}</button>)}</div>
              {!rec.pais && (
                <p className={`text-xs mt-1.5 ${provPais ? sub : 'text-amber-500'}`}>
                  {provPais ? <>Ainda não escolheste — {provPais.txt} parece {NOME_PAIS_RECIBO[provPais.pais] || provPais.pais}, e é isso que a app usa. <button type="button" onClick={() => setRec({ pais: provPais.pais, regime: rec.regime || (provPais.pais === 'Fora UE' ? 'sem' : 'com') })} className="text-blue-500 hover:underline">Confirmar</button></> : 'Ainda não escolheste, e o NIF/VAT e a morada não o mostram: assumo Portugal (com IVA e retenção).'}
                </p>
              )}
            </Campo>
            <Campo rot="Onde entram os recibos">
              <div className="flex flex-wrap gap-1.5">{[['com', 'Com taxas'], ['sem', 'Sem taxas']].map(([k, nm]) => <button key={k} type="button" onClick={() => setRec({ regime: k })} className={chip(regime === k)}>{nm}</button>)}</div>
            </Campo>
            {paisEf === 'PT' && (
              <>
                <Campo rot="IVA (%)"><NumIn valor={rec.taxaIva ?? null} placeholder="23" onGravar={v => setRec({ taxaIva: v })} className={ic} /></Campo>
                <Campo rot="Retenção na fonte (%)"><NumIn valor={rec.taxaRet ?? null} placeholder="padrão" onGravar={v => setRec({ taxaRet: v })} className={ic} /></Campo>
              </>
            )}
            {paisEf !== 'PT' && <p className={`text-xs sm:col-span-2 ${sub}`}>Fora de Portugal o recibo vai sem IVA nem retenção (autoliquidação / exportação de serviços).</p>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className={caixa}>
          <p className="text-sm font-semibold mb-3">Números de {ano}</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Faturado', eur(n.fatAno), [n.fatDepois ? `+ ${eur(n.fatDepois)} nos próximos meses` : '', n.fatAnt ? `${ano - 1}: ${eur(n.fatAnt)}` : ''].filter(Boolean).join(' · ')],
              ['Por entregar', eur(n.porEntregar), 'tarefas ainda abertas'],
              ['Entregue este mês', eur(n.entregueMes), meses[mesNum - 1]],
              ['Horas', tempoTxt(n.horasAno), n.emCurso ? `${n.emCurso} em curso` : ''],
              ['€/h faturado', n.eurHora ? eur(n.eurHora) : '—', 'faturado ÷ horas registadas'],
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
                <span className={`text-[10px] ${sub}`}>{meses[i].charAt(0)}</span>
              </div>
            ))}
          </div>
        </div>
        <PorTipoPeca estreito linhas={trabPorTipo(trab, cu, clientes, c.id)} cu={cu} claro={claro} sub={sub} caixa={caixa} titulo={`Por tipo de peça — ${c.nome}`} />
        <NotasLigadas lista={notas} onAbrir={onAbrirNota} onNova={onNovaNota ? () => onNovaNota('cliente', c.id, c.nome) : null} claro={claro} sub={sub} caixa={caixa} titulo={`Notas sobre ${c.nome}`} />
        <button type="button" onClick={onIrPrecos} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><IcoT n="lapis" className="w-3.5 h-3.5" /> Preços de {c.nome} →</button>
        <p className={`text-[11px] ${sub}`}>O NIF e a morada ficam só na app — não vão no resumo do chat.</p>
      </div>
    </div>
  );
};
// Quanto tempo levas e quanto ganhas por hora em cada tipo de peça (tarefas feitas por ti, de um só tipo)
const PorTipoPeca = ({ linhas, cu, claro, sub, caixa, titulo, nota, estreito = false }) => {
  if (!linhas || !linhas.length) return null;
  const tipos = tiposDe(cu);
  const nomeT = id => { const x = tipos.find(y => y.id === id); return x ? x.nome : id; };
  const tot = linhas.filter(o => o.valor > 0).reduce((a, o) => ({ v: a.v + o.valor, h: a.h + o.horas }), { v: 0, h: 0 }); // tipos sem preço não entram na média
  const media = tot.h > 0 ? tot.v / tot.h : 0;
  const ls = linhas.slice().sort((a, b) => b.tarefas - a.tarefas);
  // Na coluna estreita da ficha (340px) o nº de tarefas vai ao lado do nome, para o nome caber
  const cols = estreito ? 'grid grid-cols-[minmax(0,1fr)_58px_54px_48px] items-center gap-1.5' : 'grid grid-cols-[minmax(0,1fr)_64px_84px_72px_72px] items-center gap-2';
  return (
    <div className={caixa}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-sm font-semibold">{titulo}</p>
        {media > 0 && <span className={`text-xs ${sub}`} title="€/h pelos preços = o valor das peças (pela tua tabela de preços) ÷ as horas registadas nelas">média {eur(media)}/h pelos preços</span>}
      </div>
      <div className={`${cols} text-[11px] pb-1 border-b ${claro ? 'border-slate-200' : 'border-slate-700'} ${sub}`}>
        <span>Tipo</span>{!estreito && <span className="text-right">Tarefas</span>}<span className="text-right" title="Mediana do tempo por peça">{estreito ? 'Tempo' : 'Tempo/peça'}</span><span className="text-right">€/peça</span><span className="text-right">€/h</span>
      </div>
      {ls.map(o => {
        const baixo = media > 0 && o.valor > 0 && o.tarefas >= 2 && o.eurHora < media * 0.75;
        return (
          <div key={o.tipo} className={`${cols} py-1.5 text-sm tabular-nums border-b last:border-b-0 ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
            {estreito
              ? <span className="min-w-0 flex items-baseline gap-1"><span className="truncate">{nomeT(o.tipo)}</span><span className={`shrink-0 text-[11px] ${sub}`} title={`${o.tarefas} tarefas`}>×{o.tarefas}</span></span>
              : <span className="truncate">{nomeT(o.tipo)}</span>}
            {!estreito && <span className={`text-right ${sub}`}>{o.tarefas}</span>}
            <span className="text-right">{tempoTxt(o.horasPorPeca)}</span>
            <span className={`text-right ${sub}`}>{o.valor > 0 ? eur(o.valorPorPeca) : '—'}</span>
            <span className={`text-right font-medium ${baixo ? 'text-amber-500' : ''}`} title={o.valor <= 0 ? 'Sem preço para este tipo' : baixo ? 'Bem abaixo da tua média: o preço deste tipo pode estar baixo (ou estas peças demoram mais do que contas)' : `${eur(o.valor)} em ${tempoTxt(o.horas)}`}>{o.valor > 0 ? eur(o.eurHora) : '—'}</span>
          </div>
        );
      })}
      <p className={`mt-2 text-[11px] ${sub}`}>{nota || 'Das tarefas feitas por ti (sem as subcontratadas), com tempo registado e de um só tipo de peça.'}</p>
    </div>
  );
};
const ListaClientes = ({ clientes, trab, faturado, ano, mesNum, cu, theme, onAbrir, onNovo, onImportar }) => {
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
        {onImportar && (
          <label className={`px-3 py-1.5 text-xs rounded-lg border cursor-pointer ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`} title="Ficheiro .json com as fichas dos clientes (dados de faturação e preços)">
            Importar fichas
            <input type="file" accept=".json,application/json" className="hidden" onChange={async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onImportar(await f.text()); }} />
          </label>
        )}
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
                <span className={`block text-[11px] truncate ${sub}`}>{c.soTrabalho ? 'sem ficha — falta criar' : [c.recibo && c.recibo.pais, c.estado === 'pausa' ? 'em pausa' : c.estado === 'antigo' ? 'antigo' : '', c.fat && c.fat.nomeLegal].filter(Boolean).join(' · ') || 'sem ficha preenchida'}</span>
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
      <PorTipoPeca linhas={trabPorTipo(trab, cu, clientes)} cu={cu} claro={claro} sub={sub} caixa={`rounded-xl border p-3.5 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`} titulo="Por tipo de peça — todos os clientes" />
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
                      <button type="button" onClick={() => onAbrir(t.id)} className="text-sm text-left hover:underline"><NomeTarefa t={t} cu={TRAB_ATUAL.cu} claro={claro} prefixo="sempre" quebra /></button>
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
          <div className="flex items-baseline justify-between gap-2 mb-2 sm:mb-3">
            <h3 className="font-semibold text-sm">{meses[mesNum - 1]} até agora</h3>
            <span className="sm:hidden text-sm font-semibold tabular-nums">{eur(linhasCli.reduce((a, [, c]) => a + c.v, 0))}</span>
          </div>
          <div className="sm:hidden divide-y divide-white/5">
            {linhasCli.map(([cid, c]) => (
              <div key={cid} className="flex items-center gap-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: corCli(cid) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{nomeCli(cid)}</p>
                  <p className={`text-[11px] truncate ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{c.porDia ? `${c.dias.size} dia${c.dias.size === 1 ? '' : 's'} × ${eur(c.porDia)}` : `${c.n} entregue${c.n === 1 ? '' : 's'}`} · {tempoTxt(c.h)}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{eur(c.v)}</span>
              </div>
            ))}
          </div>
          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-3 gap-2">
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
          <p className="text-sm">Começa por escolher um cliente à esquerda e criar uma pasta (por exemplo "2026" → "6_Mahjong" → "44 - Mahjong - Oct"). Depois escreve as tarefas (as sugestões ajudam): <strong>"2x New Videos - Halloween"</strong>. A app calcula o valor, regista os tempos e faz o orçamento sozinha.</p>
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
const Trabalho = ({ navSub, onNavEmpurrar, onNavSubstituir, trab: trabIn, mudar, modo, clientes: clientesIn, cu, theme, inputClass: icIn, ano, mesNum, showToast, onPrecos, faturado, onCliente, onNovoCliente, onCu, onImportarClientes, calendario, onApagarCliente, onEnviarAnexo, onApagarAnexo, notasDe, onAbrirNota, onNovaNota, recibosDe, onAbrirRecibo, onJuntarRecibo, onCriarReciboFatura, onApagarReciboFatura, onIrMes, taxaReserva, contaDriveRecibos = '', obterRecibo, onImportarRecibo, recibosDrivePend = [], onIgnorarReciboDrive, onSincRecibosDrive, recSinc, cfgRecibosDrive, onCfgRecibosDrive }) => {
  const inputClass = `${icIn || ''} w-full min-w-0`;
  const trab = trabIn || TRAB_VAZIO;
  // Faturas novas no Drive (ex.: guardadas no PC): vê ao abrir, quando voltas a esta janela e de 3 em 3 minutos
  const fdT = trab.faturasDrive || {};
  const refFD = useRef({}); refFD.current = { trab, clientes: clientesIn, mudar, showToast };
  useEffect(() => {
    const raiz = idPastaDrive(fdT.pasta);
    if (!raiz || fdT.auto === false) return undefined;
    const conta = fdT.conta || contaDriveRecibos || '';
    const chave = `${LS_FAT_VISTO}:${raiz}`;
    let parar = false, aCorrer = false, ultima = 0;
    const correr = async () => {
      if (parar || aCorrer || document.hidden || Date.now() - ultima < 40000) return;
      aCorrer = true; ultima = Date.now();
      try {
        let desde = null; try { desde = localStorage.getItem(chave); } catch (e) { /* */ }
        const t0 = desde && !Number.isNaN(Date.parse(desde)) ? Date.parse(desde) - 120000 : Date.now() - 45 * 864e5;
        const R = refFD.current;
        const r = await verificarFaturasDrive({ trab: R.trab, clientes: R.clientes, conta, desde: new Date(t0).toISOString() });
        if (r && !parar) {
          try { localStorage.setItem(chave, r.ate); } catch (e) { /* */ }
          if (r.acoes.length) {
            const R2 = refFD.current;
            const { msgs } = aplicarFaturasDrive(R2.trab, r.acoes, R2.clientes);
            R2.mudar(tr => aplicarFaturasDrive(tr, r.acoes, R2.clientes).tr);
            const nPend = r.acoes.filter(a => a.tipo === 'pend').length;
            const txt = [...msgs, nPend ? `☁ ${nPend} fatura${nPend === 1 ? '' : 's'} no Drive para confirmares (cliente → Faturas)` : ''].filter(Boolean).join(' · ');
            if (txt && R2.showToast) R2.showToast(txt);
          }
        }
      } catch (e) { console.warn('Faturas no Drive:', e); }
      aCorrer = false;
    };
    const tIni = setTimeout(correr, 4000);
    const iv = setInterval(correr, 180000);
    const voltou = () => { if (!document.hidden) setTimeout(correr, 1500); };
    window.addEventListener('focus', voltou); document.addEventListener('visibilitychange', voltou);
    return () => { parar = true; clearTimeout(tIni); clearInterval(iv); window.removeEventListener('focus', voltou); document.removeEventListener('visibilitychange', voltou); };
  }, [fdT.pasta, fdT.conta, fdT.auto, contaDriveRecibos]);
  const claro = useClaro(theme);
  // Conta Google com que os briefs abrem: geral (Trabalho) + a de cada cliente (ficha)
  FREE.lista = trab.freelancers || [];
  TRAB_ATUAL.trab = trab;
  FILA.tema = theme;
  useEffect(() => { filaAvisar(); }, [theme]);
  useEffect(() => { FILA.abrir = id => { if (setTarefaAbertaRef.current) setTarefaAbertaRef.current(id); }; filaAvisar(); return () => { FILA.abrir = null; filaAvisar(); }; }, []);
  TRAB_ATUAL.cu = cu;
  RESERVA.taxa = Number.isFinite(Number(taxaReserva)) ? Number(taxaReserva) : null;
  CONTA_LINKS.padrao = trab.contaGoogle || '';
  CONTA_LINKS.porCliente = {};
  (clientesIn || []).forEach(c => { if (c && c.contaGoogle) CONTA_LINKS.porCliente[String(c.id)] = c.contaGoogle; });
  const clientes = useMemo(() => {
    const app = (clientesIn || []).filter(c => !/reembolso/i.test(c.nome || '')); // os marcados «não é faturação» continuam aqui (para se poder desmarcar)
    const extra = {};
    const ids = new Set((clientesIn || []).map(c => String(c.id)));
    // Pastas de clientes que não existem na app (vindos do ClickUp, ou cujo cliente se perdeu): mostram-se na mesma
    ((trabIn && trabIn.pastas) || []).forEach(p => {
      if (p.cid == null || p.cid === '' || ids.has(String(p.cid)) || extra[p.cid]) return;
      const nome = p.clienteNome || (typeof p.cid === 'string' && p.cid.startsWith('cu:') ? p.cid.slice(3) : '');
      extra[p.cid] = { id: p.cid, nome: nome || 'Cliente sem ficha', cor: '#64748b', soTrabalho: true };
    });
    return [...app, ...Object.values(extra)];
  }, [clientesIn, trabIn]);
  TRAB_ATUAL.clientes = clientes;
  const [sel, setSelEstado] = useState(() => { try { return JSON.parse(localStorage.getItem('trab-sel')) || { tipo: 'geral' }; } catch (e) { return { tipo: 'geral' }; } });
  const historico = useRef([]);
  const irPara = v => { setSelEstado(v); setArvoreMob(false); try { localStorage.setItem('trab-sel', JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
  const setSel = v => { if (JSON.stringify(v) !== JSON.stringify(sel)) { historico.current = [...historico.current.slice(-30), { sel, aba }]; } irPara(v); };
  // Pedidos de outros sítios da app (ex.: o calendário de projetos abre uma lista)
  const setSelRef = useRef(null); setSelRef.current = v => { setSel(v); setAba('tarefas'); };
  useEffect(() => { const f = e => { const d = e.detail; if (!d) return; if (d.tipo && setSelRef.current) setSelRef.current(d); if (d.sel && setSelRef.current) setSelRef.current(d.sel); if (d.tarefa) setTarefaAbertaRef.current(d.tarefa); window.scrollTo({ top: 0 }); }; window.addEventListener('trab-ir', f); return () => window.removeEventListener('trab-ir', f); }, []);
  // Ctrl+K (em qualquer separador): abre os Criativos com a procura pronta a escrever
  const [focarCriativos, setFocarCriativos] = useState(() => { try { const f = localStorage.getItem('criativos-foco') === '1'; localStorage.removeItem('criativos-foco'); return f ? Date.now() : 0; } catch (e) { return 0; } });
  useEffect(() => {
    const f = () => { try { localStorage.removeItem('criativos-foco'); } catch (e) { /* */ } if (setSelRef.current) setSelRef.current({ tipo: 'criativos' }); setTarefaAbertaRef.current(null); setFocarCriativos(Date.now()); };
    const k = e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K') && !e.defaultPrevented) { const el = e.target; if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) { if (!(el.getAttribute && el.getAttribute('aria-label') === 'Procurar tarefas')) return; } e.preventDefault(); f(); } };
    window.addEventListener('trab-criativos', f); window.addEventListener('keydown', k);
    return () => { window.removeEventListener('trab-criativos', f); window.removeEventListener('keydown', k); };
  }, []);
  const [abertas, setAbertas] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('trab-abertas')) || []); } catch (e) { return new Set(); } });
  const alternar = id => setAbertas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('trab-abertas', JSON.stringify([...n])); } catch (e) { /* sem armazenamento */ } return n; });
  const [aba, setAba] = useState(() => { try { const a = localStorage.getItem('trab-aba-inicial'); localStorage.removeItem('trab-aba-inicial'); return a || 'tarefas'; } catch (e) { return 'tarefas'; } });
  // Recuar/avançar da app: cada ecrã (cliente, pasta, separador da ficha) fica no histórico
  const navT = useRef({ primeiro: true, deFora: false, ult: null, desde: Date.now() });
  useEffect(() => {
    const r = navT.current; const sub = { sel, aba }; const k = JSON.stringify(sub);
    if (r.primeiro) { r.primeiro = false; r.ult = k; const tm = setTimeout(() => { if (onNavSubstituir) onNavSubstituir(sub); }, 0); return () => clearTimeout(tm); }
    if (k === r.ult) return undefined;
    r.ult = k;
    if (r.deFora) { r.deFora = false; return undefined; }
    // Escolhas automáticas logo ao abrir não contam como um ecrã novo
    if (Date.now() - r.desde < 1200) { if (onNavSubstituir) onNavSubstituir(sub); return undefined; }
    if (onNavEmpurrar) onNavEmpurrar(sub);
    return undefined;
  }, [sel, aba]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!navSub || !navSub.sub) return;
    const s2 = navSub.sub.sel || { tipo: 'geral' }, a2 = navSub.sub.aba || aba;
    if (JSON.stringify({ sel: s2, aba: a2 }) === navT.current.ult) return;
    navT.current.deFora = true;
    const h = historico.current; if (h.length && JSON.stringify(h[h.length - 1].sel) === JSON.stringify(s2)) historico.current = h.slice(0, -1);
    irPara(s2); setAba(a2);
  }, [navSub]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tarefaAberta, setTarefaAberta] = useState(() => { try { const t = localStorage.getItem('trab-abrir-tarefa'); localStorage.removeItem('trab-abrir-tarefa'); return t || null; } catch (e) { return null; } });
  const setTarefaAbertaRef = useRef(null); setTarefaAbertaRef.current = setTarefaAberta;
  const [procura, setProcura] = useState('');
  const [arvoreMob, setArvoreMob] = useState(false);
  const [secFechadas, setSecFechadas] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('trab-sec-fechadas')) || []); } catch (e) { return new Set(); } });
  const alternarSecao = id => setSecFechadas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('trab-sec-fechadas', JSON.stringify([...n])); } catch (e) { /* */ } return n; });
  const [semArvore, setSemArvore] = useState(() => { try { return localStorage.getItem('trab-sem-arvore') === '1'; } catch (e) { return false; } });
  const alternarArvore = () => setSemArvore(v => { try { localStorage.setItem('trab-sem-arvore', v ? '0' : '1'); } catch (e) { /* sem armazenamento */ } return !v; });
  const ficheiroRef = useRef(null);

  // Estado antigo "Por aprovar" passa a "Por começar"
  useEffect(() => { if ((trab.tarefas || []).some(t => t.estado === 'aprovar')) mudar(tr => ({ ...tr, tarefas: tr.tarefas.map(t => (t.estado === 'aprovar' ? { ...t, estado: 'todo' } : t)) })); }, [trab.tarefas]); // eslint-disable-line react-hooks/exhaustive-deps
  const pasta = sel.tipo === 'pasta' ? (trab.pastas || []).find(p => p.id === sel.id) : null;
  const cidSel = pasta ? pasta.cid : sel.tipo === 'cliente' ? sel.id : null;
  const cliente = clientes.find(c => String(c.id) === String(cidSel));
  useEffect(() => { if (sel.tipo === 'pasta' && !pasta) setSelEstado({ tipo: 'geral' }); }, [sel.tipo, pasta]);
  const freeSel = sel.tipo === 'freelancer' ? (trab.freelancers || []).find(f => f.id === sel.id) : null;
  useEffect(() => { if (sel.tipo === 'freelancer' && !freeSel && modo !== 'carregar') setSelEstado({ tipo: 'freelancers' }); }, [sel.tipo, freeSel, modo]); // eslint-disable-line react-hooks/exhaustive-deps
  NAV_FREE.abrir = id => { setSel({ tipo: 'freelancer', id }); setAba('tarefas'); setTarefaAberta(null); };
  const [aApagarT, setAApagarT] = useState(null);
  APAGAR.pedir = t => setAApagarT(t);
  const apagarTarefaJa = t => {
    const outros = new Set((trab.tarefas || []).filter(o => o.id !== t.id).flatMap(o => (o.anexos || []).map(a => a.caminho)).filter(Boolean));
    (t.anexos || []).forEach(a => { if (a.caminho && !outros.has(a.caminho) && onApagarAnexo) onApagarAnexo(a.caminho); });
    mudar(tr => ({ ...tr, tarefas: (tr.tarefas || []).filter(x => x.id !== t.id) }));
    if (tarefaAberta === t.id) setTarefaAberta(null);
    setAApagarT(null);
    if (showToast) showToast('Tarefa apagada');
  };

  const abertasPorPasta = useMemo(() => {
    const m = {};
    (trab.tarefas || []).forEach(t => { if (t.estado !== 'feito' && t.pastaId) m[t.pastaId] = (m[t.pastaId] || 0) + 1; });
    return m;
  }, [trab.tarefas]);
  const contar = id => descendentes(trab, id).reduce((a, x) => a + (abertasPorPasta[x] || 0), 0);

  const [filtroTodas, setFiltroTodasEstado] = useState(() => { try { return { cid: '', feitas: '30', ...(JSON.parse(localStorage.getItem('trab-todas')) || {}) }; } catch (e) { return { cid: '', feitas: '30' }; } });
  const setFiltroTodas = f => { setFiltroTodasEstado(f); try { localStorage.setItem('trab-todas', JSON.stringify(f)); } catch (e) { /* sem armazenamento */ } };
  const desde30 = trabDia(new Date(Date.now() - 30 * 86400000).toISOString());
  let tarefas = [];
  if (pasta) { const ids = new Set(descendentes(trab, pasta.id)); tarefas = (trab.tarefas || []).filter(t => ids.has(t.pastaId)); }
  else if (sel.tipo === 'cliente') tarefas = (trab.tarefas || []).filter(t => String(t.cid) === String(sel.id));
  else if (freeSel) tarefas = tarefasDoFreelancer(trab, freeSel);
  else if (sel.tipo === 'todas') tarefas = (trab.tarefas || []).filter(t => (!filtroTodas.cid || String(t.cid) === String(filtroTodas.cid))
    && (t.estado !== 'feito' || filtroTodas.feitas === 'todas' || (filtroTodas.feitas === '30' && trabDia(t.feita || t.review || t.criada || '') >= desde30)));
  if (procura.trim()) {
    const q = procura.trim().toLowerCase();
    tarefas = (pasta || sel.tipo === 'cliente' || sel.tipo === 'todas' || freeSel ? tarefas : (trab.tarefas || [])).filter(t => t.nome.toLowerCase().includes(q));
  }
  const ordenar = l => l.slice().sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999') || String(a.criada).localeCompare(String(b.criada)));
  tarefas = ordenar(tarefas);

  // Cartões do Trello: se foi apagado ou arquivado lá, a tarefa deixa de estar ligada; se mudou de lista ou de quadro, continua.
  // Tarefas que perderam a ligação mas cujo Drive se lembra do cartão voltam a ficar ligadas. (Ao abrir a lista e ao voltar à app.)
  const comTrello = tarefas.filter(t => (t.trello && t.trello.id) || cartaoLembrado(t));
  const chaveTrello = comTrello.map(t => t.id + ((t.trello && t.trello.id) || cartaoLembrado(t))).join(',');
  const [focoTic, setFocoTic] = useState(0);
  const [, setTrelloTic] = useState(0);
  useEffect(() => { const f = () => { cacheCartoes.clear(); setFocoTic(x => x + 1); }; window.addEventListener('focus', f); return () => window.removeEventListener('focus', f); }, []);
  useEffect(() => {
    if (!comTrello.length) return undefined;
    let vivo = true;
    (async () => {
      const ligado = t => (t.trello && t.trello.id) || null;
      // 1) os cartões abertos dos quadros dos jogos (um pedido por quadro)
      const quadros = [...new Set(comTrello.map(t => { const j = jogoDaTarefa(trab, t); return j && !j.semJogo && j.trello ? j.trello : null; }).filter(Boolean))];
      const abertos = new Map();
      for (const q of quadros) {
        try {
          (await cartoesTrello(q)).forEach(c => { abertos.set(c.id, c); TRELLO_ESTADO.cartaoLista[c.id] = c.lista; TRELLO_ESTADO.cartaoQuadro[c.id] = q; });
          await listasTrello(q).catch(() => ({}));
        } catch (e) { return; }
      }
      if (!vivo) return;
      setTrelloTic(x => x + 1);
      // 2) os que não aparecem nos quadros: pergunta ao Trello por cada um (pode ter mudado de quadro)
      const duvidas = [...new Set(comTrello.map(t => ligado(t) || cartaoLembrado(t)).filter(id => id && !abertos.has(id)))];
      const estado = new Map();
      if (duvidas.length) {
        try { const r = await chamarTrello('estado', { cartoes: duvidas }); (r.cartoes || []).forEach(x => estado.set(x.id, x)); }
        catch (e) { return; } // sem ligação (ou functions antigas): não mexe em nada
      }
      if (!vivo) return;
      const mudancas = {};
      comTrello.forEach(t => {
        const id = ligado(t) || cartaoLembrado(t);
        const c = abertos.get(id) || (estado.get(id) && estado.get(id).existe && !estado.get(id).fechado ? estado.get(id) : null);
        const morto = !abertos.has(id) && estado.get(id) && (estado.get(id).existe === false || estado.get(id).fechado);
        if (ligado(t) && morto) mudancas[t.id] = null;
        else if (!ligado(t) && c) mudancas[t.id] = { id: c.id, url: c.url || `https://trello.com/c/${c.id}`, nome: c.nome || '' };
      });
      if (Object.keys(mudancas).length) mudar(tr => ({ ...tr, tarefas: (tr.tarefas || []).map(t => (t.id in mudancas ? { ...t, trello: mudancas[t.id], trelloSolto: !mudancas[t.id] } : t)) }));
    })();
    return () => { vivo = false; };
  }, [chaveTrello, focoTic]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spreadsheet: se apagaste (ou juntaste) uma linha à mão, o ícone acompanha — confere a coluna A ao abrir a lista e ao voltar à app
  const comFolhaT = tarefas.filter(t => { const j = jogoDaTarefa(trab, t); return j && !j.semJogo && j.sheet && versoesDrive(t.drive).some(d => d.nomeBase && d.folha && d.folha.tab); });
  const chaveFolha = comFolhaT.map(t => t.id + ':' + versoesDrive(t.drive).map(d => `${d.nomeBase}${d.folha && d.folha.ok ? d.folha.linha : '-'}`).join('/')).join(',');
  useEffect(() => {
    if (!comFolhaT.length) return undefined;
    let vivo = true;
    (async () => {
      const mud = {};
      for (const t of comFolhaT) {
        const j = jogoDaTarefa(trab, t); const conta = contaDe(t.cid);
        const tk = tokenGuardadoDe(conta) || (ligadoSempre(conta || '_') ? await tokenDrive(conta).catch(() => null) : null);
        if (!tk || !vivo) continue;
        const acerta = async d => {
          if (!d || !d.nomeBase || !d.folha || !d.folha.tab) return d;
          let nomes; try { nomes = await linhasDaFolha(tk, j.sheet, d.folha.tab, false); } catch (e) { return d; }
          if (!nomes) return d;
          const linha = nomes.get(String(d.nomeBase).trim().toUpperCase());
          if (linha && !(d.folha.ok && d.folha.linha === linha)) return { ...d, folha: { ...d.folha, ok: true, linha, erro: undefined } };
          if (!linha && d.folha.ok) return { ...d, folha: { ...d.folha, ok: false, linha: null, tirada: true } };
          return d;
        };
        const novo = await acerta(t.drive);
        const ant = t.drive && t.drive.anteriores ? await Promise.all(t.drive.anteriores.map(acerta)) : null;
        const mudou = novo !== t.drive || (ant && ant.some((x, i) => x !== t.drive.anteriores[i]));
        if (mudou) mud[t.id] = { ...novo, ...(ant ? { anteriores: ant } : {}) };
      }
      if (vivo && Object.keys(mud).length) mudar(tr => ({ ...tr, tarefas: (tr.tarefas || []).map(x => (x.id in mud ? { ...x, drive: mud[x.id] } : x)) }));
    })();
    return () => { vivo = false; };
  }, [chaveFolha, focoTic]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pedir, setPedir] = useState(null); // { titulo, valor, ok }
  // Menu "⋯" da pasta (subpasta, nome, cor, apagar) — o cabeçalho fica numa linha só
  const [menuPasta, setMenuPasta] = useState(false);
  useEffect(() => {
    if (!menuPasta) return undefined;
    const fechar = e => { if (!(e.target.closest && e.target.closest('[data-menu-pasta]'))) setMenuPasta(false); };
    const esc = e => { if (e.key === 'Escape') setMenuPasta(false); };
    document.addEventListener('mousedown', fechar); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fechar); document.removeEventListener('keydown', esc); };
  }, [menuPasta]);
  const novaPasta = (cid, paiId) => setPedir({ titulo: paiId ? 'Nome da subpasta' : 'Nome da pasta', valor: '', ok: nome => {
    let novoId = null;
    mudar(tr => { const [n, id] = opNovaPasta(tr, { cid, paiId, nome }); novoId = id; return opAutoJogo(n, id); });
    if (paiId) setAbertas(prev => new Set([...prev, paiId]));
    setTimeout(() => { if (novoId) setSel({ tipo: 'pasta', id: novoId }); }, 0);
  } });
  const renomearPasta = (id, nome) => mudar(tr => opAutoJogo(opPasta(tr, id, { nome }), id));
  const jogoPasta = pasta ? jogoDaTarefa(trab, { pastaId: pasta.id }) : null;
  const jogoTrello = jogoPasta && !jogoPasta.semJogo && jogoPasta.trello ? jogoPasta : null;
  const criarTarefa = (txt, prazo, pecas, op = {}) => {
    if (!pasta) return;
    const id = trabId();
    mudar(tr => opNovaTarefa(tr, { id, pastaId: pasta.id, cid: pasta.cid, nome: txt, prazo, pecas }));
    if (op.trello && jogoTrello) {
      const nome = nomeCartaoTarefa(jogoTrello, { nome: txt.trim(), pecas: pecas || undefined, ficheiros: {} });
      criarCartaoTrello(jogoTrello, nome)
        .then(r => { mudar(tr => opTarefa(tr, id, x => ({ ...x, trello: { id: r.id, url: r.url, nome: r.nome }, trelloSolto: false }))); if (showToast) showToast(r.jaExistia ? 'Já havia um cartão no Trello com este nome — ficou ligado.' : 'Cartão criado no Trello'); })
        .catch(e => { if (showToast) showToast(`Tarefa criada, mas o Trello falhou: ${e.message || e}`, 'error'); });
    }
  };
  const importar = async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (modo === 'g' && !await confirmar('Ainda não tens a regra do Firestore para o Trabalho, por isso tudo fica no documento principal (que tem um limite de 1 MB). Importar o ClickUp ocupa ~200 KB. Queres importar mesmo assim?')) return;
    try {
      const [n, np, nt, nu] = await importarFicheiro(f, trab, clientes);
      mudar(() => n);
      showToast && showToast(np || nt || nu ? `Importado: ${np} pastas e ${nt} tarefas novas${nu ? ` · ${nu} tarefas com tempos atualizados` : ''}` : 'Nada de novo para importar', 'success');
    } catch (err) { showToast && showToast(err.message || 'Não consegui ler o ficheiro', 'error'); }
  };

  const tarefaSel = (trab.tarefas || []).find(t => t.id === tarefaAberta);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const seta = fechada => <svg width="10" height="10" viewBox="0 0 12 12" className={`shrink-0 transition-transform ${sub}`} style={{ transform: fechada ? 'none' : 'rotate(90deg)' }} aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  const cabSecao = (id, txt, extra = '') => (
    <button type="button" onClick={() => alternarSecao(id)} aria-expanded={!secFechadas.has(id)} className={`w-full flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-left rounded-md ${sub} ${claro ? 'hover:text-slate-700' : 'hover:text-slate-200'} ${extra}`}>
      {seta(secFechadas.has(id))}{txt}
    </button>
  );

  const arvore = (
    <div className="space-y-3">
      <button type="button" onClick={() => setSel({ tipo: 'geral' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left ${sel.tipo === 'geral' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <IcoT n="casa" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Visão geral
      </button>
      <button type="button" onClick={() => setSel({ tipo: 'todas' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'todas' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <IcoT n="todas" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Todas as tarefas
      </button>
      <button type="button" onClick={() => setSel({ tipo: 'timesheet' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'timesheet' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <IcoT n="relogio" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Timesheet
      </button>
      <button type="button" onClick={() => setSel({ tipo: 'criativos' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'criativos' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <IcoT n="criativos" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Criativos
      </button>
      {calendario && (
        <button type="button" onClick={() => setSel({ tipo: 'calendario' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'calendario' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <IcoT n="calendario" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Calendário de projetos
        </button>
      )}
      {onCliente && (
        <button type="button" onClick={() => setSel({ tipo: 'clientes' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'clientes' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <IcoT n="pessoas" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Clientes
        </button>
      )}
      <div className={`flex items-center rounded-lg !mt-0.5 ${sel.tipo === 'freelancers' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <button type="button" onClick={() => setSel({ tipo: 'freelancers' })} className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-sm text-left">
          <IcoT n="freelancer" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Freelancers
        </button>
        {(trab.freelancers || []).some(f => f.estado !== 'antigo') && <button type="button" onClick={() => alternarSecao('freelancers')} aria-expanded={!secFechadas.has('freelancers')} title={secFechadas.has('freelancers') ? 'Mostrar os freelancers' : 'Esconder os freelancers'} className={`shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md ${claro ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`}>{seta(secFechadas.has('freelancers'))}</button>}
      </div>
      {!secFechadas.has('freelancers') && (trab.freelancers || []).filter(f => f.estado !== 'antigo').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt')).map(f => {
        const n = tarefasDoFreelancer(trab, f).filter(t => t.estado !== 'feito').length;
        const ativo = sel.tipo === 'freelancer' && sel.id === f.id;
        return (
          <button key={f.id} type="button" onClick={() => NAV_FREE.abrir(f.id)} className={`w-full flex items-center gap-2 pl-8 pr-2 py-1 rounded-lg text-[13px] text-left !mt-0 ${ativo ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: corFreelancer(f) }} />
            <span className="flex-1 min-w-0 truncate">{f.nome}</span>
            {n > 0 && <span className={`text-[11px] tabular-nums ${sub}`}>{n}</span>}
          </button>
        );
      })}
      {onCu && onPrecos && (
        <button type="button" onClick={() => setSel({ tipo: 'tipos' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'tipos' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <IcoT n="etiqueta" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Tipos e preços
        </button>
      )}
      {(trab.favoritos || []).length > 0 && (
        <div>
          {cabSecao('favoritos', 'Favoritos', 'mb-1')}
          {!secFechadas.has('favoritos') && (trab.favoritos || []).map(id => (trab.pastas || []).find(p => p.id === id)).filter(Boolean).map(p => {
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
      {cabSecao('clientes', 'Clientes', '-mb-1')}
      {!secFechadas.has('clientes') && clientes.filter(c => c.estado !== 'antigo' || (sel.tipo === 'cliente' && String(sel.id) === String(c.id)) || (pasta && String(pasta.cid) === String(c.id))).map(c => {
        const raiz = filhasDe(trab, null, c.id);
        const ativo = sel.tipo === 'cliente' && String(sel.id) === String(c.id);
        const fechado = abertas.has('cli-fechado:' + c.id);
        return (
          <div key={c.id}>
            <div className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg ${ativo ? (claro ? 'bg-slate-200/70' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              {raiz.length > 0 && <button type="button" onClick={() => alternar('cli-fechado:' + c.id)} className={`-ml-1 w-4 h-6 inline-flex items-center justify-center ${claro ? 'text-slate-400' : 'text-slate-500'}`} aria-label={fechado ? `Abrir ${c.nome}` : `Fechar ${c.nome}`}>
                <svg width="9" height="9" viewBox="0 0 10 10" style={{ transform: fechado ? 'none' : 'rotate(90deg)', transition: 'transform .15s' }} aria-hidden="true"><path d="M3 1.5 7 5l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>}
              <button type="button" onClick={() => setSel({ tipo: 'cliente', id: c.id })} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: c.cor || '#64748b' }}>{String(c.nome || '?').charAt(0).toUpperCase()}</span>
                <span className="text-sm font-semibold truncate">{c.nome}</span>
              </button>
              <button type="button" onClick={() => novaPasta(c.id, null)} className={`w-6 h-6 rounded-md text-base leading-none ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`} title="Nova pasta" aria-label={`Nova pasta em ${c.nome}`}>+</button>
            </div>
            {!fechado && <div className="ml-1">{raiz.map(p => <NoPasta key={p.id} p={p} trab={trab} nivel={0} sel={sel} setSel={setSel} abertas={abertas} alternar={alternar} theme={theme} contar={contar} onFav={id => mudar(tr => opFavorito(tr, id))} onSub={pp => novaPasta(pp.cid, pp.id)} onRenomear={renomearPasta} />)}</div>}
          </div>
        );
      })}
      {!clientes.length && <p className={`text-xs ${sub}`}>Adiciona primeiro os teus clientes em Clientes (em cima).</p>}
    </div>
  );

  const titulo = pasta ? pasta.nome : sel.tipo === 'cliente' ? (cliente ? cliente.nome : 'Cliente') : sel.tipo === 'timesheet' ? 'Timesheet' : sel.tipo === 'todas' ? 'Todas as tarefas' : sel.tipo === 'criativos' ? 'Criativos' : sel.tipo === 'clientes' ? 'Clientes' : sel.tipo === 'tipos' ? 'Tipos de tarefa e preços' : sel.tipo === 'freelancers' ? 'Freelancers' : freeSel ? freeSel.nome : sel.tipo === 'calendario' ? 'Calendário de projetos' : 'Visão geral';
  const migalhas = pasta ? [cliente ? cliente.nome : '', ...caminho(trab, pasta.id).slice(0, -1).map(p => p.nome)].filter(Boolean) : [];
  const notasAlvo = pasta ? (pasta.notas || []) : sel.tipo === 'cliente' ? ((trab.notasCliente || {})[sel.id] || []) : [];
  const mudarNotas = notas => mudar(tr => (pasta ? opPasta(tr, pasta.id, { notas }) : { ...tr, notasCliente: { ...(tr.notasCliente || {}), [sel.id]: notas } }));
  const abas = pasta ? [['tarefas', 'Tarefas'], ['notas', 'Notas e reuniões'], ['orcamento', 'Orçamento']] : sel.tipo === 'cliente' ? [...(onCliente ? [['ficha', 'Ficha']] : []), ...(recibosDe ? [['recibos', 'Recibos']] : []), ...(onCliente ? [['faturas', 'Faturas']] : []), ['tarefas', 'Tarefas'], ['jogos', 'Jogos'], ['notas', 'Notas e reuniões'], ['precos', 'Preços']] : [];
  const abaAtual = abas.some(a => a[0] === aba) ? aba : 'tarefas';
  const valorAberto = tarefas.filter(t => t.estado !== 'feito').reduce((a, t) => a + trabValor(t, cu, clientes), 0);
  const horasTot = tarefas.reduce((a, t) => a + trabHoras(t), 0);

  // Pastas de ano (raiz) que ainda têm subpastas que não são meses → podem ser organizadas por meses
  const porOrganizar = p => p && !p.mesNum && (!p.paiId || /^\s*\d{4}\s*$/.test(p.nome)) && (trab.pastas || []).some(f => f.paiId === p.id && !f.mesNum);
  const anosPorOrganizar = sel.tipo === 'cliente' ? filhasDe(trab, null, sel.id).filter(porOrganizar) : [];
  const listasSemJogo = sel.tipo === 'cliente' ? (trab.pastas || []).filter(p => String(p.cid) === String(sel.id) && !p.jogoId && !p.mesNum && ehListaDeJogo(p.nome) && !(trab.pastas || []).some(f => f.paiId === p.id)).length : 0;
  const organizarCliente = async () => {
    const planos = anosPorOrganizar.map(p => ({ p, n: planoPorMeses(trab, p.id).length }));
    if (await confirmar(`Organizar por meses: ${planos.map(x => `${x.p.nome} (${x.n} listas)`).join(', ')}?\n\nCada lista vai para a pasta do mês dela. As pastas por jogo que ficarem vazias desaparecem. As tarefas não mudam.`)) mudar(tr => anosPorOrganizar.reduce((acc, p) => opPorMeses(acc, p.id), tr));
  };

  // Voltar: ao ecrã anterior (ou, se não houver, à pasta de cima / ao cliente)
  const podeVoltar = historico.current.length > 0 || !!pasta || sel.tipo !== 'geral';
  const voltar = () => {
    const h = historico.current;
    if (h.length && onNavEmpurrar) { try { window.history.back(); return; } catch (e) { /* segue abaixo */ } }
    if (h.length) { const ant = h[h.length - 1]; historico.current = h.slice(0, -1); irPara(ant.sel); if (ant.aba) setAba(ant.aba); return; }
    if (pasta && pasta.paiId) irPara({ tipo: 'pasta', id: pasta.paiId });
    else if (pasta) irPara({ tipo: 'cliente', id: pasta.cid });
    else irPara({ tipo: 'geral' });
  };

  if (modo === 'carregar') return <div className="py-16 text-center text-slate-400 text-sm">A carregar o teu trabalho…</div>;

  return (
    <div className="space-y-3">
      <div className="lg:hidden space-y-2">
        {/* Telemóvel: o menu do Trabalho sempre à mão, numa barra que desliza para o lado */}
        {(() => {
          const chip = ativo => `shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap border ${ativo ? 'bg-blue-600 border-blue-600 text-white font-medium' : claro ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-800/70 border-slate-700 text-slate-200'}`;
          const sepM = <span className={`shrink-0 w-px h-5 self-center ${claro ? 'bg-slate-300' : 'bg-slate-700'}`} />;
          const favs = (trab.favoritos || []).map(id => (trab.pastas || []).find(p => p.id === id)).filter(Boolean);
          const frees = (trab.freelancers || []).filter(f => f.estado !== 'antigo').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
          const clis = clientes.filter(c => c.estado !== 'antigo');
          const ic = n => <IcoT n={n} className="w-3.5 h-3.5 opacity-80" />;
          return (
            <nav aria-label="Menu do Trabalho" className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button type="button" onClick={() => setArvoreMob(!arvoreMob)} aria-expanded={arvoreMob} className={chip(arvoreMob)}><IcoT n="pasta" className="w-3.5 h-3.5" /> Pastas</button>
              {sepM}
              <button type="button" onClick={() => setSel({ tipo: 'geral' })} className={chip(sel.tipo === 'geral')}>{ic('casa')} Visão geral</button>
              <button type="button" onClick={() => setSel({ tipo: 'todas' })} className={chip(sel.tipo === 'todas')}>{ic('todas')} Todas</button>
              <button type="button" onClick={() => setSel({ tipo: 'timesheet' })} className={chip(sel.tipo === 'timesheet')}>{ic('relogio')} Timesheet</button>
              <button type="button" onClick={() => setSel({ tipo: 'criativos' })} className={chip(sel.tipo === 'criativos')}>{ic('criativos')} Criativos</button>
              {calendario && <button type="button" onClick={() => setSel({ tipo: 'calendario' })} className={chip(sel.tipo === 'calendario')}>{ic('calendario')} Calendário</button>}
              {favs.length > 0 && sepM}
              {favs.map(p => <button key={p.id} type="button" onClick={() => setSel({ tipo: 'pasta', id: p.id })} className={chip(sel.tipo === 'pasta' && sel.id === p.id)}><span className="w-2 h-2 rounded-[3px]" style={{ background: p.cor || '#64748b' }} />{p.nome}{contar(p.id) > 0 && <span className="opacity-70 tabular-nums">{contar(p.id)}</span>}</button>)}
              {clis.length > 0 && sepM}
              {clis.map(c => <button key={c.id} type="button" onClick={() => setSel({ tipo: 'cliente', id: c.id })} className={chip(sel.tipo === 'cliente' && String(sel.id) === String(c.id))}><span className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c.cor || '#64748b' }}>{String(c.nome || '?').charAt(0).toUpperCase()}</span>{c.nome}</button>)}
              {sepM}
              {onCliente && <button type="button" onClick={() => setSel({ tipo: 'clientes' })} className={chip(sel.tipo === 'clientes')}>{ic('pessoas')} Clientes</button>}
              <button type="button" onClick={() => setSel({ tipo: 'freelancers' })} className={chip(sel.tipo === 'freelancers')}>{ic('freelancer')} Freelancers</button>
              {frees.map(f => <button key={f.id} type="button" onClick={() => NAV_FREE.abrir(f.id)} className={chip(sel.tipo === 'freelancer' && sel.id === f.id)}><span className="w-2 h-2 rounded-full" style={{ background: corFreelancer(f) }} />{f.nome}</button>)}
              {onCu && onPrecos && <button type="button" onClick={() => setSel({ tipo: 'tipos' })} className={chip(sel.tipo === 'tipos')}>{ic('etiqueta')} Tipos e preços</button>}
            </nav>
          );
        })()}
        <input value={procura} onChange={e => setProcura(e.target.value)} placeholder="Procurar tarefas…" className={`${inputClass} w-full text-sm py-2`} />
      </div>
      <input ref={ficheiroRef} type="file" accept=".json,application/json" className="hidden" onChange={importar} />
      {modo === 'g' && <p className="text-[11px] text-amber-400" title="As regras do Firestore ainda não deixam gravar à parte. Os dados ficam no documento principal.">a gravar no documento principal</p>}
      <div className={`grid grid-cols-1 gap-5 items-start ${semArvore ? '' : 'lg:grid-cols-[330px_minmax(0,1fr)]'}`}>
        <div className={`${arvoreMob ? 'block' : 'hidden'} ${semArvore ? 'lg:hidden' : 'lg:block'} lg:sticky lg:top-[150px] space-y-2`}>
          <div className="hidden lg:flex items-center gap-2">
                    <button type="button" onClick={alternarArvore} title={semArvore ? 'Mostrar as pastas' : 'Esconder as pastas (mais espaço para as tarefas)'} aria-label={semArvore ? 'Mostrar as pastas' : 'Esconder as pastas'}
          className={`inline-flex shrink-0 w-9 h-9 items-center justify-center rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100 text-slate-500' : 'border-slate-700 hover:bg-white/5 text-slate-400'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />{semArvore ? <path d="m13 10 2 2-2 2" /> : <path d="m16 10-2 2 2 2" />}</svg>
        </button>
            <input value={procura} onChange={e => setProcura(e.target.value)} placeholder="Procurar tarefas…" aria-label="Procurar tarefas" className={`${inputClass} flex-1 min-w-0 text-sm py-2`} />
          </div>
          <aside className={`rounded-2xl border p-2 lg:max-h-[calc(100vh-220px)] overflow-y-auto ${claro ? 'bg-white/80 border-slate-200' : 'bg-slate-800/50 border-slate-700/50'}`}>{arvore}</aside>
        </div>
        <section className="min-w-0 space-y-3">
          {semArvore && (
            <div className="hidden lg:flex items-center gap-2 max-w-md">
                      <button type="button" onClick={alternarArvore} title={semArvore ? 'Mostrar as pastas' : 'Esconder as pastas (mais espaço para as tarefas)'} aria-label={semArvore ? 'Mostrar as pastas' : 'Esconder as pastas'}
          className={`inline-flex shrink-0 w-9 h-9 items-center justify-center rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100 text-slate-500' : 'border-slate-700 hover:bg-white/5 text-slate-400'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />{semArvore ? <path d="m13 10 2 2-2 2" /> : <path d="m16 10-2 2 2 2" />}</svg>
        </button>
              <input value={procura} onChange={e => setProcura(e.target.value)} placeholder="Procurar tarefas…" aria-label="Procurar tarefas" className={`${inputClass} flex-1 min-w-0 text-sm py-2`} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-0 w-full sm:w-auto sm:flex-1">
              {migalhas.length > 0 && <p className={`text-xs truncate ${sub} ${podeVoltar ? 'pl-9' : ''}`}>{migalhas.join(' / ')}</p>}
              <div className="flex items-center gap-2">
                {podeVoltar && <button type="button" onClick={voltar} className={`-ml-1 w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg ${claro ? 'hover:bg-slate-200/70 text-slate-600' : 'hover:bg-white/10 text-slate-300'}`} title="Voltar" aria-label="Voltar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                </button>}
                {pasta && <span className="w-3 h-3 rounded" style={{ background: pasta.cor }} />}
                {freeSel && <span className="w-3 h-3 rounded-full" style={{ background: corFreelancer(freeSel) }} />}
                <h2 className="text-xl font-bold truncate">{titulo}</h2>
                {pasta && (
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <button type="button" onClick={() => mudar(tr => opFavorito(tr, pasta.id))} aria-pressed={(trab.favoritos || []).includes(pasta.id)} title={(trab.favoritos || []).includes(pasta.id) ? 'Tirar dos favoritos' : 'Pôr nos favoritos'} aria-label="Favorito"
                      className={`w-7 h-7 inline-flex items-center justify-center rounded-lg text-base ${(trab.favoritos || []).includes(pasta.id) ? 'text-amber-400' : `${sub} ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`}`}>{(trab.favoritos || []).includes(pasta.id) ? '★' : '☆'}</button>
                    {!pasta.paiId && (
                            <select value={String(pasta.cid ?? '')} onChange={e => { const v = e.target.value; const c = clientes.find(x => String(x.id) === v); if (c) mudar(tr => opMudarCliente(tr, pasta.id, c.id)); }}
                              className={`text-xs rounded-lg border px-2 py-1 bg-transparent ${claro ? 'border-slate-200' : 'border-slate-700'}`} title="Cliente desta pasta">
                              {clientes.map(c => <option key={c.id} value={String(c.id)} className={claro ? '' : 'bg-slate-800'}>{c.nome}</option>)}
                            </select>
                          )}
                    {!pasta.mesNum && !(trab.pastas || []).some(f => f.paiId === pasta.id) && (trab.jogos || []).some(j => String(j.cid) === String(pasta.cid)) && (
                            <select value={pasta.jogoId || ''} onChange={e => { const j = (trab.jogos || []).find(x => x.id === e.target.value); mudar(tr => opPasta(tr, pasta.id, j ? { jogoId: j.id, cor: j.cor } : { jogoId: null })); }}
                              className={`text-xs rounded-lg border px-2 py-1 bg-transparent ${claro ? 'border-slate-200' : 'border-slate-700'}`} title="Jogo desta lista">
                              <option value="" className={claro ? '' : 'bg-slate-800'}>Sem jogo</option>
                              {(trab.jogos || []).filter(j => String(j.cid) === String(pasta.cid)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt')).map(j => <option key={j.id} value={j.id} className={claro ? '' : 'bg-slate-800'}>Jogo: {j.nome}</option>)}
                            </select>
                          )}
                    <div className="relative" data-menu-pasta="1">
                      <button type="button" onClick={() => setMenuPasta(v => !v)} aria-expanded={menuPasta} aria-label="Mais opções da pasta" title="Subpasta, nome, cor, apagar"
                        className={`w-7 h-7 inline-flex items-center justify-center rounded-lg ${sub} ${menuPasta ? (claro ? 'bg-slate-200/70' : 'bg-white/10') : claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                      </button>
                      {menuPasta && (
                        <div className={`absolute left-0 top-full mt-1 z-40 w-56 rounded-xl border shadow-2xl py-1 ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`} role="menu">
                          <button type="button" role="menuitem" onClick={() => { setMenuPasta(false); novaPasta(pasta.cid, pasta.id); }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>+ Subpasta</button>
                          <button type="button" role="menuitem" onClick={() => { setMenuPasta(false); setPedir({ titulo: 'Novo nome da pasta', valor: pasta.nome, ok: n => mudar(tr => opAutoJogo(opPasta(tr, pasta.id, { nome: n }), pasta.id)) }); }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Mudar o nome</button>
                          {porOrganizar(pasta) && <button type="button" role="menuitem" onClick={async () => { setMenuPasta(false);
                  const plano = planoPorMeses(trab, pasta.id);
                  const porMes = {}; plano.slice().sort((a, b) => (a.mes || 99) - (b.mes || 99)).forEach(x => { const n = x.mes ? MESES_NOMES[x.mes - 1] : 'Sem mês'; porMes[n] = (porMes[n] || 0) + 1; });
                  const resumo = Object.entries(porMes).map(([n, q]) => `${n}: ${q}`).join(', ');
                  if (await confirmar(`Organizar "${pasta.nome}" por meses?\n\n${plano.length} listas vão para pastas de mês (${resumo}). As pastas por jogo que ficarem vazias desaparecem. As tarefas não mudam.`)) mudar(tr => opPorMeses(tr, pasta.id));
                }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}><IcoT n="calendario" className="w-3.5 h-3.5" /> Organizar por meses</button>}
                          <div className="px-3 py-2">
                            <p className={`text-xs mb-1.5 ${sub}`}>Cor</p>
                            <div className="flex flex-wrap gap-1.5">
                              {CORES_PASTA.map(c => <button key={c} type="button" onClick={() => mudar(tr => opPasta(tr, pasta.id, { cor: c }))} className={`w-5 h-5 rounded ${pasta.cor === c ? `ring-2 ring-offset-1 ${claro ? 'ring-slate-500 ring-offset-white' : 'ring-white/70 ring-offset-slate-800'}` : ''}`} style={{ background: c }} aria-label="Cor da pasta" />)}
                            </div>
                          </div>
                          <div className={`my-1 border-t ${claro ? 'border-slate-100' : 'border-slate-700'}`} />
                          <button type="button" role="menuitem" onClick={async () => { setMenuPasta(false); const n = descendentes(trab, pasta.id).length - 1; const nt = tarefas.length; const idsP = new Set(descendentes(trab, pasta.id)); const daqui = (trab.tarefas || []).filter(x => idsP.has(x.pastaId)); const nFat = daqui.filter(x => x.faturaId && x.faturaId !== 'fora').length; const hP = daqui.reduce((a, x) => a + trabHoras(x), 0); if (await confirmar(`Apagar "${pasta.nome}"${n ? `, ${n} subpasta${n === 1 ? '' : 's'}` : ''}${nt ? ` e ${nt} tarefa${nt === 1 ? '' : 's'}` : ''}?${nFat || hP >= 0.5 ? `\n\nAtenção: vão também ${nFat ? `${nFat} tarefa${nFat === 1 ? '' : 's'} já faturada${nFat === 1 ? '' : 's'}` : ''}${nFat && hP >= 0.5 ? ' e ' : ''}${hP >= 0.5 ? `${tempoTxt(hP)} de horas registadas` : ''}. As faturas e as receitas não mudam, mas deixam de ter as tarefas ligadas.` : ''}`)) { mudar(tr => opApagarPasta(tr, pasta.id)); setSel({ tipo: 'geral' }); } }} className="w-full px-3 py-2 text-sm text-left text-red-400 hover:bg-red-500/10">Apagar pasta</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {freeSel && (() => {
              const abertas = tarefas.filter(t => t.estado !== 'feito');
              const custoAberto = abertas.reduce((a, t) => a + (Number(t.custoOutsourcing) || 0), 0);
              const doAno = tarefas.filter(t => trabEntrega(t).startsWith(`${ano}-`));
              const pagoAno = doAno.reduce((a, t) => a + (Number(t.custoOutsourcing) || 0), 0);
              const margemAno = doAno.reduce((a, t) => a + trabValor(t, cu, clientes), 0) - pagoAno;
              const forte = claro ? 'text-slate-800' : 'text-slate-100';
              return (
                <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${sub}`}>
                  <span><strong className={forte}>{abertas.length}</strong> em aberto</span>
                  {custoAberto > 0 && <span><strong className="text-amber-500">{eur(custoAberto)}</strong> a pagar pelas abertas</span>}
                  <span>{ano}: <strong className={forte}>{doAno.length}</strong> entregues · pago <strong className="text-red-400">{eur(pagoAno)}</strong>{doAno.length ? <> · margem <strong className={margemAno >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}>{eur(margemAno)}</strong></> : null}</span>
                </div>
              );
            })()}
            {(pasta || sel.tipo === 'cliente') && (
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${sub}`}>
                <span><strong className={claro ? 'text-slate-800' : 'text-slate-100'}>{tarefas.filter(t => t.estado !== 'feito').length}</strong> por acabar</span>
                <span><strong className={claro ? 'text-slate-800' : 'text-slate-100'}>{tempoTxt(horasTot)}</strong> registadas</span>
                <span><strong className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(valorAberto)}</strong> por entregar</span>
              </div>
            )}
          </div>
          {(anosPorOrganizar.length > 0 || listasSemJogo > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {listasSemJogo > 0 && <button type="button" onClick={() => mudar(tr => opDetetarJogos(tr, sel.id))} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} inline-flex items-center gap-1.5`}><IcoT n="jogo" className="w-3.5 h-3.5" /> Dar uma cor a cada jogo ({listasSemJogo} lista{listasSemJogo === 1 ? '' : 's'})</button>}
              {anosPorOrganizar.length > 0 && <button type="button" onClick={organizarCliente} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} inline-flex items-center gap-1.5`}><IcoT n="calendario" className="w-3.5 h-3.5" /> Organizar {anosPorOrganizar.map(p => p.nome).join(' e ')} por meses</button>}
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
          {sel.tipo === 'criativos' && !procura.trim() && <Criativos trab={trab} mudar={mudar} clientes={clientes} cu={cu} theme={theme} onAbrir={setTarefaAberta} showToast={showToast} inputClass={inputClass} focarProcura={focarCriativos} />}
          {sel.tipo === 'calendario' && !procura.trim() && calendario}
          {freeSel && !procura.trim() && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setSel({ tipo: 'freelancers', abrir: freeSel.id })} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Ficha e preços</button>
              {freeSel.email && <a href={`https://mail.google.com/mail/?${(trab.contaEmailFree || trab.contaGoogle) ? `authuser=${encodeURIComponent(trab.contaEmailFree || trab.contaGoogle)}&` : ''}view=cm&fs=1&to=${encodeURIComponent(freeSel.email)}`} target="_blank" rel="noopener noreferrer" className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`} title={`Escrever a ${freeSel.email} no Gmail${trab.contaEmailFree ? ` (com ${trab.contaEmailFree})` : ' — escolhe a conta em Freelancers'}`}>Enviar email</a>}
              {freeSel.email && <button type="button" onClick={() => { copiar(freeSel.email); if (showToast) showToast('Email copiado'); }} className={`px-2 py-1 text-xs rounded-lg ${sub} hover:text-blue-400`} title="Copiar o email">{freeSel.email}</button>}
              {freeSel.faz && <span className={`text-xs ${sub}`}>Faz: {freeSel.faz}</span>}
              {!tarefas.length && <span className={`text-xs ${sub}`}>Ainda não tem tarefas. Escolhe-a em "Quem faz" numa tarefa.</span>}
            </div>
          )}
          {freeSel && !procura.trim() && tarefas.length > 0 && <EstatFreelancer tarefas={tarefas} trab={trab} cu={cu} clientes={clientes} ano={ano} claro={claro} />}
          {sel.tipo === 'freelancers' && !procura.trim() && <Freelancers key={sel.abrir || '-'} abrirId={sel.abrir} onVer={id => NAV_FREE.abrir(id)} trab={trab} mudar={mudar} cu={cu} clientes={clientes} ano={ano} theme={theme} inputClass={inputClass} />}
          {sel.tipo === 'tipos' && !procura.trim() && <TiposTarefa cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} onPrecos={onPrecos} onCu={onCu} />}
          {sel.tipo === 'clientes' && !procura.trim() && <ListaClientes clientes={clientes} trab={trab} faturado={faturado} ano={ano} mesNum={mesNum} cu={cu} theme={theme}
            onAbrir={id => { setSel({ tipo: 'cliente', id }); setAba('ficha'); }}
            onNovo={nome => { const id = onNovoCliente(nome); if (id != null) { setSel({ tipo: 'cliente', id }); setAba('ficha'); } }}
            onImportar={onImportarClientes ? txt => {
              let d; try { d = JSON.parse(txt); } catch (err) { if (showToast) showToast('Esse ficheiro não é um JSON válido.', 'error'); return; }
              const lista = Array.isArray(d) ? d : (d && d.clientes) || [];
              const frees = (d && Array.isArray(d.freelancers)) ? d.freelancers.filter(f => f && f.nome) : [];
              if (frees.length) mudar(tr => frees.reduce((acc, f) => { const ex = (acc.freelancers || []).find(x => normJ(x.nome) === normJ(f.nome)); return ex ? opFreelancer(acc, ex.id, { ...f, precos: { ...(ex.precos || {}), ...(f.precos || {}) } }) : opNovoFreelancer(acc, f.nome, f); }, tr));
              if (!lista.length) { if (showToast) showToast(frees.length ? `Freelancers importados: ${frees.length}` : 'Não encontrei clientes nesse ficheiro.', frees.length ? 'success' : 'error'); return; }
              const ids = onImportarClientes(lista) || {};
              // Os clientes que só vinham do ClickUp ("cu:Nome") passam para o cliente da app
              const mapa = {};
              const norm = x => String(x || '').trim().toLowerCase();
              lista.forEach(e => { if (!e || ids[e.nome] == null) return; [e.nome, ...(e.aliases || [])].forEach(n => { mapa['cu:' + norm(n)] = ids[e.nome]; }); });
              const conhecidos = new Set((clientesIn || []).map(c => String(c.id)));
              const novoP = p => {
                if (typeof p.cid === 'string' && p.cid.startsWith('cu:') && mapa[norm(p.cid)] != null) return mapa[norm(p.cid)];
                if (!conhecidos.has(String(p.cid)) && p.clienteNome && mapa['cu:' + norm(p.clienteNome)] != null) return mapa['cu:' + norm(p.clienteNome)];
                return p.cid;
              };
              const mapaPasta = {};
              (trab.pastas || []).forEach(p => { const n = novoP(p); if (n !== p.cid) mapaPasta[p.id] = { de: p.cid, para: n }; });
              const novoT = t => { const m = mapaPasta[t.pastaId]; if (m && String(m.de) === String(t.cid)) return m.para; if (typeof t.cid === 'string' && t.cid.startsWith('cu:') && mapa[norm(t.cid)] != null) return mapa[norm(t.cid)]; return t.cid; };
              if (Object.keys(mapaPasta).length || (trab.tarefas || []).some(t => novoT(t) !== t.cid)) {
                mudar(tr => ({ ...tr, pastas: (tr.pastas || []).map(p => (mapaPasta[p.id] ? { ...p, cid: mapaPasta[p.id].para } : p)), tarefas: (tr.tarefas || []).map(t => { const n = novoT(t); return n !== t.cid ? { ...t, cid: n } : t; }) }));
              }
              if (showToast) showToast(`Fichas importadas: ${Object.keys(ids).length} cliente${Object.keys(ids).length === 1 ? '' : 's'}`, 'success');
            } : null} />}
          {abaAtual === 'faturas' && sel.tipo === 'cliente' && !procura.trim() && cliente && !cliente.soTrabalho && <FaturasCliente key={cliente.id} recibos={recibosDe ? recibosDe(cliente.id) : []} c={cliente} trab={trab} mudar={mudar} cu={cu} clientes={clientes} ano={ano} mesNum={mesNum} theme={theme} inputClass={inputClass} onEnviarAnexo={onEnviarAnexo} onCriarRecibo={onCriarReciboFatura} onApagarRecibo={onApagarReciboFatura} showToast={showToast} onAbrirTarefa={id => setTarefaAberta(id)} contaDriveRecibos={contaDriveRecibos} />}
          {abaAtual === 'recibos' && sel.tipo === 'cliente' && !procura.trim() && recibosDe && <RecibosCliente key={sel.id} lista={recibosDe(sel.id)} onAbrirFicheiro={onAbrirRecibo} onJuntarFicheiro={onJuntarRecibo} onIrMes={onIrMes} claro={claro} sub={sub} obterFicheiro={obterRecibo} showToast={showToast} inputClass={inputClass}
            onImportar={onImportarRecibo ? x => onImportarRecibo({ ...x, cid: sel.id }) : null} pendDrive={recibosDrivePend.filter(p => p.cid == null || String(p.cid) === String(sel.id))} contaDrive={contaDriveRecibos} onIgnorarDrive={onIgnorarReciboDrive} onSincDrive={onSincRecibosDrive} recSinc={recSinc} cfgDrive={cfgRecibosDrive} onCfgDrive={onCfgRecibosDrive} />}
          {abaAtual === 'jogos' && sel.tipo === 'cliente' && !procura.trim() && <JogosCliente cid={sel.id} trab={trab} cu={cu} clientes={clientes} ano={ano} theme={theme} inputClass={inputClass} mudar={mudar} notasDe={notasDe} onAbrirNota={onAbrirNota} onNovaNota={onNovaNota} />}
          {abaAtual === 'ficha' && sel.tipo === 'cliente' && cliente && !procura.trim() && (
            <FichaCliente recibos={recibosDe ? recibosDe(cliente.id) : []} c={cliente} trab={trab} faturado={faturado} ano={ano} mesNum={mesNum} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass}
              onCliente={onCliente} onIrPrecos={() => setAba('precos')} notas={notasDe ? notasDe('cliente', cliente.id) : []} onAbrirNota={onAbrirNota} onNovaNota={onNovaNota} onApagar={onApagarCliente ? id => { onApagarCliente(id); setSel({ tipo: 'clientes' }); } : null}
              onCriarDoClickUp={() => {
                const velho = cliente.id;
                const id = onNovoCliente(cliente.nome, { cor: cliente.cor && cliente.cor !== '#64748b' ? cliente.cor : undefined, aliases: [cliente.nome] });
                if (id == null) return;
                mudar(tr => ({ ...tr, pastas: (tr.pastas || []).map(p => (String(p.cid) === String(velho) ? { ...p, cid: id } : p)), tarefas: (tr.tarefas || []).map(t => (String(t.cid) === String(velho) ? { ...t, cid: id } : t)) }));
                setSel({ tipo: 'cliente', id });
              }} />
          )}
          {((sel.tipo !== 'geral' && sel.tipo !== 'timesheet' && sel.tipo !== 'clientes' && sel.tipo !== 'tipos' && sel.tipo !== 'freelancers' && sel.tipo !== 'calendario') || procura.trim()) && abaAtual === 'tarefas' && (
            <div className="space-y-3">
              {pasta && <NovaTarefa onCriar={criarTarefa} cid={pasta.cid} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} jogoTrello={jogoTrello} />}
              {sel.tipo === 'cliente' && !procura.trim() && !filhasDe(trab, null, sel.id).length && (
                <Card><p className="text-sm">Ainda não há pastas para {cliente ? cliente.nome : 'este cliente'}. Carrega no <strong>+</strong> ao lado do nome, à esquerda.</p></Card>
              )}
              {sel.tipo === 'todas' && !procura.trim() && (() => {
                const cids = [...new Set((trab.tarefas || []).map(t => String(t.cid || '')).filter(Boolean))];
                const nome = id => { const c = (clientes || []).find(x => String(x.id) === id); return c ? c.nome : id.replace(/^cu:/, ''); };
                const caixaSel = `rounded-lg border px-2 py-1 text-xs ${claro ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900/60 border-slate-600 text-slate-200'}`;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={filtroTodas.cid} onChange={e => setFiltroTodas({ ...filtroTodas, cid: e.target.value })} aria-label="Cliente" className={caixaSel}>
                      <option value="">Todos os clientes</option>
                      {cids.map(id => [id, nome(id)]).sort((a, b) => a[1].localeCompare(b[1], 'pt')).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                    </select>
                    <select value={filtroTodas.feitas} onChange={e => setFiltroTodas({ ...filtroTodas, feitas: e.target.value })} aria-label="Tarefas feitas" className={caixaSel}>
                      <option value="30">Feitas: últimos 30 dias</option>
                      <option value="todas">Feitas: todas</option>
                      <option value="nao">Sem as feitas</option>
                    </select>
                    <span className={`text-xs ${sub}`}>{tarefas.length} tarefa{tarefas.length === 1 ? '' : 's'}<span className="hidden min-[900px]:inline"> · marca várias para mudar o estado, o prazo ou a prioridade de uma vez</span></span>
                  </div>
                );
              })()}
              <div>
                <ListaTarefas comCliente={sel.tipo === 'todas'} tarefas={tarefas} trab={trab} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={setTarefaAberta} mostrarPasta={!pasta || descendentes(trab, pasta.id).length > 1}
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
      {aApagarT && <ConfirmarApagar t={aApagarT} claro={claro} onSim={() => apagarTarefaJa(aApagarT)} onNao={() => setAApagarT(null)} />}
      {tarefaSel && <DetalheTarefa t={tarefaSel} trab={trab} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} mudar={mudar} onFechar={() => setTarefaAberta(null)} onEnviarAnexo={onEnviarAnexo} onApagarAnexo={onApagarAnexo} showToast={showToast} notasDe={notasDe} onAbrirNota={onAbrirNota} onNovaNota={onNovaNota} />}
    </div>
  );
};

// ── Pastas que a app usa no Drive ficam com uma cor própria (verde), para se ver que estão ligadas à app e não se apagarem por engano ──
const COR_PASTA_APP = '#16a765';
const PASTAS_COLORIDAS = new Set();
const colorirPasta = async (token, id) => {
  if (!id || PASTAS_COLORIDAS.has(id)) return;
  PASTAS_COLORIDAS.add(id);
  try { await driveApi(token, `${DRV}/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderColorRgb: COR_PASTA_APP }) }); } catch (e) { /* sem cor: não faz mal */ }
};
const EXT_DOC = /\.(pdf|png|jpe?g|webp)$/i;
const tipoDoNome = n => (/\.png$/i.test(n) ? 'image/png' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.webp$/i.test(n) ? 'image/webp' : 'application/pdf');
// Documentos (PDF/imagens) de uma pasta e das subpastas, até «niveis» abaixo
const docsDaPasta = async (token, id, niveis) => {
  const out = [];
  const andar = async (pid, n, caminho) => {
    (await filhosDrive(token, pid, false)).filter(f => EXT_DOC.test(f.name)).forEach(f => out.push({ ...f, caminho }));
    if (n > 0) for (const p of await filhosDrive(token, pid, true)) await andar(p.id, n - 1, [...caminho, p.name]);
  };
  await andar(id, niveis, []);
  return out;
};
const tokenPara = async conta => { await carregarGis().catch(() => {}); return tokenDrive(conta); };
// Um ficheiro do Drive como File (para guardar na app e para a IA o ler)
const ficheiroDoDrive = async (conta, f) => { const b = await descarregarDrive(conta, f.id, {}); return new File([b], f.name, { type: tipoDoNome(f.name) }); };

// ── Faturas → pasta do Google Drive: FATURAS / Cliente / 2026 / 09_Setembro / 4_Invoice_September_26.pdf ──
const MESES_PASTA = ['01_Janeiro', '02_Fevereiro', '03_Março', '04_Abril', '05_Maio', '06_Junho', '07_Julho', '08_Agosto', '09_Setembro', '10_Outubro', '11_Novembro', '12_Dezembro'];
const pastaAnoMes = async (token, pCliId, mes) => {
  const [a, m] = String(mes || '').split('-');
  if (!a || !m) return { id: pCliId };
  const pAno = await pastaDrive(token, pCliId, a, false); await colorirPasta(token, pAno.id);
  const pMes = await pastaDrive(token, pAno.id, MESES_PASTA[Number(m) - 1] || m, false); await colorirPasta(token, pMes.id);
  return pMes;
};
const pastaFaturas = async (token, raiz, cliente, mes) => {
  await colorirPasta(token, raiz);
  const pCli = await pastaDrive(token, raiz, cliente, false); await colorirPasta(token, pCli.id);
  return pastaAnoMes(token, pCli.id, mes);
};
// Antes de pôr uma versão nova por cima, a atual fica guardada para sempre no histórico de versões do Drive
const guardarVersaoAtual = async (token, id) => {
  const h = await driveApi(token, `${DRV}/${encodeURIComponent(id)}?fields=headRevisionId&supportsAllDrives=true`);
  if (!h || !h.headRevisionId) throw new Error('sem versão');
  await driveApi(token, `${DRV}/${encodeURIComponent(id)}/revisions/${encodeURIComponent(h.headRevisionId)}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepForever: true }) });
};
// Envia a fatura. Se já houver lá um ficheiro com o mesmo nome: liga-se a esse; ou, quando a fatura foi
// corrigida e gerada outra vez (novaVersao), fica como versão nova desse ficheiro (a anterior fica no histórico).
const guardarFaturaNoDrive = async ({ ficheiro, nome, cliente, mes, pastaUrl, conta, novaVersao }) => {
  const raiz = idPastaDrive(pastaUrl);
  if (!raiz) throw new Error('o link da pasta das faturas no Drive não parece certo');
  const token = await tokenPara(conta);
  const p = await pastaFaturas(token, raiz, cliente, mes);
  const ja = (await filhosDrive(token, p.id, false)).find(f => f.name === nome);
  const f = ficheiro instanceof File ? ficheiro : new File([ficheiro], nome, { type: 'application/pdf' });
  let nomeFinal = nome;
  if (ja && !novaVersao) return { id: ja.id, url: ja.webViewLink, nome, jaExistia: true, mod: ja.modifiedTime };
  if (ja) {
    let guardada = false;
    try { await guardarVersaoAtual(token, ja.id); guardada = true; } catch (e) { /* não deu para guardar a versão atual: então não mexe nela */ }
    if (guardada) {
      const res = await enviarParaDrive(token, { file: f, nome, pasta: p.id, idExistente: ja.id }, () => {});
      return { id: ja.id, url: ja.webViewLink || (res && res.webViewLink), nome, novaVersao: true, mod: res && res.modifiedTime };
    }
    nomeFinal = nome.replace(/(\.[a-z0-9]{2,4})?$/i, m => ` (corrigida)${m || '.pdf'}`);
  }
  const res = await enviarParaDrive(token, { file: f, nome: nomeFinal, pasta: p.id, idExistente: null }, () => {});
  return { id: res && res.id, url: (res && res.webViewLink) || (res && res.id ? `https://drive.google.com/file/d/${res.id}/view` : ''), nome: nomeFinal, mod: res && res.modifiedTime };
};
// As faturas que estão na pasta do cliente (e nas subpastas ano/mês)
const listarFaturasDrive = async ({ cliente, pastaUrl, conta }) => {
  const raiz = idPastaDrive(pastaUrl);
  if (!raiz) throw new Error('o link da pasta das faturas no Drive não parece certo');
  const token = await tokenPara(conta);
  await colorirPasta(token, raiz);
  const pc = (await filhosDrive(token, raiz, true)).find(x => slugF(x.name) === slugF(cliente));
  return pc ? docsDaPasta(token, pc.id, 2) : [];
};
// Os recibos verdes que estão na pasta (ano / trimestre)
const listarRecibosDrive = async ({ pastaUrl, conta }) => {
  const raiz = idPastaDrive(pastaUrl);
  if (!raiz) throw new Error('o link da pasta de recibos no Drive não parece certo');
  const token = await tokenPara(conta);
  await colorirPasta(token, raiz);
  return docsDaPasta(token, raiz, 2);
};

// ── Faturas que aparecem no Drive (ex.: guardadas no PC numa pasta sincronizada pelo «Google Drive para computador»):
// a app vê-as sozinha e junta-as. Nunca cria duas faturas com o mesmo nº: se a mesma fatura for guardada outra vez
// (corrigida), atualiza a que já existe. O que não conseguir perceber sozinha fica numa lista para confirmares.
const LS_FAT_VISTO = 'fat-drive-visto';
// Acesso ao Drive sem abrir janelas (só com a ligação permanente, ou com um acesso ainda válido)
const tokenSemJanela = async conta => {
  const k = conta || '_';
  const t = tokenGuardadoDe(k); if (t) return t;
  await sincronizarSempre();
  if (!ligadoSempre(k)) return null;
  try { const j = await chamarDriveFn('token', { conta: conta || undefined }); guardarAcesso([k, j.email], j); return j.access_token; } catch (e) { return null; }
};
const descarregarDriveSemJanela = async (conta, id) => {
  const t = await tokenSemJanela(conta); if (!t) throw new Error('sem acesso ao Drive');
  const r = await fetch(`${DRV}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`Erro ${r.status} do Drive`);
  return r.blob();
};
const INFO_DRIVE = new Map();
const infoDrive = async (token, id) => {
  if (INFO_DRIVE.has(id)) return INFO_DRIVE.get(id);
  let j = null; try { j = await driveApi(token, `${DRV}/${encodeURIComponent(id)}?fields=id,name,parents&supportsAllDrives=true`); } catch (e) { j = { id, name: '', parents: [] }; }
  INFO_DRIVE.set(id, j); return j;
};
// Pastas entre a raiz e o ficheiro ([] = solto na raiz; [cliente, ano, mês]); null se não estiver lá dentro
const caminhoNaRaiz = async (token, f, raiz) => {
  const cam = []; let p = (f.parents || [])[0];
  for (let n = 0; p && n < 8; n++) {
    if (p === raiz) return cam.reverse();
    const i = await infoDrive(token, p); cam.push({ id: p, name: i.name }); p = (i.parents || [])[0];
  }
  return null;
};
const nomesCliente = c => [c.nome, ...(c.aliases || []), c.fat && c.fat.nomeLegal].filter(Boolean);
const clienteDoNomeF = (clientes, nome) => {
  const s2 = slugF(nome); if (!s2) return null;
  const cs = (clientes || []).filter(c => !c.soTrabalho);
  return cs.find(c => nomesCliente(c).some(n => slugF(n) === s2))
    || cs.find(c => nomesCliente(c).some(n => { const a = slugF(n); return a.length >= 4 && (s2.includes(a) || a.includes(s2)); })) || null;
};
const valoresIA = (d, n) => {
  const v = d ? Number(d.valorIliquido) || Number(d.totalDocumento) || 0 : 0;
  const dIA = dataIAValida(d && d.data);
  const mes = (n && n.mes) || (dIA ? dIA.slice(0, 7) : '');
  return { valor: v > 0 ? Math.round(v * 100) / 100 : 0, data: dIA || (mes ? ultimoDiaDe(mes) : ''), mes, mesDoNome: !!(n && n.mes) };
};
const verificarFaturasDrive = async ({ trab, clientes, conta, desde }) => {
  const fd = trab.faturasDrive || {};
  const raiz = idPastaDrive(fd.pasta); if (!raiz) return null;
  const token = await tokenSemJanela(conta); if (!token) return null;
  const agora = new Date().toISOString();
  const q = encodeURIComponent(`modifiedTime > '${desde}' and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
  const j = await driveApi(token, `${DRV}?q=${q}&fields=files(id,name,parents,modifiedTime,webViewLink)&orderBy=modifiedTime&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const faturas = trab.faturas || [];
  const ignorar = new Set(trab.faturasDriveIgnorar || []);
  const jaPend = new Set((trab.faturasDrivePend || []).map(p => p.id));
  const acoes = []; let falhou = null;
  const pend = (f, cid, motivo) => { if (!jaPend.has(f.id)) acoes.push({ tipo: 'pend', item: { id: f.id, nome: f.name, url: f.webViewLink, mod: f.modifiedTime, cid: cid != null ? cid : null, motivo } }); };
  for (const f of (j.files || []).filter(x => EXT_DOC.test(x.name))) {
    if (ignorar.has(f.id)) continue;
    try {
      const cam = await caminhoNaRaiz(token, f, raiz);
      if (!cam) continue;
      if (cam.length >= 2 && !/^\d{4}$/.test(String(cam[1].name).trim())) continue; // outras pastas dentro da do cliente (ex.: contratos): não são faturas
      const drive = { id: f.id, url: f.webViewLink, nome: f.name, mod: f.modifiedTime };
      const n = lerNomeFatura(f.name);
      let d; let lido = false;
      const ler = async () => { if (!lido) { lido = true; d = await lerFaturaIA(await ficheiroDoDrive(conta, f)).catch(() => null); } return d; };
      const ligada = faturas.find(x => x.drive && x.drive.id === f.id);
      if (ligada) {
        if (ligada.drive.mod && String(f.modifiedTime) <= String(ligada.drive.mod)) continue;
        // guardada outra vez por cima (corrigida): as feitas fora da app voltam a ser lidas
        if (!ligada.drive.mod || !ligada.antiga) { acoes.push({ tipo: 'ligar', fid: ligada.id, drive }); continue; }
        acoes.push({ tipo: 'corrigir', fid: ligada.id, drive, ...valoresIA(await ler(), n) });
        continue;
      }
      // De que cliente é: pela pasta, ou (solta na pasta das faturas) pelo nome que a IA lê no PDF
      let c = cam.length ? clienteDoNomeF(clientes, cam[0].name) : null;
      if (!c) { const dd = await ler(); c = dd ? clienteDoNomeF(clientes, dd.nomeCliente) : null; }
      if (!c) { pend(f, null, 'não sei de que cliente é'); continue; }
      if (!n.numero) { pend(f, c.id, 'não percebi o nº pelo nome do ficheiro'); continue; }
      const mesma = faturas.find(x => String(x.cid) === String(c.id) && Number(x.numero) === Number(n.numero));
      if (mesma) {
        // A mesma fatura guardada outra vez com outro nome: passa a usar a mais recente (não cria outra)
        if (mesma.drive && mesma.drive.mod && String(f.modifiedTime) <= String(mesma.drive.mod)) continue;
        if (!mesma.antiga) { acoes.push({ tipo: 'ligar', fid: mesma.id, drive }); continue; }
        acoes.push({ tipo: 'corrigir', fid: mesma.id, drive, ...valoresIA(await ler(), n) });
        continue;
      }
      const v = valoresIA(await ler(), n);
      if (!(v.valor > 0) || !v.data || !v.mes) { pend(f, c.id, d ? 'não consegui ler o valor ou a data' : 'a IA não conseguiu ler o PDF'); continue; }
      // Solta (fora de Cliente / Ano / Mês): arruma-a na pasta certa (só muda de pasta, não apaga nada)
      if (cam.length < 3) {
        try {
          const destino = cam.length ? await pastaAnoMes(token, cam[0].id, v.mes) : await pastaFaturas(token, raiz, c.nome, v.mes);
          const de = (f.parents || [])[0];
          if (destino && destino.id && de && destino.id !== de) {
            const mv = await driveApi(token, `${DRV}/${encodeURIComponent(f.id)}?addParents=${encodeURIComponent(destino.id)}&removeParents=${encodeURIComponent(de)}&supportsAllDrives=true&fields=id,modifiedTime,webViewLink`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            if (mv && mv.modifiedTime) drive.mod = mv.modifiedTime;
          }
        } catch (e) { /* fica onde está */ }
      }
      acoes.push({ tipo: 'nova', cid: c.id, numero: Number(n.numero), ...v, drive });
    } catch (e) { console.warn('Fatura no Drive:', f.name, e); if (!falhou || String(f.modifiedTime) < falhou) falhou = String(f.modifiedTime); }
  }
  // Se algum falhou (ex.: sem rede a meio), da próxima vez volta a ver a partir desse
  return { acoes, ate: falhou ? new Date(new Date(falhou).getTime() - 1000).toISOString() : agora };
};
// Aplica o que a verificação encontrou (função pura: corre dentro do mudar, com o estado mais recente)
const aplicarFaturasDrive = (tr, acoes, clientes) => {
  let faturas = [...(tr.faturas || [])]; let tarefas = tr.tarefas || []; let pend = [...(tr.faturasDrivePend || [])];
  const msgs = []; const agora = new Date().toISOString();
  const tiraPend = id => { pend = pend.filter(p => p.id !== id); };
  acoes.forEach((a, i) => {
    if (a.tipo === 'pend') { if (!pend.some(p => p.id === a.item.id) && !faturas.some(f => f.drive && f.drive.id === a.item.id)) pend.push({ ...a.item, em: agora }); return; }
    if (a.tipo === 'ligar') { faturas = faturas.map(f => (f.id === a.fid ? { ...f, drive: a.drive } : f)); tiraPend(a.drive.id); return; }
    if (a.tipo === 'corrigir') {
      faturas = faturas.map(f => {
        if (f.id !== a.fid) return f;
        const muda = a.valor > 0 && Math.abs(a.valor - (Number(f.total) || 0)) >= 0.01;
        const outraData = a.data && a.data !== f.data;
        if (muda) msgs.push(`☁ Fatura nº ${f.numero} corrigida no Drive: ${cuEur(f.total)} → ${cuEur(a.valor)}`);
        else if (outraData) msgs.push(`☁ Fatura nº ${f.numero}: data corrigida no Drive`);
        return { ...f, drive: a.drive, ...(muda ? { subtotal: a.valor, total: a.valor, ivaValor: 0, linhas: [{ titulo: `Fatura nº ${f.numero}`, resto: '', ...((f.linhas || [])[0] || {}), valor: a.valor }] } : {}), ...(outraData ? { data: a.data } : {}), corrigida: agora };
      });
      tiraPend(a.drive.id);
      return;
    }
    if (a.tipo === 'nova') {
      if (faturas.some(f => (f.drive && f.drive.id === a.drive.id) || (String(f.cid) === String(a.cid) && Number(f.numero) === Number(a.numero)))) return;
      const id = `${trabId()}d${i}`;
      // As tarefas desse mês ficam faturadas só quando o mês vem do nome do ficheiro (ex.: Invoice_September_26);
      // pela data da fatura não dá para saber (uma fatura de 1 de outubro costuma ser do trabalho de setembro)
      const ids = a.mesDoNome ? tarefas.filter(t => String(t.cid) === String(a.cid) && !(t.faturaId || t.faturada) && trabEntrega(t).startsWith(`${a.mes}-`)).map(t => t.id) : [];
      const sIds = new Set(ids);
      faturas.push({ id, cid: a.cid, numero: Number(a.numero), data: a.data, mes: a.mes, para: '', linhas: [{ titulo: `Fatura nº ${a.numero}`, resto: '', valor: a.valor }], subtotal: a.valor, ivaTaxa: 0, ivaValor: 0, total: a.valor, tarefas: ids, extras: [], pdf: null, antiga: true, doDrive: true, drive: a.drive, criada: agora });
      if (ids.length) tarefas = tarefas.map(t => (sIds.has(t.id) ? { ...t, faturaId: id } : t));
      tiraPend(a.drive.id);
      const c = (clientes || []).find(x => String(x.id) === String(a.cid));
      msgs.push(`☁ Fatura nº ${a.numero}${c ? ` de ${c.nome}` : ''} (${cuEur(a.valor)}) juntada do Drive${ids.length ? ` · ${ids.length} tarefa${ids.length === 1 ? '' : 's'} dada${ids.length === 1 ? '' : 's'} como faturada${ids.length === 1 ? '' : 's'}` : ''}`);
    }
  });
  return { tr: { ...tr, faturas, tarefas, faturasDrivePend: pend }, msgs };
};

// ── Recibos verdes → pasta pessoal do Google Drive: RECIBOS VERDES / 2026 / 4º_Trimestre / Empresa_2026-10-13.pdf ──
// Usado pelo OrcamentoApp (importa este ficheiro só quando é preciso). Nunca escreve por cima: se já houver
// um ficheiro com o mesmo nome, junta _2, _3…
const nomeFicheiroRecibo = (empresa, data) => `${String(empresa || 'Recibo').replace(/[\\/:*?"<>|,]+/g, ' ').trim().replace(/\s+/g, '_')}_${data}.pdf`;
const guardarReciboNoDrive = async ({ ficheiro, empresa, data, pastaUrl, conta, semJanela }) => {
  const raiz = idPastaDrive(pastaUrl);
  if (!raiz) throw new Error('o link da pasta de recibos no Drive não parece certo');
  if (!ficheiro) throw new Error('sem PDF');
  const k = conta || '_';
  if (semJanela && !tokenGuardadoDe(k) && !ligadoSempre(k)) {
    await sincronizarSempre();
    if (!ligadoSempre(k)) { const e = new Error(`liga primeiro o Drive ${conta || 'pessoal'} (Definições → Recibos no Google Drive → Manter sempre ligado)`); e.codigo = 'sem_ligacao'; throw e; }
  }
  await carregarGis().catch(() => {});
  const token = await tokenDrive(conta);
  const d = /^\d{4}-\d{2}-\d{2}/.test(String(data || '')) ? String(data).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const ano = d.slice(0, 4); const trim = Math.ceil(Number(d.slice(5, 7)) / 3);
  const pAno = await pastaDrive(token, raiz, ano, false);
  const pTrim = await pastaDrive(token, pAno.id, `${trim}º_Trimestre`, false);
  await colorirPasta(token, raiz); await colorirPasta(token, pAno.id); await colorirPasta(token, pTrim.id);
  const base = nomeFicheiroRecibo(empresa, d);
  const existentes = new Set((await filhosDrive(token, pTrim.id, false)).map(f => f.name));
  let nome = base; let i = 2;
  while (existentes.has(nome)) nome = base.replace(/\.pdf$/, `_${i++}.pdf`);
  const f = ficheiro.type ? ficheiro : new File([ficheiro], nome, { type: 'application/pdf' });
  const res = await enviarParaDrive(token, { file: f, nome, pasta: pTrim.id, idExistente: null }, () => {});
  return { nome, pasta: `${ano}/${pTrim.name || `${trim}º_Trimestre`}`, url: (res && res.webViewLink) || pTrim.webViewLink || `https://drive.google.com/drive/folders/${pTrim.id}`, id: res && res.id };
};

export { Trabalho, guardarReciboNoDrive, ligarDriveSempre, desligarDriveSempre, ligadoSempre, sincronizarSempre, carregarGis, ligarGoogleTasks, pedirTasks, listarRecibosDrive, ficheiroDoDrive, lerFaturaIA, tokenSemJanela, descarregarDriveSemJanela };
export const FICHEIRO_APP = 'trabalho';
