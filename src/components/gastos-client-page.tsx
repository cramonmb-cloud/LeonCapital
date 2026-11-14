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
import { getSaturdayOfWeek, getMexicoNow } from '@/lib/utils';
import type { Plaza, AppConfig, Precaptura, PrecapturaGasto } from '@/lib/types';
import { addGastoAction, removeGastoAction, getGastoConceptsAction, saveGastoConceptAction } from '@/app/inicio/gastos/actions';
import { ImportGastosExcelDialog } from '@/components/import-gastos-excel-dialog';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

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

  // Check if current week loans exist to allow next week
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
    <div className="flex-1 space-y-4 p-4 md:p-6 pt-4 max-w-[1600px] mx-auto">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Gastos
          </h1>
          <p className="text-xs text-muted-foreground">
            Consulta, registro e importación de gastos semanales por plaza sincronizados con Precaptura.
          </p>
        </div>

        {/* Header Action Button */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="text-xs h-8 px-3 font-medium"
          >
            Importar desde Excel
          </Button>
        </div>
      </div>

      {/* Filter and Selection Bar */}
      <Card className="border shadow-none">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            
            {/* Week Selector */}
            <div className="sm:col-span-4">
              <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
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

            {/* Plaza Filter */}
            <div className="sm:col-span-4">
              <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                Filtrar por Plaza
              </label>
              <Select value={selectedPlazaFilter} onValueChange={setSelectedPlazaFilter}>
                <SelectTrigger className="h-8 text-xs font-semibold bg-background">
                  <SelectValue placeholder="Todas las plazas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">
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

            {/* Search filter */}
            <div className="sm:col-span-4">
              <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
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
        </CardContent>
      </Card>

      {/* KPI Summary Cards: Only Total de Gastos & Registros Capturados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Total Gastos */}
        <Card className="shadow-none border">
          <CardHeader className="py-2.5 px-3.5 pb-1">
            <CardDescription className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total de Gastos
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {formatCurrency(totalAmount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 px-3.5 text-[11px] text-muted-foreground">
            {selectedPlazaFilter === 'all' ? 'Consolidado de todas las plazas' : 'Monto de la plaza seleccionada'}
          </CardContent>
        </Card>

        {/* Registros */}
        <Card className="shadow-none border">
          <CardHeader className="py-2.5 px-3.5 pb-1">
            <CardDescription className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Registros Capturados
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {countItems} {countItems === 1 ? 'gasto' : 'gastos'}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 px-3.5 text-[11px] text-muted-foreground">
            En la semana del {selectedWeek}
          </CardContent>
        </Card>
      </div>

      {/* Quick Add Expense Form Card */}
      <Card className="border shadow-none">
        <CardHeader className="py-2.5 px-3.5 border-b bg-muted/20">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
            Registrar Gasto
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
                placeholder="EJ. GASOLINA QUERETARO, PAPELERIA"
                value={newConcepto}
                onChange={(e) => setNewConcepto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                }}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold transition-colors uppercase placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                className="h-8 w-full font-bold text-xs"
              >
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Gastos Table Card */}
      <Card className="border shadow-none">
        <CardHeader className="py-2.5 px-4 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
              Gastos de la Semana {selectedWeek}
            </CardTitle>
            <CardDescription className="text-xs">
              {filteredGastos.length} {filteredGastos.length === 1 ? 'registro' : 'registros'}
              {selectedPlazaFilter !== 'all' ? ` (Plaza seleccionada)` : ''}
            </CardDescription>
          </div>
          <div className="font-mono font-bold text-xs bg-muted px-2.5 py-1 rounded border">
            Total: {formatCurrency(totalAmount)}
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <Table className="text-xs">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="py-2 px-3 font-bold w-[40px] text-center">#</TableHead>
                <TableHead className="py-2 px-3 font-bold w-[160px]">Plaza</TableHead>
                <TableHead className="py-2 px-3 font-bold">Concepto</TableHead>
                <TableHead className="py-2 px-3 font-bold text-right w-[140px]">Importe</TableHead>
                <TableHead className="py-2 px-3 font-bold">Observaciones</TableHead>
                <TableHead className="py-2 px-3 text-center w-[70px]">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-muted-foreground" />
                    Cargando gastos...
                  </TableCell>
                </TableRow>
              ) : filteredGastos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground font-medium">
                    No hay gastos registrados para la semana y filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredGastos.map((gasto, idx) => (
                  <TableRow key={gasto.id} className="hover:bg-muted/20">
                    <TableCell className="py-2 px-3 text-center text-muted-foreground font-mono text-[11px]">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="py-2 px-3 font-medium">
                      <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wider">
                        {gasto.plazaName}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 px-3 font-bold text-foreground">
                      {gasto.concepto}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-bold font-mono text-foreground">
                      {formatCurrency(gasto.importe)}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-muted-foreground">
                      {gasto.observaciones || '-'}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteDialogGasto(gasto)}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Eliminar
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
            <DialogTitle className="text-base font-bold">
              Eliminar gasto
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Esta acción eliminará el gasto de forma permanente tanto aquí como en Precaptura.
            </DialogDescription>
          </DialogHeader>

          {deleteDialogGasto && (
            <div className="p-3 bg-muted/30 rounded-lg space-y-1 text-xs border">
              <div>
                <span className="font-bold text-muted-foreground">Plaza:</span>{' '}
                <span>{deleteDialogGasto.plazaName}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground">Concepto:</span>{' '}
                <span className="font-bold">{deleteDialogGasto.concepto}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground">Importe:</span>{' '}
                <span className="font-mono font-bold">{formatCurrency(deleteDialogGasto.importe)}</span>
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
              variant="default"
              size="sm"
              onClick={confirmDeleteGasto}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar
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
