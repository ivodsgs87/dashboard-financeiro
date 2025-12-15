import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createGoogleSheet, getAccessToken } from './firebase';

// Stable Input - uncontrolled para não perder foco
const StableInput = memo(({type = 'text', initialValue, onSave, className, ...props}) => {
  const inputRef = useRef(null);
  const lastSavedValue = useRef(initialValue);
  const hasFocus = useRef(false);
  const isEditing = useRef(false);
  
  const handleFocus = () => {
    hasFocus.current = true;
    isEditing.current = true;
  };
  
  const handleBlur = (e) => {
    hasFocus.current = false;
    const val = type === 'number' ? (+e.target.value || 0) : e.target.value;
    if (val !== lastSavedValue.current) {
      lastSavedValue.current = val;
      onSave(val);
    }
    // Pequeno delay para não resetar imediatamente
    setTimeout(() => { isEditing.current = false; }, 100);
  };
  
  const handleKeyDown = (e) => { 
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };
  
  // NUNCA atualizar o valor se estiver a editar ou com foco
  useEffect(() => {
    if (inputRef.current && !hasFocus.current && !isEditing.current) {
      if (inputRef.current.value !== String(initialValue ?? '')) {
        inputRef.current.value = initialValue ?? '';
        lastSavedValue.current = initialValue;
      }
    }
  }, [initialValue]);
  
  return (
    <input 
      ref={inputRef} 
      type={type} 
      defaultValue={initialValue} 
      onFocus={handleFocus}
      onBlur={handleBlur} 
      onKeyDown={handleKeyDown} 
      className={className} 
      {...props}
    />
  );
});

