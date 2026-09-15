import {
  DossierCommandeGlobal,
  SuiviOF,
  Article,
  FamilleProduit,
  ParametresProductionAtelier,
  InfoStatutDelai
} from '../types';
import { DelaisProductionService } from './delaisProductionService';

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
}

export interface LigneCommandeMonitoring {
  id: string;
  refCommande: string;
  client: string;
  donneurOrdre: string;
  dateCommande: string;
  famille: FamilleProduit;
  statutAtelier: 'EN_ATTENTE_COUPE' | 'OF_EMIS' | 'COUPE_EN_COURS' | 'RETOUR_SAISI' | 'PRET_LIVRAISON';
  statutBadgeLabel: string;
  typePrecision: string; // Ex: "Caisson 30", "Tablier Lame 43", etc.
  sousTypeCle?: string; // Clé normalisée pour filtrage rapide
  detailArticles: string;
  quantiteTotalPieces: number;
  dateLivraisonPrevisionnelle: string;
  dateLivraisonPrevisionnelleISO?: string;
  ofCode?: string;
  ofStatut?: string;
  // Détection du respect des délais et alerte atelier
  alerteDelai: InfoStatutDelai;
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
  caissons: StatsFamilleMonitoring;
  tabliers: StatsFamilleMonitoring;
  precadres: StatsFamilleMonitoring;
  moustiquaires: StatsFamilleMonitoring;
  commandesActives: LigneCommandeMonitoring[];
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

    // Filtre des dossiers actifs (non clôturés, non livrés, non terminés)
    const dossiersActifs = dossiers.filter(d =>
      d && d.statut !== 'CLOTURE' && d.statut !== 'LIVRE' && d.statut !== 'TERMINE'
    );

    // Filtre des OFs actifs (émis ou en attente de retour atelier)
    const ofsActifs = suivisOF.filter(o =>
      o && (o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE')
    );

    // ────────────────────────────────────────────────────────────────────────
    // 1. EXTRACTION ET VENTILATION DES CAISSONS
    // ────────────────────────────────────────────────────────────────────────
    const caissonsCommandesSet = new Set<string>();
    const caissons25CommandesSet = new Set<string>();
    const caissons30CommandesSet = new Set<string>();
    const caissons40CommandesSet = new Set<string>();
    const caissonsAutresCommandesSet = new Set<string>();

    let piecesCaissonsTotal = 0;
    let piecesCaissons25 = 0;
    let piecesCaissons30 = 0;
    let piecesCaissons40 = 0;
    let piecesCaissonsAutres = 0;

    const lignesCommandesCaissons: LigneCommandeMonitoring[] = [];

    // Parcourir les dossiers actifs contenant des caissons
    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesCaissons || dossier.articlesCaissons.length === 0) return;

      const ref = dossier.refCommande || dossier.id;
      let totalPiecesCeDossier = 0;
      const detailsDescriptions: string[] = [];
      let sousTypePrincipal: string = '';

      dossier.articlesCaissons.forEach(c => {
        const qte = Number(c.quantite) || 1;
        totalPiecesCeDossier += qte;
        piecesCaissonsTotal += qte;
        caissonsCommandesSet.add(ref);

        const art = c.articleCode ? articleMap.get(c.articleCode.toUpperCase()) : undefined;
        const classification = this.classifierCaisson(c.articleDesignation, c.sfArticleDesignation, art?.hauteur);

        if (classification.cle === '25') {
          piecesCaissons25 += qte;
          caissons25CommandesSet.add(ref);
          if (!sousTypePrincipal) sousTypePrincipal = 'Caisson 25';
        } else if (classification.cle === '30') {
          piecesCaissons30 += qte;
          caissons30CommandesSet.add(ref);
          if (!sousTypePrincipal) sousTypePrincipal = 'Caisson 30';
        } else if (classification.cle === '40') {
          piecesCaissons40 += qte;
          caissons40CommandesSet.add(ref);
          if (!sousTypePrincipal) sousTypePrincipal = 'Caisson 40';
        } else {
          piecesCaissonsAutres += qte;
          caissonsAutresCommandesSet.add(ref);
          if (!sousTypePrincipal) sousTypePrincipal = 'Caisson Autre';
        }

        const nomProd = c.articleDesignation || c.sfArticleDesignation || 'Caisson';
        detailsDescriptions.push(`${qte}x ${nomProd} (${c.longueur || 0}mm)`);
      });

      // Trouver si un OF existe pour ce caisson
      const matchingOF = ofsActifs.find(o =>
        (o.numCommande && (o.numCommande === dossier.refCommande || o.numCommande === dossier.numCommandeCaisson)) &&
        (o.famille === 'CAISSON' || (o.famille as string) === 'SOUS_FACE')
      );

      const delaiInfo = DelaisProductionService.estimerDelaiDossier(dossier, dossiersActifs, ofsActifs, params);
      const dateLiv = dossier.dateLivraisonPrevisionnelle || delaiInfo.dateLivraisonFormattee;
      const alerteDelai = DelaisProductionService.evaluerStatutDelai(
        dossier.dateLivraisonPrevisionnelle || dateLiv,
        dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        dossier.dateCommande,
        dossier.statut
      );

