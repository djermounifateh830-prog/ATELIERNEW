import {
  Article,
  ChuteBarre,
  DossierCommandeGlobal,
  SuiviOF,
  MouvementStock,
  LigneRetourOF
} from '../types';

/**
 * Pièce requise issue de la commande en temps réel
 */
export interface PieceRequiseCommande {
  repere: string;
  longueur: number;
  quantite: number;
  label: string;
  largeur?: number;
  hauteur?: number;
  articleCode?: string;
  articleDesignation?: string;
}

/**
 * Synthèse d'un profilé / article pour un OF et sa commande
 */
export interface BilanProfileOF {
  articleCode: string;
  articleDesignation: string;
  sheetName: string; // Nom de la feuille de chute associée
  longueurBarreStandard: number; // 6000 mm en général
  refusMin: number; // 300 mm
  refusMax: number; // 500 mm (seuil pour stockage chute)

  // 1. Besoin réel actuel selon la commande
  piecesRequises: PieceRequiseCommande[];
  longueurTotaleRequiseMm: number;
  nbPiecesTotal: number;
  commandeModifiee: boolean;
  deltaLongueurVsEmissionMm: number; // Différence par rapport à ce qui était prévu à l'émission de l'OF

  // 2. Ce qui était initialement prévu sur l'OF émis
  barresNeuvesPrevue: number;
  chutesPrevue: {
    chuteId?: string;
    longueur: number;
    quantite: number;
    sheetName: string;
  }[];

  // 3. Déclaration réelle par l'opérateur (état courant du cockpit)
  barresNeuvesReelles: number;
  chutesUtiliseesReelles: ChuteUtiliseeDeclaration[];
  chutesGenereesReelles: ChuteGenereeDeclaration[];

  // 4. Calcul de concordance & couverture
  matiereFournieMm: number; // (barres * longueur) + sum(chutes utilisées)
  matiereConsommeeNetteMm: number; // matière fournie - sum(chutes générées stockées)
  traitScieEstimeMm: number; // nb_pieces * 4 mm
  soldeMatiereMm: number; // matière fournie - (besoin + traits de scie)
  couvertureEstValide: boolean; // matière fournie >= besoin + traits de scie
  messageAlerte?: string;
}

export interface ChuteUtiliseeDeclaration {
  id: string; // Id local ou id chute base
  source: 'PREVUE' | 'STOCK_INVENTORIE' | 'HORS_STOCK_NON_INVENTORIE';
  chuteId?: string; // Si inventoriée dans la base
  longueur: number;
  quantite: number; // En général 1, ou X si plusieurs identiques
  designation?: string;
  utilisee: boolean; // Si fausse, la chute prévue est annulée et ne sort pas du stock
  remarque?: string;
}

export interface ChuteGenereeDeclaration {
  id: string;
  longueur: number;
  statut: 'A_STOCKER' | 'DECHET_INTERVALLE_REFUS' | 'DECHET_PUR';
  remarque?: string;
}

/**
 * Structure d'un profilé dans le Cockpit Éclair (Approche par Exception)
 */
export interface ProfilBilanCockpit {
  articleCode: string;
  articleDesignation: string;
  sheetName: string;
  longueurStandard: number;
  refusMin: number;
  refusMax: number;

  // Ce qui était prévu à l'optimisation
  barresNeuvesPrevues: number;
  chutesUtiliseesPrevues: Array<{
    id: string;
    chuteId?: string;
    longueur: number;
    resteTheorique: number;
    repere: string;
    piecesInfoStr?: string;
  }>;
  chutesGenereesPrevues: Array<{
    id: string;
    longueur: number;
    statut: 'A_STOCKER' | 'DECHET';
    sourceRepere: string;
  }>;

  // Ce qui est réellement constaté et modifiable en 1 clic
  barresNeuvesReelles: number;
  barresRebut: number;
  chutesUtiliseesReelles: Array<{
    id: string;
    chuteId?: string;
    longueur: number;
    utilisee: boolean;
    motifNonUtilisation?: 'INTROUVABLE_SUPPRIMER' | 'REMPLACEE_GARDER_AU_STOCK';
    source: 'PREVUE' | 'STOCK_INVENTORIE' | 'HORS_STOCK';
    repere: string;
    remarque?: string;
  }>;
  chutesGenereesReelles: Array<{
    id: string;
    longueur: number;
    quantite?: number; // Nombre de pièces réelles à ranger au rack
    statut?: 'A_STOCKER' | 'DECHET';
    sourceRepere?: string;
    remarque?: string;
    modifieeManuellement?: boolean;
  }>;
}

