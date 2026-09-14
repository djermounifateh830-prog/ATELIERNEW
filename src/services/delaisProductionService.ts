import {
  FamilleProduit,
  ParametresProductionAtelier,
  DossierCommandeGlobal,
  SuiviOF,
  EstimationLivraisonDossier,
  EstimationDelaiDetail
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
    },
    SOUS_FACE: {
      famille: 'SOUS_FACE',
      libelle: 'Sous-faces seules',
      tempsUnitaireMinutes: 4,
      capaciteJournalierePieces: 120,
      delaiFixeJours: 0
    },
    MULTI_FAMILLES: {
      famille: 'MULTI_FAMILLES',
      libelle: 'Multi-Familles / Divers',
      tempsUnitaireMinutes: 10,
      capaciteJournalierePieces: 50,
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
   * Compte le nombre total de pièces dans un dossier par famille
   */
  static compterPiecesDossierParFamille(dossier: DossierCommandeGlobal): Record<FamilleProduit, number> {
    const counts: Record<FamilleProduit, number> = {
      CAISSON: 0,
      PRECADRE: 0,
      MOUSTIQUAIRE: 0,
      TABLIER: 0,
      SOUS_FACE: 0,
      MULTI_FAMILLES: 0
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
  ): { dateLivraison: Date; texteFormatte: string; joursOuvresRequis: number } {
    // Si déjà livré avec une fiche de transfert
    if (targetOF.statut === 'LIVRE' && targetOF.dateLivraison) {
      return {
        dateLivraison: this.parseDateString(targetOF.dateLivraison),
        texteFormatte: `LIVRÉ LE : ${targetOF.dateLivraison}`,
        joursOuvresRequis: 0
      };
    }

    const params = paramsCustom || this.getParametres();
    const fam = targetOF.famille || 'CAISSON';
    const famKey: FamilleProduit = (fam === 'SOUS_FACE' ? 'CAISSON' : fam) as FamilleProduit;
    const configFam = params.familles[famKey] || params.familles.CAISSON;

    // Récupérer tous les OFs en cours de la même famille émis avant cet OF
    const ofDateRef = this.parseDateString(targetOF.dateEmission);
    const targetSeq = targetOF.numeroEmission || 999999;

    let piecesEnFileAttente = 0;
    allSuivisOF.forEach(of => {
      // Ne considérer que les OFs encore en cours de fabrication
      if (of.id === targetOF.id) return;
      if (of.statut !== 'EMIS' && of.statut !== 'RETOUR_EN_ATTENTE') return;

      const ofFam = of.famille === 'SOUS_FACE' ? 'CAISSON' : of.famille;
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
        (o.famille === fam || (fam === 'CAISSON' && o.famille === 'SOUS_FACE'))
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
      joursOuvresMax: joursMax,
      detailsParFamille
    };
  }
}
