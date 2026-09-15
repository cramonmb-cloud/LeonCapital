'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { UserPermissions } from '@/lib/types';
import { LayoutDashboard, Users, Landmark, FileWarning, Wallet, Settings, Activity, Search, History, Coins, Megaphone, UserCheck, Printer, ShieldCheck, type LucideIcon } from 'lucide-react';

import { useState, useEffect, useMemo } from 'react';

export const allLinks: { href: string; label: string; id: string, icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Dashboard', id: 'dashboard', icon: LayoutDashboard },
  { href: '/dashboard/clientes', label: 'Clientes', id: 'clients', icon: Users },
  { href: '/dashboard/consultar-cliente', label: 'Consultar', id: 'consultarCliente', icon: Search },
  { href: '/dashboard/prestamos', label: 'Préstamos', id: 'loans', icon: Landmark },
  { href: '/dashboard/pendientes', label: 'Pendientes', id: 'overduePortfolio', icon: FileWarning },
  { href: '/dashboard/cartera-vencida', label: 'Vencida', id: 'carteraVencida', icon: History },
  { href: '/dashboard/debes', label: 'Debes', id: 'debes', icon: Coins },
  { href: '/dashboard/bitacora', label: 'Bitacora', id: 'wallet', icon: Wallet },
  { href: '/dashboard/control', label: 'Control', id: 'control', icon: Activity },
  { href: '/dashboard/personal', label: 'Personal', id: 'personal', icon: UserCheck },
  { href: '/dashboard/avales', label: 'Avales', id: 'avales', icon: ShieldCheck },
  { href: '/dashboard/ajustes', label: 'Ajustes', id: 'settings', icon: Settings },
  { href: '/dashboard/avisos', label: 'Avisos', id: 'avisos', icon: Megaphone },
  { href: '/dashboard/imprenta', label: 'Imprenta', id: 'imprenta', icon: Printer },
];

interface MainNavProps {
    isMobile?: boolean;
    onLinkClick?: () => void;
    menuConfig?: Record<string, 'operacion' | 'administracion'>;
    menuOrder?: string[];
    activeTab: 'operacion' | 'administracion';
    setActiveTab: (tab: 'operacion' | 'administracion') => void;
    operacionColor?: string;
    administracionColor?: string;
}

export function MainNav({ 
  isMobile = false, 
  onLinkClick, 
  menuConfig, 
  menuOrder,
  activeTab, 
  setActiveTab,
  operacionColor = '#3b82f6',
  administracionColor = '#8b5cf6' 
}: MainNavProps) {
  const pathname = usePathname();
  const { appUser } = useAuth();

  const currentTabColor = activeTab === 'operacion' ? operacionColor : administracionColor;

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

  const getIconClass = (id: string, isActive: boolean, sizeClass = "h-5 w-5") => {
    return cn(
        sizeClass,
        "transition-all duration-300 transform",
        isActive ? "scale-110" : "group-hover:scale-110 opacity-70 group-hover:opacity-100",
        id === 'overduePortfolio' && (isActive ? 'text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]' : 'group-hover:text-orange-500'),
        id === 'carteraVencida' && (isActive ? 'text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.4)]' : 'group-hover:text-red-600'),
        id === 'control' && (isActive ? 'text-blue-600 drop-shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'group-hover:text-blue-600')
    );
  };

  if (isMobile) {
    return (
        <div className="flex flex-col gap-4">
            {/* Mobile Tab Selector - Apple Liquid Glass */}
            <div className="flex liquid-glass-track p-1 rounded-2xl mx-4 justify-between relative h-11 items-center">
              {/* Mobile Sliding Pill Background with specular sheen */}
              <div 
                className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] liquid-glass-pill overflow-hidden"
                style={{
                  left: activeTab === 'operacion' ? '4px' : 'calc(50% + 2px)',
                  width: 'calc(50% - 6px)',
                  backgroundColor: currentTabColor,
                  boxShadow: `0 4px 14px -1px ${currentTabColor}60, inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.2)`
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none rounded-xl" />
              </div>
              <button
                onClick={() => setActiveTab('operacion')}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-xs font-black tracking-wide text-center transition-all relative z-10 active:scale-95",
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
                  "flex-1 py-2.5 rounded-xl text-xs font-black tracking-wide text-center transition-all relative z-10 active:scale-95",
                  activeTab === 'administracion'
                    ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    : "text-muted-foreground/80 hover:text-foreground"
                )}
              >
                Administración
              </button>
            </div>

            {/* Mobile Sub-Links - Liquid Glass Cards */}
            <div key={activeTab} className="flex flex-col gap-2 px-3 py-1 animate-in fade-in slide-in-from-left-3 duration-300">
                {filteredLinks.length > 0 ? (
                  filteredLinks.map((link) => {
                    const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
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

  // Desktop Sub-Menu: Apple Liquid Glass Floating Capsule Dock
  return (
        <div 
          className="flex items-center liquid-glass-dock p-1.5 rounded-full transition-all duration-500 my-0.5 relative z-20"
          style={{
            borderColor: `${currentTabColor}35`,
            boxShadow: `0 8px 24px -4px rgba(0, 0, 0, 0.06), 0 0 20px -6px ${currentTabColor}25, inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.95)`
          }}
        >
            <div key={activeTab} className="flex items-center gap-1.5 h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                {filteredLinks.length > 0 ? (
                  filteredLinks.map((link) => {
                    const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                'group flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-300 relative overflow-hidden h-full active:scale-95',
                                isActive 
                                    ? 'liquid-glass-sub-active text-slate-900 dark:text-white font-black shadow-sm' 
                                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10'
                            )}
                        >
                            <link.icon 
                              className={getIconClass(link.id, isActive, "h-4 w-4")} 
                              style={isActive && link.id !== 'overduePortfolio' && link.id !== 'carteraVencida' && link.id !== 'control' ? { 
                                color: currentTabColor,
                                filter: `drop-shadow(0 2px 6px ${currentTabColor}70)`
                              } : undefined}
                            />
                            <span className={cn(
                                "transition-all duration-300 tracking-tight",
                                isActive ? "opacity-100 font-black" : "opacity-85 group-hover:opacity-100"
                            )}>
                                {link.label}
                            </span>
                            {isActive && (
                                <span 
                                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full animate-pulse" 
                                  style={{ 
                                    backgroundColor: currentTabColor,
                                    boxShadow: `0 0 10px 1px ${currentTabColor}`
                                  }}
                                />
                            )}
                        </Link>
                    );
                  })
                ) : (
                  <span className="text-xs text-muted-foreground px-6 py-2">No hay secciones en este menú.</span>
                )}
            </div>
        </div>
  );
}
