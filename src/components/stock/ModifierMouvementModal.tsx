import React, { useState, useMemo } from 'react';
import { 
  Edit3, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Trash2, 
  RotateCcw, 
  Save, 
  ShieldAlert,
  Package,
  Calendar,
  Truck,
  FileText,
  Building
} from 'lucide-react';
import { Article, MouvementStock, SuiviOF } from '../../types';
import { StorageService } from '../../services/storage';

interface ModifierMouvementModalProps {
  isOpen: boolean;
  mouvement: MouvementStock | null;
  articles: Article[];
  suivisOF?: SuiviOF[];
  onClose: () => void;
  onMouvementUpdated: () => void;
}

export const ModifierMouvementModal: React.FC<ModifierMouvementModalProps> = ({
  isOpen,
  mouvement,
  articles,
  suivisOF = [],
  onClose,
  onMouvementUpdated
}) => {
  if (!isOpen || !mouvement) return null;

  // États du formulaire
  const [quantiteInput, setQuantiteInput] = useState<string>(String(mouvement.quantite || 1));
  const [numBL, setNumBL] = useState<string>(mouvement.numBL || '');
  const [fournisseur, setFournisseur] = useState<string>(mouvement.fournisseur || '');
  const [numCommande, setNumCommande] = useState<string>(mouvement.numCommande || '');
  const [nomClient, setNomClient] = useState<string>(mouvement.nomClient || '');
  const [remarque, setRemarque] = useState<string>(mouvement.remarque || '');
  const [dateMvt, setDateMvt] = useState<string>(mouvement.date || '');

  // État Annulation
  const [isConfirmingAnnulation, setIsConfirmingAnnulation] = useState<boolean>(false);
  const [motifAnnulation, setMotifAnnulation] = useState<string>('Erreur de saisie / Doublon');

  // Retours
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'warn' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const articleLie = useMemo(() => {
    if (!mouvement.articleCode) return null;
    return articles.find(a => a.code_art === mouvement.articleCode) || null;
  }, [articles, mouvement.articleCode]);

  const ancienneQte = mouvement.quantite || 0;
  const nouvelleQte = Math.max(0, parseInt(quantiteInput, 10) || 0);
  const deltaQte = nouvelleQte - ancienneQte;

  // Calcul du nouveau stock simulé
  const stockActuel = articleLie ? articleLie.stock_physique : 0;
  let stockApresModif = stockActuel;
  if (articleLie && deltaQte !== 0) {
    if (mouvement.type === 'RECEPTION_MARCHANDISE') {
      stockApresModif = stockActuel + deltaQte;
    } else if (
      mouvement.type === 'SORTIE_MANUELLE' ||
      mouvement.type === 'SORTIE_BARRE_NEUVE' ||
      mouvement.type === 'SORTIE_ARTICLE'
    ) {
      stockApresModif = stockActuel - deltaQte;
    }
  }

  // 1. Enregistrer les modifications du mouvement
  const handleSaveModifications = async () => {
    if (nouvelleQte <= 0 && ancienneQte > 0) {
      setFeedback({ message: 'La quantité doit être supérieure à 0.', type: 'warn' });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Si la quantité a changé et que l'article existe, ajuster le stock physique
      if (articleLie && deltaQte !== 0) {
        let nouveauStockPhysique = articleLie.stock_physique;
        if (mouvement.type === 'RECEPTION_MARCHANDISE') {
          nouveauStockPhysique += deltaQte;
        } else if (
          mouvement.type === 'SORTIE_MANUELLE' ||
          mouvement.type === 'SORTIE_BARRE_NEUVE' ||
          mouvement.type === 'SORTIE_ARTICLE'
        ) {
          nouveauStockPhysique -= deltaQte;
        }

        const updatedArticles = articles.map(a => 
          a.code_art === articleLie.code_art 
            ? { ...a, stock_physique: nouveauStockPhysique } 
            : a
        );
        await StorageService.saveArticles(updatedArticles);
      }

      // 2. Mettre à jour le mouvement
      const updatedMvt: MouvementStock = {
        ...mouvement,
        quantite: nouvelleQte,
        date: dateMvt.trim() || mouvement.date,
        numBL: numBL.trim() || undefined,
        fournisseur: fournisseur.trim() || undefined,
        numCommande: numCommande.trim() || undefined,
        nomClient: nomClient.trim() || undefined,
        remarque: remarque.trim() || undefined
      };

      await StorageService.updateMouvement(updatedMvt);
      onMouvementUpdated();
      onClose();
    } catch (e: any) {
      setFeedback({ message: `Erreur: ${e.message || 'Échec de la mise à jour.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Annuler le mouvement (Rollback du stock)
  const handleAnnulerMouvement = async () => {
    setIsSubmitting(true);
    try {
      // Si le mouvement était déjà annulé, rien à faire
      if (mouvement.isAnnule) {
        setFeedback({ message: 'Ce mouvement est déjà annulé.', type: 'warn' });
        return;
      }

      // Rétablir le stock physique inverse
      if (articleLie && ancienneQte > 0) {
        let stockRestitue = articleLie.stock_physique;
        if (mouvement.type === 'RECEPTION_MARCHANDISE') {
          // Annuler une réception = déduire la quantité
          stockRestitue -= ancienneQte;
        } else if (
          mouvement.type === 'SORTIE_MANUELLE' ||
          mouvement.type === 'SORTIE_BARRE_NEUVE' ||
          mouvement.type === 'SORTIE_ARTICLE'
        ) {
          // Annuler une sortie = restituer la quantité
          stockRestitue += ancienneQte;
        }

        const updatedArticles = articles.map(a => 
          a.code_art === articleLie.code_art 
            ? { ...a, stock_physique: Math.max(0, stockRestitue) } 
            : a
        );
        await StorageService.saveArticles(updatedArticles);
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateNow = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      // Marquer le mouvement comme annulé
      const mvtAnnule: MouvementStock = {
        ...mouvement,
        isAnnule: true,
        dateAnnulation: dateNow,
        motifAnnulation: motifAnnulation.trim() || 'Annulé par utilisateur',
        remarque: `${mouvement.remarque ? `${mouvement.remarque} | ` : ''}[MOUVEMENT ANNULÉ le ${dateNow} - Motif: ${motifAnnulation}]`
      };

      await StorageService.updateMouvement(mvtAnnule);
      onMouvementUpdated();
      onClose();
    } catch (e: any) {
      setFeedback({ message: `Erreur: ${e.message || 'Impossible d annuler le mouvement.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Supprimer définitivement de la base
  const handleSupprimerDefinitivement = async () => {
    const confirmSuppr = window.confirm(
      `Confirmer la suppression définitive du mouvement ${mouvement.id} ?\n(Remarque : Si vous souhaitez rétablir le stock, utilisez le bouton "Annuler le Mouvement").`
    );
    if (!confirmSuppr) return;

    setIsSubmitting(true);
    try {
      await StorageService.deleteMouvement(mouvement.id);
      onMouvementUpdated();
      onClose();
    } catch (e: any) {
      setFeedback({ message: `Erreur: ${e.message || 'Impossible de supprimer.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-purple-500/60 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                <span>Modifier ou Annuler le Mouvement de Stock</span>
                {mouvement.isAnnule && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                    DÉJÀ ANNULÉ
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                ID : {mouvement.id} — Date : {mouvement.date}
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

        {/* Corps */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {feedback && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              feedback.type === 'warn' ? 'bg-amber-950/40 border-amber-500/50 text-amber-200' : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Fiche d'identité du mouvement */}
          <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-slate-400">Article Associé</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                mouvement.type === 'RECEPTION_MARCHANDISE'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : 'bg-rose-950 text-rose-300 border-rose-800'
              }`}>
                {mouvement.type === 'RECEPTION_MARCHANDISE' ? '📥 Réception' : '📤 Sortie'}
              </span>
            </div>

            <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span className="font-mono text-amber-400">[{mouvement.articleCode || 'N/A'}]</span>
              <span>{mouvement.designation || 'Article non spécifié'}</span>
            </div>

            {articleLie && (
              <div className="flex items-center gap-3 pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
                <div>Stock physique actuel : <span className="font-mono font-bold text-slate-200">{articleLie.stock_physique} barres</span></div>
                <div>Longueur standard : <span className="font-mono text-slate-300">{articleLie.longeur} mm</span></div>
              </div>
            )}
          </div>

          {/* Formulaire d'édition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Quantité & Impact en temps réel */}
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 sm:col-span-2 space-y-2">
              <label className="block text-slate-200 font-bold">
                Quantité en Barres / Unités
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  value={quantiteInput}
                  onChange={e => setQuantiteInput(e.target.value)}
                  className="w-32 bg-slate-900 border-2 border-purple-500 rounded-lg px-3 py-1.5 font-mono text-purple-300 font-black text-base focus:outline-none"
                />

                {articleLie && deltaQte !== 0 && (
                  <div className="flex items-center gap-2 text-xs bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Impact Stock :</span>
                    <span className="font-mono font-bold text-slate-300">{stockActuel} barres</span>
                    <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
                    <span className={`font-mono font-black ${
                      stockApresModif >= stockActuel ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {stockApresModif} barres
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({deltaQte > 0 ? `+${deltaQte}` : deltaQte})
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Date &amp; Heure
              </label>
              <input
                type="text"
                value={dateMvt}
                onChange={e => setDateMvt(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none"
                placeholder="DD/MM/YYYY HH:mm"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                N° Bon de Livraison (BL)
              </label>
              <input
                type="text"
                value={numBL}
                onChange={e => setNumBL(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none"
                placeholder="ex: BL-2026-089"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Fournisseur
              </label>
              <input
                type="text"
                value={fournisseur}
                onChange={e => setFournisseur(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
                placeholder="SOMO, Profilor, etc."
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                N° Commande / OF
              </label>
              <input
                type="text"
                value={numCommande}
                onChange={e => setNumCommande(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none"
                placeholder="ex: OF-2026-045"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">
                Client / Destinataire
              </label>
              <input
                type="text"
                value={nomClient}
                onChange={e => setNomClient(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
                placeholder="Nom du client ou chantier..."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">
                Observations &amp; Remarques
              </label>
              <input
                type="text"
                value={remarque}
                onChange={e => setRemarque(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
                placeholder="Remarques éventuelles..."
              />
            </div>
          </div>

          {/* Zone d'annulation de mouvement */}
          {!mouvement.isAnnule && (
            <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  <span>Annulation du Mouvement (Restituer / Déduire le Stock)</span>
                </div>
                {!isConfirmingAnnulation ? (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingAnnulation(true)}
                    className="px-3 py-1 bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white rounded-lg border border-amber-500/50 text-[11px] font-bold transition cursor-pointer"
                  >
                    Demander l'annulation
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingAnnulation(false)}
                    className="text-slate-400 hover:text-white text-[11px]"
                  >
                    Fermer
                  </button>
                )}
              </div>

              {isConfirmingAnnulation && (
                <div className="pt-2 border-t border-amber-700/50 space-y-2">
                  <p className="text-[11px] text-amber-200">
                    {mouvement.type === 'RECEPTION_MARCHANDISE' && (
                      <>⚠️ <strong>Attention :</strong> L'annulation va <strong>déduire {ancienneQte} barres</strong> du stock actuel de l'article {mouvement.articleCode} (Stock : {stockActuel} ➔ {Math.max(0, stockActuel - ancienneQte)} barres).</>
                    )}
                    {mouvement.type !== 'RECEPTION_MARCHANDISE' && (
                      <>⚠️ <strong>Attention :</strong> L'annulation va <strong>restituer +{ancienneQte} barres</strong> au stock physique de l'article {mouvement.articleCode} (Stock : {stockActuel} ➔ {stockActuel + ancienneQte} barres).</>
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={motifAnnulation}
                      onChange={e => setMotifAnnulation(e.target.value)}
                      placeholder="Motif de l'annulation (ex: Erreur de BL, doublon)..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleAnnulerMouvement}
                      className="px-4 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      Confirmer l'Annulation
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-5 py-3.5 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleSupprimerDefinitivement}
            className="px-3 py-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Supprimer définitivement l'enregistrement de l'historique"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purger</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Fermer
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveModifications}
              className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-40"
            >
              <Save className="w-4 h-4" />
              <span>Enregistrer les Modifications</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
