import { CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  logoUrl?: string | null;
  appName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  logoFormat?: 'square' | 'horizontal';
  customHeight?: number;
  customWidth?: number;
  showText?: boolean;
  borderless?: boolean;
}

export function Logo({ 
  className, 
  logoUrl, 
  appName = 'CrediControl', 
  size = 'md',
  logoFormat = 'square',
  customHeight,
  customWidth,
  showText = true,
  borderless = false,
}: LogoProps) {
  const dimensions = {
    square: {
      sm: 'h-7 aspect-square',
      md: 'h-9 aspect-square',
      lg: 'h-16 aspect-square',
      xl: 'h-32 aspect-square'
    },
    horizontal: {
      sm: 'h-7 aspect-[16/9]',
      md: 'h-9 aspect-[16/9]',
      lg: 'h-16 aspect-[16/9]',
      xl: 'h-32 aspect-[16/9]'
    }
  };

  const isVideo = logoUrl && (
    logoUrl.split('?')[0].toLowerCase().endsWith('.mp4') || 
    logoUrl.split('?')[0].toLowerCase().endsWith('.webm') ||
    logoUrl.split('?')[0].toLowerCase().endsWith('.ogg') ||
    logoUrl.includes('video')
  );

  const formatKey = (logoFormat === 'horizontal' || logoFormat === 'square') ? logoFormat : 'square';
  const sizeKey = (size === 'sm' || size === 'md' || size === 'lg' || size === 'xl') ? size : 'md';
  const aspectClass = formatKey === 'horizontal' ? 'aspect-[16/9]' : 'aspect-square';

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 text-sm font-bold tracking-tight transition-all group justify-center',
        className
      )}
    >
      <div 
        className={cn(
          "relative overflow-hidden transition-all duration-300 group-hover:scale-105 group-active:scale-95 flex items-center justify-center",
          !borderless && (size === 'sm' || size === 'md' ? "rounded-xl" : "rounded-2xl"),
          !borderless && "border border-border/40 bg-white/95 shadow-[0_8px_30px_rgb(0,0,0,0.06),_0_0_15px_rgba(59,130,246,0.03)] hover:border-primary/30 hover:shadow-[0_8px_35px_rgba(59,130,246,0.12),_0_0_20px_rgba(59,130,246,0.15)]",
          !customHeight && !customWidth ? dimensions[formatKey][sizeKey] : aspectClass
        )}
        style={{
          height: customHeight ? `${customHeight}px` : undefined,
          width: customWidth ? `${customWidth}px` : undefined,
        }}
      >
        {logoUrl ? (
          isVideo ? (
            <video 
              src={logoUrl} 
              autoPlay 
              loop 
              muted 
              playsInline
              className="absolute inset-0 h-full w-full object-cover" 
            />
          ) : (
            <Image 
              src={logoUrl} 
              alt="Logo" 
              fill
              className={cn("object-contain", borderless ? "p-0" : "p-1.5")} 
            />
          )
        ) : (
          <div className={cn("flex h-full w-full items-center justify-center text-primary", !borderless && "bg-primary/10")}>
            <CreditCard className={cn(size === 'sm' ? 'h-3.5 w-3.5' : size === 'xl' ? 'h-12 w-12' : 'h-5 w-5')} />
          </div>
        )}
      </div>
      
      {formatKey !== 'horizontal' && showText && (
        <span className={cn(
          "bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70",
          (size === 'sm' || size === 'md' || size === 'lg') ? "hidden lg:inline-block text-sm" : "inline-block text-2xl"
        )}>
          {appName}
        </span>
      )}
    </div>
  );
}
