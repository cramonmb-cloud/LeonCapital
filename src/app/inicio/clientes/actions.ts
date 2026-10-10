'use server';

import { doc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { revalidatePath } from 'next/cache';
import type { Client } from '@/lib/types';

export async function saveClientAction(clientId: string, clientData: Omit<Client, 'id'>) {
    if (!clientId) {
        return { success: false, message: 'ID de cliente no proporcionado.' };
    }

    try {
        const clientRef = doc(db, 'clients', clientId);
        // We need to remove the fields that are not part of the core client data from the form
        const { id, ...dataToSave } = clientData as Client;
        await updateDoc(clientRef, dataToSave);

        revalidatePath('/inicio/clientes');
        revalidatePath(`/inicio/clientes/${clientId}`);
        revalidatePath(`/inicio/clientes/${clientId}/edit`);

        return { success: true, message: 'Cliente actualizado con éxito.' };
    } catch (error: any) {
        console.error('Error saving client:', error);
        return { success: false, message: `Error al guardar el cliente: ${error.message}` };
    }
}

export async function deleteClientAction(clientId: string) {
    if (!clientId) {
        return { success: false, message: 'ID de cliente no proporcionado.' };
    }

    try {
        const batch = writeBatch(db);

        // 1. Delete associated loans to maintain integrity
        const loansRef = collection(db, 'loans');
        const q = query(loansRef, where("clientId", "==", clientId));
        const loansSnap = await getDocs(q);
        
        loansSnap.docs.forEach((loanDoc) => {
            batch.delete(loanDoc.ref);
        });
        
        // 2. Delete the client document
        const clientRef = doc(db, 'clients', clientId);
        batch.delete(clientRef);
        
        await batch.commit();

        revalidatePath('/inicio/clientes');
        revalidatePath('/inicio/control');
        revalidatePath('/inicio');

        return { success: true, message: 'Cliente y toda su información financiera eliminados con éxito.' };
    } catch (error: any) {
        console.error('Error deleting client:', error);
        return { success: false, message: `Error al eliminar el cliente: ${error.message}` };
    }
}
