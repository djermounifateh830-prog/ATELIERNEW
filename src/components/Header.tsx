import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  HelpCircle,
  Calculator,
  Boxes,
  History,
  Terminal,
  ClipboardCheck,
  Activity,
  Lock,
  Settings
} from 'lucide-react';
import { userService } from '../services/userService';
import { SystemLogsModal } from './common/SystemLogsModal';
import { OperatorBadge } from './common/OperatorBadge';
import { OperatorModal } from './common/OperatorModal';
import { RealtimeIndicator } from './common/RealtimeIndicator';
import { Article, ChuteItem, ChuteMaille, SuiviOF, DossierCommandeGlobal, UserProfile } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  articles?: Article[];
  chutesBarres?: Record<string, ChuteItem[]>;
  chutesMaille?: ChuteMaille[];
  suivisOF?: SuiviOF[];
  dossiers?: DossierCommandeGlobal[];
  articlesCount: number;
  chutesSheetsCount: number;
  onRefreshData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  articles = [],
  chutesBarres = {},
  chutesMaille = [],
  suivisOF = [],
  dossiers = [],
  articlesCount,
  chutesSheetsCount,
  onRefreshData
}) => {
  const [isLogsModalOpen, setIsLogsModalOpen] = useState<boolean>(false);
  const [isOperatorModalOpen, setIsOperatorModalOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserProfile>(userService.getActiveOperator());

  useEffect(() => {
    const unsub = userService.onOperatorChange(op => {
      setCurrentUser(op);
    });
    return unsub;
  }, []);

  const activeOfCount = suivisOF.filter(o => o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE').length;
  const dossiersActifsCount = (dossiers || []).filter(d => d && d.statut !== 'CLOTURE' && d.statut !== 'LIVRE' && d.statut !== 'TERMINE').length;
  const totalActifsAtelier = Math.max(activeOfCount, dossiersActifsCount);

  const allTabs = [
    {
      id: 'monitoring',
      label: '📊 Monitoring Atelier',
      icon: Activity,
      badge: totalActifsAtelier > 0 ? totalActifsAtelier : undefined,
      badgeBg: 'bg-emerald-600 text-white'
    },
    { id: 'ecosysteme', label: '📁 Écosystème & Commandes', icon: Boxes },
    {
      id: 'encours',
      label: '📋 Ordres en Cours (OF)',
      icon: ClipboardCheck,
      badge: activeOfCount > 0 ? activeOfCount : undefined,
      badgeBg: 'bg-blue-600 text-white'
    },
    { id: 'historique', label: '📜 Historique Commandes', icon: History },
    { id: 'stock', label: '📦 Gestion Stock & Chutes', icon: FileSpreadsheet },
    { id: 'devis', label: '💰 Devis & Coûts', icon: Calculator },
    { id: 'documentation', label: '📘 Règles Métier', icon: HelpCircle },
    { id: 'parametres', label: '⚙️ Paramètres', icon: Settings }
  ];

  // Filtrage selon les autorisations paramétrables via checkboxes de l'utilisateur actif
  const authorizedTabs = allTabs.filter(tab => userService.hasTabAccess(tab.id, currentUser));
  const tabsToRender = authorizedTabs.length > 0 ? authorizedTabs : allTabs;

  return (
    <header className="bg-slate-900 text-white shadow-xl border-b border-slate-800">
      {/* Top Banner (Full Screen Width) */}
      <div className="w-full px-2 sm:px-3 lg:px-4 py-3 sm:py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center shadow-md font-black text-slate-950 text-xl tracking-wider">
            3M
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-50">
                3M ATELIER — OPTIMISATION DE DÉCOUPE
              </h1>
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs px-2 py-0.5 rounded-full font-semibold">
                v2.4
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span className="text-emerald-400 font-medium">
                {articlesCount} Articles actifs
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-400 font-medium">
                {chutesSheetsCount} Familles de chutes
              </span>
            </p>
          </div>
        </div>

        {/* Action Buttons & Badges */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Indicateur et Contrôle Temps Réel (SSE / Polling) */}
          <RealtimeIndicator onRefreshTriggered={onRefreshData} />

          {/* Badge de l'Opérateur Connecté (Rôle & Profil) */}
          <OperatorBadge onClick={() => setIsOperatorModalOpen(true)} />

          {/* Bouton Verrouiller Session Rapide */}
          <button
            onClick={() => {
              userService.lockSession();
            }}
            title="Verrouiller l'accès à l'application par Code PIN"
            className="p-1.5 text-xs text-slate-300 hover:text-amber-400 bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition cursor-pointer flex items-center gap-1 shadow"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px] font-medium">Verrouiller</span>
          </button>

          <button
            onClick={() => setIsLogsModalOpen(true)}
            title="Ouvrir le journal des logs et la traçabilité système"
            className="px-3 py-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/60 rounded-lg transition border border-amber-500/40 flex items-center gap-1.5 cursor-pointer shadow"
          >
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">📜 Logs &amp; Traçabilité</span>
            <span className="sm:hidden">📜 Logs</span>
          </button>
        </div>
      </div>

      {/* Profils & Opérateurs Modal */}
      <OperatorModal
        isOpen={isOperatorModalOpen}
        onClose={() => setIsOperatorModalOpen(false)}
      />

      {/* System Logs Modal */}
      <SystemLogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
        extraSystemInfo={{
          activeTab,
          articlesActifs: articlesCount,
          famillesChutes: chutesSheetsCount,
          totalArticlesCharges: articles.length,
          chutesFamilles: Object.keys(chutesBarres),
          chutesMailleCount: chutesMaille.length
        }}
      />

      {/* Navigation Tabs (Full Screen Width) */}
      <div className="w-full px-2 sm:px-3 lg:px-4">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none">
          {tabsToRender.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <a
                key={tab.id}
                href={`?tab=${tab.id}`}
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    setActiveTab(tab.id);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    isActive ? 'bg-slate-950 text-amber-400' : 'bg-blue-600 text-white'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
