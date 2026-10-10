
'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
    User, LogOut, ChevronDown, UserCircle, 
    Settings2, Loader2, Save, KeyRound 
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { updatePassword } from 'firebase/auth';
import { saveUserAction } from '@/app/inicio/ajustes/actions';

export function UserNav() {
  const { user, signOut, appUser } = useAuth();
  const { toast } = useToast();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Profile form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (appUser) {
        setUsername(appUser.username);
    }
  }, [appUser, isProfileOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !appUser) return;
    
    setIsSaving(true);
    try {
        // 1. Update Password in Firebase Auth if provided
        if (password.trim().length >= 6) {
            try {
                await updatePassword(user, password);
            } catch (authError: any) {
                if (authError.code === 'auth/requires-recent-login') {
                    throw new Error('Por seguridad, debes cerrar sesión y volver a entrar para cambiar tu contraseña.');
                }
                throw authError;
            }
        }

        // 2. Update Firestore data (Username and Password visible for Cristobal)
        const updatedData = {
            ...appUser,
            username: username.toUpperCase(),
            password: password || appUser.password || '', // Keep old or update to new
        };
        // Remove id from data to satisfy Omit<AppUser, 'id'>
        const { id, ...dataToSave } = updatedData;

        const result = await saveUserAction(user.uid, dataToSave);
        
        if (result.success) {
            toast({
                title: 'Perfil Actualizado',
                description: 'Tus datos han sido guardados correctamente.',
            });
            setIsProfileOpen(false);
            setPassword(''); // Clear sensitive field
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error al actualizar',
            description: error.message,
        });
    } finally {
        setIsSaving(false);
    }
  };
  
  const displayUsername = appUser?.username || user?.email?.split('@')[0] || 'Usuario';

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative flex items-center gap-2 rounded-full pl-1 pr-3 py-0 h-9 hover:bg-muted/50 border border-transparent hover:border-border/40 transition-all active:scale-95">
          <Avatar className="h-7 w-7 border shadow-sm ring-1 ring-background">
            <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/40/40`} alt={displayUsername} />
            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
              {displayUsername.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline-block text-xs font-bold text-foreground/80 uppercase tracking-tight pr-1 leading-none">
            {displayUsername}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 mt-1 rounded-2xl p-2 shadow-2xl border-border/40" align="end" forceMount>
        <DropdownMenuLabel className="font-normal px-2 py-3">
          <div className="flex flex-col space-y-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Cuenta Activa</p>
            <p className="text-sm font-semibold leading-none truncate uppercase">{displayUsername}</p>
            <p className="text-[10px] leading-none text-muted-foreground/70 truncate">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="opacity-50" />
        <DropdownMenuGroup className="p-1">
          <DropdownMenuItem onClick={() => setIsProfileOpen(true)} className="rounded-lg cursor-pointer">
            <UserCircle className="mr-2 h-4 w-4" />
            <span className="text-xs font-medium">Mi Perfil</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
            <Link href="/inicio/ajustes" className="flex items-center w-full">
                <Settings2 className="mr-2 h-4 w-4" />
                <span className="text-xs font-medium">Preferencias</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="opacity-50" />
        <div className="p-1">
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer rounded-lg font-bold text-xs">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Cerrar sesión</span>
            </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
            <DialogHeader>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Mi Perfil de Usuario
                </DialogTitle>
                <DialogDescription>
                    Actualiza tu nombre de acceso y contraseña de seguridad.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
                <div className="space-y-2">
                    <Label htmlFor="username" className="font-bold text-xs uppercase text-muted-foreground">Nombre de Usuario</Label>
                    <Input 
                        id="username" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)}
                        className="uppercase h-11 border-2 focus:ring-primary"
                        placeholder="Ej: CRISTOBAL_M"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="pass" className="font-bold text-xs uppercase text-muted-foreground">Nueva Contraseña</Label>
                    <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            id="pass" 
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-10 h-11 border-2 focus:ring-primary"
                            placeholder="Dejar en blanco para no cambiar"
                        />
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">Mínimo 6 caracteres si decides cambiarla.</p>
                </div>
            </div>
            <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setIsProfileOpen(false)} disabled={isSaving}>
                    Cancelar
                </Button>
                <Button onClick={handleSaveProfile} disabled={isSaving} className="font-bold px-8">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Cambios
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
