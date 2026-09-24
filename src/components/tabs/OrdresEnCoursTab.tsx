import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  SuiviOF,
  LigneRetourOF,
  Article,
  FamilleProduit,
  ChuteItem,
  MappingChutes,
  DossierCommandeGlobal,
  ClientCodification,
  FicheTransfert
} from '../../types';
import { StorageService } from '../../services/storage';
import { DelaisProductionService } from '../../services/delaisProductionService';
import { RetourOFModal } from '../common/RetourOFModal';
import { FicheTransfertModal } from '../common/FicheTransfertModal';
import { ModifierDelaiLivraisonModal } from '../common/ModifierDelaiLivraisonModal';
import { DossierDetailModal } from '../common/DossierDetailModal';
import { ColumnCustomizerPopover } from '../common/ColumnCustomizerPopover';
import { columnConfigService } from '../../services/columnConfigService';
import {
  ClipboardCheck,
  Search,
  Filter,
  RefreshCw,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Trash2,
  FileSpreadsheet,
  Building2,
  Calendar,
  Layers,
  Scissors,
  CheckCircle,
  X,
  Printer,
  SlidersHorizontal,
  ChevronRight,
  ArrowUpDown,
  Edit2,
  Save,
  Tag,
  Sparkles,
  Truck,
  FileCheck,
  FileText,
  RotateCcw,
  Ban,
  Activity,
  Zap,
  Scale,
  FolderOpen,
  Undo2,
  PauseCircle,
  PlayCircle,
  Pause,
  Play
} from 'lucide-react';
import { extraireNumeroSansPrefixe, matchReferences } from '../../services/codificationService';

interface OrdresEnCoursTabProps {
  suivisOF: SuiviOF[];
  onRefreshData: () => void;
  onNavigateToTab?: (tabId: string) => void;
  onLoadDossierInEcosysteme?: (dossier: DossierCommandeGlobal, targetFamille?: FamilleProduit) => void;
  dossiers?: DossierCommandeGlobal[];
  clientCodifications?: ClientCodification[];
  fichesTransfert?: FicheTransfert[];
  articles?: Article[];
  chutesBarres?: Record<string, ChuteItem[]>;
  mapping?: MappingChutes;
}

