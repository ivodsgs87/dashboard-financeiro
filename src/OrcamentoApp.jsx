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
const DraggableList = memo(({items, onReorder, renderItem}) => {
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
 <div className="space-y-2 max-w-3xl">
 {items.map((item, idx) => (
 <div
 key={item.id}
 onDragOver={e => handleDragOver(e, idx)}
 onDrop={e => handleDrop(e, idx)}
 className={`transition-all duration-150 ${dragIdx === idx ? 'opacity-50 scale-95' : ''} ${overIdx === idx ? 'border-t-2 border-blue-500' : ''}`}
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
  
  // Novos estados para funcionalidades
  // Removido: const [theme, setTheme] = useState('dark'); // light mode removido
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
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
  useEffect(() => {
    const handleKeyDown = (e) => {
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
      // Escape = Fechar modais
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowAlerts(false);
        setShowImportCSV(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
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
    patrimonioHist: [], // {date: '2025-01', portfolio: 50000, casaLiquida: 100000}
    metas: { receitas: 80000, amortizacao: 15000, investimentos: 12000 },
    alertas: [
      {id:1, tipo: 'despesa', campo: 'despPess', limite: 800, ativo: true, desc: 'Despesas pessoais > €800'},
      {id:2, tipo: 'meta', campo: 'receitas', percentagem: 80, ativo: true, desc: 'Receitas < 80% da meta'},
      {id:3, tipo: 'poupanca', limite: 20, ativo: true, desc: 'Taxa poupança < 20%'}
    ],
    // Tarefas financeiras recorrentes
    tarefas: [
      {id:1, desc:'Enviar faturas e-Fatura', dia:12, freq:'mensal', cat:'IVA', ativo:true},
      {id:2, desc:'Pagar Segurança Social', dia:20, freq:'mensal', cat:'SS', ativo:true},
      {id:3, desc:'Declaração trimestral IVA', dia:15, freq:'trimestral', meses:[2,5,8,11], cat:'IVA', ativo:true},
      {id:4, desc:'Pagamento por conta IRS', dia:20, freq:'trimestral', meses:[7,9,12], cat:'IRS', ativo:true},
      {id:5, desc:'Declaração IRS', dia:30, freq:'anual', meses:[6], cat:'IRS', ativo:true},
      {id:6, desc:'Renovar seguro carro', dia:1, freq:'anual', meses:[3], cat:'Seguros', ativo:true}
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
  const Card = ({children, className = ''}) => <div className={`bg-slate-800/50 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-slate-700/50 p-3 sm:p-5 ${className}`}>{children}</div>;
  const StatCard = ({label, value, color = 'text-white', sub, icon}) => <Card className="p-3 sm:p-4"><p className="text-slate-400 text-xs font-medium mb-1">{icon} {label}</p><p className={`text-lg sm:text-xl font-bold ${color}`}>{value}</p>{sub && <p className="text-slate-500 text-xs mt-1 truncate">{sub}</p>}</Card>;
 const Button = ({children, onClick, variant = 'primary', size = 'md', disabled = false}) => {
 const base = 'font-semibold rounded-xl transition-all duration-200 ';
 const variants = {primary: 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-500/25', secondary: 'bg-slate-700 hover:bg-slate-600 text-white', danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400'};
    const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
 return <button onClick={onClick} disabled={disabled} className={base + variants[variant] + ' ' + sizes[size] + (disabled ? ' opacity-50 cursor-not-allowed' : '')}>{children}</button>;
 };
  const Select = ({children, className = '', ...props}) => <select className={`bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer ${className}`} {...props}>{children}</select>;
 const ProgressBar = ({value, max, color = '#3b82f6', height = 'h-2'}) => <div className={`w-full bg-slate-700/50 rounded-full overflow-hidden ${height}`}><div className="h-full rounded-full transition-all duration-500" style={{width: `${Math.min((value/max)*100, 100)}%`, background: color}}/></div>;
 const Row = ({children, highlight}) => <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl transition-all ${highlight ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-700/30 hover:bg-slate-700/50'}`}>{children}</div>;
  const inputClass = "bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50";

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
 const benchs = getComparacaoBenchmarks();
 const previsaoIRS = getPrevisaoIRS();
 const compDespesas = getComparacaoDespesas();
 const patrimonio = getPatrimonioLiquido();
 const tarefasPend = getTarefasPendentes();
 
 return (<div key={mesKey} className="space-y-6">
 
 {/* ALERTAS DE TAREFAS */}
 {(tarefasPend.atrasadas.length > 0 || tarefasPend.proximas.length > 0) && (
   <div className={`p-4 rounded-xl border ${tarefasPend.atrasadas.length > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
     <div className="flex items-center justify-between">
       <div className="flex items-center gap-3">
         <span className="text-2xl">{tarefasPend.atrasadas.length > 0 ? '⚠️' : '📋'}</span>
         <div>
           {tarefasPend.atrasadas.length > 0 && (
             <p className="font-medium text-red-400">{tarefasPend.atrasadas.length} tarefa(s) atrasada(s)!</p>
           )}
           {tarefasPend.proximas.length > 0 && (
             <p className="text-sm text-orange-400">{tarefasPend.proximas.length} tarefa(s) nos próximos 5 dias</p>
           )}
         </div>
       </div>
       <button onClick={() => setTab('agenda')} className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg">Ver Agenda →</button>
     </div>
   </div>
 )}
 
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
 <StatCard label="Receita Total" value={fmt(totRec)} color="text-white" sub={`Com: ${fmt(inCom)} + Sem: ${fmt(inSem)}`} icon="💰"/>
 <StatCard label="Receita Líquida" value={fmt(recLiq)} color="text-emerald-400" sub={`Após ${fmtP(taxa)} taxas`} icon="✨"/>
 <StatCard label="Reserva Taxas" value={fmt(valTax)} color="text-orange-400" sub={`${fmtP(taxa)} do income com retenção`} icon="📋"/>
 <StatCard label="Taxa Poupança" value={`${taxaPoupanca.toFixed(1)}%`} color={taxaPoupanca >= 20 ? "text-emerald-400" : "text-orange-400"} sub={taxaPoupanca >= 20 ? "Bom!" : "Benchmark: 20%"} icon="🐷"/>
 <StatCard label="Disponível Alocar" value={fmt(restante)} color={restante >= 0 ? "text-blue-400" : "text-red-400"} sub="Após despesas e férias" icon="🎯"/>
 </div>

 {/* PATRIMÓNIO LÍQUIDO */}
 <Card>
   <div className="flex justify-between items-center mb-4">
     <h3 className="text-lg font-semibold">💎 Património Líquido Total</h3>
     <span className="text-2xl font-bold text-emerald-400">{fmt(patrimonio.total)}</span>
   </div>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
     <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Portfolio Investimentos</p>
       <p className="text-xl font-bold text-blue-400">{fmt(patrimonio.portfolio)}</p>
     </div>
     <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Valor Casa</p>
       <p className="text-xl font-bold text-emerald-400">{fmt(patrimonio.valorCasa)}</p>
     </div>
     <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Dívida Casa</p>
       <p className="text-xl font-bold text-red-400">-{fmt(patrimonio.dividaAtual)}</p>
     </div>
     <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Casa (líquido)</p>
       <p className="text-xl font-bold text-purple-400">{fmt(patrimonio.casaLiquida)}</p>
     </div>
   </div>
 </Card>

 {/* PREVISÃO IRS */}
 <Card>
   <h3 className="text-lg font-semibold mb-4">📊 Previsão IRS {anoAtualSistema}</h3>
   <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
     <div className="p-3 bg-slate-700/30 rounded-xl">
       <p className="text-xs text-slate-400">Receitas Brutas</p>
       <p className="text-lg font-bold">{fmt(previsaoIRS.receitasAnuais)}</p>
     </div>
     <div className="p-3 bg-slate-700/30 rounded-xl">
       <p className="text-xs text-slate-400">Rend. Coletável (75%)</p>
       <p className="text-lg font-bold">{fmt(previsaoIRS.rendColetavel)}</p>
     </div>
     <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
       <p className="text-xs text-slate-400">IRS Estimado</p>
       <p className="text-lg font-bold text-orange-400">{fmt(previsaoIRS.impostoEstimado)}</p>
       <p className="text-xs text-slate-500">Taxa efetiva: {previsaoIRS.taxaEfetiva.toFixed(1)}%</p>
     </div>
     <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Já Retido</p>
       <p className="text-lg font-bold text-blue-400">{fmt(previsaoIRS.retencoes)}</p>
     </div>
     <div className={`p-3 rounded-xl ${previsaoIRS.aPagarReceber >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
       <p className="text-xs text-slate-400">{previsaoIRS.aPagarReceber >= 0 ? 'A Receber' : 'A Pagar'}</p>
       <p className={`text-lg font-bold ${previsaoIRS.aPagarReceber >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(Math.abs(previsaoIRS.aPagarReceber))}</p>
     </div>
   </div>
   <p className="text-xs text-slate-500 mt-3">* Estimativa simplificada com regime simplificado (coef. 75%) e deduções standard. Consulta um contabilista.</p>
 </Card>

 {/* COMPARAÇÃO COM MÊS ANTERIOR */}
 <Card>
   <h3 className="text-lg font-semibold mb-4">📈 {mes} vs {compDespesas.mesAnterior}</h3>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
     {[
       {label: 'Receitas', ...compDespesas.receitas, icon: '💰'},
       {label: 'Investimentos', ...compDespesas.investimentos, icon: '📈'}
     ].map(item => (
       <div key={item.label} className="p-3 bg-slate-700/30 rounded-xl">
         <div className="flex justify-between items-start mb-2">
           <p className="text-xs text-slate-400">{item.icon} {item.label}</p>
           {item.diff !== 0 && (
             <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${item.diff > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
               {item.diff > 0 ? '+' : ''}{fmt(item.diff)}
             </span>
           )}
         </div>
         <p className="text-lg font-bold">{fmt(item.atual)}</p>
         <p className="text-xs text-slate-500">Anterior: {fmt(item.anterior)}</p>
       </div>
     ))}
   </div>
 </Card>

 {/* PROJEÇÃO ANUAL */}
 {projecao && (
 <Card>
   <h3 className="text-lg font-semibold mb-4">📈 Projeção Anual {ano}</h3>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
     <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Total até agora</p>
       <p className="text-xl font-bold text-blue-400">{fmt(projecao.totalAtual)}</p>
       <p className="text-xs text-slate-500">{projecao.mesesComDados} meses</p>
     </div>
     <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Média mensal</p>
       <p className="text-xl font-bold text-purple-400">{fmt(projecao.mediaMensal)}</p>
     </div>
     <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
       <p className="text-xs text-slate-400">Projeção fim de ano</p>
       <p className="text-xl font-bold text-emerald-400">{fmt(projecao.projecao)}</p>
       <p className="text-xs text-slate-500">+{projecao.mesesRestantes} meses</p>
     </div>
     <div className={`p-3 rounded-xl ${projecao.diffMeta >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
       <p className="text-xs text-slate-400">vs Meta ({fmt(metas.receitas)})</p>
       <p className={`text-xl font-bold ${projecao.diffMeta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{projecao.diffMeta >= 0 ? '+' : ''}{fmt(projecao.diffMeta)}</p>
       <p className="text-xs text-slate-500">{projecao.diffMeta >= 0 ? '✓ Acima da meta' : '⚠️ Abaixo'}</p>
     </div>
   </div>
 </Card>
 )}

 {/* METAS ANUAIS */}
 <Card>
   <div className="flex justify-between items-center mb-4">
     <h3 className="text-lg font-semibold">🎯 Metas Anuais {ano}</h3>
     <span className="text-xs text-slate-500">{mesAtualNum} de 12 meses ({fmtP(progressoEsperado * 100)})</span>
   </div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
     {[
       { label: '💰 Receitas', atual: totaisAnuais.receitasAnuais, meta: metas.receitas, key: 'receitas', color: '#3b82f6' },
       { label: '📈 Investimentos', atual: totaisAnuais.investimentosAnuais, meta: metas.investimentos, key: 'investimentos', color: '#8b5cf6' }
     ].map(m => {
       const pct = m.meta > 0 ? (m.atual / m.meta) * 100 : 0;
       const esperado = m.meta * progressoEsperado;
       const onTrack = m.atual >= esperado;
       const diff = m.atual - esperado;
       return (
         <div key={m.key} className="p-4 bg-slate-700/30 rounded-xl">
           <div className="flex justify-between items-start mb-2">
             <span className="text-sm font-medium text-slate-300">{m.label}</span>
             <span className={`text-xs px-2 py-0.5 rounded-full ${onTrack ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
               {onTrack ? '✓ On track' : '⚠️ Atrasado'}
             </span>
           </div>
           <div className="flex items-baseline gap-2 mb-1">
             <span className="text-xl font-bold" style={{color: m.color}}>{fmt(m.atual)}</span>
             <span className="text-sm text-slate-500">/ {fmt(m.meta)}</span>
           </div>
           <ProgressBar value={m.atual} max={m.meta || 1} color={m.color} height="h-2"/>
           <div className="flex justify-between mt-2 text-xs">
             <span className="text-slate-500">{pct.toFixed(0)}% da meta</span>
             <span className={onTrack ? 'text-emerald-400' : 'text-red-400'}>
               {diff >= 0 ? '+' : ''}{fmt(diff)} vs esperado
             </span>
           </div>
           <div className="mt-2 pt-2 border-t border-slate-600/50">
             <div className="flex items-center gap-2">
               <span className="text-xs text-slate-500">Meta:</span>
               <StableInput type="number" className="flex-1 bg-slate-600/50 border border-slate-500/50 rounded-lg px-2 py-1 text-xs text-white text-right" initialValue={m.meta} onSave={v => uMeta(m.key, v)}/>
               <span className="text-xs text-slate-500">€</span>
             </div>
           </div>
         </div>
       );
     })}
   </div>
 </Card>

 {porCli.length > 0 && (
 <Card>
 <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">👥 Receitas por Cliente (Este Mês)</h3>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
 {porCli.map(c => (
 <div key={c.id} className="p-3 bg-slate-700/30 rounded-xl border-l-4" style={{borderColor: c.cor}}>
 <p className="text-sm font-medium text-slate-300">{c.nome}</p>
 <p className="text-lg font-bold mt-1">{fmt(c.tot)}</p>
 </div>
 ))}
 </div>
 </Card>
 )}

 {/* Resumo Anual por Cliente */}
 {Object.values(totaisAnuais.receitasPorCliente).some(c => c.total > 0) && (
 <Card>
 <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">📊 Receitas por Cliente ({ano})</h3>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
 {Object.values(totaisAnuais.receitasPorCliente).filter(c => c.total > 0).sort((a,b) => b.total - a.total).map((c, i) => (
 <div key={i} className="p-3 bg-slate-700/30 rounded-xl border-l-4" style={{borderColor: c.cor}}>
 <p className="text-sm font-medium text-slate-300">{c.nome}</p>
 <p className="text-lg font-bold mt-1">{fmt(c.total)}</p>
 <p className="text-xs text-slate-500">{((c.total / totaisAnuais.receitasAnuais) * 100).toFixed(0)}% do total</p>
 </div>
 ))}
 </div>
 <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between">
   <span className="text-sm text-slate-400">Total Anual {ano}</span>
   <span className="text-lg font-bold text-white">{fmt(totaisAnuais.receitasAnuais)}</span>
 </div>
 </Card>
 )}

 {ultReg.length > 0 && (
 <Card>
 <h3 className="text-lg font-semibold mb-4">📝 Últimos Registos</h3>
 <div className="space-y-2">
 {ultReg.map((r,i) => {
 const cli = clientes.find(c=>c.id===r.cid);
 return (
 <div key={i} className="flex items-center gap-4 p-3 bg-slate-700/30 rounded-xl border-l-4" style={{borderColor: r.tipo==='com'?'#f97316':'#10b981'}}>
 <span className="text-xs text-slate-400 w-16">{new Date(r.data).toLocaleDateString('pt-PT',{day:'2-digit',month:'short'})}</span>
 <span className="text-sm w-20" style={{color: cli?.cor}}>{cli?.nome || '-'}</span>
 <span className="flex-1 text-sm text-slate-300">{r.desc || '-'}</span>
 <span className="font-semibold" style={{color: r.tipo==='com'?'#f97316':'#10b981'}}>{fmt(r.val)}</span>
 </div>
 );
 })}
 </div>
 </Card>
 )}

 <Card>
 <h3 className="text-lg font-semibold mb-4">📊 Distribuição do Orçamento</h3>
 <div className="flex items-center gap-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-6">
 <span className="text-2xl">🏖️</span>
 <div className="flex-1"><p className="text-sm text-slate-300">Reserva para Férias</p><p className="text-xs text-slate-500">Deduzido antes da alocação</p></div>
 <div className="flex items-center gap-2">
 <span className="text-slate-400">€</span>
 <StableInput type="number" className={`w-24 ${inputClass} text-amber-400 text-lg font-bold text-right`} initialValue={ferias} onSave={v=>uG('ferias',v)}/>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-6">
 {[{l:'Despesas Casal',v:minhaAB,c:'#ec4899'},{l:'Despesas Pessoais',v:totPess,c:'#3b82f6'},{l:`🏠 Amortização (${fmtP(alocAmort)})`,v:restante*(alocAmort/100),c:'#10b981'},{l:`📈 Investimentos (${fmtP(100-alocAmort)})`,v:restante*((100-alocAmort)/100),c:'#8b5cf6'}].map((i,k) => (
 <div key={k}>
 <div className="flex justify-between mb-2"><span className="text-sm text-slate-300">{i.l}</span><span className="font-semibold" style={{color: i.c}}>{fmt(i.v)}</span></div>
 <ProgressBar value={Math.abs(i.v)} max={recLiq || 1} color={i.c}/>
 </div>
 ))}
 </div>
 </Card>

 <Card>
 <h3 className="text-lg font-semibold mb-4">💸 Transferências do Mês</h3>
 <div className="space-y-3">
 {[{l:'Despesas Casal',s:'Dia 25 do mês',v:minhaAB,k:'abanca'},{l:'Activo Bank (Pessoais)',s:'Dia 25 do mês',v:totPess,k:'activo'},{l:'Trade Republic (Repor)',s:'Dia 31 do mês',v:transfTR,k:'trade'},{l:'Revolut (Férias)',s:'Dia 31 do mês',v:ferias,k:'revolut'}].map(t => (
 <Row key={t.k} highlight={transf[t.k]}>
 <div className="flex-1"><p className="font-medium">{t.l}</p><p className="text-xs text-slate-500">{t.s}</p></div>
 <span className="text-xl font-bold">{fmt(t.v)}</span>
 <input type="checkbox" className="w-5 h-5 rounded-lg accent-emerald-500 cursor-pointer" checked={transf[t.k]} onChange={e=>uM('transf',{...transf,[t.k]:e.target.checked})}/>
 </Row>
 ))}
 </div>
 </Card>

 {/* BENCHMARKS */}
 <Card>
   <h3 className="text-lg font-semibold mb-4">📊 Comparação com Benchmarks</h3>
   <p className="text-xs text-slate-500 mb-4">Compara os teus gastos com médias nacionais (Portugal)</p>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
     {Object.entries(benchs).map(([key, data]) => {
       const diff = data.atual - data.benchmark;
       const isGood = key === 'poupanca' ? diff >= 0 : diff <= 0;
       const labels = {habitacao: '🏠 Habitação', alimentacao: '🍽️ Alimentação', transporte: '🚗 Transporte', poupanca: '💰 Poupança'};
       return (
         <div key={key} className={`p-3 rounded-xl ${isGood ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-orange-500/10 border border-orange-500/30'}`}>
           <p className="text-sm font-medium text-slate-300">{labels[key]}</p>
           <div className="flex items-baseline gap-2 mt-1">
             <span className={`text-xl font-bold ${isGood ? 'text-emerald-400' : 'text-orange-400'}`}>{data.atual.toFixed(1)}%</span>
             <span className="text-xs text-slate-500">/ {data.benchmark}%</span>
           </div>
           <p className="text-xs mt-1 text-slate-500">{isGood ? '✓ OK' : '⚠️ Acima'}</p>
         </div>
       );
     })}
   </div>
 </Card>

 {/* COMPARAÇÃO ANO A ANO */}
 <Card>
   <div className="flex justify-between items-center mb-4">
     <h3 className="text-lg font-semibold">📅 Receitas: {ano} vs {compareYear || ano - 1}</h3>
     <div className="flex items-center gap-2">
       <span className="text-slate-500 text-sm">Comparar com:</span>
       <Select value={compareYear || ano - 1} onChange={e => setCompareYear(+e.target.value)} className="text-sm">
         {anos.filter(a => a !== ano).map(a => <option key={a} value={a}>{a}</option>)}
       </Select>
     </div>
   </div>
   {(() => {
     const compYear = compareYear || ano - 1;
     const comp = getComparacaoAnos(ano, compYear);
     const maxVal = Math.max(...comp.map(c => Math.max(c[ano] || 0, c[compYear] || 0)), 1);
     return (
       <div className="space-y-2">
         {comp.map(c => {
           const valAno = c[ano] || 0;
           const valComp = c[compYear] || 0;
           const diff = valComp > 0 ? ((valAno - valComp) / valComp * 100) : (valAno > 0 ? 100 : 0);
           return (
           <div key={c.mes} className="flex items-center gap-3">
             <span className="w-10 text-xs text-slate-500">{c.mes}</span>
             <div className="flex-1 flex gap-1 h-5">
               <div className="h-full bg-blue-500 rounded-l transition-all" style={{width: `${(valAno / maxVal) * 45}%`}}/>
               <div className="h-full bg-slate-600 rounded-r transition-all" style={{width: `${(valComp / maxVal) * 45}%`}}/>
             </div>
             <span className="w-16 text-xs text-right font-medium text-blue-400">{valAno > 0 ? (valAno >= 1000 ? `${(valAno/1000).toFixed(1)}k` : valAno) : '-'}</span>
             <span className="w-16 text-xs text-right text-slate-500">{valComp > 0 ? (valComp >= 1000 ? `${(valComp/1000).toFixed(1)}k` : valComp) : '-'}</span>
             <span className={`w-14 text-xs text-right font-medium ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
               {valAno > 0 || valComp > 0 ? `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%` : '-'}
             </span>
           </div>
         );})}
         <div className="flex gap-6 mt-4 pt-3 border-t border-slate-700 justify-center text-sm">
           <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-blue-500"/><span className="text-slate-300">{ano}</span></div>
           <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-slate-600"/><span className="text-slate-400">{compYear}</span></div>
         </div>
       </div>
     );
   })()}
 </Card>

 {/* PREVISÃO IRS */}
 <Card>
   <h3 className="text-lg font-semibold mb-4">🧾 Previsão de Impostos {ano}</h3>
   {(() => {
     const receitaAnual = totaisAnuais.receitasAnuais;
     const despesasDedut = totAB * 12 * 0.25; // 25% despesas habitação dedutíveis (simplificado)
     const lucroTrib = Math.max(0, receitaAnual * 0.75 - despesasDedut); // Regime simplificado: 75% tributável
     
     // Escalões IRS 2024 (simplificado)
     let irsEstimado = 0;
     if (lucroTrib <= 7703) irsEstimado = lucroTrib * 0.1325;
     else if (lucroTrib <= 11623) irsEstimado = 1020.56 + (lucroTrib - 7703) * 0.18;
     else if (lucroTrib <= 16472) irsEstimado = 1726.16 + (lucroTrib - 11623) * 0.23;
     else if (lucroTrib <= 21321) irsEstimado = 2841.43 + (lucroTrib - 16472) * 0.26;
     else if (lucroTrib <= 27146) irsEstimado = 4102.17 + (lucroTrib - 21321) * 0.3275;
     else if (lucroTrib <= 39791) irsEstimado = 6009.43 + (lucroTrib - 27146) * 0.37;
     else if (lucroTrib <= 51997) irsEstimado = 10688.09 + (lucroTrib - 39791) * 0.435;
     else if (lucroTrib <= 81199) irsEstimado = 15997.30 + (lucroTrib - 51997) * 0.45;
     else irsEstimado = 29108.20 + (lucroTrib - 81199) * 0.48;
     
     const ssAnual = receitaAnual * 0.214; // 21.4% SS
     const reservaAtual = receitaAnual * (taxa/100);
     const totalImpostos = irsEstimado + ssAnual;
     const diffReserva = reservaAtual - totalImpostos;
     
     return (
       <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
         <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
           <p className="text-xs text-slate-400">Receita Bruta</p>
           <p className="text-lg font-bold text-blue-400">{fmt(receitaAnual)}</p>
         </div>
         <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
           <p className="text-xs text-slate-400">IRS Estimado</p>
           <p className="text-lg font-bold text-orange-400">{fmt(irsEstimado)}</p>
           <p className="text-xs text-slate-500">{(irsEstimado/receitaAnual*100 || 0).toFixed(1)}% efetiva</p>
         </div>
         <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
           <p className="text-xs text-slate-400">Seg. Social</p>
           <p className="text-lg font-bold text-purple-400">{fmt(ssAnual)}</p>
           <p className="text-xs text-slate-500">21.4%</p>
         </div>
         <div className={`p-3 rounded-xl ${diffReserva >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
           <p className="text-xs text-slate-400">Reserva vs Real</p>
           <p className={`text-lg font-bold ${diffReserva >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{diffReserva >= 0 ? '+' : ''}{fmt(diffReserva)}</p>
           <p className="text-xs text-slate-500">{diffReserva >= 0 ? '✓ Suficiente' : '⚠️ Aumentar'}</p>
         </div>
       </div>
     );
   })()}
   <p className="text-xs text-slate-500 mt-4">* Estimativa simplificada baseada no regime simplificado (75% tributável). Consulta um contabilista para valores exatos.</p>
 </Card>

 {/* COMPARAÇÃO DESPESAS MÊS A MÊS */}
 <Card>
   <h3 className="text-lg font-semibold mb-4">📊 Despesas: Este Mês vs Anterior</h3>
   {(() => {
     const mesAnteriorIdx = meses.indexOf(mes) === 0 ? 11 : meses.indexOf(mes) - 1;
     const anoAnterior = meses.indexOf(mes) === 0 ? ano - 1 : ano;
     const keyAnterior = `${anoAnterior}-${mesAnteriorIdx + 1}`;
     const mAnterior = M[keyAnterior] || {};
     
     const invAnterior = (mAnterior.inv || []).reduce((a, i) => a + (i.val || 0), 0);
     const diffInv = totInv - invAnterior;
     
     // Despesas são fixas (G), então comparamos investimentos e transferências
     return (
       <div className="grid grid-cols-2 gap-4">
         <div className="p-4 bg-slate-700/30 rounded-xl">
           <p className="text-sm text-slate-400 mb-2">Investimentos</p>
           <div className="flex justify-between items-end">
             <div>
               <p className="text-xs text-slate-500">{meses[mesAnteriorIdx]?.slice(0,3)}</p>
               <p className="text-lg font-semibold text-slate-400">{fmt(invAnterior)}</p>
             </div>
             <div className="text-2xl text-slate-600">→</div>
             <div className="text-right">
               <p className="text-xs text-slate-500">{mes.slice(0,3)}</p>
               <p className="text-lg font-semibold text-blue-400">{fmt(totInv)}</p>
             </div>
           </div>
           <div className={`mt-2 text-center text-sm font-medium ${diffInv >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
             {diffInv >= 0 ? '↑' : '↓'} {fmt(Math.abs(diffInv))} ({diffInv >= 0 ? '+' : ''}{invAnterior > 0 ? ((diffInv/invAnterior)*100).toFixed(0) : 0}%)
           </div>
         </div>
         <div className="p-4 bg-slate-700/30 rounded-xl">
           <p className="text-sm text-slate-400 mb-2">Taxa de Poupança</p>
           <div className="flex justify-between items-center">
             <div className="flex-1">
               <div className="h-3 bg-slate-600 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-500 transition-all" style={{width: `${Math.min(taxaPoupanca, 100)}%`}}/>
               </div>
             </div>
             <span className={`ml-3 text-xl font-bold ${taxaPoupanca >= 20 ? 'text-emerald-400' : 'text-orange-400'}`}>{taxaPoupanca.toFixed(0)}%</span>
           </div>
           <p className="text-xs text-slate-500 mt-2">{taxaPoupanca >= 20 ? '✓ Acima do benchmark (20%)' : '⚠️ Abaixo do benchmark (20%)'}</p>
         </div>
       </div>
     );
   })()}
 </Card>

 {/* PATRIMÓNIO LÍQUIDO */}
 <Card>
   <h3 className="text-lg font-semibold mb-4">🏆 Património Líquido</h3>
   {(() => {
     const {valorCasa, dividaAtual} = credito;
     const casaLiquida = valorCasa - dividaAtual;
     const portfolioTotal = portfolio.reduce((a, p) => a + p.val, 0);
     const patrimonioTotal = casaLiquida + portfolioTotal;
     const patrimonioHist = G.patrimonioHist || [];
     
     return (
       <div>
         <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
           <div className="p-4 bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-xl">
             <p className="text-xs text-slate-400">🏠 Casa (valor)</p>
             <p className="text-xl font-bold text-blue-400">{fmt(valorCasa)}</p>
           </div>
           <div className="p-4 bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 rounded-xl">
             <p className="text-xs text-slate-400">🏦 Dívida</p>
             <p className="text-xl font-bold text-red-400">-{fmt(dividaAtual)}</p>
           </div>
           <div className="p-4 bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 rounded-xl">
             <p className="text-xs text-slate-400">💎 Portfolio</p>
             <p className="text-xl font-bold text-purple-400">{fmt(portfolioTotal)}</p>
           </div>
           <div className="p-4 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-xl">
             <p className="text-xs text-slate-400">🏆 Total Líquido</p>
             <p className="text-2xl font-bold text-emerald-400">{fmt(patrimonioTotal)}</p>
           </div>
         </div>
         
         {/* Barra visual */}
         <div className="mb-4">
           <div className="flex h-8 rounded-xl overflow-hidden">
             <div className="bg-blue-500 flex items-center justify-center text-xs font-medium" style={{width: `${(casaLiquida / patrimonioTotal) * 100}%`}} title={`Casa líquida: ${fmt(casaLiquida)}`}>
               {((casaLiquida / patrimonioTotal) * 100).toFixed(0)}%
             </div>
             <div className="bg-purple-500 flex items-center justify-center text-xs font-medium" style={{width: `${(portfolioTotal / patrimonioTotal) * 100}%`}} title={`Portfolio: ${fmt(portfolioTotal)}`}>
               {((portfolioTotal / patrimonioTotal) * 100).toFixed(0)}%
             </div>
           </div>
           <div className="flex justify-between mt-2 text-xs text-slate-500">
             <span>🏠 Imobiliário ({((casaLiquida / patrimonioTotal) * 100).toFixed(0)}%)</span>
             <span>💎 Financeiro ({((portfolioTotal / patrimonioTotal) * 100).toFixed(0)}%)</span>
           </div>
         </div>
         
         {/* Guardar snapshot património */}
         <Button variant="secondary" onClick={() => {
           saveUndo();
           const currentKey = `${ano}-${meses.indexOf(mes) + 1}`;
           const newHist = [...patrimonioHist.filter(h => h.date !== currentKey), {
             date: currentKey,
             portfolio: portfolioTotal,
             casaLiquida,
             total: patrimonioTotal
           }].sort((a,b) => a.date.localeCompare(b.date));
           uG('patrimonioHist', newHist);
         }}>📸 Guardar Snapshot Património</Button>
         
         {/* Gráfico evolução */}
         {patrimonioHist.length > 1 && (
           <div className="mt-6">
             <p className="text-sm text-slate-400 mb-3">Evolução do Património</p>
             <LineChart data={patrimonioHist.slice(-12).map(h => ({label: h.date.split('-')[1], value: h.total}))} height={150} color="#10b981" showValues={true} formatValue={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}/>
           </div>
         )}
       </div>
     );
   })()}
 </Card>
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
 <div key={c.id} className="flex items-center gap-2 px-4 py-2 bg-slate-700/30 rounded-xl border-2" style={{borderColor: c.cor}}>
 <div className="w-2 h-2 rounded-full" style={{background: c.cor}}/><span className="font-medium">{c.nome}</span>
 <button className="text-red-400 hover:text-red-300 ml-1" onClick={()=>uG('clientes',clientes.filter(x=>x.id!==c.id))}>✕</button>
 </div>
 ))}
 </div>
 </Card>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold flex items-center gap-3">💼 Receitas COM Taxas <span className="text-sm px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full font-medium">{fmt(inCom)}</span></h3>
 <div className="flex gap-2">
   <Button variant="secondary" onClick={duplicarMesAnterior}>📋 Duplicar mês anterior</Button>
   <Button onClick={()=>uM('regCom',[...regCom,{id:Date.now(),cid:clientes[0]?.id||0,val:0,data:new Date().toISOString().split('T')[0],desc:''}])}>+ Adicionar</Button>
 </div>
 </div>
 
 <div className="flex items-center gap-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl mb-4">
 <span className="text-sm text-slate-300">Taxa de retenção:</span>
 <SliderWithInput value={taxa} onChange={v=>uG('taxa',v)} min={0} max={60} unit="%" className="w-32" color="pink"/>
 <span className="text-xs text-slate-500">Reserva: {fmt(valTax)}</span>
 </div>

 <div className="space-y-2">
 {regCom.length===0 ? <p className="text-center py-8 text-slate-500">Sem registos este mês</p> : regCom.map(r => (
 <Row key={r.id}>
 <StableDateInput value={r.data} onChange={v=>uM('regCom',regCom.map(x=>x.id===r.id?{...x,data:v}:x))} className={`${inputClass} w-36`}/>
 <Select value={r.cid} onChange={e=>uM('regCom',regCom.map(x=>x.id===r.id?{...x,cid:+e.target.value}:x))} className="w-28">{clientes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
 <StableInput className={`flex-1 ${inputClass}`} initialValue={r.desc} onSave={v=>uM('regCom',regCom.map(x=>x.id===r.id?{...x,desc:v}:x))} placeholder="Descrição..."/>
 <StableInput type="number" className={`w-28 ${inputClass} text-right`} initialValue={r.val} onSave={v=>uM('regCom',regCom.map(x=>x.id===r.id?{...x,val:v}:x))}/>
 <Button variant="danger" size="sm" onClick={()=>uM('regCom',regCom.filter(x=>x.id!==r.id))}>✕</Button>
 </Row>
 ))}
 </div>
 </Card>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold flex items-center gap-3">💵 Receitas SEM Taxas <span className="text-sm px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full font-medium">{fmt(inSem)}</span></h3>
 <Button onClick={()=>uM('regSem',[...regSem,{id:Date.now(),cid:clientes[0]?.id||0,val:0,data:new Date().toISOString().split('T')[0],desc:''}])}>+ Adicionar</Button>
 </div>
 <div className="space-y-2">
 {regSem.length===0 ? <p className="text-center py-8 text-slate-500">Sem registos este mês</p> : regSem.map(r => (
 <Row key={r.id}>
 <StableDateInput value={r.data} onChange={v=>uM('regSem',regSem.map(x=>x.id===r.id?{...x,data:v}:x))} className={`${inputClass} w-36`}/>
 <Select value={r.cid} onChange={e=>uM('regSem',regSem.map(x=>x.id===r.id?{...x,cid:+e.target.value}:x))} className="w-28">{clientes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
 <StableInput className={`flex-1 ${inputClass}`} initialValue={r.desc} onSave={v=>uM('regSem',regSem.map(x=>x.id===r.id?{...x,desc:v}:x))} placeholder="Descrição..."/>
 <StableInput type="number" className={`w-28 ${inputClass} text-right`} initialValue={r.val} onSave={v=>uM('regSem',regSem.map(x=>x.id===r.id?{...x,val:v}:x))}/>
 <Button variant="danger" size="sm" onClick={()=>uM('regSem',regSem.filter(x=>x.id!==r.id))}>✕</Button>
 </Row>
 ))}
 </div>
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
 <div className="space-y-6">
 <Card>
 <div className="flex justify-between items-center mb-6 max-w-3xl">
 <div>
 <h3 className="text-lg font-semibold">🏠 Despesas do Casal (Fixas Partilhadas)</h3>
 <p className="text-xs text-emerald-400">✓ Alterações aplicam-se a todos os meses automaticamente</p>
 </div>
 <Button onClick={()=>uG('despABanca',[...despABanca,{id:Date.now(),desc:'',cat:'Outros',val:0}])}>+ Adicionar</Button>
 </div>
 <div className="flex items-center gap-4 p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl mb-6 max-w-3xl">
 <div className="flex-1"><p className="text-sm text-slate-300">Minha contribuição</p><p className="text-xs text-slate-500">Percentagem das despesas partilhadas</p></div>
 <SliderWithInput value={contrib} onChange={v=>uG('contrib',v)} min={0} max={100} unit="%" className="w-32" color="pink"/>
 <div className="text-right"><p className="text-xs text-slate-500">Sara paga</p><p className="font-semibold text-slate-300">{fmtP(100-contrib)}</p></div>
 </div>
 <DraggableList
 items={despABanca}
 onReorder={(newItems) => uG('despABanca', newItems)}
 renderItem={(d, idx, isDragging, onDragStart, onDragEnd) => (
 <div className="flex items-center gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none block">⋮⋮</div>
 <StableInput className={`w-[50%] ${inputClass}`} initialValue={d.desc} onSave={v=>uG('despABanca',despABanca.map(x=>x.id===d.id?{...x,desc:v}:x))} placeholder="Descrição"/>
 <Select value={d.cat} onChange={e=>uG('despABanca',despABanca.map(x=>x.id===d.id?{...x,cat:e.target.value}:x))} className="w-[25%]">{cats.map(c=><option key={c} value={c}>{c}</option>)}</Select>
 <StableInput type="number" className={`w-[15%] ${inputClass} text-right`} initialValue={d.val} onSave={v=>uG('despABanca',despABanca.map(x=>x.id===d.id?{...x,val:v}:x))}/>
 <button onClick={()=>uG('despABanca',despABanca.filter(x=>x.id!==d.id))} className="text-red-400 hover:text-red-300 p-1">✕</button>
 </div>
 )}
 />
 <div className="flex justify-between gap-4 mt-6 p-4 bg-slate-700/30 rounded-xl max-w-3xl">
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
 <div className="space-y-6">
 <Card>
 <div className="flex justify-between items-center mb-6 max-w-3xl">
 <div>
 <h3 className="text-lg font-semibold">👤 Despesas Pessoais (Activo Bank)</h3>
 <p className="text-xs text-emerald-400">✓ Alterações aplicam-se a todos os meses automaticamente</p>
 </div>
 <Button onClick={()=>uG('despPess',[...despPess,{id:Date.now(),desc:'',cat:'Outros',val:0}])}>+ Adicionar</Button>
 </div>
 <DraggableList
 items={despPess}
 onReorder={(newItems) => uG('despPess', newItems)}
 renderItem={(d, idx, isDragging, onDragStart, onDragEnd) => (
 <div className="flex items-center gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none block">⋮⋮</div>
 <StableInput className={`w-[50%] ${inputClass}`} initialValue={d.desc} onSave={v=>uG('despPess',despPess.map(x=>x.id===d.id?{...x,desc:v}:x))} placeholder="Descrição"/>
 <Select value={d.cat} onChange={e=>uG('despPess',despPess.map(x=>x.id===d.id?{...x,cat:e.target.value}:x))} className="w-[25%]">{cats.map(c=><option key={c} value={c}>{c}</option>)}</Select>
 <StableInput type="number" className={`w-[15%] ${inputClass} text-right`} initialValue={d.val} onSave={v=>uG('despPess',despPess.map(x=>x.id===d.id?{...x,val:v}:x))}/>
 <button onClick={()=>uG('despPess',despPess.filter(x=>x.id!==d.id))} className="text-red-400 hover:text-red-300 p-1">✕</button>
 </div>
 )}
 />
 <div className="flex justify-end mt-6 p-4 bg-slate-700/30 rounded-xl max-w-3xl">
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
 <div key={mesKey} className="space-y-6">
 <Card>
 <h3 className="text-lg font-semibold mb-4">💰 Disponível para Alocar: {fmt(disp)}</h3>
 <div className="flex items-center gap-4 p-4 bg-slate-700/30 rounded-xl mb-4 max-w-3xl">
 <span className="text-emerald-400 text-sm font-medium">🏠 Amortização</span>
 <SliderWithInput value={alocAmort} onChange={v=>uG('alocAmort',v)} min={0} max={100} unit="%" className="flex-1" color="emerald"/>
 <span className="text-purple-400 text-sm font-medium">📈 Investimentos</span>
 </div>
 <div className="grid grid-cols-2 gap-4 max-w-3xl">
 <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
 <p className="text-xs text-slate-400 mb-1">🏠 Amortização Casa</p>
 <p className="text-xl font-bold text-emerald-400">{fmt(disp*(alocAmort/100))}</p>
 <p className="text-sm text-emerald-400/70 mt-1">{fmtP(alocAmort)}</p>
 </div>
 <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <p className="text-xs text-slate-400 mb-1">📈 Investimentos</p>
 <p className="text-xl font-bold text-purple-400">{fmt(pInv)}</p>
 <p className="text-sm text-purple-400/70 mt-1">{fmtP(100-alocAmort)}</p>
 </div>
 </div>
 </Card>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 max-w-3xl">
 <Card className="bg-purple-500/10 border-purple-500/30"><p className="text-xs text-slate-400 mb-1">💰 Disponível</p><p className="text-xl font-bold text-purple-400">{fmt(pInv)}</p></Card>
 <Card className="bg-blue-500/10 border-blue-500/30"><p className="text-xs text-slate-400 mb-1">📊 Investido</p><p className="text-xl font-bold text-blue-400">{fmt(totInvSemCredito)}</p></Card>
 <Card className={rest>=0?'bg-emerald-500/10 border-emerald-500/30':'bg-red-500/10 border-red-500/30'}><p className="text-xs text-slate-400 mb-1">{rest>=0?'✨ Resta':'⚠️ Excesso'}</p><p className={`text-xl font-bold ${rest>=0?'text-emerald-400':'text-red-400'}`}>{fmt(Math.abs(rest))}</p></Card>
 </div>

 <Card>
 <div className="flex justify-between items-center mb-4 max-w-3xl">
 <div>
 <h3 className="text-lg font-semibold">📈 Alocação de Investimentos</h3>
 <p className="text-xs text-slate-500">Categorias: {catsInv.join(', ')}</p>
 </div>
 <div className="flex gap-2">
   <Button variant="secondary" onClick={aplicarInvFuturos}>📅 Aplicar a meses futuros</Button>
   <Button onClick={()=>uM('inv',[...inv,{id:Date.now(),desc:'',cat:catsInv[0]||'ETF',val:0,done:false}])}>+ Adicionar</Button>
 </div>
 </div>
 
 {/* Adicionar categoria */}
 <div className="flex items-center gap-2 mb-4 p-3 bg-slate-700/20 rounded-xl max-w-xl">
   <span className="text-xs text-slate-400">Nova categoria:</span>
   <input type="text" className={`flex-1 ${inputClass} text-xs`} value={novaCat} onChange={e => setNovaCat(e.target.value.toUpperCase())} placeholder="Ex: ACOES"/>
   <Button size="sm" onClick={() => { if (novaCat && !catsInv.includes(novaCat)) { uG('catsInv', [...catsInv, novaCat]); setNovaCat(''); } }}>+ Adicionar</Button>
 </div>
 
 <DraggableList
 items={inv}
 onReorder={(newItems) => uM('inv', newItems)}
 renderItem={(d, idx, isDragging, onDragStart, onDragEnd) => {
 const pct = totInv>0?((d.val/totInv)*100).toFixed(1):0;
 const cor = catCores[d.cat]||'#8b5cf6';
 return (
 <div className="flex items-center gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none block">⋮⋮</div>
 <StableInput className={`w-[30%] ${inputClass}`} initialValue={d.desc} onSave={v=>uM('inv',inv.map(x=>x.id===d.id?{...x,desc:v}:x))} placeholder="Descrição"/>
 <Select value={d.cat||'ETF'} onChange={e=>uM('inv',inv.map(x=>x.id===d.id?{...x,cat:e.target.value}:x))} className="w-[18%]">
   {catsInv.map(c=><option key={c} value={c}>{c}</option>)}
 </Select>
 <StableInput type="number" className={`w-[18%] ${inputClass} text-right`} initialValue={d.val} onSave={v=>uM('inv',inv.map(x=>x.id===d.id?{...x,val:v}:x))}/>
 <span className="w-[12%] text-center text-sm font-semibold" style={{color: cor}}>{pct}%</span>
 <input type="checkbox" className="w-4 h-4 rounded accent-emerald-500 cursor-pointer" checked={d.done} onChange={e=>uM('inv',inv.map(x=>x.id===d.id?{...x,done:e.target.checked}:x))}/>
 <button onClick={()=>uM('inv',inv.filter(x=>x.id!==d.id))} className="text-red-400 hover:text-red-300 p-1">✕</button>
 </div>
 );
 }}
 />
 </Card>

 {totInv > 0 && (
 <Card>
 <h3 className="text-lg font-semibold mb-4">📊 Distribuição por Categoria</h3>
 <div className="space-y-3 max-w-3xl">
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

 <div className="grid grid-cols-2 gap-6">
 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold">💵 Rendimentos</h3>
 <Button onClick={()=>uS('rend',[...sara.rend,{id:Date.now(),desc:'Novo',val:0}])}>+ Adicionar</Button>
 </div>
 <div className="space-y-2">
 {sara.rend.map(r => (
 <Row key={r.id} highlight={r.isCR}>
 <StableInput className={`flex-1 ${inputClass}`} initialValue={r.desc} onSave={v=>uS('rend',sara.rend.map(x=>x.id===r.id?{...x,desc:v}:x))}/>
 {r.isCR && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg whitespace-nowrap">Deduz</span>}
 <StableInput type="number" className={`w-24 ${inputClass} text-right`} initialValue={r.val} onSave={v=>uS('rend',sara.rend.map(x=>x.id===r.id?{...x,val:v}:x))}/>
 <Button variant="danger" size="sm" onClick={()=>uS('rend',sara.rend.filter(x=>x.id!==r.id))}>✕</Button>
 </Row>
 ))}
 </div>
 <div className="flex justify-between mt-4 p-3 bg-emerald-500/10 rounded-xl"><span className="text-slate-300">Total</span><span className="font-bold text-emerald-400">{fmt(totSaraR)}</span></div>
 </Card>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold">💸 Despesas Fixas</h3>
 <Button onClick={()=>uS('desp',[...sara.desp,{id:Date.now(),desc:'Nova',val:0}])}>+ Adicionar</Button>
 </div>
 <div className="space-y-2 max-h-64 overflow-y-auto">
 {sara.desp.map(d => (
 <Row key={d.id}>
 <StableInput className={`flex-1 ${inputClass}`} initialValue={d.desc} onSave={v=>uS('desp',sara.desp.map(x=>x.id===d.id?{...x,desc:v}:x))}/>
 <StableInput type="number" className={`w-24 ${inputClass} text-right`} initialValue={d.val} onSave={v=>uS('desp',sara.desp.map(x=>x.id===d.id?{...x,val:v}:x))}/>
 <Button variant="danger" size="sm" onClick={()=>uS('desp',sara.desp.filter(x=>x.id!==d.id))}>✕</Button>
 </Row>
 ))}
 </div>
 <div className="flex justify-between mt-4 p-3 bg-orange-500/10 rounded-xl"><span className="text-slate-300">Total</span><span className="font-bold text-orange-400">{fmt(totSaraD)}</span></div>
 </Card>
 </div>

 <Card>
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-semibold">🎯 Alocação do Dinheiro Disponível</h3>
 <Button onClick={()=>uS('aloc',[...sara.aloc,{id:Date.now(),desc:'Nova',val:0,cor:['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ec4899'][sara.aloc.length%5]}])}>+ Adicionar</Button>
 </div>
 <div className="mb-6">
 <div className="flex justify-between text-sm mb-2"><span className="text-slate-400">Alocado: {fmt(totAloc)} de {fmt(sobraSara)}</span><span className={pctAloc>100?'text-red-400':'text-emerald-400'}>{pctAloc.toFixed(1)}%</span></div>
 <ProgressBar value={totAloc} max={sobraSara||1} color={pctAloc>100?'#ef4444':'#10b981'} height="h-2"/>
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
 {sara.aloc.map(a => {
 const pct = sobraSara>0?(a.val/sobraSara)*100:0;
 return (
 <div key={a.id} className="p-4 bg-slate-700/30 rounded-xl" style={{borderLeft: `4px solid ${a.cor}`}}>
 <div className="flex justify-between items-center mb-3">
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
 })}
 </div>
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
 <div className="space-y-6">

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
 <div className="flex justify-between items-center mb-4 max-w-3xl">
 <div>
 <h3 className="text-lg font-semibold">💰 Portfolio Total: {fmt(totPort)}</h3>
 <p className="text-xs text-slate-500">Categorias: {catsInv.join(', ')}</p>
 </div>
 <div className="flex gap-2">
   <Button variant="secondary" onClick={guardarSnapshot}>📸 Snapshot</Button>
   <Button onClick={()=>uM('portfolio',[...portfolio,{id:Date.now(),desc:'Novo',cat:catsInv[0]||'ETF',val:0}])}>+ Adicionar</Button>
 </div>
 </div>
 
 {/* Adicionar categoria */}
 <div className="flex items-center gap-2 mb-4 p-3 bg-slate-700/20 rounded-xl max-w-xl">
   <span className="text-xs text-slate-400">Nova categoria:</span>
   <input type="text" className={`flex-1 ${inputClass} text-xs`} value={novaCatPort} onChange={e => setNovaCatPort(e.target.value.toUpperCase())} placeholder="Ex: ACOES"/>
   <Button size="sm" onClick={() => { if (novaCatPort && !catsInv.includes(novaCatPort)) { uG('catsInv', [...catsInv, novaCatPort]); setNovaCatPort(''); } }}>+ Adicionar</Button>
 </div>
 
 <DraggableList
 items={portfolio}
 onReorder={(newItems) => uM('portfolio', newItems)}
 renderItem={(p, idx, isDragging, onDragStart, onDragEnd) => {
 const perf = getPerformance(p);
 return (
 <div className="flex items-center gap-2 p-2 rounded-lg transition-all bg-slate-700/30 hover:bg-slate-700/50">
 <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="text-slate-500 hover:text-slate-300 cursor-grab select-none block">⋮⋮</div>
 <div className="w-1 h-6 rounded-full block" style={{background: catCores[p.cat]||'#64748b'}}/>
 <StableInput className={`w-[35%] ${inputClass}`} initialValue={p.desc} onSave={v=>uM('portfolio',portfolio.map(x=>x.id===p.id?{...x,desc:v}:x))}/>
 <Select value={p.cat} onChange={e=>uM('portfolio',portfolio.map(x=>x.id===p.id?{...x,cat:e.target.value}:x))} className="w-[25%]">{catsInv.map(c=><option key={c} value={c}>{c}</option>)}</Select>
 <StableInput type="number" className={`w-[18%] ${inputClass} text-right`} initialValue={p.val} onSave={v=>uM('portfolio',portfolio.map(x=>x.id===p.id?{...x,val:v}:x))}/>
 {perf !== null ? (
 <span className={`w-[12%] text-right text-xs font-semibold ${perf.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
 {perf.pct >= 0 ? '▲' : '▼'}{Math.abs(perf.pct).toFixed(1)}%
 </span>
 ) : (
 <span className="w-[12%] text-right text-xs text-slate-500 inline">—</span>
 )}
 <button onClick={()=>uM('portfolio',portfolio.filter(x=>x.id!==p.id))} className="text-red-400 hover:text-red-300 p-1">✕</button>
 </div>
 );
 }}
 />
 <div className="mt-4 p-3 bg-slate-700/20 rounded-xl text-xs text-slate-500 max-w-3xl">
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
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-3">
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400">Valor da Casa</span>
 <StableInput type="number" className={`w-32 ${inputClass} text-right`} initialValue={valorCasa} onSave={v=>uC('valorCasa',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400">Entrada Inicial</span>
 <StableInput type="number" className={`w-32 ${inputClass} text-right`} initialValue={entradaInicial} onSave={v=>uC('entradaInicial',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-xl">
 <span className="text-slate-400">Montante Financiado</span>
 <StableInput type="number" className={`w-32 ${inputClass} text-right`} initialValue={montanteInicial} onSave={v=>uC('montanteInicial',v)}/>
 </div>
 <div className="flex justify-between items-center p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <span className="text-slate-300">Data Fim do Crédito</span>
 <input type="date" className={`w-40 ${inputClass}`} defaultValue={dataFim} onChange={e=>uC('dataFim',e.target.value)}/>
 </div>
 </div>
 <div className="space-y-3">
 <div className="flex justify-between items-center p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
 <span className="text-slate-300 font-medium">Dívida Atual</span>
 <StableInput type="number" className="w-32 bg-slate-700/50 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 font-bold text-right focus:outline-none" initialValue={dividaAtual} onSave={v=>uC('dividaAtual',v)}/>
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
 <p className="text-sm text-slate-400 mb-4">Simula como a prestação varia com diferentes taxas de juro (Euribor + Spread)</p>
 
 <div className="grid grid-cols-2 gap-6 mb-6">
 <div className="space-y-4">
 <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
 <div className="flex justify-between items-center mb-3">
 <span className="text-slate-300">Euribor (%)</span>
 <div className="flex items-center gap-2">
 <input type="number" step="0.1" value={simEuribor} onChange={e=>setSimEuribor(+e.target.value||0)} className="w-20 bg-slate-700/50 border border-blue-500/30 rounded-lg px-2 py-1 text-blue-400 font-bold text-right focus:outline-none"/>
 <span className="text-slate-500">%</span>
 </div>
 </div>
 <input type="range" min="-0.5" max="5" step="0.1" value={simEuribor} onChange={e=>setSimEuribor(+e.target.value)} className="w-full accent-blue-500"/>
 <div className="flex justify-between text-xs text-slate-500 mt-1"><span>-0.5%</span><span>5%</span></div>
 </div>
 
 <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <div className="flex justify-between items-center mb-3">
 <span className="text-slate-300">Spread (%)</span>
 <div className="flex items-center gap-2">
 <input type="number" step="0.1" value={simSpread} onChange={e=>setSimSpread(+e.target.value||0)} className="w-20 bg-slate-700/50 border border-purple-500/30 rounded-lg px-2 py-1 text-purple-400 font-bold text-right focus:outline-none"/>
 <span className="text-slate-500">%</span>
 </div>
 </div>
 <input type="range" min="0" max="3" step="0.1" value={simSpread} onChange={e=>setSimSpread(+e.target.value)} className="w-full accent-purple-500"/>
 <div className="flex justify-between text-xs text-slate-500 mt-1"><span>0%</span><span>3%</span></div>
 </div>
 </div>
 
 <div className="space-y-4">
 <div className="p-4 bg-slate-700/30 rounded-xl">
 <div className="flex justify-between items-center mb-3">
 <span className="text-slate-300">Dívida para simular</span>
 <div className="flex items-center gap-2">
 <span className="text-slate-500">€</span>
 <input type="number" value={simDivida || dividaAtual} onChange={e=>setSimDivida(+e.target.value||0)} className="w-32 bg-slate-700/50 border border-slate-600 rounded-lg px-2 py-1 text-white font-bold text-right focus:outline-none"/>
 </div>
 </div>
 <button className="text-xs text-blue-400 hover:text-blue-300" onClick={()=>setSimDivida(dividaAtual)}>↺ Usar dívida atual ({fmt(dividaAtual)})</button>
 </div>
 
 <div className="p-4 bg-slate-700/30 rounded-xl">
 <div className="flex justify-between items-center mb-3">
 <span className="text-slate-300">Prazo (meses)</span>
 <div className="flex items-center gap-2">
 <input type="number" value={simMeses || totalMesesRestantes} onChange={e=>setSimMeses(+e.target.value||1)} className="w-24 bg-slate-700/50 border border-slate-600 rounded-lg px-2 py-1 text-white font-bold text-right focus:outline-none"/>
 <span className="text-slate-500">meses</span>
 </div>
 </div>
 <p className="text-xs text-slate-500">{Math.floor((simMeses || totalMesesRestantes) / 12)} anos e {(simMeses || totalMesesRestantes) % 12} meses</p>
 <button className="text-xs text-blue-400 hover:text-blue-300 mt-1" onClick={()=>setSimMeses(totalMesesRestantes)}>↺ Usar prazo restante ({totalMesesRestantes} meses)</button>
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
 <h3 className="text-lg font-semibold mb-6">🎯 Simulador de Amortização</h3>
 
 <div className="grid grid-cols-2 gap-6 mb-6">
 <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
 <p className="text-sm text-slate-400 mb-3">Se amortizar mensalmente:</p>
 <div className="flex items-center gap-3 mb-4">
 <span className="text-slate-400">€</span>
 <input type="number" value={simAmort} onChange={e=>setSimAmort(+e.target.value||0)} className="flex-1 bg-slate-700/50 border border-emerald-500/30 rounded-xl px-3 py-2 text-emerald-400 text-2xl font-bold text-right focus:outline-none"/>
 <span className="text-slate-500">/mês</span>
 </div>
 <div className="space-y-2">
 <div className="flex justify-between"><span className="text-slate-400">Liquidado em:</span><span className="font-bold text-emerald-400">{anosComAmort.toFixed(1)} anos</span></div>
 <div className="flex justify-between"><span className="text-slate-400">Total de juros:</span><span className="font-semibold">{fmt(jurosComAmort)}</span></div>
 <div className="flex justify-between"><span className="text-slate-400">Poupança em juros:</span><span className="font-bold text-emerald-400">{fmt(poupancaJuros)}</span></div>
 </div>
 </div>
 
 <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
 <p className="text-sm text-slate-400 mb-3">Para liquidar em X anos:</p>
 <div className="flex items-center gap-3 mb-4">
 <input type="number" value={simAnos} onChange={e=>setSimAnos(Math.max(1,+e.target.value||1))} className="flex-1 bg-slate-700/50 border border-purple-500/30 rounded-xl px-3 py-2 text-purple-400 text-2xl font-bold text-right focus:outline-none" min="1" max="30"/>
 <span className="text-slate-500">anos</span>
 </div>
 <div className="space-y-2">
 <div className="flex justify-between"><span className="text-slate-400">Amortização necessária:</span><span className="font-bold text-purple-400">{fmt(amortNecessaria)}/mês</span></div>
 <div className="flex justify-between"><span className="text-slate-400">Total mensal:</span><span className="font-semibold">{fmt(prestacao + amortNecessaria)}</span></div>
 <div className="flex justify-between"><span className="text-slate-400">Com seguros:</span><span className="font-semibold">{fmt(custoMensal + amortNecessaria)}</span></div>
 </div>
 </div>
 </div>
 
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
 <div className="p-4 bg-slate-700/30 rounded-xl text-center">
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

 // AGENDA FINANCEIRA
 const Agenda = () => {
   const tarefas = G.tarefas || [];
   const tarefasConcluidas = G.tarefasConcluidas || {};
   const hoje = new Date();
   const mesAtual = hoje.getMonth() + 1;
   const anoAtual = hoje.getFullYear();
   const diaAtual = hoje.getDate();
   
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
   
   const addTarefa = () => {
     const desc = prompt('Descrição da tarefa:');
     if (!desc) return;
     const dia = parseInt(prompt('Dia do mês (1-31):') || '1');
     const freq = prompt('Frequência (mensal/trimestral/anual):') || 'mensal';
     const cat = prompt('Categoria (IVA/SS/IRS/Seguros/Outro):') || 'Outro';
     let mesesArr = [];
     if (freq === 'trimestral' || freq === 'anual') {
       const mesesStr = prompt('Meses (ex: 3,6,9,12):');
       mesesArr = mesesStr ? mesesStr.split(',').map(m => parseInt(m.trim())) : [];
     }
     saveUndo();
     uG('tarefas', [...tarefas, {id: Date.now(), desc, dia, freq, cat, meses: mesesArr, ativo: true}]);
   };
   
   const removeTarefa = (id) => {
     saveUndo();
     uG('tarefas', tarefas.filter(t => t.id !== id));
   };
   
   const catCores = {'IVA':'#f59e0b','SS':'#3b82f6','IRS':'#ef4444','Seguros':'#10b981','Outro':'#8b5cf6'};
   
   const pendentes = tarefasMesAtual.filter(t => !t.concluida);
   const atrasadas = pendentes.filter(t => t.atrasada);
   
   return (
     <div className="space-y-6">
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
           <Button onClick={addTarefa}>+ Nova Tarefa</Button>
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
         <h3 className="text-lg font-semibold mb-4">⚙️ Gerir Tarefas Recorrentes</h3>
         <div className="space-y-2">
           {tarefas.map(t => (
             <div key={t.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
               <div className="flex items-center gap-3">
                 <input type="checkbox" checked={t.ativo} onChange={() => uG('tarefas', tarefas.map(x => x.id === t.id ? {...x, ativo: !x.ativo} : x))} className="w-5 h-5 accent-blue-500"/>
                 <div className={!t.ativo ? 'opacity-50' : ''}>
                   <p className="font-medium text-sm">{t.desc}</p>
                   <p className="text-xs text-slate-500">Dia {t.dia} · {t.freq}{t.meses?.length > 0 ? ` (meses: ${t.meses.join(',')})` : ''}</p>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                 <span className="px-2 py-1 text-xs rounded-full" style={{background: `${catCores[t.cat] || '#64748b'}20`, color: catCores[t.cat] || '#64748b'}}>{t.cat}</span>
                 <button onClick={() => removeTarefa(t.id)} className="text-red-400 hover:text-red-300 p-1">✕</button>
               </div>
             </div>
           ))}
         </div>
       </Card>
     </div>
   );
 };

 const tabs = [{id:'resumo',icon:'📊',label:'Resumo'},{id:'receitas',icon:'💰',label:'Receitas'},{id:'abanca',icon:'🏠',label:'Casal'},{id:'pessoais',icon:'👤',label:'Pessoais'},{id:'invest',icon:'📈',label:'Investimentos'},{id:'sara',icon:'👩',label:'Sara'},{id:'historico',icon:'📅',label:'Histórico'},{id:'portfolio',icon:'💎',label:'Portfolio'},{id:'credito',icon:'🏦',label:'Crédito'},{id:'agenda',icon:'📋',label:'Agenda'}];

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
   
   return { pendentes, atrasadas, proximas };
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
 <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-x-hidden">
 <BackupModal />
 <SearchModal />
 <AlertsModal />
 <ImportCSVModal />
 <RelatorioAnualModal />
 {isOffline && (
   <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white text-center py-1 text-sm z-[100]">
     ⚠️ Offline - As alterações serão guardadas quando voltar a ligação
   </div>
 )}
 <style>{`select option{background:#1e293b;color:#e2e8f0}select option:checked{background:#3b82f6}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#475569;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#64748b}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}.scrollbar-hide::-webkit-scrollbar{display:none}@media print{.no-print{display:none!important}}`}</style>
 
 <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-50 no-print">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">💎 Dashboard</h1>
              <div className="flex gap-2">
                <select value={mes} onChange={e=>setMes(e.target.value)} className={`bg-slate-700/50 border rounded-xl px-2 sm:px-3 py-1.5 text-sm text-white focus:outline-none appearance-none cursor-pointer ${isMesAtual(mes, ano) ? 'border-emerald-500 ring-1 ring-emerald-500/50' : 'border-slate-600'}`}>
                  {meses.map(m=><option key={m} value={m}>{m}{m === mesAtualSistema ? ' •' : ''}</option>)}
                </select>
                <select value={ano} onChange={e=>setAno(+e.target.value)} className={`bg-slate-700/50 border rounded-xl px-2 sm:px-3 py-1.5 text-sm text-white focus:outline-none appearance-none cursor-pointer ${isMesAtual(mes, ano) ? 'border-emerald-500 ring-1 ring-emerald-500/50' : 'border-slate-600'}`}>
                  {anos.map(a=><option key={a} value={a}>{a}{a === anoAtualSistema ? ' •' : ''}</option>)}
                </select>
                {!isMesAtual(mes, ano) && (
                  <button onClick={() => { setMes(mesAtualSistema); setAno(anoAtualSistema); }} className="px-2 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400" title="Ir para mês atual">Hoje</button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
              <div className="flex gap-1 sm:gap-2 flex-wrap">
                <button onClick={() => setShowSearch(true)} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300" title="Pesquisar (Ctrl+F)">🔍</button>
                <button onClick={() => setShowAlerts(true)} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${getActiveAlerts().length > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700 text-slate-300'} hover:bg-slate-600`} title="Ver alertas e notificações">🔔{getActiveAlerts().length > 0 && <span className="ml-1">({getActiveAlerts().length})</span>}</button>
                <button onClick={handleUndo} disabled={undoHistory.length === 0} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${undoHistory.length > 0 ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400' : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'}`} title="Desfazer última alteração (Ctrl+Z)">↩️{undoHistory.length > 0 && <span className="ml-1 text-xs opacity-70">({undoHistory.length})</span>}</button>
                <button onClick={handleRedo} disabled={redoHistory.length === 0} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${redoHistory.length > 0 ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400' : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'}`} title="Refazer alteração (Ctrl+Y)">↪️</button>
                <button onClick={() => setShowImportCSV(true)} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300" title="Importar receitas de ficheiro CSV">📥</button>
                <button onClick={exportPDF} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300" title="Imprimir página atual">🖨️</button>
                <button onClick={() => setShowRelatorio(true)} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400" title="Gerar relatório anual">📄</button>
                <button onClick={() => { const data = { g: G, m: M, version: 1, exportDate: new Date().toISOString() }; setBackupData(JSON.stringify(data, null, 2)); setBackupMode('export'); setBackupStatus(''); setShowBackupModal(true); }} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300" title="Criar backup dos dados">📋</button>
                <button onClick={handleResetAll} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400" title="Apagar todos os dados">🗑️</button>
                <button onClick={exportToGoogleSheets} disabled={exporting} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${exporting ? 'bg-slate-600 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`} title="Exportar para Google Sheets">{exporting ? '⏳' : '📊'}</button>
              </div>
              {syncing ? (
                <div className="flex items-center gap-1 text-xs text-amber-400"><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/><span className="hidden sm:inline">A guardar...</span></div>
              ) : hasChanges ? (
                <div className="flex items-center gap-1 text-xs text-orange-400"><div className="w-2 h-2 rounded-full bg-orange-400"/><span className="hidden sm:inline">Não guardado</span></div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-emerald-400"><div className="w-2 h-2 rounded-full bg-emerald-400"/><span className="hidden sm:inline">Guardado</span></div>
              )}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
                {user?.photoURL && <img src={user.photoURL} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full"/>}
                <span className="hidden sm:inline text-sm text-slate-300">{user?.displayName?.split(' ')[0]}</span>
                <button onClick={onLogout} className="px-2 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400">Sair</button>
              </div>
            </div>
          </div>
        </header>

      <nav className="flex gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-slate-800/30 border-b border-slate-700/30 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all duration-200 ${tab===t.id?'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/25':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}><span className="sm:mr-1">{t.icon}</span><span className="hidden sm:inline">{t.label}</span></button>
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
 {tab==='agenda' && <Agenda/>}
 </main>
 </div>
 );
};

export default OrcamentoApp;
