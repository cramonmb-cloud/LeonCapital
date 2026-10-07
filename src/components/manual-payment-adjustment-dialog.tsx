
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
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { registerPaymentAction } from '@/app/dashboard/actions';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { getExtraWeekThreshold } from '@/lib/utils';

const formSchema = z.object({
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

interface ManualPaymentAdjustmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  weekNumber: number;
  currentAmount: number;
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
  appConfig,
  onSuccess,
}: ManualPaymentAdjustmentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { appUser } = useAuth();

  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amountPaid: currentAmount !== null && currentAmount !== undefined ? currentAmount.toString() : '0',
      password: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        amountPaid: currentAmount !== null && currentAmount !== undefined ? currentAmount.toString() : '0',
        password: '',
      });
    }
  }, [isOpen, currentAmount, form]);

  const onSubmit = async (values: AdjustmentFormValues) => {
    if (values.password !== AUTH_PASSWORD) {
      form.setError('password', { message: 'Contraseña de autorización incorrecta.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const isDeletion = values.amountPaid === '0000000';
      const numericAmount = isDeletion ? -1 : parseFloat(values.amountPaid);

      // Usamos registerPaymentAction ya que maneja la lógica de añadir/sobrescribir el pago de una semana específica
      // y recalcula automáticamente si el préstamo debe ir a semana extra basándose en el conteo total de fallos.
      const result = await registerPaymentAction(
        loan.id, 
        new Date(loan.startDate), // La fecha exacta no importa tanto para la corrección, sino el weekNumber
        numericAmount, 
        weekNumber, 
        appUser?.id
      );

      if (result.success) {
        toast({
          title: isDeletion ? 'Ajuste Realizado (Eliminación)' : 'Ajuste Realizado',
          description: isDeletion
            ? `Se ha eliminado el abono de la semana ${weekNumber} y restablecido su estado.`
            : `El abono de la semana ${weekNumber} ha sido procesado por ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numericAmount)}.`,
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
      <DialogContent className="sm:max-w-[400px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Registro / Ajuste Manual
              </DialogTitle>
              <DialogDescription>
                Estás procesando el abono de la <strong>Semana {weekNumber}</strong>. 
                El sistema recalculará automáticamente la deuda y la penalización de semana extra.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
                <FormField
                control={form.control}
                name="amountPaid"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="font-bold text-xs uppercase">Importe Recibido ($)</FormLabel>
                    <FormControl>
                        <Input type="text" {...field} className="h-11 border-2 focus:ring-primary font-bold" />
                    </FormControl>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Tip: Escribe <strong>"0000000"</strong> (7 ceros) para eliminar este abono por completo, limpiar la fecha y recalcular.
                    </p>
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
                        <Input type="password" placeholder="••••••••" {...field} className="h-11 border-2 border-destructive/20 focus:ring-destructive" />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>

            <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 font-bold text-xs">Aviso de Semana Extra</AlertTitle>
                <AlertDescription className="text-[10px] text-amber-700">
                    Si el préstamo ya alcanzó el umbral de {getExtraWeekThreshold(appConfig)} fallo(s) (o cuenta con pagos recuperados), la semana extra se mantendrá de forma permanente como penalización y deberá ser liquidada.
                </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Autorizar y Recalcular
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
