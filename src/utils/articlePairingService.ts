import { Article } from '../types';

/**
 * Service intelligent d'appariement et d'héritage de dimensions et couleurs
 * pour les Caissons, Sous-Faces, Moustiquaires, Tabliers et Lames Finales.
 */

// Couleurs normalisées usuelles en menuiserie aluminium / volets roulants
export const COULEURS_CONNUES: { id: string; labels: string[]; codeRal?: string }[] = [
  { id: 'BL', labels: ['BL', 'BLANC', 'WHITE', '9010', '9016'], codeRal: '9010' },
  { id: '7024', labels: ['7024', 'ANTHRACITE', 'GRIS ANTHRACITE', 'GRIS FONCE'], codeRal: '7024' },
  { id: '7016', labels: ['7016', 'ANTHRACITE 7016'], codeRal: '7016' },
  { id: '9005', labels: ['9005', 'NOIR', 'BLACK'], codeRal: '9005' },
  { id: '9006', labels: ['9006', 'GRIS CLAIR', 'ALU GRIS', 'METAL'], codeRal: '9006' },
  { id: '9007', labels: ['9007', 'GRIS METAL 9007'], codeRal: '9007' },
  { id: '8014', labels: ['8014', 'BRUN', 'MARRON', 'CHOCOLAT'], codeRal: '8014' },
  { id: '1013', labels: ['1013', 'BEIGE', 'IVOIRE'], codeRal: '1013' },
  { id: 'CHENE', labels: ['CHENE', 'FAUX BOIS', 'BOIS', 'GOLDEN OAK', 'CHENE DORE'], codeRal: 'CHENE' },
  { id: 'BRONZE', labels: ['BRONZE', 'ANODISE'], codeRal: 'BRONZE' },
];

/**
 * Extrait la couleur d'une chaîne ou désignation d'article.
 * Retourne l'identifiant normalisé de la couleur (ex: 'BL', '7024', '9005', etc.) ou null.
 */
