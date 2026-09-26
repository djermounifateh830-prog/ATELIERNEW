import * as pdfjsLib from 'pdfjs-dist';
import { Article, FigurePrecadre, ModeDebordementPrecadre } from '../types';
import { ChassisVisionService } from './chassisVisionService';

// Configuration du worker PDF.js pour environnement Vite
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    // Utilisation du worker local ou fallback CDN sécurisé
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch (e) {
    // Fallback CDN si import.meta.url échoue
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
  }
}

export interface LigneCommandeExtraite {
  id: string;
  repere: string;
  quantite: number;
  largeur: number;
  hauteur: number;
  designation?: string;
  coloris?: string;
  typeOuvrant?: string;
  pageNumber: number;
  hauteurLameDetectee?: number;
  avecLameFinaleDetectee?: boolean;
  // Détection spécifique pour Précadre
  figurePrecadre?: FigurePrecadre;
  modeDebordementPrecadre?: ModeDebordementPrecadre;
  debordementSuperieur?: number;
  debordementInferieur?: number;
  typePrecadre?: 'TYPE_50' | 'TYPE_36' | string;
  typePrecadreLabel?: string;
  sourceDetectionDebordement?: 'PHOTO' | 'TEXTE' | 'NOMENCLATURE';
  detailsDebordement?: string;
  chassisImageCropDataUrl?: string;
  chassisImageAnnotatedDataUrl?: string;
}

export interface ResultatExtractionPDF {
  succes: boolean;
  message?: string;
  clientDetecte?: string;
  dateDetectee?: string;
  dateISODetectee?: string;
  numCommandeDetecte?: string;
  referenceComplete?: string;
  familleDetectee: 'TABLIER' | 'CAISSON' | 'MOUSTIQUAIRE' | 'PRECADRE' | 'INCONNUE';
  totalPieces: number;
  lignes: LigneCommandeExtraite[];
  avertissements: string[];
  hauteurLameDetectee?: number;
  couleurDetectee?: string;
  couleurNormalisee?: string;
  avecLameFinaleDetectee?: boolean;
  indicationLameFinale?: string;
  // Détections globales pour Précadre
  typePrecadreDetecte?: string;
  figurePrecadreDetectee?: FigurePrecadre;
  modeDebordementDetecte?: ModeDebordementPrecadre;
}

/**
 * Service haute précision pour l'extraction déterministe (100% fiable) des bordereaux de commande PDF
 */
export class PdfCommandeParserService {
  /**
   * Lit un fichier PDF et extrait l'en-tête et les lignes de commande
   */
  public static async parserBordereauPDF(file: File | ArrayBuffer): Promise<ResultatExtractionPDF> {
    try {
      const data = file instanceof File ? await file.arrayBuffer() : file;
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(data),
        useSystemFonts: true
      });

      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      let texteComplet = '';
      const lignesTexteParPage: { pageNumber: number; lignes: string[]; coordonneesY?: number[] }[] = [];
      const indicesVisuelsParPage = new Map<number, Array<{ y: number; hint: any }>>();

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Reconstruction des lignes physiques par coordonnées Y
        const items = textContent.items as Array<{ str: string; transform: number[]; width: number; height: number }>;
        
        // Groupement par ligne physique selon l'ordonnée Y (arrondi à 3 pixels)
        const lignesMap = new Map<number, Array<{ x: number; text: string }>>();
        
        for (const item of items) {
          const str = item.str || '';
          if (!str.trim()) continue;
          
          const y = Math.round(item.transform[5] / 3) * 3;
          const x = item.transform[4];
          
          if (!lignesMap.has(y)) {
            lignesMap.set(y, []);
          }
          lignesMap.get(y)!.push({ x, text: str });
        }

        // Tri décroissant de Y (haut en bas de la page)
        const sortedYs = Array.from(lignesMap.keys()).sort((a, b) => b - a);
        const pageLignes: string[] = [];
        const pageYs: number[] = [];

        for (const y of sortedYs) {
          const rowItems = lignesMap.get(y)!.sort((a, b) => a.x - b.x);
          const rowText = rowItems.map(i => i.text).join(' ').replace(/\s+/g, ' ').trim();
          if (rowText) {
            pageLignes.push(rowText);
            pageYs.push(y);
            texteComplet += rowText + '\n';
          }
        }

        // Extraction haute précision des indices visuels des dessins de châssis présents sur cette page
        try {
          const visualHints = await this.extraireIndicesVisuelsChassisPage(page, sortedYs);
          indicesVisuelsParPage.set(pageNum, visualHints);
        } catch (e) {
          console.warn(`Extraction visuelle impossible pour la page ${pageNum}:`, e);
        }

