/**
 * Test de la logique demandée par l'utilisateur :
 * "si nous avons 3 travers = renfort horizontal ,si nous avons 3 montant verticaux = renfort verticl , si les deux =croisé ; si aucune =vide"
 */

function detecterChassis3Traverses3Montants(width, height, isStroke, seuilPx = 3) {
  // 1. Suppression des bordures extérieures extrêmes (grille tableau PDF / bords)
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

  // 2. Détection globale des montants verticaux (histogramme et scan de connectivité)
  const fullHeight = bottomMargin - topMargin + 1;
  const fullWidth = rightMargin - leftMargin + 1;

  // Calcul préliminaire des colonnes et lignes avec encre
  // Un montant vertical est une colonne continue de profilé
  const colStrokeCount = new Int32Array(width);
  for (let x = leftMargin; x <= rightMargin; x++) {
    for (let y = topMargin; y <= bottomMargin; y++) {
      if (isStroke(x, y) || isStroke(x - 1, y) || isStroke(x + 1, y)) {
        colStrokeCount[x]++;
      }
    }
  }

  // Identifier les colonnes montants : densité verticale >= 45% de la hauteur utile
  const rawMontantCols = [];
  for (let x = leftMargin; x <= rightMargin; x++) {
    if (colStrokeCount[x] / fullHeight >= 0.45) {
      rawMontantCols.push(x);
    }
  }

  // Regrouper les colonnes contiguës (profilés épais ou traits doubles) en montants distincts
  // Deux profilés distincts sont séparés d'au moins 8% de la largeur du châssis
  const clusterGapX = Math.max(5, Math.floor(fullWidth * 0.08));
  const montants = [];
  if (rawMontantCols.length > 0) {
    let currentGroup = [rawMontantCols[0]];
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

  // Si pas de montants détectés, repli classique par tiers
  let xMontantGauche = montants.length > 0 ? montants[0] : Math.round(width * 0.25);
  let xMontantDroit = montants.length > 1 ? montants[montants.length - 1] : Math.round(width * 0.75);

  const chassisWidth = xMontantDroit - xMontantGauche;

  // 3. Détection des traverses horizontales (lignes horizontales reliant gauche à droite)
  const rawTraverseRows = [];
  for (let y = topMargin; y <= bottomMargin; y++) {
    let span = 0;
    for (let x = xMontantGauche; x <= xMontantDroit; x++) {
      if (isStroke(x, y) || isStroke(x, y - 1) || isStroke(x, y + 1)) {
        span++;
      }
    }
    if (span / chassisWidth >= 0.45) {
      rawTraverseRows.push(y);
    }
  }

  // Regrouper les lignes contiguës en traverses distinctes
  const clusterGapY = Math.max(5, Math.floor(fullHeight * 0.08));
  const traverses = [];
  if (rawTraverseRows.length > 0) {
    let currentGroup = [rawTraverseRows[0]];
    for (let i = 1; i < rawTraverseRows.length; i++) {
      if (rawTraverseRows[i] - rawTraverseRows[i - 1] <= clusterGapY) {
        currentGroup.push(rawTraverseRows[i]);
      } else {
        traverses.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
        currentGroup = [rawTraverseRows[i]];
      }
    }
    if (currentGroup.length > 0) {
      traverses.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
    }
  }

  if (traverses.length === 0) {
    return { error: 'Aucune traverse détectée' };
  }

  const yTraverseHaute = traverses[0];
  const yTraverseBasse = traverses[traverses.length - 1];

  // Refiner la détection des montants verticaux strictement entre yTraverseHaute et yTraverseBasse
  // Cela garantit de détecter aussi les montants intérieurs (meneaux) qui s'arrêtent aux traverses
  const frameH = yTraverseBasse - yTraverseHaute;
  const innerMontantCols = [];
  for (let x = leftMargin; x <= rightMargin; x++) {
    let span = 0;
    for (let y = yTraverseHaute; y <= yTraverseBasse; y++) {
      if (isStroke(x, y) || isStroke(x - 1, y) || isStroke(x + 1, y)) {
        span++;
      }
    }
    if (span / frameH >= 0.50) {
      innerMontantCols.push(x);
    }
  }

  const montantsConfirmes = [];
  if (innerMontantCols.length > 0) {
    let currentGroup = [innerMontantCols[0]];
    for (let i = 1; i < innerMontantCols.length; i++) {
      if (innerMontantCols[i] - innerMontantCols[i - 1] <= clusterGapX) {
        currentGroup.push(innerMontantCols[i]);
      } else {
        montantsConfirmes.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
        currentGroup = [innerMontantCols[i]];
      }
    }
    if (currentGroup.length > 0) {
      montantsConfirmes.push(Math.round(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length));
    }
  }

  const listeMontants = montantsConfirmes.length >= 2 ? montantsConfirmes : montants;
  xMontantGauche = listeMontants[0];
  xMontantDroit = listeMontants[listeMontants.length - 1];

  // 4. APPLICATION DE LA LOGIQUE EXACTE DEMANDÉE PAR L'UTILISATEUR :
  // "si nous avons 3 travers = renfort horizontal ,si nous avons 3 montant verticaux = renfort verticl , si les deux =croisé ; si aucune =vide"
  const nbTraverses = traverses.length;
  const nbMontants = listeMontants.length;

  const hasRenfortH = nbTraverses >= 3;
  const hasRenfortV = nbMontants >= 3;

  let figure = 'VIDE';
  let figureLabel = 'Cadre Vide';

  if (hasRenfortH && hasRenfortV) {
    figure = 'RENFORT_CROISE';
    figureLabel = `Renforts Croisés (${nbTraverses} traverses, ${nbMontants} montants)`;
  } else if (hasRenfortV) {
    figure = 'RENFORT_H1';
    figureLabel = `Renfort Vertical H1 (${nbMontants} montants verticaux)`;
  } else if (hasRenfortH) {
    figure = 'RENFORT_L1';
    figureLabel = `Renfort Horizontal L1 (${nbTraverses} traverses horizontales)`;
  } else {
    figure = 'VIDE';
    figureLabel = `Cadre Vide (${nbTraverses} traverses, ${nbMontants} montants)`;
  }

  // 5. Mesure des débordements verticaux des montants extérieurs (> 3px sans traverse après)
  function tracerExtensionHaut(colX, yBase) {
    let ext = 0;
    let vides = 0;
    for (let y = yBase - 1; y >= 0; y--) {
      let hit = false;
      for (let dx = -2; dx <= 2; dx++) {
        if (isStroke(colX + dx, y)) { hit = true; break; }
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
        if (isStroke(colX + dx, y)) { hit = true; break; }
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

  const topExtG = tracerExtensionHaut(xMontantGauche, yTraverseHaute);
  const topExtD = tracerExtensionHaut(xMontantDroit, yTraverseHaute);
  const maxTopStubPx = Math.max(topExtG, topExtD);

  const botExtG = tracerExtensionBas(xMontantGauche, yTraverseBasse);
  const botExtD = tracerExtensionBas(xMontantDroit, yTraverseBasse);
  const maxBotStubPx = Math.max(botExtG, botExtD);

  const hasTopStubs = maxTopStubPx > seuilPx;
  const hasBottomStubs = maxBotStubPx > seuilPx;

  let modeDetecte = 'SANS_DEBORDEMENT';
  let debSup = 0;
  let debInf = 0;

  if (hasTopStubs && hasBottomStubs) {
    modeDetecte = 'SUPERIEUR_INFERIEUR';
    debSup = 100;
    debInf = 300;
  } else if (hasTopStubs) {
    modeDetecte = 'SUPERIEUR_SEUL';
    debSup = 100;
  } else if (hasBottomStubs) {
    modeDetecte = 'INFERIEUR_SEUL';
    debInf = 300;
  }

  // Renforts positions
  const xRenfortV = hasRenfortV && listeMontants.length >= 3 ? listeMontants[1] : undefined;
  const yRenfortH = hasRenfortH && traverses.length >= 3 ? traverses[1] : undefined;

  return {
    modeDetecte,
    debSup,
    debInf,
    figureDetectee: figure,
    figureLabel,
    hasInternalV: hasRenfortV,
    hasInternalH: hasRenfortH,
    nbTraverses,
    nbMontants,
    traverses,
    montants: listeMontants,
    xMontantGauche,
    xMontantDroit,
    yTraverseHaute,
    yTraverseBasse,
    xRenfortV,
    yRenfortH,
    maxTopStubPx,
    maxBottomStubPx: maxBotStubPx
  };
}

// ================= SUITE DE TESTS =================
function creerImage(w, h) {
  const grid = new Uint8Array(w * h);
  const isDark = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    return grid[y * w + x] === 1;
  };
  const setPixel = (x, y) => {
    if (x >= 0 && x < w && y >= 0 && y < h) grid[y * w + x] = 1;
  };
  const drawVLine = (x, y1, y2, thickness = 1) => {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      for (let t = 0; t < thickness; t++) setPixel(x + t, y);
    }
  };
  const drawHLine = (y, x1, x2, thickness = 1) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      for (let t = 0; t < thickness; t++) setPixel(x, y + t);
    }
  };
  const drawDiagonal = (x1, y1, x2, y2) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x1 + (x2 - x1) * (s / steps));
      const y = Math.round(y1 + (y2 - y1) * (s / steps));
      setPixel(x, y);
    }
  };

  return { w, h, isDark, drawVLine, drawHLine, drawDiagonal };
}

