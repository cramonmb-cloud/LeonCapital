'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { PlusCircle, Loader2, AlertTriangle, BadgeDollarSign, Calendar, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createLoanAction, payOffLoanAction } from '@/app/dashboard/actions';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { IdScanner } from './id-scanner';
import type { IdDataOutput } from '@/ai/flows/extract-id-data-flow';
import { useAuth } from '@/hooks/use-auth';
import { useRealtimeData } from '@/hooks/use-realtime-data';

const stepOneSchema = z.object({
  promotoraId: z.string().min(1, 'Debes seleccionar una promotora.'),
  loanPlanId: z.string().min(1, 'Debes seleccionar un tipo de préstamo.'),
  amount: z.coerce.number().min(1, 'El monto del préstamo debe ser mayor a 0.'),
  clientName: z.string().min(3, 'El nombre del cliente debe tener al menos 3 caracteres.'),
});

const stepTwoSchema = z.object({
  phone: z.string().optional(),
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
  endorsementPhone: z.string().optional(),
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
  const [step, setStep] = useState(1);
  const [matchingClients, setMatchingClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeLoanDetails, setActiveLoanDetails] = useState<ActiveLoanDetails | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayingOff, setIsPayingOff] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState<LoanFormValues | null>(null);
  
  const [selectedPlaza, setSelectedPlaza] = useState(initialSelection?.plazaId || '');
  const [selectedLocalidad, setSelectedLocalidad] = useState(initialSelection?.localidadId || '');

  const { toast } = useToast();
  const router = useRouter();
  const { appUser } = useAuth();
  const { data: realtimeData } = useRealtimeData(undefined, {
    enabledCollections: ['config']
  });
  const maxGuarantorClients = realtimeData?.config?.maxGuarantorClients || 0;

  const [showGuarantorLimitAlert, setShowGuarantorLimitAlert] = useState(false);
  const [matchingGuarantors, setMatchingGuarantors] = useState<GuarantorSuggestion[]>([]);
  const [blockedGuarantorDetails, setBlockedGuarantorDetails] = useState<{ clientName: string; plaza: string; localidad: string; promotora: string }[]>([]);
  const [showAuthCodeModal, setShowAuthCodeModal] = useState(false);
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [authCodeError, setAuthCodeError] = useState(false);


  const form = useForm<LoanFormValues>({
    resolver: zodResolver(step === 1 ? stepOneSchema : formSchema),
    defaultValues: {
      promotoraId: initialSelection?.promotoraId || '',
      loanPlanId: '',
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

  const sortedPlazas = useMemo(() => [...plazas].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [plazas]);
  const filteredLocalidades = useMemo(() => localidades.filter(l => l.plazaId === selectedPlaza).sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [localidades, selectedPlaza]);
  const filteredPromotoras = useMemo(() => promotoras.filter(p => p.localidadId === selectedLocalidad).sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [promotoras, selectedLocalidad]);
  const sortedLoanPlans = useMemo(() => [...loanPlans].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')), [loanPlans]);

  const watchLoanPlanId = form.watch('loanPlanId');
  const watchAmount = form.watch('amount');
  const watchPromotoraId = form.watch('promotoraId');

  const calculatedAbono = useMemo(() => {
    if (!watchLoanPlanId || !watchAmount) return 0;
    const plan = loanPlans.find(p => p.id === watchLoanPlanId);
    if (!plan) return 0;
    return (Number(watchAmount) / 1000) * plan.weeklyPaymentRate;
  }, [watchLoanPlanId, watchAmount, loanPlans]);

  const currentHierarchy = useMemo(() => {
    const currentPromotoraId = watchPromotoraId || initialSelection?.promotoraId;
    const promotora = promotoras.find(p => p.id === currentPromotoraId);
    const localidad = localidades.find(l => l.id === promotora?.localidadId);
    const plaza = plazas.find(p => p.id === localidad?.plazaId);
    return {
      promotoraName: promotora?.name || 'N/A',
      localidadName: localidad?.name || 'N/A',
      plazaName: plaza?.name || 'N/A',
    };
  }, [watchPromotoraId, initialSelection, promotoras, localidades, plazas]);

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

  useEffect(() => {
    if (open) {
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
        loanPlanId: '',
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
    } else {
      form.reset({
        promotoraId: '',
        loanPlanId: '',
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
      setStep(1);
      setMatchingClients([]);
      setMatchingGuarantors([]);
      setShowAuthCodeModal(false);
      setAuthCodeInput('');
      setAuthCodeError(false);
      setSelectedClient(null);
      setActiveLoanDetails(null);
      setSelectedPlaza('');
      setSelectedLocalidad('');
    }
  }, [initialSelection, open, form]);


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
            const today = new Date();
            const loanStartDate = new Date(activeLoan.startDate);
            const timeDiff = today.getTime() - loanStartDate.getTime();
            const rawCurrentLoanWeek = Math.max(1, Math.floor(timeDiff / (1000 * 3600 * 24 * 7)) + 1);

            const baseTerm = loanPlan.termInWeeks;
            let missedWeeksCount = 0;
            for (let i = 1; i < rawCurrentLoanWeek - 1; i++) {
                const p = activeLoan.payments.find(p => p.weekNumber === i);
                if (p && p.amount < weeklyPayment) missedWeeksCount++;
            }

            const hasPenalty = missedWeeksCount >= 2;
            const termInWeeks = baseTerm + (hasPenalty ? 1 : 0);
            
            let effectivePaidBase = 0;
            for (let i = 1; i <= baseTerm; i++) {
                const p = activeLoan.payments.find(pay => pay.weekNumber === i);
                if (p) {
                    effectivePaidBase += p.amount;
                } else if (i < rawCurrentLoanWeek - 1) {
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
            const futureWeeksCount = Math.max(0, termInWeeks - rawCurrentLoanWeek + 1);
            
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
    
    // Parse combined endorsement string: "NAME (STREET, NEIGHBORHOOD, CP, CITY, Tel: PHONE, Garantía: GUARANTEE)"
    const endorsementMatch = client.endorsement.match(/(.*) \((.*)\)/);
    if (endorsementMatch) {
        const name = endorsementMatch[1].trim();
        const detailsStr = endorsementMatch[2];
        const details = detailsStr.split(',').map(s => s.trim());
        
        form.setValue('endorsement', name);
        
        // Extract phone
        const phoneIndex = details.findIndex(d => d.toUpperCase().startsWith('TEL:'));
        if (phoneIndex !== -1) {
            const phone = details[phoneIndex].replace(/Tel:\s*/i, '');
            form.setValue('endorsementPhone', phone);
            details.splice(phoneIndex, 1);
        } else {
            form.setValue('endorsementPhone', '');
        }

        // Extract guarantee
        const guaranteeIndex = details.findIndex(d => d.toUpperCase().startsWith('GARANTÍA:') || d.toUpperCase().startsWith('GARANTIA:'));
        if (guaranteeIndex !== -1) {
            const guarantee = details[guaranteeIndex].replace(/Garantía:\s*|Garantia:\s*/i, '');
            form.setValue('endorsementGuarantee', guarantee || '1.- \n2.- \n3.- \n4.- ');
            details.splice(guaranteeIndex, 1);
        } else {
            form.setValue('endorsementGuarantee', '1.- \n2.- \n3.- \n4.- ');
        }

        // Remaining parts are usually Street, Neighborhood, CP, City in order
        if (details[0]) form.setValue('endorsementStreet', details[0]);
        if (details[1]) form.setValue('endorsementNeighborhood', details[1]);
        if (details[2]) form.setValue('endorsementPostalCode', details[2]);
        if (details[3]) form.setValue('endorsementCity', details[3]);
    } else {
        form.setValue('endorsement', client.endorsement);
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
      if (client.endorsement) {
        const match = client.endorsement.match(/(.*) \((.*)\)/);
        const guarantorName = match ? match[1].trim().toUpperCase() : client.endorsement.trim().toUpperCase();
        
        if (guarantorName && !guarantorMap.has(guarantorName)) {
          if (match) {
            const detailsStr = match[2];
            const details = detailsStr.split(',').map(s => s.trim());
            
            // Extract phone
            const phoneIndex = details.findIndex(d => d.toUpperCase().startsWith('TEL:'));
            let phone = '';
            if (phoneIndex !== -1) {
              phone = details[phoneIndex].replace(/Tel:\s*/i, '');
              details.splice(phoneIndex, 1);
            }
            
            // Extract guarantee
            const guaranteeIndex = details.findIndex(d => d.toUpperCase().startsWith('GARANTÍA:') || d.toUpperCase().startsWith('GARANTIA:'));
            let guarantee = '';
            if (guaranteeIndex !== -1) {
              guarantee = details[guaranteeIndex].replace(/Garantía:\s*|Garantia:\s*/i, '');
              details.splice(guaranteeIndex, 1);
            }
            
            guarantorMap.set(guarantorName, {
              name: guarantorName,
              street: details[0] || '',
              neighborhood: details[1] || '',
              postalCode: details[2] || '',
              city: details[3] || '',
              phone,
              guarantee
            });
          } else {
            guarantorMap.set(guarantorName, {
              name: guarantorName,
              street: '',
              neighborhood: '',
              postalCode: '',
              city: '',
              phone: '',
              guarantee: ''
            });
          }
        }
      }
    });
    
    return Array.from(guarantorMap.values());
  }, [clients]);

  const handleGuarantorNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value.toUpperCase();
    form.setValue('endorsement', name);
    
    if (name.length >= 2) {
      const matches = registeredGuarantors.filter(g => 
        g.name.includes(name)
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
        const match = client.endorsement.match(/(.*) \((.*)\)/);
        const guarantorName = match ? match[1].trim().toUpperCase() : client.endorsement.trim().toUpperCase();
        if (guarantorName === searchName) {
          if (match) {
            const detailsStr = match[2];
            const details = detailsStr.split(',').map(s => s.trim());
            
            // Extract phone
            const phoneIndex = details.findIndex(d => d.toUpperCase().startsWith('TEL:'));
            let phone = '';
            if (phoneIndex !== -1) {
              phone = details[phoneIndex].replace(/Tel:\s*/i, '');
              details.splice(phoneIndex, 1);
            }
            
            // Extract guarantee
            const guaranteeIndex = details.findIndex(d => d.toUpperCase().startsWith('GARANTÍA:') || d.toUpperCase().startsWith('GARANTIA:'));
            let guarantee = '';
            if (guaranteeIndex !== -1) {
              guarantee = details[guaranteeIndex].replace(/Garantía:\s*|Garantia:\s*/i, '');
              details.splice(guaranteeIndex, 1);
            }
            
            return {
              name: guarantorName,
              street: details[0] || '',
              neighborhood: details[1] || '',
              postalCode: details[2] || '',
              city: details[3] || '',
              phone,
              guarantee
            };
          } else {
            return {
              name: guarantorName,
              street: '',
              neighborhood: '',
              postalCode: '',
              city: '',
              phone: '',
              guarantee: ''
            };
          }
        }
      }
    }
    return null;
  };

  // Find all active/overdue clients backed by this guarantor name
  const getGuarantorActiveBacking = (guarantorNameInput: string) => {
    if (!guarantorNameInput || guarantorNameInput.trim().length < 3) return [];
    
    const searchName = guarantorNameInput.trim().toUpperCase();
    const activeBackings: { clientName: string; plaza: string; localidad: string; promotora: string }[] = [];
    
    clients.forEach(client => {
      if (selectedClient && client.id === selectedClient.id) return;
      
      if (client.endorsement) {
        const match = client.endorsement.match(/(.*) \((.*)\)/);
        const name = match ? match[1].trim().toUpperCase() : client.endorsement.trim().toUpperCase();
        
        if (name === searchName) {
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
        if(activeLoanDetails) {
            toast({
                variant: 'destructive',
                title: 'Cliente con préstamo activo',
                description: 'Este cliente ya tiene un préstamo activo o vencido. Debe liquidarlo antes de solicitar uno nuevo.',
            });
            return;
        }
        setStep(2);
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
                toast({
                    title: 'Préstamo Creado',
                    description: `El préstamo para ${values.clientName} ha sido creado exitosamente.`,
                });
                setOpen(false);
            } else {
                throw new Error(result.message || 'Error desconocido');
            }

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'Hubo un error al crear el préstamo. Por favor, inténtelo de nuevo.',
            });
        } finally {
            setIsSubmitting(false);
            setShowConfirmation(false);
            setFormValues(null);
        }
    };


  const onSubmit = async (values: LoanFormValues) => {
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

    const cleanedGuarantee = cleanGuaranteeValue(values.guarantee);
    const cleanedEndorsementGuarantee = cleanGuaranteeValue(values.endorsementGuarantee);

    const step2Fields = [
        values.phone, values.street, values.neighborhood, values.postalCode,
        values.city, cleanedGuarantee, values.endorsement, values.endorsementStreet,
        values.endorsementNeighborhood, values.endorsementPostalCode,
        values.endorsementCity, values.endorsementPhone, cleanedEndorsementGuarantee
    ];

    const areStep2FieldsEmpty = step2Fields.every(field => !field || field.trim() === '');

    if (areStep2FieldsEmpty) {
        setFormValues(values);
        setShowConfirmation(true);
    } else {
        await proceedWithSubmission(values);
    }
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
        if (data.postalCode) form.setValue('postalCode', data.postalCode.toUpperCase());
        if (data.city) form.setValue('city', data.city.toUpperCase());

        setSelectedClient(null);
        setActiveLoanDetails(null);
    };

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!initialSelection?.promotoraId}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Préstamo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[850px] max-h-[95vh] overflow-y-auto p-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <DialogHeader className="space-y-0.5 pb-2 border-b">
              <DialogTitle className="uppercase font-black tracking-tight text-lg">Crear Nuevo Préstamo - Paso {step} de 2</DialogTitle>
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
                            <Input placeholder="Busca o registra un cliente" {...field} onChange={handleClientNameChange} autoComplete="off" className="uppercase h-10 font-bold flex-grow text-sm placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
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
                            <Card className="mt-4 bg-red-50 border-2 border-red-200 animate-in fade-in zoom-in-95 duration-300">
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        <AlertTriangle className="h-8 w-8 text-red-600 flex-shrink-0 mt-1" />
                                        <div className="flex-grow space-y-3">
                                            <div>
                                                <h3 className="font-black text-red-700 uppercase text-sm tracking-tight">¡Atención! Cliente con Préstamo Activo</h3>
                                                <p className="text-[10px] font-bold text-red-600 uppercase">
                                                    No se puede crear un nuevo crédito mientras el actual no esté liquidado.
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/60 p-3 rounded-lg border border-red-100 shadow-inner">
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                                                        <span>Plan:</span>
                                                        <span className="text-zinc-800">{activeLoanDetails.planName}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                                                        <span>Monto Orig:</span>
                                                        <span className="text-zinc-800">{formatCurrency(activeLoanDetails.loan.amount)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                                                        <span>Semanas Pend:</span>
                                                        <span className="text-zinc-800">{activeLoanDetails.weeksRemaining}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center pt-1 border-t border-red-100">
                                                        <span className="text-[10px] font-black text-red-700 uppercase">Saldo Liquidar:</span>
                                                        <span className="text-sm font-black text-red-700">{formatCurrency(activeLoanDetails.settlementAmount)}</span>
                                                    </div>
                                                </div>
                                                <div className='border-l border-red-100 pl-4 space-y-1'>
                                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-zinc-500">
                                                    <PlusCircle className="h-3 w-3 text-red-400" /> Plaza: <span className="text-zinc-800">{activeLoanDetails.hierarchy.plazaName}</span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-zinc-500">
                                                    <PlusCircle className="h-3 w-3 text-red-400" /> Localidad: <span className="text-zinc-800">{activeLoanDetails.hierarchy.localidadName}</span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-zinc-500">
                                                    <PlusCircle className="h-3 w-3 text-red-400" /> Promotora: <span className="text-zinc-800">{activeLoanDetails.hierarchy.promotoraName}</span>
                                                  </div>
                                                </div>
                                            </div>

                                             <Button 
                                                 type="button" 
                                                 variant="destructive" 
                                                 size="sm" 
                                                 className="w-full h-10 font-black uppercase text-xs shadow-lg"
                                                 onClick={handlePayOffLoan}
                                                 disabled={isPayingOff}
                                             >
                                                 {isPayingOff ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeDollarSign className="mr-2 h-4 w-4" />}
                                                 {isPayingOff ? 'Liquidando...' : 'Liquidar Préstamo Ahora'}
                                             </Button>
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
                          <Input type="number" placeholder="Ej: 1000" {...field} className="h-10 font-bold text-sm placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
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
              </div>
            )}
            
            {step === 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-1">
                {/* Column 1: Datos del Cliente */}
                <div className="space-y-3 p-4 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/80 shadow-md rounded-xl">
                  <h3 className="text-xs font-black uppercase tracking-widest text-blue-900 dark:text-blue-300 border-b pb-1">Datos del Cliente</h3>
                  
                  {/* 1.- CALLE Y NUMERO */}
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Calle y Número</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Av. Principal 123" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                        </FormControl>
                        <FormMessage className="text-[9px]" />
                      </FormItem>
                    )}
                  />

                  {/* 2.- COLONIA y 3.- C.P. */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name="neighborhood"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Colonia</FormLabel>
                            <FormControl>
                              <Input placeholder="Centro" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">C.P.</FormLabel>
                            <FormControl>
                              <Input placeholder="63000" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* 4.- CIUDAD O LOCALIDAD y 5.- TELEFONO */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Ciudad o Localidad</FormLabel>
                            <FormControl>
                              <Input placeholder="Tepic" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Teléfono</FormLabel>
                            <FormControl>
                              <Input placeholder="Ej: 311-000-000" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
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
                          <Card className="absolute left-0 right-0 z-50 mt-1 shadow-2xl border-2 dark:bg-zinc-950">
                              <ul className="max-h-60 overflow-y-auto divide-y">
                                  {matchingGuarantors.map((guarantor, idx) => (
                                      <li key={idx}
                                          className="px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between transition-colors"
                                          onClick={() => selectGuarantor(guarantor)}>
                                          <div className="flex flex-col">
                                              <span className="font-black text-xs uppercase text-blue-900 dark:text-blue-300">{guarantor.name}</span>
                                              {guarantor.street && (
                                                 <span className="text-[9px] font-bold text-muted-foreground uppercase">{guarantor.street}, {guarantor.neighborhood}</span>
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
                          <Input placeholder="Domicilio del aval" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                        </FormControl>
                        <FormMessage className="text-[9px]" />
                      </FormItem>
                    )}
                  />

                  {/* 3.- COLONIA y 4.- C.P. */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name="endorsementNeighborhood"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Colonia</FormLabel>
                            <FormControl>
                              <Input placeholder="Centro" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name="endorsementPostalCode"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">C.P.</FormLabel>
                            <FormControl>
                              <Input placeholder="63000" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* 5.- CIUDAD O LOCALIDAD y 6.- TELEFONO */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name="endorsementCity"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Ciudad o Localidad</FormLabel>
                            <FormControl>
                              <Input placeholder="Tepic" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
                            </FormControl>
                            <FormMessage className="text-[9px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name="endorsementPhone"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[9px] font-black uppercase text-muted-foreground">Teléfono</FormLabel>
                            <FormControl>
                              <Input placeholder="Ej: 311-000-00" {...field} value={field.value || ''} className="h-9 text-xs uppercase font-bold placeholder:text-zinc-400 placeholder:normal-case placeholder:font-normal" />
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

            <DialogFooter className="gap-2 sm:gap-0">
                {step === 1 && (
                     <Button type="button" onClick={handleNextStep} disabled={!!activeLoanDetails} className="w-full sm:w-auto font-black uppercase h-11 px-8">Siguiente Paso</Button>
                )}
                {step === 2 && (
                     <>
                        <Button type="button" variant="outline" onClick={() => setStep(1)} className="font-black uppercase h-11">Atrás</Button>
                        <Button type="submit" disabled={isSubmitting} className="font-black uppercase h-11 px-8">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar y Crear Crédito
                        </Button>
                     </>
                )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
                <AlertDialogTitle className="font-black uppercase tracking-tight">¿Continuar con datos incompletos?</AlertDialogTitle>
                <AlertDialogDescription className="font-bold text-xs">
                    No se han registrado todos los datos del cliente o del aval (dirección, teléfono, garantías). ¿Deseas crear el préstamo de todos modos con la información actual?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setFormValues(null)} className="rounded-lg font-bold">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => { if (formValues) proceedWithSubmission(formValues); }} className="rounded-lg font-bold bg-blue-600">
                    Sí, Crear Préstamo
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
