// Separador "Venda da Casa".
import React, { useState } from 'react';
import {
  meses, _fmtEUR
} from './base';

const VC_DEFAULT = {
  dataVenda: '',
  valorVenda: 0,
  comissaoPct: 4,
  creditoAmortizado: 0,
  penalizacaoPct: 0.5,
  outrosCustos: 0,
  valorAquisicao: 0,
  hppOverride: null,
  movimentos: [],
  repor: []   // dinheiro teu adiantado que vais tirar da venda: {id, desc, val, quando: 'sinal'|'escritura', reposto: 'YYYY-MM-DD'|null}
};

const VendaCasa = ({ G, uG, theme }) => {
  const vc = { ...VC_DEFAULT, ...(G.vendaCasa || {}) };
  const contas = G.contas || [];
  const set = patch => uG('vendaCasa', { ...vc, ...patch });

  const [novo, setNovo] = useState({ data: '', desc: '', val: '', destino: '', tipo: 'parqueado' });
  const [novoRepor, setNovoRepor] = useState({ desc: '', val: '', quando: 'sinal' });

  const f = v => _fmtEUR.format(isFinite(v) ? v : 0);
  const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };

  // ── Apuramento da venda ──
  const valorVenda = n(vc.valorVenda);
  const custoComissao = valorVenda * n(vc.comissaoPct) / 100;
  const creditoAmort = n(vc.creditoAmortizado);
  const custoPenal = creditoAmort * n(vc.penalizacaoPct) / 100;
  const outros = n(vc.outrosCustos);
  const liquido = valorVenda - custoComissao - creditoAmort - custoPenal - outros;

  // ── Movimentos ──
  const movs = vc.movimentos || [];
  const somaTipo = t => movs.filter(m => m.tipo === t).reduce((a, m) => a + n(m.val), 0);
  const totParqueado = somaTipo('parqueado');
  const totGasto = somaTipo('gasto');
  const totInvestido = somaTipo('investido');
  // ── A repor: dinheiro teu que vais tirar da venda (não fica para reinvestir) ──
  const repor = vc.repor || [];
  const totRepor = repor.reduce((a, r) => a + n(r.val), 0);
  const totReporPendente = repor.filter(r => !r.reposto).reduce((a, r) => a + n(r.val), 0);
  const porAlocar = liquido - totParqueado - totGasto - totInvestido - totRepor;

  // Saldo por destino (só o que continua a ser teu: parqueado e investido)
  const porDestino = {};
  movs.forEach(m => {
    if (m.tipo === 'gasto') return;
    const k = m.destino || '(sem destino)';
    porDestino[k] = (porDestino[k] || 0) + n(m.val);
  });
  const destinos = Object.entries(porDestino).sort((a, b) => b[1] - a[1]);

  // ── Reserva HPP (mais-valias) ──
  // Regra: para isenção total, reinvestir o valor de realização deduzido do
  // capital em dívida amortizado. Editável, porque o teu caso pode ter nuances.
  const hppNecessario = vc.hppOverride != null ? n(vc.hppOverride) : Math.max(0, valorVenda - creditoAmort);
  const disponivelHPP = porAlocar + totParqueado;       // líquido e ainda teu
  const faltaHPP = hppNecessario - disponivelHPP;
  const pctHPP = hppNecessario > 0 ? Math.min(100, (disponivelHPP / hppNecessario) * 100) : 0;

  // Prazo de 36 meses
  let mesesRestantes = null, dataLimite = null;
  if (vc.dataVenda) {
    const d = new Date(vc.dataVenda);
    if (!isNaN(d)) {
      dataLimite = new Date(d); dataLimite.setMonth(dataLimite.getMonth() + 36);
      mesesRestantes = Math.max(0, Math.round((dataLimite - new Date()) / (1000 * 60 * 60 * 24 * 30.44)));
    }
  }

  // Estimativa (opcional) da mais-valia exposta por não reinvestir tudo
  const aquis = n(vc.valorAquisicao);
  let maisValiaExposta = null;
  if (aquis > 0 && faltaHPP > 0 && hppNecessario > 0) {
    const maisValia = Math.max(0, valorVenda - custoComissao - aquis);
    const propNaoReinv = Math.min(1, faltaHPP / hppNecessario);
    maisValiaExposta = maisValia * 0.5 * propNaoReinv; // 50% tributável, na proporção não reinvestida
  }

  // ── Estilos ──
  const card = theme === 'light' ? 'bg-white/80 border-slate-200 shadow-sm' : 'bg-slate-800/50 border-slate-700/50';
  const inp = theme === 'light'
    ? 'bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full'
    : 'bg-slate-700/50 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full';
  const sub = theme === 'light' ? 'text-slate-500' : 'text-slate-400';
  const line = theme === 'light' ? 'border-slate-200' : 'border-slate-700/50';

  const NumField = ({ label, val, onSave, step, suffix }) => (
    <label className="flex flex-col gap-1">
      <span className={`text-xs ${sub}`}>{label}</span>
      <div className="relative">
        <input type="number" step={step || 'any'} defaultValue={val} onBlur={e => onSave(e.target.value)} className={inp} />
        {suffix && <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${sub}`}>{suffix}</span>}
      </div>
    </label>
  );

  const TIPOS = {
    parqueado: { label: 'Parqueado', cor: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/40', desc: 'só mudou de sítio, continua teu' },
    gasto: { label: 'Gasto', cor: 'text-red-400', bg: 'bg-red-500/15 border-red-500/40', desc: 'saiu de vez' },
    investido: { label: 'Investido', cor: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/40', desc: 'aplicado, pode não estar líquido' }
  };

  const addMov = () => {
    if (!novo.desc.trim() && !novo.val) return;
    const m = {
      id: Date.now() + Math.random(),
      data: novo.data || new Date().toISOString().slice(0, 10),
      desc: novo.desc.trim() || 'Sem descrição',
      val: n(novo.val),
      destino: novo.destino.trim(),
      tipo: novo.tipo
    };
    set({ movimentos: [...movs, m] });
    setNovo({ data: '', desc: '', val: '', destino: '', tipo: novo.tipo });
  };
  const delMov = id => set({ movimentos: movs.filter(m => m.id !== id) });

  const movsOrd = [...movs].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  return (
    <div className="space-y-4 max-w-5xl mx-auto">

      {/* Resumo topo */}
      <div className={`backdrop-blur-sm rounded-2xl border p-4 sm:p-5 ${card}`}>
        <h3 className="text-lg font-semibold mb-3">🏠 Venda da Casa</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <p className={`text-xs ${sub}`}>Capital líquido</p>
            <p className="text-xl font-bold text-emerald-400">{f(liquido)}</p>
          </div>
          <div>
            <p className={`text-xs ${sub}`}>Por alocar</p>
            <p className={`text-xl font-bold ${porAlocar < -0.01 ? 'text-red-400' : 'text-blue-400'}`}>{f(porAlocar)}</p>
            {totRepor > 0 && <p className={`text-xs ${sub}`}>já sem os {f(totRepor)} a repor</p>}
          </div>
          <div>
            <p className={`text-xs ${sub}`}>Parqueado + investido</p>
            <p className="text-xl font-bold">{f(totParqueado + totInvestido)}</p>
          </div>
          <div>
            <p className={`text-xs ${sub}`}>Já gasto</p>
            <p className="text-xl font-bold text-red-400">{f(totGasto)}</p>
          </div>
        </div>
        {porAlocar < -0.01 && (
          <p className="text-xs text-red-400 mt-3">⚠️ Os movimentos somam mais do que o capital líquido. Verifica os valores.</p>
        )}
      </div>

      {/* Reserva HPP */}
      <div className={`backdrop-blur-sm rounded-2xl border p-4 sm:p-5 ${card}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold">🎯 Reserva para a nova HPP</h3>
            <p className={`text-xs ${sub}`}>Para não pagar mais-valias, tens de reinvestir em habitação própria e permanente dentro de 36 meses.</p>
          </div>
          {mesesRestantes != null && (
            <div className="text-right flex-shrink-0">
              <p className={`text-xs ${sub}`}>Faltam</p>
              <p className={`text-lg font-bold ${mesesRestantes <= 6 ? 'text-red-400' : mesesRestantes <= 12 ? 'text-amber-400' : 'text-emerald-400'}`}>{mesesRestantes} meses</p>
            </div>
          )}
        </div>

        <div className="flex justify-between text-sm mb-1">
          <span className={sub}>Disponível para reinvestir</span>
          <span className="font-semibold">{f(disponivelHPP)} / {f(hppNecessario)}</span>
        </div>
        <div className={`h-2.5 rounded-full overflow-hidden mb-3 ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`}>
          <div className={`h-full rounded-full transition-all ${faltaHPP > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: pctHPP + '%' }} />
        </div>

        {faltaHPP > 0 ? (
          <div className="text-sm space-y-1">
            <p className="text-amber-400">Faltam <strong>{f(faltaHPP)}</strong> para a isenção total de mais-valias.</p>
            {maisValiaExposta != null && (
              <p className={`text-xs ${sub}`}>Estimativa grosseira de mais-valia que ficaria tributável: <strong className="text-amber-400">{f(maisValiaExposta)}</strong> (50% da mais-valia, na proporção não reinvestida).</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-emerald-400">✓ Tens capital suficiente reservado para a isenção total.</p>
        )}

        {totInvestido > 0 && (
          <p className={`text-xs mt-2 ${sub}`}>⚠️ {f(totInvestido)} está investido e não conta acima — só volta a contar se conseguires resgatá-lo a tempo da compra.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <NumField label="Valor a reinvestir (auto: venda − crédito)" val={hppNecessario} onSave={v => set({ hppOverride: v === '' ? null : n(v) })} />
          <NumField label="Valor de aquisição da casa (opcional)" val={vc.valorAquisicao} onSave={v => set({ valorAquisicao: n(v) })} />
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${sub}`}>Data da escritura</span>
            <input type="date" defaultValue={vc.dataVenda} onBlur={e => set({ dataVenda: e.target.value })} className={inp} />
          </label>
        </div>
        <p className={`text-[11px] mt-3 ${sub}`}>Estimativas simplificadas — não substituem o teu contabilista. A mais-valia real depende do valor de aquisição corrigido, encargos e obras comprovadas.</p>
      </div>

      {/* Apuramento */}
      <div className={`backdrop-blur-sm rounded-2xl border p-4 sm:p-5 ${card}`}>
        <h3 className="text-lg font-semibold mb-3">🧾 Apuramento da venda</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <NumField label="Valor de venda" val={vc.valorVenda} onSave={v => set({ valorVenda: n(v) })} />
          <NumField label="Comissão agência" val={vc.comissaoPct} onSave={v => set({ comissaoPct: n(v) })} suffix="%" />
          <NumField label="Crédito amortizado" val={vc.creditoAmortizado} onSave={v => set({ creditoAmortizado: n(v) })} />
          <NumField label="Penalização amortização" val={vc.penalizacaoPct} onSave={v => set({ penalizacaoPct: n(v) })} suffix="%" />
          <NumField label="Outros custos (escritura, etc.)" val={vc.outrosCustos} onSave={v => set({ outrosCustos: n(v) })} />
        </div>
        <div className={`border-t ${line} pt-3 space-y-1.5 text-sm`}>
          <div className="flex justify-between"><span className={sub}>Valor de venda</span><span>{f(valorVenda)}</span></div>
          <div className="flex justify-between"><span className={sub}>Comissão agência ({vc.comissaoPct}%)</span><span className="text-red-400">−{f(custoComissao)}</span></div>
          <div className="flex justify-between"><span className={sub}>Amortização do crédito</span><span className="text-red-400">−{f(creditoAmort)}</span></div>
          <div className="flex justify-between"><span className={sub}>Penalização ({vc.penalizacaoPct}%)</span><span className="text-red-400">−{f(custoPenal)}</span></div>
          {outros > 0 && <div className="flex justify-between"><span className={sub}>Outros custos</span><span className="text-red-400">−{f(outros)}</span></div>}
          <div className={`flex justify-between border-t ${line} pt-2 font-semibold`}><span>Capital líquido</span><span className="text-emerald-400">{f(liquido)}</span></div>
        </div>
      </div>

      {/* Onde está o dinheiro */}
      {destinos.length > 0 && (
        <div className={`backdrop-blur-sm rounded-2xl border p-4 sm:p-5 ${card}`}>
          <h3 className="text-lg font-semibold mb-3">📍 Onde está o dinheiro</h3>
          <div className="space-y-2">
            {destinos.map(([nome, val]) => {
              const pct = liquido > 0 ? (val / liquido) * 100 : 0;
              return (
                <div key={nome}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{nome}</span>
                    <span className="font-semibold">{f(val)} <span className={`text-xs ${sub}`}>{pct.toFixed(1)}%</span></span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`}>
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: Math.min(100, pct) + '%' }} />
                  </div>
                </div>
              );
            })}
            {porAlocar > 0.01 && (
              <div className={`flex justify-between text-sm pt-2 border-t ${line}`}>
                <span className={sub}>Ainda por alocar</span>
                <span className="font-semibold text-blue-400">{f(porAlocar)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* A repor com a venda */}
      <div className={`backdrop-blur-sm rounded-2xl border p-4 sm:p-5 ${card}`}>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
          <h3 className="text-lg font-semibold">↩️ A repor com a venda</h3>
          {totReporPendente > 0 && <span className="text-sm font-semibold text-amber-400">falta repor {f(totReporPendente)}</span>}
        </div>
        <p className={`text-xs mb-3 ${sub}`}>Dinheiro teu que adiantaste e vais tirar do dinheiro da venda. Já não conta como disponível para reinvestir.</p>
        {repor.length > 0 && (
          <div className="space-y-2 mb-3">
            {repor.map(r => (
              <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 ${r.reposto ? (theme === 'light' ? 'border-slate-200 opacity-60' : 'border-slate-700/50 opacity-60') : 'border-amber-500/40 bg-amber-500/5'}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={!!r.reposto}
                    onChange={e => set({ repor: repor.map(x => x.id === r.id ? { ...x, reposto: e.target.checked ? new Date().toISOString().slice(0, 10) : null } : x) })} aria-label="Já reposto" />
                  <span className={r.reposto ? 'line-through' : ''}>{r.desc || 'Sem descrição'}</span>
                </label>
                <span className={`text-xs ${sub}`}>{r.reposto ? `reposto a ${String(r.reposto).split('-').reverse().join('/')}` : r.quando === 'escritura' ? 'repor na escritura' : 'repor ao receber o sinal'}</span>
                <span className="ml-auto font-semibold tabular-nums">{f(n(r.val))}</span>
                <button onClick={() => set({ repor: repor.filter(x => x.id !== r.id) })} className="text-red-400/60 hover:text-red-400 text-sm" aria-label="Apagar">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className={`rounded-xl border p-3 ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-700/50'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2 mb-2">
            <input placeholder="Descrição (ex.: 5 rendas adiantadas)" value={novoRepor.desc} onChange={e => setNovoRepor({ ...novoRepor, desc: e.target.value })} className={inp} />
            <input type="number" inputMode="decimal" placeholder="Valor €" value={novoRepor.val} onChange={e => setNovoRepor({ ...novoRepor, val: e.target.value })} className={inp} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {[['sinal', 'Ao receber o sinal'], ['escritura', 'Na escritura']].map(([k, l]) => (
                <button key={k} onClick={() => setNovoRepor({ ...novoRepor, quando: k })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${novoRepor.quando === k ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : (theme === 'light' ? 'border-slate-300 text-slate-600' : 'border-slate-600 text-slate-400')}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => { if (!n(novoRepor.val)) return; set({ repor: [...repor, { id: Date.now(), desc: novoRepor.desc.trim(), val: n(novoRepor.val), quando: novoRepor.quando, reposto: null }] }); setNovoRepor({ desc: '', val: '', quando: novoRepor.quando }); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white">+ Adicionar</button>
          </div>
        </div>
      </div>

      {/* Movimentos */}
      <div className={`backdrop-blur-sm rounded-2xl border p-4 sm:p-5 ${card}`}>
        <h3 className="text-lg font-semibold mb-1">💸 Movimentos</h3>
        <p className={`text-xs mb-3 ${sub}`}>Parqueado = só mudou de sítio · Gasto = saiu de vez · Investido = aplicado</p>

        {/* Novo movimento */}
        <div className={`rounded-xl border p-3 mb-4 ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-700/50'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <input type="date" value={novo.data} onChange={e => setNovo({ ...novo, data: e.target.value })} className={inp} />
            <input type="text" value={novo.desc} onChange={e => setNovo({ ...novo, desc: e.target.value })} placeholder="Descrição" className={`${inp} col-span-2 sm:col-span-1`} />
            <input type="number" value={novo.val} onChange={e => setNovo({ ...novo, val: e.target.value })} placeholder="Valor €" className={inp} />
            <input type="text" list="vc-destinos" value={novo.destino} onChange={e => setNovo({ ...novo, destino: e.target.value })} placeholder="Destino" className={inp} />
            <datalist id="vc-destinos">
              {contas.map(c => <option key={c.id} value={c.nome} />)}
              <option value="Trade Republic (Ivo)" />
              <option value="Trade Republic (Sara)" />
              <option value="Investimento imobiliário" />
            </datalist>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(TIPOS).map(([k, t]) => (
              <button key={k} onClick={() => setNovo({ ...novo, tipo: k })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${novo.tipo === k ? `${t.bg} ${t.cor}` : (theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-500' : 'bg-slate-700/40 border-slate-600 text-slate-400')}`}>
                {t.label}
              </button>
            ))}
            <button onClick={addMov} className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-all">+ Adicionar</button>
          </div>
        </div>

        {/* Lista */}
        {movsOrd.length === 0 ? (
          <p className={`text-sm text-center py-6 ${sub}`}>Ainda sem movimentos. Regista o primeiro acima.</p>
        ) : (
          <div className="space-y-1.5">
            {movsOrd.map(m => {
              const t = TIPOS[m.tipo] || TIPOS.parqueado;
              return (
                <div key={m.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${theme === 'light' ? 'bg-slate-50' : 'bg-slate-700/30'}`}>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${t.bg} ${t.cor}`}>{t.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{m.desc}</p>
                    <p className={`text-[11px] ${sub}`}>{m.data}{m.destino ? ` · ${m.destino}` : ''}</p>
                  </div>
                  <span className={`text-sm font-semibold flex-shrink-0 ${m.tipo === 'gasto' ? 'text-red-400' : ''}`}>{f(n(m.val))}</span>
                  <button onClick={() => delMov(m.id)} className="text-red-400 hover:text-red-300 text-sm flex-shrink-0 px-1">✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div className={`grid grid-cols-3 gap-2 mt-4 pt-3 border-t ${line} text-center`}>
          <div><p className={`text-xs ${sub}`}>Parqueado</p><p className="font-semibold text-blue-400">{f(totParqueado)}</p></div>
          <div><p className={`text-xs ${sub}`}>Gasto</p><p className="font-semibold text-red-400">{f(totGasto)}</p></div>
          <div><p className={`text-xs ${sub}`}>Investido</p><p className="font-semibold text-purple-400">{f(totInvestido)}</p></div>
        </div>
      </div>
    </div>
  );
};

export {
  VC_DEFAULT, VendaCasa
};
