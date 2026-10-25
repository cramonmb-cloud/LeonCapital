import type { Loan, LoanPlan, AppConfig, PromotoraSettlement, PrecapturaRow } from '@/lib/types';
import { getSaturdayOfWeek, parseLocalDate, getLoanAbonoSalienteForWeek, getLoanSemanaExtraPaidAmountForWeek } from '@/lib/utils';

/**
 * Returns previous Saturday date string (YYYY-MM-DD)
 */
export function getPreviousSaturdayStr(weekDateStr: string): string {
  const d = parseLocalDate(weekDateStr);
  const prevSat = new Date(d);
  prevSat.setDate(prevSat.getDate() - 7);
  return getSaturdayOfWeek(prevSat).toISOString().split('T')[0];
}

export interface ComputeMetricsParams {
  promotoraId: string;
  promotoraName: string;
  targetWeekStr: string;
  loans: Loan[];
  loanPlans: LoanPlan[];
  config?: AppConfig | null;
  prevSettlement?: PromotoraSettlement | null;
  precapturaRow?: Partial<PrecapturaRow> | null;
  savedSettlement?: PromotoraSettlement | null;
}

/**
 * Computes exact weekly settlement metrics for a promotora, taking into account
 * any precaptura overrides or saved adjustments, and previous week's debt.
 */
