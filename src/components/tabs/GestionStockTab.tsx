import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Article,
  ChuteItem,
  ChuteMaille,
  MappingChutes,
  SuiviOF,
  DossierCommandeGlobal,
  MouvementStock
} from '../../types';
import { INITIAL_MAPPING } from '../../data/initialData';
import { StorageService } from '../../services/storage';
import { ImportArticlesModal } from '../stock/ImportArticlesModal';
import { ImportChutesModal } from '../stock/ImportChutesModal';
import { OperationsStockModal, OperationStockType } from '../stock/OperationsStockModal';
import { ModifierMouvementModal } from '../stock/ModifierMouvementModal';
import { InventaireStockView } from '../stock/InventaireStockView';
import { ColumnCustomizerPopover } from '../common/ColumnCustomizerPopover';
import { ConfirmationModal, ConfirmationType } from '../common/ConfirmationModal';
import { columnConfigService } from '../../services/columnConfigService';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit2,
  Edit3,
  Save,
  Link,
  Search,
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  Layers,
  Sparkles,
  RefreshCw,
  ClipboardCheck,
  History,
  Send,
  Clock,
  CheckCircle,
  Unlink,
  Check,
  X,
  FolderPlus,
  Settings,
  ArrowRight,
  ChevronRight,
  PackagePlus,
  PackageMinus,
  Wand2,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Power,
  PowerOff,
  Eye,
  CornerDownRight
} from 'lucide-react';

interface GestionStockTabProps {
  articles: Article[];
  chutesBarres: Record<string, ChuteItem[]>;
  chutesMaille: ChuteMaille[];
  mapping: MappingChutes;
  suivisOF?: SuiviOF[];
  dossiers?: DossierCommandeGlobal[];
  mouvements?: MouvementStock[];
  onStockUpdated: () => void;
}

/**
 * Générateur de code article automatique et auto-incrémental.
 * Cherche le nombre le plus élevé parmi les codes de format ARTxxxx ou similaires,
 * et génère le numéro suivant (ex: ART0071).
 */
export function genererProchainCodeArticle(articlesList: Article[]): string {
  let maxNum = 0;
  articlesList.forEach(a => {
    const match = a.code_art.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });

  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(4, '0');
  let candidate = `ART${padded}`;

  let safety = 0;
  while (articlesList.some(a => a.code_art.toUpperCase() === candidate.toUpperCase())) {
    safety++;
    candidate = `ART${String(nextNum + safety).padStart(4, '0')}`;
  }

  return candidate;
}

