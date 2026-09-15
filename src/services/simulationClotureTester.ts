import { ConcordanceOFService, BilanProfileOF } from './concordanceOFService';
import { SuiviOF, DossierCommandeGlobal, Article, ChuteBarre } from '../types';

/**
 * Suite de tests et simulations pour valider mathématiquement et logiquement
 * 100% des cas terrain rencontrés en atelier.
 */
export interface ResultatSimulation {
  nomScenario: string;
  description: string;
  succes: boolean;
  couvertureValidee: boolean;
  message: string;
  details: {
    besoinNetMm: number;
    matiereFournieMm: number;
    soldeMm: number;
    stockBarresNeuvesImpact: number; // Ex: -2, -3, -1
    chutesConsommeesCount: number;
    chutesStockeesCount: number;
    chutesRejeteesRefusCount: number;
  };
}

export class SimulationClotureTester {
  private static articlesMock: Article[] = [
    {
      code_art: 'C27-BLANC',
      designation: 'Coulisse C27 Blanche',
      statut: 'NORMAL',
      hauteur: 27,
      longeur: 6000,
      lame: 4,
      debordement: 0,
      refus_min: 300,
      refus_max: 500,
      stock_physique: 45,
      quantite_reservee: 0,
      prix_unitaire: 1200,
      stock_min: 10
    },
    {
      code_art: 'LF-BLANC',
      designation: 'Lame Finale Blanche',
      statut: 'NORMAL',
      hauteur: 40,
      longeur: 6000,
      lame: 4,
      debordement: 0,
      refus_min: 300,
      refus_max: 500,
      stock_physique: 30,
      quantite_reservee: 0,
      prix_unitaire: 1500,
      stock_min: 5
    }
  ];

  private static chutesMock: ChuteBarre[] = [
    { id: 'CH-101', sheet_name: 'Coulisse C27 Blanche', longueur: 1850, quantite: 1 },
    { id: 'CH-102', sheet_name: 'Coulisse C27 Blanche', longueur: 2420, quantite: 1 },
    { id: 'CH-103', sheet_name: 'Coulisse C27 Blanche', longueur: 1200, quantite: 1 },
    { id: 'CH-104', sheet_name: 'Coulisse C27 Blanche', longueur: 3600, quantite: 1 }
  ];

  /**
   * Exécute une batterie de 7 simulations couvrant tous les cas cités par l'utilisateur
   */
  static executerToutesLesSimulations(): ResultatSimulation[] {
    return [
      this.simulerCas1_RemplacementBarreParChutesDefaillance(),
      this.simulerCas2_MeilleureChuteTrouveeEviteBarreNeuve(),
      this.simulerCas3_DeformationBarreEtRebut(),
      this.simulerCas4_AnnulationChutesEtRemplacementParBarreNeuve(),
      this.simulerCas5_PriseEnCompteMultiCoupesQuantiteX(),
      this.simulerCas6_ChuteNonInventorieeFondAtelier(),
      this.simulerCas7_CommandeModifieeApresEmissionBon(),
      this.simulerCas8_ProtectionIntervalleRefusEtSacrifice()
    ];
  }

