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
import { Switch } from '@/components/ui/switch';
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
import { PlusCircle, Loader2, Trash, Edit, ShieldCheck, Lock, UserPlus, Users, LayoutDashboard, Landmark, FileWarning, Wallet, History, Activity, Search, AlertCircle, Smartphone, MapPin, Wrench, Settings, ArrowRightLeft, KeyRound, Building, CheckCircle2, Coins, Megaphone, UserCheck, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import type { AppUser, UserPermissions, Plaza, Localidad, Personal } from '@/lib/types';
import { deleteUserAction, saveUserAction } from '@/app/inicio/ajustes/actions';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const permissionsSchema = z.object({
  dashboard: z.boolean().default(false),
  clients: z.boolean().default(false),
  consultarCliente: z.boolean().default(false),
  loans: z.boolean().default(false),
  overduePortfolio: z.boolean().default(false),
  carteraVencida: z.boolean().default(false),
  wallet: z.boolean().default(false),
  plans: z.boolean().default(false),
  settings: z.boolean().default(false),
  editClients: z.boolean().default(false),
  control: z.boolean().default(false),
  debes: z.boolean().default(false),
  imprenta: z.boolean().default(false),
  avales: z.boolean().default(false),
  // Granular settings
  manageUsers: z.boolean().default(false),
  manageZones: z.boolean().default(false),
  manageMigration: z.boolean().default(false),
  managePlans: z.boolean().default(false),
  manageSystem: z.boolean().default(false),
  manageMaintenance: z.boolean().default(false),
  manageAvisos: z.boolean().default(false),
  managePersonal: z.boolean().default(false),
  // Mobile
  showMobileNavBar: z.boolean().default(false),
  mobileSections: z.array(z.string()).default([]),
});

const addUserFormSchema = z.object({
  username: z.string().min(3, 'El nombre de usuario debe tener al menos 3 caracteres.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
  role: z.enum(['admin', 'supervisor'], { required_error: 'Debes seleccionar un rol.' }),
  permissions: permissionsSchema,
  assignedPlazaIds: z.array(z.string()).default([]),
  assignedLocalidadIds: z.array(z.string()).default([]),
});

const editUserFormSchema = z.object({
  role: z.enum(['admin', 'supervisor'], { required_error: 'Debes seleccionar un rol.' }),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').optional().or(z.literal('')),
  permissions: permissionsSchema,
  assignedPlazaIds: z.array(z.string()).default([]),
  assignedLocalidadIds: z.array(z.string()).default([]),
});

type AddUserFormValues = z.infer<typeof addUserFormSchema>;
type EditUserFormValues = z.infer<typeof editUserFormSchema>;

const DUMMY_DOMAIN = 'credicontrol.app';

const permissionLabels: { id: keyof Omit<UserPermissions, 'showMobileNavBar' | 'mobileSections'>; label: string; description: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', description: 'Vista general de métricas', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', description: 'Listado y registro de clientes', icon: Users },
    { id: 'consultarCliente', label: 'Consultar Cliente', description: 'Búsqueda rápida de perfiles', icon: Search },
    { id: 'loans', label: 'Préstamos', description: 'Hojas de cobranza semanal', icon: Landmark },
    { id: 'overduePortfolio', label: 'Pagos Pendientes', description: 'Clientes con fallos vigentes', icon: FileWarning },
    { id: 'carteraVencida', label: 'Cartera Vencida', description: 'Cuentas incobrables post-vencimiento', icon: History },
    { id: 'debes', label: 'Debes', description: 'Liquidación semanal de promotoras', icon: Coins },
    { id: 'wallet', label: 'Bitacora', description: 'Flujo de caja y movimientos', icon: Wallet },
    { id: 'control', label: 'Control', description: 'Capital en calle y proyecciones', icon: Activity },
    { id: 'editClients', label: 'Editar Clientes', description: 'Modificar datos de clientes existentes', icon: Edit },
    { id: 'imprenta', label: 'Imprenta', description: 'Acceso a la app de Imprenta en iframe', icon: Printer },
    { id: 'avales', label: 'Avales', description: 'Listado y consulta de avales registrados', icon: ShieldCheck },
    { id: 'plans', label: 'Planes (Ajustes)', description: 'Ver pestaña de planes en ajustes', icon: Lock },
    { id: 'settings', label: 'Ajustes (Maestro)', description: 'Acceso total a la página de ajustes', icon: Settings },
];

const granularSettingsLabels: { id: keyof UserPermissions; label: string; description: string; icon: any }[] = [
    { id: 'manageUsers', label: 'Gestionar Accesos (Usuarios)', description: 'Control de cuentas de acceso y sus permisos', icon: Users },
    { id: 'manageZones', label: 'Gestionar Localidades y Promotoras', description: 'Plazas, Localidades y Promotoras', icon: MapPin },
    { id: 'manageMigration', label: 'Gestionar Migración', description: 'Traslado masivo de localidades', icon: ArrowRightLeft },
    { id: 'managePlans', label: 'Gestionar Planes', description: 'Creación de productos financieros', icon: Lock },
    { id: 'manageSystem', label: 'Gestionar Personalización', description: 'Nombre y Logo del negocio', icon: Edit },
    { id: 'manageMaintenance', label: 'Gestionar Mantenimiento', description: 'Sincronización y borrado crítico', icon: Wrench },
    { id: 'manageAvisos', label: 'Gestionar Avisos', description: 'Publicación y control de avisos del sistema', icon: Megaphone },
    { id: 'managePersonal', label: 'Gestionar Expedientes (Personal)', description: 'Registro y administración de fichas de empleados', icon: UserCheck },
];

interface UserManagementProps {
    users: AppUser[];
}

export function UserManagement({ users }: UserManagementProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { appUser, signUp } = useAuth();
  const { data: systemData } = useRealtimeData(undefined, {
      enabledCollections: ['users', 'plazas', 'localidades']
  });

  const [personalList, setPersonalList] = useState<Personal[]>([]);
  const [isFromPersonal, setIsFromPersonal] = useState(false);
  const [personalSearch, setPersonalSearch] = useState('');
  const [selectedPersonal, setSelectedPersonal] = useState<Personal | null>(null);
  const [showPersonalDropdown, setShowPersonalDropdown] = useState(false);

  useEffect(() => {
    const q = collection(db, 'personal');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Personal[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Personal);
      });
      setPersonalList(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!showPersonalDropdown) return;
    const handleOutsideClick = () => setShowPersonalDropdown(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [showPersonalDropdown]);

  const personalMatches = useMemo(() => {
    if (!personalSearch.trim()) return [];
    const clean = personalSearch.toLowerCase().trim();
    return personalList.filter(p => {
      const fullName = `${p.nombre} ${p.apellidoPaterno} ${p.apellidoMaterno}`.toLowerCase();
      return fullName.includes(clean) || (p.curp || '').toLowerCase().includes(clean);
    });
  }, [personalList, personalSearch]);

  const plazas = useMemo(() => systemData?.plazas || [], [systemData]);
  const localidades = useMemo(() => systemData?.localidades || [], [systemData]);

  const isCristobal = appUser?.username?.toUpperCase() === 'CRISTOBAL';

  const addUserForm = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: {
      username: '',
      password: '',
      role: 'supervisor',
      assignedPlazaIds: [],
      assignedLocalidadIds: [],
      permissions: {
        dashboard: true,
        clients: true,
        consultarCliente: true,
        loans: true,
        overduePortfolio: true,
        carteraVencida: true,
        wallet: true,
        plans: false,
        settings: false,
        editClients: false,
        control: true,
        debes: true,
        imprenta: true,
        avales: true,
        manageUsers: false,
        manageZones: true,
        manageMigration: false,
        managePlans: true,
        manageSystem: false,
        manageMaintenance: false,
        manageAvisos: false,
        managePersonal: false,
        showMobileNavBar: true,
        mobileSections: ['dashboard', 'loans', 'overduePortfolio', 'wallet', 'consultarCliente'],
      },
    },
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
  });

  useEffect(() => {
    if (selectedUser) {
      editUserForm.reset({
        role: selectedUser.role,
        password: '',
        assignedPlazaIds: selectedUser.assignedPlazaIds || [],
        assignedLocalidadIds: selectedUser.assignedLocalidadIds || [],
        permissions: { 
            dashboard: selectedUser.permissions?.dashboard ?? false,
            clients: selectedUser.permissions?.clients ?? false,
            consultarCliente: selectedUser.permissions?.consultarCliente ?? false,
            loans: selectedUser.permissions?.loans ?? false,
            overduePortfolio: selectedUser.permissions?.overduePortfolio ?? false,
            carteraVencida: selectedUser.permissions?.carteraVencida ?? false,
            wallet: selectedUser.permissions?.wallet ?? false,
            plans: selectedUser.permissions?.plans ?? false,
            settings: selectedUser.permissions?.settings ?? false,
            editClients: selectedUser.permissions?.editClients ?? false,
            control: selectedUser.permissions?.control ?? false,
            debes: selectedUser.permissions?.debes ?? false,
            imprenta: selectedUser.permissions?.imprenta ?? false,
            avales: selectedUser.permissions?.avales ?? false,
            manageUsers: selectedUser.permissions?.manageUsers ?? false,
            manageZones: selectedUser.permissions?.manageZones ?? false,
            manageMigration: selectedUser.permissions?.manageMigration ?? false,
            managePlans: selectedUser.permissions?.managePlans ?? false,
            manageSystem: selectedUser.permissions?.manageSystem ?? false,
            manageMaintenance: selectedUser.permissions?.manageMaintenance ?? false,
            manageAvisos: selectedUser.permissions?.manageAvisos ?? false,
            managePersonal: selectedUser.permissions?.managePersonal ?? false,
            showMobileNavBar: selectedUser.permissions?.showMobileNavBar ?? false,
            mobileSections: selectedUser.permissions?.mobileSections ?? [],
        },
      });
    }
  }, [selectedUser, editUserForm]);

  const onAddUserSubmit = async (values: AddUserFormValues) => {
    setIsSaving(true);
    const email = `${values.username.toLowerCase()}@${DUMMY_DOMAIN}`;
    try {
        const userCredential = await signUp(email, values.password, values.role, values.username, values.permissions);
        await saveUserAction(userCredential.user.uid, {
            username: values.username,
            role: values.role,
            permissions: values.permissions,
            password: values.password,
            assignedPlazaIds: values.assignedPlazaIds,
            assignedLocalidadIds: values.assignedLocalidadIds,
            personalId: isFromPersonal && selectedPersonal ? selectedPersonal.id : undefined,
        });

        toast({ title: 'Usuario Creado', description: `El usuario "${values.username}" ha sido registrado.` });
        addUserForm.reset();
        setIsFromPersonal(false);
        setPersonalSearch('');
        setSelectedPersonal(null);
        setAddDialogOpen(false);
        router.refresh(); 
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const onEditUserSubmit = async (values: EditUserFormValues) => {
    if (!selectedUser) return;
    setIsEditing(true);
    try {
        const userDataToUpdate: Omit<AppUser, 'id'> = { 
            username: selectedUser.username, 
            role: values.role, 
            permissions: values.permissions,
            password: values.password || selectedUser.password || '',
            assignedPlazaIds: values.assignedPlazaIds,
            assignedLocalidadIds: values.assignedLocalidadIds,
        };
        const result = await saveUserAction(selectedUser.id, userDataToUpdate);
        if (result.success) {
            toast({ title: 'Éxito', description: 'Usuario actualizado correctamente.'});
            setEditDialogOpen(false);
            router.refresh();
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsEditing(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
     try {
        const result = await deleteUserAction(userId);
        if (result.success) {
            toast({ title: 'Éxito', description: 'Usuario eliminado.' });
            router.refresh();
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const openEditDialog = (user: AppUser) => {
    setSelectedUser(user);
    setEditDialogOpen(true);
  };

  return (
    <div className="grid gap-8">
        <Card className="shadow-lg border-primary/10 overflow-hidden">
            <CardHeader className="border-b bg-muted/30 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="text-xl font-black flex items-center gap-2 text-slate-800 dark:text-slate-100">
                        <Users className="h-5.5 w-5.5 text-primary" />
                        Directorio de Usuarios Activos
                    </CardTitle>
                    <Button 
                        onClick={() => {
                            addUserForm.reset();
                            setIsFromPersonal(false);
                            setPersonalSearch('');
                            setSelectedPersonal(null);
                            setAddDialogOpen(true);
                        }}
                        className="bg-primary hover:bg-primary/95 text-primary-foreground font-black px-5 py-2.5 rounded-xl shadow-md shadow-primary/10 flex items-center gap-2 text-xs active:scale-95 transition-transform animate-in fade-in"
                    >
                        <UserPlus className="h-4.5 w-4.5" />
                        Registrar nuevo usuario
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="pl-8 py-4 font-bold">Usuario</TableHead>
                            <TableHead className="font-bold">Rol de Acceso</TableHead>
                            {isCristobal && <TableHead className="font-bold">Contraseña</TableHead>}
                            <TableHead className="hidden md:table-cell font-bold">Privilegios</TableHead>
                            <TableHead className="text-right pr-8 font-bold">Gestión</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map(user => (
                            <TableRow key={user.id} className="hover:bg-muted/20">
                                <TableCell className="pl-8 font-medium py-4 uppercase">{user.username}</TableCell>
                                <TableCell>
                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="font-bold px-3">
                                        {user.role === 'admin' ? 'ADMINISTRADOR' : 'SUPERVISOR'}
                                    </Badge>
                                </TableCell>
                                {isCristobal && (
                                    <TableCell className="font-mono text-xs font-bold text-primary">
                                        {user.password || '---'}
                                    </TableCell>
                                )}
                                <TableCell className="text-[10px] text-muted-foreground max-w-[400px] hidden md:table-cell">
                                   <div className='flex flex-wrap gap-1'>
                                        {user.role === 'admin' ? 
                                            <span className="text-primary font-bold">ACCESO TOTAL (POR ROL)</span> : 
                                            [...permissionLabels, ...granularSettingsLabels]
                                                .filter(p => user.permissions?.[p.id as keyof UserPermissions])
                                                .map(p => <Badge key={p.id} variant="outline" className='text-[9px] h-4'>{p.label}</Badge>)
                                        }
                                   </div>
                                </TableCell>
                                <TableCell className="text-right pr-8">
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="icon" onClick={() => openEditDialog(user)} className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                            <Edit className="h-4 w-4"/>
                                        </Button>
                                        <Button variant="outline" size="icon" onClick={() => handleDeleteUser(user.id)} className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-colors">
                                            <Trash className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Modal para Registrar Nuevo Usuario */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
                <Form {...addUserForm}>
                    <form onSubmit={addUserForm.handleSubmit(onAddUserSubmit)} className="space-y-6">
                        <DialogHeader className="border-b pb-4">
                            <DialogTitle className="text-2xl font-bold uppercase flex items-center gap-2 text-slate-800 dark:text-slate-100">
                                <UserPlus className="h-6 w-6 text-primary" />
                                Registrar Nuevo Usuario
                            </DialogTitle>
                            <DialogDescription>Crea una nueva cuenta de acceso y define sus permisos de sistema.</DialogDescription>
                        </DialogHeader>

                        {/* ¿Ya registrado como personal? */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 border rounded-2xl bg-muted/10">
                            <div className="space-y-1">
                                <label className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                    <UserCheck className="h-4.5 w-4.5 text-primary" /> ¿El usuario ya está registrado en la sección de Personal?
                                </label>
                                <span className="text-xs text-muted-foreground block max-w-xl">
                                    Si seleccionas "Sí", podrás buscarlo por su nombre para vincular su cuenta y rellenar automáticamente sus datos de usuario.
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/40 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsFromPersonal(true);
                                        addUserForm.setValue('username', '');
                                        setPersonalSearch('');
                                        setSelectedPersonal(null);
                                    }}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 border border-transparent shadow-sm",
                                        isFromPersonal
                                            ? "bg-primary text-white shadow-sm font-black shadow-primary/25"
                                            : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                                    )}
                                >
                                    Sí, ya es Personal
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsFromPersonal(false);
                                        addUserForm.setValue('username', '');
                                        setPersonalSearch('');
                                        setSelectedPersonal(null);
                                    }}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 border border-transparent shadow-sm",
                                        !isFromPersonal
                                            ? "bg-primary text-white shadow-sm font-black shadow-primary/25"
                                            : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                                    )}
                                >
                                    No, crear desde cero
                                </button>
                            </div>
                        </div>

                        {/* Búsqueda de Personal si aplica */}
                        {isFromPersonal && (
                            <div className="relative border rounded-2xl p-5 bg-primary/5 border-primary/10 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                                <label className="font-extrabold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">Buscar y Seleccionar Personal</label>
                                <div className="relative max-w-md">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Escribe el nombre del empleado..."
                                        value={personalSearch}
                                        onChange={(e) => {
                                            setPersonalSearch(e.target.value);
                                            setShowPersonalDropdown(true);
                                            setSelectedPersonal(null);
                                            addUserForm.setValue('username', '');
                                        }}
                                        onFocus={() => setShowPersonalDropdown(true)}
                                        className="pl-10 h-10 rounded-xl bg-card border-slate-200 focus-visible:ring-primary focus-visible:border-primary w-full shadow-sm"
                                    />
                                </div>
                                {showPersonalDropdown && personalMatches.length > 0 && (
                                    <div className="absolute z-50 w-full max-w-md mt-1.5 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y">
                                        {personalMatches.map((p) => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setSelectedPersonal(p);
                                                    setPersonalSearch(`${p.nombre} ${p.apellidoPaterno} ${p.apellidoMaterno}`);
                                                    setShowPersonalDropdown(false);
                                                    
                                                    // Normalize username to UPPERCASE_SAFE
                                                    const cleanUsername = `${p.nombre}_${p.apellidoPaterno}`
                                                        .toUpperCase()
                                                        .normalize("NFD")
                                                        .replace(/[\u0300-\u036f]/g, "") // remove accents
                                                        .replace(/[^A-Z0-9_]/g, ""); // keep only letters, numbers, underscores
                                                    addUserForm.setValue('username', cleanUsername);
                                                }}
                                                className="px-4 py-3 hover:bg-muted/80 cursor-pointer transition-colors text-sm font-semibold flex items-center justify-between"
                                            >
                                                <span>{p.nombre} {p.apellidoPaterno} {p.apellidoMaterno}</span>
                                                <Badge className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-bold text-[10px] uppercase">{p.tipoPersonal}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {showPersonalDropdown && personalSearch.trim() && personalMatches.length === 0 && (
                                    <div className="absolute z-50 w-full max-w-md mt-1.5 bg-popover text-popover-foreground border rounded-xl shadow-lg p-4 text-center text-xs text-muted-foreground">
                                        No se encontraron coincidencias en el personal registrado.
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormField
                                control={addUserForm.control}
                                name="username"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-bold">Nombre de Usuario</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="Ej: ALONSO_M" 
                                            {...field} 
                                            readOnly={isFromPersonal}
                                            className={cn("uppercase bg-muted/30 focus:bg-background transition-all", isFromPersonal && "bg-slate-100/70 border-slate-200 cursor-not-allowed dark:bg-slate-800/40 text-muted-foreground")}
                                        />
                                    </FormControl>
                                    {isFromPersonal && selectedPersonal && (
                                        <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-500 font-extrabold flex items-center gap-1 uppercase tracking-wide">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Vinculado: {selectedPersonal.nombre} ({selectedPersonal.tipoPersonal})
                                        </div>
                                    )}
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={addUserForm.control}
                                name="password"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-bold">Contraseña</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="Mínimo 6 caracteres" {...field} className="bg-muted/30 focus:bg-background transition-all" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={addUserForm.control}
                                name="role"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-bold">Rol Operativo</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="bg-muted/30 focus:bg-background transition-all">
                                                <SelectValue placeholder="Seleccionar rol" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="admin">Administrador (Acceso Total)</SelectItem>
                                            <SelectItem value="supervisor">Supervisor (Accesos Limitados)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>

                        <div className="space-y-6 pt-4 border-t">
                            <div className="flex items-center gap-2 border-b pb-2">
                                <MapPin className="h-4 w-4 text-blue-600" />
                                <h4 className="text-sm font-bold uppercase tracking-wider">Asignación de Zonas (Supervisión)</h4>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-8">
                                <FormField
                                    control={addUserForm.control}
                                    name="assignedPlazaIds"
                                    render={({ field }) => {
                                        const allPlazasSelected = plazas.length > 0 && plazas.every(p => field.value?.includes(p.id));
                                        return (
                                        <FormItem className="space-y-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <Building className="h-4 w-4 text-blue-500" />
                                                    <FormLabel className="font-black text-xs uppercase">Plazas Permitidas</FormLabel>
                                                </div>
                                                <div className="flex items-center gap-1.5 pr-2">
                                                    <Checkbox 
                                                        id="select-all-plazas-add"
                                                        checked={allPlazasSelected}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) field.onChange(plazas.map(p => p.id));
                                                            else {
                                                                field.onChange([]);
                                                                addUserForm.setValue('assignedLocalidadIds', []);
                                                            }
                                                        }}
                                                    />
                                                    <label htmlFor="select-all-plazas-add" className="text-[10px] font-black uppercase cursor-pointer text-blue-600">Todas</label>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 p-4 bg-muted/20 rounded-xl border">
                                                {plazas.map((plaza) => (
                                                    <div key={plaza.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                        <Checkbox
                                                            checked={field.value?.includes(plaza.id)}
                                                            onCheckedChange={(checked) => {
                                                                const current = field.value || [];
                                                                if (checked) {
                                                                    field.onChange([...current, plaza.id]);
                                                                } else {
                                                                    field.onChange(current.filter((val) => val !== plaza.id));
                                                                    const locsInPlaza = localidades.filter(l => l.plazaId === plaza.id).map(l => l.id);
                                                                    const currentLocs = addUserForm.getValues('assignedLocalidadIds') || [];
                                                                    addUserForm.setValue('assignedLocalidadIds', currentLocs.filter(id => !locsInPlaza.includes(id)));
                                                                }
                                                            }}
                                                        />
                                                        <span className="text-[10px] font-bold uppercase cursor-pointer">{plaza.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </FormItem>
                                    )}}
                                />

                                <FormField
                                    control={addUserForm.control}
                                    name="assignedLocalidadIds"
                                    render={({ field }) => {
                                        const selectedPlazaIds = addUserForm.watch('assignedPlazaIds') || [];
                                        const availableLocalidades = localidades.filter(l => selectedPlazaIds.includes(l.plazaId));
                                        const allLocalidadesSelected = availableLocalidades.length > 0 && availableLocalidades.every(l => field.value?.includes(l.id));

                                        return (
                                        <FormItem className="space-y-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-4 w-4 text-blue-500" />
                                                    <FormLabel className="font-black text-xs uppercase">Localidades Específicas</FormLabel>
                                                </div>
                                                {availableLocalidades.length > 0 && (
                                                    <div className="flex items-center gap-1.5 pr-2">
                                                        <Checkbox 
                                                            id="select-all-localidades-add"
                                                            checked={allLocalidadesSelected}
                                                            onCheckedChange={(checked) => {
                                                                const current = field.value || [];
                                                                if (checked) {
                                                                    const newIds = Array.from(new Set([...current, ...availableLocalidades.map(l => l.id)]));
                                                                    field.onChange(newIds);
                                                                } else {
                                                                    const remaining = current.filter(id => !availableLocalidades.some(al => al.id === id));
                                                                    field.onChange(remaining);
                                                                }
                                                            }}
                                                        />
                                                        <label htmlFor="select-all-localidades-add" className="text-[10px] font-black uppercase cursor-pointer text-blue-600">Todas</label>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 p-4 bg-muted/20 rounded-xl border max-h-[150px] overflow-y-auto">
                                                {availableLocalidades.map((loc) => (
                                                    <div key={loc.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                        <Checkbox
                                                            checked={field.value?.includes(loc.id)}
                                                            onCheckedChange={(checked) => {
                                                                const current = field.value || [];
                                                                return checked
                                                                    ? field.onChange([...current, loc.id])
                                                                    : field.onChange(current.filter((val) => val !== loc.id));
                                                            }}
                                                        />
                                                        <span className="text-[10px] font-bold uppercase cursor-pointer">{loc.name}</span>
                                                    </div>
                                                ))}
                                                {availableLocalidades.length === 0 && (
                                                    <p className="text-[9px] text-muted-foreground uppercase col-span-2 text-center py-4 italic">Selecciona una Plaza primero para ver sus localidades.</p>
                                                )}
                                            </div>
                                        </FormItem>
                                    )}}
                                />
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center gap-2 border-b pb-2">
                                <Lock className="h-4 w-4 text-primary" />
                                <h4 className="text-sm font-bold uppercase tracking-wider">Permisos de Módulos Generales</h4>
                            </div>
                            
                            {addUserForm.watch('role') === 'admin' && (
                                <Alert className="bg-primary/10 border-primary/20 text-primary-foreground mb-4">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle className='font-bold'>Modo Administrador Activo</AlertTitle>
                                    <AlertDescription>
                                        Los administradores tienen acceso total por defecto. Los permisos individuales se ignorarán.
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className={cn(
                                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity",
                                addUserForm.watch('role') === 'admin' && "opacity-50 pointer-events-none"
                            )}>
                                {permissionLabels.map((item) => (
                                <FormField
                                    key={item.id}
                                    control={addUserForm.control}
                                    name={`permissions.${item.id}`}
                                    render={({ field }) => (
                                    <FormItem className={cn(
                                        "flex flex-row items-start space-x-3 space-y-0 rounded-xl border p-4 hover:border-primary/50 transition-all cursor-pointer",
                                        field.value ? "bg-primary/5 border-primary/20" : "bg-background"
                                    )}>
                                        <FormControl>
                                            <Checkbox
                                                checked={addUserForm.watch('role') === 'admin' ? true : field.value}
                                                onCheckedChange={field.onChange}
                                                className="mt-1"
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className="text-sm font-bold cursor-pointer">{item.label}</FormLabel>
                                            <p className="text-[10px] text-muted-foreground">{item.description}</p>
                                        </div>
                                    </FormItem>
                                    )}
                                />
                                ))}
                            </div>

                            <div className="flex items-center gap-2 border-b pb-2 pt-4">
                                <Settings className="h-4 w-4 text-blue-600" />
                                <h4 className="text-sm font-bold uppercase tracking-wider">Permisos Detallados de Ajustes</h4>
                            </div>
                            <div className={cn(
                                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity",
                                addUserForm.watch('role') === 'admin' && "opacity-50 pointer-events-none"
                            )}>
                                {granularSettingsLabels.map((item) => (
                                <FormField
                                    key={item.id}
                                    control={addUserForm.control}
                                    name={`permissions.${item.id}`}
                                    render={({ field }) => (
                                    <FormItem className={cn(
                                        "flex flex-row items-start space-x-3 space-y-0 rounded-xl border p-4 hover:border-blue-500/50 transition-all cursor-pointer",
                                        field.value ? "bg-blue-500/5 border-blue-500/20" : "bg-background"
                                    )}>
                                        <FormControl>
                                            <Checkbox
                                                checked={addUserForm.watch('role') === 'admin' ? true : field.value as boolean}
                                                onCheckedChange={field.onChange}
                                                className="mt-1"
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className="text-sm font-bold cursor-pointer">{item.label}</FormLabel>
                                            <p className="text-[10px] text-muted-foreground">{item.description}</p>
                                        </div>
                                    </FormItem>
                                    )}
                                />
                                ))}
                            </div>
                        </div>

                        <div className="space-y-6 pt-4 border-t">
                            <div className="flex items-center gap-2">
                                <Smartphone className="h-5 w-5 text-blue-600" />
                                <h4 className="text-sm font-bold uppercase tracking-wider">Interfaz Móvil (Navigator Bar)</h4>
                            </div>

                            <FormField
                                control={addUserForm.control}
                                name="permissions.showMobileNavBar"
                                render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-blue-50/20 border-blue-100">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base font-bold">Activar Navigator Bar Móvil</FormLabel>
                                        <FormDescription>Habilita la barra flotante en la parte inferior para celulares.</FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                </FormItem>
                                )}
                            />

                            {addUserForm.watch('permissions.showMobileNavBar') && (
                                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                                    <p className="text-xs font-bold text-muted-foreground uppercase">Secciones visibles en la barra (Máx. 5)</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {permissionLabels.slice(0, 9).map((item) => (
                                            <FormField
                                                key={`mobile-${item.id}`}
                                                control={addUserForm.control}
                                                name="permissions.mobileSections"
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value.includes(item.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const current = [...field.value];
                                                                    if (checked) {
                                                                        if (current.length < 5) current.push(item.id);
                                                                        else toast({ variant: 'destructive', title: 'Límite alcanzado', description: 'Máximo 5 secciones.' });
                                                                    } else {
                                                                        const idx = current.indexOf(item.id);
                                                                        if (idx > -1) current.splice(idx, 1);
                                                                    }
                                                                    field.onChange(current);
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="text-xs font-medium cursor-pointer">{item.label}</FormLabel>
                                                    </FormItem>
                                                )}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="pt-4 border-t gap-2 flex justify-end">
                            <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} className="rounded-xl font-bold">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/95 text-white rounded-xl font-black px-6 shadow-md shadow-primary/20 animate-in fade-in">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Registrar Usuario
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
                <Form {...editUserForm}>
                    <form onSubmit={editUserForm.handleSubmit(onEditUserSubmit)} className="space-y-8">
                        <DialogHeader className="border-b pb-4">
                            <DialogTitle className="text-2xl font-bold uppercase flex items-center gap-2">
                                <ShieldCheck className="h-6 w-6 text-primary" />
                                Gestionar: {selectedUser?.username}
                            </DialogTitle>
                            <DialogDescription>Ajusta el rol, contraseña y los privilegios específicos.</DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-8 py-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                <FormField
                                    control={editUserForm.control}
                                    name="role"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold">Rol de Sistema</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="h-12 border-2">
                                                    <SelectValue placeholder="Seleccionar rol" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="admin">Administrador (Acceso Total)</SelectItem>
                                                <SelectItem value="supervisor">Supervisor (Accesos Limitados)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editUserForm.control}
                                    name="password"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold flex items-center gap-2">
                                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                                            Restablecer Contraseña
                                        </FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="Nueva contraseña (opcional)" {...field} className="h-12 border-2" />
                                        </FormControl>
                                        <FormDescription className="text-[10px]">Dejar en blanco para conservar la actual.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>

                            <div className="space-y-6 pt-4 border-t">
                                <div className="flex items-center gap-2 border-b pb-2">
                                    <MapPin className="h-4 w-4 text-blue-600" />
                                    <h4 className="text-sm font-bold uppercase tracking-wider">Restricción Geográfica</h4>
                                </div>
                                
                                <div className="grid md:grid-cols-2 gap-8">
                                    <FormField
                                        control={editUserForm.control}
                                        name="assignedPlazaIds"
                                        render={({ field }) => {
                                            const allPlazasSelected = plazas.length > 0 && plazas.every(p => field.value?.includes(p.id));
                                            return (
                                            <FormItem className="space-y-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <Building className="h-4 w-4 text-blue-500" />
                                                        <FormLabel className="font-black text-xs uppercase">Plazas Permitidas</FormLabel>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 pr-2">
                                                        <Checkbox 
                                                            id="select-all-plazas-edit"
                                                            checked={allPlazasSelected}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) field.onChange(plazas.map(p => p.id));
                                                                else {
                                                                    field.onChange([]);
                                                                    editUserForm.setValue('assignedLocalidadIds', []);
                                                                }
                                                            }}
                                                        />
                                                        <label htmlFor="select-all-plazas-edit" className="text-[10px] font-black uppercase cursor-pointer text-blue-600">Todas</label>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 p-4 bg-muted/20 rounded-xl border">
                                                    {plazas.map((plaza) => (
                                                        <div key={plaza.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                            <Checkbox
                                                                checked={field.value?.includes(plaza.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const current = field.value || [];
                                                                    if (checked) {
                                                                        field.onChange([...current, plaza.id]);
                                                                    } else {
                                                                        field.onChange(current.filter((val) => val !== plaza.id));
                                                                        const locsInPlaza = localidades.filter(l => l.plazaId === plaza.id).map(l => l.id);
                                                                        const currentLocs = editUserForm.getValues('assignedLocalidadIds') || [];
                                                                        editUserForm.setValue('assignedLocalidadIds', currentLocs.filter(id => !locsInPlaza.includes(id)));
                                                                    }
                                                                }}
                                                            />
                                                            <span className="text-[10px] font-bold uppercase cursor-pointer">{plaza.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </FormItem>
                                        )}}
                                    />

                                    <FormField
                                        control={editUserForm.control}
                                        name="assignedLocalidadIds"
                                        render={({ field }) => {
                                            const selectedPlazaIds = editUserForm.watch('assignedPlazaIds') || [];
                                            const availableLocalidades = localidades.filter(l => selectedPlazaIds.includes(l.plazaId));
                                            const allLocalidadesSelected = availableLocalidades.length > 0 && availableLocalidades.every(l => field.value?.includes(l.id));

                                            return (
                                            <FormItem className="space-y-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="h-4 w-4 text-blue-500" />
                                                        <FormLabel className="font-black text-xs uppercase">Localidades Permitidas</FormLabel>
                                                    </div>
                                                    {availableLocalidades.length > 0 && (
                                                        <div className="flex items-center gap-1.5 pr-2">
                                                            <Checkbox 
                                                                id="select-all-localidades-edit"
                                                                checked={allLocalidadesSelected}
                                                                onCheckedChange={(checked) => {
                                                                    const current = field.value || [];
                                                                    if (checked) {
                                                                        const newIds = Array.from(new Set([...current, ...availableLocalidades.map(l => l.id)]));
                                                                        field.onChange(newIds);
                                                                    } else {
                                                                        const remaining = current.filter(id => !availableLocalidades.some(al => al.id === id));
                                                                        field.onChange(remaining);
                                                                    }
                                                                }}
                                                            />
                                                            <label htmlFor="select-all-localidades-edit" className="text-[10px] font-black uppercase cursor-pointer text-blue-600">Todas</label>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 p-4 bg-muted/20 rounded-xl border max-h-[150px] overflow-y-auto">
                                                    {availableLocalidades.map((loc) => (
                                                        <div key={loc.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                            <Checkbox
                                                                checked={field.value?.includes(loc.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const current = field.value || [];
                                                                    return checked
                                                                        ? field.onChange([...current, loc.id])
                                                                        : field.onChange(current.filter((val) => val !== loc.id));
                                                                }}
                                                            />
                                                            <span className="text-[10px] font-bold uppercase cursor-pointer">{loc.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </FormItem>
                                        )}}
                                    />
                                </div>
                            </div>

                            {editUserForm.watch('role') === 'admin' && (
                                <Alert variant="destructive" className="bg-blue-50 border-blue-200 text-blue-800">
                                    <AlertCircle className="h-4 w-4 text-blue-600" />
                                    <AlertTitle className="font-bold">Privilegios de Administrador</AlertTitle>
                                    <AlertDescription className="text-xs">
                                        El rol de Administrador anula cualquier restricción. Cámbialo a Supervisor para aplicar permisos específicos.
                                    </AlertDescription>
                                </Alert>
                            )}
                            
                            <div className="space-y-6">
                                <h4 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                                    <Lock className="h-4 w-4 text-primary" />
                                    Módulos Generales
                                </h4>
                                <div className={cn(
                                    "grid grid-cols-1 sm:grid-cols-2 gap-3 transition-all",
                                    editUserForm.watch('role') === 'admin' && "opacity-40 grayscale pointer-events-none"
                                )}>
                                    {permissionLabels.map((item) => (
                                    <FormField
                                        key={item.id}
                                        control={editUserForm.control}
                                        name={`permissions.${item.id}`}
                                        render={({ field }) => (
                                        <FormItem className={cn(
                                            "flex flex-row items-center space-x-3 space-y-0 rounded-xl border p-3 hover:bg-muted/50 transition-all",
                                            field.value || editUserForm.watch('role') === 'admin' ? "bg-primary/5 border-primary/20" : "bg-background"
                                        )}>
                                            <FormControl>
                                                <Checkbox checked={editUserForm.watch('role') === 'admin' ? true : field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                            <FormLabel className="text-sm font-medium cursor-pointer">{item.label}</FormLabel>
                                        </FormItem>
                                        )}
                                    />
                                    ))}
                                </div>

                                <h4 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b pb-2 pt-4">
                                    <Settings className="h-4 w-4 text-blue-600" />
                                    Sub-funciones de Ajustes
                                </h4>
                                <div className={cn(
                                    "grid grid-cols-1 sm:grid-cols-2 gap-3 transition-all",
                                    editUserForm.watch('role') === 'admin' && "opacity-40 grayscale pointer-events-none"
                                )}>
                                    {granularSettingsLabels.map((item) => (
                                    <FormField
                                        key={item.id}
                                        control={editUserForm.control}
                                        name={`permissions.${item.id}`}
                                        render={({ field }) => (
                                        <FormItem className={cn(
                                            "flex flex-row items-center space-x-3 space-y-0 rounded-xl border p-3 hover:bg-blue-500/10 transition-all",
                                            field.value || editUserForm.watch('role') === 'admin' ? "bg-blue-500/5 border-blue-500/20" : "bg-background"
                                        )}>
                                            <FormControl>
                                                <Checkbox checked={editUserForm.watch('role') === 'admin' ? true : field.value as boolean} onCheckedChange={field.onChange} />
                                            </FormControl>
                                            <FormLabel className="text-sm font-medium cursor-pointer">{item.label}</FormLabel>
                                        </FormItem>
                                        )}
                                    />
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6 pt-4 border-t">
                                <div className="flex items-center gap-2">
                                    <Smartphone className="h-5 w-5 text-blue-600" />
                                    <h4 className="text-sm font-bold uppercase tracking-wider">Interfaz Móvil (Navigator Bar)</h4>
                                </div>

                                <FormField
                                    control={editUserForm.control}
                                    name="permissions.showMobileNavBar"
                                    render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-blue-50/20 border-blue-100">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base font-bold">Activar Navigator Bar Móvil</FormLabel>
                                        </div>
                                        <FormControl>
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                    </FormItem>
                                    )}
                                />

                                {editUserForm.watch('permissions.showMobileNavBar') && (
                                    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                                        <p className="text-xs font-bold text-muted-foreground uppercase">Secciones visibles (Máx. 5)</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {permissionLabels.slice(0, 9).map((item) => (
                                                <FormField
                                                    key={`edit-mobile-${item.id}`}
                                                    control={editUserForm.control}
                                                    name="permissions.mobileSections"
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value.includes(item.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        const current = [...field.value];
                                                                        if (checked) {
                                                                            if (current.length < 5) current.push(item.id);
                                                                            else toast({ variant: 'destructive', title: 'Límite alcanzado', description: 'Máximo 5 secciones.' });
                                                                        } else {
                                                                            const idx = current.indexOf(item.id);
                                                                            if (idx > -1) current.splice(idx, 1);
                                                                        }
                                                                        field.onChange(current);
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="text-xs font-medium cursor-pointer">{item.label}</FormLabel>
                                                        </FormItem>
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <DialogFooter className="border-t pt-6 gap-2">
                            <Button type="button" variant="ghost" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isEditing} className="px-10 font-bold h-12">
                                {isEditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Guardar Cambios
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    </div>
  );
}
