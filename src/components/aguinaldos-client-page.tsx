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
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { getLoans } from '@/lib/firestore-data';
import { 
  Gift, Calendar, Building, Search, Download, 
  Printer, Eye, DollarSign, TrendingUp, Sparkles,
  RotateCcw, ArrowUpDown, Filter, Landmark, Users,
  RefreshCw, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { cn, parseLocalDate, getMexicoNow } from '@/lib/utils';
import type { Client, LoanPlan, Loan, Plaza, Localidad, Promotora, AppConfig, PromotoraSettlement } from '@/lib/types';
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
  initialSettlements?: PromotoraSettlement[];
}

export interface RecoveredPaymentDetail {
  loanId: string;
  clientId: string;
  clientName: string;
  weekNumber: number;
  dateStr: string;
  amount: number;
}

export interface FallaPaymentDetail {
  loanId: string;
  clientId: string;
  clientName: string;
  weekNumber: number;
  dateStr: string;
  weeklyPayment: number;
  amountPaid: number;
  fallaAmount: number;
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
  falla: number;
  recuperado: number;
  totalGeneral: number;
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
  initialSettlements = [],
}: AguinaldosClientPageProps) {
  const { toast } = useToast();
  const { appUser } = useAuth();

  // Instant local state from SSR props (zero background WebSocket lag)
  const [loans, setLoans] = useState<Loan[]>(initialLoans);
  const [promotoras] = useState<Promotora[]>(initialPromotoras);
  const [localidades] = useState<Localidad[]>(initialLocalidades);
  const [plazas] = useState<Plaza[]>(initialPlazas);
  const [clients] = useState<Client[]>(initialClients);
  const [loanPlans] = useState<LoanPlan[]>(initialLoanPlans);
  const [settlements, setSettlements] = useState<PromotoraSettlement[]>(initialSettlements);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [newLoans, settlementsSnap] = await Promise.all([
        getLoans().catch(() => initialLoans),
        getDocs(collection(db, 'promotoraSettlements')).catch(() => null),
      ]);
      const newSettlements = settlementsSnap
        ? settlementsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PromotoraSettlement))
        : initialSettlements;

      setLoans(newLoans);
      setSettlements(newSettlements);
      toast({
        title: "Datos actualizados",
        description: "Se han recargado los últimos préstamos y cierres con éxito.",
      });
    } catch (err) {
      toast({
        title: "Error al actualizar",
        description: "No se pudieron recargar los datos.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

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
  const [sortBy, setSortBy] = useState<'promotora' | 'plaza' | 'venta' | 'aguinaldo' | 'prestamos' | 'falla' | 'recuperado' | 'totalGeneral'>('venta');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Detail Modal
  const [detailRow, setDetailRow] = useState<PromotoraAguinaldoRow | null>(null);
  const [detailTab, setDetailTab] = useState<'loans' | 'fallas' | 'recuperados'>('loans');

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

  // Ultra-fast single-pass O(N) calculation of table totals
  const rows: PromotoraAguinaldoRow[] = useMemo(() => {
    if (!startDate || !endDate) return [];

    // Pre-create stats accumulator for all promotoras in O(P)
    const statsMap = new Map<string, {
      loansCount: number;
      totalVenta: number;
      loanFalla: number;
      loanRecuperado: number;
      settlementFalla: number;
      settlementRecuperado: number;
      loans: Loan[];
    }>();

    for (let i = 0; i < promotoras.length; i++) {
      statsMap.set(promotoras[i].id, {
        loansCount: 0,
        totalVenta: 0,
        loanFalla: 0,
        loanRecuperado: 0,
        settlementFalla: 0,
        settlementRecuperado: 0,
        loans: [],
      });
    }

    // Single fast pass over all loans in O(L + Payments)
    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i];
      const pId = loan.promotoraId;
      if (!pId) continue;
      const stats = statsMap.get(pId);
      if (!stats) continue;

      const sDate = typeof loan.startDate === 'string' && loan.startDate.length >= 10
        ? loan.startDate.slice(0, 10)
        : '';

      // 1. Check if loan was placed in the selected range
      if (sDate >= startDate && sDate <= endDate) {
        stats.loansCount++;
        stats.totalVenta += (Number(loan.amount) || 0);
        stats.loans.push(loan);
      }

      // 2. Pre-calculate weekly payment for this loan
      const plan = planMap.get(loan.loanPlanId);
      const weeklyPayment = plan ? Math.round(((Number(loan.amount) || 0) / 1000) * (plan.weeklyPaymentRate || 0)) : 0;

      // 3. Scan payments for Falla and Recuperados in the range
      const payments = loan.payments;
      if (payments && payments.length > 0) {
        for (let j = 0; j < payments.length; j++) {
          const p = payments[j];
          if (p.isReverted) continue;

          let pDate = '';
          if (typeof p.date === 'string' && p.date.length >= 10) {
            pDate = p.date.slice(0, 10);
          } else if (typeof p.registeredWeekDate === 'string' && p.registeredWeekDate.length >= 10) {
            pDate = p.registeredWeekDate.slice(0, 10);
          } else {
            pDate = sDate;
          }

          if (pDate >= startDate && pDate <= endDate) {
            if (p.isRecovered || p.paymentType === 'recovered') {
              stats.loanRecuperado += (Number(p.amount) || 0);
            } else if (!p.isAdvance && p.paymentType !== 'adelanto_entrante' && p.paymentType !== 'assumed') {
              const amt = Number(p.amount) || 0;
              if (amt < weeklyPayment && weeklyPayment > 0) {
                stats.loanFalla += (weeklyPayment - amt);
              }
            }
          }
        }
      }
    }

    // Single fast pass over settlements in O(S)
    for (let i = 0; i < settlements.length; i++) {
      const s = settlements[i];
      const pId = s.promotoraId;
      if (!pId) continue;
      const stats = statsMap.get(pId);
      if (!stats) continue;

      const sDate = typeof s.weekDate === 'string' && s.weekDate.length >= 10 ? s.weekDate.slice(0, 10) : '';
      if (sDate >= startDate && sDate <= endDate) {
        stats.settlementFalla += (Number(s.falla) || 0);
        stats.settlementRecuperado += (Number(s.recuperado) || 0);
      }
    }

    // Build final table rows in O(P)
    const result: PromotoraAguinaldoRow[] = new Array(promotoras.length);
    for (let i = 0; i < promotoras.length; i++) {
      const promotora = promotoras[i];
      const loc = locMap.get(promotora.localidadId);
      const plaza = loc ? plazaMap.get(loc.plazaId) : undefined;
      const stats = statsMap.get(promotora.id)!;

      const totalVenta = stats.totalVenta;
      const isCustomRate = customRates[promotora.id] !== undefined;
      const ratePerThousand = isCustomRate ? customRates[promotora.id] : globalRatePerThousand;
      const aguinaldo = Math.round((totalVenta / 1000) * ratePerThousand);

      const falla = Math.max(stats.loanFalla, stats.settlementFalla);
      const recuperado = stats.loanRecuperado + stats.settlementRecuperado;
      const totalGeneral = totalVenta - falla + recuperado;

      result[i] = {
        promotoraId: promotora.id,
        promotoraName: promotora.name,
        localidadId: promotora.localidadId,
        localidadName: loc?.name || 'Sin Localidad',
        plazaId: plaza?.id || 'SIN_PLAZA',
        plazaName: plaza?.name || 'Sin Plaza',
        loansCount: stats.loansCount,
        totalVenta,
        ratePerThousand,
        isCustomRate,
        aguinaldo,
        falla,
        recuperado,
        totalGeneral,
        loans: stats.loans,
      };
    }

    return result;
  }, [promotoras, loans, settlements, startDate, endDate, globalRatePerThousand, customRates, locMap, plazaMap, planMap]);

  // Lazy detail computation: Only runs when the modal is opened for a specific promotora
  const { detailFallaPayments, detailRecoveredPayments } = useMemo(() => {
    if (!detailRow) return { detailFallaPayments: [], detailRecoveredPayments: [] };

    const pId = detailRow.promotoraId;
    const pLoans = loans.filter(l => l.promotoraId === pId);
    const fallas: FallaPaymentDetail[] = [];
    const recovered: RecoveredPaymentDetail[] = [];

    for (let i = 0; i < pLoans.length; i++) {
      const loan = pLoans[i];
      const client = clientMap.get(loan.clientId);
      const clientName = client?.name || 'Cliente sin registrar';
      const plan = planMap.get(loan.loanPlanId);
      const weeklyPayment = plan ? Math.round(((Number(loan.amount) || 0) / 1000) * (plan.weeklyPaymentRate || 0)) : 0;
      const sDate = typeof loan.startDate === 'string' && loan.startDate.length >= 10 ? loan.startDate.slice(0, 10) : '';

      const payments = loan.payments;
      if (!payments || payments.length === 0) continue;

      for (let j = 0; j < payments.length; j++) {
        const p = payments[j];
        if (p.isReverted) continue;

        let pDate = '';
        if (typeof p.date === 'string' && p.date.length >= 10) {
          pDate = p.date.slice(0, 10);
        } else if (typeof p.registeredWeekDate === 'string' && p.registeredWeekDate.length >= 10) {
          pDate = p.registeredWeekDate.slice(0, 10);
        } else {
          pDate = sDate;
        }

        if (pDate >= startDate && pDate <= endDate) {
          if (p.isRecovered || p.paymentType === 'recovered') {
            recovered.push({
              loanId: loan.id,
              clientId: loan.clientId,
              clientName,
              weekNumber: p.weekNumber || 0,
              dateStr: pDate,
              amount: Number(p.amount) || 0,
            });
          } else if (!p.isAdvance && p.paymentType !== 'adelanto_entrante' && p.paymentType !== 'assumed') {
            const amt = Number(p.amount) || 0;
            if (amt < weeklyPayment && weeklyPayment > 0) {
              fallas.push({
                loanId: loan.id,
                clientId: loan.clientId,
                clientName,
                weekNumber: p.weekNumber || 0,
                dateStr: pDate,
                weeklyPayment,
                amountPaid: amt,
                fallaAmount: weeklyPayment - amt,
              });
            }
          }
        }
      }
    }

    return { detailFallaPayments: fallas, detailRecoveredPayments: recovered };
  }, [detailRow, loans, startDate, endDate, clientMap, planMap]);

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
      } else if (sortBy === 'falla') {
        cmp = a.falla - b.falla;
      } else if (sortBy === 'recuperado') {
        cmp = a.recuperado - b.recuperado;
      } else if (sortBy === 'totalGeneral') {
        cmp = a.totalGeneral - b.totalGeneral;
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
    let falla = 0;
    let recuperado = 0;
    let totalGeneral = 0;

    filteredRows.forEach(r => {
      venta += r.totalVenta;
      aguinaldo += r.aguinaldo;
      prestamos += r.loansCount;
      falla += r.falla;
      recuperado += r.recuperado;
      totalGeneral += r.totalGeneral;
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
      falla,
      recuperado,
      totalGeneral,
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
      'Aguinaldo Calculado ($)',
      'Falla ($)',
      'Recuperados ($)',
      'Total General ($)'
    ];

    const dataLines = filteredRows.map((r, idx) => [
      idx + 1,
      `"${r.plazaName}"`,
      `"${r.promotoraName}"`,
      `"${r.localidadName}"`,
      r.loansCount,
      r.totalVenta,
      `$${r.ratePerThousand.toFixed(2)}`,
      r.aguinaldo,
      r.falla,
      r.recuperado,
      r.totalGeneral
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
      totals.aguinaldo,
      totals.falla,
      totals.recuperado,
      totals.totalGeneral
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
        ['#', 'Plaza', 'Grupo / Promotora', 'Localidad', 'Prést.', 'Venta Colocada', '$ x Mil', 'Aguinaldo', 'Falla (-)', 'Recuperados (+)', 'Total General']
      ];

      const tableData = filteredRows.map((r, i) => [
        (i + 1).toString(),
        r.plazaName,
        r.promotoraName,
        r.localidadName,
        r.loansCount.toString(),
        formatCurrency(r.totalVenta),
        `$${r.ratePerThousand.toFixed(2)}${r.isCustomRate ? ' *' : ''}`,
        formatCurrency(r.aguinaldo),
        r.falla > 0 ? `-${formatCurrency(r.falla)}` : '$0.00',
        r.recuperado > 0 ? `+${formatCurrency(r.recuperado)}` : '$0.00',
        formatCurrency(r.totalGeneral)
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
        formatCurrency(totals.aguinaldo),
        `-${formatCurrency(totals.falla)}`,
        `+${formatCurrency(totals.recuperado)}`,
        formatCurrency(totals.totalGeneral)
      ]);

      doc.autoTable({
        startY: 72,
        head: tableHeaders,
        body: tableData,
        theme: 'plain',
        margin: { left: marginX, right: marginX, bottom: 45 },
        styles: {
          fontSize: 7,
          cellPadding: 3.5,
          textColor: [15, 23, 42],
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 7.5
        },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 65 },
          2: { cellWidth: 125, fontStyle: 'bold' },
          3: { cellWidth: 85 },
          4: { cellWidth: 35, halign: 'center' },
          5: { cellWidth: 72, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 46, halign: 'center' },
          7: { cellWidth: 70, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 65, halign: 'right', textColor: [190, 18, 60] },
          9: { cellWidth: 65, halign: 'right' },
          10: { cellWidth: 80, halign: 'right', fontStyle: 'bold' }
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

            {/* Actions: Refresh, Export PDF, Export CSV */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                className="h-9 text-xs border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
                title="Actualizar datos desde el servidor"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isRefreshing && "animate-spin text-indigo-600")} />
                {isRefreshing ? 'Actualizando...' : 'Actualizar'}
              </Button>

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
              {/* Row 1: Section Dividers */}
              <TableRow className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 hover:bg-transparent">
                <TableHead colSpan={8} className="py-1.5 px-3 text-left font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-zinc-200 border-r-2 border-slate-300 dark:border-zinc-700 bg-indigo-50/40 dark:bg-indigo-950/20">
                  Venta y Aguinaldos
                </TableHead>
                <TableHead colSpan={3} className="py-1.5 px-3 text-left font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-zinc-200 border-r-2 border-slate-300 dark:border-zinc-700 bg-slate-100/70 dark:bg-zinc-800/60">
                  Calculo para bonos
                </TableHead>
                <TableHead className="py-1.5 px-2 text-center font-bold text-[10px] uppercase text-slate-400 hover:bg-transparent">
                  Acción
                </TableHead>
              </TableRow>

              {/* Row 2: Column Headers */}
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
                  className="py-2.5 px-2 text-right text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none border-r-2 border-slate-300 dark:border-zinc-700"
                >
                  <div className="flex items-center justify-end gap-1">
                    Aguinaldo Calculado
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHead>

                {/* Right block: Falla, Recuperados, Total General */}
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'falla') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('falla'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-2 text-right text-[11px] font-bold text-rose-700 dark:text-rose-400 cursor-pointer select-none bg-rose-50/20 dark:bg-rose-950/10"
                >
                  <div className="flex items-center justify-end gap-1">
                    Falla (-)
                    <ArrowUpDown className="w-3 h-3 text-rose-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'recuperado') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('recuperado'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-2 text-right text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    Recuperados (+)
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => {
                    if (sortBy === 'totalGeneral') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('totalGeneral'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-2 text-right text-[11px] font-black text-slate-900 dark:text-white cursor-pointer select-none border-r-2 border-slate-300 dark:border-zinc-700 bg-slate-100/60 dark:bg-zinc-800/40"
                  title="Total General = Venta Colocada - Falla + Recuperados"
                >
                  <div className="flex items-center justify-end gap-1">
                    Total General (=)
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
                  <TableCell colSpan={12} className="py-8 text-center text-slate-500">
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

                    <TableCell className="py-2 px-2 text-right font-black tabular-nums text-slate-900 dark:text-zinc-100 border-r-2 border-slate-300 dark:border-zinc-700">
                      {row.aguinaldo > 0 ? formatCurrency(row.aguinaldo) : '$0.00'}
                    </TableCell>

                    {/* Right block: Falla, Recuperado, Total General */}
                    <TableCell className="py-2 px-2 text-right font-bold tabular-nums text-rose-600 dark:text-rose-400 bg-rose-50/20 dark:bg-rose-950/10">
                      {row.falla > 0 ? `-${formatCurrency(row.falla)}` : '$0.00'}
                    </TableCell>

                    <TableCell className="py-2 px-2 text-right font-bold tabular-nums text-slate-900 dark:text-zinc-100">
                      {row.recuperado > 0 ? `+${formatCurrency(row.recuperado)}` : '$0.00'}
                    </TableCell>

                    <TableCell className={cn(
                      "py-2 px-2 text-right font-black tabular-nums border-r-2 border-slate-300 dark:border-zinc-700 bg-slate-100/40 dark:bg-zinc-900/40",
                      row.totalGeneral >= 0 ? "text-slate-900 dark:text-zinc-100" : "text-rose-600 dark:text-rose-400"
                    )}>
                      {formatCurrency(row.totalGeneral)}
                    </TableCell>

                    <TableCell className="py-2 px-2 text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setDetailRow(row);
                          setDetailTab(
                            row.loansCount > 0 
                              ? 'loans' 
                              : row.falla > 0 
                                ? 'fallas' 
                                : 'recuperados'
                          );
                        }}
                        disabled={row.loansCount === 0 && row.recuperado === 0 && row.falla === 0}
                        className="h-7 w-7 text-slate-500 hover:text-indigo-900 dark:hover:text-indigo-300"
                        title="Ver auditoría de colocación, fallas y recuperados"
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
                  <TableCell className="py-2 px-2 text-right tabular-nums text-slate-900 dark:text-white font-black border-r-2 border-slate-400 dark:border-zinc-600">
                    {formatCurrency(totals.aguinaldo)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums font-black text-rose-700 dark:text-rose-400 bg-rose-100/40 dark:bg-rose-950/30">
                    -{formatCurrency(totals.falla)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums font-black text-slate-900 dark:text-white">
                    +{formatCurrency(totals.recuperado)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums font-black text-slate-900 dark:text-white border-r-2 border-slate-400 dark:border-zinc-600 bg-slate-300/40 dark:bg-zinc-700/40">
                    {formatCurrency(totals.totalGeneral)}
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
            <div className="space-y-2 my-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 rounded border">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Venta Colocada</span>
                  <span className="font-black text-sm text-slate-900 dark:text-zinc-100">{formatCurrency(detailRow.totalVenta)}</span>
                  <span className="text-[10px] text-slate-400 block">{detailRow.loansCount} créditos</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 rounded border">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Aguinaldo</span>
                  <span className="font-black text-sm text-slate-900 dark:text-zinc-100">{formatCurrency(detailRow.aguinaldo)}</span>
                  <span className="text-[10px] text-slate-400 block">${detailRow.ratePerThousand.toFixed(2)} x $1,000</span>
                </div>
                <div className="p-2.5 bg-rose-50/50 dark:bg-rose-950/20 rounded border border-rose-200 dark:border-rose-900">
                  <span className="text-rose-600 dark:text-rose-400 text-[10px] uppercase font-bold block">Falla (-)</span>
                  <span className="font-black text-sm text-rose-700 dark:text-rose-400">-{formatCurrency(detailRow.falla)}</span>
                  <span className="text-[10px] text-rose-500/80 block">Acumulada</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 rounded border">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Recuperados (+)</span>
                  <span className="font-black text-sm text-slate-900 dark:text-zinc-100">+{formatCurrency(detailRow.recuperado)}</span>
                  <span className="text-[10px] text-slate-400 block">Cobranza recuperada</span>
                </div>
                <div className="p-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded border border-indigo-200 dark:border-indigo-900 col-span-2 sm:col-span-1">
                  <span className="text-indigo-900 dark:text-indigo-300 text-[10px] uppercase font-bold block">Total General (=)</span>
                  <span className="font-black text-sm text-indigo-950 dark:text-white">{formatCurrency(detailRow.totalGeneral)}</span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block font-semibold">Venta - Falla + Recup.</span>
                </div>
              </div>
            </div>
          )}

          {/* Tabs for Colocación vs Fallas vs Recuperados */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2 mt-4 flex-wrap">
            <button
              type="button"
              onClick={() => setDetailTab('loans')}
              className={cn(
                "text-xs font-bold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
                detailTab === 'loans'
                  ? "bg-indigo-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              <span>Préstamos Colocados</span>
              <Badge variant="outline" className={cn("text-[10px] px-1 py-0", detailTab === 'loans' ? "border-white/40 text-white bg-indigo-800" : "border-slate-300 text-slate-600")}>
                {detailRow?.loansCount || 0}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setDetailTab('fallas')}
              className={cn(
                "text-xs font-bold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
                detailTab === 'fallas'
                  ? "bg-rose-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              <span>Fallas Registradas</span>
              <Badge variant="outline" className={cn("text-[10px] px-1 py-0", detailTab === 'fallas' ? "border-white/40 text-white bg-rose-800" : "border-rose-300 text-rose-700")}>
                {detailFallaPayments.length} (-{detailRow && formatCurrency(detailRow.falla)})
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setDetailTab('recuperados')}
              className={cn(
                "text-xs font-bold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
                detailTab === 'recuperados'
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              <span>Abonos Recuperados</span>
              <Badge variant="outline" className={cn("text-[10px] px-1 py-0", detailTab === 'recuperados' ? "border-white/40 text-white bg-slate-950" : "border-slate-300 text-slate-700")}>
                {detailRecoveredPayments.length} (+{detailRow && formatCurrency(detailRow.recuperado)})
              </Badge>
            </button>
          </div>

          {/* Tab 1: Placed Loans */}
          {detailTab === 'loans' && (
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
                  {!detailRow?.loans || detailRow.loans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                        No se otorgaron préstamos para este grupo en el período seleccionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailRow.loans.map(loan => {
                      const client = clientMap.get(loan.clientId);
                      const plan = planMap.get(loan.loanPlanId);
                      const dateStr = typeof loan.startDate === 'string' && loan.startDate.length >= 10 ? loan.startDate.slice(0, 10) : '';

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
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Tab 2: Registered Fallas */}
          {detailTab === 'fallas' && (
            <div className="border rounded-md overflow-hidden mt-3">
              <Table className="text-xs">
                <TableHeader className="bg-rose-50/70 dark:bg-rose-950/20">
                  <TableRow>
                    <TableHead className="py-2 px-2 text-rose-950 dark:text-rose-200 font-bold">Fecha</TableHead>
                    <TableHead className="py-2 px-2 text-rose-950 dark:text-rose-200 font-bold">Cliente</TableHead>
                    <TableHead className="py-2 px-2 text-center text-rose-950 dark:text-rose-200 font-bold">Semana #</TableHead>
                    <TableHead className="py-2 px-2 text-right text-rose-950 dark:text-rose-200 font-bold">Cuota Semanal</TableHead>
                    <TableHead className="py-2 px-2 text-right text-rose-950 dark:text-rose-200 font-bold">Pagado</TableHead>
                    <TableHead className="py-2 px-2 text-right text-rose-950 dark:text-rose-200 font-bold">Falla (-)</TableHead>
                    <TableHead className="py-2 px-2 text-center text-rose-950 dark:text-rose-200 font-bold">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailFallaPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                        No se registraron fallas para este grupo en el período seleccionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailFallaPayments.map((f, idx) => (
                      <TableRow key={`${f.loanId}_${f.weekNumber}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-zinc-900">
                        <TableCell className="py-1.5 px-2 font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                          {f.dateStr}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 font-bold text-slate-900 dark:text-zinc-100">
                          {f.clientName}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center text-slate-600 dark:text-zinc-400 font-semibold">
                          Semana {f.weekNumber}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right tabular-nums text-slate-600 dark:text-zinc-400">
                          {formatCurrency(f.weeklyPayment)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right tabular-nums text-slate-600 dark:text-zinc-400">
                          {f.amountPaid > 0 ? formatCurrency(f.amountPaid) : '$0.00'}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-black tabular-nums text-rose-700 dark:text-rose-400">
                          -{formatCurrency(f.fallaAmount)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          {f.amountPaid === 0 ? (
                            <Badge className="bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] px-1.5 py-0 font-bold">
                              Falla Total ($0)
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] px-1.5 py-0 font-bold">
                              Parcial
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Tab 3: Recovered Payments */}
          {detailTab === 'recuperados' && (
            <div className="border rounded-md overflow-hidden mt-3">
              <Table className="text-xs">
                <TableHeader className="bg-slate-100 dark:bg-zinc-900">
                  <TableRow>
                    <TableHead className="py-2 px-2 text-slate-700 dark:text-zinc-300 font-bold">Fecha Abono</TableHead>
                    <TableHead className="py-2 px-2 text-slate-700 dark:text-zinc-300 font-bold">Cliente</TableHead>
                    <TableHead className="py-2 px-2 text-center text-slate-700 dark:text-zinc-300 font-bold">Semana #</TableHead>
                    <TableHead className="py-2 px-2 text-right text-slate-700 dark:text-zinc-300 font-bold">Monto Recuperado</TableHead>
                    <TableHead className="py-2 px-2 text-center text-slate-700 dark:text-zinc-300 font-bold">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRecoveredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                        No se registraron abonos marcados como recuperados en este período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailRecoveredPayments.map((rec, idx) => (
                      <TableRow key={`${rec.loanId}_${rec.weekNumber}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-zinc-900">
                        <TableCell className="py-1.5 px-2 font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                          {rec.dateStr}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 font-bold text-slate-900 dark:text-zinc-100">
                          {rec.clientName}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center text-slate-600 dark:text-zinc-400 font-semibold">
                          Semana {rec.weekNumber}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-black tabular-nums text-slate-900 dark:text-zinc-100">
                          +{formatCurrency(rec.amount)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <Badge variant="outline" className="border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 text-[10px] px-1.5 py-0 font-bold">
                            Recuperado
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
