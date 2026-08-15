'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Phone, MessageSquare, MapPin, 
    Wallet, FileText, Shield, History as HistoryIcon, 
    X, Home, ListTodo, PencilLine, User, Building, Route, Info, UserCheck,
    Calendar, AlertTriangle
} from 'lucide-react';
import type { OverdueLoanDetails } from '@/app/dashboard/cartera-vencida/page';
import { RegisterPaymentDialog } from './register-payment-dialog';
import type { Client, LoanPlan, AppConfig } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
    DialogDescription,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getSaturdayOfWeek } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter,
} from '@/components/ui/table';
import { ManualPaymentAdjustmentDialog } from './manual-payment-adjustment-dialog';

interface OverdueCardProps {
    details: OverdueLoanDetails;
    allClients: Client[];
    allLoanPlans: LoanPlan[];
    plazaColor: string;
    isOverduePortfolio?: boolean; 
    appConfig?: AppConfig | null;
    viewMode?: 'card' | 'table-row';
}

const cleanPhone = (phone: string) => phone.replace(/\D/g, '');

export function OverdueCard({ 
    details, 
    allClients, 
    allLoanPlans, 
    plazaColor, 
    isOverduePortfolio, 
    appConfig,
    viewMode = 'card'
}: OverdueCardProps) {
    const { client, loan, loanPlan, hierarchy } = details;
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
    
    // State for manual adjustment
    const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
    const [adjustData, setAdjustData] = useState<{ weekNumber: number, amount: number } | null>(null);

    const { appUser } = useAuth();
    const isCristobal = useMemo(() => appUser?.username?.toUpperCase() === 'CRISTOBAL', [appUser]);

    useEffect(() => {
        if (detailModalOpen || historyDialogOpen) {
            window.dispatchEvent(new CustomEvent('hide-mobile-nav'));
        } else {
            window.dispatchEvent(new CustomEvent('show-mobile-nav'));
        }
    }, [detailModalOpen, historyDialogOpen]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };
    
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      const userTimezoneOffset = date.getTimezoneOffset() * 60000;
      const correctedDate = new Date(date.getTime() + userTimezoneOffset);
      return correctedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
    };

    const metrics = useMemo(() => {
        const weeklyPayment = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
        const today = new Date();
        const loanStartDate = new Date(loan.startDate);
        const baseTerm = loanPlan.termInWeeks;
        
        // Normalización UTC
        const startDayUTC = new Date(Date.UTC(loanStartDate.getUTCFullYear(), loanStartDate.getUTCMonth(), loanStartDate.getUTCDate()));
        const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        const daysDiff = Math.round((todayUTC.getTime() - startDayUTC.getTime()) / (1000 * 3600 * 24));
        
        const rawCurrentLoanWeek = Math.max(1, Math.floor((daysDiff - 1) / 7) + 1);
        const isExpired = rawCurrentLoanWeek > baseTerm + 1;

        let missedCount = 0;
        let totalPaidInBaseTerm = 0;
        for (let i = 1; i <= baseTerm; i++) {
            const p = (loan.payments || []).find(pay => pay.weekNumber === i);
            if (p && !p.isReverted) {
                totalPaidInBaseTerm += p.amount;
                if (p.amount < weeklyPayment) missedCount++;
            } else if (i < rawCurrentLoanWeek - 1) {
                missedCount++;
            }
        }

        // REGLA DINÁMICA: Penalización solo si tiene 2+ fallos o venció debiendo del base
        const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
        
        const totalPaid = (loan.payments || []).reduce((acc, p) => acc + p.amount, 0);
        const totalExpected = (baseTerm + (hasPenalty ? 1 : 0)) * weeklyPayment;
        const totalDue = Math.max(0, totalExpected - totalPaid);

        const baseArrears = Math.max(0, (baseTerm * weeklyPayment) - totalPaidInBaseTerm);
        const penaltyArrear = totalDue - baseArrears;

        // Fecha de Vencimiento (Fin del plazo base)
        const maturityDate = new Date(loanStartDate);
        maturityDate.setUTCDate(maturityDate.getUTCDate() + (baseTerm * 7));

        return {
            weeklyPayment,
            termInWeeks: baseTerm + (hasPenalty ? 1 : 0),
            currentProgressWeek: Math.min(rawCurrentLoanWeek, baseTerm + (hasPenalty ? 1 : 0)),
            loanWeekDate: getSaturdayOfWeek(loanStartDate),
            maturityDate,
            hasPenalty,
            baseArrears,
            penaltyArrear,
            totalDue,
            missedCount,
            isExpired
        };
    }, [loan, loanPlan]);

    const { avalName, avalAddress, avalPhone } = useMemo(() => {
        const parts = client.endorsement.split('(');
        const name = parts[0].trim();
        let rawDetails = parts[1]?.replace(')', '').trim() || '';
        
        let phone = '';
        const phoneMatch = rawDetails.match(/Tel:\s*(.*)$/i);
        if (phoneMatch) {
            phone = phoneMatch[1].trim();
            rawDetails = rawDetails.replace(phoneMatch[0], '').trim();
            if (rawDetails.endsWith(',')) {
                rawDetails = rawDetails.slice(0, -1).trim();
            }
        }
        
        return {
            avalName: name || 'SIN NOMBRE',
            avalAddress: rawDetails || 'SIN DIRECCIÓN',
            avalPhone: phone || ''
        };
    }, [client.endorsement]);

    const loanHistoryData = useMemo(() => {
        const weeklyPayment = metrics.weeklyPayment;
        const termInWeeks = metrics.termInWeeks;
        const startDate = new Date(loan.startDate);
        const today = new Date();
        
        const validPayments = (loan.payments || []).filter(p => !p.isReverted && p.amount > 0);
        const maxPaidWeek = validPayments.length > 0
            ? Math.max(...validPayments.map(p => p.weekNumber))
            : 0;
        const maxDisplayWeek = Math.max(termInWeeks, maxPaidWeek);

        const rows = [];
        for(let i = 1; i <= maxDisplayWeek; i++) {
            const payment = (loan.payments || []).find(p => p.weekNumber === i);
            const isRegistered = !!payment && !payment.isReverted;
            
            // Si supera el plazo calculado (termInWeeks) y NO tiene pago registrado con monto > 0, no mostrar
            if (i > termInWeeks && (!isRegistered || payment.amount <= 0)) {
                continue;
            }

            const dueDate = new Date(startDate);
            dueDate.setUTCDate(dueDate.getUTCDate() + (i * 7));
            const isPast = today > dueDate;
            
            let statusType: 'PAID' | 'MISSED' | 'PENDING' = 'PENDING';
            let statusText = '';

            if (isRegistered) {
                if (payment.amount >= weeklyPayment) {
                    statusText = formatDate(payment.date);
                    statusType = 'PAID';
                } else if (payment.amount > 0) {
                    statusText = 'PARCIAL';
                    statusType = 'MISSED';
                } else {
                    statusText = 'FALLO';
                    statusType = 'MISSED';
                }
            } else if (isPast) {
                statusText = 'FALLO';
                statusType = 'MISSED';
            } else {
                statusText = 'PENDIENTE';
                statusType = 'PENDING';
            }
            
            rows.push({
                num: i,
                vencimiento: dueDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                importeAbono: weeklyPayment,
                importeRecibido: isRegistered ? payment.amount : 0,
                statusText: statusText,
                isPenalty: i > loanPlan.termInWeeks,
                status: statusType
            });
        }
        return rows;
    }, [loan, loanPlan, metrics]);

    const handleWhatsApp = (target: 'client' | 'aval', e?: React.MouseEvent) => {
        e?.stopPropagation();
        
        const plazaId = hierarchy.plazaId;
        const plazaTemplates = appConfig?.whatsappTemplates?.[plazaId];
        const defaultTemplates = appConfig?.whatsappTemplates?.default;

        let message = '';
        let targetPhone = '';
        
        if (target === 'client') {
            message = plazaTemplates?.client || defaultTemplates?.client || appConfig?.whatsappTemplate || 'Hola {{nombre_cliente}}, te recordamos tu adeudo de {{saldo_pendiente}} en {{nombre_negocio}}.';
            targetPhone = client.phone;
        } else {
            message = plazaTemplates?.aval || defaultTemplates?.aval || 'Hola {{nombre_aval}}, te contactamos de {{nombre_negocio}} por el atraso de {{nombre_cliente}}.';
            targetPhone = avalPhone;
        }

        if (targetPhone) {
            const replacements: Record<string, string> = {
                '{{nombre_cliente}}': client.name.toUpperCase(),
                '{{domicilio_cliente}}': `${client.street}, ${client.neighborhood}`.toUpperCase(),
                '{{telefono_cliente}}': client.phone,
                '{{nombre_aval}}': avalName.toUpperCase(),
                '{{domicilio_aval}}': avalAddress.toUpperCase(),
                '{{telefono_aval}}': avalPhone,
                '{{monto_prestamo}}': formatCurrency(loan.amount),
                '{{saldo_pendiente}}': formatCurrency(metrics.totalDue),
                '{{fallos_registrados}}': metrics.missedCount.toString(),
                '{{plaza}}': hierarchy.plazaName.toUpperCase(),
                '{{localidad}}': hierarchy.localidadName.toUpperCase(),
                '{{promotora}}': hierarchy.promotoraName.toUpperCase(),
                '{{nombre_negocio}}': appConfig?.appName || 'CREDICONTROL',
            };
            
            Object.keys(replacements).forEach(tag => {
                const regex = new RegExp(tag, 'g');
                message = message.replace(regex, replacements[tag]);
            });
            
            window.open(`https://wa.me/${cleanPhone(targetPhone)}?text=${encodeURIComponent(message)}`, '_blank');
        }
    };

    const handleAdjustClick = (weekNumber: number, currentAmount: number) => {
      if (!isCristobal) return;
      setAdjustData({ weekNumber, amount: currentAmount });
      setIsAdjustDialogOpen(true);
    };

    return (
        <>
            {viewMode === 'table-row' ? (
                <TableRow className="hover:bg-zinc-50 border-zinc-200 text-xs font-bold text-zinc-700">
                    {/* CLIENT & PLAN */}
                    <TableCell className="border-r border-zinc-200 py-2" style={{ borderLeft: `4px solid ${plazaColor}` }}>
                        <div className="flex flex-col gap-0.5">
                            <span 
                                onClick={() => setDetailModalOpen(true)}
                                className="font-black uppercase text-zinc-900 cursor-pointer hover:underline"
                            >
                                {client.name}
                            </span>
                            <div className="flex flex-wrap gap-1 items-center mt-1">
                                <Badge className="text-[7px] font-black uppercase px-1.5 h-3.5 rounded-sm" style={{ backgroundColor: plazaColor }}>
                                    {hierarchy.plazaName}
                                </Badge>
                                <Badge variant="outline" className="text-[7px] font-black text-zinc-500 uppercase border-zinc-300 h-3.5 px-1.5 rounded-sm">
                                    {hierarchy.localidadName}
                                </Badge>
                                <Badge variant="outline" className="text-[7px] font-black text-blue-600 uppercase border-blue-200 h-3.5 px-1.5 bg-blue-50/50 rounded-sm">
                                    {hierarchy.promotoraName}
                                </Badge>
                            </div>
                        </div>
                    </TableCell>

                    {/* CLIENT ADDRESS & CONTACT */}
                    <TableCell className="border-r border-zinc-200 py-2">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-zinc-500 uppercase leading-tight font-medium">
                                {client.street}, {client.neighborhood}
                            </span>
                            <div className="flex gap-1 items-center">
                                <Button asChild variant="outline" className="h-6 px-2 rounded-sm border-blue-100 text-blue-700 hover:bg-blue-50 text-[9px] font-black" size="sm">
                                    <a href={`tel:${cleanPhone(client.phone)}`}>
                                        <Phone className="h-2.5 w-2.5 mr-1" /> {client.phone}
                                    </a>
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleWhatsApp('client')} className="h-6 px-2 border-green-100 text-green-700 hover:bg-green-50 rounded-sm font-black text-[9px]">
                                    <MessageSquare className="h-2.5 w-2.5 mr-1" /> WA
                                </Button>
                            </div>
                        </div>
                    </TableCell>

                    {/* AVAL DETAILS */}
                    <TableCell className="border-r border-zinc-200 py-2">
                        <div className="flex flex-col gap-1">
                            <span className="font-black uppercase text-zinc-800 text-[10px]">{avalName}</span>
                            <span className="text-[9px] text-zinc-500 uppercase leading-tight font-medium line-clamp-1">{avalAddress}</span>
                            {avalPhone && (
                                <div className="flex gap-1 items-center mt-1">
                                    <Button asChild variant="outline" className="h-6 px-2 rounded-sm border-zinc-300 text-zinc-700 hover:bg-white bg-white text-[9px] font-black" size="sm">
                                        <a href={`tel:${cleanPhone(avalPhone)}`}>
                                            <Phone className="h-2.5 w-2.5 mr-1" /> {avalPhone}
                                        </a>
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleWhatsApp('aval')} className="h-6 px-2 rounded-sm border-green-100 text-green-600 hover:bg-green-50 bg-white text-[9px] font-black">
                                        <MessageSquare className="h-2.5 w-2.5 mr-1" /> WA
                                    </Button>
                                </div>
                            )}
                        </div>
                    </TableCell>

                    {/* DATES */}
                    <TableCell className="border-r border-zinc-200 py-2 text-center text-[10px]">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-zinc-500 font-bold uppercase text-[7px] leading-none">Inicio</span>
                            <span className="text-zinc-700 font-black">{formatDate(loan.startDate)}</span>
                            <span className="text-zinc-500 font-bold uppercase text-[7px] leading-none mt-1">Vence</span>
                            <span className="text-red-600 font-black">{formatDate(metrics.maturityDate.toISOString())}</span>
                        </div>
                    </TableCell>

                    {/* FINANCIAL STATUS */}
                    <TableCell className="border-r border-zinc-200 py-2">
                        <div className="flex flex-col gap-1">
                            <div className="flex gap-1 items-center">
                                <Badge variant="destructive" className="h-4 px-1.5 text-[8px] font-black uppercase rounded-sm shrink-0">
                                    {metrics.missedCount} Fallos
                                </Badge>
                                {metrics.hasPenalty && (
                                    <Badge className="h-4 px-1.5 text-[8px] font-black bg-orange-50 border border-orange-200 text-orange-700 uppercase rounded-sm shrink-0">
                                        S. Extra
                                    </Badge>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
                                <span className="text-zinc-400 font-bold uppercase text-[8px]">Cuota:</span>
                                <span className="text-zinc-700 font-black text-right">{formatCurrency(metrics.weeklyPayment)}</span>
                                <span className="text-zinc-400 font-bold uppercase text-[8px]">Fallos $:</span>
                                <span className="text-zinc-700 font-black text-right">{formatCurrency(metrics.baseArrears)}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-dashed border-zinc-200 pt-1 text-[10px] font-black">
                                <span className="text-red-600 text-[8px] uppercase">A Deber:</span>
                                <span className="text-red-700 text-xs font-black">{formatCurrency(metrics.totalDue)}</span>
                            </div>
                        </div>
                    </TableCell>

                    {/* ACTIONS */}
                    <TableCell className="py-2 text-center">
                        <div className="flex flex-col gap-1 justify-center max-w-[120px] mx-auto">
                            <Button 
                                size="sm" 
                                onClick={() => setDetailModalOpen(true)} 
                                className="h-7 bg-zinc-900 text-white font-black text-[9px] uppercase rounded-sm hover:bg-zinc-800 shadow-sm"
                            >
                                <Wallet className="mr-1 h-3 w-3" /> Detalle
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setHistoryDialogOpen(true)} 
                                className="h-7 font-black uppercase text-[9px] rounded-sm border-zinc-300 bg-white hover:bg-zinc-50 shadow-sm"
                            >
                                <ListTodo className="mr-1 h-3 w-3 text-blue-600" /> Ver Abonos
                            </Button>
                            <Button 
                                size="sm" 
                                onClick={() => setPaymentDialogOpen(true)} 
                                className="h-7 font-black uppercase text-[9px] rounded-sm bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                            >
                                <Wallet className="mr-1 h-3 w-3" /> Abonar
                            </Button>
                        </div>
                    </TableCell>
                </TableRow>
            ) : (
                <Card className="overflow-hidden border-l-[6px] transition-all hover:shadow-lg bg-white mb-4 rounded-md" style={{ borderLeftColor: plazaColor }}>
                    <CardContent className="p-3.5 space-y-3.5">
                        {/* HIERARCHY */}
                        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 pb-2">
                            <Badge className="text-[8px] font-black uppercase px-2 h-4 shrink-0 shadow-sm rounded-sm" style={{ backgroundColor: plazaColor }}>
                                PLAZA: {hierarchy.plazaName}
                            </Badge>
                            <Badge variant="outline" className="text-[8px] font-black text-zinc-600 uppercase border-zinc-300 h-4 px-2 rounded-sm">
                                LOCALIDAD: {hierarchy.localidadName}
                            </Badge>
                            <Badge variant="outline" className="text-[8px] font-black text-blue-600 uppercase border-blue-200 h-4 px-2 bg-blue-50/50 rounded-sm">
                                PROMOTORA: {hierarchy.promotoraName}
                            </Badge>
                        </div>

                        {/* CLIENT INFO */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 cursor-pointer" onClick={() => setDetailModalOpen(true)}>
                                    <h3 className="font-black text-sm uppercase leading-tight text-foreground tracking-tight">{client.name}</h3>
                                    <div className="flex items-center gap-1.5 text-zinc-500 mt-1">
                                        <Home className="h-3 w-3 shrink-0 text-blue-500" />
                                        <span className="text-[10px] font-bold uppercase leading-tight">
                                            {client.street}, {client.neighborhood}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <Button asChild variant="outline" className="h-10 px-4 rounded-md border-blue-200 text-blue-700 hover:bg-blue-50 shadow-md font-black text-xs" size="sm">
                                        <a href={`tel:${cleanPhone(client.phone)}`} title="Llamar Cliente">
                                            <Phone className="h-4 w-4 mr-2" />
                                            {client.phone}
                                        </a>
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleWhatsApp('client')} className="h-9 w-full border-green-200 text-green-700 hover:bg-green-50 shadow-sm rounded-md font-black text-[10px]">
                                        <MessageSquare className="h-4 w-4 mr-2" />
                                        WHATSAPP
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* AVAL INFO */}
                        <div className="p-3 rounded-md bg-zinc-50 border border-zinc-200 space-y-2 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-zinc-300" />
                            <div className="flex justify-between items-start gap-2 pl-1">
                                <div className="flex-1">
                                    <p className="text-[7px] font-black uppercase text-muted-foreground tracking-widest mb-0.5">Responsable Solidario (Aval)</p>
                                    <p className="text-[11px] font-black uppercase leading-tight text-zinc-800">{avalName}</p>
                                    <div className="flex items-start gap-1.5 text-zinc-500 mt-1">
                                        <MapPin className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                                        <span className="text-[9px] font-bold uppercase leading-tight">{avalAddress}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    {avalPhone && (
                                        <Button asChild variant="outline" className="h-9 px-3 rounded-md border-zinc-300 text-zinc-700 hover:bg-white bg-white shadow-md font-black text-[10px]" size="sm">
                                            <a href={`tel:${cleanPhone(avalPhone)}`} title="Llamar Aval">
                                                <Phone className="h-3.5 w-3.5 mr-1" />
                                                {avalPhone}
                                            </a>
                                        </Button>
                                    )}
                                    {avalPhone && (
                                        <Button variant="outline" size="sm" onClick={() => handleWhatsApp('aval')} className="h-9 px-3 rounded-md border-green-100 text-green-600 hover:bg-green-50 bg-white shadow-sm font-black text-[10px]">
                                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                                            WA AVAL
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* FINANCIAL SUMMARY */}
                        <div className="flex items-end justify-between gap-4 pt-1">
                            <div className="flex flex-wrap gap-1.5">
                                <Badge variant="destructive" className="h-5 px-2 text-[9px] font-black uppercase shadow-sm rounded-sm">
                                    {metrics.missedCount} FALLOS
                                </Badge>
                                {metrics.hasPenalty && (
                                    <Badge className="h-5 px-2 text-[9px] font-black bg-orange-50/50 border border-orange-200 text-orange-700 uppercase shadow-sm rounded-sm">
                                        S. EXTRA
                                    </Badge>
                                )}
                            </div>

                            <div className="text-right bg-red-50 px-3 py-2 rounded-md border border-red-100 min-w-[140px] shadow-inner">
                                <div className="flex flex-col">
                                    <div className="flex justify-between items-center gap-4 text-[9px] font-bold text-zinc-500 uppercase">
                                        <span>Saldo Fallos:</span>
                                        <span>{formatCurrency(metrics.baseArrears)}</span>
                                    </div>
                                    {metrics.hasPenalty && (
                                        <div className="flex justify-between items-center gap-4 text-[9px] font-bold text-orange-600 uppercase border-b border-orange-200 pb-1 mb-1">
                                            <span>Semana Extra:</span>
                                            <span>+{formatCurrency(metrics.penaltyArrear)}</span>
                                        </div>
                                    )}
                                    <span className="text-[7px] font-black text-red-600 uppercase leading-none mb-0.5 mt-1">Total a Deber</span>
                                    <span className="text-lg font-black text-red-700 tracking-tighter leading-none">
                                        {formatCurrency(metrics.totalDue)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* FOOTER ACTIONS */}
                        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-dashed border-zinc-200">
                            <div className="flex flex-col gap-0.5">
                                <div className="text-[9px] font-black text-muted-foreground uppercase opacity-80 flex items-center gap-1.5">
                                    <Calendar className="h-3 w-3 text-blue-500" /> INICIO: {formatDate(loan.startDate)}
                                </div>
                                <div className="text-[9px] font-black text-red-600 uppercase opacity-90 flex items-center gap-1.5">
                                    <AlertTriangle className="h-3 w-3" /> VENCE: {formatDate(metrics.maturityDate.toISOString())}
                                </div>
                            </div>
                            <Button size="sm" onClick={() => setDetailModalOpen(true)} className="h-8 bg-zinc-900 text-white font-black text-[10px] uppercase px-6 rounded-md shadow-lg hover:bg-zinc-800 active:scale-95 transition-all">
                                <Wallet className="mr-1.5 h-3.5 w-3.5" /> Detalle
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 shadow-2xl rounded-sm w-full h-auto max-h-[92vh] md:max-h-[85vh] flex flex-col">
                    <DialogHeader className="px-5 py-3 border-b shrink-0 flex flex-row items-center bg-muted/10">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border-2 border-white shadow-lg rounded-md">
                                <AvatarImage src={client.avatarUrl} alt={client.name} />
                                <AvatarFallback className="font-black text-xs bg-blue-100 text-blue-700 rounded-md">{client.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <DialogTitle className="text-base font-black uppercase leading-none tracking-tight">{client.name}</DialogTitle>
                                <div className="flex items-center gap-1.5 mt-1">
                                     <Badge variant="outline" className="text-[8px] font-black border-blue-200 bg-blue-50 text-blue-700 uppercase h-4 px-1.5 rounded-sm">ID: {client.id}</Badge>
                                     <Badge variant="outline" className="text-[8px] font-black border-zinc-200 bg-white text-zinc-600 uppercase h-4 px-1.5 rounded-sm">{loanPlan.name}</Badge>
                                </div>
                            </div>
                        </div>
                    </DialogHeader>

                    <ScrollArea className="flex-1 min-h-0">
                        <div className="p-4 space-y-4">
                            <div className={cn("grid gap-2", metrics.hasPenalty ? "grid-cols-4" : "grid-cols-3")}>
                                <div className="p-2.5 rounded-md bg-zinc-50 border border-zinc-200 text-center shadow-sm">
                                    <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest mb-0.5">Semana</p>
                                    <p className="font-black text-sm">{metrics.currentProgressWeek} / {metrics.termInWeeks}</p>
                                </div>
                                <div className="p-2.5 rounded-md bg-blue-50 border-blue-100 text-center shadow-sm">
                                    <p className="text-[7px] uppercase font-black text-blue-600 tracking-widest mb-0.5">Abono</p>
                                    <p className="font-black text-sm text-blue-700">{formatCurrency(metrics.weeklyPayment)}</p>
                                </div>
                                <div className="p-2.5 rounded-md bg-red-50 border-red-100 text-center shadow-sm">
                                    <p className="text-[7px] uppercase font-black text-red-600 tracking-widest mb-0.5">Fallos</p>
                                    <p className="font-black text-sm text-red-700">{metrics.missedCount}</p>
                                </div>
                                {metrics.hasPenalty && (
                                    <div className="p-2.5 rounded-md bg-orange-50 border-orange-200 text-center flex flex-col justify-center shadow-sm">
                                        <p className="text-[7px] uppercase font-black text-orange-600 tracking-widest">S. Extra</p>
                                        <p className="font-black text-[10px] text-orange-700 leading-none">ACTIVA</p>
                                    </div>
                                )}
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div className="p-4 rounded-md border bg-white space-y-2 shadow-inner">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-muted-foreground uppercase text-[8px]">Suma de Fallos</span>
                                            <span className="font-black text-zinc-800">{formatCurrency(metrics.baseArrears)}</span>
                                        </div>
                                        {metrics.hasPenalty && (
                                            <div className="flex justify-between items-center text-xs border-b border-dashed border-zinc-200 pb-2">
                                                <span className="font-bold text-orange-600 uppercase text-[8px]">Semana Extra</span>
                                                <span className="font-black text-orange-600">+{formatCurrency(metrics.penaltyArrear)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center pt-1">
                                            <span className="font-black text-red-700 uppercase text-[9px]">Total a Liquidar</span>
                                            <span className="text-xl font-black text-red-700 tracking-tighter">
                                                {formatCurrency(metrics.totalDue)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-md border bg-white space-y-3 shadow-sm">
                                        <div className="flex items-start gap-2">
                                            <Home className="h-3.5 w-3.5 text-zinc-400 mt-0.5" />
                                            <div>
                                                <p className="text-[7px] font-black uppercase text-muted-foreground tracking-widest">Domicilio Titular</p>
                                                <p className="text-[10px] font-bold uppercase leading-tight text-zinc-800">
                                                    {client.street}, {client.neighborhood}, {client.city}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button asChild variant="outline" className="h-9 flex-1 rounded-md border-blue-100 text-blue-700 hover:bg-blue-50 font-black text-xs shadow-sm bg-blue-50/20" size="sm">
                                                <a href={`tel:${cleanPhone(client.phone)}`}>
                                                    <Phone className="h-3.5 w-3.5 mr-2" />
                                                    {client.phone}
                                                </a>
                                            </Button>
                                            <Button variant="outline" onClick={() => handleWhatsApp('client')} className="h-9 flex-1 rounded-md border-green-100 text-green-700 hover:bg-green-50 font-black text-[10px] shadow-sm bg-green-50/20" size="sm">
                                                <MessageSquare className="h-3.5 w-3.5 mr-2" />
                                                WA CLIENTE
                                            </Button>
                                        </div>
                                        <div className="p-2 rounded-md bg-zinc-50 border border-zinc-100 flex items-start gap-2">
                                            <Shield className="h-3 w-3 text-zinc-400 mt-0.5" />
                                            <p className="text-[9px] font-bold uppercase text-zinc-600 leading-tight">
                                                {client.guarantee || 'SIN GARANTÍA REGISTRADA'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-3.5 rounded-md border bg-blue-50/20 space-y-2.5 shadow-sm">
                                        <div className="flex justify-between items-center text-[10px] border-b border-blue-100 pb-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <Building className="h-3 w-3 text-blue-400" />
                                                <span className="text-[7px] font-black uppercase text-zinc-500">Plaza</span>
                                            </div>
                                            <span className="font-black uppercase text-blue-900">{hierarchy.plazaName}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] border-b border-blue-100 pb-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <MapPin className="h-3 w-3 text-blue-400" />
                                                <span className="text-[7px] font-black uppercase text-zinc-500">Localidad</span>
                                            </div>
                                            <span className="font-black uppercase text-blue-900">{hierarchy.localidadName}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <div className="flex items-center gap-1.5">
                                                <Route className="h-3 w-3 text-blue-400" />
                                                <span className="text-[7px] font-black uppercase text-zinc-500">Promotora</span>
                                            </div>
                                            <span className="font-black uppercase text-blue-900">{hierarchy.promotoraName}</span>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-md bg-blue-50/40 border border-blue-100 text-zinc-900 space-y-3 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-2 opacity-10">
                                            <Shield className="h-10 w-10 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-[7px] uppercase font-black text-blue-600/70 tracking-widest">Responsable (Aval)</p>
                                            <p className="font-black text-sm uppercase leading-none text-blue-900">{avalName}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            {avalPhone ? (
                                                <Button asChild variant="outline" className="h-9 flex-1 rounded-md border-blue-200 text-blue-700 hover:bg-blue-50 font-black text-[10px] shadow-sm bg-white" size="sm">
                                                    <a href={`tel:${cleanPhone(avalPhone)}`}>
                                                        <Phone className="mr-1.5 h-3.5 w-3.5" /> {avalPhone}
                                                    </a>
                                                </Button>
                                            ) : (
                                                <div className="h-8 flex-1 rounded-md bg-zinc-100 flex items-center justify-center text-[8px] font-black text-zinc-400 uppercase border border-zinc-200">SIN TELÉFONO</div>
                                            )}
                                            {avalPhone && (
                                                <Button variant="outline" onClick={() => handleWhatsApp('aval')} className="h-9 flex-1 rounded-md border-green-200 text-green-700 hover:bg-green-50 font-black text-[10px] shadow-sm bg-white" size="sm">
                                                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> WA AVAL
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex items-start gap-1.5 pt-1 border-t border-blue-100">
                                            <MapPin className="h-3 w-3 text-blue-400 mt-0.5" />
                                            <p className="text-[9px] font-bold uppercase leading-tight text-blue-800 opacity-90">{avalAddress}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    
                    <div className="p-3 bg-muted/20 border-t flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => setHistoryDialogOpen(true)} className="font-black uppercase text-[9px] h-10 flex-1 rounded-md border-zinc-300 bg-white hover:bg-zinc-50 shadow-sm">
                            <ListTodo className="mr-1.5 h-4 w-4 text-blue-600" /> Ver Abonos
                        </Button>
                        <Button size="sm" onClick={() => { setDetailModalOpen(false); setPaymentDialogOpen(true); }} className="font-black uppercase text-[9px] h-10 flex-1 rounded-md bg-blue-600 text-white shadow-md hover:bg-blue-700">
                            <Wallet className="mr-1.5 h-4 w-4" /> Registrar Abono
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
                <DialogContent className="max-w-2xl w-full p-0 overflow-hidden border-0 shadow-2xl rounded-lg h-auto max-h-[85vh] flex flex-col">
                    <DialogHeader className="p-4 pb-2 shrink-0 bg-zinc-50/50 border-b">
                        <DialogTitle className="text-center font-black uppercase text-sm tracking-widest flex items-center justify-center gap-1.5 text-zinc-700">
                            <HistoryIcon className="h-4 w-4 text-blue-600" />
                            Historial de Abonos
                        </DialogTitle>
                        <p className="text-[10px] text-center font-black text-muted-foreground uppercase tracking-widest mt-0.5">{client.name}</p>
                        <DialogDescription className="sr-only">Listado detallado de abonos recibidos y pendientes.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 min-h-0">
                        <ScrollArea className="h-full px-4 md:px-6">
                            <div className="py-3">
                                <Table className="border border-zinc-200">
                                    <TableHeader className="bg-zinc-50 sticky top-0 z-10">
                                        <TableRow className="hover:bg-zinc-50 border-zinc-200">
                                            <TableHead className="text-zinc-700 font-extrabold border-r border-zinc-200 text-center text-[9px] uppercase py-2 tracking-wider">Num</TableHead>
                                            <TableHead className="text-zinc-700 font-extrabold border-r border-zinc-200 text-[9px] uppercase py-2 tracking-wider">Vencimiento</TableHead>
                                            <TableHead className="text-zinc-700 font-extrabold border-r border-zinc-200 text-right text-[9px] uppercase py-2 tracking-wider">Abono</TableHead>
                                            <TableHead className="text-zinc-700 font-extrabold border-r border-zinc-200 text-right text-[9px] uppercase py-2 tracking-wider">Recibido</TableHead>
                                            <TableHead className="text-zinc-700 font-extrabold text-center text-[9px] uppercase py-2 tracking-wider">Estatus / Fecha</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loanHistoryData.map((row) => (
                                            <TableRow key={row.num} className="border-zinc-100 hover:bg-zinc-50/80 transition-colors">
                                                <TableCell className="border-r border-zinc-100 text-center py-1.5 font-bold text-[11px]">{row.num}</TableCell>
                                                <TableCell className="border-r border-zinc-100 py-1.5 text-[11px] font-bold text-zinc-500">{row.vencimiento}</TableCell>
                                                <TableCell className="border-r border-zinc-100 text-right py-1.5 text-[11px] font-black text-zinc-700">{formatCurrency(row.importeAbono)}</TableCell>
                                                <TableCell 
                                                    className={cn(
                                                        "border-r border-zinc-100 text-right py-1.5 font-black text-[11px] relative group", 
                                                        row.importeRecibido > 0 ? (row.importeRecibido >= row.importeAbono ? "bg-green-50/80 text-green-700" : "bg-amber-50/60 text-amber-700") : "bg-rose-50/60 text-rose-700",
                                                        isCristobal && "cursor-pointer hover:bg-green-100 transition-colors"
                                                    )}
                                                    onClick={() => isCristobal && handleAdjustClick(row.num, row.importeRecibido)}
                                                >
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {formatCurrency(row.importeRecibido)}
                                                        {row.isPenalty && (
                                                            <Badge className="bg-amber-600 text-white text-[7px] font-black h-3.5 px-1 uppercase shrink-0">EXTRA</Badge>
                                                        )}
                                                        {isCristobal && (
                                                            <PencilLine className="h-3 w-3 opacity-0 group-hover:opacity-100 text-blue-600 shrink-0 transition-opacity" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-center py-1.5 text-[9px] font-black uppercase",
                                                    row.status === 'MISSED' ? "text-rose-600" : row.status === 'PAID' ? "text-green-700" : "text-zinc-400"
                                                )}>
                                                    {row.statusText}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter className="bg-zinc-50/60 border-t-2 border-zinc-200">
                                        <TableRow className="hover:bg-zinc-50/60">
                                            <TableCell colSpan={3} className="text-right font-black text-zinc-400 text-[9px] uppercase py-2">Suma Total Recuperada</TableCell>
                                            <TableCell className="text-right font-black text-green-700 bg-green-50/60 text-xs py-2 px-3 border-l border-zinc-200">
                                                {formatCurrency(loan.payments.reduce((acc, p) => acc + p.amount, 0))}
                                            </TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="p-3 border-t flex justify-end shrink-0 gap-2 bg-zinc-50/80">
                        <DialogClose asChild>
                            <Button variant="secondary" className="font-black uppercase text-[9px] tracking-widest h-9 px-6 rounded-md border-zinc-300 bg-white shadow-sm">Cerrar Historial</Button>
                        </DialogClose>
                    </div>
                </DialogContent>
            </Dialog>

            <RegisterPaymentDialog
                isOpen={paymentDialogOpen}
                onOpenChange={setPaymentDialogOpen}
                loan={loan}
                clients={allClients}
                loanPlans={allLoanPlans}
                weekNumber={metrics.currentProgressWeek}
                weekDate={metrics.loanWeekDate}
                initialAmount={metrics.totalDue}
                expectedAmount={metrics.totalDue}
                onPaymentRegistered={() => {
                    if (typeof window !== 'undefined') window.location.reload();
                }}
            />

            {adjustData && (
                <ManualPaymentAdjustmentDialog
                    isOpen={isAdjustDialogOpen}
                    onOpenChange={setIsAdjustDialogOpen}
                    loan={loan}
                    weekNumber={adjustData.weekNumber}
                    currentAmount={adjustData.amount}
                    onSuccess={() => {
                        if (typeof window !== 'undefined') window.location.reload();
                    }}
                />
            )}
        </>
    );
}