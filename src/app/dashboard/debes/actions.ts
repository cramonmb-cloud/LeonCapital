'use server';

import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, query, collection, where, getDocs, writeBatch } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import type { PromotoraSettlement } from '@/lib/types';

export async function saveSettlementAction(settlement: PromotoraSettlement) {
    try {
        const docRef = doc(db, 'promotoraSettlements', settlement.id);
        
        await setDoc(docRef, {
            ...settlement,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        revalidatePath('/dashboard/debes');
        return { success: true, message: 'Liquidación guardada correctamente.' };
    } catch (err: any) {
        console.error('Error saving promotora settlement:', err);
        return { success: false, message: err.message || 'Error al guardar la liquidación.' };
    }
}

export async function deleteSettlementAction(id: string) {
    try {
        const docRef = doc(db, 'promotoraSettlements', id);
        await deleteDoc(docRef);
        revalidatePath('/dashboard/debes');
        return { success: true, message: 'Liquidación restablecida correctamente.' };
    } catch (err: any) {
        console.error('Error deleting promotora settlement:', err);
        return { success: false, message: err.message || 'Error al restablecer la liquidación.' };
    }
}

export async function deleteGroupSettlementsAction(promotoraId: string) {
    try {
        const q = query(collection(db, 'promotoraSettlements'), where('promotoraId', '==', promotoraId));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        revalidatePath('/dashboard/debes');
        return { success: true, message: 'Todo el historial del grupo fue restablecido correctamente.' };
    } catch (err: any) {
        console.error('Error deleting group settlements:', err);
        return { success: false, message: err.message || 'Error al restablecer el historial del grupo.' };
    }
}
