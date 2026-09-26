import { Article } from '../types';

/**
 * Service intelligent d'appariement et d'héritage de dimensions et couleurs
 * pour les Caissons, Sous-Faces, Moustiquaires, Tabliers et Lames Finales.
 */

// Couleurs normalisées usuelles en menuiserie aluminium / volets roulants
export const COULEURS_CONNUES: { id: string; labels: string[]; codeRal?: string }[] = [
  { id: 'BL', labels: ['BL', 'BLANC', 'WHITE', '9010', '9016'], codeRal: '9010' },
  { id: '7024', labels: ['7024', 'G7024', 'RAL7024', 'GR', 'GRIS', 'ANTHRACITE', 'GRIS ANTHRACITE', 'GRIS FONCE'], codeRal: '7024' },
  { id: '7016', labels: ['7016', 'G7016', 'RAL7016', 'ANTHRACITE 7016'], codeRal: '7016' },
  { id: '9005', labels: ['9005', 'G9005', 'RAL9005', 'NOIR', 'BLACK', 'NR'], codeRal: '9005' },
  { id: '9006', labels: ['9006', 'G9006', 'RAL9006', 'GRIS CLAIR', 'ALU GRIS', 'METAL'], codeRal: '9006' },
  { id: '9007', labels: ['9007', 'G9007', 'RAL9007', 'GRIS METAL', 'GRIS METAL 9007'], codeRal: '9007' },
  { id: '8014', labels: ['8014', 'G8014', 'RAL8014', 'BRUN', 'MARRON', 'CHOCOLAT'], codeRal: '8014' },
  { id: '1013', labels: ['1013', 'G1013', 'RAL1013', 'BEIGE', 'IVOIRE'], codeRal: '1013' },
  { id: 'CHENE', labels: ['CHENE', 'FAUX BOIS', 'BOIS', 'GOLDEN OAK', 'CHENE DORE'], codeRal: 'CHENE' },
  { id: 'BRONZE', labels: ['BRONZE', 'ANODISE'], codeRal: 'BRONZE' },
];

/**
 * Extrait la couleur d'une chaîne ou désignation d'article.
 * Retourne l'identifiant normalisé de la couleur (ex: 'BL', '7024', '9005', etc.) ou null.
 */
export function extraireCouleur(texte?: string): string | null {
  if (!texte) return null;
  const upper = texte.toUpperCase().trim();

  // Recherche directe de codes RAL 4 chiffres (ex: 7024, G7024, RAL7024, 9010, 8014, 7016, etc.)
  const ralMatch = upper.match(/(?:RAL|G|R)?(1013|7016|7024|8014|9005|9006|9007|9010|9016)/);
  if (ralMatch) {
    const code = ralMatch[1];
    const found = COULEURS_CONNUES.find(c => c.id === code || c.labels.includes(code));
    return found ? found.id : code;
  }

  // Recherche des labels de couleurs
  for (const c of COULEURS_CONNUES) {
    for (const label of c.labels) {
      // Pour les labels courts comme 'BL', 'NR', 'GR', vérifier avec délimiteur de mot
      if (label.length <= 2) {
        const regex = new RegExp(`(^|[^A-Z0-9])${label}([^A-Z0-9]|$)`, 'i');
        if (regex.test(upper)) return c.id;
      } else {
        if (upper.includes(label)) return c.id;
      }
    }
  }

  return null;
}

/**
 * Normalise la dimension d'un caisson ou d'une sous-face (20, 25, 30 ou 200, 250, 300).
 * Retourne la mesure en mm (200, 250, 300) ou 0 si inconnue.
 */
