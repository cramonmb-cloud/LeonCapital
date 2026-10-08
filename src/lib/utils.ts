import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parsea una fecha en formato string, Date o Timestamp garantizando que no se desfase por zona horaria.
 */
export function parseLocalDate(dateInput: any): Date {
  if (!dateInput) return getMexicoNow();
  
  let d: Date;
  if (typeof dateInput?.toDate === 'function') {
    d = dateInput.toDate();
  } else if (dateInput?.seconds !== undefined && typeof dateInput.seconds === 'number') {
    d = new Date(dateInput.seconds * 1000);
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(year, month, day, 12, 0, 0, 0);
    }
    d = new Date(dateInput);
  } else {
    d = new Date(dateInput);
  }

  if (!isNaN(d.getTime())) {
    const iso = d.toISOString();
    // Si fue guardada como medianoche UTC (ej. 2026-07-04T00:00:00.000Z en Timestamps de Firestore)
    // los primeros 10 caracteres representan la fecha original sin sesgo horario
    if (iso.endsWith('T00:00:00.000Z') || iso.endsWith('T00:00:00Z')) {
      const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, day, 12, 0, 0, 0);
    }

    const mexicoString = d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const [year, month, day] = mexicoString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  return new Date();
}

/**
 * Calcula el sábado correspondiente a la semana operativa de una fecha dada,
 * forzando el cálculo al horario de la Ciudad de México.
 * La semana cambia a las 00:00 del sábado (hora CDMX).
 */
export function getSaturdayOfWeek(dateInput: any = new Date()): Date {
  const parsed = parseLocalDate(dateInput);
  // 1. Obtener la fecha en formato YYYY-MM-DD en la zona horaria de México
  const mexicoString = parsed.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const [year, month, day] = mexicoString.split('-').map(Number);
  
  // 2. Crear fecha a mediodía para cálculo seguro de día de semana
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  
  // 3. Lógica: Sábado es el día 0 de la nueva semana operativa
  // Sun(0) -> -1, Mon(1) -> -2, ..., Fri(5) -> -6, Sat(6) -> -0
  const dayOfWeek = d.getDay(); 
  const diff = (dayOfWeek + 1) % 7;
  
  const saturday = new Date(year, month - 1, day - diff, 0, 0, 0, 0);
  return saturday;
}

/**
 * Calcula el número de semana operativa de abono de un préstamo (1-indexado).
 * Relativo a la fecha de referencia (por defecto hora CDMX actual).
 * Cambia exactamente a las 00:00:00 del sábado (hora CDMX).
 * La Semana 1 (S1) corresponde al primer sábado de abono (+7 días del sábado de registro).
 */
export function getCurrentLoanWeekNumber(startDateInput: any, referenceDate: Date = getMexicoNow()): number {
  const startSat = getSaturdayOfWeek(startDateInput);
  const currentSat = getSaturdayOfWeek(referenceDate);
  const diffMs = currentSat.getTime() - startSat.getTime();
  const diffWeeks = Math.round(diffMs / (1000 * 3600 * 24 * 7));
  return Math.max(0, diffWeeks);
}

/**
 * Obtiene la fecha actual normalizada al horario de la Ciudad de México
 * para cálculos consistentes en el servidor y cliente.
 */
export function getMexicoNow(): Date {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(new Date());
  
  const map: any = {};
  parts.forEach(p => map[p.type] = p.value);
  
  return new Date(
    parseInt(map.year),
    parseInt(map.month) - 1,
    parseInt(map.day),
    parseInt(map.hour),
    parseInt(map.minute),
    parseInt(map.second)
  );
}

export function generateColorPalette(numColors: number): string[] {
  const colors = [
    '#3b82f6', // blue-500
    '#22c55e', // green-500
    '#f97316', // orange-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#6366f1', // indigo-500
  ];

  if (numColors <= colors.length) {
    return colors.slice(0, numColors);
  }

  const extendedPalette: string[] = [...colors];
  for (let i = colors.length; i < numColors; i++) {
    const hash = (i.toString()).split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const h = (hash & 0xFF0000) >> 16;
    const s = (hash & 0x00FF00) >> 8;
    const l = (hash & 0x0000FF);
    extendedPalette.push(`#${('00' + h.toString(16)).slice(-2)}${('00' + s.toString(16)).slice(-2)}${('00' + l.toString(16)).slice(-2)}`);
  }

  return extendedPalette;
}

