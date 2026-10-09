'use client';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { deleteClientAction } from '@/app/dashboard/clientes/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
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

interface ClientPageActionsProps {
    clientId: string;
}

export function ClientPageActions({ clientId }: ClientPageActionsProps) {
    const { appUser } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    
    const isCristobal = useMemo(() => appUser?.username?.toUpperCase() === 'CRISTOBAL', [appUser]);
    const canEdit = appUser?.role === 'admin' || (appUser?.permissions && appUser.permissions.editClients);

    if (!appUser) return null;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const result = await deleteClientAction(clientId);
            if (result.success) {
                toast({ title: 'Cliente Eliminado', description: result.message });
                router.replace('/dashboard/clientes');
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
        <div className="flex items-center gap-2">
            {canEdit && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold">
                    <Link href={`/dashboard/clientes/${clientId}/edit`}>
                        <Edit className="mr-1.5 h-3.5 w-3.5" />
                        Editar Cliente
                    </Link>
                </Button>
            )}
            
            {isCristobal && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="h-8 text-xs font-semibold">
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Eliminar
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción eliminará permanentemente al cliente y **TODOS sus préstamos e historial de pagos**. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-white">
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sí, eliminar cliente"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
}