console.log('=== TEST DE LA LOGIQUE 3 TRAVERSES / 3 MONTANTS ===\n');

// 1. VIDE : 2 traverses, 2 montants
{
  const img = creerImage(100, 100);
  img.drawVLine(20, 20, 80, 2);
  img.drawVLine(80, 20, 80, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 1 [VIDE attendu (2 traverses, 2 montants)] :', 
    res.figureDetectee === 'VIDE' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants)`
  );
}

// 2. VIDE avec diagonale d'ouverture (sens ouvrant)
{
  const img = creerImage(100, 100);
  img.drawVLine(20, 20, 80, 2);
  img.drawVLine(80, 20, 80, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  img.drawDiagonal(20, 20, 80, 50);
  img.drawDiagonal(80, 50, 20, 80);
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 2 [VIDE avec diagonales ouvrant] :', 
    res.figureDetectee === 'VIDE' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants)`
  );
}

// 3. RENFORT_H1 : 2 traverses, 3 montants (meneau centré x=50)
{
  const img = creerImage(100, 100);
  img.drawVLine(20, 20, 80, 2);
  img.drawVLine(80, 20, 80, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  img.drawVLine(50, 20, 80, 2); // 3e montant
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 3 [RENFORT_H1 attendu (3 montants)] :', 
    res.figureDetectee === 'RENFORT_H1' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants, meneau à x=${res.xRenfortV})`
  );
}

// 4. RENFORT_H1 décentré (meneau x=42)
{
  const img = creerImage(100, 100);
  img.drawVLine(20, 20, 80, 2);
  img.drawVLine(80, 20, 80, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  img.drawVLine(42, 20, 80, 2); // 3e montant
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 4 [RENFORT_H1 décentré attendu (3 montants)] :', 
    res.figureDetectee === 'RENFORT_H1' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants, meneau à x=${res.xRenfortV})`
  );
}