export function computePromotoraWeekMetrics({
  promotoraId,
  targetWeekStr,
  loans,
  loanPlans,
  config,
  prevSettlement,
  precapturaRow,
  savedSettlement,
}: ComputeMetricsParams): PromotoraSettlement {
  const targetDate = parseLocalDate(targetWeekStr);
  const weekTime = getSaturdayOfWeek(targetDate).getTime();

  const pLoans = loans.filter(l => 
    l.promotoraId === promotoraId && 
    parseLocalDate(l.startDate) >= new Date('2026-03-01T00:00:00')
  );

  let realDebeEntregar = 0;
  let realAdelSal = 0;
  let realFalla = 0;
  let realEfectivo = 0;
  let realRecuperado = 0;
  let realAdelEnt = 0;

  pLoans.forEach(loan => {
    const plan = loanPlans.find(lp => lp.id === loan.loanPlanId);
    if (!plan) return;

    const breakdown = getLoanAbonoSalienteForWeek(loan, plan, targetDate, config);
    const loanSaturday = getSaturdayOfWeek(parseLocalDate(loan.startDate));
    const loanSaturdayTime = loanSaturday.getTime();
    const targetWeekNumber = breakdown.targetWeekNumber;

    const expectedForLoan = breakdown.isActive ? breakdown.netDebe : 0;
    realDebeEntregar += expectedForLoan;
    if (breakdown.isActive) {
      realAdelSal += breakdown.abonoSaliente;
    }

    const paymentsInWeek = (loan.payments || []).filter(p => {
      if (p.isReverted) return false;

      const pCollectionDate = p.date ? parseLocalDate(p.date) : (p.registeredWeekDate ? parseLocalDate(p.registeredWeekDate) : null);
      const regTime = pCollectionDate ? getSaturdayOfWeek(pCollectionDate).getTime() : 0;

      if (p.isAdvance || p.paymentType === 'adelanto_entrante' || (regTime < weekTime && (p.weekNumber && p.weekNumber === targetWeekNumber))) {
        return false;
      }

      if (p.weekNumber && p.weekNumber > 0) {
        return p.weekNumber === targetWeekNumber;
      }
      const paymentDate = parseLocalDate(p.date);
      const paymentSaturday = getSaturdayOfWeek(paymentDate);
      return paymentSaturday.getTime() === weekTime;
    });

    // Regla de Negocio CrediControl:
    // Solo se registra Falla si se capturó MANUALMENTE un abono parcial o en $0.
    // Si el pago quedó como "asumido" (paymentType === 'assumed') o no hay captura manual de fallo,
    // se toma como pagado al 100% en efectivo ($0 de falla).
    let loanFalla = 0;
    let loanEfectivo = 0;
    let loanRecuperado = 0;

    if (expectedForLoan > 0) {
      const hasManualPayment = paymentsInWeek.length > 0 && paymentsInWeek.some(p => p.paymentType !== 'assumed');

      if (hasManualPayment) {
        const manualPayments = paymentsInWeek.filter(p => p.paymentType !== 'assumed');
        const manualPaid = manualPayments.reduce((sum, p) => sum + p.amount, 0);

        if (manualPaid < expectedForLoan) {
          loanFalla = expectedForLoan - manualPaid;
          loanEfectivo = manualPaid;
          loanRecuperado = 0;
        } else {
          loanFalla = 0;
          loanEfectivo = expectedForLoan;
          loanRecuperado = manualPaid - expectedForLoan;
        }
      } else {
        // Pago asumido o semana en curso sin captura manual de fallo: no es falla
        loanFalla = 0;
        loanEfectivo = expectedForLoan;
        loanRecuperado = 0;
      }
    }

    realFalla += loanFalla;
    realEfectivo += loanEfectivo;
    realRecuperado += loanRecuperado;

    // Adelantos entrantes
    const advPayments = (loan.payments || []).filter(p => !p.isReverted && (p.isAdvance || p.paymentType === 'adelanto_entrante'));
    if (loanSaturdayTime === weekTime) {
      if (advPayments.length > 0) {
        if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') {
          const totalPaid = (loan.payments || []).filter(p => !p.isReverted).reduce((sum, p) => sum + p.amount, 0);
          realAdelEnt += totalPaid;
        } else {
          realAdelEnt += advPayments.reduce((sum, p) => sum + p.amount, 0);
        }
      }
    } else {
      (loan.payments || []).forEach(p => {
        if (p.isReverted) return;

        const pCollectionDate = p.date ? parseLocalDate(p.date) : (p.registeredWeekDate ? parseLocalDate(p.registeredWeekDate) : null);
        const pSatTime = pCollectionDate ? getSaturdayOfWeek(pCollectionDate).getTime() : 0;
        if (pSatTime !== weekTime) return;

        const isFutureWeek = (p.weekNumber && targetWeekNumber > 0) ? (p.weekNumber > targetWeekNumber) : Boolean(p.isAdvance || p.paymentType === 'adelanto_entrante');

        if (isFutureWeek && (p.isAdvance || p.paymentType === 'adelanto_entrante' || (p.weekNumber && p.weekNumber > targetWeekNumber))) {
          realAdelEnt += p.amount;
        }
      });
    }
  });

  // Extra week calculation
  let realSemExt = 0;
  pLoans.forEach(loan => {
    if (loan.status !== 'Overdue' && loan.status !== 'Paid Off' && loan.status !== 'Pagado desde CV') {
      const plan = loanPlans.find(lp => lp.id === loan.loanPlanId);
      realSemExt += getLoanSemanaExtraPaidAmountForWeek(loan, plan, targetWeekStr, config);
    }
  });

  // Ventas de la semana
  const realVenta = pLoans
    .filter(l => getSaturdayOfWeek(parseLocalDate(l.startDate)).getTime() === weekTime)
    .reduce((sum, l) => sum + l.amount, 0);

  const prevDebt = prevSettlement ? (Number(prevSettlement.deuda) || 0) : 0;
  const abonoSemanal = realDebeEntregar;

  let debeEntregar = prevDebt + abonoSemanal;
  let falla = realFalla;
  let recuperado = realRecuperado;
  let adelEnt = realAdelEnt;
  let adelSal = realAdelSal;
  let semExt = realSemExt;
  let venta = realVenta;
  let comicionPercent = 8;
  let supervisionPercent = 0;
  let comicion = Math.round(venta * 0.08);
  let supervision = 0;
  let efectivo = Math.max(0, debeEntregar - falla);
  let total = efectivo + recuperado;
  let diferencia = efectivo - debeEntregar;
  let deuda = Math.max(0, debeEntregar - efectivo);

  // Apply precaptura row overrides if present
  if (precapturaRow) {
    if (precapturaRow.debeEntregar !== undefined) debeEntregar = Number(precapturaRow.debeEntregar);
    if (precapturaRow.falla !== undefined) falla = Number(precapturaRow.falla);
    if (precapturaRow.recuperado !== undefined) recuperado = Number(precapturaRow.recuperado);
    if (precapturaRow.venta !== undefined) venta = Number(precapturaRow.venta);
    if (precapturaRow.comicionPercent !== undefined) comicionPercent = Number(precapturaRow.comicionPercent);
    if (precapturaRow.supervisionPercent !== undefined) supervisionPercent = Number(precapturaRow.supervisionPercent);
    if (precapturaRow.comision !== undefined) comicion = Number(precapturaRow.comision);
    else comicion = Math.round(venta * (comicionPercent / 100));
    if (precapturaRow.supervision !== undefined) supervision = Number(precapturaRow.supervision);
    else supervision = Math.round(venta * (supervisionPercent / 100));
    if (precapturaRow.adelantosEntrantes !== undefined) adelEnt = Number(precapturaRow.adelantosEntrantes);
    if (precapturaRow.adelantosSalientes !== undefined) adelSal = Number(precapturaRow.adelantosSalientes);
    if (precapturaRow.semanaExtra !== undefined) semExt = Number(precapturaRow.semanaExtra);

    efectivo = debeEntregar - falla;
    total = precapturaRow.totalEntregar !== undefined ? Number(precapturaRow.totalEntregar) : (efectivo + recuperado);
    diferencia = precapturaRow.diferencia !== undefined ? Number(precapturaRow.diferencia) : (efectivo - debeEntregar);
    deuda = Math.max(0, debeEntregar - efectivo);
  } else if (savedSettlement) {
    if (savedSettlement.venta !== undefined && savedSettlement.venta > 0) venta = Number(savedSettlement.venta);
    if (savedSettlement.comicionPercent !== undefined) comicionPercent = Number(savedSettlement.comicionPercent);
    if (savedSettlement.supervisionPercent !== undefined) supervisionPercent = Number(savedSettlement.supervisionPercent);
    if (savedSettlement.comicion !== undefined) comicion = Number(savedSettlement.comicion);
    else comicion = Math.round(venta * (comicionPercent / 100));
    if (savedSettlement.supervision !== undefined) supervision = Number(savedSettlement.supervision);
    else supervision = Math.round(venta * (supervisionPercent / 100));
    if (savedSettlement.adelEnt !== undefined) adelEnt = Number(savedSettlement.adelEnt);
    if (savedSettlement.adelSal !== undefined) adelSal = Number(savedSettlement.adelSal);
    if (savedSettlement.semExt !== undefined) semExt = Number(savedSettlement.semExt);
  }

  return {
    id: `${promotoraId}_${targetWeekStr}`,
    promotoraId,
    weekDate: targetWeekStr,
    debeEntregar,
    falla,
    efectivo,
    recuperado,
    total,
    diferencia,
    deuda,
    venta,
    comicion,
    comicionPercent,
    supervision,
    supervisionPercent,
    abonoSemanal,
    adelEnt,
    adelSal,
    semExt,
  };
}
