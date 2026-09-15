'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc, getDoc, addDoc, deleteDoc, setDoc, increment, Timestamp, updateDoc } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import type { Plaza, Localidad, Promotora, AppUser, AppConfig, Loan, LoanPlan, Client, WalletTransaction, WhatsAppTemplates } from '@/lib/types';

// Helper to handle Firestore dates consistently in server actions
const parseFirestoreDate = (date: any): Date => {
    if (!date) return new Date();
    if (date instanceof Timestamp) return date.toDate();
    if (typeof date === 'string') return new Date(date);
    if (date instanceof Date) return date;
    return new Date();
};

async function deleteCollection(collectionPath: string) {
    const collectionRef = collection(db, collectionPath);
    const snapshot = await getDocs(collectionRef);
    if (snapshot.empty) {
        return;
    }
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}


export async function deleteAllDataAction() {
    try {
        await deleteCollection('clients');
        await deleteCollection('loans');
        await deleteCollection('loanPlans');
        await deleteCollection('walletTransactions');
        await deleteCollection('plazas');
        await deleteCollection('localidades');
        await deleteCollection('promotoras');
        await deleteCollection('users');
        await deleteCollection('config');
        
        // Reset wallet
        const walletRef = doc(db, 'wallet', 'main');
        const batch = writeBatch(db);
        batch.set(walletRef, { balance: 0 });
        await batch.commit();

        revalidatePath('/dashboard');
        revalidatePath('/dashboard/bitacora');
        revalidatePath('/dashboard/clientes');
        revalidatePath('/dashboard/prestamos');
        revalidatePath('/dashboard/planes');
        revalidatePath('/dashboard/control');
        revalidatePath('/dashboard/ajustes');


        return { success: true, message: 'Todos los datos han sido eliminados exitosamente.' };
    } catch (error: any) {
        console.error('Error deleting all data:', error);
        return { success: false, message: `Error al eliminar los datos: ${error.message}` };
    }
}

// Global Payment Accumulation
export async function accumulateAllSystemPaymentsAction(userId?: string, onlyPriorWeek: boolean = false) {
    try {
        const [loansSnap, plansSnap, clientsSnap] = await Promise.all([
            getDocs(collection(db, 'loans')),
            getDocs(collection(db, 'loanPlans')),
            getDocs(collection(db, 'clients'))
        ]);

        const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));
        const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
        const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        // Note: Filter correctly including those that should be closed
        const activeLoans = loans.filter(l => l.status !== 'Paid Off' && l.status !== 'Pagado desde CV');
        
        if (activeLoans.length === 0) {
            return { success: true, message: 'No hay préstamos activos para procesar.' };
        }

        const today = new Date();
        let totalAccumulatedAmount = 0;
        let paymentsAccumulatedCount = 0;
        
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const loan of activeLoans) {
            const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
            if (!loanPlan) continue;

            const loanStartDate = parseFirestoreDate(loan.startDate);
            const timeDiff = today.getTime() - loanStartDate.getTime();
            const rawCurrentLoanWeek = Math.floor(timeDiff / (1000 * 3600 * 24 * 7)) + 1;
            
            const weeklyPaymentAmount = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
            const client = clients.find(c => c.id === loan.clientId);
            
            // REGLA DE SEGURIDAD: Solo procesar hasta el plazo base (loanPlan.termInWeeks)
            // No autocompletar la semana extra en sincronización masiva.
            const rawLimit = onlyPriorWeek ? rawCurrentLoanWeek - 1 : rawCurrentLoanWeek;
            const currentWeekToFill = Math.min(rawLimit, loanPlan.termInWeeks);

            const currentPayments = (loan.payments || []).map((p: any) => ({
                ...p,
                date: parseFirestoreDate(p.date).toISOString()
            }));

            let updatedPayments = [...currentPayments];
            let loanChanged = false;

            for (let weekNumber = 1; weekNumber <= currentWeekToFill; weekNumber++) {
                if (weekNumber <= 0) continue;

                const paymentExists = updatedPayments.some((p: any) => p.weekNumber === weekNumber);

                if (!paymentExists) {
                    updatedPayments.push({
                        date: new Date().toISOString(),
                        amount: weeklyPaymentAmount,
                        weekNumber: weekNumber,
                    });
                    
                    const walletTransactionRef = doc(collection(db, 'walletTransactions'));
                    batch.set(walletTransactionRef, {
                        type: 'credit',
                        amount: weeklyPaymentAmount,
                        date: new Date(),
                        description: `Abono (sincronización masiva) de ${client?.name || 'N/A'} - Semana ${weekNumber}.`,
                        loanId: loan.id,
                        clientId: loan.clientId,
                        userId: userId || null,
                    });

                    totalAccumulatedAmount += weeklyPaymentAmount;
                    paymentsAccumulatedCount++;
                    batchCount++;
                    loanChanged = true;
                }
            }

            // Closing logic
            let effectivePaid = 0;
            for (let i = 1; i <= loanPlan.termInWeeks; i++) {
                const p = updatedPayments.find((pay: any) => pay.weekNumber === i);
                if (p) effectivePaid += p.amount;
            }

            const totalLoanAmount = weeklyPaymentAmount * loanPlan.termInWeeks;
            let newStatus = loan.status;
            if (effectivePaid >= totalLoanAmount) {
                newStatus = (loan.status === 'Overdue' || rawCurrentLoanWeek > loanPlan.termInWeeks) ? 'Pagado desde CV' : 'Paid Off';
            } else {
                const isExpired = rawCurrentLoanWeek > loanPlan.termInWeeks + 1;
                if (isExpired) {
                    newStatus = 'Overdue';
                }
            }

            if (loanChanged || newStatus !== loan.status) {
                batch.update(doc(db, 'loans', loan.id), { payments: updatedPayments, status: newStatus });
                batchCount++;
            }

            if (batchCount >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        }

        if (paymentsAccumulatedCount > 0) {
            const walletRef = doc(db, 'wallet', 'main');
            batch.update(walletRef, { balance: increment(totalAccumulatedAmount) });
            await batch.commit();
        }

        revalidatePath('/dashboard', 'layout');
        
        return { 
            success: true, 
            message: `Se sincronizaron ${paymentsAccumulatedCount} abonos por un total de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalAccumulatedAmount)}.` 
        };
    } catch (error: any) {
        console.error('Error in global accumulation:', error);
        return { success: false, message: `Error al sincronizar abonos: ${error.message}` };
    }
}

