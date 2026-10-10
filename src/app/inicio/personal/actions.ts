'use server';

import { db } from '@/lib/firebase';
import { collection, doc, addDoc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import type { Personal } from '@/lib/types';

export async function savePersonalAction(data: Omit<Personal, 'id' | 'createdAt'>, id?: string) {
    try {
        let targetId = id;
        if (id) {
            await setDoc(doc(db, 'personal', id), data, { merge: true });
        } else {
            const docData = {
                ...data,
                createdAt: new Date().toISOString(),
            };
            const docRef = await addDoc(collection(db, 'personal'), docData);
            targetId = docRef.id;
        }

        // Synchronize with Promotora
        if (targetId) {
            if (data.promotoraId) {
                // Link this promotora to this personal
                await setDoc(doc(db, 'promotoras', data.promotoraId), { personalId: targetId }, { merge: true });

                // Clear any other promotora that was previously linked to this personal
                const prevQuery = query(collection(db, 'promotoras'), where('personalId', '==', targetId));
                const prevSnap = await getDocs(prevQuery);
                for (const d of prevSnap.docs) {
                    if (d.id !== data.promotoraId) {
                        await setDoc(doc(db, 'promotoras', d.id), { personalId: '' }, { merge: true });
                    }
                }
            } else {
                // If promotoraId was empty/cleared, clear any promotora that was linked to this personal
                const prevQuery = query(collection(db, 'promotoras'), where('personalId', '==', targetId));
                const prevSnap = await getDocs(prevQuery);
                for (const d of prevSnap.docs) {
                    await setDoc(doc(db, 'promotoras', d.id), { personalId: '' }, { merge: true });
                }
            }
        }

        revalidatePath('/inicio/personal');
        revalidatePath('/inicio/ajustes');
        return { success: true, message: id ? 'Ficha de personal actualizada con éxito.' : 'Personal registrado con éxito.' };
    } catch (error: any) {
        console.error('Error al guardar personal:', error);
        return { success: false, message: `Error al guardar personal: ${error.message}` };
    }
}

export async function deletePersonalAction(id: string) {
    try {
        await deleteDoc(doc(db, 'personal', id));
        // Clear any promotora linked to this personal
        const prevQuery = query(collection(db, 'promotoras'), where('personalId', '==', id));
        const prevSnap = await getDocs(prevQuery);
        for (const d of prevSnap.docs) {
            await setDoc(doc(db, 'promotoras', d.id), { personalId: '' }, { merge: true });
        }

        revalidatePath('/inicio/personal');
        revalidatePath('/inicio/ajustes');
        return { success: true, message: 'Ficha de personal eliminada con éxito.' };
    } catch (error: any) {
        console.error('Error al eliminar personal:', error);
        return { success: false, message: `Error al eliminar personal: ${error.message}` };
    }
}
