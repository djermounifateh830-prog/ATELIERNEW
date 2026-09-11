import {
  BesoinMoustiquaire,
  ChuteMaille,
  DecisionMailleDetail,
  ModeleMoustiquaireConfig,
  ParametresOptimisationMaille,
  ResultatMoustiquaire
} from '../types';

export const PARAMETRES_MAILLE_DEFAUT: ParametresOptimisationMaille = {
  ecartMaxPlis: 5, // Jusqu'à +5 plis autorisés au maximum
  dechetMaxJeteMm: 100, // 10 cm max jeté à la poubelle
  longueurMinChuteConserveeMm: 1000 // 1 mètre minimum pour conserver le reste en stock
};

export const MARGE_SECURITE_PLIS = 2; // Règle d'origine atelier validée (+2 plis)

// Déductions exactes de coupe d'après règles de fabrication
// 1. SANS Barre Inférieure (Cadre 4 côtés standard) :
export const DEDUCTION_CADRE_LARGEUR_MM = -62; // Marge traverses cadre (L - 62)
export const DEDUCTION_CADRE_HAUTEUR_STANDARD_MM = -62; // Marge montants cadre sans barre inf (H - 62)
export const DEDUCTION_COULISSE_STANDARD_MM = -46; // Marge coulisse sans barre inf (H - 46 ou L - 46)

// 2. AVEC Barre Inférieure (Cadre 3 côtés + Barre Inférieure fine) :
export const DEDUCTION_CADRE_HAUTEUR_AVEC_BARRE_INF_MM = -37; // Marge montants cadre avec barre inf (H - 37)
export const DEDUCTION_BARRE_INF_MM = -13; // Marge barre inférieure (L - 13)
export const DEDUCTION_COULISSE_AVEC_BARRE_INF_MM = -33; // Marge coulisse avec barre inf (H - 33 ou L - 33)

// Alias de rétrocompatibilité
export const DEDUCTION_CADRE_MM = -62;
export const DEDUCTION_COULISSE_MM = -46;

export function normalizeTypeOuverture(typeOuverture: string = ''): 'FENETRE' | 'PORTE_FENETRE' | 'DOUBLE_VANTAUX' | 'CENTRALE' | 'FIXE' {
  const t = typeOuverture.toUpperCase().trim();
  if (t.includes('DOUBLE') || t.includes('2 V') || t.includes('2V') || t.includes('BAIS') || t.includes('BAIE')) {
    return 'DOUBLE_VANTAUX';
  }
  if (t.includes('CENTRALE')) {
    return 'CENTRALE';
  }
  if (t.includes('FIXE') || t.includes('FIX')) {
    return 'FIXE';
  }
  if (t.includes('PORTE') || t.includes('PF')) {
    return 'PORTE_FENETRE';
  }
  return 'FENETRE';
}

export function determinerNbFilsGuidage(dimension: number): number {
  // Test n de 2 à 8 tel que dimension/n est entre 250mm et 370mm
  for (let n = 2; n <= 8; n++) {
    const ratio = dimension / n;
    if (ratio >= 250 && ratio <= 370) {
      return n;
    }
  }
  // Si hors plage, trouver n minimisant l'écart à 300mm
  let meilleurN = 2;
  let minDiff = Infinity;
  for (let n = 2; n <= 8; n++) {
    const ratio = dimension / n;
    const diff = Math.abs(ratio - 300);
    if (diff < minDiff) {
      minDiff = diff;
      meilleurN = n;
    }
  }
  return meilleurN;
}

