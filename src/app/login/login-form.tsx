'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

const formSchema = z.object({
  username: z.string().min(3, 'El usuario debe tener al menos 3 caracteres.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

type LoginFormValues = z.infer<typeof formSchema>;

const DUMMY_DOMAIN = 'credicontrol.app';

export function LoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { signIn } = useAuth();
  const router = useRouter();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    const email = `${values.username.toLowerCase()}@${DUMMY_DOMAIN}`;

    try {
      await signIn(email, values.password);
      router.push('/inicio');
    } catch (error: any) {
        let errorMessage = error.message;
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            errorMessage = 'Usuario o contraseña incorrectos.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Demasiados intentos fallidos. Inténtalo de nuevo más tarde.';
        }
       toast({
          variant: 'destructive',
          title: 'Error de Inicio de Sesión',
          description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                  <FormItem className="space-y-1.5">
                  <FormLabel className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Usuario</FormLabel>
                  <FormControl>
                      <Input 
                        placeholder="Ej: CRISTOBAL" 
                        {...field} 
                        className="uppercase h-11 bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400 rounded-xl focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/10 focus-visible:ring-blue-500/10 focus-visible:ring-offset-0 focus:bg-white transition-all shadow-sm font-medium text-sm border-[1px]" 
                      />
                  </FormControl>
                  <FormMessage className="text-[11px] font-semibold text-red-500/90" />
                  </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                  <FormItem className="space-y-1.5">
                  <FormLabel className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Contraseña</FormLabel>
                  <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        {...field} 
                        className="h-11 bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400 rounded-xl focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/10 focus-visible:ring-blue-500/10 focus-visible:ring-offset-0 focus:bg-white transition-all shadow-sm text-sm border-[1px]" 
                      />
                  </FormControl>
                  <FormMessage className="text-[11px] font-semibold text-red-500/90" />
                  </FormItem>
              )}
            />
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold tracking-wide shadow-[0_6px_20px_rgba(37,99,235,0.18)] hover:shadow-[0_10px_25px_rgba(37,99,235,0.35)] rounded-xl transition-all duration-300 h-11 active:scale-[0.97] mt-3 border-0"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />}
              {isSubmitting ? 'Verificando...' : 'Acceder'}
            </Button>
        </form>
    </Form>
  );
}
