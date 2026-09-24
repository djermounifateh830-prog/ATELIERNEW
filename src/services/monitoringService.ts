import {
  DossierCommandeGlobal,
  SuiviOF,
  Article,
  FamilleProduit,
  ParametresProductionAtelier,
  InfoStatutDelai,
  PropositionHeuresSup
} from '../types';
import { DelaisProductionService, PlanningItemSimulation } from './delaisProductionService';

// ============================================================================
// TYPES POUR LE MONITORING ATELIER
// ============================================================================

export type TailleCaissonCle = '25' | '30' | '40' | 'AUTRE';
export type LameTablierCle = '43' | '55' | 'AUTRE';
export type TypePrecadreCle = '36' | '50' | 'AUTRE';
export type TypeMoustiquaireCle = 'PORTE_FENETRE' | 'FENETRE' | 'DOUBLE_VANTAUX' | 'FIXE' | 'AUTRE';

export interface DetailStatSousType {
  cle: string;
  label: string;
  nbCommandes: number;
  totalPieces: number;
  pourcentage: number;
  commandesRefs: string[];
}

export interface StatsFamilleMonitoring {
  famille: FamilleProduit;
  label: string;
  nbCommandesEnCours: number;
  totalPiecesEnCours: number;
  // Détail spécifique Caissons
  detailsCaissons?: {
    c25: DetailStatSousType;
    c30: DetailStatSousType;
    c40: DetailStatSousType;
    autres: DetailStatSousType;
  };
  // Détail spécifique Tabliers
  detailsTabliers?: {
    l43: DetailStatSousType;
    l55: DetailStatSousType;
    autres: DetailStatSousType;
  };
  // Détail spécifique Précadres (Type 36 et Type 50)
  detailsPrecadres?: {
    p36: DetailStatSousType;
    p50: DetailStatSousType;
    autres: DetailStatSousType;
  };
  // Détail spécifique Moustiquaires (Porte-Fenêtre, Fenêtre, Double Vantaux, Fixe, Autres)
  detailsMoustiquaires?: {
    porteFenetre: DetailStatSousType;
    fenetre: DetailStatSousType;
    doubleVantaux: DetailStatSousType;
    fixe: DetailStatSousType;
    autres: DetailStatSousType;
  };
  // Détails génériques pour Moustiquaires et Précadres
  detailsGeneriques?: DetailStatSousType[];
  // Cadences et Délais prévisionnels
  capaciteJournaliere: number;
  tempsUnitaireMin: number;
  chargeHeuresEstimee: number;
  joursOuvresRequis: number;
  dateLivraisonJusquAu: string; // Ex: "LIVRAISON : MERCREDI 16/09"
  dateFinDate: Date;
  tauxOccupationJour: number; // Pourcentage de la journée courante
  propositionHeuresSup?: PropositionHeuresSup;
}

export interface LigneCommandeMonitoring {
  id: string;
  dossierId?: string;
  refCommande: string;
  client: string;
  donneurOrdre: string;
  dateCommande: string;
  dateEmission?: string;
  estPrioritaire?: boolean;
  estEnPause?: boolean;
  motifPause?: string;
  repriseTimestamp?: number;
  famille: FamilleProduit;
  statutAtelier: 'EN_ATTENTE_COUPE' | 'OF_EMIS' | 'COUPE_EN_COURS' | 'RETOUR_SAISI' | 'PRET_LIVRAISON' | 'OF_CLOTURE' | 'FABRIQUE' | 'EN_PAUSE';
  statutBadgeLabel: string;
  typePrecision: string; // Ex: "Caisson 30", "Tablier Lame 43", etc.
  sousTypeCle?: string; // Clé normalisée principale pour filtrage rapide (ex: 'CAISSON_30')
  sousTypesCles?: string[]; // Liste de toutes les clés de sous-types contenues dans la commande
  detailsSousTypes?: { cle: string; label: string; nbPieces: number }[]; // Détail unitaire des pièces par sous-type
  detailArticles: string;
  quantiteTotalPieces: number;
  dateLivraisonPrevisionnelle: string;
  dateLivraisonPrevisionnelleISO?: string;
  ofCode?: string;
  ofStatut?: string;
  // Détection du respect des délais et alerte atelier
  alerteDelai: InfoStatutDelai;
}

// ────────────────────────────────────────────────────────────────────────
// NOUVEAUX TYPES : VENTILATION PAR CLIENT, FAMILLE & SOUS-TYPE
// ────────────────────────────────────────────────────────────────────────

export interface DetailTypeClient {
  typeCle?: string; // Ex: 'CAISSON_30', 'TABLIER_43', 'MSTQ_FENETRE'
  cle: string; // Ex: 'CAISSON_30'
  typeLabel?: string;
  label: string; // Ex: 'Caisson 30 (300 mm)', 'Lame 43 mm'
  totalPieces: number; // Nombre exact de pièces à fabriquer pour ce type (et NON nombre de lignes)
  nbPieces?: number; // Alias
  nbCommandes?: number; // Nombre de commandes concernées
  commandesRefs?: string[];
  pourcentageFamille?: number;
}

export interface DetailFamilleClient {
  famille: FamilleProduit;
  familleLabel?: string;
  labelFamille: string; // Ex: 'Volets Roulants & Tabliers', 'Caissons & Sous-Faces'
  totalPieces: number; // Nombre total de pièces à fabriquer pour cette famille
  totalCommandes: number; // Nombre de commandes dans cette famille
  nbCommandes?: number; // Alias
  types: DetailTypeClient[]; // Détail par type/sous-type pour cette famille
}

export interface ClientMonitoringGroup {
  clientNom?: string; // Alias
  nomClient: string;
  donneurOrdre: string;
  totalCommandes: number; // Total des commandes en cours pour ce client
  totalCommandesEnCours: number; // Alias explicite
  totalPieces: number; // Total des pièces à fabriquer pour ce client (toutes familles confondues)
  familles: DetailFamilleClient[]; // Détail total par famille et nbr de pièces par famille
  commandes: LigneCommandeMonitoring[]; // Lignes de commandes associées
  hasRetard?: boolean;
  hasRetardCritique?: boolean;
  dateLivraisonLaPlusProche?: string;
}

export interface DonneesMonitoringAtelier {
  dateHeureCalcul: string;
  totalCommandesActives: number;
  totalPiecesEnFabrication: number;
  chargeTotaleHeures: number;
  dateLivraisonGlobaleJusquAu: string;
  dateMaximaleAtelier: Date;
  // Compteurs d'alertes délais atelier
  totalEnRetard: number;
  totalRetardCritiqueAVerifier: number; // >= 3 jours (à vérifier en atelier)
  commandesAVerifier: LigneCommandeMonitoring[];
  // Statistiques et suivi des OFs clôturés (conservé pour rétrocompatibilité interne)
  totalOFsClotures?: number;
  totalPiecesCloturees?: number;
  ofsClotures?: SuiviOF[];
  caissons: StatsFamilleMonitoring;
  tabliers: StatsFamilleMonitoring;
  precadres: StatsFamilleMonitoring;
  moustiquaires: StatsFamilleMonitoring;
  commandesActives: LigneCommandeMonitoring[];
  // Synthèse client demandée par l'utilisateur
  clientsMonitoring: ClientMonitoringGroup[];
  // Propositions automatiques d'heures supplémentaires pour absorber les retards ou commandes prioritaires
  propositionsHeuresSup?: PropositionHeuresSup[];
}

// ============================================================================
// SERVICE DE MONITORING ATELIER
// ============================================================================

export class MonitoringService {
  /**
   * Classifier un article caisson (25, 30, 40 ou autre)
   */
  static classifierCaisson(designation?: string, sfDesignation?: string, hauteurArt?: number): { cle: TailleCaissonCle; label: string } {
    const d = ((designation || '') + ' ' + (sfDesignation || '')).toUpperCase();

    // Hauteur article direct
    if (hauteurArt === 25 || hauteurArt === 250) return { cle: '25', label: 'Caisson 25 (250 mm)' };
    if (hauteurArt === 30 || hauteurArt === 300) return { cle: '30', label: 'Caisson 30 (300 mm)' };
    if (hauteurArt === 40 || hauteurArt === 400) return { cle: '40', label: 'Caisson 40 (400 mm)' };

    // Détection par nom / code
    if (/\b40\b|40\*|400\b/i.test(d) || d.includes('CT SOMO 40') || d.includes('SF SOMO 40') || d.includes('JOUE 40')) {
      return { cle: '40', label: 'Caisson 40 (400 mm)' };
    }
    if (/\b30\b|30\*|300\b/i.test(d) || d.includes('CT SOMO 30') || d.includes('SF SOMO 30') || d.includes('JOUE 30') || d.includes('KERNOU  30')) {
      return { cle: '30', label: 'Caisson 30 (300 mm)' };
    }
    if (/\b25\b|25\*|250\b/i.test(d) || d.includes('CT SOMO 25') || d.includes('SF SOMO 25') || d.includes('SOMOX  25') || d.includes('JOUE 25')) {
      return { cle: '25', label: 'Caisson 25 (250 mm)' };
    }
    if (/\b35\b|350\b/i.test(d) || d.includes('35')) {
      return { cle: 'AUTRE', label: 'Caisson 35 (350 mm)' };
    }

    return { cle: 'AUTRE', label: designation || 'Sous-face / Autre' };
  }

  /**
   * Classifier un tablier (43, 55 ou autre)
   */
  static classifierTablier(hauteurLame?: number, designation?: string): { cle: LameTablierCle; label: string } {
    if (hauteurLame === 43) return { cle: '43', label: 'Lame 43 mm' };
    if (hauteurLame === 55) return { cle: '55', label: 'Lame 55 mm' };

    const d = (designation || '').toUpperCase();
    if (/\b43\b/.test(d) || d.includes('43')) return { cle: '43', label: 'Lame 43 mm' };
    if (/\b55\b/.test(d) || d.includes('55')) return { cle: '55', label: 'Lame 55 mm' };

    if (hauteurLame && hauteurLame > 0) return { cle: 'AUTRE', label: `Lame ${hauteurLame} mm` };
    return { cle: 'AUTRE', label: designation || 'Lame Spéciale' };
  }

  /**
   * Classifier un précadre (Type 36, Type 50 ou autre)
   */
  static classifierPrecadre(
    designation?: string,
    articleCode?: string,
    typePrecadre?: string,
    hauteur?: number
  ): { cle: TypePrecadreCle; label: string; codeSousType: string } {
    const d = ((designation || '') + ' ' + (typePrecadre || '') + ' ' + (articleCode || '')).toUpperCase();

    if (typePrecadre === 'TYPE_36' || typePrecadre === '36' || hauteur === 36 || articleCode === 'ART0070' || articleCode === 'ART0072') {
      return { cle: '36', label: 'Précadre Type 36 (36 mm)', codeSousType: 'PRECADRE_36' };
    }
    if (typePrecadre === 'TYPE_50' || typePrecadre === '50' || hauteur === 50 || articleCode === 'ART0071' || articleCode === 'ART0073') {
      return { cle: '50', label: 'Précadre Type 50 (50 mm)', codeSousType: 'PRECADRE_50' };
    }

    if (/\b36\b|36\s*MM|TYPE\s*36|PRC\s*36|P36\b/i.test(d)) {
      return { cle: '36', label: 'Précadre Type 36 (36 mm)', codeSousType: 'PRECADRE_36' };
    }
    if (/\b50\b|50\s*MM|TYPE\s*50|PRC\s*50|P50\b/i.test(d)) {
      return { cle: '50', label: 'Précadre Type 50 (50 mm)', codeSousType: 'PRECADRE_50' };
    }
    if (/\b55\b|55\s*MM|PRC\s*55/i.test(d)) {
      return { cle: '50', label: 'Précadre Type 50 (50/55 mm)', codeSousType: 'PRECADRE_50' };
    }
    if (/\b43\b|43\s*MM|PRC\s*43/i.test(d)) {
      return { cle: '36', label: 'Précadre Type 36 (36/43 mm)', codeSousType: 'PRECADRE_36' };
    }

    // Par défaut, type 36 standard
    return { cle: '36', label: 'Précadre Type 36 (Standard)', codeSousType: 'PRECADRE_36' };
  }