export function calculerBesoinMaille(besoin: BesoinMoustiquaire): {
  dimension_fixe_requise: number;
  dimension_fixe_est: 'L' | 'H';
  nb_plis_requis: number;
  nb_fils_guidage: number;
  distance_cordes: number;
  longueur_corde_unitaire_m: number;
  longueur_corde_totale_m: number;
  superficie_m2: number;
} {
  const typeKey = normalizeTypeOuverture(besoin.typeOuverture);
  const L = besoin.largeur;
  const H = besoin.hauteur;
  const Q = Math.max(1, besoin.quantite);

  let dimensionPertinenteForPlis: number;
  let dimensionFixeEst: 'L' | 'H';
  let dimensionFixeRequise: number;
  let dimensionCordes: number;
  let formuleCordeUnitM: number;

  if (typeKey === 'DOUBLE_VANTAUX') {
    // 2 vantaux : dimension fixe = H, plis calculés sur L/2
    dimensionPertinenteForPlis = L / 2.0;
    dimensionFixeEst = 'H';
    dimensionFixeRequise = H;
    dimensionCordes = H;
    formuleCordeUnitM = (H + L) / 1000.0;
  } else if (typeKey === 'PORTE_FENETRE') {
    // Porte fenêtre 1 vantail : dimension fixe = H, plis calculés sur L
    dimensionPertinenteForPlis = L;
    dimensionFixeEst = 'H';
    dimensionFixeRequise = H;
    dimensionCordes = H;
    formuleCordeUnitM = ((H * 1.3) + L) / 1000.0;
  } else if (typeKey === 'CENTRALE') {
    // Centrale : dimension fixe = H, plis calculés sur L
    dimensionPertinenteForPlis = L;
    dimensionFixeEst = 'H';
    dimensionFixeRequise = H;
    dimensionCordes = H;
    formuleCordeUnitM = ((H * 2.0) + L) / 1000.0;
  } else if (typeKey === 'FIXE') {
    // Fixe : dimension fixe = L, plis calculés sur H
    dimensionPertinenteForPlis = H;
    dimensionFixeEst = 'L';
    dimensionFixeRequise = L;
    dimensionCordes = L;
    formuleCordeUnitM = ((L * 1.5) + H) / 1000.0;
  } else {
    // Fenêtre standard : dimension fixe = L, plis calculés sur H
    dimensionPertinenteForPlis = H;
    dimensionFixeEst = 'L';
    dimensionFixeRequise = L;
    dimensionCordes = L;
    formuleCordeUnitM = ((L * 1.5) + H) / 1000.0;
  }

  const nbPlis = Math.round(dimensionPertinenteForPlis / 25.0) + MARGE_SECURITE_PLIS;
  const nbFils = determinerNbFilsGuidage(dimensionCordes);

  // Formule exacte de la colonne H du fichier Excel OPTIMISATION DEVELOPPEE.xlsx
  let distanceCordes = (dimensionCordes > 400) ? (dimensionCordes - 400) : dimensionCordes;
  const dimUtile = Math.max(0, dimensionCordes - 400);
  let distanceTrouvee = false;
  for (let n = 2; n <= 8; n++) {
    const ratio = dimUtile / n;
    if (ratio >= 250 && ratio <= 370) {
      distanceCordes = ratio;
      distanceTrouvee = true;
      break;
    }
  }
  if (!distanceTrouvee) {
    for (let n = 2; n <= 8; n++) {
      const ratio = dimUtile / n;
      if (ratio >= 200 && ratio < 250) {
        distanceCordes = ratio;
        distanceTrouvee = true;
        break;
      }
    }
  }

  const totalCordes = nbFils * Q;
  const longueurCordeTotaleM = formuleCordeUnitM * totalCordes;
  const superficieM2 = (L * H / 1000000.0) * Q;

  return {
    dimension_fixe_requise: dimensionFixeRequise,
    dimension_fixe_est: dimensionFixeEst,
    nb_plis_requis: nbPlis,
    nb_fils_guidage: nbFils,
    distance_cordes: Math.round(distanceCordes * 10) / 10,
    longueur_corde_unitaire_m: Math.round(formuleCordeUnitM * 100) / 100,
    longueur_corde_totale_m: Math.round(longueurCordeTotaleM * 100) / 100,
    superficie_m2: Math.round(superficieM2 * 1000) / 1000
  };
}

export interface ResultatSelectionChuteMaille {
  chute: ChuteMaille | null;
  decision: DecisionMailleDetail;
}

/**
 * Évalue si une chute de maille est compatible avec le besoin et calcule son score d'efficacité.
 * Règles d'atelier validées :
 * 1. Plis : entre 0 et ecartMaxPlis (défaut: 5 plis) en trop.
 * 2. Longueur : >= dimension requise (impossible d'étirer une toile).
 * 3. Décision déchet :
 *    - Si perte <= dechetMaxJeteMm (défaut: 100 mm) -> Coupe autorisée, déchet à la poubelle.
 *    - Si reste >= longueurMinChuteConserveeMm (défaut: 1000 mm) -> Coupe autorisée, reste réinjecté en stock.
 *    - Entre les deux (ex: 101 mm à 999 mm) -> Rejet pour éviter de gaspiller une grande chute précieuse.
 */