export interface ParsedEndorsement {
  name: string;
  street: string;
  neighborhood: string;
  postalCode: string;
  city: string;
  phone: string;
  guarantees: string;
}

/**
 * Parsea de forma robusta la cadena compuesta de un aval:
 * "NOMBRE (CALLE, COLONIA, CP, CIUDAD, Tel: TELEFONO, Garantía: GARANTIAS)"
 * asegurando soporte ante saltos de línea (\n), diferentes órdenes o ausencia de espacios.
 */
export function parseEndorsement(endorsementStr: string): ParsedEndorsement {
  if (!endorsementStr) {
    return { name: '', street: '', neighborhood: '', postalCode: '', city: '', phone: '', guarantees: '' };
  }

  const trimmed = endorsementStr.trim();
  const parenIndex = trimmed.indexOf('(');

  if (parenIndex === -1) {
    return {
      name: trimmed.toUpperCase(),
      street: '',
      neighborhood: '',
      postalCode: '',
      city: '',
      phone: '',
      guarantees: ''
    };
  }

  const name = trimmed.substring(0, parenIndex).trim().toUpperCase();

  // Contenido dentro del paréntesis
  let inside = trimmed.substring(parenIndex + 1).trim();
  if (inside.endsWith(')')) {
    inside = inside.substring(0, inside.length - 1).trim();
  }

  // Extraer teléfono (Tel: ...)
  let phone = '';
  const phoneMatch = inside.match(/Tel(?:[eé]fono)?:\s*([^,]+)/i);
  if (phoneMatch) {
    phone = phoneMatch[1].trim().toUpperCase();
    inside = inside.replace(phoneMatch[0], '');
  }

  // Extraer garantías (Garantía: ...)
  let guarantees = '';
  const guaranteeMatch = inside.match(/Garant[ií]a:\s*([\s\S]+)$/i);
  if (guaranteeMatch) {
    guarantees = guaranteeMatch[1].trim().toUpperCase();
    inside = inside.replace(guaranteeMatch[0], '');
  }

  // Dar formato con saltos de línea a garantías si vienen continuas (ej. 1.- ALGO2.- OTRO)
  if (guarantees) {
    guarantees = guarantees.replace(/(\d+\.-)/g, '\n$1').trim();
  }

  // Limpiar y separar partes de la dirección
  const addressParts = inside
    .split(',')
    .map(p => p.trim().toUpperCase())
    .filter(p => p !== '' && !p.startsWith('TEL') && !p.startsWith('GARANT'));

  let street = addressParts[0] || '';
  let neighborhood = addressParts[1] || '';
  let postalCode = addressParts[2] || '';
  let city = addressParts[3] || '';

  // Si el código postal no son números (4 o 5 dígitos) y no hay ciudad asignada
  if (postalCode && !/^\d{4,5}$/.test(postalCode) && !city) {
    city = postalCode;
    postalCode = '';
  }

  if (addressParts.length > 4 && !city) {
    city = addressParts.slice(3).join(', ');
  }

  return { name, street, neighborhood, postalCode, city, phone, guarantees };
}

/**
 * Obtiene el número mínimo de fallos requeridos para activar la semana extra de penalización.
 * Si no está configurado o es menor a 1, el valor predeterminado es 2.
 */
export function getExtraWeekThreshold(config?: { extraWeekMissedThreshold?: number } | null): number {
  if (config && typeof config.extraWeekMissedThreshold === 'number' && config.extraWeekMissedThreshold >= 1) {
    return Math.floor(config.extraWeekMissedThreshold);
  }
  return 2;
}

/**
 * Determina si una semana específica contó como fallo u omisión en el historial del préstamo:
 * 1. Tuvo pago pero fue parcial (< weeklyPayment).
 * 2. Tuvo pago pero fue registrado como Recuperado (isRecovered o paymentType === 'recovered').
 *    Incluso si el cliente regularizó el abono después, la falta queda asentada para efectos
 *    de la regla de penalización de semana extra.
 * 3. No tiene pago registrado y la semana ya transcurrió (i < currentLoanWeek).
 */
