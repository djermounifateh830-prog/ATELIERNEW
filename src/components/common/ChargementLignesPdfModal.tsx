import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Trash2,
  ShieldCheck,
  Layers,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  FileSpreadsheet,
  Palette,
  Lock,
  MinusCircle,
  Camera
} from 'lucide-react';
import {
  PdfCommandeParserService,
  LigneCommandeExtraite,
  ResultatExtractionPDF
} from '../../services/pdfCommandeParserService';
import { Article, FigurePrecadre, ModeDebordementPrecadre } from '../../types';
import { InspecteurVisionChassisModal } from '../modals/InspecteurVisionChassisModal';

interface ChargementLignesPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  familleActive: 'TABLIER' | 'CAISSON' | 'MOUSTIQUAIRE' | 'PRECADRE';
  nomProfilActif?: string;
  numCommandeActuel?: string;
  nomClientActuel?: string;
  articles?: Article[];
  onBasculerFamille?: (famille: 'TABLIER' | 'PRECADRE' | 'CAISSON' | 'MOUSTIQUAIRE') => void;
  onValiderImportLignes: (data: {
    lignes: LigneCommandeExtraite[];
    modeAjout: 'REMPLACER' | 'AJOUTER';
    majNumCommande?: string;
    majClient?: string;
    majDate?: string;
    majAvecLF?: boolean;
    hauteurLameSuggeree?: number;
    couleurDetectee?: string;
    articleSuggere?: Article;
    appliquerProfilEtCouleur?: boolean;
    typePrecadreSuggere?: string;
    articlePrecadreSuggere?: Article;
    figurePrecadreSuggeree?: FigurePrecadre;
    modeDebordementSuggere?: ModeDebordementPrecadre;
    typeCaissonSuggere?: string;
    articleCaissonSuggere?: Article;
    avecSousFaceSuggeree?: boolean;
    colorisSousFaceSuggere?: string;
  }) => void;
}

