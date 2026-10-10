'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Activity, 
  RefreshCw, 
  Search, 
  Users, 
  Clock, 
  AlertTriangle, 
  UserX,
  Monitor,
  Shield,
  Clock3,
  LogOut,
  Power
} from 'lucide-react';
import type { AppUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

// Mapping of system paths to friendly Spanish names
const sectionMapping: Record<string, string> = {
  '/inicio': 'Inicio Principal',
  '/inicio/clientes': 'Directorio de Clientes',
  '/inicio/consultar-cliente': 'Consulta Rápida',
  '/inicio/prestamos': 'Cobranza Semanal',
  '/inicio/pendientes': 'Pagos Pendientes',
  '/inicio/cartera-vencida': 'Cartera Vencida',
  '/inicio/debes': 'Liquidación Semanal',
  '/inicio/bitacora': 'Bitácora',
  '/inicio/control': 'Control de Capital',
  '/inicio/avales': 'Módulo de Avales',
  '/inicio/ajustes': 'Ajustes del Sistema',
  '/inicio/personal': 'Gestión de Personal',
  '/inicio/imprenta': 'Servicio de Imprenta',
  '/dashboard': 'Inicio Principal',
  '/dashboard/clientes': 'Directorio de Clientes',
  '/dashboard/consultar-cliente': 'Consulta Rápida',
  '/dashboard/loans': 'Cobranza Semanal',
  '/dashboard/prestamos': 'Cobranza Semanal',
  '/dashboard/overduePortfolio': 'Pagos Pendientes',
  '/dashboard/pendientes': 'Pagos Pendientes',
  '/dashboard/carteraVencida': 'Cartera Vencida',
  '/dashboard/cartera-vencida': 'Cartera Vencida',
  '/dashboard/debes': 'Liquidación Semanal',
  '/dashboard/wallet': 'Bitácora',
  '/dashboard/bitacora': 'Bitácora',
  '/dashboard/control': 'Control de Capital',
  '/dashboard/avales': 'Módulo de Avales',
  '/dashboard/ajustes': 'Ajustes del Sistema',
  '/dashboard/personal': 'Gestión de Personal',
  '/dashboard/imprenta': 'Servicio de Imprenta',
};

// Helper to translate route path to friendly label
const getFriendlySection = (path?: string): string => {
  if (!path) return 'Ninguna (Inactivo)';
  
  // Try exact match first
  if (sectionMapping[path]) return sectionMapping[path];
  
  // Try prefix match for sub-routes, sorted by length descending
  const sortedKeys = Object.keys(sectionMapping).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (key !== '/inicio' && key !== '/dashboard' && path.startsWith(key)) {
      return sectionMapping[key];
    }
  }
  
  if (path.startsWith('/inicio') || path.startsWith('/dashboard')) return 'Inicio Principal';
  return path;
};

// Format elapsed time in user-friendly Spanish
const formatElapsedTime = (diffMins: number): string => {
  if (diffMins < 1) return 'Hace menos de 1 min';
  if (diffMins === 1) return 'Hace 1 min';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return 'Hace 1 hora';
  if (diffHours < 24) return `Hace ${diffHours} horas`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hace 1 día';
  return `Hace ${diffDays} días`;
};

interface MonitoreoManagementProps {
  users: AppUser[];
}

