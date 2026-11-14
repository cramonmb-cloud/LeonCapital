'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { UserPermissions } from '@/lib/types';
import { LayoutGrid, Users, Landmark, FileWarning, Wallet, Settings, Activity, Search, History, Coins, Megaphone, UserCheck, Printer, ShieldCheck, FileSpreadsheet, Lock, BarChart3, Gift, ReceiptText, Settings2, Briefcase, type LucideIcon } from 'lucide-react';

import { useState, useEffect, useMemo } from 'react';

export const allLinks: { href: string; label: string; id: string, icon: LucideIcon }[] = [
  // Operación
  { href: '/inicio', label: 'Inicio', id: 'dashboard', icon: LayoutGrid },
  { href: '/inicio/clientes', label: 'Clientes', id: 'clients', icon: Users },
  { href: '/inicio/avales', label: 'Avales', id: 'avales', icon: ShieldCheck },
  { href: '/inicio/consultar-cliente', label: 'Consultar', id: 'consultarCliente', icon: Search },
  { href: '/inicio/prestamos', label: 'Préstamos', id: 'loans', icon: Landmark },
  { href: '/inicio/pendientes', label: 'Pendientes', id: 'overduePortfolio', icon: FileWarning },
  { href: '/inicio/cartera-vencida', label: 'Vencida', id: 'carteraVencida', icon: History },
  { href: '/inicio/debes', label: 'Debes', id: 'debes', icon: Coins },
  { href: '/inicio/resumen', label: 'Resumen', id: 'resumen', icon: BarChart3 },

  // Administración
  { href: '/inicio/ajustes', label: 'Ajustes', id: 'settings', icon: Settings },
  { href: '/inicio/control', label: 'Control', id: 'control', icon: Activity },
  { href: '/inicio/bitacora', label: 'Bitacora', id: 'wallet', icon: Wallet },
  { href: '/inicio/personal', label: 'Personal', id: 'personal', icon: UserCheck },
  { href: '/inicio/avisos', label: 'Avisos', id: 'avisos', icon: Megaphone },

  // Gestión
  { href: '/inicio/imprenta', label: 'Imprenta', id: 'imprenta', icon: Printer },
  { href: '/inicio/aguinaldos', label: 'Aguinaldos', id: 'aguinaldos', icon: Gift },
  { href: '/inicio/precaptura', label: 'Precaptura', id: 'precaptura', icon: FileSpreadsheet },
  { href: '/inicio/gastos', label: 'Gastos', id: 'gastos', icon: ReceiptText },
  { href: '/inicio/cierre-semanal', label: 'Cierre Semanal', id: 'cierreSemanal', icon: Lock },
];

interface MainNavProps {
    isMobile?: boolean;
    onLinkClick?: () => void;
    menuConfig?: Record<string, 'operacion' | 'administracion' | 'gestion'>;
    menuOrder?: string[];
    activeTab: 'operacion' | 'administracion' | 'gestion';
    setActiveTab: (tab: 'operacion' | 'administracion' | 'gestion') => void;
    operacionColor?: string;
    administracionColor?: string;
    gestionColor?: string;
}