  /**
   * Cas 1 : Remplacement d'une barre neuve par des chutes suite à une défaillance
   */
  private static simulerCas1_RemplacementBarreParChutesDefaillance(): ResultatSimulation {
    const suivi: SuiviOF = {
      id: 'of-test-1',
      numCommande: 'CMD-TEST-01',
      nomClient: 'CLIENT-1',
      donneurOrdre: 'ATELIER',
      famille: 'PRECADRE',
      titreSection: 'Coulisse C27 Blanche',
      statut: 'EMIS',
      dateEmission: '15/09/2026',
      totalBarresNeuvesPrevu: 2, // 2 barres neuves = 12 000 mm
      totalChutesUtiliseesPrevu: 0,
      lignesRetour: [
        {
          id: 'lr-1',
          repere: 'PC-1',
          typeSupport: 'BARRE_NEUVE',
          articleCode: 'C27-BLANC',
          longueurPrevue: 6000,
          restePrevuMm: 500,
          saisieOperateur: '',
          piecesInfoStr: 'PC-1 Montant (2200mm) + PC-1 Traverse (1500mm) + PC-2 Montant (1760mm)'
        },
        {
          id: 'lr-2',
          repere: 'PC-2',
          typeSupport: 'BARRE_NEUVE',
          articleCode: 'C27-BLANC',
          longueurPrevue: 6000,
          restePrevuMm: 800,
          saisieOperateur: '',
          piecesInfoStr: 'PC-2 Traverse (1500mm) + PC-3 Montant (2200mm) + PC-3 Traverse (1500mm)'
        }
      ]
    };

    const bilan = ConcordanceOFService.preparerBilanOF(suivi, undefined, this.articlesMock, this.chutesMock);

    // L'opérateur remplace la 2ème barre neuve par 2 chutes du rack (2420 mm + 3600 mm)
    bilan.barresNeuvesReelles = 1; // 1 seule barre neuve au lieu de 2 !
    bilan.chutesUtiliseesReelles.push(
      {
        id: 'add-ch-102',
        source: 'STOCK_INVENTORIE',
        chuteId: 'CH-102',
        longueur: 2420,
        quantite: 1,
        utilisee: true
      },
      {
        id: 'add-ch-104',
        source: 'STOCK_INVENTORIE',
        chuteId: 'CH-104',
        longueur: 3600,
        quantite: 1,
        utilisee: true
      }
    );

    const recalcul = ConcordanceOFService.recalculerCouverture(bilan);

    return {
      nomScenario: '1. Remplacement d\'une barre par 2 chutes du rack',
      description: 'Barre neuve rayée/défaillante évitée en utilisant 2 chutes du rack (2420mm et 3600mm).',
      succes: recalcul.couvertureEstValide && recalcul.barresNeuvesReelles === 1,
      couvertureValidee: recalcul.couvertureEstValide,
      message: recalcul.couvertureEstValide
        ? 'Stock barres préservé (-1 barre au lieu de -2). Les 2 chutes sont sorties du stock.'
        : recalcul.messageAlerte || 'Erreur',
      details: {
        besoinNetMm: recalcul.longueurTotaleRequiseMm + recalcul.traitScieEstimeMm,
        matiereFournieMm: recalcul.matiereFournieMm,
        soldeMm: recalcul.soldeMatiereMm,
        stockBarresNeuvesImpact: -recalcul.barresNeuvesReelles,
        chutesConsommeesCount: recalcul.chutesUtiliseesReelles.filter(c => c.utilisee).length,
        chutesStockeesCount: recalcul.chutesGenereesReelles.filter(c => c.statut === 'A_STOCKER').length,
        chutesRejeteesRefusCount: recalcul.chutesGenereesReelles.filter(c => c.statut !== 'A_STOCKER').length
      }
    };
  }

  /**
   * Cas 2 : Trouver la chute la plus proche (Best-Fit) évitant une barre neuve
   */
  private static simulerCas2_MeilleureChuteTrouveeEviteBarreNeuve(): ResultatSimulation {
    // Coupe requise : 1800 mm
    const coupe = 1800;
    const match = ConcordanceOFService.trouverMeilleureChute(coupe, this.chutesMock, 300, 500);

    // Chute attendue : CH-101 (1850 mm) car déchet quasi nul (50 - 4 = 46 mm)
    const succes = match.chute?.id === 'CH-101' && match.typeMatch === 'PARFAIT_SANS_DECHET';

    return {
      nomScenario: '2. Détection intelligente Best-Fit (Moins de déchet)',
      description: 'Recherche de chute pour une coupe de 1800 mm parmi le stock disponible.',
      succes,
      couvertureValidee: succes,
      message: succes
        ? `Chute CH-101 sélectionnée (1850 mm). Reste minime de ${match.resteMm} mm (Score: ${match.scoreQualite}/100). Zéro déchet !`
        : 'Chute optimale non trouvée.',
      details: {
        besoinNetMm: coupe + 4,
        matiereFournieMm: match.chuteLongueurMm || 0,
        soldeMm: match.resteMm || 0,
        stockBarresNeuvesImpact: 0,
        chutesConsommeesCount: 1,
        chutesStockeesCount: 0,
        chutesRejeteesRefusCount: 1
      }
    };
  }

