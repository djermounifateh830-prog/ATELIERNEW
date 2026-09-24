import { useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = '3m_atelier_theme';
const THEME_CHANGE_EVENT = '3m_atelier_theme_changed';

class ThemeService {
  private currentMode: ThemeMode = 'dark';
  private mediaQuery: MediaQueryList | null = null;
  private listeners: Set<(mode: ThemeMode, resolved: ResolvedTheme) => void> = new Set();
  private initialized = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.initialized) return;
    if (typeof window === 'undefined') return;

    // Charger le mode sauvegardé ou par défaut 'dark'
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved && (saved === 'dark' || saved === 'light' || saved === 'auto')) {
        this.currentMode = saved;
      } else {
        this.currentMode = 'dark';
      }
    } catch {
      this.currentMode = 'dark';
    }

    // Configurer l'écouteur media query système
    if (window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleMediaChange = () => {
        if (this.currentMode === 'auto') {
          this.applyTheme();
        }
      };
      if (this.mediaQuery.addEventListener) {
        this.mediaQuery.addEventListener('change', handleMediaChange);
      } else {
        // Fallback anciens navigateurs
        (this.mediaQuery as any).addListener(handleMediaChange);
      }
    }

    // Écouter les changements dans d'autres onglets
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const newMode = e.newValue as ThemeMode;
        if (newMode === 'dark' || newMode === 'light' || newMode === 'auto') {
          this.currentMode = newMode;
          this.applyTheme();
        }
      }
    });

    this.applyTheme();
    this.initialized = true;
  }

  public getThemeMode(): ThemeMode {
    return this.currentMode;
  }

  public getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  public getResolvedTheme(): ResolvedTheme {
    if (this.currentMode === 'auto') {
      return this.getSystemTheme();
    }
    return this.currentMode;
  }

  public setThemeMode(mode: ThemeMode) {
    this.currentMode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
      console.warn('Impossible de sauvegarder le thème dans localStorage:', e);
    }
    this.applyTheme();
  }

  public toggleNextTheme(): ThemeMode {
    const cycle: ThemeMode[] = ['dark', 'light', 'auto'];
    const currentIndex = cycle.indexOf(this.currentMode);
    const nextMode = cycle[(currentIndex + 1) % cycle.length];
    this.setThemeMode(nextMode);
    return nextMode;
  }

  public subscribe(listener: (mode: ThemeMode, resolved: ResolvedTheme) => void): () => void {
    this.listeners.add(listener);
    // Notification immédiate de l'état actuel
    listener(this.currentMode, this.getResolvedTheme());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private applyTheme() {
    if (typeof document === 'undefined') return;

    const resolved = this.getResolvedTheme();
    const root = document.documentElement;

    if (resolved === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }

    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-mode', this.currentMode);
    root.style.colorScheme = resolved;

    // Déclencher l'événement personnalisé pour les composants non-React
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, {
      detail: { mode: this.currentMode, resolved }
    }));

    // Notifier les abonnés React
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentMode, resolved);
      } catch (err) {
        console.error('Erreur listener thème:', err);
      }
    });
  }
}

export const themeService = new ThemeService();

/**
 * Hook React pour utiliser et contrôler le thème
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => themeService.getThemeMode());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => themeService.getResolvedTheme());

  useEffect(() => {
    return themeService.subscribe((newMode, newResolved) => {
      setMode(newMode);
      setResolved(newResolved);
    });
  }, []);

  return {
    themeMode: mode,
    resolvedTheme: resolved,
    isDark: resolved === 'dark',
    isLight: resolved === 'light',
    isAuto: mode === 'auto',
    setThemeMode: (newMode: ThemeMode) => themeService.setThemeMode(newMode),
    toggleNextTheme: () => themeService.toggleNextTheme(),
    systemTheme: themeService.getSystemTheme()
  };
}