export function extraireDimensionCaisson(art?: Article | { designation?: string; hauteur?: number } | null): number {
  if (!art) return 0;
  const desig = (art.designation || '').toUpperCase();
  const h = art.hauteur || 0;

  if (/\b400\b|\b40\b|40\*|40X|40\/|SF\s*40|CT\s*40/i.test(desig) || h === 40 || h === 400) {
    return 400;
  }
  if (/\b350\b|\b35\b|35\*|35X|35\/|SF\s*35|CT\s*35/i.test(desig) || h === 35 || h === 350) {
    return 350;
  }
  if (/\b300\b|\b30\b|30\*|30X|30\/|SF\s*30|CT\s*30/i.test(desig) || h === 30 || h === 300) {
    return 300;
  }
  if (/\b250\b|\b25\b|25\*|25X|25\/|SF\s*25|CT\s*25/i.test(desig) || h === 25 || h === 250) {
    return 250;
  }
  if (/\b200\b|\b20\b|20\*|20X|20\/|SF\s*20|CT\s*20/i.test(desig) || h === 20 || h === 200) {
    return 200;
  }
  return h > 0 ? h : 0;
}

/**
 * Trouve automatiquement la Sous-Face correspondant à un Caisson sélectionné.
 * Règle demandée :
 * "si je choisie le caisson 30 bl la souface automùatiquement doit etres 30 bl
 * apres lutisateur poura choisir la couleur si il veux mais la liste doit etres optimiser
 * avec les meme mesure que le caisson si 30 30 si 25 25 etc"
 * + Généralement dans la référence en haut du bon de commande on mentionne SF GRIS ou BL pour tous les caissons.
 */
export function trouverSousFacePourCaisson(
  caisson: Article | { designation?: string; hauteur?: number } | null,
  articlesSF: Article[],
  couleurDemandee?: string | null
): Article | null {
  if (articlesSF.length === 0) return null;
  if (!caisson) return articlesSF[0] || null;

  const dimCaisson = extraireDimensionCaisson(caisson);
  // Couleur cible : priorité à la couleur explicitement demandée (ex: de la référence PDF "SF GR"), sinon couleur du caisson
  const rawColor = couleurDemandee || extraireCouleur(caisson.designation);
  const couleurCible = extraireCouleur(rawColor || undefined);

  // 1. Filtrer les sous-faces de même dimension (ex: 250 pour caisson 25, 300 pour caisson 30)
  let sousFacesMemeDimension: Article[] = [];
  if (dimCaisson > 0) {
    sousFacesMemeDimension = articlesSF.filter(sf => {
      const d = extraireDimensionCaisson(sf);
      if (dimCaisson === 350) return d === 350 || d === 400;
      return d === dimCaisson;
    });
  }

  // Fallback si aucune SF trouvée pour cette dimension exacte
  if (sousFacesMemeDimension.length === 0) {
    if (dimCaisson >= 300) {
      sousFacesMemeDimension = articlesSF.filter(sf => extraireDimensionCaisson(sf) >= 300);
    }
    if (sousFacesMemeDimension.length === 0) {
      sousFacesMemeDimension = articlesSF;
    }
  }

  // 2. Si une couleur est ciblée (ex: 7024 / GRIS ou BL / BLANC), trouver la sous-face correspondante
  if (couleurCible) {
    const matchExact = sousFacesMemeDimension.find(sf => {
      const c = extraireCouleur(sf.designation);
      return c === couleurCible;
    });
    if (matchExact) return matchExact;

    // Tolérance : recherche textuelle si l'ID normalisé n'a pas suffi
    if (couleurCible === '7024') {
      const matchGr = sousFacesMemeDimension.find(sf => {
        const u = sf.designation.toUpperCase();
        return u.includes('7024') || u.includes(' GR') || u.endsWith('GR') || u.includes('GRIS');
      });
      if (matchGr) return matchGr;
    } else if (couleurCible === 'BL') {
      const matchBl = sousFacesMemeDimension.find(sf => {
        const u = sf.designation.toUpperCase();
        return u.includes('BL') || u.includes('BLANC') || u.includes('9010');
      });
      if (matchBl) return matchBl;
    }
  }

  // 3. Sinon, privilégier le premier élément de la bonne dimension
  return sousFacesMemeDimension[0] || articlesSF[0];
}

/**
 * Optimise et sépare la liste des Sous-Faces pour la présentation dans le select :
 * - `recommandees` : Sous-faces ayant rigoureusement la même dimension que le caisson (ex: 30/300),
 *   triées avec la couleur correspondante en tête.
 * - `autres` : Les autres sous-faces (autres dimensions) pour laisser le choix complet à l'utilisateur.
 */
