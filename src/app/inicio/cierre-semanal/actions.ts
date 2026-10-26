'use server';

import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  writeBatch, 
  query, 
  where,
  orderBy,
  limit
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

/**
 * Fetch weekly closure metadata for a specific week
 */
export async function getWeeklyClosureAction(weekDate: string): Promise<{ success: boolean; data?: WeeklyClosure; message?: string }> {
  try {
    const docRef = doc(db, 'weeklyClosures', weekDate);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { success: true, data: { id: snap.id, ...snap.data() } as WeeklyClosure };
    }
    return { success: true, data: undefined };
  } catch (err: any) {
    console.error('Error fetching weekly closure:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Fetch all past weekly closures
 */
export async function getWeeklyClosuresListAction(): Promise<WeeklyClosure[]> {
  try {
    const colRef = collection(db, 'weeklyClosures');
    const q = query(colRef, orderBy('weekDate', 'desc'), limit(52));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyClosure));
  } catch (err: any) {
    console.error('Error fetching closures list:', err);
    return [];
  }
}

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

/**
 * Helper to commit docs in chunks of 250 to respect Firestore batch limit of 500
 */
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
 * Closes and freezes financial records for a single Plaza
 */
export async function executePlazaClosureAction({
  plazaId,
  weekDate,
  username
}: {
  plazaId: string;
  weekDate: string;
  username: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const nowIso = new Date().toISOString();
    const prevWeekStr = getPreviousSaturdayStr(weekDate);

    // 1. Fetch Plaza & Localidades & Promotoras
    const localidadesSnap = await getDocs(query(collection(db, 'localidades'), where('plazaId', '==', plazaId)));
    const locIds = localidadesSnap.docs.map(d => d.id);
    if (locIds.length === 0) {
      return { success: false, message: 'La plaza no tiene localidades registradas.' };
    }

    const allPromotorasSnap = await getDocs(collection(db, 'promotoras'));
    const plazaPromotoras = allPromotorasSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Promotora))
      .filter(p => locIds.includes(p.localidadId));

    if (plazaPromotoras.length === 0) {
      return { success: false, message: 'La plaza no tiene promotoras registradas.' };
    }

    // 2. Fetch Loans, LoanPlans, and Config
    const [loansSnap, plansSnap, config] = await Promise.all([
      getDocs(collection(db, 'loans')),
      getDocs(collection(db, 'loanPlans')),
      getAppConfig()
    ]);
    const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
    const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));

    // 3. Fetch any Precaptura for this plaza and week
    const precapturaRef = doc(db, 'precapturas', `${plazaId}_${weekDate}`);
    const precapturaSnap = await getDoc(precapturaRef);
    const precapturaData = precapturaSnap.exists() ? (precapturaSnap.data() as Precaptura) : null;

    // 4. Fetch previous and existing settlements for these promotoras
    const promIds = plazaPromotoras.map(p => p.id);
    const prevSettlementsMap: Record<string, PromotoraSettlement> = {};
    const existingSettlementsMap: Record<string, PromotoraSettlement> = {};

    // Firestore `in` query is limited to 30 items, so fetch with Promise.all for each promotora doc ID
    await Promise.all(promIds.map(async (pId) => {
      const prevDocSnap = await getDoc(doc(db, 'promotoraSettlements', `${pId}_${prevWeekStr}`));
      if (prevDocSnap.exists()) {
        prevSettlementsMap[pId] = prevDocSnap.data() as PromotoraSettlement;
      }
      const curDocSnap = await getDoc(doc(db, 'promotoraSettlements', `${pId}_${weekDate}`));
      if (curDocSnap.exists()) {
        existingSettlementsMap[pId] = curDocSnap.data() as PromotoraSettlement;
      }
    }));

    // 5. Calculate and freeze settlements
    const batchOperations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    let sumDebe = 0;
    let sumCobrado = 0;
    let sumFalla = 0;
    let sumRecuperado = 0;
    let sumVenta = 0;

    plazaPromotoras.forEach(promotora => {
      const pId = promotora.id;
      const precapturaRow = precapturaData?.rows?.[pId];
      const prevSettlement = prevSettlementsMap[pId];
      const curSettlement = existingSettlementsMap[pId];

      const settlement = computePromotoraWeekMetrics({
        promotoraId: pId,
        promotoraName: promotora.name,
        targetWeekStr: weekDate,
        loans,
        loanPlans,
        config,
        prevSettlement,
        precapturaRow,
        savedSettlement: curSettlement,
      });

      const frozenSettlement: PromotoraSettlement = {
        ...settlement,
        isClosed: true,
        closedAt: nowIso,
        closedBy: username,
      };

      sumDebe += frozenSettlement.debeEntregar;
      sumCobrado += frozenSettlement.total;
      sumFalla += frozenSettlement.falla;
      sumRecuperado += frozenSettlement.recuperado;
      sumVenta += frozenSettlement.venta;

      const setRef = doc(db, 'promotoraSettlements', frozenSettlement.id);
      batchOperations.push((batch) => {
        batch.set(setRef, { ...frozenSettlement, updatedAt: nowIso }, { merge: true });
      });
    });

    // 6. If Precaptura exists, freeze it
    if (precapturaSnap.exists()) {
      batchOperations.push((batch) => {
        batch.update(precapturaRef, {
          isClosed: true,
          updatedAt: nowIso,
          updatedBy: username,
        });
      });
    }

    // 7. Update WeeklyClosure document
    const closureRef = doc(db, 'weeklyClosures', weekDate);
    const closureSnap = await getDoc(closureRef);
    const existingClosure = closureSnap.exists() ? (closureSnap.data() as WeeklyClosure) : null;

    const closedPlazaIds = Array.from(new Set([...(existingClosure?.closedPlazaIds || []), plazaId]));
    const allPlazasSnap = await getDocs(collection(db, 'plazas'));
    const totalCompanyPlazas = allPlazasSnap.size;
    const isGlobalClosed = closedPlazaIds.length >= totalCompanyPlazas;

    const plazaSummary: PlazaClosureSummary = {
      closedAt: nowIso,
      closedBy: username,
      totalPromotoras: plazaPromotoras.length,
      totalDebeEntregar: sumDebe,
      totalCobrado: sumCobrado,
      totalFalla: sumFalla,
      totalRecuperado: sumRecuperado,
      totalVenta: sumVenta,
    };

    const updatedPlazaClosures = {
      ...(existingClosure?.plazaClosures || {}),
      [plazaId]: plazaSummary,
    };

    const newClosureData: WeeklyClosure = {
      id: weekDate,
      weekDate,
      isGlobalClosed,
      closedPlazaIds,
      plazaClosures: updatedPlazaClosures,
      updatedAt: nowIso,
      updatedBy: username,
      ...(isGlobalClosed && !existingClosure?.globalClosedAt ? {
        globalClosedAt: nowIso,
        globalClosedBy: username,
      } : {}),
      createdAt: existingClosure?.createdAt || nowIso,
    };

    batchOperations.push((batch) => {
      batch.set(closureRef, newClosureData, { merge: true });
    });

    // Commit all operations safely
    await commitBatches(batchOperations);

    revalidatePath('/inicio/cierre-semanal');
    revalidatePath('/inicio/debes');
    revalidatePath('/inicio/precaptura');

    return { 
      success: true, 
      message: `Plaza cerrada exitosamente. ${plazaPromotoras.length} promotoras congeladas y guardadas.` 
    };
  } catch (err: any) {
    console.error('Error executing plaza closure:', err);
    return { success: false, message: err.message || 'Error al ejecutar el cierre de plaza.' };
  }
}

