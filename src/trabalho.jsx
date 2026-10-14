// Separador "Trabalho": pastas e subpastas por cliente, tarefas com estados, cronómetro,
// notas/reuniões e orçamento automático. Substitui o ClickUp. Só é descarregado quando se abre.
// Os dados (trab) vêm do OrcamentoApp, que os guarda no Firestore; aqui só se lê e se pede para mudar.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TRAB_ESTADOS, TRAB_VAZIO, trabId, trabDia, trabMsTempo, trabHoras, trabACorrer, trabEntrega,
  cuPreco, trabValor, trabValorAuto, trabPecas, trabRelogio, cuPecas, CU_TIPOS, CU_NOMES_EN, CU_CAMPOS_PRECO, CU_PRECOS_PADRAO, cuPresetCliente, cuEur, cuLerHoras, cuHorasTxt,
  meses, Card, trabParar,
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
const dataHora = iso => { if (!iso) return '—'; const d = new Date(iso); return `${dataCurta(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const paraInputLocal = iso => { if (!iso) return ''; const d = new Date(iso); return `${trabDia(iso)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

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
      <LinkDrive t={t} claro={claro} />
      <LinkTrello t={t} claro={claro} />
      {((t.anexos || []).length > 0 || (t.notas && String(t.notas).trim())) && (
        <span className={`shrink-0 inline-flex items-center gap-1 ${claro ? 'text-slate-400' : 'text-slate-500'}`}>
          {(t.anexos || []).length > 0 && <span title={`${t.anexos.length} anexo${t.anexos.length === 1 ? '' : 's'}`}><IcoA n="clip" className="w-3.5 h-3.5" /></span>}
          {t.notas && String(t.notas).trim() && <span title="Tem notas"><IcoT n="nota" className="w-3.5 h-3.5" /></span>}
        </span>
      )}
      {(t.freelancerId || t.outsourcing) && <QuemFaz t={t} claro={claro} editavel={false} className="shrink-0 max-w-[110px]" />}
      <EtiquetaTipo t={t} cu={cu} claro={claro} className="hidden sm:inline-block" />
      {t.prazo && <span className={`hidden sm:inline text-xs tabular-nums ${atrasada ? 'text-red-400 font-medium' : claro ? 'text-slate-500' : 'text-slate-400'}`} title="Prazo">{dataCurta(t.prazo)}</span>}
      <span className={`w-14 text-right text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}><TempoSomar t={t} mudar={mudar} claro={claro} /></span>
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
const COLS = 'grid grid-cols-[minmax(0,1fr)_132px_112px_92px_96px_108px_84px_96px_84px] items-center gap-x-3';
const COLS_CURTO = 'grid grid-cols-[minmax(0,1fr)_124px_104px_84px_108px_76px_80px] items-center gap-x-3';
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
const EtiquetaTipo = ({ t, cu, claro, className = '' }) => {
  const txt = etiquetaTipo(t, cu);
  if (!txt) return null;
  const p0 = trabPecas(t).find(p => p.tipo !== 'extra' && p.tipo !== 'outro');
  const cls = `${className} shrink-0 max-w-[45%] truncate px-1.5 py-px rounded-md text-[11px] font-medium`;
  if (!p0) return <span className={`${cls} ${claro ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' : 'bg-white/5 text-slate-300 ring-1 ring-white/10'}`} title={txt}>{txt}</span>;
  const h = matizTipo(p0.tipo);
  const est = claro
    ? { background: `hsl(${h} 70% 95%)`, color: `hsl(${h} 70% 27%)`, boxShadow: `inset 0 0 0 1px hsl(${h} 55% 82%)` }
    : { background: `hsla(${h}, 70%, 45%, .12)`, color: `hsl(${h} 62% 62%)`, boxShadow: `inset 0 0 0 1px hsla(${h}, 70%, 50%, .22)` };
  return <span className={cls} style={est} title={txt}>{txt}</span>;
};
const LinhaTabela = ({ t, cu, clientes, theme, mudar, onAbrir, nomePasta, cheio = true, marcada = false, algumaMarcada = false, onMarcar }) => {
  const claro = useClaro(theme);
  const corre = (t.tempos || []).some(x => !x.fim);
  const v = trabValor(t, cu, clientes);
  const hoje = trabDia(new Date().toISOString());
  const atrasada = t.prazo && t.prazo < hoje && t.estado !== 'feito' && t.estado !== 'review';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [editar, setEditar] = useState(false);
  const gravarNome = v => { setEditar(false); const n = v.trim(); if (n && n !== t.nome) mudar(tr => opTarefa(tr, t.id, x => ({ ...x, nome: n }))); };
  return (
    <div className={`${cheio ? COLS : COLS_CURTO} group px-3 ${nomePasta ? 'h-11' : 'h-[38px]'} border-b text-[13px] transition-colors ${marcada ? (claro ? 'bg-blue-50 border-blue-100' : 'bg-blue-500/[0.08] border-blue-500/10') : corre ? (claro ? 'bg-red-50/70 border-red-100' : 'bg-red-500/[0.06] border-red-500/10') : claro ? 'border-slate-100 hover:bg-slate-50' : 'border-white/[0.04] hover:bg-white/[0.03]'}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {onMarcar && (
          <input type="checkbox" checked={marcada} onChange={() => {}} onClick={e => { e.stopPropagation(); onMarcar(t.id, e.shiftKey); }}
            className={`-ml-1 w-3.5 h-3.5 shrink-0 accent-blue-500 cursor-pointer ${marcada || algumaMarcada ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`} aria-label={`Selecionar ${t.nome}`} title="Selecionar (Shift para várias seguidas)" />
        )}
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
            <EtiquetaTipo t={t} cu={cu} claro={claro} />
            <LinkDrive t={t} claro={claro} />
            <LinkTrello t={t} claro={claro} />
            <button type="button" onClick={() => setEditar(true)} className={`shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`} title="Mudar o nome" aria-label="Mudar o nome">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13l-3 1 1-3 8.5-8.5z" strokeLinejoin="round" /></svg>
            </button>
            {(t.anexos || []).length > 0 && <ClipAnexos anexos={t.anexos} claro={claro} sub={sub} cid={t.cid} />}
            {t.notas && String(t.notas).trim() && <button type="button" onClick={e => { e.stopPropagation(); onAbrir(t.id); }} className={`inline-flex items-center px-1 rounded ${sub} hover:text-blue-400 ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} title={`Notas: ${String(t.notas).slice(0, 300)}`} aria-label="Ver as notas da tarefa"><IcoT n="nota" className="w-3.5 h-3.5" /></button>}
          </>
        )}
      </div>
      <div><EstadoPill estado={t.estado} theme={theme} onMudar={e => mudar(tr => opEstado(tr, t.id, e))} /></div>
      <div className="min-w-0"><QuemFaz t={t} mudar={mudar} claro={claro} /></div>
      <div>
        {(() => { const pr = PRIORIDADES.find(x => x[0] === t.prioridade); return (
          <select value={t.prioridade || ''} onChange={e => mudar(tr => opTarefa(tr, t.id, x => ({ ...x, prioridade: e.target.value || null })))} aria-label="Prioridade"
            className={`w-full appearance-none bg-transparent text-[12px] rounded-md px-1.5 py-1 cursor-pointer outline-none ${pr ? 'font-medium' : sub} ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} style={pr ? { color: pr[2] } : undefined}>
            <option value="" className={claro ? '' : 'bg-slate-800 text-slate-300'}>—</option>
            {PRIORIDADES.map(([k, n, c]) => <option key={k} value={k} className={claro ? '' : 'bg-slate-800'} style={{ color: c }}>⚑ {n}</option>)}
          </select>
        ); })()}
      </div>
      {cheio && <div className={sub}>{haQuanto(t.criada)}</div>}
      <div className="flex items-center gap-2">
        <BotaoCrono aCorrer={corre} theme={theme} pequeno onIniciar={() => mudar(tr => opIniciar(tr, t.id))} onParar={() => mudar(opParar)} />
        <TempoSomar t={t} mudar={mudar} claro={claro} className={sub} />
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
                    <span>Nome</span><span>Estado</span><span>Quem faz</span><span>Prioridade</span>{cheio && <span>Criada</span>}<span>Tempo</span><span>Prazo</span>{cheio && <span>Terminada</span>}<span className="text-right">Valor</span>
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
const NovaTarefa = ({ onCriar, cid, cu, clientes, theme, inputClass, semPasta }) => {
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
  const sug = foco && !semPasta && !tipoEsc ? sugestoesTarefa(txt, cu, preco) : [];
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
const LinkTrello = ({ t, claro }) => (t.trello && t.trello.url ? (
  <a href={t.trello.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={`Cartão do Trello: ${t.trello.nome || ''}`}
    className={`shrink-0 inline-flex items-center px-1 h-5 rounded-md text-sky-500 ${claro ? 'hover:bg-sky-50' : 'hover:bg-sky-500/10'}`}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><rect x="7" y="7" width="4" height="9" rx="1" fill="currentColor" /><rect x="13" y="7" width="4" height="5" rx="1" fill="currentColor" /></svg>
  </a>
) : null);
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
  const chip = nome
    ? <span className="inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-full text-[11px] font-semibold truncate" style={{ background: `${cor}26`, color: cor }}><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} /><span className="truncate">{nome}</span></span>
    : <span className={`text-[12px] px-1.5 ${claro ? 'text-slate-400' : 'text-slate-500'}`}>Eu</span>;
  if (!editavel || !mudar || !FREE.lista.length) return <span className={`inline-flex min-w-0 ${className}`} title={nome ? `Feita por ${nome}` : 'Feita por ti'}>{chip}</span>;
  return (
    <span className={`relative inline-flex min-w-0 max-w-full rounded-md ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'} ${className}`} title={nome ? `Feita por ${nome} (mudar)` : 'Feita por ti (mudar)'}>
      {chip}
      <select value={t.freelancerId || ''} onChange={e => mudar(tr => opAtribuir(tr, t.id, e.target.value || null))} aria-label="Quem faz" className="absolute inset-0 w-full opacity-0 cursor-pointer">
        <option value="">Eu (ninguém)</option>
        {FREE.lista.filter(x => x.estado !== 'antigo' || x.id === t.freelancerId).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
      </select>
    </span>
  );
};
// Reserva para impostos (%) das Definições — para mostrar a margem depois de impostos nas tarefas subcontratadas
const RESERVA = { taxa: null };
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
  const apagar = a => {
    if (!window.confirm(`Tirar "${a.nome}" desta tarefa?`)) return;
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
        <p className="text-sm font-medium flex items-center gap-1.5"><IcoA n="clip" className="w-4 h-4" /> Brief e anexos {anexos.length > 0 && <span className={`text-xs font-normal ${sub}`}>{anexos.length}</span>}</p>
        <div className="flex items-center gap-1.5">
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
        ) : (
          <p className={`text-[11px] ${sub}`}>
            Google: {contaUsada ? <strong className="font-medium">{contaUsada}</strong> : 'conta principal do browser'} · <button type="button" onClick={() => setEditConta(true)} className="text-blue-400 hover:underline">mudar</button>
          </p>
        )
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
      {previa && (
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
          <EstadoPill estado={t.estado} theme={theme} onMudar={e => mudar(tr => opEstado(tr, t.id, e))} />
          {prio && <span className="text-xs font-medium" style={{ color: prio[2] }}>⚑ {prio[1]}</span>}
          <span className="flex-1" />
            {<a href={linkAE(trab, t, clientes)} className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${claro ? 'border-blue-200 text-blue-700 hover:bg-blue-50' : 'border-blue-500/30 text-blue-300 hover:bg-blue-500/10'}`} title="Abre o projeto desta tarefa no After Effects (precisa do lançador AbrirAE instalado no PC)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>Abrir no After Effects</a>}
            <a href={`${linkAE(trab, t, clientes)}&escolher=1`} className="hidden sm:inline text-xs text-slate-400 hover:text-blue-400 px-1" title="Abriu o projeto errado? Mostra a lista para escolheres o desta tarefa (fica guardado)">trocar projeto</a>
            <button type="button" className="text-xs text-slate-400 hover:text-blue-400 px-1.5" onClick={() => mudar(tr => ({ ...tr, tarefas: [...tr.tarefas, { ...t, id: trabId(), nome: t.nome + ' (cópia)', estado: 'todo', tempos: [], criada: agoraIso(), iniciada: null, review: null, feita: null, faturada: false }] }))}>Duplicar</button>
            <button type="button" className="text-xs text-slate-400 hover:text-red-400 px-1.5" onClick={() => { if (window.confirm(`Apagar esta tarefa?${(t.anexos || []).some(a => a.caminho) ? ' Os anexos dela também são apagados.' : ''}`)) {
              const outros = new Set((trab.tarefas || []).filter(o => o.id !== t.id).flatMap(o => (o.anexos || []).map(a => a.caminho)).filter(Boolean));
              (t.anexos || []).forEach(a => { if (a.caminho && !outros.has(a.caminho) && onApagarAnexo) onApagarAnexo(a.caminho); });
              mudar(tr => ({ ...tr, tarefas: tr.tarefas.filter(x => x.id !== t.id) })); onFechar();
            } }}>Apagar tarefa</button>
          <span className={`text-sm tabular-nums ${sub}`}><HorasVivas t={t} /></span>
          <BotaoCrono aCorrer={corre} theme={theme} onIniciar={() => mudar(tr => opIniciar(tr, t.id))} onParar={() => mudar(opParar)} />
          <button type="button" onClick={onFechar} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/10" aria-label="Fechar">✕</button>
        </div>
        <div className={`p-4 lg:p-5 grid grid-cols-1 gap-4 lg:gap-5 items-start xl:items-stretch xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)] ${comFicheiros ? 'lg:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.15fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'}`}>
         <div className={`space-y-3 min-w-0 ${COL_XL}`}>
          {nomeLivre || !prefixo ? (
            <label className="flex flex-col gap-1 min-w-0">
              <span className={`${lab} flex items-center gap-2`}>Nome da tarefa{prefixo && <button type="button" onClick={() => setNomeLivre(false)} className="ml-auto text-blue-400 hover:text-blue-300">só o conceito</button>}{!prefixo && <span className="ml-auto opacity-70">escolhe o tipo em Valor e o início do nome aparece sozinho</span>}</span>
              <textarea key={t.id + 'n' + t.nome} defaultValue={t.nome} rows={1} aria-label="Nome da tarefa"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                onBlur={e => { const n = e.target.value.trim(); if (n && n !== t.nome) { set({ nome: n }); setGravou(true); } else if (!n) e.target.value = t.nome; }}
                className={`${inputClass} text-base font-semibold resize-none overflow-hidden py-2 leading-snug`} />
            </label>
          ) : (
            <div className="flex flex-col gap-1 min-w-0">
              <span className={`${lab} flex items-center gap-2`} title="O início vem do tipo (em Valor); escreves só o conceito">Nome da tarefa<button type="button" onClick={() => setNomeLivre(true)} className="ml-auto shrink-0 text-blue-400 hover:text-blue-300">editar o nome todo</button></span>
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
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {!verQtd && <button type="button" className="text-blue-400 hover:text-blue-300" onClick={() => setVarias(true)}>várias peças nesta tarefa</button>}
                    <button type="button" className="text-blue-400 hover:text-blue-300" onClick={() => setMaisTipos(!maisTipos)}>{maisTipos ? 'menos tipos' : 'mais tipos'}</button>
                    {temMao && <button type="button" className={`${sub} hover:text-blue-400`} onClick={() => set({ pecas: null })}>voltar a ler do nome</button>}
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
                {t.link && <a href={urlAbrir(t.link, t.cid)} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white flex items-center">Abrir</a>}
              </div>
            </label>
            {t.faturaId && t.faturaId !== 'fora' ? (
              <p className="text-sm text-emerald-500">✓ Faturada na fatura nº {((trab.faturas || []).find(f => f.id === t.faturaId) || {}).numero || '?'} (para tirar, anula a fatura no separador Faturas do cliente)</p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!(t.faturaId || t.faturada)} onChange={e => set(e.target.checked ? { faturaId: 'fora' } : { faturaId: null, faturada: false })} />
                Já faturada (fora da app) — não entra nas faturas
              </label>
            )}
          </div>

          {/* Outsourcing */}
          <div className={`${caixa} space-y-2`}>
            <p className="text-sm font-medium" title="Se passaste a tarefa a outro freelancer — desconta no mês em que a entregas">Subcontratação</p>
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
            {(() => { const f = (trab.freelancers || []).find(x => x.id === t.freelancerId); const c = custoFreelancer(f, t); return f ? <p className={`text-xs ${sub}`}>{c != null ? <>Pela tabela de {f.nome}: {eur(c)}{Math.abs(c - custo) >= 0.5 && <> · <button type="button" onClick={() => set({ custoOutsourcing: c })} className="text-blue-400 hover:text-blue-300">usar este valor</button></>}</> : `${f.nome} não tem preço para este tipo — escreve o valor (ou junta-o em Freelancers).`}</p> : null; })()}
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

          {/* Tempo */}
          <div className={caixa}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium">Tempo</p>
              <span className="flex-1" />
              <label className={`flex items-center gap-1.5 text-xs ${sub}`} title="Opcional: quantas horas achas que vai levar">Estimativa
                <NumIn valor={t.estimativa ?? null} placeholder="—" onGravar={x => set({ estimativa: x })} className={`${inputClass} !w-16 text-xs py-1 text-right`} />
              </label>
              <p className={`text-sm tabular-nums font-semibold ${est && horasTarefa > est ? 'text-red-400' : ''}`}><HorasVivas t={t} />{est ? <span className={`ml-1 text-xs font-normal ${sub}`}>({Math.round(horasTarefa / est * 100)}%)</span> : null}</p>
            </div>
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
              {!(t.tempos || []).length && <p className={lab}>Sem tempo registado.</p>}
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

          <div className={`flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] px-1 ${sub}`}>
            {[['Criada', t.criada], ['Começada', t.iniciada], ['Review', t.review], ['Terminada', t.feita]].filter(([, d]) => d).map(([k, d]) => (
              <span key={k}>{k} <span className="tabular-nums">{dataHora(d)}</span></span>
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
const Freelancers = ({ trab, mudar, cu, clientes, ano, theme, inputClass }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [nome, setNome] = useState('');
  const [aberto, setAberto] = useState(null);
  const lista = (trab.freelancers || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
  const tipos = [...tiposDe(cu), { id: 'hora', nome: 'Hora' }];
  const ic = `${inputClass} text-sm py-1.5`;
  const stats = f => {
    const ts = (trab.tarefas || []).filter(t => t.freelancerId === f.id || (!t.freelancerId && t.outsourcing && normJ(t.outsourcing) === normJ(f.nome)));
    const doAno = ts.filter(t => trabEntrega(t).startsWith(`${ano}-`));
    const pago = doAno.reduce((a, t) => a + (Number(t.custoOutsourcing) || 0), 0);
    const faturado = doAno.reduce((a, t) => a + trabValor(t, cu, clientes), 0);
    return { n: ts.length, nAno: doAno.length, pago, margem: faturado - pago };
  };
  return (
    <div className="space-y-3">
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
              <button type="button" onClick={() => setAberto(ab ? null : f.id)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left">
                <span className={`text-[10px] ${sub} transition-transform`} style={{ transform: ab ? 'rotate(90deg)' : 'none' }}>▶</span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corFreelancer(f) }} />
                <span className="font-semibold text-sm">{f.nome}</span>
                <span className={`text-xs ${sub}`}>{tipos.filter(x => pr[x.id] != null && pr[x.id] !== '').slice(0, 4).map(x => `${x.curto || x.nome} ${eur(pr[x.id])}${x.id === 'hora' ? '/h' : ''}`).join(' · ') || 'sem preços'}</span>
                <span className="flex-1" />
                <span className={`text-xs ${sub}`}>{st.nAno} tarefa{st.nAno === 1 ? '' : 's'} em {ano} · pago <strong className="text-red-400">{eur(st.pago)}</strong>{st.nAno ? <> · margem <strong className={st.margem >= 0 ? (claro ? 'text-emerald-700' : 'text-emerald-400') : 'text-red-400'}>{eur(st.margem)}</strong></> : null}</span>
              </button>
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
                      <button type="button" onClick={() => { if (window.confirm(`Apagar "${f.nome}"? As tarefas onde aparece ficam como estão.`)) mudar(tr => ({ ...tr, freelancers: (tr.freelancers || []).filter(x => x.id !== f.id) })); }} className="text-xs text-red-400 hover:text-red-300">Apagar</button>
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
const nomesFicheiros = (trab, t) => {
  const fx = t.ficheiros || {};
  const jogo = jogoDaTarefa(trab, t);
  const cod = slugF((jogo && jogo.codigo) || (jogo ? iniciaisJogo(jogo.nome) : '')) || 'JOGO';
  const tipoP = trabPecas(t).find(p => p.tipo !== 'extra' && p.tipo !== 'outro');
  const tipo = slugF(fx.tipo) || (tipoP ? (TIPO_FICHEIRO[tipoP.tipo] || slugF(tipoP.tipo).slice(0, 3)) : 'VID');
  const conceito = slugF(fx.conceito || conceitoDoNome(t.nome));
  const versao = `V${String(fx.versao || (t.drive && (/_V(\d+)(?:_|$)/.exec(String(t.drive.pasta || '')) || [])[1]) || '1').replace(/^v/i, '')}`; // sem versão: V1
  const variacao = slugF(fx.variacao);
  const dia = fx.data || trabDia(new Date().toISOString()); // a data do nome é a do dia do export, a não ser que escolhas outra
  const ddmmyy = dia ? `${dia.slice(8, 10)}${dia.slice(5, 7)}${dia.slice(2, 4)}` : '';
  const dur = fx.duracao ? `${Math.round(Number(fx.duracao))}S` : '';
  const base = [conceito, versao, variacao].filter(Boolean).join('_');
  const formatos = (t.formatos && t.formatos.length ? t.formatos : []);
  return {
    jogo, cod, tipo, conceito, dia, base, ddmmyy, dur,
    pasta: conceito ? `${conceito} / ${base}` : '',
    ficheiros: formatos.map(f => ({ formato: f, nome: [cod, tipo, base, f.replace(':', 'X'), dur, ddmmyy].filter(Boolean).join('_') })),
  };
};
// "Abrir no After Effects": link aeproj:// tratado pelo lançador AbrirAE instalado no PC (procura o .aep pelo conceito,
// também no disco de arquivo, e lembra-se do projeto escolhido para cada tarefa)
const linkAE = (trab, t, clientes) => {
  const nf = nomesFicheiros(trab, t);
  const cli = (clientes || []).find(c => String(c.id) === String(t.cid));
  // só a versão que tu escolheste (ou a da pasta enviada para o Drive) — sem isso não desempata por versão
  const v = String((t.ficheiros && t.ficheiros.versao) || (/_V(\d+)(?:_|$)/.exec(String((t.drive && t.drive.pasta) || '')) || [])[1] || '').replace(/^v/i, '');
  const p = new URLSearchParams({ id: String(t.id), cliente: (cli && cli.nome) || '', jogo: (nf.jogo && nf.jogo.nome) || '', conceito: nf.conceito || '', versao: v ? `V${v}` : '' });
  return `aeproj://abrir/?${p.toString()}`;
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
const cartoesTrello = async (quadro, fresco = false) => {
  const c = cacheCartoes.get(quadro);
  if (!fresco && c && Date.now() - c.em < 120000) return c.lista;
  const j = await chamarTrello('cartoes', { quadro });
  cacheCartoes.set(quadro, { em: Date.now(), lista: j.cartoes || [] });
  return j.cartoes || [];
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
  const j = await driveApi(token, `${DRV}?q=${q}&fields=files(id,name,webViewLink)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`);
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
  const url = idExistente ? `https://www.googleapis.com/upload/drive/v3/files/${idExistente}?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink';
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
  if (ja >= 0) return { ok: true, linha: ja + 1, tab: f.title, jaExistia: true };
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
  return { ok: true, linha: linha + 1, tab: f.title };
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
const EnviarDrive = ({ t, trab, r, set, mudar, claro, sub, inputClass }) => {
  const [lista, setLista] = useState(() => cacheEnvio.get(t.id) || []); // { id, file, meta, formato, estado, prog, erro }
  const [aEnviar, setAEnviar] = useState(false);
  const [msg, setMsg] = useState('');
  const [resultado, setResultado] = useState(t.drive || null);
  const [copiadoS, setCopiadoS] = useState(false);
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
  const [versaoLote, setVersaoLote] = useState(null);
  const pecasN = trabPecas(t).reduce((a, p) => a + (Number(p.n) || 1), 0);
  const versoesTarefa = [...new Set([t.drive, ...((t.drive && t.drive.anteriores) || [])].filter(Boolean).map(d => Number(d.versao || (/_V(\d+)(?:_|$)/.exec(String(d.pasta || '')) || [])[1])).filter(n => n > 0))].sort((a, b) => a - b);
  const versaoConfirmada = v => String(versaoLote || fx.versao || v || versaoAnterior || '').replace(/^v/i, '');
  const versaoDe = v => versaoConfirmada(v) || '1'; // sem versão em lado nenhum: V1 (o Drive confirma ao enviar)
  const baseDe = v => [r.conceito, versaoDe(v) ? `V${versaoDe(v)}` : '', slugF(fx.variacao)].filter(Boolean).join('_');
  const nomeBase = [r.cod, r.tipo, baseDe(verSug)].filter(Boolean).join('_');
  const durDe = item => fx.duracao || (item.meta && item.meta.dur ? Math.round(item.meta.dur) : null);
  const nomeDe = item => (item.handle ? item.handle.name : item.file ? item.file.name : '');
  const nomeFinal = (item, v = verSug) => { const ext = (/\.[a-z0-9]{2,4}$/i.exec(nomeDe(item)) || ['.mp4'])[0].toLowerCase(); const d = durDe(item); return [r.cod, r.tipo, baseDe(v), item.formato ? item.formato.replace(':', 'X') : 'FORMATO', d ? `${d}S` : '', r.ddmmyy].filter(Boolean).join('_') + ext; };
  // Adivinhar a versão pelas pastas que já estão no Drive (CONCEITO_V1, _V2…): vídeo novo → a seguinte; variação/iteração → a última
  const novoVideo = trabPecas(t).some(p => ['video', 'video3d', 'ai_clip', 'aso'].includes(p.tipo));
  const [infoVersao, setInfoVersao] = useState(null); // { conceito, existe, versoes }
  const adivinharVersao = async token => {
    const info = await versoesNoDrive(token, raiz, r.conceito);
    setInfoVersao({ ...info, conceito: r.conceito });
    const max = info.versoes.length ? info.versoes[info.versoes.length - 1] : 0;
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
  const juntar = async (fs, handles = []) => {
    setMsg('');
    const novos = [];
    const arr = Array.from(fs || []);
    for (let i = 0; i < arr.length; i++) { const f = arr[i]; if (!f) continue; const meta = await lerVideo(f); novos.push({ id: Math.random().toString(36).slice(2), file: f, handle: handles[i] || null, nomeAntigo: f.name, meta, formato: formatoDoFicheiro(f.name, meta), estado: 'pronto', prog: 0 }); }
    if (!lista.length && !versaoLote && pecasN > 1 && versoesTarefa.length && versoesTarefa.length < pecasN) setVersaoLote(String(Math.max(...versoesTarefa) + 1));
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
          if (onde) { a.handleNovo = await renomearEm(onde, a.novo); feito = true; await lembrarPasta(onde.dir, chaves); }
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
        const durs = its.map(durDe).filter(Boolean);
        set({ formatos: [...new Set([...(t.formatos || []), ...its.map(x => x.formato).filter(Boolean)])], ficheiros: { ...fx, ...(!fx.versao ? { versao: versaoDe(verSug) } : {}), ...(!fx.duracao && durs.length ? { duracao: durs[0] } : {}) } });
      }
    }
    return { ok, erros, faltam };
  };
  const desfazerNomes = async () => {
    const alvos = historico.map(x => ({ id: x.itemId && lista.some(y => y.id === x.itemId) ? x.itemId : null, handle: x.handle, novo: x.antes }));
    const { ok, erros, faltam } = await renomearFicheiros(alvos, null, true);
    gravarHistorico(historico.filter((x, i) => !alvos[i].feito));
    setPedirPasta(null);
    setMsg(ok ? `↩ ${ok} ficheiro${ok === 1 ? '' : 's'} com o nome anterior outra vez${faltam.length ? ` · ${faltam.length} não encontrei` : ''}` : `⚠ Não consegui voltar ao nome anterior: ${erros[0] || (faltam.length ? 'não encontrei os ficheiros nas pastas que conheço' : 'sem autorização')}.`);
  };
  const [pedirPasta, setPedirPasta] = useState(null); // { alvos, depois } quando não encontrou os ficheiros
  const fimRenomear = ({ ok, erros, faltam }, alvos, depois) => {
    setPedirPasta(faltam.length ? { alvos: faltam, depois } : null);
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
  const verDrive = async () => {
    if (!resultado || !resultado.pastaId) return;
    setOcupadoDrive(true);
    try { const tk = tokenGuardado() || await tokenDrive(conta); const fs = await filhosDrive(tk, resultado.pastaId, false); setNoDrive(fs.sort((a, b) => a.name.localeCompare(b.name))); }
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
  const apagarNoDrive = async f => {
    if (aApagar !== f.id) { setAApagar(f.id); return; }
    setOcupadoDrive(true);
    try {
      const tk = tokenGuardado() || await tokenDrive(conta);
      await driveApi(tk, `${DRV}/${f.id}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      setNoDrive(l => (l || []).filter(x => x.id !== f.id));
      const reg = { ...resultado, enviados: (resultado.enviados || []).filter(x => x.id !== f.id && x.nome !== f.name) };
      setResultado(reg); set({ drive: reg });
      setMsg(`🗑 ${f.name} foi para o lixo do Drive (dá para recuperar lá durante 30 dias).`);
    } catch (e) { setMsg(`⚠ Não consegui apagar: ${e.message || e}`); }
    setAApagar(null); setOcupadoDrive(false);
  };
  const mudarItem = (id, patch) => setLista(l => l.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const repetidos = lista.filter(x => x.formato).map(x => x.formato).filter((f, i, a) => a.indexOf(f) !== i);
  // Vídeo novo com uma versão que já existe no Drive (e que não é a desta tarefa): não deixa avançar
  const versaoEscolhida = Number(versaoDe(verSug));
  const infoAtual = infoVersao && infoVersao.conceito === r.conceito ? infoVersao : null;
  const proximaVersao = infoAtual && infoAtual.versoes.length ? infoAtual.versoes[infoAtual.versoes.length - 1] + 1 : 1;
  const versaoOcupada = !!(novoVideo && infoAtual && infoAtual.versoes.includes(versaoEscolhida) && String(versaoAnterior || '') !== String(versaoEscolhida) && !versoesTarefa.includes(versaoEscolhida));
  const pronto = lista.length > 0 && lista.every(x => x.formato && x.file) && !repetidos.length && raiz && r.conceito && !versaoOcupada;
  const enviar = async () => {
    if (!pronto || aEnviar) return;
    setAEnviar(true); setMsg('A entrar na Google…');
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
        if (info.versoes.includes(Number(v)) && String(versaoAnterior || '') !== String(v) && !versoesTarefa.includes(Number(v))) {
          const prox = info.versoes[info.versoes.length - 1] + 1;
          throw new Error(`A V${v} já existe no Drive. Um vídeo novo tem de ser a V${prox} — carrega em "Usar V${prox}".`);
        }
      }
      const nomeVersao = baseDe(v) || r.conceito;
      pVersao = nomeVersao === r.conceito ? pConceito : await pastaDrive(token, pConceito.id, nomeVersao, true);
      const existentes = await filhosDrive(token, pVersao.id, false);
      const enviados = [];
      const paraRenomear = [];
      for (const item of lista) {
        const nome = nomeFinal(item, v);
        const ex = existentes.find(f => f.name === nome);
        mudarItem(item.id, { estado: 'a enviar', prog: 0 });
        setMsg(`A enviar ${nome}…`);
        try {
          const res = await enviarParaDrive(token, { file: item.file, nome, pasta: pVersao.id, idExistente: ex ? ex.id : null }, p => mudarItem(item.id, { prog: p }));
          mudarItem(item.id, { estado: 'feito', prog: 1, substituido: !!ex });
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
      const durs = lista.map(durDe).filter(Boolean);
      const formatos = [...new Set([...(t.formatos || []), ...lista.map(x => x.formato)])];
      set({ drive: reg, link: url, formatos, ficheiros: { ...fx, versao: String(v), ...(!fx.duracao && durs.length ? { duracao: durs[0] } : {}) } });
      // Spreadsheet do jogo: se for uma Google Sheet, junta a linha sozinha (nome com o link da pasta)
      let folha = null;
      if (jogo.sheet && enviados.length) {
        setMsg('A juntar à spreadsheet…');
        try { folha = await juntarNaSpreadsheet(token, jogo.sheet, reg.nomeBase, url, [jogo.nome, jogo.nomeFatura, ...(jogo.aliases || [])]); } catch (e) { folha = { erro: String(e.message || e) }; }
        reg.folha = folha;
        set({ drive: reg });
        setResultado({ ...reg });
      }
      // Trello: junta o link da pasta ao cartão desta tarefa (não mexe na lista do cartão)
      if (t.trello && t.trello.id && enviados.length) {
        setMsg('A juntar o link ao cartão do Trello…');
        try {
          await chamarTrello('comentar', { cartao: t.trello.id, texto: `${reg.nomeBase}\n${url}` });
          await chamarTrello('anexar', { cartao: t.trello.id, url, nome: reg.nomeBase || reg.pasta });
          reg.trello = { ok: true, em: new Date().toISOString() };
        } catch (e) { reg.trello = { erro: String(e.message || e) }; }
        set({ drive: reg }); setResultado({ ...reg });
      }
      setMsg(enviados.length === lista.length ? `✓ ${enviados.length} ficheiro${enviados.length === 1 ? '' : 's'} no Drive` : `Enviei ${enviados.length} de ${lista.length}. Vê os erros em baixo e tenta outra vez.`);
      if (enviados.length === lista.length) { setLista([]); setVersaoLote(null); }
    } catch (e) { setMsg(`⚠ ${e.message || e}`); }
    setAEnviar(false);
  };
  const btn = `px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`;
  if (!jogo) return null;
  return (
    <div className={`mt-3 pt-3 border-t space-y-2 ${claro ? 'border-slate-200' : 'border-slate-700/60'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-medium flex-1">Enviar para o Drive</p>
        {raiz && r.conceito && <span className={`text-[11px] truncate max-w-[60%] ${sub}`} title={`${statics ? 'Statics' : 'Vídeos'} › ${r.conceito} › ${baseDe(verSug)}`}>📁 {baseDe(verSug)}</span>}
      </div>
      {!raiz ? <p className={`text-xs ${sub}`}>Junta o link da pasta do Drive {statics ? 'dos banners/statics' : 'dos vídeos'} no jogo {jogo.nome} (cliente → Jogos).</p> : (
        <>
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
            <span className="text-[11px]">ou carrega para escolher</span>
            <input ref={inRef} type="file" multiple accept="video/*,image/*" className="hidden" onChange={e => { juntar(e.target.files); e.target.value = ''; }} />
          </div>
          {lista.length > 0 && (pecasN > 1 || versoesTarefa.length > 0) && (() => {
            const atual = Number(versaoDe(verSug));
            const opcoes = [...new Set([...versoesTarefa, atual, (versoesTarefa.length ? Math.max(...versoesTarefa) : atual) + (versoesTarefa.length ? 1 : 0)])].filter(n => n > 0).sort((a, b) => a - b);
            return (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className={sub}>Versão destes ficheiros:</span>
                {opcoes.map(n => (
                  <button key={n} type="button" disabled={aEnviar} onClick={() => setVersaoLote(String(n))}
                    className={`px-2 py-0.5 rounded-md border font-medium ${atual === n ? 'border-blue-500 bg-blue-500/15 text-blue-400' : claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>
                    V{n}{versoesTarefa.includes(n) ? <span className={`ml-1 font-normal ${sub}`}>já enviada</span> : ''}
                  </button>
                ))}
                {pecasN > 1 && <span className={`text-[10px] ${sub}`}>· esta tarefa tem {pecasN} peças: cada uma vai para a sua pasta</span>}
              </div>
            );
          })()}
          {lista.length > 0 && (
            <div className="space-y-1.5">
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
                  <p className={`truncate text-[10px] opacity-70 ${sub}`}>{item.renomeado && item.nomeAntigo && item.nomeAntigo !== nomeDe(item) ? <>✓ renomeado no PC · era {item.nomeAntigo}</> : <>de {nomeDe(item)}</>}{item.meta && item.meta.w ? ` · ${item.meta.w}×${item.meta.h}` : ''}{item.meta && item.meta.dur ? ` · ${Math.round(item.meta.dur)}s` : ''}</p>
                </div>
              ))}
              {repetidos.length > 0 && <p className="text-xs text-amber-500">Há dois ficheiros com o mesmo formato ({[...new Set(repetidos)].join(', ')}).</p>}
              {lista.some(x => !x.formato) && <p className="text-xs text-amber-500">Escolhe o formato dos ficheiros com "?".</p>}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="flex-1" />
                {comHandle.length > 0 ? (
                  <button type="button" disabled={aEnviar || comHandle.every(x => x.renomeado) || repetidos.length > 0 || versaoOcupada} onClick={renomearAgora} title={!temVersao ? 'Primeiro confirma a versão no Drive, depois muda o nome dos ficheiros no PC' : 'Muda o nome dos ficheiros no teu PC para os nomes acima'}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40 ${claro ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/5'}`}>{comHandle.every(x => x.renomeado) ? '✓ Renomeados no PC' : '✏ Renomear no PC'}</button>
                ) : <span className={`text-[10px] ${sub}`} title="O browser só deixa mudar o nome de ficheiros arrastados do Explorador (no Chrome)">Arrasta do Explorador para poderes renomear no PC</span>}
                <button type="button" disabled={!pronto || aEnviar} onClick={enviar} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">{aEnviar ? 'A enviar…' : `Enviar ${lista.length} para o Drive`}</button>
              </div>
            </div>
          )}
          {versaoOcupada && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-500">
              <span>⚠ A V{versaoEscolhida} já existe no Drive. Um vídeo novo tem de ser a <b>V{proximaVersao}</b>.</span>
              <button type="button" onClick={() => { set({ ficheiros: { ...fx, versao: String(proximaVersao) } }); setVerSug(String(proximaVersao)); }} className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-medium">Usar V{proximaVersao}</button>
            </div>
          )}
          {r.conceito && (infoVersao && infoVersao.conceito === r.conceito ? (
            <p className={`text-[11px] ${sub}`}>{infoVersao.existe
              ? <>No Drive: {infoVersao.versoes.length ? <b>{infoVersao.versoes.map(v => `V${v}`).join(', ')}</b> : 'só a pasta'}{!fx.versao && !versaoAnterior ? <> → {novoVideo ? 'vídeo novo' : 'variação'}: <b>V{versaoDe(verSug)}</b></> : null}</>
              : <>Conceito novo no Drive → <b>V1</b></>}</p>
          ) : raiz ? <button type="button" onClick={verVersoes} className="text-[11px] text-blue-400 hover:text-blue-300 text-left">🔎 Ver versões no Drive</button> : null)}
          {lista.length > 0 && !fx.versao && !(infoVersao && infoVersao.conceito === r.conceito) && (
            <p className={`text-[11px] ${sub}`}>Versão: <b>V{versaoDe(verSug)}</b> {versaoAnterior ? '(a da última vez)' : verSug ? `(pelo Drive: ${novoVideo ? 'vídeo novo → a seguinte' : 'variação → a última'})` : '(por agora — ao enviar a app confirma no Drive se já há outras)'} · para outra, escreve-a em "Versão" acima.</p>
          )}
          {msg && <p className={`text-xs ${/^⚠/.test(msg) ? 'text-red-400' : /^✓/.test(msg) ? 'text-emerald-500' : sub}`}>{msg}</p>}
          {semAcesso.length > 0 && (
            <button type="button" onClick={darAcesso} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/15 border border-blue-500/50 text-blue-400 hover:bg-blue-500/25">🔓 Voltar a abrir os {semAcesso.length} ficheiro{semAcesso.length === 1 ? '' : 's'} (o browser pede autorização depois de recarregar)</button>
          )}
          {historico.length > 0 && !aEnviar && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button type="button" onClick={desfazerNomes} className={btn} title={historico.map(x => `${x.depois} → ${x.antes}`).join('\n')}>↩ Voltar ao nome anterior ({historico.length} ficheiro{historico.length === 1 ? '' : 's'})</button>
              <span className={`${sub} truncate max-w-full`}>ex.: {historico[0].antes}</span>
            </div>
          )}
          {pedirPasta && (
            <button type="button" onClick={escolherEContinuar} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-500 hover:bg-amber-500/25">📁 Escolher a pasta dos exports</button>
          )}
          {renomeados && renomeados.length > 0 && (
            <button type="button" onClick={() => renomearNoPc(renomeados)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10">✏ Dar o mesmo nome {renomeados.length === 1 ? 'ao ficheiro' : `aos ${renomeados.length} ficheiros`} no PC</button>
          )}
          {resultado && resultado.folha && (
            <p className={`text-xs ${resultado.folha.ok ? 'text-emerald-500' : resultado.folha.xlsx ? 'text-amber-500' : 'text-red-400'}`}>
              {resultado.folha.ok ? `✓ ${resultado.folha.jaExistia ? 'Já estava' : 'Juntei'} na spreadsheet (${resultado.folha.tab}, linha ${resultado.folha.linha})`
                : resultado.folha.xlsx ? `O link de spreadsheet deste jogo ainda aponta para o ficheiro Excel${resultado.folha.nomeFicheiro ? ` "${resultado.folha.nomeFicheiro}"` : ''} — a Google não deixa as apps escreverem nele. Se já tens a versão Google Sheets, cola o link novo em cliente → Jogos → ${jogo.nome} → Spreadsheet e carrega em "Juntar à spreadsheet agora" (não precisas de enviar outra vez).`
                : `Não consegui escrever na spreadsheet: ${resultado.folha.erro}`}
            </p>
          )}
          {resultado && resultado.trello && <p className={`text-xs ${resultado.trello.ok ? 'text-emerald-500' : 'text-red-400'}`}>{resultado.trello.ok ? '✓ Link da pasta juntado ao cartão do Trello' : `Não consegui juntar o link ao Trello: ${resultado.trello.erro}`}</p>}
          {resultado && resultado.url && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a href={urlAbrir(resultado.url, t.cid)} target="_blank" rel="noopener noreferrer" className={btn}>📁 Abrir a pasta no Drive{resultado.anteriores && resultado.anteriores.length ? ` (${resultado.versao ? `V${resultado.versao}` : resultado.pasta})` : ''}</a>
              {(resultado.anteriores || []).map(d => <a key={d.pastaId} href={urlAbrir(d.url, t.cid)} target="_blank" rel="noopener noreferrer" className={btn} title={d.pasta}>📁 {d.versao ? `V${d.versao}` : (/_V(\d+)(?:_|$)/.exec(String(d.pasta || '')) || ['', ''])[1] ? `V${(/_V(\d+)(?:_|$)/.exec(String(d.pasta || '')) || [])[1]}` : d.pasta}</a>)}
              <button type="button" onClick={async () => { await copiarComLink(resultado.nomeBase || nomeBase, resultado.url); setCopiadoS(true); setTimeout(() => setCopiadoS(false), 1600); }} className={`${btn} ${copiadoS ? '!border-emerald-400 text-emerald-400' : ''}`} title="Copia o nome com o link da pasta — cola na coluna Creative da spreadsheet">{copiadoS ? '✓ copiado — cola na spreadsheet' : '📋 Copiar para a spreadsheet'}</button>
              {jogo.sheet && <a href={urlAbrir(jogo.sheet, t.cid)} target="_blank" rel="noopener noreferrer" className={btn}>Abrir a spreadsheet</a>}
              {jogo.sheet && resultado.nomeBase && !(resultado.folha && resultado.folha.ok) && <button type="button" disabled={ocupadoDrive} onClick={juntarFolhaAgora} className={`${btn} !border-blue-500/50 text-blue-400 disabled:opacity-50`}>📊 Juntar à spreadsheet agora</button>}
              {resultado.pastaId && !noDrive && <button type="button" disabled={ocupadoDrive} onClick={verDrive} className={`${btn} disabled:opacity-50`}>{ocupadoDrive ? 'A ver…' : '🗂 Ver / apagar ficheiros no Drive'}</button>}
            </div>
          )}
          {noDrive && (
            <div className={`rounded-lg border ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
              <div className={`flex items-center gap-2 px-3 py-1.5 border-b text-xs ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
                <span className="font-medium flex-1 min-w-0 truncate">No Drive · {resultado && resultado.pasta}</span>
                <button type="button" disabled={ocupadoDrive} onClick={verDrive} className={`${sub} hover:text-blue-400`} title="Atualizar">↻</button>
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
                          <button type="button" onClick={() => setAApagar(null)} className={`shrink-0 ${sub} hover:text-blue-400`}>não</button>
                        </>
                      ) : <button type="button" onClick={() => apagarNoDrive(f)} className={`shrink-0 ${sub} hover:text-red-400`} aria-label={`Apagar ${f.name} do Drive`} title="Apagar do Drive (vai para o lixo)">🗑</button>}
                    </div>
                  ))}
                </div>
              )}
              <p className={`px-3 py-1.5 text-[10px] ${sub}`}>Para substituir um vídeo, arrasta a versão nova para cima: fica com o mesmo nome e troca a antiga.</p>
            </div>
          )}
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] ${sub}`}>
            <span className="flex-1 min-w-[160px] truncate" title="Os ficheiros vão direto do computador para o Drive — nada fica guardado na app.">Conta: {conta ? <b>{conta}</b> : 'a tua conta Google'}</span>
            {sempre ? (
              <span className="text-emerald-500">🔒 Ligado · <button type="button" onClick={async () => { try { await desligarDriveSempre(conta); setSempre(false); setMsg('Desliguei a ligação permanente ao Drive desta conta.'); } catch (e) { setMsg(`⚠ ${e.message || e}`); } }} className={`underline ${sub} hover:text-red-400`}>desligar</button></span>
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
const NomesFicheiros = ({ t, trab, set, mudar, claro, inputClass, lab, sub, caixa }) => {
  const fx = t.ficheiros || {};
  const r = nomesFicheiros(trab, t);
  const [copiado, setCopiado] = useState('');
  useEffect(() => { if (!copiado) return undefined; const i = setTimeout(() => setCopiado(''), 1400); return () => clearTimeout(i); }, [copiado]);
  const setF = patch => set({ ficheiros: { ...fx, ...patch } });
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
    (trab.tarefas || []).forEach(x => { if (x.id === t.id) return; const j = jogoDaTarefa(trab, x); if (!j || j.id !== jogoD.id) return; const doNome = conceitoDoNome(x.nome); const c = (x.ficheiros && x.ficheiros.conceito) || (doNome && doNome !== String(x.nome || '').trim() ? doNome : ''); if (c && !/^\d+\s*x\s*\d+$/i.test(c)) out.push(c); });
    return out;
  }, [trab.tarefas, jogoD && jogoD.id, t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const opcoesC = useMemo(() => {
    const vistos = new Map();
    (conceitosD || []).forEach(n => { const k = slugF(n); if (k && !vistos.has(k)) vistos.set(k, { nome: n, drive: true }); });
    conceitosLocais.forEach(n => { const k = slugF(n); if (k && !vistos.has(k)) vistos.set(k, { nome: n, drive: false }); });
    return [...vistos.values()].sort((a, b) => (b.drive - a.drive) || a.nome.localeCompare(b.nome, 'pt'));
  }, [conceitosD, conceitosLocais]);
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
        <p className="text-sm font-medium">Nomes dos ficheiros</p>
        <span className={`text-xs ${sub}`}>{r.jogo ? `${r.jogo.nome} (${r.cod})` : 'sem jogo'}{r.jogo && !r.jogo.codigo ? ' · código no separador Jogos' : ''}</span>
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
        <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Versão</span><TxtIn valor={fx.versao} onGravar={v => setF({ versao: v.replace(/^v/i, '') })} placeholder="ex.: 4" className={ic} /></label>
        <label className="flex flex-col gap-1 col-span-1 sm:col-span-2 min-w-0"><span className={lab}>Variação</span><TxtIn valor={fx.variacao} onGravar={v => setF({ variacao: v })} placeholder="ex.: Reaction" className={ic} /></label>
        <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Duração (s)</span><NumIn valor={fx.duracao ?? null} placeholder="59" decimal={false} onGravar={v => setF({ duracao: v })} className={ic} /></label>
        <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Tipo</span><TxtIn valor={fx.tipo} onGravar={v => setF({ tipo: v })} placeholder={r.tipo} className={ic} /></label>
        <label className="flex flex-col gap-1 col-span-2 min-w-0"><span className={lab}>Data</span><input key={t.id + 'fd' + (fx.data || '')} type="date" defaultValue={fx.data || r.dia} onBlur={e => { if (e.target.value && e.target.value !== (fx.data || r.dia)) setF({ data: e.target.value }); }} className={ic} /></label>
      </div>
      {raizD && (
        <div className="text-[11px] -mt-1">
          {!conceitosD ? <button type="button" disabled={aVerD} onClick={() => carregarConceitos(true)} className="text-blue-400 hover:text-blue-300 disabled:opacity-50">{aVerD ? 'A ver o Drive…' : '🔎 Ver conceitos no Drive'}</button>
            : conceitoNovo ? (
              <span className="text-amber-500">⚠ Conceito novo no Drive (V1).{parecidos.length > 0 && <> Querias dizer {parecidos.map((n, i) => <React.Fragment key={n}>{i ? ', ' : ' '}<button type="button" onClick={() => { setF({ conceito: n }); setTxtConceito(null); }} className="underline text-blue-400 hover:text-blue-300">{n}</button></React.Fragment>)}?</>}</span>
            ) : conceitoAtual ? <span className="text-emerald-500">✓ Já existe no Drive</span>
            : <span className={sub}>{conceitosD.length} conceitos no Drive — escolhe da lista ao escrever</span>}
        </div>
      )}
      {!r.ficheiros.length ? <p className={`text-xs ${sub}`}>Escolhe os formatos em Entrega para veres os nomes.</p> : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2"><span className={`shrink-0 ${sub}`}><IcoT n="pasta" className="w-3.5 h-3.5" /></span><code className="flex-1 min-w-0 truncate text-xs" title={r.pasta}>{r.pasta}</code>{botaoCopiar(r.pasta.split(' / ').pop(), 'pasta')}</div>
          {r.ficheiros.map(f => (
            <div key={f.formato} className="flex items-center gap-2"><span className={`text-xs w-9 shrink-0 ${sub}`}>{f.formato}</span><code className="flex-1 min-w-0 break-all leading-snug text-xs" title={f.nome}>{f.nome}</code>{botaoCopiar(f.nome, f.formato)}</div>
          ))}
          {r.ficheiros.length > 1 && <div className="flex justify-end">{botaoCopiar(r.ficheiros.map(f => f.nome).join('\n'), 'todos')}</div>}
        </div>
      )}
      <EnviarDrive t={t} trab={trab} r={r} set={set} mudar={mudar} claro={claro} sub={sub} inputClass={inputClass} />
      <TrelloTarefa t={t} trab={trab} set={set} claro={claro} sub={sub} />
    </div>
  );
};

// ── Jogos de um cliente (cartões com cor, outros nomes, Drive e spreadsheet) ──
const JogosCliente = ({ cid, trab, cu, clientes, ano, theme, inputClass, mudar, notasDe, onAbrirNota, onNovaNota }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const [nome, setNome] = useState('');
  const [corAberta, setCorAberta] = useState(null);
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
      </div>
      {!jogos.length && <p className={`text-sm ${sub}`}>Ainda não há jogos. Cria um, ou deteta-os pelos nomes das listas (ex.: "44 - Mahjong - Oct" → Mahjong).</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
        {jogos.map(j => {
          const st = stats(j);
          const set = patch => mudar(tr => opJogo(tr, j.id, patch));
          return (
            <div key={j.id} className={`rounded-xl border p-3 space-y-2.5 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`} style={{ borderLeft: `4px solid ${j.cor}` }}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCorAberta(corAberta === j.id ? null : j.id)} className="w-6 h-6 rounded-md shrink-0 ring-1 ring-black/10" style={{ background: j.cor }} aria-label={`Cor de ${j.nome}`} title="Mudar a cor" />
                <TxtIn valor={j.nome} onGravar={v => v && set({ nome: v })} className={`${inputClass} text-sm py-1 font-semibold`} />
                <button type="button" onClick={() => { if (window.confirm(`Apagar o jogo "${j.nome}"? As listas e as tarefas ficam como estão.`)) mudar(tr => opApagarJogo(tr, j.id)); }} className={`shrink-0 text-xs ${sub} hover:text-red-400`} aria-label={`Apagar ${j.nome}`}>✕</button>
              </div>
              {corAberta === j.id && (
                <div className="flex flex-wrap gap-1.5">{CORES_JOGO.map(c => <button key={c} type="button" onClick={() => { set({ cor: c }); setCorAberta(null); }} className={`w-6 h-6 rounded-md ${j.cor === c ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`} style={{ background: c }} aria-label={`Cor ${c}`} />)}</div>
              )}
              <p className={`text-xs ${sub}`}>{st.listas} lista{st.listas === 1 ? '' : 's'} · {st.tarefas} tarefa{st.tarefas === 1 ? '' : 's'} · <span className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(st.valor)}</span> em {ano}</p>
              <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                <Campo rot="Outros nomes (vírgulas)"><TxtIn valor={(j.aliases || []).join(', ')} onGravar={v => set({ aliases: [...new Set(v.split(',').map(a => a.trim()).filter(Boolean))] })} placeholder="ex.: Win Money Mahjong" className={ic} /></Campo>
                <Campo rot="Nome na fatura"><TxtIn valor={j.nomeFatura} onGravar={v => set({ nomeFatura: v })} placeholder={j.nome} className={ic} /></Campo>
                <Campo rot="Código"><TxtIn valor={j.codigo} onGravar={v => set({ codigo: v })} placeholder="ex.: MJ" className={ic} /></Campo>
              </div>
              <Campo rot="Pasta do Drive — vídeos"><div className="flex items-center"><TxtIn valor={j.drive} onGravar={v => set({ drive: v })} placeholder="https://drive.google.com/…" className={ic} />{link(j.drive)}</div></Campo>
              <Campo rot="Pasta do Drive — banners / statics"><div className="flex items-center"><TxtIn valor={j.driveStatics} onGravar={v => set({ driveStatics: v })} placeholder="https://drive.google.com/… (opcional)" className={ic} />{link(j.driveStatics)}</div></Campo>
              <Campo rot="Spreadsheet"><div className="flex items-center"><TxtIn valor={j.sheet} onGravar={v => set({ sheet: v })} placeholder="https://docs.google.com/spreadsheets/…" className={ic} />{link(j.sheet)}</div></Campo>
              <TrelloJogo j={j} set={set} ic={ic} sub={sub} claro={claro} link={link} />
              {onAbrirNota && <div className={`pt-1 border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}><p className={`text-xs mb-0.5 ${sub}`}>Notas</p><NotasLigadas compacto lista={notasDe ? notasDe('jogo', j.id) : []} onAbrir={onAbrirNota} onNova={onNovaNota ? () => onNovaNota('jogo', j.id, j.nome) : null} claro={claro} sub={sub} /></div>}
            </div>
          );
        })}
      </div>
      <p className={`text-[11px] ${sub}`}>As listas novas com o nome do jogo (ex.: "45 - Mahjong - Nov") ligam-se sozinhas e ficam com a cor dele. O código, a pasta do Drive e a spreadsheet vão servir para dar nome aos ficheiros e fazer o upload automático mais tarde.</p>
    </div>
  );
};

