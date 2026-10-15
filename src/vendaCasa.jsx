// Separadores "Venda da Casa" e "Casamento". Só são descarregados quando se abrem.
import React, { useState } from 'react';
import {
  meses, Ico, _fmtEUR, fmtPct, confirmar, VC_DEFAULT, VC_DIAS_SEMANA, vcPrazosCPCV
} from './base';

// ── Tab "Venda da Casa": rasto do capital da venda até estar investido ──
// Componente ao nível do módulo (estado próprio, sem remount). Recebe G/uG por props.
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
  const escritura = n(vc.custoEscritura);
  const rendasAdiant = n(vc.rendasAdiantadas);
  const outros = n(vc.outrosCustos);
  const liquido = valorVenda - custoComissao - creditoAmort - custoPenal - escritura - rendasAdiant - outros;

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

  // Saldo de cada sítio. Parqueado e investido põem dinheiro da venda num sítio.
  // Um gasto feito a partir de um sítio onde está dinheiro da venda sai desse sítio
  // (e não do que está por alocar). Se o gasto for maior do que o que lá está,
  // o resto sai do que está por alocar.
  const chaveSitio = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const sitios = {};
  const sitio = nome => {
    const k = chaveSitio(nome) || '(sem destino)';
    return sitios[k] || (sitios[k] = { nome: String(nome || '').trim() || '(sem destino)', parq: 0, inv: 0, gasto: 0, temEntrada: false });
  };
  movs.forEach(m => {
    if (m.tipo === 'gasto') { if (chaveSitio(m.destino)) sitio(m.destino).gasto += n(m.val); return; }
    const s = sitio(m.destino);
    if (!s.temEntrada) { s.nome = String(m.destino || '').trim() || '(sem destino)'; s.temEntrada = true; }
    if (m.tipo === 'investido') s.inv += n(m.val); else s.parq += n(m.val);
  });
  let tirouParq = 0, tirouInv = 0;
  Object.values(sitios).forEach(s => {
    const deParq = Math.min(s.parq, s.gasto);
    const deInv = Math.min(s.inv, s.gasto - deParq);
    s.entrou = s.parq + s.inv;
    s.saiu = deParq + deInv;
    s.saldo = s.entrou - s.saiu;
    tirouParq += deParq; tirouInv += deInv;
  });
  const gastoDosSitios = tirouParq + tirouInv;
  const parqueadoAgora = totParqueado - tirouParq;
  const investidoAgora = totInvestido - tirouInv;
  const porAlocar = liquido - totParqueado - totGasto - totInvestido - totRepor + gastoDosSitios;
  const destinos = Object.values(sitios).filter(s => s.entrou > 0).sort((a, b) => b.saldo - a.saldo);
  // Um gasto com o mesmo valor de uma linha "A repor" é muitas vezes o mesmo dinheiro registado duas vezes
  const gastosIguaisRepor = movs.filter(m => m.tipo === 'gasto' && n(m.val) > 0 && repor.some(r => Math.abs(n(r.val) - n(m.val)) < 0.5));

  // ── Reserva HPP (mais-valias) ──
  // Regra: para isenção total, reinvestir o valor de realização deduzido do
  // capital em dívida amortizado. Editável, porque o teu caso pode ter nuances.
  const hppNecessario = vc.hppOverride != null ? n(vc.hppOverride) : Math.max(0, valorVenda - creditoAmort);
  const disponivelHPP = porAlocar + parqueadoAgora;     // líquido e ainda teu
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
        <input type="number" step={step || 'any'} key={String(val ?? '')} defaultValue={val} onBlur={e => { if (e.target.value !== String(val ?? '')) onSave(e.target.value); }} className={inp} />
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

  // Prazos do CPCV (os "feitos" ficam nas tarefas concluídas, como no Calendário)
  const prazosCPCV = vcPrazosCPCV(vc, G.tarefasConcluidas || {});
  const hojeCPCV = new Date(); hojeCPCV.setHours(0, 0, 0, 0);
  const marcarCPCV = (k, v) => { const c = { ...(G.tarefasConcluidas || {}) }; if (v) c[k] = true; else delete c[k]; uG('tarefasConcluidas', c); };

  return (
    <div className="space-y-4 max-w-5xl xl:max-w-none mx-auto pag-2col">

      {/* Resumo topo */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${card} col-toda`}>
        <h3 className="text-lg font-semibold mb-3"><Ico e="🏠"/>Venda da Casa</h3>
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
            <p className="text-xl font-bold">{f(parqueadoAgora + investidoAgora)}</p>
            {gastoDosSitios > 0 && <p className={`text-xs ${sub}`}>já sem os {f(gastoDosSitios)} que gastaste daí</p>}
          </div>
          <div>
            <p className={`text-xs ${sub}`}>Já gasto</p>
            <p className="text-xl font-bold text-red-400">{f(totGasto)}</p>
          </div>
        </div>
        {porAlocar < -0.01 && (
          <p className="text-xs text-red-400 mt-3"><Ico e="⚠"/>Os movimentos somam mais do que o capital líquido. Verifica os valores.</p>
        )}
      </div>

      {/* Esquerda: o processo (prazos até à escritura) e as contas da venda */}
      <div className="space-y-4 min-w-0">
      {/* Contrato-promessa (CPCV): prazos até à escritura */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
        <h3 className="text-lg font-semibold"><Ico e="📝"/>Contrato-promessa (CPCV)</h3>
        <p className={`text-xs mb-3 ${sub}`}>Os prazos aparecem também no Calendário e nas notificações.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${sub}`}>Data do CPCV</span>
            <input type="date" key={'c' + (vc.dataCPCV || '')} defaultValue={vc.dataCPCV} onBlur={e => { if (e.target.value !== (vc.dataCPCV || '')) set({ dataCPCV: e.target.value }); }} className={inp} />
          </label>
          {NumField({ label: "Sinal", val: vc.sinal, onSave: v => set({ sinal: n(v) }), suffix: "€" })}
          {NumField({ label: "Prazo para a escritura", val: vc.prazoEscrituraDias, onSave: v => set({ prazoEscrituraDias: Math.max(1, Math.round(n(v))) || 45 }), suffix: "dias" })}
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${sub}`}>Escritura marcada para</span>
            <input type="date" key={'e' + (vc.dataVenda || '')} defaultValue={vc.dataVenda} onBlur={e => { if (e.target.value !== (vc.dataVenda || '')) set({ dataVenda: e.target.value }); }} className={inp} />
          </label>
        </div>
        {prazosCPCV.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {prazosCPCV.map(p => {
              const dias = Math.round((p.data - hojeCPCV) / 86400000);
              const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : dias > 1 ? `daqui a ${dias} dias` : null;
              const cor = p.estado === 'ok' ? '' : p.estado === 'atrasado' ? 'text-red-400' : dias <= 7 ? 'text-amber-400' : '';
              return (
                <li key={p.id} className={`flex items-start gap-3 rounded-xl px-3 py-2 tile ${p.estado === 'ok' ? 'opacity-60' : ''}`}>
                  <input type="checkbox" aria-label={`${p.titulo} feito`} className="mt-1 w-4 h-4 accent-emerald-500 flex-shrink-0" checked={p.estado === 'ok'} onChange={e => marcarCPCV(p.chave, e.target.checked)} />
                  <div className="w-14 sm:w-20 flex-shrink-0">
                    <p className={`text-sm font-semibold tabular-nums ${cor}`}>{String(p.data.getDate()).padStart(2, '0')}/{String(p.data.getMonth() + 1).padStart(2, '0')}</p>
                    <p className={`text-[11px] ${sub}`}>{VC_DIAS_SEMANA[p.data.getDay()]}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${p.estado === 'ok' ? 'line-through' : ''}`}>{p.titulo}{p.estado !== 'ok' && quando && <span className={`ml-2 text-xs font-normal ${cor || sub}`}>{quando}</span>}{p.estado === 'atrasado' && <span className="ml-2 text-xs font-normal text-red-400">já passou</span>}</p>
                    {p.nota && <p className={`text-xs ${sub}`}>{p.nota}</p>}
                    {p.lista && p.estado !== 'ok' && (
                      <ol className={`mt-1 text-xs list-decimal pl-4 space-y-0.5 ${sub}`}>{p.lista.map((x, i) => <li key={i}>{x}</li>)}</ol>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`text-sm mt-3 ${sub}`}>Põe a data do CPCV para veres aqui os prazos até à escritura.</p>
        )}
      </div>

      {/* Apuramento */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
        <h3 className="text-lg font-semibold mb-3"><Ico e="🧾"/>Apuramento da venda</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {NumField({ label: "Valor de venda", val: vc.valorVenda, onSave: v => set({ valorVenda: n(v) }) })}
          {NumField({ label: "Comissão agência", val: vc.comissaoPct, onSave: v => set({ comissaoPct: n(v) }), suffix: "%" })}
          {NumField({ label: "Crédito amortizado", val: vc.creditoAmortizado, onSave: v => set({ creditoAmortizado: n(v) }) })}
          {NumField({ label: "Penalização amortização", val: vc.penalizacaoPct, onSave: v => set({ penalizacaoPct: n(v) }), suffix: "%" })}
          {NumField({ label: "Escritura", val: vc.custoEscritura, onSave: v => set({ custoEscritura: n(v) }) })}
          {NumField({ label: "Rendas adiantadas", val: vc.rendasAdiantadas, onSave: v => set({ rendasAdiantadas: n(v) }) })}
          {NumField({ label: "Outros", val: vc.outrosCustos, onSave: v => set({ outrosCustos: n(v) }) })}
        </div>
        <div className={`border-t ${line} pt-3 space-y-1.5 text-sm`}>
          <div className="flex justify-between"><span className={sub}>Valor de venda</span><span>{f(valorVenda)}</span></div>
          <div className="flex justify-between"><span className={sub}>Comissão agência ({vc.comissaoPct}%)</span><span className="text-red-400">−{f(custoComissao)}</span></div>
          <div className="flex justify-between"><span className={sub}>Amortização do crédito</span><span className="text-red-400">−{f(creditoAmort)}</span></div>
          <div className="flex justify-between"><span className={sub}>Penalização ({vc.penalizacaoPct}%)</span><span className="text-red-400">−{f(custoPenal)}</span></div>
          {escritura > 0 && <div className="flex justify-between"><span className={sub}>Escritura</span><span className="text-red-400">−{f(escritura)}</span></div>}
          {rendasAdiant > 0 && <div className="flex justify-between"><span className={sub}>Rendas adiantadas (voltam para ti)</span><span className="text-red-400">−{f(rendasAdiant)}</span></div>}
          {outros > 0 && <div className="flex justify-between"><span className={sub}>Outros</span><span className="text-red-400">−{f(outros)}</span></div>}
          <div className={`flex justify-between border-t ${line} pt-2 font-semibold`}><span>Capital líquido</span><span className="text-emerald-400">{f(liquido)}</span></div>
        </div>
      </div>

      </div>
      {/* Direita: o dinheiro (reserva para a HPP, onde está, o que repor e os movimentos) */}
      <div className="space-y-4 min-w-0">
      {/* Reserva HPP */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold"><Ico e="🎯"/>Reserva para a nova HPP</h3>
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

        {investidoAgora > 0 && (
          <p className={`text-xs mt-2 ${sub}`}><Ico e="⚠"/>{f(investidoAgora)} está investido e não conta acima — só volta a contar se conseguires resgatá-lo a tempo da compra.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {NumField({ label: "Valor a reinvestir (auto: venda − crédito)", val: hppNecessario, onSave: v => set({ hppOverride: v === '' ? null : n(v) }) })}
          {NumField({ label: "Valor de aquisição da casa (opcional)", val: vc.valorAquisicao, onSave: v => set({ valorAquisicao: n(v) }) })}
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${sub}`}>Data da escritura</span>
            <input type="date" key={'h' + (vc.dataVenda || '')} defaultValue={vc.dataVenda} onBlur={e => { if (e.target.value !== (vc.dataVenda || '')) set({ dataVenda: e.target.value }); }} className={inp} />
          </label>
        </div>
        <p className={`text-[11px] mt-3 ${sub}`}>Estimativas simplificadas — não substituem o teu contabilista. A mais-valia real depende do valor de aquisição corrigido, encargos e obras comprovadas.</p>
      </div>

      {/* Onde está o dinheiro */}
      {destinos.length > 0 && (
        <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
          <h3 className="text-lg font-semibold mb-3"><Ico e="📍"/>Onde está o dinheiro</h3>
          <div className="space-y-2">
            {destinos.map(s => {
              const pct = liquido > 0 ? (s.saldo / liquido) * 100 : 0;
              return (
                <div key={s.nome} className={s.saldo < 0.005 ? 'opacity-60' : ''}>
                  <div className="flex justify-between gap-3 text-sm mb-1">
                    <span className="min-w-0">{s.nome}
                      {s.saiu > 0.005 && <span className={`block text-[11px] ${sub}`}>entrou {f(s.entrou)} · gastaste {f(s.saiu)}</span>}
                    </span>
                    <span className="font-semibold flex-shrink-0">{f(s.saldo)} <span className={`text-xs ${sub}`}>{fmtPct(pct, 1)}</span></span>
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
      <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
          <h3 className="text-lg font-semibold"><Ico e="↩"/>A repor com a venda</h3>
          {totReporPendente > 0 && <span className="text-sm font-semibold text-amber-400">falta repor {f(totReporPendente)}</span>}
        </div>
        <p className={`text-xs mb-3 ${sub}`}>Dinheiro teu que adiantaste e vais tirar do dinheiro da venda. Já não conta como disponível para reinvestir.</p>
        {rendasAdiant > 0 && repor.some(r => /renda/i.test(r.desc || '')) && (
          <p className="text-xs mb-3 text-amber-400">As rendas adiantadas já estão no Apuramento da venda. Se esta linha é a mesma coisa, apaga uma delas para não contar duas vezes.</p>
        )}
        {gastosIguaisRepor.length > 0 && (
          <p className="text-xs mb-3 text-amber-400">Nos Movimentos há {gastosIguaisRepor.length === 1 ? `um gasto («${gastosIguaisRepor[0].desc}»)` : `${gastosIguaisRepor.length} gastos`} com o mesmo valor de uma linha daqui. Se é o mesmo dinheiro, está a ser descontado duas vezes: aqui fica o que volta para ti, e o gasto só deve existir se esse dinheiro saiu de vez.</p>
        )}
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
      <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
        <h3 className="text-lg font-semibold mb-1"><Ico e="💸"/>Movimentos</h3>
        <p className={`text-xs mb-3 ${sub}`}>Parqueado = só mudou de sítio · Gasto = saiu de vez · Investido = aplicado</p>

        {/* Novo movimento */}
        <div className={`rounded-xl border p-3 mb-4 ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-700/50'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <input type="date" value={novo.data} onChange={e => setNovo({ ...novo, data: e.target.value })} className={inp} />
            <input type="text" value={novo.desc} onChange={e => setNovo({ ...novo, desc: e.target.value })} placeholder="Descrição" className={`${inp} col-span-2 sm:col-span-1`} />
            <input type="number" value={novo.val} onChange={e => setNovo({ ...novo, val: e.target.value })} placeholder="Valor €" className={inp} />
            <input type="text" list="vc-destinos" value={novo.destino} onChange={e => setNovo({ ...novo, destino: e.target.value })} placeholder={novo.tipo === 'gasto' ? 'Pago de' : 'Destino'} title={novo.tipo === 'gasto' ? 'Se pagaste de um sítio onde está dinheiro da venda, sai desse sítio' : 'Para onde foi o dinheiro'} className={inp} />
            <datalist id="vc-destinos">
              {[...new Set([...destinos.map(s => s.nome), ...contas.map(c => c.nome), 'Trade Republic (Ivo)', 'Trade Republic (Sara)', 'Investimento imobiliário'].filter(Boolean))].map(nome => <option key={nome} value={nome} />)}
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
                    <p className={`text-[11px] ${sub}`}>{m.data}{m.destino ? (m.tipo === 'gasto' ? ` · pago de ${m.destino}` : ` · ${m.destino}`) : ''}</p>
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
    </div>
  );
};

// ── Tab "Casamento": o que já se gastou, onde e quanto falta pagar ──
const CAS_CATS = [
  ['espaco', 'Espaço / Quinta', '#8b5cf6'], ['catering', 'Catering', '#f59e0b'], ['bebidas', 'Bebidas', '#f97316'], ['bolo', 'Bolo', '#ec4899'],
  ['foto', 'Fotografia', '#06b6d4'], ['video', 'Vídeo', '#0ea5e9'], ['musica', 'Música / DJ', '#6366f1'], ['flores', 'Decoração / Flores', '#10b981'],
  ['vestido', 'Vestido', '#f43f5e'], ['fato', 'Fato', '#64748b'], ['aliancas', 'Alianças', '#eab308'], ['beleza', 'Cabelo / Maquilhagem', '#d946ef'],
  ['convites', 'Convites / Papelaria', '#84cc16'], ['cerimonia', 'Igreja / Registo', '#14b8a6'], ['transporte', 'Transporte', '#a3a3a3'],
  ['lembrancas', 'Lembranças', '#fb7185'], ['lua', 'Lua de mel', '#22d3ee'], ['outros', 'Outros', '#94a3b8'],
];
// (fora do componente para os campos não serem recriados a cada letra)
const CasCampo = ({ rot, sub, children, className = '' }) => <label className={`flex flex-col gap-1 min-w-0 ${className}`}><span className={`text-xs ${sub}`}>{rot}</span>{children}</label>;
const CasBarra = ({ pct, cor, claro }) => <div className={`h-1.5 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700/60'}`}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: cor }} /></div>;
const casCat = id => CAS_CATS.find(c => c[0] === id) || CAS_CATS[CAS_CATS.length - 1];

