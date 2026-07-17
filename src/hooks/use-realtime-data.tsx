'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, QuerySnapshot, DocumentData, Timestamp, Query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Loan, Client, LoanPlan, Plaza, Localidad, Promotora, AppUser, AppConfig, PromotoraSettlement } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface RealtimeData {
    loans: Loan[];
    clients: Client[];
    loanPlans: LoanPlan[];
    plazas: Plaza[];
    localidades: Localidad[];
    promotoras: Promotora[];
    promotoraSettlements: PromotoraSettlement[];
    users: AppUser[];
    config: AppConfig | null;
}

function processSnapshot<T>(snapshot: QuerySnapshot<DocumentData, DocumentData>): T[] {
    return snapshot.docs.map(doc => {
        const data = doc.data();
        for (const key in data) {
            if (data[key] && typeof data[key] === 'object') {
                if (typeof data[key].toDate === 'function') {
                    data[key] = data[key].toDate().toISOString();
                } else if (typeof data[key].seconds === 'number') {
                    data[key] = new Date(data[key].seconds * 1000).toISOString();
                }
            }
            if (key === 'payments' && Array.isArray(data[key])) {
                data[key] = data[key].map((p: any) => {
                    if (p.date && typeof p.date === 'object') {
                        if (typeof p.date.toDate === 'function') {
                            return { ...p, date: p.date.toDate().toISOString() };
                        } else if (typeof p.date.seconds === 'number') {
                            return { ...p, date: new Date(p.date.seconds * 1000).toISOString() };
                        }
                    }
                    return p;
                });
            }
        }
        return { id: doc.id, ...data } as T;
    });
}

const initialData: RealtimeData = {
    loans: [],
    clients: [],
    loanPlans: [],
    plazas: [],
    localidades: [],
    promotoras: [],
    promotoraSettlements: [],
    users: [],
    config: null,
};

export interface UseRealtimeDataOptions {
    enabledCollections?: Array<keyof RealtimeData>;
    queries?: Partial<Record<keyof RealtimeData, Query<DocumentData, DocumentData>>>;
    deps?: any[];
}

export function useRealtimeData(
    initialProps?: Partial<RealtimeData>,
    options?: UseRealtimeDataOptions
) {
  const [data, setData] = useState<RealtimeData>(() => ({
    ...initialData,
    ...initialProps
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // We serialize the enabledCollections and query keys to use in the useEffect dependency array
  const enabledCollectionsSerialized = options?.enabledCollections?.join(',') || '';
  const queryKeysSerialized = options?.queries ? Object.keys(options.queries).join(',') : '';
  const depsSerialized = JSON.stringify(options?.deps || []);

  useEffect(() => {
    const baseCollections = {
        loans: collection(db, 'loans'),
        clients: collection(db, 'clients'),
        loanPlans: collection(db, 'loanPlans'),
        plazas: collection(db, 'plazas'),
        localidades: collection(db, 'localidades'),
        promotoras: collection(db, 'promotoras'),
        promotoraSettlements: collection(db, 'promotoraSettlements'),
        users: collection(db, 'users'),
        config: collection(db, 'config'),
    };

    const enabled = options?.enabledCollections || (Object.keys(baseCollections) as Array<keyof RealtimeData>);

    const unsubscribers = Object.entries(baseCollections)
      .filter(([key]) => enabled.includes(key as keyof RealtimeData))
      .map(([key, defaultCollRef]) => {
        const collRef = (options?.queries?.[key as keyof RealtimeData]) || defaultCollRef;
        return onSnapshot(collRef, 
          (snapshot) => {
              setData(prevData => {
                  const newData = { ...prevData };
                  if (key === 'loans') newData.loans = processSnapshot<Loan>(snapshot);
                  if (key === 'clients') newData.clients = processSnapshot<Client>(snapshot);
                  if (key === 'loanPlans') newData.loanPlans = processSnapshot<LoanPlan>(snapshot);
                  if (key === 'plazas') newData.plazas = processSnapshot<Plaza>(snapshot);
                  if (key === 'localidades') newData.localidades = processSnapshot<Localidad>(snapshot);
                  if (key === 'promotoras') newData.promotoras = processSnapshot<Promotora>(snapshot);
                  if (key === 'promotoraSettlements') newData.promotoraSettlements = processSnapshot<PromotoraSettlement>(snapshot);
                  if (key === 'users') newData.users = processSnapshot<AppUser>(snapshot);
                  if (key === 'config') {
                      const configDoc = snapshot.docs.find(doc => doc.id === 'main');
                      newData.config = configDoc ? configDoc.data() as AppConfig : null;
                  }
                  return newData;
              });
              setLoading(false);
          },
          async (err) => {
            const path = 'path' in collRef ? (collRef as any).path : `${key} (query)`;
            const permissionError = new FirestorePermissionError({
              path: path,
              operation: 'list',
            } satisfies SecurityRuleContext);
            
            errorEmitter.emit('permission-error', permissionError);
            setError(permissionError);
            setLoading(false);
          }
        );
      });

    if (unsubscribers.length === 0) {
      setLoading(false);
    }

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [enabledCollectionsSerialized, queryKeysSerialized, depsSerialized]);

  return { data, loading, error };
}