/**
 * Closes and freezes all plazas across the entire company in one click
 */
export async function executeGlobalClosureAction({
  weekDate,
  username
}: {
  weekDate: string;
  username: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const nowIso = new Date().toISOString();
    const prevWeekStr = getPreviousSaturdayStr(weekDate);

    // Fetch all structure
    const [plazasSnap, localidadesSnap, promotorasSnap, loansSnap, plansSnap, config] = await Promise.all([
      getDocs(collection(db, 'plazas')),
      getDocs(collection(db, 'localidades')),
      getDocs(collection(db, 'promotoras')),
      getDocs(collection(db, 'loans')),
      getDocs(collection(db, 'loanPlans')),
      getAppConfig()
    ]);

    const plazas = plazasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Plaza));
    const localidades = localidadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Localidad));
    const promotoras = promotorasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Promotora));
    const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
    const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));

    // Fetch all precapturas for this week
    const precapturasSnap = await getDocs(query(collection(db, 'precapturas'), where('weekDate', '==', weekDate)));
    const precapturasByPlaza: Record<string, Precaptura> = {};
    precapturasSnap.docs.forEach(d => {
      const data = d.data() as Precaptura;
      precapturasByPlaza[data.plazaId] = { ...data, id: d.id };
    });

    // Fetch previous settlements for all promotoras
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
    const plazaClosures: Record<string, PlazaClosureSummary> = {};

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
        const precapturaRow = precaptura?.rows?.[pId];
        const prevSettlement = prevSettlementsMap[pId];
        const curSettlement = curSettlementsMap[pId];

        const settlement = computePromotoraWeekMetrics({
          promotoraId: pId,
          promotoraName: promotora.name,
          targetWeekStr: weekDate,
          loans,
          loanPlans,
          config,
          prevSettlement,
          precapturaRow,
          savedSettlement: curSettlement,
        });

        const frozenSettlement: PromotoraSettlement = {
          ...settlement,
          isClosed: true,
          closedAt: nowIso,
          closedBy: username,
        };

        sumDebe += frozenSettlement.debeEntregar;
        sumCobrado += frozenSettlement.total;
        sumFalla += frozenSettlement.falla;
        sumRecuperado += frozenSettlement.recuperado;
        sumVenta += frozenSettlement.venta;

        const setRef = doc(db, 'promotoraSettlements', frozenSettlement.id);
        batchOperations.push((batch) => {
          batch.set(setRef, { ...frozenSettlement, updatedAt: nowIso }, { merge: true });
        });
      });

      plazaClosures[plaza.id] = {
        closedAt: nowIso,
        closedBy: username,
        totalPromotoras: pPromotoras.length,
        totalDebeEntregar: sumDebe,
        totalCobrado: sumCobrado,
        totalFalla: sumFalla,
        totalRecuperado: sumRecuperado,
        totalVenta: sumVenta,
      };

      if (precaptura) {
        const precapturaRef = doc(db, 'precapturas', precaptura.id);
        batchOperations.push((batch) => {
          batch.update(precapturaRef, {
            isClosed: true,
            updatedAt: nowIso,
            updatedBy: username,
          });
        });
      }
    });

    // Update global weekly closure document
    const closureRef = doc(db, 'weeklyClosures', weekDate);
    const closureData: WeeklyClosure = {
      id: weekDate,
      weekDate,
      isGlobalClosed: true,
      closedPlazaIds: plazas.map(p => p.id),
      plazaClosures,
      globalClosedAt: nowIso,
      globalClosedBy: username,
      updatedAt: nowIso,
      updatedBy: username,
      createdAt: nowIso,
    };

    batchOperations.push((batch) => {
      batch.set(closureRef, closureData, { merge: true });
    });

    await commitBatches(batchOperations);

    revalidatePath('/inicio/cierre-semanal');
    revalidatePath('/inicio/debes');
    revalidatePath('/inicio/precaptura');

    return { 
      success: true, 
      message: `Semana cerrada globalmente. ${promotoras.length} promotoras congeladas en ${plazas.length} plazas.` 
    };
  } catch (err: any) {
    console.error('Error executing global closure:', err);
    return { success: false, message: err.message || 'Error al ejecutar el cierre global.' };
  }
}

