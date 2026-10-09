// Peças de base da app: campos de escrita, gráficos, constantes (meses, escalões de IRS)
// e o mapeamento de categorias para a Bilance. Usado por OrcamentoApp.jsx e pelos outros ficheiros.
import React, { useState, useEffect, useRef, memo } from 'react';

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
}, () => true); // Comparador que SEMPRE retorna true = NUNCA re-renderizar

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
}, () => true); // NUNCA re-renderizar

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
const PieChart = memo(({data, size = 200}) => {
 const total = data.reduce((a, d) => a + d.value, 0);
 if (total === 0) return null;
 let cumulative = 0;
 const createArc = (startAngle, endAngle) => {
 const start = (startAngle - 90) * Math.PI / 180;
 const end = (endAngle - 90) * Math.PI / 180;
 const r = size / 2 - 10;
 const cx = size / 2, cy = size / 2;
 const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
 const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
 return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${endAngle - startAngle > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
 };
 return (
 <svg width={size} height={size} className="drop-shadow-lg">
 {data.map((d, i) => {
 if (d.value === 0) return null;
 const startAngle = (cumulative / total) * 360;
 cumulative += d.value;
 return <path key={i} d={createArc(startAngle, (cumulative / total) * 360)} fill={d.color} stroke="#1e293b" strokeWidth="2" className="hover:opacity-80 transition-opacity"/>;
 })}
 <circle cx={size/2} cy={size/2} r={size/4} fill="#1e293b" />
 </svg>
 );
});

const LineChart = memo(({data, height = 200, color = '#3b82f6', showValues = false, formatValue}) => {
 if (data.length === 0) return null;
 const values = data.map(d => d.value);
 const max = Math.max(...values, 1);
 const min = Math.min(...values, 0);
 const range = max - min || 1;
 const padding = 10;
 const chartWidth = 100;
 const chartHeight = height - 40;
 const getX = (i) => padding + (i / (data.length - 1 || 1)) * (chartWidth - padding * 2);
 const getY = (v) => 15 + chartHeight - ((v - min) / range) * (chartHeight - 10);
 const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`).join(' ');
 const areaD = pathD + ` L ${getX(data.length - 1)} ${chartHeight + 15} L ${getX(0)} ${chartHeight + 15} Z`;
 
 const fmtVal = formatValue || ((v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toString());
 
 return (
 <div className="relative w-full" style={{height}}>
 <svg viewBox={`0 0 ${chartWidth} ${height}`} className="w-full h-full" preserveAspectRatio="none">
 <defs>
 <linearGradient id={`grad-${color.replace('#','')}`} x1="0%" y1="0%" x2="0%" y2="100%">
 <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
 <stop offset="100%" stopColor={color} stopOpacity="0"/>
 </linearGradient>
 </defs>
 {[0,1,2,3,4].map(i => <line key={i} x1={padding} x2={chartWidth-padding} y1={15 + i*(chartHeight-10)/4} y2={15 + i*(chartHeight-10)/4} stroke="#334155" strokeWidth="0.3" strokeDasharray="1"/>)}
 <path d={areaD} fill={`url(#grad-${color.replace('#','')})`}/>
 <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
 {data.map((d, i) => <circle key={i} cx={getX(i)} cy={getY(d.value)} r="2" fill={color} stroke="#1e293b" strokeWidth="1"/>)}
 </svg>
 {showValues && (
 <div className="absolute inset-0 pointer-events-none">
 {data.map((d, i) => {
 const xPercent = (getX(i) / chartWidth) * 100;
 const yPercent = ((getY(d.value) - 22) / height) * 100;
 return (
 <div 
 key={`val-${i}`} 
 className="absolute font-bold transform -translate-x-1/2"
 style={{
 left: `${xPercent}%`,
 top: `${yPercent}%`,
 color: color,
 fontSize: '12px',
 textShadow: '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5)'
 }}
 >
 {fmtVal(d.value)}
 </div>
 );
 })}
 </div>
 )}
 <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-xs text-slate-500">
 {data.map((d, i) => <span key={i} className="text-center truncate" style={{width: `${100/data.length}%`}}>{d.label}</span>)}
 </div>
 </div>
 );
});

// Area Chart mais bonito para All-Time
const AreaChartAllTime = memo(({data, height = 280}) => {
 if (data.length === 0) return null;
 
 const values = data.map(d => d.value);
 const max = Math.max(...values, 1);
 const min = 0; // Sempre começar do 0 para melhor visualização
 const range = max - min || 1;
 
 const paddingLeft = 50;
 const paddingRight = 20;
 const paddingTop = 20;
 const paddingBottom = 50;
 const chartWidth = 800;
 const chartHeight = height - paddingTop - paddingBottom;
 
 const getX = (i) => paddingLeft + (i / (data.length - 1 || 1)) * (chartWidth - paddingLeft - paddingRight);
 const getY = (v) => paddingTop + chartHeight - ((v - min) / range) * chartHeight;
 
 // Criar path suave com curvas
 const createSmoothPath = () => {
   if (data.length < 2) return '';
   let path = `M ${getX(0)} ${getY(data[0].value)}`;
   for (let i = 1; i < data.length; i++) {
     const x0 = getX(i - 1);
     const y0 = getY(data[i - 1].value);
     const x1 = getX(i);
     const y1 = getY(data[i].value);
     const cpx = (x0 + x1) / 2;
     path += ` C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
   }
   return path;
 };
 
 const smoothPath = createSmoothPath();
 const areaPath = smoothPath + ` L ${getX(data.length - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;
 
 // Valores do eixo Y
 const yAxisValues = [0, 1, 2, 3, 4].map(i => min + (range * (4 - i) / 4));
 
 // Calcular média móvel (3 meses)
 const movingAvg = data.map((d, i) => {
   if (i < 2) return null;
   const avg = (data[i].value + data[i-1].value + data[i-2].value) / 3;
   return { x: getX(i), y: getY(avg) };
 }).filter(Boolean);
 
 const movingAvgPath = movingAvg.length > 1 
   ? `M ${movingAvg[0].x} ${movingAvg[0].y} ` + movingAvg.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
   : '';
 
 // Labels do eixo X (mostrar apenas alguns para não sobrecarregar)
 const step = Math.ceil(data.length / 12);
 const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);
 
 const formatVal = (v) => v >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v}€`;
 
 return (
   <div className="relative w-full overflow-hidden" style={{height}}>
     <svg viewBox={`0 0 ${chartWidth} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
       <defs>
         <linearGradient id="areaGradientAllTime" x1="0%" y1="0%" x2="0%" y2="100%">
           <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4"/>
           <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.2"/>
           <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/>
         </linearGradient>
         <filter id="glow">
           <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
           <feMerge>
             <feMergeNode in="coloredBlur"/>
             <feMergeNode in="SourceGraphic"/>
           </feMerge>
         </filter>
       </defs>
       
       {/* Linhas de grelha horizontais */}
       {[0,1,2,3,4].map(i => (
         <g key={i}>
           <line 
             x1={paddingLeft} 
             x2={chartWidth - paddingRight} 
             y1={paddingTop + (i * chartHeight / 4)} 
             y2={paddingTop + (i * chartHeight / 4)} 
             stroke="#334155" 
             strokeWidth="1" 
             strokeDasharray="4 4"
             opacity="0.5"
           />
           <text 
             x={paddingLeft - 8} 
             y={paddingTop + (i * chartHeight / 4) + 4} 
             fill="#64748b" 
             fontSize="11" 
             textAnchor="end"
           >
             {formatVal(yAxisValues[i])}
           </text>
         </g>
       ))}
       
       {/* Área preenchida */}
       <path d={areaPath} fill="url(#areaGradientAllTime)"/>
       
       {/* Linha de média móvel */}
       {movingAvgPath && (
         <path 
           d={movingAvgPath} 
           fill="none" 
           stroke="#f59e0b" 
           strokeWidth="2" 
           strokeDasharray="6 3"
           opacity="0.7"
         />
       )}
       
       {/* Linha principal */}
       <path 
         d={smoothPath} 
         fill="none" 
         stroke="url(#lineGradient)" 
         strokeWidth="3" 
         strokeLinecap="round"
         filter="url(#glow)"
       />
       <defs>
         <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
           <stop offset="0%" stopColor="#3b82f6"/>
           <stop offset="100%" stopColor="#8b5cf6"/>
         </linearGradient>
       </defs>
       
       {/* Pontos nos dados com valores */}
       {data.map((d, i) => {
         // Mostrar valores: sempre se <= 12 pontos, ou a cada N pontos se mais
         const showValue = data.length <= 12 || i % Math.ceil(data.length / 12) === 0 || i === data.length - 1;
         const valueY = getY(d.value) - 12;
         const shortVal = d.value >= 1000 ? `${(d.value/1000).toFixed(1)}k` : d.value;
         
         return (
           <g key={i}>
             <circle 
               cx={getX(i)} 
               cy={getY(d.value)} 
               r={data.length > 24 ? 3 : 5} 
               fill="#1e293b" 
               stroke="#3b82f6" 
               strokeWidth="2"
             />
             {showValue && (
               <text
                 x={getX(i)}
                 y={valueY}
                 fill="#94a3b8"
                 fontSize="9"
                 textAnchor="middle"
                 fontWeight="500"
               >
                 {shortVal}
               </text>
             )}
           </g>
         );
       })}
       
       {/* Labels do eixo X */}
       {xLabels.map((d, i) => {
         const originalIndex = data.findIndex(x => x === d);
         return (
           <text 
             key={i}
             x={getX(originalIndex)} 
             y={height - 15} 
             fill="#64748b" 
             fontSize="11" 
             textAnchor="middle"
           >
             {d.label}
           </text>
         );
       })}
     </svg>
     
     {/* Legenda */}
     <div className="absolute top-2 right-4 flex gap-4 text-xs">
       <div className="flex items-center gap-1">
         <div className="w-4 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded"/>
         <span className="text-slate-400">Receita</span>
       </div>
       <div className="flex items-center gap-1">
         <div className="w-4 h-0.5 bg-amber-500 rounded" style={{backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)'}}/>
         <span className="text-slate-400">Média 3m</span>
       </div>
     </div>
   </div>
 );
});


const BarChart = memo(({data, height = 220}) => {
 if (data.length === 0) return null;
 const max = Math.max(...data.map(d => (d.com||0) + (d.sem||0)), 1);
 return (
 <div className="relative" style={{height}}>
 <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
 {[0,1,2,3,4].map(i => <div key={i} className="border-t border-slate-700/30 w-full" />)}
 </div>
 <div className="absolute inset-0 flex items-end justify-around px-2 pb-6">
 {data.map((d, i) => (
 <div key={i} className="flex flex-col items-center" style={{width: `${85/data.length}%`}}>
 <div className="w-full flex flex-col justify-end" style={{height: height - 30}}>
 <div className="w-full bg-orange-500 rounded-t transition-all duration-500" style={{height: `${((d.com||0)/max)*100}%`}}/>
 <div className="w-full bg-emerald-500 rounded-b transition-all duration-500" style={{height: `${((d.sem||0)/max)*100}%`}}/>
 </div>
 </div>
 ))}
 </div>
 <div className="absolute bottom-0 left-0 right-0 flex justify-around text-xs text-slate-400">
 {data.map((d, i) => <span key={i}>{d.label}</span>)}
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
 className="font-semibold rounded-xl transition-all duration-200 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-500/25 px-4 py-2 text-sm"
 >
 + Adicionar
 </button>
 </div>
 );
});

// Draggable List Component - só arrasta pelo handle
const DraggableList = memo(({items, onReorder, renderItem, className}) => {
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
 <div className={className || "space-y-2"}>
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
  const tiposIcons = { SS: '🏛️', IVA: '💶', IRS: '📋' };
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
          <span>💳</span>
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
                <option value="SS">🏛️ SS</option>
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
const IRS_CFG_PADRAO = { conjunto: true, coef: 0.35, saraBruto: 0, saraRetencao: 0, deducoes: 500 };
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
  if (totalFerias > 0.5) passos.push({ id: 'g_revolut', para: 'Revolut', icon: '🏖️', valor: r2(totalFerias), linhas: [['Férias', r2(totalFerias)]] });
  passos.forEach(x => { if (!x.fase) x.fase = 2; if (!x.de) x.de = 'Activo'; });
  const doActivo = f => r2(passos.filter(x => x.de === 'Activo' && !x.dispensado && (f == null || x.fase === f)).reduce((s, x) => s + x.valor, 0));
  const saidas = doActivo(2);
  const porAlocar = r2(pInv - itens.reduce((s, i) => s + n(i.val), 0));
  const fica = r2(recebidoMes - doActivo());
  return { passos, saidas, fica, porAlocar, totPess: r2(totPess), valAB };
};

// ══ CALENDÁRIO FINANCEIRO ═══════════════════════════════════════════════════
// Vista de mês com tudo o que tem data: impostos (com valores previstos), prestação,
// tarefas da Agenda e a rotina do mês. Componente ao nível do módulo para não perder
// o mês e o dia escolhidos quando o resto da app muda.
const CAL_CORES = { SS: '#3b82f6', IVA: '#f59e0b', IRS: '#ef4444', Transf: '#10b981', Invest: '#8b5cf6', Contab: '#06b6d4', Seguros: '#ec4899', Casa: '#14b8a6', Rotina: '#64748b' };
const CalendarioFinanceiro = ({ eventosDoMes, theme, fmt, onToggle, anoInicial, mesInicial }) => {
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
        <h2 className="text-lg font-semibold">🗓️ Calendário</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => mudar(-1)} aria-label="Mês anterior" className={`px-2.5 py-1.5 rounded-lg ${claro ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-700/50 hover:bg-slate-600'}`}>‹</button>
          <span className="font-medium w-36 text-center">{meses[m - 1]} {y}</span>
          <button onClick={() => mudar(1)} aria-label="Mês seguinte" className={`px-2.5 py-1.5 rounded-lg ${claro ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-700/50 hover:bg-slate-600'}`}>›</button>
          {!ehMesHoje && <button onClick={irHoje} className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400">Hoje</button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {[['SS', 'Segurança Social'], ['IVA', 'IVA'], ['IRS', 'IRS'], ['Casa', 'Casa'], ['Transf', 'Transferências'], ['Invest', 'Investir'], ['Contab', 'Contabilista'], ['Rotina', 'Rotina do mês']].map(([k, l]) => (
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
            {(porDia[diaSel] || []).map(e => <Linha key={e.id} e={e} />)}
          </div>
        </div>
        <div className="space-y-3">
          {atrasados.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-400 mb-1.5">Em atraso este mês</p>
              <div className="space-y-1.5">{atrasados.map(e => <Linha key={'a' + e.id} e={e} data={`${e.dia} ${meses[hoje.getMonth()].slice(0, 3)}`} />)}</div>
            </div>
          )}
          <div>
            <p className="text-sm font-medium mb-1.5">Próximos 30 dias</p>
            {!proximos.length && <p className="text-xs text-slate-500">Nada pendente.</p>}
            <div className="space-y-1.5">
              {proximos.map(e => <Linha key={'p' + e.dt.getMonth() + e.id} e={e} data={e.dias === 0 ? 'Hoje' : e.dias === 1 ? 'Amanhã' : `${e.dt.getDate()} ${meses[e.dt.getMonth()].slice(0, 3)}`} />)}
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
  const declSS = i => (mesD(i).regCom || []).filter(r => !r.emitidoPorSara && !naoTrab.has(r.cid)).reduce((a, r) => a + rv(r), 0);
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
    // Só os recibos verdes ("COM Taxas") entram no IRS: é o que as Finanças conhecem
    const regs = (d.regCom || []).filter(x => !naoTrabalho.has(x.cid));
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
  for (let m = 1; m <= 12; m++) ((M[`${ano}-${m}`] || {}).regCom || []).forEach(x => { if (!x.emitidoPorSara && !naoTrabalho.has(x.cid)) proprioAte += rv(x); });
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
const _fmtEUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

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
const estimarImpostosRecibo = ({ valIliq = 0, retIRS = 0, coef = 0.35, taxaMarg = 43.1, comSS = false }) => {
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

// ── Tab "Venda da Casa": rasto do capital da venda até estar investido ──
// Componente ao nível do módulo (estado próprio, sem remount). Recebe G/uG por props.

export {
  StableInput, StableDateInput, SliderWithInput, PieChart, LineChart, AreaChartAllTime, BarChart, AddClienteInput,
  DraggableList, impRefAuto, PagamentosImpostos, CategoryDropdown, meses, ESCALOES_IRS, DEDUCAO_CATA, IRS_CFG_PADRAO,
  mesDoRecibo, retencaoPadrao, impNum, impIRSEscaloes, guiaTransfCalc, CAL_CORES, CalendarioFinanceiro, impCalc,
  anos, _fmtEUR, _semAcentos, BILANCE_POR_DESC, BILANCE_GRUPOS, BILANCE_GRUPO_POR_DESC, BILANCE_POR_CATEGORIA, _grupoCompleto,
  _contemPalavra, mapearCategoriaBilance, estimarImpostosRecibo, _normNome, clienteDoNome, PROCESS_INVOICE_URLS
};
