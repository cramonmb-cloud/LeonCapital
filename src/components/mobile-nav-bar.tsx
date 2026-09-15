'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Users, Landmark, FileWarning, Wallet, Settings, Activity, Search, History, type LucideIcon } from 'lucide-react';

const allLinks: { href: string; label: string; id: string, icon: LucideIcon, color: string }[] = [
  { href: '/dashboard', label: 'Inicio', id: 'dashboard', icon: LayoutDashboard, color: '#3b82f6' },
  { href: '/dashboard/clientes', label: 'Clientes', id: 'clients', icon: Users, color: '#3b82f6' },
  { href: '/dashboard/consultar-cliente', label: 'Buscar', id: 'consultarCliente', icon: Search, color: '#3b82f6' },
  { href: '/dashboard/prestamos', label: 'Pagos', id: 'loans', icon: Landmark, color: '#3b82f6' },
  { href: '/dashboard/pendientes', label: 'Pendientes', id: 'overduePortfolio', icon: FileWarning, color: '#f97316' },
  { href: '/dashboard/cartera-vencida', label: 'Vencida', id: 'carteraVencida', icon: History, color: '#dc2626' },
  { href: '/dashboard/bitacora', label: 'Bitacora', id: 'wallet', icon: Wallet, color: '#3b82f6' },
  { href: '/dashboard/control', label: 'Control', id: 'control', icon: Activity, color: '#2563eb' },
  { href: '/dashboard/ajustes', label: 'Ajustes', id: 'settings', icon: Settings, color: '#3b82f6' },
];

export function MobileNavBar() {
  const pathname = usePathname();
  const { appUser } = useAuth();
  
  const [isForcedHidden, setIsForcedHidden] = useState(false);
  const [isScrollHidden, setIsScrollHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleHide = () => setIsForcedHidden(true);
    const handleShow = () => setIsForcedHidden(false);

    window.addEventListener('hide-mobile-nav', handleHide);
    window.addEventListener('show-mobile-nav', handleShow);

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Threshold para evitar parpadeos en scrolls mínimos
      if (Math.abs(currentScrollY - lastScrollY.current) < 5) return;

      // Si bajamos y no estamos arriba, ocultar
      if (currentScrollY > lastScrollY.current && currentScrollY > 80) {
        setIsScrollHidden(true);
      } 
      // Si subimos O estamos muy cerca del tope, mostrar
      else if (currentScrollY < lastScrollY.current || currentScrollY <= 10) {
        setIsScrollHidden(false);
      }
      
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('hide-mobile-nav', handleHide);
      window.removeEventListener('show-mobile-nav', handleShow);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  if (!appUser || !appUser.permissions?.showMobileNavBar) {
    return null;
  }

  const mobileSections = appUser.permissions.mobileSections || [];
  const linksToShow = allLinks.filter(link => mobileSections.includes(link.id)).slice(0, 5);

  if (linksToShow.length === 0) return null;

  const isVisible = !isForcedHidden && !isScrollHidden;

  return (
    <div 
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-[420px] md:hidden transition-all duration-500 ease-in-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-32 opacity-0 pointer-events-none"
      )}
    >
      <nav className="relative flex items-center justify-around px-2.5 py-2 rounded-[2.5rem] liquid-glass-dock border border-white/70 dark:border-white/15 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.15),_inset_0_1px_1.5px_rgba(255,255,255,0.9)]">
        {linksToShow.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative flex flex-col items-center justify-center py-2 px-1 flex-1 transition-all duration-300 active:scale-90",
                isActive ? "text-foreground" : "text-muted-foreground/50"
              )}
            >
              <div className={cn(
                "p-2.5 rounded-2xl transition-all duration-500 relative",
                isActive && "bg-white/90 dark:bg-zinc-800/90 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.12),_inset_0_1px_1px_rgba(255,255,255,1)] border border-white/80 dark:border-white/20 -translate-y-1.5"
              )}>
                <link.icon 
                  className={cn("h-5 w-5 transition-transform duration-300", isActive && "scale-110")} 
                  style={{ color: isActive ? link.color : 'currentColor' }} 
                />
                {isActive && (
                  <span 
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full animate-pulse" 
                    style={{ backgroundColor: link.color }} 
                  />
                )}
              </div>
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-tighter transition-all duration-300 absolute -bottom-1",
                isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              )}>
                {link.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