/**
 * Reopens a closed Plaza for a specific week and recalculates metrics from live loans
 */
export async function reopenPlazaClosureAction({
  plazaId,
  weekDate,
  username
}: {
  plazaId: string;
  weekDate: string;
  username: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const nowIso = new Date().toISOString();
    const prevWeekStr = getPreviousSaturdayStr(weekDate);

    // 1. Fetch Localidades of this plaza
    const localidadesSnap = await getDocs(query(collection(db, 'localidades'), where('plazaId', '==', plazaId)));
    const locIds = localidadesSnap.docs.map(d => d.id);
    const [promotorasSnap, loansSnap, plansSnap, config] = await Promise.all([
      getDocs(collection(db, 'promotoras')),
      getDocs(collection(db, 'loans')),
      getDocs(collection(db, 'loanPlans')),
      getAppConfig()
    ]);
    const plazaPromotoras = promotorasSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Promotora))
      .filter(p => locIds.includes(p.localidadId));

    const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
    const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));

    const precapturaRef = doc(db, 'precapturas', `${plazaId}_${weekDate}`);
    const precapturaSnap = await getDoc(precapturaRef);
    const precapturaData = precapturaSnap.exists() ? (precapturaSnap.data() as Precaptura) : null;

    const promIds = plazaPromotoras.map(p => p.id);
    const prevSettlementsMap: Record<string, PromotoraSettlement> = {};
    const existingSettlementsMap: Record<string, PromotoraSettlement> = {};

    await Promise.all(promIds.map(async (pId) => {
      const prevDocSnap = await getDoc(doc(db, 'promotoraSettlements', `${pId}_${prevWeekStr}`));
      if (prevDocSnap.exists()) {
        prevSettlementsMap[pId] = prevDocSnap.data() as PromotoraSettlement;
      }
      const curDocSnap = await getDoc(doc(db, 'promotoraSettlements', `${pId}_${weekDate}`));
      if (curDocSnap.exists()) {
        existingSettlementsMap[pId] = curDocSnap.data() as PromotoraSettlement;
      }
    }));

    const batchOperations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    let sumDebe = 0;
    let sumCobrado = 0;
    let sumFalla = 0;
    let sumRecuperado = 0;
    let sumVenta = 0;

    plazaPromotoras.forEach(promotora => {
      const pId = promotora.id;
      const rawPrecapturaRow = precapturaData?.rows?.[pId];
      const precapturaRow = rawPrecapturaRow ? { ...rawPrecapturaRow, falla: undefined } : undefined;
      const prevSettlement = prevSettlementsMap[pId];
      const curSettlement = existingSettlementsMap[pId];

      const settlement = computePromotoraWeekMetrics({
        promotoraId: pId,
        promotoraName: promotora.name,
        targetWeekStr: weekDate,
        loans,
        loanPlans,
        config,
        prevSettlement,
        precapturaRow,
        savedSettlement: curSettlement,
      });

      const updatedSettlement: PromotoraSettlement = {
        ...curSettlement,
        ...settlement,
        isClosed: false,
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

      if (precapturaSnap.exists() && rawPrecapturaRow) {
        batchOperations.push((batch) => {
          batch.update(precapturaRef, {
            [`rows.${pId}.falla`]: updatedSettlement.falla,
            [`rows.${pId}.efectivo`]: updatedSettlement.efectivo,
            [`rows.${pId}.totalEntregar`]: updatedSettlement.total,
            [`rows.${pId}.diferencia`]: updatedSettlement.diferencia,
          });
        });
      }
    });

    // Mark Precaptura isClosed = false
    if (precapturaSnap.exists()) {
      batchOperations.push((batch) => {
        batch.update(precapturaRef, {
          isClosed: false,
          updatedAt: nowIso,
          updatedBy: username,
        });
      });
    }

    // Update WeeklyClosure doc
    const closureRef = doc(db, 'weeklyClosures', weekDate);
    const closureSnap = await getDoc(closureRef);
    if (closureSnap.exists()) {
      const closureData = closureSnap.data() as WeeklyClosure;
      const nextClosedPlazas = (closureData.closedPlazaIds || []).filter(id => id !== plazaId);
      const nextPlazaClosures = { ...(closureData.plazaClosures || {}) };
      
      nextPlazaClosures[plazaId] = {
        totalPromotoras: plazaPromotoras.length,
        totalDebeEntregar: sumDebe,
        totalCobrado: sumCobrado,
        totalFalla: sumFalla,
        totalRecuperado: sumRecuperado,
        totalVenta: sumVenta,
      };

      batchOperations.push((batch) => {
        batch.set(closureRef, cleanFirestoreData({
          ...closureData,
          isGlobalClosed: false,
          closedPlazaIds: nextClosedPlazas,
          plazaClosures: nextPlazaClosures,
          updatedAt: nowIso,
          updatedBy: username,
        }), { merge: true });
      });
    }

    await commitBatches(batchOperations);

    revalidatePath('/inicio/cierre-semanal');
    revalidatePath('/inicio/debes');
    revalidatePath('/inicio/resumen');
    revalidatePath('/inicio/precaptura');

    return { success: true, message: 'Plaza reabierta y sincronizada exitosamente con los préstamos actuales.' };
  } catch (err: any) {
    console.error('Error reopening plaza closure:', err);
    return { success: false, message: err.message || 'Error al reabrir la plaza.' };
  }
}

