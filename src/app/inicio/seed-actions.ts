'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { clients, loanPlans, loans, plazas, localidades, promotoras } from '@/lib/data';
import { writeBatch, doc, collection } from 'firebase/firestore';

export async function seedDatabaseAction() {
  try {
    const batch = writeBatch(db);

    // Seed clients
    const clientsCol = collection(db, 'clients');
    clients.forEach((client) => {
      const { id, ...clientData } = client;
      const docRef = doc(clientsCol, id);
      batch.set(docRef, clientData);
    });

    // Seed loan plans
    const plansCol = collection(db, 'loanPlans');
    loanPlans.forEach((plan) => {
      const { id, ...planData } = plan;
      const docRef = doc(plansCol, id);
      batch.set(docRef, planData);
    });

    // Seed plazas
    const plazasCol = collection(db, 'plazas');
    plazas.forEach((plaza) => {
      const { id, ...plazaData } = plaza;
      const docRef = doc(plazasCol, id);
      batch.set(docRef, plazaData);
    });

    // Seed localidades
    const localidadesCol = collection(db, 'localidades');
    localidades.forEach((localidad) => {
        const { id, ...localidadData } = localidad;
        const docRef = doc(localidadesCol, id);
        batch.set(docRef, localidadData);
    });

    // Seed promotoras
    const promotorasCol = collection(db, 'promotoras');
    promotoras.forEach((promotora) => {
        const { id, ...promotoraData } = promotora;
        const docRef = doc(promotorasCol, id);
        batch.set(docRef, promotoraData);
    });

    // Seed loans
    const loansCol = collection(db, 'loans');
    loans.forEach((loan) => {
      const { id, startDate, ...loanData } = loan;
      const docRef = doc(loansCol, id);
      batch.set(docRef, {
        ...loanData,
        startDate: new Date(startDate) // Store as Firestore Timestamp
      });
    });

    await batch.commit();
    
    // Revalidate all dashboard paths
    revalidatePath('/inicio', 'layout');

    return { success: true, message: 'La base de datos ha sido poblada con éxito.' };
  } catch (error: any) {
    console.error('Error seeding database:', error);
    return { success: false, message: `Error al poblar la base de datos: ${error.message}` };
  }
}
