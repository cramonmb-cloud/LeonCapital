'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Client, Loan, LoanPlan, Promotora, Plaza, Localidad } from '@/lib/types';
import { PlusCircle, Loader2, AlertTriangle, BadgeDollarSign, Calendar, CheckCircle2, X, Check, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createLoanAction, payOffLoanAction } from '@/app/inicio/actions';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { IdScanner } from './id-scanner';
import type { IdDataOutput } from '@/ai/flows/extract-id-data-flow';
import { useAuth } from '@/hooks/use-auth';
import { useRealtimeData } from '@/hooks/use-realtime-data';
import { getCurrentLoanWeekNumber, parseEndorsement, getMexicoNow, getSaturdayOfWeek, getExtraWeekThreshold, doesLoanHavePenalty, formatPhoneNumber } from '@/lib/utils';

const stepOneSchema = z.object({
  promotoraId: z.string().min(1, 'Debes seleccionar una promotora.'),
  loanPlanId: z.string().min(1, 'Debes seleccionar un tipo de préstamo.'),
  amount: z.coerce.number().min(1, 'El monto del préstamo debe ser mayor a 0.'),
  clientName: z.string().min(3, 'El nombre del cliente debe tener al menos 3 caracteres.'),
});

const stepTwoSchema = z.object({
  phone: z.string().optional().refine(
    (val) => !val || val.trim() === '' || val.replace(/\D/g, '').length === 10,
    { message: 'El teléfono debe contener 10 dígitos.' }
  ),
  street: z.string().optional(),
  neighborhood: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  guarantee: z.string().optional(),
  endorsement: z.string().optional(),
  endorsementStreet: z.string().optional(),
  endorsementNeighborhood: z.string().optional(),
  endorsementPostalCode: z.string().optional(),
  endorsementCity: z.string().optional(),
  endorsementPhone: z.string().optional().refine(
    (val) => !val || val.trim() === '' || val.replace(/\D/g, '').length === 10,
    { message: 'El teléfono del aval debe contener 10 dígitos.' }
  ),
  endorsementGuarantee: z.string().optional(),
});

const formSchema = stepOneSchema.merge(stepTwoSchema);

type LoanFormValues = z.infer<typeof formSchema>;

interface GuarantorSuggestion {
  name: string;
  street: string;
  neighborhood: string;
  postalCode: string;
  city: string;
  phone: string;
  guarantee: string;
}

interface CapturedLoanItem {
  id: string;
  clientName: string;
  amount: number;
  ratePerThousand: number;
  weeklyPayment: number;
  termInWeeks: number;
  planName: string;
  promotoraId: string;
  capturedDate: string;
}

interface CreateLoanDialogProps {
    clients: Client[];
    loanPlans: LoanPlan[];
    loans: Loan[];
    plazas: Plaza[];
    localidades: Localidad[];
    promotoras: Promotora[];
    initialSelection?: {
        plazaId: string;
        localidadId: string;
        promotoraId: string;
    };
}

interface ActiveLoanDetails {
    loan: Loan;
    settlementAmount: number;
    weeksRemaining: number;
    planName: string;
    hierarchy: {
        plazaName: string;
        localidadName: string;
        promotoraName: string;
    };
}

const cleanGuaranteeValue = (val: string | undefined) => {
  if (!val) return '';
  const lines = val.split('\n');
  let lastNonEmptyIndex = -1;
  const processedLines = lines.map(line => {
    const hasText = line.replace(/^\d+\.-\s*/, '').trim().length > 0;
    return { text: line, hasText };
  });

  for (let i = processedLines.length - 1; i >= 0; i--) {
    if (processedLines[i].hasText) {
      lastNonEmptyIndex = i;
      break;
    }
  }

  if (lastNonEmptyIndex === -1) return '';
  
  return processedLines
    .slice(0, lastNonEmptyIndex + 1)
    .map(pl => pl.text)
    .join('\n');
};

