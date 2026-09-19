import React, { useState } from 'react';
import { DossierCommandeGlobal, FamilleProduit } from '../../types';
import {
  X,
  FileText,
  Calendar,
  User,
  Building2,
  Clock,
  Layers,
  Scissors,
  Sliders,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  PackageCheck
} from 'lucide-react';

interface DossierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: DossierCommandeGlobal | null;
  onLoadInEcosysteme?: (dossier: DossierCommandeGlobal) => void;
}

export const DossierDetailModal: React.FC<DossierDetailModalProps> = ({
  isOpen,
  onClose,
  dossier,
  onLoadInEcosysteme
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | FamilleProduit>('ALL');

  if (!isOpen || !dossier) return null;

  const nbCaissons = (dossier.articlesCaissons || []).reduce((sum, c) => sum + (Number(c.quantite) || 1), 0);
  const nbTabliers = (dossier.articlesTabliers || []).reduce((sum, t) => sum + (Number(t.quantite) || 1), 0);
  const nbMoustiquaires = (dossier.articlesMoustiquaires || []).reduce((sum, m) => sum + (Number(m.quantite) || 1), 0);
  const nbPrecadres = (dossier.articlesPrecadres || []).reduce((sum, p) => sum + (Number(p.quantite) || 1), 0);
  const totalArticles = nbCaissons + nbTabliers + nbMoustiquaires + nbPrecadres;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white font-mono tracking-tight">
                  Dossier Commande : <span className="text-amber-400">{dossier.refCommande}</span>
                </h3>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${
                    dossier.statut === 'LIVRE'
                      ? 'bg-blue-950 text-blue-300 border-blue-500/40'
                      : dossier.statut === 'CLOTURE'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                      : dossier.statut === 'FABRIQUE'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                      : dossier.statut === 'EN_COURS'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                      : 'bg-purple-950 text-purple-300 border-purple-500/30'
                  }`}
                >
                  {dossier.statut}
                </span>
                {dossier.estPrioritaire && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                    ⚡ Prioritaire
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Client : <strong className="text-slate-200">{dossier.nomClientFinal}</strong></span>
                <span>•</span>
                <span>Donneur : <strong className="text-sky-300">{dossier.donneurOrdre}</strong></span>
                <span>•</span>
                <span>Date : <span className="font-mono text-slate-300">{dossier.dateCommande}</span></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onLoadInEcosysteme && (
              <button
                type="button"
                onClick={() => {
                  onLoadInEcosysteme(dossier);
                  onClose();
                }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                title="Ouvrir cette commande dans l'Écosystème Commandes"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ouvrir dans Écosystème</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Strip */}
        <div className="bg-slate-950/60 px-6 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Délai Livraison :</span>
              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {dossier.dateLivraisonPrevisionnelle || 'Non renseigné'}
              </span>
            </div>
            {dossier.notes && (
              <div className="text-slate-400 italic truncate max-w-md" title={dossier.notes}>
                Note : "{dossier.notes}"
              </div>
            )}
          </div>

          {/* Family Filters */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                activeTab === 'ALL' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tout ({totalArticles})
            </button>
            {nbCaissons > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('CAISSON')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  activeTab === 'CAISSON' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-sky-300'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Caissons ({nbCaissons})</span>
              </button>
            )}
            {nbTabliers > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('TABLIER')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  activeTab === 'TABLIER' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                <Scissors className="w-3 h-3" />
                <span>Tabliers ({nbTabliers})</span>
              </button>
            )}
            {nbMoustiquaires > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('MOUSTIQUAIRE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  activeTab === 'MOUSTIQUAIRE' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>Moustiquaires ({nbMoustiquaires})</span>
              </button>
            )}
            {nbPrecadres > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('PRECADRE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  activeTab === 'PRECADRE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-300'
                }`}
              >
                <Building2 className="w-3 h-3" />
                <span>Précadres ({nbPrecadres})</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section Caissons */}
          {(activeTab === 'ALL' || activeTab === 'CAISSON') && nbCaissons > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  <span>Caissons &amp; Sous-Faces ({nbCaissons} lignes)</span>
                </h4>
                {dossier.numCommandeCaisson && (
                  <span className="font-mono text-[11px] text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30">
                    Réf : {dossier.numCommandeCaisson}
                  </span>
                )}
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center">#</th>
                      <th className="py-2 px-3">Repère</th>
                      <th className="py-2 px-3">Article Caisson (CT)</th>
                      <th className="py-2 px-3">Sous-Face (SF)</th>
                      <th className="py-2 px-3 text-center">Longueur</th>
                      <th className="py-2 px-3 text-center">Quantité</th>
                      <th className="py-2 px-3">Options</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dossier.articlesCaissons.map((c, i) => (
                      <tr key={c.id || i} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">{i + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-300">{c.repere}</td>
                        <td className="py-2 px-3 font-medium text-slate-200">
                          {c.isSousFaceSeule || c.typePrestation === 'SOUS_FACE_SEULE' ? (
                            <span className="text-slate-500 italic">Sans Caisson (SF seule)</span>
                          ) : (
                            c.articleDesignation || c.articleCode || 'CT Tunnel'
                          )}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-200">
                          {c.avecSousFace || c.isSousFaceSeule || c.typePrestation === 'SOUS_FACE_SEULE' ? (
                            <span className="text-sky-300 font-semibold">{c.sfArticleDesignation || c.sfArticleCode || 'Sous-Face'}</span>
                          ) : (
                            <span className="text-slate-500 italic">Sans Sous-Face</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-100">{c.longueur} mm</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-300">{c.quantite}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {c.avecPeinture && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                🎨 Peinture
                              </span>
                            )}
                            {c.montageSousFace === 'MONTEE_ATELIER' && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                                🔧 Montée
                              </span>
                            )}
                            {c.avecPlaque && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                🛡️ Plaque
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section Tabliers */}
          {(activeTab === 'ALL' || activeTab === 'TABLIER') && nbTabliers > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Scissors className="w-4 h-4" />
                  <span>Volets Roulants &amp; Tabliers ({nbTabliers} lignes)</span>
                </h4>
                {dossier.numCommandeTablier && (
                  <span className="font-mono text-[11px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                    Réf : {dossier.numCommandeTablier}
                  </span>
                )}
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center">#</th>
                      <th className="py-2 px-3">Repère</th>
                      <th className="py-2 px-3">Profilé Lame</th>
                      <th className="py-2 px-3 text-center">Dimensions (L x H)</th>
                      <th className="py-2 px-3 text-center">Quantité</th>
                      <th className="py-2 px-3 text-center">Lames/Volet</th>
                      <th className="py-2 px-3">Fabrication</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dossier.articlesTabliers.map((t, i) => (
                      <tr key={t.id || i} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">{i + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-300">{t.repere}</td>
                        <td className="py-2 px-3 font-medium text-slate-200">
                          {t.articleDesignation || t.articleCode || `Lame ${t.hauteur_lame_tablier}mm`}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-100">
                          {t.largeur} × {t.hauteur} mm
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-300">{t.quantite}</td>
                        <td className="py-2 px-3 text-center font-mono text-slate-300">{t.nb_lame || '—'}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              t.typeFabrication === 'VOLET_COMPLET'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {t.typeFabrication === 'VOLET_COMPLET' ? 'Volet Complet (Coulisses)' : 'Tablier Seul'}
                            </span>
                            {t.avecLameFinale && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                + LF
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section Moustiquaires */}
          {(activeTab === 'ALL' || activeTab === 'MOUSTIQUAIRE') && nbMoustiquaires > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" />
                  <span>Moustiquaires Plissées ({nbMoustiquaires} lignes)</span>
                </h4>
                {dossier.numCommandeMoustiquaire && (
                  <span className="font-mono text-[11px] text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                    Réf : {dossier.numCommandeMoustiquaire}
                  </span>
                )}
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center">#</th>
                      <th className="py-2 px-3">Repère</th>
                      <th className="py-2 px-3">Modèle / Type</th>
                      <th className="py-2 px-3 text-center">Dimensions (L x H)</th>
                      <th className="py-2 px-3 text-center">Quantité</th>
                      <th className="py-2 px-3">Fabrication</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dossier.articlesMoustiquaires.map((m, i) => (
                      <tr key={m.id || i} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">{i + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-300">{m.repere || `M-${i + 1}`}</td>
                        <td className="py-2 px-3 font-medium text-slate-200">
                          {m.modele} • {m.typeOuverture}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-100">
                          {m.largeur} × {m.hauteur} mm
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-300">{m.quantite}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold">
                            {m.typeFabrication}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section Précadres */}
          {(activeTab === 'ALL' || activeTab === 'PRECADRE') && nbPrecadres > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  <span>Précadres Tubulaires ({nbPrecadres} lignes)</span>
                </h4>
                {dossier.numCommandePrecadre && (
                  <span className="font-mono text-[11px] text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                    Réf : {dossier.numCommandePrecadre}
                  </span>
                )}
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center">#</th>
                      <th className="py-2 px-3">Repère</th>
                      <th className="py-2 px-3">Figure &amp; Type</th>
                      <th className="py-2 px-3 text-center">Dimensions (L x H)</th>
                      <th className="py-2 px-3 text-center">Quantité</th>
                      <th className="py-2 px-3">Assemblage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dossier.articlesPrecadres.map((p, i) => (
                      <tr key={p.id || i} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">{i + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-300">{p.repere || `P-${i + 1}`}</td>
                        <td className="py-2 px-3 font-medium text-slate-200">
                          {p.articleDesignation || p.typePrecadre || 'Précadre'} • {p.figure}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-100">
                          {p.largeur} × {p.hauteur} mm
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-300">{p.quantite}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                            {p.typeAssemblage || 'BOUCHON'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono">
            ID Dossier : {dossier.id}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
