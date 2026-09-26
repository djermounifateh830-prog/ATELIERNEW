import { FigurePrecadre, ModeDebordementPrecadre } from '../types';

export interface ResultatAnalyseVisionChassis {
  modeDetecte: ModeDebordementPrecadre;
  verdict: string;
  debordementSuperieur: number;
  debordementInferieur: number;
  figureDetectee: FigurePrecadre;
  figureLabel: string;
  hasTopStubs: boolean;
  hasBottomStubs: boolean;
  hasInternalV: boolean;
  hasInternalH: boolean;
  xMontantGauche: number;
  xMontantDroit: number;
  yTraverseHaute: number;
  yTraverseBasse: number;
  maxTopStubPx: number;
  maxBottomStubPx: number;
  seuilDetectionPx: number;
  details: string;
  dataUrlAnnote?: string;
  xRenfortV?: number;
  yRenfortH?: number;
  scoreV?: number;
  scoreH?: number;
  nbTraverses?: number;
  nbMontants?: number;
  traverses?: number[];
  montants?: number[];
}

export interface OptionsAnalyseVision {
  margePx?: number;
  annoter?: boolean;
}

/**
 * Service de vision déterministe pour la détection des débordements de montants de pré-cadre.
 * 
 * Règle d'or de l'atelier (validée opérateur) :
 * 1. Les débordements ne concernent STRICTEMENT que les DEUX MONTANTS VERTICAUX (Montant Gauche & Droit).
 *    Les traverses horizontales ne comptent jamais comme débordements.
 * 2. On identifie la traverse la plus haute (Traverse Haute) et la traverse la plus basse (Traverse Basse).
 * 3. Si les montants dépassent au-dessus de la traverse haute de PLUS DE 3 PIXELS (> 3px)
 *    ET qu'AUCUNE traverse ne vient après ce dépassement (haut ouvert / cornes) :
 *    => C'est formellement un DÉBORDEMENT SUPÉRIEUR (+100 mm).
 * 4. Si les montants dépassent en-dessous de la traverse basse de PLUS DE 3 PIXELS (> 3px)
 *    ET qu'AUCUNE traverse ne vient après ce dépassement (bas ouvert / pattes) :
 *    => C'est formellement un DÉBORDEMENT INFÉRIEUR (+300 mm).
 * 5. Si le dépassement est <= 3 pixels :
 *    => C'est une tolérance d'affleurement de coupe/tracé : AUCUN DÉBORDEMENT (Cadre Fermé).
 * 
 * Les 4 cas exclusifs d'atelier :
 * - FERMÉ : 0 / 0 mm (aucun débordement > 3px)
 * - HAUT SEUL : +100 / 0 mm (cornes > 3px en haut, bas fermé)
 * - BAS SEUL : 0 / +300 mm (pattes > 3px en bas, haut fermé)
 * - HAUT ET BAS : +100 / +300 mm (cornes > 3px ET pattes > 3px)
 */
export class ChassisVisionService {
  /**
   * Analyse géométrique directe des pixels bruts de l'image
   */
  public static analyserPixelsChassis(
    width: number,
    height: number,
    data: Uint8ClampedArray | Uint8Array,
    bpp = 4,
    options: OptionsAnalyseVision = {}
  ): ResultatAnalyseVisionChassis {
    if (!data || width < 12 || height < 12) {
      return this.creerResultatParDefaut('Dimensions d\'image insuffisantes');
    }

    const totalPixels = width * height;
    const gray = new Uint8Array(totalPixels);

    // 1. Conversion en niveaux de gris (Luminance ITU-R BT.601)
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * bpp;
      if (bpp >= 3) {
        gray[i] = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
      } else {
        gray[i] = data[idx];
      }
    }

    // 2. Détection du fond (papier clair vs fond sombre)
    const corners = [
      gray[0],
      gray[Math.min(width - 1, 5)],
      gray[width - 1],
      gray[(height - 1) * width],
      gray[(height - 1) * width + width - 1],
      gray[Math.floor(width / 2)],
      gray[(height - 1) * width + Math.floor(width / 2)]
    ];
    const avgCorner = corners.reduce((a, b) => a + b, 0) / corners.length;
    const isDarkBackground = avgCorner < 128;

    // 3. Seuil binaire adaptatif par méthode d'Otsu
    const hist = new Int32Array(256);
    for (let i = 0; i < totalPixels; i++) hist[gray[i]]++;

