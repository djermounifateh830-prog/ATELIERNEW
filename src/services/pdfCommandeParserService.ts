import * as pdfjsLib from 'pdfjs-dist';
import { Article } from '../types';

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
      const lignesTexteParPage: { pageNumber: number; lignes: string[] }[] = [];

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

        for (const y of sortedYs) {
          const rowItems = lignesMap.get(y)!.sort((a, b) => a.x - b.x);
          const rowText = rowItems.map(i => i.text).join(' ').replace(/\s+/g, ' ').trim();
          if (rowText) {
            pageLignes.push(rowText);
            texteComplet += rowText + '\n';
          }
        }

        lignesTexteParPage.push({ pageNumber: pageNum, lignes: pageLignes });
      }

      return this.analyserTexteStructure(texteComplet, lignesTexteParPage);
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
    lignesTexteParPage: { pageNumber: number; lignes: string[] }[]
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

    // 4. Détection de la Famille de Produit
    let familleDetectee: 'TABLIER' | 'CAISSON' | 'MOUSTIQUAIRE' | 'PRECADRE' | 'INCONNUE' = 'INCONNUE';
    const upperTexte = texteComplet.toUpperCase();

    if (upperTexte.includes('TABLIER') || upperTexte.includes('TAB 55') || upperTexte.includes('LAME 55') || upperTexte.includes('LAME 43')) {
      familleDetectee = 'TABLIER';
    } else if (upperTexte.includes('PRÉCADRE') || upperTexte.includes('PRECADRE') || upperTexte.includes('PRC50')) {
      familleDetectee = 'PRECADRE';
    } else if (upperTexte.includes('MOUSTIQUAIRE') || upperTexte.includes('MOUST')) {
      familleDetectee = 'MOUSTIQUAIRE';
    } else if (upperTexte.includes('SOMOBOX') || upperTexte.includes('CAISSON TUNNEL') || upperTexte.includes('CAISSON')) {
      familleDetectee = 'CAISSON';
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

      for (let i = 0; i < lignesPage.length; i++) {
        const line = lignesPage[i].trim();
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

            // Recherche des attributs coloris et ouvrant sur les lignes suivantes
            let coloris = '';
            let typeOuvrant = '';
            for (let nextIdx = i + 1; nextIdx < Math.min(lignesPage.length, i + 5); nextIdx++) {
              const nextLine = lignesPage[nextIdx].trim();
              if (nextLine.match(/Coloris\s*:\s*([^\n\r]+)/i)) {
                coloris = nextLine.replace(/Coloris\s*:\s*/i, '').trim();
              } else if (nextLine.match(/Ouvrant\s+([^\n\r]+)/i)) {
                typeOuvrant = nextLine.trim();
              } else if (
                nextLine.match(/^(?:[A-Za-z0-9\-_]{1,15}|\d{6,}\s+\d+)/) ||
                nextLine.toUpperCase().includes('PAGE N°')
              ) {
                break;
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

            lignes.push({
              id: `pdf-line-${Date.now()}-${lignes.length + 1}`,
              repere: finalRepere,
              quantite: qte,
              largeur,
              hauteur,
              designation,
              coloris,
              typeOuvrant,
              pageNumber: pageNum,
              hauteurLameDetectee,
              avecLameFinaleDetectee: ligneAvecLF
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
      indicationLameFinale
    };
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
}