export function optimiserListeSousFaces(
  caisson: Article | null,
  articlesSF: Article[],
  couleurDemandee?: string | null
): {
  recommandees: Article[];
  autres: Article[];
  dimLabel: string;
} {
  if (!caisson || articlesSF.length === 0) {
    return { recommandees: articlesSF, autres: [], dimLabel: '' };
  }

  const dimCaisson = extraireDimensionCaisson(caisson);
  const rawColor = couleurDemandee || extraireCouleur(caisson.designation);
  const couleurCible = extraireCouleur(rawColor || undefined);
  const labelDim = dimCaisson > 0 ? (dimCaisson === 400 ? '40' : dimCaisson === 350 ? '35' : dimCaisson === 300 ? '30' : dimCaisson === 250 ? '25' : dimCaisson === 200 ? '20' : `${dimCaisson}`) : '';

  if (dimCaisson <= 0) {
    return { recommandees: articlesSF, autres: [], dimLabel: '' };
  }

  const recommandees: Article[] = [];
  const autres: Article[] = [];

  for (const sf of articlesSF) {
    const dimSF = extraireDimensionCaisson(sf);
    if (dimSF === dimCaisson || (dimCaisson === 350 && dimSF === 400)) {
      recommandees.push(sf);
    } else {
      autres.push(sf);
    }
  }

  // Trier les recommandées pour mettre en premier celle qui a la couleur demandée
  recommandees.sort((a, b) => {
    const ca = extraireCouleur(a.designation);
    const cb = extraireCouleur(b.designation);
    if (couleurCible) {
      if (ca === couleurCible && cb !== couleurCible) return -1;
      if (cb === couleurCible && ca !== couleurCible) return 1;
    }
    return a.designation.localeCompare(b.designation);
  });

  return { recommandees, autres, dimLabel: labelDim };
}

/**
 * Moustiquaire : Propage la couleur du Cadre vers la Coulisse et la Barre Inférieure.
 * Règle demandée :
 * "la meme logique pour mousitquire si cadr bl coulisse blanc"
 */
export function trouverCoulissePourCadreMSTQ(cadre: Article | null, articlesCoulisse: Article[]): Article | null {
  if (!cadre || articlesCoulisse.length === 0) return articlesCoulisse[0] || null;

  const couleurCadre = extraireCouleur(cadre.designation);
  if (!couleurCadre) return articlesCoulisse[0] || null;

  const match = articlesCoulisse.find(c => extraireCouleur(c.designation) === couleurCadre);
  return match || articlesCoulisse[0];
}

export function trouverBarreInfPourCadreMSTQ(cadre: Article | null, articlesBarreInf: Article[]): Article | null {
  if (!cadre || articlesBarreInf.length === 0) return articlesBarreInf[0] || null;

  const couleurCadre = extraireCouleur(cadre.designation);
  if (!couleurCadre) return articlesBarreInf[0] || null;

  const match = articlesBarreInf.find(b => extraireCouleur(b.designation) === couleurCadre);
  return match || articlesBarreInf[0];
}

/**
 * Trie et optimise la liste des Coulisses MSTQ selon la couleur du cadre sélectionné.
 */
export function optimiserListeCoulissesMSTQ(cadre: Article | null, articlesCoulisse: Article[]): {
  recommandees: Article[];
  autres: Article[];
} {
  if (!cadre || articlesCoulisse.length === 0) {
    return { recommandees: articlesCoulisse, autres: [] };
  }
  const couleurCadre = extraireCouleur(cadre.designation);
  if (!couleurCadre) return { recommandees: articlesCoulisse, autres: [] };

  const recommandees = articlesCoulisse.filter(c => extraireCouleur(c.designation) === couleurCadre);
  const autres = articlesCoulisse.filter(c => extraireCouleur(c.designation) !== couleurCadre);

  return {
    recommandees: recommandees.length > 0 ? recommandees : articlesCoulisse,
    autres: recommandees.length > 0 ? autres : []
  };
}

