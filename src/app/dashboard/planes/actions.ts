'use server';

import { doc, deleteDoc, setDoc, addDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { revalidatePath } from 'next/cache';
import type { LoanPlan } from '@/lib/types';

export async function deleteLoanPlanAction(planId: string) {
  if (!planId) {
    return { success: false, message: 'ID de plan no proporcionado.' };
  }

  try {
    const planRef = doc(db, 'loanPlans', planId);
    await deleteDoc(planRef);

    revalidatePath('/dashboard/planes');
    revalidatePath('/dashboard/ajustes');
    revalidatePath('/dashboard/control');
    revalidatePath('/dashboard/prestamos');
    
    return { success: true, message: 'Plan eliminado con éxito.' };
  } catch (error: any) {
    console.error('Error deleting loan plan:', error);
    return { success: false, message: `Error al eliminar el plan: ${error.message}` };
  }
}

export async function saveLoanPlanAction(planData: Omit<LoanPlan, 'id'>, planId?: string) {
    try {
        let savedDocId = planId;

        if (planId) {
            // Update existing plan
            const planRef = doc(db, 'loanPlans', planId);
            await setDoc(planRef, planData, { merge: true });
        } else {
            // Create new plan
            const newDoc = await addDoc(collection(db, 'loanPlans'), planData);
            savedDocId = newDoc.id;
        }

        // Si este plan fue marcado como predeterminado, desmarcar cualquier otro plan existente
        if (planData.isDefault && savedDocId) {
            const plansSnap = await getDocs(collection(db, 'loanPlans'));
            const batch = writeBatch(db);
            let hasUpdates = false;

            plansSnap.forEach((planDoc) => {
                if (planDoc.id !== savedDocId && planDoc.data().isDefault) {
                    batch.update(planDoc.ref, { isDefault: false });
                    hasUpdates = true;
                }
            });

            if (hasUpdates) {
                await batch.commit();
            }
        }

        revalidatePath('/dashboard/planes');
        revalidatePath('/dashboard/ajustes');
        revalidatePath('/dashboard/control');
        revalidatePath('/dashboard/prestamos');
        if (planId) {
            revalidatePath(`/dashboard/planes/${planId}/edit`);
        }

        return { success: true, message: `Plan "${planData.name}" guardado con éxito.` };
    } catch (error: any) {
        console.error('Error saving loan plan:', error);
        return { success: false, message: `Error al guardar el plan: ${error.message}` };
    }
}

export async function setDefaultLoanPlanAction(targetPlanId: string) {
  if (!targetPlanId) {
    return { success: false, message: 'ID de plan no proporcionado.' };
  }

  try {
    const plansSnap = await getDocs(collection(db, 'loanPlans'));
    const batch = writeBatch(db);
    let targetFound = false;

    plansSnap.forEach((planDoc) => {
      const isTarget = planDoc.id === targetPlanId;
      const data = planDoc.data();
      if (isTarget) {
        targetFound = true;
        batch.update(planDoc.ref, { isDefault: true });
      } else if (data.isDefault) {
        batch.update(planDoc.ref, { isDefault: false });
      }
    });

    if (!targetFound) {
      return { success: false, message: 'El plan especificado no existe.' };
    }

    await batch.commit();

    revalidatePath('/dashboard/planes');
    revalidatePath('/dashboard/ajustes');
    revalidatePath('/dashboard/control');
    revalidatePath('/dashboard/prestamos');

    return { success: true, message: 'Plan establecido como predeterminado para nuevos préstamos.' };
  } catch (error: any) {
    console.error('Error setting default loan plan:', error);
    return { success: false, message: `Error al establecer plan predeterminado: ${error.message}` };
  }
}

