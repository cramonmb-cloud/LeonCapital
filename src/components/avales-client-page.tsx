'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { Client, Loan, LoanPlan, Plaza, Localidad, Promotora } from '@/lib/types';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Search, 
  Phone, 
  ShieldCheck, 
  AlertCircle, 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  List,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  UserCheck,
  CircleDot,
  FileSpreadsheet,
  Link2,
  Users,
  Calendar,
  Building,
  User,
  Wallet,
  Shield,
  Monitor,
  X,
  Home
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

const ITEMS_PER_PAGE = 15;

interface AvalesClientPageProps {
  initialClients: Client[];
  initialLoans: Loan[];
  initialPlans: LoanPlan[];
  initialPlazas?: Plaza[];
  initialLocalidades?: Localidad[];
  initialPromotoras?: Promotora[];
}


export interface ParsedEndorser {
  name: string;
  normName: string;
  street: string;
  neighborhood: string;
  postalCode: string;
  city: string;
  phone: string;
  guarantees: string;
  clientsBacked: {
    id: string;
    name: string;
    phone: string;
    hasActiveLoan: boolean;
    activeLoans: Loan[];
    allLoans: Loan[];
  }[];
  selfClientId: string;
  selfHasActiveLoan: boolean;
  selfActiveLoans: Loan[];
  backedClientsCount: number;
  isLinkedToActiveLoan: boolean;
}

// Robust function to parse composite endorsement string: "NAME (STREET, NEIGHBORHOOD, CP, CITY, Tel: PHONE, Garantía: GUARANTEES)"
function parseEndorsement(endorsementStr: string) {
  if (!endorsementStr) {
    return { name: '', street: '', neighborhood: '', postalCode: '', city: '', phone: '', guarantees: '' };
  }

  const parts = endorsementStr.split('(');
  const name = parts[0].trim();

  if (parts.length < 2) {
    return { name, street: '', neighborhood: '', postalCode: '', city: '', phone: '', guarantees: '' };
  }

  // Content inside parenthesis
  const inside = parts.slice(1).join('(').replace(/\)$/, '').trim();

  // Extract phone (Tel: ...)
  let phone = '';
  const phoneMatch = inside.match(/Tel:\s*([^,]+)/i);
  if (phoneMatch) {
    phone = phoneMatch[1].trim();
  }

  // Extract guarantees (Garantía: ...)
  let guarantees = '';
  const guaranteesMatch = inside.match(/Garantía:\s*(.+)$/i);
  if (guaranteesMatch) {
    guarantees = guaranteesMatch[1].trim();
  }

  // Clean remaining address parts
  let addressText = inside;
  if (phoneMatch) addressText = addressText.replace(phoneMatch[0], '');
  if (guaranteesMatch) addressText = addressText.replace(guaranteesMatch[0], '');

  const addressParts = addressText
    .split(',')
    .map(p => p.trim())
    .filter(p => p !== '' && !p.toUpperCase().startsWith('TEL:') && !p.toUpperCase().startsWith('GARANTÍA:'));

  let street = addressParts[0] || '';
  let neighborhood = addressParts[1] || '';
  let postalCode = addressParts[2] || '';
  let city = addressParts[3] || '';

  if (postalCode && !/^\d+$/.test(postalCode) && !city) {
    city = postalCode;
    postalCode = '';
  }

  return { name, street, neighborhood, postalCode, city, phone, guarantees };
}

