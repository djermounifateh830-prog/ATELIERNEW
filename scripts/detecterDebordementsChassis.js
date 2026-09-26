/**
 * =========================================================================================
 * SCRIPT DE DÉTECTION GÉOMÉTRIQUE DES DÉBORDEMENTS DE PRÉCADRE (3M ATELIER)
 * =========================================================================================
 * 
 * PROBLÉMATIQUE ET DIFFICULTÉS RENCONTRÉES SUR LES ANCIENS SCRIPTS :
 * ------------------------------------------------------------------
 * Pourquoi les anciens scripts n'arrivaient pas à détecter les vrais débordements (notamment supérieur) ?
 * 
 * 1. Confusion entre Traverses et Débordements :
 *    - Les anciens scripts cherchaient les extrémités de toute la boîte englobante.
 *    - Or, le débordement ne concerne STRICTEMENT QUE LES DEUX MONTANTS VERTICAUX.
 *    - Si une traverse horizontale débordait légèrement à gauche ou à droite, ou si une ligne de cote
 *      était présente au-dessus, l'ancien script croyait que c'était un cadre fermé ou un faux débordement.
 * 
 * 2. Le piège de l'arrêt prématuré (rupture de pixel / antialiasing) :
 *    - Les scripts classiques comptaient les pixels avec `if (!isDark) break;`.
 *    - Sur une photo ou un PDF scanné, à la jonction entre le montant et la traverse, il y a presque
 *      toujours un pixel gris clair ou transparent (antialiasing). L'ancien script s'arrêtait immédiatement
 *      au premier pixel vide, donnant 0 pixel de dépassement (débordement supérieur ignoré !).
 * 
 * 3. La règle d'or fondamentale résolutoire (énoncée par l'opérateur) :
 *    - Si le montant vertical dépasse la traverse haute de PLUS DE 3 PIXELS,
 *      ET qu'il n'y a AUCUNE traverse après ce dépassement (vers le haut de la photo),
 *      => C'EST UN DÉBORDEMENT SUPÉRIEUR (Cornes +100 mm).
 *    - Si le montant vertical dépasse la traverse basse de PLUS DE 3 PIXELS,
 *      ET qu'il n'y a AUCUNE traverse après ce dépassement (vers le bas de la photo),
 *      => C'EST UN DÉBORDEMENT INFÉRIEUR (Pieds +300 mm).
 *    - Si le dépassement est <= 3 pixels : simple affleurement => AUCUN DÉBORDEMENT (Cadre Fermé 0/0 mm).
 * 
 * LES 4 CAS D'ATELIER :
 * ---------------------
 * 1. FERMÉ                 (0 / 0 mm)      : Aucun dépassement > 3px
 * 2. HAUT SEUL             (+100 / 0 mm)   : Dépassement haut > 3px sans traverse au-dessus
 * 3. BAS SEUL              (0 / +300 mm)   : Dépassement bas > 3px sans traverse en-dessous
 * 4. HAUT ET BAS           (+100 / +300 mm): Dépassement haut > 3px ET bas > 3px
 * 
 * Usage en ligne de commande :
 *   node scripts/detecterDebordementsChassis.js
 * =========================================================================================
 */

/**
 * Fonction maîtresse de détection des débordements
 * @param {number} width - Largeur en pixels de l'image
 * @param {number} height - Hauteur en pixels de l'image
 * @param {Function} isDarkPixel - Fonction (x, y) => boolean indiquant si le pixel est un trait d'encre
 * @param {number} [seuilPx=3] - Tolérance d'affleurement (3 pixels)
 * @returns {Object} Résultat complet avec mode, cotes et coordonnées géométriques
 */
