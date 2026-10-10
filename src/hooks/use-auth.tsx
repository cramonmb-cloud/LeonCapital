'use client';

import * as React from 'react';
import { useState, useEffect, createContext, useContext } from 'react';
import { auth, db } from '@/lib/firebase';
import { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  type User 
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { saveUserAction } from '@/app/inicio/ajustes/actions';
import type { AppUser, UserPermissions } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  signUp: (email: string, password: string, role: 'admin' | 'supervisor', username: string, permissions: AppUser['permissions']) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);

        unsubscribeDoc = onSnapshot(userDocRef, async (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.data();
            
            // Check for remote force logout request
            if (userData?.forceLogout) {
              try {
                // Reset the flag before signing out while still authenticated
                await updateDoc(userDocRef, { forceLogout: false });
              } catch (err) {
                console.error("Error resetting forceLogout flag:", err);
              }
              firebaseSignOut(auth).then(() => {
                router.push('/login');
              });
              return;
            }

            setAppUser({ id: snapshot.id, ...userData } as AppUser);
            setLoading(false);
          } else {
            // User doc doesn't exist, create it
            const username = firebaseUser.email?.split('@')[0] || 'admin';
            const defaultAdminPermissions: UserPermissions = {
              dashboard: true,
              clients: true,
              consultarCliente: true,
              loans: true,
              overduePortfolio: true,
              carteraVencida: true,
              wallet: true,
              plans: true,
              settings: true,
              editClients: true,
              control: true,
              debes: true,
              imprenta: true,
              avales: true,
              manageUsers: true,
              manageZones: true,
              manageMigration: true,
              managePlans: true,
              manageSystem: true,
              manageMaintenance: true,
              manageAvisos: true,
              managePersonal: true,
              showMobileNavBar: true,
              mobileSections: ['dashboard', 'loans', 'overduePortfolio', 'wallet', 'consultarCliente']
            };
            const newAppUser: Omit<AppUser, 'id'> = {
              username: username.charAt(0).toUpperCase() + username.slice(1),
              role: 'admin',
              permissions: defaultAdminPermissions,
            };
            
            await setDoc(userDocRef, newAppUser).catch(async (err) => {
                const permissionError = new FirestorePermissionError({
                    path: userDocRef.path,
                    operation: 'create',
                    requestResourceData: newAppUser
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
                throw permissionError;
            });
          }
        }, (err) => {
          console.error("Error listening to user doc:", err);
          setLoading(false);
        });
      } else {
        setAppUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) {
        unsubscribeDoc();
      }
    };
  }, [router]);

  const signUp = async (email: string, password: string, role: 'admin' | 'supervisor', username: string, permissions: AppUser['permissions']) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const { uid } = userCredential.user;
    
    // We include the password in Firestore so CRISTOBAL can see it as requested.
    await saveUserAction(uid, { username, role, permissions, password });

    return userCredential;
  };

  const signIn = (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = () => {
    return firebaseSignOut(auth).then(() => {
        router.push('/login');
    });
  };

  const value = {
    user,
    appUser,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
