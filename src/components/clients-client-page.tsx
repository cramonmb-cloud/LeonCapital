'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  Search, ArrowUpDown, ArrowUpAZ, ArrowDownZA 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import type { Client, Loan } from '@/lib/types';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';

interface ClientsClientPageProps {
    initialClients: Client[];
    initialLoans: Loan[];
}

export function ClientsClientPage({ initialClients, initialLoans }: ClientsClientPageProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number | 'all'>(20);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const filteredClients = useMemo(() => {
        let list = initialClients;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            list = initialClients.filter(client => 
                (client.name || '').toLowerCase().includes(term) ||
                (client.street || '').toLowerCase().includes(term) ||
                (client.neighborhood || '').toLowerCase().includes(term) ||
                (client.phone || '').includes(term)
            );
        }
        return [...list].sort((a, b) => {
            const nameA = a.name || '';
            const nameB = b.name || '';
            const comp = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
            return sortOrder === 'asc' ? comp : -comp;
        });
    }, [searchTerm, initialClients, sortOrder]);

    const totalItems = filteredClients.length;
    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalItems / (pageSize as number)));
    const actualPage = Math.min(Math.max(1, currentPage), totalPages);

    const visibleClients = useMemo(() => {
        if (pageSize === 'all') return filteredClients;
        const start = (actualPage - 1) * (pageSize as number);
        return filteredClients.slice(start, start + (pageSize as number));
    }, [filteredClients, actualPage, pageSize]);

    // Reset to page 1 when search, page size, or sorting changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, pageSize, sortOrder]);

    const getClientLoanCount = (clientId: string) => {
        return initialLoans.filter(loan => loan.clientId === clientId).length;
    };

    const toggleSortOrder = () => {
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
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
                        <>Mostrando todos los <span className="font-extrabold text-foreground">{totalItems}</span> clientes</>
                    ) : (
                        <>
                            Mostrando <span className="font-extrabold text-foreground">{startItem}</span> - <span className="font-extrabold text-foreground">{endItem}</span> de <span className="font-extrabold text-foreground">{totalItems}</span> clientes
                        </>
                    )}
                </div>

                {/* Selector de tamaño y navegación */}
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
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="space-y-1">
                        <CardTitle>Lista de Clientes</CardTitle>
                        <CardDescription>
                            {searchTerm 
                                ? `Mostrando ${filteredClients.length} de ${initialClients.length} clientes.`
                                : `Un total de ${initialClients.length} clientes registrados.`
                            }
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Buscar cliente por nombre o dirección..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 uppercase text-xs font-bold rounded-xl"
                            />
                        </div>
                    </div>

                    {/* Paginación Superior */}
                    {renderPagination('top')}

                    <div className="rounded-xl border border-border/60 overflow-hidden bg-white dark:bg-zinc-900 shadow-xs">
                        <Table>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-border/60">
                            <TableRow>
                                <TableHead className="font-extrabold text-[10px] uppercase py-2">
                                    <button
                                        type="button"
                                        onClick={toggleSortOrder}
                                        className="flex items-center gap-1.5 hover:text-blue-600 transition-colors uppercase font-extrabold"
                                        title="Ordenar alfabéticamente (A-Z / Z-A)"
                                    >
                                        <span>Nombre</span>
                                        {sortOrder === 'asc' ? (
                                            <ArrowUpAZ className="h-3.5 w-3.5 text-blue-600" />
                                        ) : (
                                            <ArrowDownZA className="h-3.5 w-3.5 text-blue-600" />
                                        )}
                                    </button>
                                </TableHead>
                                <TableHead className="hidden md:table-cell font-extrabold text-[10px] uppercase py-2">Dirección</TableHead>
                                <TableHead className="hidden md:table-cell font-extrabold text-[10px] uppercase py-2">Teléfono</TableHead>
                                <TableHead className="font-extrabold text-[10px] uppercase py-2">Préstamos</TableHead>
                                <TableHead className="text-right font-extrabold text-[10px] uppercase py-2">
                                    <span>Acciones</span>
                                </TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {visibleClients.map((client) => (
                                <TableRow key={client.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={client.avatarUrl} alt={client.name} />
                                        <AvatarFallback>{client.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <Link href={`/dashboard/clientes/${client.id}`} className="hover:underline uppercase font-bold text-xs text-foreground">
                                        {client.name}
                                    </Link>
                                    </div>
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-muted-foreground uppercase text-[10px] font-medium">
                                    {client.street}, {client.neighborhood}
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{client.phone}</TableCell>
                                <TableCell className="text-xs font-bold">{getClientLoanCount(client.id)}</TableCell>
                                <TableCell className="text-right">
                                    <Button asChild variant="outline" size="sm" className="h-7 text-[10px] font-bold uppercase rounded-lg">
                                        <Link href={`/dashboard/clientes/${client.id}`}>Ver detalles</Link>
                                    </Button>
                                </TableCell>
                                </TableRow>
                            ))}
                            {visibleClients.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground font-bold uppercase">
                                        No se encontraron clientes que coincidan con la búsqueda.
                                    </TableCell>
                                </TableRow>
                            )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Paginación Inferior */}
                    {renderPagination('bottom')}
                </CardContent>
            </Card>
        </div>
    );
}