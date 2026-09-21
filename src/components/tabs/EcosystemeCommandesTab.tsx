import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Article,
  ChuteItem,
  ChuteMaille,
  MappingChutes,
  DossierCommandeGlobal,
  StatutDossier,
  CommandeTablier,
  BesoinMoustiquaire,
  CommandeCaisson,
  CommandePrecadre,
  FigurePrecadre,
  ModeDebordementPrecadre,
  FamilleProduit,
  ResultatOptimisation,
  ClientCodification,
  ParametresOptimisationMaille,
  SuiviOF
} from '../../types';
import {
  detecterAgence,
  getTodayDateString,
  genererRepereCaissonSousFace,
  getPrefixeCommande,
  extraireNumeroSansPrefixe,
  formaterRefCommandeAvecPrefixe
} from '../../services/codificationService';
import { INITIAL_CLIENT_CODIFICATIONS } from '../../data/initialCodifications';
import { StorageService } from '../../services/storage';
import { OptimiseurCoupe1D } from '../../services/optimiseur1d';
import { logger } from '../../services/logger';
import { calculerBesoinMaille, PARAMETRES_MAILLE_DEFAUT } from '../../services/moteurMoustiquaire';
import { getDimensionsPrecadrePiece } from '../../utils/precadreCalculs';
import { DelaisProductionService } from '../../services/delaisProductionService';
import {
  trouverSousFacePourCaisson,
  optimiserListeSousFaces,
  trouverCoulissePourCadreMSTQ,
  trouverBarreInfPourCadreMSTQ,
  optimiserListeCoulissesMSTQ,
  trouverLameFinalePourTablier,
  trouverCoulissePourTablier,
  optimiserListeLamesFinales
} from '../../utils/articlePairingService';
import { VisualiseurBarres } from '../common/VisualiseurBarres';
import { OrdreFabricationModal } from '../common/OrdreFabricationModal';
import { SelecteurMode } from '../common/SelecteurMode';
import { ClientCodificationModal } from '../common/ClientCodificationModal';
import { ParametresMailleModal } from '../common/ParametresMailleModal';
import { ValidationDelaiCommandeModal } from '../common/ValidationDelaiCommandeModal';
import {
  Building2,
  Building,
  User,
  Calendar,
  Palette,
  Scissors,
  Sliders,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  FileText,
  Boxes,
  Package,
  Check,
  X,
  Play,
  RotateCcw,
  Zap,
  Tag,
  Settings2,
  ArrowDown,
  Printer,
  ChevronRight,
  Edit2,
  Save,
  FolderPlus,
  Copy,
  Clock,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Lock,
  History,
  Pause,
  TrendingUp
} from 'lucide-react';

export interface SectionMultiArticleCaisson {
  articleCode: string;
  articleDesignation: string;
  articleObj: Article | null;
  resultat: ResultatOptimisation;
  type: 'CT' | 'SF' | 'LF' | 'GL' | 'PRC' | 'CADRE';
  famille?: FamilleProduit;
  commandesInvolved?: string[];
  coloris?: string;
  avecPeinture?: boolean;
  avecSousFace?: boolean;
  montageSousFace?: string;
  avecPlaque?: boolean;
  debordement?: number;
  conditionsCoupe?: {
    longueurBarre?: number;
    epaisseurScie?: number;
    debordement?: number;
    refusMin?: number;
    refusMax?: number;
  };
}

export const getSectionFamille = (sec: SectionMultiArticleCaisson): FamilleProduit => {
  if (sec.famille) return sec.famille;
  const des = (sec.articleDesignation || '').toUpperCase();
  if (sec.type === 'PRC' || des.includes('PRÉCADRE') || des.includes('PRECADRE') || des.includes('PRC')) return 'PRECADRE';
  if (des.includes('MOUST') || des.includes('MSTQ') || des.includes('MAILLE') || des.includes('TOILE')) return 'MOUSTIQUAIRE';
  if (sec.type === 'CADRE') return (des.includes('PRÉCADRE') || des.includes('PRECADRE') || des.includes('PRC')) ? 'PRECADRE' : 'MOUSTIQUAIRE';
  if (sec.type === 'LF' || (sec.type === 'GL' && !des.includes('MSTQ')) || des.includes('TABLIER') || des.includes('LAME') || des.includes('VOLET')) return 'TABLIER';
  if (sec.type === 'CT' || sec.type === 'SF' || des.includes('CAISSON') || des.includes('TUNNEL') || des.includes('SOUS-FACE')) return 'CAISSON';
  return 'CAISSON';
};

interface EcosystemeCommandesTabProps {
  articles: Article[];
  chutesBarres: Record<string, ChuteItem[]>;
  chutesMaille: ChuteMaille[];
  mapping: MappingChutes;
  dossiers?: DossierCommandeGlobal[];
  suivisOF?: SuiviOF[];
  clientCodifications?: ClientCodification[];
  onDossiersUpdated?: () => void;
  onNavigateToTab: (tabId: string, initialData?: any) => void;
  selectedDossierToLoad?: DossierCommandeGlobal | null;
  onClearSelectedDossier?: () => void;
}

export const EcosystemeCommandesTab: React.FC<EcosystemeCommandesTabProps> = ({
  articles = [],
  chutesBarres = {},
  chutesMaille = [],
  mapping = {},
  dossiers = [],
  suivisOF: suivisOFProp = [],
  clientCodifications: clientCodificationsProp,
  onDossiersUpdated,
  onNavigateToTab,
  selectedDossierToLoad,
  onClearSelectedDossier
}) => {
  const [localArticlesOverrides, setLocalArticlesOverrides] = useState<Article[] | null>(null);
  const safeArticles = useMemo(() => {
    if (localArticlesOverrides) return localArticlesOverrides;
    return Array.isArray(articles) ? articles : [];
  }, [articles, localArticlesOverrides]);

  useEffect(() => {
    setLocalArticlesOverrides(null);
  }, [articles]);

  const editorRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // GESTION DYNAMIQUE DES CODIFICATIONS CLIENTS & PRÉFIXES D'AGENCE
  // =========================================================================
  const [clientCodifications, setClientCodifications] = useState<ClientCodification[]>(() => {
    if (clientCodificationsProp && clientCodificationsProp.length > 0) return clientCodificationsProp;
    return INITIAL_CLIENT_CODIFICATIONS;
  });
  const [modalCodificationOpen, setModalCodificationOpen] = useState<boolean>(false);

  useEffect(() => {
    if (clientCodificationsProp && clientCodificationsProp.length > 0) {
      setClientCodifications(clientCodificationsProp);
    }
  }, [clientCodificationsProp]);

  useEffect(() => {
    const loadCodifs = async () => {
      try {
        const loaded = await StorageService.getClientCodifications();
        if (loaded && loaded.length > 0) {
          setClientCodifications(loaded);
        }
      } catch (e) {
        console.error('Erreur chargement codifications:', e);
      }
    };
    loadCodifs();
  }, []);

  const handleSaveCodifications = async (updated: ClientCodification[]) => {
    setClientCodifications(updated);
    await StorageService.saveClientCodifications(updated);
    if (onDossiersUpdated) onDossiersUpdated();
    showFlashNotification('✓ Codifications clients sauvegardées avec succès !', 'success');
  };

  const handleUpsertCodification = async (codif: ClientCodification) => {
    const exists = clientCodifications.some(c => c.id === codif.id);
    let updated: ClientCodification[];
    if (exists) {
      updated = clientCodifications.map(c => c.id === codif.id ? codif : c);
    } else {
      updated = [...clientCodifications, codif];
    }
    setClientCodifications(updated);
    await StorageService.upsertClientCodification(codif);
    if (onDossiersUpdated) onDossiersUpdated();
    showFlashNotification(`✓ Codification "${codif.nom}" mise à jour !`, 'success');
  };

  const handleDeleteCodification = async (id: string) => {
    const updated = clientCodifications.filter(c => c.id !== id);
    setClientCodifications(updated);
    await StorageService.deleteClientCodification(id);
    if (onDossiersUpdated) onDossiersUpdated();
    showFlashNotification('✓ Codification supprimée.', 'warn');
  };

  // =========================================================================
  // EN-TÊTE FIXE DU HAUT (MON CLIENT, CLIENT DE MON CLIENT, DATE)
  // Valeurs propres et vierges par défaut — zéro brouillon fantôme
  // =========================================================================
  const [monClient, setMonClient] = useState<string>('');
  const [clientDeMonClient, setClientDeMonClient] = useState<string>('');
  const [dateCommande, setDateCommande] = useState<string>(() => getTodayDateString());

  // --- MÉMOIRE INCRÉMENTALE & SUGGESTIONS DU CLIENT DU CLIENT (CHANTIER / PROMOTEUR) ---
  const [showClientSuggestions, setShowClientSuggestions] = useState<boolean>(false);
  const clientSuggestionsRef = useRef<HTMLDivElement>(null);

  // Historique unifié (Dossiers SQLite + Mémoire incrémentale persistée dans localStorage)
  const clientsHistoriqueComplet = useMemo(() => {
    const map = new Map<string, { nom: string; donneurOrdre: string; derniereDate: string; nb: number }>();

    // 1. Depuis les dossiers existants dans SQLite
    (dossiers || []).forEach(d => {
      const nom = (d.nomClientFinal || '').trim();
      if (!nom) return;
      const key = nom.toUpperCase();
      const existing = map.get(key);
      if (existing) {
        existing.nb += 1;
        if (d.dateCommande) existing.derniereDate = d.dateCommande;
        if (!existing.donneurOrdre && d.donneurOrdre) existing.donneurOrdre = d.donneurOrdre;
      } else {
        map.set(key, {
          nom: nom,
          donneurOrdre: d.donneurOrdre || '',
          derniereDate: d.dateCommande || '',
          nb: 1
        });
      }
    });

    // 2. Depuis le stockage local de persistance incrémentale
    try {
      const raw = localStorage.getItem('3m_clients_finaux_incremental');
      if (raw) {
        const storedList = JSON.parse(raw);
        if (Array.isArray(storedList)) {
          storedList.forEach((item: any) => {
            const nom = (item.nom || '').trim();
            if (!nom) return;
            const key = nom.toUpperCase();
            const existing = map.get(key);
            if (existing) {
              existing.nb = Math.max(existing.nb, item.nb || 1);
              if (item.donneurOrdre && !existing.donneurOrdre) existing.donneurOrdre = item.donneurOrdre;
            } else {
              map.set(key, {
                nom: nom,
                donneurOrdre: item.donneurOrdre || '',
                derniereDate: item.derniereDate || '',
                nb: item.nb || 1
              });
            }
          });
        }
      }
    } catch (e) {}

    return Array.from(map.values()).sort((a, b) => b.nb - a.nb || a.nom.localeCompare(b.nom));
  }, [dossiers]);

  // Sécurité anti-perte absolue : Donneurs d'ordre trouvés dans les dossiers existants mais pas encore codifiés
  const clientsDossiersNonCodifies = useMemo(() => {
    const codifies = new Set(clientCodifications.map(c => c.nom.trim().toUpperCase()));
    const nonCodifies = new Set<string>();
    (dossiers || []).forEach(d => {
      const nom = (d.donneurOrdre || '').trim();
      if (nom && !codifies.has(nom.toUpperCase())) {
        nonCodifies.add(nom);
      }
    });
    return Array.from(nonCodifies).sort();
  }, [dossiers, clientCodifications]);

  // Filtrer les suggestions selon la saisie en cours (ne pas afficher tant que l'utilisateur n'a pas commencé à saisir)
  const suggestionsClientsFiltrees = useMemo(() => {
    const q = clientDeMonClient.trim().toLowerCase();
    if (!q) {
      return []; // N'affiche rien avant le début de la saisie
    }
    return clientsHistoriqueComplet
      .filter(c => c.nom.toLowerCase().includes(q))
      .slice(0, 12);
  }, [clientsHistoriqueComplet, clientDeMonClient]);

  // Enregistrer le client dans la mémoire incrémentale persistante
  const enregistrerClientDansHistoriqueIncremental = useCallback((nomClient: string, donneur: string) => {
    const propre = nomClient.trim();
    if (!propre) return;
    try {
      const raw = localStorage.getItem('3m_clients_finaux_incremental');
      let list: any[] = [];
      if (raw) {
        try { list = JSON.parse(raw); } catch (e) { list = []; }
      }
      if (!Array.isArray(list)) list = [];
      const index = list.findIndex(i => (i.nom || '').toUpperCase().trim() === propre.toUpperCase());
      if (index >= 0) {
        list[index].nb = (list[index].nb || 1) + 1;
        list[index].derniereDate = getTodayDateString();
        if (donneur) list[index].donneurOrdre = donneur;
      } else {
        list.push({
          nom: propre,
          donneurOrdre: donneur || '',
          derniereDate: getTodayDateString(),
          nb: 1
        });
      }
      localStorage.setItem('3m_clients_finaux_incremental', JSON.stringify(list));
    } catch (e) {}
  }, []);

  const handleSelectClientSuggestion = (suggestion: { nom: string; donneurOrdre: string }) => {
    setClientDeMonClient(suggestion.nom);
    setShowClientSuggestions(false);
    if ((!monClient || !monClient.trim()) && suggestion.donneurOrdre) {
      handleMonClientChange(suggestion.donneurOrdre);
    }
  };

  // ID du dossier en cours d'édition (null si nouveau dossier)
  const [editingDossierId, setEditingDossierId] = useState<string | null>(null);

  // Mode saisie actif
  const [modeSaisieActif, setModeSaisieActif] = useState<boolean>(true);

  // =========================================================================
  // ÉTAT DE LA COMMANDE EN COURS DE SAISIE (UN NUMÉRO DISTINCT PAR FAMILLE)
  // =========================================================================
  const [numCommandeCaisson, setNumCommandeCaisson] = useState<string>('');
  const [numCommandeSousFace, setNumCommandeSousFace] = useState<string>('');
  const [numCommandeTablier, setNumCommandeTablier] = useState<string>('');
  const [numCommandeMoustiquaire, setNumCommandeMoustiquaire] = useState<string>('');
  const [numCommandePrecadre, setNumCommandePrecadre] = useState<string>('');

  const [familleArticle, setFamilleArticle] = useState<FamilleProduit>('CAISSON');

  // Préfixe de commande officiel de l'agence sélectionnée
  const currentPrefix = useMemo(() => {
    return getPrefixeCommande(monClient, clientCodifications);
  }, [monClient, clientCodifications]);

  // Helpers pour accéder / modifier le N° de commande de la famille active
  const getActiveNumCommande = (): string => {
    if (familleArticle === 'CAISSON') return numCommandeCaisson;
    if (familleArticle === 'TABLIER') return numCommandeTablier;
    if (familleArticle === 'MOUSTIQUAIRE') return numCommandeMoustiquaire;
    if (familleArticle === 'PRECADRE') return numCommandePrecadre;
    return '';
  };

  const setActiveNumCommande = (val: string) => {
    const sansPref = extraireNumeroSansPrefixe(val, clientCodifications);
    const formatted = sansPref ? `${currentPrefix}${sansPref}` : '';
    if (familleArticle === 'CAISSON') setNumCommandeCaisson(formatted);
    else if (familleArticle === 'TABLIER') setNumCommandeTablier(formatted);
    else if (familleArticle === 'MOUSTIQUAIRE') setNumCommandeMoustiquaire(formatted);
    else if (familleArticle === 'PRECADRE') setNumCommandePrecadre(formatted);
  };

  const numCommande = getActiveNumCommande();
  const [filterCmdActive, setFilterCmdActive] = useState<string>('TOUTES');

  // =========================================================================
  // VÉRIFICATION D'UNICITÉ DU NUMÉRO DE COMMANDE (À LA SAISIE ET VALIDATION)
  // =========================================================================
  interface InfoConflitNumCommande {
    numEnConflit: string;
    nomClientFinal: string;
    donneurOrdre?: string;
    dateCommande?: string;
    dossierId: string;
    statut?: string;
  }

  const verifierUniciteNumeroCommande = useCallback((
    numATester: string,
    dossierExcluId: string | null = editingDossierId
  ): InfoConflitNumCommande | null => {
    if (!numATester || !numATester.trim()) return null;

    const rawClean = numATester.trim().toUpperCase().replace(/\s+/g, '');
    const sansPref = extraireNumeroSansPrefixe(numATester, clientCodifications).trim().toUpperCase();

    if (!sansPref && !rawClean) return null;

    for (const d of (dossiers || [])) {
      if (dossierExcluId && d.id === dossierExcluId) continue;

      // Références associées au dossier d
      const refsDossier: string[] = [
        d.refCommande,
        d.numCommandeCaisson,
        d.numCommandeSousFace,
        d.numCommandeTablier,
        d.numCommandeMoustiquaire,
        d.numCommandePrecadre,
        ...(d.articlesCaissons || []).map(c => c.refCommande),
        ...(d.articlesCaissons || []).map(c => c.sfRefCommande),
        ...(d.articlesTabliers || []).map(t => t.refCommande),
        ...(d.articlesMoustiquaires || []).map(m => m.refCommande),
        ...(d.articlesPrecadres || []).map(p => p.refCommande)
      ].filter(Boolean) as string[];

      for (const ref of refsDossier) {
        if (!ref || !ref.trim()) continue;
        const refClean = ref.trim().toUpperCase().replace(/\s+/g, '');
        const refSansPref = extraireNumeroSansPrefixe(ref, clientCodifications).trim().toUpperCase();

        // Conflit direct sur la chaîne exacte
        if (rawClean === refClean) {
          return {
            numEnConflit: ref,
            nomClientFinal: d.nomClientFinal || d.donneurOrdre || 'Client',
            donneurOrdre: d.donneurOrdre,
            dateCommande: d.dateCommande,
            dossierId: d.id,
            statut: d.statut
          };
        }

        // Conflit sur les chiffres significatifs du numéro pour le même donneur d'ordre ou globalement
        if (sansPref && refSansPref && sansPref === refSansPref) {
          const memeDonneur = !d.donneurOrdre || !monClient || d.donneurOrdre.trim().toUpperCase() === monClient.trim().toUpperCase();
          if (memeDonneur) {
            return {
              numEnConflit: ref,
              nomClientFinal: d.nomClientFinal || d.donneurOrdre || 'Client',
              donneurOrdre: d.donneurOrdre,
              dateCommande: d.dateCommande,
              dossierId: d.id,
              statut: d.statut
            };
          }
        }
      }
    }

    return null;
  }, [dossiers, editingDossierId, clientCodifications, monClient]);

  // Conflit sur le numéro de commande en cours de saisie pour l'onglet actif
  const conflitNumCmdActif = useMemo(() => {
    const currentNum = getActiveNumCommande();
    return verifierUniciteNumeroCommande(currentNum);
  }, [getActiveNumCommande, verifierUniciteNumeroCommande]);

  // =========================================================================
  // 4. CONDITIONS & EXIGENCES PAR DÉFAUT (RÈGLES D'HÉRITAGE EN HAUT)
  // =========================================================================
  // Filtrer STRICTEMENT les Caissons Tunnel (CT) - AUCUNE Sous-Face, aucun précadre
  const articlesCT = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      const isSF = d.startsWith('SF') || d.includes('SOUS-FACE') || d.includes('SOUS FACE') || d.includes('CH SF');
      const isPrecadre = d.includes('PRECADRE') || d.includes('CADRE') || d.includes('TUBULAIRE');
      const isTablier = d.includes('TAB') || d.includes('LAME') || d.includes('COULISSE') || d.includes('TBL') || d.includes('BAR COULIS');
      const isCT = d.startsWith('CT') || d.startsWith('CAISSON TUNNEL') || (d.includes('CAISSON') && !isSF);
      return isCT && !isSF && !isPrecadre && !isTablier;
    });
  }, [articles]);

  // Filtrer STRICTEMENT les Sous-Faces (SF) - AUCUN Caisson Tunnel CT
  const articlesSF = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      const isCT = d.startsWith('CT ') || d.startsWith('CAISSON TUNNEL');
      const isSF = d.startsWith('SF') || d.includes('SOUS-FACE') || d.includes('SOUS FACE') || d.includes('CH SF');
      return isSF && !isCT;
    });
  }, [articles]);

const getHauteurLameTablier = (code?: string, desig?: string, fallbackHauteur?: number): number => {
  const str = `${code || ''} ${desig || ''}`.toUpperCase();
  if (str.includes('55') || code === 'ART0048' || code === 'ART0046') {
    return 55;
  }
  if (str.includes('43') || str.includes('40') || code === 'ART0040' || code === 'ART0045' || code === 'ART0047') {
    return 43;
  }
  if (fallbackHauteur && fallbackHauteur > 0 && fallbackHauteur <= 60 && fallbackHauteur !== 45) {
    return fallbackHauteur;
  }
  return 43;
};

  // Filtrer les Lames de Tablier (TBL)
  const articlesTablier = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return (d.includes('TAB') || d.includes('TBL') || d.includes('LAME TABLIER')) && !d.includes('FINALE');
    });
  }, [articles]);

  // Filtrer les Lames Finales (LF)
  const articlesLameFinale = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return d.includes('FINALE') || d.includes('LAME FINALE') || d.includes('SEUIL');
    });
  }, [articles]);

  // Filtrer les Coulisses (GL) pour Volet
  const articlesCoulisses = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return (d.includes('COULISSE') || d.includes('COULIS') || d.includes('BAR COULIS')) && !d.includes('MSTQ') && !d.includes('MOUSTIQUAIRE');
    });
  }, [articles]);

  // Filtrer les Profilés Précadres (PRC / Dormants)
  const articlesPrecadre = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return (d.includes('PRECADRE') || d.includes('PRC') || d.includes('DORMANT') || d.startsWith('CADRE')) && !d.includes('BOUCHON') && !d.includes('MSTQ') && !d.includes('MOUSTIQUAIRE');
    });
  }, [articles]);

  // Filtrer les Articles Bouchons Précadre (Bouchon 90° Plastique)
  const articlesBouchonPrecadre = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return d.includes('BOUCHON') && (d.includes('PRECADRE') || d.includes('PRC') || d.includes('43') || d.includes('55') || d.includes('DORMANT'));
    });
  }, [articles]);

  // Articles Moustiquaire filtrés par catégorie depuis le stock réel (Champs Exclusifs)
  const articlesMailleMSTQ = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return (d.includes('MAILLE') || d.includes('TOILE') || d.includes('PLISS')) && !d.includes('PROFILÉ CADRE') && !d.includes('PRÉCADRE');
    });
  }, [articles]);

  const articlesCadreMSTQ = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return (d.includes('CADRE MSTQ') || d.includes('MSTQ CADRE') || (d.includes('CADRE') && d.includes('MSTQ'))) && !d.includes('COULISSE') && !d.includes('INFERIEURE');
    });
  }, [articles]);

  const articlesCoulisseMSTQ = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return (d.includes('COULISSE MSTQ') || d.includes('MSTQ COULISSE') || (d.includes('COULISSE') && d.includes('MSTQ'))) && !d.includes('GL ') && !d.includes('PRÉCADRE');
    });
  }, [articles]);

  const articlesBarreInfMSTQ = useMemo(() => {
    return articles.filter(a => {
      const d = a.designation.toUpperCase().trim();
      return (d.includes('INFERIEURE MSTQ') || d.includes('MSTQ BARRE INF') || d.includes('MSTQ INFERIEURE') || (d.includes('BARRE INFERIEURE') && d.includes('MSTQ')));
    });
  }, [articles]);

  // --- ÉTATS POUR LA DÉCOUPE & OPTIMISATION DÉDIÉE CAISSON & SOUS-FACE ---
  const [resultatDebitCT, setResultatDebitCT] = useState<ResultatOptimisation | null>(null);
  const [sectionsMultiCaisson, setSectionsMultiCaisson] = useState<SectionMultiArticleCaisson[]>([]);
  const [modalDebitCaissonOpen, setModalDebitCaissonOpen] = useState<boolean>(false);
  const [modalOFDebitCaissonOpen, setModalOFDebitCaissonOpen] = useState<boolean>(false);
  const [optMode, setOptMode] = useState<'matiere' | 'temps'>('matiere');
  const [poidsTemps, setPoidsTemps] = useState<number>(5.0);
  const [showAllModalDetails, setShowAllModalDetails] = useState<boolean>(false);
  const [expandedModalSections, setExpandedModalSections] = useState<Record<number, boolean>>({});

  // --- ÉTAT DE PROGRESSION DE L'OPTIMISATION (BARRE DE PROGRESSION & ANTI-BLOCAGE) ---
  const [optProgress, setOptProgress] = useState<{
    active: boolean;
    percent: number;
    currentTask: string;
    sectionName: string;
  } | null>(null);

  // --- ÉTATS POUR L'OPTIMISATION DÉDIÉE MOUSTIQUAIRE ---
  const [sectionsMultiMSTQ, setSectionsMultiMSTQ] = useState<SectionMultiArticleCaisson[]>([]);
  const [modalDebitMSTQOpen, setModalDebitMSTQOpen] = useState<boolean>(false);
  const [modalOFDebitMSTQOpen, setModalOFDebitMSTQOpen] = useState<boolean>(false);

  // OPTIMISATION STRICTE PAR CODE ARTICLE : CAISSONS TUNNEL (CT) & SOUS-FACES (SF)
  const handleOptimiserCaissonsEtSousFaces = (cibleRef?: string | string[]) => {
    let sourceLines = lignesCaissons;
    if (cibleRef) {
      const allowedRefs = Array.isArray(cibleRef) ? cibleRef : [cibleRef];
      sourceLines = lignesCaissons.filter(c => allowedRefs.includes((c.refCommande || numCommandeCaisson || '').trim()));
    }

    if (sourceLines.length === 0) {
      showFlashNotification('Veuillez saisir au moins une ligne de caisson avant de lancer la découpe.', 'warn');
      return;
    }

    const refsInvolved = Array.from(new Set(sourceLines.map(c => (c.refCommande || numCommandeCaisson || '').trim()).filter(Boolean)));
    const refTitre = refsInvolved.length > 0 ? refsInvolved.join(', ') : (numCommande.trim() || 'CMD-01');

    // Réinitialiser le masquage des détails par défaut pour ne pas encombrer l'écran
    setShowAllModalDetails(false);
    setExpandedModalSections({});

    const generatedSections: SectionMultiArticleCaisson[] = [];

    // 1. Groupement des Caissons Tunnel (CT) PAR CODE ARTICLE (exclure strictement les sous-faces seules)
    const groupsCT = new Map<string, CommandeCaisson[]>();
    for (const ligne of sourceLines) {
      if (ligne.isSousFaceSeule || ligne.typePrestation === 'SOUS_FACE_SEULE') continue;
      const code = ligne.articleCode || caissonConfig.ctArticleCode;
      if (!groupsCT.has(code)) groupsCT.set(code, []);
      groupsCT.get(code)!.push(ligne);
    }

    groupsCT.forEach((lignesGroup, artCode) => {
      const artObj = safeArticles.find(a => a.code_art === artCode) || articlesCT.find(a => a.code_art === artCode) || articlesCT[0];
      const mappedSheetName = mapping[artObj.code_art] || null;
      const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];

      // Les paramètres techniques saisis dans le panneau (ctTechParams) ne doivent s'appliquer
      // QUE si l'article actuellement affiché dans le panneau est bien celui de CE groupe.
      // Sinon on prend systématiquement les valeurs de l'article réel (BDD) : fiabilité garantie
      // même quand la commande mélange plusieurs codes articles caisson.
      const ctParamsApplicables = caissonConfig.ctArticleCode === artObj.code_art;
      const longBarre = (ctParamsApplicables && ctTechParams.longeur > 0) ? ctTechParams.longeur : (artObj.longeur || 6500);
      const epScie = (ctParamsApplicables && ctTechParams.lame > 0) ? ctTechParams.lame : (artObj.lame || 4.5);
      const debord = (ctParamsApplicables && ctTechParams.debordement !== undefined && ctTechParams.debordement !== null) ? ctTechParams.debordement : (artObj.debordement || 0);
      const rMin = (ctParamsApplicables && ctTechParams.refus_min > 0) ? ctTechParams.refus_min : (artObj.refus_min && artObj.refus_min > 0 ? artObj.refus_min : 500);
      const rMax = (ctParamsApplicables && ctTechParams.refus_max > 0) ? ctTechParams.refus_max : (artObj.refus_max && artObj.refus_max > 0 ? artObj.refus_max : 1100);

      const opt = new OptimiseurCoupe1D({
        longueurBarre: longBarre,
        epaisseurScie: epScie,
        refusMin: rMin,
        refusMax: rMax,
        mode: optMode,
        poidsTemps: poidsTemps
      });

      const piecesToCut = lignesGroup.map(c => {
        const cmdTag = (c.refCommande || numCommandeCaisson || '').trim();
        return {
          longueur: c.longueur + debord,
          quantite: c.quantite,
          label: `${c.repere} (${artObj.designation})${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
          repere: c.repere,
          refCommande: cmdTag || 'CMD-01'
        };
      });

      const res = opt.optimiser(piecesToCut, availableChutes);
      res.articleCode = artObj.code_art;
      res.articleDesignation = artObj.designation;
      res.refCommande = refTitre;
      res.nomClient = clientDeMonClient.trim() || 'CLIENT';
      res.donneurOrdre = monClient;
      res.dateCommande = dateCommande;
      // Agréger avecPeinture : true si AU MOINS une ligne du groupe demande la peinture
      const avecPeintureCT = lignesGroup.some(c => c.avecPeinture);
      // Agréger avecSousFace et montageSousFace pour info OF
      const avecSousFaceCT = lignesGroup.some(c => c.avecSousFace);
      const montageCT = lignesGroup.some(c => c.montageSousFace === 'MONTEE_ATELIER') ? 'MONTEE_ATELIER' : 'NON_MONTEE';
      const avecPlaqueCT = lignesGroup.some(c => c.avecPlaque !== undefined ? c.avecPlaque : caissonConfig.avecPlaque);

      const conditionsCoupeCT = {
        longueurBarre: longBarre,
        epaisseurScie: epScie,
        debordement: debord,
        refusMin: rMin,
        refusMax: rMax
      };

      generatedSections.push({
        articleCode: artObj.code_art,
        articleDesignation: artObj.designation,
        articleObj: artObj,
        resultat: res,
        type: 'CT',
        famille: 'CAISSON',
        commandesInvolved: refsInvolved,
        avecPeinture: avecPeintureCT,
        avecSousFace: avecSousFaceCT,
        montageSousFace: montageCT,
        avecPlaque: avecPlaqueCT,
        debordement: debord,
        conditionsCoupe: conditionsCoupeCT
      });
    });

    // 2. Groupement des Sous-Faces (SF) PAR CODE ARTICLE (pour les lignes avec SF active ou SF seule, excluant caisson seul)
    const lignesAvecSF = sourceLines.filter(c =>
      c.typePrestation !== 'CAISSON_SEUL' && (c.avecSousFace || c.isSousFaceSeule || c.typePrestation === 'SOUS_FACE_SEULE')
    );
    const groupsSF = new Map<string, CommandeCaisson[]>();
    for (const ligne of lignesAvecSF) {
      const code = ligne.sfArticleCode || caissonConfig.sfArticleCode;
      if (!groupsSF.has(code)) groupsSF.set(code, []);
      groupsSF.get(code)!.push(ligne);
    }

    groupsSF.forEach((lignesGroup, sfCode) => {
      const sfObj = safeArticles.find(a => a.code_art === sfCode) || articlesSF.find(a => a.code_art === sfCode) || articlesSF[0];
      const mappedSheetName = mapping[sfObj.code_art] || null;
      const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];

      const sfParamsApplicables = caissonConfig.sfArticleCode === sfObj.code_art;
      const longBarreSF = (sfParamsApplicables && sfTechParams.longeur > 0) ? sfTechParams.longeur : (sfObj.longeur || 6000);
      const epScieSF = (sfParamsApplicables && sfTechParams.lame > 0) ? sfTechParams.lame : (sfObj.lame || 4.5);
      const debordSF = (sfParamsApplicables && sfTechParams.debordement !== undefined && sfTechParams.debordement !== null) ? sfTechParams.debordement : (sfObj.debordement || 0);
      const rMinSF = (sfParamsApplicables && sfTechParams.refus_min > 0) ? sfTechParams.refus_min : (sfObj.refus_min && sfObj.refus_min > 0 ? sfObj.refus_min : 300);
      const rMaxSF = (sfParamsApplicables && sfTechParams.refus_max > 0) ? sfTechParams.refus_max : (sfObj.refus_max && sfObj.refus_max > 0 ? sfObj.refus_max : 500);

      const refsSFInvolved = Array.from(new Set(lignesGroup.map(c => (c.sfRefCommande || numCommandeSousFace || c.refCommande || numCommandeCaisson || '').trim()).filter(Boolean)));
      const refTitreSF = refsSFInvolved.length > 0 ? refsSFInvolved.join(', ') : (numCommandeSousFace.trim() || refTitre || 'CMD-01');

      const opt = new OptimiseurCoupe1D({
        longueurBarre: longBarreSF,
        epaisseurScie: epScieSF,
        refusMin: rMinSF,
        refusMax: rMaxSF,
        mode: optMode,
        poidsTemps: poidsTemps
      });

      const piecesToCut = lignesGroup.map((c, i) => {
        // La sous-face doit porter rigoureusement le MÊME repère que le caisson pour que l'opérateur sache immédiatement à quel caisson elle appartient
        const repSF = (c.repere || '').trim() || `C-${i + 1}`;
        const cmdTag = (c.sfRefCommande || numCommandeSousFace || c.refCommande || numCommandeCaisson || '').trim();
        return {
          longueur: c.longueur + debordSF,
          quantite: c.quantite,
          label: `${repSF} (${sfObj.designation})${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
          repere: repSF,
          refCommande: cmdTag || 'CMD-01'
        };
      });

      const res = opt.optimiser(piecesToCut, availableChutes);
      res.articleCode = sfObj.code_art;
      res.articleDesignation = sfObj.designation;
      res.refCommande = refTitreSF;
      res.nomClient = clientDeMonClient.trim() || 'CLIENT';
      res.donneurOrdre = monClient;
      res.dateCommande = dateCommande;

      const conditionsCoupeSF = {
        longueurBarre: longBarreSF,
        epaisseurScie: epScieSF,
        debordement: debordSF,
        refusMin: rMinSF,
        refusMax: rMaxSF
      };

      generatedSections.push({
        articleCode: sfObj.code_art,
        articleDesignation: sfObj.designation,
        articleObj: sfObj,
        resultat: res,
        type: 'SF',
        famille: 'CAISSON',
        commandesInvolved: refsSFInvolved.length > 0 ? refsSFInvolved : refsInvolved,
        debordement: debordSF,
        conditionsCoupe: conditionsCoupeSF
      });
    });

    setMultiOptActiveRefs(refsInvolved.length > 0 ? refsInvolved : [numCommande.trim() || 'CMD-01']);
    setMultiOptFamilyFilter('ALL');
    setSectionsMultiCaisson(generatedSections);
    setModalDebitCaissonOpen(true);
  };

  // --- A. CAISSON & SOUS-FACE (HÉRITAGE EN HAUT) ---
  const [caissonConfig, setCaissonConfig] = useState(() => {
    const defaultClient = INITIAL_CLIENT_CODIFICATIONS[0]?.nom || '';
    const upper = defaultClient.toUpperCase();
    const isCristalAlgerOuCne = upper.includes('CRISTAL ALGER') || upper.includes('CRISTAL-ALGER') || 
                               upper.includes('CRISTAL CONST') || upper.includes('CRISTAL CNE') || upper.includes('CRISTAL-CONST');
    const firstCodif = INITIAL_CLIENT_CODIFICATIONS[0];
    const defPeinture = firstCodif?.peintureParDefaut !== undefined ? firstCodif.peintureParDefaut : isCristalAlgerOuCne;
    const defMontage = firstCodif?.montageSousFaceParDefaut !== false ? 'MONTEE_ATELIER' : 'NON_MONTEE';
    const defPlaque = firstCodif?.avecPlaqueParDefaut ?? false;

    return {
      typeCommande: 'CAISSON_ET_SOUS_FACE' as 'CAISSON_ET_SOUS_FACE' | 'CAISSON_SEUL' | 'SOUS_FACE_SEULE',
      ctArticleCode: '',
      typeCaisson: 'TUNNEL_SIMPLE' as 'TUNNEL_SIMPLE' | 'EXTERIEUR',
      avecSousFace: true,
      sfArticleCode: '',
      montageSousFace: defMontage as 'MONTEE_ATELIER' | 'NON_MONTEE',
      avecPeinture: defPeinture,
      avecPlaque: defPlaque
    };
  });

  // Objets d'articles réels dérivés en direct de la base SQLite
  const currentCTArticle = useMemo(() => {
    return articlesCT.find(a => a.code_art === caissonConfig.ctArticleCode) || null;
  }, [articlesCT, caissonConfig.ctArticleCode]);

  const currentSFArticle = useMemo(() => {
    return articlesSF.find(a => a.code_art === caissonConfig.sfArticleCode) || null;
  }, [articlesSF, caissonConfig.sfArticleCode]);

  // --- B. TABLIER / VOLET ROULANT ---
  const [tablierConfig, setTablierConfig] = useState({
    typeFabrication: 'TABLIER_SEUL' as 'TABLIER_SEUL' | 'VOLET_COMPLET',
    avecLameFinale: false,
    hauteurLame: 43,
    articleCode: '',
    lfArticleCode: '',
    glArticleCode: ''
  });

  const currentTBLArticle = useMemo(() => {
    return articlesTablier.find(a => a.code_art === tablierConfig.articleCode) || null;
  }, [articlesTablier, tablierConfig.articleCode]);

  const currentLFArticle = useMemo(() => {
    return articlesLameFinale.find(a => a.code_art === tablierConfig.lfArticleCode) || null;
  }, [articlesLameFinale, tablierConfig.lfArticleCode]);

  const currentGLArticle = useMemo(() => {
    return articlesCoulisses.find(a => a.code_art === tablierConfig.glArticleCode) || null;
  }, [articlesCoulisses, tablierConfig.glArticleCode]);

  // --- D. PRÉCADRE ---
  const [precadreConfig, setPrecadreConfig] = useState({
    figure: 'VIDE' as FigurePrecadre,
    modeDebordement: 'SUPERIEUR_INFERIEUR' as ModeDebordementPrecadre,
    debordementSuperieur: 100,
    debordementInferieur: 300,
    typeCoupe: '90' as '45' | '90',
    articleCode: '',
    bouchonArticleCode: ''
  });

  const currentPRCArticle = useMemo(() => {
    return articlesPrecadre.find(a => a.code_art === precadreConfig.articleCode) || null;
  }, [articlesPrecadre, precadreConfig.articleCode]);

  const currentBouchonArticle = useMemo(() => {
    return articlesBouchonPrecadre.find(a => a.code_art === precadreConfig.bouchonArticleCode) || null;
  }, [articlesBouchonPrecadre, precadreConfig.bouchonArticleCode]);

  // Synchronisation de sécurité si un article sélectionné n'existe plus dans la base SQLite
  useEffect(() => {
    if (caissonConfig.ctArticleCode && articlesCT.length > 0 && !articlesCT.some(a => a.code_art === caissonConfig.ctArticleCode)) {
      setCaissonConfig(prev => ({ ...prev, ctArticleCode: '' }));
    }
  }, [articlesCT, caissonConfig.ctArticleCode]);

  useEffect(() => {
    if (caissonConfig.sfArticleCode && articlesSF.length > 0 && !articlesSF.some(a => a.code_art === caissonConfig.sfArticleCode)) {
      setCaissonConfig(prev => ({ ...prev, sfArticleCode: '' }));
    }
  }, [articlesSF, caissonConfig.sfArticleCode]);

  useEffect(() => {
    if (tablierConfig.articleCode && articlesTablier.length > 0 && !articlesTablier.some(a => a.code_art === tablierConfig.articleCode)) {
      setTablierConfig(prev => ({ ...prev, articleCode: '' }));
    }
    if (tablierConfig.lfArticleCode && articlesLameFinale.length > 0 && !articlesLameFinale.some(a => a.code_art === tablierConfig.lfArticleCode)) {
      setTablierConfig(prev => ({ ...prev, lfArticleCode: '' }));
    }
    if (tablierConfig.glArticleCode && articlesCoulisses.length > 0 && !articlesCoulisses.some(a => a.code_art === tablierConfig.glArticleCode)) {
      setTablierConfig(prev => ({ ...prev, glArticleCode: '' }));
    }
  }, [articlesTablier, articlesLameFinale, articlesCoulisses, tablierConfig.articleCode, tablierConfig.lfArticleCode, tablierConfig.glArticleCode]);

  useEffect(() => {
    if (precadreConfig.articleCode && articlesPrecadre.length > 0 && !articlesPrecadre.some(a => a.code_art === precadreConfig.articleCode)) {
      setPrecadreConfig(prev => ({ ...prev, articleCode: '' }));
    }
    if (precadreConfig.bouchonArticleCode && articlesBouchonPrecadre.length > 0 && !articlesBouchonPrecadre.some(a => a.code_art === precadreConfig.bouchonArticleCode)) {
      setPrecadreConfig(prev => ({ ...prev, bouchonArticleCode: '' }));
    }
  }, [articlesPrecadre, articlesBouchonPrecadre, precadreConfig.articleCode, precadreConfig.bouchonArticleCode]);

  // Listes intelligemment optimisées et groupées selon les règles d'appariement
  // Caisson 30 BL -> Sous-Face 30 BL (même dimension en tête, couleur triée)
  const sousFacesOptimisees = useMemo(() => {
    return optimiserListeSousFaces(currentCTArticle, articlesSF);
  }, [currentCTArticle, articlesSF]);

  // Tablier 43 BL -> Lame Finale BL
  const lamesFinalesOptimisees = useMemo(() => {
    return optimiserListeLamesFinales(currentTBLArticle, articlesLameFinale);
  }, [currentTBLArticle, articlesLameFinale]);

  // --- PARAMÈTRES TECHNIQUES INTERACTIFS DE DÉCOUPE (CT, SF, TBL, LF, GL, PRC) ---
  const [showTechParams, setShowTechParams] = useState<boolean>(false);
  const [ctTechParams, setCtTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [sfTechParams, setSfTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });

  const [tblTechParams, setTblTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [lfTechParams, setLfTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [glTechParams, setGlTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [prcTechParams, setPrcTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [bouchonTechParams, setBouchonTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [mstqCadreTechParams, setMstqCadreTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [mstqCoulisseTechParams, setMstqCoulisseTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
  const [mstqBarreInfTechParams, setMstqBarreInfTechParams] = useState({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });

  // --- PARAMÈTRES TECHNIQUES OPTIMISATION TOILE / MAILLE MSTQ ---
  const [paramsMaille, setParamsMaille] = useState<ParametresOptimisationMaille>(() => {
    try {
      const saved = localStorage.getItem('3m_params_optimisation_maille');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Erreur chargement params maille:', e);
    }
    return PARAMETRES_MAILLE_DEFAUT;
  });
  const [showParametresMailleModal, setShowParametresMailleModal] = useState<boolean>(false);

  const handleSaveParamsMaille = (newParams: ParametresOptimisationMaille) => {
    setParamsMaille(newParams);
    try {
      localStorage.setItem('3m_params_optimisation_maille', JSON.stringify(newParams));
    } catch (e) {
      console.error('Erreur sauvegarde params maille:', e);
    }
  };

  // Synchro auto des paramètres techniques dès que l'article sélectionné change
  useEffect(() => {
    if (currentCTArticle && !ctTechParams.isDirty) {
      setCtTechParams({
        longeur: currentCTArticle.longeur || 0,
        lame: currentCTArticle.lame || 0,
        debordement: currentCTArticle.debordement || 0,
        refus_min: currentCTArticle.refus_min || 0,
        refus_max: currentCTArticle.refus_max || 0,
        isDirty: false
      });
    } else if (!currentCTArticle) {
      setCtTechParams({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
    }
  }, [currentCTArticle]);

  useEffect(() => {
    if (currentSFArticle && !sfTechParams.isDirty) {
      setSfTechParams({
        longeur: currentSFArticle.longeur || 0,
        lame: currentSFArticle.lame || 0,
        debordement: currentSFArticle.debordement || 0,
        refus_min: currentSFArticle.refus_min || 0,
        refus_max: currentSFArticle.refus_max || 0,
        isDirty: false
      });
    } else if (!currentSFArticle) {
      setSfTechParams({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
    }
  }, [currentSFArticle]);

  useEffect(() => {
    if (currentTBLArticle && !tblTechParams.isDirty) {
      setTblTechParams({
        longeur: currentTBLArticle.longeur || 0,
        lame: currentTBLArticle.lame || 0,
        debordement: currentTBLArticle.debordement || 0,
        refus_min: currentTBLArticle.refus_min || 0,
        refus_max: currentTBLArticle.refus_max || 0,
        isDirty: false
      });
    } else if (!currentTBLArticle) {
      setTblTechParams({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
    }
  }, [currentTBLArticle]);

  useEffect(() => {
    if (currentLFArticle && !lfTechParams.isDirty) {
      setLfTechParams({
        longeur: currentLFArticle.longeur || 0,
        lame: currentLFArticle.lame || 0,
        debordement: currentLFArticle.debordement || 0,
        refus_min: currentLFArticle.refus_min || 0,
        refus_max: currentLFArticle.refus_max || 0,
        isDirty: false
      });
    } else if (!currentLFArticle) {
      setLfTechParams({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
    }
  }, [currentLFArticle]);

  useEffect(() => {
    if (currentGLArticle && !glTechParams.isDirty) {
      setGlTechParams({
        longeur: currentGLArticle.longeur || 0,
        lame: currentGLArticle.lame || 0,
        debordement: currentGLArticle.debordement || 0,
        refus_min: currentGLArticle.refus_min || 0,
        refus_max: currentGLArticle.refus_max || 0,
        isDirty: false
      });
    } else if (!currentGLArticle) {
      setGlTechParams({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
    }
  }, [currentGLArticle]);

  useEffect(() => {
    if (currentPRCArticle && !prcTechParams.isDirty) {
      setPrcTechParams({
        longeur: currentPRCArticle.longeur || 0,
        lame: currentPRCArticle.lame || 0,
        debordement: currentPRCArticle.debordement || 0,
        refus_min: currentPRCArticle.refus_min || 0,
        refus_max: currentPRCArticle.refus_max || 0,
        isDirty: false
      });
    } else if (!currentPRCArticle) {
      setPrcTechParams({ longeur: 0, lame: 0, debordement: 0, refus_min: 0, refus_max: 0, isDirty: false });
    }
  }, [currentPRCArticle]);

  const handleSaveArticleTechParams = async (target: 'CT' | 'SF' | 'TBL' | 'LF' | 'GL' | 'PRC' | 'BCH' | 'MSTQ_CDR' | 'MSTQ_CLS' | 'MSTQ_BI') => {
    let codeArt = '';
    let params: any = null;
    let name = '';

    if (target === 'CT') { codeArt = currentCTArticle?.code_art || caissonConfig.ctArticleCode; params = ctTechParams; name = currentCTArticle?.designation || ''; }
    else if (target === 'SF') { codeArt = currentSFArticle?.code_art || caissonConfig.sfArticleCode; params = sfTechParams; name = currentSFArticle?.designation || ''; }
    else if (target === 'TBL') { codeArt = currentTBLArticle?.code_art || tablierConfig.articleCode; params = tblTechParams; name = currentTBLArticle?.designation || ''; }
    else if (target === 'LF') { codeArt = currentLFArticle?.code_art || tablierConfig.lfArticleCode; params = lfTechParams; name = currentLFArticle?.designation || ''; }
    else if (target === 'GL') { codeArt = currentGLArticle?.code_art || tablierConfig.glArticleCode; params = glTechParams; name = currentGLArticle?.designation || ''; }
    else if (target === 'PRC') { codeArt = currentPRCArticle?.code_art || precadreConfig.articleCode; params = prcTechParams; name = currentPRCArticle?.designation || ''; }
    else if (target === 'BCH') { codeArt = currentBouchonArticle?.code_art || precadreConfig.bouchonArticleCode; params = bouchonTechParams; name = currentBouchonArticle?.designation || ''; }
    else if (target === 'MSTQ_CDR') { codeArt = mstqConfig.cadreArticleCode; params = mstqCadreTechParams; name = articlesCadreMSTQ.find(a => a.code_art === mstqConfig.cadreArticleCode)?.designation || 'Cadre Moustiquaire'; }
    else if (target === 'MSTQ_CLS') { codeArt = mstqConfig.coulisseArticleCode; params = mstqCoulisseTechParams; name = articlesCoulisseMSTQ.find(a => a.code_art === mstqConfig.coulisseArticleCode)?.designation || 'Coulisses Tirage'; }
    else if (target === 'MSTQ_BI') { codeArt = mstqConfig.barreInfArticleCode; params = mstqBarreInfTechParams; name = articlesBarreInfMSTQ.find(a => a.code_art === mstqConfig.barreInfArticleCode)?.designation || 'Barre Inférieure'; }

    const allArticles = safeArticles;
    const updated = allArticles.map(a => {
      if (a.code_art === codeArt) {
        return {
          ...a,
          longeur: params.longeur,
          lame: params.lame,
          debordement: params.debordement,
          refus_min: params.refus_min,
          refus_max: params.refus_max
        };
      }
      return a;
    });

    await StorageService.saveArticles(updated);
    if (target === 'CT') setCtTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'SF') setSfTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'TBL') setTblTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'LF') setLfTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'GL') setGlTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'PRC') setPrcTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'BCH') setBouchonTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'MSTQ_CDR') setMstqCadreTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'MSTQ_CLS') setMstqCoulisseTechParams(prev => ({ ...prev, isDirty: false }));
    else if (target === 'MSTQ_BI') setMstqBarreInfTechParams(prev => ({ ...prev, isDirty: false }));

    showFlashNotification(`✓ Conditions de découpe enregistrées et sauvegardées pour ${name} !`, 'success');
  };

  // Changement intelligent de Caisson CT : ajuste automatiquement la Sous-Face correspondante
  const handleSelectCaissonCT = (codeArt: string) => {
    const found = articlesCT.find(a => a.code_art === codeArt);
    if (!found) return;

    // Règle d'or : Caisson 30 BL -> Sous-Face devient automatiquement 30 BL (même dimension & couleur)
    const matchSF = trouverSousFacePourCaisson(found, articlesSF);
    const targetSFCode = matchSF ? matchSF.code_art : caissonConfig.sfArticleCode;

    setCaissonConfig(prev => ({
      ...prev,
      ctArticleCode: found.code_art,
      sfArticleCode: targetSFCode
    }));
  };

  const handleSelectSousFaceSF = (codeArt: string) => {
    const found = articlesSF.find(s => s.code_art === codeArt);
    if (!found) return;
    setCaissonConfig({
      ...caissonConfig,
      sfArticleCode: found.code_art
    });
  };

  // --- B. TABLIER / VOLET ROULANT ---
  // OPTIMISATION STRICTE DU TABLIER, DE LA LAME FINALE ET DES COULISSES
  const handleOptimiserTabliersEtVolets = () => {
    if (lignesTabliers.length === 0) {
      showFlashNotification('Veuillez saisir au moins une ligne de tablier avant de lancer la découpe.', 'warn');
      return;
    }

    setShowAllModalDetails(false);
    setExpandedModalSections({});

    const generatedSections: SectionMultiArticleCaisson[] = [];

    const refsTabliersInvolved = Array.from(new Set(lignesTabliers.map(t => (t.refCommande || numCommandeTablier || numCommande || '').trim()).filter(Boolean)));
    const activeRefs = refsTabliersInvolved.length > 0 ? refsTabliersInvolved : [numCommande.trim() || 'CMD-01'];

    // 1. Groupement Lames de Tablier (TBL) par articleCode
    const groupsTBL = new Map<string, CommandeTablier[]>();
    for (const ligne of lignesTabliers) {
      const code = ligne.articleCode || tablierConfig.articleCode;
      if (!groupsTBL.has(code)) groupsTBL.set(code, []);
      groupsTBL.get(code)!.push(ligne);
    }

    groupsTBL.forEach((lignesGroup, artCode) => {
      const artObj = safeArticles.find(a => a.code_art === artCode) || articlesTablier.find(a => a.code_art === artCode) || articlesTablier[0];
      const mappedSheetName = mapping[artObj.code_art] || null;
      const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];

      const tblParamsApplicables = tablierConfig.articleCode === artObj.code_art;
      const longBarre = (tblParamsApplicables && tblTechParams.longeur > 0) ? tblTechParams.longeur : (artObj.longeur || 6000);
      const epScie = (tblParamsApplicables && tblTechParams.lame > 0) ? tblTechParams.lame : (artObj.lame || 4.0);
      const debord = (tblParamsApplicables && tblTechParams.debordement !== undefined && tblTechParams.debordement !== null) ? tblTechParams.debordement : (artObj.debordement || 0);
      const rMin = (tblParamsApplicables && tblTechParams.refus_min > 0) ? tblTechParams.refus_min : (artObj.refus_min ?? 250);
      const rMax = (tblParamsApplicables && tblTechParams.refus_max > 0) ? tblTechParams.refus_max : (artObj.refus_max ?? 1000);

      const opt = new OptimiseurCoupe1D({
        longueurBarre: longBarre,
        epaisseurScie: epScie,
        refusMin: rMin,
        refusMax: rMax,
        mode: optMode,
        poidsTemps: poidsTemps
      });

      const piecesToCut: any[] = [];
      lignesGroup.forEach(c => {
        const isAvecVolet = c.typeFabrication === 'VOLET_COMPLET' || c.avecCoulisses;
        const hLame = getHauteurLameTablier(c.articleCode, c.articleDesignation || artObj.designation, c.hauteur_lame_tablier);
        const nLamesPerVolet = Math.ceil(c.hauteur / hLame) + (isAvecVolet ? 2 : 0); // +2 lames de tablier (pas finale) de la même sélection (TAB 43 ou TAB 55) si volet
        const totalLames = nLamesPerVolet * c.quantite;

        // Règle Volet : 43mm -> -65mm, 55mm -> -28mm. Tablier seul -> débord standard
        const dedTablier = isAvecVolet 
          ? (hLame === 55 ? -28 : -65) 
          : debord;
        const lenLame = c.largeur + dedTablier;

        piecesToCut.push({
          longueur: lenLame,
          quantite: totalLames,
          label: `${c.repere} (${totalLames} lames ${artObj.designation}) [${lenLame}mm]`,
          repere: c.repere,
          refCommande: (c.refCommande || numCommandeTablier || numCommande).trim() || 'CMD-01'
        });
      });

      const res = opt.optimiser(piecesToCut, availableChutes);
      res.articleCode = artObj.code_art;
      res.articleDesignation = artObj.designation;
      res.refCommande = activeRefs.join(', ');
      res.nomClient = clientDeMonClient.trim() || 'CLIENT';
      res.donneurOrdre = monClient;
      res.dateCommande = dateCommande;
      generatedSections.push({
        articleCode: artObj.code_art,
        articleDesignation: artObj.designation,
        articleObj: artObj,
        resultat: res,
        type: 'CT',
        famille: 'TABLIER',
        commandesInvolved: activeRefs
      });
    });

    // 2. Groupement Lames Finales (LF) (1 pièce par volet de longueur L)
    const lignesAvecLF = lignesTabliers.filter(c => c.avecLameFinale);
    const groupsLF = new Map<string, CommandeTablier[]>();
    for (const ligne of lignesAvecLF) {
      const code = ligne.lfArticleCode || tablierConfig.lfArticleCode;
      if (!groupsLF.has(code)) groupsLF.set(code, []);
      groupsLF.get(code)!.push(ligne);
    }

    groupsLF.forEach((lignesGroup, lfCode) => {
      const lfObj = safeArticles.find(a => a.code_art === lfCode) || articlesLameFinale.find(a => a.code_art === lfCode) || articlesLameFinale[0];
      const mappedSheetName = mapping[lfObj.code_art] || null;
      const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];

      const lfParamsApplicables = tablierConfig.lfArticleCode === lfObj.code_art;
      const longBarreLF = (lfParamsApplicables && lfTechParams.longeur > 0) ? lfTechParams.longeur : (lfObj.longeur || 6000);
      const epScieLF = (lfParamsApplicables && lfTechParams.lame > 0) ? lfTechParams.lame : (lfObj.lame || 4.0);
      const debordLF = (lfParamsApplicables && lfTechParams.debordement !== undefined && lfTechParams.debordement !== null) ? lfTechParams.debordement : (lfObj.debordement || 0);
      const rMinLF = (lfParamsApplicables && lfTechParams.refus_min > 0) ? lfTechParams.refus_min : (lfObj.refus_min ?? 250);
      const rMaxLF = (lfParamsApplicables && lfTechParams.refus_max > 0) ? lfTechParams.refus_max : (lfObj.refus_max ?? 1000);

      const opt = new OptimiseurCoupe1D({
        longueurBarre: longBarreLF,
        epaisseurScie: epScieLF,
        refusMin: rMinLF,
        refusMax: rMaxLF,
        mode: optMode,
        poidsTemps: poidsTemps
      });

      const piecesToCut = lignesGroup.map(c => {
        const isAvecVolet = c.typeFabrication === 'VOLET_COMPLET' || c.avecCoulisses;
        const hLame = getHauteurLameTablier(c.articleCode, c.articleDesignation || lfObj.designation, c.hauteur_lame_tablier);
        
        // Règle Volet : LF = -65mm pour 43mm, -28mm pour 55mm. Tablier seul -> débord standard
        const dedLF = isAvecVolet 
          ? (hLame === 55 ? -28 : -65) 
          : debordLF;
        const lenLF = c.largeur + dedLF;

        return {
          longueur: lenLF,
          quantite: c.quantite,
          label: `LF-${c.repere} (${lfObj.designation}) [${lenLF}mm]`,
          repere: `LF-${c.repere}`,
          refCommande: (c.refCommande || numCommandeTablier || numCommande).trim() || 'CMD-01'
        };
      });

      const res = opt.optimiser(piecesToCut, availableChutes);
      res.articleCode = lfObj.code_art;
      res.articleDesignation = lfObj.designation;
      res.refCommande = activeRefs.join(', ');
      res.nomClient = clientDeMonClient.trim() || 'CLIENT';
      res.donneurOrdre = monClient;
      res.dateCommande = dateCommande;
      generatedSections.push({
        articleCode: lfObj.code_art,
        articleDesignation: lfObj.designation,
        articleObj: lfObj,
        resultat: res,
        type: 'LF',
        famille: 'TABLIER',
        commandesInvolved: activeRefs
      });
    });

    // 3. Groupement Coulisses (GL) (2 pièces par volet de longueur H pour VOLET_COMPLET)
    const lignesAvecGL = lignesTabliers.filter(c => c.typeFabrication === 'VOLET_COMPLET' || c.avecCoulisses);
    const groupsGL = new Map<string, CommandeTablier[]>();
    for (const ligne of lignesAvecGL) {
      const code = ligne.glArticleCode || tablierConfig.glArticleCode;
      if (!groupsGL.has(code)) groupsGL.set(code, []);
      groupsGL.get(code)!.push(ligne);
    }

    groupsGL.forEach((lignesGroup, glCode) => {
      const glObj = safeArticles.find(a => a.code_art === glCode) || articlesCoulisses.find(a => a.code_art === glCode) || articlesCoulisses[0];
      const mappedSheetName = mapping[glObj.code_art] || null;
      const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];

      const glParamsApplicables = tablierConfig.glArticleCode === glObj.code_art;
      const longBarreGL = (glParamsApplicables && glTechParams.longeur > 0) ? glTechParams.longeur : (glObj.longeur || 6000);
      const epScieGL = (glParamsApplicables && glTechParams.lame > 0) ? glTechParams.lame : (glObj.lame || 4.0);
      // Règle Volet : Hauteur des 2 coulisses = Hauteur saisie dans la ligne de commande (déduction 0 mm si pas de débord configuré)
      const debordGL = (glParamsApplicables && glTechParams.debordement !== undefined && glTechParams.debordement !== null) ? glTechParams.debordement : (glObj.debordement || 0);
      const rMinGL = (glParamsApplicables && glTechParams.refus_min > 0) ? glTechParams.refus_min : (glObj.refus_min ?? 300);
      const rMaxGL = (glParamsApplicables && glTechParams.refus_max > 0) ? glTechParams.refus_max : (glObj.refus_max ?? 1200);

      const opt = new OptimiseurCoupe1D({
        longueurBarre: longBarreGL,
        epaisseurScie: epScieGL,
        refusMin: rMinGL,
        refusMax: rMaxGL,
        mode: optMode,
        poidsTemps: poidsTemps
      });

      const piecesToCut = lignesGroup.map(c => {
        const lenGL = c.hauteur + debordGL; // = c.hauteur si debordGL=0
        return {
          longueur: lenGL,
          quantite: c.quantite * 2, // 2 Coulisses par volet
          label: `TAB-CS-${c.repere} (2 × TAB COULISSE ${glObj.designation}) [${lenGL}mm]`,
          repere: `TAB-CS-${c.repere}`,
          refCommande: (c.refCommande || numCommandeTablier || numCommande).trim() || 'CMD-01'
        };
      });

      const res = opt.optimiser(piecesToCut, availableChutes);
      res.articleCode = glObj.code_art;
      res.articleDesignation = glObj.designation;
      res.refCommande = activeRefs.join(', ');
      res.nomClient = clientDeMonClient.trim() || 'CLIENT';
      res.donneurOrdre = monClient;
      res.dateCommande = dateCommande;
      generatedSections.push({
        articleCode: glObj.code_art,
        articleDesignation: glObj.designation,
        articleObj: glObj,
        resultat: res,
        type: 'GL',
        famille: 'TABLIER',
        commandesInvolved: activeRefs
      });
    });

    setMultiOptActiveRefs(activeRefs);
    setMultiOptFamilyFilter('ALL');
    setSectionsMultiCaisson(generatedSections);
    setModalDebitCaissonOpen(true);
  };

  // =========================================================================
  // OPTIMISATION MOUSTIQUAIRE : Cadre Dormant + Coulisses + Barre Inférieure
  // =========================================================================
  const handleOptimiserMoustiquaires = () => {
    const safeArticlesList = articles || [];
    const mappingToUse: MappingChutes = mapping || {};
    const chutesBarresToUse: Record<string, ChuteItem[]> = chutesBarres || {};

    if (lignesMoustiquaires.length === 0) {
      showFlashNotification('Veuillez saisir au moins une ligne moustiquaire avant de lancer la découpe.', 'warn');
      return;
    }

    const generatedSections: SectionMultiArticleCaisson[] = [];

    // ===== 1. CADRE DORMANT (Montants Ha, Hb + Traverses La, Lb) =====
    const lignesAvecCadre = lignesMoustiquaires.filter(m => m.typeFabrication !== 'SEMI_FINI_MAILLE');
    if (lignesAvecCadre.length > 0) {
      const groupsCadre = new Map<string, BesoinMoustiquaire[]>();
      for (const ligne of lignesAvecCadre) {
        const code = ligne.articleCodeCadre || mstqConfig.cadreArticleCode || 'ART0052';
        if (!groupsCadre.has(code)) groupsCadre.set(code, []);
        groupsCadre.get(code)!.push(ligne);
      }

      groupsCadre.forEach((lignesGroup, cadreCode) => {
        const cadreObj = safeArticles.find(a => a.code_art === cadreCode) || articlesCadreMSTQ[0];
        if (!cadreObj) return;
        const mappedSheet = mapping[cadreObj.code_art] || null;
        const availableChutes = mappedSheet ? chutesBarres[mappedSheet] || [] : [];
        const longBarre = mstqCadreTechParams.longeur || cadreObj.longeur || 6000;
        const epScie = mstqCadreTechParams.lame || cadreObj.lame || 4.0;
        const ded = mstqCadreTechParams.debordement ?? cadreObj.debordement ?? -62;
        const rMin = mstqCadreTechParams.refus_min ?? cadreObj.refus_min ?? 350;
        const rMax = mstqCadreTechParams.refus_max ?? cadreObj.refus_max ?? 1200;

        const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });

        // Générer les pièces :
        // - Si avec Barre Inférieure : 2 Montants (H-37) + 1 Traverse Haute (L-62)
        // - Si sans Barre Inférieure : 2 Montants (H-62) + 2 Traverses (L-62)
        const pieces: { longueur: number; quantite: number; label: string; repere?: string; refCommande?: string }[] = [];
        for (const m of lignesGroup) {
          const Q = Math.max(1, m.quantite);
          const dedH = m.avecBarreInferieure ? -37 : (mstqCadreTechParams.debordement ?? cadreObj.debordement ?? -62);
          const dedL = -62;
          const lenMontant = m.hauteur + dedH;
          const lenTraverse = m.largeur + dedL;
          pieces.push({ longueur: lenMontant, quantite: 2 * Q, label: `Ha/Hb-${m.repere} (Montant Cadre ${lenMontant}mm)`, repere: `HaCadre-${m.repere}`, refCommande: m.refCommande });
          // Traverse haute toujours en profilé cadre
          pieces.push({ longueur: lenTraverse, quantite: 1 * Q, label: `La-${m.repere} (Traverse Haute ${lenTraverse}mm)`, repere: `LaCadre-${m.repere}`, refCommande: m.refCommande });
          // Traverse basse : seulement si pas barre inférieure séparée
          if (!m.avecBarreInferieure) {
            pieces.push({ longueur: lenTraverse, quantite: 1 * Q, label: `Lb-${m.repere} (Traverse Basse ${lenTraverse}mm)`, repere: `LbCadre-${m.repere}`, refCommande: m.refCommande });
          }
        }

        const res = opt.optimiser(pieces, availableChutes);
        res.articleCode = cadreObj.code_art;
        res.articleDesignation = cadreObj.designation;
        res.refCommande = numCommande.trim() || 'CMD-01';
        res.nomClient = clientDeMonClient.trim() || 'CLIENT';
        res.donneurOrdre = monClient;
        res.dateCommande = dateCommande;
        generatedSections.push({ articleCode: cadreObj.code_art, articleDesignation: cadreObj.designation, articleObj: cadreObj, resultat: res, type: 'CADRE', famille: 'MOUSTIQUAIRE' });
      });
    }

    // ===== 2. COULISSES DE TIRAGE =====
    const lignesAvecCoulisse = lignesMoustiquaires.filter(m => m.typeFabrication !== 'SEMI_FINI_MAILLE' && m.typeOuverture !== 'FIXE');
    if (lignesAvecCoulisse.length > 0) {
      const groupsCoulisse = new Map<string, BesoinMoustiquaire[]>();
      for (const ligne of lignesAvecCoulisse) {
        const code = ligne.articleCodeCoulisse || mstqConfig.coulisseArticleCode || 'ART0053';
        if (!groupsCoulisse.has(code)) groupsCoulisse.set(code, []);
        groupsCoulisse.get(code)!.push(ligne);
      }

      groupsCoulisse.forEach((lignesGroup, coulisseCode) => {
        const coulisseObj = safeArticles.find(a => a.code_art === coulisseCode) || articlesCoulisseMSTQ[0];
        if (!coulisseObj) return;
        const mappedSheet = mapping[coulisseObj.code_art] || null;
        const availableChutes = mappedSheet ? chutesBarres[mappedSheet] || [] : [];
        const longBarre = mstqCoulisseTechParams.longeur || coulisseObj.longeur || 6000;
        const epScie = mstqCoulisseTechParams.lame || coulisseObj.lame || 4.0;
        const ded = mstqCoulisseTechParams.debordement ?? coulisseObj.debordement ?? -46;
        const rMin = mstqCoulisseTechParams.refus_min ?? coulisseObj.refus_min ?? 300;
        const rMax = mstqCoulisseTechParams.refus_max ?? coulisseObj.refus_max ?? 1200;

        const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });

        const pieces: { longueur: number; quantite: number; label: string; repere?: string; refCommande?: string }[] = [];
        for (const m of lignesGroup) {
          if (m.typeOuverture === 'FIXE' || m.typeFabrication === 'SEMI_FINI_MAILLE') continue;
          const Q = Math.max(1, m.quantite);
          const dedCoulisse = m.avecBarreInferieure ? -33 : (mstqCoulisseTechParams.debordement ?? coulisseObj.debordement ?? -46);
          // Déterminer nombre de coulisses et dimension selon le type
          let qtyCoulisse = 1;
          let dimCoulisse = m.hauteur + dedCoulisse; // Défaut : tirage selon H (Porte-Fenêtre)
          if (m.typeOuverture === 'DOUBLE_VANTAUX' || m.typeOuverture === 'CENTRALE') { qtyCoulisse = 2; dimCoulisse = m.hauteur + dedCoulisse; }
          else if (m.typeOuverture === 'FENETRE') { dimCoulisse = m.largeur + dedCoulisse; } // Fenêtre : tirage horizontal

          if (qtyCoulisse > 0) {
            pieces.push({ longueur: dimCoulisse, quantite: qtyCoulisse * Q, label: `MSTQ-CS-${m.repere} (MSTQ COULISSE ${dimCoulisse}mm)`, repere: `MSTQ-CS-${m.repere}`, refCommande: m.refCommande });
          }
        }
        if (pieces.length === 0) return;

        const res = opt.optimiser(pieces, availableChutes);
        res.articleCode = coulisseObj.code_art;
        res.articleDesignation = coulisseObj.designation;
        res.refCommande = numCommande.trim() || 'CMD-01';
        res.nomClient = clientDeMonClient.trim() || 'CLIENT';
        res.donneurOrdre = monClient;
        res.dateCommande = dateCommande;
        generatedSections.push({ articleCode: coulisseObj.code_art, articleDesignation: coulisseObj.designation, articleObj: coulisseObj, resultat: res, type: 'GL', famille: 'MOUSTIQUAIRE' });
      });
    }

    // ===== 3. BARRE INFÉRIEURE =====
    const lignesAvecBI = lignesMoustiquaires.filter(m => m.avecBarreInferieure && m.typeFabrication !== 'SEMI_FINI_MAILLE');
    if (lignesAvecBI.length > 0) {
      const groupsBI = new Map<string, BesoinMoustiquaire[]>();
      for (const ligne of lignesAvecBI) {
        const code = ligne.articleCodeBarreInf || mstqConfig.barreInfArticleCode || 'ART0054';
        if (!groupsBI.has(code)) groupsBI.set(code, []);
        groupsBI.get(code)!.push(ligne);
      }

      groupsBI.forEach((lignesGroup, biCode) => {
        const biObj = safeArticles.find(a => a.code_art === biCode) || articlesBarreInfMSTQ[0];
        if (!biObj) return;
        const mappedSheet = mapping[biObj.code_art] || null;
        const availableChutes = mappedSheet ? chutesBarres[mappedSheet] || [] : [];
        const longBarre = mstqBarreInfTechParams.longeur || biObj.longeur || 6000;
        const epScie = mstqBarreInfTechParams.lame || biObj.lame || 4.0;
        const ded = mstqBarreInfTechParams.debordement ?? biObj.debordement ?? -13;
        const rMin = mstqBarreInfTechParams.refus_min ?? biObj.refus_min ?? 300;
        const rMax = mstqBarreInfTechParams.refus_max ?? biObj.refus_max ?? 1200;

        const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });

        const pieces: { longueur: number; quantite: number; label: string; repere?: string; refCommande?: string }[] = [];
        for (const m of lignesGroup) {
          const Q = Math.max(1, m.quantite);
          const lenBI = m.largeur + ded;
          pieces.push({ longueur: lenBI, quantite: 1 * Q, label: `BI-${m.repere} (Barre Inférieure ${lenBI}mm)`, repere: `BI-${m.repere}`, refCommande: m.refCommande });
        }

        const res = opt.optimiser(pieces, availableChutes);
        res.articleCode = biObj.code_art;
        res.articleDesignation = biObj.designation;
        res.refCommande = numCommande.trim() || 'CMD-01';
        res.nomClient = clientDeMonClient.trim() || 'CLIENT';
        res.donneurOrdre = monClient;
        res.dateCommande = dateCommande;
        generatedSections.push({ articleCode: biObj.code_art, articleDesignation: biObj.designation, articleObj: biObj, resultat: res, type: 'SF', famille: 'MOUSTIQUAIRE' });
      });
    }

    setSectionsMultiMSTQ(generatedSections);
    setModalDebitMSTQOpen(true);
  };

  // --- C. MOUSTIQUAIRE PLISSÉE ---
  const [mstqConfig, setMstqConfig] = useState({
    typeOuverture: 'PORTE_FENETRE' as 'FENETRE' | 'PORTE_FENETRE' | 'DOUBLE_VANTAUX' | 'CENTRALE' | 'FIXE',
    typeFabrication: 'COMPLET' as 'SEMI_FINI_MAILLE' | 'COMPLET' | 'PROFILES_SEULS',
    avecBarreInferieure: false,
    mailleArticleCode: '',
    mailleArticleDesignation: '',
    cadreArticleCode: '',
    cadreArticleDesignation: '',
    coulisseArticleCode: '',
    coulisseArticleDesignation: '',
    barreInfArticleCode: '',
    barreInfArticleDesignation: '',
    modele: 'MOUSTIQUAIRE PLISSÉE'
  });

  // Sécurité si un article sélectionné n'existe plus dans la base SQLite
  useEffect(() => {
    if (mstqConfig.mailleArticleCode && articlesMailleMSTQ.length > 0 && !articlesMailleMSTQ.some(a => a.code_art === mstqConfig.mailleArticleCode)) {
      setMstqConfig(prev => ({ ...prev, mailleArticleCode: '', mailleArticleDesignation: '' }));
    }
    if (mstqConfig.cadreArticleCode && articlesCadreMSTQ.length > 0 && !articlesCadreMSTQ.some(a => a.code_art === mstqConfig.cadreArticleCode)) {
      setMstqConfig(prev => ({ ...prev, cadreArticleCode: '', cadreArticleDesignation: '' }));
    }
    if (mstqConfig.coulisseArticleCode && articlesCoulisseMSTQ.length > 0 && !articlesCoulisseMSTQ.some(a => a.code_art === mstqConfig.coulisseArticleCode)) {
      setMstqConfig(prev => ({ ...prev, coulisseArticleCode: '', coulisseArticleDesignation: '' }));
    }
    if (mstqConfig.barreInfArticleCode && articlesBarreInfMSTQ.length > 0 && !articlesBarreInfMSTQ.some(a => a.code_art === mstqConfig.barreInfArticleCode)) {
      setMstqConfig(prev => ({ ...prev, barreInfArticleCode: '', barreInfArticleDesignation: '' }));
    }
  }, [articlesMailleMSTQ, articlesCadreMSTQ, articlesCoulisseMSTQ, articlesBarreInfMSTQ]);

  // Synchro auto des paramètres techniques MSTQ avec les profilés alu sélectionnés
  useEffect(() => {
    const cadreObj = articlesCadreMSTQ.find(a => a.code_art === mstqConfig.cadreArticleCode) || articlesCadreMSTQ[0];
    if (cadreObj && !mstqCadreTechParams.isDirty) {
      setMstqCadreTechParams({ longeur: cadreObj.longeur || 6000, lame: cadreObj.lame || 4.0, debordement: cadreObj.debordement ?? -62, refus_min: cadreObj.refus_min || 350, refus_max: cadreObj.refus_max || 1200, isDirty: false });
    }
    const coulisseObj = articlesCoulisseMSTQ.find(a => a.code_art === mstqConfig.coulisseArticleCode) || articlesCoulisseMSTQ[0];
    if (coulisseObj && !mstqCoulisseTechParams.isDirty) {
      setMstqCoulisseTechParams({ longeur: coulisseObj.longeur || 6000, lame: coulisseObj.lame || 4.0, debordement: coulisseObj.debordement ?? -46, refus_min: coulisseObj.refus_min || 300, refus_max: coulisseObj.refus_max || 1200, isDirty: false });
    }
    const barreInfObj = articlesBarreInfMSTQ.find(a => a.code_art === mstqConfig.barreInfArticleCode) || articlesBarreInfMSTQ[0];
    if (barreInfObj && !mstqBarreInfTechParams.isDirty) {
      setMstqBarreInfTechParams({ longeur: barreInfObj.longeur || 6000, lame: barreInfObj.lame || 4.0, debordement: barreInfObj.debordement ?? -62, refus_min: barreInfObj.refus_min || 300, refus_max: barreInfObj.refus_max || 1200, isDirty: false });
    }
  }, [mstqConfig.cadreArticleCode, mstqConfig.coulisseArticleCode, mstqConfig.barreInfArticleCode, articlesCadreMSTQ, articlesCoulisseMSTQ, articlesBarreInfMSTQ]);

  // Objets d'articles MSTQ réels
  const currentCadreMSTQArticle = useMemo(() => {
    return articlesCadreMSTQ.find(a => a.code_art === mstqConfig.cadreArticleCode) || null;
  }, [articlesCadreMSTQ, mstqConfig.cadreArticleCode]);

  const currentCoulisseMSTQArticle = useMemo(() => {
    return articlesCoulisseMSTQ.find(a => a.code_art === mstqConfig.coulisseArticleCode) || null;
  }, [articlesCoulisseMSTQ, mstqConfig.coulisseArticleCode]);

  const currentBarreInfMSTQArticle = useMemo(() => {
    return articlesBarreInfMSTQ.find(a => a.code_art === mstqConfig.barreInfArticleCode) || null;
  }, [articlesBarreInfMSTQ, mstqConfig.barreInfArticleCode]);

  const currentMailleMSTQArticle = useMemo(() => {
    return articlesMailleMSTQ.find(a => a.code_art === mstqConfig.mailleArticleCode) || null;
  }, [articlesMailleMSTQ, mstqConfig.mailleArticleCode]);

  // Cadre MSTQ BL -> Coulisses BL
  const coulissesMSTQOptimisees = useMemo(() => {
    return optimiserListeCoulissesMSTQ(currentCadreMSTQArticle, articlesCoulisseMSTQ);
  }, [currentCadreMSTQArticle, articlesCoulisseMSTQ]);

  // =========================================================================
  // 5. LIGNES DE COMMANDE EN COURS (PANIER MULTI-PRODUITS)
  // Initialisées à vide pour chaque nouveau dossier
  // =========================================================================
  const [lignesCaissons, setLignesCaissons] = useState<CommandeCaisson[]>([]);
  const [lignesTabliers, setLignesTabliers] = useState<CommandeTablier[]>([]);
  const [lignesMoustiquaires, setLignesMoustiquaires] = useState<BesoinMoustiquaire[]>([]);
  const [lignesPrecadres, setLignesPrecadres] = useState<CommandePrecadre[]>([]);

  // Statistiques et liste des commandes distinctes par famille au sein du dossier
  const statsCommandesParFamille = useMemo(() => {
    const calcStats = (lines: { refCommande?: string; sfRefCommande?: string; avecSousFace?: boolean; quantite?: number }[] = [], currentNum: string = '') => {
      const map = new Map<string, number>();
      const safeLines = Array.isArray(lines) ? lines : [];
      safeLines.forEach(l => {
        if (!l) return;
        const ref = (l.refCommande || 'CMD').trim();
        const qte = Math.max(1, Number((l as any).quantite) || 1);
        map.set(ref, (map.get(ref) || 0) + qte);
      });
      const cNum = (currentNum || '').trim();
      if (cNum && !map.has(cNum)) {
        map.set(cNum, 0);
      }
      return Array.from(map.entries()).map(([ref, count]) => ({ ref, count }));
    };

    return {
      CAISSON: calcStats(lignesCaissons, numCommandeCaisson),
      TABLIER: calcStats(lignesTabliers, numCommandeTablier),
      MOUSTIQUAIRE: calcStats(lignesMoustiquaires, numCommandeMoustiquaire),
      PRECADRE: calcStats(lignesPrecadres, numCommandePrecadre)
    };
  }, [lignesCaissons, lignesTabliers, lignesMoustiquaires, lignesPrecadres, numCommandeCaisson, numCommandeTablier, numCommandeMoustiquaire, numCommandePrecadre]);

  // Vérifie si le dossier/commande en cours est bien enregistré dans la base
  const isCommandeEnregistree = useMemo(() => {
    if (!editingDossierId) return false;
    const currentSavedDossier = (dossiers || []).find(d => d.id === editingDossierId);
    if (!currentSavedDossier) return false;

    const caissonsSaved = currentSavedDossier.articlesCaissons || [];
    const tabliersSaved = currentSavedDossier.articlesTabliers || [];
    const mstqSaved = currentSavedDossier.articlesMoustiquaires || [];
    const precadresSaved = currentSavedDossier.articlesPrecadres || [];

    if (caissonsSaved.length !== lignesCaissons.length) return false;
    if (tabliersSaved.length !== lignesTabliers.length) return false;
    if (mstqSaved.length !== lignesMoustiquaires.length) return false;
    if (precadresSaved.length !== lignesPrecadres.length) return false;

    return true;
  }, [editingDossierId, dossiers, lignesCaissons, lignesTabliers, lignesMoustiquaires, lignesPrecadres]);

  const listeCommandesFamilleActive = statsCommandesParFamille[familleArticle] || [];

  // Liste structurée de toutes les commandes distinctes enregistrées ou en cours dans le dossier
  const commandesDossierEnCours = useMemo(() => {
    const currentSavedDossier = editingDossierId ? (dossiers || []).find(d => d.id === editingDossierId) : null;
    const commandesConfirmeesSet = new Set<string>(currentSavedDossier?.commandesConfirmees || []);

    const map = new Map<string, {
      ref: string;
      caissons: number;
      sousFaces: number;
      tabliers: number;
      mstq: number;
      precadres: number;
      total: number;
      estConfirmee: boolean;
    }>();

    const getOrCreate = (refRaw?: string) => {
      const ref = (refRaw || 'CMD').trim();
      if (!map.has(ref)) {
        map.set(ref, {
          ref,
          caissons: 0,
          sousFaces: 0,
          tabliers: 0,
          mstq: 0,
          precadres: 0,
          total: 0,
          estConfirmee: commandesConfirmeesSet.has(ref)
        });
      }
      return map.get(ref)!;
    };

    // 1. Scanner les lignes actives (prioritaires si modifiées)
    lignesCaissons.forEach(c => {
      const caissonRef = (c.refCommande || numCommandeCaisson || currentSavedDossier?.numCommandeCaisson || currentSavedDossier?.refCommande || 'CMD').trim();
      const entry = getOrCreate(caissonRef);
      const qte = Math.max(1, Number(c.quantite) || 1);
      entry.caissons += qte;
      entry.total += qte;

      if (c.avecSousFace) {
        const sfRef = (c.sfRefCommande || numCommandeSousFace || currentSavedDossier?.numCommandeSousFace || caissonRef).trim();
        if (sfRef && sfRef !== caissonRef) {
          const sfEntry = getOrCreate(sfRef);
          sfEntry.sousFaces += qte;
        } else {
          entry.sousFaces += qte;
        }
      }
    });

    lignesTabliers.forEach(t => {
      const entry = getOrCreate(t.refCommande || numCommandeTablier || currentSavedDossier?.numCommandeTablier || currentSavedDossier?.refCommande);
      const qte = Math.max(1, Number(t.quantite) || 1);
      entry.tabliers += qte;
      entry.total += qte;
    });

    lignesMoustiquaires.forEach(m => {
      const entry = getOrCreate(m.refCommande || numCommandeMoustiquaire || currentSavedDossier?.numCommandeMoustiquaire || currentSavedDossier?.refCommande);
      const qte = Math.max(1, Number(m.quantite) || 1);
      entry.mstq += qte;
      entry.total += qte;
    });

    lignesPrecadres.forEach(p => {
      const entry = getOrCreate(p.refCommande || numCommandePrecadre || currentSavedDossier?.numCommandePrecadre || currentSavedDossier?.refCommande);
      const qte = Math.max(1, Number(p.quantite) || 1);
      entry.precadres += qte;
      entry.total += qte;
    });

    // 2. Si un dossier sauvegardé a des commandes non encore dans la map (ex: autres familles non chargées)
    if (currentSavedDossier) {
      (currentSavedDossier.articlesCaissons || []).forEach(c => {
        const caissonRef = (c.refCommande || currentSavedDossier.numCommandeCaisson || currentSavedDossier.refCommande || 'CMD').trim();
        getOrCreate(caissonRef);
      });
      (currentSavedDossier.articlesTabliers || []).forEach(t => {
        getOrCreate(t.refCommande || currentSavedDossier.numCommandeTablier || currentSavedDossier.refCommande);
      });
      (currentSavedDossier.articlesMoustiquaires || []).forEach(m => {
        getOrCreate(m.refCommande || currentSavedDossier.numCommandeMoustiquaire || currentSavedDossier.refCommande);
      });
      (currentSavedDossier.articlesPrecadres || []).forEach(p => {
        getOrCreate(p.refCommande || currentSavedDossier.numCommandePrecadre || currentSavedDossier.refCommande);
      });
    }

    return Array.from(map.values()).filter(c => c.ref && c.ref !== 'CMD');
  }, [editingDossierId, dossiers, lignesCaissons, lignesTabliers, lignesMoustiquaires, lignesPrecadres, numCommandeCaisson, numCommandeSousFace, numCommandeTablier, numCommandeMoustiquaire, numCommandePrecadre]);

  // Champs de saisie rapide de la prochaine ligne et références de focus intelligent
  const inputClientRef = useRef<HTMLInputElement>(null);
  const inputNumCmdRef = useRef<HTMLInputElement>(null);
  const inputLRef = useRef<HTMLInputElement>(null);
  const inputHRef = useRef<HTMLInputElement>(null);
  const inputQteRef = useRef<HTMLInputElement>(null);
  const inputRepereRef = useRef<HTMLInputElement>(null);
  const btnAjouterLigneRef = useRef<HTMLButtonElement>(null);
  const inputDateLivraisonRef = useRef<HTMLInputElement>(null);
  const [inputL, setInputL] = useState<string>('');
  const [inputH, setInputH] = useState<string>('');
  const [inputQte, setInputQte] = useState<string>('1');
  const [inputRepere, setInputRepere] = useState<string>('');

  // Délais de production & suivi des interruptions/pauses
  const [localSuivisOF, setLocalSuivisOF] = useState<SuiviOF[]>([]);
  const suivisOF = useMemo(() => {
    if (localSuivisOF.length > 0 && (!suivisOFProp || localSuivisOF.length >= (suivisOFProp?.length || 0))) {
      return localSuivisOF;
    }
    return (suivisOFProp && suivisOFProp.length > 0) ? suivisOFProp : localSuivisOF;
  }, [suivisOFProp, localSuivisOF]);

  const [dateLivraisonPrevisionnelle, setDateLivraisonPrevisionnelle] = useState<string>('');
  const [dateLivraisonPrevisionnelleISO, setDateLivraisonPrevisionnelleISO] = useState<string>('');
  const [delaiFixeManuellement, setDelaiFixeManuellement] = useState<boolean>(false);
  const [typePriorite, setTypePriorite] = useState<'INSTANTANE' | 'DIFFERE'>('DIFFERE');
  const [estPrioritaire, setEstPrioritaire] = useState<boolean>(false);
  const [motifPriorite, setMotifPriorite] = useState<string>('');
  const [estEnPause, setEstEnPause] = useState<boolean>(false);
  const [motifPause, setMotifPause] = useState<string>('');
  const [datePause, setDatePause] = useState<string>('');
  const [dureePauseJours, setDureePauseJours] = useState<number>(0);
  const [afficherEditeurLivraison, setAfficherEditeurLivraison] = useState<boolean>(false);
  const [showValidationDelaiModal, setShowValidationDelaiModal] = useState<boolean>(false);
  const [statutCiblePourEnregistrement, setStatutCiblePourEnregistrement] = useState<'EN_ATTENTE' | 'BROUILLON' | 'EN_COURS'>('EN_ATTENTE');
  const [isSavingDossier, setIsSavingDossier] = useState<boolean>(false);

  // Charger les OFs pour les calculs de files d'attente
  const refreshSuivisOF = useCallback(async () => {
    try {
      const ofs = await StorageService.getSuivisOF();
      if (Array.isArray(ofs)) setLocalSuivisOF(ofs);
    } catch {}
  }, []);

  useEffect(() => {
    refreshSuivisOF();
  }, [refreshSuivisOF, dossiers]);

  const ouvrirValidationDelaiModal = useCallback(async (statut?: 'EN_ATTENTE' | 'BROUILLON' | 'EN_COURS') => {
    if (statut) {
      setStatutCiblePourEnregistrement(statut);
    }
    await refreshSuivisOF();
    setShowValidationDelaiModal(true);
  }, [refreshSuivisOF]);

  // Dossier virtuel pour le calcul en direct de l'estimation de livraison
  const dossierActuelVirtuel: DossierCommandeGlobal = useMemo(() => {
    const activeRef = getActiveNumCommande() || 'DOSSIER-EN-COURS';
    return {
      id: editingDossierId || 'dossier-virtuel',
      donneurOrdre: monClient,
      nomClientFinal: clientDeMonClient || 'Client',
      dateCommande: dateCommande,
      refCommande: activeRef,
      articlesCaissons: lignesCaissons,
      articlesTabliers: lignesTabliers,
      articlesMoustiquaires: lignesMoustiquaires,
      articlesPrecadres: lignesPrecadres,
      statut: estEnPause ? 'EN_PAUSE' : (editingDossierId ? (dossiers.find(d => d.id === editingDossierId)?.statut || 'EN_ATTENTE') : 'EN_ATTENTE'),
      estEnPause: estEnPause,
      motifPause: motifPause,
      datePause: datePause,
      dureePauseJours: dureePauseJours,
      typePriorite: typePriorite,
      estPrioritaire: typePriorite === 'INSTANTANE' || estPrioritaire,
      motifPriorite: typePriorite === 'INSTANTANE' ? motifPriorite : undefined,
      dateLivraisonPrevisionnelle: delaiFixeManuellement ? dateLivraisonPrevisionnelle : undefined,
      dateLivraisonPrevisionnelleISO: delaiFixeManuellement ? dateLivraisonPrevisionnelleISO : undefined,
    };
  }, [
    editingDossierId, monClient, clientDeMonClient, dateCommande,
    numCommandeCaisson, numCommandeTablier, numCommandeMoustiquaire, numCommandePrecadre,
    lignesCaissons, lignesTabliers, lignesMoustiquaires, lignesPrecadres,
    estEnPause, motifPause, datePause, dureePauseJours,
    typePriorite, estPrioritaire, motifPriorite,
    delaiFixeManuellement, dateLivraisonPrevisionnelle, dateLivraisonPrevisionnelleISO,
    dossiers
  ]);

  const estimationLivraisonLive = useMemo(() => {
    return DelaisProductionService.estimerDelaiDossier(
      dossierActuelVirtuel,
      dossiers,
      suivisOF
    );
  }, [dossierActuelVirtuel, dossiers, suivisOF]);

  const texteLivraisonAffiche = useMemo(() => {
    if (estEnPause) {
      return `⏸️ EN PAUSE (${estimationLivraisonLive.dateLivraisonFormattee})`;
    }
    if (delaiFixeManuellement && dateLivraisonPrevisionnelle) {
      return dateLivraisonPrevisionnelle;
    }
    return estimationLivraisonLive.dateLivraisonFormattee;
  }, [estEnPause, delaiFixeManuellement, dateLivraisonPrevisionnelle, estimationLivraisonLive]);

  // Raccourcis pour fixer la livraison
  const appliquerRaccourciLivraison = (joursAjoutes: number) => {
    let cible: Date;
    if (joursAjoutes === 0) {
      cible = new Date();
    } else {
      const params = DelaisProductionService.getParametres();
      const dRef = DelaisProductionService.parseDateString(dateCommande) || new Date();
      cible = DelaisProductionService.ajouterJoursOuvres(dRef, joursAjoutes, params.joursOuvres);
    }
    const iso = DelaisProductionService.toISODateString(cible);
    const formattee = DelaisProductionService.formaterDateLivraison(cible);
    setDateLivraisonPrevisionnelleISO(iso);
    setDateLivraisonPrevisionnelle(formattee);
    setDelaiFixeManuellement(true);
    if (joursAjoutes === 0) {
      setEstPrioritaire(true);
    }
    showFlashNotification(`Délai de livraison fixé : ${formattee}`, 'info');
  };

  const reinitialiserDelaiAutomatique = () => {
    setDelaiFixeManuellement(false);
    setDateLivraisonPrevisionnelle('');
    setDateLivraisonPrevisionnelleISO('');
    showFlashNotification(`Délai recalculé automatiquement selon la charge atelier.`, 'info');
  };

  const togglePauseCommande = async () => {
    const newPause = !estEnPause;
    const dateAuj = getTodayDateString();

    let newDuree = dureePauseJours;
    if (!newPause && datePause) {
      const dP = DelaisProductionService.parseDateString(datePause);
      const now = new Date();
      const diffJours = Math.max(0, Math.floor((now.getTime() - dP.getTime()) / (1000 * 60 * 60 * 24)));
      newDuree += diffJours;
      setDureePauseJours(newDuree);
    }

    setEstEnPause(newPause);
    setDatePause(newPause ? dateAuj : '');
    const currentMotif = motifPause || 'Rupture de stock matière / attente approvisionnement';
    if (newPause && !motifPause) {
      setMotifPause(currentMotif);
    }

    if (editingDossierId) {
      try {
        const allDossiers = await StorageService.getDossiers();
        const currentDossier = allDossiers.find(d => d.id === editingDossierId);
        if (currentDossier) {
          currentDossier.estEnPause = newPause;
          currentDossier.statut = newPause ? 'EN_PAUSE' : 'EN_COURS';
          currentDossier.datePause = newPause ? dateAuj : undefined;
          currentDossier.motifPause = newPause ? currentMotif : undefined;
          currentDossier.dureePauseJours = newDuree;
          await StorageService.saveDossiers(allDossiers);
          if (onDossiersUpdated) onDossiersUpdated();
        }

        // Synchroniser tous les OFs associés via StorageService
        const ofs = await StorageService.getSuivisOF();
        const dRefs = [
          editingDossierId,
          numCommandeCaisson,
          numCommandeSousFace,
          numCommandeTablier,
          numCommandeMoustiquaire,
          numCommandePrecadre,
          getActiveNumCommande()
        ].filter(Boolean).map(r => r!.trim().toLowerCase());

        const matchingOFs = ofs.filter(o =>
          (o.dossierId && o.dossierId === editingDossierId) ||
          dRefs.some(r => {
            const oCmd = (o.numCommande || '').trim().toLowerCase();
            return oCmd && (oCmd === r || oCmd.includes(r) || r.includes(oCmd));
          })
        );

        for (const of of matchingOFs) {
          await StorageService.mettreAJourStatutOF(
            of.id,
            newPause ? 'EN_PAUSE' : (of.lignesRetour && of.lignesRetour.length > 0 ? 'RETOUR_EN_ATTENTE' : 'EMIS'),
            undefined,
            newPause,
            newPause ? currentMotif : undefined
          );
        }
        if (refreshSuivisOF) refreshSuivisOF();
      } catch (err) {
        console.error('Erreur sauvegarde pause dossier:', err);
      }
    }

    showFlashNotification(
      newPause
        ? '⏸️ Dossier mis en pause. L\'interruption est répercutée sur tous ses ordres de fabrication.'
        : '▶️ Reprise du dossier. Les OFs et délais de fabrication sont réactivés.',
      newPause ? 'warn' : 'success'
    );
  };

  const handleTogglePauseCommandeIndividuelle = async (cmdRef: string) => {
    try {
      const ofs = await StorageService.getSuivisOF();
      const cleanRef = cmdRef.trim().toLowerCase();
      const matchingOFs = ofs.filter(o => {
        const oCmd = (o.numCommande || '').trim().toLowerCase();
        return oCmd && (oCmd === cleanRef || oCmd.includes(cleanRef) || cleanRef.includes(oCmd));
      });

      const anyPaused = matchingOFs.some(o => o.statut === 'EN_PAUSE' || o.estEnPause);
      const newPauseState = !anyPaused;
      const motif = newPauseState ? 'Commande mise en pause manuellement' : undefined;

      for (const of of matchingOFs) {
        await StorageService.mettreAJourStatutOF(
          of.id,
          newPauseState ? 'EN_PAUSE' : (of.lignesRetour && of.lignesRetour.length > 0 ? 'RETOUR_EN_ATTENTE' : 'EMIS'),
          undefined,
          newPauseState,
          motif
        );
      }

      if (editingDossierId) {
        const allDossiers = await StorageService.getDossiers();
        const d = allDossiers.find(dos => dos.id === editingDossierId);
        if (d) {
          if (newPauseState) {
            d.estEnPause = true;
            d.statut = 'EN_PAUSE';
            d.datePause = getTodayDateString();
            d.motifPause = 'Commande mise en pause';
          } else {
            const refreshedOFs = await StorageService.getSuivisOF();
            const otherPaused = refreshedOFs.some(o => o.dossierId === d.id && (o.statut === 'EN_PAUSE' || o.estEnPause));
            if (!otherPaused) {
              d.estEnPause = false;
              d.statut = 'EN_COURS';
              d.datePause = undefined;
            }
          }
          await StorageService.saveDossiers(allDossiers);
          if (onDossiersUpdated) onDossiersUpdated();
        }
      }

      if (refreshSuivisOF) refreshSuivisOF();
      showFlashNotification(
        newPauseState
          ? `⏸️ Commande N° ${cmdRef} et ses OFs mis en pause.`
          : `▶️ Commande N° ${cmdRef} réactivée en production.`,
        newPauseState ? 'warn' : 'success'
      );
    } catch (e) {
      console.error('Erreur toggle pause commande individuelle:', e);
      showFlashNotification('Erreur lors du changement de statut de pause.', 'warn');
    }
  };

  // Focus initial et réactif intelligent
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!clientDeMonClient.trim()) {
        inputClientRef.current?.focus();
      } else {
        const numSansPref = extraireNumeroSansPrefixe(getActiveNumCommande(), clientCodifications);
        if (!numSansPref.trim()) {
          inputNumCmdRef.current?.focus();
        }
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [familleArticle]);

  // Édition directe des lignes de Caissons
  const [editingCaissonId, setEditingCaissonId] = useState<string | null>(null);
  const [editCaissonForm, setEditCaissonForm] = useState<CommandeCaisson | null>(null);

  // Édition directe des lignes de Tablier / Volet
  const [editingTablierId, setEditingTablierId] = useState<string | null>(null);
  const [editTablierForm, setEditTablierForm] = useState<{
    id: string;
    refCommande?: string;
    repere: string;
    largeur: number;
    hauteur: number;
    quantite: number;
    typeFabrication: 'TABLIER_SEUL' | 'VOLET_COMPLET';
    avecLameFinale: boolean;
    articleCode?: string;
    articleDesignation?: string;
    lfArticleCode?: string;
    lfArticleDesignation?: string;
    glArticleCode?: string;
    glArticleDesignation?: string;
  } | null>(null);

  const handleStartEditCaisson = (c: CommandeCaisson) => {
    const ctFound = articlesCT.find(a => a.code_art === c.articleCode || a.designation === c.articleDesignation) || articlesCT[0];
    const sfFound = articlesSF.find(a => a.code_art === c.sfArticleCode || a.designation === c.sfArticleDesignation) || articlesSF[0];

    setEditingCaissonId(c.id);
    setEditCaissonForm({
      ...c,
      articleCode: c.articleCode || ctFound.code_art,
      articleDesignation: c.articleDesignation || ctFound.designation,
      sfArticleCode: c.sfArticleCode || sfFound.code_art,
      sfArticleDesignation: c.sfArticleDesignation || sfFound.designation
    });
  };

  const handleCancelEditCaisson = () => {
    setEditingCaissonId(null);
    setEditCaissonForm(null);
  };

  const handleSaveEditCaisson = () => {
    if (!editCaissonForm) return;
    if (editCaissonForm.longueur <= 0 || editCaissonForm.quantite <= 0) {
      showFlashNotification('Veuillez saisir une longueur et une quantité valides.', 'warn');
      return;
    }
    const ctFound = articlesCT.find(a => a.code_art === editCaissonForm.articleCode);
    const sfFound = articlesSF.find(a => a.code_art === editCaissonForm.sfArticleCode);

    const updated = lignesCaissons.map(c => {
      if (c.id === editCaissonForm.id) {
        const cmdCaisson = (editCaissonForm.refCommande || '').trim() || c.refCommande || numCommandeCaisson || 'CMD-CAISSON';
        const cmdSF = editCaissonForm.avecSousFace
          ? ((editCaissonForm.sfRefCommande || '').trim() || (editCaissonForm.refCommande || '').trim() || numCommandeSousFace || numCommandeCaisson || 'CMD-SF')
          : undefined;

        return {
          ...editCaissonForm,
          refCommande: cmdCaisson,
          sfRefCommande: cmdSF,
          articleCode: ctFound?.code_art || editCaissonForm.articleCode,
          articleDesignation: ctFound?.designation || editCaissonForm.articleDesignation,
          sfArticleCode: sfFound?.code_art || editCaissonForm.sfArticleCode,
          sfArticleDesignation: sfFound?.designation || editCaissonForm.sfArticleDesignation
        };
      }
      return c;
    });

    setLignesCaissons(updated);
    setEditingCaissonId(null);
    setEditCaissonForm(null);
    showFlashNotification('✓ Ligne de caisson mise à jour avec succès.', 'success');
  };

  const handleStartEditTablier = (t: CommandeTablier) => {
    const tblObj = articlesTablier.find(a => a.code_art === t.articleCode) || articlesTablier[0];
    const lfObj = articlesLameFinale.find(a => a.code_art === t.lfArticleCode) || articlesLameFinale[0];
    const glObj = articlesCoulisses.find(a => a.code_art === t.glArticleCode) || articlesCoulisses[0];

    setEditingTablierId(t.id);
    setEditTablierForm({
      id: t.id,
      refCommande: t.refCommande,
      repere: t.repere,
      largeur: t.largeur,
      hauteur: t.hauteur,
      quantite: t.quantite,
      typeFabrication: t.typeFabrication,
      avecLameFinale: t.avecLameFinale,
      articleCode: t.articleCode || tblObj.code_art,
      articleDesignation: t.articleDesignation || tblObj.designation,
      lfArticleCode: t.lfArticleCode || lfObj.code_art,
      lfArticleDesignation: t.lfArticleDesignation || lfObj.designation,
      glArticleCode: t.glArticleCode || glObj.code_art,
      glArticleDesignation: t.glArticleDesignation || glObj.designation
    });
  };

  const handleCancelEditTablier = () => {
    setEditingTablierId(null);
    setEditTablierForm(null);
  };

  const handleSaveEditTablier = () => {
    if (!editTablierForm) return;
    const l = Number(editTablierForm.largeur);
    const h = Number(editTablierForm.hauteur);
    if (isNaN(l) || l <= 0 || isNaN(h) || h <= 0) {
      showFlashNotification('Veuillez saisir des dimensions valides.', 'warn');
      return;
    }

    const tblObj = articlesTablier.find(a => a.code_art === editTablierForm.articleCode) || articlesTablier[0];
    const hLame = getHauteurLameTablier(editTablierForm.articleCode, editTablierForm.articleDesignation || tblObj?.designation, tblObj?.hauteur || 43);

    const updated = lignesTabliers.map(t => {
      if (t.id === editTablierForm.id) {
        return {
          ...t,
          refCommande: editTablierForm.refCommande || t.refCommande,
          repere: editTablierForm.repere,
          largeur: l,
          hauteur: h,
          quantite: Math.max(1, editTablierForm.quantite),
          hauteur_lame_tablier: hLame,
          nb_lame: Math.ceil(h / hLame) + (editTablierForm.typeFabrication === 'VOLET_COMPLET' ? 2 : 0),
          typeFabrication: editTablierForm.typeFabrication,
          avecLameFinale: editTablierForm.avecLameFinale,
          avecCoulisses: editTablierForm.typeFabrication === 'VOLET_COMPLET',
          articleCode: editTablierForm.articleCode,
          articleDesignation: editTablierForm.articleDesignation,
          lfArticleCode: editTablierForm.avecLameFinale ? editTablierForm.lfArticleCode : undefined,
          lfArticleDesignation: editTablierForm.avecLameFinale ? editTablierForm.lfArticleDesignation : undefined,
          glArticleCode: editTablierForm.typeFabrication === 'VOLET_COMPLET' ? editTablierForm.glArticleCode : undefined,
          glArticleDesignation: editTablierForm.typeFabrication === 'VOLET_COMPLET' ? editTablierForm.glArticleDesignation : undefined
        };
      }
      return t;
    });

    setLignesTabliers(updated);
    setEditingTablierId(null);
    setEditTablierForm(null);
    showFlashNotification('✓ Ligne de tablier/volet mise à jour avec succès.', 'success');
  };

  // --- ÉDITION DIRECTE DES MOUSTIQUAIRES ---
  const [editingMstqId, setEditingMstqId] = useState<string | null>(null);
  const [editMstqForm, setEditMstqForm] = useState<BesoinMoustiquaire | null>(null);

  const handleStartEditMstq = (m: BesoinMoustiquaire) => {
    const mailleObj = articlesMailleMSTQ.find(a => a.code_art === m.articleCodeMaille) || articlesMailleMSTQ[0];
    const cadreObj = articlesCadreMSTQ.find(a => a.code_art === m.articleCodeCadre) || articlesCadreMSTQ[0];
    const coulisseObj = articlesCoulisseMSTQ.find(a => a.code_art === m.articleCodeCoulisse) || articlesCoulisseMSTQ[0];
    const barreInfObj = articlesBarreInfMSTQ.find(a => a.code_art === m.articleCodeBarreInf) || articlesBarreInfMSTQ[0];

    setEditingMstqId(m.id);
    setEditMstqForm({
      ...m,
      typeOuverture: m.typeOuverture || 'PORTE_FENETRE',
      typeFabrication: m.typeFabrication || 'COMPLET',
      avecBarreInferieure: !!m.avecBarreInferieure,
      articleCodeMaille: m.articleCodeMaille || mailleObj?.code_art || 'ART0051',
      articleDesignationMaille: m.articleDesignationMaille || mailleObj?.designation || 'MSTQ MAILLE PLISSÉE 20mm',
      articleCodeCadre: m.articleCodeCadre || cadreObj?.code_art || 'ART0052',
      articleDesignationCadre: m.articleDesignationCadre || cadreObj?.designation || 'CADRE MSTQ 7024',
      articleCodeCoulisse: m.articleCodeCoulisse || coulisseObj?.code_art || 'ART0053',
      articleDesignationCoulisse: m.articleDesignationCoulisse || coulisseObj?.designation || 'BARRE COULISSE MSTQ 7024',
      articleCodeBarreInf: m.articleCodeBarreInf || barreInfObj?.code_art || 'ART0054',
      articleDesignationBarreInf: m.articleDesignationBarreInf || barreInfObj?.designation || 'BARRE INFERIEURE MSTQ 7024'
    });
  };

  const handleCancelEditMstq = () => {
    setEditingMstqId(null);
    setEditMstqForm(null);
  };

  const handleSaveEditMstq = () => {
    if (!editMstqForm) return;
    const l = Number(editMstqForm.largeur);
    const h = Number(editMstqForm.hauteur);
    if (isNaN(l) || l <= 0 || isNaN(h) || h <= 0) {
      showFlashNotification('Veuillez saisir des dimensions valides.', 'warn');
      return;
    }

    const updated = lignesMoustiquaires.map(m => {
      if (m.id === editMstqForm.id) {
        return {
          ...m,
          refCommande: editMstqForm.refCommande || m.refCommande,
          repere: editMstqForm.repere,
          largeur: l,
          hauteur: h,
          quantite: Math.max(1, editMstqForm.quantite),
          typeOuverture: editMstqForm.typeOuverture,
          typeFabrication: editMstqForm.typeFabrication,
          avecBarreInferieure: editMstqForm.avecBarreInferieure,
          articleCodeMaille: editMstqForm.articleCodeMaille,
          articleDesignationMaille: editMstqForm.articleDesignationMaille,
          articleCodeCadre: editMstqForm.articleCodeCadre,
          articleDesignationCadre: editMstqForm.articleDesignationCadre,
          articleCodeCoulisse: editMstqForm.articleCodeCoulisse,
          articleDesignationCoulisse: editMstqForm.articleDesignationCoulisse,
          articleCodeBarreInf: editMstqForm.articleCodeBarreInf,
          articleDesignationBarreInf: editMstqForm.articleDesignationBarreInf
        };
      }
      return m;
    });

    setLignesMoustiquaires(updated);
    setEditingMstqId(null);
    setEditMstqForm(null);
    showFlashNotification('✓ Ligne moustiquaire mise à jour avec succès.', 'success');
  };

  // --- ÉDITION DIRECTE ET OPTIMISATION DES PRÉCADRES ---
  const [editingPrecadreId, setEditingPrecadreId] = useState<string | null>(null);
  const [editPrecadreForm, setEditPrecadreForm] = useState<CommandePrecadre | null>(null);

  const handleStartEditPrecadre = (p: CommandePrecadre) => {
    const prcObj = articlesPrecadre.find(a => a.code_art === p.articleCode) || articlesPrecadre[0];
    const bchObj = articlesBouchonPrecadre.find(a => a.code_art === p.bouchonArticleCode) || articlesBouchonPrecadre[0];
    setEditingPrecadreId(p.id);
    setEditPrecadreForm({
      ...p,
      refCommande: p.refCommande,
      figure: p.figure || 'VIDE',
      modeDebordement: p.modeDebordement || 'SUPERIEUR_INFERIEUR',
      debordementSuperieur: p.debordementSuperieur !== undefined ? p.debordementSuperieur : 100,
      debordementInferieur: p.debordementInferieur !== undefined ? p.debordementInferieur : 300,
      articleCode: p.articleCode || prcObj?.code_art || 'ART0060',
      articleDesignation: p.articleDesignation || prcObj?.designation || 'PRÉCADRE PRC 43',
      bouchonArticleCode: p.bouchonArticleCode || bchObj?.code_art || 'ART0065',
      bouchonArticleDesignation: p.bouchonArticleDesignation || bchObj?.designation || 'BOUCHON PRECADRE 43'
    });
  };

  const handleCancelEditPrecadre = () => {
    setEditingPrecadreId(null);
    setEditPrecadreForm(null);
  };

  const handleSaveEditPrecadre = () => {
    if (!editPrecadreForm) return;
    const l = Number(editPrecadreForm.largeur);
    const h = Number(editPrecadreForm.hauteur);
    if (isNaN(l) || l <= 0 || isNaN(h) || h <= 0) {
      showFlashNotification('Veuillez saisir des dimensions valides.', 'warn');
      return;
    }

    const prcObj = articlesPrecadre.find(a => a.code_art === editPrecadreForm.articleCode) || articlesPrecadre[0];
    const bchObj = articlesBouchonPrecadre.find(a => a.code_art === editPrecadreForm.bouchonArticleCode) || articlesBouchonPrecadre[0];

    const updated = lignesPrecadres.map(p => {
      if (p.id === editPrecadreForm.id) {
        return {
          ...editPrecadreForm,
          refCommande: (editPrecadreForm.refCommande || p.refCommande || '').trim(),
          largeur: l,
          hauteur: h,
          quantite: Math.max(1, editPrecadreForm.quantite),
          articleCode: prcObj?.code_art || editPrecadreForm.articleCode,
          articleDesignation: prcObj?.designation || editPrecadreForm.articleDesignation,
          bouchonArticleCode: bchObj?.code_art || editPrecadreForm.bouchonArticleCode,
          bouchonArticleDesignation: bchObj?.designation || editPrecadreForm.bouchonArticleDesignation
        };
      }
      return p;
    });

    setLignesPrecadres(updated);
    setEditingPrecadreId(null);
    setEditPrecadreForm(null);
    showFlashNotification('✓ Ligne de précadre mise à jour avec succès.', 'success');
  };

  // Sélection de la figure de renfort pour la configuration des nouvelles lignes de précadre (sans écraser les lignes précédentes)
  const handleSetPrecadreFigure = (newFigure: FigurePrecadre) => {
    setPrecadreConfig(prev => ({ ...prev, figure: newFigure }));
    const label = newFigure === 'VIDE' ? '1. Vide (sans renfort)'
      : newFigure === 'RENFORT_L1' ? '2. + Renfort Horizontal L1'
      : newFigure === 'RENFORT_H1' ? '3. + Renfort Vertical H1'
      : '4. Croisé R1/R2 + H1';
    showFlashNotification(`✓ Configuration figure sélectionnée : ${label}`, 'info');
  };

  // Sélection du mode de débordement pour la configuration des nouvelles lignes de précadre (sans écraser les lignes précédentes)
  const handleSetPrecadreModeDebordement = (newMode: ModeDebordementPrecadre) => {
    setPrecadreConfig(prev => ({ ...prev, modeDebordement: newMode }));
    const modeLabel = newMode === 'SUPERIEUR_INFERIEUR' ? 'Haut (+100) & Bas (+300)'
      : newMode === 'SUPERIEUR_SEUL' ? 'Haut (+100)'
      : newMode === 'INFERIEUR_SEUL' ? 'Bas (+300)'
      : 'Cadre Fermé (0/0)';
    showFlashNotification(`✓ Configuration débordement sélectionnée : ${modeLabel}`, 'info');
  };

  // Helper de calcul de hauteur des montants avec débordement
  const getHauteurMontantsPrecadre = (
    H: number,
    mode: ModeDebordementPrecadre,
    debSup: number = 100,
    debInf: number = 300
  ): number => {
    return getDimensionsPrecadrePiece(0, H, mode, debSup, debInf).hMontant;
  };

  // Optimisation Découpe Précadres
  const handleOptimiserPrecadres = () => {
    if (lignesPrecadres.length === 0) {
      showFlashNotification('Veuillez saisir au moins une ligne de précadre.', 'warn');
      return;
    }

    setShowAllModalDetails(false);
    setExpandedModalSections({});

    const generatedSections: SectionMultiArticleCaisson[] = [];

    // Groupement par code_art
    const groups = new Map<string, CommandePrecadre[]>();
    for (const ligne of lignesPrecadres) {
      const code = ligne.articleCode || precadreConfig.articleCode;
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code)!.push(ligne);
    }

    groups.forEach((lignesGroup, artCode) => {
      const artObj = safeArticles.find(a => a.code_art === artCode) || articlesPrecadre.find(a => a.code_art === artCode) || articlesPrecadre[0];
      const mappedSheetName = mapping[artObj.code_art] || null;
      const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];

      const longBarre = prcTechParams.longeur || artObj.longeur || 6000;
      const epScie = prcTechParams.lame || artObj.lame || 4.0;
      const rMin = prcTechParams.refus_min ?? artObj.refus_min ?? 300;
      const rMax = prcTechParams.refus_max ?? artObj.refus_max ?? 1200;

      const opt = new OptimiseurCoupe1D({
        longueurBarre: longBarre,
        epaisseurScie: epScie,
        refusMin: rMin,
        refusMax: rMax,
        mode: optMode,
        poidsTemps: poidsTemps
      });

      const piecesToCut: any[] = [];

      lignesGroup.forEach(c => {
        const debSup = c.debordementSuperieur !== undefined ? c.debordementSuperieur : 100;
        const debInf = c.debordementInferieur !== undefined ? c.debordementInferieur : 300;

        const { hMontant, lTraverse, lRenfortSeul, lDemiRenfortCroise, hRenfort, typeAssemblage } = getDimensionsPrecadrePiece(
          c.largeur,
          c.hauteur,
          c.modeDebordement,
          debSup,
          debInf
        );

        const cmdTag = (c.refCommande || numCommandePrecadre || numCommande || '').trim();

        // 1. Montant Vertical Ha (1er montant, Q par pré-cadre)
        piecesToCut.push({
          longueur: hMontant,
          quantite: 1 * c.quantite,
          label: `Ha-${c.repere} (Montant A — H=${hMontant}mm [${typeAssemblage === 'EQUERRE' ? 'Équerre 90°' : 'Bouchons 90°'}])${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
          repere: `Ha-${c.repere}`,
          refCommande: cmdTag || 'CMD-01'
        });

        // 2. Montant Vertical Hb (2ème montant, Q par pré-cadre)
        piecesToCut.push({
          longueur: hMontant,
          quantite: 1 * c.quantite,
          label: `Hb-${c.repere} (Montant B — H=${hMontant}mm [${typeAssemblage === 'EQUERRE' ? 'Équerre 90°' : 'Bouchons 90°'}])${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
          repere: `Hb-${c.repere}`,
          refCommande: cmdTag || 'CMD-01'
        });

        // 3. Traverse Haute La (1 par pré-cadre)
        piecesToCut.push({
          longueur: lTraverse,
          quantite: 1 * c.quantite,
          label: `La-${c.repere} (Traverse Haute — L=${lTraverse}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
          repere: `La-${c.repere}`,
          refCommande: cmdTag || 'CMD-01'
        });

        // 4. Traverse Basse Lb (1 par pré-cadre)
        piecesToCut.push({
          longueur: lTraverse,
          quantite: 1 * c.quantite,
          label: `Lb-${c.repere} (Traverse Basse — L=${lTraverse}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
          repere: `Lb-${c.repere}`,
          refCommande: cmdTag || 'CMD-01'
        });

        // 5. Renfort Horizontal Central L1 (Seul)
        if (c.figure === 'RENFORT_L1') {
          piecesToCut.push({
            longueur: lRenfortSeul,
            quantite: 1 * c.quantite,
            label: `L1-${c.repere} (Renfort Horizontal — L1=${lRenfortSeul}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
            repere: `L1-${c.repere}`,
            refCommande: cmdTag || 'CMD-01'
          });
        } else if (c.figure === 'RENFORT_CROISE') {
          // Demi-renfort 1 (R1)
          piecesToCut.push({
            longueur: lDemiRenfortCroise,
            quantite: 1 * c.quantite,
            label: `R1-${c.repere} (Demi-Renfort Horizontal 1 — R1=${lDemiRenfortCroise}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
            repere: `R1-${c.repere}`,
            refCommande: cmdTag || 'CMD-01'
          });
          // Demi-renfort 2 (R2)
          piecesToCut.push({
            longueur: lDemiRenfortCroise,
            quantite: 1 * c.quantite,
            label: `R2-${c.repere} (Demi-Renfort Horizontal 2 — R2=${lDemiRenfortCroise}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
            repere: `R2-${c.repere}`,
            refCommande: cmdTag || 'CMD-01'
          });
        }

        // 6. Renfort Vertical Central H1 (si RENFORT_H1 ou RENFORT_CROISE)
        if (c.figure === 'RENFORT_H1' || c.figure === 'RENFORT_CROISE') {
          piecesToCut.push({
            longueur: hRenfort,
            quantite: 1 * c.quantite,
            label: `H1-${c.repere} (Renfort Vertical — H1=${hRenfort}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
            repere: `H1-${c.repere}`,
            refCommande: cmdTag || 'CMD-01'
          });
        }
      });

      const res = opt.optimiser(piecesToCut, availableChutes);
      res.articleCode = artObj.code_art;
      res.articleDesignation = artObj.designation;
      res.refCommande = numCommandePrecadre.trim() || numCommande.trim() || 'CMD-01';
      res.nomClient = clientDeMonClient.trim() || 'CLIENT';
      res.donneurOrdre = monClient;
      res.dateCommande = dateCommande;
      const refsPRCInvolved = Array.from(new Set(lignesPrecadres.map(p => (p.refCommande || numCommandePrecadre || numCommande || '').trim()).filter(Boolean)));
      const activeRefs = refsPRCInvolved.length > 0 ? refsPRCInvolved : [numCommande.trim() || 'CMD-01'];
      generatedSections.push({
        articleCode: artObj.code_art,
        articleDesignation: artObj.designation,
        articleObj: artObj,
        resultat: res,
        type: 'PRC',
        famille: 'PRECADRE',
        commandesInvolved: activeRefs
      });
    });

    const refsPRCInvolved = Array.from(new Set(lignesPrecadres.map(p => (p.refCommande || numCommandePrecadre || numCommande || '').trim()).filter(Boolean)));
    const activeRefs = refsPRCInvolved.length > 0 ? refsPRCInvolved : [numCommande.trim() || 'CMD-01'];
    setMultiOptActiveRefs(activeRefs);
    setMultiOptFamilyFilter('ALL');
    setSectionsMultiCaisson(generatedSections);
    setModalDebitCaissonOpen(true);
  };

  // Confirmation de suppression pour l'historique
  const [confirmDeleteDossierId, setConfirmDeleteDossierId] = useState<string | null>(null);

  // Modal OF pour impression
  const [modalOFOpen, setModalOFOpen] = useState<boolean>(false);
  const [dossierToPrint, setDossierToPrint] = useState<DossierCommandeGlobal | null>(null);

  // Sections unifiées Multi-Familles (Caissons / Tabliers / Moustiquaires / Pré-cadres) pour OrdreFabricationModal
  const caissonSections = useMemo(() => {
    return sectionsMultiCaisson.map((sec) => {
      const fam = getSectionFamille(sec);
      let icon = '📦';
      let titlePrefix = 'SECTION';

      if (fam === 'MOUSTIQUAIRE') {
        if (sec.type === 'GL' || sec.articleDesignation.toUpperCase().includes('COULISSE')) {
          icon = '🔩';
          titlePrefix = 'MSTQ COULISSE';
        } else if (sec.type === 'SF' || sec.articleDesignation.toUpperCase().includes('BARRE INF')) {
          icon = '📏';
          titlePrefix = 'BARRE INFÉRIEURE MSTQ';
        } else {
          icon = '🖼️';
          titlePrefix = 'CADRE';
        }
      } else if (fam === 'PRECADRE' || sec.type === 'PRC') {
        icon = '🔲';
        titlePrefix = 'PRÉ-CADRE';
      } else if (fam === 'TABLIER') {
        if (sec.type === 'LF' || sec.articleDesignation.toUpperCase().includes('FINALE')) {
          icon = '🏁';
          titlePrefix = 'LAME FINALE (SEUIL)';
        } else if (sec.type === 'GL' || sec.articleDesignation.toUpperCase().includes('COULISSE')) {
          icon = '📐';
          titlePrefix = 'TAB COULISSE (VOLET)';
        } else {
          icon = '🚪';
          titlePrefix = 'LAMES TABLIER';
        }
      } else {
        // CAISSON
        if (sec.type === 'SF' || sec.articleDesignation.toUpperCase().includes('SOUS-FACE')) {
          icon = '📐';
          titlePrefix = 'SOUS-FACE ALU';
        } else {
          icon = '📦';
          titlePrefix = 'CAISSON TUNNEL';
        }
      }

      const isCT = fam === 'CAISSON' && sec.type === 'CT';

      // Nettoyer la désignation des balises internes
      const cleanDesignation = sec.articleDesignation
        .replace(/\[.*?\]/g, '')
        .replace(/^[📦📐🚪🏁🔩📏🔲🖼️]\s*/, '')
        .trim();

      return {
        titreSection: `${icon} ${titlePrefix} : ${cleanDesignation}`,
        article: sec.articleObj,
        resultat: sec.resultat,
        coloris: sec.coloris || 'BRUT',
        avecPeinture: isCT ? (sec.avecPeinture ?? false) : false,
        avecSousFace: isCT ? (sec.avecSousFace ?? false) : false,
        montageSousFace: sec.montageSousFace ?? 'NON_MONTEE',
        avecPlaque: isCT ? (sec.avecPlaque ?? caissonConfig.avecPlaque) : undefined,
        isSousFace: sec.type === 'SF',
        famille: fam,
        type: sec.type,
        commandesInvolved: sec.commandesInvolved,
        debordement: sec.debordement,
        conditionsCoupe: sec.conditionsCoupe
      };
    });
  }, [sectionsMultiCaisson]);

  // Sections unifiées Moustiquaire pour OrdreFabricationModal
  const mstqSections = useMemo(() => {
    return sectionsMultiMSTQ.map((sec) => {
      let icon = '🖼️';
      let titlePrefix = 'Cadre';
      if (sec.type === 'GL') {
        icon = '🔩';
        titlePrefix = 'Barre Coulisse MSTQ';
      } else if (sec.type === 'SF') {
        icon = '📏';
        titlePrefix = 'Barre Inférieure MSTQ';
      }

      return {
        titreSection: `${icon} ${titlePrefix} : ${sec.articleDesignation.replace(/\s*\([^)]*\)/g, '').trim()}`,
        article: sec.articleObj,
        resultat: sec.resultat,
        coloris: sec.coloris || 'G7024',
        type: sec.type || 'CADRE',
        famille: 'MOUSTIQUAIRE' as const,
        avecPeinture: false,
        avecSousFace: false,
        montageSousFace: 'NON_MONTEE',
        isSousFace: false
      };
    });
  }, [sectionsMultiMSTQ]);

  // Recherche & Filtres pour la vue d'ensemble
  const [filterDonneur, setFilterDonneur] = useState<string>('TOUS');
  const [filterStatut, setFilterStatut] = useState<string>('TOUS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Multi-sélection de commandes au sein du dossier en cours
  const [selectedCmdRefs, setSelectedCmdRefs] = useState<Set<string>>(new Set());
  const [multiOptActiveRefs, setMultiOptActiveRefs] = useState<string[]>([]);
  const [multiOptFamilyFilter, setMultiOptFamilyFilter] = useState<'ALL' | 'CAISSON' | 'TABLIER' | 'MOUSTIQUAIRE' | 'PRECADRE'>('ALL');

  const toggleSelectCmdRef = (ref: string) => {
    setSelectedCmdRefs(prev => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  const handleToggleSelectAllCmds = () => {
    if (commandesDossierEnCours.length === 0) return;
    if (selectedCmdRefs.size === commandesDossierEnCours.length) {
      setSelectedCmdRefs(new Set());
    } else {
      setSelectedCmdRefs(new Set(commandesDossierEnCours.map(c => c.ref)));
    }
  };

  // =========================================================================
  // ⚡ MOTEUR UNIFIÉ DE MULTI-OPTIMISATION DU DOSSIER PAR FAMILLE DE PRODUIT
  // Exige qu'au moins 1 commande soit sélectionnée (ou transmise).
  // Traite chaque famille (Caissons & SF, Tabliers & Volets, Moustiquaires, Précadres)
  // de manière isolée et ordonnée pour éviter tout mélange de numéros ou d'articles.
  // =========================================================================
  const handleOptimiserMultiFamillesDossier = async (targetRefs?: string | string[]) => {
    let allowedRefs: string[] = [];
    if (targetRefs) {
      allowedRefs = Array.isArray(targetRefs) ? targetRefs.map(r => r.trim()).filter(Boolean) : [targetRefs.trim()].filter(Boolean);
    } else if (selectedCmdRefs.size > 0) {
      allowedRefs = Array.from(selectedCmdRefs).map(r => r.trim()).filter(Boolean);
    }

    if (allowedRefs.length === 0) {
      showFlashNotification('⚠️ Veuillez cocher au moins une commande à multi-optimiser dans la liste ci-dessous.', 'warn');
      return;
    }

    setMultiOptActiveRefs(allowedRefs);
    setMultiOptFamilyFilter('ALL');

    const caissonsFiltres = lignesCaissons.filter(c => allowedRefs.includes((c.refCommande || numCommandeCaisson || '').trim()));
    const tabliersFiltres = lignesTabliers.filter(t => allowedRefs.includes((t.refCommande || numCommandeTablier || '').trim()));
    const mstqFiltres = lignesMoustiquaires.filter(m => allowedRefs.includes((m.refCommande || numCommandeMoustiquaire || '').trim()));
    const precadresFiltres = lignesPrecadres.filter(p => allowedRefs.includes((p.refCommande || numCommandePrecadre || '').trim()));

    const totalLignes = caissonsFiltres.length + tabliersFiltres.length + mstqFiltres.length + precadresFiltres.length;
    if (totalLignes === 0) {
      showFlashNotification(`Aucun article trouvé pour la sélection : ${allowedRefs.join(', ')}.`, 'warn');
      return;
    }

    setShowAllModalDetails(false);
    setExpandedModalSections({});

    const generatedSections: SectionMultiArticleCaisson[] = [];

    // Pré-calcul des groupes pour estimer précisément le nombre d'étapes
    const groupsCT = new Map<string, CommandeCaisson[]>();
    for (const ligne of caissonsFiltres) {
      if (ligne.isSousFaceSeule || ligne.typePrestation === 'SOUS_FACE_SEULE') continue;
      const code = ligne.articleCode || caissonConfig.ctArticleCode;
      if (!groupsCT.has(code)) groupsCT.set(code, []);
      groupsCT.get(code)!.push(ligne);
    }

    const lignesAvecSF = caissonsFiltres.filter(c =>
      c.typePrestation !== 'CAISSON_SEUL' && (c.avecSousFace || c.isSousFaceSeule || c.typePrestation === 'SOUS_FACE_SEULE')
    );
    const groupsSF = new Map<string, CommandeCaisson[]>();
    for (const ligne of lignesAvecSF) {
      const code = ligne.sfArticleCode || caissonConfig.sfArticleCode;
      if (!groupsSF.has(code)) groupsSF.set(code, []);
      groupsSF.get(code)!.push(ligne);
    }

    const groupsTBL = new Map<string, CommandeTablier[]>();
    for (const ligne of tabliersFiltres) {
      const code = ligne.articleCode || tablierConfig.articleCode;
      if (!groupsTBL.has(code)) groupsTBL.set(code, []);
      groupsTBL.get(code)!.push(ligne);
    }

    const lignesAvecLF = tabliersFiltres.filter(c => c.avecLameFinale);
    const groupsLF = new Map<string, CommandeTablier[]>();
    for (const ligne of lignesAvecLF) {
      const code = ligne.lfArticleCode || tablierConfig.lfArticleCode;
      if (!groupsLF.has(code)) groupsLF.set(code, []);
      groupsLF.get(code)!.push(ligne);
    }

    const lignesAvecGL = tabliersFiltres.filter(c => c.typeFabrication === 'VOLET_COMPLET' || c.avecCoulisses);
    const groupsGL = new Map<string, CommandeTablier[]>();
    for (const ligne of lignesAvecGL) {
      const code = ligne.glArticleCode || tablierConfig.glArticleCode;
      if (!groupsGL.has(code)) groupsGL.set(code, []);
      groupsGL.get(code)!.push(ligne);
    }

    const lignesAvecCadre = mstqFiltres.filter(m => m.typeFabrication !== 'SEMI_FINI_MAILLE');
    const groupsCadre = new Map<string, BesoinMoustiquaire[]>();
    if (lignesAvecCadre.length > 0) {
      for (const ligne of lignesAvecCadre) {
        const code = ligne.articleCodeCadre || mstqConfig.cadreArticleCode || 'ART0052';
        if (!groupsCadre.has(code)) groupsCadre.set(code, []);
        groupsCadre.get(code)!.push(ligne);
      }
    }

    const lignesAvecCoulisse = mstqFiltres.filter(m => m.typeFabrication !== 'SEMI_FINI_MAILLE' && m.typeOuverture !== 'FIXE');
    const groupsCoulisse = new Map<string, BesoinMoustiquaire[]>();
    if (lignesAvecCoulisse.length > 0) {
      for (const ligne of lignesAvecCoulisse) {
        if (ligne.typeOuverture === 'FIXE') continue;
        const code = ligne.articleCodeCoulisse || mstqConfig.coulisseArticleCode || 'ART0053';
        if (!groupsCoulisse.has(code)) groupsCoulisse.set(code, []);
        groupsCoulisse.get(code)!.push(ligne);
      }
    }

    const lignesAvecBI = mstqFiltres.filter(m => m.avecBarreInferieure && m.typeFabrication !== 'SEMI_FINI_MAILLE');
    const groupsBI = new Map<string, BesoinMoustiquaire[]>();
    if (lignesAvecBI.length > 0) {
      for (const ligne of lignesAvecBI) {
        const code = ligne.articleCodeBarreInf || mstqConfig.barreInfArticleCode || 'ART0054';
        if (!groupsBI.has(code)) groupsBI.set(code, []);
        groupsBI.get(code)!.push(ligne);
      }
    }

    const groupsPRC = new Map<string, CommandePrecadre[]>();
    for (const ligne of precadresFiltres) {
      const code = ligne.articleCode || precadreConfig.articleCode;
      if (!groupsPRC.has(code)) groupsPRC.set(code, []);
      groupsPRC.get(code)!.push(ligne);
    }

    const totalSteps = groupsCT.size + groupsSF.size + groupsTBL.size + groupsLF.size + groupsGL.size +
      groupsCadre.size + groupsCoulisse.size + groupsBI.size + groupsPRC.size;

    let stepIndex = 0;
    const notifyStep = async (label: string) => {
      stepIndex++;
      const percent = Math.min(95, Math.round((stepIndex / Math.max(1, totalSteps)) * 90) + 5);
      setOptProgress({
        active: true,
        percent,
        currentTask: label,
        sectionName: `Étape ${stepIndex} / ${totalSteps}`
      });
      // Permet au navigateur de rafraîchir l'affichage de la barre de progression et empêche l'alerte "Attendre ou Annuler"
      await new Promise(r => setTimeout(r, 25));
    };

    setOptProgress({
      active: true,
      percent: 5,
      currentTask: 'Initialisation des algorithmes de coupe et chargement des chutes...',
      sectionName: `Étape 0 / ${totalSteps}`
    });
    await new Promise(r => setTimeout(r, 40));

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // 1. OPTIMISATION CAISSONS TUNNEL (CT) & SOUS-FACES ALU (SF)
      // ─────────────────────────────────────────────────────────────────────────
      if (caissonsFiltres.length > 0) {
        const refsCaissonsInvolved = Array.from(new Set(caissonsFiltres.map(c => (c.refCommande || numCommandeCaisson || '').trim()).filter(Boolean)));
        const titreRefCaissons = refsCaissonsInvolved.length > 0 ? refsCaissonsInvolved.join(', ') : 'CAISSONS';

        // 1.1 Caissons CT
        for (const [artCode, lignesGroup] of groupsCT.entries()) {
          const artObj = safeArticles.find(a => a.code_art === artCode) || articlesCT.find(a => a.code_art === artCode) || articlesCT[0];
          await notifyStep(`Caisson Tunnel : ${artObj?.designation || artCode}`);

          const mappedSheetName = mapping[artObj?.code_art || ''] || null;
          const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];
          const ctParamsApplicables = caissonConfig.ctArticleCode === artObj?.code_art;
          const longBarre = (ctParamsApplicables && ctTechParams.longeur > 0) ? ctTechParams.longeur : (artObj?.longeur || 6500);
          const epScie = (ctParamsApplicables && ctTechParams.lame > 0) ? ctTechParams.lame : (artObj?.lame || 4.5);
          const debord = (ctParamsApplicables && ctTechParams.debordement !== undefined && ctTechParams.debordement !== null) ? ctTechParams.debordement : (artObj?.debordement || 0);
          const rMin = (ctParamsApplicables && ctTechParams.refus_min > 0) ? ctTechParams.refus_min : (artObj?.refus_min && artObj.refus_min > 0 ? artObj.refus_min : 500);
          const rMax = (ctParamsApplicables && ctTechParams.refus_max > 0) ? ctTechParams.refus_max : (artObj?.refus_max && artObj.refus_max > 0 ? artObj.refus_max : 1100);

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });
          const piecesToCut = lignesGroup.map(c => {
            const cmdTag = (c.refCommande || numCommandeCaisson || '').trim();
            return {
              longueur: c.longueur + debord,
              quantite: c.quantite,
              label: `${c.repere} (${artObj?.designation || artCode})${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
              repere: c.repere,
              refCommande: cmdTag || 'CMD-01'
            };
          });
          const res = opt.optimiser(piecesToCut, availableChutes);
          res.articleCode = artObj?.code_art || artCode;
          res.articleDesignation = artObj?.designation || 'Caisson Tunnel';
          res.refCommande = titreRefCaissons;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          const avecPeintureCT = lignesGroup.some(c => c.avecPeinture);
          const avecSousFaceCT = lignesGroup.some(c => c.avecSousFace);
          const montageCT = lignesGroup.some(c => c.montageSousFace === 'MONTEE_ATELIER') ? 'MONTEE_ATELIER' : 'NON_MONTEE';
          const avecPlaqueCT = lignesGroup.some(c => c.avecPlaque !== undefined ? c.avecPlaque : caissonConfig.avecPlaque);

          const conditionsCoupeCT = {
            longueurBarre: longBarre,
            epaisseurScie: epScie,
            debordement: debord,
            refusMin: rMin,
            refusMax: rMax
          };

          generatedSections.push({
            articleCode: artObj?.code_art || artCode,
            articleDesignation: `📦 [CAISSON TUNNEL] ${artObj?.designation || 'Caisson Tunnel'}`,
            articleObj: artObj,
            resultat: res,
            type: 'CT',
            famille: 'CAISSON',
            commandesInvolved: refsCaissonsInvolved,
            avecPeinture: avecPeintureCT,
            avecSousFace: avecSousFaceCT,
            montageSousFace: montageCT,
            avecPlaque: avecPlaqueCT,
            debordement: debord,
            conditionsCoupe: conditionsCoupeCT
          });
        }

        // 1.2 Sous-Faces SF
        for (const [sfCode, lignesGroup] of groupsSF.entries()) {
          const sfObj = safeArticles.find(a => a.code_art === sfCode) || articlesSF.find(a => a.code_art === sfCode) || articlesSF[0];
          await notifyStep(`Sous-Face Alu : ${sfObj?.designation || sfCode}`);

          const mappedSheetName = mapping[sfObj?.code_art || ''] || null;
          const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];
          const sfParamsApplicables = caissonConfig.sfArticleCode === sfObj?.code_art;
          const longBarreSF = (sfParamsApplicables && sfTechParams.longeur > 0) ? sfTechParams.longeur : (sfObj?.longeur || 6000);
          const epScieSF = (sfParamsApplicables && sfTechParams.lame > 0) ? sfTechParams.lame : (sfObj?.lame || 4.5);
          const debordSF = (sfParamsApplicables && sfTechParams.debordement !== undefined && sfTechParams.debordement !== null) ? sfTechParams.debordement : (sfObj?.debordement || 0);
          const rMinSF = (sfParamsApplicables && sfTechParams.refus_min > 0) ? sfTechParams.refus_min : (sfObj?.refus_min && sfObj.refus_min > 0 ? sfObj.refus_min : 300);
          const rMaxSF = (sfParamsApplicables && sfTechParams.refus_max > 0) ? sfTechParams.refus_max : (sfObj?.refus_max && sfObj.refus_max > 0 ? sfObj.refus_max : 500);

          const refsSFInvolved = Array.from(new Set(lignesGroup.map(c => (c.sfRefCommande || numCommandeSousFace || c.refCommande || numCommandeCaisson || '').trim()).filter(Boolean)));
          const titreRefSF = refsSFInvolved.length > 0 ? refsSFInvolved.join(', ') : (numCommandeSousFace.trim() || titreRefCaissons || 'SOUS-FACES');

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarreSF, epaisseurScie: epScieSF, refusMin: rMinSF, refusMax: rMaxSF, mode: optMode, poidsTemps });
          const piecesToCut = lignesGroup.map((c, i) => {
            const repSF = (c.repere || '').trim() || `C-${i + 1}`;
            const cmdTag = (c.sfRefCommande || numCommandeSousFace || c.refCommande || numCommandeCaisson || '').trim();
            return {
              longueur: c.longueur + debordSF,
              quantite: c.quantite,
              label: `${repSF} (${sfObj?.designation || sfCode})${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
              repere: repSF,
              refCommande: cmdTag || 'CMD-01'
            };
          });
          const res = opt.optimiser(piecesToCut, availableChutes);
          res.articleCode = sfObj?.code_art || sfCode;
          res.articleDesignation = sfObj?.designation || 'Sous-Face Alu';
          res.refCommande = titreRefSF;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          const conditionsCoupeSF = {
            longueurBarre: longBarreSF,
            epaisseurScie: epScieSF,
            debordement: debordSF,
            refusMin: rMinSF,
            refusMax: rMaxSF
          };

          generatedSections.push({
            articleCode: sfObj?.code_art || sfCode,
            articleDesignation: `📐 [SOUS-FACE ALU] ${sfObj?.designation || 'Sous-Face Alu'}`,
            articleObj: sfObj,
            resultat: res,
            type: 'SF',
            famille: 'CAISSON',
            commandesInvolved: refsSFInvolved,
            debordement: debordSF,
            conditionsCoupe: conditionsCoupeSF
          });
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 2. OPTIMISATION VOLETS / TABLIERS (Lames, Lame Finale, Coulisses)
      // ─────────────────────────────────────────────────────────────────────────
      if (tabliersFiltres.length > 0) {
        const refsTabliersInvolved = Array.from(new Set(tabliersFiltres.map(t => (t.refCommande || numCommandeTablier || '').trim()).filter(Boolean)));
        const titreRefTabliers = refsTabliersInvolved.length > 0 ? refsTabliersInvolved.join(', ') : 'TABLIERS';

        // 2.1 Lames Tablier (TBL)
        for (const [artCode, lignesGroup] of groupsTBL.entries()) {
          const artObj = safeArticles.find(a => a.code_art === artCode) || articlesTablier.find(a => a.code_art === artCode) || articlesTablier[0];
          await notifyStep(`Lames Tablier : ${artObj?.designation || artCode}`);

          const mappedSheetName = mapping[artObj?.code_art || ''] || null;
          const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];
          const tblParamsApplicables = tablierConfig.articleCode === artObj?.code_art;
          const longBarre = (tblParamsApplicables && tblTechParams.longeur > 0) ? tblTechParams.longeur : (artObj?.longeur || 6000);
          const epScie = (tblParamsApplicables && tblTechParams.lame > 0) ? tblTechParams.lame : (artObj?.lame || 4.0);
          const debord = (tblParamsApplicables && tblTechParams.debordement !== undefined && tblTechParams.debordement !== null) ? tblTechParams.debordement : (artObj?.debordement || 0);
          const rMin = (tblParamsApplicables && tblTechParams.refus_min > 0) ? tblTechParams.refus_min : (artObj?.refus_min ?? 250);
          const rMax = (tblParamsApplicables && tblTechParams.refus_max > 0) ? tblTechParams.refus_max : (artObj?.refus_max ?? 1000);

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });
          const piecesToCut: any[] = [];
          lignesGroup.forEach(c => {
            const isAvecVolet = c.typeFabrication === 'VOLET_COMPLET' || c.avecCoulisses;
            const hLame = getHauteurLameTablier(c.articleCode, c.articleDesignation || artObj?.designation, c.hauteur_lame_tablier);
            const nLamesPerVolet = Math.ceil(c.hauteur / hLame) + (isAvecVolet ? 2 : 0); // +2 lames de tablier (pas lame finale) du même profil si volet
            const totalLames = nLamesPerVolet * c.quantite;
            const cmdTag = (c.refCommande || numCommandeTablier || '').trim();

            const dedTablier = isAvecVolet 
              ? (hLame === 55 ? -28 : -65) 
              : debord;
            const lenLame = c.largeur + dedTablier;

            piecesToCut.push({
              longueur: lenLame,
              quantite: totalLames,
              label: `${c.repere} (${totalLames} lames ${artObj?.designation || artCode}) [${lenLame}mm]${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
              repere: c.repere,
              refCommande: cmdTag || 'CMD-01'
            });
          });
          const res = opt.optimiser(piecesToCut, availableChutes);
          res.articleCode = artObj?.code_art || artCode;
          res.articleDesignation = artObj?.designation || 'Lame Tablier';
          res.refCommande = titreRefTabliers;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          generatedSections.push({
            articleCode: artObj?.code_art || artCode,
            articleDesignation: `🚪 [LAME TABLIER] ${artObj?.designation || 'Lame Tablier'}`,
            articleObj: artObj,
            resultat: res,
            type: 'CT',
            famille: 'TABLIER',
            commandesInvolved: refsTabliersInvolved
          });
        }

        // 2.2 Lames Finales (LF)
        for (const [lfCode, lignesGroup] of groupsLF.entries()) {
          const lfObj = safeArticles.find(a => a.code_art === lfCode) || articlesLameFinale.find(a => a.code_art === lfCode) || articlesLameFinale[0];
          await notifyStep(`Lame Finale : ${lfObj?.designation || lfCode}`);

          const mappedSheetName = mapping[lfObj?.code_art || ''] || null;
          const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];
          const lfParamsApplicables = tablierConfig.lfArticleCode === lfObj?.code_art;
          const longBarreLF = (lfParamsApplicables && lfTechParams.longeur > 0) ? lfTechParams.longeur : (lfObj?.longeur || 6000);
          const epScieLF = (lfParamsApplicables && lfTechParams.lame > 0) ? lfTechParams.lame : (lfObj?.lame || 4.0);
          const debordLF = (lfParamsApplicables && lfTechParams.debordement !== undefined && lfTechParams.debordement !== null) ? lfTechParams.debordement : (lfObj?.debordement || 0);
          const rMinLF = (lfParamsApplicables && lfTechParams.refus_min > 0) ? lfTechParams.refus_min : (lfObj?.refus_min ?? 250);
          const rMaxLF = (lfParamsApplicables && lfTechParams.refus_max > 0) ? lfTechParams.refus_max : (lfObj?.refus_max ?? 1000);

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarreLF, epaisseurScie: epScieLF, refusMin: rMinLF, refusMax: rMaxLF, mode: optMode, poidsTemps });
          const piecesToCut = lignesGroup.map(c => {
            const isAvecVolet = c.typeFabrication === 'VOLET_COMPLET' || c.avecCoulisses;
            const hLame = getHauteurLameTablier(c.articleCode, c.articleDesignation || lfObj?.designation, c.hauteur_lame_tablier);
            const dedLF = isAvecVolet 
              ? (hLame === 55 ? -28 : -65) 
              : debordLF;
            const lenLF = c.largeur + dedLF;
            const cmdTag = (c.refCommande || numCommandeTablier || '').trim();

            return {
              longueur: lenLF,
              quantite: c.quantite,
              label: `LF-${c.repere} (${lfObj?.designation || lfCode}) [${lenLF}mm]${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
              repere: `LF-${c.repere}`,
              refCommande: cmdTag || 'CMD-01'
            };
          });
          const res = opt.optimiser(piecesToCut, availableChutes);
          res.articleCode = lfObj?.code_art || lfCode;
          res.articleDesignation = lfObj?.designation || 'Lame Finale';
          res.refCommande = titreRefTabliers;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          generatedSections.push({
            articleCode: lfObj?.code_art || lfCode,
            articleDesignation: `🏁 [LAME FINALE] ${lfObj?.designation || 'Lame Finale'}`,
            articleObj: lfObj,
            resultat: res,
            type: 'LF',
            famille: 'TABLIER',
            commandesInvolved: refsTabliersInvolved
          });
        }

        // 2.3 Coulisses (GL)
        for (const [glCode, lignesGroup] of groupsGL.entries()) {
          const glObj = safeArticles.find(a => a.code_art === glCode) || articlesCoulisses.find(a => a.code_art === glCode) || articlesCoulisses[0];
          await notifyStep(`Coulisses Volet : ${glObj?.designation || glCode}`);

          const mappedSheetName = mapping[glObj?.code_art || ''] || null;
          const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];
          const glParamsApplicables = tablierConfig.glArticleCode === glObj?.code_art;
          const longBarreGL = (glParamsApplicables && glTechParams.longeur > 0) ? glTechParams.longeur : (glObj?.longeur || 6000);
          const epScieGL = (glParamsApplicables && glTechParams.lame > 0) ? glTechParams.lame : (glObj?.lame || 4.0);
          const debordGL = (glParamsApplicables && glTechParams.debordement !== undefined && glTechParams.debordement !== null) ? glTechParams.debordement : (glObj?.debordement || 0);
          const rMinGL = (glParamsApplicables && glTechParams.refus_min > 0) ? glTechParams.refus_min : (glObj?.refus_min ?? 300);
          const rMaxGL = (glParamsApplicables && glTechParams.refus_max > 0) ? glTechParams.refus_max : (glObj?.refus_max ?? 1200);

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarreGL, epaisseurScie: epScieGL, refusMin: rMinGL, refusMax: rMaxGL, mode: optMode, poidsTemps });
          const piecesToCut: any[] = [];
          lignesGroup.forEach(c => {
            const cmdTag = (c.refCommande || numCommandeTablier || '').trim();
            const lenGL = c.hauteur + debordGL;
            piecesToCut.push({
              longueur: lenGL,
              quantite: 2 * c.quantite,
              label: `TAB-CS-${c.repere} (2 × TAB COULISSE ${glObj?.designation || glCode}) [${lenGL}mm]${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`,
              repere: `TAB-CS-${c.repere}`,
              refCommande: cmdTag || 'CMD-01'
            });
          });
          const res = opt.optimiser(piecesToCut, availableChutes);
          res.articleCode = glObj?.code_art || glCode;
          res.articleDesignation = glObj?.designation || 'TAB COULISSE';
          res.refCommande = titreRefTabliers;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          generatedSections.push({
            articleCode: glObj?.code_art || glCode,
            articleDesignation: `📐 [TAB COULISSE] ${glObj?.designation || 'Coulisses'}`,
            articleObj: glObj,
            resultat: res,
            type: 'GL',
            famille: 'TABLIER',
            commandesInvolved: refsTabliersInvolved
          });
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 3. OPTIMISATION MOUSTIQUAIRES (Cadre, Coulisses, Barre Inf)
      // ─────────────────────────────────────────────────────────────────────────
      if (mstqFiltres.length > 0) {
        const refsMSTQInvolved = Array.from(new Set(mstqFiltres.map(m => (m.refCommande || numCommandeMoustiquaire || '').trim()).filter(Boolean)));
        const titreRefMSTQ = refsMSTQInvolved.length > 0 ? refsMSTQInvolved.join(', ') : 'MOUSTIQUAIRES';

        // 3.1 Cadres Moustiquaire
        for (const [cadreCode, lignesGroup] of groupsCadre.entries()) {
          const cadreObj = safeArticles.find(a => a.code_art === cadreCode) || articlesCadreMSTQ[0];
          if (!cadreObj) continue;
          await notifyStep(`Cadre Moustiquaire : ${cadreObj.designation}`);

          const mappedSheet = mapping[cadreObj.code_art] || null;
          const availableChutes = mappedSheet ? chutesBarres[mappedSheet] || [] : [];
          const longBarre = mstqCadreTechParams.longeur || cadreObj.longeur || 6000;
          const epScie = mstqCadreTechParams.lame || cadreObj.lame || 4.0;
          const rMin = mstqCadreTechParams.refus_min || cadreObj.refus_min || 350;
          const rMax = mstqCadreTechParams.refus_max || cadreObj.refus_max || 1200;

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });
          const pieces: any[] = [];
          for (const m of lignesGroup) {
            const Q = Math.max(1, m.quantite);
            const cmdTag = (m.refCommande || numCommandeMoustiquaire || '').trim();
            const dedH = m.avecBarreInferieure ? -37 : (mstqCadreTechParams.debordement ?? cadreObj.debordement ?? -62);
            const dedL = -62;
            const lenH = m.hauteur + dedH;
            const lenL = m.largeur + dedL;
            pieces.push({ longueur: lenH, quantite: 2 * Q, label: `CD-${m.repere} (Montant ${lenH}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `Ha-${m.repere}`, refCommande: cmdTag || 'CMD-01' });
            pieces.push({ longueur: lenL, quantite: 1 * Q, label: `CD-${m.repere} (Traverse Haute ${lenL}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `La-${m.repere}`, refCommande: cmdTag || 'CMD-01' });
            if (!m.avecBarreInferieure) {
              pieces.push({ longueur: lenL, quantite: 1 * Q, label: `CD-${m.repere} (Traverse Basse ${lenL}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `Lb-${m.repere}`, refCommande: cmdTag || 'CMD-01' });
            }
          }
          const res = opt.optimiser(pieces, availableChutes);
          res.articleCode = cadreObj.code_art;
          res.articleDesignation = cadreObj.designation;
          res.refCommande = titreRefMSTQ;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          generatedSections.push({
            articleCode: cadreObj.code_art,
            articleDesignation: `🖼️ [CADRE MOUSTIQUAIRE] ${cadreObj.designation}`,
            articleObj: cadreObj,
            resultat: res,
            type: 'CADRE',
            famille: 'MOUSTIQUAIRE',
            commandesInvolved: refsMSTQInvolved
          });
        }

        // 3.2 Coulisses Moustiquaire
        for (const [coulisseCode, lignesGroup] of groupsCoulisse.entries()) {
          const coulisseObj = safeArticles.find(a => a.code_art === coulisseCode) || articlesCoulisseMSTQ[0];
          if (!coulisseObj) continue;
          await notifyStep(`Coulisses Moustiquaire : ${coulisseObj.designation}`);

          const mappedSheet = mapping[coulisseObj.code_art] || null;
          const availableChutes = mappedSheet ? chutesBarres[mappedSheet] || [] : [];
          const longBarre = mstqCoulisseTechParams.longeur || coulisseObj.longeur || 6000;
          const epScie = mstqCoulisseTechParams.lame || coulisseObj.lame || 4.0;
          const dedCoulisseDefault = mstqCoulisseTechParams.debordement ?? coulisseObj.debordement ?? -46;
          const rMin = mstqCoulisseTechParams.refus_min || coulisseObj.refus_min || 300;
          const rMax = mstqCoulisseTechParams.refus_max || coulisseObj.refus_max || 1200;

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });
          const pieces: any[] = [];
          for (const m of lignesGroup) {
            if (m.typeOuverture === 'FIXE' || m.typeFabrication === 'SEMI_FINI_MAILLE') continue;
            const Q = Math.max(1, m.quantite);
            const cmdTag = (m.refCommande || numCommandeMoustiquaire || '').trim();
            const dedCoulisse = m.avecBarreInferieure ? -33 : dedCoulisseDefault;
            let qtyCoulisse = 1;
            let dimCoulisse = m.hauteur + dedCoulisse;
            if (m.typeOuverture === 'DOUBLE_VANTAUX' || m.typeOuverture === 'CENTRALE') { qtyCoulisse = 2; dimCoulisse = m.hauteur + dedCoulisse; }
            else if (m.typeOuverture === 'FENETRE') { dimCoulisse = m.largeur + dedCoulisse; }
            if (qtyCoulisse > 0) {
              pieces.push({ longueur: dimCoulisse, quantite: qtyCoulisse * Q, label: `MSTQ-CS-${m.repere} (MSTQ COULISSE ${dimCoulisse}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `MSTQ-CS-${m.repere}`, refCommande: cmdTag || 'CMD-01' });
            }
          }
          if (pieces.length === 0) continue;
          const res = opt.optimiser(pieces, availableChutes);
          res.articleCode = coulisseObj.code_art;
          res.articleDesignation = coulisseObj.designation;
          res.refCommande = titreRefMSTQ;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          generatedSections.push({
            articleCode: coulisseObj.code_art,
            articleDesignation: `🔩 [MSTQ COULISSE] ${coulisseObj.designation}`,
            articleObj: coulisseObj,
            resultat: res,
            type: 'GL',
            famille: 'MOUSTIQUAIRE',
            commandesInvolved: refsMSTQInvolved
          });
        }

        // 3.3 Barres Inférieures Moustiquaire
        for (const [biCode, lignesGroup] of groupsBI.entries()) {
          const biObj = safeArticles.find(a => a.code_art === biCode) || articlesBarreInfMSTQ[0];
          if (!biObj) continue;
          await notifyStep(`Barre Inf Moustiquaire : ${biObj.designation}`);

          const mappedSheet = mapping[biObj.code_art] || null;
          const availableChutes = mappedSheet ? chutesBarres[mappedSheet] || [] : [];
          const longBarre = mstqBarreInfTechParams.longeur || biObj.longeur || 6000;
          const epScie = mstqBarreInfTechParams.lame || biObj.lame || 4.0;
          const ded = mstqBarreInfTechParams.debordement ?? biObj.debordement ?? -13;
          const rMin = mstqBarreInfTechParams.refus_min || biObj.refus_min || 300;
          const rMax = mstqBarreInfTechParams.refus_max || biObj.refus_max || 1200;

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });
          const pieces: any[] = [];
          for (const m of lignesGroup) {
            const Q = Math.max(1, m.quantite);
            const cmdTag = (m.refCommande || numCommandeMoustiquaire || '').trim();
            const lenBI = m.largeur + ded;
            pieces.push({ longueur: lenBI, quantite: 1 * Q, label: `BI-${m.repere} (Barre Inférieure ${lenBI}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `BI-${m.repere}`, refCommande: cmdTag || 'CMD-01' });
          }
          const res = opt.optimiser(pieces, availableChutes);
          res.articleCode = biObj.code_art;
          res.articleDesignation = biObj.designation;
          res.refCommande = titreRefMSTQ;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          generatedSections.push({
            articleCode: biObj.code_art,
            articleDesignation: `📏 [BARRE INFÉRIEURE MSTQ] ${biObj.designation}`,
            articleObj: biObj,
            resultat: res,
            type: 'SF',
            famille: 'MOUSTIQUAIRE',
            commandesInvolved: refsMSTQInvolved
          });
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. OPTIMISATION PRÉCADRES (Profils, Renforts, Traverses, Montants)
      // ─────────────────────────────────────────────────────────────────────────
      if (precadresFiltres.length > 0) {
        const refsPRCInvolved = Array.from(new Set(precadresFiltres.map(p => (p.refCommande || numCommandePrecadre || '').trim()).filter(Boolean)));
        const titreRefPRC = refsPRCInvolved.length > 0 ? refsPRCInvolved.join(', ') : 'PRÉCADRES';

        for (const [artCode, lignesGroup] of groupsPRC.entries()) {
          const artObj = safeArticles.find(a => a.code_art === artCode) || articlesPrecadre.find(a => a.code_art === artCode) || articlesPrecadre[0];
          await notifyStep(`Précadre : ${artObj?.designation || artCode}`);

          const mappedSheetName = mapping[artObj?.code_art || ''] || null;
          const availableChutes = mappedSheetName ? chutesBarres[mappedSheetName] || [] : [];
          const longBarre = prcTechParams.longeur || artObj?.longeur || 6000;
          const epScie = prcTechParams.lame || artObj?.lame || 4.0;
          const rMin = prcTechParams.refus_min || artObj?.refus_min || 300;
          const rMax = prcTechParams.refus_max || artObj?.refus_max || 1200;

          const opt = new OptimiseurCoupe1D({ longueurBarre: longBarre, epaisseurScie: epScie, refusMin: rMin, refusMax: rMax, mode: optMode, poidsTemps });
          const piecesToCut: any[] = [];
          lignesGroup.forEach(c => {
            const debSup = c.debordementSuperieur !== undefined ? c.debordementSuperieur : 100;
            const debInf = c.debordementInferieur !== undefined ? c.debordementInferieur : 300;

            const { hMontant, lTraverse, lRenfortSeul, lDemiRenfortCroise, hRenfort } = getDimensionsPrecadrePiece(
              c.largeur,
              c.hauteur,
              c.modeDebordement,
              debSup,
              debInf
            );

            const cmdTag = (c.refCommande || numCommandePrecadre || '').trim();
            piecesToCut.push({ longueur: hMontant, quantite: 1 * c.quantite, label: `Ha-${c.repere} (Montant A — ${hMontant}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `Ha-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
            piecesToCut.push({ longueur: hMontant, quantite: 1 * c.quantite, label: `Hb-${c.repere} (Montant B — ${hMontant}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `Hb-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
            piecesToCut.push({ longueur: lTraverse, quantite: 1 * c.quantite, label: `La-${c.repere} (Traverse Haute — ${lTraverse}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `La-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
            piecesToCut.push({ longueur: lTraverse, quantite: 1 * c.quantite, label: `Lb-${c.repere} (Traverse Basse — ${lTraverse}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `Lb-${c.repere}`, refCommande: cmdTag || 'CMD-01' });

            if (c.figure === 'RENFORT_L1') {
              piecesToCut.push({ longueur: lRenfortSeul, quantite: 1 * c.quantite, label: `L1-${c.repere} (Renfort Horizontal — ${lRenfortSeul}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `L1-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
            } else if (c.figure === 'RENFORT_CROISE') {
              piecesToCut.push({ longueur: lDemiRenfortCroise, quantite: 1 * c.quantite, label: `R1-${c.repere} (Demi-Renfort 1 — ${lDemiRenfortCroise}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `R1-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
              piecesToCut.push({ longueur: lDemiRenfortCroise, quantite: 1 * c.quantite, label: `R2-${c.repere} (Demi-Renfort 2 — ${lDemiRenfortCroise}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `R2-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
              piecesToCut.push({ longueur: hRenfort, quantite: 1 * c.quantite, label: `H1-${c.repere} (Renfort Vert — ${hRenfort}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `H1-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
            } else if (c.figure === 'RENFORT_H1') {
              piecesToCut.push({ longueur: hRenfort, quantite: 1 * c.quantite, label: `H1-${c.repere} (Renfort Vert — ${hRenfort}mm)${cmdTag ? ` [Cmd ${cmdTag}]` : ''}`, repere: `H1-${c.repere}`, refCommande: cmdTag || 'CMD-01' });
            }
          });

          const res = opt.optimiser(piecesToCut, availableChutes);
          res.articleCode = artObj?.code_art || artCode;
          res.articleDesignation = artObj?.designation || 'Précadre';
          res.refCommande = titreRefPRC;
          res.nomClient = clientDeMonClient.trim() || 'CLIENT';
          res.donneurOrdre = monClient;
          res.dateCommande = dateCommande;

          generatedSections.push({
            articleCode: artObj?.code_art || artCode,
            articleDesignation: `🔲 [PRÉCADRE] ${artObj?.designation || 'Précadre'}`,
            articleObj: artObj,
            resultat: res,
            type: 'PRC',
            famille: 'PRECADRE',
            commandesInvolved: refsPRCInvolved
          });
        }
      }

      setOptProgress({
        active: true,
        percent: 100,
        currentTask: 'Finalisation des plans de coupe et synthèse globale...',
        sectionName: 'Succès'
      });
      await new Promise(r => setTimeout(r, 150));
      setSectionsMultiCaisson(generatedSections);
      setModalDebitCaissonOpen(true);
    } catch (err) {
      logger.error('Erreur lors de l’optimisation multi-familles :', err);
      showFlashNotification('Une erreur est survenue pendant l’optimisation.', 'warn');
    } finally {
      setOptProgress(null);
    }
  };

  const handleOptimiserSelectionCommandesDossier = () => {
    const refs = Array.from(selectedCmdRefs) as string[];
    if (refs.length === 0) {
      showFlashNotification('⚠️ Veuillez cocher au moins une commande à multi-optimiser dans la liste ci-dessous.', 'warn');
      return;
    }
    handleOptimiserMultiFamillesDossier(refs);
  };

  // Multi-sélection pour l'optimisation groupée depuis l'historique global
  const [selectedDossierIds, setSelectedDossierIds] = useState<Set<string>>(new Set());

  const toggleSelectDossier = (id: string) => {
    setSelectedDossierIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearDossierSelection = () => setSelectedDossierIds(new Set());

  // Fusionner les lignes de plusieurs dossiers pour une optimisation groupée
  const handleOptimiserSelectionMultiple = () => {
    if (selectedDossierIds.size === 0) return;

    const selectedDossiers = dossiers.filter(d => selectedDossierIds.has(d.id));
    const refsCommandes: string[] = selectedDossiers.map(d => d.refCommande);

    if (familleArticle === 'CAISSON') {
      // Fusionner toutes les lignes caissons avec la ref de commande d'origine
      const allCaissons = selectedDossiers.flatMap(d =>
        (d.articlesCaissons || []).map(c => ({
          ...c,
          refCommande: d.refCommande,
          _clientLabel: d.nomClientFinal
        }))
      );
      if (allCaissons.length === 0) {
        showFlashNotification('Aucune ligne de caisson trouvée dans la sélection.', 'warn');
        return;
      }
      setLignesCaissons(allCaissons);
      setNumCommandeCaisson(refsCommandes.join(' + '));
      setClientDeMonClient(selectedDossiers[0].nomClientFinal);
      setModeSaisieActif(true);
      showFlashNotification(`⚡ ${allCaissons.length} lignes caissons chargées depuis ${selectedDossierIds.size} commande(s). Lancez l'optimisation.`, 'success');
    } else if (familleArticle === 'TABLIER') {
      const allTabliers = selectedDossiers.flatMap(d =>
        (d.articlesTabliers || []).map(t => ({ ...t, refCommande: d.refCommande }))
      );
      if (allTabliers.length === 0) {
        showFlashNotification('Aucune ligne de tablier trouvée dans la sélection.', 'warn');
        return;
      }
      setLignesTabliers(allTabliers);
      setNumCommandeTablier(refsCommandes.join(' + '));
      setClientDeMonClient(selectedDossiers[0].nomClientFinal);
      setModeSaisieActif(true);
      showFlashNotification(`⚡ ${allTabliers.length} lignes tablier chargées depuis ${selectedDossierIds.size} commande(s). Lancez l'optimisation.`, 'success');
    } else if (familleArticle === 'MOUSTIQUAIRE') {
      const allMstq = selectedDossiers.flatMap(d =>
        (d.articlesMoustiquaires || []).map(m => ({ ...m, refCommande: d.refCommande }))
      );
      if (allMstq.length === 0) {
        showFlashNotification('Aucune ligne de moustiquaire trouvée dans la sélection.', 'warn');
        return;
      }
      setLignesMoustiquaires(allMstq);
      setNumCommandeMoustiquaire(refsCommandes.join(' + '));
      setClientDeMonClient(selectedDossiers[0].nomClientFinal);
      setModeSaisieActif(true);
      showFlashNotification(`⚡ ${allMstq.length} lignes moustiquaire chargées depuis ${selectedDossierIds.size} commande(s). Lancez l'optimisation.`, 'success');
    } else if (familleArticle === 'PRECADRE') {
      const allPrecadres = selectedDossiers.flatMap(d =>
        (d.articlesPrecadres || []).map(p => ({ ...p, refCommande: d.refCommande }))
      );
      if (allPrecadres.length === 0) {
        showFlashNotification('Aucune ligne de précadre trouvée dans la sélection.', 'warn');
        return;
      }
      setLignesPrecadres(allPrecadres);
      setNumCommandePrecadre(refsCommandes.join(' + '));
      setClientDeMonClient(selectedDossiers[0].nomClientFinal);
      setModeSaisieActif(true);
      showFlashNotification(`⚡ ${allPrecadres.length} lignes précadre chargées depuis ${selectedDossierIds.size} commande(s). Lancez l'optimisation.`, 'success');
    }

    clearDossierSelection();
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Notification flash visuelle
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'warn' } | null>(null);

  const showFlashNotification = (message: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Changement du Donneur d'Ordre (Mon Client)
  const handleMonClientChange = (nomDonneur: string) => {
    const newPrefix = getPrefixeCommande(nomDonneur, clientCodifications);
    setMonClient(nomDonneur);
    const upper = (nomDonneur || '').toUpperCase();
    const isCristalAlgerOuCne = upper.includes('CRISTAL ALGER') || upper.includes('CRISTAL-ALGER') || 
                               upper.includes('CRISTAL CONST') || upper.includes('CRISTAL CNE') || upper.includes('CRISTAL-CONST');
    const agence = clientCodifications.find(d => d.nom === nomDonneur) || clientCodifications.find(d => d.code === nomDonneur);
    const defPeinture = agence?.peintureParDefaut !== undefined ? agence.peintureParDefaut : isCristalAlgerOuCne;
    const defMontage = agence?.montageSousFaceParDefaut !== undefined 
      ? (agence.montageSousFaceParDefaut ? 'MONTEE_ATELIER' : 'NON_MONTEE')
      : 'MONTEE_ATELIER';
    const defPlaque = agence?.avecPlaqueParDefaut !== undefined ? agence.avecPlaqueParDefaut : false;

    setCaissonConfig(prev => ({
      ...prev,
      avecPeinture: defPeinture,
      montageSousFace: defMontage,
      avecPlaque: defPlaque
    }));

    // Mettre à jour automatiquement les préfixes de tous les numéros de commande en cours
    const updatePrefix = (oldVal: string) => {
      if (!oldVal || !oldVal.trim()) return '';
      const sansPref = extraireNumeroSansPrefixe(oldVal, clientCodifications);
      return sansPref ? `${newPrefix}${sansPref}` : '';
    };

    setNumCommandeCaisson(prev => updatePrefix(prev));
    setNumCommandeSousFace(prev => updatePrefix(prev));
    setNumCommandeTablier(prev => updatePrefix(prev));
    setNumCommandeMoustiquaire(prev => updatePrefix(prev));
    setNumCommandePrecadre(prev => updatePrefix(prev));
  };

  // 1. Démarrer un NOUVEAU DOSSIER complet (Réinitialise TOUT le masque de saisie vraiment à 0)
  const handleNouveauDossier = (demanderConfirmation: boolean = false) => {
    if (demanderConfirmation && (lignesCaissons.length > 0 || lignesTabliers.length > 0 || lignesMoustiquaires.length > 0 || lignesPrecadres.length > 0)) {
      if (!confirm('Voulez-vous vraiment remettre tout le masque de saisie à 0 pour démarrer un nouveau dossier ? Les données non enregistrées seront effacées.')) {
        return;
      }
    }

    // 1. Désactiver le mode édition d'un ancien dossier
    setEditingDossierId(null);

    // 2. Réinitialiser les identités client & chantier
    setMonClient('');
    setClientDeMonClient('');
    setDateCommande(getTodayDateString());
    setShowClientSuggestions(false);

    // 3. Vider tous les numéros de commande de chaque famille
    setNumCommandeCaisson('');
    setNumCommandeSousFace('');
    setNumCommandeTablier('');
    setNumCommandeMoustiquaire('');
    setNumCommandePrecadre('');
    setFilterCmdActive('TOUTES');

    // 4. Vider totalement toutes les listes de lignes d'articles
    setLignesCaissons([]);
    setLignesTabliers([]);
    setLignesMoustiquaires([]);
    setLignesPrecadres([]);

    // 5. Réinitialiser les champs de saisie active
    setInputL('');
    setInputH('');
    setInputQte('1');
    setInputRepere('');
    setModeSaisieActif(true);

    // 6. Fermer et vider toute édition de ligne unitaire
    setEditingCaissonId(null);
    setEditCaissonForm(null);
    setEditingTablierId(null);
    setEditTablierForm(null);
    setEditingMstqId(null);
    setEditMstqForm(null);
    setEditingPrecadreId(null);
    setEditPrecadreForm(null);

    // 7. Vider toutes les sélections et états de multi-optimisation
    setSelectedCmdRefs(new Set());
    setSelectedDossierIds(new Set());
    setMultiOptActiveRefs([]);
    setResultatDebitCT(null);
    setSectionsMultiCaisson([]);
    setSectionsMultiMSTQ([]);
    setModalDebitCaissonOpen(false);
    setModalOFDebitCaissonOpen(false);
    setModalDebitMSTQOpen(false);
    setModalOFDebitMSTQOpen(false);
    setOptProgress(null);

    // 8. Réinitialiser la famille active sur CAISSON
    setFamilleArticle('CAISSON');

    // 9. Réinitialiser les configurations de fabrication : Caisson et Sous-face vidés pour éviter toute saisie fausse
    setCaissonConfig(prev => ({
      ...prev,
      typeCommande: 'CAISSON_ET_SOUS_FACE',
      ctArticleCode: '',
      sfArticleCode: '',
      typeCaisson: 'TUNNEL_SIMPLE',
      avecSousFace: true,
      montageSousFace: 'MONTEE_ATELIER',
      avecPlaque: false,
      avecPeinture: false
    }));

    // Réinitialiser les paramètres de délai et pause
    setDelaiFixeManuellement(false);
    setDateLivraisonPrevisionnelle('');
    setDateLivraisonPrevisionnelleISO('');
    setTypePriorite('DIFFERE');
    setEstPrioritaire(false);
    setMotifPriorite('');
    setEstEnPause(false);
    setMotifPause('');
    setDatePause('');
    setDureePauseJours(0);
    setAfficherEditeurLivraison(false);

    const premierTBL = articlesTablier[0]?.code_art || '';
    const premierLF = articlesLameFinale[0]?.code_art || '';
    const premierGL = articlesCoulisses[0]?.code_art || '';
    setTablierConfig({
      typeFabrication: 'TABLIER_SEUL',
      avecLameFinale: false,
      hauteurLame: 43,
      articleCode: premierTBL,
      lfArticleCode: premierLF,
      glArticleCode: premierGL
    });

    const premierPRC = articlesPrecadre[0]?.code_art || '';
    const premierBouchon = articlesBouchonPrecadre[0]?.code_art || '';
    setPrecadreConfig({
      figure: 'VIDE',
      modeDebordement: 'SUPERIEUR_INFERIEUR',
      debordementSuperieur: 100,
      debordementInferieur: 300,
      typeCoupe: '90',
      articleCode: premierPRC,
      bouchonArticleCode: premierBouchon
    });

    const premierCadre = articlesCadreMSTQ[0]?.code_art || '';
    const premierMaille = articlesMailleMSTQ[0]?.code_art || '';
    const premierCoulisse = articlesCoulisseMSTQ[0]?.code_art || '';
    const premierBarreInf = articlesBarreInfMSTQ[0]?.code_art || '';
    setMstqConfig({
      typeOuverture: 'PORTE_FENETRE',
      typeFabrication: 'COMPLET',
      avecBarreInferieure: false,
      mailleArticleCode: premierMaille,
      mailleArticleDesignation: articlesMailleMSTQ[0]?.designation || '',
      cadreArticleCode: premierCadre,
      cadreArticleDesignation: articlesCadreMSTQ[0]?.designation || '',
      coulisseArticleCode: premierCoulisse,
      coulisseArticleDesignation: articlesCoulisseMSTQ[0]?.designation || '',
      barreInfArticleCode: premierBarreInf,
      barreInfArticleDesignation: articlesBarreInfMSTQ[0]?.designation || '',
      modele: 'MOUSTIQUAIRE PLISSÉE'
    });

    // 10. Nettoyer l'état parent pour éviter toute réinjection intempestive
    if (onClearSelectedDossier) {
      onClearSelectedDossier();
    }

    showFlashNotification('✨ Masque de saisie remis à zéro. Nouveau dossier vierge prêt pour la saisie.', 'info');
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Retirer / Supprimer une commande spécifique du dossier en cours (avec mise à jour SQLite et suppression des lignes)
  const handleRetirerCommandeDuDossier = async (cmdRef: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer la commande N° ${cmdRef} et toutes ses lignes de ce dossier ?\n\nCette action supprimera définitivement les lignes de cette commande et libérera les réservations d'OF associées.`)) {
      return;
    }

    const cleanRef = cmdRef.trim().toLowerCase();
    const matchCmd = (r?: string) => (r || '').trim().toLowerCase() === cleanRef;

    setLignesCaissons(prev => prev.filter(c => !matchCmd(c.refCommande || numCommandeCaisson)));
    setLignesTabliers(prev => prev.filter(t => !matchCmd(t.refCommande || numCommandeTablier)));
    setLignesMoustiquaires(prev => prev.filter(m => !matchCmd(m.refCommande || numCommandeMoustiquaire)));
    setLignesPrecadres(prev => prev.filter(p => !matchCmd(p.refCommande || numCommandePrecadre)));

    // Nettoyer les OFs correspondants et libérer leurs réservations
    try {
      const ofs = await StorageService.getSuivisOF();
      const ofsAssocies = ofs.filter(o => 
        matchCmd(o.numCommande) || 
        (o.dossierId && o.dossierId === editingDossierId && (o.titreSection?.toLowerCase().includes(cleanRef) || o.codeOF?.toLowerCase().includes(cleanRef)))
      );
      for (const ofItem of ofsAssocies) {
        await StorageService.deleteSuiviOF(ofItem.id);
      }
    } catch (e) {
      console.warn('Erreur nettoyage OFs:', e);
    }

    // Si le dossier est déjà sauvegardé dans SQLite, retirer la commande du dossier en base
    if (editingDossierId) {
      const updatedDossiers = dossiers.map(d => {
        if (d.id === editingDossierId) {
          const restCaissons = (d.articlesCaissons || []).filter(c => !matchCmd(c.refCommande || d.numCommandeCaisson || d.refCommande));
          const restTabliers = (d.articlesTabliers || []).filter(t => !matchCmd(t.refCommande || d.numCommandeTablier || d.refCommande));
          const restMoustiquaires = (d.articlesMoustiquaires || []).filter(m => !matchCmd(m.refCommande || d.numCommandeMoustiquaire || d.refCommande));
          const restPrecadres = (d.articlesPrecadres || []).filter(p => !matchCmd(p.refCommande || d.numCommandePrecadre || d.refCommande));
          const restConfirmees = (d.commandesConfirmees || []).filter(c => !matchCmd(c));

          return {
            ...d,
            articlesCaissons: restCaissons,
            articlesTabliers: restTabliers,
            articlesMoustiquaires: restMoustiquaires,
            articlesPrecadres: restPrecadres,
            commandesConfirmees: restConfirmees,
            numCommandeCaisson: matchCmd(d.numCommandeCaisson) ? '' : d.numCommandeCaisson,
            numCommandeSousFace: matchCmd(d.numCommandeSousFace) ? '' : d.numCommandeSousFace,
            numCommandeTablier: matchCmd(d.numCommandeTablier) ? '' : d.numCommandeTablier,
            numCommandeMoustiquaire: matchCmd(d.numCommandeMoustiquaire) ? '' : d.numCommandeMoustiquaire,
            numCommandePrecadre: matchCmd(d.numCommandePrecadre) ? '' : d.numCommandePrecadre,
          };
        }
        return d;
      });
      await StorageService.saveDossiers(updatedDossiers);
      if (onDossiersUpdated) onDossiersUpdated();
    }

    showFlashNotification(`Commande N° ${cmdRef} et ses lignes supprimées du dossier avec succès.`, 'warn');
  };

  // 2. Démarrer une NOUVELLE COMMANDE dans le MÊME DOSSIER
  //    Conserve le client, la date et les lignes existantes du dossier.
  //    Vide uniquement le N° de commande actif pour saisir une nouvelle commande dans ce dossier.
  const handleNouvelleCommande = () => {
    setActiveNumCommande('');
    setFilterCmdActive('TOUTES');
    setModeSaisieActif(true);
    setInputL('');
    setInputH('');
    setInputQte('1');
    setInputRepere('');
    showFlashNotification(`➕ Nouvelle commande pour ${clientDeMonClient || 'ce dossier'}. Saisissez son N° de commande.`, 'info');
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      inputNumCmdRef.current?.focus();
    }, 100);
  };


  // =========================================================================
  // FONCTION CLÉ : REPRENDRE / COMPLÉTER UNE COMMANDE DEPUIS L'HISTORIQUE
  // =========================================================================
  const handleReprendreCommande = (dossier: DossierCommandeGlobal, targetFamille?: FamilleProduit) => {
    setEditingDossierId(dossier.id);
    setMonClient(dossier.donneurOrdre || '');
    setClientDeMonClient(dossier.nomClientFinal || '');
    setDateCommande(dossier.dateCommande || getTodayDateString());

    // Restaurer le délai de livraison et l'état de pause/interruption
    const isInst = dossier.typePriorite === 'INSTANTANE' || !!dossier.estPrioritaire;
    setTypePriorite(isInst ? 'INSTANTANE' : 'DIFFERE');
    setEstPrioritaire(isInst);
    setMotifPriorite(dossier.motifPriorite || '');
    setEstEnPause(!!dossier.estEnPause || dossier.statut === 'EN_PAUSE');
    setMotifPause(dossier.motifPause || '');
    setDatePause(dossier.datePause || '');
    setDureePauseJours(dossier.dureePauseJours || 0);
    if (dossier.dateLivraisonPrevisionnelle) {
      setDelaiFixeManuellement(true);
      setDateLivraisonPrevisionnelle(dossier.dateLivraisonPrevisionnelle);
      setDateLivraisonPrevisionnelleISO(dossier.dateLivraisonPrevisionnelleISO || '');
    } else {
      setDelaiFixeManuellement(false);
      setDateLivraisonPrevisionnelle('');
      setDateLivraisonPrevisionnelleISO('');
    }

    const formatCmd = (val?: string) => {
      if (!val || !val.trim()) return '';
      return val.trim();
    };

    const globalRef = (dossier.refCommande || '').trim();
    const cmdCaisson = formatCmd(dossier.numCommandeCaisson || dossier.articlesCaissons?.[0]?.refCommande || globalRef);
    const cmdSousFace = formatCmd(dossier.numCommandeSousFace || (dossier.articlesCaissons?.find(c => c.avecSousFace && c.sfRefCommande)?.sfRefCommande) || cmdCaisson);
    const cmdTablier = formatCmd(dossier.numCommandeTablier || dossier.articlesTabliers?.[0]?.refCommande || globalRef);
    const cmdMstq = formatCmd(dossier.numCommandeMoustiquaire || dossier.articlesMoustiquaires?.[0]?.refCommande || globalRef);
    const cmdPrecadre = formatCmd(dossier.numCommandePrecadre || dossier.articlesPrecadres?.[0]?.refCommande || globalRef);

    setFilterCmdActive('TOUTES');

    // Restaurer les numéros propres à chaque famille
    setNumCommandeCaisson(cmdCaisson);
    setNumCommandeSousFace(cmdSousFace);
    setNumCommandeTablier(cmdTablier);
    setNumCommandeMoustiquaire(cmdMstq);
    setNumCommandePrecadre(cmdPrecadre);
    
    // Charger toutes les lignes enregistrées — enrichissement défensif des codes articles, hauteurs de lames et refCommande
    const enrichedTabliers = (dossier.articlesTabliers || []).map((t: any) => {
      const hLame = getHauteurLameTablier(t.articleCode, t.articleDesignation, t.hauteur_lame_tablier);
      const h = Number(t.hauteur) || 0;
      return {
        ...t,
        refCommande: t.refCommande || cmdTablier || globalRef,
        articleCode: t.articleCode || 'ART0040',
        articleDesignation: t.articleDesignation || 'TBL 43 BL',
        hauteur_lame_tablier: hLame,
        nb_lame: t.nb_lame || (h > 0 ? (Math.ceil(h / hLame) + ((t.typeFabrication === 'VOLET_COMPLET' || t.avecCoulisses) ? 2 : 0)) : 50)
      };
    });
    setLignesTabliers(enrichedTabliers);

    const enrichedMstq = (dossier.articlesMoustiquaires || []).map((m: any) => ({
      ...m,
      refCommande: m.refCommande || cmdMstq || globalRef
    }));
    setLignesMoustiquaires(enrichedMstq);

    const enrichedCaissons = (dossier.articlesCaissons || []).map((c: any) => {
      const isSFSeule = Boolean(c.isSousFaceSeule || c.typePrestation === 'SOUS_FACE_SEULE');
      const ctResolved = articlesCT.find(a => a.code_art === c.articleCode || a.designation === c.articleDesignation) || articlesCT[0];
      const sfResolved = articlesSF.find(a => a.code_art === c.sfArticleCode || a.designation === c.sfArticleDesignation) || articlesSF[0];
      return {
        ...c,
        refCommande: c.refCommande || cmdCaisson || globalRef,
        isSousFaceSeule: isSFSeule,
        typePrestation: isSFSeule ? 'SOUS_FACE_SEULE' : (c.typePrestation || (c.avecSousFace ? 'CAISSON_ET_SOUS_FACE' : 'CAISSON_SEUL')),
        articleCode: isSFSeule ? undefined : (c.articleCode || ctResolved?.code_art || 'ART0011'),
        articleDesignation: isSFSeule ? undefined : (c.articleDesignation || ctResolved?.designation || 'CT SOMO 30 ARRONDI'),
        sfArticleCode: (c.avecSousFace || isSFSeule) ? (c.sfArticleCode || sfResolved?.code_art || 'ART0022') : c.sfArticleCode,
        sfArticleDesignation: (c.avecSousFace || isSFSeule) ? (c.sfArticleDesignation || sfResolved?.designation || 'SF 300 (SOUS-FACE 300MM)') : c.sfArticleDesignation
      };
    });
    setLignesCaissons(enrichedCaissons);

    const enrichedPrecadres = (dossier.articlesPrecadres || []).map((p: any) => ({
      ...p,
      refCommande: p.refCommande || cmdPrecadre || globalRef
    }));
    setLignesPrecadres(enrichedPrecadres);

    // Déterminer la famille d'article à ouvrir selon la cible ou le contenu prédominant
    const nbCaissons = (dossier.articlesCaissons || []).length;
    const nbTabliers = (dossier.articlesTabliers || []).length;
    const nbMoustiquaires = (dossier.articlesMoustiquaires || []).length;
    const nbPrecadres = (dossier.articlesPrecadres || []).length;

    if (targetFamille) {
      setFamilleArticle(targetFamille);
      if (targetFamille === 'TABLIER') setInputRepere(`SA-${nbTabliers + 1}`);
      else if (targetFamille === 'MOUSTIQUAIRE') setInputRepere(`H${nbMoustiquaires + 1}`);
      else if (targetFamille === 'CAISSON') setInputRepere(`CT-${nbCaissons + 1}`);
      else if (targetFamille === 'PRECADRE') setInputRepere(`1R${nbPrecadres + 1}`);
    } else {
      const refUpper = (dossier.refCommande || '').toUpperCase();
      // Si la commande a un préfixe de codification identifiable
      if (refUpper.startsWith('SA-') && nbTabliers > 0) {
        setFamilleArticle('TABLIER');
        setInputRepere(`SA-${nbTabliers + 1}`);
      } else if ((refUpper.startsWith('SC-') || refUpper.startsWith('D-')) && nbMoustiquaires > 0) {
        setFamilleArticle('MOUSTIQUAIRE');
        setInputRepere(`H${nbMoustiquaires + 1}`);
      } else if (refUpper.startsWith('1R') && nbPrecadres > 0) {
        setFamilleArticle('PRECADRE');
        setInputRepere(`1R${nbPrecadres + 1}`);
      } else if ((refUpper.startsWith('CT-') || refUpper.startsWith('A-')) && nbCaissons > 0) {
        setFamilleArticle('CAISSON');
        setInputRepere(`CT-${nbCaissons + 1}`);
      } else {
        // Sinon ouvrir la famille prédominante (celle avec le plus d'articles saisis)
        const counts = [
          { fam: 'TABLIER' as FamilleProduit, count: nbTabliers, repere: `SA-${nbTabliers + 1}` },
          { fam: 'MOUSTIQUAIRE' as FamilleProduit, count: nbMoustiquaires, repere: `H${nbMoustiquaires + 1}` },
          { fam: 'CAISSON' as FamilleProduit, count: nbCaissons, repere: `CT-${nbCaissons + 1}` },
          { fam: 'PRECADRE' as FamilleProduit, count: nbPrecadres, repere: `1R${nbPrecadres + 1}` },
        ].sort((a, b) => b.count - a.count);

        const best = counts[0];
        setFamilleArticle(best.fam);
        setInputRepere(best.repere);
      }
    }

    setModeSaisieActif(true);  // Activer le mode saisie lors de la reprise d'un dossier
    showFlashNotification(`✓ Commande ${dossier.refCommande || globalRef} (${dossier.nomClientFinal}) chargée dans l'Écosystème pour mise à jour !`, 'success');

    // Défilement fluide vers l'éditeur de commande en haut
    setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  useEffect(() => {
    logger.setContext({
      ongletActif: 'ecosysteme',
      refDossier: editingDossierId || undefined,
      numCommande: numCommande || undefined,
      familleProduit: familleArticle,
      client: clientDeMonClient || undefined
    });
  }, [editingDossierId, numCommande, familleArticle, clientDeMonClient]);

  useEffect(() => {
    let targetFam: FamilleProduit | undefined = undefined;
    let bridgeDossier: DossierCommandeGlobal | null = null;

    // Lire le bridge persistant localStorage pour sécuriser le passage inter-onglets
    try {
      const stored = localStorage.getItem('3m_dossier_to_load');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed) {
          targetFam = parsed.targetFamille;
          bridgeDossier = parsed.dossier || null;
        }
        localStorage.removeItem('3m_dossier_to_load');
      }
    } catch (e) {
      console.warn('Erreur lecture bridge dossier localStorage:', e);
    }

    // 1. Depuis props (prioritaire)
    if (selectedDossierToLoad) {
      handleReprendreCommande(selectedDossierToLoad, targetFam);
      onClearSelectedDossier?.();
      return;
    }

    // 2. Depuis le bridge localStorage si props non renseigné
    if (bridgeDossier) {
      handleReprendreCommande(bridgeDossier, targetFam);
    }
  }, [selectedDossierToLoad, onClearSelectedDossier]);

  // Dupliquer un dossier
  const handleDupliquerDossier = async (dossier: DossierCommandeGlobal) => {
    const agence = clientCodifications.find(d => d.nom === dossier.donneurOrdre) || INITIAL_CLIENT_CODIFICATIONS.find(d => d.nom === dossier.donneurOrdre);
    const prefix = agence ? agence.prefixeCommande : 'CMD-';
    const newRef = `${prefix}${Math.floor(10000 + Math.random() * 90000)}`;

    const copie: DossierCommandeGlobal = {
      ...dossier,
      id: 'd-' + Date.now(),
      refCommande: newRef,
      dateCommande: getTodayDateString(),
      statut: 'EN_ATTENTE',
      notes: `Duplicata de la commande ${dossier.refCommande}`,
      articlesTabliers: (dossier.articlesTabliers || []).map(t => ({ ...t, id: 't-' + Math.random(), refCommande: newRef })),
      articlesMoustiquaires: (dossier.articlesMoustiquaires || []).map(m => ({ ...m, id: 'm-' + Math.random(), refCommande: newRef })),
      articlesCaissons: (dossier.articlesCaissons || []).map(c => ({ ...c, id: 'c-' + Math.random(), refCommande: newRef })),
      articlesPrecadres: (dossier.articlesPrecadres || []).map(p => ({ ...p, id: 'p-' + Math.random(), refCommande: newRef }))
    };

    const updated = [copie, ...dossiers];
    await StorageService.saveDossiers(updated);
    if (onDossiersUpdated) onDossiersUpdated();
    showFlashNotification(`Commande dupliquée sous la référence ${newRef}.`, 'info');
  };

  // Supprimer un dossier de façon fiable
  const handleConfirmerSuppressionDossier = async (id: string, ref: string) => {
    const updated = dossiers.filter(d => d.id !== id);
    await StorageService.saveDossiers(updated);
    if (onDossiersUpdated) onDossiersUpdated();
    if (editingDossierId === id) {
      handleNouveauDossier();
    }
    setConfirmDeleteDossierId(null);
    showFlashNotification(`Commande ${ref} définitivement supprimée de l'historique.`, 'warn');
  };

  // Changement de famille d'article
  const handleFamilleChange = (famille: FamilleProduit) => {
    setFamilleArticle(famille);
    setFilterCmdActive('TOUTES');
    setInputL('');
    setInputH('');
    setInputRepere('');
    setTimeout(() => {
      if (!clientDeMonClient.trim()) {
        inputClientRef.current?.focus();
      } else {
        const cmd = famille === 'CAISSON' ? numCommandeCaisson
          : famille === 'TABLIER' ? numCommandeTablier
          : famille === 'MOUSTIQUAIRE' ? numCommandeMoustiquaire
          : numCommandePrecadre;
        if (!cmd || !cmd.trim()) {
          inputNumCmdRef.current?.focus();
        } else {
          inputRepereRef.current?.focus();
        }
      }
    }, 80);
  };

  // =========================================================================
  // VALIDATION STRICTE DES CHAMPS OBLIGATOIRES (SOLUTION A + D FUSIONNÉE)
  // En cas d'oubli de saisie d'un champ obligatoire, le bouton d'ajout est inactif
  // et les champs manquants sont clairement indiqués à l'utilisateur
  // =========================================================================
  const champsManquants = useMemo(() => {
    const manquants: string[] = [];

    // 1. Mon Client (Donneur d'Ordre)
    if (!monClient || !monClient.trim()) {
      manquants.push("Mon Client (Donneur d'Ordre)");
    }

    // 2. Client Final / Chantier
    if (!clientDeMonClient || !clientDeMonClient.trim()) {
      manquants.push("Client Final (Chantier / Promoteur)");
    }

    // 3. N° de commande pour l'onglet actif
    const activeNumCmd = extraireNumeroSansPrefixe(getActiveNumCommande(), clientCodifications);
    if (!activeNumCmd || !activeNumCmd.trim()) {
      const famNom =
        familleArticle === 'CAISSON'
          ? 'N° Commande Caisson & SF'
          : familleArticle === 'TABLIER'
          ? 'N° Commande Volet / Tablier'
          : familleArticle === 'MOUSTIQUAIRE'
          ? 'N° Commande Moustiquaire'
          : 'N° Commande Précadre';
      manquants.push(famNom);
    } else if (conflitNumCmdActif) {
      manquants.push(`N° Commande UNIQUE requis (Le N° "${conflitNumCmdActif.numEnConflit}" existe déjà dans le dossier "${conflitNumCmdActif.nomClientFinal}")`);
    }

    // 4. Profilés et dimensions selon la famille
    if (familleArticle === 'CAISSON') {
      const isSFSeule = caissonConfig.typeCommande === 'SOUS_FACE_SEULE';
      const isCaissonSeul = caissonConfig.typeCommande === 'CAISSON_SEUL';
      if (!isSFSeule && !caissonConfig.ctArticleCode) {
        manquants.push("Type de Caisson Tunnel");
      }
      if (!isCaissonSeul && !caissonConfig.sfArticleCode) {
        manquants.push("Profil Sous-Face (SF)");
      }
      const l = parseFloat(inputL);
      if (isNaN(l) || l <= 0) {
        manquants.push(isSFSeule ? "Longueur Sous-Face (mm)" : "Longueur Caisson (mm)");
      }
    } else if (familleArticle === 'TABLIER') {
      if (!tablierConfig.articleCode) {
        manquants.push("Lame Tablier");
      }
      if (tablierConfig.avecLameFinale && !tablierConfig.lfArticleCode) {
        manquants.push("Lame Finale");
      }
      if (tablierConfig.typeFabrication === 'VOLET_COMPLET' && !tablierConfig.glArticleCode) {
        manquants.push("Coulisses");
      }
      const l = parseFloat(inputL);
      if (isNaN(l) || l <= 0) manquants.push("Largeur L (mm)");
      const h = parseFloat(inputH);
      if (isNaN(h) || h <= 0) manquants.push("Hauteur H (mm)");
    } else if (familleArticle === 'PRECADRE') {
      if (!precadreConfig.articleCode) {
        manquants.push("Profilé Précadre");
      }
      const l = parseFloat(inputL);
      if (isNaN(l) || l <= 0) manquants.push("Largeur L (mm)");
      const h = parseFloat(inputH);
      if (isNaN(h) || h <= 0) manquants.push("Hauteur H (mm)");
    } else if (familleArticle === 'MOUSTIQUAIRE') {
      if (mstqConfig.typeFabrication !== 'PROFILES_SEULS' && !mstqConfig.mailleArticleCode) {
        manquants.push("Maille Moustiquaire");
      }
      if (mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE') {
        if (!mstqConfig.cadreArticleCode) manquants.push("Profil Cadre");
        if (mstqConfig.typeOuverture !== 'FIXE' && !mstqConfig.coulisseArticleCode) manquants.push("Profil Coulisse");
        if (mstqConfig.avecBarreInferieure && !mstqConfig.barreInfArticleCode) manquants.push("Barre Inférieure");
      }
      const l = parseFloat(inputL);
      if (isNaN(l) || l <= 0) manquants.push("Largeur L (mm)");
      const h = parseFloat(inputH);
      if (isNaN(h) || h <= 0) manquants.push("Hauteur H (mm)");
    }

    // 5. Quantité
    const qte = parseInt(inputQte, 10);
    if (isNaN(qte) || qte <= 0) {
      manquants.push("Quantité (> 0)");
    }

    return manquants;
  }, [
    monClient,
    clientDeMonClient,
    familleArticle,
    numCommandeCaisson,
    numCommandeTablier,
    numCommandeMoustiquaire,
    numCommandePrecadre,
    clientCodifications,
    caissonConfig,
    tablierConfig,
    precadreConfig,
    mstqConfig,
    inputL,
    inputH,
    inputQte,
    conflitNumCmdActif
  ]);

  const canAjouterLigne = champsManquants.length === 0;

  // Vérification proactive des stocks physiques lors de la saisie d'une ligne
  const verifierStocksLigne = (articlesToCheck: (Article | null | undefined)[], quantiteLigne: number) => {
    const alertes = articlesToCheck.filter((a): a is Article => !!a && (a.stock_physique <= 0 || a.stock_physique < quantiteLigne));
    if (alertes.length > 0) {
      const details = alertes.map(a => `${a.designation} (${a.stock_physique <= 0 ? 'RUPTURE : 0 barre' : `${a.stock_physique} barre(s) disponible(s)`})`).join(' • ');
      showFlashNotification(`⚠️ Attention Stock Insuffisant : ${details}. La commande est ajoutée mais nécessite un approvisionnement.`, 'warn');
    }
  };

  // AJOUT D'UNE LIGNE AVEC HÉRITAGE AUTOMATIQUE DES RÉGLAGES EN HAUT
  const handleAjouterLigne = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (conflitNumCmdActif) {
      showFlashNotification(`⛔ Le numéro de commande "${getActiveNumCommande()}" est déjà utilisé dans le dossier "${conflitNumCmdActif.nomClientFinal}". Le numéro doit être unique !`, 'warn');
      if (inputNumCmdRef.current) inputNumCmdRef.current.focus();
      return;
    }

    if (!canAjouterLigne) {
      showFlashNotification(`⚠️ Impossible de valider : veuillez renseigner [ ${champsManquants.join(' • ')} ]`, 'warn');
      return;
    }

    const qte = parseInt(inputQte, 10);
    if (isNaN(qte) || qte <= 0) {
      showFlashNotification('Veuillez saisir une quantité valide (> 0).', 'warn');
      return;
    }

    if (familleArticle === 'CAISSON') {
      const longueur = parseFloat(inputL);
      if (isNaN(longueur) || longueur <= 0) {
        showFlashNotification('Veuillez saisir une longueur valide.', 'warn');
        return;
      }

      const isSFSeule = caissonConfig.typeCommande === 'SOUS_FACE_SEULE';
      const isCaissonSeul = caissonConfig.typeCommande === 'CAISSON_SEUL';
      const avecSF = caissonConfig.typeCommande === 'CAISSON_ET_SOUS_FACE' || isSFSeule;

      const ctCode = isSFSeule ? undefined : (caissonConfig.ctArticleCode || currentCTArticle?.code_art);
      const ctDesig = isSFSeule ? undefined : (currentCTArticle?.designation || '');
      const sfCode = avecSF ? (caissonConfig.sfArticleCode || currentSFArticle?.code_art) : undefined;
      const sfDesig = avecSF ? (currentSFArticle?.designation || '') : undefined;

      // Vérification du stock pour Caisson et Sous-Face
      verifierStocksLigne([!isSFSeule ? currentCTArticle : null, avecSF ? currentSFArticle : null], qte);

      const autoRepere = inputRepere.trim() || genererRepereCaissonSousFace({
        donneurOrdreNom: monClient,
        nomClientFinal: clientDeMonClient,
        indexLigne: lignesCaissons.length + 1,
        lignesActuelles: lignesCaissons,
        dossiersHistorique: dossiers,
        codifications: clientCodifications,
        isSousFaceSeule: isSFSeule
      });

      const formattedRefCaisson = formaterRefCommandeAvecPrefixe(numCommandeCaisson, monClient, clientCodifications) || (isSFSeule ? 'CMD-SF' : 'CMD-CAISSON');

      const nouvelleLigne: CommandeCaisson = {
        id: String(Date.now()),
        refCommande: formattedRefCaisson,
        sfRefCommande: formattedRefCaisson,
        nomClient: clientDeMonClient.trim() || 'Client',
        donneurOrdre: monClient,
        dateCommande: dateCommande,
        longueur,
        quantite: qte,
        repere: autoRepere,
        // HÉRITAGE DES OPTIONS DU HAUT
        typePrestation: caissonConfig.typeCommande,
        isSousFaceSeule: isSFSeule,
        articleCode: ctCode,
        articleDesignation: ctDesig,
        sfArticleCode: sfCode,
        sfArticleDesignation: sfDesig,
        typeCaisson: caissonConfig.typeCaisson,
        avecSousFace: avecSF && !isCaissonSeul,
        montageSousFace: isSFSeule ? 'NON_MONTEE' : caissonConfig.montageSousFace,
        avecPeinture: caissonConfig.avecPeinture,
        avecPlaque: caissonConfig.avecPlaque ?? false
      };
      setLignesCaissons([...lignesCaissons, nouvelleLigne]);
      setInputL('');
      setInputRepere('');
    } else if (familleArticle === 'TABLIER') {
      const l = parseFloat(inputL);
      const h = parseFloat(inputH);
      if (isNaN(l) || l <= 0 || isNaN(h) || h <= 0) {
        showFlashNotification('Veuillez saisir une largeur et une hauteur valides.', 'warn');
        return;
      }

      // Vérification du stock pour Lame Tablier, Lame Finale, Coulisses
      verifierStocksLigne([
        currentTBLArticle,
        tablierConfig.avecLameFinale ? currentLFArticle : null,
        tablierConfig.typeFabrication === 'VOLET_COMPLET' ? currentGLArticle : null
      ], qte);

      const formattedRefTablier = formaterRefCommandeAvecPrefixe(numCommandeTablier, monClient, clientCodifications) || 'CMD-TABLIER';
      const nouvelleLigne: CommandeTablier = {
        id: String(Date.now()),
        refCommande: formattedRefTablier,
        nomClient: clientDeMonClient.trim() || 'Client',
        donneurOrdre: monClient,
        dateCommande: dateCommande,
        largeur: l,
        hauteur: h,
        hauteur_lame_tablier: getHauteurLameTablier(tablierConfig.articleCode, currentTBLArticle?.designation, tablierConfig.hauteurLame),
        quantite: qte,
        repere: inputRepere.trim() || `SA-${lignesTabliers.length + 1}`,
        nb_lame: Math.ceil(h / getHauteurLameTablier(tablierConfig.articleCode, currentTBLArticle?.designation, tablierConfig.hauteurLame)) + (tablierConfig.typeFabrication === 'VOLET_COMPLET' ? 2 : 0),
        // HÉRITAGE AUTOMATIQUE DES OPTIONS ET ARTICLES DU HAUT
        typeFabrication: tablierConfig.typeFabrication,
        avecLameFinale: tablierConfig.avecLameFinale,
        avecCoulisses: tablierConfig.typeFabrication === 'VOLET_COMPLET',
        articleCode: currentTBLArticle?.code_art || tablierConfig.articleCode,
        articleDesignation: currentTBLArticle?.designation || '',
        lfArticleCode: tablierConfig.avecLameFinale ? (currentLFArticle?.code_art || tablierConfig.lfArticleCode) : undefined,
        lfArticleDesignation: tablierConfig.avecLameFinale ? (currentLFArticle?.designation || '') : undefined,
        glArticleCode: tablierConfig.typeFabrication === 'VOLET_COMPLET' ? (currentGLArticle?.code_art || tablierConfig.glArticleCode) : undefined,
        glArticleDesignation: tablierConfig.typeFabrication === 'VOLET_COMPLET' ? (currentGLArticle?.designation || '') : undefined
      };
      setLignesTabliers([...lignesTabliers, nouvelleLigne]);
      setInputL('');
      setInputH('');
      setInputRepere('');
    } else if (familleArticle === 'MOUSTIQUAIRE') {
      const l = parseFloat(inputL);
      const h = parseFloat(inputH);
      if (isNaN(l) || l <= 0 || isNaN(h) || h <= 0) {
        showFlashNotification('Veuillez saisir une largeur et une hauteur valides.', 'warn');
        return;
      }

      // Vérification du stock pour Composants Moustiquaire
      verifierStocksLigne([
        mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' ? currentCadreMSTQArticle : null,
        (mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' && mstqConfig.typeOuverture !== 'FIXE') ? currentCoulisseMSTQArticle : null,
        (mstqConfig.avecBarreInferieure && mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE') ? currentBarreInfMSTQArticle : null,
        currentMailleMSTQArticle
      ], qte);

      const formattedRefMstq = formaterRefCommandeAvecPrefixe(numCommandeMoustiquaire, monClient, clientCodifications) || 'CMD-MSTQ';
      const nouvelleLigne: BesoinMoustiquaire = {
        id: String(Date.now()),
        refCommande: formattedRefMstq,
        nomClient: clientDeMonClient.trim() || 'Client',
        donneurOrdre: monClient,
        dateCommande: dateCommande,
        modele: mstqConfig.modele,
        typeOuverture: mstqConfig.typeOuverture,
        largeur: l,
        hauteur: h,
        quantite: qte,
        repere: inputRepere.trim() || `H${lignesMoustiquaires.length + 1}`,
        typeFabrication: mstqConfig.typeFabrication,
        avecBarreInferieure: mstqConfig.avecBarreInferieure,
        articleCodeMaille: mstqConfig.mailleArticleCode,
        articleDesignationMaille: mstqConfig.mailleArticleDesignation,
        articleCodeCadre: mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' ? mstqConfig.cadreArticleCode : undefined,
        articleDesignationCadre: mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' ? mstqConfig.cadreArticleDesignation : undefined,
        articleCodeCoulisse: (mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' && mstqConfig.typeOuverture !== 'FIXE') ? mstqConfig.coulisseArticleCode : undefined,
        articleDesignationCoulisse: (mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' && mstqConfig.typeOuverture !== 'FIXE') ? mstqConfig.coulisseArticleDesignation : undefined,
        articleCodeBarreInf: (mstqConfig.avecBarreInferieure && mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE') ? mstqConfig.barreInfArticleCode : undefined,
        articleDesignationBarreInf: (mstqConfig.avecBarreInferieure && mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE') ? mstqConfig.barreInfArticleDesignation : undefined
      };
      setLignesMoustiquaires([...lignesMoustiquaires, nouvelleLigne]);
      setInputL('');
      setInputH('');
      setInputRepere('');
    } else if (familleArticle === 'PRECADRE') {
      const l = parseFloat(inputL);
      const h = parseFloat(inputH);
      if (isNaN(l) || l <= 0 || isNaN(h) || h <= 0) {
        showFlashNotification('Veuillez saisir une largeur et une hauteur valides.', 'warn');
        return;
      }
      const prcObj = articlesPrecadre.find(a => a.code_art === precadreConfig.articleCode) || currentPRCArticle || articlesPrecadre[0];
      const bchObj = articlesBouchonPrecadre.find(a => a.code_art === precadreConfig.bouchonArticleCode) || currentBouchonArticle || articlesBouchonPrecadre[0];

      // Vérification du stock pour Précadre et Bouchons
      verifierStocksLigne([prcObj, bchObj], qte);

      const hasDebordement = (precadreConfig.modeDebordement && precadreConfig.modeDebordement !== 'SANS_DEBORDEMENT' && (precadreConfig.modeDebordement as string) !== 'AUCUN');

      const prcCode = prcObj?.code_art || precadreConfig.articleCode || 'ART0060';
      const prcDesig = prcObj?.designation || 'PRÉCADRE PRC 43';
      const bchCode = bchObj?.code_art || precadreConfig.bouchonArticleCode || 'ART0072';
      const bchDesig = bchObj?.designation || 'BOUCHON PRÉCADRE 36';

      const formattedRefPrc = formaterRefCommandeAvecPrefixe(numCommandePrecadre, monClient, clientCodifications) || 'CMD-PRC';
      const is50 = prcDesig.includes('50') || prcCode === 'ART0071' || (precadreConfig as any).typePrecadre === 'TYPE_50';
      const nouvelleLigne: CommandePrecadre = {
        id: String(Date.now()),
        refCommande: formattedRefPrc,
        nomClient: clientDeMonClient.trim() || 'Client',
        donneurOrdre: monClient,
        dateCommande: dateCommande,
        largeur: l,
        hauteur: h,
        quantite: qte,
        repere: inputRepere.trim() || `1R${lignesPrecadres.length + 1}`,
        figure: precadreConfig.figure,
        modeDebordement: precadreConfig.modeDebordement,
        debordementSuperieur: precadreConfig.debordementSuperieur,
        debordementInferieur: precadreConfig.debordementInferieur,
        typeCoupe: '90',
        jeuMaconnerie: 0,
        articleCode: prcCode,
        articleDesignation: prcDesig,
        typePrecadre: is50 ? 'TYPE_50' : 'TYPE_36',
        bouchonArticleCode: bchCode,
        bouchonArticleDesignation: bchDesig,
        typeAssemblage: hasDebordement ? 'EQUERRE' : 'BOUCHON'
      };
      setLignesPrecadres([...lignesPrecadres, nouvelleLigne]);
      setInputL('');
      setInputH('');
      setInputRepere('');
    }

    // Toujours réinitialiser la quantité à 1 lors de l'ajout d'une ligne
    setInputQte('1');

    setTimeout(() => {
      if (inputRepereRef.current) {
        inputRepereRef.current.focus();
      } else if (inputLRef.current) {
        inputLRef.current.focus();
      }
    }, 50);
  };

  // Suppression d'une ligne
  const handleSupprimerLigne = (famille: FamilleProduit, id: string) => {
    if (famille === 'CAISSON') setLignesCaissons(lignesCaissons.filter(l => l.id !== id));
    if (famille === 'TABLIER') setLignesTabliers(lignesTabliers.filter(l => l.id !== id));
    if (famille === 'MOUSTIQUAIRE') setLignesMoustiquaires(lignesMoustiquaires.filter(l => l.id !== id));
    if (famille === 'PRECADRE') setLignesPrecadres(lignesPrecadres.filter(l => l.id !== id));
  };

  // Modification rapide des options d'une ligne spécifique
  const toggleLigneOption = (famille: FamilleProduit, id: string, optKey: string) => {
    if (famille === 'CAISSON') {
      setLignesCaissons(
        lignesCaissons.map(c => {
          if (c.id !== id) return c;
          if (optKey === 'avecSousFace') return { ...c, avecSousFace: !c.avecSousFace };
          if (optKey === 'montage') return { ...c, montageSousFace: c.montageSousFace === 'MONTEE_ATELIER' ? 'NON_MONTEE' : 'MONTEE_ATELIER' };
          if (optKey === 'peinture') return { ...c, avecPeinture: !c.avecPeinture };
          if (optKey === 'plaque') return { ...c, avecPlaque: !c.avecPlaque };
          return c;
        })
      );
    } else if (famille === 'TABLIER') {
      setLignesTabliers(
        lignesTabliers.map(t => {
          if (t.id !== id) return t;
          if (optKey === 'typeFab') {
            const nextType = t.typeFabrication === 'VOLET_COMPLET' ? 'TABLIER_SEUL' : 'VOLET_COMPLET';
            const hLame = getHauteurLameTablier(t.articleCode, t.articleDesignation, t.hauteur_lame_tablier);
            const baseNbLame = Math.ceil(t.hauteur / hLame);
            const nextNbLame = nextType === 'VOLET_COMPLET' ? baseNbLame + 2 : baseNbLame;
            return {
              ...t,
              typeFabrication: nextType,
              nb_lame: nextNbLame,
              avecCoulisses: nextType === 'VOLET_COMPLET'
            };
          }
          if (optKey === 'lameFinale') return { ...t, avecLameFinale: !t.avecLameFinale };
          return t;
        })
      );
    } else if (famille === 'MOUSTIQUAIRE') {
      setLignesMoustiquaires(
        lignesMoustiquaires.map(m => {
          if (m.id !== id) return m;
          if (optKey === 'typeFab') return { ...m, typeFabrication: m.typeFabrication === 'COMPLET' ? 'SEMI_FINI_MAILLE' : 'COMPLET' };
          if (optKey === 'barreInf') return { ...m, avecBarreInferieure: !m.avecBarreInferieure };
          return m;
        })
      );
    }
  };

  // Nombre total de lignes de la commande en cours
  const totalLignesEnCours =
    lignesCaissons.length + lignesTabliers.length + lignesMoustiquaires.length + lignesPrecadres.length;

  // Déclenché au clic sur "Enregistrer la Commande" : vérifie les données puis ouvre le modal de validation des délais
  const handleEnregistrerDossier = (statutCible: 'EN_ATTENTE' | 'BROUILLON' | 'EN_COURS' = 'EN_ATTENTE') => {
    const nomClientFinalPropre = clientDeMonClient.trim() || 'CLIENT';
    if (!clientDeMonClient.trim()) {
      setClientDeMonClient('CLIENT');
    }

    // Détection ou génération automatique d'une référence de commande valide avec préfixe
    let refPrincipal = (
      numCommandeCaisson.trim() ||
      numCommandeSousFace.trim() ||
      numCommandeTablier.trim() ||
      numCommandeMoustiquaire.trim() ||
      numCommandePrecadre.trim()
    );

    if (!refPrincipal) {
      const genNum = `${currentPrefix}${Math.floor(100000 + Math.random() * 900000)}`;
      refPrincipal = genNum;
      if (familleArticle === 'CAISSON') setNumCommandeCaisson(genNum);
      else if (familleArticle === 'TABLIER') setNumCommandeTablier(genNum);
      else if (familleArticle === 'MOUSTIQUAIRE') setNumCommandeMoustiquaire(genNum);
      else if (familleArticle === 'PRECADRE') setNumCommandePrecadre(genNum);
    }

    if (totalLignesEnCours === 0) {
      showFlashNotification('⚠️ Veuillez saisir au moins une ligne dans la commande avant d\'enregistrer.', 'warn');
      if (inputRepereRef.current) {
        inputRepereRef.current.focus();
      } else if (inputLRef.current) {
        inputLRef.current.focus();
      }
      return;
    }

    // Vérification d'unicité absolue de tous les numéros de commande saisis
    const numCmdsToCheck = [
      numCommandeCaisson,
      numCommandeSousFace,
      numCommandeTablier,
      numCommandeMoustiquaire,
      numCommandePrecadre,
      refPrincipal
    ].filter(Boolean);

    for (const num of numCmdsToCheck) {
      const conflit = verifierUniciteNumeroCommande(num, editingDossierId);
      if (conflit) {
        showFlashNotification(`⛔ Impossible d'enregistrer : Le numéro de commande "${num}" existe déjà dans le dossier "${conflit.nomClientFinal}". Chaque commande doit obligatoirement avoir un numéro unique !`, 'warn');
        return;
      }
    }

    setStatutCiblePourEnregistrement(statutCible);
    ouvrirValidationDelaiModal(statutCible);
  };

  // Enregistrer ou Mettre à Jour le dossier complet dans l'historique SQLite avec les délais confirmés
  const executerSauvegardeDossier = async (
    statutCible: 'EN_ATTENTE' | 'BROUILLON' | 'EN_COURS' = 'EN_ATTENTE',
    customDateISO?: string,
    customDateTexte?: string,
    customEstPrioritaire?: boolean,
    customMotifPriorite?: string
  ) => {
    setIsSavingDossier(true);
    try {
      const nomClientFinalPropre = clientDeMonClient.trim() || 'CLIENT';
      if (!clientDeMonClient.trim()) {
        setClientDeMonClient('CLIENT');
      }

      // Détection ou génération automatique d'une référence de commande valide avec préfixe
      let refPrincipal = (
        numCommandeCaisson.trim() ||
        numCommandeSousFace.trim() ||
        numCommandeTablier.trim() ||
        numCommandeMoustiquaire.trim() ||
        numCommandePrecadre.trim()
      );

      if (!refPrincipal) {
        const genNum = `${currentPrefix}${Math.floor(100000 + Math.random() * 900000)}`;
        refPrincipal = genNum;
        if (familleArticle === 'CAISSON') setNumCommandeCaisson(genNum);
        else if (familleArticle === 'TABLIER') setNumCommandeTablier(genNum);
        else if (familleArticle === 'MOUSTIQUAIRE') setNumCommandeMoustiquaire(genNum);
        else if (familleArticle === 'PRECADRE') setNumCommandePrecadre(genNum);
      }

      const finaleEstPrioritaire = customEstPrioritaire !== undefined ? customEstPrioritaire : estPrioritaire;
      const finaleMotifPriorite = customMotifPriorite !== undefined ? customMotifPriorite : motifPriorite;
      const finaleDateISO = customDateISO || (delaiFixeManuellement && dateLivraisonPrevisionnelleISO ? dateLivraisonPrevisionnelleISO : estimationLivraisonLive.dateLivraisonISO);
      const finaleDateTexte = customDateTexte || (delaiFixeManuellement && dateLivraisonPrevisionnelle ? dateLivraisonPrevisionnelle : estimationLivraisonLive.dateLivraisonFormattee);

      if (customDateISO) {
        setDateLivraisonPrevisionnelleISO(customDateISO);
        setDateLivraisonPrevisionnelle(finaleDateTexte);
        setDelaiFixeManuellement(true);
      }
      if (customEstPrioritaire !== undefined) {
        setEstPrioritaire(customEstPrioritaire);
        setMotifPriorite(finaleMotifPriorite || '');
      }

      // Construction de la cartographie des délais propres à chaque commande / famille
      const datesCommandesToSave: Partial<Record<FamilleProduit, {
        dateLivraison: string;
        dateLivraisonISO: string;
        delaiJours: number;
        numCommande?: string;
        nbPieces: number;
        chargeFileAttente?: number;
      }>> = {};

      if (estimationLivraisonLive.detailsParFamille) {
        Object.entries(estimationLivraisonLive.detailsParFamille).forEach(([fam, det]) => {
          const famKey = fam as FamilleProduit;
          const numCmd = famKey === 'CAISSON' ? numCommandeCaisson : famKey === 'PRECADRE' ? numCommandePrecadre : famKey === 'TABLIER' ? numCommandeTablier : numCommandeMoustiquaire;
          datesCommandesToSave[famKey] = {
            dateLivraison: det.dateLivraisonFormattee,
            dateLivraisonISO: DelaisProductionService.toISODateString(det.dateLivraisonPrevue),
            delaiJours: det.joursOuvresRequis,
            numCommande: numCmd ? numCmd.trim() : undefined,
            nbPieces: det.piecesCommande,
            chargeFileAttente: det.piecesEnFileAttente
          };
        });
      }

      if (editingDossierId) {
        // MISE À JOUR D'UN DOSSIER EXISTANT DANS SQLITE
        const updatedDossiers: DossierCommandeGlobal[] = dossiers.map(d => {
          if (d.id === editingDossierId) {
            const statutPreserve: StatutDossier = estEnPause
              ? 'EN_PAUSE'
              : (d.statut === 'EN_COURS' || d.statut === 'FABRIQUE' || d.statut === 'CLOTURE' || d.statut === 'LIVRE')
              ? d.statut
              : statutCible;
            return {
              ...d,
              donneurOrdre: monClient,
              nomClientFinal: nomClientFinalPropre,
              dateCommande: dateCommande,
              refCommande: refPrincipal,
              numCommandeCaisson: numCommandeCaisson.trim() || (familleArticle === 'CAISSON' ? refPrincipal : ''),
              numCommandeSousFace: numCommandeSousFace.trim(),
              numCommandeTablier: numCommandeTablier.trim() || (familleArticle === 'TABLIER' ? refPrincipal : ''),
              numCommandeMoustiquaire: numCommandeMoustiquaire.trim() || (familleArticle === 'MOUSTIQUAIRE' ? refPrincipal : ''),
              numCommandePrecadre: numCommandePrecadre.trim() || (familleArticle === 'PRECADRE' ? refPrincipal : ''),
              articlesTabliers: [...lignesTabliers],
              articlesMoustiquaires: [...lignesMoustiquaires],
              articlesCaissons: [...lignesCaissons],
              articlesPrecadres: [...lignesPrecadres],
              statut: statutPreserve,
              dateLivraisonPrevisionnelle: finaleDateTexte,
              dateLivraisonPrevisionnelleISO: finaleDateISO,
              delaiPrevisionnelJours: estimationLivraisonLive.joursOuvresMax,
              datesLivraisonCommandes: Object.keys(datesCommandesToSave).length > 0 ? datesCommandesToSave : d.datesLivraisonCommandes,
              typePriorite: (finaleEstPrioritaire || typePriorite === 'INSTANTANE') ? 'INSTANTANE' : 'DIFFERE',
              estPrioritaire: finaleEstPrioritaire || typePriorite === 'INSTANTANE',
              motifPriorite: (finaleEstPrioritaire || typePriorite === 'INSTANTANE') ? (finaleMotifPriorite || motifPriorite) : undefined,
              estEnPause: estEnPause,
              motifPause: estEnPause ? motifPause : undefined,
              datePause: estEnPause ? (datePause || getTodayDateString()) : undefined,
              dureePauseJours: dureePauseJours || 0
            };
          }
          return d;
        });

        await StorageService.saveDossiers(updatedDossiers);
        enregistrerClientDansHistoriqueIncremental(nomClientFinalPropre, monClient);
        if (onDossiersUpdated) onDossiersUpdated();
        showFlashNotification(`✓ Dossier ${refPrincipal} (${nomClientFinalPropre}) mis à jour (${totalLignesEnCours} lignes) dans SQLite !`, 'success');
      } else {
        // CRÉATION D'UN NOUVEAU DOSSIER DANS SQLITE
        const nouveauDossier: DossierCommandeGlobal = {
          id: 'd-' + Date.now(),
          donneurOrdre: monClient,
          nomClientFinal: nomClientFinalPropre,
          dateCommande: dateCommande,
          refCommande: refPrincipal,
          numCommandeCaisson: numCommandeCaisson.trim() || (familleArticle === 'CAISSON' ? refPrincipal : ''),
          numCommandeSousFace: numCommandeSousFace.trim(),
          numCommandeTablier: numCommandeTablier.trim() || (familleArticle === 'TABLIER' ? refPrincipal : ''),
          numCommandeMoustiquaire: numCommandeMoustiquaire.trim() || (familleArticle === 'MOUSTIQUAIRE' ? refPrincipal : ''),
          numCommandePrecadre: numCommandePrecadre.trim() || (familleArticle === 'PRECADRE' ? refPrincipal : ''),
          articlesTabliers: [...lignesTabliers],
          articlesMoustiquaires: [...lignesMoustiquaires],
          articlesCaissons: [...lignesCaissons],
          articlesPrecadres: [...lignesPrecadres],
          notes: `Commande enregistrée le ${dateCommande}`,
          statut: estEnPause ? 'EN_PAUSE' : statutCible,
          dateLivraisonPrevisionnelle: finaleDateTexte,
          dateLivraisonPrevisionnelleISO: finaleDateISO,
          delaiPrevisionnelJours: estimationLivraisonLive.joursOuvresMax,
          datesLivraisonCommandes: Object.keys(datesCommandesToSave).length > 0 ? datesCommandesToSave : undefined,
          typePriorite: (finaleEstPrioritaire || typePriorite === 'INSTANTANE') ? 'INSTANTANE' : 'DIFFERE',
          estPrioritaire: finaleEstPrioritaire || typePriorite === 'INSTANTANE',
          motifPriorite: (finaleEstPrioritaire || typePriorite === 'INSTANTANE') ? (finaleMotifPriorite || motifPriorite) : undefined,
          estEnPause: estEnPause,
          motifPause: estEnPause ? motifPause : undefined,
          datePause: estEnPause ? (datePause || getTodayDateString()) : undefined,
          dureePauseJours: dureePauseJours || 0
        };

        const updated = [nouveauDossier, ...dossiers];
        await StorageService.saveDossiers(updated);
        enregistrerClientDansHistoriqueIncremental(nomClientFinalPropre, monClient);
        setEditingDossierId(nouveauDossier.id);
        if (onDossiersUpdated) onDossiersUpdated();
        showFlashNotification(`✓ Nouveau dossier ${refPrincipal} (${nomClientFinalPropre}) enregistré dans SQLite !`, 'success');
      }

      setShowValidationDelaiModal(false);
    } catch (err: any) {
      console.error('Erreur enregistrement dossier:', err);
      showFlashNotification(`❌ Erreur enregistrement : ${err.message || String(err)}`, 'warn');
      alert(`Erreur lors de l'enregistrement de la commande : ${err.message || String(err)}`);
    } finally {
      setIsSavingDossier(false);
    }
  };

  // CONFIRMATION INDIVIDUELLE D'UNE COMMANDE AU SEIN DU DOSSIER
  // Permet de valider et émettre l'OF d'une commande prête SANS attendre le reste du dossier !
  const handleConfirmerCommandeIndividuelle = async (cmdRef: string) => {
    try {
      const refNettoyee = (cmdRef || '').trim();
      if (!refNettoyee) return;

      showFlashNotification(`⏳ Confirmation et préparation de l'OF pour la commande N° ${refNettoyee}...`, 'info');

      // 1. Sauvegarder l'état actuel du dossier sans blocage
      await executerSauvegardeDossier('EN_COURS');

      // 2. Marquer la commande comme confirmée individuellement dans le dossier
      const freshDossiers = await StorageService.getDossiers();
      const targetId = editingDossierId;
      const updatedDossiers = freshDossiers.map(d => {
        const matchesThisDossier = (targetId && d.id === targetId) ||
          (d.refCommande || '').trim() === refNettoyee ||
          (d.numCommandeCaisson || '').trim() === refNettoyee ||
          (d.numCommandeTablier || '').trim() === refNettoyee ||
          (d.numCommandeMoustiquaire || '').trim() === refNettoyee ||
          (d.numCommandePrecadre || '').trim() === refNettoyee;

        if (matchesThisDossier) {
          const currentConfirmees = d.commandesConfirmees || [];
          const nextConfirmees = Array.from(new Set([...currentConfirmees, refNettoyee]));
          return {
            ...d,
            statut: (d.statut === 'FABRIQUE' || d.statut === 'CLOTURE' || d.statut === 'LIVRE') ? d.statut : ('EN_COURS' as const),
            commandesConfirmees: nextConfirmees
          };
        }
        return d;
      });
      await StorageService.saveDossiers(updatedDossiers);
      if (onDossiersUpdated) onDossiersUpdated();

      // 3. Déclencher immédiatement l'optimisation et la génération de l'OF pour cette commande spécifique
      await handleOptimiserMultiFamillesDossier(refNettoyee);
      showFlashNotification(`✓ Commande N° ${refNettoyee} confirmée avec succès ! Son Ordre de Fabrication est prêt pour l'atelier sans attendre le reste du dossier.`, 'success');
    } catch (err: any) {
      console.error('Erreur confirmation commande individuelle:', err);
      showFlashNotification(`❌ Erreur lors de la confirmation : ${err.message || String(err)}`, 'warn');
    }
  };

  // Passer à l'Atelier de Débit correspondant
  const handleAllerAtelier = (famille: FamilleProduit) => {
    if (famille === 'CAISSON') onNavigateToTab('caisson');
    else if (famille === 'TABLIER') onNavigateToTab('tablier');
    else if (famille === 'MOUSTIQUAIRE') onNavigateToTab('moustiquaire');
    else if (famille === 'PRECADRE') onNavigateToTab('precadre');
  };

  // Dossiers filtrés selon la famille d'article active et les filtres de recherche
  const dossiersFiltres = useMemo(() => {
    return (dossiers || []).filter(d => {
      if (!d) return false;
      const donneur = d.donneurOrdre || '';
      const ref = d.refCommande || '';
      const client = d.nomClientFinal || '';

      // Filtre par famille d'article active (Caisson, Tablier, Moustiquaire, Précadre)
      if (familleArticle === 'CAISSON' && (!d.articlesCaissons || d.articlesCaissons.length === 0)) return false;
      if (familleArticle === 'TABLIER' && (!d.articlesTabliers || d.articlesTabliers.length === 0)) return false;
      if (familleArticle === 'MOUSTIQUAIRE' && (!d.articlesMoustiquaires || d.articlesMoustiquaires.length === 0)) return false;
      if (familleArticle === 'PRECADRE' && (!d.articlesPrecadres || d.articlesPrecadres.length === 0)) return false;

      if (filterDonneur !== 'TOUS' && !donneur.toLowerCase().includes(filterDonneur.toLowerCase())) {
        return false;
      }
      if (filterStatut !== 'TOUS' && d.statut !== filterStatut) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mRef = ref.toLowerCase().includes(q);
        const mCli = client.toLowerCase().includes(q);
        const mDon = donneur.toLowerCase().includes(q);
        const mDat = (d.dateCommande || '').toLowerCase().includes(q);
        // Recherche par REPÈRE de ligne de commande (pour l'opérateur caisson)
        const mRepCaisson = (d.articlesCaissons || []).some(c => (c.repere || '').toLowerCase().includes(q));
        const mRepTablier = (d.articlesTabliers || []).some(t => (t.repere || '').toLowerCase().includes(q));
        const mRepMstq = (d.articlesMoustiquaires || []).some(m => (m.repere || '').toLowerCase().includes(q));
        const mRepPrecadre = (d.articlesPrecadres || []).some(p => (p.repere || '').toLowerCase().includes(q));
        const mRep = mRepCaisson || mRepTablier || mRepMstq || mRepPrecadre;

        if (!mRef && !mCli && !mDon && !mDat && !mRep) return false;
      }
      return true;
    });
  }, [dossiers, familleArticle, filterDonneur, filterStatut, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Toast Notification Flash */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 transition-all animate-bounce duration-300 ${
            notification.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500 text-emerald-100'
              : notification.type === 'warn'
              ? 'bg-amber-950/95 border-amber-500 text-amber-100'
              : 'bg-sky-950/95 border-sky-500 text-sky-100'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{notification.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. EN-TÊTE FIXE DU HAUT (MON CLIENT ➔ LEUR CLIENT ➔ DATE ➔ ACTIONS)       */}
      {/* ========================================================================= */}
      <div ref={editorRef} className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 shadow-lg shadow-black/20 transition-all duration-300 ${editingDossierId ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Saisie & Gestion de Commande Client
                </h2>
                {editingDossierId ? (
                  <span className="text-[11px] font-black tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 animate-pulse">
                    <Edit2 className="w-3 h-3" />
                    <span>MODIFICATION DOSSIER : {dossiers.find(d => d.id === editingDossierId)?.refCommande || 'ENREGISTRÉ'}</span>
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>NOUVEAU DOSSIER VIERGE</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {(totalLignesEnCours > 0 || editingDossierId) && (
              <button
                type="button"
                onClick={() => handleEnregistrerDossier('EN_ATTENTE')}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
                title="Enregistrer toutes les lignes de la commande dans la base SQLite"
              >
                <Save className="w-4 h-4" />
                <span>{editingDossierId ? 'Mettre à jour Dossier' : 'Enregistrer la Commande'}</span>
              </button>
            )}

            {/* BOUTON HISTORIQUE AVEC LIEN NOUVEL ONGLET */}
            <a
              href="?tab=historique"
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  onNavigateToTab('historique');
                }
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-purple-500/30 hover:border-purple-400 shadow-md transition active:scale-95 cursor-pointer"
              title="Ouvrir l'Historique (Clic normal ou Clic-droit / Ctrl+Clic pour ouvrir dans un nouvel onglet)"
            >
              <History className="w-4 h-4 text-purple-400" />
              <span>📜 Historique</span>
              <ExternalLink className="w-3 h-3 text-purple-400/70" />
            </a>

            {/* BOUTON 1 : NOUVEAU DOSSIER */}
            <button
              type="button"
              onClick={() => handleNouveauDossier(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 shadow-md transition active:scale-95 cursor-pointer"
              title="Démarrer un nouveau dossier complet à zéro (Nouveau Client)"
            >
              <FolderPlus className="w-4 h-4 text-sky-400" />
              <span>📁 Nouveau Dossier</span>
            </button>
          </div>
        </div>

        {/* Alerte contextuelle si on est en train de modifier un dossier existant */}
        {editingDossierId && (
          <div className="mb-4 bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Vous modifiez actuellement le dossier existant <strong className="text-amber-300 font-mono font-bold">{dossiers.find(d => d.id === editingDossierId)?.refCommande}</strong> de <strong className="text-slate-100">{clientDeMonClient || 'ce client'}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleNouveauDossier(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
              title="Quitter ce dossier et remettre tout le masque à zéro"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>📁 Remettre le Masque à 0 (Nouveau Dossier)</span>
            </button>
          </div>
        )}

        {/* Formulaire En-tête : Mon Client / Client de Mon Client / Date / Délai & Livraison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-center bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
          {/* Mon Client (Donneur d'ordre) */}
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-semibold text-sky-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>Mon Client *</span>
              </span>
              <div className="flex items-center gap-1.5">
                {(() => {
                  const currentCodif = clientCodifications.find(c => c.nom === monClient);
                  return currentCodif?.prefixeCommande ? (
                    <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      {currentCodif.prefixeCommande}
                    </span>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={() => setModalCodificationOpen(true)}
                  className="text-[10px] text-sky-400 hover:text-sky-300 underline font-medium cursor-pointer"
                  title="Gérer les agences et leurs préfixes de commande"
                >
                  Gérer
                </button>
              </div>
            </label>
            <select
              value={monClient}
              onChange={e => handleMonClientChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  inputClientRef.current?.focus();
                }
              }}
              className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 shadow-inner cursor-pointer transition ${
                !monClient
                  ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                  : 'border-sky-500/40 text-sky-200 focus:ring-sky-500'
              }`}
            >
              <option value="">-- Mon Client (Agence) * --</option>
              {clientCodifications.filter(c => c.actif !== false).map(d => (
                <option key={d.id || d.code} value={d.nom}>
                  {d.nom} ({d.prefixeCommande})
                </option>
              ))}
              {clientsDossiersNonCodifies.length > 0 && (
                <optgroup label="Agences identifiées dans l'historique">
                  {clientsDossiersNonCodifies.map(nom => (
                    <option key={`hist-${nom}`} value={nom}>
                      {nom} (Historique)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Le Client de Mon Client (Client final / Chantier avec mémoire incrémentale) */}
          <div className="lg:col-span-4 relative">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-emerald-300 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>Nom Client / Chantier *</span>
              </label>
              {clientsHistoriqueComplet.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClientSuggestions(prev => !prev)}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-medium flex items-center gap-0.5 cursor-pointer"
                  title="Afficher les clients mémorisés dans l'historique"
                >
                  <History className="w-3 h-3" />
                  <span>{clientsHistoriqueComplet.length} mémorisés</span>
                </button>
              )}
            </div>

            <div className="relative">
              <input
                ref={inputClientRef}
                type="text"
                value={clientDeMonClient}
                onFocus={() => {
                  if (clientDeMonClient.trim().length > 0) {
                    setShowClientSuggestions(true);
                  }
                }}
                onChange={e => {
                  setClientDeMonClient(e.target.value);
                  if (e.target.value.trim().length > 0) {
                    setShowClientSuggestions(true);
                  } else {
                    setShowClientSuggestions(false);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setShowClientSuggestions(false);
                    enregistrerClientDansHistoriqueIncremental(clientDeMonClient, monClient);
                    inputNumCmdRef.current?.focus();
                  } else if (e.key === 'Escape') {
                    setShowClientSuggestions(false);
                  }
                }}
                placeholder="Nom du Client / Chantier *"
                className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-2 shadow-inner transition ${
                  !clientDeMonClient.trim()
                    ? 'border-amber-500/80 text-amber-200 ring-2 ring-amber-500/20 bg-amber-950/20 placeholder:text-amber-400/60'
                    : 'border-emerald-500/40 focus:ring-emerald-500'
                }`}
              />

              {/* Dropdown interactif d'auto-complétion incrémentale */}
              {showClientSuggestions && suggestionsClientsFiltrees.length > 0 && (
                <div
                  ref={clientSuggestionsRef}
                  className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 max-h-60 overflow-y-auto space-y-1"
                >
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-800">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Clients correspondants ({suggestionsClientsFiltrees.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowClientSuggestions(false)}
                      className="text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {suggestionsClientsFiltrees.map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectClientSuggestion(sug)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800/90 text-xs text-slate-200 flex items-center justify-between gap-2 transition cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-bold text-slate-100 group-hover:text-emerald-300 truncate">
                          {sug.nom}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                        {sug.donneurOrdre && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-500/30 font-medium">
                            {sug.donneurOrdre}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {sug.nb} cmd{sug.nb > 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date de la Commande */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-purple-300 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date Dossier *</span>
            </label>
            <input
              type="text"
              value={dateCommande}
              onChange={e => setDateCommande(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  inputNumCmdRef.current?.focus();
                }
              }}
              placeholder="JJ/MM/AAAA"
              className="w-full bg-slate-900 border border-purple-500/40 rounded-lg px-3 py-2 text-xs text-purple-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner"
            />
          </div>

          {/* Date de Livraison Fixée & Priorité Atelier */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-emerald-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Date Livraison (Fixée)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = typePriorite === 'INSTANTANE' ? 'DIFFERE' : 'INSTANTANE';
                    setTypePriorite(next);
                    setEstPrioritaire(next === 'INSTANTANE');
                  }}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-black uppercase transition cursor-pointer flex items-center gap-1 ${
                    typePriorite === 'INSTANTANE'
                      ? 'bg-rose-500 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Basculer entre Instantané (fabrication immédiate) et Différé"
                >
                  <Zap className={`w-2.5 h-2.5 ${typePriorite === 'INSTANTANE' ? 'fill-current' : ''}`} />
                  <span>{typePriorite === 'INSTANTANE' ? '⚡ Instantané' : '⏳ Différé'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAfficherEditeurLivraison(prev => !prev)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline font-medium flex items-center gap-0.5 cursor-pointer"
                  title="Fixer ou ajuster la date de livraison"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Fixer</span>
                </button>
              </div>
            </div>

            <div
              onClick={() => setAfficherEditeurLivraison(prev => !prev)}
              className={`w-full border rounded-lg px-2.5 py-1.5 flex items-center justify-between cursor-pointer transition shadow-inner ${
                estEnPause
                  ? 'bg-red-950/40 border-red-500/60 text-red-200 hover:bg-red-950/60'
                  : typePriorite === 'INSTANTANE'
                  ? 'bg-rose-950/40 border-rose-500/60 text-rose-200 hover:bg-rose-950/60'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-600'
              }`}
              title="Cliquer pour afficher/masquer le panneau de fixation de la date et priorité"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-mono font-bold truncate flex items-center gap-1.5">
                  {estEnPause ? (
                    <span className="text-red-400 font-black flex items-center gap-1">
                      <Pause className="w-3 h-3 text-red-400 animate-pulse" />
                      EN PAUSE
                    </span>
                  ) : typePriorite === 'INSTANTANE' ? (
                    <span className="text-rose-400 font-black flex items-center gap-1">
                      <Zap className="w-3 h-3 text-rose-400 fill-rose-400" />
                      ⚡ INSTANTANÉ :
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-400" />
                      DATE :
                    </span>
                  )}
                  <span className="truncate">
                    {(() => {
                      const raw = delaiFixeManuellement && dateLivraisonPrevisionnelle
                        ? dateLivraisonPrevisionnelle
                        : estimationLivraisonLive.dateLivraisonFormattee;
                      return raw.replace(/^(⚡\s*INSTANTAN[EÉ]\s*:\s*|⚡\s*PRIORITAIRE\s*:\s*|LIVRAISON\s*PR[EÉ]VUE\s*:\s*|D[EÉ]LAI\s*PR[EÉ]VISIONNEL\s*:\s*|D[EÉ]LAI\s*:\s*|LIVRAISON\s*:\s*)/i, '').trim();
                    })()}
                  </span>
                </span>
                <span className="text-[9px] text-slate-400 truncate">
                  {estEnPause
                    ? `Interruption : +${dureePauseJours}j (Pause en cours)`
                    : typePriorite === 'INSTANTANE'
                    ? 'Fabrication immédiate (en tête de file)'
                    : 'Date de livraison fixée'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${afficherEditeurLivraison ? 'rotate-180 text-amber-400' : ''}`} />
            </div>
          </div>
        </div>

        {/* Panneau dépliable de fixation de la Date & Priorité Commande */}
        {afficherEditeurLivraison && (
          <div className="mt-2.5 bg-slate-950 p-3.5 rounded-xl border border-emerald-500/40 shadow-xl space-y-3 animate-fade-in text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-100">Fixer la Date de Livraison &amp; Priorité Commande</span>
              </div>
              <button
                type="button"
                onClick={() => setAfficherEditeurLivraison(false)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
              >
                ✕ Fermer
              </button>
            </div>

            {/* Sélecteur Instantané vs Différé */}
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-white block">Priorité de Fabrication de la Commande :</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Les commandes <strong>Instantanées</strong> sont fabriquées immédiatement et classées au-devant des autres dans la file atelier.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTypePriorite('INSTANTANE');
                    setEstPrioritaire(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
                    typePriorite === 'INSTANTANE'
                      ? 'bg-rose-600 text-white shadow-md ring-1 ring-rose-400'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Zap className={`w-3.5 h-3.5 ${typePriorite === 'INSTANTANE' ? 'fill-current' : ''}`} />
                  <span>⚡ Instantané</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTypePriorite('DIFFERE');
                    setEstPrioritaire(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    typePriorite === 'DIFFERE'
                      ? 'bg-sky-600 text-white shadow-md ring-1 ring-sky-400'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>⏳ Différé</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Date ISO de livraison */}
              <div className="md:col-span-4 space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-300">
                  Date de livraison fixée
                </label>
                <input
                  type="date"
                  value={dateLivraisonPrevisionnelleISO || estimationLivraisonLive.dateLivraisonISO || ''}
                  onChange={e => {
                    const iso = e.target.value;
                    setDateLivraisonPrevisionnelleISO(iso);
                    if (iso) {
                      const parts = iso.split('-');
                      if (parts.length === 3) {
                        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                        if (!isNaN(d.getTime())) {
                          const txt = DelaisProductionService.formaterDateLivraison(d);
                          setDateLivraisonPrevisionnelle(txt);
                        }
                      }
                    }
                    setDelaiFixeManuellement(true);
                  }}
                  className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-3 py-1.5 text-xs text-amber-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Raccourcis rapides */}
              <div className="md:col-span-8 space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-300">
                  Raccourcis Délais Ouvrés &amp; Calcul Atelier
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => appliquerRaccourciLivraison(0)}
                    className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 rounded font-bold text-[11px] transition cursor-pointer flex items-center gap-1 shadow-xs"
                    title={`Livraison aujourd'hui (${new Date().toLocaleDateString('fr-FR')})`}
                  >
                    <Zap className="w-3 h-3 fill-rose-400" />
                    <span>Aujourd'hui</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => appliquerRaccourciLivraison(1)}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded font-bold text-[11px] transition cursor-pointer"
                  >
                    +1j Ouvré
                  </button>
                  <button
                    type="button"
                    onClick={() => appliquerRaccourciLivraison(2)}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded font-bold text-[11px] transition cursor-pointer"
                  >
                    +2j Ouvrés
                  </button>
                  <button
                    type="button"
                    onClick={() => appliquerRaccourciLivraison(3)}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded font-bold text-[11px] transition cursor-pointer"
                  >
                    +3j Ouvrés
                  </button>
                  <button
                    type="button"
                    onClick={() => appliquerRaccourciLivraison(5)}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded font-bold text-[11px] transition cursor-pointer"
                  >
                    +5j (1 Semaine)
                  </button>
                  {delaiFixeManuellement && (
                    <button
                      type="button"
                      onClick={reinitialiserDelaiAutomatique}
                      className="px-2 py-1 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/40 text-sky-300 rounded font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                      title="Repasser au calcul automatique d'atelier basé sur la cadence réelle"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>↺ Revenir au Calcul Auto</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => ouvrirValidationDelaiModal()}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[11px] transition cursor-pointer flex items-center gap-1 shadow"
                    title="Ouvrir l'analyse détaillée des volumes par famille et files d'attente atelier"
                  >
                    <TrendingUp className="w-3 h-3 stroke-[2.5]" />
                    <span>Détail Charge & Délais</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Section Mise en Pause pour rupture ou attente client */}
            <div className="p-2.5 rounded-xl border bg-slate-900/60 border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePauseCommande}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                    estEnPause
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-red-600/90 hover:bg-red-500 text-white'
                  }`}
                  title={estEnPause ? "Reprendre la production du dossier" : "Mettre en pause (rupture profilé, attente client...)"}
                >
                  {estEnPause ? (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>▶️ Reprendre Production</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>⏸️ Mettre en Pause (Rupture / Attente)</span>
                    </>
                  )}
                </button>

                <div className="space-y-0.5">
                  <div className="text-[11px] text-slate-200 font-semibold flex items-center gap-1.5">
                    <span>Statut :</span>
                    {estEnPause ? (
                      <span className="text-red-400 font-bold bg-red-950/80 border border-red-500/40 px-2 py-0.5 rounded">
                        EN PAUSE (Date pause : {datePause || 'Aujourd\'hui'})
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold">En cours de traitement</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Les jours d'interruption sont automatiquement déduits du calcul pour reporter la date de livraison.
                  </p>
                </div>
              </div>

              {estEnPause && (
                <div className="w-full md:w-auto flex-1 md:max-w-xs">
                  <input
                    type="text"
                    value={motifPause}
                    onChange={e => setMotifPause(e.target.value)}
                    placeholder="Motif de pause (ex: Rupture profilé CT SOMO 30...)"
                    className="w-full bg-slate-950 border border-red-500/40 rounded-lg px-2.5 py-1 text-xs text-red-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* BANDEAU DE SYNTHÈSE DES DÉLAIS CALCULÉS PAR COMMANDE ET PAR FAMILLE */}
        {estimationLivraisonLive.hasPieces && Object.keys(estimationLivraisonLive.detailsParFamille).length > 0 && (
          <div className="mt-3 bg-slate-950/90 p-3 rounded-xl border border-sky-500/30 shadow-lg space-y-2 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-slate-100">
                  Délais par commande (selon la charge de travail spécifique de chaque famille) :
                </span>
              </div>
              <div className="text-[11px] text-amber-300 font-bold bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-500/40 flex items-center gap-1.5">
                <span>📅 Date globale du dossier (échéance la plus longue) :</span>
                <span className="font-mono text-white text-xs underline decoration-amber-400 font-black">
                  {delaiFixeManuellement && dateLivraisonPrevisionnelle
                    ? dateLivraisonPrevisionnelle.replace(/^LIVRAISON\s*:\s*/i, '')
                    : estimationLivraisonLive.dateLivraisonFormattee.replace(/^LIVRAISON\s*:\s*/i, '')}
                </span>
                {estimationLivraisonLive.familleGoulot && !delaiFixeManuellement && (
                  <span className="text-[9px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Goulot : {estimationLivraisonLive.familleGoulot}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80">
              {(['CAISSON', 'PRECADRE', 'TABLIER', 'MOUSTIQUAIRE'] as FamilleProduit[]).map(fam => {
                const det = estimationLivraisonLive.detailsParFamille[fam];
                const isGoulot = fam === estimationLivraisonLive.familleGoulot;
                const numCmd = fam === 'CAISSON' ? numCommandeCaisson : fam === 'PRECADRE' ? numCommandePrecadre : fam === 'TABLIER' ? numCommandeTablier : numCommandeMoustiquaire;
                const nbLignes = fam === 'CAISSON' ? lignesCaissons.length : fam === 'PRECADRE' ? lignesPrecadres.length : fam === 'TABLIER' ? lignesTabliers.length : lignesMoustiquaires.length;

                if (!det && nbLignes === 0) return null;

                return (
                  <div
                    key={fam}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1 transition ${
                      isGoulot
                        ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/30'
                        : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-slate-200 flex items-center gap-1">
                        {fam === 'CAISSON' && '📦 Caisson'}
                        {fam === 'PRECADRE' && '🚪 Précadre'}
                        {fam === 'TABLIER' && '🪟 Volet/Tablier'}
                        {fam === 'MOUSTIQUAIRE' && '🦟 Moustiquaire'}
                      </span>
                      {isGoulot ? (
                        <span className="text-[9px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Dossier Max
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400 font-mono">
                          {det?.joursOuvresRequis || 0}j ouvrés
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {numCmd ? `N° ${numCmd}` : 'Sans N°'}
                      </span>
                      <span className="font-mono font-bold text-emerald-300 text-xs">
                        {det ? det.dateLivraisonFormattee : '—'}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-1 mt-0.5 space-y-0.5">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-slate-400">
                          {det?.piecesCommande || 0} cmd + {det?.piecesEnFileAttente || 0} file
                          {(det?.nbOfsEnCours || 0) > 0 ? ` (${det?.nbOfsEnCours} OF)` : ''}
                        </span>
                        <span className="font-bold text-amber-300 font-mono">= {(det?.piecesCommande || 0) + (det?.piecesEnFileAttente || 0)} pcs</span>
                      </div>
                      <div className="flex justify-between items-center text-[9px] text-slate-400">
                        <span>Cadence : {det?.capaciteJournaliere || 20} pcs/j</span>
                        <span className="font-mono text-sky-400 font-bold">{det?.joursOuvresRequis || 0}j ouvrés</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. ONGLETS PAR FAMILLE DE PRODUIT (AVEC N° COMMANDE PROPRE À CHAQUE ONGLET)*/}
      {/* ========================================================================= */}
      <div className="space-y-0">
        {/* BARRE D'ONGLETS (TABS) PAR FAMILLE : TOUS SUR LA MÊME LIGNE */}
        <div className="grid grid-cols-4 items-end gap-1.5 border-b-2 border-slate-700/80 px-2 pt-2 bg-slate-950/60 rounded-t-2xl w-full">
          {/* ONGLET 1: CAISSON & SF */}
          <button
            type="button"
            onClick={() => handleFamilleChange('CAISSON')}
            className={`w-full min-w-0 px-2.5 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-1.5 border-t-2 border-x-2 -mb-[2px] ${
              familleArticle === 'CAISSON'
                ? 'bg-slate-900 border-emerald-500 text-emerald-300 border-b-2 border-b-slate-900 shadow-lg z-10'
                : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className={`w-3.5 h-3.5 shrink-0 ${familleArticle === 'CAISSON' ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="font-black truncate">📦 Caisson & SF</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                familleArticle === 'CAISSON' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}>
                {lignesCaissons.length}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {estimationLivraisonLive.detailsParFamille['CAISSON'] && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 whitespace-nowrap" title="Date fixée pour Caisson">
                  📅 {estimationLivraisonLive.detailsParFamille['CAISSON'].dateLivraisonFormattee.replace(/^(LIVRAISON\s*PR[EÉ]VUE|D[EÉ]LAI\s*PR[EÉ]VISIONNEL|D[EÉ]LAI|LIVRAISON)\s*:\s*/i, '')}
                </span>
              )}
              {numCommandeCaisson && extraireNumeroSansPrefixe(numCommandeCaisson, clientCodifications) ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap">
                  N° {numCommandeCaisson}
                </span>
              ) : (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                  Sans N°
                </span>
              )}
            </div>
          </button>

          {/* ONGLET 2: VOLET / TABLIER */}
          <button
            type="button"
            onClick={() => handleFamilleChange('TABLIER')}
            className={`w-full min-w-0 px-2.5 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-1.5 border-t-2 border-x-2 -mb-[2px] ${
              familleArticle === 'TABLIER'
                ? 'bg-slate-900 border-sky-500 text-sky-300 border-b-2 border-b-slate-900 shadow-lg z-10'
                : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Scissors className={`w-3.5 h-3.5 shrink-0 ${familleArticle === 'TABLIER' ? 'text-sky-400' : 'text-slate-500'}`} />
              <span className="font-black truncate">🪟 Volet / Tablier</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                familleArticle === 'TABLIER' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-slate-800 text-slate-400'
              }`}>
                {lignesTabliers.length}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {estimationLivraisonLive.detailsParFamille['TABLIER'] && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-sky-950/80 text-sky-300 border border-sky-500/40 whitespace-nowrap" title="Date fixée pour Tablier">
                  📅 {estimationLivraisonLive.detailsParFamille['TABLIER'].dateLivraisonFormattee.replace(/^(LIVRAISON\s*PR[EÉ]VUE|D[EÉ]LAI\s*PR[EÉ]VISIONNEL|D[EÉ]LAI|LIVRAISON)\s*:\s*/i, '')}
                </span>
              )}
              {numCommandeTablier && extraireNumeroSansPrefixe(numCommandeTablier, clientCodifications) ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-black bg-sky-500/20 text-sky-300 border border-sky-500/40 whitespace-nowrap">
                  N° {numCommandeTablier}
                </span>
              ) : (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                  Sans N°
                </span>
              )}
            </div>
          </button>

          {/* ONGLET 3: PRÉCADRE */}
          <button
            type="button"
            onClick={() => handleFamilleChange('PRECADRE')}
            className={`w-full min-w-0 px-2.5 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-1.5 border-t-2 border-x-2 -mb-[2px] ${
              familleArticle === 'PRECADRE'
                ? 'bg-slate-900 border-purple-500 text-purple-300 border-b-2 border-b-slate-900 shadow-lg z-10'
                : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 className={`w-3.5 h-3.5 shrink-0 ${familleArticle === 'PRECADRE' ? 'text-purple-400' : 'text-slate-500'}`} />
              <span className="font-black truncate">🚪 Précadre</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                familleArticle === 'PRECADRE' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800 text-slate-400'
              }`}>
                {lignesPrecadres.length}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {estimationLivraisonLive.detailsParFamille['PRECADRE'] && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-500/40 whitespace-nowrap" title="Date fixée pour Précadre">
                  📅 {estimationLivraisonLive.detailsParFamille['PRECADRE'].dateLivraisonFormattee.replace(/^(LIVRAISON\s*PR[EÉ]VUE|D[EÉ]LAI\s*PR[EÉ]VISIONNEL|D[EÉ]LAI|LIVRAISON)\s*:\s*/i, '')}
                </span>
              )}
              {numCommandePrecadre && extraireNumeroSansPrefixe(numCommandePrecadre, clientCodifications) ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 whitespace-nowrap">
                  N° {numCommandePrecadre}
                </span>
              ) : (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                  Sans N°
                </span>
              )}
            </div>
          </button>

          {/* ONGLET 4: MOUSTIQUAIRE */}
          <button
            type="button"
            onClick={() => handleFamilleChange('MOUSTIQUAIRE')}
            className={`w-full min-w-0 px-2.5 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-1.5 border-t-2 border-x-2 -mb-[2px] ${
              familleArticle === 'MOUSTIQUAIRE'
                ? 'bg-slate-900 border-amber-500 text-amber-300 border-b-2 border-b-slate-900 shadow-lg z-10'
                : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Sliders className={`w-3.5 h-3.5 shrink-0 ${familleArticle === 'MOUSTIQUAIRE' ? 'text-amber-400' : 'text-slate-500'}`} />
              <span className="font-black truncate">🦟 Moustiquaire</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                familleArticle === 'MOUSTIQUAIRE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-400'
              }`}>
                {lignesMoustiquaires.length}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {estimationLivraisonLive.detailsParFamille['MOUSTIQUAIRE'] && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 whitespace-nowrap" title="Date fixée pour Moustiquaire">
                  📅 {estimationLivraisonLive.detailsParFamille['MOUSTIQUAIRE'].dateLivraisonFormattee.replace(/^(LIVRAISON\s*PR[EÉ]VUE|D[EÉ]LAI\s*PR[EÉ]VISIONNEL|D[EÉ]LAI|LIVRAISON)\s*:\s*/i, '')}
                </span>
              )}
              {numCommandeMoustiquaire && extraireNumeroSansPrefixe(numCommandeMoustiquaire, clientCodifications) ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                  N° {numCommandeMoustiquaire}
                </span>
              ) : (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                  Sans N°
                </span>
              )}
            </div>
          </button>
        </div>

        {/* CONTENU DE L'ONGLET SÉLECTIONNÉ */}
        <div className={`bg-slate-900 border-2 rounded-b-2xl rounded-tr-none p-5 shadow-2xl space-y-5 relative ${
          familleArticle === 'CAISSON'
            ? 'border-emerald-500/60'
            : familleArticle === 'TABLIER'
            ? 'border-sky-500/60'
            : familleArticle === 'PRECADRE'
            ? 'border-purple-500/60'
            : 'border-amber-500/60'
        }`}>
          {/* BANDEAU SUPÉRIEUR DE L'ONGLET ACTIF AVEC SAISIE DU N° DE COMMANDE DÉDIÉ */}
          <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3.5 shadow-md ${
            familleArticle === 'CAISSON'
              ? 'bg-emerald-950/40 border-emerald-500/40'
              : familleArticle === 'TABLIER'
              ? 'bg-sky-950/40 border-sky-500/40'
              : familleArticle === 'PRECADRE'
              ? 'bg-purple-950/40 border-purple-500/40'
              : 'bg-amber-950/40 border-amber-500/40'
          }`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                  familleArticle === 'CAISSON'
                    ? 'bg-emerald-500 text-slate-950'
                    : familleArticle === 'TABLIER'
                    ? 'bg-sky-500 text-slate-950'
                    : familleArticle === 'PRECADRE'
                    ? 'bg-purple-500 text-slate-950'
                    : 'bg-amber-500 text-slate-950'
                }`}>
                  {familleArticle === 'CAISSON' ? '📦 Onglet Caisson & SF' :
                   familleArticle === 'TABLIER' ? '🪟 Onglet Volet / Tablier' :
                   familleArticle === 'PRECADRE' ? '🚪 Onglet Précadre' : '🦟 Onglet Moustiquaire'}
                </span>
                <span className="text-xs font-bold text-slate-200">
                  N° Commande pour cet onglet * :
                </span>
              </div>

              {/* Champ de Saisie avec Préfixe Automatique */}
              <div className={`flex items-stretch rounded-lg border overflow-hidden bg-slate-900 shadow-inner transition ${
                conflitNumCmdActif
                  ? 'border-red-500 ring-2 ring-red-500/50 bg-red-950/20'
                  : 'border-slate-700 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-400/40'
              }`}>
                <span
                  className={`px-3 py-1.5 font-mono font-black text-xs flex items-center border-r select-none cursor-default ${
                    conflitNumCmdActif ? 'bg-red-900/60 text-red-200 border-red-700' : 'bg-slate-800 text-amber-300 border-slate-700'
                  }`}
                  title={`Préfixe officiel pour ${monClient}`}
                >
                  {currentPrefix}
                </span>
                <input
                  ref={inputNumCmdRef}
                  type="text"
                  value={extraireNumeroSansPrefixe(getActiveNumCommande(), clientCodifications)}
                  onChange={e => {
                    const raw = e.target.value;
                    const sansPref = extraireNumeroSansPrefixe(raw, clientCodifications);
                    const formatted = sansPref ? `${currentPrefix}${sansPref}` : '';
                    if (familleArticle === 'CAISSON') setNumCommandeCaisson(formatted);
                    else if (familleArticle === 'TABLIER') setNumCommandeTablier(formatted);
                    else if (familleArticle === 'MOUSTIQUAIRE') setNumCommandeMoustiquaire(formatted);
                    else if (familleArticle === 'PRECADRE') setNumCommandePrecadre(formatted);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (inputRepereRef.current) {
                        inputRepereRef.current.focus();
                      } else if (inputLRef.current) {
                        inputLRef.current.focus();
                      }
                    }
                  }}
                  placeholder="ex: 260460"
                  className={`bg-transparent font-mono font-black text-sm px-3 py-1.5 w-36 focus:outline-none placeholder:text-slate-500 placeholder:font-normal placeholder:text-xs ${
                    conflitNumCmdActif ? 'text-red-300' : 'text-emerald-300'
                  }`}
                />
              </div>

              {/* Indicateur de validation direct & avertissement unicité */}
              {!extraireNumeroSansPrefixe(getActiveNumCommande(), clientCodifications) ? (
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 animate-pulse" title="Saisissez les chiffres de la commande (Appuyez sur Entrée ↵ pour passer directement aux dimensions)">
                  <span>⚠️ N° à saisir pour cet onglet (Entrée ↵)</span>
                </span>
              ) : conflitNumCmdActif ? (
                <span className="text-xs bg-red-950 text-red-200 border-2 border-red-500 px-3 py-1.5 rounded-lg font-black flex items-center gap-2 shadow-lg shadow-red-950/60 animate-bounce" title={`Ce numéro existe déjà dans le dossier "${conflitNumCmdActif.nomClientFinal}". Chaque commande doit obligatoirement avoir un numéro unique !`}>
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                  <span>⛔ N° DÉJÀ UTILISÉ dans "{conflitNumCmdActif.nomClientFinal}" (N° unique obligatoire)</span>
                </span>
              ) : (
                <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-lg font-bold flex items-center gap-1.5" title="Le numéro est unique et valide pour cette commande.">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>✓ N° Unique &amp; Actif : {getActiveNumCommande()}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Délai calculé pour la commande active */}
              {(() => {
                const det = estimationLivraisonLive.detailsParFamille[familleArticle];
                if (det) {
                  return (
                    <div
                      className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-sky-500/40 text-xs shadow-inner"
                      title={`Calculé d'après la charge atelier : ${det.piecesCommande} pcs dans cette commande + ${det.piecesEnFileAttente} pcs en file d'attente`}
                    >
                      <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="text-slate-300">Délai {det.libelleFamille} :</span>
                      <span className="font-mono font-bold text-emerald-300">{det.dateLivraisonFormattee}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({det.joursOuvresRequis}j ouvrés)</span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <span>Client :</span>
                <strong className="text-slate-100 font-bold">{clientDeMonClient || 'Non spécifié'}</strong>
                <span className="text-slate-600">|</span>
                <span className="text-sky-300 font-semibold">{monClient || 'Sans agence'}</span>
              </div>
            </div>
          </div>

        {/* ========================================================================= */}
        {/* 🎯 STRATÉGIE D'OPTIMISATION DE DÉCOUPE 1D (MODE MATIÈRE VS MODE TEMPS)     */}
        {/* ========================================================================= */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <SelecteurMode
            mode={optMode}
            setMode={setOptMode}
            poidsTemps={poidsTemps}
            setPoidsTemps={setPoidsTemps}
          />
        </div>

        {/* ========================================================================= */}
        {/* BLOC PRINCIPAL : CONDITIONS & EXIGENCES GLOBALES (HÉRITAGE AUTOMATIQUE)    */}
        {/* ========================================================================= */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                Conditions & Exigences Globales de l'Article (Héritage Automatique)
              </h3>
            </div>
            <span className="text-[11px] text-amber-400/90 font-medium italic">
              ⚡ Toutes les lignes saisies ci-dessous hériteront instantanément de ces réglages
            </span>
          </div>

          {/* OPTIONS CONDITIONNELLES SELON LA FAMILLE D'ARTICLE */}
          {/* A. SI CAISSON & SOUS-FACE */}
          {familleArticle === 'CAISSON' && (
            <div className="space-y-3 bg-slate-900/90 p-3.5 rounded-lg border border-emerald-500/30">
              {/* SÉLECTEUR DU TYPE DE PRESTATION (3 MODES) */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300 mr-1">Prestation :</span>
                <button
                  type="button"
                  onClick={() => setCaissonConfig({ ...caissonConfig, typeCommande: 'CAISSON_ET_SOUS_FACE', avecSousFace: true })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    caissonConfig.typeCommande === 'CAISSON_ET_SOUS_FACE'
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span>📦 + 📐 Caisson + Sous-Face</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaissonConfig({ ...caissonConfig, typeCommande: 'CAISSON_SEUL', avecSousFace: false })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    caissonConfig.typeCommande === 'CAISSON_SEUL'
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span>📦 Caisson Seul (Sans SF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaissonConfig({ ...caissonConfig, typeCommande: 'SOUS_FACE_SEULE', avecSousFace: true })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    caissonConfig.typeCommande === 'SOUS_FACE_SEULE'
                      ? 'bg-sky-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span>📐 Sous-Face Seule (Spécifique)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Modèle de Caisson Tunnel (Désactivé si Sous-Face Seule) */}
                <div className={caissonConfig.typeCommande === 'SOUS_FACE_SEULE' ? 'opacity-40 pointer-events-none' : ''}>
                  <label className="block text-[11px] font-bold text-emerald-300 mb-1 flex items-center justify-between">
                    <span>Type de Caisson *</span>
                    {currentCTArticle?.longeur ? (
                      <span className="text-[10px] text-emerald-400/80 font-mono">Barre {currentCTArticle.longeur}mm</span>
                    ) : null}
                  </label>
                  <select
                    disabled={caissonConfig.typeCommande === 'SOUS_FACE_SEULE'}
                    value={caissonConfig.ctArticleCode}
                    onChange={e => handleSelectCaissonCT(e.target.value)}
                    className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs font-black focus:outline-none focus:ring-1 shadow-inner transition ${
                      !caissonConfig.ctArticleCode && caissonConfig.typeCommande !== 'SOUS_FACE_SEULE'
                        ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                        : 'border-emerald-500/50 text-amber-300 focus:ring-emerald-500'
                    }`}
                  >
                    <option value="">-- Choisir le Type de Caisson (Obligatoire) * --</option>
                    {articlesCT.map(a => (
                      <option key={a.code_art} value={a.code_art}>
                        {a.designation} ({a.stock_physique} barres)
                      </option>
                    ))}
                  </select>
                  {currentCTArticle && (
                    <div className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                      currentCTArticle.stock_physique <= 0
                        ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                        : currentCTArticle.stock_physique <= (currentCTArticle.stock_min || 5)
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : 'bg-slate-900/60 text-slate-400'
                    }`}>
                      <span>Stock CT : {currentCTArticle.stock_physique} barres</span>
                      {currentCTArticle.stock_physique <= (currentCTArticle.stock_min || 5) && (
                        <span className={currentCTArticle.stock_physique <= 0 ? 'text-red-400 font-black' : 'text-amber-400'}>
                          {currentCTArticle.stock_physique <= 0 ? '⛔ Rupture' : '⚠️ Stock bas'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Profilé Sous-Face (SF) */}
                <div className={caissonConfig.typeCommande === 'CAISSON_SEUL' ? 'opacity-40 pointer-events-none' : ''}>
                  <label className="block text-[11px] font-bold text-sky-300 mb-1 flex items-center justify-between">
                    <span>Profil Sous-Face (SF) *</span>
                    {currentSFArticle?.longeur ? (
                      <span className="text-[10px] text-sky-400/80 font-mono">Barre {currentSFArticle.longeur}mm</span>
                    ) : null}
                  </label>
                  <select
                    disabled={caissonConfig.typeCommande === 'CAISSON_SEUL'}
                    value={caissonConfig.sfArticleCode}
                    onChange={e => handleSelectSousFaceSF(e.target.value)}
                    className={`w-full bg-slate-950 border disabled:opacity-40 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 shadow-inner transition ${
                      !caissonConfig.sfArticleCode && caissonConfig.typeCommande !== 'CAISSON_SEUL'
                        ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                        : 'border-sky-500/50 text-sky-200 focus:ring-sky-500'
                    }`}
                  >
                    <option value="">-- Choisir la Sous-Face (Obligatoire) * --</option>
                    {sousFacesOptimisees.recommandees.length > 0 && (
                      <optgroup label={`⭐ Sous-Faces compatibles (${sousFacesOptimisees.dimLabel ? `Dim ${sousFacesOptimisees.dimLabel}` : 'Recommandées'})`}>
                        {sousFacesOptimisees.recommandees.map(s => (
                          <option key={s.code_art} value={s.code_art}>
                            {s.designation} ({s.stock_physique} barres)
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {sousFacesOptimisees.autres.length > 0 && (
                      <optgroup label="Autres dimensions / finitions">
                        {sousFacesOptimisees.autres.map(s => (
                          <option key={s.code_art} value={s.code_art}>
                            {s.designation} ({s.stock_physique} barres)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {currentSFArticle && (
                    <div className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                      currentSFArticle.stock_physique <= 0
                        ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                        : currentSFArticle.stock_physique <= (currentSFArticle.stock_min || 5)
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : 'bg-slate-900/60 text-slate-400'
                    }`}>
                      <span>Stock SF : {currentSFArticle.stock_physique} barres</span>
                      {currentSFArticle.stock_physique <= (currentSFArticle.stock_min || 5) && (
                        <span className={currentSFArticle.stock_physique <= 0 ? 'text-red-400 font-black' : 'text-amber-400'}>
                          {currentSFArticle.stock_physique <= 0 ? '⛔ Rupture' : '⚠️ Stock bas'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Montage & Finition Peinture & Plaque */}
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Options &amp; Finitions Caisson</span>
                    <div className="flex items-center gap-2">
                      {caissonConfig.avecPeinture && (
                        <span className="text-[10px] text-purple-400 font-bold">🎨 Peint</span>
                      )}
                      {caissonConfig.avecPlaque && (
                        <span className="text-[10px] text-emerald-400 font-bold">🛡️ Plaque</span>
                      )}
                    </div>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {/* Checkbox Montage Sous-Face */}
                    <label
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition select-none ${
                        caissonConfig.typeCommande !== 'CAISSON_ET_SOUS_FACE'
                          ? 'opacity-40 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-500'
                          : caissonConfig.montageSousFace === 'MONTEE_ATELIER'
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                      title={caissonConfig.typeCommande === 'CAISSON_ET_SOUS_FACE' ? 'Montage de la sous-face en atelier' : 'Disponible en mode Caisson + Sous-Face'}
                    >
                      <input
                        type="checkbox"
                        disabled={caissonConfig.typeCommande !== 'CAISSON_ET_SOUS_FACE'}
                        checked={caissonConfig.montageSousFace === 'MONTEE_ATELIER'}
                        onChange={e =>
                          setCaissonConfig({
                            ...caissonConfig,
                            montageSousFace: e.target.checked ? 'MONTEE_ATELIER' : 'NON_MONTEE'
                          })
                        }
                        className="rounded border-slate-700 text-sky-500 focus:ring-sky-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="truncate">
                        {caissonConfig.montageSousFace === 'MONTEE_ATELIER' ? '✓ SF Montée' : 'SF Séparée'}
                      </span>
                    </label>

                    {/* Checkbox Finition Peinture */}
                    <label
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition select-none ${
                        caissonConfig.avecPeinture
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                      title="Cocher si le profil doit être peint"
                    >
                      <input
                        type="checkbox"
                        checked={caissonConfig.avecPeinture}
                        onChange={e =>
                          setCaissonConfig({
                            ...caissonConfig,
                            avecPeinture: e.target.checked
                          })
                        }
                        className="rounded border-slate-700 text-purple-500 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="truncate">
                        {caissonConfig.avecPeinture ? '🎨 Avec Peinture' : 'Sans Peinture'}
                      </span>
                    </label>

                    {/* Checkbox Avec Plaque */}
                    <label
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition select-none ${
                        caissonConfig.avecPlaque
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                      title="Cocher si le caisson est avec plaque"
                    >
                      <input
                        type="checkbox"
                        checked={caissonConfig.avecPlaque ?? false}
                        onChange={e =>
                          setCaissonConfig({
                            ...caissonConfig,
                            avecPlaque: e.target.checked
                          })
                        }
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="truncate">
                        {caissonConfig.avecPlaque ? '🛡️ Avec Plaque' : 'Sans Plaque'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Conditions &amp; Paramètres Techniques de Découpe</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowTechParams(!showTechParams)}
                  className="text-[11px] text-amber-300 hover:text-amber-200 underline font-bold ml-2 shrink-0 cursor-pointer"
                >
                  {showTechParams ? '▲ Masquer réglages' : '⚙️ Modifier réglages découpe (Barre, Lame, Marge)'}
                </button>
              </div>

              {/* ⚙️ PANNEAU INTERACTIF DES PARAMÈTRES TECHNIQUES DE DÉCOUPE (CT & SF) */}
              {showTechParams && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>Réglage Direct des Conditions de Découpe (Modifiable en direct sur écran) :</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {/* CT Tech Params */}
                    <div className="bg-slate-950/90 p-2.5 rounded-lg border border-emerald-500/40 space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span className="text-emerald-300 font-mono">📦 {currentCTArticle?.designation || '(Sélectionnez un Caisson)'}</span>
                        {ctTechParams.isDirty && (
                          <button
                            type="button"
                            onClick={() => handleSaveArticleTechParams('CT')}
                            className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded shadow transition cursor-pointer"
                          >
                            💾 Enregistrer pour l'article
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans">Barre (mm)</span>
                          <input
                            type="number"
                            value={ctTechParams.longeur || ''}
                            placeholder="-"
                            onChange={e => setCtTechParams({ ...ctTechParams, longeur: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-amber-300 font-black text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans">Lame (mm)</span>
                          <input
                            type="number"
                            step="0.5"
                            value={ctTechParams.lame || ''}
                            placeholder="-"
                            onChange={e => setCtTechParams({ ...ctTechParams, lame: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans">Débordement (mm)</span>
                          <input
                            type="number"
                            value={ctTechParams.debordement !== undefined && ctTechParams.debordement !== 0 ? ctTechParams.debordement : (ctTechParams.debordement === 0 && currentCTArticle ? 0 : '')}
                            placeholder="0"
                            onChange={e => setCtTechParams({ ...ctTechParams, debordement: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Min</span>
                          <input
                            type="number"
                            value={ctTechParams.refus_min || ''}
                            placeholder="-"
                            onChange={e => setCtTechParams({ ...ctTechParams, refus_min: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Max</span>
                          <input
                            type="number"
                            value={ctTechParams.refus_max || ''}
                            placeholder="-"
                            onChange={e => setCtTechParams({ ...ctTechParams, refus_max: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SF Tech Params */}
                    {caissonConfig.avecSousFace && (
                      <div className="bg-slate-950/90 p-2.5 rounded-lg border border-sky-500/40 space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-[11px]">
                          <span className="text-sky-300 font-mono">📐 {currentSFArticle?.designation || '(Sélectionnez une Sous-Face)'}</span>
                          {sfTechParams.isDirty && (
                            <button
                              type="button"
                              onClick={() => handleSaveArticleTechParams('SF')}
                              className="text-[10px] bg-sky-500 hover:bg-sky-400 text-slate-950 font-black px-2 py-0.5 rounded shadow transition cursor-pointer"
                            >
                              💾 Enregistrer pour l'article
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                          <div>
                            <span className="block text-[9px] text-slate-400 uppercase font-sans">Barre (mm)</span>
                            <input
                              type="number"
                              value={sfTechParams.longeur || ''}
                              placeholder="-"
                              onChange={e => setSfTechParams({ ...sfTechParams, longeur: Number(e.target.value), isDirty: true })}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-sky-200 font-black text-center"
                            />
                          </div>
                          <div>
                            <span className="block text-[9px] text-slate-400 uppercase font-sans">Lame (mm)</span>
                            <input
                              type="number"
                              step="0.5"
                              value={sfTechParams.lame || ''}
                              placeholder="-"
                              onChange={e => setSfTechParams({ ...sfTechParams, lame: Number(e.target.value), isDirty: true })}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                            />
                          </div>
                          <div>
                            <span className="block text-[9px] text-slate-400 uppercase font-sans">Débordement (mm)</span>
                            <input
                              type="number"
                              value={sfTechParams.debordement !== undefined && sfTechParams.debordement !== 0 ? sfTechParams.debordement : (sfTechParams.debordement === 0 && currentSFArticle ? 0 : '')}
                              placeholder="0"
                              onChange={e => setSfTechParams({ ...sfTechParams, debordement: Number(e.target.value), isDirty: true })}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                            />
                          </div>
                          <div>
                            <span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Min</span>
                            <input
                              type="number"
                              value={sfTechParams.refus_min || ''}
                              placeholder="-"
                              onChange={e => setSfTechParams({ ...sfTechParams, refus_min: Number(e.target.value), isDirty: true })}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                            />
                          </div>
                          <div>
                            <span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Max</span>
                            <input
                              type="number"
                              value={sfTechParams.refus_max || ''}
                              placeholder="-"
                              onChange={e => setSfTechParams({ ...sfTechParams, refus_max: Number(e.target.value), isDirty: true })}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* B. SI TABLIER / VOLET ROULANT */}
          {familleArticle === 'TABLIER' && (
            <div className="space-y-3 bg-slate-900/90 p-3.5 rounded-xl border border-sky-500/20">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Sélection Profilé Lame Tablier */}
                <div className="bg-slate-950 p-2.5 rounded-lg border border-amber-500/30 flex flex-col justify-between space-y-2">
                  <label className="block text-[11px] font-bold text-amber-300 flex items-center justify-between">
                    <span>Profil Lame Tablier</span>
                    {currentTBLArticle?.longeur ? (
                      <span className="text-[10px] text-slate-400 font-mono">Barre {currentTBLArticle.longeur}mm</span>
                    ) : null}
                  </label>
                  <select
                    value={tablierConfig.articleCode}
                    onChange={e => {
                      const code = e.target.value;
                      const found = articlesTablier.find(a => a.code_art === code);
                      // Règle d'or : si LA43 BL -> Lame Finale automatiquement BL (même couleur & adéquation)
                      const bestLF = trouverLameFinalePourTablier(found || null, articlesLameFinale);
                      const bestGL = trouverCoulissePourTablier(found || null, articlesCoulisses);

                      setTablierConfig(prev => ({
                        ...prev,
                        articleCode: code,
                        hauteurLame: found?.hauteur || 43,
                        lfArticleCode: bestLF ? bestLF.code_art : prev.lfArticleCode,
                        glArticleCode: bestGL ? bestGL.code_art : prev.glArticleCode
                      }));
                      if (found) {
                        setTblTechParams({
                          longeur: found.longeur || 6000,
                          lame: (found.lame && found.lame <= 6) ? found.lame : 4.0,
                          debordement: found.debordement || 0,
                          refus_min: found.refus_min || 250,
                          refus_max: found.refus_max || 1000,
                          isDirty: false
                        });
                      }
                      if (bestLF) {
                        setLfTechParams({
                          longeur: bestLF.longeur || 6000,
                          lame: (bestLF.lame && bestLF.lame <= 6) ? bestLF.lame : 4.0,
                          debordement: bestLF.debordement || 0,
                          refus_min: bestLF.refus_min || 250,
                          refus_max: bestLF.refus_max || 1000,
                          isDirty: false
                        });
                      }
                    }}
                    className={`w-full bg-slate-900 border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 shadow-inner transition ${
                      !tablierConfig.articleCode
                        ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                        : 'border-amber-500/40 text-amber-200 focus:ring-amber-500'
                    }`}
                  >
                    <option value="">-- Choisir la Lame Tablier (Obligatoire) * --</option>
                    {articlesTablier.map(a => (
                      <option key={a.code_art} value={a.code_art}>
                        {a.designation} ({a.stock_physique} barres)
                      </option>
                    ))}
                  </select>
                  {currentTBLArticle && (
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                      currentTBLArticle.stock_physique <= 0
                        ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                        : currentTBLArticle.stock_physique <= (currentTBLArticle.stock_min || 5)
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : 'bg-slate-900/60 text-slate-400'
                    }`}>
                      <span>Stock TBL : {currentTBLArticle.stock_physique} barres</span>
                      {currentTBLArticle.stock_physique <= (currentTBLArticle.stock_min || 5) && (
                        <span className={currentTBLArticle.stock_physique <= 0 ? 'text-red-400 font-black' : 'text-amber-400'}>
                          {currentTBLArticle.stock_physique <= 0 ? '⛔ Rupture' : '⚠️ Stock bas'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Option & Profilé Lame Finale */}
                <div className="bg-slate-950 p-2.5 rounded-lg border border-emerald-500/30 space-y-2">
                  <label className="block text-[11px] font-bold text-emerald-300 flex items-center justify-between">
                    <span>Lame Finale</span>
                    {currentLFArticle?.longeur ? (
                      <span className="text-[10px] text-slate-400 font-mono">Barre {currentLFArticle.longeur}mm</span>
                    ) : null}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTablierConfig(prev => ({ ...prev, avecLameFinale: true }))}
                      className={`py-1.5 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
                        tablierConfig.avecLameFinale ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      ✓ Avec LF
                    </button>
                    <button
                      type="button"
                      onClick={() => setTablierConfig(prev => ({ ...prev, avecLameFinale: false }))}
                      className={`py-1.5 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
                        !tablierConfig.avecLameFinale ? 'bg-slate-700 text-slate-100 font-black shadow' : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      ✕ Sans LF
                    </button>
                  </div>
                  <select
                    disabled={!tablierConfig.avecLameFinale || articlesLameFinale.length === 0}
                    value={tablierConfig.lfArticleCode}
                    onChange={e => {
                      const code = e.target.value;
                      const found = articlesLameFinale.find(a => a.code_art === code);
                      setTablierConfig(prev => ({ ...prev, lfArticleCode: code }));
                      if (found) {
                        setLfTechParams({
                          longeur: found.longeur || 6000,
                          lame: (found.lame && found.lame <= 6) ? found.lame : 4.0,
                          debordement: found.debordement || 0,
                          refus_min: found.refus_min || 250,
                          refus_max: found.refus_max || 1000,
                          isDirty: false
                        });
                      }
                    }}
                    className={`w-full bg-slate-900 border disabled:opacity-40 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 shadow-inner transition ${
                      tablierConfig.avecLameFinale && !tablierConfig.lfArticleCode
                        ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                        : 'border-emerald-500/40 text-emerald-200 focus:ring-emerald-500'
                    }`}
                  >
                    <option value="">-- Choisir la Lame Finale (Obligatoire si active) * --</option>
                    {lamesFinalesOptimisees.recommandees.length > 0 && (
                      <optgroup label="⭐ Lames Finales assorties (Recommandées)">
                        {lamesFinalesOptimisees.recommandees.map(a => (
                          <option key={a.code_art} value={a.code_art}>
                            {a.designation} ({a.stock_physique} barres)
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {lamesFinalesOptimisees.autres.length > 0 && (
                      <optgroup label="Autres finitions de Lame Finale">
                        {lamesFinalesOptimisees.autres.map(a => (
                          <option key={a.code_art} value={a.code_art}>
                            {a.designation} ({a.stock_physique} barres)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {tablierConfig.avecLameFinale && currentLFArticle && (
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                      currentLFArticle.stock_physique <= 0
                        ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                        : currentLFArticle.stock_physique <= (currentLFArticle.stock_min || 5)
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : 'bg-slate-900/60 text-slate-400'
                    }`}>
                      <span>Stock LF : {currentLFArticle.stock_physique} barres</span>
                      {currentLFArticle.stock_physique <= (currentLFArticle.stock_min || 5) && (
                        <span className={currentLFArticle.stock_physique <= 0 ? 'text-red-400 font-black' : 'text-amber-400'}>
                          {currentLFArticle.stock_physique <= 0 ? '⛔ Rupture' : '⚠️ Stock bas'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Option & Profilé Coulisses */}
                <div className="bg-slate-950 p-2.5 rounded-lg border border-sky-500/30 space-y-2">
                  <label className="block text-[11px] font-bold text-sky-300 flex items-center justify-between">
                    <span>Prestation Volet / Coulisses</span>
                    {currentGLArticle?.longeur ? (
                      <span className="text-[10px] text-slate-400 font-mono">Barre {currentGLArticle.longeur}mm</span>
                    ) : null}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTablierConfig(prev => ({ ...prev, typeFabrication: 'VOLET_COMPLET' }))}
                      className={`py-1.5 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
                        tablierConfig.typeFabrication === 'VOLET_COMPLET' ? 'bg-sky-500 text-slate-950 font-black shadow' : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      Volet Complet
                    </button>
                    <button
                      type="button"
                      onClick={() => setTablierConfig(prev => ({ ...prev, typeFabrication: 'TABLIER_SEUL' }))}
                      className={`py-1.5 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
                        tablierConfig.typeFabrication === 'TABLIER_SEUL' ? 'bg-slate-700 text-slate-100 font-black shadow' : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      Tablier Seul
                    </button>
                  </div>
                  <select
                    disabled={tablierConfig.typeFabrication !== 'VOLET_COMPLET' || articlesCoulisses.length === 0}
                    value={tablierConfig.glArticleCode}
                    onChange={e => {
                      const code = e.target.value;
                      const found = articlesCoulisses.find(a => a.code_art === code);
                      setTablierConfig(prev => ({ ...prev, glArticleCode: code }));
                      if (found) {
                        setGlTechParams({
                          longeur: found.longeur || 6000,
                          lame: (found.lame && found.lame <= 6) ? found.lame : 4.0,
                          debordement: found.debordement !== undefined ? found.debordement : 0,
                          refus_min: found.refus_min || 300,
                          refus_max: found.refus_max || 1200,
                          isDirty: false
                        });
                      }
                    }}
                    className={`w-full bg-slate-900 border disabled:opacity-40 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 shadow-inner transition ${
                      tablierConfig.typeFabrication === 'VOLET_COMPLET' && !tablierConfig.glArticleCode
                        ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                        : 'border-sky-500/40 text-sky-200 focus:ring-sky-500'
                    }`}
                  >
                    <option value="">-- Choisir les Coulisses (Obligatoire pour volet complet) * --</option>
                    {articlesCoulisses.map(a => (
                      <option key={a.code_art} value={a.code_art}>
                        {a.designation} ({a.stock_physique} barres)
                      </option>
                    ))}
                  </select>
                  {tablierConfig.typeFabrication === 'VOLET_COMPLET' && currentGLArticle && (
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                      currentGLArticle.stock_physique <= 0
                        ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                        : currentGLArticle.stock_physique <= (currentGLArticle.stock_min || 5)
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : 'bg-slate-900/60 text-slate-400'
                    }`}>
                      <span>Stock Coulisses : {currentGLArticle.stock_physique} barres</span>
                      {currentGLArticle.stock_physique <= (currentGLArticle.stock_min || 5) && (
                        <span className={currentGLArticle.stock_physique <= 0 ? 'text-red-400 font-black' : 'text-amber-400'}>
                          {currentGLArticle.stock_physique <= 0 ? '⛔ Rupture' : '⚠️ Stock bas'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Panneau de Réglages Directs des Conditions de Découpe (Tablier, Lame Finale, Coulisses) */}
              <div className="flex items-center justify-between text-[11px] bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Conditions Techniques de Découpe (Tablier, Lame Finale, Coulisses)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowTechParams(!showTechParams)}
                  className="text-[11px] text-amber-300 hover:text-amber-200 underline font-bold ml-2 shrink-0 cursor-pointer"
                >
                  {showTechParams ? '▲ Masquer réglages' : '⚙️ Modifier réglages découpe (Barres, Lames, Débordements)'}
                </button>
              </div>

              {showTechParams && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Lame Tablier */}
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-amber-500/30 space-y-1.5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                        <span className="text-[11px] font-bold text-amber-300">📦 {currentTBLArticle?.designation || 'Lame Tablier'}</span>
                        {tblTechParams.isDirty && (
                          <button
                            type="button"
                            onClick={() => handleSaveArticleTechParams('TBL')}
                            className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded flex items-center gap-1 transition cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            <span>Enregistrer</span>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Barre</span>
                          <input
                            type="number"
                            value={tblTechParams.longeur || ''}
                            placeholder="-"
                            onChange={e => setTblTechParams({ ...tblTechParams, longeur: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-amber-200 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Lame</span>
                          <input
                            type="number"
                            step="0.5"
                            value={tblTechParams.lame || ''}
                            placeholder="-"
                            onChange={e => setTblTechParams({ ...tblTechParams, lame: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Débordement</span>
                          <input
                            type="number"
                            value={tblTechParams.debordement !== undefined && tblTechParams.debordement !== 0 ? tblTechParams.debordement : (tblTechParams.debordement === 0 && currentTBLArticle ? 0 : '')}
                            placeholder="0"
                            onChange={e => setTblTechParams({ ...tblTechParams, debordement: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Refus Min</span>
                          <input
                            type="number"
                            value={tblTechParams.refus_min || ''}
                            placeholder="-"
                            onChange={e => setTblTechParams({ ...tblTechParams, refus_min: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Refus Max</span>
                          <input
                            type="number"
                            value={tblTechParams.refus_max || ''}
                            placeholder="-"
                            onChange={e => setTblTechParams({ ...tblTechParams, refus_max: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Lame Finale */}
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-emerald-500/30 space-y-1.5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                        <span className="text-[11px] font-bold text-emerald-300">🏁 {currentLFArticle?.designation || 'Lame Finale'}</span>
                        {lfTechParams.isDirty && (
                          <button
                            type="button"
                            onClick={() => handleSaveArticleTechParams('LF')}
                            className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded flex items-center gap-1 transition cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            <span>Enregistrer</span>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Barre</span>
                          <input
                            type="number"
                            value={lfTechParams.longeur || ''}
                            placeholder="-"
                            onChange={e => setLfTechParams({ ...lfTechParams, longeur: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-emerald-200 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Lame</span>
                          <input
                            type="number"
                            step="0.5"
                            value={lfTechParams.lame || ''}
                            placeholder="-"
                            onChange={e => setLfTechParams({ ...lfTechParams, lame: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Débordement</span>
                          <input
                            type="number"
                            value={lfTechParams.debordement !== undefined && lfTechParams.debordement !== 0 ? lfTechParams.debordement : (lfTechParams.debordement === 0 && currentLFArticle ? 0 : '')}
                            placeholder="0"
                            onChange={e => setLfTechParams({ ...lfTechParams, debordement: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Refus Min</span>
                          <input
                            type="number"
                            value={lfTechParams.refus_min || ''}
                            placeholder="-"
                            onChange={e => setLfTechParams({ ...lfTechParams, refus_min: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Refus Max</span>
                          <input
                            type="number"
                            value={lfTechParams.refus_max || ''}
                            placeholder="-"
                            onChange={e => setLfTechParams({ ...lfTechParams, refus_max: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Coulisses */}
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-sky-500/30 space-y-1.5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                        <span className="text-[11px] font-bold text-sky-300">📐 {currentGLArticle?.designation || 'Coulisses'}</span>
                        {glTechParams.isDirty && (
                          <button
                            type="button"
                            onClick={() => handleSaveArticleTechParams('GL')}
                            className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded flex items-center gap-1 transition cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            <span>Enregistrer</span>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Barre</span>
                          <input
                            type="number"
                            value={glTechParams.longeur || ''}
                            placeholder="-"
                            onChange={e => setGlTechParams({ ...glTechParams, longeur: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-sky-200 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Lame</span>
                          <input
                            type="number"
                            step="0.5"
                            value={glTechParams.lame || ''}
                            placeholder="-"
                            onChange={e => setGlTechParams({ ...glTechParams, lame: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Débordement</span>
                          <input
                            type="number"
                            value={glTechParams.debordement !== undefined && glTechParams.debordement !== 0 ? glTechParams.debordement : (glTechParams.debordement === 0 && currentGLArticle ? 0 : '')}
                            placeholder="0"
                            onChange={e => setGlTechParams({ ...glTechParams, debordement: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Refus Min</span>
                          <input
                            type="number"
                            value={glTechParams.refus_min || ''}
                            placeholder="-"
                            onChange={e => setGlTechParams({ ...glTechParams, refus_min: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-sans">Refus Max</span>
                          <input
                            type="number"
                            value={glTechParams.refus_max || ''}
                            placeholder="-"
                            onChange={e => setGlTechParams({ ...glTechParams, refus_max: Number(e.target.value), isDirty: true })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* C. SI MOUSTIQUAIRE */}
          {familleArticle === 'MOUSTIQUAIRE' && (
            <div className="space-y-3 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">

              {/* ROW 1 : Type d'Ouverture (5 Boutons Visuels) */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Type d’Ouverture Moustiquaire *</span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">
                    {mstqConfig.typeOuverture === 'PORTE_FENETRE' && 'Porte-Fenêtre 1 Vantail (Ouverture Latérale)'}
                    {mstqConfig.typeOuverture === 'DOUBLE_VANTAUX' && 'Baie Double Vantaux (2 Vantaux Latéraux)'}
                    {mstqConfig.typeOuverture === 'CENTRALE' && 'Porte-Fenêtre Centrale (1 Vantail Central)'}
                    {mstqConfig.typeOuverture === 'FENETRE' && 'Fenêtre Standard (Ouverture Verticale ↕)'}
                    {mstqConfig.typeOuverture === 'FIXE' && 'Cadre Fixe (Sans Ouverture / Coulisse 0)'}
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {([
                    { val: 'PORTE_FENETRE', label: 'Porte-Fenêtre', desc: '1 vantail lat.' },
                    { val: 'DOUBLE_VANTAUX', label: 'Baie 2 Vantaux', desc: '2 vantaux lat.' },
                    { val: 'CENTRALE', label: 'Centrale', desc: '1 vantail central' },
                    { val: 'FENETRE', label: 'Fenêtre', desc: 'Ouverture verticale ↕' },
                    { val: 'FIXE', label: 'Fixe', desc: 'Sans coulisse' },
                  ] as const).map(({ val, label, desc }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMstqConfig({ ...mstqConfig, typeOuverture: val })}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition cursor-pointer border ${
                        mstqConfig.typeOuverture === val
                          ? 'bg-slate-800 text-amber-300 border-amber-500/60 font-bold shadow-sm'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div>{label}</div>
                      <div className="text-[10px] font-normal text-slate-400 mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ROW 2 : Mode Prestation + Option Barre Inférieure / Seuil */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Mode Prestation Moustiquaire
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMstqConfig({ ...mstqConfig, typeFabrication: 'COMPLET' })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        mstqConfig.typeFabrication === 'COMPLET'
                          ? 'bg-slate-800 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      Complète (Maille + Cadre)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMstqConfig({ ...mstqConfig, typeFabrication: 'SEMI_FINI_MAILLE' })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        mstqConfig.typeFabrication === 'SEMI_FINI_MAILLE'
                          ? 'bg-slate-800 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      Semi-Fini (Maille Seule)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMstqConfig({ ...mstqConfig, typeFabrication: 'PROFILES_SEULS' })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        mstqConfig.typeFabrication === 'PROFILES_SEULS'
                          ? 'bg-slate-800 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      Profilés Seuls
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Option Barre Inférieure
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMstqConfig({ ...mstqConfig, avecBarreInferieure: false })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        !mstqConfig.avecBarreInferieure
                          ? 'bg-slate-800 text-slate-200 border-slate-700'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      Sans Barre Inf (Cadre 4 côtés)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMstqConfig({ ...mstqConfig, avecBarreInferieure: true })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        mstqConfig.avecBarreInferieure
                          ? 'bg-slate-800 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      ✓ Avec Barre Inférieure
                    </button>
                  </div>
                </div>
              </div>

              {/* ROW 3 : SÉLECTION DES ARTICLES DU STOCK */}
              <div className="pt-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Articles Liés du Stock Réel
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">

                  {/* 1. MAILLE MSTQ */}
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex flex-col justify-between space-y-1">
                    <label className="block text-[11px] font-bold text-slate-300">
                      <span>Maille MSTQ *</span>
                    </label>
                    <select
                      value={mstqConfig.mailleArticleCode}
                      onChange={e => {
                        const code = e.target.value;
                        const found = articlesMailleMSTQ.find(a => a.code_art === code);
                        setMstqConfig(prev => ({
                          ...prev,
                          mailleArticleCode: code,
                          mailleArticleDesignation: found?.designation || code
                        }));
                      }}
                      className={`w-full bg-slate-900 border rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 transition ${
                        !mstqConfig.mailleArticleCode && mstqConfig.typeFabrication !== 'PROFILES_SEULS'
                          ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                          : 'border-slate-700 text-slate-100 focus:ring-amber-500'
                      }`}
                    >
                      <option value="">-- Choisir la Maille (Obligatoire) * --</option>
                      {articlesMailleMSTQ.map(art => (
                        <option key={art.code_art} value={art.code_art}>
                          {art.designation} ({art.stock_physique} rouleaux)
                        </option>
                      ))}
                    </select>
                    {currentMailleMSTQArticle && (
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                        currentMailleMSTQArticle.stock_physique <= 0
                          ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                          : currentMailleMSTQArticle.stock_physique <= (currentMailleMSTQArticle.stock_min || 3)
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                          : 'bg-slate-900/60 text-slate-400'
                      }`}>
                        <span>Stock Maille : {currentMailleMSTQArticle.stock_physique}</span>
                        {currentMailleMSTQArticle.stock_physique <= 0 && <span className="text-red-400 font-black">⛔ Rupture</span>}
                      </div>
                    )}
                  </div>

                  {/* 2. CADRE MSTQ */}
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex flex-col justify-between space-y-1">
                    <label className="block text-[11px] font-bold text-slate-300">
                      <span>Cadre MSTQ *</span>
                    </label>
                    <select
                      disabled={mstqConfig.typeFabrication === 'SEMI_FINI_MAILLE'}
                      value={mstqConfig.cadreArticleCode}
                      onChange={e => {
                        const code = e.target.value;
                        const found = articlesCadreMSTQ.find(a => a.code_art === code);
                        // Règle d'or : si Cadre Blanc -> Coulisse Blanc et Barre Inférieure Blanc automatiquement
                        const bestCoulisse = trouverCoulissePourCadreMSTQ(found || null, articlesCoulisseMSTQ);
                        const bestBarreInf = trouverBarreInfPourCadreMSTQ(found || null, articlesBarreInfMSTQ);

                        setMstqConfig(prev => ({
                          ...prev,
                          cadreArticleCode: code,
                          cadreArticleDesignation: found?.designation || code,
                          coulisseArticleCode: bestCoulisse ? bestCoulisse.code_art : prev.coulisseArticleCode,
                          coulisseArticleDesignation: bestCoulisse ? bestCoulisse.designation : prev.coulisseArticleDesignation,
                          barreInfArticleCode: bestBarreInf ? bestBarreInf.code_art : prev.barreInfArticleCode,
                          barreInfArticleDesignation: bestBarreInf ? bestBarreInf.designation : prev.barreInfArticleDesignation
                        }));
                      }}
                      className={`w-full bg-slate-900 border disabled:opacity-40 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 transition ${
                        !mstqConfig.cadreArticleCode && mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE'
                          ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                          : 'border-slate-700 text-slate-100 focus:ring-amber-500'
                      }`}
                    >
                      <option value="">-- Choisir le Cadre (Obligatoire) * --</option>
                      {articlesCadreMSTQ.map(art => (
                        <option key={art.code_art} value={art.code_art}>
                          {art.designation} ({art.stock_physique} barres)
                        </option>
                      ))}
                    </select>
                    {currentCadreMSTQArticle && mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' && (
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                        currentCadreMSTQArticle.stock_physique <= 0
                          ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                          : currentCadreMSTQArticle.stock_physique <= (currentCadreMSTQArticle.stock_min || 5)
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                          : 'bg-slate-900/60 text-slate-400'
                      }`}>
                        <span>Stock Cadre : {currentCadreMSTQArticle.stock_physique} barres</span>
                        {currentCadreMSTQArticle.stock_physique <= (currentCadreMSTQArticle.stock_min || 5) && (
                          <span className={currentCadreMSTQArticle.stock_physique <= 0 ? 'text-red-400 font-black' : 'text-amber-400'}>
                            {currentCadreMSTQArticle.stock_physique <= 0 ? '⛔ Rupture' : '⚠️ Stock bas'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. BARRE COULISSE MSTQ */}
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex flex-col justify-between space-y-1">
                    <label className="block text-[11px] font-bold text-slate-300">
                      <span>Barre Coulisse MSTQ *</span>
                    </label>
                    <select
                      disabled={mstqConfig.typeFabrication === 'SEMI_FINI_MAILLE' || mstqConfig.typeOuverture === 'FIXE'}
                      value={mstqConfig.coulisseArticleCode}
                      onChange={e => {
                        const code = e.target.value;
                        const found = articlesCoulisseMSTQ.find(a => a.code_art === code);
                        setMstqConfig(prev => ({
                          ...prev,
                          coulisseArticleCode: code,
                          coulisseArticleDesignation: found?.designation || code
                        }));
                      }}
                      className={`w-full bg-slate-900 border disabled:opacity-40 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 transition ${
                        !mstqConfig.coulisseArticleCode && mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' && mstqConfig.typeOuverture !== 'FIXE'
                          ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                          : 'border-slate-700 text-slate-100 focus:ring-amber-500'
                      }`}
                    >
                      <option value="">-- Choisir la Coulisse (Obligatoire) * --</option>
                      {coulissesMSTQOptimisees.recommandees.length > 0 && (
                        <optgroup label="⭐ Coulisses assorties (Recommandées)">
                          {coulissesMSTQOptimisees.recommandees.map(art => (
                            <option key={art.code_art} value={art.code_art}>
                              {art.designation} ({art.stock_physique} barres)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {coulissesMSTQOptimisees.autres.length > 0 && (
                        <optgroup label="Autres teintes de coulisses">
                          {coulissesMSTQOptimisees.autres.map(art => (
                            <option key={art.code_art} value={art.code_art}>
                              {art.designation} ({art.stock_physique} barres)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {currentCoulisseMSTQArticle && mstqConfig.typeFabrication !== 'SEMI_FINI_MAILLE' && mstqConfig.typeOuverture !== 'FIXE' && (
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                        currentCoulisseMSTQArticle.stock_physique <= 0
                          ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                          : currentCoulisseMSTQArticle.stock_physique <= (currentCoulisseMSTQArticle.stock_min || 5)
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                          : 'bg-slate-900/60 text-slate-400'
                      }`}>
                        <span>Stock Coulisse : {currentCoulisseMSTQArticle.stock_physique} barres</span>
                        {currentCoulisseMSTQArticle.stock_physique <= (currentCoulisseMSTQArticle.stock_min || 5) && (
                          <span className={currentCoulisseMSTQArticle.stock_physique <= 0 ? 'text-red-400 font-black' : 'text-amber-400'}>
                            {currentCoulisseMSTQArticle.stock_physique <= 0 ? '⛔ Rupture' : '⚠️ Stock bas'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 4. BARRE INFÉRIEURE MSTQ */}
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex flex-col justify-between space-y-1">
                    <label className="block text-[11px] font-bold text-slate-300">
                      <span>Barre Inférieure MSTQ</span>
                    </label>
                    <select
                      disabled={!mstqConfig.avecBarreInferieure || mstqConfig.typeFabrication === 'SEMI_FINI_MAILLE'}
                      value={mstqConfig.barreInfArticleCode}
                      onChange={e => {
                        const code = e.target.value;
                        const found = articlesBarreInfMSTQ.find(a => a.code_art === code);
                        setMstqConfig(prev => ({
                          ...prev,
                          barreInfArticleCode: code,
                          barreInfArticleDesignation: found?.designation || code
                        }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 disabled:opacity-40 rounded px-2 py-1 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {articlesBarreInfMSTQ.length === 0 ? (
                        <option value="">(Aucune barre inf MSTQ dans la base)</option>
                      ) : articlesBarreInfMSTQ.map(art => (
                        <option key={art.code_art} value={art.code_art}>
                          {art.designation} ({art.stock_physique} barres)
                        </option>
                      ))}
                    </select>
                    {currentBarreInfMSTQArticle && mstqConfig.avecBarreInferieure && (
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center justify-between ${
                        currentBarreInfMSTQArticle.stock_physique <= 0
                          ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                          : currentBarreInfMSTQArticle.stock_physique <= (currentBarreInfMSTQArticle.stock_min || 5)
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                          : 'bg-slate-900/60 text-slate-400'
                      }`}>
                        <span>Stock Barre Inf : {currentBarreInfMSTQArticle.stock_physique} barres</span>
                        {currentBarreInfMSTQArticle.stock_physique <= 0 && <span className="text-red-400 font-black">⛔ Rupture</span>}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* ROW 4 : ⚙️ CONDITIONS & PARAMÈTRES TECHNIQUES DE DÉCOUPE */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 gap-2">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Conditions &amp; Paramètres Techniques de Découpe (Toile Plissée, Cadre, Coulisse, Barre Inférieure)</span>
                </span>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowParametresMailleModal(true)}
                    className="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Ouvrir la boîte de dialogue des règles de découpe de la toile"
                  >
                    <span>🕸️ Règles Toile: +{paramsMaille.ecartMaxPlis}p · Déchet ≤{paramsMaille.dechetMaxJeteMm}mm · Reste ≥{paramsMaille.longueurMinChuteConserveeMm}mm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTechParams(!showTechParams)}
                    className="text-[11px] text-slate-300 hover:text-amber-300 underline font-semibold shrink-0 cursor-pointer"
                  >
                    {showTechParams ? '▲ Masquer réglages' : '⚙️ Modifier réglages'}
                  </button>
                </div>
              </div>

              {/* PANNEAU TECH PARAMS POUR TOILE, CADRE, COULISSE ET BARRE INF */}
              {showTechParams && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>Réglage Direct des Marges de Coupe (Modifiable en direct sur écran) :</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    {/* Toile / Maille Plissée Tech Params Card */}
                    <div className="bg-slate-950/90 p-2.5 rounded-lg border border-amber-500/40 space-y-1.5 bg-gradient-to-br from-amber-500/5 to-transparent">
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span className="text-amber-300 font-mono flex items-center gap-1">
                          <span>🕸️</span>
                          <span>TOILE / MAILLE PLISSÉE</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowParametresMailleModal(true)}
                          className="text-[10px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                          title="Modifier les critères d'attribution de la toile"
                        >
                          Détails ↗
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans truncate" title="Écart max plis en trop">Écart Plis</span>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={paramsMaille.ecartMaxPlis}
                            onChange={e => handleSaveParamsMaille({ ...paramsMaille, ecartMaxPlis: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-amber-300 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans truncate" title="Perte max jetée à la poubelle">Déchet Max</span>
                          <input
                            type="number"
                            step="10"
                            min="0"
                            value={paramsMaille.dechetMaxJeteMm}
                            onChange={e => handleSaveParamsMaille({ ...paramsMaille, dechetMaxJeteMm: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-amber-300 font-bold text-center"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 uppercase font-sans truncate" title="Longueur min pour remettre en stock">Reste Stock</span>
                          <input
                            type="number"
                            step="100"
                            min="100"
                            value={paramsMaille.longueurMinChuteConserveeMm}
                            onChange={e => handleSaveParamsMaille({ ...paramsMaille, longueurMinChuteConserveeMm: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-emerald-300 font-bold text-center"
                          />
                        </div>
                      </div>
                      <div className="text-[9px] text-slate-400 flex items-center justify-between font-sans pt-0.5">
                        <span className="text-amber-400/90 font-medium">✓ Auto-enregistré</span>
                        <span className="text-slate-500 font-mono">mm / plis</span>
                      </div>
                    </div>

                    {/* Cadre Tech Params */}
                    <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span className="text-slate-200 font-mono">
                          {articlesCadreMSTQ.find(a => a.code_art === mstqConfig.cadreArticleCode)?.designation || mstqConfig.cadreArticleDesignation}
                        </span>
                        {mstqCadreTechParams.isDirty && (
                          <button type="button" onClick={() => handleSaveArticleTechParams('MSTQ_CDR')}
                            className="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded shadow transition cursor-pointer">
                            💾 Enregistrer
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Barre</span>
                          <input type="number" value={mstqCadreTechParams.longeur || ''} placeholder="-" onChange={e => setMstqCadreTechParams({ ...mstqCadreTechParams, longeur: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Lame</span>
                          <input type="number" step="0.5" value={mstqCadreTechParams.lame || ''} placeholder="-" onChange={e => setMstqCadreTechParams({ ...mstqCadreTechParams, lame: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Déduction</span>
                          <input type="number" value={mstqCadreTechParams.debordement !== undefined && mstqCadreTechParams.debordement !== 0 ? mstqCadreTechParams.debordement : (mstqCadreTechParams.debordement === 0 && articlesCadreMSTQ.length > 0 ? 0 : '')} placeholder="0" onChange={e => setMstqCadreTechParams({ ...mstqCadreTechParams, debordement: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Min</span>
                          <input type="number" value={mstqCadreTechParams.refus_min || ''} placeholder="-" onChange={e => setMstqCadreTechParams({ ...mstqCadreTechParams, refus_min: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Max</span>
                          <input type="number" value={mstqCadreTechParams.refus_max || ''} placeholder="-" onChange={e => setMstqCadreTechParams({ ...mstqCadreTechParams, refus_max: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                      </div>
                    </div>

                    {/* Coulisse Tech Params */}
                    <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span className="text-slate-200 font-mono">
                          {articlesCoulisseMSTQ.find(a => a.code_art === mstqConfig.coulisseArticleCode)?.designation || mstqConfig.coulisseArticleDesignation}
                        </span>
                        {mstqCoulisseTechParams.isDirty && (
                          <button type="button" onClick={() => handleSaveArticleTechParams('MSTQ_CLS')}
                            className="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded shadow transition cursor-pointer">
                            💾 Enregistrer
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Barre</span>
                          <input type="number" value={mstqCoulisseTechParams.longeur || ''} placeholder="-" onChange={e => setMstqCoulisseTechParams({ ...mstqCoulisseTechParams, longeur: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Lame</span>
                          <input type="number" step="0.5" value={mstqCoulisseTechParams.lame || ''} placeholder="-" onChange={e => setMstqCoulisseTechParams({ ...mstqCoulisseTechParams, lame: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Déduction</span>
                          <input type="number" value={mstqCoulisseTechParams.debordement !== undefined && mstqCoulisseTechParams.debordement !== 0 ? mstqCoulisseTechParams.debordement : (mstqCoulisseTechParams.debordement === 0 && articlesCoulisseMSTQ.length > 0 ? 0 : '')} placeholder="0" onChange={e => setMstqCoulisseTechParams({ ...mstqCoulisseTechParams, debordement: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Min</span>
                          <input type="number" value={mstqCoulisseTechParams.refus_min || ''} placeholder="-" onChange={e => setMstqCoulisseTechParams({ ...mstqCoulisseTechParams, refus_min: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Max</span>
                          <input type="number" value={mstqCoulisseTechParams.refus_max || ''} placeholder="-" onChange={e => setMstqCoulisseTechParams({ ...mstqCoulisseTechParams, refus_max: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                      </div>
                    </div>

                    {/* Barre Inférieure Tech Params */}
                    {mstqConfig.avecBarreInferieure && (
                      <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-[11px]">
                          <span className="text-slate-200 font-mono">
                            {articlesBarreInfMSTQ.find(a => a.code_art === mstqConfig.barreInfArticleCode)?.designation || mstqConfig.barreInfArticleDesignation}
                          </span>
                          {mstqBarreInfTechParams.isDirty && (
                            <button type="button" onClick={() => handleSaveArticleTechParams('MSTQ_BI')}
                              className="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded shadow transition cursor-pointer">
                              💾 Enregistrer
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Barre</span>
                            <input type="number" value={mstqBarreInfTechParams.longeur || ''} placeholder="-" onChange={e => setMstqBarreInfTechParams({ ...mstqBarreInfTechParams, longeur: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Lame</span>
                            <input type="number" step="0.5" value={mstqBarreInfTechParams.lame || ''} placeholder="-" onChange={e => setMstqBarreInfTechParams({ ...mstqBarreInfTechParams, lame: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Déduction</span>
                            <input type="number" value={mstqBarreInfTechParams.debordement !== undefined && mstqBarreInfTechParams.debordement !== 0 ? mstqBarreInfTechParams.debordement : (mstqBarreInfTechParams.debordement === 0 && articlesBarreInfMSTQ.length > 0 ? 0 : '')} placeholder="0" onChange={e => setMstqBarreInfTechParams({ ...mstqBarreInfTechParams, debordement: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Min</span>
                            <input type="number" value={mstqBarreInfTechParams.refus_min || ''} placeholder="-" onChange={e => setMstqBarreInfTechParams({ ...mstqBarreInfTechParams, refus_min: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Max</span>
                            <input type="number" value={mstqBarreInfTechParams.refus_max || ''} placeholder="-" onChange={e => setMstqBarreInfTechParams({ ...mstqBarreInfTechParams, refus_max: Number(e.target.value), isDirty: true })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center" /></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* D. SI PRÉCADRE */}
          {familleArticle === 'PRECADRE' && (
            <div className="space-y-3 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
              {/* ROW 1 : Profilé Précadre + Article Bouchon 90° */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Profilé Précadre (Dormant 43/55) *</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {(() => {
                        const a = articlesPrecadre.find(x => x.code_art === precadreConfig.articleCode);
                        return a ? `Barre ${(a.longeur / 1000).toFixed(1)}m (Ep. barre 10mm)` : '';
                      })()}
                    </span>
                  </label>
                  <select
                    value={precadreConfig.articleCode}
                    onChange={e => {
                      const code = e.target.value;
                      const found = articlesPrecadre.find(a => a.code_art === code);
                      const desig = found?.designation || 'PRÉCADRE PRC 43';
                      const is55 = (code === 'ART0061' || desig.includes('55'));
                      const targetBouchonCode = is55 ? 'ART0066' : 'ART0065';
                      const targetBouchonDesig = is55 ? 'BOUCHON PRECADRE 55 (Bouchon 90° Plastique)' : 'BOUCHON PRECADRE 43 (Bouchon 90° Plastique)';
                      const targetBouchonObj = articlesBouchonPrecadre.find(a => a.code_art === targetBouchonCode);
                      const targetDed = targetBouchonObj?.debordement !== undefined ? targetBouchonObj.debordement : -10;

                      setPrecadreConfig(prev => ({
                        ...prev,
                        articleCode: code,
                        articleDesignation: desig,
                        bouchonArticleCode: targetBouchonCode,
                        bouchonArticleDesignation: targetBouchonDesig
                      }));

                      setBouchonTechParams(prev => ({
                        ...prev,
                        debordement: targetDed,
                        isDirty: false
                      }));
                    }}
                    className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 transition ${
                      !precadreConfig.articleCode
                        ? 'border-amber-500 text-amber-300 ring-2 ring-amber-500/20 bg-amber-950/20'
                        : 'border-slate-700 text-slate-100 focus:ring-amber-500'
                    }`}
                  >
                    <option value="">-- Choisir le Profilé Précadre (Obligatoire) * --</option>
                    {articlesPrecadre.map(a => (
                      <option key={a.code_art} value={a.code_art}>{a.designation}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Bouchons d'Onglet 90° &amp; Déduction</span>
                    <div className="flex items-center gap-2">
                      {bouchonTechParams.isDirty ? (
                        <button
                          type="button"
                          onClick={() => handleSaveArticleTechParams('BCH')}
                          className="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded flex items-center gap-1 transition cursor-pointer shadow-sm"
                          title="Enregistrer cette valeur de déduction définitivement en base stock"
                        >
                          <Save className="w-3 h-3" />
                          <span>💾 Enregistrer</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-mono font-medium flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>✓ Valeur enregistrée</span>
                        </span>
                      )}
                    </div>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-7">
                      <select
                        value={precadreConfig.bouchonArticleCode}
                        onChange={e => {
                          const code = e.target.value;
                          if (code === 'SANS_BOUCHON') {
                            setPrecadreConfig(prev => ({
                              ...prev,
                              bouchonArticleCode: 'SANS_BOUCHON',
                              bouchonArticleDesignation: 'Sans Bouchon (0 mm)'
                            }));
                            setBouchonTechParams(prev => ({
                              ...prev,
                              debordement: 0,
                              isDirty: false
                            }));
                            return;
                          }
                          const found = articlesBouchonPrecadre.find(a => a.code_art === code);
                          const ded = found?.debordement !== undefined ? found.debordement : -10;
                          setPrecadreConfig(prev => ({
                            ...prev,
                            bouchonArticleCode: code,
                            bouchonArticleDesignation: found?.designation || ''
                          }));
                          setBouchonTechParams(prev => ({
                            ...prev,
                            debordement: ded,
                            isDirty: false
                          }));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="SANS_BOUCHON">🚫 Sans Bouchon (Déduction 0 mm)</option>
                        {articlesBouchonPrecadre.map(a => (
                          <option key={a.code_art} value={a.code_art}>{a.designation}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-5">
                      <div className="flex items-center justify-between gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">Déduction :</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={Math.abs(bouchonTechParams.debordement)}
                            onChange={e => {
                              const val = Math.abs(Number(e.target.value)) || 0;
                              setBouchonTechParams({
                                ...bouchonTechParams,
                                debordement: -val,
                                isDirty: true
                              });
                            }}
                            className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center text-xs font-mono font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <span className="text-[10px] text-slate-400 font-mono">mm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {bouchonTechParams.isDirty && (
                    <div className="text-[10px] text-amber-300 font-mono mt-1 flex items-center justify-between bg-amber-950/30 px-2 py-1 rounded border border-amber-500/30">
                      <span>Déduction active : {Math.abs(bouchonTechParams.debordement)} mm/côté</span>
                      <button
                        type="button"
                        onClick={() => handleSaveArticleTechParams('BCH')}
                        className="text-amber-300 hover:text-amber-100 font-bold underline cursor-pointer whitespace-nowrap ml-2"
                      >
                        💾 Sauvegarder
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ROW 2 : Figure de Précadre (1 à 4) */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Figure de Précadre (Renforts Intérieurs)</span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">
                    {precadreConfig.figure === 'VIDE' && '2 Montants + 1 TRH + 1 TRB — Aucun renfort'}
                    {precadreConfig.figure === 'RENFORT_L1' && '+ 1 Renfort Horizontal L1 (traverse centrale)'}
                    {precadreConfig.figure === 'RENFORT_H1' && '+ 1 Renfort Vertical H1 (montant central)'}
                    {precadreConfig.figure === 'RENFORT_CROISE' && '+ 2 Demi-Renforts R1/R2 Horiz. + 1 H1 Vertical (croisé)'}
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreFigure('VIDE')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex flex-col items-center gap-1 cursor-pointer border ${
                      precadreConfig.figure === 'VIDE'
                        ? 'bg-slate-800 text-amber-300 border-amber-500/60 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <svg width="32" height="24" viewBox="0 0 36 28" className="mb-0.5 opacity-85">
                      <rect x="1" y="1" width="34" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" rx="1"/>
                    </svg>
                    <span>Vide</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreFigure('RENFORT_L1')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex flex-col items-center gap-1 cursor-pointer border ${
                      precadreConfig.figure === 'RENFORT_L1'
                        ? 'bg-slate-800 text-amber-300 border-amber-500/60 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <svg width="32" height="24" viewBox="0 0 36 28" className="mb-0.5 opacity-85">
                      <rect x="1" y="1" width="34" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" rx="1"/>
                      <line x1="1" y1="14" x2="35" y2="14" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    <span>+ Renfort L1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreFigure('RENFORT_H1')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex flex-col items-center gap-1 cursor-pointer border ${
                      precadreConfig.figure === 'RENFORT_H1'
                        ? 'bg-slate-800 text-amber-300 border-amber-500/60 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <svg width="32" height="24" viewBox="0 0 36 28" className="mb-0.5 opacity-85">
                      <rect x="1" y="1" width="34" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" rx="1"/>
                      <line x1="18" y1="1" x2="18" y2="27" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    <span>+ Renfort H1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreFigure('RENFORT_CROISE')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex flex-col items-center gap-1 cursor-pointer border ${
                      precadreConfig.figure === 'RENFORT_CROISE'
                        ? 'bg-slate-800 text-amber-300 border-amber-500/60 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <svg width="32" height="24" viewBox="0 0 36 28" className="mb-0.5 opacity-85">
                      <rect x="1" y="1" width="34" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" rx="1"/>
                      <line x1="18" y1="1" x2="18" y2="27" stroke="currentColor" strokeWidth="2"/>
                      <line x1="1" y1="14" x2="35" y2="14" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    <span>Croisé R1/R2 + H1</span>
                  </button>
                </div>
              </div>

              {/* ROW 3 : Mode de Débordement des Montants (A à D) */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Mode de Débordement des Montants</span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">
                    {precadreConfig.modeDebordement === 'SUPERIEUR_INFERIEUR' && 'Haut (+100mm) & Bas (+300mm)'}
                    {precadreConfig.modeDebordement === 'SUPERIEUR_SEUL' && 'Haut (+100mm) uniquement'}
                    {precadreConfig.modeDebordement === 'INFERIEUR_SEUL' && 'Bas (+300mm) uniquement'}
                    {precadreConfig.modeDebordement === 'SANS_DEBORDEMENT' && 'Cadre Fermé (0mm / 0mm)'}
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreModeDebordement('SUPERIEUR_INFERIEUR')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      precadreConfig.modeDebordement === 'SUPERIEUR_INFERIEUR'
                        ? 'bg-slate-800 text-slate-100 border-slate-600 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>⬆️⬇️ A. Haut &amp; Bas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreModeDebordement('SUPERIEUR_SEUL')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      precadreConfig.modeDebordement === 'SUPERIEUR_SEUL'
                        ? 'bg-slate-800 text-slate-100 border-slate-600 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>⬆️ B. Haut (+100)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreModeDebordement('INFERIEUR_SEUL')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      precadreConfig.modeDebordement === 'INFERIEUR_SEUL'
                        ? 'bg-slate-800 text-slate-100 border-slate-600 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>⬇️ C. Bas (+300)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrecadreModeDebordement('SANS_DEBORDEMENT')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      precadreConfig.modeDebordement === 'SANS_DEBORDEMENT'
                        ? 'bg-slate-800 text-slate-100 border-slate-600 font-bold shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>⏹️ D. Cadre Fermé</span>
                  </button>
                </div>
              </div>

              {/* ⚙️ CONDITIONS & PARAMÈTRES TECHNIQUES DE DÉCOUPE */}
              <div className="flex items-center justify-between text-[11px] bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Conditions &amp; Paramètres Techniques de Découpe</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowTechParams(!showTechParams)}
                  className="text-[11px] text-slate-300 hover:text-amber-300 underline font-semibold ml-2 shrink-0 cursor-pointer"
                >
                  {showTechParams ? '▲ Masquer réglages' : '⚙️ Modifier réglages découpe (Barre, Lame, Marge)'}
                </button>
              </div>

              {/* ⚙️ PANNEAU INTERACTIF DES PARAMÈTRES TECHNIQUES DE DÉCOUPE (PRÉCADRE) */}
              {showTechParams && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>Réglage Direct des Conditions de Découpe (Modifiable en direct sur écran) :</span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-[11px]">
                      <span className="text-slate-200 font-mono">
                        {articlesPrecadre.find(a => a.code_art === precadreConfig.articleCode)?.designation || currentPRCArticle?.designation || 'Précadre'}
                      </span>
                      {prcTechParams.isDirty && (
                        <button
                          type="button"
                          onClick={() => handleSaveArticleTechParams('PRC')}
                          className="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded shadow transition cursor-pointer"
                        >
                          💾 Enregistrer pour l'article
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                      <div>
                        <span className="block text-[9px] text-slate-400 uppercase font-sans">Barre (mm)</span>
                        <input
                          type="number"
                          value={prcTechParams.longeur}
                          onChange={e => setPrcTechParams({ ...prcTechParams, longeur: Number(e.target.value), isDirty: true })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                        />
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 uppercase font-sans">Lame (mm)</span>
                        <input
                          type="number"
                          step="0.5"
                          value={prcTechParams.lame}
                          onChange={e => setPrcTechParams({ ...prcTechParams, lame: Number(e.target.value), isDirty: true })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                        />
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 uppercase font-sans">Débordement (mm)</span>
                        <input
                          type="number"
                          value={prcTechParams.debordement}
                          onChange={e => setPrcTechParams({ ...prcTechParams, debordement: Number(e.target.value), isDirty: true })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                        />
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Min</span>
                        <input
                          type="number"
                          value={prcTechParams.refus_min}
                          onChange={e => setPrcTechParams({ ...prcTechParams, refus_min: Number(e.target.value), isDirty: true })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                        />
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 uppercase font-sans">Refus Max</span>
                        <input
                          type="number"
                          value={prcTechParams.refus_max}
                          onChange={e => setPrcTechParams({ ...prcTechParams, refus_max: Number(e.target.value), isDirty: true })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-100 font-bold text-center"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. SAISIE RAPIDE DES LIGNES DE LA COMMANDE EN COURS                      */}
        {/* ========================================================================= */}
        <form onSubmit={handleAjouterLigne} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Saisie des Lignes ({
                  familleArticle === 'CAISSON' ? 'Caisson & SF' :
                  familleArticle === 'TABLIER' ? 'Volet / Tablier' :
                  familleArticle === 'PRECADRE' ? 'Précadre' : 'Moustiquaire'
                })</span>
              </span>
              {getActiveNumCommande() && extraireNumeroSansPrefixe(getActiveNumCommande(), clientCodifications) ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>N° Commande : {getActiveNumCommande()}</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse">
                  <span>⚠️ N° Commande Non Saisi pour cette famille</span>
                </span>
              )}
            </div>

            {/* SELECTION DES CONDITIONS ACTIVES (EN HAUT À DROITE DU FORMULAIRE) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {familleArticle === 'TABLIER' && (
                <>
                  <span className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5" title="Profil Lame Tablier">
                    <span>📦 {currentTBLArticle?.designation || 'Lame Tablier'}</span>
                    {currentTBLArticle?.longeur ? <span className="text-[10px] text-slate-400 font-mono">({currentTBLArticle.longeur}mm)</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTablierConfig(prev => ({ ...prev, avecLameFinale: !prev.avecLameFinale }))}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                      tablierConfig.avecLameFinale
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="Cliquer pour basculer Avec / Sans Lame Finale"
                  >
                    {tablierConfig.avecLameFinale ? '✓ Avec LF' : '✕ Sans LF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTablierConfig(prev => ({ ...prev, typeFabrication: prev.typeFabrication === 'TABLIER_SEUL' ? 'VOLET_COMPLET' : 'TABLIER_SEUL' }))}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                      tablierConfig.typeFabrication === 'VOLET_COMPLET'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="Cliquer pour basculer Tablier Seul / Volet Complet"
                  >
                    {tablierConfig.typeFabrication === 'VOLET_COMPLET' ? 'Volet Complet' : 'Tablier Seul'}
                  </button>
                </>
              )}

              {familleArticle === 'CAISSON' && (
                <>
                  <span className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5" title="Profil Caisson Tunnel">
                    <span>📦 {currentCTArticle?.designation || 'Caisson Tunnel'}</span>
                    {currentCTArticle?.longeur ? <span className="text-[10px] text-slate-400 font-mono">({currentCTArticle.longeur}mm)</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCaissonConfig(prev => ({ ...prev, avecSousFace: !prev.avecSousFace }))}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                      caissonConfig.avecSousFace
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="Cliquer pour basculer Avec / Sans Sous-face"
                  >
                    {caissonConfig.avecSousFace ? '✓ Avec SF' : '✕ Sans SF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaissonConfig(prev => ({ ...prev, avecPeinture: !prev.avecPeinture }))}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                      caissonConfig.avecPeinture
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="Cliquer pour basculer Avec / Sans Peinture"
                  >
                    {caissonConfig.avecPeinture ? '🎨 Avec Peinture' : 'Sans Peinture'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaissonConfig(prev => ({ ...prev, avecPlaque: !prev.avecPlaque }))}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                      caissonConfig.avecPlaque
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="Cliquer pour basculer Avec / Sans Plaque"
                  >
                    {caissonConfig.avecPlaque ? '🛡️ Avec Plaque' : 'Sans Plaque'}
                  </button>
                </>
              )}

              {familleArticle === 'MOUSTIQUAIRE' && (
                <>
                  <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                    🦟 {mstqConfig.modele}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMstqConfig(prev => ({ ...prev, typeFabrication: prev.typeFabrication === 'SEMI_FINI_MAILLE' ? 'COMPLET' : 'SEMI_FINI_MAILLE' }))}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer ${
                      mstqConfig.typeFabrication === 'SEMI_FINI_MAILLE'
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 hover:bg-teal-500/30'
                        : 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
                    }`}
                    title="Cliquer pour basculer Semi-Fini / Complet"
                  >
                    {mstqConfig.typeFabrication === 'SEMI_FINI_MAILLE' ? 'Semi-Fini (Maille)' : 'Complet'}
                  </button>
                </>
              )}

              {familleArticle === 'PRECADRE' && (
                <>
                  <span className="text-[11px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-lg">
                    🪟 {precadreConfig.figure}
                  </span>
                  <span className="text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                    {currentPRCArticle?.designation || precadreConfig.articleCode || 'PRC'}
                  </span>
                </>
              )}
            </div>
          </div>

          {familleArticle === 'CAISSON' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
              {/* Repère (Tout à gauche) */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-amber-300 mb-1 flex items-center justify-between">
                  <span>Repère / N° Porte</span>
                  <span className="text-[10px] text-slate-500 font-normal">Optionnel</span>
                </label>
                <input
                  ref={inputRepereRef}
                  type="text"
                  value={inputRepere}
                  onChange={e => setInputRepere(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      inputLRef.current?.focus();
                      inputLRef.current?.select();
                    }
                  }}
                  placeholder={`Auto: ${genererRepereCaissonSousFace({
                    donneurOrdreNom: monClient,
                    nomClientFinal: clientDeMonClient,
                    indexLigne: lignesCaissons.length + 1,
                    lignesActuelles: lignesCaissons,
                    dossiersHistorique: dossiers,
                    codifications: clientCodifications,
                    isSousFaceSeule: caissonConfig.typeCommande === 'SOUS_FACE_SEULE'
                  })}`}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Longueur (Mesure) */}
              <div className="md:col-span-4">
                <label className="block text-[11px] font-bold text-amber-300 mb-1">
                  {caissonConfig.typeCommande === 'SOUS_FACE_SEULE' ? 'Longueur Sous-Face (mm) *' : 'Longueur Caisson (mm) *'}
                </label>
                <input
                  ref={inputLRef}
                  type="number"
                  value={inputL}
                  onChange={e => setInputL(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      inputQteRef.current?.focus();
                      inputQteRef.current?.select();
                    }
                  }}
                  placeholder={caissonConfig.typeCommande === 'SOUS_FACE_SEULE' ? "Longueur SF (ex: 2400)" : "Longueur Caisson (ex: 2400)"}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Quantité */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-amber-300 mb-1">
                  Quantité *
                </label>
                <input
                  ref={inputQteRef}
                  type="number"
                  min="1"
                  value={inputQte}
                  placeholder="1"
                  onChange={e => setInputQte(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (canAjouterLigne) {
                        handleAjouterLigne(e);
                      } else {
                        btnAjouterLigneRef.current?.focus();
                      }
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-center"
                />
              </div>

              {/* Bouton Ajouter */}
              <div className="md:col-span-3">
                <button
                  ref={btnAjouterLigneRef}
                  type="submit"
                  disabled={!canAjouterLigne}
                  title={!canAjouterLigne ? `Champs obligatoires manquants : ${champsManquants.join(', ')}` : undefined}
                  className={`w-full py-2 font-black rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer ${
                    canAjouterLigne
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20 active:scale-95'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {caissonConfig.typeCommande === 'SOUS_FACE_SEULE' ? 'Ajouter Sous-Face' : 'Ajouter Caisson'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
              {/* Repère (Tout à gauche) */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-amber-300 mb-1 flex items-center justify-between">
                  <span>Repère / N° Porte</span>
                  <span className="text-[10px] text-slate-500 font-normal">Optionnel</span>
                </label>
                <input
                  ref={inputRepereRef}
                  type="text"
                  value={inputRepere}
                  onChange={e => setInputRepere(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      inputLRef.current?.focus();
                      inputLRef.current?.select();
                    }
                  }}
                  placeholder={familleArticle === 'TABLIER' ? 'ex: SA-1, Chambre...' : familleArticle === 'MOUSTIQUAIRE' ? 'ex: H1, Cuisine...' : 'ex: 1R1, Salon...'}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Largeur L (Mesure 1) */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-amber-300 mb-1">
                  Largeur L (mm) *
                </label>
                <input
                  ref={inputLRef}
                  type="number"
                  value={inputL}
                  onChange={e => setInputL(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      inputHRef.current?.focus();
                      inputHRef.current?.select();
                    }
                  }}
                  placeholder="Largeur (mm)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Hauteur H (Mesure 2) */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-amber-300 mb-1">
                  Hauteur H (mm) *
                </label>
                <input
                  ref={inputHRef}
                  type="number"
                  value={inputH}
                  onChange={e => setInputH(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      inputQteRef.current?.focus();
                      inputQteRef.current?.select();
                    }
                  }}
                  placeholder="Hauteur (mm)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Quantité */}
              <div className="md:col-span-1">
                <label className="block text-[11px] font-bold text-amber-300 mb-1 text-center">
                  Qté *
                </label>
                <input
                  ref={inputQteRef}
                  type="number"
                  min="1"
                  value={inputQte}
                  placeholder="1"
                  onChange={e => setInputQte(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (canAjouterLigne) {
                        handleAjouterLigne(e);
                      } else {
                        btnAjouterLigneRef.current?.focus();
                      }
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-center"
                />
              </div>

              {/* Bouton Ajouter */}
              <div className="md:col-span-2">
                <button
                  ref={btnAjouterLigneRef}
                  type="submit"
                  disabled={!canAjouterLigne}
                  title={!canAjouterLigne ? `Champs obligatoires manquants : ${champsManquants.join(', ')}` : undefined}
                  className={`w-full py-2 font-black rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer ${
                    canAjouterLigne
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20 active:scale-95'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Ajouter</span>
                </button>
              </div>
            </div>
          )}

          {/* Bandeau d'aide si champs obligatoires manquants */}
          {!canAjouterLigne && (
            <div className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3.5 py-2 rounded-xl flex items-center gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Champs obligatoires à renseigner pour valider :</strong> {champsManquants.join(' • ')}
              </span>
            </div>
          )}
        </form>

        {/* ========================================================================= */}
        {/* 4. TABLEAU DES LIGNES DE LA COMMANDE EN COURS                             */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          {/* TABLEAU CAISSONS */}
          {familleArticle === 'CAISSON' && (
            <div className="space-y-3">
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900/90 text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Repère</th>
                      <th className="py-2.5 px-3">Longueur (mm)</th>
                      <th className="py-2.5 px-3">Quantité</th>
                      <th className="py-2.5 px-3">N° Commande (CT & SF)</th>
                      <th className="py-2.5 px-3">Caisson Tunnel (CT)</th>
                      <th className="py-2.5 px-3">Sous-Face Découpée (SF)</th>
                      <th className="py-2.5 px-3">Montage & Finition</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(() => {
                      const activeRef = (getActiveNumCommande() || '').trim();
                      const caissonsFiltres = activeRef
                        ? lignesCaissons.filter(c => (c.refCommande || '').trim() === activeRef || (c.avecSousFace && (c.sfRefCommande || '').trim() === activeRef))
                        : lignesCaissons;

                      if (caissonsFiltres.length === 0) {
                        return (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-500 font-sans italic text-xs">
                              Aucun caisson dans cette commande N° {activeRef || 'en cours'}. Saisissez une longueur ci-dessus puis validez.
                            </td>
                          </tr>
                        );
                      }

                      return caissonsFiltres.map((c, idx) => {
                        const isEditing = editingCaissonId === c.id && editCaissonForm !== null;

                        if (isEditing && editCaissonForm) {
                          return (
                            <tr key={c.id || idx} className="bg-amber-950/30 border-2 border-amber-500/50">
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={editCaissonForm.repere}
                                  onChange={e => setEditCaissonForm({ ...editCaissonForm, repere: e.target.value })}
                                  className="w-full bg-slate-950 border border-amber-500 rounded px-1.5 py-1 text-xs text-amber-300 font-bold"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  value={editCaissonForm.longueur}
                                  onChange={e => setEditCaissonForm({ ...editCaissonForm, longueur: Number(e.target.value) })}
                                  className="w-full bg-slate-950 border border-amber-500 rounded px-1.5 py-1 text-xs text-slate-100 font-black"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={editCaissonForm.quantite}
                                  onChange={e => setEditCaissonForm({ ...editCaissonForm, quantite: Math.max(1, Number(e.target.value)) })}
                                  className="w-16 bg-slate-950 border border-amber-500 rounded px-1 py-1 text-xs text-amber-300 font-bold text-center"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 font-mono">Cmd:</span>
                                    <input
                                      type="text"
                                      value={editCaissonForm.refCommande || ''}
                                      onChange={e => setEditCaissonForm({ ...editCaissonForm, refCommande: e.target.value, sfRefCommande: e.target.value })}
                                      placeholder="N° Commande"
                                      className="w-24 bg-slate-950 border border-amber-500 rounded px-1 py-0.5 text-[11px] text-emerald-300 font-bold font-mono"
                                      title="N° Commande Caisson / Sous-Face"
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <select
                                  value={editCaissonForm.articleCode || ''}
                                  onChange={e => {
                                    const found = articlesCT.find(a => a.code_art === e.target.value);
                                    if (found) {
                                      setEditCaissonForm({ ...editCaissonForm, articleCode: found.code_art, articleDesignation: found.designation });
                                    }
                                  }}
                                  className="w-full bg-slate-950 border border-amber-500 rounded px-1.5 py-1 text-[11px] text-emerald-300 font-bold"
                                >
                                  {articlesCT.length === 0 ? (
                                    <option value="">(Aucun caisson)</option>
                                  ) : articlesCT.map(art => (
                                    <option key={art.code_art} value={art.code_art}>{art.designation}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-2">
                                <select
                                  disabled={!editCaissonForm.avecSousFace}
                                  value={editCaissonForm.sfArticleCode || ''}
                                  onChange={e => {
                                    const found = articlesSF.find(a => a.code_art === e.target.value);
                                    if (found) {
                                      setEditCaissonForm({ ...editCaissonForm, sfArticleCode: found.code_art, sfArticleDesignation: found.designation });
                                    }
                                  }}
                                  className="w-full bg-slate-950 border border-amber-500 disabled:opacity-40 rounded px-1.5 py-1 text-[11px] text-sky-300 font-bold"
                                >
                                  {articlesSF.length === 0 ? (
                                    <option value="">(Aucune sous-face)</option>
                                  ) : articlesSF.map(sf => (
                                    <option key={sf.code_art} value={sf.code_art}>{sf.designation}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-2 font-sans">
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditCaissonForm({ ...editCaissonForm, avecSousFace: !editCaissonForm.avecSousFace })}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border transition ${
                                      editCaissonForm.avecSousFace ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-400 border-slate-700'
                                    }`}
                                  >
                                    {editCaissonForm.avecSousFace ? '✓ SF' : '✕ Sans SF'}
                                  </button>
                                  {editCaissonForm.avecSousFace && (
                                    <button
                                      type="button"
                                      onClick={() => setEditCaissonForm({ ...editCaissonForm, montageSousFace: editCaissonForm.montageSousFace === 'MONTEE_ATELIER' ? 'NON_MONTEE' : 'MONTEE_ATELIER' })}
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold border transition ${
                                        editCaissonForm.montageSousFace === 'MONTEE_ATELIER' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      }`}
                                    >
                                      {editCaissonForm.montageSousFace === 'MONTEE_ATELIER' ? 'Avec Montage' : 'Sans Montage'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditCaissonForm({ ...editCaissonForm, avecPeinture: !editCaissonForm.avecPeinture })}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border transition ${
                                      editCaissonForm.avecPeinture ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-slate-900 text-slate-400 border-slate-700'
                                    }`}
                                  >
                                    {editCaissonForm.avecPeinture ? 'Avec Peinture' : 'Sans Peinture'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditCaissonForm({ ...editCaissonForm, avecPlaque: !editCaissonForm.avecPlaque })}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border transition ${
                                      editCaissonForm.avecPlaque ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-400 border-slate-700'
                                    }`}
                                  >
                                    {editCaissonForm.avecPlaque ? '🛡️ Avec Plaque' : 'Sans Plaque'}
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-sans">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={handleSaveEditCaisson}
                                    className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition cursor-pointer"
                                    title="Enregistrer les modifications"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditCaisson}
                                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition cursor-pointer"
                                    title="Annuler"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        const ctFoundObj = articlesCT.find(a => a.code_art === c.articleCode) || articles.find(a => a.code_art === c.articleCode);
                        const sfFoundObj = articlesSF.find(a => a.code_art === c.sfArticleCode) || articles.find(a => a.code_art === c.sfArticleCode);
                        const ctName = c.articleDesignation || ctFoundObj?.designation || (c.articleCode === 'ART0010' ? 'CT SOMO 25 ARRONDI' : 'CT SOMO 30 ARRONDI');
                        const sfName = c.sfArticleDesignation || sfFoundObj?.designation || (c.sfArticleCode === 'ART0020' ? 'SF 200 (SOUS-FACE 200MM)' : 'SF 300');
                        const ctCmd = (c.refCommande || numCommandeCaisson || 'CMD').trim();
                        const sfCmd = (c.sfRefCommande || numCommandeSousFace || ctCmd).trim();

                        return (
                          <tr key={c.id || idx} className="hover:bg-slate-900/50 transition">
                            <td className="py-2.5 px-3 text-amber-300 font-bold">{c.repere}</td>
                            <td className="py-2.5 px-3 text-slate-100 font-black text-sm">{c.longueur} mm</td>
                            <td className="py-2.5 px-3 text-slate-200">{c.quantite}</td>
                            <td className="py-2.5 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                                N° {ctCmd}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
                                {ctName}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              {c.avecSousFace ? (
                                <div className="space-y-1">
                                  <span className="px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-500/40 text-[11px] font-semibold flex items-center gap-1 w-fit">
                                    <span>✂️</span>
                                    <span>{sfName}</span>
                                  </span>
                                  <div className="text-[10px] text-amber-300 font-mono font-bold flex items-center gap-1">
                                    <span className="text-slate-400">Repère SF :</span>
                                    <span className="bg-amber-950/90 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/40">{c.repere}</span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px] italic">Sans Sous-Face</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleLigneOption('CAISSON', c.id, 'avecSousFace')}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                    c.avecSousFace
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {c.avecSousFace ? '✓ SF Active' : '✕ Sans SF'}
                                </button>
                                {c.avecSousFace && (
                                  <button
                                    type="button"
                                    onClick={() => toggleLigneOption('CAISSON', c.id, 'montage')}
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                      c.montageSousFace === 'MONTEE_ATELIER'
                                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    }`}
                                  >
                                    {c.montageSousFace === 'MONTEE_ATELIER' ? 'Avec Montage' : 'Sans Montage'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => toggleLigneOption('CAISSON', c.id, 'peinture')}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                    c.avecPeinture
                                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {c.avecPeinture ? '✓ Avec Peinture' : 'Sans Peinture'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleLigneOption('CAISSON', c.id, 'plaque')}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                    c.avecPlaque
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                  title="Bascule Avec / Sans Plaque"
                                >
                                  {c.avecPlaque ? '🛡️ Avec Plaque' : 'Sans Plaque'}
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditCaisson(c)}
                                  className="p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded transition cursor-pointer"
                                  title="Éditer la ligne"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleSupprimerLigne('CAISSON', c.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* BARRE D'ACTIONS : OPTIMISATION DÉBIT & CONFIRMATION COMMANDE DIRECTE */}
              {lignesCaissons.length > 0 && (
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <div className="text-xs font-black text-slate-100 flex items-center gap-2">
                      <span>Découpe Caissons &amp; Sous-Faces :</span>
                      <span className="text-[10px] text-amber-300 font-mono bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                        {lignesCaissons.length} caisson(s) CT • {lignesCaissons.filter(c => c.avecSousFace).length} sous-face(s) SF
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOptimiserCaissonsEtSousFaces()}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-2 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
                      title="Lancer l'optimisation de découpe directement pour cette commande"
                    >
                      <Scissors className="w-4 h-4" />
                      <span>⚡ Optimisation &amp; OF (CT &amp; SF)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEnregistrerDossier('EN_ATTENTE')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>💾 Enregistrer</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TABLEAU TABLIERS */}
          {familleArticle === 'TABLIER' && (
            <div className="space-y-3">
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900/90 text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Repère</th>
                      <th className="py-2.5 px-3">Dimensions (L × H)</th>
                      <th className="py-2.5 px-3">Quantité</th>
                      <th className="py-2.5 px-3">Nb Lames &amp; Articles</th>
                      <th className="py-2.5 px-3">Options Héritées (Modifiables au clic)</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(() => {
                      const activeRef = (getActiveNumCommande() || '').trim();
                      const tabliersFiltres = activeRef
                        ? lignesTabliers.filter(t => (t.refCommande || '').trim() === activeRef)
                        : lignesTabliers;

                      if (tabliersFiltres.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-500 font-sans italic text-xs">
                              Aucun tablier/volet dans cette commande N° {activeRef || 'en cours'}. Saisissez L × H ci-dessus puis validez.
                            </td>
                          </tr>
                        );
                      }

                      return tabliersFiltres.map((t, idx) => {
                        const isEditingT = editingTablierId === t.id && editTablierForm !== null;

                        if (isEditingT && editTablierForm) {
                          return (
                            <tr key={t.id || idx} className="bg-sky-950/30 border-2 border-sky-500/50">
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={editTablierForm.repere}
                                  onChange={e => setEditTablierForm({ ...editTablierForm, repere: e.target.value })}
                                  className="w-full bg-slate-950 border border-sky-500 rounded px-1.5 py-1 text-xs text-amber-300 font-bold"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={editTablierForm.largeur}
                                    onChange={e => setEditTablierForm({ ...editTablierForm, largeur: Number(e.target.value) })}
                                    className="w-20 bg-slate-950 border border-sky-500 rounded px-1 py-1 text-xs text-slate-100 font-black"
                                    placeholder="L"
                                  />
                                  <span className="text-slate-500 text-xs">×</span>
                                  <input
                                    type="number"
                                    value={editTablierForm.hauteur}
                                    onChange={e => setEditTablierForm({ ...editTablierForm, hauteur: Number(e.target.value) })}
                                    className="w-20 bg-slate-950 border border-sky-500 rounded px-1 py-1 text-xs text-slate-100 font-black"
                                    placeholder="H"
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={editTablierForm.quantite}
                                  onChange={e => setEditTablierForm({ ...editTablierForm, quantite: Math.max(1, Number(e.target.value)) })}
                                  className="w-14 bg-slate-950 border border-sky-500 rounded px-1 py-1 text-xs text-amber-300 font-bold text-center"
                                />
                              </td>
                              <td className="py-2 px-2 font-sans text-[10px]">
                                <div className="space-y-1">
                                  <div>
                                    <span className="text-slate-400">Profilé Tablier :</span>
                                    <select
                                      value={editTablierForm.articleCode || ''}
                                      onChange={e => {
                                        const a = articlesTablier.find(x => x.code_art === e.target.value);
                                        setEditTablierForm({ ...editTablierForm, articleCode: e.target.value, articleDesignation: a?.designation || '' });
                                      }}
                                      className="ml-1 bg-slate-900 border border-sky-500/50 rounded px-1 py-0.5 text-[10px] text-sky-200"
                                    >
                                      {articlesTablier.map(a => <option key={a.code_art} value={a.code_art}>{a.designation}</option>)}
                                    </select>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setEditTablierForm({ ...editTablierForm, avecLameFinale: !editTablierForm.avecLameFinale })}
                                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border transition ${editTablierForm.avecLameFinale ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                                    >
                                      {editTablierForm.avecLameFinale ? '✓ Avec LF' : '✕ Sans LF'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditTablierForm({ ...editTablierForm, typeFabrication: editTablierForm.typeFabrication === 'VOLET_COMPLET' ? 'TABLIER_SEUL' : 'VOLET_COMPLET' })}
                                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border transition ${editTablierForm.typeFabrication === 'VOLET_COMPLET' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                                    >
                                      {editTablierForm.typeFabrication === 'VOLET_COMPLET' ? 'Volet (+Coulisses)' : 'Tablier Seul'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 px-2 font-sans text-[10px] text-slate-400 italic">Édition en cours…</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={handleSaveEditTablier}
                                    className="p-1 bg-sky-600 hover:bg-sky-500 text-white rounded transition cursor-pointer"
                                    title="Valider"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditTablier}
                                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition cursor-pointer"
                                    title="Annuler"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        const tblArtName = t.articleDesignation || 'TBL 43 BL';
                        const lfArtName = t.avecLameFinale ? (t.lfArticleDesignation || 'LAME FINALE 43') : null;
                        const glArtName = t.typeFabrication === 'VOLET_COMPLET' ? (t.glArticleDesignation || 'COULISSE 43') : null;

                        return (
                          <tr key={t.id || idx} className="hover:bg-slate-900/50 transition">
                            <td className="py-2 px-3 text-amber-300 font-bold">{t.repere}</td>
                            <td className="py-2 px-3 text-slate-100 font-bold">{t.largeur} × {t.hauteur} mm</td>
                            <td className="py-2 px-3 text-slate-200">{t.quantite}</td>
                            <td className="py-2 px-3 text-sky-300 font-sans text-[11px]">
                              <div className="space-y-0.5">
                                {(() => {
                                  const tblObj2 = articlesTablier.find(a => a.code_art === t.articleCode) || articlesTablier[0];
                                  const hLame2 = getHauteurLameTablier(t.articleCode, t.articleDesignation || tblObj2?.designation, t.hauteur_lame_tablier);
                                  const isAvecVolet = t.typeFabrication === 'VOLET_COMPLET' || t.avecCoulisses;
                                  const nbLameCalc = t.nb_lame || (Math.ceil(t.hauteur / hLame2) + (isAvecVolet ? 2 : 0));
                                  const dedTablier = isAvecVolet ? (hLame2 === 55 ? -28 : -65) : 0;
                                  const lenLameCalc = t.largeur + dedTablier;
                                  const lenLFCalc = t.largeur + dedTablier;
                                  const lenGLCalc = t.hauteur;

                                  return (
                                    <>
                                      <div>
                                        <strong className="text-amber-300 font-mono">{nbLameCalc}</strong> lames × <strong className="text-amber-200 font-mono">L={lenLameCalc} mm</strong>
                                        {isAvecVolet && <span className="text-[10px] text-amber-400/90 font-mono ml-1">({dedTablier}mm)</span>}
                                        <span className="text-slate-400 text-[10px] ml-1">({tblArtName})</span>
                                      </div>
                                      {lfArtName && (
                                        <div className="text-emerald-300 text-[10px]">
                                          🏁 1 LF : <strong className="font-mono text-emerald-200">L={lenLFCalc} mm</strong>
                                          {isAvecVolet && <span className="font-mono text-emerald-400/90 ml-1">({dedTablier}mm)</span>}
                                          <span className="text-slate-400 ml-1">({lfArtName})</span>
                                        </div>
                                      )}
                                      {glArtName && (
                                        <div className="text-sky-300 text-[10px]">
                                          📐 2 Coulisses : <strong className="font-mono text-sky-200">H={lenGLCalc} mm</strong> (H saisie)
                                          <span className="text-slate-400 ml-1">({glArtName})</span>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleLigneOption('TABLIER', t.id, 'typeFab')}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                    t.typeFabrication === 'VOLET_COMPLET'
                                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {t.typeFabrication === 'VOLET_COMPLET' ? 'Volet Complet (+2 Coulisses)' : 'Tablier Seul'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleLigneOption('TABLIER', t.id, 'lameFinale')}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                    t.avecLameFinale
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {t.avecLameFinale ? '✓ Avec Lame Finale' : '✕ Sans Lame Finale'}
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditTablier(t)}
                                  className="p-1 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition cursor-pointer"
                                  title="Modifier cette ligne"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleSupprimerLigne('TABLIER', t.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}

                  </tbody>
                </table>
              </div>

              {/* BARRE D'ACTIONS : OPTIMISATION DÉBIT TABLIERS & VOLETS */}
              {lignesTabliers.length > 0 && (
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-sky-500/40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
                    <div className="text-xs font-black text-slate-100 flex items-center gap-2">
                      <span>Découpe Volets &amp; Tabliers :</span>
                      <span className="text-[10px] text-sky-300 font-mono bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30">
                        {lignesTabliers.length} tablier(s) • {lignesTabliers.filter(t => t.avecLameFinale).length} lame(s) finale(s) • {lignesTabliers.filter(t => t.typeFabrication === 'VOLET_COMPLET').length * 2} coulisse(s)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOptimiserTabliersEtVolets()}
                      className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-2 shadow-md shadow-sky-500/20 transition active:scale-95 cursor-pointer"
                      title="Lancer l'optimisation de découpe directement pour cette commande"
                    >
                      <Scissors className="w-4 h-4" />
                      <span>⚡ Optimisation &amp; OF (Tabliers &amp; Volets)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEnregistrerDossier('EN_ATTENTE')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>💾 Enregistrer</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TABLEAU MOUSTIQUAIRES */}
          {familleArticle === 'MOUSTIQUAIRE' && (
            <div className="space-y-3">
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900/90 text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Repère</th>
                      <th className="py-2.5 px-3">Dimensions (L × H)</th>
                      <th className="py-2.5 px-3">Qté</th>
                      <th className="py-2.5 px-3">Type Ouverture</th>
                      <th className="py-2.5 px-3">Détail Débit (Maille &amp; Profilés)</th>
                      <th className="py-2.5 px-3">Options (clic pour modifier)</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(() => {
                      const activeRef = (getActiveNumCommande() || '').trim();
                      const mstqFiltres = activeRef
                        ? lignesMoustiquaires.filter(m => (m.refCommande || '').trim() === activeRef)
                        : lignesMoustiquaires;

                      if (mstqFiltres.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-500 font-sans italic text-xs">
                              Aucune moustiquaire dans cette commande N° {activeRef || 'en cours'}. Saisissez L × H ci-dessus puis validez.
                            </td>
                          </tr>
                        );
                      }

                      return mstqFiltres.map((m, idx) => {
                        const isEditing = editingMstqId === m.id && editMstqForm;

                        if (isEditing && editMstqForm) {
                          return (
                            <tr key={m.id || idx} className="bg-sky-950/30 border-2 border-sky-500/60">
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={editMstqForm.repere}
                                  onChange={e => setEditMstqForm({ ...editMstqForm, repere: e.target.value })}
                                  className="w-16 bg-slate-950 border border-sky-500 rounded px-1.5 py-1 text-xs text-amber-300 font-black"
                                  placeholder="Repère"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={editMstqForm.largeur}
                                    onChange={e => setEditMstqForm({ ...editMstqForm, largeur: Number(e.target.value) })}
                                    className="w-20 bg-slate-950 border border-sky-500 rounded px-1 py-1 text-xs text-slate-100 font-black"
                                    placeholder="L"
                                  />
                                  <span className="text-slate-500 font-bold">×</span>
                                  <input
                                    type="number"
                                    value={editMstqForm.hauteur}
                                    onChange={e => setEditMstqForm({ ...editMstqForm, hauteur: Number(e.target.value) })}
                                    className="w-20 bg-slate-950 border border-sky-500 rounded px-1 py-1 text-xs text-slate-100 font-black"
                                    placeholder="H"
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={editMstqForm.quantite}
                                  onChange={e => setEditMstqForm({ ...editMstqForm, quantite: Math.max(1, Number(e.target.value)) })}
                                  className="w-14 bg-slate-950 border border-sky-500 rounded px-1 py-1 text-xs text-amber-300 font-bold text-center"
                                />
                              </td>
                              <td className="py-2 px-2 font-sans">
                                <select
                                  value={editMstqForm.typeOuverture || 'PORTE_FENETRE'}
                                  onChange={e => setEditMstqForm({ ...editMstqForm, typeOuverture: e.target.value as any })}
                                  className="bg-slate-900 border border-sky-500 rounded px-1.5 py-1 text-xs text-sky-200"
                                >
                                  <option value="PORTE_FENETRE">🚪 Porte-Fenêtre (1 Vantail)</option>
                                  <option value="DOUBLE_VANTAUX">🚪🚪 Baie 2 Vantaux</option>
                                  <option value="CENTRALE">↔️ Centrale</option>
                                  <option value="FENETRE">🪟 Fenêtre</option>
                                  <option value="FIXE">🔒 Fixe</option>
                                </select>
                              </td>
                              <td className="py-2 px-2 font-sans text-[10px] text-slate-400 italic">Édition en cours…</td>
                              <td className="py-2 px-2 font-sans">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditMstqForm({
                                      ...editMstqForm,
                                      typeFabrication: editMstqForm.typeFabrication === 'COMPLET' ? 'SEMI_FINI_MAILLE' : editMstqForm.typeFabrication === 'SEMI_FINI_MAILLE' ? 'PROFILES_SEULS' : 'COMPLET'
                                    })}
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                      editMstqForm.typeFabrication === 'SEMI_FINI_MAILLE'
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : editMstqForm.typeFabrication === 'PROFILES_SEULS'
                                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                        : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                    }`}
                                  >
                                    {editMstqForm.typeFabrication === 'SEMI_FINI_MAILLE' ? 'Semi-Fini (Maille)' : editMstqForm.typeFabrication === 'PROFILES_SEULS' ? 'Profilés Seuls' : 'Complète (+Cadre)'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditMstqForm({ ...editMstqForm, avecBarreInferieure: !editMstqForm.avecBarreInferieure })}
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                      editMstqForm.avecBarreInferieure
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : 'bg-slate-800 text-slate-400 border-slate-700'
                                    }`}
                                  >
                                    {editMstqForm.avecBarreInferieure ? '✓ Avec Barre Inf' : '✕ Sans Barre Inf'}
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={handleSaveEditMstq}
                                    className="p-1 bg-sky-600 hover:bg-sky-500 text-white rounded transition cursor-pointer"
                                    title="Valider"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditMstq}
                                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition cursor-pointer"
                                    title="Annuler"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        const calculMaille = calculerBesoinMaille(m);
                        const dedH = m.avecBarreInferieure ? -37 : (mstqCadreTechParams.debordement ?? -62);
                        const dedL = -62;
                        const dedCoulisse = m.avecBarreInferieure ? -33 : (mstqCoulisseTechParams.debordement ?? -46);
                        const dimCoulisse = (m.typeOuverture === 'FENETRE' ? m.largeur : m.hauteur) + dedCoulisse;

                        return (
                          <tr key={m.id || idx} className="hover:bg-slate-900/50 transition">
                            <td className="py-2 px-3 text-amber-300 font-bold">{m.repere}</td>
                            <td className="py-2 px-3 text-slate-100 font-bold">{m.largeur} × {m.hauteur} mm</td>
                            <td className="py-2 px-3 text-slate-200">{m.quantite}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                m.typeOuverture === 'DOUBLE_VANTAUX' ? 'bg-violet-950/80 text-violet-300 border-violet-500/40' :
                                m.typeOuverture === 'CENTRALE' ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40' :
                                m.typeOuverture === 'FENETRE' ? 'bg-blue-950/80 text-blue-300 border-blue-500/40' :
                                m.typeOuverture === 'FIXE' ? 'bg-slate-800 text-slate-400 border-slate-600' :
                                'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                              }`}>
                                {m.typeOuverture === 'PORTE_FENETRE' && '🚪 Porte-Fenêtre'}
                                {m.typeOuverture === 'DOUBLE_VANTAUX' && '🚪🚪 Baie 2 Vantaux'}
                                {m.typeOuverture === 'CENTRALE' && '↔️ Centrale'}
                                {m.typeOuverture === 'FENETRE' && '🪟 Fenêtre'}
                                {m.typeOuverture === 'FIXE' && '🔒 Fixe'}
                                {!m.typeOuverture && '—'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-sans text-[10px]">
                              <div className="space-y-0.5">
                                {m.typeFabrication !== 'PROFILES_SEULS' && (
                                  <div className="text-amber-300 font-mono flex items-center gap-1">
                                    <span>🕸️ Maille :</span>
                                    <strong className="text-amber-200">{calculMaille.nb_plis_requis} plis</strong>
                                    <span className="text-slate-400">× Coupe {calculMaille.dimension_fixe_est}={calculMaille.dimension_fixe_requise}mm</span>
                                    <span className="text-slate-500">({calculMaille.nb_fils_guidage} fils • {calculMaille.longueur_corde_totale_m}m corde)</span>
                                  </div>
                                )}
                                {m.typeFabrication !== 'SEMI_FINI_MAILLE' && (
                                  <div className="text-sky-300 font-mono flex flex-wrap items-center gap-1.5 text-[9.5px]">
                                    {m.avecBarreInferieure ? (
                                      <>
                                        <span>🖼️ Cadre : 2×H{m.hauteur + dedH}mm + 1×L{m.largeur + dedL}mm</span>
                                        <span className="text-emerald-300">• Barre Inf {m.largeur - 13}mm</span>
                                      </>
                                    ) : (
                                      <span>🖼️ Cadre : 2×H{m.hauteur + dedH}mm + 2×L{m.largeur + dedL}mm</span>
                                    )}
                                    {m.typeOuverture !== 'FIXE' && (
                                      <span className="text-purple-300">• Coulisse {dimCoulisse}mm</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleLigneOption('MOUSTIQUAIRE', m.id, 'typeFab')}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                    m.typeFabrication === 'SEMI_FINI_MAILLE'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : m.typeFabrication === 'PROFILES_SEULS'
                                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                      : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                  }`}
                                >
                                  {m.typeFabrication === 'SEMI_FINI_MAILLE' ? 'Semi-Fini (Maille)' : m.typeFabrication === 'PROFILES_SEULS' ? 'Profilés Seuls' : 'Complète (+Cadre)'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleLigneOption('MOUSTIQUAIRE', m.id, 'barreInf')}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                                    m.avecBarreInferieure
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {m.avecBarreInferieure ? '✓ Avec Barre Inf' : '✕ Sans Barre Inf'}
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditMstq(m)}
                                  className="p-1 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition cursor-pointer"
                                  title="Modifier cette ligne"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleSupprimerLigne('MOUSTIQUAIRE', m.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"
                                  title="Supprimer cette ligne"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* BARRE D'ACTIONS : OPTIMISATION DÉCOUPE MOUSTIQUAIRES */}
              {lignesMoustiquaires.length > 0 && (
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-sky-500/40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
                    <div className="text-xs font-black text-slate-100 flex items-center gap-2">
                      <span>Découpe Moustiquaires :</span>
                      <span className="text-[10px] text-sky-300 font-mono bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30">
                        {lignesMoustiquaires.length} moustiquaire(s)
                        {lignesMoustiquaires.some(m => m.typeFabrication !== 'PROFILES_SEULS') && (
                          <> • {lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').length} maille(s)</>
                        )}
                        {lignesMoustiquaires.some(m => m.typeFabrication !== 'SEMI_FINI_MAILLE') && (
                          <> • {lignesMoustiquaires.filter(m => m.typeFabrication !== 'SEMI_FINI_MAILLE').length} cadre(s)</>
                        )}
                        {lignesMoustiquaires.some(m => m.avecBarreInferieure && m.typeFabrication !== 'SEMI_FINI_MAILLE') && (
                          <> • {lignesMoustiquaires.filter(m => m.avecBarreInferieure && m.typeFabrication !== 'SEMI_FINI_MAILLE').length} barre(s) inf.</>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOptimiserMoustiquaires()}
                      className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-2 shadow-md shadow-sky-500/20 transition active:scale-95 cursor-pointer"
                      title="Lancer l'optimisation de découpe directement pour cette commande"
                    >
                      <Scissors className="w-4 h-4" />
                      <span>⚡ Optimisation &amp; OF (Moustiquaires)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEnregistrerDossier('EN_ATTENTE')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>💾 Enregistrer</span>
                    </button>
                  </div>
                </div>
              )}

              {/* MODAL RÉSULTATS OPTIMISATION MOUSTIQUAIRE COMPLÈTE (MAILLE + PROFILÉS ALU) */}
              {modalDebitMSTQOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                  <div className="bg-slate-900 border border-sky-500/40 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
                    {/* Header Modal */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🕸️</span>
                        <div>
                          <h2 className="text-base font-black text-sky-300">Résultat d’Optimisation &amp; Débit — Moustiquaires</h2>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {lignesMoustiquaires.length} moustiquaire(s) • Débit Maille MSTQ &amp; Découpe 1D des Profilés Aluminium
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModalOFDebitMSTQOpen(true)}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                          <span>🖨️ Imprimer Ordre de Fabrication (OF)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalDebitMSTQOpen(false)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Body Modal */}
                    <div className="overflow-y-auto flex-1 p-4 space-y-6">

                      {/* SECTION MAILLE MSTQ */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/40 space-y-3">
                        <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🕸️</span>
                            <span className="text-sm font-black text-amber-300">Débit &amp; Façonnage Maille MSTQ</span>
                            <span className="text-[10px] font-mono text-amber-200/70 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30">
                              Formule validée atelier (+2 plis sécurité)
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono">
                            Total : {lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').reduce((s, m) => s + (calculerBesoinMaille(m).superficie_m2), 0).toFixed(2)} m²
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold">
                              <tr>
                                <th className="py-2 px-2.5">Repère</th>
                                <th className="py-2 px-2.5">Dim. Finie (L × H)</th>
                                <th className="py-2 px-2.5">Type Ouverture</th>
                                <th className="py-2 px-2.5">Coupe Fixe Maille</th>
                                <th className="py-2 px-2.5">Nb Plis Requis</th>
                                <th className="py-2 px-2.5">Guidage &amp; Cordelettes</th>
                                <th className="py-2 px-2.5">Surface (m²)</th>
                                <th className="py-2 px-2.5">Article Maille MSTQ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                              {lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').map((m, idx) => {
                                const cMaille = calculerBesoinMaille(m);
                                return (
                                  <tr key={m.id || idx} className="hover:bg-slate-900/40">
                                    <td className="py-2 px-2.5 text-amber-300 font-black">{m.repere}</td>
                                    <td className="py-2 px-2.5 text-slate-100 font-bold">{m.largeur} × {m.hauteur} mm (×{m.quantite})</td>
                                    <td className="py-2 px-2.5 font-sans">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-semibold">
                                        {m.typeOuverture === 'PORTE_FENETRE' ? '🚪 Porte-Fenêtre' : m.typeOuverture === 'DOUBLE_VANTAUX' ? '🚪🚪 Baie 2 Vtx' : m.typeOuverture === 'CENTRALE' ? '↔️ Centrale' : m.typeOuverture === 'FIXE' ? '🔒 Fixe' : '🪟 Fenêtre'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2.5">
                                      <span className="text-amber-300 font-black text-xs">{cMaille.dimension_fixe_requise} mm</span>
                                      <span className="text-slate-400 text-[10px] ml-1">({cMaille.dimension_fixe_est === 'H' ? 'sur Hauteur' : 'sur Largeur'})</span>
                                    </td>
                                    <td className="py-2 px-2.5">
                                      <span className="text-emerald-300 font-black text-xs">{cMaille.nb_plis_requis} plis</span>
                                      <span className="text-slate-500 text-[10px] ml-1">(+2 sécu)</span>
                                    </td>
                                    <td className="py-2 px-2.5 text-[10px]">
                                      <span className="text-sky-300 font-bold">{cMaille.nb_fils_guidage} fils</span>
                                      <span className="text-slate-400"> (entraxe ~{cMaille.distance_cordes}mm)</span>
                                      <div className="text-purple-300 font-semibold">Corde totale : {cMaille.longueur_corde_totale_m} m</div>
                                    </td>
                                    <td className="py-2 px-2.5 text-slate-300">{cMaille.superficie_m2} m²</td>
                                    <td className="py-2 px-2.5 text-[10px] text-slate-300 font-sans">{m.articleDesignationMaille || mstqConfig.mailleArticleDesignation || 'MSTQ MAILLE PLISSÉE 20mm'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SECTION PROFILÉS ALUMINIUM (DÉCOUPE 1D OPTIMISÉE) */}
                      {sectionsMultiMSTQ.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-sky-500/20 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🖼️</span>
                              <span className="text-sm font-black text-sky-300">Optimisation &amp; OF des Profilés Aluminium (Cadre MSTQ, Barre Coulisse MSTQ, Barre Inférieure MSTQ)</span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              💡 Les chutes restantes $\ge$ Refus Max (1200 mm) sont automatiquement reversées au Stock de Chutes
                            </div>
                          </div>

                          {sectionsMultiMSTQ.map((section, idx) => {
                            const isExpanded = expandedModalSections[idx] !== false;
                            const isCadre = section.type === 'PRC' || section.type === 'CADRE';
                            const typeLabel = isCadre ? '🖼️ Cadre MSTQ' : section.type === 'GL' ? '🔩 Barre Coulisse MSTQ' : '📏 Barre Inférieure MSTQ';
                            const borderColor = isCadre ? 'border-amber-500/40' : section.type === 'GL' ? 'border-sky-500/40' : 'border-emerald-500/40';
                            const textColor = isCadre ? 'text-amber-300' : section.type === 'GL' ? 'text-sky-300' : 'text-emerald-300';
                            return (
                              <div key={idx} className={`bg-slate-950 rounded-xl border ${borderColor} overflow-hidden`}>
                                <div
                                  className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-900/50 transition"
                                  onClick={() => setExpandedModalSections(prev => ({ ...prev, [idx]: !isExpanded }))}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-black ${textColor}`}>{typeLabel}</span>
                                    <span className="text-[11px] text-slate-300 font-mono">{section.articleDesignation}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${borderColor} ${textColor} bg-slate-900`}>
                                      {section.resultat.total_barres_neuves} barre(s) • Rendement net : {section.resultat.taux_rendement.toFixed(1)}%
                                    </span>
                                  </div>
                                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </div>
                                {isExpanded && (
                                  <div className="px-4 pb-4">
                                    <VisualiseurBarres resultat={section.resultat} articleDesignation={section.articleDesignation} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                    </div>

                    {/* Footer Modal */}
                    <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-800 bg-slate-950/80 shrink-0">
                      <div className="text-[11px] text-slate-400">
                        ✓ Commande enregistrée &amp; prête pour édition de l'Ordre de Fabrication
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModalOFDebitMSTQOpen(true)}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                          <span>🖨️ Imprimer OF Moustiquaires</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalDebitMSTQOpen(false)}
                          className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs transition cursor-pointer"
                        >
                          Fermer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TABLEAU PRÉCADRES */}
          {familleArticle === 'PRECADRE' && (
            <div className="space-y-3">
              {/* BARRE DE FILTRE PAR COMMANDE (Précadres) */}
              {(() => {
                const refsDistinctes = Array.from(new Set(lignesPrecadres.map(p => (p.refCommande || '').trim()).filter(Boolean)));
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900/90 rounded-xl border border-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-300 mr-1 flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-purple-400" />
                        <span>Filtre Commande :</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setFilterCmdActive('TOUTES')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          filterCmdActive === 'TOUTES'
                            ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        Toutes les commandes ({lignesPrecadres.length})
                      </button>
                      {refsDistinctes.map(r => {
                        const count = lignesPrecadres.filter(p => (p.refCommande || '').trim() === r).length;
                        const isSelected = filterCmdActive === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setFilterCmdActive(r)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400'
                                : 'bg-slate-950 text-amber-300 hover:text-amber-200 border border-slate-800'
                            }`}
                          >
                            <span>N° {r}</span>
                            <span className="text-[10px] px-1 py-0.2 rounded bg-purple-950/80 text-purple-200 border border-purple-500/30">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono">
                      Total : <strong className="text-purple-300">{lignesPrecadres.length}</strong> ligne(s) de précadre
                    </div>
                  </div>
                );
              })()}

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900/90 text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Repère</th>
                      <th className="py-2.5 px-3">N° Commande</th>
                      <th className="py-2.5 px-3">Dimensions (L × H)</th>
                      <th className="py-2.5 px-3 text-center">Qté</th>
                      <th className="py-2.5 px-3">Profilé &amp; Bouchon (Dédié Ligne)</th>
                      <th className="py-2.5 px-3">Modèle &amp; Débordement</th>
                      <th className="py-2.5 px-3">Détail Débit Généré</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(() => {
                      const precadresFiltres = filterCmdActive && filterCmdActive !== 'TOUTES'
                        ? lignesPrecadres.filter(p => (p.refCommande || '').trim() === filterCmdActive)
                        : lignesPrecadres;

                      if (precadresFiltres.length === 0) {
                        return (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-500 font-sans italic text-xs">
                              {lignesPrecadres.length === 0
                                ? 'Aucun précadre enregistré pour le moment. Saisissez L × H ci-dessus puis validez.'
                                : `Aucun précadre pour le filtre "${filterCmdActive}". Cliquez sur "Toutes les commandes" pour afficher l\'ensemble.`}
                            </td>
                          </tr>
                        );
                      }

                      return precadresFiltres.map((p, idx) => {
                        const isEditingP = editingPrecadreId === p.id && editPrecadreForm !== null;

                        if (isEditingP && editPrecadreForm) {
                          return (
                            <tr key={p.id || idx} className="bg-purple-950/30 border-2 border-purple-500/50">
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={editPrecadreForm.repere}
                                  onChange={e => setEditPrecadreForm({ ...editPrecadreForm, repere: e.target.value })}
                                  className="w-full bg-slate-950 border border-purple-500 rounded px-1.5 py-1 text-xs text-amber-300 font-bold"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={editPrecadreForm.refCommande}
                                  onChange={e => setEditPrecadreForm({ ...editPrecadreForm, refCommande: e.target.value })}
                                  className="w-full bg-slate-950 border border-purple-500 rounded px-1.5 py-1 text-xs text-amber-300 font-mono"
                                  placeholder="Réf Commande"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={editPrecadreForm.largeur}
                                    onChange={e => setEditPrecadreForm({ ...editPrecadreForm, largeur: Number(e.target.value) })}
                                    className="w-16 bg-slate-950 border border-purple-500 rounded px-1 py-1 text-xs text-slate-100 font-black"
                                    placeholder="L"
                                  />
                                  <span className="text-slate-500 text-xs">×</span>
                                  <input
                                    type="number"
                                    value={editPrecadreForm.hauteur}
                                    onChange={e => setEditPrecadreForm({ ...editPrecadreForm, hauteur: Number(e.target.value) })}
                                    className="w-16 bg-slate-950 border border-purple-500 rounded px-1 py-1 text-xs text-slate-100 font-black"
                                    placeholder="H"
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-2 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={editPrecadreForm.quantite}
                                  onChange={e => setEditPrecadreForm({ ...editPrecadreForm, quantite: Math.max(1, Number(e.target.value)) })}
                                  className="w-12 bg-slate-950 border border-purple-500 rounded px-1 py-1 text-xs text-amber-300 font-bold text-center"
                                />
                              </td>
                              <td className="py-2 px-2 space-y-1">
                                <select
                                  value={editPrecadreForm.articleCode}
                                  onChange={e => {
                                    const code = e.target.value;
                                    const found = articlesPrecadre.find(a => a.code_art === code);
                                    const is55 = (code === 'ART0061' || (found?.designation || '').includes('55'));
                                    const bchCode = is55 ? 'ART0066' : 'ART0065';
                                    const bchArt = articlesBouchonPrecadre.find(b => b.code_art === bchCode);
                                    setEditPrecadreForm({
                                      ...editPrecadreForm,
                                      articleCode: code,
                                      articleDesignation: found?.designation || code,
                                      bouchonArticleCode: bchCode,
                                      bouchonArticleDesignation: bchArt?.designation || bchCode
                                    });
                                  }}
                                  className="w-full bg-slate-900 border border-purple-500/50 rounded px-1 py-0.5 text-[10px] text-purple-200"
                                >
                                  {articlesPrecadre.map(a => (
                                    <option key={a.code_art} value={a.code_art}>{a.designation}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-2 font-sans text-[10px] space-y-1">
                                <select
                                  value={editPrecadreForm.figure}
                                  onChange={e => setEditPrecadreForm({ ...editPrecadreForm, figure: e.target.value as any })}
                                  className="w-full bg-slate-900 border border-purple-500/50 rounded px-1 py-0.5 text-[10px] text-purple-200"
                                >
                                  <option value="VIDE">1. Vide (aucun renfort)</option>
                                  <option value="RENFORT_L1">2. + Renfort Horizontal L1</option>
                                  <option value="RENFORT_H1">3. + Renfort Vertical H1</option>
                                  <option value="RENFORT_CROISE">4. Croisé R1/R2 + H1</option>
                                </select>
                                <select
                                  value={editPrecadreForm.modeDebordement}
                                  onChange={e => setEditPrecadreForm({ ...editPrecadreForm, modeDebordement: e.target.value as any })}
                                  className="w-full bg-slate-900 border border-purple-500/50 rounded px-1 py-0.5 text-[10px] text-purple-200"
                                >
                                  <option value="SUPERIEUR_INFERIEUR">⬆️⬇️ A. Haut (+100) &amp; Bas (+300)</option>
                                  <option value="SUPERIEUR_SEUL">⬆️ B. Haut (+100) Seul</option>
                                  <option value="INFERIEUR_SEUL">⬇️ C. Bas (+300) Seul</option>
                                  <option value="SANS_DEBORDEMENT">⏹️ D. Cadre Fermé (0/0)</option>
                                </select>
                              </td>
                              <td className="py-2 px-2 font-sans text-[10px] text-slate-400 italic">Édition en cours…</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={handleSaveEditPrecadre}
                                    className="p-1 bg-purple-600 hover:bg-purple-500 text-white rounded transition cursor-pointer"
                                    title="Valider"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditPrecadre}
                                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition cursor-pointer"
                                    title="Annuler"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        const figureLabel = p.figure === 'VIDE' ? '⬜ Vide'
                          : p.figure === 'RENFORT_L1' ? '— + L1 Horizontal'
                          : p.figure === 'RENFORT_H1' ? '| + H1 Vertical'
                          : '+ Croisé R1/R2 + H1';

                        const debSup = p.debordementSuperieur !== undefined ? p.debordementSuperieur : 100;
                        const debInf = p.debordementInferieur !== undefined ? p.debordementInferieur : 300;

                        const { hMontant, lTraverse, lRenfortSeul, lDemiRenfortCroise, hRenfort } = getDimensionsPrecadrePiece(
                          p.largeur,
                          p.hauteur,
                          p.modeDebordement || 'SUPERIEUR_INFERIEUR',
                          debSup,
                          debInf
                        );

                        const currentArtCode = p.articleCode || precadreConfig.articleCode || 'ART0060';
                        const currentArt = articlesPrecadre.find(a => a.code_art === currentArtCode) || articlesPrecadre[0];

                        return (
                          <tr key={p.id || idx} className="hover:bg-slate-900/50 transition">
                            <td className="py-2 px-3 text-amber-300 font-bold">{p.repere}</td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-amber-500/40 text-amber-300 font-mono font-bold text-[11px] whitespace-nowrap">
                                {p.refCommande || 'CMD-PRC'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-100 font-bold whitespace-nowrap">{p.largeur} × {p.hauteur} mm</td>
                            <td className="py-2 px-3 text-slate-200 text-center font-bold">{p.quantite}</td>
                            <td className="py-2 px-3 font-sans text-[11px]">
                              <div className="space-y-1 min-w-[150px]">
                                <select
                                  value={currentArtCode}
                                  onChange={e => {
                                    const newCode = e.target.value;
                                    const artFound = articlesPrecadre.find(a => a.code_art === newCode);
                                    const is55 = (newCode === 'ART0061' || (artFound?.designation || '').includes('55'));
                                    const newBchCode = is55 ? 'ART0066' : 'ART0065';
                                    const bchArt = articlesBouchonPrecadre.find(b => b.code_art === newBchCode);
                                    setLignesPrecadres(prev => prev.map(item => item.id === p.id ? {
                                      ...item,
                                      articleCode: newCode,
                                      articleDesignation: artFound?.designation || newCode,
                                      bouchonArticleCode: newBchCode,
                                      bouchonArticleDesignation: bchArt?.designation || newBchCode
                                    } : item));
                                    showFlashNotification(`✓ Ligne ${p.repere} : Profilé sélectionné : "${artFound?.designation || newCode}"`, 'success');
                                  }}
                                  className="w-full bg-slate-950 border border-purple-500/40 hover:border-purple-400 rounded-md px-1.5 py-0.5 text-xs text-purple-200 font-bold focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer"
                                  title="Changer le profilé spécifique de ce précadre"
                                >
                                  {articlesPrecadre.map(a => (
                                    <option key={a.code_art} value={a.code_art}>{a.designation}</option>
                                  ))}
                                </select>
                                <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                                  <span>Bouchon :</span>
                                  <span className="text-slate-300 font-semibold">{p.bouchonArticleDesignation || (currentArtCode === 'ART0061' ? 'BOUCHON 55' : 'BOUCHON 43')}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans text-[11px]">
                              <div className="space-y-1.5 min-w-[155px]">
                                <div>
                                  <select
                                    value={p.figure || 'VIDE'}
                                    onChange={e => {
                                      const fig = e.target.value as FigurePrecadre;
                                      setLignesPrecadres(prev => prev.map(item => item.id === p.id ? { ...item, figure: fig } : item));
                                      const figLabel = fig === 'VIDE' ? '1. Vide' : fig === 'RENFORT_L1' ? '2. + Renfort L1' : fig === 'RENFORT_H1' ? '3. + Renfort H1' : '4. Croisé R1/R2 + H1';
                                      showFlashNotification(`✓ Ligne ${p.repere} : Figure actualisée en "${figLabel}"`, 'success');
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 hover:border-purple-400 rounded-md px-1.5 py-0.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer"
                                    title="Changer la figure de renfort pour ce précadre"
                                  >
                                    <option value="VIDE">⬜ 1. Vide (sans renfort)</option>
                                    <option value="RENFORT_L1">— 2. + Renfort L1 (Horiz)</option>
                                    <option value="RENFORT_H1">| 3. + Renfort H1 (Vert)</option>
                                    <option value="RENFORT_CROISE">➕ 4. Croisé R1/R2 + H1</option>
                                  </select>
                                </div>
                                <div>
                                  <select
                                    value={p.modeDebordement || 'SUPERIEUR_INFERIEUR'}
                                    onChange={e => {
                                      const md = e.target.value as ModeDebordementPrecadre;
                                      const hasDeb = (md !== 'SANS_DEBORDEMENT' && (md as string) !== 'AUCUN');
                                      setLignesPrecadres(prev => prev.map(item => item.id === p.id ? { ...item, modeDebordement: md, typeAssemblage: hasDeb ? 'EQUERRE' : 'BOUCHON' } : item));
                                      showFlashNotification(`✓ Ligne ${p.repere} : Mode débordement actualisé`, 'info');
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-md px-1.5 py-0.5 text-[10px] text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer"
                                    title="Changer le mode de débordement"
                                  >
                                    <option value="SUPERIEUR_INFERIEUR">⬆️⬇️ A. Haut (+100) &amp; Bas (+300)</option>
                                    <option value="SUPERIEUR_SEUL">⬆️ B. Haut (+100) seul</option>
                                    <option value="INFERIEUR_SEUL">⬇️ C. Bas (+300) seul</option>
                                    <option value="SANS_DEBORDEMENT">⏹️ D. Cadre Fermé (0/0)</option>
                                  </select>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans text-[10px] text-purple-200">
                              <div className="space-y-0.5 font-mono">
                                <div>2 × Montants H = <strong className="text-amber-300">{hMontant}</strong> mm</div>
                                <div>1 × TRH + 1 × TRB L = <strong className="text-sky-300">{lTraverse}</strong> mm</div>
                                {p.figure === 'RENFORT_L1' && (
                                  <div className="text-sky-300 font-bold">+ 1 × Renfort L1 = {lRenfortSeul} mm</div>
                                )}
                                {p.figure === 'RENFORT_CROISE' && (
                                  <div className="text-sky-300 font-bold">
                                    + 2 × Demi-Renforts (R1 &amp; R2) = {lDemiRenfortCroise} mm <span className="text-slate-400 font-normal">[(L-19)/2]</span>
                                  </div>
                                )}
                                {(p.figure === 'RENFORT_H1' || p.figure === 'RENFORT_CROISE') && (
                                  <div className="text-emerald-300 font-bold">
                                    + 1 × Renfort H1 = {hRenfort} mm <span className="text-slate-400 font-normal">[(H-38mm: 2 trav. 19mm)]</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditPrecadre(p)}
                                  className="p-1 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition cursor-pointer"
                                  title="Modifier cette ligne"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleSupprimerLigne('PRECADRE', p.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"
                                  title="Supprimer cette ligne"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* BARRE D'ACTIONS : OPTIMISATION DÉBIT PRÉCADRES */}
              {lignesPrecadres.length > 0 && (
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-purple-500/40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                    <div className="text-xs font-black text-slate-100 flex items-center gap-2">
                      <span>Découpe Précadres :</span>
                      <span className="text-[10px] text-purple-300 font-mono bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                        {lignesPrecadres.length} précadre(s) • {lignesPrecadres.reduce((s, p) => s + p.quantite * 2, 0)} montants verticaux
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOptimiserPrecadres()}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-2 shadow-md shadow-purple-500/20 transition active:scale-95 cursor-pointer"
                      title="Lancer l'optimisation de découpe directement pour cette commande"
                    >
                      <Scissors className="w-4 h-4" />
                      <span>⚡ Optimisation &amp; OF (Précadres)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEnregistrerDossier('EN_ATTENTE')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>💾 Enregistrer</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 5. ACTIONS INFÉRIEURES : ENREGISTRER / METTRE À JOUR                      */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEnregistrerDossier('EN_ATTENTE')}
              disabled={totalLignesEnCours === 0}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{editingDossierId ? `Mettre à jour la Commande ${numCommande}` : `Enregistrer la Commande ${numCommande}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* ========================================================================= */}
      {/* 6. COMMANDES DU DOSSIER EN COURS                                          */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span>Commandes du Dossier en cours</span>
                <span className="text-[11px] font-bold text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-500/40 font-mono">
                  {commandesDossierEnCours.length} commande(s)
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Client : <strong className="text-slate-200">{clientDeMonClient || 'En cours'}</strong> ({monClient}) • Date : {dateCommande}
              </p>
            </div>
          </div>

          {/* Barre d'action multi-sélection des commandes du dossier */}
          {selectedCmdRefs.size > 0 && (
            <div className="flex items-center gap-2.5 bg-amber-950/80 border border-amber-500/40 rounded-xl px-3.5 py-2 animate-pulse-once">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                {selectedCmdRefs.size} commande(s) sélectionnée(s)
              </span>
              <button
                onClick={handleOptimiserSelectionCommandesDossier}
                className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>⚡ Multi-Optimiser la sélection ({selectedCmdRefs.size})</span>
              </button>
              <button
                onClick={() => setSelectedCmdRefs(new Set())}
                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition"
                title="Désélectionner tout"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleNouveauDossier(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-sky-500/30 shadow transition active:scale-95 cursor-pointer"
              title="Démarrer un nouveau dossier vierge à 0 pour un autre client"
            >
              <FolderPlus className="w-4 h-4 text-sky-400" />
              <span>📁 Nouveau Dossier Vierge</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (commandesDossierEnCours.length === 0) {
                  showFlashNotification('⚠️ Aucune commande à optimiser dans ce dossier. Renseignez et enregistrez au moins une commande.', 'warn');
                  return;
                }
                const allRefs = commandesDossierEnCours.map(c => c.ref);
                handleOptimiserMultiFamillesDossier(allRefs);
              }}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer"
              title="Optimiser toutes les commandes et familles de ce dossier par famille de produit distincte"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>⚡ Optimisation &amp; OF Tout le Dossier ({commandesDossierEnCours.length})</span>
            </button>

            <button
              type="button"
              onClick={handleNouvelleCommande}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>➕ Autre Commande pour ce Client</span>
            </button>

            <a
              href="?tab=historique"
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  onNavigateToTab('historique');
                }
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
              title="Consulter l'Historique (Clic normal ou Clic-droit / Ctrl+Clic pour ouvrir dans un nouvel onglet)"
            >
              <History className="w-3.5 h-3.5 text-purple-400" />
              <span>📜 Historique Global ({dossiers.length})</span>
              <ExternalLink className="w-3 h-3 text-purple-400/80" />
            </a>
          </div>
        </div>

        {/* Liste des Commandes du Dossier en cours */}
        <div className="space-y-3">
          {!editingDossierId ? (
            <div className="text-center py-8 bg-slate-950/60 rounded-xl border border-dashed border-emerald-500/30 p-6 space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-emerald-300">Nouveau Dossier Vierge — Masque de Saisie à 0</h4>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Le masque de saisie est prêt pour un nouveau client. Aucune commande précédente n'est rattachée à ce dossier. Saisissez vos dimensions ci-dessus puis cliquez sur « 💾 Enregistrer la Commande » pour enregistrer ce dossier dans l'Historique.
              </p>
            </div>
          ) : commandesDossierEnCours.length === 0 ? (
            <div className="text-center py-8 bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs">
              Aucune commande enregistrée dans l'historique pour ce dossier pour le moment. Renseignez vos articles ci-dessus puis cliquez sur « 💾 Enregistrer la Commande » pour l'enregistrer.
            </div>
          ) : (
            commandesDossierEnCours.map(cmd => {
              const isCurrentlyActive = getActiveNumCommande().trim() === cmd.ref;
              const isChecked = selectedCmdRefs.has(cmd.ref);
              return (
                <div
                  key={cmd.ref}
                  className={`bg-slate-950 border rounded-xl p-4 transition space-y-3 ${
                    isChecked
                      ? 'border-amber-500/80 ring-2 ring-amber-500/30 bg-amber-950/10'
                      : isCurrentlyActive
                      ? 'border-amber-500/80 ring-2 ring-amber-500/20 bg-slate-950/90'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Checkbox pour sélection multi-commandes */}
                      <label className="flex items-center cursor-pointer" title="Cocher pour multi-optimiser avec d'autres commandes">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectCmdRef(cmd.ref)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
                        />
                      </label>

                      <span className="font-mono font-black text-amber-300 text-sm bg-slate-900 px-3 py-1 rounded-lg border border-amber-500/40 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-amber-400" />
                        <span>Commande N° {cmd.ref}</span>
                      </span>

                      {cmd.estConfirmee ? (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Confirmée • Atelier</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                          <span>⏳ En préparation</span>
                        </span>
                      )}

                      {isCurrentlyActive && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500 text-slate-950">
                          En cours de saisie
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* BOUTON CONFIRMATION INDIVIDUELLE OU RÉ-IMPRESSION OF */}
                      {cmd.estConfirmee ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOptimiserMultiFamillesDossier(cmd.ref)}
                            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-black rounded-lg text-xs flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
                            title={`Ouvrir ou ré-imprimer l'Ordre de Fabrication pour la commande N° ${cmd.ref}`}
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-200" />
                            <span>🖨️ Ouvrir / Ré-imprimer OF</span>
                          </button>

                          {(() => {
                            const cleanRef = cmd.ref.trim().toLowerCase();
                            const matchingOFs = (suivisOF || []).filter(o => {
                              const oCmd = (o.numCommande || '').trim().toLowerCase();
                              return oCmd && (oCmd === cleanRef || oCmd.includes(cleanRef) || cleanRef.includes(oCmd));
                            });
                            const isCmdEnPause = matchingOFs.some(o => o.statut === 'EN_PAUSE' || o.estEnPause) || Boolean(estEnPause);

                            return (
                              <button
                                type="button"
                                onClick={() => handleTogglePauseCommandeIndividuelle(cmd.ref)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer ${
                                  isCmdEnPause
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                    : 'bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 hover:border-rose-700/60'
                                }`}
                                title={isCmdEnPause ? `Reprendre la production pour la commande N° ${cmd.ref}` : `Mettre en pause la commande N° ${cmd.ref}`}
                              >
                                {isCmdEnPause ? (
                                  <>
                                    <Play className="w-3.5 h-3.5 text-white" />
                                    <span>▶️ Reprendre</span>
                                  </>
                                ) : (
                                  <>
                                    <Pause className="w-3.5 h-3.5 text-rose-300" />
                                    <span>⏸️ Mettre en pause</span>
                                  </>
                                )}
                              </button>
                            );
                          })()}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConfirmerCommandeIndividuelle(cmd.ref)}
                          disabled={cmd.total === 0}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
                          title={`Confirmer la commande N° ${cmd.ref} et émettre son OF sans attendre les autres commandes`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                          <span>✅ Confirmer (Émettre OF)</span>
                        </button>
                      )}

                      {/* Optimisation débit de cette commande */}
                      <button
                        type="button"
                        onClick={() => handleOptimiserMultiFamillesDossier(cmd.ref)}
                        disabled={cmd.total === 0}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 shadow transition active:scale-95 cursor-pointer"
                        title={`Calculer l'optimisation et générer l'OF pour la commande N° ${cmd.ref}`}
                      >
                        <Scissors className="w-3.5 h-3.5 text-amber-400" />
                        <span>⚡ Optimisation & OF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveNumCommande(cmd.ref);
                          setFilterCmdActive(cmd.ref);
                          setModeSaisieActif(true);
                          editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          showFlashNotification(`✓ Commande N° ${cmd.ref} chargée pour modification.`, 'info');
                        }}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Modifier</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRetirerCommandeDuDossier(cmd.ref)}
                        className="p-1.5 bg-slate-900 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg text-xs transition border border-slate-800 cursor-pointer"
                        title="Retirer cette commande du dossier"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Synthèse des articles de cette commande */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {cmd.caissons > 0 && (
                      <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-mono">
                        📦 {cmd.caissons} Caisson(s) CT
                      </span>
                    )}
                    {cmd.sousFaces > 0 && (
                      <span className="bg-sky-950/60 text-sky-300 border border-sky-500/30 px-2.5 py-1 rounded-lg font-mono">
                        📐 {cmd.sousFaces} Sous-Face(s) SF
                      </span>
                    )}
                    {cmd.tabliers > 0 && (
                      <span className="bg-sky-950/60 text-sky-300 border border-sky-500/30 px-2.5 py-1 rounded-lg font-mono">
                        🚪 {cmd.tabliers} Tablier(s) / Volet(s)
                      </span>
                    )}
                    {cmd.mstq > 0 && (
                      <span className="bg-amber-950/60 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg font-mono">
                        🦟 {cmd.mstq} Moustiquaire(s)
                      </span>
                    )}
                    {cmd.precadres > 0 && (
                      <span className="bg-purple-950/60 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-lg font-mono">
                        🔲 {cmd.precadres} Précadre(s)
                      </span>
                    )}
                    {cmd.total === 0 && (
                      <span className="text-slate-500 italic text-xs">Aucune ligne saisie pour le moment</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6.9 MODAL BARRE DE PROGRESSION DE L'OPTIMISATION (ANTI-BLOCAGE) */}
      {/* ========================================================================= */}
      {optProgress && optProgress.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col items-center text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-pulse">
              <Scissors className="w-8 h-8" />
            </div>

            <div className="space-y-1.5 w-full">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span className="text-emerald-400 font-bold">{optProgress.sectionName}</span>
                <span className="font-mono text-emerald-400">{optProgress.percent}%</span>
              </div>

              {/* Barre de progression fluide */}
              <div className="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden border border-slate-700/60 p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300 ease-out shadow-sm shadow-emerald-500/50"
                  style={{ width: `${optProgress.percent}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-200">
                {optProgress.currentTask}
              </p>
              <p className="text-xs text-slate-400">
                Veuillez patienter pendant l'optimisation des coupes et le réemploi des chutes...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL D'OPTIMISATION DE DÉCOUPE PAR FAMILLE DE PRODUIT (NON MÉLANGÉE) */}
      {/* ========================================================================= */}
      {modalDebitCaissonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto text-slate-100">
            {/* Header Modal */}
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/90">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                    <span>Optimisation & OF par Famille de Produit</span>
                    {multiOptActiveRefs.length > 0 && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                        {multiOptActiveRefs.length === 1 ? `Cmd ${multiOptActiveRefs[0]}` : `Cmds : ${multiOptActiveRefs.join(', ')}`}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Client : <strong>{clientDeMonClient}</strong> ({monClient}) • Date : {dateCommande} • {sectionsMultiCaisson.length} profilé(s) optimisé(s)
                  </p>
                </div>
              </div>

              {/* Boutons d'Action Haut */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalOFDebitCaissonOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer Ordre de Fabrication</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalDebitCaissonOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Onglets de filtrage par Famille de Produit */}
            <div className="flex flex-wrap items-center justify-between p-3 bg-slate-950 border-b border-slate-800 text-xs gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMultiOptFamilyFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                    multiOptFamilyFilter === 'ALL'
                      ? 'bg-slate-700 text-white shadow'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Toutes les Familles ({sectionsMultiCaisson.length})
                </button>
                {sectionsMultiCaisson.some(s => getSectionFamille(s) === 'CAISSON') && (
                  <button
                    type="button"
                    onClick={() => setMultiOptFamilyFilter('CAISSON')}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      multiOptFamilyFilter === 'CAISSON'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-slate-900 text-emerald-400 hover:bg-slate-800 border border-emerald-500/30'
                    }`}
                  >
                    📦 Caissons &amp; Sous-Faces ({sectionsMultiCaisson.filter(s => getSectionFamille(s) === 'CAISSON').length})
                  </button>
                )}
                {sectionsMultiCaisson.some(s => getSectionFamille(s) === 'TABLIER') && (
                  <button
                    type="button"
                    onClick={() => setMultiOptFamilyFilter('TABLIER')}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      multiOptFamilyFilter === 'TABLIER'
                        ? 'bg-sky-600 text-white shadow'
                        : 'bg-slate-900 text-sky-400 hover:bg-slate-800 border border-sky-500/30'
                    }`}
                  >
                    🚪 Volets / Tabliers ({sectionsMultiCaisson.filter(s => getSectionFamille(s) === 'TABLIER').length})
                  </button>
                )}
                {sectionsMultiCaisson.some(s => getSectionFamille(s) === 'MOUSTIQUAIRE') && (
                  <button
                    type="button"
                    onClick={() => setMultiOptFamilyFilter('MOUSTIQUAIRE')}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      multiOptFamilyFilter === 'MOUSTIQUAIRE'
                        ? 'bg-amber-600 text-white shadow'
                        : 'bg-slate-900 text-amber-400 hover:bg-slate-800 border border-amber-500/30'
                    }`}
                  >
                    🦟 Moustiquaires ({sectionsMultiCaisson.filter(s => getSectionFamille(s) === 'MOUSTIQUAIRE').length})
                  </button>
                )}
                {sectionsMultiCaisson.some(s => getSectionFamille(s) === 'PRECADRE') && (
                  <button
                    type="button"
                    onClick={() => setMultiOptFamilyFilter('PRECADRE')}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      multiOptFamilyFilter === 'PRECADRE'
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-slate-900 text-purple-400 hover:bg-slate-800 border border-purple-500/30'
                    }`}
                  >
                    🔲 Précadres ({sectionsMultiCaisson.filter(s => getSectionFamille(s) === 'PRECADRE').length})
                  </button>
                )}
              </div>
            </div>

            {/* Corps du Modal : Visualiseur ordonné par famille de produit */}
            <div className="p-5 overflow-y-auto space-y-6">
              {sectionsMultiCaisson.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs italic">
                  Aucune ligne d'article valide à optimiser. Saisissez des lignes et lancez l'optimisation.
                </div>
              ) : (
                (() => {
                  const filteredSections = sectionsMultiCaisson.filter(s => {
                    if (multiOptFamilyFilter === 'ALL') return true;
                    return getSectionFamille(s) === multiOptFamilyFilter;
                  });

                  // Groupement visuel par famille pour isoler chaque groupe
                  const famillesPresentes: Array<{ key: FamilleProduit; label: string; icon: string; bg: string }> = [
                    { key: 'CAISSON', label: 'FAMILLE 1 : CAISSONS TUNNEL & SOUS-FACES ALU', icon: '📦', bg: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' },
                    { key: 'TABLIER', label: 'FAMILLE 2 : VOLETS & TABLIERS (LAMES, LAME FINALE, COULISSES)', icon: '🚪', bg: 'bg-sky-950/80 border-sky-500/50 text-sky-300' },
                    { key: 'MOUSTIQUAIRE', label: 'FAMILLE 3 : MOUSTIQUAIRES (CADRES, COULISSES, BARRES INF)', icon: '🦟', bg: 'bg-amber-950/80 border-amber-500/50 text-amber-300' },
                    { key: 'PRECADRE', label: 'FAMILLE 4 : PRÉCADRES (MONTANTS, TRAVERSES, RENFORTS)', icon: '🔲', bg: 'bg-purple-950/80 border-purple-500/50 text-purple-300' },
                  ];

                  return famillesPresentes.map(fam => {
                    const secsFamille = filteredSections.filter(s => getSectionFamille(s) === fam.key);
                    if (secsFamille.length === 0) return null;

                    const refsInFamille = Array.from(new Set(secsFamille.flatMap(s => s.commandesInvolved || [])));

                    return (
                      <div key={fam.key} className="space-y-4">
                        {/* En-tête de séparation nette de la famille */}
                        <div className={`px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 shadow-md ${fam.bg}`}>
                          <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wide">
                            <span className="text-base">{fam.icon}</span>
                            <span>{fam.label}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono">
                            <span className="bg-slate-950/80 px-2.5 py-0.5 rounded border border-slate-700 text-slate-200">
                              {refsInFamille.length > 0 ? `Commandes : ${refsInFamille.join(', ')}` : 'Dossier Global'}
                            </span>
                            <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                              {secsFamille.length} profilé(s)
                            </span>
                          </div>
                        </div>

                        {/* Profilés de cette famille */}
                        <div className="space-y-4 pl-1">
                          {secsFamille.map((sec, sIdx) => {
                            const isCT = sec.type === 'CT';
                            const isLF = sec.type === 'LF';
                            const isGL = sec.type === 'GL';
                            const isSF = sec.type === 'SF';
                            const isPRC = sec.type === 'PRC';

                            let sectionColor = 'bg-emerald-950/30 border-emerald-500/40';
                            let badgeColor = 'bg-emerald-500 text-slate-950';
                            let statBadgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-500/40';
                            let sectionTitle = '📦 CAISSON TUNNEL';
                            let titleTextColor = 'text-emerald-300';

                            if (fam.key === 'TABLIER') {
                              if (isLF) {
                                sectionColor = 'bg-orange-950/30 border-orange-500/40';
                                badgeColor = 'bg-orange-500 text-slate-950';
                                statBadgeColor = 'bg-orange-950 text-orange-300 border-orange-500/40';
                                sectionTitle = '🏁 LAME FINALE (SEUIL)';
                                titleTextColor = 'text-orange-300';
                              } else if (isGL) {
                                sectionColor = 'bg-violet-950/30 border-violet-500/40';
                                badgeColor = 'bg-violet-500 text-white';
                                statBadgeColor = 'bg-violet-950 text-violet-300 border-violet-500/40';
                                sectionTitle = '📐 TAB COULISSE (COULISSES VOLET / GUIDAGE)';
                                titleTextColor = 'text-violet-300';
                              } else {
                                sectionColor = 'bg-sky-950/30 border-sky-500/40';
                                badgeColor = 'bg-sky-500 text-slate-950';
                                statBadgeColor = 'bg-sky-950 text-sky-300 border-sky-500/40';
                                sectionTitle = '🚪 LAMES TABLIER';
                                titleTextColor = 'text-sky-300';
                              }
                            } else if (fam.key === 'MOUSTIQUAIRE') {
                              if (isGL) {
                                sectionColor = 'bg-amber-950/30 border-amber-500/40';
                                badgeColor = 'bg-amber-500 text-slate-950';
                                statBadgeColor = 'bg-amber-950 text-amber-300 border-amber-500/40';
                                sectionTitle = '🔩 MSTQ COULISSE (COULISSE MOUSTIQUAIRE)';
                                titleTextColor = 'text-amber-300';
                              } else if (isSF) {
                                sectionColor = 'bg-yellow-950/30 border-yellow-500/40';
                                badgeColor = 'bg-yellow-500 text-slate-950';
                                statBadgeColor = 'bg-yellow-950 text-yellow-300 border-yellow-500/40';
                                sectionTitle = '📏 BARRE INFÉRIEURE MOUSTIQUAIRE';
                                titleTextColor = 'text-yellow-300';
                              } else {
                                sectionColor = 'bg-amber-950/30 border-amber-500/40';
                                badgeColor = 'bg-amber-500 text-slate-950';
                                statBadgeColor = 'bg-amber-950 text-amber-300 border-amber-500/40';
                                sectionTitle = '🖼️ CADRE MOUSTIQUAIRE';
                                titleTextColor = 'text-amber-300';
                              }
                            } else if (fam.key === 'PRECADRE') {
                              sectionColor = 'bg-purple-950/30 border-purple-500/40';
                              badgeColor = 'bg-purple-500 text-white';
                              statBadgeColor = 'bg-purple-950 text-purple-300 border-purple-500/40';
                              sectionTitle = '🔲 PRÉ-CADRE (MONTANTS / TRAVERSES / RENFORTS)';
                              titleTextColor = 'text-purple-300';
                            } else {
                              // CAISSON
                              if (isSF) {
                                sectionColor = 'bg-sky-950/30 border-sky-500/40';
                                badgeColor = 'bg-sky-500 text-slate-950';
                                statBadgeColor = 'bg-sky-950 text-sky-300 border-sky-500/40';
                                sectionTitle = '📐 SOUS-FACE ALU';
                                titleTextColor = 'text-sky-300';
                              }
                            }

                            return (
                              <div
                                key={sIdx}
                                className={`space-y-3 p-4 rounded-xl border ${sectionColor}`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-7 h-7 rounded font-black flex items-center justify-center text-xs shadow ${badgeColor}`}>
                                      {sIdx + 1}
                                    </div>
                                    <div>
                                      <h3 className="text-sm font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                                        <span>{sectionTitle}</span>
                                        <span className={`text-xs ${titleTextColor} font-mono font-bold`}>
                                          — {sec.articleDesignation}
                                        </span>
                                      </h3>
                                      {sec.commandesInvolved && sec.commandesInvolved.length > 0 && (
                                        <p className="text-[11px] text-slate-400 font-mono">
                                          Commandes incluses : <strong className="text-amber-300">{sec.commandesInvolved.join(', ')}</strong>
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 text-xs font-mono">
                                    <span className={`px-2.5 py-1 rounded-lg font-bold border ${statBadgeColor}`}>
                                      {sec.resultat.total_barres_neuves} Barre(s) neuve(s) • Rendement {sec.resultat.taux_rendement}%
                                    </span>
                                  </div>
                                </div>

                                <VisualiseurBarres
                                  resultat={sec.resultat}
                                  articleDesignation={sec.articleDesignation}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL IMPRESSION ORDRE DE FABRICATION UNIFIÉ (MULTI-FAMILLES DU DOSSIER) */}
      {/* ========================================================================= */}
      {modalOFDebitCaissonOpen && caissonSections.length > 0 && (() => {
        // Déterminer la véritable famille des sections optimisées
        const secFamilies = Array.from(new Set(caissonSections.map(s => s.famille).filter(Boolean))) as FamilleProduit[];
        const famPourOF: FamilleProduit = (
          (multiOptFamilyFilter !== 'ALL' && ['TABLIER', 'MOUSTIQUAIRE', 'CAISSON', 'PRECADRE'].includes(multiOptFamilyFilter))
            ? (multiOptFamilyFilter as FamilleProduit)
            : (secFamilies.length === 1 ? secFamilies[0] : (familleArticle || 'TABLIER'))
        );
        const labelFamille = famPourOF === 'TABLIER' ? 'Volets & Tabliers' : famPourOF === 'MOUSTIQUAIRE' ? 'Moustiquaires' : famPourOF === 'PRECADRE' ? 'Précadres' : 'Caissons & Sous-Faces';

        return (
          <OrdreFabricationModal
            isOpen={modalOFDebitCaissonOpen}
            onClose={() => setModalOFDebitCaissonOpen(false)}
            famille={famPourOF}
            titreProduit={`Ordre de Fabrication Débit (${labelFamille}) — Dossier ${clientDeMonClient || 'Client'}`}
            refCommande={(() => {
              const allRefs = new Set<string>();
              sectionsMultiCaisson.forEach(s => {
                if (s.commandesInvolved && Array.isArray(s.commandesInvolved)) {
                  s.commandesInvolved.forEach(r => { if (r && r.trim()) allRefs.add(r.trim()); });
                }
              });
              if (multiOptActiveRefs && multiOptActiveRefs.length > 0) {
                multiOptActiveRefs.forEach(r => { if (r && r.trim()) allRefs.add(r.trim()); });
              }
              if (allRefs.size === 0 && numCommande) {
                allRefs.add(numCommande);
              }
              const arr = Array.from(allRefs);
              return arr.length > 0 ? arr.join(' + ') : (numCommande || 'DOSSIER');
            })()}
            nomClient={clientDeMonClient}
            dateCommande={dateCommande}
            coloris="MULTI"
            sections={caissonSections}
            articles={articles}
            lignesMoustiquaires={lignesMoustiquaires}
            chutesMaille={chutesMaille}
            paramsMaille={paramsMaille}
            mapping={mapping}
            donneurOrdre={monClient}
            numCommandeCaisson={numCommandeCaisson}
            numCommandeSousFace={numCommandeSousFace}
            numCommandeTablier={numCommandeTablier}
            numCommandeMoustiquaire={numCommandeMoustiquaire}
            numCommandePrecadre={numCommandePrecadre}
            dateLivraisonPrevisionnelle={dateLivraisonPrevisionnelle}
            dateLivraisonPrevisionnelleISO={dateLivraisonPrevisionnelleISO}
            dossierId={editingDossierId || undefined}
            onOFEmis={onDossiersUpdated}
          />
        );
      })()}

      {/* ========================================================================= */}
      {/* 9. MODAL IMPRESSION ORDRE DE FABRICATION MOUSTIQUAIRES                   */}
      {/* ========================================================================= */}
      {modalOFDebitMSTQOpen && mstqSections.length > 0 && (
        <OrdreFabricationModal
          isOpen={modalOFDebitMSTQOpen}
          onClose={() => setModalOFDebitMSTQOpen(false)}
          famille="MOUSTIQUAIRE"
          titreProduit={`Fiche de Coupe Débit Moustiquaires — ${numCommande}`}
          refCommande={numCommande}
          nomClient={clientDeMonClient}
          dateCommande={dateCommande}
          coloris="G7024"
          sections={mstqSections}
          lignesMoustiquaires={lignesMoustiquaires}
          chutesMaille={chutesMaille}
          paramsMaille={paramsMaille}
          mapping={mapping}
          dateLivraisonPrevisionnelle={dateLivraisonPrevisionnelle}
          dateLivraisonPrevisionnelleISO={dateLivraisonPrevisionnelleISO}
          dossierId={editingDossierId || undefined}
          onOFEmis={onDossiersUpdated}
        />
      )}

      {/* ========================================================================= */}
      {/* 10. MODAL GESTION DES CODIFICATIONS CLIENTS, AGENCES ET REPÈRES          */}
      {/* ========================================================================= */}
      {modalCodificationOpen && (
        <ClientCodificationModal
          isOpen={modalCodificationOpen}
          onClose={() => setModalCodificationOpen(false)}
          codifications={clientCodifications}
          onSaveCodifications={handleSaveCodifications}
          onUpsertCodification={handleUpsertCodification}
          onDeleteCodification={handleDeleteCodification}
        />
      )}

      {/* ========================================================================= */}
      {/* 11. MODAL RÉGLAGES PARAMÈTRES TOILE / MAILLE MOUSTIQUAIRE                */}
      {/* ========================================================================= */}
      <ParametresMailleModal
        isOpen={showParametresMailleModal}
        onClose={() => setShowParametresMailleModal(false)}
        params={paramsMaille}
        onSave={handleSaveParamsMaille}
      />

      {/* ========================================================================= */}
      {/* 12. MODAL VALIDATION DU DÉLAI DE LIVRAISON LORS DE L'ENREGISTREMENT       */}
      {/* ========================================================================= */}
      {showValidationDelaiModal && (
        <ValidationDelaiCommandeModal
          isOpen={showValidationDelaiModal}
          onClose={() => setShowValidationDelaiModal(false)}
          onConfirmSave={async (dateFinaleISO, dateFinaleTexte, estPrio, motifPrio) => {
            await executerSauvegardeDossier(
              statutCiblePourEnregistrement,
              dateFinaleISO,
              dateFinaleTexte,
              estPrio,
              motifPrio
            );
          }}
          refCommande={getActiveNumCommande() || numCommande || 'CMD'}
          nomClient={clientDeMonClient.trim() || 'CLIENT'}
          donneurOrdre={monClient}
          dateCommande={dateCommande}
          estimationGlobale={estimationLivraisonLive}
          isSaving={isSavingDossier}
          isUpdate={!!editingDossierId}
          initialEstPrioritaire={estPrioritaire}
          initialMotifPriorite={motifPriorite}
          initialDateLivraisonISO={delaiFixeManuellement ? (dateLivraisonPrevisionnelleISO || estimationLivraisonLive.dateLivraisonISO) : ''}
        />
      )}
    </div>
  );
};