/**
 * Accessoire magasin associé à l'OF (quincaillerie, embouts, tulipes)
 */
export interface AccessoireBilanCockpit {
  id: string;
  codeArt: string;
  designation: string;
  quantitePrevue: number;
  quantiteReelle: number;
  unite: string;
  cochee: boolean;
  piecesInfoStr?: string;
}

/**
 * Bilan global Multi-Profilés & Accessoires du Cockpit Éclair
 */
export interface BilanCockpitOF {
  ofId: string;
  codeOF: string;
  numCommande: string;
  nomClient: string;
  donneurOrdre: string;
  famille: string;
  titreSection: string;
  dateEmission: string;
  profils: ProfilBilanCockpit[];
  accessoires: AccessoireBilanCockpit[];
  estConformeAuPlan: boolean;
  nbAjustements: number;
}

/**
 * Service de calcul de concordance et moteur de validation
 */
export class ConcordanceOFService {
  /**
   * Extrait les pièces requises réelles pour un profilé à partir du dossier de commande courant
   */
  static extrairePiecesReellesCommande(
    dossier: DossierCommandeGlobal | undefined,
    suivi: SuiviOF
  ): PieceRequiseCommande[] {
    if (!dossier) {
      // Si pas de dossier, on extrait à partir des lignesRetour de l'OF
      return this.extrairePiecesDepuisOF(suivi);
    }

    const pieces: PieceRequiseCommande[] = [];
    const famille = suivi.famille;

    if (famille === 'PRECADRE' && Array.isArray(dossier.articlesPrecadres)) {
      dossier.articlesPrecadres.forEach((cp, idx) => {
        const qte = cp.quantite || 1;
        const l = cp.largeur || 0;
        const h = cp.hauteur || 0;
        const repere = cp.repere || `PC-${idx + 1}`;

        // 2 Montants (Hauteur) + 2 Traverses (Largeur)
        if (h > 0) {
          pieces.push({
            repere: `${repere} Montant`,
            longueur: h,
            quantite: 2 * qte,
            label: `Montant Précadre ${repere}`,
            largeur: l,
            hauteur: h
          });
        }
        if (l > 0) {
          pieces.push({
            repere: `${repere} Traverse`,
            longueur: l,
            quantite: 2 * qte,
            label: `Traverse Précadre ${repere}`,
            largeur: l,
            hauteur: h
          });
        }
      });
    } else if (famille === 'TABLIER' && Array.isArray(dossier.articlesTabliers)) {
      dossier.articlesTabliers.forEach((tab, idx) => {
        const qte = tab.quantite || 1;
        const l = tab.largeur || 0;
        const repere = tab.repere || `TAB-${idx + 1}`;

        // Si la section concerne la lame finale ou coulisse
        const titreLow = (suivi.titreSection || '').toLowerCase();
        if (titreLow.includes('coulisse')) {
          const h = tab.hauteur || 0;
          if (h > 0) {
            pieces.push({
              repere: `${repere} Coulisse`,
              longueur: h,
              quantite: 2 * qte,
              label: `Coulisse ${repere}`
            });
          }
        } else {
          // Lames ou Lame finale
          if (l > 0) {
            pieces.push({
              repere: `${repere} Lame/Profil`,
              longueur: l,
              quantite: qte,
              label: `Profil ${repere}`
            });
          }
        }
      });
    } else if (famille === 'MOUSTIQUAIRE' && Array.isArray(dossier.articlesMoustiquaires)) {
      dossier.articlesMoustiquaires.forEach((mstq, idx) => {
        const qte = mstq.quantite || 1;
        const l = mstq.largeur || 0;
        const h = mstq.hauteur || 0;
        const repere = mstq.repere || `MSTQ-${idx + 1}`;

        if (h > 0) {
          pieces.push({
            repere: `${repere} Montant`,
            longueur: h,
            quantite: 2 * qte,
            label: `Montant Moustiquaire ${repere}`
          });
        }
        if (l > 0) {
          pieces.push({
            repere: `${repere} Traverse`,
            longueur: l,
            quantite: 2 * qte,
            label: `Traverse Moustiquaire ${repere}`
          });
        }
      });
    } else if (famille === 'CAISSON' && Array.isArray(dossier.articlesCaissons)) {
      dossier.articlesCaissons.forEach((caiss, idx) => {
        const qte = caiss.quantite || 1;
        const l = caiss.longueur || 0;
        const repere = caiss.repere || `CS-${idx + 1}`;
        if (l > 0) {
          pieces.push({
            repere: `${repere} Profil Caisson`,
            longueur: l,
            quantite: qte,
            label: `Profil Caisson ${repere}`
          });
        }
      });
    }

    // Si aucune pièce trouvée dans le dossier (ou structure différente), fallback sur l'OF
    if (pieces.length === 0) {
      return this.extrairePiecesDepuisOF(suivi);
    }

    return pieces;
  }

