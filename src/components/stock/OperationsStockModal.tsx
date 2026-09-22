import React, { useState, useMemo } from 'react';
import { 
  PackagePlus, 
  PackageMinus, 
  ClipboardCheck, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Layers, 
  Search, 
  Save,
  Truck
} from 'lucide-react';
import { Article, MouvementStock } from '../../types';
import { StorageService } from '../../services/storage';

export type OperationStockType = 'RECEPTION' | 'SORTIE' | 'INVENTAIRE';

interface OperationsStockModalProps {
  isOpen: boolean;
  initialType?: OperationStockType;
  initialArticle?: Article | null;
  articles: Article[];
  onClose: () => void;
  onStockUpdated: () => void;
}

export const OperationsStockModal: React.FC<OperationsStockModalProps> = ({
  isOpen,
  initialType = 'RECEPTION',
  initialArticle = null,
  articles,
  onClose,
  onStockUpdated
}) => {
  const [activeType, setActiveType] = useState<OperationStockType>(initialType);
  const [selectedCodeArt, setSelectedCodeArt] = useState<string>(initialArticle?.code_art || (articles[0]?.code_art || ''));
  const [searchArt, setSearchArt] = useState<string>('');
  
  // Champs Réception
  const [qteReception, setQteReception] = useState<string>('10');
  const [fournisseur, setFournisseur] = useState<string>('SOMO');
  const [numBL, setNumBL] = useState<string>('');
  const [remarqueReception, setRemarqueReception] = useState<string>('');

  // Champs Sortie Manuelle
  const [qteSortie, setQteSortie] = useState<string>('1');
  const [motifSortie, setMotifSortie] = useState<string>('Chantier direct / Hors OF');
  const [destinataireClient, setDestinataireClient] = useState<string>('');
  const [remarqueSortie, setRemarqueSortie] = useState<string>('');

  // Champs Inventaire / Ajustement
  const [stockReelInput, setStockReelInput] = useState<string>('');
  const [motifInventaire, setMotifInventaire] = useState<string>('Comptage physique atelier');
  const [remarqueInventaire, setRemarqueInventaire] = useState<string>('');

  // État retour utilisateur
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'warn' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Synchroniser à l'ouverture
  React.useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      if (initialArticle) {
        setSelectedCodeArt(initialArticle.code_art);
        setStockReelInput(String(initialArticle.stock_physique));
      } else if (articles.length > 0 && !selectedCodeArt) {
        setSelectedCodeArt(articles[0].code_art);
        setStockReelInput(String(articles[0].stock_physique));
      }
      setFeedback(null);
    }
  }, [isOpen, initialType, initialArticle]);

  const currentArticle = useMemo(() => {
    return articles.find(a => a.code_art === selectedCodeArt) || null;
  }, [articles, selectedCodeArt]);

  // Synchroniser le stock théorique pour l'inventaire quand l'article change
  React.useEffect(() => {
    if (currentArticle && !stockReelInput) {
      setStockReelInput(String(currentArticle.stock_physique));
    }
  }, [currentArticle]);

  // Articles filtrés pour la recherche
  const filteredArticles = useMemo(() => {
    const q = searchArt.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(a => 
      a.code_art.toLowerCase().includes(q) || 
      a.designation.toLowerCase().includes(q)
    );
  }, [articles, searchArt]);

  if (!isOpen) return null;

  const nowFormatted = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // 1. Soumission Réception Marchandise
  const handleValiderReception = async () => {
    if (!currentArticle) {
      setFeedback({ message: 'Veuillez sélectionner un article.', type: 'warn' });
      return;
    }
    const qte = parseInt(qteReception, 10);
    if (isNaN(qte) || qte <= 0) {
      setFeedback({ message: 'Veuillez saisir une quantité valide (> 0).', type: 'warn' });
      return;
    }

    setIsSubmitting(true);
    try {
      const nouveauStock = currentArticle.stock_physique + qte;
      const updatedArticles = articles.map(a => 
        a.code_art === currentArticle.code_art 
          ? { ...a, stock_physique: nouveauStock }
          : a
      );

      await StorageService.saveArticles(updatedArticles);

      const mvt: MouvementStock = {
        id: `MVT-REC-${Date.now()}`,
        date: nowFormatted(),
        type: 'RECEPTION_MARCHANDISE',
        articleCode: currentArticle.code_art,
        designation: currentArticle.designation,
        longueurMm: currentArticle.longeur,
        quantite: qte,
        remarque: `Réception Marchandise : +${qte} barres. Fournisseur: ${fournisseur || 'N/A'}${numBL ? ` (BL: ${numBL})` : ''}${remarqueReception ? ` - ${remarqueReception}` : ''}`
      };

      await StorageService.addMouvement(mvt);
      onStockUpdated();
      setFeedback({
        message: `✓ Réception validée : +${qte} barres ajoutées à "${currentArticle.designation}". Nouveau stock : ${nouveauStock} barres.`,
        type: 'success'
      });

      // Réinitialiser les champs de saisie
      setQteReception('10');
      setNumBL('');
      setRemarqueReception('');
    } catch (e: any) {
      setFeedback({ message: `Erreur : ${e.message || 'Impossible d enregistrer la réception.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Soumission Sortie Manuelle
  const handleValiderSortie = async () => {
    if (!currentArticle) {
      setFeedback({ message: 'Veuillez sélectionner un article.', type: 'warn' });
      return;
    }
    const qte = parseInt(qteSortie, 10);
    if (isNaN(qte) || qte <= 0) {
      setFeedback({ message: 'Veuillez saisir une quantité valide (> 0).', type: 'warn' });
      return;
    }

    if (currentArticle.stock_physique < qte) {
      const confirmForce = window.confirm(
        `⚠️ Attention : Le stock physique actuel (${currentArticle.stock_physique} barres) est inférieur à la quantité demandée (${qte} barres).\nVoulez-vous forcer la sortie (le stock deviendra 0 ou négatif) ?`
      );
      if (!confirmForce) return;
    }

    setIsSubmitting(true);
    try {
      const nouveauStock = currentArticle.stock_physique - qte;
      const updatedArticles = articles.map(a => 
        a.code_art === currentArticle.code_art 
          ? { ...a, stock_physique: nouveauStock }
          : a
      );

      await StorageService.saveArticles(updatedArticles);

      const mvt: MouvementStock = {
        id: `MVT-SRT-${Date.now()}`,
        date: nowFormatted(),
        type: 'SORTIE_MANUELLE',
        articleCode: currentArticle.code_art,
        designation: currentArticle.designation,
        longueurMm: currentArticle.longeur,
        quantite: qte,
        nomClient: destinataireClient || undefined,
        remarque: `Sortie Manuelle : -${qte} barres [Stock: ${currentArticle.stock_physique} → ${nouveauStock}]. Motif: ${motifSortie}${destinataireClient ? ` (Dest: ${destinataireClient})` : ''}${remarqueSortie ? ` - ${remarqueSortie}` : ''}`
      };

      await StorageService.addMouvement(mvt);
      onStockUpdated();
      setFeedback({
        message: `✓ Sortie manuelle enregistrée : -${qte} barres déduites de "${currentArticle.designation}". Nouveau stock : ${nouveauStock} barres.`,
        type: 'success'
      });

      setQteSortie('1');
      setDestinataireClient('');
      setRemarqueSortie('');
    } catch (e: any) {
      setFeedback({ message: `Erreur : ${e.message || 'Impossible d enregistrer la sortie.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Soumission Inventaire / Ajustement
  const handleValiderInventaire = async () => {
    if (!currentArticle) {
      setFeedback({ message: 'Veuillez sélectionner un article.', type: 'warn' });
      return;
    }
    const nouveauStock = parseInt(stockReelInput, 10);
    if (isNaN(nouveauStock) || nouveauStock < 0) {
      setFeedback({ message: 'Veuillez saisir un stock physique réel valide (>= 0).', type: 'warn' });
      return;
    }

    const ancienStock = currentArticle.stock_physique;
    const ecart = nouveauStock - ancienStock;

    if (ecart === 0) {
      setFeedback({ message: 'Aucun écart constaté : le stock compté est identique au stock informatique.', type: 'warn' });
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedArticles = articles.map(a => 
        a.code_art === currentArticle.code_art 
          ? { ...a, stock_physique: nouveauStock }
          : a
      );

      await StorageService.saveArticles(updatedArticles);

      const mvt: MouvementStock = {
        id: `MVT-INV-${Date.now()}`,
        date: nowFormatted(),
        type: 'AJUSTEMENT_INVENTAIRE',
        articleCode: currentArticle.code_art,
        designation: currentArticle.designation,
        longueurMm: currentArticle.longeur,
        quantite: Math.abs(ecart),
        remarque: `Inventaire Physique : Ancien=${ancienStock} ➔ Réel=${nouveauStock} (Écart: ${ecart > 0 ? `+${ecart}` : ecart} barres). Motif: ${motifInventaire}${remarqueInventaire ? ` - ${remarqueInventaire}` : ''}`
      };

      await StorageService.addMouvement(mvt);
      onStockUpdated();
      setFeedback({
        message: `✓ Inventaire validé : "${currentArticle.designation}" ajusté de ${ancienStock} à ${nouveauStock} barres (Écart: ${ecart > 0 ? `+${ecart}` : ecart}).`,
        type: 'success'
      });
    } catch (e: any) {
      setFeedback({ message: `Erreur : ${e.message || 'Impossible d enregistrer l ajustement d inventaire.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header avec Onglets d'Opération */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {activeType === 'RECEPTION' && <PackagePlus className="w-5 h-5 text-emerald-400" />}
            {activeType === 'SORTIE' && <PackageMinus className="w-5 h-5 text-rose-400" />}
            {activeType === 'INVENTAIRE' && <ClipboardCheck className="w-5 h-5 text-sky-400" />}
            <div>
              <h3 className="font-bold text-sm text-slate-100">
                {activeType === 'RECEPTION' && 'Réception Marchandise (Entrée Matière)'}
                {activeType === 'SORTIE' && 'Sortie Manuelle de Stock'}
                {activeType === 'INVENTAIRE' && 'Inventaire & Ajustement Réel de Stock'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Mise à jour directe du stock physique et traçabilité automatique des mouvements.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sélecteur de mode */}
        <div className="grid grid-cols-3 bg-slate-950/60 p-1.5 border-b border-slate-800 text-xs font-bold gap-1.5">
          <button
            type="button"
            onClick={() => { setActiveType('RECEPTION'); setFeedback(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
              activeType === 'RECEPTION'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <PackagePlus className="w-4 h-4 text-emerald-400" />
            <span>📥 Réception Matière</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveType('SORTIE'); setFeedback(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
              activeType === 'SORTIE'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <PackageMinus className="w-4 h-4 text-rose-400" />
            <span>📤 Sortie Manuelle</span>
          </button>

          <button
            type="button"
            onClick={() => { 
              setActiveType('INVENTAIRE'); 
              setFeedback(null); 
              if (currentArticle) setStockReelInput(String(currentArticle.stock_physique));
            }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
              activeType === 'INVENTAIRE'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 text-sky-400" />
            <span>📋 Inventaire / Ajust.</span>
          </button>
        </div>

        {/* Corps modal */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Notification Feedback */}
          {feedback && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                : feedback.type === 'warn'
                ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
            }`}>
              {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
              {feedback.type === 'warn' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              {feedback.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
              <span className="font-medium">{feedback.message}</span>
            </div>
          )}

          {/* 1. Sélection de l'article */}
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Sélectionner le Profilé / Article *</span>
              </label>
              {currentArticle && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px]">Stock Physique Actuel :</span>
                  <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                    currentArticle.stock_physique <= (currentArticle.stock_min || 5)
                      ? 'bg-rose-950 text-rose-300 border border-rose-700/60'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                  }`}>
                    {currentArticle.stock_physique} barres
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrer (ex: SOMO, SF 300, BL...)"
                  value={searchArt}
                  onChange={e => setSearchArt(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <select
                value={selectedCodeArt}
                onChange={e => {
                  setSelectedCodeArt(e.target.value);
                  const found = articles.find(a => a.code_art === e.target.value);
                  if (found) setStockReelInput(String(found.stock_physique));
                  setFeedback(null);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {filteredArticles.map(a => (
                  <option key={a.code_art} value={a.code_art}>
                    [{a.code_art}] {a.designation} ({a.stock_physique} barres)
                  </option>
                ))}
              </select>
            </div>

            {currentArticle && (
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-4 gap-2 text-[11px] text-slate-400">
                <div>Longueur: <span className="font-mono text-slate-200 font-bold">{currentArticle.longeur} mm</span></div>
                <div>Lame: <span className="font-mono text-slate-200 font-bold">{currentArticle.lame} mm</span></div>
                <div>Stock Min Alerte: <span className="font-mono text-slate-200 font-bold">{currentArticle.stock_min || 5}</span></div>
                <div>Prix Unit.: <span className="font-mono text-amber-300 font-bold">{currentArticle.prix_unitaire || 0} DZD</span></div>
              </div>
            )}
          </div>

          {/* Formulaire spécifique selon le mode actif */}
          {activeType === 'RECEPTION' && (
            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 space-y-3">
              <h4 className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>Détails de la Réception Matière</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Quantité de Barres Reçues *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={qteReception}
                    onChange={e => setQteReception(e.target.value)}
                    className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg px-2.5 py-1.5 font-mono text-emerald-300 font-bold text-sm focus:outline-none"
                    placeholder="10"
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    placeholder="SOMO, Profilor, etc."
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    placeholder="ex: BL-2025-089"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observations / Remarques (Optionnel)
                </label>
                <input
                  type="text"
                  value={remarqueReception}
                  onChange={e => setRemarqueReception(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                  placeholder="Palette n°2, conformité vérifiée..."
                />
              </div>

              {currentArticle && (
                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Projection après validation :</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400">{currentArticle.stock_physique} barres</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-bold text-emerald-400">
                      {currentArticle.stock_physique + (parseInt(qteReception, 10) || 0)} barres
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeType === 'SORTIE' && (
            <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 space-y-3">
              <h4 className="font-bold text-rose-300 flex items-center gap-1.5 text-xs">
                <PackageMinus className="w-4 h-4 text-rose-400" />
                <span>Détails de la Sortie Manuelle Exceptionnelle</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nombre de Barres à Sortir *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={qteSortie}
                    onChange={e => setQteSortie(e.target.value)}
                    className="w-full bg-slate-900 border border-rose-500/50 rounded-lg px-2.5 py-1.5 font-mono text-rose-300 font-bold text-sm focus:outline-none"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Motif de la Sortie *
                  </label>
                  <select
                    value={motifSortie}
                    onChange={e => setMotifSortie(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                  >
                    <option value="Chantier direct / Hors OF">Chantier direct / Hors OF</option>
                    <option value="Casse / Rebut atelier">Casse / Rebut atelier</option>
                    <option value="Perte / Déformation profilé">Perte / Déformation profilé</option>
                    <option value="Échantillon commercial / SAV">Échantillon commercial / SAV</option>
                    <option value="Dépannage client direct">Dépannage client direct</option>
                    <option value="Autre motif exceptionnel">Autre motif exceptionnel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Client / Chantier / Récepteur
                  </label>
                  <input
                    type="text"
                    value={destinataireClient}
                    onChange={e => setDestinataireClient(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    placeholder="ex: Chantier Ben Aknoun..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observations / Remarque
                </label>
                <input
                  type="text"
                  value={remarqueSortie}
                  onChange={e => setRemarqueSortie(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                  placeholder="Préciser le contexte..."
                />
              </div>

              {currentArticle && (
                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Projection après sortie :</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400">{currentArticle.stock_physique} barres</span>
                    <ArrowRight className="w-3.5 h-3.5 text-rose-400" />
                    <span className="font-bold text-rose-400">
                      {Math.max(0, currentArticle.stock_physique - (parseInt(qteSortie, 10) || 0))} barres
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeType === 'INVENTAIRE' && (
            <div className="bg-sky-950/20 border border-sky-500/30 rounded-xl p-4 space-y-3">
              <h4 className="font-bold text-sky-300 flex items-center gap-1.5 text-xs">
                <ClipboardCheck className="w-4 h-4 text-sky-400" />
                <span>Comptage Physique Réel &amp; Régularisation d'Inventaire</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <span className="block text-slate-400 mb-1">Stock Informatique Actuel</span>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-300 font-bold text-sm">
                    {currentArticle?.stock_physique ?? 0} barres
                  </div>
                </div>

                <div>
                  <label className="block text-sky-300 font-bold mb-1">
                    Stock Réel Compté (Physique) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stockReelInput}
                    onChange={e => setStockReelInput(e.target.value)}
                    className="w-full bg-slate-900 border border-sky-500 rounded-lg px-2.5 py-1.5 font-mono text-sky-300 font-bold text-sm focus:outline-none"
                    placeholder="0"
                  />
                </div>

                <div>
                  <span className="block text-slate-400 mb-1">Écart Constaté</span>
                  {(() => {
                    const reel = parseInt(stockReelInput, 10);
                    const diff = isNaN(reel) ? 0 : reel - (currentArticle?.stock_physique ?? 0);
                    return (
                      <div className={`border rounded-lg px-2.5 py-1.5 font-mono font-bold text-sm ${
                        diff === 0 
                          ? 'bg-slate-900 border-slate-800 text-slate-400' 
                          : diff > 0 
                          ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400' 
                          : 'bg-rose-950/60 border-rose-700/60 text-rose-400'
                      }`}>
                        {diff > 0 ? `+${diff}` : diff} barres
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Motif de Régularisation
                  </label>
                  <select
                    value={motifInventaire}
                    onChange={e => setMotifInventaire(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                  >
                    <option value="Comptage physique atelier">Comptage physique atelier</option>
                    <option value="Inventaire périodique mensuel">Inventaire périodique mensuel</option>
                    <option value="Correction d'erreur de saisie">Correction d'erreur de saisie</option>
                    <option value="Régularisation après audit">Régularisation après audit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Remarques / Validé par
                  </label>
                  <input
                    type="text"
                    value={remarqueInventaire}
                    onChange={e => setRemarqueInventaire(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    placeholder="Vérifié par chef d'atelier..."
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Fermer
          </button>

          <div>
            {activeType === 'RECEPTION' && (
              <button
                type="button"
                disabled={isSubmitting || !currentArticle}
                onClick={handleValiderReception}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-40"
              >
                <PackagePlus className="w-4 h-4" />
                <span>Confirmer la Réception</span>
              </button>
            )}

            {activeType === 'SORTIE' && (
              <button
                type="button"
                disabled={isSubmitting || !currentArticle}
                onClick={handleValiderSortie}
                className="px-5 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-40"
              >
                <PackageMinus className="w-4 h-4" />
                <span>Confirmer la Sortie Manuelle</span>
              </button>
            )}

            {activeType === 'INVENTAIRE' && (
              <button
                type="button"
                disabled={isSubmitting || !currentArticle}
                onClick={handleValiderInventaire}
                className="px-5 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-40"
              >
                <Save className="w-4 h-4" />
                <span>Enregistrer l'Ajustement</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