export function isWeekMissedOrRecovered(
  payment: { amount?: number; isReverted?: boolean; isRecovered?: boolean; paymentType?: string } | undefined | null,
  weekNumber: number,
  currentLoanWeek: number,
  weeklyPayment: number
): boolean {
  if (payment && !payment.isReverted) {
    const pAmount = (payment.amount === null || payment.amount === undefined || isNaN(payment.amount)) ? 0 : payment.amount;
    if (pAmount < weeklyPayment || payment.isRecovered || payment.paymentType === 'recovered') {
      return true;
    }
    return false;
  }
  return weekNumber < currentLoanWeek;
}

/**
 * Determina si a un préstamo le aplica la semana extra de penalización (+1 semana).
 * Una vez alcanzado el umbral de fallos (omisiones, parciales o recuperados), la semana extra
 * se activa de manera definitiva e irrevocable.
 */
export function doesLoanHavePenalty(
  loan: { startDate: any; payments?: any[]; hasPenalty?: boolean; amount?: number },
  baseTerm: number,
  weeklyPayment: number,
  threshold: number = 2,
  referenceDate: Date = getMexicoNow()
): boolean {
  if (loan.hasPenalty) return true;

  const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate, referenceDate));
  const isExpired = currentLoanWeek > baseTerm;

  const payments = loan.payments || [];
  let missedCount = 0;
  let totalPaidInBaseTerm = 0;

  for (let i = 1; i <= baseTerm; i++) {
    const p = payments.find(pay => pay.weekNumber === i);
    if (p && !p.isReverted) {
      const pAmount = (p.amount === null || p.amount === undefined || isNaN(p.amount)) ? 0 : p.amount;
      totalPaidInBaseTerm += pAmount;
      if (pAmount < weeklyPayment || p.isRecovered || p.paymentType === 'recovered') {
        missedCount++;
      }
    } else if (i < currentLoanWeek) {
      missedCount++;
    }
  }

  return (missedCount >= threshold) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
}

export interface LoanWeeklyDebeBreakdown {
  expectedQuota: number;
  abonoSaliente: number;
  netDebe: number;
  isActive: boolean;
  targetWeekNumber: number;
}

/**
 * Calcula el desglose de cuota semanal, abonos salientes y debe neto de un préstamo para una semana dada.
 * Un Abono Saliente es aquel pago que corresponde a la semana evaluada pero que fue registrado
 * previamente como un adelanto (Adelanto Entrante en una semana anterior).
 * Si el préstamo tiene penalización de semana extra, su plazo efectivo se extiende a baseTerm + 1.
 */
export function getLoanAbonoSalienteForWeek(
  loan: { startDate: any; amount: number; loanPlanId: string; payments?: any[]; hasPenalty?: boolean; status?: string },
  loanPlan: { termInWeeks: number; weeklyPaymentRate: number } | undefined,
  targetWeekSaturdayDate: Date | string,
  config?: { extraWeekMissedThreshold?: number } | null
): LoanWeeklyDebeBreakdown {
  if (!loanPlan || loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') {
    return { expectedQuota: 0, abonoSaliente: 0, netDebe: 0, isActive: false, targetWeekNumber: 0 };
  }

  const targetDate = typeof targetWeekSaturdayDate === 'string'
    ? parseLocalDate(targetWeekSaturdayDate)
    : targetWeekSaturdayDate;
  const targetSaturdayTime = getSaturdayOfWeek(targetDate).getTime();

  const loanStartSat = getSaturdayOfWeek(parseLocalDate(loan.startDate));
  const loanStartSatTime = loanStartSat.getTime();

  // Si la semana consultada es previa al inicio del préstamo
  if (targetSaturdayTime < loanStartSatTime) {
    return { expectedQuota: 0, abonoSaliente: 0, netDebe: 0, isActive: false, targetWeekNumber: 0 };
  }

  const baseTerm = loanPlan.termInWeeks;
  const targetWeekNumber = Math.round((targetSaturdayTime - loanStartSatTime) / (7 * 24 * 3600 * 1000));

  // El Debe Entregar regular solo contempla préstamos activos en sus semanas del plazo base (1 a baseTerm).
  // Si targetWeekNumber > baseTerm, ya concluyó su plazo base (o está en semana extra o en Cartera Vencida).
  if (targetWeekNumber < 1 || targetWeekNumber > baseTerm) {
    return { expectedQuota: 0, abonoSaliente: 0, netDebe: 0, isActive: false, targetWeekNumber: 0 };
  }

  const weeklyQuota = Math.round((loan.amount / 1000) * (loanPlan.weeklyPaymentRate || 0));

  // Buscar pagos registrados para este número de semana que hayan ingresado como adelantos previamente
  let abonoSaliente = 0;
  (loan.payments || []).forEach(p => {
    if (p.isReverted) return;

    let matchesWeek = false;
    if (p.weekNumber && p.weekNumber > 0) {
      matchesWeek = p.weekNumber === targetWeekNumber;
    } else if (p.date) {
      matchesWeek = getSaturdayOfWeek(parseLocalDate(p.date)).getTime() === targetSaturdayTime;
    }

    if (!matchesWeek) return;

    const regTime = p.registeredWeekDate
      ? getSaturdayOfWeek(parseLocalDate(p.registeredWeekDate)).getTime()
      : (p.date ? getSaturdayOfWeek(parseLocalDate(p.date)).getTime() : targetSaturdayTime);

    // Es adelanto si tiene flag de adelanto o si su fecha de registro es estrictamente anterior a la semana actual
    const isAdvance = p.isAdvance || p.paymentType === 'adelanto_entrante' || (regTime < targetSaturdayTime);

    if (isAdvance) {
      abonoSaliente += p.amount;
    }
  });

  const netDebe = Math.max(0, weeklyQuota - abonoSaliente);

  return {
    expectedQuota: weeklyQuota,
    abonoSaliente,
    netDebe,
    isActive: true,
    targetWeekNumber
  };
}

