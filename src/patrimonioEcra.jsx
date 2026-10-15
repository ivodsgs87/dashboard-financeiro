// Ecrã do separador Património (gráfico e formulário). Só é descarregado quando se abre o separador.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  meses, Ico, _fmtEUR, confirmar
} from './base';
import {
  txDuplicadosProvaveis, PAT_COMP, patChave, patEhLiquidez, patItemLiq, patRegras, patId, patNum,
  patStr, patIdx, patSoma, patIso, patDataAceite, patCorte, patRotulo, patTotais,
  patSerie, patDetalhe, patReservado, patSaldosExtrato, patPoupanca, patTxLiquido, patTxEntre, patVida,
  patRetorno, patListaCreditos, patCreditoNoMes, patRascunho, patLimpar, patMovimentos, patEstadoMeses, patRegistosEfetivos
} from './patrimonio';

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
  const card = `rounded-2xl border p-4 sm:p-5 ${escuro ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white/80 border-slate-200 shadow-sm'}`;
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
    <div className="space-y-4 max-w-5xl xl:max-w-none mx-auto pag-2col">

      {/* Cabeçalho: três perguntas, três blocos */}
      <div className={`${card} col-toda`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold"><Ico e="💎"/>Património</h3>
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
        <div className={`${card} col-esq`}>
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
        <div className={`${card} col-esq`}>
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
        <div className={`${card} col-esq`}>
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
      <div className={`${card} col-dir`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-lg font-semibold"><Ico e="📝"/>{meses[idxSel % 12]} {Math.floor(idxSel / 12)}</h3>
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
          {(() => {
            // Há dívida da casa mas o imóvel está a 0: o valor da casa já está no separador Crédito
            const casaCred = patListaCreditos(G).filter(c => c.estado !== 'planeado' && (c.tipo || 'habitacao') === 'habitacao' && patNum(c.valorBem) > 0);
            if (tDraft.imoveis >= 0.5 || !casaCred.length) return null;
            return (
              <p className={`text-xs mt-1.5 ${sub}`}>A casa está a 0 €, mas o Crédito diz que vale {f(patNum(casaCred[0].valorBem))}.{' '}
                <button onClick={() => setDraft({ ...draft, imoveis: casaCred.map(c => ({ id: patId(), nome: 'Casa', val: patStr(patNum(c.valorBem)) })) })} className="text-blue-400 hover:underline">Usar esse valor</button>
              </p>
            );
          })()}
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
      <div className={`${card} col-toda`}>
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
        <div className={`${card} col-toda`}>
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

// Base visual: tipo de letra Inter com algarismos de largura fixa (os valores alinham em coluna),
// letra pequena com um mínimo legível e cinzentos com mais contraste em cada tema.

export {
  patFmtK, PatLinhas, PatChart, Patrimonio
};
export const FICHEIRO_APP = 'patrimonioEcra';
