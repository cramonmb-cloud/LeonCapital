'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { useAuth } from '@/hooks/use-auth';
import { 
  BarChart3, Calendar, Building, Search, Download, 
  Printer, Eye, CheckCircle2, AlertCircle, Clock,
  ArrowUpDown, Filter, RefreshCw, DollarSign, TrendingUp,
  Coins, FileSpreadsheet
} from 'lucide-react';
import { cn, getSaturdayOfWeek, getMexicoNow, parseLocalDate } from '@/lib/utils';
import type { Client, LoanPlan, Loan, Plaza, Localidad, Promotora, AppConfig, PromotoraSettlement, WeeklyClosure } from '@/lib/types';
import { computePromotoraWeekMetrics } from '@/lib/settlement-calculator';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

interface ResumenClientPageProps {
  initialClients: Client[];
  initialLoanPlans: LoanPlan[];
  initialPlazas: Plaza[];
  initialLocalidades: Localidad[];
  initialPromotoras: Promotora[];
  initialConfig?: AppConfig | null;
  initialSettlements?: PromotoraSettlement[];
  initialClosures?: WeeklyClosure[];
}

interface ResumenRow {
  promotoraId: string;
  promotoraName: string;
  localidadName: string;
  plazaId: string;
  plazaName: string;
  venta: number;
  debeEntregar: number;
  falla: number;
  porcentajeFalla: number;
  efectivo: number;
  recuperado: number;
  totalCobrado: number;
  diferencia: number;
  comision: number;
  supervision: number;
  adelEnt: number;
  adelSal: number;
  semExt: number;
  status: 'closed' | 'saved' | 'computed';
  closedCount: number;
  totalWeeksEvaluated: number;
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

export function ResumenClientPage({
  initialClients,
  initialLoanPlans,
  initialPlazas,
  initialLocalidades,
  initialPromotoras,
  initialConfig,
  initialSettlements = [],
  initialClosures = [],
}: ResumenClientPageProps) {
  const { toast } = useToast();
  const { appUser } = useAuth();
  const { data: realtime } = useRealtimeData({
    clients: initialClients,
    loanPlans: initialLoanPlans,
    plazas: initialPlazas,
    localidades: initialLocalidades,
    promotoras: initialPromotoras,
    promotoraSettlements: initialSettlements,
    weeklyClosures: initialClosures,
  });

  // Combine SSR with realtime
  const loans = realtime?.loans?.length ? realtime.loans : [];
  const clients = realtime?.clients?.length ? realtime.clients : initialClients;
  const loanPlans = realtime?.loanPlans?.length ? realtime.loanPlans : initialLoanPlans;
  const plazas = realtime?.plazas?.length ? realtime.plazas : initialPlazas;
  const localidades = realtime?.localidades?.length ? realtime.localidades : initialLocalidades;
  const promotoras = realtime?.promotoras?.length ? realtime.promotoras : initialPromotoras;
  const savedSettlements = realtime?.promotoraSettlements?.length ? realtime.promotoraSettlements : initialSettlements;
  const config = realtime?.config || initialConfig;

  // Available operational weeks (Saturdays descending)
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

  const latestWeekStr = allAvailableWeeks[0]?.toISOString().split('T')[0] || '';

  // Mode and date selection
  const [timeMode, setTimeMode] = useState<'single' | 'range'>('single');
  const [selectedWeek, setSelectedWeek] = useState<string>(latestWeekStr);
  const [startWeek, setStartWeek] = useState<string>(
    allAvailableWeeks[Math.min(3, allAvailableWeeks.length - 1)]?.toISOString().split('T')[0] || latestWeekStr
  );
  const [endWeek, setEndWeek] = useState<string>(latestWeekStr);

  // Filters
  const [selectedPlaza, setSelectedPlaza] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'promotora' | 'plaza' | 'venta' | 'debe' | 'falla' | 'total'>('plaza');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Detail Modal State
  const [detailPromotora, setDetailPromotora] = useState<ResumenRow | null>(null);

  // Determine active weeks in current selection
  const activeWeeks = useMemo(() => {
    if (timeMode === 'single') {
      return selectedWeek ? [selectedWeek] : [];
    }

    if (!startWeek || !endWeek) return [];
    const startTime = parseLocalDate(startWeek).getTime();
    const endTime = parseLocalDate(endWeek).getTime();
    const [minTime, maxTime] = startTime <= endTime ? [startTime, endTime] : [endTime, startTime];

    return allAvailableWeeks
      .filter(w => {
        const t = w.getTime();
        return t >= minTime && t <= maxTime;
      })
      .map(w => w.toISOString().split('T')[0])
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [timeMode, selectedWeek, startWeek, endWeek, allAvailableWeeks]);

  // Lookup maps
  const locMap = useMemo(() => {
    const map = new Map<string, Localidad>();
    localidades.forEach((l: Localidad) => map.set(l.id, l));
    return map;
  }, [localidades]);

  const plazaMap = useMemo(() => {
    const map = new Map<string, Plaza>();
    plazas.forEach((p: Plaza) => map.set(p.id, p));
    return map;
  }, [plazas]);

  // Settlements fast map: `${promotoraId}_${weekDate}` -> PromotoraSettlement
  const settlementLookup = useMemo(() => {
    const map = new Map<string, PromotoraSettlement>();
    savedSettlements.forEach((s: PromotoraSettlement) => map.set(s.id, s));
    return map;
  }, [savedSettlements]);

  // Loans by promotora
  const loansByPromotora = useMemo(() => {
    const map = new Map<string, Loan[]>();
    loans.forEach((loan: Loan) => {
      if (!loan.promotoraId) return;
      if (parseLocalDate(loan.startDate) < new Date('2026-03-01T00:00:00')) return;
      const list = map.get(loan.promotoraId) || [];
      list.push(loan);
      map.set(loan.promotoraId, list);
    });
    return map;
  }, [loans]);

  // Compute summary rows for all promotoras
  const rows: ResumenRow[] = useMemo(() => {
    if (activeWeeks.length === 0) return [];

    return promotoras.map((promotora: Promotora) => {
      const pId = promotora.id;
      const loc = locMap.get(promotora.localidadId);
      const plaza = loc ? plazaMap.get(loc.plazaId) : null;
      const plazaId = plaza ? plaza.id : '';
      const plazaName = plaza ? plaza.name : 'SIN PLAZA';
      const localidadName = loc ? loc.name : 'SIN LOCALIDAD';

      let sumVenta = 0;
      let sumDebe = 0;
      let sumFalla = 0;
      let sumEfectivo = 0;
      let sumRecuperado = 0;
      let sumTotalCobrado = 0;
      let sumDiferencia = 0;
      let sumComision = 0;
      let sumSupervision = 0;
      let sumAdelEnt = 0;
      let sumAdelSal = 0;
      let sumSemExt = 0;
      let closedCount = 0;
      let savedCount = 0;

      const pLoans = loansByPromotora.get(pId) || [];

      activeWeeks.forEach(w => {
        const docId = `${pId}_${w}`;
        const saved = settlementLookup.get(docId);

        if (saved) {
          savedCount++;
          if (saved.isClosed) closedCount++;
          sumVenta += Number(saved.venta) || 0;
          sumDebe += Number(saved.debeEntregar) || 0;
          sumFalla += Number(saved.falla) || 0;
          sumEfectivo += Number(saved.efectivo) || 0;
          sumRecuperado += Number(saved.recuperado) || 0;
          sumTotalCobrado += Number(saved.total) || 0;
          sumDiferencia += Number(saved.diferencia) || 0;
          sumComision += Number(saved.comicion) || 0;
          sumSupervision += Number(saved.supervision) || 0;
          sumAdelEnt += Number(saved.adelEnt) || 0;
          sumAdelSal += Number(saved.adelSal) || 0;
          sumSemExt += Number(saved.semExt) || 0;
        } else {
          // Dynamic calculation
          const computed = computePromotoraWeekMetrics({
            promotoraId: pId,
            promotoraName: promotora.name,
            targetWeekStr: w,
            loans: pLoans,
            loanPlans,
            config,
          });

          sumVenta += computed.venta;
          sumDebe += computed.debeEntregar;
          sumFalla += computed.falla;
          sumEfectivo += computed.efectivo;
          sumRecuperado += computed.recuperado;
          sumTotalCobrado += computed.total;
          sumDiferencia += computed.diferencia;
          sumComision += (computed.comicion || 0);
          sumSupervision += (computed.supervision || 0);
          sumAdelEnt += (computed.adelEnt || 0);
          sumAdelSal += (computed.adelSal || 0);
          sumSemExt += (computed.semExt || 0);
        }
      });

      const porcentajeFalla = sumDebe > 0 ? (sumFalla / sumDebe) * 100 : 0;
      let status: 'closed' | 'saved' | 'computed' = 'computed';
      if (closedCount === activeWeeks.length && closedCount > 0) {
        status = 'closed';
      } else if (savedCount > 0) {
        status = 'saved';
      }

      return {
        promotoraId: pId,
        promotoraName: promotora.name,
        localidadName,
        plazaId,
        plazaName,
        venta: sumVenta,
        debeEntregar: sumDebe,
        falla: sumFalla,
        porcentajeFalla,
        efectivo: sumEfectivo,
        recuperado: sumRecuperado,
        totalCobrado: sumTotalCobrado,
        diferencia: sumDiferencia,
        comision: sumComision,
        supervision: sumSupervision,
        adelEnt: sumAdelEnt,
        adelSal: sumAdelSal,
        semExt: sumSemExt,
        status,
        closedCount,
        totalWeeksEvaluated: activeWeeks.length,
      };
    });
  }, [activeWeeks, promotoras, locMap, plazaMap, loansByPromotora, loanPlans, config, settlementLookup]);

  // Filtered and sorted rows
  const filteredRows = useMemo(() => {
    let result = rows;

    if (selectedPlaza !== 'ALL') {
      result = result.filter(r => r.plazaId === selectedPlaza);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(r => 
        r.promotoraName.toLowerCase().includes(q) ||
        r.localidadName.toLowerCase().includes(q) ||
        r.plazaName.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => {
      let valA: any = a.promotoraName;
      let valB: any = b.promotoraName;

      if (sortBy === 'plaza') {
        valA = a.plazaName + a.promotoraName;
        valB = b.plazaName + b.promotoraName;
      } else if (sortBy === 'venta') {
        valA = a.venta;
        valB = b.venta;
      } else if (sortBy === 'debe') {
        valA = a.debeEntregar;
        valB = b.debeEntregar;
      } else if (sortBy === 'falla') {
        valA = a.falla;
        valB = b.falla;
      } else if (sortBy === 'total') {
        valA = a.totalCobrado;
        valB = b.totalCobrado;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, selectedPlaza, searchTerm, sortBy, sortOrder]);

  // Overall KPI sums
  const totals = useMemo(() => {
    return filteredRows.reduce((acc, r) => {
      acc.venta += r.venta;
      acc.debeEntregar += r.debeEntregar;
      acc.falla += r.falla;
      acc.efectivo += r.efectivo;
      acc.recuperado += r.recuperado;
      acc.totalCobrado += r.totalCobrado;
      acc.diferencia += r.diferencia;
      acc.comision += r.comision;
      acc.supervision += r.supervision;
      acc.adelEnt += r.adelEnt;
      acc.adelSal += r.adelSal;
      acc.semExt += r.semExt;
      return acc;
    }, {
      venta: 0,
      debeEntregar: 0,
      falla: 0,
      efectivo: 0,
      recuperado: 0,
      totalCobrado: 0,
      diferencia: 0,
      comision: 0,
      supervision: 0,
      adelEnt: 0,
      adelSal: 0,
      semExt: 0,
    });
  }, [filteredRows]);

  const globalFallaPercent = totals.debeEntregar > 0 ? (totals.falla / totals.debeEntregar) * 100 : 0;
  const balanceNeto = totals.totalCobrado - totals.comision - totals.supervision;

  // Header period label
  const periodLabel = useMemo(() => {
    if (timeMode === 'single') {
      return `Semana del ${selectedWeek ? selectedWeek.split('-').reverse().join('/') : ''}`;
    }
    return `Rango: ${startWeek.split('-').reverse().join('/')} al ${endWeek.split('-').reverse().join('/')} (${activeWeeks.length} semanas)`;
  }, [timeMode, selectedWeek, startWeek, endWeek, activeWeeks]);

  const selectedPlazaName = useMemo(() => {
    if (selectedPlaza === 'ALL') return 'TODAS LAS PLAZAS';
    return plazaMap.get(selectedPlaza)?.name || 'PLAZA';
  }, [selectedPlaza, plazaMap]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay filas para exportar.', variant: 'destructive' });
      return;
    }

    const headers = [
      'Plaza', 'Grupo', 'Localidad', 'Venta', 'Debe Entregar',
      'Falla', '% Falla', 'Efectivo', 'Recuperado', 'Total Cobrado',
      'Diferencia', 'Comisión', 'Supervisión', 'Adel. Ent.', 'Adel. Sal.', 'Sem. Extra', 'Estado'
    ];

    const dataLines = filteredRows.map(r => [
      `"${r.plazaName}"`,
      `"${r.promotoraName}"`,
      `"${r.localidadName}"`,
      r.venta,
      r.debeEntregar,
      r.falla,
      `${r.porcentajeFalla.toFixed(2)}%`,
      r.efectivo,
      r.recuperado,
      r.totalCobrado,
      r.diferencia,
      r.comision,
      r.supervision,
      r.adelEnt,
      r.adelSal,
      r.semExt,
      `"${r.status === 'closed' ? 'CERRADO' : (r.status === 'saved' ? 'GUARDADO' : 'CALCULADO')}"`
    ].join(','));

    // Totals line
    const totalsLine = [
      '"TOTALES GENERALES"', '""', '""',
      totals.venta,
      totals.debeEntregar,
      totals.falla,
      `${globalFallaPercent.toFixed(2)}%`,
      totals.efectivo,
      totals.recuperado,
      totals.totalCobrado,
      totals.diferencia,
      totals.comision,
      totals.supervision,
      totals.adelEnt,
      totals.adelSal,
      totals.semExt,
      '""'
    ].join(',');

    const csvContent = [headers.join(','), ...dataLines, totalsLine].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resumen_Operativo_${selectedPlazaName.replace(/\s+/g, '_')}_${timeMode === 'single' ? selectedWeek : `${startWeek}_${endWeek}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: 'CSV Generado', description: 'El resumen se descargó en formato CSV.' });
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay filas para imprimir.', variant: 'destructive' });
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'letter'
      }) as jsPDFWithAutoTable;

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Header block
      doc.setFillColor(30, 58, 138); // #1e3a8a Dark Blue
      doc.rect(0, 0, pageWidth, 54, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('LEÓN CAPITAL  |  RESUMEN OPERATIVO CONSOLIDADO', 28, 26);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`ZONA / PLAZA: ${selectedPlazaName}    |    PERÍODO: ${periodLabel.toUpperCase()}`, 28, 42);

      const todayStr = new Date().toLocaleDateString('es-MX', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      doc.setFontSize(8.5);
      doc.text(`Generado: ${todayStr} por ${appUser?.username || 'Sistema'}`, pageWidth - 28, 42, { align: 'right' });

      // KPI summary boxes
      const boxY = 64;
      const boxWidth = (pageWidth - 56 - 24) / 4;
      const boxHeight = 42;

      const kpis = [
        { label: 'VENTA TOTAL', val: formatCurrency(totals.venta) },
        { label: 'DEBE ENTREGAR', val: formatCurrency(totals.debeEntregar) },
        { label: 'COBRANZA TOTAL', val: formatCurrency(totals.totalCobrado) },
        { label: 'FALLA TOTAL', val: `${formatCurrency(totals.falla)} (${globalFallaPercent.toFixed(1)}%)` },
      ];

      kpis.forEach((kpi, idx) => {
        const bx = 28 + idx * (boxWidth + 8);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(bx, boxY, boxWidth, boxHeight, 3, 3, 'FD');

        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(kpi.label, bx + 8, boxY + 14);

        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(kpi.val, bx + 8, boxY + 32);
      });

      // Table preparation
      const tableHead = [[
        'PLAZA',
        'GRUPO',
        'VENTA',
        'DEBE ENT.',
        'FALLA',
        '% FALLA',
        'EFECTIVO',
        'RECUP.',
        'TOTAL COB.',
        'DIFERENCIA',
        'COMISIÓN',
        'SUPERV.',
        'ADEL. ENT.',
        'ADEL. SAL.',
        'ESTADO'
      ]];

      const tableBody = filteredRows.map(r => [
        r.plazaName,
        r.promotoraName,
        formatCurrency(r.venta),
        formatCurrency(r.debeEntregar),
        formatCurrency(r.falla),
        formatPercent(r.porcentajeFalla),
        formatCurrency(r.efectivo),
        formatCurrency(r.recuperado),
        formatCurrency(r.totalCobrado),
        formatCurrency(r.diferencia),
        formatCurrency(r.comision),
        formatCurrency(r.supervision),
        formatCurrency(r.adelEnt),
        formatCurrency(r.adelSal),
        r.status === 'closed' ? 'CERRADO' : (r.status === 'saved' ? 'GUARDADO' : 'CALC.')
      ]);

      const tableFoot = [[
        'TOTALES',
        `${filteredRows.length} GRUPOS`,
        formatCurrency(totals.venta),
        formatCurrency(totals.debeEntregar),
        formatCurrency(totals.falla),
        formatPercent(globalFallaPercent),
        formatCurrency(totals.efectivo),
        formatCurrency(totals.recuperado),
        formatCurrency(totals.totalCobrado),
        formatCurrency(totals.diferencia),
        formatCurrency(totals.comision),
        formatCurrency(totals.supervision),
        formatCurrency(totals.adelEnt),
        formatCurrency(totals.adelSal),
        ''
      ]];

      doc.autoTable({
        head: tableHead,
        body: tableBody,
        foot: tableFoot,
        startY: 114,
        margin: { left: 28, right: 28, bottom: 32 },
        theme: 'grid',
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontSize: 7.5,
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 4,
          lineColor: [203, 213, 225],
          lineWidth: 0.5,
        },
        bodyStyles: {
          fontSize: 7.5,
          cellPadding: 3.5,
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
          textColor: [30, 41, 59],
        },
        footStyles: {
          fillColor: [226, 232, 240],
          textColor: [15, 23, 42],
          fontSize: 8,
          fontStyle: 'bold',
          cellPadding: 4,
          lineColor: [148, 163, 184],
          lineWidth: 1,
        },
        columnStyles: {
          0: { cellWidth: 70, halign: 'left' },
          1: { cellWidth: 95, halign: 'left' },
          2: { halign: 'right' },
          3: { halign: 'right', fontStyle: 'bold' },
          4: { halign: 'right' },
          5: { halign: 'center' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right', fontStyle: 'bold' },
          9: { halign: 'right' },
          10: { halign: 'right' },
          11: { halign: 'right' },
          12: { halign: 'right' },
          13: { halign: 'right' },
          14: { halign: 'center', cellWidth: 50 },
        },
        didDrawPage: (data) => {
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `CrediControl ERP  •  Página ${data.pageNumber} de ${doc.internal.pages.length - 1}`,
            pageWidth / 2,
            pageHeight - 16,
            { align: 'center' }
          );
        }
      });

      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      toast({ title: 'PDF Generado', description: 'El reporte se abrió en una nueva pestaña.' });
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast({ title: 'Error', description: 'No se pudo generar el PDF.', variant: 'destructive' });
    }
  };

  // Loans detail for modal
  const modalDetailLoans = useMemo(() => {
    if (!detailPromotora) return [];
    return loansByPromotora.get(detailPromotora.promotoraId) || [];
  }, [detailPromotora, loansByPromotora]);

  return (
    <div className="space-y-4 pb-12">
      {/* Header card with dark solid blue accent */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-900 text-white rounded-md">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">
                    Resumen Operativo
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Auditoría y verificación consolidada de colocación, cobranza y fallas por grupo y plaza.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions: Export PDF, Export CSV */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleExportCSV}
                variant="outline"
                size="sm"
                className="h-9 text-xs border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Exportar Excel (CSV)
              </Button>

              <Button
                onClick={handleExportPDF}
                size="sm"
                className="h-9 text-xs bg-blue-900 hover:bg-blue-800 text-white font-semibold shadow-sm transition-colors border-0"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Imprimir Reporte (PDF)
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            {/* Mode Toggle: Semana única vs Rango */}
            <div className="lg:col-span-3 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Modo de Consulta
              </label>
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-zinc-900 rounded-md border border-slate-300 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setTimeMode('single')}
                  className={cn(
                    "text-xs font-semibold py-1.5 rounded transition-all",
                    timeMode === 'single'
                      ? "bg-blue-900 text-white shadow-sm"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Semana Única
                </button>
                <button
                  type="button"
                  onClick={() => setTimeMode('range')}
                  className={cn(
                    "text-xs font-semibold py-1.5 rounded transition-all",
                    timeMode === 'range'
                      ? "bg-blue-900 text-white shadow-sm"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Rango de Semanas
                </button>
              </div>
            </div>

            {/* Date Selectors */}
            {timeMode === 'single' ? (
              <div className="lg:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-900" />
                  Semana Operativa
                </label>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <SelectValue placeholder="Seleccionar semana" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {allAvailableWeeks.map(sat => {
                      const val = sat.toISOString().split('T')[0];
                      const formatted = sat.toLocaleDateString('es-MX', {
                        day: '2-digit', month: '2-digit', year: 'numeric'
                      });
                      const isCurrent = val === latestWeekStr;
                      return (
                        <SelectItem key={val} value={val} className="text-xs">
                          Semana del {formatted} {isCurrent ? '(Actual)' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="lg:col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                    Desde
                  </label>
                  <Select value={startWeek} onValueChange={setStartWeek}>
                    <SelectTrigger className="h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      <SelectValue placeholder="Semana inicio" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {allAvailableWeeks.map(sat => {
                        const val = sat.toISOString().split('T')[0];
                        return (
                          <SelectItem key={val} value={val} className="text-xs">
                            {sat.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                    Hasta
                  </label>
                  <Select value={endWeek} onValueChange={setEndWeek}>
                    <SelectTrigger className="h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      <SelectValue placeholder="Semana fin" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {allAvailableWeeks.map(sat => {
                        const val = sat.toISOString().split('T')[0];
                        return (
                          <SelectItem key={val} value={val} className="text-xs">
                            {sat.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Plaza Filter */}
            <div className={timeMode === 'single' ? "lg:col-span-3 space-y-1" : "lg:col-span-2 space-y-1"}>
              <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-blue-900" />
                Plaza
              </label>
              <Select value={selectedPlaza} onValueChange={setSelectedPlaza}>
                <SelectTrigger className="h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <SelectValue placeholder="Todas las plazas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs font-bold text-blue-900 dark:text-blue-400">
                    Todas las Plazas (Consolidado)
                  </SelectItem>
                  {plazas.map((p: Plaza) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search Input */}
            <div className="lg:col-span-3 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Buscar Grupo
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Filtrar por grupo o localidad..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-9 pl-8 text-xs border-slate-300 dark:border-zinc-700"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Venta Colocada
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
            {formatCurrency(totals.venta)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Nuevos préstamos
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Debe Entregar
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
            {formatCurrency(totals.debeEntregar)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Esperado total
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Total Cobrado
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
            {formatCurrency(totals.totalCobrado)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Efectivo + Recuperado
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Falla Total
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
            {formatCurrency(totals.falla)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {formatPercent(globalFallaPercent)} de falla
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Recuperado
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
            {formatCurrency(totals.recuperado)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Pagos sobre cuota
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Balance Neto
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
            {formatCurrency(balanceNeto)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Menos comisiones
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950 overflow-hidden">
        <div className="p-3 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between text-xs">
          <div className="font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
            <span>Mostrando {filteredRows.length} grupos</span>
            <span className="text-slate-400">•</span>
            <span className="text-blue-900 dark:text-blue-400 font-semibold">{periodLabel}</span>
          </div>

          <div className="text-[11px] text-slate-500">
            {timeMode === 'single' ? 'Datos semanales' : `Acumulado de ${activeWeeks.length} semanas`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="w-full table-fixed text-[11px] border-collapse">
            <TableHeader className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-300 dark:border-zinc-700">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-2 text-left w-[10%] truncate">
                  Plaza
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-2 text-left w-[13%] truncate">
                  Grupo (Promotora)
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[7%]">
                  Venta
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[8%]">
                  Debe Ent.
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[7%]">
                  Falla
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-0.5 text-center w-[5%]">
                  % Falla
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[7.5%]">
                  Efectivo
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[6.5%]">
                  Recuperado
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[8%]">
                  Total Cob.
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[6.5%]">
                  Diferencia
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[6%]">
                  Comisión
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-right w-[6%]">
                  Supervisión
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-0.5 text-center w-[5%]">
                  Adel. Ent.
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-0.5 text-center w-[5%]">
                  Adel. Sal.
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-center w-[6%]">
                  Estado
                </TableHead>
                <TableHead className="font-bold text-slate-900 dark:text-zinc-100 py-2 px-1 text-center w-[4.5%]">
                  Detalle
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={16} className="h-28 text-center text-muted-foreground font-semibold">
                    No se encontraron registros para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row, idx) => (
                  <TableRow
                    key={row.promotoraId}
                    className={cn(
                      "hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition-colors border-b border-slate-200 dark:border-zinc-800",
                      idx % 2 === 1 ? "bg-slate-50/40 dark:bg-zinc-950/40" : "bg-white dark:bg-zinc-950"
                    )}
                  >
                    {/* Plaza */}
                    <TableCell className="py-1.5 px-2 font-semibold text-slate-700 dark:text-zinc-300 truncate" title={row.plazaName}>
                      {row.plazaName}
                    </TableCell>

                    {/* Grupo */}
                    <TableCell className="py-1.5 px-2 font-bold text-slate-900 dark:text-zinc-100 truncate" title={row.promotoraName}>
                      {row.promotoraName}
                    </TableCell>

                    {/* Venta */}
                    <TableCell className="py-1.5 px-1 text-right font-medium text-slate-800 dark:text-zinc-200 tabular-nums">
                      {row.venta > 0 ? formatCurrency(row.venta) : '—'}
                    </TableCell>

                    {/* Debe Entregar */}
                    <TableCell className="py-1.5 px-1 text-right font-bold text-slate-900 dark:text-zinc-100 tabular-nums">
                      {formatCurrency(row.debeEntregar)}
                    </TableCell>

                    {/* Falla */}
                    <TableCell className={cn(
                      "py-1.5 px-1 text-right font-medium tabular-nums",
                      row.falla > 0 ? "text-slate-900 dark:text-zinc-100 font-bold" : "text-slate-400"
                    )}>
                      {row.falla > 0 ? formatCurrency(row.falla) : '0.00'}
                    </TableCell>

                    {/* % Falla */}
                    <TableCell className="py-1.5 px-0.5 text-center text-slate-600 dark:text-zinc-400 tabular-nums">
                      {row.porcentajeFalla > 0 ? `${row.porcentajeFalla.toFixed(1)}%` : '0%'}
                    </TableCell>

                    {/* Efectivo */}
                    <TableCell className="py-1.5 px-1 text-right font-medium text-slate-800 dark:text-zinc-200 tabular-nums">
                      {formatCurrency(row.efectivo)}
                    </TableCell>

                    {/* Recuperado */}
                    <TableCell className="py-1.5 px-1 text-right font-medium text-slate-800 dark:text-zinc-200 tabular-nums">
                      {row.recuperado > 0 ? formatCurrency(row.recuperado) : '—'}
                    </TableCell>

                    {/* Total Cobrado */}
                    <TableCell className="py-1.5 px-1 text-right font-black text-slate-900 dark:text-zinc-100 tabular-nums">
                      {formatCurrency(row.totalCobrado)}
                    </TableCell>

                    {/* Diferencia */}
                    <TableCell className={cn(
                      "py-1.5 px-1 text-right font-bold tabular-nums",
                      row.diferencia < 0 ? "text-slate-900 dark:text-zinc-100" : (row.diferencia > 0 ? "text-slate-900 dark:text-zinc-100" : "text-slate-400")
                    )}>
                      {row.diferencia !== 0 ? formatCurrency(row.diferencia) : '0.00'}
                    </TableCell>

                    {/* Comisión */}
                    <TableCell className="py-1.5 px-1 text-right font-medium text-slate-800 dark:text-zinc-200 tabular-nums">
                      {row.comision > 0 ? formatCurrency(row.comision) : '—'}
                    </TableCell>

                    {/* Supervisión */}
                    <TableCell className="py-1.5 px-1 text-right font-medium text-slate-800 dark:text-zinc-200 tabular-nums">
                      {row.supervision > 0 ? formatCurrency(row.supervision) : '—'}
                    </TableCell>

                    {/* Adelantos Entrantes */}
                    <TableCell className="py-1.5 px-0.5 text-center text-slate-600 dark:text-zinc-400 tabular-nums">
                      {row.adelEnt > 0 ? formatCurrency(row.adelEnt) : '—'}
                    </TableCell>

                    {/* Adelantos Salientes */}
                    <TableCell className="py-1.5 px-0.5 text-center text-slate-600 dark:text-zinc-400 tabular-nums">
                      {row.adelSal > 0 ? formatCurrency(row.adelSal) : '—'}
                    </TableCell>

                    {/* Estado */}
                    <TableCell className="py-1.5 px-1 text-center">
                      {row.status === 'closed' ? (
                        <Badge className="bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[9px] px-1.5 py-0 font-bold border-0">
                          Cerrado
                        </Badge>
                      ) : row.status === 'saved' ? (
                        <Badge variant="outline" className="border-slate-400 text-slate-700 dark:text-zinc-300 text-[9px] px-1 py-0">
                          Guardado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 text-slate-500">
                          Calculado
                        </Badge>
                      )}
                    </TableCell>

                    {/* Ver Detalle / Auditoría */}
                    <TableCell className="py-1.5 px-1 text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDetailPromotora(row)}
                        className="h-6 w-6 text-slate-600 dark:text-zinc-400 hover:text-blue-900 dark:hover:text-blue-400"
                        title="Ver auditoría de créditos y cobranza"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}

              {/* Totals row */}
              {filteredRows.length > 0 && (
                <TableRow className="bg-slate-200 dark:bg-zinc-800 font-black border-t-2 border-slate-400 dark:border-zinc-600 text-slate-900 dark:text-white">
                  <TableCell className="py-2 px-2 uppercase tracking-wider">
                    TOTALES
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    {filteredRows.length} Grupos
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.venta)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.debeEntregar)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.falla)}
                  </TableCell>
                  <TableCell className="py-2 px-0.5 text-center tabular-nums">
                    {formatPercent(globalFallaPercent)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.efectivo)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.recuperado)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.totalCobrado)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.diferencia)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.comision)}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-right tabular-nums">
                    {formatCurrency(totals.supervision)}
                  </TableCell>
                  <TableCell className="py-2 px-0.5 text-center tabular-nums">
                    {totals.adelEnt > 0 ? formatCurrency(totals.adelEnt) : '—'}
                  </TableCell>
                  <TableCell className="py-2 px-0.5 text-center tabular-nums">
                    {totals.adelSal > 0 ? formatCurrency(totals.adelSal) : '—'}
                  </TableCell>
                  <TableCell className="py-2 px-1 text-center" colSpan={2}>
                    Balance: {formatCurrency(balanceNeto)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Auditoría / Detalle Modal */}
      <Dialog open={Boolean(detailPromotora)} onOpenChange={(open) => !open && setDetailPromotora(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <DialogTitle className="text-base font-black text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-900" />
                  Auditoría de Captura: {detailPromotora?.promotoraName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Plaza: {detailPromotora?.plazaName} | Período: {periodLabel}
                </DialogDescription>
              </div>
              <Badge className="bg-blue-900 text-white font-bold text-xs">
                {detailPromotora?.status === 'closed' ? 'Cerrado' : (detailPromotora?.status === 'saved' ? 'Guardado' : 'Calculado')}
              </Badge>
            </div>
          </DialogHeader>

          {/* Quick Metrics */}
          {detailPromotora && (
            <div className="grid grid-cols-4 gap-2 my-2 text-center text-xs">
              <div className="p-2 bg-slate-50 dark:bg-zinc-900 rounded border">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Venta</span>
                <span className="font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(detailPromotora.venta)}</span>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-zinc-900 rounded border">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Debe Entregar</span>
                <span className="font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(detailPromotora.debeEntregar)}</span>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-zinc-900 rounded border">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Falla</span>
                <span className="font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(detailPromotora.falla)} ({detailPromotora.porcentajeFalla.toFixed(1)}%)</span>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-zinc-900 rounded border">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Total Cobrado</span>
                <span className="font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(detailPromotora.totalCobrado)}</span>
              </div>
            </div>
          )}

          {/* Préstamos list */}
          <div className="space-y-3 mt-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
              Préstamos Registrados en el Grupo ({modalDetailLoans.length})
            </h4>

            <div className="border border-slate-200 dark:border-zinc-800 rounded-md overflow-hidden">
              <Table className="text-xs">
                <TableHeader className="bg-slate-100 dark:bg-zinc-900">
                  <TableRow>
                    <TableHead className="py-1.5 px-2 font-bold text-slate-900">Cliente</TableHead>
                    <TableHead className="py-1.5 px-2 font-bold text-slate-900">Fecha Inicio</TableHead>
                    <TableHead className="py-1.5 px-2 font-bold text-slate-900 text-right">Monto</TableHead>
                    <TableHead className="py-1.5 px-2 font-bold text-slate-900 text-right">Abonos Reg.</TableHead>
                    <TableHead className="py-1.5 px-2 font-bold text-slate-900 text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modalDetailLoans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-slate-500">
                        No hay préstamos registrados para esta promotora.
                      </TableCell>
                    </TableRow>
                  ) : (
                    modalDetailLoans.slice(0, 50).map((loan: Loan) => {
                      const client = clients.find((c: Client) => c.id === loan.clientId);
                      const paymentsCount = (loan.payments || []).filter(p => !p.isReverted).length;
                      return (
                        <TableRow key={loan.id} className="border-b">
                          <TableCell className="py-1.5 px-2 font-semibold text-slate-900 dark:text-zinc-100">
                            {client ? client.name : 'Cliente'}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-slate-600 dark:text-zinc-400">
                            {loan.startDate ? parseLocalDate(loan.startDate).toLocaleDateString('es-MX') : '—'}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-right font-medium">
                            {formatCurrency(loan.amount)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-right font-medium">
                            {paymentsCount} abonos
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-center">
                            <Badge variant="outline" className="text-[10px]">
                              {loan.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
