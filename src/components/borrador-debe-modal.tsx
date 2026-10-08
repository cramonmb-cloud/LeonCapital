'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getSaturdayOfWeek, calculatePromotoraWeeklyDebeAndAbonosSalientes } from '@/lib/utils';
import type { Plaza, Localidad, Promotora, Loan, LoanPlan } from '@/lib/types';
import { FileText, Printer, Building, MapPin, Calendar, Layers, FileSpreadsheet, Loader2, CheckSquare, Square } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

interface BorradorDebeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlazaId: string;
  selectedWeekStr: string;
  plazas: Plaza[];
  localidades: Localidad[];
  promotoras: Promotora[];
  loans: Loan[];
  loanPlans: LoanPlan[];
  allAvailableWeeks: Date[];
  config?: any;
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

function formatDateMX(dateString: string): string {
  if (!dateString) return '';
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * LÓGICA DE CÁLCULO DINÁMICO DEL "DEBE ENTREGAR", "ABONOS SALIENTES" Y "SEMANA EXTRA" EN EL BORRADOR
 * Para cada promotora/grupo dentro de las localidades seleccionadas:
 * 1. Se identifican sus préstamos activos en el sábado de la semana consultada.
 * 2. Si un préstamo tiene abonos registrados previamente como adelanto para esta semana,
 *    se contabilizan como "Abonos Salientes" y se descuentan de su Debe Entregar.
 * 3. El Debe Entregar neto es la suma de cuotas semanales menos los Abonos Salientes.
 * 4. La Semana Extra se contabiliza según la semana operativa (préstamos en su semana extra o abonados a la misma).
 */
export function calculatePromotoraDraftDebe(
  promotoraId: string,
  selectedWeekStr: string,
  allLoans: Loan[],
  allLoanPlans: LoanPlan[],
  config?: any
): { debeEntregar: number; abonosSalientes: number; cuotaBase: number; semExt: number } {
  const result = calculatePromotoraWeeklyDebeAndAbonosSalientes(
    promotoraId,
    selectedWeekStr,
    allLoans,
    allLoanPlans,
    config
  );
  return {
    debeEntregar: result.totalDebeEntregar,
    abonosSalientes: result.totalAbonosSalientes,
    cuotaBase: result.totalExpectedQuota,
    semExt: result.totalSemExt,
  };
}

export function BorradorDebeModal({
  open,
  onOpenChange,
  selectedPlazaId,
  selectedWeekStr,
  plazas,
  localidades,
  promotoras,
  loans,
  loanPlans,
  allAvailableWeeks,
  config,
}: BorradorDebeModalProps) {
  const { toast } = useToast();
  const { appUser, user } = useAuth();

  const [activeWeek, setActiveWeek] = useState<string>(selectedWeekStr || '');
  const [draftExportScope, setDraftExportScope] = useState<'plaza' | 'localidades'>('plaza');
  const [selectedLocalidadIds, setSelectedLocalidadIds] = useState<string[]>([]);
  const [draftLayoutMode, setDraftLayoutMode] = useState<'separate' | 'combined'>('separate');
  const [isGenerating, setIsGenerating] = useState(false);

  // Sync active week when prop changes
  useEffect(() => {
    if (selectedWeekStr) {
      setActiveWeek(selectedWeekStr);
    } else if (allAvailableWeeks.length > 0 && !activeWeek) {
      setActiveWeek(allAvailableWeeks[0].toISOString().split('T')[0]);
    }
  }, [selectedWeekStr, allAvailableWeeks]);

  // Localidades for current plaza
  const plazaLocalidades = useMemo(() => {
    if (!selectedPlazaId) return [];
    return localidades
      .filter((l) => l.plazaId === selectedPlazaId)
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [localidades, selectedPlazaId]);

  // Reset selected localidades when plaza changes or scope changes to plaza
  useEffect(() => {
    if (draftExportScope === 'plaza') {
      setSelectedLocalidadIds(plazaLocalidades.map((l) => l.id));
    }
  }, [draftExportScope, plazaLocalidades]);

  // Handle select all / deselect all
  const handleSelectAllLocalidades = () => {
    setSelectedLocalidadIds(plazaLocalidades.map((l) => l.id));
  };

  const handleDeselectAllLocalidades = () => {
    setSelectedLocalidadIds([]);
  };

  const toggleLocalidad = (id: string) => {
    setSelectedLocalidadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const currentPlaza = useMemo(() => plazas.find((p) => p.id === selectedPlazaId), [plazas, selectedPlazaId]);

  // Helper to fetch extra loans if needed for promotoras not covered in `loans` prop
  const fetchAllLoansForPromotoras = async (targetPromotoraIds: string[]): Promise<Loan[]> => {
    // Find missing ids
    const loadedPromotoraIds = new Set(loans.map((l) => l.promotoraId));
    const missingIds = targetPromotoraIds.filter((id) => !loadedPromotoraIds.has(id));

    if (missingIds.length === 0) {
      return loans;
    }

    const fetchedLoans: Loan[] = [...loans];
    // Chunk missingIds into batches of 30 for Firestore IN queries
    const chunkSize = 30;
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize);
      try {
        const q = query(collection(db, 'loans'), where('promotoraId', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          fetchedLoans.push({ id: docSnap.id, ...docSnap.data() } as Loan);
        });
      } catch (err) {
        console.error('Error fetching chunked loans:', err);
      }
    }

    return fetchedLoans;
  };

  const handleGeneratePDF = async () => {
    if (!selectedPlazaId || !currentPlaza) {
      toast({ variant: 'destructive', title: 'Plaza requerida', description: 'Por favor selecciona una plaza.' });
      return;
    }

    if (!activeWeek) {
      toast({ variant: 'destructive', title: 'Semana requerida', description: 'Por favor selecciona una semana de consulta.' });
      return;
    }

    if (draftExportScope === 'localidades' && selectedLocalidadIds.length === 0) {
      toast({ variant: 'destructive', title: 'Sin localidades', description: 'Selecciona al menos una localidad.' });
      return;
    }

    setIsGenerating(true);

    try {
      // Determine target localidades
      const targetLocalidades = plazaLocalidades.filter((l) =>
        draftExportScope === 'plaza' ? true : selectedLocalidadIds.includes(l.id)
      );

      // Determine target promotoras
      const targetLocalidadIds = new Set(targetLocalidades.map((l) => l.id));
      const targetPromotoras = promotoras.filter((p) => targetLocalidadIds.has(p.localidadId));

      if (targetPromotoras.length === 0) {
        toast({ variant: 'destructive', title: 'Sin promotoras', description: 'No hay promotoras en las localidades seleccionadas.' });
        setIsGenerating(false);
        return;
      }

      // Fetch all loans for these promotoras if missing
      const allTargetLoans = await fetchAllLoansForPromotoras(targetPromotoras.map((p) => p.id));

      // Calculate debe for each promotora
      const calculatedPromotoras = targetPromotoras
        .map((p) => {
          const loc = targetLocalidades.find((l) => l.id === p.localidadId);
          const metrics = calculatePromotoraDraftDebe(p.id, activeWeek, allTargetLoans, loanPlans, config);
          return {
            promotora: p,
            localidad: loc,
            localidadName: loc?.name || 'DESCONOCIDA',
            debeEntregar: metrics.debeEntregar,
            abonosSalientes: metrics.abonosSalientes,
            cuotaBase: metrics.cuotaBase,
            semExt: metrics.semExt,
          };
        })
        .filter((item) => item.debeEntregar > 0 || item.abonosSalientes > 0 || item.semExt > 0);

      if (calculatedPromotoras.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Sin cobro pendiente',
          description: 'Ninguna promotora de las localidades seleccionadas cuenta con cuotas activas para esta semana.',
        });
        setIsGenerating(false);
        return;
      }

      // PDF setup
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }) as jsPDFWithAutoTable;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 25;

      const printDateStr = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const weekDateFormatted = formatDateMX(activeWeek);
      const executiveName = (appUser?.username || user?.displayName || user?.email || 'LEON CAPITAL').toUpperCase();

      const drawInstitutionalHeader = (
        title: string,
        pageNum: number,
        coordName: string,
        ejecutivoName: string,
        plazaName: string
      ) => {
        // Top right: Fecha & Pagina
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(printDateStr, pageWidth - margin, 18, { align: 'right' });
        doc.text(`Página ${pageNum}`, pageWidth - margin, 28, { align: 'right' });

        // Top center: Separador, Titulo & Subtitulo
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text('-', pageWidth / 2, 12, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text(title, pageWidth / 2, 23, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`DEL ${weekDateFormatted}`, pageWidth / 2, 33, { align: 'center' });

        // Metadata Bar
        const metaY = 47;
        doc.setFontSize(7.5);

        // Coordinador
        doc.setFont('helvetica', 'bold');
        doc.text('Coordinador', margin, metaY);
        doc.text(coordName.toUpperCase(), margin + 55, metaY);

        // Ejecutivo
        doc.text('Ejecutivo', 300, metaY);
        doc.text(ejecutivoName.toUpperCase(), 345, metaY);

        // Plaza
        doc.text('Plaza', 600, metaY);
        doc.text(plazaName.toUpperCase(), 630, metaY);
      };

      const drawInstitutionalFooter = (finalY: number, totalDebe: number) => {
        let startY = finalY + 13;
        if (startY + 92 > pageHeight - margin) {
          doc.addPage('letter', 'landscape');
          startY = 35;
        }

        // Relación de Gastos
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        doc.text('Relación de Gastos', margin, startY);

        const labelX = 245;
        const valX = 305;
        const lineSpacing = 9.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('GASTOS', labelX, startY + 11, { align: 'right' });
        doc.text('$0.00', valX, startY + 11, { align: 'right' });

        doc.text('FONDO', labelX, startY + 11 + lineSpacing, { align: 'right' });
        doc.text('$0.00', valX, startY + 11 + lineSpacing, { align: 'right' });

        doc.text('A ENTREGAR', labelX, startY + 11 + lineSpacing * 2, { align: 'right' });
        doc.text(formatCurrency(totalDebe), valX, startY + 11 + lineSpacing * 2, { align: 'right' });

        doc.text('EXTRAS', labelX, startY + 11 + lineSpacing * 3, { align: 'right' });
        doc.text('$0.00', valX, startY + 11 + lineSpacing * 3, { align: 'right' });

        // Linea separadora antes del Gran Total
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(labelX - 45, startY + 11 + lineSpacing * 3.6, valX + 2, startY + 11 + lineSpacing * 3.6);

        // Gran Total
        doc.setFont('helvetica', 'bold');
        doc.text('GRAN TOTAL', labelX, startY + 11 + lineSpacing * 4.8, { align: 'right' });
        doc.text(formatCurrency(totalDebe), valX, startY + 11 + lineSpacing * 4.8, { align: 'right' });

        // Observaciones
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('Observaciones', 360, startY);

        // Firmas
        const sigY = startY + 68;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);

        // Firma de Entrega
        doc.line(360, sigY, 515, sigY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('Firma de Entrega', 437, sigY + 9, { align: 'center' });

        // Firma de Recibido
        doc.line(575, sigY, 730, sigY);
        doc.text('Firma de Recibido', 652, sigY + 9, { align: 'center' });
      };

      const tableHeaders = [[
        'Grupo',
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
        'Sem Ext'
      ]];

      const tableStyles = {
        font: 'helvetica' as const,
        fontSize: 6.5,
        cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
        valign: 'middle' as const,
        lineColor: [40, 40, 40] as [number, number, number],
        lineWidth: 0.4,
        textColor: [0, 0, 0] as [number, number, number],
        fillColor: [255, 255, 255] as [number, number, number],
      };

      const headStyles = {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: [0, 0, 0] as [number, number, number],
        fontStyle: 'bold' as const,
        fontSize: 6.5,
        halign: 'center' as const,
        valign: 'middle' as const,
        lineColor: [0, 0, 0] as [number, number, number],
        lineWidth: 0.5,
      };

      const footStyles = {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: [0, 0, 0] as [number, number, number],
        fontStyle: 'bold' as const,
        fontSize: 6.5,
        lineColor: [0, 0, 0] as [number, number, number],
        lineWidth: 0.5,
      };

      const columnStyles = {
        0: { halign: 'left' as const, fontStyle: 'bold' as const, cellWidth: 105 },  // Grupo
        1: { halign: 'center' as const, cellWidth: 32 },                            // %
        2: { halign: 'right' as const, cellWidth: 49 },                             // Debe Entregar
        3: { halign: 'right' as const, cellWidth: 42 },                             // Falla
        4: { halign: 'right' as const, cellWidth: 49 },                             // Efectivo
        5: { halign: 'right' as const, cellWidth: 42 },                             // Recuperado
        6: { halign: 'right' as const, cellWidth: 49 },                             // Total
        7: { halign: 'right' as const, cellWidth: 42 },                             // Diferencia
        8: { halign: 'center' as const, cellWidth: 34 },                            // %Falla
        9: { halign: 'right' as const, cellWidth: 42 },                             // Venta
        10: { halign: 'right' as const, cellWidth: 44 },                            // Comisión
        11: { halign: 'right' as const, cellWidth: 46 },                            // Supervisión
        12: { halign: 'right' as const, cellWidth: 44 },                            // Abono Ent
        13: { halign: 'right' as const, cellWidth: 50 },                            // Abono Sal
        14: { halign: 'right' as const, cellWidth: 38 },                            // Sem Ext
      };

      if (draftLayoutMode === 'combined') {
        // --- MODALIDAD: TODAS JUNTAS (CONSOLIDADO CONTINUO) ---
        calculatedPromotoras.sort((a, b) => {
          const locCompare = a.localidadName.localeCompare(b.localidadName);
          if (locCompare !== 0) return locCompare;
          return a.promotora.name.localeCompare(b.promotora.name);
        });

        drawInstitutionalHeader(
          'DETERMINACION DE FONDOS',
          1,
          'CONSOLIDADO PLAZA',
          executiveName,
          currentPlaza.name
        );

        let totalDebePlaza = 0;
        let totalAbonosSalientesPlaza = 0;
        let totalSemExtPlaza = 0;
        const pdfRows = calculatedPromotoras.map((item) => {
          totalDebePlaza += item.debeEntregar;
          totalAbonosSalientesPlaza += item.abonosSalientes;
          totalSemExtPlaza += item.semExt;
          return [
            `${item.localidadName.toUpperCase()} - ${item.promotora.name.toUpperCase()}`,
            '',
            item.debeEntregar > 0 ? formatCurrency(item.debeEntregar) : '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            item.abonosSalientes > 0 ? formatCurrency(item.abonosSalientes) : '',
            item.semExt > 0 ? formatCurrency(item.semExt) : ''
          ];
        });

        const pdfFoot = [[
          'TOTALES',
          '',
          formatCurrency(totalDebePlaza),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          totalAbonosSalientesPlaza > 0 ? formatCurrency(totalAbonosSalientesPlaza) : '',
          totalSemExtPlaza > 0 ? formatCurrency(totalSemExtPlaza) : ''
        ]];

        doc.autoTable({
          startY: 55,
          head: tableHeaders,
          body: pdfRows,
          foot: pdfFoot,
          theme: 'grid',
          styles: tableStyles,
          headStyles: headStyles,
          footStyles: footStyles,
          columnStyles: columnStyles,
          margin: { left: margin, right: margin },
        });

        const finalY = (doc as any).lastAutoTable?.finalY || 200;
        drawInstitutionalFooter(finalY, totalDebePlaza);

      } else {
        // --- MODALIDAD: HOJAS SEPARADAS (1 HOJA POR LOCALIDAD) ---
        let pageCount = 0;

        for (const loc of targetLocalidades) {
          const locPromotoras = calculatedPromotoras
            .filter((cp) => cp.localidad?.id === loc.id)
            .sort((a, b) => a.promotora.name.localeCompare(b.promotora.name));

          if (locPromotoras.length === 0) continue;

          pageCount++;
          if (pageCount > 1) {
            doc.addPage('letter', 'landscape');
          }

          drawInstitutionalHeader(
            'DETERMINACION DE FONDOS',
            pageCount,
            loc.name,
            executiveName,
            currentPlaza.name
          );

          let totalDebeLoc = 0;
          let totalAbonosSalientesLoc = 0;
          let totalSemExtLoc = 0;
          const pdfRows = locPromotoras.map((item) => {
            totalDebeLoc += item.debeEntregar;
            totalAbonosSalientesLoc += item.abonosSalientes;
            totalSemExtLoc += item.semExt;
            return [
              item.promotora.name.toUpperCase(),
              '',
              item.debeEntregar > 0 ? formatCurrency(item.debeEntregar) : '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              item.abonosSalientes > 0 ? formatCurrency(item.abonosSalientes) : '',
              item.semExt > 0 ? formatCurrency(item.semExt) : ''
            ];
          });

          const pdfFoot = [[
            'TOTALES',
            '',
            formatCurrency(totalDebeLoc),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            totalAbonosSalientesLoc > 0 ? formatCurrency(totalAbonosSalientesLoc) : '',
            totalSemExtLoc > 0 ? formatCurrency(totalSemExtLoc) : ''
          ]];

          doc.autoTable({
            startY: 55,
            head: tableHeaders,
            body: pdfRows,
            foot: pdfFoot,
            theme: 'grid',
            styles: tableStyles,
            headStyles: headStyles,
            footStyles: footStyles,
            columnStyles: columnStyles,
            margin: { left: margin, right: margin },
          });

          const finalY = (doc as any).lastAutoTable?.finalY || 200;
          drawInstitutionalFooter(finalY, totalDebeLoc);
        }
      }

      // Download PDF
      const sanitizePlaza = currentPlaza.name.toUpperCase().replace(/\s+/g, '_');
      const cleanWeekDate = weekDateFormatted.replace(/\//g, '-');
      const fileName = `DETERMINACION_FONDOS_${sanitizePlaza}_${cleanWeekDate}.pdf`;

      doc.save(fileName);

      toast({
        title: 'Borrador Generado Exitosamente',
        description: `El documento ${fileName} ha sido descargado.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      console.error('Error generando borrador PDF:', err);
      toast({
        variant: 'destructive',
        title: 'Error al generar PDF',
        description: err?.message || 'Ocurrió un error inesperado al procesar el PDF.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl p-6 bg-background shadow-2xl border-slate-200">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-md">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                BORRADOR DE DEBES
              </DialogTitle>
              <DialogDescription className="text-xs font-semibold text-muted-foreground uppercase mt-0.5">
                Generación Preventiva de Hoja de Cobranza en Campo
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Semana de Consulta Selector */}
          <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <label className="text-[11px] font-black uppercase text-slate-700 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" /> Semana de Consulta
            </label>
            <Select value={activeWeek} onValueChange={setActiveWeek}>
              <SelectTrigger className="rounded-xl border-2 h-10 bg-white hover:bg-slate-100 transition-colors text-xs font-semibold">
                <SelectValue placeholder="Seleccionar Semana" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {allAvailableWeeks.map((week) => {
                  const weekStr = week.toISOString().split('T')[0];
                  return (
                    <SelectItem key={weekStr} value={weekStr} className="font-semibold text-xs">
                      Semana del {formatDateMX(weekStr)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Sección 1: Alcance de Exportación */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                <Building className="h-4 w-4 text-primary" /> 1. Alcance de Exportación
              </Label>
              {currentPlaza && (
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full uppercase">
                  Plaza: {currentPlaza.name}
                </span>
              )}
            </div>

            <RadioGroup
              value={draftExportScope}
              onValueChange={(val: 'plaza' | 'localidades') => setDraftExportScope(val)}
              className="grid grid-cols-2 gap-3"
            >
              <div
                className={`flex items-start space-x-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  draftExportScope === 'plaza'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
                onClick={() => setDraftExportScope('plaza')}
              >
                <RadioGroupItem value="plaza" id="scope-plaza" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="scope-plaza" className="font-bold text-xs cursor-pointer block text-slate-800">
                    Plaza Completa
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Incluye todas las localidades asociadas a {currentPlaza?.name || 'la plaza'}.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start space-x-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  draftExportScope === 'localidades'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
                onClick={() => setDraftExportScope('localidades')}
              >
                <RadioGroupItem value="localidades" id="scope-localidades" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="scope-localidades" className="font-bold text-xs cursor-pointer block text-slate-800">
                    Por Localidades
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Selecciona individualmente qué localidades deseas reportar.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {/* Checklist de Localidades cuando Scope === 'localidades' */}
            {draftExportScope === 'localidades' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 animate-in fade-in-50 duration-200">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-[10px] font-bold uppercase text-slate-600">
                    Localidades Disponibles ({selectedLocalidadIds.length}/{plazaLocalidades.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllLocalidades}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <CheckSquare className="h-3 w-3" /> Todas
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllLocalidades}
                      className="text-[10px] font-bold text-muted-foreground hover:underline flex items-center gap-1"
                    >
                      <Square className="h-3 w-3" /> Ninguna
                    </button>
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {plazaLocalidades.length > 0 ? (
                    plazaLocalidades.map((loc) => {
                      const isChecked = selectedLocalidadIds.includes(loc.id);
                      const locPromCount = promotoras.filter((p) => p.localidadId === loc.id).length;
                      return (
                        <div
                          key={loc.id}
                          onClick={() => toggleLocalidad(loc.id)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs font-semibold ${
                            isChecked ? 'bg-white shadow-xs border border-primary/20 text-slate-900' : 'hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <Checkbox checked={isChecked} onCheckedChange={() => toggleLocalidad(loc.id)} />
                            <span className="uppercase font-bold">{loc.name}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">
                            {locPromCount} grupos
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground py-2 text-center">No hay localidades configuradas en esta plaza.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sección 2: Formato de Presentación */}
          <div className="space-y-3">
            <Label className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" /> 2. Formato de Presentación
            </Label>

            <RadioGroup
              value={draftLayoutMode}
              onValueChange={(val: 'separate' | 'combined') => setDraftLayoutMode(val)}
              className="grid grid-cols-2 gap-3"
            >
              <div
                className={`flex items-start space-x-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  draftLayoutMode === 'combined'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
                onClick={() => setDraftLayoutMode('combined')}
              >
                <RadioGroupItem value="combined" id="layout-combined" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                    <Label htmlFor="layout-combined" className="font-bold text-xs cursor-pointer block text-slate-800">
                      Todas Juntas
                    </Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Consolidado continuo en una sola tabla. Columna: <span className="font-bold">LOCALIDAD - PROMOTORA</span>.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start space-x-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  draftLayoutMode === 'separate'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
                onClick={() => setDraftLayoutMode('separate')}
              >
                <RadioGroupItem value="separate" id="layout-separate" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Printer className="h-3.5 w-3.5 text-primary" />
                    <Label htmlFor="layout-separate" className="font-bold text-xs cursor-pointer block text-slate-800">
                      Hojas Separadas
                    </Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    1 Hoja independiente por cada localidad con encabezado y total propio.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="border-t pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
            className="rounded-xl font-bold text-xs h-10 px-5"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleGeneratePDF}
            disabled={isGenerating || !selectedPlazaId}
            className="rounded-xl font-bold text-xs h-10 px-6 bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 shadow-md"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando PDF...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                Generar PDF Borrador
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