// User Actions
export async function saveUserAction(uid: string, userData: Omit<AppUser, 'id'>) {
    try {
        await setDoc(doc(db, 'users', uid), userData, { merge: true });
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: 'Usuario guardado en Firestore.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar usuario en Firestore: ${error.message}` };
    }
}

export async function deleteUserAction(uid: string) {
    try {
        await deleteDoc(doc(db, 'users', uid));
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: 'Usuario eliminado de Firestore.' };
    } catch (error: any) {
        // Note: This does not delete the user from Firebase Auth
        return { success: false, message: `Error al eliminar usuario: ${error.message}` };
    }
}

// Plaza Actions
export async function savePlazaAction(name: string, highlight?: boolean, id?: string) {
    try {
        const data = { name, highlight: !!highlight };
        if (id) {
            await setDoc(doc(db, 'plazas', id), data, { merge: true });
        } else {
            await addDoc(collection(db, 'plazas'), data);
        }
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: id ? 'Plaza actualizada con éxito.' : 'Plaza guardada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar plaza: ${error.message}` };
    }
}

export async function deletePlazaAction(id: string) {
    try {
        await deleteDoc(doc(db, 'plazas', id));
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: 'Plaza eliminada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al eliminar plaza: ${error.message}` };
    }
}

// Localidad Actions
export async function saveLocalidadAction(data: Omit<Localidad, 'id'>, id?: string) {
    try {
        if (id) {
            await setDoc(doc(db, 'localidades', id), data, { merge: true });
        } else {
            await addDoc(collection(db, 'localidades'), data);
        }
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: id ? 'Localidad actualizada con éxito.' : 'Localidad guardada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar localidad: ${error.message}` };
    }
}

export async function deleteLocalidadAction(id: string) {
    try {
        await deleteDoc(doc(db, 'localidades', id));
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: 'Localidad eliminada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al eliminar localidad: ${error.message}` };
    }
}

