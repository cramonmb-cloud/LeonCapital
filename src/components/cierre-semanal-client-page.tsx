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
  const appName = useMemo(() => {
    return (realtime?.config?.appName || initialConfig?.appName || 'León Capital').toUpperCase();
  }, [realtime?.config?.appName, initialConfig?.appName]);

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

  // Totales de la tabla de detalle modal (estilo precaptura)
  const detailTotals = useMemo(() => {
    let debe = 0;
    let total = 0;
    let falla = 0;
    let recuperado = 0;
    let venta = 0;
    let comicion = 0;
    let supervision = 0;
    let deuda = 0;

    detailPromotoraRows.forEach(r => {
      debe += r.debeEntregar || 0;
      total += r.total || 0;
      falla += r.falla || 0;
      recuperado += r.recuperado || 0;
      venta += r.venta || 0;
      comicion += r.comicion || 0;
      supervision += r.supervision || 0;
      deuda += r.deuda || 0;
    });

    return {
      debe,
      total,
      falla,
      recuperado,
      venta,
      comicion,
      supervision,
      deuda,
    };
  }, [detailPromotoraRows]);

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
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-md border text-sm font-medium">
            <Calendar className="h-4 w-4 text-neutral-600" />
            <span className="text-neutral-700">Semana:</span>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="h-8 min-w-[220px] sm:min-w-[240px] bg-white font-medium">
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
                  ESTADO GLOBAL DE {appName}
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

              {(isGlobalClosed || companyStats.allPlazasClosed) && (
                <p className="text-sm text-neutral-600 max-w-2xl">
                  Esta semana está completamente cerrada y congelada en la base de datos. Ninguna sección recalculará sus valores.
                </p>
              )}

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

      {/* Promotoras Detail Modal (Estilo compacto y profesional de Precaptura) */}
      <Dialog open={Boolean(detailPlaza)} onOpenChange={(open) => !open && setDetailPlaza(null)}>
        <DialogContent className="max-w-5xl w-full max-h-[88vh] flex flex-col p-4 sm:p-5 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 shadow-2xl rounded-xl">
          <DialogHeader className="border-b border-slate-200 dark:border-zinc-800 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                    Grupos de {detailPlaza?.name}
                  </DialogTitle>
                  <Badge variant="outline" className="text-xs font-semibold px-2 py-0 h-5 border-slate-300 dark:border-zinc-700">
                    {detailPromotoraRows.length} Grupos
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Desglose consolidado de la semana del Sábado {formatDateLabel(selectedWeek)}
                </DialogDescription>
              </div>

              {/* Quick Summary Chips */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-xs">
                <div className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold block">Debe</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">{formatMoney(detailTotals.debe)}</span>
                </div>
                <div className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold block">Cobrado</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">{formatMoney(detailTotals.total)}</span>
                </div>
                <div className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold block">Falla</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">{formatMoney(detailTotals.falla)}</span>
                </div>
                <div className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold block">Venta</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">{formatMoney(detailTotals.venta)}</span>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Tabla de Detalle Compacta Estilo Precaptura */}
          <div className="flex-1 overflow-x-auto overflow-y-auto my-2 border border-slate-300 dark:border-zinc-800 rounded-lg shadow-sm bg-white dark:bg-zinc-950">
            <Table className="w-full table-fixed text-[11px] border-collapse">
              <TableHeader className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-300 dark:border-zinc-700 sticky top-0 z-20">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[18%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-2 text-left truncate">
                    Grupo / Promotora
                  </TableHead>
                  <TableHead className="w-[10%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Debe
                  </TableHead>
                  <TableHead className="w-[10%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Cobrado
                  </TableHead>
                  <TableHead className="w-[9%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Falla
                  </TableHead>
                  <TableHead className="w-[9%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Recup.
                  </TableHead>
                  <TableHead className="w-[9%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Venta
                  </TableHead>
                  <TableHead className="w-[9%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Comisión
                  </TableHead>
                  <TableHead className="w-[8%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Superv.
                  </TableHead>
                  <TableHead className="w-[9.5%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1.5 text-right">
                    Deuda Rest.
                  </TableHead>
                  <TableHead className="w-[8.5%] font-bold text-slate-900 dark:text-zinc-100 py-1.5 px-1 text-center">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailPromotoraRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                      No hay promotoras registradas en esta plaza.
                    </TableCell>
                  </TableRow>
                ) : (
                  detailPromotoraRows.map(row => (
                    <TableRow 
                      key={row.id} 
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors border-b border-slate-200 dark:border-zinc-800/80"
                    >
                      <TableCell className="py-1.5 px-2 font-bold text-slate-900 dark:text-zinc-100 truncate">
                        {row.name}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-medium text-slate-800 dark:text-zinc-200 font-mono">
                        {formatMoney(row.debeEntregar)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-bold text-slate-900 dark:text-white font-mono">
                        {formatMoney(row.total)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-medium text-slate-700 dark:text-zinc-300 font-mono">
                        {formatMoney(row.falla)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-medium text-slate-700 dark:text-zinc-300 font-mono">
                        {formatMoney(row.recuperado)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-medium text-slate-700 dark:text-zinc-300 font-mono">
                        {formatMoney(row.venta)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-medium text-slate-700 dark:text-zinc-300 font-mono">
                        {formatMoney(row.comicion)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-medium text-slate-700 dark:text-zinc-300 font-mono">
                        {formatMoney(row.supervision)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1.5 text-right font-semibold text-slate-900 dark:text-zinc-100 font-mono">
                        {formatMoney(row.deuda)}
                      </TableCell>
                      <TableCell className="py-1.5 px-1 text-center">
                        {row.isFrozen ? (
                          <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white text-[9.5px] font-bold px-1.5 py-0 h-4.5 rounded shadow-none">
                            CERRADO
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-[9.5px] font-bold px-1.5 py-0 h-4.5 rounded shadow-none">
                            EN VIVO
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {/* Totals Row - Matching Precaptura Style */}
                {detailPromotoraRows.length > 0 && (
                  <TableRow className="bg-slate-200 dark:bg-zinc-800 font-black border-t-2 border-slate-400 dark:border-zinc-600 text-slate-900 dark:text-white sticky bottom-0 z-20">
                    <TableCell className="py-1.5 px-2 uppercase tracking-wider text-slate-900 dark:text-white truncate">
                      TOTALES ({detailPromotoraRows.length})
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.debe)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.total)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.falla)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.recuperado)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.venta)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.comicion)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.supervision)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1.5 text-right text-slate-900 dark:text-white font-mono">
                      {formatMoney(detailTotals.deuda)}
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-center text-slate-600 dark:text-zinc-400">
                      -
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="border-t border-slate-200 dark:border-zinc-800 pt-3 flex flex-row items-center justify-between sm:justify-between">
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
              Mostrando <strong>{detailPromotoraRows.length}</strong> grupos de {detailPlaza?.name}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setDetailPlaza(null)}
              className="h-8 text-xs font-semibold px-4 border-slate-300 dark:border-zinc-700"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
