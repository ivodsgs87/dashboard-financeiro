// Peças de base da app: campos de escrita, gráficos, constantes (meses, escalões de IRS)
// e o mapeamento de categorias para a Bilance. Usado por OrcamentoApp.jsx e pelos outros ficheiros.
import React, { useState, useEffect, useLayoutEffect, useRef, memo, useContext } from 'react';
import { createPortal } from 'react-dom';

// Stable Input - COMPLETAMENTE isolado do React, nunca re-renderiza
const StableInput = memo(({type = 'text', initialValue, onSave, className, placeholder, step, tabIndex}) => {
  const inputRef = useRef(null);
  const onSaveRef = useRef(onSave);
  const lastSavedValue = useRef(initialValue);
  
  // Atualizar ref do callback sem causar re-render
  onSaveRef.current = onSave;
  
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    
    // Set initial value
    input.value = initialValue ?? '';
    lastSavedValue.current = initialValue;
    
    let isFocused = false;
    
    const onFocus = () => {
      isFocused = true;
    };
    
    const saveValue = () => {
      const val = type === 'number' ? (+input.value || 0) : input.value;
      if (val !== lastSavedValue.current) {
        lastSavedValue.current = val;
        onSaveRef.current(val);
      }
    };
    
    const onBlur = () => {
      isFocused = false;
      saveValue();
    };
    
    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        saveValue();
        input.blur();
      }
    };
    
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeyDown);
    
    return () => {
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeyDown);
    };
  }, []); // NUNCA re-executar

  // Se o valor mudar por fora (outro mês, outro registo, importação...) e não estiveres a escrever
  // neste campo, mostra o valor novo. Antes isto dependia de o campo ser recriado a cada render.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    if (String(input.value) !== String(initialValue ?? '')) input.value = initialValue ?? '';
    lastSavedValue.current = initialValue;
  }, [initialValue]);
  
  return (
    <input 
      ref={inputRef} 
      type={type} 
      defaultValue={initialValue}
      className={className}
      placeholder={placeholder}
      step={step}
      tabIndex={tabIndex}
    />
  );
}); // Pode voltar a desenhar (o texto que estás a escrever não se perde: o campo não é controlado pelo React)

// Stable Date Input - para campos de data
const StableDateInput = memo(({value, onChange, className}) => {
  const inputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const mountedRef = useRef(false);
  
  onChangeRef.current = onChange;
  
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    
    let isFocused = false;
    
    if (!mountedRef.current) {
      input.value = value ?? '';
      mountedRef.current = true;
    }
    
    const onFocus = () => { isFocused = true; };
    const onBlur = () => { isFocused = false; };
    const handleChange = () => { onChangeRef.current(input.value); };
    
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('change', handleChange);
    
    return () => {
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('change', handleChange);
    };
  }, []);
  
  useEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    
    const timer = setTimeout(() => {
      if (document.activeElement !== input && input.value !== value) {
        input.value = value ?? '';
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [value]);
  
  return (
    <input 
      ref={inputRef}
      type="date" 
      defaultValue={value}
      className={className}
    />
  );
});

// Slider com input manual
const SliderWithInput = memo(({value, onChange, min = 0, max = 100, unit = '%', className, color = 'blue'}) => {
 const [local, setLocal] = useState(value);
 const [inputVal, setInputVal] = useState(value);
 const dragging = useRef(false);
 
 useEffect(() => { if (!dragging.current) { setLocal(value); setInputVal(value); } }, [value]);
 
 const colors = {
 blue: 'accent-blue-500',
 pink: 'accent-pink-500',
 emerald: 'accent-emerald-500',
 purple: 'accent-purple-500',
 cyan: 'accent-cyan-500'
 };
 
 return (
 <div className="flex items-center gap-3">
 <input 
 type="range" min={min} max={max} value={local} 
 onChange={e => setLocal(+e.target.value)}
 onMouseDown={() => dragging.current = true}
 onMouseUp={() => { dragging.current = false; onChange(local); setInputVal(local); }}
 onTouchStart={() => dragging.current = true}
 onTouchEnd={() => { dragging.current = false; onChange(local); setInputVal(local); }}
 className={`${className} ${colors[color]}`}
 />
 <div className="flex items-center gap-1 bg-slate-700/50 rounded-xl px-3 py-1.5">
 <input 
 type="number" min={min} max={max}
 value={inputVal}
 onChange={e => setInputVal(e.target.value)}
 onBlur={e => { const v = Math.min(max, Math.max(min, +e.target.value || 0)); onChange(v); setLocal(v); setInputVal(v); }}
 onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
 className="w-12 bg-transparent border-none text-white text-right outline-none font-bold"
 />
 <span className="text-slate-400 text-sm">{unit}</span>
 </div>
 </div>
 );
});

// Charts
// ══ GRÁFICOS ════════════════════════════════════════════════════════════════
// Desenhados à largura real do cartão (sem esticar o SVG), linhas finas, grelha discreta,
// eixo com valores redondos e um cursor com caixa de valores ao passar o rato / tocar.
// As cores de grelha, texto e caixa vêm de variáveis CSS (--graf-*) definidas por tema.
const useLargura = (padrao = 600) => {
  // ref de callback: volta a medir mesmo que o gráfico só apareça depois (quando os dados chegam)
  const [el, ref] = useState(null);
  const [w, setW] = useState(padrao);
  // useLayoutEffect: mede antes de o browser pintar, para as barras não aparecerem
  // primeiro no sítio errado e depois "saltarem"
  useLayoutEffect(() => {
    if (!el) return undefined;
    const medir = () => setW(Math.max(120, Math.round(el.clientWidth || padrao)));
    medir();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', medir); return () => window.removeEventListener('resize', medir); }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, padrao]);
  return [ref, w];
};
// Marcas do eixo em números redondos (1, 2, 2,5, 5 × 10ⁿ)
const grafMarcas = (min, max, n = 4) => {
  const span = (max - min) || Math.abs(max) || 1;
  const bruto = span / n, p = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / p;
  const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const lo = Math.floor(min / passo) * passo, hi = Math.ceil(max / passo) * passo;
  const out = [];
  for (let v = lo; v <= hi + passo / 2; v += passo) out.push(Math.round(v * 100) / 100);
  return out.length > 1 ? out : [lo, lo + passo];
};
const grafCompacto = v => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',').replace(/,0$/, '') + 'M';
  if (a >= 1000) return s + (a / 1000).toFixed(a >= 1e4 ? 0 : 1).replace('.', ',').replace(/,0$/, '') + 'k';
  return s + Math.round(a);
};
// Caixa do gráfico: fica à direita do ponto, ou à esquerda quando não cabe (linhas com "tarefa" mostram o nome de cada tarefa)
const GrafCaixa = ({ x, largura, titulo, linhas }) => {
  const larga = linhas.some(l => l.tarefa);
  const caixaW = larga ? 340 : 190;
  const aEsquerda = x + 14 + caixaW > largura && x - 14 - caixaW >= 0;
  const pos = aEsquerda ? { right: Math.max(4, largura - x + 14) } : { left: Math.max(4, Math.min(x + 14, largura - caixaW)) };
  return (
    <div className={`absolute top-1 z-10 pointer-events-none rounded-lg border px-3 py-2 text-xs shadow-xl min-w-[150px] ${larga ? 'w-[340px] max-w-[calc(100%-8px)]' : ''}`}
      style={{ ...pos, background: 'var(--graf-caixa)', borderColor: 'var(--graf-caixa-borda)', color: 'var(--graf-texto)' }}>
      <p className="mb-1" style={{ color: 'var(--graf-eixo)' }}>{titulo}</p>
      {linhas.map((l, k) => (l.tarefa ? (
        <p key={k} className="flex items-baseline gap-2 leading-snug pl-5 py-0.5 text-[11px]">
          <span className="min-w-0 flex-1 break-words" style={{ color: 'var(--graf-eixo)' }}>{l.nome}</span>
          {l.valor && <span className="tabular-nums flex-shrink-0">{l.valor}</span>}
        </p>
      ) : (
        <p key={k} className={`flex items-center gap-2 leading-5 ${l.sep ? 'mt-1' : ''}`}>
          {l.cor && <span className="inline-block w-3 rounded-full flex-shrink-0" style={{ height: 2, background: l.cor }} />}
          <span className="font-semibold">{l.valor}</span>
          {l.nome && <span style={{ color: 'var(--graf-eixo)' }}>{l.nome}</span>}
        </p>
      )))}
    </div>
  );
};
// Linhas (uma ou várias séries) com área opcional
const GraficoLinhas = ({ series, rotulos, height = 220, formatarValor = v => _fmtEUR.format(v), rotuloFinal = null, aria = 'Gráfico', extraTip = null }) => {
  const [ref, w] = useLargura();
  const [hi, setHi] = useState(null);
  const n = rotulos.length;
  if (!n) return null;
  const todos = series.flatMap(s => s.valores.filter(v => v != null && Number.isFinite(v)));
  if (!todos.length) return null;
  const marcas = grafMarcas(Math.min(0, ...todos), Math.max(0, ...todos));
  const y0 = marcas[0], y1 = marcas[marcas.length - 1];
  const pl = 44, pr = 18, pt = rotuloFinal ? 24 : 12, pb = 26;
  const iw = Math.max(10, w - pl - pr), ih = Math.max(10, height - pt - pb);
  const X = i => pl + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const Y = v => pt + ih - ((v - y0) / ((y1 - y0) || 1)) * ih;
  const cada = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 54))));
  const mostraX = i => i === n - 1 || (i % cada === 0 && (n - 1 - i) >= cada * 0.6);
  const caminho = vals => vals.reduce((d, v, i) => (v == null || !Number.isFinite(v) ? d : d + (d ? ' L ' : 'M ') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)), '');
  const area = vals => {
    const idx = vals.map((v, i) => (v == null || !Number.isFinite(v) ? null : i)).filter(i => i != null);
    if (idx.length < 2) return '';
    return caminho(vals) + ` L ${X(idx[idx.length - 1]).toFixed(1)} ${Y(Math.max(y0, 0)).toFixed(1)} L ${X(idx[0]).toFixed(1)} ${Y(Math.max(y0, 0)).toFixed(1)} Z`;
  };
  const mover = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = n === 1 ? 0 : Math.round(((e.clientX - r.left - pl) / iw) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, i)));
  };
  const s0 = series[0];
  const ultI = s0.valores.reduce((a, v, i) => (v != null && Number.isFinite(v) ? i : a), -1);
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={w} height={height} className="block" role="img" aria-label={aria}
        onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHi(null)} style={{ touchAction: 'pan-y' }}>
        <rect x={pl} y={pt} width={iw} height={ih} fill="transparent" />
        {marcas.map(t => (
          <g key={t}>
            <line x1={pl} x2={w - pr} y1={Y(t)} y2={Y(t)} strokeWidth="1" style={{ stroke: t === 0 ? 'var(--graf-base)' : 'var(--graf-grelha)' }} />
            <text x={pl - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--graf-eixo)', fontVariantNumeric: 'tabular-nums' }}>{grafCompacto(t)}</text>
          </g>
        ))}
        {rotulos.map((l, i) => (mostraX(i) ? <text key={i} x={X(i)} y={height - 6} textAnchor={n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle'} fontSize="11" style={{ fill: 'var(--graf-eixo)' }}>{l}</text> : null))}
        {series.map((s, k) => s.area && <path key={'a' + k} d={area(s.valores)} fill={s.cor} fillOpacity="0.12" />)}
        {series.map((s, k) => <path key={'l' + k} d={caminho(s.valores)} fill="none" stroke={s.cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.tracejado ? '5 4' : undefined} />)}
        {hi != null && <line x1={X(hi)} x2={X(hi)} y1={pt} y2={pt + ih} strokeWidth="1" style={{ stroke: 'var(--graf-eixo)', opacity: 0.6 }} />}
        {ultI >= 0 && hi == null && <circle cx={X(ultI)} cy={Y(s0.valores[ultI])} r="4" fill={s0.cor} strokeWidth="2" style={{ stroke: 'var(--graf-fundo)' }} />}
        {hi != null && series.map((s, k) => (s.valores[hi] != null && Number.isFinite(s.valores[hi])
          ? <circle key={'h' + k} cx={X(hi)} cy={Y(s.valores[hi])} r="4.5" fill={s.cor} strokeWidth="2" style={{ stroke: 'var(--graf-fundo)' }} /> : null))}
        {rotuloFinal && ultI >= 0 && hi == null && (
          <text x={X(ultI)} y={Y(s0.valores[ultI]) - 10} textAnchor={ultI === 0 ? 'start' : 'end'} fontSize="12" fontWeight="600" style={{ fill: 'var(--graf-texto)' }}>{rotuloFinal(s0.valores[ultI])}</text>
        )}
      </svg>
      {hi != null && (
        <GrafCaixa x={X(hi)} largura={w} titulo={rotulos[hi]}
          linhas={[...series.filter(s => s.valores[hi] != null && Number.isFinite(s.valores[hi])).map(s => ({ cor: series.length > 1 ? s.cor : null, valor: formatarValor(s.valores[hi]), nome: s.nome })), ...(extraTip ? extraTip(hi) : [])]} />
      )}
    </div>
  );
};

const LineChart = memo(({ data, height = 200, color = '#3b82f6', showValues = false, formatValue }) => {
  if (!data || data.length === 0) return null;
  return (
    <GraficoLinhas height={height} rotulos={data.map(d => d.label)} aria="Evolução"
      series={[{ nome: '', cor: color, valores: data.map(d => Number(d.value) || 0), area: true }]}
      rotuloFinal={showValues ? (formatValue || grafCompacto) : null} />
  );
});

// Receitas de sempre: série principal com área + média móvel de 3 meses
const AreaChartAllTime = memo(({ data, height = 280 }) => {
  if (!data || data.length === 0) return null;
  const vals = data.map(d => Number(d.value) || 0);
  const media = vals.map((_, i) => (i < 2 ? null : (vals[i] + vals[i - 1] + vals[i - 2]) / 3));
  return (
    <div>
      <div className="flex justify-end gap-4 text-xs mb-1" style={{ color: 'var(--graf-eixo)' }}>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 rounded-full" style={{ height: 2, background: '#3b82f6' }} />Receita</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4" style={{ height: 2, backgroundImage: 'repeating-linear-gradient(90deg, #d97706 0 5px, transparent 5px 9px)' }} />Média 3 meses</span>
      </div>
      <GraficoLinhas height={height - 20} rotulos={data.map(d => d.label)} aria="Receitas ao longo do tempo"
        series={[{ nome: 'Receita', cor: '#3b82f6', valores: vals, area: true }, { nome: 'Média 3m', cor: '#d97706', valores: media, tracejado: true }]} />
    </div>
  );
});

// Barras empilhadas: recibos com taxas (cima) e sem taxas (base)
const GRAF_COM = '#ea580c';
const GRAF_SEM = '#059669';
const BarChart = memo(({ data, height = 220 }) => {
  const [ref, w] = useLargura();
  const [hi, setHi] = useState(null);
  if (!data || data.length === 0) return null;
  const tot = d => (Number(d.com) || 0) + (Number(d.sem) || 0);
  const marcas = grafMarcas(0, Math.max(1, ...data.map(tot)));
  const topo = marcas[marcas.length - 1];
  const pl = 44, pr = 8, pt = 10, pb = 26;
  const iw = Math.max(10, w - pl - pr), ih = Math.max(10, height - pt - pb);
  const banda = iw / data.length, bw = Math.max(6, Math.min(24, banda * 0.62));
  const Y = v => pt + ih - (v / topo) * ih;
  const topoRedondo = (x, y, l, h, r) => {
    if (h <= 0) return '';
    const rr = Math.min(r, l / 2, h);
    return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + l - rr} ${y} Q ${x + l} ${y} ${x + l} ${y + rr} L ${x + l} ${y + h} Z`;
  };
  const cada = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(iw / 34))));
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={w} height={height} className="block" role="img" aria-label="Receitas por mês" onPointerLeave={() => setHi(null)} style={{ touchAction: 'pan-y' }}>
        {marcas.map(t => (
          <g key={t}>
            <line x1={pl} x2={w - pr} y1={Y(t)} y2={Y(t)} strokeWidth="1" style={{ stroke: t === 0 ? 'var(--graf-base)' : 'var(--graf-grelha)' }} />
            <text x={pl - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--graf-eixo)', fontVariantNumeric: 'tabular-nums' }}>{grafCompacto(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pl + banda * i + (banda - bw) / 2;
          const sem = Number(d.sem) || 0, com = Number(d.com) || 0;
          const hSem = (sem / topo) * ih, hCom = (com / topo) * ih;
          const gap = sem > 0 && com > 0 ? 2 : 0;
          const apagado = hi != null && hi !== i;
          return (
            <g key={i} style={{ opacity: apagado ? 0.45 : 1, transition: 'opacity .15s' }}>
              {sem > 0 && (com > 0
                ? <rect x={x} y={pt + ih - hSem} width={bw} height={Math.max(0, hSem)} fill={GRAF_SEM} />
                : <path d={topoRedondo(x, pt + ih - hSem, bw, hSem, 4)} fill={GRAF_SEM} />)}
              {com > 0 && <path d={topoRedondo(x, pt + ih - hSem - gap - hCom, bw, Math.max(0, hCom), 4)} fill={GRAF_COM} />}
              {(i % cada === 0) && <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="11" style={{ fill: 'var(--graf-eixo)' }}>{d.label}</text>}
              <rect x={pl + banda * i} y={pt} width={banda} height={ih} fill="transparent" onPointerEnter={() => setHi(i)} onPointerDown={() => setHi(i)} />
            </g>
          );
        })}
      </svg>
      {hi != null && (
        <GrafCaixa x={pl + banda * hi + banda / 2} largura={w} titulo={data[hi].label}
          linhas={[
            { cor: GRAF_COM, valor: _fmtEUR.format(Number(data[hi].com) || 0), nome: 'Com taxas' },
            ...((Number(data[hi].sem) || 0) > 0 ? [{ cor: GRAF_SEM, valor: _fmtEUR.format(Number(data[hi].sem) || 0), nome: 'Sem taxas' }] : []),
            { valor: _fmtEUR.format(tot(data[hi])), nome: 'Total' },
          ]} />
      )}
    </div>
  );
});

// Barras agrupadas (uma ou mais séries por mês), com linha de referência opcional (ex.: meta)
// e caixa de valores ao passar o rato / tocar.
const GraficoBarras = ({ rotulos, series, height = 200, referencia = null, apagado = () => false, extraTip = null, aria = 'Gráfico de barras', tituloTip = null }) => {
  const [ref, w] = useLargura();
  const [hi, setHi] = useState(null);
  const n = rotulos.length;
  if (!n) return null;
  const todos = series.flatMap(s => s.valores.map(v => Number(v) || 0));
  const marcas = grafMarcas(0, Math.max(1, ...todos, referencia ? Number(referencia.valor) || 0 : 0));
  const topo = marcas[marcas.length - 1];
  const pl = 44, pr = 8, pt = 10, pb = 26;
  const iw = Math.max(10, w - pl - pr), ih = Math.max(10, height - pt - pb);
  const banda = iw / n, k = series.length;
  const bw = Math.max(4, Math.min(24, (banda * 0.7 - (k - 1) * 2) / k));
  const grupo = k * bw + (k - 1) * 2;
  const Y = v => pt + ih - (Math.max(0, v) / topo) * ih;
  const topoRedondo = (x, y, l, h, r) => {
    if (h <= 0.5) return '';
    const rr = Math.min(r, l / 2, h);
    return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + l - rr} ${y} Q ${x + l} ${y} ${x + l} ${y + rr} L ${x + l} ${y + h} Z`;
  };
  const cada = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 34))));
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={w} height={height} className="block" role="img" aria-label={aria} onPointerLeave={() => setHi(null)} style={{ touchAction: 'pan-y' }}>
        {marcas.map(t => (
          <g key={t}>
            <line x1={pl} x2={w - pr} y1={Y(t)} y2={Y(t)} strokeWidth="1" style={{ stroke: t === 0 ? 'var(--graf-base)' : 'var(--graf-grelha)' }} />
            <text x={pl - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--graf-eixo)', fontVariantNumeric: 'tabular-nums' }}>{grafCompacto(t)}</text>
          </g>
        ))}
        {rotulos.map((r, i) => {
          const x0 = pl + banda * i + (banda - grupo) / 2;
          const fraco = apagado(i) || (hi != null && hi !== i);
          return (
            <g key={i} style={{ opacity: fraco ? 0.4 : 1, transition: 'opacity .15s' }}>
              {series.map((s, j) => {
                const v = Number(s.valores[i]) || 0;
                const cor = typeof s.cor === 'function' ? s.cor(i, v) : s.cor;
                return <path key={j} d={topoRedondo(x0 + j * (bw + 2), Y(v), bw, pt + ih - Y(v), 4)} fill={cor} />;
              })}
              {(i % cada === 0) && <text x={pl + banda * i + banda / 2} y={height - 6} textAnchor="middle" fontSize="11" style={{ fill: 'var(--graf-eixo)' }}>{r}</text>}
              <rect x={pl + banda * i} y={pt} width={banda} height={ih} fill="transparent" onPointerEnter={() => setHi(i)} onPointerDown={() => setHi(i)} />
            </g>
          );
        })}
        {referencia && Number(referencia.valor) > 0 && (
          <line x1={pl} x2={w - pr} y1={Y(referencia.valor)} y2={Y(referencia.valor)} strokeWidth="1.5" strokeDasharray="5 4" style={{ stroke: 'var(--graf-eixo)' }} pointerEvents="none" />
        )}
      </svg>
      {hi != null && (
        <GrafCaixa x={pl + banda * hi + banda / 2} largura={w} titulo={tituloTip ? tituloTip(hi) : rotulos[hi]}
          linhas={[
            ...series.map(s => ({ cor: typeof s.cor === 'function' ? s.cor(hi, Number(s.valores[hi]) || 0) : s.cor, valor: _fmtEUR.format(Number(s.valores[hi]) || 0), nome: s.nome })),
            ...(referencia && Number(referencia.valor) > 0 ? [{ valor: _fmtEUR.format(Number(referencia.valor)), nome: referencia.nome }] : []),
            ...(extraTip ? extraTip(hi) : []),
          ]} />
      )}
    </div>
  );
};