export function evaluerCompatibiliteChuteMaille(
  chute: ChuteMaille,
  dimensionFixeRequise: number,
  nbPlisRequis: number,
  params: ParametresOptimisationMaille = PARAMETRES_MAILLE_DEFAUT
): {
  eligible: boolean;
  score: number;
  plisEnTrop: number;
  deltaLongueur: number;
  actionReste: 'POUBELLE' | 'NOUVELLE_CHUTE_STOCK' | 'AUCUN';
  motif: string;
} {
  const ecartMax = Math.max(0, params.ecartMaxPlis ?? 5);
  const dechetMax = Math.max(0, params.dechetMaxJeteMm ?? 100);
  const longMinStock = Math.max(0, params.longueurMinChuteConserveeMm ?? 1000);

  const plisChute = chute.plis;
  const plisDiff = plisChute - nbPlisRequis;

  // Règle 1 : La chute doit avoir entre 0 et ecartMax plis en trop
  if (plisDiff < 0 || plisDiff > ecartMax) {
    return {
      eligible: false,
      score: Infinity,
      plisEnTrop: plisDiff,
      deltaLongueur: chute.dimension_fixe - dimensionFixeRequise,
      actionReste: 'AUCUN',
      motif: plisDiff < 0
        ? `Manque ${Math.abs(plisDiff)} pli(s) (${plisChute} disponibles pour ${nbPlisRequis} requis)`
        : `Trop de plis (+${plisDiff} plis, max autorisé: +${ecartMax})`
    };
  }

  // Règle 2 : La longueur de la chute doit être >= dimension requise
  const deltaL = chute.dimension_fixe - dimensionFixeRequise;
  if (deltaL < 0) {
    return {
      eligible: false,
      score: Infinity,
      plisEnTrop: plisDiff,
      deltaLongueur: deltaL,
      actionReste: 'AUCUN',
      motif: `Chute trop courte de ${Math.abs(deltaL)} mm (${chute.dimension_fixe} mm pour ${dimensionFixeRequise} mm requis)`
    };
  }

  // Règle 3 : Arbitrage du déchet et du reste
  if (deltaL <= dechetMax) {
    // Cas A : Déchet minime jetable (ex: <= 100 mm)
    // Priorité absolue aux plis exacts (plisDiff = 0), puis à la longueur la plus proche
    const score = (plisDiff * 2000) + deltaL;
    return {
      eligible: true,
      score,
      plisEnTrop: plisDiff,
      deltaLongueur: deltaL,
      actionReste: 'POUBELLE',
      motif: plisDiff === 0
        ? `Chute optimale : plis identiques (${nbPlisRequis} plis), déchet de coupe minime (${deltaL} mm à jeter)`
        : `Chute acceptée : recouper ${plisDiff} pli(s), déchet de coupe minime (${deltaL} mm à jeter)`
    };
  }

  if (deltaL >= longMinStock) {
    // Cas B : Reste réutilisable à remettre en stock (>= 1000 mm)
    const score = 10000 + (plisDiff * 2000) + deltaL;
    return {
      eligible: true,
      score,
      plisEnTrop: plisDiff,
      deltaLongueur: deltaL,
      actionReste: 'NOUVELLE_CHUTE_STOCK',
      motif: plisDiff === 0
        ? `Chute découpée : plis identiques, reste valorisable de ${deltaL} mm remis en stock`
        : `Chute découpée : recouper ${plisDiff} pli(s), reste valorisable de ${deltaL} mm remis en stock`
    };
  }

  // Cas C : Perte intermédiaire non valorisable (entre 10 cm et 1 m) -> rejet pour préserver la chute
  return {
    eligible: false,
    score: Infinity,
    plisEnTrop: plisDiff,
    deltaLongueur: deltaL,
    actionReste: 'AUCUN',
    motif: `Perte excessive (${deltaL} mm perdus). Chute préservée pour une commande plus grande.`
  };
}

