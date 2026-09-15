import React from 'react';
import Link from 'next/link';

export interface SunShadeLogoProps {
  /**
   * Layout variant:
   * - 'icon': Just the radiant canopy emblem
   * - 'horizontal': Emblem on left, typography on right (best for navbars and headers)
   * - 'stacked': Emblem centered above typography
   */
  variant?: 'icon' | 'horizontal' | 'stacked';
  /**
   * Pre-set size or custom pixel height for the icon
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  /**
   * Whether to display the "Dynamic Work Item Engine" tagline
   */
  showTagline?: boolean;
  /**
   * Whether to display a pill badge (e.g. 'v1.0' or 'LIVE')
   */
  showBadge?: boolean;
  badgeText?: string;
  /**
   * Optional destination link. If passed, wraps in a Next.js <Link>
   */
  href?: string;
  className?: string;
  priority?: boolean;
  /**
   * On mobile (<640px), hide typography lockup and render only emblem icon
   */
  hideTextOnMobile?: boolean;
}

const SIZE_MAP = {
  xs: { icon: 20, text: 'text-sm', tagline: 'text-[9px]' },
  sm: { icon: 28, text: 'text-base', tagline: 'text-[10px]' },
  md: { icon: 36, text: 'text-lg', tagline: 'text-[11px]' },
  lg: { icon: 48, text: 'text-2xl', tagline: 'text-xs' },
  xl: { icon: 64, text: 'text-3xl', tagline: 'text-sm' },
};

/**
 * Scalable SunShade Canopy Emblem SVG
 */
export function SunShadeEmblem({ size = 36, className = '' }: { size?: number; className?: string }) {
  const idSuffix = React.useId().replace(/:/g, '');
  const sunGold = `sunGold_${idSuffix}`;
  const canopyArc = `canopyArc_${idSuffix}`;
  const meshNet = `meshNet_${idSuffix}`;

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-200 group-hover:scale-105 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={sunGold} x1="256" y1="20" x2="256" y2="490" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="25%" stopColor="#F59E0B" />
          <stop offset="70%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#CC5500" />
        </linearGradient>

        <linearGradient id={canopyArc} x1="60" y1="180" x2="452" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CC5500" />
          <stop offset="30%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#FDE68A" />
          <stop offset="70%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#CC5500" />
        </linearGradient>

        <linearGradient id={meshNet} x1="120" y1="160" x2="392" y2="470" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="40%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
      </defs>

      {/* Sun Rays */}
      <g id="sun-rays" fill={`url(#${sunGold})`}>
        <path d="M 251 12 L 261 12 L 257 88 L 255 88 Z" />
        <path d="M 183 29 L 192 25 L 208 97 L 205 98 Z" />
        <path d="M 329 25 L 338 29 L 316 98 L 313 97 Z" />
        <path d="M 124 74 L 131 68 L 168 126 L 164 129 Z" />
        <path d="M 388 68 L 395 74 L 357 129 L 353 126 Z" />
        <path d="M 77 138 L 82 131 L 140 168 L 137 172 Z" />
        <path d="M 435 131 L 440 138 L 382 172 L 379 168 Z" />
      </g>

      {/* Upper Sun Arc */}
      <path
        d="M 172 126 C 196 98 225 84 256 84 C 287 84 316 98 340 126 C 322 108 298 98 256 98 C 214 98 190 108 172 126 Z"
        fill={`url(#${sunGold})`}
      />

      {/* Geodesic Mesh / Node Shield */}
      <g stroke={`url(#${meshNet})`} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M 148 240 C 148 350 215 425 256 470 C 297 425 364 350 364 240"
          fill="none"
          strokeWidth="15"
          stroke={`url(#${sunGold})`}
        />
        <line x1="148" y1="240" x2="256" y2="190" />
        <line x1="364" y1="240" x2="256" y2="190" />
        <line x1="200" y1="230" x2="312" y2="230" />
        <line x1="156" y1="290" x2="256" y2="280" />
        <line x1="356" y1="290" x2="256" y2="280" />
        <line x1="180" y1="360" x2="256" y2="380" />
        <line x1="332" y1="360" x2="256" y2="380" />
        <line x1="256" y1="280" x2="200" y2="360" />
        <line x1="256" y1="280" x2="312" y2="360" />
        <line x1="256" y1="380" x2="256" y2="465" />
        <path d="M 195 220 Q 256 320 280 435" stroke={`url(#${sunGold})`} strokeWidth="14" fill="none" />
        <path d="M 317 220 Q 256 320 232 435" stroke={`url(#${sunGold})`} strokeWidth="14" fill="none" />
      </g>

      {/* Network Junction Nodes */}
      <g fill={`url(#${sunGold})`}>
        <circle cx="256" cy="190" r="14" />
        <circle cx="200" cy="230" r="13" />
        <circle cx="312" cy="230" r="13" />
        <circle cx="256" cy="280" r="14" />
        <circle cx="195" cy="326" r="13" />
        <circle cx="317" cy="326" r="13" />
        <circle cx="256" cy="385" r="13" />
      </g>

      {/* Overarching Canopy Wings */}
      <g>
        <path d="M 52 308 C 88 200 168 135 256 128 C 172 152 108 215 78 300 Z" fill={`url(#${canopyArc})`} />
        <path d="M 460 308 C 424 200 344 135 256 128 C 340 152 404 215 434 300 Z" fill={`url(#${canopyArc})`} />
        <path
          d="M 48 308 C 100 160 210 120 256 120 C 302 120 412 160 464 308 C 400 185 295 152 256 152 C 217 152 112 185 48 308 Z"
          fill={`url(#${canopyArc})`}
        />
        <circle cx="48" cy="308" r="18" fill={`url(#${sunGold})`} />
        <circle cx="464" cy="308" r="18" fill={`url(#${sunGold})`} />
      </g>
    </svg>
  );
}

