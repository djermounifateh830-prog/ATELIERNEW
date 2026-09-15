import {
  FamilleProduit,
  ParametresProductionAtelier,
  DossierCommandeGlobal,
  SuiviOF,
  EstimationLivraisonDossier,
  EstimationDelaiDetail,
  InfoStatutDelai,
  StatutRespectDelai
} from '../types';

export const NOMS_JOURS_SEMAINE = [
  'DIMANCHE',
  'LUNDI',
  'MARDI',
  'MERCREDI',
  'JEUDI',
  'VENDREDI',
  'SAMEDI'
];

export const PARAMETRES_PRODUCTION_DEFAUT: ParametresProductionAtelier = {
  // Jours ouvrés activés (0: Dimanche, 1: Lundi, 2: Mardi, 3: Mercredi, 4: Jeudi, 6: Samedi - personnalisable)
  joursOuvres: [0, 1, 2, 3, 4], // Dimanche au Jeudi par défaut (semaine standard atelier)
  heuresTravailParJour: 8,
  familles: {
    CAISSON: {
      famille: 'CAISSON',
      libelle: 'Caissons & Sous-faces',
      tempsUnitaireMinutes: 5, // 5 min par caisson
      capaciteJournalierePieces: 120, // 120 caissons / jour
      delaiFixeJours: 0
    },
    PRECADRE: {
      famille: 'PRECADRE',
      libelle: 'Précadres',
      tempsUnitaireMinutes: 6,
      capaciteJournalierePieces: 80,
      delaiFixeJours: 0
    },
    MOUSTIQUAIRE: {
      famille: 'MOUSTIQUAIRE',
      libelle: 'Moustiquaires plissées',
      tempsUnitaireMinutes: 10,
      capaciteJournalierePieces: 50,
      delaiFixeJours: 0
    },
    TABLIER: {
      famille: 'TABLIER',
      libelle: 'Tabliers de volet',
      tempsUnitaireMinutes: 15,
      capaciteJournalierePieces: 35,
      delaiFixeJours: 0
    }
  }
};

const STORAGE_KEY = '3m_parametres_production_v1';
let cachedParametres: ParametresProductionAtelier | null = null;