/**
 * Calcula el monto acumulado de abonos a la semana extra que YA SE HAN COBRADO/INGRESADO
 * para un préstamo en la semana consultada.
 * REGLA ESTRICTA:
 * 1. Solo aplica para préstamos que SIGAN ACTIVOS (que aún no vencen y no estén en Cartera Vencida).
 *    Cuando un préstamo supera su plazo total o se marca como Overdue/Paid Off, pasa a Cartera Vencida / Liquidado
 *    y sale de las hojas de semana (Préstamos de la Semana).
 * 2. La semana extra de cobranza solo ocurre en la semana de penalización (weekNumber === baseTerm + 1).
 *    En semanas previas (1..baseTerm) o posteriores (> baseTerm + 1), retorna 0.
 * 3. Solo contabiliza los pagos que YA SE HAN INGRESADO en la columna de semana extra (weekNumber >= baseTerm + 1).
 * 4. NO contabiliza semanas extras pendientes o esperadas sin pago registrado.
 */
export function getLoanSemanaExtraPaidAmountForWeek(
  loan: { startDate: any; amount?: number; loanPlanId: string; payments?: any[]; hasPenalty?: boolean; status?: string },
  loanPlan: { termInWeeks: number; weeklyPaymentRate?: number } | undefined,
  targetWeekSaturdayDate: Date | string,
  config?: { extraWeekMissedThreshold?: number } | null
): number {
  if (!loanPlan || !loan.startDate || !loan.payments || loan.payments.length === 0) return 0;
  if (loan.status === 'Overdue' || loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') return 0;

  const targetDate = typeof targetWeekSaturdayDate === 'string'
    ? parseLocalDate(targetWeekSaturdayDate)
    : targetWeekSaturdayDate;
  const targetSaturdayTime = getSaturdayOfWeek(targetDate).getTime();

  const loanStartSat = getSaturdayOfWeek(parseLocalDate(loan.startDate));
  const loanStartSatTime = loanStartSat.getTime();

  if (targetSaturdayTime < loanStartSatTime) return 0;

  const baseTerm = loanPlan.termInWeeks;
  const weeklyQuota = Math.round(((loan.amount || 0) / 1000) * (loanPlan.weeklyPaymentRate || 0));
  const threshold = getExtraWeekThreshold(config);
  const hasPenalty = doesLoanHavePenalty(loan, baseTerm, weeklyQuota, threshold, targetDate);
  const totalTerm = baseTerm + (hasPenalty ? 1 : 0);
  const extraWeekNumber = baseTerm + 1;

  // Si no tiene penalización, no tiene semana extra
  if (!hasPenalty) {
    return 0;
  }

  const targetWeekNumber = Math.round((targetSaturdayTime - loanStartSatTime) / (7 * 24 * 3600 * 1000));

  // La semana extra de cobranza solo se evalúa en su semana activa (targetWeekNumber === extraWeekNumber).
  // Si targetWeekNumber < extraWeekNumber: el préstamo está en semanas regulares (1 a baseTerm).
  // Si targetWeekNumber > extraWeekNumber (o > totalTerm): ya venció, se fue a Cartera Vencida y sale de las hojas de la semana.
  if (targetWeekNumber !== extraWeekNumber || targetWeekNumber > totalTerm) {
    return 0;
  }

  // Verificar que el préstamo no esté vencido actualmente en el sistema (según la fecha de hoy)
  const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate, getMexicoNow());
  if (currentLoanWeek > totalTerm) {
    return 0;
  }

  const extraWeekSaturdayTime = loanStartSatTime + (extraWeekNumber * 7 * 24 * 3600 * 1000);

  let paidAmount = 0;

  loan.payments.forEach(p => {
    if (p.isReverted) return;

    // Solo pagos de semana extra (weekNumber >= extraWeekNumber)
    const isExtraWeekPayment = typeof p.weekNumber === 'number' && p.weekNumber >= extraWeekNumber;
    if (!isExtraWeekPayment) return;

    const pAmount = typeof p.amount === 'number' ? p.amount : 0;
    if (pAmount <= 0) return;

    let matchesWeek = false;

    if (p.registeredWeekDate) {
      matchesWeek = getSaturdayOfWeek(parseLocalDate(p.registeredWeekDate)).getTime() === targetSaturdayTime;
    } else if (p.date) {
      matchesWeek = getSaturdayOfWeek(parseLocalDate(p.date)).getTime() === targetSaturdayTime;
    }

    if (!matchesWeek && extraWeekSaturdayTime === targetSaturdayTime) {
      matchesWeek = true;
    }

    if (matchesWeek) {
      paidAmount += pAmount;
    }
  });

  return paidAmount;
}