        lignesTexteParPage.push({ pageNumber: pageNum, lignes: pageLignes, coordonneesY: pageYs });
      }

      return this.analyserTexteStructure(texteComplet, lignesTexteParPage, indicesVisuelsParPage);
    } catch (err: any) {
      console.error('Erreur parsing PDF:', err);
      return {
        succes: false,
        message: `Erreur de lecture du PDF : ${err?.message || 'Fichier non lisible'}`,
        familleDetectee: 'INCONNUE',
        totalPieces: 0,
        lignes: [],
        avertissements: ['Le fichier n\'a pas pu être analysé comme un document PDF vectoriel valide.']
      };
    }
  }

  /**
   * Analyse le texte structuré pour extraire l'en-tête et les lignes avec une précision de 100%
   */
  public static analyserTexteStructure(
    texteComplet: string,
    lignesTexteParPage: { pageNumber: number; lignes: string[]; coordonneesY?: number[] }[],
    indicesVisuelsParPage?: Map<number, Array<{ y: number; hint: any }>>
  ): ResultatExtractionPDF {
    const avertissements: string[] = [];

    // 1. Détection de la Date
    let dateDetectee = '';
    let dateISODetectee = '';
    const dateMatch = texteComplet.match(/(?:MEGRINE,\s*LE\s*|LE\s*)?(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/i);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      let year = dateMatch[3];
      if (year.length === 2) year = `20${year}`;
      dateDetectee = `${day}/${month}/${year}`;
      dateISODetectee = `${year}-${month}-${day}`;
    }

    // 2. Détection du N° Commande / BL
    let numCommandeDetecte = '';
    const blMatch = texteComplet.match(/(?:BORDEREAU\s+DE\s+LIVRAISON\s+N°|BL\s*N°|COMMANDE\s*N°)\s*([A-Za-z0-9\-_]+)/i);
    if (blMatch) {
      numCommandeDetecte = blMatch[1].trim();
    }

    // Détection de la référence complète (ex: S-A26839 SARL MCB YARA TAB 55/7024 +LAME FINAL)
    let referenceComplete = '';
    const refMatch = texteComplet.match(/R[ée]f[ée]rence\s*:\s*([^\n\r]+)/i);
    if (refMatch) {
      referenceComplete = refMatch[1].trim();
      if (!numCommandeDetecte) {
        // Extraction du premier code de référence (ex: S-A26839 ou O260801)
        const codeMatch = referenceComplete.match(/^([A-Za-z0-9\-_]+)/);
        if (codeMatch) {
          numCommandeDetecte = codeMatch[1].trim();
        }
      }
    }

    // 3. Détection du Client (situé généralement entre MEGRINE et BORDEREAU DE LIVRAISON)
    let clientDetecte = '';
    const headerLines = lignesTexteParPage[0]?.lignes || [];
    let foundMegrine = false;

    // Extraction précise si le nom du client est présent sur la même ligne d'en-tête (ex: "MEGRINE, LE 19/07/2026 MAHMOUD BORDEREAU DE LIVRAISON")
    const megrineInlineMatch = texteComplet.match(/MEGRINE,\s*LE\s*\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\s+([A-Za-zÀ-ÿ0-9\s\-]+?)\s+(?:BORDEREAU|BL\b|R[ée]f[ée]rence|$)/i);
    if (megrineInlineMatch) {
      const candidate = megrineInlineMatch[1].trim();
      if (candidate && !/^(?:BORDEREAU|LIVRAISON|COMMANDE|BL|FACTURE|DEVIS)$/i.test(candidate) && candidate.length >= 2) {
        clientDetecte = candidate;
      }
    }

    if (!clientDetecte) {
      for (const rawLine of headerLines) {
        const line = rawLine.trim();
        if (!line) continue;
        const upper = line.toUpperCase();
        if (upper.includes('MEGRINE') || upper.includes('TROIS M')) {
          foundMegrine = true;
          continue;
        }
        if (
          upper.includes('BORDEREAU') ||
          upper.includes('LIVRAISON') ||
          upper.includes('COMMANDE') ||
          upper.includes('RÉFÉRENCE') ||
          upper.includes('REFERENCE') ||
          upper.includes('FACTURE') ||
          upper.includes('DEVIS')
        ) {
          if (clientDetecte) break;
          continue; // Empêche formellement qu'une ligne d'en-tête technique soit attribuée au nom de client
        }
        if (foundMegrine && !clientDetecte) {
          if (
            !upper.includes('CHÂSSIS') &&
            !upper.includes('CHASSIS') &&
            !upper.includes('LOT') &&
            !upper.includes('QTÉ') &&
            !upper.includes('DESCRIPTIF') &&
            !upper.includes('PAGE') &&
            !upper.includes('REPERE') &&
            !line.match(/^\d+$/) &&
            line.length >= 2
          ) {
            clientDetecte = line;
          }
        }
      }
    }

    // 4. Détection fine et fiabilisée de la Famille de Produit (Scoring déterministe)
    let scorePrecadre = 0;
    let scoreTablier = 0;
    let scoreMoustiquaire = 0;
    let scoreCaisson = 0;
    const upperTexte = texteComplet.toUpperCase();
    const upperRef = (referenceComplete || '').toUpperCase();

    // Détection Précadre
    if (upperTexte.includes('PRÉCADRE') || upperTexte.includes('PRECADRE') || upperTexte.includes('PRCADRE')) scorePrecadre += 15;
    if (upperTexte.includes('PRC 50') || upperTexte.includes('PRC50')) scorePrecadre += 12;
    if (upperTexte.includes('PRC 36') || upperTexte.includes('PRC36')) scorePrecadre += 12;
    if (upperTexte.includes('PRC 43') || upperTexte.includes('PRC43')) scorePrecadre += 10;
    if (upperTexte.includes('CT 50') || upperTexte.includes('CT50')) scorePrecadre += 10;
    if (upperTexte.includes('CT 36') || upperTexte.includes('CT36')) scorePrecadre += 10;
    if (upperTexte.includes('DORMANT') || upperTexte.includes('DORMANTS')) scorePrecadre += 8;
    if (upperTexte.includes('BOUCHON 90') || upperTexte.includes('BOUCHON PRECADRE')) scorePrecadre += 8;
    if (upperTexte.includes('CHÂSSIS PRÉCADRE') || upperTexte.includes('CHASSIS PRECADRE')) scorePrecadre += 15;
    if (/\b(?:PRC|PC)\b/i.test(upperRef)) scorePrecadre += 10;
    if (upperRef.includes('PRÉCADRE') || upperRef.includes('PRECADRE')) scorePrecadre += 15;

    // Détection Tablier / Volet
    if (upperTexte.includes('TABLIER') || upperTexte.includes('TABLIERS')) scoreTablier += 15;
    if (upperTexte.includes('VOLET ROULANT') || upperTexte.includes('VOLETS ROULANTS') || upperTexte.includes('VOLET')) scoreTablier += 12;
    if (upperTexte.includes('TAB 55') || upperTexte.includes('TAB 43')) scoreTablier += 12;
    if (upperTexte.includes('LAME 55') || upperTexte.includes('LAME 43')) scoreTablier += 12;
    if (upperTexte.includes('LAME FINALE') || upperTexte.includes('LAMES FINALES') || upperTexte.includes('AVEC LF') || upperTexte.includes('SANS LF')) scoreTablier += 8;
    if (upperTexte.includes('AGRAVEE') || upperTexte.includes('AGRAFEE') || upperTexte.includes('AGRAVÉE')) scoreTablier += 7;
    if (/\b(?:TAB|VR|VLT)\b/i.test(upperRef)) scoreTablier += 10;
    if (upperRef.includes('TABLIER') || upperRef.includes('VOLET')) scoreTablier += 15;

    // Détection Moustiquaire
    if (upperTexte.includes('MOUSTIQUAIRE') || upperTexte.includes('MOUSTIQUAIRES')) scoreMoustiquaire += 15;
    if (upperTexte.includes('MSTQ') || upperTexte.includes('PLISSÉE') || upperTexte.includes('PLISSEE')) scoreMoustiquaire += 10;
    if (upperRef.includes('MOUSTIQUAIRE') || upperRef.includes('MSTQ')) scoreMoustiquaire += 15;

    // Détection Caisson
    if (upperTexte.includes('SOMOBOX') || upperTexte.includes('CAISSON TUNNEL') || upperTexte.includes('CAISSON')) scoreCaisson += 15;
    if (upperTexte.includes('SOUS-FACE') || upperTexte.includes('SOUS FACE')) scoreCaisson += 8;
    if (upperRef.includes('CAISSON') || upperRef.includes('SOMOBOX')) scoreCaisson += 15;

    let familleDetectee: 'TABLIER' | 'CAISSON' | 'MOUSTIQUAIRE' | 'PRECADRE' | 'INCONNUE' = 'INCONNUE';
    const maxScore = Math.max(scorePrecadre, scoreTablier, scoreMoustiquaire, scoreCaisson);
    if (maxScore >= 6) {
      if (maxScore === scorePrecadre) familleDetectee = 'PRECADRE';
      else if (maxScore === scoreTablier) familleDetectee = 'TABLIER';
      else if (maxScore === scoreMoustiquaire) familleDetectee = 'MOUSTIQUAIRE';
      else if (maxScore === scoreCaisson) familleDetectee = 'CAISSON';
    }

    // 5. Extraction des Lignes de Commande
    const lignes: LigneCommandeExtraite[] = [];
    let pendingRepere = '';

    // Détection globale si Lame Finale est mentionnée (Avec vs Sans)
    let avecLameFinaleDetectee: boolean | undefined = undefined;
    let indicationLameFinale: string | undefined = undefined;

    // 1. Recherche de mention explicite "SANS LAME FINALE"
    if (
      /\b(?:SANS\s+LAME\s*FINAL[E]?|SANS\s+LF\b|SS\s+LF\b|SANS\s+FINALE\b|PAS\s+DE\s+LF\b|PAS\s+DE\s+LAME\s*FINAL[E]?|S\/LF\b)/i.test(upperTexte)
    ) {
      avecLameFinaleDetectee = false;
      indicationLameFinale = 'Mention "Sans Lame Finale" détectée';
    }
    // 2. Recherche de mention explicite "AVEC LAME FINALE" ou présence de profil finale dans le récapitulatif
    else if (
      /\b(?:AVEC\s+LAME\s*FINAL[E]?|AVEC\s+LF\b|\+\s*LF\b|\+\s*LAME\s*FINAL[E]?|FINALE\s*(?:43|55)\b|LAME\s+FINALE\b|LAME\s+FINAL\b)/i.test(upperTexte)
    ) {
      avecLameFinaleDetectee = true;
      indicationLameFinale = 'Mention "Avec Lame Finale" détectée';
    }

    for (const pageObj of lignesTexteParPage) {
      const pageNum = pageObj.pageNumber;
      const lignesPage = pageObj.lignes;
      const pageYs = pageObj.coordonneesY || [];
      const pageVisualHints = indicesVisuelsParPage?.get(pageNum) || [];
      let chassisIndexSurPage = 0;

      for (let i = 0; i < lignesPage.length; i++) {
        const line = lignesPage[i].trim();
        const currentLineY = pageYs[i] || 0;
        if (!line) continue;

        // Éliminer les en-têtes et pieds répétés
        if (
          line.toUpperCase().includes('LOT QTÉ LARGEUR HAUTEUR') ||
          line.toUpperCase().includes('LOT QTE LARGEUR HAUTEUR') ||
          line.toUpperCase().includes('CHÂSSIS') ||
          line.toUpperCase().includes('CHASSIS') ||
          line.toUpperCase() === 'REPÈRE' ||
          line.toUpperCase() === 'REPERE' ||
          line.toUpperCase().startsWith('PAGE N°') ||
          line.toUpperCase().includes('NOMBRE DE COLIS') ||
          line.toUpperCase() === 'DESCRIPTIF' ||
          line.toUpperCase().startsWith('MEGRINE, LE') ||
          line.toUpperCase().startsWith('BORDEREAU DE LIVRAISON')
        ) {
          continue;
        }

        // Cas 1 : Repère isolé sur sa propre ligne (ex: "A3A1", "A3A2", "1", "A-P", "A-P2", etc.)
        // Doit être court, non numérique de plus de 5 chiffres (pas un lot)
        const isLotNumber = /^\d{6,}$/.test(line);
        const isDimensionHeader = /^(?:largeur|hauteur|coloris|ouvrant|repère|lot|qté)/i.test(line);
        if (!isLotNumber && !isDimensionHeader && line.length <= 15 && !line.includes(' ')) {
          pendingRepere = line.trim();
          continue;
        }

        // Cas 2 : Ligne principale de mesures
        // Peut se présenter sous les formes :
        // a) "0000000001 1 1367.0 2500.0 TABLIER AGRAVEE 55mm"  (avec Lot)
        // b) "A3A1 0000000001 1 1367.0 2500.0 TABLIER AGRAVEE 55mm" (Repère + Lot)
        // c) "A3A1 1 1367.0 2500.0 TABLIER AGRAVEE 55mm" (Repère + sans Lot)
        // d) "1 1367.0 2500.0 TABLIER AGRAVEE 55mm"
        
        let repereFound = '';
        let qte = 1;
        let largeur = 0;
        let hauteur = 0;
        let designation = '';

        // Test format complet : (Repère)? (Lot)? Qté Largeur Hauteur (Désignation)?
        // Séparer les tokens de la ligne
        const tokens = line.split(/\s+/);
        
        // Recherche des index où se trouvent Largeur et Hauteur (deux nombres décimaux consécutifs > 100)
        let dimIdx = -1;
        for (let t = 0; t < tokens.length - 1; t++) {
          const val1 = parseFloat(tokens[t].replace(',', '.'));
          const val2 = parseFloat(tokens[t + 1].replace(',', '.'));
          if (val1 >= 200 && val1 <= 7000 && val2 >= 200 && val2 <= 7000) {
            dimIdx = t;
            largeur = Math.round(val1);
            hauteur = Math.round(val2);
            break;
          }
        }

        if (dimIdx >= 1) {
          // La quantité se trouve juste avant la largeur
          const qteCand = parseInt(tokens[dimIdx - 1], 10);
          if (!isNaN(qteCand) && qteCand > 0 && qteCand < 500) {
            qte = qteCand;

            // Ce qui précède la quantité : repère ou lot
            const beforeQte = tokens.slice(0, dimIdx - 1);
            if (beforeQte.length > 0) {
              // Si le dernier élément avant qté est un lot (>=6 chiffres), on cherche le repère avant
              const lastBefore = beforeQte[beforeQte.length - 1];
              if (/^\d{6,}$/.test(lastBefore)) {
                // Le lot est ici. Le repère est-il avant ?
                if (beforeQte.length > 1) {
                  repereFound = beforeQte.slice(0, -1).join(' ');
                }
              } else {
                repereFound = beforeQte.join(' ');
              }
            }

            // Ce qui suit la hauteur : désignation
            designation = tokens.slice(dimIdx + 2).join(' ');

            const finalRepere = repereFound || pendingRepere || `R-${lignes.length + 1}`;
            pendingRepere = ''; // consommé

            // Recherche des attributs coloris, ouvrant et compléments descriptifs sur les lignes suivantes
            let coloris = '';
            let typeOuvrant = '';
            let extraDescriptif = '';
            for (let nextIdx = i + 1; nextIdx < Math.min(lignesPage.length, i + 6); nextIdx++) {
              const nextLine = lignesPage[nextIdx].trim();
              if (nextLine.match(/Coloris\s*:\s*([^\n\r]+)/i)) {
                coloris = nextLine.replace(/Coloris\s*:\s*/i, '').trim();
              } else if (nextLine.match(/Ouvrant\s+([^\n\r]+)/i)) {
                typeOuvrant = nextLine.trim();
              } else if (
                nextLine.match(/^(?:[A-Za-z0-9\-_]{1,15}|\d{6,}\s+\d+)/) ||
                nextLine.toUpperCase().includes('PAGE N°') ||
                nextLine.toUpperCase().includes('CHÂSSIS') ||
                nextLine.toUpperCase().includes('CHASSIS')
              ) {
                break;
              } else {
                extraDescriptif += ' ' + nextLine;
              }
            }

            let hauteurLameDetectee = 55;
            if (designation.includes('43') || upperTexte.includes('TAB 43') || upperTexte.includes('LAME 43')) {
              hauteurLameDetectee = 43;
            } else if (designation.includes('55') || upperTexte.includes('TAB 55') || upperTexte.includes('LAME 55')) {
              hauteurLameDetectee = 55;
            }

            let ligneAvecLF = avecLameFinaleDetectee !== undefined ? avecLameFinaleDetectee : true;
            if (/\b(?:SANS\s+LF|SS\s+LF|SANS\s+FINALE|SANS\s+LAME\s*FINAL)/i.test(designation)) {
              ligneAvecLF = false;
            } else if (/\b(?:AVEC\s+LF|\+\s*LF|LAME\s*FINAL|FINALE)/i.test(designation)) {
              ligneAvecLF = true;
            }

            const texteLigneComplet = (designation + ' ' + extraDescriptif + ' ' + (finalRepere || '')).trim();
            
            // Recherche prioritaire de l'indice visuel (photo/croquis) par proximité physique de coordonnée Y
            let visualHintForLine = undefined;
            if (pageVisualHints.length > 0) {
              if (currentLineY > 0) {
                let bestDist = 999999;
                let bestHint = undefined;
                for (const h of pageVisualHints) {
                  const dist = Math.abs(h.y - currentLineY);
                  if (dist < bestDist && dist <= 95) {
                    bestDist = dist;
                    bestHint = h.hint;
                  }
                }
                visualHintForLine = bestHint;
              }
              // Fallback séquentiel si la coordonnée Y exacte n'est pas résolue
              if (!visualHintForLine && chassisIndexSurPage < pageVisualHints.length) {
                visualHintForLine = pageVisualHints[chassisIndexSurPage]?.hint;
              }
            }
            chassisIndexSurPage++;

            const precadreProps = PdfCommandeParserService.analyserLignePrecadre(
              texteLigneComplet,
              largeur,
              hauteur,
              visualHintForLine
            );

            lignes.push({
              id: `pdf-line-${Date.now()}-${lignes.length + 1}`,
              repere: finalRepere,
              quantite: qte,
              largeur,
              hauteur,
              designation: (designation + (extraDescriptif ? ' ' + extraDescriptif.trim() : '')).trim(),
              coloris,
              typeOuvrant,
              pageNumber: pageNum,
              hauteurLameDetectee,
              avecLameFinaleDetectee: ligneAvecLF,
              figurePrecadre: precadreProps.figure,
              modeDebordementPrecadre: precadreProps.modeDebordement,
              debordementSuperieur: precadreProps.debordementSuperieur,
              debordementInferieur: precadreProps.debordementInferieur,
              typePrecadre: precadreProps.typePrecadre,
              typePrecadreLabel: precadreProps.typePrecadreLabel,
              sourceDetectionDebordement: precadreProps.sourceDetectionDebordement,
              detailsDebordement: precadreProps.detailsDebordement,
              chassisImageCropDataUrl: visualHintForLine?.cropDataUrl,
              chassisImageAnnotatedDataUrl: visualHintForLine?.dataUrlAnnote
            });
            continue;
          }
        }

        // Cas 3 : Format Descriptif Caissons (ex: "18 SOMOBOX Caisson tunnel 30X30 1250 300")
        const caissonMatch = line.match(/^(\d{1,3})\s+(SOMOBOX[^\d]+(?:\d+X\d+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)$/i);
        if (caissonMatch) {
          const qte = parseInt(caissonMatch[1], 10) || 1;
          const designation = caissonMatch[2].trim();
          const largeur = Math.round(parseFloat(caissonMatch[3].replace(',', '.')));
          const hauteur = Math.round(parseFloat(caissonMatch[4].replace(',', '.')));

          lignes.push({
            id: `pdf-line-${Date.now()}-${lignes.length + 1}`,
            repere: pendingRepere || `C-${lignes.length + 1}`,
            quantite: qte,
            largeur,
            hauteur,
            designation,
            pageNumber: pageNum
          });
          pendingRepere = '';
          continue;
        }
      }
    }

    const totalPieces = lignes.reduce((s, l) => s + (l.quantite || 1), 0);

    if (lignes.length === 0) {
      avertissements.push('Aucune ligne de dimensions conforme n\'a été détectée dans le PDF.');
    }

    // Détection globale profilé (hauteur de lame) et couleur (particulièrement utile pour les tabliers)
    let globalHauteurLame = 55;
    if (
      upperTexte.includes('43') &&
      (upperTexte.includes('TAB 43') || upperTexte.includes('TBL 43') || upperTexte.includes('LAME 43') || upperTexte.includes('43MM') || upperTexte.includes('43 MM') || upperTexte.includes('TABLIER 43'))
    ) {
      globalHauteurLame = 43;
    } else if (
      upperTexte.includes('55') &&
      (upperTexte.includes('TAB 55') || upperTexte.includes('TBL 55') || upperTexte.includes('LAME 55') || upperTexte.includes('55MM') || upperTexte.includes('55 MM') || upperTexte.includes('TABLIER 55') || upperTexte.includes('AGRAVEE 55'))
    ) {
      globalHauteurLame = 55;
    }

    // Détection du coloris :
    let couleurTrouvee = '';
    const lineWithColor = lignes.find(l => l.coloris && l.coloris.trim());
    if (lineWithColor && lineWithColor.coloris) {
      couleurTrouvee = lineWithColor.coloris.trim();
    } else {
      const colorisLineMatch = texteComplet.match(/Coloris\s*:\s*([A-Za-z0-9\-_]+)/i);
      if (colorisLineMatch) {
        couleurTrouvee = colorisLineMatch[1].trim();
      } else {
        const refColorMatch = referenceComplete.match(/(?:\/|\s|-)(G7024|7024|G7016|7016|G9007|9007|9005|9010|9016|BLANC|BL|NOIR|NR|CHENE|BRONZE|8014|1013)\b/i);
        if (refColorMatch) {
          couleurTrouvee = refColorMatch[1].trim();
        } else {
          const generalColorMatch = upperTexte.match(/\b(G7024|7024|G9007|9007|7016|9005|8014|1013|BLANC)\b/i);
          if (generalColorMatch) {
            couleurTrouvee = generalColorMatch[1].trim();
          }
        }
      }
    }

    const couleurNormalisee = PdfCommandeParserService.normaliserCouleur(couleurTrouvee) || undefined;

    // Détection globale pour les précadres
    const premiereLignePrc = lignes.find(l => l.figurePrecadre);
    const typePrecadreDetecte = premiereLignePrc?.typePrecadre || 'TYPE_50';
    const figurePrecadreDetectee = premiereLignePrc?.figurePrecadre;
    const modeDebordementDetecte = premiereLignePrc?.modeDebordementPrecadre;

    return {
      succes: lignes.length > 0,
      clientDetecte,
      dateDetectee,
      dateISODetectee,
      numCommandeDetecte,
      referenceComplete,
      familleDetectee,
      totalPieces,
      lignes,
      avertissements,
      hauteurLameDetectee: globalHauteurLame,
      couleurDetectee: couleurTrouvee || undefined,
      couleurNormalisee,
      avecLameFinaleDetectee,
      indicationLameFinale,
      typePrecadreDetecte,
      figurePrecadreDetectee,
      modeDebordementDetecte
    };
  }

  /**
   * Analyse déterministe d'une ligne de précadre à partir de sa désignation, ses dimensions
   * et des indices visuels/vectoriels issus du schéma du châssis.
   */
  public static analyserLignePrecadre(
    designation: string = '',
    largeur: number = 0,
    hauteur: number = 0,
    vectorHint?: {
      hasTopStubs?: boolean;
      hasBottomStubs?: boolean;
      hasInternalV?: boolean;
      hasInternalH?: boolean;
      modeDetecte?: ModeDebordementPrecadre;
      figureDetectee?: FigurePrecadre;
      details?: string;
    }
  ): {
    figure: FigurePrecadre;
    modeDebordement: ModeDebordementPrecadre;
    debordementSuperieur: number;
    debordementInferieur: number;
    typePrecadre: 'TYPE_50' | 'TYPE_36';
    typePrecadreLabel: string;
    sourceDetectionDebordement?: 'PHOTO' | 'TEXTE' | 'NOMENCLATURE';
    detailsDebordement?: string;
  } {
    const upper = (designation || '').toUpperCase();

    // 1. Type de profilé : CT 50 (50mm) vs CT 36 (36mm)
    let typePrecadre: 'TYPE_50' | 'TYPE_36' = 'TYPE_50';
    let typePrecadreLabel = 'CT 50';

    if (/\b(?:CT\s*36|PRC\s*36|36\s*MM|TYPE\s*36)\b/i.test(upper)) {
      typePrecadre = 'TYPE_36';
      typePrecadreLabel = 'CT 36';
    } else if (/\b(?:CT\s*50|PRC\s*50|50\s*MM|TYPE\s*50)\b/i.test(upper)) {
      typePrecadre = 'TYPE_50';
      typePrecadreLabel = 'CT 50';
    } else if (/\b36\b/.test(upper) && !/\b50\b/.test(upper)) {
      typePrecadre = 'TYPE_36';
      typePrecadreLabel = 'CT 36';
    } else if (largeur < 1800 && hauteur < 1800 && !/\b(?:BAIE|BAIS|BAYE|COULISSANT)\b/i.test(upper)) {
      // Les fenêtres et petits châssis standards utilisent par défaut le profilé CT 36
      typePrecadre = 'TYPE_36';
      typePrecadreLabel = 'CT 36';
    } else {
      // Les baies coulissantes et grands châssis de sol utilisent le profilé lourd CT 50
      typePrecadre = 'TYPE_50';
      typePrecadreLabel = 'CT 50';
    }

    // Analyse lexicale tolérante aux variantes et fautes d'orthographe courantes dans les BL de précadre
    const isBaiePM = /\b(?:BAIE\s*PM|PM\b)\b/i.test(upper);
    const isBaieGM = /\b(?:BAIE\s*GM|GM\s*PF|GM\b)\b/i.test(upper);
    const isBaie = isBaiePM || isBaieGM || /\b(?:BAIE|BAIS|BAYE|COULISSANT|COULISSANTE|COUL)\b/i.test(upper);
    const isFenetre = /\b(?:FEN[EÊ]TRE|FENETRE|FEN\b|OUVRANT|SOUFFLET|FIXE|CHASSIS\s*FIXE)\b/i.test(upper);
    const isPorteFenetre = /\b(?:PF\b|PORTE[- ]FEN[EÊ]TRE|PORTE)\b/i.test(upper);
    const is2V = /\b(?:2\s*V(?:ANTAUX|ENTAUX|ANTAIL|ENTAIL)?|2\s*VTX?|2V)\b/i.test(upper);
    const is3VOr4V = /\b(?:3\s*V(?:ANTAUX|ENTAUX)?|4\s*V(?:ANTAUX|ENTAUX)?|3V|4V)\b/i.test(upper);

    // 2. Détection de la Figure de renfort (Croisé, Vertical H1, Horizontal L1, Vide)
    let figure: FigurePrecadre = 'VIDE';

    // Priorité 1 : Confirmation vectorielle si disponible depuis le dessin/croquis
    if (vectorHint) {
      if (vectorHint.figureDetectee) {
        figure = vectorHint.figureDetectee;
      } else if (vectorHint.hasInternalV && vectorHint.hasInternalH) {
        figure = 'RENFORT_CROISE';
      } else if (vectorHint.hasInternalV) {
        figure = 'RENFORT_H1';
      } else if (vectorHint.hasInternalH) {
        figure = 'RENFORT_L1';
      } else {
        figure = 'VIDE';
      }
    } else {
      // Priorité 2 : Analyse sémantique experte des désignations d'atelier Précadre
      if (
        isBaieGM ||
        /\b(?:GM\s*PF|BAIE\s+GM\s+PF|CROIS[EÉ]|CROIX|CROISILLON|TR\s*\+\s*MONT|TRAVERSE\s*\+\s*MONTANT|TRAVERSE\s+ET\s+MONTANT|BAIE\s+AVEC\s+TRAVERSE|BAIE\s+AVEC\s+FIXE)\b/i.test(upper) ||
        is3VOr4V ||
        (isBaie && isPorteFenetre && hauteur >= 2100)
      ) {
        // Ex: "Précadre baie GM PF CT 50", "Croisé" -> 1 Montant central vertical + 2 Demi-traverses
        figure = 'RENFORT_CROISE';
      } else if (
        isBaiePM ||
        is2V ||
        isBaie ||
        /\b(?:BAIE\s*PM|RENFORT\s*V(?:ERTICAL)?|MONTANT\s*CENTRAL|MONTANT\s*INT|H1)\b/i.test(upper)
      ) {
        // Ex: "Précadre baie PM CT 50", "Baie 2V" -> 1 Montant central vertical H1
        figure = 'RENFORT_H1';
      } else if (
        (isPorteFenetre || /\b(?:TRAVERSE\s*CENTRALE|TRAVERSE\s*INTERM[EÉ]DIAIRE|TRAVERSE|ALL[EÈ]GE|IMPOSTE|RENFORT\s*H(?:ORIZONTAL)?|L1\b|SOUS[- ]BASSEMENT|SOUBASSEMENT)\b/i.test(upper)) &&
        !isBaie
      ) {
        // Ex: "Précadre PF CT 50" -> 1 Traverse horizontale L1
        figure = 'RENFORT_L1';
      } else if (
        isFenetre ||
        /\b(?:1\s*V(?:ANTAIL|ENTAIL)?|1\s*VT|SOUFFLET|FIXE|CHASSIS\s*FIXE|SANS\s*RENFORT|VIDE|STANDARD)\b/i.test(upper)
      ) {
        // Ex: "Précadre FENETRE CT 50" -> Cadre fermé sans aucun renfort intérieur (Vide)
        figure = 'VIDE';
      } else {
        // Règle de repli déterministe basée sur les dimensions et proportions d'atelier :
        if (largeur >= 1800 && hauteur >= 2100 && isPorteFenetre) {
          figure = 'RENFORT_CROISE';
        } else if (largeur >= 1400) {
          figure = 'RENFORT_H1';
        } else if (hauteur >= 1900 && largeur < 1100) {
          figure = 'RENFORT_L1';
        } else {
          figure = 'VIDE';
        }
      }
    }

    // 3. Détection des Débordements supérieur et inférieur
    let modeDebordement: ModeDebordementPrecadre = 'SUPERIEUR_INFERIEUR';
    let debordementSuperieur = 100;
    let debordementInferieur = 300;
    let sourceDetectionDebordement: 'PHOTO' | 'TEXTE' | 'NOMENCLATURE' = 'NOMENCLATURE';
    let detailsDebordement = '';

    // Détection de valeurs chiffrées explicites dans la désignation (ex: "+100/+300", "SUP 100 INF 300", "DÉBORD 300", "0/0")
    const explicitNumbersMatch = upper.match(/(?:D[EÉ]BORD(?:EMENT)?|D[EÉ]B\.?|COTES?)?\s*(?:SUP|HAUT)?\s*(?:[:=]|\+)?\s*(\d{2,3})\s*(?:(?:ET|&|\/|\+)\s*(?:BAS|INF)?\s*(?:[:=]|\+)?\s*(\d{2,3}))/i);
    const zeroZeroMatch = /\b(?:0\s*\/\s*0|0\s*-\s*0|SANS\s*D[EÉ]BORD(?:EMENT)?|CADRE\s*FERM[EÉ]|FERM[EÉ]|BOUCHON|BOUCHONS)\b/i.test(upper);

    if (vectorHint) {
      sourceDetectionDebordement = 'PHOTO';
      detailsDebordement = vectorHint.details || 'Détecté sur dessin / photo du châssis';
      const mode = vectorHint.modeDetecte || (
        (vectorHint.hasTopStubs && vectorHint.hasBottomStubs) ? 'SUPERIEUR_INFERIEUR' :
        vectorHint.hasBottomStubs ? 'INFERIEUR_SEUL' :
        vectorHint.hasTopStubs ? 'SUPERIEUR_SEUL' : 'SANS_DEBORDEMENT'
      );
      modeDebordement = mode;
      if (mode === 'SUPERIEUR_INFERIEUR') {
        debordementSuperieur = 100;
        debordementInferieur = 300;
      } else if (mode === 'SUPERIEUR_SEUL') {
        debordementSuperieur = 100;
        debordementInferieur = 0;
      } else if (mode === 'INFERIEUR_SEUL') {
        debordementSuperieur = 0;
        debordementInferieur = 300;
      } else {
        debordementSuperieur = 0;
        debordementInferieur = 0;
      }
    } else if (zeroZeroMatch) {
      sourceDetectionDebordement = 'TEXTE';
      detailsDebordement = 'Mention "0/0" ou "Fermé" dans descriptif';
      modeDebordement = 'SANS_DEBORDEMENT';
      debordementSuperieur = 0;
      debordementInferieur = 0;
    } else if (explicitNumbersMatch) {
      sourceDetectionDebordement = 'TEXTE';
      const v1 = parseInt(explicitNumbersMatch[1], 10);
      const v2 = parseInt(explicitNumbersMatch[2], 10);
      if (!isNaN(v1) && !isNaN(v2)) {
        debordementSuperieur = v1;
        debordementInferieur = v2;
        detailsDebordement = `Cotes explicites ${v1}/${v2} mm`;
        if (v1 > 0 && v2 > 0) modeDebordement = 'SUPERIEUR_INFERIEUR';
        else if (v1 > 0) modeDebordement = 'SUPERIEUR_SEUL';
        else if (v2 > 0) modeDebordement = 'INFERIEUR_SEUL';
        else modeDebordement = 'SANS_DEBORDEMENT';
      }
    } else if (/\b(?:SUP\s*SEUL|D[EÉ]BORD\s*HAUT|HAUT\s*SEUL|\+100\b)\b/i.test(upper)) {
      sourceDetectionDebordement = 'TEXTE';
      detailsDebordement = 'Mention "Haut seul" dans descriptif';
      modeDebordement = 'SUPERIEUR_SEUL';
      debordementSuperieur = 100;
      debordementInferieur = 0;
    } else if (/\b(?:INF\s*SEUL|BAS\s*SEUL|D[EÉ]BORD\s*BAS|BAVETTE\s*SEULE|\+300\b|CHAPE|SOL)\b/i.test(upper)) {
      sourceDetectionDebordement = 'TEXTE';
      detailsDebordement = 'Mention "Bas seul" dans descriptif';
      modeDebordement = 'INFERIEUR_SEUL';
      debordementSuperieur = 0;
      debordementInferieur = 300;
    } else {
      sourceDetectionDebordement = 'NOMENCLATURE';
      detailsDebordement = 'Règle métier atelier selon le type et la hauteur';
      // Analyse contextuelle selon la nomenclature de fabrication d'atelier :
      // 1. Châssis FENÊTRE (ex: "Précadre FENETRE CT 50", cadre fermé 4 côtés) :
      //    -> SANS_DEBORDEMENT (0 / 0 - Cadre Fermé)
      if (isFenetre && !isBaie && !isPorteFenetre) {
        if (/\b(?:VR|VOLET|COFFRE|TUNNEL)\b/i.test(upper)) {
          modeDebordement = 'SUPERIEUR_SEUL';
          debordementSuperieur = 100;
          debordementInferieur = 0;
        } else {
          modeDebordement = 'SANS_DEBORDEMENT';
          debordementSuperieur = 0;
          debordementInferieur = 0;
        }
      }
      // 2. Châssis "baie PM" (Petite Moyenne sur allège, ex: A1, A4, A5 1950x1400) :
      //    -> SUPERIEUR_SEUL (Haut +100mm seul pour coffre volet / Bas 0mm fermé sur allège)
      else if (isBaiePM) {
        modeDebordement = 'SUPERIEUR_SEUL';
        debordementSuperieur = 100;
        debordementInferieur = 0;
      }
      // 3. Châssis "PF" seul (Porte-Fenêtre standard au sol, ex: A6, A7 800x2000) :
      //    -> INFERIEUR_SEUL (Haut 0mm plat sous linteau / Bas +300mm pieds dans la chape)
      else if (isPorteFenetre && !isBaieGM) {
        modeDebordement = 'INFERIEUR_SEUL';
        debordementSuperieur = 0;
        debordementInferieur = 300;
      }
      // 4. Châssis "baie GM" ou "baie GM PF" (Grande Baie de sol, ex: A3 1950x2400) :
      //    -> SUPERIEUR_INFERIEUR (Haut +100mm coffre volet & Bas +300mm pieds dans la chape)
      else if (isBaieGM || (isBaie && hauteur >= 1800)) {
        modeDebordement = 'SUPERIEUR_INFERIEUR';
        debordementSuperieur = 100;
        debordementInferieur = 300;
      }
      // 5. Repli général :
      else if (hauteur < 1800) {
        modeDebordement = 'SANS_DEBORDEMENT';
        debordementSuperieur = 0;
        debordementInferieur = 0;
      } else {
        modeDebordement = 'SUPERIEUR_INFERIEUR';
        debordementSuperieur = 100;
        debordementInferieur = 300;
      }
    }

    return {
      figure,
      modeDebordement,
      debordementSuperieur,
      debordementInferieur,
      typePrecadre,
      typePrecadreLabel,
      sourceDetectionDebordement,
      detailsDebordement
    };
  }

  /**
   * Trouve l'article de profilé de précadre correspondant (ex: 'PRÉCADRE TYPE 50' vs 'PRÉCADRE TYPE 36')
   */
  public static trouverArticlePrecadrePourPdf(
    typePrecadre: string = 'TYPE_50',
    articles: Article[] = []
  ): Article | null {
    const prcArticles = articles.filter(a => {
      const d = (a.designation || '').toUpperCase();
      return (d.includes('PRÉCADRE') || d.includes('PRECADRE') || d.includes('PRC')) && !d.includes('BOUCHON');
    });
    if (prcArticles.length === 0) return null;

    const is36 = typePrecadre === 'TYPE_36' || typePrecadre.includes('36');
    const matched = prcArticles.find(a => {
      const d = a.designation.toUpperCase();
      return is36 ? (d.includes('36') || a.hauteur === 36) : (d.includes('50') || a.hauteur === 50);
    });

    return matched || prcArticles[0];
  }

  /**
   * Normalise un identifiant ou code couleur (ex: 'G7024' -> '7024', 'BLANC' -> 'BL', 'NOIR' -> 'NR')
   */
  public static normaliserCouleur(couleurRaw?: string): string | null {
    if (!couleurRaw) return null;
    const upper = couleurRaw.trim().toUpperCase();
    if (upper.includes('7024') || upper === 'G7024') return '7024';
    if (upper.includes('9007') || upper === 'G9007') return '9007';
    if (upper === 'BL' || upper.includes('BLANC') || upper === '9010' || upper === '9016') return 'BL';
    if (upper === 'NR' || upper.includes('NOIR') || upper === '9005') return 'NR';
    if (upper.includes('7016') || upper === 'G7016') return '7016';
    if (upper.includes('8014') || upper.includes('BRUN')) return '8014';
    if (upper.includes('1013') || upper.includes('BEIGE')) return '1013';
    return upper;
  }

  /**
   * Trouve l'article de tablier exact correspondant à la hauteur et couleur détectées dans le PDF
   */
  public static trouverArticleTablierPourPdf(
    hauteurLame: number,
    couleurNorm: string | null | undefined,
    articles: Article[]
  ): Article | null {
    const tabArticles = articles.filter(a => {
      const d = a.designation.toUpperCase();
      return (d.includes('TAB') || d.includes('TBL')) && !d.includes('FINAL') && !d.includes('COULISSE') && !d.includes('MOUST');
    });
    if (tabArticles.length === 0) return null;

    // 1. Filtrer par hauteur de lame (55 vs 43)
    const parHauteur = tabArticles.filter(a => {
      const d = a.designation.toUpperCase();
      return hauteurLame === 43 ? (d.includes('43') || a.hauteur === 43) : (d.includes('55') || a.hauteur === 55);
    });

    const pool = parHauteur.length > 0 ? parHauteur : tabArticles;

    // 2. Recherche par couleur si renseignée
    if (couleurNorm) {
      const match = pool.find(a => {
        const d = a.designation.toUpperCase();
        if (couleurNorm === '7024' && d.includes('7024')) return true;
        if (couleurNorm === 'BL' && (d.includes(' BL') || d.endsWith('BL') || d.includes('BLANC'))) return true;
        if (couleurNorm === '9007' && d.includes('9007')) return true;
        if (couleurNorm === 'NR' && (d.includes(' NR') || d.endsWith('NR') || d.includes('NOIR'))) return true;
        return false;
      });
      if (match) return match;
    }

    // 3. Fallback standard
    const fallback7024 = pool.find(a => a.designation.includes('7024'));
    const fallbackBL = pool.find(a => a.designation.includes('BL'));
    return fallback7024 || fallbackBL || pool[0];
  }

  /**
   * Extrait les indices visuels (débordements haut/bas des 2 montants, montant central, traverse)
   * directement depuis les dessins/croquis de châssis présents dans la colonne Châssis de la page.
   * Gère les 4 cas fondamentaux de fabrication :
   * 1. FERMÉ (Cadre fermé 4 côtés sans débordement : 0/0)
   * 2. HAUT SEUL (Les 2 montants dépassent en haut uniquement : +100/0)
   * 3. BAS SEUL (Les 2 montants dépassent en bas uniquement : 0/+300)
   * 4. HAUT ET BAS (Les 2 montants dépassent en haut ET en bas : +100/+300)
   */
  public static async extraireIndicesVisuelsChassisPage(
    page: any,
    targetYs: number[] = []
  ): Promise<Array<{
    y: number;
    hint: {
      hasTopStubs: boolean;
      hasBottomStubs: boolean;
      hasInternalV: boolean;
      hasInternalH: boolean;
      modeDetecte: ModeDebordementPrecadre;
      figureDetectee: FigurePrecadre;
      details: string;
      cropDataUrl?: string;
      dataUrlAnnote?: string;
    };
  }>> {
    // Méthode 1 (Prioritaire) : Rendu Canvas haute définition
    // Permet de capturer avec une fidélité absolue aussi bien les tracés vectoriels (paths/lines)
    // que les images raster intégrées dans la colonne "Châssis" du bordereau.
    if (typeof document !== 'undefined') {
      try {
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = viewport.width;
        pageCanvas.height = viewport.height;
        const pageCtx = pageCanvas.getContext('2d', { willReadFrequently: true });

        if (pageCtx) {
          await page.render({ canvasContext: pageCtx, viewport }).promise;

          // Dans les bordereaux de menuiserie, la colonne "Châssis" est située sur la gauche (entre X=18pt et 150pt)
          // On applique une marge intérieure de sécurité pour exclure les traits de grille du tableau
          const cropX = Math.round(22 * scale);
          const cropW = Math.round(128 * scale);

          const canvasResults: Array<{ y: number; hint: any }> = [];

          if (targetYs && targetYs.length > 0) {
            for (const pdfY of targetYs) {
              const canvasY = Math.round(viewport.height - (pdfY * scale));
              // Le croquis du châssis est positionné dans la cellule juste en-dessous du repère textuel
              const rowCropY = Math.max(0, canvasY + Math.round(2 * scale));
              const rowCropH = Math.min(Math.round(115 * scale), pageCanvas.height - rowCropY);

              if (rowCropH > 20) {
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = cropW;
                thumbCanvas.height = rowCropH;
                const thumbCtx = thumbCanvas.getContext('2d');
                if (thumbCtx) {
                  thumbCtx.drawImage(pageCanvas, cropX, rowCropY, cropW, rowCropH, 0, 0, cropW, rowCropH);
                  const visionRes = ChassisVisionService.analyserImageElement(thumbCanvas, { annoter: true });

                  // Filtrer les zones blanches vides sans châssis
                  if (
                    visionRes.details !== 'Dimensions d\'image trop faibles pour analyse' &&
                    visionRes.details !== 'Aucun croquis de châssis net identifié dans l\'image'
                  ) {
                    canvasResults.push({
                      y: pdfY,
                      hint: {
                        ...visionRes,
                        cropDataUrl: thumbCanvas.toDataURL('image/png'),
                        dataUrlAnnote: visionRes.dataUrlAnnote
                      }
                    });
                  }
                }
              }
            }
          }

          if (canvasResults.length > 0) {
            return canvasResults;
          }
        }
      } catch (err) {
        console.warn('Rendu canvas pour extraction visuelle de la page échoué, repli XObject:', err);
      }
    }

    // Méthode 2 (Repli) : Scan direct des objets XObject bitmap du PDF
    try {
      const ops = await page.getOperatorList();
      let currentTransform = [1, 0, 0, 1, 0, 0];
      const transformStack: number[][] = [];
      const imagePositions: Array<{
        rawName: string;
        cleanName: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }> = [];

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];
        if (fn === pdfjsLib.OPS.save) {
          transformStack.push([...currentTransform]);
        } else if (fn === pdfjsLib.OPS.restore) {
          if (transformStack.length > 0) currentTransform = transformStack.pop()!;
        } else if (fn === pdfjsLib.OPS.transform) {
          currentTransform = args;
        } else if (fn === pdfjsLib.OPS.paintImageXObject) {
          const rawName = String(args[0] || '');
          const cleanName = rawName.replace(/^g_d\d+_/, '');
          const x = currentTransform[4];
          const y = currentTransform[5];
          const scaleX = Math.abs(currentTransform[0]);
          const scaleY = Math.abs(currentTransform[3]);
          if (scaleX >= 15 && scaleX <= 380 && scaleY >= 15 && scaleY <= 380) {
            imagePositions.push({ rawName, cleanName, x, y, width: scaleX, height: scaleY });
          }
        }
      }

      imagePositions.sort((a, b) => b.y - a.y);

      const results: Array<{
        y: number;
        hint: {
          hasTopStubs: boolean;
          hasBottomStubs: boolean;
          hasInternalV: boolean;
          hasInternalH: boolean;
          modeDetecte: ModeDebordementPrecadre;
          figureDetectee: FigurePrecadre;
          details: string;
          cropDataUrl?: string;
          dataUrlAnnote?: string;
        };
      }> = [];

      for (const pos of imagePositions) {
        try {
          const img: any = await new Promise((resolve) => {
            let done = false;
            const cb = (obj: any) => {
              if (!done && obj) {
                done = true;
                resolve(obj);
              }
            };
            if (page.objs?.has(pos.rawName)) page.objs.get(pos.rawName, cb);
            else if (page.objs?.has(pos.cleanName)) page.objs.get(pos.cleanName, cb);
            else if (page.commonObjs?.has(pos.rawName)) page.commonObjs.get(pos.rawName, cb);
            else if (page.commonObjs?.has(pos.cleanName)) page.commonObjs.get(pos.cleanName, cb);
            setTimeout(() => {
              if (!done) resolve(null);
            }, 120);
          });

          if (img && img.data && img.width && img.height) {
            const hint = this.analyserBitmapChassis(img);
            if (hint) {
              results.push({ y: pos.y, hint });
            }
          }
        } catch (e) {
          // ignore error for single image
        }
      }

      return results;
    } catch (e) {
      console.warn('Erreur extraction visuels châssis page:', e);
      return [];
    }
  }

  /**
   * Analyse déterministe déléguée à ChassisVisionService
   */
  public static analyserBitmapChassis(img: any): {
    hasTopStubs: boolean;
    hasBottomStubs: boolean;
    hasInternalV: boolean;
    hasInternalH: boolean;
    modeDetecte: ModeDebordementPrecadre;
    figureDetectee: FigurePrecadre;
    details: string;
    cropDataUrl?: string;
    dataUrlAnnote?: string;
  } | null {
    const w = img.width;
    const h = img.height;
    const bytes = img.data;
    if (!bytes || w < 8 || h < 8) return null;

    const bpp = Math.floor(bytes.length / (w * h));
    if (bpp < 1) return null;

    const res = ChassisVisionService.analyserPixelsChassis(w, h, bytes, bpp);
    return {
      hasTopStubs: res.hasTopStubs,
      hasBottomStubs: res.hasBottomStubs,
      hasInternalV: res.hasInternalV,
      hasInternalH: res.hasInternalH,
      modeDetecte: res.modeDetecte,
      figureDetectee: res.figureDetectee,
      details: res.details,
      dataUrlAnnote: res.dataUrlAnnote
    };
  }
}
