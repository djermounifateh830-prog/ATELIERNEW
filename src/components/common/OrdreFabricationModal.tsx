import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ResultatOptimisation, Article, PieceCoupee, BesoinMoustiquaire, 
  ChuteMaille, SuiviOF, LigneRetourOF, FamilleProduit, StatutOF,
  MappingChutes, ChuteReserveeOF, BarreReserveeOF, ChuteMailleReserveeOF,
  ParametresOptimisationMaille
} from '../../types';
import { detecterAgence } from '../../services/codificationService';
import { calculerBesoinMaille, optimiserLotMoustiquaires } from '../../services/moteurMoustiquaire';
import { StorageService } from '../../services/storage';
import { DelaisProductionService } from '../../services/delaisProductionService';
import { ModifierDelaiLivraisonModal } from './ModifierDelaiLivraisonModal';
import { X, Printer, Download, Send, CheckCircle2, PackageCheck, Layers, Recycle, Scissors, Clock, Edit2, Zap, FileText } from 'lucide-react';

export type FamilleOF = 'CAISSON' | 'TABLIER' | 'PRECADRE' | 'MOUSTIQUAIRE';

export interface SectionDebitOF {
  id?: string;
  titreSection: string;
  article: Article | null;
  resultat: ResultatOptimisation;
  coloris?: string;
  badge?: string;
  avecPeinture?: boolean;
  avecSousFace?: boolean;
  montageSousFace?: string;
  avecPlaque?: boolean;
  isSousFace?: boolean;
  famille?: FamilleProduit | string;
  type?: 'CT' | 'SF' | 'LF' | 'GL' | 'PRC' | 'CADRE' | string;
  commandesInvolved?: string[];
  debordement?: number;
  conditionsCoupe?: {
    longueurBarre?: number;
    epaisseurLame?: number;
    debordement?: number;
    refusMin?: number;
    refusMax?: number;
  };
}

export interface OrdreFabricationModalProps {
  isOpen: boolean;
  onClose: () => void;
  titreProduit?: string;
  refCommande: string;
  nomClient?: string;
  dateCommande?: string;
  coloris?: string;
  article?: Article | null;
  resultat?: ResultatOptimisation | null;
  sections?: SectionDebitOF[];
  lignesMoustiquaires?: BesoinMoustiquaire[];
  chutesMaille?: ChuteMaille[];
  mapping?: MappingChutes;
  famille?: FamilleProduit;
  articles?: Article[];
  donneurOrdre?: string;
  numCommandeCaisson?: string;
  numCommandeSousFace?: string;
  numCommandeTablier?: string;
  numCommandeMoustiquaire?: string;
  numCommandePrecadre?: string;
  paramsMaille?: ParametresOptimisationMaille;
  numeroEmission?: number;
  codeOF?: string;
  dateLivraisonPrevisionnelle?: string;
  dateLivraisonPrevisionnelleISO?: string;
  dossierId?: string;
  onOFEmis?: () => void;
}

interface PieceDecoupeeInfo {
  repere: string;
  cmdTag: string;
  longueur: number;
  labelPropre: string;
}

interface GroupeBarreNeuve {
  quantite: number;
  longueurBarre: number;
  pieces: PieceCoupee[];
  piecesInfo: PieceDecoupeeInfo[];
  utilise: number;
  chute: number;
  statut: 'Dechet' | 'STOCK' | 'SACRIFICE';
  barreIndices: number[];
}

interface GroupeChuteRecup {
  quantite: number;
  support: number;
  pieces: PieceCoupee[];
  piecesInfo: PieceDecoupeeInfo[];
  utilise: number;
  reste: number;
  chuteIndices: number[];
  chuteId?: string;
}

interface SectionTraitee {
  titre: string;
  badge?: string;
  article: Article | null;
  resultat: ResultatOptimisation;
  barreLongueur: number;
  lameScie: number;
  margeDebord: number;
  refusMin: number;
  refusMax: number;
  conditionsCoupe?: {
    longueurBarre?: number;
    epaisseurLame?: number;
    debordement?: number;
    refusMin?: number;
    refusMax?: number;
  };
  avecPeinture: boolean;
  avecSousFace: boolean;
  montageSousFace: string;
  avecPlaque?: boolean;
  isSousFace: boolean;
  famille: FamilleOF;
  commandesInvolved?: string[];
  groupesBarresNeuves: GroupeBarreNeuve[];
  groupesChutesRecup: GroupeChuteRecup[];
}

interface SynthseMatiereItem {
  famille: FamilleOF;
  codeArt: string;
  designation: string;
  longueurBarre: number;
  nbBarresNeuves: number;
  metrageBarresM: number;
  chutes: {
    longueurDepart: number;
    quantite: number;
    restePrevu: number;
    statutReste: string;
  }[];
}

export interface SyntheseAccessoireItem {
  famille: FamilleOF;
  codeArt: string;
  designation: string;
  dimension: string;
  quantiteRequise: number;
  unite: string;
  regleCalcul: string;
  detailPieces: string;
}

/** Extrait le repère et le N° de commande d'une pièce sans redondance */
function extraireRepereEtLg(p: PieceCoupee): PieceDecoupeeInfo {
  const longueur = Math.round(p.longueur);
  let rep = (p.repere || '').trim();
  let cmd = (p.refCommande || '').trim();

  if (!rep && p.label) {
    const cleanLabel = p.label.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
    const match = cleanLabel.match(/^([^—:,\s]+)/);
    rep = match ? match[1].trim() : cleanLabel;
  }

  if (!cmd && p.label) {
    const matchCmd = p.label.match(/\[Cmd\s+([^\]]+)\]/i);
    if (matchCmd) {
      cmd = matchCmd[1].trim();
    }
  }

  return {
    repere: rep || 'PCE',
    cmdTag: cmd,
    longueur,
    labelPropre: p.label || ''
  };
}

/** Détermine de manière fiable la famille d'un profilé */
function determinerFamille(sec: SectionDebitOF, fallbackFamille?: FamilleProduit): FamilleOF {
  if (sec.famille) {
    const f = String(sec.famille).toUpperCase();
    if (f.includes('TABLIER') || f.includes('VOLET')) return 'TABLIER';
    if (f.includes('MOUSTIQUAIRE') || f.includes('MSTQ')) return 'MOUSTIQUAIRE';
    if (f.includes('PRECADRE')) return 'PRECADRE';
    if (f.includes('CAISSON')) return 'CAISSON';
  }

  const titreUpper = (sec.titreSection || sec.article?.designation || '').toUpperCase();

  // 1. Précadre : détection immédiate et prioritaire pour ne jamais être pris pour de la moustiquaire
  if (
    titreUpper.includes('PRÉCADRE') ||
    titreUpper.includes('PRECADRE') ||
    titreUpper.includes('PRC') ||
    sec.type === 'PRC'
  ) {
    return 'PRECADRE';
  }

  // 2. Moustiquaire : vérification fiable
  if (
    titreUpper.includes('MOUSTIQUAIRE') ||
    titreUpper.includes('MSTQ') ||
    titreUpper.includes('MAILLE') ||
    titreUpper.includes('PLISSÉE') ||
    titreUpper.includes('CADRE MSTQ') ||
    titreUpper.includes('BARRE INF') ||
    (sec.type === 'CADRE' && !titreUpper.includes('PRC') && !titreUpper.includes('PRECADRE') && !titreUpper.includes('PRÉCADRE'))
  ) {
    return 'MOUSTIQUAIRE';
  }

  if (sec.type) {
    if (sec.type === 'PRC' && !titreUpper.includes('MSTQ') && !titreUpper.includes('MOUST')) return 'PRECADRE';
    if (sec.type === 'LF') return 'TABLIER';
    if (sec.type === 'CT') {
      const tit = (sec.titreSection || '').toUpperCase();
      if (tit.includes('TABLIER') || tit.includes('LAME')) return 'TABLIER';
      return 'CAISSON';
    }
    if (sec.type === 'SF') {
      const tit = (sec.titreSection || '').toUpperCase();
      if (tit.includes('MSTQ') || tit.includes('MOUST') || tit.includes('BARRE INF')) return 'MOUSTIQUAIRE';
      return 'CAISSON';
    }
    if (sec.type === 'GL') {
      const tit = (sec.titreSection || '').toUpperCase();
      if (tit.includes('MSTQ') || tit.includes('MOUST')) return 'MOUSTIQUAIRE';
      return 'TABLIER';
    }
  }

  if (titreUpper.includes('CAISSON') || titreUpper.includes('SOUS-FACE') || titreUpper.includes('SF 200') || titreUpper.includes('SF 300') || titreUpper.includes('SOMO 25') || titreUpper.includes('SOMO 30')) {
    return 'CAISSON';
  }
  if (titreUpper.includes('TABLIER') || titreUpper.includes('LAME TABLIER') || titreUpper.includes('LAME FINALE') || titreUpper.includes('COULISSE VOLET') || titreUpper.includes('T-45') || titreUpper.includes('T-55') || titreUpper.includes('T-77')) {
    return 'TABLIER';
  }
  if (
    titreUpper.includes('PRÉCADRE') ||
    titreUpper.includes('PRECADRE') ||
    titreUpper.includes('RENFORT') ||
    (!titreUpper.includes('MSTQ') && !titreUpper.includes('MOUST') && (titreUpper.includes('TRAVERSE') || titreUpper.includes('MONTANT')))
  ) {
    return 'PRECADRE';
  }

  if (fallbackFamille === 'TABLIER') return 'TABLIER';
  if (fallbackFamille === 'PRECADRE') return 'PRECADRE';
  if (fallbackFamille === 'MOUSTIQUAIRE') return 'MOUSTIQUAIRE';
  return 'CAISSON';
}

// Helpers robustes pour la gestion des Caissons et des Joues de Caisson
export function isSectionCaissonTunnel(sec: SectionTraitee): boolean {
  if (sec.isSousFace) return false;
  if (sec.badge === 'SOUS-FACE' || sec.badge?.includes('SOUS-FACE')) return false;

  const text = `${sec.titre} ${sec.badge || ''} ${sec.article?.designation || ''}`.toUpperCase();
  if (text.includes('SOUS-FACE') || text.includes('SOUS FACE') || text.includes('SF ') || text.startsWith('SF')) {
    return false;
  }

  return sec.famille === 'CAISSON' || text.includes('CAISSON') || text.includes('TUNNEL') || text.includes('CT ');
}

export function extraireDimensionCaisson(sec: SectionTraitee): '25' | '30' | '35' | '40' {
  // 1. Hauteur déclarée dans l'article (ex: 25 ou 250 -> 25 ; 30 ou 300 -> 30 ; 35 ou 350 -> 35 ; 40 ou 400 -> 40)
  const h = sec.article?.hauteur;
  if (h === 25 || h === 250) return '25';
  if (h === 30 || h === 300) return '30';
  if (h === 35 || h === 350) return '35';
  if (h === 40 || h === 400) return '40';

  // 2. Recherche textuelle dans désignation, titre, badge
  const txt = `${sec.article?.designation || ''} ${sec.titre || ''} ${sec.badge || ''}`.toUpperCase();

  // Test dimension 25
  if (
    txt.includes('250') ||
    txt.includes('CT25') ||
    txt.includes('CT 25') ||
    txt.includes('SOMO 25') ||
    txt.includes('SOMO25') ||
    txt.includes('JOUE 25') ||
    /\b25\b/.test(txt)
  ) {
    return '25';
  }

  // Test dimension 35
  if (
    txt.includes('350') ||
    txt.includes('CT35') ||
    txt.includes('CT 35') ||
    txt.includes('SOMO 35') ||
    txt.includes('SOMO35') ||
    txt.includes('JOUE 35') ||
    /\b35\b/.test(txt)
  ) {
    return '35';
  }

  // Test dimension 40
  if (
    txt.includes('400') ||
    txt.includes('CT40') ||
    txt.includes('CT 40') ||
    txt.includes('SOMO 40') ||
    txt.includes('SOMO40') ||
    txt.includes('JOUE 40') ||
    /\b40\b/.test(txt)
  ) {
    return '40';
  }

  // Test dimension 30
  if (
    txt.includes('300') ||
    txt.includes('CT30') ||
    txt.includes('CT 30') ||
    txt.includes('SOMO 30') ||
    txt.includes('SOMO30') ||
    txt.includes('JOUE 30') ||
    /\b30\b/.test(txt)
  ) {
    return '30';
  }

  // Caisson standard par défaut
  return '30';
}

export function determinerJoueArticle(
  dim: '25' | '30' | '35' | '40',
  catalogueArticles?: Article[]
): { codeArt: string; designation: string; dim: string } {
  const nomJoueCible = `CT JOUE ${dim}`;

  // Recherche dans le catalogue d'articles si disponible
  if (catalogueArticles && catalogueArticles.length > 0) {
    const art = catalogueArticles.find(a => 
      a.designation.trim().toUpperCase() === nomJoueCible ||
      (a.designation.toUpperCase().includes('JOUE') && a.designation.toUpperCase().includes(dim))
    );
    if (art) {
      return {
        codeArt: art.code_art,
        designation: art.designation,
        dim
      };
    }
  }

  // Codes standards de la base de données 3M Atelier
  const defaultCodes: Record<string, string> = {
    '25': 'ART0063',
    '30': 'ART0064',
    '35': 'ART0067',
    '40': 'ART0068'
  };

  return {
    codeArt: defaultCodes[dim] || 'ART0064',
    designation: nomJoueCible,
    dim
  };
}

/**
 * Nettoie une chaîne de caractères en supprimant les caractères corrompus (\uFFFD, etc.)
 */
