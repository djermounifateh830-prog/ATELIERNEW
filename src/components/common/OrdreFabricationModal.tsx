import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ResultatOptimisation, Article, PieceCoupee, BesoinMoustiquaire, 
  ChuteMaille, SuiviOF, LigneRetourOF, FamilleProduit,
  MappingChutes, ChuteReserveeOF, BarreReserveeOF, ChuteMailleReserveeOF 
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
    return optimiserLotMoustiquaires(mstqToile, chutesMaille);
  }, [lignesMoustiquaires, chutesMaille]);

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
            chuteIndices: []
          });
        }
        const g = mapChutes.get(sig)!;
        g.quantite += 1;
        g.chuteIndices.push(cIdx + 1);
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
    const isCaissonSection = sec.titre.toUpperCase().includes('CAISSON') && !sec.isSousFace && sec.badge !== 'SOUS-FACE' && !sec.titre.toUpperCase().includes('SOUS-FACE');
    const conditionsHtml = sec.titre.toUpperCase().includes('CAISSON') ? [
      labelFinition(sec.avecPeinture),
      sec.avecSousFace ? labelMontage(sec.avecSousFace, sec.montageSousFace) : ''
    ].filter(Boolean).join(' | ') : '';

    let joueHtmlNotice = '';
    if (isSectionCaissonTunnel(sec)) {
      const nbPieces = sec.groupesBarresNeuves.reduce((s, g) => s + (g.quantite * g.piecesInfo.length), 0) + sec.groupesChutesRecup.reduce((s, g) => s + (g.quantite * g.piecesInfo.length), 0);
      if (nbPieces > 0) {
        const dim = extraireDimensionCaisson(sec);
        const joueInfo = determinerJoueArticle(dim, articles);
        const qteJoues = nbPieces * 2;
        joueHtmlNotice = `
        <div style="background:#fef3c7;border:1.5px solid #f59e0b;padding:6px 10px;margin-bottom:8px;font-size:12px;font-weight:bold;color:#92400e;display:flex;justify-content:space-between;align-items:center;">
          <span>🛡️ <strong>ACCESSOIRES JOUES :</strong> 2 Joues par caisson &rarr; Prévoir <strong style="font-size:13px;color:#78350f;background:#fde68a;padding:2px 6px;border-radius:3px;">${qteJoues} pièces</strong> de <strong>${joueInfo.designation}</strong> pour les ${nbPieces} caisson(s)</span>
          <span style="font-size:11px;background:#fde68a;padding:2px 6px;border-radius:3px;color:#78350f;">Article stocké non débité</span>
        </div>`;
      }
    }

    const barresHTML = sec.groupesBarresNeuves.map(g => {
      const nbPieces = g.piecesInfo.length;
      return g.piecesInfo.map((p, pIdx) => `
        <tr style="border-bottom:1px solid #cbd5e1;">
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" style="width:7%;text-align:center;font-weight:900;color:#047857;font-size:18px;background:#f0fdf4;padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">${g.quantite}</td>
            <td rowspan="${nbPieces}" style="width:13%;text-align:center;font-family:Consolas,monospace;font-weight:900;font-size:14px;color:#334155;background:#f8fafc;padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">Barre ${Math.round(sec.barreLongueur || 6000)} mm</td>
          ` : ''}
          <td style="width:25%;font-family:Consolas,monospace;padding:6px 6px;border-right:1px solid #cbd5e1;vertical-align:middle;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong style="font-size:17px;font-weight:900;color:#0f172a;background:#fef3c7;padding:3px 8px;border-radius:4px;border:2px solid #fde68a;">${p.repere}</strong>
              ${p.cmdTag ? `<span style="font-size:13px;background:#e2e8f0;color:#1e293b;padding:2px 6px;border-radius:3px;font-weight:bold;">[Cmd ${p.cmdTag}]</span>` : ''}
            </div>
          </td>
          <td style="width:20%;font-family:Consolas,monospace;font-weight:900;padding:6px 6px;vertical-align:middle;text-align:center;border-right:1px solid #64748b;">
            <span style="background:#f1f5f9;border:2px solid #334155;padding:4px 12px;border-radius:4px;display:inline-block;font-size:20px;font-weight:900;color:#000;letter-spacing:0.5px;">${p.longueur} mm</span>
          </td>
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" style="width:11%;text-align:center;font-weight:900;font-family:Consolas,monospace;font-size:16px;color:#1e293b;padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">${Math.round(g.chute)} mm</td>
            <td rowspan="${nbPieces}" style="width:11%;text-align:center;font-weight:900;font-size:14px;color:${g.statut === 'STOCK' ? '#047857' : g.statut === 'Dechet' ? '#64748b' : '#b91c1c'};padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">
              ${g.statut === 'STOCK' ? '📦 À STOCKER' : g.statut === 'Dechet' ? '🗑️ DÉCHET' : '⚠️ SACRIFIER'}
            </td>
            <td rowspan="${nbPieces}" style="width:13%;padding:6px 2px;vertical-align:middle;text-align:center;">
              <div style="border-bottom:1px dashed #94a3b8;height:22px;margin:2px 4px;display:flex;align-items:flex-end;justify-content:center;font-size:12px;color:#94a3b8;font-style:italic;">cote réelle mm</div>
            </td>
          ` : ''}
        </tr>
      `).join('');
    }).join('');

    const chutesHTML = sec.groupesChutesRecup.map(g => {
      const nbPieces = g.piecesInfo.length;
      const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
      const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
      const chuteStatut = g.reste >= rMax ? '📦 À STOCKER' : g.reste <= rMin ? '🗑️ DÉCHET' : '⚠️ SACRIFIER';
      const chuteStatutColor = g.reste >= rMax ? '#047857' : g.reste <= rMin ? '#64748b' : '#b91c1c';
      return g.piecesInfo.map((p, pIdx) => `
        <tr style="border-bottom:1px solid #cbd5e1;">
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" style="width:7%;text-align:center;font-weight:900;color:#1d4ed8;font-size:18px;background:#eff6ff;padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">${g.quantite}</td>
            <td rowspan="${nbPieces}" style="width:13%;text-align:center;font-family:Consolas,monospace;font-weight:900;font-size:14px;color:#1d4ed8;background:#eff6ff;padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">Chute ${Math.round(g.support)} mm</td>
          ` : ''}
          <td style="width:25%;font-family:Consolas,monospace;padding:6px 6px;border-right:1px solid #cbd5e1;vertical-align:middle;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong style="font-size:17px;font-weight:900;color:#0f172a;background:#e0f2fe;padding:3px 8px;border-radius:4px;border:2px solid #bae6fd;">${p.repere}</strong>
              ${p.cmdTag ? `<span style="font-size:13px;background:#e2e8f0;color:#1e293b;padding:2px 6px;border-radius:3px;font-weight:bold;">[Cmd ${p.cmdTag}]</span>` : ''}
            </div>
          </td>
          <td style="width:20%;font-family:Consolas,monospace;font-weight:900;padding:6px 6px;vertical-align:middle;text-align:center;border-right:1px solid #64748b;">
            <span style="background:#f1f5f9;border:2px solid #334155;padding:4px 12px;border-radius:4px;display:inline-block;font-size:20px;font-weight:900;color:#000;letter-spacing:0.5px;">${p.longueur} mm</span>
          </td>
          ${pIdx === 0 ? `
            <td rowspan="${nbPieces}" style="width:11%;text-align:center;font-weight:900;font-family:Consolas,monospace;font-size:16px;color:#1e293b;padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">${Math.round(g.reste)} mm</td>
            <td rowspan="${nbPieces}" style="width:11%;text-align:center;font-weight:900;font-size:14px;color:${chuteStatutColor};padding:6px 2px;vertical-align:middle;border-right:1px solid #64748b;">
              ${chuteStatut}
            </td>
            <td rowspan="${nbPieces}" style="width:13%;padding:6px 2px;vertical-align:middle;text-align:center;">
              <div style="border-bottom:1px dashed #94a3b8;height:22px;margin:2px 4px;display:flex;align-items:flex-end;justify-content:center;font-size:12px;color:#94a3b8;font-style:italic;">cote réelle mm</div>
            </td>
          ` : ''}
        </tr>
      `).join('');
    }).join('');

    return `
    <div class="section-container" style="page-break-inside:avoid;margin-bottom:12px;">
      <div style="background:#f1f5f9;border:2px solid #0f172a;padding:6px 10px;font-weight:900;font-size:14px;text-transform:uppercase;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
        <span>${sec.titre}</span>
        ${conditionsHtml ? `<span style="font-size:12px;color:#334155;font-weight:bold;">${conditionsHtml}</span>` : ''}
      </div>
      ${joueHtmlNotice}
      ${sec.groupesBarresNeuves.length > 0 ? `
      <div style="font-size:13px;font-weight:900;margin:6px 0 4px 0;border-left:4px solid #047857;padding-left:8px;text-transform:uppercase;color:#065f46;">
        COUPES SUR BARRES NEUVES (${sec.resultat.total_barres_neuves} barre(s) — Rendement : ${sec.resultat.taux_rendement}%)
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed;border:1.5px solid #64748b;">
        <colgroup>
          <col style="width:7%;">
          <col style="width:13%;">
          <col style="width:25%;">
          <col style="width:20%;">
          <col style="width:11%;">
          <col style="width:11%;">
          <col style="width:13%;">
        </colgroup>
        <thead><tr style="background:#f8fafc;border-bottom:2px solid #64748b;">
          <th style="width:7%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Qté</th>
          <th style="width:13%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Origine</th>
          <th style="width:25%;font-size:14px;font-weight:900;padding:6px 6px;border-right:1px solid #64748b;text-align:left;">Repère(s) &amp; N° Cmd</th>
          <th style="width:20%;text-align:center;font-size:14px;font-weight:900;padding:6px 4px;border-right:1px solid #64748b;">Longueur(s) Coupe</th>
          <th style="width:11%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Reste</th>
          <th style="width:11%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Statut</th>
          <th style="width:13%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;">Nouvelle Chute</th>
        </tr></thead>
        <tbody>${barresHTML}</tbody>
      </table>` : ''}
      ${sec.groupesChutesRecup.length > 0 ? `
      <div style="font-size:13px;font-weight:900;margin:6px 0 4px 0;border-left:4px solid #1d4ed8;padding-left:8px;text-transform:uppercase;color:#1e40af;">
        COUPES SUR CHUTES DU STOCK (${sec.resultat.total_chutes_recyclees} chute(s))
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed;border:1.5px solid #64748b;">
        <colgroup>
          <col style="width:7%;">
          <col style="width:13%;">
          <col style="width:25%;">
          <col style="width:20%;">
          <col style="width:11%;">
          <col style="width:11%;">
          <col style="width:13%;">
        </colgroup>
        <thead><tr style="background:#eff6ff;border-bottom:2px solid #64748b;">
          <th style="width:7%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Qté</th>
          <th style="width:13%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Origine</th>
          <th style="width:25%;font-size:14px;font-weight:900;padding:6px 6px;border-right:1px solid #64748b;text-align:left;">Repère(s) &amp; N° Cmd</th>
          <th style="width:20%;text-align:center;font-size:14px;font-weight:900;padding:6px 4px;border-right:1px solid #64748b;">Longueur(s) Coupe</th>
          <th style="width:11%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Reste</th>
          <th style="width:11%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;border-right:1px solid #64748b;">Statut</th>
          <th style="width:13%;text-align:center;font-size:14px;font-weight:900;padding:6px 2px;">Nouvelle Chute</th>
        </tr></thead>
        <tbody>${chutesHTML}</tbody>
      </table>` : ''}
    </div>`;
  };

  const handleDownloadHTML = () => {
    // 1. Tableau Matière Première (Filtrer strictement pour ne jamais afficher d'article à quantité 0)
    const matieresNeuvesFiltrees = syntheseMatieres.filter(m => m.nbBarresNeuves > 0);
    const matieresNeuvesHTML = matieresNeuvesFiltrees.length > 0 ? matieresNeuvesFiltrees.map(m => `
      <tr>
        <td style="font-weight:900;color:#1e3a8a;font-size:13px;padding:5px 6px;">${m.famille}</td>
        <td style="font-size:13px;font-weight:bold;padding:5px 6px;">${m.designation}</td>
        <td style="text-align:center;font-family:Consolas,monospace;font-size:14px;font-weight:900;padding:5px 6px;">${m.longueurBarre} mm</td>
        <td style="text-align:center;font-weight:900;color:#047857;font-size:16px;background:#f0fdf4;padding:5px 6px;">${m.nbBarresNeuves} barre(s)</td>
        <td style="text-align:center;font-weight:900;font-size:14px;font-family:Consolas,monospace;padding:5px 6px;">${m.metrageBarresM.toFixed(1)} m</td>
        <td style="text-align:center;font-weight:bold;color:#64748b;font-size:13px;padding:5px 6px;">[ &nbsp; ] Prélevé</td>
      </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:#64748b;font-style:italic;padding:10px;font-size:13px;">Aucune barre neuve à prélever (fabrication 100% sur chutes du stock).</td></tr>`;

    const chutesADestoquer = syntheseMatieres
      .flatMap(m => m.chutes.map(c => ({ ...c, codeArt: m.codeArt, designation: m.designation, famille: m.famille })))
      .sort((a, b) => (a.designation || '').localeCompare(b.designation || '', 'fr', { sensitivity: 'base' }));
    const chutesDestoquerHTML = chutesADestoquer.length > 0 ? chutesADestoquer.map(c => `
      <tr>
        <td style="font-weight:900;color:#1e3a8a;font-size:13px;padding:5px 6px;">${c.famille}</td>
        <td style="font-size:13px;font-weight:bold;padding:5px 6px;">${c.designation}</td>
        <td style="text-align:center;font-family:Consolas,monospace;font-weight:900;color:#1d4ed8;font-size:15px;background:#eff6ff;padding:5px 6px;">${c.longueurDepart} mm</td>
        <td style="text-align:center;font-weight:900;font-size:15px;padding:5px 6px;">×${c.quantite}</td>
        <td style="text-align:center;font-family:Consolas,monospace;font-size:14px;font-weight:900;padding:5px 6px;">${c.restePrevu} mm (${c.statutReste})</td>
        <td style="text-align:center;font-weight:bold;color:#64748b;font-size:13px;padding:5px 6px;">[ &nbsp; ] Déstocké</td>
      </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:#64748b;font-style:italic;padding:10px;font-size:13px;">Aucune chute du stock à prélever (100% barres neuves).</td></tr>`;

    // 1.c Tableau Accessoires & Joues
    const accessoiresHTML = syntheseAccessoires.length > 0 ? syntheseAccessoires.map(a => `
      <tr>
        <td style="font-weight:900;color:#92400e;font-size:13px;padding:5px 6px;background:#fffbeb;">${a.famille}</td>
        <td style="font-size:13px;font-weight:900;padding:5px 6px;color:#0f172a;">${a.designation}</td>
        <td style="font-size:12px;color:#475569;padding:5px 6px;">${a.regleCalcul} (${a.detailPieces})</td>
        <td style="text-align:center;font-weight:900;color:#92400e;font-size:15px;background:#fef3c7;padding:5px 6px;font-family:Consolas,monospace;">${a.quantiteRequise} pcs</td>
        <td style="text-align:center;font-weight:bold;color:#64748b;font-size:13px;padding:5px 6px;">[ &nbsp; ] Préparé</td>
      </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:#64748b;font-style:italic;padding:10px;font-size:13px;">Aucun accessoire ou joue requis pour ce dossier.</td></tr>`;

    // 1.d Façonnage Toile Plissée / Maille MSTQ (Placée avec les préparations matière première)
    const mstqToileItems = (lignesMoustiquaires || []).filter(m => m.typeFabrication !== 'PROFILES_SEULS');
    const toilePlisseeHTML = mstqToileItems.length > 0 ? `
      <div style="margin-top:12px;margin-bottom:12px;page-break-inside:avoid;">
        <div style="font-weight:900;font-size:13px;margin:8px 0 4px 0;text-transform:uppercase;color:#78350f;background:#fef3c7;border:2px solid #b45309;padding:6px 10px;">
          🕸️ D. Toile Plissée / Maille MSTQ (Débit Toile, Guidage, Plis & Cordes - Matière Première)
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1.5px solid #64748b;margin-bottom:8px;table-layout:fixed;">
          <colgroup>
            <col style="width:8%;">
            <col style="width:14%;">
            <col style="width:11%;">
            <col style="width:13%;">
            <col style="width:9%;">
            <col style="width:16%;">
            <col style="width:8%;">
            <col style="width:10%;">
            <col style="width:11%;">
          </colgroup>
          <thead>
            <tr style="background:#f1f5f9;font-weight:900;border-bottom:1.5px solid #64748b;">
              <th style="padding:5px 4px;text-align:center;border-right:1px solid #cbd5e1;width:8%;">Repère</th>
              <th style="padding:5px 4px;border-right:1px solid #cbd5e1;width:14%;">Dim. Finie (L×H)</th>
              <th style="padding:5px 4px;border-right:1px solid #cbd5e1;width:11%;">Ouverture</th>
              <th style="padding:5px 4px;text-align:center;border-right:1px solid #cbd5e1;background:#fffbeb;width:13%;">Coupe Fixe Maille</th>
              <th style="padding:5px 4px;text-align:center;border-right:1px solid #cbd5e1;width:9%;">Nb Plis</th>
              <th style="padding:5px 4px;border-right:1px solid #cbd5e1;width:16%;background:#faf5ff;color:#581c87;">Longueur Fil / Corde (Mètres)</th>
              <th style="padding:5px 4px;text-align:center;border-right:1px solid #cbd5e1;width:8%;">Surface</th>
              <th style="padding:5px 4px;border-right:1px solid #cbd5e1;width:10%;">Article</th>
              <th style="padding:5px 4px;width:11%;">Source Toile</th>
            </tr>
          </thead>
          <tbody>
            ${mstqToileItems.map((m, idx) => {
              const c = calculerBesoinMaille(m);
              const resMstq = resultatsMaille[idx];
              const chute = resMstq?.chute_trouvee;
              const sourceHtml = chute
                ? `<span style="background:#d1fae5;color:#065f46;padding:2px 5px;border-radius:3px;font-weight:bold;border:1px solid #6ee7b7;font-size:11px;">♻️ Chute (${chute.dimension_fixe}mm, ${chute.plis}p)</span>${resMstq.reste_plis !== undefined ? `<span style="font-size:11px;color:#047857;font-weight:bold;margin-left:4px;">Reste: ${resMstq.reste_plis}p</span>` : ''}`
                : `<span style="background:#f1f5f9;color:#334155;padding:2px 5px;border-radius:3px;font-weight:bold;border:1px solid #cbd5e1;font-size:11px;">📦 Neuf (Coupe ${c.dimension_fixe_requise}mm)</span>`;

              return `
                <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding:5px 4px;text-align:center;font-weight:900;color:#b45309;border-right:1px solid #cbd5e1;font-size:13px;">${m.repere}</td>
                  <td style="padding:5px 4px;font-weight:900;border-right:1px solid #cbd5e1;font-size:12px;">${m.largeur} × ${m.hauteur} mm (×${m.quantite})</td>
                  <td style="padding:5px 4px;border-right:1px solid #cbd5e1;font-size:12px;">${m.typeOuverture}</td>
                  <td style="padding:5px 4px;text-align:center;font-weight:900;background:#fffbeb;border-right:1px solid #cbd5e1;font-size:13px;">${c.dimension_fixe_requise} mm (${c.dimension_fixe_est})</td>
                  <td style="padding:5px 4px;text-align:center;font-weight:900;color:#065f46;border-right:1px solid #cbd5e1;font-size:13px;">${c.nb_plis_requis} plis</td>
                  <td style="padding:5px 4px;border-right:1px solid #cbd5e1;background:#faf5ff;">
                    <div style="font-weight:900;color:#581c87;font-size:15px;font-family:Consolas,monospace;">${c.longueur_corde_totale_m} m <span style="font-size:12px;font-weight:bold;color:#4c1d95;">(${c.longueur_corde_totale_m} Mètres)</span></div>
                    <div style="font-size:11px;color:#334155;margin-top:2px;"><strong style="color:#0f172a;">${c.nb_fils_guidage} fils</strong> · ${c.longueur_corde_unitaire_m} m / fil · entraxe ${(c.distance_cordes / 1000).toFixed(2)} m (${c.distance_cordes} mm)</div>
                  </td>
                  <td style="padding:5px 4px;text-align:center;font-weight:bold;border-right:1px solid #cbd5e1;font-size:12px;">${c.superficie_m2} m²</td>
                  <td style="padding:5px 4px;border-right:1px solid #cbd5e1;font-size:11px;">${m.articleDesignationMaille || 'MSTQ MAILLE 20mm'}</td>
                  <td style="padding:5px 4px;">${sourceHtml}</td>
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

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Ordre de Fabrication — ${cmdAffichee} — ${clientAffiche}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm 8mm 8mm 8mm; }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; color: #000; background: #fff; font-size: 13px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:2px solid #000; padding-bottom:4px; }
    .header-left h1 { font-size:16px; font-weight:900; margin:0 0 2px 0; text-transform:uppercase; color:#0f172a; }
    .header-left .meta { font-size:12px; color:#111; }
    .logo-m { font-size:22px; font-weight:900; color:#1e3a8a; }
    .logo-text { font-size:10px; font-weight:bold; letter-spacing:1px; color:#333; }
    .client-info-bar { display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 10px; border:1px solid #94a3b8; font-size:12px; margin-bottom:8px; font-weight:bold; }
    .page-break { page-break-before: always; break-before: page; margin-top: 10px; }
    .famille-header { background: #0f172a; color: #fff; padding: 6px 12px; font-size: 14px; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
    table { width:100% !important; border-collapse:collapse !important; margin-bottom:10px !important; table-layout:fixed !important; }
    th, td { border:1px solid #64748b !important; padding:5px 6px !important; text-align:left; vertical-align:middle; font-size: 12px; box-sizing:border-box !important; word-break:break-word !important; overflow-wrap:break-word !important; }
    th { background:#f1f5f9 !important; font-weight:900 !important; font-size:12px !important; text-transform:uppercase; color:#0f172a !important; }
    .global-footer-box { border:2px solid #000; padding:8px 12px; display:flex; justify-content:space-around; font-size:12px; font-weight:900; margin-top:10px; background:#f8fafc; page-break-inside:avoid; flex-wrap:wrap; gap:8px; }
  </style>
</head>
<body>
  <!-- PARTIE 1 : PRÉPARATION DU STOCK & MATIÈRES PREMIÈRES (MAGASIN) -->
  <div class="header">
    <div class="header-left">
      <h1>Ordre de Fabrication — Fiche de Préparation Magasin &amp; Débit</h1>
      <div class="meta">Dossier / Commandes : <strong>${cmdAffichee}</strong> | Client : <strong>${clientAffiche}</strong> | Date : ${dateAffichee}</div>
    </div>
    <div style="text-align:right;">
      <div class="logo-m">TROIS M</div>
      <div class="logo-text">ALUMINIUM</div>
    </div>
  </div>

  <div class="client-info-bar">
    <div>DONNEUR D'ORDRE : <span style="color:#1e40af;font-weight:900;">${agenceInfo.nom}</span></div>
    <div>CLIENT FINAL : <span style="font-weight:900;">${clientAffiche}</span></div>
    <div>DATE : ${dateAffichee}</div>
  </div>

  <div style="background:#0284c7;color:#fff;padding:6px 10px;font-weight:900;font-size:13px;text-transform:uppercase;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
    <span>📋 PARTIE 1 : PRÉPARATION DU STOCK &amp; MATIÈRES PREMIÈRES (MAGASIN)</span>
    <span style="font-size:11px;font-weight:normal;opacity:0.9;">Prélèvement Profilés, Chutes, Joues &amp; Toile</span>
  </div>

  <div style="font-weight:900;font-size:13px;margin:6px 0 4px 0;text-transform:uppercase;color:#047857;">A. Barres Neuves à sortir du Magasin :</div>
  <table style="table-layout:fixed;width:100%;">
    <colgroup>
      <col style="width:14%;">
      <col style="width:36%;">
      <col style="width:13%;">
      <col style="width:13%;">
      <col style="width:12%;">
      <col style="width:12%;">
    </colgroup>
    <thead><tr>
      <th style="width:14%;">Famille</th>
      <th style="width:36%;">Désignation Profilé</th>
      <th style="width:13%;text-align:center;">Longueur</th>
      <th style="width:13%;text-align:center;">Qté Barres</th>
      <th style="width:12%;text-align:center;">Métrage (m)</th>
      <th style="width:12%;text-align:center;">Pointage</th>
    </tr></thead>
    <tbody>${matieresNeuvesHTML}</tbody>
  </table>

  <div style="font-weight:900;font-size:13px;margin:10px 0 4px 0;text-transform:uppercase;color:#1d4ed8;">B. Chutes Récupérées à Déstocker des Casiers :</div>
  <table style="table-layout:fixed;width:100%;">
    <colgroup>
      <col style="width:14%;">
      <col style="width:36%;">
      <col style="width:15%;">
      <col style="width:9%;">
      <col style="width:14%;">
      <col style="width:12%;">
    </colgroup>
    <thead><tr>
      <th style="width:14%;">Famille</th>
      <th style="width:36%;">Désignation Profilé</th>
      <th style="width:15%;text-align:center;">Chute à Sortir</th>
      <th style="width:9%;text-align:center;">Qté</th>
      <th style="width:14%;text-align:center;">Reste Estimé</th>
      <th style="width:12%;text-align:center;">Pointage</th>
    </tr></thead>
    <tbody>${chutesDestoquerHTML}</tbody>
  </table>

  <div style="font-weight:900;font-size:13px;margin:10px 0 4px 0;text-transform:uppercase;color:#92400e;">C. Accessoires &amp; Joues de Caisson à Préparer (Articles Stockés non coupés) :</div>
  <table style="table-layout:fixed;width:100%;">
    <colgroup>
      <col style="width:16%;">
      <col style="width:44%;">
      <col style="width:18%;">
      <col style="width:11%;">
      <col style="width:11%;">
    </colgroup>
    <thead><tr>
      <th style="width:16%;">Famille</th>
      <th style="width:44%;">Désignation Article</th>
      <th style="width:18%;">Règle / Affectation</th>
      <th style="width:11%;text-align:center;">Qté Requise</th>
      <th style="width:11%;text-align:center;">Pointage</th>
    </tr></thead>
    <tbody>${accessoiresHTML}</tbody>
  </table>

  ${toilePlisseeHTML}

  <div class="global-footer-box">
    <div>BARRES NEUVES : <span style="color:#047857;font-size:13px;">${totalBarresNeuvesToutesSections} barre(s)</span></div>
    <div>CHUTES RÉCUPÉRÉES : <span style="color:#1d4ed8;font-size:13px;">${totalChutesRecycleesToutesSections} chute(s)</span></div>
    <div>JOUES / ACCESSOIRES : <span style="color:#b45309;font-size:13px;">${totalAccessoiresToutesSections} pièce(s)</span></div>
    <div>CHUTES À RE-STOCKER : <span style="color:#047857;font-size:13px;">${totalStockableMm} mm</span></div>
    <div>DÉCHETS ESTIMÉS : <span style="color:#b91c1c;font-size:13px;">${totalDechetMm} mm</span></div>
  </div>

  <!-- PARTIE 2 : ATELIER SCIES — PLANS D'OPTIMISATION DE DÉCOUPE DES PROFILÉS -->
  <div class="page-break">
    <div style="background:#0f172a;color:#f8fafc;padding:7px 12px;font-size:13px;font-weight:900;text-transform:uppercase;border-left:6px solid #f59e0b;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span>✂️ PARTIE 2 : ATELIER SCIES — PLANS D'OPTIMISATION DE DÉCOUPE DES PROFILÉS</span>
      <span style="font-size:11px;color:#94a3b8;font-mono;">${cmdAffichee}</span>
    </div>

    ${sectionsParFamille.caissons.length > 0 ? `
    <div style="page-break-inside:avoid;margin-bottom:12px;">
      <div class="famille-header">
        <span>📦 FAMILLE 1 : CAISSONS TUNNEL &amp; SOUS-FACES ALU</span>
        <span style="font-size:11px;font-family:Consolas,monospace;">
          ${numCommandeCaisson ? `N° Cmd: ${numCommandeCaisson}` : ''}
        </span>
      </div>
      ${caissonsHTML}
    </div>` : ''}

    ${sectionsParFamille.tabliers.length > 0 ? `
    <div style="page-break-inside:avoid;margin-bottom:12px;">
      <div class="famille-header">
        <span>🚪 FAMILLE 2 : VOLETS &amp; TABLIERS</span>
        <span style="font-size:11px;font-family:Consolas,monospace;">${numCommandeTablier ? `Cmd: ${numCommandeTablier}` : ''}</span>
      </div>
      ${tabliersHTML}
    </div>` : ''}

    ${sectionsParFamille.precadres.length > 0 ? `
    <div style="page-break-inside:avoid;margin-bottom:12px;">
      <div class="famille-header">
        <span>🔲 FAMILLE 3 : PRÉCADRES ALUMINIUM</span>
        <span style="font-size:11px;font-family:Consolas,monospace;">${numCommandePrecadre ? `Cmd: ${numCommandePrecadre}` : ''}</span>
      </div>
      ${precadresHTML}
    </div>` : ''}

    ${sectionsParFamille.moustiquaires.length > 0 ? `
    <div style="page-break-inside:avoid;margin-bottom:12px;">
      <div class="famille-header">
        <span>🖼️ FAMILLE 4 : MOUSTIQUAIRES (Profilés Cadre, Coulisse, Barre Inférieure)</span>
        <span style="font-size:11px;font-family:Consolas,monospace;">${numCommandeMoustiquaire ? `Cmd: ${numCommandeMoustiquaire}` : ''}</span>
      </div>
      ${mstqHTML}
    </div>` : ''}
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
            saisieOperateur: ''
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
          articleCode: sec.article?.code_art
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
    const isCaissonCorps = isCaissonHeader && !sec.isSousFace && sec.badge !== 'SOUS-FACE' && !sec.titre.toUpperCase().includes('SOUS-FACE');
    if (isCaissonHeader) {
      if (sec.avecPeinture) conditionsParts.push('AVEC PEINTURE');
      else conditionsParts.push('SANS PEINTURE');
      if (sec.avecSousFace) {
        conditionsParts.push(sec.montageSousFace === 'MONTEE_ATELIER' ? 'AVEC MONTAGE' : 'SANS MONTAGE');
      }
    }

    let joueSectionInfo: { desig: string; code: string; qte: number; nbCaissons: number } | null = null;
    if (isSectionCaissonTunnel(sec)) {
      const nbPieces = sec.groupesBarresNeuves.reduce((s, g) => s + (g.quantite * g.piecesInfo.length), 0) + sec.groupesChutesRecup.reduce((s, g) => s + (g.quantite * g.piecesInfo.length), 0);
      if (nbPieces > 0) {
        const dim = extraireDimensionCaisson(sec);
        const joueInfo = determinerJoueArticle(dim, articles);
        joueSectionInfo = { desig: joueInfo.designation, code: joueInfo.codeArt, qte: nbPieces * 2, nbCaissons: nbPieces };
      }
    }

    return (
      <div key={sIdx} className="space-y-3 of-avoid-break pt-2">
        {/* Titre du profilé */}
        <div className="flex items-center justify-between gap-2 bg-slate-100 border-2 border-slate-900 py-2 px-3.5 rounded flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0"></span>
            <span className="font-black text-sm sm:text-base text-slate-950 uppercase tracking-tight">{sec.titre}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {conditionsParts.map((c, i) => (
              <span
                key={i}
                className={`text-xs font-black px-2.5 py-0.5 rounded border ${
                  c.includes('AVEC PEINTURE')
                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                    : c.includes('AVEC MONTAGE')
                    ? 'bg-sky-100 text-sky-900 border-sky-300'
                    : c.includes('SANS MONTAGE')
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-slate-200 text-slate-700 border-slate-300'
                }`}
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Notice Joues Automatiques pour Caisson */}
        {joueSectionInfo && (
          <div className="flex items-center justify-between bg-amber-50 border-2 border-amber-400 p-2.5 rounded text-xs sm:text-sm font-bold text-amber-950 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🛡️</span>
              <span>
                <strong>Accessoires Joues :</strong> 2 Joues par caisson &rarr; Prévoir <strong className="text-amber-900 bg-amber-200 px-2 py-0.5 rounded font-black font-mono">{joueSectionInfo.qte} pièces</strong> de <strong className="text-amber-950">{joueSectionInfo.desig}</strong> ({joueSectionInfo.code}) pour les {joueSectionInfo.nbCaissons} caisson(s) de cette série.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
              📦 Préparation Magasinier (Non Débité)
            </span>
          </div>
        )}

        {/* Coupes sur Barres Neuves */}
        {sec.groupesBarresNeuves.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm font-black uppercase text-slate-900 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-4 bg-emerald-700 rounded-xs"></div>
                <span className="text-emerald-900 font-black">COUPES SUR BARRES NEUVES ({sec.resultat.total_barres_neuves} barre(s))</span>
              </div>
              <span className="text-xs font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Rendement : {sec.resultat.taux_rendement}%
              </span>
            </div>
            <div className="border-2 border-slate-400 overflow-hidden rounded">
              <table className="w-full text-left text-sm border-collapse table-fixed">
                <thead className="bg-slate-100 text-slate-900 font-black border-b-2 border-slate-400 text-sm sm:text-base">
                  <tr>
                    <th className="py-2 px-2 text-center w-[7%] border-r border-slate-300">Qté</th>
                    <th className="py-2 px-2 text-center w-[13%] border-r border-slate-300">Origine</th>
                    <th className="py-2 px-2 border-r border-slate-300 w-[25%] text-left">Repère(s) &amp; N° Cmd</th>
                    <th className="py-2 px-2 border-r border-slate-300 w-[20%] text-center">Longueur(s) Coupe</th>
                    <th className="py-2 px-2 text-center w-[11%] border-r border-slate-300">Reste</th>
                    <th className="py-2 px-2 text-center w-[11%] border-r border-slate-300">Statut</th>
                    <th className="py-2 px-2 text-center w-[13%]">Nouvelle Chute</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 bg-white">
                  {sec.groupesBarresNeuves.flatMap((g, i) => {
                    const nbPieces = g.piecesInfo.length;
                    return g.piecesInfo.map((p, pIdx) => (
                      <tr key={`${i}-${pIdx}`} className="hover:bg-slate-50 border-b border-slate-200">
                        {pIdx === 0 && (
                          <>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-black text-base sm:text-xl text-emerald-800 border-r border-slate-300 font-mono bg-emerald-50/50 align-middle"
                            >
                              {g.quantite}
                            </td>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-mono font-black text-xs sm:text-sm text-slate-700 border-r border-slate-300 bg-slate-50 align-middle"
                            >
                              Barre {Math.round(sec.barreLongueur || 6000)} mm
                            </td>
                          </>
                        )}
                        <td className="py-2 px-2 border-r border-slate-300 font-mono align-middle">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-sm sm:text-base text-slate-950 bg-amber-100 px-2.5 py-1 rounded border border-amber-300">
                              {p.repere}
                            </span>
                            {p.cmdTag && (
                              <span className="text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300 font-bold">
                                Cmd {p.cmdTag}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 border-r border-slate-300 font-mono text-center align-middle">
                          <span className="font-mono font-black text-base sm:text-xl text-slate-950 bg-slate-100 px-3 py-1 rounded border-2 border-slate-400 inline-block shadow-sm">
                            {p.longueur} mm
                          </span>
                        </td>
                        {pIdx === 0 && (
                          <>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-mono font-black text-sm sm:text-base text-slate-900 border-r border-slate-300 align-middle"
                            >
                              {Math.round(g.chute)} mm
                            </td>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-bold text-xs sm:text-sm border-r border-slate-300 align-middle"
                            >
                              <span
                                className={`px-2 py-1 rounded font-black text-xs sm:text-sm inline-block ${
                                  g.statut === 'STOCK'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : g.statut === 'Dechet'
                                    ? 'bg-slate-100 text-slate-600 border border-slate-300'
                                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                                }`}
                              >
                                {g.statut === 'STOCK' ? '📦 À STOCKER' : g.statut === 'Dechet' ? '🗑️ DÉCHET' : '⚠️ SACRIFIER'}
                              </span>
                            </td>
                            <td rowSpan={nbPieces} className="py-1 px-2 text-center align-middle">
                              <div className="border-b border-dashed border-slate-400 h-5 my-0.5 mx-1 flex items-end justify-center text-[10px] text-slate-400 italic">
                                cote réelle mm
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Coupes sur Chutes du Stock */}
        {sec.groupesChutesRecup.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase text-slate-900 px-1">
              <div className="w-2 h-4 bg-sky-700 rounded-xs"></div>
              <span className="text-sky-900 font-black">COUPES SUR CHUTES DU STOCK ({sec.resultat.total_chutes_recyclees} chute(s))</span>
            </div>
            <div className="border-2 border-slate-400 overflow-hidden rounded">
              <table className="w-full text-left text-sm border-collapse table-fixed">
                <thead className="bg-sky-50 text-slate-900 font-black border-b-2 border-slate-400 text-sm sm:text-base">
                  <tr>
                    <th className="py-2 px-2 text-center w-[7%] border-r border-slate-300">Qté</th>
                    <th className="py-2 px-2 text-center w-[13%] border-r border-slate-300 bg-sky-100 text-sky-950">Origine</th>
                    <th className="py-2 px-2 border-r border-slate-300 w-[25%] text-left">Repère(s) &amp; N° Cmd</th>
                    <th className="py-2 px-2 border-r border-slate-300 w-[20%] text-center">Longueur(s) Coupe</th>
                    <th className="py-2 px-2 text-center w-[11%] border-r border-slate-300">Reste</th>
                    <th className="py-2 px-2 text-center w-[11%] border-r border-slate-300">Statut</th>
                    <th className="py-2 px-2 text-center w-[13%]">Nouvelle Chute</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 bg-white">
                  {sec.groupesChutesRecup.flatMap((g, i) => {
                    const nbPieces = g.piecesInfo.length;
                    const rMin = sec.resultat?.refus_min ?? sec.article?.refus_min ?? 300;
                    const rMax = sec.resultat?.refus_max ?? sec.article?.refus_max ?? 500;
                    const isStocker = g.reste >= rMax;
                    const isDechet = g.reste <= rMin;
                    return g.piecesInfo.map((p, pIdx) => (
                      <tr key={`${i}-${pIdx}`} className="hover:bg-sky-50/30 border-b border-slate-200">
                        {pIdx === 0 && (
                          <>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-black text-base sm:text-xl text-sky-800 border-r border-slate-300 font-mono bg-sky-50/50 align-middle"
                            >
                              {g.quantite}
                            </td>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-mono font-black text-xs sm:text-sm text-sky-950 border-r border-slate-300 bg-sky-100/50 align-middle"
                            >
                              Chute {Math.round(g.support)} mm
                            </td>
                          </>
                        )}
                        <td className="py-2 px-2 border-r border-slate-300 font-mono align-middle">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-sm sm:text-base text-sky-950 bg-sky-100 px-2.5 py-1 rounded border border-sky-300">
                              {p.repere}
                            </span>
                            {p.cmdTag && (
                              <span className="text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300 font-bold">
                                Cmd {p.cmdTag}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 border-r border-slate-300 font-mono text-center align-middle">
                          <span className="font-mono font-black text-base sm:text-xl text-slate-950 bg-sky-50 px-3 py-1 rounded border-2 border-sky-400 inline-block shadow-sm">
                            {p.longueur} mm
                          </span>
                        </td>
                        {pIdx === 0 && (
                          <>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-mono font-black text-sm sm:text-base text-slate-900 border-r border-slate-300 align-middle"
                            >
                              {Math.round(g.reste)} mm
                            </td>
                            <td
                              rowSpan={nbPieces}
                              className="py-2.5 px-1 text-center font-bold text-xs sm:text-sm border-r border-slate-300 align-middle"
                            >
                              <span
                                className={`px-2 py-1 rounded font-black text-xs sm:text-sm inline-block ${
                                  isStocker
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : isDechet
                                    ? 'bg-slate-100 text-slate-600 border border-slate-300'
                                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                                }`}
                              >
                                {isStocker ? '📦 À STOCKER' : isDechet ? '🗑️ DÉCHET' : '⚠️ SACRIFIER'}
                              </span>
                            </td>
                            <td rowSpan={nbPieces} className="py-1 px-2 text-center align-middle">
                              <div className="border-b border-dashed border-slate-400 h-5 my-0.5 mx-1 flex items-end justify-center text-[10px] text-slate-400 italic">
                                cote réelle mm
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ));
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
            margin: 8mm 8mm 8mm 8mm;
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
            page-break-before: always !important;
            break-before: page !important;
            margin-top: 0 !important;
            padding-top: 8px !important;
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
            border-color: #64748b !important;
            box-sizing: border-box !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            font-size: 12px !important;
            padding: 5px 6px !important;
          }
          th {
            font-size: 12px !important;
            font-weight: 900 !important;
          }
        }
      `}</style>

      <div id="ordre-fabrication-card" className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden print:bg-white print:text-black print:max-w-none print:max-h-none print:rounded-none print:block">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="no-print px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black text-xs">3M</div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Ordre de Fabrication Multi-Familles Classé</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-bold ${agenceInfo.badgeBg} ${agenceInfo.badgeColor}`}>{agenceInfo.nom}</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Cmds : <span className="text-amber-400 font-mono font-bold">{cmdAffichee}</span> | Client : <strong className="text-slate-200">{clientAffiche}</strong> | {listeSections.length} profilé(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadHTML} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer">
              <Download className="w-3.5 h-3.5 text-emerald-400" /><span>Exporter HTML</span>
            </button>
            <button onClick={handlePrint} className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer">
              <Printer className="w-4 h-4" /><span>Imprimer OF (Toutes Pages)</span>
            </button>
            <button
              onClick={handleEmettreOF}
              disabled={ofEmis || isEmitting}
              className={`px-4 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer border ${
                ofEmis
                  ? 'bg-emerald-900/50 border-emerald-600/50 text-emerald-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white border-sky-500/40'
              }`}
              title={ofEmis ? 'OF déjà émis' : 'Émettre l\'OF'}
            >
              {ofEmis ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              <span>{ofEmis ? 'OF Émis ✓' : 'Émettre l\'OF'}</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-1 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Sheet Content */}
        <div className="p-3 sm:p-6 overflow-y-auto bg-slate-950/70 font-sans print:p-0 print:bg-white print:overflow-visible">
          <div className="bg-white text-slate-900 p-5 sm:p-8 rounded-xl shadow-xl border border-slate-300 max-w-4xl mx-auto space-y-6 print:p-0 print:border-none print:shadow-none print:max-w-none">

            {/* ========================================================================= */}
            {/* PAGE 1 : PRÉPARATION ATELIER & MATIÈRES PREMIÈRES À DÉSTOCKER            */}
            {/* ========================================================================= */}
            <div className="space-y-4">
              {/* En-tête Général */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-2">
                <div>
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 uppercase">
                    Ordre de Fabrication — Fiche de Préparation Magasin &amp; Débit
                  </h1>
                  <div className="text-sm font-bold text-slate-800 mt-1 font-mono">
                    Commande(s) : <strong className="text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">{cmdAffichee}</strong> • Client : <strong className="text-slate-950">{clientAffiche}</strong> • Date : {dateAffichee}
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div className="w-9 h-9 bg-slate-900 rounded flex items-center justify-center text-amber-400 font-black text-base">3M</div>
                  <div>
                    <div className="font-black text-sm tracking-wider text-slate-900">TROIS M</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">ALUMINIUM</div>
                  </div>
                </div>
              </div>

              {/* Barre Donneur d'Ordre & Client */}
              <div className="grid grid-cols-3 gap-2 bg-slate-100 border-2 border-slate-300 p-2.5 rounded text-sm">
                <div>
                  <div className="text-[10px] text-slate-600 uppercase font-black">Donneur d'Ordre</div>
                  <div className="font-black text-blue-900 text-sm sm:text-base">{agenceInfo.nom}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-600 uppercase font-black">Client Final</div>
                  <div className="font-black text-slate-950 text-sm sm:text-base">{clientAffiche}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-600 uppercase font-black">Date Émission</div>
                  <div className="font-black text-slate-900 text-sm sm:text-base">{dateAffichee}</div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* PARTIE 1 : PRÉPARATION DU STOCK & MATIÈRES PREMIÈRES (MAGASIN)           */}
              {/* ========================================================================= */}
              <div className="flex items-center justify-between bg-sky-700 text-white py-2 px-3.5 rounded shadow-sm">
                <div className="flex items-center gap-2.5">
                  <PackageCheck className="w-5 h-5 text-sky-100 shrink-0" />
                  <span className="font-black text-sm sm:text-base uppercase tracking-tight">
                    PARTIE 1 : PRÉPARATION DU STOCK &amp; MATIÈRES PREMIÈRES (MAGASIN)
                  </span>
                </div>
                <span className="text-xs text-sky-100 hidden sm:inline font-medium">Prélèvement profilés, chutes, accessoires &amp; toile</span>
              </div>

              {/* TABLEAU A : BARRES NEUVES DU MAGASIN */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase text-emerald-900">
                  <Layers className="w-4 h-4 text-emerald-700" />
                  <span>A. Barres Neuves à prélever du Stock Magasin</span>
                </div>
                {(() => {
                  const matieresNeuves = syntheseMatieres.filter(m => m.nbBarresNeuves > 0);
                  if (matieresNeuves.length === 0) {
                    return (
                      <div className="p-3 rounded border-2 border-slate-300 bg-slate-50 text-slate-600 italic text-xs sm:text-sm text-center font-medium">
                        Aucune barre neuve à prélever (fabrication 100% sur chutes du stock).
                      </div>
                    );
                  }
                  return (
                    <div className="border-2 border-slate-400 overflow-hidden rounded">
                      <table className="w-full text-left text-sm border-collapse table-fixed">
                        <thead className="bg-slate-100 text-slate-900 font-black border-b-2 border-slate-400 text-xs sm:text-sm">
                          <tr>
                            <th className="py-1.5 px-2 border-r border-slate-300 w-[14%]">Famille</th>
                            <th className="py-1.5 px-2 border-r border-slate-300 w-[36%]">Désignation Profilé</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-300 w-[13%]">Longueur</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-300 w-[13%] bg-emerald-100 text-emerald-950 font-black">Qté Barres</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-300 w-[12%]">Métrage (m)</th>
                            <th className="py-1.5 px-2 text-center w-[12%]">Pointage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300 bg-white font-mono text-sm">
                          {matieresNeuves.map((m, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-2 font-sans font-black text-slate-900 border-r border-slate-300">
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-black inline-block ${
                                  m.famille === 'CAISSON' ? 'bg-emerald-100 text-emerald-900' :
                                  m.famille === 'TABLIER' ? 'bg-sky-100 text-sky-900' :
                                  m.famille === 'PRECADRE' ? 'bg-indigo-100 text-indigo-900' :
                                  'bg-amber-100 text-amber-900'
                                }`}>
                                  {m.famille}
                                </span>
                              </td>
                              <td className="py-2 px-2 font-sans font-bold text-slate-900 border-r border-slate-300 text-xs sm:text-sm">{m.designation}</td>
                              <td className="py-2 px-2 text-center font-black text-slate-900 border-r border-slate-300 text-xs sm:text-sm">{m.longueurBarre} mm</td>
                              <td className="py-2 px-2 text-center font-black text-emerald-900 text-sm sm:text-base border-r border-slate-300 bg-emerald-50">
                                {m.nbBarresNeuves} b
                              </td>
                              <td className="py-2 px-2 text-center font-black text-slate-900 border-r border-slate-300 text-xs sm:text-sm">{m.metrageBarresM.toFixed(1)} m</td>
                              <td className="py-2 px-2 text-center font-sans font-bold text-slate-400 text-xs">[ &nbsp; ] Prélevé</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* TABLEAU B : CHUTES DU STOCK À DÉSTOCKER */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase text-sky-900">
                  <Recycle className="w-4 h-4 text-sky-700" />
                  <span>B. Chutes Récupérées à Déstocker des Casiers</span>
                </div>
                {(() => {
                  const chutesADestoquer = syntheseMatieres
                    .flatMap(m => m.chutes.map(c => ({ ...c, codeArt: m.codeArt, designation: m.designation, famille: m.famille })))
                    .sort((a, b) => (a.designation || '').localeCompare(b.designation || '', 'fr', { sensitivity: 'base' }));

                  if (chutesADestoquer.length === 0) {
                    return (
                      <div className="p-4 rounded border-2 border-slate-300 bg-slate-50 text-slate-600 italic text-sm text-center font-medium">
                        Aucune chute du stock à prélever (fabrication 100% sur barres neuves).
                      </div>
                    );
                  }

                  return (
                    <div className="border-2 border-slate-400 overflow-hidden rounded">
                      <table className="w-full text-left text-sm border-collapse table-fixed">
                        <thead className="bg-sky-50 text-slate-900 font-black border-b-2 border-slate-400 text-xs sm:text-sm">
                          <tr>
                            <th className="py-1.5 px-2 border-r border-slate-300 w-[14%]">Famille</th>
                            <th className="py-1.5 px-2 border-r border-slate-300 w-[36%]">Désignation Profilé</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-300 w-[15%] bg-sky-100 text-sky-950 font-black">Chute à Sortir</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-300 w-[9%]">Qté</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-300 w-[14%]">Reste Estimé</th>
                            <th className="py-1.5 px-2 text-center w-[12%]">Pointage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300 bg-white font-mono text-sm">
                          {chutesADestoquer.map((c, idx) => (
                            <tr key={idx} className="hover:bg-sky-50/40">
                              <td className="py-2 px-2 font-sans font-black text-slate-900 border-r border-slate-300">
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-black bg-sky-100 text-sky-900 inline-block">
                                  {c.famille}
                                </span>
                              </td>
                              <td className="py-2 px-2 font-sans font-bold text-slate-900 border-r border-slate-300 text-xs sm:text-sm">{c.designation}</td>
                              <td className="py-2 px-2 text-center font-black text-sky-950 border-r border-slate-300 bg-sky-100/60 text-xs sm:text-sm">
                                {c.longueurDepart} mm
                              </td>
                              <td className="py-2 px-2 text-center font-black text-slate-950 border-r border-slate-300 text-sm">×{c.quantite}</td>
                              <td className="py-2 px-2 text-center font-black border-r border-slate-300 text-slate-800 text-xs">
                                {c.restePrevu} mm ({c.statutReste})
                              </td>
                              <td className="py-2 px-2 text-center font-sans font-bold text-slate-400 text-xs">[ &nbsp; ] Déstocké</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* TABLEAU C : ACCESSOIRES & JOUES DE CAISSON À PRÉPARER */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase text-amber-900">
                  <span className="text-base">🛡️</span>
                  <span>C. Accessoires &amp; Joues de Caisson à Préparer (Articles Stockés non coupés)</span>
                </div>
                {syntheseAccessoires.length === 0 ? (
                  <div className="p-3 rounded border-2 border-slate-300 bg-slate-50 text-slate-500 italic text-xs sm:text-sm text-center font-medium">
                    Aucun accessoire ou joue requis pour ce dossier.
                  </div>
                ) : (
                  <div className="border-2 border-amber-300 overflow-hidden rounded">
                    <table className="w-full text-left text-sm border-collapse table-fixed">
                      <thead className="bg-amber-50 text-amber-950 font-black border-b-2 border-amber-300 text-xs sm:text-sm">
                        <tr>
                          <th className="py-1.5 px-2 border-r border-amber-200 w-[16%]">Famille</th>
                          <th className="py-1.5 px-2 border-r border-amber-200 w-[44%]">Désignation Article</th>
                          <th className="py-1.5 px-2 border-r border-amber-200 w-[18%]">Règle / Affectation</th>
                          <th className="py-1.5 px-2 text-center border-r border-amber-200 w-[11%] bg-amber-100 text-amber-950 font-black">Qté Requise</th>
                          <th className="py-1.5 px-2 text-center w-[11%]">Pointage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-200 bg-white text-sm">
                        {syntheseAccessoires.map((a, idx) => (
                          <tr key={idx} className="hover:bg-amber-50/50">
                            <td className="py-2 px-2 font-black text-amber-900 border-r border-amber-200">
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-black bg-amber-100 text-amber-900 inline-block">
                                {a.famille}
                              </span>
                            </td>
                            <td className="py-2 px-2 font-bold text-slate-950 border-r border-amber-200 text-xs sm:text-sm">
                              {a.designation}
                            </td>
                            <td className="py-2 px-2 text-slate-600 border-r border-amber-200 text-xs">
                              <span className="font-semibold text-slate-800">{a.regleCalcul}</span> ({a.detailPieces})
                            </td>
                            <td className="py-2 px-2 text-center font-mono font-black text-amber-950 border-r border-amber-200 bg-amber-100/70 text-xs sm:text-sm">
                              {a.quantiteRequise} pcs
                            </td>
                            <td className="py-2 px-2 text-center font-bold text-slate-400 text-xs">
                              [ &nbsp; ] Préparé
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* TABLEAU D : DÉBIT TOILE PLISSÉE / MAILLE MSTQ (MATIÈRE PREMIÈRE) */}
              {lignesMoustiquaires && lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').length > 0 && (
                <div className="space-y-1.5 pt-1 of-avoid-break">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase text-amber-950">
                    <span className="text-base">🕸️</span>
                    <span>D. Toile Plissée / Maille MSTQ (Débit Toile, Guidage, Plis &amp; Cordes)</span>
                  </div>
                  <div className="border-2 border-amber-400 overflow-hidden rounded">
                    <table className="w-full text-left text-sm border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[8%]" />
                        <col className="w-[14%]" />
                        <col className="w-[11%]" />
                        <col className="w-[13%]" />
                        <col className="w-[9%]" />
                        <col className="w-[16%]" />
                        <col className="w-[8%]" />
                        <col className="w-[10%]" />
                        <col className="w-[11%]" />
                      </colgroup>
                      <thead className="bg-amber-100 text-amber-950 font-black border-b-2 border-amber-400 text-xs sm:text-sm">
                        <tr>
                          <th className="py-2 px-2 text-center border-r border-amber-300">Repère</th>
                          <th className="py-2 px-2 border-r border-amber-300">Dim. Finie (L × H)</th>
                          <th className="py-2 px-2 border-r border-amber-300">Ouverture</th>
                          <th className="py-2 px-2 text-center border-r border-amber-300 bg-amber-200">Coupe Fixe Maille</th>
                          <th className="py-2 px-2 text-center border-r border-amber-300">Nb Plis (+2)</th>
                          <th className="py-2 px-2 border-r border-amber-300 bg-purple-50 text-purple-950">Longueur Fil / Corde (Mètres)</th>
                          <th className="py-2 px-2 text-center border-r border-amber-300">Surface</th>
                          <th className="py-2 px-2 border-r border-amber-300">Article</th>
                          <th className="py-2 px-2">Origine Toile</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-200 font-mono text-sm bg-white">
                        {lignesMoustiquaires.filter(m => m.typeFabrication !== 'PROFILES_SEULS').map((m, idx) => {
                          const c = calculerBesoinMaille(m);
                          const resMstq = resultatsMaille[idx];
                          const chute = resMstq?.chute_trouvee;
                          return (
                            <tr key={m.id || idx} className="hover:bg-amber-50/50">
                              <td className="py-2 px-1 text-center font-black text-amber-900 border-r border-amber-200 text-xs sm:text-sm">{m.repere}</td>
                              <td className="py-2 px-2 font-black text-slate-950 border-r border-amber-200 text-xs sm:text-sm">{m.largeur} × {m.hauteur} mm (×{m.quantite})</td>
                              <td className="py-2 px-1 font-sans text-xs font-bold border-r border-amber-200 text-slate-800">
                                {m.typeOuverture === 'PORTE_FENETRE' ? 'Porte-Fenêtre' : m.typeOuverture === 'DOUBLE_VANTAUX' ? 'Baie 2 Vtx' : m.typeOuverture === 'CENTRALE' ? 'Centrale' : m.typeOuverture === 'FIXE' ? 'Fixe' : 'Fenêtre'}
                              </td>
                              <td className="py-2 px-1 text-center font-black text-amber-900 border-r border-amber-200 text-xs sm:text-sm bg-amber-50">
                                {c.dimension_fixe_requise} mm <span className="text-[10px] font-normal text-slate-600">({c.dimension_fixe_est === 'H' ? 'H' : 'L'})</span>
                              </td>
                              <td className="py-2 px-1 text-center font-black text-emerald-800 border-r border-amber-200 text-xs sm:text-sm">{c.nb_plis_requis} plis</td>
                              <td className="py-2 px-2 text-xs border-r border-amber-200 font-sans bg-purple-50/40">
                                <div className="font-black text-purple-900 font-mono text-sm sm:text-base">
                                  {c.longueur_corde_totale_m} m <span className="text-xs text-purple-700 font-bold font-sans">({c.longueur_corde_totale_m} MÈTRES)</span>
                                </div>
                                <div className="text-slate-800 font-semibold text-[11px] mt-0.5">
                                  <strong className="text-slate-950 font-mono">{c.nb_fils_guidage} fils</strong> · {c.longueur_corde_unitaire_m} m/fil · entraxe {(c.distance_cordes / 1000).toFixed(2)} m ({c.distance_cordes} mm)
                                </div>
                              </td>
                              <td className="py-2 px-1 text-center font-black text-slate-900 border-r border-amber-200 text-xs sm:text-sm">{c.superficie_m2} m²</td>
                              <td className="py-2 px-1 font-sans text-xs font-semibold text-slate-700 border-r border-amber-200">{m.articleDesignationMaille || 'MSTQ MAILLE PLISSÉE 20mm'}</td>
                              <td className="py-2 px-1 font-sans text-xs">
                                {chute ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1 font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 text-[11px]">
                                      ♻️ Chute #{chute.id || 'stock'}
                                    </span>
                                    <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                                      Stock: {chute.dimension_fixe}mm ({chute.plis} plis)
                                      {resMstq?.reste_plis !== undefined && (
                                        <span className="text-emerald-700 font-bold ml-1">➔ Reste: {resMstq.reste_plis} p</span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="inline-flex items-center gap-1 font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 text-[11px]">
                                      📦 Paquet Neuf
                                    </span>
                                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                      Coupe à {c.dimension_fixe_requise}mm
                                    </div>
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

              {/* Bilan Synthétique Préparation */}
              <div className="border-2 border-slate-900 py-3 px-4 flex flex-wrap justify-between items-center font-black text-xs sm:text-sm uppercase bg-slate-50 gap-3 rounded of-avoid-break">
                <div>BARRES NEUVES : <span className="text-emerald-800 font-mono text-base sm:text-lg">{totalBarresNeuvesToutesSections}</span></div>
                <div>CHUTES RÉCUPÉRÉES : <span className="text-sky-800 font-mono text-base sm:text-lg">{totalChutesRecycleesToutesSections}</span></div>
                <div>JOUES / ACCESSOIRES : <span className="text-amber-800 font-mono text-base sm:text-lg">{totalAccessoiresToutesSections} pcs</span></div>
                <div>CHUTES À RE-STOCKER : <span className="text-emerald-700 font-mono text-base sm:text-lg">{totalStockableMm} mm</span></div>
                <div>DÉCHETS ESTIMÉS : <span className="text-rose-700 font-mono text-base sm:text-lg">{totalDechetMm} mm</span></div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* PARTIE 2 : ATELIER SCIES — PLANS D'OPTIMISATION DE DÉCOUPE DES PROFILÉS   */}
            {/* ========================================================================= */}
            <div className="of-page-break space-y-4 pt-4 border-t-4 border-slate-900">
              <div className="flex items-center justify-between bg-slate-950 text-white p-3 rounded border-l-4 border-amber-500 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">✂️</span>
                  <span className="font-black text-sm sm:text-base uppercase tracking-wider text-amber-300">
                    PARTIE 2 : ATELIER &amp; SCIES — PLANS D'OPTIMISATION DE DÉCOUPE DES PROFILÉS
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-300">
                  Dossier : <strong>{cmdAffichee}</strong>
                </span>
              </div>

              {/* FAMILLE 1 : CAISSONS TUNNEL & SOUS-FACES ALU */}
              {sectionsParFamille.caissons.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between bg-slate-900 text-white p-2.5 rounded flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📦</span>
                      <span className="font-black text-xs sm:text-sm uppercase tracking-wide">
                        FAMILLE 1 : CAISSONS TUNNEL &amp; SOUS-FACES ALU
                      </span>
                    </div>
                    {numCommandeCaisson && (
                      <span className="bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-600/50 font-mono text-xs font-bold">
                        N° Cmd : {numCommandeCaisson}
                      </span>
                    )}
                  </div>
                  {sectionsParFamille.caissons.map((sec, idx) => renderSectionCuttingTables(sec, idx))}
                </div>
              )}

              {/* FAMILLE 2 : VOLETS & TABLIERS */}
              {sectionsParFamille.tabliers.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between bg-slate-900 text-white p-2.5 rounded flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚪</span>
                      <span className="font-black text-xs sm:text-sm uppercase tracking-wide">
                        FAMILLE 2 : VOLETS &amp; TABLIERS (Lames, Lame Finale, Coulisses)
                      </span>
                    </div>
                    {numCommandeTablier && (
                      <span className="bg-sky-950 text-sky-300 px-2 py-0.5 rounded border border-sky-600/50 font-mono text-xs font-bold">
                        N° Cmd Tablier : {numCommandeTablier}
                      </span>
                    )}
                  </div>
                  {sectionsParFamille.tabliers.map((sec, idx) => renderSectionCuttingTables(sec, idx))}
                </div>
              )}

              {/* FAMILLE 3 : PRÉCADRES ALUMINIUM */}
              {sectionsParFamille.precadres.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between bg-slate-900 text-white p-2.5 rounded flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔲</span>
                      <span className="font-black text-xs sm:text-sm uppercase tracking-wide">
                        FAMILLE 3 : PRÉCADRES ALUMINIUM (Profilés, Renforts, Montants)
                      </span>
                    </div>
                    {numCommandePrecadre && (
                      <span className="bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-600/50 font-mono text-xs font-bold">
                        N° Cmd Précadre : {numCommandePrecadre}
                      </span>
                    )}
                  </div>
                  {sectionsParFamille.precadres.map((sec, idx) => renderSectionCuttingTables(sec, idx))}
                </div>
              )}

              {/* FAMILLE 4 : MOUSTIQUAIRES (Profilés Cadre & Coulisses) */}
              {sectionsParFamille.moustiquaires.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between bg-slate-900 text-white p-2.5 rounded flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🖼️</span>
                      <span className="font-black text-xs sm:text-sm uppercase tracking-wide">
                        FAMILLE 4 : MOUSTIQUAIRES (Profilés Cadre, Coulisse, Barre Inférieure)
                      </span>
                    </div>
                    {numCommandeMoustiquaire && (
                      <span className="bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-600/50 font-mono text-xs font-bold">
                        N° Cmd Moustiquaire : {numCommandeMoustiquaire}
                      </span>
                    )}
                  </div>
                  {sectionsParFamille.moustiquaires.map((sec, idx) => renderSectionCuttingTables(sec, idx))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