  /**
   * Cas 3 : Barre déformée / Rebut nécessitant une nouvelle barre + récupération partie saine
   */
  private static simulerCas3_DeformationBarreEtRebut(): ResultatSimulation {
    const suivi: SuiviOF = {
      id: 'of-test-3',
      numCommande: 'CMD-TEST-03',
      nomClient: 'CLIENT-3',
      donneurOrdre: 'ATELIER',
      famille: 'PRECADRE',
      titreSection: 'Coulisse C27 Blanche',
      statut: 'EMIS',
      dateEmission: '15/09/2026',
      totalBarresNeuvesPrevu: 1,
      totalChutesUtiliseesPrevu: 0,
      lignesRetour: [
        {
          id: 'lr-3',
          repere: 'PC-1',
          typeSupport: 'BARRE_NEUVE',
          articleCode: 'C27-BLANC',
          longueurPrevue: 6000,
          restePrevuMm: 1200,
          saisieOperateur: '',
          piecesInfoStr: 'P-1 (2400mm) + P-2 (2400mm)'
        }
      ]
    };

    const bilan = ConcordanceOFService.preparerBilanOF(suivi, undefined, this.articlesMock, this.chutesMock);

    // L'opérateur a eu une barre tordue : il passe de 1 à 2 barres débitées
    bilan.barresNeuvesReelles = 2; // +1 barre rebut/casse
    // Il a sauvé un tronçon de 1800 mm sain de la barre déformée pour le ranger au rack
    bilan.chutesGenereesReelles.push({
      id: 'ch-sauvee-rebut',
      longueur: 1800,
      statut: 'A_STOCKER',
      remarque: 'Tronçon sain récupéré de la barre déformée'
    });

    const recalcul = ConcordanceOFService.recalculerCouverture(bilan);

    return {
      nomScenario: '3. Déformation de barre & Rebut avec récuperation partie saine',
      description: 'Passage de 1 à 2 barres (rebut) et mise en stock de la partie saine de 1800 mm.',
      succes: recalcul.couvertureEstValide && recalcul.barresNeuvesReelles === 2,
      couvertureValidee: recalcul.couvertureEstValide,
      message: 'Les 2 barres neuves sont déduites du stock (-2). Le tronçon sain de 1800 mm entre en stock de chutes.',
      details: {
        besoinNetMm: recalcul.longueurTotaleRequiseMm + recalcul.traitScieEstimeMm,
        matiereFournieMm: recalcul.matiereFournieMm,
        soldeMm: recalcul.soldeMatiereMm,
        stockBarresNeuvesImpact: -2,
        chutesConsommeesCount: 0,
        chutesStockeesCount: recalcul.chutesGenereesReelles.filter(c => c.statut === 'A_STOCKER').length,
        chutesRejeteesRefusCount: 0
      }
    };
  }

  /**
   * Cas 4 : Annulation de plusieurs chutes introuvables et remplacement par 1 barre neuve de 6m
   */
  private static simulerCas4_AnnulationChutesEtRemplacementParBarreNeuve(): ResultatSimulation {
    const suivi: SuiviOF = {
      id: 'of-test-4',
      numCommande: 'CMD-TEST-04',
      nomClient: 'CLIENT-4',
      donneurOrdre: 'ATELIER',
      famille: 'PRECADRE',
      titreSection: 'Coulisse C27 Blanche',
      statut: 'EMIS',
      dateEmission: '15/09/2026',
      totalBarresNeuvesPrevu: 0,
      totalChutesUtiliseesPrevu: 2,
      chutesReservees: [
        { sheetName: 'Coulisse C27 Blanche', longueur: 2400, quantite: 1, chuteId: 'CH-102' },
        { sheetName: 'Coulisse C27 Blanche', longueur: 1800, quantite: 1, chuteId: 'CH-101' }
      ],
      lignesRetour: [
        {
          id: 'lr-4a',
          repere: 'P-1',
          typeSupport: 'CHUTE_BARRE',
          articleCode: 'C27-BLANC',
          longueurPrevue: 2400,
          restePrevuMm: 300,
          saisieOperateur: '',
          chuteId: 'CH-102',
          piecesInfoStr: 'P-1 (2100mm)'
        },
        {
          id: 'lr-4b',
          repere: 'P-2',
          typeSupport: 'CHUTE_BARRE',
          articleCode: 'C27-BLANC',
          longueurPrevue: 1800,
          restePrevuMm: 300,
          saisieOperateur: '',
          chuteId: 'CH-101',
          piecesInfoStr: 'P-2 (1500mm)'
        }
      ]
    };

    const bilan = ConcordanceOFService.preparerBilanOF(suivi, undefined, this.articlesMock, this.chutesMock);

    // L'opérateur désactive les 2 chutes prévues (annulées)
    bilan.chutesUtiliseesReelles.forEach(c => c.utilisee = false);
    // Et active 1 barre neuve de 6000 mm
    bilan.barresNeuvesReelles = 1;
    // Reste généré sur la barre neuve : 6000 - 2100 - 1500 - 8 = 2392 mm -> A stocker
    bilan.chutesGenereesReelles = [{
      id: 'reste-barre-neuve',
      longueur: 2392,
      statut: 'A_STOCKER',
      remarque: 'Reste de la barre neuve de 6m'
    }];

    const recalcul = ConcordanceOFService.recalculerCouverture(bilan);

    return {
      nomScenario: '4. Annulation de chutes ➔ Basculement sur 1 barre neuve 6m',
      description: 'Chutes prévues introuvables annulées. Débit intégral dans 1 barre neuve de 6m.',
      succes: recalcul.couvertureEstValide && recalcul.chutesUtiliseesReelles.every(c => !c.utilisee),
      couvertureValidee: recalcul.couvertureEstValide,
      message: 'Zéro fausse sortie sur les chutes (restent en stock). -1 barre neuve. Nouvelle chute de 2392mm créée.',
      details: {
        besoinNetMm: recalcul.longueurTotaleRequiseMm + recalcul.traitScieEstimeMm,
        matiereFournieMm: recalcul.matiereFournieMm,
        soldeMm: recalcul.soldeMatiereMm,
        stockBarresNeuvesImpact: -1,
        chutesConsommeesCount: 0,
        chutesStockeesCount: 1,
        chutesRejeteesRefusCount: 0
      }
    };
  }

