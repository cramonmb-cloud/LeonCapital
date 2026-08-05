'use server';

import type { Client, Loan, LoanPlan, AppUser, Payment } from '@/lib/types';
import { collection, doc, addDoc, serverTimestamp, updateDoc, runTransaction, increment, writeBatch, getDoc, getDocs, query, where, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { revalidatePath } from 'next/cache';
import { getLoanPlan, getClient, getLoan } from '@/lib/firestore-data';
import { getSaturdayOfWeek, getMexicoNow } from '@/lib/utils';

// Helper to handle Firestore dates consistently in server actions
const parseFirestoreDate = (date: any): Date => {
    if (!date) return new Date();
    if (date instanceof Timestamp) return date.toDate();
    if (typeof date === 'string') return new Date(date);
    if (date instanceof Date) return date;
    return new Date();
};

export type CreateLoanInput = {
    promotoraId: string;
    loanPlanId: string;
    amount: number;
    client: Omit<Client, 'id' | 'avatarUrl'> & { id?: string };
};

export async function createLoanAction(input: CreateLoanInput) {
    try {
        const mexicoNow = getMexicoNow();
        const saturday = getSaturdayOfWeek(mexicoNow);

        let clientId = input.client.id;

        if (!clientId) {
            const clientNameNormalized = input.client.name.trim().toUpperCase();
            const clientsRef = collection(db, 'clients');
            
            // Search for client with same name (exact matching uppercase)
            const q = query(clientsRef, where('name', '==', clientNameNormalized));
            const querySnapshot = await getDocs(q);
            
            let matchedClientDoc = null;
            if (!querySnapshot.empty) {
                matchedClientDoc = querySnapshot.docs[0];
            } else {
                // Robust check for trailing/leading space differences in the database
                const allClientsSnap = await getDocs(clientsRef);
                const matchedDoc = allClientsSnap.docs.find(doc => {
                    const dbName = (doc.data().name || '').trim().toUpperCase();
                    return dbName === clientNameNormalized;
                });
                if (matchedDoc) {
                    matchedClientDoc = matchedDoc;
                }
            }

            if (matchedClientDoc) {
                clientId = matchedClientDoc.id;
                // Synchronize the existing client information
                const clientRef = doc(db, 'clients', clientId);
                const { id, ...updateData } = input.client;
                await updateDoc(clientRef, {
                    ...updateData,
                    name: clientNameNormalized
                });
            } else {
                const newClientData = {
                    ...input.client,
                    name: clientNameNormalized,
                    avatarUrl: `https://picsum.photos/seed/${Math.random()}/40/40`
                };
                const docRef = await addDoc(collection(db, 'clients'), newClientData);
                clientId = docRef.id;
            }
        } else {
            // Sincronizar la información del cliente
            const clientRef = doc(db, 'clients', clientId);
            const { id, ...updateData } = input.client;
            await updateDoc(clientRef, updateData);
        }

        // Check if the client already has an active or overdue loan
        const loansQuery = query(
            collection(db, 'loans'),
            where('clientId', '==', clientId),
            where('status', 'in', ['Active', 'Overdue'])
        );
        const activeLoansSnap = await getDocs(loansQuery);
        if (!activeLoansSnap.empty) {
            return { success: false, message: 'El cliente ya tiene un préstamo activo o vencido en el sistema.' };
        }

        // Sincronizar datos del aval con otros clientes que compartan el mismo aval
        if (input.client.endorsement) {
            const newEndorsement = input.client.endorsement;
            const newEndorsementMatch = newEndorsement.match(/(.*) \((.*)\)/);
            const newEndorsementName = newEndorsementMatch ? newEndorsementMatch[1].trim().toUpperCase() : newEndorsement.trim().toUpperCase();
            
            if (newEndorsementName) {
                const clientsSnap = await getDocs(collection(db, 'clients'));
                const batch = writeBatch(db);
                let hasUpdates = false;
                
                clientsSnap.docs.forEach(clientDoc => {
                    if (clientDoc.id === clientId) return;
                    
                    const clientData = clientDoc.data();
                    const existingEndorsement = clientData.endorsement;
                    if (existingEndorsement) {
                        const existingMatch = existingEndorsement.match(/(.*) \((.*)\)/);
                        const existingName = existingMatch ? existingMatch[1].trim().toUpperCase() : existingEndorsement.trim().toUpperCase();
                        
                        if (existingName === newEndorsementName && existingEndorsement !== newEndorsement) {
                            batch.update(clientDoc.ref, { endorsement: newEndorsement });
                            hasUpdates = true;
                        }
                    }
                });
                
                if (hasUpdates) {
                    await batch.commit();
                }
            }
        }

        const newLoan = {
            clientId: clientId,
            promotoraId: input.promotoraId,
            loanPlanId: input.loanPlanId,
            amount: input.amount,
            startDate: saturday.toISOString(),
            status: 'Active' as const,
            payments: [],
        };
        
        await addDoc(collection(db, 'loans'), newLoan);

        revalidatePath('/dashboard/prestamos');
        revalidatePath('/dashboard/clientes');
        if (clientId) {
            revalidatePath(`/dashboard/clientes/${clientId}`);
        }
        
        return { success: true, message: 'Préstamo creado con éxito.' };
    } catch (error: any) {
        console.error('Error creating loan:', error);
        return { success: false, message: `Error al crear el préstamo: ${error.message}` };
    }
}

export async function updateLoanAction(loanId: string, data: { loanPlanId: string; amount: number; startDate: string; promotoraId: string; status?: Loan['status'] }) {
    try {
        const loanRef = doc(db, 'loans', loanId);
        await updateDoc(loanRef, {
            loanPlanId: data.loanPlanId,
            amount: data.amount,
            startDate: new Date(data.startDate),
            promotoraId: data.promotoraId,
            status: data.status
        });

        revalidatePath('/dashboard/prestamos');
        revalidatePath('/dashboard/clientes');
        return { success: true, message: 'Préstamo actualizado con éxito.' };
    } catch (error: any) {
        console.error('Error updating loan:', error);
        return { success: false, message: `Error al actualizar el préstamo: ${error.message}` };
    }
}

export async function deleteLoanAction(loanId: string) {
    try {
        await runTransaction(db, async (transaction) => {
            const loanRef = doc(db, 'loans', loanId);
            const loanSnap = await transaction.get(loanRef);

            if (!loanSnap.exists()) {
                throw new Error('Préstamo no encontrado');
            }

            const loan = loanSnap.data() as Loan;
            const totalPaid = (loan.payments || []).reduce((acc, p) => acc + p.amount, 0);

            if (totalPaid > 0) {
                const walletRef = doc(db, 'wallet', 'main');
                transaction.update(walletRef, { balance: increment(-totalPaid) });
            }

            transaction.delete(loanRef);
        });

        revalidatePath('/dashboard/prestamos');
        revalidatePath('/dashboard/bitacora');
        revalidatePath('/dashboard/clientes');

        return { success: true, message: 'Préstamo eliminado y saldo de cartera ajustado correctamente.' };
    } catch (error: any) {
        console.error('Error deleting loan:', error);
        return { success: false, message: `Error al eliminar el préstamo: ${error.message}` };
    }
}

export async function changeLoansDateAction(loanIds: string[], targetDateIso: string) {
    try {
        const batch = writeBatch(db);
        const targetDate = new Date(targetDateIso);
        
        loanIds.forEach(id => {
            const ref = doc(db, 'loans', id);
            batch.update(ref, { startDate: targetDate });
        });

        await batch.commit();
        revalidatePath('/dashboard/prestamos');
        return { success: true, message: `Se actualizó la fecha de inicio de ${loanIds.length} préstamos correctamente.` };
    } catch (error: any) {
        console.error('Error changing loans dates:', error);
        return { success: false, message: `Error al cambiar las fechas: ${error.message}` };
    }
}


export async function registerPaymentAction(loanId: string, paymentStartDate: Date, amountPaid: number, startingWeekNumber: number, userId?: string) {
    try {
        await runTransaction(db, async (transaction) => {
            const loanRef = doc(db, 'loans', loanId);
            const loanSnap = await transaction.get(loanRef);

            if (!loanSnap.exists()) {
                throw new Error('Préstamo no encontrado');
            }

            const loan = loanSnap.data() as Loan;
            const client = await getClient(loan.clientId);
            const loanPlan = await getLoanPlan(loan.loanPlanId);
            const walletRef = doc(db, 'wallet', 'main');

            if (!loanPlan) {
                throw new Error('Plan de préstamo no encontrado');
            }
            
            const weeklyPayment = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
            const currentPayments = (loan.payments || []).map(p => ({
                ...p,
                date: parseFirestoreDate(p.date).toISOString()
            }));

            // Reemplazar o añadir el pago con distribución o procesar eliminación
            let allPayments: Payment[] = [];

            if (amountPaid < 0) {
                // Modo eliminación: marcar como revertido/eliminado
                allPayments = [
                    ...currentPayments.filter(p => p.weekNumber !== startingWeekNumber),
                    {
                        date: new Date().toISOString(),
                        amount: 0,
                        weekNumber: startingWeekNumber,
                        isReverted: true
                    }
                ];
            } else {
                // Modo registro/ajuste: lógica existente de distribución
                const missedWeeks: { weekNumber: number; paidSoFar: number }[] = [];
                for (let i = 1; i < startingWeekNumber; i++) {
                    const existing = currentPayments.find(p => p.weekNumber === i);
                    const paidSoFar = existing ? existing.amount : 0;
                    if (paidSoFar < weeklyPayment) {
                        missedWeeks.push({ weekNumber: i, paidSoFar });
                    }
                }

                let remaining = amountPaid;
                const updatedPaymentsMap = new Map<number, { amount: number; isRecovered?: boolean; isReverted?: boolean }>();

                // Inicializar el mapa con los pagos existentes excluyendo la semana de inicio
                currentPayments.forEach(p => {
                    if (p.weekNumber !== startingWeekNumber) {
                        updatedPaymentsMap.set(p.weekNumber, { amount: p.amount, isRecovered: p.isRecovered, isReverted: p.isReverted });
                    }
                });

                // 1. Cubrir la semana en curso (startingWeekNumber)
                const neededStart = weeklyPayment;
                if (remaining <= neededStart) {
                    updatedPaymentsMap.set(startingWeekNumber, { amount: remaining, isRecovered: false });
                    remaining = 0;
                } else {
                    updatedPaymentsMap.set(startingWeekNumber, { amount: weeklyPayment, isRecovered: false });
                    remaining -= neededStart;

                    // 2. Cubrir semanas de fallo anteriores (la más antigua primero)
                    for (const mw of missedWeeks) {
                        if (remaining <= 0) break;
                        const needed = weeklyPayment - mw.paidSoFar;
                        if (remaining >= needed) {
                            updatedPaymentsMap.set(mw.weekNumber, { amount: weeklyPayment, isRecovered: true });
                            remaining -= needed;
                        } else {
                            updatedPaymentsMap.set(mw.weekNumber, { amount: mw.paidSoFar + remaining, isRecovered: true });
                            remaining = 0;
                        }
                    }

                    // 3. Adelantar saldo sobrante a semanas futuras
                    let nextWeek = startingWeekNumber + 1;
                    while (remaining > 0) {
                        const existingNext = updatedPaymentsMap.get(nextWeek)?.amount || 0;
                        const neededNext = Math.max(0, weeklyPayment - existingNext);
                        if (remaining >= neededNext) {
                            updatedPaymentsMap.set(nextWeek, { amount: weeklyPayment, isRecovered: false });
                            remaining -= neededNext;
                            nextWeek++;
                        } else {
                            updatedPaymentsMap.set(nextWeek, { amount: existingNext + remaining, isRecovered: false });
                            remaining = 0;
                        }
                    }
                }

                // Convertir el mapa de regreso al arreglo de pagos
                updatedPaymentsMap.forEach((val, wk) => {
                    const existingDate = currentPayments.find(p => p.weekNumber === wk)?.date || new Date().toISOString();
                    allPayments.push({
                        date: existingDate,
                        amount: val.amount,
                        weekNumber: wk,
                        isRecovered: val.isRecovered || false,
                        isReverted: val.isReverted || false
                    });
                });
            }
            
            const mexicoNow = getMexicoNow();
            const loanStartDate = parseFirestoreDate(loan.startDate);
            
            // Calculamos la diferencia de días basada en la fecha normalizada de México
            const diffTime = Math.abs(mexicoNow.getTime() - loanStartDate.getTime());
            const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const rawCurrentLoanWeek = Math.max(1, Math.floor((daysDiff - 1) / 7) + 1);

            const originalTotalPaid = (loan.payments || []).reduce((acc, p) => acc + p.amount, 0);
            const newTotalPaid = allPayments.reduce((acc, p) => acc + p.amount, 0);
            const walletAdjustment = newTotalPaid - originalTotalPaid;

            if (walletAdjustment !== 0) {
                const walletTransactionRef = doc(collection(db, 'walletTransactions'));
                transaction.set(walletTransactionRef, {
                    type: walletAdjustment > 0 ? 'credit' : 'debit',
                    amount: Math.abs(walletAdjustment),
                    date: new Date(),
                    description: amountPaid < 0 
                        ? `Reversión/Eliminación de abono de ${client?.name || 'N/A'} (Semana ${startingWeekNumber}).`
                        : `Abono/Ajuste de ${client?.name || 'N/A'} (Semana ${startingWeekNumber}).`,
                    loanId: loanId,
                    clientId: loan.clientId,
                    userId: userId || null,
                });
                
                transaction.update(walletRef, { balance: increment(walletAdjustment) });
            }

            const baseTerm = loanPlan.termInWeeks;
            
            // REGLA DINÁMICA DE CARTERA VENCIDA Y PENALIZACIÓN
            let missedCount = 0;
            let totalPaidInBaseTerm = 0;
            for (let i = 1; i <= baseTerm; i++) {
                const p = allPayments.find(pay => pay.weekNumber === i);
                if (p) {
                    totalPaidInBaseTerm += p.amount;
                    if (p.amount < weeklyPayment) missedCount++;
                } else if (i < rawCurrentLoanWeek - 1) {
                    missedCount++;
                }
            }

            const isExpired = rawCurrentLoanWeek > baseTerm + 1;
            const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
            
            const totalTerm = baseTerm + (hasPenalty ? 1 : 0);
            const totalExpected = totalTerm * weeklyPayment;
            const balance = Math.max(0, totalExpected - newTotalPaid);

            let newStatus: Loan['status'] = loan.status;
            if (balance <= 0) {
                newStatus = (isExpired || hasPenalty) ? 'Pagado desde CV' : 'Paid Off';
            } else {
                newStatus = (isExpired || rawCurrentLoanWeek > totalTerm + 1) ? 'Overdue' : 'Active';
            }

            transaction.update(loanRef, {
                payments: allPayments,
                status: newStatus
            });
        });

        revalidatePath('/dashboard', 'layout');
        
        return { success: true, message: amountPaid < 0 ? 'Pago eliminado con éxito.' : 'Pago registrado con éxito.' };

    } catch (error: any) {
        console.error('Error registering payment:', error);
        return { success: false, message: `Error al registrar el pago: ${error.message}` };
    }
}

export async function payOffLoanAction(loanId: string, userId?: string) {
    try {
        const result = await runTransaction(db, async (transaction) => {
            const loanRef = doc(db, "loans", loanId);
            const loanDoc = await transaction.get(loanRef);
            
            if (!loanDoc.exists()) {
                throw new Error("Préstamo no encontrado.");
            }

            const loan = loanDoc.data() as Loan;
            const client = await getClient(loan.clientId);
            const loanPlan = await getLoanPlan(loan.loanPlanId);
            
            if (!loanPlan) {
                throw new Error("Plan de préstamo no encontrado.");
            }

            const weeklyPayment = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
            const mexicoNow = getMexicoNow();
            const loanStartDate = parseFirestoreDate(loan.startDate);
            
            const diffTime = Math.abs(mexicoNow.getTime() - loanStartDate.getTime());
            const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const rawCurrentLoanWeek = Math.max(1, Math.floor((daysDiff - 1) / 7) + 1);
            
            const baseTerm = loanPlan.termInWeeks;
            const isExpired = rawCurrentLoanWeek > baseTerm + 1;

            const currentPayments = (loan.payments || []).map(p => ({
                ...p,
                date: parseFirestoreDate(p.date).toISOString()
            }));

            let missedCount = 0;
            let totalPaidInBaseTerm = 0;
            for (let i = 1; i <= baseTerm; i++) {
                const p = currentPayments.find(pay => pay.weekNumber === i);
                if (p) {
                    totalPaidInBaseTerm += p.amount;
                    if (p.amount < weeklyPayment) missedCount++;
                } else if (i < rawCurrentLoanWeek - 1) {
                    missedCount++;
                }
            }

            const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
            const totalTerm = baseTerm + (hasPenalty ? 1 : 0);
            
            const totalExpected = totalTerm * weeklyPayment;
            const totalPaid = currentPayments.reduce((acc, p) => acc + p.amount, 0);
            const settlementAmount = Math.max(0, totalExpected - totalPaid);
            
            const finalStatus: Loan['status'] = (isExpired || hasPenalty) ? 'Pagado desde CV' : 'Paid Off';

            if (settlementAmount <= 0) {
                transaction.update(loanRef, { status: finalStatus });
                return { success: true, message: "Este préstamo ya estaba liquidado." };
            }

            // Registrar el pago de liquidación final
            const newPayments = [...currentPayments, {
                date: new Date().toISOString(),
                amount: settlementAmount,
                weekNumber: -1, 
            }];
            
            const walletRef = doc(db, 'wallet', 'main');
            const walletTransactionRef = doc(collection(db, 'walletTransactions'));
            transaction.set(walletTransactionRef, {
                type: 'credit',
                amount: settlementAmount,
                date: new Date(),
                description: `Liquidación total de préstamo de ${client?.name || 'N/A'}.`,
                loanId: loanId,
                clientId: loan.clientId,
                userId: userId || null,
            });
            transaction.update(walletRef, { balance: increment(settlementAmount) });

            transaction.update(loanRef, {
                payments: newPayments,
                status: finalStatus,
            });
            
            return { success: true, message: "Préstamo liquidado con éxito." };
        });

        revalidatePath('/dashboard', 'layout');

        return result;

    } catch (error: any) {
        console.error('Error paying off loan:', error);
        return { success: false, message: `Error al liquidar el préstamo: ${error.message}` };
    }
}

export async function accumulateAssumedPaymentsAction(loanIds: string[], userId?: string) {
    try {
        const [plansSnap, clientsSnap] = await Promise.all([
            getDocs(collection(db, 'loanPlans')),
            getDocs(collection(db, 'clients'))
        ]);
        const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));
        const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));

        let totalAccumulated = 0;
        let count = 0;

        await runTransaction(db, async (transaction) => {
            const walletRef = doc(db, 'wallet', 'main');
            
            const loanSnapshots = await Promise.all(
                loanIds.map(id => transaction.get(doc(db, 'loans', id)))
            );

            const updateOps: { ref: any, data: any }[] = [];
            const txOps: any[] = [];

            const mexicoNow = getMexicoNow();

            for (const loanSnap of loanSnapshots) {
                if (!loanSnap.exists()) continue;

                const loan = loanSnap.data() as Loan;
                const plan = loanPlans.find(p => p.id === loan.loanPlanId);
                if (!plan) continue;

                const client = clients.find(c => c.id === loan.clientId);
                const weeklyPayment = (loan.amount / 1000) * plan.weeklyPaymentRate;
                const loanStartDate = parseFirestoreDate(loan.startDate);
                
                const diffTime = Math.abs(mexicoNow.getTime() - loanStartDate.getTime());
                const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const rawCurrentLoanWeek = Math.max(1, Math.floor((daysDiff - 1) / 7) + 1);
                
                const currentWeekToFill = Math.min(rawCurrentLoanWeek - 1, plan.termInWeeks);
                
                const currentPayments = loan.payments || [];
                let hasChanges = false;
                const newPayments = [...currentPayments];

                for (let w = 1; w <= currentWeekToFill; w++) {
                    const exists = currentPayments.some(p => p.weekNumber === w);
                    if (!exists) {
                        newPayments.push({
                            date: new Date().toISOString(),
                            amount: weeklyPayment,
                            weekNumber: w
                        });
                        totalAccumulated += weeklyPayment;
                        count++;
                        hasChanges = true;

                        txOps.push({
                            type: 'credit',
                            amount: weeklyPayment,
                            date: new Date(),
                            description: `Abono asumido (Hoja) de ${client?.name || 'N/A'} - Sem ${w}`,
                            loanId: loanSnap.id,
                            clientId: loan.clientId,
                            userId: userId || null
                        });
                    }
                }

                // REGLA DINÁMICA DE CARTERA VENCIDA Y LIQUIDACIÓN AUTOMÁTICA
                const baseTerm = plan.termInWeeks;
                let missedCount = 0;
                let totalPaidInBaseTerm = 0;
                for (let i = 1; i <= baseTerm; i++) {
                    const p = newPayments.find(pay => pay.weekNumber === i);
                    if (p) {
                        totalPaidInBaseTerm += p.amount;
                        if (p.amount < weeklyPayment) missedCount++;
                    } else if (i < rawCurrentLoanWeek - 1) {
                        missedCount++;
                    }
                }

                const isExpired = rawCurrentLoanWeek > baseTerm + 1;
                const hasPenalty = (missedCount >= 2) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
                
                const totalTerm = baseTerm + (hasPenalty ? 1 : 0);
                const totalExpected = totalTerm * weeklyPayment;
                const newTotalPaid = newPayments.reduce((acc, p) => acc + p.amount, 0);
                const balance = Math.max(0, totalExpected - newTotalPaid);

                let newStatus = loan.status;
                if (balance <= 0) {
                    newStatus = (isExpired || hasPenalty) ? 'Pagado desde CV' : 'Paid Off';
                } else {
                    newStatus = (isExpired || rawCurrentLoanWeek > totalTerm + 1) ? 'Overdue' : 'Active';
                }

                if (hasChanges || newStatus !== loan.status) {
                    updateOps.push({ 
                        ref: loanSnap.ref, 
                        data: { 
                            payments: newPayments, 
                            status: newStatus 
                        } 
                    });
                }
            }
            
            updateOps.forEach(op => transaction.update(op.ref, op.data));
            txOps.forEach(op => {
                const txRef = doc(collection(db, 'walletTransactions'));
                transaction.set(txRef, op);
            });

            if (totalAccumulated > 0) {
                transaction.update(walletRef, { balance: increment(totalAccumulated) });
            }
        });

        revalidatePath('/dashboard', 'layout');
        return { success: true, message: `Se formalizaron ${count} abonos por un total de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalAccumulated)}.` };
    } catch (error: any) {
        console.error('Error accumulating payments:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

export async function revertPaymentsForWeekAction(loanIds: string[], weekNumber: number, userId?: string) {
    try {
        let totalToSubtract = 0;
        let count = 0;

        await runTransaction(db, async (transaction) => {
            const walletRef = doc(db, 'wallet', 'main');
            
            const loanSnapshots = await Promise.all(
                loanIds.map(id => transaction.get(doc(db, 'loans', id)))
            );

            for (const loanSnap of loanSnapshots) {
                if (!loanSnap.exists()) continue;

                const loan = loanSnap.data() as Loan;
                const currentPayments = loan.payments || [];
                
                const paymentToRevert = currentPayments.find(p => p.weekNumber === weekNumber);
                
                if (paymentToRevert) {
                    totalToSubtract += paymentToRevert.amount;
                    count++;

                    const updatedPayments = [
                        ...currentPayments.filter(p => p.weekNumber !== weekNumber),
                        {
                            date: paymentToRevert.date || new Date().toISOString(),
                            amount: 0,
                            weekNumber: weekNumber,
                            isReverted: true
                        }
                    ];
                    
                    let newStatus = loan.status;
                    if (newStatus === 'Paid Off' || newStatus === 'Pagado desde CV') {
                        newStatus = 'Active'; 
                    }

                    transaction.update(loanSnap.ref, { 
                        payments: updatedPayments,
                        status: newStatus
                    });
                }
            }

            if (totalToSubtract > 0) {
                const auditTxRef = doc(collection(db, 'walletTransactions'));
                transaction.set(auditTxRef, {
                    type: 'debit',
                    amount: totalToSubtract,
                    date: new Date(),
                    description: `REVERSIÓN SEMANAL (Cristobal): Se quitaron ${count} pagos de la Semana ${weekNumber}.`,
                    userId: userId || null
                });
                
                transaction.update(walletRef, { balance: increment(-totalToSubtract) });
            }
        });

        revalidatePath('/dashboard', 'layout');
        return { success: true, message: `Se revirtieron ${count} abonos. Saldo de cartera ajustado en -${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalToSubtract)}.` };
    } catch (error: any) {
        console.error('Error reverting payments:', error);
        return { success: false, message: `Error al revertir pagos: ${error.message}` };
    }
}