  /**
   * Extraction de secours depuis les lignesRetour de l'OF émis
   */
  static extrairePiecesDepuisOF(suivi: SuiviOF): PieceRequiseCommande[] {
    const pieces: PieceRequiseCommande[] = [];
    const map = new Map<string, PieceRequiseCommande>();

    suivi.lignesRetour.forEach((lr, idx) => {
      if (lr.piecesInfoStr) {
        // Ex: "CT-1 (2100mm) + CT-2 (1500mm)" ou "PC-1 Montant (2200mm)"
        const parts = lr.piecesInfoStr.split('+');
        parts.forEach(p => {
          const m = p.match(/(.*?)\((\d+)\s*mm\)/i);
          if (m) {
            const rep = m[1].trim();
            const len = parseInt(m[2], 10);
            const key = `${rep}_${len}`;
            if (map.has(key)) {
              map.get(key)!.quantite += 1;
            } else {
              const item: PieceRequiseCommande = {
                repere: rep || `P-${idx + 1}`,
                longueur: len,
                quantite: 1,
                label: rep
              };
              map.set(key, item);
              pieces.push(item);
            }
          }
        });
      }
    });

    return pieces;
  }

  /**
   * Construit le Bilan Matière complet pour un OF donné en analysant le dossier et les stocks
   */
  static preparerBilanOF(
    suivi: SuiviOF,
    dossier: DossierCommandeGlobal | undefined,
    articles: Article[],
    chutesStock: ChuteBarre[] = [],
    mapping: Record<string, string> = {}
  ): BilanProfileOF {
    // 1. Détection de l'article principal concerné
    const articleCode = suivi.barresReservees?.[0]?.codeArt ||
      suivi.lignesRetour?.[0]?.articleCode ||
      '';
    const article = articles.find(a => a.code_art === articleCode) || articles.find(a => (suivi.titreSection || '').includes(a.designation));

    const designation = article?.designation || suivi.titreSection || 'Profilé Aluminium';
    const sheetName = (article?.code_art && mapping[article.code_art]) || article?.designation || designation;
    const longueurStandard = article?.longeur || 6000;
    const refusMin = article?.refus_min ?? 300;
    const refusMax = article?.refus_max ?? 500;

    // 2. Pièces réelles de la commande
    const piecesRequises = this.extrairePiecesReellesCommande(dossier, suivi);
    const longueurTotaleRequiseMm = piecesRequises.reduce((sum, p) => sum + (p.longueur * p.quantite), 0);
    const nbPiecesTotal = piecesRequises.reduce((sum, p) => sum + p.quantite, 0);

    // 3. Ce qui était initialement prévu à l'émission de l'OF
    const barresNeuvesPrevue = suivi.totalBarresNeuvesPrevu ??
      suivi.lignesRetour.filter(l => l.typeSupport === 'BARRE_NEUVE').length ?? 0;

    const chutesPrevue: BilanProfileOF['chutesPrevue'] = [];
    if (Array.isArray(suivi.chutesReservees) && suivi.chutesReservees.length > 0) {
      suivi.chutesReservees.forEach(cr => {
        chutesPrevue.push({
          chuteId: cr.chuteId,
          longueur: cr.longueur,
          quantite: cr.quantite,
          sheetName: cr.sheetName
        });
      });
    } else {
      suivi.lignesRetour
        .filter(l => l.typeSupport === 'CHUTE_BARRE')
        .forEach(l => {
          chutesPrevue.push({
            chuteId: l.chuteId,
            longueur: l.longueurPrevue || 0,
            quantite: 1,
            sheetName
          });
        });
    }

    const longueurPrevueInitiale = (barresNeuvesPrevue * longueurStandard) +
      chutesPrevue.reduce((s, c) => s + (c.longueur * c.quantite), 0);

    const deltaLongueurVsEmissionMm = longueurTotaleRequiseMm - longueurPrevueInitiale;
    const commandeModifiee = Math.abs(deltaLongueurVsEmissionMm) > 20;

    // 4. Initialisation des déclarations réelles
    const chutesUtiliseesReelles: ChuteUtiliseeDeclaration[] = chutesPrevue.map((cp, idx) => ({
      id: `prevue-${idx}-${cp.chuteId || Date.now()}`,
      source: 'PREVUE',
      chuteId: cp.chuteId,
      longueur: cp.longueur,
      quantite: cp.quantite,
      designation: `Chute prévue #${cp.chuteId || idx + 1} (${cp.longueur} mm)`,
      utilisee: true
    }));

    // Chutes générées calculées selon le plan d'origine
    const chutesGenereesReelles: ChuteGenereeDeclaration[] = [];
    suivi.lignesRetour.forEach((lr, idx) => {
      const reste = lr.resteReelMesureMm ?? lr.restePrevuMm ?? 0;
      if (reste > 0) {
        const statut = reste >= refusMax ? 'A_STOCKER' : (reste >= refusMin ? 'DECHET_INTERVALLE_REFUS' : 'DECHET_PUR');
        chutesGenereesReelles.push({
          id: `gen-${idx}-${Date.now()}`,
          longueur: reste,
          statut,
          remarque: `Reste sur support ${lr.repere || `#${idx + 1}`}`
        });
      }
    });

    const bilan: BilanProfileOF = {
      articleCode: article?.code_art || articleCode,
      articleDesignation: designation,
      sheetName,
      longueurBarreStandard: longueurStandard,
      refusMin,
      refusMax,
      piecesRequises,
      longueurTotaleRequiseMm,
      nbPiecesTotal,
      commandeModifiee,
      deltaLongueurVsEmissionMm,
      barresNeuvesPrevue,
      chutesPrevue,
      barresNeuvesReelles: barresNeuvesPrevue,
      chutesUtiliseesReelles,
      chutesGenereesReelles,
      matiereFournieMm: 0,
      matiereConsommeeNetteMm: 0,
      traitScieEstimeMm: nbPiecesTotal * 4,
      soldeMatiereMm: 0,
      couvertureEstValide: false
    };

    return this.recalculerCouverture(bilan);
  }

