import { collection, getDocs, doc, getDoc, addDoc, updateDoc, writeBatch, query, where, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import type { Client, Loan, LoanPlan, Plaza, Localidad, Promotora, Wallet, WalletTransaction, AppUser, AppConfig } from './types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

// Helper to handle and emit errors contextualized
const handleFirestoreError = async (err: any, path: string, operation: SecurityRuleContext['operation'], data?: any) => {
    if (typeof window !== 'undefined') {
        const permissionError = new FirestorePermissionError({
            path,
            operation,
            requestResourceData: data
        });
        errorEmitter.emit('permission-error', permissionError);
    }
    throw err;
};

// Fetch all clients
export async function getClients(): Promise<Client[]> {
  const clientsCol = collection(db, 'clients');
  try {
    const clientSnapshot = await getDocs(clientsCol);
    return clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
  } catch (err) {
    return handleFirestoreError(err, clientsCol.path, 'list');
  }
}

// Fetch a single client by ID
export async function getClient(id: string): Promise<Client | null> {
  const clientRef = doc(db, 'clients', id);
  try {
    const clientSnap = await getDoc(clientRef);
    if (clientSnap.exists()) {
        return { id: clientSnap.id, ...clientSnap.data() } as Client;
    } else {
        return null;
    }
  } catch (err) {
    return handleFirestoreError(err, clientRef.path, 'get');
  }
}

// Fetch a single loan by ID
export async function getLoan(id: string): Promise<Loan | null> {
  const loanRef = doc(db, 'loans', id);
  try {
    const loanSnap = await getDoc(loanRef);
    if (loanSnap.exists()) {
        const data = loanSnap.data();
        const startDate = data.startDate instanceof Timestamp ? data.startDate.toDate().toISOString() : data.startDate;
        return { id: loanSnap.id, ...data, startDate } as Loan;
    } else {
        return null;
    }
  } catch (err) {
    return handleFirestoreError(err, loanRef.path, 'get');
  }
}


// Fetch all loans or loans for a specific client
export async function getLoans(clientId?: string): Promise<Loan[]> {
    const loansCol = collection(db, 'loans');
    const q = clientId ? query(loansCol, where("clientId", "==", clientId)) : query(loansCol);
    try {
        const loanSnapshot = await getDocs(q);
        const loanList = loanSnapshot.docs.map(doc => {
            const data = doc.data();
            const startDate = data.startDate instanceof Timestamp ? data.startDate.toDate().toISOString() : data.startDate;
            const payments = (data.payments || []).map((p: any) => ({
                ...p,
                date: p.date instanceof Timestamp ? p.date.toDate().toISOString() : p.date,
            }));

            return {
                id: doc.id,
                ...data,
                startDate,
                payments,
            } as Loan;
        });
        return loanList;
    } catch (err) {
        return handleFirestoreError(err, loansCol.path, 'list');
    }
}

// Fetch only active/overdue loans
export async function getActiveLoans(clientId?: string): Promise<Loan[]> {
    const loansCol = collection(db, 'loans');
    const q = clientId 
        ? query(loansCol, where("clientId", "==", clientId), where("status", "in", ["Active", "Overdue"])) 
        : query(loansCol, where("status", "in", ["Active", "Overdue"]));
    try {
        const loanSnapshot = await getDocs(q);
        const loanList = loanSnapshot.docs.map(doc => {
            const data = doc.data();
            const startDate = data.startDate instanceof Timestamp ? data.startDate.toDate().toISOString() : data.startDate;
            const payments = (data.payments || []).map((p: any) => ({
                ...p,
                date: p.date instanceof Timestamp ? p.date.toDate().toISOString() : p.date,
            }));

            return {
                id: doc.id,
                ...data,
                startDate,
                payments,
            } as Loan;
        });
        return loanList;
    } catch (err) {
        return handleFirestoreError(err, loansCol.path, 'list');
    }
}

// Fetch only the oldest loan in the system (limit 1)
export async function getOldestLoan(): Promise<Loan | null> {
    const loansCol = collection(db, 'loans');
    const q = query(loansCol, orderBy('startDate', 'asc'), limit(1));
    try {
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            const startDate = data.startDate instanceof Timestamp ? data.startDate.toDate().toISOString() : data.startDate;
            const payments = (data.payments || []).map((p: any) => ({
                ...p,
                date: p.date instanceof Timestamp ? p.date.toDate().toISOString() : p.date,
            }));
            return {
                id: doc.id,
                ...data,
                startDate,
                payments,
            } as Loan;
        }
        return null;
    } catch (err) {
        return handleFirestoreError(err, loansCol.path, 'list');
    }
}

