import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getClient } from '@/lib/firestore-data';
import { ClientForm } from '@/components/client-form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, UserCog } from 'lucide-react';

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);

  if (!client) {
    notFound();
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      {/* Barra de navegación superior con retorno rápido */}
      <div className="flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
            <Link href={`/dashboard/clientes/${client.id}`}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Volver al Detalle
            </Link>
          </Button>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Edición de Expediente</span>
        </div>
      </div>

      {/* Header Compacto del Cliente en Edición */}
      <div className="flex items-center gap-3.5 bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-xs">
        <Avatar className="h-12 w-12 border border-zinc-200 dark:border-zinc-800 ring-2 ring-blue-500/10 shrink-0">
          <AvatarImage src={client.avatarUrl} alt={client.name} className="object-cover" />
          <AvatarFallback className="bg-blue-600 text-white font-black text-base">
            {client.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h1 className="text-lg sm:text-xl font-black uppercase text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
              Editar Expediente: {client.name}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            ID: <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{client.id}</span> • Actualiza los datos generales del titular, domicilio particular, garantías y aval solidario.
          </p>
        </div>
      </div>

      {/* Formulario Estructurado */}
      <ClientForm client={client} />
    </div>
  );
}