// Promotora Actions
export async function savePromotoraAction(data: Omit<Promotora, 'id'>, id?: string) {
    try {
        if (id) {
            await setDoc(doc(db, 'promotoras', id), data, { merge: true });
        } else {
            await addDoc(collection(db, 'promotoras'), data);
        }
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: id ? 'Promotora actualizada con éxito.' : 'Promotora guardada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar promotora: ${error.message}` };
    }
}

export async function deletePromotoraAction(id: string) {
    try {
        await deleteDoc(doc(db, 'promotoras', id));
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: 'Promotora eliminada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al eliminar promotora: ${error.message}` };
    }
}


// App Config Actions
export async function saveLogoAction(
    logoUrl: string, 
    logoFormat?: 'square' | 'horizontal',
    sizes?: {
        logoHeightHeader?: number;
        logoWidthHeader?: number;
        logoHeightDashboard?: number;
        logoWidthDashboard?: number;
        logoHeightLogin?: number;
        logoWidthLogin?: number;
    },
    pwaLogoUrl?: string,
    loginCoverUrl?: string,
    loginTitle?: string,
    loginSubtitle?: string,
    imgbbApiKey?: string
) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { 
            logoUrl, 
            logoFormat: logoFormat || 'square',
            pwaLogoUrl: pwaLogoUrl || '',
            loginCoverUrl: loginCoverUrl || '',
            loginTitle: loginTitle || '',
            loginSubtitle: loginSubtitle || '',
            imgbbApiKey: imgbbApiKey || '',
            ...sizes
        }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        revalidatePath('/login');
        return { success: true, message: 'Identidad visual y logotipo actualizados con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar la identidad visual: ${error.message}` };
    }
}

export async function saveAppNameAction(appName: string) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { appName }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        return { success: true, message: 'Nombre de la aplicación actualizado con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar el nombre de la aplicación: ${error.message}` };
    }
}

export async function saveGuarantorLimitAction(limit: number, authCode: string) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { 
            maxGuarantorClients: limit, 
            guarantorAuthCode: authCode,
            guarantorAuthCodeUpdatedAt: new Date().toISOString()
        }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        return { success: true, message: 'Configuración de límite y clave de aval guardados con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar la configuración de avales: ${error.message}` };
    }
}

export async function getOrRotateGuarantorAuthCodeAction(): Promise<{ code: string; updatedAt: string; rotated: boolean }> {
    try {
        const configRef = doc(db, 'config', 'main');
        const snap = await getDoc(configRef);
        const data = (snap.data() || {}) as AppConfig;
        const currentCode = data.guarantorAuthCode;
        const updatedAtStr = data.guarantorAuthCodeUpdatedAt;
        
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const lastUpdated = updatedAtStr ? new Date(updatedAtStr).getTime() : 0;
        const isExpired = !currentCode || !updatedAtStr || (now - lastUpdated >= SEVEN_DAYS_MS);

        if (isExpired) {
            const newCode = Math.floor(100000 + Math.random() * 900000).toString();
            const newUpdatedAt = new Date().toISOString();
            await setDoc(configRef, {
                guarantorAuthCode: newCode,
                guarantorAuthCodeUpdatedAt: newUpdatedAt
            }, { merge: true });
            revalidatePath('/dashboard', 'layout');
            return { code: newCode, updatedAt: newUpdatedAt, rotated: true };
        }

        return { code: currentCode, updatedAt: updatedAtStr, rotated: false };
    } catch (error: any) {
        console.error('Error rotating guarantor auth code:', error);
        return { code: '000000', updatedAt: new Date().toISOString(), rotated: false };
    }
}

export async function rotateGuarantorAuthCodeNowAction(): Promise<{ success: boolean; code?: string; message: string }> {
    try {
        const configRef = doc(db, 'config', 'main');
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newUpdatedAt = new Date().toISOString();
        await setDoc(configRef, {
            guarantorAuthCode: newCode,
            guarantorAuthCodeUpdatedAt: newUpdatedAt
        }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        return { success: true, code: newCode, message: `Nueva clave de autorización generada: ${newCode}` };
    } catch (error: any) {
        return { success: false, message: `Error al generar la clave: ${error.message}` };
    }
}

export async function saveWhatsAppTemplateAction(template: string) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { whatsappTemplate: template }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        return { success: true, message: 'Plantilla de WhatsApp guardada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar la plantilla: ${error.message}` };
    }
}