  /**
   * Recalcule la couverture, les soldes et les alertes en temps réel
   */
  static recalculerCouverture(bilan: BilanProfileOF): BilanProfileOF {
    const lgBarre = bilan.longueurBarreStandard || 6000;
    const barresNeuvesMm = Math.max(0, bilan.barresNeuvesReelles) * lgBarre;

    // Chutes utilisées actives (utilisee === true)
    const chutesUtiliseesMm = bilan.chutesUtiliseesReelles
      .filter(c => c.utilisee)
      .reduce((sum, c) => sum + (c.longueur * c.quantite), 0);

    const matiereFournieMm = barresNeuvesMm + chutesUtiliseesMm;

    // Chutes générées à ranger au rack
    const chutesStockeesMm = bilan.chutesGenereesReelles
      .filter(c => c.statut === 'A_STOCKER')
      .reduce((sum, c) => sum + c.longueur, 0);

    const traitScieEstimeMm = bilan.nbPiecesTotal * 4;
    const besoinNetTotalMm = bilan.longueurTotaleRequiseMm + traitScieEstimeMm;

    const soldeMatiereMm = matiereFournieMm - besoinNetTotalMm;
    const matiereConsommeeNetteMm = matiereFournieMm - chutesStockeesMm;

    // Validation : Est-ce que la matière brute fournie couvre la commande ?
    // Marge de tolérance de 5 mm
    const couvertureEstValide = matiereFournieMm >= (besoinNetTotalMm - 5);

    let messageAlerte: string | undefined = undefined;

    if (!couvertureEstValide) {
      const manqueMm = Math.round(besoinNetTotalMm - matiereFournieMm);
      messageAlerte = `Matière insuffisante : il manque au moins ${manqueMm} mm de profilé pour fabriquer toutes les pièces de la commande. Ajoutez une barre neuve (+1) ou une chute du rack.`;
    } else if (chutesStockeesMm > soldeMatiereMm + 20) {
      messageAlerte = `Attention : la somme des chutes que vous souhaitez ranger au rack (${chutesStockeesMm} mm) dépasse le métal résiduel théorique disponible (${Math.round(soldeMatiereMm)} mm). Vérifiez la mesure lue au mètre ruban.`;
    }

    return {
      ...bilan,
      matiereFournieMm,
      matiereConsommeeNetteMm,
      traitScieEstimeMm,
      soldeMatiereMm,
      couvertureEstValide,
      messageAlerte
    };
  }