export function chercherChuteCompatible(
  dimensionFixeRequise: number,
  nbPlisRequis: number,
  chutesDisponibles: ChuteMaille[],
  params: ParametresOptimisationMaille = PARAMETRES_MAILLE_DEFAUT
): ResultatSelectionChuteMaille {
  let meilleureChute: ChuteMaille | null = null;
  let meilleurScore = Infinity;
  let meilleureEval: any = null;

  for (const chute of (chutesDisponibles || [])) {
    if ((chute as any).quantite !== undefined && (chute as any).quantite <= 0) continue;
    if (chute.plis <= 0 || chute.dimension_fixe <= 0) continue;

    const evaluation = evaluerCompatibiliteChuteMaille(
      chute,
      dimensionFixeRequise,
      nbPlisRequis,
      params
    );

    if (evaluation.eligible && evaluation.score < meilleurScore) {
      meilleurScore = evaluation.score;
      meilleureChute = chute;
      meilleureEval = evaluation;
    }
  }

  if (!meilleureChute || !meilleureEval) {
    return {
      chute: null,
      decision: {
        sourceType: 'PAQUET_NEUF',
        plisRequis: nbPlisRequis,
        dimensionRequise: dimensionFixeRequise,
        actionReste: 'AUCUN',
        motif: 'Aucune chute adaptée en stock sans gaspillage. Découpe sur paquet neuf recommandée.'
      }
    };
  }

  return {
    chute: meilleureChute,
    decision: {
      chuteId: meilleureChute.id,
      sourceType: 'CHUTE',
      plisRequis: nbPlisRequis,
      plisChute: meilleureChute.plis,
      plisEnTrop: meilleureEval.plisEnTrop,
      dimensionRequise: dimensionFixeRequise,
      dimensionChute: meilleureChute.dimension_fixe,
      dechetLongueurMm: meilleureEval.actionReste === 'POUBELLE' ? meilleureEval.deltaLongueur : 0,
      resteLongueurMm: meilleureEval.actionReste === 'NOUVELLE_CHUTE_STOCK' ? meilleureEval.deltaLongueur : 0,
      actionReste: meilleureEval.actionReste,
      motif: meilleureEval.motif
    }
  };
}

/**
 * Optimise l'attribution des chutes de maille sur l'ensemble d'une commande (lot de moustiquaires)
 * Évite d'attribuer la même chute 2 fois et régénère les reliquats >= 1m pour les autres pièces.
 */