// Stable Date Input - para campos de data
const StableDateInput = memo(({value, onChange, className}) => {
  const inputRef = useRef(null);
  const hasFocus = useRef(false);
  
  const handleFocus = () => { hasFocus.current = true; };
  const handleBlur = () => { hasFocus.current = false; };
  const handleChange = (e) => { onChange(e.target.value); };
  
  useEffect(() => {
    if (inputRef.current && !hasFocus.current) {
      if (inputRef.current.value !== value) {
        inputRef.current.value = value;
      }
    }
  }, [value]);
  
  return (
    <input 
      ref={inputRef}
      type="date" 
      defaultValue={value}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
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
    metas: { receitas: 80000, amortizacao: 15000, investimentos: 12000 },
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
      historico: [{date: '2022-01', divida: 328500}, {date: '2025-12', divida: 229693.43}]
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
    }, 3000);
    
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

 const uM = useCallback((f, v) => setM(p => ({...p, [mesKey]: {...(p[mesKey]||defM), [f]:v}})), [mesKey]);
 const uG = useCallback((f,v) => setG(p => ({...p, [f]:v})), []);
 const uS = useCallback((f,v) => setG(p => ({...p, sara:{...p.sara, [f]:v}})), []);
 const uC = useCallback((f,v) => setG(p => ({...p, credito:{...p.credito, [f]:v}})), []);

 // Função para aplicar investimentos do mês atual aos meses futuros
 const aplicarInvFuturos = useCallback(() => {
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
 }, [mesKey, M, getMesAnteriorKey]);

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
 
 return (<div key={mesKey} className="space-y-6">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
 <StatCard label="Receita Total" value={fmt(totRec)} color="text-white" sub={`Com: ${fmt(inCom)} + Sem: ${fmt(inSem)}`} icon="💰"/>
 <StatCard label="Receita Líquida" value={fmt(recLiq)} color="text-emerald-400" sub={`Após ${fmtP(taxa)} taxas`} icon="✨"/>
 <StatCard label="Reserva Taxas" value={fmt(valTax)} color="text-orange-400" sub={`${fmtP(taxa)} do income com retenção`} icon="📋"/>
 <StatCard label="Disponível Alocar" value={fmt(restante)} color={restante >= 0 ? "text-blue-400" : "text-red-400"} sub="Após despesas e férias" icon="🎯"/>
 </div>

 {/* METAS ANUAIS */}
 <Card>
   <div className="flex justify-between items-center mb-4">
     <h3 className="text-lg font-semibold">🎯 Metas Anuais {ano}</h3>
     <span className="text-xs text-slate-500">{mesAtualNum} de 12 meses ({fmtP(progressoEsperado * 100)})</span>
   </div>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
     {[
       { label: '💰 Receitas', atual: totaisAnuais.receitasAnuais, meta: metas.receitas, key: 'receitas', color: '#3b82f6' },
       { label: '🏠 Amortização', atual: totaisAnuais.amortizacaoAnual, meta: metas.amortizacao, key: 'amortizacao', color: '#10b981' },
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
               <StableInput type="number" className="flex-1 bg-slate-600/50 border border-slate-500/50 rounded-lg px-2 py-1 text-xs text-white text-right" initialValue={m.meta} onSave={v => setG(p => ({...p, metas: {...p.metas, [m.key]: v}}))}/>
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
 {[{l:'Despesas Fixas (ABanca)',v:minhaAB,c:'#ec4899'},{l:'Despesas Pessoais',v:totPess,c:'#3b82f6'},{l:`🏠 Amortização (${fmtP(alocAmort)})`,v:restante*(alocAmort/100),c:'#10b981'},{l:`📈 Investimentos (${fmtP(100-alocAmort)})`,v:restante*((100-alocAmort)/100),c:'#8b5cf6'}].map((i,k) => (
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
 {[{l:'ABanca (Despesas Fixas)',s:'Dia 25 do mês',v:minhaAB,k:'abanca'},{l:'Activo Bank (Pessoais)',s:'Dia 25 do mês',v:totPess,k:'activo'},{l:'Trade Republic (Repor)',s:'Dia 31 do mês',v:transfTR,k:'trade'},{l:'Revolut (Férias)',s:'Dia 31 do mês',v:ferias,k:'revolut'}].map(t => (
 <Row key={t.k} highlight={transf[t.k]}>
 <div className="flex-1"><p className="font-medium">{t.l}</p><p className="text-xs text-slate-500">{t.s}</p></div>
 <span className="text-xl font-bold">{fmt(t.v)}</span>
 <input type="checkbox" className="w-5 h-5 rounded-lg accent-emerald-500 cursor-pointer" checked={transf[t.k]} onChange={e=>uM('transf',{...transf,[t.k]:e.target.checked})}/>
 </Row>
 ))}
 </div>
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
 const ABanca = () => (
 <Card>
 <div className="flex justify-between items-center mb-6 max-w-3xl">
 <div>
 <h3 className="text-lg font-semibold">🏠 Despesas ABanca (Fixas Partilhadas)</h3>
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
 );

 // PESSOAIS
 const Pessoais = () => (
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
 );

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
 const chartData = hAno.map(x => ({label: x.nome.slice(0,3), com: x.com, sem: x.sem}));
 
 // Médias trimestrais
 const trimestres = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]];
 const mediaTrim = trimestres.map((t,i) => {
 const mesesTrim = hAno.filter(x => t.includes(x.mes));
 const total = mesesTrim.reduce((a,x)=>a+x.tot,0);
 return {q: `Q${i+1}`, total, media: mesesTrim.length > 0 ? total / mesesTrim.length : 0, meses: mesesTrim.length};
 });
 
 const mediaAnual = hAno.length > 0 ? totH / hAno.length : 0;
 const anosComDados = [...new Set(h.map(x => x.ano))].sort();
 
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
 <h3 className="text-lg font-semibold mb-6">📈 Evolução das Receitas - {histAno}</h3>
 <BarChart data={chartData} height={220}/>
 <div className="flex gap-6 mt-4 justify-center text-sm">
 <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-orange-500"/><span className="text-slate-400">Com Taxas</span></div>
 <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-emerald-500"/><span className="text-slate-400">Sem Taxas</span></div>
 </div>
 </Card>
 )}

 <Card>
 <h3 className="text-lg font-semibold mb-4">📋 Detalhes por Mês - {histAno}</h3>
 {hAno.length===0 ? (
 <p className="text-center py-12 text-slate-500">Sem dados para {histAno}. Adiciona receitas nos meses.</p>
 ) : (
 <div className="space-y-3">
 {hAno.map(x => {
 const max = Math.max(...hAno.map(d => d.tot), 1);
 return (
 <div key={x.k} className="flex items-center gap-4">
 <span className="w-20 text-sm text-slate-400">{x.nome}</span>
 <div className="flex-1 h-6 bg-slate-700/30 rounded-lg overflow-hidden flex">
 <div className="h-full bg-orange-500 transition-all duration-500" style={{width: `${(x.com/max)*100}%`}}/>
 <div className="h-full bg-emerald-500 transition-all duration-500" style={{width: `${(x.sem/max)*100}%`}}/>
 </div>
 <span className="w-24 text-right font-bold">{fmt(x.tot)}</span>
 </div>
 );
 })}
 </div>
 )}
 </Card>
 </div>
 );
 };

 // PORTFOLIO
 const Portfolio = () => {
 const catCores = {'ETF':'#3b82f6','PPR':'#f59e0b','P2P':'#ec4899','CRIPTO':'#14b8a6','FE':'#10b981','CREDITO':'#ef4444'};
 const porCat = catsInv.map(c=>({cat:c,val:portfolio.filter(p=>p.cat===c).reduce((a,p)=>a+p.val,0)})).filter(c=>c.val>0);
 const pieData = porCat.map(c => ({value: c.val, color: catCores[c.cat] || '#64748b', label: c.cat}));
 const lineData = portfolioHist.slice(-12).map(h => { const [y,m]=h.date.split('-').map(Number); return {label: `${meses[m-1]?.slice(0,3)||m}`, value: h.total}; });
 const [novaCatPort, setNovaCatPort] = useState('');
 
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
 <h3 className="text-lg font-semibold mb-6">📊 Distribuição</h3>
 <div className="flex items-center gap-8">
 <PieChart data={pieData} size={180}/>
 <div className="flex-1 grid grid-cols-2 gap-3">
 {porCat.map(c => (
 <div key={c.cat} className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-xl">
 <div className="w-3 h-3 rounded-full" style={{background: catCores[c.cat]}}/>
 <div className="flex-1"><p className="text-sm font-medium">{c.cat}</p><p className="text-xs text-slate-500">{((c.val/totPort)*100).toFixed(1)}%</p></div>
 <p className="font-semibold" style={{color: catCores[c.cat]}}>{fmt(c.val)}</p>
 </div>
 ))}
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
 
 // Prazo restante
 const hoje = new Date();
 const fimCredito = new Date(dataFim);
 const diffMs = fimCredito - hoje;
 const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
 const anosRestantes = Math.floor(diffDias / 365);
 const mesesRestantes = Math.floor((diffDias % 365) / 30);
 const diasRestantes = diffDias % 30;
 const totalMesesRestantes = Math.ceil(diffDias / 30);
 
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
 const gerarProjecao = (amortExtra, mesesMax = 120) => {
 const data = [];
 let divida = dividaAtual;
 for (let m = 0; m <= mesesMax && divida > 0; m += 6) {
 data.push({label: `${Math.floor(m/12)}a`, value: divida});
 for (let i = 0; i < 6 && divida > 0; i++) {
 const juros = divida * taxaMensal;
 const amortNormal = prestacao - juros;
 divida = Math.max(0, divida - amortNormal - amortExtra);
 }
 }
 return data;
 };
 
 const projecaoSemAmort = gerarProjecao(0, 240);
 const projecaoComAmort = gerarProjecao(simAmort, 180);
 
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
 
 return (
 <div className="space-y-6">
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
 <StatCard label="Dívida Atual" value={fmt(dividaAtual)} color="text-red-400" icon="🏠"/>
 <StatCard label="Prestação + Seguros" value={fmt(custoMensal)} color="text-orange-400" sub={`${fmt(prestacao)} + ${fmt(seguros)}`} icon="💳"/>
 <StatCard label="Taxa de Juro" value={`${taxaJuro}%`} color="text-blue-400" sub="Taxa fixa" icon="📊"/>
 <StatCard label="Prazo Restante" value={`${anosRestantes}a ${mesesRestantes}m`} color="text-purple-400" sub={`Termina: ${fimCredito.toLocaleDateString('pt-PT')}`} icon="⏱️"/>
 <StatCard label="Já Amortizado" value={fmt(montanteInicial - dividaAtual)} color="text-emerald-400" sub={`${((1 - dividaAtual/montanteInicial)*100).toFixed(1)}% do inicial`} icon="✅"/>
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

 <Card>
 <h3 className="text-lg font-semibold mb-4">📝 Registar Atualização da Dívida</h3>
 <p className="text-sm text-slate-400 mb-4">Atualiza o valor da dívida atual acima e clica em "Registar" para guardar no histórico.</p>
 <Button onClick={() => {
 const currentMonth = `${ano}-${meses.indexOf(mes)+1}`;
 const hist = credito.historico || [];
 const existing = hist.findIndex(h => h.date === currentMonth);
 const newHist = existing >= 0 
 ? hist.map((h,i) => i === existing ? {...h, divida: dividaAtual} : h)
 : [...hist, {date: currentMonth, divida: dividaAtual}].sort((a,b) => {
 const [aY,aM]=a.date.split('-').map(Number);
 const [bY,bM]=b.date.split('-').map(Number);
 return aY===bY?aM-bM:aY-bY;
 });
 uC('historico', newHist);
 }}>📊 Registar Dívida Atual ({fmt(dividaAtual)}) para {mes} {ano}</Button>
 </Card>
 </div>
 );
 };

 const tabs = [{id:'resumo',icon:'📊',label:'Resumo'},{id:'receitas',icon:'💰',label:'Receitas'},{id:'abanca',icon:'🏠',label:'ABanca'},{id:'pessoais',icon:'👤',label:'Pessoais'},{id:'invest',icon:'📈',label:'Investimentos'},{id:'sara',icon:'👩',label:'Sara'},{id:'historico',icon:'📅',label:'Histórico'},{id:'portfolio',icon:'💎',label:'Portfolio'},{id:'credito',icon:'🏦',label:'Crédito'}];

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
       setG(defG);
       setM({});
       setHasChanges(true);
       alert('✅ Todos os dados foram resetados para os valores iniciais.');
     }
   }
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
 <style>{`select option{background:#1e293b;color:#e2e8f0}select option:checked{background:#3b82f6}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#475569;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#64748b}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
 
 <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-50">
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
                  <button onClick={() => { setMes(mesAtualSistema); setAno(anoAtualSistema); }} className="px-2 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400">Hoje</button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
              <div className="flex gap-1 sm:gap-2">
                <button onClick={() => { const data = { g: G, m: M, version: 1, exportDate: new Date().toISOString() }; setBackupData(JSON.stringify(data, null, 2)); setBackupMode('export'); setBackupStatus(''); setShowBackupModal(true); }} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">📋<span className="hidden sm:inline"> Backup</span></button>
                <button onClick={() => { setBackupData(''); setBackupMode('import'); setBackupStatus(''); setShowBackupModal(true); }} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">📤<span className="hidden sm:inline"> Restaurar</span></button>
                <button onClick={handleResetAll} className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400">🗑️<span className="hidden sm:inline"> Reset</span></button>
                <button onClick={exportToGoogleSheets} disabled={exporting} className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg ${exporting ? 'bg-slate-600 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`}>{exporting ? '⏳' : '📊'}<span className="hidden sm:inline">{exporting ? ' A exportar...' : ' Google Sheets'}</span></button>
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
 </main>
 </div>
 );
};

export default OrcamentoApp;
