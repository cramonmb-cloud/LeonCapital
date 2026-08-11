'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Client, Loan, LoanPlan, Plaza, Localidad, Promotora } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search, Wallet, Calendar, Shield, Phone, Home, X, CircleDollarSign, Building, MapPin, List, ChevronRight, UserCheck, Smartphone, Info, Route, ArrowRight, AlertTriangle, User, Monitor, Filter, ListTodo, History, PencilLine } from 'lucide-react';
import { Separator } from './ui/separator';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { ManualPaymentAdjustmentDialog } from '@/components/manual-payment-adjustment-dialog';

interface ConsultarClientePageProps {
  clients: Client[];
  loans: Loan[];
  loanPlans: LoanPlan[];
  plazas: Plaza[];
  localidades: Localidad[];
  promotoras: Promotora[];
}

export function ConsultarClientePage({ clients: allClients, loans: allLoans, loanPlans, plazas: allPlazas, localidades: allLocalidades, promotoras: allPromotoras }: ConsultarClientePageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // State for manual adjustment
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [adjustData, setAdjustData] = useState<{ weekNumber: number, amount: number } | null>(null);

  // Filtros
  const [filterPlaza, setFilterPlaza] = useState('all');
  const [filterLocalidad, setFilterLocalidad] = useState('all');
  const [filterPromotora, setFilterPromotora] = useState('all');
  const [filterWeek, setFilterWeek] = useState('all');

  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin' || appUser?.username?.toUpperCase() === 'CRISTOBAL';
  const isCristobal = appUser?.username?.toUpperCase() === 'CRISTOBAL';

  const formatCurrency = (amount: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const correctedDate = new Date(date.getTime() + userTimezoneOffset);
    return correctedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Ocultar barra de navegación móvil cuando el modal está abierto
  useEffect(() => {
    if (isModalOpen || isHistoryOpen) {
      window.dispatchEvent(new CustomEvent('hide-mobile-nav'));
    } else {
      window.dispatchEvent(new CustomEvent('show-mobile-nav'));
    }
  }, [isModalOpen, isHistoryOpen]);

  // Lógica de restricción de datos por usuario
  const allowedPlazas = useMemo(() => {
    if (isAdmin) return allPlazas;
    const assignedIds = appUser?.assignedPlazaIds || [];
    return allPlazas.filter(p => assignedIds.includes(p.id));
  }, [allPlazas, isAdmin, appUser]);

  const allowedLocalidades = useMemo(() => {
    if (isAdmin) return allLocalidades;
    const assignedIds = appUser?.assignedLocalidadIds || [];
    return allLocalidades.filter(l => assignedIds.includes(l.id));
  }, [allLocalidades, isAdmin, appUser]);

  // Solo consideramos préstamos activos o vencidos para la consulta
  const loans = useMemo(() => {
    const activeLoans = allLoans.filter(l => l.status === 'Active' || l.status === 'Overdue');
    
    if (isAdmin) return activeLoans;
    
    const allowedLocIds = allowedLocalidades.map(l => l.id);
    const allowedPromotoras = allPromotoras.filter(p => allowedLocIds.includes(p.localidadId));
    const allowedPromotoraIds = allowedPromotoras.map(p => p.id);
    return activeLoans.filter(l => l.promotoraId && allowedPromotoraIds.includes(l.promotoraId));
  }, [allLoans, allPromotoras, allowedLocalidades, isAdmin]);

  const clients = useMemo(() => {
    if (isAdmin) return allClients;
    
    // Clientes que tienen préstamos activos en las zonas permitidas
    const clientIdsInActiveLoans = new Set(loans.map(l => l.clientId));
    return allClients.filter(c => clientIdsInActiveLoans.has(c.id));
  }, [allClients, loans, isAdmin]);

  // Opciones de filtros
  const plazaOptions = useMemo(() => [...allowedPlazas].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')), [allowedPlazas]);
  const localidadOptions = useMemo(() => {
      let result = allowedLocalidades;
      if (filterPlaza !== 'all') result = result.filter(l => l.plazaId === filterPlaza);
      return [...result].sort((a,b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [allowedLocalidades, filterPlaza]);
  
  const promotoraOptions = useMemo(() => {
      let result = allPromotoras;
      if (filterLocalidad !== 'all') {
          result = result.filter(p => p.localidadId === filterLocalidad);
      } else if (filterPlaza !== 'all') {
          const locIdsInPlaza = allLocalidades.filter(l => l.plazaId === filterPlaza).map(l => l.id);
          result = result.filter(p => locIdsInPlaza.includes(p.localidadId));
      }
      if (!isAdmin) {
          const allowedLocIds = allowedLocalidades.map(l => l.id);
          result = result.filter(p => allowedLocIds.includes(p.localidadId));
      }
      return [...result].sort((a,b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [allPromotoras, allLocalidades, filterLocalidad, filterPlaza, allowedLocalidades, isAdmin]);

  const weekOptions = useMemo(() => {
    // Solo semanas de préstamos activos
    const activeWeeks = Array.from(new Set(loans
        .map(l => {
            const d = new Date(l.startDate);
            return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
        })
    )).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());
    return activeWeeks;
  }, [loans]);

  // Pre-mapear préstamos con sus clientes y jerarquías correspondientes en un bucle simple
  const mappedLoans = useMemo(() => {
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const promotorasMap = new Map(allPromotoras.map(p => [p.id, p]));
    const localidadesMap = new Map(allLocalidades.map(l => [l.id, l]));

    return loans.map(loan => {
      const client = clientMap.get(loan.clientId);
      const promotora = loan.promotoraId ? promotorasMap.get(loan.promotoraId) : undefined;
      const localidad = promotora?.localidadId ? localidadesMap.get(promotora.localidadId) : undefined;
      return {
        loan,
        client,
        promotoraId: loan.promotoraId,
        localidadId: promotora?.localidadId,
        plazaId: localidad?.plazaId,
      };
    }).filter((item): item is { loan: Loan; client: Client; promotoraId: string | undefined; localidadId: string | undefined; plazaId: string | undefined } => item.client !== undefined);
  }, [loans, clients, allPromotoras, allLocalidades]);

  // Listado filtrado
  const canShowList = searchTerm.trim().length > 0 || (filterPlaza !== 'all' && filterLocalidad !== 'all');

  const filteredList = useMemo(() => {
    if (!canShowList) return [];

    let result = mappedLoans;

    // Apply Search
    if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        result = result.filter(item => 
            (item.client.name || '').toLowerCase().includes(searchLower)
        );
    }

    // Apply Filters
    if (filterPlaza !== 'all') {
        result = result.filter(item => item.plazaId === filterPlaza);
    }
    if (filterLocalidad !== 'all') {
        result = result.filter(item => item.localidadId === filterLocalidad);
    }
    if (filterPromotora !== 'all') {
        result = result.filter(item => item.promotoraId === filterPromotora);
    }
    if (filterWeek !== 'all') {
        result = result.filter(item => {
            const d = new Date(item.loan.startDate);
            return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString() === filterWeek;
        });
    }

    return result;
  }, [mappedLoans, searchTerm, filterPlaza, filterLocalidad, filterPromotora, filterWeek, canShowList]);

  const activeLoanDetails = useMemo(() => {
    if (!selectedClient) return null;

    const activeLoan = allLoans.find(
      loan => loan.clientId === selectedClient.id && (loan.status === 'Active' || loan.status === 'Overdue')
    );

    if (!activeLoan) return null;

    const loanPlan = loanPlans.find(p => p.id === activeLoan.loanPlanId);
    if (!loanPlan) return null;

    const weeklyPayment = (activeLoan.amount / 1000) * loanPlan.weeklyPaymentRate;
    
    const now = new Date();
    const loanStartDate = new Date(activeLoan.startDate);
    const startDayUTC = new Date(Date.UTC(loanStartDate.getUTCFullYear(), loanStartDate.getUTCMonth(), loanStartDate.getUTCDate()));
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysDiff = Math.round((todayUTC.getTime() - startDayUTC.getTime()) / (1000 * 3600 * 24));
    const currentWeekSafe = Math.max(1, Math.floor((daysDiff - 1) / 7) + 1);
    
    const baseTerm = loanPlan.termInWeeks;
    const isExpired = currentWeekSafe > baseTerm + 1;

    let missedCount = 0;
    let totalPaidInBaseTerm = 0;
    let baseArrears = 0;
    
    for (let i = 1; i <= baseTerm; i++) {
        const p = (activeLoan.payments || []).find(pay => pay.weekNumber === i);
        if (p && !p.isReverted) {
            totalPaidInBaseTerm += p.amount;
            if (p.amount < weeklyPayment) {
                missedCount++;
                baseArrears += (weeklyPayment - p.amount);
            }
        } else if (i < currentWeekSafe - 1) {
            missedCount++;
            baseArrears += weeklyPayment;
        }
    }

    // REGLA DINÁMICA: Penalización solo si tiene 2+ fallos o venció debiendo del base
    const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
    const totalTerm = baseTerm + (hasPenalty ? 1 : 0);

    const actualTotalPaid = (activeLoan.payments || []).reduce((acc, p) => acc + p.amount, 0);
    
    // El saldo a liquidar incluye la penalización si corresponde
    const totalExpected = totalTerm * weeklyPayment;
    const totalBalanceDue = Math.max(0, totalExpected - actualTotalPaid);

    const currentLoanWeekDisplay = Math.min(currentWeekSafe, totalTerm);
    const promotora = allPromotoras.find(p => p.id === activeLoan.promotoraId);
    const localidad = allLocalidades.find(l => l.id === promotora?.localidadId);
    const plaza = allPlazas.find(p => p.id === localidad?.plazaId);

    return {
      loan: activeLoan,
      loanPlan,
      weeklyPayment,
      currentLoanWeek: currentLoanWeekDisplay,
      termInWeeks: totalTerm,
      baseArrears,
      totalBalance: totalBalanceDue,
      missedWeeks: missedCount,
      hasPenalty,
      isExpired,
      plazaName: plaza?.name || 'N/A',
      localidadName: localidad?.name || 'N/A',
      promotoraName: promotora?.name || 'N/A',
      loanStartDate: activeLoan.startDate,
    };
  }, [selectedClient, allLoans, loanPlans, allPlazas, allLocalidades, allPromotoras]);

  const loanHistoryData = useMemo(() => {
    if (!activeLoanDetails) return [];
    
    const { loan, loanPlan, weeklyPayment, termInWeeks, currentLoanWeek } = activeLoanDetails;
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

        const isRecovered = payment?.isRecovered || false;

        if (isRegistered) {
            if (payment.amount >= weeklyPayment) {
                statusText = isRecovered ? 'RECUPERADO' : formatDate(payment.date);
                statusType = 'PAID';
            } else if (payment.amount > 0) {
                statusText = isRecovered ? 'RECUPERADO PARCIAL' : 'PARCIAL';
                statusType = 'MISSED';
            } else {
                statusText = 'FALLO';
                statusType = 'MISSED';
            }
        } else if (isPast || i < currentLoanWeek - 1) {
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
            status: statusType,
            isRecovered: isRecovered
        });
    }
    return rows;
  }, [activeLoanDetails, formatDate]);
  
  const handleClientSelect = (client: Client) => {
      setSelectedClient(client);
      setIsModalOpen(true);
  };

  const handleAdjustClick = (weekNumber: number, currentAmount: number) => {
    if (!isCristobal) return;
    setAdjustData({ weekNumber, amount: currentAmount });
    setIsAdjustDialogOpen(true);
  };

  return (
    <div className="space-y-6">
        <div className="flex flex-col items-center justify-center text-center gap-2">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-black tracking-tight uppercase text-zinc-800">
                    Hola, {appUser?.username}
                </h1>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">
                    CONSULTA DE CLIENTES
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-6 font-black uppercase text-[10px] tracking-widest border-primary/30 text-primary bg-primary/5">
                    Actualizado: {new Date().toLocaleTimeString()}
                </Badge>
            </div>
        </div>

        <Card className="shadow-lg border-2">
            <CardContent className="p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="relative flex-1 w-full">
                        <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 mb-1 block">Buscador por Nombre</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="ESCRIBE EL NOMBRE DEL CLIENTE..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 text-base rounded-xl shadow-sm uppercase font-bold border-2"
                            />
                            {searchTerm && (
                                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setSearchTerm('')}>
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <Button 
                        variant={showAdvancedFilters ? "secondary" : "outline"} 
                        className={cn(
                            "h-11 font-black uppercase text-[10px] tracking-widest border-2 gap-2 px-8 w-full md:w-auto",
                            showAdvancedFilters && "bg-zinc-200"
                        )}
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    >
                        <Filter className="h-4 w-4" />
                        {showAdvancedFilters ? 'Ocultar Filtros' : 'Filtrar'}
                    </Button>
                </div>

                {showAdvancedFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-dashed animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Plaza</label>
                            <Select value={filterPlaza} onValueChange={(v) => { setFilterPlaza(v); setFilterLocalidad('all'); setFilterPromotora('all'); }}>
                                <SelectTrigger className="h-10 text-[10px] font-black uppercase border-2"><SelectValue placeholder="PLAZA" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">TODAS LAS PLAZAS</SelectItem>
                                    {plazaOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Localidad</label>
                            <Select value={filterLocalidad} onValueChange={(v) => { setFilterLocalidad(v); setFilterPromotora('all'); }} disabled={filterPlaza === 'all' && !isAdmin}>
                                <SelectTrigger className="h-10 text-[10px] font-black uppercase border-2"><SelectValue placeholder="LOCALIDAD" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">TODAS LAS ZONAS</SelectItem>
                                    {localidadOptions.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Promotora</label>
                            <Select value={filterPromotora} onValueChange={setFilterPromotora} disabled={filterLocalidad === 'all' && !isAdmin}>
                                <SelectTrigger className="h-10 text-[10px] font-black uppercase border-2"><SelectValue placeholder="PROMOTORA" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">TODAS LAS RUTAS</SelectItem>
                                    {promotoraOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Semana de Inicio (Semanas Activas)</label>
                            <Select value={filterWeek} onValueChange={setFilterWeek}>
                                <SelectTrigger className="h-10 text-[10px] font-black uppercase border-2"><SelectValue placeholder="SEMANA" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">CUALQUIER FECHA ACTIVA</SelectItem>
                                    {weekOptions.map(iso => (
                                        <SelectItem key={iso} value={iso}>{formatDate(iso)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>

        {canShowList ? (
            <Card className="shadow-lg border-2 overflow-hidden">
                <CardHeader className="p-4 border-b bg-primary/5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <List className="h-4 w-4 text-blue-600" /> Resultados de Consulta ({filteredList.length})
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredList.length > 0 ? (
                        <>
                            {/* VISTA DESKTOP: TABLA */}
                            <div className="hidden md:block">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="w-[80px]"></TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-wider py-4">Cliente</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-wider">Dirección</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-wider">Monto</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-wider">Estado</TableHead>
                                            <TableHead className="text-right pr-6"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredList.map(({ loan, client }) => (
                                            <TableRow 
                                                key={loan.id} 
                                                className="hover:bg-muted/30 cursor-pointer group transition-colors"
                                                onClick={() => handleClientSelect(client!)}
                                            >
                                                <TableCell className="pl-6">
                                                    <Avatar className="h-9 w-9 border shadow-sm group-hover:scale-110 transition-transform">
                                                        <AvatarImage src={client?.avatarUrl} alt={client?.name} />
                                                        <AvatarFallback className="text-[10px] font-bold">{client?.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black uppercase group-hover:text-blue-700">{client?.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5">
                                                        <MapPin className="h-3 w-3 text-muted-foreground" />
                                                        <span className="text-[10px] font-bold uppercase text-zinc-600 truncate max-w-[250px]">{client?.street}, {client?.neighborhood}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-[11px] font-black text-zinc-900">{formatCurrency(loan.amount)}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={loan.status === 'Overdue' ? 'destructive' : 'outline'} className="text-[8px] font-black uppercase h-4 px-2">
                                                        {loan.status === 'Overdue' ? 'VENCIDO' : 'ACTIVO'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Button variant="ghost" size="sm" className="h-8 rounded-full hover:bg-primary hover:text-white group-hover:px-6 transition-all duration-300">
                                                        <span className="hidden group-hover:inline text-[9px] font-black uppercase mr-2">Consultar</span>
                                                        <ArrowRight className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* VISTA MÓVIL: LISTADO DE TARJETAS */}
                            <div className="md:hidden divide-y">
                                {filteredList.map(({ loan, client }) => (
                                    <div 
                                        key={loan.id} 
                                        className="p-4 active:bg-muted/50 flex items-start gap-3 transition-colors"
                                        onClick={() => handleClientSelect(client!)}
                                    >
                                        <Avatar className="h-10 w-10 border shrink-0">
                                            <AvatarImage src={client?.avatarUrl} alt={client?.name} />
                                            <AvatarFallback className="text-xs font-black">{client?.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex justify-between items-start gap-2">
                                                <h4 className="text-[11px] font-black uppercase text-zinc-900 leading-tight">{client?.name}</h4>
                                                <Badge variant={loan.status === 'Overdue' ? 'destructive' : 'outline'} className="text-[7px] font-black uppercase h-3.5 px-1 shrink-0">
                                                    {loan.status === 'Overdue' ? 'VENCIDO' : 'ACTIVO'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-start gap-1 text-muted-foreground">
                                                <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                                                <p className="text-[9px] font-bold uppercase leading-tight">
                                                    {client?.street}, {client?.neighborhood}, {client?.city}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 pt-0.5">
                                                <CircleDollarSign className="h-3 w-3 text-blue-600" />
                                                <span className="text-[10px] font-black text-blue-700">{formatCurrency(loan.amount)}</span>
                                            </div>
                                        </div>
                                        <div className="self-center pl-2">
                                            <ChevronRight className="h-4 w-4 text-zinc-300" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-center">
                            <div className="max-w-xs mx-auto space-y-2">
                                <Info className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Sin coincidencias para los criterios actuales.</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        ) : (
            <div className="py-24 flex flex-col items-center justify-center border-4 border-dashed rounded-[3rem] bg-zinc-50/50 space-y-6">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
                    <Smartphone className="h-24 w-24 text-primary/40 relative" />
                </div>
                <div className="text-center space-y-2 max-w-sm">
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Búsqueda de Expediente</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed px-8">
                        Ingresa el nombre de un cliente arriba o selecciona una zona mediante el botón Filtrar.
                    </p>
                </div>
            </div>
        )}

        {/* MODAL DE DETALLE DEL CLIENTE */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 shadow-2xl rounded-sm w-full h-auto max-h-[92vh] md:max-h-[85vh] flex flex-col">
                <DialogHeader className="sr-only">
                    <DialogTitle>Detalle del Cliente</DialogTitle>
                    <DialogDescription>Expediente financiero y técnico del cliente seleccionado.</DialogDescription>
                </DialogHeader>
                <div className="absolute right-4 top-4 z-50">
                    <DialogClose asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 text-blue-600 hover:bg-blue-50 rounded-full shadow-lg bg-white/80 backdrop-blur-sm">
                            <X className="h-6 w-6 stroke-[3]" />
                        </Button>
                    </DialogClose>
                </div>

                {selectedClient && (
                    <div className="bg-white flex flex-col h-full max-h-[92vh] md:max-h-[85vh]">
                        <div className="p-4 md:p-5 flex flex-col md:flex-row justify-between gap-4 border-b bg-muted/5 pr-14 md:pr-16">
                            <div className="flex items-center gap-3 md:gap-4">
                                <Avatar className="h-12 w-12 md:h-16 md:w-16 border-2 border-white shadow-md rounded-full overflow-hidden shrink-0">
                                    <AvatarImage src={selectedClient.avatarUrl} alt={selectedClient.name} className="object-cover" />
                                    <AvatarFallback className="text-xl md:text-2xl font-black bg-zinc-100 text-zinc-400">{selectedClient.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-zinc-900 leading-tight break-words">{selectedClient.name}</h2>
                                    <p className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase">ID CLIENTE: {selectedClient.id}</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 min-w-0 md:min-w-[300px]">
                                <div className="flex items-center gap-2 text-blue-600">
                                    <Phone className="h-3.5 w-3.5" />
                                    <span className="text-xs font-black tracking-tight">{selectedClient.phone}</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-600">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-black uppercase">Inició: {activeLoanDetails ? formatDate(activeLoanDetails.loanStartDate) : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-blue-600 sm:col-span-2">
                                    <Home className="h-3.5 w-3.5 shrink-0" />
                                    <span className="text-[10px] font-black uppercase line-clamp-2 md:truncate">{selectedClient.street}, {selectedClient.neighborhood}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-500 sm:col-span-2 pt-1">
                                    <div className="flex items-center gap-1">
                                        <Building className="h-3 w-3" />
                                        <span className="text-[9px] font-black uppercase">{activeLoanDetails?.plazaName}</span>
                                    </div>
                                    <div className="flex items-center gap-1 border-l pl-2 border-zinc-200">
                                        <MapPin className="h-3 w-3" />
                                        <span className="text-[9px] font-black uppercase">{activeLoanDetails?.localidadName}</span>
                                    </div>
                                    <div className="flex items-center gap-1 border-l pl-2 border-zinc-200">
                                        <User className="h-3 w-3" />
                                        <span className="text-[9px] font-black uppercase">{activeLoanDetails?.promotoraName}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <ScrollArea className="flex-1 min-h-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-zinc-100">
                                <div className="p-4 md:p-5 space-y-6 bg-zinc-50/30">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Monitor className="h-4 w-4 text-zinc-500" />
                                            <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Garantías Registradas</span>
                                        </div>
                                        <div className="border border-zinc-200 rounded-xl p-3 bg-white min-h-[60px] flex items-center justify-start w-full">
                                            <p className="text-[11px] font-black uppercase text-zinc-600 leading-snug tracking-wide text-left whitespace-pre-line italic w-full">
                                                {selectedClient.guarantee || 'SIN GARANTÍAS'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="h-4 w-4 text-blue-500" />
                                            <h3 className="text-base font-black uppercase tracking-tight text-zinc-800">Estado de Cuenta</h3>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 md:gap-3">
                                            <div className="bg-white border rounded-xl p-2 md:p-3 text-center shadow-sm">
                                                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Semana</p>
                                                <p className="text-lg md:text-xl font-black text-zinc-900 leading-none">
                                                    {activeLoanDetails?.currentLoanWeek} <span className="text-zinc-300 text-sm">/ {activeLoanDetails?.termInWeeks}</span>
                                                </p>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 md:p-3 text-center shadow-sm">
                                                <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest mb-1">Abono</p>
                                                <p className="text-lg md:text-xl font-black text-blue-600 leading-none">{activeLoanDetails ? formatCurrency(activeLoanDetails.weeklyPayment) : '$0.00'}</p>
                                            </div>
                                            <div className="bg-red-50 border border-red-100 rounded-xl p-2 md:p-3 text-center shadow-sm">
                                                <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-1">Fallos</p>
                                                <p className="text-lg md:text-xl font-black text-red-600 leading-none">{activeLoanDetails?.missedWeeks || 0}</p>
                                            </div>
                                        </div>

                                        <div className="bg-zinc-100/80 rounded-xl p-3 space-y-2 border border-zinc-200/50">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Saldo de Fallos</span>
                                                <span className="text-sm font-black text-zinc-800">{activeLoanDetails ? formatCurrency(activeLoanDetails.baseArrears) : '$0.00'}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-zinc-200/60 px-1 gap-2">
                                                <div className="space-y-0">
                                                    <span className="text-[9px] font-black text-red-700 uppercase tracking-widest block">Total a Liquidar</span>
                                                    <span className="text-[7px] font-bold text-red-600 uppercase opacity-70 block">Vigentes + Penalización</span>
                                                </div>
                                                <span className="text-xl md:text-2xl font-black text-red-700 tracking-tight leading-none">
                                                    {activeLoanDetails ? formatCurrency(activeLoanDetails.totalBalance) : '$0.00'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 md:p-5 space-y-6 md:space-y-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-zinc-500" />
                                            <h3 className="text-base font-black uppercase tracking-tight text-zinc-800">Aval y Garantía</h3>
                                        </div>
                                        <div className="border border-zinc-200 rounded-xl p-4 space-y-2 relative overflow-hidden group bg-white shadow-sm">
                                            <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:rotate-12 transition-transform">
                                                <UserCheck className="h-16 w-16 text-zinc-800" />
                                            </div>
                                            <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest">Responsable Solidario</p>
                                            <h4 className="text-base font-black uppercase leading-tight text-zinc-800">{selectedClient.endorsement.split('(')[0].trim()}</h4>
                                            <p className="text-[10px] font-medium leading-tight text-zinc-500 line-clamp-3">
                                                {selectedClient.endorsement.match(/\((.*)\)/)?.[1] || 'SIN DIRECCIÓN REGISTRADA'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>

                        <div className="p-4 bg-zinc-50 border-t flex flex-col sm:flex-row justify-end gap-2 shrink-0">
                            <Button 
                                variant="outline" 
                                className="h-10 px-8 rounded-lg font-black uppercase text-[10px] tracking-widest border-2 border-blue-200 text-blue-700 hover:bg-blue-50 w-full sm:w-auto" 
                                onClick={() => setIsHistoryOpen(true)}
                            >
                                <ListTodo className="mr-2 h-4 w-4" />
                                Ver Abonos
                            </Button>
                            <Button 
                                variant="outline" 
                                className="h-10 px-8 rounded-lg font-black uppercase text-[10px] tracking-widest border-2 hover:bg-zinc-100 w-full sm:w-auto" 
                                onClick={() => setIsModalOpen(false)}
                            >
                                Cerrar Expediente
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>

        {/* DIALOG DE HISTORIAL DE ABONOS */}
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <DialogContent className="max-w-2xl w-full p-0 overflow-hidden border-0 shadow-2xl rounded-lg h-auto max-h-[85vh] flex flex-col">
                <DialogHeader className="p-4 pb-2 shrink-0 bg-zinc-50/50 border-b">
                    <DialogTitle className="text-center font-black uppercase text-sm tracking-widest flex items-center justify-center gap-1.5 text-zinc-700">
                        <History className="h-4 w-4 text-blue-600" />
                        Historial de Abonos
                    </DialogTitle>
                    <p className="text-[10px] text-center font-black text-muted-foreground uppercase tracking-widest mt-0.5">{selectedClient?.name}</p>
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
                                                    row.isRecovered ? "bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400" :
                                                    row.importeRecibido > 0 ? (row.importeRecibido >= row.importeAbono ? "bg-green-50/80 text-green-700" : "bg-amber-50/60 text-amber-700") : "bg-rose-50/60 text-rose-700",
                                                    isCristobal && !row.isPenalty && "cursor-pointer hover:bg-green-100 transition-colors"
                                                )}
                                                onClick={() => isCristobal && !row.isPenalty && handleAdjustClick(row.num, row.importeRecibido)}
                                            >
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {formatCurrency(row.importeRecibido)}
                                                    {row.isPenalty && (
                                                        <Badge className="bg-amber-600 text-white text-[7px] font-black h-3.5 px-1 uppercase shrink-0">EXTRA</Badge>
                                                    )}
                                                    {isCristobal && !row.isPenalty && (
                                                        <PencilLine className="h-3 w-3 opacity-0 group-hover:opacity-100 text-blue-600 shrink-0 transition-opacity" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className={cn(
                                                "text-center py-1.5 text-[9px] font-black uppercase",
                                                row.isRecovered ? "text-purple-700 dark:text-purple-400" :
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
                                            {formatCurrency(activeLoanDetails?.loan.payments.reduce((acc, p) => acc + p.amount, 0) || 0)}
                                        </TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    </ScrollArea>
                </div>
                <div className="p-3 border-t flex justify-end shrink-0 gap-2 bg-zinc-50/80">
                    <Button variant="secondary" onClick={() => setIsHistoryOpen(false)} className="font-black uppercase text-[9px] tracking-widest h-9 px-6 rounded-md border-zinc-300 bg-white shadow-sm">Cerrar Historial</Button>
                </div>
            </DialogContent>
        </Dialog>

        {/* DIALOG DE AJUSTE MANUAL (PARA CRISTOBAL) */}
        {activeLoanDetails && adjustData && (
            <ManualPaymentAdjustmentDialog
                isOpen={isAdjustDialogOpen}
                onOpenChange={setIsAdjustDialogOpen}
                loan={activeLoanDetails.loan}
                weekNumber={adjustData.weekNumber}
                currentAmount={adjustData.amount}
                onSuccess={() => {
                    if (typeof window !== 'undefined') window.location.reload();
                }}
            />
        )}
    </div>
  );
}