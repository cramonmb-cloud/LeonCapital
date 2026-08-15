'use client';

import { useState, useMemo } from 'react';
import type { Client, Loan, LoanPlan } from '@/lib/types';
import {
  Card,
  CardContent,
  CardFooter,
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { useAuth } from '@/hooks/use-auth';
import { getCurrentLoanWeekNumber } from '@/lib/utils';

interface ClientesConFallosProps {
  loans: Loan[];
  clients: Client[];
  loanPlans: LoanPlan[];
}

interface FalloInfo {
  clientId: string;
  clientName: string;
  totalFailures: number;
  totalFailureAmount: number;
}

const ITEMS_PER_PAGE = 5;

export function ClientesConFallos({ loans, clients, loanPlans }: ClientesConFallosProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { appUser } = useAuth();

    const failuresList: FalloInfo[] = useMemo(() => {
        const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'N/A';

        const clientsWithFailures = loans
            .filter(loan => loan.status === 'Active' || loan.status === 'Overdue')
            .reduce((acc, loan) => {
                const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
                if (!loanPlan) return acc;

                const weeklyPayment = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
                const currentLoanWeek = getCurrentLoanWeekNumber(loan.startDate);

                let totalFailures = 0;
                let totalFailureAmount = 0;

                for (let i = 1; i < currentLoanWeek - 1; i++) {
                    const paymentForWeek = loan.payments.find(p => p.weekNumber === i);
                    if (!paymentForWeek || paymentForWeek.isReverted) continue; // Skip assumed and reverted payments

                    const paidAmount = paymentForWeek.amount;
                    
                    if (paidAmount < weeklyPayment) {
                        totalFailures += 1;
                        totalFailureAmount += (weeklyPayment - paidAmount);
                    }
                }
                
                if (totalFailures > 0) {
                    if (!acc[loan.clientId]) {
                        acc[loan.clientId] = {
                            clientId: loan.clientId,
                            clientName: getClientName(loan.clientId),
                            totalFailures: 0,
                            totalFailureAmount: 0,
                        };
                    }
                    acc[loan.clientId].totalFailures += totalFailures;
                    acc[loan.clientId].totalFailureAmount += totalFailureAmount;
                }

                return acc;
            }, {} as Record<string, FalloInfo>);
        
        return Object.values(clientsWithFailures);
    }, [loans, clients, loanPlans]);

    const totalPages = Math.ceil(failuresList.length / ITEMS_PER_PAGE);
    const paginatedFailures = failuresList.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
          style: 'currency',
          currency: 'MXN',
        }).format(amount);
    };

    if (appUser?.username !== 'Cristobal') {
        return null;
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Clientes con Fallos</CardTitle>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={failuresList.length === 0}>Mostrar Todo</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                    <DialogTitle>Todos los Clientes con Fallos Registrados</DialogTitle>
                    <DialogDescription>
                        Lista completa de clientes con pagos registrados incompletos o en ceros.
                    </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="text-center">Semanas con Fallo</TableHead>
                                    <TableHead>Monto del Fallo</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {failuresList.map((item) => (
                                <TableRow key={item.clientId}>
                                    <TableCell className="font-medium">{item.clientName}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="destructive" className="gap-1">
                                            <AlertTriangle className="h-3 w-3"/> 
                                            {item.totalFailures}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-destructive">{formatCurrency(item.totalFailureAmount)}</TableCell>
                                    <TableCell className="text-right">
                                    <Button asChild variant="ghost" size="icon">
                                        <Link href={`/dashboard/clientes/${item.clientId}`}>
                                        <ArrowRight className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                    </TableCell>
                                </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-center">Semanas con Fallo</TableHead>
                        <TableHead>Monto del Fallo</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedFailures.length > 0 ? (
                        paginatedFailures.map((item) => (
                        <TableRow key={item.clientId}>
                            <TableCell className="font-medium">{item.clientName}</TableCell>
                            <TableCell className="text-center">
                                <Badge variant="destructive" className="gap-1">
                                    <AlertTriangle className="h-3 w-3"/> 
                                    {item.totalFailures}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-destructive">{formatCurrency(item.totalFailureAmount)}</TableCell>
                            <TableCell className="text-right">
                            <Button asChild variant="ghost" size="icon">
                                <Link href={`/dashboard/clientes/${item.clientId}`}>
                                <ArrowRight className="h-4 w-4" />
                                </Link>
                            </Button>
                            </TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={4} className="text-center">
                            No hay clientes con fallos registrados.
                        </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
            </CardContent>
             {totalPages > 1 && (
                <CardFooter className="flex items-center justify-between pt-4">
                    <span className="text-sm text-muted-foreground">
                        Página {currentPage} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => prev - 1)}
                            disabled={currentPage === 1}
                        >
                            Anterior
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            disabled={currentPage === totalPages}
                        >
                            Siguiente
                        </Button>
                    </div>
                </CardFooter>
            )}
        </Card>
    );
}
