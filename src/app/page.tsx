import { redirect } from 'next/navigation'
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function RootPage() {
  // En Next.js App Router, el lado del servidor no tiene acceso directo al estado de autenticación del cliente.
  // La mejor práctica es redirigir a una página de carga o directamente a login,
  // y dejar que el lado del cliente maneje la redirección si el usuario ya está logueado.
  // El `DashboardLayout` ya se encarga de redirigir a `/login` si no hay usuario.
  // Así que redirigir a `/inicio` es seguro.
  redirect('/inicio');
}