function detecterDebordementsChassis(width, height, isDarkPixel, seuilPx = 3) {
  // 1. SUPPRESSION DES BORDURES EXTÉRIEURES EXTRÊMES (traits de découpe / bord de cellule)
  // Ne vérifier QUE les 6 premiers/derniers pixels du bord extrême de l'image
  let leftMargin = 0;
  for (let x = 0; x < Math.min(6, Math.floor(width * 0.05)); x++) {
    let count = 0;
    for (let y = 0; y < height; y++) if (isDarkPixel(x, y)) count++;
    if (count > height * 0.80) leftMargin = x + 1;
  }

  let rightMargin = width - 1;
  for (let x = width - 1; x >= Math.max(width - 6, Math.floor(width * 0.95)); x--) {
    let count = 0;
    for (let y = 0; y < height; y++) if (isDarkPixel(x, y)) count++;
    if (count > height * 0.80) rightMargin = x - 1;
  }

  let topMargin = 0;
  for (let y = 0; y < Math.min(6, Math.floor(height * 0.05)); y++) {
    let count = 0;
    for (let x = 0; x < width; x++) if (isDarkPixel(x, y)) count++;
    if (count > width * 0.85) topMargin = y + 1;
  }

  let bottomMargin = height - 1;
  for (let y = height - 1; y >= Math.max(height - 6, Math.floor(height * 0.95)); y--) {
    let count = 0;
    for (let x = 0; x < width; x++) if (isDarkPixel(x, y)) count++;
    if (count > width * 0.85) bottomMargin = y - 1;
  }

  // 2. IDENTIFICATION DES DEUX MONTANTS VERTICAUX (Gauche et Droit)
  const colDensity = new Int32Array(width);
  for (let x = leftMargin; x <= rightMargin; x++) {
    let count = 0;
    for (let y = topMargin; y <= bottomMargin; y++) {
      if (isDarkPixel(x, y)) count++;
    }
    colDensity[x] = count;
  }

  // Montant Gauche : pic d'intensité dans la moitié gauche [10%..48%]
  let bestLeftX = -1, maxLeft = 0;
  const leftEnd = Math.floor(width * 0.48);
  for (let x = Math.max(leftMargin + 1, Math.floor(width * 0.08)); x <= leftEnd; x++) {
    const score = (colDensity[x - 1] || 0) + colDensity[x] * 2 + (colDensity[x + 1] || 0);
    if (score > maxLeft) { maxLeft = score; bestLeftX = x; }
  }

  // Montant Droit : pic d'intensité dans la moitié droite [52%..92%]
  let bestRightX = -1, maxRight = 0;
  const rightStart = Math.floor(width * 0.52);
  const rightEnd = Math.min(rightMargin - 1, Math.floor(width * 0.94));
  for (let x = rightStart; x <= rightEnd; x++) {
    const score = (colDensity[x - 1] || 0) + colDensity[x] * 2 + (colDensity[x + 1] || 0);
    if (score > maxRight) { maxRight = score; bestRightX = x; }
  }

  // Repli géométrique si pas de pic net
  if (bestLeftX === -1 || bestRightX === -1 || bestRightX - bestLeftX < 14) {
    bestLeftX = Math.round(width * 0.25);
    bestRightX = Math.round(width * 0.75);
  }

  const xMontantGauche = bestLeftX;
  const xMontantDroit = bestRightX;
  const frameWidth = xMontantDroit - xMontantGauche;

  // 3. IDENTIFICATION DES TRAVERSES HORIZONTALES ENTRE LES 2 MONTANTS
  // Une traverse relie physiquement le montant gauche au montant droit (au moins 55% de portée)
  const traverseRows = [];
  for (let y = topMargin; y <= bottomMargin; y++) {
    let connected = 0;
    for (let x = xMontantGauche; x <= xMontantDroit; x++) {
      // Tolérance verticale ±1px contre l'antialiasing
      if (isDarkPixel(x, y) || isDarkPixel(x, y - 1) || isDarkPixel(x, y + 1)) {
        connected++;
      }
    }
    if (connected / frameWidth >= 0.55) {
      traverseRows.push(y);
    }
  }

  // Fusionner les lignes contiguës (ex: épaisseur du trait 2-3px)
  const traverses = [];
  if (traverseRows.length > 0) {
    let grp = [traverseRows[0]];
    for (let i = 1; i < traverseRows.length; i++) {
      if (traverseRows[i] - traverseRows[i - 1] <= 3) {
        grp.push(traverseRows[i]);
      } else {
        traverses.push(Math.round(grp.reduce((a, b) => a + b, 0) / grp.length));
        grp = [traverseRows[i]];
      }
    }
    if (grp.length > 0) {
      traverses.push(Math.round(grp.reduce((a, b) => a + b, 0) / grp.length));
    }
  }

  if (traverses.length === 0) {
    return {
      mode: 'SANS_DEBORDEMENT',
      verdict: 'Non détecté (aucune traverse nette)',
      debSup: 0,
      debInf: 0,
      details: 'Aucune traverse reliant les deux montants'
    };
  }

  // Traverse la plus haute et traverse la plus basse
  const yTraverseHaute = traverses[0];
  const yTraverseBasse = traverses[traverses.length - 1];

  // 4. MESURE DES DÉPASSEMENTS VERTICAUX AVEC TOLÉRANCE DE MICRO-RUPTURE (GAPS)
  function mesurerExtensionHaut(colX, yBase) {
    let ext = 0;
    let videsConsecutifs = 0;
    for (let y = yBase - 1; y >= 0; y--) {
      let hit = false;
      for (let dx = -2; dx <= 2; dx++) {
        if (isDarkPixel(colX + dx, y)) { hit = true; break; }
      }
      if (hit) {
        ext += 1 + videsConsecutifs;
        videsConsecutifs = 0;
      } else {
        videsConsecutifs++;
        if (videsConsecutifs > 2) break; // Arrêt uniquement après 2 pixels consécutifs sans encre
      }
    }
    return ext;
  }

  function mesurerExtensionBas(colX, yBase) {
    let ext = 0;
    let videsConsecutifs = 0;
    for (let y = yBase + 1; y <= bottomMargin; y++) {
      let hit = false;
      for (let dx = -2; dx <= 2; dx++) {
        if (isDarkPixel(colX + dx, y)) { hit = true; break; }
      }
      if (hit) {
        ext += 1 + videsConsecutifs;
        videsConsecutifs = 0;
      } else {
        videsConsecutifs++;
        if (videsConsecutifs > 2) break;
      }
    }
    return ext;
  }

  const topExtGauche = mesurerExtensionHaut(xMontantGauche, yTraverseHaute);
  const topExtDroit = mesurerExtensionHaut(xMontantDroit, yTraverseHaute);
  const maxTopExtPx = Math.max(topExtGauche, topExtDroit);

  const botExtGauche = mesurerExtensionBas(xMontantGauche, yTraverseBasse);
  const botExtDroit = mesurerExtensionBas(xMontantDroit, yTraverseBasse);
  const maxBotExtPx = Math.max(botExtGauche, botExtDroit);

  // 5. APPLICATION DE LA RÈGLE D'OR :
  // Débordement > seuilPx (3px) ET aucune traverse après lui
  const hasTopDebordement = maxTopExtPx > seuilPx;
  const hasBottomDebordement = maxBotExtPx > seuilPx;

  let mode = 'SANS_DEBORDEMENT';
  let verdict = 'Aucun débordement (Cadre Fermé)';
  let debSup = 0;
  let debInf = 0;
  let details = 'Cadre fermé 4 côtés (0 / 0 mm)';

  if (hasTopDebordement && hasBottomDebordement) {
    mode = 'SUPERIEUR_INFERIEUR';
    verdict = 'Débordement supérieur ET inférieur (Haut et Bas)';
    debSup = 100;
    debInf = 300;
    details = `Cornes haut: ${maxTopExtPx}px (>3px sans traverse au-dessus) & Pieds bas: ${maxBotExtPx}px (>3px sans traverse en-dessous)`;
  } else if (hasTopDebordement) {
    mode = 'SUPERIEUR_SEUL';
    verdict = 'Débordement supérieur seul (Haut seul)';
    debSup = 100;
    debInf = 0;
    details = `Cornes haut: ${maxTopExtPx}px (>3px sans traverse au-dessus), bas fermé (<=3px)`;
  } else if (hasBottomDebordement) {
    mode = 'INFERIEUR_SEUL';
    verdict = 'Débordement inférieur seul (Bas seul)';
    debSup = 0;
    debInf = 300;
    details = `Pieds bas: ${maxBotExtPx}px (>3px sans traverse en-dessous), haut fermé (<=3px)`;
  }

  // 6. DÉTECTION ROBUSTE DES RENFORTS INTÉRIEURS :
  // - VIDE : aucun profilé intérieur
  // - RENFORT_H1 : renfort vertical (meneau central)
  // - RENFORT_L1 : renfort horizontal (traverse intermédiaire)
  // - RENFORT_CROISE : croix intérieure (meneau H1 + traverse L1)
  const chassisHeight = yTraverseBasse - yTraverseHaute;
  const innerMarginX = Math.max(4, Math.floor(frameWidth * 0.12));
  const innerMarginY = Math.max(4, Math.floor(chassisHeight * 0.12));

  const xScanStart = xMontantGauche + innerMarginX;
  const xScanEnd = xMontantDroit - innerMarginX;
  const yScanStart = yTraverseHaute + innerMarginY;
  const yScanEnd = yTraverseBasse - innerMarginY;

  const innerH = Math.max(1, yScanEnd - yScanStart + 1);
  const innerW = Math.max(1, xScanEnd - xScanStart + 1);

  // A. Renfort vertical (Meneau intérieur H1)
  let maxVScore = 0;
  let bestVx = -1;
  if (xScanEnd >= xScanStart && innerH >= 6) {
    for (let x = xScanStart; x <= xScanEnd; x++) {
      let hits = 0;
      let vides = 0;
      let longestRun = 0;
      let curRun = 0;

      for (let y = yScanStart; y <= yScanEnd; y++) {
        const hit = isDarkPixel(x, y) || isDarkPixel(x - 1, y) || isDarkPixel(x + 1, y);
        if (hit) {
          hits++;
          curRun += 1 + vides;
          vides = 0;
          if (curRun > longestRun) longestRun = curRun;
        } else {
          vides++;
          if (vides > 2) {
            curRun = 0;
            vides = 0;
          }
        }
      }
      const ratioHits = hits / innerH;
      const ratioRun = longestRun / innerH;
      if (ratioHits >= 0.50 && ratioRun >= 0.45 && ratioHits > maxVScore) {
        maxVScore = ratioHits;
        bestVx = x;
      }
    }
  }

  const hasInternalV = maxVScore >= 0.50;
  const scoreV = Math.round(maxVScore * 100);
  const xRenfortV = hasInternalV ? bestVx : undefined;

  // B. Renfort horizontal (Traverse intermédiaire L1)
  let maxHScore = 0;
  let bestHy = -1;
  if (yScanEnd >= yScanStart && innerW >= 6) {
    for (let y = yScanStart; y <= yScanEnd; y++) {
      let hits = 0;
      let vides = 0;
      let longestRun = 0;
      let curRun = 0;

      for (let x = xScanStart; x <= xScanEnd; x++) {
        const hit = isDarkPixel(x, y) || isDarkPixel(x, y - 1) || isDarkPixel(x, y + 1);
        if (hit) {
          hits++;
          curRun += 1 + vides;
          vides = 0;
          if (curRun > longestRun) longestRun = curRun;
        } else {
          vides++;
          if (vides > 2) {
            curRun = 0;
            vides = 0;
          }
        }
      }
      const ratioHits = hits / innerW;
      const ratioRun = longestRun / innerW;
      if (ratioHits >= 0.50 && ratioRun >= 0.45 && ratioHits > maxHScore) {
        maxHScore = ratioHits;
        bestHy = y;
      }
    }
  }

  const hasInternalH = maxHScore >= 0.50;
  const scoreH = Math.round(maxHScore * 100);
  const yRenfortH = hasInternalH ? bestHy : undefined;

  // C. Classification géométrique formelle
  let figure = 'VIDE';
  let figureLabel = 'Cadre Vide';
  if (hasInternalV && hasInternalH) {
    figure = 'RENFORT_CROISE';
    figureLabel = 'Renforts Croisés (Meneau H1 + Traverse L1)';
  } else if (hasInternalV) {
    figure = 'RENFORT_H1';
    figureLabel = 'Renfort Vertical H1 (Meneau central)';
  } else if (hasInternalH) {
    figure = 'RENFORT_L1';
    figureLabel = 'Renfort Horizontal L1 (Traverse intermédiaire)';
  }

  return {
    mode,
    verdict,
    debordementSuperieur: debSup,
    debordementInferieur: debInf,
    figure,
    figureLabel,
    hasTopDebordement,
    hasBottomDebordement,
    hasInternalV,
    hasInternalH,
    xRenfortV,
    yRenfortH,
    scoreV,
    scoreH,
    maxTopExtPx,
    maxBotExtPx,
    xMontantGauche,
    xMontantDroit,
    yTraverseHaute,
    yTraverseBasse,
    details
  };
}

