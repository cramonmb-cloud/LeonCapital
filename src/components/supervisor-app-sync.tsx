'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { CloudDownload, Loader2, KeyRound, CalendarDays, CheckCircle2, ShieldCheck, Database, Info, Landmark, Route, MapPin, Building, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { syncWithSupervisorAppAction } from '@/app/dashboard/ajustes/actions';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { getSaturdayOfWeek, getMexicoNow } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import type { Plaza, Localidad, Promotora, LoanPlan } from '@/lib/types';

const syncSchema = z.object({
  apiKey: z.string().min(5, 'La llave de acceso es demasiado corta.'),
  weekId: z.string().min(1, 'El ID de la semana es obligatorio.'),
  // Asignación
  plazaId: z.string().min(1, 'Selecciona una plaza.'),
  localidadId: z.string().min(1, 'Selecciona una localidad.'),
  promotoraId: z.string().min(1, 'Selecciona una promotora.'),
  loanPlanId: z.string().min(1, 'Selecciona un plan.'),
  startDate: z.string().min(1, 'Selecciona una fecha de inicio.'),
});

type SyncFormValues = z.infer<typeof syncSchema>;

interface SupervisorAppSyncProps {
    plazas: Plaza[];
    localidades: Localidad[];
    promotoras: Promotora[];
    loanPlans: LoanPlan[];
}

