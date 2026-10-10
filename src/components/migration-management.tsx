
'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
import { ArrowRightLeft, Loader2, Building, MapPin, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Plaza, Localidad, Promotora } from '@/lib/types';
import { migrateLocalidadAction } from '@/app/inicio/ajustes/actions';
import { useRealtimeData } from '@/hooks/use-realtime-data';

interface MigrationManagementProps {
    initialPlazas: Plaza[];
    initialLocalidades: Localidad[];
    initialPromotoras: Promotora[];
}

export function MigrationManagement({ initialPlazas, initialLocalidades, initialPromotoras }: MigrationManagementProps) {
    const { data } = useRealtimeData(undefined, {
        enabledCollections: ['plazas', 'localidades', 'promotoras']
    });
    const { toast } = useToast();
    const [isMigrating, setIsMigrating] = useState(false);
    const [selectedLocalidadId, setSelectedLocalidadId] = useState<string>('');
    const [targetPlazaId, setTargetPlazaId] = useState<string>('');

    const plazas = data?.plazas ?? initialPlazas;
    const localidades = data?.localidades ?? initialLocalidades;
    const promotoras = data?.promotoras ?? initialPromotoras;

    const selectedLocalidad = useMemo(() => 
        localidades.find(l => l.id === selectedLocalidadId),
    [selectedLocalidadId, localidades]);

    const currentPlaza = useMemo(() => 
        plazas.find(p => p.id === selectedLocalidad?.plazaId),
    [selectedLocalidad, plazas]);

    const linkedPromotorasCount = useMemo(() => 
        promotoras.filter(p => p.localidadId === selectedLocalidadId).length,
    [selectedLocalidadId, promotoras]);

    const handleMigrate = async () => {
        if (!selectedLocalidadId || !targetPlazaId) return;
        
        setIsMigrating(true);
        try {
            const result = await migrateLocalidadAction(selectedLocalidadId, targetPlazaId);
            if (result.success) {
                toast({ title: 'Migración Completada', description: result.message });
                setSelectedLocalidadId('');
                setTargetPlazaId('');
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error de Migración', description: error.message });
        } finally {
            setIsMigrating(false);
        }
    };

    const targetPlazaName = plazas.find(p => p.id === targetPlazaId)?.name || '';

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Migración Estructural</h2>
                <p className="text-muted-foreground">Transfiere localidades completas entre diferentes plazas de operación.</p>
            </div>

            <Card className="shadow-lg border-blue-100 overflow-hidden">
                <CardHeader className="bg-blue-50/50 border-b">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                        Traslado de Localidad
                    </CardTitle>
                    <CardDescription>Esta acción moverá la localidad y todas sus promotoras asociadas a la nueva plaza seleccionada.</CardDescription>
                </CardHeader>
                <CardContent className="pt-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Source Selection */}
                        <div className="space-y-4 p-6 rounded-2xl bg-muted/30 border-2 border-dashed">
                            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                <MapPin className="h-4 w-4" /> Localidad Origen
                            </h3>
                            <Select value={selectedLocalidadId} onValueChange={setSelectedLocalidadId}>
                                <SelectTrigger className="h-12 bg-background">
                                    <SelectValue placeholder="Selecciona Localidad..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...localidades].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(l => (
                                        <SelectItem key={l.id} value={l.id}>
                                            {l.name} ({plazas.find(p => p.id === l.plazaId)?.name})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {selectedLocalidad && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="bg-background rounded-lg p-4 border shadow-sm space-y-2">
                                        <div className="flex justify-between text-xs font-medium">
                                            <span className="text-muted-foreground">Plaza Actual:</span>
                                            <span className="font-bold uppercase">{currentPlaza?.name}</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-medium">
                                            <span className="text-muted-foreground">Promotoras:</span>
                                            <span className="font-bold text-blue-600">{linkedPromotorasCount}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Destination Selection */}
                        <div className="space-y-4 p-6 rounded-2xl bg-blue-50/20 border-2 border-blue-100 border-dashed">
                            <h3 className="font-bold text-sm uppercase tracking-wider text-blue-700 flex items-center gap-2">
                                <Building className="h-4 w-4" /> Plaza Destino
                            </h3>
                            <Select 
                                value={targetPlazaId} 
                                onValueChange={setTargetPlazaId}
                                disabled={!selectedLocalidadId}
                            >
                                <SelectTrigger className="h-12 bg-background border-blue-200">
                                    <SelectValue placeholder="Selecciona Plaza..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...plazas]
                                        .filter(p => p.id !== selectedLocalidad?.plazaId)
                                        .sort((a,b) => (a?.name || '').localeCompare(b?.name || ''))
                                        .map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>

                            {targetPlazaId && (
                                <div className="bg-blue-600/10 rounded-lg p-4 border border-blue-600/20 text-center animate-pulse">
                                    <p className="text-[10px] font-bold text-blue-700 uppercase">Nueva ubicación detectada</p>
                                    <p className="text-sm font-bold text-blue-900 uppercase">{targetPlazaName}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedLocalidadId && targetPlazaId && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-bold text-amber-900">Advertencia de Impacto</p>
                                <p className="text-amber-700">
                                    Al mover <strong>{selectedLocalidad?.name}</strong> a <strong>{targetPlazaName}</strong>, 
                                    todas las promotoras y sus préstamos se verán reflejados inmediatamente en los reportes de la nueva plaza.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end pt-4">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button 
                                    size="lg" 
                                    className="h-14 px-10 font-bold text-lg"
                                    disabled={!selectedLocalidadId || !targetPlazaId || isMigrating}
                                >
                                    {isMigrating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRightLeft className="mr-2 h-5 w-5" />}
                                    Confirmar Migración Masiva
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-2xl">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-xl">¿Ejecutar Migración Estructural?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-base">
                                        Estás a punto de mover la localidad <span className="font-bold uppercase text-foreground">{selectedLocalidad?.name}</span> desde la plaza actual hacia <span className="font-bold uppercase text-blue-600">{targetPlazaName}</span>.
                                        <br /><br />
                                        Todos los registros financieros y operativos cambiarán de jerarquía permanentemente.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleMigrate} className="bg-blue-600 hover:bg-blue-700 rounded-xl px-8">
                                        Sí, Migrar Todo
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
