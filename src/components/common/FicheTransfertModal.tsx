import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Truck,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  Clock,
  FileText,
  User,
  Calendar,
  Save,
  Phone,
  Car,
  Package,
  Layers,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  AlertCircle,
  Filter,
  CornerDownLeft,
  RotateCcw,
  Check,
  Eye,
  EyeOff,
  QrCode
} from 'lucide-react';
import {
  FicheTransfert,
  LigneFicheTransfert,
  DossierCommandeGlobal,
  SuiviOF,
  ClientCodification,
  FamilleProduit
} from '../../types';
import { StorageService } from '../../services/storage';
import { extraireNumeroSansPrefixe } from '../../services/codificationService';

interface FicheTransfertModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossiers?: DossierCommandeGlobal[];
  suivisOF?: SuiviOF[];
  fichesTransfert?: FicheTransfert[];
  clientCodifications?: ClientCodification[];
  onSaved: () => void;
  ficheToView: FicheTransfert | null;
  initialSelectedOfIds?: string[];
  initialSelectedDossierIds?: string[];
}

interface CommandeCandidate {
  key: string;
  sourceType: 'DOSSIER' | 'OF';
  id: string;
  dossierId?: string;
  ofId?: string;
  numCommande: string;
  nomClientFinal: string;
  donneurOrdre: string;
  statut: string;
  statutLabel: string;
  isReady: boolean;
  isTransferred: boolean;
  transferFicheNum?: string;
  familles: FamilleProduit[];
  totalArticles: number;
  compositionStr: string;
  nomChauffeur?: string;
  matriculeVehicule?: string;
  telephoneChauffeur?: string;
  notes?: string;
  lignesGenerables: LigneFicheTransfert[];
}

// Composant pour mettre en surbrillance les termes recherchés
const HighlightMatch: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query || !query.trim() || !text) return <span>{text}</span>;
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const index = lower.indexOf(q);
  if (index === -1) return <span>{text}</span>;
  const before = text.substring(0, index);
  const matched = text.substring(index, index + q.length);
  const after = text.substring(index + q.length);
  return (
    <span>
      {before}
      <span className="bg-amber-400 text-slate-950 font-black px-0.5 rounded shadow-sm">
        {matched}
      </span>
      {after}
    </span>
  );
};