export async function savePlazaWhatsAppTemplatesAction(plazaId: string, templates: WhatsAppTemplates) {
    try {
        const configRef = doc(db, 'config', 'main');
        const updateKey = `whatsappTemplates.${plazaId}`;
        await setDoc(configRef, { 
            whatsappTemplates: { 
                [plazaId]: templates 
            } 
        }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        return { success: true, message: 'Plantillas de la plaza actualizadas correctamente.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar plantillas por plaza: ${error.message}` };
    }
}

/**
 * Migrates a Localidad from its current Plaza to a target Plaza.
 * This effectively moves all linked Promotoras and Loans since the hierarchy is relational.
 */
export async function migrateLocalidadAction(localidadId: string, targetPlazaId: string) {
    try {
        const localidadRef = doc(db, 'localidades', localidadId);
        await updateDoc(localidadRef, { plazaId: targetPlazaId });
        
        revalidatePath('/dashboard', 'layout');
        
        return { 
            success: true, 
            message: 'La localidad y todos sus activos han sido migrados a la nueva plaza.' 
        };
    } catch (error: any) {
        console.error('Error migrating locality:', error);
        return { success: false, message: `Error al migrar localidad: ${error.message}` };
    }
}

/**
 * REVERSIÓN DE EMERGENCIA: Limpia los abonos erróneos en semanas extras realizados por auto-llenado.
 * Fecha de corte: 13/03/2026.
 */
export async function revertExtraWeekPaymentsAction() {
    try {
        const [loansSnap, plansSnap] = await Promise.all([
            getDocs(collection(db, 'loans')),
            getDocs(collection(db, 'loanPlans'))
        ]);

        const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));
        const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));

        // Fecha de corte solicitada (Semana del 13/03/26)
        const cutoffDate = new Date('2026-03-13T00:00:00Z');
        let totalToRevert = 0;
        let correctedCount = 0;
        
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const loan of loans) {
            const plan = loanPlans.find(p => p.id === loan.loanPlanId);
            if (!plan) continue;

            const baseTerm = plan.termInWeeks;
            const currentPayments = loan.payments || [];
            
            // Detectar abonos en semanas EXTRA (> baseTerm) realizados después del corte
            const extraPaymentsToRevert = currentPayments.filter(p => {
                const pDate = new Date(p.date);
                return p.weekNumber > baseTerm && pDate >= cutoffDate && p.amount > 0;
            });

            if (extraPaymentsToRevert.length > 0) {
                const loanSum = extraPaymentsToRevert.reduce((s, p) => s + p.amount, 0);
                totalToRevert += loanSum;
                correctedCount += extraPaymentsToRevert.length;

                // Ponemos los pagos en 0 para que vuelvan a aparecer como "Fallo"
                const updatedPayments = currentPayments.map(p => {
                    const pDate = new Date(p.date);
                    if (p.weekNumber > baseTerm && pDate >= cutoffDate) {
                        return { ...p, amount: 0 };
                    }
                    return p;
                });

                batch.update(doc(db, 'loans', loan.id), { 
                    payments: updatedPayments,
                    // Si el préstamo estaba liquidado erróneamente, vuelve a estar Vencido (Overdue)
                    status: loan.status === 'Paid Off' || loan.status === 'Pagado desde CV' ? 'Overdue' : loan.status
                });
                batchCount++;
            }

            if (batchCount >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        }

        if (totalToRevert > 0) {
            const walletRef = doc(db, 'wallet', 'main');
            batch.update(walletRef, { balance: increment(-totalToRevert) });
            
            // Auditoría: Registrar la salida de dinero
            const auditTxRef = doc(collection(db, 'walletTransactions'));
            batch.set(auditTxRef, {
                type: 'debit',
                amount: totalToRevert,
                date: new Date(),
                description: `REVERSIÓN DE SEGURIDAD: Eliminación de ${correctedCount} abonos erróneos en Semanas Extras (Post 13/03/26).`,
            });
            
            await batch.commit();
        }

        revalidatePath('/dashboard', 'layout');

        return { 
            success: true, 
            message: `Limpieza completada. Se revirtieron ${correctedCount} pagos. Saldo de cartera ajustado en -${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalToRevert)}.` 
        };
    } catch (error: any) {
        console.error('Error reverting extra payments:', error);
        return { success: false, message: `Error crítico al revertir: ${error.message}` };
    }
}