/**
 * Reopens an entire week globally across all plazas and recalculates metrics from live loans
 */
export async function reopenGlobalClosureAction({
  weekDate,
  username
}: {
  weekDate: string;
  username: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const nowIso = new Date().toISOString();
    const prevWeekStr = getPreviousSaturdayStr(weekDate);

    // Fetch all structure
    const [plazasSnap, localidadesSnap, promotorasSnap, loansSnap, plansSnap, config] = await Promise.all([
      getDocs(collection(db, 'plazas')),
      getDocs(collection(db, 'localidades')),
      getDocs(collection(db, 'promotoras')),
      getDocs(collection(db, 'loans')),
      getDocs(collection(db, 'loanPlans')),
      getAppConfig()
    ]);

    const plazas = plazasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Plaza));
    const localidades = localidadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Localidad));
    const promotoras = promotorasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Promotora));
    const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
    const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));

    // Fetch all precapturas for this week
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
    const plazaClosures: Record<string, PlazaClosureSummary> = {};

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
        const precapturaRow = rawPrecapturaRow ? { ...rawPrecapturaRow, falla: undefined } : undefined;
        const prevSettlement = prevSettlementsMap[pId];
        const curSettlement = curSettlementsMap[pId];

        const settlement = computePromotoraWeekMetrics({
          promotoraId: pId,
          promotoraName: promotora.name,
          targetWeekStr: weekDate,
          loans,
          loanPlans,
          config,
          prevSettlement,
          precapturaRow,
          savedSettlement: curSettlement,
        });

        const updatedSettlement: PromotoraSettlement = {
          ...curSettlement,
          ...settlement,
          isClosed: false,
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
          batchOperations.push((batch) => {
            batch.update(doc(db, 'precapturas', precaptura.id), {
              [`rows.${pId}.falla`]: updatedSettlement.falla,
              [`rows.${pId}.efectivo`]: updatedSettlement.efectivo,
              [`rows.${pId}.totalEntregar`]: updatedSettlement.total,
              [`rows.${pId}.diferencia`]: updatedSettlement.diferencia,
            });
          });
        }
      });

      plazaClosures[plaza.id] = {
        totalPromotoras: pPromotoras.length,
        totalDebeEntregar: sumDebe,
        totalCobrado: sumCobrado,
        totalFalla: sumFalla,
        totalRecuperado: sumRecuperado,
        totalVenta: sumVenta,
      };

      if (precaptura) {
        batchOperations.push((batch) => {
          batch.update(doc(db, 'precapturas', precaptura.id), {
            isClosed: false,
            updatedAt: nowIso,
            updatedBy: username,
          });
        });
      }
    });

    // Update global weekly closure document
    const closureRef = doc(db, 'weeklyClosures', weekDate);
    const closureData: WeeklyClosure = {
      id: weekDate,
      weekDate,
      isGlobalClosed: false,
      closedPlazaIds: [],
      plazaClosures,
      updatedAt: nowIso,
      updatedBy: username,
      createdAt: nowIso,
    };

    batchOperations.push((batch) => {
      batch.set(closureRef, cleanFirestoreData(closureData), { merge: true });
    });

    await commitBatches(batchOperations);

    revalidatePath('/inicio/cierre-semanal');
    revalidatePath('/inicio/debes');
    revalidatePath('/inicio/resumen');
    revalidatePath('/inicio/precaptura');

    return { 
      success: true, 
      message: 'La semana fue reabierta y sincronizada globalmente en todas las plazas con los préstamos actuales.' 
    };
  } catch (err: any) {
    console.error('Error reopening global closure:', err);
    return { success: false, message: err.message || 'Error al reabrir la semana globalmente.' };
  }
}

