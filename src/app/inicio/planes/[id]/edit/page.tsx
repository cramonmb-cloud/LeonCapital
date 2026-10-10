import { notFound } from 'next/navigation';
import { PlanForm } from '@/components/plan-form';
import { getLoanPlan } from '@/lib/firestore-data';

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getLoanPlan(id);

  if (!plan) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Editar Plan de Préstamo</h1>
      <PlanForm plan={plan} />
    </div>
  );
}