// Donut: fatias separadas por uma linha da cor do fundo; o centro mostra o total ou a fatia escolhida
const PieChart = memo(({ data, size = 200 }) => {
  const [hi, setHi] = useState(null);
  const itens = (data || []).filter(d => Number(d.value) > 0);
  const total = itens.reduce((a, d) => a + Number(d.value), 0);
  if (!total) return null;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4, ri = r * 0.64;
  const pt = (ang, raio) => [cx + raio * Math.cos(ang), cy + raio * Math.sin(ang)];
  let acc = 0;
  const fatias = itens.map(d => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += Number(d.value);
    const a1 = Math.min((acc / total) * Math.PI * 2 - Math.PI / 2, a0 + Math.PI * 2 - 0.0001);
    const g = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r), [x2, y2] = pt(a1, ri), [x3, y3] = pt(a0, ri);
    return { d, path: `M ${x0} ${y0} A ${r} ${r} 0 ${g} 1 ${x1} ${y1} L ${x2} ${y2} A ${ri} ${ri} 0 ${g} 0 ${x3} ${y3} Z` };
  });
  const sel = hi != null ? itens[hi] : null;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="Distribuição" onPointerLeave={() => setHi(null)}>
        {fatias.map((f, i) => (
          <path key={i} d={f.path} fill={f.d.color} strokeWidth="2" style={{ stroke: 'var(--graf-fundo)', opacity: hi != null && hi !== i ? 0.45 : 1, transition: 'opacity .15s', cursor: 'default' }}
            onPointerEnter={() => setHi(i)} onPointerDown={() => setHi(i)} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
        <span className="text-[11px] leading-tight truncate max-w-full" style={{ color: 'var(--graf-eixo)' }}>{sel ? (sel.label || '') : 'Total'}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--graf-texto)' }}>{_fmtEUR.format(sel ? Number(sel.value) : total)}</span>
        {sel && <span className="text-[11px]" style={{ color: 'var(--graf-eixo)' }}>{Math.round((Number(sel.value) / total) * 100)}%</span>}
      </div>
    </div>
  );
});

// Input para adicionar cliente (isolado para evitar re-renders)
const AddClienteInput = memo(({onAdd, inputClass}) => {
 const [value, setValue] = useState('');
 const handleAdd = () => {
 if (value.trim()) {
 onAdd(value.trim());
 setValue('');
 }
 };
 return (
 <div className="flex gap-3 mb-4">
 <input 
 className={`flex-1 ${inputClass}`} 
 value={value} 
 onChange={e => setValue(e.target.value)} 
 placeholder="Nome do novo cliente..." 
 onKeyDown={e => e.key === 'Enter' && handleAdd()}
 />
 <button 
 onClick={handleAdd}
 className="font-semibold rounded-xl transition-all duration-200 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 px-4 py-2 text-sm"
 >
 + Adicionar
 </button>
 </div>
 );
});

// Draggable List Component - só arrasta pelo handle
const DraggableList = memo(({items, onReorder, renderItem, className, style}) => {
 const [dragIdx, setDragIdx] = useState(null);
 const [overIdx, setOverIdx] = useState(null);
 
 const handleDragStart = (e, idx) => {
 setDragIdx(idx);
 e.dataTransfer.effectAllowed = 'move';
 };
 
 const handleDragOver = (e, idx) => {
 e.preventDefault();
 if (idx !== dragIdx) setOverIdx(idx);
 };
 
 const handleDrop = (e, idx) => {
 e.preventDefault();
 if (dragIdx !== null && dragIdx !== idx) {
 const newItems = [...items];
 const [removed] = newItems.splice(dragIdx, 1);
 newItems.splice(idx, 0, removed);
 onReorder(newItems);
 }
 setDragIdx(null);
 setOverIdx(null);
 };
 
 const handleDragEnd = () => {
 setDragIdx(null);
 setOverIdx(null);
 };
 
 return (
 <div className={className || "space-y-2"} style={style}>
 {items.map((item, idx) => (
 <div
 key={item.id}
 onDragOver={e => handleDragOver(e, idx)}
 onDrop={e => handleDrop(e, idx)}
 className={`transition-all duration-150 ${dragIdx === idx ? 'opacity-50 scale-95' : ''} ${overIdx === idx ? 'ring-2 ring-blue-500' : ''}`}
 >
 {renderItem(item, idx, dragIdx !== null, (e) => handleDragStart(e, idx), handleDragEnd)}
 </div>
 ))}
 </div>
 );
});

