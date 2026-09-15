'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Printer, RefreshCw, Maximize2, Minimize2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Loading from '@/app/dashboard/loading';

interface ImprentaClientPageProps {
  initialIframeUrl?: string;
}

export function ImprentaClientPage({ initialIframeUrl }: ImprentaClientPageProps) {
  const { appUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const defaultUrl = 'https://ais-dev-gigbsa3huhlib2awffzpiu-361305856613.us-west2.run.app/?portal=token-xivg8-5268';
  const iframeUrl = initialIframeUrl || defaultUrl;

  // Access check
  const hasAccess = appUser?.role === 'admin' || appUser?.permissions?.imprenta;

  // Reset loading when URL or reload key changes
  useEffect(() => {
    setIsLoading(true);
  }, [iframeUrl, reloadKey]);

  // Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  if (!hasAccess) {
    return (
      <div className="flex h-[60vh] items-center justify-center p-4">
        <Card className="max-w-[420px] w-full text-center border-red-200 shadow-lg shadow-red-500/5">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-2 animate-bounce">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-black uppercase text-red-600">Acceso Restringido</CardTitle>
            <CardDescription className="text-xs text-red-700/80">
              No tienes los permisos necesarios para acceder a la sección de Imprenta. Contacta al administrador principal.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleReload = () => {
    setReloadKey(prev => prev + 1);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  return (
    <div className={cn("flex flex-col gap-4 w-full transition-all duration-300", isFullscreen ? "fixed inset-0 z-50 bg-background p-0 h-screen w-screen" : "space-y-4")}>
      
      {/* Menu / Header Bar (Hidden or floating in fullscreen) */}
      {!isFullscreen ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground uppercase flex items-center gap-2">
              <Printer className="h-6 w-6 text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
              Imprenta
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReload}
              className="rounded-xl font-bold gap-2 text-xs h-9 px-4 active:scale-95 transition-transform"
              title="Recargar aplicación"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Recargar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="rounded-xl font-bold gap-2 text-xs h-9 px-4 active:scale-95 transition-transform"
              title="Pantalla completa"
            >
              <Maximize2 className="h-4 w-4" />
              Pantalla Completa
            </Button>
          </div>
        </div>
      ) : (
        /* Floating control panel in fullscreen mode */
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-background/80 backdrop-blur-md p-1.5 rounded-2xl border shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReload}
            className="rounded-xl h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            title="Recargar"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="rounded-xl h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            title="Salir de pantalla completa"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Main Iframe Viewer */}
      <div 
        className={cn(
          "relative w-full rounded-2xl border border-border/40 overflow-hidden bg-white/50 backdrop-blur-sm shadow-xl flex-grow transition-all duration-300",
          isFullscreen 
            ? "h-screen w-screen rounded-none border-none" 
            : "h-[calc(100dvh-150px)] md:h-[calc(100dvh-200px)]"
        )}
      >
        {/* Loading Spinner Overlaid */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
            <Loading message="Estamos cargando la imprenta" subtitle="Conectando con la aplicación financiera" showSkeletonPreview={false} />
          </div>
        )}

        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={iframeUrl}
          onLoad={() => setIsLoading(false)}
          className="w-full h-full border-0 select-none"
          allow="clipboard-read; clipboard-write; camera; microphone; geolocation"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>
    </div>
  );
}