  /**
   * Algorithme Best-Fit : Trouve dans le stock de chutes la chute la plus proche
   * d'une longueur souhaitée, tout en évitant l'intervalle de refus (< refusMax).
   */
  static trouverMeilleureChute(
    longueurCoupeRequise: number,
    chutesDisponibles: ChuteBarre[],
    refusMin: number = 300,
    refusMax: number = 500
  ): {
    chute: ChuteBarre | null;
    typeMatch: 'PARFAIT_SANS_DECHET' | 'BON_RESTE_STOCKABLE' | 'DECHET_ACCEPTABLE' | 'AUCUNE';
    chuteLongueurMm?: number;
    resteMm?: number;
    scoreQualite: number; // 0 à 100
  } {
    if (!chutesDisponibles || chutesDisponibles.length === 0) {
      return { chute: null, typeMatch: 'AUCUNE', scoreQualite: 0 };
    }

    // Filtrer les chutes >= longueur requise
    const candidates = chutesDisponibles.filter(c => c.longueur >= longueurCoupeRequise);
    if (candidates.length === 0) {
      return { chute: null, typeMatch: 'AUCUNE', scoreQualite: 0 };
    }

    // Trier par qualité
    // 1. Chute quasi parfaite (reste < 50mm) -> zéro gaspillage
    // 2. Chute avec reste >= refusMax (reste stockable au rack)
    // 3. Chute la plus courte possible pour minimiser le déchet
    let meilleureChute: ChuteBarre | null = null;
    let meilleurScore = -1;
    let typeFinal: 'PARFAIT_SANS_DECHET' | 'BON_RESTE_STOCKABLE' | 'DECHET_ACCEPTABLE' | 'AUCUNE' = 'AUCUNE';
    let resteFinal = 0;

    for (const c of candidates) {
      const reste = c.longueur - longueurCoupeRequise - 4; // 4mm de trait de coupe
      let score = 0;
      let matchType: 'PARFAIT_SANS_DECHET' | 'BON_RESTE_STOCKABLE' | 'DECHET_ACCEPTABLE' = 'DECHET_ACCEPTABLE';

      if (reste <= 50) {
        // Match presque parfait (zéro déchet, chute consommée intégralement)
        matchType = 'PARFAIT_SANS_DECHET';
        score = 150 - reste; // 150 à 100
      } else if (reste >= refusMax) {
        // Reste valorisable et recyclable au stock
        matchType = 'BON_RESTE_STOCKABLE';
        score = 80 - Math.min(40, (reste - refusMax) / 100);
      } else if (reste >= refusMin && reste < refusMax) {
        // INTERVALLE DE REFUS À ÉVITER LE PLUS POSSIBLE !
        matchType = 'DECHET_ACCEPTABLE';
        score = 20 - (reste / 50); // Pénalité forte
      } else {
        // Petit déchet < 300 mm
        matchType = 'DECHET_ACCEPTABLE';
        score = 40 - (reste / 10);
      }

      if (score > meilleurScore) {
        meilleurScore = score;
        meilleureChute = c;
        typeFinal = matchType;
        resteFinal = Math.max(0, reste);
      }
    }

    return {
      chute: meilleureChute,
      typeMatch: typeFinal,
      chuteLongueurMm: meilleureChute?.longueur,
      resteMm: resteFinal,
      scoreQualite: Math.max(0, Math.round(meilleurScore))
    };
  }