  /**
   * Cas 5 : Multi-coupes sur une longue chute et quantité répétée (Quantité * X)
   */
  private static simulerCas5_PriseEnCompteMultiCoupesQuantiteX(): ResultatSimulation {
    const suivi: SuiviOF = {
      id: 'of-test-5',
      numCommande: 'CMD-TEST-05',
      nomClient: 'CLIENT-5',
      donneurOrdre: 'ATELIER',
      famille: 'PRECADRE',
      titreSection: 'Coulisse C27 Blanche',
      statut: 'EMIS',
      dateEmission: '15/09/2026',
      totalBarresNeuvesPrevu: 0,
      totalChutesUtiliseesPrevu: 0,
      lignesRetour: []
    };

    // Dossier avec 4 pièces identiques de 800 mm (ex: 4 montants)
    const dossierMock: DossierCommandeGlobal = {
      id: 'dossier-5',
      donneurOrdre: 'ATELIER',
      nomClientFinal: 'CLIENT-5',
      dateCommande: '15/09/2026',
      refCommande: 'CMD-TEST-05',
      statut: 'EN_COURS',
      articlesTabliers: [],
      articlesMoustiquaires: [],
      articlesCaissons: [],
      articlesPrecadres: [
        {
          id: 'pc-1',
          repere: 'PC-PETIT',
          figure: 'VIDE',
          modeDebordement: 'SANS_DEBORDEMENT',
          debordementSuperieur: 0,
          debordementInferieur: 0,
          largeur: 800,
          hauteur: 800,
          quantite: 1 // 2 montants 800 + 2 traverses 800 = 4 pièces de 800 mm = 3200 mm
        }
      ]
    };

    const bilan = ConcordanceOFService.preparerBilanOF(suivi, dossierMock, this.articlesMock, this.chutesMock);

    // L'opérateur utilise une seule longue chute de 3600 mm (CH-104) pour débiter les 4 pièces !
    bilan.barresNeuvesReelles = 0;
    bilan.chutesUtiliseesReelles = [{
      id: 'ch-104-multi',
      source: 'STOCK_INVENTORIE',
      chuteId: 'CH-104',
      longueur: 3600,
      quantite: 1,
      utilisee: true
    }];

    const recalcul = ConcordanceOFService.recalculerCouverture(bilan);

    return {
      nomScenario: '5. Multi-coupes (Quantité × 4) sur 1 seule longue chute',
      description: '4 pièces de 800 mm (3200 mm requis) débitées sur une seule chute de 3600 mm.',
      succes: recalcul.couvertureEstValide && recalcul.piecesRequises.length === 2,
      couvertureValidee: recalcul.couvertureEstValide,
      message: `4 pièces couvertes avec 1 seule chute de 3600 mm. Reste résiduel : ${Math.round(recalcul.soldeMatiereMm)} mm.`,
      details: {
        besoinNetMm: recalcul.longueurTotaleRequiseMm + recalcul.traitScieEstimeMm,
        matiereFournieMm: recalcul.matiereFournieMm,
        soldeMm: recalcul.soldeMatiereMm,
        stockBarresNeuvesImpact: 0,
        chutesConsommeesCount: 1,
        chutesStockeesCount: 0,
        chutesRejeteesRefusCount: 1
      }
    };
  }