export function AvalesClientPage({ 
  initialClients, 
  initialLoans, 
  initialPlans,
  initialPlazas = [],
  initialLocalidades = [],
  initialPromotoras = []
}: AvalesClientPageProps) {
  const { appUser } = useAuth();
  const { toast } = useToast();
  
  const { data: realtimeData } = useRealtimeData({
    clients: initialClients,
    loans: initialLoans,
    loanPlans: initialPlans,
    plazas: initialPlazas,
    localidades: initialLocalidades,
    promotoras: initialPromotoras
  }, {
    enabledCollections: ['clients', 'loans', 'loanPlans', 'plazas', 'localidades', 'promotoras']
  });
  
  const { clients, loans, loanPlans: plans, plazas, localidades, promotoras } = realtimeData;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const correctedDate = new Date(date.getTime() + userTimezoneOffset);
    return correctedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getExpirationDate = (startDateStr: string, termInWeeks: number) => {
    const date = new Date(startDateStr);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const correctedDate = new Date(date.getTime() + userTimezoneOffset);
    correctedDate.setDate(correctedDate.getDate() + (termInWeeks * 7));
    return correctedDate.toISOString().split('T')[0];
  };

  const getClientLocationHierarchy = (clientLoans: Loan[]) => {
    const referenceLoan = clientLoans.find(l => l.status === 'Active' || l.status === 'Overdue') || clientLoans[0];
    if (!referenceLoan || !referenceLoan.promotoraId) return null;

    const promotoraObj = promotoras.find(p => p.id === referenceLoan.promotoraId);
    if (!promotoraObj) return null;

    const localidadObj = localidades.find(l => l.id === promotoraObj.localidadId);
    const plazaObj = localidadObj ? plazas.find(pz => pz.id === localidadObj.plazaId) : null;

    return {
      promotora: promotoraObj.name,
      localidad: localidadObj?.name || '',
      plaza: plazaObj?.name || ''
    };
  };

  const handleExportPDF = (type: 'current' | 'all' | 'overdue' | 'multiple') => {
    let exportList = filteredEndorsers;
    let titleText = 'REPORTE DE AVALES - VISTA ACTUAL';

    if (type === 'all') {
      exportList = endorsers.filter(e => e.isLinkedToActiveLoan);
      titleText = 'REPORTE GENERAL DE AVALES ACTIVOS';
    } else if (type === 'overdue') {
      exportList = endorsers.filter(e => 
        e.clientsBacked.some(c => c.activeLoans.some(l => l.status === 'Overdue'))
      );
      titleText = 'REPORTE DE AVALES EN CARTERA VENCIDA (RIESGO)';
    } else if (type === 'multiple') {
      exportList = endorsers.filter(e => e.backedClientsCount >= 2);
      titleText = 'REPORTE DE AVALES MÚLTIPLES (2+ CLIENTES)';
    }

    if (exportList.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Reporte vacío',
        description: 'No hay datos para exportar con el filtro seleccionado.',
      });
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }) as jsPDFWithAutoTable;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 30;
    const topMargin = 50;

    // Header rect
    doc.setFillColor(79, 70, 229); // Indigo-600
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(titleText, margin, 25);

    // Metadata
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL REGISTROS:', margin, topMargin + 10);
    doc.text('FECHA GENERACIÓN:', margin, topMargin + 25);

    doc.setFont('helvetica', 'normal');
    doc.text(`${exportList.length}`, margin + 120, topMargin + 10);
    doc.text(new Date().toLocaleDateString('es-MX'), margin + 120, topMargin + 25);

    // Columns: Name, Address, Phone, Backed Clients & Loans, Guarantee, Self Loan Status
    const tableHeaders = [[
      'NOMBRE DEL AVAL',
      'TELÉFONO',
      'DIRECCIÓN / GARANTÍAS AVAL',
      'CLIENTES AVALADOS Y PRÉSTAMOS ACTIVOS',
      'PRÉSTAMO PROPIO'
    ]];

    const tableData = exportList.map(e => {
      const address = e.street || e.neighborhood ? `${e.street}, ${e.neighborhood}` : 'Sin dirección';
      const guarantees = e.guarantees ? `\nGarantía: ${e.guarantees}` : '';
      const addressAndGuarantees = `${address}${guarantees}`.toUpperCase();

      const clientsStr = e.clientsBacked.map((c, index) => {
        const loc = getClientLocationHierarchy(c.allLoans || []);
        const zoneStr = loc ? ` (${loc.plaza} > ${loc.localidad} > ${loc.promotora})` : '';
        const loansStr = c.activeLoans.map(l => 
          `$${l.amount.toLocaleString('es-MX')} (${l.status === 'Overdue' ? 'VENCIDO' : 'ACTIVO'})`
        ).join(', ');
        return `${index + 1}.- ${c.name}${zoneStr}: ${loansStr}`;
      }).join('\n\n').toUpperCase();

      let selfStr = 'NO ES CLIENTE';
      if (e.selfClientId) {
        if (e.selfHasActiveLoan) {
          selfStr = e.selfActiveLoans.map(l => 
            `ACTIVO: $${l.amount.toLocaleString('es-MX')}`
          ).join(', ').toUpperCase();
        } else {
          selfStr = 'CLIENTE SIN ADEUDO';
        }
      }

      return [
        e.name.toUpperCase(),
        e.phone || 'SIN TELÉFONO',
        addressAndGuarantees,
        clientsStr || 'SIN CLIENTES ACTIVOS',
        selfStr
      ];
    });

    doc.autoTable({
      startY: topMargin + 40,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 6,
        halign: 'left',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [79, 70, 229], // Indigo-600
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { fontStyle: 'bold', minCellWidth: 120 }, // Name
        1: { minCellWidth: 60, halign: 'center' }, // Phone
        2: { minCellWidth: 150 }, // Address / Guarantee
        3: { minCellWidth: 250 }, // Backed clients
        4: { minCellWidth: 90, halign: 'center' } // Self status
      }
    });

    const fileName = `${titleText.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    toast({
      title: 'Reporte Exportado',
      description: `El PDF ha sido generado y descargado exitosamente.`,
    });
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'linked-active' | 'self-active' | 'multiple' | 'clean'>('all');
  const [backedClientsFilter, setBackedClientsFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);

  const handleLoanClick = (loan: Loan, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row expand
    setSelectedLoan(loan);
    setIsLoanModalOpen(true);
  };

  // Parse and group all endorsers
  const endorsers = useMemo(() => {
    const grouped: Record<string, ParsedEndorser> = {};

    clients.forEach(client => {
      if (!client.endorsement || !client.endorsement.trim()) return;

      const parsed = parseEndorsement(client.endorsement);
      if (!parsed.name) return;

      const normName = parsed.name.trim().toUpperCase();

      // Get all active loans for this client
      const clientActiveLoans = loans.filter(
        l => l.clientId === client.id && (l.status === 'Active' || l.status === 'Overdue')
      );
      const clientHasActiveLoan = clientActiveLoans.length > 0;

      // Only add to backed clients if they have an active loan
      if (!clientHasActiveLoan) return;

      const backedClientInfo = {
        id: client.id,
        name: client.name,
        phone: client.phone,
        hasActiveLoan: true,
        activeLoans: clientActiveLoans,
        allLoans: clientActiveLoans
      };

      if (!grouped[normName]) {
        grouped[normName] = {
          name: parsed.name,
          normName,
          street: parsed.street,
          neighborhood: parsed.neighborhood,
          postalCode: parsed.postalCode,
          city: parsed.city,
          phone: parsed.phone,
          guarantees: parsed.guarantees,
          clientsBacked: [backedClientInfo],
          selfClientId: '',
          selfHasActiveLoan: false,
          selfActiveLoans: [],
          backedClientsCount: 1,
          isLinkedToActiveLoan: true
        };
      } else {
        const existing = grouped[normName];
        
        // Consolidate details to keep the most complete data
        if (!existing.phone && parsed.phone) existing.phone = parsed.phone;
        if (!existing.street && parsed.street) existing.street = parsed.street;
        if (!existing.neighborhood && parsed.neighborhood) existing.neighborhood = parsed.neighborhood;
        if (!existing.postalCode && parsed.postalCode) existing.postalCode = parsed.postalCode;
        if (!existing.city && parsed.city) existing.city = parsed.city;
        if (!existing.guarantees && parsed.guarantees) existing.guarantees = parsed.guarantees;

        // Prevent duplicate backed clients
        if (!existing.clientsBacked.some(c => c.id === client.id)) {
          existing.clientsBacked.push(backedClientInfo);
        }

        existing.backedClientsCount = existing.clientsBacked.length;
        existing.isLinkedToActiveLoan = true;
      }
    });

    // Match endorsers with their own loans if they exist as clients
    Object.keys(grouped).forEach(normName => {
      const endorser = grouped[normName];
      const matchingClient = clients.find(c => c.name.trim().toUpperCase() === normName);
      if (matchingClient) {
        endorser.selfClientId = matchingClient.id;
        endorser.selfActiveLoans = loans.filter(
          l => l.clientId === matchingClient.id && (l.status === 'Active' || l.status === 'Overdue')
        );
        endorser.selfHasActiveLoan = endorser.selfActiveLoans.length > 0;
      }
    });

    return Object.values(grouped);
  }, [clients, loans]);

  // Statistics
  const stats = useMemo(() => {
    const total = endorsers.length;
    const linkedActive = endorsers.filter(e => e.isLinkedToActiveLoan).length;
    const selfActive = endorsers.filter(e => e.selfHasActiveLoan).length;
    const multiple = endorsers.filter(e => e.backedClientsCount >= 2).length;

    return { total, linkedActive, selfActive, multiple };
  }, [endorsers]);

  // Search and filter
  const filteredEndorsers = useMemo(() => {
    return endorsers.filter(e => {
      // Search term
      const matchesSearch = 
        (e.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.phone || '').includes(searchTerm) ||
        `${e.street || ''} ${e.neighborhood || ''} ${e.city || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.guarantees || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Backed clients filter
      if (backedClientsFilter === '1' && e.backedClientsCount !== 1) return false;
      if (backedClientsFilter === '2' && e.backedClientsCount !== 2) return false;
      if (backedClientsFilter === '3' && e.backedClientsCount !== 3) return false;
      if (backedClientsFilter === '4+' && e.backedClientsCount < 4) return false;

      // Filter type
      if (filterType === 'linked-active') return e.isLinkedToActiveLoan;
      if (filterType === 'self-active') return e.selfHasActiveLoan;
      if (filterType === 'multiple') return e.backedClientsCount >= 2;
      if (filterType === 'clean') return !e.isLinkedToActiveLoan && !e.selfHasActiveLoan;

      return true;
    });
  }, [endorsers, searchTerm, filterType, backedClientsFilter]);

  const totalPages = Math.ceil(filteredEndorsers.length / ITEMS_PER_PAGE);

  const visibleEndorsers = useMemo(() => {
    if (showAll) return filteredEndorsers;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEndorsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEndorsers, currentPage, showAll]);

  // Reset page when criteria changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, backedClientsFilter]);

  const toggleExpand = (normName: string) => {
    setExpandedId(prev => (prev === normName ? null : normName));
  };

  const hasAccess = appUser?.role === 'admin' || appUser?.permissions?.avales;

  if (!hasAccess) {
    return (
      <div className="flex h-[60vh] items-center justify-center p-4">
        <Card className="max-w-[420px] w-full text-center border-red-200 shadow-lg shadow-red-500/5 bg-white/80 backdrop-blur">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-2 animate-bounce">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-black uppercase text-red-600">Acceso Restringido</CardTitle>
            <CardDescription className="text-xs text-red-700/80">
              No tienes los permisos necesarios para consultar la sección de Avales del negocio. Contacta al administrador principal.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Grid of customized Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-zinc-500 bg-white/40 hover:bg-white/60 transition-all duration-300 shadow-sm relative overflow-hidden group">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Total Avales Únicos</p>
              <h3 className="text-2xl font-black tracking-tight text-zinc-800">{stats.total}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500 bg-white/40 hover:bg-white/60 transition-all duration-300 shadow-sm relative overflow-hidden group">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Préstamos Avalados Activos</p>
              <h3 className="text-2xl font-black tracking-tight text-red-600">{stats.linkedActive}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500 bg-white/40 hover:bg-white/60 transition-all duration-300 shadow-sm relative overflow-hidden group">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Con Préstamo Propio Activo</p>
              <h3 className="text-2xl font-black tracking-tight text-orange-600">{stats.selfActive}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 bg-white/40 hover:bg-white/60 transition-all duration-300 shadow-sm relative overflow-hidden group">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Avales Múltiples (2+)</p>
              <h3 className="text-2xl font-black tracking-tight text-indigo-600">{stats.multiple}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content table card */}
      <Card className="shadow-md border-border/40 rounded-2xl overflow-hidden bg-white/50 backdrop-blur-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/10 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-600">
              Listado de Avales
            </CardTitle>
            <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
              {searchTerm 
                ? `Mostrando ${filteredEndorsers.length} de ${endorsers.length} avales encontrados.`
                : `Un total de ${endorsers.length} avales registrados en la cartera.`
              }
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2 h-9 text-xs font-bold uppercase rounded-xl border-border/60 hover:bg-indigo-50/20"
                >
                  <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
                  Exportar PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-xl border-border/40 p-1 bg-white shadow-xl" align="end">
                <DropdownMenuItem 
                  onClick={() => handleExportPDF('current')}
                  className="text-xs font-bold uppercase rounded-lg hover:bg-zinc-50 cursor-pointer"
                >
                  Vista Actual (Filtrada)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExportPDF('all')}
                  className="text-xs font-bold uppercase rounded-lg hover:bg-zinc-50 cursor-pointer"
                >
                  Todos los Avales Activos
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExportPDF('overdue')}
                  className="text-xs font-bold uppercase rounded-lg hover:bg-zinc-50 cursor-pointer"
                >
                  Avales en Cartera Vencida
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExportPDF('multiple')}
                  className="text-xs font-bold uppercase rounded-lg hover:bg-zinc-50 cursor-pointer"
                >
                  Avales Múltiples (2+)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Search bar and Filters */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-grow max-w-2xl">
              <div className="relative flex-grow">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder="Buscar aval por nombre, teléfono, dirección o garantía..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10 h-10 border-2 rounded-xl uppercase font-semibold text-xs tracking-wide focus-visible:ring-indigo-500 w-full text-zinc-800 placeholder:text-zinc-400/80"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none transition-colors"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="h-4 w-4 stroke-[2.5]" />
                  </button>
                )}
              </div>

              <div className="w-full sm:w-[220px] shrink-0">
                <Select value={backedClientsFilter} onValueChange={setBackedClientsFilter}>
                  <SelectTrigger className="h-10 text-xs border-2 uppercase font-bold rounded-xl focus:ring-indigo-500 bg-white">
                    <SelectValue placeholder="Clientes Respaldados" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all" className="text-xs font-bold uppercase">Respaldados: Todos</SelectItem>
                    <SelectItem value="1" className="text-xs font-bold uppercase">Respaldados: 1 Cliente</SelectItem>
                    <SelectItem value="2" className="text-xs font-bold uppercase">Respaldados: 2 Clientes</SelectItem>
                    <SelectItem value="3" className="text-xs font-bold uppercase">Respaldados: 3 Clientes</SelectItem>
                    <SelectItem value="4+" className="text-xs font-bold uppercase">Respaldados: 4 o más</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all duration-200 ${
                  filterType === 'all'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/20'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterType('linked-active')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all duration-200 ${
                  filterType === 'linked-active'
                    ? 'bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/20'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                }`}
              >
                Aval Activo
              </button>
              <button
                onClick={() => setFilterType('self-active')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all duration-200 ${
                  filterType === 'self-active'
                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm shadow-orange-600/20'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200'
                }`}
              >
                Préstamo Propio Activo
              </button>
              <button
                onClick={() => setFilterType('multiple')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all duration-200 ${
                  filterType === 'multiple'
                    ? 'bg-indigo-900 text-white border-indigo-900 shadow-sm shadow-indigo-900/20'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 hover:border-indigo-100 hover:text-indigo-900'
                }`}
              >
                Aval Múltiple
              </button>
              <button
                onClick={() => setFilterType('clean')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all duration-200 ${
                  filterType === 'clean'
                    ? 'bg-green-600 text-white border-green-600 shadow-sm shadow-green-600/20'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                }`}
              >
                Sin Deudas
              </button>
            </div>
          </div>

          {/* Table View */}
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="font-black text-[9px] uppercase tracking-widest text-muted-foreground py-3">Nombre del Aval</TableHead>
                  <TableHead className="font-black text-[9px] uppercase tracking-widest text-muted-foreground py-3">Dirección</TableHead>
                  <TableHead className="font-black text-[9px] uppercase tracking-widest text-muted-foreground py-3">Teléfono</TableHead>
                  <TableHead className="font-black text-[9px] uppercase tracking-widest text-muted-foreground py-3 text-center">Clientes Respaldados</TableHead>
                  <TableHead className="font-black text-[9px] uppercase tracking-widest text-muted-foreground py-3 text-center">Préstamo como Aval</TableHead>
                  <TableHead className="font-black text-[9px] uppercase tracking-widest text-muted-foreground py-3 text-center">Préstamo Propio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEndorsers.map((endorser) => {
                  const isExpanded = expandedId === endorser.normName;

                  return (
                    <Fragment key={endorser.normName}>
                      <TableRow 
                        key={endorser.normName} 
                        className={`hover:bg-indigo-50/5 cursor-pointer border-zinc-200/60 font-semibold transition-all ${
                          isExpanded ? 'bg-indigo-50/15' : ''
                        }`}
                        onClick={() => toggleExpand(endorser.normName)}
                      >
                        {/* Expand Icon */}
                        <TableCell className="text-center py-3">
                          {isExpanded ? (
                            <ChevronUp className="h-4.5 w-4.5 text-indigo-600" />
                          ) : (
                            <ChevronDown className="h-4.5 w-4.5 text-zinc-400 group-hover:text-indigo-600" />
                          )}
                        </TableCell>

                        {/* Name */}
                        <TableCell className="align-middle py-3">
                          <span className="text-xs font-black uppercase text-zinc-800 tracking-tight">
                            {endorser.name}
                          </span>
                        </TableCell>

                        {/* Address */}
                        <TableCell className="align-middle text-[10px] text-zinc-500 uppercase py-3 max-w-[200px] truncate leading-tight font-medium">
                          {endorser.street || endorser.neighborhood ? (
                            <span>{endorser.street}, {endorser.neighborhood}</span>
                          ) : (
                            <span className="italic opacity-60">Sin dirección registrada</span>
                          )}
                        </TableCell>

                        {/* Phone */}
                        <TableCell className="align-middle py-3">
                          {endorser.phone ? (
                            <Button 
                              asChild 
                              variant="ghost" 
                              className="h-7 px-2 text-[10px] font-black text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg shrink-0 gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a href={`tel:${endorser.phone.replace(/\D/g, '')}`}>
                                <Phone className="h-3 w-3" />
                                {endorser.phone}
                              </a>
                            </Button>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic font-medium px-2">Sin teléfono</span>
                          )}
                        </TableCell>

                        {/* Clients Backed Count */}
                        <TableCell className="align-middle text-center py-3">
                          <Badge className={`h-5 px-2 text-[9px] font-black uppercase rounded-lg border ${
                            endorser.backedClientsCount >= 2
                              ? 'bg-indigo-900/10 text-indigo-900 border-indigo-200'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                          }`}>
                            {endorser.backedClientsCount} {endorser.backedClientsCount === 1 ? 'cliente' : 'clientes'}
                          </Badge>
                        </TableCell>

                        {/* Active loan as endorser */}
                        <TableCell className="align-middle text-center py-3">
                          {endorser.isLinkedToActiveLoan ? (
                            <Badge variant="destructive" className="h-5 px-2 text-[8px] font-black uppercase rounded-lg shadow-sm border border-red-200">
                              Activo / Adeudo
                            </Badge>
                          ) : (
                            <Badge className="h-5 px-2 text-[8px] font-black uppercase rounded-lg bg-green-50 text-green-700 border border-green-200 shadow-sm">
                              Libre
                            </Badge>
                          )}
                        </TableCell>

                        {/* Active loan as self */}
                        <TableCell className="align-middle text-center py-3">
                          {endorser.selfHasActiveLoan ? (
                            <Badge className="h-5 px-2 text-[8px] font-black uppercase rounded-lg bg-orange-50 text-orange-700 border border-orange-200 shadow-sm">
                              Activo
                            </Badge>
                          ) : endorser.selfClientId ? (
                            <Badge className="h-5 px-2 text-[8px] font-black uppercase rounded-lg bg-zinc-100 text-zinc-500 border border-zinc-200 shadow-sm">
                              Cliente sin adeudo
                            </Badge>
                          ) : (
                            <Badge className="h-5 px-2 text-[8px] font-black uppercase rounded-lg bg-zinc-50 text-zinc-400 border border-zinc-200/50 shadow-sm">
                              No es cliente
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Collapsible Details Panel */}
                      {isExpanded && (
                        <TableRow className="bg-indigo-50/5 hover:bg-indigo-50/5">
                          <TableCell colSpan={7} className="p-0 border-b border-border/40">
                            <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5 animate-in fade-in slide-in-from-top-1 duration-200">
                              
                              {/* Left column: Full data breakdown */}
                              <div className="md:col-span-5 space-y-4">
                                <div className="space-y-3 bg-white p-4 rounded-xl border border-zinc-200/60 shadow-inner">
                                  <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 pb-2">
                                    <FileSpreadsheet className="h-4 w-4" />
                                    Ficha de Información
                                  </h4>

                                  <div className="space-y-2.5">
                                    <div className="flex gap-2.5 items-start">
                                      <MapPin className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                                      <div>
                                        <p className="text-[8px] font-black uppercase text-zinc-400">Domicilio Registrado</p>
                                        <p className="text-[10px] font-bold uppercase text-zinc-800 leading-tight">
                                          {endorser.street ? `${endorser.street}` : ''}
                                          {endorser.neighborhood ? `, Col. ${endorser.neighborhood}` : ''}
                                          {endorser.postalCode ? `, C.P. ${endorser.postalCode}` : ''}
                                          {endorser.city ? `, ${endorser.city}` : ''}
                                          {!endorser.street && !endorser.neighborhood && !endorser.city && (
                                            <span className="italic opacity-60">Sin domicilio disponible</span>
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    {endorser.phone && (
                                      <div className="flex gap-2.5 items-center">
                                        <Phone className="h-4 w-4 text-zinc-400 shrink-0" />
                                        <div>
                                          <p className="text-[8px] font-black uppercase text-zinc-400">Teléfono</p>
                                          <p className="text-[10px] font-bold text-zinc-800">{endorser.phone}</p>
                                        </div>
                                      </div>
                                    )}

                                    <div className="pt-2 border-t border-zinc-100 space-y-1">
                                      <p className="text-[8px] font-black uppercase text-zinc-400">Garantías Registradas del Aval</p>
                                      <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-200/60 min-h-[50px] text-[10px] font-bold text-zinc-700 whitespace-pre-wrap leading-relaxed">
                                        {endorser.guarantees ? endorser.guarantees.toUpperCase() : 'SIN GARANTÍA REGISTRADA PARA EL AVAL.'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Right column: Backed clients & Self Status */}
                              <div className="md:col-span-7 space-y-4">
                                <div className="bg-white p-4 rounded-xl border border-zinc-200/60 shadow-sm space-y-3">
                                  <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 pb-2">
                                    <Users className="h-4 w-4" />
                                    Clientes Avalados y Estado de Préstamos
                                  </h4>

                                  <div className="space-y-2">
                                    {endorser.clientsBacked.map(client => (
                                      <div key={client.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-xl border border-zinc-100 bg-zinc-50/50 hover:bg-zinc-50 transition-colors gap-2">
                                        <div className="space-y-0.5">
                                          <div className="flex flex-wrap items-center gap-x-2">
                                            <Link 
                                              href={`/dashboard/clientes/${client.id}`} 
                                              className="text-xs font-black text-indigo-600 hover:underline uppercase tracking-tight flex items-center gap-1"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {client.name}
                                            </Link>
                                            {(() => {
                                              const loc = getClientLocationHierarchy(client.allLoans || []);
                                              if (!loc) return null;
                                              return (
                                                <span className="text-[9px] font-extrabold text-black uppercase">
                                                  ({loc.plaza} &gt; {loc.localidad} &gt; {loc.promotora})
                                                </span>
                                              );
                                            })()}
                                          </div>
                                          <p className="text-[9px] text-zinc-400 font-bold">Tel: {client.phone || 'Sin Teléfono'}</p>
                                        </div>

                                        <div className="flex flex-col gap-1 items-end">
                                          {client.allLoans && client.allLoans.length > 0 ? (
                                            [...client.allLoans]
                                              .sort((a, b) => new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime())
                                              .map(loan => {
                                                const plan = plans.find(p => p.id === loan.loanPlanId);
                                                const termInWeeks = plan?.termInWeeks || 16;
                                                const expDateStr = getExpirationDate(loan.startDate, termInWeeks);
                                                
                                                return (
                                                  <div key={loan.id} className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[9px] font-extrabold text-black">
                                                      Inicio: {formatDate(loan.startDate)} | Vence: {formatDate(expDateStr)}
                                                    </span>
                                                    <Badge 
                                                      variant="destructive" 
                                                      className={`h-5 text-[8px] font-black uppercase rounded-lg px-2 shadow-sm cursor-pointer hover:opacity-90 transition-opacity ${
                                                        loan.status === 'Overdue' 
                                                          ? 'bg-red-600 text-white animate-pulse' 
                                                          : 'bg-blue-600 text-white'
                                                      }`}
                                                      onClick={(e) => handleLoanClick(loan, e)}
                                                    >
                                                      Préstamo Activo: {formatCurrency(loan.amount)} ({loan.status === 'Overdue' ? 'Vencido' : 'Activo'})
                                                    </Badge>
                                                  </div>
                                                );
                                              })
                                          ) : (
                                            <Badge className="h-5 text-[8px] font-black uppercase rounded-lg bg-green-50 text-green-700 border border-green-200 shadow-sm px-2">
                                              Sin Préstamos Activos
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Self Loan Status Details if any */}
                                {endorser.selfClientId && (
                                  <div className="bg-white p-4 rounded-xl border border-zinc-200/60 shadow-sm space-y-3">
                                    <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 pb-2">
                                      <UserCheck className="h-4 w-4" />
                                      Expediente Propio como Cliente
                                    </h4>

                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-xl border border-zinc-100 bg-orange-50/10 gap-2">
                                      <div className="space-y-0.5">
                                        <Link 
                                          href={`/dashboard/clientes/${endorser.selfClientId}`} 
                                          className="text-xs font-black text-orange-600 hover:underline uppercase tracking-tight"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          Ver Ficha del Cliente {endorser.name}
                                        </Link>
                                        <p className="text-[8px] font-bold text-zinc-400">ID Cliente: {endorser.selfClientId}</p>
                                      </div>

                                      <div className="flex gap-1.5 items-center">
                                        {endorser.selfHasActiveLoan ? (
                                          endorser.selfActiveLoans.map(loan => (
                                            <Badge 
                                              key={loan.id} 
                                              className="h-5 text-[8px] font-black uppercase rounded-lg bg-orange-600 text-white shadow-sm px-2 cursor-pointer hover:opacity-90 transition-opacity"
                                              onClick={(e) => handleLoanClick(loan, e)}
                                            >
                                              Préstamo Activo: {formatCurrency(loan.amount)}
                                            </Badge>
                                          ))
                                        ) : (
                                          <Badge className="h-5 text-[8px] font-black uppercase rounded-lg bg-zinc-100 text-zinc-600 border border-zinc-200 shadow-sm px-2">
                                            Sin deudas propias activas
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {visibleEndorsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-xs font-bold uppercase text-zinc-400">
                      No se encontraron avales que coincidan con la búsqueda o filtro seleccionado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Pagination */}
        {!showAll && totalPages > 1 && (
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 border-t border-border/10">
            <div className="text-xs font-black uppercase text-muted-foreground">
              Mostrando {visibleEndorsers.length} de {filteredEndorsers.length} avales
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-black uppercase text-zinc-600">
                Página {currentPage} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl h-9 text-xs font-bold uppercase border-border/60"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl h-9 text-xs font-bold uppercase border-border/60"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
        {showAll && filteredEndorsers.length > ITEMS_PER_PAGE && (
          <CardFooter className="py-4 border-t border-border/10 justify-center">
            <p className="text-xs font-black uppercase text-muted-foreground">
              Mostrando lista completa ({filteredEndorsers.length} avales)
            </p>
          </CardFooter>
        )}
      </Card>

      {/* Modal para detalles del préstamo */}
      <Dialog open={isLoanModalOpen} onOpenChange={setIsLoanModalOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 shadow-2xl rounded-sm w-full h-auto max-h-[92vh] md:max-h-[85vh] flex flex-col bg-white">
          {selectedLoan && (() => {
            const currentSelectedLoan = loans.find(l => l.id === selectedLoan.id) || selectedLoan;
            const client = clients.find(c => c.id === currentSelectedLoan.clientId);
            const plan = plans.find(p => p.id === currentSelectedLoan.loanPlanId);
            const weeklyPayment = plan ? (currentSelectedLoan.amount / 1000) * plan.weeklyPaymentRate : 0;
            const baseTerm = plan?.termInWeeks || 16;
            
            const now = new Date();
            const loanStartDate = new Date(currentSelectedLoan.startDate);
            const startDayUTC = new Date(Date.UTC(loanStartDate.getUTCFullYear(), loanStartDate.getUTCMonth(), loanStartDate.getUTCDate()));
            const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const daysDiff = Math.round((todayUTC.getTime() - startDayUTC.getTime()) / (1000 * 3600 * 24));
            const currentWeekSafe = Math.max(1, Math.floor((daysDiff - 1) / 7) + 1);
            
            const isExpired = currentWeekSafe > baseTerm + 1;

            let missedCount = 0;
            let totalPaidInBaseTerm = 0;
            let baseArrears = 0;
            
            for (let i = 1; i <= baseTerm; i++) {
              const p = (currentSelectedLoan.payments || []).find(pay => pay.weekNumber === i);
              if (p) {
                totalPaidInBaseTerm += p.amount;
                if (p.amount < weeklyPayment) {
                  missedCount++;
                  baseArrears += (weeklyPayment - p.amount);
                }
              } else if (i < currentWeekSafe - 1) {
                missedCount++;
                baseArrears += weeklyPayment;
              }
            }

            const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
            const totalTerm = baseTerm + (hasPenalty ? 1 : 0);

            const actualTotalPaid = (currentSelectedLoan.payments || []).reduce((acc, p) => acc + p.amount, 0);
            const totalExpected = totalTerm * weeklyPayment;
            const totalBalanceDue = Math.max(0, totalExpected - actualTotalPaid);

            const promotora = promotoras?.find(p => p.id === currentSelectedLoan.promotoraId);
            const localidad = localidades?.find(l => l.id === promotora?.localidadId);
            const plaza = plazas?.find(pz => pz.id === localidad?.plazaId);
            const endorserDetails = parseEndorsement(client?.endorsement || '');

            return (
              <>
                <DialogHeader className="sr-only">
                  <DialogTitle>Detalle del Préstamo</DialogTitle>
                  <DialogDescription>Expediente financiero, deudor y amortizaciones detalladas del avalado.</DialogDescription>
                </DialogHeader>

                {/* Custom absolute close button */}
                <div className="absolute right-4 top-4 z-50">
                  <button 
                    onClick={() => setIsLoanModalOpen(false)}
                    className="h-10 w-10 text-indigo-600 hover:bg-indigo-50 rounded-full flex items-center justify-center bg-white/80 shadow-lg backdrop-blur-sm border-2 border-indigo-200"
                  >
                    <X className="h-6 w-6 stroke-[3]" />
                  </button>
                </div>

                {/* Header info sheet matching consultar-cliente */}
                <div className="p-4 md:p-5 flex flex-col md:flex-row justify-between gap-4 border-b bg-muted/5 pr-14 md:pr-16 shrink-0">
                  <div className="flex items-center gap-3 md:gap-4">
                    <Avatar className="h-12 w-12 md:h-16 md:w-16 border-2 border-white shadow-md rounded-full overflow-hidden shrink-0">
                      <AvatarFallback className="text-xl md:text-2xl font-black bg-zinc-100 text-zinc-400">
                        {client?.name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-zinc-900 leading-tight break-words">
                        {client?.name || 'Cliente Desconocido'}
                      </h2>
                      <p className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase">
                        ID CLIENTE: {client?.id || 'N/A'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 min-w-0 md:min-w-[300px]">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="text-xs font-black tracking-tight">{client?.phone || 'Sin Teléfono'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-600">
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-black uppercase">
                        Inició: {currentSelectedLoan.startDate ? formatDate(currentSelectedLoan.startDate) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-600 sm:col-span-2">
                      <Home className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[10px] font-black uppercase line-clamp-2 md:truncate">
                        {client?.street ? `${client.street}, ${client.neighborhood}` : 'Sin dirección registrada'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-500 sm:col-span-2 pt-1">
                      <div className="flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        <span className="text-[9px] font-black uppercase">{plaza?.name || 'Sin Plaza'}</span>
                      </div>
                      <div className="flex items-center gap-1 border-l pl-2 border-zinc-200">
                        <MapPin className="h-3 w-3" />
                        <span className="text-[9px] font-black uppercase">{localidad?.name || 'Sin Localidad'}</span>
                      </div>
                      <div className="flex items-center gap-1 border-l pl-2 border-zinc-200">
                        <User className="h-3 w-3" />
                        <span className="text-[9px] font-black uppercase">{promotora?.name || 'Sin Promotora'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2-Column Body */}
                <div className="flex-1 overflow-y-auto min-h-0 grid grid-cols-1 md:grid-cols-12 gap-0 md:divide-x divide-zinc-150">
                  
                  {/* LEFT Column: Account statement and endorsement details */}
                  <div className="md:col-span-5 p-4 md:p-5 space-y-5 bg-zinc-50/30">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-indigo-600" />
                        <h3 className="text-sm font-black uppercase tracking-tight text-zinc-800">Estado de Cuenta</h3>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white border rounded-xl p-2 text-center shadow-sm">
                          <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">Semana</p>
                          <p className="text-base font-black text-zinc-900 leading-none">
                            {Math.min(currentWeekSafe, totalTerm)} <span className="text-zinc-300 text-xs">/ {totalTerm}</span>
                          </p>
                        </div>
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-2 text-center shadow-sm">
                          <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Abono</p>
                          <p className="text-base font-black text-indigo-600 leading-none">{formatCurrency(weeklyPayment)}</p>
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-xl p-2 text-center shadow-sm">
                          <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-0.5">Fallos</p>
                          <p className="text-base font-black text-red-600 leading-none">{missedCount}</p>
                        </div>
                      </div>

                      <div className="bg-zinc-100/80 rounded-2xl p-4 space-y-2 border border-zinc-200/50">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Total Cobrado</span>
                          <span className="text-xs font-black text-green-700">{formatCurrency(actualTotalPaid)}</span>
                        </div>
                        <div className="flex justify-between items-center px-1 border-t border-zinc-200/50 pt-2">
                          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Saldo de Fallos</span>
                          <span className="text-xs font-black text-zinc-800">{formatCurrency(baseArrears)}</span>
                        </div>
                        <div className="flex flex-col pt-3 border-t border-zinc-200 px-1 gap-1">
                          <div className="flex justify-between items-end">
                            <div className="space-y-0.5">
                              <span className="text-[9px] font-black text-red-700 uppercase tracking-widest block leading-none">Total a Liquidar</span>
                              <span className="text-[7px] font-bold text-red-600 uppercase opacity-70">Incluye penalización</span>
                            </div>
                            <span className="text-xl font-black text-red-700 tracking-tighter leading-none">
                              {formatCurrency(totalBalanceDue)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-indigo-600" />
                        <h3 className="text-sm font-black uppercase tracking-tight text-zinc-800">Aval y Garantía</h3>
                      </div>
                      <div className="bg-indigo-600 rounded-xl p-4 text-white shadow-lg shadow-indigo-900/10 space-y-2 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:rotate-12 transition-transform">
                          <UserCheck className="h-16 w-16" />
                        </div>
                        <p className="text-[8px] font-bold uppercase text-indigo-200 tracking-widest">Responsable Solidario</p>
                        <h4 className="text-sm font-black uppercase leading-tight">{endorserDetails.name || 'SIN AVAL REGISTRADO'}</h4>
                        <p className="text-[9px] font-medium leading-tight opacity-90 line-clamp-3">
                          {endorserDetails.street ? `${endorserDetails.street}, Col. ${endorserDetails.neighborhood}` : 'SIN DIRECCIÓN REGISTRADA'}
                          {endorserDetails.phone ? ` | Tel: ${endorserDetails.phone}` : ''}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-zinc-500" />
                          <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Garantías del Deudor</span>
                        </div>
                        <div className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/50 min-h-[60px] flex items-center justify-center">
                          <p className="text-[10px] font-bold uppercase text-zinc-600 leading-snug tracking-wide text-center italic">
                            {client?.guarantee || 'SIN GARANTÍAS REGISTRADAS'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT Column: Payments schedule and records */}
                  <div className="md:col-span-7 p-4 md:p-5 flex flex-col space-y-4">
                    <div className="flex-1 flex flex-col min-h-0 space-y-3">
                      <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest border-b border-zinc-150 pb-2 flex items-center justify-between shrink-0">
                        <span>Historial de Amortizaciones</span>
                        <span className="text-zinc-500 lowercase font-medium">({currentSelectedLoan.payments?.length || 0} de {totalTerm} pagadas)</span>
                      </h4>

                      <div className="flex-1 min-h-[200px] overflow-y-auto rounded-xl border border-zinc-200 bg-white">
                        <Table>
                          <TableHeader className="bg-zinc-50 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="py-2 text-[9px] font-black uppercase text-center w-[50px] text-zinc-700 border-r border-zinc-200">Sem</TableHead>
                              <TableHead className="py-2 text-[9px] font-black uppercase text-zinc-700 border-r border-zinc-200">Vence</TableHead>
                              <TableHead className="py-2 text-[9px] font-black uppercase text-right text-zinc-700 border-r border-zinc-200">Cobro</TableHead>
                              <TableHead className="py-2 text-[9px] font-black uppercase text-right text-zinc-700 border-r border-zinc-200">Abono</TableHead>
                              <TableHead className="py-2 text-[9px] font-black uppercase text-center w-[100px] text-zinc-700">Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              const validPayments = (currentSelectedLoan.payments || []).filter(p => !p.isReverted && p.amount > 0);
                              const maxPaidWeek = validPayments.length > 0 ? Math.max(...validPayments.map(p => p.weekNumber)) : 0;
                              const maxDisplayWeek = Math.max(totalTerm, maxPaidWeek);

                              return Array.from({ length: maxDisplayWeek }).map((_, i) => {
                                const weekNum = i + 1;
                                const payment = (currentSelectedLoan.payments || []).find(p => p.weekNumber === weekNum);
                                const isRegistered = !!payment && !payment.isReverted;

                                // Si supera el plazo calculado (totalTerm) y NO tiene pago registrado con monto > 0, no mostrar
                                if (weekNum > totalTerm && (!isRegistered || payment.amount <= 0)) {
                                  return null;
                                }

                                const isPenalty = weekNum > baseTerm;
                                const isRecovered = payment?.isRecovered || false;
                                
                                const dueDate = new Date(currentSelectedLoan.startDate);
                                dueDate.setDate(dueDate.getDate() + (weekNum * 7));
                                const isPastDate = now > dueDate;
                                
                                let statusText = 'Pendiente';
                                let statusType: 'PAID' | 'MISSED' | 'PENDING' = 'PENDING';
                                
                                if (isRegistered) {
                                    if (payment.amount >= weeklyPayment) {
                                      statusText = isRecovered ? 'RECUPERADO' : new Date(payment.date).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
                                      statusType = 'PAID';
                                    } else if (payment.amount > 0) {
                                      statusText = isRecovered ? 'RECU. PARCIAL' : 'PARCIAL';
                                      statusType = 'MISSED';
                                    } else {
                                      statusText = 'FALLO';
                                      statusType = 'MISSED';
                                    }
                                } else if (isPastDate || weekNum < currentWeekSafe - 1) {
                                  statusText = 'FALLO';
                                  statusType = 'MISSED';
                                } else {
                                  statusText = 'PENDIENTE';
                                  statusType = 'PENDING';
                                }

                                const isCurrentWeek = weekNum === currentWeekSafe;

                              return (
                                <TableRow 
                                  key={weekNum} 
                                  className={cn(
                                    "hover:bg-zinc-50/50 text-[10px] font-bold text-zinc-700 border-b transition-colors",
                                    isCurrentWeek && "bg-indigo-50/70 border-l-4 border-l-indigo-600 font-extrabold"
                                  )}
                                >
                                  <TableCell className="text-center py-2 border-r border-zinc-100">{weekNum}</TableCell>
                                  <TableCell className="py-2 border-r border-zinc-100">
                                    {dueDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                  </TableCell>
                                  <TableCell className="text-right py-2 border-r border-zinc-100">
                                    {formatCurrency(weeklyPayment)}
                                  </TableCell>
                                  <TableCell className={cn(
                                    "text-right py-2 border-r border-zinc-100 font-black",
                                    isRecovered ? "bg-purple-50/70 text-purple-700" :
                                    payment ? (payment.amount >= weeklyPayment ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700") : "bg-red-50 text-red-700"
                                  )}>
                                    <div className="flex items-center justify-end gap-1">
                                      {formatCurrency(payment ? payment.amount : 0)}
                                      {isPenalty && (
                                        <Badge className="bg-amber-600 text-white text-[7px] font-black h-3.5 px-1 uppercase shrink-0">EXTRA</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center py-2">
                                    <Badge className={cn(
                                      "h-4.5 px-1.5 text-[8px] font-black uppercase rounded-lg border",
                                      isRecovered ? "bg-purple-50 text-purple-700 border-purple-200" :
                                      statusType === 'PAID' ? "bg-green-50 text-green-700" :
                                      statusType === 'MISSED' ? "bg-red-50 text-red-700 border-red-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                    )}>
                                      {statusText}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                              });
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center bg-indigo-50/20 p-2.5 rounded-xl border border-indigo-100/50 text-[10px] text-indigo-900 leading-tight font-medium shrink-0">
                      <AlertCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span>
                        Fecha de Inicio del Préstamo: <strong>{formatDate(currentSelectedLoan.startDate)}</strong>.
                        {missedCount > 0 && (
                          <span> Actualmente cuenta con <strong>{missedCount} fallos</strong> acumulados.</span>
                        )}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Footer close bar */}
                <div className="p-4 bg-zinc-50 border-t flex justify-end shrink-0">
                  <Button 
                    onClick={() => setIsLoanModalOpen(false)}
                    className="rounded-xl h-10 text-xs font-black uppercase px-6 border-2 border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 shadow-sm"
                  >
                    Cerrar Detalles
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