  /**
   * Prépare le bilan multi-profilés pour le Cockpit Éclair
   */
  static preparerBilanCockpitMultiProfils(
    suivi: SuiviOF,
    articles: Article[],
    mapping: Record<string, string> = {}
  ): BilanCockpitOF {
    const lignes = suivi.lignesRetour || [];

    // 1. Détection des lignes d'accessoires magasin
    const isAccessoire = (l: LigneRetourOF) => {
      return (
        l.id?.startsWith('lr-acc-') ||
        l.repere?.startsWith('ACCESSOIRE') ||
        l.longueurPrevue === 0 ||
        (Boolean(l.articleCode) && l.articleCode!.startsWith('ACC-'))
      );
    };

    const accessoiresMap = new Map<string, AccessoireBilanCockpit>();
    const profilLignesMap = new Map<string, LigneRetourOF[]>();

    lignes.forEach((l, idx) => {
      if (isAccessoire(l)) {
        const code = l.articleCode || `ACC-${idx}`;
        let qte = 1;
        const m = l.piecesInfoStr?.match(/^(\d+)/) || l.saisieOperateur?.match(/^(\d+)/);
        if (m) {
          qte = parseInt(m[1], 10) || 1;
        }
        if (accessoiresMap.has(code)) {
          const acc = accessoiresMap.get(code)!;
          acc.quantitePrevue += qte;
          acc.quantiteReelle += qte;
        } else {
          accessoiresMap.set(code, {
            id: l.id || `acc-${idx}`,
            codeArt: code,
            designation: l.articleDesignation || l.repere.replace(/^ACCESSOIRE\s*/i, '') || 'Accessoire',
            quantitePrevue: qte,
            quantiteReelle: qte,
            unite: 'pcs',
            cochee: true,
            piecesInfoStr: l.piecesInfoStr
          });
        }
      } else {
        const artKey = l.articleCode || l.articleDesignation || suivi.titreSection || 'PROFIL_PRINCIPAL';
        if (!profilLignesMap.has(artKey)) {
          profilLignesMap.set(artKey, []);
        }
        profilLignesMap.get(artKey)!.push(l);
      }
    });

    // Si aucune ligne n'est présente dans lignesRetour (ex: OF créé manuellement)
    if (profilLignesMap.size === 0) {
      const artCode = suivi.barresReservees?.[0]?.codeArt || suivi.titreSection || 'PROFIL_PRINCIPAL';
      profilLignesMap.set(artCode, []);
    }

    // 2. Construire chaque profilé
    const profils: ProfilBilanCockpit[] = [];

    profilLignesMap.forEach((pLignes, artKey) => {
      const firstLine = pLignes[0];
      const article =
        articles.find(a => a.code_art === artKey || a.code_art === firstLine?.articleCode) ||
        articles.find(a => a.designation === artKey || (firstLine?.articleDesignation && a.designation === firstLine.articleDesignation));

      const articleCode = article?.code_art || firstLine?.articleCode || (artKey.startsWith('PROFIL') ? '' : artKey);
      const articleDesignation = article?.designation || firstLine?.articleDesignation || suivi.titreSection || 'Profilé Aluminium';
      const sheetName = (articleCode && mapping[articleCode]) || article?.designation || articleDesignation;
      const longueurStandard = article?.longeur || 6000;
      const refusMin = article?.refus_min ?? 300;
      const refusMax = article?.refus_max ?? 500;

      // Barres neuves prévues
      const barresLignes = pLignes.filter(l => l.typeSupport === 'BARRE_NEUVE');
      let barresNeuvesPrevues = barresLignes.length;
      if (barresNeuvesPrevues === 0 && suivi.barresReservees && suivi.barresReservees.length > 0) {
        const br = suivi.barresReservees.find(b => b.codeArt === articleCode);
        if (br) barresNeuvesPrevues = br.quantite;
        else if (profilLignesMap.size === 1) barresNeuvesPrevues = suivi.barresReservees.reduce((s, b) => s + b.quantite, 0);
      }
      if (barresNeuvesPrevues === 0 && profilLignesMap.size === 1 && suivi.totalBarresNeuvesPrevu) {
        barresNeuvesPrevues = suivi.totalBarresNeuvesPrevu;
      }

      // Chutes prévues
      const chutesLignes = pLignes.filter(l => l.typeSupport === 'CHUTE_BARRE');
      const chutesUtiliseesPrevues = chutesLignes.map((l, cIdx) => ({
        id: l.id || `prev-chute-${cIdx}`,
        chuteId: l.chuteId,
        longueur: l.longueurPrevue || 0,
        resteTheorique: l.restePrevuMm || 0,
        repere: l.repere || `Chute #${cIdx + 1}`,
        piecesInfoStr: l.piecesInfoStr
      }));

      // Chutes générées prévues : uniquement les chutes réelles valorisables à ranger (>= refusMax). Fini les déchets !
      // On regroupe les chutes identiques par longueur avec notion de quantité
      const chutesGenGroupMap = new Map<number, number>();
      pLignes.forEach(l => {
        const reste = l.restePrevuMm || 0;
        if (reste >= refusMax) {
          const lg = Math.round(reste);
          chutesGenGroupMap.set(lg, (chutesGenGroupMap.get(lg) || 0) + 1);
        }
      });

      const chutesGenereesPrevues: ProfilBilanCockpit['chutesGenereesPrevues'] = [];
      const chutesGenereesReelles: ProfilBilanCockpit['chutesGenereesReelles'] = [];
      let genCounter = 0;
      chutesGenGroupMap.forEach((qte, lg) => {
        const id = `gen-prev-${genCounter++}`;
        chutesGenereesPrevues.push({
          id,
          longueur: lg,
          statut: 'A_STOCKER',
          sourceRepere: `Chute ${lg} mm`
        });
        chutesGenereesReelles.push({
          id,
          longueur: lg,
          quantite: qte,
          statut: 'A_STOCKER',
          sourceRepere: '',
          modifieeManuellement: false
        });
      });

      // Réel modifiable initialisé au prévu
      const chutesUtiliseesReelles = chutesUtiliseesPrevues.map(c => ({
        ...c,
        utilisee: true,
        source: 'PREVUE' as const,
        motifNonUtilisation: 'REMPLACEE_GARDER_AU_STOCK' as const
      }));

      profils.push({
        articleCode,
        articleDesignation,
        sheetName,
        longueurStandard,
        refusMin,
        refusMax,
        barresNeuvesPrevues,
        chutesUtiliseesPrevues,
        chutesGenereesPrevues,
        barresNeuvesReelles: barresNeuvesPrevues,
        barresRebut: 0,
        chutesUtiliseesReelles,
        chutesGenereesReelles
      });
    });

    const accessoires = Array.from(accessoiresMap.values());

    return {
      ofId: suivi.id,
      codeOF: suivi.codeOF || (suivi.numeroEmission ? `OF-${String(suivi.numeroEmission).padStart(3, '0')}` : 'OF'),
      numCommande: suivi.numCommande,
      nomClient: suivi.nomClient,
      donneurOrdre: suivi.donneurOrdre,
      famille: suivi.famille,
      titreSection: suivi.titreSection,
      dateEmission: suivi.dateEmission,
      profils,
      accessoires,
      estConformeAuPlan: true,
      nbAjustements: 0
    };
  }

