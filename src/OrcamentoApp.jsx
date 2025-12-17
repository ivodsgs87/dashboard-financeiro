import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createGoogleSheet, getAccessToken } from './firebase';

// Stable Input - COMPLETAMENTE isolado do React, nunca re-renderiza
const StableInput = memo(({type = 'text', initialValue, onSave, className, placeholder, step, tabIndex}) => {
  const inputRef = useRef(null);
  const onSaveRef = useRef(onSave);
  const initialValueRef = useRef(initialValue);
  const mountedRef = useRef(false);
  
  // Atualizar refs sem causar re-render
  onSaveRef.current = onSave;
  
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    
    let isFocused = false;
    let hasEdited = false;
    let savedValue = initialValue;
    
    // Set initial value apenas na montagem
    if (!mountedRef.current) {
      input.value = initialValue ?? '';
      mountedRef.current = true;
    }
    
    const onFocus = () => {
      isFocused = true;
      hasEdited = false;
    };
    
    const onInput = () => {
      hasEdited = true;
    };
    
    const saveValue = () => {
      if (hasEdited) {
        const val = type === 'number' ? (+input.value || 0) : input.value;
        if (val !== savedValue) {
          savedValue = val;
          onSaveRef.current(val);
        }
        hasEdited = false;
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
      } else if (e.key === 'Tab') {
        // Guardar valor antes de mover para o próximo campo
        saveValue();
        // Deixar o Tab funcionar naturalmente (não prevenir default)
      }
    };
    
    input.addEventListener('focus', onFocus);
    input.addEventListener('input', onInput);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeyDown);
    
    return () => {
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('input', onInput);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeyDown);
    };
  }, []); // Empty deps - só roda uma vez
  
  // Sync externo - apenas se valor mudou E não está focado
  useEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    
    // Só atualizar se o valor realmente mudou desde a montagem
    if (initialValue !== initialValueRef.current) {
      const timer = setTimeout(() => {
        if (document.activeElement !== input) {
          input.value = initialValue ?? '';
          initialValueRef.current = initialValue;
        }
      }, 500);
      return () => clearTimeout(timer);
    }
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
}, () => true); // NUNCA re-renderizar

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
 purple: 'accent-purple-500'
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
 onKeyPress={e => e.key === 'Enter' && handleAdd()}
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

