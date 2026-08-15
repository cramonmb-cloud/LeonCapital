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
import type { Loan, LoanPlan, Plaza, Localidad, Promotora } from '@/lib/types';
import { Loader2, Trash2, ShieldAlert, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateLoanAction, deleteLoanAction } from '@/app/dashboard/actions';
import { Separator } from './ui/separator';
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

  const isPaid = loan.status === 'Paid Off' || loan.status === 'Pagado desde CV';

  const form = useForm<EditLoanFormValues>({
    resolver: zodResolver(formSchema),
  });

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
      return correctedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
  };

  const onSubmit = async (values: EditLoanFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await updateLoanAction(loan.id, values);

      if (result.success) {
        toast({
          title: 'Préstamo Actualizado',
          description: 'Los datos del préstamo han sido actualizados.',
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestionar Préstamo</DialogTitle>
          <DialogDescription>
            {isPaid ? 'Este préstamo ya está liquidado. Puedes cambiar su estado o eliminarlo bajo autorización.' : 'Modifica los detalles del préstamo seleccionado.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <FormField
                control={form.control}
                name="loanPlanId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan de Préstamo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPaid}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un plan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sortedLoanPlans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} disabled={isPaid} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Inicio (Semana)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPaid}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una semana" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allLoanWeeks.map((week) => (
                          <SelectItem key={week} value={week}>
                            {formatDate(week)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado del Préstamo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un estado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">Activo</SelectItem>
                        <SelectItem value="Overdue">Vencido</SelectItem>
                        <SelectItem value="Paid Off">Pagado</SelectItem>
                        <SelectItem value="Pagado desde CV">Pagado desde CV</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Separator />
              <h3 className="text-md font-medium">Ubicación del Préstamo</h3>
               <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <FormItem>
                        <FormLabel>Plaza</FormLabel>
                        <Select onValueChange={setSelectedPlaza} value={selectedPlaza} disabled={isPaid}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona una plaza" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {sortedPlazas.map((plaza) => (
                                <SelectItem key={plaza.id} value={plaza.id}>
                                {plaza.name}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </FormItem>
                    <FormItem>
                        <FormLabel>Localidad</FormLabel>
                        <Select onValueChange={setSelectedLocalidad} value={selectedLocalidad} disabled={!selectedPlaza || isPaid}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona una localidad" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {filteredLocalidades.map((localidad) => (
                                <SelectItem key={localidad.id} value={localidad.id}>
                                {localidad.name}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </FormItem>
                    <FormField
                        control={form.control}
                        name="promotoraId"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Promotora</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!selectedLocalidad || isPaid}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una promotora" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {filteredPromotoras.map((promotora) => (
                                    <SelectItem key={promotora.id} value={promotora.id}>
                                    {promotora.name}
                                    </SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                </div>

                {appUser?.username === 'Cristobal' && (
                    <div className={cn(
                        "mt-6 rounded-lg border p-4 shadow-sm",
                        isPaid ? "bg-orange-50 border-orange-200" : "bg-destructive/5 border-destructive/20"
                    )}>
                        <h4 className={cn("text-sm font-black uppercase mb-1 flex items-center gap-2", isPaid ? "text-orange-700" : "text-destructive")}>
                            {isPaid ? <ShieldAlert className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                            {isPaid ? 'Autorización de Borrado' : 'Zona de Peligro'}
                        </h4>
                        <p className="text-[10px] font-bold text-muted-foreground mb-3 uppercase">
                            {isPaid 
                                ? 'Este préstamo ya está liquidado. Eliminarlo requiere un código de autorización y borrará el historial contable permanentemente.' 
                                : 'Eliminar este préstamo revertirá los abonos de la cartera y borrará todo su historial financiero.'}
                        </p>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button type="button" variant="destructive" size="sm" className="w-full font-black uppercase text-[10px] h-9">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar Préstamo
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-xl">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="font-black uppercase tracking-tight">¿Estás absolutamente seguro?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-xs font-bold uppercase text-muted-foreground">
                                        Esta acción eliminará el préstamo permanentemente y restará los abonos ya registrados del saldo de la cartera. Esta acción no se puede deshacer.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>

                                {isPaid && (
                                    <div className="py-4 space-y-3">
                                        <Label htmlFor="authCode" className="font-black text-[10px] uppercase text-orange-700 flex items-center gap-2">
                                            <KeyRound className="h-3.5 w-3.5" /> Código de Autorización Requerido
                                        </Label>
                                        <Input 
                                            id="authCode"
                                            type="password"
                                            placeholder="Ingresa el código..."
                                            value={deleteAuthCode}
                                            onChange={(e) => setDeleteAuthCode(e.target.value)}
                                            className="h-11 border-2 border-orange-200 focus:ring-orange-500 font-black text-center text-lg tracking-widest"
                                        />
                                    </div>
                                )}

                                <AlertDialogFooter className="gap-2">
                                    <AlertDialogCancel className="font-bold">Cancelar</AlertDialogCancel>
                                    <Button 
                                        variant="destructive"
                                        onClick={handleDelete} 
                                        disabled={isDeleting || (isPaid && !deleteAuthCode)}
                                        className="font-black uppercase"
                                    >
                                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sí, eliminar permanentemente"}
                                    </Button>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </div>
            <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting || isDeleting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Cambios
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
