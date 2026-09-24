import React, { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Monitor, Check } from 'lucide-react';
import { useTheme, ThemeMode } from '../../services/themeService';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ showLabel = false, className = '' }) => {
  const { themeMode, resolvedTheme, setThemeMode, systemTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const options: Array<{
    mode: ThemeMode;
    label: string;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      mode: 'dark',
      label: 'Sombre',
      sublabel: 'Idéal atelier & écrans tactiles',
      icon: Moon
    },
    {
      mode: 'light',
      label: 'Clair',
      sublabel: 'Haute clarté & travail de bureau',
      icon: Sun
    },
    {
      mode: 'auto',
      label: 'Automatique',
      sublabel: `Suit l'OS (${systemTheme === 'dark' ? 'Sombre' : 'Clair'})`,
      icon: Monitor
    }
  ];

  const CurrentIcon = themeMode === 'auto' ? Monitor : themeMode === 'light' ? Sun : Moon;
  const currentLabel = themeMode === 'auto' ? 'Auto' : themeMode === 'light' ? 'Clair' : 'Sombre';

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={`Thème d'affichage : ${currentLabel} (cliquez pour modifier)`}
        aria-label="Changer de thème"
        className="p-1.5 text-xs text-slate-300 hover:text-amber-400 bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition cursor-pointer flex items-center gap-1.5 shadow"
      >
        <CurrentIcon className="w-3.5 h-3.5 text-amber-400" />
        {showLabel && (
          <span className="text-[11px] font-medium text-slate-200 hidden sm:inline">
            {currentLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl z-50 p-1.5 space-y-1 animate-in fade-in duration-150">
          <div className="px-2.5 py-1.5 border-b border-slate-800">
            <p className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
              Thème d'affichage
            </p>
            <p className="text-[10px] text-slate-400">
              Actif : <span className="font-semibold text-amber-400">{currentLabel}</span> ({resolvedTheme === 'dark' ? 'Rendu Sombre' : 'Rendu Clair'})
            </p>
          </div>

          <div className="space-y-0.5">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isSelected = themeMode === opt.mode;

              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    setThemeMode(opt.mode);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1 rounded-md ${isSelected ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs leading-tight">{opt.label}</div>
                      <div className="text-[10px] text-slate-400 leading-tight truncate">
                        {opt.sublabel}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
