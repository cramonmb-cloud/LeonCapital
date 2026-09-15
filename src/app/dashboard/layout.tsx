'use client';

import { Logo } from '@/components/logo';
import { MainNav, allLinks } from '@/components/main-nav';
import { UserNav } from '@/components/user-nav';
import { MobileNavBar } from '@/components/mobile-nav-bar';
import { FloatingAviso } from '@/components/floating-aviso';
import { Button } from '@/components/ui/button';
import { Bell, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useMemo, useRef } from 'react';
import Loading from './loading';
import type { UserPermissions } from '@/lib/types';
import { getAppConfig } from '@/lib/firestore-data';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { VERSION } from '@/version';


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, appUser, loading } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFormat, setLogoFormat] = useState<'square' | 'horizontal'>('square');
  const [logoHeightHeader, setLogoHeightHeader] = useState<number | undefined>(undefined);
  const [logoWidthHeader, setLogoWidthHeader] = useState<number | undefined>(undefined);
  const [appName, setAppName] = useState<string>('CrediControl');
  const [menuConfig, setMenuConfig] = useState<Record<string, 'operacion' | 'administracion'> | undefined>(undefined);
  const [menuOrder, setMenuOrder] = useState<string[] | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'operacion' | 'administracion'>('operacion');
  const [operacionColor, setOperacionColor] = useState<string>('#3b82f6');
  const [administracionColor, setAdministracionColor] = useState<string>('#8b5cf6');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const mergedMenuConfig = useMemo(() => {
    const defaultMenuConfig: Record<string, 'operacion' | 'administracion'> = {
      dashboard: 'operacion',
      clients: 'operacion',
      consultarCliente: 'operacion',
      loans: 'operacion',
      overduePortfolio: 'operacion',
      carteraVencida: 'operacion',
      debes: 'operacion',
      wallet: 'administracion',
      control: 'administracion',
      settings: 'administracion',
      avisos: 'administracion',
      personal: 'administracion',
      avales: 'administracion',
      imprenta: 'administracion',
    };
    return { ...defaultMenuConfig, ...menuConfig };
  }, [menuConfig]);

  // Sync activeTab with current pathname
  useEffect(() => {
    const matchingLink = allLinks.find(link => 
      pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
    );
    if (matchingLink) {
      const category = mergedMenuConfig[matchingLink.id] || 'operacion';
      setActiveTab(category);
    }
  }, [pathname, mergedMenuConfig]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }
    
    if (appUser) {
        const isDashboardPage = pathname === '/dashboard';
        const hasDashboardAccess = appUser.role === 'admin' || (appUser.permissions && appUser.permissions.dashboard);

        if (isDashboardPage && !hasDashboardAccess) {
            const firstAllowedPage = allLinks.find(
                link => link.id !== 'dashboard' && appUser.permissions?.[link.id as keyof UserPermissions]
            );

            if (firstAllowedPage) {
                router.replace(firstAllowedPage.href);
            }
        }
    }
  }, [user, appUser, loading, router, pathname]);

   useEffect(() => {
    async function fetchConfig() {
      const config = await getAppConfig();
      if (config?.logoUrl) {
        setLogoUrl(config.logoUrl);
      }
      if (config?.appName) {
        setAppName(config.appName);
      }
      if (config?.menuConfig) {
        setMenuConfig(config.menuConfig);
      }
      if (config?.menuOrder) {
        setMenuOrder(config.menuOrder);
      } else {
        setMenuOrder(undefined);
      }
      if (config?.operacionColor) {
        setOperacionColor(config.operacionColor);
      }
      if (config?.administracionColor) {
        setAdministracionColor(config.administracionColor);
      }
      if (config?.logoFormat) {
        setLogoFormat(config.logoFormat as 'square' | 'horizontal');
      }
      if (config?.logoHeightHeader) {
        setLogoHeightHeader(config.logoHeightHeader);
      }
      if (config?.logoWidthHeader) {
        setLogoWidthHeader(config.logoWidthHeader);
      }
    }
    fetchConfig();
  }, [pathname]); 
  const lastPathRef = useRef('');
  const lastWriteTimeRef = useRef(0);

  // Track user activity and section path
  useEffect(() => {
    if (!appUser || !appUser.id) return;

    const WRITE_INTERVAL = 60 * 1000; // Throttle to 1 write per minute maximum

    const updateActivity = async (section: string, force = false) => {
      const now = Date.now();
      if (!force && (now - lastWriteTimeRef.current < WRITE_INTERVAL)) return;

      lastWriteTimeRef.current = now;
      const userRef = doc(db, 'users', appUser.id);
      try {
        await updateDoc(userRef, {
          lastActive: new Date().toISOString(),
          currentSection: section
        });
      } catch (err) {
        console.error("Error updating user activity:", err);
      }
    };

    // Force write immediately ONLY when pathname actually changes
    if (pathname !== lastPathRef.current) {
      lastPathRef.current = pathname;
      updateActivity(pathname, true);
    }

    // Throttled writes on interactions
    const handleInteraction = () => {
      updateActivity(pathname, false);
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [appUser?.id, pathname]);

  if (loading || !user || !appUser) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loading logoUrl={logoUrl} logoFormat={logoFormat} appName={appName} />
      </div>
    );
  }
  
  const isDashboardPage = pathname === '/dashboard';
  const hasDashboardAccess = appUser.role === 'admin' || (appUser.permissions && appUser.permissions.dashboard);
  if (isDashboardPage && !hasDashboardAccess) {
      return (
        <div className="flex h-screen w-full items-center justify-center">
          <Loading logoUrl={logoUrl} logoFormat={logoFormat} appName={appName} />
        </div>
      );
  }
  
  return (
    <div className="flex min-h-screen w-full flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
      <header 
        className="sticky top-0 z-50 flex flex-col liquid-glass-header transition-all duration-500"
        style={{
          borderBottomColor: `${activeTab === 'operacion' ? operacionColor : administracionColor}28`,
        }}
      >
          {/* Fila Superior */}
          <div className="flex h-14 w-full items-center justify-between px-4 md:px-8 relative">
              <div className="flex items-center gap-2">
                 <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0 md:hidden hover:bg-white/40 dark:hover:bg-white/10 rounded-full h-9 w-9 transition-colors">
                          <Menu className="h-5 w-5" />
                          <span className="sr-only">Toggle navigation menu</span>
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="left" className="flex flex-col w-[290px] p-0 border-r border-white/30 dark:border-white/10 bg-white/75 dark:bg-zinc-950/80 backdrop-blur-2xl shadow-2xl">
                        <SheetHeader className="p-5 border-b border-white/30 dark:border-white/10 text-left bg-white/20 dark:bg-white/5 backdrop-blur-md">
                          <Logo logoUrl={logoUrl} logoFormat={logoFormat} appName={appName} className="mb-0" size="md" customHeight={logoHeightHeader} customWidth={logoWidthHeader} />
                          <SheetTitle className="sr-only">{appName}</SheetTitle>
                          <SheetDescription className="sr-only">Menú de navegación principal</SheetDescription>
                        </SheetHeader>
                        <nav className="flex-1 overflow-y-auto py-4">
                          <MainNav 
                            isMobile={true} 
                            onLinkClick={() => setMobileMenuOpen(false)} 
                            menuConfig={menuConfig} 
                            menuOrder={menuOrder}
                            activeTab={activeTab} 
                            setActiveTab={setActiveTab}
                            operacionColor={operacionColor}
                            administracionColor={administracionColor}
                          />
                        </nav>
                      </SheetContent>
                  </Sheet>
                  
                  {/* Logo escritorio */}
                  <Link
                      href="/dashboard"
                      className="hidden items-center gap-2 md:flex mr-4 transition-transform active:scale-95"
                  >
                      <Logo logoUrl={logoUrl} logoFormat={logoFormat} appName={appName} size="md" customHeight={logoHeightHeader} customWidth={logoWidthHeader} />
                  </Link>
              </div>

              {/* Logo centrado en móvil */}
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 md:hidden">
                  <Link href="/dashboard" className="transition-transform active:scale-95">
                      <Logo logoUrl={logoUrl} logoFormat={logoFormat} appName={appName} size="md" customHeight={logoHeightHeader} customWidth={logoWidthHeader} />
                  </Link>
              </div>

              {/* Centro: Selector de Pestañas (Solo Escritorio) - Apple Liquid Glass */}
              <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                  <div className="inline-flex items-center liquid-glass-track p-1 rounded-full h-9 relative w-[240px]">
                      {/* Sliding Pill Background with Apple Liquid Glass reflections */}
                      <div 
                        className="absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] liquid-glass-pill overflow-hidden"
                        style={{
                          left: activeTab === 'operacion' ? '4px' : 'calc(50% + 2px)',
                          width: 'calc(50% - 6px)',
                          backgroundColor: activeTab === 'operacion' ? operacionColor : administracionColor,
                          boxShadow: `0 4px 14px -1px ${activeTab === 'operacion' ? operacionColor : administracionColor}60, inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.75), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.2)`
                        }}
                      >
                          {/* Liquid specular light sheen */}
                          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none rounded-full" />
                      </div>
                      <button
                        onClick={() => setActiveTab('operacion')}
                        className={cn(
                          "w-1/2 py-1.5 rounded-full text-xs font-black tracking-wide transition-all duration-300 active:scale-95 relative z-10 text-center",
                          activeTab === 'operacion'
                            ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                            : "text-muted-foreground/80 hover:text-foreground"
                        )}
                      >
                        Operación
                      </button>
                      <button
                        onClick={() => setActiveTab('administracion')}
                        className={cn(
                          "w-1/2 py-1.5 rounded-full text-xs font-black tracking-wide transition-all duration-300 active:scale-95 relative z-10 text-center",
                          activeTab === 'administracion'
                            ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                            : "text-muted-foreground/80 hover:text-foreground"
                        )}
                      >
                        Administración
                      </button>
                  </div>
              </div>

              {/* Derecha: Acciones y Perfil */}
              <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1">
                     <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-muted-foreground hover:bg-muted/50 transition-colors [&_svg]:size-[18px]" asChild>
                        <Link href="/dashboard/consultar-cliente">
                            <Search />
                        </Link>
                     </Button>
                     <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-muted-foreground hover:bg-muted/50 transition-colors [&_svg]:size-[18px] relative">
                        <Bell />
                        <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                        <span className="sr-only">Notificaciones</span>
                     </Button>
                  </div>
                  <div className="h-5 w-[1px] bg-border/40 hidden sm:block" />
                  <UserNav />
              </div>
          </div>

          {/* Fila Inferior: Enlaces (Solo Escritorio) */}
          <div className="hidden md:flex w-full justify-center py-1">
              <MainNav 
                menuConfig={menuConfig} 
                menuOrder={menuOrder}
                activeTab={activeTab} 
                setActiveTab={setActiveTab}
                operacionColor={operacionColor}
                administracionColor={administracionColor}
              />
          </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 py-2 md:gap-4 md:px-8 md:py-3 max-w-[1600px] mx-auto w-full animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out pb-24 md:pb-8">
        {children}
        <footer className="w-full text-center py-6 border-t border-border/10 mt-auto shrink-0">
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
            Version: {VERSION}
          </p>
        </footer>
      </main>
      <MobileNavBar />
      <FloatingAviso />
    </div>
  );
}
