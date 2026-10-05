'use client';

import { useState, useMemo } from 'react';
import type { Loan, LoanPlan, Client, Plaza, Localidad, Promotora } from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  Banknote, TrendingDown, X, Calculator, Landmark, AlertCircle, 
  LayoutDashboard, Building2, FileBarChart2, TrendingUp, Percent, CheckCircle2,
  Calendar, ShieldAlert, Award
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { ReportsSection } from './reports-section';
import { Separator } from './ui/separator';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { query, where, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Loading from '@/app/dashboard/loading';
import { generateColorPalette, cn, getCurrentLoanWeekNumber } from '@/lib/utils';

interface ControlClientPageProps {
    initialClients: Client[];
    initialLoanPlans: LoanPlan[];
    initialPlazas: Plaza[];
    initialLocalidades: Localidad[];
    initialPromotoras: Promotora[];
}

// Centralized helper to check dynamic penalty
const checkPenalty = (loan: Loan, loanPlan: LoanPlan) => {
    const weeklyPayment = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
    let missedWeeksCount = 0;
    let totalPaidInBaseTerm = 0;
    
    const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));
    const baseTerm = loanPlan.termInWeeks;
    for (let i = 1; i <= baseTerm; i++) {
        const p = loan.payments.find(pay => pay.weekNumber === i);
        if (p) {
            const pAmount = (p.amount === null || p.amount === undefined || isNaN(p.amount)) ? 0 : p.amount;
            totalPaidInBaseTerm += pAmount;
            if (pAmount < weeklyPayment) missedWeeksCount++;
        } else if (i < currentLoanWeek) {
            missedWeeksCount++;
        }
    }
    
    const isExpired = currentLoanWeek > baseTerm;
    return (missedWeeksCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
};

