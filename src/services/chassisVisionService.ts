import { FigurePrecadre, ModeDebordementPrecadre } from '../types';

export interface ResultatAnalyseVisionChassis {
  modeDetecte: ModeDebordementPrecadre;
  verdict: string;
  debordementSuperieur: number;
  debordementInferieur: number;
  figureDetectee: FigurePrecadre;
  hasTopStubs: boolean;
  hasBottomStubs: boolean;
  hasInternalV: boolean;
  hasInternalH: boolean;
  yTraverseHaute: number;
  yTraverseBasse: number;
  maxTopStubPx: number;
  maxBottomStubPx: number;
  seuilDetectionPx: number;
  details: string;
  dataUrlAnnote?: string;
}

export interface OptionsAnalyseVision {
  margePx?: number;
  annoter?: boolean;
}

/**
 * Service haute fidélité pour la détection géométrique et morphologique
 * des débordements de montants sur photos ou croquis de châssis / précadres.
 * 
 * Principe (inspiré du procédé géométrique d'atelier) :
 * 1. Isolation du contour et élimination des bordures de cartouche/vignette CAO.
 * 2. Détection des 2 montants principaux verticaux (gauche et droite).
 * 3. Repérage des traverses horizontales réelles reliant les montants.
 * 4. Détection des extensions de montants (cornes au-dessus, pieds en-dessous) :
 *    présence continue des profilés verticaux avec vide central entre eux.
 * 5. Verdict formel parmi les 4 cas fondamentaux :
 *    - FERMÉ (0 mm / 0 mm)
 *    - HAUT SEUL (+100 mm / 0 mm)
 *    - BAS SEUL (0 mm / +300 mm)
 *    - HAUT ET BAS (+100 mm / +300 mm)
 */
export class ChassisVisionService {
  /**
   * Analyse des pixels bruts (RGB, RGBA ou niveaux de gris)
   */
  public static analyserPixelsChassis(
    width: number,
    height: number,
    data: Uint8ClampedArray | Uint8Array,
    bpp = 3,
    options: OptionsAnalyseVision = {}
  ): ResultatAnalyseVisionChassis {
    const margePx = options.margePx ?? Math.max(5, Math.floor(height * 0.05));
    if (!data || width < 10 || height < 10) {
      return this.creerResultatParDefaut('Dimensions image trop faibles');
    }

    // 1. Déterminer la luminosité de fond en échantillonnant les 4 coins
    const getBrightness = (x: number, y: number): number => {
      const idx = (y * width + x) * bpp;
      if (bpp >= 3) {
        return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      }
      return data[idx];
    };

    const cornerSamples = [
      getBrightness(1, 1),
      getBrightness(width - 2, 1),
      getBrightness(1, height - 2),
      getBrightness(width - 2, height - 2),
      getBrightness(Math.floor(width / 2), 1),
      getBrightness(Math.floor(width / 2), height - 2)
    ];
    const avgBg = cornerSamples.reduce((a, b) => a + b, 0) / cornerSamples.length;
    const isDarkBg = avgBg < 128;

    const isStroke = (x: number, y: number): boolean => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false;
      const b = getBrightness(x, y);
      return isDarkBg ? b > avgBg + 30 : b < avgBg - 30;
    };

    // 2. Délimitation des zones de balayage :
    // - Montant gauche : premiers 20%
    // - Montant droit : derniers 20%
    // - Espace central (traverse de liaison) : 22% à 78%
    const leftX2 = Math.max(2, Math.floor(width * 0.20));
    const rightX1 = Math.min(width - 2, Math.floor(width * 0.80));
    const midX1 = Math.floor(width * 0.22);
    const midX2 = Math.floor(width * 0.78);
    const midW = Math.max(1, midX2 - midX1);

    // 3. Scan horizontal ligne par ligne
    interface RowInfo {
      y: number;
      leftCount: number;
      rightCount: number;
      midCount: number;
      isCrossTraverse: boolean;
      isStub: boolean;
    }

