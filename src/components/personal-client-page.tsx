'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import Loading from '@/app/dashboard/loading';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
} from '@/components/ui/alert-dialog';
import { 
    PlusCircle, 
    Loader2, 
    Trash2, 
    Edit, 
    Search, 
    User, 
    UserCheck, 
    Phone, 
    MapPin, 
    Calendar, 
    FileText, 
    CheckCircle2, 
    XCircle,
    Fingerprint,
    Building
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import type { Personal } from '@/lib/types';
import { savePersonalAction, deletePersonalAction } from '@/app/dashboard/personal/actions';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { MEXICAN_STATES, calculateCurpBase } from '@/lib/curp-helper';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';

const personalFormSchema = z.object({
  tipoPersonal: z.string().min(1, 'El puesto/tipo de personal es obligatorio.'),
  nombre: z.string().min(1, 'El nombre es obligatorio.').toUpperCase(),
  apellidoPaterno: z.string().min(1, 'El apellido paterno es obligatorio.').toUpperCase(),
  apellidoMaterno: z.string().default('').transform(val => val.toUpperCase()),
  domicilio: z.string().min(1, 'El domicilio es obligatorio.').toUpperCase(),
  colonia: z.string().min(1, 'La colonia es obligatoria.').toUpperCase(),
  codigoPostal: z.string().regex(/^\d{5}$/, 'El código postal debe tener exactamente 5 dígitos numéricos.'),
  celular: z.string().regex(/^\d{10}$/, 'El celular debe tener exactamente 10 dígitos numéricos.'),
  fechaNacimiento: z.string().min(1, 'La fecha de nacimiento es obligatoria.'),
  fechaIngreso: z.string().min(1, 'La fecha de ingreso es obligatoria.'),
  genero: z.enum(['H', 'M'], { required_error: 'El género es obligatorio.' }),
  estadoNacimiento: z.string().min(2, 'El estado de nacimiento es obligatorio.'),
  curp: z.string().min(16, 'La CURP debe tener al menos 16 caracteres.').max(18, 'La CURP no puede exceder 18 caracteres.').toUpperCase(),
  entregoDocumentacion: z.boolean().default(false),
  firmoDocumentacion: z.boolean().default(false),
});

type PersonalFormValues = z.infer<typeof personalFormSchema>;

export function PersonalClientPage() {
    const [personalList, setPersonalList] = useState<Personal[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedPuestoTab, setSelectedPuestoTab] = useState<string>('Todo');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Personal | null>(null);
    
    // Delete dialog state
    const [employeeToDelete, setEmployeeToDelete] = useState<Personal | null>(null);

    const { toast } = useToast();
    const router = useRouter();
    const { appUser } = useAuth();
    const { data: systemData } = useRealtimeData(undefined, {
        enabledCollections: ['config']
    });

    // Fetch custom staffTypes from config, fallback to default ones
    const staffTypes = useMemo(() => {
        return systemData?.config?.staffTypes || ['EJECUTIVO/A', 'SUPERVISOR/A', 'PROMOTOR/A'];
    }, [systemData]);

    // Setup form
    const form = useForm<PersonalFormValues>({
        resolver: zodResolver(personalFormSchema),
        defaultValues: {
            tipoPersonal: '',
            nombre: '',
            apellidoPaterno: '',
            apellidoMaterno: '',
            domicilio: '',
            colonia: '',
            codigoPostal: '',
            celular: '',
            fechaNacimiento: '',
            fechaIngreso: '',
            genero: 'H',
            estadoNacimiento: '',
            curp: '',
            entregoDocumentacion: false,
            firmoDocumentacion: false,
        }
    });

    const { watch, setValue } = form;

    const watchNombre = watch('nombre');
    const watchApellidoPaterno = watch('apellidoPaterno');
    const watchApellidoMaterno = watch('apellidoMaterno');
    const watchFechaNacimiento = watch('fechaNacimiento');
    const watchGenero = watch('genero');
    const watchEstadoNacimiento = watch('estadoNacimiento');
    const watchCurp = watch('curp') || '';

    // Subscribe to employee files in Firestore
    useEffect(() => {
        const q = collection(db, 'personal');
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Personal[];
            // Sort by creation or name
            list.sort((a, b) => `${a.nombre || ''} ${a.apellidoPaterno || ''}`.localeCompare(`${b.nombre || ''} ${b.apellidoPaterno || ''}`));
            setPersonalList(list);
            setLoading(false);
        }, (err) => {
            console.error("Error subscribing to personal:", err);
            toast({
                variant: 'destructive',
                title: 'Error de Lectura',
                description: 'No tienes los permisos necesarios para visualizar la lista de personal.'
            });
            setLoading(false);
        });
        return () => unsub();
    }, [toast]);

    // Reactive CURP recalculation
    useEffect(() => {
        if (
            watchNombre &&
            watchApellidoPaterno &&
            watchFechaNacimiento &&
            watchGenero &&
            watchEstadoNacimiento
        ) {
            const base16 = calculateCurpBase({
                nombre: watchNombre,
                apellidoPaterno: watchApellidoPaterno,
                apellidoMaterno: watchApellidoMaterno || '',
                fechaNacimiento: watchFechaNacimiento,
                genero: watchGenero,
                estadoNacimiento: watchEstadoNacimiento,
            });
            
            // Retain last 2 characters (homoclave) if the user already typed them
            const currentHomoclave = watchCurp.length >= 18 ? watchCurp.slice(16, 18) : watchCurp.slice(16);
            setValue('curp', (base16 + currentHomoclave).toUpperCase());
        }
    }, [
        watchNombre,
        watchApellidoPaterno,
        watchApellidoMaterno,
        watchFechaNacimiento,
        watchGenero,
        watchEstadoNacimiento,
        setValue
    ]);

    // Open dialod for register or edit
    const openAddDialog = () => {
        setSelectedEmployee(null);
        form.reset({
            tipoPersonal: staffTypes[0] || 'PROMOTOR/A',
            nombre: '',
            apellidoPaterno: '',
            apellidoMaterno: '',
            domicilio: '',
            colonia: '',
            codigoPostal: '',
            celular: '',
            fechaNacimiento: '',
            fechaIngreso: new Date().toISOString().split('T')[0],
            genero: 'H',
            estadoNacimiento: 'JC', // default to Jalisco or empty
            curp: '',
            entregoDocumentacion: false,
            firmoDocumentacion: false,
        });
        setDialogOpen(true);
    };

    const openEditDialog = (employee: Personal) => {
        setSelectedEmployee(employee);
        form.reset({
            tipoPersonal: employee.tipoPersonal || '',
            nombre: employee.nombre || '',
            apellidoPaterno: employee.apellidoPaterno || '',
            apellidoMaterno: employee.apellidoMaterno || '',
            domicilio: employee.domicilio || '',
            colonia: employee.colonia || '',
            codigoPostal: employee.codigoPostal || '',
            celular: employee.celular || '',
            fechaNacimiento: employee.fechaNacimiento || '',
            fechaIngreso: employee.fechaIngreso || '',
            genero: employee.genero || 'H',
            estadoNacimiento: employee.estadoNacimiento || '',
            curp: employee.curp || '',
            entregoDocumentacion: !!employee.entregoDocumentacion,
            firmoDocumentacion: !!employee.firmoDocumentacion,
        });
        setDialogOpen(true);
    };

    const handleFormSubmit = async (values: PersonalFormValues) => {
        setIsSaving(true);
        try {
            const payload = {
                ...values,
                registeredBy: selectedEmployee ? (selectedEmployee.registeredBy || '') : (appUser?.username || 'SYSTEM'),
            };
            const result = await savePersonalAction(payload, selectedEmployee?.id);
            if (result.success) {
                toast({
                    title: 'Ficha Guardada',
                    description: result.message
                });
                setDialogOpen(false);
                router.refresh();
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error de Servidor',
                description: error.message
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteEmployee = async () => {
        if (!employeeToDelete) return;
        try {
            const result = await deletePersonalAction(employeeToDelete.id);
            if (result.success) {
                toast({
                    title: 'Ficha Eliminada',
                    description: result.message
                });
                setEmployeeToDelete(null);
                router.refresh();
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error de Eliminación',
                description: error.message
            });
        }
    };

    // Filtered list based on search term and selected tab
    const filteredPersonal = useMemo(() => {
        let list = personalList;

        if (selectedPuestoTab !== 'Todo') {
            list = list.filter(p => (p.tipoPersonal || '').toUpperCase() === selectedPuestoTab.toUpperCase());
        }

        const cleanSearch = search.toLowerCase().trim();
        if (!cleanSearch) return list;
        return list.filter(p => {
            const fullName = `${p.nombre || ''} ${p.apellidoPaterno || ''} ${p.apellidoMaterno || ''}`.toLowerCase();
            return (
                fullName.includes(cleanSearch) ||
                (p.curp || '').toLowerCase().includes(cleanSearch) ||
                (p.tipoPersonal || '').toLowerCase().includes(cleanSearch) ||
                (p.celular || '').toLowerCase().includes(cleanSearch) ||
                (p.colonia || '').toLowerCase().includes(cleanSearch) ||
                (p.domicilio || '').toLowerCase().includes(cleanSearch)
            );
        });
    }, [personalList, search, selectedPuestoTab]);

    // Color Badges per Puesto
    const getPuestoBadge = (puesto: string) => {
        const p = puesto.toUpperCase();
        if (p.includes('SUPERVISOR')) {
            return <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">{puesto}</Badge>;
        }
        if (p.includes('PROMOTOR')) {
            return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">{puesto}</Badge>;
        }
        if (p.includes('EJECUTIVO')) {
            return <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-bold">{puesto}</Badge>;
        }
        return <Badge className="bg-zinc-600 hover:bg-zinc-700 text-white font-bold">{puesto}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header section with modern background */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
                        <UserCheck className="h-8 w-8 text-primary" /> Personal
                    </h1>
                </div>
                <Button 
                    onClick={openAddDialog} 
                    className="bg-primary hover:bg-primary/95 text-primary-foreground font-black px-6 py-5 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                >
                    <PlusCircle className="h-5 w-5" />
                    Registrar Personal
                </Button>
            </div>

            {/* Filter and Table View */}
            <Card className="shadow-lg border-primary/5 overflow-hidden">
                <CardHeader className="bg-muted/15 border-b py-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full">
                        <div className="relative max-w-md w-full">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nombre, CURP, puesto, cel..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10 h-10 rounded-xl bg-card focus-visible:ring-primary w-full"
                            />
                        </div>
                        
                        <div className="flex flex-wrap gap-1.5 items-center bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/40 shadow-inner">
                            <button
                                type="button"
                                onClick={() => setSelectedPuestoTab('Todo')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 border border-transparent",
                                    selectedPuestoTab === 'Todo'
                                        ? "bg-primary text-white shadow-sm font-black shadow-primary/25"
                                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                )}
                            >
                                TODO
                            </button>
                            {staffTypes.map((type) => (
                                <div key={type} className="flex items-center gap-1.5">
                                    <span className="h-4 w-[1px] bg-slate-300/80 dark:bg-slate-700/80" />
                                    <button
                                        type="button"
                                        onClick={() => setSelectedPuestoTab(type)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 border border-transparent uppercase",
                                            selectedPuestoTab === type
                                                ? "bg-primary text-white shadow-sm font-black shadow-primary/25"
                                                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                        )}
                                    >
                                        {type}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    {loading ? (
                        <div className="py-8">
                            <Loading message="Estamos cargando el personal" subtitle="Consultando expedientes del equipo" showSkeletonPreview={false} />
                        </div>
                    ) : filteredPersonal.length === 0 ? (
                        <div className="text-center py-16 space-y-3">
                            <div className="p-4 bg-muted/40 rounded-full w-fit mx-auto">
                                <User className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="font-bold text-lg text-foreground">No se encontraron expedientes</h3>
                            <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                                {search ? 'Prueba con otros términos o limpia el filtro de búsqueda.' : 'Aún no has registrado ningún empleado. Haz clic en "Registrar Personal" para comenzar.'}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead className="pl-6 font-black uppercase text-[10px] text-muted-foreground">Puesto</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-muted-foreground">Nombre Completo</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-muted-foreground">CURP</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-muted-foreground">Domicilio y Colonia</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-muted-foreground">Contacto</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-muted-foreground text-center">Ingreso / Edad</TableHead>
                                    <TableHead className="font-black uppercase text-[10px] text-muted-foreground text-center">Documentación</TableHead>
                                    <TableHead className="text-right pr-6 font-black uppercase text-[10px] text-muted-foreground">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPersonal.map((employee) => {
                                    // Calculate Age based on birthdate
                                    let age = '';
                                    if (employee.fechaNacimiento) {
                                        const birth = new Date(employee.fechaNacimiento);
                                        const now = new Date();
                                        let diff = now.getFullYear() - birth.getFullYear();
                                        const m = now.getMonth() - birth.getMonth();
                                        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
                                            diff--;
                                        }
                                        age = `${diff} años`;
                                    }

                                    return (
                                        <TableRow key={employee.id} className="hover:bg-muted/15 transition-colors">
                                            <TableCell className="pl-6 py-4">
                                                {getPuestoBadge(employee.tipoPersonal)}
                                            </TableCell>
                                            <TableCell className="font-bold text-sm uppercase text-foreground">
                                                {employee.nombre} {employee.apellidoPaterno} {employee.apellidoMaterno}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs font-semibold text-primary">
                                                {employee.curp}
                                            </TableCell>
                                            <TableCell className="text-xs max-w-[200px] truncate">
                                                <div className="font-medium uppercase">{employee.domicilio}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase">{employee.colonia}, CP {employee.codigoPostal}</div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                <div className="flex items-center gap-1.5 font-bold text-foreground">
                                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                                    {employee.celular}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center text-xs">
                                                <div className="font-medium flex items-center justify-center gap-1">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    {employee.fechaIngreso ? new Date(employee.fechaIngreso + 'T00:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' }) : '---'}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">{age || '---'}</div>
                                                {employee.registeredBy && (
                                                    <div className="text-[9px] font-bold text-muted-foreground/70 mt-0.5 uppercase tracking-wider">Reg: {employee.registeredBy}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="flex gap-1.5">
                                                        <Badge variant={employee.entregoDocumentacion ? 'default' : 'destructive'} className={cn("text-[9px] font-black tracking-wide uppercase px-2", employee.entregoDocumentacion ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20" : "bg-red-500/10 text-red-700 hover:bg-red-500/15")}>
                                                            {employee.entregoDocumentacion ? 'Entregó' : 'Falta Entregar'}
                                                        </Badge>
                                                        <Badge variant={employee.firmoDocumentacion ? 'default' : 'destructive'} className={cn("text-[9px] font-black tracking-wide uppercase px-2", employee.firmoDocumentacion ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20" : "bg-red-500/10 text-red-700 hover:bg-red-500/15")}>
                                                            {employee.firmoDocumentacion ? 'Firmó' : 'Falta Firmar'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <div className="flex justify-end gap-1.5">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => openEditDialog(employee)} 
                                                        className="h-8 w-8 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => setEmployeeToDelete(employee)} 
                                                        className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Registration Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-3xl w-[95vw] rounded-2xl max-h-[92vh] overflow-y-auto p-5 md:p-6">
                    <DialogHeader className="border-b pb-3">
                        <DialogTitle className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                            {selectedEmployee ? <Edit className="h-5 w-5 text-primary" /> : <PlusCircle className="h-5 w-5 text-primary" />}
                            {selectedEmployee ? 'Editar Ficha de Personal' : 'Registrar Nuevo Personal'}
                        </DialogTitle>
                    </DialogHeader>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 pt-1">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-3">
                                {/* Nombre */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="nombre"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Nombre(s)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="JUAN CARLOS" {...field} className="h-9 border border-border focus:ring-primary rounded-lg bg-card uppercase font-medium text-xs" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Apellido Paterno */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="apellidoPaterno"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Ap. Paterno</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="PATERNO" {...field} className="h-9 border border-border focus:ring-primary rounded-lg bg-card uppercase font-medium text-xs" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Apellido Materno */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="apellidoMaterno"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Ap. Materno</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="MATERNO" {...field} className="h-9 border border-border focus:ring-primary rounded-lg bg-card uppercase font-medium text-xs" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Fecha de Nacimiento */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="fechaNacimiento"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Fecha Nacimiento</FormLabel>
                                                <FormControl>
                                                    <Input type="date" {...field} className="h-9 border border-border focus:ring-primary rounded-lg bg-card font-medium text-xs" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Género */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="genero"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Género</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-9 border border-border focus:ring-primary rounded-lg bg-card font-medium text-xs">
                                                            <SelectValue placeholder="Género" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="H" className="text-xs">HOMBRE</SelectItem>
                                                        <SelectItem value="M" className="text-xs">MUJER</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Estado de Nacimiento */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="estadoNacimiento"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Entidad Nacimiento</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-9 border border-border focus:ring-primary rounded-lg bg-card font-medium text-xs">
                                                            <SelectValue placeholder="Entidad" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="max-h-[200px]">
                                                        {MEXICAN_STATES.map((state) => (
                                                            <SelectItem key={state.code} value={state.code} className="uppercase text-xs font-semibold">
                                                                {state.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Calle y Número */}
                                <div className="md:col-span-6">
                                    <FormField
                                        control={form.control}
                                        name="domicilio"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Calle y Número</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="AV. HIDALGO #123" {...field} className="h-9 border border-border focus:ring-primary rounded-lg bg-card uppercase font-medium text-xs" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Colonia */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="colonia"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Colonia</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="CENTRO" {...field} className="h-9 border border-border focus:ring-primary rounded-lg bg-card uppercase font-medium text-xs" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Código Postal */}
                                <div className="md:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name="codigoPostal"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">C.P.</FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        placeholder="5 digitos" 
                                                        maxLength={5} 
                                                        {...field} 
                                                        onChange={(e) => {
                                                            const clean = e.target.value.replace(/\D/g, '');
                                                            field.onChange(clean);
                                                        }}
                                                        className="h-9 border border-border focus:ring-primary rounded-lg bg-card font-medium text-xs" 
                                                    />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Puesto / Tipo */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="tipoPersonal"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Puesto / Tipo</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-9 border border-border focus:ring-primary rounded-lg bg-card uppercase font-semibold text-xs">
                                                            <SelectValue placeholder="Seleccionar puesto" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {staffTypes.map((type) => (
                                                            <SelectItem key={type} value={type} className="uppercase font-semibold text-xs">
                                                                {type}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Fecha de Ingreso */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="fechaIngreso"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Fecha de Ingreso</FormLabel>
                                                <FormControl>
                                                    <Input type="date" {...field} className="h-9 border border-border focus:ring-primary rounded-lg bg-card font-medium text-xs" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Celular */}
                                <div className="md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name="celular"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="font-bold text-[10px] uppercase text-muted-foreground">Celular (10 dígitos)</FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        type="tel" 
                                                        placeholder="Celular" 
                                                        maxLength={10}
                                                        {...field} 
                                                        onChange={(e) => {
                                                            const clean = e.target.value.replace(/\D/g, '');
                                                            field.onChange(clean);
                                                        }}
                                                        className="h-9 border border-border focus:ring-primary rounded-lg bg-card font-medium text-xs" 
                                                    />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* CURP Reactivo */}
                                <div className="md:col-span-6">
                                    <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center gap-3 h-[52px]">
                                        <div className="flex-1 space-y-0.5">
                                            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-primary">
                                                <Fingerprint className="h-3.5 w-3.5 text-primary animate-pulse" /> CURP (Auto-calculada)
                                            </div>
                                            <p className="text-[9px] text-muted-foreground leading-none">
                                                Llena los últimos 2 de la homoclave.
                                            </p>
                                        </div>
                                        <div className="w-[150px] shrink-0">
                                            <FormField
                                                control={form.control}
                                                name="curp"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-0">
                                                        <FormControl>
                                                            <Input 
                                                                placeholder="CURP" 
                                                                maxLength={18}
                                                                {...field} 
                                                                className="h-8 border border-primary/25 focus:border-primary focus:ring-primary rounded-lg bg-white dark:bg-zinc-950 font-mono text-center font-bold tracking-wider uppercase text-xs text-primary" 
                                                            />
                                                        </FormControl>
                                                        <FormMessage className="text-[9px]" />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Control de Documentación Checkboxes */}
                                <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <FormField
                                        control={form.control}
                                        name="entregoDocumentacion"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-lg border p-2 bg-muted/5 hover:bg-muted/10 transition-all cursor-pointer h-[52px]">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <FormLabel className="text-[10px] font-bold cursor-pointer text-foreground leading-normal">
                                                    Entregó Expediente Físico
                                                </FormLabel>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="firmoDocumentacion"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-lg border p-2 bg-muted/5 hover:bg-muted/10 transition-all cursor-pointer h-[52px]">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <FormLabel className="text-[10px] font-bold cursor-pointer text-foreground leading-normal">
                                                    Firmó Contrato / Reglamento
                                                </FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <DialogFooter className="border-t pt-3 gap-2">
                                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-lg h-9 text-xs">
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isSaving} className="px-6 font-black rounded-lg h-9 text-xs bg-primary hover:bg-primary/95 text-primary-foreground">
                                    {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                    {selectedEmployee ? 'Guardar Cambios' : 'Registrar Empleado'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Alert */}
            <AlertDialog open={!!employeeToDelete} onOpenChange={(open) => !open && setEmployeeToDelete(null)}>
                <AlertDialogContent className="rounded-3xl p-8 border-destructive/10">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-2xl font-black text-destructive flex items-center gap-2">
                            ¿Eliminar expediente de personal?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm py-4">
                            Esta acción eliminará de forma permanente la ficha de <strong>{employeeToDelete?.nombre} {employeeToDelete?.apellidoPaterno}</strong>. 
                            Todos sus datos de contacto, domicilio y documentación física serán borrados de la base de datos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel className="rounded-xl h-12">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteEmployee} className="bg-destructive hover:bg-destructive/90 rounded-xl h-12 px-8 text-white">
                            Sí, Eliminar Permanentemente
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
