'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { OverdueLoanDetails } from '@/app/dashboard/cartera-vencida/page';
import { Input } from '@/components/ui/input';
import { OverdueCard } from '@/components/overdue-card';
import type { Client, LoanPlan, Plaza, Localidad, Promotora } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { 
  X, Search, Filter, ChevronDown, ChevronUp, CalendarDays, Eye, EyeOff, CalendarRange, 
  LayoutGrid, List, User, Building, MapPin, RotateCcw,
  ArrowUpDown, ArrowUp, ArrowDown, ArrowUpAZ, ArrowDownZA,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { generateColorPalette, cn } from '@/lib/utils';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface OverduePortfolioClientPageProps {
    initialOverdueLoans: OverdueLoanDetails[];
    clients: Client[];
    loanPlans: LoanPlan[];
    plazas: Plaza[];
    localidades: Localidad[];
    promotoras: Promotora[];
    title: string;
}

export function OverduePortfolioClientPage({ 
    initialOverdueLoans, 
    clients, 
    loanPlans, 
    plazas, 
    localidades, 
    promotoras,
    title
}: OverduePortfolioClientPageProps) {
    const { data } = useRealtimeData(undefined, {
        enabledCollections: ['config']
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPlaza, setSelectedPlaza] = useState('all');
    const [selectedLocalidad, setSelectedLocalidad] = useState('all');
    const [selectedPromotora, setSelectedPromotora] = useState('all');
    const [selectedFailures, setSelectedFailures] = useState('all');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
    
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isMobile = window.innerWidth < 768;
            setViewMode(isMobile ? 'cards' : 'table');
        }
    }, []);
    
    // Date Filters
    const [selectedStartDate, setSelectedStartDate] = useState('all');
    const [startFilterMode, setStartFilterMode] = useState<'include' | 'exclude'>('include');
    
    const [selectedMaturityDate, setSelectedMaturityDate] = useState('all');
    const [maturityFilterMode, setMaturityFilterMode] = useState<'include' | 'exclude'>('include');

    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [promotoraSearchTerm, setPromotoraSearchTerm] = useState('');
    const [isPromotoraSearchFocused, setIsPromotoraSearchFocused] = useState(false);
    const [isLocalidadDialogOpen, setIsLocalidadDialogOpen] = useState(false);

    const isOverduePortfolio = title === "Pagos Pendientes";
    const globalDebtLabel = isOverduePortfolio ? "Cobro de Mora (Filtro)" : "Deuda Pendiente (Filtro)";

    const appConfig = data?.config;

    const plazaColors = useMemo(() => {
        const sortedPlazas = [...plazas].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
        const colors = generateColorPalette(sortedPlazas.length);
        const map: Record<string, string> = {};
        sortedPlazas.forEach((p, i) => {
            map[p.id] = colors[i];
        });
        return map;
    }, [plazas]);

    const availableStartDates = useMemo(() => {
        const dates = Array.from(new Set(initialOverdueLoans.map(d => {
            const date = new Date(d.loan.startDate);
            return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
        })));
        return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [initialOverdueLoans]);

    const availableMaturityDates = useMemo(() => {
        const dates = Array.from(new Set(initialOverdueLoans.map(d => {
            const startDate = new Date(d.loan.startDate);
            const mDate = new Date(startDate);
            mDate.setUTCDate(startDate.getUTCDate() + (d.loanPlan.termInWeeks * 7));
            return new Date(Date.UTC(mDate.getUTCFullYear(), mDate.getUTCMonth(), mDate.getUTCDate())).toISOString();
        })));
        return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [initialOverdueLoans]);

    const filteredLocalidadesOptions = useMemo(() => {
        let result = selectedPlaza === 'all' 
            ? localidades 
            : localidades.filter(l => l.plazaId === selectedPlaza);
        return [...result].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }, [selectedPlaza, localidades]);

    const filteredPromotorasOptions = useMemo(() => {
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

    const allPromotorasWithDetails = useMemo(() => {
        return promotoras.map(p => {
            const loc = localidades.find(l => l.id === p.localidadId);
            const plaza = loc ? plazas.find(pl => pl.id === loc.plazaId) : null;
            return {
                ...p,
                localidadName: loc?.name || 'N/A',
                plazaName: plaza?.name || 'N/A',
                plazaId: loc?.plazaId || '',
            };
        }).sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }, [promotoras, localidades, plazas]);

    const searchedPromotoras = useMemo(() => {
        if (!promotoraSearchTerm.trim()) return [];
        const query = promotoraSearchTerm.toLowerCase();
        return allPromotorasWithDetails.filter(p => 
            (p.name || '').toLowerCase().includes(query) ||
            (p.localidadName || '').toLowerCase().includes(query) ||
            (p.plazaName || '').toLowerCase().includes(query)
        ).slice(0, 8);
    }, [promotoraSearchTerm, allPromotorasWithDetails]);

    const filteredLoans = useMemo(() => {
        return initialOverdueLoans.filter(details => {
            const term = searchTerm.toLowerCase();
            const matchesSearch = searchTerm === '' || 
                (details.client.name || '').toLowerCase().includes(term) ||
                (details.client.street || '').toLowerCase().includes(term) ||
                (details.client.phone || '').includes(term) || 
                (details.hierarchy.plazaName || '').toLowerCase().includes(term) ||
                (details.hierarchy.localidadName || '').toLowerCase().includes(term) ||
                (details.hierarchy.promotoraName || '').toLowerCase().includes(term);

            const matchesPlaza = selectedPlaza === 'all' || details.hierarchy.plazaId === selectedPlaza;
            const matchesLocalidad = selectedLocalidad === 'all' || details.hierarchy.localidadId === selectedLocalidad;
            const matchesPromotora = selectedPromotora === 'all' || details.hierarchy.promotoraId === selectedPromotora;
            const matchesFailures = selectedFailures === 'all' || details.missedPayments.toString() === selectedFailures;
            
            // Start Date Filter
            let matchesStart = true;
            if (selectedStartDate !== 'all') {
                const loanDate = new Date(details.loan.startDate);
                const loanDateIso = new Date(Date.UTC(loanDate.getUTCFullYear(), loanDate.getUTCMonth(), loanDate.getUTCDate())).toISOString();
                matchesStart = startFilterMode === 'include' ? (loanDateIso === selectedStartDate) : (loanDateIso !== selectedStartDate);
            }

            // Maturity Date Filter
            let matchesMaturity = true;
            if (selectedMaturityDate !== 'all') {
                const sDate = new Date(details.loan.startDate);
                const mDate = new Date(sDate);
                mDate.setUTCDate(sDate.getUTCDate() + (details.loanPlan.termInWeeks * 7));
                const mDateIso = new Date(Date.UTC(mDate.getUTCFullYear(), mDate.getUTCMonth(), mDate.getUTCDate())).toISOString();
                matchesMaturity = maturityFilterMode === 'include' ? (mDateIso === selectedMaturityDate) : (mDateIso !== selectedMaturityDate);
            }

            return matchesSearch && matchesPlaza && matchesLocalidad && matchesPromotora && matchesFailures && matchesStart && matchesMaturity;
        });
    }, [initialOverdueLoans, searchTerm, selectedPlaza, selectedLocalidad, selectedPromotora, selectedFailures, selectedStartDate, startFilterMode, selectedMaturityDate, maturityFilterMode]);

    const totalDue = filteredLoans.reduce((acc, details) => acc + details.amountDue, 0);
    const totalClients = new Set(filteredLoans.map(d => d.client.id)).size;

    // Sorting & Pagination States
    type SortField = 'client' | 'startDate' | 'maturityDate';
    type SortOrder = 'asc' | 'desc';

    const [sortField, setSortField] = useState<SortField>('client');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [pageSize, setPageSize] = useState<number | 'all'>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);

    const getStartTimestamp = (d: OverdueLoanDetails) => {
        const t = new Date(d.loan.startDate).getTime();
        return isNaN(t) ? 0 : t;
    };

    const getMaturityTimestamp = (d: OverdueLoanDetails) => {
        try {
            const s = new Date(d.loan.startDate);
            if (isNaN(s.getTime())) return 0;
            const m = new Date(s);
            m.setUTCDate(s.getUTCDate() + ((d.loanPlan?.termInWeeks || 0) * 7));
            return m.getTime();
        } catch {
            return 0;
        }
    };

    const sortedLoans = useMemo(() => {
        return [...filteredLoans].sort((a, b) => {
            if (sortField === 'client') {
                const nameA = a.client?.name?.trim() || '';
                const nameB = b.client?.name?.trim() || '';
                const comp = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
                return sortOrder === 'asc' ? comp : -comp;
            }
            if (sortField === 'startDate') {
                const timeA = getStartTimestamp(a);
                const timeB = getStartTimestamp(b);
                return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
            }
            if (sortField === 'maturityDate') {
                const timeA = getMaturityTimestamp(a);
                const timeB = getMaturityTimestamp(b);
                return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
            }
            return 0;
        });
    }, [filteredLoans, sortField, sortOrder]);

    // Reset pagination to page 1 on filter, search, sort, or page-size change
    useEffect(() => {
        setCurrentPage(1);
    }, [
        searchTerm, 
        selectedPlaza, 
        selectedLocalidad, 
        selectedPromotora, 
        selectedFailures, 
        selectedStartDate, 
        startFilterMode, 
        selectedMaturityDate, 
        maturityFilterMode, 
        pageSize, 
        sortField, 
        sortOrder
    ]);

    const totalItems = sortedLoans.length;
    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalItems / (pageSize as number)));
    const actualPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedLoans = useMemo(() => {
        if (pageSize === 'all') return sortedLoans;
        const start = (actualPage - 1) * (pageSize as number);
        return sortedLoans.slice(start, start + (pageSize as number));
    }, [sortedLoans, actualPage, pageSize]);

    const handleToggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'client' ? 'asc' : 'desc');
        }
    };

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const correctedDate = new Date(date.getTime() + userTimezoneOffset);
        return correctedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    const activePromotoraName = useMemo(() => {
        if (selectedPromotora === 'all') return null;
        return promotoras.find(p => p.id === selectedPromotora)?.name;
    }, [selectedPromotora, promotoras]);

    const hasActiveFilters = useMemo(() => {
        return searchTerm !== '' || 
            selectedPlaza !== 'all' || 
            selectedLocalidad !== 'all' || 
            selectedPromotora !== 'all' || 
            selectedFailures !== 'all' || 
            selectedStartDate !== 'all' || 
            selectedMaturityDate !== 'all' ||
            promotoraSearchTerm !== '';
    }, [searchTerm, selectedPlaza, selectedLocalidad, selectedPromotora, selectedFailures, selectedStartDate, selectedMaturityDate, promotoraSearchTerm]);

    const handleClearFilters = () => {
        setSearchTerm('');
        setSelectedPlaza('all');
        setSelectedLocalidad('all');
        setSelectedPromotora('all');
        setSelectedFailures('all');
        setSelectedStartDate('all');
        setSelectedMaturityDate('all');
        setPromotoraSearchTerm('');
        setSortField('client');
        setSortOrder('asc');
        setPageSize(20);
        setCurrentPage(1);
    };

    const renderPagination = (position: 'top' | 'bottom') => {
        if (totalItems === 0) return null;

        const getPageNumbers = () => {
            if (totalPages <= 7) {
                return Array.from({ length: totalPages }, (_, i) => i + 1);
            }
            if (actualPage <= 4) {
                return [1, 2, 3, 4, 5, '...', totalPages];
            }
            if (actualPage >= totalPages - 3) {
                return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            }
            return [1, '...', actualPage - 1, actualPage, actualPage + 1, '...', totalPages];
        };

        const pageNumbers = getPageNumbers();
        const startItem = pageSize === 'all' ? 1 : (actualPage - 1) * (pageSize as number) + 1;
        const endItem = pageSize === 'all' ? totalItems : Math.min(actualPage * (pageSize as number), totalItems);

        return (
            <div className={cn(
                "flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/90 dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800 p-2.5 rounded-xl shadow-xs",
                position === 'top' ? "mb-3" : "mt-4"
            )}>
                {/* Resumen */}
                <div className="text-[11px] text-muted-foreground font-bold flex items-center gap-1.5">
                    {pageSize === 'all' ? (
                        <>Mostrando todos los <span className="font-extrabold text-foreground">{totalItems}</span> préstamos</>
                    ) : (
                        <>
                            Mostrando <span className="font-extrabold text-foreground">{startItem}</span> - <span className="font-extrabold text-foreground">{endItem}</span> de <span className="font-extrabold text-foreground">{totalItems}</span> préstamos
                        </>
                    )}
                </div>

                {/* Controles de página y selector de tamaño */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Selector de tamaño de página: 20, 40, 100, todo */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase text-muted-foreground font-black tracking-wider">Mostrar:</span>
                        <div className="inline-flex rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-100/70 dark:bg-zinc-800 p-0.5">
                            {([20, 40, 100, 'all'] as const).map((size) => {
                                const isSelected = pageSize === size;
                                return (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setPageSize(size)}
                                        className={cn(
                                            "px-2.5 py-0.5 text-xs font-black rounded-md transition-all",
                                            isSelected 
                                                ? "bg-white dark:bg-zinc-700 text-blue-700 dark:text-blue-400 shadow-xs" 
                                                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50"
                                        )}
                                    >
                                        {size === 'all' ? 'Todo' : size}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Botones de navegación si no es 'all' y hay más de 1 página */}
                    {pageSize !== 'all' && totalPages > 1 && (
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(1)}
                                disabled={actualPage === 1}
                                className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-300"
                                title="Primera página"
                            >
                                <ChevronsLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={actualPage === 1}
                                className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-300"
                                title="Página anterior"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>

                            <div className="flex items-center gap-1 px-0.5">
                                {pageNumbers.map((pageNum, idx) => {
                                    if (pageNum === '...') {
                                        return <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground font-bold">...</span>;
                                    }
                                    const isCurrent = pageNum === actualPage;
                                    return (
                                        <button
                                            key={pageNum}
                                            type="button"
                                            onClick={() => setCurrentPage(pageNum as number)}
                                            className={cn(
                                                "h-7 min-w-[28px] px-1.5 text-xs font-black rounded-lg transition-all",
                                                isCurrent 
                                                    ? "bg-blue-600 text-white shadow-xs" 
                                                    : "hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold"
                                            )}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={actualPage === totalPages}
                                className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-300"
                                title="Página siguiente"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={actualPage === totalPages}
                                className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-300"
                                title="Última página"
                            >
                                <ChevronsRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                <div className="bg-destructive/80 text-white p-3 rounded-lg shadow-sm border border-destructive">
                    <div className="text-[9px] font-black uppercase tracking-wider opacity-80">{globalDebtLabel}</div>
                    <div className="text-lg font-black">
                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalDue)}
                    </div>
                </div>
                <div className="bg-card text-card-foreground p-3 rounded-lg border shadow-sm">
                    <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Clientes (Filtro)</div>
                    <div className="text-lg font-black">{totalClients}</div>
                    <p className="text-[8px] text-muted-foreground uppercase">{initialOverdueLoans.length} total histórico</p>
                </div>
            </div>

            <Card className="relative z-30 shadow-sm border border-zinc-200/80 bg-white/95 backdrop-blur-md rounded-2xl overflow-visible mb-6">
                <CardContent className="p-4 space-y-4">
                    {/* Primera fila: Buscador principal, buscador de promotora y selector de vista */}
                    <div className="flex flex-col md:flex-row items-center gap-3">
                        {/* Buscador de clientes */}
                        <div className="relative flex-1 w-full">
                            <label className="text-[9px] font-black uppercase text-slate-500 ml-1 mb-1 block">Buscar Cliente</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="NOMBRE, CALLE O TELÉFONO..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 h-10 text-xs font-bold uppercase rounded-xl border-slate-200 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/10"
                                />
                                {searchTerm && (
                                    <Button variant="ghost" size="icon" onClick={() => setSearchTerm('')} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-slate-600">
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Buscador Rápido de Promotoras */}
                        <div className="relative w-full md:w-[220px]">
                            <label className="text-[9px] font-black uppercase text-slate-500 ml-1 mb-1 block">Buscar Promotora</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="BUSCAR PROMOTORA..."
                                    value={promotoraSearchTerm}
                                    onChange={(e) => setPromotoraSearchTerm(e.target.value)}
                                    onFocus={() => setIsPromotoraSearchFocused(true)}
                                    onBlur={() => setTimeout(() => setIsPromotoraSearchFocused(false), 200)}
                                    className="pl-10 h-10 text-xs font-bold uppercase rounded-xl border-slate-200 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/10"
                                />
                                {promotoraSearchTerm && (
                                    <Button variant="ghost" size="icon" onClick={() => setPromotoraSearchTerm('')} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-slate-600">
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            {/* Dropdown Results Overlay */}
                            {isPromotoraSearchFocused && promotoraSearchTerm.trim() && (
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
                                                        setPromotoraSearchTerm('');
                                                    }}
                                                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50/60 active:bg-blue-100/80 rounded-lg text-left transition-all duration-200 transform hover:translate-x-1 group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg group-hover:bg-blue-200 transition-colors">
                                                            <User className="h-4 w-4" />
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-slate-800 uppercase text-xs tracking-wide group-hover:text-blue-700 transition-colors">{p.name}</span>
                                                            <div className="flex items-center gap-3 text-[9px] uppercase font-semibold text-slate-500 mt-1">
                                                                <span className="flex items-center gap-1">
                                                                    <Building className="h-3 w-3 text-slate-400" />
                                                                    {p.plazaName}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <MapPin className="h-3 w-3 text-slate-400" />
                                                                    {p.localidadName}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] font-black uppercase px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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

                        {/* Selector de Ordenamiento */}
                        <div className="w-full md:w-[200px]">
                            <label className="text-[9px] font-black uppercase text-slate-500 ml-1 mb-1 block">Ordenar Por</label>
                            <Select 
                                value={`${sortField}-${sortOrder}`} 
                                onValueChange={(val) => {
                                    const [f, o] = val.split('-') as [SortField, SortOrder];
                                    setSortField(f);
                                    setSortOrder(o);
                                }}
                            >
                                <SelectTrigger className="h-10 text-xs uppercase font-bold rounded-xl border-slate-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="client-asc">Cliente (A - Z)</SelectItem>
                                    <SelectItem value="client-desc">Cliente (Z - A)</SelectItem>
                                    <SelectItem value="startDate-desc">Inicio (Reciente)</SelectItem>
                                    <SelectItem value="startDate-asc">Inicio (Antigua)</SelectItem>
                                    <SelectItem value="maturityDate-desc">Vence (Reciente)</SelectItem>
                                    <SelectItem value="maturityDate-asc">Vence (Antigua)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Selector de Vista */}
                        <div className="w-full md:w-auto self-end">
                            <label className="text-[9px] font-black uppercase text-slate-500 ml-1 mb-1 block">Vista</label>
                            <div className="flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200/60 shadow-inner h-10 items-center">
                                <Button
                                    variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('cards')}
                                    className={cn(
                                        "h-8 text-[10px] uppercase font-black px-3 rounded-lg gap-1.5 transition-all",
                                        viewMode === 'cards' ? "bg-white shadow-sm text-zinc-800" : "text-zinc-500 hover:text-zinc-700"
                                    )}
                                >
                                    <LayoutGrid className="h-3.5 w-3.5" />
                                    Tarjetas
                                </Button>
                                <Button
                                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('table')}
                                    className={cn(
                                        "h-8 text-[10px] uppercase font-black px-3 rounded-lg gap-1.5 transition-all",
                                        viewMode === 'table' ? "bg-white shadow-sm text-zinc-800" : "text-zinc-500 hover:text-zinc-700"
                                    )}
                                >
                                    <List className="h-3.5 w-3.5" />
                                    Tabla Listado
                                </Button>
                            </div>
                        </div>

                        {/* Botón de Toggle Filtros Avanzados */}
                        <div className="w-full md:w-auto self-end">
                            <label className="text-[9px] font-black uppercase text-slate-500 ml-1 mb-1 block">Filtros</label>
                            <Button 
                                variant="outline" 
                                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                                className={cn(
                                    "w-full md:w-[180px] flex justify-between items-center h-10 border font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all",
                                    isFiltersOpen ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                                )}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Filter className="h-3.5 w-3.5 text-blue-600" />
                                    {isFiltersOpen ? "Ocultar Filtros" : "Más Filtros"}
                                </div>
                                {isFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                        </div>

                        {/* Botón de Limpiar Filtros */}
                        {hasActiveFilters && (
                            <div className="w-full md:w-auto self-end">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1 mb-1 block">Limpiar</label>
                                <Button
                                    variant="outline"
                                    onClick={handleClearFilters}
                                    className="w-full md:w-auto h-10 border border-red-200 bg-red-50/20 hover:bg-red-50 text-red-600 hover:text-red-700 font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all gap-1.5 active:scale-95"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Limpiar
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Filtros Avanzados Collapsible */}
                    {isFiltersOpen && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Plaza</label>
                                <Select value={selectedPlaza} onValueChange={(v) => { setSelectedPlaza(v); setSelectedLocalidad('all'); setSelectedPromotora('all'); }}>
                                    <SelectTrigger className="h-10 text-xs uppercase font-bold rounded-xl border-slate-200"><SelectValue placeholder="Todas" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        {[...plazas].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Localidad</label>
                                <Button 
                                    variant="outline"
                                    disabled={selectedPlaza === 'all'}
                                    onClick={() => {
                                        setIsLocalidadDialogOpen(true);
                                    }}
                                    className="w-full justify-between text-left font-semibold text-xs border border-slate-200 h-10 px-3 bg-background hover:bg-slate-50 rounded-xl truncate"
                                >
                                    <span className="truncate">
                                        {selectedLocalidad !== 'all'
                                            ? localidades.find(l => l.id === selectedLocalidad)?.name || "Selecciona Localidad"
                                            : "Selecciona Localidad"
                                        }
                                    </span>
                                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-slate-500" />
                                </Button>

                                <Dialog open={isLocalidadDialogOpen} onOpenChange={setIsLocalidadDialogOpen}>
                                    <DialogContent className="sm:max-w-[650px] rounded-2xl p-6 border border-border/40 shadow-2xl">
                                        <DialogTitle className="sr-only">Seleccionar Localidad</DialogTitle>
                                        <div className="py-2">
                                            <ScrollArea className="h-48 md:h-auto max-h-[350px]">
                                                <div className="grid grid-cols-3 gap-2">
                                                    <Button
                                                        variant={selectedLocalidad === 'all' ? "default" : "outline"}
                                                        onClick={() => {
                                                            setSelectedLocalidad('all');
                                                            setSelectedPromotora('all');
                                                            setIsLocalidadDialogOpen(false);
                                                        }}
                                                        className={cn(
                                                            "justify-start text-left h-10 px-3 text-xs font-bold transition-all rounded-xl truncate active:scale-95 w-full",
                                                            selectedLocalidad === 'all'
                                                                ? "bg-blue-600 hover:bg-blue-700 text-white font-black shadow-md border-0" 
                                                                : "bg-background hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors border-border/80"
                                                        )}
                                                    >
                                                        Todas
                                                    </Button>

                                                    {filteredLocalidadesOptions.map((l) => {
                                                        const isSelected = selectedLocalidad === l.id;
                                                        return (
                                                            <Button
                                                                key={l.id}
                                                                variant={isSelected ? "default" : "outline"}
                                                                onClick={() => {
                                                                    setSelectedLocalidad(l.id);
                                                                    setSelectedPromotora('all');
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
                                                    {filteredLocalidadesOptions.length === 0 && (
                                                        <div className="col-span-3 text-center py-8 text-xs text-muted-foreground font-bold">
                                                            No hay localidades disponibles para esta plaza.
                                                        </div>
                                                    )}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Promotora</label>
                                <Select value={selectedPromotora} onValueChange={setSelectedPromotora}>
                                    <SelectTrigger className="h-10 text-xs uppercase font-bold rounded-xl border-slate-200"><SelectValue placeholder="Todas" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        {filteredPromotorasOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Fallos</label>
                                <Select value={selectedFailures} onValueChange={setSelectedFailures}>
                                    <SelectTrigger className="h-10 text-xs border-slate-200 uppercase font-bold rounded-xl"><SelectValue placeholder="Ver Todos" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Ver Todos</SelectItem>
                                        {Array.from({ length: 15 }, (_, i) => (
                                            <SelectItem key={i + 2} value={(i + 2).toString()}>{i + 2} Fallos</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1">
                                    <CalendarDays className="h-2.5 w-2.5 text-blue-600" /> Fecha Inicio
                                </label>
                                <Select value={selectedStartDate} onValueChange={setSelectedStartDate}>
                                    <SelectTrigger className="h-10 text-xs border-blue-100 bg-blue-50/20 font-bold rounded-xl">
                                        <SelectValue placeholder="Cualquier Inicio" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Cualquier Inicio</SelectItem>
                                        {availableStartDates.map(iso => (
                                            <SelectItem key={iso} value={iso}>{formatDate(iso)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Modo Inicio</label>
                                <Select 
                                    value={startFilterMode} 
                                    onValueChange={(v: any) => setStartFilterMode(v)}
                                    disabled={selectedStartDate === 'all'}
                                >
                                    <SelectTrigger className={cn(
                                        "h-10 text-xs font-black uppercase border-blue-200 rounded-xl shadow-sm",
                                        startFilterMode === 'exclude' ? "text-orange-600" : "text-blue-700"
                                    )}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="include" className="text-blue-700 font-bold">Mostrar Solo</SelectItem>
                                        <SelectItem value="exclude" className="text-orange-600 font-bold">Ocultar Fecha</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1">
                                    <CalendarRange className="h-2.5 w-2.5 text-red-600" /> Vencimiento
                                </label>
                                <Select value={selectedMaturityDate} onValueChange={setSelectedMaturityDate}>
                                    <SelectTrigger className="h-10 text-xs border-red-100 bg-red-50/20 font-bold rounded-xl">
                                        <SelectValue placeholder="Cualquier Vence" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Cualquier Vence</SelectItem>
                                        {availableMaturityDates.map(iso => (
                                            <SelectItem key={iso} value={iso}>{formatDate(iso)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Modo Vence</label>
                                <Select 
                                    value={maturityFilterMode} 
                                    onValueChange={(v: any) => setMaturityFilterMode(v)}
                                    disabled={selectedMaturityDate === 'all'}
                                >
                                    <SelectTrigger className={cn(
                                        "h-10 text-xs font-black uppercase border-red-200 rounded-xl shadow-sm",
                                        maturityFilterMode === 'exclude' ? "text-orange-600" : "text-red-700"
                                    )}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="include" className="text-red-700 font-bold">Mostrar Solo</SelectItem>
                                        <SelectItem value="exclude" className="text-orange-600 font-bold">Ocultar Fecha</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-between items-center mt-4 mb-2 px-1">
                <div className="space-y-0.5">
                    <h3 className="text-xs font-black uppercase text-zinc-700 tracking-wider">
                        {sortedLoans.length} {sortedLoans.length === 1 ? 'Préstamo Encontrado' : 'Préstamos Encontrados'}
                        {activePromotoraName && (
                            <>
                                {' de la promotora '}
                                <span className="font-extrabold text-blue-700">{activePromotoraName}</span>
                            </>
                        )}
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase">
                        Filtrados del total histórico de {initialOverdueLoans.length}
                    </p>
                </div>
            </div>

            {/* Paginación Superior */}
            {renderPagination('top')}

            {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-3 gap-y-1 pt-1">
                    {paginatedLoans.length > 0 ? (
                        paginatedLoans.map(details => (
                           <OverdueCard 
                                key={details.loan.id} 
                                details={details} 
                                allClients={clients}
                                allLoanPlans={loanPlans}
                                plazaColor={plazaColors[details.hierarchy.plazaId] || '#666'}
                                isOverduePortfolio={isOverduePortfolio}
                                appConfig={appConfig}
                                viewMode="card"
                           />
                        ))
                    ) : (
                        <div className="col-span-full py-8 text-center border-2 border-dashed rounded-lg bg-muted/20">
                            <p className="text-[11px] text-muted-foreground font-black uppercase">
                                Sin resultados para estos filtros
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="overflow-x-auto min-h-[150px]">
                        <Table>
                            <TableHeader className="bg-zinc-50 border-b border-zinc-200">
                                <TableRow className="hover:bg-zinc-50">
                                    <TableHead className="text-zinc-700 font-extrabold text-[9px] uppercase py-2 tracking-wider border-r border-zinc-200 min-w-[200px]">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleSort('client')}
                                            className="flex items-center gap-1 hover:text-blue-600 transition-colors uppercase font-extrabold group"
                                            title="Ordenar alfabéticamente por cliente"
                                        >
                                            <span>Cliente / Zona</span>
                                            {sortField === 'client' ? (
                                                sortOrder === 'asc' ? <ArrowUpAZ className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDownZA className="h-3.5 w-3.5 text-blue-600" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead className="text-zinc-700 font-extrabold text-[9px] uppercase py-2 tracking-wider border-r border-zinc-200 min-w-[180px]">Domicilio / Contacto</TableHead>
                                    <TableHead className="text-zinc-700 font-extrabold text-[9px] uppercase py-2 tracking-wider border-r border-zinc-200 min-w-[180px]">Responsable (Aval)</TableHead>
                                    <TableHead className="text-zinc-700 font-extrabold text-center text-[9px] uppercase py-2 tracking-wider border-r border-zinc-200 min-w-[170px]">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[9px] text-zinc-500 font-black">Fechas (Inicio / Vence)</span>
                                            <div className="inline-flex items-center gap-1 bg-zinc-200/80 dark:bg-zinc-800 p-0.5 rounded-lg">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleSort('startDate')}
                                                    className={cn(
                                                        "px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1 transition-all",
                                                        sortField === 'startDate'
                                                            ? "bg-blue-600 text-white shadow-xs"
                                                            : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                                    )}
                                                    title="Ordenar por Fecha de Inicio"
                                                >
                                                    Inicio
                                                    {sortField === 'startDate' ? (
                                                        sortOrder === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                                                    ) : (
                                                        <ArrowUpDown className="h-2 w-2 opacity-50" />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleSort('maturityDate')}
                                                    className={cn(
                                                        "px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1 transition-all",
                                                        sortField === 'maturityDate'
                                                            ? "bg-red-600 text-white shadow-xs"
                                                            : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                                    )}
                                                    title="Ordenar por Fecha de Vencimiento"
                                                >
                                                    Vence
                                                    {sortField === 'maturityDate' ? (
                                                        sortOrder === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                                                    ) : (
                                                        <ArrowUpDown className="h-2 w-2 opacity-50" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-zinc-700 font-extrabold text-[9px] uppercase py-2 tracking-wider border-r border-zinc-200 min-w-[160px]">Estado Financiero</TableHead>
                                    <TableHead className="text-zinc-700 font-extrabold text-center text-[9px] uppercase py-2 tracking-wider min-w-[120px]">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedLoans.length > 0 ? (
                                    paginatedLoans.map(details => (
                                        <OverdueCard 
                                            key={details.loan.id} 
                                            details={details} 
                                            allClients={clients}
                                            allLoanPlans={loanPlans}
                                            plazaColor={plazaColors[details.hierarchy.plazaId] || '#666'}
                                            isOverduePortfolio={isOverduePortfolio}
                                            appConfig={appConfig}
                                            viewMode="table-row"
                                        />
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-8 text-center border-dashed bg-muted/20">
                                            <p className="text-[11px] text-muted-foreground font-black uppercase">
                                                Sin resultados para estos filtros
                                            </p>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Paginación Inferior */}
            {renderPagination('bottom')}
        </div>
    );
}
