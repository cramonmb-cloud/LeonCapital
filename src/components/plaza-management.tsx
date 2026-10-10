'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  MapPin,
  Users,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  Star,
  Search,
  X,
  Loader2,
  Columns3,
  Table as TableIcon,
  Phone,
  Link as LinkIcon,
  Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Plaza, Localidad, Promotora, Personal } from '@/lib/types';
import {
  savePlazaAction,
  deletePlazaAction,
  saveLocalidadAction,
  deleteLocalidadAction,
  savePromotoraAction,
  deletePromotoraAction,
} from '@/app/inicio/ajustes/actions';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

// Schemas
const plazaSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres.').toUpperCase(),
  highlight: z.boolean().optional(),
});

const localidadSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres.').toUpperCase(),
  plazaId: z.string().min(1, 'Selecciona una plaza.'),
  highlight: z.boolean().optional(),
});

const promotoraSchema = z.object({
  name: z.string().min(1, 'El nombre/código del grupo es obligatorio.').toUpperCase(),
  localidadId: z.string().min(1, 'Selecciona una localidad.'),
  personalId: z.string().optional(),
  highlight: z.boolean().optional(),
});

type PlazaFormValues = z.infer<typeof plazaSchema>;
type LocalidadFormValues = z.infer<typeof localidadSchema>;
type PromotoraFormValues = z.infer<typeof promotoraSchema>;

interface PlazaManagementProps {
  initialPlazas: Plaza[];
  initialLocalidades: Localidad[];
  initialPromotoras: Promotora[];
  initialPersonal?: Personal[];
}