/**
 * SunShade Tracker Logo Component
 * High-performance vector branding for the SunShade Tracker ecosystem.
 */
export function SunShadeLogo({
  variant = 'horizontal',
  size = 'md',
  showTagline = false,
  showBadge = false,
  badgeText = 'v1.0 Live',
  href,
  className = '',
  hideTextOnMobile = false,
}: SunShadeLogoProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size].icon;
  const textClass = typeof size === 'number' ? 'text-lg' : SIZE_MAP[size].text;
  const taglineClass = typeof size === 'number' ? 'text-[10px]' : SIZE_MAP[size].tagline;

  const content = (
    <div
      data-testid="sunshade-logo"
      className={`inline-flex items-center gap-2.5 select-none ${
        variant === 'stacked' ? 'flex-col text-center' : 'flex-row'
      } ${className}`}
    >
      {/* Emblem Icon with subtle ambient backdrop */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute -inset-1 rounded-full bg-amber-500/10 blur-sm pointer-events-none"
          aria-hidden="true"
        />
        <SunShadeEmblem size={pixelSize} />
      </div>

      {/* Typography Lockup */}
      {variant !== 'icon' && (
        <div
          data-testid="sunshade-logo-text"
          className={`flex flex-col ${variant === 'stacked' ? 'items-center' : 'items-start'} ${
            hideTextOnMobile ? 'hidden sm:flex' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`font-extrabold tracking-tight text-white ${textClass}`}>
              SunShade <span className="text-emerald-400">Tracker</span>
            </span>
            {showBadge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 uppercase tracking-wider">
                {badgeText}
              </span>
            )}
          </div>

          {showTagline && (
            <span className={`font-mono uppercase tracking-[0.2em] font-semibold text-slate-400 ${taglineClass}`}>
              Dynamic Work Item Engine
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group inline-flex items-center focus:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}

export default SunShadeLogo;
