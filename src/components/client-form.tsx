'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import type { Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { 
  Loader2, 
  User, 
  Phone, 
  Home, 
  Shield, 
  UserCheck, 
  Save
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { saveClientAction } from '@/app/inicio/clientes/actions';
import { parseEndorsement } from '@/lib/utils';

const formSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  phone: z.string().min(7, 'El teléfono debe tener al menos 7 dígitos.'),
  email: z.string().optional().or(z.literal('')),
  street: z.string().min(3, 'La calle y número son requeridos.'),
  neighborhood: z.string().min(2, 'La colonia es requerida.'),
  postalCode: z.string().min(4, 'El código postal es requerido.'),
  city: z.string().min(2, 'La ciudad es requerida.'),
  guarantee: z.string().optional().or(z.literal('')),
  
  // Campos estructurados del Aval
  endorsementName: z.string().optional().or(z.literal('')),
  endorsementPhone: z.string().optional().or(z.literal('')),
  endorsementStreet: z.string().optional().or(z.literal('')),
  endorsementNeighborhood: z.string().optional().or(z.literal('')),
  endorsementPostalCode: z.string().optional().or(z.literal('')),
  endorsementCity: z.string().optional().or(z.literal('')),
  endorsementGuarantee: z.string().optional().or(z.literal('')),
});

type ClientFormValues = z.infer<typeof formSchema>;

interface ClientFormProps {
  client: Client;
}