export function MainNav({ 
  isMobile = false, 
  onLinkClick, 
  menuConfig, 
  menuOrder,
  activeTab, 
  setActiveTab,
  operacionColor = '#3b82f6',
  administracionColor = '#8b5cf6',
  gestionColor = '#10b981'
}: MainNavProps) {
  const pathname = usePathname();
  const { appUser } = useAuth();

  const currentTabColor = 
    activeTab === 'operacion' 
      ? operacionColor 
      : activeTab === 'administracion' 
        ? administracionColor 
        : gestionColor;

  const mergedMenuConfig = useMemo(() => {
    const defaultMenuConfig: Record<string, 'operacion' | 'administracion' | 'gestion'> = {
      // Operación
      dashboard: 'operacion',
      clients: 'operacion',
      avales: 'operacion',
      consultarCliente: 'operacion',
      loans: 'operacion',
      overduePortfolio: 'operacion',
      carteraVencida: 'operacion',
      debes: 'operacion',
      resumen: 'operacion',

      // Administración
      settings: 'administracion',
      control: 'administracion',
      wallet: 'administracion',
      personal: 'administracion',
      avisos: 'administracion',

      // Gestión
      imprenta: 'gestion',
      aguinaldos: 'gestion',
      precaptura: 'gestion',
      gastos: 'gestion',
      cierreSemanal: 'gestion',
    };
    return { ...defaultMenuConfig, ...menuConfig };
  }, [menuConfig]);

  if (!appUser) {
    return null;
  }

  const allowedLinks = allLinks.filter(link => {
    if (appUser.role === 'admin') {
      return true;
    }
    
    if (link.id === 'settings') {
        const p = appUser.permissions;
        return p.settings || p.manageUsers || p.manageZones || p.manageMigration || p.managePlans || p.manageSystem || p.manageMaintenance;
    }

    if (link.id === 'avisos') {
        return appUser.permissions && appUser.permissions.manageAvisos;
    }

    if (link.id === 'personal') {
        return appUser.permissions && appUser.permissions.managePersonal;
    }

    if (link.id === 'aguinaldos') {
        return appUser.permissions ? (appUser.permissions.aguinaldos ?? true) : true;
    }

    if (link.id === 'gastos') {
        return appUser.permissions ? (appUser.permissions.gastos ?? true) : true;
    }

    return appUser.permissions && appUser.permissions[link.id as keyof UserPermissions];
  });

  const orderedAllowedLinks = useMemo(() => {
    if (!menuOrder || menuOrder.length === 0) {
      return allowedLinks;
    }
    return [...allowedLinks].sort((a, b) => {
      const indexA = menuOrder.indexOf(a.id);
      const indexB = menuOrder.indexOf(b.id);
      const posA = indexA === -1 ? 999 : indexA;
      const posB = indexB === -1 ? 999 : indexB;
      return posA - posB;
    });
  }, [allowedLinks, menuOrder]);

  const filteredLinks = useMemo(() => {
    return orderedAllowedLinks.filter(link => {
      const category = mergedMenuConfig[link.id] || 'operacion';
      return category === activeTab;
    });
  }, [orderedAllowedLinks, mergedMenuConfig, activeTab]);

  const getIconClass = (id: string, isActive: boolean, sizeClass = "h-4 w-4") => {
    return cn(
        sizeClass,
        "transition-transform duration-200 shrink-0",
        isActive ? "scale-105" : "text-slate-500 dark:text-zinc-400 group-hover:text-slate-800 dark:group-hover:text-zinc-200 group-hover:scale-110"
    );
  };

  if (isMobile) {
    return (
        <div className="flex flex-col gap-4">
            {/* Mobile Tab Selector */}
            <div className="flex bg-slate-100 dark:bg-zinc-800 p-1.5 rounded-2xl mx-3 justify-between relative h-11 items-center gap-1.5">
              <button
                onClick={() => setActiveTab('operacion')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold tracking-tight text-center transition-all duration-200 select-none active:scale-95",
                  activeTab === 'operacion'
                    ? "text-white shadow-md font-bold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-foreground"
                )}
                style={activeTab === 'operacion' ? { backgroundColor: currentTabColor } : undefined}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>Operación</span>
              </button>
              <button
                onClick={() => setActiveTab('gestion')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold tracking-tight text-center transition-all duration-200 select-none active:scale-95",
                  activeTab === 'gestion'
                    ? "text-white shadow-md font-bold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-foreground"
                )}
                style={activeTab === 'gestion' ? { backgroundColor: currentTabColor } : undefined}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Gestión</span>
              </button>
              <button
                onClick={() => setActiveTab('administracion')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold tracking-tight text-center transition-all duration-200 select-none active:scale-95",
                  activeTab === 'administracion'
                    ? "text-white shadow-md font-bold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-foreground"
                )}
                style={activeTab === 'administracion' ? { backgroundColor: currentTabColor } : undefined}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Admin</span>
              </button>
            </div>

            {/* Mobile Sub-Links - Liquid Glass Cards */}
            <div key={activeTab} className="flex flex-col gap-2 px-3 py-1 animate-in fade-in slide-in-from-left-3 duration-300">
                {filteredLinks.length > 0 ? (
                  filteredLinks.map((link) => {
                    const isActive = pathname === link.href || (link.href !== '/inicio' && link.href !== '/dashboard' && pathname.startsWith(link.href));
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                'group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold transition-all duration-200 active:scale-[0.98] border backdrop-blur-md relative overflow-hidden',
                                isActive 
                                    ? 'shadow-md font-black' 
                                    : 'text-slate-700 dark:text-zinc-300 bg-white/35 dark:bg-white/5 border-white/50 dark:border-white/10 hover:bg-white/60 dark:hover:bg-white/10 hover:text-foreground'
                            )}
                            style={isActive ? {
                              background: `linear-gradient(135deg, ${currentTabColor}22, ${currentTabColor}08)`,
                              borderColor: `${currentTabColor}45`,
                              boxShadow: `0 6px 20px -2px ${currentTabColor}25, inset 0 1px 1.5px rgba(255, 255, 255, 0.85)`,
                              color: currentTabColor
                            } : undefined}
                            onClick={onLinkClick}
                        >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "p-2 rounded-xl transition-all duration-300 flex items-center justify-center",
                                isActive 
                                  ? "bg-white/90 dark:bg-zinc-800/90 shadow-sm border border-white/80 dark:border-white/20" 
                                  : "bg-white/50 dark:bg-white/10 group-hover:bg-white/80"
                              )}>
                                <link.icon 
                                  className={getIconClass(link.id, isActive, "h-4 w-4")} 
                                  style={isActive && link.id !== 'overduePortfolio' && link.id !== 'carteraVencida' && link.id !== 'control' ? { 
                                    color: currentTabColor,
                                    filter: `drop-shadow(0 2px 6px ${currentTabColor}70)`
                                  } : undefined}
                                />
                              </div>
                              <span className="tracking-tight">{link.label}</span>
                            </div>

                            {isActive && (
                              <div 
                                className="w-1.5 h-6 rounded-full transition-all duration-300"
                                style={{ 
                                  backgroundColor: currentTabColor,
                                  boxShadow: `0 0 10px ${currentTabColor}`
                                }}
                              />
                            )}
                        </Link>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground text-center p-4">No hay secciones en este menú.</p>
                )}
            </div>
        </div>
    );
  }

  // Desktop Sub-Menu: Segmented Unified Capsule Bar (matching exact design)
  return (
        <div 
          className="inline-flex items-stretch bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-2xl shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden relative max-w-full my-0.5 select-none"
        >
            <div key={activeTab} className="flex items-stretch h-full animate-in fade-in zoom-in-98 duration-200">
                {filteredLinks.length > 0 ? (
                  filteredLinks.map((link) => {
                    const isActive = pathname === link.href || (link.href !== '/inicio' && link.href !== '/dashboard' && pathname.startsWith(link.href));
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                'group relative flex items-center gap-2 px-4 md:px-5 py-2.5 text-xs transition-all duration-200 border-r border-slate-200/80 dark:border-zinc-800 last:border-r-0 whitespace-nowrap active:scale-[0.98]',
                                isActive 
                                    ? 'font-semibold' 
                                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 font-medium'
                            )}
                            style={isActive ? {
                                backgroundColor: `${currentTabColor}10`,
                                color: currentTabColor,
                            } : undefined}
                        >
                            <link.icon 
                              className={getIconClass(link.id, isActive, "h-4 w-4")} 
                              style={isActive ? { 
                                color: currentTabColor,
                              } : undefined}
                            />
                            <span className="tracking-tight">
                                {link.label}
                            </span>
                            {isActive && (
                                <span 
                                  className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-sm" 
                                  style={{ 
                                    backgroundColor: currentTabColor,
                                  }}
                                />
                            )}
                        </Link>
                    );
                  })
                ) : (
                  <span className="text-xs text-muted-foreground px-6 py-2.5">No hay secciones en este menú.</span>
                )}
            </div>
        </div>
  );
}