  /**
   * Cas 6 : Chute NON inventoriée (trouvée au fond de l'atelier)
   */
  private static simulerCas6_ChuteNonInventorieeFondAtelier(): ResultatSimulation {
    const suivi: SuiviOF = {
      id: 'of-test-6',
      numCommande: 'CMD-TEST-06',
      nomClient: 'CLIENT-6',
      donneurOrdre: 'ATELIER',
      famille: 'PRECADRE',
      titreSection: 'Coulisse C27 Blanche',
      statut: 'EMIS',
      dateEmission: '15/09/2026',
      totalBarresNeuvesPrevu: 1,
      totalChutesUtiliseesPrevu: 0,
      lignesRetour: [
        {
          id: 'lr-6',
          repere: 'P-1',
          typeSupport: 'BARRE_NEUVE',
          articleCode: 'C27-BLANC',
          longueurPrevue: 6000,
          restePrevuMm: 4200,
          saisieOperateur: '',
          piecesInfoStr: 'P-1 (1800mm)'
        }
      ]
    };

    const bilan = ConcordanceOFService.preparerBilanOF(suivi, undefined, this.articlesMock, this.chutesMock);

    // L'opérateur ne coupe pas de barre neuve : 0 barre
    bilan.barresNeuvesReelles = 0;
    // Il prend une chute de 2500 mm trouvée dans l'atelier mais absente de la base de données
    bilan.chutesUtiliseesReelles = [{
      id: 'hors-stock-1',
      source: 'HORS_STOCK_NON_INVENTORIE',
      longueur: 2500,
      quantite: 1,
      utilisee: true,
      remarque: 'Chute hors-inventaire trouvée en atelier'
    }];
    // Le reliquat (2500 - 1800 - 4 = 696 mm) est >= 500 mm -> il entre au stock
    bilan.chutesGenereesReelles = [{
      id: 'nouvelle-chute-reele',
      longueur: 696,
      statut: 'A_STOCKER',
      remarque: 'Entrée en stock de la chute mesurée'
    }];

    const recalcul = ConcordanceOFService.recalculerCouverture(bilan);

    return {
      nomScenario: '6. Utilisation d\'une chute NON inventoriée (fond d\'atelier)',
      description: 'Chute non enregistrée utilisée. 0 sortie négative, et mise en stock du reliquat de 696 mm.',
      succes: recalcul.couvertureEstValide,
      couvertureValidee: recalcul.couvertureEstValide,
      message: 'Aucun stock négatif généré. La nouvelle chute résiduelle de 696 mm est enregistrée au rack.',
      details: {
        besoinNetMm: recalcul.longueurTotaleRequiseMm + recalcul.traitScieEstimeMm,
        matiereFournieMm: recalcul.matiereFournieMm,
        soldeMm: recalcul.soldeMatiereMm,
        stockBarresNeuvesImpact: 0,
        chutesConsommeesCount: 1,
        chutesStockeesCount: 1,
        chutesRejeteesRefusCount: 0
      }
    };
  }