/**
 * IMPORTACIÓN DE RESPALDO: Borra los datos actuales e inserta los datos del archivo JSON.
 */
export async function importBackupAction(backupData: any) {
    try {
        // 1. Borrar datos actuales (excepto configuración base si se desea, pero el backup la incluye)
        await deleteAllDataAction();

        let batch = writeBatch(db);
        let batchCount = 0;

        const collections = [
            'plazas', 'localidades', 'promotoras', 'loanPlans', 'clients', 'loans', 'walletTransactions', 'users'
        ];

        for (const colName of collections) {
            const items = backupData[colName] || [];
            for (const item of items) {
                const { id, ...data } = item;
                
                // Conversión de fechas ISO a Timestamp para Firestore
                const dataToSave = { ...data };
                for (const key in dataToSave) {
                    if (typeof dataToSave[key] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dataToSave[key])) {
                        dataToSave[key] = Timestamp.fromDate(new Date(dataToSave[key]));
                    }
                    if (key === 'payments' && Array.isArray(dataToSave[key])) {
                        dataToSave[key] = dataToSave[key].map((p: any) => ({
                            ...p,
                            date: Timestamp.fromDate(new Date(p.date))
                        }));
                    }
                    if (key === 'startDate' && typeof dataToSave[key] === 'string') {
                        dataToSave[key] = Timestamp.fromDate(new Date(dataToSave[key]));
                    }
                }

                const docRef = doc(db, colName, id);
                batch.set(docRef, dataToSave);
                batchCount++;

                if (batchCount >= 450) {
                    await batch.commit();
                    batch = writeBatch(db);
                    batchCount = 0;
                }
            }
        }

        // Importar Cartera
        if (backupData.wallet) {
            const walletRef = doc(db, 'wallet', 'main');
            batch.set(walletRef, { balance: backupData.wallet.balance || 0 });
            batchCount++;
        }

        // Importar Configuración
        if (backupData.config) {
            const configRef = doc(db, 'config', 'main');
            batch.set(configRef, backupData.config);
            batchCount++;
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        revalidatePath('/dashboard', 'layout');

        return { success: true, message: 'El respaldo ha sido restaurado exitosamente.' };
    } catch (error: any) {
        console.error('Error importing backup:', error);
        return { success: false, message: `Error crítico al restaurar: ${error.message}` };
    }
}

/**
 * INTEGRACIÓN SUPERVISORAPP: Importa clientes desde una API externa y les asigna un préstamo inicial.
 */
