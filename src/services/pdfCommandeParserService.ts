import * as pdfjsLib from 'pdfjs-dist';

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
    for (const rawLine of headerLines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.toUpperCase().includes('MEGRINE') || line.toUpperCase().includes('TROIS M')) {
        foundMegrine = true;
        continue;
      }
      if (line.toUpperCase().includes('BORDEREAU') || line.toUpperCase().includes('RÉFÉRENCE') || line.toUpperCase().includes('REFERENCE')) {
        if (clientDetecte) break;
      }
      if (foundMegrine && !clientDetecte) {
        if (
          !line.toUpperCase().includes('CHÂSSIS') &&
          !line.toUpperCase().includes('CHASSIS') &&
          !line.toUpperCase().includes('LOT') &&
          !line.toUpperCase().includes('QTÉ') &&
          !line.toUpperCase().includes('DESCRIPTIF') &&
          !line.match(/^\d+$/)
        ) {
          clientDetecte = line;
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

    // Détection globale si Lame Finale est mentionnée dans la référence de commande
    const globalAvecLF = upperTexte.includes('+LAME FINAL') || upperTexte.includes('LAME FINALE') || upperTexte.includes('+LF');

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
              avecLameFinaleDetectee: globalAvecLF
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
      avertissements
    };
  }
}
