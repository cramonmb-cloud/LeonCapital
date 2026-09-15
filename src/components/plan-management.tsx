'use client';

import { useState } from 'react';
import type { LoanPlan } from '@/lib/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Edit, FileText, LayoutGrid, Star, CheckCircle2, BookmarkCheck, Loader2 } from 'lucide-react';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { PlanForm } from './plan-form';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { setDefaultLoanPlanAction } from '@/app/dashboard/planes/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PlanManagementProps {
    initialLoanPlans: LoanPlan[];
}

export function PlanManagement({ initialLoanPlans }: PlanManagementProps) {
    const { data } = useRealtimeData(undefined, {
        enabledCollections: ['loanPlans']
    });
    const { toast } = useToast();
    const [selectedPlan, setSelectedPlan] = useState<LoanPlan | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

    const loanPlans = data?.loanPlans ?? initialLoanPlans;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
        }).format(amount);
    };

    const handleCreateNew = () => {
        setSelectedPlan(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (plan: LoanPlan) => {
        setSelectedPlan(plan);
        setIsDialogOpen(true);
    };

    const handleSetDefault = async (planId: string, planName: string) => {
        setSettingDefaultId(planId);
        try {
            const res = await setDefaultLoanPlanAction(planId);
            if (res.success) {
                toast({
                    title: 'Plan Predeterminado Asignado',
                    description: `El plan "${planName}" se seleccionará en automático al crear nuevos préstamos.`,
                });
            } else {
                throw new Error(res.message);
            }
        } catch (error: any) {
            toast({
                title: 'Error al cambiar plan',
                description: error.message || 'No se pudo actualizar el plan predeterminado.',
                variant: 'destructive',
            });
        } finally {
            setSettingDefaultId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Catálogo de Planes</h2>
                    <p className="text-muted-foreground">Define las condiciones de tus productos financieros y elige cuál será el predeterminado al crear préstamos.</p>
                </div>
                <Button onClick={handleCreateNew}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nuevo Plan
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {loanPlans.map((plan) => {
                    const isDefault = Boolean(plan.isDefault);
                    return (
                        <Card 
                            key={plan.id} 
                            className={cn(
                                "shadow-md hover:shadow-lg transition-all border-primary/10 relative overflow-hidden",
                                isDefault && "ring-2 ring-emerald-500/80 border-emerald-500/40 shadow-emerald-500/10"
                            )}
                        >
                            <CardHeader className={cn(
                                "border-b mb-4 transition-colors",
                                isDefault ? "bg-emerald-50/70 dark:bg-emerald-950/25" : "bg-primary/5"
                            )}>
                                <CardTitle className="text-lg uppercase flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <FileText className={cn("h-4 w-4", isDefault ? "text-emerald-600" : "text-primary")} /> 
                                        <span>{plan.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {isDefault && (
                                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-black text-[10px] tracking-wider uppercase px-2 py-0.5 shadow-sm flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" /> Predeterminado
                                            </Badge>
                                        )}
                                        {plan.highlight && <Star className="h-4 w-4 fill-amber-400 text-amber-500" />}
                                    </div>
                                </CardTitle>
                                <CardDescription className="line-clamp-2 min-h-[2.5rem] uppercase text-xs">{plan.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground font-bold text-[10px] uppercase">Abono Semanal</p>
                                        <p className={cn("font-bold text-lg", isDefault ? "text-emerald-600 dark:text-emerald-400" : "text-primary")}>
                                            {formatCurrency(plan.weeklyPaymentRate)}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">POR CADA $1,000</p>
                                    </div>
                                    <div className="space-y-1 border-l pl-4">
                                        <p className="text-muted-foreground font-bold text-[10px] uppercase">Plazo Total</p>
                                        <p className="font-bold text-lg">{plan.termInWeeks} Semanas</p>
                                        <p className="text-[10px] text-muted-foreground">DURACIÓN BASE</p>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-2 flex flex-col gap-2">
                                {isDefault ? (
                                    <div className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                        <CheckCircle2 className="h-4 w-4" /> Plan Predeterminado Actual
                                    </div>
                                ) : (
                                    <Button 
                                        variant="ghost" 
                                        size="sm"
                                        disabled={settingDefaultId === plan.id}
                                        onClick={() => handleSetDefault(plan.id, plan.name)}
                                        className="w-full font-bold uppercase text-[11px] h-8 text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-dashed border-border/80"
                                    >
                                        {settingDefaultId === plan.id ? (
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <BookmarkCheck className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                        Hacer Predeterminado
                                    </Button>
                                )}
                                <Button variant="outline" className="w-full font-bold uppercase text-xs h-9" onClick={() => handleEdit(plan)}>
                                    <Edit className="mr-2 h-3.5 w-3.5" /> Editar Condiciones
                                </Button>
                            </CardFooter>
                        </Card>
                    );
                })}
                {loanPlans.length === 0 && (
                    <Card className="col-span-full border-dashed border-2 bg-muted/30">
                        <CardContent className="flex flex-col items-center justify-center h-48">
                            <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                            <p className="text-muted-foreground font-medium">No hay planes definidos en el sistema.</p>
                            <Button variant="link" onClick={handleCreateNew}>Crea tu primer plan ahora</Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold uppercase">
                            {selectedPlan ? `Editar: ${selectedPlan.name}` : 'Definir Nuevo Plan Financiero'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <PlanForm plan={selectedPlan || undefined} />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