  /**
   * Construit les mouvements de stock exacts et met à jour les lignes de retour de l'OF
   */
  static calculerMouvementsEtLignesCloture(
    bilan: BilanCockpitOF,
    suivi: SuiviOF,
    dateStr: string,
    remarqueGlobale?: string
  ): {
    mouvements: MouvementStock[];
    lignesRetourActualisees: LigneRetourOF[];
  } {
    const dateTimeStr = `${dateStr} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const mouvements: MouvementStock[] = [];
    let mvtIdCounter = 0;
    const makeId = (prefix: string) => `mvt-${prefix}-${Date.now()}-${mvtIdCounter++}`;

    const updatedLignes: LigneRetourOF[] = [...(suivi.lignesRetour || [])];

    // 1. Mouvements pour chaque profilé
    bilan.profils.forEach(p => {
      const artCode = p.articleCode || suivi.barresReservees?.[0]?.codeArt || '';

      // A. Barres Neuves
      const totalBarresReelles = p.barresNeuvesReelles;
      const nbRebuts = Math.min(totalBarresReelles, p.barresRebut);
      const nbBarresStandard = Math.max(0, totalBarresReelles - nbRebuts);

      if (nbBarresStandard > 0 && artCode) {
        mouvements.push({
          id: makeId('barre-std'),
          date: dateTimeStr,
          type: 'SORTIE_BARRE_NEUVE',
          articleCode: artCode,
          designation: p.articleDesignation,
          ofId: suivi.id,
          numCommande: suivi.numCommande,
          nomClient: suivi.nomClient,
          longueurMm: p.longueurStandard || 6000,
          quantite: nbBarresStandard,
          remarque: `Clôture Cockpit : ${nbBarresStandard} barre(s) 6m consommée(s) pour OF ${bilan.codeOF || suivi.numCommande}`
        });
      }

      if (nbRebuts > 0 && artCode) {
        mouvements.push({
          id: makeId('barre-rebut'),
          date: dateTimeStr,
          type: 'SORTIE_BARRE_NEUVE',
          articleCode: artCode,
          designation: p.articleDesignation,
          ofId: suivi.id,
          numCommande: suivi.numCommande,
          nomClient: suivi.nomClient,
          longueurMm: p.longueurStandard || 6000,
          quantite: nbRebuts,
          remarque: `[REBUT ATELIER / CASSE] ${nbRebuts} barre(s) 6m de remplacement consommée(s) pour OF ${bilan.codeOF || suivi.numCommande}`
        });
      }

      // B. Chutes du rack utilisées
      p.chutesUtiliseesReelles.forEach(c => {
        if (!c.utilisee) {
          // Si la chute prévue n'a pas été utilisée car INTROUVABLE / PERDUE / ABÎMÉE,
          // on génère une SORTIE_CHUTE pour la déstocker et la supprimer définitivement du stock physique de chutes !
          if (c.motifNonUtilisation === 'INTROUVABLE_SUPPRIMER' && (c.chuteId || c.longueur > 0) && artCode) {
            mouvements.push({
              id: makeId('chute-introuvable'),
              date: dateTimeStr,
              type: 'SORTIE_CHUTE',
              articleCode: artCode,
              designation: p.articleDesignation,
              ofId: suivi.id,
              numCommande: suivi.numCommande,
              nomClient: suivi.nomClient,
              longueurMm: c.longueur,
              quantite: 1,
              remarque: `[ÉCART INVENTAIRE] Chute introuvable au rack (${c.longueur} mm) déstockée définitivement — OF ${bilan.codeOF || suivi.numCommande}`,
              chuteId: c.chuteId
            });
          }
          // Si motifNonUtilisation === 'REMPLACEE_GARDER_AU_STOCK', aucun mouvement : la chute reste physiquement au rack
          return;
        }

        if (c.source === 'HORS_STOCK') {
          mouvements.push({
            id: makeId('adj-chute'),
            date: dateTimeStr,
            type: 'AJUSTEMENT_INVENTAIRE',
            articleCode: artCode,
            designation: p.articleDesignation,
            ofId: suivi.id,
            numCommande: suivi.numCommande,
            nomClient: suivi.nomClient,
            longueurMm: c.longueur,
            quantite: 1,
            remarque: `Régularisation chute atelier non inventoriée (${c.longueur} mm) utilisée pour ${suivi.numCommande}`
          });
        } else {
          mouvements.push({
            id: makeId('chute-out'),
            date: dateTimeStr,
            type: 'SORTIE_CHUTE',
            articleCode: artCode,
            designation: p.articleDesignation,
            ofId: suivi.id,
            numCommande: suivi.numCommande,
            nomClient: suivi.nomClient,
            longueurMm: c.longueur,
            quantite: 1,
            remarque: `Chute stock débitée (${c.longueur} mm) — OF ${bilan.codeOF || suivi.numCommande}`,
            chuteId: c.chuteId
          });
        }
      });

      // C. Chutes générées à ranger au rack (quantité en pièces pcs)
      p.chutesGenereesReelles.forEach(cg => {
        const qte = cg.quantite ?? 1;
        if (cg.longueur >= p.refusMin && artCode && qte > 0) {
          mouvements.push({
            id: makeId('chute-in'),
            date: dateTimeStr,
            type: 'ENTREE_CHUTE',
            articleCode: artCode,
            designation: p.articleDesignation,
            ofId: suivi.id,
            numCommande: suivi.numCommande,
            nomClient: suivi.nomClient,
            longueurMm: Math.round(cg.longueur),
            quantite: qte,
            remarque: `Nouvelle chute rack (${Math.round(cg.longueur)} mm × ${qte} pcs) issue de OF ${bilan.codeOF || suivi.numCommande}`
          });
        }
      });
    });

    // 2. Mouvements pour les accessoires magasin
    bilan.accessoires.forEach(acc => {
      if (acc.cochee && acc.quantiteReelle > 0 && acc.codeArt) {
        mouvements.push({
          id: makeId('acc-out'),
          date: dateTimeStr,
          type: 'SORTIE_ACCESSOIRE',
          articleCode: acc.codeArt,
          designation: acc.designation,
          ofId: suivi.id,
          numCommande: suivi.numCommande,
          nomClient: suivi.nomClient,
          longueurMm: 0,
          quantite: acc.quantiteReelle,
          remarque: `Sortie accessoire (${acc.quantiteReelle} ${acc.unite}) pour OF ${bilan.codeOF || suivi.numCommande}`
        });
      }
    });

    return {
      mouvements,
      lignesRetourActualisees: updatedLignes
    };
  }
}