    const rows: RowInfo[] = [];
    for (let y = 0; y < height; y++) {
      let left = 0, right = 0, mid = 0;
      for (let x = 0; x < leftX2; x++) if (isStroke(x, y)) left++;
      for (let x = rightX1; x < width; x++) if (isStroke(x, y)) right++;
      for (let x = midX1; x < midX2; x++) if (isStroke(x, y)) mid++;

      const hasMontants = left > 0 || right > 0;
      const midDensity = mid / midW;
      
      // Une traverse réelle traverse et remplit l'espace central (densité >= 20%)
      const isCrossTraverse = midDensity >= 0.20;
      
      // Un débordement : les montants existent, mais l'espace central entre eux est vide
      const isStub = hasMontants && midDensity < 0.10;

      rows.push({
        y,
        leftCount: left,
        rightCount: right,
        midCount: mid,
        isCrossTraverse,
        isStub
      });
    }

    // 4. Détection des plus longues extensions consécutives (stubs) :
    // Haut : dans les premiers 45% de la hauteur
    let maxTopStub = 0;
    let curTop = 0;
    const topLimit = Math.floor(height * 0.45);
    for (let y = 0; y < topLimit; y++) {
      if (rows[y].isStub) {
        curTop++;
        if (curTop > maxTopStub) maxTopStub = curTop;
      } else {
        curTop = 0;
      }
    }

    // Bas : dans les derniers 45% de la hauteur
    let maxBottomStub = 0;
    let curBottom = 0;
    const bottomStart = Math.floor(height * 0.55);
    for (let y = bottomStart; y < height; y++) {
      if (rows[y].isStub) {
        curBottom++;
        if (curBottom > maxBottomStub) maxBottomStub = curBottom;
      } else {
        curBottom = 0;
      }
    }

    // Détection des renforts intérieurs (croisillon ou meneau vertical / horizontal)
    // Meneau vertical central : colonne centrale dense de haut en bas
    let internalVCount = 0;
    const centerColX = Math.floor(width / 2);
    for (let y = Math.floor(height * 0.25); y <= Math.floor(height * 0.75); y++) {
      if (isStroke(centerColX, y) || isStroke(centerColX - 1, y) || isStroke(centerColX + 1, y)) {
        internalVCount++;
      }
    }
    const internalVThreshold = Math.floor(height * 0.35);
    const hasInternalV = internalVCount >= internalVThreshold;

    // Traverse intermédiaire horizontale (L1) dans la zone 35% à 65%
    let internalHFound = false;
    for (let y = Math.floor(height * 0.35); y <= Math.floor(height * 0.65); y++) {
      if (rows[y].isCrossTraverse) {
        internalHFound = true;
        break;
      }
    }

    let figureDetectee: FigurePrecadre = 'VIDE';
    if (hasInternalV && internalHFound) figureDetectee = 'RENFORT_CROISE';
    else if (hasInternalV) figureDetectee = 'RENFORT_H1';
    else if (internalHFound) figureDetectee = 'RENFORT_L1';

    // Seuil de détection robuste (en ignorant les bavures ou cotes < 5-8% de la hauteur)
    const seuilDetection = Math.max(margePx, Math.max(5, Math.floor(height * 0.055)));
    const hasTopStubs = maxTopStub >= seuilDetection;
    const hasBottomStubs = maxBottomStub >= seuilDetection;

    // Traverses limites indicatives pour l'affichage visuel
    const traversesCentres = rows.filter(r => r.y >= 3 && r.y <= height - 4 && r.isCrossTraverse);
    const yTraverseHaute = traversesCentres.length > 0 ? traversesCentres[0].y : Math.floor(height * 0.15);
    const yTraverseBasse = traversesCentres.length > 0 ? traversesCentres[traversesCentres.length - 1].y : Math.floor(height * 0.85);

    // Détermination formelle des 4 cas d'atelier :
    let modeDetecte: ModeDebordementPrecadre = 'SANS_DEBORDEMENT';
    let verdict = 'Aucun débordement (Cadre Fermé)';
    let debordementSuperieur = 0;
    let debordementInferieur = 0;
    let details = 'Cadre fermé sur les 4 côtés (0 / 0 mm)';