// 5. RENFORT_L1 : 3 traverses, 2 montants (traverse intermédiaire y=50)
{
  const img = creerImage(100, 100);
  img.drawVLine(20, 20, 80, 2);
  img.drawVLine(80, 20, 80, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  img.drawHLine(50, 20, 80, 2); // 3e traverse
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 5 [RENFORT_L1 attendu (3 traverses)] :', 
    res.figureDetectee === 'RENFORT_L1' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants, traverse à y=${res.yRenfortH})`
  );
}

// 6. RENFORT_L1 décentré (allège / traverse y=65)
{
  const img = creerImage(100, 100);
  img.drawVLine(20, 20, 80, 2);
  img.drawVLine(80, 20, 80, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  img.drawHLine(65, 20, 80, 2); // 3e traverse
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 6 [RENFORT_L1 décentré attendu (3 traverses)] :', 
    res.figureDetectee === 'RENFORT_L1' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants, traverse à y=${res.yRenfortH})`
  );
}

// 7. RENFORT_CROISE : 3 traverses ET 3 montants
{
  const img = creerImage(100, 100);
  img.drawVLine(20, 20, 80, 2);
  img.drawVLine(80, 20, 80, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  img.drawVLine(50, 20, 80, 2); // 3e montant
  img.drawHLine(50, 20, 80, 2); // 3e traverse
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 7 [RENFORT_CROISE attendu (3 traverses + 3 montants)] :', 
    res.figureDetectee === 'RENFORT_CROISE' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants)`
  );
}

// 8. CROISÉ + DÉBORDEMENT HAUT & BAS
{
  const img = creerImage(100, 100);
  // montants dépassent en haut (de y=5 à y=20 = 15px) et en bas (de y=80 à y=95 = 15px)
  img.drawVLine(20, 5, 95, 2);
  img.drawVLine(80, 5, 95, 2);
  img.drawHLine(20, 20, 80, 2);
  img.drawHLine(80, 20, 80, 2);
  img.drawVLine(50, 20, 80, 2); // montant intérieur
  img.drawHLine(50, 20, 80, 2); // traverse intérieure
  const res = detecterChassis3Traverses3Montants(100, 100, img.isDark);
  console.log('Cas 8 [CROISÉ + DÉBORDEMENT HAUT & BAS] :', 
    res.figureDetectee === 'RENFORT_CROISE' && res.modeDetecte === 'SUPERIEUR_INFERIEUR' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `Mode: ${res.modeDetecte} (+${res.debSup}/+${res.debInf} mm), Figure: ${res.figureDetectee}`
  );
}

// 9. PROFILÉS À DOUBLE TRAITS (Contour creux épaisseur 5px)
{
  const img = creerImage(120, 120);
  // Montant gauche double trait à x=20 et x=25
  img.drawVLine(20, 20, 100, 1);
  img.drawVLine(25, 20, 100, 1);
  // Montant droit double trait à x=95 et x=100
  img.drawVLine(95, 20, 100, 1);
  img.drawVLine(100, 20, 100, 1);
  // Traverse haute double trait à y=20 et y=25
  img.drawHLine(20, 20, 100, 1);
  img.drawHLine(25, 20, 100, 1);
  // Traverse basse double trait à y=95 et y=100
  img.drawHLine(95, 20, 100, 1);
  img.drawHLine(100, 20, 100, 1);

  const res = detecterChassis3Traverses3Montants(120, 120, img.isDark);
  console.log('Cas 9 [Profilés double traits - Cadre VIDE attendu] :', 
    res.figureDetectee === 'VIDE' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants)`
  );
}