  /**
   * Classifier une moustiquaire (Porte-fenêtre, Fenêtre, Double vantaux, Fixe, autre)
   */
  static classifierMoustiquaire(
    typeOuverture?: string,
    designation?: string,
    modele?: string
  ): { cle: TypeMoustiquaireCle; label: string; codeSousType: string } {
    const t = (typeOuverture || '').toUpperCase().trim();
    const d = ((designation || '') + ' ' + (modele || '')).toUpperCase();

    if (
      t === 'PORTE_FENETRE' ||
      t === 'PORTE' ||
      d.includes('PORTE-FENETRE') ||
      d.includes('PORTE FENETRE') ||
      d.includes('PORTE') ||
      d.includes('PF')
    ) {
      return { cle: 'PORTE_FENETRE', label: 'Porte-Fenêtre', codeSousType: 'MSTQ_PORTE_FENETRE' };
    }

    if (
      t === 'DOUBLE_VANTAUX' ||
      t === 'DOUBLE' ||
      t === 'VENTO' ||
      d.includes('DOUBLE') ||
      d.includes('VENTO') ||
      d.includes('2 VANTAUX') ||
      d.includes('2V')
    ) {
      return { cle: 'DOUBLE_VANTAUX', label: 'Double Vantaux', codeSousType: 'MSTQ_DOUBLE_VANTAUX' };
    }

    if (t === 'FIXE' || d.includes('FIXE') || d.includes('CADRE FIXE') || d.includes('FIX')) {
      return { cle: 'FIXE', label: 'Fixe', codeSousType: 'MSTQ_FIXE' };
    }

    if (
      t === 'FENETRE' ||
      d.includes('FENETRE') ||
      d.includes('FENÊTRE') ||
      d.includes('1 VANTAIL') ||
      d.includes('1V') ||
      t === 'STANDARD'
    ) {
      return { cle: 'FENETRE', label: 'Fenêtre (1 Vantail)', codeSousType: 'MSTQ_FENETRE' };
    }

    if (t === 'CENTRALE' || d.includes('CENTRALE')) {
      return { cle: 'AUTRE', label: 'Ouverture Centrale', codeSousType: 'MSTQ_AUTRE' };
    }

    return { cle: 'FENETRE', label: 'Fenêtre (Standard)', codeSousType: 'MSTQ_FENETRE' };
  }

  /**
   * Calcul complet de l'état de l'atelier en temps réel
   */
  static calculerMonitoring(
    dossiers: DossierCommandeGlobal[] = [],
    suivisOF: SuiviOF[] = [],
    articles: Article[] = [],
    paramsCustom?: ParametresProductionAtelier
  ): DonneesMonitoringAtelier {
    const params = paramsCustom || DelaisProductionService.getParametres();
    const dateRef = new Date();

    // Map d'articles par code pour lookup rapide
    const articleMap = new Map<string, Article>();
    articles.forEach(a => {
      if (a.code_art) articleMap.set(a.code_art.toUpperCase(), a);
    });

    // Filtre des dossiers actifs (non clôturés, non livrés, non terminés, non fabriqués)
    const dossiersActifs = dossiers.filter(d =>
      d && d.statut !== 'CLOTURE' && d.statut !== 'LIVRE' && d.statut !== 'TERMINE' && d.statut !== 'FABRIQUE'
    );

    // Filtre des OFs actifs (strictement émis non clôturés et non reçus)
    const ofsActifs = suivisOF.filter(o =>
      o && (o.statut === 'EMIS' || o.statut === 'EN_PAUSE')
    );

    // Helpers locaux pour correspondance stricte
    const normalizeRef = (r?: string): string => {
      if (!r) return '';
      return r.trim().toLowerCase().replace(/^(cmd|dossier|of)[-_ ]*/, '');
    };

    const doesOfMatchCommande = (
      of: SuiviOF,
      dossier: DossierCommandeGlobal,
      cmdRef: string,
      famille: FamilleProduit
    ): boolean => {
      const ofFam = ((of.famille as string) === 'SOUS_FACE' ? 'CAISSON' : of.famille) as FamilleProduit;
      if (ofFam !== famille) return false;

      const ofRef = normalizeRef(of.numCommande);
      const cmdRefNorm = normalizeRef(cmdRef);
      const ofCode = normalizeRef(of.codeOF);
      const ofId = normalizeRef(of.id);

      if (cmdRefNorm) {
        if (ofRef === cmdRefNorm || ofCode === cmdRefNorm || ofId === cmdRefNorm) return true;
        if (ofRef.length >= 3 && cmdRefNorm.length >= 3 && (ofRef.startsWith(cmdRefNorm) || cmdRefNorm.startsWith(ofRef))) {
          return true;
        }
      }

      if (of.dossierId && dossier.id && of.dossierId === dossier.id) {
        if (!ofRef || ofRef === cmdRefNorm || ofRef === normalizeRef(dossier.refCommande)) {
          return true;
        }
      }

      return false;
    };

    const doesOfMatchDossier = (of: SuiviOF, dossier: DossierCommandeGlobal, famille: FamilleProduit): boolean => {
      const ofFam = ((of.famille as string) === 'SOUS_FACE' ? 'CAISSON' : of.famille) as FamilleProduit;
      if (ofFam !== famille) return false;
      if (of.dossierId && dossier.id && of.dossierId === dossier.id) return true;

      const ofRef = normalizeRef(of.numCommande);
      const ofId = normalizeRef(of.id);
      const ofCode = normalizeRef(of.codeOF);

      const dRefs = [
        dossier.id,
        dossier.refCommande,
        dossier.numCommandeCaisson,
        dossier.numCommandeTablier,
        dossier.numCommandePrecadre,
        dossier.numCommandeMoustiquaire
      ].filter(Boolean).map(normalizeRef);

      return dRefs.some(d => Boolean(d && (d === ofRef || d === ofId || d === ofCode || (d.length >= 3 && ofRef.length >= 3 && (d.startsWith(ofRef) || ofRef.startsWith(d))))));
    };

    // ────────────────────────────────────────────────────────────────────────
    // 1. EXTRACTION ET VENTILATION DES CAISSONS (PAR COMMANDE RÉELLE)
    // ────────────────────────────────────────────────────────────────────────
    const lignesCommandesCaissons: LigneCommandeMonitoring[] = [];
    const caissonsCommandesSet = new Set<string>();

    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesCaissons || dossier.articlesCaissons.length === 0) return;

      // Regrouper les articles de caisson par référence de commande (refCommande)
      const mapCmds = new Map<string, typeof dossier.articlesCaissons>();

      dossier.articlesCaissons.forEach(c => {
        let ref = (c.refCommande || '').trim();
        if (!ref && c.isSousFaceSeule && c.sfRefCommande) {
          ref = c.sfRefCommande.trim();
        }
        if (!ref && dossier.numCommandeCaisson) {
          ref = dossier.numCommandeCaisson.trim();
        }
        if (!ref && c.isSousFaceSeule && dossier.numCommandeSousFace) {
          ref = dossier.numCommandeSousFace.trim();
        }
        if (!ref) {
          ref = (dossier.refCommande || dossier.id || 'CMD').trim();
        }

        const currentList = mapCmds.get(ref) || [];
        currentList.push(c);
        mapCmds.set(ref, currentList);
      });