export async function syncWithSupervisorAppAction(
    weekId: string, 
    apiKey: string, 
    promotoraId: string, 
    loanPlanId: string, 
    startDateIso: string
) {
    if (!apiKey) return { success: false, message: 'La llave de acceso API (X-API-KEY) es obligatoria.' };
    if (!weekId) return { success: false, message: 'Debes seleccionar una semana (YYYY-WW) para importar.' };
    if (!promotoraId || !loanPlanId || !startDateIso) {
        return { success: false, message: 'Faltan parámetros de asignación operativa (Plaza, Zona, Ruta, Plan o Fecha).' };
    }

    try {
        const response = await fetch(`https://coorporativo.online/api/v1/clients?weekId=${weekId}`, {
            method: 'GET',
            headers: {
                'X-API-KEY': apiKey,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorMsg = await response.text();
            throw new Error(`Error en la API externa (${response.status}): ${errorMsg}`);
        }

        const externalClients = await response.json();

        if (!Array.isArray(externalClients)) {
            throw new Error('La respuesta de la API no contiene un listado de clientes válido.');
        }

        if (externalClients.length === 0) {
            return { success: true, message: 'No se encontraron clientes nuevos para importar en esta semana.' };
        }

        let syncedCount = 0;
        let batch = writeBatch(db);
        let batchCount = 0;

        const loanStartDate = new Date(startDateIso);

        for (const ext of externalClients) {
            const externalId = ext.id || ext.uid || ext.client_id || `import_${syncedCount}_${Date.now()}`;
            const loanAmount = Number(ext.creditAmount) || Number(ext.monto) || 1000; // Tomar de la API, fallback a 1000 si no existe
            
            // 1. Mapeo del Cliente
            const clientData: Omit<Client, 'id'> = {
                name: (ext.name || ext.nombre || 'CLIENTE IMPORTADO').toUpperCase(),
                email: ext.email || ext.correo || `${externalId}@supervisorapp.com`,
                phone: ext.phone || ext.telefono || '',
                street: (ext.street || ext.calle || ext.domicilio || '').toUpperCase(),
                neighborhood: (ext.neighborhood || ext.colonia || '').toUpperCase(),
                postalCode: ext.postalCode || ext.cp || ext.codigo_postal || '',
                city: (ext.city || ext.ciudad || ext.estado || '').toUpperCase(),
                guarantee: (ext.guarantee || ext.garantia || 'DATO IMPORTADO').toUpperCase(),
                endorsement: (ext.endorsement || ext.aval || 'SIN AVAL REGISTRADO').toUpperCase(),
                avatarUrl: ext.avatarUrl || ext.foto || `https://picsum.photos/seed/${externalId}/40/40`,
            };

            const clientRef = doc(db, 'clients', String(externalId));
            batch.set(clientRef, clientData, { merge: true });
            
            // 2. Creación Automática del Préstamo
            const loanRef = doc(collection(db, 'loans'));
            const newLoan: Omit<Loan, 'id'> = {
                clientId: String(externalId),
                promotoraId: promotoraId,
                loanPlanId: loanPlanId,
                amount: loanAmount,
                startDate: loanStartDate.toISOString(),
                status: 'Active',
                payments: [],
            };
            batch.set(loanRef, newLoan);

            syncedCount++;
            batchCount += 2; // Dos operaciones por cliente (Client + Loan)

            if (batchCount >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        revalidatePath('/dashboard', 'layout');

        return { 
            success: true, 
            message: `Sincronización finalizada. Se importaron ${syncedCount} clientes y se les asignó un préstamo bajo la ruta seleccionada.` 
        };

    } catch (error: any) {
        console.error('SupervisorApp Sync Error:', error);
        return { success: false, message: `Fallo crítico al conectar con SUPERvisorApp: ${error.message}` };
    }
}

export async function saveMenuConfigAction(
    menuConfig: Record<string, 'operacion' | 'administracion'>,
    menuOrder?: string[]
) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { menuConfig, menuOrder: menuOrder || null }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        return { success: true, message: 'Distribución del menú guardada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar la distribución del menú: ${error.message}` };
    }
}

export async function saveMenuColorsAction(operacionColor: string, administracionColor: string) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { operacionColor, administracionColor }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        return { success: true, message: 'Colores de los menús guardados con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar los colores: ${error.message}` };
    }
}

export async function saveStaffTypesAction(staffTypes: string[]) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { staffTypes }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        revalidatePath('/dashboard/ajustes');
        return { success: true, message: 'Tipos de personal guardados con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar los tipos de personal: ${error.message}` };
    }
}

export async function saveImprentaUrlAction(imprentaIframeUrl: string) {
    try {
        const configRef = doc(db, 'config', 'main');
        await setDoc(configRef, { imprentaIframeUrl }, { merge: true });
        revalidatePath('/dashboard', 'layout');
        revalidatePath('/dashboard/imprenta');
        return { success: true, message: 'URL del iframe de Imprenta guardada con éxito.' };
    } catch (error: any) {
        return { success: false, message: `Error al guardar la URL del iframe: ${error.message}` };
    }
}

/**
 * Detects and merges duplicate clients in the database.
 * Duplicates are determined by name (case-insensitive, trimmed).
 * It merges all duplicates into a single client (retaining the most complete info),
 * updates all loans to point to the unified client ID,
 * updates all walletTransactions to point to the unified client ID,
 * and deletes the duplicate client documents.
 */
export async function mergeDuplicateClientsAction() {
    try {
        const [clientsSnap, loansSnap, transactionsSnap] = await Promise.all([
            getDocs(collection(db, 'clients')),
            getDocs(collection(db, 'loans')),
            getDocs(collection(db, 'walletTransactions'))
        ]);

        const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
        const loans = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
        const transactions = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WalletTransaction));

        // Group clients by normalized name
        const groups: Record<string, Client[]> = {};
        clients.forEach(client => {
            const normalizedName = (client.name || '').trim().toUpperCase();
            if (!normalizedName) return;
            if (!groups[normalizedName]) {
                groups[normalizedName] = [];
            }
            groups[normalizedName].push(client);
        });

        let mergeCount = 0;
        let clientsDeleted = 0;
        let loansUpdated = 0;
        let transactionsUpdated = 0;

        let batch = writeBatch(db);
        let batchCount = 0;

        for (const [name, group] of Object.entries(groups)) {
            if (group.length <= 1) continue;

            mergeCount++;
            
            // Choose the primary client
            // Rule: choose the one with the most complete contact/address info, or simply the first/oldest
            const primaryClient = group.reduce((prev, curr) => {
                const prevScore = (prev.street ? 1 : 0) + (prev.phone ? 1 : 0) + (prev.neighborhood ? 1 : 0) + (prev.endorsement ? 1 : 0);
                const currScore = (curr.street ? 1 : 0) + (curr.phone ? 1 : 0) + (curr.neighborhood ? 1 : 0) + (curr.endorsement ? 1 : 0);
                return currScore > prevScore ? curr : prev;
            }, group[0]);

            const duplicateClients = group.filter(c => c.id !== primaryClient.id);

            // Merge details into primaryClient (if duplicates have details primary doesn't have)
            const updatedPrimaryData = { ...primaryClient };
            duplicateClients.forEach(dup => {
                if (!updatedPrimaryData.street && dup.street) updatedPrimaryData.street = dup.street;
                if (!updatedPrimaryData.neighborhood && dup.neighborhood) updatedPrimaryData.neighborhood = dup.neighborhood;
                if (!updatedPrimaryData.postalCode && dup.postalCode) updatedPrimaryData.postalCode = dup.postalCode;
                if (!updatedPrimaryData.city && dup.city) updatedPrimaryData.city = dup.city;
                if (!updatedPrimaryData.phone && dup.phone) updatedPrimaryData.phone = dup.phone;
                if (!updatedPrimaryData.guarantee && dup.guarantee) updatedPrimaryData.guarantee = dup.guarantee;
                if (!updatedPrimaryData.endorsement && dup.endorsement) updatedPrimaryData.endorsement = dup.endorsement;
            });

            // Update primary client in firestore
            const primaryRef = doc(db, 'clients', primaryClient.id);
            const { id, ...saveData } = updatedPrimaryData;
            batch.update(primaryRef, saveData);
            batchCount++;

            // Gather duplicate client IDs
            const dupIds = duplicateClients.map(c => c.id);

            // Update associated loans to use the primaryClient ID
            const loansToUpdate = loans.filter(l => dupIds.includes(l.clientId));
            loansToUpdate.forEach(loan => {
                const loanRef = doc(db, 'loans', loan.id);
                batch.update(loanRef, { clientId: primaryClient.id });
                loansUpdated++;
                batchCount++;
            });

            // Update associated wallet transactions to use the primaryClient ID
            const transactionsToUpdate = transactions.filter(t => t.clientId && dupIds.includes(t.clientId));
            transactionsToUpdate.forEach(tx => {
                const txRef = doc(db, 'walletTransactions', tx.id);
                batch.update(txRef, { clientId: primaryClient.id });
                transactionsUpdated++;
                batchCount++;
            });

            // Delete duplicate clients
            duplicateClients.forEach(dup => {
                const dupRef = doc(db, 'clients', dup.id);
                batch.delete(dupRef);
                clientsDeleted++;
                batchCount++;
            });

            if (batchCount >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        revalidatePath('/dashboard/clientes');
        revalidatePath('/dashboard/prestamos');
        revalidatePath('/dashboard/ajustes');

        return {
            success: true,
            message: `Se unificaron ${mergeCount} grupos de clientes duplicados. Se eliminaron ${clientsDeleted} duplicados, se actualizaron ${loansUpdated} préstamos y ${transactionsUpdated} transacciones.`
        };
    } catch (error: any) {
        console.error('Error merging duplicate clients:', error);
        return { success: false, message: `Error al unificar clientes duplicados: ${error.message}` };
    }
}