// 10. PROFILÉS DOUBLE TRAITS AVEC MENEAU VERTICAL DOUBLE TRAIT (Renfort H1)
{
  const img = creerImage(120, 120);
  // Montant gauche double trait
  img.drawVLine(20, 20, 100, 1);
  img.drawVLine(25, 20, 100, 1);
  // Montant droit double trait
  img.drawVLine(95, 20, 100, 1);
  img.drawVLine(100, 20, 100, 1);
  // Meneau central double trait à x=58 et x=62
  img.drawVLine(58, 20, 100, 1);
  img.drawVLine(62, 20, 100, 1);
  // Traverse haute double trait
  img.drawHLine(20, 20, 100, 1);
  img.drawHLine(25, 20, 100, 1);
  // Traverse basse double trait
  img.drawHLine(95, 20, 100, 1);
  img.drawHLine(100, 20, 100, 1);

  const res = detecterChassis3Traverses3Montants(120, 120, img.isDark);
  console.log('Cas 10 [Profilés double traits avec Meneau - RENFORT_H1 attendu] :', 
    res.figureDetectee === 'RENFORT_H1' ? '✅ SUCCÈS' : '❌ ÉCHEC', 
    `(${res.nbTraverses} traverses, ${res.nbMontants} montants, meneau à x=${res.xRenfortV})`
  );
}

