'use client';

import { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Loan, LoanPlan, Plaza, Localidad, Promotora } from '@/lib/types';
import { 
  Loader2, 
  Trash2, 
  ShieldAlert, 
  KeyRound, 
  Coins, 
  MapPin, 
  Calendar, 
  Calculator,
  Lock,
  Save
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateLoanAction, deleteLoanAction } from '@/app/dashboard/actions';
import { useAuth } from '@/hooks/use-auth';
import { cn, getSaturdayOfWeek } from '@/lib/utils';

const formSchema = z.object({
  loanPlanId: z.string().min(1, 'Debes seleccionar un plan.'),
  amount: z.coerce.number().min(1, 'El monto debe ser mayor a 0.'),
  startDate: z.string().min(1, 'Debes seleccionar una fecha de inicio.'),
  promotoraId: z.string().min(1, 'Debes seleccionar una promotora.'),
  status: z.enum(['Active', 'Overdue', 'Paid Off', 'Pagado desde CV']),
});

type EditLoanFormValues = z.infer<typeof formSchema>;

interface EditLoanDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  loanPlans: LoanPlan[];
  allLoanWeeks: string[];
  plazas: Plaza[];
  localidades: Localidad[];
  promotoras: Promotora[];
}

const DELETE_AUTH_CODE = "012004";

