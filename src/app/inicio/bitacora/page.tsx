import { getClients, getWallet, getWalletTransactions, getUsers } from "@/lib/firestore-data";
import { BitacoraClientPage } from "@/components/bitacora-client-page";

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
    // Consultar únicamente los movimientos de los últimos 4 meses para carga ultrarrápida
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 4);
    cutoffDate.setHours(0, 0, 0, 0);

    const [wallet, transactions, clients, users] = await Promise.all([
        getWallet(),
        getWalletTransactions(cutoffDate),
        getClients(),
        getUsers(),
    ]);

    return (
        <BitacoraClientPage 
            wallet={wallet} 
            transactions={transactions} 
            clients={clients} 
            users={users} 
        />
    );
}

