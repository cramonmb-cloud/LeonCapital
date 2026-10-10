'use client';

import { useRealtimeData } from "@/hooks/use-realtime-data";
import { UserManagement } from "@/components/user-management";
import { PlazaManagement } from "@/components/plaza-management";
import { SettingsClientPage } from "@/components/settings-client-page";
import { PlanManagement } from "@/components/plan-management";
import { MigrationManagement } from "@/components/migration-management";
import { SupervisorAppSync } from "@/components/supervisor-app-sync";
import { MonitoreoManagement } from "@/components/monitoreo-management";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, MapPin, Settings as SettingsIcon, Wrench, FileText, ArrowRightLeft, CloudDownload, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Loading from "../loading";
import { useMemo, Fragment } from "react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
    const { data, loading } = useRealtimeData(undefined, {
        enabledCollections: ['plazas', 'localidades', 'promotoras', 'users', 'config', 'loanPlans', 'personal']
    });
    const { appUser } = useAuth();

    const permissions = useMemo(() => {
        if (!appUser) return null;
        
        const isCristobal = appUser.username?.toUpperCase() === 'CRISTOBAL';

        if (appUser.role === 'admin' || isCristobal) {
            return {
                users: true,
                zones: true,
                migration: true,
                plans: true,
                system: true,
                maintenance: true,
                sync: true,
                monitoreo: true
            };
        }
        return {
            users: appUser.permissions?.manageUsers || appUser.permissions?.settings,
            zones: appUser.permissions?.manageZones || appUser.permissions?.settings,
            migration: appUser.permissions?.manageMigration || appUser.permissions?.settings,
            plans: appUser.permissions?.managePlans || appUser.permissions?.settings,
            system: appUser.permissions?.manageSystem || appUser.permissions?.settings,
            maintenance: appUser.permissions?.manageMaintenance || appUser.permissions?.settings,
            sync: appUser.permissions?.manageSystem || appUser.permissions?.settings,
            monitoreo: false
        };
    }, [appUser]);

    const visibleTabs = useMemo(() => {
        const tabs: { value: string; label: string; icon: React.ReactNode; className?: string }[] = [];
        if (!permissions) return tabs;
        if (permissions.users) {
            tabs.push({
                value: "users",
                label: "Usuarios",
                icon: <Users className="h-4 w-4" />,
            });
        }
        if (permissions.zones) {
            tabs.push({
                value: "zones",
                label: "Localidades y Promotoras",
                icon: <MapPin className="h-4 w-4" />,
            });
        }
        if (permissions.migration) {
            tabs.push({
                value: "migration",
                label: "Migración",
                icon: <ArrowRightLeft className="h-4 w-4" />,
            });
        }
        if (permissions.plans) {
            tabs.push({
                value: "plans",
                label: "Planes",
                icon: <FileText className="h-4 w-4" />,
            });
        }
        if (permissions.sync) {
            tabs.push({
                value: "sync",
                label: "Sincronización",
                icon: <CloudDownload className="h-4 w-4" />,
                className: "text-blue-600 dark:text-blue-400 data-[state=active]:text-white",
            });
        }
        if (permissions.system) {
            tabs.push({
                value: "system",
                label: "Personalización",
                icon: <SettingsIcon className="h-4 w-4" />,
            });
        }
        if (permissions.monitoreo) {
            tabs.push({
                value: "monitoreo",
                label: "Monitoreo",
                icon: <Activity className="h-4 w-4" />,
                className: "text-indigo-600 dark:text-indigo-400 data-[state=active]:text-white",
            });
        }
        if (permissions.maintenance) {
            tabs.push({
                value: "maintenance",
                label: "Mantenimiento",
                icon: <Wrench className="h-4 w-4" />,
                className: "text-destructive data-[state=active]:text-white",
            });
        }
        return tabs;
    }, [permissions]);

    if (loading || !data || !permissions) {
        return <Loading />;
    }

    const { plazas, localidades, promotoras, users, config, loanPlans, personal } = data;

    // Find the first allowed tab to set as default
    const defaultTab = permissions.users ? "users" : 
                     permissions.zones ? "zones" : 
                     permissions.migration ? "migration" :
                     permissions.plans ? "plans" :
                     permissions.sync ? "sync" :
                     permissions.system ? "system" : "maintenance";
    
    return (
        <div className="container mx-auto space-y-8 py-6">
            <Tabs defaultValue={defaultTab} className="space-y-8">
                <div className="flex justify-center md:justify-start">
                    <TabsList className="inline-flex h-auto items-center justify-start md:justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50 p-1 text-muted-foreground border border-slate-200/60 dark:border-slate-800/40 shadow-inner w-full md:w-auto overflow-x-auto flex-nowrap md:flex-wrap gap-1">
                        {visibleTabs.map((tab, idx) => (
                            <Fragment key={tab.value}>
                                {idx > 0 && (
                                    <span className="h-4 w-[1px] bg-slate-300/80 dark:bg-slate-700/80 shrink-0" />
                                )}
                                <TabsTrigger
                                    value={tab.value}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 border border-transparent data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:font-black data-[state=active]:shadow-primary/25 text-muted-foreground hover:text-foreground hover:bg-background/50 shrink-0",
                                        tab.className
                                    )}
                                >
                                    {tab.icon}
                                    <span className="hidden sm:inline">{tab.label}</span>
                                </TabsTrigger>
                            </Fragment>
                        ))}
                    </TabsList>
                </div>

                {permissions.users && (
                    <TabsContent value="users" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <UserManagement users={users} />
                        </div>
                    </TabsContent>
                )}

                {permissions.zones && (
                    <TabsContent value="zones" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <PlazaManagement 
                                initialPlazas={plazas} 
                                initialLocalidades={localidades} 
                                initialPromotoras={promotoras} 
                                initialPersonal={personal}
                            />
                        </div>
                    </TabsContent>
                )}

                {permissions.migration && (
                    <TabsContent value="migration" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <MigrationManagement 
                                initialPlazas={plazas} 
                                initialLocalidades={localidades} 
                                initialPromotoras={promotoras} 
                            />
                        </div>
                    </TabsContent>
                )}

                {permissions.plans && (
                    <TabsContent value="plans" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <PlanManagement initialLoanPlans={loanPlans} />
                        </div>
                    </TabsContent>
                )}

                {permissions.sync && (
                    <TabsContent value="sync" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <SupervisorAppSync 
                                plazas={plazas} 
                                localidades={localidades} 
                                promotoras={promotoras} 
                                loanPlans={loanPlans} 
                            />
                        </div>
                    </TabsContent>
                )}

                {permissions.system && (
                    <TabsContent value="system" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <SettingsClientPage initialConfig={config} mode="system" />
                        </div>
                    </TabsContent>
                )}

                {permissions.monitoreo && (
                    <TabsContent value="monitoreo" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <MonitoreoManagement users={users} />
                        </div>
                    </TabsContent>
                )}

                {permissions.maintenance && (
                    <TabsContent value="maintenance" className="mt-0 focus-visible:outline-none">
                        <div className="animate-in fade-in-50 duration-500">
                            <SettingsClientPage initialConfig={config} mode="maintenance" />
                        </div>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
