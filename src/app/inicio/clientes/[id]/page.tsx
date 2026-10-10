import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getClient, getLoans, getLoanPlans, getUsers, getPlazas, getLocalidades, getPromotoras, getAppConfig, getPersonal } from '@/lib/firestore-data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Phone, 
  Home, 
  Shield, 
  UserCheck, 
  MapPin, 
  Receipt,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClientPageActions } from './page-actions';
import { ClientLoansTable } from './client-loans-table';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  
  if (!client) {
    notFound();
  }

  const [clientLoans, loanPlans, allLoans, users, plazas, localidades, promotoras, appConfig, personalList] = await Promise.all([
      getLoans(id),
      getLoanPlans(),
      getLoans(),
      getUsers(),
      getPlazas(),
      getLocalidades(),
      getPromotoras(),
      getAppConfig(),
      getPersonal(),
  ]);

  const fullAddress = [
    client.street,
    client.neighborhood,
    client.postalCode ? `C.P. ${client.postalCode}` : '',
    client.city
  ].filter(Boolean).join(', ');
  
  let endorsementName = client.endorsement || '';
  let endorsementStreet = '';
  let endorsementNeighborhood = '';
  let endorsementPostalCode = '';
  let endorsementCity = '';
  let endorsementPhone = '';
  let endorsementGuarantee = '';
  let hasEndorsementDetails = false;

  const endorsementMatch = client.endorsement?.match(/(.*) \((.*)\)/);
  if (endorsementMatch) {
    endorsementName = endorsementMatch[1].trim();
    const detailsStr = endorsementMatch[2];
    const details = detailsStr.split(',').map(s => s.trim());
    hasEndorsementDetails = true;

    // Find phone
    const phoneIdx = details.findIndex(d => d.toUpperCase().startsWith('TEL:'));
    if (phoneIdx !== -1) {
      endorsementPhone = details[phoneIdx].replace(/Tel:\s*/i, '');
      details.splice(phoneIdx, 1);
    }

    // Find guarantee
    const guaranteeIdx = details.findIndex(d => d.toUpperCase().startsWith('GARANTÍA:') || d.toUpperCase().startsWith('GARANTIA:'));
    if (guaranteeIdx !== -1) {
      endorsementGuarantee = details[guaranteeIdx].replace(/Garantía:\s*|Garantia:\s*/i, '');
      details.splice(guaranteeIdx, 1);
    }

    // Remaining parts are address parts
    if (details[0]) endorsementStreet = details[0];
    if (details[1]) endorsementNeighborhood = details[1];
    if (details[2]) endorsementPostalCode = details[2];
    if (details[3]) endorsementCity = details[3];
  }

  // Cálculos financieros rápidos para el resumen ejecutivo
  const activeLoans = clientLoans.filter(l => l.status === 'Active' || l.status === 'Overdue');
  const paidLoans = clientLoans.filter(l => l.status === 'Paid Off' || l.status === 'Pagado desde CV');
  const hasOverdue = clientLoans.some(l => l.status === 'Overdue');
  const totalLent = clientLoans.reduce((sum, l) => sum + (l.amount || 0), 0);

  let totalActiveDebt = 0;
  activeLoans.forEach(loan => {
    const plan = loanPlans.find(p => p.id === loan.loanPlanId);
    if (!plan) return;
    const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
    const totalExpected = weeklyPayment * plan.termInWeeks;
    const paidAmount = (loan.payments || [])
      .filter(p => !p.isReverted && p.amount > 0)
      .reduce((sum, p) => sum + p.amount, 0);
    totalActiveDebt += Math.max(0, totalExpected - paidAmount);
  });

  // Localidad y Promotora más representativa (del préstamo activo o reciente)
  const referenceLoan = activeLoans[0] || clientLoans[0];
  const refPromotora = referenceLoan ? promotoras.find(p => p.id === referenceLoan.promotoraId) : null;
  const refPersonal = refPromotora?.personalId ? personalList.find(p => p.id === refPromotora.personalId) : null;
  const refLocalidad = refPromotora ? localidades.find(l => l.id === refPromotora.localidadId) : null;
  const refPlaza = refLocalidad ? plazas.find(p => p.id === refLocalidad.plazaId) : null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* 1. Barra de Navegación Superior y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/80 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
            <Link href="/inicio/clientes">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Volver a Clientes
            </Link>
          </Button>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Detalle de Cliente</span>
        </div>
        <ClientPageActions clientId={client.id} />
      </div>

      {/* 2. Tarjeta Header Hero (Perfil Compacto y KPIs) */}
      <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Info Básica del Cliente */}
            <div className="flex items-center gap-3.5">
              <Avatar className="h-14 w-14 border border-zinc-200 dark:border-zinc-800 shadow-xs ring-2 ring-blue-500/10 shrink-0">
                <AvatarImage src={client.avatarUrl} alt={client.name} className="object-cover" />
                <AvatarFallback className="bg-blue-600 text-white font-bold text-lg">
                  {client.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 uppercase truncate">
                    {client.name}
                  </h1>
                  {hasOverdue ? (
                    <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                      Con Atraso
                    </Badge>
                  ) : activeLoans.length > 0 ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                      Activo al Corriente
                    </Badge>
                  ) : clientLoans.length > 0 ? (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                      Liquidado / Sin Deuda
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold px-2 py-0.5">
                      Nuevo Cliente
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                    ID: {client.id}
                  </span>
                  {refLocalidad && (
                    <span className="flex items-center gap-1 font-medium text-zinc-600 dark:text-zinc-400">
                      <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                      {refLocalidad.name} {refPlaza ? `(${refPlaza.name})` : ''}
                    </span>
                  )}
                  {refPromotora && (
                    <span className="flex items-center gap-1 font-medium text-zinc-600 dark:text-zinc-400">
                      <UserCheck className="h-3 w-3 text-indigo-500 shrink-0" />
                      Promotora: <strong className="text-zinc-800 dark:text-zinc-200">{refPromotora.name}</strong>
                      {refPersonal && (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-xs ml-1">
                          ({refPersonal.nombre} {refPersonal.apellidoPaterno})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bloque de Métricas Ejecutivas */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-100 dark:border-zinc-800">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/80 rounded-lg px-3 py-2 text-left min-w-[110px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Préstamos
                </span>
                <span className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100 block">
                  {activeLoans.length} <span className="text-[11px] font-normal text-muted-foreground">activos</span>
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  {clientLoans.length} total histórico
                </span>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/80 rounded-lg px-3 py-2 text-left min-w-[115px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Saldo Activo
                </span>
                <span className={cn(
                  "text-sm sm:text-base font-black block",
                  totalActiveDebt > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                )}>
                  {formatCurrency(totalActiveDebt)}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  {totalActiveDebt > 0 ? 'Por liquidar' : 'Al corriente'}
                </span>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/80 rounded-lg px-3 py-2 text-left min-w-[115px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Total Colocado
                </span>
                <span className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100 block">
                  {formatCurrency(totalLent)}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  {paidLoans.length} liquidado(s)
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Panel Compacto 2 Columnas: Datos del Cliente y Aval */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contacto y Domicilio */}
        <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <CardHeader className="py-2.5 px-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                Contacto y Domicilio
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/40 p-2 rounded-md border border-zinc-100 dark:border-zinc-800">
              <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">Teléfono de Contacto</span>
                {client.phone ? (
                  <a href={`tel:${client.phone}`} className="font-semibold text-zinc-800 dark:text-zinc-200 hover:text-blue-600 truncate block">
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">No registrado</span>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 bg-zinc-50 dark:bg-zinc-900/40 p-2 rounded-md border border-zinc-100 dark:border-zinc-800">
              <Home className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">Dirección Particular</span>
                <p className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase">
                  {fullAddress || 'No especificada'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-zinc-50 dark:bg-zinc-900/40 p-2 rounded-md border border-zinc-100 dark:border-zinc-800">
              <Shield className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">Garantía del Cliente</span>
                <p className="font-medium text-zinc-700 dark:text-zinc-300 uppercase whitespace-pre-line">
                  {client.guarantee || 'Sin garantías registradas'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Aval y Garantías */}
        <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <CardHeader className="py-2.5 px-4 border-b border-zinc-100 dark:border-zinc-800 bg-blue-50/40 dark:bg-blue-950/20">
            <div className="flex items-center gap-2">
              <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-xs font-black uppercase tracking-wider text-blue-900 dark:text-blue-300">
                Información del Aval
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-3.5 space-y-2.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-2 bg-blue-50/30 dark:bg-blue-950/10 p-2 rounded-md border border-blue-100/60 dark:border-blue-900/30">
                <UserCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block">Nombre del Aval</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 uppercase truncate block">
                    {endorsementName || 'Sin aval registrado'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-blue-50/30 dark:bg-blue-950/10 p-2 rounded-md border border-blue-100/60 dark:border-blue-900/30">
                <Phone className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block">Teléfono del Aval</span>
                  {endorsementPhone ? (
                    <a href={`tel:${endorsementPhone}`} className="font-semibold text-zinc-800 dark:text-zinc-200 hover:text-blue-600 truncate block">
                      {endorsementPhone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground italic">No registrado</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-blue-50/30 dark:bg-blue-950/10 p-2 rounded-md border border-blue-100/60 dark:border-blue-900/30">
              <Home className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-zinc-500 uppercase block">Dirección del Aval</span>
                <p className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase">
                  {[
                    endorsementStreet,
                    endorsementNeighborhood,
                    endorsementPostalCode ? `C.P. ${endorsementPostalCode}` : '',
                    endorsementCity
                  ].filter(Boolean).join(', ') || 'No especificada'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-blue-50/30 dark:bg-blue-950/10 p-2 rounded-md border border-blue-100/60 dark:border-blue-900/30">
              <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-zinc-500 uppercase block">Garantía del Aval</span>
                <p className="font-medium text-zinc-700 dark:text-zinc-300 uppercase whitespace-pre-line">
                  {endorsementGuarantee || 'Sin garantías registradas'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Tabla de Préstamos del Cliente (Full Width) */}
      <Card className="shadow-xs border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Préstamos Registrados
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] font-bold h-5 px-1.5 ml-1">
              {clientLoans.length}
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Haz clic en una fila o en el botón de abonos para ver el desglose
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <ClientLoansTable 
            clientLoans={clientLoans} 
            loanPlans={loanPlans} 
            allLoans={allLoans}
            users={users}
            plazas={plazas}
            localidades={localidades}
            promotoras={promotoras}
            appConfig={appConfig}
          />
        </CardContent>
      </Card>
    </div>
  );
}
