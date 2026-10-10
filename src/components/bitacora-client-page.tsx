'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
  RotateCcw,
  CheckCircle2,
  Wallet as WalletIcon,
  User,
  Filter,
  Calendar,
  Banknote,
  Receipt,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import type { AppUser, Wallet, WalletTransaction, Client } from '@/lib/types';
import { cn, parseLocalDate, getSaturdayOfWeek, getMexicoNow } from '@/lib/utils';
import { useRealtimeData } from '@/hooks/use-realtime-data';

interface BitacoraClientPageProps {
  wallet: Wallet;
  transactions: WalletTransaction[];
  clients: Client[];
  users: AppUser[];
}

type CategoryFilter = 'all' | 'abonos' | 'prestamos' | 'ajustes';
type DateFilter = 'all' | 'today' | 'this_week' | 'this_month';

// Clasificador inteligente de transacciones para entender de inmediato el movimiento
function classifyTransaction(tx: WalletTransaction) {
  const desc = (tx.description || '').toLowerCase();

  if (
    desc.includes('reversión') ||
    desc.includes('reversion') ||
    desc.includes('eliminación') ||
    desc.includes('eliminacion') ||
    desc.includes('ajuste') ||
    desc.includes('corrección') ||
    desc.includes('correccion')
  ) {
    return {
      typeLabel: 'Ajuste / Reversión',
      category: 'ajustes' as CategoryFilter,
      badgeClass:
        'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
      icon: RotateCcw,
      iconClass: 'text-amber-600',
    };
  }

  if (desc.includes('liquidación') || desc.includes('liquidacion')) {
    return {
      typeLabel: 'Liquidación Total',
      category: 'abonos' as CategoryFilter,
      badgeClass:
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      iconClass: 'text-emerald-600',
    };
  }

  if (tx.type === 'credit') {
    return {
      typeLabel: 'Abono / Cobranza',
      category: 'abonos' as CategoryFilter,
      badgeClass:
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
      icon: ArrowDownLeft,
      iconClass: 'text-emerald-600',
    };
  }

  if (
    desc.includes('préstamo') ||
    desc.includes('prestamo') ||
    desc.includes('desembolso') ||
    tx.loanId
  ) {
    return {
      typeLabel: 'Préstamo Otorgado',
      category: 'prestamos' as CategoryFilter,
      badgeClass:
        'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
      icon: ArrowUpRight,
      iconClass: 'text-rose-600',
    };
  }

  return {
    typeLabel: 'Salida de Caja',
    category: 'prestamos' as CategoryFilter,
    badgeClass:
      'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
    icon: ArrowUpRight,
    iconClass: 'text-slate-600',
  };
}