/**
 * Recalcula y sincroniza todos los valores de una semana desde los préstamos en vivo
 * sin alterar el estado de apertura/cierre de las plazas.
 */
export async function recalculateWeekAction({
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
        const precapturaRow = rawPrecapturaRow ? { ...rawPrecapturaRow, falla: undefined } : undefined;
        const prevSettlement = prevSettlementsMap[pId];
        const curSettlement = curSettlementsMap[pId];

        const settlement = computePromotoraWeekMetrics({
          promotoraId: pId,
          promotoraName: promotora.name,
          targetWeekStr: weekDate,
          loans,
          loanPlans,
          config,
          prevSettlement,
          precapturaRow,
          savedSettlement: curSettlement,
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
          batchOperations.push((batch) => {
            batch.update(doc(db, 'precapturas', precaptura.id), {
              [`rows.${pId}.falla`]: updatedSettlement.falla,
              [`rows.${pId}.efectivo`]: updatedSettlement.efectivo,
              [`rows.${pId}.totalEntregar`]: updatedSettlement.total,
              [`rows.${pId}.diferencia`]: updatedSettlement.diferencia,
            });
          });
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

    if (closureSnap.exists()) {
      batchOperations.push((batch) => {
        batch.update(closureSnap.ref, {
          plazaClosures,
          updatedAt: nowIso,
          updatedBy: username,
        });
      });
    }

    await commitBatches(batchOperations);

    revalidatePath('/inicio/cierre-semanal');
    revalidatePath('/inicio/debes');
    revalidatePath('/inicio/resumen');
    revalidatePath('/inicio/precaptura');

    return { 
      success: true, 
      message: 'Semana recalculada y sincronizada exitosamente con los préstamos actuales.' 
    };
  } catch (err: any) {
    console.error('Error recalculating week:', err);
    return { success: false, message: err.message || 'Error al recalcular la semana.' };
  }
}