export function MonitoreoManagement({ users }: MonitoreoManagementProps) {
  const { appUser: currentLoggedUser } = useAuth();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [logoutUser, setLogoutUser] = useState<AppUser | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleForceLogout = async () => {
    if (!logoutUser) return;
    setIsLoggingOut(true);
    try {
      const userRef = doc(db, 'users', logoutUser.id);
      await updateDoc(userRef, {
        forceLogout: true
      });
      toast({
        title: 'Señal de cierre enviada',
        description: `Se cerrará la sesión de ${(logoutUser.username || '').toUpperCase()} en su próximo movimiento.`,
      });
      setConfirmDialogOpen(false);
      setLogoutUser(null);
    } catch (err) {
      console.error("Error remotely logging out user:", err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cerrar la sesión del usuario.',
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Force component to re-calculate elapsed time indicators every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Map users with dynamic status calculations
  const mappedUsers = useMemo(() => {
    return users.map((user) => {
      const lastActiveDate = user.lastActive ? new Date(user.lastActive) : null;
      let status: 'active' | 'inactive' | 'offline' = 'offline';
      let elapsedMins = Infinity;
      let statusLabel = 'Desconectado';

      if (lastActiveDate) {
        const diffMs = tick - lastActiveDate.getTime();
        elapsedMins = Math.max(0, Math.floor(diffMs / 60000));

        if (elapsedMins < 5) {
          status = 'active';
          statusLabel = 'Activo ahora';
        } else if (elapsedMins < 30) {
          status = 'inactive';
          statusLabel = 'Inactivo';
        } else {
          status = 'offline';
          statusLabel = 'Sin actividad reciente';
        }
      }

      return {
        ...user,
        status,
        statusLabel,
        elapsedMins,
        lastActiveDate,
      };
    });
  }, [users, tick]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = mappedUsers.length;
    const active = mappedUsers.filter((u) => u.status === 'active').length;
    const inactive = mappedUsers.filter((u) => u.status === 'inactive').length;
    const offline = total - active - inactive;

    return { total, active, inactive, offline };
  }, [mappedUsers]);

  // Search filtering
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return mappedUsers;
    const term = searchTerm.toLowerCase();
    return mappedUsers.filter(
      (u) =>
        (u.username || '').toLowerCase().includes(term) ||
        (u.role || '').toLowerCase().includes(term) ||
        (u.statusLabel || '').toLowerCase().includes(term) ||
        (getFriendlySection(u.currentSection) || '').toLowerCase().includes(term)
    );
  }, [mappedUsers, searchTerm]);

  const handleRefresh = () => {
    setTick(Date.now());
  };

  return (
    <div className="space-y-6">
      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-muted-foreground tracking-wider">
              Usuarios Registrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-100">{stats.total}</div>
            <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase">En catálogo general</div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-300 dark:bg-slate-700" />
        </Card>

        {/* Active Now */}
        <Card className="border-emerald-100 dark:border-emerald-950/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
              Activos Ahora
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{stats.active}</div>
            <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-semibold uppercase">Actividad &lt; 5 minutos</div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </Card>

        {/* Inactive */}
        <Card className="border-amber-100 dark:border-amber-950/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider">
              Usuarios Inactivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-amber-600 dark:text-amber-400">{stats.inactive}</div>
            <div className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-semibold uppercase">Inactivos (5 - 30 min)</div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
        </Card>

        {/* Offline */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-slate-500 tracking-wider">
              Sin Actividad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-500 dark:text-slate-400">{stats.offline}</div>
            <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase">Inactividad &gt; 30 min</div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-400" />
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-lg border-slate-200/60 dark:border-slate-800/40 overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Monitor className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Detalle de Sesiones Activas
            </CardTitle>
            <div className="flex items-center gap-2 max-w-md w-full justify-end">
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por usuario, rol o estado..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl bg-card border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 w-full shadow-sm"
                />
              </div>
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="flex items-center gap-2 border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50 rounded-xl h-9 px-3 text-xs font-bold shrink-0 transition-all duration-200 active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-8 py-4 font-bold text-xs">Usuario</TableHead>
                <TableHead className="font-bold text-xs">Rol</TableHead>
                <TableHead className="font-bold text-xs">Estado de Sesión</TableHead>
                <TableHead className="font-bold text-xs">Sección Actual</TableHead>
                <TableHead className="font-bold text-xs text-right">Última Interacción</TableHead>
                <TableHead className="font-bold text-xs text-right pr-8">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground uppercase text-xs italic font-bold">
                    No se encontraron usuarios activos con los filtros indicados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                    {/* Username */}
                    <TableCell className="pl-8 py-4 font-semibold text-sm uppercase text-slate-700 dark:text-slate-300">
                      {user.username}
                    </TableCell>

                    {/* Role */}
                    <TableCell>
                      <Badge 
                        variant={user.role === 'admin' ? 'default' : 'secondary'} 
                        className={cn(
                          "font-extrabold text-[9px] uppercase px-2 h-5 tracking-wider",
                          user.role === 'admin' 
                            ? "bg-indigo-600 text-white dark:bg-indigo-900/50 dark:text-indigo-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-850 dark:text-slate-400"
                        )}
                      >
                        <Shield className="h-3 w-3 mr-1 shrink-0" />
                        {user.role === 'admin' ? 'ADMINISTRADOR' : 'SUPERVISOR'}
                      </Badge>
                    </TableCell>

                    {/* Connection Status Indicator */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.status === 'active' && (
                          <span className="flex h-2.5 w-2.5 relative shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                        )}
                        {user.status === 'inactive' && (
                          <span className="flex h-2.5 w-2.5 relative shrink-0">
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                          </span>
                        )}
                        {user.status === 'offline' && (
                          <span className="flex h-2.5 w-2.5 relative shrink-0">
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400"></span>
                          </span>
                        )}
                        <span className={cn(
                          "text-xs font-bold tracking-wide uppercase",
                          user.status === 'active' && "text-emerald-600 dark:text-emerald-400",
                          user.status === 'inactive' && "text-amber-600 dark:text-amber-400",
                          user.status === 'offline' && "text-slate-500"
                        )}>
                          {user.statusLabel}
                        </span>
                      </div>
                    </TableCell>

                    {/* Current Section path translated */}
                    <TableCell>
                      {user.status !== 'offline' ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <Monitor className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{getFriendlySection(user.currentSection)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 italic font-semibold">---</span>
                      )}
                    </TableCell>

                    {/* Last Active Time */}
                    <TableCell className="text-right font-medium text-xs text-slate-600 dark:text-slate-400">
                      {user.lastActiveDate ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>
                            {user.status === 'active' 
                              ? 'Hace un momento' 
                              : formatElapsedTime(user.elapsedMins)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60 italic font-bold">Nunca activo</span>
                      )}
                    </TableCell>

                    {/* Actions Column with Cerrar Sesión Button */}
                    <TableCell className="pr-8 text-right">
                      {user.id !== currentLoggedUser?.id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setLogoutUser(user);
                            setConfirmDialogOpen(true);
                          }}
                          className="h-8 text-[10px] font-black uppercase border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-950/40 dark:text-rose-450 dark:hover:bg-rose-950/10 rounded-xl transition-all duration-200 active:scale-95 flex items-center gap-1.5 ml-auto"
                        >
                          <LogOut className="h-3 w-3" />
                          Cerrar Sesión
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-black uppercase select-none mr-2">
                          Sesión Actual
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Confirmation Modal for Session Termination */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Confirmar Cierre de Sesión
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-2">
              ¿Estás seguro de que deseas forzar el cierre de sesión para el usuario <strong className="uppercase text-slate-800 dark:text-slate-200">{logoutUser?.username}</strong>?
              <br /><br />
              Esto cerrará la sesión de su cuenta inmediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialogOpen(false);
                setLogoutUser(null);
              }}
              className="rounded-xl font-bold text-xs"
              disabled={isLoggingOut}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleForceLogout}
              className="rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-700"
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Cerrando...' : 'Cerrar Sesión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
