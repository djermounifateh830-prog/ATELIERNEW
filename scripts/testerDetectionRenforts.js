/**
 * Script de test et validation chirurgicale de la détection des renforts intérieurs :
 * - VIDE (aucun renfort intérieur)
 * - RENFORT_H1 (renfort vertical seul / meneau)
 * - RENFORT_L1 (renfort horizontal seul / traverse intermédiaire)
 * - RENFORT_CROISE (renforts croisés vertical + horizontal)
 */

function analyserRenfortsEtDebordements(width, height, isDarkPixel, seuilPx = 3) {
  // 1. SUPPRESSION DES BORDURES EXTERIEURES
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

  // 2. MONTANTS GAUCHE ET DROIT
  const colDensity = new Int32Array(width);
  for (let x = leftMargin; x <= rightMargin; x++) {
    let count = 0;
    for (let y = topMargin; y <= bottomMargin; y++) {
      if (isDarkPixel(x, y)) count++;
    }
    colDensity[x] = count;
  }

  let bestLeftX = -1, maxLeft = 0;
  const leftEnd = Math.floor(width * 0.48);
  for (let x = Math.max(leftMargin + 1, Math.floor(width * 0.08)); x <= leftEnd; x++) {
    const score = (colDensity[x - 1] || 0) + colDensity[x] * 2 + (colDensity[x + 1] || 0);
    if (score > maxLeft) { maxLeft = score; bestLeftX = x; }
  }

  let bestRightX = -1, maxRight = 0;
  const rightStart = Math.floor(width * 0.52);
  const rightEnd = Math.min(rightMargin - 1, Math.floor(width * 0.94));
  for (let x = rightStart; x <= rightEnd; x++) {
    const score = (colDensity[x - 1] || 0) + colDensity[x] * 2 + (colDensity[x + 1] || 0);
    if (score > maxRight) { maxRight = score; bestRightX = x; }
  }

  if (bestLeftX === -1 || bestRightX === -1 || bestRightX - bestLeftX < 14) {
    bestLeftX = Math.round(width * 0.25);
    bestRightX = Math.round(width * 0.75);
  }

  const xMontantGauche = bestLeftX;
  const xMontantDroit = bestRightX;
  const chassisWidth = xMontantDroit - xMontantGauche;

  // 3. DÉTECTION DES TRAVERSES EXTERIEURES (HAUTE ET BASSE)
  const traverseRows = [];
  for (let y = topMargin; y <= bottomMargin; y++) {
    let connected = 0;
    for (let x = xMontantGauche; x <= xMontantDroit; x++) {
      if (isDarkPixel(x, y) || isDarkPixel(x, y - 1) || isDarkPixel(x, y + 1)) {
        connected++;
      }
    }
    if (connected / chassisWidth >= 0.55) {
      traverseRows.push(y);
    }
  }

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
    return { error: 'Aucune traverse détectée' };
  }

  const yTraverseHaute = traverses[0];
  const yTraverseBasse = traverses[traverses.length - 1];
  const chassisHeight = yTraverseBasse - yTraverseHaute;

  // 4. DÉBORDEMENTS VERTICAUX DES MONTANTS (> 3px sans traverse après)
  function tracerExtensionHaut(colX, yBase) {
    let ext = 0;
    let vides = 0;
    for (let y = yBase - 1; y >= 0; y--) {
      let hit = false;
      for (let dx = -2; dx <= 2; dx++) {
        if (isDarkPixel(colX + dx, y)) { hit = true; break; }
      }
      if (hit) {
        ext += 1 + vides;
        vides = 0;
      } else {
        vides++;
        if (vides > 2) break;
      }
    }
    return ext;
  }

  function tracerExtensionBas(colX, yBase) {
    let ext = 0;
    let vides = 0;
    for (let y = yBase + 1; y <= bottomMargin; y++) {
      let hit = false;
      for (let dx = -2; dx <= 2; dx++) {
        if (isDarkPixel(colX + dx, y)) { hit = true; break; }
      }
      if (hit) {
        ext += 1 + vides;
        vides = 0;
      } else {
        vides++;
        if (vides > 2) break;
      }
    }
    return ext;
  }

  const topExtGauche = tracerExtensionHaut(xMontantGauche, yTraverseHaute);
  const topExtDroit = tracerExtensionHaut(xMontantDroit, yTraverseHaute);
  const maxTopStubPx = Math.max(topExtGauche, topExtDroit);

  const botExtGauche = tracerExtensionBas(xMontantGauche, yTraverseBasse);
  const botExtDroit = tracerExtensionBas(xMontantDroit, yTraverseBasse);
  const maxBottomStubPx = Math.max(botExtGauche, botExtDroit);

  const hasTopStubs = maxTopStubPx > seuilPx;
  const hasBottomStubs = maxBottomStubPx > seuilPx;

  let modeDetecte = 'SANS_DEBORDEMENT';
  let debordementSuperieur = 0;
  let debordementInferieur = 0;

  if (hasTopStubs && hasBottomStubs) {
    modeDetecte = 'SUPERIEUR_INFERIEUR';
    debordementSuperieur = 100;
    debordementInferieur = 300;
  } else if (hasTopStubs) {
    modeDetecte = 'SUPERIEUR_SEUL';
    debordementSuperieur = 100;
  } else if (hasBottomStubs) {
    modeDetecte = 'INFERIEUR_SEUL';
    debordementInferieur = 300;
  }

  // 5. NOUVELLE DÉTECTION ROBUSTE DES RENFORTS INTÉRIEURS :
  // Zone intérieure d'analyse stricte :
  // Exclure les montants (12% de chaque côté) et les traverses (12% en haut et en bas)
  const innerMarginX = Math.max(4, Math.floor(chassisWidth * 0.12));
  const innerMarginY = Math.max(4, Math.floor(chassisHeight * 0.12));

  const xScanStart = xMontantGauche + innerMarginX;
  const xScanEnd = xMontantDroit - innerMarginX;
  const yScanStart = yTraverseHaute + innerMarginY;
  const yScanEnd = yTraverseBasse - innerMarginY;

  const innerH = yScanEnd - yScanStart + 1;
  const innerW = xScanEnd - xScanStart + 1;

  // A. Détection du renfort vertical (Meneau intérieur H1)
  // Balayer chaque colonne de la zone intérieure [xScanStart..xScanEnd]
  let maxVScore = 0;
  let bestVx = -1;

  for (let x = xScanStart; x <= xScanEnd; x++) {
    let hits = 0;
    for (let y = yScanStart; y <= yScanEnd; y++) {
      // Tolérance ±1px en X pour absorber l'antialiasing et l'épaisseur du profilé
      if (isDarkPixel(x, y) || isDarkPixel(x - 1, y) || isDarkPixel(x + 1, y)) {
        hits++;
      }
    }
    const ratio = hits / innerH;
    if (ratio > maxVScore) {
      maxVScore = ratio;
      bestVx = x;
    }
  }

  // Un vrai renfort vertical parcourt au moins 55% de la hauteur intérieure utile
  const hasInternalV = maxVScore >= 0.55;

  // B. Détection du renfort horizontal (Traverse intermédiaire L1)
  // Balayer chaque ligne de la zone intérieure [yScanStart..yScanEnd]
  let maxHScore = 0;
  let bestHy = -1;

  for (let y = yScanStart; y <= yScanEnd; y++) {
    let hits = 0;
    for (let x = xScanStart; x <= xScanEnd; x++) {
      // Tolérance ±1px en Y
      if (isDarkPixel(x, y) || isDarkPixel(x, y - 1) || isDarkPixel(x, y + 1)) {
        hits++;
      }
    }
    const ratio = hits / innerW;
    if (ratio > maxHScore) {
      maxHScore = ratio;
      bestHy = y;
    }
  }

  // Une vraie traverse intermédiaire couvre au moins 55% de la largeur intérieure utile
  const hasInternalH = maxHScore >= 0.55;

  // C. Classification finale parmi les 4 figures de précadre
  let figureDetectee = 'VIDE';
  if (hasInternalV && hasInternalH) {
    figureDetectee = 'RENFORT_CROISE';
  } else if (hasInternalV) {
    figureDetectee = 'RENFORT_H1';
  } else if (hasInternalH) {
    figureDetectee = 'RENFORT_L1';
  } else {
    figureDetectee = 'VIDE';
  }

  return {
    modeDetecte,
    debordementSuperieur,
    debordementInferieur,
    figureDetectee,
    hasInternalV,
    hasInternalH,
    maxVScore: Math.round(maxVScore * 100),
    maxHScore: Math.round(maxHScore * 100),
    bestVx: hasInternalV ? bestVx : undefined,
    bestHy: hasInternalH ? bestHy : undefined
  };
}

