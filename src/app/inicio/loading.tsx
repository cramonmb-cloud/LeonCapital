'use client';

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/logo";
import { getAppConfig } from "@/lib/firestore-data";

interface LoadingProps {
  message?: string;
  subtitle?: string;
  showSkeletonPreview?: boolean;
  logoUrl?: string | null;
  logoFormat?: 'square' | 'horizontal';
  appName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// In-memory cache across route navigations to avoid flash of fallback
let memoryConfigCache: {
  logoUrl?: string | null;
  logoFormat?: 'square' | 'horizontal';
  appName?: string;
} | null = null;

export default function Loading({
  message = "Estamos cargando la información",
  subtitle = "Un momento por favor, preparando los datos",
  showSkeletonPreview = true,
  logoUrl: propLogoUrl,
  logoFormat: propLogoFormat,
  appName: propAppName,
  size = "lg",
}: LoadingProps) {
  const [config, setConfig] = useState<{
    logoUrl?: string | null;
    logoFormat?: 'square' | 'horizontal';
    appName?: string;
  } | null>(() => {
    if (memoryConfigCache) return memoryConfigCache;
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("cc_app_config");
        if (stored) {
          const parsed = JSON.parse(stored);
          memoryConfigCache = parsed;
          return parsed;
        }
      } catch {}
    }
    return null;
  });

  useEffect(() => {
    if (propLogoUrl !== undefined) return;

    let isMounted = true;
    getAppConfig().then((fetched) => {
      if (!isMounted || !fetched) return;
      const resolved = {
        logoUrl: fetched.logoUrl || null,
        logoFormat: (fetched.logoFormat as 'square' | 'horizontal') || 'square',
        appName: fetched.appName || 'CrediControl',
      };
      memoryConfigCache = resolved;
      try {
        sessionStorage.setItem("cc_app_config", JSON.stringify(resolved));
      } catch {}
      setConfig(resolved);
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [propLogoUrl]);

  const activeLogoUrl = propLogoUrl !== undefined ? propLogoUrl : config?.logoUrl;
  const activeLogoFormat = propLogoFormat || config?.logoFormat || 'square';
  const activeAppName = propAppName || config?.appName || 'CrediControl';

  return (
    <div className="relative min-h-[65vh] w-full flex flex-col items-center justify-center py-12 px-4 animate-in fade-in duration-500">
      {/* Background Soft Skeleton Preview (faint layout context) */}
      {showSkeletonPreview && (
        <div className="absolute inset-0 space-y-6 opacity-25 dark:opacity-15 pointer-events-none select-none max-w-[1400px] mx-auto overflow-hidden">
          <div className="space-y-2">
            <Skeleton className="h-8 w-1/4 rounded-xl" />
            <Skeleton className="h-4 w-1/3 rounded-lg" />
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
          <Skeleton className="h-72 rounded-2xl w-full" />
        </div>
      )}

      {/* Floating Liquid Glass Island */}
      <div className="relative z-10 liquid-glass-loading rounded-3xl p-8 sm:p-10 max-w-[380px] w-full flex flex-col items-center text-center overflow-hidden transition-all duration-300">
        {/* Specular light sheen animation */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent pointer-events-none -skew-x-12 animate-shimmer-sweep" />

        {/* Central Brand Logo (Clean & Borderless) */}
        <div className="relative flex items-center justify-center mb-6">
          <Logo
            logoUrl={activeLogoUrl}
            logoFormat={activeLogoFormat}
            appName={activeAppName}
            size={size}
            showText={false}
            borderless={true}
            className="transition-transform duration-500"
          />
        </div>

        {/* Title with animated dots */}
        <div className="space-y-1 relative z-10">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800 dark:text-zinc-100 flex items-center justify-center gap-0.5">
            <span>{message}</span>
            <span className="inline-flex">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </h3>
          {subtitle && (
            <p className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>

        {/* Fluid Indeterminate Progress Bar */}
        <div className="h-1.5 w-48 bg-slate-200/60 dark:bg-zinc-800/80 rounded-full overflow-hidden relative mt-5">
          <div className="absolute inset-y-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-400 rounded-full animate-indeterminate" />
        </div>
      </div>
    </div>
  );
}