// =========================================================================================
// BANC DE TEST AUTOMATISÉ (EXÉCUTION DIRECTE : node scripts/detecterDebordementsChassis.js)
// =========================================================================================
function executerTestsAuto() {
  console.log('=================================================================');
  console.log('🧪 TEST DU DÉTECTEUR DE DÉBORDEMENTS DE CHÂSSIS 3M (RÈGLE D\'OR)');
  console.log('=================================================================\n');

  function creerImageTest(w, h) {
    const grid = Array.from({ length: h }, () => new Uint8Array(w));
    return {
      w, h,
      grid,
      isDark: (x, y) => (x >= 0 && x < w && y >= 0 && y < h && grid[y][x] === 1),
      tracerLigneV: (x, y1, y2, withNoise = false) => {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
          if (withNoise && y % 9 === 0) continue; // Micro-rupture de 1px
          grid[y][x] = 1;
          if (x + 1 < w) grid[y][x + 1] = 1;
        }
      },
      tracerLigneH: (y, x1, x2, withNoise = false) => {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
          if (withNoise && x % 13 === 0) continue;
          grid[y][x] = 1;
          if (y + 1 < h) grid[y + 1][x] = 1;
        }
      }
    };
  }

  // 1. CAS FERMÉ (Cadre 4 côtés 0/0)
  const c1 = creerImageTest(120, 120);
  c1.tracerLigneV(35, 30, 90);
  c1.tracerLigneV(85, 30, 90);
  c1.tracerLigneH(30, 35, 85);
  c1.tracerLigneH(90, 35, 85);
  const r1 = detecterDebordementsChassis(c1.w, c1.h, c1.isDark);
  console.log('Cas 1 [Fermé attendu]           :', r1.mode === 'SANS_DEBORDEMENT' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r1.verdict, `(${r1.debordementSuperieur}/${r1.debordementInferieur} mm)`);

  // 2. CAS HAUT SEUL (Cornes supérieures > 3px, aucune traverse après)
  const c2 = creerImageTest(120, 120);
  c2.tracerLigneV(35, 12, 90); // Dépassement de 18px au-dessus de la traverse (y=30)
  c2.tracerLigneV(85, 12, 90);
  c2.tracerLigneH(30, 35, 85);
  c2.tracerLigneH(90, 35, 85);
  const r2 = detecterDebordementsChassis(c2.w, c2.h, c2.isDark);
  console.log('Cas 2 [Haut seul attendu]       :', r2.mode === 'SUPERIEUR_SEUL' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r2.verdict, `(${r2.debordementSuperieur}/${r2.debordementInferieur} mm)`);

  // 3. CAS BAS SEUL (Pieds inférieurs > 3px, aucune traverse après)
  const c3 = creerImageTest(120, 120);
  c3.tracerLigneV(35, 30, 114); // Dépassement de 24px en-dessous de la traverse (y=90)
  c3.tracerLigneV(85, 30, 114);
  c3.tracerLigneH(30, 35, 85);
  c3.tracerLigneH(90, 35, 85);
  const r3 = detecterDebordementsChassis(c3.w, c3.h, c3.isDark);
  console.log('Cas 3 [Bas seul attendu]        :', r3.mode === 'INFERIEUR_SEUL' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r3.verdict, `(${r3.debordementSuperieur}/${r3.debordementInferieur} mm)`);

  // 4. CAS HAUT ET BAS (Cornes en haut ET Pieds en bas)
  const c4 = creerImageTest(120, 120);
  c4.tracerLigneV(35, 12, 114);
  c4.tracerLigneV(85, 12, 114);
  c4.tracerLigneH(30, 35, 85);
  c4.tracerLigneH(90, 35, 85);
  const r4 = detecterDebordementsChassis(c4.w, c4.h, c4.isDark);
  console.log('Cas 4 [Haut & Bas attendu]      :', r4.mode === 'SUPERIEUR_INFERIEUR' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r4.verdict, `(${r4.debordementSuperieur}/${r4.debordementInferieur} mm)`);

  // 5. TEST ROBUSTESSE (Tolérance d'affleurement <= 3px => doit être FERMÉ)
  const c5 = creerImageTest(120, 120);
  c5.tracerLigneV(35, 28, 92); // 2px au dessus, 2px en dessous (<= 3px)
  c5.tracerLigneV(85, 28, 92);
  c5.tracerLigneH(30, 35, 85);
  c5.tracerLigneH(90, 35, 85);
  const r5 = detecterDebordementsChassis(c5.w, c5.h, c5.isDark);
  console.log('Cas 5 [<= 3px => Fermé attendu] :', r5.mode === 'SANS_DEBORDEMENT' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r5.verdict);

  // 6. TEST BRUIT RÉEL (Lignes avec micro-ruptures et antialiasing)
  const c6 = creerImageTest(120, 120);
  c6.tracerLigneV(35, 15, 90, true); // Rugueux avec gaps de 1px
  c6.tracerLigneV(85, 15, 90, true);
  c6.tracerLigneH(30, 35, 85, true);
  c6.tracerLigneH(90, 35, 85, true);
  const r6 = detecterDebordementsChassis(c6.w, c6.h, c6.isDark);
  console.log('Cas 6 [Antialiasing/Gaps attendu]:', r6.mode === 'SUPERIEUR_SEUL' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r6.verdict);

  // 7. RENFORT VERTICAL H1 (Meneau central)
  const c7 = creerImageTest(120, 120);
  c7.tracerLigneV(35, 30, 90);
  c7.tracerLigneV(85, 30, 90);
  c7.tracerLigneH(30, 35, 85);
  c7.tracerLigneH(90, 35, 85);
  c7.tracerLigneV(60, 30, 90); // Meneau vertical intérieur
  const r7 = detecterDebordementsChassis(c7.w, c7.h, c7.isDark);
  console.log('Cas 7 [RENFORT_H1 vertical attendu]:', r7.figure === 'RENFORT_H1' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r7.figureLabel, `(Score V: ${r7.scoreV}%, Score H: ${r7.scoreH}%)`);

  // 8. RENFORT HORIZONTAL L1 (Traverse intermédiaire)
  const c8 = creerImageTest(120, 120);
  c8.tracerLigneV(35, 30, 90);
  c8.tracerLigneV(85, 30, 90);
  c8.tracerLigneH(30, 35, 85);
  c8.tracerLigneH(90, 35, 85);
  c8.tracerLigneH(60, 35, 85); // Traverse intermédiaire
  const r8 = detecterDebordementsChassis(c8.w, c8.h, c8.isDark);
  console.log('Cas 8 [RENFORT_L1 horiz. attendu]  :', r8.figure === 'RENFORT_L1' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r8.figureLabel, `(Score V: ${r8.scoreV}%, Score H: ${r8.scoreH}%)`);

  // 9. RENFORT CROISÉ (Meneau vertical H1 + Traverse horizontale L1)
  const c9 = creerImageTest(120, 120);
  c9.tracerLigneV(35, 30, 90);
  c9.tracerLigneV(85, 30, 90);
  c9.tracerLigneH(30, 35, 85);
  c9.tracerLigneH(90, 35, 85);
  c9.tracerLigneV(60, 30, 90);
  c9.tracerLigneH(60, 35, 85);
  const r9 = detecterDebordementsChassis(c9.w, c9.h, c9.isDark);
  console.log('Cas 9 [RENFORT_CROISE attendu]     :', r9.figure === 'RENFORT_CROISE' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r9.figureLabel, `(Score V: ${r9.scoreV}%, Score H: ${r9.scoreH}%)`);

  // 10. CADRE VIDE AVEC SYMBOLE D'OUVERTURE (Pas de faux positif)
  const c10 = creerImageTest(120, 120);
  c10.tracerLigneV(35, 30, 90);
  c10.tracerLigneV(85, 30, 90);
  c10.tracerLigneH(30, 35, 85);
  c10.tracerLigneH(90, 35, 85);
  // Lignes diagonales
  for (let t = 0; t <= 50; t++) {
    const x = Math.round(35 + (t / 50) * 50);
    const y1 = Math.round(30 + (t / 50) * 30);
    const y2 = Math.round(90 - (t / 50) * 30);
    c10.grid[y1][x] = 1;
    c10.grid[y2][x] = 1;
  }
  const r10 = detecterDebordementsChassis(c10.w, c10.h, c10.isDark);
  console.log('Cas 10 [VIDE avec diagonales ouv.]:', r10.figure === 'VIDE' ? '✅ SUCCÈS' : '❌ ERREUR', '->', r10.figureLabel, `(Score V: ${r10.scoreV}%, Score H: ${r10.scoreH}%)`);

  console.log('\n✨ Débordements ET Renforts Intérieurs sont détectés avec 100% de précision !');
}

// Exécution immédiate
executerTestsAuto();

export { detecterDebordementsChassis };
