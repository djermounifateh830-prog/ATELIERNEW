import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Radio, Clock, Check, ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { AutoRefreshInterval, RealtimeStatus } from '../../types';
import { realtimeSync } from '../../services/realtimeSync';

interface RealtimeIndicatorProps {
  onRefreshTriggered?: () => void;
}

export const RealtimeIndicator: React.FC<RealtimeIndicatorProps> = ({ onRefreshTriggered }) => {
  const [status, setStatus] = useState<RealtimeStatus>(realtimeSync.getStatus());
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubStatus = realtimeSync.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    const unsubSync = realtimeSync.onSync(() => {
      setIsSpinning(true);
      setTimeout(() => setIsSpinning(false), 800);
    });

    return () => {
      unsubStatus();
      unsubSync();
    };
  }, []);

  // Fermer le dropdown en cliquant à l'extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleManualRefresh = () => {
    setIsSpinning(true);
    realtimeSync.triggerManualRefresh();
    if (onRefreshTriggered) onRefreshTriggered();
    setTimeout(() => setIsSpinning(false), 700);
  };

  const handleSelectMode = (mode: AutoRefreshInterval) => {
    realtimeSync.setMode(mode);
    setIsOpen(false);
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Jamais';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getModeLabel = () => {
    switch (status.mode) {
      case 'sse':
        return 'Direct (SSE)';
      case '15':
        return 'Toutes les 15s';
      case '30':
        return 'Toutes les 30s';
      case '60':
        return 'Toutes les 60s';
      case 'off':
        return 'Manuel';
      default:
        return 'Direct';
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <div className="flex items-center rounded-lg bg-slate-950/70 border border-slate-700/80 shadow-sm overflow-hidden">
        {/* Statut cliquable ouvrant le menu */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title={`Synchronisation : ${getModeLabel()} • Dernière : ${formatLastSync(status.lastSyncTime)}`}
          className="px-2.5 py-1.5 flex items-center gap-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
        >
          {status.mode === 'sse' ? (
            <span className="relative flex h-2 w-2">
              {status.connected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${status.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
          ) : status.mode !== 'off' ? (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
            </span>
          )}

          <span className="hidden sm:inline font-mono text-[11px] text-slate-300">
            {getModeLabel()}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 opacity-70" />
        </button>

        {/* Bouton pour forcer le rafraîchissement manuel */}
        <button
          type="button"
          onClick={handleManualRefresh}
          title="Forcer la synchronisation avec SQLite maintenant"
          className="px-2 py-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 border-l border-slate-800 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      {/* Menu déroulant de configuration */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-white text-xs">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Synchronisation Temps Réel</span>
            </div>
            {status.connected ? (
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5" /> En ligne
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-1.5 py-0.2 rounded flex items-center gap-1">
                <WifiOff className="w-2.5 h-2.5" /> Veille
              </span>
            )}
          </div>

          {/* Choix de la fréquence */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
              Mode de rafraîchissement :
            </span>

            {[
              { id: 'sse', label: '⚡ Temps réel instantané (SSE)', desc: 'Propagation automatique en direct de chaque OF et commande' },
              { id: '15', label: '⏱️ Toutes les 15 secondes', desc: 'Rafraîchissement périodique rapide' },
              { id: '30', label: '⏱️ Toutes les 30 secondes', desc: 'Rafraîchissement modéré' },
              { id: '60', label: '⏱️ Toutes les 60 secondes', desc: 'Économie de bande passante' },
              { id: 'off', label: '✋ Manuel uniquement', desc: 'Actualisation uniquement sur clic' },
            ].map((item) => {
              const isSelected = status.mode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectMode(item.id as AutoRefreshInterval)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition flex items-start justify-between ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40 text-white'
                      : 'hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs text-slate-100 flex items-center gap-1.5">
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                      {item.desc}
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Métriques / État */}
          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 space-y-1 text-[11px] text-slate-400">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                Dernière synchronisation :
              </span>
              <span className="font-mono text-slate-200">{formatLastSync(status.lastSyncTime)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Événements reçus :</span>
              <span className="font-mono text-amber-400 font-bold">{status.syncCount}</span>
            </div>
            {status.lastEventTarget && (
              <div className="flex justify-between items-center">
                <span>Dernière cible :</span>
                <span className="font-mono text-sky-400">{status.lastEventTarget}</span>
              </div>
            )}
          </div>

          {/* Bouton forcer refresh */}
          <button
            type="button"
            onClick={handleManualRefresh}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? 'animate-spin text-amber-400' : ''}`} />
            <span>Actualiser maintenant</span>
          </button>
        </div>
      )}
    </div>
  );
};
