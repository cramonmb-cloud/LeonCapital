'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  Gift, Calendar, Building, Search, Download, 
  Printer, Eye, DollarSign, TrendingUp, Sparkles,
  RotateCcw, ArrowUpDown, Filter, Landmark, Users
} from 'lucide-react';
import { cn, parseLocalDate, getMexicoNow } from '@/lib/utils';
import type { Client, LoanPlan, Loan, Plaza, Localidad, Promotora, AppConfig } from '@/lib/types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

interface AguinaldosClientPageProps {
  initialLoans: Loan[];
  initialPromotoras: Promotora[];
  initialLocalidades: Localidad[];
  initialPlazas: Plaza[];
  initialClients: Client[];
  initialLoanPlans: LoanPlan[];
  initialConfig?: AppConfig | null;
}

interface PromotoraAguinaldoRow {
  promotoraId: string;
  promotoraName: string;
  localidadId: string;
  localidadName: string;
  plazaId: string;
  plazaName: string;
  loansCount: number;
  totalVenta: number;
  ratePerThousand: number;
  isCustomRate: boolean;
  aguinaldo: number;
  loans: Loan[];
}

export function AguinaldosClientPage({
  initialLoans,
  initialPromotoras,
  initialLocalidades,
  initialPlazas,
  initialClients,
  initialLoanPlans,
  initialConfig,
}: AguinaldosClientPageProps) {
  const { toast } = useToast();
  const { appUser } = useAuth();

  // Realtime subscriptions
  const { data: realtime } = useRealtimeData({
    loans: initialLoans,
    clients: initialClients,
    loanPlans: initialLoanPlans,
    plazas: initialPlazas,
    localidades: initialLocalidades,
    promotoras: initialPromotoras,
  });

  const loans = realtime?.loans?.length ? realtime.loans : initialLoans;
  const promotoras = realtime?.promotoras?.length ? realtime.promotoras : initialPromotoras;
  const localidades = realtime?.localidades?.length ? realtime.localidades : initialLocalidades;
  const plazas = realtime?.plazas?.length ? realtime.plazas : initialPlazas;
  const clients = realtime?.clients?.length ? realtime.clients : initialClients;
  const loanPlans = realtime?.loanPlans?.length ? realtime.loanPlans : initialLoanPlans;

  // Initialize dates: Year start to today
  const today = getMexicoNow();
  const todayStr = today.toISOString().split('T')[0];
  const currentYear = today.getFullYear();
  const defaultStartStr = `${currentYear}-01-01`;

  const [startDate, setStartDate] = useState<string>(defaultStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [globalRatePerThousand, setGlobalRatePerThousand] = useState<number>(1.0);
  const [customRates, setCustomRates] = useState<Record<string, number>>({});
  const [selectedPlaza, setSelectedPlaza] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [onlyWithSales, setOnlyWithSales] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'promotora' | 'plaza' | 'venta' | 'aguinaldo' | 'prestamos'>('venta');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Detail Modal
  const [detailRow, setDetailRow] = useState<PromotoraAguinaldoRow | null>(null);

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

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c: Client) => map.set(c.id, c));
    return map;
  }, [clients]);

  const planMap = useMemo(() => {
    const map = new Map<string, LoanPlan>();
    loanPlans.forEach((lp: LoanPlan) => map.set(lp.id, lp));
    return map;
  }, [loanPlans]);

  // Currency Formatter
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  // Quick date presets
  const applyPreset = (preset: 'year' | '6m' | '12m' | 'month') => {
    const now = getMexicoNow();
    const end = now.toISOString().split('T')[0];
    let start = `${now.getFullYear()}-01-01`;

    if (preset === '6m') {
      const d = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      start = d.toISOString().split('T')[0];
    } else if (preset === '12m') {
      const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      start = d.toISOString().split('T')[0];
    } else if (preset === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      start = d.toISOString().split('T')[0];
    }

    setStartDate(start);
    setEndDate(end);
  };

  // Helper to extract loan start date string
  const getLoanDateStr = (dateInput: any): string => {
    if (!dateInput) return '';
    try {
      const parsed = parseLocalDate(dateInput);
      return parsed.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Group loans by promotora within the selected date range
  const rows: PromotoraAguinaldoRow[] = useMemo(() => {
    if (!startDate || !endDate) return [];

    // Filter all loans within the date range
    const loansInRange = loans.filter(l => {
      if (!l.promotoraId) return false;
      const loanDateStr = getLoanDateStr(l.startDate);
      return loanDateStr >= startDate && loanDateStr <= endDate;
    });

    // Map loans by promotoraId
    const loansByPromotora = new Map<string, Loan[]>();
    loansInRange.forEach(loan => {
      const pId = loan.promotoraId;
      if (!pId) return;
      if (!loansByPromotora.has(pId)) {
        loansByPromotora.set(pId, []);
      }
      loansByPromotora.get(pId)!.push(loan);
    });

    // Generate row for each promotora
    return promotoras.map(promotora => {
      const loc = locMap.get(promotora.localidadId);
      const plaza = loc ? plazaMap.get(loc.plazaId) : undefined;
      const pLoans = loansByPromotora.get(promotora.id) || [];

      const totalVenta = pLoans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
      const isCustomRate = customRates[promotora.id] !== undefined;
      const ratePerThousand = isCustomRate ? customRates[promotora.id] : globalRatePerThousand;
      const aguinaldo = Math.round((totalVenta / 1000) * ratePerThousand);

      return {
        promotoraId: promotora.id,
        promotoraName: promotora.name,
        localidadId: promotora.localidadId,
        localidadName: loc?.name || 'Sin Localidad',
        plazaId: plaza?.id || 'SIN_PLAZA',
        plazaName: plaza?.name || 'Sin Plaza',
        loansCount: pLoans.length,
        totalVenta,
        ratePerThousand,
        isCustomRate,
        aguinaldo,
        loans: pLoans,
      };
    });
  }, [promotoras, loans, startDate, endDate, globalRatePerThousand, customRates, locMap, plazaMap]);

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let result = rows;

    if (selectedPlaza !== 'ALL') {
      result = result.filter(r => r.plazaId === selectedPlaza);
    }

    if (onlyWithSales) {
      result = result.filter(r => r.totalVenta > 0);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(r =>
        r.promotoraName.toLowerCase().includes(q) ||
        r.localidadName.toLowerCase().includes(q) ||
        r.plazaName.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'promotora') {
        cmp = a.promotoraName.localeCompare(b.promotoraName);
      } else if (sortBy === 'plaza') {
        cmp = a.plazaName.localeCompare(b.plazaName) || a.promotoraName.localeCompare(b.promotoraName);
      } else if (sortBy === 'venta') {
        cmp = a.totalVenta - b.totalVenta;
      } else if (sortBy === 'aguinaldo') {
        cmp = a.aguinaldo - b.aguinaldo;
      } else if (sortBy === 'prestamos') {
        cmp = a.loansCount - b.loansCount;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [rows, selectedPlaza, onlyWithSales, searchTerm, sortBy, sortOrder]);

  // Totals
  const totals = useMemo(() => {
    let venta = 0;
    let aguinaldo = 0;
    let prestamos = 0;
    let promotorasConVenta = 0;

    filteredRows.forEach(r => {
      venta += r.totalVenta;
      aguinaldo += r.aguinaldo;
      prestamos += r.loansCount;
      if (r.totalVenta > 0) promotorasConVenta++;
    });

    const promedioAguinaldo = promotorasConVenta > 0 ? Math.round(aguinaldo / promotorasConVenta) : 0;

    return {
      venta,
      aguinaldo,
      prestamos,
      promotorasConVenta,
      totalPromotoras: filteredRows.length,
      promedioAguinaldo,
    };
  }, [filteredRows]);

  const handleCustomRateChange = (promotoraId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setCustomRates(prev => ({
      ...prev,
      [promotoraId]: num,
    }));
  };

  const handleResetCustomRate = (promotoraId: string) => {
    setCustomRates(prev => {
      const copy = { ...prev };
      delete copy[promotoraId];
      return copy;
    });
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay filas para exportar.', variant: 'destructive' });
      return;
    }

    const headers = [
      '#',
      'Plaza',
      'Grupo / Promotora',
      'Localidad',
      'Préstamos Colocados',
      'Venta Total Colocada ($)',
      'Valor x Cada $1,000 ($)',
      'Aguinaldo Calculado ($)'
    ];

    const dataLines = filteredRows.map((r, idx) => [
      idx + 1,
      `"${r.plazaName}"`,
      `"${r.promotoraName}"`,
      `"${r.localidadName}"`,
      r.loansCount,
      r.totalVenta,
      `$${r.ratePerThousand.toFixed(2)}`,
      r.aguinaldo
    ].join(','));

    // Totals line
    const totalsLine = [
      '""',
      '"TOTAL GENERAL"',
      `"${totals.promotorasConVenta} con venta de ${totals.totalPromotoras}"`,
      '""',
      totals.prestamos,
      totals.venta,
      `"$${globalRatePerThousand.toFixed(2)} base x $1,000"`,
      totals.aguinaldo
    ].join(',');

    const csvContent = '\uFEFF' + [headers.join(','), ...dataLines, totalsLine].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Reporte_Aguinaldos_${startDate}_al_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: 'Excel Exportado', description: 'El reporte de aguinaldos se descargó en CSV exitosamente.' });
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
      const marginX = 28;

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('LEÓN CAPITAL', marginX, 32);

      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('REPORTE DE AGUINALDOS A PROMOTORAS', marginX, 48);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Período de colocación: ${startDate} al ${endDate} | Tasa base: $${globalRatePerThousand.toFixed(2)} por cada $1,000 | Plaza: ${selectedPlaza === 'ALL' ? 'Consolidado General' : (plazaMap.get(selectedPlaza)?.name || selectedPlaza)}`, marginX, 60);

      // Top right meta
      const nowFormatted = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      doc.setFontSize(7.5);
      doc.text(`Generado: ${nowFormatted}`, pageWidth - marginX, 32, { align: 'right' });
      doc.text(`Grupos analizados: ${filteredRows.length} (${totals.promotorasConVenta} con venta)`, pageWidth - marginX, 44, { align: 'right' });

      // Table data
      const tableHeaders = [
        ['#', 'Plaza', 'Grupo / Promotora', 'Localidad', 'Préstamos', 'Venta Colocada', '$ x Cada Mil', 'Monto Aguinaldo']
      ];

      const tableData = filteredRows.map((r, i) => [
        (i + 1).toString(),
        r.plazaName,
        r.promotoraName,
        r.localidadName,
        r.loansCount.toString(),
        formatCurrency(r.totalVenta),
        `$${r.ratePerThousand.toFixed(2)}${r.isCustomRate ? ' *' : ''}`,
        formatCurrency(r.aguinaldo)
      ]);

      // Totals row
      tableData.push([
        '',
        'TOTALES',
        `${totals.promotorasConVenta} activas`,
        '',
        totals.prestamos.toString(),
        formatCurrency(totals.venta),
        `$${globalRatePerThousand.toFixed(2)} base`,
        formatCurrency(totals.aguinaldo)
      ]);

      doc.autoTable({
        startY: 72,
        head: tableHeaders,
        body: tableData,
        theme: 'plain',
        margin: { left: marginX, right: marginX, bottom: 45 },
        styles: {
          fontSize: 7.5,
          cellPadding: 4,
          textColor: [15, 23, 42],
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 24, halign: 'center' },
          1: { cellWidth: 85 },
          2: { cellWidth: 160, fontStyle: 'bold' },
          3: { cellWidth: 120 },
          4: { cellWidth: 60, halign: 'center' },
          5: { cellWidth: 95, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 65, halign: 'center' },
          7: { cellWidth: 95, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didParseCell: (data) => {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [226, 232, 240];
            data.cell.styles.textColor = [15, 23, 42];
          }
        }
      });

      // Signatures
      const finalY = (doc as any).lastAutoTable?.finalY;
      if (finalY && finalY + 45 <= pageHeight - 35) {
        const sigY = finalY + 28;
        const sigWidth = 140;
        const availableWidth = pageWidth - (marginX * 2);
        const sigGap = (availableWidth - (3 * sigWidth)) / 2;

        const signatures = [
          { title: 'ELABORÓ / SUPERVISIÓN', desc: 'Firma y Fecha' },
          { title: 'REVISÓ / AUDITORÍA', desc: 'Verificación de Préstamos' },
          { title: 'AUTORIZÓ / DIRECCIÓN', desc: 'Aprobación de Pago' }
        ];

        signatures.forEach((sig, idx) => {
          const sx = marginX + idx * (sigWidth + sigGap);
          doc.setDrawColor(100, 116, 139);
          doc.setLineWidth(0.75);
          doc.line(sx, sigY, sx + sigWidth, sigY);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(30, 41, 59);
          doc.text(sig.title, sx + (sigWidth / 2), sigY + 8.5, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(100, 116, 139);
          doc.text(sig.desc, sx + (sigWidth / 2), sigY + 16, { align: 'center' });
        });
      }

      // Page numbers
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text('DOCUMENTO OFICIAL PARA USO INTERNO — CREDICONTROL', pageWidth / 2, pageHeight - 12, { align: 'center' });
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginX, pageHeight - 12, { align: 'right' });
      }

      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      toast({ title: 'PDF Generado', description: 'El reporte de aguinaldos se abrió listo para imprimir.' });
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast({ title: 'Error', description: 'No se pudo generar el reporte PDF.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Header card with festive/executive accent */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">
                Aguinaldos a Promotoras
              </h1>
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
                className="h-9 text-xs bg-indigo-900 hover:bg-indigo-800 text-white font-semibold shadow-sm transition-colors border-0"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Imprimir Reporte (PDF)
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            {/* Global Rate Per Thousand Input */}
            <div className="lg:col-span-3 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                $ x Cada $1,000 Colocados
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    $
                  </span>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={globalRatePerThousand}
                    onChange={e => setGlobalRatePerThousand(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="h-9 pl-6 pr-14 text-xs font-bold text-indigo-950 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20"
                  />
                  <span className="absolute right-2 top-2.5 text-[10px] font-semibold text-slate-400">
                    / $1,000
                  </span>
                </div>
                {/* Quick pills */}
                <div className="flex items-center gap-1">
                  {[1.0, 2.0, 3.0].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setGlobalRatePerThousand(val)}
                      className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded border transition-all",
                        globalRatePerThousand === val
                          ? "bg-indigo-900 text-white border-indigo-900"
                          : "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Date Range Selectors */}
            <div className="lg:col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                Fecha Inicio
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </div>

            <div className="lg:col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Fecha Final
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </div>

            {/* Plaza Filter */}
            <div className="lg:col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-indigo-600" />
                Plaza
              </label>
              <Select value={selectedPlaza} onValueChange={setSelectedPlaza}>
                <SelectTrigger className="h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <SelectValue placeholder="Todas las plazas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs font-bold text-indigo-900 dark:text-indigo-400">
                    Todas las Plazas (Consolidado)
                  </SelectItem>
                  {plazas.map(p => (
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

          {/* Quick Presets & Filters */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-900 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                Períodos Rápidos:
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset('year')}
                className="h-7 text-[11px] px-2.5 bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100"
              >
                Este Año ({currentYear})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset('6m')}
                className="h-7 text-[11px] px-2.5 bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100"
              >
                Últimos 6 Meses
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset('12m')}
                className="h-7 text-[11px] px-2.5 bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100"
              >
                Últimos 12 Meses
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset('month')}
                className="h-7 text-[11px] px-2.5 bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100"
              >
                Mes Actual
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyWithSales(!onlyWithSales)}
                className={cn(
                  "text-xs font-semibold px-2.5 py-1 rounded-md border transition-all flex items-center gap-1.5",
                  onlyWithSales
                    ? "bg-indigo-50 border-indigo-300 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-400"
                )}
              >
                <Filter className="w-3 h-3" />
                Solo con venta ({totals.promotorasConVenta})
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden bg-white dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader className="bg-slate-100/90 dark:bg-zinc-900 sticky top-0 z-10 border-b border-slate-200 dark:border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 py-2.5 px-2 text-center text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                  #
                </TableHead>
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'plaza') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('plaza'); setSortOrder('asc'); }
                  }}
                  className="py-2.5 px-2 text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1">
                    Plaza
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'promotora') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('promotora'); setSortOrder('asc'); }
                  }}
                  className="py-2.5 px-2 text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1">
                    Grupo / Promotora
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead className="py-2.5 px-2 text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                  Localidad
                </TableHead>
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'prestamos') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('prestamos'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-2 text-center text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    Préstamos
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'venta') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('venta'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-2 text-right text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    Venta Colocada
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead className="py-2.5 px-2 text-center text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                  $ x Cada Mil
                </TableHead>
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'aguinaldo') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('aguinaldo'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-2 text-right text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    Aguinaldo Calculado
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead className="py-2.5 px-2 text-center text-[11px] font-bold text-slate-700 dark:text-zinc-300 w-16">
                  Detalle
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-slate-500">
                    No se encontraron grupos con los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row, index) => (
                  <TableRow
                    key={row.promotoraId}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors border-b border-slate-100 dark:border-zinc-800"
                  >
                    <TableCell className="py-2 px-2 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </TableCell>

                    <TableCell className="py-2 px-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300">
                        {row.plazaName}
                      </Badge>
                    </TableCell>

                    <TableCell className="py-2 px-2 font-bold text-slate-900 dark:text-zinc-100">
                      <span>{row.promotoraName}</span>
                    </TableCell>

                    <TableCell className="py-2 px-2 text-slate-600 dark:text-zinc-400">
                      {row.localidadName}
                    </TableCell>

                    <TableCell className="py-2 px-2 text-center">
                      {row.loansCount > 0 ? (
                        <Badge className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-[10px] px-1.5 py-0">
                          {row.loansCount}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>

                    <TableCell className="py-2 px-2 text-right font-black tabular-nums text-slate-900 dark:text-zinc-100">
                      {row.totalVenta > 0 ? formatCurrency(row.totalVenta) : '—'}
                    </TableCell>

                    <TableCell className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-[11px] font-bold text-slate-400">$</span>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={row.ratePerThousand}
                          onChange={e => handleCustomRateChange(row.promotoraId, e.target.value)}
                          className={cn(
                            "h-6 w-14 text-center font-bold text-xs p-1",
                            row.isCustomRate
                              ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700"
                              : "border-slate-200 text-slate-700 dark:border-zinc-700 dark:text-zinc-300"
                          )}
                        />
                        {row.isCustomRate && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleResetCustomRate(row.promotoraId)}
                            title="Restablecer al valor global"
                            className="h-5 w-5 text-amber-600 hover:text-amber-800 hover:bg-amber-100 p-0"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-2 px-2 text-right font-black tabular-nums text-slate-900 dark:text-zinc-100">
                      {row.aguinaldo > 0 ? formatCurrency(row.aguinaldo) : '$0.00'}
                    </TableCell>

                    <TableCell className="py-2 px-2 text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDetailRow(row)}
                        disabled={row.loansCount === 0}
                        className="h-7 w-7 text-slate-500 hover:text-indigo-900 dark:hover:text-indigo-300"
                        title="Ver auditoría de créditos que integran la venta"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}

              {/* Totals Row */}
              {filteredRows.length > 0 && (
                <TableRow className="bg-slate-200 dark:bg-zinc-800 font-black border-t-2 border-slate-400 dark:border-zinc-600 text-slate-900 dark:text-white">
                  <TableCell className="py-2 px-2 text-center uppercase tracking-wider text-[11px]" colSpan={2}>
                    TOTALES
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    {totals.promotorasConVenta} con venta ({totals.totalPromotoras} grupos)
                  </TableCell>
                  <TableCell className="py-2 px-2 text-slate-500 font-normal">
                    —
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center tabular-nums">
                    {totals.prestamos}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums">
                    {formatCurrency(totals.venta)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center text-slate-600 dark:text-zinc-400 font-normal text-[11px]">
                    ${globalRatePerThousand.toFixed(2)} base x $1,000
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-slate-900 dark:text-white font-black">
                    {formatCurrency(totals.aguinaldo)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center">
                    —
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Loan Detail Modal */}
      <Dialog open={Boolean(detailRow)} onOpenChange={open => !open && setDetailRow(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between border-b pb-3 pr-6">
              <div>
                <DialogTitle className="text-base font-black text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-indigo-700" />
                  Auditoría de Colocación: {detailRow?.promotoraName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Localidad: {detailRow?.localidadName} | Plaza: {detailRow?.plazaName} | Período: {startDate} al {endDate}
                </DialogDescription>
              </div>
              <Badge variant="outline" className="border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 font-bold text-xs px-2 py-1">
                Aguinaldo: {detailRow && formatCurrency(detailRow.aguinaldo)} (${detailRow?.ratePerThousand.toFixed(2)} x cada $1,000)
              </Badge>
            </div>
          </DialogHeader>

          {/* Quick Metrics */}
          {detailRow && (
            <div className="grid grid-cols-3 gap-2 my-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 rounded border">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Venta Total Acumulada</span>
                <span className="font-black text-sm text-slate-900 dark:text-zinc-100">{formatCurrency(detailRow.totalVenta)}</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 rounded border">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Préstamos Otorgados</span>
                <span className="font-black text-sm text-indigo-900 dark:text-indigo-300">{detailRow.loansCount} créditos</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 rounded border">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Aguinaldo Calculado</span>
                <span className="font-black text-sm text-slate-900 dark:text-zinc-100">{formatCurrency(detailRow.aguinaldo)}</span>
              </div>
            </div>
          )}

          {/* Loans List */}
          <div className="border rounded-md overflow-hidden mt-3">
            <Table className="text-xs">
              <TableHeader className="bg-slate-100 dark:bg-zinc-900">
                <TableRow>
                  <TableHead className="py-2 px-2 text-slate-700 dark:text-zinc-300 font-bold">Fecha</TableHead>
                  <TableHead className="py-2 px-2 text-slate-700 dark:text-zinc-300 font-bold">Cliente</TableHead>
                  <TableHead className="py-2 px-2 text-slate-700 dark:text-zinc-300 font-bold">Plan</TableHead>
                  <TableHead className="py-2 px-2 text-right text-slate-700 dark:text-zinc-300 font-bold">Monto</TableHead>
                  <TableHead className="py-2 px-2 text-center text-slate-700 dark:text-zinc-300 font-bold">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRow?.loans.map(loan => {
                  const client = clientMap.get(loan.clientId);
                  const plan = planMap.get(loan.loanPlanId);
                  const dateStr = getLoanDateStr(loan.startDate);

                  return (
                    <TableRow key={loan.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900">
                      <TableCell className="py-1.5 px-2 font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                        {dateStr}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 font-bold text-slate-900 dark:text-zinc-100">
                        {client?.name || 'Cliente sin registrar'}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-slate-600 dark:text-zinc-400">
                        {plan?.name || (plan?.termInWeeks ? `${plan.termInWeeks} semanas` : 'Crédito')}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right font-black tabular-nums text-slate-900 dark:text-zinc-100">
                        {formatCurrency(loan.amount)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center">
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-slate-300">
                          {loan.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