export function optimiserLotMoustiquaires(
  besoins: BesoinMoustiquaire[],
  chutesDisponibles: ChuteMaille[],
  params: ParametresOptimisationMaille = PARAMETRES_MAILLE_DEFAUT
): ResultatMoustiquaire[] {
  // Copie de travail du stock de chutes pour décompte dynamique
  const poolChutes = (chutesDisponibles || []).map(c => ({ ...c }));

  return (besoins || []).map(besoin => {
    const calc = calculerBesoinMaille(besoin);
    const Q = Math.max(1, besoin.quantite || 1);
    const detailsUnites: {
      uniteIndex: number;
      chute: ChuteMaille | null;
      restePlis?: number;
      decision?: DecisionMailleDetail;
    }[] = [];

    let premiereChuteTrouvee: ChuteMaille | null = null;
    let premiereDecision: DecisionMailleDetail | undefined = undefined;

    for (let u = 0; u < Q; u++) {
      // Évaluer toutes les chutes restantes dans le pool avec les règles d'atelier
      let bestIdx = -1;
      let meilleurScore = Infinity;
      let meilleureEval: any = null;

      poolChutes.forEach((c, idx) => {
        if ((c as any).quantite !== undefined && (c as any).quantite <= 0) return;
        if (c.plis <= 0 || c.dimension_fixe <= 0) return;

        const ev = evaluerCompatibiliteChuteMaille(
          c,
          calc.dimension_fixe_requise,
          calc.nb_plis_requis,
          params
        );

        if (ev.eligible && ev.score < meilleurScore) {
          meilleurScore = ev.score;
          bestIdx = idx;
          meilleureEval = ev;
        }
      });

      if (bestIdx !== -1 && poolChutes[bestIdx]) {
        const matchedChute = poolChutes[bestIdx];
        const chuteSnapshot: ChuteMaille = { ...matchedChute };
        const decisionUnit: DecisionMailleDetail = {
          chuteId: matchedChute.id,
          sourceType: 'CHUTE',
          plisRequis: calc.nb_plis_requis,
          plisChute: matchedChute.plis,
          plisEnTrop: meilleureEval.plisEnTrop,
          dimensionRequise: calc.dimension_fixe_requise,
          dimensionChute: matchedChute.dimension_fixe,
          dechetLongueurMm: meilleureEval.actionReste === 'POUBELLE' ? meilleureEval.deltaLongueur : 0,
          resteLongueurMm: meilleureEval.actionReste === 'NOUVELLE_CHUTE_STOCK' ? meilleureEval.deltaLongueur : 0,
          actionReste: meilleureEval.actionReste,
          motif: meilleureEval.motif
        };

        if (u === 0) {
          premiereChuteTrouvee = chuteSnapshot;
          premiereDecision = decisionUnit;
        }

        detailsUnites.push({
          uniteIndex: u + 1,
          chute: chuteSnapshot,
          restePlis: matchedChute.plis - calc.nb_plis_requis,
          decision: decisionUnit
        });

        // Gestion de la mise à jour du pool de chutes
        if (meilleureEval.actionReste === 'NOUVELLE_CHUTE_STOCK') {
          // La chute débitée laisse un reste >= longueurMinChuteConserveeMm (ex: >= 1m)
          // Ce reste reste disponible dans le pool pour une autre fenêtre de la commande !
          poolChutes[bestIdx] = {
            id: `${matchedChute.id || 'm'}-rel-${u + 1}`,
            dimension_fixe: meilleureEval.deltaLongueur,
            plis: calc.nb_plis_requis
          };
        } else {
          // Déchet jeté (<= 100mm) : chute entièrement consommée
          poolChutes.splice(bestIdx, 1);
        }
      } else {
        const decisionNeuf: DecisionMailleDetail = {
          sourceType: 'PAQUET_NEUF',
          plisRequis: calc.nb_plis_requis,
          dimensionRequise: calc.dimension_fixe_requise,
          actionReste: 'AUCUN',
          motif: 'Aucune chute adaptée en stock sans gaspillage. Découpe sur paquet neuf recommandée.'
        };

        if (u === 0 && !premiereDecision) {
          premiereDecision = decisionNeuf;
        }

        detailsUnites.push({
          uniteIndex: u + 1,
          chute: null,
          decision: decisionNeuf
        });
      }
    }

    const resSingle = calculerMoustiquaire(besoin, chutesDisponibles, params);
    const hasAnyChute = detailsUnites.some(d => d.chute !== null);

    return {
      ...resSingle,
      chute_trouvee: premiereChuteTrouvee,
      decision_maille: premiereDecision,
      reste_plis: premiereChuteTrouvee ? Math.max(0, premiereChuteTrouvee.plis - calc.nb_plis_requis) : undefined,
      statut_toile: hasAnyChute ? 'CHUTE_RECYCLEE' : 'PAQUET_NEUF',
      details_chutes_unites: detailsUnites
    };
  });
}