    if (hasTopStubs && hasBottomStubs) {
      modeDetecte = 'SUPERIEUR_INFERIEUR';
      verdict = 'Débordement supérieur ET inférieur (Haut et Bas)';
      debordementSuperieur = 100;
      debordementInferieur = 300;
      details = `Cornes haut: ${maxTopStub}px (+100mm) / Pieds bas: ${maxBottomStub}px (+300mm)`;
    } else if (hasTopStubs) {
      modeDetecte = 'SUPERIEUR_SEUL';
      verdict = 'Débordement supérieur seul (Haut seul)';
      debordementSuperieur = 100;
      debordementInferieur = 0;
      details = `Cornes supérieures: ${maxTopStub}px (+100mm), bas fermé`;
    } else if (hasBottomStubs) {
      modeDetecte = 'INFERIEUR_SEUL';
      verdict = 'Débordement inférieur seul (Bas seul)';
      debordementSuperieur = 0;
      debordementInferieur = 300;
      details = `Pieds inférieurs: ${maxBottomStub}px (+300mm), haut fermé`;
    }

    return {
      modeDetecte,
      verdict,
      debordementSuperieur,
      debordementInferieur,
      figureDetectee,
      hasTopStubs,
      hasBottomStubs,
      hasInternalV,
      hasInternalH: internalHFound,
      yTraverseHaute,
      yTraverseBasse,
      maxTopStubPx: maxTopStub,
      maxBottomStubPx: maxBottomStub,
      seuilDetectionPx: seuilDetection,
      details
    };
  }

  /**
   * Analyse directement un élément HTMLImageElement, HTMLCanvasElement ou ImageData
   * avec génération de l'image annotée (lignes vertes, rouges, jaunes et verdict)
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
      const ctx = canvas.getContext('2d');
      if (!ctx) return this.creerResultatParDefaut('Contexte 2D non disponible');
      ctx.drawImage(source, 0, 0, width, height);
      imageData = ctx.getImageData(0, 0, width, height);
    }

    const res = this.analyserPixelsChassis(width, height, imageData.data, 4, options);

    // Génération du canevas annoté (exactement comme annoter_image dans le script Python)
    try {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = width;
      outCanvas.height = height;
      const outCtx = outCanvas.getContext('2d');
      if (outCtx) {
        // Redessiner l'image d'origine
        if (source instanceof ImageData) {
          outCtx.putImageData(source, 0, 0);
        } else {
          outCtx.drawImage(source, 0, 0, width, height);
        }

        // Ligne jaune = traverse haute de référence
        outCtx.strokeStyle = '#facc15';
        outCtx.lineWidth = Math.max(1, Math.floor(height * 0.015));
        outCtx.beginPath();
        outCtx.moveTo(0, res.yTraverseHaute);
        outCtx.lineTo(width, res.yTraverseHaute);
        outCtx.stroke();

        // Ligne jaune = traverse basse de référence
        outCtx.beginPath();
        outCtx.moveTo(0, res.yTraverseBasse);
        outCtx.lineTo(width, res.yTraverseBasse);
        outCtx.stroke();

        // Montants latéraux en rouge
        const leftX = Math.floor(width * 0.10);
        const rightX = Math.floor(width * 0.90);
        outCtx.strokeStyle = '#ef4444';
        outCtx.lineWidth = Math.max(2, Math.floor(width * 0.02));
        outCtx.beginPath();
        outCtx.moveTo(leftX, 0);
        outCtx.lineTo(leftX, height);
        outCtx.moveTo(rightX, 0);
        outCtx.lineTo(rightX, height);
        outCtx.stroke();

        // Bannière avec le verdict
        outCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        outCtx.fillRect(0, 0, width, Math.max(24, Math.floor(height * 0.16)));
        outCtx.fillStyle = res.modeDetecte === 'SANS_DEBORDEMENT' ? '#38bdf8' : '#4ade80';
        outCtx.font = `bold ${Math.max(10, Math.floor(height * 0.08))}px sans-serif`;
        outCtx.fillText(res.verdict, 6, Math.max(16, Math.floor(height * 0.11)));

        res.dataUrlAnnote = outCanvas.toDataURL('image/jpeg', 0.9);
      }
    } catch (e) {
      // Ignorer si le canevas est restreint
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
      hasTopStubs: false,
      hasBottomStubs: false,
      hasInternalV: false,
      hasInternalH: false,
      yTraverseHaute: 0,
      yTraverseBasse: 0,
      maxTopStubPx: 0,
      maxBottomStubPx: 0,
      seuilDetectionPx: 0,
      details
    };
  }
}
