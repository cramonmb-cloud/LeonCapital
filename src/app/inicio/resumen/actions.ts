'use server';

import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  writeBatch, 
  query, 
  where 
} from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import type { 
  WeeklyClosure, 
  PlazaClosureSummary, 
  PromotoraSettlement, 
  Precaptura, 
  Loan, 
  LoanPlan, 
  Plaza, 
  Localidad, 
  Promotora, 
  AppConfig 
} from '@/lib/types';
import { computePromotoraWeekMetrics, getPreviousSaturdayStr } from '@/lib/settlement-calculator';
import { getAppConfig } from '@/lib/firestore-data';

function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanFirestoreData(item)) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = cleanFirestoreData(value);
      }
    }
    return clean as T;
  }
  return obj;
}

async function commitBatches(operations: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  const CHUNK_SIZE = 250;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(op => op(batch));
    await batch.commit();
  }
}

/**
 * Recalculates and synchronizes all promotora settlement metrics for a specific week from live loans.
 * Updates promotoraSettlements, precapturas, and weeklyClosures in Firestore.
 */
export async function syncResumenWeekAction({
  weekDate,
  username
}: {
  weekDate: string;
  username: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const nowIso = new Date().toISOString();
    const prevWeekStr = getPreviousSaturdayStr(weekDate);

    const [plazasSnap, localidadesSnap, promotorasSnap, loansSnap, plansSnap, config, closureSnap] = await Promise.all([
      getDocs(collection(db, 'plazas')),
      getDocs(collection(db, 'localidades')),
      getDocs(collection(db, 'promotoras')),
      getDocs(collection(db, 'loans')),
      getDocs(collection(db, 'loanPlans')),
      getAppConfig(),
      getDoc(doc(db, 'weeklyClosures', weekDate))
    ]);

    const plazas = plazasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Plaza));
    const localidades = localidadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Localidad));
    const promotoras = promotorasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Promotora));
    const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
    const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));
    const closureData = closureSnap.exists() ? (closureSnap.data() as WeeklyClosure) : null;

    const precapturasSnap = await getDocs(query(collection(db, 'precapturas'), where('weekDate', '==', weekDate)));
    const precapturasByPlaza: Record<string, Precaptura> = {};
    precapturasSnap.docs.forEach(d => {
      const data = d.data() as Precaptura;
      precapturasByPlaza[data.plazaId] = { ...data, id: d.id };
    });

    const prevSettlementsMap: Record<string, PromotoraSettlement> = {};
    const curSettlementsMap: Record<string, PromotoraSettlement> = {};

    await Promise.all(promotoras.map(async (p) => {
      const prevDocSnap = await getDoc(doc(db, 'promotoraSettlements', `${p.id}_${prevWeekStr}`));
      if (prevDocSnap.exists()) {
        prevSettlementsMap[p.id] = prevDocSnap.data() as PromotoraSettlement;
      }
      const curDocSnap = await getDoc(doc(db, 'promotoraSettlements', `${p.id}_${weekDate}`));
      if (curDocSnap.exists()) {
        curSettlementsMap[p.id] = curDocSnap.data() as PromotoraSettlement;
      }
    }));

    const batchOperations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    const precapturaUpdates: Record<string, Record<string, any>> = {};
    const plazaClosures: Record<string, PlazaClosureSummary> = { ...(closureData?.plazaClosures || {}) };

    plazas.forEach(plaza => {
      const plazaLocIds = localidades.filter(l => l.plazaId === plaza.id).map(l => l.id);
      const pPromotoras = promotoras.filter(p => plazaLocIds.includes(p.localidadId));
      const precaptura = precapturasByPlaza[plaza.id];

      let sumDebe = 0;
      let sumCobrado = 0;
      let sumFalla = 0;
      let sumRecuperado = 0;
      let sumVenta = 0;

      pPromotoras.forEach(promotora => {
        const pId = promotora.id;
        const rawPrecapturaRow = precaptura?.rows?.[pId];
        const precapturaRow = rawPrecapturaRow ? {
          ...rawPrecapturaRow,
          falla: undefined,
          debeEntregar: undefined, // Recalcular cobranza esperada a partir de los préstamos actuales
          venta: undefined, // Recalcular venta a partir de los préstamos capturados
          comision: undefined,
          supervision: undefined,
        } : undefined;

        const prevSettlement = prevSettlementsMap[pId];
        const curSettlement = curSettlementsMap[pId];
        const sanitizedCurSettlement = curSettlement ? {
          ...curSettlement,
          venta: undefined,
          comicion: undefined,
          supervision: undefined,
        } : undefined;

        const settlement = computePromotoraWeekMetrics({
          promotoraId: pId,
          promotoraName: promotora.name,
          targetWeekStr: weekDate,
          loans,
          loanPlans,
          config,
          prevSettlement,
          precapturaRow,
          savedSettlement: sanitizedCurSettlement,
        });

        const isClosed = curSettlement?.isClosed ?? false;
        const updatedSettlement: PromotoraSettlement = {
          ...curSettlement,
          ...settlement,
          isClosed,
          updatedAt: nowIso,
          updatedBy: username,
        };

        sumDebe += updatedSettlement.debeEntregar;
        sumCobrado += updatedSettlement.total;
        sumFalla += updatedSettlement.falla;
        sumRecuperado += updatedSettlement.recuperado;
        sumVenta += updatedSettlement.venta;

        const setRef = doc(db, 'promotoraSettlements', updatedSettlement.id);
        batchOperations.push((batch) => {
          batch.set(setRef, cleanFirestoreData(updatedSettlement), { merge: true });
        });

        if (precaptura && rawPrecapturaRow) {
          if (!precapturaUpdates[precaptura.id]) {
            precapturaUpdates[precaptura.id] = {};
          }
          precapturaUpdates[precaptura.id][`rows.${pId}.falla`] = updatedSettlement.falla;
          precapturaUpdates[precaptura.id][`rows.${pId}.efectivo`] = updatedSettlement.efectivo;
          precapturaUpdates[precaptura.id][`rows.${pId}.totalEntregar`] = updatedSettlement.total;
          precapturaUpdates[precaptura.id][`rows.${pId}.diferencia`] = updatedSettlement.diferencia;
          precapturaUpdates[precaptura.id][`rows.${pId}.venta`] = updatedSettlement.venta;
          precapturaUpdates[precaptura.id][`rows.${pId}.comision`] = updatedSettlement.comicion;
          precapturaUpdates[precaptura.id][`rows.${pId}.supervision`] = updatedSettlement.supervision;
        }
      });

      plazaClosures[plaza.id] = {
        ...(plazaClosures[plaza.id] || {}),
        totalPromotoras: pPromotoras.length,
        totalDebeEntregar: sumDebe,
        totalCobrado: sumCobrado,
        totalFalla: sumFalla,
        totalRecuperado: sumRecuperado,
        totalVenta: sumVenta,
      };
    });

    // Batch update precapturas (one update per precaptura doc)
    Object.entries(precapturaUpdates).forEach(([precId, updates]) => {
      batchOperations.push((batch) => {
        batch.update(doc(db, 'precapturas', precId), updates);
      });
    });

    // Create or update WeeklyClosure document
    const closureRef = doc(db, 'weeklyClosures', weekDate);
    const updatedClosure: WeeklyClosure = {
      id: weekDate,
      weekDate,
      isGlobalClosed: closureData?.isGlobalClosed ?? false,
      closedPlazaIds: closureData?.closedPlazaIds || [],
      plazaClosures,
      updatedAt: nowIso,
      updatedBy: username,
      createdAt: closureData?.createdAt || nowIso,
    };

    batchOperations.push((batch) => {
      batch.set(closureRef, cleanFirestoreData(updatedClosure), { merge: true });
    });

    await commitBatches(batchOperations);

    try {
      revalidatePath('/inicio/resumen');
      revalidatePath('/inicio/cierre-semanal');
      revalidatePath('/inicio/debes');
      revalidatePath('/inicio/precaptura');
    } catch {
      // Ignore when running outside Next.js request context
    }

    return { 
      success: true, 
      message: `Semana ${weekDate} sincronizada exitosamente con los préstamos actuales.` 
    };
  } catch (err: any) {
    console.error('Error synchronizing week in Resumen:', err);
    return { success: false, message: err.message || 'Error al sincronizar la semana.' };
  }
}

