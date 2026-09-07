import React, { useState, useMemo } from 'react';
import {
  SuiviOF,
  LigneRetourOF,
  MouvementStock,
  Article,
  ChuteItem,
  MappingChutes,
  ChuteRetourDetail
} from '../../types';
import { StorageService } from '../../services/storage';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ClipboardCheck,
  RefreshCw,
  Info,
  Edit2,
  Check,
  Sparkles,
  PackagePlus,
  Scissors,
  Layers,
  Trash2,
  ArrowRight,
  Filter,
  CheckCheck,
  Archive,
  RotateCcw,
  Sliders,
  Plus,
  Minus,
  AlertOctagon,
  HelpCircle
} from 'lucide-react';

interface RetourOFModalProps {
  isOpen: boolean;
  suivi: SuiviOF;
  articles?: Article[];
  chutesBarres?: Record<string, ChuteItem[]>;
  mapping?: MappingChutes;
  onClose: () => void;
  onCloture: () => void;
}

export const RetourOFModal: React.FC<RetourOFModalProps> = ({
  isOpen,
  suivi,
  articles = [],
  chutesBarres = {},
  mapping = {},
  onClose,
  onCloture
}) => {
  // Lignes de retour initiales
  const [lignes, setLignes] = useState<LigneRetourOF[]>(() => {
    return suivi.lignesRetour.map(l => {
      const initReste = l.resteReelMesureMm ?? (l.restePrevuMm > 0 ? l.restePrevuMm : 0);
      const article = articles.find(a => a.code_art === l.articleCode);
      const refusMin = article?.refus_min ?? 300;
      const initAction = l.actionReste ?? (initReste >= refusMin ? 'A_STOCKER' : 'DECHET');
      const initSource = l.sourceReelle ?? (l.saisieOperateur?.toUpperCase().startsWith('BAR') ? 'BARRE_NEUVE' : 'CONFORME');

      return {
        ...l,
        sourceReelle: initSource,
        longueurSourceReelle: l.longueurSourceReelle || l.longueurPrevue,
        resteReelMesureMm: initReste,
        actionReste: initAction
      };
    });
  });

  // Suivi de confirmation explicite par ligne
  const [lignesVerifiees, setLignesVerifiees] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    suivi.lignesRetour.forEach((l, idx) => {
      const isAccessoire = l.id?.startsWith('lr-acc-') || l.repere?.startsWith('ACCESSOIRE') || l.longueurPrevue === 0;
      // Si l'opérateur avait déjà saisi une valeur spécifique différente du théorique ou s'il s'agit d'un accessoire magasin
      if (isAccessoire || l.resteReelMesureMm !== undefined || l.sourceReelle) {
        initial[idx] = true;
      }
    });
    return initial;
  });

  const [filtreLignes, setFiltreLignes] = useState<'TOUTES' | 'A_STOCKER' | 'MODIFIEES' | 'SUBSTITUTIONS' | 'ANOMALIES'>('TOUTES');
  const [numCommandeEdit, setNumCommandeEdit] = useState<string>(suivi.numCommande || '');
  const [isEditingNumCmd, setIsEditingNumCmd] = useState<boolean>(false);
  const [remarqueGlobale, setRemarqueGlobale] = useState<string>(suivi.remarqueGlobale || '');
  const [dateRetour, setDateRetour] = useState<string>(() => {
    const today = new Date();
    return `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  });
  const [isConfirming, setIsConfirming] = useState<boolean>(false);

  const [editingNonInventorieIdx, setEditingNonInventorieIdx] = useState<number | null>(null);
  const [nonInventorieTempLg, setNonInventorieTempLg] = useState<string>('');

  // Gestion du remplacement d'une chute par plusieurs chutes plus petites (scission de support)
  const [splittingSupportIdx, setSplittingSupportIdx] = useState<number | null>(null);
  const [splitSupportConfigs, setSplitSupportConfigs] = useState<Array<{ id: string; longueur: number; source: 'AUTRE_CHUTE' | 'CHUTE_NON_INVENTORIEE' }>>([]);

  if (!isOpen) return null;

  // Calcul estimation de la somme des pièces coupées
  const getEstimationPiecesLg = (l: LigneRetourOF): number => {
    if (l.piecesInfoStr) {
      // Tentative d'extraction des longueurs depuis "(2100mm)"
      const matches = l.piecesInfoStr.match(/(\d+)\s*mm/g);
      if (matches && matches.length > 0) {
        const sum = matches.reduce((acc, m) => acc + (parseInt(m, 10) || 0), 0);
        if (sum > 0) return sum;
      }
    }
    // Fallback théorique : longueur prévue - reste prévu
    return Math.max(0, l.longueurPrevue - l.restePrevuMm);
  };

  // Contrôle de cohérence physique & géométrique
  const getGeometrieStatus = (l: LigneRetourOF, originalIdx: number) => {
    // Si c'est une ligne accessoire (joue caisson, etc.), pas de contrôle de chute/longueur
    const isAccessoire = l.id?.startsWith('lr-acc-') || l.repere?.startsWith('ACCESSOIRE') || l.longueurPrevue === 0;
    if (isAccessoire) {
      return {
        isFatal: false,
        isWarning: false,
        message: null,
        sumPieces: 0,
        realSupportLg: 0,
        realReste: 0,
        isVerifiee: true
      };
    }

    const realSupportLg = l.longueurSourceReelle || l.longueurPrevue;
    const realReste = Math.round(l.resteReelMesureMm ?? l.restePrevuMm);
    const sumPieces = getEstimationPiecesLg(l);
    const maxPhysiquePossible = realSupportLg;

    // Erreur fatale : Reste supérieur à la taille totale du support
    const isFatalResteTropGrand = realReste > maxPhysiquePossible;

    // Erreur / Alerte géométrique : Reste + Somme des pièces > Taille du support + marge trait de scie
    const isDepassementMatiere = (realReste + sumPieces) > (realSupportLg + 10);

    let message: string | null = null;
    if (isFatalResteTropGrand) {
      message = `Impossible : Le reste mesuré (${realReste} mm) est supérieur à la longueur de la barre (${realSupportLg} mm) !`;
    } else if (isDepassementMatiere) {
      message = `Attention : Pièces coupées (~${sumPieces} mm) + Reste (${realReste} mm) = ${sumPieces + realReste} mm > Support (${realSupportLg} mm).`;
    }

    return {
      isFatal: isFatalResteTropGrand,
      isWarning: isDepassementMatiere && !isFatalResteTropGrand,
      message,
      sumPieces,
      realSupportLg,
      realReste,
      isVerifiee: !!lignesVerifiees[originalIdx]
    };
  };

  // Mise à jour unitaire d'une ligne
  const updateLigne = (idx: number, patch: Partial<LigneRetourOF>) => {
    setLignes(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setLignesVerifiees(prev => ({ ...prev, [idx]: true }));
  };

  // Ajustement rapide de la dimension mesurée (+/- mm)
  const adjustMesure = (idx: number, delta: number) => {
    const current = lignes[idx].resteReelMesureMm ?? lignes[idx].restePrevuMm;
    const newVal = Math.max(0, current + delta);
    const article = articles.find(a => a.code_art === lignes[idx].articleCode);
    const refusMin = article?.refus_min ?? 300;

    updateLigne(idx, {
      resteReelMesureMm: newVal,
      actionReste: newVal >= refusMin ? 'A_STOCKER' : 'DECHET',
      saisieOperateur: newVal !== lignes[idx].restePrevuMm ? `${newVal}mm` : ''
    });
  };

  // Rétablir la valeur théorique conforme
  const resetToTheorique = (idx: number) => {
    const l = lignes[idx];
    const article = articles.find(a => a.code_art === l.articleCode);
    const refusMin = article?.refus_min ?? 300;

    updateLigne(idx, {
      sourceReelle: 'CONFORME',
      longueurSourceReelle: l.longueurPrevue,
      resteReelMesureMm: l.restePrevuMm,
      actionReste: l.restePrevuMm >= refusMin ? 'A_STOCKER' : 'DECHET',
      saisieOperateur: ''
    });
  };

  // Déclarer une pièce/support en Rebut total
  const setRebutLigne = (idx: number) => {
    updateLigne(idx, {
      resteReelMesureMm: 0,
      actionReste: 'DECHET',
      saisieOperateur: 'REBUT TOTAL (PIÈCE ABÎMÉE / REJETÉE)',
      remarque: (lignes[idx].remarque || '') + ' [REBUT ATELIER]'
    });
  };

  // Déclarer une substitution par barre neuve
  const setSubstitutionBarreNeuve = (idx: number, longueurBarre: number = 6000) => {
    const l = lignes[idx];
    const longueurPieces = getEstimationPiecesLg(l);
    const estimatedReste = Math.max(0, longueurBarre - longueurPieces);
    const article = articles.find(a => a.code_art === l.articleCode);
    const refusMin = article?.refus_min ?? 300;

    updateLigne(idx, {
      sourceReelle: 'BARRE_NEUVE',
      longueurSourceReelle: longueurBarre,
      resteReelMesureMm: estimatedReste,
      actionReste: estimatedReste >= refusMin ? 'A_STOCKER' : 'DECHET',
      saisieOperateur: `BARRE NEUVE ${longueurBarre}mm`
    });
  };

  // Déclarer une substitution par une chute CONNUE du stock
  const setSubstitutionChuteConnue = (idx: number, longueurChute: number) => {
    const l = lignes[idx];
    const longueurPieces = getEstimationPiecesLg(l);
    const estimatedReste = Math.max(0, longueurChute - longueurPieces);
    const article = articles.find(a => a.code_art === l.articleCode);
    const refusMin = article?.refus_min ?? 300;

    updateLigne(idx, {
      sourceReelle: 'AUTRE_CHUTE',
      longueurSourceReelle: longueurChute,
      resteReelMesureMm: estimatedReste,
      actionReste: estimatedReste >= refusMin ? 'A_STOCKER' : 'DECHET',
      saisieOperateur: `CHUTE STOCK ${longueurChute}mm`
    });
  };

  // Déclarer une substitution par une chute NON INVENTORIÉE
  const setSubstitutionChuteNonInventoriee = (idx: number, longueurChute: number) => {
    const l = lignes[idx];
    const longueurPieces = getEstimationPiecesLg(l);
    const estimatedReste = Math.max(0, longueurChute - longueurPieces);
    const article = articles.find(a => a.code_art === l.articleCode);
    const refusMin = article?.refus_min ?? 300;

    updateLigne(idx, {
      sourceReelle: 'CHUTE_NON_INVENTORIEE',
      longueurSourceReelle: longueurChute,
      resteReelMesureMm: estimatedReste,
      actionReste: estimatedReste >= refusMin ? 'A_STOCKER' : 'DECHET',
      saisieOperateur: `CHUTE NON INVENTORIÉE ${longueurChute}mm`
    });
  };

  // Ajouter un débit / barre supplémentaire (re-débit / pièce refaite)
  const handleAjouterSupportSupplementaire = () => {
    const firstLigne = lignes[0];
    const articleCode = firstLigne?.articleCode || suivi.titreSection;
    const newLigne: LigneRetourOF = {
      id: `suppl-${Date.now()}`,
      repere: `RE-DÉBIT / REMPLACEMENT #${lignes.length + 1}`,
      typeSupport: 'BARRE_NEUVE',
      articleCode,
      longueurPrevue: 6000,
      restePrevuMm: 6000,
      saisieOperateur: 'BARRE SUPPLÉMENTAIRE RE-DÉBIT',
      sourceReelle: 'BARRE_NEUVE',
      longueurSourceReelle: 6000,
      resteReelMesureMm: 0,
      actionReste: 'DECHET',
      piecesInfoStr: 'Coupe de remplacement / refabrication',
      remarque: 'Barre supplémentaire débitée pour refabrication'
    };

    setLignes(prev => [...prev, newLigne]);
    setLignesVerifiees(prev => ({ ...prev, [lignes.length]: true }));
  };

  // Ajouter un débit / chute supplémentaire
  const handleAjouterChuteSupplementaire = (longueur: number = 1000) => {
    const firstLigne = lignes[0];
    const articleCode = firstLigne?.articleCode || suivi.titreSection;
    const articleDesignation = firstLigne?.articleDesignation || '';
    const newLigne: LigneRetourOF = {
      id: `suppl-chute-${Date.now()}`,
      repere: `CHUTE SUPPLÉMENTAIRE #${lignes.length + 1}`,
      typeSupport: 'CHUTE_BARRE',
      articleCode,
      articleDesignation,
      longueurPrevue: longueur,
      restePrevuMm: 0,
      saisieOperateur: `CHUTE DÉBITÉE ${longueur}mm`,
      sourceReelle: 'AUTRE_CHUTE',
      longueurSourceReelle: longueur,
      resteReelMesureMm: 0,
      actionReste: 'DECHET',
      piecesInfoStr: 'Débit chute additionnelle en atelier',
      remarque: 'Chute additionnelle débitée en atelier'
    };

    setLignes(prev => [...prev, newLigne]);
    setLignesVerifiees(prev => ({ ...prev, [lignes.length]: true }));
  };

  // Scinder une chute / remplacer 1 chute par plusieurs chutes plus petites
  const handleOpenSplitSupport = (idx: number) => {
    const l = lignes[idx];
    const lg = l.longueurSourceReelle || l.longueurPrevue || 3000;
    const count = lg >= 3000 ? 3 : 2;
    const eachLg = Math.round(lg / count);
    setSplittingSupportIdx(idx);
    setSplitSupportConfigs(
      Array.from({ length: count }, (_, i) => ({
        id: String(i + 1),
        longueur: i === count - 1 ? lg - (eachLg * (count - 1)) : eachLg,
        source: 'AUTRE_CHUTE'
      }))
    );
  };

  const handleApplySplitSupport = (idx: number) => {
    const oldLigne = lignes[idx];
    if (!splitSupportConfigs || splitSupportConfigs.length === 0) return;

    const newSubLignes: LigneRetourOF[] = splitSupportConfigs.map((cfg, subIdx) => {
      const lg = Math.max(10, Math.round(cfg.longueur));
      return {
        id: `split-${Date.now()}-${subIdx}-${Math.floor(Math.random() * 1000)}`,
        repere: `${oldLigne.repere} [Chute ${subIdx + 1}/${splitSupportConfigs.length}]`,
        typeSupport: 'CHUTE_BARRE',
        articleCode: oldLigne.articleCode,
        articleDesignation: oldLigne.articleDesignation,
        longueurPrevue: lg,
        longueurSourceReelle: lg,
        sourceReelle: cfg.source,
        restePrevuMm: 0,
        resteReelMesureMm: 0,
        actionReste: 'DECHET',
        piecesInfoStr: oldLigne.piecesInfoStr ? `${oldLigne.piecesInfoStr} (Partie ${subIdx + 1})` : '',
        saisieOperateur: `Remplacement de ${oldLigne.longueurPrevue}mm par chute ${lg}mm (${subIdx + 1}/${splitSupportConfigs.length})`,
        remarque: `Chute issue du fractionnement (${subIdx + 1}/${splitSupportConfigs.length})`
      };
    });

    const nextLignes = [...lignes];
    nextLignes.splice(idx, 1, ...newSubLignes);
    setLignes(nextLignes);
    setSplittingSupportIdx(null);
  };

  // Multi-chutes restantes après coupe
  const handleToggleMultiChutesReste = (idx: number) => {
    const l = lignes[idx];
    const mesured = l.resteReelMesureMm ?? l.restePrevuMm ?? 3000;
    if (l.chutesRestantesMultiples && l.chutesRestantesMultiples.length > 0) {
      updateLigne(idx, { chutesRestantesMultiples: undefined });
    } else {
      const count = mesured >= 3000 ? 3 : 2;
      const each = Math.round(mesured / count);
      const items: ChuteRetourDetail[] = Array.from({ length: count }, (_, i) => ({
        id: `cr-${Date.now()}-${i}`,
        longueurMm: i === count - 1 ? mesured - (each * (count - 1)) : each,
        quantite: 1,
        action: 'A_STOCKER'
      }));
      updateLigne(idx, {
        chutesRestantesMultiples: items,
        actionReste: 'A_STOCKER'
      });
    }
  };

  const handleUpdateChuteMultiItem = (ligneIdx: number, subId: string, updates: Partial<ChuteRetourDetail>) => {
    const l = lignes[ligneIdx];
    const current = l.chutesRestantesMultiples || [];
    const next = current.map(item => item.id === subId ? { ...item, ...updates } : item);
    updateLigne(ligneIdx, { chutesRestantesMultiples: next });
  };

  const handleAddChuteMultiItem = (ligneIdx: number) => {
    const l = lignes[ligneIdx];
    const current = l.chutesRestantesMultiples || [];
    const newItem: ChuteRetourDetail = {
      id: `cr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      longueurMm: 1000,
      quantite: 1,
      action: 'A_STOCKER'
    };
    updateLigne(ligneIdx, { chutesRestantesMultiples: [...current, newItem] });
  };

  const handleRemoveChuteMultiItem = (ligneIdx: number, subId: string) => {
    const l = lignes[ligneIdx];
    const current = l.chutesRestantesMultiples || [];
    const next = current.filter(item => item.id !== subId);
    updateLigne(ligneIdx, { chutesRestantesMultiples: next.length > 0 ? next : undefined });
  };

  // Supprimer une ligne ajoutée manuellement
  const handleSupprimerLigne = (idx: number) => {
    setLignes(prev => prev.filter((_, i) => i !== idx));
    setLignesVerifiees(prev => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const numK = Number(k);
        if (numK < idx) next[numK] = v;
        else if (numK > idx) next[numK - 1] = v;
      });
      return next;
    });
  };

  // Tout pré-remplir conforme en 1 clic
  const handleToutConforme = () => {
    const verifiedMap: Record<number, boolean> = {};
    setLignes(prev =>
      prev.map((l, idx) => {
        verifiedMap[idx] = true;
        const article = articles.find(a => a.code_art === l.articleCode);
        const refusMin = article?.refus_min ?? 300;
        return {
          ...l,
          sourceReelle: 'CONFORME',
          longueurSourceReelle: l.longueurPrevue,
          resteReelMesureMm: l.restePrevuMm,
          actionReste: l.restePrevuMm >= refusMin ? 'A_STOCKER' : 'DECHET',
          saisieOperateur: ''
        };
      })
    );
    setLignesVerifiees(verifiedMap);
  };

  // Trouver les chutes disponibles en stock pour l'article de cette ligne
  const getChutesDisponiblesPourArticle = (articleCode?: string): ChuteItem[] => {
    if (!articleCode) return [];
    const sheetName = mapping[articleCode] || articleCode;
    if (!sheetName || !chutesBarres[sheetName]) return [];
    return chutesBarres[sheetName].filter(c => c.quantite > 0);
  };

  // Statistiques en direct
  const stats = useMemo(() => {
    let barresNeuvesConsommees = 0;
    let chutesStockConsommees = 0;
    let chutesNonInventorieesConsommees = 0;
    let chutesAStockerCount = 0;
    let chutesAStockerMetrageMm = 0;
    let dechetsCount = 0;
    let nbModifiees = 0;
    let nbSubstitutions = 0;
    let nbAnomaliesFatales = 0;
    let nbAvertissements = 0;

    lignes.forEach((l, idx) => {
      const isAccessoire = l.id?.startsWith('lr-acc-') || l.repere?.startsWith('ACCESSOIRE') || l.longueurPrevue === 0;
      if (isAccessoire) {
        return; // Ne pas compter comme barre débitée
      }

      const source = l.sourceReelle || 'CONFORME';
      const isBarre = source === 'BARRE_NEUVE' || (source === 'CONFORME' && l.typeSupport === 'BARRE_NEUVE');
      if (isBarre) {
        barresNeuvesConsommees++;
      } else if (source === 'CHUTE_NON_INVENTORIEE') {
        chutesNonInventorieesConsommees++;
      } else {
        chutesStockConsommees++;
      }

      if (source !== 'CONFORME') {
        nbSubstitutions++;
      }

      const mesuredReste = l.resteReelMesureMm ?? l.restePrevuMm;
      if (mesuredReste !== l.restePrevuMm || source !== 'CONFORME') {
        nbModifiees++;
      }

      if (l.actionReste === 'A_STOCKER' && mesuredReste > 0) {
        chutesAStockerCount++;
        chutesAStockerMetrageMm += mesuredReste;
      } else {
        dechetsCount++;
      }

      const geo = getGeometrieStatus(l, idx);
      if (geo.isFatal) nbAnomaliesFatales++;
      if (geo.isWarning) nbAvertissements++;
    });

    const nbNonVerifiees = lignes.filter((l, idx) => {
      const isAccessoire = l.id?.startsWith('lr-acc-') || l.repere?.startsWith('ACCESSOIRE') || l.longueurPrevue === 0;
      if (isAccessoire) return false;
      return !lignesVerifiees[idx];
    }).length;

    return {
      barresNeuvesConsommees,
      chutesStockConsommees,
      chutesNonInventorieesConsommees,
      chutesAStockerCount,
      chutesAStockerMetrageMm,
      dechetsCount,
      nbModifiees,
      nbSubstitutions,
      nbAnomaliesFatales,
      nbAvertissements,
      nbNonVerifiees
    };
  }, [lignes, lignesVerifiees]);

  // Filtrage des lignes pour l'affichage
  const filteredLignes = useMemo(() => {
    return lignes.map((ligne, originalIdx) => ({ ligne, originalIdx })).filter(({ ligne, originalIdx }) => {
      const mesuredReste = ligne.resteReelMesureMm ?? ligne.restePrevuMm;
      const geo = getGeometrieStatus(ligne, originalIdx);

      if (filtreLignes === 'A_STOCKER') {
        return ligne.actionReste === 'A_STOCKER' && mesuredReste > 0;
      }
      if (filtreLignes === 'MODIFIEES') {
        return mesuredReste !== ligne.restePrevuMm || ligne.sourceReelle !== 'CONFORME';
      }
      if (filtreLignes === 'SUBSTITUTIONS') {
        return ligne.sourceReelle !== 'CONFORME';
      }
      if (filtreLignes === 'ANOMALIES') {
        return geo.isFatal || geo.isWarning;
      }
      return true;
    });
  }, [lignes, filtreLignes, lignesVerifiees]);

  // Confirmation du retour et clôture
  const handleConfirmerRetour = async () => {
    // 1. Bloquer impérativement si anomalie fatale (reste > support)
    if (stats.nbAnomaliesFatales > 0) {
      alert(`Impossible de clôturer l'OF : ${stats.nbAnomaliesFatales} ligne(s) présentent un reste physique supérieur à la dimension du support ! Veuillez corriger les cotes.`);
      setFiltreLignes('ANOMALIES');
      return;
    }

    // 2. Avertir si des lignes n'ont pas été vérifiées
    if (stats.nbNonVerifiees > 0) {
      const confirmUnverified = confirm(
        `Attention : ${stats.nbNonVerifiees} support(s) n'ont pas encore fait l'objet d'un relevé physique explicite.\n\nSouhaitez-vous quand même valider et considérer les cotes théoriques comme conformes ?`
      );
      if (!confirmUnverified) return;
    }

    setIsConfirming(true);
    const now = new Date();
    const dateTimeStr = `${dateRetour} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const mouvements: MouvementStock[] = [];
    let mvtIdx = 0;
    const finalNumCmd = numCommandeEdit.trim() || suivi.numCommande;
    const makeId = () => `mvt-${Date.now()}-${mvtIdx++}`;

    lignes.forEach((ligne, idx) => {
      const isAccessoire = ligne.id?.startsWith('lr-acc-') || ligne.repere?.startsWith('ACCESSOIRE') || ligne.longueurPrevue === 0;
      if (isAccessoire) {
        let qte = 1;
        const match = ligne.piecesInfoStr?.match(/^(\d+)/) || ligne.saisieOperateur?.match(/^(\d+)/);
        if (match) {
          qte = parseInt(match[1], 10) || 1;
        }
        mouvements.push({
          id: makeId(),
          date: dateTimeStr,
          type: 'SORTIE_ACCESSOIRE',
          articleCode: ligne.articleCode,
          ofId: suivi.id,
          numCommande: finalNumCmd,
          nomClient: suivi.nomClient,
          longueurMm: 0,
          quantite: qte,
          remarque: `Sortie accessoire (${qte} pcs) — ${ligne.repere} (${ligne.piecesInfoStr || ''})`
        });
        return;
      }

      const source = ligne.sourceReelle || 'CONFORME';
      const isBarreNeuve = source === 'BARRE_NEUVE' || (source === 'CONFORME' && ligne.typeSupport === 'BARRE_NEUVE');
      const realSupportLg = ligne.longueurSourceReelle || ligne.longueurPrevue;
      const realResteMm = Math.round(ligne.resteReelMesureMm ?? ligne.restePrevuMm);
      const repereTxt = ligne.repere || `Ligne #${idx + 1}`;
      const piecesTxt = ligne.piecesInfoStr ? `[Pièces: ${ligne.piecesInfoStr}]` : '';

      // 1. Sortie de matière première réelle consommée
      if (isBarreNeuve) {
        // Décompte de la barre neuve
        mouvements.push({
          id: makeId(),
          date: dateTimeStr,
          type: 'SORTIE_BARRE_NEUVE',
          articleCode: ligne.articleCode,
          ofId: suivi.id,
          numCommande: finalNumCmd,
          nomClient: suivi.nomClient,
          longueurMm: realSupportLg,
          quantite: 1,
          remarque: `Barre neuve consommée (${realSupportLg}mm) — Repère(s): ${repereTxt} ${piecesTxt}`
        });
      } else if (source === 'CHUTE_NON_INVENTORIEE') {
        // Régularisation d'inventaire : enregistrer l'apport atelier puis sa consommation pour traçabilité parfaite
        mouvements.push({
          id: makeId(),
          date: dateTimeStr,
          type: 'AJUSTEMENT_INVENTAIRE',
          articleCode: ligne.articleCode,
          ofId: suivi.id,
          numCommande: finalNumCmd,
          nomClient: suivi.nomClient,
          longueurMm: realSupportLg,
          quantite: 1,
          remarque: `Régularisation chute atelier non inventoriée (${realSupportLg}mm) utilisée pour débit ${repereTxt}`
        });
      } else {
        // Sortie de la chute de stock réellement débitée
        mouvements.push({
          id: makeId(),
          date: dateTimeStr,
          type: 'SORTIE_CHUTE',
          articleCode: ligne.articleCode,
          ofId: suivi.id,
          numCommande: finalNumCmd,
          nomClient: suivi.nomClient,
          longueurMm: realSupportLg,
          quantite: 1,
          remarque: `Chute stock débitée (${realSupportLg}mm) — Repère(s): ${repereTxt} ${piecesTxt}`
        });
      }

      // 2. Entrée de la NOUVELLE CHUTE RÉELLEMENT MESURÉE (OU MULTI-CHUTES)
      if (ligne.actionReste === 'A_STOCKER') {
        if (Array.isArray(ligne.chutesRestantesMultiples) && ligne.chutesRestantesMultiples.length > 0) {
          // L'opérateur a découpé le reste en plusieurs chutes plus petites à stocker
          for (const chuteSub of ligne.chutesRestantesMultiples) {
            const subLg = Math.round(Number(chuteSub.longueurMm) || 0);
            const subQte = Math.max(1, Math.round(Number(chuteSub.quantite) || 1));
            if (subLg > 0 && chuteSub.action !== 'DECHET') {
              mouvements.push({
                id: makeId(),
                date: dateTimeStr,
                type: 'ENTREE_CHUTE',
                articleCode: ligne.articleCode,
                ofId: suivi.id,
                numCommande: finalNumCmd,
                nomClient: suivi.nomClient,
                longueurMm: subLg,
                quantite: subQte,
                remarque: `Chute découpée après coupe (${subLg}mm x${subQte}) — Repère(s): ${repereTxt} — OF ${finalNumCmd}${source === 'CHUTE_NON_INVENTORIEE' ? ' (issue de chute non inventoriée)' : ''}`
              });
            }
          }
        } else if (realResteMm > 0) {
          mouvements.push({
            id: makeId(),
            date: dateTimeStr,
            type: 'ENTREE_CHUTE',
            articleCode: ligne.articleCode,
            ofId: suivi.id,
            numCommande: finalNumCmd,
            nomClient: suivi.nomClient,
            longueurMm: realResteMm,
            quantite: 1,
            remarque: `Chute mesurée après coupe (${realResteMm}mm) — Repère(s): ${repereTxt} — OF ${finalNumCmd}${source === 'CHUTE_NON_INVENTORIEE' ? ' (issue de chute non inventoriée)' : ''}`
          });
        }
      }
    });

    try {
      await StorageService.closeOF({
        ...suivi,
        numCommande: finalNumCmd,
        statut: 'CLOTURE',
        dateRetour,
        lignesRetour: lignes,
        remarqueGlobale
      }, mouvements);
    } catch (error: any) {
      setIsConfirming(false);
      alert(`Impossible de clôturer l'OF : ${error.message}`);
      return;
    }

    setIsConfirming(false);
    onCloture();
    onClose();
  };

  // Découpage des numéros de commande pour affichage des badges
  const commandBadges = (numCommandeEdit || suivi.numCommande || '')
    .split(/[\s,+/]+/)
    .map(c => c.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">

        {/* ── Header ── */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20 font-black">
              <ClipboardCheck className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-100">
                  Retour Atelier &amp; Contrôle Physique des Chutes Mesurées
                </h2>
                {isEditingNumCmd ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={numCommandeEdit}
                      onChange={e => setNumCommandeEdit(e.target.value)}
                      placeholder="ex: 26148, 26149"
                      className="bg-slate-800 border border-amber-400 rounded px-2 py-0.5 text-xs text-amber-300 font-mono font-bold focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const finalNum = numCommandeEdit.trim() || suivi.numCommande;
                        suivi.numCommande = finalNum;
                        await StorageService.upsertSuiviOF({ ...suivi, numCommande: finalNum });
                        setIsEditingNumCmd(false);
                      }}
                      className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs"
                      title="Valider la modification"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {commandBadges.map((cmd, cIdx) => (
                      <span key={cIdx} className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                        {cmd}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsEditingNumCmd(true)}
                      className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition"
                      title="Modifier les N° de commande de cet OF"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Client : <strong className="text-slate-200">{suivi.nomClient}</strong> {suivi.donneurOrdre && `(${suivi.donneurOrdre})`} • {suivi.titreSection} • Émis le {suivi.dateEmission}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Bandeau d'explication & Actions Rapides Globales ── */}
        <div className="px-5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
              <Info className="w-4 h-4 text-sky-400" />
              <span>Contrôle Qualité &amp; Cohérence Physique :</span>
            </span>
            <span className="text-slate-300 text-[11px]">
              Vérifiez les cotes réelles au mètre ruban. Le système valide automatiquement le bilan géométrique de chaque profilé débité.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAjouterSupportSupplementaire}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Ajouter une barre neuve (6m) supplémentaire débitée pour refaire une pièce abîmée"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>➕ Barre Neuve (6m)</span>
            </button>

            <button
              type="button"
              onClick={() => handleAjouterChuteSupplementaire(1000)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Ajouter une chute supplémentaire débitée pour refaire une pièce"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>➕ Chute Débitée</span>
            </button>

            <button
              type="button"
              onClick={handleToutConforme}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Valider toutes les lignes aux cotes théoriques calculées"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>⚡ Tout Valider Conforme</span>
            </button>
          </div>
        </div>

        {/* ── Barre d'onglets de filtrage rapide ── */}
        <div className="px-5 pt-3 pb-1 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setFiltreLignes('TOUTES')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                filtreLignes === 'TOUTES'
                  ? 'bg-slate-800 text-slate-100 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Toutes ({lignes.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltreLignes('A_STOCKER')}
              className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer ${
                filtreLignes === 'A_STOCKER'
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 shadow'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>À Stocker ({stats.chutesAStockerCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFiltreLignes('MODIFIEES')}
              className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer ${
                filtreLignes === 'MODIFIEES'
                  ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50 shadow'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Corrigées ({stats.nbModifiees})</span>
            </button>
            <button
              type="button"
              onClick={() => setFiltreLignes('SUBSTITUTIONS')}
              className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer ${
                filtreLignes === 'SUBSTITUTIONS'
                  ? 'bg-sky-900/60 text-sky-300 border border-sky-700/50 shadow'
                  : 'text-slate-400 hover:text-sky-300'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Substitutions ({stats.nbSubstitutions})</span>
            </button>

            {(stats.nbAnomaliesFatales > 0 || stats.nbAvertissements > 0) && (
              <button
                type="button"
                onClick={() => setFiltreLignes('ANOMALIES')}
                className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer ${
                  filtreLignes === 'ANOMALIES'
                    ? 'bg-rose-900/80 text-rose-200 border border-rose-600 shadow animate-pulse'
                    : 'text-rose-400 hover:text-rose-200'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                <span>Anomalies ({stats.nbAnomaliesFatales + stats.nbAvertissements})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
            {stats.nbNonVerifiees > 0 && (
              <span className="text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                🔍 {stats.nbNonVerifiees} non vérifiée(s)
              </span>
            )}
            <span>{filteredLignes.length} support(s) affiché(s)</span>
          </div>
        </div>

        {/* ── Liste des supports & coupes ── */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {filteredLignes.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800 text-slate-400">
              Aucune ligne ne correspond au filtre sélectionné.
            </div>
          ) : (
            filteredLignes.map(({ ligne, originalIdx }) => {
              const source = ligne.sourceReelle || 'CONFORME';
              const isBarreNeuve = source === 'BARRE_NEUVE' || (source === 'CONFORME' && ligne.typeSupport === 'BARRE_NEUVE');
              const realSupportLg = ligne.longueurSourceReelle || ligne.longueurPrevue;
              const mesuredReste = ligne.resteReelMesureMm ?? ligne.restePrevuMm;
              const delta = mesuredReste - ligne.restePrevuMm;
              const isModified = delta !== 0 || source !== 'CONFORME';
              const article = articles.find(a => a.code_art === ligne.articleCode);
              const refusMin = article?.refus_min ?? 300;
              const chutesDispos = getChutesDisponiblesPourArticle(ligne.articleCode);
              const geo = getGeometrieStatus(ligne, originalIdx);
              const isAddedManually = ligne.id?.startsWith('suppl-');
              const isAccessoire = ligne.id?.startsWith('lr-acc-') || ligne.repere?.startsWith('ACCESSOIRE') || ligne.longueurPrevue === 0;

              if (isAccessoire) {
                const isChecked = !!lignesVerifiees[originalIdx];
                return (
                  <div
                    key={ligne.id || originalIdx}
                    className={`p-4 rounded-2xl border transition shadow-sm ${
                      isChecked
                        ? 'bg-amber-950/20 border-amber-600/50'
                        : 'bg-slate-950/60 border-amber-900/40 hover:border-amber-700/60'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-950 text-amber-300 border border-amber-700/60">
                            🛡️ Accessoire Magasin
                          </span>
                          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-900 text-slate-200 border border-slate-700">
                            {ligne.articleCode}
                          </span>
                          <span className="text-sm font-black text-amber-200">
                            {ligne.repere}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 font-medium">
                          {ligne.piecesInfoStr}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
                          <span className="text-xs text-slate-400 font-semibold">Quantité sortie :</span>
                          <input
                            type="number"
                            min="0"
                            value={(() => {
                              const m = ligne.piecesInfoStr?.match(/^(\d+)/) || ligne.saisieOperateur?.match(/^(\d+)/);
                              return m ? m[1] : '1';
                            })()}
                            onChange={e => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              const restInfo = (ligne.piecesInfoStr || '').replace(/^\d+\s*(pcs|pièces)?/i, '').trim();
                              updateLigne(originalIdx, {
                                piecesInfoStr: `${val} pièces ${restInfo}`,
                                saisieOperateur: `${val} pcs prélevées`
                              });
                            }}
                            className="w-16 bg-slate-950 border border-amber-500/80 rounded px-2 py-1 text-center font-mono font-black text-amber-300 text-sm focus:outline-none"
                          />
                          <span className="text-xs font-bold text-amber-400">pcs</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setLignesVerifiees(prev => ({ ...prev, [originalIdx]: !prev[originalIdx] }));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                            isChecked
                              ? 'bg-emerald-900/60 text-emerald-200 border-emerald-500 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {isChecked ? '✅ Préparation Pointée' : '⚪ Pointer'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={ligne.id || originalIdx}
                  className={`p-4 rounded-2xl border transition shadow-sm ${
                    geo.isFatal
                      ? 'bg-rose-950/30 border-rose-600 ring-2 ring-rose-500/40'
                      : geo.isWarning
                      ? 'bg-amber-950/30 border-amber-500/80 ring-1 ring-amber-500/30'
                      : source === 'BARRE_NEUVE'
                      ? 'bg-sky-950/20 border-sky-800/60 ring-1 ring-sky-500/20'
                      : isModified
                      ? 'bg-amber-950/20 border-amber-800/60 ring-1 ring-amber-500/20'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Bandeau d'alerte géométrique si présent */}
                  {geo.message && (
                    <div className={`mb-3 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 ${
                      geo.isFatal
                        ? 'bg-rose-900/80 text-rose-100 border border-rose-500'
                        : 'bg-amber-900/80 text-amber-100 border border-amber-500'
                    }`}>
                      <div className="flex items-center gap-2">
                        <AlertOctagon className="w-4 h-4 flex-shrink-0" />
                        <span>{geo.message}</span>
                      </div>
                      <span className="font-mono text-[10px] bg-slate-950/60 px-2 py-0.5 rounded">
                        Max physique: {geo.realSupportLg} mm
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">

                    {/* COLONNE 1 : INFOS DU SUPPORT & COUPE(S) EN CASCADE (4 COLS) */}
                    <div className="lg:col-span-4 space-y-2 border-b lg:border-b-0 lg:border-r border-slate-800 pb-3 lg:pb-0 lg:pr-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
                            isBarreNeuve
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                              : 'bg-blue-950 text-blue-300 border-blue-700/60'
                          }`}>
                            {isBarreNeuve ? '🪵 Barre Neuve' : '📦 Chute Stock'} #{originalIdx + 1}
                          </span>
                          {isAddedManually && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                              Re-débit
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 font-mono">
                            Support : <strong className="text-slate-100">{realSupportLg} mm</strong>
                          </span>
                          {isAddedManually && (
                            <button
                              type="button"
                              onClick={() => handleSupprimerLigne(originalIdx)}
                              className="p-1 text-rose-400 hover:bg-rose-950 rounded"
                              title="Supprimer cette ligne de re-débit ajoutée"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Code Article & Désignation claire */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-900 text-amber-300 border border-slate-700">
                          {ligne.articleCode || suivi.titreSection}
                        </span>
                        {(ligne.articleDesignation || article?.designation) && (
                          <span className="text-xs font-semibold text-slate-200 truncate max-w-[240px]" title={ligne.articleDesignation || article?.designation}>
                            {ligne.articleDesignation || article?.designation}
                          </span>
                        )}
                      </div>

                      {/* Repères & Pièces découpées sur ce support */}
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
                          <span>Coupes réalisées sur ce support :</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Pièces : ~{geo.sumPieces} mm
                          </span>
                        </div>
                        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
                          <div className="text-amber-300 font-mono font-bold text-xs flex items-center gap-1.5 flex-wrap">
                            <Scissors className="w-3.5 h-3.5 text-amber-400" />
                            <span>{ligne.repere}</span>
                          </div>
                          {ligne.piecesInfoStr && (
                            <div className="text-[11px] text-slate-300 font-mono bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
                              {ligne.piecesInfoStr}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 flex justify-between pt-0.5">
                            <span>Reste théorique : <strong className="text-slate-300 font-mono">{ligne.restePrevuMm} mm</strong></span>
                            {geo.isVerifiee ? (
                              <span className="text-emerald-400 font-bold">✅ Vérifié</span>
                            ) : (
                              <span className="text-amber-400 font-bold">🔍 Non relevé</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* COLONNE 2 : SÉLECTEUR DE SOURCE RÉELLE (4 COLS) */}
                    <div className="lg:col-span-4 space-y-2 border-b lg:border-b-0 lg:border-r border-slate-800 pb-3 lg:pb-0 lg:pr-4">
                      <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                        <span>Source Réelle Utilisée :</span>
                        {source !== 'CONFORME' && (
                          <span className="text-[10px] text-amber-400 font-bold bg-amber-950 px-1.5 py-0.2 rounded border border-amber-800">
                            {source === 'BARRE_NEUVE' && 'Barre Neuve'}
                            {source === 'AUTRE_CHUTE' && 'Chute Stock'}
                            {source === 'CHUTE_NON_INVENTORIEE' && 'Chute Non Inventoriée'}
                          </span>
                        )}
                      </label>

                      <div className="space-y-1.5">
                        {/* Option A : Conforme */}
                        <button
                          type="button"
                          onClick={() => {
                            resetToTheorique(originalIdx);
                            if (editingNonInventorieIdx === originalIdx) setEditingNonInventorieIdx(null);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between border transition cursor-pointer ${
                            source === 'CONFORME'
                              ? 'bg-slate-800 text-slate-100 border-slate-600 shadow-sm'
                              : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <span className="truncate">✅ Conforme ({ligne.longueurPrevue} mm)</span>
                        </button>

                        {/* Option B : Barre Neuve */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSubstitutionBarreNeuve(originalIdx, 6000);
                              if (editingNonInventorieIdx === originalIdx) setEditingNonInventorieIdx(null);
                            }}
                            className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between border transition cursor-pointer ${
                              source === 'BARRE_NEUVE' && realSupportLg === 6000
                                ? 'bg-sky-900/60 text-sky-200 border-sky-500 shadow-sm'
                                : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-sky-800'
                            }`}
                          >
                            <span>🔄 Barre Neuve</span>
                            <span className="font-mono text-[11px]">6.0m</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSubstitutionBarreNeuve(originalIdx, 6500);
                              if (editingNonInventorieIdx === originalIdx) setEditingNonInventorieIdx(null);
                            }}
                            className={`px-2 py-1.5 rounded-lg text-xs font-semibold font-mono border transition cursor-pointer ${
                              source === 'BARRE_NEUVE' && realSupportLg === 6500
                                ? 'bg-sky-900/60 text-sky-200 border-sky-500 shadow-sm'
                                : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-sky-800'
                            }`}
                            title="Barre neuve 6500mm (6.5m)"
                          >
                            6.5m
                          </button>
                        </div>

                        {/* Option C1 : Autre Chute Connue en Stock */}
                        <div className="space-y-1">
                          <select
                            value={source === 'AUTRE_CHUTE' ? realSupportLg : ''}
                            onChange={e => {
                              const val = Number(e.target.value);
                              if (val > 0) {
                                setSubstitutionChuteConnue(originalIdx, val);
                                if (editingNonInventorieIdx === originalIdx) setEditingNonInventorieIdx(null);
                              }
                            }}
                            className={`w-full bg-slate-950 border rounded-lg px-2 py-1.5 text-xs font-mono transition cursor-pointer ${
                              source === 'AUTRE_CHUTE'
                                ? 'border-purple-500 text-purple-200 bg-purple-950/30'
                                : 'border-slate-800 text-slate-400 hover:border-purple-800'
                            }`}
                          >
                            <option value="">
                              {chutesDispos.length > 0
                                ? '📦 Remplacer par chute du stock...'
                                : '📦 Aucune chute en stock'}
                            </option>
                            {chutesDispos.map((c, cIdx) => (
                              <option key={c.id || cIdx} value={c.longueur}>
                                Chute Stock {c.longueur} mm (Dispo: {c.quantite})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Option C2 : Chute Non Inventoriée */}
                        <div>
                          {editingNonInventorieIdx === originalIdx ? (
                            <div className="bg-amber-950/40 border border-amber-500/60 rounded-xl p-2 space-y-1.5 shadow-inner">
                              <div className="text-[10px] font-bold text-amber-300 flex items-center justify-between">
                                <span>🆕 Dimension Chute Non Inventoriée :</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={nonInventorieTempLg}
                                  onChange={e => setNonInventorieTempLg(e.target.value)}
                                  placeholder="ex: 2500"
                                  autoFocus
                                  className="w-full bg-slate-950 border border-amber-400 rounded-lg px-2 py-1 font-mono text-xs text-amber-200 font-bold focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = parseInt(nonInventorieTempLg, 10);
                                    if (val > 0) {
                                      setSubstitutionChuteNonInventoriee(originalIdx, val);
                                      setEditingNonInventorieIdx(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNonInventorieIdx(null)}
                                  className="px-2 py-1 bg-slate-800 text-slate-400 text-xs rounded-lg hover:bg-slate-700"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="flex gap-1 flex-wrap pt-0.5">
                                {[1500, 2000, 2500, 3000, 4000].map(quickLg => (
                                  <button
                                    key={quickLg}
                                    type="button"
                                    onClick={() => {
                                      setSubstitutionChuteNonInventoriee(originalIdx, quickLg);
                                      setEditingNonInventorieIdx(null);
                                    }}
                                    className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-amber-300/80 font-mono text-[10px] rounded border border-slate-700"
                                  >
                                    {quickLg}mm
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNonInventorieIdx(originalIdx);
                                setNonInventorieTempLg(source === 'CHUTE_NON_INVENTORIEE' ? String(realSupportLg) : '');
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between border transition cursor-pointer ${
                                source === 'CHUTE_NON_INVENTORIEE'
                                  ? 'bg-amber-950/60 text-amber-200 border-amber-500 shadow-sm'
                                  : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-amber-800'
                              }`}
                            >
                              <span>🆕 Chute Non Inventoriée</span>
                              {source === 'CHUTE_NON_INVENTORIEE' ? (
                                <span className="font-mono font-bold text-amber-300">{realSupportLg} mm</span>
                              ) : (
                                <span className="text-[10px] text-slate-500">Saisir mm</span>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Option D : Remplacer par plusieurs chutes plus petites (scission) */}
                        <div className="pt-1 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              if (splittingSupportIdx === originalIdx) {
                                setSplittingSupportIdx(null);
                              } else {
                                handleOpenSplitSupport(originalIdx);
                                if (editingNonInventorieIdx === originalIdx) setEditingNonInventorieIdx(null);
                              }
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between border transition cursor-pointer ${
                              splittingSupportIdx === originalIdx
                                ? 'bg-amber-950/80 text-amber-200 border-amber-500 shadow-md ring-1 ring-amber-400/40'
                                : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-amber-600 hover:text-amber-300'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span>🔀</span>
                              <span>Remplacer par plusieurs chutes</span>
                            </span>
                            <span className="font-mono text-[10px] text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/80 shrink-0">
                              ex: 3×1m
                            </span>
                          </button>

                          {splittingSupportIdx === originalIdx && (
                            <div className="mt-2 bg-slate-950 border border-amber-500/80 rounded-xl p-3 space-y-2.5 shadow-lg animate-in fade-in duration-200">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                                  <span>🔀 Remplacer support de {realSupportLg} mm :</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSplittingSupportIdx(null)}
                                  className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800"
                                >
                                  ✕
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-snug">
                                Spécifiez les chutes plus petites utilisées à la place de cette chute de {realSupportLg} mm (ex: 3 chutes de 1m) :
                              </p>

                              {/* Raccourcis presets */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-slate-500 font-semibold">Exemples :</span>
                                <button
                                  type="button"
                                  onClick={() => setSplitSupportConfigs([
                                    { id: '1', longueur: 1000, source: 'AUTRE_CHUTE' },
                                    { id: '2', longueur: 1000, source: 'AUTRE_CHUTE' },
                                    { id: '3', longueur: 1000, source: 'AUTRE_CHUTE' }
                                  ])}
                                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-amber-300 text-[10px] font-mono font-bold rounded border border-amber-800/60 cursor-pointer"
                                >
                                  3 × 1000 mm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSplitSupportConfigs([
                                    { id: '1', longueur: 1500, source: 'AUTRE_CHUTE' },
                                    { id: '2', longueur: 1500, source: 'AUTRE_CHUTE' }
                                  ])}
                                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-amber-300 text-[10px] font-mono font-bold rounded border border-amber-800/60 cursor-pointer"
                                >
                                  2 × 1500 mm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSplitSupportConfigs([
                                    { id: '1', longueur: 750, source: 'AUTRE_CHUTE' },
                                    { id: '2', longueur: 750, source: 'AUTRE_CHUTE' },
                                    { id: '3', longueur: 750, source: 'AUTRE_CHUTE' },
                                    { id: '4', longueur: 750, source: 'AUTRE_CHUTE' }
                                  ])}
                                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-amber-300 text-[10px] font-mono font-bold rounded border border-amber-800/60 cursor-pointer"
                                >
                                  4 × 750 mm
                                </button>
                              </div>

                              {/* Liste des chutes */}
                              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                {splitSupportConfigs.map((cfg, cfgIdx) => (
                                  <div key={cfg.id || cfgIdx} className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg text-xs">
                                    <span className="text-[10px] font-mono font-bold text-slate-400 w-14 shrink-0">
                                      Chute #{cfgIdx + 1}
                                    </span>
                                    <div className="relative flex-1">
                                      <input
                                        type="number"
                                        min="10"
                                        value={cfg.longueur || ''}
                                        onChange={e => {
                                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                          setSplitSupportConfigs(prev => prev.map((item, i) => i === cfgIdx ? { ...item, longueur: val } : item));
                                        }}
                                        placeholder="Longueur (mm)"
                                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-amber-200"
                                      />
                                      <span className="absolute right-2 top-1 text-[9px] text-slate-500 font-mono pointer-events-none">mm</span>
                                    </div>
                                    <select
                                      value={cfg.source}
                                      onChange={e => {
                                        const s = e.target.value as 'AUTRE_CHUTE' | 'CHUTE_NON_INVENTORIEE';
                                        setSplitSupportConfigs(prev => prev.map((item, i) => i === cfgIdx ? { ...item, source: s } : item));
                                      }}
                                      className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-300 font-mono"
                                    >
                                      <option value="AUTRE_CHUTE">Stock</option>
                                      <option value="CHUTE_NON_INVENTORIEE">Atelier</option>
                                    </select>
                                    {splitSupportConfigs.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => setSplitSupportConfigs(prev => prev.filter((_, i) => i !== cfgIdx))}
                                        className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                                        title="Supprimer cette chute"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <button
                                  type="button"
                                  onClick={() => setSplitSupportConfigs(prev => [
                                    ...prev,
                                    { id: String(Date.now()), longueur: 1000, source: 'AUTRE_CHUTE' }
                                  ])}
                                  className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                                >
                                  + Ajouter une chute
                                </button>
                                <div className="text-xs font-mono font-bold text-slate-300">
                                  Total : <span className="text-amber-400">{splitSupportConfigs.reduce((s, c) => s + (Number(c.longueur) || 0), 0)} mm</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => handleApplySplitSupport(originalIdx)}
                                  className="flex-1 py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Valider le remplacement ({splitSupportConfigs.length} chutes)</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSplittingSupportIdx(null)}
                                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* COLONNE 3 : CORRECTION DU RESTE RÉEL MESURÉ & DESTINATION (4 COLS) */}
                    <div className="lg:col-span-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                          <PackagePlus className="w-3.5 h-3.5 text-amber-400" />
                          <span>Reste Réel Mesuré Après Coupe :</span>
                        </label>

                        {/* Badge statut écart */}
                        <div>
                          {delta === 0 ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800">
                              ✅ Conforme ({ligne.restePrevuMm}mm)
                            </span>
                          ) : (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono ${
                              delta > 0
                                ? 'text-sky-300 bg-sky-950/80 border-sky-800'
                                : 'text-amber-300 bg-amber-950/80 border-amber-800'
                            }`}>
                              ✂️ Écart : {delta > 0 ? `+${delta}` : delta} mm
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Champ de saisie numérique avec boutons rapides +/- mm */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => adjustMesure(originalIdx, -10)}
                          className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold rounded-lg border border-slate-700 transition cursor-pointer"
                          title="Retirer 10 mm"
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustMesure(originalIdx, -5)}
                          className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold rounded-lg border border-slate-700 transition cursor-pointer"
                          title="Retirer 5 mm"
                        >
                          -5
                        </button>

                        {/* Input de la cote réelle mesurée */}
                        <div className="relative flex-1">
                          <input
                            type="number"
                            value={mesuredReste === 0 && ligne.actionReste === 'DECHET' ? '' : mesuredReste}
                            onChange={e => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              const refusMin = article?.refus_min ?? 300;
                              updateLigne(originalIdx, {
                                resteReelMesureMm: val,
                                actionReste: val >= refusMin && val > 0 ? 'A_STOCKER' : 'DECHET',
                                saisieOperateur: val !== ligne.restePrevuMm ? `${val}mm` : ''
                              });
                            }}
                            placeholder="0"
                            className={`w-full bg-slate-950 border-2 rounded-xl px-3 py-1.5 text-center font-mono font-black text-base focus:outline-none focus:ring-2 shadow-inner ${
                              geo.isFatal
                                ? 'border-rose-500 text-rose-300 focus:ring-rose-500/40'
                                : 'border-amber-500/70 focus:border-amber-400 text-amber-300 focus:ring-amber-400/40'
                            }`}
                          />
                          <span className="absolute right-2.5 top-2 text-[10px] text-slate-400 font-mono font-bold pointer-events-none">
                            mm
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => adjustMesure(originalIdx, 5)}
                          className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold rounded-lg border border-slate-700 transition cursor-pointer"
                          title="Ajouter 5 mm"
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustMesure(originalIdx, 10)}
                          className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold rounded-lg border border-slate-700 transition cursor-pointer"
                          title="Ajouter 10 mm"
                        >
                          +10
                        </button>
                      </div>

                      {/* Décision automatique & Seuil de conformité */}
                      <div className="space-y-1 pt-1">
                        {ligne.actionReste === 'A_STOCKER' && mesuredReste > 0 ? (
                          <div className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-950/70 border border-emerald-500/80 text-emerald-200 text-xs font-bold flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-1.5">
                              <Archive className="w-3.5 h-3.5 text-emerald-400" />
                              <span>📦 Reste Conforme ➔ Enregistré en Stock</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateLigne(originalIdx, { actionReste: 'DECHET' })}
                              className="text-[10px] text-slate-400 hover:text-rose-300 underline cursor-pointer"
                              title="Forcer en déchet si pièce inutilisable / abîmée"
                            >
                              Jeter au déchet
                            </button>
                          </div>
                        ) : (
                          <div className="w-full py-1.5 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-medium flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>🗑️ Inférieur au seuil ({refusMin}mm) ➔ Déchet</span>
                            </div>
                            {mesuredReste > 0 && (
                              <button
                                type="button"
                                onClick={() => updateLigne(originalIdx, { actionReste: 'A_STOCKER' })}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                                title="Forcer en stock"
                              >
                                Forcer stocker
                              </button>
                            )}
                          </div>
                        )}

                        <div className="text-[10px] text-slate-500 flex items-center justify-between px-1">
                          <span>Seuil de réutilisation : <strong>≥ {refusMin} mm</strong></span>
                          <button
                            type="button"
                            onClick={() => setRebutLigne(originalIdx)}
                            className="text-rose-400 hover:text-rose-300 underline cursor-pointer"
                            title="Déclarer cette ligne en rebut intégral"
                          >
                            Déclarer rebut
                          </button>
                        </div>
                      </div>

                      {/* Option Découper le reste en plusieurs chutes pour le stock (ex: 3 chutes de 1m au lieu d'une de 3m) */}
                      <div className="pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleToggleMultiChutesReste(originalIdx)}
                          className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-between border transition cursor-pointer ${
                            ligne.chutesRestantesMultiples && ligne.chutesRestantesMultiples.length > 0
                              ? 'bg-purple-950/80 border-purple-500 text-purple-200 shadow-sm'
                              : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-purple-300 hover:border-purple-800'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>🧩</span>
                            <span>{ligne.chutesRestantesMultiples && ligne.chutesRestantesMultiples.length > 0 ? 'Mode Multi-Chutes Restantes (Actif)' : 'Diviser le reste en plusieurs chutes'}</span>
                          </span>
                          <span className="text-[10px] font-mono text-purple-300 bg-purple-900/60 px-1.5 py-0.2 rounded border border-purple-700">
                            {ligne.chutesRestantesMultiples?.length ? `${ligne.chutesRestantesMultiples.length} chutes` : 'ex: 3×1m'}
                          </span>
                        </button>

                        {ligne.chutesRestantesMultiples && ligne.chutesRestantesMultiples.length > 0 && (
                          <div className="mt-2 bg-slate-950 border border-purple-500/70 rounded-xl p-2.5 space-y-2 shadow-inner animate-in fade-in duration-200">
                            <div className="text-[11px] font-bold text-purple-300 flex items-center justify-between">
                              <span>Chutes restituées au stock :</span>
                              <span className="font-mono text-xs font-black text-amber-300">
                                Total : {ligne.chutesRestantesMultiples.reduce((sum, c) => sum + (c.action !== 'DECHET' ? (Number(c.longueurMm) * (Number(c.quantite) || 1)) : 0), 0)} mm
                              </span>
                            </div>

                            {/* Raccourcis de fractionnement rapide */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-slate-500 font-semibold">Répartition :</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const tot = mesuredReste > 0 ? mesuredReste : 3000;
                                  const each = Math.round(tot / 3);
                                  updateLigne(originalIdx, {
                                    chutesRestantesMultiples: [
                                      { id: `cr-${Date.now()}-1`, longueurMm: each, quantite: 1, action: 'A_STOCKER' },
                                      { id: `cr-${Date.now()}-2`, longueurMm: each, quantite: 1, action: 'A_STOCKER' },
                                      { id: `cr-${Date.now()}-3`, longueurMm: tot - (each * 2), quantite: 1, action: 'A_STOCKER' },
                                    ],
                                    actionReste: 'A_STOCKER'
                                  });
                                }}
                                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-purple-300 text-[10px] font-mono font-bold rounded border border-purple-800 cursor-pointer"
                              >
                                3 parts égales
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const tot = mesuredReste > 0 ? mesuredReste : 3000;
                                  const each = Math.round(tot / 2);
                                  updateLigne(originalIdx, {
                                    chutesRestantesMultiples: [
                                      { id: `cr-${Date.now()}-1`, longueurMm: each, quantite: 1, action: 'A_STOCKER' },
                                      { id: `cr-${Date.now()}-2`, longueurMm: tot - each, quantite: 1, action: 'A_STOCKER' },
                                    ],
                                    actionReste: 'A_STOCKER'
                                  });
                                }}
                                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-purple-300 text-[10px] font-mono font-bold rounded border border-purple-800 cursor-pointer"
                              >
                                2 parts égales
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateLigne(originalIdx, {
                                    chutesRestantesMultiples: [
                                      { id: `cr-${Date.now()}-1`, longueurMm: 1000, quantite: 1, action: 'A_STOCKER' },
                                      { id: `cr-${Date.now()}-2`, longueurMm: 1000, quantite: 1, action: 'A_STOCKER' },
                                      { id: `cr-${Date.now()}-3`, longueurMm: 1000, quantite: 1, action: 'A_STOCKER' },
                                    ],
                                    actionReste: 'A_STOCKER'
                                  });
                                }}
                                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-purple-300 text-[10px] font-mono font-bold rounded border border-purple-800 cursor-pointer"
                              >
                                3 × 1000 mm
                              </button>
                            </div>

                            {/* Liste des chutes de retour */}
                            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                              {ligne.chutesRestantesMultiples.map((cSub, sIdx) => (
                                <div key={cSub.id || sIdx} className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg text-xs">
                                  <span className="text-[10px] font-mono font-bold text-purple-300 w-12 shrink-0">
                                    #{sIdx + 1}
                                  </span>
                                  <div className="relative flex-1">
                                    <input
                                      type="number"
                                      min="0"
                                      value={cSub.longueurMm || ''}
                                      onChange={e => handleUpdateChuteMultiItem(originalIdx, cSub.id, { longueurMm: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                      className="w-full bg-slate-950 border border-purple-700/70 rounded px-2 py-0.5 font-mono font-bold text-amber-300 text-xs"
                                      placeholder="Lg (mm)"
                                    />
                                    <span className="absolute right-2 top-0.5 text-[9px] text-slate-500 font-mono pointer-events-none">mm</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[10px] text-slate-400">×</span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={cSub.quantite || 1}
                                      onChange={e => handleUpdateChuteMultiItem(originalIdx, cSub.id, { quantite: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                      className="w-12 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 font-mono text-center text-xs text-sky-300"
                                      title="Quantité"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateChuteMultiItem(originalIdx, cSub.id, { action: cSub.action === 'DECHET' ? 'A_STOCKER' : 'DECHET' })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                                      cSub.action === 'DECHET'
                                        ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                                        : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                    }`}
                                  >
                                    {cSub.action === 'DECHET' ? '🗑️ Rebut' : '📦 Stock'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveChuteMultiItem(originalIdx, cSub.id)}
                                    className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                                    title="Supprimer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <button
                                type="button"
                                onClick={() => handleAddChuteMultiItem(originalIdx)}
                                className="text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                              >
                                + Ajouter une autre chute
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleMultiChutesReste(originalIdx)}
                                className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                              >
                                Revenir à 1 seule chute
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Remarque globale et Date de retour */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Remarque générale de l'opérateur / Magasin :</span>
              </label>
              <textarea
                value={remarqueGlobale}
                onChange={e => setRemarqueGlobale(e.target.value)}
                placeholder="ex: Chutes réelles mesurées au mètre ruban après coupes en cascade. Barres neuves débitées conformes."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Date effective de clôture</label>
              <input
                type="text"
                value={dateRetour}
                onChange={e => setDateRetour(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-slate-500"
              />
            </div>
          </div>
        </div>

        {/* ── Footer & Synthèse des Mouvements de Stock ── */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-4 flex-wrap">
          {/* Synthèse des impacts stock */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
              <span className="text-slate-400">Barres neuves à déduire :</span>
              <strong className="text-emerald-400 font-mono">{stats.barresNeuvesConsommees} barre(s)</strong>
            </div>

            <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
              <span className="text-slate-400">Chutes stock à déduire :</span>
              <strong className="text-blue-400 font-mono">{stats.chutesStockConsommees} chute(s)</strong>
            </div>

            {stats.chutesNonInventorieesConsommees > 0 && (
              <div className="bg-amber-950/60 px-3 py-1.5 rounded-xl border border-amber-800/80 flex items-center gap-2">
                <span className="text-amber-300">Chutes atelier régularisées :</span>
                <strong className="text-amber-200 font-mono">+{stats.chutesNonInventorieesConsommees}</strong>
              </div>
            )}

            <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
              <span className="text-slate-400">Nouvelles chutes créées :</span>
              <strong className="text-amber-400 font-mono">
                +{stats.chutesAStockerCount} chute(s) ({stats.chutesAStockerMetrageMm} mm)
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirmerRetour}
              disabled={isConfirming || stats.nbAnomaliesFatales > 0}
              className={`px-5 py-2.5 text-white text-xs font-black rounded-xl flex items-center gap-2 transition shadow-lg cursor-pointer ${
                stats.nbAnomaliesFatales > 0
                  ? 'bg-rose-700 opacity-60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-emerald-500/20'
              }`}
            >
              {isConfirming ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Valider les Mesures &amp; Clôturer l'OF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
