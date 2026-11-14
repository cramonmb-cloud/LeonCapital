'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { Plaza, PrecapturaGasto } from '@/lib/types';
import { importGastosAction } from '@/app/inicio/gastos/actions';
import { FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ParsedRow {
  line: number;
  concepto: string;
  importe: number;
  observaciones?: string;
}

export function parseExcelGastosText(text: string): { results: ParsedRow[]; errors: { line: number; text: string }[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results: ParsedRow[] = [];
  const errors: { line: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Try splitting by tab first (standard Excel copy)
    let parts = rawLine.split(/\t/).map(p => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean);

    // If no tab, try splitting by 2 or more spaces
    if (parts.length < 2) {
      parts = rawLine.split(/\s{2,}/).map(p => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }

    if (parts.length >= 2) {
      const p0Clean = parts[0].replace(/[\$,\s]/g, '');
      const p1Clean = parts[1].replace(/[\$,\s]/g, '');

      const p0IsNum = !isNaN(Number(p0Clean)) && p0Clean.length > 0 && /^[0-9]+(\.[0-9]+)?$/.test(p0Clean);
      const p1IsNum = !isNaN(Number(p1Clean)) && p1Clean.length > 0 && /^[0-9]+(\.[0-9]+)?$/.test(p1Clean);

      if (p0IsNum && !p1IsNum) {
        results.push({
          line: i + 1,
          importe: Number(p0Clean),
          concepto: parts[1].toUpperCase(),
          observaciones: parts.slice(2).join(' ').trim() || undefined,
        });
        continue;
      } else if (p1IsNum && !p0IsNum) {
        results.push({
          line: i + 1,
          importe: Number(p1Clean),
          concepto: parts[0].toUpperCase(),
          observaciones: parts.slice(2).join(' ').trim() || undefined,
        });
        continue;
      }
    }

    // Fallback regex: line starts with amount (e.g. "$ 2,000.00 DESPENSA 09/11/26")
    const matchAmountFirst = rawLine.match(/^[\$]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s+(.+)$/);
    if (matchAmountFirst) {
      const numStr = matchAmountFirst[1].replace(/,/g, '');
      results.push({
        line: i + 1,
        importe: Number(numStr),
        concepto: matchAmountFirst[2].trim().toUpperCase(),
      });
      continue;
    }

    // Fallback regex: line ends with amount (e.g. "DESPENSA 09/11/26 $ 2,000.00")
    const matchConceptFirst = rawLine.match(/^(.+?)\s+[\$]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)$/);
    if (matchConceptFirst) {
      const numStr = matchConceptFirst[2].replace(/,/g, '');
      results.push({
        line: i + 1,
        importe: Number(numStr),
        concepto: matchConceptFirst[1].trim().toUpperCase(),
      });
      continue;
    }

    errors.push({ line: i + 1, text: rawLine });
  }

  return { results, errors };
}

interface ImportGastosExcelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekDate: string;
  plazas: Plaza[];
  targetPlazaId?: string;
  targetPlazaName?: string;
  onImportSuccess?: () => void;
  /**
   * Optional callback for local state sync if caller manages local state (e.g. Precaptura)
   */
  onImportLocal?: (newGastos: PrecapturaGasto[], mode: 'append' | 'replace') => void;
}

export function ImportGastosExcelDialog({
  open,
  onOpenChange,
  weekDate,
  plazas,
  targetPlazaId,
  targetPlazaName,
  onImportSuccess,
  onImportLocal,
}: ImportGastosExcelDialogProps) {
  const { toast } = useToast();
  const { appUser } = useAuth();

  const [rawText, setRawText] = useState('');
  const [selectedPlazaId, setSelectedPlazaId] = useState<string>(targetPlazaId || '');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync selectedPlazaId when targetPlazaId prop changes
  React.useEffect(() => {
    if (targetPlazaId) {
      setSelectedPlazaId(targetPlazaId);
    } else if (plazas.length > 0 && !selectedPlazaId) {
      setSelectedPlazaId(plazas[0].id);
    }
  }, [targetPlazaId, plazas, selectedPlazaId]);

  // Parse raw text
  const { results, errors } = useMemo(() => {
    if (!rawText.trim()) return { results: [], errors: [] };
    return parseExcelGastosText(rawText);
  }, [rawText]);

  const totalSum = useMemo(() => {
    return results.reduce((acc, r) => acc + r.importe, 0);
  }, [results]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  const currentPlaza = useMemo(() => {
    return plazas.find(p => p.id === selectedPlazaId);
  }, [plazas, selectedPlazaId]);

  const plazaDisplayName = targetPlazaName || currentPlaza?.name || 'Plaza seleccionada';

  const handleImport = async () => {
    if (!selectedPlazaId) {
      toast({
        title: 'Plaza requerida',
        description: 'Por favor selecciona la plaza destino para estos gastos.',
        variant: 'destructive',
      });
      return;
    }

    if (results.length === 0) {
      toast({
        title: 'Sin datos válidos',
        description: 'Pega al menos una fila con importe y concepto válidos.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Build PrecapturaGasto objects with unique IDs
      const newGastosList: PrecapturaGasto[] = results.map((r, idx) => ({
        id: `gasto_imp_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
        concepto: r.concepto,
        importe: r.importe,
        observaciones: r.observaciones,
      }));

      const res = await importGastosAction(
        selectedPlazaId,
        weekDate,
        newGastosList,
        importMode,
        currentPlaza?.name,
        appUser?.username
      );

      if (res.success) {
        if (onImportLocal) {
          onImportLocal(newGastosList, importMode);
        }
        if (onImportSuccess) {
          onImportSuccess();
        }
        toast({
          title: 'Importación exitosa',
          description: res.message || `Se importaron ${newGastosList.length} gastos.`,
        });
        setRawText('');
        onOpenChange(false);
      } else {
        toast({
          title: 'Error al importar',
          description: res.message,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error inesperado',
        description: err.message || 'Ocurrió un error al procesar la importación.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Importar Gastos desde Excel</DialogTitle>
              <DialogDescription className="text-xs">
                Copia las celdas de tu hoja de Excel (Importe y Concepto) y pégalas directamente en el cuadro de texto.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Target Plaza and Week details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/40 rounded-xl border">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground block mb-1">
                Plaza Destino:
              </Label>
              {targetPlazaId ? (
                <Badge variant="outline" className="font-bold text-xs py-1 px-3 bg-background">
                  {plazaDisplayName}
                </Badge>
              ) : (
                <Select value={selectedPlazaId} onValueChange={setSelectedPlazaId}>
                  <SelectTrigger className="h-8 text-xs font-semibold bg-background">
                    <SelectValue placeholder="Selecciona una plaza" />
                  </SelectTrigger>
                  <SelectContent>
                    {plazas.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs font-medium">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground block mb-1">
                Semana:
              </Label>
              <Badge variant="secondary" className="font-mono text-xs py-1 px-3">
                {weekDate || 'Semana seleccionada'}
              </Badge>
            </div>
          </div>

          {/* Paste area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Pega aquí el contenido de Excel:
              </Label>
              {rawText && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRawText('')}
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpiar
                </Button>
              )}
            </div>
            <Textarea
              rows={7}
              placeholder={`$2,000.00\tDESPENSA 09/11/26\n$799.00\tCASETAS QUERRETARO CD GUZMAN 05/11/26\n$1,019.00\tGASOLINA QUERETARO CD GUZMAN\n$621.00\tCASETAS CD GUZMAN QUERETARO 09/11/26\n$649.50\tGASOLINA QUERETARO CD GUZMAN 09/11/26`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="font-mono text-xs leading-relaxed resize-y border-slate-300 dark:border-zinc-700"
            />
          </div>

          {/* Parse live status & summary */}
          {results.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs">
              <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>{results.length} gastos interpretados correctamente</span>
              </div>
              <div className="font-black text-emerald-900 dark:text-emerald-200 text-sm">
                Total: {formatCurrency(totalSum)}
              </div>
            </div>
          )}

          {/* Errors alert if any */}
          {errors.length > 0 && (
            <Alert variant="destructive" className="py-2 px-3 text-xs">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {errors.length} {errors.length === 1 ? 'línea no pudo ser interpretada' : 'líneas no pudieron ser interpretadas'}:
                <div className="mt-1 font-mono text-[11px] max-h-20 overflow-y-auto space-y-0.5">
                  {errors.slice(0, 5).map(err => (
                    <div key={err.line}>Línea {err.line}: &ldquo;{err.text}&rdquo;</div>
                  ))}
                  {errors.length > 5 && (
                    <div className="text-muted-foreground italic">...y {errors.length - 5} más</div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Mode Selector */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-semibold text-muted-foreground">
              Modo de importación:
            </Label>
            <RadioGroup
              value={importMode}
              onValueChange={(v) => setImportMode(v as 'append' | 'replace')}
              className="flex items-center gap-4 text-xs"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="append" id="mode-append" />
                <Label htmlFor="mode-append" className="text-xs cursor-pointer font-medium">
                  Agregar a los gastos existentes
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replace" id="mode-replace" />
                <Label htmlFor="mode-replace" className="text-xs cursor-pointer font-medium text-amber-600 dark:text-amber-400">
                  Reemplazar gastos de esta semana
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Preview Table */}
          {results.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">
                Vista previa de los gastos a guardar ({results.length}):
              </Label>
              <div className="border rounded-md overflow-hidden max-h-48 overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead className="py-1 px-2 w-[40px] font-bold">#</TableHead>
                      <TableHead className="py-1 px-2 font-bold">Concepto</TableHead>
                      <TableHead className="py-1 px-2 font-bold text-right w-[110px]">Importe</TableHead>
                      <TableHead className="py-1 px-2 font-bold">Obs.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/30">
                        <TableCell className="py-1 px-2 text-muted-foreground font-mono text-[11px]">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="py-1 px-2 font-bold text-slate-800 dark:text-zinc-200">
                          {row.concepto}
                        </TableCell>
                        <TableCell className="py-1 px-2 text-right font-black font-mono text-slate-900 dark:text-white">
                          {formatCurrency(row.importe)}
                        </TableCell>
                        <TableCell className="py-1 px-2 text-muted-foreground text-[11px]">
                          {row.observaciones || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleImport}
            disabled={isSubmitting || results.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando en base de datos...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Importar {results.length} {results.length === 1 ? 'gasto' : 'gastos'} ({formatCurrency(totalSum)})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