      lignesCommandesCaissons.push({
        id: `DOS-CAISS-${dossier.id}`,
        refCommande: dossier.refCommande,
        client: dossier.nomClientFinal || 'Client Particulier',
        donneurOrdre: dossier.donneurOrdre || 'Atelier',
        dateCommande: dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
        famille: 'CAISSON',
        statutAtelier: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS') : 'EN_ATTENTE_COUPE',
        statutBadgeLabel: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)') : 'En Attente Découpe',
        typePrecision: sousTypePrincipal || 'Caisson',
        sousTypeCle: sousTypePrincipal.includes('30') ? 'CAISSON_30' : sousTypePrincipal.includes('25') ? 'CAISSON_25' : sousTypePrincipal.includes('40') ? 'CAISSON_40' : 'CAISSON_AUTRE',
        detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCeDossier} caissons`,
        quantiteTotalPieces: totalPiecesCeDossier,
        dateLivraisonPrevisionnelle: dateLiv,
        dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        ofCode: matchingOF?.codeOF,
        ofStatut: matchingOF?.statut,
        alerteDelai
      });
    });

    // Vérifier également les OFs Caissons indépendants non rattachés à un dossier
    ofsActifs.forEach(of => {
      if (of.famille !== 'CAISSON' && (of.famille as string) !== 'SOUS_FACE') return;

      const dejaComptabilise = lignesCommandesCaissons.some(l => l.refCommande === of.numCommande);
      if (!dejaComptabilise) {
        const nbP = DelaisProductionService.compterPiecesOF(of);
        const ref = of.numCommande || of.id;
        piecesCaissonsTotal += nbP;
        caissonsCommandesSet.add(ref);

        const classification = this.classifierCaisson(of.titreSection);
        if (classification.cle === '25') {
          piecesCaissons25 += nbP;
          caissons25CommandesSet.add(ref);
        } else if (classification.cle === '30') {
          piecesCaissons30 += nbP;
          caissons30CommandesSet.add(ref);
        } else if (classification.cle === '40') {
          piecesCaissons40 += nbP;
          caissons40CommandesSet.add(ref);
        } else {
          piecesCaissonsAutres += nbP;
          caissonsAutresCommandesSet.add(ref);
        }

        const delai = DelaisProductionService.estimerDelaiOF(of, ofsActifs, params);
        const dateLiv = of.dateLivraisonPrevisionnelle || delai.texteFormatte;
        const alerteDelai = DelaisProductionService.evaluerStatutDelai(
          dateLiv,
          of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          of.dateEmission,
          of.statut
        );

        lignesCommandesCaissons.push({
          id: `OF-CAISS-${of.id}`,
          refCommande: of.numCommande,
          client: of.nomClient || 'Client',
          donneurOrdre: of.donneurOrdre || 'Atelier',
          dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
          famille: 'CAISSON',
          statutAtelier: of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
          statutBadgeLabel: of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)',
          typePrecision: classification.label,
          sousTypeCle: classification.cle === '30' ? 'CAISSON_30' : classification.cle === '25' ? 'CAISSON_25' : classification.cle === '40' ? 'CAISSON_40' : 'CAISSON_AUTRE',
          detailArticles: `${nbP}x ${of.titreSection || 'Caissons'}`,
          quantiteTotalPieces: nbP,
          dateLivraisonPrevisionnelle: dateLiv,
          dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          ofCode: of.codeOF,
          ofStatut: of.statut,
          alerteDelai
        });
      }
    });

    // Calcul de l'échéance prévisionnelle globale pour les Caissons
    const configCaisson = params.familles.CAISSON;
    const capaciteJourCaisson = configCaisson.capaciteJournalierePieces || 120;
    const delaiFixeCaisson = configCaisson.delaiFixeJours || 0;
    const joursRequisCaisson = piecesCaissonsTotal > 0
      ? Math.max(1, Math.ceil(piecesCaissonsTotal / capaciteJourCaisson + delaiFixeCaisson))
      : 1;

    const dateFinCaisson = DelaisProductionService.ajouterJoursOuvres(dateRef, joursRequisCaisson, params.joursOuvres);
    const dateLivraisonCaissonJusquAu = DelaisProductionService.formaterDateLivraison(dateFinCaisson);

    const chargeHeuresCaisson = Math.round(((piecesCaissonsTotal * (configCaisson.tempsUnitaireMinutes || 5)) / 60) * 10) / 10;

    const statsCaissons: StatsFamilleMonitoring = {
      famille: 'CAISSON',
      label: 'Caissons & Sous-Faces',
      nbCommandesEnCours: caissonsCommandesSet.size,
      totalPiecesEnCours: piecesCaissonsTotal,
      detailsCaissons: {
        c25: {
          cle: '25',
          label: 'Caisson 25 (250 mm)',
          nbCommandes: caissons25CommandesSet.size,
          totalPieces: piecesCaissons25,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissons25 / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissons25CommandesSet)
        },
        c30: {
          cle: '30',
          label: 'Caisson 30 (300 mm)',
          nbCommandes: caissons30CommandesSet.size,
          totalPieces: piecesCaissons30,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissons30 / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissons30CommandesSet)
        },
        c40: {
          cle: '40',
          label: 'Caisson 40 (400 mm)',
          nbCommandes: caissons40CommandesSet.size,
          totalPieces: piecesCaissons40,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissons40 / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissons40CommandesSet)
        },
        autres: {
          cle: 'AUTRE',
          label: 'Sous-Faces & Autres',
          nbCommandes: caissonsAutresCommandesSet.size,
          totalPieces: piecesCaissonsAutres,
          pourcentage: piecesCaissonsTotal > 0 ? Math.round((piecesCaissonsAutres / piecesCaissonsTotal) * 100) : 0,
          commandesRefs: Array.from(caissonsAutresCommandesSet)
        }
      },
      capaciteJournaliere: capaciteJourCaisson,
      tempsUnitaireMin: configCaisson.tempsUnitaireMinutes || 5,
      chargeHeuresEstimee: chargeHeuresCaisson,
      joursOuvresRequis: joursRequisCaisson,
      dateLivraisonJusquAu: dateLivraisonCaissonJusquAu,
      dateFinDate: dateFinCaisson,
      tauxOccupationJour: Math.min(100, Math.round((piecesCaissonsTotal / capaciteJourCaisson) * 100))
    };

    // ────────────────────────────────────────────────────────────────────────
    // 2. EXTRACTION ET VENTILATION DES TABLIERS (43, 55...)
    // ────────────────────────────────────────────────────────────────────────
    const tabliersCommandesSet = new Set<string>();
    const tabliers43CommandesSet = new Set<string>();
    const tabliers55CommandesSet = new Set<string>();
    const tabliersAutresCommandesSet = new Set<string>();

    let piecesTabliersTotal = 0;
    let piecesTabliers43 = 0;
    let piecesTabliers55 = 0;
    let piecesTabliersAutres = 0;

    const lignesCommandesTabliers: LigneCommandeMonitoring[] = [];

    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesTabliers || dossier.articlesTabliers.length === 0) return;

      const ref = dossier.refCommande || dossier.id;
      let totalPiecesCeDossier = 0;
      const detailsDescriptions: string[] = [];
      let sousTypePrincipal: string = '';

      dossier.articlesTabliers.forEach(t => {
        const qte = Number(t.quantite) || 1;
        totalPiecesCeDossier += qte;
        piecesTabliersTotal += qte;
        tabliersCommandesSet.add(ref);

        const classification = this.classifierTablier(t.hauteur_lame_tablier, t.articleDesignation);

        if (classification.cle === '43') {
          piecesTabliers43 += qte;
          tabliers43CommandesSet.add(ref);
          if (!sousTypePrincipal) sousTypePrincipal = 'Lame 43';
        } else if (classification.cle === '55') {
          piecesTabliers55 += qte;
          tabliers55CommandesSet.add(ref);
          if (!sousTypePrincipal) sousTypePrincipal = 'Lame 55';
        } else {
          piecesTabliersAutres += qte;
          tabliersAutresCommandesSet.add(ref);
          if (!sousTypePrincipal) sousTypePrincipal = 'Lame Spéciale';
        }

        const nomLame = classification.label;
        detailsDescriptions.push(`${qte}x ${nomLame} (${t.largeur || 0}x${t.hauteur || 0}mm)`);
      });

      const matchingOF = ofsActifs.find(o =>
        (o.numCommande && (o.numCommande === dossier.refCommande || o.numCommande === dossier.numCommandeTablier)) &&
        o.famille === 'TABLIER'
      );

      const delaiInfo = DelaisProductionService.estimerDelaiDossier(dossier, dossiersActifs, ofsActifs, params);
      const dateLiv = dossier.dateLivraisonPrevisionnelle || delaiInfo.dateLivraisonFormattee;
      const alerteDelai = DelaisProductionService.evaluerStatutDelai(
        dossier.dateLivraisonPrevisionnelle || dateLiv,
        dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        dossier.dateCommande,
        dossier.statut
      );

      lignesCommandesTabliers.push({
        id: `DOS-TABL-${dossier.id}`,
        refCommande: dossier.refCommande,
        client: dossier.nomClientFinal || 'Client Particulier',
        donneurOrdre: dossier.donneurOrdre || 'Atelier',
        dateCommande: dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
        famille: 'TABLIER',
        statutAtelier: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS') : 'EN_ATTENTE_COUPE',
        statutBadgeLabel: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)') : 'En Attente Découpe',
        typePrecision: sousTypePrincipal || 'Tablier',
        sousTypeCle: sousTypePrincipal.includes('43') ? 'TABLIER_43' : sousTypePrincipal.includes('55') ? 'TABLIER_55' : 'TABLIER_AUTRE',
        detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCeDossier} tabliers`,
        quantiteTotalPieces: totalPiecesCeDossier,
        dateLivraisonPrevisionnelle: dateLiv,
        dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        ofCode: matchingOF?.codeOF,
        ofStatut: matchingOF?.statut,
        alerteDelai
      });
    });

    // OFs Tabliers autonomes
    ofsActifs.forEach(of => {
      if (of.famille !== 'TABLIER') return;

      const dejaComptabilise = lignesCommandesTabliers.some(l => l.refCommande === of.numCommande);
      if (!dejaComptabilise) {
        const nbP = DelaisProductionService.compterPiecesOF(of);
        const ref = of.numCommande || of.id;
        piecesTabliersTotal += nbP;
        tabliersCommandesSet.add(ref);

        const classification = this.classifierTablier(undefined, of.titreSection);
        if (classification.cle === '43') {
          piecesTabliers43 += nbP;
          tabliers43CommandesSet.add(ref);
        } else if (classification.cle === '55') {
          piecesTabliers55 += nbP;
          tabliers55CommandesSet.add(ref);
        } else {
          piecesTabliersAutres += nbP;
          tabliersAutresCommandesSet.add(ref);
        }

        const delai = DelaisProductionService.estimerDelaiOF(of, ofsActifs, params);
        const dateLiv = of.dateLivraisonPrevisionnelle || delai.texteFormatte;
        const alerteDelai = DelaisProductionService.evaluerStatutDelai(
          dateLiv,
          of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          of.dateEmission,
          of.statut
        );

        lignesCommandesTabliers.push({
          id: `OF-TABL-${of.id}`,
          refCommande: of.numCommande,
          client: of.nomClient || 'Client',
          donneurOrdre: of.donneurOrdre || 'Atelier',
          dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
          famille: 'TABLIER',
          statutAtelier: of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
          statutBadgeLabel: of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)',
          typePrecision: classification.label,
          sousTypeCle: classification.cle === '43' ? 'TABLIER_43' : classification.cle === '55' ? 'TABLIER_55' : 'TABLIER_AUTRE',
          detailArticles: `${nbP}x ${of.titreSection || 'Tablier'}`,
          quantiteTotalPieces: nbP,
          dateLivraisonPrevisionnelle: dateLiv,
          dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          ofCode: of.codeOF,
          ofStatut: of.statut,
          alerteDelai
        });
      }
    });

    const configTablier = params.familles.TABLIER;
    const capaciteJourTablier = configTablier.capaciteJournalierePieces || 80;
    const delaiFixeTablier = configTablier.delaiFixeJours || 0;
    const joursRequisTablier = piecesTabliersTotal > 0
      ? Math.max(1, Math.ceil(piecesTabliersTotal / capaciteJourTablier + delaiFixeTablier))
      : 1;

    const dateFinTablier = DelaisProductionService.ajouterJoursOuvres(dateRef, joursRequisTablier, params.joursOuvres);
    const dateLivraisonTablierJusquAu = DelaisProductionService.formaterDateLivraison(dateFinTablier);

    const chargeHeuresTablier = Math.round(((piecesTabliersTotal * (configTablier.tempsUnitaireMinutes || 8)) / 60) * 10) / 10;

    const statsTabliers: StatsFamilleMonitoring = {
      famille: 'TABLIER',
      label: 'Tabliers Volets Roulants',
      nbCommandesEnCours: tabliersCommandesSet.size,
      totalPiecesEnCours: piecesTabliersTotal,
      detailsTabliers: {
        l43: {
          cle: '43',
          label: 'Lame 43 mm (ALU / PVC)',
          nbCommandes: tabliers43CommandesSet.size,
          totalPieces: piecesTabliers43,
          pourcentage: piecesTabliersTotal > 0 ? Math.round((piecesTabliers43 / piecesTabliersTotal) * 100) : 0,
          commandesRefs: Array.from(tabliers43CommandesSet)
        },
        l55: {
          cle: '55',
          label: 'Lame 55 mm (ALU / PVC)',
          nbCommandes: tabliers55CommandesSet.size,
          totalPieces: piecesTabliers55,
          pourcentage: piecesTabliersTotal > 0 ? Math.round((piecesTabliers55 / piecesTabliersTotal) * 100) : 0,
          commandesRefs: Array.from(tabliers55CommandesSet)
        },
        autres: {
          cle: 'AUTRE',
          label: 'Autres Lames (39, 77...)',
          nbCommandes: tabliersAutresCommandesSet.size,
          totalPieces: piecesTabliersAutres,
          pourcentage: piecesTabliersTotal > 0 ? Math.round((piecesTabliersAutres / piecesTabliersTotal) * 100) : 0,
          commandesRefs: Array.from(tabliersAutresCommandesSet)
        }
      },
      capaciteJournaliere: capaciteJourTablier,
      tempsUnitaireMin: configTablier.tempsUnitaireMinutes || 8,
      chargeHeuresEstimee: chargeHeuresTablier,
      joursOuvresRequis: joursRequisTablier,
      dateLivraisonJusquAu: dateLivraisonTablierJusquAu,
      dateFinDate: dateFinTablier,
      tauxOccupationJour: Math.min(100, Math.round((piecesTabliersTotal / capaciteJourTablier) * 100))
    };

    // ────────────────────────────────────────────────────────────────────────
    // 3. PRÉCADRES & MOUSTIQUAIRES (VENTILATION DÉTAILLÉE PAR TYPES)
    // ────────────────────────────────────────────────────────────────────────
    const precadresCommandesSet = new Set<string>();
    const precadres36CommandesSet = new Set<string>();
    const precadres50CommandesSet = new Set<string>();
    const precadresAutresCommandesSet = new Set<string>();

    let piecesPrecadresTotal = 0;
    let piecesPrecadres36 = 0;
    let piecesPrecadres50 = 0;
    let piecesPrecadresAutres = 0;

    const lignesCommandesPrecadres: LigneCommandeMonitoring[] = [];

    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesPrecadres || dossier.articlesPrecadres.length === 0) return;
      const ref = dossier.refCommande || dossier.id;
      let totalPiecesCeDossier = 0;
      const detailsDescriptions: string[] = [];
      let sousTypePrincipal = '';
      let sousTypeCode = 'PRECADRE_36';

      dossier.articlesPrecadres.forEach(p => {
        const q = Number(p.quantite) || 1;
        totalPiecesCeDossier += q;
        piecesPrecadresTotal += q;
        precadresCommandesSet.add(ref);

        const classification = this.classifierPrecadre(
          p.articleDesignation,
          p.articleCode,
          p.typePrecadre,
          p.hauteur
        );

        if (classification.cle === '36') {
          piecesPrecadres36 += q;
          precadres36CommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'PRECADRE_36';
          }
        } else if (classification.cle === '50') {
          piecesPrecadres50 += q;
          precadres50CommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'PRECADRE_50';
          }
        } else {
          piecesPrecadresAutres += q;
          precadresAutresCommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'PRECADRE_AUTRE';
          }
        }

        detailsDescriptions.push(`${q}x ${classification.label} (${p.largeur || 0}x${p.hauteur || 0}mm)`);
      });

      const delaiInfo = DelaisProductionService.estimerDelaiDossier(dossier, dossiersActifs, ofsActifs, params);
      const dateLiv = dossier.dateLivraisonPrevisionnelle || delaiInfo.dateLivraisonFormattee;
      const alerteDelai = DelaisProductionService.evaluerStatutDelai(
        dossier.dateLivraisonPrevisionnelle || dateLiv,
        dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        dossier.dateCommande,
        dossier.statut
      );

      const matchingOF = ofsActifs.find(o =>
        (o.numCommande && (o.numCommande === dossier.refCommande || o.numCommande === dossier.numCommandePrecadre)) &&
        o.famille === 'PRECADRE'
      );

      lignesCommandesPrecadres.push({
        id: `DOS-PREC-${dossier.id}`,
        refCommande: dossier.refCommande,
        client: dossier.nomClientFinal || 'Client',
        donneurOrdre: dossier.donneurOrdre || 'Atelier',
        dateCommande: dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
        famille: 'PRECADRE',
        statutAtelier: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS') : 'EN_ATTENTE_COUPE',
        statutBadgeLabel: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)') : 'En Attente Découpe',
        typePrecision: sousTypePrincipal || 'Précadre Type 36',
        sousTypeCle: sousTypeCode,
        detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCeDossier} précadre(s)`,
        quantiteTotalPieces: totalPiecesCeDossier,
        dateLivraisonPrevisionnelle: dateLiv,
        dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        ofCode: matchingOF?.codeOF,
        ofStatut: matchingOF?.statut,
        alerteDelai
      });
    });

    // OFs Précadres autonomes
    ofsActifs.forEach(of => {
      if (of.famille !== 'PRECADRE') return;
      const dejaComptabilise = lignesCommandesPrecadres.some(l => l.refCommande === of.numCommande);
      if (!dejaComptabilise) {
        const nbP = DelaisProductionService.compterPiecesOF(of);
        const ref = of.numCommande || of.id;
        piecesPrecadresTotal += nbP;
        precadresCommandesSet.add(ref);

        const classification = this.classifierPrecadre(of.titreSection);
        if (classification.cle === '36') {
          piecesPrecadres36 += nbP;
          precadres36CommandesSet.add(ref);
        } else if (classification.cle === '50') {
          piecesPrecadres50 += nbP;
          precadres50CommandesSet.add(ref);
        } else {
          piecesPrecadresAutres += nbP;
          precadresAutresCommandesSet.add(ref);
        }

        const delai = DelaisProductionService.estimerDelaiOF(of, ofsActifs, params);
        const dateLiv = of.dateLivraisonPrevisionnelle || delai.texteFormatte;
        const alerteDelai = DelaisProductionService.evaluerStatutDelai(
          dateLiv,
          of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          of.dateEmission,
          of.statut
        );

        lignesCommandesPrecadres.push({
          id: `OF-PREC-${of.id}`,
          refCommande: of.numCommande,
          client: of.nomClient || 'Client',
          donneurOrdre: of.donneurOrdre || 'Atelier',
          dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
          famille: 'PRECADRE',
          statutAtelier: of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
          statutBadgeLabel: of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)',
          typePrecision: classification.label,
          sousTypeCle: classification.codeSousType,
          detailArticles: `${nbP}x ${of.titreSection || 'Précadres'}`,
          quantiteTotalPieces: nbP,
          dateLivraisonPrevisionnelle: dateLiv,
          dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          ofCode: of.codeOF,
          ofStatut: of.statut,
          alerteDelai
        });
      }
    });

    const configPrecadre = params.familles.PRECADRE;
    const capPrecadre = configPrecadre.capaciteJournalierePieces || 50;
    const jPrecadre = piecesPrecadresTotal > 0 ? Math.max(1, Math.ceil(piecesPrecadresTotal / capPrecadre)) : 1;
    const dateFinPrecadre = DelaisProductionService.ajouterJoursOuvres(dateRef, jPrecadre, params.joursOuvres);

    const statsPrecadres: StatsFamilleMonitoring = {
      famille: 'PRECADRE',
      label: 'Précadres Aluminium',
      nbCommandesEnCours: precadresCommandesSet.size,
      totalPiecesEnCours: piecesPrecadresTotal,
      detailsPrecadres: {
        p36: {
          cle: '36',
          label: 'Type 36 (36 mm Standard)',
          nbCommandes: precadres36CommandesSet.size,
          totalPieces: piecesPrecadres36,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadres36 / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadres36CommandesSet)
        },
        p50: {
          cle: '50',
          label: 'Type 50 (50 mm Renforcé)',
          nbCommandes: precadres50CommandesSet.size,
          totalPieces: piecesPrecadres50,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadres50 / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadres50CommandesSet)
        },
        autres: {
          cle: 'AUTRE',
          label: 'Profils Spéciaux / Sur-mesure',
          nbCommandes: precadresAutresCommandesSet.size,
          totalPieces: piecesPrecadresAutres,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadresAutres / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadresAutresCommandesSet)
        }
      },
      detailsGeneriques: [
        {
          cle: 'PRECADRE_36',
          label: 'Précadre Type 36',
          nbCommandes: precadres36CommandesSet.size,
          totalPieces: piecesPrecadres36,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadres36 / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadres36CommandesSet)
        },
        {
          cle: 'PRECADRE_50',
          label: 'Précadre Type 50',
          nbCommandes: precadres50CommandesSet.size,
          totalPieces: piecesPrecadres50,
          pourcentage: piecesPrecadresTotal > 0 ? Math.round((piecesPrecadres50 / piecesPrecadresTotal) * 100) : 0,
          commandesRefs: Array.from(precadres50CommandesSet)
        }
      ],
      capaciteJournaliere: capPrecadre,
      tempsUnitaireMin: configPrecadre.tempsUnitaireMinutes || 12,
      chargeHeuresEstimee: Math.round(((piecesPrecadresTotal * (configPrecadre.tempsUnitaireMinutes || 12)) / 60) * 10) / 10,
      joursOuvresRequis: jPrecadre,
      dateLivraisonJusquAu: DelaisProductionService.formaterDateLivraison(dateFinPrecadre),
      dateFinDate: dateFinPrecadre,
      tauxOccupationJour: Math.min(100, Math.round((piecesPrecadresTotal / capPrecadre) * 100))
    };

    // ────────────────────────────────────────────────────────────────────────
    // MOUSTIQUAIRES (PORTE-FENÊTRE, FENÊTRE, DOUBLE VANTAUX, FIXE)
    // ────────────────────────────────────────────────────────────────────────
    const mstqCommandesSet = new Set<string>();
    const mstqPFCommandesSet = new Set<string>();
    const mstqFenCommandesSet = new Set<string>();
    const mstqDVCommandesSet = new Set<string>();
    const mstqFixeCommandesSet = new Set<string>();
    const mstqAutresCommandesSet = new Set<string>();

    let piecesMstqTotal = 0;
    let piecesMstqPF = 0;
    let piecesMstqFen = 0;
    let piecesMstqDV = 0;
    let piecesMstqFixe = 0;
    let piecesMstqAutres = 0;

    const lignesCommandesMstq: LigneCommandeMonitoring[] = [];

    dossiersActifs.forEach(dossier => {
      if (!dossier.articlesMoustiquaires || dossier.articlesMoustiquaires.length === 0) return;
      const ref = dossier.refCommande || dossier.id;
      let totalPiecesCeDossier = 0;
      const detailsDescriptions: string[] = [];
      let sousTypePrincipal = '';
      let sousTypeCode = 'MSTQ_FENETRE';

      dossier.articlesMoustiquaires.forEach(m => {
        const q = Number(m.quantite) || 1;
        totalPiecesCeDossier += q;
        piecesMstqTotal += q;
        mstqCommandesSet.add(ref);

        const classification = this.classifierMoustiquaire(m.typeOuverture, m.articleDesignationCadre || m.articleDesignation || m.articleDesignationCoulisse, m.modele);

        if (classification.cle === 'PORTE_FENETRE') {
          piecesMstqPF += q;
          mstqPFCommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'MSTQ_PORTE_FENETRE';
          }
        } else if (classification.cle === 'FENETRE') {
          piecesMstqFen += q;
          mstqFenCommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'MSTQ_FENETRE';
          }
        } else if (classification.cle === 'DOUBLE_VANTAUX') {
          piecesMstqDV += q;
          mstqDVCommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'MSTQ_DOUBLE_VANTAUX';
          }
        } else if (classification.cle === 'FIXE') {
          piecesMstqFixe += q;
          mstqFixeCommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'MSTQ_FIXE';
          }
        } else {
          piecesMstqAutres += q;
          mstqAutresCommandesSet.add(ref);
          if (!sousTypePrincipal) {
            sousTypePrincipal = classification.label;
            sousTypeCode = 'MSTQ_AUTRE';
          }
        }

        detailsDescriptions.push(`${q}x ${classification.label} (${m.largeur || 0}x${m.hauteur || 0}mm)`);
      });

      const delaiInfo = DelaisProductionService.estimerDelaiDossier(dossier, dossiersActifs, ofsActifs, params);
      const dateLiv = dossier.dateLivraisonPrevisionnelle || delaiInfo.dateLivraisonFormattee;
      const alerteDelai = DelaisProductionService.evaluerStatutDelai(
        dossier.dateLivraisonPrevisionnelle || dateLiv,
        dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        dossier.dateCommande,
        dossier.statut
      );

      const matchingOF = ofsActifs.find(o =>
        (o.numCommande && (o.numCommande === dossier.refCommande || o.numCommande === dossier.numCommandeMoustiquaire)) &&
        o.famille === 'MOUSTIQUAIRE'
      );

      lignesCommandesMstq.push({
        id: `DOS-MSTQ-${dossier.id}`,
        refCommande: dossier.refCommande,
        client: dossier.nomClientFinal || 'Client',
        donneurOrdre: dossier.donneurOrdre || 'Atelier',
        dateCommande: dossier.dateCommande || new Date().toLocaleDateString('fr-FR'),
        famille: 'MOUSTIQUAIRE',
        statutAtelier: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS') : 'EN_ATTENTE_COUPE',
        statutBadgeLabel: matchingOF ? (matchingOF.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)') : 'En Attente Découpe',
        typePrecision: sousTypePrincipal || 'Moustiquaire Plissée',
        sousTypeCle: sousTypeCode,
        detailArticles: detailsDescriptions.join(' • ') || `${totalPiecesCeDossier} moustiquaire(s)`,
        quantiteTotalPieces: totalPiecesCeDossier,
        dateLivraisonPrevisionnelle: dateLiv,
        dateLivraisonPrevisionnelleISO: dossier.dateLivraisonPrevisionnelleISO || delaiInfo.dateLivraisonISO,
        ofCode: matchingOF?.codeOF,
        ofStatut: matchingOF?.statut,
        alerteDelai
      });
    });

    // OFs Moustiquaires autonomes
    ofsActifs.forEach(of => {
      if (of.famille !== 'MOUSTIQUAIRE') return;
      const dejaComptabilise = lignesCommandesMstq.some(l => l.refCommande === of.numCommande);
      if (!dejaComptabilise) {
        const nbP = DelaisProductionService.compterPiecesOF(of);
        const ref = of.numCommande || of.id;
        piecesMstqTotal += nbP;
        mstqCommandesSet.add(ref);

        const classification = this.classifierMoustiquaire(undefined, of.titreSection);
        if (classification.cle === 'PORTE_FENETRE') {
          piecesMstqPF += nbP;
          mstqPFCommandesSet.add(ref);
        } else if (classification.cle === 'FENETRE') {
          piecesMstqFen += nbP;
          mstqFenCommandesSet.add(ref);
        } else if (classification.cle === 'DOUBLE_VANTAUX') {
          piecesMstqDV += nbP;
          mstqDVCommandesSet.add(ref);
        } else if (classification.cle === 'FIXE') {
          piecesMstqFixe += nbP;
          mstqFixeCommandesSet.add(ref);
        } else {
          piecesMstqAutres += nbP;
          mstqAutresCommandesSet.add(ref);
        }

        const delai = DelaisProductionService.estimerDelaiOF(of, ofsActifs, params);
        const dateLiv = of.dateLivraisonPrevisionnelle || delai.texteFormatte;
        const alerteDelai = DelaisProductionService.evaluerStatutDelai(
          dateLiv,
          of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          of.dateEmission,
          of.statut
        );

        lignesCommandesMstq.push({
          id: `OF-MSTQ-${of.id}`,
          refCommande: of.numCommande,
          client: of.nomClient || 'Client',
          donneurOrdre: of.donneurOrdre || 'Atelier',
          dateCommande: of.dateEmission || new Date().toLocaleDateString('fr-FR'),
          famille: 'MOUSTIQUAIRE',
          statutAtelier: of.statut === 'RETOUR_EN_ATTENTE' ? 'RETOUR_SAISI' : 'OF_EMIS',
          statutBadgeLabel: of.statut === 'RETOUR_EN_ATTENTE' ? 'Retour Saisi' : 'OF Émis (En Coupe)',
          typePrecision: classification.label,
          sousTypeCle: classification.codeSousType,
          detailArticles: `${nbP}x ${of.titreSection || 'Moustiquaires'}`,
          quantiteTotalPieces: nbP,
          dateLivraisonPrevisionnelle: dateLiv,
          dateLivraisonPrevisionnelleISO: of.dateLivraisonPrevisionnelleISO || delai.dateLivraisonISO,
          ofCode: of.codeOF,
          ofStatut: of.statut,
          alerteDelai
        });
      }
    });

    const configMstq = params.familles.MOUSTIQUAIRE;
    const capMstq = configMstq.capaciteJournalierePieces || 35;
    const jMstq = piecesMstqTotal > 0 ? Math.max(1, Math.ceil(piecesMstqTotal / capMstq)) : 1;
    const dateFinMstq = DelaisProductionService.ajouterJoursOuvres(dateRef, jMstq, params.joursOuvres);

    const statsMoustiquaires: StatsFamilleMonitoring = {
      famille: 'MOUSTIQUAIRE',
      label: 'Moustiquaires Plissées & Cadres',
      nbCommandesEnCours: mstqCommandesSet.size,
      totalPiecesEnCours: piecesMstqTotal,
      detailsMoustiquaires: {
        porteFenetre: {
          cle: 'PORTE_FENETRE',
          label: 'Porte-Fenêtre',
          nbCommandes: mstqPFCommandesSet.size,
          totalPieces: piecesMstqPF,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqPF / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqPFCommandesSet)
        },
        fenetre: {
          cle: 'FENETRE',
          label: 'Fenêtre (1 Vantail)',
          nbCommandes: mstqFenCommandesSet.size,
          totalPieces: piecesMstqFen,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqFen / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqFenCommandesSet)
        },
        doubleVantaux: {
          cle: 'DOUBLE_VANTAUX',
          label: 'Double Vantaux (Double Vento)',
          nbCommandes: mstqDVCommandesSet.size,
          totalPieces: piecesMstqDV,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqDV / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqDVCommandesSet)
        },
        fixe: {
          cle: 'FIXE',
          label: 'Cadre Fixe',
          nbCommandes: mstqFixeCommandesSet.size,
          totalPieces: piecesMstqFixe,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqFixe / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqFixeCommandesSet)
        },
        autres: {
          cle: 'AUTRE',
          label: 'Autres Moustiquaires',
          nbCommandes: mstqAutresCommandesSet.size,
          totalPieces: piecesMstqAutres,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqAutres / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqAutresCommandesSet)
        }
      },
      detailsGeneriques: [
        {
          cle: 'MSTQ_PORTE_FENETRE',
          label: 'Porte-Fenêtre',
          nbCommandes: mstqPFCommandesSet.size,
          totalPieces: piecesMstqPF,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqPF / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqPFCommandesSet)
        },
        {
          cle: 'MSTQ_FENETRE',
          label: 'Fenêtre',
          nbCommandes: mstqFenCommandesSet.size,
          totalPieces: piecesMstqFen,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqFen / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqFenCommandesSet)
        },
        {
          cle: 'MSTQ_DOUBLE_VANTAUX',
          label: 'Double Vantaux',
          nbCommandes: mstqDVCommandesSet.size,
          totalPieces: piecesMstqDV,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqDV / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqDVCommandesSet)
        },
        {
          cle: 'MSTQ_FIXE',
          label: 'Cadre Fixe',
          nbCommandes: mstqFixeCommandesSet.size,
          totalPieces: piecesMstqFixe,
          pourcentage: piecesMstqTotal > 0 ? Math.round((piecesMstqFixe / piecesMstqTotal) * 100) : 0,
          commandesRefs: Array.from(mstqFixeCommandesSet)
        }
      ],
      capaciteJournaliere: capMstq,
      tempsUnitaireMin: configMstq.tempsUnitaireMinutes || 15,
      chargeHeuresEstimee: Math.round(((piecesMstqTotal * (configMstq.tempsUnitaireMinutes || 15)) / 60) * 10) / 10,
      joursOuvresRequis: jMstq,
      dateLivraisonJusquAu: DelaisProductionService.formaterDateLivraison(dateFinMstq),
      dateFinDate: dateFinMstq,
      tauxOccupationJour: Math.min(100, Math.round((piecesMstqTotal / capMstq) * 100))
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
    const totalChargeHeures = Math.round((chargeHeuresCaisson + chargeHeuresTablier + statsPrecadres.chargeHeuresEstimee + statsMoustiquaires.chargeHeuresEstimee) * 10) / 10;

    // Date maximale d'achèvement de toutes les files
    let dateMaxAtelier = new Date(dateRef);
    if (dateFinCaisson.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = dateFinCaisson;
    if (dateFinTablier.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = dateFinTablier;
    if (dateFinPrecadre.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = dateFinPrecadre;
    if (dateFinMstq.getTime() > dateMaxAtelier.getTime()) dateMaxAtelier = dateFinMstq;

    const allCommandesList: LigneCommandeMonitoring[] = [
      ...lignesCommandesCaissons,
      ...lignesCommandesTabliers,
      ...lignesCommandesPrecadres,
      ...lignesCommandesMstq
    ];

    const totalEnRetard = allCommandesList.filter(c => c.alerteDelai.estDepasse).length;
    const commandesAVerifier = allCommandesList.filter(c => c.alerteDelai.estRetardCritique);
    const totalRetardCritiqueAVerifier = commandesAVerifier.length;

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
      caissons: statsCaissons,
      tabliers: statsTabliers,
      precadres: statsPrecadres,
      moustiquaires: statsMoustiquaires,
      commandesActives: allCommandesList
    };
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