export function BitacoraClientPage({
  wallet,
  transactions,
  clients: initialClients,
  users: initialUsers,
}: BitacoraClientPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(40);

  const { data } = useRealtimeData(undefined, {
    enabledCollections: ['clients', 'users'],
  });

  const clients = data?.clients ?? initialClients;
  const users = data?.users ?? initialUsers;

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.username));
    return map;
  }, [users]);

  const formatCurrency = (amount: number) => {
    const safeAmount =
      typeof amount === 'number' && !isNaN(amount) && isFinite(amount)
        ? amount
        : 0;
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(safeAmount);
  };

  // Filtrado reactivo completo
  const filteredTransactions = useMemo(() => {
    const now = getMexicoNow();
    const todayStr = now.toISOString().slice(0, 10);

    const weekStart = getSaturdayOfWeek(now);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    return transactions.filter((tx) => {
      const classification = classifyTransaction(tx);

      // Filtro de categoría
      if (categoryFilter !== 'all' && classification.category !== categoryFilter) {
        return false;
      }

      // Filtro de fecha
      if (dateFilter !== 'all') {
        const txDate = parseLocalDate(tx.date);
        if (dateFilter === 'today') {
          const txDateStr = txDate.toISOString().slice(0, 10);
          if (txDateStr !== todayStr) return false;
        } else if (dateFilter === 'this_week') {
          if (txDate < weekStart || txDate > weekEnd) return false;
        } else if (dateFilter === 'this_month') {
          if (txDate < monthStart) return false;
        }
      }

      // Buscador
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const clientName = (clientMap.get(tx.clientId || '') || '').toLowerCase();
        const userName = (userMap.get(tx.userId || '') || '').toLowerCase();
        const desc = (tx.description || '').toLowerCase();
        const amountStr = String(tx.amount || '');

        return (
          clientName.includes(q) ||
          userName.includes(q) ||
          desc.includes(q) ||
          amountStr.includes(q)
        );
      }

      return true;
    });
  }, [transactions, categoryFilter, dateFilter, searchTerm, clientMap, userMap]);

  // Totales financieros del conjunto filtrado
  const { totalIncome, totalExpense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'credit') {
        income += amt;
      } else {
        expense += amt;
      }
    });
    return { totalIncome: income, totalExpense: expense };
  }, [filteredTransactions]);

  // Conteos para tabs de categoría
  const categoryCounts = useMemo(() => {
    let abonos = 0;
    let prestamos = 0;
    let ajustes = 0;
    transactions.forEach((tx) => {
      const cat = classifyTransaction(tx).category;
      if (cat === 'abonos') abonos++;
      else if (cat === 'prestamos') prestamos++;
      else if (cat === 'ajustes') ajustes++;
    });
    return { all: transactions.length, abonos, prestamos, ajustes };
  }, [transactions]);

  // Paginación
  const totalItems = filteredTransactions.length;
  const totalPages =
    pageSize === 'all'
      ? 1
      : Math.max(1, Math.ceil(totalItems / (pageSize as number)));
  const actualPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTransactions = useMemo(() => {
    if (pageSize === 'all') return filteredTransactions;
    const start = (actualPage - 1) * (pageSize as number);
    return filteredTransactions.slice(start, start + (pageSize as number));
  }, [filteredTransactions, actualPage, pageSize]);

  // Reset a pág 1 al cambiar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, dateFilter, pageSize]);

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
        return [
          1,
          '...',
          totalPages - 4,
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages,
        ];
      }
      return [
        1,
        '...',
        actualPage - 1,
        actualPage,
        actualPage + 1,
        '...',
        totalPages,
      ];
    };

    const pageNumbers = getPageNumbers();
    const startItem =
      pageSize === 'all' ? 1 : (actualPage - 1) * (pageSize as number) + 1;
    const endItem =
      pageSize === 'all'
        ? totalItems
        : Math.min(actualPage * (pageSize as number), totalItems);

    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-card px-3 py-1.5 rounded-lg border border-border shadow-xs',
          position === 'top' ? 'mb-2' : 'mt-2.5'
        )}
      >
        <div className="text-[11px] text-muted-foreground font-semibold">
          {pageSize === 'all' ? (
            <>
              Mostrando todos los{' '}
              <strong className="text-foreground">{totalItems}</strong> movimientos
            </>
          ) : (
            <>
              Mostrando{' '}
              <strong className="text-foreground">{startItem}</strong> -{' '}
              <strong className="text-foreground">{endItem}</strong> de{' '}
              <strong className="text-foreground">{totalItems}</strong> movimientos
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de registros por página */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] uppercase text-muted-foreground font-black tracking-wider">
              Ver:
            </span>
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {([20, 40, 100, 'all'] as const).map((size) => {
                const isSelected = pageSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPageSize(size)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-black rounded transition-all',
                      isSelected
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {size === 'all' ? 'Todo' : size}
                  </button>
                );
              })}
            </div>
          </div>

          {pageSize !== 'all' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={actualPage === 1}
                className="h-6 w-6 rounded text-muted-foreground"
                title="Primera"
              >
                <ChevronsLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={actualPage === 1}
                className="h-6 w-6 rounded text-muted-foreground"
                title="Anterior"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>

              <div className="flex items-center gap-0.5 px-0.5">
                {pageNumbers.map((pageNum, idx) => {
                  if (pageNum === '...') {
                    return (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-1 text-[10px] text-muted-foreground font-bold"
                      >
                        ...
                      </span>
                    );
                  }
                  const isCurrent = pageNum === actualPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum as number)}
                      className={cn(
                        'h-6 min-w-[24px] px-1 text-[10px] font-black rounded transition-all',
                        isCurrent
                          ? 'bg-primary text-white shadow-xs'
                          : 'hover:bg-muted text-foreground font-bold'
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={actualPage === totalPages}
                className="h-6 w-6 rounded text-muted-foreground"
                title="Siguiente"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={actualPage === totalPages}
                className="h-6 w-6 rounded text-muted-foreground"
                title="Última"
              >
                <ChevronsRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      {/* 1. TIRA SUPERIOR DE RESUMEN ULTRA COMPACTA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-card px-3.5 py-2 rounded-xl border border-border shadow-xs">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-xs md:text-sm font-black uppercase tracking-tight text-foreground">
            Bitácora de Movimientos
          </h2>
          <span className="text-[10px] text-muted-foreground font-semibold hidden md:inline">
            · Auditoría de los últimos 4 meses
          </span>
        </div>

        {/* Resumen Compacto de Saldo y Flujo */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[11px] font-bold">
            <WalletIcon className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground text-[10px] uppercase font-semibold">
              Cartera:
            </span>
            <span className="font-mono font-black text-foreground">
              {formatCurrency(wallet?.balance || 0)}
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
            <ArrowDownLeft className="h-3 w-3" />
            <span className="text-[10px] uppercase font-semibold">Ingresos:</span>
            <span className="font-mono font-black">+{formatCurrency(totalIncome)}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[11px] font-bold text-rose-700 dark:text-rose-400">
            <ArrowUpRight className="h-3 w-3" />
            <span className="text-[10px] uppercase font-semibold">Egresos:</span>
            <span className="font-mono font-black">-{formatCurrency(totalExpense)}</span>
          </div>
        </div>
      </div>

      {/* 2. BARRA DE CONTROL Y FILTROS COMPACTOS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-card px-3 py-2 rounded-xl border border-border shadow-xs">
        {/* Filtros por Categoría */}
        <div className="inline-flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-[10px] font-bold overflow-x-auto">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={cn(
              'px-2 py-1 rounded-md transition-all shrink-0',
              categoryFilter === 'all'
                ? 'bg-background text-foreground shadow-xs font-black'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Todos ({categoryCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('abonos')}
            className={cn(
              'px-2 py-1 rounded-md transition-all shrink-0 flex items-center gap-1',
              categoryFilter === 'abonos'
                ? 'bg-background text-emerald-700 dark:text-emerald-400 shadow-xs font-black'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Receipt className="h-3 w-3 text-emerald-600" />
            Abonos ({categoryCounts.abonos})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('prestamos')}
            className={cn(
              'px-2 py-1 rounded-md transition-all shrink-0 flex items-center gap-1',
              categoryFilter === 'prestamos'
                ? 'bg-background text-rose-700 dark:text-rose-400 shadow-xs font-black'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Banknote className="h-3 w-3 text-rose-600" />
            Préstamos ({categoryCounts.prestamos})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('ajustes')}
            className={cn(
              'px-2 py-1 rounded-md transition-all shrink-0 flex items-center gap-1',
              categoryFilter === 'ajustes'
                ? 'bg-background text-amber-700 dark:text-amber-400 shadow-xs font-black'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <RotateCcw className="h-3 w-3 text-amber-600" />
            Ajustes ({categoryCounts.ajustes})
          </button>
        </div>

        {/* Derecha: Selector de Fecha + Buscador Compacto */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Filtro Rápido de Tiempo */}
          <div className="inline-flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-[10px] font-bold">
            {(
              [
                ['all', 'Todo'],
                ['today', 'Hoy'],
                ['this_week', 'Semana'],
                ['this_month', 'Mes'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDateFilter(key)}
                className={cn(
                  'px-2 py-1 rounded-md transition-all',
                  dateFilter === key
                    ? 'bg-background text-foreground shadow-xs font-black'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Buscador */}
          <div className="relative w-full sm:w-48 md:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, usuario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-7 h-7 text-xs rounded-lg bg-background border-border"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Paginación Superior */}
      {renderPagination('top')}

      {/* 3. TABLA DE MOVIMIENTOS OPTIMIZADA Y ULTRA COMPACTA */}
      <Card className="rounded-xl border border-border shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30 border-b border-border/60">
              <TableRow className="h-7">
                <TableHead className="py-1 px-3 text-[10px] font-black uppercase text-muted-foreground w-40">
                  Operación
                </TableHead>
                <TableHead className="py-1 px-3 text-[10px] font-black uppercase text-muted-foreground">
                  Detalle & Cliente
                </TableHead>
                <TableHead className="py-1 px-3 text-[10px] font-black uppercase text-muted-foreground w-36">
                  Fecha y Hora
                </TableHead>
                <TableHead className="py-1 px-3 text-[10px] font-black uppercase text-muted-foreground w-28">
                  Operado Por
                </TableHead>
                <TableHead className="py-1 px-3 text-[10px] font-black uppercase text-muted-foreground text-right w-32">
                  Monto
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTransactions.map((tx) => {
                const info = classifyTransaction(tx);
                const clientName = tx.clientId ? clientMap.get(tx.clientId) : null;
                const userName = tx.userId ? userMap.get(tx.userId) || 'Usuario' : 'Sistema';

                const parsedDate = parseLocalDate(tx.date);
                const dateStr = parsedDate.toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });
                const timeStr = parsedDate.toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const Icon = info.icon;
                const isCredit = tx.type === 'credit';

                return (
                  <TableRow
                    key={tx.id}
                    className="h-9 hover:bg-muted/20 border-b border-border/40 transition-colors"
                  >
                    {/* 1. Categoría / Operación */}
                    <TableCell className="py-1.5 px-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          'h-5 px-1.5 text-[10px] font-black uppercase tracking-tight flex items-center gap-1 w-fit',
                          info.badgeClass
                        )}
                      >
                        <Icon className={cn('h-3 w-3 shrink-0', info.iconClass)} />
                        <span>{info.typeLabel}</span>
                      </Badge>
                    </TableCell>

                    {/* 2. Detalle y Cliente */}
                    <TableCell className="py-1.5 px-3">
                      <div className="flex flex-col min-w-0">
                        {tx.clientId ? (
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/inicio/clientes/${tx.clientId}`}
                              className="font-black text-xs uppercase text-foreground hover:text-primary hover:underline truncate"
                            >
                              {clientName || 'Cliente Registrado'}
                            </Link>
                          </div>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {tx.description}
                        </p>
                      </div>
                    </TableCell>

                    {/* 3. Fecha y Hora */}
                    <TableCell className="py-1.5 px-3 text-xs">
                      <div className="flex items-center gap-1 font-semibold text-foreground">
                        <span>{dateStr}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {timeStr} hrs
                        </span>
                      </div>
                    </TableCell>

                    {/* 4. Operado por */}
                    <TableCell className="py-1.5 px-3">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase">
                        <User className="h-3 w-3 opacity-60 shrink-0" />
                        <span className="truncate max-w-[90px]">{userName}</span>
                      </div>
                    </TableCell>

                    {/* 5. Monto e Impacto Financiero */}
                    <TableCell className="py-1.5 px-3 text-right">
                      <span
                        className={cn(
                          'font-mono font-black text-xs sm:text-sm',
                          isCredit
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {isCredit ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}

              {paginatedTransactions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-xs text-muted-foreground italic font-semibold"
                  >
                    No se encontraron movimientos registrados con los filtros seleccionados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginación Inferior */}
      {renderPagination('bottom')}
    </div>
  );
}