// Tests unitaires
console.log('=== TEST SUITE RENFORTS INTÉRIEURS (VIDE / H1 / L1 / CROISÉ) ===\n');

function creerGrille(w, h) {
  const g = Array.from({ length: h }, () => new Uint8Array(w));
  return {
    w, h,
    set(x, y) { if (x >= 0 && x < w && y >= 0 && y < h) g[y][x] = 1; },
    isDark(x, y) { return x >= 0 && x < w && y >= 0 && y < h && g[y][x] === 1; },
    drawVLine(x, y1, y2, thickness = 2) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let dx = 0; dx < thickness; dx++) this.set(x + dx, y);
      }
    },
    drawHLine(x1, x2, y, thickness = 2) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        for (let dy = 0; dy < thickness; dy++) this.set(x, y + dy);
      }
    }
  };
}

// 1. Cadre VIDE standard (sans renfort)
{
  const g = creerGrille(100, 100);
  // Montants gauche et droit (x=25, x=75)
  g.drawVLine(25, 20, 80);
  g.drawVLine(75, 20, 80);
  // Traverses haute et basse (y=20, y=80)
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 1 [Cadre VIDE attendu] :', res.figureDetectee === 'VIDE' ? '✅ SUCCÈS' : '❌ ÉCHEC', res);
}

