import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Truck,
  Building2,
  Calendar,
  FileText,
  DollarSign,
  History,
  CornerDownLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { Article, MouvementStock, SuiviOF } from '../../types';
import { StorageService } from '../../services/storage';

export type OperationStockType = 'RECEPTION' | 'SORTIE' | 'INVENTAIRE';

interface OperationsStockModalProps {
  isOpen: boolean;
  initialType?: OperationStockType;
  initialArticle?: Article | null;
  articles: Article[];
  suivisOF?: SuiviOF[];
  mouvements?: MouvementStock[];
  onClose: () => void;
  onStockUpdated: () => void;
}

interface SuccessConfirmationData {
  type: OperationStockType;
  articleCode: string;
  articleDesignation: string;
  quantite: number;
  ancienStock: number;
  nouveauStock: number;
  fournisseur?: string;
  numBL?: string;
  motif?: string;
  destinataire?: string;
  date: string;
}

export const OperationsStockModal: React.FC<OperationsStockModalProps> = ({
  isOpen,
  initialType = 'RECEPTION',
  initialArticle = null,
  articles,
  suivisOF = [],
  mouvements = [],
  onClose,
  onStockUpdated
}) => {
  const [activeType, setActiveType] = useState<OperationStockType>(initialType);
  const [selectedCodeArt, setSelectedCodeArt] = useState<string>(initialArticle?.code_art || (articles[0]?.code_art || ''));
  const [searchArt, setSearchArt] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Champs Réception
  const [qteReception, setQteReception] = useState<string>('10');
  const [fournisseur, setFournisseur] = useState<string>('SOMO');
  const [numBL, setNumBL] = useState<string>('');
  const [dateOperation, setDateOperation] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [updatePrixArticle, setUpdatePrixArticle] = useState<boolean>(false);
  const [nouveauPrixUnitaire, setNouveauPrixUnitaire] = useState<string>('');
  const [remarqueReception, setRemarqueReception] = useState<string>('');

  // Champs Sortie Manuelle
  const [qteSortie, setQteSortie] = useState<string>('1');
  const [motifSortie, setMotifSortie] = useState<string>('Chantier direct / Hors OF');
  const [selectedOfId, setSelectedOfId] = useState<string>('');
  const [destinataireClient, setDestinataireClient] = useState<string>('');
  const [remarqueSortie, setRemarqueSortie] = useState<string>('');

  // Champs Inventaire / Ajustement
  const [stockReelInput, setStockReelInput] = useState<string>('');
  const [motifInventaire, setMotifInventaire] = useState<string>('Comptage physique atelier');
  const [remarqueInventaire, setRemarqueInventaire] = useState<string>('');

  // Écran de confirmation explicite après validation
  const [successConfirmation, setSuccessConfirmation] = useState<SuccessConfirmationData | null>(null);

  // État retour utilisateur en cours de saisie
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'warn' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Synchroniser à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      setSuccessConfirmation(null);
      setFeedback(null);
      if (initialArticle) {
        setSelectedCodeArt(initialArticle.code_art);
        setStockReelInput(String(initialArticle.stock_physique));
        if (initialArticle.prix_unitaire) {
          setNouveauPrixUnitaire(String(initialArticle.prix_unitaire));
        }
      } else if (articles.length > 0 && !selectedCodeArt) {
        setSelectedCodeArt(articles[0].code_art);
        setStockReelInput(String(articles[0].stock_physique));
        if (articles[0].prix_unitaire) {
          setNouveauPrixUnitaire(String(articles[0].prix_unitaire));
        }
      }
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, [isOpen, initialType, initialArticle]);

  const currentArticle = useMemo(() => {
    return articles.find(a => a.code_art === selectedCodeArt) || null;
  }, [articles, selectedCodeArt]);

  // Synchroniser le prix et stock de l'article courant
  useEffect(() => {
    if (currentArticle) {
      if (!stockReelInput) {
        setStockReelInput(String(currentArticle.stock_physique));
      }
      if (currentArticle.prix_unitaire && !nouveauPrixUnitaire) {
        setNouveauPrixUnitaire(String(currentArticle.prix_unitaire));
      }
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

  // Historique récent des mouvements sur l'article sélectionné
  const mouvementsArticleRecents = useMemo(() => {
    if (!currentArticle) return [];
    return mouvements
      .filter(m => m.articleCode === currentArticle.code_art)
      .slice(0, 5);
  }, [mouvements, currentArticle]);

  // OFs disponibles pour affectation d'une sortie
  const ofsDisponibles = useMemo(() => {
    return suivisOF.filter(o => o.statut !== 'LIVRE');
  }, [suivisOF]);

  if (!isOpen) return null;

  const nowFormatted = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // 1. Soumission Réception Marchandise
  const handleValiderReception = async (shouldCloseAfter: boolean) => {
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
      const ancienStock = currentArticle.stock_physique;
      const nouveauStock = ancienStock + qte;
      
      const newPrix = updatePrixArticle && nouveauPrixUnitaire ? parseFloat(nouveauPrixUnitaire) : undefined;

      const updatedArticles = articles.map(a => 
        a.code_art === currentArticle.code_art 
          ? { 
              ...a, 
              stock_physique: nouveauStock,
              ...(newPrix && !isNaN(newPrix) ? { prix_unitaire: newPrix } : {})
            }
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
        fournisseur: fournisseur.trim() || undefined,
        numBL: numBL.trim() || undefined,
        remarque: `Réception Marchandise : +${qte} barres [Stock: ${ancienStock} ➔ ${nouveauStock}]. Fournisseur: ${fournisseur || 'N/A'}${numBL ? ` (BL: ${numBL})` : ''}${remarqueReception ? ` - ${remarqueReception}` : ''}`
      };

      await StorageService.addMouvement(mvt);
      onStockUpdated();

      if (shouldCloseAfter) {
        onClose();
      } else {
        // Afficher l'écran de confirmation avec option de continuer
        setSuccessConfirmation({
          type: 'RECEPTION',
          articleCode: currentArticle.code_art,
          articleDesignation: currentArticle.designation,
          quantite: qte,
          ancienStock,
          nouveauStock,
          fournisseur: fournisseur.trim(),
          numBL: numBL.trim(),
          date: nowFormatted()
        });
      }
    } catch (e: any) {
      setFeedback({ message: `Erreur : ${e.message || 'Impossible d enregistrer la réception.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Soumission Sortie Manuelle
  const handleValiderSortie = async (shouldCloseAfter: boolean) => {
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
      const ancienStock = currentArticle.stock_physique;
      const nouveauStock = ancienStock - qte;
      const updatedArticles = articles.map(a => 
        a.code_art === currentArticle.code_art 
          ? { ...a, stock_physique: nouveauStock }
          : a
      );

      await StorageService.saveArticles(updatedArticles);

      const ofConcerne = ofsDisponibles.find(o => o.id === selectedOfId);

      const mvt: MouvementStock = {
        id: `MVT-SRT-${Date.now()}`,
        date: nowFormatted(),
        type: 'SORTIE_MANUELLE',
        ofId: ofConcerne?.id,
        numCommande: ofConcerne?.numCommande,
        articleCode: currentArticle.code_art,
        designation: currentArticle.designation,
        longueurMm: currentArticle.longeur,
        quantite: qte,
        nomClient: ofConcerne?.client || destinataireClient || undefined,
        remarque: `Sortie Manuelle : -${qte} barres [Stock: ${ancienStock} ➔ ${nouveauStock}]. Motif: ${motifSortie}${ofConcerne ? ` (OF: ${ofConcerne.numCommande})` : ''}${destinataireClient ? ` (Dest: ${destinataireClient})` : ''}${remarqueSortie ? ` - ${remarqueSortie}` : ''}`
      };

      await StorageService.addMouvement(mvt);
      onStockUpdated();

      if (shouldCloseAfter) {
        onClose();
      } else {
        setSuccessConfirmation({
          type: 'SORTIE',
          articleCode: currentArticle.code_art,
          articleDesignation: currentArticle.designation,
          quantite: qte,
          ancienStock,
          nouveauStock,
          motif: motifSortie,
          destinataire: ofConcerne ? `OF ${ofConcerne.numCommande} (${ofConcerne.client})` : destinataireClient,
          date: nowFormatted()
        });
      }
    } catch (e: any) {
      setFeedback({ message: `Erreur : ${e.message || 'Impossible d enregistrer la sortie.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Soumission Inventaire / Ajustement
  const handleValiderInventaire = async (shouldCloseAfter: boolean) => {
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

      if (shouldCloseAfter) {
        onClose();
      } else {
        setSuccessConfirmation({
          type: 'INVENTAIRE',
          articleCode: currentArticle.code_art,
          articleDesignation: currentArticle.designation,
          quantite: Math.abs(ecart),
          ancienStock,
          nouveauStock,
          motif: motifInventaire,
          date: nowFormatted()
        });
      }
    } catch (e: any) {
      setFeedback({ message: `Erreur : ${e.message || 'Impossible d enregistrer l ajustement d inventaire.'}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Réinitialiser pour une nouvelle opération en gardant le N° BL & Fournisseur
  const handleResetForNextOperation = () => {
    setSuccessConfirmation(null);
    setFeedback(null);
    setQteReception('10');
    setQteSortie('1');
    setRemarqueReception('');
    setRemarqueSortie('');
    setRemarqueInventaire('');
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Calculs dynamiques de projection de stock
  const qteRecNum = Math.max(0, parseInt(qteReception, 10) || 0);
  const qteSortieNum = Math.max(0, parseInt(qteSortie, 10) || 0);
  const stockActuel = currentArticle ? currentArticle.stock_physique : 0;
  const stockApresReception = stockActuel + qteRecNum;
  const stockApresSortie = stockActuel - qteSortieNum;
  const isSortieExcessive = currentArticle ? qteSortieNum > stockActuel : false;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* ========================================================================= */}
        {/* HEADER DE LA MODALE                                                       */}
        {/* ========================================================================= */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              activeType === 'RECEPTION'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : activeType === 'SORTIE'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : 'bg-sky-500/15 border-sky-500/40 text-sky-400'
            }`}>
              {activeType === 'RECEPTION' && <PackagePlus className="w-5 h-5" />}
              {activeType === 'SORTIE' && <PackageMinus className="w-5 h-5" />}
              {activeType === 'INVENTAIRE' && <ClipboardCheck className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                <span>
                  {activeType === 'RECEPTION' && 'Réception Marchandise (Entrée Matière)'}
                  {activeType === 'SORTIE' && 'Sortie Manuelle de Stock'}
                  {activeType === 'INVENTAIRE' && 'Inventaire & Ajustement Réel de Stock'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  activeType === 'RECEPTION'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : activeType === 'SORTIE'
                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                    : 'bg-sky-950 text-sky-300 border-sky-800'
                }`}>
                  {activeType === 'RECEPTION' ? 'ENTRÉE +' : activeType === 'SORTIE' ? 'SORTIE -' : 'AJUSTEMENT'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Mise à jour en temps réel du stock disponible et traçabilité complète des mouvements.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SÉLECTEUR D'OPÉRATION (ONGLETS)                                            */}
        {/* ========================================================================= */}
        {!successConfirmation && (
          <div className="grid grid-cols-3 bg-slate-950/70 p-1.5 border-b border-slate-800 text-xs font-bold gap-1.5">
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
              <span>📥 Réception Marchandise</span>
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
              <span>📋 Inventaire Physique</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CORPS DE LA MODALE                                                        */}
        {/* ========================================================================= */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* ──────────────────────────────────────────────────────────────────────── */}
          {/* VUE 1 : ÉCRAN DE CONFIRMATION EXPLICITE APPRÈS VALIDATION                */}
          {/* (Répond au besoin : message clair pour ne pas faire confusion)           */}
          {/* ──────────────────────────────────────────────────────────────────────── */}
          {successConfirmation ? (
            <div className="space-y-4 py-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-5 rounded-2xl bg-emerald-950/50 border-2 border-emerald-500/60 text-center space-y-3 shadow-xl">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div>
                  <h4 className="text-base font-black text-emerald-300">
                    {successConfirmation.type === 'RECEPTION' && 'Réception Enregistrée avec Succès !'}
                    {successConfirmation.type === 'SORTIE' && 'Sortie de Stock Validée avec Succès !'}
                    {successConfirmation.type === 'INVENTAIRE' && 'Inventaire Physique Enregistré !'}
                  </h4>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Le stock physique a été immédiatement mis à jour et un mouvement traçable a été enregistré.
                  </p>
                </div>

                {/* Récapitulatif clair de l'opération */}
                <div className="bg-slate-950/80 border border-emerald-700/50 rounded-xl p-4 text-left space-y-2.5 max-w-xl mx-auto">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-semibold">Article concerné :</span>
                    <span className="font-bold text-slate-100 text-right">
                      <span className="font-mono text-amber-300 mr-1.5">[{successConfirmation.articleCode}]</span>
                      {successConfirmation.articleDesignation}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1.5 bg-slate-900/90 rounded-lg p-2.5 text-center border border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Stock Initial</div>
                      <div className="text-sm font-mono font-bold text-slate-300">
                        {successConfirmation.ancienStock} barres
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">
                        {successConfirmation.type === 'RECEPTION' ? 'Entrée' : successConfirmation.type === 'SORTIE' ? 'Sortie' : 'Écart'}
                      </div>
                      <div className={`text-sm font-mono font-black ${
                        successConfirmation.type === 'RECEPTION' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {successConfirmation.type === 'RECEPTION' ? `+${successConfirmation.quantite}` : `-${successConfirmation.quantite}`} barres
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-emerald-400 uppercase font-bold">Nouveau Stock Dispo</div>
                      <div className="text-base font-mono font-black text-emerald-300">
                        {successConfirmation.nouveauStock} barres
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                    {successConfirmation.fournisseur && (
                      <div>Fournisseur : <span className="font-bold text-slate-100">{successConfirmation.fournisseur}</span></div>
                    )}
                    {successConfirmation.numBL && (
                      <div>N° BL : <span className="font-mono font-bold text-amber-300">{successConfirmation.numBL}</span></div>
                    )}
                    {successConfirmation.destinataire && (
                      <div>Affectation / Destinataire : <span className="font-bold text-slate-100">{successConfirmation.destinataire}</span></div>
                    )}
                    <div>Date : <span className="font-mono text-slate-400">{successConfirmation.date}</span></div>
                  </div>
                </div>

                {/* Boutons d'action clairs post-validation */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition cursor-pointer flex items-center gap-2 shadow"
                  >
                    <X className="w-4 h-4" />
                    <span>Fermer la Fenêtre</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetForNextOperation}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center gap-2"
                  >
                    <PackagePlus className="w-4 h-4" />
                    <span>+ Réceptionner un Autre Article</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Notification Feedback en cours de saisie */}
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

              {/* ──────────────────────────────────────────────────────────────────── */}
              {/* SECTION 1 : SÉLECTION DE L'ARTICLE AVEC RECHERCHE RAPIDE             */}
              {/* ──────────────────────────────────────────────────────────────────── */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-200 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sélection de l'Article / Profilé Aluminium</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {filteredArticles.length} article(s) trouvé(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5 relative">
                    <Search className="w-3.5 h-3.5 text-amber-400 absolute left-2.5 top-2.5" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Filtrer code ou désignation..."
                      value={searchArt}
                      onChange={e => setSearchArt(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && filteredArticles.length > 0) {
                          e.preventDefault();
                          setSelectedCodeArt(filteredArticles[0].code_art);
                          setStockReelInput(String(filteredArticles[0].stock_physique));
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 font-mono focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-7">
                    <select
                      value={selectedCodeArt}
                      onChange={e => {
                        setSelectedCodeArt(e.target.value);
                        const found = articles.find(a => a.code_art === e.target.value);
                        if (found) {
                          setStockReelInput(String(found.stock_physique));
                          if (found.prix_unitaire) setNouveauPrixUnitaire(String(found.prix_unitaire));
                        }
                        setFeedback(null);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500 font-mono truncate"
                    >
                      {filteredArticles.map(a => (
                        <option key={a.code_art} value={a.code_art}>
                          [{a.code_art}] {a.designation} — (Dispo: {a.stock_physique} barres)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ────────────────────────────────────────────────────────────────── */}
                {/* GRAND BANDEAU : QUANTITÉ ACTUELLEMENT DISPONIBLE & PROJECTION      */}
                {/* (Exigence explicite de l'utilisateur)                              */}
                {/* ────────────────────────────────────────────────────────────────── */}
                {currentArticle && (
                  <div className="mt-2 pt-2 border-t border-slate-800 space-y-2">
                    {/* Bloc visuel comparatif 3-volets */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 bg-slate-900/90 rounded-xl border border-slate-700/80">
                      {/* Volet 1 : Stock Actuel Disponible */}
                      <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-center">
                        <div className="text-[10px] uppercase font-bold text-slate-400">
                          📦 Stock Actuel Disponible
                        </div>
                        <div className="text-lg font-mono font-black text-amber-300 mt-0.5">
                          {stockActuel} <span className="text-xs font-normal text-slate-400">barres</span>
                        </div>
                        <div className="mt-1">
                          <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                            stockActuel <= 0 
                              ? 'bg-rose-950 text-rose-300 border border-rose-700'
                              : stockActuel <= (currentArticle.stock_min || 5)
                              ? 'bg-amber-950 text-amber-300 border border-amber-700'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          }`}>
                            {stockActuel <= 0 ? '🔴 Rupture' : stockActuel <= (currentArticle.stock_min || 5) ? '🟡 Seuil Bas' : '🟢 Stock OK'}
                          </span>
                        </div>
                      </div>

                      {/* Volet 2 : Opération en cours */}
                      <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-center flex flex-col justify-center items-center">
                        <div className="text-[10px] uppercase font-bold text-slate-400">
                          {activeType === 'RECEPTION' ? '📥 Entrée Réception' : activeType === 'SORTIE' ? '📤 Sortie Matière' : '📋 Ajustement'}
                        </div>
                        <div className={`text-lg font-mono font-black mt-0.5 ${
                          activeType === 'RECEPTION' ? 'text-emerald-400' : activeType === 'SORTIE' ? 'text-rose-400' : 'text-sky-400'
                        }`}>
                          {activeType === 'RECEPTION' && `+${qteRecNum}`}
                          {activeType === 'SORTIE' && `-${qteSortieNum}`}
                          {activeType === 'INVENTAIRE' && `${(parseInt(stockReelInput, 10) || 0) - stockActuel >= 0 ? '+' : ''}${(parseInt(stockReelInput, 10) || 0) - stockActuel}`}
                          <span className="text-xs font-normal text-slate-400 ml-1">barres</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          L = {currentArticle.longeur} mm
                        </div>
                      </div>

                      {/* Volet 3 : QUANTITÉ PROJETÉE APRÈS RÉCEPTION / SORTIE */}
                      <div className={`p-2 rounded-lg border text-center ${
                        activeType === 'RECEPTION'
                          ? 'bg-emerald-950/40 border-emerald-500/50'
                          : activeType === 'SORTIE' && isSortieExcessive
                          ? 'bg-rose-950/70 border-rose-500'
                          : activeType === 'SORTIE'
                          ? 'bg-rose-950/30 border-rose-700/50'
                          : 'bg-sky-950/40 border-sky-500/50'
                      }`}>
                        <div className="text-[10px] uppercase font-black tracking-wider text-slate-300">
                          {activeType === 'RECEPTION' && '✨ Quantité Après Réception'}
                          {activeType === 'SORTIE' && '✨ Stock Restant Après Sortie'}
                          {activeType === 'INVENTAIRE' && '✨ Stock Après Régularisation'}
                        </div>
                        <div className={`text-xl font-mono font-black mt-0.5 ${
                          activeType === 'RECEPTION'
                            ? 'text-emerald-300'
                            : activeType === 'SORTIE' && isSortieExcessive
                            ? 'text-rose-300 animate-pulse'
                            : activeType === 'SORTIE'
                            ? 'text-slate-200'
                            : 'text-sky-300'
                        }`}>
                          {activeType === 'RECEPTION' && stockApresReception}
                          {activeType === 'SORTIE' && stockApresSortie}
                          {activeType === 'INVENTAIRE' && (parseInt(stockReelInput, 10) || 0)}
                          <span className="text-xs font-normal text-slate-400 ml-1">barres</span>
                        </div>
                        <div className="text-[10px] font-bold">
                          {activeType === 'SORTIE' && isSortieExcessive ? (
                            <span className="text-rose-400 flex items-center justify-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Déficit : {stockApresSortie} barres
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              Valeur est. : {((activeType === 'RECEPTION' ? stockApresReception : stockApresSortie) * (currentArticle.prix_unitaire || 0)).toLocaleString()} DZD
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Données techniques utiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 pt-1">
                      <div>Longueur Barre : <span className="font-mono text-slate-200 font-bold">{currentArticle.longeur} mm</span></div>
                      <div>Largeur Lame : <span className="font-mono text-slate-200 font-bold">{currentArticle.lame} mm</span></div>
                      <div>Seuil d'Alerte : <span className="font-mono text-slate-200 font-bold">{currentArticle.stock_min || 5}</span></div>
                      <div>Prix Achat : <span className="font-mono text-amber-300 font-bold">{currentArticle.prix_unitaire || 0} DZD</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* ──────────────────────────────────────────────────────────────────── */}
              {/* FORMULAIRE 1 : RÉCEPTION MARCHANDISE                                 */}
              {/* ──────────────────────────────────────────────────────────────────── */}
              {activeType === 'RECEPTION' && (
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-emerald-300 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <Truck className="w-4 h-4 text-emerald-400" />
                      <span>Détails du Bon de Réception &amp; Livraison Fournisseur</span>
                    </h4>
                    <span className="text-[11px] text-emerald-400 font-semibold">
                      Quantité reçue : <span className="font-mono font-black text-sm">+{qteRecNum}</span> barres
                    </span>
                  </div>

                  {/* Saisie quantité avec raccourcis rapides */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Quantité de Barres Neuves Reçues *
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={qteReception}
                        onChange={e => setQteReception(e.target.value)}
                        className="w-32 bg-slate-900 border-2 border-emerald-500 rounded-lg px-3 py-1.5 font-mono text-emerald-300 font-black text-base focus:outline-none shadow-inner"
                        placeholder="10"
                      />
                      {/* Boutons d'ajout rapide */}
                      <div className="flex flex-wrap items-center gap-1 text-[11px]">
                        {[1, 5, 10, 20, 50, 100].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setQteReception(String(n))}
                            className={`px-2.5 py-1 rounded font-mono font-bold transition cursor-pointer ${
                              qteReception === String(n)
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Fournisseur & N° BL */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Fournisseur
                      </label>
                      <input
                        type="text"
                        value={fournisseur}
                        onChange={e => setFournisseur(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-slate-100 font-semibold focus:outline-none"
                        placeholder="SOMO, Profilor, etc."
                      />
                      {/* Badges 1-clic fournisseurs fréquents */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['SOMO', 'PROFILOR', 'ALUGATE', 'PROFILÉS 3M'].map(f => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setFournisseur(f)}
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded border transition cursor-pointer ${
                              fournisseur.toUpperCase() === f
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        N° Bon de Livraison (BL)
                      </label>
                      <input
                        type="text"
                        value={numBL}
                        onChange={e => setNumBL(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono font-bold focus:outline-none"
                        placeholder="ex: BL-2026-089"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Date de Réception
                      </label>
                      <input
                        type="date"
                        value={dateOperation}
                        onChange={e => setDateOperation(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Option mise à jour prix article */}
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
                      <input
                        type="checkbox"
                        checked={updatePrixArticle}
                        onChange={e => setUpdatePrixArticle(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-emerald-500 cursor-pointer"
                      />
                      <span>Mettre à jour le prix unitaire de l'article sur cette base</span>
                    </label>

                    {updatePrixArticle && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Nouveau Prix :</span>
                        <input
                          type="number"
                          value={nouveauPrixUnitaire}
                          onChange={e => setNouveauPrixUnitaire(e.target.value)}
                          placeholder="ex: 1200"
                          className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-amber-300 font-mono font-bold focus:outline-none"
                        />
                        <span className="text-slate-400 font-mono">DZD</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Observations / Remarques (Optionnel)
                    </label>
                    <input
                      type="text"
                      value={remarqueReception}
                      onChange={e => setRemarqueReception(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                      placeholder="Conformité vérifiée, palette n°2, profil sans rayures..."
                    />
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────────────────── */}
              {/* FORMULAIRE 2 : SORTIE MANUELLE                                       */}
              {/* ──────────────────────────────────────────────────────────────────── */}
              {activeType === 'SORTIE' && (
                <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-rose-300 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <PackageMinus className="w-4 h-4 text-rose-400" />
                      <span>Détails de la Sortie Manuelle Exceptionnelle</span>
                    </h4>
                    <span className="text-[11px] text-rose-400 font-semibold">
                      Quantité à déduire : <span className="font-mono font-black text-sm">-{qteSortieNum}</span> barres
                    </span>
                  </div>

                  {isSortieExcessive && (
                    <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-xl text-rose-200 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-black text-rose-300">Alerte : Stock physique insuffisant</div>
                        <div className="text-[11px] text-rose-200/90">
                          La quantité demandée ({qteSortieNum} barres) dépasse le stock disponible ({stockActuel} barres). Si vous validez, le stock sera en déficit ({stockApresSortie} barres).
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Saisie quantité sortie avec boutons rapides */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Nombre de Barres à Sortir *
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={qteSortie}
                        onChange={e => setQteSortie(e.target.value)}
                        className="w-32 bg-slate-900 border-2 border-rose-500 rounded-lg px-3 py-1.5 font-mono text-rose-300 font-black text-base focus:outline-none shadow-inner"
                        placeholder="1"
                      />
                      {/* Boutons d'ajout rapide */}
                      <div className="flex flex-wrap items-center gap-1 text-[11px]">
                        {[1, 2, 3, 5, 10].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setQteSortie(String(n))}
                            className={`px-2.5 py-1 rounded font-mono font-bold transition cursor-pointer ${
                              qteSortie === String(n)
                                ? 'bg-rose-500 text-slate-950'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Motif de la Sortie *
                      </label>
                      <select
                        value={motifSortie}
                        onChange={e => setMotifSortie(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                      >
                        <option value="Chantier direct / Hors OF">Chantier direct / Hors OF</option>
                        <option value="Casse / Rebut atelier">Casse / Rebut atelier</option>
                        <option value="Perte / Déformation profilé">Perte / Déformation profilé</option>
                        <option value="Échantillon commercial / SAV">Échantillon commercial / SAV</option>
                        <option value="Dépannage client direct">Dépannage client direct</option>
                        <option value="Autre motif exceptionnel">Autre motif exceptionnel</option>
                      </select>
                    </div>

                    {/* Option affectation directe à un OF en cours */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Affecter à un OF en cours (Optionnel)
                      </label>
                      <select
                        value={selectedOfId}
                        onChange={e => setSelectedOfId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono text-[11px]"
                      >
                        <option value="">-- Aucun OF spécifique --</option>
                        {ofsDisponibles.map(o => (
                          <option key={o.id} value={o.id}>
                            OF {o.numCommande} — {o.client}
                          </option>
                        ))}
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
                        className="w-full bg-slate-900 border border-slate-700 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
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
                      className="w-full bg-slate-900 border border-slate-700 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                      placeholder="Préciser le contexte de la sortie..."
                    />
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────────────────── */}
              {/* FORMULAIRE 3 : INVENTAIRE PHYSIQUE                                   */}
              {/* ──────────────────────────────────────────────────────────────────── */}
              {activeType === 'INVENTAIRE' && (
                <div className="bg-sky-950/20 border border-sky-500/30 rounded-xl p-3.5 sm:p-4 space-y-3">
                  <h4 className="font-black text-sky-300 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <ClipboardCheck className="w-4 h-4 text-sky-400" />
                    <span>Comptage Physique Réel &amp; Régularisation d'Inventaire</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <span className="block text-slate-400 mb-1 font-semibold">Stock Informatique Actuel</span>
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
                        className="w-full bg-slate-900 border-2 border-sky-500 rounded-lg px-2.5 py-1.5 font-mono text-sky-300 font-black text-base focus:outline-none shadow-inner"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <span className="block text-slate-400 mb-1 font-semibold">Écart Constaté</span>
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
                        className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
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
                        className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                        placeholder="Vérifié par chef d'atelier..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────────────────── */}
              {/* HISTORIQUE RÉCENT DES MOUVEMENTS SUR CET ARTICLE                     */}
              {/* ──────────────────────────────────────────────────────────────────── */}
              {mouvementsArticleRecents.length > 0 && (
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span>Derniers mouvements sur cet article ({currentArticle?.code_art})</span>
                  </div>
                  <div className="space-y-1">
                    {mouvementsArticleRecents.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-slate-900/80 border border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-mono">{m.date}</span>
                          <span className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                            m.type === 'RECEPTION_MARCHANDISE' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                          }`}>
                            {m.type === 'RECEPTION_MARCHANDISE' ? '📥 Réception' : '📤 Sortie'}
                          </span>
                          <span className="font-mono font-bold text-slate-300">
                            {m.type === 'RECEPTION_MARCHANDISE' ? `+${m.quantite}` : `-${m.quantite}`} barres
                          </span>
                        </div>
                        <div className="text-slate-400 truncate max-w-xs text-[10px]">
                          {m.fournisseur || m.nomClient || m.remarque || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ========================================================================= */}
        {/* FOOTER ACTIONS                                                            */}
        {/* ========================================================================= */}
        {!successConfirmation && (
          <div className="bg-slate-950 px-5 py-3.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Annuler / Fermer
            </button>

            <div className="flex items-center gap-2">
              {activeType === 'RECEPTION' && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting || !currentArticle}
                    onClick={() => handleValiderReception(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40"
                    title="Enregistrer et afficher la confirmation avec option d'ajouter un autre article"
                  >
                    Valider &amp; Continuer
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting || !currentArticle}
                    onClick={() => handleValiderReception(true)}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-40"
                    title="Enregistrer la réception et fermer immédiatement"
                  >
                    <PackagePlus className="w-4 h-4" />
                    <span>Valider &amp; Fermer</span>
                  </button>
                </>
              )}

              {activeType === 'SORTIE' && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting || !currentArticle}
                    onClick={() => handleValiderSortie(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Valider &amp; Continuer
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting || !currentArticle}
                    onClick={() => handleValiderSortie(true)}
                    className="px-5 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-lg shadow-rose-600/20 transition cursor-pointer disabled:opacity-40"
                  >
                    <PackageMinus className="w-4 h-4" />
                    <span>Valider &amp; Fermer</span>
                  </button>
                </>
              )}

              {activeType === 'INVENTAIRE' && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting || !currentArticle}
                    onClick={() => handleValiderInventaire(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/40 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Ajuster &amp; Continuer
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting || !currentArticle}
                    onClick={() => handleValiderInventaire(true)}
                    className="px-5 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition cursor-pointer disabled:opacity-40"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Ajuster &amp; Fermer</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
