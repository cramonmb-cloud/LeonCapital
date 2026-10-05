import { getClients, getWallet, getWalletTransactions, getUsers } from "@/lib/firestore-data";
import { BitacoraClientPage } from "@/components/bitacora-client-page";

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
    const [wallet, transactions, clients, users] = await Promise.all([
        getWallet(),
        getWalletTransactions(),
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