export function extraireCouleur(texte?: string): string | null {
  if (!texte) return null;
  const upper = texte.toUpperCase();

  // Recherche directe de codes RAL 4 chiffres (ex: 7024, 9010, 8014, 7016, etc.)
  const ralMatch = upper.match(/\b(1013|7016|7024|8014|9005|9006|9007|9010|9016)\b/);
  if (ralMatch) {
    const code = ralMatch[1];
    const found = COULEURS_CONNUES.find(c => c.labels.includes(code));
    return found ? found.id : code;
  }

  // Recherche des labels de couleurs
  for (const c of COULEURS_CONNUES) {
    for (const label of c.labels) {
      // Pour les labels courts comme 'BL', vérifier avec délimiteur de mot
      if (label.length <= 2) {
        const regex = new RegExp(`\\b${label}\\b`, 'i');
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

  if (desig.includes('300') || desig.includes(' 30 ') || desig.endsWith(' 30') || desig.includes('CT 30') || desig.includes('SF 300') || desig.includes('SF 30') || h === 30 || h === 300) {
    return 300;
  }
  if (desig.includes('250') || desig.includes(' 25 ') || desig.endsWith(' 25') || desig.includes('CT 25') || desig.includes('SF 250') || desig.includes('SF 25') || h === 25 || h === 250) {
    return 250;
  }
  if (desig.includes('200') || desig.includes(' 20 ') || desig.endsWith(' 20') || desig.includes('CT 20') || desig.includes('SF 200') || desig.includes('SF 20') || h === 20 || h === 200) {
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
 */
export function trouverSousFacePourCaisson(caisson: Article | null, articlesSF: Article[]): Article | null {
  if (!caisson || articlesSF.length === 0) return articlesSF[0] || null;

  const dimCaisson = extraireDimensionCaisson(caisson);
  const couleurCaisson = extraireCouleur(caisson.designation);

  // 1. Filtrer les sous-faces de même dimension (ex: 300 pour caisson 30)
  const sousFacesMemeDimension = dimCaisson > 0
    ? articlesSF.filter(sf => extraireDimensionCaisson(sf) === dimCaisson)
    : articlesSF;

  if (sousFacesMemeDimension.length === 0) {
    return articlesSF[0] || null;
  }

  // 2. Si le caisson a une couleur spécifiée (ex: BL, 7024), trouver la sous-face avec la même couleur
  if (couleurCaisson) {
    const matchExact = sousFacesMemeDimension.find(sf => {
      const couleurSF = extraireCouleur(sf.designation);
      return couleurSF === couleurCaisson;
    });
    if (matchExact) return matchExact;
  }

  // 3. Sinon, si le caisson n'a pas de couleur spécifiée ou couleur non trouvée,
  // privilégier la version standard/blanc ou le premier de la bonne taille
  const matchStandard = sousFacesMemeDimension.find(sf => {
    const c = extraireCouleur(sf.designation);
    return !c || c === 'BL';
  });

  return matchStandard || sousFacesMemeDimension[0] || articlesSF[0];
}

/**
 * Optimise et sépare la liste des Sous-Faces pour la présentation dans le select :
 * - `recommandees` : Sous-faces ayant rigoureusement la même dimension que le caisson (ex: 30/300),
 *   triées avec la couleur correspondante en tête.
 * - `autres` : Les autres sous-faces (autres dimensions) pour laisser le choix complet à l'utilisateur.
 */
export function optimiserListeSousFaces(caisson: Article | null, articlesSF: Article[]): {
  recommandees: Article[];
  autres: Article[];
  dimLabel: string;
} {
  if (!caisson || articlesSF.length === 0) {
    return { recommandees: articlesSF, autres: [], dimLabel: '' };
  }

  const dimCaisson = extraireDimensionCaisson(caisson);
  const couleurCaisson = extraireCouleur(caisson.designation);
  const labelDim = dimCaisson > 0 ? (dimCaisson === 300 ? '30' : dimCaisson === 250 ? '25' : dimCaisson === 200 ? '20' : `${dimCaisson}`) : '';

  if (dimCaisson <= 0) {
    return { recommandees: articlesSF, autres: [], dimLabel: '' };
  }

  const recommandees: Article[] = [];
  const autres: Article[] = [];

  for (const sf of articlesSF) {
    const dimSF = extraireDimensionCaisson(sf);
    if (dimSF === dimCaisson) {
      recommandees.push(sf);
    } else {
      autres.push(sf);
    }
  }

  // Trier les recommandées pour mettre en premier celle qui a la même couleur que le caisson
  recommandees.sort((a, b) => {
    const ca = extraireCouleur(a.designation);
    const cb = extraireCouleur(b.designation);
    if (couleurCaisson) {
      if (ca === couleurCaisson && cb !== couleurCaisson) return -1;
      if (cb === couleurCaisson && ca !== couleurCaisson) return 1;
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
 * Tablier : Trouve automatiquement la Lame Finale correspondant à la Lame de Tablier.
 * Règle demandée :
 * "dans le tablier barel si la43 bl la lame finale sera bl aussi"
 */
export function trouverLameFinalePourTablier(tablier: Article | null, articlesLameFinale: Article[]): Article | null {
  if (!tablier || articlesLameFinale.length === 0) return articlesLameFinale[0] || null;

  const desig = tablier.designation.toUpperCase();
  const is55 = desig.includes('55') || tablier.code_art === 'ART0048';
  const couleurTablier = extraireCouleur(tablier.designation);

  // 1. Filtrer les lames finales par hauteur (55 vs 43)
  const lfParHauteur = articlesLameFinale.filter(lf => {
    const lfDesig = lf.designation.toUpperCase();
    const lfIs55 = lfDesig.includes('55') || lf.code_art === 'ART0046';
    return is55 ? lfIs55 : !lfIs55;
  });

  const pool = lfParHauteur.length > 0 ? lfParHauteur : articlesLameFinale;

  // 2. Chercher avec la même couleur
  if (couleurTablier) {
    const matchCouleur = pool.find(lf => extraireCouleur(lf.designation) === couleurTablier);
    if (matchCouleur) return matchCouleur;
  }

  // 3. Fallback : standard / blanc ou premier
  const matchBlanc = pool.find(lf => {
    const c = extraireCouleur(lf.designation);
    return !c || c === 'BL';
  });

  return matchBlanc || pool[0];
}

/**
 * Tablier : Trouve la Coulisse assortie pour Volet Roulant.
 */
export function trouverCoulissePourTablier(tablier: Article | null, articlesCoulisses: Article[]): Article | null {
  if (!tablier || articlesCoulisses.length === 0) return articlesCoulisses[0] || null;

  const desig = tablier.designation.toUpperCase();
  const is55 = desig.includes('55');
  const couleurTablier = extraireCouleur(tablier.designation);

  // Filtrer par type / hauteur
  const coulissesCompatibles = articlesCoulisses.filter(c => {
    const cDesig = c.designation.toUpperCase();
    return is55 ? (cDesig.includes('55') || !cDesig.includes('43')) : (cDesig.includes('43') || !cDesig.includes('55'));
  });

  const pool = coulissesCompatibles.length > 0 ? coulissesCompatibles : articlesCoulisses;

  if (couleurTablier) {
    const match = pool.find(c => extraireCouleur(c.designation) === couleurTablier);
    if (match) return match;
  }

  return pool[0];
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

  const desig = tablier.designation.toUpperCase();
  const is55 = desig.includes('55') || tablier.code_art === 'ART0048';
  const couleurTablier = extraireCouleur(tablier.designation);

  const recommandees: Article[] = [];
  const autres: Article[] = [];

  for (const lf of articlesLameFinale) {
    const lfDesig = lf.designation.toUpperCase();
    const lfIs55 = lfDesig.includes('55') || lf.code_art === 'ART0046';
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