export const ChargementLignesPdfModal: React.FC<ChargementLignesPdfModalProps> = ({
  isOpen,
  onClose,
  familleActive,
  nomProfilActif,
  numCommandeActuel,
  nomClientActuel,
  articles = [],
  onBasculerFamille,
  onValiderImportLignes
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultat, setResultat] = useState<ResultatExtractionPDF | null>(null);
  const [nomFichier, setNomFichier] = useState<string>('');
  const [lignesSelectionnees, setLignesSelectionnees] = useState<Set<string>>(new Set());
  const [lignesModifiables, setLignesModifiables] = useState<LigneCommandeExtraite[]>([]);
  
  // Options d'injection : En-tête PROTÉGÉ PAR DÉFAUT (ne pas écraser les données client / N° commande de l'utilisateur)
  const [modeAjout, setModeAjout] = useState<'REMPLACER' | 'AJOUTER'>('REMPLACER');
  const [modifierEnTete, setModifierEnTete] = useState(false); // DEFAULT FALSE : Sécurité anti-écrasement
  const [appliquerNumCmd, setAppliquerNumCmd] = useState(false); // DEFAULT FALSE
  const [appliquerClient, setAppliquerClient] = useState(false); // DEFAULT FALSE
  const [appliquerProfilCouleur, setAppliquerProfilCouleur] = useState(true); // DEFAULT TRUE : Appliquer profilé et couleur détectés
  const [optionAvecLF, setOptionAvecLF] = useState<boolean>(true); // Option Lame Finale : Détectée ou au choix
  const [afficherRecapitulatif, setAfficherRecapitulatif] = useState<boolean>(true); // Afficher/Masquer le panneau supérieur pour maximiser l'espace tableau
  
  // Inspecteur visuel de châssis / photo
  const [inspecteurLigne, setInspecteurLigne] = useState<LigneCommandeExtraite | null>(null);
  const [isInspecteurOpen, setIsInspecteurOpen] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAppliquerDepuisInspecteur = (
    mode: ModeDebordementPrecadre,
    debSup: number,
    debInf: number,
    figure?: FigurePrecadre
  ) => {
    if (!inspecteurLigne) return;
    setLignesModifiables(prev => prev.map(l => {
      if (l.id === inspecteurLigne.id) {
        return {
          ...l,
          modeDebordementPrecadre: mode,
          debordementSuperieur: debSup,
          debordementInferieur: debInf,
          figurePrecadre: figure || l.figurePrecadre,
          sourceDetectionDebordement: 'PHOTO',
          detailsDebordement: `Validé via Inspecteur Visuel : ${mode} (${debSup}/${debInf} mm)${figure ? ` • ${figure}` : ''}`
        };
      }
      return l;
    }));
    setIsInspecteurOpen(false);
  };

  // Fonction de réinitialisation complète de la modale
  const resetAllState = () => {
    setResultat(null);
    setNomFichier('');
    setLignesModifiables([]);
    setLignesSelectionnees(new Set());
    setIsDragging(false);
    setIsProcessing(false);
    setModifierEnTete(false);
    setAppliquerNumCmd(false);
    setAppliquerClient(false);
    setAppliquerProfilCouleur(true);
    setOptionAvecLF(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Réinitialisation automatique lorsque la modale est fermée ou ré-ouverte
  useEffect(() => {
    if (!isOpen) {
      resetAllState();
    }
  }, [isOpen]);

  const handleClose = () => {
    resetAllState();
    onClose();
  };

  // Recherche de l'article exact correspondant au profil et à la couleur détectés
  const articleTablierTrouve = useMemo(() => {
    if (!resultat || articles.length === 0) return null;
    return PdfCommandeParserService.trouverArticleTablierPourPdf(
      resultat.hauteurLameDetectee || 55,
      resultat.couleurNormalisee,
      articles
    );
  }, [resultat, articles]);

  // Mode strict : chaque moteur est exclusif à sa famille
  const isPrecadre = familleActive === 'PRECADRE';
  const isCaisson = familleActive === 'CAISSON';

  // Validation stricte : le document doit correspondre exactement à la famille du moteur ouvert
  const estImportValide = useMemo(() => {
    if (!resultat) return false;
    if (familleActive === 'PRECADRE') {
      return resultat.familleDetectee === 'PRECADRE';
    }
    if (familleActive === 'TABLIER') {
      return resultat.familleDetectee === 'TABLIER';
    }
    if (familleActive === 'MOUSTIQUAIRE') {
      return resultat.familleDetectee === 'MOUSTIQUAIRE';
    }
    if (familleActive === 'CAISSON') {
      return resultat.familleDetectee === 'CAISSON';
    }
    return false;
  }, [resultat, familleActive]);

  const estImportRefuse = resultat !== null && !estImportValide;

  const articlePrecadreTrouve = useMemo(() => {
    if (!resultat || articles.length === 0) return null;
    return PdfCommandeParserService.trouverArticlePrecadrePourPdf(
      resultat.typePrecadreDetecte || 'TYPE_50',
      articles
    );
  }, [resultat, articles]);

  const articleCaissonTrouve = useMemo(() => {
    if (!resultat || articles.length === 0) return null;
    return PdfCommandeParserService.trouverArticleCaissonPourPdf(
      resultat.typeCaissonPrincipalDetecte || '30',
      articles
    );
  }, [resultat, articles]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Veuillez sélectionner un document PDF.');
      return;
    }

    setNomFichier(file.name);
    setIsProcessing(true);

    try {
      const res = await PdfCommandeParserService.parserBordereauPDF(file);
      setResultat(res);
      setLignesModifiables(res.lignes);
      setLignesSelectionnees(new Set(res.lignes.map(l => l.id)));
      if (res.avecLameFinaleDetectee !== undefined) {
        setOptionAvecLF(res.avecLameFinaleDetectee);
      } else {
        setOptionAvecLF(true);
      }
    } catch (err: any) {
      alert(`Erreur d'analyse : ${err?.message || 'Fichier PDF non lisible'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const toggleSelectAll = () => {
    if (lignesSelectionnees.size === lignesModifiables.length) {
      setLignesSelectionnees(new Set());
    } else {
      setLignesSelectionnees(new Set(lignesModifiables.map(l => l.id)));
    }
  };

  const toggleSelectLigne = (id: string) => {
    const next = new Set(lignesSelectionnees);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLignesSelectionnees(next);
  };

  const handleSupprimerLigne = (id: string) => {
    setLignesModifiables(prev => prev.filter(l => l.id !== id));
    setLignesSelectionnees(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleModifierChamp = (id: string, field: keyof LigneCommandeExtraite, val: any) => {
    setLignesModifiables(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: val } : l))
    );
  };

  const handleAppliquerFigureSelection = (figure: FigurePrecadre) => {
    setLignesModifiables(prev =>
      prev.map(l => (lignesSelectionnees.has(l.id) ? { ...l, figurePrecadre: figure } : l))
    );
  };

  const handleAppliquerModeDebordementSelection = (
    mode: ModeDebordementPrecadre,
    debSup?: number,
    debInf?: number
  ) => {
    setLignesModifiables(prev =>
      prev.map(l => {
        if (!lignesSelectionnees.has(l.id)) return l;
        const sup = debSup !== undefined ? debSup : (mode === 'SANS_DEBORDEMENT' || mode === 'INFERIEUR_SEUL' ? 0 : 100);
        const inf = debInf !== undefined ? debInf : (mode === 'SANS_DEBORDEMENT' || mode === 'SUPERIEUR_SEUL' ? 0 : 300);
        return {
          ...l,
          modeDebordementPrecadre: mode,
          debordementSuperieur: sup,
          debordementInferieur: inf
        };
      })
    );
  };

  const handleAppliquerTypePrecadreSelection = (typePrecadre: 'TYPE_50' | 'TYPE_36') => {
    setLignesModifiables(prev =>
      prev.map(l =>
        lignesSelectionnees.has(l.id)
          ? {
              ...l,
              typePrecadre,
              typePrecadreLabel: typePrecadre === 'TYPE_36' ? 'CT 36' : 'CT 50'
            }
          : l
      )
    );
  };

  const handleChangerModeDebordementLigne = (id: string, mode: ModeDebordementPrecadre) => {
    const debSup = mode === 'SANS_DEBORDEMENT' || mode === 'INFERIEUR_SEUL' ? 0 : 100;
    const debInf = mode === 'SANS_DEBORDEMENT' || mode === 'SUPERIEUR_SEUL' ? 0 : 300;
    setLignesModifiables(prev =>
      prev.map(l =>
        l.id === id
          ? {
              ...l,
              modeDebordementPrecadre: mode,
              debordementSuperieur: debSup,
              debordementInferieur: debInf
            }
          : l
      )
    );
  };

  const handleAppliquerTypeCaissonSelection = (typeCaisson: '25' | '30' | '35' | '40' | 'FIBRAGLO') => {
    const art = PdfCommandeParserService.trouverArticleCaissonPourPdf(typeCaisson, articles);
    const labelMap: Record<string, string> = {
      '25': 'Caisson 25 (25X25)',
      '30': 'Caisson 30 (30X30)',
      '35': 'Caisson 35 (35X35)',
      '40': 'Caisson 40 (40X40)',
      'FIBRAGLO': 'Caisson FIBRAGLO'
    };
    setLignesModifiables(prev =>
      prev.map(l =>
        lignesSelectionnees.has(l.id)
          ? {
              ...l,
              typeCaissonDetecte: typeCaisson,
              typeCaissonLabel: labelMap[typeCaisson] || `Caisson ${typeCaisson}`,
              articleCaissonCode: art?.code_art || l.articleCaissonCode,
              articleCaissonDesignation: art?.designation || l.articleCaissonDesignation
            }
          : l
      )
    );
  };

  const handleAppliquerSousFaceSelection = (avecSF: boolean, coloris?: string) => {
    setLignesModifiables(prev =>
      prev.map(l =>
        lignesSelectionnees.has(l.id)
          ? {
              ...l,
              avecSousFaceDetectee: avecSF,
              colorisSousFace: coloris !== undefined ? coloris : l.colorisSousFace
            }
          : l
      )
    );
  };

  const handleConfirmer = () => {
    if (estImportRefuse) {
      alert(
        familleActive === 'PRECADRE'
          ? "Importation refusée : Cette commande n'est pas un bon de commande de Précadre."
          : familleActive === 'CAISSON'
          ? "Importation refusée : Cette commande n'est pas un bon de commande de Caisson Tunnel."
          : "Importation refusée : Cette commande n'est pas un bon de commande de Tablier / Volet Roulant."
      );
      return;
    }

    const selection = lignesModifiables.filter(l => lignesSelectionnees.has(l.id));
    if (selection.length === 0) {
      alert('Veuillez sélectionner au moins une ligne à charger.');
      return;
    }

    onValiderImportLignes({
      lignes: selection,
      modeAjout,
      majNumCommande: (modifierEnTete && appliquerNumCmd && resultat?.numCommandeDetecte) ? resultat.numCommandeDetecte : undefined,
      majClient: (modifierEnTete && appliquerClient && resultat?.clientDetecte) ? resultat.clientDetecte : undefined,
      majDate: (modifierEnTete && resultat?.dateISODetectee) ? resultat.dateISODetectee : undefined,
      majAvecLF: optionAvecLF,
      hauteurLameSuggeree: resultat?.hauteurLameDetectee || selection[0]?.hauteurLameDetectee,
      couleurDetectee: resultat?.couleurNormalisee || resultat?.couleurDetectee,
      articleSuggere: (appliquerProfilCouleur && (isPrecadre ? articlePrecadreTrouve : isCaisson ? articleCaissonTrouve : articleTablierTrouve)) || undefined,
      appliquerProfilEtCouleur: appliquerProfilCouleur,
      typePrecadreSuggere: resultat?.typePrecadreDetecte || selection[0]?.typePrecadre || 'TYPE_50',
      articlePrecadreSuggere: articlePrecadreTrouve || undefined,
      figurePrecadreSuggeree: selection[0]?.figurePrecadre,
      modeDebordementSuggere: selection[0]?.modeDebordementPrecadre,
      typeCaissonSuggere: selection[0]?.typeCaissonDetecte || resultat?.typeCaissonPrincipalDetecte || '30',
      articleCaissonSuggere: articleCaissonTrouve || undefined,
      avecSousFaceSuggeree: selection.some(l => l.avecSousFaceDetectee),
      colorisSousFaceSuggere: selection.find(l => l.colorisSousFace)?.colorisSousFace || resultat?.colorisSousFaceDetecte || 'BRUT'
    });

    handleClose();
  };

  const totalSelectionnePieces = lignesModifiables
    .filter(l => lignesSelectionnees.has(l.id))
    .reduce((sum, l) => sum + (Number(l.quantite) || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className={`bg-slate-900 border-2 rounded-2xl w-[98vw] max-w-[1600px] max-h-[96vh] flex flex-col shadow-2xl overflow-hidden ${
        isPrecadre
          ? 'border-purple-500/50 shadow-purple-950/50'
          : isCaisson
          ? 'border-emerald-500/50 shadow-emerald-950/50'
          : 'border-amber-500/50 shadow-amber-950/50'
      }`}>
        
        {/* En-tête Modal Dédié à la Famille */}
        <div className={`px-6 py-4 border-b bg-slate-950 flex items-center justify-between ${
          isPrecadre
            ? 'border-purple-500/30'
            : isCaisson
            ? 'border-emerald-500/30'
            : 'border-amber-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isPrecadre
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                : isCaisson
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-100 tracking-tight">
                  {isPrecadre
                    ? 'Moteur d\'Importation Dédié — Précadres Aluminium'
                    : isCaisson
                    ? 'Moteur d\'Importation Dédié — Caissons Tunnel & Sous-Faces'
                    : 'Moteur d\'Importation Dédié — Volets Roulants & Tabliers'}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  isPrecadre
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : isCaisson
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {isPrecadre ? '🚪 Exclusif Précadre' : isCaisson ? '📦 Exclusif Caisson' : '🪟 Exclusif Tablier'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Contrôle Strict Famille</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isPrecadre
                  ? 'Traitement exclusif des bons de commande de Précadres (CT 50 / CT 36, Dormants). Tout autre type de commande sera refusé.'
                  : isCaisson
                  ? 'Traitement exclusif des bons de commande de Caissons Tunnel (25, 30, 35, 40, FIBRAGLO) et Sous-Faces.'
                  : 'Traitement exclusif des bons de commande de Tabliers et Volets (Lames 55 / 43). Tout autre type de commande sera refusé.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Zone de Dépôt / Sélection du fichier */}
          {!resultat && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition cursor-pointer flex flex-col items-center justify-center gap-4 ${
                isDragging
                  ? isPrecadre
                    ? 'border-purple-400 bg-purple-500/10 scale-[0.99]'
                    : isCaisson
                    ? 'border-emerald-400 bg-emerald-500/10 scale-[0.99]'
                    : 'border-amber-400 bg-amber-500/10 scale-[0.99]'
                  : isPrecadre
                  ? 'border-purple-500/30 bg-slate-950/60 hover:border-purple-500/60 hover:bg-slate-950'
                  : isCaisson
                  ? 'border-emerald-500/30 bg-slate-950/60 hover:border-emerald-500/60 hover:bg-slate-950'
                  : 'border-slate-700 bg-slate-950/50 hover:border-amber-500/50 hover:bg-slate-950'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => {
                  if (e.target.value && e.target.files?.[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />
              <div className={`p-4 rounded-2xl border shadow-inner ${
                isPrecadre
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                  : isCaisson
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                {isProcessing ? (
                  <div className={`w-10 h-10 border-4 rounded-full animate-spin ${
                    isPrecadre
                      ? 'border-purple-400 border-t-transparent'
                      : isCaisson
                      ? 'border-emerald-400 border-t-transparent'
                      : 'border-amber-400 border-t-transparent'
                  }`} />
                ) : (
                  <Upload className="w-10 h-10" />
                )}
              </div>
              <div>
                <p className="text-base font-bold text-slate-200">
                  {isProcessing
                    ? 'Analyse du document PDF en cours...'
                    : isPrecadre
                    ? 'Glissez votre Bon de Commande de PRÉCADRES ici (ou cliquez pour parcourir)'
                    : isCaisson
                    ? 'Glissez votre Bon de Commande de CAISSONS TUNNEL ici (ou cliquez pour parcourir)'
                    : 'Glissez votre Bon de Commande de TABLIERS / VOLETS ici (ou cliquez pour parcourir)'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {isPrecadre
                    ? 'Détection et extraction sécurisées des profilés CT 50/36, dimensions châssis, renforts et débordements'
                    : isCaisson
                    ? 'Détection et extraction sécurisées des Caissons 25, 30, 35, 40, FIBRAGLO et Sous-Faces associées'
                    : 'Détection et extraction sécurisées des lames 55/43, dimensions tabliers, coloris et lames finales'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                <span>
                  🛡️ <strong>Sécurité anti-erreur</strong> : ce moteur vérifie automatiquement la nature de la commande et refuse tout document non conforme.
                </span>
              </div>
            </div>
          )}

          {/* Si extraction effectuée */}
          {resultat && (
            estImportRefuse ? (
              <div className="bg-red-950/30 border-2 border-red-500/80 rounded-2xl p-6 shadow-2xl space-y-5 animate-fadeIn">
                <div className="flex items-start gap-4">
                  <div className="p-3.5 bg-red-500/20 border-2 border-red-500 rounded-2xl text-red-400 shrink-0 shadow-lg shadow-red-500/20">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-sm flex items-center gap-1">
                        <span>⛔</span>
                        <span>Importation Refusée</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-red-300 bg-red-950/60 px-2.5 py-0.5 rounded border border-red-500/30">
                        Fichier : {nomFichier}
                      </span>
                      {resultat.numCommandeDetecte && (
                        <span className="text-xs font-mono font-bold text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          N° Commande : {resultat.numCommandeDetecte}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-black text-red-100">
                      {familleActive === 'PRECADRE'
                        ? "Cette commande n'est pas un bon de commande de Précadre et l'import est refusé."
                        : familleActive === 'CAISSON'
                        ? "Cette commande n'est pas un bon de commande de Caisson Tunnel et l'import est refusé."
                        : familleActive === 'TABLIER'
                        ? "Cette commande n'est pas un bon de commande de Tablier / Volet Roulant et l'import est refusé."
                        : `Cette commande n'est pas de la famille ${familleActive} et l'import est refusé.`}
                    </h3>

                    <div className="p-4 rounded-xl bg-slate-950/80 border border-red-500/30 text-xs text-slate-300 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Famille du moteur actif :</span>
                        <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                          familleActive === 'PRECADRE'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : familleActive === 'CAISSON'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {familleActive === 'PRECADRE'
                            ? '🚪 Précadre Aluminium (Exclusif)'
                            : familleActive === 'CAISSON'
                            ? '📦 Caisson Tunnel (Exclusif)'
                            : '🪟 Volet Roulant / Tablier (Exclusif)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Famille détectée dans le PDF :</span>
                        <span className="px-2 py-0.5 rounded font-black text-[11px] bg-red-500/20 text-red-300 border border-red-500/40">
                          {resultat.familleDetectee === 'TABLIER' ? '🪟 Volet Roulant / Tablier' :
                           resultat.familleDetectee === 'PRECADRE' ? '🚪 Précadre Aluminium' :
                           resultat.familleDetectee === 'MOUSTIQUAIRE' ? '🦟 Moustiquaire' :
                           resultat.familleDetectee === 'CAISSON' ? '📦 Caisson & Sous-face' :
                           '❓ Document non identifié pour cette famille'}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-800 text-slate-300 leading-relaxed">
                        {familleActive === 'CAISSON' ? (
                          <div>
                            <p className="font-semibold text-slate-200">
                              Le moteur d'importation de l'onglet Caisson traite exclusivement les commandes de Caissons Tunnel (25, 30, 35, 40, FIBRAGLO) et Sous-Faces.
                            </p>
                            {resultat.familleDetectee === 'TABLIER' ? (
                              <p className="text-sky-300 font-semibold mt-1">
                                👉 Ce fichier a été identifié comme un <strong>Bon de Commande de Tablier / Volet Roulant</strong>. Veuillez basculer sur l'onglet <strong>Volet / Tablier</strong> pour importer ce document.
                              </p>
                            ) : resultat.familleDetectee === 'PRECADRE' ? (
                              <p className="text-purple-300 font-semibold mt-1">
                                👉 Ce fichier a été identifié comme un <strong>Bon de Commande de Précadre Aluminium</strong>. Veuillez basculer sur l'onglet <strong>Précadre</strong> pour importer ce document.
                              </p>
                            ) : (
                              <p className="text-slate-400 mt-1">
                                Aucun caisson tunnel reconnu dans ce document. L'import est bloqué pour protéger vos calculs d'atelier.
                              </p>
                            )}
                          </div>
                        ) : familleActive === 'PRECADRE' ? (
                          <div>
                            <p className="font-semibold text-slate-200">
                              Le moteur d'importation de l'onglet Précadre traite exclusivement les commandes de Précadres (CT 50 / CT 36 / Dormants aluminium).
                            </p>
                            {resultat.familleDetectee === 'TABLIER' ? (
                              <p className="text-sky-300 font-semibold mt-1">
                                👉 Ce fichier a été identifié comme un <strong>Bon de Commande de Tablier / Volet Roulant</strong> (Lame {resultat.hauteurLameDetectee || 55}mm). Veuillez basculer sur l'onglet <strong>Volet / Tablier</strong> dans Écosystème pour importer ce document.
                              </p>
                            ) : resultat.familleDetectee === 'CAISSON' ? (
                              <p className="text-emerald-300 font-semibold mt-1">
                                👉 Ce fichier a été identifié comme un <strong>Bon de Commande de Caisson Tunnel</strong>. Veuillez basculer sur l'onglet <strong>Caisson / Sous-Face</strong> pour importer ce document.
                              </p>
                            ) : (
                              <p className="text-slate-400 mt-1">
                                Aucun élément ni profilé de précadre reconnu dans ce document. L'import est bloqué pour protéger l'intégrité de vos fiches de fabrication.
                              </p>
                            )}
                          </div>
                        ) : familleActive === 'TABLIER' ? (
                          <div>
                            <p className="font-semibold text-slate-200">
                              Le moteur d'importation de l'onglet Tablier traite exclusivement les commandes de Tabliers et Volets Roulants (Lames 55 / 43, Lames Finales).
                            </p>
                            {resultat.familleDetectee === 'PRECADRE' ? (
                              <p className="text-purple-300 font-semibold mt-1">
                                👉 Ce fichier a été identifié comme un <strong>Bon de Commande de Précadre Aluminium</strong> ({resultat.typePrecadreDetecte || 'Profilé CT 50/36'}). Veuillez basculer sur l'onglet <strong>Précadre</strong> dans Écosystème pour importer ce document.
                              </p>
                            ) : resultat.familleDetectee === 'CAISSON' ? (
                              <p className="text-emerald-300 font-semibold mt-1">
                                👉 Ce fichier a été identifié comme un <strong>Bon de Commande de Caisson Tunnel</strong>. Veuillez basculer sur l'onglet <strong>Caisson / Sous-Face</strong> pour importer ce document.
                              </p>
                            ) : (
                              <p className="text-slate-400 mt-1">
                                Aucun tablier ni volet roulant n'a été reconnu dans ce document. L'import est refusé.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Actions dans le bandeau de refus */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-red-500/20">
                      <button
                        type="button"
                        onClick={() => {
                          resetAllState();
                          fileInputRef.current?.click();
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-slate-700"
                      >
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span>Sélectionner un autre fichier PDF</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {onBasculerFamille && (
                          (familleActive === 'PRECADRE' && resultat.familleDetectee === 'TABLIER') ||
                          (familleActive === 'TABLIER' && resultat.familleDetectee === 'PRECADRE') ||
                          (familleActive !== 'CAISSON' && resultat.familleDetectee === 'CAISSON')
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              const cible = resultat.familleDetectee as any;
                              handleClose();
                              onBasculerFamille(cible);
                            }}
                            className="px-4 py-2 rounded-xl font-black text-xs transition flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/30"
                          >
                            <span>
                              {resultat.familleDetectee === 'TABLIER'
                                ? "🪟 Basculer vers l'Onglet Volet / Tablier"
                                : resultat.familleDetectee === 'CAISSON'
                                ? "📦 Basculer vers l'Onglet Caisson / Sous-Face"
                                : "🚪 Basculer vers l'Onglet Précadre"}
                            </span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleClose}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold transition cursor-pointer"
                        >
                          Fermer
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn">
              
              {/* Cartes Récapitulatives Détectées (Rétractable pour un confort maximal) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Données détectées dans le PDF</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                      isPrecadre ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {isPrecadre ? (resultat.typePrecadreDetecte === 'TYPE_36' ? 'CT 36' : 'CT 50') : 'Volet / Tablier'}
                    </span>
                    {resultat.numCommandeDetecte && (
                      <span className="text-[11px] font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                        N° {resultat.numCommandeDetecte}
                      </span>
                    )}
                    {resultat.clientDetecte && (
                      <span className="text-[11px] text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-medium">
                        Client : <strong className="text-slate-100">{resultat.clientDetecte}</strong>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAfficherRecapitulatif(v => !v)}
                    className="text-xs font-bold text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 transition cursor-pointer flex items-center gap-1"
                  >
                    <span>{afficherRecapitulatif ? 'Masquer détails ▲' : 'Afficher détails ▼'}</span>
                  </button>
                </div>

                {afficherRecapitulatif && (
                  <div className="space-y-3">
                
                {/* 1. Sécurité En-tête Commande : PROTÉGÉE CONTRE L'ÉCRASEMENT INVOLONTAIRE */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wide">
                          En-tête de Commande
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {modifierEnTete ? 'Modification manuelle activée' : 'Protégé / Conservé'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {modifierEnTete
                          ? 'Les données détectées du PDF seront appliquées à l\'en-tête de la commande.'
                          : 'Vos informations actuelles (N° Commande & Nom du Client) restent intactes et ne sont pas écrasées.'}
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 hover:bg-slate-900 text-xs text-slate-300 cursor-pointer select-none transition self-start md:self-auto">
                    <input
                      type="checkbox"
                      checked={modifierEnTete}
                      onChange={e => {
                        const checked = e.target.checked;
                        setModifierEnTete(checked);
                        setAppliquerNumCmd(checked);
                        setAppliquerClient(checked);
                      }}
                      className="rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="font-semibold text-[11px]">Remplir aussi l'en-tête depuis le PDF</span>
                  </label>
                </div>

                {/* Détails optionnels si l'utilisateur choisit explicitement de modifier l'en-tête */}
                {modifierEnTete && (
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-fadeIn">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          N° Commande / BL détecté
                        </span>
                        <span className="font-mono font-black text-amber-300">
                          {resultat.numCommandeDetecte || 'Non détecté'}
                        </span>
                      </div>
                      <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={appliquerNumCmd}
                          onChange={e => setAppliquerNumCmd(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Appliquer</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Client détecté
                        </span>
                        <span className="font-bold text-slate-200 truncate max-w-[180px] block" title={resultat.clientDetecte}>
                          {resultat.clientDetecte || 'Non détecté'}
                        </span>
                      </div>
                      <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={appliquerClient}
                          onChange={e => setAppliquerClient(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Appliquer</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 2. Profilé, Couleur, Lame Finale ou Précadre et Contrôle */}
                {isPrecadre ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 1. Profilé Précadre */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Profilé Précadre Détecté</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md">
                          {resultat.typePrecadreDetecte === 'TYPE_36' ? 'Type CT 36' : 'Type CT 50'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {resultat.typePrecadreDetecte === 'TYPE_36' ? 'Profilé 36mm' : 'Profilé 50mm'}
                        </span>
                      </div>
                      {articlePrecadreTrouve && (
                        <div className="text-[11px] font-bold text-slate-200 mt-1 truncate" title={articlePrecadreTrouve.designation}>
                          📦 <span className="text-emerald-300">{articlePrecadreTrouve.designation}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Coloris */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Palette className="w-3.5 h-3.5 text-sky-400" />
                        <span>Coloris / Finition</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sky-300 text-xs bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-md">
                          {resultat.couleurDetectee || resultat.couleurNormalisee || 'BL (Blanc)'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Laquage menuiserie alu
                      </div>
                    </div>

                    {/* 3. Schémas & Renforts Détectés */}
                    <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Schémas & Renforts Détectés</span>
                      </span>
                      <div className="text-[10.5px] text-amber-300 font-semibold space-y-0.5">
                        <div>• Baies PM : <span className="text-slate-200 font-bold">Renfort Vertical (H1)</span></div>
                        <div>• Fenêtres : <span className="text-slate-200 font-bold">Cadre Fermé (Vide)</span></div>
                        <div>• Baies GM PF : <span className="text-slate-200 font-bold">Croisé (R+H)</span></div>
                        <div>• Portes-Fenêtres : <span className="text-slate-200 font-bold">Traverse (L1)</span></div>
                      </div>
                    </div>

                    {/* 4. Contrôle & Débordements */}
                    <div className="space-y-1.5 bg-slate-900/90 border border-emerald-500/40 rounded-lg p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Débordements des Montants</span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-300 font-bold">
                          {lignesModifiables.length} châssis
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-300 leading-snug">
                        Baies / PF : <strong className="text-emerald-400">H+100 / B+300</strong> • Fenêtres : <strong className="text-sky-300">0 / 0</strong>
                      </div>
                      {/* Boutons d'application globale en 1 clic */}
                      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800">
                        <span className="text-[9px] text-slate-400 font-semibold mr-0.5">Tout forcer :</span>
                        <button
                          type="button"
                          onClick={() => {
                            lignesModifiables.forEach(l => handleChangerModeDebordementLigne(l.id, 'SUPERIEUR_INFERIEUR'));
                          }}
                          className="px-1.5 py-0.5 rounded bg-emerald-950 hover:bg-emerald-800 text-emerald-300 text-[10px] font-bold cursor-pointer border border-emerald-500/40 transition active:scale-95"
                          title="Appliquer Haut +100 & Bas +300 à tous les châssis"
                        >
                          ⬆️⬇️ H+100 / B+300
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            lignesModifiables.forEach(l => handleChangerModeDebordementLigne(l.id, 'SANS_DEBORDEMENT'));
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer border border-slate-600 transition active:scale-95"
                          title="Appliquer Cadre Fermé 0/0 à tous les châssis"
                        >
                          ⏹️ Fermé (0/0)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            lignesModifiables.forEach(l => handleChangerModeDebordementLigne(l.id, 'INFERIEUR_SEUL'));
                          }}
                          className="px-1.5 py-0.5 rounded bg-sky-950 hover:bg-sky-800 text-sky-300 text-[10px] font-bold cursor-pointer border border-sky-500/40 transition active:scale-95"
                          title="Appliquer Bas +300 seul à tous les châssis"
                        >
                          ⬇️ Bas +300
                        </button>
                      </div>
                    </div>
                  </div>
                ) : isCaisson ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 1. Type de Caisson Principal */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Type Caisson Détecté</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-emerald-300 text-xs bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                          {resultat.typeCaissonPrincipalDetecte === 'FIBRAGLO'
                            ? 'FIBRAGLO'
                            : `Caisson ${resultat.typeCaissonPrincipalDetecte || '30'}`}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {resultat.typeCaissonPrincipalDetecte === 'FIBRAGLO'
                            ? 'Isolé'
                            : `${resultat.typeCaissonPrincipalDetecte || '30'}x${resultat.typeCaissonPrincipalDetecte || '30'}`}
                        </span>
                      </div>
                      {articleCaissonTrouve && (
                        <div className="text-[11px] font-bold text-slate-200 mt-1 truncate" title={articleCaissonTrouve.designation}>
                          📦 <span className="text-emerald-300">{articleCaissonTrouve.designation}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Sous-Face Détectée */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Palette className="w-3.5 h-3.5 text-sky-400" />
                        <span>Sous-Face Détectée</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sky-300 text-xs bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-md">
                          {resultat.avecSousFaceDetectee ? `Avec SF (${resultat.colorisSousFaceDetecte || 'BRUT'})` : 'Sans SF'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Profilé alu sous linteau
                      </div>
                    </div>

                    {/* 3. Types Multiples Présents */}
                    <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Gammes dans le document</span>
                      </span>
                      <div className="text-[11px] text-emerald-300 font-semibold flex flex-wrap gap-1 mt-1">
                        {(resultat.typesCaissonsDetectes && resultat.typesCaissonsDetectes.length > 0)
                          ? resultat.typesCaissonsDetectes.map(t => (
                              <span key={t} className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                                {t === 'FIBRAGLO' ? 'FIBRAGLO' : `CT ${t}`}
                              </span>
                            ))
                          : (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                              CT {resultat.typeCaissonPrincipalDetecte || '30'}
                            </span>
                          )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Détection selon hauteur & libellé
                      </div>
                    </div>

                    {/* 4. Contrôle Intégrité */}
                    <div className="space-y-1 bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-2.5 flex flex-col justify-center">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Contrôle Intégrité 100%</span>
                      </div>
                      <div className="text-xs font-mono text-emerald-200 mt-0.5">
                        <strong>{totalSelectionnePieces}</strong> caissons / <strong>{lignesModifiables.length}</strong> lignes
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Prêt pour optimisation de coupe 1D
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 1. Profilé & Hauteur */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-sky-400" />
                        <span>Lame & Profilé Détectés</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sky-300 text-xs bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-md">
                          Lame {resultat.hauteurLameDetectee || 55} mm
                        </span>
                        {familleActive === 'TABLIER' && (
                          <span className="text-[10px] text-slate-400">
                            {resultat.hauteurLameDetectee === 43 ? 'Type 43mm' : 'Type 55mm'}
                          </span>
                        )}
                      </div>
                      {articleTablierTrouve && (
                        <div className="text-[11px] font-bold text-slate-200 mt-1 truncate" title={articleTablierTrouve.designation}>
                          📦 <span className="text-amber-300">{articleTablierTrouve.designation}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Coloris Détecté */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                        <Palette className="w-3.5 h-3.5 text-amber-400" />
                        <span>Coloris Détecté</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md">
                          {resultat.couleurDetectee || resultat.couleurNormalisee || 'Standard'}
                        </span>
                        {resultat.couleurNormalisee && (
                          <span className="text-[10px] text-slate-400">
                            ({resultat.couleurNormalisee})
                          </span>
                        )}
                      </div>
                      {articleTablierTrouve && (
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer pt-0.5">
                          <input
                            type="checkbox"
                            checked={appliquerProfilCouleur}
                            onChange={e => setAppliquerProfilCouleur(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                          />
                          <span className="text-sky-300 font-semibold">Appliquer en stock</span>
                        </label>
                      )}
                    </div>

                    {/* 3. Lame Finale (Avec ou Sans Lame Finale) - Détectée ou Sélectionnable */}
                    <div className="space-y-1.5 bg-slate-900/40 p-2 rounded-lg border border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <CheckCircle2 className={`w-3.5 h-3.5 ${optionAvecLF ? 'text-emerald-400' : 'text-slate-500'}`} />
                          <span>Lame Finale</span>
                        </span>
                        {resultat.avecLameFinaleDetectee !== undefined ? (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                            resultat.avecLameFinaleDetectee
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}>
                            {resultat.avecLameFinaleDetectee ? 'PDF : Avec LF' : 'PDF : Sans LF'}
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                            Non spécifié
                          </span>
                        )}
                      </div>

                      <div className="pt-0.5">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={optionAvecLF}
                            onChange={e => setOptionAvecLF(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className={`text-xs font-black transition ${
                            optionAvecLF ? 'text-emerald-300' : 'text-slate-400'
                          }`}>
                            {optionAvecLF ? '✓ Avec Lame Finale' : '✕ Sans Lame Finale'}
                          </span>
                        </label>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-tight">
                        {optionAvecLF
                          ? 'Lame finale extrudée intégrée à la fabrication.'
                          : 'Débit sans profilé de lame finale.'}
                      </p>
                    </div>

                    {/* 4. Bilan du Contrôle */}
                    <div className="space-y-1 bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-2.5 flex flex-col justify-center">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Contrôle Intégrité 100%</span>
                      </div>
                      <div className="text-xs font-mono text-emerald-200 mt-0.5">
                        <strong>{totalSelectionnePieces}</strong> pièces / <strong>{lignesModifiables.length}</strong> lignes
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Import direct dans la table de débit
                      </div>
                    </div>
                  </div>
                )}

              </div>
              )}
            </div>

              {/* Barre d'outils du tableau */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {lignesSelectionnees.size === lignesModifiables.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </span>
                  </button>
                  <span className="text-xs text-slate-400">
                    Fichier : <strong className="text-slate-300">{nomFichier}</strong>
                  </span>
                </div>

                {/* Choix Mode d'insertion */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-medium">Mode :</span>
                  <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-950">
                    <button
                      type="button"
                      onClick={() => setModeAjout('REMPLACER')}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        modeAjout === 'REMPLACER'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Remplacer la commande
                    </button>
                    <button
                      type="button"
                      onClick={() => setModeAjout('AJOUTER')}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        modeAjout === 'AJOUTER'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Ajouter à la suite
                    </button>
                  </div>
                </div>
              </div>

              {/* Barre d'actions groupées pour Précadres (gain de temps considérable) */}
              {isPrecadre && lignesSelectionnees.size > 0 && (
                <div className="bg-purple-950/30 border border-purple-500/30 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs animate-fadeIn">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black text-purple-300 uppercase tracking-wide">
                      ⚡ Appliquer aux {lignesSelectionnees.size} sélectionné(s) :
                    </span>
                    <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-medium">Profilé :</span>
                      <button
                        type="button"
                        onClick={() => handleAppliquerTypePrecadreSelection('TYPE_50')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-300 font-black text-[10px] cursor-pointer transition"
                      >
                        CT 50
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerTypePrecadreSelection('TYPE_36')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-sky-300 font-black text-[10px] cursor-pointer transition"
                      >
                        CT 36
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-medium">Renfort :</span>
                      <button
                        type="button"
                        onClick={() => handleAppliquerFigureSelection('VIDE')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer transition"
                        title="Cadre fermé sans renfort (Fenêtre)"
                      >
                        🔲 Vide
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerFigureSelection('RENFORT_H1')}
                        className="px-2 py-0.5 rounded bg-purple-900/50 hover:bg-purple-600 hover:text-white text-purple-300 text-[10px] font-black cursor-pointer transition"
                        title="Renfort vertical montant central (Baie)"
                      >
                        ↕️ Renfort V (H1)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerFigureSelection('RENFORT_L1')}
                        className="px-2 py-0.5 rounded bg-amber-900/50 hover:bg-amber-600 hover:text-white text-amber-300 text-[10px] font-black cursor-pointer transition"
                        title="Traverse horizontale (Porte-fenêtre)"
                      >
                        ↔️ Traverse H (L1)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerFigureSelection('RENFORT_CROISE')}
                        className="px-2 py-0.5 rounded bg-emerald-900/50 hover:bg-emerald-600 hover:text-white text-emerald-300 text-[10px] font-black cursor-pointer transition"
                        title="Croisé : 2 Demi-renforts horizontaux + 1 montant vertical"
                      >
                        ✝️ Croisé R+H
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-medium">Débordement :</span>
                      <button
                        type="button"
                        onClick={() => handleAppliquerModeDebordementSelection('SANS_DEBORDEMENT', 0, 0)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer transition"
                        title="Cadre fermé (0mm / 0mm - Fenêtre)"
                      >
                        ⏹️ Fermé (0/0)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerModeDebordementSelection('SUPERIEUR_SEUL', 100, 0)}
                        className="px-2 py-0.5 rounded bg-amber-900/50 hover:bg-amber-600 hover:text-white text-amber-300 text-[10px] font-black cursor-pointer transition"
                        title="Haut +100mm seul (Volet roulant, seuil maçonné)"
                      >
                        ⬆️ Haut seul (+100)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerModeDebordementSelection('INFERIEUR_SEUL', 0, 300)}
                        className="px-2 py-0.5 rounded bg-sky-900/50 hover:bg-sky-600 hover:text-white text-sky-300 text-[10px] font-bold cursor-pointer transition"
                        title="Bas +300mm seul (Appui sol / chape)"
                      >
                        ⬇️ Bas seul (+300)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerModeDebordementSelection('SUPERIEUR_INFERIEUR', 100, 300)}
                        className="px-2 py-0.5 rounded bg-emerald-900/50 hover:bg-emerald-600 hover:text-white text-emerald-300 text-[10px] font-black cursor-pointer transition"
                        title="Haut +100mm & Bas +300mm (Baie standard)"
                      >
                        ⬆️⬇️ Haut et bas (+100/+300)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Barre d'actions groupées pour Caissons Tunnel (Sélection multiple 25, 30, 35, 40, FIBRAGLO, SF) */}
              {isCaisson && lignesSelectionnees.size > 0 && (
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs animate-fadeIn">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wide">
                      ⚡ Appliquer aux {lignesSelectionnees.size} sélectionné(s) :
                    </span>
                    <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-medium">Type :</span>
                      <button
                        type="button"
                        onClick={() => handleAppliquerTypeCaissonSelection('30')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 font-black text-[10px] cursor-pointer transition"
                      >
                        CT 30 (30x30)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerTypeCaissonSelection('25')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 font-black text-[10px] cursor-pointer transition"
                      >
                        CT 25 (25x25)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerTypeCaissonSelection('35')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 font-black text-[10px] cursor-pointer transition"
                      >
                        CT 35 (35x35)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerTypeCaissonSelection('40')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 font-black text-[10px] cursor-pointer transition"
                      >
                        CT 40 (40x40)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerTypeCaissonSelection('FIBRAGLO')}
                        className="px-2 py-0.5 rounded bg-amber-900/50 hover:bg-amber-500 hover:text-slate-950 text-amber-300 font-black text-[10px] cursor-pointer transition"
                      >
                        FIBRAGLO
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-medium">Sous-Face :</span>
                      <button
                        type="button"
                        onClick={() => handleAppliquerSousFaceSelection(true)}
                        className="px-2 py-0.5 rounded bg-sky-900/50 hover:bg-sky-600 hover:text-white text-sky-300 text-[10px] font-bold cursor-pointer transition"
                      >
                        ✓ Avec SF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerSousFaceSelection(false)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer transition"
                      >
                        ✕ Sans SF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerSousFaceSelection(true, 'GRIS 7024')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold cursor-pointer transition"
                      >
                        🎨 SF 7024
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppliquerSousFaceSelection(true, 'BL (Blanc)')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-[10px] font-bold cursor-pointer transition"
                      >
                        🎨 SF Blanc
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tableau des lignes extraites avec vérification 100% */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-inner flex flex-col">
                <div className="min-h-[300px] max-h-[56vh] 2xl:max-h-[62vh] overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[1240px] text-xs text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-md text-slate-300 text-[11px] font-bold uppercase tracking-wider border-b border-slate-800 z-10 shadow-sm">
                      <tr>
                        <th className="py-3 px-3 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={lignesSelectionnees.size === lignesModifiables.length && lignesModifiables.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-3 w-12 text-center">N°</th>
                        <th className="py-3 px-3 w-32 min-w-[110px]">Repère</th>
                        <th className="py-3 px-3 w-20 min-w-[75px] text-center">Qté</th>
                        <th className="py-3 px-3 w-32 min-w-[115px] text-center">{isCaisson ? 'Longueur L (mm)' : 'Largeur (mm)'}</th>
                        <th className="py-3 px-3 w-32 min-w-[115px] text-center">Hauteur (mm)</th>
                        {isPrecadre ? (
                          <>
                            <th className="py-3 px-3 w-44 min-w-[150px]">Profilé</th>
                            <th className="py-3 px-3 w-64 min-w-[230px]">Renfort / Figure</th>
                            <th className="py-3 px-3 w-80 min-w-[320px]">Débordements (Montants)</th>
                          </>
                        ) : isCaisson ? (
                          <>
                            <th className="py-3 px-3 w-56 min-w-[190px]">Type de Caisson</th>
                            <th className="py-3 px-3 w-60 min-w-[210px]">Sous-Face Associée</th>
                            <th className="py-3 px-3 min-w-[240px]">Désignation / Détails</th>
                          </>
                        ) : (
                          <>
                            <th className="py-3 px-3 min-w-[240px]">Désignation / Détails</th>
                            <th className="py-3 px-3 w-28 min-w-[110px] text-center">Coloris</th>
                            <th className="py-3 px-3 w-28 min-w-[110px] text-center">Lame Finale</th>
                          </>
                        )}
                        <th className="py-3 px-3 w-14 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {lignesModifiables.map((ligne, idx) => {
                        const isChecked = lignesSelectionnees.has(ligne.id);
                        return (
                          <tr
                            key={ligne.id}
                            className={`transition ${
                              isChecked ? 'bg-slate-900/40 hover:bg-slate-900/70' : 'opacity-40 hover:opacity-70 bg-slate-950'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectLigne(ligne.id)}
                                className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-400 font-sans text-xs font-bold">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={ligne.repere}
                                onChange={e => handleModifierChamp(ligne.id, 'repere', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs font-black text-amber-300 focus:ring-1 focus:ring-amber-500 text-center tracking-wide"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min="1"
                                value={ligne.quantite}
                                onChange={e => handleModifierChamp(ligne.id, 'quantite', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                className="w-full text-center bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-amber-500 rounded-lg px-1 py-1.5 text-xs font-black text-slate-100 focus:ring-1 focus:ring-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                value={ligne.largeur}
                                onChange={e => handleModifierChamp(ligne.id, 'largeur', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-full text-center bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-emerald-500 rounded-lg px-2 py-1.5 text-xs font-mono font-black text-emerald-300 focus:ring-1 focus:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                value={ligne.hauteur}
                                onChange={e => handleModifierChamp(ligne.id, 'hauteur', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-full text-center bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-sky-500 rounded-lg px-2 py-1.5 text-xs font-mono font-black text-sky-300 focus:ring-1 focus:ring-sky-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>

                            {isPrecadre ? (
                              <>
                                {/* Choix profilé précadre */}
                                <td className="py-2.5 px-3">
                                  <select
                                    value={ligne.typePrecadre || 'TYPE_50'}
                                    onChange={e => {
                                      const val = e.target.value as 'TYPE_50' | 'TYPE_36';
                                      handleModifierChamp(ligne.id, 'typePrecadre', val);
                                      handleModifierChamp(ligne.id, 'typePrecadreLabel', val === 'TYPE_36' ? 'CT 36' : 'CT 50');
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs font-black text-amber-300 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                                  >
                                    <option value="TYPE_50">CT 50 (50 mm)</option>
                                    <option value="TYPE_36">CT 36 (36 mm)</option>
                                  </select>
                                </td>

                                {/* Choix figure renfort */}
                                <td className="py-2.5 px-3">
                                  <select
                                    value={ligne.figurePrecadre || 'VIDE'}
                                    onChange={e => handleModifierChamp(ligne.id, 'figurePrecadre', e.target.value as FigurePrecadre)}
                                    className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs font-bold text-purple-300 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                                  >
                                    <option value="VIDE">🔲 Vide (aucun renfort)</option>
                                    <option value="RENFORT_H1">↕️ Renfort V / H1 (Montant)</option>
                                    <option value="RENFORT_L1">↔️ Traverse H / L1</option>
                                    <option value="RENFORT_CROISE">✝️ Croisé (R1/R2 + H1)</option>
                                  </select>
                                </td>

                                {/* Choix débordements montants */}
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={ligne.modeDebordementPrecadre || 'SUPERIEUR_INFERIEUR'}
                                      onChange={e => handleChangerModeDebordementLigne(ligne.id, e.target.value as ModeDebordementPrecadre)}
                                      className={`flex-1 border rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition focus:ring-1 focus:ring-emerald-500 ${
                                        ligne.modeDebordementPrecadre === 'SUPERIEUR_INFERIEUR'
                                          ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 font-black'
                                          : ligne.modeDebordementPrecadre === 'INFERIEUR_SEUL'
                                          ? 'bg-sky-950/80 border-sky-500/60 text-sky-300 font-black'
                                          : ligne.modeDebordementPrecadre === 'SUPERIEUR_SEUL'
                                          ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 font-black'
                                          : 'bg-slate-900 border-slate-700 text-slate-300 font-bold'
                                      }`}
                                    >
                                      <option value="SANS_DEBORDEMENT">⏹️ Fermé (0 / 0)</option>
                                      <option value="SUPERIEUR_SEUL">⬆️ Haut seul (+100 / 0)</option>
                                      <option value="INFERIEUR_SEUL">⬇️ Bas seul (0 / +300)</option>
                                      <option value="SUPERIEUR_INFERIEUR">⬆️⬇️ Haut et bas (+100 / +300)</option>
                                    </select>

                                    {/* Bouton d'inspection visuelle immédiate */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInspecteurLigne(ligne);
                                        setIsInspecteurOpen(true);
                                      }}
                                      className="p-1.5 w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 border border-slate-700 transition cursor-pointer flex-shrink-0 flex items-center justify-center shadow-sm"
                                      title="Ouvrir l'inspecteur visuel (détection géométrique sur croquis/photo)"
                                    >
                                      {ligne.chassisImageCropDataUrl ? (
                                        <img
                                          src={ligne.chassisImageAnnotatedDataUrl || ligne.chassisImageCropDataUrl}
                                          alt="Châssis"
                                          className="w-6 h-6 object-contain bg-white rounded-sm border border-slate-600 shadow-sm"
                                        />
                                      ) : (
                                        <Camera className="w-4 h-4 text-amber-400" />
                                      )}
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-sans">
                                    {ligne.sourceDetectionDebordement === 'PHOTO' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold" title={ligne.detailsDebordement}>
                                        <span>📷 Croquis :</span>
                                        <span>
                                          {ligne.modeDebordementPrecadre === 'SANS_DEBORDEMENT'
                                            ? 'Fermé (0/0)'
                                            : ligne.modeDebordementPrecadre === 'SUPERIEUR_SEUL'
                                            ? 'Haut (+100)'
                                            : ligne.modeDebordementPrecadre === 'INFERIEUR_SEUL'
                                            ? 'Bas (+300)'
                                            : 'Haut & Bas'}
                                        </span>
                                      </span>
                                    )}
                                    {ligne.sourceDetectionDebordement === 'TEXTE' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold" title={ligne.detailsDebordement}>
                                        📝 Texte : {ligne.detailsDebordement}
                                      </span>
                                    )}
                                    {ligne.sourceDetectionDebordement === 'NOMENCLATURE' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-slate-400" title={ligne.detailsDebordement}>
                                        📐 Règle atelier
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </>
                            ) : isCaisson ? (
                              <>
                                {/* Choix type caisson */}
                                <td className="py-2.5 px-3">
                                  <select
                                    value={ligne.typeCaissonDetecte || '30'}
                                    onChange={e => {
                                      const val = e.target.value as '25' | '30' | '35' | '40' | 'FIBRAGLO';
                                      const labelMap: Record<string, string> = {
                                        '25': 'Caisson 25 (25X25)',
                                        '30': 'Caisson 30 (30X30)',
                                        '35': 'Caisson 35 (35X35)',
                                        '40': 'Caisson 40 (40X40)',
                                        'FIBRAGLO': 'Caisson FIBRAGLO'
                                      };
                                      const art = PdfCommandeParserService.trouverArticleCaissonPourPdf(val, articles);
                                      handleModifierChamp(ligne.id, 'typeCaissonDetecte', val);
                                      handleModifierChamp(ligne.id, 'typeCaissonLabel', labelMap[val] || `Caisson ${val}`);
                                      if (art) {
                                        handleModifierChamp(ligne.id, 'articleCaissonCode', art.code_art);
                                        handleModifierChamp(ligne.id, 'articleCaissonDesignation', art.designation);
                                      }
                                    }}
                                    className="w-full bg-slate-900 border border-emerald-500/40 hover:border-emerald-500 focus:border-emerald-400 rounded-lg px-2.5 py-1.5 text-xs font-black text-emerald-300 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                                  >
                                    <option value="30">📦 Caisson 30 (30X30)</option>
                                    <option value="25">📦 Caisson 25 (25X25)</option>
                                    <option value="35">📦 Caisson 35 (35X35)</option>
                                    <option value="40">📦 Caisson 40 (40X40)</option>
                                    <option value="FIBRAGLO">🧱 FIBRAGLO (Isolé)</option>
                                  </select>
                                </td>

                                {/* Sous-Face associée */}
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleModifierChamp(ligne.id, 'avecSousFaceDetectee', !ligne.avecSousFaceDetectee)}
                                      className={`px-2 py-1 rounded-md text-[11px] font-black cursor-pointer transition border ${
                                        ligne.avecSousFaceDetectee
                                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                          : 'bg-slate-800 text-slate-500 border-slate-700'
                                      }`}
                                    >
                                      {ligne.avecSousFaceDetectee ? '✓ Avec SF' : '✕ Sans SF'}
                                    </button>
                                    {ligne.avecSousFaceDetectee && (
                                      <select
                                        value={ligne.colorisSousFace || 'BRUT'}
                                        onChange={e => handleModifierChamp(ligne.id, 'colorisSousFace', e.target.value)}
                                        className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] font-bold text-slate-200 cursor-pointer"
                                      >
                                        <option value="BRUT">SF Brut</option>
                                        <option value="BL (Blanc)">SF Blanc</option>
                                        <option value="GRIS 7024">SF Gris 7024</option>
                                      </select>
                                    )}
                                  </div>
                                </td>

                                {/* Désignation Détectée */}
                                <td className="py-2.5 px-3 text-slate-300 font-sans text-xs truncate max-w-[280px]" title={ligne.designation}>
                                  <div className="font-semibold text-slate-200 truncate">{ligne.designation || 'Caisson Tunnel'}</div>
                                  {ligne.articleCaissonDesignation && (
                                    <div className="text-[10px] text-emerald-400 font-mono font-bold truncate">
                                      → Stock : {ligne.articleCaissonDesignation}
                                    </div>
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-2.5 px-3 text-slate-200 font-sans text-xs truncate max-w-[280px]" title={ligne.designation}>
                                  {ligne.designation || '—'}
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-300 text-xs font-semibold">
                                  {ligne.coloris || '—'}
                                </td>
                                <td className="py-2.5 px-2 text-center font-sans">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                                    optionAvecLF
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}>
                                    {optionAvecLF ? 'Avec LF' : 'Sans LF'}
                                  </span>
                                </td>
                              </>
                            )}

                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleSupprimerLigne(ligne.id)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer inline-flex items-center justify-center"
                                title="Supprimer cette ligne"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bouton pour changer de fichier */}
              <div className="flex justify-between items-center text-xs text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={resetAllState}
                  className="text-slate-400 hover:text-slate-200 underline cursor-pointer font-medium"
                >
                  Choisir un autre fichier PDF
                </button>
                <span>
                  <strong>{lignesSelectionnees.size}</strong> ligne(s) sélectionnée(s) sur {lignesModifiables.length}
                </span>
              </div>

            </div>
          )
        )}

        </div>

        {/* Pied de page Modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            Annuler
          </button>

          {resultat && (
            estImportRefuse ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span>Importation bloquée : commande non {familleActive === 'PRECADRE' ? 'Précadre' : 'Tablier'}</span>
                </span>
                <button
                  type="button"
                  disabled
                  className="px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 bg-red-950/60 text-red-400 border border-red-800/60 cursor-not-allowed opacity-75 shadow-inner"
                >
                  <span>⛔ Import Refusé</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConfirmer}
                disabled={lignesSelectionnees.size === 0}
                className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition cursor-pointer ${
                  lignesSelectionnees.size > 0
                    ? isPrecadre
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 active:scale-95'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20 active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <span>
                  📥 {isPrecadre
                    ? `Charger ${lignesSelectionnees.size} châssis Précadre (${totalSelectionnePieces} pièces)`
                    : `Charger ${lignesSelectionnees.size} lignes Tablier (${totalSelectionnePieces} pièces)`} dans la commande
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )
          )}
        </div>

      </div>

      {/* Modal d'inspection visuelle et recalibrage géométrique */}
      {isInspecteurOpen && inspecteurLigne && (
        <InspecteurVisionChassisModal
          isOpen={isInspecteurOpen}
          onClose={() => {
            setIsInspecteurOpen(false);
            setInspecteurLigne(null);
          }}
          imageInitialeDataUrl={inspecteurLigne.chassisImageCropDataUrl || inspecteurLigne.chassisImageAnnotatedDataUrl}
          titreLigne={`${inspecteurLigne.repere} (${inspecteurLigne.largeur} x ${inspecteurLigne.hauteur} mm)`}
          onAppliquerResultat={handleAppliquerDepuisInspecteur}
        />
      )}
    </div>
  );
};