export function SupervisorAppSync({ plazas, localidades, promotoras, loanPlans }: SupervisorAppSyncProps) {
    const [isSyncing, setIsSyncing] = useState(false);
    const { toast } = useToast();

    const upcomingSaturdays = useMemo(() => {
        const dates = [];
        const base = getSaturdayOfWeek(getMexicoNow());
        for (let i = -2; i < 4; i++) {
            const d = new Date(base);
            d.setDate(base.getDate() + (i * 7));
            dates.push(d.toISOString());
        }
        return dates;
    }, []);

    const form = useForm<SyncFormValues>({
        resolver: zodResolver(syncSchema),
        defaultValues: {
            apiKey: '',
            weekId: '',
            plazaId: '',
            localidadId: '',
            promotoraId: '',
            loanPlanId: '',
            startDate: upcomingSaturdays[2], // Default to current Saturday
        },
    });

    const selectedPlazaId = form.watch('plazaId');
    const selectedLocalidadId = form.watch('localidadId');

    const filteredLocalidades = useMemo(() => 
        localidades.filter(l => l.plazaId === selectedPlazaId).sort((a,b) => (a?.name || '').localeCompare(b?.name || '')),
    [localidades, selectedPlazaId]);

    const filteredPromotoras = useMemo(() => 
        promotoras.filter(p => p.localidadId === selectedLocalidadId).sort((a,b) => (a?.name || '').localeCompare(b?.name || '')),
    [promotoras, selectedLocalidadId]);

    const onSyncSubmit = async (values: SyncFormValues) => {
        setIsSyncing(true);
        try {
            const result = await syncWithSupervisorAppAction(
                values.weekId, 
                values.apiKey,
                values.promotoraId,
                values.loanPlanId,
                values.startDate
            );
            if (result.success) {
                toast({
                    title: 'Sincronización Exitosa',
                    description: result.message,
                });
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error de Integración',
                description: error.message,
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    return (
        <div className="max-w-5xl space-y-6">
            <Card className="shadow-lg border-blue-200 overflow-hidden">
                <CardHeader className="bg-blue-600 text-white pb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                            <CloudDownload className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-black uppercase tracking-tight">Sincronizar con SUPERvisorApp</CardTitle>
                            <CardDescription className="text-blue-100 font-medium">Importación masiva con auto-asignación de préstamos.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-8 space-y-8">
                    <Alert className="bg-blue-50 border-blue-100 text-blue-800">
                        <ShieldCheck className="h-5 w-5 text-blue-600" />
                        <AlertTitle className="font-bold">Conexión Segura</AlertTitle>
                        <AlertDescription className="text-xs">
                            Define a dónde y cómo se asignarán los nuevos clientes antes de iniciar la descarga. 
                            <strong> Nota: El monto del préstamo se tomará automáticamente de la API externa (campo creditAmount).</strong>
                        </AlertDescription>
                    </Alert>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSyncSubmit)} className="space-y-10">
                            {/* Sección 1: Conexión API */}
                            <div className="space-y-6">
                                <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 border-b pb-2">1. Credenciales de Acceso</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="apiKey"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold uppercase text-[10px]">Llave de Acceso (X-API-KEY)</FormLabel>
                                            <FormControl>
                                                <Input type="password" placeholder="Ingresa tu token secreto" className="h-11 rounded-xl" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="weekId"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold uppercase text-[10px]">ID de la Semana (API)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ej: W-1777701600000-..." className="h-11 rounded-xl font-bold text-center" {...field} />
                                            </FormControl>
                                            <FormDescription className="text-[9px]">Pega el ID largo proporcionado por el sistema externo.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Sección 2: Asignación Operativa */}
                            <div className="space-y-6">
                                <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 border-b pb-2">2. Asignación Operativa</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="plazaId"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold uppercase text-[10px] flex items-center gap-1.5"><Building className="h-3 w-3"/> Plaza</FormLabel>
                                            <Select onValueChange={(v) => { field.onChange(v); form.setValue('localidadId', ''); form.setValue('promotoraId', ''); }} value={field.value}>
                                                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Selecciona Plaza..." /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {plazas.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="localidadId"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold uppercase text-[10px] flex items-center gap-1.5"><MapPin className="h-3 w-3"/> Localidad</FormLabel>
                                            <Select onValueChange={(v) => { field.onChange(v); form.setValue('promotoraId', ''); }} value={field.value} disabled={!selectedPlazaId}>
                                                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Selecciona Localidad..." /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {filteredLocalidades.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="promotoraId"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold uppercase text-[10px] flex items-center gap-1.5"><Route className="h-3 w-3"/> Promotora</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value} disabled={!selectedLocalidadId}>
                                                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Selecciona Promotora..." /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {filteredPromotoras.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Sección 3: Condiciones Financieras */}
                            <div className="space-y-6">
                                <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 border-b pb-2">3. Condiciones del Préstamo</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="loanPlanId"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold uppercase text-[10px]">Plan de Pago</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Selecciona Plan..." /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {loanPlans.map(plan => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <div className="flex flex-col gap-2 p-3 bg-muted/30 border rounded-xl border-dashed">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="h-3 w-3 text-blue-600" />
                                            <span className="text-[10px] font-black uppercase text-muted-foreground">Monto del Préstamo</span>
                                        </div>
                                        <p className="text-xs font-bold text-blue-700 italic">Vinculado a "creditAmount" en la API</p>
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="startDate"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold uppercase text-[10px] flex items-center gap-1.5"><CalendarDays className="h-3 w-3"/> Semana de Inicio</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Selecciona Semana..." /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {upcomingSaturdays.map(iso => (
                                                        <SelectItem key={iso} value={iso}>{formatDate(iso)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription className="text-[9px]">Día en que el sistema abre la hoja.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="flex flex-col items-center gap-4">
                                <Button 
                                    type="submit" 
                                    size="lg" 
                                    disabled={isSyncing} 
                                    className="w-full md:w-auto h-16 px-20 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-2xl transition-all active:scale-95"
                                >
                                    {isSyncing ? <Loader2 className="mr-2 h-7 w-7 animate-spin" /> : <CloudDownload className="mr-2 h-7 w-7" />}
                                    {isSyncing ? 'IMPORTANDO Y ASIGNANDO...' : 'VINCULAR Y CREAR PRÉSTAMOS'}
                                </Button>
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest text-center max-w-md">
                                    Se crearán préstamos individuales con el monto específico de cada cliente según la API externa.
                                </p>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
