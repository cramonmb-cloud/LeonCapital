'use server';

import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, orderBy, limit, increment } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import type { Precaptura, PrecapturaGasto } from '@/lib/types';

export async function savePrecapturaAction(precaptura: Precaptura) {
  try {
    const docRef = doc(db, 'precapturas', precaptura.id);

    // Also auto-record concepts from any gastos in this precaptura
    if (precaptura.gastos && precaptura.gastos.length > 0) {
      for (const g of precaptura.gastos) {
        if (g.concepto && g.concepto.trim()) {
          const cleanConcept = g.concepto.trim();
          const conceptId = cleanConcept.toLowerCase().replace(/[^a-z0-9]/gi, '_');
          if (conceptId) {
            const conceptRef = doc(db, 'gastoConcepts', conceptId);
            await setDoc(conceptRef, {
              concepto: cleanConcept,
              lastUsedAt: new Date().toISOString(),
              count: increment(1)
            }, { merge: true }).catch(() => {});
          }
        }
      }
    }

    await setDoc(docRef, {
      ...precaptura,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    revalidatePath('/inicio/precaptura');
    return { success: true, message: 'Precaptura guardada correctamente.' };
  } catch (err: any) {
    console.error('Error saving precaptura:', err);
    return { success: false, message: err.message || 'Error al guardar la precaptura.' };
  }
}

export async function getPrecapturaAction(id: string): Promise<{ success: boolean; data?: Precaptura; message?: string }> {
  try {
    const docRef = doc(db, 'precapturas', id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { success: true, data: { id: snap.id, ...snap.data() } as Precaptura };
    }
    return { success: true, data: undefined };
  } catch (err: any) {
    console.error('Error fetching precaptura:', err);
    return { success: false, message: err.message };
  }
}

export async function deletePrecapturaAction(id: string) {
  try {
    const docRef = doc(db, 'precapturas', id);
    await deleteDoc(docRef);
    revalidatePath('/inicio/precaptura');
    return { success: true, message: 'Precaptura restablecida correctamente.' };
  } catch (err: any) {
    console.error('Error deleting precaptura:', err);
    return { success: false, message: err.message || 'Error al eliminar precaptura.' };
  }
}

export async function getGastoConceptsAction(): Promise<string[]> {
  try {
    const colRef = collection(db, 'gastoConcepts');
    const q = query(colRef, orderBy('lastUsedAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const concepts = snap.docs.map(d => d.data().concepto as string).filter(Boolean);
    return Array.from(new Set(concepts));
  } catch (err) {
    console.warn('Error fetching gasto concepts:', err);
    return [
      'GASOLINA',
      'VIATICOS',
      'PAPELERIA',
      'COMISION BANCARIA',
      'ALIMENTOS',
      'FLETE / TRANSPORTE',
      'TELEFONIA',
      'MANTENIMIENTO'
    ];
  }
}

export async function saveGastoConceptAction(concepto: string) {
  try {
    if (!concepto || !concepto.trim()) return { success: false };
    const cleanConcept = concepto.trim();
    const conceptId = cleanConcept.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    const conceptRef = doc(db, 'gastoConcepts', conceptId);
    await setDoc(conceptRef, {
      concepto: cleanConcept,
      lastUsedAt: new Date().toISOString(),
      count: increment(1)
    }, { merge: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