export function ControlClientPage({ initialClients, initialLoanPlans, initialPlazas, initialLocalidades, initialPromotoras }: ControlClientPageProps) {
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<'resumen' | 'plazas' | 'informes'>('resumen');
    const activeLoansQuery = useMemo(() => query(
        collection(db, 'loans'),
        where('status', 'in', ['Active', 'Overdue'])
    ), []);

    const { data, loading: dataLoading } = useRealtimeData({
        clients: initialClients,
        loanPlans: initialLoanPlans,
        plazas: initialPlazas,
        localidades: initialLocalidades,
        promotoras: initialPromotoras,
    }, {
        enabledCollections: ['loans', 'clients', 'loanPlans', 'plazas', 'localidades', 'promotoras'],
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
        promotoras: initialPromotoras,
    };

    const filteredLoans = useMemo(() => {
        if (!dateRange || !dateRange.from) {
            return loans;
        }
        const fromDate = dateRange.from;
        const toDate = dateRange.to ? dateRange.to : fromDate;

        return loans.filter(loan => {
            const loanStartDate = new Date(loan.startDate);
            return loanStartDate >= fromDate && loanStartDate <= toDate;
        });
    }, [loans, dateRange]);

    const stats = useMemo(() => {
        const statsByPlaza: Record<string, { 
            plazaName: string; 
            totalPrestado: number; 
            dineroEnCalle: number; 
            carteraVencida: number; 
            totalColocadoActive: number; 
            color: string; 
        }> = {};
        const colorPalette = generateColorPalette(plazas.length);

        plazas.forEach((plaza, index) => {
            statsByPlaza[plaza.id] = {
                plazaName: plaza.name,
                totalPrestado: 0,
                dineroEnCalle: 0,
                carteraVencida: 0,
                totalColocadoActive: 0,
                color: colorPalette[index],
            };
        });

        let globalTotalPrestado = 0;
        let globalDineroEnCalle = 0;
        let globalCarteraVencida = 0;
        let globalTotalColocadoActive = 0;

        filteredLoans.forEach(loan => {
            if (loan.status === 'Paid Off' || loan.status === 'Pagado desde CV') return;

            const promotora = promotoras.find(p => p.id === loan.promotoraId);
            const localidad = localidades.find(l => l.id === promotora?.localidadId);
            if (!localidad) return;

            const plazaId = localidad.plazaId;
            const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
            if (!loanPlan) return;

            const weeklyPayment = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
            const baseTerm = loanPlan.termInWeeks;

            const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));
            
            const actualTotalPaid = (loan.payments || []).reduce((sum, p) => {
                const pAmount = (p.amount === null || p.amount === undefined || isNaN(p.amount)) ? 0 : p.amount;
                return sum + pAmount;
            }, 0);

            // CARTERA VENCIDA (PRÉSTAMO EXPIRADO CON ADEUDO)
            if (currentLoanWeek > baseTerm) {
                let totalPaidInBase = 0;
                let missedCount = 0;
                for (let i = 1; i <= baseTerm; i++) {
                    const p = loan.payments.find(pay => pay.weekNumber === i);
                    if (p) {
                        const pAmount = (p.amount === null || p.amount === undefined || isNaN(p.amount)) ? 0 : p.amount;
                        totalPaidInBase += pAmount;
                        if (pAmount < weeklyPayment) missedCount++;
                    } else {
                        missedCount++;
                    }
                }
                
                const isExpired = true;
                const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBase < (baseTerm * weeklyPayment));
                
                const totalExpectedWithPenalty = weeklyPayment * (baseTerm + (hasPenalty ? 1 : 0));
                const balanceRemainingAbsolute = Math.max(0, totalExpectedWithPenalty - actualTotalPaid);
                
                if (balanceRemainingAbsolute > 0) {
                    if (statsByPlaza[plazaId]) {
                        statsByPlaza[plazaId].carteraVencida += balanceRemainingAbsolute;
                    }
                    globalCarteraVencida += balanceRemainingAbsolute;
                }
                return; 
            }

            // CAPITAL PENDIENTE (VIGENTE)
            const hasPenalty = checkPenalty(loan, loanPlan);
            const termInWeeks = baseTerm + (hasPenalty ? 1 : 0);
            const totalExpected = weeklyPayment * termInWeeks;

            let effectivePaidForStats = 0;
            for (let i = 1; i <= termInWeeks; i++) {
                const p = loan.payments.find(pay => pay.weekNumber === i);
                if (p) {
                    const pAmount = (p.amount === null || p.amount === undefined || isNaN(p.amount)) ? 0 : p.amount;
                    effectivePaidForStats += pAmount;
                } else if (i === currentLoanWeek) {
                    effectivePaidForStats += weeklyPayment;
                }
            }

            const principalRatio = totalExpected > 0 ? (loan.amount / totalExpected) : 0;
            const capitalRecuperado = effectivePaidForStats * principalRatio;
            const capitalPendiente = Math.max(0, loan.amount - capitalRecuperado);
            const balanceRemainingVigente = Math.max(0, totalExpected - effectivePaidForStats);

            if (statsByPlaza[plazaId]) {
                statsByPlaza[plazaId].totalPrestado += capitalPendiente;
                statsByPlaza[plazaId].dineroEnCalle += balanceRemainingVigente;
                statsByPlaza[plazaId].totalColocadoActive += loan.amount;
            }

            globalTotalPrestado += capitalPendiente;
            globalDineroEnCalle += balanceRemainingVigente;
            globalTotalColocadoActive += loan.amount;
        });

        return {
            byPlaza: Object.values(statsByPlaza),
            global: {
                totalPrestado: globalTotalPrestado,
                dineroEnCalle: globalDineroEnCalle,
                carteraVencida: globalCarteraVencida,
                totalColocadoActive: globalTotalColocadoActive
            }
        };

    }, [filteredLoans, loanPlans, plazas, localidades, promotoras]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
        }).format(amount);
    };

    const clearFilters = () => {
        setDateRange(undefined);
    };

    // Calculate recoveries
    const globalCapitalRecuperado = Math.max(0, stats.global.totalColocadoActive - stats.global.totalPrestado);
    const globalRecuperadoPercent = stats.global.totalColocadoActive > 0 
        ? Math.round((globalCapitalRecuperado / stats.global.totalColocadoActive) * 100) 
        : 0;
    const globalPendientePercent = stats.global.totalColocadoActive > 0 
        ? Math.round((stats.global.totalPrestado / stats.global.totalColocadoActive) * 100) 
        : 0;

    if (dataLoading) {
        return <Loading />;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Nav Tabs & Date Picker Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-zinc-950 p-2.5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm">
                <div className="relative flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-full border shadow-inner w-full sm:max-w-md justify-between items-center h-9">
                    <div 
                        className="absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-in-out shadow-sm"
                        style={{
                            left: activeTab === 'resumen' ? '4px' : activeTab === 'plazas' ? 'calc(33.3% + 2px)' : 'calc(66.6% - 2px)',
                            width: 'calc(33.3% - 4px)',
                            backgroundColor: '#3b82f6',
                        }}
                    />
                    <button
                        onClick={() => setActiveTab('resumen')}
                        className={cn(
                            "flex-1 py-1 text-[10px] font-black uppercase text-center transition-all relative z-10",
                            activeTab === 'resumen' ? "text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                        )}
                    >
                        <span className="flex items-center justify-center gap-1">
                            <LayoutDashboard className="h-3 w-3" />
                            Resumen
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('plazas')}
                        className={cn(
                            "flex-1 py-1 text-[10px] font-black uppercase text-center transition-all relative z-10",
                            activeTab === 'plazas' ? "text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                        )}
                    >
                        <span className="flex items-center justify-center gap-1">
                            <Building2 className="h-3 w-3" />
                            Plazas
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('informes')}
                        className={cn(
                            "flex-1 py-1 text-[10px] font-black uppercase text-center transition-all relative z-10",
                            activeTab === 'informes' ? "text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                        )}
                    >
                        <span className="flex items-center justify-center gap-1">
                            <FileBarChart2 className="h-3 w-3" />
                            Informes
                        </span>
                    </button>
                </div>

                <div className="flex items-center bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800 h-9 w-full sm:w-auto overflow-hidden">
                    <DatePicker date={dateRange} onDateChange={setDateRange} variant="ghost" className="w-full sm:w-[260px]" />
                    {dateRange && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={clearFilters}
                            className="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-none border-l border-zinc-200/60 dark:border-zinc-800 shrink-0"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Quitar filtros</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* TAB CONTENT: RESUMEN */}
            {activeTab === 'resumen' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
                    {/* Metrics Grid */}
                    <div className="grid gap-3 md:grid-cols-3">
                        {/* Capital Pendiente Card */}
                        <Card className="relative overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/50 p-3.5 rounded-xl shadow-xs transition-all hover:shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Capital Pendiente</span>
                                <div className="p-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md shrink-0">
                                    <Landmark className="h-3.5 w-3.5" />
                                </div>
                            </div>
                            <div className="mt-1.5 space-y-0.5">
                                <div className="text-lg font-black tracking-tight text-blue-600 dark:text-blue-400">
                                    {formatCurrency(stats.global.totalPrestado)}
                                </div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
                                    Capital activo por recuperar de préstamos vigentes.
                                </p>
                            </div>
                        </Card>

                        {/* Dinero en Calle Card */}
                        <Card className="relative overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/50 p-3.5 rounded-xl shadow-xs transition-all hover:shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Dinero en Calle</span>
                                <div className="p-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md shrink-0">
                                    <Calculator className="h-3.5 w-3.5" />
                                </div>
                            </div>
                            <div className="mt-1.5 space-y-0.5">
                                <div className="text-lg font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(stats.global.dineroEnCalle)}
                                </div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
                                    Saldo total pendiente de cobro en préstamos activos.
                                </p>
                            </div>
                        </Card>

                        {/* Cartera Vencida Card */}
                        <Card className="relative overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/50 p-3.5 rounded-xl shadow-xs transition-all hover:shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Cartera Vencida</span>
                                <div className="p-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-md shrink-0">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                </div>
                            </div>
                            <div className="mt-1.5 space-y-0.5">
                                <div className="text-lg font-black tracking-tight text-rose-600 dark:text-rose-400">
                                    {formatCurrency(stats.global.carteraVencida)}
                                </div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
                                    Adeudo acumulado de préstamos expirados con retrasos.
                                </p>
                            </div>
                        </Card>
                    </div>

                    {/* Visual Health Indicator / Progress Bar */}
                    <Card className="bg-white dark:bg-zinc-950/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-3.5 shadow-xs">
                        <div className="flex items-center justify-between gap-4 pb-2 border-b border-zinc-100 dark:border-zinc-900">
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Rendimiento de Colocación</span>
                            <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">
                                Colocado Activo: <span className="font-black text-zinc-900 dark:text-zinc-100">{formatCurrency(stats.global.totalColocadoActive)}</span>
                            </div>
                        </div>
                        
                        <div className="mt-3 space-y-2.5">
                            {/* Segmented Progress Bar */}
                            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex shadow-inner">
                                <div 
                                    className="bg-gradient-to-r from-emerald-500 to-green-400 h-full transition-all duration-500" 
                                    style={{ width: `${globalRecuperadoPercent}%` }}
                                    title={`Recuperado: ${globalRecuperadoPercent}%`}
                                />
                                <div 
                                    className="bg-gradient-to-r from-blue-500 to-indigo-400 h-full transition-all duration-500" 
                                    style={{ width: `${globalPendientePercent}%` }}
                                    title={`Pendiente: ${globalPendientePercent}%`}
                                />
                            </div>

                            {/* Legend Bar */}
                            <div className="flex flex-col sm:flex-row gap-3 justify-between text-[9px] font-bold">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    <span className="text-zinc-400 dark:text-zinc-500 uppercase">Recuperado:</span>
                                    <span className="text-zinc-800 dark:text-zinc-200">{formatCurrency(globalCapitalRecuperado)}</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-black">({globalRecuperadoPercent}%)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                    <span className="text-zinc-400 dark:text-zinc-500 uppercase">Pendiente:</span>
                                    <span className="text-zinc-800 dark:text-zinc-200">{formatCurrency(stats.global.totalPrestado)}</span>
                                    <span className="text-blue-600 dark:text-blue-400 font-black">({globalPendientePercent}%)</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB CONTENT: PLAZAS */}
            {activeTab === 'plazas' && (
                <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
                    <div className="grid gap-3 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {stats.byPlaza.map(stat => {
                            const plazaCapitalRecuperado = Math.max(0, stat.totalColocadoActive - stat.totalPrestado);
                            const recPercent = stat.totalColocadoActive > 0 
                                ? Math.round((plazaCapitalRecuperado / stat.totalColocadoActive) * 100) 
                                : 0;
                            const totalPlazaPortfolio = stat.totalPrestado + stat.carteraVencida;
                            const cvRatio = totalPlazaPortfolio > 0
                                ? Math.round((stat.carteraVencida / totalPlazaPortfolio) * 100)
                                : 0;

                            return (
                                <Card 
                                    key={stat.plazaName} 
                                    className="relative overflow-hidden rounded-xl md:rounded-3xl border-2 hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-none transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
                                    style={{ borderColor: `${stat.color}30` }}
                                    id={`plaza-card-${(stat.plazaName || '').toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-5">
                                        <Building2 className="h-16 w-16 md:h-24 md:w-24" style={{ color: stat.color }} />
                                    </div>
                                    
                                    <div>
                                        <div className="p-3.5 md:p-5 border-b flex items-center justify-between" style={{ backgroundColor: `${stat.color}06` }}>
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 md:h-2.5 md:w-2.5 rounded-full animate-pulse" style={{ backgroundColor: stat.color }} />
                                                <CardTitle className="text-xs md:text-sm font-black uppercase tracking-wider" style={{ color: stat.color }}>
                                                    {stat.plazaName}
                                                </CardTitle>
                                            </div>
                                            <span className="text-[9px] font-black uppercase px-2 py-0.5 md:py-1 rounded-full border" style={{ color: stat.color, borderColor: `${stat.color}40`, backgroundColor: `${stat.color}10` }}>
                                                Activos
                                            </span>
                                        </div>
                                        
                                        <div className="p-3.5 md:p-5 space-y-3 md:space-y-4">
                                            {/* Metrics list */}
                                            <div className="space-y-2 md:space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase">Cap. Pendiente:</span>
                                                    <span className="text-xs md:text-sm font-extrabold text-zinc-800 dark:text-zinc-100">{formatCurrency(stat.totalPrestado)}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase">En Calle Vigente:</span>
                                                    <span className="text-xs md:text-sm font-extrabold text-zinc-800 dark:text-zinc-100">{formatCurrency(stat.dineroEnCalle)}</span>
                                                </div>
                                                <div className="flex justify-between items-center pt-1.5 md:pt-2 border-t border-dashed">
                                                    <span className="text-[9px] md:text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase">Cartera Vencida:</span>
                                                    <span className="text-xs md:text-sm font-black text-rose-600 dark:text-rose-400">{formatCurrency(stat.carteraVencida)}</span>
                                                </div>
                                            </div>

                                            {/* Micro Progress bars */}
                                            <div className="space-y-2 pt-2 border-t md:border-none">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[8px] md:text-[9px] font-bold text-muted-foreground uppercase">
                                                        <span>Recuperación de Capital</span>
                                                        <span className="font-extrabold" style={{ color: stat.color }}>{recPercent}%</span>
                                                    </div>
                                                    <div className="h-1 md:h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${recPercent}%`, backgroundColor: stat.color }} />
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[8px] md:text-[9px] font-bold text-muted-foreground uppercase">
                                                        <span>Tasa de Morosidad</span>
                                                        <span className="font-extrabold text-rose-600">{cvRatio}%</span>
                                                    </div>
                                                    <div className="h-1 md:h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${cvRatio}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-3 md:p-4 bg-zinc-50 dark:bg-zinc-900 border-t flex justify-between items-center text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase">
                                        <span>Colocación Activa:</span>
                                        <span className="font-extrabold text-zinc-700 dark:text-zinc-300">{formatCurrency(stat.totalColocadoActive)}</span>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                    {stats.byPlaza.length === 0 && (
                        <Card className="rounded-xl md:rounded-3xl border border-dashed p-12 text-center text-muted-foreground bg-zinc-50/50">
                            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                            <p className="font-medium">No hay plazas definidas o no hay datos de préstamos activos.</p>
                        </Card>
                    )}
                </div>
            )}

            {/* TAB CONTENT: INFORMES */}
            {activeTab === 'informes' && (
                <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                    <ReportsSection 
                        loans={loans} 
                        clients={clients} 
                        loanPlans={loanPlans} 
                        plazas={plazas} 
                        localidades={localidades} 
                        promotoras={promotoras} 
                    />
                </div>
            )}
        </div>
    );
}