    let total = totalPixels;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];

    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let otsuThresh = 128;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const betweenVar = wB * wF * (mB - mF) * (mB - mF);
      if (betweenVar > maxVar) {
        maxVar = betweenVar;
        otsuThresh = t;
      }
    }

    // Seuil de binarisation avec hystérésis douce
    const threshold = isDarkBackground
      ? Math.max(otsuThresh, avgCorner + 20)
      : Math.min(otsuThresh, avgCorner - 20);

    const isStroke = (x: number, y: number): boolean => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false;
      const val = gray[y * width + x];
      return isDarkBackground ? (val > threshold) : (val < threshold);
    };

    // 4. Suppression des bordures du tableau de document (lignes de grille externes extrêmes)
    // Ne vérifier que les 6 premiers/derniers pixels du bord pour ne jamais couper une traverse ou un montant
    let leftMargin = 0;
    for (let x = 0; x < Math.min(6, Math.floor(width * 0.05)); x++) {
      let count = 0;
      for (let y = 0; y < height; y++) if (isStroke(x, y)) count++;
      if (count > height * 0.80) leftMargin = x + 1;
    }

    let rightMargin = width - 1;
    for (let x = width - 1; x >= Math.max(width - 6, Math.floor(width * 0.95)); x--) {
      let count = 0;
      for (let y = 0; y < height; y++) if (isStroke(x, y)) count++;
      if (count > height * 0.80) rightMargin = x - 1;
    }

    let topMargin = 0;
    for (let y = 0; y < Math.min(6, Math.floor(height * 0.05)); y++) {
      let count = 0;
      for (let x = 0; x < width; x++) if (isStroke(x, y)) count++;
      if (count > width * 0.85) topMargin = y + 1;
    }

    let bottomMargin = height - 1;
    for (let y = height - 1; y >= Math.max(height - 6, Math.floor(height * 0.95)); y--) {
      let count = 0;
      for (let x = 0; x < width; x++) if (isStroke(x, y)) count++;
      if (count > width * 0.85) bottomMargin = y - 1;
    }

    // 5. LOCALISATION PRÉCISE DES MONTANTS VERTICAUX ET DES TRAVERSES HORIZONTALES
    // RÈGLE DEMANDÉE PAR L'UTILISATEUR :
    // - 3 traverses = renfort horizontal (Traverse intermédiaire L1)
    // - 3 montants verticaux = renfort vertical (Meneau central H1)
    // - Les deux = renfort croisé
    // - Aucune = cadre vide (2 traverses + 2 montants)

    const fullHeight = bottomMargin - topMargin + 1;
    const fullWidth = rightMargin - leftMargin + 1;

    // A. Détection globale des colonnes avec encre verticale (montants)
    const colDensity = new Int32Array(width);
    for (let x = leftMargin; x <= rightMargin; x++) {
      let count = 0;
      for (let y = topMargin; y <= bottomMargin; y++) {
        if (isStroke(x, y) || isStroke(x - 1, y) || isStroke(x + 1, y)) count++;
      }
      colDensity[x] = count;
    }

    // Montant Gauche : pic vertical dans la zone gauche [8%..48%]
    let bestLeftX = -1;
    let maxLeftScore = 0;
    const searchLeftStart = Math.max(leftMargin + 1, Math.floor(width * 0.08));
    const searchLeftEnd = Math.floor(width * 0.48);

    for (let x = searchLeftStart; x <= searchLeftEnd; x++) {
      const smoothed = (colDensity[x - 1] || 0) + colDensity[x] * 2 + (colDensity[x + 1] || 0);
      if (smoothed > maxLeftScore) {
        maxLeftScore = smoothed;
        bestLeftX = x;
      }
    }

    // Montant Droit : pic vertical dans la zone droite [52%..94%]
    let bestRightX = -1;
    let maxRightScore = 0;
    const searchRightStart = Math.floor(width * 0.52);
    const searchRightEnd = Math.min(rightMargin - 1, Math.floor(width * 0.94));

    for (let x = searchRightStart; x <= searchRightEnd; x++) {
      const smoothed = (colDensity[x - 1] || 0) + colDensity[x] * 2 + (colDensity[x + 1] || 0);
      if (smoothed > maxRightScore) {
        maxRightScore = smoothed;
        bestRightX = x;
      }
    }

    // Repli géométrique par défaut si pic non franc
    if (bestLeftX === -1 || bestRightX === -1 || bestRightX - bestLeftX < 14) {
      bestLeftX = Math.round(width * 0.25);
      bestRightX = Math.round(width * 0.75);
    }

    let xMontantGauche = bestLeftX;
    let xMontantDroit = bestRightX;
    const chassisWidth = xMontantDroit - xMontantGauche;

    // B. DÉTECTION ROBUSTE DES TRAVERSES HORIZONTALES (reliant Montant Gauche et Montant Droit)
    const traverseRows: number[] = [];
    for (let y = topMargin; y <= bottomMargin; y++) {
      let connectedSpan = 0;
      for (let x = xMontantGauche; x <= xMontantDroit; x++) {
        if (isStroke(x, y) || isStroke(x, y - 1) || isStroke(x, y + 1)) {
          connectedSpan++;
        }
      }
      if (connectedSpan / chassisWidth >= 0.45) {
        traverseRows.push(y);
      }
    }

    // Regrouper les lignes contiguës (profilés épais ou traits doubles) en traverses physiques
    // Deux traverses distinctes sont séparées d'au moins 8% de la hauteur du châssis
    const clusterGapY = Math.max(5, Math.floor(fullHeight * 0.08));
    const traverses: number[] = [];
    if (traverseRows.length > 0) {
      let currentGroup: number[] = [traverseRows[0]];
      for (let i = 1; i < traverseRows.length; i++) {
        if (traverseRows[i] - traverseRows[i - 1] <= clusterGapY) {
          currentGroup.push(traverseRows[i]);
        } else {
          traverses.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
          currentGroup = [traverseRows[i]];
        }
      }
      if (currentGroup.length > 0) {
        traverses.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
      }
    }

    if (traverses.length === 0) {
      return this.creerResultatParDefaut('Aucune traverse horizontale reliant les montants détectée');
    }

    // Traverse la plus haute = Traverse Haute de fermeture
    // Traverse la plus basse = Traverse Basse de fermeture
    const yTraverseHaute = traverses[0];
    const yTraverseBasse = traverses[traverses.length - 1];
    const chassisHeight = yTraverseBasse - yTraverseHaute;

    // C. DÉTECTION COMPLÈTE DE TOUS LES MONTANTS VERTICAUX ENTRE yTraverseHaute ET yTraverseBasse
    // Un montant est une colonne reliant la traverse haute à la traverse basse
    const rawMontantCols: number[] = [];
    for (let x = leftMargin; x <= rightMargin; x++) {
      let span = 0;
      for (let y = yTraverseHaute; y <= yTraverseBasse; y++) {
        if (isStroke(x, y) || isStroke(x - 1, y) || isStroke(x + 1, y)) {
          span++;
        }
      }
      if (span / chassisHeight >= 0.45) {
        rawMontantCols.push(x);
      }
    }

    // Regrouper les colonnes contiguës (profilés épais ou traits doubles) en montants physiques distincts
    const clusterGapX = Math.max(5, Math.floor(fullWidth * 0.08));
    const montants: number[] = [];
    if (rawMontantCols.length > 0) {
      let currentGroup: number[] = [rawMontantCols[0]];
      for (let i = 1; i < rawMontantCols.length; i++) {
        if (rawMontantCols[i] - rawMontantCols[i - 1] <= clusterGapX) {
          currentGroup.push(rawMontantCols[i]);
        } else {
          montants.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
          currentGroup = [rawMontantCols[i]];
        }
      }
      if (currentGroup.length > 0) {
        montants.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
      }
    }

    // Consolidation des montants gauche et droit
    if (montants.length >= 2) {
      xMontantGauche = montants[0];
      xMontantDroit = montants[montants.length - 1];
    } else {
      if (montants.length === 1) {
        if (montants[0] < width * 0.5) xMontantGauche = montants[0];
        else xMontantDroit = montants[0];
      }
      if (!montants.includes(xMontantGauche)) montants.unshift(xMontantGauche);
      if (!montants.includes(xMontantDroit)) montants.push(xMontantDroit);
      montants.sort((a, b) => a - b);
    }

    // 6. APPLICATION DE LA RÈGLE DEMANDÉE PAR L'UTILISATEUR :
    // "si nous avons 3 travers = renfort horizontal ,si nous avons 3 montant verticaux = renfort verticl , si les deux =croisé ; si aucune =vide"
    const nbTraverses = traverses.length;
    const nbMontants = montants.length;

    const hasInternalH = nbTraverses >= 3;
    const hasInternalV = nbMontants >= 3;

    // Positions des renforts détectés
    // Meneau vertical intermédiaire : le montant central (si >= 3)
    let xRenfortV: number | undefined;
    if (hasInternalV) {
      xRenfortV = montants.length === 3 ? montants[1] : montants[Math.floor(montants.length / 2)];
    }

    // Traverse horizontale intermédiaire : la traverse centrale (si >= 3)
    let yRenfortH: number | undefined;
    if (hasInternalH) {
      yRenfortH = traverses.length === 3 ? traverses[1] : traverses[Math.floor(traverses.length / 2)];
    }

    let figureDetectee: FigurePrecadre = 'VIDE';
    let figureLabel = 'Cadre Vide (aucun renfort)';

    if (hasInternalV && hasInternalH) {
      figureDetectee = 'RENFORT_CROISE';
      figureLabel = `Renforts Croisés (${nbTraverses} traverses, ${nbMontants} montants)`;
    } else if (hasInternalV) {
      figureDetectee = 'RENFORT_H1';
      figureLabel = `Renfort Vertical H1 (${nbMontants} montants verticaux)`;
    } else if (hasInternalH) {
      figureDetectee = 'RENFORT_L1';
      figureLabel = `Renfort Horizontal L1 (${nbTraverses} traverses horizontales)`;
    } else {
      figureDetectee = 'VIDE';
      figureLabel = `Cadre Vide (${nbTraverses} traverses, ${nbMontants} montants)`;
    }

    const scoreV = hasInternalV ? 100 : Math.round((nbMontants / 3) * 60);
    const scoreH = hasInternalH ? 100 : Math.round((nbTraverses / 3) * 60);

    // 7. MESURE DES DÉBORDEMENTS VERTICAUX DES MONTANTS (RÈGLE D'OR DE L'ATELIER) :
    // "Si un montant vertical dépasse la traverse de plus de 3 pixels SANS QU'AUCUNE TRAVERSE NE VIENNE APRÈS LUI,
    // c'est formellement un DÉBORDEMENT !"

    const tracerDepassementHaut = (xCol: number, yDepart: number): number => {
      let extension = 0;
      let videsConsecutifs = 0;

      for (let y = yDepart - 1; y >= 0; y--) {
        let hit = false;
        for (let dx = -2; dx <= 2; dx++) {
          if (isStroke(xCol + dx, y)) {
            hit = true;
            break;
          }
        }

        if (hit) {
          extension += 1 + videsConsecutifs;
          videsConsecutifs = 0;
        } else {
          videsConsecutifs++;
          if (videsConsecutifs > 2) break;
        }
      }
      return extension;
    };

    const tracerDepassementBas = (xCol: number, yDepart: number): number => {
      let extension = 0;
      let videsConsecutifs = 0;

      for (let y = yDepart + 1; y <= bottomMargin; y++) {
        let hit = false;
        for (let dx = -2; dx <= 2; dx++) {
          if (isStroke(xCol + dx, y)) {
            hit = true;
            break;
          }
        }

        if (hit) {
          extension += 1 + videsConsecutifs;
          videsConsecutifs = 0;
        } else {
          videsConsecutifs++;
          if (videsConsecutifs > 2) break;
        }
      }
      return extension;
    };

    // A. Mesure du prolongement au-dessus de la traverse haute
    const topExtGauche = tracerDepassementHaut(xMontantGauche, yTraverseHaute);
    const topExtDroit = tracerDepassementHaut(xMontantDroit, yTraverseHaute);
    const maxTopStubPx = Math.max(topExtGauche, topExtDroit);

    // B. Mesure du prolongement en-dessous de la traverse basse
    const botExtGauche = tracerDepassementBas(xMontantGauche, yTraverseBasse);
    const botExtDroit = tracerDepassementBas(xMontantDroit, yTraverseBasse);
    const maxBottomStubPx = Math.max(botExtGauche, botExtDroit);

    const seuilDetectionPx = options.margePx ?? 3;
    const hasTopStubs = maxTopStubPx > seuilDetectionPx;
    const hasBottomStubs = maxBottomStubPx > seuilDetectionPx;

    // 8. Verdict d'atelier parmi les 4 cas fondamentaux :
    let modeDetecte: ModeDebordementPrecadre = 'SANS_DEBORDEMENT';
    let verdict = 'Aucun débordement (Cadre Fermé)';
    let debordementSuperieur = 0;
    let debordementInferieur = 0;
    let details = 'Cadre fermé 4 côtés (0 / 0 mm)';

    if (hasTopStubs && hasBottomStubs) {
      modeDetecte = 'SUPERIEUR_INFERIEUR';
      verdict = 'Débordement supérieur ET inférieur (Haut et Bas)';
      debordementSuperieur = 100;
      debordementInferieur = 300;
      details = `Cornes haut: ${maxTopStubPx}px (>3px sans traverse après) & Pieds bas: ${maxBottomStubPx}px (>3px sans traverse après)`;
    } else if (hasTopStubs) {
      modeDetecte = 'SUPERIEUR_SEUL';
      verdict = 'Débordement supérieur seul (Haut seul)';
      debordementSuperieur = 100;
      debordementInferieur = 0;
      details = `Cornes haut: ${maxTopStubPx}px (>3px sans traverse après), bas fermé (<=3px)`;
    } else if (hasBottomStubs) {
      modeDetecte = 'INFERIEUR_SEUL';
      verdict = 'Débordement inférieur seul (Bas seul)';
      debordementSuperieur = 0;
      debordementInferieur = 300;
      details = `Pieds bas: ${maxBottomStubPx}px (>3px sans traverse après), haut fermé (<=3px)`;
    }

    return {
      modeDetecte,
      verdict,
      debordementSuperieur,
      debordementInferieur,
      figureDetectee,
      figureLabel,
      hasTopStubs,
      hasBottomStubs,
      hasInternalV,
      hasInternalH,
      xMontantGauche,
      xMontantDroit,
      yTraverseHaute,
      yTraverseBasse,
      maxTopStubPx,
      maxBottomStubPx,
      seuilDetectionPx,
      details,
      xRenfortV,
      yRenfortH,
      scoreV,
      scoreH,
      nbTraverses,
      nbMontants,
      traverses,
      montants
    };
  }

  /**
   * Analyse directement un élément HTMLImageElement, HTMLCanvasElement ou ImageData
   * avec tracé de repérage visuel ultra-précis :
   * - Jaune : Traverses horizontales de fermeture haute et basse
   * - Rouge : Corps principal des 2 montants verticaux
   * - Vert : Dépassements confirmés > 3px (sans traverse après)
   * - Bleu Cyan : Renfort vertical intérieur H1 (Meneau)
   * - Violet Améthyste : Renfort horizontal intérieur L1 (Traverse intermédiaire)
   */
  public static analyserImageElement(
    source: HTMLImageElement | HTMLCanvasElement | ImageData,
    options: OptionsAnalyseVision = {}
  ): ResultatAnalyseVisionChassis {
    let width = 0;
    let height = 0;
    let imageData: ImageData;

    if (source instanceof ImageData) {
      width = source.width;
      height = source.height;
      imageData = source;
    } else {
      width = source.width;
      height = source.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return this.creerResultatParDefaut('Contexte 2D non disponible');
      ctx.drawImage(source, 0, 0, width, height);
      imageData = ctx.getImageData(0, 0, width, height);
    }

    const res = this.analyserPixelsChassis(width, height, imageData.data, 4, options);

    try {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = width;
      outCanvas.height = height;
      const outCtx = outCanvas.getContext('2d');
      if (outCtx) {
        // Redessiner l'image source intacte
        if (source instanceof ImageData) {
          outCtx.putImageData(source, 0, 0);
        } else {
          outCtx.drawImage(source, 0, 0, width, height);
        }

        // 1. Traverses haute et basse en jaune éclatant
        outCtx.strokeStyle = '#facc15';
        outCtx.lineWidth = Math.max(2, Math.floor(height * 0.02));
        outCtx.beginPath();
        outCtx.moveTo(res.xMontantGauche, res.yTraverseHaute);
        outCtx.lineTo(res.xMontantDroit, res.yTraverseHaute);
        outCtx.moveTo(res.xMontantGauche, res.yTraverseBasse);
        outCtx.lineTo(res.xMontantDroit, res.yTraverseBasse);
        outCtx.stroke();

        // 2. Montants verticaux réels en rouge vif
        outCtx.strokeStyle = '#ef4444';
        outCtx.lineWidth = Math.max(2, Math.floor(width * 0.02));
        outCtx.beginPath();
        outCtx.moveTo(res.xMontantGauche, res.yTraverseHaute);
        outCtx.lineTo(res.xMontantGauche, res.yTraverseBasse);
        outCtx.moveTo(res.xMontantDroit, res.yTraverseHaute);
        outCtx.lineTo(res.xMontantDroit, res.yTraverseBasse);
        outCtx.stroke();

        // 3. Renforts verticaux intérieurs H1 (Meneaux) en bleu cyan
        if (res.hasInternalV && res.montants && res.montants.length >= 3) {
          outCtx.strokeStyle = '#06b6d4';
          outCtx.lineWidth = Math.max(2, Math.floor(width * 0.02));
          for (let i = 1; i < res.montants.length - 1; i++) {
            outCtx.beginPath();
            outCtx.moveTo(res.montants[i], res.yTraverseHaute);
            outCtx.lineTo(res.montants[i], res.yTraverseBasse);
            outCtx.stroke();
          }
        } else if (res.hasInternalV && res.xRenfortV !== undefined) {
          outCtx.strokeStyle = '#06b6d4';
          outCtx.lineWidth = Math.max(2, Math.floor(width * 0.02));
          outCtx.beginPath();
          outCtx.moveTo(res.xRenfortV, res.yTraverseHaute);
          outCtx.lineTo(res.xRenfortV, res.yTraverseBasse);
          outCtx.stroke();
        }

        // 4. Renforts horizontaux intérieurs L1 (Traverses intermédiaires) en violet améthyste
        if (res.hasInternalH && res.traverses && res.traverses.length >= 3) {
          outCtx.strokeStyle = '#a855f7';
          outCtx.lineWidth = Math.max(2, Math.floor(height * 0.02));
          for (let i = 1; i < res.traverses.length - 1; i++) {
            outCtx.beginPath();
            outCtx.moveTo(res.xMontantGauche, res.traverses[i]);
            outCtx.lineTo(res.xMontantDroit, res.traverses[i]);
            outCtx.stroke();
          }
        } else if (res.hasInternalH && res.yRenfortH !== undefined) {
          outCtx.strokeStyle = '#a855f7';
          outCtx.lineWidth = Math.max(2, Math.floor(height * 0.02));
          outCtx.beginPath();
          outCtx.moveTo(res.xMontantGauche, res.yRenfortH);
          outCtx.lineTo(res.xMontantDroit, res.yRenfortH);
          outCtx.stroke();
        }

        // 5. Débordements confirmés en vert émeraude (Cornes en haut)
        if (res.hasTopStubs) {
          outCtx.strokeStyle = '#10b981';
          outCtx.lineWidth = Math.max(3, Math.floor(width * 0.03));
          outCtx.beginPath();
          outCtx.moveTo(res.xMontantGauche, res.yTraverseHaute - res.maxTopStubPx);
          outCtx.lineTo(res.xMontantGauche, res.yTraverseHaute);
          outCtx.moveTo(res.xMontantDroit, res.yTraverseHaute - res.maxTopStubPx);
          outCtx.lineTo(res.xMontantDroit, res.yTraverseHaute);
          outCtx.stroke();
        }

        // 6. Débordements confirmés en vert émeraude (Pieds en bas)
        if (res.hasBottomStubs) {
          outCtx.strokeStyle = '#10b981';
          outCtx.lineWidth = Math.max(3, Math.floor(width * 0.03));
          outCtx.beginPath();
          outCtx.moveTo(res.xMontantGauche, res.yTraverseBasse);
          outCtx.lineTo(res.xMontantGauche, res.yTraverseBasse + res.maxBottomStubPx);
          outCtx.moveTo(res.xMontantDroit, res.yTraverseBasse);
          outCtx.lineTo(res.xMontantDroit, res.yTraverseBasse + res.maxBottomStubPx);
          outCtx.stroke();
        }

        res.dataUrlAnnote = outCanvas.toDataURL('image/png');
      }
    } catch (e) {
      // Ignorer si contexte restreint
    }

    return res;
  }

  private static creerResultatParDefaut(details: string): ResultatAnalyseVisionChassis {
    return {
      modeDetecte: 'SANS_DEBORDEMENT',
      verdict: 'Non détecté',
      debordementSuperieur: 0,
      debordementInferieur: 0,
      figureDetectee: 'VIDE',
      figureLabel: 'Cadre Vide',
      hasTopStubs: false,
      hasBottomStubs: false,
      hasInternalV: false,
      hasInternalH: false,
      xMontantGauche: 0,
      xMontantDroit: 0,
      yTraverseHaute: 0,
      yTraverseBasse: 0,
      maxTopStubPx: 0,
      maxBottomStubPx: 0,
      seuilDetectionPx: 3,
      details,
      nbTraverses: 0,
      nbMontants: 0,
      traverses: [],
      montants: []
    };
  }
}
