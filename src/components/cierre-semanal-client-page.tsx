'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Lock, 
  Unlock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  Building2, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Eye, 
  Loader2, 
  ShieldCheck,
  FileCheck
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { getSaturdayOfWeek, getMexicoNow, parseLocalDate } from '@/lib/utils';
import type { 
  Plaza, 
  Localidad, 
  Promotora, 
  Loan, 
  LoanPlan, 
  PromotoraSettlement, 
  WeeklyClosure, 
  AppConfig 
} from '@/lib/types';
import { 
  executePlazaClosureAction, 
  executeGlobalClosureAction, 
  reopenPlazaClosureAction, 
  reopenGlobalClosureAction 
} from '@/app/inicio/cierre-semanal/actions';
import { computePromotoraWeekMetrics, getPreviousSaturdayStr } from '@/lib/settlement-calculator';

interface CierreSemanalClientPageProps {
  initialPlazas: Plaza[];
  initialLocalidades: Localidad[];
  initialPromotoras: Promotora[];
  initialLoanPlans: LoanPlan[];
  initialConfig: AppConfig | null;
  initialClosures: WeeklyClosure[];
}

export function CierreSemanalClientPage({
  initialPlazas,
  initialLocalidades,
  initialPromotoras,
  initialLoanPlans,
  initialConfig,
  initialClosures,
}: CierreSemanalClientPageProps) {
  const { appUser } = useAuth();
  const { toast } = useToast();

  const isAdmin = appUser?.role === 'admin' || appUser?.username?.toUpperCase() === 'CRISTOBAL';

  // Realtime Data
  const { data: realtime } = useRealtimeData(
    {
      plazas: initialPlazas,
      localidades: initialLocalidades,
      promotoras: initialPromotoras,
      loanPlans: initialLoanPlans,
      config: initialConfig,
      weeklyClosures: initialClosures,
    },
    {
      enabledCollections: ['plazas', 'localidades', 'promotoras', 'loans', 'loanPlans', 'promotoraSettlements', 'weeklyClosures', 'config'],
    }
  );

  const plazas = useMemo(() => realtime?.plazas || initialPlazas, [realtime?.plazas, initialPlazas]);
  const localidades = useMemo(() => realtime?.localidades || initialLocalidades, [realtime?.localidades, initialLocalidades]);
  const promotoras = useMemo(() => realtime?.promotoras || initialPromotoras, [realtime?.promotoras, initialPromotoras]);
  const loans = useMemo(() => realtime?.loans || [], [realtime?.loans]);
  const loanPlans = useMemo(() => realtime?.loanPlans || initialLoanPlans, [realtime?.loanPlans, initialLoanPlans]);
  const settlements = useMemo(() => realtime?.promotoraSettlements || [], [realtime?.promotoraSettlements]);
  const weeklyClosures = useMemo(() => realtime?.weeklyClosures || initialClosures, [realtime?.weeklyClosures, initialClosures]);

  // Weeks list (20 Saturdays descending)
  const availableWeeks = useMemo(() => {
    const today = getMexicoNow();
    const currentSat = getSaturdayOfWeek(today);
    const list: string[] = [];

    // Include next Saturday + current + previous 18 Saturdays
    const temp = new Date(currentSat);
    temp.setDate(temp.getDate() + 7);

    for (let i = 0; i < 22; i++) {
      list.push(temp.toISOString().split('T')[0]);
      temp.setDate(temp.getDate() - 7);
    }
    return list;
  }, []);

  const [selectedWeek, setSelectedWeek] = useState<string>(() => {
    const today = getMexicoNow();
    return getSaturdayOfWeek(today).toISOString().split('T')[0];
  });

  // Action states
  const [processingPlazaId, setProcessingPlazaId] = useState<string | null>(null);
  const [isProcessingGlobal, setIsProcessingGlobal] = useState<boolean>(false);

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'close_plaza' | 'reopen_plaza' | 'close_global' | 'reopen_global';
    plazaId?: string;
    plazaName?: string;
  }>({
    isOpen: false,
    type: 'close_plaza',
  });

  // Detail Modal
  const [detailPlaza, setDetailPlaza] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Current Week Closure Record
  const currentClosure = useMemo(() => {
    return weeklyClosures.find(c => c.weekDate === selectedWeek || c.id === selectedWeek);
  }, [weeklyClosures, selectedWeek]);

  const closedPlazaIds = useMemo(() => {
    return currentClosure?.closedPlazaIds || [];
  }, [currentClosure]);

  const isGlobalClosed = useMemo(() => {
    return Boolean(currentClosure?.isGlobalClosed);
  }, [currentClosure]);

  // Previous week string
  const prevWeekStr = useMemo(() => getPreviousSaturdayStr(selectedWeek), [selectedWeek]);

  // Index settlements by promotora for quick lookup
  const currentWeekSettlementsByProm = useMemo(() => {
    const map = new Map<string, PromotoraSettlement>();
    settlements.filter(s => s.weekDate === selectedWeek).forEach(s => map.set(s.promotoraId, s));
    return map;
  }, [settlements, selectedWeek]);

  const prevWeekSettlementsByProm = useMemo(() => {
    const map = new Map<string, PromotoraSettlement>();
    settlements.filter(s => s.weekDate === prevWeekStr).forEach(s => map.set(s.promotoraId, s));
    return map;
  }, [settlements, prevWeekStr]);

  // Compute stats per plaza for the selected week
  const plazaStats = useMemo(() => {
    return plazas.map(plaza => {
      const isPlazaClosed = closedPlazaIds.includes(plaza.id) || isGlobalClosed;
      const plazaLocIds = localidades.filter(l => l.plazaId === plaza.id).map(l => l.id);
      const plazaPromotoras = promotoras.filter(p => plazaLocIds.includes(p.localidadId));

      const closureSummary = currentClosure?.plazaClosures?.[plaza.id];

      // If closed and has stored summary, use it directly
      if (isPlazaClosed && closureSummary) {
        return {
          plazaId: plaza.id,
          plazaName: plaza.name,
          isClosed: true,
          closedAt: closureSummary.closedAt,
          closedBy: closureSummary.closedBy,
          totalPromotoras: closureSummary.totalPromotoras || plazaPromotoras.length,
          totalDebeEntregar: closureSummary.totalDebeEntregar || 0,
          totalCobrado: closureSummary.totalCobrado || 0,
          totalFalla: closureSummary.totalFalla || 0,
          totalRecuperado: closureSummary.totalRecuperado || 0,
          totalVenta: closureSummary.totalVenta || 0,
          promotoras: plazaPromotoras,
        };
      }

      // Otherwise compute totals from promotoras
      let sumDebe = 0;
      let sumCobrado = 0;
      let sumFalla = 0;
      let sumRecuperado = 0;
      let sumVenta = 0;

      plazaPromotoras.forEach(p => {
        const saved = currentWeekSettlementsByProm.get(p.id);
        if (saved) {
          sumDebe += Number(saved.debeEntregar) || 0;
          sumCobrado += Number(saved.total) || 0;
          sumFalla += Number(saved.falla) || 0;
          sumRecuperado += Number(saved.recuperado) || 0;
          sumVenta += Number(saved.venta) || 0;
        } else {
          // Dynamic calculation
          const prevS = prevWeekSettlementsByProm.get(p.id);
          const computed = computePromotoraWeekMetrics({
            promotoraId: p.id,
            promotoraName: p.name,
            targetWeekStr: selectedWeek,
            loans,
            loanPlans,
            config: realtime?.config,
            prevSettlement: prevS,
          });
          sumDebe += computed.debeEntregar;
          sumCobrado += computed.total;
          sumFalla += computed.falla;
          sumRecuperado += computed.recuperado;
          sumVenta += computed.venta;
        }
      });

      return {
        plazaId: plaza.id,
        plazaName: plaza.name,
        isClosed: isPlazaClosed,
        closedAt: closureSummary?.closedAt,
        closedBy: closureSummary?.closedBy,
        totalPromotoras: plazaPromotoras.length,
        totalDebeEntregar: sumDebe,
        totalCobrado: sumCobrado,
        totalFalla: sumFalla,
        totalRecuperado: sumRecuperado,
        totalVenta: sumVenta,
        promotoras: plazaPromotoras,
      };
    });
  }, [
    plazas, 
    localidades, 
    promotoras, 
    closedPlazaIds, 
    isGlobalClosed, 
    currentClosure, 
    currentWeekSettlementsByProm, 
    prevWeekSettlementsByProm, 
    selectedWeek, 
    loans, 
    loanPlans, 
    realtime?.config
  ]);

  // Overall Global Stats for the week
  const companyStats = useMemo(() => {
    let closedCount = 0;
    let totalDebe = 0;
    let totalCobrado = 0;
    let totalFalla = 0;
    let totalRecuperado = 0;
    let totalVenta = 0;
    let totalPromotoras = 0;

    plazaStats.forEach(p => {
      if (p.isClosed) closedCount++;
      totalDebe += p.totalDebeEntregar;
      totalCobrado += p.totalCobrado;
      totalFalla += p.totalFalla;
      totalRecuperado += p.totalRecuperado;
      totalVenta += p.totalVenta;
      totalPromotoras += p.totalPromotoras;
    });

    return {
      totalPlazas: plazaStats.length,
      closedPlazasCount: closedCount,
      allPlazasClosed: plazaStats.length > 0 && closedCount === plazaStats.length,
      totalDebe,
      totalCobrado,
      totalFalla,
      totalRecuperado,
      totalVenta,
      totalPromotoras,
    };
  }, [plazaStats]);

  // Detail Modal Promotoras List
  const detailPromotoraRows = useMemo(() => {
    if (!detailPlaza) return [];

    const plazaLocIds = localidades.filter(l => l.plazaId === detailPlaza.id).map(l => l.id);
    const pPromotoras = promotoras.filter(p => plazaLocIds.includes(p.localidadId));

    return pPromotoras.map(p => {
      const saved = currentWeekSettlementsByProm.get(p.id);
      if (saved) {
        return {
          id: p.id,
          name: p.name,
          debeEntregar: saved.debeEntregar,
          total: saved.total,
          falla: saved.falla,
          recuperado: saved.recuperado,
          venta: saved.venta,
          comicion: saved.comicion,
          supervision: saved.supervision || 0,
          deuda: saved.deuda,
          isFrozen: Boolean(saved.isClosed),
        };
      }

      const prevS = prevWeekSettlementsByProm.get(p.id);
      const computed = computePromotoraWeekMetrics({
        promotoraId: p.id,
        promotoraName: p.name,
        targetWeekStr: selectedWeek,
        loans,
        loanPlans,
        config: realtime?.config,
        prevSettlement: prevS,
      });

      return {
        id: p.id,
        name: p.name,
        debeEntregar: computed.debeEntregar,
        total: computed.total,
        falla: computed.falla,
        recuperado: computed.recuperado,
        venta: computed.venta,
        comicion: computed.comicion,
        supervision: computed.supervision || 0,
        deuda: computed.deuda,
        isFrozen: false,
      };
    });
  }, [detailPlaza, localidades, promotoras, currentWeekSettlementsByProm, prevWeekSettlementsByProm, selectedWeek, loans, loanPlans, realtime?.config]);

  // Handlers
  const handleConfirmAction = async () => {
    const username = appUser?.username || 'Usuario';
    const { type, plazaId } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: 'close_plaza' });

    try {
      if (type === 'close_plaza' && plazaId) {
        setProcessingPlazaId(plazaId);
        const res = await executePlazaClosureAction({
          plazaId,
          weekDate: selectedWeek,
          username,
        });
        if (res.success) {
          toast({ title: 'Plaza Cerrada', description: res.message });
        } else {
          toast({ title: 'Error', description: res.message, variant: 'destructive' });
        }
      } else if (type === 'reopen_plaza' && plazaId) {
        setProcessingPlazaId(plazaId);
        const res = await reopenPlazaClosureAction({
          plazaId,
          weekDate: selectedWeek,
          username,
        });
        if (res.success) {
          toast({ title: 'Plaza Reabierta', description: res.message });
        } else {
          toast({ title: 'Error', description: res.message, variant: 'destructive' });
        }
      } else if (type === 'close_global') {
        setIsProcessingGlobal(true);
        const res = await executeGlobalClosureAction({
          weekDate: selectedWeek,
          username,
        });
        if (res.success) {
          toast({ title: 'Cierre Global Exitoso', description: res.message });
        } else {
          toast({ title: 'Error', description: res.message, variant: 'destructive' });
        }
      } else if (type === 'reopen_global') {
        setIsProcessingGlobal(true);
        const res = await reopenGlobalClosureAction({
          weekDate: selectedWeek,
          username,
        });
        if (res.success) {
          toast({ title: 'Semana Reabierta', description: res.message });
        } else {
          toast({ title: 'Error', description: res.message, variant: 'destructive' });
        }
      }
    } catch (err: any) {
      toast({ title: 'Error inesperado', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingPlazaId(null);
      setIsProcessingGlobal(false);
    }
  };

  const formatMoney = (val: number) => {
    return (val || 0).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    });
  };

  const formatDateLabel = (isoDate: string) => {
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      return `${day}/${month}/${year}`;
    }
    return isoDate;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Week Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Cierre Semanal
          </h1>
          <p className="text-sm text-neutral-500">
            Consolida y congela definitivamente los datos de cobranza, fallas, debes y liquidaciones semanales.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-md border text-sm font-medium">
            <Calendar className="h-4 w-4 text-neutral-600" />
            <span className="text-neutral-700">Semana:</span>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="h-8 w-[160px] bg-white font-medium">
                <SelectValue placeholder="Selecciona semana" />
              </SelectTrigger>
              <SelectContent>
                {availableWeeks.map(weekStr => (
                  <SelectItem key={weekStr} value={weekStr}>
                    Sábado {formatDateLabel(weekStr)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Global Status Banner Card */}
      <Card className="border shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Estado Global de la Empresa
                </span>
                {isGlobalClosed || companyStats.allPlazasClosed ? (
                  <Badge className="bg-emerald-700 text-white hover:bg-emerald-700 gap-1 font-semibold px-2.5 py-0.5">
                    <Lock className="h-3.5 w-3.5" />
                    SEMANA CERRADA GLOBALMENTE
                  </Badge>
                ) : companyStats.closedPlazasCount > 0 ? (
                  <Badge className="bg-amber-600 text-white hover:bg-amber-600 gap-1 font-semibold px-2.5 py-0.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    PARCIALMENTE CERRADA ({companyStats.closedPlazasCount} de {companyStats.totalPlazas})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-neutral-700 border-neutral-300 gap-1 font-semibold px-2.5 py-0.5">
                    <Unlock className="h-3.5 w-3.5 text-neutral-500" />
                    SEMANA ABIERTA (EN CURSO)
                  </Badge>
                )}
              </div>

              <p className="text-sm text-neutral-600 max-w-2xl">
                {isGlobalClosed || companyStats.allPlazasClosed
                  ? 'Esta semana está completamente cerrada y congelada en la base de datos. Ninguna sección recalculará sus valores.'
                  : 'Al cerrar la semana, todos los saldos, abonos, fallas y debes de cada promotora se guardan permanentemente en la base de datos, garantizando consultas instantáneas sin recálculos continuos.'}
              </p>

              {currentClosure?.globalClosedAt && (
                <p className="text-xs text-neutral-400">
                  Cerrado globalmente el {new Date(currentClosure.globalClosedAt).toLocaleString('es-MX')} por {currentClosure.globalClosedBy || 'Administrador'}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isAdmin && (
                <>
                  {isGlobalClosed || companyStats.allPlazasClosed ? (
                    <Button
                      variant="outline"
                      className="border-neutral-300 text-neutral-700 hover:bg-neutral-100 font-medium h-10 px-4 gap-2"
                      disabled={isProcessingGlobal}
                      onClick={() => setConfirmDialog({
                        isOpen: true,
                        type: 'reopen_global',
                      })}
                    >
                      {isProcessingGlobal ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 text-neutral-600" />}
                      Reabrir Toda la Semana
                    </Button>
                  ) : (
                    <Button
                      className="bg-[#1e3a8a] hover:bg-[#172554] text-white font-medium h-10 px-5 gap-2 shadow-sm"
                      disabled={isProcessingGlobal}
                      onClick={() => setConfirmDialog({
                        isOpen: true,
                        type: 'close_global',
                      })}
                    >
                      {isProcessingGlobal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      Cerrar Toda la Semana
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t">
            <div className="p-3 rounded-lg border bg-neutral-50/70">
              <span className="text-xs text-neutral-500 font-medium block">Plazas Cerradas</span>
              <span className="text-lg font-bold text-neutral-900 mt-0.5 block">
                {companyStats.closedPlazasCount} / {companyStats.totalPlazas}
              </span>
              <span className="text-[11px] text-neutral-500">{companyStats.totalPromotoras} Grupos en total</span>
            </div>

            <div className="p-3 rounded-lg border bg-neutral-50/70">
              <span className="text-xs text-neutral-500 font-medium block">Debe Entregar</span>
              <span className="text-lg font-bold text-neutral-900 mt-0.5 block font-mono">
                {formatMoney(companyStats.totalDebe)}
              </span>
              <span className="text-[11px] text-neutral-500">Cobranza esperada</span>
            </div>

            <div className="p-3 rounded-lg border bg-neutral-50/70">
              <span className="text-xs text-neutral-500 font-medium block">Total Cobrado</span>
              <span className="text-lg font-bold text-neutral-900 mt-0.5 block font-mono">
                {formatMoney(companyStats.totalCobrado)}
              </span>
              <span className="text-[11px] text-neutral-500">Efectivo + Recuperado</span>
            </div>

            <div className="p-3 rounded-lg border bg-neutral-50/70">
              <span className="text-xs text-neutral-500 font-medium block">Falla Total</span>
              <span className="text-lg font-bold text-neutral-900 mt-0.5 block font-mono">
                {formatMoney(companyStats.totalFalla)}
              </span>
              <span className="text-[11px] text-neutral-500">Cartera no ingresada</span>
            </div>

            <div className="p-3 rounded-lg border bg-neutral-50/70">
              <span className="text-xs text-neutral-500 font-medium block">Recuperado</span>
              <span className="text-lg font-bold text-neutral-900 mt-0.5 block font-mono">
                {formatMoney(companyStats.totalRecuperado)}
              </span>
              <span className="text-[11px] text-neutral-500">Abonos a fallas previas</span>
            </div>

            <div className="p-3 rounded-lg border bg-neutral-50/70">
              <span className="text-xs text-neutral-500 font-medium block">Ventas Nuevas</span>
              <span className="text-lg font-bold text-neutral-900 mt-0.5 block font-mono">
                {formatMoney(companyStats.totalVenta)}
              </span>
              <span className="text-[11px] text-neutral-500">Colocación semanal</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plazas Management Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">
              Control de Cierre por Plaza
            </h2>
            <p className="text-xs text-neutral-500">
              Puedes cerrar o reabrir cada plaza de forma independiente según el avance de liquidación.
            </p>
          </div>
        </div>

        <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-neutral-50/80">
              <TableRow>
                <TableHead className="w-[180px] font-semibold text-neutral-700">Plaza</TableHead>
                <TableHead className="w-[130px] font-semibold text-neutral-700">Estado</TableHead>
                <TableHead className="text-center font-semibold text-neutral-700">Grupos</TableHead>
                <TableHead className="text-right font-semibold text-neutral-700">Debe Entregar</TableHead>
                <TableHead className="text-right font-semibold text-neutral-700">Total Cobrado</TableHead>
                <TableHead className="text-right font-semibold text-neutral-700">Falla</TableHead>
                <TableHead className="text-right font-semibold text-neutral-700">Recuperado</TableHead>
                <TableHead className="text-right font-semibold text-neutral-700">Ventas</TableHead>
                <TableHead className="text-right font-semibold text-neutral-700">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plazaStats.map(plaza => {
                const isBusy = processingPlazaId === plaza.plazaId || isProcessingGlobal;

                return (
                  <TableRow key={plaza.plazaId} className="hover:bg-neutral-50/50">
                    <TableCell className="font-semibold text-neutral-900">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-neutral-500" />
                        <span>{plaza.plazaName}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {plaza.isClosed ? (
                        <div className="space-y-0.5">
                          <Badge className="bg-emerald-700 text-white hover:bg-emerald-700 gap-1 text-[11px] font-semibold px-2 py-0.5">
                            <Lock className="h-3 w-3" />
                            CERRADA
                          </Badge>
                          {plaza.closedAt && (
                            <span className="text-[10px] text-neutral-400 block truncate max-w-[130px]" title={new Date(plaza.closedAt).toLocaleString('es-MX')}>
                              {new Date(plaza.closedAt).toLocaleDateString('es-MX')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-neutral-600 border-neutral-300 gap-1 text-[11px] font-semibold px-2 py-0.5">
                          <Unlock className="h-3 w-3 text-neutral-400" />
                          ABIERTA
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-center font-medium text-neutral-700">
                      {plaza.totalPromotoras}
                    </TableCell>

                    <TableCell className="text-right font-mono font-medium text-neutral-900">
                      {formatMoney(plaza.totalDebeEntregar)}
                    </TableCell>

                    <TableCell className="text-right font-mono font-semibold text-neutral-900">
                      {formatMoney(plaza.totalCobrado)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-neutral-700">
                      {formatMoney(plaza.totalFalla)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-neutral-700">
                      {formatMoney(plaza.totalRecuperado)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-neutral-700">
                      {formatMoney(plaza.totalVenta)}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-neutral-600 hover:text-neutral-900"
                          onClick={() => setDetailPlaza({ id: plaza.plazaId, name: plaza.plazaName })}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Detalle
                        </Button>

                        {isAdmin && (
                          <>
                            {plaza.isClosed ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 border-neutral-300 text-neutral-700 hover:bg-neutral-100 font-medium"
                                disabled={isBusy}
                                onClick={() => setConfirmDialog({
                                  isOpen: true,
                                  type: 'reopen_plaza',
                                  plazaId: plaza.plazaId,
                                  plazaName: plaza.plazaName,
                                })}
                              >
                                {isBusy && processingPlazaId === plaza.plazaId ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5 mr-1 text-neutral-600" />
                                )}
                                Reabrir
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-8 px-3 bg-[#1e3a8a] hover:bg-[#172554] text-white font-medium shadow-none"
                                disabled={isBusy}
                                onClick={() => setConfirmDialog({
                                  isOpen: true,
                                  type: 'close_plaza',
                                  plazaId: plaza.plazaId,
                                  plazaName: plaza.plazaName,
                                })}
                              >
                                {isBusy && processingPlazaId === plaza.plazaId ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 mr-1" />
                                )}
                                Cerrar Plaza
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog 
        open={confirmDialog.isOpen} 
        onOpenChange={(open) => !open && setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-neutral-900">
              {confirmDialog.type.includes('close') ? (
                <>
                  <Lock className="h-5 w-5 text-[#1e3a8a]" />
                  {confirmDialog.type === 'close_global' 
                    ? '¿Cerrar toda la semana global?' 
                    : `¿Cerrar plaza ${confirmDialog.plazaName}?`}
                </>
              ) : (
                <>
                  <RotateCcw className="h-5 w-5 text-neutral-700" />
                  {confirmDialog.type === 'reopen_global' 
                    ? '¿Reabrir toda la semana global?' 
                    : `¿Reabrir plaza ${confirmDialog.plazaName}?`}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm text-neutral-600 pt-2">
              {confirmDialog.type === 'close_global' && (
                <>
                  Al cerrar toda la semana, se calcularán y guardarán permanentemente en la base de datos 
                  todos los debes, cobranzas, fallas y ventas de <strong>todas las plazas y promotoras</strong> para el <strong>sábado {formatDateLabel(selectedWeek)}</strong>.
                  <br /><br />
                  A partir de ese momento, el sistema leerá los datos directamente sin hacer cálculos pesados.
                </>
              )}
              {confirmDialog.type === 'close_plaza' && (
                <>
                  Se congelarán y guardarán los datos definitivos de liquidación de todas las promotoras 
                  de la plaza <strong>{confirmDialog.plazaName}</strong> para la semana del <strong>sábado {formatDateLabel(selectedWeek)}</strong>.
                </>
              )}
              {confirmDialog.type === 'reopen_global' && (
                <>
                  Se removerá el estado de cierre de todas las plazas para la semana del <strong>sábado {formatDateLabel(selectedWeek)}</strong>, 
                  permitiendo a los supervisores realizar ajustes adicionales en Precaptura o Debes.
                </>
              )}
              {confirmDialog.type === 'reopen_plaza' && (
                <>
                  Se desbloqueará la plaza <strong>{confirmDialog.plazaName}</strong> para la semana del <strong>sábado {formatDateLabel(selectedWeek)}</strong> para permitir correcciones.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            >
              Cancelar
            </Button>
            <Button
              className={confirmDialog.type.includes('close') ? 'bg-[#1e3a8a] hover:bg-[#172554] text-white' : 'bg-neutral-800 hover:bg-neutral-900 text-white'}
              onClick={handleConfirmAction}
            >
              {confirmDialog.type.includes('close') ? 'Confirmar Cierre' : 'Confirmar Reapertura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promotoras Detail Modal */}
      <Dialog open={Boolean(detailPlaza)} onOpenChange={(open) => !open && setDetailPlaza(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-neutral-900">
                  Grupos de {detailPlaza?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500">
                  Desglose de promotoras para la semana del sábado {formatDateLabel(selectedWeek)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto my-3 border rounded-md">
            <Table>
              <TableHeader className="bg-neutral-50 sticky top-0">
                <TableRow>
                  <TableHead className="font-semibold text-neutral-700">Promotora</TableHead>
                  <TableHead className="text-right font-semibold text-neutral-700">Debe</TableHead>
                  <TableHead className="text-right font-semibold text-neutral-700">Cobrado</TableHead>
                  <TableHead className="text-right font-semibold text-neutral-700">Falla</TableHead>
                  <TableHead className="text-right font-semibold text-neutral-700">Recup.</TableHead>
                  <TableHead className="text-right font-semibold text-neutral-700">Venta</TableHead>
                  <TableHead className="text-right font-semibold text-neutral-700">Comisión</TableHead>
                  <TableHead className="text-right font-semibold text-neutral-700">Deuda Rest.</TableHead>
                  <TableHead className="text-center font-semibold text-neutral-700">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailPromotoraRows.map(row => (
                  <TableRow key={row.id} className="hover:bg-neutral-50/50">
                    <TableCell className="font-medium text-neutral-900">{row.name}</TableCell>
                    <TableCell className="text-right font-mono text-neutral-900">{formatMoney(row.debeEntregar)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-neutral-900">{formatMoney(row.total)}</TableCell>
                    <TableCell className="text-right font-mono text-neutral-600">{formatMoney(row.falla)}</TableCell>
                    <TableCell className="text-right font-mono text-neutral-600">{formatMoney(row.recuperado)}</TableCell>
                    <TableCell className="text-right font-mono text-neutral-600">{formatMoney(row.venta)}</TableCell>
                    <TableCell className="text-right font-mono text-neutral-600">{formatMoney(row.comicion)}</TableCell>
                    <TableCell className="text-right font-mono text-neutral-800">{formatMoney(row.deuda)}</TableCell>
                    <TableCell className="text-center">
                      {row.isFrozen ? (
                        <Badge className="bg-emerald-700 text-white text-[10px] px-1.5 py-0 font-normal">
                          Guardado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-neutral-500 text-[10px] px-1.5 py-0 font-normal">
                          En vivo
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="border-t pt-3 flex justify-between items-center sm:justify-between">
            <span className="text-xs text-neutral-500">
              Total de promotoras: <strong>{detailPromotoraRows.length}</strong>
            </span>
            <Button variant="outline" onClick={() => setDetailPlaza(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