export class DelaisProductionService {
  /**
   * Récupération synchrone des paramètres depuis le cache / localStorage
   */
  static getParametres(): ParametresProductionAtelier {
    if (cachedParametres) return cachedParametres;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        cachedParametres = {
          ...PARAMETRES_PRODUCTION_DEFAUT,
          ...parsed,
          familles: {
            ...PARAMETRES_PRODUCTION_DEFAUT.familles,
            ...(parsed.familles || {})
          }
        };
        return cachedParametres!;
      }
    } catch {}
    cachedParametres = { ...PARAMETRES_PRODUCTION_DEFAUT };
    return cachedParametres;
  }

  /**
   * Chargement asynchrone depuis la base SQLite (/api/settings/production)
   */
  static async loadParametresFromDb(): Promise<ParametresProductionAtelier> {
    try {
      const res = await fetch('/api/settings/production');
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          cachedParametres = {
            ...PARAMETRES_PRODUCTION_DEFAUT,
            ...json.data,
            familles: {
              ...PARAMETRES_PRODUCTION_DEFAUT.familles,
              ...(json.data.familles || {})
            }
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedParametres));
          return cachedParametres!;
        }
      }
    } catch {}
    return this.getParametres();
  }

  /**
   * Sauvegarde synchrone et asynchrone dans SQLite et localStorage
   */
  static async saveParametres(params: ParametresProductionAtelier): Promise<void> {
    cachedParametres = { ...params };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch {}

    try {
      await fetch('/api/settings/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
    } catch (e) {
      console.warn('Erreur sauvegarde SQLite parametres_production:', e);
    }
  }

  /**
   * Formate une date au format requis : "LIVRAISON : MERCREDI 16/09"
   */
  static formaterDateLivraison(date: Date): string {
    const jourIdx = date.getDay();
    const nomJour = NOMS_JOURS_SEMAINE[jourIdx] || 'JOUR';
    const jj = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `LIVRAISON : ${nomJour} ${jj}/${mm}`;
  }

  /**
   * Avance une date de départ d'un nombre de jours ouvrés en sautant les jours de repos configurés
   */
  static ajouterJoursOuvres(dateDepart: Date, joursRequis: number, joursOuvres: number[]): Date {
    const activeJours = joursOuvres && joursOuvres.length > 0 ? joursOuvres : [0, 1, 2, 3, 4];
    const d = new Date(dateDepart);

    // Ajuster si la date de départ est sur un jour non ouvré
    while (!activeJours.includes(d.getDay())) {
      d.setDate(d.getDate() + 1);
    }

    // Nombre de jours entiers de fabrication (minimum 1 jour d'atelier pour préparer et fabriquer)
    const joursEntiers = Math.max(1, Math.ceil(joursRequis));

    for (let i = 0; i < joursEntiers; i++) {
      d.setDate(d.getDate() + 1);
      while (!activeJours.includes(d.getDay())) {
        d.setDate(d.getDate() + 1);
      }
    }

    return d;
  }

  /**
   * Parse une date au format DD/MM/YYYY
   */
  static parseDateString(str?: string): Date {
    if (!str) return new Date();
    try {
      const parts = str.split('/');
      if (parts.length === 3) {
        const j = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const a = parseInt(parts[2], 10);
        if (!isNaN(j) && !isNaN(m) && !isNaN(a)) {
          return new Date(a, m, j);
        }
      }
    } catch {}
    return new Date();
  }

  /**
   * Convertit un objet Date en format YYYY-MM-DD
   */
  static toISODateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Extrait ou reconstruit la date de livraison cible d'une commande
   */
  static extraireDateLivraison(
    dateLivTexte?: string,
    dateLivISO?: string,
    dateReferenceFallback?: string
  ): Date {
    if (dateLivISO) {
      const parsedIso = new Date(dateLivISO);
      if (!isNaN(parsedIso.getTime())) return parsedIso;
    }
    if (dateLivTexte) {
      // Format complet avec année ex: "LIVRAISON : MERCREDI 16/09/2026" ou "LIVRÉ LE : 16/09/2026"
      const fullMatch = dateLivTexte.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (fullMatch) {
        const j = parseInt(fullMatch[1], 10);
        const m = parseInt(fullMatch[2], 10) - 1;
        const a = parseInt(fullMatch[3], 10);
        return new Date(a, m, j);
      }
      // Format court sans année ex: "LIVRAISON : MERCREDI 16/09"
      const shortMatch = dateLivTexte.match(/(\d{1,2})\/(\d{1,2})/);
      if (shortMatch) {
        const j = parseInt(shortMatch[1], 10);
        const m = parseInt(shortMatch[2], 10) - 1;
        let annee = new Date().getFullYear();
        if (dateReferenceFallback) {
          const fallbackDate = this.parseDateString(dateReferenceFallback);
          annee = fallbackDate.getFullYear();
        }
        return new Date(annee, m, j);
      }
    }
    if (dateReferenceFallback) {
      return this.parseDateString(dateReferenceFallback);
    }
    return new Date();
  }

  /**
   * Évalue le respect du délai de fabrication d'une commande.
   * RÈGLE DEMANDÉE :
   * Si une commande dépasse son délai de plus de 3 jours (retard >= 3 jours calendaires),
   * le système affiche un drapeau (flag) distinctif et une alerte explicite :
   * « 🚩 À VÉRIFIER EN ATELIER : DÉLAI NON RESPECTÉ (> 3j) ».
   */
  static evaluerStatutDelai(
    dateLivPrevue?: string,
    dateLivISO?: string,
    dateCommande?: string,
    statut?: string,
    datePivot?: Date
  ): InfoStatutDelai {
    // Si la commande est déjà livrée ou clôturée, aucun retard d'atelier
    if (statut === 'LIVRE' || statut === 'CLOTURE') {
      return {
        statutDelai: 'LIVRE',
        joursDeRetard: 0,
        estDepasse: false,
        estRetardCritique: false,
        texteAlerte: 'Commande livrée / clôturée',
        badgeLabel: '✓ Livré',
        badgeClasses: 'bg-emerald-950 text-emerald-300 border border-emerald-700/60',
        ligneClasses: '',
        flagEmoji: '✓'
      };
    }

    const dateTarget = this.extraireDateLivraison(dateLivPrevue, dateLivISO, dateCommande);
    const dateCible = new Date(dateTarget);
    dateCible.setHours(0, 0, 0, 0);

    const now = datePivot ? new Date(datePivot) : new Date();
    now.setHours(0, 0, 0, 0);

    // Calcul de la différence en jours
    const diffMs = now.getTime() - dateCible.getTime();
    const diffJours = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffJours >= 3) {
      // RETARD CRITIQUE >= 3 JOURS : FLAG ROUGE VIF + VÉRIFICATION ATELIER REQUISE
      return {
        statutDelai: 'RETARD_CRITIQUE',
        joursDeRetard: diffJours,
        estDepasse: true,
        estRetardCritique: true,
        texteAlerte: `⚠️ DÉLAI NON RESPECTÉ (+${diffJours} jours) : À vérifier d'urgence dans l'atelier !`,
        badgeLabel: `🚩 Retard +${diffJours}j : À VÉRIFIER EN ATELIER`,
        badgeClasses: 'bg-rose-950 text-rose-200 border-2 border-rose-500 shadow-md shadow-rose-950/60 animate-pulse font-black',
        ligneClasses: 'bg-rose-950/20 border-l-4 border-l-rose-500',
        flagEmoji: '🚩',
        dateLivraisonDate: dateCible
      };
    } else if (diffJours >= 1) {
      // Retard modéré (1 ou 2 jours)
      return {
        statutDelai: 'RETARD_MODERE',
        joursDeRetard: diffJours,
        estDepasse: true,
        estRetardCritique: false,
        texteAlerte: `⚠️ Délai dépassé de ${diffJours} jour(s)`,
        badgeLabel: `⚠️ Retard (+${diffJours}j)`,
        badgeClasses: 'bg-amber-950 text-amber-300 border border-amber-600 font-bold',
        ligneClasses: 'bg-amber-950/10 border-l-2 border-l-amber-500',
        flagEmoji: '⚠️',
        dateLivraisonDate: dateCible
      };
    } else if (diffJours === 0) {
      // Échéance aujourd'hui
      return {
        statutDelai: 'ECHEANCE_AUJOURDHUI',
        joursDeRetard: 0,
        estDepasse: false,
        estRetardCritique: false,
        texteAlerte: `⏰ Livraison prévue aujourd'hui`,
        badgeLabel: `⏰ Échéance aujourd'hui`,
        badgeClasses: 'bg-amber-900/60 text-amber-200 border border-amber-500/50 font-semibold',
        ligneClasses: '',
        flagEmoji: '⏰',
        dateLivraisonDate: dateCible
      };
    } else {
      // Dans les délais
      const joursRestants = Math.abs(diffJours);
      return {
        statutDelai: 'DANS_LES_TEMPS',
        joursDeRetard: diffJours,
        estDepasse: false,
        estRetardCritique: false,
        texteAlerte: `Dans les temps (reste ${joursRestants}j)`,
        badgeLabel: `✓ Dans les délais`,
        badgeClasses: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40',
        ligneClasses: '',
        flagEmoji: '✓',
        dateLivraisonDate: dateCible
      };
    }
  }

  /**
   * Compte le nombre total de pièces dans un dossier par famille
   */
  static compterPiecesDossierParFamille(dossier: DossierCommandeGlobal): Record<FamilleProduit, number> {
    const counts: Record<FamilleProduit, number> = {
      CAISSON: 0,
      PRECADRE: 0,
      MOUSTIQUAIRE: 0,
      TABLIER: 0
    };

    if (dossier.articlesCaissons && dossier.articlesCaissons.length > 0) {
      counts.CAISSON = dossier.articlesCaissons.reduce((sum, c) => sum + (Number(c.quantite) || 1), 0);
    }
    if (dossier.articlesPrecadres && dossier.articlesPrecadres.length > 0) {
      counts.PRECADRE = dossier.articlesPrecadres.reduce((sum, p) => sum + (Number(p.quantite) || 1), 0);
    }
    if (dossier.articlesMoustiquaires && dossier.articlesMoustiquaires.length > 0) {
      counts.MOUSTIQUAIRE = dossier.articlesMoustiquaires.reduce((sum, m) => sum + (Number(m.quantite) || 1), 0);
    }
    if (dossier.articlesTabliers && dossier.articlesTabliers.length > 0) {
      counts.TABLIER = dossier.articlesTabliers.reduce((sum, t) => sum + (Number(t.quantite) || 1), 0);
    }

    return counts;
  }

  /**
   * Détermine le nombre de pièces associées à un OF
   */
  static compterPiecesOF(of: SuiviOF): number {
    // Si déjà compté ou enregistré dans l'OF
    if ((of as any).nombrePieces && (of as any).nombrePieces > 0) {
      return (of as any).nombrePieces;
    }
    // D'après les lignes de retour
    if (of.lignesRetour && of.lignesRetour.length > 0) {
      // Compter les pièces réelles découpées mentionnées
      let count = 0;
      of.lignesRetour.forEach(lr => {
        if (lr.repere) {
          const reps = lr.repere.split(',').filter(Boolean);
          count += reps.length || 1;
        } else {
          count += 1;
        }
      });
      if (count > 0) return count;
    }
    // Fallback minimal de 1 pièce
    return 1;
  }

  /**
   * Calcul de l'estimation de délai prévisionnel pour un OF émis ou en cours
   */
  static estimerDelaiOF(
    targetOF: SuiviOF,
    allSuivisOF: SuiviOF[],
    paramsCustom?: ParametresProductionAtelier
  ): { dateLivraison: Date; texteFormatte: string; dateLivraisonISO: string; joursOuvresRequis: number } {
    // Si déjà livré avec une fiche de transfert
    if (targetOF.statut === 'LIVRE' && targetOF.dateLivraison) {
      const dLivre = this.parseDateString(targetOF.dateLivraison);
      return {
        dateLivraison: dLivre,
        texteFormatte: `LIVRÉ LE : ${targetOF.dateLivraison}`,
        dateLivraisonISO: this.toISODateString(dLivre),
        joursOuvresRequis: 0
      };
    }

    const params = paramsCustom || this.getParametres();
    const fam = targetOF.famille || 'CAISSON';
    const famKey: FamilleProduit = ((fam as string) === 'SOUS_FACE' ? 'CAISSON' : fam) as FamilleProduit;
    const configFam = params.familles[famKey] || params.familles.CAISSON;

    // Récupérer tous les OFs en cours de la même famille émis avant cet OF
    const ofDateRef = this.parseDateString(targetOF.dateEmission);
    const targetSeq = targetOF.numeroEmission || 999999;

    let piecesEnFileAttente = 0;
    allSuivisOF.forEach(of => {
      // Ne considérer que les OFs encore en cours de fabrication
      if (of.id === targetOF.id) return;
      if (of.statut !== 'EMIS' && of.statut !== 'RETOUR_EN_ATTENTE') return;

      const ofFam = (of.famille as string) === 'SOUS_FACE' ? 'CAISSON' : of.famille;
      if (ofFam === famKey) {
        const otherSeq = of.numeroEmission || 0;
        // Si l'autre OF est antérieur dans la file FIFO
        if (otherSeq < targetSeq) {
          piecesEnFileAttente += this.compterPiecesOF(of);
        }
      }
    });

    const piecesTarget = this.compterPiecesOF(targetOF);
    const totalPieces = piecesEnFileAttente + piecesTarget;
    const capaciteJour = configFam.capaciteJournalierePieces || 120;
    const joursRequis = totalPieces / capaciteJour + (configFam.delaiFixeJours || 0);

    const dateLivraison = this.ajouterJoursOuvres(ofDateRef, joursRequis, params.joursOuvres);
    return {
      dateLivraison,
      texteFormatte: this.formaterDateLivraison(dateLivraison),
      dateLivraisonISO: this.toISODateString(dateLivraison),
      joursOuvresRequis: Math.max(1, Math.ceil(joursRequis))
    };
  }

  /**
   * Calcul complet de la date prévisionnelle de livraison d'un Dossier Commande
   * - Prend en compte la file d'attente FIFO de chaque famille active
   * - La date globale de livraison du dossier est le goulot d'étranglement (la date max de toutes les familles)
   */
  static estimerDelaiDossier(
    dossier: DossierCommandeGlobal,
    tousDossiers: DossierCommandeGlobal[],
    suivisOF: SuiviOF[] = [],
    paramsCustom?: ParametresProductionAtelier
  ): EstimationLivraisonDossier {
    // Si déjà livré avec une fiche de transfert
    if (dossier.statut === 'LIVRE' && dossier.dateLivraison) {
      const dLivre = this.parseDateString(dossier.dateLivraison);
      return {
        dateMaximale: dLivre,
        dateLivraisonFormattee: `LIVRÉ LE : ${dossier.dateLivraison}`,
        dateLivraisonISO: this.toISODateString(dLivre),
        joursOuvresMax: 0,
        detailsParFamille: {}
      };
    }

    const params = paramsCustom || this.getParametres();
    const dateDepart = this.parseDateString(dossier.dateCommande);
    const piecesParFamille = this.compterPiecesDossierParFamille(dossier);

    const detailsParFamille: Record<string, EstimationDelaiDetail> = {};
    let dateMax = new Date(dateDepart);
    let joursMax = 1;
    let auMoinsUneFamille = false;

    const famillesToCheck: FamilleProduit[] = ['CAISSON', 'PRECADRE', 'MOUSTIQUAIRE', 'TABLIER'];

    famillesToCheck.forEach(fam => {
      const nbPieces = piecesParFamille[fam] || 0;
      if (nbPieces <= 0) return;

      auMoinsUneFamille = true;
      const configFam = params.familles[fam] || PARAMETRES_PRODUCTION_DEFAUT.familles[fam];

      // Calculer le volume des travaux en cours de cette famille
      // 1. D'après les OFs en cours de cette famille
      let piecesEnFile = 0;
      const ofsEnCours = suivisOF.filter(o =>
        (o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE') &&
        (o.famille === fam || (fam === 'CAISSON' && (o.famille as string) === 'SOUS_FACE'))
      );

      ofsEnCours.forEach(o => {
        // Exclure les OFs qui appartiennent déjà à ce même dossier
        const cmdDossier = (dossier.refCommande || '').toLowerCase().trim();
        const cmdOF = (o.numCommande || '').toLowerCase().trim();
        if (cmdDossier && cmdOF && (cmdDossier.includes(cmdOF) || cmdOF.includes(cmdDossier))) {
          return;
        }
        piecesEnFile += this.compterPiecesOF(o);
      });

      // 2. D'après les autres dossiers en cours antérieurs si pas encore d'OF
      tousDossiers.forEach(d => {
        if (d.id === dossier.id) return;
        if (d.statut !== 'EN_COURS') return;
        // Éviter double compte si un OF existe déjà pour ce dossier
        const hasOF = suivisOF.some(o => o.numCommande === d.refCommande);
        if (!hasOF) {
          const countD = this.compterPiecesDossierParFamille(d);
          piecesEnFile += countD[fam] || 0;
        }
      });

      const totalChargePieces = piecesEnFile + nbPieces;
      const cap = configFam.capaciteJournalierePieces || 120;
      const joursRequis = totalChargePieces / cap + (configFam.delaiFixeJours || 0);
      const dateEstimee = this.ajouterJoursOuvres(dateDepart, joursRequis, params.joursOuvres);

      if (dateEstimee.getTime() > dateMax.getTime()) {
        dateMax = dateEstimee;
        joursMax = Math.max(1, Math.ceil(joursRequis));
      }

      detailsParFamille[fam] = {
        famille: fam,
        libelleFamille: configFam.libelle,
        piecesCommande: nbPieces,
        piecesEnFileAttente: piecesEnFile,
        totalPiecesCharge: totalChargePieces,
        joursOuvresRequis: Math.max(1, Math.ceil(joursRequis)),
        dateLivraisonPrevue: dateEstimee,
        dateLivraisonFormattee: this.formaterDateLivraison(dateEstimee).replace('LIVRAISON : ', '')
      };
    });

    if (!auMoinsUneFamille) {
      // Dossier sans pièces configurées : délai standard de 1 jour ouvré
      dateMax = this.ajouterJoursOuvres(dateDepart, 1, params.joursOuvres);
      joursMax = 1;
    }

    return {
      dateMaximale: dateMax,
      dateLivraisonFormattee: this.formaterDateLivraison(dateMax),
      dateLivraisonISO: this.toISODateString(dateMax),
      joursOuvresMax: joursMax,
      detailsParFamille
    };
  }
}