// Fetch all loan plans
export async function getLoanPlans(): Promise<LoanPlan[]> {
  const plansCol = collection(db, 'loanPlans');
  try {
    const planSnapshot = await getDocs(plansCol);
    return planSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoanPlan));
  } catch (err) {
    return handleFirestoreError(err, plansCol.path, 'list');
  }
}

// Fetch a single loan plan by ID
export async function getLoanPlan(id: string): Promise<LoanPlan | null> {
  const planRef = doc(db, 'loanPlans', id);
  try {
    const planSnap = await getDoc(planRef);
    if (planSnap.exists()) {
        return { id: planSnap.id, ...planSnap.data() } as LoanPlan;
    } else {
        return null;
    }
  } catch (err) {
    return handleFirestoreError(err, planRef.path, 'get');
  }
}

// Fetch wallet
export async function getWallet(): Promise<Wallet> {
    const walletRef = doc(db, 'wallet', 'main');
    try {
        const walletSnap = await getDoc(walletRef);
        if(walletSnap.exists()) {
            return { id: walletSnap.id, ...walletSnap.data() } as Wallet;
        }
        await writeBatch(db).set(walletRef, { balance: 0 }).commit();
        return { id: 'main', balance: 0 };
    } catch (err) {
        return handleFirestoreError(err, walletRef.path, 'get');
    }
}

// Fetch all wallet transactions
export async function getWalletTransactions(cutoffDate?: Date): Promise<WalletTransaction[]> {
    const transactionsCol = collection(db, 'walletTransactions');
    let q = query(transactionsCol, orderBy('date', 'desc'));
    if (cutoffDate) {
        q = query(transactionsCol, where('date', '>=', cutoffDate), orderBy('date', 'desc'));
    }
    try {
        const transactionSnapshot = await getDocs(q);
        return transactionSnapshot.docs.map(doc => {
            const data = doc.data();
            const date = data.date instanceof Timestamp ? data.date.toDate().toISOString() : data.date;
            return { id: doc.id, ...data, date } as WalletTransaction;
        });
    } catch (err) {
        return handleFirestoreError(err, transactionsCol.path, 'list');
    }
}

// Fetch all plazas
export async function getPlazas(): Promise<Plaza[]> {
  const col = collection(db, 'plazas');
  try {
    const snapshot = await getDocs(col);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plaza));
  } catch (err) {
    return handleFirestoreError(err, col.path, 'list');
  }
}

// Fetch all localidades
export async function getLocalidades(): Promise<Localidad[]> {
  const col = collection(db, 'localidades');
  try {
    const snapshot = await getDocs(col);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Localidad));
  } catch (err) {
    return handleFirestoreError(err, col.path, 'list');
  }
}

// Fetch all promotoras
export async function getPromotoras(): Promise<Promotora[]> {
  const col = collection(db, 'promotoras');
  try {
    const snapshot = await getDocs(col);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promotora));
  } catch (err) {
    return handleFirestoreError(err, col.path, 'list');
  }
}

// Fetch all users
export async function getUsers(): Promise<AppUser[]> {
    const usersCol = collection(db, 'users');
    try {
        const userSnapshot = await getDocs(usersCol);
        return userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
    } catch (err) {
        return handleFirestoreError(err, usersCol.path, 'list');
    }
}

// Fetch app configuration with 7-day auto-rotation for guarantorAuthCode
export async function getAppConfig(): Promise<AppConfig | null> {
    const configRef = doc(db, 'config', 'main');
    try {
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            const data = configSnap.data() as AppConfig;
            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const lastUpdated = data.guarantorAuthCodeUpdatedAt ? new Date(data.guarantorAuthCodeUpdatedAt).getTime() : 0;
            const isExpired = !data.guarantorAuthCode || !data.guarantorAuthCodeUpdatedAt || (now - lastUpdated >= SEVEN_DAYS_MS);

            if (isExpired) {
                const newCode = Math.floor(100000 + Math.random() * 900000).toString();
                const newUpdatedAt = new Date().toISOString();
                updateDoc(configRef, {
                    guarantorAuthCode: newCode,
                    guarantorAuthCodeUpdatedAt: newUpdatedAt
                }).catch(err => console.error("Error auto-rotating guarantorAuthCode:", err));
                return {
                    ...data,
                    guarantorAuthCode: newCode,
                    guarantorAuthCodeUpdatedAt: newUpdatedAt
                };
            }

            return data;
        }
        return null;
    } catch (err) {
        return handleFirestoreError(err, configRef.path, 'get');
    }
}