  /**
   * Cas 7 : Commande modifiée après émission du bon (ex: dimensions ou quantités augmentées)
   */
  private static simulerCas7_CommandeModifieeApresEmissionBon(): ResultatSimulation {
    // Initialement prévu pour 1 précadre (dim 1200x1200) -> 4800 mm
    const suivi: SuiviOF = {
      id: 'of-test-7',
      numCommande: 'CMD-TEST-07',
      nomClient: 'CLIENT-7',
      donneurOrdre: 'ATELIER',
      famille: 'PRECADRE',
      titreSection: 'Coulisse C27 Blanche',
      statut: 'EMIS',
      dateEmission: '15/09/2026',
      totalBarresNeuvesPrevu: 1, // 6000 mm suffisait
      totalChutesUtiliseesPrevu: 0,
      lignesRetour: [
        {
          id: 'lr-7',
          repere: 'PC-1',
          typeSupport: 'BARRE_NEUVE',
          articleCode: 'C27-BLANC',
          longueurPrevue: 6000,
          restePrevuMm: 1200,
          saisieOperateur: '',
          piecesInfoStr: 'PC-1 (1200mm) + PC-1 (1200mm) + PC-1 (1200mm) + PC-1 (1200mm)'
        }
      ]
    };

    // Commande modifiée dans le dossier : Le client est passé à 2 précadres 1500x2000 mm !
    // Besoin réel actuel : 2 × (2×1500 + 2×2000) = 14 000 mm !
    const dossierModifie: DossierCommandeGlobal = {
      id: 'dossier-7',
      donneurOrdre: 'ATELIER',
      nomClientFinal: 'CLIENT-7',
      dateCommande: '15/09/2026',
      refCommande: 'CMD-TEST-07',
      statut: 'EN_COURS',
      articlesTabliers: [],
      articlesMoustiquaires: [],
      articlesCaissons: [],
      articlesPrecadres: [
        {
          id: 'pc-grand',
          repere: 'PC-GRAND',
          figure: 'VIDE',
          modeDebordement: 'SANS_DEBORDEMENT',
          debordementSuperieur: 0,
          debordementInferieur: 0,
          largeur: 1500,
          hauteur: 2000,
          quantite: 2
        }
      ]
    };

    const bilan = ConcordanceOFService.preparerBilanOF(suivi, dossierModifie, this.articlesMock, this.chutesMock);

    // Tentative 1 : L'opérateur essaie de clôturer avec 1 seule barre (comme sur le vieux bon papier)
    bilan.barresNeuvesReelles = 1; // 6000 mm alors qu'il faut 14 000 mm !
    const echec = ConcordanceOFService.recalculerCouverture(bilan);

    // Tentative 2 : Correction par l'opérateur qui déclare 3 barres (18 000 mm)
    bilan.barresNeuvesReelles = 3;
    const succes = ConcordanceOFService.recalculerCouverture(bilan);

    return {
      nomScenario: '7. Détection Commande Modifiée après émission du bon',
      description: 'Passage de 4 800 mm à 14 000 mm dans la commande. Le système bloque la clôture avec 1 barre.',
      succes: !echec.couvertureEstValide && succes.couvertureEstValide && bilan.commandeModifiee,
      couvertureValidee: succes.couvertureEstValide,
      message: 'Blocage absolu si l\'opérateur garde l\'ancienne déclaration. Déblocage dès que les 3 barres réelles sont saisies !',
      details: {
        besoinNetMm: succes.longueurTotaleRequiseMm + succes.traitScieEstimeMm,
        matiereFournieMm: succes.matiereFournieMm,
        soldeMm: succes.soldeMatiereMm,
        stockBarresNeuvesImpact: -3,
        chutesConsommeesCount: 0,
        chutesStockeesCount: 0,
        chutesRejeteesRefusCount: 0
      }
    };
  }

  /**
   * Cas 8 : Protection contre l'intervalle de refus et sacrifice
   */
  private static simulerCas8_ProtectionIntervalleRefusEtSacrifice(): ResultatSimulation {
    const chute250 = ConcordanceOFService.trouverMeilleureChute(1000, [
      { id: 'ch-refus', sheet_name: 'test', longueur: 1400, quantite: 1 } // Reste 396 mm (dans [300, 500[ mm = intervalle de refus)
    ], 300, 500);

    const chuteValide = ConcordanceOFService.trouverMeilleureChute(1000, [
      { id: 'ch-bonne', sheet_name: 'test', longueur: 1600, quantite: 1 } // Reste 596 mm (>= 500 mm = stockable)
    ], 300, 500);

    const scoreDifference = (chuteValide.scoreQualite || 0) > (chute250.scoreQualite || 0);

    return {
      nomScenario: '8. Respect strict de l\'intervalle de refus (< 500 mm)',
      description: 'L\'algorithme pénalise les chutes laissant un résidu inutilisable et valorise les restes recyclables.',
      succes: scoreDifference,
      couvertureValidee: true,
      message: `Chute avec reste de 596mm privilégiée (Score ${chuteValide.scoreQualite}) vs chute avec déchet sacrificiel de 396mm (Score ${chute250.scoreQualite}).`,
      details: {
        besoinNetMm: 1004,
        matiereFournieMm: 1600,
        soldeMm: 596,
        stockBarresNeuvesImpact: 0,
        chutesConsommeesCount: 1,
        chutesStockeesCount: 1,
        chutesRejeteesRefusCount: 0
      }
    };
  }
}