export function EditLoanDialog({
  isOpen,
  onOpenChange,
  loan,
  loanPlans,
  allLoanWeeks,
  plazas,
  localidades,
  promotoras,
}: EditLoanDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteAuthCode, setDeleteAuthCode] = useState('');
  const { toast } = useToast();
  const { appUser } = useAuth();

  const [selectedPlaza, setSelectedPlaza] = useState('');
  const [selectedLocalidad, setSelectedLocalidad] = useState('');

  const isPaid = loan?.status === 'Paid Off' || loan?.status === 'Pagado desde CV';
  const isCristobal = useMemo(() => appUser?.username?.toUpperCase() === 'CRISTOBAL', [appUser]);

  const form = useForm<EditLoanFormValues>({
    resolver: zodResolver(formSchema),
  });

  const watchedPlanId = form.watch('loanPlanId');
  const watchedAmount = form.watch('amount');

  useEffect(() => {
    if (loan && isOpen) {
      const saturdayOfLoan = getSaturdayOfWeek(loan.startDate).toISOString();
      const currentPromotora = promotoras.find(p => p.id === loan.promotoraId);
      const currentLocalidad = localidades.find(l => l.id === currentPromotora?.localidadId);
      const currentPlaza = plazas.find(p => p.id === currentLocalidad?.plazaId);

      setSelectedPlaza(currentPlaza?.id || '');
      setSelectedLocalidad(currentLocalidad?.id || '');

      form.reset({
        loanPlanId: loan.loanPlanId,
        amount: loan.amount,
        startDate: saturdayOfLoan,
        promotoraId: loan.promotoraId || '',
        status: loan.status,
      });
      setDeleteAuthCode('');
    }
  }, [loan, isOpen, form, promotoras, localidades, plazas]);

  const sortedPlazas = useMemo(() => [...plazas].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [plazas]);
  
  const filteredLocalidades = useMemo(() => {
    if (!selectedPlaza) return [];
    return localidades
      .filter(l => l.plazaId === selectedPlaza)
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [selectedPlaza, localidades]);

  const filteredPromotoras = useMemo(() => {
    if (!selectedLocalidad) return [];
    return promotoras
      .filter(p => p.localidadId === selectedLocalidad)
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [selectedLocalidad, promotoras]);

  const sortedLoanPlans = useMemo(() => [...loanPlans].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [loanPlans]);

  useEffect(() => {
    if (filteredLocalidades.length > 0 && !filteredLocalidades.find(l => l.id === selectedLocalidad)) {
        setSelectedLocalidad('');
        form.setValue('promotoraId', '');
    }
  }, [selectedPlaza, filteredLocalidades, selectedLocalidad, form]);

  useEffect(() => {
    const currentPromotoraId = form.getValues('promotoraId');
    if (filteredPromotoras.length > 0 && !filteredPromotoras.find(p => p.id === currentPromotoraId)) {
        form.setValue('promotoraId', '');
    }
  }, [selectedLocalidad, filteredPromotoras, form]);

  const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      const userTimezoneOffset = date.getTimezoneOffset() * 60000;
      const correctedDate = new Date(date.getTime() + userTimezoneOffset);
      return correctedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  // Cálculo de proyecciones según plan actual
  const activePlan = useMemo(() => loanPlans.find(p => p.id === watchedPlanId), [loanPlans, watchedPlanId]);
  const estimatedWeeklyPayment = useMemo(() => {
    if (!activePlan || !watchedAmount) return 0;
    return (watchedAmount / 1000) * activePlan.weeklyPaymentRate;
  }, [activePlan, watchedAmount]);
  const estimatedTotal = useMemo(() => {
    if (!activePlan) return 0;
    return estimatedWeeklyPayment * activePlan.termInWeeks;
  }, [activePlan, estimatedWeeklyPayment]);

  const onSubmit = async (values: EditLoanFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await updateLoanAction(loan.id, values);

      if (result.success) {
        toast({
          title: 'Préstamo Actualizado',
          description: 'Los cambios se han guardado correctamente.',
        });
        onOpenChange(false);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Actualizar',
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isPaid && deleteAuthCode !== DELETE_AUTH_CODE) {
        toast({ variant: 'destructive', title: 'Error de Autorización', description: 'El código de autorización es incorrecto.' });
        return;
    }

    setIsDeleting(true);
    try {
        const result = await deleteLoanAction(loan.id);
        if (result.success) {
            toast({ title: 'Préstamo Eliminado', description: result.message });
            onOpenChange(false);
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: Loan['status']) => {
    switch (status) {
      case 'Active':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold uppercase">Activo</Badge>;
      case 'Overdue':
        return <Badge variant="destructive" className="text-[10px] font-bold uppercase">Vencido</Badge>;
      case 'Paid Off':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold uppercase">Pagado</Badge>;
      case 'Pagado desde CV':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-bold uppercase">Pagado desde CV</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] font-bold uppercase">{status}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden rounded-2xl border-zinc-200 dark:border-zinc-800">
        {/* Header Compacto y Ejecutivo */}
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <DialogTitle className="text-sm sm:text-base font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-100">
                  Gestionar Préstamo
                </DialogTitle>
                {getStatusBadge(loan?.status)}
              </div>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2">
                <span>Iniciado: <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{formatDate(loan?.startDate)}</strong></span>
                <span>•</span>
                <span>Monto original: <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{formatCurrency(loan?.amount)}</strong></span>
              </DialogDescription>
            </div>

            {isPaid && (
              <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-bold uppercase gap-1 shrink-0 self-start sm:self-auto py-1">
                <Lock className="h-3 w-3" />
                Préstamo Liquidado (Condiciones fijas)
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 sm:p-5 space-y-4">
            {/* GRID PRINCIPAL: 2 COLUMNAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* COLUMNA 1: CONDICIONES FINANCIERAS */}
              <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-900/30 p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 pb-1 border-b border-zinc-100 dark:border-zinc-800">
                  <Coins className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Condiciones del Crédito
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="loanPlanId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                          Plan de Préstamo
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isPaid}>
                          <FormControl>
                            <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-zinc-900">
                              <SelectValue placeholder="Selecciona un plan" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sortedLoanPlans.map((plan) => (
                              <SelectItem key={plan.id} value={plan.id} className="text-xs">
                                {plan.name} ({plan.termInWeeks} semanas)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                          Monto Prestado
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span>
                            <Input 
                              type="number" 
                              {...field} 
                              disabled={isPaid}
                              className="h-8 pl-6 text-xs font-bold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900" 
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          Fecha (Semana)
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isPaid}>
                          <FormControl>
                            <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-zinc-900">
                              <SelectValue placeholder="Semana" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allLoanWeeks.map((week) => (
                              <SelectItem key={week} value={week} className="text-xs">
                                {formatDate(week)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                        Estado del Préstamo
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-zinc-900">
                            <SelectValue placeholder="Selecciona un estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Active" className="text-xs text-emerald-700 font-semibold">Activo</SelectItem>
                          <SelectItem value="Overdue" className="text-xs text-red-700 font-semibold">Vencido</SelectItem>
                          <SelectItem value="Paid Off" className="text-xs text-blue-700 font-semibold">Pagado</SelectItem>
                          <SelectItem value="Pagado desde CV" className="text-xs text-purple-700 font-semibold">Pagado desde CV</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>

              {/* COLUMNA 2: ASIGNACIÓN OPERATIVA Y RESUMEN */}
              <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-900/30 p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 pb-1 border-b border-zinc-100 dark:border-zinc-800">
                  <MapPin className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Asignación y Ubicación
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <FormItem>
                      <FormLabel className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                        Plaza
                      </FormLabel>
                      <Select onValueChange={setSelectedPlaza} value={selectedPlaza} disabled={isPaid}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-zinc-900">
                            <SelectValue placeholder="Plaza" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedPlazas.map((plaza) => (
                            <SelectItem key={plaza.id} value={plaza.id} className="text-xs">
                              {plaza.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>

                    <FormItem>
                      <FormLabel className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                        Localidad
                      </FormLabel>
                      <Select onValueChange={setSelectedLocalidad} value={selectedLocalidad} disabled={!selectedPlaza || isPaid}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-zinc-900">
                            <SelectValue placeholder="Localidad" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredLocalidades.map((localidad) => (
                            <SelectItem key={localidad.id} value={localidad.id} className="text-xs">
                              {localidad.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  </div>

                  <FormField
                    control={form.control}
                    name="promotoraId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                          Promotora Asignada
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!selectedLocalidad || isPaid}>
                          <FormControl>
                            <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-zinc-900">
                              <SelectValue placeholder="Selecciona una promotora" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredPromotoras.map((promotora) => (
                              <SelectItem key={promotora.id} value={promotora.id} className="text-xs font-medium">
                                {promotora.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />

                  {/* Micro-tarjeta de Resumen Financiero Calculado */}
                  <div className="bg-white dark:bg-zinc-900/90 rounded-lg p-2.5 border border-zinc-200 dark:border-zinc-800 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground flex items-center gap-1 font-medium">
                        <Calculator className="h-3 w-3 text-indigo-500" /> Abono Semanal:
                      </span>
                      <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                        {formatCurrency(estimatedWeeklyPayment)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-medium">Plazo del Plan:</span>
                      <strong className="text-zinc-800 dark:text-zinc-200">
                        {activePlan?.termInWeeks || 0} semanas
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-0.5 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-muted-foreground font-medium">Cobro Total Proyectado:</span>
                      <strong className="text-zinc-900 dark:text-zinc-100 font-bold">
                        {formatCurrency(estimatedTotal)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ZONA DE AUTORIZACIÓN / ELIMINACIÓN (CRISTOBAL) */}
            {isCristobal && (
              <div className={cn(
                "rounded-xl border p-3 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3",
                isPaid ? "bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40" : "bg-destructive/5 border-destructive/20"
              )}>
                <div className="space-y-0.5 min-w-0">
                  <h4 className={cn("text-xs font-black uppercase flex items-center gap-1.5", isPaid ? "text-amber-800 dark:text-amber-300" : "text-destructive")}>
                    {isPaid ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> : <Trash2 className="h-3.5 w-3.5 shrink-0" />}
                    {isPaid ? 'Eliminación con Autorización' : 'Eliminar Préstamo (Cristobal)'}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    {isPaid 
                      ? 'Préstamo liquidado: requiere el código de autorización para borrado permanente.' 
                      : 'Elimina este préstamo y revierte los abonos correspondientes de la cartera.'}
                  </p>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="sm" 
                      className="h-8 text-[11px] font-bold px-3 shrink-0 gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-xl max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-base font-black uppercase tracking-tight">
                        ¿Eliminar préstamo definitivamente?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-xs text-muted-foreground">
                        Esta acción revertirá los pagos registrados del saldo de la cartera y borrará este registro permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    {isPaid && (
                      <div className="py-2 space-y-2">
                        <Label htmlFor="authCode" className="font-bold text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5" /> Ingresa el Código de Autorización
                        </Label>
                        <Input 
                          id="authCode"
                          type="password"
                          placeholder="Código de seguridad"
                          value={deleteAuthCode}
                          onChange={(e) => setDeleteAuthCode(e.target.value)}
                          className="h-10 border-amber-300 font-mono text-center tracking-widest text-base"
                        />
                      </div>
                    )}

                    <AlertDialogFooter className="gap-2 pt-2">
                      <AlertDialogCancel className="text-xs font-semibold h-8">Cancelar</AlertDialogCancel>
                      <Button 
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete} 
                        disabled={isDeleting || (isPaid && !deleteAuthCode)}
                        className="text-xs font-bold h-8"
                      >
                        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmar Eliminación"}
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* FOOTER DEL MODAL */}
            <DialogFooter className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting || isDeleting}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                size="sm"
                className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs gap-1.5 px-4"
                disabled={isSubmitting || isDeleting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