export function CreateLoanDialog({ clients, loanPlans, loans, plazas, localidades, promotoras, initialSelection }: CreateLoanDialogProps) {
  const [open, setOpen] = useState(false);
  const prevOpenRef = useRef(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [step, setStep] = useState(1);
  const [localCapturedLoans, setLocalCapturedLoans] = useState<CapturedLoanItem[]>([]);
  const [matchingClients, setMatchingClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeLoanDetails, setActiveLoanDetails] = useState<ActiveLoanDetails | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayingOff, setIsPayingOff] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<LoanFormValues | null>(null);
  
  const [selectedPlaza, setSelectedPlaza] = useState(initialSelection?.plazaId || '');
  const [selectedLocalidad, setSelectedLocalidad] = useState(initialSelection?.localidadId || '');

  const { toast } = useToast();
  const router = useRouter();
  const { appUser } = useAuth();
  const { data: realtimeData } = useRealtimeData(undefined, {
    enabledCollections: ['config', 'personal']
  });
  const maxGuarantorClients = realtimeData?.config?.maxGuarantorClients || 0;

  const [showGuarantorLimitAlert, setShowGuarantorLimitAlert] = useState(false);
  const [matchingGuarantors, setMatchingGuarantors] = useState<GuarantorSuggestion[]>([]);
  const [blockedGuarantorDetails, setBlockedGuarantorDetails] = useState<{ clientName: string; plaza: string; localidad: string; promotora: string }[]>([]);
  const [showAuthCodeModal, setShowAuthCodeModal] = useState(false);
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [authCodeError, setAuthCodeError] = useState(false);

  const [clientColonies, setClientColonies] = useState<string[]>([]);
  const [showClientColonies, setShowClientColonies] = useState(false);
  const [endorsementColonies, setEndorsementColonies] = useState<string[]>([]);
  const [showEndorsementColonies, setShowEndorsementColonies] = useState(false);


  const defaultPlan = useMemo(() => loanPlans.find(p => p.isDefault), [loanPlans]);

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(step === 1 ? stepOneSchema : formSchema),
    defaultValues: {
      promotoraId: initialSelection?.promotoraId || '',
      loanPlanId: defaultPlan?.id || '',
      amount: 0,
      clientName: '',
      phone: '',
      street: '',
      neighborhood: '',
      postalCode: '',
      city: '',
      guarantee: '1.- \n2.- \n3.- \n4.- ',
      endorsement: '',
      endorsementStreet: '',
      endorsementNeighborhood: '',
      endorsementPostalCode: '',
      endorsementCity: '',
      endorsementPhone: '',
      endorsementGuarantee: '1.- \n2.- \n3.- \n4.- ',
    },
  });

  useEffect(() => {
    if (defaultPlan?.id && !form.getValues('loanPlanId')) {
      form.setValue('loanPlanId', defaultPlan.id);
    }
  }, [defaultPlan, form]);

  const sortedPlazas = useMemo(() => [...plazas].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [plazas]);
  const filteredLocalidades = useMemo(() => localidades.filter(l => l.plazaId === selectedPlaza).sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [localidades, selectedPlaza]);
  const filteredPromotoras = useMemo(() => promotoras.filter(p => p.localidadId === selectedLocalidad).sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [promotoras, selectedLocalidad]);
  const sortedLoanPlans = useMemo(() => [...loanPlans].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [loanPlans]);

  const watchLoanPlanId = form.watch('loanPlanId');
  const watchAmount = form.watch('amount');
  const watchPromotoraId = form.watch('promotoraId');
  const watchClientName = form.watch('clientName') || '';

  const watchNeighborhood = form.watch('neighborhood') || '';
  const filteredClientColonies = useMemo(() => {
    if (!clientColonies.length) return [];
    const query = watchNeighborhood.trim().toUpperCase();
    if (!query || clientColonies.some(c => c.trim().toUpperCase() === query)) {
      return clientColonies;
    }
    const filtered = clientColonies.filter(c => c.trim().toUpperCase().includes(query));
    return filtered.length > 0 ? filtered : clientColonies;
  }, [clientColonies, watchNeighborhood]);

  const watchEndorsementNeighborhood = form.watch('endorsementNeighborhood') || '';
  const filteredEndorsementColonies = useMemo(() => {
    if (!endorsementColonies.length) return [];
    const query = watchEndorsementNeighborhood.trim().toUpperCase();
    if (!query || endorsementColonies.some(c => c.trim().toUpperCase() === query)) {
      return endorsementColonies;
    }
    const filtered = endorsementColonies.filter(c => c.trim().toUpperCase().includes(query));
    return filtered.length > 0 ? filtered : endorsementColonies;
  }, [endorsementColonies, watchEndorsementNeighborhood]);

  // Préstamos capturados visibles: sesión actual + préstamos de la promotora en la semana activa sin pagos acumulados
  const capturedLoans = useMemo(() => {
    const currentPromId = watchPromotoraId || initialSelection?.promotoraId;
    if (!currentPromId) return [];

    const mexicoNow = getMexicoNow();
    const todayMexicoStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(mexicoNow);
    const currentSaturdayIso = getSaturdayOfWeek(mexicoNow).toISOString();

    const clientMap = new Map(clients.map(c => [c.id, c.name]));
    const planMap = new Map(loanPlans.map(p => [p.id, p]));

    // Préstamos de Firestore de esta promotora:
    // Deben estar activos y NO tener pagos acumulados activos.
    // Además deben pertenecer al día de hoy, a las últimas 48 hrs, o a la semana activa (mismo sábado).
    const unaccumulatedFromDb = loans.filter(l => {
      if (l.promotoraId !== currentPromId) return false;
      if (l.status !== 'Active') return false;

      // Si ya tiene pagos activos, ya fue acumulado / cobrado
      const hasActivePayments = (l.payments || []).some(p => !p.isReverted);
      if (hasActivePayments) return false;

      // 1. Creado hoy o en las últimas 48 horas
      if (l.createdAt) {
        try {
          const loanCreatedDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Mexico_City',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(l.createdAt));
          if (loanCreatedDate === todayMexicoStr) return true;

          const createdTime = new Date(l.createdAt).getTime();
          if (!isNaN(createdTime) && Math.abs(Date.now() - createdTime) <= 48 * 60 * 60 * 1000) {
            return true;
          }
        } catch {
          // Si falla parseo de fecha, continuar con verificación de startDate
        }
      }

      // 2. O pertenece a la semana activa actual (misma fecha de corte / sábado)
      if (l.startDate) {
        try {
          const loanSatIso = getSaturdayOfWeek(l.startDate).toISOString();
          if (loanSatIso === currentSaturdayIso) {
            return true;
          }
        } catch {}
      }

      return false;
    });

    const mappedDbLoans: CapturedLoanItem[] = unaccumulatedFromDb.map(l => {
      const plan = planMap.get(l.loanPlanId);
      const clientName = (clientMap.get(l.clientId) || 'CLIENTE').toUpperCase();
      const rate = plan?.weeklyPaymentRate || 0;
      const wp = plan ? (l.amount / 1000) * rate : 0;
      return {
        id: l.id,
        clientName,
        amount: l.amount,
        ratePerThousand: rate,
        weeklyPayment: wp,
        termInWeeks: plan?.termInWeeks || 0,
        planName: plan?.name || '—',
        promotoraId: l.promotoraId || currentPromId,
        capturedDate: todayMexicoStr,
      };
    });

    // Préstamos locales registrados en la sesión actual para esta promotora
    const pendingLocals = localCapturedLoans.filter(loc => loc.promotoraId === currentPromId);

    // Combinar sin duplicar:
    // Empezamos con los préstamos de DB
    const result: CapturedLoanItem[] = [...mappedDbLoans];

    // Añadimos los de la sesión local que aún no se reflejen en la DB
    pendingLocals.forEach(loc => {
      const alreadyInDb = result.some(r => 
        r.id === loc.id || 
        (r.clientName.trim().toUpperCase() === loc.clientName.trim().toUpperCase() && r.amount === loc.amount)
      );
      if (!alreadyInDb) {
        result.unshift(loc);
      }
    });

    return result;
  }, [loans, clients, loanPlans, watchPromotoraId, initialSelection, localCapturedLoans]);

  const calculatedAbono = useMemo(() => {
    if (!watchLoanPlanId || !watchAmount) return 0;
    const plan = loanPlans.find(p => p.id === watchLoanPlanId);
    if (!plan) return 0;
    return (Number(watchAmount) / 1000) * plan.weeklyPaymentRate;
  }, [watchLoanPlanId, watchAmount, loanPlans]);

  const currentHierarchy = useMemo(() => {
    const currentPromotoraId = watchPromotoraId || initialSelection?.promotoraId;
    const promotora = promotoras.find(p => p.id === currentPromotoraId);
    const assigned = realtimeData?.personal?.find(per => per.id === promotora?.personalId);
    const localidad = localidades.find(l => l.id === promotora?.localidadId);
    const plaza = plazas.find(p => p.id === localidad?.plazaId);
    return {
      promotoraName: promotora?.name || 'N/A',
      personalName: assigned ? `${assigned.nombre} ${assigned.apellidoPaterno}` : undefined,
      localidadName: localidad?.name || 'N/A',
      plazaName: plaza?.name || 'N/A',
    };
  }, [watchPromotoraId, initialSelection, promotoras, localidades, plazas, realtimeData]);

  const handleGuaranteeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, fieldName: 'guarantee' | 'endorsementGuarantee') => {
    if (e.key === 'Enter') {
      const textarea = e.currentTarget;
      const val = textarea.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const lines = val.split('\n');
      
      let accumulatedChars = 0;
      let currentLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1;
        if (start >= accumulatedChars && start <= accumulatedChars + lineLength - 1) {
          currentLineIndex = i;
          break;
        }
        accumulatedChars += lineLength;
      }

      if (currentLineIndex !== -1) {
        const currentLineText = lines[currentLineIndex];
        const match = currentLineText.match(/^(\d+)\.-\s*(.*)/);
        
        if (match) {
          e.preventDefault();
          const currentItemNumber = parseInt(match[1], 10);
          const nextItemNumber = currentItemNumber + 1;
          
          const hasNextLine = currentLineIndex + 1 < lines.length;
          const nextLineText = hasNextLine ? lines[currentLineIndex + 1] : '';
          const nextLineMatch = nextLineText.match(/^(\d+)\.-\s*(.*)/);
          
          if (hasNextLine && nextLineMatch && parseInt(nextLineMatch[1], 10) === nextItemNumber) {
            let nextLineCursorPos = 0;
            for (let i = 0; i <= currentLineIndex; i++) {
              nextLineCursorPos += lines[i].length + 1;
            }
            const targetPos = nextLineCursorPos + lines[currentLineIndex + 1].length;
            
            setTimeout(() => {
              textarea.setSelectionRange(targetPos, targetPos);
            }, 0);
          } else {
            // Si ya no hay más líneas predefinidas (ej. después de 4.-), avanzar a la siguiente sección
            if (currentItemNumber >= 4) {
              if (fieldName === 'guarantee') {
                const nextEl = document.querySelector<HTMLElement>('[name="endorsement"]');
                nextEl?.focus();
                return;
              } else if (fieldName === 'endorsementGuarantee') {
                const submitBtn = document.querySelector<HTMLElement>('button[type="submit"]');
                submitBtn?.focus();
                return;
              }
            }

            const newPrefix = `\n${nextItemNumber}.- `;
            const before = val.substring(0, start);
            const after = val.substring(end);
            
            const newValue = before + newPrefix + after;
            form.setValue(fieldName, newValue);
            
            const targetPos = start + newPrefix.length;
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(targetPos, targetPos);
            }, 0);
          }
        }
      }
    }
  };

  const handleGuaranteeFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    if (textarea.value === '1.- \n2.- \n3.- \n4.- ') {
      setTimeout(() => {
        textarea.setSelectionRange(4, 4);
      }, 0);
    }
  };

  const handleFieldEnter = (e: React.KeyboardEvent<HTMLElement>, nextFieldName: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const nextElement = document.querySelector<HTMLElement>(`[name="${nextFieldName}"]`);
      if (nextElement) {
        nextElement.focus();
        if (nextElement instanceof HTMLInputElement) {
          nextElement.select?.();
        }
      }
    }
  };

  useEffect(() => {
    // Only execute reset when the dialog transitions from CLOSED to OPEN
    if (open && !prevOpenRef.current) {
      if (initialSelection) {
        setSelectedPlaza(initialSelection.plazaId);
        setSelectedLocalidad(initialSelection.localidadId);
      }
      setStep(1);
      setMatchingClients([]);
      setMatchingGuarantors([]);
      setShowAuthCodeModal(false);
      setAuthCodeInput('');
      setAuthCodeError(false);
      setSelectedClient(null);
      setActiveLoanDetails(null);
      form.reset({
        promotoraId: initialSelection?.promotoraId || '',
        loanPlanId: defaultPlan?.id || '',
        amount: 0,
        clientName: '',
        phone: '',
        street: '',
        neighborhood: '',
        postalCode: '',
        city: '',
        guarantee: '1.- \n2.- \n3.- \n4.- ',
        endorsement: '',
        endorsementStreet: '',
        endorsementNeighborhood: '',
        endorsementPostalCode: '',
        endorsementCity: '',
        endorsementPhone: '',
        endorsementGuarantee: '1.- \n2.- \n3.- \n4.- ',
      });
    } else if (!open && prevOpenRef.current) {
      // Clean up auxiliary search states on close
      setMatchingClients([]);
      setMatchingGuarantors([]);
      setShowAuthCodeModal(false);
      setAuthCodeInput('');
      setAuthCodeError(false);
      setSelectedClient(null);
      setActiveLoanDetails(null);
    }
    prevOpenRef.current = open;
  }, [open, defaultPlan, initialSelection]);


  const getHierarchy = (promotoraId?: string) => {
    const promotora = promotoras.find(p => p.id === promotoraId);
    const localidad = localidades.find(l => l.id === promotora?.localidadId);
    const plaza = plazas.find(p => p.id === localidad?.plazaId);
    return {
      promotoraName: promotora?.name || 'N/A',
      localidadName: localidad?.name || 'N/A',
      plazaName: plaza?.name || 'N/A',
    };
  };

  const checkActiveLoanForClient = (client: Client) => {
    const activeLoan = loans.find(
      (loan) => loan.clientId === client.id && (loan.status === 'Active' || loan.status === 'Overdue')
    );
    
    if (activeLoan) {
        const loanPlan = loanPlans.find(p => p.id === activeLoan.loanPlanId);
        if (loanPlan) {
            const weeklyPayment = (activeLoan.amount / 1000) * loanPlan.weeklyPaymentRate;
            const currentLoanWeek = getCurrentLoanWeekNumber(activeLoan.startDate);

            const baseTerm = loanPlan.termInWeeks;
            const penaltyThreshold = getExtraWeekThreshold(realtimeData?.config);
            const hasPenalty = doesLoanHavePenalty(activeLoan, baseTerm, weeklyPayment, penaltyThreshold);
            const termInWeeks = baseTerm + (hasPenalty ? 1 : 0);
            
            let effectivePaidBase = 0;
            for (let i = 1; i <= baseTerm; i++) {
                const p = activeLoan.payments.find(pay => pay.weekNumber === i);
                if (p) {
                    effectivePaidBase += p.amount;
                } else if (i < currentLoanWeek) {
                    effectivePaidBase += weeklyPayment;
                }
            }

            const baseDebt = Math.max(0, (weeklyPayment * baseTerm) - effectivePaidBase);
            let penaltyDebt = 0;
            if (hasPenalty) {
                const penaltyPayment = activeLoan.payments.find(p => p.weekNumber === baseTerm + 1);
                penaltyDebt = weeklyPayment - (penaltyPayment?.amount || 0);
            }

            const settlementAmount = baseDebt + penaltyDebt;
            const futureWeeksCount = Math.max(0, termInWeeks - currentLoanWeek + 1);
            
            const hierarchy = getHierarchy(activeLoan.promotoraId);

            setActiveLoanDetails({
                loan: activeLoan,
                settlementAmount: settlementAmount,
                weeksRemaining: Math.ceil(futureWeeksCount),
                planName: loanPlan.name,
                hierarchy: hierarchy
            });
        }
    } else {
        setActiveLoanDetails(null);
    }
  };

  const populateClientData = (client: Client) => {
    form.setValue('clientName', client.name.toUpperCase());
    form.setValue('phone', client.phone || '');
    form.setValue('street', client.street || '');
    form.setValue('neighborhood', client.neighborhood || '');
    form.setValue('postalCode', client.postalCode || '');
    form.setValue('city', client.city || '');
    form.setValue('guarantee', client.guarantee || '1.- \n2.- \n3.- \n4.- ');
    
    if (client.endorsement) {
      const parsed = parseEndorsement(client.endorsement);
      form.setValue('endorsement', parsed.name);
      form.setValue('endorsementStreet', parsed.street);
      form.setValue('endorsementNeighborhood', parsed.neighborhood);
      form.setValue('endorsementPostalCode', parsed.postalCode);
      form.setValue('endorsementCity', parsed.city);
      form.setValue('endorsementPhone', parsed.phone);
      form.setValue('endorsementGuarantee', parsed.guarantees || '1.- \n2.- \n3.- \n4.- ');
    } else {
      form.setValue('endorsement', '');
      form.setValue('endorsementStreet', '');
      form.setValue('endorsementNeighborhood', '');
      form.setValue('endorsementPostalCode', '');
      form.setValue('endorsementCity', '');
      form.setValue('endorsementPhone', '');
      form.setValue('endorsementGuarantee', '1.- \n2.- \n3.- \n4.- ');
    }
  };

  const selectClient = (client: Client) => {
    populateClientData(client);
    setSelectedClient(client);
    setMatchingClients([]);
    checkActiveLoanForClient(client);
  };

  const registeredGuarantors = useMemo(() => {
    const guarantorMap = new Map<string, GuarantorSuggestion>();
    
    clients.forEach(client => {
      // 1. Extraer del aval registrado en los clientes
      if (client.endorsement) {
        const parsed = parseEndorsement(client.endorsement);
        if (parsed.name && !guarantorMap.has(parsed.name)) {
          guarantorMap.set(parsed.name, {
            name: parsed.name,
            street: parsed.street,
            neighborhood: parsed.neighborhood,
            postalCode: parsed.postalCode,
            city: parsed.city,
            phone: parsed.phone,
            guarantee: parsed.guarantees
          });
        }
      }

      // 2. Extraer clientes registrados como potenciales avales
      if (client.name) {
        const clientNameUpper = client.name.trim().toUpperCase();
        if (!guarantorMap.has(clientNameUpper)) {
          guarantorMap.set(clientNameUpper, {
            name: clientNameUpper,
            street: client.street || '',
            neighborhood: client.neighborhood || '',
            postalCode: client.postalCode || '',
            city: client.city || '',
            phone: client.phone || '',
            guarantee: client.guarantee || ''
          });
        }
      }
    });
    
    return Array.from(guarantorMap.values());
  }, [clients]);

  const handleGuarantorNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.toUpperCase();
    
    // Si el usuario pega o introduce un formato compuesto: "NOMBRE (CALLE, COLONIA, TEL: ...)"
    if (rawVal.includes('(')) {
      const parsed = parseEndorsement(rawVal);
      if (parsed.name) {
        form.setValue('endorsement', parsed.name);
        if (parsed.street) form.setValue('endorsementStreet', parsed.street);
        if (parsed.neighborhood) form.setValue('endorsementNeighborhood', parsed.neighborhood);
        if (parsed.postalCode) form.setValue('endorsementPostalCode', parsed.postalCode);
        if (parsed.city) form.setValue('endorsementCity', parsed.city);
        if (parsed.phone) form.setValue('endorsementPhone', parsed.phone);
        if (parsed.guarantees) form.setValue('endorsementGuarantee', parsed.guarantees);
        setMatchingGuarantors([]);
        toast({
          title: 'Datos del Aval Detectados',
          description: `Se distribuyeron los datos de ${parsed.name} en sus campos correspondientes.`,
        });
        return;
      }
    }

    form.setValue('endorsement', rawVal);
    
    const trimmed = rawVal.trim();
    if (trimmed.length >= 2) {
      const matches = registeredGuarantors.filter(g => 
        g.name.includes(trimmed)
      );
      setMatchingGuarantors(matches);
    } else {
      setMatchingGuarantors([]);
    }
  };

  const selectGuarantor = (guarantor: GuarantorSuggestion) => {
    form.setValue('endorsement', guarantor.name);
    form.setValue('endorsementStreet', guarantor.street);
    form.setValue('endorsementNeighborhood', guarantor.neighborhood);
    form.setValue('endorsementPostalCode', guarantor.postalCode);
    form.setValue('endorsementCity', guarantor.city);
    form.setValue('endorsementPhone', guarantor.phone);
    if (guarantor.guarantee) {
      form.setValue('endorsementGuarantee', guarantor.guarantee);
    } else {
      form.setValue('endorsementGuarantee', '1.- \n2.- \n3.- \n4.- ');
    }
    setMatchingGuarantors([]);
    toast({
      title: 'Aval Seleccionado',
      description: `Se cargaron los datos de dirección y contacto de ${guarantor.name}.`,
    });
  };

  // Finds the first client with a matching guarantor name to autofill details
  const findMatchingGuarantor = (name: string) => {
    if (!name || name.trim().length < 3) return null;
    const searchName = name.trim().toUpperCase();
    
    for (const client of clients) {
      if (client.endorsement) {
        const parsed = parseEndorsement(client.endorsement);
        if (parsed.name === searchName) {
          return {
            name: parsed.name,
            street: parsed.street,
            neighborhood: parsed.neighborhood,
            postalCode: parsed.postalCode,
            city: parsed.city,
            phone: parsed.phone,
            guarantee: parsed.guarantees
          };
        }
      }
    }
    return null;
  };

  // Find all active/overdue clients backed by this guarantor name
  const getGuarantorActiveBacking = (guarantorNameInput: string) => {
    if (!guarantorNameInput || guarantorNameInput.trim().length < 3) return [];
    
    const parsedInput = parseEndorsement(guarantorNameInput);
    const searchName = (parsedInput.name || guarantorNameInput).trim().toUpperCase();
    const activeBackings: { clientName: string; plaza: string; localidad: string; promotora: string }[] = [];
    
    clients.forEach(client => {
      if (selectedClient && client.id === selectedClient.id) return;
      
      if (client.endorsement) {
        const parsed = parseEndorsement(client.endorsement);
        if (parsed.name === searchName) {
          const activeLoans = loans.filter(l => l.clientId === client.id && (l.status === 'Active' || l.status === 'Overdue'));
          
          if (activeLoans.length > 0) {
            const promotora = promotoras.find(p => p.id === activeLoans[0].promotoraId);
            const localidad = promotora ? localidades.find(loc => loc.id === promotora.localidadId) : null;
            const plaza = localidad ? plazas.find(pl => pl.id === localidad.plazaId) : null;
            
            activeBackings.push({
              clientName: client.name,
              promotora: promotora?.name || '—',
              localidad: localidad?.name || '—',
              plaza: plaza?.name || '—'
            });
          }
        }
      }
    });
    
    return activeBackings;
  };



  const handleClientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value.toUpperCase();
    form.setValue('clientName', name);
    
    const trimmedName = name.trim();
    // Check for exact match automatically (ignoring case, trimming whitespaces)
    const exactMatch = clients.find(c => c.name.trim().toUpperCase() === trimmedName);
    if (exactMatch) {
        setSelectedClient(exactMatch);
        populateClientData(exactMatch);
        checkActiveLoanForClient(exactMatch);
        setMatchingClients([]);
    } else {
        setSelectedClient(null);
        setActiveLoanDetails(null);

        if (trimmedName.length >= 2) {
          const matches = clients.filter((client) =>
            client.name.trim().toUpperCase().includes(trimmedName)
          );
          setMatchingClients(matches);
        } else {
          setMatchingClients([]);
        }
    }
  };
  
  const handleNextStep = async () => {
    const isValid = await form.trigger(['promotoraId', 'loanPlanId', 'amount', 'clientName']);
    if (isValid) {
        if (activeLoanDetails) {
            toast({
                title: 'Renovación de Préstamo',
                description: `El cliente tiene un préstamo activo (${activeLoanDetails.planName}). Saldo por liquidar: ${formatCurrency(activeLoanDetails.settlementAmount)}. Avanzando al siguiente paso...`,
            });
        }
        setStep(2);
        setTimeout(() => {
          const streetInput = document.querySelector<HTMLElement>('input[name="street"]');
          streetInput?.focus();
          if (streetInput instanceof HTMLInputElement) {
            streetInput.select?.();
          }
        }, 80);
    }
  };

  const handlePayOffLoan = async () => {
    if (!activeLoanDetails) return;
    setIsPayingOff(true);
    try {
        const result = await payOffLoanAction(activeLoanDetails.loan.id, appUser?.id);
        if (result.success) {
            toast({
                title: 'Préstamo Liquidado',
                description: 'El préstamo ha sido liquidado exitosamente. Ahora puede proceder con el nuevo registro.'
            });
            setActiveLoanDetails(null);
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error al Liquidar',
            description: error.message || 'No se pudo liquidar el préstamo.'
        });
    } finally {
        setIsPayingOff(false);
    }
  };
  
    const proceedWithSubmission = async (values: LoanFormValues) => {
        setIsSubmitting(true);
        try {
            const cleanedGuarantee = cleanGuaranteeValue(values.guarantee);
            const cleanedEndorsementGuarantee = cleanGuaranteeValue(values.endorsementGuarantee);

            const endorsementAddressParts = [
                values.endorsementStreet?.toUpperCase(),
                values.endorsementNeighborhood?.toUpperCase(),
                values.endorsementPostalCode?.toUpperCase(),
                values.endorsementCity?.toUpperCase(),
                values.endorsementPhone ? `Tel: ${values.endorsementPhone.toUpperCase()}` : '',
                cleanedEndorsementGuarantee ? `Garantía: ${cleanedEndorsementGuarantee.toUpperCase()}` : ''
            ].filter(Boolean);

            const endorsementAddress = endorsementAddressParts.join(', ');
            const endorsementValue = values.endorsement?.toUpperCase();
            const fullEndorsement = endorsementValue && endorsementAddress ? `${endorsementValue} (${endorsementAddress})` : endorsementValue || '';

            const clientData: Omit<Client, 'id' | 'avatarUrl'> & { id?: string } = selectedClient ?
                {
                    ...selectedClient,
                    name: values.clientName.toUpperCase(),
                    street: values.street?.toUpperCase() || '',
                    neighborhood: values.neighborhood?.toUpperCase() || '',
                    postalCode: values.postalCode?.toUpperCase() || '',
                    city: values.city?.toUpperCase() || '',
                    phone: values.phone?.toUpperCase() || '',
                    guarantee: cleanedGuarantee.toUpperCase() || '',
                    endorsement: fullEndorsement,
                } :
                {
                    name: values.clientName.toUpperCase(),
                    email: `${values.clientName.split(' ').join('.').toLowerCase()}@example.com`,
                    street: values.street?.toUpperCase() || '',
                    neighborhood: values.neighborhood?.toUpperCase() || '',
                    postalCode: values.postalCode?.toUpperCase() || '',
                    city: values.city?.toUpperCase() || '',
                    phone: values.phone?.toUpperCase() || '',
                    guarantee: cleanedGuarantee.toUpperCase() || '',
                    endorsement: fullEndorsement,
                };

            if (selectedClient?.id) {
                clientData.id = selectedClient.id;
            }

            const result = await createLoanAction({
                promotoraId: values.promotoraId,
                loanPlanId: values.loanPlanId,
                amount: values.amount,
                client: clientData,
            });

            if (result.success) {
                const plan = loanPlans.find(p => p.id === values.loanPlanId);
                const weeklyPayment = plan ? (Number(values.amount) / 1000) * plan.weeklyPaymentRate : 0;
                const ratePerThousand = plan ? plan.weeklyPaymentRate : 0;
                const todayMexicoStr = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Mexico_City',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).format(new Date());

                const newLoanId = (result as any).loanId || `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

                // Registrar en la lista local de préstamos capturados de la sesión actual
                setLocalCapturedLoans(prev => [
                    {
                        id: newLoanId,
                        clientName: values.clientName.trim().toUpperCase(),
                        amount: Number(values.amount),
                        ratePerThousand: ratePerThousand,
                        weeklyPayment: weeklyPayment,
                        termInWeeks: plan?.termInWeeks || 0,
                        planName: plan?.name || '—',
                        promotoraId: values.promotoraId,
                        capturedDate: todayMexicoStr,
                    },
                    ...prev
                ]);

                toast({
                    title: 'Préstamo Creado Exitosamente',
                    description: `El préstamo para ${values.clientName} ha sido registrado. Puedes continuar capturando el siguiente cliente.`,
                });
                
                router.refresh();
                setShowIncompleteModal(false);
                setFormValues(null);
                // NO cerramos la ventana: volvemos al paso 1 para capturar al siguiente cliente
                setStep(1);
                setSelectedClient(null);
                setActiveLoanDetails(null);
                setMatchingClients([]);
                setMatchingGuarantors([]);

                // Mantener promotora y tipo de préstamo seleccionados, limpiar datos del cliente
                form.reset({
                    promotoraId: values.promotoraId,
                    loanPlanId: values.loanPlanId,
                    amount: 0,
                    clientName: '',
                    phone: '',
                    street: '',
                    neighborhood: '',
                    postalCode: '',
                    city: '',
                    guarantee: '1.- \n2.- \n3.- \n4.- ',
                    endorsement: '',
                    endorsementStreet: '',
                    endorsementNeighborhood: '',
                    endorsementPostalCode: '',
                    endorsementCity: '',
                    endorsementPhone: '',
                    endorsementGuarantee: '1.- \n2.- \n3.- \n4.- ',
                });

                // Foco automático en el campo del nombre del cliente para captura rápida
                setTimeout(() => {
                    const clientInput = document.querySelector<HTMLInputElement>('input[name="clientName"]');
                    clientInput?.focus();
                }, 120);
            } else {
                throw new Error(result.message || 'Error desconocido');
            }

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Crear Préstamo',
                description: error.message || 'Hubo un error al crear el préstamo. Por favor, inténtelo de nuevo.',
            });
            setShowIncompleteModal(false);
        } finally {
            setIsSubmitting(false);
        }
    };

  const checkIsIncomplete = (values: LoanFormValues) => {
    const missing: string[] = [];
    
    // Cliente
    if (!values.street?.trim()) missing.push('Calle y Número');
    if (!values.postalCode?.trim()) missing.push('C.P.');
    if (!values.neighborhood?.trim()) missing.push('Colonia');
    if (!values.city?.trim()) missing.push('Ciudad o Localidad');
    if (!values.phone?.trim()) missing.push('Teléfono');
    if (!cleanGuaranteeValue(values.guarantee)) missing.push('Garantías del cliente');

    // Aval
    if (!values.endorsement?.trim()) {
      missing.push('Datos del aval');
    } else {
      if (!values.endorsementStreet?.trim()) missing.push('Calle del aval');
      if (!values.endorsementPostalCode?.trim()) missing.push('C.P. del aval');
      if (!values.endorsementNeighborhood?.trim()) missing.push('Colonia del aval');
      if (!values.endorsementCity?.trim()) missing.push('Ciudad del aval');
      if (!values.endorsementPhone?.trim()) missing.push('Teléfono del aval');
      if (!cleanGuaranteeValue(values.endorsementGuarantee)) missing.push('Garantías del aval');
    }

    return missing;
  };

  const onSubmit = async (values: LoanFormValues) => {
    if (step === 1) {
      handleNextStep();
      return;
    }

    // Check guarantor client limit if configured
    if (maxGuarantorClients > 0 && values.endorsement) {
      const activeBackings = getGuarantorActiveBacking(values.endorsement);
      if (activeBackings.length >= maxGuarantorClients) {
        setBlockedGuarantorDetails(activeBackings);
        setFormValues(values);
        setShowGuarantorLimitAlert(true);
        return;
      }
    }

    // Comprobar si falta información por capturar
    const missing = checkIsIncomplete(values);
    if (missing.length > 0) {
      setMissingFields(missing);
      setFormValues(values);
      setShowIncompleteModal(true);
      return;
    }

    // Si toda la información está completa, registrar directamente sin confirmación doble
    await proceedWithSubmission(values);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      const currentValues = form.getValues();
      const hasData = (
        step === 2 ||
        (currentValues.clientName && currentValues.clientName.trim().length > 0) ||
        (currentValues.amount && Number(currentValues.amount) > 0) ||
        (currentValues.street && currentValues.street.trim().length > 0) ||
        (currentValues.endorsement && currentValues.endorsement.trim().length > 0)
      );

      if (hasData && !isSubmitting) {
        setShowExitConfirm(true);
        return;
      }
      setOpen(false);
    } else {
      setOpen(true);
    }
  };

  const handleFinishCapture = () => {
    const currentValues = form.getValues();
    const hasData = (
      step === 2 ||
      (currentValues.clientName && currentValues.clientName.trim().length > 0) ||
      (currentValues.amount && Number(currentValues.amount) > 0) ||
      (currentValues.street && currentValues.street.trim().length > 0) ||
      (currentValues.endorsement && currentValues.endorsement.trim().length > 0)
    );

    if (hasData && !isSubmitting) {
      setShowExitConfirm(true);
      return;
    }
    setOpen(false);
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    setOpen(false);
    setStep(1);
    setSelectedClient(null);
    setActiveLoanDetails(null);
    form.reset();
  };

  const handleAuthorize = () => {
    const correctCode = realtimeData?.config?.guarantorAuthCode;
    if (!correctCode) {
      toast({
        variant: 'destructive',
        title: 'Error de Configuración',
        description: 'No se ha configurado ninguna clave de autorización en Ajustes. Configure una antes de continuar.'
      });
      return;
    }
    setShowAuthCodeModal(true);
  };

  const handleConfirmAuthorization = () => {
    const correctCode = realtimeData?.config?.guarantorAuthCode;
    if (authCodeInput.trim() === correctCode) {
      setShowAuthCodeModal(false);
      setShowGuarantorLimitAlert(false);
      setAuthCodeInput('');
      setAuthCodeError(false);
      if (formValues) {
        proceedWithSubmission(formValues);
      }
    } else {
      setAuthCodeError(true);
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const handlePlazaChange = (plazaId: string) => {
    setSelectedPlaza(plazaId);
    setSelectedLocalidad('');
    form.setValue('promotoraId', '');
  };

  const handleLocalidadChange = (localidadId: string) => {
      setSelectedLocalidad(localidadId);
      form.setValue('promotoraId', '');
  };

    const handleDataExtracted = (data: Partial<IdDataOutput>) => {
        if (data.name) {
            const nameUpper = data.name.toUpperCase();
            form.setValue('clientName', nameUpper);
            
            const trimmedName = nameUpper.trim();
            // Check for exact match with scanned name (ignoring case, trimming whitespaces)
            const exactMatch = clients.find(c => c.name.trim().toUpperCase() === trimmedName);
            if (exactMatch) {
                selectClient(exactMatch);
                return;
            }
        }

        if (data.name) form.setValue('clientName', data.name.toUpperCase());
        if (data.street) form.setValue('street', data.street.toUpperCase());
        if (data.neighborhood) form.setValue('neighborhood', data.neighborhood.toUpperCase());
        if (data.postalCode) {
          form.setValue('postalCode', data.postalCode.toUpperCase());
          handlePostalCodeLookup(data.postalCode, 'client');
        }
        if (data.city) form.setValue('city', data.city.toUpperCase());

        setSelectedClient(null);
        setActiveLoanDetails(null);
    };

    const getMostCommonColony = (cp: string, colonies: string[]): string => {
      if (!colonies || colonies.length === 0) return '';
      if (colonies.length === 1) return colonies[0];

      const cleaned = (cp || '').replace(/\D/g, '').padStart(5, '0');
      const frequencyMap: Record<string, number> = {};
      
      clients.forEach(c => {
        const cCp = (c.postalCode || '').replace(/\D/g, '').padStart(5, '0');
        if (cCp === cleaned && c.neighborhood) {
          const n = c.neighborhood.trim().toUpperCase();
          frequencyMap[n] = (frequencyMap[n] || 0) + 1;
        }
        if (c.endorsement && typeof c.endorsement === 'object') {
          const endorsementObj = c.endorsement as { postalCode?: string; neighborhood?: string };
          const eCp = (endorsementObj.postalCode || '').replace(/\D/g, '').padStart(5, '0');
          if (eCp === cleaned && endorsementObj.neighborhood) {
            const n = endorsementObj.neighborhood.trim().toUpperCase();
            frequencyMap[n] = (frequencyMap[n] || 0) + 1;
          }
        }
      });

      let best = '';
      let maxCount = 0;

      colonies.forEach(col => {
        const count = frequencyMap[col.trim().toUpperCase()] || 0;
        if (count > maxCount) {
          maxCount = count;
          best = col;
        }
      });

      // Si hay colonias con frecuencia previa registrada en la app, usar la más común
      if (best && maxCount > 0) {
        return best;
      }

      // Si no hay historial o ninguna tiene registros:
      // Priorizar CENTRO / ZONA CENTRO o la que contenga CENTRO (ej: CIUDAD GUZMAN CENTRO)
      const centroColony = colonies.find(c => {
        const upper = c.trim().toUpperCase();
        return upper === 'CENTRO' || upper === 'ZONA CENTRO' || upper.endsWith(' CENTRO') || upper.startsWith('CENTRO ') || upper.includes('CENTRO');
      });

      if (centroColony) {
        return centroColony;
      }

      return colonies[0];
    };

    const applyPostalCodeData = (
      data: { colony?: string; colonies?: string[]; city?: string },
      target: 'client' | 'endorsement',
      cpUsed?: string
    ) => {
      const coloniesList = (data.colonies && data.colonies.length > 0)
        ? data.colonies
        : (data.colony ? [data.colony] : []);

      const bestColony = getMostCommonColony(cpUsed || '', coloniesList);

      if (target === 'client') {
        if (data.city) form.setValue('city', data.city.toUpperCase());
        setClientColonies(coloniesList);
        if (bestColony) {
          form.setValue('neighborhood', bestColony);
        }
        setShowClientColonies(false);
      } else {
        if (data.city) form.setValue('endorsementCity', data.city.toUpperCase());
        setEndorsementColonies(coloniesList);
        if (bestColony) {
          form.setValue('endorsementNeighborhood', bestColony);
        }
        setShowEndorsementColonies(false);
      }
    };

    const handlePostalCodeLookup = async (
      rawCp: string,
      target: 'client' | 'endorsement',
      force = false
    ) => {
      const cleanedCp = (rawCp || '').replace(/\D/g, '').trim();
      if (!cleanedCp || (cleanedCp.length !== 5 && (!force || cleanedCp.length < 4))) {
        return;
      }

      const formattedCp = cleanedCp.padStart(5, '0');

      // 1. Verificación rápida en memoria si ya existen clientes con ese C.P.
      const matches = clients.filter(c => (c.postalCode || '').trim() === formattedCp && (c.neighborhood || c.city));
      if (matches.length > 0) {
        const memColonies = Array.from(new Set(matches.map(c => (c.neighborhood || '').trim().toUpperCase()).filter(Boolean)));
        const memCity = matches.find(c => c.city)?.city || '';
        if (memColonies.length > 0 || memCity) {
          applyPostalCodeData({ colony: memColonies[0], colonies: memColonies, city: memCity }, target, formattedCp);
        }
      }

      // 2. Consulta directa a SEPOMEX (con CORS público habilitado)
      try {
        const sepomexRes = await fetch(`https://sepomex.kurenn.dev/api/v1/zip_codes?zip_code=${formattedCp}&per_page=100`);
        if (sepomexRes.ok) {
          const sepomexData = await sepomexRes.json();
          const zipCodes = sepomexData.zip_codes || [];
          if (Array.isArray(zipCodes) && zipCodes.length > 0) {
            const sepomexColoniesSet = new Set<string>();
            zipCodes.forEach((item: any) => {
              const c = item.d_asenta || item.colony;
              if (c && typeof c === 'string') {
                sepomexColoniesSet.add(c.trim().toUpperCase());
              }
            });
            const first = zipCodes[0];
            const city = first.d_ciudad || first.d_mnpio || first.city || first.municipality || '';
            const coloniesList = Array.from(sepomexColoniesSet);
            if (coloniesList.length > 0 || city) {
              applyPostalCodeData({
                colony: coloniesList[0] || '',
                colonies: coloniesList,
                city: city,
              }, target, formattedCp);
              return;
            }
          }
        }
      } catch {
        // Continuar con fallback
      }

      // 3. Fallback a la API interna /api/postal-code/:cp
      try {
        const res = await fetch(`/api/postal-code/${formattedCp}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && (data.colonies?.length || data.colony || data.city)) {
            applyPostalCodeData(data, target, formattedCp);
            return;
          }
        }
      } catch {
        // Fallback a zippopotam
      }

      // 4. Fallback directo en el cliente a zippopotam (CORS público)
      try {
        const directRes = await fetch(`https://api.zippopotam.us/mx/${formattedCp}`);
        if (directRes.ok) {
          const directData = await directRes.json();
          const places = directData.places || [];
          const directColoniesSet = new Set<string>();
          let directCity = '';
          places.forEach((p: any) => {
            const pName = (p['place name'] || '').toUpperCase();
            if (pName) directColoniesSet.add(pName);
            if (!directCity) directCity = p['state'] || pName;
          });
          const directColonies = Array.from(directColoniesSet);
          if (directColonies.length > 0) {
            applyPostalCodeData({ colony: directColonies[0], colonies: directColonies, city: directCity }, target, formattedCp);
          }
        }
      } catch {
        // Silencioso según requerimientos
      }
    };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={!initialSelection?.promotoraId}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Préstamo
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-[850px] max-h-[95vh] overflow-y-auto p-5"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
              <DialogTitle className="uppercase font-black tracking-tight text-lg">
                Crear Nuevo Préstamo - Paso {step} de 2
              </DialogTitle>
              {capturedLoans.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-black border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300">
                  {capturedLoans.length} {capturedLoans.length === 1 ? 'crédito capturado' : 'créditos capturados'}
                </Badge>
              )}
            </DialogHeader>

            {step === 1 && (
              <div className="space-y-3 py-1">
                {/* Etiquetas de ubicación informativas */}
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-muted/40 rounded-lg border border-zinc-200/50">
                  <span className="text-[9px] font-black text-zinc-500 uppercase mr-1">Ubicación:</span>
                  <Badge variant="secondary" className="text-[9px] font-extrabold uppercase bg-white border border-zinc-200 text-zinc-700 shadow-sm">
                    Plaza: {currentHierarchy.plazaName}
                  </Badge>
                  <Badge variant="secondary" className="text-[9px] font-extrabold uppercase bg-white border border-zinc-200 text-zinc-700 shadow-sm">
                    Localidad: {currentHierarchy.localidadName}
                  </Badge>
                  <Badge variant="secondary" className="text-[9px] font-extrabold uppercase bg-white border border-zinc-200 text-zinc-700 shadow-sm">
                    Promotora: {currentHierarchy.promotoraName}
                    {currentHierarchy.personalName && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold ml-1">
                        ({currentHierarchy.personalName})
                      </span>
                    )}
                  </Badge>
                </div>

                {/* 1. Nombre del Cliente */}
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem className="relative space-y-1">
                      <FormLabel className="text-[10px] font-black uppercase text-muted-foreground">Nombre del Cliente</FormLabel>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Input 
                              placeholder="Busca o registra un cliente" 
                              {...field} 
                              onChange={handleClientNameChange} 
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setMatchingClients([]);
                                  handleFieldEnter(e, 'amount');
                                }
                              }}
                              autoComplete="off" 
                              className="uppercase h-10 font-bold flex-grow text-sm placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                            />
                          </FormControl>
                          <IdScanner onDataExtracted={handleDataExtracted} />
                        </div>
                       {matchingClients.length > 0 && (
                        <Card className="absolute z-50 w-full mt-1 shadow-2xl border-2">
                            <ul className="max-h-60 overflow-y-auto divide-y">
                                {matchingClients.map(client => (
                                    <li key={client.id}
                                        className="px-4 py-3 cursor-pointer hover:bg-blue-50 flex items-center justify-between transition-colors"
                                        onClick={() => selectClient(client)}>
                                        <div className="flex flex-col">
                                            <span className="font-black text-xs uppercase text-blue-900">{client.name}</span>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase">{client.street}, {client.neighborhood}</span>
                                        </div>
                                        <Badge variant="outline" className="text-[8px] font-black border-blue-200 text-blue-600 bg-blue-50">REGISTRADO</Badge>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                       )}

                        {activeLoanDetails && (
                            <Card className="mt-4 bg-amber-50/90 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700 animate-in fade-in zoom-in-95 duration-300">
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        <AlertTriangle className="h-8 w-8 text-amber-600 flex-shrink-0 mt-1" />
                                        <div className="flex-grow space-y-3">
                                            <div>
                                                <h3 className="font-black text-amber-800 dark:text-amber-300 uppercase text-sm tracking-tight">Cliente con Préstamo Activo</h3>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/80 dark:bg-zinc-900/80 p-3 rounded-lg border border-amber-200 dark:border-amber-800 shadow-inner">
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                                                        <span>Plan:</span>
                                                        <span className="text-zinc-800 dark:text-zinc-200">{activeLoanDetails.planName}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                                                        <span>Monto Orig:</span>
                                                        <span className="text-zinc-800 dark:text-zinc-200">{formatCurrency(activeLoanDetails.loan.amount)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                                                        <span>Semanas Pend:</span>
                                                        <span className="text-zinc-800 dark:text-zinc-200">{activeLoanDetails.weeksRemaining}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center pt-1 border-t border-amber-200 dark:border-amber-800">
                                                        <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 uppercase">Saldo por Liquidar:</span>
                                                        <span className="text-sm font-black text-amber-800 dark:text-amber-300">{formatCurrency(activeLoanDetails.settlementAmount)}</span>
                                                    </div>
                                                </div>
                                                <div className='border-l border-amber-200 dark:border-amber-800 pl-4 space-y-1'>
                                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-zinc-500">
                                                    <PlusCircle className="h-3 w-3 text-amber-500" /> Plaza: <span className="text-zinc-800 dark:text-zinc-200">{activeLoanDetails.hierarchy.plazaName}</span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-zinc-500">
                                                    <PlusCircle className="h-3 w-3 text-amber-500" /> Localidad: <span className="text-zinc-800 dark:text-zinc-200">{activeLoanDetails.hierarchy.localidadName}</span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-zinc-500">
                                                    <PlusCircle className="h-3 w-3 text-amber-500" /> Promotora: <span className="text-zinc-800 dark:text-zinc-200">{activeLoanDetails.hierarchy.promotoraName}</span>
                                                  </div>
                                                </div>
                                            </div>
                                         </div>
                                     </div>
                                </CardContent>
                            </Card>
                        )}
                       {!activeLoanDetails && selectedClient && (
                           <Alert className="mt-3 bg-blue-50 border-blue-200">
                                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                                <AlertTitle className="text-xs font-black uppercase text-blue-800">Cliente Verificado</AlertTitle>
                                <AlertDescription className="text-[10px] font-bold text-blue-700 uppercase">Sin deudas activas. Puede continuar con el registro.</AlertDescription>
                           </Alert>
                       )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 2. Tipo de Préstamo, Monto del Préstamo y Abono del Cliente */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="loanPlanId"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] font-black uppercase text-muted-foreground">Tipo de Préstamo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger className="h-10 uppercase font-bold text-sm">
                              <SelectValue placeholder={<span className="text-zinc-400 font-normal normal-case">Selecciona...</span>} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sortedLoanPlans.map((plan) => (
                              <SelectItem key={plan.id} value={plan.id} className="uppercase font-bold text-sm">
                                {plan.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] font-black uppercase text-muted-foreground">Monto del Préstamo ($)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Ej: 1000" 
                            {...field} 
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleNextStep();
                              }
                            }}
                            className="h-10 font-bold text-sm placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem className="space-y-1">
                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground">Abono Semanal</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        readOnly
                        disabled
                        value={calculatedAbono > 0 ? formatCurrency(calculatedAbono) : '—'}
                        className="h-10 font-black text-sm bg-blue-700 border-blue-800 text-white disabled:bg-blue-700 disabled:text-white disabled:opacity-100 dark:bg-blue-800 dark:border-blue-900 dark:disabled:bg-blue-800 dark:text-white cursor-not-allowed shadow-inner"
                      />
                    </FormControl>
                  </FormItem>
                </div>

                {/* Sección de Préstamos Capturados (Estilo Ventana de Captura) */}
                <div className="mt-4 border rounded-xl bg-slate-50/70 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                  <div className="bg-slate-100/90 dark:bg-zinc-800/80 px-3.5 py-2 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-tight text-slate-700 dark:text-zinc-200">
                        Préstamos capturados
                      </span>
                      {capturedLoans.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] font-black bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200">
                          {capturedLoans.length} {capturedLoans.length === 1 ? 'registrado' : 'registrados'}
                        </Badge>
                      )}
                    </div>
                    {capturedLoans.length > 0 && (
                      <div className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                        Total acumulado: {formatCurrency(capturedLoans.reduce((sum, l) => sum + l.amount, 0))}
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b bg-white dark:bg-zinc-950/60 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 sticky top-0 z-10">
                          <th className="py-2 px-3">Cliente</th>
                          <th className="py-2 px-3 text-right">Importe</th>
                          <th className="py-2 px-3 text-right">Abono Semanal</th>
                          <th className="py-2 px-3 text-center">Plazo</th>
                          <th className="py-2 px-3 text-center">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {capturedLoans.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground italic font-medium">
                              No hay prestamos capturados segun el criterio CR
                            </td>
                          </tr>
                        ) : (
                          capturedLoans.map((loan, idx) => (
                            <tr 
                              key={loan.id || idx} 
                              className="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                            >
                              <td className="py-2 px-3 font-black uppercase text-slate-800 dark:text-zinc-200">
                                {loan.clientName}
                              </td>
                              <td className="py-2 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(loan.amount)}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-600 dark:text-zinc-400">
                                {formatCurrency(loan.weeklyPayment)}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-600 dark:text-zinc-400">
                                {loan.termInWeeks ? `${loan.termInWeeks} sem` : '—'}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-600 dark:text-zinc-400">
                                {loan.ratePerThousand}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            
            {step === 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-1">
                {/* Column 1: Datos del Cliente */}
                <div className="space-y-3 p-4 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/80 shadow-md rounded-xl">
                  <div className="border-b pb-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-blue-900 dark:text-blue-300">Datos del Cliente</h3>
                    {watchClientName && (
                      <div className="mt-1.5 flex items-center gap-2 bg-blue-50/80 dark:bg-blue-950/40 px-3 py-2 rounded-lg border border-blue-200/70 dark:border-blue-800/50">
                        <User className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                          {watchClientName}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* 1.- CALLE Y NUMERO */}
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Calle y Número</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej: Av. Principal 123" 
                            {...field} 
                            value={field.value || ''} 
                            onKeyDown={(e) => handleFieldEnter(e, 'postalCode')}
                            className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                          />
                        </FormControl>
                        <FormMessage className="text-[9px]" />
                      </FormItem>
                    )}
                  />

                  {/* 2.- C.P. y 3.- COLONIA */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">C.P.</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="63000" 
                                {...field} 
                                value={field.value || ''} 
                                onChange={(e) => {
                                  field.onChange(e);
                                  handlePostalCodeLookup(e.target.value, 'client');
                                }}
                                onBlur={(e) => {
                                  field.onBlur();
                                  handlePostalCodeLookup(e.target.value, 'client', true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handlePostalCodeLookup(e.currentTarget.value, 'client', true);
                                  }
                                  handleFieldEnter(e, 'neighborhood');
                                }}
                                className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-2 relative">
                      <FormField
                        control={form.control}
                        name="neighborhood"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Colonia</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Centro" 
                                {...field} 
                                value={field.value || ''} 
                                onFocus={() => {
                                  if (clientColonies.length > 1) {
                                    setShowClientColonies(true);
                                  }
                                }}
                                onClick={() => {
                                  if (clientColonies.length > 1) {
                                    setShowClientColonies(true);
                                  }
                                }}
                                onChange={(e) => {
                                  field.onChange(e);
                                  if (clientColonies.length > 1) {
                                    setShowClientColonies(true);
                                  }
                                }}
                                onBlur={(e) => {
                                  field.onBlur();
                                  setTimeout(() => setShowClientColonies(false), 200);
                                }}
                                onKeyDown={(e) => handleFieldEnter(e, 'city')}
                                className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                      {showClientColonies && clientColonies.length > 1 && (
                        <Card 
                          className="absolute left-0 right-0 z-50 mt-1 shadow-2xl border-2 dark:bg-zinc-950 overflow-hidden"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 border-b text-[9px] font-black uppercase text-zinc-500">
                            {filteredClientColonies.length} {filteredClientColonies.length === 1 ? 'colonia disponible' : 'colonias disponibles'}
                          </div>
                          <ul className="max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredClientColonies.map((col, idx) => (
                              <li
                                key={idx}
                                className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between transition-colors text-xs font-bold uppercase text-zinc-800 dark:text-zinc-200"
                                onClick={() => {
                                  form.setValue('neighborhood', col);
                                  setShowClientColonies(false);
                                }}
                              >
                                <span>{col}</span>
                                {form.getValues('neighborhood')?.trim().toUpperCase() === col && (
                                  <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                )}
                              </li>
                            ))}
                          </ul>
                        </Card>
                      )}
                    </div>
                  </div>

                  {/* 4.- CIUDAD O LOCALIDAD y 5.- TELEFONO */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Ciudad o Localidad</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Tepic" 
                                {...field} 
                                value={field.value || ''} 
                                onKeyDown={(e) => handleFieldEnter(e, 'phone')}
                                className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div>
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Teléfono</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="311 000 0000" 
                                {...field} 
                                value={formatPhoneNumber(field.value || '')} 
                                onChange={(e) => {
                                  const formatted = formatPhoneNumber(e.target.value);
                                  field.onChange(formatted);
                                }}
                                maxLength={12}
                                inputMode="numeric"
                                onKeyDown={(e) => handleFieldEnter(e, 'guarantee')}
                                className="h-9 text-xs font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal font-mono" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* 6.- GARANTIAS */}
                  <FormField
                    control={form.control}
                    name="guarantee"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Garantías</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe las garantías del cliente..." 
                            {...field} 
                            value={field.value || ''} 
                            onKeyDown={(e) => handleGuaranteeKeyDown(e, 'guarantee')}
                            onFocus={handleGuaranteeFocus}
                            className="uppercase font-bold min-h-[96px] text-xs py-1.5 placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                          />
                        </FormControl>
                        <FormMessage className="text-[9px]" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Column 2: Datos del Responsable (Aval) */}
                <div className="space-y-3 p-4 bg-blue-50/30 dark:bg-blue-950/10 border border-blue-100/60 dark:border-blue-900/30 shadow-md rounded-xl">
                  <h3 className="text-xs font-black uppercase tracking-widest text-blue-600 border-b pb-1">Datos del Responsable (Aval)</h3>
                  
                  {/* NOMBRE DEL AVAL (Siempre Primero) */}
                  <FormField
                    control={form.control}
                    name="endorsement"
                    render={({ field }) => (
                      <FormItem className="relative space-y-1">
                        <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Nombre del Aval</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Nombre completo del aval" 
                            {...field} 
                            value={field.value || ''} 
                            onChange={handleGuarantorNameChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                setMatchingGuarantors([]);
                                handleFieldEnter(e, 'endorsementStreet');
                              }
                            }}
                            autoComplete="off"
                            className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                            onBlur={(e) => {
                              field.onBlur();
                              setTimeout(() => {
                                setMatchingGuarantors([]);
                              }, 200);
                            }}
                          />
                        </FormControl>
                        {matchingGuarantors.length > 0 && (
                          <Card 
                            className="absolute left-0 right-0 z-50 mt-1 shadow-2xl border-2 dark:bg-zinc-950"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                              <ul className="max-h-60 overflow-y-auto divide-y">
                                  {matchingGuarantors.map((guarantor, idx) => (
                                      <li key={idx}
                                          className="px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between transition-colors"
                                          onClick={() => selectGuarantor(guarantor)}>
                                          <div className="flex flex-col">
                                              <span className="font-black text-xs uppercase text-blue-900 dark:text-blue-300">{guarantor.name}</span>
                                              {(guarantor.street || guarantor.neighborhood || guarantor.city || guarantor.phone) && (
                                                 <span className="text-[9px] font-bold text-muted-foreground uppercase">
                                                   {[guarantor.street, guarantor.neighborhood, guarantor.city, guarantor.phone ? `Tel: ${guarantor.phone}` : ''].filter(Boolean).join(', ')}
                                                 </span>
                                              )}
                                          </div>
                                          <Badge variant="outline" className="text-[8px] font-black border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-950/50">REGISTRADO</Badge>
                                      </li>
                                  ))}
                              </ul>
                          </Card>
                        )}
                        <FormMessage className="text-[9px]" />
                      </FormItem>
                    )}
                  />

                  {/* 2.- CALLE Y NUMERO */}
                  <FormField
                    control={form.control}
                    name="endorsementStreet"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Calle y Número del Aval</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Domicilio del aval" 
                            {...field} 
                            value={field.value || ''} 
                            onKeyDown={(e) => handleFieldEnter(e, 'endorsementPostalCode')}
                            className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                          />
                        </FormControl>
                        <FormMessage className="text-[9px]" />
                      </FormItem>
                    )}
                  />

                  {/* 3.- C.P. y 4.- COLONIA */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name="endorsementPostalCode"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">C.P.</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="63000" 
                                {...field} 
                                value={field.value || ''} 
                                onChange={(e) => {
                                  field.onChange(e);
                                  handlePostalCodeLookup(e.target.value, 'endorsement');
                                }}
                                onBlur={(e) => {
                                  field.onBlur();
                                  handlePostalCodeLookup(e.target.value, 'endorsement', true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handlePostalCodeLookup(e.currentTarget.value, 'endorsement', true);
                                  }
                                  handleFieldEnter(e, 'endorsementNeighborhood');
                                }}
                                className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-2 relative">
                      <FormField
                        control={form.control}
                        name="endorsementNeighborhood"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Colonia</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Centro" 
                                {...field} 
                                value={field.value || ''} 
                                onFocus={() => {
                                  if (endorsementColonies.length > 1) {
                                    setShowEndorsementColonies(true);
                                  }
                                }}
                                onClick={() => {
                                  if (endorsementColonies.length > 1) {
                                    setShowEndorsementColonies(true);
                                  }
                                }}
                                onChange={(e) => {
                                  field.onChange(e);
                                  if (endorsementColonies.length > 1) {
                                    setShowEndorsementColonies(true);
                                  }
                                }}
                                onBlur={(e) => {
                                  field.onBlur();
                                  setTimeout(() => setShowEndorsementColonies(false), 200);
                                }}
                                onKeyDown={(e) => handleFieldEnter(e, 'endorsementCity')}
                                className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                      {showEndorsementColonies && endorsementColonies.length > 1 && (
                        <Card 
                          className="absolute left-0 right-0 z-50 mt-1 shadow-2xl border-2 dark:bg-zinc-950 overflow-hidden"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 border-b text-[9px] font-black uppercase text-zinc-500">
                            {filteredEndorsementColonies.length} {filteredEndorsementColonies.length === 1 ? 'colonia disponible' : 'colonias disponibles'}
                          </div>
                          <ul className="max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredEndorsementColonies.map((col, idx) => (
                              <li
                                key={idx}
                                className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between transition-colors text-xs font-bold uppercase text-zinc-800 dark:text-zinc-200"
                                onClick={() => {
                                  form.setValue('endorsementNeighborhood', col);
                                  setShowEndorsementColonies(false);
                                }}
                              >
                                <span>{col}</span>
                                {form.getValues('endorsementNeighborhood')?.trim().toUpperCase() === col && (
                                  <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                )}
                              </li>
                            ))}
                          </ul>
                        </Card>
                      )}
                    </div>
                  </div>

                  {/* 5.- CIUDAD O LOCALIDAD y 6.- TELEFONO */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FormField
                        control={form.control}
                        name="endorsementCity"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Ciudad o Localidad</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Tepic" 
                                {...field} 
                                value={field.value || ''} 
                                onKeyDown={(e) => handleFieldEnter(e, 'endorsementPhone')}
                                className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div>
                      <FormField
                        control={form.control}
                        name="endorsementPhone"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Teléfono</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="311 000 0000" 
                                {...field} 
                                value={formatPhoneNumber(field.value || '')} 
                                onChange={(e) => {
                                  const formatted = formatPhoneNumber(e.target.value);
                                  field.onChange(formatted);
                                }}
                                maxLength={12}
                                inputMode="numeric"
                                onKeyDown={(e) => handleFieldEnter(e, 'endorsementGuarantee')}
                                className="h-9 text-xs font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal font-mono" 
                              />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* 7.- GARANTIAS del aval */}
                  <FormField
                    control={form.control}
                    name="endorsementGuarantee"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Garantías del Aval</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe las garantías del aval..." 
                            {...field} 
                            value={field.value || ''} 
                            onKeyDown={(e) => handleGuaranteeKeyDown(e, 'endorsementGuarantee')}
                            onFocus={handleGuaranteeFocus}
                            className="uppercase font-bold min-h-[96px] text-xs py-1.5 placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" 
                          />
                        </FormControl>
                        <FormMessage className="text-[9px]" />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-row items-center justify-between w-full pt-2">
                {step === 1 && (
                     <>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={handleFinishCapture}
                          className="border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-950/40 font-black uppercase h-11 px-5 flex items-center gap-1.5 shadow-sm"
                        >
                          <X className="h-4 w-4 text-red-500" />
                          Terminar
                        </Button>
                        <Button 
                          type="button" 
                          onClick={handleNextStep} 
                          className="font-black uppercase h-11 px-8"
                        >
                          Siguiente Paso
                        </Button>
                     </>
                )}
                {step === 2 && (
                     <div className="flex justify-between items-center w-full">
                        <Button type="button" variant="outline" onClick={() => setStep(1)} className="font-black uppercase h-11">Atrás</Button>
                        <Button type="submit" disabled={isSubmitting} className="font-black uppercase h-11 px-8">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar y Crear Crédito
                        </Button>
                     </div>
                )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={showIncompleteModal} onOpenChange={setShowIncompleteModal}>
        <AlertDialogContent className="rounded-2xl max-w-sm p-6 text-center shadow-2xl border bg-white dark:bg-zinc-950 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-6 w-6" />
            </div>

            <div className="space-y-1.5">
                <AlertDialogTitle className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight text-center">
                    Información Incompleta
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                    <div className="text-xs text-muted-foreground leading-relaxed text-center">
                        <p>No se capturó toda la información completa del crédito.</p>
                        {missingFields.length > 0 && (
                          <p className="mt-1 font-semibold text-amber-700 dark:text-amber-400">
                            Pendiente: {missingFields.slice(0, 4).join(', ')}{missingFields.length > 4 ? ` y ${missingFields.length - 4} más` : ''}.
                          </p>
                        )}
                        <p className="mt-2 text-slate-700 dark:text-zinc-300 font-medium">¿Deseas continuar y registrar el crédito?</p>
                    </div>
                </AlertDialogDescription>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
                <Button 
                  variant="outline" 
                  onClick={() => setShowIncompleteModal(false)}
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold"
                >
                    Volver
                </Button>
                <Button 
                  onClick={async (e) => {
                    e.preventDefault();
                    if (formValues && !isSubmitting) {
                      setShowIncompleteModal(false);
                      await proceedWithSubmission(formValues);
                    }
                  }} 
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Sí, registrar'
                    )}
                </Button>
            </div>
        </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
                <AlertDialogTitle className="font-black uppercase tracking-tight text-red-600 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" /> ¿Salir sin guardar el crédito?
                </AlertDialogTitle>
                <AlertDialogDescription className="font-bold text-xs">
                    Tienes datos capturados en el formulario. Si sales ahora, se perderá la información del préstamo que estás registrando.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="rounded-lg font-bold">
                    Continuar Capturando
                </AlertDialogCancel>
                <AlertDialogAction 
                    onClick={handleConfirmExit} 
                    className="rounded-lg font-black uppercase bg-red-600 hover:bg-red-700 text-white"
                >
                    Sí, Descartar y Salir
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={showGuarantorLimitAlert} onOpenChange={setShowGuarantorLimitAlert}>
        <AlertDialogContent className="rounded-xl max-w-md">
            <AlertDialogHeader>
                <AlertDialogTitle className="font-black text-red-600 uppercase tracking-tight flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" /> Límite de Aval Excedido
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                    <div className="font-bold text-xs text-slate-700 space-y-4">
                        <p className="text-sm">
                            Este aval ya respalda a <strong>({blockedGuarantorDetails.length})</strong> clientes:
                        </p>
                        <div className="space-y-3 bg-red-50/50 dark:bg-red-950/10 p-4 rounded-xl border border-red-100 max-h-[250px] overflow-y-auto">
                            {blockedGuarantorDetails.map((b, i) => (
                                <div key={i} className="text-xs uppercase border-b border-red-100/50 pb-2 last:border-0 last:pb-0">
                                    <span className="font-extrabold text-red-950 dark:text-red-300 block">{i + 1}.- {b.clientName}</span>
                                    <span className="text-[10px] text-muted-foreground font-black block">
                                        PLAZA: {b.plaza} | LOCALIDAD: {b.localidad} | PROMOTORA: {b.promotora}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="border-t pt-4 gap-2 flex justify-end">
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                        setShowGuarantorLimitAlert(false);
                    }} 
                    className="rounded-lg font-bold"
                >
                    Cancelar
                </Button>
                <Button 
                    type="button" 
                    onClick={handleAuthorize} 
                    className="rounded-lg font-bold bg-blue-600 hover:bg-blue-700 text-white"
                >
                    Autorizar
                </Button>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={showAuthCodeModal} onOpenChange={setShowAuthCodeModal}>
        <AlertDialogContent className="rounded-xl max-w-sm">
            <AlertDialogHeader>
                <AlertDialogTitle className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                    Código de Autorización
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                    <div className="space-y-4 pt-2">
                        <Input 
                            type="password"
                            maxLength={6}
                            placeholder="******"
                            value={authCodeInput}
                            onChange={(e) => {
                                setAuthCodeInput(e.target.value);
                                setAuthCodeError(false);
                            }}
                            className={`h-11 text-center font-black tracking-widest text-lg bg-white dark:bg-zinc-950 ${authCodeError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            autoFocus
                        />
                        {authCodeError && (
                            <p className="text-[10px] text-red-500 font-bold text-center">Clave incorrecta. Por favor verifique.</p>
                        )}
                    </div>
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 flex justify-end">
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                        setShowAuthCodeModal(false);
                        setAuthCodeInput('');
                        setAuthCodeError(false);
                    }} 
                    className="rounded-lg font-bold"
                >
                    Cancelar
                </Button>
                <Button 
                    type="button" 
                    onClick={handleConfirmAuthorization} 
                    className="rounded-lg font-bold bg-blue-600 hover:bg-blue-700 text-white"
                >
                    Confirmar
                </Button>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