export function ClientForm({ client }: ClientFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Parsea de forma inteligente el aval actual para llenar inputs individuales
  const currentEndorsement = parseEndorsement(client.endorsement || '');

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: client.name || '',
      phone: client.phone || '',
      email: client.email || '',
      street: client.street || '',
      neighborhood: client.neighborhood || '',
      postalCode: client.postalCode || '',
      city: client.city || '',
      guarantee: client.guarantee || '',
      endorsementName: currentEndorsement.name || '',
      endorsementPhone: currentEndorsement.phone || '',
      endorsementStreet: currentEndorsement.street || '',
      endorsementNeighborhood: currentEndorsement.neighborhood || '',
      endorsementPostalCode: currentEndorsement.postalCode || '',
      endorsementCity: currentEndorsement.city || '',
      endorsementGuarantee: currentEndorsement.guarantees || '',
    },
  });

  const onSubmit = async (values: ClientFormValues) => {
    setIsSubmitting(true);
    try {
      // Reconstruir la cadena estructurada del aval de acuerdo a la convención del sistema
      let fullEndorsement = '';
      const rawName = values.endorsementName?.trim().toUpperCase() || '';
      
      if (rawName) {
        const addressParts = [
          values.endorsementStreet?.trim().toUpperCase(),
          values.endorsementNeighborhood?.trim().toUpperCase(),
          values.endorsementPostalCode?.trim().toUpperCase(),
          values.endorsementCity?.trim().toUpperCase(),
          values.endorsementPhone?.trim() ? `Tel: ${values.endorsementPhone.trim().toUpperCase()}` : '',
          values.endorsementGuarantee?.trim() ? `Garantía: ${values.endorsementGuarantee.trim().toUpperCase()}` : ''
        ].filter(Boolean);

        const detailsString = addressParts.join(', ');
        fullEndorsement = detailsString ? `${rawName} (${detailsString})` : rawName;
      }

      const clientDataToSave = {
        name: values.name.trim().toUpperCase(),
        phone: values.phone.trim().toUpperCase(),
        email: values.email?.trim() || client.email || '',
        street: values.street.trim().toUpperCase(),
        neighborhood: values.neighborhood.trim().toUpperCase(),
        postalCode: values.postalCode.trim().toUpperCase(),
        city: values.city.trim().toUpperCase(),
        guarantee: values.guarantee?.trim().toUpperCase() || '',
        endorsement: fullEndorsement,
        avatarUrl: client.avatarUrl || '',
      };

      const result = await saveClientAction(client.id, clientDataToSave);

      if (result.success) {
        toast({
          title: 'Cliente Actualizado',
          description: `Los datos de ${values.name} se han guardado correctamente.`,
        });
        router.push(`/inicio/clientes/${client.id}`);
        router.refresh();
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar',
        description: error.message || 'Hubo un error al guardar los datos del cliente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          
          {/* COLUMNA 1: DATOS DEL TITULAR (CLIENTE) */}
          <div className="space-y-4">
            {/* Tarjeta: Información de Contacto */}
            <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                      Datos Personales del Titular
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400">
                    Titular
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Nombre Completo <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="NOMBRE Y APELLIDOS DEL CLIENTE" 
                          {...field} 
                          className="h-9 text-xs uppercase font-medium" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        Teléfono <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="EJ. 333 123 4567" 
                          {...field} 
                          className="h-9 text-xs uppercase font-medium" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Tarjeta: Domicilio Particular */}
            <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    Domicilio Particular
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Calle y Número <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="EJ: AV. HIDALGO 123, INT. 4" 
                          {...field} 
                          className="h-9 text-xs uppercase font-medium" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="neighborhood"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Colonia <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ: CENTRO" 
                            {...field} 
                            className="h-9 text-xs uppercase font-medium" 
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Código Postal <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ: 44100" 
                            {...field} 
                            className="h-9 text-xs uppercase font-medium" 
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Ciudad <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ: GUADALAJARA" 
                            {...field} 
                            className="h-9 text-xs uppercase font-medium" 
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Tarjeta: Garantías del Cliente */}
            <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    Garantías Presentadas por el Titular
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <FormField
                  control={form.control}
                  name="guarantee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Bienes o Documentos en Garantía
                      </FormLabel>
                      <FormControl>
                        <Textarea 
                          rows={3}
                          placeholder="Describe las garantías del cliente (ej. Pagaré firmado, factura de motocicleta, nómina...)" 
                          {...field} 
                          className="text-xs uppercase resize-none font-medium leading-relaxed" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* COLUMNA 2: INFORMACIÓN DEL AVAL (OBLIGADO SOLIDARIO) */}
          <div className="space-y-4">
            <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 bg-blue-50/40 dark:bg-blue-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-xs font-black uppercase tracking-wider text-blue-950 dark:text-blue-200">
                      Información del Aval Solidario
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400">
                    Garante
                  </Badge>
                </div>
                <CardDescription className="text-[11px] text-zinc-500 mt-1">
                  Ingresa los datos del aval de forma estructurada. Se vincularán al expediente del cliente.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <FormField
                  control={form.control}
                  name="endorsementName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Nombre Completo del Aval
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="NOMBRE DEL AVAL (O DEJAR EN BLANCO SI NO APLICA)" 
                          {...field} 
                          className="h-9 text-xs uppercase font-medium" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endorsementPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        Teléfono del Aval
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="EJ: 333 987 6543" 
                          {...field} 
                          className="h-9 text-xs uppercase font-medium" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endorsementStreet"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <Home className="h-3 w-3 text-muted-foreground" />
                        Dirección del Aval (Calle y Número)
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="EJ: CALLE JUAREZ 456" 
                          {...field} 
                          className="h-9 text-xs uppercase font-medium" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="endorsementNeighborhood"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Colonia
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ: LAS AGUILAS" 
                            {...field} 
                            className="h-9 text-xs uppercase font-medium" 
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endorsementPostalCode"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          C.P.
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ: 45080" 
                            {...field} 
                            className="h-9 text-xs uppercase font-medium" 
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endorsementCity"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Ciudad
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ: ZAPOPAN" 
                            {...field} 
                            className="h-9 text-xs uppercase font-medium" 
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="endorsementGuarantee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-muted-foreground" />
                        Garantías del Aval
                      </FormLabel>
                      <FormControl>
                        <Textarea 
                          rows={3}
                          placeholder="Describe las garantías o bienes que respaldan al aval (escrituras, recibo de nómina, etc.)" 
                          {...field} 
                          className="text-xs uppercase resize-none font-medium leading-relaxed" 
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* BARRA INFERIOR DE ACCIÓN (COMPACTA Y FIJA/DESTACADA) */}
        <div className="bg-white dark:bg-zinc-950 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            Asegúrate de verificar los datos de contacto y domicilio antes de guardar.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              className="h-9 text-xs font-semibold px-4"
              onClick={() => router.push(`/inicio/clientes/${client.id}`)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              size="sm"
              className="h-9 text-xs font-bold px-5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs gap-1.5"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
