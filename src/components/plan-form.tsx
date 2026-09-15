'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { LoanPlan } from '@/lib/types';
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
import { Trash, Loader2, BookmarkCheck } from 'lucide-react';
import { useState } from 'react';
import { deleteLoanPlanAction, saveLoanPlanAction } from '@/app/dashboard/planes/actions';

const formSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  description: z.string().min(1, 'La descripción es requerida.'),
  weeklyPaymentRate: z.coerce.number().min(0, 'El abono semanal no puede ser negativo.'),
  termInWeeks: z.coerce.number().int().min(1, 'El plazo debe ser de al menos 1 semana.'),
  highlight: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

type PlanFormValues = z.infer<typeof formSchema>;

interface PlanFormProps {
  plan?: LoanPlan;
}

export function PlanForm({ plan }: PlanFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: plan
      ? {
          name: plan.name,
          description: plan.description,
          weeklyPaymentRate: plan.weeklyPaymentRate,
          termInWeeks: plan.termInWeeks,
          highlight: plan.highlight || false,
          isDefault: plan.isDefault || false,
        }
      : {
          name: '',
          description: '',
          weeklyPaymentRate: 0,
          termInWeeks: 1,
          highlight: false,
          isDefault: false,
        },
  });

  async function onSubmit(values: PlanFormValues) {
    setIsSaving(true);
    try {
        const result = await saveLoanPlanAction(values, plan?.id);

        if (result.success) {
            toast({
                title: plan ? 'Plan actualizado' : 'Plan creado',
                description: result.message,
            });
            // Recargar la página de ajustes para ver los cambios
            router.refresh();
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({
            title: 'Error al guardar',
            description: error.message || 'No se pudo guardar el plan.',
            variant: 'destructive',
        });
    } finally {
        setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!plan) return;
    setIsDeleting(true);
    
    try {
      const result = await deleteLoanPlanAction(plan.id);
      if (result.success) {
        toast({
          title: 'Plan eliminado',
          description: `El plan "${plan.name}" ha sido eliminado correctamente.`,
        });
        router.refresh();
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
        toast({
          title: 'Error al eliminar',
          description: error.message || 'No se pudo eliminar el plan.',
          variant: 'destructive',
        });
    } finally {
        setIsDeleting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="border-0 shadow-none">
          <CardContent className="space-y-4 pt-0">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold uppercase text-xs">Nombre del Plan</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Plan Semanal Básico" {...field} className="uppercase" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold uppercase text-xs">Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Abonos fijos semanales durante 12 semanas"
                      {...field}
                      className="uppercase"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="weeklyPaymentRate"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="font-bold uppercase text-xs">Abono (POR CADA $1,000)</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="110" {...field} />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                        Tasa de pago semanal por cada $1,000 prestados.
                    </FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="termInWeeks"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="font-bold uppercase text-xs">Plazo (SEMANAS)</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="12" {...field} />
                    </FormControl>
                     <FormDescription className="text-[10px]">
                        El número total de semanas para el plan.
                    </FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <FormField
              control={form.control}
              name="highlight"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-2 space-y-0 py-1">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value || false}
                      onChange={field.onChange}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    />
                  </FormControl>
                  <FormLabel className="text-xs font-bold uppercase cursor-pointer select-none text-muted-foreground">Resaltar Préstamos con este Plan</FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-2.5 space-y-0 p-3 rounded-xl border border-primary/20 bg-primary/5">
                  <FormControl className="mt-0.5">
                    <input
                      type="checkbox"
                      checked={field.value || false}
                      onChange={field.onChange}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel className="text-xs font-bold uppercase cursor-pointer select-none text-foreground flex items-center gap-1.5">
                      <BookmarkCheck className="h-4 w-4 text-primary" />
                      Plan Predeterminado para Nuevos Préstamos
                    </FormLabel>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Se seleccionará automáticamente al crear un nuevo préstamo. Solo puede haber 1 plan predeterminado; al marcar este, cualquier otro dejará de serlo.
                    </p>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6 px-0">
            <div>
              {plan && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" type="button" size="sm">
                      <Trash className="mr-2 h-4 w-4" />
                      Eliminar Plan
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente el plan de préstamo y podría afectar reportes históricos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-white hover:bg-destructive/90">
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash className="mr-2 h-4 w-4" />}
                        Confirmar Eliminación
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <Button type="submit" disabled={isSaving} className="px-10 font-bold">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {plan ? 'Actualizar Plan' : 'Crear Plan Financiero'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