const Casamento = ({ G, uG, theme }) => {
  const cs = G.casamento || {};
  const set = patch => uG('casamento', { ...cs, ...patch });
  const desp = cs.despesas || [];
  const n = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const f = v => _fmtEUR.format(isFinite(v) ? v : 0);
  const claro = theme === 'light';
  const card = claro ? 'bg-white/80 border-slate-200 shadow-sm' : 'bg-slate-800/50 border-slate-700/50';
  const inp = claro
    ? 'bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full'
    : 'bg-slate-700/50 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const line = claro ? 'border-slate-200' : 'border-slate-700/50';
  const contas = (G.contas || []).map(c => c.nome).filter(Boolean);

  const vazio = { desc: '', fornecedor: '', cat: 'espaco', total: '', pago: '', data: '', conta: '' };
  const [novo, setNovo] = useState(vazio);
  const [filtro, setFiltro] = useState(null); // categoria
  const [abertoId, setAbertoId] = useState(null);

  // ── Contas ──
  const orc = n(cs.orcamento);
  const totalCompromisso = desp.reduce((a, d) => a + n(d.total), 0);
  const totalPago = desp.reduce((a, d) => a + Math.min(n(d.pago), n(d.total) || n(d.pago)), 0);
  const faltaPagar = Math.max(0, totalCompromisso - totalPago);
  const livre = orc - totalCompromisso;
  let dias = null;
  if (cs.data) { const d = new Date(cs.data); const h = new Date(); h.setHours(0, 0, 0, 0); if (!isNaN(d)) dias = Math.round((d - h) / 86400000); }

  const porCat = CAS_CATS.map(([id, nome, cor]) => {
    const ds = desp.filter(d => (d.cat || 'outros') === id);
    return { id, nome, cor, total: ds.reduce((a, d) => a + n(d.total), 0), pago: ds.reduce((a, d) => a + n(d.pago), 0), n: ds.length };
  }).filter(c => c.n > 0).sort((a, b) => b.total - a.total);
  const porForn = {};
  desp.forEach(d => { const k = (d.fornecedor || '').trim() || '(sem fornecedor)'; porForn[k] = (porForn[k] || 0) + n(d.pago); });
  const fornecedores = Object.entries(porForn).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const porConta = {};
  desp.forEach(d => { if (n(d.pago) > 0) { const k = (d.conta || '').trim() || '(não indicado)'; porConta[k] = (porConta[k] || 0) + n(d.pago); } });
  const contasPag = Object.entries(porConta).sort((a, b) => b[1] - a[1]);

  const juntar = () => {
    if (!novo.desc.trim() && !novo.total && !novo.pago) return;
    const d = { id: Date.now() + Math.random(), desc: novo.desc.trim() || casCat(novo.cat)[1], fornecedor: novo.fornecedor.trim(), cat: novo.cat, total: n(novo.total || novo.pago), pago: n(novo.pago), data: novo.data || new Date().toISOString().slice(0, 10), conta: novo.conta.trim() };
    set({ despesas: [...desp, d] });
    setNovo({ ...vazio, cat: novo.cat, conta: novo.conta });
  };
  const mudar = (id, patch) => set({ despesas: desp.map(d => (d.id === id ? { ...d, ...patch } : d)) });
  const apagar = async d => { if (await confirmar(`Apagar "${d.desc}"?`)) set({ despesas: desp.filter(x => x.id !== d.id) }); };
  const lista = desp.filter(d => !filtro || (d.cat || 'outros') === filtro).slice().sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));


  return (
    <div className="space-y-4 max-w-5xl xl:max-w-none mx-auto pag-2col">
      {/* Resumo */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${card} col-toda`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold"><Ico e="💍"/>Casamento</h3>
          <div className="flex flex-wrap items-end gap-3">
            <CasCampo sub={sub} rot="Data do casamento"><input type="date" key={'d' + (cs.data || '')} defaultValue={cs.data || ''} onBlur={e => { if (e.target.value !== (cs.data || '')) set({ data: e.target.value }); }} className={`${inp} !w-40`} /></CasCampo>
            <CasCampo sub={sub} rot="Orçamento total"><div className="relative"><input type="number" inputMode="decimal" key={'o' + (cs.orcamento ?? '')} defaultValue={cs.orcamento ?? ''} placeholder="ex.: 25000" onBlur={e => { if (e.target.value !== String(cs.orcamento ?? '')) set({ orcamento: e.target.value === '' ? null : n(e.target.value) }); }} className={`${inp} !w-36 pr-6`} /><span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-xs ${sub}`}>€</span></div></CasCampo>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><p className={`text-xs ${sub}`}>Já pago</p><p className="text-xl font-bold text-emerald-400">{f(totalPago)}</p><p className={`text-xs ${sub}`}>{desp.filter(d => n(d.pago) > 0).length} pagamento{desp.filter(d => n(d.pago) > 0).length === 1 ? '' : 's'}</p></div>
          <div><p className={`text-xs ${sub}`}>Falta pagar</p><p className="text-xl font-bold text-amber-400">{f(faltaPagar)}</p><p className={`text-xs ${sub}`}>do que já está contratado</p></div>
          <div><p className={`text-xs ${sub}`}>Total contratado</p><p className="text-xl font-bold">{f(totalCompromisso)}</p><p className={`text-xs ${sub}`}>{orc > 0 ? `${Math.round(totalCompromisso / orc * 100)}% do orçamento` : 'põe o orçamento ao lado'}</p></div>
          <div><p className={`text-xs ${sub}`}>{orc > 0 ? (livre >= 0 ? 'Ainda livre no orçamento' : 'Acima do orçamento') : 'Faltam'}</p>
            {orc > 0 ? <p className={`text-xl font-bold ${livre >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{f(Math.abs(livre))}</p> : <p className="text-xl font-bold">{dias != null ? `${Math.max(0, dias)} dias` : '—'}</p>}
            <p className={`text-xs ${sub}`}>{orc > 0 && dias != null ? (dias >= 0 ? `faltam ${dias} dias` : 'já foi 🎉') : orc > 0 ? '' : 'põe a data ao lado'}</p></div>
        </div>
        {orc > 0 && (
          <div className="mt-4 space-y-1">
            <div className={`relative h-2.5 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700/60'}`}>
              <div className="absolute inset-y-0 left-0 bg-amber-400/60" style={{ width: `${Math.min(100, totalCompromisso / orc * 100)}%` }} />
              <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${Math.min(100, totalPago / orc * 100)}%` }} />
            </div>
            <p className={`text-[11px] ${sub}`}><span className="text-emerald-400">■</span> pago · <span className="text-amber-400">■</span> contratado, por pagar · resto: livre</p>
          </div>
        )}
      </div>

      {/* Esquerda: despesas */}
      <div className="space-y-4 min-w-0">
        <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
          <h3 className="text-lg font-semibold mb-1"><Ico e="🧾"/>Despesas</h3>
          <p className={`text-xs mb-3 ${sub}`}>Põe o valor total contratado e o que já pagaste (ex.: sinal). Assim vês sempre o que falta.</p>
          <div className={`rounded-xl border p-3 space-y-2 ${line}`}>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <input value={novo.desc} onChange={e => setNovo({ ...novo, desc: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') juntar(); }} placeholder="O quê (ex.: sinal da quinta)" className={`${inp} col-span-2 sm:col-span-3`} />
              <input value={novo.fornecedor} onChange={e => setNovo({ ...novo, fornecedor: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') juntar(); }} placeholder="Onde / fornecedor" list="cas-forn" className={`${inp} col-span-2 sm:col-span-3`} />
              <select value={novo.cat} onChange={e => setNovo({ ...novo, cat: e.target.value })} className={`${inp} col-span-2 sm:col-span-2`} aria-label="Categoria">{CAS_CATS.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>
              <input type="number" inputMode="decimal" value={novo.total} onChange={e => setNovo({ ...novo, total: e.target.value })} placeholder="Total €" className={inp} title="Valor total contratado" />
              <input type="number" inputMode="decimal" value={novo.pago} onChange={e => setNovo({ ...novo, pago: e.target.value })} placeholder="Pago €" className={inp} title="Quanto já pagaste" />
              <input type="date" value={novo.data} onChange={e => setNovo({ ...novo, data: e.target.value })} className={inp} aria-label="Data" />
              <input value={novo.conta} onChange={e => setNovo({ ...novo, conta: e.target.value })} placeholder="Pago de (conta)" list="cas-contas" className={inp} />
            </div>
            <div className="flex justify-end"><button type="button" onClick={juntar} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white">+ Juntar despesa</button></div>
            <datalist id="cas-forn">{[...new Set(desp.map(d => d.fornecedor).filter(Boolean))].map(x => <option key={x} value={x} />)}</datalist>
            <datalist id="cas-contas">{[...new Set([...contas, ...desp.map(d => d.conta).filter(Boolean)])].map(x => <option key={x} value={x} />)}</datalist>
          </div>
          {porCat.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              <button type="button" onClick={() => setFiltro(null)} className={`px-2.5 py-1 rounded-full text-xs border ${!filtro ? 'border-blue-500 bg-blue-500/15 text-blue-400' : line}`}>Todas</button>
              {porCat.map(c => <button key={c.id} type="button" onClick={() => setFiltro(filtro === c.id ? null : c.id)} className={`px-2.5 py-1 rounded-full text-xs border ${filtro === c.id ? 'border-blue-500 bg-blue-500/15 text-blue-400' : line}`}><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: c.cor }} />{c.nome}</button>)}
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {!lista.length && <p className={`text-sm text-center py-6 ${sub}`}>Ainda sem despesas. Junta a primeira acima.</p>}
            {lista.map(d => {
              const c = casCat(d.cat); const tot = n(d.total); const pg = n(d.pago); const falta = Math.max(0, tot - pg);
              const ab = abertoId === d.id;
              return (
                <div key={d.id} className={`rounded-xl ${claro ? 'bg-slate-50' : 'bg-slate-700/25'}`}>
                  <button type="button" onClick={() => setAbertoId(ab ? null : d.id)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
                    <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: c[2] }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{d.desc}</span>
                      <span className={`block text-xs truncate ${sub}`}>{[d.fornecedor, c[1], d.data ? new Date(d.data + 'T12:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '', d.conta ? `de ${d.conta}` : ''].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-semibold tabular-nums">{f(pg)}{tot > pg ? <span className={`font-normal ${sub}`}> / {f(tot)}</span> : ''}</span>
                      <span className={`block text-[11px] ${falta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{falta > 0 ? `falta ${f(falta)}` : '✓ pago'}</span>
                    </span>
                  </button>
                  {ab && (
                    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 pb-3 pt-2 border-t ${line}`}>
                      <CasCampo sub={sub} rot="O quê" className="col-span-2"><input key={'a' + d.desc} defaultValue={d.desc} onBlur={e => e.target.value.trim() && e.target.value !== d.desc && mudar(d.id, { desc: e.target.value.trim() })} className={inp} /></CasCampo>
                      <CasCampo sub={sub} rot="Onde / fornecedor" className="col-span-2"><input key={'b' + d.fornecedor} defaultValue={d.fornecedor || ''} list="cas-forn" onBlur={e => e.target.value !== (d.fornecedor || '') && mudar(d.id, { fornecedor: e.target.value.trim() })} className={inp} /></CasCampo>
                      <CasCampo sub={sub} rot="Categoria"><select value={d.cat || 'outros'} onChange={e => mudar(d.id, { cat: e.target.value })} className={inp}>{CAS_CATS.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></CasCampo>
                      <CasCampo sub={sub} rot="Total contratado"><input type="number" inputMode="decimal" key={'t' + d.total} defaultValue={d.total ?? ''} onBlur={e => n(e.target.value) !== tot && mudar(d.id, { total: n(e.target.value) })} className={inp} /></CasCampo>
                      <CasCampo sub={sub} rot="Já pago"><input type="number" inputMode="decimal" key={'p' + d.pago} defaultValue={d.pago ?? ''} onBlur={e => n(e.target.value) !== pg && mudar(d.id, { pago: n(e.target.value) })} className={inp} /></CasCampo>
                      <CasCampo sub={sub} rot="Data"><input type="date" key={'d' + d.data} defaultValue={d.data || ''} onBlur={e => e.target.value !== (d.data || '') && mudar(d.id, { data: e.target.value })} className={inp} /></CasCampo>
                      <CasCampo sub={sub} rot="Pago de (conta)" className="col-span-2"><input key={'c' + d.conta} defaultValue={d.conta || ''} list="cas-contas" onBlur={e => e.target.value !== (d.conta || '') && mudar(d.id, { conta: e.target.value.trim() })} className={inp} /></CasCampo>
                      <div className="col-span-2 flex items-end justify-end gap-2">
                        {falta > 0 && <button type="button" onClick={() => mudar(d.id, { pago: tot })} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">Marcar como pago</button>}
                        <button type="button" onClick={() => apagar(d)} className="px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10">Apagar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Direita: onde foi o dinheiro */}
      <div className="space-y-4 min-w-0">
        <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
          <h3 className="text-lg font-semibold mb-3"><Ico e="📊"/>Por categoria</h3>
          {!porCat.length ? <p className={`text-sm ${sub}`}>Aparece aqui quando juntares despesas.</p> : (
            <div className="space-y-2.5">
              {porCat.map(c => (
                <button key={c.id} type="button" onClick={() => setFiltro(filtro === c.id ? null : c.id)} className="w-full text-left space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.cor }} /><span className="truncate">{c.nome}</span></span>
                    <span className="tabular-nums shrink-0"><b>{f(c.pago)}</b>{c.total > c.pago ? <span className={sub}> / {f(c.total)}</span> : ''}</span>
                  </div>
                  <CasBarra claro={claro} pct={totalCompromisso ? c.total / totalCompromisso * 100 : 0} cor={c.cor} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
          <h3 className="text-lg font-semibold mb-3"><Ico e="📍"/>Onde foi o dinheiro</h3>
          {!fornecedores.length ? <p className={`text-sm ${sub}`}>Os fornecedores a quem já pagaste aparecem aqui.</p> : (
            <div className={`divide-y ${claro ? 'divide-slate-200' : 'divide-slate-700/50'}`}>
              {fornecedores.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="truncate">{k}</span><span className="tabular-nums font-medium">{f(v)}</span></div>)}
            </div>
          )}
          {contasPag.length > 0 && (
            <>
              <p className={`text-xs font-semibold uppercase tracking-wide mt-4 mb-1 ${sub}`}>Pago de que conta</p>
              <div className={`divide-y ${claro ? 'divide-slate-200' : 'divide-slate-700/50'}`}>
                {contasPag.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="truncate">{k}</span><span className="tabular-nums font-medium">{f(v)}</span></div>)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export {
  VendaCasa, CAS_CATS, CasCampo, CasBarra, casCat, Casamento
};
export const FICHEIRO_APP = 'vendaCasa';
