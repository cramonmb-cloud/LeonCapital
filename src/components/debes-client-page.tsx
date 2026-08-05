'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn, getSaturdayOfWeek, getMexicoNow } from '@/lib/utils';
import type { Client, LoanPlan, Loan, Plaza, Localidad, Promotora, PromotoraSettlement } from '@/lib/types';
import { saveSettlementAction, deleteSettlementAction, deleteGroupSettlementsAction } from '@/app/dashboard/debes/actions';
import { useAuth } from '@/hooks/use-auth';
import { Coins, Download, Save, Loader2, Building, MapPin, Calendar, AlertCircle, Lock, Unlock, RotateCcw } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

interface DebesClientPageProps {
  initialClients: Client[];
  initialLoanPlans: LoanPlan[];
  initialPlazas: Plaza[];
  initialLocalidades: Localidad[];
  initialPromotoras: Promotora[];
}

function parseLocalDate(dateInput: any): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
  }
  return new Date(dateInput);
}

export function DebesClientPage({
  initialClients,
  initialLoanPlans,
  initialPlazas,
  initialLocalidades,
  initialPromotoras,
}: DebesClientPageProps) {
  const { toast } = useToast();
  const { appUser } = useAuth();
  const isCristobal = appUser?.username?.toLowerCase() === 'cristobal';

  // Selected filters
  const [selectedPlaza, setSelectedPlaza] = useState<string>('');
  const [selectedLocalidad, setSelectedLocalidad] = useState<string>('');

  // Get Saturdays list where there was activity, sorted descending (newest first)
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

  const [selectedWeek, setSelectedWeek] = useState<string>('');

  // Initialize selectedWeek to the latest Saturday once
  useEffect(() => {
    if (allAvailableWeeks.length > 0 && !selectedWeek) {
      setSelectedWeek(allAvailableWeeks[0].toISOString().split('T')[0]);
    }
  }, [allAvailableWeeks, selectedWeek]);

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
    const slicedIds = plazaPromotoraIds.slice(0, 30);
    return query(loansCol, where('promotoraId', 'in', slicedIds));
  }, [plazaPromotoraIds]);

  const dynamicSettlementsQuery = useMemo(() => {
    const settlementsCol = collection(db, 'promotoraSettlements');
    if (plazaPromotoraIds.length === 0) {
      return query(settlementsCol, where('promotoraId', '==', 'NONE'));
    }
    const slicedIds = plazaPromotoraIds.slice(0, 30);
    return query(settlementsCol, where('promotoraId', 'in', slicedIds));
  }, [plazaPromotoraIds]);

  const { data: realtime } = useRealtimeData({
    clients: initialClients,
    loanPlans: initialLoanPlans,
    plazas: initialPlazas,
    localidades: initialLocalidades,
    promotoras: initialPromotoras
  }, {
    enabledCollections: ['loans', 'loanPlans', 'plazas', 'localidades', 'promotoras', 'promotoraSettlements'],
    queries: {
      loans: dynamicLoansQuery,
      promotoraSettlements: dynamicSettlementsQuery
    },
    deps: [plazaPromotoraIds]
  });

  // Local overrides for unsaved edits: promotoraId -> overrides
  const [overrides, setOverrides] = useState<Record<string, Partial<PromotoraSettlement>>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  // Track rows manually unlocked for editing (only editable by Cristobal)
  const [unlockedRows, setUnlockedRows] = useState<Record<string, boolean>>({});

  const isRowDisabled = (row: any) => {
    if (!row.isSavedInDb) return false;
    return !unlockedRows[row.id];
  };

  // Fallbacks to initial data if realtime data is not yet loaded
  const plazas = useMemo(() => realtime?.plazas || initialPlazas, [realtime?.plazas, initialPlazas]);
  const localidades = useMemo(() => realtime?.localidades || initialLocalidades, [realtime?.localidades, initialLocalidades]);
  const promotoras = useMemo(() => realtime?.promotoras || initialPromotoras, [realtime?.promotoras, initialPromotoras]);
  const loans = useMemo(() => realtime?.loans || [], [realtime?.loans]);
  const loanPlans = useMemo(() => realtime?.loanPlans || initialLoanPlans, [realtime?.loanPlans, initialLoanPlans]);
  const savedSettlements = useMemo(() => realtime?.promotoraSettlements || [], [realtime?.promotoraSettlements]);

  // Derived filter chains
  const sortedPlazas = useMemo(() => [...plazas].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [plazas]);
  const filteredLocalidades = useMemo(() => 
    localidades.filter(l => l.plazaId === selectedPlaza).sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), 
    [localidades, selectedPlaza]
  );
  const filteredPromotoras = useMemo(() => 
    promotoras.filter(p => p.localidadId === selectedLocalidad).sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), 
    [promotoras, selectedLocalidad]
  );

  const getSemanaExtraCountForPromotora = (pId: string, targetWeekStr: string) => {
    const pLoans = loans.filter(l => l.promotoraId === pId);
    const targetWeekTime = new Date(targetWeekStr + 'T00:00:00').getTime();

    let count = 0;

    pLoans.forEach(loan => {
      const plan = loanPlans.find(lp => lp.id === loan.loanPlanId);
      if (!plan) return;

      const loanSaturday = getSaturdayOfWeek(parseLocalDate(loan.startDate));
      const loanSaturdayTime = loanSaturday.getTime();
      const firstPaymentTime = loanSaturdayTime + (7 * 24 * 3600 * 1000);

      // Check if active on target week
      let isActive = true;
      if (targetWeekTime < firstPaymentTime) {
        isActive = false;
      }

      if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') {
        const lastPayment = loan.payments.length > 0
          ? loan.payments.reduce((latest, p) => parseLocalDate(p.date) > parseLocalDate(latest.date) ? p : latest)
          : null;
        if (lastPayment) {
          const payoffSaturday = getSaturdayOfWeek(parseLocalDate(lastPayment.date));
          if (payoffSaturday.getTime() < targetWeekTime) {
            isActive = false;
          }
        }
      }

      if (!isActive) return;

      const elapsedWeeks = Math.round((targetWeekTime - loanSaturdayTime) / (7 * 24 * 3600 * 1000));
      if (elapsedWeeks > plan.termInWeeks) {
        // Count fallos up to targetWeekTime
        const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
        let fallosCount = 0;

        for (let w = 1; w <= elapsedWeeks; w++) {
          const weekSaturdayTime = loanSaturdayTime + (w * 7 * 24 * 3600 * 1000);
          const paymentsInWeek = (loan.payments || []).filter(p => {
            const paymentDate = parseLocalDate(p.date);
            const paymentSaturday = getSaturdayOfWeek(paymentDate);
            return paymentSaturday.getTime() === weekSaturdayTime;
          });
          const actualPaidInWeek = paymentsInWeek.reduce((sum, p) => sum + p.amount, 0);

          if (actualPaidInWeek < weeklyPayment - 1) {
            fallosCount++;
          }
        }

        if (fallosCount >= 2) {
          count++;
        }
      }
    });

    return count;
  };

  const rows = useMemo(() => {
    if (!selectedPlaza || !selectedLocalidad || !selectedWeek) return [];

    return filteredPromotoras.map(promotora => {
      const pId = promotora.id;
      const pLoans = loans.filter(l => 
        l.promotoraId === pId && 
        (l.status === 'Active' || l.status === 'Overdue') &&
        parseLocalDate(l.startDate) >= new Date('2026-03-01T00:00:00')
      );
      if (promotora.name.toLowerCase().includes('alicia')) {
        console.log("ALICIA pLoans (Active/Overdue after 2026-03-01):", pLoans.map(l => ({ id: l.id, status: l.status, startDate: l.startDate, amount: l.amount })));
      }
      
      if (pLoans.length === 0) {
        return {
          id: `${pId}_${selectedWeek}`,
          promotoraId: pId,
          promotoraName: promotora.name,
          weekDate: selectedWeek,
          debeEntregar: 0,
          falla: 0,
          efectivo: 0,
          recuperado: 0,
          total: 0,
          diferencia: 0,
          deuda: 0,
          venta: 0,
          comicion: 0,
          comicionPercent: 8,
          abonoSemanal: 0,
          adelEnt: 0,
          adelSal: 0,
          semExt: 0,
          isDirty: false,
          isSavedInDb: false,
        };
      }

      let startSaturday = getSaturdayOfWeek(new Date('2026-07-04T00:00:00'));

      const today = getMexicoNow();
      const currentSaturday = getSaturdayOfWeek(today);
      const targetWeekDate = new Date(selectedWeek + 'T00:00:00');

      if (targetWeekDate.getTime() < startSaturday.getTime()) {
        return {
          id: `${pId}_${selectedWeek}`,
          promotoraId: pId,
          promotoraName: promotora.name,
          weekDate: selectedWeek,
          debeEntregar: 0,
          falla: 0,
          efectivo: 0,
          recuperado: 0,
          total: 0,
          diferencia: 0,
          deuda: 0,
          venta: 0,
          comicion: 0,
          comicionPercent: 8,
          abonoSemanal: 0,
          adelEnt: 0,
          adelSal: 0,
          semExt: 0,
          isDirty: false,
          isSavedInDb: false,
        };
      }

      const saturdays: Date[] = [];
      const maxDate = new Date(currentSaturday);
      const currentTemp = new Date(startSaturday);

      while (currentTemp <= maxDate) {
        saturdays.push(new Date(currentTemp));
        currentTemp.setDate(currentTemp.getDate() + 7);
      }
      const filteredSaturdays = saturdays.filter(d => d.getTime() <= currentSaturday.getTime());
      const chronoWeeks = filteredSaturdays.sort((a, b) => a.getTime() - b.getTime());

      const computedChronoRows: any[] = [];

      for (let index = 0; index < chronoWeeks.length; index++) {
        const week = chronoWeeks[index];
        const weekStr = week.toISOString().split('T')[0];
        const id = `${pId}_${weekStr}`;
        const saved = savedSettlements.find(s => s.id === id);
        
        const local = (weekStr === selectedWeek) ? (overrides[pId] || {}) : {};
        const weekTime = week.getTime();

        let realDebeEntregar = 0;
        let realFalla = 0;
        let realEfectivo = 0;
        let realRecuperado = 0;

        pLoans.forEach(loan => {
          const plan = loanPlans.find(lp => lp.id === loan.loanPlanId);
          if (!plan) return;

          const loanSaturday = getSaturdayOfWeek(parseLocalDate(loan.startDate));
          const loanSaturdayTime = loanSaturday.getTime();
          const firstPaymentTime = loanSaturdayTime + (7 * 24 * 3600 * 1000);

          const endSaturdayTime = loanSaturdayTime + (plan.termInWeeks * 7 * 24 * 3600 * 1000);
          let isActive = true;
          if (weekTime < firstPaymentTime || weekTime > endSaturdayTime) {
            isActive = false;
          }

          if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') {
            const lastPayment = loan.payments.length > 0
              ? loan.payments.reduce((latest, p) => parseLocalDate(p.date) > parseLocalDate(latest.date) ? p : latest)
              : null;
            if (lastPayment) {
              const payoffSaturday = getSaturdayOfWeek(parseLocalDate(lastPayment.date));
              if (payoffSaturday.getTime() < weekTime) {
                isActive = false;
              }
            }
          }

          const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
          const expectedForLoan = isActive ? weeklyPayment : 0;
          realDebeEntregar += expectedForLoan;

          const paymentsInWeek = (loan.payments || []).filter(p => {
            const paymentDate = parseLocalDate(p.date);
            const paymentSaturday = getSaturdayOfWeek(paymentDate);
            return paymentSaturday.getTime() === weekTime;
          });
          const actualPaidInWeek = paymentsInWeek.reduce((sum, p) => sum + p.amount, 0);

          const loanFalla = Math.max(0, expectedForLoan - actualPaidInWeek);
          const loanEfectivo = Math.min(actualPaidInWeek, expectedForLoan);
          const loanRecuperado = Math.max(0, actualPaidInWeek - expectedForLoan);

          realFalla += loanFalla;
          realEfectivo += loanEfectivo;
          realRecuperado += loanRecuperado;
        });

        const getVenta = (weekDate: Date) => {
          return pLoans
            .filter(l => getSaturdayOfWeek(parseLocalDate(l.startDate)).getTime() === weekDate.getTime())
            .reduce((sum, l) => sum + l.amount, 0);
        };

        const ventaVal = getVenta(week);
        const abonoSemanalVal = realDebeEntregar;

        let debeEntregar = 0;
        if (index === 0) {
          if (local.debeEntregar !== undefined) {
            debeEntregar = local.debeEntregar;
          } else if (saved?.debeEntregar !== undefined) {
            debeEntregar = saved.debeEntregar;
          } else {
            debeEntregar = abonoSemanalVal;
          }
        } else {
          if (local.debeEntregar !== undefined) {
            debeEntregar = local.debeEntregar;
          } else if (saved?.debeEntregar !== undefined) {
            debeEntregar = saved.debeEntregar;
          } else {
            const prevRow = computedChronoRows[index - 1];
            debeEntregar = prevRow.deuda + abonoSemanalVal + prevRow.adelEnt - prevRow.adelSal;
          }
        }

        const savedComicionPercent = saved?.comicionPercent !== undefined ? saved.comicionPercent : 8;
        const comicionPercent = local.comicionPercent !== undefined ? local.comicionPercent : savedComicionPercent;

        const defaultFalla = realFalla;
        const defaultRecuperado = realRecuperado;

        const falla = local.falla !== undefined ? local.falla : (saved?.falla !== undefined ? saved.falla : defaultFalla);
        const recuperado = local.recuperado !== undefined ? local.recuperado : (saved?.recuperado !== undefined ? saved.recuperado : defaultRecuperado);
        const adelEnt = local.adelEnt !== undefined ? local.adelEnt : (saved?.adelEnt !== undefined ? saved.adelEnt : 0);
        const adelSal = local.adelSal !== undefined ? local.adelSal : (saved?.adelSal !== undefined ? saved.adelSal : 0);

        let efectivo = debeEntregar - falla;
        if (local.efectivo !== undefined) {
          efectivo = local.efectivo;
        } else if (saved?.efectivo !== undefined) {
          efectivo = saved.efectivo;
        } else {
          efectivo = Math.max(0, debeEntregar - falla);
        }

        const total = efectivo + recuperado;
        const diferencia = efectivo - debeEntregar;
        const defaultDeudaCalc = Math.max(0, debeEntregar - efectivo);
        const deuda = local.deuda !== undefined ? local.deuda : (saved?.deuda !== undefined ? saved.deuda : defaultDeudaCalc);

        const defaultComicion = ventaVal * (comicionPercent / 100);
        const comicion = local.comicion !== undefined ? local.comicion : (saved?.comicion !== undefined ? saved.comicion : defaultComicion);

        const rowObj = {
          id,
          promotoraId: pId,
          promotoraName: promotora.name,
          weekDate: weekStr,
          debeEntregar,
          falla,
          efectivo,
          recuperado,
          total,
          diferencia,
          deuda,
          venta: ventaVal,
          comicion,
          comicionPercent,
          abonoSemanal: abonoSemanalVal,
          adelEnt,
          adelSal,
          semExt: getSemanaExtraCountForPromotora(pId, weekStr),
          isDirty: Object.keys(local).length > 0,
          isSavedInDb: !!saved,
        };

        computedChronoRows.push(rowObj);

        if (weekStr === selectedWeek) {
          return rowObj;
        }
      }

      return computedChronoRows.find(r => r.weekDate === selectedWeek) || {
        id: `${pId}_${selectedWeek}`,
        promotoraId: pId,
        promotoraName: promotora.name,
        weekDate: selectedWeek,
        debeEntregar: 0,
        falla: 0,
        efectivo: 0,
        recuperado: 0,
        total: 0,
        diferencia: 0,
        deuda: 0,
        venta: 0,
        comicion: 0,
        comicionPercent: 8,
        abonoSemanal: 0,
        adelEnt: 0,
        adelSal: 0,
        semExt: 0,
        isDirty: false,
        isSavedInDb: false,
      };
    });
  }, [selectedPlaza, selectedLocalidad, selectedWeek, filteredPromotoras, loans, savedSettlements, overrides, loanPlans]);

  const totals = useMemo(() => {
    let debeEntregar = 0;
    let falla = 0;
    let efectivo = 0;
    let recuperado = 0;
    let total = 0;
    let diferencia = 0;
    let venta = 0;
    let comicion = 0;
    let semExt = 0;

    rows.forEach(r => {
      debeEntregar += r.debeEntregar || 0;
      falla += r.falla || 0;
      efectivo += r.efectivo || 0;
      recuperado += r.recuperado || 0;
      total += r.total || 0;
      diferencia += r.diferencia || 0;
      venta += r.venta || 0;
      comicion += r.comicion || 0;
      semExt += r.semExt || 0;
    });

    const percentFalla = debeEntregar > 0 ? (falla / debeEntregar) * 100 : 0;

    return {
      debeEntregar,
      falla,
      efectivo,
      recuperado,
      total,
      diferencia,
      percentFalla,
      venta,
      comicion,
      semExt
    };
  }, [rows]);

  const handleCellChange = (pId: string, field: keyof PromotoraSettlement, value: number, debeEntregar: number) => {
    setOverrides(prev => {
      const currentOverrides = prev[pId] || {};
      const updatedOverrides: Partial<PromotoraSettlement> = {
        ...currentOverrides,
        [field]: value,
      };

      if (field === 'falla') {
        updatedOverrides.efectivo = Math.max(0, debeEntregar - value);
      } else if (field === 'efectivo') {
        updatedOverrides.falla = Math.max(0, debeEntregar - value);
      } else if (field === 'debeEntregar') {
        const currentFalla = updatedOverrides.falla !== undefined ? updatedOverrides.falla : (rows.find(r => r.promotoraId === pId)?.falla || 0);
        updatedOverrides.efectivo = Math.max(0, value - currentFalla);
      }

      if (field === 'comicionPercent') {
        const rowData = rows.find(r => r.promotoraId === pId);
        const venta = rowData ? rowData.venta : 0;
        updatedOverrides.comicion = Math.round(venta * (value / 100));
      }
      
      if (field === 'comicion') {
        const rowData = rows.find(r => r.promotoraId === pId);
        const venta = rowData ? rowData.venta : 0;
        if (venta > 0) {
          updatedOverrides.comicionPercent = Number(((value / venta) * 100).toFixed(1));
        }
      }

      return {
        ...prev,
        [pId]: updatedOverrides,
      };
    });
  };

  const handleSaveRow = async (row: any) => {
    setSavingRowId(row.id);
    try {
      const settlementData: PromotoraSettlement = {
        id: row.id,
        promotoraId: row.promotoraId,
        weekDate: row.weekDate,
        debeEntregar: row.debeEntregar,
        falla: row.falla,
        efectivo: row.efectivo,
        recuperado: row.recuperado,
        total: row.total,
        diferencia: row.diferencia,
        deuda: row.deuda,
        venta: row.venta,
        comicion: row.comicion,
        comicionPercent: row.comicionPercent,
        abonoSemanal: row.abonoSemanal,
        adelEnt: row.adelEnt,
        adelSal: row.adelSal,
      };

      const result = await saveSettlementAction(settlementData);
      if (result.success) {
        toast({ title: 'Liquidación Guardada', description: `Grupo ${row.promotoraName.toUpperCase()} guardado.` });
        
        setOverrides(prev => {
          const next = { ...prev };
          delete next[row.promotoraId];
          return next;
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    } finally {
      setSavingRowId(null);
    }
  };

  const handleResetRow = async (row: any) => {
    if (!window.confirm(`¿Estás seguro de que deseas restablecer los valores de ${row.promotoraName.toUpperCase()} para esta semana? Esto eliminará el registro guardado en la base de datos y recalculará dinámicamente todo.`)) {
      return;
    }
    setSavingRowId(row.id);
    try {
      const result = await deleteSettlementAction(row.id);
      if (result.success) {
        toast({ title: 'Liquidación Restablecida', description: `Grupo ${row.promotoraName.toUpperCase()} restablecido a automático.` });
        setOverrides(prev => {
          const next = { ...prev };
          delete next[row.promotoraId];
          return next;
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al restablecer', description: error.message });
    } finally {
      setSavingRowId(null);
    }
  };

  const handleResetGroup = async (row: any) => {
    if (!window.confirm(`¿Estás completamente seguro de que deseas restablecer TODAS las semanas del grupo ${row.promotoraName.toUpperCase()}? Esto eliminará todos los registros guardados de este grupo de la base de datos y recalculará todo el historial.`)) {
      return;
    }
    setSavingRowId(row.id);
    try {
      const result = await deleteGroupSettlementsAction(row.promotoraId);
      if (result.success) {
        toast({ title: 'Historial Restablecido', description: `Todo el historial de ${row.promotoraName.toUpperCase()} fue restablecido.` });
        setOverrides(prev => {
          const next = { ...prev };
          delete next[row.promotoraId];
          return next;
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al restablecer grupo', description: error.message });
    } finally {
      setSavingRowId(null);
    }
  };

  const formatDateStr = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleExportConsolidatedPDF = () => {
    if (rows.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }) as jsPDFWithAutoTable;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 30;
    const topMargin = 50;

    const pl = plazas.find(plaza => plaza.id === selectedPlaza);
    const l = localidades.find(loc => loc.id === selectedLocalidad);

    const plazaName = pl?.name || 'N/A';
    const localidadName = l?.name || 'N/A';

    // Title & Header Design
    doc.setFillColor(30, 41, 59); // Slate header
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('CONTROL DE PROMOTORAS - REPORTE CONSOLIDADO DE DEBES', margin, 25);

    // Metadata Block
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PLAZA:', margin, topMargin + 10);
    doc.text('LOCALIDAD:', margin, topMargin + 25);
    doc.text('SEMANA:', margin, topMargin + 40);

    doc.setFont('helvetica', 'normal');
    doc.text(plazaName.toUpperCase(), margin + 90, topMargin + 10);
    doc.text(localidadName.toUpperCase(), margin + 90, topMargin + 25);
    doc.text(formatDateStr(selectedWeek), margin + 90, topMargin + 40);

    const rightColX = pageWidth - margin - 185;
    doc.setFont('helvetica', 'bold');
    doc.text('FECHA GENERACIÓN:', rightColX, topMargin + 10);
    doc.text('TIPO DE REPORTE:', rightColX, topMargin + 25);

    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString('es-MX'), rightColX + 130, topMargin + 10);
    doc.text('CONSOLIDADO LOCALIDAD', rightColX + 130, topMargin + 25);

    // Columns matching request
    const tableHeaders = [[
      'GRUPO',
      'DEBE ENTREGAR',
      'FALLA',
      'EFECTIVO',
      'RECUPERADO',
      'TOTAL',
      'DIFERENCIA',
      '% FALLA',
      'VENTA',
      'COMISIÓN',
      'SEM EXT.'
    ]];

    const pdfDataRows = rows.map(r => [
      r.promotoraName.toUpperCase(),
      formatCurrency(r.debeEntregar),
      formatCurrency(r.falla),
      formatCurrency(r.efectivo),
      formatCurrency(r.recuperado),
      formatCurrency(r.total),
      formatCurrency(r.diferencia),
      `${r.debeEntregar > 0 ? ((r.falla / r.debeEntregar) * 100).toFixed(1) : '0.0'}%`,
      formatCurrency(r.venta),
      `${formatCurrency(r.comicion)} (${r.comicionPercent}%)`,
      r.semExt.toString()
    ]);

    // Add consolidated totals row
    pdfDataRows.push([
      'TOTAL GENERAL',
      formatCurrency(totals.debeEntregar),
      formatCurrency(totals.falla),
      formatCurrency(totals.efectivo),
      formatCurrency(totals.recuperado),
      formatCurrency(totals.total),
      formatCurrency(totals.diferencia),
      `${totals.percentFalla.toFixed(1)}%`,
      formatCurrency(totals.venta),
      formatCurrency(totals.comicion),
      totals.semExt.toString()
    ]);

    doc.autoTable({
      startY: topMargin + 55,
      head: tableHeaders,
      body: pdfDataRows,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 4,
        halign: 'center',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left', minCellWidth: 100 },
      },
      didParseCell: (data) => {
        if (data.row.index === pdfDataRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    });

    const dateFormatted = formatDateStr(selectedWeek).replace(/\//g, '-');
    const fileName = `consolidado_debes_${localidadName.toLowerCase().replace(/\s+/g, '_')}_${dateFormatted}.pdf`;

    doc.save(fileName);
    toast({
      title: 'Reporte Consolidado Exportado',
      description: `El archivo ${fileName} ha sido generado exitosamente.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Hierarchy filters */}
      <Card className="shadow-lg border-primary/10 overflow-visible bg-background">
        <CardHeader className="bg-primary/5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl text-primary-foreground shadow-sm">
              <Coins className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black text-slate-800">DEBES DE PROMOTORAS</CardTitle>
              <CardDescription className="text-xs font-semibold text-muted-foreground uppercase mt-0.5">
                Rediseño Consolidado de Liquidaciones
              </CardDescription>
            </div>
          </div>
          {selectedPlaza && selectedLocalidad && selectedWeek && rows.length > 0 && (
            <Button
              type="button"
              onClick={handleExportConsolidatedPDF}
              className="rounded-xl h-9 px-4 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-2 transition-all shadow-sm w-full sm:w-auto"
            >
              <Download className="h-4 w-4" />
              Exportar PDF Consolidado
            </Button>
          )}
        </CardHeader>
        <CardContent className="py-3 px-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Plaza */}
            <div className="space-y-1 w-full">
              <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5">
                <Building className="h-3 w-3" /> Plaza de Operación
              </label>
              <Select value={selectedPlaza} onValueChange={(val) => { setSelectedPlaza(val); setSelectedLocalidad(''); }}>
                <SelectTrigger className="rounded-xl border-2 h-9 bg-muted/20 hover:bg-muted/30 transition-colors focus:ring-primary text-xs">
                  <SelectValue placeholder="Seleccionar Plaza" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {sortedPlazas.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="uppercase font-semibold text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Localidad */}
            <div className="space-y-1 w-full">
              <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Localidad / Sector
              </label>
              <Select value={selectedLocalidad} onValueChange={setSelectedLocalidad} disabled={!selectedPlaza}>
                <SelectTrigger className="rounded-xl border-2 h-9 bg-muted/20 hover:bg-muted/30 transition-colors disabled:opacity-50 text-xs">
                  <SelectValue placeholder={selectedPlaza ? "Seleccionar Localidad" : "Plaza primero"} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {filteredLocalidades.map((l) => (
                    <SelectItem key={l.id} value={l.id} className="uppercase font-semibold text-xs">{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Semana de Consulta */}
            <div className="space-y-1 w-full">
              <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Semana de Consulta
              </label>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger className="rounded-xl border-2 h-9 bg-muted/20 hover:bg-muted/30 transition-colors text-xs">
                  <SelectValue placeholder="Seleccionar Semana" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {allAvailableWeeks.map((week) => {
                    const weekStr = week.toISOString().split('T')[0];
                    return (
                      <SelectItem key={weekStr} value={weekStr} className="font-semibold text-xs">
                        Semana del {formatDateStr(weekStr)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main calculation sheet table */}
      {selectedPlaza && selectedLocalidad && selectedWeek ? (
        <Card className="shadow-2xl border-slate-200 overflow-hidden bg-background">
          <CardHeader className="bg-slate-50 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <CardTitle className="text-xl font-bold uppercase text-slate-800">
                  Liquidación Consolidada: {formatDateStr(selectedWeek)}
                </CardTitle>
              </div>
              <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                Zona: {localidades.find(l => l.id === selectedLocalidad)?.name} ({plazas.find(p => p.id === selectedPlaza)?.name})
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {rows.length > 0 ? (
              <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow className="border-b">
                    <TableHead className="font-black text-left text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-3 h-9 min-w-[120px]">Grupo (Promotora)</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[85px]">Debe Entregar</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[75px]">Falla</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[85px]">Efectivo</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[75px]">Recuperado</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[75px]">Total</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[75px]">Diferencia</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[65px]">% Falla</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[75px]">Venta</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[120px]">Comisión</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[65px]">Sem Ext.</TableHead>
                    <TableHead className="font-black text-center text-[9px] md:text-[10px] uppercase text-slate-700 py-2 px-1 h-9 min-w-[75px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const pctFalla = row.debeEntregar > 0 ? (row.falla / row.debeEntregar) * 100 : 0;
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/10 transition-colors border-b">
                        {/* Grupo */}
                        <TableCell className="font-bold text-left text-[11px] py-2 px-3 uppercase text-slate-700">
                          {row.promotoraName}
                        </TableCell>

                        {/* Debe Entregar */}
                        <TableCell className="font-extrabold text-center text-[11px] text-slate-600 py-2 px-1 bg-slate-50/50">
                          {formatCurrency(row.debeEntregar)}
                        </TableCell>

                        {/* Falla */}
                        <TableCell className="text-center py-2 px-1">
                          <Input
                            type="number"
                            value={row.falla === 0 ? '' : row.falla}
                            onChange={(e) => handleCellChange(row.promotoraId, 'falla', Number(e.target.value), row.debeEntregar)}
                            placeholder="0"
                            disabled={isRowDisabled(row)}
                            className="h-7 w-[65px] px-0.5 text-xs text-center mx-auto rounded-lg font-semibold tracking-tighter border focus-visible:ring-red-500 disabled:opacity-85"
                          />
                        </TableCell>

                        {/* Efectivo */}
                        <TableCell className="text-center py-2 px-1">
                          <Input
                            type="number"
                            value={row.efectivo === 0 ? '' : row.efectivo}
                            onChange={(e) => handleCellChange(row.promotoraId, 'efectivo', Number(e.target.value), row.debeEntregar)}
                            placeholder="0"
                            disabled={isRowDisabled(row)}
                            className="h-7 w-[75px] px-0.5 text-xs text-center mx-auto rounded-lg font-semibold tracking-tighter border focus-visible:ring-emerald-500 disabled:opacity-85"
                          />
                        </TableCell>

                        {/* Recuperado */}
                        <TableCell className="text-center py-2 px-1">
                          <Input
                            type="number"
                            value={row.recuperado === 0 ? '' : row.recuperado}
                            onChange={(e) => handleCellChange(row.promotoraId, 'recuperado', Number(e.target.value), row.debeEntregar)}
                            placeholder="0"
                            disabled={isRowDisabled(row)}
                            className="h-7 w-[65px] px-0.5 text-xs text-center mx-auto rounded-lg font-semibold tracking-tighter border focus-visible:ring-blue-500 disabled:opacity-85"
                          />
                        </TableCell>

                        {/* Total */}
                        <TableCell className="font-extrabold text-center text-[11px] py-2 px-1 bg-slate-50/50">
                          {formatCurrency(row.total)}
                        </TableCell>

                        {/* Diferencia */}
                        <TableCell className="text-center py-2 px-1">
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                            row.diferencia < 0 ? 'bg-red-100 text-red-700' : row.diferencia > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.diferencia === 0 ? 'Ø' : formatCurrency(row.diferencia)}
                          </span>
                        </TableCell>

                        {/* % Falla */}
                        <TableCell className="font-extrabold text-center text-[10px] text-slate-500 py-2 px-1">
                          {pctFalla.toFixed(1)}%
                        </TableCell>

                        {/* Venta */}
                        <TableCell className="font-bold text-center text-[11px] text-blue-700 py-2 px-1 bg-blue-50/10">
                          {row.venta === 0 ? 'Ø' : formatCurrency(row.venta)}
                        </TableCell>

                        {/* Comisión */}
                        <TableCell className="text-center py-2 px-1">
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              value={row.comicion === 0 ? '' : row.comicion}
                              onChange={(e) => handleCellChange(row.promotoraId, 'comicion', Number(e.target.value), row.debeEntregar)}
                              placeholder="0"
                              disabled={isRowDisabled(row)}
                              className="h-7 w-[60px] px-0.5 text-xs text-center rounded-lg font-semibold tracking-tighter border disabled:opacity-85"
                            />
                            <div className="flex items-center gap-0.5 bg-slate-50 border rounded-lg px-0.5 h-7">
                              <Input
                                type="number"
                                value={row.comicionPercent === undefined ? 8 : row.comicionPercent}
                                onChange={(e) => handleCellChange(row.promotoraId, 'comicionPercent', Number(e.target.value), row.debeEntregar)}
                                disabled={isRowDisabled(row)}
                                className="h-5 w-9 text-center p-0 font-semibold tracking-tighter border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs disabled:opacity-85"
                                placeholder="8"
                              />
                              <span className="text-[9px] font-black text-slate-500 pr-0.5">%</span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Sem Ext */}
                        <TableCell className="font-bold text-center text-[11px] text-orange-600 py-2 px-1 bg-orange-50/10">
                          {row.semExt}
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-center px-1">
                          <div className="flex items-center justify-center gap-1">
                            {row.isSavedInDb && (
                              isCristobal ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setUnlockedRows(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                                  className="h-7 w-7 p-0 rounded-full hover:bg-slate-200 transition-colors"
                                  title={unlockedRows[row.id] ? "Bloquear Edición" : "Habilitar Edición (Cristobal)"}
                                >
                                  {unlockedRows[row.id] ? (
                                    <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                </Button>
                              ) : (
                                <div className="inline-flex items-center justify-center h-7 w-7 text-slate-400" title="Registro Guardado (Bloqueado)">
                                  <Lock className="h-3.5 w-3.5" />
                                </div>
                              )
                            )}
                            <Button
                              size="sm"
                              disabled={!row.isDirty || savingRowId === row.id || isRowDisabled(row)}
                              onClick={() => handleSaveRow(row)}
                              className={`rounded-full h-7 px-2.5 text-[10px] font-bold transition-all shadow-sm ${
                                row.isDirty && !isRowDisabled(row)
                                  ? 'bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                                  : 'bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed'
                              }`}
                            >
                              {savingRowId === row.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Save className="h-3 w-3 mr-1" />
                              )}
                              Guardar
                            </Button>
                            {row.isSavedInDb && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResetRow(row)}
                                  className="rounded-full h-7 px-2.5 text-[10px] font-bold transition-all border-red-200 hover:bg-red-50 hover:text-red-600 text-red-600 shadow-sm"
                                  title="Restablecer esta semana a Cálculo Automático (Borrar de BD)"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1 text-red-500" />
                                  Restablecer
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResetGroup(row)}
                                  className="rounded-full h-7 px-2.5 text-[10px] font-bold transition-all border-orange-200 hover:bg-orange-50 hover:text-orange-600 text-orange-600 shadow-sm"
                                  title="Restablecer TODAS las semanas de este grupo (Borrar de BD)"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1 text-orange-500" />
                                  Restablecer Grupo
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals Row */}
                  <TableRow className="bg-slate-100 font-extrabold border-t-2 border-slate-300 hover:bg-slate-100">
                    <TableCell className="font-bold text-left text-[11px] py-3 px-3 uppercase text-slate-700">
                      Total General
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-slate-800 py-3 px-1">
                      {formatCurrency(totals.debeEntregar)}
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-red-600 py-3 px-1">
                      {formatCurrency(totals.falla)}
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-emerald-700 py-3 px-1">
                      {formatCurrency(totals.efectivo)}
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-blue-700 py-3 px-1">
                      {formatCurrency(totals.recuperado)}
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-slate-800 py-3 px-1">
                      {formatCurrency(totals.total)}
                    </TableCell>
                    <TableCell className="text-center text-[11px] py-3 px-1">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        totals.diferencia < 0 ? 'bg-red-100 text-red-700' : totals.diferencia > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {formatCurrency(totals.diferencia)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-[10px] text-slate-500 py-3 px-1">
                      {totals.percentFalla.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-blue-700 py-3 px-1">
                      {formatCurrency(totals.venta)}
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-slate-700 py-3 px-1">
                      {formatCurrency(totals.comicion)}
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-orange-600 py-3 px-1">
                      {totals.semExt}
                    </TableCell>
                    <TableCell className="py-3 px-1" />
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <AlertCircle className="h-12 w-12 text-slate-300 mb-3" />
                <p className="font-bold text-sm">No se encontraron promotoras registradas en esta localidad.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-lg border-dashed border-slate-300 bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <Coins className="h-16 w-16 text-slate-300 mb-4 animate-pulse" />
            <h3 className="font-black text-slate-700 text-lg uppercase tracking-wide">Consulta Consolidada de Debes</h3>
            <p className="text-xs max-w-sm mt-1">Selecciona una Plaza de Operación y una Localidad / Sector en los campos superiores para cargar la liquidación grupal de la semana.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