export function PlazaManagement({
  initialPlazas,
  initialLocalidades,
  initialPromotoras,
  initialPersonal,
}: PlazaManagementProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'columns' | 'table'>('columns');
  const [selectedPlazaId, setSelectedPlazaId] = useState<string>('');
  const [selectedLocalidadId, setSelectedLocalidadId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [showAllPersonal, setShowAllPersonal] = useState(false);

  // Dialog states for Create / Edit
  const [plazaModalOpen, setPlazaModalOpen] = useState(false);
  const [localidadModalOpen, setLocalidadModalOpen] = useState(false);
  const [promotoraModalOpen, setPromotoraModalOpen] = useState(false);

  const [editingPlaza, setEditingPlaza] = useState<Plaza | null>(null);
  const [editingLocalidad, setEditingLocalidad] = useState<Localidad | null>(null);
  const [editingPromotora, setEditingPromotora] = useState<Promotora | null>(null);

  // Delete confirm state
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'plaza' | 'localidad' | 'promotora';
    id: string;
    name: string;
  } | null>(null);

  const { data, loading } = useRealtimeData(undefined, {
    enabledCollections: ['plazas', 'localidades', 'promotoras', 'personal'],
  });
  const { toast } = useToast();

  const plazas = data?.plazas ?? initialPlazas;
  const localidades = data?.localidades ?? initialLocalidades;
  const promotoras = data?.promotoras ?? initialPromotoras;
  const personalList = data?.personal ?? initialPersonal ?? [];

  // Alphabetically sorted Plazas
  const sortedPlazas = useMemo(() => {
    return [...plazas].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true })
    );
  }, [plazas]);

  // Alphabetically sorted Localidades
  const sortedLocalidades = useMemo(() => {
    return [...localidades].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true })
    );
  }, [localidades]);

  // Active selected plaza fallback (from sorted plazas)
  const activePlaza = useMemo(() => {
    if (!sortedPlazas.length) return null;
    const found = sortedPlazas.find((p) => p.id === selectedPlazaId);
    return found || sortedPlazas[0];
  }, [sortedPlazas, selectedPlazaId]);

  // Localidades for active plaza (preserved alphabetical order)
  const activePlazaLocalidades = useMemo(() => {
    if (!activePlaza) return [];
    return sortedLocalidades.filter((l) => l.plazaId === activePlaza.id);
  }, [sortedLocalidades, activePlaza]);

  // Filtered and alphabetically sorted personal for assignment
  const eligiblePersonal = useMemo(() => {
    let list = personalList;
    if (!showAllPersonal) {
      list = personalList.filter((p) => {
        const tipo = (p.tipoPersonal || '').toUpperCase();
        return tipo.includes('PROMOTOR');
      });
    }
    return [...list].sort((a, b) =>
      `${a.nombre} ${a.apellidoPaterno}`.localeCompare(
        `${b.nombre} ${b.apellidoPaterno}`,
        'es',
        { sensitivity: 'base' }
      )
    );
  }, [personalList, showAllPersonal]);

  // Forms setup
  const plazaForm = useForm<PlazaFormValues>({
    resolver: zodResolver(plazaSchema),
    defaultValues: { name: '', highlight: false },
  });

  const localidadForm = useForm<LocalidadFormValues>({
    resolver: zodResolver(localidadSchema),
    defaultValues: { name: '', plazaId: '', highlight: false },
  });

  const promotoraForm = useForm<PromotoraFormValues>({
    resolver: zodResolver(promotoraSchema),
    defaultValues: { name: '', localidadId: '', personalId: '', highlight: false },
  });

  // Modal Open Handlers
  const handleOpenNewPlaza = () => {
    setEditingPlaza(null);
    plazaForm.reset({ name: '', highlight: false });
    setPlazaModalOpen(true);
  };

  const handleOpenEditPlaza = (plaza: Plaza) => {
    setEditingPlaza(plaza);
    plazaForm.reset({ name: plaza.name, highlight: plaza.highlight || false });
    setPlazaModalOpen(true);
  };

  const handleOpenNewLocalidad = (preselectedPlazaId?: string) => {
    setEditingLocalidad(null);
    localidadForm.reset({
      name: '',
      plazaId: preselectedPlazaId || activePlaza?.id || '',
      highlight: false,
    });
    setLocalidadModalOpen(true);
  };

  const handleOpenEditLocalidad = (localidad: Localidad) => {
    setEditingLocalidad(localidad);
    localidadForm.reset({
      name: localidad.name,
      plazaId: localidad.plazaId,
      highlight: localidad.highlight || false,
    });
    setLocalidadModalOpen(true);
  };

  const handleOpenNewPromotora = (preselectedLocalidadId?: string) => {
    setEditingPromotora(null);
    const locId =
      preselectedLocalidadId ||
      (selectedLocalidadId !== 'all' ? selectedLocalidadId : activePlazaLocalidades[0]?.id || '');

    promotoraForm.reset({
      name: '',
      localidadId: locId,
      personalId: '',
      highlight: false,
    });
    setPromotoraModalOpen(true);
  };

  const handleOpenEditPromotora = (promotora: Promotora) => {
    setEditingPromotora(promotora);
    promotoraForm.reset({
      name: promotora.name,
      localidadId: promotora.localidadId,
      personalId: promotora.personalId || '',
      highlight: promotora.highlight || false,
    });
    setPromotoraModalOpen(true);
  };

  // Submit Handlers
  const onSubmitPlaza = async (values: PlazaFormValues) => {
    setIsSaving(true);
    try {
      const res = await savePlazaAction(
        values.name.trim().toUpperCase(),
        values.highlight || false,
        editingPlaza?.id
      );

      if (res.success) {
        toast({
          title: editingPlaza ? 'Plaza actualizada' : 'Plaza registrada',
          description: res.message,
        });
        setPlazaModalOpen(false);
      } else {
        toast({ title: 'Error', description: res.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al guardar la plaza.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const onSubmitLocalidad = async (values: LocalidadFormValues) => {
    setIsSaving(true);
    try {
      const res = await saveLocalidadAction(
        {
          name: values.name.trim().toUpperCase(),
          plazaId: values.plazaId,
          highlight: values.highlight || false,
        },
        editingLocalidad?.id
      );

      if (res.success) {
        toast({
          title: editingLocalidad ? 'Localidad actualizada' : 'Localidad registrada',
          description: res.message,
        });
        setLocalidadModalOpen(false);
      } else {
        toast({ title: 'Error', description: res.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al guardar la localidad.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const onSubmitPromotora = async (values: PromotoraFormValues) => {
    setIsSaving(true);
    try {
      const res = await savePromotoraAction(
        {
          name: values.name.trim().toUpperCase(),
          localidadId: values.localidadId,
          personalId: values.personalId && values.personalId !== '__none__' ? values.personalId : '',
          highlight: values.highlight || false,
        },
        editingPromotora?.id
      );

      if (res.success) {
        toast({
          title: editingPromotora ? 'Promotora actualizada' : 'Promotora registrada',
          description: res.message,
        });
        setPromotoraModalOpen(false);
      } else {
        toast({ title: 'Error', description: res.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al guardar la promotora.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Action
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsSaving(true);
    try {
      let res;
      if (itemToDelete.type === 'plaza') {
        res = await deletePlazaAction(itemToDelete.id);
      } else if (itemToDelete.type === 'localidad') {
        res = await deleteLocalidadAction(itemToDelete.id);
      } else {
        res = await deletePromotoraAction(itemToDelete.id);
      }

      if (res.success) {
        toast({
          title: 'Registro eliminado',
          description: res.message,
        });
        setItemToDelete(null);
      } else {
        toast({ title: 'Error', description: res.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar el registro.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Column 3 Promotoras list
  const columnPromotoras = useMemo(() => {
    if (!activePlaza) return [];
    let list = promotoras.filter((p) => {
      const loc = localidades.find((l) => l.id === p.localidadId);
      if (!loc || loc.plazaId !== activePlaza.id) return false;
      if (selectedLocalidadId !== 'all' && p.localidadId !== selectedLocalidadId) return false;
      return true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const assigned = personalList.find((per) => per.id === p.personalId);
        const persName = assigned
          ? `${assigned.nombre} ${assigned.apellidoPaterno} ${assigned.apellidoMaterno || ''}`.toLowerCase()
          : '';
        const loc = localidades.find((l) => l.id === p.localidadId);
        return (
          p.name.toLowerCase().includes(q) ||
          persName.includes(q) ||
          (loc && loc.name.toLowerCase().includes(q))
        );
      });
    }

    if (filterAssigned === 'assigned') {
      list = list.filter((p) => !!p.personalId);
    } else if (filterAssigned === 'unassigned') {
      list = list.filter((p) => !p.personalId);
    }

    return list.sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true })
    );
  }, [
    activePlaza,
    promotoras,
    localidades,
    selectedLocalidadId,
    searchQuery,
    filterAssigned,
    personalList,
  ]);

  // Full Flat Table list
  const fullTablePromotoras = useMemo(() => {
    let list = promotoras;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const loc = localidades.find((l) => l.id === p.localidadId);
        const plaza = loc ? plazas.find((pl) => pl.id === loc.plazaId) : null;
        const assigned = personalList.find((per) => per.id === p.personalId);
        const persName = assigned
          ? `${assigned.nombre} ${assigned.apellidoPaterno} ${assigned.apellidoMaterno || ''}`.toLowerCase()
          : '';
        return (
          p.name.toLowerCase().includes(q) ||
          persName.includes(q) ||
          (loc && loc.name.toLowerCase().includes(q)) ||
          (plaza && plaza.name.toLowerCase().includes(q))
        );
      });
    }

    if (filterAssigned === 'assigned') {
      list = list.filter((p) => !!p.personalId);
    } else if (filterAssigned === 'unassigned') {
      list = list.filter((p) => !p.personalId);
    }

    return list.sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true })
    );
  }, [promotoras, localidades, plazas, personalList, searchQuery, filterAssigned]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* BARRA SUPERIOR COMPACTA DE CONTROL */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-card px-3.5 py-2 rounded-xl border border-border shadow-xs">
        {/* Izquierda: Título y Selector de Vista */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-xs md:text-sm font-black uppercase tracking-tight text-foreground">
              Localidades y Promotoras
            </h3>
          </div>

          <div className="h-4 w-[1px] bg-border hidden sm:block" />

          {/* Toggle de Modo: Columnas vs Tabla */}
          <div className="inline-flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setViewMode('columns')}
              className={cn(
                'px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5',
                viewMode === 'columns'
                  ? 'bg-background text-foreground shadow-xs font-black'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Columns3 className="h-3 w-3 text-primary" />
              Columnas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5',
                viewMode === 'table'
                  ? 'bg-background text-foreground shadow-xs font-black'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TableIcon className="h-3 w-3 text-emerald-600" />
              Tabla General ({promotoras.length})
            </button>
          </div>
        </div>

        {/* Derecha: Buscador y Acciones Compactas */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Buscador ultra compacto */}
          <div className="relative w-full sm:w-44 md:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar grupo, personal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 h-7 text-xs rounded-lg bg-background border-border/80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Botones de creación compactos */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenNewPlaza}
            className="h-7 px-2 text-[11px] font-bold rounded-lg border-border hover:border-primary/50"
            title="Crear nueva Plaza"
          >
            <Plus className="h-3 w-3 mr-1 text-primary" />
            Plaza
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenNewLocalidad(activePlaza?.id)}
            className="h-7 px-2 text-[11px] font-bold rounded-lg border-border hover:border-blue-500/50"
            title="Crear nueva Localidad"
          >
            <Plus className="h-3 w-3 mr-1 text-blue-600" />
            Localidad
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenNewPromotora()}
            className="h-7 px-2.5 text-[11px] font-bold rounded-lg bg-primary text-white hover:bg-primary/90"
            title="Registrar nueva Promotora"
          >
            <Plus className="h-3 w-3 mr-1" />
            Promotora
          </Button>
        </div>
      </div>

      {/* VISTA 1: EXPLORADOR EN 3 COLUMNAS COMPACTAS Y SINCRONIZADAS */}
      {viewMode === 'columns' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 bg-card p-2 rounded-xl border border-border shadow-xs min-h-[460px]">
          {/* COLUMNA 1: PLAZAS (3/12) */}
          <div className="md:col-span-3 flex flex-col border border-border/60 rounded-lg bg-muted/15 overflow-hidden">
            {/* Header Columna 1 */}
            <div className="px-3 py-2 border-b border-border/60 bg-muted/40 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-primary" />
                Plazas ({plazas.length})
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenNewPlaza}
                className="h-5 w-5 text-primary hover:bg-primary/10 rounded"
                title="Nueva Plaza"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Lista Plazas (Orden Alfabético) */}
            <div className="p-1.5 space-y-1 overflow-y-auto max-h-[520px] flex-1">
              {sortedPlazas.map((p) => {
                const isSelected = activePlaza?.id === p.id;
                const locsCount = localidades.filter((l) => l.plazaId === p.id).length;
                const promsCount = promotoras.filter((pr) => {
                  const loc = localidades.find((l) => l.id === pr.localidadId);
                  return loc?.plazaId === p.id;
                }).length;

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPlazaId(p.id);
                      setSelectedLocalidadId('all');
                    }}
                    className={cn(
                      'group px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-white shadow-xs'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate uppercase">{p.name}</span>
                      {p.highlight && (
                        <Star
                          className={cn(
                            'h-3 w-3 shrink-0',
                            isSelected ? 'fill-amber-300 text-amber-200' : 'fill-amber-400 text-amber-500'
                          )}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded font-semibold',
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-muted-foreground/10 text-muted-foreground'
                        )}
                        title={`${locsCount} localidades, ${promsCount} promotoras`}
                      >
                        {locsCount}L · {promsCount}P
                      </span>

                      <div
                        className={cn(
                          'items-center gap-0.5 ml-1 hidden group-hover:flex',
                          isSelected ? 'text-white' : 'text-muted-foreground'
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditPlaza(p);
                          }}
                          className="hover:scale-110 p-0.5"
                          title="Editar"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({ type: 'plaza', id: p.id, name: p.name });
                          }}
                          className="hover:scale-110 p-0.5 hover:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {sortedPlazas.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground italic">
                  No hay plazas registradas.
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA 2: LOCALIDADES DE LA PLAZA (3/12) */}
          <div className="md:col-span-3 flex flex-col border border-border/60 rounded-lg bg-muted/15 overflow-hidden">
            {/* Header Columna 2 */}
            <div className="px-3 py-2 border-b border-border/60 bg-muted/40 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5 truncate">
                <MapPin className="h-3 w-3 text-blue-600" />
                Localidades ({activePlazaLocalidades.length})
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleOpenNewLocalidad(activePlaza?.id)}
                disabled={!activePlaza}
                className="h-5 w-5 text-blue-600 hover:bg-blue-50 rounded"
                title="Nueva Localidad"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Lista Localidades */}
            <div className="p-1.5 space-y-1 overflow-y-auto max-h-[520px] flex-1">
              {/* Opción "Todas las localidades" */}
              {activePlazaLocalidades.length > 0 && (
                <div
                  onClick={() => setSelectedLocalidadId('all')}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-between',
                    selectedLocalidadId === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  <span className="truncate">Todas en {activePlaza?.name}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.2 rounded font-semibold',
                      selectedLocalidadId === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-muted-foreground/10 text-muted-foreground'
                    )}
                  >
                    Ver todas
                  </span>
                </div>
              )}

              {activePlazaLocalidades.map((loc) => {
                const isSelected = selectedLocalidadId === loc.id;
                const locPromCount = promotoras.filter((pr) => pr.localidadId === loc.id).length;

                return (
                  <div
                    key={loc.id}
                    onClick={() => setSelectedLocalidadId(loc.id)}
                    className={cn(
                      'group px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-between',
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate uppercase">{loc.name}</span>
                      {loc.highlight && (
                        <Star
                          className={cn(
                            'h-3 w-3 shrink-0',
                            isSelected ? 'fill-amber-300 text-amber-200' : 'fill-amber-400 text-amber-500'
                          )}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded font-semibold',
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-muted-foreground/10 text-muted-foreground'
                        )}
                        title={`${locPromCount} promotoras`}
                      >
                        {locPromCount}
                      </span>

                      <div
                        className={cn(
                          'items-center gap-0.5 ml-1 hidden group-hover:flex',
                          isSelected ? 'text-white' : 'text-muted-foreground'
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditLocalidad(loc);
                          }}
                          className="hover:scale-110 p-0.5"
                          title="Editar"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({ type: 'localidad', id: loc.id, name: loc.name });
                          }}
                          className="hover:scale-110 p-0.5 hover:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {activePlazaLocalidades.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground italic">
                  Sin localidades en {activePlaza?.name || 'esta plaza'}.
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA 3: PROMOTORAS & PERSONAL VINCULADO (6/12) */}
          <div className="md:col-span-6 flex flex-col border border-border/60 rounded-lg bg-background overflow-hidden">
            {/* Header Columna 3 */}
            <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5 truncate">
                  <Users className="h-3 w-3 text-emerald-600" />
                  Promotoras ({columnPromotoras.length})
                </span>

                {/* Filtro rápido: todos / con personal / sin personal */}
                <div className="hidden sm:inline-flex items-center gap-0.5 bg-muted/60 p-0.5 rounded text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setFilterAssigned('all')}
                    className={cn(
                      'px-1.5 py-0.5 rounded',
                      filterAssigned === 'all' ? 'bg-background shadow-xs text-foreground font-black' : 'text-muted-foreground'
                    )}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterAssigned('assigned')}
                    className={cn(
                      'px-1.5 py-0.5 rounded',
                      filterAssigned === 'assigned' ? 'bg-background shadow-xs text-emerald-700 dark:text-emerald-400 font-black' : 'text-muted-foreground'
                    )}
                  >
                    Con Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterAssigned('unassigned')}
                    className={cn(
                      'px-1.5 py-0.5 rounded',
                      filterAssigned === 'unassigned' ? 'bg-background shadow-xs text-amber-700 dark:text-amber-400 font-black' : 'text-muted-foreground'
                    )}
                  >
                    Sin Personal
                  </button>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenNewPromotora()}
                className="h-6 px-2 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20"
              >
                <Plus className="h-3 w-3 mr-1" />
                Nueva Promotora
              </Button>
            </div>

            {/* Lista compacta de Promotoras */}
            <div className="p-1.5 overflow-y-auto max-h-[520px] flex-1">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="h-7 border-b border-border/50">
                    <TableHead className="py-1 px-2 text-[10px] font-black uppercase text-muted-foreground">
                      Grupo / Código
                    </TableHead>
                    <TableHead className="py-1 px-2 text-[10px] font-black uppercase text-muted-foreground">
                      Personal Vinculado
                    </TableHead>
                    <TableHead className="py-1 px-2 text-[10px] font-black uppercase text-muted-foreground hidden sm:table-cell">
                      Localidad
                    </TableHead>
                    <TableHead className="py-1 px-2 text-[10px] font-black uppercase text-muted-foreground text-right w-16">
                      Acción
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnPromotoras.map((prom) => {
                    const assigned = personalList.find((per) => per.id === prom.personalId);
                    const loc = localidades.find((l) => l.id === prom.localidadId);

                    return (
                      <TableRow key={prom.id} className="h-8 hover:bg-muted/30 border-b border-border/40">
                        {/* Nombre del Grupo */}
                        <TableCell className="py-1 px-2 font-black text-xs uppercase text-foreground">
                          <div className="flex items-center gap-1">
                            <span>{prom.name}</span>
                            {prom.highlight && (
                              <Star className="h-3 w-3 fill-amber-400 text-amber-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>

                        {/* Personal Asignado */}
                        <TableCell className="py-1 px-2">
                          {assigned ? (
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                              >
                                <UserCheck className="h-2.5 w-2.5 mr-1 shrink-0" />
                                <span className="truncate max-w-[130px] sm:max-w-[180px]">
                                  {assigned.nombre} {assigned.apellidoPaterno}
                                </span>
                              </Badge>
                              {assigned.celular && (
                                <span className="text-[10px] text-muted-foreground hidden lg:inline-flex items-center gap-0.5">
                                  <Phone className="h-2.5 w-2.5" />
                                  {assigned.celular}
                                </span>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenEditPromotora(prom)}
                              className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 hover:underline"
                            >
                              <LinkIcon className="h-2.5 w-2.5" />
                              Sin vincular
                            </button>
                          )}
                        </TableCell>

                        {/* Localidad */}
                        <TableCell className="py-1 px-2 text-[11px] text-muted-foreground font-semibold uppercase hidden sm:table-cell">
                          {loc?.name || '—'}
                        </TableCell>

                        {/* Acciones */}
                        <TableCell className="py-1 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEditPromotora(prom)}
                              className="h-6 w-6 text-muted-foreground hover:text-blue-600 rounded"
                              title="Editar"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setItemToDelete({ type: 'promotora', id: prom.id, name: prom.name })
                              }
                              className="h-6 w-6 text-muted-foreground hover:text-destructive rounded"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {columnPromotoras.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground italic">
                        No se encontraron promotoras registradas con los filtros actuales.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 2: TABLA GENERAL ULTRA COMPACTA */}
      {viewMode === 'table' && (
        <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
          <div className="px-3.5 py-2 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-foreground">
                Listado General de Rutas y Promotoras
              </span>
              <Badge variant="secondary" className="text-[10px] h-5 font-bold">
                {fullTablePromotoras.length} registros
              </Badge>
            </div>

            {/* Filtros rápidos */}
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground font-semibold flex items-center gap-1 mr-1">
                <Filter className="h-3 w-3" /> Estado:
              </span>
              <button
                type="button"
                onClick={() => setFilterAssigned('all')}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold',
                  filterAssigned === 'all'
                    ? 'bg-primary text-white font-black'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                Todas ({promotoras.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterAssigned('assigned')}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold',
                  filterAssigned === 'assigned'
                    ? 'bg-emerald-600 text-white font-black'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                Con Personal
              </button>
              <button
                type="button"
                onClick={() => setFilterAssigned('unassigned')}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold',
                  filterAssigned === 'unassigned'
                    ? 'bg-amber-600 text-white font-black'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                Sin Personal
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[580px]">
            <Table>
              <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
                <TableRow className="h-8 border-b border-border">
                  <TableHead className="py-1.5 px-3 text-[10px] font-black uppercase text-muted-foreground">
                    Grupo / Promotora
                  </TableHead>
                  <TableHead className="py-1.5 px-3 text-[10px] font-black uppercase text-muted-foreground">
                    Personal Vinculado
                  </TableHead>
                  <TableHead className="py-1.5 px-3 text-[10px] font-black uppercase text-muted-foreground">
                    Localidad
                  </TableHead>
                  <TableHead className="py-1.5 px-3 text-[10px] font-black uppercase text-muted-foreground">
                    Plaza
                  </TableHead>
                  <TableHead className="py-1.5 px-3 text-[10px] font-black uppercase text-muted-foreground text-right w-20">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fullTablePromotoras.map((prom) => {
                  const assigned = personalList.find((per) => per.id === prom.personalId);
                  const loc = localidades.find((l) => l.id === prom.localidadId);
                  const plaza = loc ? plazas.find((pl) => pl.id === loc.plazaId) : null;

                  return (
                    <TableRow key={prom.id} className="h-8 hover:bg-muted/20 border-b border-border/40">
                      {/* Grupo */}
                      <TableCell className="py-1 px-3 font-black text-xs uppercase text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{prom.name}</span>
                          {prom.highlight && (
                            <Star className="h-3 w-3 fill-amber-400 text-amber-500 shrink-0" />
                          )}
                        </div>
                      </TableCell>

                      {/* Personal */}
                      <TableCell className="py-1 px-3">
                        {assigned ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                            >
                              <UserCheck className="h-2.5 w-2.5 mr-1 shrink-0" />
                              <span>
                                {assigned.nombre} {assigned.apellidoPaterno}
                              </span>
                            </Badge>
                            {assigned.celular && (
                              <span className="text-[10px] text-muted-foreground hidden md:inline-flex items-center gap-0.5">
                                <Phone className="h-2.5 w-2.5" />
                                {assigned.celular}
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEditPromotora(prom)}
                            className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 hover:underline"
                          >
                            <LinkIcon className="h-2.5 w-2.5" />
                            Sin vincular
                          </button>
                        )}
                      </TableCell>

                      {/* Localidad */}
                      <TableCell className="py-1 px-3 text-xs font-semibold uppercase text-foreground">
                        {loc?.name || '—'}
                      </TableCell>

                      {/* Plaza */}
                      <TableCell className="py-1 px-3 text-xs font-semibold uppercase text-muted-foreground">
                        {plaza?.name || '—'}
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="py-1 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditPromotora(prom)}
                            className="h-6 w-6 text-muted-foreground hover:text-blue-600 rounded"
                            title="Editar"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setItemToDelete({ type: 'promotora', id: prom.id, name: prom.name })
                            }
                            className="h-6 w-6 text-muted-foreground hover:text-destructive rounded"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {fullTablePromotoras.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground italic">
                      No se encontraron resultados para la búsqueda actual.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* MODALES COMPACTOS (DIALOGS) */}

      {/* Modal Plaza */}
      <Dialog open={plazaModalOpen} onOpenChange={setPlazaModalOpen}>
        <DialogContent className="sm:max-w-sm rounded-xl p-4">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-sm font-black uppercase flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary" />
              {editingPlaza ? 'Editar Plaza' : 'Nueva Plaza'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sede regional para agrupar localidades.
            </DialogDescription>
          </DialogHeader>

          <Form {...plazaForm}>
            <form onSubmit={plazaForm.handleSubmit(onSubmitPlaza)} className="space-y-3 pt-1">
              <FormField
                control={plazaForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-bold uppercase">Nombre de la Plaza</FormLabel>
                    <FormControl>
                      <Input placeholder="EJ: MATRIZ, OCCIDENTE..." {...field} className="uppercase h-8 text-xs rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={plazaForm.control}
                name="highlight"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0 p-2 rounded-lg bg-muted/40 border border-border/50">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value || false}
                        onChange={field.onChange}
                        className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                      />
                    </FormControl>
                    <FormLabel className="text-[11px] font-bold uppercase cursor-pointer select-none">
                      Resaltar Préstamos de esta Plaza (Estrella)
                    </FormLabel>
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-1.5 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPlazaModalOpen(false)}
                  className="h-8 text-xs font-bold rounded-lg"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving} className="h-8 text-xs font-bold rounded-lg bg-primary text-white">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {editingPlaza ? 'Actualizar' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Modal Localidad */}
      <Dialog open={localidadModalOpen} onOpenChange={setLocalidadModalOpen}>
        <DialogContent className="sm:max-w-sm rounded-xl p-4">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-sm font-black uppercase flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-blue-600" />
              {editingLocalidad ? 'Editar Localidad' : 'Nueva Localidad'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Zona operativa dentro de una Plaza.
            </DialogDescription>
          </DialogHeader>

          <Form {...localidadForm}>
            <form onSubmit={localidadForm.handleSubmit(onSubmitLocalidad)} className="space-y-3 pt-1">
              <FormField
                control={localidadForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-bold uppercase">Nombre Localidad</FormLabel>
                    <FormControl>
                      <Input placeholder="EJ: ZONA CENTRO, SUR..." {...field} className="uppercase h-8 text-xs rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={localidadForm.control}
                name="plazaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-bold uppercase">Plaza Asignada</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-xs rounded-lg">
                          <SelectValue placeholder="Seleccionar Plaza..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sortedPlazas.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs uppercase font-bold">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={localidadForm.control}
                name="highlight"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0 p-2 rounded-lg bg-muted/40 border border-border/50">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value || false}
                        onChange={field.onChange}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-600 h-3.5 w-3.5 cursor-pointer"
                      />
                    </FormControl>
                    <FormLabel className="text-[11px] font-bold uppercase cursor-pointer select-none">
                      Resaltar Préstamos de esta Localidad
                    </FormLabel>
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-1.5 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLocalidadModalOpen(false)}
                  className="h-8 text-xs font-bold rounded-lg"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving} className="h-8 text-xs font-bold rounded-lg bg-blue-600 text-white">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {editingLocalidad ? 'Actualizar' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Modal Promotora */}
      <Dialog open={promotoraModalOpen} onOpenChange={setPromotoraModalOpen}>
        <DialogContent className="sm:max-w-md rounded-xl p-4">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-sm font-black uppercase flex items-center gap-1.5">
              <Users className="h-4 w-4 text-emerald-600" />
              {editingPromotora ? 'Editar Promotora / Grupo' : 'Registrar Nueva Promotora'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ruta de cobranza vinculada a su titular de Personal.
            </DialogDescription>
          </DialogHeader>

          <Form {...promotoraForm}>
            <form onSubmit={promotoraForm.handleSubmit(onSubmitPromotora)} className="space-y-3 pt-1">
              <FormField
                control={promotoraForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-bold uppercase">Nombre o Código del Grupo</FormLabel>
                    <FormControl>
                      <Input placeholder="EJ: P01, GRUPO NORTE..." {...field} className="uppercase h-8 text-xs rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={promotoraForm.control}
                name="localidadId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-bold uppercase">Localidad</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-xs rounded-lg">
                          <SelectValue placeholder="Seleccionar Localidad..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sortedLocalidades.map((loc) => {
                          const p = plazas.find((pl) => pl.id === loc.plazaId);
                          return (
                            <SelectItem key={loc.id} value={loc.id} className="text-xs uppercase font-bold">
                              {loc.name} {p ? `(${p.name})` : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Selector de Personal */}
              <FormField
                control={promotoraForm.control}
                name="personalId"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-[11px] font-bold uppercase flex items-center gap-1">
                        <UserCheck className="h-3 w-3 text-emerald-600" />
                        Titular de Personal
                      </FormLabel>
                      <button
                        type="button"
                        onClick={() => setShowAllPersonal(!showAllPersonal)}
                        className="text-[10px] text-primary hover:underline font-bold"
                      >
                        {showAllPersonal ? 'Filtrar solo promotores' : 'Ver todo el personal'}
                      </button>
                    </div>

                    <Select
                      onValueChange={(val) => field.onChange(val === '__none__' ? '' : val)}
                      value={field.value || '__none__'}
                    >
                      <FormControl>
                        <SelectTrigger className="h-8 text-xs rounded-lg">
                          <SelectValue placeholder="Seleccionar persona..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs text-muted-foreground font-semibold">
                          (Sin asignar titular todavía)
                        </SelectItem>
                        {eligiblePersonal.map((per) => (
                          <SelectItem key={per.id} value={per.id} className="text-xs font-bold">
                            {per.nombre} {per.apellidoPaterno} {per.apellidoMaterno || ''} ({per.tipoPersonal || 'Personal'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={promotoraForm.control}
                name="highlight"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0 p-2 rounded-lg bg-muted/40 border border-border/50">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value || false}
                        onChange={field.onChange}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 h-3.5 w-3.5 cursor-pointer"
                      />
                    </FormControl>
                    <FormLabel className="text-[11px] font-bold uppercase cursor-pointer select-none">
                      Resaltar Préstamos de esta Promotora
                    </FormLabel>
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-1.5 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPromotoraModalOpen(false)}
                  className="h-8 text-xs font-bold rounded-lg"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving} className="h-8 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {editingPromotora ? 'Actualizar' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de Confirmación de Borrado */}
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent className="sm:max-w-xs rounded-xl p-4">
          <AlertDialogHeader className="pb-1">
            <AlertDialogTitle className="text-sm font-black uppercase text-destructive">
              Confirmar Eliminación
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              ¿Eliminar {itemToDelete?.type === 'plaza' ? 'la plaza' : itemToDelete?.type === 'localidad' ? 'la localidad' : 'la promotora'}{' '}
              <strong className="text-foreground">"{itemToDelete?.name}"</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-1.5 pt-2">
            <AlertDialogCancel disabled={isSaving} className="h-8 text-xs font-bold rounded-lg">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isSaving}
              className="h-8 text-xs font-bold rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
