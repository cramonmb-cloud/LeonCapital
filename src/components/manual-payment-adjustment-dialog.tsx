'use client';

import { useState, useEffect } from 'react';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Loan, AppConfig } from '@/lib/types';
import { Loader2, ShieldCheck, AlertCircle, CheckCircle2, XCircle, ArrowUpRight, Check, RotateCcw, RotateCw, CalendarX2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { manualAdjustPaymentAction } from '@/app/inicio/actions';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { getExtraWeekThreshold, cn } from '@/lib/utils';
import { RemoveExtraWeekDialog } from './remove-extra-week-dialog';

const formSchema = z.object({
  tag: z.enum(['pagado', 'recuperado', 'asumido', 'falla', 'adelanto', 'limpiar']),
  amountPaid: z.string()
    .min(1, 'El monto es obligatorio.')
    .refine((val) => {
      if (val === '0000000') return true;
      const num = Number(val);
      return !isNaN(num) && num >= 0;
    }, {
      message: 'El monto debe ser un número positivo o "0000000".'
    }),
  password: z.string().min(1, 'La contraseña de autorización es obligatoria.'),
});

type AdjustmentFormValues = z.infer<typeof formSchema>;

export type PaymentAdjustmentTag = 'pagado' | 'recuperado' | 'asumido' | 'falla' | 'adelanto' | 'limpiar';

interface ManualPaymentAdjustmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  weekNumber: number;
  currentAmount: number;
  currentTag?: PaymentAdjustmentTag;
  clientName?: string;
  appConfig?: AppConfig | null;
  onSuccess?: () => void;
}

const AUTH_PASSWORD = "Lacrimosa_12";

