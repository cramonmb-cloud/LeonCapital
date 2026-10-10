import { getClients, getLoanPlans, getActiveLoans, getPlazas, getLocalidades, getPromotoras, getAppConfig } from '@/lib/firestore-data';
import type { Client, Loan, LoanPlan, Plaza, Localidad, Promotora } from '@/lib/types';
import { OverduePortfolioClientPage } from '@/components/overdue-portfolio-client-page';
import { getCurrentLoanWeekNumber, getExtraWeekThreshold } from '@/lib/utils';

export type OverdueLoanDetails = {
    loan: Loan;
    client: Client;
    loanPlan: LoanPlan;
    amountDue: number; // TOTAL FINAL
    baseArrears: number; // Solo Fallos base
    penaltyArrear: number; // Solo S. Extra
    missedPayments: number;
    hasPenalty: boolean;
    hierarchy: {
        plazaId: string;
        plazaName: string;
        localidadId: string;
        localidadName: string;
        promotoraId: string;
        promotoraName: string;
    };
};

export default async function CarteraVencidaPage() {
    const [loans, clients, loanPlans, plazas, localidades, promotoras, config] = await Promise.all([
        getActiveLoans(),
        getClients(),
        getLoanPlans(),
        getPlazas(),
        getLocalidades(),
        getPromotoras(),
        getAppConfig(),
    ]);

    const penaltyThreshold = getExtraWeekThreshold(config);

    const overdueLoansDetails: OverdueLoanDetails[] = loans
        .filter(loan => loan.status !== 'Paid Off' && loan.status !== 'Pagado desde CV')
        .map(loan => {
            const client = clients.find(c => c.id === loan.clientId);
            const loanPlan = loanPlans.find(p => p.id === loan.loanPlanId);
            const promotora = promotoras.find(p => p.id === loan.promotoraId);
            const localidad = localidades.find(l => l.id === promotora?.localidadId);
            const plaza = plazas.find(p => p.id === localidad?.plazaId);

            if (!client || !loanPlan) return null;

            const weeklyPayment = (loan.amount / 1000) * loanPlan.weeklyPaymentRate;
            const baseTerm = loanPlan.termInWeeks;
            const currentLoanWeek = Math.max(1, getCurrentLoanWeekNumber(loan.startDate));
            const isExpired = currentLoanWeek > baseTerm;

            // CARTERA VENCIDA: Solo préstamos expirados (superan plazo base)
            if (!isExpired) return null;

            const currentPayments = loan.payments || [];
            const actualTotalPaid = currentPayments.reduce((acc, p) => acc + p.amount, 0);
            
            let missedCount = 0;
            let totalPaidInBaseTerm = 0;
            for (let i = 1; i <= baseTerm; i++) {
                const p = currentPayments.find(pay => pay.weekNumber === i);
                if (p && !p.isReverted) {
                    totalPaidInBaseTerm += p.amount;
                    if (p.amount < weeklyPayment || p.isRecovered || p.paymentType === 'recovered') missedCount++;
                } else {
                    missedCount++;
                }
            }

            // REGLA DINÁMICA: Penalización según umbral de fallos configurado o venció debiendo del base
            const hasPenalty = loan.hasPenalty || (missedCount >= penaltyThreshold) || (isExpired && totalPaidInBaseTerm < (baseTerm * weeklyPayment));
            
            const totalExpected = (baseTerm + (hasPenalty ? 1 : 0)) * weeklyPayment;
            const totalDue = Math.max(0, totalExpected - actualTotalPaid);

            // Si ya no debe nada, no sale en Cartera Vencida
            if (totalDue <= 0) return null;

            const baseArrears = Math.max(0, (baseTerm * weeklyPayment) - totalPaidInBaseTerm);
            const penaltyArrear = totalDue - baseArrears;

            return {
                loan,
                client,
                loanPlan,
                amountDue: totalDue,
                baseArrears,
                penaltyArrear,
                missedPayments: missedCount,
                hasPenalty: hasPenalty,
                hierarchy: {
                    plazaId: plaza?.id || 'N/A',
                    plazaName: plaza?.name || 'N/A',
                    localidadId: localidad?.id || 'N/A',
                    localidadName: localidad?.name || 'N/A',
                    promotoraId: promotora?.id || 'N/A',
                    promotoraName: promotora?.name || 'N/A',
                }
            };
        })
        .filter((details): details is OverdueLoanDetails => details !== null);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-red-700 uppercase">Cartera Vencida</h1>
            </div>
            <OverduePortfolioClientPage 
                initialOverdueLoans={overdueLoansDetails}
                clients={clients}
                loanPlans={loanPlans}
                plazas={plazas}
                localidades={localidades}
                promotoras={promotoras}
                title="Cartera Vencida"
            />
        </div>
    );
}