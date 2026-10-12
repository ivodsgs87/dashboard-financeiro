// Separador "Trabalho": pastas e subpastas por cliente, tarefas com estados, cronómetro,
// notas/reuniões e orçamento automático. Substitui o ClickUp. Só é descarregado quando se abre.
// Os dados (trab) vêm do OrcamentoApp, que os guarda no Firestore; aqui só se lê e se pede para mudar.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TRAB_ESTADOS, TRAB_VAZIO, trabId, trabDia, trabMsTempo, trabHoras, trabACorrer, trabEntrega,
  cuPreco, trabValor, trabRelogio, cuPecas, CU_TIPOS, CU_NOMES_EN, cuEur, cuLerHoras, cuHorasTxt,
  meses, Card, trabParar,
} from './base';

// ── Operações (recebem os dados e devolvem os dados novos) ──
const agoraIso = () => new Date().toISOString();
const eur = v => cuEur(Math.round(Number(v) || 0));
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
const opApagarPasta = (trab, id) => {
  const ids = new Set(descendentes(trab, id));
  return { ...trab, pastas: (trab.pastas || []).filter(p => !ids.has(p.id)), tarefas: (trab.tarefas || []).filter(t => !ids.has(t.pastaId)) };
};
const opNovaTarefa = (trab, { pastaId, cid, nome, prazo }) => ({
  ...trab, tarefas: [...(trab.tarefas || []), { id: trabId(), pastaId: pastaId || null, cid: cid ?? null, nome: nome.trim(), estado: 'todo', criada: agoraIso(), prazo: prazo || '', tempos: [], notas: '' }],
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
        className={`inline-flex items-center gap-1.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide ${compacto ? 'px-1.5 py-1' : 'px-2.5 py-1'}`}
        style={{ color: e.cor, borderColor: e.cor + '66', background: e.cor + '1a' }}>
        <span className="w-2 h-2 rounded-full" style={{ background: e.cor }} />
        {!compacto && e.nome}
      </button>
      {aberto && (
        <div className={`absolute z-30 left-0 top-full mt-1 w-40 rounded-xl border p-1 shadow-xl animate-fadeInScale ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
          {TRAB_ESTADOS.map(x => (
            <button key={x.id} type="button" onClick={() => { setAberto(false); if (x.id !== estado) onMudar(x.id); }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left ${x.id === estado ? (claro ? 'bg-slate-100' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: x.cor }} />{x.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
const BotaoCrono = ({ aCorrer, onIniciar, onParar, theme }) => {
  const claro = useClaro(theme);
  return aCorrer
    ? <button type="button" onClick={onParar} title="Parar o cronómetro" aria-label="Parar o cronómetro" className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm"><svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="currentColor" /></svg></button>
    : <button type="button" onClick={onIniciar} title="Começar o cronómetro" aria-label="Começar o cronómetro" className={`w-7 h-7 inline-flex items-center justify-center rounded-full border ${claro ? 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600' : 'border-slate-600 text-slate-400 hover:border-blue-400 hover:text-blue-300'}`}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg></button>;
};
// Horas de uma tarefa a contar ao segundo enquanto o cronómetro corre
const HorasVivas = ({ t }) => {
  const corre = (t.tempos || []).some(x => !x.fim);
  const [, setTic] = useState(0);
  useEffect(() => { if (!corre) return undefined; const i = setInterval(() => setTic(x => x + 1), 1000); return () => clearInterval(i); }, [corre]);
  const ms = (t.tempos || []).reduce((a, x) => a + trabMsTempo(x), 0);
  if (!ms) return <span className="opacity-40">—</span>;
  return <span className={`tabular-nums ${corre ? 'text-red-400 font-semibold' : ''}`}>{corre ? trabRelogio(ms) : cuHorasTxt(ms / 3600000)}</span>;
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
const ListaTarefas = ({ tarefas, trab, cu, clientes, theme, mudar, onAbrir, mostrarPasta, verFeitas, setVerFeitas }) => {
  const claro = useClaro(theme);
  const nomePasta = t => caminho(trab, t.pastaId).map(p => p.nome).slice(-2).join(' / ');
  const grupos = TRAB_ESTADOS.map(e => ({ ...e, lista: tarefas.filter(t => t.estado === e.id) }));
  return (
    <div className="space-y-3">
      {grupos.map(g => {
        if (!g.lista.length && g.id !== 'todo') return null;
        const fechado = g.id === 'feito' && !verFeitas;
        return (
          <div key={g.id}>
            <button type="button" onClick={() => g.id === 'feito' && setVerFeitas(!verFeitas)} className={`flex items-center gap-2 mb-1 px-1 text-xs font-semibold uppercase tracking-wide ${g.id === 'feito' ? 'cursor-pointer' : 'cursor-default'}`} style={{ color: g.cor }}>
              <span className="w-2 h-2 rounded-full" style={{ background: g.cor }} />{g.nome}
              <span className={`font-normal ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{g.lista.length}</span>
              {g.id === 'feito' && <span className={`font-normal normal-case ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{fechado ? '· mostrar' : '· esconder'}</span>}
            </button>
            {!fechado && (
              <div className="space-y-0.5">
                {g.lista.map(t => <LinhaTarefa key={t.id} t={t} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={onAbrir} mostrarPasta={mostrarPasta} nomePasta={nomePasta(t)} />)}
                {!g.lista.length && <p className={`px-3 py-2 text-xs ${claro ? 'text-slate-400' : 'text-slate-500'}`}>Nada por fazer aqui.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Escrever uma tarefa nova (com o valor a aparecer enquanto escreves) ──
const NovaTarefa = ({ onCriar, cid, cu, clientes, theme, inputClass, semPasta }) => {
  const [txt, setTxt] = useState('');
  const [prazo, setPrazo] = useState('');
  const claro = useClaro(theme);
  const preview = txt.trim() ? trabValor({ nome: txt, cid, tempos: [] }, cu, clientes) : 0;
  const pecas = txt.trim() ? cuPecas(txt).filter(p => p.tipo !== 'outro') : [];
  const criar = () => { if (!txt.trim()) return; onCriar(txt, prazo); setTxt(''); };
  return (
    <div className={`rounded-xl border p-2 ${claro ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900/30'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') criar(); }}
          placeholder={semPasta ? 'Escolhe uma pasta à esquerda para criar tarefas' : 'Nova tarefa — ex.: 2x New Videos - Halloween + 1x Variation'} disabled={semPasta}
          className={`${inputClass} flex-1 min-w-[220px] text-sm py-2`} />
        <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} title="Prazo (opcional)" disabled={semPasta} className={`${inputClass} !w-auto text-sm py-2`} />
        <button type="button" onClick={criar} disabled={!txt.trim() || semPasta} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">Adicionar</button>
      </div>
      {txt.trim() && (
        <p className={`mt-1.5 px-1 text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>
          {pecas.length ? pecas.map(p => `${p.n} × ${(CU_TIPOS.find(x => x.id === p.tipo) || {}).curto || (CU_TIPOS.find(x => x.id === p.tipo) || {}).nome || p.tipo}`).join(' + ') : 'Tarefa sem peças (conta à hora)'}
          {preview > 0 && <> · vale <strong className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(preview)}</strong></>}
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

// ── Orçamento automático (pelas tarefas da pasta e das subpastas) ──
const Orcamento = ({ pasta, tarefas, cid, cu, clientes, theme, inputClass, onMudar, nomeCliente }) => {
  const claro = useClaro(theme);
  const [copiado, setCopiado] = useState(false);
  const orc = pasta.orcamento || {};
  const preco = tipo => cuPreco(cu, clientes, cid, tipo);
  const diaria = preco('dia'), hora = preco('hora');
  const linhasMap = {};
  let horasExtra = 0, entregue = 0;
  const dias = new Set();
  tarefas.forEach(t => {
    const manual = t.valorManual != null && t.valorManual !== '' && Number.isFinite(Number(t.valorManual));
    if (manual) { const k = 'm:' + t.id; linhasMap[k] = { txt: t.nome, valor: Number(t.valorManual) }; }
    else cuPecas(t.nome).forEach(p => {
      if (p.tipo === 'extra' || p.tipo === 'outro') { horasExtra += trabHoras(t); return; }
      const l = (linhasMap[p.tipo] = linhasMap[p.tipo] || { tipo: p.tipo, n: 0, unit: preco(p.tipo) });
      l.n += p.n;
    });
    (t.tempos || []).forEach(x => { if (trabMsTempo(x) > 0) dias.add(trabDia(x.ini)); });
    if (trabEntrega(t)) entregue += trabValor(t, cu, clientes);
  });
  const linhas = [];
  CU_TIPOS.forEach(tp => { const l = linhasMap[tp.id]; if (!l || !l.n) return; const [um, varios] = CU_NOMES_EN[tp.id] || [tp.nome, tp.plural]; linhas.push({ txt: `${l.n}x ${l.n === 1 ? um : varios}`, unit: l.unit, n: l.n, valor: l.n * l.unit }); });
  Object.entries(linhasMap).filter(([k]) => k.startsWith('m:')).forEach(([, l]) => linhas.push(l));
  if (diaria > 0 && dias.size) linhas.push({ txt: `${dias.size}x ${dias.size === 1 ? 'Day' : 'Days'}`, unit: diaria, n: dias.size, valor: dias.size * diaria });
  else if (horasExtra > 0 && hora > 0) linhas.push({ txt: `Extra work ${cuHorasTxt(horasExtra)}`, unit: hora, porHora: true, valor: horasExtra * hora });
  (orc.extras || []).forEach(e => { const v = Number(String(e.val || '').replace(',', '.')) || 0; if ((e.desc || '').trim() || v) linhas.push({ txt: (e.desc || '').trim() || 'Other', valor: v }); });
  const total = linhas.reduce((a, l) => a + l.valor, 0);
  const texto = linhas.length ? [
    `${pasta.nome}${nomeCliente ? ` — ${nomeCliente}` : ''}`, '',
    ...linhas.map(l => `${l.txt}${l.unit && l.n > 1 ? ` (${cuEur(l.unit)} each)` : l.porHora && l.unit ? ` (${cuEur(l.unit)}/h)` : ''} — ${cuEur(l.valor)}`),
    '', `Total: ${cuEur(total)}`,
  ].join('\n') : '';
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); } catch (e) { /* sem acesso à área de transferência */ }
    setCopiado(true); setTimeout(() => setCopiado(false), 1600);
  };
  const estados = [['rascunho', 'Rascunho'], ['enviado', 'Enviado'], ['aprovado', 'Aprovado'], ['faturado', 'Faturado']];
  const acordado = orc.acordado != null && orc.acordado !== '' ? Number(orc.acordado) : null;
  const ref = acordado ?? total;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-3 min-w-0">
        <div className="grid grid-cols-3 gap-2">
          {[['Orçamento', eur(total)], ['Já entregue', eur(entregue)], ['Falta', eur(Math.max(0, ref - entregue))]].map(([k, v]) => (
            <div key={k} className={`rounded-xl p-2.5 ${claro ? 'bg-slate-100' : 'bg-slate-800/60'}`}><p className={`text-[11px] ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{k}</p><p className="text-base font-semibold tabular-nums">{v}</p></div>
          ))}
        </div>
        {ref > 0 && (
          <div className={`h-2 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700/60'}`}><div className="h-full rounded-full bg-emerald-500 progress-animated" style={{ width: `${Math.min(100, (entregue / ref) * 100)}%` }} /></div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={claro ? 'text-slate-500' : 'text-slate-400'}>Estado:</span>
          {estados.map(([k, n]) => (
            <button key={k} type="button" onClick={() => onMudar({ ...orc, estado: k })} className={`px-2.5 py-1 rounded-full text-xs border ${(orc.estado || 'rascunho') === k ? 'border-violet-400 bg-violet-500/15 text-violet-400' : claro ? 'border-slate-200 text-slate-500' : 'border-slate-700 text-slate-400'}`}>{n}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className={claro ? 'text-slate-500' : 'text-slate-400'}>Valor acordado com o cliente</span>
          <input type="text" inputMode="decimal" key={String(orc.acordado ?? '')} defaultValue={orc.acordado ?? ''} placeholder={String(Math.round(total))}
            onBlur={e => { const v = e.target.value.trim(); onMudar({ ...orc, acordado: v === '' ? null : Number(v.replace(',', '.')) || 0 }); }}
            className={`${inputClass} !w-28 text-sm py-1 text-right`} />
        </label>
        <div className="space-y-1.5">
          <p className={`text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>Linhas à parte (ex.: AI Credits, licenças)</p>
          {(orc.extras || []).map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input defaultValue={e.desc || ''} placeholder="Ex.: AI Credits" onBlur={ev => onMudar({ ...orc, extras: orc.extras.map((x, k) => (k === i ? { ...x, desc: ev.target.value } : x)) })} className={`${inputClass} flex-1 text-sm py-1`} />
              <input defaultValue={e.val || ''} placeholder="€" inputMode="decimal" onBlur={ev => onMudar({ ...orc, extras: orc.extras.map((x, k) => (k === i ? { ...x, val: ev.target.value } : x)) })} className={`${inputClass} !w-24 text-sm py-1 text-right`} />
              <button type="button" className="text-xs text-slate-400 hover:text-red-400 px-1" onClick={() => onMudar({ ...orc, extras: orc.extras.filter((_, k) => k !== i) })} aria-label="Tirar">✕</button>
            </div>
          ))}
          <button type="button" className="text-xs text-blue-400 hover:text-blue-300" onClick={() => onMudar({ ...orc, extras: [...(orc.extras || []), { desc: '', val: '' }] })}>+ linha à parte</button>
        </div>
      </div>
      <div>
        <div className={`rounded-xl border p-3 ${claro ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-700/60'}`}>
          {texto ? <pre className="whitespace-pre-wrap font-sans text-sm leading-6 tabular-nums">{texto}</pre>
            : <p className={`text-sm ${claro ? 'text-slate-500' : 'text-slate-400'}`}>Adiciona tarefas (ex.: "3x New Videos") e o orçamento faz-se sozinho.</p>}
        </div>
        <button type="button" disabled={!texto} onClick={copiar} className={`mt-2 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40 text-white ${copiado ? 'bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'}`}>{copiado ? '✓ Copiado' : 'Copiar orçamento'}</button>
      </div>
    </div>
  );
};

// ── Detalhe de uma tarefa (painel lateral) ──
const DetalheTarefa = ({ t, trab, cu, clientes, theme, inputClass, mudar, onFechar }) => {
  const claro = useClaro(theme);
  const [hManual, setHManual] = useState('');
  const [diaManual, setDiaManual] = useState(trabDia(new Date().toISOString()));
  useEffect(() => { const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [onFechar]);
  if (!t) return null;
  const set = patch => mudar(tr => opTarefa(tr, t.id, x => ({ ...x, ...patch })));
  const v = trabValor(t, cu, clientes);
  const corre = (t.tempos || []).some(x => !x.fim);
  const pastasCli = (trab.pastas || []).filter(p => String(p.cid) === String(t.cid));
  const caminhoTxt = p => caminho(trab, p.id).map(x => x.nome).join(' / ');
  const lab = `text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`;
  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }} style={{ background: 'rgba(0,0,0,.45)' }}>
      <div className={`w-full max-w-lg h-full overflow-y-auto shadow-2xl animate-slideInRight ${claro ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}>
        <div className={`sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b ${claro ? 'bg-white/95 border-slate-200' : 'bg-slate-900/95 border-slate-700'}`}>
          <EstadoPill estado={t.estado} theme={theme} onMudar={e => mudar(tr => opEstado(tr, t.id, e))} />
          <span className="flex-1" />
          <BotaoCrono aCorrer={corre} theme={theme} onIniciar={() => mudar(tr => opIniciar(tr, t.id))} onParar={() => mudar(opParar)} />
          <button type="button" onClick={onFechar} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/10" aria-label="Fechar">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <textarea key={t.id + 'n'} defaultValue={t.nome} rows={2} onBlur={e => { const n = e.target.value.trim(); if (n && n !== t.nome) set({ nome: n }); }}
            className={`w-full bg-transparent text-lg font-semibold resize-none focus:outline-none rounded-lg px-1 ${claro ? 'focus:bg-slate-50' : 'focus:bg-white/5'}`} />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Pasta</span>
              <select value={t.pastaId || ''} onChange={e => set({ pastaId: e.target.value || null })} className={`${inputClass} text-sm py-1.5`}>
                {pastasCli.map(p => <option key={p.id} value={p.id}>{caminhoTxt(p)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Prazo</span>
              <input type="date" value={t.prazo || ''} onChange={e => set({ prazo: e.target.value })} className={`${inputClass} text-sm py-1.5`} />
            </label>
            <div className="flex flex-col gap-1"><span className={lab}>Vale</span>
              <p className={`text-lg font-semibold tabular-nums ${claro ? 'text-emerald-700' : 'text-emerald-400'}`}>{eur(v)}</p>
            </div>
            <label className="flex flex-col gap-1 min-w-0"><span className={lab}>Valor à mão (opcional)</span>
              <input key={t.id + 'v' + (t.valorManual ?? '')} defaultValue={t.valorManual ?? ''} inputMode="decimal" placeholder="automático"
                onBlur={e => { const x = e.target.value.trim(); set({ valorManual: x === '' ? null : Number(x.replace(',', '.')) || 0 }); }} className={`${inputClass} text-sm py-1.5`} />
            </label>
          </div>
          <p className={lab}>Peças lidas do nome: {cuPecas(t.nome).map(p => `${p.n} × ${(CU_TIPOS.find(x => x.id === p.tipo) || {}).curto || (CU_TIPOS.find(x => x.id === p.tipo) || {}).nome || p.tipo}`).join(' + ')}</p>

          <div className={`rounded-xl border p-3 ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium">Tempo</p><p className="text-sm tabular-nums font-semibold"><HorasVivas t={t} /></p></div>
            <div className="space-y-1">
              {(t.tempos || []).slice().reverse().map(x => (
                <div key={x.id} className="flex items-center gap-2 text-xs">
                  <input type="datetime-local" defaultValue={paraInputLocal(x.ini)} key={x.ini} onBlur={e => { if (!e.target.value) return; const ini = new Date(e.target.value).toISOString(); mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: y.tempos.map(z => (z.id === x.id ? { ...z, ini } : z)) }))); }} className={`${inputClass} !w-auto text-xs py-1`} />
                  <span className="opacity-50">→</span>
                  {x.fim ? <input type="datetime-local" defaultValue={paraInputLocal(x.fim)} key={x.fim} onBlur={e => { if (!e.target.value) return; const fim = new Date(e.target.value).toISOString(); mudar(tr => opTarefa(tr, t.id, y => ({ ...y, tempos: y.tempos.map(z => (z.id === x.id ? { ...z, fim } : z)) }))); }} className={`${inputClass} !w-auto text-xs py-1`} />
                    : <span className="text-red-400 font-medium">a correr</span>}
                  <span className="flex-1 text-right tabular-nums">{cuHorasTxt(trabMsTempo(x) / 3600000)}</span>
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

          <div className={`rounded-xl border p-3 text-xs space-y-1 ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
            <p className="text-sm font-medium mb-1">Registo automático</p>
            {[['Criada', t.criada], ['Começada', t.iniciada], ['Posta em review', t.review], ['Terminada', t.feita]].map(([k, d]) => (
              <div key={k} className="flex justify-between"><span className={lab}>{k}</span><span className="tabular-nums">{dataHora(d)}</span></div>
            ))}
          </div>

          <label className="flex flex-col gap-1"><span className={lab}>Notas da tarefa</span>
            <textarea key={t.id + 'x'} defaultValue={t.notas || ''} rows={4} onBlur={e => { if (e.target.value !== (t.notas || '')) set({ notas: e.target.value }); }} className={`${inputClass} text-sm`} placeholder="Links, feedback do cliente, ideias…" />
          </label>
          <div className="flex justify-between">
            <button type="button" className="text-xs text-slate-400 hover:text-blue-400" onClick={() => mudar(tr => ({ ...tr, tarefas: [...tr.tarefas, { ...t, id: trabId(), nome: t.nome + ' (cópia)', estado: 'todo', tempos: [], criada: agoraIso(), iniciada: null, review: null, feita: null }] }))}>Duplicar</button>
            <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => { if (window.confirm('Apagar esta tarefa?')) { mudar(tr => ({ ...tr, tarefas: tr.tarefas.filter(x => x.id !== t.id) })); onFechar(); } }}>Apagar tarefa</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Árvore de pastas ──
const NoPasta = ({ p, trab, nivel, sel, setSel, abertas, alternar, theme, contar }) => {
  const claro = useClaro(theme);
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
        <button type="button" onClick={() => setSel({ tipo: 'pasta', id: p.id })} className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left">
          <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: p.cor || '#64748b' }} />
          <span className="truncate">{p.nome}</span>
        </button>
        {n > 0 && <span className={`text-[11px] tabular-nums ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{n}</span>}
      </div>
      {aberta && filhas.map(f => <NoPasta key={f.id} p={f} trab={trab} nivel={nivel + 1} sel={sel} setSel={setSel} abertas={abertas} alternar={alternar} theme={theme} contar={contar} />)}
    </div>
  );
};

// ── Visão geral (sem pasta escolhida) ──
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
                <p className={`text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{c.porDia ? `${c.dias.size} dia${c.dias.size === 1 ? '' : 's'} × ${eur(c.porDia)}` : `${c.n} entregue${c.n === 1 ? '' : 's'}`} · {cuHorasTxt(c.h)}</p>
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
    id: trabId() + 't' + i, origem: t.origem, pastaId: mapaId[t.pastaOrigem] || null, cid: cidDe(t.cliente), nome: t.nome, estado: t.estado || 'todo',
    criada: t.criada || agoraIso(), iniciada: t.iniciada || null, review: t.review || null, feita: t.feita || null, prazo: t.prazo || '', notas: t.notas || '',
    tempos: (t.tempos || []).map((x, k) => ({ id: trabId() + k, ini: x.ini, fim: x.fim })),
  }));
  return [{ ...trab, pastas: [...(trab.pastas || []), ...novasP], tarefas: [...(trab.tarefas || []), ...novasT] }, novasP.length, novasT.length];
};

// ══ O separador ══
const Trabalho = ({ trab: trabIn, mudar, modo, clientes: clientesIn, cu, theme, inputClass: icIn, ano, mesNum, showToast }) => {
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
  const [verFeitas, setVerFeitas] = useState(false);
  const [procura, setProcura] = useState('');
  const [arvoreMob, setArvoreMob] = useState(false);
  const ficheiroRef = useRef(null);

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
  const criarTarefa = (txt, prazo) => {
    if (!pasta) return;
    mudar(tr => opNovaTarefa(tr, { pastaId: pasta.id, cid: pasta.cid, nome: txt, prazo }));
  };
  const importar = async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (modo === 'g' && !window.confirm('Ainda não tens a regra do Firestore para o Trabalho, por isso tudo fica no documento principal (que tem um limite de 1 MB). Importar o ClickUp ocupa ~200 KB. Queres importar mesmo assim?')) return;
    try {
      let np = 0, nt = 0;
      const [n, a, b] = await importarFicheiro(f, trab, clientes);
      np = a; nt = b;
      mudar(() => n);
      showToast && showToast(`Importado: ${np} pastas e ${nt} tarefas`, 'success');
    } catch (err) { showToast && showToast(err.message || 'Não consegui ler o ficheiro', 'error'); }
  };

  const tarefaSel = (trab.tarefas || []).find(t => t.id === tarefaAberta);
  const sub = claro ? 'text-slate-500' : 'text-slate-400';

  const arvore = (
    <div className="space-y-3">
      <button type="button" onClick={() => setSel({ tipo: 'geral' })} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left ${sel.tipo === 'geral' ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
        <span aria-hidden="true">🏠</span> Visão geral
      </button>
      {clientes.map(c => {
        const raiz = filhasDe(trab, null, c.id);
        const ativo = sel.tipo === 'cliente' && String(sel.id) === String(c.id);
        return (
          <div key={c.id}>
            <div className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg ${ativo ? (claro ? 'bg-slate-200/70' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              <button type="button" onClick={() => setSel({ tipo: 'cliente', id: c.id })} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: c.cor || '#64748b' }}>{String(c.nome || '?').charAt(0).toUpperCase()}</span>
                <span className="text-sm font-semibold truncate">{c.nome}</span>
              </button>
              <button type="button" onClick={() => novaPasta(c.id, null)} className={`w-6 h-6 rounded-md text-base leading-none ${sub} hover:text-blue-400 opacity-60 group-hover:opacity-100`} title="Nova pasta" aria-label={`Nova pasta em ${c.nome}`}>+</button>
            </div>
            <div className="ml-1">{raiz.map(p => <NoPasta key={p.id} p={p} trab={trab} nivel={0} sel={sel} setSel={setSel} abertas={abertas} alternar={alternar} theme={theme} contar={contar} />)}</div>
          </div>
        );
      })}
      {!clientes.length && <p className={`text-xs ${sub}`}>Adiciona primeiro os teus clientes (no menu do teu nome → Clientes).</p>}
    </div>
  );

  const titulo = pasta ? pasta.nome : sel.tipo === 'cliente' ? (cliente ? cliente.nome : 'Cliente') : 'Visão geral';
  const migalhas = pasta ? [cliente ? cliente.nome : '', ...caminho(trab, pasta.id).slice(0, -1).map(p => p.nome)].filter(Boolean) : [];
  const notasAlvo = pasta ? (pasta.notas || []) : sel.tipo === 'cliente' ? ((trab.notasCliente || {})[sel.id] || []) : [];
  const mudarNotas = notas => mudar(tr => (pasta ? opPasta(tr, pasta.id, { notas }) : { ...tr, notasCliente: { ...(tr.notasCliente || {}), [sel.id]: notas } }));
  const abas = pasta ? [['tarefas', 'Tarefas'], ['notas', 'Notas e reuniões'], ['orcamento', 'Orçamento']] : sel.tipo === 'cliente' ? [['tarefas', 'Tarefas'], ['notas', 'Notas e reuniões']] : [];
  const abaAtual = abas.some(a => a[0] === aba) ? aba : 'tarefas';
  const valorAberto = tarefas.filter(t => t.estado !== 'feito').reduce((a, t) => a + trabValor(t, cu, clientes), 0);
  const horasTot = tarefas.reduce((a, t) => a + trabHoras(t), 0);

  if (modo === 'carregar') return <div className="py-16 text-center text-slate-400 text-sm">A carregar o teu trabalho…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setArvoreMob(!arvoreMob)} className={`lg:hidden px-3 py-2 text-sm rounded-lg border ${claro ? 'border-slate-200' : 'border-slate-700'}`}>📁 Pastas</button>
        <input value={procura} onChange={e => setProcura(e.target.value)} placeholder="Procurar tarefas…" className={`${inputClass} flex-1 min-w-[160px] max-w-sm text-sm py-2`} />
        <span className="flex-1" />
        {modo === 'g' && <span className="text-[11px] text-amber-400" title="As regras do Firestore ainda não deixam gravar à parte. Os dados ficam no documento principal.">a gravar no documento principal</span>}
        <button type="button" onClick={() => ficheiroRef.current && ficheiroRef.current.click()} className={`px-3 py-2 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`}>Importar do ClickUp</button>
        <input ref={ficheiroRef} type="file" accept=".json,application/json" className="hidden" onChange={importar} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
        <aside className={`${arvoreMob ? 'block' : 'hidden'} lg:block lg:sticky lg:top-28 rounded-2xl border p-2 max-h-[calc(100vh-8rem)] overflow-y-auto ${claro ? 'bg-white/80 border-slate-200' : 'bg-slate-800/50 border-slate-700/50'}`}>{arvore}</aside>
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
                <span><strong className={claro ? 'text-slate-800' : 'text-slate-100'}>{cuHorasTxt(horasTot)}</strong> registadas</span>
                <span><strong className={claro ? 'text-emerald-700' : 'text-emerald-400'}>{eur(valorAberto)}</strong> por entregar</span>
              </div>
            )}
          </div>
          {pasta && (
            <div className="flex flex-wrap items-center gap-2">
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
          {(sel.tipo !== 'geral' || procura.trim()) && abaAtual === 'tarefas' && (
            <div className="space-y-3">
              {pasta && <NovaTarefa onCriar={criarTarefa} cid={pasta.cid} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} />}
              {sel.tipo === 'cliente' && !procura.trim() && !filhasDe(trab, null, sel.id).length && (
                <Card><p className="text-sm">Ainda não há pastas para {cliente ? cliente.nome : 'este cliente'}. Carrega no <strong>+</strong> ao lado do nome, à esquerda.</p></Card>
              )}
              <Card className="!p-2 sm:!p-3">
                <ListaTarefas tarefas={tarefas} trab={trab} cu={cu} clientes={clientes} theme={theme} mudar={mudar} onAbrir={setTarefaAberta} mostrarPasta={!pasta || descendentes(trab, pasta.id).length > 1} verFeitas={verFeitas} setVerFeitas={setVerFeitas} />
              </Card>
            </div>
          )}
          {abaAtual === 'notas' && (pasta || sel.tipo === 'cliente') && <Notas notas={notasAlvo} onMudar={mudarNotas} theme={theme} inputClass={inputClass} />}
          {abaAtual === 'orcamento' && pasta && (
            <Card><Orcamento pasta={pasta} tarefas={tarefas} cid={pasta.cid} cu={cu} clientes={clientes} theme={theme} inputClass={inputClass} nomeCliente={cliente ? cliente.nome : ''}
              onMudar={orcamento => mudar(tr => opPasta(tr, pasta.id, { orcamento }))} /></Card>
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
