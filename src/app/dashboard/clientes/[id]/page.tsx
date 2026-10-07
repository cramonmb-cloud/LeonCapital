
import { notFound } from 'next/navigation';
import { getClient, getLoans, getLoanPlans, getUsers, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, Home, Shield, UserCheck } from 'lucide-react';
import { ClientPageActions } from './page-actions';
import { ClientLoansTable } from './client-loans-table';


export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  
  if (!client) {
    notFound();
  }

  const [clientLoans, loanPlans, allLoans, users, plazas, localidades, promotoras, appConfig] = await Promise.all([
      getLoans(id),
      getLoanPlans(),
      getLoans(),
      getUsers(),
      getPlazas(),
      getLocalidades(),
      getPromotoras(),
      getAppConfig(),
  ]);

  const fullAddress = `${client.street}, ${client.neighborhood}, C.P. ${client.postalCode}, ${client.city}`;
  
  let endorsementName = client.endorsement;
  let endorsementStreet = '';
  let endorsementNeighborhood = '';
  let endorsementPostalCode = '';
  let endorsementCity = '';
  let endorsementPhone = '';
  let endorsementGuarantee = '';
  let hasEndorsementDetails = false;

  const endorsementMatch = client.endorsement.match(/(.*) \((.*)\)/);
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


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20 border">
            <AvatarImage src={client.avatarUrl} alt={client.name} />
            <AvatarFallback>{client.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <p className="text-muted-foreground">ID de Cliente: {client.id}</p>
            </div>
        </div>
        <ClientPageActions clientId={client.id} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Préstamos del Cliente</CardTitle>
            </CardHeader>
            <CardContent>
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

        <div className="space-y-6">
           <Card>
            <CardHeader>
              <CardTitle>Información de Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
               <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                    <span className="font-medium">Email</span>
                    <p className="text-muted-foreground">{client.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                    <span className="font-medium">Teléfono</span>
                    <p className="text-muted-foreground">{client.phone}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Home className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                    <span className="font-medium">Dirección</span>
                    <p className="text-muted-foreground">{fullAddress}</p>
                </div>
              </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-blue-900 dark:text-blue-300">Garantías y Avales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm pt-4">
              {/* Garantías del Cliente */}
              <div className="space-y-1 bg-zinc-50/50 dark:bg-zinc-900/20 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-zinc-500">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Garantías del Cliente</span>
                </div>
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-1 whitespace-pre-line">
                  {client.guarantee || 'SIN GARANTÍAS REGISTRADAS'}
                </div>
              </div>

              {/* Aval y sus Detalles */}
              <div className="space-y-3 bg-blue-50/20 dark:bg-blue-950/10 p-3 rounded-lg border border-blue-100/50 dark:border-blue-900/30">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-blue-700">
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Información del Aval</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="text-[10px] font-black uppercase text-zinc-500">Nombre del Aval</span>
                    <p className="font-bold text-zinc-800 dark:text-zinc-200 uppercase">{endorsementName || 'SIN AVAL REGISTRADO'}</p>
                  </div>

                  {hasEndorsementDetails && (
                    <>
                      {(endorsementStreet || endorsementNeighborhood || endorsementPostalCode || endorsementCity) && (
                        <div>
                          <span className="text-[10px] font-black uppercase text-zinc-500">Dirección del Aval</span>
                          <p className="text-zinc-600 dark:text-zinc-400 font-semibold uppercase">
                            {[
                              endorsementStreet,
                              endorsementNeighborhood,
                              endorsementPostalCode ? `C.P. ${endorsementPostalCode}` : '',
                              endorsementCity
                            ].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      )}

                      {endorsementPhone && (
                        <div>
                          <span className="text-[10px] font-black uppercase text-zinc-500">Teléfono del Aval</span>
                          <p className="text-zinc-600 dark:text-zinc-400 font-semibold">{endorsementPhone}</p>
                        </div>
                      )}

                      {endorsementGuarantee && (
                        <div>
                          <span className="text-[10px] font-black uppercase text-blue-500">Garantías del Aval</span>
                          <div className="text-zinc-700 dark:text-zinc-300 font-semibold whitespace-pre-line mt-0.5">
                            {endorsementGuarantee}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
