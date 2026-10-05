'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FileDown, FileSpreadsheet, Loader2, Info, Landmark, AlertCircle, FileText, CheckCircle, FileBarChart2, X } from 'lucide-react';
import type { Loan, Client, LoanPlan, Plaza, Localidad, Promotora } from '@/lib/types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { getCurrentLoanWeekNumber } from '@/lib/utils';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

interface ReportsSectionProps {
  loans: Loan[];
  clients: Client[];
  loanPlans: LoanPlan[];
  plazas: Plaza[];
  localidades: Localidad[];
  promotoras: Promotora[];
}

type ReportType = 'loans_active' | 'loans_overdue' | 'loans_pending' | 'clients_list';

// Helper to handle dates consistently
const parseDate = (d: any): Date => {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  return new Date(d);
};

export function ReportsSection({ loans, clients, loanPlans, plazas, localidades, promotoras }: ReportsSectionProps) {
  const [reportType, setReportType] = useState<ReportType>('loans_active');
  const [selectedPlaza, setSelectedPlaza] = useState('all');
  const [selectedLocalidad, setSelectedLocalidad] = useState('all');
  const [selectedPromotora, setSelectedPromotora] = useState('all');
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // Client list status filter
  const [clientStatusFilter, setClientStatusFilter] = useState<'all' | 'with_debt' | 'up_to_date' | 'no_active_loans'>('all');

  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const { toast } = useToast();

  // Alphabetical sorting
  const sortedPlazas = useMemo(() => [...plazas].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [plazas]);
  const sortedPlans = useMemo(() => [...loanPlans].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [loanPlans]);

  const filteredLocalidades = useMemo(() => {
    let result = selectedPlaza === 'all' ? localidades : localidades.filter(l => l.plazaId === selectedPlaza);
    return [...result].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [selectedPlaza, localidades]);

  const filteredPromotoras = useMemo(() => {
    let result;
    if (selectedLocalidad === 'all') {
       if (selectedPlaza === 'all') {
         result = promotoras;
       } else {
         const plazaLocalidadIds = localidades.filter(l => l.plazaId === selectedPlaza).map(l => l.id);
         result = promotoras.filter(p => plazaLocalidadIds.includes(p.localidadId));
       }
    } else {
      result = promotoras.filter(p => p.localidadId === selectedLocalidad);
    }
    return [...result].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [selectedLocalidad, selectedPlaza, promotoras, localidades]);

  // Main selector and calculator for dynamic report data
  const reportData = useMemo(() => {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    // 1. Process Loans Reports
    if (reportType !== 'clients_list') {
      return loans
        .filter(loan => {
          if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') return false;

          const plan = loanPlans.find(p => p.id === loan.loanPlanId);
          const promotora = promotoras.find(p => p.id === loan.promotoraId);
          const localidad = localidades.find(l => l.id === promotora?.localidadId);
          if (!plan || !promotora || !localidad) return false;

          // Apply filters
          const plazaMatch = selectedPlaza === 'all' || localidad.plazaId === selectedPlaza;
          const localidadMatch = selectedLocalidad === 'all' || promotora.localidadId === selectedLocalidad;
          const promotoraMatch = selectedPromotora === 'all' || loan.promotoraId === selectedPromotora;
          const planMatch = selectedPlan === 'all' || loan.loanPlanId === selectedPlan;
          
          let dateMatch = true;
          if (dateRange && dateRange.from) {
            const loanDate = parseDate(loan.startDate);
            const toDate = dateRange.to ? dateRange.to : dateRange.from;
            dateMatch = loanDate >= dateRange.from && loanDate <= toDate;
          }

          if (!plazaMatch || !localidadMatch || !promotoraMatch || !planMatch || !dateMatch) return false;

          // Segment by report type
          const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
          const baseTerm = plan.termInWeeks;
          const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));
          const isExpired = currentLoanWeek > baseTerm;

          const currentPayments = loan.payments || [];
          const actualTotalPaid = currentPayments.reduce((acc, p) => acc + p.amount, 0);

          let missedCount = 0;
          let totalPaidInBaseTerm = 0;
          let baseArrears = 0;
          
          for (let i = 1; i <= baseTerm; i++) {
            const p = currentPayments.find(pay => pay.weekNumber === i);
            if (p) {
              totalPaidInBaseTerm += p.amount;
              if (p.amount < weeklyPayment) {
                missedCount++;
                baseArrears += (weeklyPayment - p.amount);
              }
            } else if (i < currentLoanWeek) {
              missedCount++;
              baseArrears += weeklyPayment;
            }
          }

          const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
          let penaltyArrear = 0;
          if (hasPenalty) {
              const penaltyWeekNum = baseTerm + 1;
              const pExtra = currentPayments.find(pay => pay.weekNumber === penaltyWeekNum);
              penaltyArrear = weeklyPayment - (pExtra?.amount || 0);
          }
          const calculatedTotalDue = baseArrears + penaltyArrear;
          const totalTerm = baseTerm + (hasPenalty ? 1 : 0);
          const totalExpected = totalTerm * weeklyPayment;
          const loanBalance = Math.max(0, totalExpected - actualTotalPaid);

          if (reportType === 'loans_active') {
            // Vigentes: active in base term and not expired
            return !isExpired;
          } else if (reportType === 'loans_overdue') {
            // Cartera Vencida: expired with debt
            return isExpired && loanBalance > 0;
          } else if (reportType === 'loans_pending') {
            // Pendientes: active, with 2+ missed payments and failure amount > 0
            return !isExpired && missedCount >= 2 && calculatedTotalDue > 0;
          }
          return false;
        })
        .map(loan => {
          const client = clients.find(c => c.id === loan.clientId);
          const plan = loanPlans.find(p => p.id === loan.loanPlanId);
          const promotora = promotoras.find(p => p.id === loan.promotoraId);
          const localidad = localidades.find(l => l.id === promotora?.localidadId);
          const plaza = plazas.find(p => p.id === localidad?.plazaId);

          const weeklyPayment = (loan.amount / 1000) * plan!.weeklyPaymentRate;
          const baseTerm = plan!.termInWeeks;
          const currentPayments = loan.payments || [];
          const actualTotalPaid = currentPayments.reduce((acc, p) => acc + p.amount, 0);

          let missedCount = 0;
          let totalPaidInBaseTerm = 0;
          let baseArrears = 0;

          const loanStartDate = parseDate(loan.startDate);
          const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));

          for (let i = 1; i <= baseTerm; i++) {
            const p = currentPayments.find(pay => pay.weekNumber === i);
            if (p) {
              totalPaidInBaseTerm += p.amount;
              if (p.amount < weeklyPayment) {
                missedCount++;
                baseArrears += (weeklyPayment - p.amount);
              }
            } else if (i < currentLoanWeek) {
              missedCount++;
              baseArrears += weeklyPayment;
            }
          }

          const hasPenalty = (missedCount >= 2) || (currentLoanWeek > baseTerm && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
          let penaltyArrear = 0;
          if (hasPenalty) {
              const penaltyWeekNum = baseTerm + 1;
              const pExtra = currentPayments.find(pay => pay.weekNumber === penaltyWeekNum);
              penaltyArrear = weeklyPayment - (pExtra?.amount || 0);
          }
          const calculatedTotalDue = baseArrears + penaltyArrear;
          const totalTerm = baseTerm + (hasPenalty ? 1 : 0);
          const totalExpected = totalTerm * weeklyPayment;
          const loanBalance = Math.max(0, totalExpected - actualTotalPaid);

          // Calculate expiry date
          const expiryDate = new Date(loanStartDate);
          expiryDate.setDate(loanStartDate.getDate() + (totalTerm * 7));

          return {
            id: loan.id,
            plaza: plaza?.name || 'N/A',
            localidad: localidad?.name || 'N/A',
            promotora: promotora?.name || 'N/A',
            cliente: client?.name || 'N/A',
            telefono: client?.phone || '',
            plan: plan?.name || 'N/A',
            montoPrestado: loan.amount,
            fechaInicio: loanStartDate,
            fechaVencimiento: expiryDate,
            abonos: actualTotalPaid,
            saldo: loanBalance,
            fallosCount: missedCount,
            fallosMonto: calculatedTotalDue
          };
        });
    }

    // 2. Process Clients Report
    return clients
      .filter(client => {
        // Find all client loans to see if they fit plaza/localidad/promotora filters
        const clientLoans = loans.filter(l => l.clientId === client.id);
        
        let matchHierarchy = true;
        if (selectedPlaza !== 'all' || selectedLocalidad !== 'all' || selectedPromotora !== 'all') {
          matchHierarchy = clientLoans.some(loan => {
            const promotora = promotoras.find(p => p.id === loan.promotoraId);
            const localidad = localidades.find(l => l.id === promotora?.localidadId);
            if (!promotora || !localidad) return false;

            const plazaMatch = selectedPlaza === 'all' || localidad.plazaId === selectedPlaza;
            const localidadMatch = selectedLocalidad === 'all' || promotora.localidadId === selectedLocalidad;
            const promotoraMatch = selectedPromotora === 'all' || loan.promotoraId === selectedPromotora;

            return plazaMatch && localidadMatch && promotoraMatch;
          });
          // If the client has no loans at all, and a geofilter is set, exclude them
          if (clientLoans.length === 0) matchHierarchy = false;
        }

        if (!matchHierarchy) return false;

        // Calculate active loans details
        const activeLoans = clientLoans.filter(l => l.status !== 'Paid Off' && l.status !== 'Pagado desde CV');

        // Status Filter
        if (clientStatusFilter === 'with_debt') {
          return activeLoans.length > 0;
        } else if (clientStatusFilter === 'no_active_loans') {
          return activeLoans.length === 0;
        } else if (clientStatusFilter === 'up_to_date') {
          // Has active loans, but none of them are overdue or pending
          if (activeLoans.length === 0) return false;
          
          const hasAdeudos = activeLoans.some(loan => {
            const plan = loanPlans.find(p => p.id === loan.loanPlanId);
            if (!plan) return false;
            
            const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
            const baseTerm = plan.termInWeeks;
            const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));

            let missedCount = 0;
            for (let i = 1; i <= baseTerm; i++) {
              const p = loan.payments.find(pay => pay.weekNumber === i);
              if (!p && i < currentLoanWeek) {
                missedCount++;
              }
            }
            return missedCount >= 2;
          });
          return !hasAdeudos;
        }

        return true;
      })
      .map(client => {
        const clientLoans = loans.filter(l => l.clientId === client.id && l.status !== 'Paid Off' && l.status !== 'Pagado desde CV');
        let totalDebt = 0;

        clientLoans.forEach(loan => {
          const plan = loanPlans.find(p => p.id === loan.loanPlanId);
          if (!plan) return;
          const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
          const baseTerm = plan.termInWeeks;
          
          const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));

          let missedCount = 0;
          const currentPayments = loan.payments || [];
          const actualTotalPaid = currentPayments.reduce((acc, p) => acc + p.amount, 0);

          for (let i = 1; i <= baseTerm; i++) {
            const p = currentPayments.find(pay => pay.weekNumber === i);
            if (!p && i < currentLoanWeek) {
              missedCount++;
            }
          }
          const hasPenalty = (missedCount >= 2) || (currentLoanWeek > baseTerm && (actualTotalPaid < baseTerm * weeklyPayment));
          const totalTerm = baseTerm + (hasPenalty ? 1 : 0);
          totalDebt += Math.max(0, (totalTerm * weeklyPayment) - actualTotalPaid);
        });

        // Simplified endorsement format parsing
        let avalName = client.endorsement;
        let avalPhone = '';
        const match = client.endorsement.match(/(.*) \((.*)\)/);
        if (match) {
          avalName = match[1];
          const details = match[2].split(',').map(s => s.trim());
          const phoneMatch = details.find(d => d.toLowerCase().startsWith('tel:'));
          if (phoneMatch) avalPhone = phoneMatch.replace(/tel:/i, '').trim();
        }

        return {
          id: client.id,
          cliente: client.name,
          telefono: client.phone,
          direccion: `${client.street}, ${client.neighborhood}`,
          aval: avalName,
          avalTelefono: avalPhone,
          prestamosActivosCount: clientLoans.length,
          deudaTotal: totalDebt,
          calle: client.street,
          colonia: client.neighborhood,
          cp: client.postalCode,
          ciudad: client.city,
          garantia: client.guarantee
        };
      });

  }, [reportType, loans, clients, loanPlans, plazas, localidades, promotoras, selectedPlaza, selectedLocalidad, selectedPromotora, selectedPlan, dateRange, clientStatusFilter]);

  // Real-time Preview stats summary
  const summaryStats = useMemo(() => {
    let count = reportData.length;
    let totalColocado = 0;
    let totalSaldo = 0;

    if (reportType !== 'clients_list') {
      const data = reportData as any[];
      totalColocado = data.reduce((s, item) => s + (item.montoPrestado || 0), 0);
      totalSaldo = data.reduce((s, item) => s + (item.saldo || 0), 0);
    } else {
      const data = reportData as any[];
      totalSaldo = data.reduce((s, item) => s + (item.deudaTotal || 0), 0);
    }

    return { count, totalColocado, totalSaldo };
  }, [reportData, reportType]);

  const handleExportExcel = () => {
    if (reportData.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin Registros',
        description: 'No hay datos que exportar con los filtros seleccionados.',
      });
      return;
    }
    setIsExportingExcel(true);

    try {
      let dataToExport: any[] = [];
      let sheetName = 'Informe';

      if (reportType === 'loans_active') {
        sheetName = 'Prestamos Activos';
        dataToExport = (reportData as any[]).map(item => ({
          'Plaza': item.plaza,
          'Localidad': item.localidad,
          'Promotora': item.promotora,
          'Cliente': item.cliente,
          'Teléfono': item.telefono,
          'Plan': item.plan,
          'Cantidad Prestada': item.montoPrestado,
          'Fecha de Inicio': item.fechaInicio.toLocaleDateString('es-MX'),
          'Abonos Realizados': item.abonos,
          'Saldo Pendiente': item.saldo
        }));
      } else if (reportType === 'loans_overdue') {
        sheetName = 'Cartera Vencida';
        dataToExport = (reportData as any[]).map(item => ({
          'Plaza': item.plaza,
          'Localidad': item.localidad,
          'Promotora': item.promotora,
          'Cliente': item.cliente,
          'Teléfono': item.telefono,
          'Plan': item.plan,
          'Cantidad Prestada': item.montoPrestado,
          'Fecha de Vencimiento': item.fechaVencimiento.toLocaleDateString('es-MX'),
          'Abonos Realizados': item.abonos,
          'Adeudo Vencido': item.saldo
        }));
      } else if (reportType === 'loans_pending') {
        sheetName = 'Pagos Pendientes';
        dataToExport = (reportData as any[]).map(item => ({
          'Plaza': item.plaza,
          'Localidad': item.localidad,
          'Promotora': item.promotora,
          'Cliente': item.cliente,
          'Teléfono': item.telefono,
          'Plan': item.plan,
          'Cantidad Prestada': item.montoPrestado,
          'Semanas con Fallos': item.fallosCount,
          'Monto del Fallo': item.fallosMonto,
          'Saldo Restante': item.saldo
        }));
      } else if (reportType === 'clients_list') {
        sheetName = 'Directorio Clientes';
        dataToExport = (reportData as any[]).map(item => ({
          'Cliente': item.cliente,
          'Teléfono': item.telefono,
          'Calle y Número': item.calle,
          'Colonia': item.colonia,
          'C.P.': item.cp,
          'Ciudad': item.ciudad,
          'Garantía': item.garantia,
          'Aval': item.aval,
          'Teléfono Aval': item.avalTelefono,
          'Préstamos Activos': item.prestamosActivosCount,
          'Deuda Total': item.deudaTotal
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      // Currency Formatting
      const currencyFormat = '"$"#,##0.00';
      const colWidths = Object.keys(dataToExport[0] || {}).map(key => ({ wch: key.length + 5 }));

      // Detect money columns and format worksheet cells
      dataToExport.forEach((row, rowIndex) => {
        Object.keys(row).forEach((key, colIndex) => {
          if (row[key] && String(row[key]).length > colWidths[colIndex].wch) {
            colWidths[colIndex].wch = String(row[key]).length + 2;
          }
          const isCurrency = key.includes('Monto') || key.includes('Cantidad') || key.includes('Saldo') || key.includes('Abonos') || key.includes('Fallo') || key.includes('Deuda') || key.includes('Adeudo');
          if (isCurrency) {
            const cellRef = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex + 1 });
            if (worksheet[cellRef]) worksheet[cellRef].z = currencyFormat;
          }
        });
      });
      worksheet['!cols'] = colWidths;

      const fileName = `${sheetName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast({
        title: 'Reporte Generado',
        description: `Se exportaron ${dataToExport.length} registros a Excel correctamente.`,
      });

    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error al exportar',
        description: `Ocurrió un error al generar Excel: ${error.message}`,
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPDF = () => {
    if (reportData.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin Registros',
        description: 'No hay datos que exportar con los filtros seleccionados.',
      });
      return;
    }
    setIsExportingPDF(true);

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }) as jsPDFWithAutoTable;
      const todayString = new Date().toLocaleString('es-MX');

      let title = '';
      let headers: string[] = [];
      let body: any[][] = [];
      let totalAmount = 0;
      let totalSaldo = 0;

      // 1. Structure the table content and title according to selection
      if (reportType === 'loans_active') {
        title = 'REPORTE DE CONTROL: PRÉSTAMOS ACTIVOS (VIGENTES)';
        headers = ['Plaza', 'Localidad', 'Promotora', 'Cliente', 'Teléfono', 'Plan', 'Cant. Prestada', 'F. Inicio', 'Abonos', 'Saldo'];
        body = (reportData as any[]).map(item => {
          totalAmount += item.montoPrestado;
          totalSaldo += item.saldo;
          return [
            item.plaza,
            item.localidad,
            item.promotora,
            item.cliente.toUpperCase(),
            item.telefono,
            item.plan,
            `$${item.montoPrestado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            item.fechaInicio.toLocaleDateString('es-MX'),
            `$${item.abonos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            `$${item.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
          ];
        });
        body.push([
          'TOTAL CONSOLIDADO', '', '', '', '', '',
          `$${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
          '',
          '',
          `$${totalSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
        ]);
      } else if (reportType === 'loans_overdue') {
        title = 'REPORTE DE CONTROL: CARTERA VENCIDA (EXPIRADOS CON ADEUDO)';
        headers = ['Plaza', 'Localidad', 'Promotora', 'Cliente', 'Teléfono', 'Plan', 'Cant. Prestada', 'F. Vencimiento', 'Abonos', 'Adeudo Vencido'];
        body = (reportData as any[]).map(item => {
          totalAmount += item.montoPrestado;
          totalSaldo += item.saldo;
          return [
            item.plaza,
            item.localidad,
            item.promotora,
            item.cliente.toUpperCase(),
            item.telefono,
            item.plan,
            `$${item.montoPrestado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            item.fechaVencimiento.toLocaleDateString('es-MX'),
            `$${item.abonos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            `$${item.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
          ];
        });
        body.push([
          'TOTAL CONSOLIDADO', '', '', '', '', '',
          `$${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
          '',
          '',
          `$${totalSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
        ]);
      } else if (reportType === 'loans_pending') {
        title = 'REPORTE DE CONTROL: PAGOS PENDIENTES (VIGENTES CON FALLOS)';
        headers = ['Plaza', 'Localidad', 'Promotora', 'Cliente', 'Teléfono', 'Plan', 'Cant. Prestada', 'Semanas Falladas', 'Monto Fallado', 'Saldo Restante'];
        body = (reportData as any[]).map(item => {
          totalAmount += item.montoPrestado;
          totalSaldo += item.saldo;
          return [
            item.plaza,
            item.localidad,
            item.promotora,
            item.cliente.toUpperCase(),
            item.telefono,
            item.plan,
            `$${item.montoPrestado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            item.fallosCount,
            `$${item.fallosMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            `$${item.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
          ];
        });
        body.push([
          'TOTAL CONSOLIDADO', '', '', '', '', '',
          `$${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
          '',
          '',
          `$${totalSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
        ]);
      } else if (reportType === 'clients_list') {
        title = 'REPORTE DE CONTROL: DIRECTORIO GENERAL DE CLIENTES';
        headers = ['Cliente', 'Teléfono', 'Domicilio Completo', 'Garantía', 'Aval', 'Teléfono Aval', 'Préstamos Act.', 'Deuda Total'];
        body = (reportData as any[]).map(item => {
          totalSaldo += item.deudaTotal;
          return [
            item.cliente.toUpperCase(),
            item.telefono,
            item.direccion.toUpperCase(),
            item.garantia.toUpperCase(),
            item.aval.toUpperCase(),
            item.avalTelefono,
            item.prestamosActivosCount,
            `$${item.deudaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
          ];
        });
        body.push([
          'TOTAL CONSOLIDADO', '', '', '', '', '', '',
          `$${totalSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
        ]);
      }

      // Metadata summary headers
      const plazaName = selectedPlaza === 'all' ? 'TODAS' : plazas.find(p => p.id === selectedPlaza)?.name.toUpperCase() || '';
      const localidadName = selectedLocalidad === 'all' ? 'TODAS' : localidades.find(l => l.id === selectedLocalidad)?.name.toUpperCase() || '';
      const promotoraName = selectedPromotora === 'all' ? 'TODAS' : promotoras.find(p => p.id === selectedPromotora)?.name.toUpperCase() || '';
      const planName = selectedPlan === 'all' ? 'TODOS' : loanPlans.find(p => p.id === selectedPlan)?.name.toUpperCase() || '';

      // PDF Draw Decorator
      // Corporate Header Style
      doc.setFillColor(31, 41, 55); // zinc-800 background
      doc.rect(40, 30, 712, 65, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title, 55, 53);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`GENERADO EL: ${todayString}`, 55, 78);
      doc.text(`FILTROS: PLAZA: ${plazaName} | LOCALIDAD: ${localidadName} | PROMOTORA: ${promotoraName} | PLAN: ${planName}`, 55, 87);

      // Render the tabular structure
      doc.autoTable({
        head: [headers],
        body: body,
        startY: 110,
        margin: { left: 40, right: 40 },
        theme: 'striped',
        styles: {
          fontSize: 8,
          cellPadding: 5,
          font: 'helvetica',
          valign: 'middle'
        },
        headStyles: {
          fillColor: reportType === 'loans_overdue' ? [220, 38, 38] : [59, 130, 246], // red-600 for overdue, blue-500 for others
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251]
        },
        didParseCell: (cellData) => {
          // Format total summary row
          const totalRowIndex = body.length - 1;
          if (cellData.row.index === totalRowIndex) {
            cellData.cell.styles.fontStyle = 'bold';
            cellData.cell.styles.fillColor = [229, 231, 235]; // gray-200
            cellData.cell.styles.fontSize = 8.5;
          }
        }
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Página ${i} de ${pageCount}`, 700, 580);
      }

      const fileName = `${title.replace(/[\s:]+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`;
      doc.save(fileName);

      toast({
        title: 'PDF Descargado',
        description: `Se exportaron ${body.length - 1} registros a PDF exitosamente.`,
      });

    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error al exportar PDF',
        description: `No se pudo generar el archivo PDF: ${error.message}`,
      });
    } finally {
      setIsExportingPDF(false);
    }
  };

  return (
    <Card className="rounded-xl md:rounded-3xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm overflow-hidden bg-white dark:bg-zinc-950">
      <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/40 border-b p-4 md:p-6 pb-4 md:pb-6">
        <div className="flex items-center gap-2.5 md:gap-3">
          <div className="p-1.5 md:p-2 bg-blue-500/10 text-blue-600 rounded-xl md:rounded-2xl shrink-0">
            <FileBarChart2 className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div>
            <CardTitle className="text-base md:text-xl font-bold uppercase">Centro de Informes Avanzados</CardTitle>
            <CardDescription className="text-[10px] md:text-xs">
              Genera y descarga reportes detallados en formatos Excel y PDF con filtros dinámicos.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-3.5 md:p-6 space-y-4 md:space-y-6">
        {/* Filters Form Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
          
          {/* Report Type Selector */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Tipo de Reporte</label>
            <Select value={reportType} onValueChange={(val: ReportType) => setReportType(val)}>
              <SelectTrigger className="h-9 md:h-10 rounded-lg md:rounded-xl bg-zinc-50/50 focus:bg-background border-zinc-200 transition-all font-semibold text-xs">
                <SelectValue placeholder="Selecciona el reporte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loans_active" className="text-xs font-semibold">Préstamos Activos (Vigentes)</SelectItem>
                <SelectItem value="loans_overdue" className="text-xs font-semibold text-rose-600">Cartera Vencida (Expirados)</SelectItem>
                <SelectItem value="loans_pending" className="text-xs font-semibold text-amber-600">Pagos Pendientes (Vigentes con Fallos)</SelectItem>
                <SelectItem value="clients_list" className="text-xs font-semibold">Directorio de Clientes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Plaza Filter */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Plaza</label>
            <Select value={selectedPlaza} onValueChange={(val) => {
              setSelectedPlaza(val);
              setSelectedLocalidad('all');
              setSelectedPromotora('all');
            }}>
              <SelectTrigger className="h-9 md:h-10 rounded-lg md:rounded-xl bg-zinc-50/50 focus:bg-background border-zinc-200 transition-all font-semibold text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">TODAS</SelectItem>
                {sortedPlazas.map(p => <SelectItem key={p.id} value={p.id} className="text-xs uppercase font-bold">{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Localidad Filter */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Localidad</label>
            <Select value={selectedLocalidad} onValueChange={(val) => {
              setSelectedLocalidad(val);
              setSelectedPromotora('all');
            }}>
              <SelectTrigger className="h-9 md:h-10 rounded-lg md:rounded-xl bg-zinc-50/50 focus:bg-background border-zinc-200 transition-all font-semibold text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">TODAS</SelectItem>
                {filteredLocalidades.map(l => <SelectItem key={l.id} value={l.id} className="text-xs uppercase font-bold">{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Promotora Filter */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Promotora</label>
            <Select value={selectedPromotora} onValueChange={setSelectedPromotora}>
              <SelectTrigger className="h-9 md:h-10 rounded-lg md:rounded-xl bg-zinc-50/50 focus:bg-background border-zinc-200 transition-all font-semibold text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">TODAS</SelectItem>
                {filteredPromotoras.map(p => <SelectItem key={p.id} value={p.id} className="text-xs uppercase font-bold">{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Report Specific Filters (Plans or Client Status) */}
          {reportType !== 'clients_list' ? (
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Plan de Préstamo</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger className="h-9 md:h-10 rounded-lg md:rounded-xl bg-zinc-50/50 focus:bg-background border-zinc-200 transition-all font-semibold text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">TODOS</SelectItem>
                  {sortedPlans.map(p => <SelectItem key={p.id} value={p.id} className="text-xs font-bold">{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Estatus del Cliente</label>
              <Select value={clientStatusFilter} onValueChange={(val: any) => setClientStatusFilter(val)}>
                <SelectTrigger className="h-9 md:h-10 rounded-lg md:rounded-xl bg-zinc-50/50 focus:bg-background border-zinc-200 transition-all font-semibold text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">TODOS LOS CLIENTES</SelectItem>
                  <SelectItem value="with_debt" className="text-xs">CON DEUDA / PRÉSTAMO ACTIVO</SelectItem>
                  <SelectItem value="up_to_date" className="text-xs text-green-600 font-bold">AL CORRIENTE / SIN RETRASOS</SelectItem>
                  <SelectItem value="no_active_loans" className="text-xs">SIN PRÉSTAMOS ACTIVOS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date Picker Filter */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Rango de Fecha de Inicio</label>
            <div className="flex items-center bg-zinc-50/50 dark:bg-zinc-900/40 rounded-lg md:rounded-xl border border-zinc-200 h-9 md:h-10 overflow-hidden">
              <DatePicker date={dateRange} onDateChange={setDateRange} variant="ghost" className="w-full" />
              {dateRange && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setDateRange(undefined)}
                  className="h-9 w-9 md:h-10 md:w-10 text-destructive hover:bg-destructive/10 rounded-none border-l shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Pre-visualizer Banner & Stats Summary */}
        <div className="p-3.5 md:p-5 rounded-xl md:rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
          <div className="flex items-start gap-2.5 md:gap-3">
            <Info className="h-4.5 w-4.5 md:h-5 md:w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <h4 className="text-[11px] md:text-xs font-black uppercase text-zinc-800 dark:text-zinc-200">Previsualización de Reporte</h4>
              <p className="text-[10px] md:text-xs text-muted-foreground leading-normal">
                Se detectaron <span className="font-extrabold text-blue-600 dark:text-blue-400">{summaryStats.count} registros</span> que coinciden con los filtros aplicados.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 md:gap-6 justify-between md:justify-end w-full md:w-auto pt-2 md:pt-0 border-t md:border-none border-zinc-100 dark:border-zinc-800">
            {reportType !== 'clients_list' && (
              <div className="text-left md:text-right">
                <span className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase block leading-none">Monto Colocado</span>
                <span className="text-xs md:text-sm font-extrabold text-zinc-800 dark:text-zinc-100">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(summaryStats.totalColocado)}</span>
              </div>
            )}
            <div className="text-right">
              <span className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase block leading-none">{reportType === 'clients_list' ? 'Deuda Total' : 'Saldo Restante'}</span>
              <span className="text-xs md:text-sm font-black text-rose-600 dark:text-rose-400">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(summaryStats.totalSaldo)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 md:gap-4 pt-1.5 md:pt-2 justify-end">
          <Button 
            onClick={handleExportExcel} 
            disabled={isExportingExcel || reportData.length === 0}
            className="rounded-lg md:rounded-xl h-9 md:h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] md:text-xs uppercase gap-2 min-w-full sm:min-w-[180px]"
          >
            {isExportingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Descargar Excel
          </Button>
          
          <Button 
            onClick={handleExportPDF} 
            disabled={isExportingPDF || reportData.length === 0}
            className="rounded-lg md:rounded-xl h-9 md:h-11 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] md:text-xs uppercase gap-2 min-w-full sm:min-w-[180px]"
          >
            {isExportingPDF ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Descargar PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
