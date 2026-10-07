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

// Componente isolado para pagamentos de impostos - memo evita re-renders do pai
const PagamentosImpostos = memo(({ impostosPagos, anoAtual, theme, onAdd, onUpdate, onDelete, fmt, showToast, confirmDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const tipoRef = useRef(null);
  const direcaoRef = useRef(null);
  const dataRef = useRef(null);
  const valorRef = useRef(null);
  const refRef = useRef(null);

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
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500">Ref.</span>
              <input ref={refRef} type="text" placeholder="Jan/26"
                className={`${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'} border rounded-lg px-2 py-1.5 text-xs w-20`} />
            </div>
            <button onClick={() => {
              const tipo = tipoRef.current?.value || 'SS';
              const direcao = direcaoRef.current?.value || 'pago';
              const data = dataRef.current?.value || new Date().toISOString().split('T')[0];
              const valRaw = parseFloat(valorRef.current?.value);
              const referencia = refRef.current?.value || '';
              if (!valRaw || valRaw <= 0) { showToast('Insere um valor válido', 'warning'); return; }
              onAdd({ tipo, data, valor: direcao === 'recebido' ? -valRaw : valRaw, referencia });
              if (valorRef.current) valorRef.current.value = '';
              if (refRef.current) refRef.current.value = '';
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
                      <input type="text" defaultValue={p.referencia} placeholder="—"
                        className={`${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-400'} px-1.5 py-0.5 rounded text-[10px] w-16 text-center`}
                        onBlur={e => { if (e.target.value !== p.referencia) onUpdate(p.id, 'referencia', e.target.value); }} />
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
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
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
const DEDUCAO_CATB = 4587.09;
const COEF_SIMPL = 0.75;
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
const PROCESS_INVOICE_URLS = [
  'https://processinvoice-lwlsrb4r2q-uc.a.run.app',
  'https://us-central1-dashboard-financas-f2b55.cloudfunctions.net/processInvoice'
];

// ── Tab "Venda da Casa": rasto do capital da venda até estar investido ──
// Componente ao nível do módulo (estado próprio, sem remount). Recebe G/uG por props.

export {
  StableInput, StableDateInput, SliderWithInput, PieChart, LineChart, AreaChartAllTime, BarChart, AddClienteInput,
  DraggableList, PagamentosImpostos, CategoryDropdown, meses, ESCALOES_IRS, DEDUCAO_CATB, COEF_SIMPL, anos,
  _fmtEUR, _semAcentos, BILANCE_POR_DESC, BILANCE_GRUPOS, BILANCE_GRUPO_POR_DESC, BILANCE_POR_CATEGORIA, _grupoCompleto, _contemPalavra,
  mapearCategoriaBilance, estimarImpostosRecibo, PROCESS_INVOICE_URLS
};
