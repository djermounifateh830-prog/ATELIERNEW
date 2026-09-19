import React, { useState, useEffect } from 'react';
import { logger, LogEntry } from '../../services/logger';
import {
  Terminal,
  Trash2,
  Filter,
  CheckCircle,
  Database,
  Zap,
  AlertTriangle,
  AlertCircle,
  Scissors,
  Calculator,
  Bug,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Info,
  RefreshCw
} from 'lucide-react';

interface SystemLogsViewerProps {
  embedded?: boolean;
  extraSystemInfo?: any;
  onClose?: () => void;
}

export const SystemLogsViewer: React.FC<SystemLogsViewerProps> = ({
  embedded = false,
  extraSystemInfo,
  onClose
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedAi, setCopiedAi] = useState(false);

  useEffect(() => {
    const unsub = logger.subscribe(setLogs);
    return unsub;
  }, []);

  // Catégories de filtres conviviales en français
  const filterCategories = [
    { key: 'ALL', label: 'Tous', icon: Terminal, count: logs.length },
    { key: 'ACTION', label: 'Actions Atelier', icon: Zap, count: logs.filter(l => l.level === 'ACTION').length },
    { key: 'CALC', label: 'Calculs & Débits', icon: Calculator, count: logs.filter(l => l.level === 'CALC').length },
    { key: 'OPTIM', label: 'Optimisations Chutes', icon: Scissors, count: logs.filter(l => l.level === 'OPTIM').length },
    { key: 'SQLITE', label: 'Base SQLite', icon: Database, count: logs.filter(l => l.level === 'SQLITE').length },
    { key: 'ANOMALY_WARN', label: 'Alertes & Anomalies', icon: AlertTriangle, count: logs.filter(l => l.level === 'ANOMALY' || l.level === 'WARN').length },
    { key: 'ERROR', label: 'Erreurs', icon: AlertCircle, count: logs.filter(l => l.level === 'ERROR').length }
  ];

  const filteredLogs = logs.filter(l => {
    if (filterLevel === 'ANOMALY_WARN') {
      if (l.level !== 'ANOMALY' && l.level !== 'WARN') return false;
    } else if (filterLevel !== 'ALL' && l.level !== filterLevel) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchMsg = (l.message || '').toLowerCase().includes(q);
      const matchCat = (l.category || '').toLowerCase().includes(q);
      const matchDetails = l.details ? JSON.stringify(l.details).toLowerCase().includes(q) : false;
      return matchMsg || matchCat || matchDetails;
    }
    return true;
  });

  const handleCopyAiReport = async () => {
    try {
      const report = logger.exportDiagnosticForAI(extraSystemInfo);
      await navigator.clipboard.writeText(report);
      setCopiedAi(true);
      setTimeout(() => setCopiedAi(false), 3000);
    } catch {
      const report = logger.exportDiagnosticForAI(extraSystemInfo);
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedAi(true);
      setTimeout(() => setCopiedAi(false), 3000);
    }
  };

  const handleDownloadJson = () => {
    const jsonSnapshot = logger.exportJson();
    const blob = new Blob([JSON.stringify(jsonSnapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `3m_diagnostic_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    switch (level) {
      case 'SQLITE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-sky-950/80 text-sky-300 border border-sky-600/40 flex items-center gap-1">
            <Database className="w-3 h-3 text-sky-400" />
            SQLITE
          </span>
        );
      case 'ACTION':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-950/80 text-amber-300 border border-amber-600/40 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            ACTION
          </span>
        );
      case 'CALC':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-950/80 text-purple-300 border border-purple-600/40 flex items-center gap-1">
            <Calculator className="w-3 h-3 text-purple-400" />
            CALC
          </span>
        );
      case 'OPTIM':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950/80 text-emerald-300 border border-emerald-600/40 flex items-center gap-1">
            <Scissors className="w-3 h-3 text-emerald-400" />
            OPTIM
          </span>
        );
      case 'ANOMALY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-950/80 text-rose-300 border border-rose-600/40 flex items-center gap-1">
            <Bug className="w-3 h-3 text-rose-400" />
            ANOMALIE
          </span>
        );
      case 'WARN':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-yellow-950/80 text-yellow-300 border border-yellow-600/40 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-400" />
            WARN
          </span>
        );
      case 'ERROR':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-950 text-red-300 border border-red-500 flex items-center gap-1 animate-pulse">
            <AlertCircle className="w-3 h-3 text-red-400" />
            ERROR
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            INFO
          </span>
        );
    }
  };

  const errorCount = logs.filter(l => l.level === 'ERROR').length;
  const anomalyCount = logs.filter(l => l.level === 'ANOMALY').length;

  return (
    <div className={`flex flex-col font-sans ${embedded ? 'w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden min-h-[680px]' : 'w-full h-full'}`}>
      {/* Header */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm text-slate-100">
                Journal d'Activité &amp; Traçabilité Complète (Live Logs)
              </h3>
              <span className="text-[10px] px-2 py-0.5 bg-emerald-950 text-emerald-400 rounded-full border border-emerald-800 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                En direct
              </span>
              {errorCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-rose-950 text-rose-300 rounded-full border border-rose-700 font-mono font-bold">
                  {errorCount} Erreur(s)
                </span>
              )}
              {anomalyCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-950 text-amber-300 rounded-full border border-amber-700 font-mono font-bold">
                  {anomalyCount} Anomalie(s)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Traçabilité intégrale : Requêtes SQLite, Saisies de commandes, Calculs de débits, Moteur d'optimisation 1D &amp; Erreurs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* BOUTON COPIER RAPPORT POUR IA */}
          <button
            onClick={handleCopyAiReport}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer ${
              copiedAi
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
            title="Copie l'intégralité du diagnostic système formaté pour le coller directement à une IA (ChatGPT, Claude, Gemini)"
          >
            {copiedAi ? <CheckCircle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            <span>{copiedAi ? '✓ Rapport IA Copié !' : '📋 Copier Rapport pour IA'}</span>
          </button>

          {/* BOUTON TÉLÉCHARGER JSON */}
          <button
            onClick={handleDownloadJson}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
            title="Télécharger l'instantané des logs au format JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm('Voulez-vous vraiment vider le journal des logs ?')) {
                logger.clear();
              }
            }}
            className="px-2.5 py-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl border border-slate-800 transition flex items-center gap-1.5 text-xs cursor-pointer"
            title="Vider les logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Vider</span>
          </button>
        </div>
      </div>

      {/* Toolbar Filtres & Recherche */}
      <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterCategories.map(cat => {
            const Icon = cat.icon;
            const isSelected = filterLevel === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setFilterLevel(cat.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  isSelected ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-400'
                }`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Rechercher dans les logs (action, réf, erreur)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-72 transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Console / Logs Area */}
      <div className={`overflow-y-auto p-4 space-y-2 font-mono text-xs bg-slate-950 ${embedded ? 'max-h-[580px] min-h-[420px]' : 'flex-1'}`}>
        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 italic space-y-2">
            <div className="text-2xl">📋</div>
            <div>Aucun événement ne correspond au filtre actif.</div>
          </div>
        ) : (
          filteredLogs.map(l => {
            const isExpanded = expandedId === l.id;
            const hasDetails = l.details !== undefined || l.stack || l.context;

            return (
              <div
                key={l.id}
                className={`rounded-lg border transition ${
                  l.level === 'ERROR'
                    ? 'bg-red-950/30 border-red-900/60'
                    : l.level === 'ANOMALY'
                    ? 'bg-amber-950/20 border-amber-900/40'
                    : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-900'
                }`}
              >
                <div
                  onClick={() => hasDetails && setExpandedId(isExpanded ? null : l.id)}
                  className={`p-2.5 flex items-start gap-3 select-none ${
                    hasDetails ? 'cursor-pointer' : ''
                  }`}
                >
                  <span className="text-[11px] text-slate-500 shrink-0 font-mono">
                    {l.timestamp}
                  </span>

                  <div className="shrink-0">{getLevelBadge(l.level)}</div>

                  <span className="text-amber-400 font-bold shrink-0 text-[11px]">
                    [{l.category}]
                  </span>

                  <span className="text-slate-200 break-all flex-1 font-sans text-[12px]">
                    {l.message}
                  </span>

                  {hasDetails && (
                    <div className="text-slate-400 hover:text-white shrink-0 flex items-center gap-1 text-[10px]">
                      <span>Détails</span>
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  )}
                </div>

                {/* Panneau dépliable de détails et pile d'exécution */}
                {isExpanded && hasDetails && (
                  <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] space-y-2 font-mono text-slate-300">
                    {l.context && (
                      <div>
                        <div className="text-amber-400/80 font-bold mb-1">Contexte actif :</div>
                        <pre className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px] overflow-x-auto text-sky-300">
                          {JSON.stringify(l.context, null, 2)}
                        </pre>
                      </div>
                    )}

                    {l.details !== undefined && (
                      <div>
                        <div className="text-slate-400 font-bold mb-1">Payload / Données :</div>
                        <pre className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px] overflow-x-auto text-emerald-300">
                          {typeof l.details === 'string' ? l.details : JSON.stringify(l.details, null, 2)}
                        </pre>
                      </div>
                    )}

                    {l.stack && (
                      <div>
                        <div className="text-red-400 font-bold mb-1">Stack Trace (Origine de l'erreur) :</div>
                        <pre className="p-2 bg-red-950/40 rounded border border-red-900/60 text-[10px] overflow-x-auto text-red-300 whitespace-pre-wrap">
                          {l.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          <span>
            <strong>{filteredLogs.length}</strong> affiché(s) sur <strong>{logs.length}</strong> événements
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">
            Journal temps réel des opérations de l'atelier
          </span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition cursor-pointer"
          >
            Fermer
          </button>
        )}
      </div>
    </div>
  );
};