/**
 * Determina si un préstamo tuvo abonos cobrados de semana extra en la semana consultada.
 */
export function isLoanInSemanaExtraForWeek(
  loan: { startDate: any; amount: number; loanPlanId: string; payments?: any[]; hasPenalty?: boolean; status?: string },
  loanPlan: { termInWeeks: number; weeklyPaymentRate: number } | undefined,
  targetWeekSaturdayDate: Date | string,
  config?: { extraWeekMissedThreshold?: number } | null
): boolean {
  return getLoanSemanaExtraPaidAmountForWeek(loan, loanPlan, targetWeekSaturdayDate, config) > 0;
}

/**
 * Calcula la sumatoria de cuota base, abonos salientes, debe neto y monto de semana extra cobrada
 * para todos los préstamos de una promotora en una semana operativa determinada.
 */
export function calculatePromotoraWeeklyDebeAndAbonosSalientes(
  promotoraId: string,
  targetWeekSaturdayDate: Date | string,
  loans: Array<{ promotoraId?: string; startDate: any; amount: number; loanPlanId: string; payments?: any[]; hasPenalty?: boolean; status?: string }>,
  loanPlans: Array<{ id: string; termInWeeks: number; weeklyPaymentRate: number }>,
  config?: { extraWeekMissedThreshold?: number } | null
): { totalExpectedQuota: number; totalAbonosSalientes: number; totalDebeEntregar: number; totalSemExt: number } {
  const pLoans = loans.filter(l => l.promotoraId === promotoraId);
  let totalExpectedQuota = 0;
  let totalAbonosSalientes = 0;
  let totalDebeEntregar = 0;
  let totalSemExt = 0;

  pLoans.forEach(loan => {
    if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') return;

    const plan = loanPlans.find(lp => lp.id === loan.loanPlanId);
    const breakdown = getLoanAbonoSalienteForWeek(loan, plan, targetWeekSaturdayDate);
    if (breakdown.isActive) {
      totalExpectedQuota += breakdown.expectedQuota;
      totalAbonosSalientes += breakdown.abonoSaliente;
      totalDebeEntregar += breakdown.netDebe;
    }
    const extraPaid = getLoanSemanaExtraPaidAmountForWeek(loan, plan, targetWeekSaturdayDate, config);
    totalSemExt += extraPaid;
  });

  return {
    totalExpectedQuota,
    totalAbonosSalientes,
    totalDebeEntregar,
    totalSemExt
  };
}