// Referência de um pagamento de impostos, tirada da data:
// SS → mês em que pagaste ("Out/26"); IVA → trimestre a que respeita (pago em Maio → "T1/26");
// IRS → ano dos rendimentos (pago em 2026 → "2025"); pago em Julho, Setembro ou Dezembro é pagamento por conta do próprio ano.
const impRefAuto = p => {
  const d = String((p && p.data) || '');
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
  if (!y || !m) return (p && p.referencia) || '—';
  if (p.tipo === 'IVA') { const i = y * 12 + (m - 1) - 3; return `T${Math.floor((i % 12) / 3) + 1}/${String(Math.floor(i / 12)).slice(2)}`; }
  if (p.tipo === 'IRS') return impNum(p.valor) > 0 && [7, 9, 12].includes(m) ? `Conta/${String(y).slice(2)}` : String(y - 1);
  return `${meses[m - 1].substring(0, 3)}/${String(y).slice(2)}`;
};
// Componente isolado para pagamentos de impostos - memo evita re-renders do pai
const PagamentosImpostos = memo(({ impostosPagos, anoAtual, theme, onAdd, onUpdate, onDelete, fmt, showToast, confirmDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const tipoRef = useRef(null);
  const direcaoRef = useRef(null);
  const dataRef = useRef(null);
  const valorRef = useRef(null);

  const tiposCores = { SS: 'text-blue-400', IVA: 'text-orange-400', IRS: 'text-emerald-400' };
  const tiposIcons = { SS: '🏛', IVA: '💶', IRS: '📋' };
  const todos = (impostosPagos || []).filter(p => p.data?.startsWith(anoAtual.toString())).sort((a, b) => b.data.localeCompare(a.data));
  const totalPago = todos.filter(p => p.valor > 0).reduce((a, p) => a + p.valor, 0);
  const totalRecebido = todos.filter(p => p.valor < 0).reduce((a, p) => a + Math.abs(p.valor), 0);

  return (
    <div className="mt-3">
      <button 
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-700/30 hover:bg-slate-700/50 text-slate-300'} transition-all`}
      >
        <span className="flex items-center gap-2">
          <span><Ico e="💳" className="ico-solo"/></span>
          <span className="font-medium">Pagamentos registados</span>
          {todos.length > 0 && (
            <span className="text-xs text-slate-400">
              ({todos.length}){' '}
              {totalPago > 0 && <span className="text-red-400">↑ {fmt(totalPago)}</span>}
              {totalPago > 0 && totalRecebido > 0 && ' '}
              {totalRecebido > 0 && <span className="text-emerald-400">↓ {fmt(totalRecebido)}</span>}
            </span>
          )}
        </span>
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>
      
      {expanded && (
        <div className="mt-2 space-y-2 animate-fadeIn">
          {/* Formulário */}
          <div className={`flex flex-wrap gap-2 items-end p-3 rounded-xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-700/30'}`}>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500">Tipo</span>
              <select ref={tipoRef} defaultValue="SS"
                className={`${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'} border rounded-lg px-2 py-1.5 text-xs`}>
                <option value="SS">🏛 SS</option>
                <option value="IVA">💶 IVA</option>
                <option value="IRS">📋 IRS</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500">Direção</span>
              <select ref={direcaoRef} defaultValue="pago"
                className={`${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'} border rounded-lg px-2 py-1.5 text-xs`}>
                <option value="pago">↑ Pago</option>
                <option value="recebido">↓ Recebido</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500">Data</span>
              <input ref={dataRef} type="date" defaultValue={new Date().toISOString().split('T')[0]}
                className={`${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'} border rounded-lg px-2 py-1.5 text-xs w-32`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500">Valor (€)</span>
              <input ref={valorRef} type="number" step="0.01" placeholder="0.00"
                className={`${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'} border rounded-lg px-2 py-1.5 text-xs w-24`} />
            </div>
            <button onClick={() => {
              const tipo = tipoRef.current?.value || 'SS';
              const direcao = direcaoRef.current?.value || 'pago';
              const data = dataRef.current?.value || new Date().toISOString().split('T')[0];
              const valRaw = parseFloat(valorRef.current?.value);
              const referencia = impRefAuto({ tipo, data });
              if (!valRaw || valRaw <= 0) { showToast('Insere um valor válido', 'warning'); return; }
              onAdd({ tipo, data, valor: direcao === 'recebido' ? -valRaw : valRaw, referencia });
              if (valorRef.current) valorRef.current.value = '';
            }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
            >+ Adicionar</button>
          </div>
          
          {/* Lista */}
          {todos.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">Nenhum pagamento registado em {anoAtual}</p>
          ) : (() => {
            const totaisPorTipo = {};
            todos.forEach(p => { 
              if (!totaisPorTipo[p.tipo]) totaisPorTipo[p.tipo] = { pago: 0, recebido: 0 };
              if (p.valor >= 0) totaisPorTipo[p.tipo].pago += p.valor;
              else totaisPorTipo[p.tipo].recebido += Math.abs(p.valor);
            });
            const LIMIT = 6;
            const visivel = showAll ? todos : todos.slice(0, LIMIT);
            return (
              <>
                <div className="flex flex-wrap gap-3 px-3">
                  {Object.entries(totaisPorTipo).map(([tipo, vals]) => (
                    <span key={tipo} className={`text-xs ${tiposCores[tipo]}`}>
                      {tiposIcons[tipo]} {tipo}: {vals.pago > 0 ? `↑${fmt(vals.pago)}` : ''}{vals.pago > 0 && vals.recebido > 0 ? ' · ' : ''}{vals.recebido > 0 ? <span className="text-emerald-400">↓{fmt(vals.recebido)}</span> : ''}
                    </span>
                  ))}
                </div>
                <div className="space-y-1 px-1">
                  {visivel.map(p => (
                    <div key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${p.valor < 0 ? (theme === 'light' ? 'bg-emerald-50' : 'bg-emerald-900/10') : (theme === 'light' ? 'bg-slate-50' : 'bg-slate-800/30')}`}>
                      <span className="flex-shrink-0">{tiposIcons[p.tipo]}</span>
                      <select defaultValue={p.tipo}
                        className={`${theme === 'light' ? 'bg-transparent text-slate-900' : 'bg-transparent text-white'} text-xs w-12 cursor-pointer`}
                        onChange={e => onUpdate(p.id, 'tipo', e.target.value)}>
                        <option value="SS">SS</option><option value="IVA">IVA</option><option value="IRS">IRS</option>
                      </select>
                      <input type="date" defaultValue={p.data}
                        className={`${theme === 'light' ? 'bg-transparent text-slate-600' : 'bg-transparent text-slate-400'} text-xs w-28`}
                        onBlur={e => { if (e.target.value !== p.data) onUpdate(p.id, 'data', e.target.value); }} />
                      <span title={p.tipo === 'IVA' ? 'Trimestre a que respeita, pela data do pagamento' : p.tipo === 'IRS' ? 'Ano dos rendimentos, pela data do pagamento' : 'Mês do pagamento'}
                        className={`${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-400'} px-1.5 py-0.5 rounded text-[10px] w-16 text-center`}>{impRefAuto(p)}</span>
                      <div className="flex-1" />
                      <span className={`text-[10px] flex-shrink-0 ${p.valor < 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.valor < 0 ? '↓' : '↑'}</span>
                      <input type="number" step="0.01" defaultValue={Math.abs(p.valor)}
                        className={`${p.valor < 0 ? 'text-emerald-400' : (theme === 'light' ? 'text-slate-900' : 'text-white')} bg-transparent font-bold text-xs text-right w-20`}
                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { const nv = p.valor < 0 ? -Math.abs(v) : Math.abs(v); if (nv !== p.valor) onUpdate(p.id, 'valor', nv); }}} />
                      <span className="text-slate-500 text-[10px]">€</span>
                      <button onClick={() => onUpdate(p.id, 'valor', -p.valor)}
                        className={`text-[10px] px-1 rounded ${p.valor < 0 ? 'text-emerald-400/60 hover:text-emerald-400' : 'text-red-400/60 hover:text-red-400'}`} title="Alternar pago/recebido">⇅</button>
                      <button onClick={() => onDelete(p)}
                        className="text-red-400/50 hover:text-red-400 flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
                {todos.length > LIMIT && (
                  <button onClick={() => setShowAll(!showAll)}
                    className={`w-full text-center text-xs py-1.5 rounded-lg ${theme === 'light' ? 'text-blue-600 hover:bg-slate-100' : 'text-blue-400 hover:bg-slate-700/30'}`}>
                    {showAll ? `▲ Mostrar últimos ${LIMIT}` : `▼ Ver todos (${todos.length})`}
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
});

// Custom Category Dropdown (wrapper takes child styles, dd anchored to wrapper)
const CategoryDropdown = ({ value, options, onChange, theme: th, className: cls = '' }) => {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const wrapRef = useRef(null);

  const selected = (options || []).find(o => o.id === value) || (options && options[0]);

  const handleToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (open) { setOpen(false); return; }
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const desiredHeight = Math.min((options?.length || 1) * 36 + 16, 360);
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      setOpenUp(spaceBelow < desiredHeight && spaceAbove > spaceBelow);
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onClick);
      document.addEventListener('keydown', onEsc);
    }, 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // The wrapper applies the cls (sizing/styling) and the button is just for click/visual content
  return (
    <div ref={wrapRef} className={cls + " relative cursor-pointer flex items-center gap-1"} 
         onClick={handleToggle} title={selected?.nome}>
      <span className="flex-shrink-0">{selected?.icon}</span>
      <span className="truncate flex-1 text-left">{selected?.nome}</span>
      <span className="text-[8px] flex-shrink-0 opacity-60">▾</span>
      {open && (
        <div
          className={"absolute rounded-lg border shadow-2xl overflow-y-auto " + (th === 'light' ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-600') + (openUp ? ' bottom-full mb-1' : ' top-full mt-1')}
          style={{left: 0, minWidth: 180, maxHeight: 360, zIndex: 9999}}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}>
          {(options || []).map(opt => (
            <button key={opt.id} type="button"
              onClick={(e) => { e.stopPropagation(); onChange(opt.id); setOpen(false); }}
              className={"w-full text-left px-3 py-2 text-sm flex items-center gap-2 whitespace-nowrap " + (opt.id === value ? (th === 'light' ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/20 text-blue-400') : (th === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-700/50'))}>
              <span>{opt.icon}</span>
              <span>{opt.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};


// ── Constantes ao nível do módulo (criadas uma só vez, não a cada render) ──
const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Escaloes IRS 2026
const ESCALOES_IRS = [
  { limite: 8342, taxa: 0.125 }, { limite: 12587, taxa: 0.157 },
  { limite: 17838, taxa: 0.212 }, { limite: 23089, taxa: 0.241 },
  { limite: 29397, taxa: 0.311 }, { limite: 43090, taxa: 0.349 },
  { limite: 46566, taxa: 0.431 }, { limite: 86634, taxa: 0.446 },
  { limite: Infinity, taxa: 0.48 }
];
const DEDUCAO_CATA = 4587.09; // dedução específica da categoria A (trabalho por conta de outrem), 2026
const IRS_CFG_PADRAO = { conjunto: true, coef: 0.75, saraBruto: 0, saraRetencao: 0, deducoes: 500 };
// Taxa de retenção na fonte habitual (art. 101.º CIRS): 23% nas atividades da tabela do art. 151.º
// (coeficiente 0,75); 11,5% nas outras prestações de serviços (coeficiente 0,35)
// Mês ("AAAA-M") de uma data de recibo "AAAA-MM-DD"; null se a data não for válida
const mesDoRecibo = d => { const m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(d || '')); return m && +m[2] >= 1 && +m[2] <= 12 ? `${+m[1]}-${+m[2]}` : null; };
const retencaoPadrao = coef => (Number(coef) >= 0.75 ? 23 : 11.5);
const impNum = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const impIRSEscaloes = rend => {
  let imposto = 0, anterior = 0;
  for (const e of ESCALOES_IRS) {
    if (rend > anterior) { imposto += (Math.min(rend, e.limite) - anterior) * e.taxa; anterior = e.limite; }
  }
  return imposto;
};
// ══ GUIA DE TRANSFERÊNCIAS ══════════════════════════════════════════════════
// Os pagamentos chegam ao Activo Bank. Daí saem, por esta ordem e com o mínimo de movimentos:
// ABanca (casal), investimentos dos filhos, Trade Republic (impostos + FE + cripto/ETF da TR +
// amortização a juntar), cada corretora/plataforma e a Revolut (férias). Fica no Activo o das
// despesas pessoais e o que ainda não foi alocado.
// Em duas fases: (1) antes do dia 1, a ABanca — se os clientes ainda não pagaram, adianta-se pela TR;
// (2) quando os clientes pagam, o resto; a transferência para a TR já inclui repor o adiantamento.
const guiaTransfCalc = ({ minhaAB = 0, investFilhos = 0, impostosNaTR = 0, inv = [], restante = 0, alocAmort = 0, alocFerias = 0, totalFerias = 0, recebidoMes = 0, totPess = 0, adiantou = false }) => {
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const ehTR = i => i.cat === 'CRIPTO' || i.cat === 'FE' || /trade\s*republic|^tr\b/i.test(String(i.desc || '').trim());
  const itens = (inv || []).filter(i => i && i.cat !== 'CREDITO' && n(i.val) > 0);
  const disp = restante > 0 ? restante : 0;
  const amort = r2(disp * ((alocAmort - alocFerias) / 100) + (inv || []).filter(i => i && i.cat === 'CREDITO').reduce((s, i) => s + n(i.val), 0));
  const pInv = disp * ((100 - alocAmort) / 100);
  const passos = [];
  const filhos = n(investFilhos);
  const valAB = r2(Math.max(0, minhaAB - filhos));
  if (valAB > 0.5) {
    passos.push({ id: 'g_abanca', fase: 1, para: 'ABanca', icon: '🏠', valor: valAB, linhas: [['Despesas do casal (a prestação sai dia 1)', valAB]], nota: filhos > 0 ? 'Já sem os investimentos dos filhos, que saem diretamente do Activo' : '', dispensado: adiantou });
    passos.push({ id: 'g_adiant', fase: 1, de: 'Trade Republic', para: 'ABanca', icon: '🏠', valor: valAB, linhas: [['Despesas do casal, adiantadas pela TR', valAB]], opcional: true, nota: 'Repões quando os clientes pagarem: já vai incluído no passo da Trade Republic.' });
  }
  if (filhos > 0) passos.push({ id: 'g_filhos', para: 'Investimentos dos filhos', icon: '👶', valor: r2(filhos), linhas: [] });
  const tr = itens.filter(ehTR);
  const nomeTR = i => (/trade\s*republic|^tr\b/i.test(String(i.desc || '').trim()) || !i.desc ? i.cat : i.desc);
  const linhasTR = [['Impostos (não mexer)', r2(impostosNaTR)], ...tr.map(i => [i.cat === 'FE' ? 'Fundo de emergência' : nomeTR(i), r2(n(i.val))]), ...(amort > 0.5 ? [['Amortização (fica a juntar)', amort]] : []), ...(adiantou && valAB > 0.5 ? [['Repor o adiantamento da ABanca', valAB]] : [])].filter(l => l[1] > 0.004);
  const valTR = r2(linhasTR.reduce((s, l) => s + l[1], 0));
  const compraNaTR = [...new Set(tr.filter(i => i.cat !== 'FE').map(nomeTR))];
  if (valTR > 0.5) passos.push({ id: 'g_tr', para: 'Trade Republic', icon: '📈', valor: valTR, linhas: linhasTR, nota: compraNaTR.length ? `Depois, lá dentro: comprar ${compraNaTR.join(', ')}` : '' });
  const grupos = {};
  itens.filter(i => !ehTR(i)).forEach(i => {
    const nome = String(i.desc || i.cat).trim() || i.cat;
    const k = nome.toLowerCase();
    if (!grupos[k]) grupos[k] = { nome, valor: 0, cats: new Set() };
    grupos[k].valor += n(i.val); grupos[k].cats.add(i.cat);
  });
  Object.values(grupos).forEach(g => passos.push({ id: 'g_inv_' + g.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_'), para: g.nome, icon: '💼', valor: r2(g.valor), linhas: [[[...g.cats].join(' + '), r2(g.valor)]] }));
  if (totalFerias > 0.5) passos.push({ id: 'g_revolut', para: 'Revolut', icon: '🏖', valor: r2(totalFerias), linhas: [['Férias', r2(totalFerias)]] });
  passos.forEach(x => { if (!x.fase) x.fase = 2; if (!x.de) x.de = 'Activo'; });
  const doActivo = f => r2(passos.filter(x => x.de === 'Activo' && !x.dispensado && (f == null || x.fase === f)).reduce((s, x) => s + x.valor, 0));
  const saidas = doActivo(2);
  const porAlocar = r2(pInv - itens.reduce((s, i) => s + n(i.val), 0));
  const fica = r2(recebidoMes - doActivo());
  return { passos, saidas, fica, porAlocar, totPess: r2(totPess), valAB };
};

// Uma transferência dada como feita guarda o valor que foi transferido. Se a Alocação subir depois
// (ex.: um recibo que chega a meio do mês), o passo volta a ficar por fazer — só pela diferença.
const transfFalta = (t, x) => {
  const v = (t || {})[x.id];
  if (!v) return x.valor;
  if (v === true) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round((x.valor - n) * 100) / 100) : 0;
};
const transfFeita = (t, x) => transfFalta(t, x) < 0.5;

const ICO_SVG = {
  '📓': '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/><path d="M9 4v12"/>',
  '🗂': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>',
  "💬": "<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/>",
  "📊": "<path d=\"M3 3v18h18\"/><path d=\"M7 16v-5M12 16V7M17 16v-8\"/>",
  "📈": "<polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\"/><polyline points=\"16 7 22 7 22 13\"/>",
  "🚀": "<polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\"/><polyline points=\"16 7 22 7 22 13\"/>",
  "📉": "<polyline points=\"22 17 13.5 8.5 8.5 13.5 2 7\"/><polyline points=\"16 17 22 17 22 11\"/>",
  "🏦": "<path d=\"M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M12 3l9 5H3z\"/>",
  "🏛": "<path d=\"M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M12 3l9 5H3z\"/>",
  "🎯": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\"/>",
  "💎": "<path d=\"M6 3h12l4 6-10 12L2 9z\"/><path d=\"M2 9h20M10 3 8 9l4 12 4-12-2-6\"/>",
  "📝": "<path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z\"/>",
  "👥": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/>",
  "👤": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>",
  "👩": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>",
  "🏠": "<path d=\"M3 10.5 12 3l9 7.5\"/><path d=\"M5 9.5V20h5v-6h4v6h5V9.5\"/>",
  "🏡": "<path d=\"M3 10.5 12 3l9 7.5\"/><path d=\"M5 9.5V20h5v-6h4v6h5V9.5\"/>",
  "📅": "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"16.5\" rx=\"2\"/><path d=\"M3 9.5h18M8 2.5v4M16 2.5v4\"/>",
  "📆": "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"16.5\" rx=\"2\"/><path d=\"M3 9.5h18M8 2.5v4M16 2.5v4\"/>",
  "🗓": "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"16.5\" rx=\"2\"/><path d=\"M3 9.5h18M8 2.5v4M16 2.5v4\"/>",
  "💵": "<rect x=\"2\" y=\"6\" width=\"20\" height=\"12\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\"/><path d=\"M6 12h.01M18 12h.01\"/>",
  "💶": "<rect x=\"2\" y=\"6\" width=\"20\" height=\"12\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\"/><path d=\"M6 12h.01M18 12h.01\"/>",
  "💰": "<path d=\"M3 7a2 2 0 0 1 2-2h13v4\"/><path d=\"M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z\"/><circle cx=\"16\" cy=\"14.5\" r=\"1.2\"/>",
  "💸": "<path d=\"M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4\"/>",
  "📤": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12\"/>",
  "📥": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3\"/>",
  "🔮": "<path d=\"M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z\"/>",
  "✨": "<path d=\"M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z\"/>",
  "🌟": "<polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26\"/>",
  "💼": "<rect x=\"2\" y=\"7\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"/>",
  "📋": "<rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\"/><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6\"/>",
  "📁": "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z\"/>",
  "⚠": "<path d=\"M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"/><path d=\"M12 9v4M12 17h.01\"/>",
  "⚙": "<path d=\"M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6\"/>",
  "🧾": "<path d=\"M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z\"/><path d=\"M16 8H8M16 12H8M13 16H8\"/>",
  "📍": "<path d=\"M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>",
  "↩": "<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 0 11H11\"/>",
  "🧭": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><polygon points=\"16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88\"/>",
  "💳": "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M2 10h20\"/>",
  "📄": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6M16 13H8M16 17H8\"/>",
  "⚡": "<polygon points=\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\"/>",
  "➕": "<path d=\"M12 5v14M5 12h14\"/>",
  "✅": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m9 12 2 2 4-4\"/>",
  "🧮": "<rect x=\"4\" y=\"2\" width=\"16\" height=\"20\" rx=\"2\"/><path d=\"M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01\"/>",
  "🏖": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41\"/>",
  "📦": "<path d=\"M21 8 12 3 3 8v8l9 5 9-5z\"/><path d=\"M3 8l9 5 9-5M12 13v8\"/>",
  "🏷": "<path d=\"M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4z\"/><circle cx=\"7\" cy=\"7\" r=\"1.5\"/>",
  "🤖": "<rect x=\"3\" y=\"8\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M12 8V4H8M9 13v2M15 13v2\"/>",
  "🔔": "<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\"/><path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\"/>",
  "🌍": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a14 14 0 0 1 4 9 14 14 0 0 1-4 9 14 14 0 0 1-4-9 14 14 0 0 1 4-9z\"/>",
  "⏱": "<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M12 9v4l2 2M10 2h4\"/>",
  "🔥": "<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>",
  "🐷": "<path d=\"M19 5 5 19\"/><circle cx=\"6.5\" cy=\"6.5\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"/>",
  "🔍": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/>",
  "🎨": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"8\" cy=\"10\" r=\"1\"/><circle cx=\"12\" cy=\"7.5\" r=\"1\"/><circle cx=\"16\" cy=\"10\" r=\"1\"/><path d=\"M12 21a3 3 0 0 1 0-6h2\"/>",
  "👶": "<circle cx=\"12\" cy=\"8\" r=\"5\"/><path d=\"M9 8h.01M15 8h.01M10 10.5a3 3 0 0 0 4 0M6 21a6 6 0 0 1 12 0\"/>",
  "💍": "<circle cx=\"12\" cy=\"15\" r=\"6\"/><path d=\"m9 5 3-3 3 3-3 4z\"/>",
  "📌": "<path d=\"M12 17v5M9 10.76V6h6v4.76l2 3.24H7z\"/><path d=\"M8 2h8\"/>",
  "🗑": '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  "📎": '<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>',
  "✏": '<path d="M14.5 4.5l5 5L9 20H4v-5z"/>',
  "🛒": '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 8H6"/>',
  "🔄": '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  "🔗": '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  "💾": '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  "🔒": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  "🔐": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  "🔓": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  "💡": '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  "⏳": '<path d="M6 2h12M6 22h12M7 2c0 5 10 5 10 10S7 17 7 22M17 2c0 5-10 5-10 10s10 5 10 10"/>',
  "✈": '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  "🎉": '<path d="M5.8 11.3 2 22l10.7-3.8"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.2.7a2.9 2.9 0 0 0-2 3.2v0c.2 1-.7 2-1.7 2H15"/><path d="M11 13c1.9 1.9 2.4 4.5 1.1 5.8-1.3 1.3-3.9.8-5.8-1.1S3.9 13.2 5.2 11.9c1.3-1.3 3.9-.8 5.8 1.1z"/>',
  "🏆": '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  "🚗": '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5M3 12h18"/>',
  "❌": '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  "🔎": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  "⏭": '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
  "⏺": '<circle cx="12" cy="12" r="6"/>',
  "🗺": '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  "ℹ": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
  };
// Ícone de linha a partir do emoji que já existia no texto; se não houver ícone para ele, mostra o emoji
const Ico = ({ e, className = '' }) => {
  const k = String(e || '').replace(/\uFE0F/g, '').trim();
  const svg = ICO_SVG[k];
  if (!svg) return k ? <span className={`ico-emoji ${className}`}>{k} </span> : null;
  return <svg className={`ico ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
};

// Texto que começa por emoji ("💰 Receitas"): troca o emoji pelo ícone de linha, se existir
const IcoTxt = ({ t }) => {
  const m = /^(\p{Extended_Pictographic}\uFE0F?)\s+([\s\S]*)$/u.exec(String(t ?? ''));
  return m && ICO_SVG[m[1].replace(/\uFE0F/g, '')] ? <><Ico e={m[1]}/>{m[2]}</> : (t ?? null);
};

// Cópias automáticas guardadas no próprio browser (IndexedDB, sem limite apertado de tamanho):
// uma por semana, ficam as 6 mais recentes. Servem para voltar atrás se algum dado se estragar.
const copiasLocais = {
  abrir: () => new Promise((ok, erro) => {
    try {
      const r = indexedDB.open('orcamento-copias', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('copias', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
    } catch (e) { erro(e); }
  }),
  async todas() {
    const db = await copiasLocais.abrir();
    return new Promise((ok, erro) => {
      const q = db.transaction('copias', 'readonly').objectStore('copias').getAll();
      q.onsuccess = () => ok((q.result || []).sort((a, b) => String(b.id).localeCompare(String(a.id))));
      q.onerror = () => erro(q.error);
    });
  },
  async guardar(conteudo) {
    const db = await copiasLocais.abrir();
    const antigas = await copiasLocais.todas();
    return new Promise((ok, erro) => {
      const tx = db.transaction('copias', 'readwrite'); const st = tx.objectStore('copias');
      st.put({ id: new Date().toISOString(), conteudo });
      antigas.slice(5).forEach(c => st.delete(c.id));
      tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error);
    });
  },
};

// ══ CALENDÁRIO FINANCEIRO ═══════════════════════════════════════════════════
// Vista de mês com tudo o que tem data: impostos (com valores previstos), prestação,
// tarefas da Agenda e a rotina do mês. Componente ao nível do módulo para não perder
// o mês e o dia escolhidos quando o resto da app muda.
const CAL_CORES = { SS: '#3b82f6', IVA: '#f59e0b', IRS: '#ef4444', Transf: '#10b981', Invest: '#8b5cf6', Contab: '#06b6d4', Seguros: '#ec4899', Casa: '#14b8a6', Venda: '#84cc16', Trabalho: '#e879f9', Rotina: '#64748b' };
const CalendarioFinanceiro = ({ eventosDoMes, theme, fmt, onToggle, anoInicial, mesInicial, notif }) => {
  const claro = theme === 'light';
  const hoje = new Date();
  const [y, setY] = useState(anoInicial);
  const [m, setM] = useState(mesInicial); // 1-12
  const ehMesHoje = y === hoje.getFullYear() && m === hoje.getMonth() + 1;
  const [dia, setDia] = useState(ehMesHoje ? hoje.getDate() : null);
  const evs = eventosDoMes(y, m);
  const porDia = {};
  evs.forEach(e => { (porDia[e.dia] = porDia[e.dia] || []).push(e); });
  const nDias = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // segunda = 0
  const mudar = d => { let mm = m + d, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } setM(mm); setY(yy); setDia(null); };
  const irHoje = () => { setY(hoje.getFullYear()); setM(hoje.getMonth() + 1); setDia(hoje.getDate()); };
  const diaSel = dia || (evs[0] ? evs[0].dia : null);
  const estadoCls = e => e.estado === 'ok' ? 'line-through opacity-60' : e.estado === 'atrasado' ? 'ring-1 ring-red-500/60' : '';
  // Próximos 30 dias (a partir de hoje), juntando este mês e o seguinte
  const proximos = (() => {
    const out = [];
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    for (let k = 0; k < 2; k++) {
      const d0 = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1);
      eventosDoMes(d0.getFullYear(), d0.getMonth() + 1).forEach(e => {
        const dt = new Date(d0.getFullYear(), d0.getMonth(), e.dia);
        const dias = Math.round((dt - base) / 86400000);
        if (dias >= 0 && dias <= 30 && e.estado !== 'ok') out.push({ ...e, dt, dias });
      });
    }
    return out.sort((a, b) => a.dt - b.dt);
  })();
  const atrasados = eventosDoMes(hoje.getFullYear(), hoje.getMonth() + 1).filter(e => e.estado === 'atrasado');
  const cel = claro ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50';
  const Linha = ({ e, data }) => (
    <div className={`flex ${!data && e.lista ? 'items-start' : 'items-center'} gap-2 p-2 rounded-lg ${claro ? 'bg-slate-50' : 'bg-slate-700/30'}`}>
      {e.chave ? <input type="checkbox" aria-label={`${e.titulo} feito`} className="w-4 h-4 accent-emerald-500 flex-shrink-0" checked={e.estado === 'ok'} onChange={ev => onToggle(e.chave, ev.target.checked)} />
        : <span className="w-4 text-center flex-shrink-0">{e.estado === 'ok' ? '✓' : '•'}</span>}
      {data && <span className="text-xs text-slate-500 w-14 flex-shrink-0">{data}</span>}
      <span className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: CAL_CORES[e.cat] || CAL_CORES.Rotina }} />
      <button onClick={e.ir} disabled={!e.ir} className={`flex-1 min-w-0 text-left text-sm ${e.estado === 'ok' ? 'line-through text-slate-500' : ''} ${e.ir ? 'hover:underline' : ''}`}>
        {e.titulo}{e.nota && <span className="block text-xs text-slate-500 no-underline">{e.nota}</span>}
        {!data && Array.isArray(e.lista) && e.lista.length > 0 && (
          <span className="block mt-1.5 space-y-1">
            {e.lista.map((x, i) => <span key={i} className={`flex gap-1.5 text-xs ${claro ? 'text-slate-600' : 'text-slate-400'}`}><span className="flex-shrink-0">{i + 1}.</span><span>{x}</span></span>)}
          </span>
        )}
      </button>
      {e.valor > 0 && <span className="text-sm font-semibold whitespace-nowrap">{fmt(e.valor)}</span>}
      {e.estado === 'atrasado' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex-shrink-0">atrasado</span>}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold"><Ico e="🗓"/>Calendário</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => mudar(-1)} aria-label="Mês anterior" className={`px-2.5 py-1.5 rounded-lg ${claro ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-700/50 hover:bg-slate-600'}`}>‹</button>
          <span className="font-medium w-36 text-center">{meses[m - 1]} {y}</span>
          <button onClick={() => mudar(1)} aria-label="Mês seguinte" className={`px-2.5 py-1.5 rounded-lg ${claro ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-700/50 hover:bg-slate-600'}`}>›</button>
          {!ehMesHoje && <button onClick={irHoje} className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400">Hoje</button>}
          {notif && notif.suportado && (
            <button onClick={notif.alternar} title={notif.on ? 'Desligar as notificações neste computador' : 'Receber avisos no computador no dia e na véspera de cada evento'}
              className={`px-2.5 py-1.5 text-xs rounded-lg ${notif.on ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400' : claro ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-700/50 hover:bg-slate-600 text-slate-300'}`}>
              {notif.on ? '🔔 Notificações ligadas' : '🔕 Ativar notificações'}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {[['SS', 'Segurança Social'], ['IVA', 'IVA'], ['IRS', 'IRS'], ['Casa', 'Casa'], ...(evs.some(e => e.cat === 'Venda') ? [['Venda', 'Venda da casa']] : []), ...(evs.some(e => e.cat === 'Trabalho') ? [['Trabalho', 'Entregas']] : []), ['Transf', 'Transferências'], ['Invest', 'Investir'], ['Contab', 'Contabilista'], ['Rotina', 'Rotina do mês']].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAL_CORES[k] }} />{l}</span>
        ))}
      </div>
      <div className="grid xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3">
          <div className="grid grid-cols-7 gap-1.5 text-xs text-slate-500 text-center mb-1">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: offset }).map((_, i) => <div key={'v' + i} />)}
            {Array.from({ length: nDias }).map((_, i) => {
              const d = i + 1, lst = porDia[d] || [];
              const eHoje = ehMesHoje && d === hoje.getDate();
              const sel = d === diaSel;
              return (
                <button key={d} onClick={() => setDia(d)} aria-label={`${d} de ${meses[m - 1]}, ${lst.length} eventos`}
                  className={`min-h-[64px] sm:min-h-[110px] lg:min-h-[130px] p-1 sm:p-2 rounded-xl border text-left align-top flex flex-col gap-1 ${cel} ${sel ? 'ring-2 ring-blue-500' : ''} ${eHoje ? 'border-emerald-500' : ''}`}>
                  <span className={`text-xs sm:text-sm ${eHoje ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>{d}</span>
                  <span className="hidden sm:flex flex-col gap-1 w-full">
                    {lst.slice(0, 4).map(e => (
                      <span key={e.id} className={`truncate text-[11px] leading-snug px-1.5 py-0.5 rounded-md text-white ${estadoCls(e)}`} style={{ background: CAL_CORES[e.cat] || CAL_CORES.Rotina }}>{e.curto || e.titulo}</span>
                    ))}
                    {lst.length > 4 && <span className="text-[11px] text-slate-500">+{lst.length - 4}</span>}
                  </span>
                  <span className="flex sm:hidden flex-wrap gap-0.5">
                    {lst.map(e => <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: CAL_CORES[e.cat] || CAL_CORES.Rotina, opacity: e.estado === 'ok' ? 0.35 : 1 }} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-1.5">
            <p className="text-sm font-medium">{diaSel ? `${diaSel} de ${meses[m - 1]}` : 'Sem nada marcado neste mês'}</p>
            {diaSel && !(porDia[diaSel] || []).length && <p className="text-xs text-slate-500">Nada marcado neste dia.</p>}
            {(porDia[diaSel] || []).map(e => <React.Fragment key={e.id}>{Linha({ e: e })}</React.Fragment>)}
          </div>
        </div>
        <div className="space-y-3">
          {atrasados.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-400 mb-1.5">Em atraso este mês</p>
              <div className="space-y-1.5">{atrasados.map(e => <React.Fragment key={'a' + e.id}>{Linha({ e: e, data: `${e.dia} ${meses[hoje.getMonth()].slice(0, 3)}` })}</React.Fragment>)}</div>
            </div>
          )}
          <div>
            <p className="text-sm font-medium mb-1.5">Próximos 30 dias</p>
            {!proximos.length && <p className="text-xs text-slate-500">Nada pendente.</p>}
            <div className="space-y-1.5">
              {proximos.map(e => <React.Fragment key={'p' + e.dt.getMonth() + e.id}>{Linha({ e: e, data: e.dias === 0 ? 'Hoje' : e.dias === 1 ? 'Amanhã' : `${e.dt.getDate()} ${meses[e.dt.getMonth()].slice(0, 3)}` })}</React.Fragment>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══ PREVISÃO DE IMPOSTOS ════════════════════════════════════════════════════
// SS: o pagamento feito no mês P é a contribuição do mês P−1, calculada na declaração trimestral
//     do trimestre desse mês, que declara o trimestre anterior. Pago em Outubro → base Abr+Mai+Jun.
// Os pagamentos registados servem para afinar: o mesmo trimestre declarado paga sempre o mesmo valor,
// e a diferença entre a fórmula e o que pagaste nos últimos 12 meses ajusta as previsões (SS e IVA).
const impCalc = (G, M, hoje = new Date()) => {
  G = G || {}; M = M || {};
  const ano = hoje.getFullYear(), mesAt = hoje.getMonth() + 1, idxHoje = ano * 12 + mesAt - 1;
  const nomeMes = i => meses[((i % 12) + 12) % 12];
  const curto = i => nomeMes(i).substring(0, 3);
  const mesD = i => M[`${Math.floor(i / 12)}-${(i % 12) + 1}`] || {};
  const rv = r => impNum(r && r.valIliq != null && r.valIliq !== '' ? r.valIliq : r && r.val);
  const naoTrab = new Set((G.clientes || []).filter(c => /reembolso/i.test(String(c.nome || ''))).map(c => c.id));
  // Clientes estrangeiros ("Sem taxas") contam igual para a SS e o IRS — só não têm retenção nem IVA
  const declSS = i => [...(mesD(i).regCom || []), ...(mesD(i).regSem || [])].filter(r => !r.emitidoPorSara && !naoTrab.has(r.cid)).reduce((a, r) => a + rv(r), 0);
  const ivaMes = i => (mesD(i).regCom || []).reduce((a, r) => a + impNum(r.iva), 0);
  const pagos = (G.impostosPagos || []).map(p => {
    const d = String((p && p.data) || ''); const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
    return y && m ? { ...p, idx: y * 12 + m - 1, v: impNum(p.valor) } : null;
  }).filter(Boolean);
  const somaMes = (tipo, i) => pagos.filter(p => p.tipo === tipo && p.idx === i && p.v > 0).reduce((a, p) => a + p.v, 0);

  // ── Segurança Social ──
  const ssBase = p => { const c = p - 1; return c - ((c % 12) % 3) - 3; }; // 1.º mês do trimestre declarado
  const ssForm = q0 => { const rec = declSS(q0) + declSS(q0 + 1) + declSS(q0 + 2); return { rec, val: Math.max(20, rec * 0.70 / 3 * 0.214) }; };
  const mesesSSPagos = [...new Set(pagos.filter(p => p.tipo === 'SS' && p.v > 0).map(p => p.idx))].sort((a, b) => a - b);
  // Afinação: compara a fórmula com o que pagaste na declaração mais recente que tenha receitas na app
  const comDados = mesesSSPagos.filter(i => i > idxHoje - 13 && i <= idxHoje && ssForm(ssBase(i)).rec > 0);
  const baseRecente = comDados.length ? ssBase(comDados[comDados.length - 1]) : null;
  const paresSS = comDados.filter(i => ssBase(i) === baseRecente).map(i => ({ real: somaMes('SS', i), f: ssForm(baseRecente) }));
  const fatorSS = paresSS.length ? paresSS.reduce((a, x) => a + x.real, 0) / paresSS.reduce((a, x) => a + x.f.val, 0) : 1;
  const ssPara = p => {
    const base = ssBase(p), f = ssForm(base);
    const info = { mes: p, base, rec: f.rec, formula: f.val, nomeBase: [0, 1, 2].map(k => curto(base + k)).join('+'), anoBase: Math.floor(base / 12) };
    const pago = somaMes('SS', p);
    if (pago > 0) return { ...info, valor: pago, pago: true };
    const irmao = mesesSSPagos.filter(i => ssBase(i) === base).pop();
    if (irmao != null) return { ...info, valor: somaMes('SS', irmao), igualA: irmao };
    return { ...info, valor: f.val * fatorSS, ajustado: paresSS.length > 0 };
  };
  const ssEste = ssPara(idxHoje), ssProx = ssPara(idxHoje + 1);
  let pD = idxHoje + 2; while (ssBase(pD) === ssProx.base && pD < idxHoje + 5) pD++;
  const ssDepois = { ...ssPara(pD), incompleto: ssBase(pD) + 2 >= idxHoje };
  let ssAnual = 0; for (let i = ano * 12; i < ano * 12 + 12; i++) ssAnual += ssPara(i).valor;

  // ── IVA ──
  const qDe = i => ({ ano: Math.floor(i / 12), t: Math.floor((i % 12) / 3) + 1, ini: i - (i % 12) % 3 });
  const ivaForm = q0 => ivaMes(q0) + ivaMes(q0 + 1) + ivaMes(q0 + 2);
  const ivaPagoQ = q0 => pagos.filter(p => p.tipo === 'IVA' && p.v > 0 && qDe(p.idx - 3).ini === q0).reduce((a, p) => a + p.v, 0);
  const qsIva = [...new Set(pagos.filter(p => p.tipo === 'IVA' && p.v > 0 && p.idx > idxHoje - 16).map(p => qDe(p.idx - 3).ini))];
  const paresIVA = qsIva.map(q0 => ({ real: ivaPagoQ(q0), f: ivaForm(q0) })).filter(x => x.f > 0);
  const fatorIVA = paresIVA.length ? paresIVA.reduce((a, x) => a + x.real, 0) / paresIVA.reduce((a, x) => a + x.f, 0) : 1;
  const qAtual = qDe(idxHoje), qAnt = qDe(qAtual.ini - 3);
  const ivaQ = q0 => { const pago = ivaPagoQ(q0), f = ivaForm(q0); return pago > 0 ? { valor: pago, pago: true, formula: f } : { valor: f * fatorIVA, formula: f }; };
  const ivaAnt = ivaQ(qAnt.ini), ivaAt = ivaQ(qAtual.ini);
  let ivaAnual = 0; for (let q0 = ano * 12; q0 < ano * 12 + 12; q0 += 3) ivaAnual += q0 <= idxHoje ? ivaQ(q0).valor : 0;
  const mesPagIva = qAnt.ini + 4; // 2.º mês depois do fim do trimestre
  const dataLimiteIva = new Date(Math.floor(mesPagIva / 12), mesPagIva % 12, 25);
  const diasParaIva = Math.ceil((dataLimiteIva - hoje) / 86400000);

  // ── IRS (ano corrente, entregue no ano seguinte) ──
  const cfg = { ...IRS_CFG_PADRAO, ...(G.irsConfig || {}) };
  const coef = impNum(G.coefSimpl) > 0 ? impNum(G.coefSimpl) : IRS_CFG_PADRAO.coef;
  // Clientes que não são trabalho (ex.: "Reembolso IRS") ficam fora das contas dos impostos
  const naoTrabalho = new Set((G.clientes || []).filter(c => /reembolso/i.test(String(c.nome || ''))).map(c => c.id));
  let recAte = 0, retAte = 0, ultimo = 0, totalPT = 0, totalUE = 0, totalForaUE = 0, totalSaraIliq = 0, totalSaraRetIRS = 0, totalIVA = 0;
  for (let m = 1; m <= 12; m++) {
    const d = M[`${ano}-${m}`] || {};
    // Todos os recibos entram no IRS: os de clientes estrangeiros ("Sem taxas") contam igual, só não têm retenção
    const regs = [...(d.regCom || []), ...(d.regSem || [])].filter(x => !naoTrabalho.has(x.cid));
    const r = regs.reduce((a, x) => a + rv(x), 0);
    if (r > 0) ultimo = m;
    recAte += r;
    regs.forEach(x => {
      retAte += impNum(x.retIRS); totalIVA += impNum(x.iva);
      if (x.emitidoPorSara) { totalSaraIliq += rv(x); totalSaraRetIRS += impNum(x.retIRS); }
    });
    regs.forEach(x => { const pais = x.pais || 'PT'; if (pais === 'PT') totalPT += rv(x); else if (pais === 'UE') totalUE += rv(x); else totalForaUE += rv(x); });
  }
  const fechados = Math.min(12, Math.max(mesAt - 1, ultimo));
  const restantes = 12 - fechados;
  const projeta = v => fechados >= 2 ? v + v / fechados * restantes : v;
  const recAnual = projeta(recAte);
  const retCatB = projeta(retAte);
  const saraBruto = cfg.conjunto ? impNum(cfg.saraBruto) : 0;
  const rendA = Math.max(0, saraBruto - Math.max(DEDUCAO_CATA, saraBruto * 0.11));
  const rendColetavel = recAnual * coef + rendA;
  const q = cfg.conjunto ? 2 : 1;
  const coleta = impIRSEscaloes(rendColetavel / q) * q;
  const irsEstimado = Math.max(0, coleta - impNum(cfg.deducoes));
  const porConta = pagos.filter(p => p.tipo === 'IRS' && p.v > 0 && Math.floor(p.idx / 12) === ano && [6, 8, 11].includes(p.idx % 12)).reduce((a, p) => a + p.v, 0);
  const irsRetencoes = retCatB + (cfg.conjunto ? impNum(cfg.saraRetencao) : 0) + porConta;
  const irsAPagarReceber = irsRetencoes - irsEstimado;
  // Quanto custam, em impostos, os teus próprios recibos (sem os da Sara): o IRS a mais que causam
  // na declaração conjunta + a Segurança Social (70% × 21,4%). Serve para afinar a % de reserva.
  let proprioAte = 0;
  for (let m = 1; m <= 12; m++) { const dm = M[`${ano}-${m}`] || {}; [...(dm.regCom || []), ...(dm.regSem || [])].forEach(x => { if (!x.emitidoPorSara && !naoTrabalho.has(x.cid)) proprioAte += rv(x); }); }
  const proprioAnual = projeta(proprioAte);
  const semProprios = Math.max(0, (recAnual - proprioAnual) * coef + rendA);
  const irsSemProprios = Math.max(0, impIRSEscaloes(semProprios / q) * q - impNum(cfg.deducoes));
  const irsDosProprios = Math.max(0, irsEstimado - irsSemProprios);
  const taxaReservaSugerida = proprioAnual > 0 && !(cfg.conjunto && !saraBruto)
    ? { irs: irsDosProprios / proprioAnual * 100, ss: 0.70 * 21.4, total: irsDosProprios / proprioAnual * 100 + 0.70 * 21.4 } : null;

  const totalImpostos = ssAnual + ivaAnual + irsEstimado;
  return {
    // SS
    ssPara, ivaPag: i => { const q = qDe(i - 3); return { ...ivaQ(q.ini), t: q.t, ano: q.ano }; },
    ssEste, ssProx, ssDepois, ssMesAtual: ssEste.valor, ssProximoMes: ssProx.valor, ssMensal: ssProx.valor, ssAnual, fatorSS, paresSS: paresSS.length,
    receitasTrimestreDeclarado: ssEste.rec, nomeMesesDeclarados: ssEste.nomeBase, anoMesesDeclarados: ssEste.anoBase,
    rendimentoRelevanteSS: ssProx.rec * 0.70,
    // IVA
    ivaAPagar: ivaAnual, ivaTrimestreAnterior: ivaAnt.valor, ivaAntPago: !!ivaAnt.pago, ivaTrimestreAtual: ivaAt.valor, fatorIVA, paresIVA: paresIVA.length,
    trimestreAtual: qAtual.t, anoTrimestreAtual: qAtual.ano, trimestreAnterior: qAnt.t, anoTrimestreAnterior: qAnt.ano,
    proximoTrimestre: qAtual.t < 4 ? qAtual.t + 1 : 1, mesPagarIvaAtual: curto(qAtual.ini + 4), dataLimiteIva, diasParaIva, totalIVA,
    // IRS
    irsCfg: { ...cfg, coef }, recAnualIRS: recAnual, rendColetavel, irsEstimado, irsRetencoes, porConta, irsAPagarReceber,
    irsTaxaEfetiva: recAnual > 0 ? irsEstimado / recAnual * 100 : 0, mesesComDados: fechados, faltaSara: cfg.conjunto && !saraBruto, taxaReservaSugerida,
    // totais
    totalIliquido: recAte, totalPT, totalUE, totalForaUE, totalSaraIliq, totalSaraRetIRS, totalImpostos,
    calibracao: { ativa: paresSS.length > 0 || paresIVA.length > 0, SS: paresSS.length ? { fator: fatorSS } : null, IVA: paresIVA.length ? { fator: fatorIVA } : null, IRS: null }
  };
};
const anos = [2023,2024,2025,2026,2027,2028,2029,2030,2031,2032,2033,2034,2035,2036,2037,2038,2039,2040,2041,2042,2043,2044,2045,2046,2047,2048,2049,2050];

// Formatadores criados uma só vez (evita instanciar Intl.NumberFormat a cada chamada)
// Valores em euros sempre com espaço nos milhares (o pt-PT do browser não separa 4 dígitos:
// dava "9000,00 €" ao lado de "65 023,50 €") e sem ",00" quando não há cêntimos.
const _fmtEUR = {
  format: v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0\u00a0€';
    const centimos = Math.round(Math.abs(n) * 100);
    const inteiro = String(Math.floor(centimos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    const c = centimos % 100;
    return (n < 0 && centimos > 0 ? '-' : '') + inteiro + (c ? ',' + String(c).padStart(2, '0') : '') + '\u00a0€';
  }
};

// ── Mapeamento das despesas para as categorias da app Bilance ──
// Primeiro tenta pela descrição (mais preciso), depois pela categoria interna.
// Para afinar, basta acrescentar entradas em BILANCE_POR_DESC.
const _semAcentos = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const BILANCE_POR_DESC = [
  // Casa
  [['prestacao casa', 'prestacao', 'hipoteca', 'renda casa', 'renda'], 'Casa > Renda, hipoteca'],
  [['condominio', 'condominio obras'], 'Casa > Condomínio'],
  [['obras', 'remodelacao'], 'Casa > Construção, remodelação'],
  [['agua', 'luz', 'energia', 'eletricidade', 'gas'], 'Casa > Energia, contas de consumo'],
  [['seguro propriedade', 'seguro habitacao', 'seguro casa'], 'Casa > Seguro habitação'],
  [['moveis', 'decoracao', 'sofa', 'cortinados'], 'Casa > Móveis, decoração'],
  [['empregada', 'limpeza'], 'Casa > Limpeza, produtos de limpeza'],
  [['jardim', 'plantas'], 'Casa > Jardim, plantas'],
  [['manutencao casa', 'reparacoes'], 'Casa > Manutenção, reparações'],
  // Comida e bebida
  [['mercado', 'supermercado', 'compras casa'], 'Comida e Bebida > Supermercado'],
  [['bar', 'cafe', 'lanche', 'padaria'], 'Comida e Bebida > Café, Lanches'],
  [['restaurante', 'entregas', 'takeaway', 'uber eats', 'glovo'], 'Comida e Bebida > Restaurantes, Entregas'],
  [['suplementos', 'suplementacao', 'proteina'], 'Comida e Bebida > Suplementação'],
  // Vida e lazer
  [['internet', 'telemovel', 'telefone', 'mobile', 'meo', 'nos', 'vodafone'], 'Vida e Lazer > Telefone'],
  [['netflix', 'spotify', 'streaming', 'disney', 'hbo'], 'Vida e Lazer > TV, filmes, música, streaming'],
  [['software', 'adobe', 'subscricao', 'cloud', 'dropbox'], 'Vida e Lazer > Serviços digitais, software'],
  [['ferias', 'viagem', 'viagens', 'hotel'], 'Vida e Lazer > Férias, viagens'],
  [['hobbies', 'hobby'], 'Vida e Lazer > Hobbies'],
  // Crianças
  [['escola', 'creche', 'colegio', 'infantario'], 'Crianças > Educação, escola'],
  [['seguro filhos'], 'Crianças > Saúde'],
  [['investimentos filhos', 'poupanca filhos'], 'Investimentos > Poupança'],
  [['babysitter', 'ama'], 'Crianças > Babysitter/Ama'],
  [['semanada', 'mesada'], 'Crianças > Semanada'],
  // Saúde e educação
  [['ginastica'], 'Crianças > Hobbies, atividades'],
  [['ginasio', 'crossfit', 'fitness', 'desporto'], 'Saúde e Educação > Fitness, desporto'],
  [['medico', 'dentista', 'consulta', 'farmacia', 'fisioterapia'], 'Saúde e Educação > Cuidados de saúde, médico'],
  [['cabeleireiro', 'beleza', 'estetica'], 'Saúde e Educação > Bem-estar, beleza'],
  [['formacao', 'curso'], 'Saúde e Educação > Educação, desenvolvimento pessoal'],
  // Financeiras
  [['seguro vida'], 'Despesas Financeiras > Seguros'],
  [['manutencao conta', 'comissao', 'taxa banco'], 'Despesas Financeiras > Encargos, taxas'],
  [['contabilista', 'contabilidade', 'consultoria'], 'Despesas Financeiras > Consultoria'],
  [['emprestimo', 'juros', 'credito'], 'Despesas Financeiras > Empréstimo, juros'],
  [['impostos', 'irs', 'iva', 'seguranca social'], 'Despesas Financeiras > Impostos'],
  [['multa', 'coima'], 'Despesas Financeiras > Multas'],
  // Transporte
  [['combustivel', 'gasolina', 'gasoleo'], 'Transporte > Combustível'],
  [['seguro auto', 'seguro carro', 'seguro automovel'], 'Transporte > Seguro de automóvel'],
  [['portagens', 'via verde'], 'Transporte > Portagens'],
  [['estacionamento', 'parque'], 'Transporte > Estacionamento'],
  [['passe', 'transporte publico', 'metro', 'comboio'], 'Transporte > Transporte público'],
  // Animais
  [['veterinario'], 'Animais de estimação > Veterinário, medicamentos'],
  [['racao'], 'Animais de estimação > Alimentação']
];

// Taxonomia completa do Bilance — usada quando uma despesa cobre um grupo inteiro
// (ex: um orçamento "Carro" abrange combustível, portagens, seguro, manutenção...).
const BILANCE_GRUPOS = {
  'Comida e Bebida': ['Supermercado', 'Restaurantes, Entregas', 'Café, Lanches', 'Álcool, Tabaco', 'Suplementação'],
  'Compras': ['Roupa, acessórios', 'Produtos de beleza', 'Eletrónicos', 'Presentes'],
  'Casa': ['Renda, hipoteca', 'Energia, contas de consumo', 'Manutenção, reparações', 'Seguro habitação', 'Móveis, decoração', 'Jardim, plantas', 'Segurança', 'Limpeza, produtos de limpeza', 'Construção, remodelação', 'Condomínio'],
  'Transporte': ['Transporte público', 'Táxi', 'Longa distância', 'Combustível', 'Estacionamento', 'Veículo, manutenção', 'Alugueres', 'Seguro de automóvel', 'Leasing', 'Carregamentos elétricos', 'Portagens'],
  'Vida e Lazer': ['Telefone', 'Lotaria e jogos de azar', 'Hobbies', 'TV, filmes, música, streaming', 'Férias, viagens', 'Doações', 'Cultura, eventos', 'Serviços digitais, software', 'Livros, audiolivros, notícias', 'Presentes', 'Festas'],
  'Despesas Financeiras': ['Impostos', 'Seguros', 'Empréstimo, juros', 'Multas', 'Consultoria', 'Encargos, taxas', 'Negócios'],
  'Investimentos': ['Imóveis', 'Investimentos financeiros', 'Poupança', 'Reforma'],
  'Saúde e Educação': ['Cuidados de saúde, médico', 'Bem-estar, beleza', 'Fitness, desporto', 'Educação, desenvolvimento pessoal'],
  'Crianças': ['Semanada', 'Educação, escola', 'Pensão de alimentos', 'Hobbies, atividades', 'Saúde', 'Roupa', 'Brinquedos, eletrónicos', 'Presentes', 'Babysitter/Ama'],
  'Animais de estimação': ['Alimentação', 'Veterinário, medicamentos', 'Brinquedos, acessórios', 'Serviços', 'Creche, hotel'],
  'Outras / Especiais': ['Outros', 'Indefinido', 'Transferências internas', 'Excluído']
};

// Descrições abrangentes que devem cobrir um GRUPO inteiro em vez de uma só
// subcategoria. Verificadas DEPOIS das específicas (ex: "seguro carro" continua
// a ir só para "Seguro de automóvel").
const BILANCE_GRUPO_POR_DESC = [
  [['carro', 'automovel', 'viatura', 'transportes', 'transporte'], 'Transporte'],
  [['filhos', 'criancas', 'criancas'], 'Crianças'],
  [['animais', 'cao', 'gato', 'pet'], 'Animais de estimação'],
  [['lazer', 'entretenimento', 'diversao'], 'Vida e Lazer'],
  [['alimentacao', 'comida', 'alimentar'], 'Comida e Bebida'],
  [['compras', 'vestuario', 'roupa'], 'Compras'],
  [['saude', 'educacao'], 'Saúde e Educação']
];

// Fallback por categoria interna da app (cobre nomes antigos e atuais)
const BILANCE_POR_CATEGORIA = {
  'Habitação': 'Casa > Renda, hipoteca',
  'Energia, Luz & Agua': 'Casa > Energia, contas de consumo',
  'Utilidades': 'Casa > Energia, contas de consumo',
  'Mercado': 'Comida e Bebida > Supermercado',
  'Alimentação': 'Comida e Bebida > Supermercado',
  'Restauração': 'Comida e Bebida > Restaurantes, Entregas',
  'Transporte': 'Transporte > Veículo, manutenção',
  'Saúde': 'Saúde e Educação > Cuidados de saúde, médico',
  'Educação': 'Saúde e Educação > Educação, desenvolvimento pessoal',
  'Vestuário': 'Compras > Roupa, acessórios',
  'Lazer': 'Vida e Lazer > Hobbies',
  'Vida & Entretenimento': 'Vida e Lazer > Hobbies',
  'Subscrições': 'Vida e Lazer > Serviços digitais, software',
  'Serviços': 'Vida e Lazer > Serviços digitais, software',
  'Impostos': 'Despesas Financeiras > Impostos',
  'Investimentos': 'Investimentos > Investimentos financeiros',
  'Outros': 'Outras / Especiais > Outros'
};

const _grupoCompleto = grupo =>
  `${grupo} — todas as subcategorias deste grupo: ${(BILANCE_GRUPOS[grupo] || []).join(', ')}`;

// Correspondência por palavra inteira. Sem isto, "cao" casava dentro de
// "alimentacao" e mandava a despesa para o grupo errado.
const _contemPalavra = (texto, chave) => {
  const k = chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + k + '([^a-z0-9]|$)').test(texto);
};

const mapearCategoriaBilance = (desc, cat) => {
  const d = _semAcentos(desc);
  if (d) {
    // 1. Correspondência específica: subcategoria exata
    for (const [chaves, destino] of BILANCE_POR_DESC) {
      if (chaves.some(k => _contemPalavra(d, k))) return destino;
    }
    // 2. Descrição abrangente: grupo inteiro
    for (const [chaves, grupo] of BILANCE_GRUPO_POR_DESC) {
      if (chaves.some(k => _contemPalavra(d, k))) return _grupoCompleto(grupo);
    }
  }
  return BILANCE_POR_CATEGORIA[cat] || 'Outras / Especiais > Outros';
};

// Estimativa de impostos de um recibo isolado, à margem (regime simplificado).
// coef: coeficiente do simplificado (0,35 outras prestações / 0,75 art. 151.º)
// taxaMarg: taxa marginal de IRS em % · comSS: se conta para a Segurança Social
const estimarImpostosRecibo = ({ valIliq = 0, retIRS = 0, coef = 0.75, taxaMarg = 43.1, comSS = false }) => {
  const bruto = parseFloat(valIliq) || 0;
  const jaRetido = parseFloat(retIRS) || 0;
  const baseIrs = bruto * coef;
  const irsTotal = baseIrs * (taxaMarg / 100);
  const irsPorPagar = Math.max(0, irsTotal - jaRetido);
  const ss = comSS ? bruto * 0.70 * 0.214 : 0;
  const liquido = bruto - irsPorPagar - ss;
  return { bruto, baseIrs, irsTotal, irsPorPagar, ss, liquido };
};

// Endereços da Firebase Function de OCR de faturas. O primeiro é o URL directo
// do Cloud Run (funções de 2ª geração), que é o que o deploy reporta; o segundo
// é o alias clássico, usado como recurso se o primeiro falhar na rede.
// Nome que vem num recibo/extrato → cliente da app. Cada cliente pode ter "aliases":
// os nomes das empresas que aparecem nos documentos (ex.: cliente "Sophie" ↔ "Everboost Lda").
const _normNome = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[.,;:()"'’&/\\-]/g, ' ')
  .replace(/\b(lda|limitada|unipessoal|sa|s a|ltd|limited|inc|llc|gmbh|bv|oy|ab|sl|sas|srl|plc|corp|corporation|company|co)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
const clienteDoNome = (clientes, nome) => {
  const alvo = _normNome(nome);
  if (!alvo) return null;
  const nomesDe = c => [c.nome, ...(Array.isArray(c.aliases) ? c.aliases : [])].map(_normNome).filter(x => x.length >= 3);
  const lista = clientes || [];
  return lista.find(c => nomesDe(c).some(x => x === alvo))
    || lista.find(c => nomesDe(c).some(x => alvo.includes(x) || x.includes(alvo)))
    || null;
};

const PROCESS_INVOICE_URLS = [
  'https://processinvoice-lwlsrb4r2q-uc.a.run.app',
  'https://us-central1-dashboard-financas-f2b55.cloudfunctions.net/processInvoice'
];

// Se um separador der erro, mostra um aviso só nesse separador (em vez de a app
// inteira ficar em branco). Volta ao normal ao mudar de separador.
class ProtecaoErro extends React.Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error('Erro num separador:', erro, info?.componentStack); }
  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    const claro = this.props.theme === 'light';
    const btn = `px-4 py-2 rounded-xl text-sm font-medium ${claro ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-700 hover:bg-slate-600 text-white'}`;
    return (
      <div role="alert" className={`max-w-xl mx-auto my-10 rounded-2xl border p-6 text-center ${claro ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-800/60 border-slate-700 text-slate-300'}`}>
        <p className="text-lg font-semibold mb-1">Algo correu mal neste separador</p>
        <p className="text-sm opacity-80 mb-5">Os teus dados estão guardados. Podes tentar outra vez, ir para o Resumo ou recarregar a página.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white" onClick={() => this.setState({ erro: null })}>Tentar outra vez</button>
          {!this.props.inicio && <button className={btn} onClick={() => { this.setState({ erro: null }); this.props.onInicio?.(); }}>Ir para o Resumo</button>}
          <button className={btn} onClick={() => window.location.reload()}>Recarregar a página</button>
        </div>
        <details className="mt-5 text-left text-xs opacity-70">
          <summary className="cursor-pointer">Detalhes do erro (para enviar ao Claude)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{String(erro?.message || erro)}</pre>
        </details>
      </div>
    );
  }
}

// ── Estimativa do que já entregaste (e podes faturar) a partir das tarefas do Trabalho ──
// Lê nomes como "1x New Video - Título + 2x Variations" e conta cada tipo de peça.
const CU_TIPOS = [
  { id: 'video', nome: 'Vídeo novo', plural: 'vídeos novos' },
  { id: 'variacao', nome: 'Variação de vídeo', curto: 'Variação', plural: 'variações' },
  { id: 'iteracao', nome: 'Iteração', plural: 'iterações' },
  { id: 'ai_clip', nome: 'Clip de IA (AI footage)', curto: 'Clip de IA', plural: 'clips de IA' },
  { id: 'banner', nome: 'Banner novo', curto: 'Banner', plural: 'banners' },
  { id: 'banner_var', nome: 'Variação de banner', plural: 'variações de banner' },
  { id: 'hook', nome: 'Hook', plural: 'hooks' },
  { id: 'aso', nome: 'Vídeo ASO', plural: 'vídeos ASO' },
  { id: 'icone', nome: 'Ícones', plural: 'ícones' },
  { id: 'feature', nome: 'Feature graphic', plural: 'feature graphics' },
  { id: 'screenshots', nome: 'Screenshots', plural: 'screenshots' },
  { id: 'video3d', nome: 'Vídeo 3D (valor à parte)', curto: 'Vídeo 3D', plural: 'vídeos 3D' },
  { id: 'extra', nome: 'Extra / ideação', plural: 'extras', porHora: true },
  { id: 'outro', nome: 'Outra tarefa', plural: 'outras', porHora: true },
];
// Campos de preço (os "extras" e as tarefas sem tipo usam o preço à hora × horas registadas no Trabalho)
const CU_CAMPOS_PRECO = [...CU_TIPOS.filter(t => !t.porHora),
  { id: 'hora', nome: 'Preço à hora (extras e outras tarefas)' },
  { id: 'dia', nome: 'Diária (cada dia com horas = 1 dia)' },
  { id: 'retainer', nome: 'Mínimo mensal garantido (retainer)' }];
const CU_PRECOS_PADRAO = { video: 420, variacao: 150, iteracao: 80, banner: 120 };
// Tabelas de preços de cada cliente (pelo nome do cliente na app). Podes mudar tudo em "preços →".
const CU_PRECOS_CLIENTES = {
  marius: { hora: 70, video: 450, variacao: 150, banner: 200, banner_var: 100, icone: 850, feature: 450, screenshots: 1000, ai_clip: 180 },
  sophie: { hora: 40, video: 420, variacao: 150, iteracao: 80, banner: 120, retainer: 4000 },
  hendrik: { hora: 34.375, dia: 275 },
};
const cuPresetCliente = (clientes, cid) => {
  const c = (clientes || []).find(x => String(x.id) === String(cid));
  if (!c) return {};
  const n = _normNome(c.nome);
  const k = Object.keys(CU_PRECOS_CLIENTES).find(x => n === x || n.startsWith(x + ' ') || n.includes(x));
  return k ? CU_PRECOS_CLIENTES[k] : {};
};
const cuTipoDe = t => {
  const x = String(t || '').toLowerCase();
  if (/iterat/.test(x)) return 'iteracao';
  if (/banner/.test(x) && /variat/.test(x)) return 'banner_var';
  if (/variat/.test(x)) return 'variacao';
  if (/banner/.test(x)) return 'banner';
  if (/hook/.test(x)) return 'hook';
  if (/\baso\b/.test(x)) return 'aso';
  if (/icon/.test(x)) return 'icone';
  if (/feature/.test(x)) return 'feature';
  if (/screenshot/.test(x)) return 'screenshots';
  if (/\b3d\b/.test(x)) return 'video3d';
  if (/\bai\b.*(video|vídeo|clip|footage)|footage/.test(x)) return 'ai_clip';
  if (/video|vídeo|\bad\b|clip/.test(x)) return 'video';
  if (/extra|idea|ideation|idei|brief|meeting|reuni|research/.test(x)) return 'extra';
  return 'outro';
};
// "1x New Video - Hawk vs Sable + 1x Iteration" → [{tipo:'video',n:1},{tipo:'iteracao',n:1}]
const cuPecas = nome => {
  const s = String(nome || '');
  const partes = s.split(/\s\+\s|\s\+(?=\s*\d+\s*x)/i);
  const out = [];
  partes.forEach(p => {
    const m = /^\s*(\d+)\s*x\s*(.*)$/i.exec(p);
    if (!m) return;
    const tipoTxt = m[2].split(/\s[-–—]\s/)[0];
    out.push({ tipo: cuTipoDe(tipoTxt), n: Math.max(1, parseInt(m[1], 10) || 1) });
  });
  if (!out.length) out.push({ tipo: cuTipoDe(s), n: 1 });
  return out;
};
// A que cliente da app pertence uma tarefa antiga do ClickUp (já só serve para dados antigos)
const cuClienteDe = (cu, sid, fid, clientes, nomeEsp) => {
  const mapa = (cu && cu.mapa) || {}, dividir = (cu && cu.dividir) || {};
  let cid = dividir[sid] ? mapa[`${sid}/${fid}`] : undefined;
  if (cid === undefined || cid === null || cid === '') cid = mapa[sid];
  if (cid === undefined || cid === null || cid === '') { const c = clienteDoNome(clientes, nomeEsp); cid = c ? c.id : null; }
  return cid === 'x' ? 'x' : cid;
};
const cuEntregasMes = (cu, ano, mesNum, clientes, trab = null) => {
  const pref = `${ano}-${String(mesNum).padStart(2, '0')}-`;
  const nomes = {}; ((cu && cu.espacos) || []).forEach(e => { nomes[e.id] = e.nome; });
  const precos = (cu && cu.precos) || {};
  // Preço: o que puseste para esse cliente → a tabela do cliente → o padrão
  const preco = (cid, tipo) => {
    const pc = (precos.porCliente || {})[cid] || {};
    if (pc[tipo] != null && pc[tipo] !== '') return Number(pc[tipo]) || 0;
    const pre = cuPresetCliente(clientes, cid);
    if (pre[tipo] != null) return Number(pre[tipo]) || 0;
    const pp = { ...CU_PRECOS_PADRAO, ...(precos.padrao || {}) };
    return Number(pp[tipo]) || 0;
  };
  const porCli = {};
  let total = 0, totalProduzido = 0, semPreco = 0;
  // Só as tarefas do Trabalho (o ClickUp deixou de ser usado)
  const tarefas = trab ? trabEntreguesMes(trab, ano, mesNum, cu, clientes) : [];
  const novoCli = (cid, sid) => ({ cid, nomeEsp: nomes[sid] || 'Sem cliente', total: 0, contagem: {}, tarefas: [], retainer: cid == null ? 0 : preco(cid, 'retainer'), diaria: cid == null ? 0 : preco(cid, 'dia'), dias: new Set(), diario: Array(32).fill(0) });
  tarefas.forEach(t => {
    const cid = t.app ? (t.cid ?? null) : cuClienteDe(cu, t.espaco, t.pasta, clientes, nomes[t.espaco]);
    if (cid === 'x') return;
    const k = cid == null ? `esp:${t.espaco}` : String(cid);
    const c = (porCli[k] = porCli[k] || novoCli(cid, t.espaco));
    let v = 0;
    let horasExtra = 0;
    const manual = t.valorManual != null && t.valorManual !== '' && Number.isFinite(Number(t.valorManual));
    if (manual) v = Number(t.valorManual);
    (t.pecasArr || cuPecas(t.nome)).forEach(p => {
      if (manual) { c.contagem[p.tipo] = (c.contagem[p.tipo] || 0) + p.n; return; }
      if (p.tipo === 'extra' || p.tipo === 'outro') {
        horasExtra = Number(t.horas) || 0;
        c.horasExtra = (c.horasExtra || 0) + horasExtra;
        // À diária: estas horas contam nos dias (em baixo); senão, horas × preço à hora
        if (!(c.diaria > 0)) { const valor = preco(cid, 'hora') * horasExtra; v += valor; if (!valor) semPreco += 1; }
      } else {
        const pr = preco(cid, p.tipo);
        v += pr * p.n; if (!pr) semPreco += p.n;
      }
      c.contagem[p.tipo] = (c.contagem[p.tipo] || 0) + p.n;
    });
    c.total += v;
    c.diario[Number(String(t.fechada).slice(8, 10)) || 1] += v;
    c.tarefas.push({ ...t, valor: v, horasExtra, nosDias: c.diaria > 0 && horasExtra > 0 && !v });
  });
  // Clientes à diária: cada dia do mês com horas registadas no Trabalho conta como 1 dia (mesmo que sejam 4 ou 6 h)
  if (trab) Object.entries(trabDiasMes(trab, ano, mesNum)).forEach(([cid, dias]) => {
    if (cid === 'undefined' || cid === 'null' || !(preco(cid, 'dia') > 0)) return;
    const c = (porCli[cid] = porCli[cid] || novoCli(isNaN(Number(cid)) ? cid : Number(cid), ''));
    dias.forEach(d => c.dias.add(d));
  });
  Object.values(porCli).forEach(c => {
    if (c.diaria > 0 && c.dias.size) { c.nDias = c.dias.size; c.valorDias = c.nDias * c.diaria; c.total += c.valorDias; c.dias.forEach(d => { c.diario[Number(d) || 1] += c.diaria; }); }
    // Mínimo garantido (retainer): se o produzido no mês ficar abaixo, conta o mínimo
    c.produzido = c.total;
    if (c.retainer > 0 && c.total < c.retainer) { c.total = c.retainer; c.noMinimo = true; }
    total += c.total; totalProduzido += c.produzido;
  });
  // Acumulado dia a dia (índice 0 = dia 1), com e sem o mínimo garantido
  const nDiasMes = new Date(ano, mesNum, 0).getDate();
  const acum = comMin => Array.from({ length: nDiasMes }, (_, i) => Object.values(porCli).reduce((a, c) => {
    let cum = 0; for (let d = 1; d <= i + 1; d++) cum += c.diario[d];
    return a + (comMin && c.retainer > 0 ? Math.max(cum, c.retainer) : cum);
  }, 0));
  const lista = Object.values(porCli).sort((a, b) => b.total - a.total);
  return { total, totalProduzido, semPreco, n: tarefas.length, nReview: tarefas.filter(t => t.emReview).length, clientes: lista, nDiasMes, acumulado: acum(false), acumuladoMin: acum(true), comRetainer: lista.filter(c => c.retainer > 0) };
};

const CU_NOMES_EN = {
  video: ['New Video', 'New Videos'], variacao: ['Variation', 'Variations'], iteracao: ['Iteration', 'Iterations'],
  ai_clip: ['AI Clip', 'AI Clips'], banner: ['New Banner', 'New Banners'], banner_var: ['Banner Variation', 'Banner Variations'],
  hook: ['Hook', 'Hooks'], aso: ['ASO Video', 'ASO Videos'], icone: ['Icon Set', 'Icon Sets'], feature: ['Feature Graphic', 'Feature Graphics'],
  screenshots: ['Screenshot Set', 'Screenshot Sets'], video3d: ['3D Video', '3D Videos'],
};
const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 5040 → "5.040€" ; 34,5 → "34,50€"
const cuEur = v => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${d === '00' ? '' : ',' + d}€`;
};
// "4h30", "4:30", "4,5", "4.5" → 4.5 horas
const cuLerHoras = t => {
  const x = String(t || '').trim().toLowerCase().replace(/\s/g, '');
  if (!x) return 0;
  let m = /^(\d+)(?:h|:)(\d{1,2})?m?$/.exec(x);
  if (m) return (Number(m[1]) || 0) + (Number(m[2]) || 0) / 60;
  m = /^(\d+)m(?:in)?$/.exec(x);
  if (m) return (Number(m[1]) || 0) / 60;
  const n = Number(x.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const cuHorasTxt = h => { const t = Math.round(h * 60); const hh = Math.floor(t / 60), mm = t % 60; return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`; };
const EntregasClickUp = ({ cu: cuIn, trab = null, M = null, ano, mesNum, clientes, theme, inputClass, onIrPrecos }) => {
  const temApp = !!(trab && (trab.tarefas || []).length);
  const cu = cuIn || {};
  // Contar (ou não) o mínimo garantido (retainer) no total e no gráfico
  const [comMin, setComMin] = useState(() => { try { return localStorage.getItem('cu-com-minimo') !== '0'; } catch (e) { return true; } });
  const mudarMin = v => { setComMin(v); try { localStorage.setItem('cu-com-minimo', v ? '1' : '0'); } catch (e) { /* sem armazenamento */ } };
  if (!temApp) return null;
  const claro = theme === 'light';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const f = v => _fmtEUR.format(isFinite(v) ? Math.round(v) : 0);
  const est = cuEntregasMes(cu, ano, mesNum, clientes, trab);
  const custosMes = trabCustosMes(trab, ano, mesNum);
  const mPrev = mesNum === 1 ? 12 : mesNum - 1, aPrev = mesNum === 1 ? ano - 1 : ano;
  const estPrev = temApp ? cuEntregasMes(cu, aPrev, mPrev, clientes, trab) : null;
  const temMin = est.comRetainer.length > 0 || !!(estPrev && estPrev.comRetainer.length);
  const usaMin = comMin || !temMin;
  const nomeCli = c => c.cid == null ? `${c.nomeEsp} (por ligar)` : String(c.cid).startsWith('cu:') ? String(c.cid).slice(3) : ((clientes || []).find(x => String(x.id) === String(c.cid)) || {}).nome || 'Cliente';
  const resumoContagem = (cont, hx) => [...CU_TIPOS.filter(t => cont[t.id] && !t.porHora).map(t => `${cont[t.id]} ${cont[t.id] === 1 ? (t.curto || t.nome).replace(/^./, x => x.toLowerCase()) : t.plural}`), ...(cont.extra || cont.outro ? [`${String(Math.round((hx || 0) * 10) / 10).replace('.', ',')} h à hora`] : [])].join(', ');
  return (
    <div className={`rounded-2xl border p-4 ${claro ? 'bg-white/80 border-slate-200' : 'bg-slate-800/50 border-slate-700/50'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm"><span className={sub}>Entregue em {meses[mesNum - 1]}:</span> <strong className="text-lg text-emerald-400 tabular-nums">≈ {f(usaMin ? est.total : est.totalProduzido)}</strong> <span className={`text-xs ${sub}`}>· {est.n - est.nReview} tarefa{est.n - est.nReview === 1 ? '' : 's'} fechada{est.n - est.nReview === 1 ? '' : 's'}{est.nReview ? ` + ${est.nReview} em review` : ''}</span></p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {estPrev && estPrev.n > 0 && <p className={`text-xs ${sub}`}>{meses[mPrev - 1]}: ≈ {f(usaMin ? estPrev.total : estPrev.totalProduzido)} (a faturar no início de {meses[mesNum - 1].toLowerCase()})</p>}
        </div>
      </div>
      {custosMes.total > 0 && (
        <p className="mt-1 text-xs">
          <span className={sub}>Subcontratações:</span> <span className="text-red-400 tabular-nums" title={custosMes.linhas.map(l => `${l.quem ? l.quem + ' · ' : ''}${l.desc}: ${f(l.v)}`).join('\n')}>−{f(custosMes.total)}</span>
          <span className={sub}> → fica para ti ≈ </span><strong className="tabular-nums">{f((usaMin ? est.total : est.totalProduzido) - custosMes.total)}</strong>
          <span className={sub}> ({custosMes.linhas.map(l => l.quem || l.desc).filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 3).join(', ')})</span>
        </p>
      )}
      {temMin && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <button type="button" role="switch" aria-checked={comMin} onClick={() => mudarMin(!comMin)} className="inline-flex items-center gap-2">
            <span className={`relative inline-block w-8 h-[18px] rounded-full transition-colors ${comMin ? 'bg-emerald-500' : claro ? 'bg-slate-300' : 'bg-slate-600'}`}>
              <span className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform" style={{ transform: comMin ? 'translateX(14px)' : 'none' }} />
            </span>
            <span className={claro ? 'text-slate-700' : 'text-slate-200'}>Contar o mínimo garantido ({est.comRetainer.map(c => `${nomeCli(c)} ${f(c.retainer)}`).join(', ')})</span>
          </button>
          <span className={sub}>Com mínimo ≈ {f(est.total)} · só o produzido ≈ {f(est.totalProduzido)}</span>
        </div>
      )}
      {est.n > 0 && (() => {
        const hoje = new Date();
        const atual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mesNum;
        const ate = atual ? hoje.getDate() : est.nDiasMes;
        const serie = (usaMin ? est.acumuladoMin : est.acumulado).map((v, i) => (i < ate ? v : null));
        const rotulos = Array.from({ length: est.nDiasMes }, (_, i) => `${i + 1} ${meses[mesNum - 1].slice(0, 3).toLowerCase()}`);
        const prevSerie = estPrev && estPrev.n > 0 ? Array.from({ length: est.nDiasMes }, (_, i) => { const a = usaMin ? estPrev.acumuladoMin : estPrev.acumulado; return i < a.length ? a[i] : a[a.length - 1]; }) : null;
        const series = [
          { nome: meses[mesNum - 1], cor: '#10b981', valores: serie, area: true },
          ...(usaMin && est.acumulado.some((v, i) => v !== est.acumuladoMin[i]) ? [{ nome: 'só produzido', cor: '#10b981', valores: est.acumulado.map((v, i) => (i < ate ? v : null)), tracejado: true }] : []),
          ...(prevSerie ? [{ nome: meses[mPrev - 1], cor: claro ? '#94a3b8' : '#64748b', valores: prevSerie, tracejado: true }] : []),
        ];
        const noDia = i => { const ant = i > 0 ? est.acumulado[i - 1] : 0; const d = est.acumulado[i] - ant; return d > 0 ? [{ valor: `+${f(d)}`, nome: 'entregue nesse dia' }] : []; };
        return (
          <div className="mt-3">
            <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs mb-1" style={{ color: 'var(--graf-eixo)' }}>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 rounded-full" style={{ height: 2, background: '#10b981' }} />{meses[mesNum - 1]}{usaMin ? ' (com mínimo)' : ''}</span>
              {series.some(x => x.nome === 'só produzido') && <span className="flex items-center gap-1.5"><span className="inline-block w-4" style={{ height: 2, backgroundImage: 'repeating-linear-gradient(90deg, #10b981 0 5px, transparent 5px 9px)' }} />só produzido</span>}
              {prevSerie && <span className="flex items-center gap-1.5"><span className="inline-block w-4" style={{ height: 2, backgroundImage: `repeating-linear-gradient(90deg, ${claro ? '#94a3b8' : '#64748b'} 0 5px, transparent 5px 9px)` }} />{meses[mPrev - 1]}</span>}
            </div>
            <GraficoLinhas height={190} rotulos={rotulos} series={series} aria={`Faturação acumulada por dia em ${meses[mesNum - 1]}`}
              formatarValor={v => f(v)} extraTip={i => (i < ate ? noDia(i) : [])} />
            {(() => {
              // Ganho em cada dia (só o produzido — o mínimo garantido não é ganho num dia concreto)
              const porDia = est.acumulado.map((v, i) => (i < ate ? v - (i > 0 ? est.acumulado[i - 1] : 0) : 0));
              const fds = i => { const wd = new Date(ano, mesNum - 1, i + 1).getDay(); return wd === 0 || wd === 6; };
              let uteis = 0; for (let i = 0; i < ate; i++) if (!fds(i)) uteis++;
              const media = uteis ? est.acumulado[ate - 1] / uteis : 0;
              const corCli = c => ((clientes || []).find(x => String(x.id) === String(c.cid)) || {}).cor || '#64748b';
              return (
                <div className="mt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs mb-1" style={{ color: 'var(--graf-eixo)' }}>
                    <span>Ganho por dia (só o produzido)</span>
                    {media > 0 && <span className="flex items-center gap-1.5"><span className="inline-block w-4" style={{ height: 2, backgroundImage: 'repeating-linear-gradient(90deg, var(--graf-eixo) 0 5px, transparent 5px 9px)' }} />média por dia útil {f(media)}</span>}
                  </div>
                  <GraficoBarras height={150} rotulos={rotulos.map((_, i) => String(i + 1))} tituloTip={i => rotulos[i]} aria={`Ganho por dia em ${meses[mesNum - 1]} (ClickUp)`}
                    series={[{ nome: 'nesse dia', cor: '#10b981', valores: porDia }]}
                    referencia={media > 0 ? { valor: Math.round(media), nome: 'média por dia útil' } : null}
                    apagado={fds}
                    extraTip={i => est.clientes.filter(c => (c.diario[i + 1] || 0) > 0 || c.tarefas.some(t => Number(String(t.fechada).slice(8, 10)) === i + 1)).flatMap(c => {
                      // Cada cliente e, por baixo, as tarefas entregues nesse dia
                      const ts = c.tarefas.filter(t => Number(String(t.fechada).slice(8, 10)) === i + 1).sort((a, b) => (b.valor || 0) - (a.valor || 0));
                      return [
                        { cor: corCli(c), valor: f(c.diario[i + 1] || 0), nome: nomeCli(c), sep: true },
                        ...ts.slice(0, 6).map(t => ({ tarefa: true, nome: t.nome, valor: t.valor ? f(t.valor) : (t.nosDias ? 'à diária' : '') })),
                        ...(ts.length > 6 ? [{ tarefa: true, nome: `+ ${ts.length - 6} tarefa${ts.length - 6 === 1 ? '' : 's'}`, valor: '' }] : []),
                      ];
                    })} />
                </div>
              );
            })()}
          </div>
        );
      })()}
      {est.clientes.length > 0 && (
        <div className="mt-2 space-y-1">
          {est.clientes.map(c => (
            <details key={c.cid ?? c.nomeEsp} className="text-sm">
              <summary className="cursor-pointer flex flex-wrap gap-x-2 items-baseline list-none">
                <span className="font-medium">{nomeCli(c)}</span>
                <span className={`text-xs ${sub} order-last basis-full sm:order-none sm:basis-auto sm:flex-1 min-w-0`}>{resumoContagem(c.contagem, c.horasExtra)}</span>
                <span className="tabular-nums ml-auto text-right">{c.noMinimo && usaMin ? <span className={`text-xs ${sub} mr-1`}>produzido {f(c.produzido)} · mínimo</span> : c.noMinimo ? <span className={`text-xs ${sub} mr-1`}>sem o mínimo de {f(c.retainer)} ·</span> : c.nDias ? <span className={`text-xs ${sub} mr-1`}>{c.nDias} dia{c.nDias === 1 ? '' : 's'} × {f(c.diaria)}{c.produzido > c.valorDias ? ` + ${f(c.produzido - c.valorDias)}` : ''} =</span> : null}≈ {f(usaMin ? c.total : c.produzido)}</span>
              </summary>
              <ul className={`mt-1 mb-2 pl-3 text-xs space-y-0.5 ${sub}`}>
                {c.tarefas.map(t => <li key={t.id} className="flex justify-between gap-3"><span className="truncate">{t.fechada.slice(8, 10)}/{t.fechada.slice(5, 7)} · {t.nome}{t.emReview && <span className="ml-1.5 px-1.5 rounded bg-amber-500/15 text-amber-400">review</span>}</span><span className="tabular-nums flex-shrink-0">{t.horasExtra > 0 ? `${String(t.horasExtra).replace('.', ',')} h · ` : ''}{t.nosDias ? 'conta nos dias' : t.valor > 0 ? f(t.valor) : (cuPecas(t.nome).some(p => p.tipo === 'extra' || p.tipo === 'outro') && !(t.horasExtra > 0) ? 'sem horas registadas' : 'sem preço')}</span></li>)}
              </ul>
            </details>
          ))}
        </div>
      )}
      {estPrev && estPrev.clientes.length > 0 && M && (() => {
        // Receita provisória (o que se estimou entregue no mês passado) vs final (recibos passados este mês)
        const k = `${ano}-${mesNum}`;
        const recs = [...(((M[k] || {}).regCom) || []), ...(((M[k] || {}).regSem) || [])];
        const fat = cid => recs.filter(r => String(r.cid) === String(cid)).reduce((a, r) => a + (parseFloat(r.valIliq != null && r.valIliq !== '' ? r.valIliq : r.val) || 0), 0);
        const linhas = estPrev.clientes.filter(c => c.cid != null).map(c => ({ c, est: usaMin ? c.total : c.produzido, fat: fat(c.cid) }));
        if (!linhas.length) return null;
        return (
          <details className={`mt-3 rounded-xl border px-3 py-2 ${claro ? 'border-slate-200' : 'border-slate-700/60'}`}>
            <summary className="cursor-pointer text-sm"><span className="font-medium">Fecho de {meses[mPrev - 1].toLowerCase()}</span> <span className={`text-xs ${sub}`}>· estimado {f(linhas.reduce((a, l) => a + l.est, 0))} · faturado em {meses[mesNum - 1].toLowerCase()} {f(linhas.reduce((a, l) => a + l.fat, 0))}</span></summary>
            <div className="mt-2 space-y-1 text-sm">
              {linhas.map(({ c, est: e, fat: fv }) => {
                const dif = fv - e;
                return (
                  <div key={String(c.cid)} className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium min-w-[90px]">{nomeCli(c)}</span>
                    <span className={`text-xs ${sub}`}>estimado {f(e)}</span>
                    <span className={`text-xs ${sub}`}>faturado {f(fv)}</span>
                    <span className={`ml-auto text-xs font-medium ${fv === 0 ? 'text-amber-400' : Math.abs(dif) < 1 ? 'text-emerald-400' : dif < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {fv === 0 ? 'por faturar' : Math.abs(dif) < 1 ? 'certo' : `${dif > 0 ? '+' : '−'}${f(Math.abs(dif))}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })()}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {est.semPreco > 0 && <span className="text-amber-400">{est.semPreco} peça{est.semPreco === 1 ? '' : 's'} sem valor (sem preço ou, nas tarefas à hora, sem horas registadas)</span>}
        <span className={sub}>Estimativa pelas tarefas do Trabalho (tipo e preço de cada uma). As tarefas em review contam como entregues.</span>
        {onIrPrecos && <button className="text-blue-400 hover:text-blue-300" onClick={onIrPrecos}>preços → Trabalho</button>}
      </div>
    </div>
  );
};

// ══ TRABALHO: tarefas, pastas e tempos da própria app (substitui o ClickUp) ══
// Os dados vivem num documento à parte no Firestore (users/<uid>/trabalho/dados).
// Aqui ficam só as contas (usadas também pela estimativa de receitas); o ecrã está em trabalho.jsx.
const TRAB_ESTADOS = [
  { id: 'todo', nome: 'Por começar', cor: '#94a3b8' },
  { id: 'curso', nome: 'Em curso', cor: '#3b82f6' },
  { id: 'review', nome: 'Review', cor: '#f59e0b' },
  { id: 'feito', nome: 'Feito', cor: '#10b981' },
];
const TRAB_VAZIO = { v: 1, pastas: [], tarefas: [], notasCliente: {} };
const trabId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const trabDia = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const trabMsTempo = (x, agora = Date.now()) => Math.max(0, (x.fim ? Date.parse(x.fim) : agora) - Date.parse(x.ini));
const trabHoras = (t, agora) => (t.tempos || []).reduce((a, x) => a + trabMsTempo(x, agora), 0) / 3600000;
const trabACorrer = trab => { for (const t of ((trab && trab.tarefas) || [])) { const x = (t.tempos || []).find(y => !y.fim); if (x) return { tarefa: t, tempo: x }; } return null; };
// Dia em que a tarefa conta como entregue: quando foi para review (ou, se saltou o review, quando ficou feita)
const trabEntrega = t => (t.estado === 'review' || t.estado === 'feito') ? trabDia(t.review || t.feita || '') : '';
// Preço de um tipo de peça para um cliente: o que puseste em "preços" → a tabela do cliente → o padrão
const cuPreco = (cu, clientes, cid, tipo) => {
  const precos = (cu && cu.precos) || {};
  const pc = (precos.porCliente || {})[cid] || {};
  if (pc[tipo] != null && pc[tipo] !== '') return Number(pc[tipo]) || 0;
  const pre = cuPresetCliente(clientes, cid);
  if (pre[tipo] != null) return Number(pre[tipo]) || 0;
  return Number({ ...CU_PRECOS_PADRAO, ...(precos.padrao || {}) }[tipo]) || 0;
};
// Peças de uma tarefa: as que puseste à mão na tarefa (quantidade por tipo) ou, se não houver,
// as que se leem do nome ("2x New Videos + 1x Variation")
const trabPecas = t => {
  const q = t && t.pecas;
  if (q && typeof q === 'object' && Object.keys(q).length) {
    const out = Object.entries(q).map(([tipo, n]) => ({ tipo, n: Number(n) || 0 })).filter(p => p.n > 0);
    return out.length ? out : [{ tipo: 'outro', n: 1 }];
  }
  return cuPecas(t && t.nome);
};
// Quanto vale uma tarefa (as tarefas à hora usam as horas registadas). Nos clientes à diária
// as horas contam nos dias, não na tarefa. "Valor final" à mão ganha a tudo.
const trabValorAuto = (t, cu, clientes) => {
  const cid = t.cid;
  const diaria = cuPreco(cu, clientes, cid, 'dia');
  let v = 0;
  trabPecas(t).forEach(p => {
    if (p.tipo === 'extra' || p.tipo === 'outro') { if (!(diaria > 0)) v += cuPreco(cu, clientes, cid, 'hora') * trabHoras(t); }
    else v += cuPreco(cu, clientes, cid, p.tipo) * p.n;
  });
  return v;
};
const trabValor = (t, cu, clientes) => {
  if (t.valorManual != null && t.valorManual !== '' && Number.isFinite(Number(t.valorManual))) return Number(t.valorManual);
  return trabValorAuto(t, cu, clientes);
};
// ══ Plano do mês: distribuir o trabalho que falta pelos dias úteis até ao fim do mês ══
const pascoaDe = y => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1; return new Date(y, mes - 1, dia); };
const feriadosPT = y => { const p = pascoaDe(y); const desl = n => { const x = new Date(p); x.setDate(x.getDate() + n); return `${x.getMonth() + 1}-${x.getDate()}`; }; return new Set(['1-1', '4-25', '5-1', '6-10', '8-15', '10-5', '11-1', '12-1', '12-8', '12-25', desl(-2), desl(60)]); };
const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MES_ABREV = { jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12 };
const mesDoNomePasta = nome => { const ms = [...String(nome || '').toLowerCase().matchAll(/(?:^|[^a-zà-ú])(jan|feb|fev|mar|apr|abr|may|mai|jun|jul|aug|ago|sep|set|oct|out|nov|dec|dez)[a-zà-ú]*(?![a-zà-ú])/g)]; return ms.length ? MES_ABREV[ms[ms.length - 1][1]] : null; };
const HORAS_TIPO_PADRAO = { video: 6, video3d: 8, ai_clip: 2, variacao: 2, iteracao: 1.5, hook: 1.5, aso: 4, banner: 1.5, banner_var: 1, icone: 6, feature: 3, screenshots: 6, extra: 2, outro: 3 };
// Horas típicas por tipo de peça: a mediana das tuas tarefas já feitas (com tempo registado) ou um valor padrão
const horasTipicas = trab => {
  const por = {};
  ((trab && trab.tarefas) || []).forEach(t => {
    if (t.estado !== 'feito' && t.estado !== 'review') return;
    const h = trabHoras(t); if (!(h > 0.2)) return;
    const ps = trabPecas(t); const n = ps.reduce((a, p) => a + (p.n || 1), 0) || 1;
    if (ps.length !== 1) return; // só as tarefas de um tipo, para a média não se baralhar
    (por[ps[0].tipo] = por[ps[0].tipo] || []).push(h / n);
  });
  const out = { ...HORAS_TIPO_PADRAO };
  Object.entries(por).forEach(([k, l]) => { if (l.length >= 3) { const s = l.sort((a, b) => a - b); out[k] = Math.round(s[Math.floor(s.length / 2)] * 4) / 4; } });
  return out;
};
const estimarHorasTarefa = (t, tipicas) => {
  const est = Number(t.estimativa);
  const base = est > 0 ? est : trabPecas(t).reduce((a, p) => a + (tipicas[p.tipo] ?? tipicas.outro) * (p.n || 1), 0);
  return Math.max(0.5, Math.round((base - trabHoras(t)) * 4) / 4);
};
const ORDEM_PRIO = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const planearMes = ({ trab, hoje = new Date(), horasDia = 6, folgas = new Set(), incluirHoje = true }) => {
  const y = hoje.getFullYear(), m = hoje.getMonth() + 1;
  const fimIso = isoDia(new Date(y, m, 0)), hojeIso = isoDia(hoje);
  const fer = feriadosPT(y);
  const dias = [];
  for (let d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + (incluirHoje ? 0 : 1)); isoDia(d) <= fimIso; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(), iso = isoDia(d);
    if (wd === 0 || wd === 6 || fer.has(`${d.getMonth() + 1}-${d.getDate()}`) || folgas.has(iso)) continue;
    dias.push({ d: iso, livre: horasDia, itens: [] });
  }
  const pastas = {}; ((trab && trab.pastas) || []).forEach(p => { pastas[p.id] = p; });
  const tipicas = horasTipicas(trab);
  const limiteAntigas = isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 45));
  let antigas = 0;
  const tarefas = ((trab && trab.tarefas) || []).filter(t => {
    if (t.estado !== 'todo' && t.estado !== 'curso') return false;
    if (t.prazo && t.prazo < limiteAntigas) { antigas++; return false; } // prazos de há mais de mês e meio: provavelmente esquecidas
    if (t.prazo) return t.prazo <= fimIso;
    const pa = pastas[t.pastaId]; const mp = pa ? (pa.mesNum || mesDoNomePasta(pa.nome)) : null;
    return mp === m;
  }).map(t => {
    const pa = pastas[t.pastaId] || {};
    return { tid: t.id, nome: t.nome, pasta: pa.nome || '', pastaId: t.pastaId, cor: pa.cor || '#64748b', prazo: t.prazo || fimIso, temPrazo: !!t.prazo, prio: ORDEM_PRIO[t.prioridade] ?? 2, h: estimarHorasTarefa(t, tipicas), curso: t.estado === 'curso' };
  }).sort((a, b) => a.prazo.localeCompare(b.prazo) || a.prio - b.prio || Number(b.curso) - Number(a.curso));
  let sobra = 0;
  tarefas.forEach(t => {
    let falta = t.h; t.fim = null;
    for (const d of dias) {
      if (falta <= 0) break;
      if (d.livre <= 0.01) continue;
      const h = Math.min(d.livre, falta);
      d.itens.push({ tid: t.tid, nome: t.nome, pasta: t.pasta, pastaId: t.pastaId, cor: t.cor, h: Math.round(h * 4) / 4 });
      d.livre -= h; falta -= h; t.fim = d.d;
    }
    if (falta > 0.01) { sobra += falta; t.naoCabe = Math.round(falta * 4) / 4; }
    t.risco = !!(t.naoCabe || (t.fim && t.fim > t.prazo) || t.prazo < hojeIso);
  });
  const totalH = tarefas.reduce((a, t) => a + t.h, 0);
  return { criado: new Date().toISOString(), horasDia, dias: dias.filter(d => d.itens.length).map(d => ({ d: d.d, itens: d.itens })), nDias: dias.length, totalH: Math.round(totalH * 4) / 4, sobra: Math.round(sobra * 4) / 4, precisaDia: dias.length ? Math.round(totalH / dias.length * 10) / 10 : totalH, tarefas: tarefas.map(t => ({ tid: t.tid, nome: t.nome, pasta: t.pasta, pastaId: t.pastaId, h: t.h, prazo: t.temPrazo ? t.prazo : null, atrasada: t.prazo < hojeIso, fim: t.fim, risco: t.risco, naoCabe: t.naoCabe || 0 })), antigas };
};
// Tarefas da app entregues num mês (para a estimativa).
// Entram também as linhas à parte dos orçamentos (AI Credits, acertos...) no mês da data delas.
const trabEntreguesMes = (trab, ano, mesNum, cu = null, clientes = []) => {
  const pref = `${ano}-${String(mesNum).padStart(2, '0')}-`;
  const tarefas = ((trab && trab.tarefas) || []).filter(t => trabEntrega(t).startsWith(pref)).map(t => ({
    id: 'app:' + t.id, nome: t.nome, fechada: trabEntrega(t), cid: t.cid, app: true, valorManual: trabValor(t, cu, clientes), pecasArr: trabPecas(t),
    horas: Math.round(trabHoras(t) * 100) / 100, emReview: t.estado === 'review',
  }));
  const extras = [];
  ((trab && trab.pastas) || []).forEach(p => ((p.orcamento && p.orcamento.extras) || []).forEach((e, i) => {
    const v = Number(String(e.val ?? '').replace(',', '.')) || 0;
    const d = e.data || trabDia(p.criada || '');
    if (v && String(d).startsWith(pref)) extras.push({ id: `app:x:${p.id}:${i}`, nome: e.desc || 'Linha à parte', fechada: d, cid: p.cid, app: true, valorManual: v, pecasArr: [], horas: 0, extraOrc: true });
  }));
  return [...tarefas, ...extras];
};
// Subcontratações do mês: custo das tarefas entregues nesse mês + linhas à mão dos orçamentos (pela data)
const trabCustosMes = (trab, ano, mesNum) => {
  const pref = `${ano}-${String(mesNum).padStart(2, '0')}-`;
  const linhas = [];
  ((trab && trab.tarefas) || []).forEach(t => {
    const v = Number(t.custoOutsourcing) || 0;
    if (v > 0 && trabEntrega(t).startsWith(pref)) linhas.push({ quem: t.outsourcing || '', desc: t.nome, v, cid: t.cid });
  });
  ((trab && trab.pastas) || []).forEach(p => ((p.orcamento && p.orcamento.custos) || []).forEach(e => {
    const v = Number(String(e.val ?? '').replace(',', '.')) || 0;
    if (v && String(e.data || '').startsWith(pref)) linhas.push({ quem: e.quem || '', desc: e.desc || p.nome, v, cid: p.cid });
  }));
  return { total: linhas.reduce((a, l) => a + l.v, 0), linhas };
};
// Dias do mês com horas registadas na app, por cliente (para quem paga à diária)
const trabDiasMes = (trab, ano, mesNum) => {
  const pref = `${ano}-${String(mesNum).padStart(2, '0')}-`;
  const out = {};
  ((trab && trab.tarefas) || []).forEach(t => (t.tempos || []).forEach(x => {
    const d = trabDia(x.ini);
    if (d.startsWith(pref) && trabMsTempo(x) > 0) (out[t.cid] = out[t.cid] || new Set()).add(Number(d.slice(8, 10)));
  }));
  return out;
};
// Parar o cronómetro que estiver a correr (em qualquer tarefa)
const trabParar = trab => ({
  ...trab, tarefas: ((trab && trab.tarefas) || []).map(t => ((t.tempos || []).some(x => !x.fim) ? { ...t, tempos: t.tempos.map(x => (x.fim ? x : { ...x, fim: new Date().toISOString() })) } : t)),
});
// Cronómetro a correr, mostrado no topo da app (atualiza só ele, uma vez por segundo)
const trabRelogio = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const CronoTopo = ({ trab, onParar, onAbrir, theme }) => {
  const corre = trabACorrer(trab);
  const [, setTic] = useState(0);
  useEffect(() => { if (!corre) return undefined; const i = setInterval(() => setTic(x => x + 1), 1000); return () => clearInterval(i); }, [!!corre]);
  if (!corre) return null;
  const claro = theme === 'light';
  return (
    <div className={`flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full border text-xs ${claro ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-blue-500/30 bg-blue-500/10 text-blue-300'}`}>
      <button type="button" onClick={onAbrir} className="flex items-center gap-1.5 min-w-0" title={corre.tarefa.nome}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="font-semibold tabular-nums">{trabRelogio(trabMsTempo(corre.tempo))}</span>
        <span className="hidden md:inline max-w-[140px] truncate">{corre.tarefa.nome}</span>
      </button>
      <button type="button" onClick={onParar} className={`w-6 h-6 inline-flex items-center justify-center rounded-full ${claro ? 'hover:bg-blue-100' : 'hover:bg-white/10'}`} title="Parar o cronómetro" aria-label="Parar o cronómetro">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="currentColor" /></svg>
      </button>
    </div>
  );
};

// Barra de separadores do computador (com os menus que abrem ao passar o rato).
// Fica num componente próprio para que abrir/fechar um menu não volte a desenhar
// a página toda (fazia os gráficos "saltarem").
const MenuTopo = ({ tabs, tab, setTab, theme, irInicio }) => {
 // Menu de cada grupo: abre ao passar o rato e fica aberto até passares por outro grupo,
 // escolheres um separador, clicares fora ou carregares em Esc.
 const [menuAberto, setMenuAberto] = useState(null);
 const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
 const menuRef = useRef(null);
 const abrirMenu = (id, el) => {
   const r = el.getBoundingClientRect();
   setMenuPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 210)), top: r.bottom + 6 });
   setMenuAberto(id);
 };
 useEffect(() => { setMenuAberto(null); }, [tab]);
 useEffect(() => {
   if (!menuAberto) return;
   const fora = e => { if (menuRef.current && !menuRef.current.contains(e.target) && !e.target.closest('[data-grupo-menu]')) setMenuAberto(null); };
   const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setMenuAberto(null); } };
   const fechar = () => setMenuAberto(null);
   document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc); window.addEventListener('resize', fechar);
   return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); window.removeEventListener('resize', fechar); };
 }, [menuAberto]);
 return (
  <>
      <nav className={`hidden sm:flex gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 ${theme === 'light' ? 'bg-slate-100/95 border-slate-200' : 'bg-slate-900/95 border-slate-700/30'} border-b overflow-x-auto scrollbar-hide backdrop-blur-xl`}>
        <button onClick={() => { setMenuAberto(null); irInicio(); }} onMouseEnter={() => setMenuAberto(null)} aria-label="Início (Resumo)" title="Início (Resumo) · tecla Esc"
          className={`flex-shrink-0 px-2.5 sm:px-3 rounded-lg sm:rounded-xl transition-all ${theme === 'light' ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/></svg>
        </button>
        <div className={`flex-shrink-0 w-px h-8 my-auto ${theme === 'light' ? 'bg-slate-300' : 'bg-slate-600'}`} />
        {tabs.map(t => {
          // Verificar se alguma sub-tab está ativa
          const isSubActive = t.submenu?.some(sub => tab === sub.id);
          
          return t.separator ? (
            <div key={t.id} className={`flex-shrink-0 w-px h-8 my-auto ${theme === 'light' ? 'bg-slate-300' : 'bg-slate-600'}`} />
          ) : t.submenu ? (
            <button key={t.id} data-grupo-menu aria-label={t.label}
              aria-haspopup="menu" aria-expanded={menuAberto === t.id}
              onMouseEnter={e => abrirMenu(t.id, e.currentTarget)}
              onClick={e => { if (menuAberto === t.id) setMenuAberto(null); else abrirMenu(t.id, e.currentTarget); }}
              className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all duration-200 ${
                isSubActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                  : theme === 'light'
                    ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="sm:mr-1 inline-flex align-middle"><Ico e={t.icon} className="ico-nav"/></span>
              <span className="hidden sm:inline">{t.label}</span>
              <span className={`ml-1 text-xs inline-block transition-transform ${menuAberto === t.id ? 'rotate-180' : ''}`}>▾</span>
            </button>
          ) : (
            <button key={t.id} aria-label={t.label} onMouseEnter={() => setMenuAberto(null)} onClick={()=>setTab(t.id)} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all duration-200 hover-scale ${tab===t.id?'bg-blue-600 text-white shadow-lg shadow-blue-500/25': theme === 'light' ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}><span className="sm:mr-1 inline-flex align-middle"><Ico e={t.icon} className="ico-nav"/></span><span className="hidden sm:inline">{t.label}</span></button>
          );
        })}
      </nav>
      {createPortal(<>
      {menuAberto && (() => {
        const g = tabs.find(t => t.id === menuAberto);
        if (!g || !g.submenu) return null;
        return (
          <div ref={menuRef} role="menu" className="fixed z-50 animate-fadeIn" style={{ left: menuPos.left, top: menuPos.top }}>
            <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-lg' : 'bg-slate-800 border-slate-700 shadow-xl'} border rounded-xl py-1 min-w-[180px]`}>
              {g.submenu.map(sub => (
                <button key={sub.id} role="menuitem"
                  onClick={() => { setTab(sub.id); setMenuAberto(null); }}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${
                    tab === sub.id
                      ? 'bg-blue-500/20 text-blue-400'
                      : theme === 'light' ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-700'
                  }`}>
                  <Ico e={sub.icon} className="ico-nav"/><span>{sub.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      </>, document.body)}
  </>
 );
};

// ── Peças visuais usadas em toda a app ──
// Ficam ao nível do módulo (e não dentro do OrcamentoApp) para manterem a mesma identidade entre
// renders: antes eram recriadas a cada render e o React desmontava e voltava a montar tudo o que
// estava lá dentro (gráficos a "saltar", campos a perder o que se escrevia). O tema vem do TemaCtx.
const TemaCtx = React.createContext('dark');
const Card = ({children, className = '', animate = false}) => { const theme = useContext(TemaCtx); return <div className={`${theme === 'light' ? 'bg-white/80 border-slate-200 shadow-sm' : 'bg-slate-800/50 border-slate-700/50'} rounded-xl sm:rounded-2xl border p-3 sm:p-4 ${animate ? 'animate-fadeIn' : ''} hover-lift smooth-colors ${className}`}>{children}</div>; };
const StatCard = ({label, value, color = '', sub, icon}) => { const theme = useContext(TemaCtx); return <Card className="p-3 sm:p-4 hover-scale"><p className={`${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} text-xs font-medium mb-1 flex items-center`}><Ico e={icon}/>{label}</p><p className={`text-lg sm:text-xl font-bold ${color || (theme === 'light' ? 'text-slate-900' : 'text-white')} transition-all duration-300`}>{value}</p>{sub && <p className={`${theme === 'light' ? 'text-slate-400' : 'text-slate-500'} text-xs mt-1 truncate`}>{sub}</p>}</Card>; };
const Button = ({children, onClick, variant = 'primary', size = 'md', disabled = false}) => {
  const base = 'font-semibold rounded-xl transition-all duration-200 hover-scale ';
  const variants = {primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm', secondary: 'bg-slate-700 hover:bg-slate-600 text-white', danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400'};
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  return <button onClick={onClick} disabled={disabled} className={base + variants[variant] + ' ' + sizes[size] + (disabled ? ' opacity-50 cursor-not-allowed' : '')}>{children}</button>;
};
const ProgressBar = ({value, max, color = '#3b82f6', height = 'h-2'}) => { const theme = useContext(TemaCtx); return <div className={`w-full ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700/50'} rounded-full overflow-hidden ${height}`}><div className="h-full rounded-full progress-animated" style={{width: `${Math.min((value/max)*100, 100)}%`, background: color}}/></div>; };
const Row = ({children, highlight}) => { const theme = useContext(TemaCtx); return <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl transition-colors duration-150 ${highlight ? 'bg-green-500/10 border border-green-500/30' : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-700/30 hover:bg-slate-700/50'}`}>{children}</div>; };
// Desenha um separador definido dentro do OrcamentoApp sem o remontar a cada render:
// o tipo do componente (AbaEstavel) é sempre o mesmo; a função "render" é a versão mais recente.
// Os hooks de cada separador ficam guardados nesta instância (uma por separador, pela key).
const AbaEstavel = ({ render }) => render();


// Separadores que vêm num ficheiro à parte (só se descarregam quando são precisos).
// Se o ficheiro falhar (p.ex. a app foi atualizada enquanto estava aberta), recarrega
// a página uma vez; se voltar a falhar, mostra um aviso em vez de um ecrã em branco.
const lazySeparador = (carregar, nome) => React.lazy(() => carregar()
  .then(m => { try { sessionStorage.removeItem('app-recarregada'); } catch (e) { /* sem acesso */ } return { default: m[nome] }; })
  .catch(() => {
    let ja = null;
    try { ja = sessionStorage.getItem('app-recarregada'); sessionStorage.setItem('app-recarregada', '1'); } catch (e) { ja = '1'; }
    if (!ja) { window.location.reload(); return new Promise(() => {}); }
    return { default: () => <div className="py-16 text-center text-slate-400">Não foi possível abrir este separador. Verifica a ligação à internet e recarrega a página.</div> };
  }));
const SeparadorCarregar = () => <div className="py-16 text-center text-slate-400 text-sm">A carregar…</div>;


const VC_DEFAULT = {
  dataVenda: '',
  valorVenda: 0,
  comissaoPct: 4,
  creditoAmortizado: 0,
  penalizacaoPct: 0.5,
  custoEscritura: 0,
  rendasAdiantadas: 0,
  outrosCustos: 0,
  valorAquisicao: 0,
  hppOverride: null,
  dataCPCV: '',            // data de assinatura do contrato-promessa
  sinal: 0,
  prazoEscrituraDias: 45,
  movimentos: [],
  repor: []   // dinheiro teu adiantado que vais tirar da venda: {id, desc, val, quando: 'sinal'|'escritura', reposto: 'YYYY-MM-DD'|null}
};

// ── Prazos do contrato-promessa (CPCV) ──
// A partir da data do CPCV calcula as datas importantes até à escritura.
// Dias úteis = segunda a sexta (não conta feriados). Usado no separador Venda da Casa e no Calendário.
const vcIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vcData = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y && m && d ? new Date(y, m - 1, d) : null; };
const vcDiasUteis = (d, n) => {
  const r = new Date(d); let falta = Math.abs(n); const passo = n < 0 ? -1 : 1;
  while (falta > 0) { r.setDate(r.getDate() + passo); if (r.getDay() !== 0 && r.getDay() !== 6) falta--; }
  return r;
};
const VC_DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const vcPrazosCPCV = (vc, conc = {}) => {
  const d0 = vcData(vc.dataCPCV);
  if (!d0) return [];
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const f = v => _fmtEUR.format(isFinite(v) ? v : 0);
  const dd = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prazo = Math.max(1, parseInt(vc.prazoEscrituraDias, 10) || 45);
  const limite = new Date(d0); limite.setDate(limite.getDate() + prazo);
  const fimSemana = limite.getDay() === 0 || limite.getDay() === 6;
  const escr = vcData(vc.dataVenda);
  const sinal = parseFloat(vc.sinal) || 0;
  const L = [];
  const add = (id, data, titulo, curto, extra = {}) => {
    const chave = 'vc-' + id;
    const feito = conc[chave] === true || (extra.auto && data < hoje);
    L.push({ id, chave, data, iso: vcIso(data), titulo, curto, feito, estado: feito ? 'ok' : data < hoje ? 'atrasado' : 'futuro', ...extra });
  };
  add('cpcv', d0, 'Assinar o contrato-promessa (CPCV)', 'Assinar CPCV', {
    auto: true,
    nota: 'Confirmar o anexo do sinal (para que conta vai) e fazer o reconhecimento das assinaturas',
  });
  add('sinal', vcDiasUteis(d0, 5), sinal > 0 ? `Confirmar que o sinal de ${f(sinal)} entrou na conta` : 'Confirmar que o sinal entrou na conta', 'Sinal na conta', {
    nota: 'Se o sinal não entrar até este dia, o contrato fica sem efeito (cláusula 3.ª)',
  });
  const ref = escr || limite;
  const mud = new Date(ref); mud.setDate(mud.getDate() - 14);
  if (mud > d0) add('mudanca', mud, 'Mudança: a casa tem de estar vazia no dia da escritura', 'Mudança', {
    nota: `Faltam 2 semanas para ${escr ? 'a escritura' : 'o prazo da escritura'} (${dd(ref)}). Fica só o que foi combinado no contrato.`,
  });
  if (!escr) {
    add('aviso', vcDiasUteis(limite, -10), 'Os compradores já deviam ter marcado a escritura', 'Escritura marcada?', {
      nota: `Têm de avisar com pelo menos 10 dias úteis de antecedência. Quando souberes a data, põe-na no separador Venda da Casa.`,
    });
    add('limite', limite, 'Prazo limite para a escritura', 'Prazo escritura', {
      nota: `${prazo} dias depois do CPCV${fimSemana ? ` · calha a um ${VC_DIAS_SEMANA[limite.getDay()]}, por isso na prática é até ${dd(vcDiasUteis(limite, -1))}` : ''}`,
    });
  }
  const prep = new Date(escr || limite); prep.setDate(prep.getDate() - 10);
  if (prep > d0) add('docs', prep, 'Juntar os documentos para a escritura', 'Docs escritura', {
    nota: escr ? `A escritura é a ${dd(escr)}` : `A escritura tem de ser até ${dd(limite)}`,
    lista: [
      'Declaração de dívida do banco para cancelar a hipoteca (distrate) — pedir já, pode demorar',
      'Ficha técnica da habitação',
      'Declaração de dívidas do condomínio (pedir ao administrador)',
      'Certificado energético (já existe, válido até 2031)',
      'Cartões de cidadão e o IBAN para receber o restante',
    ],
  });
  if (escr) add('escritura', escr, 'Escritura e entrega das chaves', 'Escritura', {
    nota: 'Levar todas as chaves e comandos da garagem; a casa tem de estar vazia',
    lista: [
      'Confirmar o valor do cheque/transferência para o banco (distrate) e o do restante para vocês',
      'Ler as contagens da luz, água e gás e mudar os contratos',
      'Cancelar ou transferir o seguro da casa e o débito do condomínio',
    ],
  });
  return L.sort((a, b) => a.data - b.data);
};

export {
  StableInput, StableDateInput, SliderWithInput, useLargura, grafMarcas, grafCompacto, GrafCaixa, GraficoLinhas,
  LineChart, AreaChartAllTime, GRAF_COM, GRAF_SEM, BarChart, GraficoBarras, PieChart, AddClienteInput,
  DraggableList, impRefAuto, PagamentosImpostos, CategoryDropdown, meses, ESCALOES_IRS, DEDUCAO_CATA, IRS_CFG_PADRAO,
  mesDoRecibo, retencaoPadrao, impNum, impIRSEscaloes, guiaTransfCalc, transfFalta, transfFeita, ICO_SVG,
  Ico, IcoTxt, copiasLocais, CAL_CORES, CalendarioFinanceiro, impCalc, anos, _fmtEUR,
  _semAcentos, BILANCE_POR_DESC, BILANCE_GRUPOS, BILANCE_GRUPO_POR_DESC, BILANCE_POR_CATEGORIA, _grupoCompleto, _contemPalavra, mapearCategoriaBilance,
  estimarImpostosRecibo, _normNome, clienteDoNome, PROCESS_INVOICE_URLS, ProtecaoErro, CU_TIPOS, CU_CAMPOS_PRECO, CU_PRECOS_PADRAO,
  CU_PRECOS_CLIENTES, cuPresetCliente, cuTipoDe, cuPecas, cuClienteDe, cuEntregasMes, CU_NOMES_EN, MESES_EN,
  cuEur, cuLerHoras, cuHorasTxt, EntregasClickUp, TRAB_ESTADOS, TRAB_VAZIO, trabId, trabDia,
  trabMsTempo, trabHoras, trabACorrer, trabEntrega, cuPreco, trabPecas, trabValorAuto, trabValor,
  pascoaDe, feriadosPT, isoDia, MES_ABREV, mesDoNomePasta, HORAS_TIPO_PADRAO, horasTipicas, estimarHorasTarefa,
  ORDEM_PRIO, planearMes, trabEntreguesMes, trabCustosMes, trabDiasMes, trabParar, trabRelogio, CronoTopo,
  MenuTopo, TemaCtx, Card, StatCard, Button, ProgressBar, Row, AbaEstavel,
  lazySeparador, SeparadorCarregar, VC_DEFAULT, vcIso, vcData, vcDiasUteis, VC_DIAS_SEMANA, vcPrazosCPCV
};