export function cleanTextFrench(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\uFFFD\u0080-\u009F\uF000-\uFFFF]/g, '')
    .replace(/[]/g, '')
    .replace(/^[📦📐🚪🏁🔩📏🔲🖼️•\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sépare la famille de profilé et la désignation exacte du profilé
 * avec un nettoyage rigoureux pour un affichage imposant, clair et captivant.
 */
export function separerFamilleEtProfile(sec: { titre: string; famille?: string; badge?: string }) {
  const raw = cleanTextFrench(sec.titre || '');
  let familleLabel = '';
  let profileDesignation = '';

  if (raw.includes(':')) {
    const idx = raw.indexOf(':');
    familleLabel = cleanTextFrench(raw.substring(0, idx));
    profileDesignation = cleanTextFrench(raw.substring(idx + 1));
  } else {
    profileDesignation = raw;
    if (sec.famille === 'TABLIER') familleLabel = 'LAMES TABLIER';
    else if (sec.famille === 'CAISSON') familleLabel = 'CAISSON TUNNEL';
    else if (sec.famille === 'PRECADRE') familleLabel = 'PRÉ-CADRE';
    else if (sec.famille === 'MOUSTIQUAIRE') familleLabel = 'MOUSTIQUAIRE';
    else if (sec.badge) familleLabel = sec.badge;
    else familleLabel = 'PROFILÉ';
  }

  // Nettoyage supplémentaire si préfixe générique
  if (!familleLabel || familleLabel === 'SECTION' || familleLabel === 'POSTE') {
    if (sec.famille === 'TABLIER') familleLabel = 'LAMES TABLIER';
    else if (sec.famille === 'CAISSON') familleLabel = 'CAISSON TUNNEL';
    else if (sec.famille === 'PRECADRE') familleLabel = 'PRÉ-CADRE';
    else if (sec.famille === 'MOUSTIQUAIRE') familleLabel = 'MOUSTIQUAIRE';
    else if (sec.badge) familleLabel = sec.badge;
    else familleLabel = 'PROFILÉ';
  }

  return {
    familleLabel: (familleLabel || 'PROFILÉ').toUpperCase(),
    profileDesignation: (profileDesignation || raw).toUpperCase()
  };
}

/**
 * Détection robuste de la véritable famille d'un OF
 */
export function detecterFamilleOF(
  famille?: FamilleProduit | string,
  sections?: SectionDebitOF[],
  lignesMoustiquaires?: any[],
  titreProduit?: string,
  refCommande?: string
): FamilleProduit {
  if (famille === 'TABLIER' || famille === 'MOUSTIQUAIRE' || famille === 'CAISSON' || famille === 'PRECADRE') {
    return famille;
  }
  if (sections && sections.length > 0) {
    const secFamilies = sections.map((s: any) => s.famille).filter(Boolean);
    const uniqueFams = Array.from(new Set(secFamilies));
    if (uniqueFams.includes('TABLIER') && !uniqueFams.includes('CAISSON')) return 'TABLIER';
    if (uniqueFams.includes('MOUSTIQUAIRE') && !uniqueFams.includes('CAISSON')) return 'MOUSTIQUAIRE';
    if (uniqueFams.includes('PRECADRE') && !uniqueFams.includes('CAISSON')) return 'PRECADRE';
    if (uniqueFams.length === 1 && (uniqueFams[0] === 'TABLIER' || uniqueFams[0] === 'MOUSTIQUAIRE' || uniqueFams[0] === 'PRECADRE' || uniqueFams[0] === 'CAISSON')) {
      return uniqueFams[0] as FamilleProduit;
    }
  }
  if (lignesMoustiquaires && lignesMoustiquaires.length > 0) return 'MOUSTIQUAIRE';
  const titreUpper = (titreProduit || '').toUpperCase();
  if (titreUpper.includes('TABLIER') || titreUpper.includes('VOLET') || titreUpper.includes('LAME')) return 'TABLIER';
  if (titreUpper.includes('MOUSTIQUAIRE') || titreUpper.includes('MSTQ')) return 'MOUSTIQUAIRE';
  if (titreUpper.includes('PRÉCADRE') || titreUpper.includes('PRECADRE')) return 'PRECADRE';
  if (titreUpper.includes('CAISSON') || titreUpper.includes('SOUS-FACE')) return 'CAISSON';
  const refUpper = (refCommande || '').toUpperCase();
  if (refUpper.startsWith('SA-')) return 'TABLIER';
  if (refUpper.startsWith('SC-') || refUpper.startsWith('D-')) return 'MOUSTIQUAIRE';
  if (refUpper.startsWith('1R')) return 'PRECADRE';
  return 'CAISSON';
}

export const OrdreFabricationModal: React.FC<OrdreFabricationModalProps> = ({
  isOpen,
  onClose,
  titreProduit = 'Fiche de Coupe',
  refCommande,
  nomClient,
  dateCommande,
  coloris = '',
  article = null,
  resultat = null,
  sections,
  lignesMoustiquaires = [],
  chutesMaille = [],
  mapping,
  famille = 'CAISSON',
  articles = [],
  donneurOrdre = '',
  numCommandeCaisson = '',
  numCommandeSousFace = '',
  numCommandeTablier = '',
  numCommandeMoustiquaire = '',
  numCommandePrecadre = '',
  paramsMaille,
  numeroEmission,
  codeOF,
  dateLivraisonPrevisionnelle,
  dateLivraisonPrevisionnelleISO,
  dossierId,
  onOFEmis
}) => {
  const [ofEmis, setOfEmis] = useState<boolean>(false);
  const [isEmitting, setIsEmitting] = useState<boolean>(false);
  const [emittedSequence, setEmittedSequence] = useState<number | null>(numeroEmission || null);
  const [emittedCode, setEmittedCode] = useState<string | null>(codeOF || null);
  const [nextSequencePreview, setNextSequencePreview] = useState<number | null>(null);
  const [dateLivraisonPrevisionnelleAffichee, setDateLivraisonPrevisionnelleAffichee] = useState<string>('');
  const [estPrioritaire, setEstPrioritaire] = useState<boolean>(false);
  const [motifPriorite, setMotifPriorite] = useState<string>('');
  const [dateLivraisonISO, setDateLivraisonISO] = useState<string>('');
  const [isEditingDelai, setIsEditingDelai] = useState<boolean>(false);
  const [allOfsState, setAllOfsState] = useState<SuiviOF[]>([]);
  const [matchedOf, setMatchedOf] = useState<SuiviOF | null>(null);
  const [optimiserImpressionAntiPagesBlanches, setOptimiserImpressionAntiPagesBlanches] = useState<boolean>(true);

  useEffect(() => {
    if (numeroEmission) setEmittedSequence(numeroEmission);
    if (codeOF) setEmittedCode(codeOF);
  }, [numeroEmission, codeOF]);

  useEffect(() => {
    if (!isOpen) return;

    // Calcul du volume réel de pièces de cet OF d'après les lignes de coupe ou moustiquaires
    let totalPiecesDuOF = 0;
    if (Array.isArray(lignesMoustiquaires) && lignesMoustiquaires.length > 0) {
      totalPiecesDuOF = lignesMoustiquaires.reduce((sum, m) => sum + (Number(m.quantite) || 1), 0);
    } else if (Array.isArray(sections) && sections.length > 0) {
      sections.forEach(s => {
        if (s.resultat?.barres_neuves) {
          s.resultat.barres_neuves.forEach(b => {
            totalPiecesDuOF += Array.isArray(b.pieces) ? b.pieces.length : 1;
          });
        }
        if (s.resultat?.chutes_utilisees) {
          s.resultat.chutes_utilisees.forEach(c => {
            totalPiecesDuOF += Array.isArray(c.pieces) ? c.pieces.length : 1;
          });
        }
      });
      if (totalPiecesDuOF === 0) {
        totalPiecesDuOF = sections.reduce((sum, s) => sum + (s.resultat?.total_barres_neuves || 1) * 3, 0);
      }
    }
    const nbPiecesOFReelles = Math.max(1, totalPiecesDuOF);

    Promise.all([
      StorageService.getSuivisOF(),
      StorageService.getDossiers()
    ]).then(([ofs, dossiers]) => {
      setAllOfsState(ofs);
      // Détection de la famille active
      const familleRecherche = detecterFamilleOF(famille, sections, lignesMoustiquaires, titreProduit, refCommande);

      // Recherche du dossier lié pour récupérer la date paramétrée et le statut de pause
      const cmdRefLower = (refCommande || '').trim().toLowerCase();
      const matchedDossier = (dossierId ? dossiers.find(d => d.id === dossierId) : null) ||
        dossiers.find(d => {
          const r = (d.refCommande || '').trim().toLowerCase();
          const c = (d.numCommandeCaisson || '').trim().toLowerCase();
          const t = (d.numCommandeTablier || '').trim().toLowerCase();
          const m = (d.numCommandeMoustiquaire || '').trim().toLowerCase();
          const p = (d.numCommandePrecadre || '').trim().toLowerCase();
          return (
            (r && (r === cmdRefLower || cmdRefLower.includes(r))) ||
            (c && (c === cmdRefLower || cmdRefLower.includes(c))) ||
            (t && (t === cmdRefLower || cmdRefLower.includes(t))) ||
            (m && (m === cmdRefLower || cmdRefLower.includes(m))) ||
            (p && (p === cmdRefLower || cmdRefLower.includes(p)))
          );
        });

      const famKey = (familleRecherche || famille || '').toUpperCase();
      const customFamDate = matchedDossier?.datesLivraisonCommandes?.[famKey];

      // Priorité absolue à la date configurée dans le dossier ou passée en props lors de la saisie
      const dateConfiguredText = dateLivraisonPrevisionnelle || customFamDate?.dateLivraisonPrevisionnelle || matchedDossier?.dateLivraisonPrevisionnelle;
      const dateConfiguredISO = dateLivraisonPrevisionnelleISO || customFamDate?.dateLivraisonISO || matchedDossier?.dateLivraisonPrevisionnelleISO;

      const match = ofs.find(o =>
        o.numCommande === (refCommande || 'CMD') &&
        (o.titreSection === (titreProduit || 'Fiche de Coupe') || o.famille === familleRecherche || o.famille === famille)
      );

      const isDossierOrOfEnPause = !!(matchedDossier?.estEnPause || matchedDossier?.statut === 'EN_PAUSE' || match?.estEnPause || match?.statut === 'EN_PAUSE');

      if (match?.numeroEmission) {
        setEmittedSequence(match.numeroEmission);
        setEmittedCode(match.codeOF || `OF-${String(match.numeroEmission).padStart(3, '0')}`);
        setOfEmis(true);
        if (!match.nombrePieces) match.nombrePieces = nbPiecesOFReelles;
        setMatchedOf(match);
        if (match.estPrioritaire || matchedDossier?.estPrioritaire || matchedDossier?.typePriorite === 'INSTANTANE') setEstPrioritaire(true);
        if (match.motifPriorite || matchedDossier?.motifPriorite) setMotifPriorite(match.motifPriorite || matchedDossier?.motifPriorite || '');
        
        if (dateConfiguredISO || match.dateLivraisonPrevisionnelleISO) {
          setDateLivraisonISO(dateConfiguredISO || match.dateLivraisonPrevisionnelleISO || '');
        }

        if (isDossierOrOfEnPause) {
          setDateLivraisonPrevisionnelleAffichee('⏸️ EN PAUSE');
        } else if (dateConfiguredText) {
          setDateLivraisonPrevisionnelleAffichee(dateConfiguredText);
        } else if (match.dateLivraisonPrevisionnelle) {
          setDateLivraisonPrevisionnelleAffichee(match.dateLivraisonPrevisionnelle);
        } else {
          const estim = DelaisProductionService.estimerDelaiOF(match, ofs);
          setDateLivraisonPrevisionnelleAffichee(estim.texteFormatte);
          setDateLivraisonISO(estim.dateLivraisonISO);
        }
      } else {
        const maxNum = ofs.reduce<number>((m, o) => Math.max(m, o.numeroEmission || 0), 0);
        setNextSequencePreview(maxNum + 1);
        setMatchedOf(null);

        if (matchedDossier?.estPrioritaire || matchedDossier?.typePriorite === 'INSTANTANE') {
          setEstPrioritaire(true);
          setMotifPriorite(matchedDossier.motifPriorite || '');
        }

        if (isDossierOrOfEnPause) {
          setDateLivraisonPrevisionnelleAffichee('⏸️ EN PAUSE');
          if (dateConfiguredISO) {
            setDateLivraisonISO(dateConfiguredISO);
          }
        } else if (dateConfiguredText) {
          // Si la date a été réglée sur l'Écosystème lors de la saisie de la commande, la garder rigoureusement !
          setDateLivraisonPrevisionnelleAffichee(dateConfiguredText);
          if (dateConfiguredISO) {
            setDateLivraisonISO(dateConfiguredISO);
          }
        } else {
          // Calcul prévisionnel initial de livraison si non renseigné
          const ofRef: SuiviOF = {
            id: 'preview',
            numCommande: refCommande || 'CMD',
            nomClient: nomClient || agenceInfo.nom || '',
            donneurOrdre: donneurOrdre || agenceInfo.nom || '',
            famille: familleRecherche,
            statut: 'EMIS',
            dateEmission: dateCommande || new Date().toLocaleDateString('fr-FR'),
            titreSection: titreProduit || '',
            totalBarresNeuvesPrevu: 0,
            totalChutesUtiliseesPrevu: 0,
            nombrePieces: nbPiecesOFReelles,
            lignesRetour: [],
            estPrioritaire: !!(estPrioritaire || matchedDossier?.estPrioritaire)
          };
          const estim = DelaisProductionService.estimerDelaiOF(ofRef, ofs);
          setDateLivraisonPrevisionnelleAffichee(estim.texteFormatte);
          setDateLivraisonISO(estim.dateLivraisonISO);
        }
      }
    }).catch(() => {});
  }, [isOpen, refCommande, titreProduit, famille, sections, lignesMoustiquaires, dateCommande, dateLivraisonPrevisionnelle, dateLivraisonPrevisionnelleISO, dossierId]);

  const currentSequenceNum = emittedSequence || nextSequencePreview || 1;
  const currentCodeOFAffiche = emittedCode || `OF-${String(currentSequenceNum).padStart(3, '0')}`;

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('of-modal-open');
    } else {
      document.body.classList.remove('of-modal-open');
    }
    return () => {
      document.body.classList.remove('of-modal-open');
    };
  }, [isOpen]);

  // Calcul et optimisation des attributions chutes pour la maille moustiquaire
  const resultatsMaille = useMemo(() => {
    const mstqToile = (lignesMoustiquaires || []).filter(m => m.typeFabrication !== 'PROFILES_SEULS');
    return optimiserLotMoustiquaires(mstqToile, chutesMaille, paramsMaille);
  }, [lignesMoustiquaires, chutesMaille, paramsMaille]);

  // Traitement et structuration de toutes les sections
  const listeSections: SectionTraitee[] = useMemo(() => {
    let rawSections: SectionDebitOF[] = [];

    if (sections && sections.length > 0) {
      rawSections = sections.filter(s => s && s.resultat);
    } else if (resultat) {
      rawSections = [{ titreSection: titreProduit, article, resultat, coloris, famille }];
    }

    return rawSections.map((sec, idx) => {
      const res = sec.resultat;
      const art = sec.article;
      const barresNeuves = Array.isArray(res.barres_neuves) ? res.barres_neuves : [];
      const chutesUtilisees = Array.isArray(res.chutes_utilisees) ? res.chutes_utilisees : [];

      const barreLongueur = sec.conditionsCoupe?.longueurBarre || art?.longeur || barresNeuves[0]?.longueur_barre || 6000;
      const lameScie = sec.conditionsCoupe?.epaisseurLame || art?.lame || 4.5;
      const margeDebord = (sec.conditionsCoupe?.debordement !== undefined && sec.conditionsCoupe?.debordement !== null)
        ? sec.conditionsCoupe.debordement
        : (sec.debordement !== undefined && sec.debordement !== null)
        ? sec.debordement
        : (art?.debordement || 0.0);
      const refusMin = sec.conditionsCoupe?.refusMin ?? res.refus_min ?? art?.refus_min ?? 500;
      const refusMax = sec.conditionsCoupe?.refusMax ?? res.refus_max ?? art?.refus_max ?? 1100;
      const familleCalculee = determinerFamille(sec, famille);

      // Groupement BARRES NEUVES
      const mapBarres = new Map<string, GroupeBarreNeuve>();
      barresNeuves.forEach((b, bIdx) => {
        const pieces = Array.isArray(b.pieces) ? b.pieces : [];
        const piecesInfo = pieces.map(p => extraireRepereEtLg(p));
        const sig = piecesInfo.map(p => `${p.longueur}_${p.repere}_${p.cmdTag}`).join('|');
        if (!mapBarres.has(sig)) {
          mapBarres.set(sig, {
            quantite: 0,
            longueurBarre: b.longueur_barre,
            pieces,
            piecesInfo,
            utilise: b.utilise,
            chute: b.chute,
            statut: b.statut,
            barreIndices: []
          });
        }
        const g = mapBarres.get(sig)!;
        g.quantite += 1;
        g.barreIndices.push(bIdx + 1);
      });
      const groupesBarresNeuves = Array.from(mapBarres.values()).sort((a, b) => b.quantite - a.quantite);

      // Groupement CHUTES RÉCUPÉRÉES
      const mapChutes = new Map<string, GroupeChuteRecup>();
      chutesUtilisees.forEach((c, cIdx) => {
        const pieces = Array.isArray(c.pieces) ? c.pieces : [];
        const piecesInfo = pieces.map(p => extraireRepereEtLg(p));
        const sig = `${Math.round(c.longueur_chute_depart)}:` + piecesInfo.map(p => `${p.longueur}_${p.repere}_${p.cmdTag}`).join('|');
        if (!mapChutes.has(sig)) {
          mapChutes.set(sig, {
            quantite: 0,
            support: c.longueur_chute_depart,
            pieces,
            piecesInfo,
            utilise: c.utilise,
            reste: c.reste,
            chuteIndices: [],
            chuteId: c.chuteIdStock
          });
        }
        const g = mapChutes.get(sig)!;
        g.quantite += 1;
        g.chuteIndices.push(cIdx + 1);
        if (!g.chuteId && c.chuteIdStock) {
          g.chuteId = c.chuteIdStock;
        }
      });
      const groupesChutesRecup = Array.from(mapChutes.values()).sort((a, b) => b.support - a.support);

      const titreBrut = sec.titreSection || art?.designation || `Poste ${idx + 1}`;
      // Nettoyer rigoureusement les caractères corrompus (\uFFFD, non-breakables, bullets mal encodés)
      const titreNettoye = titreBrut
        .replace(/[\uFFFD\u0080-\u009F]/g, '')
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/^[📦📐🚪🏁🔩📏🔲🖼️]\s*/, '')
        .replace(/:\s*•\s*/, ': ')
        .replace(/:\s+/, ': ')
        .trim();
      const titrePropre = titreNettoye;
      const isSousFaceDetected = !!sec.isSousFace || sec.badge === 'SOUS-FACE' || titreBrut.includes('SF') || titreBrut.includes('Sous-Face');

      return {
        titre: titrePropre,
        badge: sec.badge,
        article: art,
        resultat: res,
        barreLongueur,
        lameScie,
        margeDebord,
        refusMin,
        refusMax,
        conditionsCoupe: sec.conditionsCoupe,
        avecPeinture: !!sec.avecPeinture,
        avecSousFace: !!sec.avecSousFace,
        montageSousFace: sec.montageSousFace || 'NON_MONTEE',
        avecPlaque: sec.avecPlaque,
        isSousFace: isSousFaceDetected,
        famille: familleCalculee,
        commandesInvolved: sec.commandesInvolved,
        groupesBarresNeuves,
        groupesChutesRecup
      };
    }).filter(sec => (sec.groupesBarresNeuves && sec.groupesBarresNeuves.length > 0) || (sec.groupesChutesRecup && sec.groupesChutesRecup.length > 0));
  }, [sections, resultat, article, titreProduit, coloris, famille]);

  // Regroupement par Familles
  const sectionsParFamille = useMemo(() => {
    const caissons = listeSections.filter(s => s.famille === 'CAISSON');
    const tabliers = listeSections.filter(s => s.famille === 'TABLIER');
    const precadres = listeSections.filter(s => s.famille === 'PRECADRE');
    const moustiquaires = listeSections.filter(s => s.famille === 'MOUSTIQUAIRE');

    return {
      caissons,
      tabliers,
      precadres,
      moustiquaires
    };
  }, [listeSections]);

  // Tableau récapitulatif global de toute la matière première et chutes à déstocker
  const syntheseMatieres: SynthseMatiereItem[] = useMemo(() => {
    const map = new Map<string, SynthseMatiereItem>();

    listeSections.forEach(sec => {
      const codeArt = sec.article?.code_art || sec.resultat.articleCode || 'ART-STANDARD';
      const designation = sec.article?.designation || sec.resultat.articleDesignation || sec.titre;
      const key = `${sec.famille}_${codeArt}`;

      if (!map.has(key)) {
        map.set(key, {
          famille: sec.famille,
          codeArt,
          designation,
          longueurBarre: sec.barreLongueur || 6000,
          nbBarresNeuves: 0,
          metrageBarresM: 0,
          chutes: []
        });
      }

      const item = map.get(key)!;
      const nbNeuves = sec.resultat.total_barres_neuves || 0;
      item.nbBarresNeuves += nbNeuves;
      item.metrageBarresM += (nbNeuves * item.longueurBarre) / 1000;

      sec.groupesChutesRecup.forEach(g => {
        const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
        const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
        const statutReste = g.reste >= rMax ? 'À STOCKER' : g.reste <= rMin ? 'DÉCHET' : 'À SACRIFIER';

        item.chutes.push({
          longueurDepart: Math.round(g.support),
          quantite: g.quantite,
          restePrevu: Math.round(g.reste),
          statutReste
        });
      });
    });

    // Exclusion stricte des articles n'ayant ni barre neuve ni chute (quantité 0)
    return Array.from(map.values())
      .filter(item => item.nbBarresNeuves > 0 || item.chutes.length > 0)
      .sort((a, b) => {
        const ordreFamilles: Record<FamilleOF, number> = { CAISSON: 1, TABLIER: 2, PRECADRE: 3, MOUSTIQUAIRE: 4 };
        return ordreFamilles[a.famille] - ordreFamilles[b.famille];
      });
  }, [listeSections]);

  // Barres neuves uniquement avec quantité > 0 (jamais de quantité 0 affichée)
  const matieresNeuvesUniquement = useMemo(() => {
    return syntheseMatieres.filter(m => m.nbBarresNeuves > 0);
  }, [syntheseMatieres]);

  // Accessoires et Joues à préparer par le gestionnaire de stocks (2 Joues par Caisson CT débité)
  const syntheseAccessoires: SyntheseAccessoireItem[] = useMemo(() => {
    const map = new Map<string, SyntheseAccessoireItem>();

    listeSections.forEach(sec => {
      // Pour les caissons (hors sous-faces pures) : 2 Joues par caisson débité
      if (isSectionCaissonTunnel(sec)) {
        const nbCaissonsNeuves = sec.groupesBarresNeuves.reduce((sum, g) => sum + (g.quantite * g.piecesInfo.length), 0);
        const nbCaissonsChutes = sec.groupesChutesRecup.reduce((sum, g) => sum + (g.quantite * g.piecesInfo.length), 0);
        const totalCaissons = nbCaissonsNeuves + nbCaissonsChutes;

        if (totalCaissons > 0) {
          const dim = extraireDimensionCaisson(sec);
          const joueInfo = determinerJoueArticle(dim, articles);
          const quantiteJoues = totalCaissons * 2; // Règle stricte : 2 Joues par caisson

          const key = `JOUE_${dim}`;
          if (!map.has(key)) {
            map.set(key, {
              famille: 'CAISSON',
              codeArt: joueInfo.codeArt,
              designation: joueInfo.designation,
              dimension: dim,
              quantiteRequise: 0,
              unite: 'pièces',
              regleCalcul: '2 Joues / caisson débité',
              detailPieces: ''
            });
          }

          const item = map.get(key)!;
          item.quantiteRequise += quantiteJoues;
          const detailStr = `${totalCaissons} caisson(s) (${sec.titre})`;
          item.detailPieces = item.detailPieces ? `${item.detailPieces}, ${detailStr}` : detailStr;
        }
      }
    });

    return Array.from(map.values());
  }, [listeSections, articles]);

  // Préparation magasin active (si barres neuves, chutes, accessoires ou toile existent)
  const hasAnyPreparation = useMemo(() => {
    const matieresNeuves = syntheseMatieres.filter(m => m.nbBarresNeuves > 0);
    const chutesADestoquer = syntheseMatieres.flatMap(m => m.chutes);
    const accessoiresFiltres = syntheseAccessoires.filter(a => !(a.designation || '').toUpperCase().includes('JOUE'));
    const hasToile = Boolean(lignesMoustiquaires && lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').length > 0);
    return matieresNeuves.length > 0 || chutesADestoquer.length > 0 || accessoiresFiltres.length > 0 || hasToile;
  }, [syntheseMatieres, syntheseAccessoires, lignesMoustiquaires]);

  // Totaux globaux
  const totalBarresNeuvesToutesSections = listeSections.reduce((s, sec) => s + (sec.resultat.total_barres_neuves || 0), 0);
  const totalChutesRecycleesToutesSections = listeSections.reduce((s, sec) => s + (sec.resultat.total_chutes_recyclees || 0), 0);
  const totalStockableMm = listeSections.reduce((s, sec) => s + (sec.resultat.total_chute_mm || 0), 0);
  const totalDechetMm = listeSections.reduce((s, sec) => s + (sec.resultat.total_dechet_mm || 0), 0);
  const totalAccessoiresToutesSections = syntheseAccessoires.reduce((s, acc) => s + acc.quantiteRequise, 0);
  const totalPiecesToutesSections = useMemo(() => {
    if (Array.isArray(lignesMoustiquaires) && lignesMoustiquaires.length > 0) {
      return lignesMoustiquaires.reduce((sum, m) => sum + (Number(m.quantite) || 1), 0);
    }
    let sumPieces = 0;
    listeSections.forEach(sec => {
      sec.resultat?.barres_neuves?.forEach(b => {
        sumPieces += Array.isArray(b.pieces) ? b.pieces.length : 1;
      });
      sec.resultat?.chutes_utilisees?.forEach(c => {
        sumPieces += Array.isArray(c.pieces) ? c.pieces.length : 1;
      });
    });
    return sumPieces > 0 ? sumPieces : totalBarresNeuvesToutesSections * 3;
  }, [listeSections, lignesMoustiquaires, totalBarresNeuvesToutesSections]);

  if (!isOpen) return null;
  if (listeSections.length === 0) return null;

  const clientAffiche = nomClient || 'CLIENT';
  const cmdAffichee = refCommande || 'COMMANDE';
  const dateAffichee = dateCommande || new Date().toLocaleDateString('fr-FR');
  const agenceInfo = detecterAgence(cmdAffichee);

  const labelFinition = (avecPeinture: boolean) => (avecPeinture ? 'AVEC PEINTURE' : 'SANS PEINTURE');
  const labelMontage = (avecSousFace: boolean, montage: string) => (!avecSousFace ? '' : montage === 'MONTEE_ATELIER' ? 'AVEC MONTAGE' : 'SANS MONTAGE');

  /* ─── RENDU HTML POUR EXPORT / TÉLÉCHARGEMENT ─────────────────────────────── */
  const buildSectionHTML = (sec: SectionTraitee, index?: number, total?: number) => {
    if (sec.groupesBarresNeuves.length === 0 && sec.groupesChutesRecup.length === 0) {
      return '';
    }
    const { familleLabel, profileDesignation } = separerFamilleEtProfile(sec);
    const conditionsHtml = sec.titre.toUpperCase().includes('CAISSON') ? [
      labelFinition(sec.avecPeinture),
      sec.avecSousFace ? labelMontage(sec.avecSousFace, sec.montageSousFace) : '',
      sec.avecPlaque !== undefined ? (sec.avecPlaque ? 'AVEC PLAQUE' : 'SANS PLAQUE') : ''
    ].filter(Boolean).join(' | ') : '';

    const barresHTML = sec.groupesBarresNeuves.map(g => {
      const nbPieces = g.piecesInfo.length;
      const rows = g.piecesInfo.map((p, pIdx) => {
        const isLast = pIdx === nbPieces - 1;
        const cutBorderClass = isLast ? 'border-bar-solid' : 'border-cut-dashed';
        return `
        <tr>
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:6%;text-align:center;font-weight:900;color:#000;font-size:26px;background:#fff;padding:6px 2px;vertical-align:middle;">${g.quantite}</td>
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:12%;text-align:center;font-family:Consolas,monospace;font-weight:900;font-size:14px;color:#000;background:#fff;padding:6px 2px;vertical-align:middle;">Barre ${Math.round(sec.barreLongueur || 6000)} mm</td>
          ` : ''}
          <td class="${cutBorderClass}" style="width:14%;font-family:Consolas,monospace;padding:6px 2px;vertical-align:middle;text-align:center;">
            <span class="repere-badge" style="font-size:19px;font-weight:900;color:#000;display:inline-block;letter-spacing:0.5px;">${p.repere}</span>
          </td>
          <td class="${cutBorderClass}" style="width:30%;font-family:Consolas,monospace;font-weight:900;padding:6px 4px;vertical-align:middle;text-align:center;">
            <span class="longueur-coupe" style="font-size:23px;font-weight:900;color:#000;display:inline-block;letter-spacing:0.5px;">${p.longueur} mm</span>
          </td>
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:14%;text-align:center;font-weight:900;font-family:Consolas,monospace;color:#000;background:#fff;padding:6px 2px;vertical-align:middle;">
              <span class="reste-badge" style="font-size:19px;font-weight:900;color:#000;display:inline-block;">${Math.round(g.chute)} mm</span>
            </td>
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:11%;text-align:center;font-weight:900;font-size:13px;color:#000;background:#fff;padding:6px 2px;vertical-align:middle;">
              <span style="font-weight:900;display:inline-block;">
                ${g.statut === 'STOCK' ? '📦 À STOCKER' : g.statut === 'Dechet' ? '🗑️ DÉCHET' : '⚠️ SACRIFIER'}
              </span>
            </td>
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:13%;padding:6px 2px;vertical-align:middle;text-align:center;background:#fff;">
              <div style="border-bottom:2px dashed #000;height:22px;margin:2px 4px;display:flex;align-items:flex-end;justify-content:center;font-size:12px;color:#000;font-style:italic;">cote réelle mm</div>
            </td>
          ` : ''}
        </tr>`;
      }).join('');
      return `<tbody style="page-break-inside:avoid;break-inside:avoid;background:#fff;">${rows}</tbody>`;
    }).join('');

    const chutesHTML = sec.groupesChutesRecup.map(g => {
      const nbPieces = g.piecesInfo.length;
      const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
      const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
      const chuteStatut = g.reste >= rMax ? '📦 À STOCKER' : g.reste <= rMin ? '🗑️ DÉCHET' : '⚠️ SACRIFIER';
      const rows = g.piecesInfo.map((p, pIdx) => {
        const isLast = pIdx === nbPieces - 1;
        const cutBorderClass = isLast ? 'border-bar-solid' : 'border-cut-dashed';
        return `
        <tr>
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:6%;text-align:center;font-weight:900;color:#000;font-size:26px;background:#fff;padding:6px 2px;vertical-align:middle;">${g.quantite}</td>
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:12%;text-align:center;font-family:Consolas,monospace;font-weight:900;font-size:14px;color:#000;background:#fff;padding:6px 2px;vertical-align:middle;">Chute ${Math.round(g.support)} mm</td>
          ` : ''}
          <td class="${cutBorderClass}" style="width:14%;font-family:Consolas,monospace;padding:6px 2px;vertical-align:middle;text-align:center;">
            <span class="repere-badge" style="font-size:19px;font-weight:900;color:#000;display:inline-block;letter-spacing:0.5px;">${p.repere}</span>
          </td>
          <td class="${cutBorderClass}" style="width:30%;font-family:Consolas,monospace;font-weight:900;padding:6px 4px;vertical-align:middle;text-align:center;">
            <span class="longueur-coupe" style="font-size:23px;font-weight:900;color:#000;display:inline-block;letter-spacing:0.5px;">${p.longueur} mm</span>
          </td>
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:14%;text-align:center;font-weight:900;font-family:Consolas,monospace;color:#000;background:#fff;padding:6px 2px;vertical-align:middle;">
              <span class="reste-badge" style="font-size:19px;font-weight:900;color:#000;display:inline-block;">${Math.round(g.reste)} mm</span>
            </td>
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:11%;text-align:center;font-weight:900;font-size:13px;color:#000;background:#fff;padding:6px 2px;vertical-align:middle;">
              <span style="font-weight:900;display:inline-block;">${chuteStatut}</span>
            </td>
            <td rowspan="${nbPieces}" class="border-bar-solid" style="width:13%;padding:6px 2px;vertical-align:middle;text-align:center;background:#fff;">
              <div style="border-bottom:2px dashed #000;height:22px;margin:2px 4px;display:flex;align-items:flex-end;justify-content:center;font-size:12px;color:#000;font-style:italic;">cote réelle mm</div>
            </td>
          ` : ''}
        </tr>`;
      }).join('');
      return `<tbody style="page-break-inside:avoid;break-inside:avoid;background:#fff;">${rows}</tbody>`;
    }).join('');

    return `
    <div class="section-container" style="page-break-inside:auto;break-inside:auto;margin-bottom:12px;">
      <div style="background:#fff;border:2.5px solid #000;color:#000;padding:6px 12px;margin-bottom:6px;border-radius:6px;display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap;text-align:center;page-break-after:avoid;break-after:avoid;page-break-inside:avoid;break-inside:avoid;">
        <span style="background:#fff;color:#000;font-weight:900;font-size:18px;padding:3px 12px;border-radius:4px;text-transform:uppercase;border:2px solid #000;letter-spacing:0.5px;">
          ${familleLabel}
        </span>
        <span style="color:#000;font-size:24px;font-weight:900;">&rarr;</span>
        <strong style="font-size:28px;font-weight:900;color:#000;font-family:Consolas,monospace;text-transform:uppercase;letter-spacing:1px;background:#fff;padding:3px 14px;border:2.5px solid #000;border-radius:6px;">
          ${profileDesignation}
        </strong>
        ${total !== undefined && index !== undefined ? `<span style="font-size:13px;font-weight:900;background:#000;color:#fff;padding:3px 10px;border-radius:4px;font-family:Consolas,monospace;letter-spacing:0.5px;">PROFILÉ ${index + 1} / ${total}</span>` : ''}
        ${conditionsHtml ? conditionsHtml.split(' | ').map(c => `<span style="font-size:12px;color:#000;font-weight:900;background:#fff;border:2px solid #000;padding:3px 8px;border-radius:4px;">${c}</span>`).join(' ') : ''}
        <div style="width:100%;border-top:1.5px dashed #000;padding-top:4px;margin-top:4px;font-size:12px;font-family:Consolas,monospace;font-weight:900;color:#000;display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="background:#000;color:#fff;padding:1px 6px;border-radius:3px;font-size:11px;letter-spacing:0.5px;">CONDITION DE COUPE</span>
          <span>Barre brute : <strong>${Math.round(sec.barreLongueur || 6000)} mm</strong></span>
          <span>•</span>
          <span>Lame scie : <strong>${sec.lameScie || 4.5} mm</strong></span>
          <span>•</span>
          <span style="${sec.margeDebord > 0 ? 'background:#fef3c7;border:1px solid #f59e0b;padding:1px 6px;border-radius:3px;' : ''}">Débordement : <strong>${sec.margeDebord > 0 ? `+${sec.margeDebord} mm` : '0 mm'}</strong></span>
          <span>•</span>
          <span>Reste min / max : <strong>${sec.refusMin || 500} / ${sec.refusMax || 1100} mm</strong></span>
        </div>
      </div>
      ${sec.groupesBarresNeuves.length > 0 ? `
      <div style="font-size:14px;font-weight:900;margin:6px 0 4px 0;text-align:center;text-transform:uppercase;color:#000;page-break-after:avoid;break-after:avoid;page-break-inside:avoid;break-inside:avoid;">
        COUPES SUR BARRES NEUVES (${sec.resultat.total_barres_neuves} barre(s) — Rendement : ${sec.resultat.taux_rendement}%)
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed;border:2.5px solid #000;">
        <colgroup>
          <col style="width:6%;">
          <col style="width:12%;">
          <col style="width:14%;">
          <col style="width:30%;">
          <col style="width:14%;">
          <col style="width:11%;">
          <col style="width:13%;">
        </colgroup>
        <thead><tr style="background:#fff;border-bottom:2.5px solid #000;">
          <th style="width:6%;text-align:center;font-size:16px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Qté</th>
          <th style="width:12%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Origine</th>
          <th style="width:14%;font-size:14px;font-weight:900;padding:6px 4px;border-right:2px solid #000;text-align:center;background:#fff;color:#000;">Repère</th>
          <th style="width:30%;text-align:center;font-size:14px;font-weight:900;padding:6px 4px;border-right:2px solid #000;background:#fff;color:#000;">Longueur(s) Coupe</th>
          <th style="width:14%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Reste</th>
          <th style="width:11%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Statut</th>
          <th style="width:13%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;background:#fff;color:#000;">Nouvelle Chute</th>
        </tr></thead>
        ${barresHTML}
      </table>` : ''}
      ${sec.groupesChutesRecup.length > 0 ? `
      <div style="font-size:14px;font-weight:900;margin:6px 0 4px 0;text-align:center;text-transform:uppercase;color:#000;page-break-after:avoid;break-after:avoid;page-break-inside:avoid;break-inside:avoid;">
        COUPES SUR CHUTES DU STOCK (${sec.resultat.total_chutes_recyclees} chute(s))
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed;border:2.5px solid #000;">
        <colgroup>
          <col style="width:6%;">
          <col style="width:12%;">
          <col style="width:14%;">
          <col style="width:30%;">
          <col style="width:14%;">
          <col style="width:11%;">
          <col style="width:13%;">
        </colgroup>
        <thead><tr style="background:#fff;border-bottom:2.5px solid #000;">
          <th style="width:6%;text-align:center;font-size:16px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Qté</th>
          <th style="width:12%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Origine</th>
          <th style="width:14%;font-size:14px;font-weight:900;padding:6px 4px;border-right:2px solid #000;text-align:center;background:#fff;color:#000;">Repère</th>
          <th style="width:30%;text-align:center;font-size:14px;font-weight:900;padding:6px 4px;border-right:2px solid #000;background:#fff;color:#000;">Longueur(s) Coupe</th>
          <th style="width:14%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Reste</th>
          <th style="width:11%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:2px solid #000;background:#fff;color:#000;">Statut</th>
          <th style="width:13%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;background:#fff;color:#000;">Nouvelle Chute</th>
        </tr></thead>
        ${chutesHTML}
      </table>` : ''}
    </div>`;
  };

  const handleDownloadHTML = () => {
    // 1. Tableau Matière Première (Ne jamais générer de ligne vide)
    const matieresNeuvesFiltrees = syntheseMatieres.filter(m => m.nbBarresNeuves > 0);
    const matieresNeuvesHTML = matieresNeuvesFiltrees.map(m => `
      <tr>
        <td class="border-cell-standard" style="font-size:14px;font-weight:bold;padding:6px 8px;color:#000;background:#fff;">${m.designation}</td>
        <td class="border-cell-standard" style="text-align:center;font-weight:900;color:#000;font-size:16px;background:#fff;padding:6px 8px;">${m.nbBarresNeuves} barre(s)</td>
        <td class="border-cell-standard" style="text-align:center;font-family:Consolas,monospace;font-size:15px;font-weight:900;padding:6px 8px;color:#000;background:#fff;">${m.longueurBarre} mm</td>
        <td class="border-cell-standard" style="text-align:center;font-weight:bold;color:#000;font-size:13px;padding:6px 8px;background:#fff;">[ &nbsp; ] Prélevé</td>
      </tr>`).join('');

    const chutesADestoquer = syntheseMatieres
      .flatMap(m => m.chutes.map(c => ({ ...c, codeArt: m.codeArt, designation: m.designation, famille: m.famille })))
      .sort((a, b) => (a.designation || '').localeCompare(b.designation || '', 'fr', { sensitivity: 'base' }));
    const chutesDestoquerHTML = chutesADestoquer.map(c => `
      <tr>
        <td class="border-cell-standard" style="font-size:14px;font-weight:bold;padding:6px 8px;color:#000;background:#fff;">${c.designation}</td>
        <td class="border-cell-standard" style="text-align:center;font-weight:900;font-size:16px;color:#000;padding:6px 8px;background:#fff;">×${c.quantite}</td>
        <td class="border-cell-standard" style="text-align:center;font-family:Consolas,monospace;font-weight:900;color:#000;font-size:15px;background:#fff;padding:6px 8px;">${c.longueurDepart} mm</td>
        <td class="border-cell-standard" style="text-align:center;font-weight:bold;color:#000;font-size:13px;padding:6px 8px;background:#fff;">[ &nbsp; ] Déstocké</td>
      </tr>`).join('');

    // 1.c Tableau Accessoires (Exclure les joues dans l'OF papier comme demandé expressément)
    const accessoiresFiltres = syntheseAccessoires.filter(a => !a.designation.toUpperCase().includes('JOUE'));
    const accessoiresHTML = accessoiresFiltres.map(a => `
      <tr>
        <td class="border-cell-standard" style="font-size:13px;font-weight:900;padding:6px 8px;color:#000;background:#fff;">${a.designation}</td>
        <td class="border-cell-standard" style="text-align:center;font-weight:900;color:#000;font-size:15px;background:#fff;padding:6px 8px;font-family:Consolas,monospace;">${a.quantiteRequise} pcs</td>
        <td class="border-cell-standard" style="font-size:12px;color:#000;padding:6px 8px;background:#fff;">${a.regleCalcul} (${a.detailPieces})</td>
        <td class="border-cell-standard" style="text-align:center;font-weight:bold;color:#000;font-size:13px;padding:6px 8px;background:#fff;">[ &nbsp; ] Préparé</td>
      </tr>`).join('');

    // 1.d Façonnage Toile Plissée / Maille MSTQ (Placée avec les préparations matière première)
    const mstqToileItems = (lignesMoustiquaires || []).filter(m => m.typeFabrication !== 'PROFILES_SEULS');
    const toilePlisseeHTML = mstqToileItems.length > 0 ? `
      <div style="margin-top:14px;margin-bottom:14px;page-break-inside:auto;break-inside:auto;">
        <div style="font-weight:900;font-size:16px;margin:12px 0 6px 0;text-align:center;text-transform:uppercase;color:#000;background:#fff;border:2.5px solid #000;padding:7px 12px;border-radius:4px;letter-spacing:0.5px;page-break-after:avoid;break-after:avoid;page-break-inside:avoid;break-inside:avoid;">
          OPTIMISATION MAILLE MSTQ
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:2.5px solid #000;margin-bottom:8px;table-layout:fixed;">
          <colgroup>
            <col style="width:10%;">
            <col style="width:20%;">
            <col style="width:14%;">
            <col style="width:18%;">
            <col style="width:12%;">
            <col style="width:18%;">
            <col style="width:8%;">
          </colgroup>
          <thead>
            <tr style="background:#fff;font-weight:900;border-bottom:2px solid #000;">
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;width:10%;background:#fff;color:#000;font-size:13px;">Repère</th>
              <th style="padding:6px 4px;border-right:1px solid #000;width:20%;background:#fff;color:#000;font-size:13px;">Dim. Finie (L×H)</th>
              <th style="padding:6px 4px;border-right:1px solid #000;width:14%;background:#fff;color:#000;font-size:13px;">Ouverture</th>
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;background:#fff;color:#000;width:18%;font-size:13px;">Coupe Fixe Maille</th>
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;width:12%;background:#fff;color:#000;font-size:13px;">Nb Plis</th>
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;width:18%;background:#fff;color:#000;font-size:13px;">Longueur Fil / Corde</th>
              <th style="padding:6px 4px;text-align:center;width:8%;background:#fff;color:#000;font-size:13px;">Surface</th>
            </tr>
          </thead>
          <tbody>
            ${mstqToileItems.map((m, idx) => {
              const c = calculerBesoinMaille(m);
              return `
                <tr style="border-bottom:1px solid #000;background:#fff;">
                  <td style="padding:7px 4px;text-align:center;font-weight:900;color:#000;border-right:1px solid #000;font-size:15px;font-family:Consolas,monospace;">${m.repere}</td>
                  <td style="padding:7px 4px;font-weight:900;border-right:1px solid #000;font-size:14px;color:#000;font-family:Consolas,monospace;">${m.largeur} × ${m.hauteur} mm (×${m.quantite})</td>
                  <td style="padding:7px 4px;border-right:1px solid #000;font-size:13px;font-weight:bold;color:#000;">${m.typeOuverture === 'PORTE_FENETRE' ? 'Porte-Fenêtre' : m.typeOuverture === 'DOUBLE_VANTAUX' ? 'Baie 2 Vtx' : m.typeOuverture === 'CENTRALE' ? 'Centrale' : m.typeOuverture === 'FIXE' ? 'Fixe' : 'Fenêtre'}</td>
                  <td style="padding:7px 4px;text-align:center;font-weight:900;background:#fff;color:#000;border-right:1px solid #000;font-size:15px;font-family:Consolas,monospace;">${c.dimension_fixe_requise} mm <span style="font-size:12px;font-weight:bold;color:#333;">(${c.dimension_fixe_est === 'H' ? 'Hauteur' : 'Largeur'})</span></td>
                  <td style="padding:7px 4px;text-align:center;font-weight:900;color:#000;border-right:1px solid #000;font-size:15px;font-family:Consolas,monospace;">${c.nb_plis_requis} plis</td>
                  <td style="padding:7px 4px;border-right:1px solid #000;background:#fff;color:#000;text-align:center;">
                    <span style="font-weight:900;color:#000;font-size:15px;font-family:Consolas,monospace;white-space:nowrap;">${c.longueur_corde_unitaire_m} m/fil - ${c.nb_fils_guidage} trous</span>
                  </td>
                  <td style="padding:7px 4px;text-align:center;font-weight:bold;font-size:13px;color:#000;">${c.superficie_m2} m²</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    // 2. Sections par familles (Profilés découpés) avec pagination du profilé (ex: Profilé 1 / 2)
    const caissonsHTML = sectionsParFamille.caissons.map(sec => {
      const gIdx = listeSections.indexOf(sec);
      return buildSectionHTML(sec, gIdx >= 0 ? gIdx : 0, listeSections.length);
    }).join('');
    const tabliersHTML = sectionsParFamille.tabliers.map(sec => {
      const gIdx = listeSections.indexOf(sec);
      return buildSectionHTML(sec, gIdx >= 0 ? gIdx : 0, listeSections.length);
    }).join('');
    const precadresHTML = sectionsParFamille.precadres.map(sec => {
      const gIdx = listeSections.indexOf(sec);
      return buildSectionHTML(sec, gIdx >= 0 ? gIdx : 0, listeSections.length);
    }).join('');
    const mstqHTML = sectionsParFamille.moustiquaires.map(sec => {
      const gIdx = listeSections.indexOf(sec);
      return buildSectionHTML(sec, gIdx >= 0 ? gIdx : 0, listeSections.length);
    }).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Ordre de Fabrication — ${cmdAffichee} — ${clientAffiche}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 8mm 14mm 8mm;
      @top-right {
        content: "${currentCodeOFAffiche} — PAGE " counter(page) " / " counter(pages);
        font-family: Consolas, "Courier New", monospace;
        font-size: 9pt;
        font-weight: 800;
        color: #000000;
      }
      @bottom-right {
        content: "PAGE " counter(page) " / " counter(pages);
        font-family: Consolas, "Courier New", monospace;
        font-size: 11pt;
        font-weight: 900;
        color: #000000;
      }
      @bottom-left {
        content: "${currentCodeOFAffiche} (#${currentSequenceNum}) • COMMANDE N° ${cmdAffichee} • ${clientAffiche}";
        font-family: Consolas, "Courier New", monospace;
        font-size: 8.5pt;
        font-weight: 700;
        color: #222222;
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; color: #000; background: #fff; font-size: 13px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-doc-table { width: 100% !important; border-collapse: collapse !important; border: none !important; margin: 0 !important; padding: 0 !important; }
    .print-doc-table > tbody > tr > td { border: none !important; padding: 0 !important; margin: 0 !important; background: #fff !important; }
    .print-doc-table > tfoot { display: table-footer-group !important; }
    .print-doc-table > tfoot > tr > td { border: none !important; padding: 0 !important; margin: 0 !important; background: #fff !important; }
    .print-footer-fixed {
      display: block !important;
      width: 100% !important;
      border-top: 2px solid #000 !important;
      padding: 2mm 3mm 1mm 3mm !important;
      margin-top: 2mm !important;
      color: #000 !important;
      background: #fff !important;
      font-family: Arial, sans-serif !important;
      box-sizing: border-box !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .print-footer-fixed .footer-line-1 {
      display: flex !important;
      justify-content: space-between !important;
      align-items: baseline !important;
      border-bottom: 1px solid #ccc !important;
      padding-bottom: 1.5mm !important;
      margin-bottom: 1.5mm !important;
    }
    .print-footer-fixed .footer-line-2 {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      font-size: 8.5pt !important;
      font-weight: 700 !important;
    }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; border-bottom:3px solid #000; padding-bottom:6px; }
    .header-left h1 { font-size:15px; font-weight:900; margin:0 0 4px 0; text-transform:uppercase; color:#000; letter-spacing:0.5px; }
    .header-left .cmd-highlight { font-size:22px; font-weight:900; font-family:Consolas,monospace; color:#000; background:#fff; padding:2px 8px; border:2px solid #000; border-radius:4px; display:inline-block; }
    .logo-m { font-size:24px; font-weight:900; color:#000; border:2px solid #000; padding:2px 8px; border-radius:4px; }
    .logo-text { font-size:10px; font-weight:900; letter-spacing:1px; color:#000; }
    .client-info-bar { display:flex; justify-content:space-between; background:#fff; padding:6px 10px; border:2px solid #000; font-size:13px; margin-bottom:10px; font-weight:bold; border-radius:4px; color:#000; }
    .famille-header { background: #fff; color: #000; border: 2px solid #000; padding: 5px 10px; font-size: 14px; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; }
    table:not(.print-doc-table) { width:100% !important; border-collapse:collapse !important; margin-bottom:10px !important; table-layout:fixed !important; border: 2.5px solid #000 !important; }
    th { border: 2px solid #000 !important; padding:6px 8px !important; text-align:left; vertical-align:middle; font-size: 13px; background:#fff !important; font-weight:900 !important; text-transform:uppercase; color:#000 !important; }
    td { padding:6px 8px !important; text-align:left; vertical-align:middle; font-size: 13px; box-sizing:border-box !important; word-break:break-word !important; overflow-wrap:break-word !important; color:#000 !important; background:#fff !important; }
    .border-cut-dashed { border-bottom: 2.5px dashed #000 !important; border-right: 2px solid #000 !important; }
    .border-bar-solid { border-bottom: 4px solid #000 !important; border-right: 2px solid #000 !important; }
    .border-cell-standard { border: 1.5px solid #000 !important; }
  </style>
</head>
<body>
<table class="print-doc-table">
  <tbody>
    <tr>
      <td>
  <!-- PARTIE 1 : PRÉPARATION DU STOCK & MATIÈRES PREMIÈRES (MAGASIN) -->
  <div class="header">
    <div class="header-left">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:11px;font-weight:900;text-transform:uppercase;color:#fff;background:#000;padding:2px 8px;border-radius:3px;letter-spacing:0.5px;">ORDRE DE FABRICATION</span>
        <span style="font-size:11px;font-weight:bold;color:#444;text-transform:uppercase;">Fiche Magasin &amp; Débit</span>
      </div>
      <div style="margin-top:2px;">
        <span style="font-size:13px;font-weight:900;text-transform:uppercase;color:#000;margin-right:6px;">N° Commande :</span>
        <span class="cmd-highlight">${cmdAffichee}</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="border:3px solid #000;padding:4px 14px;text-align:center;background:#fff;border-radius:6px;min-width:150px;">
        <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.8px;color:#000;">SÉQUENCE ATELIER</div>
        <div style="font-size:26px;font-weight:900;font-family:Consolas,monospace;color:#000;letter-spacing:1px;line-height:1.1;">${currentCodeOFAffiche}</div>
        <div style="font-size:10px;font-weight:900;background:#000;color:#fff;padding:1px 4px;border-radius:2px;margin-top:2px;">ORDRE MACHINE N° ${currentSequenceNum}</div>
      </div>
      <div style="text-align:right;">
        <div class="logo-m">TROIS M</div>
        <div class="logo-text">ALUMINIUM</div>
      </div>
    </div>
  </div>

  ${estPrioritaire ? `
  <div style="background:#fee2e2;border:2.5px solid #dc2626;color:#991b1b;padding:6px 12px;font-weight:900;font-size:14px;text-align:center;border-radius:4px;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase;">
    ⚡ COMMANDE PRIORITAIRE ATELIER ⚡ ${motifPriorite ? `— ${motifPriorite}` : ''}
  </div>` : ''}

  <div class="client-info-bar">
    <div>DONNEUR D'ORDRE : <span style="color:#000;font-weight:900;font-size:15px;">${agenceInfo.nom}</span></div>
    <div>CLIENT FINAL : <span style="font-weight:900;font-size:16px;color:#000;">${clientAffiche}</span></div>
    <div>DATE : <span style="font-weight:900;font-size:15px;color:#000;font-family:Consolas,monospace;">${dateAffichee}</span></div>
    <div style="background:${estPrioritaire ? '#fee2e2' : '#fef3c7'};border:1.5px solid #000;padding:2px 8px;border-radius:3px;font-family:Consolas,monospace;font-size:12px;font-weight:900;">${dateLivraisonPrevisionnelleAffichee}</div>
  </div>

  ${(matieresNeuvesFiltrees.length > 0 || chutesADestoquer.length > 0 || accessoiresFiltres.length > 0 || toilePlisseeHTML) ? `
  <div style="background:#fff;color:#000;border:2.5px solid #000;padding:8px 12px;font-weight:900;font-size:15px;text-transform:uppercase;margin-bottom:10px;text-align:center;border-radius:4px;">
    📋 PARTIE 1 : PRÉPARATION DU STOCK &amp; MATIÈRES PREMIÈRES (MAGASIN)
  </div>

  ${matieresNeuvesFiltrees.length > 0 ? `
  <div style="font-weight:900;font-size:14px;margin:8px 0 6px 0;text-align:center;text-transform:uppercase;color:#000;">A. Barres Neuves à sortir du Magasin</div>
  <table style="table-layout:fixed;width:100%;border:2.5px solid #000;">
    <colgroup>
      <col style="width:52%;">
      <col style="width:16%;">
      <col style="width:18%;">
      <col style="width:14%;">
    </colgroup>
    <thead><tr>
      <th style="width:52%;border-right:2px solid #000;">Désignation</th>
      <th style="width:16%;text-align:center;border-right:2px solid #000;">Quantité</th>
      <th style="width:18%;text-align:center;border-right:2px solid #000;">Longueur de la Barre</th>
      <th style="width:14%;text-align:center;">Pointage</th>
    </tr></thead>
    <tbody>${matieresNeuvesHTML}</tbody>
  </table>` : ''}

  ${chutesADestoquer.length > 0 ? `
  <div style="font-weight:900;font-size:14px;margin:12px 0 6px 0;text-align:center;text-transform:uppercase;color:#000;">B. Chutes Récupérées à Déstocker des Casiers</div>
  <table style="table-layout:fixed;width:100%;border:2.5px solid #000;">
    <colgroup>
      <col style="width:52%;">
      <col style="width:16%;">
      <col style="width:18%;">
      <col style="width:14%;">
    </colgroup>
    <thead><tr>
      <th style="width:52%;border-right:2px solid #000;">Désignation</th>
      <th style="width:16%;text-align:center;border-right:2px solid #000;">Quantité</th>
      <th style="width:18%;text-align:center;border-right:2px solid #000;">Longueur de la Barre</th>
      <th style="width:14%;text-align:center;">Pointage</th>
    </tr></thead>
    <tbody>${chutesDestoquerHTML}</tbody>
  </table>` : ''}

  ${accessoiresFiltres.length > 0 ? `
  <div style="font-weight:900;font-size:14px;margin:12px 0 6px 0;text-align:center;text-transform:uppercase;color:#000;">C. Accessoires à Préparer</div>
  <table style="table-layout:fixed;width:100%;border:2.5px solid #000;">
    <colgroup>
      <col style="width:52%;">
      <col style="width:16%;">
      <col style="width:18%;">
      <col style="width:14%;">
    </colgroup>
    <thead><tr>
      <th style="width:52%;border-right:2px solid #000;">Désignation</th>
      <th style="width:16%;text-align:center;border-right:2px solid #000;">Quantité</th>
      <th style="width:18%;border-right:2px solid #000;">Affectation</th>
      <th style="width:14%;text-align:center;">Pointage</th>
    </tr></thead>
    <tbody>${accessoiresHTML}</tbody>
  </table>` : ''}

  ${toilePlisseeHTML}
  ` : ''}

  <!-- PARTIE 2 : ATELIER SCIES — PLANS D'OPTIMISATION DE DÉCOUPE DES PROFILÉS -->
  <div style="margin-top:16px;border-top:3px solid #000;padding-top:10px;${optimiserImpressionAntiPagesBlanches ? 'page-break-before:auto;break-before:auto;' : (hasAnyPreparation ? 'page-break-before:always;break-before:page;' : '')}">
    <div style="background:#fff;color:#000;border:2.5px solid #000;padding:8px 12px;margin-bottom:12px;border-radius:4px;text-align:center;page-break-after:avoid;break-after:avoid;page-break-inside:avoid;break-inside:avoid;">
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;">
        <div style="font-size:18px;font-weight:900;text-transform:uppercase;color:#000;letter-spacing:1px;">
          ✂️ ${hasAnyPreparation ? 'FICHE 2 : OPTIMISATION DE DÉCOUPE ATELIER' : 'FICHE 1 : OPTIMISATION DE DÉCOUPE ATELIER'}
        </div>
        <span style="padding:2px 8px;background:#000;color:#fff;font-family:Consolas,monospace;font-weight:900;font-size:14px;border-radius:4px;">
          ${currentCodeOFAffiche} (ORDRE N° ${currentSequenceNum})
        </span>
      </div>
      <div style="font-size:12px;color:#000;font-weight:bold;margin-top:4px;">
        Plans de coupe profilés et débits atelier — Commande N° : <span style="font-family:Consolas,monospace;font-size:15px;font-weight:900;border:1.5px solid #000;padding:1px 6px;border-radius:3px;">${cmdAffichee}</span>
      </div>
    </div>

    ${caissonsHTML}
    ${tabliersHTML}
    ${precadresHTML}
    ${mstqHTML}
  </div>
      </td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td>
        <!-- PIED DE PAGE IMPRESSION (CLIENT COMPLET SANS TRONCATURE SUR LIGNE 1, SUIVI TECHNIQUE SUR LIGNE 2) -->
        <div class="print-footer-fixed">
          <div class="footer-line-1">
            <div style="font-size:12px;color:#000;flex:1;margin-right:12px;">
              <span style="font-size:11px;font-weight:bold;color:#444;text-transform:uppercase;margin-right:4px;">CLIENT :</span>
              <strong style="font-size:13px;font-weight:900;color:#000;letter-spacing:-0.2px;">${clientAffiche}</strong>
              ${donneurOrdre ? `<span style="font-size:11px;color:#555;font-weight:bold;margin-left:6px;">(Donneur d'Ordre : ${donneurOrdre})</span>` : ''}
            </div>
            <div style="flex-shrink:0;text-align:right;">
              <span style="font-size:11px;font-weight:bold;color:#444;text-transform:uppercase;margin-right:4px;">COMMANDE N° :</span>
              <span style="font-family:Consolas,monospace;font-size:13px;font-weight:900;border:1.5px solid #000;padding:2px 8px;border-radius:4px;background:#fff;display:inline-block;">${cmdAffichee}</span>
            </div>
          </div>
          <div class="footer-line-2">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="border:1.5px solid #000;padding:1px 6px;border-radius:3px;background:#000;color:#fff;font-family:Consolas,monospace;font-size:11px;font-weight:900;">
                ${currentCodeOFAffiche} (#${currentSequenceNum})
              </span>
              <span style="color:#222;font-size:11px;">
                ${listeSections.length > 0 ? `${listeSections.length} profilé(s) à débiter` : 'Ordre de Fabrication Atelier'}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="padding:2px 8px;border:1.5px solid #000;border-radius:3px;background:${estPrioritaire ? '#fee2e2' : '#fef3c7'};font-family:Consolas,monospace;font-size:11px;font-weight:900;">
                ${dateLivraisonPrevisionnelleAffichee}
              </span>
              <span style="font-family:Consolas,monospace;font-weight:900;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">
                3M ALUMINIUM ATELIER
              </span>
            </div>
          </div>
        </div>
      </td>
    </tr>
  </tfoot>
</table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OF_${cmdAffichee.replace(/[^a-zA-Z0-9-_]/g, '_')}_${clientAffiche.replace(/\s+/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = `${currentCodeOFAffiche} - Commande ${cmdAffichee} - ${clientAffiche}`;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
    }, 1000);
  };

  const handleEmettreOF = async () => {
    if (ofEmis) return;
    setIsEmitting(true);

    const lignesRetour: LigneRetourOF[] = [];
    let lineId = 1;

    listeSections.forEach(sec => {
      sec.groupesBarresNeuves.forEach(g => {
        const piecesStr = g.piecesInfo.map(p => `${p.repere} (${p.longueur}mm)`).join(' + ');
        const resteCalc = Math.round(g.chute);
        const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
        const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
        const initialAction = (resteCalc >= rMax && g.statut !== 'SACRIFICE') ? 'A_STOCKER' : 'DECHET';

        for (let i = 0; i < g.quantite; i++) {
          lignesRetour.push({
            id: `lr-${Date.now()}-${lineId++}`,
            repere: g.piecesInfo.map(p => p.repere).join(', '),
            typeSupport: 'BARRE_NEUVE',
            articleCode: sec.article?.code_art || sec.resultat?.articleCode,
            articleDesignation: sec.article?.designation || sec.resultat?.articleDesignation || sec.titre,
            longueurPrevue: g.longueurBarre,
            restePrevuMm: resteCalc,
            resteReelMesureMm: resteCalc,
            sourceReelle: 'CONFORME',
            actionReste: initialAction,
            piecesInfoStr: piecesStr,
            saisieOperateur: ''
          });
        }
      });
      sec.groupesChutesRecup.forEach(g => {
        const piecesStr = g.piecesInfo.map(p => `${p.repere} (${p.longueur}mm)`).join(' + ');
        const resteCalc = Math.round(g.reste);
        const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
        const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
        const initialAction = resteCalc >= rMax ? 'A_STOCKER' : 'DECHET';

        for (let i = 0; i < g.quantite; i++) {
          lignesRetour.push({
            id: `lr-${Date.now()}-${lineId++}`,
            repere: g.piecesInfo.map(p => p.repere).join(', '),
            typeSupport: 'CHUTE_BARRE',
            articleCode: sec.article?.code_art || sec.resultat?.articleCode,
            articleDesignation: sec.article?.designation || sec.resultat?.articleDesignation || sec.titre,
            longueurPrevue: Math.round(g.support),
            restePrevuMm: resteCalc,
            resteReelMesureMm: resteCalc,
            sourceReelle: 'CONFORME',
            actionReste: initialAction,
            piecesInfoStr: piecesStr,
            saisieOperateur: '',
            chuteId: g.chuteId
          });
        }
      });
    });

    // Lignes de retour / prélèvement d'accessoires (Joues, etc.)
    syntheseAccessoires.forEach(acc => {
      lignesRetour.push({
        id: `lr-acc-${Date.now()}-${lineId++}`,
        repere: `ACCESSOIRE ${acc.designation}`,
        typeSupport: 'BARRE_NEUVE',
        articleCode: acc.codeArt,
        articleDesignation: acc.designation,
        longueurPrevue: 0,
        restePrevuMm: 0,
        resteReelMesureMm: 0,
        sourceReelle: 'CONFORME',
        actionReste: 'DECHET',
        piecesInfoStr: `${acc.quantiteRequise} ${acc.unite} (${acc.regleCalcul} : ${acc.detailPieces})`,
        saisieOperateur: `${acc.quantiteRequise} pcs prélevées`
      });
    });

    // Préparation des réservations réelles de stock (Chutes, Barres neuves, Toile maille)
    const chutesReservees: ChuteReserveeOF[] = [];
    const barresReservees: BarreReserveeOF[] = [];
    const chutesMailleReservees: ChuteMailleReserveeOF[] = [];

    listeSections.forEach(sec => {
      // 1. Barres neuves à réserver
      const totalBarresSec = sec.groupesBarresNeuves.reduce((sum, g) => sum + g.quantite, 0);
      if (sec.article?.code_art && totalBarresSec > 0) {
        barresReservees.push({
          codeArt: sec.article.code_art,
          quantite: totalBarresSec,
          longueur: sec.barreLongueur || sec.article.longeur || 6000
        });
      }

      // 2. Chutes barres utilisées à réserver
      sec.groupesChutesRecup.forEach(g => {
        let sheetName = (sec.article?.code_art && mapping && mapping[sec.article.code_art]) || sec.article?.designation;
        if (!sheetName) {
          sheetName = sec.titre.replace(/^[^\w\d\s]+/, '').replace(/\s*\([^)]*\)/g, '').trim();
        }
        chutesReservees.push({
          sheetName: sheetName.trim(),
          longueur: Math.round(g.support),
          quantite: g.quantite,
          articleCode: sec.article?.code_art,
          chuteId: g.chuteId
        });
      });
    });

    // 3. Toile moustiquaire plissée réservée
    if (lignesMoustiquaires && resultatsMaille) {
      lignesMoustiquaires.forEach((_, idx) => {
        const resM = resultatsMaille[idx];
        if (resM?.chute_trouvee) {
          chutesMailleReservees.push({
            id: resM.chute_trouvee.id,
            dimension_fixe: resM.chute_trouvee.dimension_fixe,
            plis: resM.chute_trouvee.plis
          });
        }
      });
    }

    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // Détection intelligente et robuste de la véritable famille du produit
    const detecterFamille = (): FamilleProduit => {
      if (famille === 'TABLIER' || famille === 'MOUSTIQUAIRE' || famille === 'CAISSON' || famille === 'PRECADRE') {
        return famille;
      }
      // 1. Inspecter les sections transmises
      if (sections && sections.length > 0) {
        const secFamilies = sections.map((s: any) => s.famille).filter(Boolean);
        const uniqueFams = Array.from(new Set(secFamilies));
        if (uniqueFams.includes('TABLIER') && !uniqueFams.includes('CAISSON')) return 'TABLIER';
        if (uniqueFams.includes('MOUSTIQUAIRE') && !uniqueFams.includes('CAISSON')) return 'MOUSTIQUAIRE';
        if (uniqueFams.includes('PRECADRE') && !uniqueFams.includes('CAISSON')) return 'PRECADRE';
        if (uniqueFams.length === 1 && (uniqueFams[0] === 'TABLIER' || uniqueFams[0] === 'MOUSTIQUAIRE' || uniqueFams[0] === 'PRECADRE' || uniqueFams[0] === 'CAISSON')) {
          return uniqueFams[0] as FamilleProduit;
        }
      }
      // 2. Moustiquaires spécifiques
      if (lignesMoustiquaires && lignesMoustiquaires.length > 0) return 'MOUSTIQUAIRE';
      if (chutesMailleReservees.length > 0) return 'MOUSTIQUAIRE';
      // 3. Inspecter le titre du produit
      const titreUpper = (titreProduit || '').toUpperCase();
      if (titreUpper.includes('TABLIER') || titreUpper.includes('VOLET') || titreUpper.includes('LAME')) return 'TABLIER';
      if (titreUpper.includes('MOUSTIQUAIRE') || titreUpper.includes('MSTQ')) return 'MOUSTIQUAIRE';
      if (titreUpper.includes('PRÉCADRE') || titreUpper.includes('PRECADRE')) return 'PRECADRE';
      if (titreUpper.includes('CAISSON') || titreUpper.includes('SOUS-FACE')) return 'CAISSON';
      // 4. Inspecter les lignes de retour
      if (lignesRetour.some((l: any) => l.designation?.includes('TBL') || l.piecesInfoStr?.includes('TBL') || l.piecesInfoStr?.includes('LAME') || l.repere?.startsWith('SA-') || l.repere?.startsWith('LF-') || l.repere?.startsWith('TAB-'))) {
        return 'TABLIER';
      }
      if (lignesRetour.some((l: any) => l.designation?.includes('MSTQ') || l.piecesInfoStr?.includes('MSTQ') || l.repere?.includes('Cadre') || l.repere?.startsWith('BI-') || l.repere?.startsWith('H') || l.repere?.startsWith('D-') || l.repere?.startsWith('SC-'))) {
        return 'MOUSTIQUAIRE';
      }
      // 5. Inspecter le préfixe de commande
      const refUpper = (refCommande || '').toUpperCase();
      if (refUpper.startsWith('SA-')) return 'TABLIER';
      if (refUpper.startsWith('SC-') || refUpper.startsWith('D-')) return 'MOUSTIQUAIRE';
      if (refUpper.startsWith('1R')) return 'PRECADRE';
      return 'TABLIER';
    };

    const validFamille: FamilleProduit = detecterFamille();

    // Récupérer les OFs existants pour vérifier si déjà existant ou déterminer le numéro de séquence
    const ofsExistants: SuiviOF[] = await StorageService.getSuivisOF().catch(() => []);
    const match = ofsExistants.find(o => 
      o.numCommande === (refCommande || 'CMD') && 
      (o.titreSection === (titreProduit || 'Fiche de Coupe') || o.famille === validFamille)
    );

    let seqNum = match?.numeroEmission || emittedSequence;
    if (!seqNum) {
      const maxNum = ofsExistants.reduce<number>((m, o) => Math.max(m, o.numeroEmission || 0), 0);
      seqNum = maxNum + 1;
    }
    const finalCodeOF = match?.codeOF || emittedCode || `OF-${String(seqNum).padStart(3, '0')}`;

    const suivi: SuiviOF = {
      id: match?.id || `of-${Date.now()}`,
      dossierId: dossierId || match?.dossierId,
      numeroEmission: seqNum,
      codeOF: finalCodeOF,
      numCommande: refCommande || 'CMD',
      nomClient: nomClient || 'CLIENT',
      donneurOrdre: donneurOrdre || '',
      famille: validFamille,
      titreSection: titreProduit || 'Fiche de Coupe',
      statut: 'EMIS',
      dateEmission: dateStr,
      lignesRetour,
      totalBarresNeuvesPrevu: totalBarresNeuvesToutesSections,
      totalChutesUtiliseesPrevu: totalChutesRecycleesToutesSections,
      nombrePieces: Math.max(1, totalPiecesToutesSections),
      chutesReservees,
      barresReservees,
      chutesMailleReservees,
      dateLivraisonPrevisionnelle: dateLivraisonPrevisionnelleAffichee,
      dateLivraisonPrevisionnelleISO: dateLivraisonISO || undefined,
      estPrioritaire: estPrioritaire,
      motifPriorite: estPrioritaire ? motifPriorite : undefined
    };

    try {
      await StorageService.upsertSuiviOF(suivi);
      setEmittedSequence(seqNum);
      setEmittedCode(finalCodeOF);
      setMatchedOf(suivi);

      // Mettre à jour automatiquement le statut des dossiers correspondants vers 'EN_COURS'
      try {
        const dossiers = await StorageService.getDossiers();
        const cmdRefs = [
          refCommande,
          numCommandeCaisson,
          numCommandeSousFace,
          numCommandeTablier,
          numCommandeMoustiquaire,
          numCommandePrecadre
        ].filter(Boolean).map(c => c.trim().toLowerCase());

        let hasUpdates = false;
        const updatedDossiers = dossiers.map(d => {
          const dRef = (d.refCommande || '').trim().toLowerCase();
          const matches = cmdRefs.some(ref => ref && (dRef.includes(ref) || ref.includes(dRef))) ||
            (nomClient && d.nomClientFinal && d.nomClientFinal.trim().toLowerCase() === nomClient.trim().toLowerCase());

          if (matches) {
            hasUpdates = true;
            return {
              ...d,
              statut: (d.statut === 'EN_ATTENTE' || d.statut === 'BROUILLON' || !d.statut) ? ('EN_COURS' as const) : d.statut,
              estPrioritaire: estPrioritaire || d.estPrioritaire,
              motifPriorite: estPrioritaire ? (motifPriorite || d.motifPriorite) : d.motifPriorite,
              dateLivraisonPrevisionnelle: dateLivraisonPrevisionnelleAffichee || d.dateLivraisonPrevisionnelle,
              dateLivraisonPrevisionnelleISO: dateLivraisonISO || d.dateLivraisonPrevisionnelleISO
            };
          }
          return d;
        });

        if (hasUpdates) {
          await StorageService.saveDossiers(updatedDossiers);
        }
      } catch (dErr) {
        console.warn('Erreur mise à jour dossier vers EN_COURS lors émission OF:', dErr);
      }

      setOfEmis(true);
      if (onOFEmis) {
        onOFEmis();
      }
    } catch (error: any) {
      alert(`Impossible d'émettre l'OF : ${error.message}`);
    } finally {
      setIsEmitting(false);
    }
  };

  /** Rendu des tables de coupes pour une section */
  const renderSectionCuttingTables = (sec: SectionTraitee, sIdx: number) => {
    if (sec.groupesBarresNeuves.length === 0 && sec.groupesChutesRecup.length === 0) {
      return null;
    }

    const conditionsParts: string[] = [];
    const isCaissonHeader = sec.titre.toUpperCase().includes('CAISSON');
    if (isCaissonHeader) {
      if (sec.avecPeinture) conditionsParts.push('AVEC PEINTURE');
      else conditionsParts.push('SANS PEINTURE');
      if (sec.avecSousFace) {
        conditionsParts.push(sec.montageSousFace === 'MONTEE_ATELIER' ? 'AVEC MONTAGE' : 'SANS MONTAGE');
      }
      if (sec.avecPlaque !== undefined) {
        conditionsParts.push(sec.avecPlaque ? 'AVEC PLAQUE' : 'SANS PLAQUE');
      }
    }

    const { familleLabel, profileDesignation } = separerFamilleEtProfile(sec);
    const globalIdx = listeSections.indexOf(sec);
    const profileNum = (globalIdx >= 0 ? globalIdx : sIdx) + 1;
    const totalProfiles = listeSections.length;

    return (
      <div key={sIdx} className="space-y-3 of-section-container pt-2">
        {/* Titre du profilé - TRÈS GRAND, VISIBLE, CENTRÉ, FOND BLANC ET BORDURE NOIRE NETTE */}
        <div className="of-section-header-block of-keep-with-next">
          <div className="bg-white border-[2.5px] border-black text-black p-3 sm:p-4 rounded-xl flex items-center justify-center gap-3 sm:gap-4 flex-wrap text-center">
            <span className="bg-white text-black font-black text-base sm:text-xl px-4 py-2 rounded-lg uppercase tracking-wider border-2 border-black">
              {familleLabel}
            </span>
            <span className="text-black text-2xl sm:text-3xl font-black">→</span>
            <span className="text-2xl sm:text-4xl lg:text-5xl font-black text-black font-mono tracking-wider uppercase bg-white px-5 py-2 rounded-xl border-[3px] border-black">
              {profileDesignation}
            </span>
            <span className="font-mono font-black text-xs sm:text-base px-3.5 py-1.5 rounded-lg border-2 border-black bg-black text-white shrink-0 tracking-wider">
              PROFILÉ {profileNum} / {totalProfiles}
            </span>
            {conditionsParts.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {conditionsParts.map((c, i) => (
                  <span
                    key={i}
                    className="text-xs sm:text-sm font-black px-3 py-1 rounded border-2 border-black bg-white text-black"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Ligne Conditions de coupe du profilé */}
            <div className="w-full border-t-2 border-dashed border-black pt-2 mt-1 flex items-center justify-center gap-3 sm:gap-4 flex-wrap text-xs sm:text-sm font-mono font-black text-black">
              <span className="bg-black text-white px-2.5 py-0.5 rounded text-[11px] uppercase tracking-wider">
                Condition de coupe
              </span>
              <span>
                Barre brute : <strong>{Math.round(sec.barreLongueur || 6000)} mm</strong>
              </span>
              <span>•</span>
              <span>
                Lame scie : <strong>{sec.lameScie || 4.5} mm</strong>
              </span>
              <span>•</span>
              <span className={sec.margeDebord > 0 ? 'bg-amber-100 text-amber-900 border border-amber-400 px-2 py-0.5 rounded font-bold' : ''}>
                Débordement : <strong>{sec.margeDebord > 0 ? `+${sec.margeDebord} mm` : '0 mm'}</strong>
              </span>
              <span>•</span>
              <span>
                Reste min / max : <strong>{sec.refusMin || 500} / {sec.refusMax || 1100} mm</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Coupes sur Barres Neuves */}
        {sec.groupesBarresNeuves.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center text-xs sm:text-sm font-black uppercase text-black px-1 text-center of-keep-with-next">
              <span className="text-black font-black text-sm sm:text-base">
                COUPES SUR BARRES NEUVES ({sec.resultat.total_barres_neuves} barre(s) — Rendement : {sec.resultat.taux_rendement}%)
              </span>
            </div>
            <div className="border-[3px] border-black overflow-hidden print:overflow-visible rounded-lg shadow-sm">
              <table className="w-full text-left text-sm border-collapse table-fixed">
                <thead className="bg-white text-black font-black border-b-[3px] border-black text-sm sm:text-base">
                  <tr>
                    <th className="py-2.5 px-1 text-center w-[6%] border-r-2 border-black text-base sm:text-lg font-black">Qté</th>
                    <th className="py-2.5 px-1 text-center w-[12%] border-r-2 border-black">Origine</th>
                    <th className="py-2.5 px-1 border-r-2 border-black w-[14%] text-center text-sm sm:text-base font-black">Repère</th>
                    <th className="py-2.5 px-1 border-r-2 border-black w-[30%] text-center text-sm sm:text-base font-black">Longueur(s) Coupe</th>
                    <th className="py-2.5 px-1 text-center w-[14%] border-r-2 border-black text-sm sm:text-base font-black">Reste</th>
                    <th className="py-2.5 px-1 text-center w-[11%] border-r-2 border-black">Statut</th>
                    <th className="py-2.5 px-1 text-center w-[13%]">Nouvelle Chute</th>
                  </tr>
                </thead>
                {sec.groupesBarresNeuves.map((g, i) => {
                  const nbPieces = g.piecesInfo.length;
                  return (
                    <tbody key={i} className="bg-white of-bar-group">
                      {g.piecesInfo.map((p, pIdx) => {
                        const isLastPieceOfBar = pIdx === nbPieces - 1;
                        const rowBorderClass = isLastPieceOfBar
                          ? 'border-b-[4px] border-black'
                          : 'border-b-2 border-dashed border-black';

                        return (
                          <tr key={`${i}-${pIdx}`} className={`hover:bg-slate-50 ${rowBorderClass}`}>
                            {pIdx === 0 && (
                              <>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-black text-2xl sm:text-3xl text-black border-r-2 border-black font-mono bg-white align-middle"
                                >
                                  {g.quantite}
                                </td>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-mono font-black text-xs sm:text-sm text-black border-r-2 border-black bg-white align-middle"
                                >
                                  Barre {Math.round(sec.barreLongueur || 6000)} mm
                                </td>
                              </>
                            )}
                            <td className="py-2 px-1 border-r-2 border-black font-mono text-center align-middle">
                              <span className="repere-badge font-mono font-black text-lg sm:text-xl text-black inline-block tracking-normal">
                                {p.repere}
                              </span>
                            </td>
                            <td className="py-2 px-1 border-r-2 border-black font-mono text-center align-middle">
                              <span className="longueur-coupe font-mono font-black text-xl sm:text-2xl text-black inline-block tracking-tight">
                                {p.longueur} mm
                              </span>
                            </td>
                            {pIdx === 0 && (
                              <>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-mono font-black border-r-2 border-black align-middle"
                                >
                                  <span className="reste-badge font-mono font-black text-lg sm:text-xl text-black inline-block tracking-tight">
                                    {Math.round(g.chute)} mm
                                  </span>
                                </td>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-bold text-xs sm:text-sm border-r-2 border-black align-middle"
                                >
                                  <span className="font-black text-xs sm:text-sm inline-block text-black">
                                    {g.statut === 'STOCK' ? '📦 À STOCKER' : g.statut === 'Dechet' ? '🗑️ DÉCHET' : '⚠️ SACRIFIER'}
                                  </span>
                                </td>
                                <td rowSpan={nbPieces} className="py-1 px-2 text-center align-middle">
                                  <div className="border-b-2 border-dashed border-black h-5 my-0.5 mx-1 flex items-end justify-center text-[10px] text-slate-500 italic font-semibold">
                                    cote réelle mm
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </div>
        )}

        {/* Coupes sur Chutes du Stock */}
        {sec.groupesChutesRecup.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center text-xs sm:text-sm font-black uppercase text-black px-1 text-center of-keep-with-next">
              <span className="text-black font-black text-sm sm:text-base">
                COUPES SUR CHUTES DU STOCK ({sec.resultat.total_chutes_recyclees} chute(s))
              </span>
            </div>
            <div className="border-[3px] border-black overflow-hidden print:overflow-visible rounded-lg shadow-sm">
              <table className="w-full text-left text-sm border-collapse table-fixed">
                <thead className="bg-white text-black font-black border-b-[3px] border-black text-sm sm:text-base">
                  <tr>
                    <th className="py-2.5 px-1 text-center w-[6%] border-r-2 border-black text-base sm:text-lg font-black">Qté</th>
                    <th className="py-2.5 px-1 text-center w-[12%] border-r-2 border-black bg-white text-black">Origine</th>
                    <th className="py-2.5 px-1 border-r-2 border-black w-[14%] text-center text-sm sm:text-base font-black">Repère</th>
                    <th className="py-2.5 px-1 border-r-2 border-black w-[30%] text-center text-sm sm:text-base font-black">Longueur(s) Coupe</th>
                    <th className="py-2.5 px-1 text-center w-[14%] border-r-2 border-black text-sm sm:text-base font-black">Reste</th>
                    <th className="py-2.5 px-1 text-center w-[11%] border-r-2 border-black">Statut</th>
                    <th className="py-2.5 px-1 text-center w-[13%]">Nouvelle Chute</th>
                  </tr>
                </thead>
                {sec.groupesChutesRecup.map((g, i) => {
                  const nbPieces = g.piecesInfo.length;
                  const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
                  const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
                  const isStocker = g.reste >= rMax;
                  const isDechet = g.reste <= rMin;

                  return (
                    <tbody key={i} className="bg-white of-bar-group">
                      {g.piecesInfo.map((p, pIdx) => {
                        const isLastPieceOfChute = pIdx === nbPieces - 1;
                        const rowBorderClass = isLastPieceOfChute
                          ? 'border-b-[4px] border-black'
                          : 'border-b-2 border-dashed border-black';

                        return (
                          <tr key={`${i}-${pIdx}`} className={`hover:bg-slate-50 ${rowBorderClass}`}>
                            {pIdx === 0 && (
                              <>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-black text-2xl sm:text-3xl text-black border-r-2 border-black font-mono bg-white align-middle"
                                >
                                  {g.quantite}
                                </td>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-mono font-black text-xs sm:text-sm text-black border-r-2 border-black bg-white align-middle"
                                >
                                  Chute {Math.round(g.support)} mm
                                </td>
                              </>
                            )}
                            <td className="py-2 px-1 border-r-2 border-black font-mono text-center align-middle">
                              <span className="repere-badge font-mono font-black text-lg sm:text-xl text-black inline-block tracking-normal">
                                {p.repere}
                              </span>
                            </td>
                            <td className="py-2 px-1 border-r-2 border-black font-mono text-center align-middle">
                              <span className="longueur-coupe font-mono font-black text-xl sm:text-2xl text-black inline-block tracking-tight">
                                {p.longueur} mm
                              </span>
                            </td>
                            {pIdx === 0 && (
                              <>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-mono font-black border-r-2 border-black align-middle"
                                >
                                  <span className="reste-badge font-mono font-black text-lg sm:text-xl text-black inline-block tracking-tight">
                                    {Math.round(g.reste)} mm
                                  </span>
                                </td>
                                <td
                                  rowSpan={nbPieces}
                                  className="py-2.5 px-1 text-center font-bold text-xs sm:text-sm border-r-2 border-black align-middle"
                                >
                                  <span className="font-black text-xs sm:text-sm inline-block text-black">
                                    {isStocker ? '📦 À STOCKER' : isDechet ? '🗑️ DÉCHET' : '⚠️ SACRIFIER'}
                                  </span>
                                </td>
                                <td rowSpan={nbPieces} className="py-1 px-2 text-center align-middle">
                                  <div className="border-b-2 border-dashed border-black h-5 my-0.5 mx-1 flex items-end justify-center text-[10px] text-slate-500 italic font-semibold">
                                    cote réelle mm
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const ofCourantPourDelai: SuiviOF = useMemo(() => {
    return matchedOf || {
      id: `of-temp-${refCommande || 'CMD'}`,
      numeroEmission: currentSequenceNum,
      codeOF: currentCodeOFAffiche,
      numCommande: refCommande || 'CMD',
      nomClient: nomClient || 'CLIENT',
      donneurOrdre: donneurOrdre || agenceInfo.nom || '',
      famille: detecterFamilleOF(famille, sections, lignesMoustiquaires, titreProduit, refCommande),
      titreSection: titreProduit || 'Fiche de Coupe',
      statut: (matchedOf?.statut || 'EMIS') as StatutOF,
      dateEmission: dateCommande || new Date().toLocaleDateString('fr-FR'),
      lignesRetour: [],
      totalBarresNeuvesPrevu: totalBarresNeuvesToutesSections,
      totalChutesUtiliseesPrevu: totalChutesRecycleesToutesSections,
      nombrePieces: Math.max(1, totalPiecesToutesSections),
      estPrioritaire,
      motifPriorite,
      dateLivraisonPrevisionnelle: dateLivraisonPrevisionnelleAffichee,
      dateLivraisonPrevisionnelleISO: dateLivraisonISO
    };
  }, [matchedOf, refCommande, currentSequenceNum, currentCodeOFAffiche, nomClient, donneurOrdre, agenceInfo.nom, famille, sections, lignesMoustiquaires, titreProduit, ofEmis, dateCommande, totalBarresNeuvesToutesSections, totalChutesRecycleesToutesSections, totalPiecesToutesSections, estPrioritaire, motifPriorite, dateLivraisonPrevisionnelleAffichee, dateLivraisonISO]);

  const handleDelaiSaved = (updatedOF: SuiviOF) => {
    setEstPrioritaire(!!updatedOF.estPrioritaire);
    setMotifPriorite(updatedOF.motifPriorite || '');
    setDateLivraisonPrevisionnelleAffichee(updatedOF.dateLivraisonPrevisionnelle || '');
    setDateLivraisonISO(updatedOF.dateLivraisonPrevisionnelleISO || '');
    setMatchedOf(updatedOF);
    setIsEditingDelai(false);
  };

  if (!isOpen) return null;

  return createPortal(
    <div id="ordre-fabrication-modal-overlay" className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:backdrop-blur-none print:overflow-visible">
      {/* Print Specific CSS Injector */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 7mm 8mm 7mm;
            @top-right {
              content: "${currentCodeOFAffiche} — PAGE " counter(page) " / " counter(pages);
              font-family: Consolas, "Courier New", monospace;
              font-size: 8.5pt;
              font-weight: 800;
              color: #000000;
            }
            @bottom-right {
              content: "PAGE " counter(page) " / " counter(pages);
              font-family: Consolas, "Courier New", monospace;
              font-size: 9.5pt;
              font-weight: 900;
              color: #000000;
            }
            @bottom-left {
              content: "${currentCodeOFAffiche} (#${currentSequenceNum}) • COMMANDE N° ${cmdAffichee} • ${clientAffiche}";
              font-family: Consolas, "Courier New", monospace;
              font-size: 8pt;
              font-weight: 700;
              color: #222222;
            }
          }
          .of-partie-break {
            ${optimiserImpressionAntiPagesBlanches
              ? `page-break-before: always !important;
                 break-before: page !important;
                 margin-top: 0 !important;
                 padding-top: 0 !important;`
              : `page-break-before: auto !important;
                 break-before: auto !important;
                 margin-top: 14px !important;
                 padding-top: 10px !important;`}
          }
          .of-partie-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            padding: 8px 12px !important;
            margin-bottom: 6px !important;
          }
          .of-section-container {
            page-break-inside: auto !important;
            break-inside: auto !important;
            margin-bottom: 10px !important;
          }
          .of-section-header-block {
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 4px !important;
          }
          .of-section-header-block > div {
            padding: 4px 8px !important;
            border-width: 2px !important;
            gap: 8px !important;
          }
          .of-section-header-block strong,
          .of-section-header-block .font-mono {
            font-size: 18pt !important;
            padding: 2px 10px !important;
            border-width: 2px !important;
            line-height: 1.2 !important;
          }
          .of-section-header-block span {
            line-height: 1.2 !important;
          }
          .of-section-container table {
            page-break-inside: auto !important;
            break-inside: auto !important;
            margin-bottom: 8px !important;
          }
          .of-section-container thead {
            display: table-header-group !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .of-section-container tbody {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .of-avoid-break, .of-prep-block, .of-section-compact {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .of-keep-with-next, h1, h2, h3, h4, .keep-with-next {
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .of-bar-group {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Empêcher les conteneurs overflow-hidden de bloquer la pagination des tableaux */
          .overflow-hidden, [class*="overflow-hidden"], .of-table-wrapper {
            overflow: visible !important;
            border-radius: 0 !important;
          }
          .print-doc-table {
            width: 100% !important;
            height: auto !important;
            border-collapse: collapse !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-doc-table > tbody > tr > td {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            height: auto !important;
          }
          .print-doc-table > tfoot {
            display: table-footer-group !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-doc-table > tfoot > tr > td {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .print-footer-bar {
            display: block !important;
            width: 100% !important;
            border-top: 1.5px solid #000000 !important;
            padding: 1.5mm 2mm 1mm 2mm !important;
            margin: 0 !important;
            font-size: 8.5pt !important;
            color: #000000 !important;
            background: #ffffff !important;
            box-sizing: border-box !important;
            font-family: Arial, Helvetica, sans-serif !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-footer-bar .footer-line-1 {
            display: flex !important;
            justify-content: space-between !important;
            align-items: baseline !important;
            border-bottom: 1px solid #cccccc !important;
            padding-bottom: 1mm !important;
            margin-bottom: 1mm !important;
            width: 100% !important;
          }
          .print-footer-bar .footer-line-2 {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            width: 100% !important;
            font-size: 8pt !important;
            font-weight: 700 !important;
          }
          html, body {
            height: auto !important;
            min-height: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 12.5px !important;
            line-height: 1.35 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Strictly eliminate root app from print flow */
          #root {
            display: none !important;
          }
          #ordre-fabrication-modal-overlay {
            position: static !important;
            display: block !important;
            inset: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          #ordre-fabrication-card {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
          .of-page-break {
            page-break-before: auto !important;
            break-before: auto !important;
            margin-top: 14px !important;
            padding-top: 10px !important;
          }
          .of-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
            border: 2.5px solid #000000 !important;
          }
          thead {
            display: table-header-group !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          tbody {
            display: table-row-group !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          th, td {
            border: 1.5px solid #000000 !important;
            box-sizing: border-box !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            font-size: ${optimiserImpressionAntiPagesBlanches ? '11px' : '12px'} !important;
            padding: ${optimiserImpressionAntiPagesBlanches ? '4px 5px' : '5px 6px'} !important;
            color: #000000 !important;
            background: #ffffff !important;
          }
          th {
            font-size: ${optimiserImpressionAntiPagesBlanches ? '11px' : '12px'} !important;
            font-weight: 900 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .border-cut-dashed, [class*="border-dashed"] {
            border-bottom: 2.5px dashed #000000 !important;
          }
          .border-bar-solid, [class*="border-b-[4px]"] {
            border-bottom: 4px solid #000000 !important;
          }
          .repere-badge {
            font-size: ${optimiserImpressionAntiPagesBlanches ? '21px' : '26px'} !important;
            font-weight: 900 !important;
            display: inline-block !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            color: #000000 !important;
            letter-spacing: 0.5px !important;
          }
          .longueur-coupe {
            font-size: ${optimiserImpressionAntiPagesBlanches ? '25px' : '32px'} !important;
            font-weight: 900 !important;
            display: inline-block !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            color: #000000 !important;
            letter-spacing: 0.5px !important;
          }
          .reste-badge {
            font-size: ${optimiserImpressionAntiPagesBlanches ? '19px' : '24px'} !important;
            font-weight: 900 !important;
            display: inline-block !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            color: #000000 !important;
          }
          /* Neutraliser les fonds sombres/colorés pour économiser l'encre */
          [class*="bg-slate-950"], [class*="bg-slate-900"], [class*="bg-slate-800"], [class*="bg-black"], [class*="bg-amber"], [class*="bg-emerald"], [class*="bg-sky"] {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            border-color: #000000 !important;
          }
        }
      `}</style>

      <div id="ordre-fabrication-card" className="bg-white border-2 border-black rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl text-black overflow-hidden print:bg-white print:text-black print:max-w-none print:max-h-none print:rounded-none print:block">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="no-print px-5 py-3 bg-white border-b-2 border-black flex items-center justify-between flex-wrap gap-2 text-black">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center text-white font-black text-xs">3M</div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-black flex items-center gap-2">
                  <span>Ordre de Fabrication Multi-Familles Classé</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border-2 border-black font-mono font-bold bg-white text-black">{agenceInfo.nom}</span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono font-black text-xs border border-amber-500 shadow-xs">
                  {currentCodeOFAffiche} (Ordre #{currentSequenceNum})
                </span>
              </div>
              <p className="text-[11px] text-slate-700 font-semibold">
                Cmds : <span className="text-black font-mono font-black">{cmdAffichee}</span> | Client : <strong className="text-black">{clientAffiche}</strong> | {listeSections.length} profilé(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOptimiserImpressionAntiPagesBlanches(prev => !prev)}
              className={`px-3 py-1.5 text-xs font-black rounded-lg border-2 flex items-center gap-1.5 transition cursor-pointer ${
                optimiserImpressionAntiPagesBlanches
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-600'
                  : 'bg-white text-slate-700 border-black hover:bg-slate-50'
              }`}
              title={optimiserImpressionAntiPagesBlanches 
                ? "Fiches Dédiées (Recommandé Atelier) : Fiche Magasin nette en Page 1, Fiche Découpe Atelier en Page 2 sans aucune page blanche"
                : "Mode Continu : enchaîne Fiche 1 et Fiche 2"}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{optimiserImpressionAntiPagesBlanches ? 'Fiches Dédiées Magasin/Scies ✓' : 'Fiches Enchaînées'}</span>
            </button>
            <button onClick={handleDownloadHTML} className="px-3 py-1.5 bg-white hover:bg-slate-100 text-black border-2 border-black text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer">
              <Download className="w-3.5 h-3.5 text-black" /><span>Exporter HTML</span>
            </button>
            <button onClick={handlePrint} className="px-4 py-1.5 bg-black hover:bg-slate-800 text-white text-xs font-black rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer">
              <Printer className="w-4 h-4 text-white" /><span>Imprimer OF (Toutes Pages)</span>
            </button>
            <button
              onClick={handleEmettreOF}
              disabled={ofEmis || isEmitting}
              className={`px-4 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition shadow-sm border-2 ${
                ofEmis
                  ? 'bg-slate-200 text-slate-500 border-slate-400 opacity-60 cursor-not-allowed pointer-events-none'
                  : isEmitting
                  ? 'bg-slate-100 text-slate-400 border-slate-300 cursor-wait'
                  : 'bg-white hover:bg-slate-100 text-black border-black cursor-pointer'
              }`}
              title={ofEmis ? 'Cet Ordre de Fabrication est déjà émis en atelier' : 'Émettre l\'OF'}
            >
              {ofEmis ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <Send className="w-4 h-4 text-black" />}
              <span>{ofEmis ? 'OF Émis ✓' : isEmitting ? 'Émission en cours...' : 'Émettre l\'OF'}</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition ml-1 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Sheet Content */}
        <div className="p-3 sm:p-6 overflow-y-auto bg-slate-100 font-sans print:p-0 print:bg-white print:overflow-visible">
          <table className="print-doc-table w-full border-none p-0 m-0 border-collapse">
            <tbody>
              <tr>
                <td className="border-none p-0 m-0 bg-transparent">
                  <div className="bg-white text-black p-5 sm:p-8 rounded-xl shadow-md border-2 border-black max-w-4xl mx-auto space-y-6 print:p-0 print:border-none print:shadow-none print:max-w-none">

            {/* ========================================================================= */}
            {/* PAGE 1 : PRÉPARATION ATELIER & MATIÈRES PREMIÈRES À DÉSTOCKER            */}
            {/* ========================================================================= */}
            <div className="space-y-4">
              {/* En-tête Général */}
              <div className="flex justify-between items-start border-b-4 border-black pb-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-widest bg-white text-black border-2 border-black px-2.5 py-1 rounded">
                      ORDRE DE FABRICATION
                    </span>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider hidden sm:inline">
                      Fiche Magasin &amp; Débit
                    </span>
                  </div>
                  {/* NUMÉRO DE COMMANDE EN GRAND CARACTÈRE */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xs sm:text-sm font-black uppercase text-black">N° Commande :</span>
                    <span className="text-2xl sm:text-3xl font-black font-mono text-black bg-white px-3 py-1 rounded-lg border-2 border-black tracking-tight shadow-xs">
                      {cmdAffichee}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="border-2 border-black px-3 py-1 text-center bg-white rounded-lg min-w-[130px] shadow-xs">
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-800">Séquence Atelier</div>
                    <div className="text-xl sm:text-2xl font-black font-mono text-black leading-tight tracking-tight">
                      {currentCodeOFAffiche}
                    </div>
                    <div className="text-[10px] font-black bg-black text-white px-1.5 py-0.5 rounded mt-0.5">
                      ORDRE N° {currentSequenceNum}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2.5">
                    <div className="w-11 h-11 bg-white border-2 border-black rounded-lg flex items-center justify-center text-black font-black text-xl shadow-xs">3M</div>
                    <div className="text-left hidden sm:block">
                      <div className="font-black text-base tracking-wider text-black leading-tight">TROIS M</div>
                      <div className="text-[10px] text-slate-700 font-black uppercase tracking-widest">ALUMINIUM</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bannière de Priorité Atelier */}
              {estPrioritaire && (
                <div className="bg-rose-600 text-white font-black text-xs sm:text-sm uppercase tracking-widest text-center py-2 px-4 rounded-lg border-2 border-black flex items-center justify-center gap-2 shadow-xs">
                  <Zap className="w-4 h-4 fill-white shrink-0" />
                  <span>⚡ COMMANDE PRIORITAIRE ATELIER ⚡</span>
                  {motifPriorite && (
                    <span className="font-mono text-xs text-rose-100 font-normal lowercase bg-rose-700/60 px-2 py-0.5 rounded">
                      ({motifPriorite})
                    </span>
                  )}
                </div>
              )}

              {/* Barre Client & Date & Livraison avec police augmentée */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-white border-2 border-black p-3 rounded-lg text-sm text-black">
                <div>
                  <div className="text-[11px] text-slate-600 uppercase font-black tracking-wider">Donneur d'Ordre</div>
                  <div className="font-black text-black text-base sm:text-lg">{agenceInfo.nom}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-600 uppercase font-black tracking-wider">Client Final</div>
                  <div className="font-black text-black text-base sm:text-xl leading-tight">{clientAffiche}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-600 uppercase font-black tracking-wider">Date Commande</div>
                  <div className="font-black text-black text-base sm:text-lg font-mono">{dateAffichee}</div>
                </div>
                <div className={`border-2 p-2 rounded text-center flex flex-col justify-center relative transition ${
                  estPrioritaire ? 'bg-rose-100 border-rose-600' : 'bg-amber-100/90 border-black'
                }`}>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-[10px] uppercase font-black tracking-wider ${
                      estPrioritaire ? 'text-rose-900' : 'text-amber-900'
                    }`}>
                      {estPrioritaire ? '⚡ Livraison Prioritaire' : 'Date Livraison Estimée'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingDelai(true)}
                      className="print:hidden text-[10px] px-1.5 py-0.5 rounded bg-black text-white hover:bg-slate-800 font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                      title="Modifier la date ou définir comme commande prioritaire"
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                      <span>Modifier</span>
                    </button>
                  </div>
                  <div className="font-black text-black text-xs sm:text-sm font-mono tracking-tight mt-0.5">
                    {dateLivraisonPrevisionnelleAffichee || 'CALCUL EN COURS'}
                  </div>
                  {motifPriorite && estPrioritaire && (
                    <div className="text-[10px] text-rose-800 font-semibold italic truncate mt-0.5" title={motifPriorite}>
                      "{motifPriorite}"
                    </div>
                  )}
                </div>
              </div>

              {/* ========================================================================= */}
              {/* PARTIE 1 : PRÉPARATION DU STOCK & MATIÈRES PREMIÈRES (MAGASIN)           */}
              {/* ========================================================================= */}
              {(() => {
                const matieresNeuves = syntheseMatieres.filter(m => m.nbBarresNeuves > 0);
                const chutesADestoquer = syntheseMatieres
                  .flatMap(m => m.chutes.map(c => ({ ...c, codeArt: m.codeArt, designation: m.designation, famille: m.famille })))
                  .sort((a, b) => (a.designation || '').localeCompare(b.designation || '', 'fr', { sensitivity: 'base' }));
                const accessoiresFiltres = syntheseAccessoires.filter(a => !(a.designation || '').toUpperCase().includes('JOUE'));
                const hasToile = Boolean(lignesMoustiquaires && lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').length > 0);
                const hasAnyPreparation = matieresNeuves.length > 0 || chutesADestoquer.length > 0 || accessoiresFiltres.length > 0 || hasToile;

                if (!hasAnyPreparation) return null;

                return (
                  <div className="space-y-4">
                    <div className="bg-white text-black border-2 border-black py-2.5 px-4 rounded-lg shadow-none text-center of-keep-with-next">
                      <span className="font-black text-sm sm:text-base uppercase tracking-tight text-black">
                        📋 FICHE 1 : PRÉPARATION DU STOCK &amp; MATIÈRES PREMIÈRES (MAGASIN)
                      </span>
                    </div>

                    {/* TABLEAU A : BARRES NEUVES DU MAGASIN */}
                    {matieresNeuves.length > 0 && (
                      <div className="space-y-1.5 of-prep-block of-avoid-break">
                        <div className="text-xs sm:text-sm font-black uppercase text-black text-center of-keep-with-next">
                          A. Barres Neuves à prélever du Stock Magasin
                        </div>
                        <div className="border-[2.5px] border-black overflow-hidden print:overflow-visible rounded-lg">
                          <table className="w-full text-left text-sm border-collapse table-fixed">
                            <colgroup>
                              <col className="w-[52%]" />
                              <col className="w-[16%]" />
                              <col className="w-[18%]" />
                              <col className="w-[14%]" />
                            </colgroup>
                            <thead className="bg-white text-black font-black border-b-2 border-black text-xs sm:text-sm">
                              <tr>
                                <th className="py-2 px-2.5 border-r-2 border-black">Désignation</th>
                                <th className="py-2 px-2 text-center border-r-2 border-black bg-white text-black font-black">Quantité</th>
                                <th className="py-2 px-2 text-center border-r-2 border-black">Longueur de la Barre</th>
                                <th className="py-2 px-2 text-center">Pointage</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black bg-white font-mono text-sm">
                              {matieresNeuves.map((m, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="py-2 px-2.5 font-sans font-bold text-black border-r-2 border-black text-xs sm:text-sm">{m.designation}</td>
                                  <td className="py-2 px-2 text-center font-black text-black text-sm sm:text-base border-r-2 border-black bg-white">
                                    {m.nbBarresNeuves} barre(s)
                                  </td>
                                  <td className="py-2 px-2 text-center font-black text-black border-r-2 border-black text-xs sm:text-base font-mono bg-white">{m.longueurBarre} mm</td>
                                  <td className="py-2 px-2 text-center font-sans font-bold text-slate-500 text-xs">[ &nbsp; ] Prélevé</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* TABLEAU B : CHUTES DU STOCK À DÉSTOCKER */}
                    {chutesADestoquer.length > 0 && (
                      <div className="space-y-1.5 pt-1 of-prep-block of-avoid-break">
                        <div className="text-xs sm:text-sm font-black uppercase text-black text-center of-keep-with-next">
                          B. Chutes Récupérées à Déstocker des Casiers
                        </div>
                        <div className="border-[2.5px] border-black overflow-hidden print:overflow-visible rounded-lg">
                          <table className="w-full text-left text-sm border-collapse table-fixed">
                            <colgroup>
                              <col className="w-[52%]" />
                              <col className="w-[16%]" />
                              <col className="w-[18%]" />
                              <col className="w-[14%]" />
                            </colgroup>
                            <thead className="bg-white text-black font-black border-b-2 border-black text-xs sm:text-sm">
                              <tr>
                                <th className="py-2 px-2.5 border-r-2 border-black">Désignation</th>
                                <th className="py-2 px-2 text-center border-r-2 border-black bg-white text-black font-black">Quantité</th>
                                <th className="py-2 px-2 text-center border-r-2 border-black">Longueur de la Barre</th>
                                <th className="py-2 px-2 text-center">Pointage</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black bg-white font-mono text-sm">
                              {chutesADestoquer.map((c, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="py-2 px-2.5 font-sans font-bold text-black border-r-2 border-black text-xs sm:text-sm">{c.designation}</td>
                                  <td className="py-2 px-2 text-center font-black text-black border-r-2 border-black bg-white text-sm sm:text-base">×{c.quantite}</td>
                                  <td className="py-2 px-2 text-center font-black text-black border-r-2 border-black bg-white text-xs sm:text-base font-mono">
                                    {c.longueurDepart} mm
                                  </td>
                                  <td className="py-2 px-2 text-center font-sans font-bold text-slate-500 text-xs">[ &nbsp; ] Déstocké</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* TABLEAU C : ACCESSOIRES À PRÉPARER */}
                    {accessoiresFiltres.length > 0 && (
                      <div className="space-y-1.5 pt-1 of-prep-block of-avoid-break">
                        <div className="text-xs sm:text-sm font-black uppercase text-black text-center of-keep-with-next">
                          C. Accessoires à Préparer
                        </div>
                        <div className="border-[2.5px] border-black overflow-hidden print:overflow-visible rounded-lg">
                          <table className="w-full text-left text-sm border-collapse table-fixed">
                            <colgroup>
                              <col className="w-[52%]" />
                              <col className="w-[16%]" />
                              <col className="w-[18%]" />
                              <col className="w-[14%]" />
                            </colgroup>
                            <thead className="bg-white text-black font-black border-b-2 border-black text-xs sm:text-sm">
                              <tr>
                                <th className="py-2 px-2.5 border-r-2 border-black">Désignation Article</th>
                                <th className="py-2 px-2 text-center border-r-2 border-black bg-white text-black font-black">Quantité</th>
                                <th className="py-2 px-2 border-r-2 border-black">Règle / Affectation</th>
                                <th className="py-2 px-2 text-center">Pointage</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black bg-white text-sm">
                              {accessoiresFiltres.map((a, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="py-2 px-2.5 font-bold text-black border-r-2 border-black text-xs sm:text-sm">
                                    {a.designation}
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono font-black text-black border-r-2 border-black bg-white text-xs sm:text-base">
                                    {a.quantiteRequise} pcs
                                  </td>
                                  <td className="py-2 px-2 text-slate-700 border-r-2 border-black text-xs">
                                    <span className="font-semibold text-black">{a.regleCalcul}</span> ({a.detailPieces})
                                  </td>
                                  <td className="py-2 px-2 text-center font-bold text-slate-500 text-xs">
                                    [ &nbsp; ] Préparé
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* TABLEAU D : DÉBIT TOILE PLISSÉE / MAILLE MSTQ (MATIÈRE PREMIÈRE) */}
              {lignesMoustiquaires && lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').length > 0 && (
                <div className="space-y-1.5 pt-1 of-section-container of-prep-block of-avoid-break">
                  <div className="text-sm sm:text-base font-black uppercase text-black text-center bg-slate-100 border-2 border-black py-1.5 px-3 rounded tracking-wide of-keep-with-next">
                    OPTIMISATION MAILLE MSTQ
                  </div>
                  <div className="border-2 border-black overflow-hidden print:overflow-visible rounded">
                    <table className="w-full text-left text-sm border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[10%]" />
                        <col className="w-[20%]" />
                        <col className="w-[14%]" />
                        <col className="w-[18%]" />
                        <col className="w-[12%]" />
                        <col className="w-[18%]" />
                        <col className="w-[8%]" />
                      </colgroup>
                      <thead className="bg-white text-black font-black border-b-2 border-black text-xs sm:text-sm">
                        <tr>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Repère</th>
                          <th className="py-2.5 px-2 border-r-2 border-black text-xs sm:text-sm">Dim. Finie (L × H)</th>
                          <th className="py-2.5 px-2 border-r-2 border-black text-xs sm:text-sm">Ouverture</th>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Coupe Fixe Maille</th>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Nb Plis</th>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Longueur Fil / Corde</th>
                          <th className="py-2.5 px-2 text-center text-xs sm:text-sm">Surface</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black font-mono text-sm bg-white">
                        {lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').map((m, idx) => {
                          const c = calculerBesoinMaille(m);
                          return (
                            <tr key={m.id || idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-2 text-center font-black text-black border-r-2 border-black text-sm sm:text-base font-mono">{m.repere}</td>
                              <td className="py-2.5 px-2 font-black text-black border-r-2 border-black text-sm sm:text-base font-mono">{m.largeur} × {m.hauteur} mm (×{m.quantite})</td>
                              <td className="py-2.5 px-2 font-sans text-xs sm:text-sm font-bold border-r-2 border-black text-slate-800">
                                {m.typeOuverture === 'PORTE_FENETRE' ? 'Porte-Fenêtre' : m.typeOuverture === 'DOUBLE_VANTAUX' ? 'Baie 2 Vtx' : m.typeOuverture === 'CENTRALE' ? 'Centrale' : m.typeOuverture === 'FIXE' ? 'Fixe' : 'Fenêtre'}
                              </td>
                              <td className="py-2.5 px-2 text-center font-black text-black border-r-2 border-black text-sm sm:text-base font-mono bg-white">
                                {c.dimension_fixe_requise} mm <span className="text-xs font-bold text-slate-700">({c.dimension_fixe_est === 'H' ? 'Hauteur' : 'Largeur'})</span>
                              </td>
                              <td className="py-2.5 px-2 text-center font-black text-black border-r-2 border-black text-sm sm:text-base font-mono">{c.nb_plis_requis} plis</td>
                              <td className="py-2.5 px-2 text-center border-r-2 border-black bg-white">
                                <span className="font-black text-black font-mono text-sm sm:text-base whitespace-nowrap">
                                  {c.longueur_corde_unitaire_m} m/fil - {c.nb_fils_guidage} trous
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-center font-black text-black text-xs sm:text-sm font-mono">{c.superficie_m2} m²</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* ========================================================================= */}
            {/* PARTIE 2 : ATELIER SCIES — PLANS D'OPTIMISATION DE DÉCOUPE DES PROFILÉS   */}
            {/* ========================================================================= */}
            <div className={`space-y-4 pt-4 border-t-4 border-black ${hasAnyPreparation ? 'of-partie-break print:mt-0 print:pt-4' : ''}`}>
              <div className="bg-white text-black p-3.5 rounded-lg border-2 border-black text-center shadow-none of-partie-header of-keep-with-next">
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <div className="font-black text-base sm:text-xl uppercase tracking-wider text-black">
                    ✂️ {hasAnyPreparation ? 'FICHE 2 : OPTIMISATION DE DÉCOUPE ATELIER' : 'FICHE 1 : OPTIMISATION DE DÉCOUPE ATELIER'}
                  </div>
                  <span className="px-3 py-0.5 bg-black text-white font-mono font-black text-sm rounded-md border border-black">
                    {currentCodeOFAffiche} (ORDRE N° {currentSequenceNum})
                  </span>
                </div>
                <div className="text-xs text-black font-bold mt-1">
                  Plans de coupe profilés et débits atelier — Commande N° : <span className="font-mono text-sm sm:text-base font-black px-2 py-0.5 rounded border border-black">{cmdAffichee}</span>
                </div>
              </div>

              {/* Profilés Caissons & Sous-faces */}
              {sectionsParFamille.caissons.map((sec, idx) => renderSectionCuttingTables(sec, idx))}

              {/* Profilés Volets & Tabliers */}
              {sectionsParFamille.tabliers.map((sec, idx) => renderSectionCuttingTables(sec, idx))}

              {/* Profilés Précadres */}
              {sectionsParFamille.precadres.map((sec, idx) => renderSectionCuttingTables(sec, idx))}

              {/* Profilés Moustiquaires */}
              {sectionsParFamille.moustiquaires.map((sec, idx) => renderSectionCuttingTables(sec, idx))}
            </div>

                  </div>
                </td>
              </tr>
            </tbody>
            <tfoot className="print-page-tfoot">
              <tr>
                <td className="border-none p-0 m-0 bg-transparent">
                  <div className="max-w-4xl mx-auto">
                    {/* PIED DE PAGE D'IMPRESSION SUR 2 LIGNES SANS AUCUNE TRONCATURE DU NOM DU CLIENT */}
                    <div className="print-footer-bar border-t-2 border-black pt-2 px-3 mt-3 text-xs text-black bg-white">
                      {/* Ligne 1 : Nom du Client Complet et N° de Commande */}
                      <div className="footer-line-1 flex items-baseline justify-between gap-3 pb-1 border-b border-slate-300 print:border-black/30">
                        <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                          <span className="font-bold text-slate-700 print:text-black uppercase text-[11px] shrink-0">CLIENT :</span>
                          <span className="font-black text-black text-xs sm:text-sm tracking-tight break-words">{clientAffiche}</span>
                          {donneurOrdre && (
                            <span className="font-semibold text-slate-600 print:text-black text-[11px] shrink-0">
                              (Donneur d'Ordre : {donneurOrdre})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-slate-700 print:text-black text-[11px] uppercase">COMMANDE N° :</span>
                          <span className="font-mono font-black text-black text-xs sm:text-sm px-2 py-0.5 bg-slate-100 print:bg-white border border-black rounded">
                            {cmdAffichee}
                          </span>
                        </div>
                      </div>

                      {/* Ligne 2 : Séquence OF, Débit profilés, Date prévisionnelle et Signature Atelier */}
                      <div className="footer-line-2 flex items-center justify-between gap-3 pt-1 text-[11px] font-bold">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs px-2 py-0.5 border border-black rounded bg-black text-white shrink-0">
                            {currentCodeOFAffiche} (#{currentSequenceNum})
                          </span>
                          <span className="text-slate-700 print:text-black font-semibold">
                            {listeSections.length > 0 ? `${listeSections.length} Profilé(s) à débiter` : 'Fiche Atelier'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded border border-black font-mono font-black text-xs ${
                            estPrioritaire ? 'bg-rose-200 text-rose-950' : 'bg-amber-100 text-slate-950'
                          }`}>
                            <Clock className="w-3 h-3 text-black print:hidden" />
                            <span>{dateLivraisonPrevisionnelleAffichee}</span>
                          </div>
                          <span className="font-mono font-black tracking-wider uppercase text-[10px] text-slate-800 print:text-black">
                            3M ALUMINIUM ATELIER
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal interactif pour modifier la date de livraison et définir la commande comme prioritaire */}
      {isEditingDelai && (
        <ModifierDelaiLivraisonModal
          isOpen={isEditingDelai}
          onClose={() => setIsEditingDelai(false)}
          of={ofCourantPourDelai}
          suivisOF={allOfsState}
          onSaved={handleDelaiSaved}
        />
      )}
    </div>,
    document.body
  );
};
