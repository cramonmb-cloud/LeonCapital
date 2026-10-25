'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { collection, query, where, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn, getSaturdayOfWeek, getMexicoNow, parseLocalDate, getLoanAbonoSalienteForWeek } from '@/lib/utils';
import type { Client, LoanPlan, Loan, Plaza, Localidad, Promotora, AppConfig, Precaptura, PrecapturaRow, PrecapturaGasto, Personal } from '@/lib/types';
import { savePrecapturaAction, getGastoConceptsAction, saveGastoConceptAction } from '@/app/inicio/precaptura/actions';
import { useAuth } from '@/hooks/use-auth';
import { 
  Save, Loader2, Building, Calendar, 
  Printer, DollarSign, UserCheck, Plus, Trash2,
  FolderLock, FolderOpen, RefreshCw
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

interface PrecapturaClientPageProps {
  initialClients: Client[];
  initialLoanPlans: LoanPlan[];
  initialPlazas: Plaza[];
  initialLocalidades: Localidad[];
  initialPromotoras: Promotora[];
  initialConfig?: AppConfig | null;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
};

const formatPercent = (val: number) => {
  return `${(val || 0).toFixed(2)}%`;
};

export function PrecapturaClientPage({
  initialClients,
  initialLoanPlans,
  initialPlazas,
  initialLocalidades,
  initialPromotoras,
  initialConfig,
}: PrecapturaClientPageProps) {
  const { toast } = useToast();
  const { appUser } = useAuth();

  // Selection states
  const [selectedPlaza, setSelectedPlaza] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  
  // Available weeks (Saturdays descending)
  const allAvailableWeeks = useMemo(() => {
    const saturdays: Date[] = [];
    const today = getMexicoNow();
    const currentSaturday = getSaturdayOfWeek(today);
    const startLimitDate = new Date('2026-07-04T00:00:00');
    const startSaturday = getSaturdayOfWeek(startLimitDate);

    const maxDate = new Date(currentSaturday);
    const currentTemp = new Date(startSaturday);

    while (currentTemp <= maxDate) {
      saturdays.push(new Date(currentTemp));
      currentTemp.setDate(currentTemp.getDate() + 7);
    }
    return saturdays.sort((a, b) => b.getTime() - a.getTime());
  }, []);

  // Set default week to current Saturday
  useEffect(() => {
    if (allAvailableWeeks.length > 0 && !selectedWeek) {
      setSelectedWeek(allAvailableWeeks[0].toISOString().split('T')[0]);
    }
  }, [allAvailableWeeks, selectedWeek]);

  // Set default plaza to first available plaza
  useEffect(() => {
    if (initialPlazas.length > 0 && !selectedPlaza) {
      setSelectedPlaza(initialPlazas[0].id);
    }
  }, [initialPlazas, selectedPlaza]);

  // Realtime subscriptions
  const plazaPromotoraIds = useMemo(() => {
    if (!selectedPlaza) return [];
    const locs = initialLocalidades.filter(l => l.plazaId === selectedPlaza);
    const locIds = locs.map(l => l.id);
    const proms = initialPromotoras.filter(p => locIds.includes(p.localidadId));
    return proms.map(p => p.id);
  }, [selectedPlaza, initialLocalidades, initialPromotoras]);

  const dynamicLoansQuery = useMemo(() => {
    const loansCol = collection(db, 'loans');
    if (plazaPromotoraIds.length === 0) {
      return query(loansCol, where('status', '==', 'NONE'));
    }
    if (plazaPromotoraIds.length <= 30) {
      return query(loansCol, where('promotoraId', 'in', plazaPromotoraIds));
    }
    // If more than 30 promotoras in this plaza (e.g. Bahía), query active/overdue loans without array truncation
    return query(loansCol, where('status', 'in', ['Active', 'Overdue', 'Paid Off']));
  }, [plazaPromotoraIds]);

  const prevWeekStr = useMemo(() => {
    if (!selectedWeek) return '';
    const d = new Date(selectedWeek + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    return getSaturdayOfWeek(d).toISOString().split('T')[0];
  }, [selectedWeek]);

  const dynamicSettlementsQuery = useMemo(() => {
    const settlementsCol = collection(db, 'promotoraSettlements');
    if (!selectedWeek) {
      return query(settlementsCol, where('weekDate', '==', 'NONE'));
    }
    return query(settlementsCol, where('weekDate', 'in', [selectedWeek, prevWeekStr]));
  }, [selectedWeek, prevWeekStr]);

  const { data: realtime } = useRealtimeData({
    clients: initialClients,
    loanPlans: initialLoanPlans,
    plazas: initialPlazas,
    localidades: initialLocalidades,
    promotoras: initialPromotoras
  }, {
    enabledCollections: ['loans', 'loanPlans', 'plazas', 'localidades', 'promotoras', 'promotoraSettlements', 'config', 'personal'],
    queries: {
      loans: dynamicLoansQuery,
      promotoraSettlements: dynamicSettlementsQuery
    },
    deps: [plazaPromotoraIds]
  });

  const plazas = useMemo(() => realtime?.plazas || initialPlazas, [realtime?.plazas, initialPlazas]);
  const localidades = useMemo(() => realtime?.localidades || initialLocalidades, [realtime?.localidades, initialLocalidades]);
  const promotoras = useMemo(() => realtime?.promotoras || initialPromotoras, [realtime?.promotoras, initialPromotoras]);
  const loans = useMemo(() => realtime?.loans || [], [realtime?.loans]);
  const loanPlans = useMemo(() => realtime?.loanPlans || initialLoanPlans, [realtime?.loanPlans, initialLoanPlans]);
  const savedSettlements = useMemo(() => realtime?.promotoraSettlements || [], [realtime?.promotoraSettlements]);
  const personals = useMemo(() => realtime?.personal || [], [realtime?.personal]);

  // Filtered promotoras for the selected plaza
  const plazaPromotoras = useMemo(() => {
    if (!selectedPlaza) return [];
    const locs = localidades.filter(l => l.plazaId === selectedPlaza);
    const locIds = locs.map(l => l.id);
    return promotoras
      .filter(p => locIds.includes(p.localidadId))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [selectedPlaza, localidades, promotoras]);

  // Precaptura document ID: `${selectedPlaza}_${selectedWeek}`
  const precapturaId = useMemo(() => {
    if (!selectedPlaza || !selectedWeek) return '';
    return `${selectedPlaza}_${selectedWeek}`;
  }, [selectedPlaza, selectedWeek]);

  // Precaptura state (synced with Firestore doc + local edits)
  const [isSavedInDb, setIsSavedInDb] = useState<boolean>(false);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [fondo, setFondo] = useState<number>(0);
  const [acumularSupervision, setAcumularSupervision] = useState<boolean>(false);
  const [observaciones, setObservaciones] = useState<string>('');
  const [gastos, setGastos] = useState<PrecapturaGasto[]>([]);
  const [rowsOverrides, setRowsOverrides] = useState<Record<string, Partial<PrecapturaRow>>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // New Gasto Form state
  const [nuevoConcepto, setNuevoConcepto] = useState<string>('');
  const [nuevoImporte, setNuevoImporte] = useState<string>('');
  const [nuevasObservaciones, setNuevasObservaciones] = useState<string>('');
  const [gastoConcepts, setGastoConcepts] = useState<string[]>([]);

  // Modals state
  const [comisionModalOpen, setComisionModalOpen] = useState<boolean>(false);
  const [bulkComisionPercent, setBulkComisionPercent] = useState<number>(0);
  const [bulkSupervisionPercent, setBulkSupervisionPercent] = useState<number>(0);
  const [ejecutivoModalOpen, setEjecutivoModalOpen] = useState<boolean>(false);

  // Fetch gasto concepts on mount
  useEffect(() => {
    getGastoConceptsAction().then(concepts => {
      if (concepts && concepts.length > 0) {
        setGastoConcepts(concepts);
      }
    });
  }, []);

  // Listen to the precaptura document in Firestore (Snapshot for instant loading!)
  useEffect(() => {
    if (!precapturaId) return;

    const docRef = doc(db, 'precapturas', precapturaId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Precaptura;
        setIsSavedInDb(true);
        setIsClosed(!!data.isClosed);
        setFondo(data.fondo || 0);
        setAcumularSupervision(!!data.acumularSupervision);
        setObservaciones(data.observaciones || '');
        setGastos(data.gastos || []);
        if (data.rows && Object.keys(data.rows).length > 0) {
          setRowsOverrides(data.rows);
        }
      } else {
        setIsSavedInDb(false);
        setIsClosed(false);
        setFondo(0);
        setAcumularSupervision(false);
        setObservaciones('');
        setGastos([]);
        setRowsOverrides({});
      }
      setHasUnsavedChanges(false);
    }, (err) => {
      console.warn('Error reading precaptura snapshot:', err);
    });

    return () => unsubscribe();
  }, [precapturaId]);

  // Pre-index loans by promotora for O(1) lookups
  const loansByPromotora = useMemo(() => {
    const map: Record<string, Loan[]> = {};
    const minDate = new Date('2026-03-01T00:00:00');
    loans.forEach(loan => {
      if (loan.promotoraId) {
        const startDate = parseLocalDate(loan.startDate);
        if (startDate >= minDate) {
          if (!map[loan.promotoraId]) map[loan.promotoraId] = [];
          map[loan.promotoraId].push(loan);
        }
      }
    });
    return map;
  }, [loans]);

  // Determine which promotoras lack a saved snapshot in rowsOverrides
  const promotorasNeedingCalc = useMemo(() => {
    return plazaPromotoras.filter(p => rowsOverrides[p.id]?.debeEntregar === undefined);
  }, [plazaPromotoras, rowsOverrides]);

  // ULTRA-OPTIMIZED calculation of Debes:
  // If snapshot exists in DB, it returns immediately without re-calculating!
  // If calculation is needed, it uses the previous week's saved settlement deuda
  // to avoid re-simulating historical weeks back to July 2026!
  const computedDebesMap = useMemo(() => {
    if (!selectedPlaza || !selectedWeek || promotorasNeedingCalc.length === 0) {
      return {};
    }

    const resultMap: Record<string, {
      debeEntregar: number;
      adelEnt: number;
      adelSal: number;
      defaultFalla: number;
      defaultRecuperado: number;
    }> = {};

    const targetWeekDate = new Date(selectedWeek + 'T00:00:00');
    const targetWeekSaturday = getSaturdayOfWeek(targetWeekDate);
    const targetWeekSaturdayTime = targetWeekSaturday.getTime();

    // Previous Saturday (7 days prior)
    const prevSaturday = new Date(targetWeekSaturday);
    prevSaturday.setDate(prevSaturday.getDate() - 7);
    const prevWeekStr = prevSaturday.toISOString().split('T')[0];

    // Helper to calculate single week metrics for a promotora
    const calcSingleWeek = (pId: string, week: Date) => {
      const pLoans = loansByPromotora[pId] || [];
      const weekTime = week.getTime();
      let realDebeEntregar = 0;
      let realAdelSal = 0;
      let realFalla = 0;
      let realEfectivo = 0;
      let realRecuperado = 0;
      let realAdelEnt = 0;

      pLoans.forEach(loan => {
        const plan = loanPlans.find(lp => lp.id === loan.loanPlanId);
        if (!plan) return;

        const breakdown = getLoanAbonoSalienteForWeek(loan, plan, week, realtime?.config);
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
            // Pago asumido o semana sin captura manual de fallo: cubierto en su totalidad sin falla
            loanFalla = 0;
            loanEfectivo = expectedForLoan;
            loanRecuperado = 0;
          }
        }

        realFalla += loanFalla;
        realEfectivo += loanEfectivo;
        realRecuperado += loanRecuperado;

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

      return {
        abonoSemanal: realDebeEntregar,
        realAdelSal,
        realFalla,
        realEfectivo,
        realRecuperado,
        realAdelEnt
      };
    };

    promotorasNeedingCalc.forEach(promotora => {
      const pId = promotora.id;
      const targetSettlementId = `${pId}_${selectedWeek}`;
      const savedTarget = savedSettlements.find(s => s.id === targetSettlementId);

      // If already closed or saved in database, load instantly with zero calculations!
      if (savedTarget) {
        resultMap[pId] = {
          debeEntregar: savedTarget.debeEntregar || 0,
          adelEnt: savedTarget.adelEnt || 0,
          adelSal: savedTarget.adelSal || 0,
          defaultFalla: savedTarget.falla || 0,
          defaultRecuperado: savedTarget.recuperado || 0
        };
        return;
      }

      // Fast check: Is the immediately preceding week settlement saved in promotoraSettlements?
      const prevSettlementId = `${pId}_${prevWeekStr}`;
      const prevSaved = savedSettlements.find(s => s.id === prevSettlementId);

      if (prevSaved) {
        // Fast-path: Take previous week debt directly!
        const prevDeuda = prevSaved.deuda || 0;
        const targetMetrics = calcSingleWeek(pId, targetWeekSaturday);
        const currentDebeEntregar = prevDeuda + targetMetrics.abonoSemanal;

        resultMap[pId] = {
          debeEntregar: currentDebeEntregar,
          adelEnt: targetMetrics.realAdelEnt,
          adelSal: targetMetrics.realAdelSal,
          defaultFalla: targetMetrics.realFalla,
          defaultRecuperado: targetMetrics.realRecuperado
        };
        return;
      }

      // Check if ANY previous settlement exists for this promotora before targetWeek
      const pastSaved = savedSettlements
        .filter(s => s.promotoraId === pId && s.weekDate < selectedWeek)
        .sort((a, b) => b.weekDate.localeCompare(a.weekDate));

      let startDate: Date;
      let prevDeuda = 0;

      if (pastSaved.length > 0) {
        const latest = pastSaved[0];
        prevDeuda = latest.deuda || 0;
        const latestDate = new Date(latest.weekDate + 'T00:00:00');
        latestDate.setDate(latestDate.getDate() + 7);
        startDate = getSaturdayOfWeek(latestDate);
      } else {
        startDate = getSaturdayOfWeek(new Date('2026-07-04T00:00:00'));
      }

      // Simulate only the necessary range of weeks
      const currentTemp = new Date(startDate);
      let targetResult = {
        debeEntregar: 0,
        adelEnt: 0,
        adelSal: 0,
        defaultFalla: 0,
        defaultRecuperado: 0
      };

      while (currentTemp.getTime() <= targetWeekSaturdayTime) {
        const weekStr = currentTemp.toISOString().split('T')[0];
        const id = `${pId}_${weekStr}`;
        const saved = savedSettlements.find(s => s.id === id);
        const metrics = calcSingleWeek(pId, currentTemp);

        let currentDebeEntregar = 0;
        if (currentTemp.getTime() === startDate.getTime() && pastSaved.length === 0) {
          currentDebeEntregar = (saved?.debeEntregar !== undefined) ? saved.debeEntregar : metrics.abonoSemanal;
        } else {
          currentDebeEntregar = (saved?.debeEntregar !== undefined) ? saved.debeEntregar : (prevDeuda + metrics.abonoSemanal);
        }

        const effectiveFalla = (saved?.falla !== undefined) ? saved.falla : metrics.realFalla;
        const effectiveEfectivo = (saved?.efectivo !== undefined) ? saved.efectivo : Math.max(0, currentDebeEntregar - effectiveFalla);
        const currentDeuda = (saved?.deuda !== undefined) ? saved.deuda : Math.max(0, currentDebeEntregar - effectiveEfectivo);
        prevDeuda = currentDeuda;

        if (weekStr === selectedWeek) {
          targetResult = {
            debeEntregar: currentDebeEntregar,
            adelEnt: saved?.adelEnt !== undefined && saved.adelEnt > 0 ? saved.adelEnt : metrics.realAdelEnt,
            adelSal: saved?.adelSal !== undefined && saved.adelSal > 0 ? saved.adelSal : metrics.realAdelSal,
            defaultFalla: effectiveFalla,
            defaultRecuperado: (saved?.recuperado !== undefined) ? saved.recuperado : metrics.realRecuperado
          };
          break;
        }

        currentTemp.setDate(currentTemp.getDate() + 7);
      }

      resultMap[pId] = targetResult;
    });

    return resultMap;
  }, [selectedPlaza, selectedWeek, promotorasNeedingCalc, loansByPromotora, loanPlans, savedSettlements, realtime?.config]);

  // Combine Debes data + snapshot overrides to build table rows
  const tableRows: PrecapturaRow[] = useMemo(() => {
    return plazaPromotoras.map(promotora => {
      const pId = promotora.id;
      const override = rowsOverrides[pId] || {};

      const debeData = (override.debeEntregar !== undefined && override.adelantosEntrantes !== undefined && override.adelantosSalientes !== undefined)
        ? {
            debeEntregar: override.debeEntregar,
            adelEnt: override.adelantosEntrantes,
            adelSal: override.adelantosSalientes,
            defaultFalla: override.falla || 0,
            defaultRecuperado: override.recuperado || 0,
          }
        : (computedDebesMap[pId] || {
            debeEntregar: 0,
            adelEnt: 0,
            adelSal: 0,
            defaultFalla: 0,
            defaultRecuperado: 0
          });

      const savedSettlement = savedSettlements.find(s => s.id === `${pId}_${selectedWeek}`);

      const debeEntregar = override.debeEntregar !== undefined ? override.debeEntregar : debeData.debeEntregar;
      const comicionPercent = override.comicionPercent !== undefined 
        ? override.comicionPercent 
        : (savedSettlement?.comicionPercent !== undefined ? savedSettlement.comicionPercent : 0);
      const supervisionPercent = override.supervisionPercent !== undefined 
        ? override.supervisionPercent 
        : (savedSettlement?.supervisionPercent !== undefined ? savedSettlement.supervisionPercent : 0);
      const venta = override.venta !== undefined 
        ? override.venta 
        : (savedSettlement?.venta !== undefined ? savedSettlement.venta : 0);
      
      const falla = override.falla !== undefined 
        ? override.falla 
        : (savedSettlement?.falla !== undefined ? savedSettlement.falla : (debeData.defaultFalla || 0));
      const recuperado = override.recuperado !== undefined 
        ? override.recuperado 
        : (savedSettlement?.recuperado !== undefined ? savedSettlement.recuperado : (debeData.defaultRecuperado || 0));
      const semanaExtra = override.semanaExtra !== undefined 
        ? override.semanaExtra 
        : (savedSettlement?.semExt !== undefined ? savedSettlement.semExt : 0);

      const comision = override.comision !== undefined 
        ? override.comision 
        : Math.round(venta * (comicionPercent / 100));

      const supervision = override.supervision !== undefined 
        ? override.supervision 
        : Math.round(venta * (supervisionPercent / 100));

      const totalEntregar = override.totalEntregar !== undefined
        ? override.totalEntregar
        : (debeEntregar - falla + recuperado);

      const diferencia = override.diferencia !== undefined
        ? override.diferencia
        : (totalEntregar - debeEntregar);

      const porcentajeFalla = debeEntregar > 0 ? (falla / debeEntregar) * 100 : 0;

      const adelantosEntrantes = override.adelantosEntrantes !== undefined 
        ? override.adelantosEntrantes 
        : debeData.adelEnt;

      const adelantosSalientes = override.adelantosSalientes !== undefined 
        ? override.adelantosSalientes 
        : debeData.adelSal;

      return {
        promotoraId: pId,
        promotoraName: promotora.name,
        comicionPercent,
        supervisionPercent,
        debeEntregar,
        falla,
        recuperado,
        totalEntregar,
        diferencia,
        porcentajeFalla,
        venta,
        comision,
        supervision,
        adelantosEntrantes,
        adelantosSalientes,
        semanaExtra,
      };
    });
  }, [plazaPromotoras, rowsOverrides, computedDebesMap]);

  // Compute table totals
  const totals = useMemo(() => {
    const sum = {
      debeEntregar: 0,
      falla: 0,
      recuperado: 0,
      totalEntregar: 0,
      diferencia: 0,
      venta: 0,
      comision: 0,
      supervision: 0,
      adelantosEntrantes: 0,
      adelantosSalientes: 0,
      semanaExtra: 0,
    };

    tableRows.forEach(row => {
      sum.debeEntregar += row.debeEntregar || 0;
      sum.falla += row.falla || 0;
      sum.recuperado += row.recuperado || 0;
      sum.totalEntregar += row.totalEntregar || 0;
      sum.diferencia += row.diferencia || 0;
      sum.venta += row.venta || 0;
      sum.comision += row.comision || 0;
      sum.supervision += row.supervision || 0;
      sum.adelantosEntrantes += row.adelantosEntrantes || 0;
      sum.adelantosSalientes += row.adelantosSalientes || 0;
      sum.semanaExtra += row.semanaExtra || 0;
    });

    const porcentajeFallaGlobal = sum.debeEntregar > 0 ? (sum.falla / sum.debeEntregar) * 100 : 0;

    return {
      ...sum,
      porcentajeFalla: porcentajeFallaGlobal,
    };
  }, [tableRows]);

  // Gastos Total
  const totalGastos = useMemo(() => {
    return gastos.reduce((sum, g) => sum + (Number(g.importe) || 0), 0);
  }, [gastos]);

  // Bottom Summary Cards formulas
  const totalEntregarGlobal = useMemo(() => {
    return totals.totalEntregar - totals.adelantosSalientes;
  }, [totals.totalEntregar, totals.adelantosSalientes]);

  const granTotal = useMemo(() => {
    return totalEntregarGlobal - totalGastos + totals.semanaExtra + (Number(fondo) || 0);
  }, [totalEntregarGlobal, totalGastos, totals.semanaExtra, fondo]);

  // Current Plaza name
  const currentPlazaName = useMemo(() => {
    return plazas.find(p => p.id === selectedPlaza)?.name || 'Seleccione Plaza';
  }, [plazas, selectedPlaza]);

  // Condition to enable/disable PDF print:
  // Must be saved in DB AND have no pending unsaved modifications
  const isPrintDisabled = !isSavedInDb || hasUnsavedChanges || isSaving;

  // Handle cell edits in table
  const handleCellChange = (pId: string, field: keyof PrecapturaRow, rawValue: string) => {
    const numValue = parseFloat(rawValue) || 0;
    setRowsOverrides(prev => {
      const current = prev[pId] || {};
      const updated = {
        ...current,
        [field]: numValue
      };

      const pDebe = updated.debeEntregar !== undefined ? updated.debeEntregar : (computedDebesMap[pId]?.debeEntregar || 0);
      const pVenta = updated.venta !== undefined ? updated.venta : (current.venta || 0);
      const pComPercent = updated.comicionPercent !== undefined ? updated.comicionPercent : (current.comicionPercent || 0);
      const pSupPercent = updated.supervisionPercent !== undefined ? updated.supervisionPercent : (current.supervisionPercent || 0);
      const pFalla = updated.falla !== undefined ? updated.falla : (current.falla || 0);
      const pRecuperado = updated.recuperado !== undefined ? updated.recuperado : (current.recuperado || 0);

      if (field === 'venta' || field === 'comicionPercent') {
        updated.comision = Math.round(pVenta * (pComPercent / 100));
      }
      if (field === 'venta' || field === 'supervisionPercent') {
        updated.supervision = Math.round(pVenta * (pSupPercent / 100));
      }
      if (field === 'falla' || field === 'recuperado' || field === 'debeEntregar') {
        updated.totalEntregar = pDebe - pFalla + pRecuperado;
        updated.diferencia = updated.totalEntregar - pDebe;
        updated.porcentajeFalla = pDebe > 0 ? (pFalla / pDebe) * 100 : 0;
      }

      return {
        ...prev,
        [pId]: updated
      };
    });
    setHasUnsavedChanges(true);
  };

  // Add a new gasto
  const handleAddGasto = async () => {
    if (!nuevoConcepto.trim()) {
      toast({
        title: 'Concepto requerido',
        description: 'Ingresa el concepto del gasto.',
        variant: 'destructive',
      });
      return;
    }
    const imp = parseFloat(nuevoImporte);
    if (isNaN(imp) || imp <= 0) {
      toast({
        title: 'Importe inválido',
        description: 'Ingresa un monto mayor a 0.',
        variant: 'destructive',
      });
      return;
    }

    const cleanConcept = nuevoConcepto.trim().toUpperCase();
    const newGasto: PrecapturaGasto = {
      id: `gasto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      concepto: cleanConcept,
      importe: imp,
      observaciones: nuevasObservaciones.trim() || undefined,
    };

    setGastos(prev => [...prev, newGasto]);
    setNuevoConcepto('');
    setNuevoImporte('');
    setNuevasObservaciones('');
    setHasUnsavedChanges(true);

    saveGastoConceptAction(cleanConcept);
    if (!gastoConcepts.includes(cleanConcept)) {
      setGastoConcepts(prev => [cleanConcept, ...prev]);
    }

    toast({
      title: 'Gasto agregado',
      description: `${cleanConcept}: ${formatCurrency(imp)}`,
    });
  };

  // Remove a gasto
  const handleRemoveGasto = (id: string) => {
    setGastos(prev => prev.filter(g => g.id !== id));
    setHasUnsavedChanges(true);
  };

  // Apply bulk commission %
  const handleApplyBulkComision = () => {
    setRowsOverrides(prev => {
      const updated = { ...prev };
      plazaPromotoras.forEach(p => {
        const cur = updated[p.id] || {};
        const pVenta = cur.venta || 0;
        updated[p.id] = {
          ...cur,
          comicionPercent: bulkComisionPercent,
          supervisionPercent: bulkSupervisionPercent,
          comision: Math.round(pVenta * (bulkComisionPercent / 100)),
          supervision: Math.round(pVenta * (bulkSupervisionPercent / 100)),
        };
      });
      return updated;
    });
    setHasUnsavedChanges(true);
    setComisionModalOpen(false);
    toast({
      title: 'Comisiones actualizadas',
      description: `Se aplicó ${bulkComisionPercent}% de comisión y ${bulkSupervisionPercent}% de supervisión a todas las promotoras.`,
    });
  };

  // Save full Precaptura to Firestore (Freezing the complete snapshot in the document)
  const handleSave = async (overrideClosedState?: boolean) => {
    if (!selectedPlaza || !selectedWeek) {
      toast({
        title: 'Error',
        description: 'Selecciona una plaza y semana válidas.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const closedVal = overrideClosedState !== undefined ? overrideClosedState : isClosed;

      // Capture all computed rows so subsequent loads are INSTANT
      const fullRowsSnapshot: Record<string, PrecapturaRow> = {};
      tableRows.forEach(row => {
        fullRowsSnapshot[row.promotoraId] = row;
      });

      const precapturaData: Precaptura = {
        id: precapturaId,
        plazaId: selectedPlaza,
        plazaName: currentPlazaName,
        weekDate: selectedWeek,
        isClosed: closedVal,
        fondo: Number(fondo) || 0,
        acumularSupervision,
        observaciones,
        rows: fullRowsSnapshot,
        gastos,
        updatedBy: appUser?.username || 'Usuario',
        updatedAt: new Date().toISOString(),
      };

      const result = await savePrecapturaAction(precapturaData);
      if (result.success) {
        setIsSavedInDb(true);
        setHasUnsavedChanges(false);
        toast({
          title: 'Guardado exitoso',
          description: result.message || 'La precaptura se guardó correctamente. La impresión en PDF ya está habilitada.',
        });
      } else {
        toast({
          title: 'Error al guardar',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error inesperado',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Closed status
  const handleToggleClosed = async () => {
    const nextClosed = !isClosed;
    setIsClosed(nextClosed);
    setHasUnsavedChanges(true);
    await handleSave(nextClosed);
  };

  // Force re-sync with dynamic loans (clears local snapshot and re-computes)
  const handleForceRecalculate = () => {
    setRowsOverrides({});
    setHasUnsavedChanges(true);
    toast({
      title: 'Datos recalculados',
      description: 'Se volvieron a calcular los valores desde la cobranza en vivo.',
    });
  };

  // Institutional PDF Generation (Matching exact layout of the attached document)
  const handlePrint = () => {
    if (isPrintDisabled) {
      toast({
        title: 'Impresión no disponible',
        description: hasUnsavedChanges 
          ? 'Guarda los cambios antes de imprimir en PDF.' 
          : 'Debes guardar la precaptura o cerrar el grupo para habilitar la impresión.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }) as jsPDFWithAutoTable;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;

      // Print Date & Cutoff Date
      const today = new Date();
      const printDateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
      
      const weekParts = selectedWeek.split('-');
      const cutoffDateFormatted = weekParts.length === 3 ? `${weekParts[2]}/${weekParts[1]}/${weekParts[0]}` : selectedWeek;

      // 1. Header institucional
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(printDateStr, pageWidth - margin, 18, { align: 'right' });
      doc.text('Página 1', pageWidth - margin, 28, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('-', pageWidth / 2, 12, { align: 'center' });

      doc.setFontSize(11);
      doc.text('DETERMINACION DE FONDOS', pageWidth / 2, 23, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`DEL ${cutoffDateFormatted}`, pageWidth / 2, 33, { align: 'center' });

      // Left above table: Plaza Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(currentPlazaName.toUpperCase(), margin, 46);

      // 2. Table Data (Column % left blank as requested!)
      const head = [[
        'Nombre de Grupo',
        '%',
        'Debe Entregar',
        'Falla',
        'Efectivo',
        'Recuperado',
        'Total',
        'Diferencia',
        '%Falla',
        'Venta',
        'Comisión',
        'Supervisión',
        'Abono Ent',
        'Abono Sal',
        'Sem Ext',
      ]];

      const body = tableRows.map(r => {
        const efectivo = r.debeEntregar - r.falla;
        return [
          r.promotoraName.toUpperCase(),
          '', // Columna % en blanco
          formatCurrency(r.debeEntregar),
          formatCurrency(r.falla),
          formatCurrency(efectivo),
          formatCurrency(r.recuperado),
          formatCurrency(r.totalEntregar),
          formatCurrency(r.diferencia),
          formatPercent(r.porcentajeFalla),
          formatCurrency(r.venta),
          formatCurrency(r.comision),
          formatCurrency(r.supervision),
          formatCurrency(r.adelantosEntrantes),
          formatCurrency(r.adelantosSalientes),
          formatCurrency(r.semanaExtra),
        ];
      });

      const totalEfectivo = totals.debeEntregar - totals.falla;
      const foot = [[
        'TOTALES',
        '', // Columna % en blanco
        formatCurrency(totals.debeEntregar),
        formatCurrency(totals.falla),
        formatCurrency(totalEfectivo),
        formatCurrency(totals.recuperado),
        formatCurrency(totals.totalEntregar),
        formatCurrency(totals.diferencia),
        formatPercent(totals.porcentajeFalla),
        formatCurrency(totals.venta),
        formatCurrency(totals.comision),
        formatCurrency(totals.supervision),
        formatCurrency(totals.adelantosEntrantes),
        formatCurrency(totals.adelantosSalientes),
        formatCurrency(totals.semanaExtra),
      ]];

      doc.autoTable({
        startY: 52,
        margin: { left: margin, right: margin },
        head,
        body,
        foot,
        theme: 'plain',
        tableLineWidth: 0.5,
        tableLineColor: [0, 0, 0],
        styles: {
          fontSize: 6.5,
          font: 'helvetica',
          textColor: [0, 0, 0],
          cellPadding: 2,
          lineWidth: 0.5,
          lineColor: [0, 0, 0],
          overflow: 'ellipsize',
        },
        headStyles: {
          fontStyle: 'bold',
          lineWidth: 0.5,
          lineColor: [0, 0, 0],
          halign: 'center',
          fillColor: [255, 255, 255],
        },
        footStyles: {
          fontStyle: 'bold',
          lineWidth: 0.5,
          lineColor: [0, 0, 0],
          fillColor: [255, 255, 255],
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 125 },
          1: { halign: 'center', cellWidth: 35 },
          2: { halign: 'right', cellWidth: 46 },
          3: { halign: 'right', cellWidth: 40 },
          4: { halign: 'right', cellWidth: 46 },
          5: { halign: 'right', cellWidth: 40 },
          6: { halign: 'right', cellWidth: 46 },
          7: { halign: 'right', cellWidth: 40 },
          8: { halign: 'right', cellWidth: 35 },
          9: { halign: 'right', cellWidth: 42 },
          10: { halign: 'right', cellWidth: 42 },
          11: { halign: 'right', cellWidth: 42 },
          12: { halign: 'right', cellWidth: 44 },
          13: { halign: 'right', cellWidth: 44 },
          14: { halign: 'right', cellWidth: 40 },
        },
      });

      // 3. Footer institucional
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      let startY = finalY + 12;

      if (startY + 95 > pageHeight - margin) {
        doc.addPage('letter', 'landscape');
        startY = 35;
      }

      // Relación de Gastos (Left)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text('Relación de Gastos', margin, startY);

      if (gastos.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        let gY = startY + 9;
        gastos.slice(0, 8).forEach(g => {
          doc.text(`• ${g.concepto}: ${formatCurrency(g.importe)}`, margin, gY);
          gY += 8;
        });
        if (gastos.length > 8) {
          doc.text(`... y ${gastos.length - 8} más`, margin, gY);
        }
      }

      // Resumen Central
      const labelX = 280;
      const valX = 335;
      const lineSpacing = 9.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('GASTOS', labelX, startY + 10, { align: 'right' });
      doc.text(formatCurrency(totalGastos), valX, startY + 10, { align: 'right' });

      doc.text('FONDO', labelX, startY + 10 + lineSpacing, { align: 'right' });
      doc.text(formatCurrency(fondo), valX, startY + 10 + lineSpacing, { align: 'right' });

      doc.text('A ENTREGAR', labelX, startY + 10 + lineSpacing * 2, { align: 'right' });
      doc.text(formatCurrency(totalEntregarGlobal), valX, startY + 10 + lineSpacing * 2, { align: 'right' });

      doc.text('EXTRAS', labelX, startY + 10 + lineSpacing * 3, { align: 'right' });
      doc.text(formatCurrency(totals.semanaExtra), valX, startY + 10 + lineSpacing * 3, { align: 'right' });

      // Linea separadora antes del Gran Total
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(labelX - 45, startY + 10 + lineSpacing * 3.6, valX + 2, startY + 10 + lineSpacing * 3.6);

      // Gran Total
      doc.setFont('helvetica', 'bold');
      doc.text('GRAN TOTAL', labelX, startY + 10 + lineSpacing * 4.8, { align: 'right' });
      doc.text(formatCurrency(granTotal), valX, startY + 10 + lineSpacing * 4.8, { align: 'right' });

      // Observaciones
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('Observaciones', 370, startY);

      if (observaciones.trim()) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(observaciones.trim(), 370, startY + 10, { maxWidth: 360 });
      }

      // Firmas de Entrega y Recibido
      const sigY = startY + 68;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);

      // Firma de Entrega
      doc.line(360, sigY, 515, sigY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Firma de Entrega', 437, sigY + 8, { align: 'center' });

      // Firma de Recibido
      doc.line(575, sigY, 730, sigY);
      doc.text('Firma de Recibido', 652, sigY + 8, { align: 'center' });

      // Abrir PDF en pestaña nueva
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
      doc.save(`Determinacion_Fondos_${currentPlazaName.replace(/\s+/g, '_')}_${cutoffDateFormatted.replace(/\//g, '-')}.pdf`);

    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast({
        title: 'Error al generar PDF',
        description: err.message || 'No se pudo generar el documento.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 pb-20 print:p-0 print:space-y-3">
      {/* Screen Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Precaptura
            <Badge variant={isClosed ? 'default' : 'secondary'} className={cn(
              "font-bold text-[10px] uppercase tracking-wider",
              isClosed ? "bg-slate-700 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-800 dark:bg-zinc-800 dark:text-zinc-200"
            )}>
              {isClosed ? 'Cerrado' : 'Pendiente de cierre'}
            </Badge>
          </h1>

          {/* Quick Recalculate Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleForceRecalculate}
            title="Recalcular con cobranza en vivo"
            className="h-7 px-2 text-[11px] text-slate-600 dark:text-zinc-400 hover:text-slate-900"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Recalcular
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasUnsavedChanges && (
            <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
              ● Cambios sin guardar
            </span>
          )}

          <Button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="h-8 text-xs font-bold bg-[#1e3a8a] hover:bg-[#172554] text-white shadow-sm transition-colors"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar Precaptura
          </Button>

          <Button
            onClick={handlePrint}
            disabled={isPrintDisabled}
            title={
              isPrintDisabled
                ? (hasUnsavedChanges
                    ? 'Guarda los cambios para habilitar la impresión'
                    : 'Guarda la precaptura o cierra el grupo para habilitar la impresión en PDF')
                : 'Imprimir Determinación de Fondos en PDF'
            }
            className={cn(
              "h-8 text-xs font-bold shadow-sm transition-colors",
              isPrintDisabled
                ? "bg-slate-300 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500 cursor-not-allowed opacity-60 hover:bg-slate-300"
                : "bg-[#1e3a8a] hover:bg-[#172554] text-white"
            )}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Imprimir PDF
          </Button>
        </div>
      </div>

      {/* Top Filter Bar */}
      <Card className="border shadow-sm bg-white dark:bg-zinc-900 print:border-none print:shadow-none">
        <CardContent className="p-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            
            {/* Left Filter: Fecha de Cierre & Pendiente Checkbox */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                  Fecha de Cierre:
                </span>
                <Select value={selectedWeek} onValueChange={(val) => {
                  setSelectedWeek(val);
                  setHasUnsavedChanges(false);
                }}>
                  <SelectTrigger className="w-[180px] h-8 text-xs font-semibold bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700">
                    <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                    <SelectValue placeholder="Seleccionar Fecha" />
                  </SelectTrigger>
                  <SelectContent>
                    {allAvailableWeeks.map((week) => {
                      const dateStr = week.toISOString().split('T')[0];
                      const formatted = week.toLocaleDateString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      });
                      return (
                        <SelectItem key={dateStr} value={dateStr} className="text-xs">
                          {formatted} ({dateStr})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Checkbox: Pendiente de cierre (checked = !isClosed) */}
              <div className="flex items-center space-x-2 pl-3 border-l border-slate-300 dark:border-zinc-700">
                <Checkbox
                  id="pendiente-cierre"
                  checked={!isClosed}
                  onCheckedChange={(checked) => {
                    const newClosed = !checked;
                    setIsClosed(newClosed);
                    setHasUnsavedChanges(true);
                  }}
                  className="data-[state=checked]:bg-[#1e3a8a] data-[state=checked]:border-[#1e3a8a]"
                />
                <label
                  htmlFor="pendiente-cierre"
                  className="text-xs font-bold leading-none cursor-pointer text-slate-700 dark:text-zinc-300 select-none"
                >
                  Pendiente de cierre
                </label>
              </div>
            </div>

            {/* Center/Right Filter: Plaza Selector & Actualiza Ejecutivo */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                  Plaza:
                </span>
                <Select value={selectedPlaza} onValueChange={(val) => {
                  setSelectedPlaza(val);
                  setHasUnsavedChanges(false);
                }}>
                  <SelectTrigger className="w-[200px] h-8 font-bold text-xs bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white shadow-sm">
                    <Building className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                    <SelectValue placeholder="Seleccionar Plaza" />
                  </SelectTrigger>
                  <SelectContent>
                    {plazas.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs font-bold">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Actualiza Ejecutivo Button */}
              <Button
                size="sm"
                onClick={() => setEjecutivoModalOpen(true)}
                className="h-8 text-xs font-bold bg-[#1e3a8a] hover:bg-[#172554] text-white shadow-sm transition-colors"
              >
                <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                Actualiza Ejecutivo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table Card (Clean monochrome styling, compact side-to-side layout) */}
      <Card className="border border-slate-300 dark:border-zinc-800 shadow-sm overflow-hidden bg-white dark:bg-zinc-950 print:border-none print:shadow-none">
        <div className="w-full overflow-x-auto">
          <Table className="w-full table-fixed text-[11px] border-collapse">
            <TableHeader className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-300 dark:border-zinc-700">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-left w-[14%] truncate">
                  Grupo
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-0.5 text-center w-[4.5%]">
                  % Com
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-0.5 text-center w-[4.5%]">
                  % Sup
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[8%]">
                  Debe Entregar
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[6.5%]">
                  Falla
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[6.5%]">
                  Recuperado
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[8.5%]">
                  Total a Entregar
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[6.5%]">
                  Diferencia
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-0.5 text-right w-[5%]">
                  % Falla
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[6.5%]">
                  Venta
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[6.5%]">
                  Comision
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[6.5%]">
                  Supervision
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[8%]">
                  Adelantos Entrante
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[8%]">
                  Adelantos Saliente
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-right w-[6.5%]">
                  Sem. Extra
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {tableRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="h-24 text-center text-muted-foreground font-semibold">
                    No se encontraron grupos/promotoras registradas en la plaza seleccionada.
                  </TableCell>
                </TableRow>
              ) : (
                tableRows.map((row, index) => {
                  return (
                    <TableRow 
                      key={row.promotoraId} 
                      className={cn(
                        "hover:bg-slate-100/70 dark:hover:bg-zinc-800/60 transition-colors border-b border-slate-200 dark:border-zinc-800",
                        index % 2 === 1 ? "bg-slate-50/60 dark:bg-zinc-900/40" : "bg-white dark:bg-zinc-950"
                      )}
                    >
                      {/* Grupo */}
                      <TableCell className="font-bold text-slate-900 dark:text-zinc-100 py-1 px-1.5 truncate" title={row.promotoraName}>
                        {row.promotoraName}
                      </TableCell>

                      {/* % Com */}
                      <TableCell className="p-0.5 text-center">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={row.comicionPercent === 0 ? '0' : row.comicionPercent}
                          onChange={(e) => handleCellChange(row.promotoraId, 'comicionPercent', e.target.value)}
                          className="h-6 text-[11px] text-center p-0.5 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 font-medium focus-visible:ring-1 focus-visible:ring-[#1e3a8a]"
                        />
                      </TableCell>

                      {/* % Sup */}
                      <TableCell className="p-0.5 text-center">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={row.supervisionPercent === 0 ? '0' : row.supervisionPercent}
                          onChange={(e) => handleCellChange(row.promotoraId, 'supervisionPercent', e.target.value)}
                          className="h-6 text-[11px] text-center p-0.5 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 font-medium focus-visible:ring-1 focus-visible:ring-[#1e3a8a]"
                        />
                      </TableCell>

                      {/* Debe Entregar */}
                      <TableCell className="py-1 px-1 text-right font-bold text-slate-900 dark:text-zinc-100">
                        {formatCurrency(row.debeEntregar)}
                      </TableCell>

                      {/* Falla */}
                      <TableCell className="p-0.5 text-right">
                        <Input
                          type="number"
                          step="10"
                          min="0"
                          value={row.falla === 0 ? '0' : row.falla}
                          onChange={(e) => handleCellChange(row.promotoraId, 'falla', e.target.value)}
                          className="h-6 text-[11px] text-right p-0.5 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 font-medium focus-visible:ring-1 focus-visible:ring-[#1e3a8a]"
                        />
                      </TableCell>

                      {/* Recuperado */}
                      <TableCell className="p-0.5 text-right">
                        <Input
                          type="number"
                          step="10"
                          min="0"
                          value={row.recuperado === 0 ? '0' : row.recuperado}
                          onChange={(e) => handleCellChange(row.promotoraId, 'recuperado', e.target.value)}
                          className="h-6 text-[11px] text-right p-0.5 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 font-medium focus-visible:ring-1 focus-visible:ring-[#1e3a8a]"
                        />
                      </TableCell>

                      {/* Total a Entregar */}
                      <TableCell className="py-1 px-1 text-right font-black text-slate-900 dark:text-zinc-100">
                        {formatCurrency(row.totalEntregar)}
                      </TableCell>

                      {/* Diferencia */}
                      <TableCell className="py-1 px-1 text-right font-bold text-slate-900 dark:text-zinc-100">
                        {formatCurrency(row.diferencia)}
                      </TableCell>

                      {/* % Falla */}
                      <TableCell className="py-1 px-0.5 text-right font-medium text-slate-800 dark:text-zinc-200">
                        {formatPercent(row.porcentajeFalla)}
                      </TableCell>

                      {/* Venta */}
                      <TableCell className="p-0.5 text-right">
                        <Input
                          type="number"
                          step="100"
                          min="0"
                          value={row.venta === 0 ? '0' : row.venta}
                          onChange={(e) => handleCellChange(row.promotoraId, 'venta', e.target.value)}
                          className="h-6 text-[11px] text-right p-0.5 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 font-medium focus-visible:ring-1 focus-visible:ring-[#1e3a8a]"
                        />
                      </TableCell>

                      {/* Comision */}
                      <TableCell className="py-1 px-1 text-right font-medium text-slate-800 dark:text-zinc-200">
                        {formatCurrency(row.comision)}
                      </TableCell>

                      {/* Supervision */}
                      <TableCell className="py-1 px-1 text-right font-medium text-slate-800 dark:text-zinc-200">
                        {formatCurrency(row.supervision)}
                      </TableCell>

                      {/* Adelantos Entrante */}
                      <TableCell className="py-1 px-1 text-right font-medium text-slate-800 dark:text-zinc-200">
                        {formatCurrency(row.adelantosEntrantes)}
                      </TableCell>

                      {/* Adelantos Saliente */}
                      <TableCell className="py-1 px-1 text-right font-bold text-slate-900 dark:text-zinc-100">
                        {formatCurrency(row.adelantosSalientes)}
                      </TableCell>

                      {/* Sem. Extra */}
                      <TableCell className="p-0.5 text-right">
                        <Input
                          type="number"
                          step="10"
                          min="0"
                          value={row.semanaExtra === 0 ? '0' : row.semanaExtra}
                          onChange={(e) => handleCellChange(row.promotoraId, 'semanaExtra', e.target.value)}
                          className="h-6 text-[11px] text-right p-0.5 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 font-medium focus-visible:ring-1 focus-visible:ring-[#1e3a8a]"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}

              {/* Totals Row */}
              {tableRows.length > 0 && (
                <TableRow className="bg-slate-200 dark:bg-zinc-800 font-black border-t-2 border-slate-400 dark:border-zinc-600 text-slate-900 dark:text-white">
                  <TableCell className="py-1.5 px-1.5 uppercase tracking-wider text-slate-900 dark:text-white truncate">
                    TOTALES
                  </TableCell>
                  <TableCell className="py-1.5 px-0.5 text-center text-slate-600">-</TableCell>
                  <TableCell className="py-1.5 px-0.5 text-center text-slate-600">-</TableCell>
                  
                  {/* Debe Entregar Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.debeEntregar)}
                  </TableCell>

                  {/* Falla Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.falla)}
                  </TableCell>

                  {/* Recuperado Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.recuperado)}
                  </TableCell>

                  {/* Total a Entregar Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.totalEntregar)}
                  </TableCell>

                  {/* Diferencia Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.diferencia)}
                  </TableCell>

                  {/* % Falla Total */}
                  <TableCell className="py-1.5 px-0.5 text-right text-slate-900 dark:text-white">
                    {formatPercent(totals.porcentajeFalla)}
                  </TableCell>

                  {/* Venta Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.venta)}
                  </TableCell>

                  {/* Comision Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.comision)}
                  </TableCell>

                  {/* Supervision Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.supervision)}
                  </TableCell>

                  {/* Adelantos Entrante Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.adelantosEntrantes)}
                  </TableCell>

                  {/* Adelantos Saliente Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.adelantosSalientes)}
                  </TableCell>

                  {/* Sem. Extra Total */}
                  <TableCell className="py-1.5 px-1 text-right text-slate-900 dark:text-white">
                    {formatCurrency(totals.semanaExtra)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Bottom Section: Gastos on Left, Resumen & Observaciones on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Gastos Section (Left - 6 cols) */}
        <Card className="lg:col-span-6 border border-slate-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
          <CardHeader className="py-2.5 px-3 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
                Gastos
              </CardTitle>
            </div>
            <span className="font-black text-xs text-slate-900 dark:text-white">
              Total: {formatCurrency(totalGastos)}
            </span>
          </CardHeader>

          <CardContent className="p-3 space-y-3">
            {/* New Gasto Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2 rounded bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 print:hidden">
              <div className="sm:col-span-5">
                <input
                  list="gasto-conceptos-list"
                  placeholder="Concepto (ej. GASOLINA)"
                  value={nuevoConcepto}
                  onChange={(e) => setNuevoConcepto(e.target.value)}
                  className="flex h-7 w-full rounded border border-slate-300 dark:border-zinc-700 bg-background px-2 py-1 text-xs font-semibold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1e3a8a] uppercase"
                />
                <datalist id="gasto-conceptos-list">
                  {gastoConcepts.map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="sm:col-span-3">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="Importe $"
                  value={nuevoImporte}
                  onChange={(e) => setNuevoImporte(e.target.value)}
                  className="h-7 text-xs font-semibold"
                />
              </div>

              <div className="sm:col-span-3">
                <Input
                  type="text"
                  placeholder="Obs. (opcional)"
                  value={nuevasObservaciones}
                  onChange={(e) => setNuevasObservaciones(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>

              <div className="sm:col-span-1 flex items-center justify-end">
                <Button
                  size="sm"
                  type="button"
                  onClick={handleAddGasto}
                  className="h-7 w-7 p-0 bg-[#1e3a8a] hover:bg-[#172554] text-white"
                  title="Agregar Gasto"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Gastos Table */}
            <div className="border border-slate-200 dark:border-zinc-800 rounded overflow-hidden min-h-[140px] bg-white dark:bg-zinc-900/50">
              <Table className="text-xs">
                <TableHeader className="bg-slate-100 dark:bg-zinc-800">
                  <TableRow>
                    <TableHead className="py-1.5 px-2.5 font-bold">Concepto</TableHead>
                    <TableHead className="py-1.5 px-2.5 font-bold text-right w-[100px]">Importe</TableHead>
                    <TableHead className="py-1.5 px-2.5 font-bold">Observaciones</TableHead>
                    <TableHead className="py-1.5 px-2 text-center w-[35px] print:hidden"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gastos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground font-semibold">
                        &lt;No data to display&gt;
                      </TableCell>
                    </TableRow>
                  ) : (
                    gastos.map((gasto) => (
                      <TableRow key={gasto.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                        <TableCell className="py-1.5 px-2.5 font-bold text-slate-800 dark:text-zinc-200">
                          {gasto.concepto}
                        </TableCell>
                        <TableCell className="py-1.5 px-2.5 text-right font-black text-slate-900 dark:text-white">
                          {formatCurrency(gasto.importe)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2.5 text-slate-600 dark:text-zinc-400">
                          {gasto.observaciones || '-'}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center print:hidden">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveGasto(gasto.id)}
                            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-800"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Resumen & Observaciones Section (Right - 6 cols) */}
        <Card className="lg:col-span-6 border border-slate-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
          <CardHeader className="py-2.5 px-3 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
              Resumen y Observaciones
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              
              {/* Numeric Balance Form */}
              <div className="md:col-span-6 space-y-2">
                
                {/* Gastos */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-zinc-300">Gastos:</span>
                  <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded border border-slate-300 dark:border-zinc-700 min-w-[120px] text-right">
                    {formatCurrency(totalGastos)}
                  </span>
                </div>

                {/* Fondo */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-zinc-300">Fondo:</span>
                  <div className="w-[120px]">
                    <Input
                      type="number"
                      step="100"
                      min="0"
                      value={fondo === 0 ? '0' : fondo}
                      onChange={(e) => {
                        setFondo(parseFloat(e.target.value) || 0);
                        setHasUnsavedChanges(true);
                      }}
                      className="h-6 text-xs text-right font-bold p-1 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700"
                    />
                  </div>
                </div>

                {/* Total a Entregar Global */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-zinc-300">Total a Entregar:</span>
                  <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded border border-slate-300 dark:border-zinc-700 min-w-[120px] text-right">
                    {formatCurrency(totalEntregarGlobal)}
                  </span>
                </div>

                {/* Extras */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-zinc-300">Extras:</span>
                  <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded border border-slate-300 dark:border-zinc-700 min-w-[120px] text-right">
                    {formatCurrency(totals.semanaExtra)}
                  </span>
                </div>

                {/* Gran Total */}
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-300 dark:border-zinc-700">
                  <span className="font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Gran total:
                  </span>
                  <span className="font-black text-xs text-slate-950 dark:text-white bg-slate-200 dark:bg-zinc-800 px-2.5 py-1 rounded border border-slate-400 dark:border-zinc-600 min-w-[120px] text-right">
                    {formatCurrency(granTotal)}
                  </span>
                </div>

                {/* Checkbox: Acumular Supervisión */}
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="acumular-supervision"
                    checked={acumularSupervision}
                    onCheckedChange={(checked) => {
                      setAcumularSupervision(!!checked);
                      setHasUnsavedChanges(true);
                    }}
                    className="data-[state=checked]:bg-[#1e3a8a] data-[state=checked]:border-[#1e3a8a]"
                  />
                  <label
                    htmlFor="acumular-supervision"
                    className="text-xs font-bold leading-none cursor-pointer text-slate-700 dark:text-zinc-300 select-none"
                  >
                    Acumular Supervisión
                  </label>
                </div>
              </div>

              {/* Textarea: Observaciones */}
              <div className="md:col-span-6 flex flex-col">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1">
                  Observaciones:
                </label>
                <Textarea
                  placeholder="Notas u observaciones del corte..."
                  value={observaciones}
                  onChange={(e) => {
                    setObservaciones(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="flex-1 min-h-[120px] text-xs resize-none bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Actions Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 shadow-sm print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Button: Actualiza Comisión */}
          <Button
            size="sm"
            onClick={() => {
              setBulkComisionPercent(8);
              setBulkSupervisionPercent(0);
              setComisionModalOpen(true);
            }}
            className="h-8 font-bold text-xs bg-[#1e3a8a] hover:bg-[#172554] text-white shadow-sm transition-colors"
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            Actualiza Comisión
          </Button>

          {/* Button: Cerrar Grupo / Reabrir Grupo */}
          <Button
            size="sm"
            onClick={handleToggleClosed}
            className="h-8 font-bold text-xs bg-[#1e3a8a] hover:bg-[#172554] text-white shadow-sm transition-colors"
          >
            {isClosed ? <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> : <FolderLock className="h-3.5 w-3.5 mr-1.5" />}
            {isClosed ? 'Reabrir Grupo' : 'Cerrar Grupo'}
          </Button>

          {/* Save Precaptura Action */}
          <Button
            size="sm"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="h-8 font-bold text-xs bg-[#1e3a8a] hover:bg-[#172554] text-white shadow-sm transition-colors"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar Cambios
          </Button>
        </div>

        {/* Status / Version Bar at bottom right */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground font-semibold">
          <span>Plaza: <strong className="text-foreground">{currentPlazaName}</strong></span>
          <span>•</span>
          <span>Semana: <strong className="text-foreground">{selectedWeek}</strong></span>
          <span>•</span>
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={isPrintDisabled}
            title={
              isPrintDisabled
                ? (hasUnsavedChanges
                    ? 'Guarda los cambios para habilitar la impresión'
                    : 'Guarda la precaptura o cierra el grupo para habilitar la impresión en PDF')
                : 'Imprimir Determinación de Fondos en PDF'
            }
            className={cn(
              "h-8 font-bold text-xs shadow-sm transition-colors",
              isPrintDisabled
                ? "bg-slate-300 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500 cursor-not-allowed opacity-60 hover:bg-slate-300"
                : "bg-[#1e3a8a] hover:bg-[#172554] text-white"
            )}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Imprimir PDF
          </Button>
        </div>
      </div>

      {/* Modal: Actualiza Comisión */}
      <Dialog open={comisionModalOpen} onOpenChange={setComisionModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#1e3a8a]" />
              Actualizar Comisiones Masivamente
            </DialogTitle>
            <DialogDescription className="text-xs">
              Aplica un porcentaje de comisión y supervisión a todos los grupos de la plaza {currentPlazaName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                % Comisión Promotora:
              </label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={bulkComisionPercent}
                onChange={(e) => setBulkComisionPercent(parseFloat(e.target.value) || 0)}
                className="font-bold text-sm h-8"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                % Supervisión:
              </label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={bulkSupervisionPercent}
                onChange={(e) => setBulkSupervisionPercent(parseFloat(e.target.value) || 0)}
                className="font-bold text-sm h-8"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setComisionModalOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleApplyBulkComision} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold h-8">
              Aplicar a Todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Actualiza Ejecutivo */}
      <Dialog open={ejecutivoModalOpen} onOpenChange={setEjecutivoModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-[#1e3a8a]" />
              Ejecutivo de la Plaza {currentPlazaName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Personal asignado y responsables de los grupos de esta plaza.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2 max-h-[300px] overflow-y-auto">
            {plazaPromotoras.map(prom => {
              const pers = personals.find(p => p.id === prom.personalId);
              const personalName = pers ? `${pers.nombre} ${pers.apellidoPaterno || ''}`.trim() : 'Sin asignar';
              return (
                <div key={prom.id} className="flex items-center justify-between p-2 rounded border bg-slate-50 dark:bg-zinc-900 text-xs">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">{prom.name}</span>
                    <span className="text-muted-foreground text-[10.5px]">Grupo / Promotora</span>
                  </div>
                  <Badge variant="outline" className="font-semibold text-xs border-slate-300 text-slate-800 dark:text-zinc-200">
                    {personalName}
                  </Badge>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setEjecutivoModalOpen(false)} className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold h-8">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