const OrcamentoApp = ({ user, initialData, onSaveData, onLogout, syncing, lastSync }) => {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const anos = [2023,2024,2025,2026,2027,2028,2029,2030,2031,2032,2033,2034,2035,2036,2037,2038,2039,2040,2041,2042,2043,2044,2045,2046,2047,2048,2049,2050];
  
  // Mês e ano atual do sistema
  const hoje = new Date();
  const mesAtualSistema = meses[hoje.getMonth()];
  const anoAtualSistema = hoje.getFullYear();
  
  const [mes, setMes] = useState(mesAtualSistema);
  const [ano, setAno] = useState(anoAtualSistema);
  const [tab, setTab] = useState('resumo');
  const [histAno, setHistAno] = useState(anoAtualSistema);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupMode, setBackupMode] = useState('export');
  const [backupData, setBackupData] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  
  // Tema fixo escuro
  const theme = 'dark';
  
  // Estados para funcionalidades
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [compareYear, setCompareYear] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Detectar offline
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Atalhos de teclado
  const tabOrder = ['resumo','receitas','abanca','pessoais','invest','sara','historico','portfolio','credito','agenda'];
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorar se estiver a escrever num input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }
      
      // Ctrl+Z = Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo?.();
      }
      // Ctrl+Shift+Z ou Ctrl+Y = Redo
      if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        handleRedo?.();
      }
      // Ctrl+F = Pesquisa
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
      // Ctrl+P = Exportar PDF
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        exportToPDF?.();
      }
      // ? = Mostrar atalhos
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
      // 1-9 = Navegar entre tabs
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey) {
        const idx = parseInt(e.key) - 1;
        if (idx < tabOrder.length) {
          e.preventDefault();
          setTab(tabOrder[idx]);
        }
      }
      // 0 = Última tab (Agenda)
      if (e.key === '0' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setTab('agenda');
      }
      // ← → = Mês anterior/seguinte
      if (e.key === 'ArrowLeft' && !e.ctrlKey) {
        e.preventDefault();
        const idx = meses.indexOf(mes);
        if (idx > 0) setMes(meses[idx - 1]);
        else { setMes(meses[11]); setAno(a => a - 1); }
      }
      if (e.key === 'ArrowRight' && !e.ctrlKey) {
        e.preventDefault();
        const idx = meses.indexOf(mes);
        if (idx < 11) setMes(meses[idx + 1]);
        else { setMes(meses[0]); setAno(a => a + 1); }
      }
      // Escape = Fechar modais
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowAlerts(false);
        setShowImportCSV(false);
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mes, ano]);
  
  const mesKey = `${ano}-${meses.indexOf(mes)+1}`;
  const cats = ['Habitação','Utilidades','Alimentação','Saúde','Lazer','Transporte','Subscrições','Bancário','Serviços','Vários','Outros','Seguros'];
  
  // Verificar se é o mês/ano atual
  const isMesAtual = (m, a) => m === mesAtualSistema && a === anoAtualSistema;

  const defG = {
    clientes: [{id:1,nome:'Marius',cor:'#3b82f6'},{id:2,nome:'Sophie',cor:'#ec4899'}],
    taxa: 38, contrib: 50, alocAmort: 75, ferias: 130,
    despABanca: [{id:1,desc:'Prestação Casa',cat:'Habitação',val:971},{id:2,desc:'Seguro Propriedade',cat:'Habitação',val:16},{id:3,desc:'Seguro Vida',cat:'Habitação',val:36},{id:4,desc:'Água/Luz',cat:'Utilidades',val:200},{id:5,desc:'Mercado',cat:'Alimentação',val:714},{id:6,desc:'Internet',cat:'Utilidades',val:43},{id:7,desc:'Condomínio',cat:'Habitação',val:59},{id:8,desc:'Manutenção Conta',cat:'Bancário',val:5},{id:9,desc:'Bar/Café',cat:'Lazer',val:50},{id:10,desc:'Empregada',cat:'Serviços',val:175},{id:11,desc:'Escola Laura',cat:'Outros',val:120},{id:12,desc:'Ginástica',cat:'Outros',val:45},{id:13,desc:'Seguro filhos',cat:'Seguros',val:60}],
    despPess: [{id:1,desc:'Telemóvel',cat:'Utilidades',val:14},{id:2,desc:'Carro',cat:'Transporte',val:30},{id:3,desc:'Prendas/Lazer',cat:'Vários',val:400},{id:4,desc:'Subscrições',cat:'Subscrições',val:47},{id:5,desc:'Crossfit',cat:'Saúde',val:85},{id:6,desc:'Bar/Café',cat:'Alimentação',val:100}],
    catsInv: ['ETF','PPR','P2P','CRIPTO','FE','CREDITO'],
    sara: {
      rend: [{id:1,desc:'Flex anual',val:1131},{id:2,desc:'Cartão Refeição',val:224,isCR:true},{id:3,desc:'Salário',val:1360}],
      desp: [{id:1,desc:'Seguro Carro',val:60.39},{id:2,desc:'Carro',val:720},{id:3,desc:'Crossfit',val:89},{id:4,desc:'Seguro Sara',val:20},{id:5,desc:'Disney Plus',val:15},{id:6,desc:'Google',val:2},{id:7,desc:'Despesas extra',val:200}],
      aloc: [{id:1,desc:'Emergência',val:230,cor:'#3b82f6'},{id:2,desc:'ETF',val:100,cor:'#8b5cf6'},{id:3,desc:'Férias',val:130,cor:'#f59e0b'},{id:4,desc:'Amortização',val:130,cor:'#10b981'}]
    },
    portfolioHist: [],
    patrimonioHist: [],
    metas: { receitas: 80000, amortizacao: 15000, investimentos: 12000 },
    // Projetos para o calendário
    projetos: [], // {id, nome, clienteId, dataInicio, dataFim, cor, concluido}
    alertas: [
      {id:1, tipo: 'despesa', campo: 'despPess', limite: 800, ativo: true, desc: 'Despesas pessoais > €800'},
      {id:2, tipo: 'meta', campo: 'receitas', percentagem: 80, ativo: true, desc: 'Receitas < 80% da meta'},
      {id:3, tipo: 'poupanca', limite: 20, ativo: true, desc: 'Taxa poupança < 20%'}
    ],
    // Tarefas financeiras recorrentes
    tarefas: [
      // MENSAIS
      {id:1, desc:'Verificar e validar faturas no e-Fatura', dia:10, freq:'mensal', cat:'IVA', ativo:true},
      {id:2, desc:'Pagar Segurança Social', dia:20, freq:'mensal', cat:'SS', ativo:true},
      {id:3, desc:'Fazer transferências (Casal, Pessoais, Férias)', dia:25, freq:'mensal', cat:'Transf', ativo:true},
      {id:4, desc:'Investir e amortizar crédito', dia:28, freq:'mensal', cat:'Invest', ativo:true},
      // ENVIAR FATURAS AO CONTABILISTA
      {id:5, desc:'ENVIAR FATURAS AO CONTABILISTA', dia:10, freq:'anual', meses:[2], cat:'Contab', ativo:true},
      {id:6, desc:'ENVIAR FATURAS AO CONTABILISTA', dia:10, freq:'anual', meses:[5], cat:'Contab', ativo:true},
      {id:7, desc:'ENVIAR FATURAS AO CONTABILISTA', dia:10, freq:'anual', meses:[8], cat:'Contab', ativo:true},
      {id:8, desc:'ENVIAR FATURAS AO CONTABILISTA', dia:10, freq:'anual', meses:[11], cat:'Contab', ativo:true},
      // SS TRIMESTRAL
      {id:10, desc:'Declaração trimestral SS (jan-mar)', dia:30, freq:'anual', meses:[4], cat:'SS', ativo:true},
      {id:11, desc:'Declaração trimestral SS (abr-jun)', dia:31, freq:'anual', meses:[7], cat:'SS', ativo:true},
      {id:12, desc:'Declaração trimestral SS (jul-set)', dia:31, freq:'anual', meses:[10], cat:'SS', ativo:true},
      {id:13, desc:'Declaração trimestral SS (out-dez)', dia:31, freq:'anual', meses:[1], cat:'SS', ativo:true},
      // IVA TRIMESTRAL
      {id:20, desc:'Entregar declaração IVA (1º trim)', dia:20, freq:'anual', meses:[5], cat:'IVA', ativo:true},
      {id:21, desc:'Pagar IVA (1º trimestre)', dia:25, freq:'anual', meses:[5], cat:'IVA', ativo:true},
      {id:22, desc:'Entregar declaração IVA (2º trim)', dia:20, freq:'anual', meses:[8], cat:'IVA', ativo:true},
      {id:23, desc:'Pagar IVA (2º trimestre)', dia:25, freq:'anual', meses:[8], cat:'IVA', ativo:true},
      {id:24, desc:'Entregar declaração IVA (3º trim)', dia:20, freq:'anual', meses:[11], cat:'IVA', ativo:true},
      {id:25, desc:'Pagar IVA (3º trimestre)', dia:25, freq:'anual', meses:[11], cat:'IVA', ativo:true},
      {id:26, desc:'Entregar declaração IVA (4º trim)', dia:20, freq:'anual', meses:[2], cat:'IVA', ativo:true},
      {id:27, desc:'Pagar IVA (4º trimestre)', dia:25, freq:'anual', meses:[2], cat:'IVA', ativo:true},
      // IRS ANUAL
      {id:30, desc:'Data limite validar faturas e-Fatura (IRS)', dia:25, freq:'anual', meses:[2], cat:'IRS', ativo:true},
      {id:31, desc:'Início entrega IRS', dia:1, freq:'anual', meses:[4], cat:'IRS', ativo:true},
      {id:32, desc:'Prazo final entrega IRS', dia:30, freq:'anual', meses:[6], cat:'IRS', ativo:true},
      {id:33, desc:'Pagamento IRS (se aplicável)', dia:31, freq:'anual', meses:[7], cat:'IRS', ativo:true}
    ],
    tarefasConcluidas: {}, // {'2025-12-1': true, '2025-12-2': true}
    credito: {
      valorCasa: 365000,
      entradaInicial: 36500,
      montanteInicial: 328500,
      dividaAtual: 229693.43,
      taxaJuro: 2,
      prestacao: 971,
      seguros: 50,
      dataFim: '2054-02-01',
      spread: 1.0,
      euribor: 2.5,
      historico: [{date: '2022-01', divida: 328500}, {date: '2025-12', divida: 229693.43}],
      amortizacoesPlaneadas: []
    }
  };

  const defM = {regCom:[],regSem:[],inv:[{id:1,desc:'Trade Republic',cat:'ETF',val:0,done:false},{id:2,desc:'Degiro',cat:'ETF',val:0,done:false},{id:3,desc:'PPR',cat:'PPR',val:0,done:false},{id:4,desc:'Cripto',cat:'CRIPTO',val:0,done:false},{id:5,desc:'P2P',cat:'P2P',val:0,done:false},{id:6,desc:'Amortização Extra',cat:'CREDITO',val:0,done:false}],transf:{abanca:false,activo:false,trade:false,revolut:false},portfolio:[{id:1,desc:'Trade Republic',cat:'ETF',val:0},{id:2,desc:'Degiro',cat:'ETF',val:0},{id:3,desc:'PPR',cat:'PPR',val:0},{id:4,desc:'Cripto',cat:'CRIPTO',val:0},{id:5,desc:'P2P',cat:'P2P',val:0},{id:6,desc:'Fundo Emergência',cat:'FE',val:0},{id:7,desc:'Amortização Acumulada',cat:'CREDITO',val:0}]};

  // Inicializar estado com dados do Firebase ou defaults
  const [G, setG] = useState(defG);
  const [M, setM] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const saveTimeoutRef = useRef(null);
  const isSavingRef = useRef(false);
  
  // Sistema de Undo - guarda últimos 20 estados
  const [undoHistory, setUndoHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);
  const lastSavedState = useRef(null);
  
  // Função Undo
  const handleUndo = useCallback(() => {
    if (undoHistory.length === 0) return;
    
    const prevState = undoHistory[undoHistory.length - 1];
    setRedoHistory(prev => [...prev, { g: JSON.parse(JSON.stringify(G)), m: JSON.parse(JSON.stringify(M)) }]);
    setUndoHistory(prev => prev.slice(0, -1));
    setG(prevState.g);
    setM(prevState.m);
    lastSavedState.current = JSON.stringify(prevState);
  }, [undoHistory, G, M]);
  
  // Função Redo
  const handleRedo = useCallback(() => {
    if (redoHistory.length === 0) return;
    
    const nextState = redoHistory[redoHistory.length - 1];
    setUndoHistory(prev => [...prev, { g: JSON.parse(JSON.stringify(G)), m: JSON.parse(JSON.stringify(M)) }]);
    setRedoHistory(prev => prev.slice(0, -1));
    setG(nextState.g);
    setM(nextState.m);
    lastSavedState.current = JSON.stringify(nextState);
  }, [redoHistory, G, M]);

  // Carregar dados do Firebase UMA VEZ quando initialData chegar
  useEffect(() => {
    if (dataLoaded) return; // Já carregou, não fazer mais nada
    
    if (initialData) {
      console.log('Carregando dados do Firebase...');
      if (initialData.g) setG(initialData.g);
      if (initialData.m) setM(initialData.m);
      setDataLoaded(true);
    } else if (initialData === null) {
      // Utilizador novo, sem dados - usar defaults
      console.log('Utilizador novo, usando defaults');
      setDataLoaded(true);
    }
    // Se initialData === undefined, ainda está a carregar
  }, [initialData, dataLoaded]);

  // Auto-save para Firebase (com debounce de 3 segundos)
  useEffect(() => {
    if (!dataLoaded) return;
    if (isSavingRef.current) return;
    
    setHasChanges(true);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      console.log('Guardando dados...');
      isSavingRef.current = true;
      try {
        await onSaveData({ g: G, m: M });
        setHasChanges(false);
        console.log('Dados guardados!');
      } catch (e) {
        console.error('Erro ao guardar:', e);
      }
      isSavingRef.current = false;
    }, 5000); // 5 segundos de debounce
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [G, M, dataLoaded]);

 // Função para obter o mês anterior
 const getMesAnteriorKey = (currentKey) => {
 const [a, m] = currentKey.split('-').map(Number);
 if (m === 1) return `${a-1}-12`;
 return `${a}-${m-1}`;
 };

 // Obter portfolio do mês atual, ou copiar do mês anterior se não existir
 const getPortfolioParaMes = useCallback((key) => {
 if (M[key]?.portfolio) return M[key].portfolio;
 
 // Procurar no mês anterior
 let checkKey = getMesAnteriorKey(key);
 let tentativas = 12; // máximo 12 meses para trás
 while (tentativas > 0) {
 if (M[checkKey]?.portfolio) return M[checkKey].portfolio;
 checkKey = getMesAnteriorKey(checkKey);
 tentativas--;
 }
 
 // Se não encontrar, usar default
 return defM.portfolio;
 }, [M]);

 const mesD = M[mesKey] || defM;
  const portfolio = mesD.portfolio || getPortfolioParaMes(mesKey);
  
  const mesKeyRef = useRef(mesKey);
  
  useEffect(() => {
    mesKeyRef.current = mesKey;
  }, [mesKey]);

 // Atualiza automaticamente o portfolioHist quando o portfolio do mês muda
 useEffect(() => {
 if (mesD.portfolio) {
 const totPort = mesD.portfolio.reduce((a,p) => a + p.val, 0);
 const hist = G.portfolioHist || [];
 const existingIdx = hist.findIndex(h => h.date === mesKey);
 
 let newHist;
 if (existingIdx >= 0) {
 if (hist[existingIdx].total !== totPort) {
 newHist = hist.map((h, i) => i === existingIdx ? {...h, total: totPort} : h);
 }
 } else if (totPort > 0) {
 newHist = [...hist, {date: mesKey, total: totPort}].sort((a,b) => {
 const [aY,aM] = a.date.split('-').map(Number);
 const [bY,bM] = b.date.split('-').map(Number);
 return aY === bY ? aM - bM : aY - bY;
 });
 }
 
 if (newHist) {
 setG(p => ({...p, portfolioHist: newHist}));
 }
 }
 }, [mesD.portfolio, mesKey]);

 // Funções de update que guardam estado para undo ANTES de alterar
 const saveUndo = useCallback(() => {
   setUndoHistory(prev => [...prev, { g: JSON.parse(JSON.stringify(G)), m: JSON.parse(JSON.stringify(M)) }].slice(-20));
   setRedoHistory([]);
 }, [G, M]);

 const uM = useCallback((f, v) => {
   saveUndo();
   setM(p => ({...p, [mesKey]: {...(p[mesKey]||defM), [f]:v}}));
 }, [mesKey, saveUndo]);
 
 const uG = useCallback((f,v) => {
   saveUndo();
   setG(p => ({...p, [f]:v}));
 }, [saveUndo]);
 
 const uS = useCallback((f,v) => {
   saveUndo();
   setG(p => ({...p, sara:{...p.sara, [f]:v}}));
 }, [saveUndo]);
 
 const uC = useCallback((f,v) => {
   saveUndo();
   setG(p => ({...p, credito:{...p.credito, [f]:v}}));
 }, [saveUndo]);

 const uMeta = useCallback((key, v) => {
   saveUndo();
   setG(p => ({...p, metas: {...p.metas, [key]: v}}));
 }, [saveUndo]);

 const uPortHist = useCallback((newHist, detail) => {
   saveUndo();
   setG(p => ({...p, portfolioHist: newHist, portfolioDetail: detail || p.portfolioDetail}));
 }, [saveUndo]);

 // Função para aplicar investimentos do mês atual aos meses futuros
 const aplicarInvFuturos = useCallback(() => {
   saveUndo();
   const mesAtualIdx = meses.indexOf(mes);
   const invAtuais = M[mesKey]?.inv || defM.inv;
   setM(prev => {
     const newM = {...prev};
     for (let i = mesAtualIdx + 1; i < 12; i++) {
       const k = `${ano}-${i + 1}`;
       newM[k] = {...(newM[k] || defM), inv: invAtuais.map(x => ({...x, done: false}))};
     }
     for (let i = 0; i < 12; i++) {
       const k = `${ano + 1}-${i + 1}`;
       newM[k] = {...(newM[k] || defM), inv: invAtuais.map(x => ({...x, done: false}))};
     }
     return newM;
   });
   alert(`✅ Investimentos aplicados até Dezembro ${ano + 1}`);
 }, [mes, ano, mesKey, M, meses]);

 // Função para duplicar receitas do mês anterior
 const duplicarMesAnterior = useCallback(() => {
   const mesAnteriorKey = getMesAnteriorKey(mesKey);
   const mesAnteriorData = M[mesAnteriorKey];
   if (!mesAnteriorData || (mesAnteriorData.regCom?.length === 0 && mesAnteriorData.regSem?.length === 0)) {
     alert('⚠️ O mês anterior não tem receitas para duplicar');
     return;
   }
   saveUndo();
   const novasRegCom = mesAnteriorData.regCom?.map(r => ({...r, id: Date.now() + Math.random(), data: new Date().toISOString().split('T')[0]})) || [];
   const novasRegSem = mesAnteriorData.regSem?.map(r => ({...r, id: Date.now() + Math.random(), data: new Date().toISOString().split('T')[0]})) || [];
   setM(prev => ({
     ...prev,
     [mesKey]: {
       ...(prev[mesKey] || defM),
       regCom: [...(prev[mesKey]?.regCom || []), ...novasRegCom],
       regSem: [...(prev[mesKey]?.regSem || []), ...novasRegSem]
     }
   }));
   alert(`✅ ${novasRegCom.length + novasRegSem.length} receitas duplicadas do mês anterior`);
 }, [mesKey, M, getMesAnteriorKey, saveUndo]);

 const {clientes,taxa,contrib,alocAmort,ferias,despABanca,despPess,catsInv=defG.catsInv,sara,portfolioHist=[],metas=defG.metas,credito=defG.credito} = G;
 const {regCom,regSem,inv,transf} = mesD;

 const inCom = regCom.reduce((a,r)=>a+r.val,0);
 const inSem = regSem.reduce((a,r)=>a+r.val,0);
 const totRec = inCom + inSem;
 const valTax = inCom * (taxa/100);
 const recLiq = totRec - valTax;
 const totAB = despABanca.reduce((a,d)=>a+d.val,0);
 const minhaAB = totAB * (contrib/100);
 const parteSaraAB = totAB * (1-contrib/100);
 const segFilhos = despABanca.find(d=>d.desc.toLowerCase().includes('seguro filhos'))?.val || 60;
 const totPess = despPess.reduce((a,d)=>a+d.val,0);
 const totInv = inv.reduce((a,d)=>a+d.val,0);
 const restante = recLiq - minhaAB - totPess - ferias;
 const transfTR = minhaAB + totPess + valTax;
 const totSaraR = sara.rend.reduce((a,r)=>a+r.val,0);
 const cartaoRef = sara.rend.find(r=>r.isCR)?.val || 0;
 const contribSaraAB = parteSaraAB - cartaoRef - segFilhos;
 const totSaraD = sara.desp.reduce((a,d)=>a+d.val,0);
 const sobraSara = totSaraR - totSaraD - contribSaraAB;
 const totPort = portfolio.reduce((a,p)=>a+p.val,0);

 const fmt = v => new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(v);
 const fmtP = v => Math.round(v)+'%';

 const getHist = useCallback(() => {
 const h = [];
 Object.keys(M).forEach(k => {
 const [a,m] = k.split('-');
 const d = M[k];
 const c = d.regCom?.reduce((acc,r)=>acc+r.val,0)||0;
 const s = d.regSem?.reduce((acc,r)=>acc+r.val,0)||0;
 if(c>0||s>0) h.push({k,ano:+a,mes:+m,nome:meses[+m-1],com:c,sem:s,tot:c+s});
 });
 return h.sort((a,b)=>a.ano===b.ano?a.mes-b.mes:a.ano-b.ano);
 }, [M]);

 const catCoresInv = {'ETF':'#3b82f6','PPR':'#f59e0b','P2P':'#ec4899','CRIPTO':'#14b8a6','FE':'#10b981','CREDITO':'#ef4444'};

 // UI Components
  const Card = ({children, className = ''}) => <div className={`${theme === 'light' ? 'bg-white/80 border-slate-200 shadow-sm' : 'bg-slate-800/50 border-slate-700/50'} backdrop-blur-sm rounded-xl sm:rounded-2xl border p-3 sm:p-5 ${className}`}>{children}</div>;
  const StatCard = ({label, value, color = '', sub, icon}) => <Card className="p-3 sm:p-4"><p className={`${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} text-xs font-medium mb-1`}>{icon} {label}</p><p className={`text-lg sm:text-xl font-bold ${color || (theme === 'light' ? 'text-slate-900' : 'text-white')}`}>{value}</p>{sub && <p className={`${theme === 'light' ? 'text-slate-400' : 'text-slate-500'} text-xs mt-1 truncate`}>{sub}</p>}</Card>;
 const Button = ({children, onClick, variant = 'primary', size = 'md', disabled = false}) => {
 const base = 'font-semibold rounded-xl transition-all duration-200 ';
 const variants = {primary: 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-500/25', secondary: 'bg-slate-700 hover:bg-slate-600 text-white', danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400'};
    const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
 return <button onClick={onClick} disabled={disabled} className={base + variants[variant] + ' ' + sizes[size] + (disabled ? ' opacity-50 cursor-not-allowed' : '')}>{children}</button>;
 };
  const Select = ({children, className = '', ...props}) => <select className={`${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-slate-700/50 border-slate-600 text-white'} border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer ${className}`} {...props}>{children}</select>;
 const ProgressBar = ({value, max, color = '#3b82f6', height = 'h-2'}) => <div className={`w-full ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700/50'} rounded-full overflow-hidden ${height}`}><div className="h-full rounded-full transition-all duration-500" style={{width: `${Math.min((value/max)*100, 100)}%`, background: color}}/></div>;
 const Row = ({children, highlight}) => <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl transition-all ${highlight ? 'bg-green-500/10 border border-green-500/30' : theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-700/30 hover:bg-slate-700/50'}`}>{children}</div>;
  const inputClass = theme === 'light' 
    ? "bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
    : "bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50";
  
  // Classes auxiliares para tema
  const cardBg = theme === 'light' ? 'bg-slate-100' : 'bg-slate-700/30';
  const cardBgHover = theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-700/30 hover:bg-slate-700/50';
  const textMuted = theme === 'light' ? 'text-slate-600' : 'text-slate-400';

 // Calcular totais anuais para metas
 const calcularTotaisAnuais = useCallback(() => {
   let receitasAnuais = 0;
   let investimentosAnuais = 0;
   const receitasPorCliente = {};
   
   // Inicializar clientes
   clientes.forEach(c => { receitasPorCliente[c.id] = { nome: c.nome, cor: c.cor, total: 0 }; });
   
   for (let i = 1; i <= 12; i++) {
     const k = `${ano}-${i}`;
     const mesData = M[k] || {};
     const mCom = mesData.regCom?.reduce((a, r) => a + r.val, 0) || 0;
     const mSem = mesData.regSem?.reduce((a, r) => a + r.val, 0) || 0;
     receitasAnuais += mCom + mSem;
     
     // Receitas por cliente
     mesData.regCom?.forEach(r => { if (receitasPorCliente[r.cid]) receitasPorCliente[r.cid].total += r.val; });
     mesData.regSem?.forEach(r => { if (receitasPorCliente[r.cid]) receitasPorCliente[r.cid].total += r.val; });
     
     // Investimentos do mês (exceto CREDITO)
     const invMes = mesData.inv?.filter(i => i.cat !== 'CREDITO').reduce((a, i) => a + i.val, 0) || 0;
     investimentosAnuais += invMes;
   }
   
   // Amortização = valor do portfolio em CREDITO (acumulado)
   const portfolioAtual = M[mesKey]?.portfolio || [];
   const amortizacaoAnual = portfolioAtual.filter(p => p.cat === 'CREDITO').reduce((a, p) => a + p.val, 0);
   
   return { receitasAnuais, amortizacaoAnual, investimentosAnuais, receitasPorCliente };
 }, [ano, M, mesKey, clientes]);

 const totaisAnuais = calcularTotaisAnuais();
 const mesAtualNum = meses.indexOf(mesAtualSistema) + 1;
 const progressoEsperado = mesAtualNum / 12;

 // RESUMO
 const Resumo = () => {
 const porCli = clientes.map(c=>({...c,tot:regCom.filter(r=>r.cid===c.id).reduce((a,r)=>a+r.val,0)+regSem.filter(r=>r.cid===c.id).reduce((a,r)=>a+r.val,0)})).filter(c=>c.tot>0);
 const ultReg = [...regCom.map(r=>({...r,tipo:'com'})),...regSem.map(r=>({...r,tipo:'sem'}))].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,5);
 const projecao = getProjecaoAnual();
 const previsaoIRS = getPrevisaoIRS();
 const compDespesas = getComparacaoDespesas();
 const patrimonio = getPatrimonioLiquido();
 const tarefasPend = getTarefasPendentes();
 
 return (<div key={mesKey} className="space-y-6">
 
 {/* PRÓXIMAS DATAS FISCAIS - SEMPRE VISÍVEL */}
 <Card>
   <div className="flex justify-between items-center mb-3">
     <h3 className="font-semibold">📅 Próximas Datas Fiscais</h3>
     <button onClick={() => setTab('agenda')} className="text-xs text-blue-400 hover:text-blue-300">Ver tudo →</button>
   </div>
   {tarefasPend.atrasadas.length > 0 && (
     <div className="p-2 mb-3 bg-red-500/10 border border-red-500/30 rounded-lg cursor-pointer hover:bg-red-500/20" onClick={() => setTab('agenda')}>
       <p className="text-sm text-red-400 font-medium">⚠️ {tarefasPend.atrasadas.length} tarefa(s) atrasada(s)!</p>
     </div>
   )}
   <div className="space-y-2">
     {(tarefasPend.proximasTarefas || []).slice(0, 3).map((t, i) => {
       const catCores = {'IVA':'#f59e0b','SS':'#3b82f6','IRS':'#ef4444','Transf':'#10b981','Invest':'#8b5cf6','Seguros':'#ec4899','Contab':'#06b6d4'};
       const diasAte = Math.ceil((t.data - new Date()) / (1000*60*60*24));
       const descComMes = (t.cat === 'Invest' || t.cat === 'Transf') ? `${t.desc} (${t.mesNome})` : t.desc;
       return (
         <div key={i} onClick={() => setTab('agenda')} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg text-sm cursor-pointer hover:bg-slate-700/50 transition-colors">
           <span className={`w-14 text-xs flex-shrink-0 ${diasAte <= 3 ? 'text-orange-400 font-medium' : 'text-slate-500'}`}>
             {t.dia} {t.mesNome?.slice(0,3)}
           </span>
           <span className="flex-1 truncate">{descComMes}</span>
           <span className="px-1.5 py-0.5 text-xs rounded flex-shrink-0" style={{background: `${catCores[t.cat] || '#64748b'}20`, color: catCores[t.cat] || '#64748b'}}>{t.cat}</span>
           {diasAte <= 5 && <span className="text-xs text-orange-400 flex-shrink-0">{diasAte}d</span>}
         </div>
       );
     })}
     {(!tarefasPend.proximasTarefas || tarefasPend.proximasTarefas.length === 0) && (
       <p className="text-center text-slate-500 text-sm py-2">Sem tarefas próximas</p>
     )}
   </div>
 </Card>
 
 {/* ESTATÍSTICAS DO MÊS */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
   <StatCard label="Receita Bruta" value={fmt(totRec)} color="text-white" sub={`Líquido: ${fmt(recLiq)}`} icon="💰"/>
   <StatCard label="Reserva Taxas" value={fmt(valTax)} color="text-orange-400" sub={`${fmtP(taxa)} para IRS`} icon="📋"/>
   <StatCard label="Taxa Poupança" value={`${taxaPoupanca.toFixed(1)}%`} color={taxaPoupanca >= 20 ? "text-emerald-400" : "text-orange-400"} sub={taxaPoupanca >= 20 ? "✓ Bom" : "Meta: 20%"} icon="🐷"/>
   <StatCard label="Disponível" value={fmt(restante)} color={restante >= 0 ? "text-blue-400" : "text-red-400"} sub="Investir/amortizar" icon="🎯"/>
 </div>

 {/* PATRIMÓNIO + IRS */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
   <Card>
     <div className="flex justify-between items-center mb-3">
       <h3 className="font-semibold">💎 Património Líquido</h3>
       <span className="text-xl font-bold text-emerald-400">{fmt(patrimonio.total)}</span>
     </div>
     <div className="grid grid-cols-2 gap-2 text-sm">
       <div className="p-2 bg-blue-500/10 rounded-lg flex justify-between">
         <span className="text-slate-400">Portfolio</span>
         <span className="font-semibold text-blue-400">{fmt(patrimonio.portfolio)}</span>
       </div>
       <div className="p-2 bg-purple-500/10 rounded-lg flex justify-between">
         <span className="text-slate-400">Casa líq.</span>
         <span className="font-semibold text-purple-400">{fmt(patrimonio.casaLiquida)}</span>
       </div>
     </div>
   </Card>
   
   <Card>
     <div className="flex justify-between items-center mb-3">
       <h3 className="font-semibold">📊 Previsão IRS {anoAtualSistema}</h3>
       <span className={`text-xl font-bold ${previsaoIRS.aPagarReceber >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
         {previsaoIRS.aPagarReceber >= 0 ? 'Receber ' : 'Pagar '}{fmt(Math.abs(previsaoIRS.aPagarReceber))}
       </span>
     </div>
     <div className="grid grid-cols-3 gap-2 text-sm">
       <div className="p-2 bg-slate-700/30 rounded-lg text-center">
         <p className="text-xs text-slate-500">IRS Est.</p>
         <p className="font-semibold text-orange-400">{fmt(previsaoIRS.impostoEstimado)}</p>
       </div>
       <div className="p-2 bg-slate-700/30 rounded-lg text-center">
         <p className="text-xs text-slate-500">Retido</p>
         <p className="font-semibold text-blue-400">{fmt(previsaoIRS.retencoes)}</p>
       </div>
       <div className="p-2 bg-slate-700/30 rounded-lg text-center">
         <p className="text-xs text-slate-500">Taxa</p>
         <p className="font-semibold">{previsaoIRS.taxaEfetiva.toFixed(1)}%</p>
       </div>
     </div>
   </Card>
 </div>

 {/* METAS ANUAIS */}
 <Card>
   <div className="flex justify-between items-center mb-4">
     <h3 className="font-semibold">🎯 Progresso {ano}</h3>
     <span className="text-xs text-slate-500">{mesAtualNum}/12 meses</span>
   </div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
     {[
       { label: '💰 Receitas', atual: totaisAnuais.receitasAnuais, meta: metas.receitas, key: 'receitas', color: '#3b82f6', proj: projecao?.projecao },
       { label: '📈 Investimentos', atual: totaisAnuais.investimentosAnuais, meta: metas.investimentos, key: 'investimentos', color: '#8b5cf6' }
     ].map(m => {
       const pct = m.meta > 0 ? (m.atual / m.meta) * 100 : 0;
       const onTrack = m.atual >= m.meta * progressoEsperado;
       return (
         <div key={m.key} className="p-3 bg-slate-700/30 rounded-xl">
           <div className="flex justify-between items-center mb-2">
             <span className="text-sm font-medium">{m.label}</span>
             <span className={`text-xs px-2 py-0.5 rounded-full ${onTrack ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
               {onTrack ? '✓' : '⚠️'} {pct.toFixed(0)}%
             </span>
           </div>
           <div className="flex items-baseline gap-2 mb-2">
             <span className="text-lg font-bold" style={{color: m.color}}>{fmt(m.atual)}</span>
             <span className="text-sm text-slate-500">/ {fmt(m.meta)}</span>
             {m.proj && <span className="text-xs text-slate-400 ml-auto">→ {fmt(m.proj)}</span>}
           </div>
           <ProgressBar value={m.atual} max={m.meta || 1} color={m.color} height="h-1.5"/>
           <div className="mt-2 flex items-center gap-2">
             <span className="text-xs text-slate-500">Meta:</span>
             <StableInput type="number" className="w-20 bg-slate-600/50 border border-slate-500/50 rounded px-2 py-0.5 text-xs text-right" initialValue={m.meta} onSave={v => uMeta(m.key, v)}/>
           </div>
         </div>
       );
     })}
   </div>
 </Card>

 {/* COMPARAÇÃO + CLIENTES */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
   <Card>
     <h3 className="font-semibold mb-3">📈 vs {compDespesas.mesAnterior}</h3>
     <div className="space-y-2">
       {[{label: 'Receitas', ...compDespesas.receitas, icon: '💰'},{label: 'Investimentos', ...compDespesas.investimentos, icon: '📈'}].map(item => (
         <div key={item.label} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg">
           <span className="text-sm text-slate-400">{item.icon} {item.label}</span>
           <div className="flex items-center gap-2">
             <span className="font-semibold">{fmt(item.atual)}</span>
             {item.diff !== 0 && (
               <span className={`text-xs px-1.5 py-0.5 rounded ${item.diff > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                 {item.diff > 0 ? '+' : ''}{fmt(item.diff)}
               </span>
             )}
           </div>
         </div>
       ))}
     </div>
   </Card>

   {Object.values(totaisAnuais.receitasPorCliente).some(c => c.total > 0) && (
   <Card>
     <h3 className="font-semibold mb-3">👥 Clientes {ano}</h3>
     <div className="space-y-2">
       {Object.values(totaisAnuais.receitasPorCliente).filter(c => c.total > 0).sort((a,b) => b.total - a.total).slice(0,4).map((c, i) => (
         <div key={i} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg" style={{borderLeft: `3px solid ${c.cor}`}}>
           <span className="text-sm">{c.nome}</span>
           <div className="flex items-center gap-2">
             <span className="text-xs text-slate-500">{((c.total / totaisAnuais.receitasAnuais) * 100).toFixed(0)}%</span>
             <span className="font-semibold">{fmt(c.total)}</span>
           </div>
         </div>
       ))}
     </div>
   </Card>
   )}
 </div>

 {/* DISTRIBUIÇÃO + TRANSFERÊNCIAS */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
   <Card>
     <h3 className="font-semibold mb-3">📊 Distribuição Mensal</h3>
     <div className="flex items-center gap-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-3">
       <span>🏖️</span>
       <span className="flex-1 text-sm">Férias</span>
       <StableInput type="number" className={`w-20 ${inputClass} text-amber-400 font-bold text-right`} initialValue={ferias} onSave={v=>uG('ferias',v)}/>
       <span className="text-slate-400 text-sm">€</span>
     </div>
     <div className="space-y-2">
       {[{l:'Despesas Casal',v:minhaAB,c:'#ec4899'},{l:'Despesas Pessoais',v:totPess,c:'#3b82f6'},{l:`Amortização (${fmtP(alocAmort)})`,v:restante*(alocAmort/100),c:'#10b981'},{l:`Investir (${fmtP(100-alocAmort)})`,v:restante*((100-alocAmort)/100),c:'#8b5cf6'}].map((i,k) => (
         <div key={k}>
           <div className="flex justify-between mb-1 text-sm"><span className="text-slate-400">{i.l}</span><span className="font-semibold" style={{color: i.c}}>{fmt(i.v)}</span></div>
           <ProgressBar value={Math.abs(i.v)} max={recLiq || 1} color={i.c} height="h-1"/>
         </div>
       ))}
     </div>
   </Card>

   <Card>
     <h3 className="font-semibold mb-3">💸 Transferências</h3>
     <div className="space-y-2">
       {[{l:'Despesas Casal',s:'Dia 25',v:minhaAB,k:'abanca'},{l:'Pessoais',s:'Dia 25',v:totPess,k:'activo'},{l:'Trade Republic',s:'Dia 31',v:transfTR,k:'trade'},{l:'Férias',s:'Dia 31',v:ferias,k:'revolut'}].map(t => (
         <div key={t.k} className={`flex items-center gap-2 p-2 rounded-lg ${transf[t.k] ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-700/30'}`}>
           <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={transf[t.k]} onChange={e=>uM('transf',{...transf,[t.k]:e.target.checked})}/>
           <div className="flex-1"><p className="text-sm">{t.l}</p><p className="text-xs text-slate-500">{t.s}</p></div>
           <span className="font-bold">{fmt(t.v)}</span>
         </div>
       ))}
     </div>
   </Card>
 </div>

 {ultReg.length > 0 && (
 <Card>
   <h3 className="font-semibold mb-3">📝 Últimos Registos</h3>
   <div className="space-y-1">
     {ultReg.map((r,i) => {
       const cli = clientes.find(c=>c.id===r.cid);
       return (
         <div key={i} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg text-sm" style={{borderLeft: `3px solid ${r.tipo==='com'?'#f97316':'#10b981'}`}}>
           <span className="text-xs text-slate-500 w-12">{new Date(r.data).toLocaleDateString('pt-PT',{day:'2-digit',month:'short'})}</span>
           <span className="w-14" style={{color: cli?.cor}}>{cli?.nome || '-'}</span>
           <span className="flex-1 text-slate-300 truncate">{r.desc || '-'}</span>
           <span className="font-semibold" style={{color: r.tipo==='com'?'#f97316':'#10b981'}}>{fmt(r.val)}</span>
         </div>
       );
     })}
   </div>
 </Card>
 )}
 </div>);
 };

 // RECEITAS
 const Receitas = () => (
 <div className="space-y-6">
 <Card>
 <h3 className="text-lg font-semibold mb-4">👥 Clientes</h3>
 <AddClienteInput 
 inputClass={inputClass}
 onAdd={(nome) => uG('clientes', [...clientes, {id: Date.now(), nome, cor: ['#3b82f6','#ec4899','#10b981','#f97316','#8b5cf6'][clientes.length % 5]}])}
 />
 <div className="flex flex-wrap gap-2">
 {clientes.map(c => (
 <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/30 rounded-xl border-2" style={{borderColor: c.cor}}>
 <div className="w-2 h-2 rounded-full" style={{background: c.cor}}/><span className="font-medium text-sm">{c.nome}</span>
 <button className="text-red-400 hover:text-red-300 ml-1" onClick={()=>uG('clientes',clientes.filter(x=>x.id!==c.id))}>✕</button>
 </div>
 ))}
 </div>
 </Card>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">💼 COM Taxas <span className="text-xs sm:text-sm px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-medium">{fmt(inCom)}</span></h3>
 <div className="flex gap-1 sm:gap-2">
   <Button variant="secondary" size="sm" onClick={duplicarMesAnterior} className="hidden sm:inline-flex text-xs">📋</Button>
   <Button size="sm" onClick={()=>uM('regCom',[...regCom,{id:Date.now(),cid:clientes[0]?.id||0,val:0,data:new Date().toISOString().split('T')[0],desc:''}])}>+</Button>
 </div>
 </div>
 
 <div className="flex flex-wrap items-center gap-2 p-2 sm:p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl mb-4">
 <span className="text-xs text-slate-300">Taxa:</span>
 <SliderWithInput value={taxa} onChange={v=>uG('taxa',v)} min={0} max={60} unit="%" className="w-20 sm:w-32" color="pink"/>
 <span className="text-xs text-slate-500 hidden sm:inline">Reserva: {fmt(valTax)}</span>
 </div>

 {regCom.length===0 ? <p className="text-center py-8 text-slate-500">Sem registos este mês</p> : (
 <DraggableList
   items={regCom}
   onReorder={(newItems) => uM('regCom', newItems)}
   renderItem={(r, idx, isDragging, onDragStart, onDragEnd) => (
     <div className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-slate-700/30 rounded-lg">
       <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none flex-shrink-0 text-xs sm:text-base">⋮⋮</div>
       <Select value={r.cid} onChange={e=>uM('regCom',regCom.map(x=>x.id===r.id?{...x,cid:+e.target.value}:x))} className="w-16 sm:w-24 text-xs sm:text-sm flex-shrink-0">{clientes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
       <StableInput className={`flex-1 min-w-0 ${inputClass} text-xs sm:text-sm`} initialValue={r.desc} onSave={v=>uM('regCom',regCom.map(x=>x.id===r.id?{...x,desc:v}:x))} placeholder="Descrição..."/>
       <StableInput type="number" className={`w-16 sm:w-20 flex-shrink-0 ${inputClass} text-right text-xs sm:text-sm`} initialValue={r.val} onSave={v=>uM('regCom',regCom.map(x=>x.id===r.id?{...x,val:v}:x))}/>
       <button onClick={()=>uM('regCom',regCom.filter(x=>x.id!==r.id))} className="text-red-400 hover:text-red-300 p-0.5 sm:p-1 flex-shrink-0">✕</button>
     </div>
   )}
 />
 )}
 </Card>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">💵 SEM Taxas <span className="text-xs sm:text-sm px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-medium">{fmt(inSem)}</span></h3>
 <Button size="sm" onClick={()=>uM('regSem',[...regSem,{id:Date.now(),cid:clientes[0]?.id||0,val:0,data:new Date().toISOString().split('T')[0],desc:''}])}>+</Button>
 </div>
 {regSem.length===0 ? <p className="text-center py-8 text-slate-500">Sem registos este mês</p> : (
 <DraggableList
   items={regSem}
   onReorder={(newItems) => uM('regSem', newItems)}
   renderItem={(r, idx, isDragging, onDragStart, onDragEnd) => (
     <div className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-slate-700/30 rounded-lg">
       <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none flex-shrink-0 text-xs sm:text-base">⋮⋮</div>
       <Select value={r.cid} onChange={e=>uM('regSem',regSem.map(x=>x.id===r.id?{...x,cid:+e.target.value}:x))} className="w-16 sm:w-24 text-xs sm:text-sm flex-shrink-0">{clientes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
       <StableInput className={`flex-1 min-w-0 ${inputClass} text-xs sm:text-sm`} initialValue={r.desc} onSave={v=>uM('regSem',regSem.map(x=>x.id===r.id?{...x,desc:v}:x))} placeholder="Descrição..."/>
       <StableInput type="number" className={`w-16 sm:w-20 flex-shrink-0 ${inputClass} text-right text-xs sm:text-sm`} initialValue={r.val} onSave={v=>uM('regSem',regSem.map(x=>x.id===r.id?{...x,val:v}:x))}/>
       <button onClick={()=>uM('regSem',regSem.filter(x=>x.id!==r.id))} className="text-red-400 hover:text-red-300 p-0.5 sm:p-1 flex-shrink-0">✕</button>
     </div>
   )}
 />
 )}
 </Card>
 </div>
 );

 // ABANCA
 const ABanca = () => {
 // Agrupar despesas por categoria
 const porCat = cats.map(c => ({
   cat: c,
   val: despABanca.filter(d => d.cat === c).reduce((a, d) => a + d.val, 0)
 })).filter(c => c.val > 0);
 
 const catCores = {'Habitação':'#3b82f6','Utilidades':'#f59e0b','Alimentação':'#10b981','Saúde':'#ec4899','Lazer':'#8b5cf6','Transporte':'#f97316','Subscrições':'#06b6d4','Bancário':'#64748b','Serviços':'#a855f7','Vários':'#84cc16','Outros':'#6b7280','Seguros':'#ef4444'};
 const pieData = porCat.map(c => ({value: c.val, color: catCores[c.cat] || '#64748b', label: c.cat}));
 
 return (
 <div className="space-y-6 max-w-4xl mx-auto">
 <Card>
 <div className="flex justify-between items-center mb-6">
 <div>
 <h3 className="text-lg font-semibold">🏠 Despesas do Casal (Fixas Partilhadas)</h3>
 <p className="text-xs text-emerald-400">✓ Alterações aplicam-se a todos os meses automaticamente</p>
 </div>
 <Button onClick={()=>uG('despABanca',[...despABanca,{id:Date.now(),desc:'',cat:'Outros',val:0}])}>+</Button>
 </div>
 <div className="flex flex-wrap items-center gap-2 p-2 sm:p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl mb-6">
 <div className="flex-1 min-w-0"><p className="text-xs sm:text-sm text-slate-300">Minha contrib.</p></div>
 <SliderWithInput value={contrib} onChange={v=>uG('contrib',v)} min={0} max={100} unit="%" className="w-20 sm:w-32" color="pink"/>
 <div className="text-right hidden sm:block"><p className="text-xs text-slate-500">Sara</p><p className="font-semibold text-slate-300">{fmtP(100-contrib)}</p></div>
 </div>
 <DraggableList
 items={despABanca}
 onReorder={(newItems) => uG('despABanca', newItems)}
 renderItem={(d, idx, isDragging, onDragStart, onDragEnd) => (
 <div className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none flex-shrink-0">⋮⋮</div>
 <StableInput className={`flex-[2] min-w-0 ${inputClass}`} initialValue={d.desc} onSave={v=>uG('despABanca',despABanca.map(x=>x.id===d.id?{...x,desc:v}:x))} placeholder="Descrição"/>
 <Select value={d.cat} onChange={e=>uG('despABanca',despABanca.map(x=>x.id===d.id?{...x,cat:e.target.value}:x))} className="flex-1 min-w-[100px]">{cats.map(c=><option key={c} value={c}>{c}</option>)}</Select>
 <StableInput type="number" className={`w-16 sm:w-20 flex-shrink-0 ${inputClass} text-right`} initialValue={d.val} onSave={v=>uG('despABanca',despABanca.map(x=>x.id===d.id?{...x,val:v}:x))}/>
 <button onClick={()=>uG('despABanca',despABanca.filter(x=>x.id!==d.id))} className="text-red-400 hover:text-red-300 p-1 flex-shrink-0">✕</button>
 </div>
 )}
 />
 <div className="flex justify-between gap-4 mt-6 p-4 bg-slate-700/30 rounded-xl">
 <div className="text-center"><p className="text-xs text-slate-500">Total (100%)</p><p className="text-xl font-bold">{fmt(totAB)}</p></div>
 <div className="text-center"><p className="text-xs text-slate-500">Minha parte ({fmtP(contrib)})</p><p className="text-xl font-bold text-pink-400">{fmt(minhaAB)}</p></div>
 <div className="text-center"><p className="text-xs text-slate-500">Parte Sara ({fmtP(100-contrib)})</p><p className="text-xl font-bold text-slate-400">{fmt(totAB-minhaAB)}</p></div>
 </div>
 </Card>
 
 {porCat.length > 0 && (
 <Card>
 <h3 className="text-lg font-semibold mb-6">📊 Distribuição por Categoria</h3>
 <div className="flex flex-col lg:flex-row gap-6 items-center">
 <PieChart data={pieData} size={180}/>
 <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
 {porCat.sort((a,b) => b.val - a.val).map(c => (
 <div key={c.cat} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg">
 <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background: catCores[c.cat]}}/>
 <div className="flex-1 min-w-0">
   <p className="text-xs font-medium truncate">{c.cat}</p>
   <p className="text-xs text-slate-500">{((c.val/totAB)*100).toFixed(0)}%</p>
 </div>
 <p className="text-sm font-semibold" style={{color: catCores[c.cat]}}>{fmt(c.val)}</p>
 </div>
 ))}
 </div>
 </div>
 </Card>
 )}
 </div>
 );
 };

 // PESSOAIS
 const Pessoais = () => {
 // Agrupar despesas por categoria
 const porCat = cats.map(c => ({
   cat: c,
   val: despPess.filter(d => d.cat === c).reduce((a, d) => a + d.val, 0)
 })).filter(c => c.val > 0);
 
 const catCores = {'Habitação':'#3b82f6','Utilidades':'#f59e0b','Alimentação':'#10b981','Saúde':'#ec4899','Lazer':'#8b5cf6','Transporte':'#f97316','Subscrições':'#06b6d4','Bancário':'#64748b','Serviços':'#a855f7','Vários':'#84cc16','Outros':'#6b7280','Seguros':'#ef4444'};
 const pieData = porCat.map(c => ({value: c.val, color: catCores[c.cat] || '#64748b', label: c.cat}));
 
 return (
 <div className="space-y-6 max-w-4xl mx-auto">
 <Card>
 <div className="flex justify-between items-center mb-6">
 <div>
 <h3 className="text-lg font-semibold">👤 Despesas Pessoais (Activo Bank)</h3>
 <p className="text-xs text-emerald-400">✓ Alterações aplicam-se a todos os meses automaticamente</p>
 </div>
 <Button onClick={()=>uG('despPess',[...despPess,{id:Date.now(),desc:'',cat:'Outros',val:0}])}>+</Button>
 </div>
 <DraggableList
 items={despPess}
 onReorder={(newItems) => uG('despPess', newItems)}
 renderItem={(d, idx, isDragging, onDragStart, onDragEnd) => (
 <div className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none flex-shrink-0">⋮⋮</div>
 <StableInput className={`flex-[2] min-w-0 ${inputClass}`} initialValue={d.desc} onSave={v=>uG('despPess',despPess.map(x=>x.id===d.id?{...x,desc:v}:x))} placeholder="Descrição"/>
 <Select value={d.cat} onChange={e=>uG('despPess',despPess.map(x=>x.id===d.id?{...x,cat:e.target.value}:x))} className="flex-1 min-w-[100px]">{cats.map(c=><option key={c} value={c}>{c}</option>)}</Select>
 <StableInput type="number" className={`w-16 sm:w-20 flex-shrink-0 ${inputClass} text-right`} initialValue={d.val} onSave={v=>uG('despPess',despPess.map(x=>x.id===d.id?{...x,val:v}:x))}/>
 <button onClick={()=>uG('despPess',despPess.filter(x=>x.id!==d.id))} className="text-red-400 hover:text-red-300 p-1 flex-shrink-0">✕</button>
 </div>
 )}
 />
 <div className="flex justify-end mt-6 p-4 bg-slate-700/30 rounded-xl">
 <div className="text-right"><p className="text-xs text-slate-500">Total Despesas Pessoais</p><p className="text-xl font-bold">{fmt(totPess)}</p></div>
 </div>
 </Card>
 
 {porCat.length > 0 && (
 <Card>
 <h3 className="text-lg font-semibold mb-6">📊 Distribuição por Categoria</h3>
 <div className="flex flex-col lg:flex-row gap-6 items-center">
 <PieChart data={pieData} size={180}/>
 <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
 {porCat.sort((a,b) => b.val - a.val).map(c => (
 <div key={c.cat} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg">
 <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background: catCores[c.cat]}}/>
 <div className="flex-1 min-w-0">
   <p className="text-xs font-medium truncate">{c.cat}</p>
   <p className="text-xs text-slate-500">{((c.val/totPess)*100).toFixed(0)}%</p>
 </div>
 <p className="text-sm font-semibold" style={{color: catCores[c.cat]}}>{fmt(c.val)}</p>
 </div>
 ))}
 </div>
 </div>
 </Card>
 )}
 </div>
 );
 };

 // INVESTIMENTOS
 const Invest = () => {
 const disp = restante>0?restante:0;
 const pInv = disp*((100-alocAmort)/100);
 const totInvSemCredito = inv.filter(i => i.cat !== 'CREDITO').reduce((a,i) => a + i.val, 0);
 const rest = pInv - totInvSemCredito;
 const catCores = {'ETF':'#3b82f6','PPR':'#f59e0b','P2P':'#ec4899','CRIPTO':'#14b8a6','FE':'#10b981','CREDITO':'#ef4444'};
 const [novaCat, setNovaCat] = useState('');
 
 return (
 <div key={mesKey} className="space-y-6 max-w-4xl mx-auto">
 <Card>
 <h3 className="text-base sm:text-lg font-semibold mb-4 text-center">💰 Disponível: {fmt(disp)}</h3>
 <div className="flex flex-wrap items-center gap-2 p-2 sm:p-4 bg-slate-700/30 rounded-xl mb-4">
 <span className="text-emerald-400 text-xs font-medium">🏠</span>
 <SliderWithInput value={alocAmort} onChange={v=>uG('alocAmort',v)} min={0} max={100} unit="%" className="flex-1 min-w-0" color="emerald"/>
 <span className="text-purple-400 text-xs font-medium">📈</span>
 </div>
 <div className="grid grid-cols-2 gap-2 sm:gap-4">
 <div className="p-2 sm:p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
 <p className="text-xs text-slate-400 mb-1">🏠 Amortização</p>
 <p className="text-lg sm:text-xl font-bold text-emerald-400">{fmt(disp*(alocAmort/100))}</p>
 <p className="text-xs sm:text-sm text-emerald-400/70">{fmtP(alocAmort)}</p>
 </div>
 <div className="p-2 sm:p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <p className="text-xs text-slate-400 mb-1">📈 Invest.</p>
 <p className="text-lg sm:text-xl font-bold text-purple-400">{fmt(pInv)}</p>
 <p className="text-xs sm:text-sm text-purple-400/70">{fmtP(100-alocAmort)}</p>
 </div>
 </div>
 </Card>

 <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-3xl">
 <Card className="bg-purple-500/10 border-purple-500/30"><p className="text-xs text-slate-400 mb-1">💰 Disponível</p><p className="text-lg sm:text-xl font-bold text-purple-400">{fmt(pInv)}</p></Card>
 <Card className="bg-blue-500/10 border-blue-500/30"><p className="text-xs text-slate-400 mb-1">📊 Investido</p><p className="text-lg sm:text-xl font-bold text-blue-400">{fmt(totInvSemCredito)}</p></Card>
 <Card className={rest>=0?'bg-emerald-500/10 border-emerald-500/30':'bg-red-500/10 border-red-500/30'}><p className="text-xs text-slate-400 mb-1">{rest>=0?'✨ Resta':'⚠️'}</p><p className={`text-lg sm:text-xl font-bold ${rest>=0?'text-emerald-400':'text-red-400'}`}>{fmt(Math.abs(rest))}</p></Card>
 </div>

 <Card>
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
 <div>
 <h3 className="text-lg font-semibold">📈 Alocação de Investimentos</h3>
 <p className="text-xs text-slate-500">Categorias: {catsInv.join(', ')}</p>
 </div>
 <div className="flex gap-2 justify-end">
   <Button variant="secondary" size="sm" onClick={aplicarInvFuturos}>📅 Aplicar a meses futuros</Button>
   <Button onClick={()=>uM('inv',[...inv,{id:Date.now(),desc:'',cat:catsInv[0]||'ETF',val:0,done:false}])}>+</Button>
 </div>
 </div>
 
 {/* Adicionar categoria */}
 <div className="flex items-center gap-2 mb-4 p-3 bg-slate-700/20 rounded-xl">
   <span className="text-xs text-slate-400">Nova categoria:</span>
   <input type="text" className={`flex-1 ${inputClass} text-xs`} value={novaCat} onChange={e => setNovaCat(e.target.value.toUpperCase())} placeholder="Ex: ACOES"/>
   <Button size="sm" onClick={() => { if (novaCat && !catsInv.includes(novaCat)) { uG('catsInv', [...catsInv, novaCat]); setNovaCat(''); } }}>+</Button>
 </div>
 
 <DraggableList
 items={inv}
 onReorder={(newItems) => uM('inv', newItems)}
 renderItem={(d, idx, isDragging, onDragStart, onDragEnd) => {
 const pct = totInv>0?((d.val/totInv)*100).toFixed(1):0;
 const cor = catCores[d.cat]||'#8b5cf6';
 return (
 <div className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none flex-shrink-0">⋮⋮</div>
 <div className="w-1 h-8 rounded-full flex-shrink-0" style={{background: cor}}/>
 <StableInput className={`flex-[2] min-w-0 ${inputClass}`} initialValue={d.desc} onSave={v=>uM('inv',inv.map(x=>x.id===d.id?{...x,desc:v}:x))} placeholder="Descrição"/>
 <Select value={d.cat||'ETF'} onChange={e=>uM('inv',inv.map(x=>x.id===d.id?{...x,cat:e.target.value}:x))} className="flex-1 min-w-[80px]">
   {catsInv.map(c=><option key={c} value={c}>{c}</option>)}
 </Select>
 <StableInput type="number" className={`w-16 sm:w-20 flex-shrink-0 ${inputClass} text-right`} initialValue={d.val} onSave={v=>uM('inv',inv.map(x=>x.id===d.id?{...x,val:v}:x))}/>
 <span className="w-10 sm:w-12 text-center text-xs sm:text-sm font-semibold flex-shrink-0" style={{color: cor}}>{pct}%</span>
 <input type="checkbox" className="w-4 h-4 rounded accent-emerald-500 cursor-pointer flex-shrink-0" checked={d.done} onChange={e=>uM('inv',inv.map(x=>x.id===d.id?{...x,done:e.target.checked}:x))}/>
 <button onClick={()=>uM('inv',inv.filter(x=>x.id!==d.id))} className="text-red-400 hover:text-red-300 p-1 flex-shrink-0">✕</button>
 </div>
 );
 }}
 />
 </Card>

 {totInv > 0 && (
 <Card>
 <h3 className="text-lg font-semibold mb-4">📊 Distribuição por Categoria</h3>
 <div className="space-y-3">
 {catsInv.map(cat => {
   const catTotal = inv.filter(i => i.cat === cat).reduce((a,i) => a + i.val, 0);
   if (catTotal === 0) return null;
   const pct = (catTotal/totInv)*100;
   const cor = catCores[cat]||'#8b5cf6';
   return (
   <div key={cat} className="flex items-center gap-4">
   <span className="w-20 text-sm font-medium" style={{color: cor}}>{cat}</span>
   <div className="flex-1"><ProgressBar value={catTotal} max={totInv} color={cor} height="h-4"/></div>
   <span className="w-14 text-right text-sm font-semibold" style={{color: cor}}>{pct.toFixed(1)}%</span>
   <span className="w-24 text-right font-semibold">{fmt(catTotal)}</span>
   </div>
   );
 })}
 </div>
 </Card>
 )}
 </div>
 );
 };

 // SARA
 const Sara = () => {
 const totAloc = sara.aloc.reduce((a,x)=>a+x.val,0);
 const restAloc = sobraSara - totAloc;
 const pctAloc = sobraSara > 0 ? (totAloc / sobraSara) * 100 : 0;
 
 return (
 <div className="space-y-6">
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
 <StatCard label="Rendimentos" value={fmt(totSaraR)} color="text-emerald-400" icon="💰"/>
 <StatCard label="Despesas" value={fmt(totSaraD)} color="text-orange-400" icon="💸"/>
 <StatCard label="Contrib. Casal" value={fmt(contribSaraAB)} color="text-pink-400" sub={`${fmtP(100-contrib)} - CR - Seg.`} icon="🏠"/>
 <StatCard label="Sobra" value={fmt(sobraSara)} color="text-blue-400" icon="✨"/>
 <StatCard label={restAloc>=0?"Por Alocar":"Excedido"} value={fmt(Math.abs(restAloc))} color={restAloc>=0?"text-purple-400":"text-red-400"} icon={restAloc>=0?"🎯":"⚠️"}/>
 </div>

 <Card>
 <div className="flex items-center gap-3 flex-wrap text-sm">
 <span>🏠 Contribuição Casal:</span>
 <span className="text-pink-400 font-semibold">{fmt(parteSaraAB)}</span>
 <span className="text-slate-500">({fmtP(100-contrib)} de {fmt(totAB)})</span>
 <span className="text-slate-600">−</span><span>{fmt(cartaoRef)}</span><span className="text-slate-500">(Cartão Refeição)</span>
 <span className="text-slate-600">−</span><span>{fmt(segFilhos)}</span><span className="text-slate-500">(Seguro filhos)</span>
 <span className="text-slate-600">=</span>
 <span className="bg-pink-500/20 px-3 py-1 rounded-lg text-pink-400 font-bold">{fmt(contribSaraAB)}</span>
 </div>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold">💵 Rendimentos</h3>
 <Button onClick={()=>uS('rend',[...sara.rend,{id:Date.now(),desc:'Novo',val:0}])}>+</Button>
 </div>
 <DraggableList
   items={sara.rend}
   onReorder={(newItems) => uS('rend', newItems)}
   renderItem={(r, idx, isDragging, onDragStart, onDragEnd) => (
     <div className={`p-2 rounded-lg ${r.isCR ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-700/30'}`}>
       <div className="flex items-center gap-2">
         <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none">⋮⋮</div>
         <StableInput className={`flex-1 ${inputClass} min-w-0`} initialValue={r.desc} onSave={v=>uS('rend',sara.rend.map(x=>x.id===r.id?{...x,desc:v}:x))}/>
         {r.isCR && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded hidden sm:block">CR</span>}
         <StableInput type="number" className={`w-20 sm:w-24 ${inputClass} text-right`} initialValue={r.val} onSave={v=>uS('rend',sara.rend.map(x=>x.id===r.id?{...x,val:v}:x))}/>
         <button onClick={()=>uS('rend',sara.rend.filter(x=>x.id!==r.id))} className="text-red-400 p-1">✕</button>
       </div>
     </div>
   )}
 />
 <div className="flex justify-between mt-4 p-3 bg-emerald-500/10 rounded-xl"><span className="text-slate-300">Total</span><span className="font-bold text-emerald-400">{fmt(totSaraR)}</span></div>
 </Card>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold">💸 Despesas Fixas</h3>
 <Button onClick={()=>uS('desp',[...sara.desp,{id:Date.now(),desc:'Nova',val:0}])}>+</Button>
 </div>
 <DraggableList
   items={sara.desp}
   onReorder={(newItems) => uS('desp', newItems)}
   renderItem={(d, idx, isDragging, onDragStart, onDragEnd) => (
     <div className="p-2 bg-slate-700/30 rounded-lg">
       <div className="flex items-center gap-2">
         <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none">⋮⋮</div>
         <StableInput className={`flex-1 ${inputClass} min-w-0`} initialValue={d.desc} onSave={v=>uS('desp',sara.desp.map(x=>x.id===d.id?{...x,desc:v}:x))}/>
         <StableInput type="number" className={`w-20 sm:w-24 ${inputClass} text-right`} initialValue={d.val} onSave={v=>uS('desp',sara.desp.map(x=>x.id===d.id?{...x,val:v}:x))}/>
         <button onClick={()=>uS('desp',sara.desp.filter(x=>x.id!==d.id))} className="text-red-400 p-1">✕</button>
       </div>
     </div>
   )}
 />
 <div className="flex justify-between mt-4 p-3 bg-orange-500/10 rounded-xl"><span className="text-slate-300">Total</span><span className="font-bold text-orange-400">{fmt(totSaraD)}</span></div>
 </Card>
 </div>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold">🎯 Alocação do Dinheiro Disponível</h3>
 <Button onClick={()=>uS('aloc',[...sara.aloc,{id:Date.now(),desc:'Nova',val:0,cor:['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ec4899'][sara.aloc.length%5]}])}>+</Button>
 </div>
 <div className="mb-6">
 <div className="flex justify-between text-sm mb-2"><span className="text-slate-400">Alocado: {fmt(totAloc)} de {fmt(sobraSara)}</span><span className={pctAloc>100?'text-red-400':'text-emerald-400'}>{pctAloc.toFixed(1)}%</span></div>
 <ProgressBar value={totAloc} max={sobraSara||1} color={pctAloc>100?'#ef4444':'#10b981'} height="h-2"/>
 </div>
 <DraggableList
   items={sara.aloc}
   onReorder={(newItems) => uS('aloc', newItems)}
   className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3"
   renderItem={(a, idx, isDragging, onDragStart, onDragEnd) => {
     const pct = sobraSara>0?(a.val/sobraSara)*100:0;
     return (
       <div className="p-4 bg-slate-700/30 rounded-xl" style={{borderLeft: `4px solid ${a.cor}`}}>
         <div className="flex justify-between items-center mb-3">
           <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none mr-2">⋮⋮</div>
           <StableInput className="bg-transparent border-none text-white font-semibold outline-none flex-1 min-w-0" initialValue={a.desc} onSave={v=>uS('aloc',sara.aloc.map(x=>x.id===a.id?{...x,desc:v}:x))}/>
           <button className="text-red-400 hover:text-red-300 ml-2" onClick={()=>uS('aloc',sara.aloc.filter(x=>x.id!==a.id))}>✕</button>
         </div>
         <div className="flex items-center gap-2 mb-3">
           <span className="text-slate-500">€</span>
           <StableInput type="number" className="flex-1 bg-slate-700/50 border rounded-xl px-3 py-2 text-xl font-bold text-right outline-none min-w-0" style={{color: a.cor, borderColor: a.cor+'40'}} initialValue={a.val} onSave={v=>uS('aloc',sara.aloc.map(x=>x.id===a.id?{...x,val:v}:x))}/>
         </div>
         <ProgressBar value={a.val} max={sobraSara||1} color={a.cor} height="h-1"/>
         <p className="text-right text-sm mt-2 font-semibold" style={{color: a.cor}}>{pct.toFixed(1)}%</p>
       </div>
     );
   }}
 />
 </Card>
 </div>
 );
 };

 // HISTÓRICO
 const Historico = () => {
 const h = getHist();
 const hAno = h.filter(x => x.ano === histAno);
 const totH = hAno.reduce((a,x)=>a+x.tot,0);
 const chartData = hAno.map(x => ({label: x.nome.slice(0,3), com: x.com, sem: x.sem, total: x.tot}));
 
 // Médias trimestrais
 const trimestres = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]];
 const mediaTrim = trimestres.map((t,i) => {
 const mesesTrim = hAno.filter(x => t.includes(x.mes));
 const total = mesesTrim.reduce((a,x)=>a+x.tot,0);
 return {q: `Q${i+1}`, total, media: mesesTrim.length > 0 ? total / mesesTrim.length : 0, meses: mesesTrim.length};
 });
 
 const mediaAnual = hAno.length > 0 ? totH / hAno.length : 0;
 const anosComDados = [...new Set(h.map(x => x.ano))].sort();
 
 // Mês com maior e menor receita
 const maxMes = hAno.length > 0 ? hAno.reduce((a, x) => x.tot > a.tot ? x : a, hAno[0]) : null;
 const minMes = hAno.filter(x => x.tot > 0).length > 0 ? hAno.filter(x => x.tot > 0).reduce((a, x) => x.tot < a.tot ? x : a, hAno.filter(x => x.tot > 0)[0]) : null;
 
 return (
 <div key={mesKey} className="space-y-6">
 <div className="flex items-center gap-4 mb-2">
 <h2 className="text-xl font-bold">📅 Histórico de Receitas</h2>
 <Select value={histAno} onChange={e=>setHistAno(+e.target.value)} className="text-sm">
 {anosComDados.length > 0 ? anosComDados.map(a=><option key={a} value={a}>{a}</option>) : anos.map(a=><option key={a} value={a}>{a}</option>)}
 </Select>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
 <StatCard label={`Total ${histAno}`} value={fmt(totH)} color="text-blue-400" icon="📊"/>
 <StatCard label="Média Mensal" value={fmt(mediaAnual)} color="text-emerald-400" sub={`${hAno.length} meses com dados`} icon="📈"/>
 <StatCard label="Com Taxas" value={fmt(hAno.reduce((a,x)=>a+x.com,0))} color="text-orange-400" icon="📋"/>
 <StatCard label="Sem Taxas" value={fmt(hAno.reduce((a,x)=>a+x.sem,0))} color="text-emerald-400" icon="✅"/>
 </div>

 <Card>
 <h3 className="text-lg font-semibold mb-4">📊 Médias por Trimestre</h3>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
 {mediaTrim.map(t => (
 <div key={t.q} className={`p-3 rounded-xl ${t.meses > 0 ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-700/30'}`}>
 <p className="text-sm font-semibold text-slate-300 mb-1">{t.q} ({t.meses} meses)</p>
 <p className="text-lg font-bold text-blue-400">{fmt(t.media)}</p>
 <p className="text-xs text-slate-500">Total: {fmt(t.total)}</p>
 </div>
 ))}
 </div>
 </Card>

 {hAno.length > 0 && (
 <Card>
 <div className="flex justify-between items-center mb-6">
   <h3 className="text-lg font-semibold">📈 Evolução das Receitas - {histAno}</h3>
   <div className="flex gap-4 text-sm">
     {maxMes && <span className="text-emerald-400">📈 Melhor: {maxMes.nome} ({fmt(maxMes.tot)})</span>}
     {minMes && <span className="text-orange-400">📉 Menor: {minMes.nome} ({fmt(minMes.tot)})</span>}
   </div>
 </div>
 <BarChart data={chartData} height={220} showValues={true}/>
 <div className="flex gap-6 mt-4 justify-center text-sm">
 <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-orange-500"/><span className="text-slate-400">Com Taxas</span></div>
 <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-emerald-500"/><span className="text-slate-400">Sem Taxas</span></div>
 </div>
 
 {/* Valores por mês em linha */}
 <div className="mt-6 pt-4 border-t border-slate-700">
   <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 text-center">
     {meses.map((m, i) => {
       const mesData = hAno.find(x => x.mes === i + 1);
       return (
         <div key={m} className="p-1">
           <p className="text-xs text-slate-500">{m.slice(0,3)}</p>
           <p className={`text-xs font-semibold ${mesData?.tot > 0 ? 'text-white' : 'text-slate-600'}`}>
             {mesData?.tot > 0 ? (mesData.tot >= 1000 ? `${(mesData.tot/1000).toFixed(1)}k` : mesData.tot) : '-'}
           </p>
         </div>
       );
     })}
   </div>
 </div>
 </Card>
 )}
 </div>
 );
 };

 // PORTFOLIO
 const Portfolio = () => {
 const catCores = {'ETF':'#3b82f6','PPR':'#f59e0b','P2P':'#ec4899','CRIPTO':'#14b8a6','FE':'#10b981','CREDITO':'#ef4444'};
 const porCat = catsInv.map(c=>({cat:c,val:portfolio.filter(p=>p.cat===c).reduce((a,p)=>a+p.val,0),items:portfolio.filter(p=>p.cat===c)})).filter(c=>c.val>0);
 const pieData = porCat.map(c => ({value: c.val, color: catCores[c.cat] || '#64748b', label: c.cat}));
 const lineData = portfolioHist.slice(-12).map(h => { const [y,m]=h.date.split('-').map(Number); return {label: `${meses[m-1]?.slice(0,3)||m}`, value: h.total}; });
 const [novaCatPort, setNovaCatPort] = useState('');
 const [expandedCat, setExpandedCat] = useState(null);
 
 // Calcular mês anterior
 const mesAtualIdx = meses.indexOf(mes);
 const anoAnterior = mesAtualIdx === 0 ? ano - 1 : ano;
 const mesAnteriorIdx = mesAtualIdx === 0 ? 11 : mesAtualIdx - 1;
 const mesAnteriorKey = `${anoAnterior}-${mesAnteriorIdx + 1}`;
 const portfolioMesAnterior = M[mesAnteriorKey]?.portfolio || [];
 
 
 // Calcular performance de cada investimento
 // Performance = (valor_atual - valor_mes_anterior - investido_este_mes) / valor_mes_anterior * 100
 const getPerformance = (item) => {
 // Procurar o item no portfolio do mês anterior
 const itemAnterior = portfolioMesAnterior.find(h => h.id === item.id || h.desc === item.desc);
 const valorAnterior = itemAnterior?.val || 0;
 
 // Investimento feito este mês para este item
 const invEsteMes = inv.find(i => i.desc.toLowerCase().includes(item.desc.toLowerCase().split(' ')[0]))?.val || 0;
 
 if (valorAnterior <= 0) return null; // Não há dados do mês anterior
 
 const ganhoReal = item.val - valorAnterior - invEsteMes;
 const performance = (ganhoReal / valorAnterior) * 100;
 
 return { ganho: ganhoReal, pct: performance };
 };
 
 // Guardar snapshot do portfolio para histórico detalhado
 const guardarSnapshot = () => {
 saveUndo();
 const currentKey = `${ano}-${meses.indexOf(mes) + 1}`;
 const totPortAtual = portfolio.reduce((a,p) => a + p.val, 0);
 
 // Atualizar portfolioHist (para o gráfico)
 const hist = G.portfolioHist || [];
 const existingIdx = hist.findIndex(h => h.date === currentKey);
 let newHist;
 if (existingIdx >= 0) {
 newHist = hist.map((h, i) => i === existingIdx ? {...h, total: totPortAtual} : h);
 } else {
 newHist = [...hist, {date: currentKey, total: totPortAtual}].sort((a,b) => {
 const [aY,aM] = a.date.split('-').map(Number);
 const [bY,bM] = b.date.split('-').map(Number);
 return aY === bY ? aM - bM : aY - bY;
 });
 }
 
 // Atualizar portfolioDetail (para performance)
 const detail = G.portfolioDetail || {};
 detail[currentKey] = portfolio.map(p => ({id: p.id, desc: p.desc, val: p.val}));
 
 // Guardar tudo de uma vez
 setG(p => ({...p, portfolioHist: newHist, portfolioDetail: detail}));
 };
 
 const limparHistorico = () => {
 saveUndo();
 setG(p => ({...p, portfolioHist: [], portfolioDetail: {}}));
 };
 
 return (
 <div className="space-y-6 max-w-4xl mx-auto">

 {lineData.length > 1 && (
 <Card>
 <div className="flex justify-between items-center mb-6">
 <h3 className="text-lg font-semibold">📈 Evolução do Portfolio</h3>
 <span className="text-xs text-slate-500">{lineData.length} meses registados</span>
 </div>
 <LineChart data={lineData} height={200} color="#3b82f6" showValues={true} formatValue={(v) => v >= 1000 ? `€${(v/1000).toFixed(0)}k` : `€${v}`}/>
 </Card>
 )}

 {porCat.length > 0 && (
 <Card>
 <h3 className="text-lg font-semibold mb-6">📊 Distribuição por Categoria</h3>
 <div className="flex flex-col lg:flex-row gap-6">
 <div className="flex-shrink-0">
   <PieChart data={pieData} size={180}/>
 </div>
 <div className="flex-1 space-y-2">
 {porCat.map(c => {
   const isExpanded = expandedCat === c.cat;
   const catPct = ((c.val/totPort)*100).toFixed(1);
   return (
   <div key={c.cat} className="bg-slate-700/30 rounded-xl overflow-hidden">
     <div 
       className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/50 transition-all"
       onClick={() => setExpandedCat(isExpanded ? null : c.cat)}
     >
       <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background: catCores[c.cat]}}/>
       <div className="flex-1 min-w-0">
         <div className="flex items-center justify-between">
           <p className="text-sm font-medium">{c.cat}</p>
           <span className="text-xs text-slate-400">{c.items.length} {c.items.length === 1 ? 'item' : 'itens'}</span>
         </div>
         <div className="flex items-center gap-2 mt-1">
           <div className="flex-1 h-1.5 bg-slate-600/50 rounded-full overflow-hidden">
             <div className="h-full rounded-full" style={{width: `${catPct}%`, background: catCores[c.cat]}}/>
           </div>
           <span className="text-xs font-medium" style={{color: catCores[c.cat]}}>{catPct}%</span>
         </div>
       </div>
       <p className="font-semibold text-right" style={{color: catCores[c.cat]}}>{fmt(c.val)}</p>
       <span className="text-slate-400 text-sm">{isExpanded ? '▼' : '▶'}</span>
     </div>
     {isExpanded && c.items.length > 0 && (
       <div className="px-3 pb-3 pt-1 border-t border-slate-600/30">
         <div className="space-y-1.5">
           {c.items.sort((a,b) => b.val - a.val).map(item => {
             const itemPctCat = c.val > 0 ? ((item.val / c.val) * 100).toFixed(1) : 0;
             const itemPctTotal = totPort > 0 ? ((item.val / totPort) * 100).toFixed(1) : 0;
             return (
               <div key={item.id} className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg">
                 <span className="flex-1 text-sm text-slate-300">{item.desc}</span>
                 <div className="w-20">
                   <div className="h-1 bg-slate-600/50 rounded-full overflow-hidden">
                     <div className="h-full rounded-full" style={{width: `${itemPctCat}%`, background: catCores[c.cat], opacity: 0.7}}/>
                   </div>
                 </div>
                 <span className="text-xs text-slate-400 w-12 text-right">{itemPctCat}%</span>
                 <span className="font-medium text-sm w-20 text-right">{fmt(item.val)}</span>
               </div>
             );
           })}
         </div>
         <p className="text-xs text-slate-500 mt-2 text-right">% = proporção dentro da categoria {c.cat}</p>
       </div>
     )}
   </div>
   );
 })}
 </div>
 </div>
 </Card>
 )}

 <Card>
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
 <div>
 <h3 className="text-lg font-semibold">💰 Portfolio Total: {fmt(totPort)}</h3>
 <p className="text-xs text-slate-500">Categorias: {catsInv.join(', ')}</p>
 </div>
 <div className="flex gap-2 justify-end">
   <Button variant="secondary" size="sm" onClick={guardarSnapshot}>📸 Snapshot</Button>
   <Button onClick={()=>uM('portfolio',[...portfolio,{id:Date.now(),desc:'Novo',cat:catsInv[0]||'ETF',val:0}])}>+</Button>
 </div>
 </div>
 
 {/* Adicionar categoria */}
 <div className="flex items-center gap-2 mb-4 p-3 bg-slate-700/20 rounded-xl">
   <span className="text-xs text-slate-400">Nova categoria:</span>
   <input type="text" className={`flex-1 ${inputClass} text-xs`} value={novaCatPort} onChange={e => setNovaCatPort(e.target.value.toUpperCase())} placeholder="Ex: ACOES"/>
   <Button size="sm" onClick={() => { if (novaCatPort && !catsInv.includes(novaCatPort)) { uG('catsInv', [...catsInv, novaCatPort]); setNovaCatPort(''); } }}>+</Button>
 </div>
 
 <DraggableList
 items={portfolio}
 onReorder={(newItems) => uM('portfolio', newItems)}
 renderItem={(p, idx, isDragging, onDragStart, onDragEnd) => {
 const perf = getPerformance(p);
 return (
 <div className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none flex-shrink-0">⋮⋮</div>
 <div className="w-1 h-8 rounded-full flex-shrink-0" style={{background: catCores[p.cat]||'#64748b'}}/>
 <StableInput className={`flex-[2] min-w-0 ${inputClass}`} initialValue={p.desc} onSave={v=>uM('portfolio',portfolio.map(x=>x.id===p.id?{...x,desc:v}:x))}/>
 <Select value={p.cat} onChange={e=>uM('portfolio',portfolio.map(x=>x.id===p.id?{...x,cat:e.target.value}:x))} className="flex-1 min-w-[80px]">{catsInv.map(c=><option key={c} value={c}>{c}</option>)}</Select>
 <StableInput type="number" className={`w-16 sm:w-20 flex-shrink-0 ${inputClass} text-right`} initialValue={p.val} onSave={v=>uM('portfolio',portfolio.map(x=>x.id===p.id?{...x,val:v}:x))}/>
 {perf !== null ? (
 <span className={`w-10 sm:w-12 text-right text-xs font-semibold flex-shrink-0 ${perf.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
 {perf.pct >= 0 ? '▲' : '▼'}{Math.abs(perf.pct).toFixed(1)}%
 </span>
 ) : (
 <span className="w-10 sm:w-12 text-right text-xs text-slate-500 flex-shrink-0">—</span>
 )}
 <button onClick={()=>uM('portfolio',portfolio.filter(x=>x.id!==p.id))} className="text-red-400 hover:text-red-300 p-1 flex-shrink-0">✕</button>
 </div>
 );
 }}
 />
 <div className="mt-4 p-3 bg-slate-700/20 rounded-xl text-xs text-slate-500">
 <p>💡 <strong>Performance:</strong> Mostra a variação percentual em relação ao mês anterior, descontando o valor investido este mês.</p>
 <p className="mt-1">Clica em "Guardar Snapshot" no final de cada mês para registar os valores e ver a performance no mês seguinte.</p>
 </div>
 </Card>
 </div>
 );
 };

 // CRÉDITO HABITAÇÃO
 const Credito = () => {
 const [simAmort, setSimAmort] = useState(500);
 const [simAnos, setSimAnos] = useState(10);
 const [simEuribor, setSimEuribor] = useState(2.5);
 const [simSpread, setSimSpread] = useState(1.0);
 const [simMeses, setSimMeses] = useState(null); // null = usar meses restantes reais
 const [simDivida, setSimDivida] = useState(null); // null = usar dívida atual
 
 const {valorCasa=365000, entradaInicial=36500, montanteInicial=328500, dividaAtual=229693.43, taxaJuro=2, prestacao=971, seguros=50, historico=[], dataFim='2054-02-01', spread=1.0, euribor=2.5} = credito || {};
 
 // Cálculos
 const taxaMensal = (taxaJuro / 100) / 12;
 const custoMensal = prestacao + seguros;
 
 // Prazo restante - cálculo mais preciso
 const hoje = new Date();
 const fimCredito = new Date(dataFim);
 const diffMs = fimCredito - hoje;
 const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
 
 // Calcular meses de forma mais precisa (média de 30.44 dias por mês)
 const totalMesesRestantes = Math.max(1, Math.round(diffDias / 30.44));
 const anosRestantes = Math.floor(totalMesesRestantes / 12);
 const mesesRestantes = totalMesesRestantes % 12;
 
 // Inicializar simulador com valores atuais
 useEffect(() => {
 if (simMeses === null) setSimMeses(totalMesesRestantes);
 if (simDivida === null) setSimDivida(dividaAtual);
 setSimEuribor(euribor);
 setSimSpread(spread);
 }, []);
 
 // Fórmula da prestação: P = D × [i(1+i)^n] / [(1+i)^n - 1]
 const calcularPrestacao = (divida, taxaAnual, meses) => {
 if (meses <= 0 || divida <= 0) return 0;
 const i = (taxaAnual / 100) / 12; // taxa mensal
 if (i === 0) return divida / meses; // caso especial: taxa 0%
 const fator = Math.pow(1 + i, meses);
 return divida * (i * fator) / (fator - 1);
 };
 
 // Prestação simulada
 const taxaSimulada = simEuribor + simSpread;
 const dividaParaSimular = simDivida || dividaAtual;
 const mesesParaSimular = simMeses || totalMesesRestantes;
 const prestacaoSimulada = calcularPrestacao(dividaParaSimular, taxaSimulada, mesesParaSimular);
 
 // Prestação teórica atual (com a taxa fixa atual)
 const prestacaoTeorica = calcularPrestacao(dividaAtual, taxaJuro, totalMesesRestantes);
 
 // Diferença
 const diffPrestacao = prestacaoSimulada - prestacao;
 
 // Simulação: quanto tempo para liquidar com amortização extra
 const calcularMesesParaLiquidar = (amortExtra) => {
 let divida = dividaAtual;
 let meses = 0;
 const maxMeses = 500;
 while (divida > 0 && meses < maxMeses) {
 const juros = divida * taxaMensal;
 const amortizacaoNormal = prestacao - juros;
 divida = divida - amortizacaoNormal - amortExtra;
 meses++;
 }
 return meses;
 };
 
 // Simulação: amortização necessária para liquidar em X anos
 const calcularAmortParaAnos = (anos) => {
 const mesesAlvo = anos * 12;
 let low = 0, high = 5000;
 while (high - low > 1) {
 const mid = (low + high) / 2;
 const meses = calcularMesesParaLiquidar(mid);
 if (meses <= mesesAlvo) high = mid;
 else low = mid;
 }
 return Math.ceil(high);
 };
 
 const mesesComAmort = calcularMesesParaLiquidar(simAmort);
 const anosComAmort = mesesComAmort / 12;
 const amortNecessaria = calcularAmortParaAnos(simAnos);
 
 // Projeção da dívida ao longo do tempo
 const gerarProjecao = (amortExtra, mesesMax = 360) => {
 const data = [];
 let divida = dividaAtual;
 let ano = 0;
 
 // Adicionar ponto inicial
 data.push({label: 'Hoje', value: divida});
 
 // Simular mês a mês mas só guardar a cada 2 anos (ou 1 ano se o prazo for curto)
 const intervalo = mesesMax <= 120 ? 12 : 24; // 1 ano ou 2 anos
 
 for (let m = 1; m <= mesesMax && divida > 0; m++) {
   const juros = divida * taxaMensal;
   const amortNormal = prestacao - juros;
   divida = Math.max(0, divida - amortNormal - amortExtra);
   
   // Guardar a cada intervalo de anos
   if (m % intervalo === 0) {
     ano = m / 12;
     data.push({label: `${ano}a`, value: divida});
   }
 }
 
 // Adicionar ponto final se não foi adicionado
 if (divida <= 0 && data[data.length-1]?.value > 0) {
   data.push({label: 'Fim', value: 0});
 }
 
 return data.slice(0, 15); // Máximo 15 pontos
 };
 
 const projecaoSemAmort = gerarProjecao(0, 400);
 const projecaoComAmort = gerarProjecao(simAmort, 300);
 
 // Histórico do crédito
 const histLineData = historico.map(h => {
 const [y,m] = h.date.split('-').map(Number);
 return {label: `${meses[m-1]?.slice(0,3)||m} ${y}`, value: h.divida};
 });
 
 // Total de juros
 const calcularTotalJuros = (amortExtra) => {
 let divida = dividaAtual;
 let totalJuros = 0;
 let meses = 0;
 while (divida > 0 && meses < 500) {
 const juros = divida * taxaMensal;
 totalJuros += juros;
 const amortNormal = prestacao - juros;
 divida = Math.max(0, divida - amortNormal - amortExtra);
 meses++;
 }
 return totalJuros;
 };
 
 const jurosSemAmort = calcularTotalJuros(0);
 const jurosComAmort = calcularTotalJuros(simAmort);
 const poupancaJuros = jurosSemAmort - jurosComAmort;
 
 // Calcular percentagens
 const pctCredito = ((montanteInicial - dividaAtual) / montanteInicial * 100).toFixed(1);
 const pctCasa = ((valorCasa - dividaAtual) / valorCasa * 100).toFixed(1);
 
 return (
 <div className="space-y-6">
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
 <StatCard label="Dívida Atual" value={fmt(dividaAtual)} color="text-red-400" icon="🏠"/>
 <StatCard label="Prestação + Seguros" value={fmt(custoMensal)} color="text-orange-400" sub={`${fmt(prestacao)} + ${fmt(seguros)}`} icon="💳"/>
 <StatCard label="Taxa de Juro" value={`${taxaJuro}%`} color="text-blue-400" sub="Taxa fixa" icon="📊"/>
 <StatCard label="Prazo Restante" value={`${anosRestantes}a ${mesesRestantes}m`} color="text-purple-400" sub={`Termina: ${fimCredito.toLocaleDateString('pt-PT')}`} icon="⏱️"/>
 <StatCard label="Já Amortizado" value={fmt(montanteInicial - dividaAtual)} color="text-emerald-400" sub={`${pctCredito}% crédito · ${pctCasa}% casa`} icon="✅"/>
 </div>

 <Card>
 <h3 className="text-lg font-semibold mb-4">📋 Dados do Crédito</h3>
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <div className="space-y-2">
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400 text-sm">Valor Casa</span>
 <StableInput type="number" className={`w-28 sm:w-32 ${inputClass} text-right`} initialValue={valorCasa} onSave={v=>uC('valorCasa',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400 text-sm">Entrada</span>
 <StableInput type="number" className={`w-28 sm:w-32 ${inputClass} text-right`} initialValue={entradaInicial} onSave={v=>uC('entradaInicial',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400 text-sm">Financiado</span>
 <StableInput type="number" className={`w-28 sm:w-32 ${inputClass} text-right`} initialValue={montanteInicial} onSave={v=>uC('montanteInicial',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <span className="text-slate-300 text-sm">Data Fim</span>
 <input type="date" className={`w-36 sm:w-40 ${inputClass}`} defaultValue={dataFim} onChange={e=>uC('dataFim',e.target.value)}/>
 </div>
 </div>
 <div className="space-y-2">
 <div className="flex justify-between items-center p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
 <span className="text-slate-300 font-medium text-sm">Dívida Atual</span>
 <StableInput type="number" className="w-28 sm:w-32 bg-slate-700/50 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 font-bold text-right focus:outline-none" initialValue={dividaAtual} onSave={v=>uC('dividaAtual',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400">Taxa de Juro Atual (%)</span>
 <StableInput type="number" className={`w-32 ${inputClass} text-right`} initialValue={taxaJuro} onSave={v=>uC('taxaJuro',v)} step="0.1"/>
 </div>
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400">Prestação Mensal Atual</span>
 <StableInput type="number" className={`w-32 ${inputClass} text-right`} initialValue={prestacao} onSave={v=>uC('prestacao',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400">Seguros</span>
 <StableInput type="number" className={`w-32 ${inputClass} text-right`} initialValue={seguros} onSave={v=>uC('seguros',v)}/>
 </div>
 </div>
 </div>
 </Card>

 <Card>
 <h3 className="text-lg font-semibold mb-4">🧮 Simulador de Prestação</h3>
 <p className="text-sm text-slate-400 mb-4">Simula como a prestação varia com diferentes taxas de juro</p>
 
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
 <div className="space-y-3">
 <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
 <div className="flex justify-between items-center mb-2">
 <span className="text-slate-300 text-sm">Euribor (%)</span>
 <div className="flex items-center gap-1">
 <input type="number" step="0.1" value={simEuribor} onChange={e=>setSimEuribor(+e.target.value||0)} className="w-16 bg-slate-700/50 border border-blue-500/30 rounded-lg px-2 py-1 text-blue-400 font-bold text-right text-sm focus:outline-none"/>
 <span className="text-slate-500 text-sm">%</span>
 </div>
 </div>
 <input type="range" min="-0.5" max="5" step="0.1" value={simEuribor} onChange={e=>setSimEuribor(+e.target.value)} className="w-full accent-blue-500"/>
 </div>
 
 <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <div className="flex justify-between items-center mb-2">
 <span className="text-slate-300 text-sm">Spread (%)</span>
 <div className="flex items-center gap-1">
 <input type="number" step="0.1" value={simSpread} onChange={e=>setSimSpread(+e.target.value||0)} className="w-16 bg-slate-700/50 border border-purple-500/30 rounded-lg px-2 py-1 text-purple-400 font-bold text-right text-sm focus:outline-none"/>
 <span className="text-slate-500 text-sm">%</span>
 </div>
 </div>
 <input type="range" min="0" max="3" step="0.1" value={simSpread} onChange={e=>setSimSpread(+e.target.value)} className="w-full accent-purple-500"/>
 </div>
 </div>
 
 <div className="space-y-3">
 <div className="p-3 bg-slate-700/30 rounded-xl">
 <div className="flex justify-between items-center mb-2">
 <span className="text-slate-300 text-sm">Dívida simular</span>
 <input type="number" value={simDivida || dividaAtual} onChange={e=>setSimDivida(+e.target.value||0)} className="w-28 bg-slate-700/50 border border-slate-600 rounded-lg px-2 py-1 text-white font-bold text-right text-sm focus:outline-none"/>
 </div>
 <button className="text-xs text-blue-400" onClick={()=>setSimDivida(dividaAtual)}>↺ Usar atual</button>
 </div>
 
 <div className="p-3 bg-slate-700/30 rounded-xl">
 <div className="flex justify-between items-center mb-2">
 <span className="text-slate-300 text-sm">Prazo</span>
 <input type="number" value={simMeses || totalMesesRestantes} onChange={e=>setSimMeses(+e.target.value||1)} className="w-20 bg-slate-700/50 border border-slate-600 rounded-lg px-2 py-1 text-white font-bold text-right text-sm focus:outline-none"/>
 </div>
 <p className="text-xs text-slate-500">{Math.floor((simMeses || totalMesesRestantes) / 12)}a {(simMeses || totalMesesRestantes) % 12}m</p>
 </div>
 </div>
 </div>
 
 <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-xl mb-4">
 <div className="flex items-center justify-between mb-2">
 <span className="text-slate-400">Taxa Total (Euribor + Spread)</span>
 <span className="text-xl font-bold text-emerald-400">{taxaSimulada.toFixed(2)}%</span>
 </div>
 <div className="text-xs text-slate-500">i = ({simEuribor}% + {simSpread}%) / 12 = {((taxaSimulada/100)/12*100).toFixed(4)}% ao mês</div>
 </div>
 
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
 <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl text-center">
 <p className="text-xs text-slate-500 mb-1">Prestação Atual</p>
 <p className="text-2xl font-bold text-orange-400">{fmt(prestacao)}</p>
 <p className="text-xs text-slate-500">Taxa fixa {taxaJuro}%</p>
 </div>
 <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
 <p className="text-xs text-slate-500 mb-1">Prestação Simulada</p>
 <p className="text-2xl font-bold text-emerald-400">{fmt(prestacaoSimulada)}</p>
 <p className="text-xs text-slate-500">Com taxa {taxaSimulada.toFixed(2)}%</p>
 </div>
 <div className={`p-4 rounded-xl text-center ${diffPrestacao > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
 <p className="text-xs text-slate-500 mb-1">Diferença</p>
 <p className={`text-2xl font-bold ${diffPrestacao > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
 {diffPrestacao > 0 ? '+' : ''}{fmt(diffPrestacao)}
 </p>
 <p className="text-xs text-slate-500">{diffPrestacao > 0 ? 'Pagarias mais' : 'Pagarias menos'}</p>
 </div>
 </div>
 
 <div className="mt-4 p-3 bg-slate-700/30 rounded-xl">
 <p className="text-xs text-slate-400">
 <strong>Fórmula:</strong> P = D × [i(1+i)ⁿ] / [(1+i)ⁿ - 1]
 </p>
 <p className="text-xs text-slate-500 mt-1">
 Onde: D = {fmt(dividaParaSimular)} | i = {((taxaSimulada/100)/12).toFixed(6)} | n = {mesesParaSimular} meses
 </p>
 </div>
 </Card>

 <Card>
 <h3 className="text-lg font-semibold mb-4">📈 Evolução Mensal da Dívida</h3>
 {historico.length < 2 ? (
 <div className="text-center py-8 text-slate-500">
 <p>Adiciona pelo menos 2 registos para ver a evolução.</p>
 <p className="text-xs mt-2">Usa o botão "Registar" em baixo para guardar a dívida atual.</p>
 </div>
 ) : (
 <>
 <LineChart data={histLineData} height={200} color="#ef4444"/>
 <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
 <div className="p-3 bg-slate-700/30 rounded-xl text-center">
 <p className="text-xs text-slate-500">Primeiro registo</p>
 <p className="font-bold text-slate-300">{fmt(historico[0]?.divida || 0)}</p>
 <p className="text-xs text-slate-500">{historico[0]?.date}</p>
 </div>
 <div className="p-3 bg-slate-700/30 rounded-xl text-center">
 <p className="text-xs text-slate-500">Último registo</p>
 <p className="font-bold text-slate-300">{fmt(historico[historico.length-1]?.divida || 0)}</p>
 <p className="text-xs text-slate-500">{historico[historico.length-1]?.date}</p>
 </div>
 <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
 <p className="text-xs text-slate-500">Total amortizado</p>
 <p className="font-bold text-emerald-400">{fmt((historico[0]?.divida || dividaAtual) - (historico[historico.length-1]?.divida || dividaAtual))}</p>
 <p className="text-xs text-emerald-400">desde o 1º registo</p>
 </div>
 </div>
 </>
 )}
 </Card>

 <Card>
 <h3 className="text-lg font-semibold mb-4">🎯 Simulador de Amortização</h3>
 
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
 <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
 <p className="text-xs sm:text-sm text-slate-400 mb-2">Amortizar mensalmente:</p>
 <div className="flex items-center gap-2 mb-3">
 <span className="text-slate-400 text-sm">€</span>
 <input type="number" value={simAmort} onChange={e=>setSimAmort(+e.target.value||0)} className="flex-1 bg-slate-700/50 border border-emerald-500/30 rounded-xl px-2 py-2 text-emerald-400 text-lg sm:text-xl font-bold text-right focus:outline-none"/>
 </div>
 <div className="space-y-1 text-xs sm:text-sm">
 <div className="flex justify-between"><span className="text-slate-400">Liquidado:</span><span className="font-bold text-emerald-400">{anosComAmort.toFixed(1)} anos</span></div>
 <div className="flex justify-between"><span className="text-slate-400">Poupança:</span><span className="font-bold text-emerald-400">{fmt(poupancaJuros)}</span></div>
 </div>
 </div>
 
 <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <p className="text-xs sm:text-sm text-slate-400 mb-2">Liquidar em X anos:</p>
 <div className="flex items-center gap-2 mb-3">
 <input type="number" value={simAnos} onChange={e=>setSimAnos(Math.max(1,+e.target.value||1))} className="flex-1 bg-slate-700/50 border border-purple-500/30 rounded-xl px-2 py-2 text-purple-400 text-lg sm:text-xl font-bold text-right focus:outline-none" min="1" max="30"/>
 <span className="text-slate-500 text-sm">anos</span>
 </div>
 <div className="space-y-1 text-xs sm:text-sm">
 <div className="flex justify-between"><span className="text-slate-400">Amort.:</span><span className="font-bold text-purple-400">{fmt(amortNecessaria)}</span></div>
 <div className="flex justify-between"><span className="text-slate-400">Total:</span><span className="font-semibold">{fmt(custoMensal + amortNecessaria)}</span></div>
 </div>
 </div>
 </div>
 
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
 <div className="p-3 bg-slate-700/30 rounded-xl text-center">
 <p className="text-xs text-slate-500 mb-1">Sem amortização extra</p>
 <p className="text-lg font-bold text-slate-400">{(calcularMesesParaLiquidar(0)/12).toFixed(1)} anos</p>
 <p className="text-xs text-slate-500">Juros: {fmt(jurosSemAmort)}</p>
 </div>
 <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
 <p className="text-xs text-slate-500 mb-1">Com {fmt(simAmort)}/mês extra</p>
 <p className="text-lg font-bold text-emerald-400">{anosComAmort.toFixed(1)} anos</p>
 <p className="text-xs text-emerald-400">Poupa {fmt(poupancaJuros)}</p>
 </div>
 <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl text-center">
 <p className="text-xs text-slate-500 mb-1">Meta: {simAnos} anos</p>
 <p className="text-lg font-bold text-purple-400">{fmt(amortNecessaria)}/mês</p>
 <p className="text-xs text-slate-500">Extra necessário</p>
 </div>
 </div>
 </Card>

 <Card>
 <h3 className="text-lg font-semibold mb-4">📉 Projeção da Dívida</h3>
 <div className="grid grid-cols-2 gap-6">
 <div>
 <p className="text-sm text-slate-400 mb-3">Sem amortização extra</p>
 <LineChart data={projecaoSemAmort} height={150} color="#64748b"/>
 </div>
 <div>
 <p className="text-sm text-slate-400 mb-3">Com {fmt(simAmort)}/mês extra</p>
 <LineChart data={projecaoComAmort} height={150} color="#10b981"/>
 </div>
 </div>
 </Card>
 </div>
 );
 };

 // CALENDÁRIO DE PROJETOS
 const Calendario = () => {
   const projetos = G.projetos || [];
   const [vista, setVista] = useState('mes'); // 'mes' ou 'semana'
   const [calMes, setCalMes] = useState(meses.indexOf(mes));
   const [calAno, setCalAno] = useState(ano);
   const [showAddProjeto, setShowAddProjeto] = useState(false);
   const [editProjeto, setEditProjeto] = useState(null);
   const [novoProjeto, setNovoProjeto] = useState({ nome: '', clienteId: clientes[0]?.id || 0, dataInicio: '', dataFim: '', cor: '#3b82f6' });
   
   const cores = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#84cc16'];
   
   // Gerar dias do mês
   const getDiasDoMes = (m, a) => {
     const primeiroDia = new Date(a, m, 1);
     const ultimoDia = new Date(a, m + 1, 0);
     const diasNoMes = ultimoDia.getDate();
     const diaSemanaInicio = primeiroDia.getDay(); // 0 = Domingo
     
     const dias = [];
     // Dias do mês anterior para preencher
     const mesAnterior = new Date(a, m, 0);
     for (let i = diaSemanaInicio - 1; i >= 0; i--) {
       dias.push({ dia: mesAnterior.getDate() - i, mes: m - 1, ano: a, fora: true });
     }
     // Dias do mês atual
     for (let i = 1; i <= diasNoMes; i++) {
       dias.push({ dia: i, mes: m, ano: a, fora: false });
     }
     // Dias do próximo mês
     const restante = 42 - dias.length; // 6 semanas
     for (let i = 1; i <= restante; i++) {
       dias.push({ dia: i, mes: m + 1, ano: a, fora: true });
     }
     return dias;
   };
   
   // Gerar dias da semana atual
   const getDiasDaSemana = () => {
     const hoje = new Date();
     const diaSemana = hoje.getDay();
     const inicio = new Date(hoje);
     inicio.setDate(hoje.getDate() - diaSemana + 1); // Segunda
     
     const dias = [];
     for (let i = 0; i < 7; i++) {
       const d = new Date(inicio);
       d.setDate(inicio.getDate() + i);
       dias.push({ dia: d.getDate(), mes: d.getMonth(), ano: d.getFullYear(), data: d });
     }
     return dias;
   };
   
   // Verificar se projeto está num dia
   const projetosNoDia = (dia, mesD, anoD) => {
     const dataStr = `${anoD}-${String(mesD + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
     const dataCheck = new Date(dataStr);
     return projetos.filter(p => {
       const inicio = new Date(p.dataInicio);
       const fim = new Date(p.dataFim);
       return dataCheck >= inicio && dataCheck <= fim;
     });
   };
   
   const saveProjeto = () => {
     if (!novoProjeto.nome || !novoProjeto.dataInicio || !novoProjeto.dataFim) return;
     
     if (editProjeto) {
       uG('projetos', projetos.map(p => p.id === editProjeto.id ? { ...novoProjeto, id: editProjeto.id } : p));
     } else {
       uG('projetos', [...projetos, { ...novoProjeto, id: Date.now(), concluido: false }]);
     }
     setShowAddProjeto(false);
     setEditProjeto(null);
     setNovoProjeto({ nome: '', clienteId: clientes[0]?.id || 0, dataInicio: '', dataFim: '', cor: '#3b82f6' });
   };
   
   const deleteProjeto = (id) => {
     if (confirm('Apagar este projeto?')) {
       uG('projetos', projetos.filter(p => p.id !== id));
     }
   };
   
   const toggleConcluido = (id) => {
     uG('projetos', projetos.map(p => p.id === id ? { ...p, concluido: !p.concluido } : p));
   };
   
   const dias = vista === 'mes' ? getDiasDoMes(calMes, calAno) : getDiasDaSemana();
   const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
   const hoje = new Date();
   const hojeStr = `${hoje.getFullYear()}-${hoje.getMonth()}-${hoje.getDate()}`;
   
   return (
     <div className="space-y-4">
       {/* Header */}
       <Card>
         <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
           <div className="flex items-center gap-3">
             <h3 className="text-lg font-semibold">📆 Calendário de Projetos</h3>
             <div className="flex gap-1 bg-slate-700/50 rounded-lg p-0.5">
               <button onClick={() => setVista('mes')} className={`px-3 py-1 text-xs rounded-md transition-all ${vista === 'mes' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}>Mês</button>
               <button onClick={() => setVista('semana')} className={`px-3 py-1 text-xs rounded-md transition-all ${vista === 'semana' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}>Semana</button>
             </div>
           </div>
           
           <div className="flex items-center gap-2">
             {vista === 'mes' && (
               <>
                 <button onClick={() => { if (calMes === 0) { setCalMes(11); setCalAno(a => a - 1); } else setCalMes(m => m - 1); }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg">←</button>
                 <span className="font-medium min-w-[140px] text-center">{meses[calMes]} {calAno}</span>
                 <button onClick={() => { if (calMes === 11) { setCalMes(0); setCalAno(a => a + 1); } else setCalMes(m => m + 1); }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg">→</button>
               </>
             )}
             <Button onClick={() => { setShowAddProjeto(true); setEditProjeto(null); setNovoProjeto({ nome: '', clienteId: clientes[0]?.id || 0, dataInicio: '', dataFim: '', cor: '#3b82f6' }); }}>+ Projeto</Button>
           </div>
         </div>
       </Card>
       
       {/* Calendário */}
       <Card className="overflow-hidden">
         {/* Dias da semana */}
         <div className="grid grid-cols-7 gap-px bg-slate-700">
           {diasSemana.map(d => (
             <div key={d} className="bg-slate-800 p-2 text-center text-xs font-medium text-slate-400">{d}</div>
           ))}
         </div>
         
         {/* Dias */}
         <div className="grid grid-cols-7 gap-px bg-slate-700">
           {dias.map((d, i) => {
             const projetosHoje = projetosNoDia(d.dia, d.mes, d.ano);
             const isHoje = d.dia === hoje.getDate() && d.mes === hoje.getMonth() && d.ano === hoje.getFullYear();
             
             return (
               <div key={i} className={`bg-slate-800 ${vista === 'mes' ? 'min-h-[80px] sm:min-h-[100px]' : 'min-h-[150px]'} p-1 ${d.fora ? 'opacity-40' : ''}`}>
                 <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isHoje ? 'bg-blue-500 text-white' : 'text-slate-400'}`}>
                   {d.dia}
                 </div>
                 <div className="space-y-0.5">
                   {projetosHoje.slice(0, vista === 'mes' ? 3 : 10).map(p => {
                     const cliente = clientes.find(c => c.id === p.clienteId);
                     return (
                       <div 
                         key={p.id} 
                         onClick={() => { setEditProjeto(p); setNovoProjeto(p); setShowAddProjeto(true); }}
                         className={`text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 ${p.concluido ? 'opacity-50 line-through' : ''}`}
                         style={{ background: `${p.cor}30`, borderLeft: `2px solid ${p.cor}` }}
                         title={`${p.nome}${cliente ? ` - ${cliente.nome}` : ''}`}
                       >
                         {p.nome}
                       </div>
                     );
                   })}
                   {projetosHoje.length > (vista === 'mes' ? 3 : 10) && (
                     <div className="text-xs text-slate-500 px-1">+{projetosHoje.length - (vista === 'mes' ? 3 : 10)}</div>
                   )}
                 </div>
               </div>
             );
           })}
         </div>
       </Card>
       
       {/* Lista de projetos */}
       <Card>
         <div className="flex justify-between items-center mb-4">
           <h3 className="text-lg font-semibold">📋 Todos os Projetos</h3>
           <span className="text-sm text-slate-400">{projetos.length} projeto(s)</span>
         </div>
         
         {projetos.length === 0 ? (
           <p className="text-slate-500 text-center py-8">Nenhum projeto. Clica em "+ Projeto" para adicionar.</p>
         ) : (
           <div className="space-y-2">
             {projetos.sort((a, b) => new Date(a.dataInicio) - new Date(b.dataInicio)).map(p => {
               const cliente = clientes.find(c => c.id === p.clienteId);
               const inicio = new Date(p.dataInicio);
               const fim = new Date(p.dataFim);
               const diasTotal = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
               const hojeDate = new Date();
               const diasPassados = Math.max(0, Math.ceil((hojeDate - inicio) / (1000 * 60 * 60 * 24)));
               const progresso = Math.min(100, (diasPassados / diasTotal) * 100);
               const status = p.concluido ? 'concluido' : hojeDate > fim ? 'atrasado' : hojeDate >= inicio ? 'ativo' : 'futuro';
               
               return (
                 <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 ${p.concluido ? 'opacity-60' : ''}`}>
                   <input type="checkbox" checked={p.concluido} onChange={() => toggleConcluido(p.id)} className="w-5 h-5 accent-green-500 cursor-pointer" />
                   <div className="w-1 h-10 rounded-full" style={{ background: p.cor }} />
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2">
                       <span className={`font-medium ${p.concluido ? 'line-through text-slate-400' : ''}`}>{p.nome}</span>
                       {cliente && (
                         <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${cliente.cor}30`, color: cliente.cor }}>{cliente.nome}</span>
                       )}
                       {status === 'atrasado' && !p.concluido && <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">Atrasado</span>}
                       {status === 'ativo' && !p.concluido && <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">Ativo</span>}
                     </div>
                     <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                       <span>{inicio.toLocaleDateString('pt-PT')} → {fim.toLocaleDateString('pt-PT')}</span>
                       <span>({diasTotal} dias)</span>
                     </div>
                     {!p.concluido && status !== 'futuro' && (
                       <div className="mt-1.5 h-1 bg-slate-600 rounded-full overflow-hidden">
                         <div className="h-full rounded-full" style={{ width: `${progresso}%`, background: p.cor }} />
                       </div>
                     )}
                   </div>
                   <div className="flex gap-1">
                     <button onClick={() => { setEditProjeto(p); setNovoProjeto(p); setShowAddProjeto(true); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-600 rounded-lg" title="Editar">✏️</button>
                     <button onClick={() => deleteProjeto(p.id)} className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg" title="Apagar">🗑️</button>
                   </div>
                 </div>
               );
             })}
           </div>
         )}
       </Card>
       
       {/* Modal Adicionar/Editar Projeto */}
       {showAddProjeto && (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddProjeto(false)}>
           <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="p-4 border-b border-slate-700 flex justify-between items-center">
               <h3 className="text-lg font-semibold">{editProjeto ? '✏️ Editar Projeto' : '➕ Novo Projeto'}</h3>
               <button onClick={() => setShowAddProjeto(false)} className="text-slate-400 hover:text-white">✕</button>
             </div>
             <div className="p-4 space-y-4">
               <div>
                 <label className="text-xs text-slate-400 mb-1 block">Nome do Projeto</label>
                 <input type="text" value={novoProjeto.nome} onChange={e => setNovoProjeto({ ...novoProjeto, nome: e.target.value })} className={inputClass + ' w-full'} placeholder="Ex: Website redesign" />
               </div>
               <div>
                 <label className="text-xs text-slate-400 mb-1 block">Cliente</label>
                 <Select value={novoProjeto.clienteId} onChange={e => setNovoProjeto({ ...novoProjeto, clienteId: parseInt(e.target.value) })} className="w-full">
                   <option value={0}>Sem cliente</option>
                   {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                 </Select>
               </div>
               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="text-xs text-slate-400 mb-1 block">Data Início</label>
                   <input type="date" value={novoProjeto.dataInicio} onChange={e => setNovoProjeto({ ...novoProjeto, dataInicio: e.target.value })} className={inputClass + ' w-full'} />
                 </div>
                 <div>
                   <label className="text-xs text-slate-400 mb-1 block">Data Fim</label>
                   <input type="date" value={novoProjeto.dataFim} onChange={e => setNovoProjeto({ ...novoProjeto, dataFim: e.target.value })} className={inputClass + ' w-full'} />
                 </div>
               </div>
               <div>
                 <label className="text-xs text-slate-400 mb-1 block">Cor</label>
                 <div className="flex gap-2">
                   {cores.map(c => (
                     <button key={c} onClick={() => setNovoProjeto({ ...novoProjeto, cor: c })} className={`w-8 h-8 rounded-lg ${novoProjeto.cor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : ''}`} style={{ background: c }} />
                   ))}
                 </div>
               </div>
             </div>
             <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
               <Button variant="secondary" onClick={() => setShowAddProjeto(false)}>Cancelar</Button>
               <Button onClick={saveProjeto} disabled={!novoProjeto.nome || !novoProjeto.dataInicio || !novoProjeto.dataFim}>{editProjeto ? 'Guardar' : 'Criar'}</Button>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 };

 // AGENDA FINANCEIRA
 const Agenda = () => {
   const tarefas = G.tarefas || [];
   const tarefasConcluidas = G.tarefasConcluidas || {};
   const hoje = new Date();
   const mesAtual = hoje.getMonth() + 1;
   const anoAtual = hoje.getFullYear();
   const diaAtual = hoje.getDate();
   
   // Estado para modal de nova tarefa
   const [showAddModal, setShowAddModal] = useState(false);
   const [editTarefa, setEditTarefa] = useState(null);
   const [novaTarefa, setNovaTarefa] = useState({desc: '', dia: 1, freq: 'mensal', cat: 'Outro', meses: []});
   
   // Determinar tarefas deste mês
   const getTarefasMes = (mes, anoCheck) => {
     return tarefas.filter(t => {
       if (!t.ativo) return false;
       if (t.freq === 'mensal') return true;
       if (t.freq === 'trimestral') return t.meses?.includes(mes);
       if (t.freq === 'anual') return t.meses?.includes(mes);
       return false;
     }).map(t => ({
       ...t,
       key: `${anoCheck}-${mes}-${t.id}`,
       concluida: tarefasConcluidas[`${anoCheck}-${mes}-${t.id}`] || false,
       atrasada: mes < mesAtual || (mes === mesAtual && t.dia < diaAtual),
       proxima: mes === mesAtual && t.dia >= diaAtual && t.dia <= diaAtual + 7
     }));
   };
   
   const tarefasMesAtual = getTarefasMes(mesAtual, anoAtual);
   const tarefasProxMes = getTarefasMes(mesAtual === 12 ? 1 : mesAtual + 1, mesAtual === 12 ? anoAtual + 1 : anoAtual);
   
   const toggleTarefa = (key) => {
     saveUndo();
     const novas = {...tarefasConcluidas, [key]: !tarefasConcluidas[key]};
     uG('tarefasConcluidas', novas);
   };
   
   const saveTarefa = () => {
     if (!novaTarefa.desc) return;
     saveUndo();
     if (editTarefa) {
       uG('tarefas', tarefas.map(t => t.id === editTarefa.id ? {...novaTarefa, id: editTarefa.id, ativo: true} : t));
     } else {
       uG('tarefas', [...tarefas, {...novaTarefa, id: Date.now(), ativo: true}]);
     }
     setShowAddModal(false);
     setEditTarefa(null);
     setNovaTarefa({desc: '', dia: 1, freq: 'mensal', cat: 'Outro', meses: []});
   };
   
   const openEditModal = (t) => {
     setEditTarefa(t);
     setNovaTarefa({desc: t.desc, dia: t.dia, freq: t.freq, cat: t.cat, meses: t.meses || []});
     setShowAddModal(true);
   };
   
   const removeTarefa = (id) => {
     if (confirm('Remover esta tarefa?')) {
       saveUndo();
       uG('tarefas', tarefas.filter(t => t.id !== id));
     }
   };
   
   const toggleMes = (m) => {
     setNovaTarefa(prev => ({
       ...prev,
       meses: prev.meses.includes(m) ? prev.meses.filter(x => x !== m) : [...prev.meses, m].sort((a,b) => a-b)
     }));
   };
   
   const catCores = {'IVA':'#f59e0b','SS':'#3b82f6','IRS':'#ef4444','Seguros':'#10b981','Outro':'#8b5cf6','Transf':'#10b981','Invest':'#8b5cf6','Contab':'#06b6d4'};
   const categorias = ['IVA', 'SS', 'IRS', 'Contab', 'Transf', 'Invest', 'Seguros', 'Outro'];
   
   const pendentes = tarefasMesAtual.filter(t => !t.concluida);
   const atrasadas = pendentes.filter(t => t.atrasada);
   
   // Modal para adicionar/editar tarefa
   const TarefaModal = () => {
     if (!showAddModal) return null;
     return (
       <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => {setShowAddModal(false); setEditTarefa(null);}}>
         <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
           <div className="p-4 border-b border-slate-700 flex justify-between items-center">
             <h3 className="text-lg font-semibold">{editTarefa ? '✏️ Editar Tarefa' : '➕ Nova Tarefa'}</h3>
             <button onClick={() => {setShowAddModal(false); setEditTarefa(null);}} className="text-slate-400 hover:text-white">✕</button>
           </div>
           <div className="p-4 space-y-4">
             <div>
               <label className="text-xs text-slate-400 mb-1 block">Descrição</label>
               <input className={`w-full ${inputClass}`} value={novaTarefa.desc} onChange={e => setNovaTarefa({...novaTarefa, desc: e.target.value})} placeholder="Ex: Pagar IVA trimestral"/>
             </div>
             <div className="grid grid-cols-2 gap-3">
               <div>
                 <label className="text-xs text-slate-400 mb-1 block">Dia do mês</label>
                 <input type="number" min="1" max="31" className={`w-full ${inputClass}`} value={novaTarefa.dia} onChange={e => setNovaTarefa({...novaTarefa, dia: +e.target.value})}/>
               </div>
               <div>
                 <label className="text-xs text-slate-400 mb-1 block">Categoria</label>
                 <select className={`w-full ${inputClass}`} value={novaTarefa.cat} onChange={e => setNovaTarefa({...novaTarefa, cat: e.target.value})}>
                   {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
               </div>
             </div>
             <div>
               <label className="text-xs text-slate-400 mb-1 block">Frequência</label>
               <div className="flex gap-2">
                 {['mensal', 'anual'].map(f => (
                   <button key={f} onClick={() => setNovaTarefa({...novaTarefa, freq: f, meses: f === 'mensal' ? [] : novaTarefa.meses})} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${novaTarefa.freq === f ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                     {f === 'mensal' ? 'Todos os meses' : 'Meses específicos'}
                   </button>
                 ))}
               </div>
             </div>
             {novaTarefa.freq === 'anual' && (
               <div>
                 <label className="text-xs text-slate-400 mb-2 block">Seleciona os meses</label>
                 <div className="grid grid-cols-4 gap-1">
                   {meses.map((m, i) => (
                     <button key={i} onClick={() => toggleMes(i+1)} className={`py-1.5 px-2 rounded text-xs font-medium transition-all ${novaTarefa.meses.includes(i+1) ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                       {m.slice(0,3)}
                     </button>
                   ))}
                 </div>
               </div>
             )}
           </div>
           <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
             <Button variant="secondary" onClick={() => {setShowAddModal(false); setEditTarefa(null);}}>Cancelar</Button>
             <Button onClick={saveTarefa} disabled={!novaTarefa.desc}>{editTarefa ? 'Guardar' : 'Adicionar'}</Button>
           </div>
         </div>
       </div>
     );
   };
   
   return (
     <div className="space-y-6">
       <TarefaModal />
       
       {/* RESUMO */}
       <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
         <StatCard label="Este Mês" value={tarefasMesAtual.length} color="text-blue-400" sub={`${tarefasMesAtual.filter(t=>t.concluida).length} concluídas`} icon="📋"/>
         <StatCard label="Pendentes" value={pendentes.length} color={pendentes.length > 0 ? "text-orange-400" : "text-emerald-400"} icon="⏳"/>
         <StatCard label="Atrasadas" value={atrasadas.length} color={atrasadas.length > 0 ? "text-red-400" : "text-emerald-400"} icon="⚠️"/>
         <StatCard label="Próximo Mês" value={tarefasProxMes.length} color="text-slate-400" icon="📅"/>
       </div>
       
       {/* TAREFAS URGENTES */}
       {atrasadas.length > 0 && (
         <Card>
           <h3 className="text-lg font-semibold mb-4 text-red-400">⚠️ Tarefas Atrasadas</h3>
           <div className="space-y-2">
             {atrasadas.map(t => (
               <div key={t.key} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                 <div className="flex items-center gap-3">
                   <input type="checkbox" checked={t.concluida} onChange={() => toggleTarefa(t.key)} className="w-5 h-5 accent-red-500"/>
                   <div>
                     <p className="font-medium">{t.desc}</p>
                     <p className="text-xs text-slate-500">Dia {t.dia} · {t.cat}</p>
                   </div>
                 </div>
                 <span className="px-2 py-1 text-xs rounded-full" style={{background: `${catCores[t.cat]}20`, color: catCores[t.cat]}}>{t.cat}</span>
               </div>
             ))}
           </div>
         </Card>
       )}
       
       {/* TAREFAS DO MÊS */}
       <Card>
         <div className="flex justify-between items-center mb-4">
           <h3 className="text-lg font-semibold">📅 {meses[mesAtual-1]} {anoAtual}</h3>
           <Button onClick={() => {setNovaTarefa({desc: '', dia: 1, freq: 'mensal', cat: 'Outro', meses: []}); setShowAddModal(true);}}>+ Nova Tarefa</Button>
         </div>
         <div className="space-y-2">
           {tarefasMesAtual.length === 0 ? (
             <p className="text-center py-8 text-slate-500">Nenhuma tarefa para este mês</p>
           ) : (
             tarefasMesAtual.sort((a,b) => a.dia - b.dia).map(t => (
               <div key={t.key} className={`flex items-center justify-between p-3 rounded-xl transition-all ${t.concluida ? 'bg-emerald-500/10 border border-emerald-500/30' : t.proxima ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-700/30'}`}>
                 <div className="flex items-center gap-3">
                   <input type="checkbox" checked={t.concluida} onChange={() => toggleTarefa(t.key)} className="w-5 h-5 accent-emerald-500"/>
                   <div className={t.concluida ? 'opacity-50' : ''}>
                     <p className={`font-medium ${t.concluida ? 'line-through' : ''}`}>{t.desc}</p>
                     <p className="text-xs text-slate-500">Dia {t.dia} · {t.freq} · {t.cat}</p>
                   </div>
                 </div>
                 <div className="flex items-center gap-2">
                   {t.proxima && !t.concluida && <span className="text-xs text-orange-400">Em breve!</span>}
                   <span className="px-2 py-1 text-xs rounded-full" style={{background: `${catCores[t.cat] || '#64748b'}20`, color: catCores[t.cat] || '#64748b'}}>{t.cat}</span>
                 </div>
               </div>
             ))
           )}
         </div>
       </Card>
       
       {/* PRÓXIMO MÊS */}
       <Card>
         <h3 className="text-lg font-semibold mb-4 text-slate-400">📆 Próximo Mês: {meses[mesAtual === 12 ? 0 : mesAtual]}</h3>
         <div className="space-y-2">
           {tarefasProxMes.length === 0 ? (
             <p className="text-center py-4 text-slate-500">Nenhuma tarefa</p>
           ) : (
             tarefasProxMes.sort((a,b) => a.dia - b.dia).map(t => (
               <div key={t.key} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-xl opacity-70">
                 <div>
                   <p className="font-medium text-sm">{t.desc}</p>
                   <p className="text-xs text-slate-500">Dia {t.dia}</p>
                 </div>
                 <span className="px-2 py-1 text-xs rounded-full" style={{background: `${catCores[t.cat] || '#64748b'}20`, color: catCores[t.cat] || '#64748b'}}>{t.cat}</span>
               </div>
             ))
           )}
         </div>
       </Card>
       
       {/* GERIR TAREFAS */}
       <Card>
         <div className="flex justify-between items-center mb-4">
           <h3 className="text-lg font-semibold">⚙️ Gerir Tarefas Recorrentes</h3>
           <div className="flex gap-2">
             <Button variant="secondary" onClick={() => {setNovaTarefa({desc: '', dia: 1, freq: 'mensal', cat: 'Outro', meses: []}); setShowAddModal(true);}}>+</Button>
             <Button variant="secondary" onClick={() => {
               if (confirm('Restaurar todas as tarefas para os valores padrão?')) {
                 saveUndo();
                 uG('tarefas', defG.tarefas);
               }
             }}>🔄 Padrão</Button>
           </div>
         </div>
         <div className="space-y-2 max-h-96 overflow-y-auto">
           {tarefas.map(t => (
             <div key={t.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl group">
               <div className="flex items-center gap-3">
                 <input type="checkbox" checked={t.ativo} onChange={() => uG('tarefas', tarefas.map(x => x.id === t.id ? {...x, ativo: !x.ativo} : x))} className="w-5 h-5 accent-blue-500"/>
                 <div className={!t.ativo ? 'opacity-50' : ''}>
                   <p className="font-medium text-sm">{t.desc}</p>
                   <p className="text-xs text-slate-500">Dia {t.dia} · {t.freq}{t.meses?.length > 0 ? ` (${t.meses.map(m => meses[m-1]?.slice(0,3)).join(', ')})` : ''}</p>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                 <span className="px-2 py-1 text-xs rounded-full" style={{background: `${catCores[t.cat] || '#64748b'}20`, color: catCores[t.cat] || '#64748b'}}>{t.cat}</span>
                 <button onClick={() => openEditModal(t)} className="text-slate-400 hover:text-blue-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
                 <button onClick={() => removeTarefa(t.id)} className="text-red-400 hover:text-red-300 p-1 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
               </div>
             </div>
           ))}
         </div>
       </Card>
     </div>
   );
 };

 const tabs = [{id:'resumo',icon:'📊',label:'Resumo'},{id:'receitas',icon:'💰',label:'Receitas'},{id:'abanca',icon:'🏠',label:'Casal'},{id:'pessoais',icon:'👤',label:'Pessoais'},{id:'invest',icon:'📈',label:'Investimentos'},{id:'sara',icon:'👩',label:'Sara'},{id:'historico',icon:'📅',label:'Histórico'},{id:'portfolio',icon:'💎',label:'Portfolio'},{id:'credito',icon:'🏦',label:'Crédito'},{id:'calendario',icon:'📆',label:'Projetos'},{id:'agenda',icon:'📋',label:'Agenda'}];

 // Função para exportar PDF mensal
 const exportToPDF = () => {
   // Usar os dados do mês atual (mesD já está disponível no scope)
   const totRec = inCom + inSem;
   const valTaxPDF = inCom * (taxa/100);
   const recLiqPDF = totRec - valTaxPDF;
   const totABPDF = despABanca.reduce((a,d)=>a+d.val,0);
   const minhaABPDF = totABPDF * (contrib/100);
   const totPessPDF = despPess.reduce((a,d)=>a+d.val,0);
   const totInvPDF = inv.reduce((a,d)=>a+d.val,0);
   const dispPDF = recLiqPDF - minhaABPDF - totPessPDF - ferias;
   const amortPDF = dispPDF > 0 ? dispPDF * (alocAmort/100) : 0;
   const invExtraPDF = dispPDF > 0 ? dispPDF * (1 - alocAmort/100) : 0;
   
   const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Relatório Financeiro - ${mes} ${ano}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #0f172a; }
    h2 { font-size: 16px; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; color: #334155; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .card { background: #f8fafc; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; }
    .card-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .card-value { font-size: 20px; font-weight: 700; }
    .card-value.green { color: #10b981; }
    .card-value.orange { color: #f59e0b; }
    .card-value.blue { color: #3b82f6; }
    .card-value.purple { color: #8b5cf6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f1f5f9; font-weight: 600; color: #475569; }
    td.right { text-align: right; }
    .total-row { background: #f8fafc; font-weight: 600; }
    .section { margin-bottom: 32px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>📊 Relatório Financeiro</h1>
  <p class="subtitle">${mes} ${ano} • Gerado em ${new Date().toLocaleDateString('pt-PT')}</p>
  
  <div class="grid">
    <div class="card"><div class="card-label">Receita Bruta</div><div class="card-value">${fmt(totRec)}</div></div>
    <div class="card"><div class="card-label">Reserva Taxas</div><div class="card-value orange">${fmt(valTaxPDF)}</div></div>
    <div class="card"><div class="card-label">Receita Líquida</div><div class="card-value green">${fmt(recLiqPDF)}</div></div>
    <div class="card"><div class="card-label">Disponível</div><div class="card-value blue">${fmt(dispPDF)}</div></div>
  </div>
  
  <div class="two-col">
    <div class="section">
      <h2>💼 Receitas COM Taxas</h2>
      <table>
        <tr><th>Descrição</th><th>Cliente</th><th class="right">Valor</th></tr>
        ${regCom.length > 0 ? regCom.map(r => '<tr><td>'+(r.desc || '-')+'</td><td>'+(clientes.find(c=>c.id===r.cid)?.nome || '-')+'</td><td class="right">'+fmt(r.val)+'</td></tr>').join('') : '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Sem registos</td></tr>'}
        <tr class="total-row"><td colspan="2">Total</td><td class="right">${fmt(inCom)}</td></tr>
      </table>
    </div>
    <div class="section">
      <h2>💵 Receitas SEM Taxas</h2>
      <table>
        <tr><th>Descrição</th><th>Cliente</th><th class="right">Valor</th></tr>
        ${regSem.length > 0 ? regSem.map(r => '<tr><td>'+(r.desc || '-')+'</td><td>'+(clientes.find(c=>c.id===r.cid)?.nome || '-')+'</td><td class="right">'+fmt(r.val)+'</td></tr>').join('') : '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Sem registos</td></tr>'}
        <tr class="total-row"><td colspan="2">Total</td><td class="right">${fmt(inSem)}</td></tr>
      </table>
    </div>
  </div>
  
  <div class="two-col">
    <div class="section">
      <h2>🏠 Despesas do Casal</h2>
      <table>
        <tr><th>Descrição</th><th>Categoria</th><th class="right">Valor</th></tr>
        ${despABanca.map(d => '<tr><td>'+d.desc+'</td><td>'+d.cat+'</td><td class="right">'+fmt(d.val)+'</td></tr>').join('')}
        <tr class="total-row"><td colspan="2">Total (minha parte: ${contrib}%)</td><td class="right">${fmt(minhaABPDF)}</td></tr>
      </table>
    </div>
    <div class="section">
      <h2>👤 Despesas Pessoais</h2>
      <table>
        <tr><th>Descrição</th><th>Categoria</th><th class="right">Valor</th></tr>
        ${despPess.map(d => '<tr><td>'+d.desc+'</td><td>'+d.cat+'</td><td class="right">'+fmt(d.val)+'</td></tr>').join('')}
        <tr class="total-row"><td colspan="2">Total</td><td class="right">${fmt(totPessPDF)}</td></tr>
      </table>
    </div>
  </div>
  
  <div class="section">
    <h2>📈 Investimentos do Mês</h2>
    <table>
      <tr><th>Descrição</th><th>Categoria</th><th class="right">Valor</th><th class="right">%</th></tr>
      ${inv.length > 0 ? inv.map(d => '<tr><td>'+d.desc+'</td><td>'+d.cat+'</td><td class="right">'+fmt(d.val)+'</td><td class="right">'+(totInvPDF>0?((d.val/totInvPDF)*100).toFixed(1):'0')+'%</td></tr>').join('') : '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem investimentos</td></tr>'}
      <tr class="total-row"><td colspan="2">Total Investido</td><td class="right">${fmt(totInvPDF)}</td><td></td></tr>
    </table>
  </div>
  
  <div class="grid">
    <div class="card"><div class="card-label">🏠 Amortização</div><div class="card-value green">${fmt(amortPDF)}</div></div>
    <div class="card"><div class="card-label">📈 Investimentos</div><div class="card-value purple">${fmt(invExtraPDF)}</div></div>
    <div class="card"><div class="card-label">🏖️ Férias</div><div class="card-value orange">${fmt(ferias)}</div></div>
    <div class="card"><div class="card-label">💰 Portfolio Total</div><div class="card-value blue">${fmt(portfolio.reduce((a,p)=>a+p.val,0))}</div></div>
  </div>
  
  <div class="footer">
    Dashboard Financeiro • Relatório gerado automaticamente
  </div>
</body>
</html>`;
   
   // Download como ficheiro HTML (pode abrir e imprimir como PDF)
   const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `Relatorio-${mes}-${ano}.html`;
   document.body.appendChild(a);
   a.click();
   document.body.removeChild(a);
   URL.revokeObjectURL(url);
 };

 // Modal de atalhos de teclado
 const ShortcutsModal = () => {
   if (!showShortcuts) return null;
   const shortcuts = [
     { key: '1-9, 0', desc: 'Navegar entre tabs' },
     { key: '← →', desc: 'Mês anterior/seguinte' },
     { key: 'Ctrl+Z', desc: 'Desfazer (Undo)' },
     { key: 'Ctrl+Y', desc: 'Refazer (Redo)' },
     { key: 'Ctrl+F', desc: 'Pesquisar' },
     { key: 'Ctrl+P', desc: 'Exportar PDF' },
     { key: '?', desc: 'Mostrar/ocultar atalhos' },
     { key: 'Esc', desc: 'Fechar modais' },
   ];
   return (
     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowShortcuts(false)}>
       <div className={`${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'} border rounded-2xl w-full max-w-md shadow-2xl`} onClick={e => e.stopPropagation()}>
         <div className={`p-4 border-b ${theme === 'light' ? 'border-slate-200' : 'border-slate-700'} flex justify-between items-center`}>
           <h3 className="text-lg font-semibold">⌨️ Atalhos de Teclado</h3>
           <button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-slate-300">✕</button>
         </div>
         <div className="p-4 space-y-2">
           {shortcuts.map((s, i) => (
             <div key={i} className={`flex justify-between items-center p-2 rounded-lg ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-700/50'}`}>
               <span className="text-sm">{s.desc}</span>
               <kbd className={`px-2 py-1 rounded text-xs font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-700' : 'bg-slate-600 text-slate-200'}`}>{s.key}</kbd>
             </div>
           ))}
         </div>
       </div>
     </div>
   );
 };

 // Função para exportar Excel real (.xlsx)
 const [exporting, setExporting] = useState(false);
 
 const exportToGoogleSheets = async () => {
   if (exporting) return;
   setExporting(true);
   
   try {
     if (!getAccessToken()) {
       alert('Para exportar para Google Sheets, faz logout e login novamente para autorizar o acesso.');
       setExporting(false);
       return;
     }
     
     const sheetsData = [];
     
     // SHEET 1: Resumo Anual
     const resumoData = [
       [`DASHBOARD FINANCEIRO ${ano}`],
       [`Exportado: ${new Date().toLocaleDateString('pt-PT')}`],
       [],
       ['Mês', 'Receita Com Taxas', 'Receita Sem Taxas', 'Total Bruto', 'Reserva Taxas', 'Líquido'],
     ];
     let totCom = 0, totSem = 0, totTax = 0;
     meses.forEach((mesNome, idx) => {
       const key = `${ano}-${idx + 1}`;
       const md = M[key] || {};
       const com = md.regCom?.reduce((a, r) => a + r.val, 0) || 0;
       const sem = md.regSem?.reduce((a, r) => a + r.val, 0) || 0;
       const tax = com * (G.taxa / 100);
       totCom += com; totSem += sem; totTax += tax;
       resumoData.push([mesNome, com, sem, com + sem, tax, com + sem - tax]);
     });
     resumoData.push(['TOTAL ANUAL', totCom, totSem, totCom + totSem, totTax, totCom + totSem - totTax]);
     sheetsData.push({ title: '📊 Resumo Anual', data: resumoData, headerRows: [3] });
     
     // SHEET POR CADA MÊS
     meses.forEach((mesNome, idx) => {
       const key = `${ano}-${idx + 1}`;
       const md = M[key] || {};
       const regCom = md.regCom || [];
       const regSem = md.regSem || [];
       const inv = md.inv || [];
       const transf = md.transf || {};
       
       const inCom = regCom.reduce((a, r) => a + r.val, 0);
       const inSem = regSem.reduce((a, r) => a + r.val, 0);
       const totRec = inCom + inSem;
       const valTax = inCom * (G.taxa / 100);
       const recLiq = totRec - valTax;
       const totABanca = G.despABanca.reduce((a, d) => a + d.val, 0);
       const minhaABanca = totABanca * (G.contrib / 100);
       const totPess = G.despPess.reduce((a, d) => a + d.val, 0);
       const restante = recLiq - minhaABanca - totPess - G.ferias;
       const amort = restante * (G.alocAmort / 100);
       const investExtra = restante * (1 - G.alocAmort / 100);
       
       const data = [
         [`${mesNome.toUpperCase()} ${ano}`],
         [],
         ['RESUMO DO MÊS', ''],
         ['Receita Total', totRec],
         ['  • Com Taxas', inCom],
         ['  • Sem Taxas', inSem],
         [`Reserva Taxas (${G.taxa}%)`, valTax],
         ['Receita Líquida', recLiq],
         [],
         ['Despesas Fixas (ABanca)', minhaABanca],
         ['Despesas Pessoais', totPess],
         ['Reserva Férias', G.ferias],
         [],
         ['DISPONÍVEL PARA ALOCAR', restante],
         [`  • Amortização (${G.alocAmort}%)`, amort],
         [`  • Investimentos (${100 - G.alocAmort}%)`, investExtra],
         [],
       ];
       
       // Receitas COM taxas
       if (regCom.length > 0) {
         data.push(['═══ RECEITAS COM RETENÇÃO ═══', '', '', '']);
         data.push(['Data', 'Cliente', 'Descrição', 'Valor']);
         regCom.forEach(r => {
           const cli = G.clientes.find(c => c.id === r.cid);
           data.push([r.data, cli?.nome || '-', r.desc, r.val]);
         });
         data.push(['', '', 'SUBTOTAL', inCom]);
         data.push([]);
       }
       
       // Receitas SEM taxas
       if (regSem.length > 0) {
         data.push(['═══ RECEITAS SEM RETENÇÃO ═══', '', '', '']);
         data.push(['Data', 'Cliente', 'Descrição', 'Valor']);
         regSem.forEach(r => {
           const cli = G.clientes.find(c => c.id === r.cid);
           data.push([r.data, cli?.nome || '-', r.desc, r.val]);
         });
         data.push(['', '', 'SUBTOTAL', inSem]);
         data.push([]);
       }
       
       // Despesas Fixas
       data.push(['═══ DESPESAS FIXAS (ABANCA) ═══', '', '', '']);
       data.push(['Descrição', 'Categoria', 'Total', `Minha Parte (${G.contrib}%)`]);
       G.despABanca.forEach(d => data.push([d.desc, d.cat, d.val, d.val * G.contrib / 100]));
       data.push(['', '', 'TOTAL', minhaABanca]);
       data.push([]);
       
       // Despesas Pessoais
       data.push(['═══ DESPESAS PESSOAIS ═══', '', '']);
       data.push(['Descrição', 'Categoria', 'Valor']);
       G.despPess.forEach(d => data.push([d.desc, d.cat, d.val]));
       data.push(['', 'TOTAL', totPess]);
       data.push([]);
       
       // Investimentos
       const totInv = inv.reduce((a, i) => a + i.val, 0);
       if (totInv > 0) {
         data.push(['═══ INVESTIMENTOS DO MÊS ═══', '', '']);
         data.push(['Descrição', 'Valor', 'Feito?']);
         inv.forEach(i => { if (i.val > 0) data.push([i.desc, i.val, i.done ? '✓' : '']); });
         data.push(['TOTAL', totInv, '']);
         data.push([]);
       }
       
       // Transferências
       data.push(['═══ TRANSFERÊNCIAS ═══', '', '']);
       data.push(['Destino', 'Valor', 'Feito?']);
       data.push(['ABanca (Despesas Fixas)', minhaABanca, transf.abanca ? '✓' : '']);
       data.push(['Activo Bank (Pessoais)', totPess, transf.activo ? '✓' : '']);
       data.push(['Trade Republic (Repor)', minhaABanca + totPess + valTax, transf.trade ? '✓' : '']);
       data.push(['Revolut (Férias)', G.ferias, transf.revolut ? '✓' : '']);
       data.push([]);
       
       // Crédito Habitação
       if (G.credito) {
         data.push(['═══ CRÉDITO HABITAÇÃO ═══', '']);
         data.push(['Dívida Atual', G.credito.dividaAtual || 0]);
         data.push(['Prestação Mensal', G.credito.prestacao || 0]);
         data.push(['Taxa de Juro', `${G.credito.taxaJuro || 0}%`]);
         data.push(['Data Fim', G.credito.dataFim || '-']);
       }
       
       const headerRows = [];
       data.forEach((row, i) => {
         if (row[0]?.toString().includes('═══') || ['Data', 'Descrição', 'Destino'].includes(row[0])) {
           headerRows.push(i + 1);
         }
       });
       
       sheetsData.push({ 
         title: `${String(idx + 1).padStart(2, '0')} ${mesNome}`, 
         data, 
         headerRows 
       });
     });
     
     // SHEET SARA
     const saraData = [
       [`FINANÇAS SARA - ${ano}`],
       [],
       ['═══ RENDIMENTOS MENSAIS ═══', ''],
       ['Descrição', 'Valor'],
     ];
     G.sara.rend.forEach(r => saraData.push([r.desc, r.val]));
     saraData.push(['TOTAL RENDIMENTOS', G.sara.rend.reduce((a, r) => a + r.val, 0)]);
     saraData.push([]);
     saraData.push(['═══ DESPESAS MENSAIS ═══', '']);
     saraData.push(['Descrição', 'Valor']);
     G.sara.desp.forEach(d => saraData.push([d.desc, d.val]));
     saraData.push(['TOTAL DESPESAS', G.sara.desp.reduce((a, d) => a + d.val, 0)]);
     saraData.push([]);
     const cartaoRef = G.sara.rend.find(r => r.isCR)?.val || 0;
     const segFilhos = G.despABanca.find(d => d.desc.toLowerCase().includes('seguro filhos'))?.val || 0;
     const parteABancaSara = (G.despABanca.reduce((a, d) => a + d.val, 0) * (1 - G.contrib / 100)) - cartaoRef - segFilhos;
     const sobraSara = G.sara.rend.reduce((a, r) => a + r.val, 0) - G.sara.desp.reduce((a, d) => a + d.val, 0) - parteABancaSara;
     saraData.push(['═══ RESUMO ═══', '']);
     saraData.push(['Contribuição ABanca', parteABancaSara]);
     saraData.push(['SOBRA MENSAL', sobraSara]);
     saraData.push([]);
     saraData.push(['═══ ALOCAÇÕES ═══', '']);
     G.sara.aloc.forEach(a => saraData.push([a.desc, a.val]));
     sheetsData.push({ title: '👩 Sara', data: saraData, headerRows: [3, 8] });
     
     const url = await createGoogleSheet(`Dashboard Financeiro ${ano}`, sheetsData);
     window.open(url, '_blank');
     
   } catch (e) {
     console.error(e);
     alert('Erro ao exportar: ' + e.message);
   }
   setExporting(false);
 };

 // Função para resetar todos os dados
 const handleResetAll = () => {
   if (window.confirm('⚠️ ATENÇÃO: Isto vai apagar TODOS os teus dados!\n\nReceitas, investimentos, portfolio, histórico - TUDO será perdido.\n\nTens a certeza que queres continuar?')) {
     if (window.confirm('🔴 ÚLTIMA CONFIRMAÇÃO:\n\nEsta ação é IRREVERSÍVEL!\n\nClica OK para apagar tudo.')) {
       saveUndo();
       setG(defG);
       setM({});
       setHasChanges(true);
       alert('✅ Todos os dados foram resetados para os valores iniciais.');
     }
   }
 };

 // ========== NOVAS FUNCIONALIDADES ==========
 
 // Função de pesquisa global
 const searchResults = useCallback(() => {
   if (!searchQuery.trim()) return [];
   const q = searchQuery.toLowerCase();
   const results = [];
   
   // Pesquisar em clientes
   clientes.forEach(c => {
     if (c.nome.toLowerCase().includes(q)) {
       results.push({type: 'cliente', item: c, label: `Cliente: ${c.nome}`});
     }
   });
   
   // Pesquisar em receitas (todos os meses)
   Object.entries(M).forEach(([mesKey, mesData]) => {
     mesData.regCom?.forEach(r => {
       if (r.descricao?.toLowerCase().includes(q)) {
         results.push({type: 'receita', item: r, mesKey, label: `Receita (${mesKey}): ${r.descricao} - ${fmt(r.valor)}`});
       }
     });
     mesData.regSem?.forEach(r => {
       if (r.descricao?.toLowerCase().includes(q)) {
         results.push({type: 'receita', item: r, mesKey, label: `Receita (${mesKey}): ${r.descricao} - ${fmt(r.valor)}`});
       }
     });
   });
   
   // Pesquisar em despesas
   despABanca.forEach(d => {
     if (d.desc.toLowerCase().includes(q)) {
       results.push({type: 'despesa', item: d, label: `Despesa Casal: ${d.desc} - ${fmt(d.val)}`});
     }
   });
   despPess.forEach(d => {
     if (d.desc.toLowerCase().includes(q)) {
       results.push({type: 'despesa', item: d, label: `Despesa Pessoal: ${d.desc} - ${fmt(d.val)}`});
     }
   });
   
   return results.slice(0, 20);
 }, [searchQuery, M, clientes, despABanca, despPess]);

 // Calcular alertas ativos
 const getActiveAlerts = useCallback(() => {
   const alerts = [];
   const alertas = G.alertas || [];
   const tarefas = G.tarefas || [];
   const tarefasConcluidas = G.tarefasConcluidas || {};
   
   // Taxa de poupança
   const taxaPoupanca = recLiq > 0 ? ((totInv + (restante * (alocAmort/100))) / recLiq * 100) : 0;
   
   alertas.forEach(a => {
     if (!a.ativo) return;
     
     if (a.tipo === 'despesa' && a.campo === 'despPess' && totPess > a.limite) {
       alerts.push({...a, msg: `⚠️ ${a.desc}: ${fmt(totPess)} (limite: ${fmt(a.limite)})`});
     }
     if (a.tipo === 'poupanca' && taxaPoupanca < a.limite) {
       alerts.push({...a, msg: `⚠️ ${a.desc}: ${taxaPoupanca.toFixed(1)}%`});
     }
   });
   
   // Verificar metas (usando progresso esperado)
   const mesAtualNum = meses.indexOf(mesAtualSistema) + 1;
   const progressoEsperado = mesAtualNum / 12;
   const totaisAnuais = calcularTotaisAnuais();
   
   if (totaisAnuais.receitasAnuais < metas.receitas * progressoEsperado * 0.8) {
     alerts.push({tipo: 'meta', msg: `📉 Receitas abaixo do esperado: ${fmt(totaisAnuais.receitasAnuais)} vs ${fmt(metas.receitas * progressoEsperado)}`});
   }
   
   // Verificar tarefas pendentes/atrasadas
   const hoje = new Date();
   const diaHoje = hoje.getDate();
   const mesHoje = hoje.getMonth() + 1;
   const anoHoje = hoje.getFullYear();
   
   tarefas.filter(t => t.ativo).forEach(t => {
     const deveFazer = t.freq === 'mensal' || (t.meses && t.meses.includes(mesHoje));
     if (!deveFazer) return;
     
     const key = `${anoHoje}-${mesHoje}-${t.id}`;
     const concluida = tarefasConcluidas[key];
     
     if (!concluida) {
       if (t.dia < diaHoje) {
         alerts.push({tipo: 'tarefa', msg: `🚨 Tarefa atrasada: ${t.desc} (dia ${t.dia})`});
       } else if (t.dia <= diaHoje + 3) {
         alerts.push({tipo: 'tarefa', msg: `⏰ Em breve: ${t.desc} (dia ${t.dia})`});
       }
     }
   });
   
   // Verificar transferências do mês (dias 25 e 31)
   if (diaHoje >= 24 && diaHoje <= 26) {
     if (!transf.abanca) alerts.push({tipo: 'transf', msg: `💳 Transferir para conta conjunta: ${fmt(minhaAB)}`});
     if (!transf.activo) alerts.push({tipo: 'transf', msg: `💳 Transferir para Activo Bank: ${fmt(totPess)}`});
   }
   if (diaHoje >= 30 || diaHoje <= 2) {
     if (!transf.trade) alerts.push({tipo: 'transf', msg: `💳 Transferir para Trade Republic: ${fmt(transfTR)}`});
     if (!transf.revolut) alerts.push({tipo: 'transf', msg: `💳 Transferir para Revolut (férias): ${fmt(ferias)}`});
   }
   
   return alerts;
 }, [G, recLiq, totInv, restante, alocAmort, totPess, metas, transf, minhaAB, transfTR, ferias]);

 // Projeção de fim de ano
 const getProjecaoAnual = useCallback(() => {
   const h = getHist();
   const hAno = h.filter(x => x.ano === ano);
   const mesesComDados = hAno.filter(x => x.tot > 0).length;
   if (mesesComDados === 0) return null;
   
   const totalAtual = hAno.reduce((a, x) => a + x.tot, 0);
   const mediaMensal = totalAtual / mesesComDados;
   
   // Meses restantes até ao fim do ano (baseado no mês atual do sistema, não nos dados)
   const mesAtualNum = meses.indexOf(mesAtualSistema) + 1;
   const mesesRestantes = ano === anoAtualSistema ? Math.max(0, 12 - mesAtualNum) : 0;
   
   // Projeção: se estamos no ano atual, projeta os meses restantes; senão, usa o total real
   const projecao = ano === anoAtualSistema ? totalAtual + (mediaMensal * mesesRestantes) : totalAtual;
   const diffMeta = projecao - metas.receitas;
   
   return { totalAtual, mediaMensal, mesesComDados, mesesRestantes, projecao, diffMeta };
 }, [ano, metas.receitas, getHist]);

 // Taxa de poupança
 const taxaPoupanca = recLiq > 0 ? ((totInv + (restante > 0 ? restante : 0)) / recLiq * 100) : 0;

 // Previsão de IRS (simplificada para freelancers)
 const getPrevisaoIRS = useCallback(() => {
   const h = getHist();
   const hAno = h.filter(x => x.ano === anoAtualSistema);
   const receitasAnuais = hAno.reduce((a, x) => a + x.tot, 0);
   
   // Escalões IRS 2024 simplificados
   const escaloes = [
     { limite: 7703, taxa: 0.145 },
     { limite: 11623, taxa: 0.21 },
     { limite: 16472, taxa: 0.265 },
     { limite: 21321, taxa: 0.285 },
     { limite: 27146, taxa: 0.35 },
     { limite: 39791, taxa: 0.37 },
     { limite: 51997, taxa: 0.435 },
     { limite: 81199, taxa: 0.45 },
     { limite: Infinity, taxa: 0.48 }
   ];
   
   // Rendimento coletável (75% para trabalhadores independentes com regime simplificado)
   const coeficiente = 0.75;
   const rendColetavel = receitasAnuais * coeficiente;
   
   // Calcular imposto por escalões
   let imposto = 0;
   let anterior = 0;
   for (const e of escaloes) {
     if (rendColetavel > anterior) {
       const base = Math.min(rendColetavel, e.limite) - anterior;
       imposto += base * e.taxa;
       anterior = e.limite;
     }
   }
   
   // Deduções estimadas (pessoal + despesas gerais)
   const deducoes = 4104 + Math.min(receitasAnuais * 0.15, 250);
   const impostoFinal = Math.max(0, imposto - deducoes);
   
   // Retenções já feitas (estimada com base na taxa configurada)
   const receitasComTaxas = hAno.reduce((a, x) => a + x.com, 0);
   const retencoes = receitasComTaxas * (taxa / 100);
   
   const aPagarReceber = retencoes - impostoFinal;
   
   return {
     receitasAnuais,
     rendColetavel,
     impostoEstimado: impostoFinal,
     retencoes,
     aPagarReceber,
     taxaEfetiva: receitasAnuais > 0 ? (impostoFinal / receitasAnuais * 100) : 0
   };
 }, [getHist, taxa]);

 // Comparação de despesas mês a mês
 const getComparacaoDespesas = useCallback(() => {
   const mesAnteriorIdx = meses.indexOf(mes) === 0 ? 11 : meses.indexOf(mes) - 1;
   const anoAnterior = meses.indexOf(mes) === 0 ? ano - 1 : ano;
   const keyAnterior = `${anoAnterior}-${mesAnteriorIdx + 1}`;
   
   const mesAtualData = M[mesKey] || {};
   const mesAnteriorData = M[keyAnterior] || {};
   
   // Investimentos
   const invAtual = (mesAtualData.inv || []).reduce((a, i) => a + i.val, 0);
   const invAnterior = (mesAnteriorData.inv || []).reduce((a, i) => a + i.val, 0);
   
   // Receitas
   const recAtual = (mesAtualData.regCom || []).reduce((a, r) => a + r.val, 0) + (mesAtualData.regSem || []).reduce((a, r) => a + r.val, 0);
   const recAnterior = (mesAnteriorData.regCom || []).reduce((a, r) => a + r.val, 0) + (mesAnteriorData.regSem || []).reduce((a, r) => a + r.val, 0);
   
   return {
     mesAnterior: meses[mesAnteriorIdx],
     investimentos: { atual: invAtual, anterior: invAnterior, diff: invAtual - invAnterior },
     receitas: { atual: recAtual, anterior: recAnterior, diff: recAtual - recAnterior },
     despCasal: { atual: totAB, anterior: totAB, diff: 0 }, // Despesas fixas são iguais
     despPessoais: { atual: totPess, anterior: totPess, diff: 0 }
   };
 }, [mes, ano, mesKey, M, totAB, totPess]);

 // Património líquido (Portfolio + Valor líquido da casa)
 const getPatrimonioLiquido = useCallback(() => {
   const totPortfolio = portfolio.reduce((a, p) => a + p.val, 0);
   const valorCasa = credito.valorCasa || 0;
   const dividaAtual = credito.dividaAtual || 0;
   const casaLiquida = valorCasa - dividaAtual;
   const total = totPortfolio + casaLiquida;
   
   return { portfolio: totPortfolio, casaLiquida, valorCasa, dividaAtual, total };
 }, [portfolio, credito]);

 // Tarefas pendentes (para notificações no Resumo)
 const getTarefasPendentes = useCallback(() => {
   const tarefas = G.tarefas || [];
   const tarefasConcluidas = G.tarefasConcluidas || {};
   const hoje = new Date();
   const mesAtual = hoje.getMonth() + 1;
   const anoAtual = hoje.getFullYear();
   const diaAtual = hoje.getDate();
   
   const tarefasMes = tarefas.filter(t => {
     if (!t.ativo) return false;
     if (t.freq === 'mensal') return true;
     if (t.freq === 'trimestral' || t.freq === 'anual') return t.meses?.includes(mesAtual);
     return false;
   }).map(t => ({
     ...t,
     key: `${anoAtual}-${mesAtual}-${t.id}`,
     concluida: tarefasConcluidas[`${anoAtual}-${mesAtual}-${t.id}`] || false,
     atrasada: t.dia < diaAtual,
     proxima: t.dia >= diaAtual && t.dia <= diaAtual + 5
   }));
   
   const pendentes = tarefasMes.filter(t => !t.concluida);
   const atrasadas = pendentes.filter(t => t.atrasada);
   const proximas = pendentes.filter(t => t.proxima);
   
   // Próximas 5 tarefas importantes (incluindo meses futuros)
   const proximasTarefas = [];
   for (let i = 0; i < 3 && proximasTarefas.length < 5; i++) {
     const mesCheck = ((mesAtual - 1 + i) % 12) + 1;
     const anoCheck = mesAtual + i > 12 ? anoAtual + 1 : anoAtual;
     tarefas.filter(t => {
       if (!t.ativo) return false;
       if (t.freq === 'mensal') return true;
       if (t.freq === 'trimestral' || t.freq === 'anual') return t.meses?.includes(mesCheck);
       return false;
     }).forEach(t => {
       const key = `${anoCheck}-${mesCheck}-${t.id}`;
       if (!tarefasConcluidas[key]) {
         const dataT = new Date(anoCheck, mesCheck - 1, t.dia);
         if (dataT >= hoje && proximasTarefas.length < 5) {
           proximasTarefas.push({...t, data: dataT, mesNome: meses[mesCheck-1]});
         }
       }
     });
   }
   proximasTarefas.sort((a, b) => a.data - b.data);
   
   return { pendentes, atrasadas, proximas, proximasTarefas: proximasTarefas.slice(0, 3) };
 }, [G.tarefas, G.tarefasConcluidas]);

 // Comparação ano a ano
 const getComparacaoAnos = useCallback((ano1, ano2) => {
   const h = getHist();
   return meses.map((m, i) => {
     const d1 = h.find(x => x.ano === ano1 && x.mes === i + 1);
     const d2 = h.find(x => x.ano === ano2 && x.mes === i + 1);
     return {
       mes: m.slice(0, 3),
       [ano1]: d1?.tot || 0,
       [ano2]: d2?.tot || 0
     };
   });
 }, [getHist]);

 // Benchmarks nacionais (valores aproximados Portugal)
 const benchmarks = {
   habitacao: 35, // % do rendimento
   alimentacao: 15,
   transporte: 10,
   poupanca: 10
 };

 const getComparacaoBenchmarks = useCallback(() => {
   const rendTotal = recLiq || 1;
   const gastosHab = despABanca.filter(d => d.cat === 'Habitação').reduce((a, d) => a + d.val, 0) * (contrib/100);
   const gastosAlim = despABanca.filter(d => d.cat === 'Alimentação').reduce((a, d) => a + d.val, 0) * (contrib/100);
   const gastosTrans = despPess.filter(d => d.cat === 'Transporte').reduce((a, d) => a + d.val, 0);
   
   return {
     habitacao: { atual: (gastosHab / rendTotal * 100), benchmark: benchmarks.habitacao },
     alimentacao: { atual: (gastosAlim / rendTotal * 100), benchmark: benchmarks.alimentacao },
     transporte: { atual: (gastosTrans / rendTotal * 100), benchmark: benchmarks.transporte },
     poupanca: { atual: taxaPoupanca, benchmark: benchmarks.poupanca }
   };
 }, [recLiq, despABanca, despPess, contrib, taxaPoupanca]);

 // Projeção de liquidação do crédito com amortizações planeadas
 const getProjecaoCredito = useCallback(() => {
   const {dividaAtual, taxaJuro, prestacao, amortizacoesPlaneadas = []} = credito;
   const taxaMensal = (taxaJuro / 100) / 12;
   
   let divida = dividaAtual;
   let meses = 0;
   const maxMeses = 500;
   const projecao = [{mes: 0, divida}];
   
   while (divida > 0 && meses < maxMeses) {
     meses++;
     const juros = divida * taxaMensal;
     const amortNormal = prestacao - juros;
     
     // Verificar amortização planeada para este mês
     const dataAtual = new Date();
     dataAtual.setMonth(dataAtual.getMonth() + meses);
     const mesKey = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}`;
     const amortExtra = amortizacoesPlaneadas.find(a => a.data === mesKey)?.valor || 0;
     
     divida = Math.max(0, divida - amortNormal - amortExtra);
     
     if (meses % 12 === 0 || divida <= 0) {
       projecao.push({mes: meses, divida, ano: Math.floor(meses / 12)});
     }
   }
   
   return { meses, anos: Math.floor(meses / 12), mesesRestantes: meses % 12, projecao };
 }, [credito]);

 // Importar CSV
 const handleImportCSV = (csvText) => {
   try {
     const lines = csvText.trim().split('\n');
     const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
     
     const dataIdx = headers.findIndex(h => h.includes('data'));
     const descIdx = headers.findIndex(h => h.includes('desc'));
     const valorIdx = headers.findIndex(h => h.includes('valor') || h.includes('amount'));
     const tipoIdx = headers.findIndex(h => h.includes('tipo') || h.includes('type'));
     
     if (valorIdx === -1) {
       alert('❌ CSV deve ter coluna "valor" ou "amount"');
       return;
     }
     
     const registos = [];
     for (let i = 1; i < lines.length; i++) {
       const cols = lines[i].split(',').map(c => c.trim());
       if (cols.length < 2) continue;
       
       const valor = parseFloat(cols[valorIdx]?.replace(/[€\s]/g, '').replace(',', '.')) || 0;
       if (valor <= 0) continue;
       
       registos.push({
         id: Date.now() + i,
         clienteId: clientes[0]?.id || 1,
         valor,
         data: cols[dataIdx] || new Date().toISOString().split('T')[0],
         descricao: cols[descIdx] || `Importado ${i}`
       });
     }
     
     if (registos.length === 0) {
       alert('❌ Nenhum registo válido encontrado no CSV');
       return;
     }
     
     saveUndo();
     setM(prev => ({
       ...prev,
       [mesKey]: {
         ...(prev[mesKey] || defM),
         regCom: [...(prev[mesKey]?.regCom || []), ...registos]
       }
     }));
     
     alert(`✅ ${registos.length} registos importados!`);
     setShowImportCSV(false);
   } catch (e) {
     alert('❌ Erro ao processar CSV: ' + e.message);
   }
 };

 // Exportar PDF (simples - abre janela de impressão)
 const exportPDF = () => {
   window.print();
 };

 // Gerar Relatório Anual
 const [showRelatorio, setShowRelatorio] = useState(false);
 
 const gerarRelatorioAnual = (anoRel) => {
   const h = getHist().filter(x => x.ano === anoRel);
   const totalReceitas = h.reduce((a, x) => a + x.tot, 0);
   const totalComTaxas = h.reduce((a, x) => a + x.com, 0);
   const totalSemTaxas = h.reduce((a, x) => a + x.sem, 0);
   const mediaMensal = h.length > 0 ? totalReceitas / h.length : 0;
   
   // Por cliente
   const porCliente = clientes.map(c => {
     let total = 0;
     Object.entries(M).forEach(([key, data]) => {
       const [a] = key.split('-').map(Number);
       if (a === anoRel) {
         total += (data.regCom || []).filter(r => r.cid === c.id).reduce((acc, r) => acc + r.val, 0);
         total += (data.regSem || []).filter(r => r.cid === c.id).reduce((acc, r) => acc + r.val, 0);
       }
     });
     return { ...c, total };
   }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
   
   // Investimentos do ano
   let totalInvestido = 0;
   Object.entries(M).forEach(([key, data]) => {
     const [a] = key.split('-').map(Number);
     if (a === anoRel) {
       totalInvestido += (data.inv || []).reduce((acc, i) => acc + i.val, 0);
     }
   });
   
   // Impostos estimados
   const impostoEstimado = totalComTaxas * (taxa / 100);
   
   return {
     ano: anoRel,
     totalReceitas,
     totalComTaxas,
     totalSemTaxas,
     mediaMensal,
     porCliente,
     totalInvestido,
     impostoEstimado,
     mesesComDados: h.length,
     melhorMes: h.length > 0 ? h.reduce((a, x) => x.tot > a.tot ? x : a, h[0]) : null,
     piorMes: h.filter(x => x.tot > 0).length > 0 ? h.filter(x => x.tot > 0).reduce((a, x) => x.tot < a.tot ? x : a, h[0]) : null
   };
 };
 
 const RelatorioAnualModal = () => {
   const [anoRelatorio, setAnoRelatorio] = useState(anoAtualSistema);
   const relatorio = gerarRelatorioAnual(anoRelatorio);
   
   if (!showRelatorio) return null;
   
   return (
     <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center overflow-y-auto py-8" onClick={() => setShowRelatorio(false)}>
       <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-slate-700 flex justify-between items-center no-print">
           <div className="flex items-center gap-4">
             <h3 className="text-xl font-bold">📊 Relatório Anual</h3>
             <select value={anoRelatorio} onChange={e => setAnoRelatorio(+e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-sm">
               {anos.map(a => <option key={a} value={a}>{a}</option>)}
             </select>
           </div>
           <div className="flex gap-2">
             <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium">🖨️ Imprimir</button>
             <button onClick={() => setShowRelatorio(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
           </div>
         </div>
         
         <div className="p-6 space-y-6" id="relatorio-anual">
           <div className="text-center pb-4 border-b border-slate-700">
             <h1 className="text-3xl font-bold mb-2">Relatório Financeiro {relatorio.ano}</h1>
             <p className="text-slate-400">Dashboard Freelance</p>
           </div>
           
           {/* RESUMO */}
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
             <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-center">
               <p className="text-sm text-slate-400">Total Receitas</p>
               <p className="text-2xl font-bold text-blue-400">{fmt(relatorio.totalReceitas)}</p>
             </div>
             <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
               <p className="text-sm text-slate-400">Média Mensal</p>
               <p className="text-2xl font-bold text-emerald-400">{fmt(relatorio.mediaMensal)}</p>
             </div>
             <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl text-center">
               <p className="text-sm text-slate-400">Total Investido</p>
               <p className="text-2xl font-bold text-purple-400">{fmt(relatorio.totalInvestido)}</p>
             </div>
             <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl text-center">
               <p className="text-sm text-slate-400">Impostos (est.)</p>
               <p className="text-2xl font-bold text-orange-400">{fmt(relatorio.impostoEstimado)}</p>
             </div>
           </div>
           
           {/* DETALHES */}
           <div className="grid grid-cols-2 gap-6">
             <div className="bg-slate-700/30 rounded-xl p-4">
               <h4 className="font-semibold mb-3">📊 Receitas por Tipo</h4>
               <div className="space-y-2">
                 <div className="flex justify-between">
                   <span className="text-slate-400">Com retenção</span>
                   <span className="font-medium text-orange-400">{fmt(relatorio.totalComTaxas)}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-slate-400">Sem retenção</span>
                   <span className="font-medium text-emerald-400">{fmt(relatorio.totalSemTaxas)}</span>
                 </div>
               </div>
             </div>
             
             <div className="bg-slate-700/30 rounded-xl p-4">
               <h4 className="font-semibold mb-3">📈 Destaques</h4>
               <div className="space-y-2">
                 {relatorio.melhorMes && (
                   <div className="flex justify-between">
                     <span className="text-slate-400">Melhor mês</span>
                     <span className="font-medium text-emerald-400">{relatorio.melhorMes.nome}: {fmt(relatorio.melhorMes.tot)}</span>
                   </div>
                 )}
                 {relatorio.piorMes && (
                   <div className="flex justify-between">
                     <span className="text-slate-400">Mês mais fraco</span>
                     <span className="font-medium text-orange-400">{relatorio.piorMes.nome}: {fmt(relatorio.piorMes.tot)}</span>
                   </div>
                 )}
                 <div className="flex justify-between">
                   <span className="text-slate-400">Meses com dados</span>
                   <span className="font-medium">{relatorio.mesesComDados}/12</span>
                 </div>
               </div>
             </div>
           </div>
           
           {/* POR CLIENTE */}
           {relatorio.porCliente.length > 0 && (
             <div className="bg-slate-700/30 rounded-xl p-4">
               <h4 className="font-semibold mb-3">👥 Receitas por Cliente</h4>
               <div className="space-y-2">
                 {relatorio.porCliente.map(c => (
                   <div key={c.id} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg">
                     <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-full" style={{background: c.cor}}/>
                       <span>{c.nome}</span>
                     </div>
                     <div className="flex items-center gap-3">
                       <span className="text-sm text-slate-400">{((c.total / relatorio.totalReceitas) * 100).toFixed(0)}%</span>
                       <span className="font-bold">{fmt(c.total)}</span>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
           )}
           
           <p className="text-center text-xs text-slate-500 pt-4 border-t border-slate-700">
             Gerado em {new Date().toLocaleDateString('pt-PT')} · Dashboard Financeiro Freelance
           </p>
         </div>
       </div>
     </div>
   );
 };

 // Modal de Pesquisa
 const SearchModal = () => {
   if (!showSearch) return null;
   const results = searchResults();
   
   return (
     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-20" onClick={() => setShowSearch(false)}>
       <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-slate-700">
           <div className="flex items-center gap-3">
             <span className="text-2xl">🔍</span>
             <input
               autoFocus
               type="text"
               className="flex-1 bg-transparent text-xl outline-none text-white placeholder-slate-500"
               placeholder="Pesquisar clientes, receitas, despesas..."
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
             />
             <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-400">ESC</kbd>
           </div>
         </div>
         <div className="max-h-96 overflow-y-auto p-2">
           {results.length === 0 && searchQuery && (
             <p className="text-center py-8 text-slate-500">Nenhum resultado para "{searchQuery}"</p>
           )}
           {results.map((r, i) => (
             <div key={i} className="p-3 hover:bg-slate-700/50 rounded-xl cursor-pointer flex items-center gap-3">
               <span className="text-lg">{r.type === 'cliente' ? '👤' : r.type === 'receita' ? '💰' : '💸'}</span>
               <span className="text-slate-300">{r.label}</span>
             </div>
           ))}
         </div>
       </div>
     </div>
   );
 };

 // Modal de Alertas
 const AlertsModal = () => {
   if (!showAlerts) return null;
   const alerts = getActiveAlerts();
   const alertas = G.alertas || [];
   
   return (
     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAlerts(false)}>
       <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-slate-700 flex justify-between items-center">
           <h3 className="text-lg font-semibold">🔔 Alertas e Notificações</h3>
           <button onClick={() => setShowAlerts(false)} className="text-slate-400 hover:text-white">✕</button>
         </div>
         <div className="p-4 space-y-4">
           {alerts.length === 0 ? (
             <p className="text-center py-4 text-emerald-400">✅ Tudo em ordem! Sem alertas ativos.</p>
           ) : (
             <div className="space-y-2">
               {alerts.map((a, i) => (
                 <div key={i} className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400">
                   {a.msg}
                 </div>
               ))}
             </div>
           )}
           
           <div className="pt-4 border-t border-slate-700">
             <h4 className="text-sm font-semibold text-slate-400 mb-3">Configurar Alertas</h4>
             {alertas.map(a => (
               <div key={a.id} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg mb-2">
                 <span className="text-sm text-slate-300">{a.desc}</span>
                 <input
                   type="checkbox"
                   checked={a.ativo}
                   onChange={e => uG('alertas', alertas.map(x => x.id === a.id ? {...x, ativo: e.target.checked} : x))}
                   className="w-5 h-5 accent-blue-500"
                 />
               </div>
             ))}
           </div>
         </div>
       </div>
     </div>
   );
 };

 // Modal de Importar CSV
 const ImportCSVModal = () => {
   const [csvText, setCsvText] = useState('');
   if (!showImportCSV) return null;
   
   return (
     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowImportCSV(false)}>
       <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-slate-700 flex justify-between items-center">
           <h3 className="text-lg font-semibold">📥 Importar CSV</h3>
           <button onClick={() => setShowImportCSV(false)} className="text-slate-400 hover:text-white">✕</button>
         </div>
         <div className="p-4 space-y-4">
           <p className="text-sm text-slate-400">Cola o conteúdo do CSV. Deve ter colunas: data, descricao, valor</p>
           <textarea
             className="w-full h-48 bg-slate-900 border border-slate-600 rounded-xl p-3 text-sm font-mono text-slate-300 outline-none"
             placeholder="data,descricao,valor&#10;2025-01-15,Projeto X,1500&#10;2025-01-20,Consultoria,800"
             value={csvText}
             onChange={e => setCsvText(e.target.value)}
           />
           <div className="flex justify-end gap-3">
             <Button variant="secondary" onClick={() => setShowImportCSV(false)}>Cancelar</Button>
             <Button onClick={() => handleImportCSV(csvText)}>Importar</Button>
           </div>
         </div>
       </div>
     </div>
   );
 };

 // Modal de Backup
 const BackupModal = () => {
 if (!showBackupModal) return null;
 
 const handleImport = () => {
 try {
 const data = JSON.parse(backupData);
 if (data.g && data.m) {
 setG(data.g);
 setM(data.m);
 setBackupStatus('✅ Dados importados com sucesso!');
 setTimeout(() => setShowBackupModal(false), 1500);
 } else {
 setBackupStatus('❌ Formato de backup inválido!');
 }
 } catch (err) {
 setBackupStatus('❌ Erro: ' + err.message);
 }
 };
 
 const generateExcelData = () => {
 // Gerar CSV com todos os dados formatados
 let csv = '';
 
 // RESUMO ANUAL
 csv += 'DASHBOARD FINANCEIRO - RELATÓRIO ANUAL ' + ano + '\n';
 csv += 'Exportado em: ' + new Date().toLocaleDateString('pt-PT') + '\n\n';
 
 // RECEITAS POR MÊS
 csv += '═══════════════════════════════════════\n';
 csv += 'RECEITAS POR MÊS\n';
 csv += '═══════════════════════════════════════\n';
 csv += 'Mês;Com Taxas;Sem Taxas;Total;Reserva Taxas;Líquido\n';
 
 let totalAnualCom = 0, totalAnualSem = 0, totalAnualTax = 0;
 meses.forEach((mesNome, idx) => {
 const key = `${ano}-${idx + 1}`;
 const mesData = M[key] || {};
 const com = mesData.regCom?.reduce((a, r) => a + r.val, 0) || 0;
 const sem = mesData.regSem?.reduce((a, r) => a + r.val, 0) || 0;
 const tot = com + sem;
 const tax = com * (G.taxa / 100);
 const liq = tot - tax;
 totalAnualCom += com;
 totalAnualSem += sem;
 totalAnualTax += tax;
 if (tot > 0) {
 csv += `${mesNome};${com.toFixed(2)};${sem.toFixed(2)};${tot.toFixed(2)};${tax.toFixed(2)};${liq.toFixed(2)}\n`;
 }
 });
 csv += `TOTAL ANUAL;${totalAnualCom.toFixed(2)};${totalAnualSem.toFixed(2)};${(totalAnualCom + totalAnualSem).toFixed(2)};${totalAnualTax.toFixed(2)};${(totalAnualCom + totalAnualSem - totalAnualTax).toFixed(2)}\n\n`;
 
 // RECEITAS POR CLIENTE
 csv += '═══════════════════════════════════════\n';
 csv += 'RECEITAS POR CLIENTE\n';
 csv += '═══════════════════════════════════════\n';
 csv += 'Cliente;Com Taxas;Sem Taxas;Total\n';
 
 G.clientes.forEach(c => {
 let clienteCom = 0, clienteSem = 0;
 Object.keys(M).forEach(key => {
 if (key.startsWith(ano + '-')) {
 const mesData = M[key];
 clienteCom += mesData.regCom?.filter(r => r.cid === c.id).reduce((a, r) => a + r.val, 0) || 0;
 clienteSem += mesData.regSem?.filter(r => r.cid === c.id).reduce((a, r) => a + r.val, 0) || 0;
 }
 });
 if (clienteCom > 0 || clienteSem > 0) {
 csv += `${c.nome};${clienteCom.toFixed(2)};${clienteSem.toFixed(2)};${(clienteCom + clienteSem).toFixed(2)}\n`;
 }
 });
 csv += '\n';
 
 // DESPESAS FIXAS (ABANCA)
 csv += '═══════════════════════════════════════\n';
 csv += 'DESPESAS FIXAS (ABANCA)\n';
 csv += '═══════════════════════════════════════\n';
 csv += 'Descrição;Categoria;Valor;Minha Parte (' + G.contrib + '%)\n';
 
 let totalABanca = 0;
 G.despABanca.forEach(d => {
 totalABanca += d.val;
 csv += `${d.desc};${d.cat};${d.val.toFixed(2)};${(d.val * G.contrib / 100).toFixed(2)}\n`;
 });
 csv += `TOTAL;;${totalABanca.toFixed(2)};${(totalABanca * G.contrib / 100).toFixed(2)}\n\n`;
 
 // DESPESAS PESSOAIS
 csv += '═══════════════════════════════════════\n';
 csv += 'DESPESAS PESSOAIS\n';
 csv += '═══════════════════════════════════════\n';
 csv += 'Descrição;Categoria;Valor\n';
 
 let totalPessoais = 0;
 G.despPess.forEach(d => {
 totalPessoais += d.val;
 csv += `${d.desc};${d.cat};${d.val.toFixed(2)}\n`;
 });
 csv += `TOTAL;;${totalPessoais.toFixed(2)}\n\n`;
 
 // PORTFOLIO
 csv += '═══════════════════════════════════════\n';
 csv += 'PORTFOLIO DE INVESTIMENTOS\n';
 csv += '═══════════════════════════════════════\n';
 csv += 'Investimento;Categoria;Valor\n';
 
 const portfolioAtual = mesD.portfolio || portfolio;
 let totalPortfolio = 0;
 portfolioAtual.forEach(p => {
 if (p.val > 0) {
 totalPortfolio += p.val;
 csv += `${p.desc};${p.cat};${p.val.toFixed(2)}\n`;
 }
 });
 csv += `TOTAL;;${totalPortfolio.toFixed(2)}\n\n`;
 
 // EVOLUÇÃO PORTFOLIO
 if (G.portfolioHist?.length > 0) {
 csv += '═══════════════════════════════════════\n';
 csv += 'EVOLUÇÃO DO PORTFOLIO\n';
 csv += '═══════════════════════════════════════\n';
 csv += 'Data;Valor Total\n';
 G.portfolioHist.forEach(h => {
 const [y, m] = h.date.split('-').map(Number);
 csv += `${meses[m - 1]} ${y};${h.total.toFixed(2)}\n`;
 });
 csv += '\n';
 }
 
 // SARA
 csv += '═══════════════════════════════════════\n';
 csv += 'FINANÇAS SARA\n';
 csv += '═══════════════════════════════════════\n';
 csv += 'RENDIMENTOS\n';
 csv += 'Descrição;Valor\n';
 let totalSaraRend = 0;
 G.sara.rend.forEach(r => {
 totalSaraRend += r.val;
 csv += `${r.desc};${r.val.toFixed(2)}\n`;
 });
 csv += `TOTAL;${totalSaraRend.toFixed(2)}\n\n`;
 
 csv += 'DESPESAS\n';
 csv += 'Descrição;Valor\n';
 let totalSaraDesp = 0;
 G.sara.desp.forEach(d => {
 totalSaraDesp += d.val;
 csv += `${d.desc};${d.val.toFixed(2)}\n`;
 });
 csv += `TOTAL;${totalSaraDesp.toFixed(2)}\n\n`;
 
 // CRÉDITO HABITAÇÃO
 if (G.credito) {
 csv += '═══════════════════════════════════════\n';
 csv += 'CRÉDITO HABITAÇÃO\n';
 csv += '═══════════════════════════════════════\n';
 csv += `Dívida Atual;${(G.credito.dividaAtual || 0).toFixed(2)}\n`;
 csv += `Taxa de Juro;${(G.credito.taxaJuro || 0)}%\n`;
 }
 
 return csv;
 };
 
 return (
 <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
 <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-3xl max-h-[80vh] flex flex-col">
 <div className="flex justify-between items-center p-4 border-b border-slate-700">
 <h2 className="text-lg font-bold">
 {backupMode === 'export' ? '📋 Backup de Dados' : backupMode === 'import' ? '📤 Restaurar Dados' : '📊 Exportar para Excel'}
 </h2>
 <button onClick={() => setShowBackupModal(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
 </div>
 
 <div className="p-4 flex-1 overflow-hidden flex flex-col">
 {backupMode === 'export' ? (
 <>
 <p className="text-sm text-slate-400 mb-3">
 Seleciona todo o texto abaixo (Ctrl+A), copia (Ctrl+C) e guarda num ficheiro .json
 </p>
 <textarea 
 className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs font-mono text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
 value={backupData}
 readOnly
 onClick={(e) => e.target.select()}
 />
 </>
 ) : backupMode === 'import' ? (
 <>
 <p className="text-sm text-slate-400 mb-3">
 Cola o conteúdo do ficheiro de backup JSON abaixo:
 </p>
 <textarea 
 className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs font-mono text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
 value={backupData}
 onChange={(e) => setBackupData(e.target.value)}
 placeholder='{"g": {...}, "m": {...}}'
 />
 </>
 ) : (
 <>
 <p className="text-sm text-slate-400 mb-3">
 Dados formatados para Excel/Google Sheets. Copia e cola numa folha de cálculo.
 <br /><span className="text-xs text-slate-500">Dica: Ao colar, usa "Colar especial" → "Separado por ponto e vírgula"</span>
 </p>
 <textarea 
 className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs font-mono text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
 value={generateExcelData()}
 readOnly
 onClick={(e) => e.target.select()}
 />
 </>
 )}
 
 {backupStatus && (
 <p className={`mt-3 text-sm font-medium ${backupStatus.includes('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
 {backupStatus}
 </p>
 )}
 </div>
 
 <div className="flex justify-end gap-3 p-4 border-t border-slate-700">
 <button 
 onClick={() => setShowBackupModal(false)}
 className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300"
 >
 Fechar
 </button>
 {backupMode === 'import' && (
 <button 
 onClick={handleImport}
 className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
 >
 Importar Dados
 </button>
 )}
 </div>
 </div>
 </div>
 );
 };

 return (
 <div className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${theme === 'light' ? 'bg-gradient-to-br from-slate-100 via-slate-50 to-white text-slate-900' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white'}`}>
 <BackupModal />
 <SearchModal />
 <AlertsModal />
 <ImportCSVModal />
 <RelatorioAnualModal />
 <ShortcutsModal />
 {isOffline && (
   <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white text-center py-1 text-sm z-[100]">
     ⚠️ Offline - As alterações serão guardadas quando voltar a ligação
   </div>
 )}
 <style>{`
   ${theme === 'light' 
     ? `
       select option{background:#f8fafc;color:#1e293b}
       select option:checked{background:#3b82f6;color:white}
       .text-slate-400{color:#64748b!important}
       .text-slate-500{color:#64748b!important}
       .text-slate-300{color:#475569!important}
       .text-white{color:#0f172a!important}
       .bg-slate-700\\/30{background:rgb(241 245 249)!important}
       .bg-slate-700\\/50{background:rgb(241 245 249)!important}
       .bg-slate-700\\/20{background:rgb(248 250 252)!important}
       .bg-slate-800\\/30{background:rgb(248 250 252)!important}
       .hover\\:bg-slate-700\\/50:hover{background:rgb(226 232 240)!important}
       .hover\\:bg-slate-600:hover{background:rgb(226 232 240)!important}
       .border-slate-700{border-color:#e2e8f0!important}
       .border-slate-700\\/50{border-color:#e2e8f0!important}
       .border-slate-600{border-color:#cbd5e1!important}
       .bg-slate-700{background:rgb(241 245 249)!important}
       .bg-slate-800{background:rgb(255 255 255)!important}
       ` 
     : `select option{background:#1e293b;color:#e2e8f0}select option:checked{background:#3b82f6}`}
   ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${theme === 'light' ? '#cbd5e1' : '#475569'};border-radius:3px}::-webkit-scrollbar-thumb:hover{background:${theme === 'light' ? '#94a3b8' : '#64748b'}}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}.scrollbar-hide::-webkit-scrollbar{display:none}@media print{.no-print{display:none!important}}
 `}</style>
 
 <header className={`${theme === 'light' ? 'bg-white/80 border-slate-200' : 'bg-slate-800/50 border-slate-700/50'} backdrop-blur-xl border-b px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-50 no-print`}>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">💎 Dashboard</h1>
              <div className="flex gap-2">
                <select value={mes} onChange={e=>setMes(e.target.value)} className={`${theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-slate-700/50 text-white'} border rounded-xl px-2 sm:px-3 py-1.5 text-sm focus:outline-none appearance-none cursor-pointer ${isMesAtual(mes, ano) ? 'border-emerald-500 ring-1 ring-emerald-500/50' : theme === 'light' ? 'border-slate-300' : 'border-slate-600'}`}>
                  {meses.map(m=><option key={m} value={m}>{m}{m === mesAtualSistema ? ' •' : ''}</option>)}
                </select>
                <select value={ano} onChange={e=>setAno(+e.target.value)} className={`${theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-slate-700/50 text-white'} border rounded-xl px-2 sm:px-3 py-1.5 text-sm focus:outline-none appearance-none cursor-pointer ${isMesAtual(mes, ano) ? 'border-emerald-500 ring-1 ring-emerald-500/50' : theme === 'light' ? 'border-slate-300' : 'border-slate-600'}`}>
                  {anos.map(a=><option key={a} value={a}>{a}{a === anoAtualSistema ? ' •' : ''}</option>)}
                </select>
                {!isMesAtual(mes, ano) && (
                  <button onClick={() => { setMes(mesAtualSistema); setAno(anoAtualSistema); }} className="px-2 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400" title="Ir para mês atual">Hoje</button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
              <div className="flex gap-1 sm:gap-2 flex-wrap items-center">
                {/* Undo/Redo */}
                <div className="flex gap-0.5">
                  <button onClick={handleUndo} disabled={undoHistory.length === 0} className={`px-2 py-1.5 text-xs font-medium rounded-l-lg ${undoHistory.length > 0 ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400' : theme === 'light' ? 'bg-slate-200 text-slate-400' : 'bg-slate-700/50 text-slate-500'} ${undoHistory.length === 0 && 'cursor-not-allowed'}`} title="Desfazer (Ctrl+Z)">↩️</button>
                  <button onClick={handleRedo} disabled={redoHistory.length === 0} className={`px-2 py-1.5 text-xs font-medium rounded-r-lg ${redoHistory.length > 0 ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400' : theme === 'light' ? 'bg-slate-200 text-slate-400' : 'bg-slate-700/50 text-slate-500'} ${redoHistory.length === 0 && 'cursor-not-allowed'}`} title="Refazer (Ctrl+Y)">↪️</button>
                </div>
                
                {/* Pesquisa */}
                <button onClick={() => setShowSearch(true)} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`} title="Pesquisar (Ctrl+F)">🔍</button>
                
                {/* Alertas */}
                <button onClick={() => setShowAlerts(true)} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${getActiveAlerts().length > 0 ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`} title="Alertas">🔔{getActiveAlerts().length > 0 && <span className="ml-0.5">({getActiveAlerts().length})</span>}</button>
                
                {/* Menu Export */}
                <div className="relative">
                  <button onClick={() => setShowExportMenu(!showExportMenu)} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`} title="Exportar">📤 <span className="hidden sm:inline">Export</span></button>
                  {showExportMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)}/>
                      <div className={`absolute right-0 top-full mt-1 ${theme === 'light' ? 'bg-white border-slate-200 shadow-lg' : 'bg-slate-800 border-slate-700'} border rounded-xl py-1 z-50 min-w-[180px]`}>
                        <button onClick={() => { exportToPDF(); setShowExportMenu(false); }} className={`w-full px-4 py-2 text-left text-sm ${theme === 'light' ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-700 text-slate-300'}`}>📄 PDF Mensal</button>
                        <button onClick={() => { setShowRelatorio(true); setShowExportMenu(false); }} className={`w-full px-4 py-2 text-left text-sm ${theme === 'light' ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-700 text-slate-300'}`}>📊 Relatório Anual</button>
                        <button onClick={() => { exportToGoogleSheets(); setShowExportMenu(false); }} disabled={exporting} className={`w-full px-4 py-2 text-left text-sm ${theme === 'light' ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-700 text-slate-300'} ${exporting && 'opacity-50'}`}>{exporting ? '⏳' : '📗'} Excel (.xlsx)</button>
                        <div className={`my-1 border-t ${theme === 'light' ? 'border-slate-200' : 'border-slate-700'}`}/>
                        <button onClick={() => { setShowImportCSV(true); setShowExportMenu(false); }} className={`w-full px-4 py-2 text-left text-sm ${theme === 'light' ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-700 text-slate-300'}`}>📥 Importar CSV</button>
                        <button onClick={() => { const data = { g: G, m: M, version: 1, exportDate: new Date().toISOString() }; setBackupData(JSON.stringify(data, null, 2)); setBackupMode('export'); setBackupStatus(''); setShowBackupModal(true); setShowExportMenu(false); }} className={`w-full px-4 py-2 text-left text-sm ${theme === 'light' ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-700 text-slate-300'}`}>💾 Backup JSON</button>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Atalhos - escondido em mobile */}
                <button onClick={() => setShowShortcuts(true)} className="hidden sm:block px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300" title="Atalhos (?)">⌨️</button>
                
                {/* Reset - escondido em mobile */}
                <button onClick={handleResetAll} className="hidden sm:block px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400" title="Apagar dados">🗑️</button>
              </div>
              
              {/* Status de sync */}
              {syncing ? (
                <div className="flex items-center gap-1 text-xs text-amber-400"><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/><span className="hidden sm:inline">A guardar...</span></div>
              ) : hasChanges ? (
                <div className="flex items-center gap-1 text-xs text-orange-400"><div className="w-2 h-2 rounded-full bg-orange-400"/><span className="hidden sm:inline">Não guardado</span></div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-emerald-400"><div className="w-2 h-2 rounded-full bg-emerald-400"/><span className="hidden sm:inline">Guardado</span></div>
              )}
              
              {/* User */}
              <div className={`flex items-center gap-2 pl-2 border-l ${theme === 'light' ? 'border-slate-300' : 'border-slate-700'}`}>
                {user?.photoURL && <img src={user.photoURL} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full"/>}
                <span className={`hidden sm:inline text-sm ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>{user?.displayName?.split(' ')[0]}</span>
                <button onClick={onLogout} className="px-2 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400">Sair</button>
              </div>
            </div>
          </div>
        </header>

      <nav className={`flex gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 ${theme === 'light' ? 'bg-slate-100/50 border-slate-200' : 'bg-slate-800/30 border-slate-700/30'} border-b overflow-x-auto scrollbar-hide`}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all duration-200 ${tab===t.id?'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/25': theme === 'light' ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}><span className="sm:mr-1">{t.icon}</span><span className="hidden sm:inline">{t.label}</span></button>
        ))}
      </nav>

      <main className="px-3 sm:px-6 py-4 sm:py-6 max-w-7xl mx-auto">
        {tab==='resumo' && <Resumo/>}
 {tab==='receitas' && <Receitas/>}
 {tab==='abanca' && <ABanca/>}
 {tab==='pessoais' && <Pessoais/>}
 {tab==='invest' && <Invest/>}
 {tab==='sara' && <Sara/>}
 {tab==='historico' && <Historico/>}
 {tab==='portfolio' && <Portfolio/>}
 {tab==='credito' && <Credito/>}
 {tab==='calendario' && <Calendario/>}
 {tab==='agenda' && <Agenda/>}
 </main>
 </div>
 );
};

export default OrcamentoApp;
