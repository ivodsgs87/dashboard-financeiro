# Analise Detalhada - OrcamentoApp.jsx

13.266 linhas | 135 useState | 39 useCallback | 21 componentes

## BUGS ACTIVOS

### 1. Sistema de Credito Dual (G.credito vs G.creditos)
Impacto Alto - 26 referencias desatualizadas

O tab Credito grava em G.creditos[] (multi-credito), mas muitos modulos leem de G.credito (legado). Afeta:
- Historico (L4841-4960): grafico amortizacao, juros, equity
- Portfolio (L5481-5483): simulador FIRE usa credito.dividaAtual || 229693 (hardcoded!)
- Performance (L2995): fallback G.credito.dividaAtual no grafico patrimonio
- Relatorio/Export (L6302, L10956-10959, L12411): dados do credito antigo
Fix: Criar creditoAtual derivado (useMemo) de G.creditos[0] com fallback G.credito.

### 2. Escaloes IRS Triplicados
3 copias identicas (L1666, L1898, L11243). Risco de divergencia.
Fix: Constante ESCALOES_IRS_2026 no topo.

### 3. Projecao IRS Edge Cases
- 0 meses dados = retorna 0 (deveria usar ano anterior)
- 1 mes dados = projecao volatil (minimo 2-3 meses)

## CONSISTENCIA

### 4. Undo Incompleto
59 saveUndo para 105 uG (56% cobertura). Alertas, extrato, calendario sem undo.

### 5. Tema Light - 21 Elementos Dark Hardcoded
bg-slate-800 sem theme check em modais, dropdowns, tooltips.

### 6. Transferencias Incompletas
Verificar: Relatorio Anual, Export Excel/PDF, graficos Performance.

## FUNCIONALIDADES

### 7. Export Extrato (AUSENTE)
Sem PDF nem Excel. Adicionar com filtros aplicados.

### 8. Resumo Anual Extrato
Evolucao mensal, top 5 categorias, media mensal, comparacao anual.

### 9. Orcamentos - Alertas Automaticos
Alerta a 80%, notificacao quando ultrapassado.

### 10. Investimentos - Cotacao Actual
Campo ticker, API gratuita, variacao diaria.

### 11. Tarefas Semanais Inteligentes
Auto-dismiss >1 mes, agrupar atrasadas, limite semanas.

### 12. Dashboard - Widget Cash Flow
Entradas vs saidas, projecao fim mes, saldo disponivel.

## PERFORMANCE

### 13. Componentes Gigantes
renderExtrato ~2560L, Agenda ~2270L, ShortcutsModal ~1128L, BackupModal ~1011L,
Portfolio ~966L, Calendario ~938L, Credito ~924L, Performance ~919L

### 14. Re-renders
135 useState no pai - qualquer alteracao re-renderiza TODOS os tabs.

### 15. Constantes Inline
Escaloes IRS 3x, deducoes 4587.09, categorias default.

## UX

### 16. Validacao: parseFloat sem NaN, negativos aceites
### 17. Feedback: alert() nativo em vez de showToast (L9241, L9250)
### 18. Mobile: header apertado, tabelas sem scroll, modais overflow
### 19. Acessibilidade: botoes sem title, sem keyboard nav

## PRIORIZACAO

Semana 1: Unificar credito, escaloes constante, transferencias exports
Semana 2: Export extrato, agrupar tarefas semanais, alert->showToast
Semana 3: Resumo anual extrato, alertas orcamento, saveUndo coverage
Longo prazo: Separar componentes, cotacoes, widget cash flow