export const FicheTransfertModal: React.FC<FicheTransfertModalProps> = ({
  isOpen,
  onClose,
  dossiers = [],
  suivisOF = [],
  fichesTransfert = [],
  clientCodifications = [],
  onSaved,
  ficheToView = null,
  initialSelectedOfIds = [],
  initialSelectedDossierIds = []
}) => {
  const isViewMode = Boolean(ficheToView);

  // Form State
  const [numeroFiche, setNumeroFiche] = useState<string>('');
  const [monClient, setMonClient] = useState<string>('');
  const [nomChauffeur, setNomChauffeur] = useState<string>('');
  const [matriculeVehicule, setMatriculeVehicule] = useState<string>('');
  const [telephoneChauffeur, setTelephoneChauffeur] = useState<string>('');
  const [dateLivraison, setDateLivraison] = useState<string>('');
  const [statut, setStatut] = useState<'VALIDEE' | 'EN_PREPARATION'>('VALIDEE');
  const [notes, setNotes] = useState<string>('');
  const [lignes, setLignes] = useState<LigneFicheTransfert[]>([]);
  const [visaChauffeur, setVisaChauffeur] = useState<string>('');
  const [visaAtelier, setVisaAtelier] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sélecteur interactif des commandes à transférer & Outils de localisation rapide
  const [showOrderSelector, setShowOrderSelector] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [familleFilter, setFamilleFilter] = useState<'ALL' | FamilleProduit>('ALL');
  const [statutFilter, setStatutFilter] = useState<'ALL' | 'READY' | 'IN_PROGRESS'>('ALL');
  const [showAlreadyTransferred, setShowAlreadyTransferred] = useState<boolean>(false);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set());
  const [locateFeedback, setLocateFeedback] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  // Autofocus automatique sur la barre de recherche dès l'ouverture de la modale en mode création
  useEffect(() => {
    if (isOpen && !isViewMode) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, [isOpen, isViewMode]);

  // Cartographie complète des OFs et Dossiers déjà rattachés à une Fiche de Transfert
  const { transferredOfMap, transferredDossierMap, transferredCmdMap } = useMemo(() => {
    const ofMap = new Map<string, string>(); // ofId -> numeroFiche
    const dosMap = new Map<string, string>(); // dossierId -> numeroFiche
    const cmdMap = new Map<string, string>(); // cleanNumCmd -> numeroFiche

    // 1. Depuis la liste des fiches de transfert existantes
    (fichesTransfert || []).forEach(f => {
      // Si on consulte ou modifie cette même fiche, ne pas masquer ses propres lignes
      if (ficheToView && f.id === ficheToView.id) return;

      const numFiche = f.numeroFiche || 'FT';
      (f.lignes || []).forEach(l => {
        if (l.ofId) ofMap.set(l.ofId, numFiche);
        if (l.dossierId) dosMap.set(l.dossierId, numFiche);
        if (l.numCommande) {
          const clean = l.numCommande.trim().toLowerCase();
          cmdMap.set(clean, numFiche);
          const sansPref = extraireNumeroSansPrefixe(clean, clientCodifications).toLowerCase();
          if (sansPref) cmdMap.set(sansPref, numFiche);
        }
      });
    });

    // 2. Depuis les statuts et attributs directs des suivis OF
    (suivisOF || []).forEach(o => {
      if (ficheToView && o.ficheTransfertId === ficheToView.id) return;
      if (o.statut === 'LIVRE' || o.ficheTransfertId) {
        const existingFiche = (fichesTransfert || []).find(f => f.id === o.ficheTransfertId);
        const fNum = existingFiche?.numeroFiche || 'LIVRÉ';
        ofMap.set(o.id, fNum);
        if (o.numCommande) {
          cmdMap.set(o.numCommande.trim().toLowerCase(), fNum);
          const sansPref = extraireNumeroSansPrefixe(o.numCommande, clientCodifications).toLowerCase();
          if (sansPref) cmdMap.set(sansPref, fNum);
        }
      }
    });

    // 3. Depuis les statuts et attributs directs des dossiers
    (dossiers || []).forEach(d => {
      if (ficheToView && d.ficheTransfertId === ficheToView.id) return;
      if (d.statut === 'LIVRE' || d.ficheTransfertId) {
        const existingFiche = (fichesTransfert || []).find(f => f.id === d.ficheTransfertId);
        const fNum = existingFiche?.numeroFiche || 'LIVRÉ';
        dosMap.set(d.id, fNum);
        if (d.refCommande) {
          cmdMap.set(d.refCommande.trim().toLowerCase(), fNum);
          const sansPref = extraireNumeroSansPrefixe(d.refCommande, clientCodifications).toLowerCase();
          if (sansPref) cmdMap.set(sansPref, fNum);
        }
      }
    });

    return { transferredOfMap: ofMap, transferredDossierMap: dosMap, transferredCmdMap: cmdMap };
  }, [fichesTransfert, suivisOF, dossiers, ficheToView, clientCodifications]);

  // Construction de la liste des commandes candidates disponibles pour transfert
  const candidatesList = useMemo<CommandeCandidate[]>(() => {
    const candidates: CommandeCandidate[] = [];
    const treatedDossierIds = new Set<string>();

    // 1. Extraire depuis les Dossiers de commandes
    (dossiers || []).forEach(d => {
      if ((d.statut as string) === 'ARCHIVE' || (d.statut as string) === 'ANNULE') return;
      treatedDossierIds.add(d.id);

      const clientFinal = d.nomClientFinal || d.refCommande || 'Client';
      const dOrdre = d.donneurOrdre || '';
      const ref = d.refCommande || 'CMD';

      // Détection si déjà transféré / livré
      const cleanRef = ref.trim().toLowerCase();
      const cleanRefSansPref = extraireNumeroSansPrefixe(ref, clientCodifications).toLowerCase();
      const isTransferred =
        transferredDossierMap.has(d.id) ||
        d.statut === 'LIVRE' ||
        Boolean(d.ficheTransfertId) ||
        transferredCmdMap.has(cleanRef) ||
        (cleanRefSansPref ? transferredCmdMap.has(cleanRefSansPref) : false);

      const transferFicheNum =
        transferredDossierMap.get(d.id) ||
        transferredCmdMap.get(cleanRef) ||
        (cleanRefSansPref ? transferredCmdMap.get(cleanRefSansPref) : undefined) ||
        (d.statut === 'LIVRE' ? 'LIVRÉ' : undefined);

      const caissonsQte = (d.articlesCaissons || []).reduce((s, a) => s + (Number(a.quantite) || 1), 0);
      const tabliersQte = (d.articlesTabliers || []).reduce((s, a) => s + (Number(a.quantite) || 1), 0);
      const mstqQte = (d.articlesMoustiquaires || []).reduce((s, a) => s + (Number(a.quantite) || 1), 0);
      const precadresQte = (d.articlesPrecadres || []).reduce((s, a) => s + (Number(a.quantite) || 1), 0);
      const totalArticles = caissonsQte + tabliersQte + mstqQte + precadresQte;

      const famillesIncluses: FamilleProduit[] = [];
      const compParts: string[] = [];
      if (tabliersQte > 0) {
        compParts.push(`${tabliersQte} Tablier(s)`);
        famillesIncluses.push('TABLIER');
      }
      if (caissonsQte > 0) {
        compParts.push(`${caissonsQte} Caisson(s)`);
        famillesIncluses.push('CAISSON');
      }
      if (mstqQte > 0) {
        compParts.push(`${mstqQte} Mstq`);
        famillesIncluses.push('MOUSTIQUAIRE');
      }
      if (precadresQte > 0) {
        compParts.push(`${precadresQte} Précadre(s)`);
        famillesIncluses.push('PRECADRE');
      }
      if (famillesIncluses.length === 0) {
        famillesIncluses.push('TABLIER');
      }
      const compStr = compParts.length > 0 ? compParts.join(', ') : `${totalArticles || 1} article(s)`;

      const isReady = d.statut === 'CLOTURE' || d.statut === 'FABRIQUE' || d.statut === 'LIVRE';
      const statutLabel = isTransferred
        ? `Transféré (${transferFicheNum || 'FT'})`
        : isReady
        ? 'Prêt / Fabriqué'
        : d.statut === 'EN_COURS'
        ? 'En cours atelier'
        : 'En attente';

      // Générer les lignes correspondantes
      const lignesGen: LigneFicheTransfert[] = [];
      if (tabliersQte > 0) {
        const rep = (d.articlesTabliers || []).map(t => t.repere || `${t.largeur}x${t.hauteur}`).filter(Boolean).slice(0, 4).join(', ');
        lignesGen.push({
          id: `lg-t-${d.id}-${Date.now()}`,
          dossierId: d.id,
          nomChauffeur: d.nomChauffeur || '',
          numCommande: d.numCommandeTablier || ref,
          clientDeMonClient: clientFinal,
          familleProduit: 'TABLIER',
          quantiteArticles: tabliersQte,
          designationDetail: `${tabliersQte} Tablier(s)${rep ? ` (${rep})` : ''}`,
          remarques: d.notes || ''
        });
      }
      if (caissonsQte > 0) {
        const rep = (d.articlesCaissons || []).map(c => c.repere || `${c.longueur}mm`).filter(Boolean).slice(0, 4).join(', ');
        lignesGen.push({
          id: `lg-c-${d.id}-${Date.now()}`,
          dossierId: d.id,
          nomChauffeur: d.nomChauffeur || '',
          numCommande: d.numCommandeCaisson || ref,
          clientDeMonClient: clientFinal,
          familleProduit: 'CAISSON',
          quantiteArticles: caissonsQte,
          designationDetail: `${caissonsQte} Caisson(s)${rep ? ` (${rep})` : ''}`,
          remarques: d.notes || ''
        });
      }
      if (mstqQte > 0) {
        const rep = (d.articlesMoustiquaires || []).map(m => m.repere || `${m.largeur}x${m.hauteur}`).filter(Boolean).slice(0, 4).join(', ');
        lignesGen.push({
          id: `lg-m-${d.id}-${Date.now()}`,
          dossierId: d.id,
          nomChauffeur: d.nomChauffeur || '',
          numCommande: d.numCommandeMoustiquaire || ref,
          clientDeMonClient: clientFinal,
          familleProduit: 'MOUSTIQUAIRE',
          quantiteArticles: mstqQte,
          designationDetail: `${mstqQte} Moustiquaire(s)${rep ? ` (${rep})` : ''}`,
          remarques: d.notes || ''
        });
      }
      if (precadresQte > 0) {
        const rep = (d.articlesPrecadres || []).map(p => p.repere || `${p.largeur}x${p.hauteur}`).filter(Boolean).slice(0, 4).join(', ');
        lignesGen.push({
          id: `lg-p-${d.id}-${Date.now()}`,
          dossierId: d.id,
          nomChauffeur: d.nomChauffeur || '',
          numCommande: d.numCommandePrecadre || ref,
          clientDeMonClient: clientFinal,
          familleProduit: 'PRECADRE',
          quantiteArticles: precadresQte,
          designationDetail: `${precadresQte} Précadre(s)${rep ? ` (${rep})` : ''}`,
          remarques: d.notes || ''
        });
      }

      // Fallback si aucun article décomposé
      if (lignesGen.length === 0) {
        lignesGen.push({
          id: `lg-def-${d.id}-${Date.now()}`,
          dossierId: d.id,
          nomChauffeur: d.nomChauffeur || '',
          numCommande: ref,
          clientDeMonClient: clientFinal,
          familleProduit: 'TABLIER',
          quantiteArticles: Math.max(1, totalArticles),
          designationDetail: `Commande ${ref} (${clientFinal})`,
          remarques: d.notes || ''
        });
      }

      candidates.push({
        key: `dossier-${d.id}`,
        sourceType: 'DOSSIER',
        id: d.id,
        dossierId: d.id,
        numCommande: ref,
        nomClientFinal: clientFinal,
        donneurOrdre: dOrdre,
        statut: d.statut,
        statutLabel,
        isReady,
        isTransferred,
        transferFicheNum,
        familles: famillesIncluses,
        totalArticles: Math.max(1, totalArticles),
        compositionStr: compStr,
        nomChauffeur: d.nomChauffeur,
        matriculeVehicule: d.matriculeVehicule,
        telephoneChauffeur: d.telephoneChauffeur,
        notes: d.notes,
        lignesGenerables: lignesGen
      });
    });

    // 2. Extraire les OFs isolés qui ne sont pas déjà couverts par les dossiers traités
    (suivisOF || []).forEach(of => {
      if (of.statut === 'ANNULE') return;
      if (of.dossierId && treatedDossierIds.has(of.dossierId)) return;

      const cmdNum = of.numCommande || of.codeOF || 'CMD';
      const cleanCmd = cmdNum.trim().toLowerCase();
      const cleanCmdSansPref = extraireNumeroSansPrefixe(cmdNum, clientCodifications).toLowerCase();

      // Détection si déjà transféré
      const isTransferred =
        transferredOfMap.has(of.id) ||
        of.statut === 'LIVRE' ||
        Boolean(of.ficheTransfertId) ||
        transferredCmdMap.has(cleanCmd) ||
        (cleanCmdSansPref ? transferredCmdMap.has(cleanCmdSansPref) : false);

      const transferFicheNum =
        transferredOfMap.get(of.id) ||
        transferredCmdMap.get(cleanCmd) ||
        (cleanCmdSansPref ? transferredCmdMap.get(cleanCmdSansPref) : undefined) ||
        (of.statut === 'LIVRE' ? 'LIVRÉ' : undefined);

      const isReady = of.statut === 'CLOTURE' || of.statut === 'LIVRE' || of.statut === 'RETOUR_EN_ATTENTE';
      const statutLabel = isTransferred
        ? `Transféré (${transferFicheNum || 'FT'})`
        : isReady
        ? 'Prêt / Clôturé'
        : 'Émis atelier';
      const qte = of.nombrePieces || 1;

      const ligneGen: LigneFicheTransfert = {
        id: `lg-of-${of.id}-${Date.now()}`,
        dossierId: of.dossierId,
        ofId: of.id,
        nomChauffeur: of.nomChauffeur || '',
        numCommande: cmdNum,
        clientDeMonClient: of.nomClient || 'Client',
        familleProduit: of.famille,
        quantiteArticles: qte,
        designationDetail: of.titreSection || `${of.famille} (${qte} pcs)`,
        remarques: of.notes || ''
      };

      candidates.push({
        key: `of-${of.id}`,
        sourceType: 'OF',
        id: of.id,
        dossierId: of.dossierId,
        ofId: of.id,
        numCommande: cmdNum,
        nomClientFinal: of.nomClient || 'Client',
        donneurOrdre: of.donneurOrdre || '',
        statut: of.statut,
        statutLabel,
        isReady,
        isTransferred,
        transferFicheNum,
        familles: [of.famille],
        totalArticles: qte,
        compositionStr: `${qte} pièce(s) • ${of.famille}`,
        nomChauffeur: of.nomChauffeur,
        notes: of.notes,
        lignesGenerables: [ligneGen]
      });
    });

    return candidates;
  }, [dossiers, suivisOF, transferredOfMap, transferredDossierMap, transferredCmdMap, clientCodifications]);

  // Initialisation ou réinitialisation du formulaire
  useEffect(() => {
    if (!isOpen) return;

    if (ficheToView) {
      setNumeroFiche(ficheToView.numeroFiche || '');
      setMonClient(ficheToView.monClient || '');
      setNomChauffeur(ficheToView.nomChauffeurPrincipal || '');
      setMatriculeVehicule(ficheToView.matriculeVehicule || '');
      setTelephoneChauffeur(ficheToView.telephoneChauffeur || '');
      setDateLivraison(ficheToView.dateLivraison || todayStr);
      setStatut(ficheToView.statut === 'ANNULEE' ? 'VALIDEE' : (ficheToView.statut || 'VALIDEE'));
      setNotes(ficheToView.notes || '');
      setLignes(ficheToView.lignes || []);
      setVisaChauffeur(ficheToView.visaChauffeur || '');
      setVisaAtelier(ficheToView.visaAtelier || '');
      setErrorMsg(null);
      setShowOrderSelector(false);
    } else {
      const generatedNum = `FT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      setNumeroFiche(generatedNum);
      setMonClient(clientCodifications[0]?.nom || '');
      setNomChauffeur('');
      setMatriculeVehicule('');
      setTelephoneChauffeur('');
      setDateLivraison(todayStr);
      setStatut('VALIDEE');
      setNotes('');
      setVisaChauffeur('');
      setVisaAtelier('Atelier 3M');
      setErrorMsg(null);
      setShowOrderSelector(true);
      setShowAlreadyTransferred(false);

      // Traitement des présélections (via initialSelectedOfIds ou initialSelectedDossierIds)
      const initialKeys = new Set<string>();
      const initialLignes: LigneFicheTransfert[] = [];
      let detectedClient = '';
      let detectedChauffeur = '';
      let detectedMatricule = '';
      let detectedTel = '';

      candidatesList.forEach(cand => {
        const matchesOf = cand.ofId && initialSelectedOfIds.includes(cand.ofId);
        const matchesDossier = cand.dossierId && initialSelectedDossierIds.includes(cand.dossierId);

        if (matchesOf || matchesDossier) {
          initialKeys.add(cand.key);
          initialLignes.push(...cand.lignesGenerables);
          if (!detectedClient && cand.donneurOrdre) detectedClient = cand.donneurOrdre;
          if (!detectedChauffeur && cand.nomChauffeur) detectedChauffeur = cand.nomChauffeur;
          if (!detectedMatricule && cand.matriculeVehicule) detectedMatricule = cand.matriculeVehicule;
          if (!detectedTel && cand.telephoneChauffeur) detectedTel = cand.telephoneChauffeur;
        }
      });

      setSelectedCandidateKeys(initialKeys);
      setLignes(initialLignes);
      if (detectedClient) setMonClient(detectedClient);
      if (detectedChauffeur) setNomChauffeur(detectedChauffeur);
      if (detectedMatricule) setMatriculeVehicule(detectedMatricule);
      if (detectedTel) setTelephoneChauffeur(detectedTel);
    }
  }, [isOpen, ficheToView, todayStr, clientCodifications, candidatesList, initialSelectedOfIds, initialSelectedDossierIds]);

  // Statistiques pour les filtres
  const statsCandidates = useMemo(() => {
    let readyCount = 0;
    let inProgressCount = 0;
    let transferredCount = 0;
    let totalNonTransferred = 0;

    candidatesList.forEach(c => {
      if (c.isTransferred) {
        transferredCount++;
      } else {
        totalNonTransferred++;
        if (c.isReady) readyCount++;
        else inProgressCount++;
      }
    });

    return { readyCount, inProgressCount, transferredCount, totalNonTransferred };
  }, [candidatesList]);

  // Donneurs d'ordre uniques présents dans les candidats
  const donneursPresents = useMemo(() => {
    const setD = new Set<string>();
    candidatesList.forEach(c => {
      if (c.donneurOrdre && c.donneurOrdre.trim()) {
        setD.add(c.donneurOrdre.trim());
      }
    });
    return Array.from(setD).sort((a, b) => a.localeCompare(b));
  }, [candidatesList]);

  // Filtrage avancé des candidats : EXCLUSION PAR DÉFAUT des OFs déjà transférés
  const filteredCandidates = useMemo(() => {
    return candidatesList.filter(c => {
      // RÈGLE DEMANDÉE : Les OFs / commandes déjà transférés NE DOIVENT PAS figurer dans la saisie d'une nouvelle fiche
      if (!ficheToView) {
        const isPreselected =
          (c.ofId && initialSelectedOfIds.includes(c.ofId)) ||
          (c.dossierId && initialSelectedDossierIds.includes(c.dossierId)) ||
          selectedCandidateKeys.has(c.key);

        if (c.isTransferred && !showAlreadyTransferred && !isPreselected) {
          return false;
        }
      }

      // 1. Filtre Client / Donneur d'Ordre
      if (clientFilter !== 'ALL') {
        const candClient = (c.donneurOrdre || '').trim().toLowerCase();
        if (candClient !== clientFilter.trim().toLowerCase()) return false;
      }

      // 2. Filtre Famille
      if (familleFilter !== 'ALL') {
        if (!c.familles || !c.familles.includes(familleFilter)) return false;
      }

      // 3. Filtre Statut
      if (statutFilter === 'READY' && !c.isReady) return false;
      if (statutFilter === 'IN_PROGRESS' && c.isReady) return false;

      // 4. Recherche textuelle ultra-performante et multi-critères
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const qClean = extraireNumeroSansPrefixe(q, clientCodifications).toLowerCase().trim();

        const numClean = extraireNumeroSansPrefixe(c.numCommande, clientCodifications).toLowerCase().trim();
        const matchNum =
          c.numCommande.toLowerCase().includes(q) ||
          (qClean.length >= 2 && numClean.includes(qClean)) ||
          (qClean.length >= 2 && numClean === qClean);

        const matchClient = c.nomClientFinal.toLowerCase().includes(q);
        const matchDonneur = c.donneurOrdre.toLowerCase().includes(q);
        const matchComp = c.compositionStr.toLowerCase().includes(q);
        const matchChauffeur = (c.nomChauffeur || '').toLowerCase().includes(q);
        const matchNotes = (c.notes || '').toLowerCase().includes(q);

        // Recherche dans les détails des lignes générables (repères de coupe, désignations)
        const matchLignes = c.lignesGenerables.some(l =>
          (l.designationDetail || '').toLowerCase().includes(q) ||
          (l.remarques || '').toLowerCase().includes(q) ||
          (l.numCommande || '').toLowerCase().includes(q)
        );

        if (!matchNum && !matchClient && !matchDonneur && !matchComp && !matchChauffeur && !matchNotes && !matchLignes) {
          return false;
        }
      }

      return true;
    });
  }, [
    candidatesList,
    ficheToView,
    initialSelectedOfIds,
    initialSelectedDossierIds,
    selectedCandidateKeys,
    showAlreadyTransferred,
    clientFilter,
    familleFilter,
    statutFilter,
    searchFilter,
    clientCodifications
  ]);

  // Gestion de la sélection / désélection d'une commande candidate
  const handleToggleCandidate = (candidate: CommandeCandidate) => {
    const isAlreadySelected = selectedCandidateKeys.has(candidate.key);
    const nextSelected = new Set(selectedCandidateKeys);

    if (isAlreadySelected) {
      // Désélectionner et retirer ses lignes
      nextSelected.delete(candidate.key);
      setSelectedCandidateKeys(nextSelected);
      setLignes(prev => prev.filter(l => {
        if (candidate.sourceType === 'DOSSIER') {
          return l.dossierId !== candidate.id;
        } else {
          return l.ofId !== candidate.id;
        }
      }));
    } else {
      // Sélectionner et charger automatiquement ses lignes
      nextSelected.add(candidate.key);
      setSelectedCandidateKeys(nextSelected);

      // Préparer les nouvelles lignes
      const newLines = candidate.lignesGenerables.map(l => ({
        ...l,
        nomChauffeur: nomChauffeur || candidate.nomChauffeur || l.nomChauffeur
      }));
      setLignes(prev => [...prev, ...newLines]);

      // Chargement automatique intelligent des informations globales si vides
      if (!monClient && candidate.donneurOrdre) {
        setMonClient(candidate.donneurOrdre);
      }
      if (!nomChauffeur && candidate.nomChauffeur) {
        setNomChauffeur(candidate.nomChauffeur);
      }
      if (!matriculeVehicule && candidate.matriculeVehicule) {
        setMatriculeVehicule(candidate.matriculeVehicule);
      }
      if (!telephoneChauffeur && candidate.telephoneChauffeur) {
        setTelephoneChauffeur(candidate.telephoneChauffeur);
      }
    }
  };

  // Raccourci Scanner & Touche [Entrée] : Localisation et ajout instantanés
  const handleQuickLocate = (e?: React.KeyboardEvent<HTMLInputElement>) => {
    if (e && e.key !== 'Enter') return;
    if (e) e.preventDefault();

    const q = searchFilter.trim();
    if (!q) return;

    if (filteredCandidates.length === 0) {
      setLocateFeedback({
        type: 'warning',
        text: `Aucune commande disponible trouvée pour "${q}". Si cette commande a déjà été transférée, cochez "Afficher les commandes déjà transférées".`
      });
      setTimeout(() => setLocateFeedback(null), 5000);
      return;
    }

    // 1. Si une seule commande correspond aux critères de recherche
    if (filteredCandidates.length === 1) {
      const target = filteredCandidates[0];
      if (!selectedCandidateKeys.has(target.key)) {
        handleToggleCandidate(target);
        setLocateFeedback({
          type: 'success',
          text: `✅ Commande ${target.numCommande} (${target.nomClientFinal}) localisée et ajoutée avec succès !`
        });
      } else {
        setLocateFeedback({
          type: 'info',
          text: `ℹ️ Commande ${target.numCommande} (${target.nomClientFinal}) est déjà sélectionnée.`
        });
      }
      setSearchFilter('');
      setTimeout(() => setLocateFeedback(null), 4000);
      return;
    }

    // 2. Si plusieurs correspondances, chercher une concordance exacte sur le numéro de commande
    const exactMatch = filteredCandidates.find(c => {
      const cNum = c.numCommande.trim().toLowerCase();
      const qLower = q.toLowerCase();
      if (cNum === qLower) return true;
      const cClean = extraireNumeroSansPrefixe(cNum, clientCodifications).toLowerCase();
      const qClean = extraireNumeroSansPrefixe(qLower, clientCodifications).toLowerCase();
      return cClean && qClean && cClean === qClean;
    });

    if (exactMatch) {
      if (!selectedCandidateKeys.has(exactMatch.key)) {
        handleToggleCandidate(exactMatch);
        setLocateFeedback({
          type: 'success',
          text: `✅ Commande ${exactMatch.numCommande} (${exactMatch.nomClientFinal}) localisée et ajoutée avec succès !`
        });
      } else {
        setLocateFeedback({
          type: 'info',
          text: `ℹ️ Commande ${exactMatch.numCommande} est déjà sélectionnée.`
        });
      }
      setSearchFilter('');
      setTimeout(() => setLocateFeedback(null), 4000);
    } else {
      setLocateFeedback({
        type: 'info',
        text: `🔍 ${filteredCandidates.length} commandes correspondent à "${q}". Cochez les commandes souhaitées ci-dessous ou cliquez sur "Tout cocher".`
      });
      setTimeout(() => setLocateFeedback(null), 5000);
    }
  };

  // Sélectionner ou désélectionner tout le filtre actuel
  const handleSelectAllFiltered = (selectAll: boolean) => {
    if (selectAll) {
      const nextKeys = new Set(selectedCandidateKeys);
      const addedLines: LigneFicheTransfert[] = [];
      let detectedClient = monClient;
      let detectedChauffeur = nomChauffeur;
      let detectedMatricule = matriculeVehicule;
      let detectedTel = telephoneChauffeur;

      filteredCandidates.forEach(cand => {
        if (!nextKeys.has(cand.key)) {
          nextKeys.add(cand.key);
          addedLines.push(...cand.lignesGenerables);
          if (!detectedClient && cand.donneurOrdre) detectedClient = cand.donneurOrdre;
          if (!detectedChauffeur && cand.nomChauffeur) detectedChauffeur = cand.nomChauffeur;
          if (!detectedMatricule && cand.matriculeVehicule) detectedMatricule = cand.matriculeVehicule;
          if (!detectedTel && cand.telephoneChauffeur) detectedTel = cand.telephoneChauffeur;
        }
      });

      setSelectedCandidateKeys(nextKeys);
      setLignes(prev => [...prev, ...addedLines]);
      if (detectedClient) setMonClient(detectedClient);
      if (detectedChauffeur) setNomChauffeur(detectedChauffeur);
      if (detectedMatricule) setMatriculeVehicule(detectedMatricule);
      if (detectedTel) setTelephoneChauffeur(detectedTel);
    } else {
      const filteredKeys = new Set(filteredCandidates.map(c => c.key));
      const nextKeys = new Set(Array.from(selectedCandidateKeys).filter(k => !filteredKeys.has(k)));
      setSelectedCandidateKeys(nextKeys);

      const filteredCandidateIds = new Set(filteredCandidates.map(c => c.id));
      setLignes(prev => prev.filter(l => {
        if (l.dossierId && filteredCandidateIds.has(l.dossierId)) return false;
        if (l.ofId && filteredCandidateIds.has(l.ofId)) return false;
        return true;
      }));
    }
  };

  const handleAddManualLine = () => {
    const newLine: LigneFicheTransfert = {
      id: `l-man-${Date.now()}`,
      nomChauffeur: nomChauffeur || '',
      numCommande: '',
      clientDeMonClient: '',
      familleProduit: 'TABLIER' as FamilleProduit,
      quantiteArticles: 1,
      designationDetail: '',
      remarques: ''
    };
    setLignes(prev => [...prev, newLine]);
  };

  const handleUpdateLine = (index: number, field: keyof LigneFicheTransfert, value: any) => {
    setLignes(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveLine = (index: number) => {
    setLignes(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveFiche = async () => {
    if (!numeroFiche.trim()) {
      setErrorMsg('Veuillez renseigner un numéro de fiche de transfert.');
      return;
    }
    if (!monClient.trim()) {
      setErrorMsg('Veuillez renseigner ou sélectionner le client donneur d\'ordre.');
      return;
    }
    if (!nomChauffeur.trim()) {
      setErrorMsg('Veuillez renseigner le nom du transporteur ou chauffeur.');
      return;
    }
    if (lignes.length === 0) {
      setErrorMsg('Veuillez sélectionner au moins une commande à transférer.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const ficheId = ficheToView?.id || `ft-${Date.now()}`;
    const newFiche: FicheTransfert = {
      id: ficheId,
      numeroFiche: numeroFiche.trim(),
      monClient: monClient.trim(),
      nomChauffeurPrincipal: nomChauffeur.trim(),
      matriculeVehicule: matriculeVehicule.trim(),
      telephoneChauffeur: telephoneChauffeur.trim(),
      dateLivraison: dateLivraison || todayStr,
      lignes: lignes.map(l => ({ ...l, nomChauffeur: nomChauffeur.trim() })),
      visaChauffeur: visaChauffeur.trim() || nomChauffeur.trim(),
      visaAtelier: visaAtelier.trim() || 'Atelier 3M',
      statut,
      notes: notes.trim(),
      createdAt: ficheToView?.createdAt || new Date().toISOString()
    };

    try {
      // 1. Sauvegarder la fiche de transfert
      await StorageService.upsertFicheTransfert(newFiche);

      // 2. Mettre à jour les OFs concernés : marquer comme LIVRE
      for (const ligne of lignes) {
        if (ligne.ofId) {
          const of = suivisOF.find(o => o.id === ligne.ofId);
          if (of) {
            const updatedOF: SuiviOF = {
              ...of,
              ficheTransfertId: newFiche.id,
              statut: 'LIVRE',
              dateLivraison: newFiche.dateLivraison,
              nomChauffeur: newFiche.nomChauffeurPrincipal
            };
            await StorageService.upsertSuiviOF(updatedOF);
          }
        }
      }

      // 3. Mettre à jour les dossiers correspondants vers LIVRE
      try {
        const freshDossiers = await StorageService.getDossiers();
        let anyDossierUpdated = false;

        const updatedDossiers = freshDossiers.map(d => {
          const isConcerned = lignes.some(l => {
            if (l.dossierId && l.dossierId === d.id) return true;
            const cmd = (l.numCommande || '').trim().toLowerCase();
            if (!cmd) return false;
            return (
              (d.refCommande || '').toLowerCase() === cmd ||
              (d.numCommandeCaisson || '').toLowerCase() === cmd ||
              (d.numCommandeTablier || '').toLowerCase() === cmd ||
              (d.numCommandeMoustiquaire || '').toLowerCase() === cmd ||
              (d.numCommandePrecadre || '').toLowerCase() === cmd
            );
          });

          if (isConcerned) {
            anyDossierUpdated = true;
            return {
              ...d,
              statut: 'LIVRE' as const,
              ficheTransfertId: newFiche.id,
              dateLivraison: newFiche.dateLivraison,
              nomChauffeur: newFiche.nomChauffeurPrincipal
            };
          }
          return d;
        });

        if (anyDossierUpdated) {
          await StorageService.saveDossiers(updatedDossiers);
        }
      } catch (errD) {
        console.warn('Erreur mise à jour statuts dossiers rattachés:', errD);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la sauvegarde de la fiche.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const totalColis = lignes.reduce((acc, l) => acc + (Number(l.quantiteArticles) || 0), 0);
  const totalCommandesDistinctes = new Set(lignes.map(l => (l.numCommande || '').trim()).filter(Boolean)).size;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* ========================================================================= */}
      {/* FEUILLE IMPRIMABLE OFFICIELLE (VISIBLE UNIQUEMENT À L'IMPRESSION)         */}
      {/* ========================================================================= */}
      <div className="hidden print:block w-full max-w-4xl mx-auto p-8 bg-white text-black font-sans">
        {/* En-tête officiel */}
        <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
          <div>
            <div className="text-2xl font-black tracking-wider uppercase">ATELIER 3M</div>
            <div className="text-sm font-bold text-slate-700 uppercase tracking-widest">
              Bordereau de Transfert &amp; Bon de Livraison
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-black font-mono border-2 border-black px-3 py-1 bg-slate-100 inline-block">
              {numeroFiche || 'FT-2026-XXXX'}
            </div>
            <div className="text-xs text-slate-600 mt-1 font-bold">
              Date : {dateLivraison || todayStr}
            </div>
          </div>
        </div>

        {/* Blocs Destinataire & Chauffeur */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border-2 border-black p-3 bg-slate-50">
            <div className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1 border-b border-black pb-1">
              DONNEUR D'ORDRE (CLIENT)
            </div>
            <div className="text-base font-black text-black">{monClient || '—'}</div>
            <div className="text-xs text-slate-700 mt-1">Expédition atelier vers l'agence / point de livraison</div>
          </div>

          <div className="border-2 border-black p-3 bg-slate-50">
            <div className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1 border-b border-black pb-1">
              TRANSPORTEUR / CHAUFFEUR
            </div>
            <div className="text-sm font-black text-black">{nomChauffeur || '—'}</div>
            <div className="text-xs text-slate-700 mt-0.5">
              Matricule : <span className="font-mono font-bold">{matriculeVehicule || 'Non renseigné'}</span>
              {telephoneChauffeur ? ` • Tél : ${telephoneChauffeur}` : ''}
            </div>
          </div>
        </div>

        {/* Tableau des Colis Livrés */}
        <div className="mb-6">
          <table className="w-full border-2 border-black text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black text-white font-black uppercase text-[11px]">
                <th className="p-2 border border-black w-28">N° Commande</th>
                <th className="p-2 border border-black w-36">Client Final</th>
                <th className="p-2 border border-black w-24">Famille</th>
                <th className="p-2 border border-black text-center w-14">Qté</th>
                <th className="p-2 border border-black">Désignation / Détails</th>
                <th className="p-2 border border-black w-36">Remarques</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-400">
                  <td className="p-2 border border-slate-400 font-mono font-bold">{l.numCommande}</td>
                  <td className="p-2 border border-slate-400 font-semibold">{l.clientDeMonClient}</td>
                  <td className="p-2 border border-slate-400 font-bold">{l.familleProduit}</td>
                  <td className="p-2 border border-slate-400 text-center font-mono font-bold text-sm">
                    {l.quantiteArticles}
                  </td>
                  <td className="p-2 border border-slate-400">{l.designationDetail || '—'}</td>
                  <td className="p-2 border border-slate-400 text-[11px] text-slate-600">{l.remarques || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black border-t-2 border-black text-xs">
                <td colSpan={3} className="p-2 border border-black text-right uppercase">
                  Total des Colis &amp; Articles :
                </td>
                <td className="p-2 border border-black text-center font-mono text-sm font-black">
                  {totalColis}
                </td>
                <td colSpan={2} className="p-2 border border-black text-slate-700">
                  {lignes.length} ligne(s) • {totalCommandesDistinctes} commande(s) distincte(s)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Consignes / Notes */}
        {notes && (
          <div className="border border-black p-2.5 mb-6 text-xs bg-slate-50">
            <span className="font-bold uppercase">Instructions : </span>
            <span>{notes}</span>
          </div>
        )}

        {/* Cadres Signatures & Visas */}
        <div className="grid grid-cols-2 gap-8 pt-4">
          <div className="border-2 border-black p-4 h-28 flex flex-col justify-between">
            <div className="text-xs font-black uppercase text-slate-800">
              Visa &amp; Émargement Chauffeur / Transporteur
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Nom : {nomChauffeur || '................................'}
            </div>
          </div>

          <div className="border-2 border-black p-4 h-28 flex flex-col justify-between">
            <div className="text-xs font-black uppercase text-slate-800">
              Visa &amp; Cachet Atelier Expédition
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Responsable : {visaAtelier || 'Atelier 3M'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL INTERACTIF À L'ÉCRAN                                                */}
      {/* ========================================================================= */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-sm">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-100 tracking-wide">
                  {isViewMode ? 'Fiche de Transfert & Bon de Livraison' : 'Nouvelle Fiche de Transfert Automatisée'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  {numeroFiche || 'FT-2026-XXXX'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sélectionnez les commandes à transférer : le système pré-remplit toutes les données requises.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Imprimer le bon de transfert propre"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Imprimer Bon</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corps du Modal avec Scroll */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SÉLECTEUR AUTOMATISÉ DES COMMANDES À TRANSFÉRER & OUTILS DE LOCALISATION  */}
          {/* ========================================================================= */}
          {!isViewMode && (
            <div className="bg-slate-950 border-2 border-amber-500/50 rounded-xl p-3.5 sm:p-4 space-y-3.5 shadow-xl">
              {/* Entête du sélecteur */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                        Sélection des Commandes &amp; OFs à Transférer
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {statsCandidates.totalNonTransferred} commande(s) en attente
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Les OFs déjà transférés sont exclus automatiquement. Utilisez la recherche pour localiser instantanément une commande.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono font-bold text-slate-300">
                    <span className="text-amber-400 font-black">{selectedCandidateKeys.size}</span> sélectionnée(s) •{' '}
                    <span className="text-emerald-400 font-black">{totalColis}</span> article(s)
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowOrderSelector(!showOrderSelector)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    {showOrderSelector ? 'Réduire' : 'Déplier Sélecteur'}
                  </button>
                </div>
              </div>

              {showOrderSelector && (
                <>
                  {/* BARRE DE RECHERCHE PRINCIPALE AVEC SCANNER / TOUCHE [ENTRÉE] */}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="w-4 h-4 text-amber-400" />
                        </div>
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchFilter}
                          onChange={e => setSearchFilter(e.target.value)}
                          onKeyDown={handleQuickLocate}
                          placeholder="Recherche rapide par N° commande, client, repère, chauffeur... (Scannez ou [Entrée] pour ajouter)"
                          className="w-full bg-slate-900 border-2 border-slate-700 focus:border-amber-500 rounded-xl pl-9 pr-24 py-2 text-xs text-slate-100 placeholder:text-slate-500 font-mono font-medium focus:outline-none transition shadow-inner"
                        />
                        <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
                          {searchFilter && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchFilter('');
                                searchInputRef.current?.focus();
                              }}
                              className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                              title="Effacer la recherche"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded text-[10px] font-mono">
                            <CornerDownLeft className="w-3 h-3" />
                            <span>Entrée</span>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleQuickLocate()}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer shrink-0"
                        title="Localiser et ajouter la commande trouvée"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Localiser &amp; Ajouter</span>
                      </button>
                    </div>

                    {/* Notification Toast dynamique pour la localisation rapide */}
                    {locateFeedback && (
                      <div
                        className={`p-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 border animate-in fade-in duration-200 ${
                          locateFeedback.type === 'success'
                            ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-200'
                            : locateFeedback.type === 'warning'
                            ? 'bg-amber-950/80 border-amber-700/80 text-amber-200'
                            : 'bg-sky-950/80 border-sky-700/80 text-sky-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {locateFeedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                          {locateFeedback.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                          {locateFeedback.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0" />}
                          <span>{locateFeedback.text}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocateFeedback(null)}
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* RANGÉE DE FILTRES RAPIDES : FAMILLE, STATUT & DONNEUR D'ORDRE */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    {/* Filtres Familles rapides (Chips) */}
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
                        <Filter className="w-3 h-3 text-slate-500" />
                        Famille :
                      </span>
                      {(
                        [
                          { id: 'ALL', label: 'Toutes' },
                          { id: 'TABLIER', label: '🪵 Tabliers' },
                          { id: 'CAISSON', label: '📦 Caissons' },
                          { id: 'MOUSTIQUAIRE', label: '🪟 Mstq' },
                          { id: 'PRECADRE', label: '🚪 Précadres' }
                        ] as const
                      ).map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFamilleFilter(f.id)}
                          className={`px-2 py-0.5 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                            familleFilter === f.id
                              ? 'bg-amber-500 text-slate-950 font-black shadow'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Filtres Statut rapides */}
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-[11px] font-bold text-slate-400 mr-1">Statut :</span>
                      <button
                        type="button"
                        onClick={() => setStatutFilter('READY')}
                        className={`px-2 py-0.5 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                          statutFilter === 'READY'
                            ? 'bg-emerald-600 text-white font-bold shadow'
                            : 'bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800'
                        }`}
                        title="Commandes terminées et prêtes pour expédition"
                      >
                        ✓ Prêts ({statsCandidates.readyCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatutFilter('IN_PROGRESS')}
                        className={`px-2 py-0.5 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                          statutFilter === 'IN_PROGRESS'
                            ? 'bg-blue-600 text-white font-bold shadow'
                            : 'bg-slate-900 hover:bg-slate-800 text-blue-400 border border-slate-800'
                        }`}
                        title="Commandes encore en fabrication dans l'atelier"
                      >
                        ⚙️ En cours ({statsCandidates.inProgressCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatutFilter('ALL')}
                        className={`px-2 py-0.5 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                          statutFilter === 'ALL'
                            ? 'bg-slate-700 text-white font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Tous
                      </button>
                    </div>
                  </div>

                  {/* SÉLECTEUR DONNEUR D'ORDRE & TOGGLE COMMANDES DÉJÀ TRANSFÉRÉES */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center pt-1 border-t border-slate-800/80">
                    {/* Donneur d'Ordre */}
                    <div className="sm:col-span-5">
                      <select
                        value={clientFilter}
                        onChange={e => setClientFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-semibold"
                      >
                        <option value="ALL">🏢 Tous les Donneurs d'Ordre ({candidatesList.length})</option>
                        {donneursPresents.map(nom => (
                          <option key={nom} value={nom}>
                            {nom}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Option Afficher les OFs déjà transférés (optimisation d'affichage demandée) */}
                    <div className="sm:col-span-4">
                      <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none bg-slate-900/80 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                        <input
                          type="checkbox"
                          checked={showAlreadyTransferred}
                          onChange={e => setShowAlreadyTransferred(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-amber-500 cursor-pointer"
                        />
                        <span className="text-[11px]">
                          Afficher aussi les déjà transférés ({statsCandidates.transferredCount})
                        </span>
                      </label>
                    </div>

                    {/* Actions de sélection globale */}
                    <div className="sm:col-span-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectAllFiltered(true)}
                        disabled={filteredCandidates.length === 0}
                        className="flex-1 px-2 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                        title="Sélectionner toutes les commandes actuellement visibles"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Tout cocher ({filteredCandidates.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectAllFiltered(false)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1"
                        title="Désélectionner les commandes affichées"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>Décocher</span>
                      </button>
                    </div>
                  </div>

                  {/* LISTE DES COMMANDES SÉLECTIONNABLES */}
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/60 border border-slate-800/90 rounded-xl p-2 bg-slate-900/60 shadow-inner">
                    {filteredCandidates.length === 0 ? (
                      <div className="text-xs text-slate-400 py-6 text-center space-y-2">
                        <p className="font-semibold text-slate-300">
                          Aucune commande en attente ne correspond aux filtres actuels.
                        </p>
                        {statsCandidates.transferredCount > 0 && !showAlreadyTransferred && (
                          <div className="flex items-center justify-center gap-2 pt-1">
                            <span className="text-[11px] text-slate-500">
                              {statsCandidates.transferredCount} commande(s) ont déjà été transférées.
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAlreadyTransferred(true)}
                              className="text-[11px] text-amber-400 hover:underline font-bold cursor-pointer"
                            >
                              Les afficher quand même
                            </button>
                          </div>
                        )}
                        {(searchFilter || clientFilter !== 'ALL' || familleFilter !== 'ALL' || statutFilter !== 'ALL') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchFilter('');
                              setClientFilter('ALL');
                              setFamilleFilter('ALL');
                              setStatutFilter('ALL');
                            }}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1 rounded cursor-pointer mt-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Réinitialiser les filtres</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredCandidates.map(cand => {
                        const isSelected = selectedCandidateKeys.has(cand.key);
                        return (
                          <div
                            key={cand.key}
                            onClick={() => handleToggleCandidate(cand)}
                            className={`pt-2.5 pb-2 px-3 rounded-lg flex items-center justify-between text-xs cursor-pointer transition select-none ${
                              isSelected
                                ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200 shadow-sm'
                                : cand.isTransferred
                                ? 'bg-slate-950/60 opacity-60 hover:opacity-100 hover:bg-slate-800/40 text-slate-400'
                                : 'hover:bg-slate-800/70 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // géré par le parent
                                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 cursor-pointer pointer-events-none shrink-0"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-black text-amber-300 text-xs tracking-wider">
                                    <HighlightMatch text={cand.numCommande} query={searchFilter} />
                                  </span>
                                  <span className="font-bold text-slate-100 truncate">
                                    <HighlightMatch text={cand.nomClientFinal} query={searchFilter} />
                                  </span>
                                  {cand.donneurOrdre && (
                                    <span className="text-slate-400 font-mono text-[11px] bg-slate-800/80 px-1.5 py-0.2 rounded">
                                      <HighlightMatch text={cand.donneurOrdre} query={searchFilter} />
                                    </span>
                                  )}
                                  {cand.isTransferred && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                                      ✓ Déjà transféré ({cand.transferFicheNum || 'FT'})
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                                  <span className="font-medium">
                                    <HighlightMatch text={cand.compositionStr} query={searchFilter} />
                                  </span>
                                  {cand.nomChauffeur && (
                                    <span className="text-slate-500 flex items-center gap-1">
                                      • Chauffeur: <HighlightMatch text={cand.nomChauffeur} query={searchFilter} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0 ml-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  cand.isReady
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-blue-950 text-blue-300 border border-blue-800'
                                }`}
                              >
                                {cand.statutLabel}
                              </span>

                              <span className="font-mono font-bold text-slate-300 text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                {cand.totalArticles} pc(s)
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCandidate(cand);
                                }}
                                className={`px-2 py-1 rounded text-[10px] font-black transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {isSelected ? '✓ Retirer' : '+ Ajouter'}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 1 : COORDONNÉES & INFORMATIONS TRANSPORT                         */}
          {/* ========================================================================= */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              <span>Coordonnées &amp; Informations Transport</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  N° de Fiche / Bon
                </label>
                <input
                  type="text"
                  value={numeroFiche}
                  onChange={e => setNumeroFiche(e.target.value)}
                  disabled={isViewMode}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none disabled:opacity-70"
                  placeholder="FT-2026-XXXX"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Donneur d'Ordre (Mon Client) *
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={monClient}
                    onChange={e => setMonClient(e.target.value)}
                    disabled={isViewMode}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-semibold focus:border-amber-500 focus:outline-none disabled:opacity-70"
                    placeholder="ex: SOMADAL Alger, CRISTAL Oran..."
                  />
                  {!isViewMode && clientCodifications.length > 0 && (
                    <select
                      onChange={e => {
                        if (e.target.value) setMonClient(e.target.value);
                      }}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 text-xs text-slate-300 cursor-pointer"
                      title="Sélectionner une agence ou client habituel"
                      value={clientCodifications.some(c => c.nom === monClient) ? monClient : ''}
                    >
                      <option value="" disabled>Choisir...</option>
                      {clientCodifications.map(c => (
                        <option key={c.id} value={c.nom}>{c.nom}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Date de Livraison
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={dateLivraison}
                    onChange={e => setDateLivraison(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70 font-mono"
                    placeholder="DD/MM/YYYY"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Nom du Chauffeur / Transporteur *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={nomChauffeur}
                    onChange={e => setNomChauffeur(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70"
                    placeholder="Nom et prénom du chauffeur"
                  />
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Matricule Véhicule
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={matriculeVehicule}
                    onChange={e => setMatriculeVehicule(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70 font-mono"
                    placeholder="ex: 01452-120-16"
                  />
                  <Car className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Téléphone Chauffeur
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={telephoneChauffeur}
                    onChange={e => setTelephoneChauffeur(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70 font-mono"
                    placeholder="05 XX XX XX XX"
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 2 : TABLEAU DES COLIS & ARTICLES CHARGÉS                          */}
          {/* ========================================================================= */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-3.5 h-3.5" />
                <span>Colis &amp; Commandes Livrées ({lignes.length} lignes, {totalColis} pièces au total)</span>
              </div>

              {!isViewMode && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddManualLine}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ligne Manuelle</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tableau des Lignes */}
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-2.5">N° Commande</th>
                    <th className="py-2 px-2.5">Client Final</th>
                    <th className="py-2 px-2.5">Famille</th>
                    <th className="py-2 px-2 text-center">Qté</th>
                    <th className="py-2 px-2.5">Désignation / Détail</th>
                    <th className="py-2 px-2.5">Remarques</th>
                    {!isViewMode && <th className="py-2 px-2 text-center w-10">Suppr</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {lignes.length === 0 ? (
                    <tr>
                      <td colSpan={isViewMode ? 6 : 7} className="py-6 text-center text-slate-500">
                        Aucune commande sélectionnée. Cochez les commandes ci-dessus pour charger automatiquement leurs lignes.
                      </td>
                    </tr>
                  ) : (
                    lignes.map((ligne, idx) => (
                      <tr key={ligne.id || idx} className="hover:bg-slate-900/50">
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="font-mono font-bold text-amber-300">{ligne.numCommande}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.numCommande}
                              onChange={e => handleUpdateLine(idx, 'numCommande', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono font-bold text-amber-300 focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="font-medium text-slate-200">{ligne.clientDeMonClient}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.clientDeMonClient}
                              onChange={e => handleUpdateLine(idx, 'clientDeMonClient', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none"
                              placeholder="Client final"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-bold">
                              {ligne.familleProduit}
                            </span>
                          ) : (
                            <select
                              value={ligne.familleProduit}
                              onChange={e => handleUpdateLine(idx, 'familleProduit', e.target.value)}
                              className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
                            >
                              <option value="CAISSON">CAISSON</option>
                              <option value="TABLIER">TABLIER</option>
                              <option value="MOUSTIQUAIRE">MOUSTIQUAIRE</option>
                              <option value="PRECADRE">PRECADRE</option>
                            </select>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {isViewMode ? (
                            <span className="font-mono font-bold text-slate-100">{ligne.quantiteArticles}</span>
                          ) : (
                            <input
                              type="number"
                              min={1}
                              value={ligne.quantiteArticles}
                              onChange={e => handleUpdateLine(idx, 'quantiteArticles', Number(e.target.value) || 1)}
                              className="w-14 text-center bg-slate-900 border border-slate-800 rounded px-1.5 py-1 font-mono font-bold text-slate-100 focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="text-slate-300 text-xs">{ligne.designationDetail || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.designationDetail || ''}
                              onChange={e => handleUpdateLine(idx, 'designationDetail', e.target.value)}
                              placeholder="ex: 4 Tabliers Lames 43mm"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="text-slate-400 text-xs">{ligne.remarques || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.remarques || ''}
                              onChange={e => handleUpdateLine(idx, 'remarques', e.target.value)}
                              placeholder="Remarque"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-400 text-xs focus:outline-none"
                            />
                          )}
                        </td>
                        {!isViewMode && (
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                              title="Retirer cette ligne"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 3 : NOTES & VISAS SIGNATURES                                     */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 border border-slate-800 rounded-xl p-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Remarques &amp; Consignes Particulières
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={isViewMode}
                rows={3}
                placeholder="Consignes de livraison, contact sur site, fragilité..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-70"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Visa / Nom Chauffeur Transporteur
                </label>
                <input
                  type="text"
                  value={visaChauffeur}
                  onChange={e => setVisaChauffeur(e.target.value)}
                  disabled={isViewMode}
                  placeholder="Nom et signature chauffeur"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-70"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Visa Responsable Atelier Expédition
                </label>
                <input
                  type="text"
                  value={visaAtelier}
                  onChange={e => setVisaAtelier(e.target.value)}
                  disabled={isViewMode}
                  placeholder="Atelier 3M"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-70"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pied de Page Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono">
            Total : <span className="font-bold text-amber-400">{lignes.length}</span> ligne(s) •{' '}
            <span className="font-bold text-amber-400">{totalColis}</span> article(s) •{' '}
            <span className="font-bold text-emerald-400">{totalCommandesDistinctes}</span> commande(s)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              Fermer
            </button>

            {!isViewMode && (
              <button
                type="button"
                onClick={handleSaveFiche}
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-lg flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Enregistrement...' : 'Valider & Expédier'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
