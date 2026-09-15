'use client';

import { PlusCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import Link from 'next/link';
import Loading from '../loading';
import { cn } from '@/lib/utils';

export default function LoanPlansPage() {
  const { data, loading } = useRealtimeData(undefined, {
    enabledCollections: ['loanPlans']
  });
  const { loanPlans = [] } = data || {};

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  if (loading) {
    return <Loading />;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planes de Préstamo</h1>
          <p className="text-muted-foreground">
            Define y administra los diferentes tipos de préstamos que ofreces.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/planes/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Definir Nuevo Plan
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loanPlans.map((plan) => (
          <Card key={plan.id} className={cn(plan.isDefault && "ring-2 ring-emerald-500/80 border-emerald-500/40")}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{plan.name}</CardTitle>
                {plan.isDefault && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-black text-[10px] tracking-wider uppercase px-2 py-0.5 shadow-sm flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Predeterminado
                  </Badge>
                )}
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abono Semanal (por cada $1,000):</span>
                  <span>{formatCurrency(plan.weeklyPaymentRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plazo:</span>
                  <span>{plan.termInWeeks} semanas</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/dashboard/planes/${plan.id}/edit`}>Editar Plan</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
         {loanPlans.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="flex flex-col items-center justify-center h-48">
              <p className="text-muted-foreground">No hay planes de préstamo definidos.</p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/planes/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Crea tu primer plan
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
