import { Article } from '../types';

export interface ArticleCuttingParams {
  longueurBarre: number;
  epaisseurScie: number;
  debordement: number;
  refusMin: number;
  refusMax: number;
}

export interface CustomCuttingOverrides {
  longeur?: number;
  lame?: number;
  debordement?: number;
  refus_min?: number;
  refus_max?: number;
}

/**
 * Résout les paramètres de coupe et de gestion des chutes strictement à partir
 * de la fiche article en base de données, avec prise en compte optionnelle des réglages
 * manuels appliqués par l'opérateur dans les panneaux techniques.
 *
 * Règle Métier :
 * - Chaque article possède ses propres seuils en base :
 *   • refus_min : seuil en deçà duquel le morceau restant est un déchet jeté
 *   • refus_max : seuil au-delà duquel le morceau restant est une chute valorisable à réintégrer au stock
 *   • lame : trait de scie exact de la lame pour cet article
 *   • debordement : surlongueur ou retrait spécifique
 *   • longeur : longueur brute de la barre neuve
 */
export function getArticleCuttingParams(
  article?: Partial<Article> | null,
  customOverrides?: CustomCuttingOverrides | null
): ArticleCuttingParams {
  const artLongeur = Number(article?.longeur);
  const artLame = Number(article?.lame);
  const artDebord = Number(article?.debordement);
  const artRefusMin = Number(article?.refus_min);
  const artRefusMax = Number(article?.refus_max);

  // 1. Longueur de barre neuve (mm)
  const longueurBarre =
    customOverrides?.longeur && Number(customOverrides.longeur) > 0
      ? Number(customOverrides.longeur)
      : Number.isFinite(artLongeur) && artLongeur > 0
      ? artLongeur
      : 6000;

  // 2. Épaisseur de la lame de scie (mm)
  const epaisseurScie =
    customOverrides?.lame !== undefined && customOverrides.lame !== null && Number(customOverrides.lame) > 0
      ? Number(customOverrides.lame)
      : Number.isFinite(artLame) && artLame > 0
      ? artLame
      : 4.5;

  // 3. Débordement / marge de coupe (mm)
  const debordement =
    customOverrides?.debordement !== undefined && customOverrides.debordement !== null
      ? Number(customOverrides.debordement)
      : Number.isFinite(artDebord)
      ? artDebord
      : 0;

  // 4. Seuil Refus Min (Déchet <= refusMin)
  let refusMin =
    customOverrides?.refus_min !== undefined && customOverrides.refus_min !== null && Number(customOverrides.refus_min) > 0
      ? Number(customOverrides.refus_min)
      : Number.isFinite(artRefusMin) && artRefusMin > 0
      ? artRefusMin
      : 300;

  // 5. Seuil Refus Max (Chute Stock >= refusMax)
  let refusMax =
    customOverrides?.refus_max !== undefined && customOverrides.refus_max !== null && Number(customOverrides.refus_max) > 0
      ? Number(customOverrides.refus_max)
      : Number.isFinite(artRefusMax) && artRefusMax > 0
      ? artRefusMax
      : 1200;

  // Cohérence physique : si refusMin > refusMax, aligner
  if (refusMin > refusMax) {
    refusMin = refusMax;
  }

  return {
    longueurBarre,
    epaisseurScie,
    debordement,
    refusMin,
    refusMax
  };
}