export const OrdresEnCoursTab: React.FC<OrdresEnCoursTabProps> = ({
  suivisOF = [],
  onRefreshData,
  onNavigateToTab,
  onLoadDossierInEcosysteme,
  dossiers = [],
  clientCodifications = [],
  fichesTransfert = [],
  articles = [],
  chutesBarres = {},
  mapping = {}
}) => {
  const [recherche, setRecherche] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fonction pour replacer le curseur automatiquement sur la barre de recherche
  const focusSearchInput = (clearText = false) => {
    if (clearText) {
      setRecherche('');
    }
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    }, 100);
  };

  // Écouteur global pour focaliser la barre de recherche après clôture ou retour au tableau
  useEffect(() => {
    const handleFocusEvent = () => {
      focusSearchInput(true);
    };

    window.addEventListener('3m-focus-search-of', handleFocusEvent);

    const shouldFocus = sessionStorage.getItem('3m_focus_search_of') === 'true';
    if (shouldFocus) {
      sessionStorage.removeItem('3m_focus_search_of');
      focusSearchInput(true);
    }

    return () => {
      window.removeEventListener('3m-focus-search-of', handleFocusEvent);
    };
  }, []);
  const [filtreStatut, setFiltreStatut] = useState<'TOUS' | 'EMIS' | 'RETOUR_EN_ATTENTE' | 'CLOTURE' | 'LIVRE' | 'EN_PAUSE'>('EMIS');
  const [filtreFamille, setFiltreFamille] = useState<string>('TOUTES');
  const [filtreClient, setFiltreClient] = useState<string>('TOUS');
  const [filtrePrioritaireSeulement, setFiltrePrioritaireSeulement] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Modal Date de Livraison & Priorité OF
  const [ofToEditDelai, setOfToEditDelai] = useState<SuiviOF | null>(null);
  const [isEditDelaiModalOpen, setIsEditDelaiModalOpen] = useState<boolean>(false);

  // Modal Fiche de Transfert
  const [isFicheTransfertModalOpen, setIsFicheTransfertModalOpen] = useState<boolean>(false);
  const [selectedFicheToView, setSelectedFicheToView] = useState<FicheTransfert | null>(null);
  const [selectedOfIdsForTransfer, setSelectedOfIdsForTransfer] = useState<Set<string>>(new Set());
  const [searchFicheTransfert, setSearchFicheTransfert] = useState<string>('');

  const filteredFichesTransfert = useMemo(() => {
    if (!searchFicheTransfert.trim()) return fichesTransfert;
    const q = searchFicheTransfert.trim().toLowerCase();
    return fichesTransfert.filter(fiche => {
      const numMatch = (fiche.numeroFiche || '').toLowerCase().includes(q);
      const clientMatch = (fiche.monClient || '').toLowerCase().includes(q);
      const chauffeurMatch = (fiche.nomChauffeurPrincipal || '').toLowerCase().includes(q);
      const dateMatch = (fiche.dateLivraison || '').toLowerCase().includes(q);
      const matMatch = (fiche.matriculeVehicule || '').toLowerCase().includes(q);
      const lignesMatch = (fiche.lignes || []).some(l =>
        (l.numCommande || '').toLowerCase().includes(q) ||
        (l.clientDeMonClient || '').toLowerCase().includes(q) ||
        (l.designationDetail || '').toLowerCase().includes(q)
      );
      return numMatch || clientMatch || chauffeurMatch || dateMatch || matMatch || lignesMatch;
    });
  }, [fichesTransfert, searchFicheTransfert]);

  // Actualisation automatique à l'ouverture de l'onglet
  useEffect(() => {
    if (onRefreshData) {
      onRefreshData();
    }
  }, [onRefreshData]);

  const [, setColumnsTick] = useState(0);
  useEffect(() => {
    const unsub = columnConfigService.subscribe(() => {
      setColumnsTick(t => t + 1);
    });
    return unsub;
  }, []);

  // Modal Saisie Retour OF
  const [selectedSuiviForRetour, setSelectedSuiviForRetour] = useState<SuiviOF | null>(null);
  const [isRetourModalOpen, setIsRetourModalOpen] = useState<boolean>(false);

  // Modal Détails OF (Visualisation des coupes & lignes)
  const [selectedSuiviForDetails, setSelectedSuiviForDetails] = useState<SuiviOF | null>(null);

  // Modal Visualisation Commande Complète depuis Suivi OF (Demande Utilisateur)
  const [selectedDossierToView, setSelectedDossierToView] = useState<DossierCommandeGlobal | null>(null);
  const [isDossierDetailOpen, setIsDossierDetailOpen] = useState<boolean>(false);

  const matchCmdInDossier = (d: DossierCommandeGlobal, query: string): boolean => {
    if (!query) return false;
    const q = query.toLowerCase().trim();
    const qClean = extraireNumeroSansPrefixe(q, clientCodifications).toLowerCase().trim();

    // 1. refCommande principale
    const ref = (d.refCommande || '').toLowerCase().trim();
    const refClean = extraireNumeroSansPrefixe(ref, clientCodifications).toLowerCase().trim();
    if (ref && (ref === q || ref.includes(q) || q.includes(ref))) return true;
    if (qClean && refClean && (refClean === qClean)) return true;

    // 2. Sous-commandes et commandes confirmées
    const subRefs = [
      d.numCommandeCaisson,
      d.numCommandeSousFace,
      d.numCommandeTablier,
      d.numCommandeMoustiquaire,
      d.numCommandePrecadre,
      ...(d.commandesConfirmees || [])
    ].filter(Boolean) as string[];

    if (subRefs.some(s => {
      const sub = s.toLowerCase().trim();
      const subClean = extraireNumeroSansPrefixe(sub, clientCodifications).toLowerCase().trim();
      return sub === q || q.includes(sub) || sub.includes(q) || (qClean && subClean && subClean === qClean);
    })) return true;

    // 3. Lignes d'articles à l'intérieur du dossier
    const linesRefs = [
      ...(d.articlesCaissons || []).map(c => c.refCommande),
      ...(d.articlesTabliers || []).map(t => t.refCommande),
      ...(d.articlesMoustiquaires || []).map(m => m.refCommande),
      ...(d.articlesPrecadres || []).map(p => p.refCommande)
    ].filter(Boolean) as string[];

    return linesRefs.some(r => {
      const rLower = r.toLowerCase().trim();
      const rClean = extraireNumeroSansPrefixe(rLower, clientCodifications).toLowerCase().trim();
      return rLower === q || q.includes(rLower) || rLower.includes(q) || (qClean && rClean && rClean === qClean);
    });
  };

  const getLinkedDossierForOF = (of: SuiviOF): DossierCommandeGlobal | null => {
    if (!of) return null;
    const ofCmd = (of.numCommande || '').toLowerCase().trim();
    const ofCode = (of.codeOF || '').toLowerCase().trim();

    // 1. Recherche par ID direct
    if (of.dossierId) {
      const found = dossiers.find(d => d.id === of.dossierId);
      if (found) return found;
    }

    // 2. Recherche approfondie par ref, sous-références et lignes
    if (ofCmd || ofCode) {
      const found = dossiers.find(d => matchCmdInDossier(d, ofCmd) || (ofCode && matchCmdInDossier(d, ofCode)));
      if (found) return found;
    }

    // 3. Dossier virtuel riche créé à partir de l'OF s'il n'existe pas dans l'historique complet
    const virtualDossier: DossierCommandeGlobal = {
      id: of.dossierId || `virt-${of.id}`,
      refCommande: of.numCommande || of.codeOF || `OF-${of.id}`,
      nomClientFinal: of.nomClient || 'Client Atelier',
      donneurOrdre: of.donneurOrdre || '',
      dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
      dateLivraisonPrevisionnelle: of.dateLivraisonPrevisionnelle || of.dateLivraison || '',
      statut: of.statut === 'LIVRE' ? 'LIVRE' : of.statut === 'CLOTURE' ? 'CLOTURE' : of.statut === 'RETOUR_EN_ATTENTE' ? 'EN_COURS' : 'EN_ATTENTE',
      estPrioritaire: of.estPrioritaire,
      notes: of.notes || of.titreSection || of.remarqueGlobale || '',
      numCommandeCaisson: of.famille === 'CAISSON' ? of.numCommande : undefined,
      numCommandeTablier: of.famille === 'TABLIER' ? of.numCommande : undefined,
      numCommandeMoustiquaire: of.famille === 'MOUSTIQUAIRE' ? of.numCommande : undefined,
      numCommandePrecadre: of.famille === 'PRECADRE' ? of.numCommande : undefined,
      articlesCaissons: of.famille === 'CAISSON' ? of.lignesRetour.map((l, i) => ({
        id: `c-${i}`,
        repere: l.repere || `C${i + 1}`,
        longueur: l.longueurPrevue || 0,
        quantite: 1,
        articleCode: l.articleCode || '',
        articleDesignation: l.articleDesignation || of.titreSection || 'Caisson',
        typeCaisson: 'TUNNEL_SIMPLE' as const,
        avecSousFace: false,
        montageSousFace: 'NON_MONTEE' as const,
        avecPeinture: false
      })) : [],
      articlesTabliers: of.famille === 'TABLIER' ? of.lignesRetour.map((l, i) => ({
        id: `t-${i}`,
        repere: l.repere || `V${i + 1}`,
        largeur: l.longueurPrevue || 0,
        hauteur: 0,
        hauteur_lame_tablier: 43,
        quantite: 1,
        typeFabrication: 'TABLIER_SEUL' as const,
        avecLameFinale: true,
        articleCode: l.articleCode || '',
        articleDesignation: l.articleDesignation || of.titreSection || 'Lame Tablier'
      })) : [],
      articlesMoustiquaires: of.famille === 'MOUSTIQUAIRE' ? of.lignesRetour.map((l, i) => ({
        id: `m-${i}`,
        repere: l.repere || `M${i + 1}`,
        modele: of.titreSection || 'Standard',
        typeOuverture: 'FENETRE' as const,
        typeFabrication: 'COMPLET' as const,
        avecBarreInferieure: false,
        largeur: l.longueurPrevue || 0,
        hauteur: 0,
        quantite: 1,
        articleCodeCadre: l.articleCode || '',
        articleDesignationCadre: l.articleDesignation || of.titreSection || 'Cadre Moustiquaire'
      })) : [],
      articlesPrecadres: of.famille === 'PRECADRE' ? of.lignesRetour.map((l, i) => ({
        id: `p-${i}`,
        repere: l.repere || `P${i + 1}`,
        largeur: l.longueurPrevue || 0,
        hauteur: 0,
        quantite: 1,
        figure: 'VIDE' as const,
        modeDebordement: 'SANS_DEBORDEMENT' as const,
        debordementSuperieur: 0,
        debordementInferieur: 0,
        articleCode: l.articleCode || '',
        articleDesignation: l.articleDesignation || of.titreSection || 'Précadre'
      })) : []
    };
    return virtualDossier;
  };

  const handleChargerDossierDansEcosysteme = async (of: SuiviOF) => {
    let dossier: DossierCommandeGlobal | null = null;

    // 1. Chercher d'abord dans SQLite directement (source de vérité la plus fraîche et complète)
    try {
      const freshDossiers = await StorageService.getDossiers();
      if (freshDossiers && freshDossiers.length > 0) {
        // Recherche prioritaire par ID de dossier lié
        if (of.dossierId) {
          dossier = freshDossiers.find(d => d.id === of.dossierId) || null;
        }
        // Recherche par référence de commande ou code OF
        if (!dossier) {
          const ofCmd = (of.numCommande || '').toLowerCase().trim();
          const ofCode = (of.codeOF || '').toLowerCase().trim();
          dossier = freshDossiers.find(d => 
            matchCmdInDossier(d, ofCmd) || (ofCode && matchCmdInDossier(d, ofCode))
          ) || null;
        }
        // Recherche par concordance client final
        if (!dossier && of.nomClient) {
          const clientNorm = of.nomClient.toLowerCase().trim();
          dossier = freshDossiers.find(d => 
            d.nomClientFinal && d.nomClientFinal.toLowerCase().trim() === clientNorm
          ) || null;
        }
      }
    } catch (e) {
      console.warn('Erreur chargement SQLite direct pour reprise dossier:', e);
    }

    // 2. Si pas trouvé dans SQLite frais, chercher dans la prop dossiers
    if (!dossier) {
      if (of.dossierId) {
        dossier = dossiers.find(d => d.id === of.dossierId) || null;
      }
      if (!dossier) {
        const ofCmd = (of.numCommande || '').toLowerCase().trim();
        const ofCode = (of.codeOF || '').toLowerCase().trim();
        dossier = dossiers.find(d => matchCmdInDossier(d, ofCmd) || (ofCode && matchCmdInDossier(d, ofCode))) || null;
      }
    }

    // 3. Si toujours introuvable, créer un dossier virtuel complet
    if (!dossier) {
      dossier = getLinkedDossierForOF(of);
    }

    if (dossier) {
      // Écrire systématiquement dans le localStorage bridge pour sécuriser la transmission inter-onglets
      try {
        localStorage.setItem('3m_dossier_to_load', JSON.stringify({
          dossier,
          targetFamille: of.famille,
          targetNumCmd: of.numCommande
        }));
      } catch (err) {
        console.warn('Erreur localStorage bridge:', err);
      }

      if (onLoadDossierInEcosysteme) {
        onLoadDossierInEcosysteme(dossier, of.famille);
      } else if (onNavigateToTab) {
        onNavigateToTab('ecosysteme');
      }
    } else if (onNavigateToTab) {
      onNavigateToTab('ecosysteme');
    }
  };

  const handleVisualiserCommande = (of: SuiviOF) => {
    const dossier = getLinkedDossierForOF(of);
    if (dossier) {
      setSelectedDossierToView(dossier);
      setIsDossierDetailOpen(true);
    }
  };

  // Modal / Dialogue Modification Rapide Référence OF
  const [editingOF, setEditingOF] = useState<SuiviOF | null>(null);
  const [editFormNumCmd, setEditFormNumCmd] = useState<string>('');
  const [editFormClient, setEditFormClient] = useState<string>('');
  const [editFormDonneur, setEditFormDonneur] = useState<string>('');
  const [editFormTitre, setEditFormTitre] = useState<string>('');
  const [editFormFamille, setEditFormFamille] = useState<FamilleProduit>('TABLIER');
  const [isReparing, setIsReparing] = useState<boolean>(false);
  const [reparationFeedback, setReparationFeedback] = useState<string | null>(null);

  // Détection / Réparation automatique au montage pour corriger immédiatement toute mauvaise classification
  useEffect(() => {
    let isMounted = true;
    StorageService.reparerFamillesOF().then(res => {
      if (isMounted && res.repares > 0) {
        onRefreshData();
      }
    });
    return () => { isMounted = false; };
  }, []);

  const handleReparerFamilles = async () => {
    setIsReparing(true);
    setReparationFeedback(null);
    try {
      const res = await StorageService.reparerFamillesOF();
      const resSync = await StorageService.synchroniserStatutsDossiers();
      onRefreshData();
      if (res.repares > 0 || (resSync.misAJour && resSync.misAJour > 0)) {
        setReparationFeedback(`✅ ${res.repares} OF réassigné(s) à leur vraie famille et ${resSync.misAJour || 0} statut(s) de commande synchronisé(s) !`);
      } else {
        setReparationFeedback('✨ Toutes vos commandes et familles sont déjà parfaitement synchronisées.');
      }
    } catch (err) {
      setReparationFeedback('Erreur lors de la synchronisation des familles.');
    } finally {
      setIsReparing(false);
      setTimeout(() => setReparationFeedback(null), 5000);
    }
  };

  const handleOpenEditOF = (of: SuiviOF) => {
    setEditingOF(of);
    setEditFormNumCmd(of.numCommande || '');
    setEditFormClient(of.nomClient || '');
    setEditFormDonneur(of.donneurOrdre || '');
    setEditFormTitre(of.titreSection || '');
    setEditFormFamille(of.famille || 'TABLIER');
  };

  const handleSaveEditOF = async () => {
    if (!editingOF) return;
    const updated: SuiviOF = {
      ...editingOF,
      numCommande: editFormNumCmd.trim() || editingOF.numCommande,
      nomClient: editFormClient.trim() || editingOF.nomClient,
      donneurOrdre: editFormDonneur.trim(),
      titreSection: editFormTitre.trim() || editingOF.titreSection,
      famille: editFormFamille
    };
    await StorageService.upsertSuiviOF(updated);
    setEditingOF(null);
    onRefreshData();
  };

  // Tri de la table
  type SortKey = 'numeroEmission' | 'dateEmission' | 'numCommande' | 'nomClient' | 'statut' | 'famille' | 'dateLivraison' | 'pieces';
  const [sortKey, setSortKey] = useState<SortKey>('statut');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Liste unique des clients pour le filtre
  const listeClients = useMemo(() => {
    const setClients = new Set<string>();
    suivisOF.forEach(of => {
      if (of.nomClient && of.nomClient.trim()) {
        setClients.add(of.nomClient.trim());
      }
    });
    return Array.from(setClients).sort((a, b) => a.localeCompare(b));
  }, [suivisOF]);

  // Filtrage et Tri (Recherche unifiée avec l'Historique, y compris par REPÈRE de pièce)
  const filteredAndSortedOFs = useMemo(() => {
    return suivisOF
      .filter(of => {
        // Filtre Statut
        if (filtreStatut !== 'TOUS') {
          if (filtreStatut === 'EN_PAUSE') {
            if (of.statut !== 'EN_PAUSE' && !of.estEnPause) return false;
          } else if (filtreStatut === 'EMIS') {
            if (of.statut !== 'EMIS' || of.estEnPause) return false;
          } else {
            if (of.statut !== filtreStatut) return false;
          }
        }
        // Filtre Famille
        if (filtreFamille !== 'TOUTES' && of.famille !== filtreFamille) return false;
        // Filtre Client
        if (filtreClient !== 'TOUS' && (of.nomClient || '').trim() !== filtreClient) return false;
        // Filtre Commande Prioritaire
        if (filtrePrioritaireSeulement && !of.estPrioritaire) return false;
        // Filtre Recherche texte unifié (N° Commande, Client, Titre, Donneur d'ordre, Notes, mais aussi REPÈRES DE PIÈCES!)
        if (recherche.trim()) {
          const q = recherche.toLowerCase().trim();
          const matchNum = (of.numCommande || '').toLowerCase().includes(q);
          const matchCode = (of.codeOF || '').toLowerCase().includes(q) || String(of.numeroEmission || '').includes(q);
          const matchClient = (of.nomClient || '').toLowerCase().includes(q);
          const matchTitre = (of.titreSection || '').toLowerCase().includes(q);
          const matchDonneur = (of.donneurOrdre || '').toLowerCase().includes(q);
          const matchFamille = (of.famille || '').toLowerCase().includes(q);
          const matchNotes = (of.notes || '').toLowerCase().includes(q);

          // Recherche dans les lignes de l'OF (article, désignation, repère, remarque)
          const matchLignes = (of.lignesRetour || []).some(l =>
            (l.articleCode || '').toLowerCase().includes(q) ||
            (l.articleDesignation || '').toLowerCase().includes(q) ||
            (l.repere || '').toLowerCase().includes(q) ||
            (l.piecesInfoStr || '').toLowerCase().includes(q) ||
            (l.remarque || '').toLowerCase().includes(q)
          );

          // Recherche dans le dossier associé (y compris par REPÈRES de pièces CF1, DF2, etc.)
          const linkedDossier = getLinkedDossierForOF(of);
          let matchDossierRepere = false;
          let matchDossierMeta = false;

          if (linkedDossier) {
            matchDossierMeta =
              (linkedDossier.refCommande || '').toLowerCase().includes(q) ||
              (linkedDossier.nomClientFinal || '').toLowerCase().includes(q) ||
              (linkedDossier.donneurOrdre || '').toLowerCase().includes(q) ||
              ((linkedDossier.notes || '').toLowerCase().includes(q));

            const matchRepereCaisson = (linkedDossier.articlesCaissons || []).some(c =>
              (c.repere || '').toLowerCase().includes(q) ||
              (c.articleDesignation || c.sfArticleDesignation || '').toLowerCase().includes(q)
            );
            const matchRepereTablier = (linkedDossier.articlesTabliers || []).some(t =>
              (t.repere || '').toLowerCase().includes(q)
            );
            const matchRepereMstq = (linkedDossier.articlesMoustiquaires || []).some(m =>
              (m.repere || '').toLowerCase().includes(q)
            );
            const matchReperePrecadre = (linkedDossier.articlesPrecadres || []).some(p =>
              (p.repere || '').toLowerCase().includes(q)
            );

            matchDossierRepere = matchRepereCaisson || matchRepereTablier || matchRepereMstq || matchReperePrecadre;
          }

          if (!matchNum && !matchCode && !matchClient && !matchTitre && !matchDonneur && !matchFamille && !matchNotes && !matchLignes && !matchDossierMeta && !matchDossierRepere) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        // RÈGLE : Les commandes prioritaires (INSTANTANÉ) sont classées au-devant des autres
        const isAInstant = a.typePriorite === 'INSTANTANE' || a.estPrioritaire;
        const isBInstant = b.typePriorite === 'INSTANTANE' || b.estPrioritaire;
        if (isAInstant && !isBInstant) return -1;
        if (!isAInstant && isBInstant) return 1;

        if (sortKey === 'statut') {
          // Tri par statut : EN_PAUSE puis EMIS (en cours) au tout début !
          const STATUT_RANKS: Record<string, number> = {
            'EN_PAUSE': 0,
            'EMIS': 1,
            'RETOUR_EN_ATTENTE': 2,
            'CLOTURE': 3,
            'LIVRE': 4,
            'ANNULE': 5
          };
          const rankA = a.estEnPause || a.statut === 'EN_PAUSE' ? 0 : (STATUT_RANKS[a.statut] || 99);
          const rankB = b.estEnPause || b.statut === 'EN_PAUSE' ? 0 : (STATUT_RANKS[b.statut] || 99);
          if (rankA !== rankB) {
            return sortDir === 'asc' ? rankA - rankB : rankB - rankA;
          }

          // RÈGLE ATELIER : Pour les ordres en cours actifs (Pause, Émis, Attente) :
          // 1. Date de livraison la plus proche (urgences et tournées du jour d'abord)
          // 2. Petites quantités d'abord (1, 2, 3 pcs pour libérer rapidement les clients)
          // 3. FIFO de secours
          if (rankA <= 2) {
            const isoA = a.dateLivraisonPrevisionnelleISO || (a.dateLivraisonPrevisionnelle ? DelaisProductionService.toISODateString(DelaisProductionService.parseDateString(a.dateLivraisonPrevisionnelle)) : '') || '';
            const isoB = b.dateLivraisonPrevisionnelleISO || (b.dateLivraisonPrevisionnelle ? DelaisProductionService.toISODateString(DelaisProductionService.parseDateString(b.dateLivraisonPrevisionnelle)) : '') || '';
            if (isoA && isoB && isoA !== isoB) {
              return isoA.localeCompare(isoB);
            }
            if (isoA && !isoB) return -1;
            if (!isoA && isoB) return 1;

            const qA = DelaisProductionService.compterPiecesOF(a, dossiers);
            const qB = DelaisProductionService.compterPiecesOF(b, dossiers);
            if (qA !== qB) {
              return qA - qB;
            }

            const na = a.numeroEmission || 0;
            const nb = b.numeroEmission || 0;
            return na - nb;
          }

          // Si statuts terminés (CLOTURE, LIVRE) : affichage du plus récent au plus ancien
          const na = a.numeroEmission || 0;
          const nb = b.numeroEmission || 0;
          return nb - na;
        }

        if (sortKey === 'dateLivraison') {
          const isoA = a.dateLivraisonPrevisionnelleISO || (a.dateLivraisonPrevisionnelle ? DelaisProductionService.toISODateString(DelaisProductionService.parseDateString(a.dateLivraisonPrevisionnelle)) : '') || '';
          const isoB = b.dateLivraisonPrevisionnelleISO || (b.dateLivraisonPrevisionnelle ? DelaisProductionService.toISODateString(DelaisProductionService.parseDateString(b.dateLivraisonPrevisionnelle)) : '') || '';
          if (isoA !== isoB) {
            if (!isoA) return 1;
            if (!isoB) return -1;
            return sortDir === 'asc' ? isoA.localeCompare(isoB) : isoB.localeCompare(isoA);
          }
          // Pour la même date de livraison : petites quantités d'abord !
          const qA = DelaisProductionService.compterPiecesOF(a, dossiers);
          const qB = DelaisProductionService.compterPiecesOF(b, dossiers);
          if (qA !== qB) {
            return sortDir === 'asc' ? qA - qB : qB - qA;
          }
          return 0;
        }

        if (sortKey === 'pieces') {
          const qA = DelaisProductionService.compterPiecesOF(a, dossiers);
          const qB = DelaisProductionService.compterPiecesOF(b, dossiers);
          if (qA !== qB) {
            return sortDir === 'asc' ? qA - qB : qB - qA;
          }
          return 0;
        }

        if (sortKey === 'numeroEmission') {
          const na = a.numeroEmission || 0;
          const nb = b.numeroEmission || 0;
          return sortDir === 'asc' ? na - nb : nb - na;
        }
        const va = (a as any)[sortKey] || '';
        const vb = (b as any)[sortKey] || '';
        return sortDir === 'asc'
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
  }, [suivisOF, filtreStatut, filtreFamille, filtreClient, filtrePrioritaireSeulement, recherche, sortKey, sortDir, dossiers]);

  // Pagination calculée
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedOFs.length / (pageSize === -1 ? filteredAndSortedOFs.length || 1 : pageSize)));
  const displayedOFs = useMemo(() => {
    if (pageSize === -1) return filteredAndSortedOFs;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedOFs.slice(start, start + pageSize);
  }, [filteredAndSortedOFs, currentPage, pageSize]);

  // Réinitialiser la page quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [recherche, filtreStatut, filtreFamille, filtreClient, filtrePrioritaireSeulement, pageSize]);

  // Statistiques globales
  const stats = useMemo(() => {
    const total = suivisOF.length;
    const enPause = suivisOF.filter(o => o.statut === 'EN_PAUSE' || o.estEnPause).length;
    const emis = suivisOF.filter(o => o.statut === 'EMIS' && !o.estEnPause).length;
    const retourEnAttente = suivisOF.filter(o => o.statut === 'RETOUR_EN_ATTENTE').length;
    const clotures = suivisOF.filter(o => o.statut === 'CLOTURE').length;
    const livres = suivisOF.filter(o => o.statut === 'LIVRE').length;
    const totalBarresNeuves = suivisOF.reduce((acc, o) => acc + (o.totalBarresNeuvesPrevu || 0), 0);
    const totalChutesRecyclees = suivisOF.reduce((acc, o) => acc + (o.totalChutesUtiliseesPrevu || 0), 0);

    const emisCaissons = suivisOF.filter(o => o.famille === 'CAISSON' && (o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE')).length;
    const emisTabliers = suivisOF.filter(o => o.famille === 'TABLIER' && (o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE')).length;
    const emisMstq = suivisOF.filter(o => o.famille === 'MOUSTIQUAIRE' && (o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE')).length;
    const emisPrecadres = suivisOF.filter(o => o.famille === 'PRECADRE' && (o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE')).length;

    return {
      total, enPause, emis, retourEnAttente, clotures, livres, totalBarresNeuves, totalChutesRecyclees,
      emisCaissons, emisTabliers, emisMstq, emisPrecadres
    };
  }, [suivisOF]);

  const handleTogglePauseOF = async (of: SuiviOF) => {
    const isCurrentlyPaused = of.statut === 'EN_PAUSE' || Boolean(of.estEnPause);
    const newPauseState = !isCurrentlyPaused;
    const nowIso = new Date().toISOString();

    const updatedOF: SuiviOF = {
      ...of,
      statut: newPauseState ? 'EN_PAUSE' : 'EMIS',
      estEnPause: newPauseState,
      datePause: newPauseState ? (of.datePause || nowIso) : undefined,
      motifPause: newPauseState ? (of.motifPause || 'Rupture matière / Pause atelier') : undefined
    };

    try {
      await StorageService.upsertSuiviOF(updatedOF);

      // Synchroniser le dossier parent dans SQLite
      try {
        const allDossiers = await StorageService.getDossiers();
        const targetDossier = (of.dossierId ? allDossiers.find(d => d.id === of.dossierId) : null) ||
          allDossiers.find(d => {
            const c = (of.numCommande || '').trim().toLowerCase();
            if (!c) return false;
            return [d.refCommande, d.numCommandeCaisson, d.numCommandeTablier, d.numCommandeMoustiquaire, d.numCommandePrecadre]
              .filter(Boolean)
              .some(r => r!.trim().toLowerCase() === c || (r!.length >= 3 && (r!.toLowerCase().includes(c) || c.includes(r!.toLowerCase()))));
          });

        if (targetDossier) {
          if (newPauseState) {
            targetDossier.statut = 'EN_PAUSE';
            targetDossier.estEnPause = true;
            targetDossier.datePause = nowIso;
            targetDossier.motifPause = updatedOF.motifPause;
          } else {
            const allOfs = await StorageService.getSuivisOF();
            const otherPaused = allOfs.some(o => o.id !== of.id && (o.dossierId === targetDossier.id || o.numCommande === of.numCommande) && (o.statut === 'EN_PAUSE' || o.estEnPause));
            if (!otherPaused) {
              targetDossier.statut = 'EN_COURS';
              targetDossier.estEnPause = false;
              targetDossier.datePause = undefined;
            }
          }
          await StorageService.saveDossiers(allDossiers);
        }
      } catch (errDossier) {
        console.warn('Sync dossier non bloquante lors de la pause:', errDossier);
      }

      onRefreshData();
      setReparationFeedback(
        newPauseState
          ? `⏸️ L'ordre ${of.codeOF || of.numCommande} a été mis en pause.`
          : `▶️ L'ordre ${of.codeOF || of.numCommande} a repris sa fabrication active.`
      );
      setTimeout(() => setReparationFeedback(null), 4000);
    } catch (err) {
      console.error('Erreur mise en pause OF:', err);
      alert('Erreur lors du changement de statut de pause');
    }
  };

  const handleMarquerRetourRecu = async (of: SuiviOF) => {
    const updated: SuiviOF = { ...of, statut: 'RETOUR_EN_ATTENTE' };
    await StorageService.upsertSuiviOF(updated);
    onRefreshData();
  };

  const handleRollbackCloture = async (of: SuiviOF) => {
    if (confirm(`Voulez-vous annuler la clôture de l'OF N° "${of.numCommande}" (${of.nomClient}) ?\n\nLe stock physique et les chutes consommées seront immédiatement restaurés dans l'inventaire, et l'OF repassera en "Retour Reçu" pour correction.`)) {
      try {
        await StorageService.rollbackClotureOF(of.id);
        onRefreshData();
      } catch (err: any) {
        alert("Erreur lors de l'annulation de la clôture : " + (err.message || err));
      }
    }
  };

  const debloquerDossierApresAnnulation = async (of: SuiviOF) => {
    try {
      const freshDossiers = await StorageService.getDossiers();
      const allOfs = await StorageService.getSuivisOF();
      const rawCmd = (of.numCommande || '').trim();
      let modifDossier = false;

      const updatedDossiers = freshDossiers.map(d => {
        const isMatch = (of.dossierId && d.id === of.dossierId) ||
          matchReferences(d.refCommande, rawCmd) ||
          matchReferences(d.numCommandeCaisson, rawCmd) ||
          matchReferences(d.numCommandeSousFace, rawCmd) ||
          matchReferences(d.numCommandeTablier, rawCmd) ||
          matchReferences(d.numCommandeMoustiquaire, rawCmd) ||
          matchReferences(d.numCommandePrecadre, rawCmd) ||
          matchCmdInDossier(d, rawCmd);

        if (isMatch) {
          modifDossier = true;
          const remainingActiveOfs = allOfs.filter(o => {
            if (o.id === of.id || o.statut === 'ANNULE') return false;
            if (o.dossierId && o.dossierId === d.id) return true;
            return matchReferences(o.numCommande, d.refCommande);
          });

          const currentConfirmees = d.commandesConfirmees || [];
          const newConfirmees = currentConfirmees.filter(c => !matchReferences(c, rawCmd));
          const newStatut = (remainingActiveOfs.length === 0 && newConfirmees.length === 0 && !d.estEnPause && d.statut !== 'EN_PAUSE')
            ? ('EN_ATTENTE' as const)
            : d.statut;

          return {
            ...d,
            statut: newStatut,
            commandesConfirmees: newConfirmees
          };
        }
        return d;
      });

      if (modifDossier) {
        await StorageService.saveDossiers(updatedDossiers);
      }
    } catch (errD) {
      console.warn('Erreur déblocage dossier associé:', errD);
    }
  };

  const handleAnnulerOF = async (of: SuiviOF) => {
    if (confirm(`Voulez-vous marquer comme ANNULÉ l'OF N° "${of.numCommande}" (${of.nomClient}) ?\n\nToutes les réservations (barres et chutes) seront immédiatement libérées sans altérer les stocks physiques et la commande repassera en attente.`)) {
      try {
        await StorageService.annulerOF(of.id);
        await debloquerDossierApresAnnulation(of);
        onRefreshData();
      } catch (err: any) {
        alert("Erreur lors de l'annulation de l'OF : " + (err.message || err));
      }
    }
  };

  // Annulation de l'émission : dans Ordres en Cours, la commande ne peut pas être supprimée sèchement,
  // mais son émission est annulée pour permettre la mise à jour et libérer immédiatement toutes les réservations
  const handleAnnulerEmissionOF = async (of: SuiviOF) => {
    const isClosed = of.statut === 'CLOTURE' || of.statut === 'LIVRE';
    const message = isClosed
      ? `Voulez-vous vraiment annuler l'émission de l'OF N° "${of.numCommande}" (${of.nomClient}) ?\n\n⚠️ IMPORTANT : Cet OF est déjà clôturé/livré. Le stock sera fidèlement restauré (restitution des barres et chutes consommées), ses réservations seront annulées, et la commande sera ré-ouverte pour mise à jour dans l'Écosystème.`
      : `Voulez-vous annuler l'émission de l'OF N° "${of.numCommande}" (${of.nomClient}) pour mise à jour ?\n\n✓ Toutes les réservations de barres et de chutes associées seront libérées.\n✓ La commande repassera en attente et sera déverrouillée pour permettre sa modification dans l'Écosystème.`;

    if (confirm(message)) {
      try {
        // 1. Supprimer le suivi de l'OF (libère automatiquement toutes les réservations de stock et de chutes)
        await StorageService.deleteSuiviOF(of.id);

        // 2. Débloquer la commande correspondante dans le dossier global (retirer de commandesConfirmees et passer en attente)
        await debloquerDossierApresAnnulation(of);

        onRefreshData();
      } catch (err: any) {
        alert("Erreur lors de l'annulation de l'émission : " + (err.message || err));
      }
    }
  };

  const SortHeader = ({ col, label, className = '' }: { col: SortKey; label: string; className?: string }) => (
    <th
      onClick={() => handleSort(col)}
      className={`py-3 px-3.5 text-left text-xs font-semibold text-slate-300 cursor-pointer select-none transition hover:bg-slate-800 hover:text-amber-300 ${
        sortKey === col ? 'text-amber-300 bg-slate-800/60' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        <ArrowUpDown className={`w-3.5 h-3.5 ${sortKey === col ? 'text-amber-400 opacity-100' : 'opacity-40'}`} />
      </div>
    </th>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Entête & Titre ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                Ordres de Fabrication en Cours (Suivi OF)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-950 border border-blue-800 text-blue-300 text-xs font-mono font-bold">
                {stats.emis + stats.retourEnAttente} en cours
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Suivi en temps réel des ordres de fabrication émis, saisie des retours atelier et réintégration des chutes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('monitoring')}
              className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-emerald-500/40 shadow-sm transition cursor-pointer"
              title="Ouvrir le tableau de bord de monitoring (Stats Caissons 25/30/40, Tabliers 43/55 et délais)"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>📊 Monitoring Atelier</span>
            </button>
          )}

          {/* Bouton Créer Fiche de Transfert */}
          <button
            onClick={() => {
              setSelectedFicheToView(null);
              setIsFicheTransfertModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Créer Fiche de Transfert</span>
          </button>

          <button
            onClick={onRefreshData}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-slate-700 transition cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* ── KPIs & Compteurs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 sm:gap-3">
        <div
          onClick={() => setFiltreStatut('TOUS')}
          className={`p-3 sm:p-3.5 rounded-xl border transition cursor-pointer ${
            filtreStatut === 'TOUS'
              ? 'bg-slate-800/90 border-slate-600 shadow-md ring-1 ring-slate-500'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Ordres (OF)</span>
            <ClipboardCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-100 font-mono mt-1">{stats.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Toutes fiches</div>
        </div>

        <div
          onClick={() => setFiltreStatut('EN_PAUSE')}
          className={`p-3 sm:p-3.5 rounded-xl border transition cursor-pointer ${
            filtreStatut === 'EN_PAUSE'
              ? 'bg-rose-950/80 border-rose-500 shadow-md ring-1 ring-rose-500'
              : 'bg-slate-900 border-slate-800 hover:border-rose-900/60'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-400 font-medium">
            <span>⏸️ En Pause</span>
            <PauseCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono mt-1">{stats.enPause}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Arrêt atelier / Matière</div>
        </div>

        <div
          onClick={() => setFiltreStatut('EMIS')}
          className={`p-3 sm:p-3.5 rounded-xl border transition cursor-pointer ${
            filtreStatut === 'EMIS'
              ? 'bg-blue-950/70 border-blue-500 shadow-md ring-1 ring-blue-500'
              : 'bg-slate-900 border-slate-800 hover:border-blue-900/60'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-blue-400 font-medium">
            <span>📤 Émis (Atelier)</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-400 font-mono mt-1">{stats.emis}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">En cours de découpe</div>
        </div>

        <div
          onClick={() => setFiltreStatut('RETOUR_EN_ATTENTE')}
          className={`p-3 sm:p-3.5 rounded-xl border transition cursor-pointer ${
            filtreStatut === 'RETOUR_EN_ATTENTE'
              ? 'bg-amber-950/70 border-amber-500 shadow-md ring-1 ring-amber-500'
              : 'bg-slate-900 border-slate-800 hover:border-amber-900/60'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-400 font-medium">
            <span>📋 Retour Reçu</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-1">{stats.retourEnAttente}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">À corriger &amp; clôturer</div>
        </div>

        <div
          onClick={() => setFiltreStatut('CLOTURE')}
          className={`p-3 sm:p-3.5 rounded-xl border transition cursor-pointer ${
            filtreStatut === 'CLOTURE'
              ? 'bg-emerald-950/70 border-emerald-500 shadow-md ring-1 ring-emerald-500'
              : 'bg-slate-900 border-slate-800 hover:border-emerald-900/60'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
            <span>✅ Clôturés</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1">{stats.clotures}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Prêts pour transfert</div>
        </div>

        <div
          onClick={() => {
            setSelectedFicheToView(null);
            setIsFicheTransfertModalOpen(true);
          }}
          className="p-3 sm:p-3.5 rounded-xl border bg-amber-950/40 border-amber-500/40 hover:border-amber-400 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-amber-400 font-bold">
            <span>🚚 Fiches Transfert</span>
            <Truck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-1">{fichesTransfert.length}</div>
          <div className="text-[11px] text-amber-400/80 mt-0.5">Bons de livraison client</div>
        </div>
      </div>

      {/* ── Filtres & Barre de Recherche ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
          {/* Recherche */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Rechercher par Repère de pièce (ex: CF1, DF2...), N° commande, Client, N° OF..."
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-medium"
            />
            {recherche && (
              <button
                onClick={() => setRecherche('')}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtre Famille */}
          <select
            value={filtreFamille}
            onChange={e => setFiltreFamille(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-blue-500"
          >
            <option value="TOUTES">Toutes les Familles ({stats.emis + stats.retourEnAttente})</option>
            <option value="CAISSON">Caisson ({stats.emisCaissons})</option>
            <option value="TABLIER">Tablier ({stats.emisTabliers})</option>
            <option value="MOUSTIQUAIRE">Moustiquaire ({stats.emisMstq})</option>
            <option value="PRECADRE">Précadre ({stats.emisPrecadres})</option>
          </select>

          {/* Filtre Client */}
          {listeClients.length > 0 && (
            <select
              value={filtreClient}
              onChange={e => setFiltreClient(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-blue-500 max-w-[150px] truncate"
              title="Filtrer par client"
            >
              <option value="TOUS">Tous les Clients</option>
              {listeClients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Bouton Réparation / Synchronisation Familles */}
          <button
            onClick={handleReparerFamilles}
            disabled={isReparing}
            title="Analyser les articles et rétablir automatiquement la vraie famille (Tablier, Moustiquaire, Précadre) pour chaque OF"
            className="px-2.5 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/50 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${isReparing ? 'animate-spin' : ''}`} />
            <span>{isReparing ? 'Analyse...' : 'Corriger Familles'}</span>
          </button>
        </div>

        {/* Boutons rapides Statut */}
        <div className="flex items-center gap-1 flex-wrap">
          {(['TOUS', 'EN_PAUSE', 'EMIS', 'RETOUR_EN_ATTENTE', 'CLOTURE', 'LIVRE'] as const).map(st => (
            <button
              key={st}
              onClick={() => setFiltreStatut(st)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition border cursor-pointer ${
                filtreStatut === st
                  ? st === 'EN_PAUSE'
                    ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                    : st === 'EMIS'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : st === 'RETOUR_EN_ATTENTE'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : st === 'CLOTURE'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : st === 'LIVRE'
                    ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                    : 'bg-slate-700 text-white border-slate-600'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
              }`}
            >
              {st === 'TOUS' ? 'Tous' : st === 'EN_PAUSE' ? '⏸️ En pause' : st === 'EMIS' ? '📤 Émis' : st === 'RETOUR_EN_ATTENTE' ? '📋 Retour reçu' : st === 'CLOTURE' ? '✅ Clôturés' : '🚚 Livrés'}
              <span className="ml-1 text-[10px] font-mono">
                ({suivisOF.filter(o => {
                  if (st === 'TOUS') return true;
                  if (st === 'EN_PAUSE') return o.statut === 'EN_PAUSE' || o.estEnPause;
                  if (st === 'EMIS') return o.statut === 'EMIS' && !o.estEnPause;
                  return o.statut === st;
                }).length})
              </span>
            </button>
          ))}

          {/* Bouton Filtre Commandes Prioritaires */}
          <button
            onClick={() => setFiltrePrioritaireSeulement(!filtrePrioritaireSeulement)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition border cursor-pointer flex items-center gap-1 ${
              filtrePrioritaireSeulement
                ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-rose-300 hover:border-rose-500/40'
            }`}
            title="Filtrer uniquement les commandes prioritaires / urgentes"
          >
            <Zap className={`w-3 h-3 ${filtrePrioritaireSeulement ? 'fill-white text-white' : 'text-rose-400'}`} />
            <span>Prioritaires</span>
            {suivisOF.filter(o => o.estPrioritaire).length > 0 && (
              <span className={`ml-1 text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full ${
                filtrePrioritaireSeulement ? 'bg-white text-rose-600' : 'bg-rose-500/20 text-rose-300'
              }`}>
                {suivisOF.filter(o => o.estPrioritaire).length}
              </span>
            )}
          </button>

          <ColumnCustomizerPopover tableId="of_encours" />
        </div>
      </div>

      {/* ── Message / Bannière de Réparation Feedback ── */}
      {reparationFeedback && (
        <div className="bg-indigo-950/70 border border-indigo-700/60 rounded-xl px-4 py-2.5 text-xs text-indigo-200 flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="font-medium">{reparationFeedback}</span>
          </div>
          <button
            onClick={() => setReparationFeedback(null)}
            className="text-indigo-400 hover:text-white text-xs font-bold"
          >
            Fermer
          </button>
        </div>
      )}

      {/* ── Bannière de Sélection Multiple pour Fiche de Transfert ── */}
      {selectedOfIdsForTransfer.size > 0 && (
        <div className="bg-amber-500/15 border-2 border-amber-500/50 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-amber-300">
                {selectedOfIdsForTransfer.size} Ordre(s) de Fabrication sélectionné(s) pour expédition
              </div>
              <div className="text-xs text-slate-400">
                Générez le bon de livraison et la fiche de transfert groupée pour ces commandes.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedOfIdsForTransfer(new Set())}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              Annuler sélection
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedFicheToView(null);
                setIsFicheTransfertModalOpen(true);
              }}
              className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-lg shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95"
            >
              <Truck className="w-4 h-4" />
              <span>Créer Fiche de Transfert ({selectedOfIdsForTransfer.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Bandeau Règle de Priorité Atelier ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-300 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[11px] uppercase tracking-wide">
            📋 Règle Atelier
          </span>
          <span className="text-slate-300 text-xs">
            Ordres organisés par : <strong className="text-amber-300">Date de livraison convenue</strong> ➔ <strong className="text-rose-300">Priorités ⚡</strong> ➔ <strong className="text-emerald-300">Petites quantités d'abord (1, 2, 3 pcs)</strong> pour libérer rapidement les clients.
          </span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono hidden lg:block">
          {stats.emis + stats.retourEnAttente} ordres actifs en atelier
        </div>
      </div>

      {/* ── Table Principale des Ordres de Fabrication ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="w-10 px-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={
                      displayedOFs.length > 0 &&
                      displayedOFs.every(o => selectedOfIdsForTransfer.has(o.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        const next = new Set(selectedOfIdsForTransfer);
                        displayedOFs.forEach(o => next.add(o.id));
                        setSelectedOfIdsForTransfer(next);
                      } else {
                        const next = new Set(selectedOfIdsForTransfer);
                        displayedOFs.forEach(o => next.delete(o.id));
                        setSelectedOfIdsForTransfer(next);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                    title="Tout cocher / Tout décocher pour expédition"
                  />
                </th>
                {columnConfigService.isColumnVisible('of_encours', 'id_of') && (
                  <SortHeader col="numeroEmission" label="N° OF" className="w-24 text-center px-2" />
                )}
                {columnConfigService.isColumnVisible('of_encours', 'dossier') && (
                  <SortHeader col="numCommande" label="N° Commande" className="w-32 px-2.5" />
                )}
                {columnConfigService.isColumnVisible('of_encours', 'agence') && (
                  <SortHeader col="nomClient" label="Client / Donneur d'Ordre" className="px-3 min-w-[150px]" />
                )}
                {columnConfigService.isColumnVisible('of_encours', 'produit') && (
                  <SortHeader col="pieces" label="Famille & Nbr de Pièces (Pcs)" className="px-3 min-w-[170px]" />
                )}
                {columnConfigService.isColumnVisible('of_encours', 'date') && (
                  <SortHeader col="dateEmission" label="Date Émission" className="w-28 px-2 text-center" />
                )}
                {columnConfigService.isColumnVisible('of_encours', 'delai') && (
                  <SortHeader col="dateLivraison" label="Date Livraison (Fixée)" className="w-36 px-2 text-center" />
                )}
                {columnConfigService.isColumnVisible('of_encours', 'profils') && (
                  <th className="py-2.5 px-2 text-center w-28">Barres &amp; Chutes</th>
                )}
                {columnConfigService.isColumnVisible('of_encours', 'statut') && (
                  <SortHeader col="statut" label="Statut" className="w-28 px-2 text-center" />
                )}
                {columnConfigService.isColumnVisible('of_encours', 'actions') && (
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredAndSortedOFs.length === 0 ? (
                <tr>
                  <td colSpan={(columnConfigService.getVisibleColumns('of_encours').length || 9) + 1} className="py-12 text-center text-slate-500 font-sans italic text-sm">
                    <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-25 text-blue-400" />
                    <p className="font-bold text-slate-400">Aucun Ordre de Fabrication correspondant</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Les OF apparaissent automatiquement ici dès que vous cliquez sur "Émettre l'OF" dans l'Écosystème Commandes.
                    </p>
                  </td>
                </tr>
              ) : (
                displayedOFs.map(of => {
                  const isPause = of.statut === 'EN_PAUSE' || Boolean(of.estEnPause);
                  const isAnnule = of.statut === 'ANNULE';
                  const isEmis = (of.statut === 'EMIS') && !isPause;
                  const isAttente = of.statut === 'RETOUR_EN_ATTENTE';
                  const isCloture = of.statut === 'CLOTURE';
                  const isLivre = of.statut === 'LIVRE';

                  // Détection des repères de pièces correspondants à la recherche
                  const matchedReperes = (() => {
                    if (!recherche.trim()) return [];
                    const q = recherche.toLowerCase().trim();
                    const linked = getLinkedDossierForOF(of);
                    if (!linked) return [];
                    const found = [
                      ...(linked.articlesCaissons || []).filter(c => (c.repere || '').toLowerCase().includes(q)).map(c => c.repere),
                      ...(linked.articlesTabliers || []).filter(t => (t.repere || '').toLowerCase().includes(q)).map(t => t.repere),
                      ...(linked.articlesMoustiquaires || []).filter(m => (m.repere || '').toLowerCase().includes(q)).map(m => m.repere),
                      ...(linked.articlesPrecadres || []).filter(p => (p.repere || '').toLowerCase().includes(q)).map(p => p.repere)
                    ].filter(Boolean) as string[];
                    return Array.from(new Set(found));
                  })();

                  return (
                    <tr
                      key={of.id}
                      className={`hover:bg-slate-800/40 transition ${
                        isPause
                          ? 'bg-rose-950/20'
                          : isAnnule
                          ? 'bg-slate-950/50 opacity-60'
                          : isEmis
                          ? 'bg-slate-900/40'
                          : isAttente
                          ? 'bg-amber-950/20'
                          : isLivre
                          ? 'bg-teal-950/20'
                          : 'bg-slate-900/20'
                      }`}
                    >
                      {/* Checkbox Sélection Expédition / Fiche de Transfert */}
                      <td className="w-10 px-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedOfIdsForTransfer.has(of.id)}
                          onChange={(e) => {
                            const next = new Set(selectedOfIdsForTransfer);
                            if (e.target.checked) {
                              next.add(of.id);
                            } else {
                              next.delete(of.id);
                            }
                            setSelectedOfIdsForTransfer(next);
                          }}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                          title="Cocher pour inclure dans la Fiche de Transfert"
                        />
                      </td>
                      {/* N° Ordre / Séquence d'Émission Atelier */}
                      {columnConfigService.isColumnVisible('of_encours', 'id_of') && (
                        <td className="py-2.5 px-2 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 border border-amber-300 font-mono font-black text-xs shadow-xs tracking-wider">
                              {of.codeOF || (of.numeroEmission ? `OF-${String(of.numeroEmission).padStart(3, '0')}` : 'OF-???')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-medium mt-0.5 whitespace-nowrap">
                              #{String(of.numeroEmission || '').padStart(3, '0') || '—'}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* N° Commande (Cliquer pour visualiser la commande) */}
                      {columnConfigService.isColumnVisible('of_encours', 'dossier') && (
                        <td className="py-2.5 px-2.5 font-mono font-bold text-amber-300">
                          <div className="flex items-center gap-1 flex-wrap">
                            {of.numCommande
                              .split(/[\s,+/]+/)
                              .map(c => c.trim())
                              .filter(Boolean)
                              .map((cmd, cIdx) => (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() => handleVisualiserCommande(of)}
                                  className="px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer group shadow-2xs"
                                  title="Cliquer pour visualiser la commande complète et ses repères"
                                >
                                  <span>{cmd}</span>
                                  <Eye className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 text-amber-400" />
                                </button>
                              ))}
                            <button
                              type="button"
                              onClick={() => handleOpenEditOF(of)}
                              className="p-1 text-slate-500 hover:text-amber-300 hover:bg-slate-800 rounded transition"
                              title="Modifier les N° de commande / Référence de cet OF"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {/* Affichage des repères trouvés lors de la recherche */}
                          {matchedReperes.length > 0 && (
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              <span className="text-[9px] text-purple-300 font-bold">Repère:</span>
                              {matchedReperes.slice(0, 3).map((r, rIdx) => (
                                <span
                                  key={rIdx}
                                  className="px-1.5 py-0.2 bg-purple-900/60 border border-purple-500/50 text-purple-200 text-[10px] font-mono font-bold rounded"
                                >
                                  {r}
                                </span>
                              ))}
                              {matchedReperes.length > 3 && (
                                <span className="text-[9px] text-purple-400 font-mono">
                                  +{matchedReperes.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Client / Donneur d'ordre */}
                      {columnConfigService.isColumnVisible('of_encours', 'agence') && (
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-200">{of.nomClient || '—'}</div>
                          {of.donneurOrdre && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-slate-500" />
                              <span>{of.donneurOrdre}</span>
                            </div>
                          )}
                        </td>
                      )}

                      {/* Famille & Nbr de Pièces (Règle utilisateur: affichez famille nbr de pcs au lieu de section) */}
                      {columnConfigService.isColumnVisible('of_encours', 'produit') && (
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              of.famille === 'TABLIER' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                              of.famille === 'CAISSON' ? 'bg-sky-950 text-sky-300 border border-sky-800' :
                              of.famille === 'MOUSTIQUAIRE' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                              'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}>
                              {of.famille}
                            </span>
                            {(() => {
                              const nb = DelaisProductionService.compterPiecesOF(of, dossiers);
                              const isPetite = nb <= 2;
                              const isMoyenne = nb > 2 && nb <= 5;
                              return (
                                <span
                                  className={`font-bold text-xs whitespace-nowrap px-2 py-0.5 rounded border shadow-xs ${
                                    isPetite
                                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80 font-mono'
                                      : isMoyenne
                                      ? 'bg-sky-950 text-sky-300 border-sky-700/60 font-mono'
                                      : 'bg-slate-800/90 text-slate-200 border-slate-700 font-mono'
                                  }`}
                                  title={isPetite ? 'Petite commande (1-2 pièces) — Priorité atelier' : `${nb} pièces`}
                                >
                                  {nb} pc{nb > 1 ? 's' : ''}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                      )}

                      {/* Date Émission & Retour */}
                      {columnConfigService.isColumnVisible('of_encours', 'date') && (
                        <td className="py-2.5 px-2 font-mono text-slate-400 text-xs text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{of.dateEmission}</span>
                          </div>
                          {of.dateRetour && (
                            <div className="text-[10px] text-emerald-400 mt-0.5">
                              Retour : {of.dateRetour}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Date de Livraison Fixée */}
                      {columnConfigService.isColumnVisible('of_encours', 'delai') && (
                        <td className="py-2.5 px-2 text-center font-mono">
                          {(() => {
                            const rawDate = of.dateLivraisonPrevisionnelle || DelaisProductionService.estimerDelaiOF(of, suivisOF).texteFormatte;
                            const isInstant = of.typePriorite === 'INSTANTANE' || !!of.estPrioritaire;
                            const cleanDate = rawDate
                              .replace(/^(⚡\s*INSTANTAN[EÉ]\s*:\s*|⚡\s*PRIORITAIRE\s*:\s*|LIVRAISON\s*PR[EÉ]VUE\s*:\s*|D[EÉ]LAI\s*PR[EÉ]VISIONNEL\s*:\s*|D[EÉ]LAI\s*:\s*|LIVRAISON\s*:\s*)/i, '')
                              .trim();

                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setOfToEditDelai(of);
                                  setIsEditDelaiModalOpen(true);
                                }}
                                className="group inline-flex flex-col items-center gap-1 cursor-pointer transition p-1 rounded-lg hover:bg-slate-800/80 max-w-full"
                                title="Cliquer pour fixer la date de livraison ou définir la priorité (Instantané / Différé)"
                              >
                                {isInstant && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase tracking-wide animate-pulse">
                                    <Zap className="w-2.5 h-2.5 fill-rose-400 text-rose-400" />
                                    <span>⚡ Instantané</span>
                                  </span>
                                )}
                                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono font-bold text-[11px] shadow-xs whitespace-nowrap transition ${
                                  isInstant
                                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-200 group-hover:border-rose-400 group-hover:bg-rose-900/50'
                                    : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 group-hover:border-emerald-400 group-hover:bg-emerald-500/25'
                                }`}>
                                  <Calendar className={`w-3 h-3 ${isInstant ? 'text-rose-400' : 'text-emerald-400'} shrink-0`} />
                                  <span>{cleanDate}</span>
                                  <Edit2 className="w-2.5 h-2.5 ml-0.5 opacity-40 group-hover:opacity-100 transition-opacity text-slate-300" />
                                </div>
                              </button>
                            );
                          })()}
                        </td>
                      )}

                      {/* Barres & Chutes */}
                      {columnConfigService.isColumnVisible('of_encours', 'profils') && (
                        <td className="py-2.5 px-2 text-center font-mono whitespace-nowrap">
                          <div className="text-xs font-bold text-slate-200">
                            <span className="text-sky-400">{of.totalBarresNeuvesPrevu}</span> b.
                            <span className="text-slate-500 mx-1">•</span>
                            <span className="text-emerald-400">{of.totalChutesUtiliseesPrevu}</span> ch.
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {of.lignesRetour.length} ligne(s)
                          </div>
                        </td>
                      )}

                      {/* Statut */}
                      {columnConfigService.isColumnVisible('of_encours', 'statut') && (
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                            isPause
                              ? 'bg-rose-950 text-rose-300 border-rose-700/80 shadow-xs'
                              : isAnnule
                              ? 'bg-slate-800 text-slate-400 border-slate-600 shadow-xs'
                              : isEmis
                              ? 'bg-blue-950 text-blue-300 border-blue-700/60'
                              : isAttente
                              ? 'bg-amber-950 text-amber-300 border-amber-700/60 animate-pulse'
                              : isLivre
                              ? 'bg-teal-950 text-teal-300 border-teal-700/60'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                          }`}>
                            {isPause && <PauseCircle className="w-3 h-3 text-rose-400" />}
                            {isAnnule && <RotateCcw className="w-3 h-3 text-slate-400" />}
                            {isEmis && <Clock className="w-3 h-3" />}
                            {isAttente && <AlertCircle className="w-3 h-3" />}
                            {isCloture && <CheckCircle2 className="w-3 h-3" />}
                            {isLivre && <Truck className="w-3 h-3 text-teal-400" />}
                            <span>
                              {isPause ? 'En Pause' : isAnnule ? 'Annulé' : isEmis ? 'Émis' : isAttente ? 'Retour Reçu' : isLivre ? 'Livré' : 'Clôturé'}
                            </span>
                          </span>
                        </td>
                      )}

                      {/* Actions */}
                      {columnConfigService.isColumnVisible('of_encours', 'actions') && (
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Actions pour ordre EN PAUSE */}
                            {isPause && (
                              <button
                                type="button"
                                onClick={() => handleTogglePauseOF(of)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-md text-[11px] transition cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Reprendre la fabrication de cet OF et réactiver le dossier"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Reprendre</span>
                              </button>
                            )}

                            {/* Actions selon le statut de l'OF */}
                            {isEmis && (
                              /* Un ordre doit être reçu de l'atelier avant de pouvoir être clôturé */
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleMarquerRetourRecu(of)}
                                  title="Marquer comme retour reçu de l'atelier pour pouvoir clôturer l'OF"
                                  className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-md text-[11px] transition cursor-pointer flex items-center gap-1 shadow-xs"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>Reçu</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await handleMarquerRetourRecu(of);
                                    localStorage.setItem('3m_cockpit_selected_of', of.id);
                                    localStorage.setItem('3m_cockpit_mode', 'COCKPIT');
                                    if (onNavigateToTab) {
                                      onNavigateToTab('cockpit-cloture');
                                    }
                                  }}
                                  title="Marquer le retour atelier comme reçu et ouvrir directement le Cockpit de clôture"
                                  className="p-1.5 bg-slate-800 hover:bg-emerald-950/80 text-emerald-400 hover:text-emerald-300 rounded-md text-xs transition cursor-pointer border border-slate-700 hover:border-emerald-700/60 shadow-xs"
                                >
                                  <Scale className="w-3.5 h-3.5 text-emerald-400" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePauseOF(of)}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 rounded-md text-xs transition cursor-pointer border border-slate-700 hover:border-rose-700/60 shadow-xs"
                                  title="Mettre cet ordre en pause (rupture de stock matière, attente approvisionnement)"
                                >
                                  <Pause className="w-3.5 h-3.5 text-rose-400" />
                                </button>
                              </>
                            )}

                            {isAttente && (
                              /* Ordre Reçu de l'atelier : prêt pour la clôture */
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    localStorage.setItem('3m_cockpit_selected_of', of.id);
                                    localStorage.setItem('3m_cockpit_mode', 'COCKPIT');
                                    if (onNavigateToTab) {
                                      onNavigateToTab('cockpit-cloture');
                                    }
                                  }}
                                  title="Clôturer rapidement via le Cockpit Éclair"
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-md text-[11px] flex items-center gap-1 shadow-xs transition cursor-pointer"
                                >
                                  <Scale className="w-3 h-3" />
                                  <span>Cockpit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    localStorage.setItem('3m_cockpit_selected_of', of.id);
                                    localStorage.setItem('3m_cockpit_mode', 'CLASSIQUE');
                                    if (onNavigateToTab) {
                                      onNavigateToTab('cockpit-cloture');
                                    }
                                  }}
                                  title="Clôturer via la méthode classique détaillée ligne par ligne"
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs transition cursor-pointer border border-slate-700 shadow-xs"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePauseOF(of)}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 rounded-md text-xs transition cursor-pointer border border-slate-700 hover:border-rose-700/60 shadow-xs"
                                  title="Mettre en pause cet ordre"
                                >
                                  <Pause className="w-3.5 h-3.5 text-rose-400" />
                                </button>
                              </>
                            )}

                            {(isCloture || isLivre) && (
                              <>
                                {isCloture && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedFicheToView(null);
                                      setSelectedOfIdsForTransfer(new Set([of.id]));
                                      setIsFicheTransfertModalOpen(true);
                                    }}
                                    className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
                                    title="Transférer cet ordre : créer un bon de livraison / fiche de transfert"
                                  >
                                    <Truck className="w-3 h-3 text-amber-400" />
                                    <span>Transférer</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSuiviForDetails(of);
                                  }}
                                  className="px-2 py-1 bg-purple-950/80 hover:bg-purple-900 text-purple-300 hover:text-purple-100 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border border-purple-700/60 shadow-xs"
                                  title="Voir les détails complets de l'OF"
                                >
                                  <Eye className="w-3 h-3 text-purple-400" />
                                  <span>Détails</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRollbackCloture(of)}
                                  className="p-1.5 bg-slate-800 hover:bg-amber-900/60 text-slate-400 hover:text-amber-300 rounded-md text-xs transition cursor-pointer border border-slate-700 shadow-xs"
                                  title="Annuler la clôture : restituer le stock et rouvrir l'OF pour correction"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                                </button>
                              </>
                            )}

                            {/* Bouton Voir Fiche Transfert si Livré */}
                            {isLivre && (
                              <button
                                type="button"
                                onClick={() => {
                                  const relatedFiche = fichesTransfert.find(f => f.id === of.ficheTransfertId || (f.lignes && f.lignes.some(l => l.ofId === of.id || (l.numCommande && l.numCommande.includes(of.numCommande)))));
                                  if (relatedFiche) {
                                    setSelectedFicheToView(relatedFiche);
                                    setIsFicheTransfertModalOpen(true);
                                  } else {
                                    setSelectedSuiviForDetails(of);
                                  }
                                }}
                                className="p-1.5 bg-slate-800 hover:bg-teal-900/60 text-slate-400 hover:text-teal-300 rounded-md text-xs transition cursor-pointer border border-slate-700 shadow-xs"
                                title="Voir la Fiche de Transfert associée"
                              >
                                <Truck className="w-3.5 h-3.5 text-teal-400" />
                              </button>
                            )}

                            {/* Bouton Recharger Commande dans Écosystème */}
                            <button
                              type="button"
                              onClick={() => handleChargerDossierDansEcosysteme(of)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-300 rounded-md text-xs transition cursor-pointer border border-slate-700 shadow-xs"
                              title="Recharger cette commande complète dans l'Écosystème pour mise à jour ou consultation"
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            {/* Bouton Visualiser Commande Complète */}
                            <button
                              type="button"
                              onClick={() => handleVisualiserCommande(of)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-purple-300 rounded-md text-xs transition cursor-pointer border border-slate-700 shadow-xs"
                              title="Visualiser le dossier de commande complet (repères, articles, cotes, statut)"
                            >
                              <FileText className="w-3.5 h-3.5 text-purple-400" />
                            </button>

                            {/* Bouton Annuler OF (si non clôturé) */}
                            {(isEmis || isAttente) && of.statut !== 'ANNULE' && (
                              <button
                                type="button"
                                onClick={() => handleAnnulerOF(of)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 rounded-md text-xs transition cursor-pointer border border-slate-700 shadow-xs"
                                title="Annuler cet OF et libérer ses réservations"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Bouton Annuler Émission */}
                            <button
                              type="button"
                              onClick={() => handleAnnulerEmissionOF(of)}
                              className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-md text-xs transition cursor-pointer border border-slate-700 hover:border-rose-700/60 shadow-xs"
                              title="Annuler l'émission : débloque la commande pour mise à jour dans l'Écosystème et annule immédiatement les réservations de barres et chutes"
                            >
                              <Undo2 className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                          </div>
                        </td>
                      )}
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Informations de volume */}
        {filteredAndSortedOFs.length > 0 && (
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>
                Affichage de <span className="font-bold text-slate-200">{pageSize === -1 ? 1 : (currentPage - 1) * pageSize + 1}</span> à{' '}
                <span className="font-bold text-slate-200">{pageSize === -1 ? filteredAndSortedOFs.length : Math.min(currentPage * pageSize, filteredAndSortedOFs.length)}</span> sur{' '}
                <span className="font-bold text-amber-400">{filteredAndSortedOFs.length}</span> ordres
              </span>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1">
                <span>Par page :</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>Tout ({filteredAndSortedOFs.length})</option>
                </select>
              </div>
            </div>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 rounded border border-slate-800 font-medium transition cursor-pointer"
                >
                  Précédent
                </button>
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    if (
                      pageNum === 1 ||
                      pageNum === totalPages ||
                      Math.abs(pageNum - currentPage) <= 1
                    ) {
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 rounded text-xs font-bold transition cursor-pointer ${
                            currentPage === pageNum
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                    if (pageNum === 2 && currentPage > 3) {
                      return <span key="ellipsis-start" className="px-1 text-slate-600">...</span>;
                    }
                    if (pageNum === totalPages - 1 && currentPage < totalPages - 2) {
                      return <span key="ellipsis-end" className="px-1 text-slate-600">...</span>;
                    }
                    return null;
                  })}
                </div>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 rounded border border-slate-800 font-medium transition cursor-pointer"
                >
                  Suivant
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Registre des Fiches de Transfert & Bons de Remise Transporteur ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mt-6">
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Registre des Fiches de Transfert &amp; Bons de Livraison</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold">
                  {fichesTransfert.length} fiche(s)
                </span>
                {searchFicheTransfert && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono">
                    {filteredFichesTransfert.length} trouvée(s)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Historique des bordereaux officiels remis aux transporteurs avec visas et commandes clôturées.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Recherche rapide dans l'historique des fiches de transfert */}
            <div className="relative min-w-[240px] sm:min-w-[280px]">
              <input
                type="text"
                value={searchFicheTransfert}
                onChange={e => setSearchFicheTransfert(e.target.value)}
                placeholder="Rechercher fiche, client, chauffeur, cmd..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 font-mono focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              {searchFicheTransfert && (
                <button
                  type="button"
                  onClick={() => setSearchFicheTransfert('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setSelectedFicheToView(null);
                setIsFicheTransfertModalOpen(true);
              }}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-xl flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <Truck className="w-4 h-4" />
              <span>Nouvelle Fiche de Transfert</span>
            </button>
          </div>
        </div>

        {fichesTransfert.length === 0 ? (
          <div className="py-10 text-center text-slate-500 italic text-xs">
            <Truck className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-40" />
            <p className="font-bold text-slate-400">Aucune fiche de transfert générée pour l'instant</p>
            <p className="text-slate-500 mt-0.5">
              Cliquez sur "Créer Fiche de Transfert" dès que le transporteur de votre client se présente à l'atelier.
            </p>
          </div>
        ) : filteredFichesTransfert.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs space-y-2">
            <p className="font-bold text-slate-400">Aucune fiche ne correspond à votre recherche "{searchFicheTransfert}"</p>
            <button
              type="button"
              onClick={() => setSearchFicheTransfert('')}
              className="text-amber-400 hover:underline font-semibold cursor-pointer"
            >
              Effacer la recherche
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3.5">N° Fiche</th>
                  <th className="py-3 px-3.5">Nom de Mon Client</th>
                  <th className="py-3 px-3.5">Transporteur</th>
                  <th className="py-3 px-3.5">Date Livraison</th>
                  <th className="py-3 px-3.5 text-center">Commandes &amp; Pièces</th>
                  <th className="py-3 px-3.5 text-center">Statut</th>
                  <th className="py-3 px-3.5 text-center w-48">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredFichesTransfert.map(fiche => {
                  const totalPieces = (fiche.lignes || []).reduce((s, l) => s + (l.quantiteArticles || 1), 0);
                  return (
                    <tr key={fiche.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3.5 font-mono font-bold text-amber-300">
                        {fiche.numeroFiche}
                      </td>
                      <td className="py-3 px-3.5 font-bold text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>{fiche.monClient}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-slate-300 font-medium">
                        {fiche.nomChauffeurPrincipal || '—'}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-400">
                        {fiche.dateLivraison}
                      </td>
                      <td className="py-3 px-3.5 text-center font-mono">
                        <span className="text-amber-300 font-bold">{fiche.lignes?.length || 0}</span> cmd(s) •{' '}
                        <span className="text-emerald-400 font-bold">{totalPieces}</span> pièce(s)
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          ✓ LIVRÉE
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedFicheToView(fiche);
                              setIsFicheTransfertModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                            title="Consulter et imprimer la fiche officielle"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Imprimer / Voir</span>
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Voulez-vous supprimer la fiche de transfert "${fiche.numeroFiche}" ?`)) {
                                await StorageService.deleteFicheTransfert(fiche.id);
                                onRefreshData();
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition cursor-pointer"
                            title="Supprimer la fiche"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Saisie Corrections & Clôture Retour OF ── */}
      {selectedSuiviForRetour && (
        <RetourOFModal
          isOpen={isRetourModalOpen}
          suivi={selectedSuiviForRetour}
          articles={articles}
          chutesBarres={chutesBarres}
          mapping={mapping}
          onClose={() => {
            setIsRetourModalOpen(false);
            setSelectedSuiviForRetour(null);
            focusSearchInput(false);
          }}
          onCloture={() => {
            onRefreshData();
            setIsRetourModalOpen(false);
            setSelectedSuiviForRetour(null);
            focusSearchInput(true);
          }}
        />
      )}

      {/* ── Modal Consultation Détails OF Clôturé ── */}
      {selectedSuiviForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-black text-xs">
                      {selectedSuiviForDetails.codeOF || (selectedSuiviForDetails.numeroEmission ? `OF-${String(selectedSuiviForDetails.numeroEmission).padStart(3, '0')}` : 'OF')}
                    </span>
                    <span>Ordre #{selectedSuiviForDetails.numeroEmission || '—'} (Cmd {selectedSuiviForDetails.numCommande})</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Clôturé
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Client : <strong>{selectedSuiviForDetails.nomClient}</strong> — Émis le {selectedSuiviForDetails.dateEmission}
                    {selectedSuiviForDetails.dateRetour && ` • Clôturé le ${selectedSuiviForDetails.dateRetour}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedSuiviForDetails(null);
                  focusSearchInput(false);
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Lignes Débit, Mesures Réelles &amp; Annotations :</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  {selectedSuiviForDetails.lignesRetour.length} support(s)
                </span>
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Repère &amp; Pièces</th>
                      <th className="p-2.5">Support Réel</th>
                      <th className="p-2.5 text-center">Reste Prévu</th>
                      <th className="p-2.5 text-center bg-slate-900/60 text-amber-300">Reste Réel Mesuré</th>
                      <th className="p-2.5 text-center">Destination</th>
                      <th className="p-2.5">Remarque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-sans">
                    {selectedSuiviForDetails.lignesRetour.map((ligne, i) => {
                      const realReste = ligne.resteReelMesureMm ?? ligne.restePrevuMm;
                      const isBarre = ligne.sourceReelle === 'BARRE_NEUVE' || (ligne.sourceReelle !== 'AUTRE_CHUTE' && ligne.typeSupport === 'BARRE_NEUVE');
                      const delta = realReste - ligne.restePrevuMm;

                      return (
                        <tr key={ligne.id || i} className="hover:bg-slate-800/30">
                          <td className="p-2.5">
                            <div className="font-bold text-amber-300 font-mono text-[11px]">{ligne.repere}</div>
                            {ligne.piecesInfoStr && (
                              <div className="text-[10px] text-slate-400 font-mono">{ligne.piecesInfoStr}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-300">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isBarre
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-blue-950 text-blue-300 border-blue-800'
                            }`}>
                              {isBarre ? '🪵 Barre Neuve' : '📦 Chute Stock'} ({ligne.longueurSourceReelle || ligne.longueurPrevue}mm)
                            </span>
                          </td>
                          <td className="p-2.5 text-center text-slate-400 font-mono">{ligne.restePrevuMm} mm</td>
                          <td className="p-2.5 text-center font-mono font-bold bg-slate-900/30">
                            <span className="text-amber-300 text-xs">{realReste} mm</span>
                            {delta !== 0 && (
                              <span className={`text-[10px] ml-1 font-normal ${delta > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                                ({delta > 0 ? `+${delta}` : delta}mm)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {ligne.actionReste === 'A_STOCKER' && realReste > 0 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                                📦 En Stock ({realReste}mm)
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-700">
                                🗑️ Déchet
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-400 text-[11px]">
                            {ligne.remarque || ligne.saisieOperateur || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedSuiviForDetails.remarqueGlobale && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                  <span className="text-slate-400 font-bold block mb-1">Remarque Générale :</span>
                  <p className="text-slate-300">{selectedSuiviForDetails.remarqueGlobale}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => {
                  setSelectedSuiviForDetails(null);
                  focusSearchInput(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Modification Rapide Référence & Commandes OF ── */}
      {editingOF && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-100">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Modifier l'Ordre de Fabrication</h3>
                  <p className="text-[11px] text-slate-400">Corrigez les N° de commandes ou le client</p>
                </div>
              </div>
              <button
                onClick={() => setEditingOF(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>N° de Commande(s) incluses dans cet OF :</span>
                </label>
                <input
                  type="text"
                  value={editFormNumCmd}
                  onChange={e => setEditFormNumCmd(e.target.value)}
                  placeholder="ex: 26148, 26149, 26130 ou 26148 + 26149 + 26130"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-400"
                />
                <p className="text-[10px] text-slate-500">
                  Séparez plusieurs commandes par des virgules ou des '+'. Chaque commande sera affichée comme un badge.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300">Nom du Client :</label>
                  <input
                    type="text"
                    value={editFormClient}
                    onChange={e => setEditFormClient(e.target.value)}
                    placeholder="Nom client"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300">Donneur d'Ordre :</label>
                  <input
                    type="text"
                    value={editFormDonneur}
                    onChange={e => setEditFormDonneur(e.target.value)}
                    placeholder="ex: SOMADAL"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300">Titre / Description Section :</label>
                <input
                  type="text"
                  value={editFormTitre}
                  onChange={e => setEditFormTitre(e.target.value)}
                  placeholder="Titre de la section"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 flex items-center gap-1">
                  <span>Famille de Produit de l'OF :</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['TABLIER', 'MOUSTIQUAIRE', 'CAISSON', 'PRECADRE'] as FamilleProduit[]).map(fam => (
                    <button
                      key={fam}
                      type="button"
                      onClick={() => setEditFormFamille(fam)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                        editFormFamille === fam
                          ? fam === 'TABLIER' ? 'bg-amber-950 text-amber-300 border-amber-600'
                            : fam === 'MOUSTIQUAIRE' ? 'bg-purple-950 text-purple-300 border-purple-600'
                            : fam === 'PRECADRE' ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                            : 'bg-sky-950 text-sky-300 border-sky-600'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {fam === 'TABLIER' ? 'Volet / Tablier'
                        : fam === 'MOUSTIQUAIRE' ? 'Moustiquaire'
                        : fam === 'PRECADRE' ? 'Précadre'
                        : 'Caisson'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingOF(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveEditOF}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg flex items-center gap-1.5 shadow"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Enregistrer Modifications</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Fiche de Transfert ── */}
      <FicheTransfertModal
        isOpen={isFicheTransfertModalOpen}
        onClose={() => {
          setIsFicheTransfertModalOpen(false);
          setSelectedFicheToView(null);
          setSelectedOfIdsForTransfer(new Set());
        }}
        dossiers={dossiers}
        suivisOF={suivisOF}
        fichesTransfert={fichesTransfert}
        clientCodifications={clientCodifications}
        onSaved={onRefreshData}
        ficheToView={selectedFicheToView}
        initialSelectedOfIds={Array.from(selectedOfIdsForTransfer)}
      />

      {/* ── Modal Modification Date de Livraison & Priorité ── */}
      <ModifierDelaiLivraisonModal
        isOpen={isEditDelaiModalOpen}
        onClose={() => {
          setIsEditDelaiModalOpen(false);
          setOfToEditDelai(null);
        }}
        of={ofToEditDelai}
        suivisOF={suivisOF}
        onSaved={() => {
          onRefreshData();
        }}
      />

      {/* ── Modal Visualisation Commande Complète ── */}
      <DossierDetailModal
        isOpen={isDossierDetailOpen}
        onClose={() => {
          setIsDossierDetailOpen(false);
          setSelectedDossierToView(null);
        }}
        dossier={selectedDossierToView}
        onLoadInEcosysteme={(d) => {
          setIsDossierDetailOpen(false);
          if (onLoadDossierInEcosysteme) {
            onLoadDossierInEcosysteme(d);
          } else if (onNavigateToTab) {
            onNavigateToTab('ecosysteme');
          }
        }}
      />
    </div>
  );
};
