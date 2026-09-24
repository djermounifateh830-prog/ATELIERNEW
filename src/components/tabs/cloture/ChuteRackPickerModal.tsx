import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, Layers, Plus, Minus, PackageCheck, AlertCircle, Zap } from 'lucide-react';
import { ChuteItem } from '../../../types';

interface ChuteRackPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRackChute: (chute: ChuteItem, quantite?: number) => void;
  onSelectHorsStockChute: (longueurMm: number, quantite?: number, remarque?: string) => void;
  articleDesignation: string;
  articleCode: string;
  sheetName: string;
  chutesBarres: Record<string, ChuteItem[]>;
  alreadyUsedChuteIds: Set<string>;
  initialTab?: 'RACK' | 'HORS_STOCK';
}

export const ChuteRackPickerModal: React.FC<ChuteRackPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectRackChute,
  onSelectHorsStockChute,
  articleDesignation,
  articleCode,
  sheetName,
  chutesBarres,
  alreadyUsedChuteIds,
  initialTab = 'RACK'
}) => {
  const [activeTab, setActiveTab] = useState<'RACK' | 'HORS_STOCK'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [horsStockLg, setHorsStockLg] = useState('');
  const [horsStockQte, setHorsStockQte] = useState<number>(1);
  const [horsStockRemarque, setHorsStockRemarque] = useState('');
  const [rackQuantities, setRackQuantities] = useState<Record<string, number>>({});

  // Réinitialiser les champs à l'ouverture de la modale
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setHorsStockLg('');
      setHorsStockQte(1);
      setHorsStockRemarque('');
      setSearchQuery('');
      setRackQuantities({});
    }
  }, [isOpen, initialTab]);

  // Trouver les chutes correspondant à cette feuille ou cet article
  const chutesDisponibles = useMemo(() => {
    // Essayer par sheetName exact, ou clés partielles
    let list: ChuteItem[] = [];
    if (chutesBarres[sheetName]) {
      list = chutesBarres[sheetName];
    } else {
      // Rechercher dans les feuilles de chutesBarres
      const lowerSheet = sheetName.toLowerCase();
      const lowerCode = articleCode.toLowerCase();
      for (const [sName, items] of Object.entries(chutesBarres)) {
        if (sName.toLowerCase() === lowerSheet || sName.toLowerCase().includes(lowerCode)) {
          list = items;
          break;
        }
      }
    }

    // Exclure les chutes déjà réservées / utilisées
    return list
      .filter(c => {
        if (c.id && alreadyUsedChuteIds.has(c.id)) return false;
        return (c.quantite ?? 1) > 0;
      })
      .sort((a, b) => b.longueur - a.longueur);
  }, [chutesBarres, sheetName, articleCode, alreadyUsedChuteIds]);

  const chutesFiltrees = useMemo(() => {
    if (!searchQuery.trim()) return chutesDisponibles;
    const q = searchQuery.toLowerCase().trim();
    return chutesDisponibles.filter(c => {
      const lgStr = String(c.longueur);
      return lgStr.includes(q) || (c.id && c.id.toLowerCase().includes(q));
    });
  }, [chutesDisponibles, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Choisir une Chute de Remplacement
              </h3>
              <p className="text-xs text-slate-400">
                Profilé : <span className="text-amber-300 font-semibold">{articleDesignation}</span> ({sheetName})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-5 pt-3 pb-2 flex gap-2 border-b border-slate-800 bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('RACK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'RACK'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>Chutes du Rack Inventoriées ({chutesDisponibles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HORS_STOCK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'HORS_STOCK'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Chute Hors-Stock (Non Inventoriée)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {activeTab === 'RACK' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Rechercher par longueur (ex: 1850)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              {chutesFiltrees.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/40 rounded-xl border border-slate-800/80 p-4">
                  <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-300 font-semibold">Aucune chute disponible dans ce rack</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Toutes les chutes de {sheetName} sont soit réservées, soit épuisées.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('HORS_STOCK')}
                    className="mt-3 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition cursor-pointer"
                  >
                    Saisir une chute hors-stock trouvée à l'atelier
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {chutesFiltrees.map((chute, idx) => {
                    const key = chute.id || String(idx);
                    const dispo = chute.quantite ?? 1;
                    const selectedQte = rackQuantities[key] || 1;

                    return (
                      <div
                        key={key}
                        className="p-3 bg-slate-950 hover:bg-sky-950/30 border border-slate-800 hover:border-sky-500/50 rounded-xl transition flex items-center justify-between group gap-2"
                      >
                        <div>
                          <div className="text-sm font-black text-slate-100 font-mono group-hover:text-sky-300">
                            {chute.longueur} mm
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Dispo au rack : <span className="text-slate-200 font-semibold">{dispo} pcs</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {dispo > 1 && (
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => setRackQuantities(prev => ({
                                  ...prev,
                                  [key]: Math.max(1, (prev[key] || 1) - 1)
                                }))}
                                disabled={selectedQte <= 1}
                                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center font-bold text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-xs font-mono font-bold text-sky-300 px-1">
                                {selectedQte}
                              </span>
                              <button
                                type="button"
                                onClick={() => setRackQuantities(prev => ({
                                  ...prev,
                                  [key]: Math.min(dispo, (prev[key] || 1) + 1)
                                }))}
                                disabled={selectedQte >= dispo}
                                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center font-bold text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              onSelectRackChute(chute, selectedQte);
                              onClose();
                            }}
                            className="text-xs font-bold text-sky-400 px-2.5 py-1.5 bg-sky-950 rounded-lg border border-sky-800/50 hover:bg-sky-500 hover:text-slate-950 transition cursor-pointer"
                          >
                            {selectedQte > 1 ? `Prendre (${selectedQte})` : 'Choisir'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200/90 leading-relaxed">
                Utilisez cette option si l'opérateur a trouvé dans l'atelier un ou plusieurs morceaux de profilé qui n'étaient pas enregistrés dans le rack. Vous pouvez indiquer une <strong>quantité multiple</strong> (ex: 3 chutes de 1500 mm). Le système créera la régularisation automatique dans les mouvements de stock.
              </div>

              {/* Grille Longueur & Quantité */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Longueur */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Longueur mesurée au mètre (mm) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="10"
                      placeholder="ex: 1500"
                      value={horsStockLg}
                      onChange={e => setHorsStockLg(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400 pr-12"
                      autoFocus
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">mm</span>
                  </div>
                  {/* Raccourcis longueurs courantes */}
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    {[1000, 1500, 2000, 2500, 3000].map(quickLg => (
                      <button
                        key={quickLg}
                        type="button"
                        onClick={() => setHorsStockLg(String(quickLg))}
                        className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-amber-300 font-mono text-[10px] rounded-lg border border-slate-800 cursor-pointer transition"
                      >
                        {quickLg}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Quantité avec Stepper et boutons rapides */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Quantité de chutes *</span>
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/80">
                      Multi-pièces
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setHorsStockQte(prev => Math.max(1, prev - 1))}
                      disabled={horsStockQte <= 1}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center justify-center font-bold text-sm transition cursor-pointer"
                      title="Diminuer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={horsStockQte}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        setHorsStockQte(isNaN(val) || val < 1 ? 1 : Math.min(50, val));
                      }}
                      className="flex-1 bg-transparent text-center font-mono font-black text-sm text-white focus:outline-none"
                    />
                    <span className="text-xs text-slate-400 font-medium pr-1">pcs</span>

                    <button
                      type="button"
                      onClick={() => setHorsStockQte(prev => Math.min(50, prev + 1))}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-sm transition cursor-pointer"
                      title="Augmenter"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Raccourcis quantités rapides */}
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    {[1, 2, 3, 4, 5, 10].map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setHorsStockQte(q)}
                        className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-bold border transition cursor-pointer ${
                          horsStockQte === q
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800'
                        }`}
                      >
                        ×{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Récapitulatif dynamique de la matière */}
              {Number(horsStockLg) > 0 && (
                <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total matière apportée :</span>
                  <span className="font-mono font-black text-amber-300">
                    {horsStockQte} × {horsStockLg} mm ={' '}
                    {(horsStockQte * Number(horsStockLg)).toLocaleString('fr-FR')} mm{' '}
                    <span className="text-slate-400 font-normal">
                      ({((horsStockQte * Number(horsStockLg)) / 1000).toFixed(2)} m)
                    </span>
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Remarque / Localisation (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="ex: Retrouvées au pied de la tronçonneuse"
                  value={horsStockRemarque}
                  onChange={e => setHorsStockRemarque(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="button"
                disabled={!horsStockLg || Number(horsStockLg) <= 0}
                onClick={() => {
                  const val = Number(horsStockLg);
                  if (val > 0) {
                    onSelectHorsStockChute(val, horsStockQte, horsStockRemarque.trim() || undefined);
                    onClose();
                  }
                }}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {horsStockQte > 1
                    ? `Valider l'utilisation de ces ${horsStockQte} chutes hors-stock (${horsStockQte} × ${horsStockLg || 0} mm)`
                    : `Valider l'utilisation de cette chute hors-stock (${horsStockLg || 0} mm)`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
