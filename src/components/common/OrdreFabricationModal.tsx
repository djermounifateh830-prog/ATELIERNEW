import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ResultatOptimisation, Article, PieceCoupee, BesoinMoustiquaire, 
  ChuteMaille, SuiviOF, LigneRetourOF, FamilleProduit,
  MappingChutes, ChuteReserveeOF, BarreReserveeOF, ChuteMailleReserveeOF,
  ParametresOptimisationMaille
} from '../../types';
import { detecterAgence } from '../../services/codificationService';
import { calculerBesoinMaille, optimiserLotMoustiquaires } from '../../services/moteurMoustiquaire';
import { StorageService } from '../../services/storage';
import { X, Printer, Download, Send, CheckCircle2, PackageCheck, Layers, Recycle, Scissors } from 'lucide-react';

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
  onOFEmis
}) => {
  const [ofEmis, setOfEmis] = useState<boolean>(false);
  const [isEmitting, setIsEmitting] = useState<boolean>(false);

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

      const barreLongueur = art?.longeur || barresNeuves[0]?.longueur_barre || 6000;
      const lameScie = art?.lame || 4.0;
      const margeDebord = art?.debordement || 0.0;
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
    });
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

  // Totaux globaux
  const totalBarresNeuvesToutesSections = listeSections.reduce((s, sec) => s + (sec.resultat.total_barres_neuves || 0), 0);
  const totalChutesRecycleesToutesSections = listeSections.reduce((s, sec) => s + (sec.resultat.total_chutes_recyclees || 0), 0);
  const totalStockableMm = listeSections.reduce((s, sec) => s + (sec.resultat.total_chute_mm || 0), 0);
  const totalDechetMm = listeSections.reduce((s, sec) => s + (sec.resultat.total_dechet_mm || 0), 0);
  const totalAccessoiresToutesSections = syntheseAccessoires.reduce((s, acc) => s + acc.quantiteRequise, 0);

  if (!isOpen) return null;
  if (listeSections.length === 0) return null;

  const clientAffiche = nomClient || 'CLIENT';
  const cmdAffichee = refCommande || 'COMMANDE';
  const dateAffichee = dateCommande || new Date().toLocaleDateString('fr-FR');
  const agenceInfo = detecterAgence(cmdAffichee);

  const labelFinition = (avecPeinture: boolean) => (avecPeinture ? 'AVEC PEINTURE' : 'SANS PEINTURE');
  const labelMontage = (avecSousFace: boolean, montage: string) => (!avecSousFace ? '' : montage === 'MONTEE_ATELIER' ? 'AVEC MONTAGE' : 'SANS MONTAGE');

  /* ─── RENDU HTML POUR EXPORT / TÉLÉCHARGEMENT ─────────────────────────────── */
  const buildSectionHTML = (sec: SectionTraitee) => {
    const { familleLabel, profileDesignation } = separerFamilleEtProfile(sec);
    const conditionsHtml = sec.titre.toUpperCase().includes('CAISSON') ? [
      labelFinition(sec.avecPeinture),
      sec.avecSousFace ? labelMontage(sec.avecSousFace, sec.montageSousFace) : '',
      sec.avecPlaque !== undefined ? (sec.avecPlaque ? 'AVEC PLAQUE' : 'SANS PLAQUE') : ''
    ].filter(Boolean).join(' | ') : '';

    const barresHTML = sec.groupesBarresNeuves.map(g => {
      const nbPieces = g.piecesInfo.length;
      return g.piecesInfo.map((p, pIdx) => {
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
    }).join('');

    const chutesHTML = sec.groupesChutesRecup.map(g => {
      const nbPieces = g.piecesInfo.length;
      const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
      const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
      const chuteStatut = g.reste >= rMax ? '📦 À STOCKER' : g.reste <= rMin ? '🗑️ DÉCHET' : '⚠️ SACRIFIER';
      return g.piecesInfo.map((p, pIdx) => {
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
    }).join('');

    return `
    <div class="section-container" style="page-break-inside:avoid;margin-bottom:14px;">
      <div style="background:#fff;border:2.5px solid #000;color:#000;padding:8px 14px;margin-bottom:8px;border-radius:6px;display:flex;justify-content:center;align-items:center;gap:14px;flex-wrap:wrap;text-align:center;page-break-after:avoid;">
        <span style="background:#fff;color:#000;font-weight:900;font-size:20px;padding:4px 14px;border-radius:4px;text-transform:uppercase;border:2.5px solid #000;letter-spacing:0.5px;">
          ${familleLabel}
        </span>
        <span style="color:#000;font-size:28px;font-weight:900;">&rarr;</span>
        <strong style="font-size:36px;font-weight:900;color:#000;font-family:Consolas,monospace;text-transform:uppercase;letter-spacing:2px;background:#fff;padding:4px 18px;border:3px solid #000;border-radius:6px;">
          ${profileDesignation}
        </strong>
        ${conditionsHtml ? conditionsHtml.split(' | ').map(c => `<span style="font-size:13px;color:#000;font-weight:900;background:#fff;border:2px solid #000;padding:4px 10px;border-radius:4px;">${c}</span>`).join(' ') : ''}
      </div>
      ${sec.groupesBarresNeuves.length > 0 ? `
      <div style="font-size:14px;font-weight:900;margin:6px 0 4px 0;text-align:center;text-transform:uppercase;color:#000;">
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
        <tbody>${barresHTML}</tbody>
      </table>` : ''}
      ${sec.groupesChutesRecup.length > 0 ? `
      <div style="font-size:14px;font-weight:900;margin:6px 0 4px 0;text-align:center;text-transform:uppercase;color:#000;">
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
        <tbody>${chutesHTML}</tbody>
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
      <div style="margin-top:14px;margin-bottom:14px;page-break-inside:avoid;">
        <div style="font-weight:900;font-size:16px;margin:12px 0 6px 0;text-align:center;text-transform:uppercase;color:#000;background:#fff;border:2.5px solid #000;padding:7px 12px;border-radius:4px;letter-spacing:0.5px;">
          OPTIMISATION MAILLE MSTQ
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:2.5px solid #000;margin-bottom:8px;table-layout:fixed;">
          <colgroup>
            <col style="width:9%;">
            <col style="width:16%;">
            <col style="width:11%;">
            <col style="width:15%;">
            <col style="width:10%;">
            <col style="width:20%;">
            <col style="width:7%;">
            <col style="width:12%;">
          </colgroup>
          <thead>
            <tr style="background:#fff;font-weight:900;border-bottom:2px solid #000;">
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;width:9%;background:#fff;color:#000;font-size:13px;">Repère</th>
              <th style="padding:6px 4px;border-right:1px solid #000;width:16%;background:#fff;color:#000;font-size:13px;">Dim. Finie (L×H)</th>
              <th style="padding:6px 4px;border-right:1px solid #000;width:11%;background:#fff;color:#000;font-size:13px;">Ouverture</th>
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;background:#fff;color:#000;width:15%;font-size:13px;">Coupe Fixe Maille</th>
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;width:10%;background:#fff;color:#000;font-size:13px;">Nb Plis</th>
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;width:20%;background:#fff;color:#000;font-size:13px;">Longueur Fil / Corde</th>
              <th style="padding:6px 4px;text-align:center;border-right:1px solid #000;width:7%;background:#fff;color:#000;font-size:13px;">Surface</th>
              <th style="padding:6px 4px;width:12%;background:#fff;color:#000;font-size:13px;">Source Toile</th>
            </tr>
          </thead>
          <tbody>
            ${mstqToileItems.map((m, idx) => {
              const c = calculerBesoinMaille(m);
              const resMstq = resultatsMaille[idx];
              const chute = resMstq?.chute_trouvee;
              const dec = resMstq?.decision_maille;
              
              let sourceHtml = '';
              if (chute) {
                const plisInfo = dec?.plisEnTrop ? ` · <span style="color:#b45309;font-weight:900;">✂️ -${dec.plisEnTrop}p</span>` : '';
                const actionInfo = dec?.actionReste === 'NOUVELLE_CHUTE_STOCK'
                  ? `<div style="font-size:11px;color:#0369a1;font-weight:bold;margin-top:2px;">🏬 Garder ${dec.resteLongueurMm}mm</div>`
                  : `<div style="font-size:11px;color:#444;margin-top:2px;">Perte: ${dec?.dechetLongueurMm ?? 0}mm</div>`;
                sourceHtml = `
                  <div style="background:#fff;color:#000;padding:3px 4px;border-radius:3px;border:1px solid #000;font-size:12px;line-height:1.2;">
                    <strong>♻️ #${chute.id || 'chute'}</strong> (${chute.dimension_fixe}mm${plisInfo})
                    ${actionInfo}
                  </div>
                `;
              } else {
                sourceHtml = `
                  <div style="background:#fff;color:#000;padding:3px 4px;border-radius:3px;border:1px solid #000;font-size:12px;line-height:1.2;">
                    <strong>📦 Paquet Neuf</strong>
                    <div style="font-size:11px;color:#444;margin-top:2px;">Coupe ${c.dimension_fixe_requise}mm (${c.nb_plis_requis}p)</div>
                  </div>
                `;
              }

              return `
                <tr style="border-bottom:1px solid #000;background:#fff;">
                  <td style="padding:7px 4px;text-align:center;font-weight:900;color:#000;border-right:1px solid #000;font-size:15px;font-family:Consolas,monospace;">${m.repere}</td>
                  <td style="padding:7px 4px;font-weight:900;border-right:1px solid #000;font-size:14px;color:#000;font-family:Consolas,monospace;">${m.largeur} × ${m.hauteur} mm (×${m.quantite})</td>
                  <td style="padding:7px 4px;border-right:1px solid #000;font-size:13px;font-weight:bold;color:#000;">${m.typeOuverture}</td>
                  <td style="padding:7px 4px;text-align:center;font-weight:900;background:#fff;color:#000;border-right:1px solid #000;font-size:15px;font-family:Consolas,monospace;">${c.dimension_fixe_requise} mm <span style="font-size:12px;font-weight:normal;">(${c.dimension_fixe_est})</span></td>
                  <td style="padding:7px 4px;text-align:center;font-weight:900;color:#000;border-right:1px solid #000;font-size:15px;font-family:Consolas,monospace;">${c.nb_plis_requis} plis</td>
                  <td style="padding:7px 4px;border-right:1px solid #000;background:#fff;color:#000;text-align:center;">
                    <span style="font-weight:900;color:#000;font-size:15px;font-family:Consolas,monospace;white-space:nowrap;">${c.longueur_corde_unitaire_m} m/fil - ${c.nb_fils_guidage} trous</span>
                  </td>
                  <td style="padding:7px 4px;text-align:center;font-weight:bold;border-right:1px solid #000;font-size:13px;color:#000;">${c.superficie_m2} m²</td>
                  <td style="padding:7px 4px;color:#000;">${sourceHtml}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    // 2. Sections par familles (Profilés découpés)
    const caissonsHTML = sectionsParFamille.caissons.map(sec => buildSectionHTML(sec)).join('');
    const tabliersHTML = sectionsParFamille.tabliers.map(sec => buildSectionHTML(sec)).join('');
    const precadresHTML = sectionsParFamille.precadres.map(sec => buildSectionHTML(sec)).join('');
    const mstqHTML = sectionsParFamille.moustiquaires.map(sec => buildSectionHTML(sec)).join('');

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Ordre de Fabrication — ${cmdAffichee} — ${clientAffiche}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm 8mm 14mm 8mm; }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; color: #000; background: #fff; font-size: 13px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-footer-fixed {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      white-space: nowrap !important;
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 8mm !important;
      border-top: 2px solid #000 !important;
      padding: 1.5mm 6mm 0 6mm !important;
      font-size: 10pt !important;
      font-weight: 800 !important;
      color: #000 !important;
      background: #fff !important;
      justify-content: space-between !important;
      align-items: center !important;
      font-family: Arial, sans-serif !important;
      z-index: 99999 !important;
      box-sizing: border-box !important;
    }
    .print-footer-page-num {
      font-family: Consolas, monospace !important;
      font-weight: 900 !important;
      border: 1.5px solid #000 !important;
      padding: 1px 8px !important;
      border-radius: 4px !important;
    }
    .print-footer-page-num::after {
      content: "Page " counter(page);
    }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; border-bottom:3px solid #000; padding-bottom:6px; }
    .header-left h1 { font-size:15px; font-weight:900; margin:0 0 4px 0; text-transform:uppercase; color:#000; letter-spacing:0.5px; }
    .header-left .cmd-highlight { font-size:22px; font-weight:900; font-family:Consolas,monospace; color:#000; background:#fff; padding:2px 8px; border:2px solid #000; border-radius:4px; display:inline-block; }
    .logo-m { font-size:24px; font-weight:900; color:#000; border:2px solid #000; padding:2px 8px; border-radius:4px; }
    .logo-text { font-size:10px; font-weight:900; letter-spacing:1px; color:#000; }
    .client-info-bar { display:flex; justify-content:space-between; background:#fff; padding:6px 10px; border:2px solid #000; font-size:13px; margin-bottom:10px; font-weight:bold; border-radius:4px; color:#000; }
    .famille-header { background: #fff; color: #000; border: 2px solid #000; padding: 5px 10px; font-size: 14px; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; }
    table { width:100% !important; border-collapse:collapse !important; margin-bottom:10px !important; table-layout:fixed !important; border: 2.5px solid #000 !important; }
    th { border: 2px solid #000 !important; padding:6px 8px !important; text-align:left; vertical-align:middle; font-size: 13px; background:#fff !important; font-weight:900 !important; text-transform:uppercase; color:#000 !important; }
    td { padding:6px 8px !important; text-align:left; vertical-align:middle; font-size: 13px; box-sizing:border-box !important; word-break:break-word !important; overflow-wrap:break-word !important; color:#000 !important; background:#fff !important; }
    .border-cut-dashed { border-bottom: 2.5px dashed #000 !important; border-right: 2px solid #000 !important; }
    .border-bar-solid { border-bottom: 4px solid #000 !important; border-right: 2px solid #000 !important; }
    .border-cell-standard { border: 1.5px solid #000 !important; }
  </style>
</head>
<body>
  <!-- PARTIE 1 : PRÉPARATION DU STOCK & MATIÈRES PREMIÈRES (MAGASIN) -->
  <div class="header">
    <div class="header-left">
      <h1>Ordre de Fabrication — Fiche de Préparation Magasin &amp; Débit</h1>
      <div style="margin-top:4px;">
        <span style="font-size:13px;font-weight:900;text-transform:uppercase;color:#000;margin-right:6px;">N° Commande :</span>
        <span class="cmd-highlight">${cmdAffichee}</span>
      </div>
    </div>
    <div style="text-align:right;">
      <div class="logo-m">TROIS M</div>
      <div class="logo-text">ALUMINIUM</div>
    </div>
  </div>

  <div class="client-info-bar">
    <div>DONNEUR D'ORDRE : <span style="color:#000;font-weight:900;font-size:15px;">${agenceInfo.nom}</span></div>
    <div>CLIENT FINAL : <span style="font-weight:900;font-size:16px;color:#000;">${clientAffiche}</span></div>
    <div>DATE : <span style="font-weight:900;font-size:15px;color:#000;font-family:Consolas,monospace;">${dateAffichee}</span></div>
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
  <div style="margin-top:16px;border-top:3px solid #000;padding-top:10px;">
    <div style="background:#fff;color:#000;border:2.5px solid #000;padding:8px 12px;margin-bottom:12px;border-radius:4px;text-align:center;">
      <div style="font-size:18px;font-weight:900;text-transform:uppercase;color:#000;letter-spacing:1px;">
        ✂️ OPTIMISATION DE DÉCOUPE
      </div>
      <div style="font-size:12px;color:#000;font-weight:bold;margin-top:2px;">
        Plans de coupe profilés et débits atelier — Commande N° : <span style="font-family:Consolas,monospace;font-size:15px;font-weight:900;border:1.5px solid #000;padding:1px 6px;border-radius:3px;">${cmdAffichee}</span>
      </div>
    </div>

    ${caissonsHTML}
    ${tabliersHTML}
    ${precadresHTML}
    ${mstqHTML}
  </div>

  <!-- PIED DE PAGE IMPRESSION (MENTION CLIENT, N° COMMANDE, N° DE PAGE) SUR UNE SEULE LIGNE -->
  <div class="print-footer-fixed">
    <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50%;flex-shrink:1;"><strong>CLIENT :</strong> ${clientAffiche} ${donneurOrdre ? `(${donneurOrdre})` : ''}</div>
    <div style="white-space:nowrap;flex-shrink:0;padding:0 8px;"><strong>COMMANDE N° :</strong> <span style="font-family:Consolas,monospace;">${cmdAffichee}</span></div>
    <div style="white-space:nowrap;flex-shrink:0;"><span class="print-footer-page-num"></span></div>
  </div>
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
    window.print();
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
        const rMin = sec.article?.refus_min ?? 300;
        const initialAction = resteCalc >= rMin ? 'A_STOCKER' : 'DECHET';

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
        const rMin = sec.article?.refus_min ?? 300;
        const initialAction = resteCalc >= rMin ? 'A_STOCKER' : 'DECHET';

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

    const suivi: SuiviOF = {
      id: `of-${Date.now()}`,
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
      chutesReservees,
      barresReservees,
      chutesMailleReservees
    };

    try {
      await StorageService.upsertSuiviOF(suivi);

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

          if (matches && (d.statut === 'EN_ATTENTE' || d.statut === 'BROUILLON' || !d.statut)) {
            hasUpdates = true;
            return { ...d, statut: 'EN_COURS' as const };
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

    return (
      <div key={sIdx} className="space-y-3 of-avoid-break pt-2">
        {/* Titre du profilé - TRÈS GRAND, VISIBLE, CENTRÉ, FOND BLANC ET BORDURE NOIRE NETTE */}
        <div className="bg-white border-[2.5px] border-black text-black p-3 sm:p-4 rounded-xl flex items-center justify-center gap-3 sm:gap-4 flex-wrap text-center">
          <span className="bg-white text-black font-black text-base sm:text-xl px-4 py-2 rounded-lg uppercase tracking-wider border-2 border-black">
            {familleLabel}
          </span>
          <span className="text-black text-2xl sm:text-3xl font-black">→</span>
          <span className="text-2xl sm:text-4xl lg:text-5xl font-black text-black font-mono tracking-wider uppercase bg-white px-5 py-2 rounded-xl border-[3px] border-black">
            {profileDesignation}
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
        </div>

        {/* Coupes sur Barres Neuves */}
        {sec.groupesBarresNeuves.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center text-xs sm:text-sm font-black uppercase text-black px-1 text-center">
              <span className="text-black font-black text-sm sm:text-base">
                COUPES SUR BARRES NEUVES ({sec.resultat.total_barres_neuves} barre(s) — Rendement : {sec.resultat.taux_rendement}%)
              </span>
            </div>
            <div className="border-[3px] border-black overflow-hidden rounded-lg shadow-sm">
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
                <tbody className="bg-white">
                  {sec.groupesBarresNeuves.flatMap((g, i) => {
                    const nbPieces = g.piecesInfo.length;
                    return g.piecesInfo.map((p, pIdx) => {
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
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Coupes sur Chutes du Stock */}
        {sec.groupesChutesRecup.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center text-xs sm:text-sm font-black uppercase text-black px-1 text-center">
              <span className="text-black font-black text-sm sm:text-base">
                COUPES SUR CHUTES DU STOCK ({sec.resultat.total_chutes_recyclees} chute(s))
              </span>
            </div>
            <div className="border-[3px] border-black overflow-hidden rounded-lg shadow-sm">
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
                <tbody className="bg-white">
                  {sec.groupesChutesRecup.flatMap((g, i) => {
                    const nbPieces = g.piecesInfo.length;
                    const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
                    const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
                    const isStocker = g.reste >= rMax;
                    const isDechet = g.reste <= rMin;

                    return g.piecesInfo.map((p, pIdx) => {
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
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div id="ordre-fabrication-modal-overlay" className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:backdrop-blur-none print:overflow-visible">
      {/* Print Specific CSS Injector */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 8mm 14mm 8mm;
          }
          .print-footer-fixed {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            white-space: nowrap !important;
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: 8mm !important;
            border-top: 2px solid #000000 !important;
            padding: 1.5mm 6mm 0 6mm !important;
            font-size: 10pt !important;
            font-weight: 800 !important;
            color: #000000 !important;
            background: #ffffff !important;
            justify-content: space-between !important;
            align-items: center !important;
            z-index: 99999 !important;
            font-family: Arial, Helvetica, sans-serif !important;
            box-sizing: border-box !important;
          }
          .print-footer-page-num {
            font-family: Consolas, monospace !important;
            font-weight: 900 !important;
            border: 1.5px solid #000000 !important;
            padding: 1px 8px !important;
            border-radius: 4px !important;
          }
          .print-footer-page-num::after {
            content: "Page " counter(page);
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
            margin-top: 16px !important;
            padding-top: 12px !important;
          }
          .of-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
            border: 2.5px solid #000000 !important;
          }
          thead {
            display: table-header-group !important;
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
            font-size: 12px !important;
            padding: 5px 6px !important;
            color: #000000 !important;
            background: #ffffff !important;
          }
          th {
            font-size: 12px !important;
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
            font-size: 26px !important;
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
            font-size: 32px !important;
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
            font-size: 24px !important;
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
              <h2 className="text-sm font-black text-black flex items-center gap-2">
                <span>Ordre de Fabrication Multi-Familles Classé</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border-2 border-black font-mono font-bold bg-white text-black">{agenceInfo.nom}</span>
              </h2>
              <p className="text-[11px] text-slate-700 font-semibold">
                Cmds : <span className="text-black font-mono font-black">{cmdAffichee}</span> | Client : <strong className="text-black">{clientAffiche}</strong> | {listeSections.length} profilé(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadHTML} className="px-3 py-1.5 bg-white hover:bg-slate-100 text-black border-2 border-black text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer">
              <Download className="w-3.5 h-3.5 text-black" /><span>Exporter HTML</span>
            </button>
            <button onClick={handlePrint} className="px-4 py-1.5 bg-black hover:bg-slate-800 text-white text-xs font-black rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer">
              <Printer className="w-4 h-4 text-white" /><span>Imprimer OF (Toutes Pages)</span>
            </button>
            <button
              onClick={handleEmettreOF}
              disabled={ofEmis || isEmitting}
              className={`px-4 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer border-2 border-black ${
                ofEmis
                  ? 'bg-slate-100 text-black cursor-not-allowed'
                  : 'bg-white hover:bg-slate-100 text-black'
              }`}
              title={ofEmis ? 'OF déjà émis' : 'Émettre l\'OF'}
            >
              {ofEmis ? <CheckCircle2 className="w-4 h-4 text-black" /> : <Send className="w-4 h-4 text-black" />}
              <span>{ofEmis ? 'OF Émis ✓' : 'Émettre l\'OF'}</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition ml-1 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Sheet Content */}
        <div className="p-3 sm:p-6 overflow-y-auto bg-slate-100 font-sans print:p-0 print:bg-white print:overflow-visible">
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
                <div className="text-right flex items-center gap-2.5">
                  <div className="w-11 h-11 bg-white border-2 border-black rounded-lg flex items-center justify-center text-black font-black text-xl shadow-xs">3M</div>
                  <div className="text-left">
                    <div className="font-black text-base tracking-wider text-black leading-tight">TROIS M</div>
                    <div className="text-[10px] text-slate-700 font-black uppercase tracking-widest">ALUMINIUM</div>
                  </div>
                </div>
              </div>

              {/* Barre Client & Date avec police augmentée */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white border-2 border-black p-3 rounded-lg text-sm text-black">
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
                    <div className="bg-white text-black border-2 border-black py-2.5 px-4 rounded-lg shadow-none text-center">
                      <span className="font-black text-sm sm:text-base uppercase tracking-tight text-black">
                        📋 PARTIE 1 : PRÉPARATION DU STOCK &amp; MATIÈRES PREMIÈRES (MAGASIN)
                      </span>
                    </div>

                    {/* TABLEAU A : BARRES NEUVES DU MAGASIN */}
                    {matieresNeuves.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs sm:text-sm font-black uppercase text-black text-center">
                          A. Barres Neuves à prélever du Stock Magasin
                        </div>
                        <div className="border-[2.5px] border-black overflow-hidden rounded-lg">
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
                      <div className="space-y-1.5 pt-1">
                        <div className="text-xs sm:text-sm font-black uppercase text-black text-center">
                          B. Chutes Récupérées à Déstocker des Casiers
                        </div>
                        <div className="border-[2.5px] border-black overflow-hidden rounded-lg">
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
                      <div className="space-y-1.5 pt-1">
                        <div className="text-xs sm:text-sm font-black uppercase text-black text-center">
                          C. Accessoires à Préparer
                        </div>
                        <div className="border-[2.5px] border-black overflow-hidden rounded-lg">
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
                <div className="space-y-1.5 pt-1 of-avoid-break">
                  <div className="text-sm sm:text-base font-black uppercase text-black text-center bg-slate-100 border-2 border-black py-1.5 px-3 rounded tracking-wide">
                    OPTIMISATION MAILLE MSTQ
                  </div>
                  <div className="border-2 border-black overflow-hidden rounded">
                    <table className="w-full text-left text-sm border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[9%]" />
                        <col className="w-[16%]" />
                        <col className="w-[11%]" />
                        <col className="w-[15%]" />
                        <col className="w-[10%]" />
                        <col className="w-[20%]" />
                        <col className="w-[7%]" />
                        <col className="w-[12%]" />
                      </colgroup>
                      <thead className="bg-white text-black font-black border-b-2 border-black text-xs sm:text-sm">
                        <tr>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Repère</th>
                          <th className="py-2.5 px-2 border-r-2 border-black text-xs sm:text-sm">Dim. Finie (L × H)</th>
                          <th className="py-2.5 px-2 border-r-2 border-black text-xs sm:text-sm">Ouverture</th>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Coupe Fixe Maille</th>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Nb Plis</th>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Longueur Fil / Corde</th>
                          <th className="py-2.5 px-2 text-center border-r-2 border-black text-xs sm:text-sm">Surface</th>
                          <th className="py-2.5 px-2 text-xs sm:text-sm">Origine Toile</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black font-mono text-sm bg-white">
                        {lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').map((m, idx) => {
                          const c = calculerBesoinMaille(m);
                          const resMstq = resultatsMaille[idx];
                          const chute = resMstq?.chute_trouvee;
                          return (
                            <tr key={m.id || idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-2 text-center font-black text-black border-r-2 border-black text-sm sm:text-base font-mono">{m.repere}</td>
                              <td className="py-2.5 px-2 font-black text-black border-r-2 border-black text-sm sm:text-base font-mono">{m.largeur} × {m.hauteur} mm (×{m.quantite})</td>
                              <td className="py-2.5 px-2 font-sans text-xs sm:text-sm font-bold border-r-2 border-black text-slate-800">
                                {m.typeOuverture === 'PORTE_FENETRE' ? 'Porte-Fenêtre' : m.typeOuverture === 'DOUBLE_VANTAUX' ? 'Baie 2 Vtx' : m.typeOuverture === 'CENTRALE' ? 'Centrale' : m.typeOuverture === 'FIXE' ? 'Fixe' : 'Fenêtre'}
                              </td>
                              <td className="py-2.5 px-2 text-center font-black text-black border-r-2 border-black text-sm sm:text-base font-mono bg-white">
                                {c.dimension_fixe_requise} mm <span className="text-xs font-normal text-slate-600">(${c.dimension_fixe_est === 'H' ? 'H' : 'L'})</span>
                              </td>
                              <td className="py-2.5 px-2 text-center font-black text-black border-r-2 border-black text-sm sm:text-base font-mono">{c.nb_plis_requis} plis</td>
                              <td className="py-2.5 px-2 text-center border-r-2 border-black bg-white">
                                <span className="font-black text-black font-mono text-sm sm:text-base whitespace-nowrap">
                                  {c.longueur_corde_unitaire_m} m/fil - {c.nb_fils_guidage} trous
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-center font-black text-black border-r-2 border-black text-xs sm:text-sm font-mono">{c.superficie_m2} m²</td>
                              <td className="py-2.5 px-2 font-sans text-xs">
                                {chute ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center gap-1 font-black text-black bg-white px-2 py-0.5 rounded border border-black text-xs">
                                      ♻️ Chute #{chute.id || 'stock'} ({chute.dimension_fixe}mm)
                                    </span>
                                    {resMstq?.decision_maille?.plisEnTrop ? (
                                      <span className="text-xs text-amber-800 font-black">
                                        ✂️ Recouper {resMstq.decision_maille.plisEnTrop} pli(s)
                                      </span>
                                    ) : (
                                      <span className="text-xs text-emerald-800 font-bold">
                                        ✓ Plis exacts ({c.nb_plis_requis}p)
                                      </span>
                                    )}
                                    {resMstq?.decision_maille?.actionReste === 'NOUVELLE_CHUTE_STOCK' ? (
                                      <span className="text-xs text-blue-800 font-bold">
                                        🏬 Reste stock: {resMstq.decision_maille.resteLongueurMm} mm
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-700">
                                        Perte: {resMstq?.decision_maille?.dechetLongueurMm ?? 0} mm
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <span className="inline-flex items-center gap-1 font-black text-black bg-white px-2 py-0.5 rounded border border-black text-xs">
                                      📦 Paquet Neuf
                                    </span>
                                    <span className="text-xs text-slate-700 font-bold block mt-0.5">
                                      Coupe: {c.dimension_fixe_requise} mm ({c.nb_plis_requis}p)
                                    </span>
                                  </div>
                                )}
                              </td>
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
            <div className="space-y-4 pt-4 border-t-4 border-black">
              <div className="bg-white text-black p-3.5 rounded-lg border-2 border-black text-center shadow-none">
                <div className="font-black text-base sm:text-xl uppercase tracking-wider text-black">
                  ✂️ OPTIMISATION DE DÉCOUPE
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

            {/* PIED DE PAGE D'IMPRESSION OBLIGATOIRE (CLIENT, N° COMMANDE, N° DE PAGE) SUR UNE SEULE LIGNE */}
            <div className="print-footer-fixed flex flex-row flex-nowrap items-center justify-between whitespace-nowrap border-t-2 border-black pt-2 px-3 mt-4 text-xs sm:text-sm font-black text-black bg-white">
              <div className="flex items-center gap-1.5 shrink min-w-0 truncate">
                <span className="font-bold text-slate-800 shrink-0">CLIENT :</span>
                <span className="font-black text-black truncate">{clientAffiche}</span>
                {donneurOrdre && <span className="font-semibold text-slate-700 shrink-0">({donneurOrdre})</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 px-3">
                <span className="font-bold text-slate-800">COMMANDE N° :</span>
                <span className="font-mono font-black text-black">{cmdAffichee}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="print-footer-page-num font-mono font-black text-black border-2 border-black px-2 py-0.5 rounded">
                  <span className="print:hidden">Page 1</span>
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
