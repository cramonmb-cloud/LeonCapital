'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn, getSaturdayOfWeek, getMexicoNow } from '@/lib/utils';
import type { Plaza, AppConfig, Precaptura, PrecapturaGasto } from '@/lib/types';
import { addGastoAction, removeGastoAction, getGastoConceptsAction, saveGastoConceptAction } from '@/app/inicio/gastos/actions';
import { ImportGastosExcelDialog } from '@/components/import-gastos-excel-dialog';
import { useAuth } from '@/hooks/use-auth';
import { 
  ReceiptText, FileSpreadsheet, Plus, Trash2, Calendar, Building, 
  Search, Loader2, ArrowUpDown, TrendingDown, DollarSign, Layers
} from 'lucide-react';

interface GastosClientPageProps {
  initialPlazas: Plaza[];
  initialConfig?: AppConfig | null;
}

interface EnrichedGasto extends PrecapturaGasto {
  plazaId: string;
  plazaName: string;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
};

export function GastosClientPage({
  initialPlazas,
  initialConfig,
}: GastosClientPageProps) {
  const { toast } = useToast();
  const { appUser } = useAuth();

  // Filters
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [selectedPlazaFilter, setSelectedPlazaFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Check if current week loans exist to allow next week (same logic as Debes / Precaptura)
  const [hasCurrentWeekLoans, setHasCurrentWeekLoans] = useState(false);

  useEffect(() => {
    const today = getMexicoNow();
    const currentSaturday = getSaturdayOfWeek(today);
    const startOfCurrentWeek = new Date(currentSaturday);
    startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() - 6);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    const startOfCurrentWeekStr = startOfCurrentWeek.toISOString().split('T')[0];

    const loansCol = collection(db, 'loans');
    const q = query(
      loansCol,
      where('startDate', '>=', startOfCurrentWeekStr),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasCurrentWeekLoans(!snapshot.empty);
    }, (err) => {
      console.error('Error al verificar préstamos de la semana actual:', err);
    });

    return () => unsubscribe();
  }, []);

  // Available weeks (Saturdays descending)
  const allAvailableWeeks = useMemo(() => {
    const saturdays: Date[] = [];
    const today = getMexicoNow();
    const currentSaturday = getSaturdayOfWeek(today);
    const startLimitDate = new Date('2026-07-04T00:00:00');
    const startSaturday = getSaturdayOfWeek(startLimitDate);

    let maxDate = new Date(currentSaturday);
    if (hasCurrentWeekLoans) {
      maxDate.setDate(maxDate.getDate() + 7);
    }

    const currentTemp = new Date(startSaturday);
    while (currentTemp <= maxDate) {
      saturdays.push(new Date(currentTemp));
      currentTemp.setDate(currentTemp.getDate() + 7);
    }
    return saturdays.sort((a, b) => b.getTime() - a.getTime());
  }, [hasCurrentWeekLoans]);

  // Set default week to current Saturday
  useEffect(() => {
    if (allAvailableWeeks.length > 0 && !selectedWeek) {
      const currentSatStr = getSaturdayOfWeek(getMexicoNow()).toISOString().split('T')[0];
      const hasCurrent = allAvailableWeeks.some(w => w.toISOString().split('T')[0] === currentSatStr);
      if (hasCurrent) {
        setSelectedWeek(currentSatStr);
      } else {
        setSelectedWeek(allAvailableWeeks[0].toISOString().split('T')[0]);
      }
    }
  }, [allAvailableWeeks, selectedWeek]);

  // Concepts autocomplete list
  const [gastoConcepts, setGastoConcepts] = useState<string[]>([]);
  useEffect(() => {
    getGastoConceptsAction().then(concepts => {
      if (concepts && concepts.length > 0) {
        setGastoConcepts(concepts);
      }
    });
  }, []);

  // Real-time precapturas query for selectedWeek
  const [precapturas, setPrecapturas] = useState<Precaptura[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!selectedWeek) return;

    setIsLoading(true);
    const colRef = collection(db, 'precapturas');
    const q = query(colRef, where('weekDate', '==', selectedWeek));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Precaptura[] = [];
      snapshot.forEach(docSnap => {
        docs.push({ id: docSnap.id, ...docSnap.data() } as Precaptura);
      });
      setPrecapturas(docs);
      setIsLoading(false);
    }, (err) => {
      console.error('Error fetching precapturas for gastos:', err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [selectedWeek]);

  // Flatten all gastos with plaza information
  const allGastos = useMemo(() => {
    const list: EnrichedGasto[] = [];
    precapturas.forEach(prec => {
      const plaza = initialPlazas.find(p => p.id === prec.plazaId);
      const plazaName = prec.plazaName || plaza?.name || 'Plaza';
      (prec.gastos || []).forEach(g => {
        list.push({
          ...g,
          plazaId: prec.plazaId,
          plazaName,
        });
      });
    });
    return list;
  }, [precapturas, initialPlazas]);

  // Filtered gastos by Plaza and Search query
  const filteredGastos = useMemo(() => {
    let result = allGastos;

    if (selectedPlazaFilter !== 'all') {
      result = result.filter(g => g.plazaId === selectedPlazaFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(g => 
        g.concepto.toLowerCase().includes(q) ||
        (g.observaciones && g.observaciones.toLowerCase().includes(q)) ||
        g.plazaName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allGastos, selectedPlazaFilter, searchQuery]);

  // Totals & KPI metrics
  const totalAmount = useMemo(() => {
    return filteredGastos.reduce((acc, g) => acc + (g.importe || 0), 0);
  }, [filteredGastos]);

  const countItems = filteredGastos.length;

  const averageAmount = useMemo(() => {
    return countItems > 0 ? totalAmount / countItems : 0;
  }, [totalAmount, countItems]);

  // Breakdown by plaza for the selected week
  const plazaBreakdown = useMemo(() => {
    const map: Record<string, { plazaName: string; total: number; count: number }> = {};
    allGastos.forEach(g => {
      if (!map[g.plazaId]) {
        map[g.plazaId] = { plazaName: g.plazaName, total: 0, count: 0 };
      }
      map[g.plazaId].total += g.importe || 0;
      map[g.plazaId].count += 1;
    });
    return Object.entries(map).map(([plazaId, data]) => ({
      plazaId,
      ...data,
    }));
  }, [allGastos]);

  // Quick Add Gasto form state
  const [newGastoPlazaId, setNewGastoPlazaId] = useState<string>('');
  const [newConcepto, setNewConcepto] = useState<string>('');
  const [newImporte, setNewImporte] = useState<string>('');
  const [newObservaciones, setNewObservaciones] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  // Sync quick-add plaza with selected filter if a specific plaza is selected
  useEffect(() => {
    if (selectedPlazaFilter !== 'all') {
      setNewGastoPlazaId(selectedPlazaFilter);
    } else if (initialPlazas.length > 0 && !newGastoPlazaId) {
      setNewGastoPlazaId(initialPlazas[0].id);
    }
  }, [selectedPlazaFilter, initialPlazas, newGastoPlazaId]);

  const handleQuickAdd = async () => {
    const targetPlaza = newGastoPlazaId || (selectedPlazaFilter !== 'all' ? selectedPlazaFilter : initialPlazas[0]?.id);
    if (!targetPlaza) {
      toast({
        title: 'Plaza requerida',
        description: 'Selecciona una plaza para registrar el gasto.',
        variant: 'destructive',
      });
      return;
    }

    if (!newConcepto.trim()) {
      toast({
        title: 'Concepto requerido',
        description: 'Ingresa la descripción o concepto del gasto.',
        variant: 'destructive',
      });
      return;
    }

    const imp = parseFloat(newImporte);
    if (isNaN(imp) || imp <= 0) {
      toast({
        title: 'Importe inválido',
        description: 'Ingresa un monto válido mayor a 0.',
        variant: 'destructive',
      });
      return;
    }

    setIsAdding(true);
    const cleanConcept = newConcepto.trim().toUpperCase();
    const newGasto: PrecapturaGasto = {
      id: `gasto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      concepto: cleanConcept,
      importe: imp,
      observaciones: newObservaciones.trim() || undefined,
    };

    const targetPlazaObj = initialPlazas.find(p => p.id === targetPlaza);

    try {
      const res = await addGastoAction(
        targetPlaza,
        selectedWeek,
        newGasto,
        targetPlazaObj?.name,
        appUser?.username
      );

      if (res.success) {
        toast({
          title: 'Gasto registrado',
          description: `${cleanConcept}: ${formatCurrency(imp)} en ${targetPlazaObj?.name || 'Plaza'}.`,
        });
        setNewConcepto('');
        setNewImporte('');
        setNewObservaciones('');
        saveGastoConceptAction(cleanConcept);
        if (!gastoConcepts.includes(cleanConcept)) {
          setGastoConcepts(prev => [cleanConcept, ...prev]);
        }
      } else {
        toast({
          title: 'Error al registrar',
          description: res.message,
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
      setIsAdding(false);
    }
  };

  // Delete Gasto state & handler
  const [deleteDialogGasto, setDeleteDialogGasto] = useState<EnrichedGasto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeleteGasto = async () => {
    if (!deleteDialogGasto) return;
    setIsDeleting(true);
    try {
      const res = await removeGastoAction(
        deleteDialogGasto.plazaId,
        selectedWeek,
        deleteDialogGasto.id,
        appUser?.username
      );
      if (res.success) {
        toast({
          title: 'Gasto eliminado',
          description: `Se eliminó "${deleteDialogGasto.concepto}" de ${deleteDialogGasto.plazaName}.`,
        });
        setDeleteDialogGasto(null);
      } else {
        toast({
          title: 'Error al eliminar',
          description: res.message,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Excel Import Dialog State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 pt-4 max-w-[1600px] mx-auto animate-in fade-in duration-300">
      
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 shadow-sm border border-purple-200 dark:border-purple-900">
            <ReceiptText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Gastos Operativos
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-purple-700 border-purple-300 bg-purple-50 dark:bg-purple-950/40">
                Sincronizado con Precaptura
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Consulta, registro e importación de gastos semanales de todas las plazas.
            </p>
          </div>
        </div>

        {/* Header Action Button */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsImportModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 rounded-lg shadow-sm flex items-center gap-2 active:scale-95 transition-transform"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Importar desde Excel</span>
          </Button>
        </div>
      </div>

      {/* Filter and Selection Bar */}
      <Card className="border shadow-sm bg-card/60 backdrop-blur-sm">
        <CardContent className="p-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            
            {/* Week Selector */}
            <div className="sm:col-span-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-600 shrink-0" />
              <div className="flex-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-0.5">
                  Semana de Consulta
                </label>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger className="h-8 text-xs font-semibold bg-background">
                    <SelectValue placeholder="Seleccionar semana" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
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
            </div>

            {/* Plaza Filter */}
            <div className="sm:col-span-4 flex items-center gap-2">
              <Building className="h-4 w-4 text-purple-600 shrink-0" />
              <div className="flex-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-0.5">
                  Filtrar por Plaza
                </label>
                <Select value={selectedPlazaFilter} onValueChange={setSelectedPlazaFilter}>
                  <SelectTrigger className="h-8 text-xs font-semibold bg-background">
                    <SelectValue placeholder="Todas las plazas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs font-bold text-purple-700">
                      TODAS LAS PLAZAS
                    </SelectItem>
                    {initialPlazas.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search filter */}
            <div className="sm:col-span-4 flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-0.5">
                  Buscar en Gastos
                </label>
                <Input
                  type="text"
                  placeholder="Buscar concepto u observaciones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Gastos */}
        <Card className="border-l-4 border-l-purple-600 shadow-sm bg-card">
          <CardHeader className="py-2.5 px-3.5 pb-1">
            <CardDescription className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
              Total de Gastos
            </CardDescription>
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50 font-mono">
              {formatCurrency(totalAmount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 px-3.5 text-[11px] text-muted-foreground">
            {selectedPlazaFilter === 'all' ? 'Consolidado de todas las plazas' : 'Monto de la plaza seleccionada'}
          </CardContent>
        </Card>

        {/* Registros */}
        <Card className="border-l-4 border-l-blue-600 shadow-sm bg-card">
          <CardHeader className="py-2.5 px-3.5 pb-1">
            <CardDescription className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Registros Capturados
            </CardDescription>
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50 font-mono">
              {countItems} {countItems === 1 ? 'gasto' : 'gastos'}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 px-3.5 text-[11px] text-muted-foreground">
            En la semana del {selectedWeek}
          </CardContent>
        </Card>

        {/* Promedio */}
        <Card className="border-l-4 border-l-amber-600 shadow-sm bg-card">
          <CardHeader className="py-2.5 px-3.5 pb-1">
            <CardDescription className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Promedio por Registro
            </CardDescription>
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50 font-mono">
              {formatCurrency(averageAmount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 px-3.5 text-[11px] text-muted-foreground">
            Importe medio por comprobante
          </CardContent>
        </Card>

        {/* Plaza breakdown summary */}
        <Card className="border-l-4 border-l-emerald-600 shadow-sm bg-card">
          <CardHeader className="py-2.5 px-3.5 pb-1">
            <CardDescription className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Distribución por Plaza
            </CardDescription>
            <div className="text-xs font-semibold pt-1 space-y-1">
              {plazaBreakdown.length === 0 ? (
                <span className="text-muted-foreground italic text-[11px]">Sin gastos esta semana</span>
              ) : (
                plazaBreakdown.slice(0, 2).map(pb => (
                  <div key={pb.plazaId} className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-bold truncate max-w-[110px]">{pb.plazaName}:</span>
                    <span className="font-black text-slate-900 dark:text-white">{formatCurrency(pb.total)}</span>
                  </div>
                ))
              )}
            </div>
          </CardHeader>
          {plazaBreakdown.length > 2 && (
            <CardContent className="py-0 px-3.5 text-[10px] text-muted-foreground">
              +{plazaBreakdown.length - 2} plazas más
            </CardContent>
          )}
        </Card>
      </div>

      {/* Quick Add Expense Form Card */}
      <Card className="border shadow-sm">
        <CardHeader className="py-2.5 px-3.5 border-b bg-muted/30">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-2">
            <Plus className="h-4 w-4 text-purple-600" />
            Registrar Nuevo Gasto en esta Semana
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
            
            {/* Target Plaza */}
            <div className="sm:col-span-3">
              <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                Plaza
              </label>
              <Select value={newGastoPlazaId} onValueChange={setNewGastoPlazaId}>
                <SelectTrigger className="h-8 text-xs font-semibold">
                  <SelectValue placeholder="Plaza" />
                </SelectTrigger>
                <SelectContent>
                  {initialPlazas.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Concepto with autocomplete */}
            <div className="sm:col-span-4">
              <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                Concepto / Descripción
              </label>
              <input
                list="gastos-page-conceptos-list"
                placeholder="Ej. GASOLINA QUERETARO, PAPELERIA"
                value={newConcepto}
                onChange={(e) => setNewConcepto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                }}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-sm transition-colors uppercase placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-600"
              />
              <datalist id="gastos-page-conceptos-list">
                {gastoConcepts.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {/* Importe */}
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                Importe $
              </label>
              <Input
                type="number"
                step="0.5"
                min="0"
                placeholder="0.00"
                value={newImporte}
                onChange={(e) => setNewImporte(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                }}
                className="h-8 text-xs font-bold font-mono"
              />
            </div>

            {/* Observaciones */}
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                Observaciones (Opcional)
              </label>
              <Input
                type="text"
                placeholder="Notas..."
                value={newObservaciones}
                onChange={(e) => setNewObservaciones(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                }}
                className="h-8 text-xs"
              />
            </div>

            {/* Submit button */}
            <div className="sm:col-span-1">
              <Button
                type="button"
                onClick={handleQuickAdd}
                disabled={isAdding}
                className="h-8 w-full bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs"
                title="Agregar Gasto"
              >
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Gastos Table Card */}
      <Card className="border shadow-sm">
        <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
              Gastos de la Semana {selectedWeek}
            </CardTitle>
            <CardDescription className="text-xs">
              {filteredGastos.length} {filteredGastos.length === 1 ? 'registro mostrado' : 'registros mostrados'}
              {selectedPlazaFilter !== 'all' ? ` (Filtrado por plaza)` : ''}
            </CardDescription>
          </div>
          <div className="font-mono font-black text-sm text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 px-3 py-1 rounded-lg">
            Total: {formatCurrency(totalAmount)}
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <Table className="text-xs">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="py-2.5 px-3 font-bold w-[50px] text-center">#</TableHead>
                <TableHead className="py-2.5 px-3 font-bold w-[160px]">Plaza</TableHead>
                <TableHead className="py-2.5 px-3 font-bold">Concepto</TableHead>
                <TableHead className="py-2.5 px-3 font-bold text-right w-[140px]">Importe</TableHead>
                <TableHead className="py-2.5 px-3 font-bold">Observaciones</TableHead>
                <TableHead className="py-2.5 px-3 text-center w-[60px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1 text-purple-600" />
                    Cargando gastos en tiempo real...
                  </TableCell>
                </TableRow>
              ) : filteredGastos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground font-semibold">
                    No se encontraron gastos registrados para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredGastos.map((gasto, idx) => (
                  <TableRow key={gasto.id} className="hover:bg-muted/30">
                    <TableCell className="py-2 px-3 text-center text-muted-foreground font-mono text-[11px]">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="py-2 px-3 font-semibold">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-slate-50 dark:bg-zinc-800">
                        {gasto.plazaName}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 px-3 font-black text-slate-800 dark:text-zinc-200">
                      {gasto.concepto}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-black font-mono text-slate-900 dark:text-white">
                      {formatCurrency(gasto.importe)}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-slate-600 dark:text-zinc-400">
                      {gasto.observaciones || '-'}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteDialogGasto(gasto)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-full"
                        title="Eliminar Gasto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteDialogGasto} onOpenChange={(open) => !open && setDeleteDialogGasto(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              ¿Eliminar este gasto?
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Esta acción eliminará el gasto de forma permanente y se actualizará automáticamente tanto aquí como en la Precaptura de la plaza seleccionada.
            </DialogDescription>
          </DialogHeader>

          {deleteDialogGasto && (
            <div className="p-3 bg-muted/40 rounded-lg space-y-1 text-xs border">
              <div>
                <span className="font-bold text-muted-foreground">Plaza:</span>{' '}
                <span className="font-semibold">{deleteDialogGasto.plazaName}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground">Concepto:</span>{' '}
                <span className="font-bold">{deleteDialogGasto.concepto}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground">Importe:</span>{' '}
                <span className="font-mono font-black text-destructive">{formatCurrency(deleteDialogGasto.importe)}</span>
              </div>
              {deleteDialogGasto.observaciones && (
                <div>
                  <span className="font-bold text-muted-foreground">Obs:</span>{' '}
                  <span>{deleteDialogGasto.observaciones}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogGasto(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDeleteGasto}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar Eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <ImportGastosExcelDialog
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        weekDate={selectedWeek}
        plazas={initialPlazas}
        targetPlazaId={selectedPlazaFilter !== 'all' ? selectedPlazaFilter : undefined}
      />
    </div>
  );
}