// Trello do jogo: o quadro e a lista onde a app cria os cartões novos
const TrelloJogo = ({ j, set, ic, sub, claro, link }) => {
  const [listas, setListas] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = async () => {
    setMsg('A ler o quadro…');
    try { const q = await chamarTrello('quadro', { quadro: j.trello }); setListas(q.listas || []); setMsg(`✓ ${q.nome}`); if (!j.trelloNome || j.trelloNome !== q.nome) set({ trelloNome: q.nome }); }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
  };
  return (
    <div className="space-y-1.5">
      <Campo rot="Quadro do Trello (opcional)"><div className="flex items-center"><TxtIn valor={j.trello} onGravar={v => { set({ trello: v, trelloLista: v ? j.trelloLista : null }); setListas(null); setMsg(''); }} placeholder="https://trello.com/b/…" className={ic} />{link(j.trello)}</div></Campo>
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
              <button type="button" onClick={carregar} className="text-blue-400 hover:text-blue-300">{j.trelloLista ? 'mudar' : 'escolher a lista'}</button>
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
  const quadro = jogo && !jogo.semJogo ? jogo.trello : null;
  const [parecidos, setParecidos] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');
  const [nome, setNome] = useState(t.nome || '');
  useEffect(() => { setNome(t.nome || ''); setParecidos(null); setMsg(''); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!quadro) return null;
  const btn = `px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} disabled:opacity-50`;
  const procurar = async () => {
    setOcupado(true); setMsg('');
    try { const cs = await cartoesTrello(quadro, true); const ps = parecidosTrello(cs, t.nome); setParecidos(ps); if (!ps.length) setMsg('Não encontrei nenhum cartão com um nome parecido.'); }
    catch (e) { setMsg(`⚠ ${e.message || e}`); }
    setOcupado(false);
  };
  const criar = async () => {
    if (!jogo.trelloLista) { setMsg('⚠ Escolhe primeiro a lista dos cartões novos no jogo (cliente → Jogos).'); return; }
    setOcupado(true); setMsg('');
    try {
      // Antes de criar, confirma que não há já um cartão com este nome (a Sophie pode tê-lo criado)
      const cs = await cartoesTrello(quadro, true);
      const igual = cs.find(c => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
      if (igual) { set({ trello: { id: igual.id, url: igual.url, nome: igual.nome } }); setMsg('✓ Já havia um cartão com este nome — liguei a esse.'); }
      else {
        const c = await chamarTrello('criar', { lista: jogo.trelloLista.id, nome: nome.trim() || t.nome });
        set({ trello: { id: c.id, url: c.url, nome: c.nome } }); cacheCartoes.delete(quadro);
        setMsg(`✓ Cartão criado em "${jogo.trelloLista.nome}".`);
      }
    } catch (e) { setMsg(`⚠ ${e.message || e}`); }
    setOcupado(false);
  };
  return (
    <div className={`mt-3 pt-3 border-t space-y-2 ${claro ? 'border-slate-200' : 'border-slate-700/60'}`}>
      <p className="text-sm font-medium">Trello <span className={`text-xs font-normal ${sub}`}>· {jogo.trelloNome || 'quadro do jogo'}</span></p>
      {t.trello && t.trello.id ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a href={t.trello.url} target="_blank" rel="noopener noreferrer" className={`${btn} !border-blue-500/50 text-blue-400`}>Abrir o cartão ↗</a>
          <span className={`truncate max-w-[60%] ${sub}`} title={t.trello.nome}>{t.trello.nome}</span>
          <button type="button" onClick={() => set({ trello: null })} className={`${sub} hover:text-red-400`} title="Desligar este cartão da tarefa (não apaga nada no Trello)">desligar</button>
          <p className={`w-full text-[11px] ${sub}`}>Quando enviares para o Drive, a app junta o link da pasta a este cartão.</p>
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
                  <button type="button" onClick={() => { set({ trello: { id: c.id, url: c.url, nome: c.nome } }); setParecidos(null); setMsg('✓ Ligado.'); }} className="shrink-0 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">Ligar</button>
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

// Notas (do separador Notas) que falam de um cliente, jogo ou tarefa
const NotasLigadas = ({ lista, onAbrir, onNova, claro, sub, caixa, titulo = 'Notas', compacto = false }) => {
  if (!onAbrir) return null;
  const l = lista || [];
  return (
    <div className={compacto ? 'space-y-1' : `${caixa} space-y-1.5`}>
      {!compacto && <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium flex items-center gap-1.5"><IcoT n="nota" className="w-4 h-4" /> {titulo} {l.length > 0 && <span className={`text-xs font-normal ${sub}`}>{l.length}</span>}</p>
        {onNova && <button type="button" onClick={onNova} className="text-xs text-blue-400 hover:text-blue-300">+ Nova nota</button>}</div>}
      {l.slice(0, compacto ? 3 : 6).map(p => (
        <button key={p.id} type="button" onClick={() => onAbrir(p.id)} className={`w-full text-left px-2 py-1.5 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <span className="block text-sm truncate">{p.titulo || 'Sem título'}</span>
          {!compacto && <span className={`block text-[11px] truncate ${sub}`}>{p.txt ? p.txt.slice(0, 90) : ''}</span>}
        </button>
      ))}
      {l.length > (compacto ? 3 : 6) && <p className={`px-2 text-[11px] ${sub}`}>+{l.length - (compacto ? 3 : 6)} no separador Notas</p>}
      {!l.length && !compacto && <p className={`px-2 text-xs ${sub}`}>Nenhuma nota com @ a falar disto. Escreve @ numa nota para ligar.</p>}
      {compacto && onNova && <button type="button" onClick={onNova} className="px-2 text-[11px] text-blue-400 hover:text-blue-300">+ Nova nota</button>}
    </div>
  );
};
// Recibos de um cliente (os que juntas em Receitas), por ano
const RecibosCliente = ({ lista, onAbrirFicheiro, onJuntarFicheiro, onIrMes, claro, sub }) => {
  const [aEnviar, setAEnviar] = useState(null);
  const inRef = useRef(null); const alvo = useRef(null);
  const [anoAberto, setAnoAberto] = useState(null);
  const anos = [...new Set((lista || []).map(r => r.ano))].sort((a, b) => b - a);
  if (!anos.length) return <p className={`text-sm ${sub}`}>Ainda não há recibos deste cliente. Junta-os em Receitas.</p>;
  const num = v => Number(v) || 0;
  const ili = r => (r.valIliq != null && r.valIliq !== '' ? num(r.valIliq) : num(r.val));
  const mesesN = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dataTxt = r => (r.data && /^\d{4}-\d{2}-\d{2}/.test(r.data) ? `${r.data.slice(8, 10)}/${r.data.slice(5, 7)}` : `${mesesN[r.mes - 1]}`);
  const semPdf = (lista || []).filter(r => !r.temFicheiro).length;
  return (
    <div className="space-y-4">
      <input ref={inRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={async e => {
        const f = e.target.files && e.target.files[0]; e.target.value = ''; const r = alvo.current; if (!f || !r) return;
        setAEnviar(`${r.k}:${r.id}`);
        try { await onJuntarFicheiro(r.k, r.id, f); } catch (er) { console.error('Recibo:', er); window.alert('Não consegui enviar o PDF.'); }
        setAEnviar(null);
      }} />
      {semPdf > 0 && <p className={`text-xs ${sub}`}>{semPdf} recibo{semPdf === 1 ? '' : 's'} sem PDF guardado na app — só os que juntaste com o ficheiro (ex.: lidos pela IA) abrem aqui. Usa "+ PDF" para juntar os que faltam.</p>}
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
                  <div key={`${r.k}:${r.id}`} className={`grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[64px_minmax(0,1fr)_96px_80px_80px_96px_170px] gap-x-3 gap-y-0.5 px-3 py-2 items-center border-t text-sm ${claro ? 'border-slate-100' : 'border-white/[0.04]'}`}>
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
                      {r.temFicheiro && onAbrirFicheiro && <button type="button" onClick={() => onAbrirFicheiro(r.k, r.id)} className={`px-2 py-1 rounded-md text-xs ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'} text-emerald-400 inline-flex items-center gap-1`} title="Abrir o recibo">📎 PDF</button>}
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
    </div>
  );
};
const PDF_LARG = { F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500], F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556], F3: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500] };

// ── PDF da fatura (sem bibliotecas): Helvetica, A4, mesmo desenho dos modelos ──
const pdfBytes = s => { const out = []; for (const ch of String(s == null ? '' : s)) { const c = ch.codePointAt(0); const m = { 0x20AC: 0x80, 0x2013: 0x96, 0x2014: 0x97, 0x2019: 0x92, 0x2018: 0x91, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2026: 0x85 }; if (m[c]) out.push(m[c]); else if (c >= 32 && c < 256) out.push(c); else if (c === 10 || c === 9) out.push(32); else out.push(63); } return out; };
const pdfLarg = (s, f, tam) => pdfBytes(s).reduce((a, c) => a + (PDF_LARG[f][c - 32] || 500), 0) * tam / 1000;
const pdfTxt = s => pdfBytes(s).map(c => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : String.fromCharCode(c))).join('');
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
const MESES_PT_F = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ORDEM_TIPOS_F = ['video', 'variacao', 'iteracao', 'hook', 'aso', 'ai_clip', 'video3d', 'banner', 'banner_var', 'icone', 'feature', 'screenshots'];
const NOTA_IVA_UE = 'VAT: 0% – Exempt under Article 6 (6) (a) of the Portuguese VAT Code (Intra-Community supply of services)';
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
const FaturasCliente = ({ c, trab, mudar, cu, clientes, ano, mesNum, theme, inputClass, onEnviarAnexo, onCriarRecibo, showToast, onAbrirTarefa }) => {
  const claro = useClaro(theme);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const caixa = `rounded-xl border p-4 ${claro ? 'border-slate-200 bg-white' : 'border-white/[0.06] bg-slate-900/30'}`;
  const ic = `${inputClass} text-sm py-1.5`;
  const [mes, setMes] = useState(() => { try { const x = localStorage.getItem('trab-fat-mes'); localStorage.removeItem('trab-fat-mes'); if (x) { const [a, m] = x.split('-').map(Number); if (a && m) return { a, m }; } } catch (e) { /* sem armazenamento */ } return { a: ano, m: mesNum }; });
  const pref = `${mes.a}-${String(mes.m).padStart(2, '0')}-`;
  const mesK = pref.slice(0, 7);
  const cid = c.id;
  const doCliente = (trab.tarefas || []).filter(t => String(t.cid) === String(cid));
  const faturas = (trab.faturas || []).filter(f => String(f.cid) === String(cid)).sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.numero || 0) - (a.numero || 0));
  const inicio = faturas.length ? faturas.map(f => f.mes).sort()[0] : null;
  // Tarefas do mês ainda por faturar, já faturadas, e as que ficaram para trás
  const doMes = doCliente.filter(t => trabEntrega(t).startsWith(pref));
  const jaFat = t => !!(t.faturaId || t.faturada);
  const porFaturar = doMes.filter(t => !jaFat(t));
  const jaFaturadas = doMes.filter(jaFat);
  const atrasadas = inicio ? doCliente.filter(t => !jaFat(t) && trabEntrega(t) && trabEntrega(t) < pref && trabEntrega(t).slice(0, 7) >= inicio) : [];
  const porEntregar = doCliente.filter(t => t.estado === 'todo' || t.estado === 'curso');
  const [incluirAtras, setIncluirAtras] = useState(true);
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
  const ivaTaxa = Number(fat.ivaFatura) || 0;
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
    notaIva: fat.notaIva === '-' ? '' : fat.notaIva != null && fat.notaIva !== '' ? fat.notaIva : (ivaTaxa > 0 || ((c.recibo || {}).pais || 'PT') === 'PT' ? '' : NOTA_IVA_UE), // clientes portugueses: sem a frase da isenção
    pagamento: ['Payment via bank transfer to:', [em.iban ? `IBAN: ${em.iban}` : '', em.swift ? `SWIFT/BIC: ${em.swift}` : ''].filter(Boolean).join(' ')],
  });
  const nomeFicheiro = (n, iso) => { const [y, m] = String(iso).split('-').map(Number); return `${n}_Invoice_${MESES_EN_F[(m || 1) - 1]}_${String(y).slice(2)}.pdf`; };
  const descarregar = (u8, nome) => { const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
  const verPdf = u8 => { const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })); window.open(url, '_blank', 'noopener'); };
  const avisos = [];
  if (!em.nome || !em.iban) avisos.push('Faltam os teus dados (nome, morada, NIF, IBAN) — preenche em "Os meus dados".');
  if (!fat.nomeLegal) avisos.push('Falta o nome legal do cliente na Ficha → Faturação.');
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
    } catch (e) { console.error('Fatura:', e); if (showToast) showToast('Não consegui gerar a fatura.', 'error'); }
    setAGerar(false);
  };
  const anular = f => {
    if (!window.confirm(`Anular a fatura nº ${f.numero}? As tarefas voltam a ficar por faturar.${f.recibo ? '\n\nO registo em Receitas não é apagado — apaga-o lá se for preciso.' : ''}`)) return;
    mudar(tr => ({
      ...tr,
      faturas: (tr.faturas || []).filter(x => x.id !== f.id),
      tarefas: (tr.tarefas || []).map(t => (t.faturaId === f.id ? (({ faturaId, ...r }) => r)(t) : t)),
      pastas: (tr.pastas || []).map(p => (p.orcamento && (p.orcamento.extras || []).some(e => e.faturaId === f.id) ? { ...p, orcamento: { ...p.orcamento, extras: p.orcamento.extras.map(e => (e.faturaId === f.id ? (({ faturaId, ...r }) => r)(e) : e)) } } : p)),
    }));
  };
  const abrirAntiga = f => { if (f.pdf && f.pdf.url) { window.open(f.pdf.url, '_blank', 'noopener'); return; } verPdf(gerarPdfFatura({ ...dadosPdf(), emissor: { ...dadosPdf().emissor, para: f.para || dadosPdf().emissor.para }, data: dataEN(f.data), numero: f.numero, linhas: f.linhas, subtotal: f.subtotal, ivaTaxa: f.ivaTaxa, ivaValor: f.ivaValor, total: f.total, notaIva: f.notaIva })); };
  const chip = `px-2 py-0.5 rounded-md text-[11px]`;
  return (
    <div className="space-y-4 max-w-4xl">
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
                {(l.tarefas || []).length > 0 && <p className={`col-span-3 text-[11px] ${sub}`}>{l.tarefas.length} tarefa{l.tarefas.length === 1 ? '' : 's'}: {l.tarefas.map(id => doCliente.find(t => t.id === id)).filter(Boolean).map((t, k) => <React.Fragment key={t.id}>{k > 0 && ' · '}<button type="button" onClick={() => onAbrirTarefa && onAbrirTarefa(t.id)} className="hover:text-blue-400 hover:underline" title="Abrir a tarefa">{t.nome}</button></React.Fragment>)}</p>}
              </div>
            );
          })}
          <div className={`flex items-center gap-3 px-3 py-2 border-t ${claro ? 'border-slate-100' : 'border-white/[0.05]'}`}>
            <button type="button" onClick={() => setManuais(ms => [...ms, { id: `m:${trabId()}`, titulo: '', resto: 'AI Credits', valor: '' }])} className="text-xs text-blue-400 hover:text-blue-300">+ Linha (AI Credits, extra…)</button>
            {Object.values(edicoes).some(e => e.fora) && <button type="button" onClick={() => setEdicoes(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { ...v, fora: false }])))} className={`text-xs ${sub} hover:text-blue-400`}>repor linhas tiradas</button>}
            <span className="flex-1" />
            {ivaTaxa > 0 && <span className={`text-xs ${sub}`}>IVA {ivaTaxa}%: {eurFatura(ivaValor)}</span>}
            <span className="text-sm">Total <strong className="tabular-nums">{eurFatura(total)}</strong></span>
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
          <button type="button" onClick={() => verPdf(gerarPdfFatura(dadosPdf()))} disabled={!linhas.length} className={`px-3 py-2 text-sm rounded-lg border disabled:opacity-40 ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Pré-visualizar PDF</button>
          <button type="button" onClick={gerar} disabled={aGerar || !linhas.length} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">{aGerar ? 'A gerar…' : `Gerar fatura nº ${nFinal}`}</button>
          <span className={`text-xs ${sub}`}>Descarrega o PDF, guarda-o aqui e marca as tarefas como faturadas.</span>
        </div>
      </div>

      {/* Os meus dados */}
      <div className={caixa}>
        <button type="button" onClick={() => setVerEmissor(v => !v)} className="w-full flex items-center gap-2 text-left">
          <span className={`text-[10px] ${sub}`} style={{ transform: verEmissor ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
          <span className="text-sm font-semibold flex-1">Os meus dados (aparecem em todas as faturas)</span>
          {!em.nome && <span className="text-xs text-amber-500">por preencher</span>}
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
          </div>
        )}
      </div>

      {/* Faturas feitas */}
      <div className={caixa}>
        <p className="text-sm font-semibold mb-2">Faturas emitidas</p>
        {!faturas.length ? <p className={`text-sm ${sub}`}>Ainda nenhuma.</p> : (
          <div className="space-y-1">
            {faturas.map(f => (
              <div key={f.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 rounded-lg ${claro ? 'hover:bg-slate-50' : 'hover:bg-white/[0.03]'}`}>
                <span className="font-medium tabular-nums w-12">nº {f.numero}</span>
                <span className={`text-sm ${sub}`}>{MESES_PT_F[Number(String(f.mes).slice(5, 7)) - 1]} {String(f.mes).slice(0, 4)}</span>
                <span className={`${chip} ${claro ? 'bg-slate-100' : 'bg-white/5'}`}>{(f.tarefas || []).length} tarefas</span>
                {f.recibo && <span className={`${chip} bg-emerald-500/10 text-emerald-500`}>em Receitas</span>}
                <span className="flex-1" />
                <span className="tabular-nums font-medium">{eurFatura(f.total)}</span>
                <button type="button" onClick={() => abrirAntiga(f)} className="px-2 py-1 rounded-md text-xs text-emerald-400 hover:bg-white/10">📎 PDF</button>
                <button type="button" onClick={() => anular(f)} className={`px-2 py-1 rounded-md text-xs ${sub} hover:text-red-400`}>Anular</button>
              </div>
            ))}
          </div>
        )}
      </div>
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
const TxtIn = ({ valor, onGravar, className, placeholder, type = 'text', list, onFocus, onInput }) => (
  <input key={String(valor ?? '')} type={type} defaultValue={valor ?? ''} placeholder={placeholder} className={className} list={list} onFocus={onFocus} onInput={onInput}
    onBlur={e => { const v = e.target.value.trim(); if (v !== String(valor ?? '')) onGravar(v); }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
);
const FichaCliente = ({ c, trab, faturado, ano, mesNum, cu, clientes, theme, inputClass, onCliente, onCriarDoClickUp, onIrPrecos, onApagar, notas, onAbrirNota, onNovaNota }) => {
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
                {onApagar && <button type="button" onClick={() => { const np = (trab.pastas || []).filter(p => String(p.cid) === String(c.id)).length; if (window.confirm(`Apagar o cliente "${c.nome}"?${np ? `\n\nTem ${np} pasta${np === 1 ? '' : 's'} no Trabalho, que ficam sem cliente.` : ''}\nOs recibos dele não são apagados. Se só já não trabalhas com ele, marca-o como "Antigo".`)) onApagar(c.id); }} className="ml-auto text-xs text-red-400 hover:text-red-300">Apagar cliente</button>}
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
            <Campo rot={'Tipo de trabalho na fatura ("FOR:") — depois sugere o da última fatura'}><TxtIn valor={fat.paraFatura} onGravar={v => setFat({ paraFatura: v.trim() })} placeholder="ex.: UA Creative Work, Motion Work" className={ic} /></Campo>
            <Campo rot="Próximo nº de fatura (só até fazeres a primeira na app)"><NumIn valor={fat.proxFatura ?? null} placeholder="1" decimal={false} onGravar={v => setFat({ proxFatura: v })} className={ic} /></Campo>
            <Campo rot="IVA na fatura (%)"><NumIn valor={fat.ivaFatura ?? null} placeholder="0" onGravar={v => setFat({ ivaFatura: v })} className={ic} /></Campo>
            <Campo rot={`Nota do IVA na fatura (vazio = ${(rec.pais || 'PT') === 'PT' ? 'sem frase, por ser cliente português' : 'frase da isenção'}; "-" = nenhuma)`} largo><TxtIn valor={fat.notaIva} onGravar={v => setFat({ notaIva: v })} placeholder={(rec.pais || 'PT') === 'PT' ? 'Sem frase' : 'VAT: 0% – Exempt under Article 6 (6) (a) of the Portuguese VAT Code (Intra-Community supply of services)'} className={ic} /></Campo>
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
                <span className={`text-[10px] ${sub}`}>{meses[i].charAt(0)}</span>
              </div>
            ))}
          </div>
        </div>
        <NotasLigadas lista={notas} onAbrir={onAbrirNota} onNova={onNovaNota ? () => onNovaNota('cliente', c.id, c.nome) : null} claro={claro} sub={sub} caixa={caixa} titulo={`Notas sobre ${c.nome}`} />
        <button type="button" onClick={onIrPrecos} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><IcoT n="lapis" className="w-3.5 h-3.5" /> Preços de {c.nome} →</button>
        <p className={`text-[11px] ${sub}`}>O NIF e a morada ficam só na app — não vão no resumo do chat.</p>
      </div>
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
const Trabalho = ({ navSub, onNavEmpurrar, onNavSubstituir, trab: trabIn, mudar, modo, clientes: clientesIn, cu, theme, inputClass: icIn, ano, mesNum, showToast, onPrecos, faturado, onCliente, onNovoCliente, onCu, onImportarClientes, calendario, onApagarCliente, onEnviarAnexo, onApagarAnexo, notasDe, onAbrirNota, onNovaNota, recibosDe, onAbrirRecibo, onJuntarRecibo, onCriarReciboFatura, onIrMes, taxaReserva }) => {
  const inputClass = `${icIn || ''} w-full min-w-0`;
  const trab = trabIn || TRAB_VAZIO;
  const claro = useClaro(theme);
  // Conta Google com que os briefs abrem: geral (Trabalho) + a de cada cliente (ficha)
  FREE.lista = trab.freelancers || [];
  RESERVA.taxa = Number.isFinite(Number(taxaReserva)) ? Number(taxaReserva) : null;
  CONTA_LINKS.padrao = trab.contaGoogle || '';
  CONTA_LINKS.porCliente = {};
  (clientesIn || []).forEach(c => { if (c && c.contaGoogle) CONTA_LINKS.porCliente[String(c.id)] = c.contaGoogle; });
  const clientes = useMemo(() => {
    const app = (clientesIn || []).filter(c => !/reembolso/i.test(c.nome || ''));
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
  const [sel, setSelEstado] = useState(() => { try { return JSON.parse(localStorage.getItem('trab-sel')) || { tipo: 'geral' }; } catch (e) { return { tipo: 'geral' }; } });
  const historico = useRef([]);
  const irPara = v => { setSelEstado(v); setArvoreMob(false); try { localStorage.setItem('trab-sel', JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
  const setSel = v => { if (JSON.stringify(v) !== JSON.stringify(sel)) { historico.current = [...historico.current.slice(-30), { sel, aba }]; } irPara(v); };
  // Pedidos de outros sítios da app (ex.: o calendário de projetos abre uma lista)
  const setSelRef = useRef(null); setSelRef.current = v => { setSel(v); setAba('tarefas'); };
  useEffect(() => { const f = e => { const d = e.detail; if (!d) return; if (d.tipo && setSelRef.current) setSelRef.current(d); if (d.sel && setSelRef.current) setSelRef.current(d.sel); if (d.tarefa) setTarefaAbertaRef.current(d.tarefa); window.scrollTo({ top: 0 }); }; window.addEventListener('trab-ir', f); return () => window.removeEventListener('trab-ir', f); }, []);
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
    mudar(tr => { const [n, id] = opNovaPasta(tr, { cid, paiId, nome }); novoId = id; return opAutoJogo(n, id); });
    if (paiId) setAbertas(prev => new Set([...prev, paiId]));
    setTimeout(() => { if (novoId) setSel({ tipo: 'pasta', id: novoId }); }, 0);
  } });
  const renomearPasta = (id, nome) => mudar(tr => opAutoJogo(opPasta(tr, id, { nome }), id));
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
        <IcoT n="casa" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Visão geral
      </button>
      <button type="button" onClick={() => setSel({ tipo: 'timesheet' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'timesheet' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <IcoT n="relogio" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Timesheet
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
      <button type="button" onClick={() => setSel({ tipo: 'freelancers' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'freelancers' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <IcoT n="freelancer" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Freelancers
      </button>
      {onCu && onPrecos && (
        <button type="button" onClick={() => setSel({ tipo: 'tipos' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left !mt-0.5 ${sel.tipo === 'tipos' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
          <IcoT n="etiqueta" className={`w-4 h-4 ${claro ? 'text-slate-500' : 'text-slate-400'}`} /> Tipos e preços
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

  const titulo = pasta ? pasta.nome : sel.tipo === 'cliente' ? (cliente ? cliente.nome : 'Cliente') : sel.tipo === 'timesheet' ? 'Timesheet' : sel.tipo === 'clientes' ? 'Clientes' : sel.tipo === 'tipos' ? 'Tipos de tarefa e preços' : sel.tipo === 'freelancers' ? 'Freelancers' : sel.tipo === 'calendario' ? 'Calendário de projetos' : 'Visão geral';
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
  const organizarCliente = () => {
    const planos = anosPorOrganizar.map(p => ({ p, n: planoPorMeses(trab, p.id).length }));
    if (window.confirm(`Organizar por meses: ${planos.map(x => `${x.p.nome} (${x.n} listas)`).join(', ')}?\n\nCada lista vai para a pasta do mês dela. As pastas por jogo que ficarem vazias desaparecem. As tarefas não mudam.`)) mudar(tr => anosPorOrganizar.reduce((acc, p) => opPorMeses(acc, p.id), tr));
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
      <div className="lg:hidden flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setArvoreMob(!arvoreMob)} className={`lg:hidden px-3 py-2 text-sm rounded-lg border ${claro ? 'border-slate-200' : 'border-slate-700'} inline-flex items-center gap-1.5`}><IcoT n="pasta" /> Pastas</button>

        <input value={procura} onChange={e => setProcura(e.target.value)} placeholder="Procurar tarefas…" className={`${inputClass} flex-1 min-w-[160px] max-w-sm text-sm py-2`} />
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
          {(anosPorOrganizar.length > 0 || listasSemJogo > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {listasSemJogo > 0 && <button type="button" onClick={() => mudar(tr => opDetetarJogos(tr, sel.id))} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} inline-flex items-center gap-1.5`}><IcoT n="jogo" className="w-3.5 h-3.5" /> Dar uma cor a cada jogo ({listasSemJogo} lista{listasSemJogo === 1 ? '' : 's'})</button>}
              {anosPorOrganizar.length > 0 && <button type="button" onClick={organizarCliente} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} inline-flex items-center gap-1.5`}><IcoT n="calendario" className="w-3.5 h-3.5" /> Organizar {anosPorOrganizar.map(p => p.nome).join(' e ')} por meses</button>}
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
              {!pasta.mesNum && !(trab.pastas || []).some(f => f.paiId === pasta.id) && (trab.jogos || []).some(j => String(j.cid) === String(pasta.cid)) && (
                <select value={pasta.jogoId || ''} onChange={e => { const j = (trab.jogos || []).find(x => x.id === e.target.value); mudar(tr => opPasta(tr, pasta.id, j ? { jogoId: j.id, cor: j.cor } : { jogoId: null })); }}
                  className={`text-xs rounded-lg border px-2 py-1 bg-transparent ${claro ? 'border-slate-200' : 'border-slate-700'}`} title="Jogo desta lista">
                  <option value="" className={claro ? '' : 'bg-slate-800'}>Sem jogo</option>
                  {(trab.jogos || []).filter(j => String(j.cid) === String(pasta.cid)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt')).map(j => <option key={j.id} value={j.id} className={claro ? '' : 'bg-slate-800'}>Jogo: {j.nome}</option>)}
                </select>
              )}
              {porOrganizar(pasta) && (
                <button type="button" onClick={() => {
                  const plano = planoPorMeses(trab, pasta.id);
                  const porMes = {}; plano.slice().sort((a, b) => (a.mes || 99) - (b.mes || 99)).forEach(x => { const n = x.mes ? MESES_NOMES[x.mes - 1] : 'Sem mês'; porMes[n] = (porMes[n] || 0) + 1; });
                  const resumo = Object.entries(porMes).map(([n, q]) => `${n}: ${q}`).join(', ');
                  if (window.confirm(`Organizar "${pasta.nome}" por meses?\n\n${plano.length} listas vão para pastas de mês (${resumo}). As pastas por jogo que ficarem vazias desaparecem. As tarefas não mudam.`)) mudar(tr => opPorMeses(tr, pasta.id));
                }} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'} inline-flex items-center gap-1.5`}><IcoT n="calendario" className="w-3.5 h-3.5" /> Organizar por meses</button>
              )}
              <button type="button" onClick={() => novaPasta(pasta.cid, pasta.id)} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>+ Subpasta</button>
              <button type="button" onClick={() => setPedir({ titulo: 'Novo nome da pasta', valor: pasta.nome, ok: n => mudar(tr => opAutoJogo(opPasta(tr, pasta.id, { nome: n }), pasta.id)) })} className={`px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Mudar o nome</button>
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
          {sel.tipo === 'calendario' && !procura.trim() && calendario}
          {sel.tipo === 'freelancers' && !procura.trim() && <Freelancers trab={trab} mudar={mudar} cu={cu} clientes={clientes} ano={ano} theme={theme} inputClass={inputClass} />}
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
          {abaAtual === 'faturas' && sel.tipo === 'cliente' && !procura.trim() && cliente && !cliente.soTrabalho && <FaturasCliente key={cliente.id} c={cliente} trab={trab} mudar={mudar} cu={cu} clientes={clientes} ano={ano} mesNum={mesNum} theme={theme} inputClass={inputClass} onEnviarAnexo={onEnviarAnexo} onCriarRecibo={onCriarReciboFatura} showToast={showToast} onAbrirTarefa={id => setTarefaAberta(id)} />}
          {abaAtual === 'recibos' && sel.tipo === 'cliente' && !procura.trim() && recibosDe && <RecibosCliente lista={recibosDe(sel.id)} onAbrirFicheiro={onAbrirRecibo} onJuntarFicheiro={onJuntarRecibo} onIrMes={onIrMes} claro={claro} sub={sub} />}
          {abaAtual === 'jogos' && sel.tipo === 'cliente' && !procura.trim() && <JogosCliente cid={sel.id} trab={trab} cu={cu} clientes={clientes} ano={ano} theme={theme} inputClass={inputClass} mudar={mudar} notasDe={notasDe} onAbrirNota={onAbrirNota} onNovaNota={onNovaNota} />}
          {abaAtual === 'ficha' && sel.tipo === 'cliente' && cliente && !procura.trim() && (
            <FichaCliente c={cliente} trab={trab} faturado={faturado} ano={ano} mesNum={mesNum} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass}
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
              {pasta && <NovaTarefa onCriar={criarTarefa} cid={pasta.cid} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} />}
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
      {tarefaSel && <DetalheTarefa t={tarefaSel} trab={trab} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} mudar={mudar} onFechar={() => setTarefaAberta(null)} onEnviarAnexo={onEnviarAnexo} onApagarAnexo={onApagarAnexo} showToast={showToast} notasDe={notasDe} onAbrirNota={onAbrirNota} onNovaNota={onNovaNota} />}
    </div>
  );
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
  const base = nomeFicheiroRecibo(empresa, d);
  const existentes = new Set((await filhosDrive(token, pTrim.id, false)).map(f => f.name));
  let nome = base; let i = 2;
  while (existentes.has(nome)) nome = base.replace(/\.pdf$/, `_${i++}.pdf`);
  const f = ficheiro.type ? ficheiro : new File([ficheiro], nome, { type: 'application/pdf' });
  const res = await enviarParaDrive(token, { file: f, nome, pasta: pTrim.id, idExistente: null }, () => {});
  return { nome, pasta: `${ano}/${pTrim.name || `${trim}º_Trimestre`}`, url: (res && res.webViewLink) || pTrim.webViewLink || `https://drive.google.com/drive/folders/${pTrim.id}`, id: res && res.id };
};

export { Trabalho, guardarReciboNoDrive, ligarDriveSempre, desligarDriveSempre, ligadoSempre, sincronizarSempre, carregarGis };
