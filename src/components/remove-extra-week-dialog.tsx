'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CalendarX2, ShieldAlert, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { removeExtraWeekPenaltyAction } from '@/app/inicio/actions';
import { useAuth } from '@/hooks/use-auth';
import type { Loan } from '@/lib/types';

interface RemoveExtraWeekDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  clientName?: string;
  onSuccess?: () => void;
}

const AUTH_PASSWORD = "Lacrimosa_12";

export function RemoveExtraWeekDialog({
  isOpen,
  onOpenChange,
  loan,
  clientName,
  onSuccess,
}: RemoveExtraWeekDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { appUser } = useAuth();

  const handleClose = () => {
    setPassword('');
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Debes ingresar la contraseña de autorización.');
      return;
    }

    if (password !== AUTH_PASSWORD) {
      setError('Contraseña de autorización incorrecta.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await removeExtraWeekPenaltyAction(loan.id, password, appUser?.id);

      if (result.success) {
        toast({
          title: 'Semana Extra Eliminada',
          description: result.message || 'Se ha retirado la semana extra de penalización exitosamente.',
        });
        handleClose();
        if (onSuccess) onSuccess();
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar la semana extra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-700 dark:text-rose-400">
              <CalendarX2 className="h-5 w-5 text-rose-600" />
              Eliminar Semana Extra
            </DialogTitle>
            <DialogDescription className="text-xs">
              Retirar la penalización de la semana extra a{' '}
              <strong className="text-foreground">{clientName || 'este cliente'}</strong>.
            </DialogDescription>
          </DialogHeader>

          <Alert className="bg-rose-50 border-rose-200 py-2.5 dark:bg-rose-950/30 dark:border-rose-900/50">
            <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <AlertTitle className="text-xs font-bold text-rose-900 dark:text-rose-200">
              Penalización de Semana Extra
            </AlertTitle>
            <AlertDescription className="text-[11px] text-rose-800 dark:text-rose-300 leading-snug mt-1">
              Al autorizar esta acción, el préstamo volverá a su plazo base original, no se agregará la semana adicional de cobro y su cuota será descontada del saldo total a liquidar.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-destructive flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Contraseña de Autorización
            </Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              className="h-10 border-2 border-destructive/20 focus:ring-destructive font-mono"
              autoFocus
            />
            {error && (
              <p className="text-[11px] font-bold text-destructive animate-in fade-in-50">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isSubmitting}
              className="font-bold shadow-sm"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Autorizar y Eliminar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
