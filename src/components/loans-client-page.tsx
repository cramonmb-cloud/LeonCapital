'use client';

import { useState, useEffect, useMemo } from 'react';
import { MoreHorizontal, CheckCircle2, XCircle, Circle, AlertCircle, FileDown, Loader2, CalendarCog, BadgeDollarSign, Filter, ChevronDown, ChevronUp, RotateCcw, Search, Coins, ArrowUpRight, Check, History, ShieldAlert, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { CreateLoanDialog } from '@/components/create-loan-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Client, Loan, LoanPlan, Payment, Plaza, Localidad, Promotora, AppUser, AppConfig } from '@/lib/types';
import { RegisterPaymentDialog } from './register-payment-dialog';
import { useRouter } from 'next/navigation';
import { cn, getSaturdayOfWeek, getMexicoNow, getCurrentLoanWeekNumber, parseLocalDate, getExtraWeekThreshold } from '@/lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { accumulateAssumedPaymentsAction, changeLoansDateAction, changeLoansPromotoraAction, payOffLoanAction, revertPaymentsForWeekAction, applyCarteraVencidaAbonoAction } from '@/app/inicio/actions';
import { format as formatDateFns } from 'date-fns';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { query, where, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Loading from '../app/inicio/loading';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from '@/components/ui/label';


interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

interface LoansClientPageProps {
    initialClients: Client[];
    initialLoanPlans: LoanPlan[];
    initialPlazas: Plaza[];
    initialLocalidades: Localidad[];
    initialPromotoras: Promotora[];
    initialConfig?: AppConfig | null;
}

export function LoansClientPage({ initialClients, initialLoanPlans, initialPlazas, initialLocalidades, initialPromotoras, initialConfig }: LoansClientPageProps) {
  const activeLoansQuery = useMemo(() => query(
    collection(db, 'loans'),
    where('status', 'in', ['Active', 'Overdue', 'Paid Off', 'Pagado desde CV'])
  ), []);

  const { data, loading: dataLoading } = useRealtimeData({
    clients: initialClients,
    loanPlans: initialLoanPlans,
    plazas: initialPlazas,
    localidades: initialLocalidades,
    promotoras: initialPromotoras
  }, {
    enabledCollections: ['loans', 'clients', 'loanPlans', 'plazas', 'localidades', 'promotoras', 'config', 'personal'],
    queries: {
      loans: activeLoansQuery
    }
  });
  const { loans, clients, loanPlans, plazas, localidades, promotoras } = data || { 
      loans: [], 
      clients: initialClients, 
      loanPlans: initialLoanPlans, 
      plazas: initialPlazas, 
      localidades: initialLocalidades, 
      promotoras: initialPromotoras 
  };
  const penaltyThreshold = getExtraWeekThreshold(data?.config || initialConfig);
    
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedPlaza, setSelectedPlaza] = useState<string>('');
  const [selectedLocalidad, setSelectedLocalidad] = useState<string>('');
  const [selectedPromotora, setSelectedPromotora] = useState<string>('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState<Loan | null>(null);
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<string>>(new Set());
  const { appUser } = useAuth();
  const isCristobal = useMemo(() => (appUser?.username || '').trim().toLowerCase() === 'cristobal', [appUser]);
  const [isAccumulating, setIsAccumulating] = useState(false);
  const [isAccumulatingAll, setIsAccumulatingAll] = useState(false);
  const [accumulateAllDialogOpen, setAccumulateAllDialogOpen] = useState(false);
  const [selectedCutoffWeek, setSelectedCutoffWeek] = useState<string>('');
  const [isReverting, setIsReverting] = useState(false);
  const [isChangingDate, setIsChangingDate] = useState(false);
  const [isPayingOff, setIsPayingOff] = useState(false);
  const [loanToPayOff, setLoanToPayOff] = useState<Loan | null>(null);
  const [changeDateDialogOpen, setChangeDateDialogOpen] = useState(false);
  const [changePromotoraDialogOpen, setChangePromotoraDialogOpen] = useState(false);
  const [targetMovePlaza, setTargetMovePlaza] = useState<string>('');
  const [targetMoveLocalidad, setTargetMoveLocalidad] = useState<string>('');
  const [targetMovePromotora, setTargetMovePromotora] = useState<string>('');
  const [isChangingPromotora, setIsChangingPromotora] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [isLocalidadDialogOpen, setIsLocalidadDialogOpen] = useState(false);
  const [localidadSearchTerm, setLocalidadSearchTerm] = useState('');
  const [targetWeek, setTargetWeek] = useState<string>('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const { toast } = useToast();
  const [paymentDialogData, setPaymentDialogData] = useState<{
    weekNumber: number;
    weekDate: Date;
    initialAmount: number;
  } | null>(null);
  const router = useRouter();

  // Cartera Vencida Abonos state
  const [overdueAbonos, setOverdueAbonos] = useState<Record<string, number>>({});
  const [overdueGestores, setOverdueGestores] = useState<Record<string, string>>({});
  const [applyingAbonoLoanId, setApplyingAbonoLoanId] = useState<string | null>(null);

  const sortedPlazas = useMemo(() => [...plazas].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [plazas]);
  const filteredLocalidades = useMemo(() => localidades.filter(l => l.plazaId === selectedPlaza).sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'es', { sensitivity: 'base' })), [localidades, selectedPlaza]);
  const filteredPromotoras = useMemo(() => promotoras.filter(p => p.localidadId === selectedLocalidad).sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [promotoras, selectedLocalidad]);

  const initialSelectionForCreateLoan = useMemo(() => {
    if (!selectedPromotora) return undefined;
    return {
      plazaId: selectedPlaza,
      localidadId: selectedLocalidad,
      promotoraId: selectedPromotora,
    };
  }, [selectedPlaza, selectedLocalidad, selectedPromotora]);

  // Memoize all promotoras with their plaza/localidad details for the search box
  const allPromotorasWithDetails = useMemo(() => {
    return promotoras.map(p => {
      const loc = localidades.find(l => l.id === p.localidadId);
      const plaza = loc ? plazas.find(pl => pl.id === loc.plazaId) : null;
      const assigned = data?.personal?.find(per => per.id === p.personalId);
      return {
        ...p,
        personalName: assigned ? `${assigned.nombre} ${assigned.apellidoPaterno}` : '',
        localidadName: loc?.name || 'N/A',
        plazaName: plaza?.name || 'N/A',
        plazaId: loc?.plazaId || '',
      };
    }).sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [promotoras, localidades, plazas, data?.personal]);

  const searchedPromotoras = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const query = searchTerm.toLowerCase();
    return allPromotorasWithDetails.filter(p => 
      (p.name || '').toLowerCase().includes(query) ||
      (p.personalName || '').toLowerCase().includes(query) ||
      (p.localidadName || '').toLowerCase().includes(query) ||
      (p.plazaName || '').toLowerCase().includes(query)
    ).slice(0, 8);
  }, [searchTerm, allPromotorasWithDetails]);

  const getWeeklyPaymentAmount = (loan: Loan) => {
    const plan = loanPlans.find(p => p.id === loan.loanPlanId);
    if (!plan) return 0;
    return (loan.amount / 1000) * plan.weeklyPaymentRate;
  };
  
  // Lógica para determinar si un préstamo debe mostrarse en la hoja de semana activa:
  // Continúa mostrándose mientras su plazo en semanas no haya vencido, incluso si adelantó pagos o fue liquidado.
  const isLoanActive = (loan: Loan) => {
    const plan = loanPlans.find(p => p.id === loan.loanPlanId);
    if (!plan) return false;

    const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate);

    const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
    let missedWeeksCount = 0;
    for (let i = 1; i < currentLoanWeek; i++) {
        const p = loan.payments?.find(pay => pay.weekNumber === i);
        if (p && !p.isReverted && p.amount < weeklyPayment) missedWeeksCount++;
    }

    const term = plan.termInWeeks + (missedWeeksCount >= penaltyThreshold ? 1 : 0);
    return currentLoanWeek <= term;
  };

  const loanWeeks = useMemo(() => 
    Array.from(
      new Set(
        loans
          .filter(l => l.promotoraId === selectedPromotora && isLoanActive(l))
          .map(loan => getSaturdayOfWeek(loan.startDate).toISOString())
      )
    ).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  , [loans, selectedPromotora, loanPlans]);

  const loansCountByWeek = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!selectedPromotora) return counts;

    loans.forEach(loan => {
      if (loan.promotoraId === selectedPromotora && isLoanActive(loan)) {
        const weekIso = getSaturdayOfWeek(loan.startDate).toISOString();
        counts[weekIso] = (counts[weekIso] || 0) + 1;
      }
    });

    return counts;
  }, [loans, selectedPromotora, loanPlans]);
  
  const allLoanWeeksInSystem = useMemo(() =>
    Array.from(
      new Set(loans.filter(isLoanActive).map(loan => getSaturdayOfWeek(loan.startDate).toISOString()))
    ).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  , [loans, loanPlans]);

  const availableCutoffWeeks = useMemo(() => {
    const currentSatIso = getSaturdayOfWeek(getMexicoNow()).toISOString();
    const set = new Set<string>([currentSatIso, ...loanWeeks]);
    return Array.from(set).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [loanWeeks]);


  const filteredLoans = useMemo(() => {
    const filtered = loans.filter(loan => {
      const isCorrectWeek = selectedWeek ? getSaturdayOfWeek(loan.startDate).toISOString() === selectedWeek : false;
      const isCorrectPromotora = selectedPromotora ? loan.promotoraId === selectedPromotora : false;
      return isCorrectWeek && isCorrectPromotora && isLoanActive(loan);
    });

    const clientMap = new Map(clients.map(c => [c.id, c.name]));

    return filtered.sort((a, b) => {
      const nameA = (clientMap.get(a.clientId) || '').toLowerCase();
      const nameB = (clientMap.get(b.clientId) || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [loans, selectedWeek, selectedPromotora, loanPlans, clients]);

  const selectedPromotoraObj = useMemo(() => {
    return promotoras.find(p => p.id === selectedPromotora);
  }, [promotoras, selectedPromotora]);

  const allPromotoraActiveLoans = useMemo(() => {
    if (!selectedPromotora) return [];
    return loans.filter(l => l.promotoraId === selectedPromotora && isLoanActive(l));
  }, [loans, selectedPromotora, loanPlans]);

  const hasAssumedPaymentsInPromotora = useMemo(() => {
    if (allPromotoraActiveLoans.length === 0) return false;
    const mexicoNow = getMexicoNow();
    return allPromotoraActiveLoans.some(loan => {
      if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') return false;
      const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
      if (!loanPlan) return false;

      const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate, mexicoNow);
      let missedCount = 0;
      const wp = getWeeklyPaymentAmount(loan);
      for (let i = 1; i < currentLoanWeek; i++) {
        const p = loan.payments.find(pay => pay.weekNumber === i);
        if (p && !p.isReverted) {
          if (p.amount < wp || p.isRecovered || p.paymentType === 'recovered') missedCount++;
        } else {
          missedCount++;
        }
      }
      const hasPenalty = loan.hasPenalty || (missedCount >= penaltyThreshold);
      const term = loanPlan.termInWeeks + (hasPenalty ? 1 : 0);
      const currentWeek = Math.min(currentLoanWeek, term);

      for (let w = 1; w <= currentWeek; w++) {
        const exists = (loan.payments || []).some(p => p.weekNumber === w && !p.isReverted);
        if (!exists) return true;
      }
      return false;
    });
  }, [allPromotoraActiveLoans, loanPlans]);

  const totalEnteredOverdueAbonos = useMemo(() => {
    return Object.values(overdueAbonos).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [overdueAbonos]);

  const accumulatePreview = useMemo(() => {
    if (!selectedCutoffWeek || !selectedPromotora || allPromotoraActiveLoans.length === 0) {
      return { loansCount: 0, totalEligibleLoans: 0, paymentsCount: 0, totalAmount: 0 };
    }

    const cutoffSat = getSaturdayOfWeek(new Date(selectedCutoffWeek));
    const eligibleLoans = allPromotoraActiveLoans.filter(l => {
      const loanSat = getSaturdayOfWeek(l.startDate);
      return loanSat.getTime() <= cutoffSat.getTime();
    });

    let paymentsCount = 0;
    let totalAmount = 0;
    let affectedLoansCount = 0;

    eligibleLoans.forEach(loan => {
      const plan = loanPlans.find(p => p.id === loan.loanPlanId);
      if (!plan) return;

      const targetLoanWeek = getCurrentLoanWeekNumber(loan.startDate, cutoffSat);
      let missedCount = 0;
      const wp = getWeeklyPaymentAmount(loan);
      for (let i = 1; i < targetLoanWeek; i++) {
        const p = (loan.payments || []).find(pay => pay.weekNumber === i);
        if (p && !p.isReverted) {
          if (p.amount < wp || p.isRecovered || p.paymentType === 'recovered') missedCount++;
        } else {
          missedCount++;
        }
      }
      const hasPenalty = loan.hasPenalty || (missedCount >= penaltyThreshold);
      const term = plan.termInWeeks + (hasPenalty ? 1 : 0);
      const maxWeekToFill = Math.min(targetLoanWeek, term);

      let loanHasNewPayments = false;
      for (let w = 1; w <= maxWeekToFill; w++) {
        const exists = (loan.payments || []).some(p => p.weekNumber === w && !p.isReverted);
        if (!exists) {
          paymentsCount++;
          totalAmount += wp;
          loanHasNewPayments = true;
        }
      }
      if (loanHasNewPayments) {
        affectedLoansCount++;
      }
    });

    const overdueCount = Object.values(overdueAbonos).filter(amt => amt > 0).length;
    const overdueAmt = totalEnteredOverdueAbonos;

    return {
      loansCount: affectedLoansCount + overdueCount,
      totalEligibleLoans: eligibleLoans.length,
      paymentsCount: paymentsCount + overdueCount,
      totalAmount: totalAmount + overdueAmt
    };
  }, [selectedCutoffWeek, selectedPromotora, allPromotoraActiveLoans, loanPlans, overdueAbonos, totalEnteredOverdueAbonos]);

  const overdueLoansForPromotora = useMemo(() => {
    if (!selectedPromotora) return [];
    return loans.filter(loan => {
      if (loan.promotoraId !== selectedPromotora) return false;
      if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') return false;
      const plan = loanPlans.find(p => p.id === loan.loanPlanId);
      if (!plan) return false;
      const baseTerm = plan.termInWeeks;
      const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));
      const isExpired = currentLoanWeek > baseTerm;
      if (!isExpired && loan.status !== 'Overdue') return false;

      const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
      const currentPayments = loan.payments || [];
      const actualTotalPaid = currentPayments.filter(p => !p.isReverted).reduce((acc, p) => acc + p.amount, 0);

      let missedCount = 0;
      let totalPaidInBaseTerm = 0;
      for (let i = 1; i <= baseTerm; i++) {
        const p = currentPayments.find(pay => pay.weekNumber === i);
        if (p && !p.isReverted) {
          totalPaidInBaseTerm += p.amount;
          if (p.amount < weeklyPayment || p.isRecovered || p.paymentType === 'recovered') missedCount++;
        } else {
          missedCount++;
        }
      }

      const hasPenalty = loan.hasPenalty || (missedCount >= penaltyThreshold) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
      const totalExpected = (baseTerm + (hasPenalty ? 1 : 0)) * weeklyPayment;
      const balance = Math.max(0, totalExpected - actualTotalPaid);

      return balance > 0;
    }).map(loan => {
      const client = clients.find(c => c.id === loan.clientId);
      const plan = loanPlans.find(p => p.id === loan.loanPlanId);
      const weeklyPayment = plan ? (loan.amount / 1000) * plan.weeklyPaymentRate : 0;
      const baseTerm = plan?.termInWeeks || 14;
      const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));
      const isExpired = currentLoanWeek > baseTerm;
      const currentPayments = loan.payments || [];
      const actualTotalPaid = currentPayments.filter(p => !p.isReverted).reduce((acc, p) => acc + p.amount, 0);

      let missedCount = 0;
      let totalPaidInBaseTerm = 0;
      for (let i = 1; i <= baseTerm; i++) {
        const p = currentPayments.find(pay => pay.weekNumber === i);
        if (p && !p.isReverted) {
          totalPaidInBaseTerm += p.amount;
          if (p.amount < weeklyPayment || p.isRecovered || p.paymentType === 'recovered') missedCount++;
        } else {
          missedCount++;
        }
      }

      const hasPenalty = loan.hasPenalty || (missedCount >= penaltyThreshold) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
      const totalExpected = (baseTerm + (hasPenalty ? 1 : 0)) * weeklyPayment;
      const saldo = Math.max(0, totalExpected - actualTotalPaid);

      return {
        loan,
        client,
        clientName: client?.name || 'Cliente sin nombre',
        startDate: loan.startDate,
        saldo,
        weeklyPayment,
        defaultGestor: loan.gestor || selectedPromotoraObj?.name || ''
      };
    }).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [loans, selectedPromotora, loanPlans, clients, selectedPromotoraObj]);

  useEffect(() => {
    setSelectedLoanIds(new Set());
  }, [selectedWeek, selectedPromotora]);

  useEffect(() => {
    if (!selectedWeek && loanWeeks.length > 0) {
        setSelectedWeek(loanWeeks[0]);
    }
    if (selectedWeek && !loanWeeks.includes(selectedWeek)) {
        setSelectedWeek(loanWeeks[0] || null);
    }
  }, [loanWeeks, selectedWeek]);


  const getClient = (clientId: string) => clients.find(c => c.id === clientId);
  const getClientName = (clientId: string) => getClient(clientId)?.name || 'N/A';
  
  const getHierarchy = (promotoraId?: string) => {
    const promotora = promotoras.find(p => p.id === promotoraId);
    const localidad = localidades.find(l => l.id === promotora?.localidadId);
    const plaza = plazas.find(p => p.id === localidad?.plazaId);
    return {
      promotoraName: promotora?.name || 'N/A',
      localidadName: localidad?.name || 'N/A',
      plazaName: plaza?.name || 'N/A',
    };
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };
   const formatCurrencySimple = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
    const formatCurrencySimplePDF = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

  const formatDate = (dateString: string) => {
      const date = parseLocalDate(dateString);
      return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const translateStatus = (status: Loan['status']) => {
    switch (status) {
      case 'Active':
        return 'Activo';
      case 'Overdue':
        return 'Vencido';
      case 'Paid Off':
        return 'Pagado';
      case 'Pagado desde CV':
        return 'Pagado desde CV';
      default:
        return status;
    }
  };

  const getStatusVariant = (status: Loan['status']): 'destructive' | 'success' | 'default' | 'purple' => {
    switch (status) {
        case 'Overdue':
            return 'destructive';
        case 'Paid Off':
            return 'success';
        case 'Pagado desde CV':
            return 'purple';
        default:
            return 'default';
    }
  };

    const {
        currentGroupWeek,
        weeklyFailures,
        weeklyCollected,
        hasAssumedPayments,
        hasPaymentsToRevert,
        loansWithPenalty
    } = useMemo(() => {
        if (dataLoading || filteredLoans.length === 0) {
            return {
                currentGroupWeek: 0,
                weeklyFailures: [],
                weeklyCollected: [],
                hasAssumedPayments: false,
                hasPaymentsToRevert: false,
                loansWithPenalty: {}
            };
        }
        
        const mexicoNow = getMexicoNow();
        const currentGroupWeek = getCurrentLoanWeekNumber(filteredLoans[0].startDate, mexicoNow);
        
        const newLoansWithPenalty: Record<string, boolean> = {};

        const getWeekPaymentStatusInternal = (loan: Loan, weekNumber: number, currentLoanWeek: number, penalty: boolean) => {
          const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
          if (!loanPlan) return { status: 'pending' as const, date: new Date(), amountPaid: 0, isAssumedPaid: false };
          
          const loanStartDate = parseLocalDate(loan.startDate);
          const weekDate = new Date(loanStartDate);
          weekDate.setDate(weekDate.getDate() + (weekNumber * 7));

          const paymentForWeek = loan.payments.find(p => p.weekNumber === weekNumber);
          if (paymentForWeek && paymentForWeek.isReverted) {
              return { status: 'pending' as const, date: weekDate, amountPaid: 0, isAssumedPaid: false, isRecovered: false };
          }
          
          const weeklyPaymentAmount = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
          const termInWeeks = loanPlan.termInWeeks + (penalty ? 1 : 0);
          
          if ((loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') && weekNumber <= termInWeeks) {
              const paidAmount = paymentForWeek ? paymentForWeek.amount : weeklyPaymentAmount;
              return { status: 'paid' as const, date: weekDate, amountPaid: paidAmount, isAssumedPaid: false, isRecovered: false };
          }
          if (paymentForWeek) {
              const totalPaidForWeek = paymentForWeek.amount;
              if (totalPaidForWeek >= weeklyPaymentAmount) {
                  return { status: 'paid' as const, date: weekDate, amountPaid: totalPaidForWeek, isAssumedPaid: false, isRecovered: paymentForWeek.isRecovered };
              } else {
                  return { status: 'partial' as const, date: weekDate, amountPaid: totalPaidForWeek, isAssumedPaid: false, isRecovered: paymentForWeek.isRecovered };
              }
          }

          if (weekNumber < currentLoanWeek) {
            return { status: 'paid' as const, date: weekDate, amountPaid: 0, isAssumedPaid: true, isRecovered: false };
          }

          return { status: 'pending' as const, date: weekDate, amountPaid: 0, isAssumedPaid: false, isRecovered: false };
        };

        filteredLoans.forEach(loan => {
            if (loan.hasPenalty) {
                newLoansWithPenalty[loan.id] = true;
                return;
            }
            const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate, mexicoNow);
            let missedWeeksCount = 0;
            const weeklyPayment = getWeeklyPaymentAmount(loan);
            for (let i = 1; i < currentLoanWeek; i++) {
                const paymentForWeek = loan.payments.find(p => p.weekNumber === i);
                if (paymentForWeek && !paymentForWeek.isReverted) {
                    if (paymentForWeek.amount < weeklyPayment || paymentForWeek.isRecovered || paymentForWeek.paymentType === 'recovered') {
                        missedWeeksCount++;
                    }
                } else {
                    missedWeeksCount++;
                }
            }
            if (missedWeeksCount >= penaltyThreshold) {
                newLoansWithPenalty[loan.id] = true;
            }
        });

        const maxWeeks = filteredLoans.reduce((max, loan) => {
            const plan = loanPlans.find(p => p.id === loan.loanPlanId);
            const penalty = newLoansWithPenalty[loan.id] ? 1 : 0;
            return Math.max(max, plan ? plan.termInWeeks + penalty : 0);
        }, 0);


        const calculateTotals = (length: number, type: 'failures' | 'collected') => {
            return Array.from({ length }).map((_, i) => {
                const weekNumber = i + 1;
                return filteredLoans.reduce((total, loan) => {
                    const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate, mexicoNow);
                    
                    const weekStatus = getWeekPaymentStatusInternal(loan, weekNumber, currentLoanWeek, newLoansWithPenalty[loan.id] || false);
                    const weeklyPayment = getWeeklyPaymentAmount(loan);

                    if (type === 'failures') {
                        const paymentForWeek = loan.payments.find(p => p.weekNumber === weekNumber);
                        if (paymentForWeek && !paymentForWeek.isReverted && paymentForWeek.amount < weeklyPayment) {
                            return total + (weeklyPayment - paymentForWeek.amount);
                        }
                    } else { // collected
                        if (weekStatus.status === 'paid' || weekStatus.status === 'partial') {
                           if (!weekStatus.isAssumedPaid) return total + weekStatus.amountPaid;
                        }
                        if (weekStatus.isAssumedPaid) return total + weeklyPayment;
                    }
                    return total;
                }, 0);
            });
        };

        const failures = calculateTotals(maxWeeks, 'failures');
        const collected = calculateTotals(maxWeeks, 'collected');

        const hasAssumed = filteredLoans.some(loan => {
            if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') return false;
            const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
            if (!loanPlan) return false;
            
            const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate, mexicoNow);
            
            let missedCount = 0;
            const wp = getWeeklyPaymentAmount(loan);
            for (let i = 1; i < currentLoanWeek; i++) {
                const p = loan.payments.find(pay => pay.weekNumber === i);
                if (p && !p.isReverted) {
                    if (p.amount < wp || p.isRecovered || p.paymentType === 'recovered') missedCount++;
                } else {
                    missedCount++;
                }
            }
            const hasPenalty = loan.hasPenalty || (missedCount >= penaltyThreshold);
            const term = loanPlan.termInWeeks + (hasPenalty ? 1 : 0);
            const currentWeek = Math.min(currentLoanWeek, term);

            for (let w = 1; w <= currentWeek; w++) {
                const exists = (loan.payments || []).some(p => p.weekNumber === w && !p.isReverted);
                if (!exists) return true;
            }
            return false;
        });

        // Detect if any loan in this sheet has an active (non-reverted) payment record for the currentGroupWeek
        const hasRevertible = filteredLoans.some(loan => 
            (loan.payments || []).some(p => p.weekNumber === currentGroupWeek && !p.isReverted && p.amount > 0)
        );

        return { currentGroupWeek, weeklyFailures: failures, weeklyCollected: collected, hasAssumedPayments: hasAssumed, hasPaymentsToRevert: hasRevertible, loansWithPenalty: newLoansWithPenalty };

    }, [dataLoading, filteredLoans, loanPlans, clients]);


    const getWeekPaymentStatus = (loan: Loan, weekNumber: number, currentLoanWeek: number): { 
        status: 'paid' | 'partial' | 'missed' | 'pending'; 
        date: Date; 
        amountPaid: number; 
        isAssumedPaid: boolean; 
        isRecovered?: boolean; 
        isAdvance?: boolean; 
        isAccumulated?: boolean; 
    } => {
        const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
        if (!loanPlan) return { status: 'pending' as const, date: new Date(), amountPaid: 0, isAssumedPaid: false };
        
        const loanStartDate = parseLocalDate(loan.startDate);
        const weekDate = new Date(loanStartDate);
        weekDate.setDate(weekDate.getDate() + (weekNumber * 7));

        const weeklyPaymentAmount = getWeeklyPaymentAmount(loan);
        const hasPenalty = loansWithPenalty[loan.id] || false;
        const termInWeeks = loanPlan.termInWeeks + (hasPenalty ? 1 : 0);
        
        const paymentForWeek = loan.payments?.find(p => p.weekNumber === weekNumber);
        
        if (paymentForWeek && paymentForWeek.isReverted) {
            return { status: 'pending' as const, date: weekDate, amountPaid: 0, isAssumedPaid: false, isRecovered: false };
        }
        
        if (paymentForWeek) {
            const totalPaidForWeek = paymentForWeek.amount;
            const isAdvance = paymentForWeek.isAdvance || paymentForWeek.paymentType === 'adelanto_entrante' || (weekNumber > currentLoanWeek && totalPaidForWeek > 0);
            const isAccumulated = paymentForWeek.isAccumulated || false;

            if(totalPaidForWeek >= weeklyPaymentAmount) {
                return { 
                    status: 'paid' as const, 
                    date: weekDate, 
                    amountPaid: totalPaidForWeek, 
                    isAssumedPaid: false, 
                    isRecovered: paymentForWeek.isRecovered,
                    isAdvance,
                    isAccumulated
                };
            } else if (totalPaidForWeek > 0) {
                return { 
                    status: 'partial' as const, 
                    date: weekDate, 
                    amountPaid: totalPaidForWeek, 
                    isAssumedPaid: false, 
                    isRecovered: paymentForWeek.isRecovered,
                    isAdvance,
                    isAccumulated
                };
            } else { // amount is 0
                return { 
                    status: 'missed' as const, 
                    date: weekDate, 
                    amountPaid: 0, 
                    isAssumedPaid: false, 
                    isRecovered: paymentForWeek.isRecovered,
                    isAdvance,
                    isAccumulated
                };
            }
        }

        if ((loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') && weekNumber <= termInWeeks) {
            const existingPayment = loan.payments?.find(p => p.weekNumber === weekNumber);
            const isAdvance = existingPayment 
                ? Boolean(existingPayment.isAdvance || existingPayment.paymentType === 'adelanto_entrante' || weekNumber >= currentLoanWeek)
                : (weekNumber >= currentLoanWeek);
            return { 
                status: 'paid' as const, 
                date: weekDate, 
                amountPaid: existingPayment?.amount ?? weeklyPaymentAmount, 
                isAssumedPaid: false, 
                isRecovered: existingPayment?.isRecovered ?? false,
                isAdvance,
                isAccumulated: true
            };
        }

        const isFuture = getMexicoNow() < weekDate;
        if (isFuture) {
          return { status: 'pending' as const, date: weekDate, amountPaid: 0, isAssumedPaid: false };
        }
        
        if (weekNumber < currentLoanWeek) {
            return { status: 'paid' as const, date: weekDate, amountPaid: 0, isAssumedPaid: true };
        }
        
        return { status: 'pending' as const, date: weekDate, amountPaid: 0, isAssumedPaid: false };
    };

    const handleRegisterPaymentClick = (loan: Loan, weekNumber: number, weekStatus: ReturnType<typeof getWeekPaymentStatus>) => {
        const weeklyPayment = getWeeklyPaymentAmount(loan);
        let initialAmount = weeklyPayment;

        if (weekStatus.status === 'partial') {
            initialAmount = weeklyPayment - weekStatus.amountPaid;
        } else if (weekStatus.status === 'missed') {
            initialAmount = weeklyPayment;
        } else if (weekStatus.status === 'paid' && weekStatus.isAssumedPaid) {
            initialAmount = weeklyPayment;
        } else if (weekStatus.status === 'paid' && !weekStatus.isAssumedPaid) {
            initialAmount = weekStatus.amountPaid;
        }

        setSelectedLoanForPayment(loan);
        setPaymentDialogData({ 
        weekNumber, 
        weekDate: weekStatus.date,
        initialAmount: initialAmount > 0 ? initialAmount : 0
        });
        setPaymentDialogOpen(true);
    };

    const handleAccumulatePayments = async () => {
        if (filteredLoans.length === 0 && totalEnteredOverdueAbonos === 0) return;
        
        setIsAccumulating(true);
        try {
            const loanIds = filteredLoans.map(l => l.id);
            const overdueList = Object.entries(overdueAbonos)
              .filter(([_, amt]) => amt > 0)
              .map(([loanId, amt]) => ({
                loanId,
                amount: amt,
                gestor: overdueGestores[loanId]
              }));

            const result = await accumulateAssumedPaymentsAction(loanIds, appUser?.id, undefined, overdueList);
            if (result && result.success) {
                setOverdueAbonos({});
                toast({
                    title: 'Proceso Completado',
                    description: result.message,
                });
            } else {
                throw new Error(result?.message || 'Ocurrió un error inesperado al acumular pagos.');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Acumular',
                description: error.message,
            });
        } finally {
            setIsAccumulating(false);
        }
    };

    const handleApplySingleOverdueAbono = async (loanId: string) => {
        const amount = overdueAbonos[loanId] || 0;
        if (amount <= 0) {
            toast({
                variant: 'destructive',
                title: 'Monto Inválido',
                description: 'Ingresa un monto de abono mayor a 0 para aplicar.',
            });
            return;
        }

        setApplyingAbonoLoanId(loanId);
        try {
            const gestor = overdueGestores[loanId];
            const result = await applyCarteraVencidaAbonoAction(loanId, amount, gestor, appUser?.id);
            if (result && result.success) {
                toast({
                    title: 'Abono Aplicado',
                    description: result.message,
                });
                setOverdueAbonos(prev => {
                    const next = { ...prev };
                    delete next[loanId];
                    return next;
                });
            } else {
                throw new Error(result?.message || 'Error al aplicar abono.');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al aplicar abono',
                description: error.message,
            });
        } finally {
            setApplyingAbonoLoanId(null);
        }
    };

    const handleAccumulateAllWeeksPayments = async () => {
        if (!selectedPromotora || allPromotoraActiveLoans.length === 0 || !selectedCutoffWeek) return;
        
        setIsAccumulatingAll(true);
        try {
            const cutoffSat = getSaturdayOfWeek(new Date(selectedCutoffWeek));
            const eligibleLoans = allPromotoraActiveLoans.filter(l => {
                const loanSat = getSaturdayOfWeek(l.startDate);
                return loanSat.getTime() <= cutoffSat.getTime();
            });
            const loanIds = eligibleLoans.map(l => l.id);
            const overdueList = Object.entries(overdueAbonos)
              .filter(([_, amt]) => amt > 0)
              .map(([loanId, amt]) => ({
                loanId,
                amount: amt,
                gestor: overdueGestores[loanId]
              }));

            const result = await accumulateAssumedPaymentsAction(loanIds, appUser?.id, selectedCutoffWeek, overdueList);
            if (result && result.success) {
                setOverdueAbonos({});
                toast({
                    title: 'Proceso Completado',
                    description: `Se formalizaron los pagos hasta la semana del ${formatDate(selectedCutoffWeek)}. ${result.message}`,
                });
                setAccumulateAllDialogOpen(false);
            } else {
                throw new Error(result?.message || 'Ocurrió un error inesperado al acumular pagos de todas las semanas.');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Acumular',
                description: error.message,
            });
        } finally {
            setIsAccumulatingAll(false);
        }
    };

    const handleRevertPayments = async () => {
        if (filteredLoans.length === 0 || currentGroupWeek <= 0) return;
        
        setIsReverting(true);
        try {
            const loanIds = filteredLoans.map(l => l.id);
            const result = await revertPaymentsForWeekAction(loanIds, currentGroupWeek, appUser?.id);
            if (result && result.success) {
                toast({
                    title: 'Reversión Completada',
                    description: result.message,
                });
                setRevertDialogOpen(false);
            } else {
                throw new Error(result?.message || 'Ocurrió un error al intentar pasar a pendiente.');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Revertir',
                description: error.message,
            });
        } finally {
            setIsReverting(false);
        }
    };

    const handleChangeDate = async () => {
        if (!targetWeek || selectedLoanIds.size === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Selecciona una semana de destino y al menos un préstamo.' });
            return;
        }
        setIsChangingDate(true);
        try {
            const loanIds = Array.from(selectedLoanIds);
            const result = await changeLoansDateAction(loanIds, targetWeek);
            if (result.success) {
                toast({ title: 'Éxito', description: result.message });
                setChangeDateDialogOpen(false);
                setSelectedWeek(targetWeek);
                setSelectedLoanIds(new Set());
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsChangingDate(false);
        }
    };

    const moveFilteredLocalidades = useMemo(() => {
        if (!targetMovePlaza) return [];
        return localidades.filter(l => l.plazaId === targetMovePlaza).sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }, [localidades, targetMovePlaza]);

    const moveFilteredPromotoras = useMemo(() => {
        if (!targetMoveLocalidad) return [];
        return promotoras.filter(p => p.localidadId === targetMoveLocalidad).sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }, [promotoras, targetMoveLocalidad]);

    const handleOpenMovePromotora = () => {
        setTargetMovePlaza(selectedPlaza || (plazas[0]?.id || ''));
        setTargetMoveLocalidad(selectedLocalidad || '');
        setTargetMovePromotora('');
        setChangePromotoraDialogOpen(true);
    };

    const handleChangePromotora = async () => {
        if (!targetMovePromotora || selectedLoanIds.size === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Selecciona una promotora de destino y al menos un préstamo.' });
            return;
        }
        if (targetMovePromotora === selectedPromotora) {
            toast({ variant: 'destructive', title: 'Error', description: 'La promotora de destino debe ser diferente a la actual.' });
            return;
        }
        setIsChangingPromotora(true);
        try {
            const loanIds = Array.from(selectedLoanIds);
            const result = await changeLoansPromotoraAction(loanIds, targetMovePromotora);
            if (result.success) {
                toast({ title: 'Éxito', description: result.message });
                setChangePromotoraDialogOpen(false);
                setSelectedLoanIds(new Set());
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsChangingPromotora(false);
        }
    };

    const handlePayOffLoan = async () => {
        if (!loanToPayOff) return;
        setIsPayingOff(true);
        try {
            const result = await payOffLoanAction(loanToPayOff.id, appUser?.id);
            if (result.success) {
                toast({
                    title: 'Préstamo Liquidado',
                    description: result.message,
                });
                setLoanToPayOff(null);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Liquidar',
                description: error.message,
            });
        } finally {
            setIsPayingOff(false);
        }
    };

    const checkIfLoanHighlighted = (loan: Loan) => {
        const plan = loanPlans.find(lp => lp.id === loan.loanPlanId);
        if (plan?.highlight) return true;

        if (!loan.promotoraId) return false;
        const p = promotoras.find(prom => prom.id === loan.promotoraId);
        if (!p) return false;
        if (p.highlight) return true;

        const l = localidades.find(loc => loc.id === p.localidadId);
        if (!l) return false;
        if (l.highlight) return true;

        const pl = plazas.find(plaza => plaza.id === l.plazaId);
        if (!pl) return false;
        if (pl.highlight) return true;

        return false;
    };

    const handleExportPDF = () => {
        if (filteredLoans.length === 0 || !selectedWeek) return;

        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }) as jsPDFWithAutoTable;
        const pageWidth = doc.internal.pageSize.getWidth();
        const topMargin = 60;
        const margin = 30;

        const maxWeeksToShow = 15;

        const { promotoraName, localidadName, plazaName } = getHierarchy(selectedPromotora);
        
        const totalAmount = filteredLoans.reduce((sum, loan) => sum + loan.amount, 0);

        const groupStartDate = new Date(selectedWeek);

        let latestVencimientoDate = new Date(0);
        filteredLoans.forEach(loan => {
            const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
            if (loanPlan) {
                const loanGroupStartDate = getSaturdayOfWeek(new Date(loan.startDate));
                loanGroupStartDate.setUTCDate(loanGroupStartDate.getUTCDate() + 7);
                const termInWeeks = loanPlan.termInWeeks + (loansWithPenalty[loan.id] ? 1 : 0);
                const lastPaymentDay = new Date(loanGroupStartDate);
                lastPaymentDay.setUTCDate(lastPaymentDay.getUTCDate() + (termInWeeks - 1) * 7);
                if (lastPaymentDay > latestVencimientoDate) {
                    latestVencimientoDate = lastPaymentDay;
                }
            }
        });


        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Fecha', margin, topMargin + 10);
        doc.text('Promotora', margin, topMargin + 22);
        doc.text('Localidad', margin, topMargin + 34);
        doc.text('Plaza', margin, topMargin + 46);
        
        doc.setFont('helvetica', 'normal');
        doc.text(formatDate(groupStartDate.toISOString()), margin + 50, topMargin + 10);
        doc.text(promotoraName.toUpperCase(), margin + 50, topMargin + 22);
        doc.text(localidadName.toUpperCase(), margin + 50, topMargin + 34);
        doc.text(plazaName.toUpperCase(), margin + 50, topMargin + 46);

        const rightColumnX = pageWidth - margin - 100;
        doc.setFont('helvetica', 'bold');
        doc.text('Vence', rightColumnX, topMargin + 10);
        doc.text('Plaza', rightColumnX, topMargin + 22);
        doc.text('Cantidad', rightColumnX, topMargin + 34);

        doc.setFont('helvetica', 'normal');
        doc.text(latestVencimientoDate > new Date(0) ? formatDate(latestVencimientoDate.toISOString()) : 'N/A', rightColumnX + 50, topMargin + 10);
        doc.text(plazaName.toUpperCase(), rightColumnX + 50, topMargin + 22);
        doc.text(formatCurrency(totalAmount), rightColumnX + 50, topMargin + 34);

        const weekDatesHeader = Array.from({ length: maxWeeksToShow }).map((_, i) => {
            const weekNumber = i + 1;
            const groupStartDate = getSaturdayOfWeek(new Date(selectedWeek!));
            const firstPaymentSaturday = new Date(groupStartDate);
            firstPaymentSaturday.setUTCDate(groupStartDate.getUTCDate() + 7);
            const headerDate = new Date(firstPaymentSaturday);
            headerDate.setUTCDate(firstPaymentSaturday.getUTCDate() + (weekNumber - 1) * 7);

            const day = String(headerDate.getUTCDate()).padStart(2, '0');
            const month = String(headerDate.getUTCMonth() + 1).padStart(2, '0');
            const year = headerDate.getUTCFullYear().toString().slice(-2);
            
            return `${day}\n${month}\n${year}`;
        });

        const tableHeaders: any[] = [
            [
                { content: '', colSpan: 3, styles: { fillColor: [220, 220, 220] } },
                ...Array.from({ length: maxWeeksToShow }).map((_, i) => ({ 
                    content: `S${i + 1}`, 
                    styles: { halign: 'center', valign: 'middle', fontSize: 9, minCellHeight: 20 } 
                })),
                { content: '', colSpan: 1, styles: { fillColor: [220, 220, 220] } },
            ],
            [
                { content: 'CLIENTE', styles: { valign: 'middle', halign: 'center', fontSize: 8 } },
                { content: 'P\nR\nE\nS\nT\n.', styles: { valign: 'middle', halign: 'center', fontSize: 7, fontStyle: 'bold' } },
                { content: 'A\nB\nO\nN\nA', styles: { valign: 'middle', halign: 'center', fontSize: 7, fontStyle: 'bold' } }, 
                ...weekDatesHeader.map(dateStr => ({ 
                    content: dateStr, 
                    styles: { minCellHeight: 50, halign: 'center', valign: 'middle', fontSize: 7, textColor: [0, 0, 0] } 
                })),
                { content: 'AVAL', styles: { valign: 'middle', halign: 'center', fontSize: 8 } },
            ]
        ];

        const tableData = filteredLoans.map(loan => {
            const client = getClient(loan.clientId);
            let clientText = '';
            if (client) {
                const guaranteeStr = client.guarantee ? `\nGARANTÍA: ${client.guarantee.toUpperCase()}` : '';
                clientText = `${client.name.toUpperCase()}\n${client.street || ''}, ${client.neighborhood || ''}\n${client.phone || ''}${guaranteeStr}`;
            }

            let avalText = '';
            if (client?.endorsement) {
                 const match = client.endorsement.match(/(.*) \((.*)\)/);
                if (match) {
                    avalText = `${match[1].toUpperCase()}\n${match[2]}`;
                } else {
                    avalText = client.endorsement.toUpperCase();
                }
            }

            return [
                clientText,
                { content: formatCurrencySimple(loan.amount), styles: { fontSize: 6.5, textColor: [0, 0, 0] } },
                { content: formatCurrencySimple(getWeeklyPaymentAmount(loan)), styles: { fontSize: 6.5, fontStyle: 'bold', textColor: [0, 0, 0] } },
                ...Array(maxWeeksToShow).fill(''),
                avalText,
            ];
        });

        const weeklyFailuresPDF = Array.from({ length: maxWeeksToShow }).map((_, i) => {
            const weekNumber = i + 1;
            return filteredLoans.reduce((total, loan) => {
                const weeklyPayment = getWeeklyPaymentAmount(loan);
                const paymentForWeek = loan.payments.find(p => p.weekNumber === weekNumber);
                if (paymentForWeek && !paymentForWeek.isReverted && paymentForWeek.amount < weeklyPayment) {
                    return total + (weeklyPayment - paymentForWeek.amount);
                }
                return total;
            }, 0);
        });

        const weeklyCollectedPDF = Array.from({ length: maxWeeksToShow }).map((_, i) => {
            const weekNumber = i + 1;
            return filteredLoans.reduce((total, loan) => {
                const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate, getMexicoNow());
                const weekStatus = getWeekPaymentStatus(loan, weekNumber, currentLoanWeek);
                const weeklyPayment = getWeeklyPaymentAmount(loan);
        
                if (weekStatus.status === 'paid' || weekStatus.status === 'partial') {
                    if(!weekStatus.isAssumedPaid) {
                        return total + weekStatus.amountPaid;
                    }
                }
                if (weekStatus.isAssumedPaid) {
                    return total + weeklyPayment;
                }
                return total;
            }, 0);
        });
        
        const totalAbonos = filteredLoans.reduce((sum, loan) => sum + getWeeklyPaymentAmount(loan), 0);
        
        const footerRow1: any[] = [
            { content: `TOT. CLIENTES: ${filteredLoans.length}`, styles: { fontStyle: 'bold' as const, halign: 'right' } },
            { content: ``, styles: {} },
            { content: `TOTALES: ${formatCurrencySimple(totalAbonos)}`, styles: { fontStyle: 'bold' as const, halign: 'right' } },
        ];
        const footerRow2: any[] = [{content: 'FALLA', colSpan: 3, styles: {halign: 'right', fontStyle: 'bold' as const, fillColor: '#e0e0e0'}}];
        const footerRow3: any[] = [{content: 'COBRADO', colSpan: 3, styles: {halign: 'right', fontStyle: 'bold' as const}}];

        Array.from({ length: maxWeeksToShow }).forEach((_, i) => {
            const weeklyTotal = filteredLoans.reduce((total, loan) => {
                const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
                if(loanPlan && i + 1 <= (loanPlan.termInWeeks + (loansWithPenalty[loan.id] ? 1 : 0))) {
                    return total + getWeeklyPaymentAmount(loan);
                }
                return total;
            }, 0);
            footerRow1.push({ 
                content: weeklyTotal > 0 ? formatCurrencySimple(weeklyTotal) : '', 
                styles: { 
                    fontStyle: 'bold' as const, 
                    halign: 'center', 
                    fontSize: 5.8, 
                    cellPadding: { top: 4, right: 1, bottom: 4, left: 1 } 
                } 
            });
            footerRow2.push({ 
                content: weeklyFailuresPDF[i] > 0 ? formatCurrencySimplePDF(weeklyFailuresPDF[i]) : '', 
                styles: { 
                    fontStyle: 'bold' as const, 
                    halign: 'center', 
                    fillColor: '#e0e0e0', 
                    fontSize: 5.8, 
                    cellPadding: { top: 4, right: 1, bottom: 4, left: 1 } 
                } 
            });
            footerRow3.push({ 
                content: weeklyCollectedPDF[i] > 0 ? formatCurrencySimplePDF(weeklyCollectedPDF[i]) : '', 
                styles: { 
                    fontStyle: 'bold' as const, 
                    halign: 'center', 
                    fontSize: 5.8, 
                    cellPadding: { top: 4, right: 1, bottom: 4, left: 1 } 
                } 
            });
        });
        footerRow1.push({ content: '', styles: { fontStyle: 'bold' as const, halign: 'right' } });
        footerRow2.push({ content: '', colSpan: 1 });
        footerRow3.push({ content: '', colSpan: 1 });
        
        const footerRows = [footerRow1, footerRow2, footerRow3];
        
        const clientColWidth = 142;
        const prestamoColWidth = 32;
        const abonaColWidth = 28;
        const avalColWidth = 143;
        const availableWidth = pageWidth - margin * 2 - clientColWidth - prestamoColWidth - abonaColWidth - avalColWidth;
        const weekColumnWidth = availableWidth / maxWeeksToShow;


        doc.autoTable({
            startY: topMargin + 60,
            head: tableHeaders,
            body: tableData,
            foot: footerRows,
            theme: 'grid',
            margin: { left: margin, right: margin },
            styles: {
                lineWidth: 0.5,
                lineColor: [0, 0, 0],
                fontSize: 6.5,
                cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
                valign: 'middle',
            },
            headStyles: {
                fillColor: [220, 220, 220],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
            },
            footStyles: {
                fillColor: [220, 220, 220],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                valign: 'middle',
                fontSize: 6.5,
            },
            columnStyles: {
                0: { cellWidth: clientColWidth, fontSize: 6.5 },
                1: { cellWidth: prestamoColWidth, halign: 'right', fontSize: 6.5 },
                2: { cellWidth: abonaColWidth, fontSize: 8, halign: 'center' },
                ...Object.fromEntries(Array.from({ length: maxWeeksToShow }).map((_, i) => [i + 3, { cellWidth: weekColumnWidth, halign: 'center', fontSize: 5.5, noWrap: true, cellPadding: { top: 4, right: 1, bottom: 4, left: 1 } }])),
                [maxWeeksToShow + 3]: { cellWidth: avalColWidth, fontSize: 6.5 },
            },
            didParseCell: (data) => {
                if (data.row.section === 'body') {
                    const loan = filteredLoans[data.row.index];
                    if (loan && checkIfLoanHighlighted(loan)) {
                        data.cell.styles.fillColor = [254, 243, 199];
                    }
                }
            },
            didDrawCell: (data) => {
                const loan = filteredLoans[data.row.index];
                if (!loan || data.row.section !== 'body') return;

                const currentWeekForLoan = getCurrentLoanWeekNumber(loan.startDate, getMexicoNow());
                
                if (data.column.index >= 3 && data.column.index < (3 + maxWeeksToShow)) {
                    const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
                    const weekNumber = data.column.index - 2;
                    const hasPenalty = loansWithPenalty[loan.id] || false;
                    const termInWeeks = loanPlan ? loanPlan.termInWeeks + (hasPenalty ? 1 : 0) : 0;
                    
                    if (!loanPlan || weekNumber > termInWeeks) return;
                    
                    const weeklyPayment = getWeeklyPaymentAmount(loan);
                    const status = getWeekPaymentStatus(loan, weekNumber, currentWeekForLoan);

                    let text = '';
                    let subtext = '';
                    if (status.isAdvance) {
                        text = 'Adelanto';
                        subtext = formatCurrencySimplePDF(status.amountPaid);
                        doc.setFillColor(224, 242, 254);
                        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                    } else if (status.status === 'paid' && !status.isAssumedPaid) {
                        text = status.isRecovered ? 'Recuperado' : 'Abono';
                        subtext = formatCurrencySimplePDF(status.amountPaid);
                        if (status.isRecovered) {
                            doc.setFillColor(243, 232, 255);
                            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                        }
                    } else if (status.status === 'paid' && status.isAssumedPaid) {
                        text = 'Abono';
                        subtext = formatCurrencySimplePDF(weeklyPayment);
                    } else if (status.status === 'partial' || status.status === 'missed') {
                        const fallo = weeklyPayment - status.amountPaid;
                        if(fallo > 0) {
                            text = status.isRecovered ? 'Recup. Parcial' : 'Falla';
                            subtext = formatCurrencySimplePDF(fallo);
                            if (status.isRecovered) {
                                doc.setFillColor(243, 232, 255);
                                doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                            } else {
                                doc.setFillColor(224, 224, 224);
                                doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                            }
                        }
                    }

                    if (text) {
                        const centerX = data.cell.x + data.cell.width / 2;
                        const centerY = data.cell.y + data.cell.height / 2;
                        doc.setFontSize(5);
                        doc.setTextColor(0, 0, 0);
                        doc.text(text, centerX, centerY - 2, { align: 'center' });
                        if(subtext) {
                            doc.setFontSize(6);
                            doc.text(subtext, centerX, centerY + 5, { align: 'center' });
                        }
                    }
                }
            }
        });

        const weekDate = new Date(selectedWeek);
        const formattedDate = formatDateFns(weekDate, 'dd-MM-yyyy');
        const fileName = `${plazaName} - ${localidadName} - ${promotoraName} - ${formattedDate}.pdf`;
        doc.save(fileName);
    };

    const handlePlazaChange = (plazaId: string) => {
        setSelectedPlaza(plazaId);
        setSelectedLocalidad('');
        setSelectedPromotora('');
        setSelectedWeek(null);
    };

    const handleLocalidadChange = (localidadId: string) => {
        setSelectedLocalidad(localidadId);
        setSelectedWeek(null);
        
        const localPromotoras = promotoras.filter(p => p.localidadId === localidadId);
        if (localPromotoras.length === 1) {
            setSelectedPromotora(localPromotoras[0].id);
        } else {
            setSelectedPromotora('');
        }
    };

    const handlePromotoraChange = (promotoraId: string) => {
        setSelectedPromotora(promotoraId);
        setSelectedWeek(null);
    };

    const toggleAllLoansSelection = () => {
        if (selectedLoanIds.size === filteredLoans.length) {
            setSelectedLoanIds(new Set());
        } else {
            setSelectedLoanIds(new Set(filteredLoans.map(loan => loan.id)));
        }
    };

    const toggleLoanSelection = (loanId: string) => {
        const newSelection = new Set(selectedLoanIds);
        if (newSelection.has(loanId)) {
            newSelection.delete(loanId);
        } else {
            newSelection.add(loanId);
        }
        setSelectedLoanIds(newSelection);
    };


  return (
    <>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
            {/* Mobile Filter Toggle */}
            <div className="md:hidden w-full">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                    className={cn(
                        "w-full flex justify-between items-center h-10 border-2 font-black uppercase text-[10px] tracking-widest",
                        isFiltersOpen ? "bg-zinc-100 border-zinc-300" : "bg-zinc-50"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-blue-600" />
                        Seleccionar Ubicación
                    </div>
                    {isFiltersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </div>

            <div className={cn(
                "flex flex-wrap items-center gap-2 w-full md:w-auto",
                !isFiltersOpen && "hidden md:flex"
            )}>
                {/* Búsqueda Rápida de Promotoras */}
                <div className="relative w-full md:w-[220px]">
                    <div className="relative">
                        <Input
                            type="text"
                            placeholder="Buscar promotora..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                            className="rounded-xl border border-input h-10 pl-8 pr-3 bg-background focus-visible:ring-primary font-medium text-xs w-full shadow-sm"
                        />
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Dropdown Results Overlay */}
                    {isSearchFocused && searchTerm.trim() && (
                        <div className="absolute z-50 w-full md:w-[150%] min-w-[300px] mt-1.5 bg-background border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                            {searchedPromotoras.length > 0 ? (
                                <div className="p-1.5 divide-y divide-slate-50">
                                    {searchedPromotoras.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedPlaza(p.plazaId);
                                                setSelectedLocalidad(p.localidadId);
                                                setSelectedPromotora(p.id);
                                                setSelectedWeek(null);
                                                setSearchTerm('');
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary/5 active:bg-primary/10 rounded-lg text-left transition-colors"
                                        >
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-slate-800 uppercase text-xs">{p.name}</span>
                                                    {p.personalName && (
                                                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                                                            • {p.personalName}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[9px] uppercase font-semibold text-muted-foreground mt-0.5">
                                                    {p.localidadName} ({p.plazaName})
                                                </div>
                                            </div>
                                            <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                                Elegir
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 text-center text-xs text-muted-foreground font-bold">
                                    No hay coincidencias
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <Select value={selectedPlaza} onValueChange={handlePlazaChange}>
                    <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Selecciona Plaza" /></SelectTrigger>
                    <SelectContent>
                        {sortedPlazas.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="w-full md:w-auto">
                    <Button 
                        variant="outline"
                        disabled={!selectedPlaza}
                        onClick={() => {
                            setLocalidadSearchTerm('');
                            setIsLocalidadDialogOpen(true);
                        }}
                        className="w-full md:w-[180px] justify-between text-left font-semibold text-xs border border-input h-10 px-3 bg-background hover:bg-muted/50 rounded-xl"
                    >
                        <span className="truncate">
                            {selectedLocalidad 
                                ? filteredLocalidades.find(l => l.id === selectedLocalidad)?.name || "Selecciona Localidad"
                                : "Selecciona Localidad"
                            }
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>

                    <Dialog open={isLocalidadDialogOpen} onOpenChange={setIsLocalidadDialogOpen}>
                        <DialogContent className="sm:max-w-[650px] rounded-2xl p-6">
                            <DialogTitle className="sr-only">Seleccionar Localidad</DialogTitle>
                            <div className="py-2">
                                <ScrollArea className="h-48 md:h-auto">
                                    <div className="grid grid-cols-3 gap-2">
                                        {filteredLocalidades.map((l) => {
                                            const isSelected = selectedLocalidad === l.id;
                                            return (
                                                <Button
                                                    key={l.id}
                                                    variant={isSelected ? "default" : "outline"}
                                                    onClick={() => {
                                                        handleLocalidadChange(l.id);
                                                        setIsLocalidadDialogOpen(false);
                                                    }}
                                                    className={cn(
                                                        "justify-start text-left h-10 px-3 text-xs font-bold transition-all rounded-xl truncate active:scale-95 w-full",
                                                        isSelected 
                                                            ? "bg-blue-600 hover:bg-blue-700 text-white font-black shadow-md border-0" 
                                                            : "bg-background hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors border-border/80"
                                                    )}
                                                >
                                                    {l.name}
                                                </Button>
                                            );
                                        })}
                                        {filteredLocalidades.length === 0 && (
                                            <div className="col-span-3 text-center py-8 text-xs text-muted-foreground">
                                                No hay localidades disponibles para esta plaza.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
                <Select value={selectedPromotora} onValueChange={handlePromotoraChange} disabled={!selectedLocalidad}>
                    <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Selecciona Promotora" /></SelectTrigger>
                    <SelectContent>
                        {filteredPromotoras.map(p => {
                            const assigned = data?.personal?.find(per => per.id === p.personalId);
                            return (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}{assigned ? ` (${assigned.nombre} ${assigned.apellidoPaterno})` : ''}
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </div>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            {isCristobal && (
                <>
                    <Button variant="default" onClick={() => setChangeDateDialogOpen(true)} disabled={selectedLoanIds.size === 0} className='flex'>
                        <CalendarCog className="mr-2 h-4 w-4" />
                        Mover Fecha
                    </Button>
                    <Button 
                        variant="secondary" 
                        onClick={handleOpenMovePromotora} 
                        disabled={selectedLoanIds.size === 0} 
                        className='flex bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700 font-medium'
                        title={selectedLoanIds.size === 0 ? "Selecciona préstamos con la casilla para moverlos" : "Mover los préstamos seleccionados a otra promotora/grupo"}
                    >
                        <UserCog className="mr-2 h-4 w-4 text-amber-700 dark:text-amber-300" />
                        Mover Promotora
                    </Button>
                </>
            )}
            <Button 
                variant="outline" 
                size="icon"
                onClick={() => {
                    const defaultWeek = (selectedWeek && availableCutoffWeeks.includes(selectedWeek))
                        ? selectedWeek
                        : (availableCutoffWeeks[0] || '');
                    setSelectedCutoffWeek(defaultWeek);
                    setAccumulateAllDialogOpen(true);
                }} 
                disabled={!selectedPromotora || allPromotoraActiveLoans.length === 0 || !hasAssumedPaymentsInPromotora || isAccumulatingAll}
                className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0"
                title={!selectedPromotora 
                    ? "Selecciona una promotora primero" 
                    : !hasAssumedPaymentsInPromotora 
                        ? "No hay pagos asumidos pendientes por acumular en esta promotora" 
                        : "Acumular pagos asumidos de todas las semanas activas de la promotora"}
                aria-label="Acumular pagos de todas las semanas activas"
            >
                {isAccumulatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={handleExportPDF} disabled={filteredLoans.length === 0} className='flex-1 md:flex-none'>
                <FileDown className="mr-2 h-4 w-4" />
                PDF
            </Button>
            <CreateLoanDialog
              clients={clients}
              loanPlans={loanPlans}
              loans={loans}
              plazas={plazas}
              localidades={localidades}
              promotoras={promotoras}
              initialSelection={initialSelectionForCreateLoan}
             />
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-[220px_1fr] items-start">
        <Card>
            <CardHeader className="p-2 pt-4">
                <CardTitle className="text-base uppercase font-black text-zinc-500 text-[10px] tracking-widest px-2">Semanas Activas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="px-2 pb-2">
                    <ScrollArea className={cn(loanWeeks.length > 3 ? "h-48 md:h-auto" : "h-auto")}>
                        <div className="flex flex-col gap-0.5 p-1 bg-muted/20 rounded-xl border border-border/40 shadow-inner">
                            {loanWeeks.map((week) => {
                                const isSelected = selectedWeek === week;
                                const count = loansCountByWeek[week] || 0;
                                return (
                                    <Button 
                                        key={week}
                                        variant="ghost"
                                        className={cn(
                                            "w-full justify-start h-8 px-2.5 text-[11px] font-bold transition-all rounded-lg relative overflow-hidden active:scale-95 group",
                                            isSelected 
                                                ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60" 
                                                : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                                        )}
                                        onClick={() => setSelectedWeek(week)}
                                        disabled={!selectedPromotora}
                                    >
                                        <div className="flex items-center justify-between w-full gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {isSelected && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse shrink-0" />
                                                )}
                                                <span className={cn(
                                                    "transition-all duration-300 truncate",
                                                    isSelected ? "opacity-100 font-extrabold" : "opacity-80"
                                                )}>
                                                    {formatDate(week)}
                                                </span>
                                            </div>
                                            <span className={cn(
                                                "text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors shrink-0 leading-none",
                                                isSelected 
                                                    ? "bg-blue-200/70 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200" 
                                                    : "bg-muted/80 text-muted-foreground group-hover:bg-muted"
                                            )}>
                                                {count} {count === 1 ? 'préstamo' : 'préstamos'}
                                            </span>
                                        </div>
                                    </Button>
                                )
                            })}
                        </div>
                    </ScrollArea>
                    {selectedPromotora && loanWeeks.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center p-4">No hay préstamos activos.</p>
                    )}
                    {!selectedPromotora && <p className="text-sm text-muted-foreground text-center p-4">Selecciona promotora.</p>}
                </div>
            </CardContent>
        </Card>

        <div className="flex flex-col gap-6 min-w-0">
          <Card>
          <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 gap-2">
            <div>
                <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle>Préstamos de la Semana</CardTitle>
                    {selectedPromotora && (() => {
                        const prom = promotoras.find(p => p.id === selectedPromotora);
                        const assigned = data?.personal?.find(per => per.id === prom?.personalId);
                        if (!assigned) return null;
                        return (
                            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                                Promotora: {assigned.nombre} {assigned.apellidoPaterno}
                            </span>
                        );
                    })()}
                </div>
                <CardDescription>
                {selectedWeek
                    ? `Mostrando ${filteredLoans.length} préstamos para la semana del ${formatDate(selectedWeek)}.`
                    : 'Selecciona una promotora y una semana para ver los préstamos.'
                }
                </CardDescription>
            </div>
            {selectedWeek && filteredLoans.length > 0 && (
              <div className="flex flex-col items-start sm:items-end">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Total Prestado</span>
                <span className="text-lg font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 px-3 py-1 rounded-lg">
                  {formatCurrency(filteredLoans.reduce((sum, l) => sum + l.amount, 0))}
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <TooltipProvider>
              <ScrollArea className="w-full whitespace-nowrap">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isCristobal && (
                          <TableHead className="sticky left-0 bg-card z-10 w-auto py-1.5 px-1 h-8 text-center">
                              <Checkbox
                                  checked={selectedLoanIds.size > 0 && selectedLoanIds.size === filteredLoans.length}
                                  onCheckedChange={toggleAllLoansSelection}
                                  aria-label="Seleccionar todas las filas"
                                  disabled={filteredLoans.length === 0}
                                  className="h-3.5 w-3.5"
                              />
                          </TableHead>
                      )}
                      <TableHead className={cn("sticky bg-card z-10 w-[150px] py-1.5 px-2 h-8 text-left font-black text-[10px] uppercase text-slate-700", isCristobal ? "left-10" : "left-0")}>Cliente</TableHead>
                      <TableHead className="py-1.5 px-1 h-8 text-center font-black text-[10px] uppercase text-slate-700">Préstamo</TableHead>
                      <TableHead className="py-1.5 px-1 h-8 text-center font-black text-[10px] uppercase text-slate-700">Abono</TableHead>
                      <TableHead className="py-1.5 px-1 h-8 text-center font-black text-[10px] uppercase text-slate-700">Estado</TableHead>
                      {Array.from({ length: 16 }, (_, i) => {
                          const weekNumber = i + 1;
                          const isCurrentWeek = weekNumber === currentGroupWeek;
                          
                          let headerTitle = `Semana ${weekNumber}`;
                          if (selectedWeek) {
                              const groupSat = getSaturdayOfWeek(new Date(selectedWeek));
                              const colDate = new Date(groupSat);
                              colDate.setDate(groupSat.getDate() + (weekNumber * 7));
                              headerTitle += ` (Inicia ${formatDate(colDate.toISOString())})`;
                          }

                          return (
                            <TableHead 
                              key={i} 
                              title={headerTitle}
                              className={cn(
                                "text-center py-1.5 px-0.5 border-r h-8 font-black text-[10px] uppercase text-slate-700 transition-colors", 
                                isCurrentWeek && "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-black"
                              )}
                            >
                              {`S${i + 1}`}
                            </TableHead>
                          );
                      })}
                      <TableHead className="text-right sticky right-0 bg-card z-10 py-1.5 px-2 h-8 font-black text-[10px] uppercase text-slate-700">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLoans.length > 0 ? (
                      filteredLoans.map((loan) => {
                        const originalLoanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
                        
                        if (!originalLoanPlan) return null;

                        const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate);

                        const hasPenalty = loansWithPenalty[loan.id] || false;
                        const termInWeeks = originalLoanPlan.termInWeeks + (hasPenalty ? 1 : 0);
                        const weeklyPayment = getWeeklyPaymentAmount(loan);
                        const isHighlighted = checkIfLoanHighlighted(loan);
                        
                        return (
                        <TableRow 
                          key={loan.id} 
                          className={cn(
                            "bg-card transition-colors", 
                            isHighlighted && "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-900/30 border-l-4 border-l-amber-500 shadow-sm"
                          )} 
                          data-state={selectedLoanIds.has(loan.id) && "selected"}
                        >
                          {isCristobal && (
                              <TableCell className="sticky left-0 z-10 w-auto py-1 px-1 bg-inherit text-center">
                                  <Checkbox
                                      checked={selectedLoanIds.has(loan.id)}
                                      onCheckedChange={() => toggleLoanSelection(loan.id)}
                                      aria-label="Seleccionar fila"
                                      className="h-3.5 w-3.5"
                                  />
                              </TableCell>
                          )}
                          <TableCell className={cn("font-extrabold sticky z-10 w-[150px] py-1 px-2 bg-inherit text-[11px] leading-tight text-slate-800 uppercase truncate", isCristobal ? "left-10" : "left-0")}>
                            <Link href={`/inicio/clientes/${loan.clientId}`} className="hover:underline">
                              {getClientName(loan.clientId)}
                            </Link>
                          </TableCell>
                          <TableCell className="py-1 px-1 text-center text-[11px] font-extrabold text-slate-700">{formatCurrency(loan.amount)}</TableCell>
                          <TableCell className="py-1 px-1 text-center text-[11px] font-extrabold text-slate-700">{formatCurrency(weeklyPayment)}</TableCell>
                          <TableCell className="py-1 px-1 text-center">
                            <Badge variant={getStatusVariant(loan.status)} className="text-[9px] font-black uppercase py-0 px-1.5 leading-none h-4">{translateStatus(loan.status)}</Badge>
                          </TableCell>
                           {Array.from({ length: 16 }).map((_, i) => {
                                const weekNumber = i + 1;
                                const isCurrentWeek = weekNumber === currentGroupWeek;
                                const isPenaltyWeek = hasPenalty && weekNumber === termInWeeks;
 
                                if (weekNumber > termInWeeks) {
                                    return <TableCell key={i} className={cn("text-center py-1 px-0.5 border-r", isCurrentWeek && "bg-blue-100 dark:bg-blue-900/30")} />;
                                }
                                
                                const weekStatus = getWeekPaymentStatus(loan, weekNumber, currentLoanWeek);
                                const isAdvance = weekStatus.isAdvance || false;
                                const isAccumulated = weekStatus.isAccumulated || false;
                                const isLoanPaid = (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV');

                                // Los campos de semanas adelantadas, semanas ya acumuladas o préstamos liquidados quedan bloqueados
                                const isFieldBlocked = isAdvance || isAccumulated || isLoanPaid;
                                const canRegisterPayment = !isFieldBlocked;
 
                                let statusInfo;
                                 switch(weekStatus.status) {
                                     case 'paid':
                                         const paidAmountText = weekStatus.isAssumedPaid ? `Asumido` : `Abono: ${formatCurrency(weekStatus.amountPaid)}`;
                                         let paidIcon = <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />;
                                         let paidText = 'Pagado';
                                         if (isAdvance) {
                                             paidIcon = <ArrowUpRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mx-auto font-black" />;
                                             paidText = 'Adelanto Entrante';
                                         } else if (weekStatus.isRecovered) {
                                             paidIcon = <CheckCircle2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 mx-auto" />;
                                             paidText = 'Recuperado';
                                         } else if (weekStatus.isAssumedPaid) {
                                             paidText = 'Asumido';
                                         }
                                         statusInfo = { 
                                             icon: paidIcon, 
                                             text: paidText, 
                                             paid: paidAmountText 
                                         };
                                         break;
                                     case 'partial':
                                         const fallo = weeklyPayment - weekStatus.amountPaid;
                                         let partialIcon = <AlertCircle className="h-3.5 w-3.5 text-yellow-500 mx-auto" />;
                                         let partialText = 'Pago Parcial';
                                         if (isAdvance) {
                                             partialIcon = <ArrowUpRight className="h-3.5 w-3.5 text-blue-500 mx-auto font-black" />;
                                             partialText = 'Adelanto Entrante Parcial';
                                         } else if (weekStatus.isRecovered) {
                                             partialIcon = <AlertCircle className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 mx-auto" />;
                                             partialText = 'Recuperado Parcial';
                                         }
                                         statusInfo = { 
                                             icon: partialIcon, 
                                             text: partialText, 
                                             paid: `Abono: ${formatCurrency(weekStatus.amountPaid)}`,
                                             pending: `Fallo: ${formatCurrency(fallo)}`
                                         };
                                         break;
                                     case 'missed':
                                         statusInfo = { icon: <XCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />, text: 'Atrasado' };
                                         break;
                                     default:
                                         statusInfo = { icon: <Circle className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />, text: 'Pendiente' };
                                 }
                                
                                return (
                                    <TableCell key={i} className={cn("text-center py-1 px-0.5 border-r", isCurrentWeek && "bg-blue-100 dark:bg-blue-900/30", isPenaltyWeek && "bg-orange-100 dark:bg-orange-900/30", isAdvance && "bg-blue-50/80 dark:bg-blue-950/20")}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button 
                                                    className={cn("w-full flex items-center justify-center transition-opacity", isFieldBlocked ? "cursor-not-allowed opacity-90" : "cursor-pointer hover:opacity-80")}
                                                    disabled={isFieldBlocked}
                                                    onClick={(e) => {
                                                    if(canRegisterPayment) {
                                                        e.stopPropagation();
                                                        handleRegisterPaymentClick(loan, weekNumber, weekStatus);
                                                    }
                                                    }}
                                                >
                                                    {statusInfo.icon}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Semana {weekNumber} {isPenaltyWeek && <span className='font-bold text-orange-500'>(Semana Extra)</span>}</p>
                                                <p>(Inicia: {formatDate(weekStatus.date.toISOString())})</p>
                                                <p>Estado: {statusInfo.text}</p>
                                                {statusInfo.paid && <p>{statusInfo.paid}</p>}
                                                {statusInfo.pending && <p className="text-destructive">{statusInfo.pending}</p>}
                                                {isAdvance ? (
                                                    <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">Adelanto Entrante (Bloqueado)</p>
                                                ) : isAccumulated ? (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 font-bold">Abono Acumulado (Definitivo - Bloqueado)</p>
                                                ) : isLoanPaid ? (
                                                    <p className="text-xs text-muted-foreground font-bold">Préstamo liquidado (Bloqueado)</p>
                                                ) : canRegisterPayment ? (
                                                    <p className="text-xs text-primary">Clic para registrar o editar abono</p>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">No se puede registrar pago.</p>
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TableCell>
                                );
                            })}
                          <TableCell className="text-right sticky right-0 z-10 py-1 px-2 bg-inherit">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Toggle menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                 <DropdownMenuItem asChild>
                                    <Link href={`/inicio/clientes/${loan.clientId}`}>Ver Detalles del Cliente</Link>
                                </DropdownMenuItem>
                                {isCristobal && (
                                    <>
                                        <DropdownMenuItem 
                                            onClick={() => {
                                                setSelectedLoanIds(new Set([loan.id]));
                                                setTargetMovePlaza(selectedPlaza || (plazas[0]?.id || ""));
                                                setTargetMoveLocalidad(selectedLocalidad || "");
                                                setTargetMovePromotora("");
                                                setChangePromotoraDialogOpen(true);
                                            }} 
                                            className="text-amber-700 dark:text-amber-400 font-semibold cursor-pointer"
                                        >
                                            <UserCog className="mr-2 h-4 w-4" />
                                            Mover Promotora
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setLoanToPayOff(loan)} className="text-blue-600 font-semibold cursor-pointer">
                                            <BadgeDollarSign className="mr-2 h-4 w-4" />
                                            Liquidar Préstamo
                                        </DropdownMenuItem>
                                    </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                         </TableRow>
                      )})
                    ) : (
                        <TableRow>
                            <TableCell colSpan={22} className="text-center h-24 p-2">
                               {selectedPromotora ? "No hay préstamos activos para la semana y promotora seleccionada." : "Selecciona una promotora para comenzar."}
                            </TableCell>
                        </TableRow>
                    )}
                  </TableBody>
                  {filteredLoans.length > 0 && weeklyFailures.length > 0 && weeklyCollected.length > 0 && (
                    <TableFooter>
                        <TableRow className="h-8">
                            <TableCell colSpan={isCristobal ? 5 : 4} className="sticky left-0 bg-inherit py-1 px-2 font-black text-right text-[10px] uppercase text-slate-700">Total a Cobrar</TableCell>
                            {Array.from({ length: 16 }).map((_, i) => {
                                const weekNumber = i + 1;
                                const isCurrentWeek = weekNumber === currentGroupWeek;
                                const weeklyTotal = filteredLoans.reduce((total, loan) => {
                                    const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
                                    if(loanPlan && i + 1 <= (loanPlan.termInWeeks + (loansWithPenalty[loan.id] ? 1 : 0))) {
                                        return total + getWeeklyPaymentAmount(loan);
                                    }
                                    return total;
                                }, 0);
                                return (
                                    <TableCell key={i} className={cn("py-1 px-0.5 text-center font-bold text-[10px] border-r text-slate-700", isCurrentWeek && "bg-blue-100 dark:bg-blue-900/30")}>
                                        {weeklyTotal > 0 ? formatCurrencySimple(weeklyTotal) : ''}
                                    </TableCell>
                                )
                            })}
                            <TableCell className="sticky right-0 bg-inherit py-1 px-1"></TableCell>
                        </TableRow>
                        <TableRow className="border-t h-8">
                          <TableCell colSpan={isCristobal ? 5 : 4} className="sticky left-0 bg-inherit py-1 px-2 font-black text-right text-destructive text-[10px] uppercase">Falla</TableCell>
                            {weeklyFailures.map((total, i) => {
                                const weekNumber = i + 1;
                                const isCurrentWeek = weekNumber === currentGroupWeek;
                                return (
                                <TableCell key={i} className={cn("py-1 px-0.5 text-center font-bold text-destructive text-[10px] border-r", isCurrentWeek && "bg-blue-100 dark:bg-blue-900/30")}>
                                    {total > 0 ? formatCurrencySimple(total) : ''}
                                </TableCell>
                            )})}
                            <TableCell className="sticky right-0 bg-inherit py-1 px-1"></TableCell>
                        </TableRow>
                        <TableRow className="border-t h-8">
                            <TableCell colSpan={isCristobal ? 5 : 4} className="sticky left-0 bg-inherit py-1 px-2 font-black text-right text-blue-600 text-[10px] uppercase">Cobrado</TableCell>
                            {weeklyCollected.map((total, i) => {
                                const weekNumber = i + 1;
                                const isCurrentWeek = weekNumber === currentGroupWeek;
                                return (
                                <TableCell key={i} className={cn("py-1 px-0.5 text-center font-bold text-blue-600 text-[10px] border-r", isCurrentWeek && "bg-blue-100 dark:bg-blue-900/30")}>
                                    {total > 0 ? formatCurrencySimple(total) : ''}
                                </TableCell>
                            )})}
                            <TableCell className="sticky right-0 bg-inherit py-1 px-1"></TableCell>
                        </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </ScrollArea>
            </TooltipProvider>
          </CardContent>
           {filteredLoans.length > 0 && (
                <CardFooter className="justify-end p-2 border-t gap-2">
                    {isCristobal && hasPaymentsToRevert && (
                         <Button 
                            variant="outline"
                            onClick={() => setRevertDialogOpen(true)} 
                            disabled={isReverting}
                            className="text-orange-600 border-orange-200 hover:bg-orange-50"
                        >
                            {isReverting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : <RotateCcw className="mr-2 h-4 w-4" />}
                            Pasar a Pendiente
                        </Button>
                    )}
                    <Button 
                        onClick={handleAccumulatePayments} 
                        disabled={(!hasAssumedPayments && totalEnteredOverdueAbonos === 0) || isAccumulating}
                    >
                        {isAccumulating ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {isAccumulating ? 'Acumulando...' : 'Acumular Pagos de la Semana'}
                    </Button>
                </CardFooter>
            )}
        </Card>

        {/* TABLA DE CARTERA VENCIDA */}
        {Boolean(selectedPromotora) && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2.5 px-4 gap-2">
            <div>
              <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                CLIENTES EN CARTERA VENCIDA
                {selectedPromotoraObj && (
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    — {selectedPromotoraObj.name}
                  </span>
                )}
                <Badge variant="outline" className="ml-1 text-[10px] font-bold h-5 px-1.5">
                  {overdueLoansForPromotora.length} {overdueLoansForPromotora.length === 1 ? 'crédito' : 'créditos'}
                </Badge>
              </CardTitle>
            </div>

            {totalEnteredOverdueAbonos > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-start sm:items-end">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none mb-0.5">Abonos Ingresados</span>
                  <span className="text-sm font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded leading-none">
                    {formatCurrency(totalEnteredOverdueAbonos)}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleAccumulatePayments}
                  disabled={isAccumulating}
                  className="h-8 text-xs font-bold"
                >
                  {isAccumulating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Acumular Abonos
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-7">
                    <TableHead className="py-1 px-2 h-7 text-left font-black text-[10px] uppercase text-slate-700">NOMBRE DEL CLIENTE</TableHead>
                    <TableHead className="py-1 px-2 h-7 text-center font-black text-[10px] uppercase text-slate-700 w-[140px]">FECHA DEL PRESTAMO</TableHead>
                    <TableHead className="py-1 px-2 h-7 text-right font-black text-[10px] uppercase text-slate-700 w-[120px]">SALDO</TableHead>
                    <TableHead className="py-1 px-2 h-7 text-center font-black text-[10px] uppercase text-slate-700 w-[140px]">ABONO</TableHead>
                    <TableHead className="py-1 px-2 h-7 text-left font-black text-[10px] uppercase text-slate-700 min-w-[140px]">GESTOR</TableHead>
                    <TableHead className="py-1 px-2 h-7 text-center font-black text-[10px] uppercase text-slate-700 w-[80px]">ACCIÓN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueLoansForPromotora.length > 0 ? (
                    overdueLoansForPromotora.map((item) => {
                      const loanId = item.loan.id;
                      const currentAbono = overdueAbonos[loanId] !== undefined ? overdueAbonos[loanId] : '';
                      const currentGestor = overdueGestores[loanId] !== undefined ? overdueGestores[loanId] : item.defaultGestor;
                      const isApplying = applyingAbonoLoanId === loanId;

                      return (
                        <TableRow key={loanId} className="h-9 hover:bg-muted/30 transition-colors">
                          <TableCell className="py-1 px-2 font-bold text-xs truncate max-w-[200px]">
                            <Link 
                              href={`/inicio/clientes/${item.loan.clientId}`}
                              className="text-foreground hover:text-primary hover:underline uppercase tracking-wide font-black truncate block"
                              title={item.clientName}
                            >
                              {item.clientName}
                            </Link>
                          </TableCell>
                          <TableCell className="py-1 px-2 text-center text-xs font-semibold text-muted-foreground">
                            {formatDate(item.startDate)}
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <span className="font-bold text-xs text-foreground">
                              {formatCurrency(item.saldo)}
                            </span>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                                $
                              </span>
                              <Input
                                type="number"
                                min={0}
                                max={item.saldo}
                                placeholder="0.00"
                                value={currentAbono}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setOverdueAbonos(prev => ({
                                    ...prev,
                                    [loanId]: isNaN(val) ? 0 : val
                                  }));
                                }}
                                className="pl-5 h-7 text-xs font-bold text-right"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input
                              type="text"
                              placeholder="Nombre del gestor"
                              value={currentGestor}
                              onChange={(e) => {
                                setOverdueGestores(prev => ({
                                  ...prev,
                                  [loanId]: e.target.value
                                }));
                              }}
                              className="h-7 text-xs font-medium"
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApplySingleOverdueAbono(loanId)}
                              disabled={isApplying || !overdueAbonos[loanId] || overdueAbonos[loanId] <= 0}
                              className="h-7 text-xs px-2 font-bold"
                              title="Descontar y aplicar este abono directamente"
                            >
                              {isApplying ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Aplicar'
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-xs text-muted-foreground">
                        No hay clientes en cartera vencida con saldo pendiente para esta promotora.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {overdueLoansForPromotora.length > 0 && (
                  <TableFooter className="bg-muted/20">
                    <TableRow className="font-black text-xs h-8">
                      <TableCell colSpan={2} className="py-1 px-2 text-right uppercase text-[10px] font-black text-slate-700">
                        Totales Cartera Vencida:
                      </TableCell>
                      <TableCell className="py-1 px-2 text-right font-bold text-xs text-slate-700">
                        {formatCurrency(overdueLoansForPromotora.reduce((sum, item) => sum + item.saldo, 0))}
                      </TableCell>
                      <TableCell className="py-1 px-2 text-center font-bold text-xs text-blue-600">
                        {totalEnteredOverdueAbonos > 0 ? formatCurrency(totalEnteredOverdueAbonos) : '—'}
                      </TableCell>
                      <TableCell colSpan={2} className="py-1 px-2 text-[11px] text-muted-foreground">
                        {totalEnteredOverdueAbonos > 0 ? (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            Listo para acumular en cualquier semana o aplicar individualmente
                          </span>
                        ) : (
                          "Ingresa los abonos de los clientes que pagaron"
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
        )}
        </div>
      </div>
    </div>
    {selectedLoanForPayment && paymentDialogData &&
        <RegisterPaymentDialog 
            isOpen={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            loan={selectedLoanForPayment}
            clients={clients}
            loanPlans={loanPlans}
            weekNumber={paymentDialogData.weekNumber}
            weekDate={paymentDialogData.weekDate}
            initialAmount={paymentDialogData.initialAmount}
            onPaymentRegistered={() => {
            }}
        />
    }

    <Dialog open={changeDateDialogOpen} onOpenChange={setChangeDateDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Cambiar Fecha del Grupo de Préstamos</DialogTitle>
                <DialogDescription>
                    Selecciona una nueva semana de inicio para los {selectedLoanIds.size} préstamos seleccionados. Esta acción es irreversible.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Select onValueChange={setTargetWeek} value={targetWeek}>
                    <SelectTrigger>
                        <SelectValue placeholder="Selecciona la nueva semana de destino" />
                    </SelectTrigger>
                    <SelectContent>
                        {allLoanWeeksInSystem
                            .filter(week => week !== selectedWeek)
                            .map(week => (
                                <SelectItem key={week} value={week}>
                                    {formatDate(week)}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setChangeDateDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleChangeDate} disabled={isChangingDate || !targetWeek}>
                    {isChangingDate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar Cambio de Fecha
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={changePromotoraDialogOpen} onOpenChange={setChangePromotoraDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
                <DialogTitle>Mover Préstamo(s) a Otra Promotora</DialogTitle>
                <DialogDescription>
                    Reubica los {selectedLoanIds.size} préstamo(s) seleccionados en otro grupo o promotora. Cada préstamo se traslada de forma individual y los demás préstamos de los clientes permanecerán en su grupo original.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <div className="p-3 bg-muted/60 rounded-lg text-xs space-y-1">
                    <p className="text-muted-foreground">Promotora actual:</p>
                    <p className="font-semibold text-sm text-foreground">{selectedPromotoraObj?.name || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Plaza de Destino</Label>
                    <Select 
                        value={targetMovePlaza} 
                        onValueChange={(val) => {
                            setTargetMovePlaza(val);
                            setTargetMoveLocalidad('');
                            setTargetMovePromotora('');
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona Plaza" />
                        </SelectTrigger>
                        <SelectContent>
                            {plazas.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Localidad de Destino</Label>
                    <Select 
                        value={targetMoveLocalidad} 
                        onValueChange={(val) => {
                            setTargetMoveLocalidad(val);
                            setTargetMovePromotora('');
                        }}
                        disabled={!targetMovePlaza}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona Localidad" />
                        </SelectTrigger>
                        <SelectContent>
                            {moveFilteredLocalidades.map(l => (
                                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Promotora de Destino</Label>
                    <Select 
                        value={targetMovePromotora} 
                        onValueChange={setTargetMovePromotora}
                        disabled={!targetMoveLocalidad}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona Promotora" />
                        </SelectTrigger>
                        <SelectContent>
                            {moveFilteredPromotoras.map(p => (
                                <SelectItem key={p.id} value={p.id} disabled={p.id === selectedPromotora}>
                                    {p.name} {p.id === selectedPromotora ? '(Actual)' : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setChangePromotoraDialogOpen(false)}>Cancelar</Button>
                <Button 
                    onClick={handleChangePromotora} 
                    disabled={isChangingPromotora || !targetMovePromotora || targetMovePromotora === selectedPromotora}
                    className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                >
                    {isChangingPromotora && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar Mover Promotora
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <AlertDialog open={!!loanToPayOff} onOpenChange={(open) => !open && setLoanToPayOff(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Liquidar préstamo completamente?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción registrará el abono total restante para {loanToPayOff ? getClientName(loanToPayOff.clientId) : ''} y cambiará el estado a **Pagado**. El dinero se sumará al saldo de la cartera.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handlePayOffLoan} disabled={isPayingOff} className="bg-blue-600 hover:bg-blue-700">
                    {isPayingOff ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeDollarSign className="mr-2 h-4 w-4" />}
                    Confirmar Liquidación
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Revertir abonos de la semana?</AlertDialogTitle>
                <AlertDialogDescription>
                    Estás a punto de eliminar todos los pagos registrados para la **Semana {currentGroupWeek}** en este grupo. 
                    <br /><br />
                    El dinero correspondiente se restará automáticamente del saldo de la cartera. Esta acción es para corregir acumulaciones erróneas.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isReverting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRevertPayments} disabled={isReverting} className="bg-orange-600 hover:bg-orange-700">
                    {isReverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                    Confirmar Reversión
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={accumulateAllDialogOpen} onOpenChange={setAccumulateAllDialogOpen}>
        <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
                <AlertDialogTitle className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
                    <Coins className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Acumular Abonos Asumidos
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                    <div className="space-y-4 pt-1 text-left text-sm text-foreground/80">
                        <p>
                            Formalizar abonos para la promotora <strong className="text-foreground font-black">{selectedPromotoraObj?.name || 'seleccionada'}</strong>.
                        </p>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                ¿Hasta qué fecha / semana deseas acumular?
                            </label>
                            <Select value={selectedCutoffWeek} onValueChange={setSelectedCutoffWeek}>
                                <SelectTrigger className="w-full font-bold h-10 border-emerald-300 dark:border-emerald-800">
                                    <SelectValue placeholder="Selecciona una semana..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableCutoffWeeks.map((weekIso, index) => {
                                        const isCurrent = index === 0;
                                        return (
                                            <SelectItem key={weekIso} value={weekIso} className="font-semibold text-xs">
                                                Sábado {formatDate(weekIso)} {isCurrent ? '(Semana en curso)' : ''}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                                Solo se acumularán préstamos y abonos hasta el sábado seleccionado. Las semanas posteriores permanecerán sin cambios.
                            </p>
                        </div>

                        <div className="bg-muted/60 p-3 rounded-xl border space-y-2 text-xs text-muted-foreground">
                            <div className="flex justify-between">
                                <span>Préstamos que aplican (≤ corte):</span>
                                <strong className="text-foreground">{accumulatePreview.totalEligibleLoans}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span>Préstamos con nuevos abonos:</span>
                                <strong className="text-foreground font-bold">{accumulatePreview.loansCount}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span>Total de abonos a formalizar:</span>
                                <strong className="text-foreground font-bold">{accumulatePreview.paymentsCount}</strong>
                            </div>
                            <div className="flex justify-between border-t pt-1.5 text-sm font-black text-emerald-600 dark:text-emerald-400">
                                <span>Monto a ingresar en cartera:</span>
                                <span>{formatCurrency(accumulatePreview.totalAmount)}</span>
                            </div>
                        </div>

                        {accumulatePreview.paymentsCount === 0 && (
                            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                                No hay abonos pendientes para la semana seleccionada ({selectedCutoffWeek ? formatDate(selectedCutoffWeek) : 'N/A'}).
                            </div>
                        )}
                    </div>
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2">
                <AlertDialogCancel disabled={isAccumulatingAll}>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                    onClick={handleAccumulateAllWeeksPayments} 
                    disabled={isAccumulatingAll || accumulatePreview.paymentsCount === 0} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                    {isAccumulatingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    {selectedCutoffWeek ? `Acumular hasta ${formatDate(selectedCutoffWeek)}` : 'Confirmar y Acumular'}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