      mapCmds.forEach((articlesCmd, cmdRef) => {
        const matchingOF = suivisOF.find(o => doesOfMatchCommande(o, dossier, cmdRef, 'CAISSON'));
        if (matchingOF && (matchingOF.statut === 'CLOTURE' || matchingOF.statut === 'LIVRE' || matchingOF.statut === 'RETOUR_EN_ATTENTE')) {
          return;
        }

        let totalPiecesCetteCommande = 0;
        const detailsDescriptions: string[] = [];
        const sousTypesSet = new Set<string>();
        const typesCountMap = new Map<string, { cle: string; label: string; nbPieces: number }>();

        articlesCmd.forEach(c => {
          // Si caisson avec sous-face : la sous-face est incluse dans le caisson (non doublée)
          // Si sous-face seule : comptabilisée comme unité caisson
          const qte = Math.max(1, Number(c.quantite) || 1);
          totalPiecesCetteCommande += qte;

          const art = c.articleCode ? articleMap.get(c.articleCode.toUpperCase()) : undefined;
          const classification = this.classifierCaisson(c.articleDesignation, c.sfArticleDesignation, art?.hauteur);
          const stKey = classification.cle === '25' ? 'CAISSON_25' : classification.cle === '30' ? 'CAISSON_30' : classification.cle === '40' ? 'CAISSON_40' : 'CAISSON_AUTRE';

          const existingSt = typesCountMap.get(stKey) || { cle: stKey, label: classification.label, nbPieces: 0 };
          existingSt.nbPieces += qte;
          typesCountMap.set(stKey, existingSt);

          sousTypesSet.add(stKey);

          const nomProd = c.isSousFaceSeule
            ? (c.sfArticleDesignation || `Sous-face ${classification.cle}`)
            : (c.articleDesignation || `Caisson ${classification.cle}`);
          detailsDescriptions.push(`${qte}x ${nomProd} (${c.longueur || 0}mm)`);
        });

        if (totalPiecesCetteCommande <= 0 && matchingOF) {
          totalPiecesCetteCommande = DelaisProductionService.compterPiecesOF(matchingOF, dossiers);
        }
        if (totalPiecesCetteCommande <= 0) return;

        caissonsCommandesSet.add(cmdRef);

        const sousTypesList = Array.from(sousTypesSet);
        const detailsSousTypes = Array.from(typesCountMap.values());

        let sousTypePrecision = '';
        if (detailsSousTypes.length === 1) {
          sousTypePrecision = detailsSousTypes[0].label;
        } else {
          sousTypePrecision = detailsSousTypes.map(d => `${d.label.replace('Caisson ', 'C')}: ${d.nbPieces} pcs`).join(', ');
        }

        const primaryKey = sousTypesList.includes('CAISSON_30')
          ? 'CAISSON_30'
          : sousTypesList.includes('CAISSON_25')
          ? 'CAISSON_25'
          : sousTypesList.includes('CAISSON_40')
          ? 'CAISSON_40'
          : (sousTypesList[0] || 'CAISSON_AUTRE');

        const estEnPause = Boolean(dossier.estEnPause || dossier.statut === 'EN_PAUSE' || matchingOF?.estEnPause || matchingOF?.statut === 'EN_PAUSE');
        const estPrioritaire = Boolean(dossier.estPrioritaire || matchingOF?.estPrioritaire);
        const repriseTimestamp = (dossier as any).repriseTimestamp || (matchingOF as any)?.repriseTimestamp;

        lignesCommandesCaissons.push({
          id: `CMD-CAISS-${dossier.id}-${cmdRef}`,
          dossierId: dossier.id,
          refCommande: cmdRef,
          client: dossier.nomClientFinal || matchingOF?.nomClient || 'Client Particulier',
          donneurOrdre: dossier.donneurOrdre || matchingOF?.donneurOrdre || 'Atelier',
          dateCommande: dossier.dateCommande || matchingOF?.dateEmission || new Date().toLocaleDateString('fr-FR'),
          dateEmission: matchingOF?.dateEmission || dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
          famille: 'CAISSON',
          estPrioritaire,
          estEnPause,
          motifPause: matchingOF?.motifPause || dossier.motifPause,
          repriseTimestamp,
          statutAtelier: estEnPause
            ? 'EN_PAUSE'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS')
            : 'EN_ATTENTE_COUPE',
          statutBadgeLabel: estEnPause
            ? 'En Pause'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)')
            : 'En Attente Découpe',
          typePrecision: sousTypePrecision || 'Caisson',
          sousTypeCle: primaryKey,
          sousTypesCles: sousTypesList.length > 0 ? sousTypesList : [primaryKey],
          detailsSousTypes,
          detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCetteCommande} caissons`,
          quantiteTotalPieces: totalPiecesCetteCommande,
          dateLivraisonPrevisionnelle: dossier.dateLivraisonPrevisionnelle || '',
          dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO,
          ofCode: matchingOF?.codeOF,
          ofStatut: matchingOF?.statut,
          alerteDelai: {
            statutDelai: 'DANS_LES_TEMPS',
            joursDeRetard: 0,
            estDepasse: false,
            estRetardCritique: false,
            texteAlerte: 'Dans les temps',
            badgeLabel: '✓ Dans les délais',
            badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
            ligneClasses: '',
            flagEmoji: '✓'
          }
        });
      });
    });

    // Rapprochement des OFs Caissons actifs (sans doubler les dossiers déjà inclus)
    ofsActifs.forEach(of => {
      if (of.famille !== 'CAISSON' && (of.famille as string) !== 'SOUS_FACE') return;

      const matchedLine = lignesCommandesCaissons.find(l => {
        if (l.dossierId && of.dossierId && l.dossierId === of.dossierId) return true;
        const r1 = normalizeRef(l.refCommande);
        const r2 = normalizeRef(of.numCommande);
        return Boolean(r1 && r2 && (r1 === r2 || (r1.length >= 3 && r2.length >= 3 && (r1.startsWith(r2) || r2.startsWith(r1)))));
      });

      if (matchedLine) {
        if (!matchedLine.ofCode && of.codeOF) matchedLine.ofCode = of.codeOF;
        if (!matchedLine.ofStatut && of.statut) matchedLine.ofStatut = of.statut;
        if (of.estEnPause) {
          matchedLine.estEnPause = true;
          matchedLine.statutAtelier = 'EN_PAUSE';
          matchedLine.statutBadgeLabel = 'En Pause';
          matchedLine.motifPause = of.motifPause;
        }
        if (of.estPrioritaire) matchedLine.estPrioritaire = true;
        return;
      }

      const nbP = DelaisProductionService.compterPiecesOF(of, dossiers);
      if (nbP <= 0) return;
      const ref = of.numCommande || of.id;
      caissonsCommandesSet.add(ref);

      const classification = this.classifierCaisson(of.titreSection);
      const stCle = classification.cle === '30' ? 'CAISSON_30' : classification.cle === '25' ? 'CAISSON_25' : classification.cle === '40' ? 'CAISSON_40' : 'CAISSON_AUTRE';
      const estEnPause = Boolean(of.estEnPause);

      lignesCommandesCaissons.push({
        id: `OF-CAISS-${of.id}`,
        dossierId: of.dossierId,
        refCommande: of.numCommande || of.id,
        client: of.nomClient || 'Client',
        donneurOrdre: of.donneurOrdre || 'Atelier',
        dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        dateEmission: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        famille: 'CAISSON',
        estPrioritaire: Boolean(of.estPrioritaire),
        estEnPause,
        motifPause: of.motifPause,
        repriseTimestamp: (of as any).repriseTimestamp,
        statutAtelier: estEnPause ? 'EN_PAUSE' : of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
        statutBadgeLabel: estEnPause ? 'En Pause' : of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)',
        typePrecision: classification.label,
        sousTypeCle: stCle,
        sousTypesCles: [stCle],
        detailsSousTypes: [{ cle: stCle, label: classification.label, nbPieces: nbP }],
        detailArticles: `${nbP}x ${of.titreSection || 'Caissons'}`,
        quantiteTotalPieces: nbP,
        dateLivraisonPrevisionnelle: of.dateLivraisonPrevisionnelle || '',
        dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO,
        ofCode: of.codeOF,
        ofStatut: of.statut,
        alerteDelai: {
          statutDelai: 'DANS_LES_TEMPS',
          joursDeRetard: 0,
          estDepasse: false,
          estRetardCritique: false,
          texteAlerte: 'Dans les temps',
          badgeLabel: '✓ Dans les délais',
          badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
          ligneClasses: '',
          flagEmoji: '✓'
        }
      });
    });

    // Simulation de planning pour les caissons
    const simCaissonItems: PlanningItemSimulation[] = lignesCommandesCaissons.map(l => ({
      id: l.id,
      refCommande: l.refCommande,
      nomClient: l.client,
      nbPieces: l.quantiteTotalPieces,
      estPrioritaire: l.estPrioritaire,
      estEnPause: l.estEnPause,
      motifPause: l.motifPause,
      dateEmission: l.dateEmission || l.dateCommande,
      dateLivraisonPrevisionnelle: l.dateLivraisonPrevisionnelle,
      dateLivraisonISO: l.dateLivraisonPrevisionnelleISO,
      dossierId: l.dossierId,
      repriseTimestamp: l.repriseTimestamp
    }));
    const simResCaissons = DelaisProductionService.simulerPlanningFamille('CAISSON', simCaissonItems, params);

    // Synchronisation des délais simulés
    lignesCommandesCaissons.forEach(l => {
      const planItem = simResCaissons.commandesPlanifiees.find(p => p.id === l.id) || simResCaissons.commandesEnPause.find(p => p.id === l.id);
      if (planItem) {
        l.dateLivraisonPrevisionnelle = planItem.texteLivraison;
        l.dateLivraisonPrevisionnelleISO = planItem.dateLivraisonISO;
      }
      l.alerteDelai = DelaisProductionService.evaluerStatutDelai(
        l.dateLivraisonPrevisionnelle,
        l.dateLivraisonPrevisionnelleISO,
        l.dateEmission || l.dateCommande,
        l.ofStatut
      );
    });

    // Ventilation des sous-types Caissons calculée sur les lignes réelles
    let piecesCaissonsTotal = 0;
    let piecesCaissons25 = 0;
    let piecesCaissons30 = 0;
    let piecesCaissons40 = 0;
    let piecesCaissonsAutres = 0;
    const caissons25Set = new Set<string>();
    const caissons30Set = new Set<string>();
    const caissons40Set = new Set<string>();
    const caissonsAutreSet = new Set<string>();

    lignesCommandesCaissons.forEach(l => {
      piecesCaissonsTotal += l.quantiteTotalPieces;
      if (l.detailsSousTypes && l.detailsSousTypes.length > 0) {
        l.detailsSousTypes.forEach(dst => {
          if (dst.cle === 'CAISSON_25') { piecesCaissons25 += dst.nbPieces; caissons25Set.add(l.refCommande); }
          else if (dst.cle === 'CAISSON_30') { piecesCaissons30 += dst.nbPieces; caissons30Set.add(l.refCommande); }
          else if (dst.cle === 'CAISSON_40') { piecesCaissons40 += dst.nbPieces; caissons40Set.add(l.refCommande); }
          else { piecesCaissonsAutres += dst.nbPieces; caissonsAutreSet.add(l.refCommande); }
        });
      } else {
        if (l.sousTypeCle === 'CAISSON_25') { piecesCaissons25 += l.quantiteTotalPieces; caissons25Set.add(l.refCommande); }
        else if (l.sousTypeCle === 'CAISSON_30') { piecesCaissons30 += l.quantiteTotalPieces; caissons30Set.add(l.refCommande); }
        else if (l.sousTypeCle === 'CAISSON_40') { piecesCaissons40 += l.quantiteTotalPieces; caissons40Set.add(l.refCommande); }
        else { piecesCaissonsAutres += l.quantiteTotalPieces; caissonsAutreSet.add(l.refCommande); }
      }
    });

    const configCaisson = params.familles.CAISSON;
    const statsCaissons: StatsFamilleMonitoring = {
      famille: 'CAISSON',
      label: 'Caissons & Sous-Faces',
      nbCommandesEnCours: caissonsCommandesSet.size,
      totalPiecesEnCours: piecesCaissonsTotal,
      detailsCaissons: {
        c25: {
          cle: '25',
          label: 'Caisson 25 (250 mm)',
          nbCommandes: caissons25Set.size,
          totalPieces: piecesCaissons25,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissons25 / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissons25Set)
        },
        c30: {
          cle: '30',
          label: 'Caisson 30 (300 mm)',
          nbCommandes: caissons30Set.size,
          totalPieces: piecesCaissons30,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissons30 / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissons30Set)
        },
        c40: {
          cle: '40',
          label: 'Caisson 40 (400 mm)',
          nbCommandes: caissons40Set.size,
          totalPieces: piecesCaissons40,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissons40 / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissons40Set)
        },
        autres: {
          cle: 'AUTRE',
          label: 'Sous-Faces & Autres',
          nbCommandes: caissonsAutreSet.size,
          totalPieces: piecesCaissonsAutres,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissonsAutres / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissonsAutreSet)
        }
      },
      capaciteJournaliere: configCaisson.capaciteJournalierePieces || 120,
      tempsUnitaireMin: configCaisson.tempsUnitaireMinutes || 5,
      chargeHeuresEstimee: simResCaissons.chargeHeuresTotale,
      joursOuvresRequis: simResCaissons.chargeJoursTotal,
      dateLivraisonJusquAu: simResCaissons.dateFinGlobaleFormattee,
      dateFinDate: simResCaissons.dateFinGlobale,
      tauxOccupationJour: Math.min(100, Math.round((piecesCaissonsTotal / (configCaisson.capaciteJournalierePieces || 120)) * 100)),
      propositionHeuresSup: simResCaissons.propositionHeuresSup
    };

    // ────────────────────────────────────────────────────────────────────────
    // 2. EXTRACTION ET VENTILATION DES TABLIERS (PAR COMMANDE RÉELLE)
    // ────────────────────────────────────────────────────────────────────────
    const lignesCommandesTabliers: LigneCommandeMonitoring[] = [];
    const tabliersCommandesSet = new Set<string>();

    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesTabliers || dossier.articlesTabliers.length === 0) return;

      const mapCmds = new Map<string, typeof dossier.articlesTabliers>();

      dossier.articlesTabliers.forEach(t => {
        let ref = (t.refCommande || '').trim();
        if (!ref && dossier.numCommandeTablier) {
          ref = dossier.numCommandeTablier.trim();
        }
        if (!ref) {
          ref = (dossier.refCommande || dossier.id || 'CMD').trim();
        }

        const currentList = mapCmds.get(ref) || [];
        currentList.push(t);
        mapCmds.set(ref, currentList);
      });

      mapCmds.forEach((articlesCmd, cmdRef) => {
        const matchingOF = suivisOF.find(o => doesOfMatchCommande(o, dossier, cmdRef, 'TABLIER'));
        if (matchingOF && (matchingOF.statut === 'CLOTURE' || matchingOF.statut === 'LIVRE' || matchingOF.statut === 'RETOUR_EN_ATTENTE')) {
          return;
        }

        let totalPiecesCetteCommande = 0;
        const detailsDescriptions: string[] = [];
        const sousTypesSet = new Set<string>();
        const typesCountMap = new Map<string, { cle: string; label: string; nbPieces: number }>();

        articlesCmd.forEach(t => {
          const qte = Math.max(1, Number(t.quantite) || 1);
          totalPiecesCetteCommande += qte;

          const classification = this.classifierTablier(t.hauteur_lame_tablier, t.articleDesignation);
          const stKey = classification.cle === '43' ? 'TABLIER_43' : classification.cle === '55' ? 'TABLIER_55' : 'TABLIER_AUTRE';

          const existingSt = typesCountMap.get(stKey) || { cle: stKey, label: classification.label, nbPieces: 0 };
          existingSt.nbPieces += qte;
          typesCountMap.set(stKey, existingSt);

          sousTypesSet.add(stKey);

          const nomProd = t.articleDesignation || `Tablier Lame ${t.hauteur_lame_tablier || 43}mm`;
          detailsDescriptions.push(`${qte}x ${nomProd} (${t.largeur || 0}x${t.hauteur || 0}mm)`);
        });

        if (totalPiecesCetteCommande <= 0 && matchingOF) {
          totalPiecesCetteCommande = DelaisProductionService.compterPiecesOF(matchingOF, dossiers);
        }
        if (totalPiecesCetteCommande <= 0) return;

        tabliersCommandesSet.add(cmdRef);

        const sousTypesList = Array.from(sousTypesSet);
        const detailsSousTypes = Array.from(typesCountMap.values());

        let sousTypePrecision = '';
        if (detailsSousTypes.length === 1) {
          sousTypePrecision = detailsSousTypes[0].label;
        } else {
          sousTypePrecision = detailsSousTypes.map(d => `${d.label.replace('Lame ', 'L')}: ${d.nbPieces} pcs`).join(', ');
        }

        const primaryKey = sousTypesList.includes('TABLIER_55')
          ? 'TABLIER_55'
          : sousTypesList.includes('TABLIER_43')
          ? 'TABLIER_43'
          : (sousTypesList[0] || 'TABLIER_AUTRE');

        const estEnPause = Boolean(dossier.estEnPause || dossier.statut === 'EN_PAUSE' || matchingOF?.estEnPause || matchingOF?.statut === 'EN_PAUSE');
        const estPrioritaire = Boolean(dossier.estPrioritaire || matchingOF?.estPrioritaire);
        const repriseTimestamp = (dossier as any).repriseTimestamp || (matchingOF as any)?.repriseTimestamp;

        lignesCommandesTabliers.push({
          id: `CMD-TABL-${dossier.id}-${cmdRef}`,
          dossierId: dossier.id,
          refCommande: cmdRef,
          client: dossier.nomClientFinal || matchingOF?.nomClient || 'Client Particulier',
          donneurOrdre: dossier.donneurOrdre || matchingOF?.donneurOrdre || 'Atelier',
          dateCommande: dossier.dateCommande || matchingOF?.dateEmission || new Date().toLocaleDateString('fr-FR'),
          dateEmission: matchingOF?.dateEmission || dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
          famille: 'TABLIER',
          estPrioritaire,
          estEnPause,
          motifPause: matchingOF?.motifPause || dossier.motifPause,
          repriseTimestamp,
          statutAtelier: estEnPause
            ? 'EN_PAUSE'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS')
            : 'EN_ATTENTE_COUPE',
          statutBadgeLabel: estEnPause
            ? 'En Pause'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Assemblage)')
            : 'En Attente Découpe',
          typePrecision: sousTypePrecision || 'Tablier',
          sousTypeCle: primaryKey,
          sousTypesCles: sousTypesList.length > 0 ? sousTypesList : [primaryKey],
          detailsSousTypes,
          detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCetteCommande} tabliers`,
          quantiteTotalPieces: totalPiecesCetteCommande,
          dateLivraisonPrevisionnelle: dossier.dateLivraisonPrevisionnelle || '',
          dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO,
          ofCode: matchingOF?.codeOF,
          ofStatut: matchingOF?.statut,
          alerteDelai: {
            statutDelai: 'DANS_LES_TEMPS',
            joursDeRetard: 0,
            estDepasse: false,
            estRetardCritique: false,
            texteAlerte: 'Dans les temps',
            badgeLabel: '✓ Dans les délais',
            badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
            ligneClasses: '',
            flagEmoji: '✓'
          }
        });
      });
    });

    // Rapprochement des OFs Tabliers actifs
    ofsActifs.forEach(of => {
      if (of.famille !== 'TABLIER') return;

      const matchedLine = lignesCommandesTabliers.find(l => {
        if (l.dossierId && of.dossierId && l.dossierId === of.dossierId) return true;
        const r1 = normalizeRef(l.refCommande);
        const r2 = normalizeRef(of.numCommande);
        return Boolean(r1 && r2 && (r1 === r2 || (r1.length >= 3 && r2.length >= 3 && (r1.startsWith(r2) || r2.startsWith(r1)))));
      });

      if (matchedLine) {
        if (!matchedLine.ofCode && of.codeOF) matchedLine.ofCode = of.codeOF;
        if (!matchedLine.ofStatut && of.statut) matchedLine.ofStatut = of.statut;
        if (of.estEnPause) {
          matchedLine.estEnPause = true;
          matchedLine.statutAtelier = 'EN_PAUSE';
          matchedLine.statutBadgeLabel = 'En Pause';
          matchedLine.motifPause = of.motifPause;
        }
        if (of.estPrioritaire) matchedLine.estPrioritaire = true;
        return;
      }

      const nbP = DelaisProductionService.compterPiecesOF(of, dossiers);
      if (nbP <= 0) return;
      const ref = of.numCommande || of.id;
      tabliersCommandesSet.add(ref);

      const classification = this.classifierTablier(undefined, of.titreSection);
      const stCle = classification.cle === '55' ? 'TABLIER_55' : classification.cle === '43' ? 'TABLIER_43' : 'TABLIER_AUTRE';
      const estEnPause = Boolean(of.estEnPause);

      lignesCommandesTabliers.push({
        id: `OF-TABL-${of.id}`,
        dossierId: of.dossierId,
        refCommande: of.numCommande || of.id,
        client: of.nomClient || 'Client',
        donneurOrdre: of.donneurOrdre || 'Atelier',
        dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        dateEmission: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        famille: 'TABLIER',
        estPrioritaire: Boolean(of.estPrioritaire),
        estEnPause,
        motifPause: of.motifPause,
        statutAtelier: estEnPause ? 'EN_PAUSE' : of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
        statutBadgeLabel: estEnPause ? 'En Pause' : of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Assemblage)',
        typePrecision: classification.label,
        sousTypeCle: stCle,
        sousTypesCles: [stCle],
        detailsSousTypes: [{ cle: stCle, label: classification.label, nbPieces: nbP }],
        detailArticles: `${nbP}x ${of.titreSection || 'Tabliers'}`,
        quantiteTotalPieces: nbP,
        dateLivraisonPrevisionnelle: of.dateLivraisonPrevisionnelle || '',
        dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO,
        ofCode: of.codeOF,
        ofStatut: of.statut,
        alerteDelai: {
          statutDelai: 'DANS_LES_TEMPS',
          joursDeRetard: 0,
          estDepasse: false,
          estRetardCritique: false,
          texteAlerte: 'Dans les temps',
          badgeLabel: '✓ Dans les délais',
          badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
          ligneClasses: '',
          flagEmoji: '✓'
        }
      });
    });

    // Simulation de planning pour les tabliers (Équipe indépendante)
    const simTablierItems: PlanningItemSimulation[] = lignesCommandesTabliers.map(l => ({
      id: l.id,
      refCommande: l.refCommande,
      nomClient: l.client,
      nbPieces: l.quantiteTotalPieces,
      estPrioritaire: l.estPrioritaire,
      estEnPause: l.estEnPause,
      motifPause: l.motifPause,
      dateEmission: l.dateEmission || l.dateCommande,
      dateLivraisonPrevisionnelle: l.dateLivraisonPrevisionnelle,
      dateLivraisonISO: l.dateLivraisonPrevisionnelleISO,
      dossierId: l.dossierId,
      repriseTimestamp: l.repriseTimestamp
    }));
    const simResTabliers = DelaisProductionService.simulerPlanningFamille('TABLIER', simTablierItems, params);

    lignesCommandesTabliers.forEach(l => {
      const planItem = simResTabliers.commandesPlanifiees.find(p => p.id === l.id) || simResTabliers.commandesEnPause.find(p => p.id === l.id);
      if (planItem) {
        l.dateLivraisonPrevisionnelle = planItem.texteLivraison;
        l.dateLivraisonPrevisionnelleISO = planItem.dateLivraisonISO;
      }
      l.alerteDelai = DelaisProductionService.evaluerStatutDelai(
        l.dateLivraisonPrevisionnelle,
        l.dateLivraisonPrevisionnelleISO,
        l.dateEmission || l.dateCommande,
        l.ofStatut
      );
    });

    let piecesTabliersTotal = 0;
    let piecesTabliers43 = 0;
    let piecesTabliers55 = 0;
    let piecesTabliersAutres = 0;
    const tabliers43Set = new Set<string>();
    const tabliers55Set = new Set<string>();
    const tabliersAutreSet = new Set<string>();

    lignesCommandesTabliers.forEach(l => {
      piecesTabliersTotal += l.quantiteTotalPieces;
      if (l.detailsSousTypes && l.detailsSousTypes.length > 0) {
        l.detailsSousTypes.forEach(dst => {
          if (dst.cle === 'TABLIER_43') { piecesTabliers43 += dst.nbPieces; tabliers43Set.add(l.refCommande); }
          else if (dst.cle === 'TABLIER_55') { piecesTabliers55 += dst.nbPieces; tabliers55Set.add(l.refCommande); }
          else { piecesTabliersAutres += dst.nbPieces; tabliersAutreSet.add(l.refCommande); }
        });
      } else {
        if (l.sousTypeCle === 'TABLIER_43') { piecesTabliers43 += l.quantiteTotalPieces; tabliers43Set.add(l.refCommande); }
        else if (l.sousTypeCle === 'TABLIER_55') { piecesTabliers55 += l.quantiteTotalPieces; tabliers55Set.add(l.refCommande); }
        else { piecesTabliersAutres += l.quantiteTotalPieces; tabliersAutreSet.add(l.refCommande); }
      }
    });

    const configTablier = params.familles.TABLIER;
    const statsTabliers: StatsFamilleMonitoring = {
      famille: 'TABLIER',
      label: 'Tabliers Volets Roulants',
      nbCommandesEnCours: tabliersCommandesSet.size,
      totalPiecesEnCours: piecesTabliersTotal,
      detailsTabliers: {
        l43: {
          cle: '43',
          label: 'Lame 43 mm (ALU / PVC)',
          nbCommandes: tabliers43Set.size,
          totalPieces: piecesTabliers43,
          pourcentage: piecesTabliersTotal > 0 ? Math.round((piecesTabliers43 / piecesTabliersTotal) * 100) : 0,
          commandesRefs: Array.from(tabliers43Set)
        },
        l55: {
          cle: '55',
          label: 'Lame 55 mm (ALU / PVC)',
          nbCommandes: tabliers55Set.size,
          totalPieces: piecesTabliers55,
          pourcentage: piecesTabliersTotal > 0 ? Math.round((piecesTabliers55 / piecesTabliersTotal) * 100) : 0,
          commandesRefs: Array.from(tabliers55Set)
        },
        autres: {
          cle: 'AUTRE',
          label: 'Autres Lames (39, 77...)',
          nbCommandes: tabliersAutreSet.size,
          totalPieces: piecesTabliersAutres,
          pourcentage: piecesTabliersTotal > 0 ? Math.round((piecesTabliersAutres / piecesTabliersTotal) * 100) : 0,
          commandesRefs: Array.from(tabliersAutreSet)
        }
      },
      capaciteJournaliere: configTablier.capaciteJournalierePieces || 80,
      tempsUnitaireMin: configTablier.tempsUnitaireMinutes || 8,
      chargeHeuresEstimee: simResTabliers.chargeHeuresTotale,
      joursOuvresRequis: simResTabliers.chargeJoursTotal,
      dateLivraisonJusquAu: simResTabliers.dateFinGlobaleFormattee,
      dateFinDate: simResTabliers.dateFinGlobale,
      tauxOccupationJour: Math.min(100, Math.round((piecesTabliersTotal / (configTablier.capaciteJournalierePieces || 80)) * 100)),
      propositionHeuresSup: simResTabliers.propositionHeuresSup
    };

    // ────────────────────────────────────────────────────────────────────────
    // 3. PRÉCADRES (VENTILATION DÉTAILLÉE PAR TYPES ET COMMANDE RÉELLE)
    // ────────────────────────────────────────────────────────────────────────
    const precadresCommandesSet = new Set<string>();
    const lignesCommandesPrecadres: LigneCommandeMonitoring[] = [];

    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesPrecadres || dossier.articlesPrecadres.length === 0) return;

      const mapCmds = new Map<string, typeof dossier.articlesPrecadres>();

      dossier.articlesPrecadres.forEach(p => {
        let ref = (p.refCommande || '').trim();
        if (!ref && dossier.numCommandePrecadre) {
          ref = dossier.numCommandePrecadre.trim();
        }
        if (!ref) {
          ref = (dossier.refCommande || dossier.id || 'CMD').trim();
        }

        const currentList = mapCmds.get(ref) || [];
        currentList.push(p);
        mapCmds.set(ref, currentList);
      });

      mapCmds.forEach((articlesCmd, cmdRef) => {
        const matchingOF = suivisOF.find(o => doesOfMatchCommande(o, dossier, cmdRef, 'PRECADRE'));
        if (matchingOF && (matchingOF.statut === 'CLOTURE' || matchingOF.statut === 'LIVRE' || matchingOF.statut === 'RETOUR_EN_ATTENTE')) {
          return;
        }

        let totalPiecesCetteCommande = 0;
        const detailsDescriptions: string[] = [];
        const sousTypesSet = new Set<string>();
        const typesCountMap = new Map<string, { cle: string; label: string; nbPieces: number }>();

        articlesCmd.forEach(p => {
          const q = Math.max(1, Number(p.quantite) || 1);
          totalPiecesCetteCommande += q;

          const classification = this.classifierPrecadre(
            p.articleDesignation,
            p.articleCode,
            p.typePrecadre,
            p.hauteur
          );

          const existingSt = typesCountMap.get(classification.codeSousType) || { cle: classification.codeSousType, label: classification.label, nbPieces: 0 };
          existingSt.nbPieces += q;
          typesCountMap.set(classification.codeSousType, existingSt);

          sousTypesSet.add(classification.codeSousType);

          const nomProd = p.articleDesignation || `Précadre ${classification.cle}mm`;
          detailsDescriptions.push(`${q}x ${nomProd} (${p.largeur || 0}x${p.hauteur || 0}mm)`);
        });

        if (totalPiecesCetteCommande <= 0 && matchingOF) {
          totalPiecesCetteCommande = DelaisProductionService.compterPiecesOF(matchingOF, dossiers);
        }
        if (totalPiecesCetteCommande <= 0) return;

        precadresCommandesSet.add(cmdRef);

        const sousTypesList = Array.from(sousTypesSet);
        const detailsSousTypes = Array.from(typesCountMap.values());

        let sousTypePrecision = '';
        if (detailsSousTypes.length === 1) {
          sousTypePrecision = detailsSousTypes[0].label;
        } else {
          sousTypePrecision = detailsSousTypes.map(d => `${d.label}: ${d.nbPieces} pcs`).join(', ');
        }

        const primaryKey = sousTypesList[0] || 'PRECADRE_36';

        const estEnPause = Boolean(dossier.estEnPause || dossier.statut === 'EN_PAUSE' || matchingOF?.estEnPause || matchingOF?.statut === 'EN_PAUSE');
        const estPrioritaire = Boolean(dossier.estPrioritaire || matchingOF?.estPrioritaire);
        const repriseTimestamp = (dossier as any).repriseTimestamp || (matchingOF as any)?.repriseTimestamp;

        lignesCommandesPrecadres.push({
          id: `CMD-PREC-${dossier.id}-${cmdRef}`,
          dossierId: dossier.id,
          refCommande: cmdRef,
          client: dossier.nomClientFinal || matchingOF?.nomClient || 'Client Particulier',
          donneurOrdre: dossier.donneurOrdre || matchingOF?.donneurOrdre || 'Atelier',
          dateCommande: dossier.dateCommande || matchingOF?.dateEmission || new Date().toLocaleDateString('fr-FR'),
          dateEmission: matchingOF?.dateEmission || dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
          famille: 'PRECADRE',
          estPrioritaire,
          estEnPause,
          motifPause: matchingOF?.motifPause || dossier.motifPause,
          repriseTimestamp,
          statutAtelier: estEnPause
            ? 'EN_PAUSE'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS')
            : 'EN_ATTENTE_COUPE',
          statutBadgeLabel: estEnPause
            ? 'En Pause'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)')
            : 'En Attente Découpe',
          typePrecision: sousTypePrecision || 'Précadre',
          sousTypeCle: primaryKey,
          sousTypesCles: sousTypesList.length > 0 ? sousTypesList : [primaryKey],
          detailsSousTypes,
          detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCetteCommande} précadres`,
          quantiteTotalPieces: totalPiecesCetteCommande,
          dateLivraisonPrevisionnelle: dossier.dateLivraisonPrevisionnelle || '',
          dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO,
          ofCode: matchingOF?.codeOF,
          ofStatut: matchingOF?.statut,
          alerteDelai: {
            statutDelai: 'DANS_LES_TEMPS',
            joursDeRetard: 0,
            estDepasse: false,
            estRetardCritique: false,
            texteAlerte: 'Dans les temps',
            badgeLabel: '✓ Dans les délais',
            badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
            ligneClasses: '',
            flagEmoji: '✓'
          }
        });
      });
    });

    // Rapprochement des OFs Précadres actifs
    ofsActifs.forEach(of => {
      if (of.famille !== 'PRECADRE') return;

      const matchedLine = lignesCommandesPrecadres.find(l => {
        if (l.dossierId && of.dossierId && l.dossierId === of.dossierId) return true;
        const r1 = normalizeRef(l.refCommande);
        const r2 = normalizeRef(of.numCommande);
        return Boolean(r1 && r2 && (r1 === r2 || (r1.length >= 3 && r2.length >= 3 && (r1.startsWith(r2) || r2.startsWith(r1)))));
      });

      if (matchedLine) {
        if (!matchedLine.ofCode && of.codeOF) matchedLine.ofCode = of.codeOF;
        if (!matchedLine.ofStatut && of.statut) matchedLine.ofStatut = of.statut;
        if (of.estEnPause) {
          matchedLine.estEnPause = true;
          matchedLine.statutAtelier = 'EN_PAUSE';
          matchedLine.statutBadgeLabel = 'En Pause';
          matchedLine.motifPause = of.motifPause;
        }
        if (of.estPrioritaire) matchedLine.estPrioritaire = true;
        return;
      }

      const nbP = DelaisProductionService.compterPiecesOF(of, dossiers);
      if (nbP <= 0) return;
      const ref = of.numCommande || of.id;
      precadresCommandesSet.add(ref);

      const classification = this.classifierPrecadre(of.titreSection);
      const estEnPause = Boolean(of.estEnPause);

      lignesCommandesPrecadres.push({
        id: `OF-PREC-${of.id}`,
        dossierId: of.dossierId,
        refCommande: of.numCommande || of.id,
        client: of.nomClient || 'Client',
        donneurOrdre: of.donneurOrdre || 'Atelier',
        dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        dateEmission: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        famille: 'PRECADRE',
        estPrioritaire: Boolean(of.estPrioritaire),
        estEnPause,
        motifPause: of.motifPause,
        statutAtelier: estEnPause ? 'EN_PAUSE' : of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
        statutBadgeLabel: estEnPause ? 'En Pause' : of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)',
        typePrecision: classification.label,
        sousTypeCle: classification.codeSousType,
        sousTypesCles: [classification.codeSousType],
        detailsSousTypes: [{ cle: classification.codeSousType, label: classification.label, nbPieces: nbP }],
        detailArticles: `${nbP}x ${of.titreSection || 'Précadres'}`,
        quantiteTotalPieces: nbP,
        dateLivraisonPrevisionnelle: of.dateLivraisonPrevisionnelle || '',
        dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO,
        ofCode: of.codeOF,
        ofStatut: of.statut,
        alerteDelai: {
          statutDelai: 'DANS_LES_TEMPS',
          joursDeRetard: 0,
          estDepasse: false,
          estRetardCritique: false,
          texteAlerte: 'Dans les temps',
          badgeLabel: '✓ Dans les délais',
          badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
          ligneClasses: '',
          flagEmoji: '✓'
        }
      });
    });

    // Simulation de planning pour les précadres (Équipe indépendante)
    const simPrecadreItems: PlanningItemSimulation[] = lignesCommandesPrecadres.map(l => ({
      id: l.id,
      refCommande: l.refCommande,
      nomClient: l.client,
      nbPieces: l.quantiteTotalPieces,
      estPrioritaire: l.estPrioritaire,
      estEnPause: l.estEnPause,
      motifPause: l.motifPause,
      dateEmission: l.dateEmission || l.dateCommande,
      dateLivraisonPrevisionnelle: l.dateLivraisonPrevisionnelle,
      dateLivraisonISO: l.dateLivraisonPrevisionnelleISO,
      dossierId: l.dossierId,
      repriseTimestamp: l.repriseTimestamp
    }));
    const simResPrecadres = DelaisProductionService.simulerPlanningFamille('PRECADRE', simPrecadreItems, params);

    lignesCommandesPrecadres.forEach(l => {
      const planItem = simResPrecadres.commandesPlanifiees.find(p => p.id === l.id) || simResPrecadres.commandesEnPause.find(p => p.id === l.id);
      if (planItem) {
        l.dateLivraisonPrevisionnelle = planItem.texteLivraison;
        l.dateLivraisonPrevisionnelleISO = planItem.dateLivraisonISO;
      }
      l.alerteDelai = DelaisProductionService.evaluerStatutDelai(
        l.dateLivraisonPrevisionnelle,
        l.dateLivraisonPrevisionnelleISO,
        l.dateEmission || l.dateCommande,
        l.ofStatut
      );
    });

    let piecesPrecadresTotal = 0;
    let piecesPrecadres36 = 0;
    let piecesPrecadres50 = 0;
    let piecesPrecadresAutres = 0;
    const precadres36Set = new Set<string>();
    const precadres50Set = new Set<string>();
    const precadresAutreSet = new Set<string>();

    lignesCommandesPrecadres.forEach(l => {
      piecesPrecadresTotal += l.quantiteTotalPieces;
      if (l.detailsSousTypes && l.detailsSousTypes.length > 0) {
        l.detailsSousTypes.forEach(dst => {
          if (dst.cle === 'PRECADRE_36') { piecesPrecadres36 += dst.nbPieces; precadres36Set.add(l.refCommande); }
          else if (dst.cle === 'PRECADRE_50') { piecesPrecadres50 += dst.nbPieces; precadres50Set.add(l.refCommande); }
          else { piecesPrecadresAutres += dst.nbPieces; precadresAutreSet.add(l.refCommande); }
        });
      } else {
        if (l.sousTypeCle === 'PRECADRE_36') { piecesPrecadres36 += l.quantiteTotalPieces; precadres36Set.add(l.refCommande); }
        else if (l.sousTypeCle === 'PRECADRE_50') { piecesPrecadres50 += l.quantiteTotalPieces; precadres50Set.add(l.refCommande); }
        else { piecesPrecadresAutres += l.quantiteTotalPieces; precadresAutreSet.add(l.refCommande); }
      }
    });

    const configPrecadre = params.familles.PRECADRE;
    const statsPrecadres: StatsFamilleMonitoring = {
      famille: 'PRECADRE',
      label: 'Précadres & Profilés',
      nbCommandesEnCours: precadresCommandesSet.size,
      totalPiecesEnCours: piecesPrecadresTotal,
      detailsPrecadres: {
        p36: {
          cle: '36',
          label: 'Précadre 36 mm',
          nbCommandes: precadres36Set.size,
          totalPieces: piecesPrecadres36,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadres36 / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadres36Set)
        },
        p50: {
          cle: '50',
          label: 'Précadre 50 mm',
          nbCommandes: precadres50Set.size,
          totalPieces: piecesPrecadres50,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadres50 / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadres50Set)
        },
        autres: {
          cle: 'AUTRE',
          label: 'Autres Profilés',
          nbCommandes: precadresAutreSet.size,
          totalPieces: piecesPrecadresAutres,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadresAutres / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadresAutreSet)
        }
      },
      capaciteJournaliere: configPrecadre.capaciteJournalierePieces || 50,
      tempsUnitaireMin: configPrecadre.tempsUnitaireMinutes || 10,
      chargeHeuresEstimee: simResPrecadres.chargeHeuresTotale,
      joursOuvresRequis: simResPrecadres.chargeJoursTotal,
      dateLivraisonJusquAu: simResPrecadres.dateFinGlobaleFormattee,
      dateFinDate: simResPrecadres.dateFinGlobale,
      tauxOccupationJour: Math.min(100, Math.round((piecesPrecadresTotal / (configPrecadre.capaciteJournalierePieces || 50)) * 100)),
      propositionHeuresSup: simResPrecadres.propositionHeuresSup
    };

    // ────────────────────────────────────────────────────────────────────────
    // 4. EXTRACTION ET VENTILATION DES MOUSTIQUAIRES (PAR COMMANDE RÉELLE)
    // ────────────────────────────────────────────────────────────────────────
    const mstqCommandesSet = new Set<string>();
    const lignesCommandesMstq: LigneCommandeMonitoring[] = [];

    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesMoustiquaires || dossier.articlesMoustiquaires.length === 0) return;

      const mapCmds = new Map<string, typeof dossier.articlesMoustiquaires>();

      dossier.articlesMoustiquaires.forEach(m => {
        let ref = (m.refCommande || '').trim();
        if (!ref && dossier.numCommandeMoustiquaire) {
          ref = dossier.numCommandeMoustiquaire.trim();
        }
        if (!ref) {
          ref = (dossier.refCommande || dossier.id || 'CMD').trim();
        }

        const currentList = mapCmds.get(ref) || [];
        currentList.push(m);
        mapCmds.set(ref, currentList);
      });

      mapCmds.forEach((articlesCmd, cmdRef) => {
        const matchingOF = suivisOF.find(o => doesOfMatchCommande(o, dossier, cmdRef, 'MOUSTIQUAIRE'));
        if (matchingOF && (matchingOF.statut === 'CLOTURE' || matchingOF.statut === 'LIVRE' || matchingOF.statut === 'RETOUR_EN_ATTENTE')) {
          return;
        }

        let totalPiecesCetteCommande = 0;
        const detailsDescriptions: string[] = [];
        const sousTypesSet = new Set<string>();
        const typesCountMap = new Map<string, { cle: string; label: string; nbPieces: number }>();

        articlesCmd.forEach(m => {
          const q = Math.max(1, Number(m.quantite) || 1);
          totalPiecesCetteCommande += q;

          const classification = this.classifierMoustiquaire(
            m.typeOuverture,
            m.articleDesignation,
            m.modele
          );

          const existingSt = typesCountMap.get(classification.codeSousType) || { cle: classification.codeSousType, label: classification.label, nbPieces: 0 };
          existingSt.nbPieces += q;
          typesCountMap.set(classification.codeSousType, existingSt);

          sousTypesSet.add(classification.codeSousType);

          const nomProd = m.articleDesignation || classification.label;
          detailsDescriptions.push(`${q}x ${nomProd} (${m.largeur || 0}x${m.hauteur || 0}mm)`);
        });

        if (totalPiecesCetteCommande <= 0 && matchingOF) {
          totalPiecesCetteCommande = DelaisProductionService.compterPiecesOF(matchingOF, dossiers);
        }
        if (totalPiecesCetteCommande <= 0) return;

        mstqCommandesSet.add(cmdRef);

        const sousTypesList = Array.from(sousTypesSet);
        const detailsSousTypes = Array.from(typesCountMap.values());

        let sousTypePrecision = '';
        if (detailsSousTypes.length === 1) {
          sousTypePrecision = detailsSousTypes[0].label;
        } else {
          sousTypePrecision = detailsSousTypes.map(d => `${d.label}: ${d.nbPieces} pcs`).join(', ');
        }

        const primaryKey = sousTypesList[0] || 'MSTQ_ENROULABLE';

        const estEnPause = Boolean(dossier.estEnPause || dossier.statut === 'EN_PAUSE' || matchingOF?.estEnPause || matchingOF?.statut === 'EN_PAUSE');
        const estPrioritaire = Boolean(dossier.estPrioritaire || matchingOF?.estPrioritaire);
        const repriseTimestamp = (dossier as any).repriseTimestamp || (matchingOF as any)?.repriseTimestamp;

        lignesCommandesMstq.push({
          id: `CMD-MSTQ-${dossier.id}-${cmdRef}`,
          dossierId: dossier.id,
          refCommande: cmdRef,
          client: dossier.nomClientFinal || matchingOF?.nomClient || 'Client Particulier',
          donneurOrdre: dossier.donneurOrdre || matchingOF?.donneurOrdre || 'Atelier',
          dateCommande: dossier.dateCommande || matchingOF?.dateEmission || new Date().toLocaleDateString('fr-FR'),
          dateEmission: matchingOF?.dateEmission || dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
          famille: 'MOUSTIQUAIRE',
          estPrioritaire,
          estEnPause,
          motifPause: matchingOF?.motifPause || dossier.motifPause,
          repriseTimestamp,
          statutAtelier: estEnPause
            ? 'EN_PAUSE'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS')
            : 'EN_ATTENTE_COUPE',
          statutBadgeLabel: estEnPause
            ? 'En Pause'
            : matchingOF
            ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)')
            : 'En Attente Découpe',
          typePrecision: sousTypePrecision || 'Moustiquaire',
          sousTypeCle: primaryKey,
          sousTypesCles: sousTypesList.length > 0 ? sousTypesList : [primaryKey],
          detailsSousTypes,
          detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCetteCommande} moustiquaires`,
          quantiteTotalPieces: totalPiecesCetteCommande,
          dateLivraisonPrevisionnelle: dossier.dateLivraisonPrevisionnelle || '',
          dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO,
          ofCode: matchingOF?.codeOF,
          ofStatut: matchingOF?.statut,
          alerteDelai: {
            statutDelai: 'DANS_LES_TEMPS',
            joursDeRetard: 0,
            estDepasse: false,
            estRetardCritique: false,
            texteAlerte: 'Dans les temps',
            badgeLabel: '✓ Dans les délais',
            badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
            ligneClasses: '',
            flagEmoji: '✓'
          }
        });
      });
    });

    // Rapprochement des OFs Moustiquaires actifs
    ofsActifs.forEach(of => {
      if (of.famille !== 'MOUSTIQUAIRE') return;

      const matchedLine = lignesCommandesMstq.find(l => {
        if (l.dossierId && of.dossierId && l.dossierId === of.dossierId) return true;
        const r1 = normalizeRef(l.refCommande);
        const r2 = normalizeRef(of.numCommande);
        return Boolean(r1 && r2 && (r1 === r2 || (r1.length >= 3 && r2.length >= 3 && (r1.startsWith(r2) || r2.startsWith(r1)))));
      });

      if (matchedLine) {
        if (!matchedLine.ofCode && of.codeOF) matchedLine.ofCode = of.codeOF;
        if (!matchedLine.ofStatut && of.statut) matchedLine.ofStatut = of.statut;
        if (of.estEnPause) {
          matchedLine.estEnPause = true;
          matchedLine.statutAtelier = 'EN_PAUSE';
          matchedLine.statutBadgeLabel = 'En Pause';
          matchedLine.motifPause = of.motifPause;
        }
        if (of.estPrioritaire) matchedLine.estPrioritaire = true;
        return;
      }

      const nbP = DelaisProductionService.compterPiecesOF(of, dossiers);
      if (nbP <= 0) return;
      const ref = of.numCommande || of.id;
      mstqCommandesSet.add(ref);

      const classification = this.classifierMoustiquaire(of.titreSection);
      const estEnPause = Boolean(of.estEnPause);

      lignesCommandesMstq.push({
        id: `OF-MSTQ-${of.id}`,
        dossierId: of.dossierId,
        refCommande: of.numCommande || of.id,
        client: of.nomClient || 'Client',
        donneurOrdre: of.donneurOrdre || 'Atelier',
        dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        dateEmission: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
        famille: 'MOUSTIQUAIRE',
        estPrioritaire: Boolean(of.estPrioritaire),
        estEnPause,
        motifPause: of.motifPause,
        statutAtelier: estEnPause ? 'EN_PAUSE' : of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
        statutBadgeLabel: estEnPause ? 'En Pause' : of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)',
        typePrecision: classification.label,
        sousTypeCle: classification.codeSousType,
        sousTypesCles: [classification.codeSousType],
        detailsSousTypes: [{ cle: classification.codeSousType, label: classification.label, nbPieces: nbP }],
        detailArticles: `${nbP}x ${of.titreSection || 'Moustiquaires'}`,
        quantiteTotalPieces: nbP,
        dateLivraisonPrevisionnelle: of.dateLivraisonPrevisionnelle || '',
        dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO,
        ofCode: of.codeOF,
        ofStatut: of.statut,
        alerteDelai: {
          statutDelai: 'DANS_LES_TEMPS',
          joursDeRetard: 0,
          estDepasse: false,
          estRetardCritique: false,
          texteAlerte: 'Dans les temps',
          badgeLabel: '✓ Dans les délais',
          badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
          ligneClasses: '',
          flagEmoji: '✓'
        }
      });
    });

    // Simulation de planning pour les moustiquaires (Équipe indépendante)
    const simMstqItems: PlanningItemSimulation[] = lignesCommandesMstq.map(l => ({
      id: l.id,
      refCommande: l.refCommande,
      nomClient: l.client,
      nbPieces: l.quantiteTotalPieces,
      estPrioritaire: l.estPrioritaire,
      estEnPause: l.estEnPause,
      motifPause: l.motifPause,
      dateEmission: l.dateEmission || l.dateCommande,
      dateLivraisonPrevisionnelle: l.dateLivraisonPrevisionnelle,
      dateLivraisonISO: l.dateLivraisonPrevisionnelleISO,
      dossierId: l.dossierId,
      repriseTimestamp: l.repriseTimestamp
    }));
    const simResMstq = DelaisProductionService.simulerPlanningFamille('MOUSTIQUAIRE', simMstqItems, params);

    lignesCommandesMstq.forEach(l => {
      const planItem = simResMstq.commandesPlanifiees.find(p => p.id === l.id) || simResMstq.commandesEnPause.find(p => p.id === l.id);
      if (planItem) {
        l.dateLivraisonPrevisionnelle = planItem.texteLivraison;
        l.dateLivraisonPrevisionnelleISO = planItem.dateLivraisonISO;
      }
      l.alerteDelai = DelaisProductionService.evaluerStatutDelai(
        l.dateLivraisonPrevisionnelle,
        l.dateLivraisonPrevisionnelleISO,
        l.dateEmission || l.dateCommande,
        l.ofStatut
      );
    });

    let piecesMstqTotal = 0;
    let piecesMstqPF = 0;
    let piecesMstqFen = 0;
    let piecesMstqDV = 0;
    let piecesMstqFixe = 0;
    const mstqPFSet = new Set<string>();
    const mstqFenSet = new Set<string>();
    const mstqDVSet = new Set<string>();
    const mstqFixeSet = new Set<string>();

    lignesCommandesMstq.forEach(l => {
      piecesMstqTotal += l.quantiteTotalPieces;
      if (l.detailsSousTypes && l.detailsSousTypes.length > 0) {
        l.detailsSousTypes.forEach(dst => {
          if (dst.cle.includes('PORTE_FENETRE')) { piecesMstqPF += dst.nbPieces; mstqPFSet.add(l.refCommande); }
          else if (dst.cle.includes('DOUBLE_VANTAUX')) { piecesMstqDV += dst.nbPieces; mstqDVSet.add(l.refCommande); }
          else if (dst.cle.includes('FIXE')) { piecesMstqFixe += dst.nbPieces; mstqFixeSet.add(l.refCommande); }
          else { piecesMstqFen += dst.nbPieces; mstqFenSet.add(l.refCommande); }
        });
      } else {
        if (l.sousTypeCle.includes('PORTE_FENETRE')) { piecesMstqPF += l.quantiteTotalPieces; mstqPFSet.add(l.refCommande); }
        else if (l.sousTypeCle.includes('DOUBLE_VANTAUX')) { piecesMstqDV += l.quantiteTotalPieces; mstqDVSet.add(l.refCommande); }
        else if (l.sousTypeCle.includes('FIXE')) { piecesMstqFixe += l.quantiteTotalPieces; mstqFixeSet.add(l.refCommande); }
        else { piecesMstqFen += l.quantiteTotalPieces; mstqFenSet.add(l.refCommande); }
      }
    });

    const configMstq = params.familles.MOUSTIQUAIRE;
    const statsMoustiquaires: StatsFamilleMonitoring = {
      famille: 'MOUSTIQUAIRE',
      label: 'Moustiquaires',
      nbCommandesEnCours: mstqCommandesSet.size,
      totalPiecesEnCours: piecesMstqTotal,
      detailsGeneriques: [
        {
          cle: 'MSTQ_PORTE_FENETRE',
          label: 'Porte-Fenêtre',
          nbCommandes: mstqPFSet.size,
          totalPieces: piecesMstqPF,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqPF / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqPFSet)
        },
        {
          cle: 'MSTQ_FENETRE',
          label: 'Fenêtre',
          nbCommandes: mstqFenSet.size,
          totalPieces: piecesMstqFen,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqFen / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqFenSet)
        },
        {
          cle: 'MSTQ_DOUBLE_VANTAUX',
          label: 'Double Vantaux',
          nbCommandes: mstqDVSet.size,
          totalPieces: piecesMstqDV,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqDV / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqDVSet)
        },
        {
          cle: 'MSTQ_FIXE',
          label: 'Cadre Fixe',
          nbCommandes: mstqFixeSet.size,
          totalPieces: piecesMstqFixe,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqFixe / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqFixeSet)
        }
      ],
      capaciteJournaliere: configMstq.capaciteJournalierePieces || 30,
      tempsUnitaireMin: configMstq.tempsUnitaireMinutes || 15,
      chargeHeuresEstimee: simResMstq.chargeHeuresTotale,
      joursOuvresRequis: simResMstq.chargeJoursTotal,
      dateLivraisonJusquAu: simResMstq.dateFinGlobaleFormattee,
      dateFinDate: simResMstq.dateFinGlobale,
      tauxOccupationJour: Math.min(100, Math.round((piecesMstqTotal / (configMstq.capaciteJournalierePieces || 30)) * 100)),
      propositionHeuresSup: simResMstq.propositionHeuresSup
    };

    // ────────────────────────────────────────────────────────────────────────
    // 4. TOTALISATEURS GLOBAUX DE L'ATELIER
    // ────────────────────────────────────────────────────────────────────────
    const allUniqueCommandes = new Set<string>([
      ...Array.from(caissonsCommandesSet),
      ...Array.from(tabliersCommandesSet),
      ...Array.from(precadresCommandesSet),
      ...Array.from(mstqCommandesSet)
    ]);

    const totalPieces = piecesCaissonsTotal + piecesTabliersTotal + piecesPrecadresTotal + piecesMstqTotal;
    const totalChargeHeures = Math.round((statsCaissons.chargeHeuresEstimee + statsTabliers.chargeHeuresEstimee + statsPrecadres.chargeHeuresEstimee + statsMoustiquaires.chargeHeuresEstimee) * 10) / 10;

    // Date maximale d'achèvement de toutes les files
    let dateMaxAtelier = new Date(dateRef);
    if (statsCaissons.dateFinDate && statsCaissons.dateFinDate.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = statsCaissons.dateFinDate;
    if (statsTabliers.dateFinDate && statsTabliers.dateFinDate.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = statsTabliers.dateFinDate;
    if (statsPrecadres.dateFinDate && statsPrecadres.dateFinDate.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = statsPrecadres.dateFinDate;
    if (statsMoustiquaires.dateFinDate && statsMoustiquaires.dateFinDate.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = statsMoustiquaires.dateFinDate;

    const allCommandesList: LigneCommandeMonitoring[] = [
      ...lignesCommandesCaissons,
      ...lignesCommandesTabliers,
      ...lignesCommandesPrecadres,
      ...lignesCommandesMstq
    ];

    // Ordonnancement intelligent pour la table du Monitoring :
    // 1. Commande reprise en tête de file (priorité absolue)
    // 2. Commandes prioritaires actives
    // 3. Commandes actives avant les commandes en pause
    // 4. Par date de livraison prévisionnelle / chronologique
    allCommandesList.sort((a, b) => {
      const repA = (a as any).repriseTimestamp || 0;
      const repB = (b as any).repriseTimestamp || 0;
      if (repA && !repB) return -1;
      if (!repA && repB) return 1;
      if (repA && repB && repA !== repB) return repB - repA;

      const prioA = Boolean(a.estPrioritaire && !a.estEnPause);
      const prioB = Boolean(b.estPrioritaire && !b.estEnPause);
      if (prioA && !prioB) return -1;
      if (!prioA && prioB) return 1;

      if (!a.estEnPause && b.estEnPause) return -1;
      if (a.estEnPause && !b.estEnPause) return 1;

      const dA = a.dateLivraisonPrevisionnelleISO || '';
      const dB = b.dateLivraisonPrevisionnelleISO || '';
      if (dA && dB && dA !== dB) return dA.localeCompare(dB);

      return 0;
    });

    const totalEnRetard = allCommandesList.filter(c => c.alerteDelai.estDepasse).length;
    const commandesAVerifier = allCommandesList.filter(c => c.alerteDelai.estRetardCritique);
    const totalRetardCritiqueAVerifier = commandesAVerifier.length;

    // Prise en compte et synthèse des OFs clôturés
    const ofsClotures = suivisOF.filter(o => o && (o.statut === 'CLOTURE' || o.statut === 'LIVRE'));
    const totalOFsClotures = ofsClotures.length;
    const totalPiecesCloturees = ofsClotures.reduce((sum, o) => sum + (o.nombrePieces || 0), 0);

    const clientsMonitoring = this.ventilerParClient(allCommandesList);

    return {
      dateHeureCalcul: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      totalCommandesActives: allUniqueCommandes.size,
      totalPiecesEnFabrication: totalPieces,
      chargeTotaleHeures: totalChargeHeures,
      dateLivraisonGlobaleJusquAu: DelaisProductionService.formaterDateLivraison(dateMaxAtelier),
      dateMaximaleAtelier: dateMaxAtelier,
      totalEnRetard,
      totalRetardCritiqueAVerifier,
      commandesAVerifier,
      totalOFsClotures,
      totalPiecesCloturees,
      ofsClotures,
      caissons: statsCaissons,
      tabliers: statsTabliers,
      precadres: statsPrecadres,
      moustiquaires: statsMoustiquaires,
      commandesActives: allCommandesList,
      clientsMonitoring
    };
  }

  /**
   * Ventilation intelligente des commandes en cours par Client -> Famille -> Types de pièces
   */
  static ventilerParClient(commandes: LigneCommandeMonitoring[]): ClientMonitoringGroup[] {
    const clientsMap = new Map<string, {
      nomClient: string;
      donneurOrdre: string;
      commandes: LigneCommandeMonitoring[];
      refsSet: Set<string>;
    }>();

    commandes.forEach(cmd => {
      const clientNom = (cmd.client || 'Client Non Renseigné').trim();
      const existing = clientsMap.get(clientNom) || {
        nomClient: clientNom,
        donneurOrdre: cmd.donneurOrdre || 'Atelier',
        commandes: [],
        refsSet: new Set<string>()
      };
      existing.commandes.push(cmd);
      if (cmd.refCommande) existing.refsSet.add(cmd.refCommande);
      else existing.refsSet.add(cmd.id);
      clientsMap.set(clientNom, existing);
    });

    const labelsFamilles: Record<FamilleProduit, string> = {
      CAISSON: 'Caissons & Coffres',
      TABLIER: 'Tabliers de Volet',
      PRECADRE: 'Précadres',
      MOUSTIQUAIRE: 'Moustiquaires'
    };

    const groupes: ClientMonitoringGroup[] = [];

    clientsMap.forEach(clientData => {
      const totalCommandesEnCours = clientData.refsSet.size;
      let totalPiecesClient = 0;

      // Regrouper par famille
      const famillesMap = new Map<FamilleProduit, {
        famille: FamilleProduit;
        commandesRefs: Set<string>;
        totalPieces: number;
        typesMap: Map<string, { cle: string; label: string; nbPieces: number; commandesRefs: Set<string> }>;
      }>();

      clientData.commandes.forEach(cmd => {
        const fam = cmd.famille;
        totalPiecesClient += cmd.quantiteTotalPieces;

        const famEntry = famillesMap.get(fam) || {
          famille: fam,
          commandesRefs: new Set<string>(),
          totalPieces: 0,
          typesMap: new Map()
        };

        const cmdRef = cmd.refCommande || cmd.id;
        famEntry.commandesRefs.add(cmdRef);
        famEntry.totalPieces += cmd.quantiteTotalPieces;

        if (cmd.detailsSousTypes && cmd.detailsSousTypes.length > 0) {
          cmd.detailsSousTypes.forEach(dst => {
            const tEntry = famEntry.typesMap.get(dst.cle) || {
              cle: dst.cle,
              label: dst.label,
              nbPieces: 0,
              commandesRefs: new Set<string>()
            };
            tEntry.nbPieces += dst.nbPieces;
            tEntry.commandesRefs.add(cmdRef);
            famEntry.typesMap.set(dst.cle, tEntry);
          });
        } else {
          const cleType = cmd.sousTypeCle || 'AUTRE';
          const labelType = cmd.typePrecision || 'Standard';
          const tEntry = famEntry.typesMap.get(cleType) || {
            cle: cleType,
            label: labelType,
            nbPieces: 0,
            commandesRefs: new Set<string>()
          };
          tEntry.nbPieces += cmd.quantiteTotalPieces;
          tEntry.commandesRefs.add(cmdRef);
          famEntry.typesMap.set(cleType, tEntry);
        }

        famillesMap.set(fam, famEntry);
      });

      const detailsFamilles: DetailFamilleClient[] = [];
      famillesMap.forEach(famEntry => {
        const detailsTypes: DetailTypeClient[] = [];
        famEntry.typesMap.forEach(tEntry => {
          detailsTypes.push({
            typeCle: tEntry.cle,
            cle: tEntry.cle,
            typeLabel: tEntry.label,
            label: tEntry.label,
            totalPieces: tEntry.nbPieces,
            nbPieces: tEntry.nbPieces,
            nbCommandes: tEntry.commandesRefs.size,
            commandesRefs: Array.from(tEntry.commandesRefs),
            pourcentageFamille: famEntry.totalPieces > 0 ? Math.round((tEntry.nbPieces / famEntry.totalPieces) * 100) : 0
          });
        });

        // Trier les sous-types par nombre de pièces décroissant
        detailsTypes.sort((a, b) => b.totalPieces - a.totalPieces);

        detailsFamilles.push({
          famille: famEntry.famille,
          familleLabel: labelsFamilles[famEntry.famille] || famEntry.famille,
          labelFamille: labelsFamilles[famEntry.famille] || famEntry.famille,
          totalPieces: famEntry.totalPieces,
          totalCommandes: famEntry.commandesRefs.size,
          nbCommandes: famEntry.commandesRefs.size,
          types: detailsTypes
        });
      });

      // Trier les familles par nombre de pièces décroissant
      detailsFamilles.sort((a, b) => b.totalPieces - a.totalPieces);

      // Trier les commandes du client selon la règle atelier :
      // 1. Prioritaires
      // 2. Date de livraison la plus proche
      // 3. Petites quantités d'abord (1, 2, 3 pcs pour libérer rapidement)
      clientData.commandes.sort((a, b) => {
        if (a.estPrioritaire && !b.estPrioritaire) return -1;
        if (!a.estPrioritaire && b.estPrioritaire) return 1;

        const isoA = a.dateLivraisonPrevisionnelleISO || '';
        const isoB = b.dateLivraisonPrevisionnelleISO || '';
        if (isoA && isoB && isoA !== isoB) return isoA.localeCompare(isoB);
        if (isoA && !isoB) return -1;
        if (!isoA && isoB) return 1;

        const qA = a.quantiteTotalPieces || 1;
        const qB = b.quantiteTotalPieces || 1;
        if (qA !== qB) return qA - qB;

        return (a.refCommande || '').localeCompare(b.refCommande || '');
      });

      groupes.push({
        clientNom: clientData.nomClient,
        nomClient: clientData.nomClient,
        donneurOrdre: clientData.donneurOrdre,
        totalCommandes: totalCommandesEnCours,
        totalCommandesEnCours,
        totalPieces: totalPiecesClient,
        familles: detailsFamilles,
        commandes: clientData.commandes
      });
    });

    // Trier les clients : ceux qui ont le plus de pièces à fabriquer en premier
    groupes.sort((a, b) => b.totalPieces - a.totalPieces);

    return groupes;
  }

  /**
   * Générateur de commandes d'exemple représentatives pour tester le monitoring
   */
  static genererCommandesAtelierExemple(): { dossiers: DossierCommandeGlobal[]; suivisOF: SuiviOF[] } {
    const today = new Date().toLocaleDateString('fr-FR');
    const todayObj = new Date();

    // Commande plus ancienne avec retard > 3 jours pour tester l'alerte atelier demandée
    const dateIlYa6Jours = new Date(todayObj);
    dateIlYa6Jours.setDate(dateIlYa6Jours.getDate() - 6);
    const dateLivIlYa4Jours = new Date(todayObj);
    dateLivIlYa4Jours.setDate(dateLivIlYa4Jours.getDate() - 4);

    const dossiersExemples: DossierCommandeGlobal[] = [
      {
        id: 'DEMO-CMD-001',
        refCommande: 'CMD-CAISS-2601',
        donneurOrdre: 'SOMADAL Alger',
        nomClientFinal: 'SARL MCB ALUMINIUM',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [
          {
            id: 'C-01',
            refCommande: 'CMD-CAISS-2601',
            longueur: 2400,
            quantite: 8,
            repere: 'C1..C8',
            articleCode: 'ART0009',
            articleDesignation: 'CT SOMO 30 BL',
            sfArticleDesignation: 'SF SOMO 30 BL',
            typeCaisson: 'TUNNEL_SIMPLE',
            avecSousFace: true,
            montageSousFace: 'MONTEE_ATELIER',
            avecPeinture: false
          },
          {
            id: 'C-02',
            refCommande: 'CMD-CAISS-2601',
            longueur: 1800,
            quantite: 5,
            repere: 'C9..C13',
            articleCode: 'ART0010',
            articleDesignation: 'CT SOMO 25 ARRONDE',
            sfArticleDesignation: 'SF SOMO 25 BL',
            typeCaisson: 'TUNNEL_SIMPLE',
            avecSousFace: true,
            montageSousFace: 'MONTEE_ATELIER',
            avecPeinture: false
          }
        ],
        articlesTabliers: [],
        articlesPrecadres: [],
        articlesMoustiquaires: []
      },
      {
        id: 'DEMO-CMD-002',
        refCommande: 'CMD-CAISS-2602',
        donneurOrdre: 'CRISTAL Oran',
        nomClientFinal: 'VERRERIE MODERNE & BAT',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [
          {
            id: 'C-03',
            refCommande: 'CMD-CAISS-2602',
            longueur: 3100,
            quantite: 10,
            repere: 'C1..C10',
            articleCode: 'ART0009',
            articleDesignation: 'CT SOMO 30 BL',
            sfArticleDesignation: 'SF SOMO 30 BL',
            typeCaisson: 'TUNNEL_SIMPLE',
            avecSousFace: true,
            montageSousFace: 'MONTEE_ATELIER',
            avecPeinture: false
          },
          {
            id: 'C-04',
            refCommande: 'CMD-CAISS-2602',
            longueur: 4200,
            quantite: 4,
            repere: 'C11..C14',
            articleCode: 'ART0012',
            articleDesignation: 'CT SOMO 40*35',
            sfArticleDesignation: 'SF SOMO 40 BL',
            typeCaisson: 'TUNNEL_SIMPLE',
            avecSousFace: true,
            montageSousFace: 'MONTEE_ATELIER',
            avecPeinture: false
          }
        ],
        articlesTabliers: [],
        articlesPrecadres: [],
        articlesMoustiquaires: []
      },
      {
        id: 'DEMO-CMD-003',
        refCommande: 'CMD-CAISS-2603',
        donneurOrdre: 'ATELIER Alger',
        nomClientFinal: 'MENUISERIE DU SUD',
        dateCommande: dateIlYa6Jours.toLocaleDateString('fr-FR'),
        dateLivraisonPrevisionnelle: DelaisProductionService.formaterDateLivraison(dateLivIlYa4Jours),
        dateLivraisonPrevisionnelleISO: DelaisProductionService.toISODateString(dateLivIlYa4Jours),
        statut: 'EN_COURS',
        articlesCaissons: [
          {
            id: 'C-05',
            refCommande: 'CMD-CAISS-2603',
            longueur: 1500,
            quantite: 6,
            repere: 'C1..C6',
            articleCode: 'ART0011',
            articleDesignation: 'CT SOMO 25 CARRE',
            sfArticleDesignation: 'SF SOMOX  25 GR',
            typeCaisson: 'TUNNEL_SIMPLE',
            avecSousFace: true,
            montageSousFace: 'NON_MONTEE',
            avecPeinture: false
          }
        ],
        articlesTabliers: [],
        articlesPrecadres: [],
        articlesMoustiquaires: []
      },
      {
        id: 'DEMO-CMD-004',
        refCommande: 'CMD-TABL-4301',
        donneurOrdre: 'SOMADAL Alger',
        nomClientFinal: 'ALUM EXPRESS DISTRIB',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [],
        articlesTabliers: [
          {
            id: 'T-01',
            refCommande: 'CMD-TABL-4301',
            largeur: 1400,
            hauteur: 2200,
            hauteur_lame_tablier: 43,
            quantite: 14,
            repere: 'T1..T14',
            typeFabrication: 'VOLET_COMPLET',
            avecLameFinale: true,
            articleDesignation: 'TAB 43 7024'
          }
        ],
        articlesPrecadres: [],
        articlesMoustiquaires: []
      },
      {
        id: 'DEMO-CMD-005',
        refCommande: 'CMD-TABL-5501',
        donneurOrdre: 'CRISTAL Oran',
        nomClientFinal: 'ETB RESIDENCE DU LAC',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [],
        articlesTabliers: [
          {
            id: 'T-02',
            refCommande: 'CMD-TABL-5501',
            largeur: 2800,
            hauteur: 2500,
            hauteur_lame_tablier: 55,
            quantite: 9,
            repere: 'T1..T9',
            typeFabrication: 'VOLET_COMPLET',
            avecLameFinale: true,
            articleDesignation: 'TAB 55 BL'
          },
          {
            id: 'T-03',
            refCommande: 'CMD-TABL-5501',
            largeur: 1600,
            hauteur: 2100,
            hauteur_lame_tablier: 43,
            quantite: 6,
            repere: 'T10..T15',
            typeFabrication: 'TABLIER_SEUL',
            avecLameFinale: true,
            articleDesignation: 'TAB 43 BL'
          }
        ],
        articlesPrecadres: [],
        articlesMoustiquaires: []
      },
      {
        id: 'DEMO-CMD-006',
        refCommande: 'CMD-MULTI-8801',
        donneurOrdre: 'ATELIER Alger',
        nomClientFinal: 'HABITAT CONFORT & DESIGN',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [
          {
            id: 'C-06',
            refCommande: 'CMD-MULTI-8801',
            longueur: 2000,
            quantite: 3,
            repere: 'C1..C3',
            articleCode: 'ART0012',
            articleDesignation: 'CT SOMO 40*35',
            sfArticleDesignation: 'SF SOMO 40 BL',
            typeCaisson: 'TUNNEL_SIMPLE',
            avecSousFace: true,
            montageSousFace: 'MONTEE_ATELIER',
            avecPeinture: false
          }
        ],
        articlesTabliers: [
          {
            id: 'T-04',
            refCommande: 'CMD-MULTI-8801',
            largeur: 2000,
            hauteur: 2200,
            hauteur_lame_tablier: 55,
            quantite: 3,
            repere: 'T1..T3',
            typeFabrication: 'VOLET_COMPLET',
            avecLameFinale: true,
            articleDesignation: 'TAB 55 9007'
          }
        ],
        articlesPrecadres: [
          {
            id: 'P-01',
            refCommande: 'CMD-MULTI-8801',
            largeur: 1200,
            hauteur: 1400,
            quantite: 8,
            repere: 'P1..P8',
            figure: 'VIDE',
            modeDebordement: 'SANS_DEBORDEMENT',
            debordementSuperieur: 0,
            debordementInferieur: 0,
            typePrecadre: 'TYPE_36',
            articleCode: 'ART0070',
            articleDesignation: 'PRÉCADRE TYPE 36'
          }
        ],
        articlesMoustiquaires: [
          {
            id: 'M-01',
            refCommande: 'CMD-MULTI-8801',
            modele: 'PLISSEE_20',
            typeOuverture: 'FENETRE',
            typeFabrication: 'COMPLET',
            avecBarreInferieure: true,
            largeur: 1200,
            hauteur: 1400,
            quantite: 8,
            repere: 'M1..M8',
            articleDesignation: 'Moustiquaire Fenêtre 1 Vantail'
          }
        ]
      },
      {
        id: 'DEMO-CMD-007',
        refCommande: 'CMD-PREC-3601',
        donneurOrdre: 'CRISTAL Oran',
        nomClientFinal: 'PROMOTION IMMOBILIERE ATLAS',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [],
        articlesTabliers: [],
        articlesPrecadres: [
          {
            id: 'P-02',
            refCommande: 'CMD-PREC-3601',
            largeur: 1400,
            hauteur: 2150,
            quantite: 15,
            repere: 'P1..P15',
            figure: 'VIDE',
            modeDebordement: 'SANS_DEBORDEMENT',
            debordementSuperieur: 0,
            debordementInferieur: 0,
            typePrecadre: 'TYPE_36',
            articleCode: 'ART0070',
            articleDesignation: 'PRÉCADRE TYPE 36'
          }
        ],
        articlesMoustiquaires: [
          {
            id: 'M-02',
            refCommande: 'CMD-PREC-3601',
            modele: 'PLISSEE_20',
            typeOuverture: 'PORTE_FENETRE',
            typeFabrication: 'COMPLET',
            avecBarreInferieure: false,
            largeur: 1400,
            hauteur: 2200,
            quantite: 10,
            repere: 'PF1..PF10',
            articleDesignation: 'Moustiquaire Porte-Fenêtre'
          }
        ]
      },
      {
        id: 'DEMO-CMD-008',
        refCommande: 'CMD-PREC-5001',
        donneurOrdre: 'SOMADAL Alger',
        nomClientFinal: 'ENTREPRISE GENERALE CONST',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [],
        articlesTabliers: [],
        articlesPrecadres: [
          {
            id: 'P-03',
            refCommande: 'CMD-PREC-5001',
            largeur: 2400,
            hauteur: 2200,
            quantite: 12,
            repere: 'P1..P12',
            figure: 'VIDE',
            modeDebordement: 'SANS_DEBORDEMENT',
            debordementSuperieur: 0,
            debordementInferieur: 0,
            typePrecadre: 'TYPE_50',
            articleCode: 'ART0071',
            articleDesignation: 'PRÉCADRE TYPE 50'
          }
        ],
        articlesMoustiquaires: [
          {
            id: 'M-03',
            refCommande: 'CMD-PREC-5001',
            modele: 'PLISSEE_20',
            typeOuverture: 'DOUBLE_VANTAUX',
            typeFabrication: 'COMPLET',
            avecBarreInferieure: true,
            largeur: 2400,
            hauteur: 2200,
            quantite: 6,
            repere: 'DV1..DV6',
            articleDesignation: 'Moustiquaire Baie Double Vantaux'
          }
        ]
      },
      {
        id: 'DEMO-CMD-009',
        refCommande: 'CMD-MSTQ-FIX01',
        donneurOrdre: 'ATELIER Alger',
        nomClientFinal: 'RESIDENCE LES OLIVIERS',
        dateCommande: today,
        statut: 'EN_COURS',
        articlesCaissons: [],
        articlesTabliers: [],
        articlesPrecadres: [],
        articlesMoustiquaires: [
          {
            id: 'M-04',
            refCommande: 'CMD-MSTQ-FIX01',
            modele: 'PLISSEE_20',
            typeOuverture: 'FIXE',
            typeFabrication: 'COMPLET',
            avecBarreInferieure: true,
            largeur: 800,
            hauteur: 600,
            quantite: 14,
            repere: 'F1..F14',
            articleDesignation: 'Moustiquaire Cadre Fixe'
          }
        ]
      }
    ];

    const ofsExemples: SuiviOF[] = [
      {
        id: 'DEMO-OF-01',
        numeroEmission: 1,
        codeOF: 'OF-001',
        numCommande: 'CMD-CAISS-2601',
        nomClient: 'SARL MCB ALUMINIUM',
        donneurOrdre: 'SOMADAL Alger',
        famille: 'CAISSON',
        titreSection: 'CT SOMO 30 BL',
        statut: 'EMIS',
        dateEmission: today,
        totalBarresNeuvesPrevu: 4,
        totalChutesUtiliseesPrevu: 1,
        lignesRetour: []
      },
      {
        id: 'DEMO-OF-02',
        numeroEmission: 2,
        codeOF: 'OF-002',
        numCommande: 'CMD-TABL-4301',
        nomClient: 'ALUM EXPRESS DISTRIB',
        donneurOrdre: 'SOMADAL Alger',
        famille: 'TABLIER',
        titreSection: 'TAB 43 7024',
        statut: 'EMIS',
        dateEmission: today,
        totalBarresNeuvesPrevu: 12,
        totalChutesUtiliseesPrevu: 2,
        lignesRetour: []
      }
    ];

    return { dossiers: dossiersExemples, suivisOF: ofsExemples };
  }
}