/**
 * Détermine si un profilé (Tablier, Lame Finale, Coulisse) correspond au standard 55mm (sinon 43mm/40mm).
 */
export function isHauteur55(art?: Article | { designation?: string; hauteur?: number } | null): boolean {
  if (!art) return false;
  if (art.hauteur === 55) return true;
  if (art.hauteur === 43 || art.hauteur === 40) return false;
  const d = (art.designation || '').toUpperCase();
  return /\b55\b|TAB\s*55|TBL\s*55|LF\s*55|FINALE\s*55/i.test(d);
}

/**
 * Tablier : Trouve automatiquement la Lame Finale correspondant à la Lame de Tablier.
 * - Assortiment rigoureux de la hauteur (55mm avec 55mm, 43mm avec 43mm)
 * - Assortiment automatique de la couleur (7024/G7024, BL, 9007, etc.)
 */
export function trouverLameFinalePourTablier(tablier: Article | null, articlesLameFinale: Article[]): Article | null {
  if (!tablier || articlesLameFinale.length === 0) return articlesLameFinale[0] || null;

  const is55 = isHauteur55(tablier);
  const couleurTablier = extraireCouleur(tablier.designation);

  // 1. Filtrer les lames finales par hauteur (55 vs 43)
  const lfParHauteur = articlesLameFinale.filter(lf => isHauteur55(lf) === is55);
  const pool = lfParHauteur.length > 0 ? lfParHauteur : articlesLameFinale;

  // 2. Chercher avec la même couleur
  if (couleurTablier) {
    const matchCouleur = pool.find(lf => extraireCouleur(lf.designation) === couleurTablier);
    if (matchCouleur) return matchCouleur;
  }

  // 3. Fallback : standard / blanc ou premier
  const matchBlanc = pool.find(lf => extraireCouleur(lf.designation) === 'BL');
  return matchBlanc || pool[0];
}

/**
 * Tablier : Trouve la Coulisse assortie pour Volet Roulant.
 */
export function trouverCoulissePourTablier(tablier: Article | null, articlesCoulisses: Article[]): Article | null {
  if (!tablier || articlesCoulisses.length === 0) return articlesCoulisses[0] || null;

  const is55 = isHauteur55(tablier);
  const couleurTablier = extraireCouleur(tablier.designation);

  // Filtrer par type / hauteur
  const coulissesCompatibles = articlesCoulisses.filter(c => isHauteur55(c) === is55);
  const pool = coulissesCompatibles.length > 0 ? coulissesCompatibles : articlesCoulisses;

  if (couleurTablier) {
    const match = pool.find(c => extraireCouleur(c.designation) === couleurTablier);
    if (match) return match;
  }

  const matchBlanc = pool.find(c => extraireCouleur(c.designation) === 'BL');
  return matchBlanc || pool[0];
}

/**
 * Optimise et trie la liste des Lames Finales selon le tablier sélectionné.
 */
export function optimiserListeLamesFinales(tablier: Article | null, articlesLameFinale: Article[]): {
  recommandees: Article[];
  autres: Article[];
} {
  if (!tablier || articlesLameFinale.length === 0) {
    return { recommandees: articlesLameFinale, autres: [] };
  }

  const is55 = isHauteur55(tablier);
  const couleurTablier = extraireCouleur(tablier.designation);

  const recommandees: Article[] = [];
  const autres: Article[] = [];

  for (const lf of articlesLameFinale) {
    const lfIs55 = isHauteur55(lf);
    if (is55 === lfIs55) {
      recommandees.push(lf);
    } else {
      autres.push(lf);
    }
  }

  // Trier les recommandées avec la couleur correspondante en tête
  recommandees.sort((a, b) => {
    if (couleurTablier) {
      const ca = extraireCouleur(a.designation);
      const cb = extraireCouleur(b.designation);
      if (ca === couleurTablier && cb !== couleurTablier) return -1;
      if (cb === couleurTablier && ca !== couleurTablier) return 1;
    }
    return a.designation.localeCompare(b.designation);
  });

  return {
    recommandees: recommandees.length > 0 ? recommandees : articlesLameFinale,
    autres
  };
}
