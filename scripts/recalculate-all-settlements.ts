import { db } from '../src/lib/firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  writeBatch 
} from 'firebase/firestore';
import type { 
  Loan, 
  LoanPlan, 
  Promotora, 
  Localidad, 
  Plaza, 
  PromotoraSettlement, 
  WeeklyClosure, 
  Precaptura, 
  AppConfig 
} from '../src/lib/types';
import { computePromotoraWeekMetrics, getPreviousSaturdayStr } from '../src/lib/settlement-calculator';

async function recalculateAll() {
  console.log('Fetching collections from Firestore...');
  const [
    settlementsSnap,
    closuresSnap,
    loansSnap,
    plansSnap,
    promotorasSnap,
    localidadesSnap,
    plazasSnap,
    precapturasSnap,
    configSnap
  ] = await Promise.all([
    getDocs(collection(db, 'promotoraSettlements')),
    getDocs(collection(db, 'weeklyClosures')),
    getDocs(collection(db, 'loans')),
    getDocs(collection(db, 'loanPlans')),
    getDocs(collection(db, 'promotoras')),
    getDocs(collection(db, 'localidades')),
    getDocs(collection(db, 'plazas')),
    getDocs(collection(db, 'precapturas')),
    getDoc(doc(db, 'app_config', 'global'))
  ]);

  const loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
  const loanPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanPlan));
  const promotoras = promotorasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Promotora));
  const localidades = localidadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Localidad));
  const plazas = plazasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Plaza));
  const config = configSnap.exists() ? (configSnap.data() as AppConfig) : null;

  const precapturasMap = new Map<string, Precaptura>();
  precapturasSnap.forEach(d => precapturasMap.set(d.id, d.data() as Precaptura));

  const promMap = new Map<string, Promotora>();
  promotoras.forEach(p => promMap.set(p.id, p));

  const locMap = new Map<string, Localidad>();
  localidades.forEach(l => locMap.set(l.id, l));

  const promPlazaMap = new Map<string, string>();
  promotoras.forEach(p => {
    const loc = locMap.get(p.localidadId);
    if (loc) promPlazaMap.set(p.id, loc.plazaId);
  });

  const settlements = settlementsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PromotoraSettlement));
  const allSettlementsMap = new Map<string, PromotoraSettlement>();
  settlements.forEach(s => allSettlementsMap.set(s.id, s));

  // Sort weeks chronologically
  const weeks = Array.from(new Set(settlements.map(s => s.weekDate).filter(Boolean)))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  console.log(`Processing ${settlements.length} settlements across ${weeks.length} weeks:`, weeks);

  const updatedSettlements: PromotoraSettlement[] = [];

  for (const weekDate of weeks) {
    const weekSettlements = settlements.filter(s => s.weekDate === weekDate);
    const prevWeekStr = getPreviousSaturdayStr(weekDate);

    for (const curS of weekSettlements) {
      const pId = curS.promotoraId;
      if (!pId) continue;

      const prom = promMap.get(pId);
      const promName = prom ? prom.name : (curS as any).promotoraName || 'Promotora';

      const plazaId = promPlazaMap.get(pId);
      const precapturaKey = plazaId ? `${plazaId}_${weekDate}` : null;
      const precaptura = precapturaKey ? precapturasMap.get(precapturaKey) : null;
      const precapturaRow = precaptura?.rows?.[pId];

      const prevS = allSettlementsMap.get(`${pId}_${prevWeekStr}`);

      const computed = computePromotoraWeekMetrics({
        promotoraId: pId,
        promotoraName: promName,
        targetWeekStr: weekDate,
        loans,
        loanPlans,
        config,
        prevSettlement: prevS,
        precapturaRow,
        savedSettlement: curS,
      });

      const updated: any = {
        ...curS,
        ...computed,
        isClosed: curS.isClosed ?? false,
        updatedAt: new Date().toISOString(),
      };
      if (curS.closedAt) updated.closedAt = curS.closedAt;
      if (curS.closedBy) updated.closedBy = curS.closedBy;

      // Clean undefined keys so Firestore doesn't error
      Object.keys(updated).forEach(key => {
        if (updated[key] === undefined) {
          delete updated[key];
        }
      });

      allSettlementsMap.set(curS.id, updated);
      updatedSettlements.push(updated);
    }
  }

  console.log(`Computed all ${updatedSettlements.length} settlements.`);

  // Commit updated settlements in batches of 250
  const CHUNK_SIZE = 250;
  for (let i = 0; i < updatedSettlements.length; i += CHUNK_SIZE) {
    const chunk = updatedSettlements.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(s => {
      const sRef = doc(db, 'promotoraSettlements', s.id);
      batch.set(sRef, s, { merge: true });
    });
    await batch.commit();
    console.log(`Saved batch ${i / CHUNK_SIZE + 1} (${chunk.length} settlements).`);
  }

  // Update weeklyClosures
  console.log(`Updating ${closuresSnap.size} weeklyClosures documents...`);
  for (const cDoc of closuresSnap.docs) {
    const closure = cDoc.data() as WeeklyClosure;
    const cWeekDate = closure.weekDate || cDoc.id;
    const plazaClosures = closure.plazaClosures || {};
    const updatedPlazaClosures: Record<string, any> = {};

    for (const plazaId of Object.keys(plazaClosures)) {
      const plazaProms = promotoras.filter(p => promPlazaMap.get(p.id) === plazaId);
      let sumDebe = 0;
      let sumCobrado = 0;
      let sumFalla = 0;
      let sumRecuperado = 0;
      let sumVenta = 0;

      plazaProms.forEach(p => {
        const s = allSettlementsMap.get(`${p.id}_${cWeekDate}`);
        if (s) {
          sumDebe += Number(s.debeEntregar) || 0;
          sumCobrado += Number(s.total) || 0;
          sumFalla += Number(s.falla) || 0;
          sumRecuperado += Number(s.recuperado) || 0;
          sumVenta += Number(s.venta) || 0;
        }
      });

      updatedPlazaClosures[plazaId] = {
        ...plazaClosures[plazaId],
        totalDebeEntregar: sumDebe,
        totalCobrado: sumCobrado,
        totalFalla: sumFalla,
        totalRecuperado: sumRecuperado,
        totalVenta: sumVenta,
      };
    }

    const cRef = doc(db, 'weeklyClosures', cDoc.id);
    const batch = writeBatch(db);
    batch.update(cRef, {
      plazaClosures: updatedPlazaClosures,
      updatedAt: new Date().toISOString(),
    });
    await batch.commit();
    console.log(`Updated weeklyClosure ${cDoc.id}:`, JSON.stringify(updatedPlazaClosures, null, 2));
  }

  // Verify Colaboradores specifically
  const colab17 = allSettlementsMap.get('FlHclEpRrOdaQPsBwq3n_2026-10-17');
  const colab24 = allSettlementsMap.get('FlHclEpRrOdaQPsBwq3n_2026-10-24');
  console.log('COLABORADORES 2026-10-17:', {
    debe: colab17?.debeEntregar,
    falla: colab17?.falla,
    efectivo: colab17?.efectivo,
    total: colab17?.total,
    deuda: colab17?.deuda,
  });
  console.log('COLABORADORES 2026-10-24:', {
    debe: colab24?.debeEntregar,
    falla: colab24?.falla,
    efectivo: colab24?.efectivo,
    total: colab24?.total,
    deuda: colab24?.deuda,
  });

  console.log('Finished recalculating all settlements successfully!');
}

recalculateAll().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