export function calculerMoustiquaire(
  besoin: BesoinMoustiquaire,
  chutesDisponibles: ChuteMaille[],
  params: ParametresOptimisationMaille = PARAMETRES_MAILLE_DEFAUT
): ResultatMoustiquaire {
  const {
    dimension_fixe_requise,
    dimension_fixe_est,
    nb_plis_requis,
    nb_fils_guidage,
    distance_cordes,
    longueur_corde_unitaire_m,
    longueur_corde_totale_m,
    superficie_m2
  } = calculerBesoinMaille(besoin);

  const selection = chercherChuteCompatible(
    dimension_fixe_requise,
    nb_plis_requis,
    chutesDisponibles,
    params
  );
  const chuteTrouvee = selection.chute;
  const restePlis = chuteTrouvee ? Math.max(0, chuteTrouvee.plis - nb_plis_requis) : undefined;

  const typeKey = normalizeTypeOuverture(besoin.typeOuverture);
  const L = besoin.largeur;
  const H = besoin.hauteur;
  const Q = Math.max(1, besoin.quantite);

  const piecesProfiles: { longueur: number; quantite: number; label: string; repere?: string; refCommande?: string }[] = [];

  // Déductions exactes selon option Barre Inférieure
  const dedCadreH = besoin.avecBarreInferieure ? DEDUCTION_CADRE_HAUTEUR_AVEC_BARRE_INF_MM : DEDUCTION_CADRE_HAUTEUR_STANDARD_MM; // -37mm si avec barre inf, -62mm sinon
  const dedCadreL = DEDUCTION_CADRE_LARGEUR_MM; // -62mm
  const dedCoulisse = besoin.avecBarreInferieure ? DEDUCTION_COULISSE_AVEC_BARRE_INF_MM : DEDUCTION_COULISSE_STANDARD_MM; // -33mm si avec barre inf, -46mm sinon
  const dedBarreInf = DEDUCTION_BARRE_INF_MM; // -13mm

  // 1. BARRES COULISSES (tirage / coulisseau)
  let qtyCoulisses = 1;
  let lenCoulisse = H + dedCoulisse;

  if (typeKey === 'DOUBLE_VANTAUX' || typeKey === 'CENTRALE') {
    qtyCoulisses = 2;
    lenCoulisse = H + dedCoulisse;
  } else if (typeKey === 'FIXE') {
    qtyCoulisses = 0; // Aucune coulisse pour un cadre fixe
  } else if (typeKey === 'FENETRE') {
    qtyCoulisses = 1;
    lenCoulisse = L + dedCoulisse; // Tirage horizontal
  } else {
    qtyCoulisses = 1;
    lenCoulisse = H + dedCoulisse;
  }

  if (qtyCoulisses > 0) {
    piecesProfiles.push({
      longueur: lenCoulisse,
      quantite: qtyCoulisses * Q,
      label: `${besoin.repere}-CS (Barre Coulisse ${lenCoulisse}mm [marge ${dedCoulisse}mm])`,
      repere: `${besoin.repere}-CS`,
      refCommande: besoin.refCommande
    });
  }

  // 2. CADRE DORMANT
  const lenMontantCadre = H + dedCadreH;
  const lenTraverseCadre = L + dedCadreL;

  // 2 Montants verticaux (Ha et Hb)
  piecesProfiles.push({
    longueur: lenMontantCadre,
    quantite: 1 * Q,
    label: `Ha-${besoin.repere} (Montant Cadre A H=${lenMontantCadre}mm [marge ${dedCadreH}mm])`,
    repere: `Ha-${besoin.repere}`,
    refCommande: besoin.refCommande
  });
  piecesProfiles.push({
    longueur: lenMontantCadre,
    quantite: 1 * Q,
    label: `Hb-${besoin.repere} (Montant Cadre B H=${lenMontantCadre}mm [marge ${dedCadreH}mm])`,
    repere: `Hb-${besoin.repere}`,
    refCommande: besoin.refCommande
  });

  // Traverse Haute (La)
  piecesProfiles.push({
    longueur: lenTraverseCadre,
    quantite: 1 * Q,
    label: `La-${besoin.repere} (Traverse Haute Cadre L=${lenTraverseCadre}mm [marge ${dedCadreL}mm])`,
    repere: `La-${besoin.repere}`,
    refCommande: besoin.refCommande
  });

  // Traverse Basse (Lb OU Barre Inférieure Optionnelle)
  if (besoin.avecBarreInferieure) {
    const lenBarreInf = L + dedBarreInf;
    piecesProfiles.push({
      longueur: lenBarreInf,
      quantite: 1 * Q,
      label: `BI-${besoin.repere} (Barre Inférieure L=${lenBarreInf}mm [marge ${dedBarreInf}mm])`,
      repere: `BI-${besoin.repere}`,
      refCommande: besoin.refCommande
    });
  } else {
    piecesProfiles.push({
      longueur: lenTraverseCadre,
      quantite: 1 * Q,
      label: `Lb-${besoin.repere} (Traverse Basse Cadre L=${lenTraverseCadre}mm [marge ${dedCadreL}mm])`,
      repere: `Lb-${besoin.repere}`,
      refCommande: besoin.refCommande
    });
  }

  return {
    besoin,
    dimension_fixe_requise,
    dimension_fixe_est,
    nb_plis_requis,
    nb_fils_guidage,
    distance_cordes,
    longueur_corde_unitaire_m,
    longueur_corde_totale_m,
    superficie_m2,
    chute_trouvee: chuteTrouvee,
    decision_maille: selection.decision,
    reste_plis: restePlis,
    statut_toile: chuteTrouvee ? 'CHUTE_RECYCLEE' : 'PAQUET_NEUF',
    pieces_cadre_coulisse: piecesProfiles
  };
}
