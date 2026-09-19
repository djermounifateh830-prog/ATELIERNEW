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
  Settings,
  GripVertical,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
  X,
  Check
} from 'lucide-react';
import { userService } from '../services/userService';
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

const DEFAULT_TAB_ORDER = [
  'monitoring',
  'ecosysteme',
  'encours',
  'historique',
  'stock',
  'devis',
  'documentation',
  'parametres'
];

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
  const [isOperatorModalOpen, setIsOperatorModalOpen] = useState<boolean>(false);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserProfile>(userService.getActiveOperator());

  // Ordre des onglets personnalisable sauvegardé en local
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('3m_tabs_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Fusionner avec les tabs par défaut au cas où de nouveaux onglets sont ajoutés
          const combined = [...parsed];
          DEFAULT_TAB_ORDER.forEach(id => {
            if (!combined.includes(id)) combined.push(id);
          });
          return combined;
        }
      }
    } catch (e) {
      console.warn('Erreur lecture 3m_tabs_order', e);
    }
    return DEFAULT_TAB_ORDER;
  });

  // État du drag-and-drop
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = userService.onOperatorChange(op => {
      setCurrentUser(op);
    });
    return unsub;
  }, []);

  const saveTabOrder = (newOrder: string[]) => {
    setTabOrder(newOrder);
    try {
      localStorage.setItem('3m_tabs_order', JSON.stringify(newOrder));
    } catch (e) {
      console.warn('Erreur sauvegarde 3m_tabs_order', e);
    }
  };

  const handleResetTabOrder = () => {
    saveTabOrder(DEFAULT_TAB_ORDER);
  };

  const moveTab = (tabId: string, direction: 'left' | 'right') => {
    const index = tabOrder.indexOf(tabId);
    if (index === -1) return;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tabOrder.length) return;

    const newOrder = [...tabOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    saveTabOrder(newOrder);
  };

  // Gestionnaires HTML5 Drag and Drop
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTabId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTabId !== targetId) {
      setDragOverTabId(targetId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedTabId;
    if (!sourceId || sourceId === targetId) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }

    const newOrder = [...tabOrder];
    const sourceIndex = newOrder.indexOf(sourceId);
    const targetIndex = newOrder.indexOf(targetId);

    if (sourceIndex !== -1 && targetIndex !== -1) {
      const [removed] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(targetIndex, 0, removed);
      saveTabOrder(newOrder);
    }

    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const handleDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const activeOfCount = suivisOF.filter(o => o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE').length;
  const dossiersActifsCount = (dossiers || []).filter(d => d && d.statut !== 'CLOTURE' && d.statut !== 'LIVRE' && d.statut !== 'TERMINE').length;
  const totalActifsAtelier = Math.max(activeOfCount, dossiersActifsCount);

  const tabDefinitions: Record<string, { label: string; icon: any; badge?: number; badgeBg?: string }> = {
    monitoring: {
      label: '📊 Monitoring Atelier',
      icon: Activity,
      badge: totalActifsAtelier > 0 ? totalActifsAtelier : undefined,
      badgeBg: 'bg-emerald-600 text-white'
    },
    ecosysteme: { label: '📁 Écosystème & Commandes', icon: Boxes },
    encours: {
      label: '📋 Ordres en Cours (OF)',
      icon: ClipboardCheck,
      badge: activeOfCount > 0 ? activeOfCount : undefined,
      badgeBg: 'bg-blue-600 text-white'
    },
    historique: { label: '📜 Historique Commandes', icon: History },
    stock: { label: '📦 Gestion Stock & Chutes', icon: FileSpreadsheet },
    devis: { label: '💰 Devis & Coûts', icon: Calculator },
    documentation: { label: '📘 Règles Métier', icon: HelpCircle },
    parametres: { label: '⚙️ Paramètres', icon: Settings }
  };

  // Ordonner les onglets selon tabOrder
  const allTabs = tabOrder
    .map(id => {
      const def = tabDefinitions[id];
      if (!def) return null;
      return { id, ...def };
    })
    .filter(Boolean) as Array<{ id: string; label: string; icon: any; badge?: number; badgeBg?: string }>;

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
        </div>
      </div>

      {/* Profils & Opérateurs Modal */}
      <OperatorModal
        isOpen={isOperatorModalOpen}
        onClose={() => setIsOperatorModalOpen(false)}
      />

      {/* Modal Réorganiser les onglets */}
      {isReorderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Personnaliser l'Ordre des Onglets
                </h3>
              </div>
              <button
                onClick={() => setIsReorderModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Glissez-déposez les onglets directement dans la barre de navigation, ou utilisez les flèches ci-dessous pour modifier leur disposition selon vos priorités.
            </p>

            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {tabOrder.map((id, index) => {
                const def = tabDefinitions[id];
                if (!def) return null;
                const Icon = def.icon;
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
                      <Icon className="w-4 h-4 text-amber-400" />
                      <span>{def.label}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveTab(id, 'left')}
                        disabled={index === 0}
                        title="Déplacer vers la gauche / plus haut"
                        className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveTab(id, 'right')}
                        disabled={index === tabOrder.length - 1}
                        title="Déplacer vers la droite / plus bas"
                        className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={handleResetTabOrder}
                className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ordre par défaut</span>
              </button>

              <button
                onClick={() => setIsReorderModalOpen(false)}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition cursor-pointer"
              >
                Terminer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs (Full Screen Width avec Drag and Drop) */}
      <div className="w-full px-2 sm:px-3 lg:px-4 flex items-center justify-between gap-2">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none flex-1">
          {tabsToRender.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDragging = draggedTabId === tab.id;
            const isDragOver = dragOverTabId === tab.id;

            return (
              <a
                key={tab.id}
                href={`?tab=${tab.id}`}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleDragOver(e, tab.id)}
                onDrop={(e) => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
                title="Glissez-déposez pour réorganiser cet onglet"
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    setActiveTab(tab.id);
                  }
                }}
                className={`group flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all select-none cursor-grab active:cursor-grabbing ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                } ${isDragging ? 'opacity-40 scale-95' : ''} ${
                  isDragOver ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900' : ''
                }`}
              >
                <GripVertical className="w-3 h-3 text-slate-500 group-hover:text-slate-300 opacity-50 group-hover:opacity-100 transition -ml-1 shrink-0" />
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
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

        {/* Bouton rapide d'aide / réorganisation des onglets */}
        <button
          onClick={() => setIsReorderModalOpen(true)}
          title="Réorganiser l'ordre des onglets"
          className="p-2 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition border border-transparent hover:border-slate-700 cursor-pointer shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