// 2. Cadre VIDE avec symbole d'ouverture oscillant / battant (lignes diagonales)
{
  const g = creerGrille(100, 100);
  g.drawVLine(25, 20, 80);
  g.drawVLine(75, 20, 80);
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);
  // Triangle d'ouverture : de (25, 20) à (75, 50) et à (25, 80)
  for (let t = 0; t <= 50; t++) {
    const x = Math.round(25 + (t / 50) * 50);
    const yTop = Math.round(20 + (t / 50) * 30);
    const yBot = Math.round(80 - (t / 50) * 30);
    g.set(x, yTop);
    g.set(x, yBot);
  }

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 2 [Cadre VIDE avec diagonales ouverture] :', res.figureDetectee === 'VIDE' ? '✅ SUCCÈS' : '❌ ÉCHEC', res);
}

// 3. Cadre RENFORT VERTICAL H1 (Meneau au milieu x=50)
{
  const g = creerGrille(100, 100);
  g.drawVLine(25, 20, 80);
  g.drawVLine(75, 20, 80);
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);
  // Renfort vertical H1
  g.drawVLine(50, 20, 80);

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 3 [RENFORT_H1 attendu (centré)] :', res.figureDetectee === 'RENFORT_H1' ? '✅ SUCCÈS' : '❌ ÉCHEC', res);
}

// 4. Cadre RENFORT VERTICAL H1 légèrement décentré (x=46)
{
  const g = creerGrille(100, 100);
  g.drawVLine(25, 20, 80);
  g.drawVLine(75, 20, 80);
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);
  // Renfort vertical H1 décentré
  g.drawVLine(46, 20, 80);

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 4 [RENFORT_H1 attendu (décentré x=46)] :', res.figureDetectee === 'RENFORT_H1' ? '✅ SUCCÈS' : '❌ ÉCHEC', res);
}

// 5. Cadre RENFORT HORIZONTAL L1 (Traverse intermédiaire au milieu y=50)
{
  const g = creerGrille(100, 100);
  g.drawVLine(25, 20, 80);
  g.drawVLine(75, 20, 80);
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);
  // Traverse intermédiaire L1
  g.drawHLine(25, 75, 50);

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 5 [RENFORT_L1 attendu (centré y=50)] :', res.figureDetectee === 'RENFORT_L1' ? '✅ SUCCÈS' : '❌ ÉCHEC', res);
}

// 6. Cadre RENFORT HORIZONTAL L1 décentré (Allège / Imposte y=42)
{
  const g = creerGrille(100, 100);
  g.drawVLine(25, 20, 80);
  g.drawVLine(75, 20, 80);
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);
  // Traverse intermédiaire L1 décentrée
  g.drawHLine(25, 75, 42);

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 6 [RENFORT_L1 attendu (décentré y=42)] :', res.figureDetectee === 'RENFORT_L1' ? '✅ SUCCÈS' : '❌ ÉCHEC', res);
}

// 7. Cadre RENFORT CROISÉ (Vertical x=50 ET Horizontal y=50)
{
  const g = creerGrille(100, 100);
  g.drawVLine(25, 20, 80);
  g.drawVLine(75, 20, 80);
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);
  // Croix centrale
  g.drawVLine(50, 20, 80);
  g.drawHLine(25, 75, 50);

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 7 [RENFORT_CROISE attendu] :', res.figureDetectee === 'RENFORT_CROISE' ? '✅ SUCCÈS' : '❌ ÉCHEC', res);
}

// 8. Cadre RENFORT CROISÉ AVEC DÉBORDEMENT HAUT ET BAS (+100/+300mm)
{
  const g = creerGrille(100, 100);
  // Montants qui dépassent en haut de 10px (y=10..20) et en bas de 15px (y=80..95)
  g.drawVLine(25, 10, 95);
  g.drawVLine(75, 10, 95);
  // Traverses haute et basse
  g.drawHLine(25, 75, 20);
  g.drawHLine(25, 75, 80);
  // Renforts croisés intérieurs
  g.drawVLine(50, 20, 80);
  g.drawHLine(25, 75, 50);

  const res = analyserRenfortsEtDebordements(g.w, g.h, (x, y) => g.isDark(x, y));
  console.log('Cas 8 [CROISÉ + DÉBORDEMENT HAUT & BAS] :',
    res.figureDetectee === 'RENFORT_CROISE' && res.modeDetecte === 'SUPERIEUR_INFERIEUR' ? '✅ SUCCÈS' : '❌ ÉCHEC',
    res
  );
}
