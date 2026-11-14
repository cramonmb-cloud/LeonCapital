'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit, increment } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import type { Precaptura, PrecapturaGasto } from '@/lib/types';

/**
 * Registers or updates concepts in the `gastoConcepts` collection so datalist/autocomplete learns them.
 */
async function recordConcepts(gastos: PrecapturaGasto[]) {
  for (const g of gastos) {
    if (g.concepto && g.concepto.trim()) {
      const cleanConcept = g.concepto.trim().toUpperCase();
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

/**
 * Saves the entire gastos array for a given plaza and week.
 * If the precaptura document does not exist yet, creates it.
 */
export async function saveGastosForPrecapturaAction(
  plazaId: string,
  weekDate: string,
  gastos: PrecapturaGasto[],
  plazaName?: string,
  updatedBy?: string
) {
  try {
    if (!plazaId || !weekDate) {
      return { success: false, message: 'Plaza y semana son requeridas.' };
    }

    const precapturaId = `${plazaId}_${weekDate}`;
    const docRef = doc(db, 'precapturas', precapturaId);

    // Auto-record concepts
    await recordConcepts(gastos);

    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await setDoc(docRef, {
        gastos,
        updatedAt: new Date().toISOString(),
        ...(updatedBy ? { updatedBy } : {})
      }, { merge: true });
    } else {
      await setDoc(docRef, {
        id: precapturaId,
        plazaId,
        plazaName: plazaName || '',
        weekDate,
        isClosed: false,
        fondo: 0,
        acumularSupervision: false,
        observaciones: '',
        rows: {},
        gastos,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(updatedBy ? { updatedBy } : {})
      });
    }

    revalidatePath('/inicio/precaptura');
    revalidatePath('/inicio/gastos');
    return { success: true, message: 'Gastos actualizados correctamente.' };
  } catch (err: any) {
    console.error('Error saving gastos:', err);
    return { success: false, message: err.message || 'Error al guardar gastos.' };
  }
}

/**
 * Adds a single gasto to the precaptura document for that plaza & week.
 */
export async function addGastoAction(
  plazaId: string,
  weekDate: string,
  gasto: PrecapturaGasto,
  plazaName?: string,
  updatedBy?: string
) {
  try {
    if (!plazaId || !weekDate) {
      return { success: false, message: 'Plaza y semana requeridas.' };
    }

    const precapturaId = `${plazaId}_${weekDate}`;
    const docRef = doc(db, 'precapturas', precapturaId);

    await recordConcepts([gasto]);

    const snap = await getDoc(docRef);
    let currentGastos: PrecapturaGasto[] = [];

    if (snap.exists()) {
      const data = snap.data() as Precaptura;
      currentGastos = data.gastos || [];
      const updatedGastos = [...currentGastos, gasto];

      await setDoc(docRef, {
        gastos: updatedGastos,
        updatedAt: new Date().toISOString(),
        ...(updatedBy ? { updatedBy } : {})
      }, { merge: true });
    } else {
      await setDoc(docRef, {
        id: precapturaId,
        plazaId,
        plazaName: plazaName || '',
        weekDate,
        isClosed: false,
        fondo: 0,
        acumularSupervision: false,
        observaciones: '',
        rows: {},
        gastos: [gasto],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(updatedBy ? { updatedBy } : {})
      });
    }

    revalidatePath('/inicio/precaptura');
    revalidatePath('/inicio/gastos');
    return { success: true, message: 'Gasto agregado correctamente.' };
  } catch (err: any) {
    console.error('Error adding gasto:', err);
    return { success: false, message: err.message || 'Error al agregar gasto.' };
  }
}

/**
 * Removes a single gasto from the precaptura document.
 */
export async function removeGastoAction(
  plazaId: string,
  weekDate: string,
  gastoId: string,
  updatedBy?: string
) {
  try {
    if (!plazaId || !weekDate || !gastoId) {
      return { success: false, message: 'Parámetros incompletos.' };
    }

    const precapturaId = `${plazaId}_${weekDate}`;
    const docRef = doc(db, 'precapturas', precapturaId);

    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { success: false, message: 'Documento no encontrado.' };
    }

    const data = snap.data() as Precaptura;
    const currentGastos = data.gastos || [];
    const updatedGastos = currentGastos.filter(g => g.id !== gastoId);

    await setDoc(docRef, {
      gastos: updatedGastos,
      updatedAt: new Date().toISOString(),
      ...(updatedBy ? { updatedBy } : {})
    }, { merge: true });

    revalidatePath('/inicio/precaptura');
    revalidatePath('/inicio/gastos');
    return { success: true, message: 'Gasto eliminado.' };
  } catch (err: any) {
    console.error('Error removing gasto:', err);
    return { success: false, message: err.message || 'Error al eliminar gasto.' };
  }
}

/**
 * Imports a batch of gastos from Excel.
 * Can append to existing ones (default) or replace existing ones.
 */
export async function importGastosAction(
  plazaId: string,
  weekDate: string,
  newGastos: PrecapturaGasto[],
  mode: 'append' | 'replace' = 'append',
  plazaName?: string,
  updatedBy?: string
) {
  try {
    if (!plazaId || !weekDate) {
      return { success: false, message: 'Plaza y semana son requeridas.' };
    }
    if (!newGastos || newGastos.length === 0) {
      return { success: false, message: 'No hay gastos para importar.' };
    }

    const precapturaId = `${plazaId}_${weekDate}`;
    const docRef = doc(db, 'precapturas', precapturaId);

    await recordConcepts(newGastos);

    const snap = await getDoc(docRef);
    let finalGastos: PrecapturaGasto[] = [];

    if (snap.exists()) {
      const data = snap.data() as Precaptura;
      const existing = data.gastos || [];
      finalGastos = mode === 'replace' ? newGastos : [...existing, ...newGastos];

      await setDoc(docRef, {
        gastos: finalGastos,
        updatedAt: new Date().toISOString(),
        ...(updatedBy ? { updatedBy } : {})
      }, { merge: true });
    } else {
      finalGastos = newGastos;
      await setDoc(docRef, {
        id: precapturaId,
        plazaId,
        plazaName: plazaName || '',
        weekDate,
        isClosed: false,
        fondo: 0,
        acumularSupervision: false,
        observaciones: '',
        rows: {},
        gastos: finalGastos,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(updatedBy ? { updatedBy } : {})
      });
    }

    revalidatePath('/inicio/precaptura');
    revalidatePath('/inicio/gastos');
    return {
      success: true,
      message: `Se importaron ${newGastos.length} gastos correctamente. Total en semana: ${finalGastos.length}.`,
      totalImported: newGastos.length,
      totalCount: finalGastos.length
    };
  } catch (err: any) {
    console.error('Error importing gastos:', err);
    return { success: false, message: err.message || 'Error al importar gastos.' };
  }
}

/**
 * Fetches recent unique gasto concepts for autocomplete.
 */
export async function getGastoConceptsAction(): Promise<string[]> {
  try {
    const colRef = collection(db, 'gastoConcepts');
    const q = query(colRef, orderBy('lastUsedAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    const concepts = snap.docs.map(d => d.data().concepto as string).filter(Boolean);
    return Array.from(new Set(concepts));
  } catch (err) {
    console.warn('Error fetching gasto concepts:', err);
    return [
      'GASOLINA',
      'VIATICOS',
      'PAPELERIA',
      'NOMINA',
      'CASETAS',
      'ALIMENTOS',
      'DESPENSA',
      'CAMIONES',
      'MANTENIMIENTO'
    ];
  }
}

/**
 * Saves a single concept to autocomplete list.
 */
export async function saveGastoConceptAction(concepto: string) {
  try {
    if (!concepto || !concepto.trim()) return { success: false };
    const cleanConcept = concepto.trim().toUpperCase();
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