export const GestionStockTab: React.FC<GestionStockTabProps> = ({
  articles = [],
  chutesBarres = {},
  chutesMaille = [],
  mapping = {},
  suivisOF = [],
  dossiers = [],
  mouvements = [],
  onStockUpdated
}) => {
  const safeArticles = Array.isArray(articles) ? articles : [];

  // Référence formulaire pour auto-scroll et navigation
  const formArticleRef = useRef<HTMLDivElement>(null);
  const [lastSelectedArticleCode, setLastSelectedArticleCode] = useState<string | null>(null);
  const [highlightedRowCode, setHighlightedRowCode] = useState<string | null>(null);
  const [articleStatusFilter, setArticleStatusFilter] = useState<'ACTIFS' | 'DESACTIVES' | 'TOUS'>('ACTIFS');
  const [feedbackAction, setFeedbackAction] = useState<string | null>(null);

  // État générique du Modal de Confirmation
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    type?: ConfirmationType;
    confirmLabel?: string;
    cancelLabel?: string;
    details?: string[];
    isProcessing?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const safeChutesBarres = useMemo(() => {
    if (!chutesBarres || typeof chutesBarres !== 'object') return {};
    const res: Record<string, ChuteItem[]> = {};
    for (const [sheet, list] of Object.entries(chutesBarres)) {
      res[sheet] = (list || []).map((c, idx) => ({
        ...c,
        id: c.id || `c-${sheet.replace(/[^a-zA-Z0-9]/g, '_')}-${idx}-${c.longueur}`
      }));
    }
    return res;
  }, [chutesBarres]);

  const safeChutesMaille = useMemo(() => {
    if (!Array.isArray(chutesMaille)) return [];
    return chutesMaille.map((m, idx) => ({
      ...m,
      id: m.id || `m-${idx}-${m.dimension_fixe}`
    }));
  }, [chutesMaille]);

  const [subTab, setSubTab] = useState<'articles' | 'chutes' | 'inventaire' | 'mapping' | 'historique'>('articles');
  const [, setColumnsTick] = useState(0);

  useEffect(() => {
    const unsub = columnConfigService.subscribe(() => {
      setColumnsTick(t => t + 1);
    });
    return unsub;
  }, []);

  // --- MODALS IMPORT INTEL ---
  const [isImportArticlesModalOpen, setIsImportArticlesModalOpen] = useState<boolean>(false);
  const [isImportChutesModalOpen, setIsImportChutesModalOpen] = useState<boolean>(false);

  // --- MODAL OPÉRATIONS DE STOCK (RÉCEPTION, SORTIE, INVENTAIRE) ---
  const [isOperationsModalOpen, setIsOperationsModalOpen] = useState<boolean>(false);
  const [operationModalType, setOperationModalType] = useState<OperationStockType>('RECEPTION');
  const [operationModalArticle, setOperationModalArticle] = useState<Article | null>(null);

  const ouvrirOperationStock = (type: OperationStockType, art?: Article | null) => {
    setOperationModalType(type);
    setOperationModalArticle(art || null);
    setIsOperationsModalOpen(true);
  };

  // --- SUBTAB HISTORIQUE ---
  const [filtreTypeMvt, setFiltreTypeMvt] = useState<string>('TOUS');

  // --- SUBTAB ARTICLES STATE ---
  const [searchArticle, setSearchArticle] = useState<string>('');
  const [selectedArticleCode, setSelectedArticleCode] = useState<string | null>(null);
  const [isEditingArticle, setIsEditingArticle] = useState<boolean>(false);

  // Formulaire Article (champs vierges et propres)
  const [artForm, setArtForm] = useState<Partial<Article>>(() => ({
    code_art: genererProchainCodeArticle(safeArticles),
    designation: '',
    statut: 'NORMAL',
    hauteur: undefined,
    longeur: undefined,
    lame: undefined,
    debordement: undefined,
    refus_min: undefined,
    refus_max: undefined,
    stock_physique: undefined,
    quantite_reservee: 0,
    prix_unitaire: undefined,
    stock_min: undefined
  }));

  // Synchroniser le code auto quand la liste d'articles change et qu'on n'est pas en mode édition
  useEffect(() => {
    if (!isEditingArticle && !selectedArticleCode) {
      setArtForm(prev => {
        if (!prev.code_art || prev.code_art.startsWith('ART')) {
          return { ...prev, code_art: genererProchainCodeArticle(safeArticles) };
        }
        return prev;
      });
    }
  }, [safeArticles.length, isEditingArticle, selectedArticleCode]);

  // MAILLE MSTQ n'apparaît que s'il y a vraiment des chutes de maille
  const allSheets = useMemo(() => [
    ...(safeChutesMaille.length > 0 ? ['MAILLE MSTQ'] : []),
    ...Object.keys(safeChutesBarres).filter(s => s !== 'MAILLE MSTQ')
  ], [safeChutesMaille.length, safeChutesBarres]);

  const [selectedSheet, setSelectedSheet] = useState<string>(allSheets[0] || '');
  const [newSheetInput, setNewSheetInput] = useState<string>('');
  const [isRenamingSheet, setIsRenamingSheet] = useState<boolean>(false);
  const [renameSheetInput, setRenameSheetInput] = useState<string>('');

  // Gestion avancée des familles de chutes (Modal et Édition)
  const [isManageFamiliesModalOpen, setIsManageFamiliesModalOpen] = useState<boolean>(false);
  const [newFamilyModalInput, setNewFamilyModalInput] = useState<string>('');
  const [selectedArticleForNewFamily, setSelectedArticleForNewFamily] = useState<string>('');
  const [editingFamilyName, setEditingFamilyName] = useState<string | null>(null);
  const [editingFamilyInput, setEditingFamilyInput] = useState<string>('');

  // Auto-synchronisation dès que allSheets change (ex: après un import Excel)
  useEffect(() => {
    if (allSheets.length > 0) {
      if (!selectedSheet || !allSheets.includes(selectedSheet)) {
        setSelectedSheet(allSheets[0]);
      }
    } else {
      setSelectedSheet('');
    }
  }, [allSheets, selectedSheet]);

  // Formulaire Chute (Ajout)
  const [saisieChuteLongueur, setSaisieChuteLongueur] = useState<string>('');
  const [saisieChuteQte, setSaisieChuteQte] = useState<string>('1');

  // Chute en cours d'édition
  const [editingChuteId, setEditingChuteId] = useState<string | number | null>(null);
  const [editChuteLongueur, setEditChuteLongueur] = useState<string>('');
  const [editChuteQte, setEditChuteQte] = useState<string>('');

  // --- SUBTAB MAPPING STATE ---
  const [searchMapping, setSearchMapping] = useState<string>('');
  const [filterOnlyUnmapped, setFilterOnlyUnmapped] = useState<boolean>(false);
  const [selectedArtForMapping, setSelectedArtForMapping] = useState<string>(safeArticles[0]?.code_art || '');
  const [selectedSheetForMapping, setSelectedSheetForMapping] = useState<string>(allSheets[0] || '');

  const mappingBySheet = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [artCode, sheetName] of Object.entries(mapping) as [string, string][]) {
      if (sheetName) map[sheetName] = artCode;
    }
    return map;
  }, [mapping]);

  // Liste des familles disponibles pour l'article sélectionné (non liées à un autre article)
  const availableSheetsForSelectedArt = useMemo(() => {
    return allSheets.filter(sheet => !mappingBySheet[sheet] || mappingBySheet[sheet] === selectedArtForMapping);
  }, [allSheets, mappingBySheet, selectedArtForMapping]);

  useEffect(() => {
    if (availableSheetsForSelectedArt.length > 0) {
      if (!selectedSheetForMapping || !availableSheetsForSelectedArt.includes(selectedSheetForMapping)) {
        const currentMapped = mapping[selectedArtForMapping];
        if (currentMapped && availableSheetsForSelectedArt.includes(currentMapped)) {
          setSelectedSheetForMapping(currentMapped);
        } else {
          setSelectedSheetForMapping(availableSheetsForSelectedArt[0]);
        }
      }
    } else {
      setSelectedSheetForMapping('');
    }
  }, [availableSheetsForSelectedArt, selectedArtForMapping, mapping]);

  // --- AUTO-SCROLL ET NAVIGATION DE SÉLECTION ---
  const handleSelectArticleRow = (art: Article) => {
    setSelectedArticleCode(art.code_art);
    setLastSelectedArticleCode(art.code_art);
    setArtForm({ ...art });
    setIsEditingArticle(true);

    // Auto-scroll instantané et fluide vers le formulaire en haut
    setTimeout(() => {
      formArticleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const handleScrollBackToSelectedRow = () => {
    if (!lastSelectedArticleCode) return;
    const targetId = `article-row-${lastSelectedArticleCode}`;
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedRowCode(lastSelectedArticleCode);
      setTimeout(() => {
        setHighlightedRowCode(null);
      }, 3500);
    }
  };

  const handleAnnulerEtRevenir = () => {
    const code = lastSelectedArticleCode;
    handleViderFormArticle();
    if (code) {
      setTimeout(() => {
        const el = document.getElementById(`article-row-${code}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedRowCode(code);
          setTimeout(() => setHighlightedRowCode(null), 3500);
        }
      }, 100);
    }
  };

  const handleViderFormArticle = () => {
    setSelectedArticleCode(null);
    setIsEditingArticle(false);
    setArtForm({
      code_art: genererProchainCodeArticle(safeArticles),
      designation: '',
      statut: 'NORMAL',
      hauteur: undefined,
      longeur: undefined,
      lame: undefined,
      debordement: undefined,
      refus_min: undefined,
      refus_max: undefined,
      stock_physique: undefined,
      quantite_reservee: 0,
      prix_unitaire: undefined,
      stock_min: undefined
    });
  };

  const handleRegenererCodeAuto = () => {
    setArtForm(prev => ({
      ...prev,
      code_art: genererProchainCodeArticle(safeArticles)
    }));
  };

  // Détecter si un article est déjà saisi dans des commandes déjà clôturées / archivées
  const isArticleInClosedOrders = (codeArt: string): { inClosed: boolean; refs: string[] } => {
    const codeUpper = (codeArt || '').trim().toUpperCase();
    if (!codeUpper) return { inClosed: false, refs: [] };

    const closedDossiers = (dossiers || []).filter(d =>
      d && (d.statut === 'CLOTURE' || d.statut === 'LIVRE' || d.statut === 'TERMINE')
    );
    const matchingRefs: string[] = [];

    closedDossiers.forEach(d => {
      const ref = d.refCommande || d.id;
      let found = false;

      // Tabliers
      if (d.articlesTabliers?.some(t =>
        t.articleCode?.toUpperCase() === codeUpper ||
        t.lfArticleCode?.toUpperCase() === codeUpper ||
        t.glArticleCode?.toUpperCase() === codeUpper
      )) {
        found = true;
      }

      // Moustiquaires
      if (d.articlesMoustiquaires?.some(m =>
        m.articleCodeMaille?.toUpperCase() === codeUpper ||
        m.articleCodeCadre?.toUpperCase() === codeUpper ||
        m.articleCodeCoulisse?.toUpperCase() === codeUpper ||
        m.articleCodeBarreInf?.toUpperCase() === codeUpper
      )) {
        found = true;
      }

      // Caissons
      if (d.articlesCaissons?.some(c =>
        c.articleCode?.toUpperCase() === codeUpper ||
        c.sfArticleCode?.toUpperCase() === codeUpper
      )) {
        found = true;
      }

      // Précadres
      if (d.articlesPrecadres?.some(p =>
        p.articleCode?.toUpperCase() === codeUpper ||
        p.bouchonArticleCode?.toUpperCase() === codeUpper
      )) {
        found = true;
      }

      if (found && !matchingRefs.includes(ref)) {
        matchingRefs.push(ref);
      }
    });

    // Vérifier également dans les Ordres de Fabrication déjà clôturés
    (suivisOF || []).forEach(o => {
      if (o.statut === 'CLOTURE') {
        const matchesArticle = (o.lignesRetour || []).some(l => l.articleCode?.toUpperCase() === codeUpper) ||
          (o.titreSection || '').toUpperCase().includes(codeUpper);
        if (matchesArticle) {
          const ref = o.numCommande || o.codeOF || o.id;
          if (!matchingRefs.includes(ref)) matchingRefs.push(ref);
        }
      }
    });

    return { inClosed: matchingRefs.length > 0, refs: matchingRefs };
  };

  // Désactivation sécurisée d'un article
  const handleDeactivateArticle = async (code: string) => {
    try {
      const updated = articles.map(a => {
        if (a.code_art === code) {
          return {
            ...a,
            actif: false,
            statut: 'DESACTIVE',
            dateDesactivation: new Date().toLocaleDateString('fr-FR')
          };
        }
        return a;
      });
      await StorageService.saveArticles(updated);
      onStockUpdated();
      handleViderFormArticle();
      setFeedbackAction(`L'article ${code} a été désactivé et classé dans « Articles désactivés ». Vous pouvez le réactiver à tout moment.`);
      setTimeout(() => setFeedbackAction(null), 5000);
    } catch (e: any) {
      alert('Erreur lors de la désactivation : ' + e.message);
    }
  };

  // Réactivation d'un article désactivé
  const handleReactivateArticle = async (code: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Confirmation de Réactivation',
      type: 'info',
      message: `Voulez-vous réactiver l'article "${code}" et le réintégrer dans le catalogue actif de l'atelier ?`,
      confirmLabel: 'Réactiver l\'article',
      cancelLabel: 'Annuler',
      onConfirm: async () => {
        setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        try {
          const updated = articles.map(a => {
            if (a.code_art === code) {
              return {
                ...a,
                actif: true,
                statut: 'NORMAL',
                dateDesactivation: undefined
              };
            }
            return a;
          });
          await StorageService.saveArticles(updated);
          onStockUpdated();
          setFeedbackAction(`L'article ${code} a été réactivé avec succès !`);
          setTimeout(() => setFeedbackAction(null), 4000);
        } catch (e: any) {
          alert('Erreur lors de la réactivation : ' + e.message);
        }
      }
    });
  };

  // Enregistrement d'un article avec Confirmation obligatoire
  const handleDemandeEnregistrerArticle = () => {
    if (!artForm.code_art || !artForm.designation) {
      alert('Code article et Désignation sont obligatoires.');
      return;
    }

    const isModif = isEditingArticle && selectedArticleCode;
    const targetCode = artForm.code_art.trim().toUpperCase();

    if (!isModif && articles.some(a => a.code_art.toUpperCase() === targetCode)) {
      alert(`Le code article ${targetCode} existe déjà dans le stock.`);
      return;
    }

    setConfirmModalState({
      isOpen: true,
      title: isModif ? 'Confirmation de Modification' : 'Confirmation d\'Enregistrement',
      type: 'save',
      message: isModif
        ? `Confirmez-vous l'enregistrement des modifications apportées à l'article ${targetCode} (${artForm.designation}) ?`
        : `Confirmez-vous la création et l'ajout du nouvel article ${targetCode} (${artForm.designation}) dans la base de données ?`,
      details: [
        `Code : ${targetCode}`,
        `Désignation : ${artForm.designation}`,
        `Longueur : ${artForm.longeur ?? 0} mm | Lame scie : ${artForm.lame ?? 0} mm`,
        `Stock physique : ${artForm.stock_physique ?? 0} barres | Prix : ${artForm.prix_unitaire ?? 0} DZD`
      ],
      confirmLabel: isModif ? 'Oui, Mettre à jour' : 'Oui, Enregistrer',
      cancelLabel: 'Annuler',
      onConfirm: async () => {
        setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        await executerEnregistrementArticle();
      }
    });
  };

  const executerEnregistrementArticle = async () => {
    const newArt: Article = {
      code_art: artForm.code_art!.trim().toUpperCase(),
      designation: artForm.designation!.trim(),
      statut: artForm.statut || 'NORMAL',
      hauteur: artForm.hauteur ?? 0,
      longeur: artForm.longeur ?? 0,
      lame: artForm.lame ?? 0,
      debordement: artForm.debordement ?? 0,
      refus_min: artForm.refus_min ?? 0,
      refus_max: artForm.refus_max ?? 0,
      stock_physique: artForm.stock_physique ?? 0,
      quantite_reservee: artForm.quantite_reservee ?? 0,
      prix_unitaire: artForm.prix_unitaire ?? 0,
      stock_min: artForm.stock_min ?? 0,
      actif: artForm.actif !== undefined ? artForm.actif : true
    };

    let updatedList: Article[];
    if (isEditingArticle && selectedArticleCode) {
      updatedList = articles.map(a => (a.code_art === selectedArticleCode ? newArt : a));
    } else {
      updatedList = [...articles, newArt];
    }

    try {
      await StorageService.saveArticles(updatedList);
      onStockUpdated();
      handleViderFormArticle();
      setFeedbackAction(`Article ${newArt.code_art} enregistré avec succès en base SQLite !`);
      setTimeout(() => setFeedbackAction(null), 4000);
    } catch (e: any) {
      alert('Erreur lors de la sauvegarde : ' + e.message);
    }
  };

  // Demande de suppression avec Détection stricte des Commandes Clôturées
  const handleDemandeSupprimerArticle = (code: string) => {
    const art = articles.find(a => a.code_art === code);
    const designation = art?.designation || '';
    const { inClosed, refs } = isArticleInClosedOrders(code);

    if (inClosed) {
      // Suppression formellement impossible -> Proposition de désactivation
      setConfirmModalState({
        isOpen: true,
        title: 'Suppression Impossible — Commandes Clôturées',
        type: 'warning',
        message: (
          <div className="space-y-2.5 text-xs leading-relaxed">
            <p className="text-amber-200 font-semibold">
              Cet article est déjà saisi dans des lignes de commandes déjà clôturées ou archivées.
            </p>
            <p className="text-slate-300">
              Conformément aux règles de traçabilité industrielle, <strong className="text-rose-400 font-bold">sa suppression définitive est formellement impossible</strong> afin de garantir l'intégrité des historiques d'atelier.
            </p>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-amber-500/30 text-[11px] text-amber-300">
              💡 Solution recommandée : vous pouvez <strong className="underline font-bold">désactiver</strong> cet article. Il sera retiré du catalogue actif et placé dans « Articles désactivés », avec la possibilité d'une réactivation à tout moment.
            </div>
          </div>
        ),
        details: refs.slice(0, 4).map(r => `Commande / Dossier clôturé : ${r}`),
        confirmLabel: 'Désactiver l\'article',
        cancelLabel: 'Annuler',
        onConfirm: () => {
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          handleDeactivateArticle(code);
        }
      });
    } else {
      // Confirmation de suppression normale
      setConfirmModalState({
        isOpen: true,
        title: 'Confirmation de Suppression Définitive',
        type: 'danger',
        message: `Êtes-vous certain de vouloir supprimer définitivement l'article "${code}" (${designation}) ?`,
        details: [
          'Cet article sera effacé de la base de données SQLite.',
          'Cette action est irréversible.'
        ],
        confirmLabel: 'Oui, Supprimer définitivement',
        cancelLabel: 'Annuler',
        onConfirm: async () => {
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          try {
            const updated = articles.filter(a => a.code_art !== code);
            await StorageService.saveArticles(updated);
            onStockUpdated();
            handleViderFormArticle();
            setFeedbackAction(`Article ${code} supprimé du stock.`);
            setTimeout(() => setFeedbackAction(null), 3500);
          } catch (e: any) {
            alert('Erreur lors de la suppression : ' + e.message);
          }
        }
      });
    }
  };

  // --- HANDLERS MAPPING ---
  const handleEnregistrerMapping = async (artCode?: string, sheet?: string) => {
    const codeToMap = artCode || selectedArtForMapping;
    const sheetToMap = sheet !== undefined ? sheet : selectedSheetForMapping;

    if (!codeToMap) {
      alert('Veuillez sélectionner un article.');
      return;
    }

    const updatedMapping = { ...mapping };

    if (!sheetToMap) {
      // Déliement
      delete updatedMapping[codeToMap];
      await StorageService.saveMapping(updatedMapping);
      onStockUpdated();
      return;
    }

    // Règle d'unicité : 1 famille de chutes = 1 seul article
    // Si cette famille était déjà assignée à un autre article, on la détache de l'ancien pour éviter tout conflit
    for (const [otherCode, otherSheet] of Object.entries(updatedMapping)) {
      if (otherSheet === sheetToMap && otherCode !== codeToMap) {
        delete updatedMapping[otherCode];
      }
    }

    updatedMapping[codeToMap] = sheetToMap;
    await StorageService.saveMapping(updatedMapping);
    onStockUpdated();
  };

  /**
   * Algorithme d'Auto-Liaison Stricte :
   * Ne lie que les correspondances certaines et fiables.
   * Exclut formellement les accessoires (bouchons, embouts, visserie, équerres, serrures, kits, etc.)
   * et vérifie l'exactitude des dimensions et des profils.
   */
  const handleAutoMapping = async () => {
    const updatedMapping = { ...mapping };
    let matchCount = 0;
    const usedSheets = new Set(Object.values(updatedMapping));

    // Fonction de normalisation textuelle
    const norm = (str: string): string =>
      (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Mots clés d'accessoires / pièces détachées à exclure formellement
    const ACCESSORY_KEYWORDS = [
      'BOUCHON', 'EMBOUT', 'VIS', 'EQUERRE', 'ACCESSOIRE', 'SERRURE',
      'POIGNEE', 'KIT', 'JOINT', 'CLIPS', 'ROULETTE', 'ATTACHE',
      'MOTEUR', 'TELECOMMANDE', 'EMETTEUR', 'TANDEM', 'SUPPORT',
      'COUSSINET', 'TREUIL', 'MANIVELLE', 'VERROU', 'AXE', 'TUBE',
      'ROULEAU', 'GUIDE', 'TULIPE', 'PULSAR', 'RESSORT', 'CABLE'
    ];

    for (const art of safeArticles) {
      if (updatedMapping[art.code_art]) continue;

      const normArtDesig = norm(art.designation);
      const normArtCode = norm(art.code_art);

      // 1. Exclusion absolue des accessoires
      const isAccessory = ACCESSORY_KEYWORDS.some(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        return regex.test(normArtDesig);
      });
      if (isAccessory) continue;

      for (const sheet of allSheets) {
        if (usedSheets.has(sheet)) continue;

        const normSheet = norm(sheet);

        // A. Correspondance exacte code ou désignation
        const exactCode = normArtCode === normSheet;
        const exactDesig = normArtDesig === normSheet;

        // B. Maille Moustiquaire
        const mailleMatch =
          (sheet === 'MAILLE MSTQ' || normSheet.includes('MAILLE MSTQ')) &&
          (normArtDesig.includes('MAILLE') || normArtDesig.includes('TOILE'));

        // C. Profilés spécifiques avec validation stricte des cotes / numéros
        let strictProfileMatch = false;
        if (!exactCode && !exactDesig && !mailleMatch) {
          const artNumbers: string[] = normArtDesig.match(/\d+/g) || [];
          const sheetNumbers: string[] = normSheet.match(/\d+/g) || [];

          // Si les deux ont des dimensions, elles doivent correspondre exactement
          const numbersMatch =
            artNumbers.length > 0 && sheetNumbers.length > 0
              ? artNumbers.every(n => sheetNumbers.includes(n)) &&
                sheetNumbers.every(n => artNumbers.includes(n))
              : false;

          // Familles de profilés reconnues
          const profilePrefixes = [
            'CT SOMO', 'SF', 'TBL', 'TAB', 'LAME FINALE', 'COULISSE',
            'CADRE MSTQ', 'BARRE COULISSE', 'BARRE INFERIEURE', 'PRC', 'PRECADRE'
          ];

          const matchedPrefix = profilePrefixes.find(p => {
            const normP = norm(p);
            return normArtDesig.includes(normP) && normSheet.includes(normP);
          });

          if (matchedPrefix && numbersMatch) {
            strictProfileMatch = true;
          }
        }

        if (exactCode || exactDesig || mailleMatch || strictProfileMatch) {
          updatedMapping[art.code_art] = sheet;
          usedSheets.add(sheet);
          matchCount++;
          break;
        }
      }
    }

    if (matchCount > 0) {
      await StorageService.saveMapping(updatedMapping);
      onStockUpdated();
      alert(`🪄 Auto-Liaison stricte terminée ! ${matchCount} nouvel(les) association(s) exacte(s) créée(s).`);
    } else {
      alert('Aucune nouvelle correspondance stricte et fiable trouvée.');
    }
  };

  const handleClearAllMappings = async () => {
    if (confirm('Êtes-vous sûr de vouloir dissocier TOUTES les liaisons Articles ↔ Chutes ? (Vous pourrez re-lier manuellement ou via auto-liaison)')) {
      await StorageService.clearAllMappings();
      onStockUpdated();
      alert('🗑️ Toutes les liaisons ont été effacées.');
    }
  };

  const handleResetDefaultMapping = async () => {
    if (confirm('Voulez-vous restaurer toutes les associations Articles ↔ Chutes recommandées par défaut ?')) {
      await StorageService.saveMapping(INITIAL_MAPPING);
      onStockUpdated();
      alert('✅ Les liaisons d\'origine recommandées ont été restaurées.');
    }
  };

  const handleSupprimerMapping = async (code: string) => {
    const updatedMapping = { ...mapping };
    delete updatedMapping[code];
    await StorageService.saveMapping(updatedMapping);
    onStockUpdated();
  };

  // --- HANDLERS FAMILLES DE CHUTES ---
  const handleCreerFamilleDepuisArticle = async (articleCode: string) => {
    const art = safeArticles.find(a => a.code_art === articleCode);
    if (!art) {
      alert('Article introuvable. Veuillez sélectionner un article valide.');
      return;
    }

    // Nom de famille propre dérivé de l'article (désignation ou code)
    const familyName = (art.designation?.trim() || art.code_art?.trim() || '').replace(/[\/\\]/g, '-');
    if (!familyName) {
      alert("L'article sélectionné ne possède pas de désignation exploitable.");
      return;
    }

    // 1. Créer la famille de chute dans SQLite si elle n'existe pas déjà
    if (chutesBarres[familyName] === undefined && familyName.toUpperCase() !== 'MAILLE MSTQ') {
      await StorageService.createChuteFamily(familyName, chutesBarres);
    }

    // 2. Associer automatiquement cet article à cette nouvelle famille
    const updatedMapping = { ...mapping };
    // Règle d'unicité : détacher d'éventuelles associations obsolètes
    for (const [otherCode, otherSheet] of Object.entries(updatedMapping)) {
      if (otherSheet === familyName && otherCode !== art.code_art) {
        delete updatedMapping[otherCode];
      }
    }
    updatedMapping[art.code_art] = familyName;
    await StorageService.saveMapping(updatedMapping);

    // 3. Basculer l'affichage directement sur cette nouvelle famille
    setSelectedSheet(familyName);
    onStockUpdated();
    alert(`🪄 Famille de chutes "${familyName}" créée et liée automatiquement à l'article ${art.code_art} (${art.designation}) !`);
  };

  const handleCreerFamille = async (nameToCreate?: string) => {
    const name = (nameToCreate || newSheetInput || newFamilyModalInput).trim();
    if (!name) {
      alert('Veuillez saisir un nom de famille de chutes.');
      return;
    }
    if (chutesBarres[name] !== undefined || name.toUpperCase() === 'MAILLE MSTQ') {
      alert(`La famille "${name}" existe déjà.`);
      return;
    }

    const updated = await StorageService.createChuteFamily(name, chutesBarres);
    if (updated) {
      onStockUpdated();
      setSelectedSheet(name);
      setNewSheetInput('');
      setNewFamilyModalInput('');
    }
  };

  const handleRenommerFamille = async (oldName: string, newName: string) => {
    const cleanNew = newName.trim();
    if (!cleanNew || cleanNew === oldName) {
      setEditingFamilyName(null);
      setIsRenamingSheet(false);
      return;
    }
    if (oldName === 'MAILLE MSTQ') {
      alert("La famille MAILLE MSTQ est réservée et ne peut pas être renommée.");
      return;
    }

    const res = await StorageService.renameChuteSheet(oldName, cleanNew, chutesBarres, mapping);
    if (!res) {
      alert(`Impossible de renommer : une famille "${cleanNew}" existe déjà.`);
      return;
    }
    onStockUpdated();
    if (selectedSheet === oldName) {
      setSelectedSheet(cleanNew);
    }
    setEditingFamilyName(null);
    setIsRenamingSheet(false);
  };

  const handleSupprimerFamille = async (sheetName: string) => {
    if (sheetName === 'MAILLE MSTQ') {
      alert("La famille MAILLE MSTQ ne peut pas être supprimée.");
      return;
    }
    const count = (chutesBarres[sheetName] || []).length;
    if (!confirm(`Supprimer définitivement la famille "${sheetName}" (${count} chutes) et dissocier ses liaisons ?`)) {
      return;
    }

    await StorageService.deleteChuteSheet(sheetName, chutesBarres, mapping);
    onStockUpdated();
    const remaining = Object.keys(chutesBarres).filter(s => s !== sheetName && s !== 'MAILLE MSTQ');
    setSelectedSheet(safeChutesMaille.length > 0 ? 'MAILLE MSTQ' : (remaining[0] || ''));
  };

  const handleConsoliderDoublonsChutes = async () => {
    let nbMerged = 0;
    const newBarres: Record<string, ChuteItem[]> = {};

    for (const [sheet, items] of Object.entries(safeChutesBarres)) {
      const byLg = new Map<number, ChuteItem>();
      for (const item of items) {
        const lg = Math.round(Number(item.longueur) * 10) / 10;
        if (lg <= 0) continue;
        if (byLg.has(lg)) {
          const ex = byLg.get(lg)!;
          ex.quantite = (ex.quantite || 0) + (item.quantite || 0);
          ex.quantitePhysique = (ex.quantitePhysique || 0) + (item.quantitePhysique || 0);
          ex.reserve = (ex.reserve || 0) + (item.reserve || 0);
          nbMerged++;
        } else {
          byLg.set(lg, {
            ...item,
            longueur: lg,
            quantite: item.quantite || 0,
            quantitePhysique: item.quantitePhysique || 0,
            reserve: item.reserve || 0
          });
        }
      }
      newBarres[sheet] = Array.from(byLg.values());
    }

    const byDim = new Map<number, ChuteMaille>();
    for (const item of safeChutesMaille) {
      const dim = Math.round(Number(item.dimension_fixe) * 10) / 10;
      if (dim <= 0) continue;
      if (byDim.has(dim)) {
        const ex = byDim.get(dim)!;
        ex.plis = (ex.plis || 0) + (item.plis || 0);
        ex.plisPhysique = (ex.plisPhysique || 0) + (item.plisPhysique || 0);
        ex.plisReserve = (ex.plisReserve || 0) + (item.plisReserve || 0);
        nbMerged++;
      } else {
        byDim.set(dim, {
          ...item,
          dimension_fixe: dim,
          plis: item.plis || 0,
          plisPhysique: item.plisPhysique || 0,
          plisReserve: item.plisReserve || 0
        });
      }
    }

    await StorageService.saveChutesBarres(newBarres);
    await StorageService.saveChutesMaille(Array.from(byDim.values()));
    onStockUpdated();
    alert(`✨ Consolidation réussie : ${nbMerged} doublon(s) fusionné(s) en une seule mesure avec quantité totale cumulée.`);
  };

  const handleAjouterChute = async () => {
    const lg = Math.round(parseFloat(saisieChuteLongueur) * 10) / 10;
    const qte = parseInt(saisieChuteQte, 10);
    if (isNaN(lg) || lg <= 0 || isNaN(qte) || qte <= 0) {
      alert('Longueur et quantité/plis doivent être des nombres positifs.');
      return;
    }

    if (selectedSheet === 'MAILLE MSTQ') {
      // Vérifier si la dimension existe déjà pour cumuler sans dupliquer
      const existingIdx = safeChutesMaille.findIndex(m => Math.abs(Number(m.dimension_fixe) - lg) < 0.5);
      let updatedMaille: ChuteMaille[];

      if (existingIdx >= 0) {
        updatedMaille = safeChutesMaille.map((m, idx) => {
          if (idx === existingIdx) {
            return {
              ...m,
              plis: (m.plis || 0) + qte,
              plisPhysique: (m.plisPhysique ?? m.plis ?? 0) + qte
            };
          }
          return m;
        });
      } else {
        const newMaille: ChuteMaille = {
          id: `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          dimension_fixe: lg,
          plis: qte,
          plisPhysique: qte,
          plisReserve: 0
        };
        updatedMaille = [...safeChutesMaille, newMaille];
      }
      await StorageService.saveChutesMaille(updatedMaille);
    } else {
      // Barres aluminium : vérifier si la longueur existe déjà pour cumuler la quantité totale
      const existing = safeChutesBarres[selectedSheet] || [];
      const existingIdx = existing.findIndex(c => Math.abs(Number(c.longueur) - lg) < 0.5);
      let updatedList: ChuteItem[];

      if (existingIdx >= 0) {
        updatedList = existing.map((c, idx) => {
          if (idx === existingIdx) {
            return {
              ...c,
              quantite: (c.quantite || 0) + qte,
              quantitePhysique: (c.quantitePhysique ?? c.quantite ?? 0) + qte
            };
          }
          return c;
        });
      } else {
        const newItem: ChuteItem = {
          id: `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          longueur: lg,
          quantite: qte,
          quantitePhysique: qte,
          reserve: 0
        };
        updatedList = [...existing, newItem];
      }
      const updated = { ...safeChutesBarres, [selectedSheet]: updatedList };
      await StorageService.saveChutesBarres(updated);
    }

    onStockUpdated();
    setSaisieChuteLongueur('');
    setSaisieChuteQte('1');
  };

  const handleStartEditChute = (chuteId: string, lg: number, qte: number) => {
    setEditingChuteId(chuteId);
    setEditChuteLongueur(String(lg));
    setEditChuteQte(String(qte));
  };

  const handleSaveEditChute = async (chuteId: string) => {
    const lg = Math.round(parseFloat(editChuteLongueur) * 10) / 10;
    const qte = parseInt(editChuteQte, 10);
    if (isNaN(lg) || lg <= 0 || isNaN(qte) || qte < 0) {
      alert('Dimension et Quantité doivent être des nombres positifs.');
      return;
    }

    try {
      if (selectedSheet === 'MAILLE MSTQ') {
        const updated = safeChutesMaille.map((m) => {
          if (m.id === chuteId) {
            const res = Number(m.plisReserve) || 0;
            return {
              ...m,
              dimension_fixe: lg,
              plis: qte,
              plisPhysique: qte + res
            };
          }
          return m;
        });
        await StorageService.saveChutesMaille(updated);
      } else {
        const currentList = safeChutesBarres[selectedSheet] || [];
        const updatedList = currentList.map((c) => {
          if (c.id === chuteId) {
            const res = Number(c.reserve) || 0;
            return {
              ...c,
              longueur: lg,
              quantite: qte,
              quantitePhysique: qte + res
            };
          }
          return c;
        });
        await StorageService.saveChutesBarres({ ...safeChutesBarres, [selectedSheet]: updatedList });
      }

      await onStockUpdated();
      setEditingChuteId(null);
    } catch (err: any) {
      alert(`Erreur lors de la sauvegarde : ${err?.message || err}`);
    }
  };

  const handleSupprimerChute = async (chuteId: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Confirmation de suppression de chute',
      type: 'danger',
      message: 'Êtes-vous certain de vouloir supprimer définitivement cette chute du stock ?',
      details: [`Famille : ${selectedSheet}`, `Identifiant : ${chuteId}`],
      confirmLabel: 'Oui, Supprimer',
      cancelLabel: 'Annuler',
      onConfirm: async () => {
        setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        try {
          if (selectedSheet === 'MAILLE MSTQ') {
            const updated = safeChutesMaille.filter((m) => m.id !== chuteId);
            await StorageService.saveChutesMaille(updated);
          } else {
            const currentList = safeChutesBarres[selectedSheet] || [];
            const updatedList = currentList.filter((c) => c.id !== chuteId);
            await StorageService.saveChutesBarres({ ...safeChutesBarres, [selectedSheet]: updatedList });
          }
          await onStockUpdated();
          setFeedbackAction('Chute supprimée du stock.');
          setTimeout(() => setFeedbackAction(null), 3000);
        } catch (err: any) {
          alert(`Erreur lors de la suppression : ${err?.message || err}`);
        }
      }
    });
  };

  const filteredArticles = articles.filter(a => {
    // Filtre sur état Actif / Désactivé
    if (articleStatusFilter === 'ACTIFS' && a.actif === false) return false;
    if (articleStatusFilter === 'DESACTIVES' && a.actif !== false) return false;

    if (!searchArticle.trim()) return true;
    const q = searchArticle.toLowerCase().trim();
    return (
      (a.designation || '').toLowerCase().includes(q) ||
      (a.code_art || '').toLowerCase().includes(q)
    );
  });

  // --- TRI PAR DOUBLE-CLIC SUR LES EN-TÊTES ---
  // 1. Articles
  type ArticleSortKey = 'code_art' | 'designation' | 'longeur' | 'lame' | 'debordement' | 'stock_physique' | 'prix_unitaire';
  const [artSortKey, setArtSortKey] = useState<ArticleSortKey | null>(null);
  const [artSortDir, setArtSortDir] = useState<'asc' | 'desc'>('asc');

  const handleArtSort = (key: ArticleSortKey) => {
    if (artSortKey === key) {
      setArtSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setArtSortKey(key);
      setArtSortDir('asc');
    }
  };

  const sortedArticles = useMemo(() => {
    if (!artSortKey) return filteredArticles;
    return [...filteredArticles].sort((a, b) => {
      const va = a[artSortKey];
      const vb = b[artSortKey];
      if (typeof va === 'string' && typeof vb === 'string') {
        return artSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return artSortDir === 'asc' ? (Number(va) - Number(vb)) : (Number(vb) - Number(va));
    });
  }, [filteredArticles, artSortKey, artSortDir]);

  // 2. Chutes Barres & Maille
  const [chuteSortKey, setChuteSortKey] = useState<'longueur' | 'quantite' | null>(null);
  const [chuteSortDir, setChuteSortDir] = useState<'asc' | 'desc'>('asc');

  const handleChuteSort = (key: 'longueur' | 'quantite') => {
    if (chuteSortKey === key) {
      setChuteSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setChuteSortKey(key);
      setChuteSortDir('asc');
    }
  };

  const sortedChutesBarresList = useMemo(() => {
    const list = safeChutesBarres[selectedSheet] || [];
    if (!chuteSortKey) return list;
    return [...list].sort((a, b) => {
      const va = a[chuteSortKey];
      const vb = b[chuteSortKey];
      return chuteSortDir === 'asc' ? (Number(va) - Number(vb)) : (Number(vb) - Number(va));
    });
  }, [safeChutesBarres, selectedSheet, chuteSortKey, chuteSortDir]);

  const sortedChutesMailleList = useMemo(() => {
    if (!chuteSortKey) return safeChutesMaille;
    return [...safeChutesMaille].sort((a, b) => {
      const va = chuteSortKey === 'longueur' ? a.dimension_fixe : a.plis;
      const vb = chuteSortKey === 'longueur' ? b.dimension_fixe : b.plis;
      return chuteSortDir === 'asc' ? (Number(va) - Number(vb)) : (Number(vb) - Number(va));
    });
  }, [safeChutesMaille, chuteSortKey, chuteSortDir]);

  // 3. Mouvements Stock
  const [mvtSortKey, setMvtSortKey] = useState<'date' | 'type' | 'numCommande' | 'articleCode' | 'nomClient' | 'quantite' | null>(null);
  const [mvtSortDir, setMvtSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchMvt, setSearchMvt] = useState<string>('');
  const [selectedMvtForEdit, setSelectedMvtForEdit] = useState<MouvementStock | null>(null);
  const [isEditMvtModalOpen, setIsEditMvtModalOpen] = useState<boolean>(false);
  const [editMvtInitialMode, setEditMvtInitialMode] = useState<'MODIFIER' | 'ANNULER'>('MODIFIER');

  // Notifications Toast Globales pour les Opérations de Stock (Réception, Sortie, Annulation)
  const [globalStockToast, setGlobalStockToast] = useState<{
    title: string;
    message: string;
    type: 'success' | 'info' | 'warn';
  } | null>(null);

  const triggerStockToast = (title: string, message: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setGlobalStockToast({ title, message, type });
    setTimeout(() => {
      setGlobalStockToast(null);
    }, 7000);
  };

  const handleMvtSort = (key: 'date' | 'type' | 'numCommande' | 'articleCode' | 'nomClient' | 'quantite') => {
    if (mvtSortKey === key) {
      setMvtSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setMvtSortKey(key);
      setMvtSortDir('asc');
    }
  };

  // 5. Mapping Chutes
  const [mapSortKey, setMapSortKey] = useState<'code_art' | 'designation' | 'sheet' | 'stock' | null>(null);
  const [mapSortDir, setMapSortDir] = useState<'asc' | 'desc'>('asc');

  const handleMapSort = (key: 'code_art' | 'designation' | 'sheet' | 'stock') => {
    if (mapSortKey === key) {
      setMapSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setMapSortKey(key);
      setMapSortDir('asc');
    }
  };

  const filteredAndSortedMappings = useMemo(() => {
    const list = articles.filter(a => {
      if (filterOnlyUnmapped && mapping[a.code_art]) return false;
      if (!searchMapping) return true;
      const s = searchMapping.toLowerCase();
      return (
        a.code_art.toLowerCase().includes(s) ||
        a.designation.toLowerCase().includes(s) ||
        (mapping[a.code_art] || '').toLowerCase().includes(s)
      );
    });

    if (!mapSortKey) return list;

    return [...list].sort((a, b) => {
      if (mapSortKey === 'code_art') {
        return mapSortDir === 'asc' ? a.code_art.localeCompare(b.code_art) : b.code_art.localeCompare(a.code_art);
      }
      if (mapSortKey === 'designation') {
        return mapSortDir === 'asc' ? a.designation.localeCompare(b.designation) : b.designation.localeCompare(a.designation);
      }
      if (mapSortKey === 'sheet') {
        const sa = mapping[a.code_art] || '';
        const sb = mapping[b.code_art] || '';
        return mapSortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      if (mapSortKey === 'stock') {
        const getCount = (code: string) => {
          const sheet = mapping[code];
          if (!sheet) return 0;
          if (sheet.toUpperCase() === 'MAILLE MSTQ') return safeChutesMaille.length;
          return (safeChutesBarres[sheet] || []).length;
        };
        const ca = getCount(a.code_art);
        const cb = getCount(b.code_art);
        return mapSortDir === 'asc' ? ca - cb : cb - ca;
      }
      return 0;
    });
  }, [articles, mapping, filterOnlyUnmapped, searchMapping, mapSortKey, mapSortDir, safeChutesMaille, safeChutesBarres]);

  const filteredAndSortedMouvements = useMemo(() => {
    let list = mouvements.filter(m => filtreTypeMvt === 'TOUS' || m.type === filtreTypeMvt);
    if (searchMvt.trim()) {
      const q = searchMvt.toLowerCase().trim();
      list = list.filter(m => 
        (m.articleCode && m.articleCode.toLowerCase().includes(q)) ||
        (m.designation && m.designation.toLowerCase().includes(q)) ||
        (m.numCommande && m.numCommande.toLowerCase().includes(q)) ||
        (m.nomClient && m.nomClient.toLowerCase().includes(q)) ||
        (m.numBL && m.numBL.toLowerCase().includes(q)) ||
        (m.fournisseur && m.fournisseur.toLowerCase().includes(q)) ||
        (m.date && m.date.toLowerCase().includes(q)) ||
        (m.remarque && m.remarque.toLowerCase().includes(q))
      );
    }
    if (!mvtSortKey) return list;
    return [...list].sort((a, b) => {
      const va = (a as any)[mvtSortKey] || '';
      const vb = (b as any)[mvtSortKey] || '';
      if (mvtSortKey === 'quantite') {
        return mvtSortDir === 'asc' ? (Number(va) - Number(vb)) : (Number(vb) - Number(va));
      }
      return mvtSortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [mouvements, filtreTypeMvt, searchMvt, mvtSortKey, mvtSortDir]);

  const SortIcon = ({ col, currentKey, currentDir }: { col: string; currentKey: string | null; currentDir: 'asc' | 'desc' }) => (
    <span className={`ml-1 text-[11px] inline-block select-none transition ${
      currentKey === col ? 'text-amber-400 font-black opacity-100 scale-110' : 'opacity-40 group-hover:opacity-80'
    }`}>
      {currentKey === col ? (currentDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  // Calcul précis et cohérent du nombre d'articles liés et non liés
  const linkedArticlesCount = useMemo(() => {
    return safeArticles.filter(a => !!mapping[a.code_art]).length;
  }, [safeArticles, mapping]);

  const countUnmappedArticles = useMemo(() => {
    return safeArticles.filter(a => !mapping[a.code_art]).length;
  }, [safeArticles, mapping]);

  return (
    <div className="space-y-6">
      {/* Toast Notification Flottante Confirmation Opérations */}
      {globalStockToast && (
        <div className={`p-4 rounded-2xl border-2 flex items-center justify-between shadow-2xl animate-in fade-in slide-in-from-top-3 duration-300 ${
          globalStockToast.type === 'warn'
            ? 'bg-amber-950/90 border-amber-500/80 text-amber-200'
            : 'bg-emerald-950/90 border-emerald-500/80 text-emerald-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              globalStockToast.type === 'warn'
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-400'
                : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-400'
            }`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-100">{globalStockToast.title}</h4>
              <p className="text-xs text-slate-300 font-medium mt-0.5">{globalStockToast.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setGlobalStockToast(null)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Fermer cette notification"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Barre d'opérations directes matière (Réception, Sortie manuelle, Inventaire) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <span>Opérations de Stock &amp; Flux Matière</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                Profilés &amp; Barres
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Enregistrer une réception fournisseur (BL), une sortie directe ou contrôler les comptages physiques d'inventaire
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => ouvrirOperationStock('RECEPTION')}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            <span>📥 Réception Marchandise</span>
          </button>

          <button
            type="button"
            onClick={() => ouvrirOperationStock('SORTIE')}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <PackageMinus className="w-4 h-4" />
            <span>📤 Sortie Manuelle</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('inventaire')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition cursor-pointer ${
              subTab === 'inventaire'
                ? 'bg-sky-500 text-slate-950 font-black'
                : 'bg-sky-600 hover:bg-sky-500 text-white'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>📋 Inventaire Physique</span>
          </button>
        </div>
      </div>

      {/* Top Subtabs Switcher */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSubTab('articles')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition flex items-center gap-2 ${
              subTab === 'articles'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Articles ({safeArticles.length})</span>
          </button>

          <button
            onClick={() => setSubTab('chutes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition flex items-center gap-2 ${
              subTab === 'chutes'
                ? 'bg-sky-500 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Stock Chutes ({allSheets.length} Familles)</span>
          </button>

          <button
            onClick={() => setSubTab('inventaire')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition flex items-center gap-2 ${
              subTab === 'inventaire'
                ? 'bg-sky-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Inventaire &amp; Écarts</span>
          </button>

          <button
            onClick={() => { setSubTab('historique'); onStockUpdated(); }}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition flex items-center gap-2 ${
              subTab === 'historique'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historique Mouvements ({mouvements.length})</span>
          </button>
        </div>
      </div>

      {/* SUBTAB 1 : ARTICLES */}
      {subTab === 'articles' && (
        <div className="space-y-6">
          {/* Barre d'action Import / Export Intelligente */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-xs font-bold text-slate-100">Base Catalogue &amp; Stocks Articles</h4>
                <p className="text-[11px] text-slate-400">{articles.length} profilés et accessoires configurés.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => ouvrirOperationStock('RECEPTION')}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <PackagePlus className="w-4 h-4" />
                <span>📥 Réception Marchandise</span>
              </button>

              <button
                onClick={() => ouvrirOperationStock('SORTIE')}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <PackageMinus className="w-4 h-4" />
                <span>📤 Sortie Manuelle</span>
              </button>

              <button
                onClick={() => ouvrirOperationStock('INVENTAIRE')}
                className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>📋 Ajuster Inventaire</span>
              </button>

              <button
                onClick={() => setIsImportArticlesModalOpen(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>📥 Import Intelligent Excel</span>
              </button>
              <button
                onClick={() => StorageService.exportArticlesExcel(articles)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-2 border border-slate-700 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>📤 Exporter .XLSX</span>
              </button>
            </div>
          </div>

          {/* Formulaire Article (Ajouter / Modifier) */}
          <div ref={formArticleRef} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm text-slate-100 space-y-4">
            {feedbackAction && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center justify-between">
                <span>{feedbackAction}</span>
                <button type="button" onClick={() => setFeedbackAction(null)} className="text-emerald-400 hover:text-white ml-2 text-xs font-bold">✕</button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-slate-100">
                  {isEditingArticle ? `Modifier l'article (${artForm.code_art})` : 'Ajouter un Nouvel Article'}
                </h3>
                {isEditingArticle && artForm.actif === false && (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold border border-rose-500/30">
                    Article Désactivé
                  </span>
                )}
              </div>
              {isEditingArticle && (
                <div className="flex items-center gap-2">
                  {lastSelectedArticleCode && (
                    <button
                      type="button"
                      onClick={handleScrollBackToSelectedRow}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      title="Revenir directement vers cet article dans la liste en bas de page"
                    >
                      <span>↓ Revenir à la sélection</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAnnulerEtRevenir}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs rounded-lg border border-slate-700 transition cursor-pointer"
                  >
                    Annuler &amp; Revenir
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 font-semibold flex items-center gap-1">
                    <span>Code Article *</span>
                  </label>
                  {!isEditingArticle ? (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold border border-amber-500/30">
                      ✨ Auto
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">Fixe</span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={artForm.code_art || ''}
                    onChange={e => setArtForm({ ...artForm, code_art: e.target.value.toUpperCase() })}
                    placeholder="Code"
                    disabled={isEditingArticle}
                    className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 font-mono font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      isEditingArticle ? 'border-slate-800 opacity-70 cursor-not-allowed' : 'border-slate-700'
                    }`}
                  />
                  {!isEditingArticle && (
                    <button
                      type="button"
                      onClick={handleRegenererCodeAuto}
                      title="Regénérer le code auto-incrémenté"
                      className="absolute right-1.5 p-1 text-slate-400 hover:text-amber-400 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-slate-400 mb-1 font-semibold">Désignation *</label>
                <input
                  type="text"
                  value={artForm.designation || ''}
                  onChange={e => setArtForm({ ...artForm, designation: e.target.value })}
                  placeholder="Désignation du profilé ou accessoire..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Longueur Barre (mm)</label>
                <input
                  type="number"
                  value={artForm.longeur ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, longeur: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Épais. Lame Scie (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={artForm.lame ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, lame: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Débordement (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={artForm.debordement ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, debordement: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Refus Min (mm)</label>
                <input
                  type="number"
                  value={artForm.refus_min ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, refus_min: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Refus Max (mm)</label>
                <input
                  type="number"
                  value={artForm.refus_max ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, refus_max: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Stock Physique (barres)</label>
                <input
                  type="number"
                  value={artForm.stock_physique ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, stock_physique: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-emerald-400 font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Stock Min (Alerte)</label>
                <input
                  type="number"
                  value={artForm.stock_min ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, stock_min: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Prix Unitaire (DZD)</label>
                <input
                  type="number"
                  value={artForm.prix_unitaire ?? ''}
                  placeholder=""
                  onChange={e => setArtForm({ ...artForm, prix_unitaire: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-amber-300 focus:outline-none"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleDemandeEnregistrerArticle}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isEditingArticle ? 'Mettre à jour' : 'Ajouter'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tableau des Articles */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-72">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Rechercher désignation ou code..."
                    value={searchArticle}
                    onChange={e => setSearchArticle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <ColumnCustomizerPopover tableId="articles" />

                {/* Filtre d'état des Articles (Actifs / Désactivés / Tous) */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setArticleStatusFilter('ACTIFS')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                      articleStatusFilter === 'ACTIFS'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>Articles Actifs</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      articleStatusFilter === 'ACTIFS' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {articles.filter(a => a.actif !== false).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setArticleStatusFilter('DESACTIVES')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                      articleStatusFilter === 'DESACTIVES'
                        ? 'bg-rose-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>Désactivés</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      articleStatusFilter === 'DESACTIVES' ? 'bg-white/20 text-white font-black' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {articles.filter(a => a.actif === false).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setArticleStatusFilter('TOUS')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                      articleStatusFilter === 'TOUS'
                        ? 'bg-slate-800 text-slate-200 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>Tous</span>
                    <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded-full text-slate-400">
                      {articles.length}
                    </span>
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Affichés : <span className="font-bold text-slate-200">{filteredArticles.length}</span> articles
              </div>
            </div>

            <div className="border border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
                  <tr>
                    {columnConfigService.isColumnVisible('articles', 'code_art') && (
                      <th
                        className={`py-2.5 px-3 cursor-pointer select-none transition group hover:bg-slate-900 ${artSortKey === 'code_art' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleArtSort('code_art')}
                        onDoubleClick={() => handleArtSort('code_art')}
                        title="Cliquer pour trier par Code Article"
                      >
                        Code <SortIcon col="code_art" currentKey={artSortKey} currentDir={artSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('articles', 'designation') && (
                      <th
                        className={`py-2.5 px-3 cursor-pointer select-none transition group hover:bg-slate-900 ${artSortKey === 'designation' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleArtSort('designation')}
                        onDoubleClick={() => handleArtSort('designation')}
                        title="Cliquer pour trier par Désignation"
                      >
                        Désignation <SortIcon col="designation" currentKey={artSortKey} currentDir={artSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('articles', 'longeur') && (
                      <th
                        className={`py-2.5 px-3 text-center cursor-pointer select-none transition group hover:bg-slate-900 ${artSortKey === 'longeur' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleArtSort('longeur')}
                        onDoubleClick={() => handleArtSort('longeur')}
                        title="Cliquer pour trier par Longueur Barre"
                      >
                        Longueur <SortIcon col="longeur" currentKey={artSortKey} currentDir={artSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('articles', 'lame') && (
                      <th
                        className={`py-2.5 px-3 text-center cursor-pointer select-none transition group hover:bg-slate-900 ${artSortKey === 'lame' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleArtSort('lame')}
                        onDoubleClick={() => handleArtSort('lame')}
                        title="Cliquer pour trier par Épaisseur de Lame"
                      >
                        Lame <SortIcon col="lame" currentKey={artSortKey} currentDir={artSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('articles', 'debordement') && (
                      <th
                        className={`py-2.5 px-3 text-center cursor-pointer select-none transition group hover:bg-slate-900 ${artSortKey === 'debordement' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleArtSort('debordement')}
                        onDoubleClick={() => handleArtSort('debordement')}
                        title="Cliquer pour trier par Débordement"
                      >
                        Débord. <SortIcon col="debordement" currentKey={artSortKey} currentDir={artSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('articles', 'stock_physique') && (
                      <th
                        className={`py-2.5 px-3 text-center cursor-pointer select-none transition group hover:bg-slate-900 ${artSortKey === 'stock_physique' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleArtSort('stock_physique')}
                        onDoubleClick={() => handleArtSort('stock_physique')}
                        title="Cliquer pour trier par Stock Physique"
                      >
                        Stock Phys. <SortIcon col="stock_physique" currentKey={artSortKey} currentDir={artSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('articles', 'prix_unitaire') && (
                      <th
                        className={`py-2.5 px-3 text-center cursor-pointer select-none transition group hover:bg-slate-900 ${artSortKey === 'prix_unitaire' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleArtSort('prix_unitaire')}
                        onDoubleClick={() => handleArtSort('prix_unitaire')}
                        title="Cliquer pour trier par Prix Unitaire"
                      >
                        Prix (DZD) <SortIcon col="prix_unitaire" currentKey={artSortKey} currentDir={artSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('articles', 'actions') && (
                      <th className="py-2.5 px-3 text-center w-36">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {sortedArticles.map(art => {
                    const isRowHighlighted = highlightedRowCode === art.code_art;
                    const isDeactivated = art.actif === false;

                    return (
                      <tr
                        id={`article-row-${art.code_art}`}
                        key={art.code_art}
                        className={`transition cursor-pointer ${
                          isRowHighlighted
                            ? 'bg-amber-500/25 ring-2 ring-amber-400 font-bold'
                            : isDeactivated
                            ? 'bg-rose-950/15 opacity-75 hover:bg-rose-950/30'
                            : 'hover:bg-slate-800/40'
                        }`}
                        onClick={() => handleSelectArticleRow(art)}
                      >
                        {columnConfigService.isColumnVisible('articles', 'code_art') && (
                          <td className="py-2 px-3 font-bold text-amber-300">
                            <div className="flex items-center gap-1.5">
                              <span>{art.code_art}</span>
                              {isDeactivated && (
                                <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/30 font-sans font-bold">
                                  Désactivé
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        {columnConfigService.isColumnVisible('articles', 'designation') && (
                          <td className="py-2 px-3 font-sans text-slate-200 font-medium">
                            <div className="flex items-center gap-1.5">
                              <span className={isDeactivated ? 'line-through text-slate-400' : ''}>{art.designation}</span>
                            </div>
                          </td>
                        )}
                        {columnConfigService.isColumnVisible('articles', 'longeur') && (
                          <td className="py-2 px-3 text-center text-slate-300">{art.longeur} mm</td>
                        )}
                        {columnConfigService.isColumnVisible('articles', 'lame') && (
                          <td className="py-2 px-3 text-center text-slate-400">{art.lame} mm</td>
                        )}
                        {columnConfigService.isColumnVisible('articles', 'debordement') && (
                          <td className="py-2 px-3 text-center text-slate-400">{art.debordement} mm</td>
                        )}
                        {columnConfigService.isColumnVisible('articles', 'stock_physique') && (
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              art.stock_physique <= (art.stock_min || 5)
                                ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                                : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                            }`}>
                              {art.stock_physique}
                            </span>
                          </td>
                        )}
                        {columnConfigService.isColumnVisible('articles', 'prix_unitaire') && (
                          <td className="py-2 px-3 text-center text-amber-400">{art.prix_unitaire}</td>
                        )}
                        {columnConfigService.isColumnVisible('articles', 'actions') && (
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                              {isDeactivated ? (
                                <button
                                  type="button"
                                  onClick={() => handleReactivateArticle(art.code_art)}
                                  className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-[11px] font-bold rounded flex items-center gap-1 border border-emerald-500/30 transition cursor-pointer"
                                  title="Réactiver cet article et le remettre dans le stock actif"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Réactiver</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => ouvrirOperationStock('RECEPTION', art)}
                                    className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/60 rounded"
                                    title="Réception Marchandise (+)"
                                  >
                                    <PackagePlus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => ouvrirOperationStock('SORTIE', art)}
                                    className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded"
                                    title="Sortie Manuelle (-)"
                                  >
                                    <PackageMinus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => ouvrirOperationStock('INVENTAIRE', art)}
                                    className="p-1 text-sky-400 hover:text-sky-300 hover:bg-sky-950/60 rounded"
                                    title="Inventaire & Ajustement Réel"
                                  >
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleSelectArticleRow(art)}
                                    className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded"
                                    title="Modifier la fiche"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDemandeSupprimerArticle(art.code_art)}
                                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded"
                                    title="Supprimer (ou désactiver si utilisé en commande clôturée)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2 : CHUTES */}
      {subTab === 'chutes' && (
        <div className="space-y-6">
          {/* Barre d'action Import / Export Chutes & Gestionnaire de Familles */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-950/80 border border-sky-800/60 flex items-center justify-center">
                <Layers className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Stock de Chutes par Famille de Profilés</span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-900/60 border border-sky-700/50 text-sky-300 text-[10px] font-mono font-bold">
                    {allSheets.length} familles
                  </span>
                </h4>
                <p className="text-xs text-slate-400">Consultez, ajoutez, modifiez ou supprimez les chutes et leurs familles de profilés.</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setIsManageFamiliesModalOpen(true)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 text-xs font-bold rounded-lg flex items-center gap-2 border border-amber-700/50 transition cursor-pointer shadow-sm"
                title="Créer, renommer ou supprimer des familles de chutes"
              >
                <FolderPlus className="w-4 h-4 text-amber-400" />
                <span>🗂️ Gérer les Familles ({allSheets.length})</span>
              </button>

              <button
                onClick={() => setIsImportChutesModalOpen(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>📥 Import Intelligent Chutes</span>
              </button>

              <button
                onClick={() => StorageService.exportChutesExcel(chutesBarres, chutesMaille)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-2 border border-slate-700 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>📤 Exporter .XLSX</span>
              </button>
            </div>
          </div>

          {/* Consultation et Édition des Chutes de la Famille Sélectionnée */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm text-slate-100 space-y-4">
            {/* Sélection de famille de chutes & Article associé */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300">Famille de Profilé :</span>
                  <select
                    value={selectedSheet}
                    onChange={e => setSelectedSheet(e.target.value)}
                    disabled={allSheets.length === 0}
                    className="bg-slate-950 border border-slate-700 disabled:opacity-50 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-sky-500 shadow-inner min-w-[240px]"
                  >
                    {allSheets.length === 0 ? (
                      <option value="">(Aucune famille de chutes)</option>
                    ) : (
                      allSheets.map(s => {
                        const count = s === 'MAILLE MSTQ' ? safeChutesMaille.length : (safeChutesBarres[s] || []).length;
                        return (
                          <option key={s} value={s}>
                            {s} ({count})
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>

                {mappingBySheet[selectedSheet] && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Article associé : <strong>{mappingBySheet[selectedSheet]}</strong></span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleConsoliderDoublonsChutes}
                  className="px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-indigo-200 text-xs font-bold rounded-lg flex items-center gap-1.5 border border-indigo-700/60 transition cursor-pointer shadow-sm"
                  title="Fusionner les mesures identiques en une quantité totale sans doublon"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Consolider Doublons</span>
                </button>

                <button
                  onClick={() => setIsManageFamiliesModalOpen(true)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 text-xs font-bold rounded-lg flex items-center gap-1.5 border border-amber-700/50 transition cursor-pointer"
                  title="Créer, renommer ou supprimer des familles de chutes"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>⚙️ Gestion Famille</span>
                </button>

                <ColumnCustomizerPopover tableId="chutes" />
              </div>
            </div>

            {/* Formulaire ajout rapide de chute */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  {selectedSheet === 'MAILLE MSTQ' ? 'Dimension Fixe (mm)' : 'Longueur Chute (mm)'} *
                </label>
                <input
                  type="number"
                  value={saisieChuteLongueur}
                  onChange={e => setSaisieChuteLongueur(e.target.value)}
                  placeholder="ex: 1850"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  {selectedSheet === 'MAILLE MSTQ' ? 'Nombre de Plis (ex: 57)' : "Quantité d'exemplaires"} *
                </label>
                <input
                  type="number"
                  value={saisieChuteQte}
                  onChange={e => setSaisieChuteQte(e.target.value)}
                  placeholder="1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>

              <div className="sm:col-span-3">
                <button
                  onClick={handleAjouterChute}
                  className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter Chute</span>
                </button>
              </div>
            </div>

            {/* Tableau des chutes avec édition en ligne */}
            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
                  <tr>
                    {columnConfigService.isColumnVisible('chutes', 'id') && (
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                    )}
                    {columnConfigService.isColumnVisible('chutes', 'longueur') && (
                      <th
                        className={`py-2.5 px-3 cursor-pointer select-none transition group hover:bg-slate-900 ${chuteSortKey === 'longueur' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleChuteSort('longueur')}
                        onDoubleClick={() => handleChuteSort('longueur')}
                        title="Cliquer ou double-cliquer pour trier par Longueur / Dimension"
                      >
                        {selectedSheet === 'MAILLE MSTQ' ? 'Dimension Fixe' : 'Longueur'}{' '}
                        <SortIcon col="longueur" currentKey={chuteSortKey} currentDir={chuteSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('chutes', 'quantite') && (
                      <th
                        className={`py-2.5 px-3 text-center cursor-pointer select-none transition group hover:bg-slate-900 ${chuteSortKey === 'quantite' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                        onClick={() => handleChuteSort('quantite')}
                        onDoubleClick={() => handleChuteSort('quantite')}
                        title="Cliquer ou double-cliquer pour trier par Quantité / Plis"
                      >
                        {selectedSheet === 'MAILLE MSTQ' ? 'Nombre de Plis Disponibles' : 'Quantité en Stock'}{' '}
                        <SortIcon col="quantite" currentKey={chuteSortKey} currentDir={chuteSortDir} />
                      </th>
                    )}
                    {columnConfigService.isColumnVisible('chutes', 'actions') && (
                      <th className="py-2.5 px-3 w-28 text-center">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {allSheets.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 font-sans italic text-xs">
                        Aucune famille de chutes enregistrée dans la base SQLite. Utilisez le bouton « Gérer les Familles » pour en créer une.
                      </td>
                    </tr>
                  ) : selectedSheet === 'MAILLE MSTQ' ? (
                    sortedChutesMailleList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500 font-sans italic text-xs">
                          Aucune chute de maille disponible dans cette famille.
                        </td>
                      </tr>
                    ) : (
                      sortedChutesMailleList.map((m, idx) => {
                        const chuteId = m.id || `m-${idx}-${m.dimension_fixe}`;
                        const isEditingThis = editingChuteId === chuteId;
                        return (
                          <tr key={chuteId} className="hover:bg-slate-800/30">
                            {columnConfigService.isColumnVisible('chutes', 'id') && (
                              <td className="py-2 px-3 text-center text-slate-500">{idx + 1}</td>
                            )}
                            {columnConfigService.isColumnVisible('chutes', 'longueur') && (
                              <td className="py-2 px-3 font-bold text-amber-400">
                                {isEditingThis ? (
                                  <input
                                    type="number"
                                    value={editChuteLongueur}
                                    onChange={e => setEditChuteLongueur(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveEditChute(chuteId);
                                      if (e.key === 'Escape') setEditingChuteId(null);
                                    }}
                                    className="bg-slate-950 border border-amber-500 rounded px-2 py-0.5 w-24 text-xs font-mono text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                    autoFocus
                                  />
                                ) : (
                                  `${m.dimension_fixe} mm`
                                )}
                              </td>
                            )}
                            {columnConfigService.isColumnVisible('chutes', 'quantite') && (
                              <td className="py-2 px-3 text-center">
                                {isEditingThis ? (
                                  <input
                                    type="number"
                                    value={editChuteQte}
                                    onChange={e => setEditChuteQte(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveEditChute(chuteId);
                                      if (e.key === 'Escape') setEditingChuteId(null);
                                    }}
                                    className="bg-slate-950 border border-sky-500 rounded px-2 py-0.5 w-16 text-xs font-mono text-sky-300 text-center focus:outline-none focus:ring-1 focus:ring-sky-400"
                                  />
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    <span className={`font-bold ${m.plis <= 0 ? 'text-rose-400' : 'text-sky-400'}`}>
                                      {m.plis} plis
                                    </span>
                                    {(m.plisReserve ?? 0) > 0 && (
                                      <span
                                        className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800/80 px-1.5 py-0.5 rounded font-sans font-medium"
                                        title={`🔒 ${m.plisReserve} plis réservés pour des Ordres de Fabrication en cours (Stock physique total : ${m.plisPhysique ?? (m.plis + (m.plisReserve ?? 0))} plis)`}
                                      >
                                        🔒 {m.plisReserve} rés.
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}
                            {columnConfigService.isColumnVisible('chutes', 'actions') && (
                              <td className="py-2 px-3 text-center">
                                {isEditingThis ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleSaveEditChute(chuteId)}
                                      className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                      title="Enregistrer (ou Entrée)"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingChuteId(null)}
                                      className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
                                      title="Annuler (ou Échap)"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => handleStartEditChute(chuteId, m.dimension_fixe, m.plis)}
                                      className="p-1 text-slate-400 hover:text-amber-300 cursor-pointer"
                                      title="Modifier"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleSupprimerChute(chuteId)}
                                      className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                                      title="Supprimer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )
                  ) : sortedChutesBarresList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 font-sans italic text-xs">
                        Aucune chute disponible dans la famille « {selectedSheet} ». Ajoutez une première chute ci-dessus.
                      </td>
                    </tr>
                  ) : (
                    sortedChutesBarresList.map((c, idx) => {
                      const chuteId = c.id || `c-${selectedSheet}-${idx}-${c.longueur}`;
                      const isEditingThis = editingChuteId === chuteId;
                      return (
                        <tr key={chuteId} className="hover:bg-slate-800/30">
                          {columnConfigService.isColumnVisible('chutes', 'id') && (
                            <td className="py-2 px-3 text-center text-slate-500">{idx + 1}</td>
                          )}
                          {columnConfigService.isColumnVisible('chutes', 'longueur') && (
                            <td className="py-2 px-3 font-bold text-amber-400">
                              {isEditingThis ? (
                                <input
                                  type="number"
                                  value={editChuteLongueur}
                                  onChange={e => setEditChuteLongueur(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveEditChute(chuteId);
                                    if (e.key === 'Escape') setEditingChuteId(null);
                                  }}
                                  className="bg-slate-950 border border-amber-500 rounded px-2 py-0.5 w-24 text-xs font-mono text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  autoFocus
                                />
                              ) : (
                                `${c.longueur} mm`
                              )}
                            </td>
                          )}
                          {columnConfigService.isColumnVisible('chutes', 'quantite') && (
                            <td className="py-2 px-3 text-center">
                              {isEditingThis ? (
                                <input
                                  type="number"
                                  value={editChuteQte}
                                  onChange={e => setEditChuteQte(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveEditChute(chuteId);
                                    if (e.key === 'Escape') setEditingChuteId(null);
                                  }}
                                  className="bg-slate-950 border border-emerald-500 rounded px-2 py-0.5 w-16 text-xs font-mono text-emerald-300 text-center focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                />
                              ) : (
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <span className={`font-bold ${c.quantite <= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {c.quantite}
                                  </span>
                                  {(c.reserve ?? 0) > 0 && (
                                    <span
                                      className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800/80 px-1.5 py-0.5 rounded font-sans font-medium"
                                      title={`🔒 ${c.reserve} unité(s) réservée(s) pour des Ordres de Fabrication en cours (Stock physique en atelier : ${c.quantitePhysique ?? (c.quantite + (c.reserve ?? 0))})`}
                                    >
                                      🔒 {c.reserve} rés.
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          {columnConfigService.isColumnVisible('chutes', 'actions') && (
                            <td className="py-2 px-3 text-center">
                              {isEditingThis ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleSaveEditChute(chuteId)}
                                    className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                    title="Enregistrer (ou Entrée)"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingChuteId(null)}
                                    className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
                                    title="Annuler (ou Échap)"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleStartEditChute(chuteId, c.longueur, c.quantite)}
                                    className="p-1 text-slate-400 hover:text-amber-300 cursor-pointer"
                                    title="Modifier"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleSupprimerChute(chuteId)}
                                    className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3 : MAPPING COMPLET & LIAISONS ARTICLES ↔ CHUTES */}
      {subTab === 'mapping' && (
        <div className="space-y-6">
          {/* Card Contrôles et Outils de Mapping */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm text-slate-100 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <Link className="w-4 h-4 text-emerald-400" />
                  <span>Correspondance Articles ↔ Familles de Chutes</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 text-[11px] font-mono font-bold">
                    {linkedArticlesCount} / {safeArticles.length} liés
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Associez chaque profilé du catalogue à sa famille de chutes pour permettre la réutilisation automatique lors des débits.
                </p>
              </div>

              {/* Boutons d'actions globales */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleAutoMapping}
                  className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  title="Fait correspondre strictement les profilés sans faux positifs (exclut les accessoires)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>🪄 Auto-Liaison Stricte</span>
                </button>

                <button
                  onClick={handleClearAllMappings}
                  className="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold rounded-lg flex items-center gap-1.5 border border-rose-800/50 transition cursor-pointer"
                  title="Dissocier tous les articles pour repartir à zéro"
                >
                  <Unlink className="w-3.5 h-3.5 text-rose-400" />
                  <span>🗑️ Tout Délier</span>
                </button>

                <button
                  onClick={handleResetDefaultMapping}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="Restaurer la configuration officielle recommandée"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Restaurer Défaut</span>
                </button>
              </div>
            </div>

            {/* Formulaire d'association rapide en haut */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-slate-950 p-3.5 rounded-lg border border-slate-800/80">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Sélectionner un Article du Catalogue :
                </label>
                <select
                  value={selectedArtForMapping}
                  onChange={e => {
                    const artCode = e.target.value;
                    setSelectedArtForMapping(artCode);
                    const currentMapped = mapping[artCode];
                    if (currentMapped && allSheets.includes(currentMapped)) {
                      setSelectedSheetForMapping(currentMapped);
                    } else {
                      const free = allSheets.filter(s => !mappingBySheet[s] || mappingBySheet[s] === artCode);
                      if (free.length > 0) setSelectedSheetForMapping(free[0]);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none"
                >
                  <optgroup label="⚠️ Articles Non Liés">
                    {safeArticles.filter(a => !mapping[a.code_art]).map(a => (
                      <option key={a.code_art} value={a.code_art}>
                        ⚠️ {a.code_art} — {a.designation} (Non lié)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="✅ Articles Déjà Liés">
                    {safeArticles.filter(a => mapping[a.code_art]).map(a => (
                      <option key={a.code_art} value={a.code_art}>
                        ✅ {a.code_art} — {a.designation} ➔ [{mapping[a.code_art]}]
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Associer à la Famille de Chutes :
                </label>
                <select
                  value={selectedSheetForMapping}
                  onChange={e => setSelectedSheetForMapping(e.target.value)}
                  disabled={availableSheetsForSelectedArt.length === 0}
                  className="w-full bg-slate-900 border border-slate-700 disabled:opacity-50 rounded-lg px-3 py-2 text-xs text-sky-300 font-mono font-bold focus:outline-none"
                >
                  {availableSheetsForSelectedArt.length === 0 ? (
                    <option value="">(Toutes les familles sont déjà associées)</option>
                  ) : (
                    availableSheetsForSelectedArt.map(sheet => {
                      const count = sheet === 'MAILLE MSTQ' ? safeChutesMaille.length : (safeChutesBarres[sheet] || []).length;
                      return (
                        <option key={sheet} value={sheet}>
                          {sheet} ({count} chutes)
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div className="sm:col-span-3">
                <button
                  onClick={() => handleEnregistrerMapping()}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Enregistrer Liaison</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tableau complet des Mappings avec Édition Inline Directe */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative w-72">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filtrer par code ou désignation..."
                    value={searchMapping}
                    onChange={e => setSearchMapping(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterOnlyUnmapped}
                    onChange={e => setFilterOnlyUnmapped(e.target.checked)}
                    className="rounded text-amber-500"
                  />
                  <span>Afficher uniquement les non associés ({countUnmappedArticles})</span>
                </label>
              </div>

              <div className="text-xs text-slate-400 font-mono">
                Affichage de <span className="text-amber-300 font-bold">{filteredAndSortedMappings.length}</span> / {articles.length} articles
              </div>
            </div>

            <div className="border border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
                  <tr>
                    <th
                      className={`py-2.5 px-3 w-28 cursor-pointer select-none transition group hover:bg-slate-900 ${mapSortKey === 'code_art' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                      onClick={() => handleMapSort('code_art')}
                      onDoubleClick={() => handleMapSort('code_art')}
                      title="Cliquer pour trier par Code Article"
                    >
                      Code <SortIcon col="code_art" currentKey={mapSortKey} currentDir={mapSortDir} />
                    </th>
                    <th
                      className={`py-2.5 px-3 cursor-pointer select-none transition group hover:bg-slate-900 ${mapSortKey === 'designation' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                      onClick={() => handleMapSort('designation')}
                      onDoubleClick={() => handleMapSort('designation')}
                      title="Cliquer pour trier par Désignation"
                    >
                      Désignation Article <SortIcon col="designation" currentKey={mapSortKey} currentDir={mapSortDir} />
                    </th>
                    <th className="py-2.5 px-3 min-w-[240px]">
                      Famille de Chutes Associée
                    </th>
                    <th
                      className={`py-2.5 px-3 text-center w-28 cursor-pointer select-none transition group hover:bg-slate-900 ${mapSortKey === 'stock' ? 'text-amber-300 bg-slate-900/60' : 'hover:text-amber-300'}`}
                      onClick={() => handleMapSort('stock')}
                      onDoubleClick={() => handleMapSort('stock')}
                      title="Cliquer pour trier par Stock de Chutes"
                    >
                      Stock Chutes <SortIcon col="stock" currentKey={mapSortKey} currentDir={mapSortDir} />
                    </th>
                    <th className="py-2.5 px-3 text-center w-36">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredAndSortedMappings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 font-sans italic text-xs">
                        Aucun article correspondant à vos critères de recherche.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedMappings.map(art => {
                      const sheet = mapping[art.code_art];
                      const isMaille = sheet?.toUpperCase() === 'MAILLE MSTQ';
                      const count = sheet
                        ? isMaille
                          ? safeChutesMaille.length
                          : (safeChutesBarres[sheet] || []).length
                        : 0;

                      return (
                        <tr key={art.code_art} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-3 font-bold text-amber-300">{art.code_art}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-200 font-medium">{art.designation}</td>
                          <td className="py-2.5 px-3">
                            {sheet ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-950/80 border border-sky-700/60 text-sky-300 font-mono font-bold text-xs">
                                <Link className="w-3 h-3 text-sky-400" />
                                <span>{sheet}</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 text-xs italic font-sans">— Non associé —</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            {sheet ? (
                              <span className="text-emerald-400">{count} chute(s)</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {sheet ? (
                              <button
                                onClick={() => handleSupprimerMapping(art.code_art)}
                                className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded text-xs font-semibold flex items-center gap-1 mx-auto border border-rose-800/40 transition cursor-pointer"
                                title="Dissocier cet article de sa famille de chutes"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                                <span>Délier</span>
                              </button>
                            ) : (
                              <span className="text-slate-600 font-sans text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB INVENTAIRE & AJUSTEMENTS */}
      {subTab === 'inventaire' && (
        <InventaireStockView
          articles={safeArticles}
          onStockUpdated={onStockUpdated}
          onOpenOperationModal={ouvrirOperationStock}
        />
      )}

      {/* SUBTAB 4 : HISTORIQUE MOUVEMENTS */}
      {subTab === 'historique' && (
        <div className="space-y-4">
          {/* Filtres type mouvement & recherche */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Barre de recherche instantanée */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchMvt}
                onChange={e => setSearchMvt(e.target.value)}
                placeholder="Rechercher article, BL, OF, client, date..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-mono"
              />
              {searchMvt && (
                <button
                  type="button"
                  onClick={() => setSearchMvt('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-white text-xs cursor-pointer"
                  title="Effacer la recherche"
                >
                  ✕
                </button>
              )}
            </div>

            {['TOUS', 'RECEPTION_MARCHANDISE', 'SORTIE_MANUELLE', 'SORTIE_BARRE_NEUVE', 'SORTIE_CHUTE', 'ENTREE_CHUTE', 'AJUSTEMENT_CHUTE', 'AJUSTEMENT_INVENTAIRE'].map(t => (
              <button
                key={t}
                onClick={() => setFiltreTypeMvt(t)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition border cursor-pointer ${
                  filtreTypeMvt === t
                    ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {t === 'TOUS' ? 'Tous'
                  : t === 'RECEPTION_MARCHANDISE' ? '📥 Réception Marchandise'
                  : t === 'SORTIE_MANUELLE' ? '📤 Sortie Manuelle'
                  : t === 'SORTIE_BARRE_NEUVE' ? '🔻 Sortie Barre'
                  : t === 'SORTIE_CHUTE' ? '🔻 Sortie Chute'
                  : t === 'ENTREE_CHUTE' ? '🔺 Entrée Chute'
                  : t === 'AJUSTEMENT_CHUTE' ? '✂️ Ajust. Chute'
                  : '📝 Ajust. Inventaire'}
              </button>
            ))}

            <button
              onClick={onStockUpdated}
              className="ml-auto px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualiser</span>
            </button>
          </div>

          {/* Table historique */}
          {filteredAndSortedMouvements.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
              <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-bold">Aucun mouvement trouvé</p>
              <p className="text-xs mt-1">
                {searchMvt ? 'Aucun résultat ne correspond à votre recherche.' : 'Les mouvements apparaissent ici après la clôture d\'un OF ou une réception/sortie.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-700 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-800 text-slate-300 font-bold">
                  <tr>
                    <th
                      className={`py-2 px-3 text-left border-r border-slate-700 cursor-pointer select-none transition group hover:bg-slate-700/60 ${mvtSortKey === 'date' ? 'text-amber-300 bg-slate-700/50' : 'hover:text-amber-300'}`}
                      onClick={() => handleMvtSort('date')}
                      onDoubleClick={() => handleMvtSort('date')}
                      title="Cliquer ou double-cliquer pour trier par Date"
                    >
                      Date <SortIcon col="date" currentKey={mvtSortKey} currentDir={mvtSortDir} />
                    </th>
                    <th
                      className={`py-2 px-3 text-left border-r border-slate-700 cursor-pointer select-none transition group hover:bg-slate-700/60 ${mvtSortKey === 'type' ? 'text-amber-300 bg-slate-700/50' : 'hover:text-amber-300'}`}
                      onClick={() => handleMvtSort('type')}
                      onDoubleClick={() => handleMvtSort('type')}
                      title="Cliquer ou double-cliquer pour trier par Type"
                    >
                      Type <SortIcon col="type" currentKey={mvtSortKey} currentDir={mvtSortDir} />
                    </th>
                    <th
                      className={`py-2 px-3 text-left border-r border-slate-700 cursor-pointer select-none transition group hover:bg-slate-700/60 ${mvtSortKey === 'numCommande' ? 'text-amber-300 bg-slate-700/50' : 'hover:text-amber-300'}`}
                      onClick={() => handleMvtSort('numCommande')}
                      onDoubleClick={() => handleMvtSort('numCommande')}
                      title="Cliquer ou double-cliquer pour trier par N° Commande / OF"
                    >
                      N° Commande / OF <SortIcon col="numCommande" currentKey={mvtSortKey} currentDir={mvtSortDir} />
                    </th>
                    <th
                      className={`py-2 px-3 text-left border-r border-slate-700 cursor-pointer select-none transition group hover:bg-slate-700/60 ${mvtSortKey === 'articleCode' ? 'text-amber-300 bg-slate-700/50' : 'hover:text-amber-300'}`}
                      onClick={() => handleMvtSort('articleCode')}
                      onDoubleClick={() => handleMvtSort('articleCode')}
                      title="Cliquer ou double-cliquer pour trier par Article"
                    >
                      Article <SortIcon col="articleCode" currentKey={mvtSortKey} currentDir={mvtSortDir} />
                    </th>
                    <th
                      className={`py-2 px-3 text-left border-r border-slate-700 cursor-pointer select-none transition group hover:bg-slate-700/60 ${mvtSortKey === 'nomClient' ? 'text-amber-300 bg-slate-700/50' : 'hover:text-amber-300'}`}
                      onClick={() => handleMvtSort('nomClient')}
                      onDoubleClick={() => handleMvtSort('nomClient')}
                      title="Cliquer ou double-cliquer pour trier par Client"
                    >
                      Client <SortIcon col="nomClient" currentKey={mvtSortKey} currentDir={mvtSortDir} />
                    </th>
                    <th
                      className={`py-2 px-3 text-center border-r border-slate-700 w-28 cursor-pointer select-none transition group hover:bg-slate-700/60 ${mvtSortKey === 'quantite' ? 'text-amber-300 bg-slate-700/50' : 'hover:text-amber-300'}`}
                      onClick={() => handleMvtSort('quantite')}
                      onDoubleClick={() => handleMvtSort('quantite')}
                      title="Cliquer ou double-cliquer pour trier par Quantité / Longueur"
                    >
                      Longueur / Qte <SortIcon col="quantite" currentKey={mvtSortKey} currentDir={mvtSortDir} />
                    </th>
                    <th className="py-2 px-3 text-left border-r border-slate-700">Remarque / BL</th>
                    <th className="py-2 px-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredAndSortedMouvements.map((m, idx) => (
                      <tr 
                        key={m.id} 
                        className={`${
                          m.isAnnule 
                            ? 'bg-rose-950/20 opacity-70' 
                            : idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-950/50'
                        } hover:bg-slate-800/40 transition`}
                      >
                        <td className="py-2 px-3 border-r border-slate-800 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                          {m.date}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-800 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            m.isAnnule
                              ? 'bg-slate-800 text-slate-400 border-slate-700 line-through'
                              : m.type === 'SORTIE_BARRE_NEUVE' || m.type === 'SORTIE_CHUTE' || m.type === 'SORTIE_MANUELLE' || m.type === 'SORTIE_ACCESSOIRE'
                              ? 'bg-rose-900/40 text-rose-300 border-rose-700/40'
                              : m.type === 'ENTREE_CHUTE' || m.type === 'RECEPTION_MARCHANDISE'
                              ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40'
                              : m.type === 'AJUSTEMENT_CHUTE' || m.type === 'AJUSTEMENT_INVENTAIRE'
                              ? 'bg-amber-900/40 text-amber-300 border-amber-700/40'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {m.type === 'SORTIE_BARRE_NEUVE' ? '🔻 Sortie Barre'
                              : m.type === 'SORTIE_CHUTE' ? '🔻 Sortie Chute'
                              : m.type === 'SORTIE_ACCESSOIRE' ? '🔻 Sortie Accessoire'
                              : m.type === 'SORTIE_MANUELLE' ? '📤 Sortie Manuelle'
                              : m.type === 'RECEPTION_MARCHANDISE' ? '📥 Réception'
                              : m.type === 'ENTREE_CHUTE' ? '🔺 Entrée Chute'
                              : m.type === 'AJUSTEMENT_CHUTE' ? '✂️ Ajust. Chute'
                              : '📝 Ajust. Inventaire'}
                          </span>
                        </td>
                        <td className="py-2 px-3 border-r border-slate-800 font-mono text-amber-300 font-bold whitespace-nowrap">
                          {m.numCommande || '—'}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-800 text-slate-200">
                          {m.articleCode ? (
                            <div>
                              <span className="font-mono font-bold text-amber-400/90">{m.articleCode}</span>
                              {m.designation && <span className="text-[11px] text-slate-400 ml-1.5 font-normal">({m.designation})</span>}
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-800 text-slate-300">
                          {m.nomClient || '—'}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-800 text-center font-mono font-bold text-slate-200 whitespace-nowrap">
                          <span className={m.isAnnule ? 'line-through text-slate-500' : ''}>
                            {m.longueurMm ? `${m.longueurMm} mm` : m.quantite ? `×${m.quantite}` : '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 border-r border-slate-800 text-slate-400 text-[11px]">
                          <div className="space-y-0.5">
                            {m.numBL && (
                              <div className="text-amber-300/90 font-mono text-[10px]">
                                BL: <span className="font-bold">{m.numBL}</span> {m.fournisseur && `(${m.fournisseur})`}
                              </div>
                            )}
                            <div className="truncate max-w-xs">{m.remarque || '—'}</div>
                            {m.isAnnule && (
                              <div className="text-rose-400 font-semibold text-[10px]">
                                ⚠️ Annulé : {m.motifAnnulation || 'Annulé'} ({m.dateAnnulation || ''})
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {m.isAnnule ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                                Annulé
                              </span>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMvtForEdit(m);
                                setEditMvtInitialMode('MODIFIER');
                                setIsEditMvtModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 hover:border-purple-400 transition cursor-pointer"
                              title="Modifier les détails ou la quantité de ce mouvement"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {!m.isAnnule && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMvtForEdit(m);
                                  setEditMvtInitialMode('ANNULER');
                                  setIsEditMvtModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 hover:border-rose-400 transition cursor-pointer"
                                title="Annuler ce mouvement et restituer le stock"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals Import Intelligent */}
      <ImportArticlesModal
        isOpen={isImportArticlesModalOpen}
        onClose={() => setIsImportArticlesModalOpen(false)}
        articlesExistants={articles}
        onImportComplete={onStockUpdated}
      />

      <ImportChutesModal
        isOpen={isImportChutesModalOpen}
        onClose={() => setIsImportChutesModalOpen(false)}
        chutesBarresExistantes={chutesBarres}
        chutesMailleExistantes={chutesMaille}
        onImportComplete={onStockUpdated}
      />

      {/* Modal Opérations Stock (Réception Marchandise, Sortie Manuelle, Inventaire) */}
      <OperationsStockModal
        isOpen={isOperationsModalOpen}
        initialType={operationModalType}
        initialArticle={operationModalArticle}
        articles={articles}
        chutesBarres={chutesBarres}
        suivisOF={suivisOF}
        mouvements={mouvements}
        onClose={() => {
          setIsOperationsModalOpen(false);
          setOperationModalArticle(null);
        }}
        onStockUpdated={onStockUpdated}
        onShowToast={triggerStockToast}
      />

      {/* Modal Modification / Annulation de Mouvement de Stock */}
      <ModifierMouvementModal
        isOpen={isEditMvtModalOpen}
        mouvement={selectedMvtForEdit}
        initialMode={editMvtInitialMode}
        articles={articles}
        suivisOF={suivisOF}
        onClose={() => {
          setIsEditMvtModalOpen(false);
          setSelectedMvtForEdit(null);
        }}
        onMouvementUpdated={onStockUpdated}
        onShowToast={triggerStockToast}
      />

      {/* Modal Dédiée : Gérer les Familles de Chutes */}
      {isManageFamiliesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-700/50 flex items-center justify-center">
                  <FolderPlus className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>Gestion des Familles de Chutes</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-950 border border-amber-800 text-amber-400 text-xs font-mono font-bold">
                      {allSheets.length} familles
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ajoutez, renommez ou supprimez les catégories de chutes enregistrées dans votre base SQLite.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsManageFamiliesModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps Modal */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {/* Option 1 : Création Automatique d'une Famille depuis un Article du Catalogue (Demande Utilisateur) */}
              <div className="bg-sky-950/40 p-4 rounded-xl border border-sky-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-200 flex items-center gap-1.5">
                    <Wand2 className="w-4 h-4 text-sky-400" />
                    <span>Création Automatique depuis un Article (Recommandé)</span>
                  </span>
                  <span className="text-[10px] text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
                    Auto-création & Liaison 1-clic
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Sélectionnez simplement l'article correspondant dans votre catalogue : la famille de chutes est créée automatiquement et liée à cet article.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <select
                      value={selectedArticleForNewFamily}
                      onChange={e => setSelectedArticleForNewFamily(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-500"
                    >
                      <option value="">-- Choisir l'article correspondant ({safeArticles.length} disponibles) --</option>
                      {safeArticles.map(a => (
                        <option key={a.code_art} value={a.code_art}>
                          {a.code_art} — {a.designation} {a.categorie ? `[${a.categorie}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={async () => {
                      if (!selectedArticleForNewFamily) {
                        alert('Veuillez d\'abord choisir un article dans la liste.');
                        return;
                      }
                      await handleCreerFamilleDepuisArticle(selectedArticleForNewFamily);
                      setSelectedArticleForNewFamily('');
                    }}
                    disabled={!selectedArticleForNewFamily}
                    className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer shrink-0"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Créer & Lier Automatiquement</span>
                  </button>
                </div>
              </div>

              {/* Option 2 : Formulaire de création manuelle par saisie libre */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <FolderPlus className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Ou saisie libre d'un nom de famille (ex: PRC 43, CT SOMO 25, SF 200)..."
                    value={newFamilyModalInput}
                    onChange={e => setNewFamilyModalInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newFamilyModalInput.trim()) {
                        handleCreerFamille(newFamilyModalInput);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 font-medium focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  onClick={() => handleCreerFamille(newFamilyModalInput)}
                  disabled={!newFamilyModalInput.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Créer Manuellement</span>
                </button>
              </div>

              {/* Tableau de toutes les familles */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Nom de la Famille</th>
                      <th className="py-2.5 px-3 w-32 text-center">Stock Chutes</th>
                      <th className="py-2.5 px-3">Article Lié</th>
                      <th className="py-2.5 px-3 w-36 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {allSheets.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-sans italic text-xs">
                          Aucune famille de chutes enregistrée. Créez-en une ci-dessus !
                        </td>
                      </tr>
                    ) : (
                      allSheets.map((sheet, idx) => {
                        const count = sheet === 'MAILLE MSTQ' ? safeChutesMaille.length : (safeChutesBarres[sheet] || []).length;
                        const isMaille = sheet === 'MAILLE MSTQ';
                        const linkedArtCode = mappingBySheet[sheet];
                        const linkedArt = linkedArtCode ? safeArticles.find(a => a.code_art === linkedArtCode) : null;
                        const isEditingThis = editingFamilyName === sheet;

                        return (
                          <tr key={sheet} className="hover:bg-slate-800/40 transition">
                            <td className="py-2.5 px-3 text-center text-slate-500 font-sans">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-amber-300 font-mono">
                              {isEditingThis ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingFamilyInput}
                                    onChange={e => setEditingFamilyInput(e.target.value)}
                                    className="bg-slate-950 border border-amber-500 rounded px-2 py-1 text-xs text-amber-300 font-mono font-bold"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleRenommerFamille(sheet, editingFamilyInput)}
                                    className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                                    title="Valider"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingFamilyName(null)}
                                    className="p-1 bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer"
                                    title="Annuler"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span>{sheet}</span>
                                  {isMaille && (
                                    <span className="text-[10px] font-sans px-1.5 py-0.2 bg-purple-950 text-purple-400 border border-purple-800 rounded">
                                      Fixe
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold">
                              <span className={count > 0 ? 'text-emerald-400' : 'text-slate-600'}>
                                {count} {isMaille ? 'chute(s)' : 'longueur(s)'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              {linkedArtCode ? (
                                <span className="px-2 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-800/60 text-[11px] font-medium inline-block max-w-[200px] truncate" title={`${linkedArtCode} — ${linkedArt?.designation || ''}`}>
                                  ➔ {linkedArtCode} ({linkedArt?.designation || ''})
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500 italic">Non associé</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedSheet(sheet);
                                    setSubTab('chutes');
                                    setIsManageFamiliesModalOpen(false);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded transition cursor-pointer"
                                  title="Ouvrir cette famille dans l'onglet Chutes"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>

                                {!isMaille && !isEditingThis && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingFamilyName(sheet);
                                        setEditingFamilyInput(sheet);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition cursor-pointer"
                                      title="Renommer cette famille"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleSupprimerFamille(sheet)}
                                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition cursor-pointer"
                                      title="Supprimer cette famille et ses chutes"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Toutes les modifications sont synchronisées avec la base SQLite locale.
              </span>
              <button
                onClick={() => setIsManageFamiliesModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Générique de Confirmation pour Deletion / Sauvegarde / Alertes */}
      <ConfirmationModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        type={confirmModalState.type}
        confirmLabel={confirmModalState.confirmLabel}
        cancelLabel={confirmModalState.cancelLabel}
        details={confirmModalState.details}
        isProcessing={confirmModalState.isProcessing}
        onConfirm={confirmModalState.onConfirm}
        onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