/**
 * Recalculates and synchronizes multiple weeks in range order (oldest to newest)
 */
export async function syncResumenWeeksRangeAction({
  weekDates,
  username
}: {
  weekDates: string[];
  username: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!weekDates || weekDates.length === 0) {
      return { success: false, message: 'No hay semanas seleccionadas para sincronizar.' };
    }

    const sortedWeeks = [...weekDates].sort((a, b) => a.localeCompare(b));
    let count = 0;

    for (const w of sortedWeeks) {
      const res = await syncResumenWeekAction({ weekDate: w, username });
      if (res.success) count++;
    }

    return {
      success: true,
      message: `${count} semana(s) sincronizada(s) exitosamente.`
    };
  } catch (err: any) {
    console.error('Error synchronizing weeks range in Resumen:', err);
    return { success: false, message: err.message || 'Error al sincronizar el rango de semanas.' };
  }
}

/**
 * Recalculates and updates a single promotora settlement for a specific week
 */
export async function syncSinglePromotoraInResumenAction({
  promotoraId,
  weekDate,
  username
}: {
  promotoraId: string;
  weekDate: string;
  username: string;
}): Promise<{ success: boolean; message: string; settlement?: PromotoraSettlement }> {
  try {
    const nowIso = new Date().toISOString();
    const prevWeekStr = getPreviousSaturdayStr(weekDate);

    const [promSnap, loansSnap, plansSnap, config, prevDocSnap, curDocSnap] = await Promise.all([
      getDoc(doc(db, 'promotoras', promotoraId)),
      getDocs(query(collection(db, 'loans'), where('promotoraId', '==', promotoraId))),
      getDocs(collection(db, 'loanPlans')),
      getAppConfig(),
      getDoc(doc(db, 'promotoraSettlements', `${promotoraId}_${prevWeekStr}`)),
      getDoc(doc(db, 'promotoraSettlements', `${promotoraId}_${weekDate}`))
    ]);

    if (!promSnap.exists()) {
      return { success: false, message: 'No se encontró la promotora.' };
    }

    const promotora = { id: promSnap.id, ...promSnap.data() } as Promotora;
    const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
    const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));
    const prevSettlement = prevDocSnap.exists() ? (prevDocSnap.data() as PromotoraSettlement) : null;
    const curSettlement = curDocSnap.exists() ? (curDocSnap.data() as PromotoraSettlement) : null;

    const sanitizedCurSettlement = curSettlement ? {
      ...curSettlement,
      venta: undefined,
      comicion: undefined,
      supervision: undefined,
    } : undefined;

    const settlement = computePromotoraWeekMetrics({
      promotoraId,
      promotoraName: promotora.name,
      targetWeekStr: weekDate,
      loans,
      loanPlans,
      config,
      prevSettlement,
      savedSettlement: sanitizedCurSettlement,
    });

    const isClosed = curSettlement?.isClosed ?? false;
    const updatedSettlement: PromotoraSettlement = {
      ...curSettlement,
      ...settlement,
      isClosed,
      updatedAt: nowIso,
      updatedBy: username,
    };

    const setRef = doc(db, 'promotoraSettlements', updatedSettlement.id);
    const batch = writeBatch(db);
    batch.set(setRef, cleanFirestoreData(updatedSettlement), { merge: true });

    // Also update in precaptura if present
    if (promotora.localidadId) {
      const locSnap = await getDoc(doc(db, 'localidades', promotora.localidadId));
      if (locSnap.exists()) {
        const plazaId = locSnap.data().plazaId;
        if (plazaId) {
          const precapturaQ = query(
            collection(db, 'precapturas'),
            where('weekDate', '==', weekDate),
            where('plazaId', '==', plazaId)
          );
          const precSnap = await getDocs(precapturaQ);
          if (!precSnap.empty) {
            const precDoc = precSnap.docs[0];
            const precData = precDoc.data();
            if (precData.rows?.[promotoraId]) {
              batch.update(doc(db, 'precapturas', precDoc.id), {
                [`rows.${promotoraId}.falla`]: updatedSettlement.falla,
                [`rows.${promotoraId}.efectivo`]: updatedSettlement.efectivo,
                [`rows.${promotoraId}.totalEntregar`]: updatedSettlement.total,
                [`rows.${promotoraId}.diferencia`]: updatedSettlement.diferencia,
                [`rows.${promotoraId}.venta`]: updatedSettlement.venta,
                [`rows.${promotoraId}.comision`]: updatedSettlement.comicion,
                [`rows.${promotoraId}.supervision`]: updatedSettlement.supervision,
              });
            }
          }
        }
      }
    }

    await batch.commit();

    try {
      revalidatePath('/inicio/resumen');
      revalidatePath('/inicio/cierre-semanal');
      revalidatePath('/inicio/debes');
    } catch {
      // Ignore when running outside Next.js request context
    }

    return {
      success: true,
      message: `Grupo ${promotora.name} sincronizado correctamente.`,
      settlement: updatedSettlement
    };
  } catch (err: any) {
    console.error('Error synchronizing single promotora:', err);
    return { success: false, message: err.message || 'Error al sincronizar el grupo.' };
  }
}
