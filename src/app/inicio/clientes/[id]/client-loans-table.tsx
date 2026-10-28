'use client';

import { useState, useMemo } from 'react';
import type { Loan, LoanPlan, AppUser, Plaza, Localidad, Promotora } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, ListTodo, PencilLine, ArrowUpRight, CalendarX2, CheckCircle2 } from 'lucide-react';
import { EditLoanDialog } from '@/components/edit-loan-dialog';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, getSaturdayOfWeek, getCurrentLoanWeekNumber, getExtraWeekThreshold, doesLoanHavePenalty } from '@/lib/utils';
import { ManualPaymentAdjustmentDialog, type PaymentAdjustmentTag } from '@/components/manual-payment-adjustment-dialog';
import { RemoveExtraWeekDialog } from '@/components/remove-extra-week-dialog';
import type { AppConfig } from '@/lib/types';


interface ClientLoansTableProps {
  clientLoans: Loan[];
  loanPlans: LoanPlan[];
  allLoans: Loan[];
  users: AppUser[];
  plazas: Plaza[];
  localidades: Localidad[];
  promotoras: Promotora[];
  appConfig?: AppConfig | null;
}

export function ClientLoansTable({ clientLoans, loanPlans, allLoans, users, plazas, localidades, promotoras, appConfig }: ClientLoansTableProps) {
  const { appUser } = useAuth();
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [loanForDetails, setLoanForDetails] = useState<Loan | null>(null);
  
  // State for manual adjustment
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [adjustData, setAdjustData] = useState<{ weekNumber: number, amount: number, tag?: PaymentAdjustmentTag } | null>(null);
  const [isRemoveExtraWeekOpen, setIsRemoveExtraWeekOpen] = useState(false);

  const isCristobal = useMemo(() => appUser?.username?.toUpperCase() === 'CRISTOBAL', [appUser]);
  const canEdit = useMemo(() => isCristobal, [isCristobal]);

  const detailsHasPenalty = useMemo(() => {
    if (!loanForDetails) return false;
    const plan = loanPlans.find(p => p.id === loanForDetails.loanPlanId);
    if (!plan) return false;
    const weeklyPayment = (loanForDetails.amount / 1000) * plan.weeklyPaymentRate;
    const penaltyThreshold = getExtraWeekThreshold(appConfig);
    return doesLoanHavePenalty(loanForDetails, plan.termInWeeks, weeklyPayment, penaltyThreshold);
  }, [loanForDetails, loanPlans, appConfig]);
  
  // Sort loans: Active/Overdue first, then by startDate descending
  const sortedLoans = useMemo(() => {
    return [...clientLoans].sort((a, b) => {
      const isAActive = a.status === 'Active' || a.status === 'Overdue';
      const isBActive = b.status === 'Active' || b.status === 'Overdue';
      
      if (isAActive && !isBActive) return -1;
      if (!isAActive && isBActive) return 1;
      
      return new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime();
    });
  }, [clientLoans]);

  const allLoanWeeks = useMemo(() => 
    Array.from(
      new Set(allLoans.map(loan => getSaturdayOfWeek(new Date(loan.startDate || 0)).toISOString()))
    ).sort((a, b) => new Date(b || 0).getTime() - new Date(a || 0).getTime())
  , [allLoans]);

  const getPlanName = (planId: string) => {
    return loanPlans.find(p => p.id === planId)?.name || 'N/A';
  };

  const getPromotoraName = (loan: Loan) => {
    if (!loan.promotoraId) return '—';
    const p = promotoras.find(prom => prom.id === loan.promotoraId);
    return p?.name?.trim() || '—';
  };

  const getLocalidadName = (loan: Loan) => {
    const p = promotoras.find(prom => prom.id === loan.promotoraId);
    const locId = p?.localidadId || (loan as any).localidadId;
    if (!locId) return '—';
    const l = localidades.find(loc => loc.id === locId);
    return l?.name?.trim() || '—';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const correctedDate = new Date(date.getTime() + userTimezoneOffset);
    return correctedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const translateStatus = (status: Loan['status']) => {
    const statusMap = {
      'Active': 'Activo',
      'Overdue': 'Vencido',
      'Paid Off': 'Pagado',
      'Pagado desde CV': 'Pagado desde CV',
    };
    return statusMap[status] || status;
  };

  const getStatusVariant = (status: Loan['status']): 'destructive' | 'success' | 'default' | 'purple' => {
    const variantMap: Record<string, 'destructive' | 'success' | 'default' | 'purple'> = {
      'Overdue': 'destructive',
      'Paid Off': 'success',
      'Pagado desde CV': 'purple',
    };
    return variantMap[status] || 'default';
  };

  const handleEditClick = (e: React.MouseEvent, loan: Loan) => {
    e.stopPropagation();
    setSelectedLoan(loan);
    setIsEditDialogOpen(true);
  };

  const handleRowClick = (loan: Loan) => {
      setLoanForDetails(loan);
      setIsDetailsDialogOpen(true);
  };

  const loanDetailsData = useMemo(() => {
      if (!loanForDetails) return [];
      const plan = loanPlans.find(p => p.id === loanForDetails.loanPlanId);
      if (!plan) return [];

      const weeklyPayment = (loanForDetails.amount / 1000) * plan.weeklyPaymentRate;
      const startDate = new Date(loanForDetails.startDate);
      const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loanForDetails.startDate));

      const baseTerm = plan.termInWeeks;
      const penaltyThreshold = getExtraWeekThreshold(appConfig);
      const hasPenalty = doesLoanHavePenalty(loanForDetails, baseTerm, weeklyPayment, penaltyThreshold);
      const termInWeeks = baseTerm + (hasPenalty ? 1 : 0);
      const isLiquidated = loanForDetails.status === 'Paid Off' || loanForDetails.status === 'Pagado desde CV';
      
      const validPayments = (loanForDetails.payments || []).filter(p => !p.isReverted && p.amount > 0 && p.weekNumber > 0);
      const maxPaidWeek = validPayments.length > 0 
        ? Math.max(...validPayments.map(p => p.weekNumber)) 
        : 0;
      const maxDisplayWeek = Math.max(termInWeeks, maxPaidWeek);

      const rows = [];

      for(let i = 1; i <= maxDisplayWeek; i++) {
          const payment = loanForDetails.payments?.find(p => Number(p.weekNumber) === i);
          const isRegistered = !!payment && !payment.isReverted;
          
          // Si supera el plazo calculado (termInWeeks) y NO tiene pago registrado con monto > 0, no mostrar
          if (i > termInWeeks && (!isRegistered || payment.amount <= 0)) {
              continue;
          }

          const dueDate = new Date(startDate);
          dueDate.setUTCDate(dueDate.getUTCDate() + (i * 7));
          
          let received: number | null = isRegistered ? payment.amount : null;
          let note = '';
          let tag: PaymentAdjustmentTag | 'pendiente' = 'pendiente';
          let dateStr = isRegistered ? formatDate(payment.date) : '';

          if (isRegistered) {
              if (payment.isAdvance || payment.paymentType === 'adelanto_entrante') {
                  tag = 'adelanto';
                  note = 'ADELANTO';
              } else if (payment.paymentType === 'assumed') {
                  tag = 'asumido';
                  note = 'ASUMIDO';
              } else if (payment.amount === 0) {
                  tag = 'falla';
                  note = 'FALLA';
              } else if (payment.isRecovered || payment.paymentType === 'recovered') {
                  tag = 'recuperado';
                  note = payment.amount >= weeklyPayment ? 'RECUPERADO' : 'RECUPERADO PARCIAL';
              } else if (payment.amount >= weeklyPayment) {
                  tag = 'pagado';
                  note = 'PAGADO';
              } else {
                  tag = 'pagado';
                  note = 'PARCIAL';
              }
          } else if (isLiquidated) {
              received = weeklyPayment;
              tag = 'pagado';
              note = 'LIQUIDADO';
              dateStr = 'LIQUIDADO';
          }

          rows.push({
              num: i,
              vencimiento: dueDate.toLocaleDateString('es-MX'),
              importeAbono: weeklyPayment,
              importeRecibido: received,
              fechaAbono: dateStr,
              note: note,
              tag: tag
          });
      }
      return rows;
  }, [loanForDetails, loanPlans, appConfig]);

  const totalAbono = loanDetailsData.reduce((acc, r) => acc + r.importeAbono, 0);
  const totalRecibido = loanDetailsData.reduce((acc, r) => acc + (r.importeRecibido || 0), 0);

  const handleAdjustClick = (weekNumber: number, currentAmount: number, tag?: PaymentAdjustmentTag) => {
    if (!isCristobal) return;
    setAdjustData({ weekNumber, amount: currentAmount, tag });
    setIsAdjustDialogOpen(true);
  };

  const getWeeklyPayment = (loan: Loan) => {
    const plan = loanPlans.find(p => p.id === loan.loanPlanId);
    return plan ? (loan.amount / 1000) * plan.weeklyPaymentRate : 0;
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-zinc-50/80 dark:bg-zinc-900/40 hover:bg-transparent border-b border-zinc-200 dark:border-zinc-800">
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3">Fecha</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3">Monto</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3">Abono Semanal</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3">Plan</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3">Localidad</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3">Promotora</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3">Estado</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3 text-center">Abonos</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground h-9 px-3 text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedLoans.length > 0 ? (
            sortedLoans.map((loan) => {
              const weeklyPayment = getWeeklyPayment(loan);
              const locName = getLocalidadName(loan);
              const promName = getPromotoraName(loan);

              return (
                <TableRow 
                  key={loan.id} 
                  className="cursor-pointer hover:bg-blue-50/40 dark:hover:bg-zinc-800/40 transition-colors border-b border-zinc-100 dark:border-zinc-800/60" 
                  onClick={() => handleRowClick(loan)}
                >
                  <TableCell className="font-semibold text-xs py-2.5 px-3 text-zinc-900 dark:text-zinc-100">{formatDate(loan.startDate)}</TableCell>
                  <TableCell className="font-bold text-xs py-2.5 px-3 text-zinc-900 dark:text-zinc-100">{formatCurrency(loan.amount)}</TableCell>
                  <TableCell className="font-bold text-xs py-2.5 px-3 text-indigo-600 dark:text-indigo-400">{formatCurrency(weeklyPayment)}</TableCell>
                  <TableCell className="py-2.5 px-3">
                    <span className="inline-flex items-center text-[11px] font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded">
                      {getPlanName(loan.loanPlanId)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-xs">
                    {locName !== '—' ? (
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{locName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-xs">
                    {promName !== '—' ? (
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{promName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 px-3">
                    <Badge variant={getStatusVariant(loan.status)} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                      {translateStatus(loan.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 font-medium border-zinc-200 dark:border-zinc-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/50" onClick={() => handleRowClick(loan)}>
                          <ListTodo className="h-3.5 w-3.5 mr-1 text-blue-600" />
                          Abonos
                      </Button>
                  </TableCell>
                  <TableCell className="text-right py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={(e) => handleEditClick(e, loan)}>
                            <Edit className="h-3.5 w-3.5" />
                            <span className="sr-only">Editar Préstamo</span>
                          </Button>
                      ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                      )}
                  </TableCell>
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground">
                No hay préstamos registrados para este cliente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
              <DialogHeader className="p-6 pb-2 shrink-0">
                  <DialogTitle className="text-center border-b pb-2">Detalle de los abonos del prestamo</DialogTitle>
                  {loanForDetails && (
                    <div className="flex flex-col items-center justify-center gap-1.5 pt-1">
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Localidad: <strong className="text-foreground">{getLocalidadName(loanForDetails)}</strong></span>
                        <span>•</span>
                        <span>Promotora: <strong className="text-foreground">{getPromotoraName(loanForDetails)}</strong></span>
                      </div>
                      {detailsHasPenalty && (
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="destructive" className="text-[10px] font-bold bg-orange-600 hover:bg-orange-700">
                            Semana Extra Activa (+1 Sem)
                          </Badge>
                          {isCristobal && (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-6 text-[9px] font-bold px-2.5 bg-rose-600 hover:bg-rose-700 shadow-sm"
                              onClick={() => setIsRemoveExtraWeekOpen(true)}
                            >
                              <CalendarX2 className="h-3 w-3 mr-1" />
                              Eliminar Semana Extra
                            </Button>
                          )}
                        </div>
                      )}
                      {loanForDetails.extraWeekWaived && (
                        <Badge variant="outline" className="text-[10px] font-bold border-emerald-500 text-emerald-700 bg-emerald-50 mt-1">
                          <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                          Semana Extra Condonada / Retirada
                        </Badge>
                      )}
                    </div>
                  )}
              </DialogHeader>
              <div className="flex-1 min-h-0">
                <ScrollArea className="h-full px-6">
                    <div className="py-4">
                        <Table className="border border-blue-200">
                            <TableHeader className="bg-blue-100 sticky top-0 z-10">
                                <TableRow className="hover:bg-blue-100 border-blue-200">
                                    <TableHead className="text-blue-900 font-bold border-r border-blue-200 text-center">Num Abono</TableHead>
                                    <TableHead className="text-blue-900 font-bold border-r border-blue-200">Fecha Vencimiento</TableHead>
                                    <TableHead className="text-blue-900 font-bold border-r border-blue-200 text-right">Importe Abono</TableHead>
                                    <TableHead className="text-blue-900 font-bold border-r border-blue-200 text-right">Importe Recibido</TableHead>
                                    <TableHead className="text-blue-900 font-bold text-center">Fecha Abono</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loanDetailsData.map((row) => (
                                    <TableRow key={row.num} className="border-blue-100 hover:bg-blue-50/50">
                                        <TableCell className="border-r border-blue-100 text-center py-1">{row.num}</TableCell>
                                        <TableCell className="border-r border-blue-100 py-1">{row.vencimiento}</TableCell>
                                        <TableCell className="border-r border-blue-100 text-right py-1">{formatCurrency(row.importeAbono)}</TableCell>
                                        <TableCell 
                                            className={cn(
                                                "border-r border-blue-100 text-right py-1 font-semibold relative group", 
                                                row.tag === 'recuperado' ? "bg-purple-50 text-purple-900" :
                                                row.tag === 'adelanto' ? "bg-blue-50/90 text-blue-900" :
                                                row.tag === 'asumido' ? "bg-sky-50 text-sky-900" :
                                                row.tag === 'falla' ? "bg-rose-50 text-rose-800" :
                                                row.importeRecibido !== null ? (row.importeRecibido >= row.importeAbono ? "bg-green-100 text-green-800" : "bg-orange-50 text-orange-700") : "bg-red-50 text-red-700",
                                                isCristobal && "cursor-pointer hover:bg-blue-100 transition-colors"
                                            )}
                                            onClick={() => isCristobal && handleAdjustClick(row.num, (row.importeRecibido !== null && row.importeRecibido > 0) ? row.importeRecibido : row.importeAbono, row.tag !== 'pendiente' ? (row.tag as PaymentAdjustmentTag) : undefined)}
                                        >
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span>{row.importeRecibido !== null ? formatCurrency(row.importeRecibido) : formatCurrency(0)}</span>
                                                {row.tag === 'recuperado' && (
                                                    <Badge variant="secondary" className="bg-purple-100 text-purple-900 border border-purple-300 text-[10px] h-4 px-1 font-bold">
                                                        Recup.
                                                    </Badge>
                                                )}
                                                {row.tag === 'adelanto' && (
                                                    <Badge variant="secondary" className="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] h-4 px-1 gap-0.5 flex items-center font-bold">
                                                        <ArrowUpRight className="h-3 w-3 text-blue-700 stroke-[2.5]" />
                                                        Adelanto
                                                    </Badge>
                                                )}
                                                {row.tag === 'asumido' && (
                                                    <Badge variant="secondary" className="bg-sky-100 text-sky-900 border border-sky-300 text-[10px] h-4 px-1 font-bold">
                                                        Asumido
                                                    </Badge>
                                                )}
                                                {row.tag === 'falla' && (
                                                    <Badge variant="destructive" className="bg-rose-600 text-white text-[10px] h-4 px-1 font-bold">
                                                        Falla
                                                    </Badge>
                                                )}
                                                {row.tag === 'pagado' && row.note === 'RECUPERADO' && (
                                                    <Badge variant="secondary" className="bg-purple-100 text-purple-900 border border-purple-300 text-[10px] h-4 px-1 font-bold">
                                                        Recup.
                                                    </Badge>
                                                )}
                                                {isCristobal && (
                                                    <PencilLine className="h-3 w-3 opacity-0 group-hover:opacity-100 text-blue-600 shrink-0 ml-0.5" />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center py-1 text-xs text-muted-foreground">{row.fechaAbono || (row.importeRecibido === null ? 'PENDIENTE' : '')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-white border-t-2 border-blue-300">
                                <TableRow>
                                    <TableCell colSpan={2} className="text-right font-bold text-blue-900">TOTALES</TableCell>
                                    <TableCell className="text-right font-bold text-blue-900">{formatCurrency(totalAbono)}</TableCell>
                                    <TableCell className="text-right font-bold text-blue-900 bg-green-50">{formatCurrency(totalRecibido)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </ScrollArea>
              </div>
              <div className="p-4 border-t flex justify-end shrink-0">
                  <Button variant="secondary" onClick={() => setIsDetailsDialogOpen(false)}>Cerrar</Button>
              </div>
          </DialogContent>
      </Dialog>

      {selectedLoan && (
        <EditLoanDialog
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          loan={selectedLoan}
          loanPlans={loanPlans}
          allLoanWeeks={allLoanWeeks}
          plazas={plazas}
          localidades={localidades}
          promotoras={promotoras}
        />
      )}

      {loanForDetails && adjustData && (
        <ManualPaymentAdjustmentDialog
          isOpen={isAdjustDialogOpen}
          onOpenChange={setIsAdjustDialogOpen}
          loan={loanForDetails}
          weekNumber={adjustData.weekNumber}
          currentAmount={adjustData.amount}
          currentTag={adjustData.tag}
          appConfig={appConfig}
          onSuccess={() => {
              // No es ideal, pero fuerza el refresco de los datos tras el ajuste manual
              if (typeof window !== 'undefined') window.location.reload();
          }}
        />
      )}

      {loanForDetails && (
        <RemoveExtraWeekDialog
          isOpen={isRemoveExtraWeekOpen}
          onOpenChange={setIsRemoveExtraWeekOpen}
          loan={loanForDetails}
          onSuccess={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
        />
      )}
    </>
  );
}