export function ManualPaymentAdjustmentDialog({
  isOpen,
  onOpenChange,
  loan,
  weekNumber,
  currentAmount,
  currentTag,
  clientName,
  appConfig,
  onSuccess,
}: ManualPaymentAdjustmentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoveExtraWeekOpen, setIsRemoveExtraWeekOpen] = useState(false);
  const { toast } = useToast();
  const { appUser } = useAuth();

  const getInitialTag = (): PaymentAdjustmentTag => {
    if (currentTag && ['pagado', 'recuperado', 'asumido', 'falla', 'adelanto', 'limpiar'].includes(currentTag)) {
      return currentTag;
    }
    const p = loan.payments?.find(pay => pay.weekNumber === weekNumber && !pay.isReverted);
    if (p) {
      if (p.isRecovered || p.paymentType === 'recovered') return 'recuperado';
      if (p.isAdvance || p.paymentType === 'adelanto_entrante') return 'adelanto';
      if (p.paymentType === 'assumed') return 'asumido';
      if (p.amount === 0) return 'falla';
      return 'pagado';
    }
    return 'pagado';
  };

  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tag: getInitialTag(),
      amountPaid: currentAmount !== null && currentAmount !== undefined ? currentAmount.toString() : '0',
      password: '',
    },
  });

  const selectedTag = form.watch('tag');

  useEffect(() => {
    if (isOpen) {
      const initialTag = getInitialTag();
      form.reset({
        tag: initialTag,
        amountPaid: currentAmount !== null && currentAmount !== undefined ? currentAmount.toString() : '0',
        password: '',
      });
    }
  }, [isOpen, currentAmount, currentTag, loan, weekNumber]);

  const handleSelectTag = (tag: PaymentAdjustmentTag) => {
    form.setValue('tag', tag);
    if (tag === 'falla' || tag === 'limpiar') {
      form.setValue('amountPaid', '0');
    } else if (form.getValues('amountPaid') === '0' && currentAmount > 0) {
      form.setValue('amountPaid', currentAmount.toString());
    }
  };

  const onSubmit = async (values: AdjustmentFormValues) => {
    if (values.password !== AUTH_PASSWORD) {
      form.setError('password', { message: 'Contraseña de autorización incorrecta.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const isDeletion = values.tag === 'limpiar' || values.amountPaid === '0000000';
      const numericAmount = isDeletion ? -1 : parseFloat(values.amountPaid);

      const result = await manualAdjustPaymentAction(
        loan.id, 
        weekNumber, 
        values.tag, 
        numericAmount, 
        appUser?.id
      );

      if (result.success) {
        toast({
          title: values.tag === 'limpiar'
            ? 'Abono Limpiado'
            : isDeletion 
              ? 'Ajuste Realizado (Eliminación)' 
              : 'Ajuste Realizado',
          description: values.tag === 'limpiar'
            ? `Se ha limpiado el abono de la semana ${weekNumber}, dejándolo disponible como nuevo para registro posterior.`
            : isDeletion
              ? `Se ha eliminado el abono de la semana ${weekNumber} y restablecido su estado.`
              : `El abono de la semana ${weekNumber} ha sido procesado como ${values.tag.toUpperCase()} por ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Math.max(0, numericAmount))}.`,
        });
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Ajustar',
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[430px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Registro / Ajuste Manual
              </DialogTitle>
              <DialogDescription className="text-xs">
                Ajustando abono de la <strong>Semana {weekNumber}</strong>. Puedes etiquetarlo libremente como Pagado, Recuperado, Adelanto, Asumido o Falla.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Selector de Etiquetas */}
              <div className="space-y-1.5">
                <FormLabel className="font-bold text-xs uppercase text-zinc-700 dark:text-zinc-300">
                  Etiqueta del Abono
                </FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectTag('pagado')}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-left",
                      selectedTag === 'pagado'
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <CheckCircle2 className={cn("h-4 w-4 shrink-0", selectedTag === 'pagado' ? "text-emerald-600" : "text-zinc-400")} />
                    <div className="flex flex-col">
                      <span>Pagado</span>
                      <span className="text-[10px] font-normal text-muted-foreground">Abono regular</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTag('recuperado')}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-left",
                      selectedTag === 'recuperado'
                        ? "border-purple-600 bg-purple-50 text-purple-900 shadow-sm dark:bg-purple-950/40 dark:text-purple-200"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <RotateCw className={cn("h-4 w-4 shrink-0 font-bold", selectedTag === 'recuperado' ? "text-purple-600" : "text-zinc-400")} />
                    <div className="flex flex-col">
                      <span>Recuperado</span>
                      <span className="text-[10px] font-normal text-muted-foreground">Abono recuperado</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTag('adelanto')}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-left",
                      selectedTag === 'adelanto'
                        ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm dark:bg-blue-950/40 dark:text-blue-200"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <ArrowUpRight className={cn("h-4 w-4 shrink-0 font-bold", selectedTag === 'adelanto' ? "text-blue-600" : "text-zinc-400")} />
                    <div className="flex flex-col">
                      <span>Adelanto</span>
                      <span className="text-[10px] font-normal text-muted-foreground">Abono saliente</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTag('asumido')}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-left",
                      selectedTag === 'asumido'
                        ? "border-sky-500 bg-sky-50 text-sky-900 shadow-sm dark:bg-sky-950/40 dark:text-sky-200"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <Check className={cn("h-4 w-4 shrink-0 font-bold", selectedTag === 'asumido' ? "text-sky-600" : "text-zinc-400")} />
                    <div className="flex flex-col">
                      <span>Asumido</span>
                      <span className="text-[10px] font-normal text-muted-foreground">Cubierto por promotora</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTag('falla')}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-left",
                      selectedTag === 'falla'
                        ? "border-rose-500 bg-rose-50 text-rose-900 shadow-sm dark:bg-rose-950/40 dark:text-rose-200"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <XCircle className={cn("h-4 w-4 shrink-0", selectedTag === 'falla' ? "text-rose-600" : "text-zinc-400")} />
                    <div className="flex flex-col">
                      <span>Falla</span>
                      <span className="text-[10px] font-normal text-muted-foreground">Semana no cubierta ($0)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTag('limpiar')}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-left",
                      selectedTag === 'limpiar'
                        ? "border-amber-500 bg-amber-50 text-amber-900 shadow-sm dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <RotateCcw className={cn("h-4 w-4 shrink-0 font-bold", selectedTag === 'limpiar' ? "text-amber-600" : "text-zinc-400")} />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1">
                        <span>Limpiar</span>
                        <span className="text-[8px] px-1 py-0.2 bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 rounded font-bold">
                          Nuevo
                        </span>
                      </div>
                      <span className="text-[10px] font-normal text-muted-foreground">Dejar disponible ($0)</span>
                    </div>
                  </button>
                </div>
              </div>

              <FormField
                control={form.control}
                name="amountPaid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-xs uppercase">Importe Recibido ($)</FormLabel>
                    <FormControl>
                      <Input 
                        type="text" 
                        {...field} 
                        disabled={selectedTag === 'falla' || selectedTag === 'limpiar'}
                        className="h-10 border-2 focus:ring-primary font-bold" 
                      />
                    </FormControl>
                    {selectedTag === 'limpiar' ? (
                      <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-2 rounded-md mt-1">
                        Esta semana se desmarcará y quedará como <strong>Pendiente / Limpio</strong>, disponible para registrar un abono en el futuro.
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Tip: Selecciona <strong>"Limpiar / Pendiente"</strong> arriba o escribe <strong>"0000000"</strong> para restablecer el abono por completo.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-xs uppercase text-destructive">Contraseña de Autorización</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="h-10 border-2 border-destructive/20 focus:ring-destructive font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {loan.hasPenalty && !loan.extraWeekWaived && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 flex items-center justify-between gap-2 dark:bg-rose-950/30 dark:border-rose-900/50">
                <div className="flex items-center gap-2">
                  <CalendarX2 className="h-4 w-4 text-rose-600 shrink-0" />
                  <div>
                    <p className="text-[11px] font-bold text-rose-900 dark:text-rose-200 leading-tight">Semana Extra Activa</p>
                    <p className="text-[9px] text-rose-700 dark:text-rose-400">¿Deseas retirar la penalización a este préstamo?</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsRemoveExtraWeekOpen(true)}
                  className="h-7 text-[10px] font-bold px-2.5 shrink-0 bg-rose-600 hover:bg-rose-700"
                >
                  Eliminar Semana Extra
                </Button>
              </div>
            )}

            <Alert className="bg-amber-50 border-amber-200 py-2 dark:bg-amber-950/30 dark:border-amber-900/50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-200 font-bold text-xs">Aviso de Semana Extra</AlertTitle>
              <AlertDescription className="text-[10px] text-amber-700 dark:text-amber-300">
                Si el préstamo ya alcanzó el umbral de {getExtraWeekThreshold(appConfig)} fallo(s), la semana extra se mantendrá como penalización. Si se marca como Adelanto, impactará como abono saliente en Debe.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} size="sm" className="font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Autorizar y Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>

        <RemoveExtraWeekDialog
          isOpen={isRemoveExtraWeekOpen}
          onOpenChange={setIsRemoveExtraWeekOpen}
          loan={loan}
          clientName={clientName}
          onSuccess={() => {
            onOpenChange(false);
            if (onSuccess) onSuccess();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
