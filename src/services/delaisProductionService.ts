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
      tempsUnitaireMinutes: 24, // 24 min par caisson/sous-face
      capaciteJournalierePieces: 20, // 20 caissons / jour
      delaiFixeJours: 0
    },
    PRECADRE: {
      famille: 'PRECADRE',
      libelle: 'Précadres',
      tempsUnitaireMinutes: 24,
      capaciteJournalierePieces: 20, // 20 précadres / jour
      delaiFixeJours: 0
    },
    MOUSTIQUAIRE: {
      famille: 'MOUSTIQUAIRE',
      libelle: 'Moustiquaires plissées',
      tempsUnitaireMinutes: 32,
      capaciteJournalierePieces: 15, // 15 moustiquaires / jour
      delaiFixeJours: 0
    },
    TABLIER: {
      famille: 'TABLIER',
      libelle: 'Tabliers de volet',
      tempsUnitaireMinutes: 32,
      capaciteJournalierePieces: 15, // 15 tabliers / jour
      delaiFixeJours: 0
    }
  }
};

const STORAGE_KEY = '3m_parametres_production_v2';
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
    if (isNaN(d.getTime())) return new Date();

    // Si aucun jour ouvré n'est requis (ex: livraison demandée AUJOURD'HUI / délai 0j)
    if (joursRequis <= 0) {
      return d;
    }

    // Si la date de départ est sur un jour de repos, la fabrication démarre le prochain jour ouvré
    while (!activeJours.includes(d.getDay())) {
      d.setDate(d.getDate() + 1);
    }

    // Nombre de jours entiers de travail
    const joursEntiers = Math.ceil(joursRequis);

    for (let i = 0; i < joursEntiers; i++) {
      d.setDate(d.getDate() + 1);
      while (!activeJours.includes(d.getDay())) {
        d.setDate(d.getDate() + 1);
      }
    }

    return d;
  }

  /**
   * Parse une date au format DD/MM/YYYY ou YYYY-MM-DD (ISO)
   */
  static parseDateString(str?: string): Date {
    if (!str) return new Date();
    try {
      const clean = str.trim();
      // Format ISO "YYYY-MM-DD"
      if (clean.includes('-')) {
        const parts = clean.split('-');
        if (parts.length === 3) {
          const a = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const j = parseInt(parts[2], 10);
          if (!isNaN(j) && !isNaN(m) && !isNaN(a)) {
            return new Date(a, m, j);
          }
        }
      }
      // Format FR "DD/MM/YYYY"
      if (clean.includes('/')) {
        const parts = clean.split('/');
        if (parts.length === 3) {
          const j = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const a = parseInt(parts[2], 10);
          if (!isNaN(j) && !isNaN(m) && !isNaN(a)) {
            return new Date(a, m, j);
          }
        }
      }
      const direct = new Date(clean);
      if (!isNaN(direct.getTime())) return direct;
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

    // Si la commande est en pause / interrompue (rupture matière, attente client...)
    if (statut === 'EN_PAUSE') {
      return {
        statutDelai: 'EN_PAUSE',
        joursDeRetard: 0,
        estDepasse: false,
        estRetardCritique: false,
        texteAlerte: '⏸️ Commande suspendue temporairement (En pause)',
        badgeLabel: '⏸️ En Pause',
        badgeClasses: 'bg-amber-950 text-amber-300 border-2 border-amber-500 shadow-md font-black',
        ligneClasses: 'bg-amber-950/25 border-l-4 border-l-amber-500',
        flagEmoji: '⏸️'
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
    // 1. Si déjà explicitement compté ou enregistré dans l'OF
    if ((of as any).nombrePieces && Number((of as any).nombrePieces) > 0) {
      return Number((of as any).nombrePieces);
    }
    if ((of as any).totalPieces && Number((of as any).totalPieces) > 0) {
      return Number((of as any).totalPieces);
    }

    // 2. D'après les lignes de retour (source principale après optimisation)
    if (of.lignesRetour && of.lignesRetour.length > 0) {
      let count = 0;
      let countNonAccessoires = 0;
      of.lignesRetour.forEach(lr => {
        const rep = (lr.repere || '').toUpperCase().trim();
        const isAccessoire = rep.startsWith('ACCESSOIRE') || rep.startsWith('JOUE') || rep.startsWith('BOUCHON');
        if (!isAccessoire) {
          countNonAccessoires++;
          if (lr.repere) {
            const reps = lr.repere.split(',').filter(Boolean);
            count += reps.length || 1;
          } else if (lr.piecesInfoStr) {
            const parts = lr.piecesInfoStr.split('+').filter(Boolean);
            count += parts.length || 1;
          } else {
            count += 1;
          }
        }
      });
      if (count > 0) return count;
      // Si toutes les lignes étaient des accessoires ou sans repère
      return of.lignesRetour.length;
    }

    // 3. D'après les sections si attachées
    if (Array.isArray((of as any).sections) && (of as any).sections.length > 0) {
      let countSec = 0;
      (of as any).sections.forEach((sec: any) => {
        if (sec?.resultat?.barres_neuves) {
          sec.resultat.barres_neuves.forEach((b: any) => {
            countSec += Array.isArray(b?.pieces) ? b.pieces.length : 1;
          });
        }
      });
      if (countSec > 0) return countSec;
    }

    // 4. D'après le nombre de barres neuves prévues (estimation standard de 2 pièces de débit par barre)
    if (of.totalBarresNeuvesPrevu && of.totalBarresNeuvesPrevu > 0) {
      return Math.max(1, of.totalBarresNeuvesPrevu * 2);
    }

    // Fallback minimal
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

    // Si l'OF est en pause / interrompu pour rupture de stock ou attente
    const estEnPauseOF = targetOF.statut === 'EN_PAUSE' || targetOF.estEnPause;
    let joursInterruptionOF = targetOF.dureePauseJours || 0;
    if (estEnPauseOF && targetOF.datePause) {
      const dPause = this.parseDateString(targetOF.datePause);
      const now = new Date();
      const diffJours = Math.max(0, Math.floor((now.getTime() - dPause.getTime()) / (1000 * 60 * 60 * 24)));
      joursInterruptionOF = Math.max(joursInterruptionOF, diffJours);
    }

    // Si une date personnalisée ou prioritaire a été définie pour cet OF
    if (targetOF.dateLivraisonPrevisionnelle) {
      let dateLiv: Date | null = null;
      if (targetOF.dateLivraisonPrevisionnelleISO) {
        const d = this.parseDateString(targetOF.dateLivraisonPrevisionnelleISO);
        if (!isNaN(d.getTime())) dateLiv = d;
      }
      if (!dateLiv) {
        const matchDate = targetOF.dateLivraisonPrevisionnelle.match(/(\d{1,2})\/(\d{1,2})/);
        if (matchDate) {
          const now = new Date();
          dateLiv = new Date(now.getFullYear(), parseInt(matchDate[2], 10) - 1, parseInt(matchDate[1], 10));
        } else {
          dateLiv = new Date();
        }
      }

      // Si l'OF a subi une interruption (pause), décaler la date de livraison personnalisée d'autant de jours ouvrés
      if (joursInterruptionOF > 0 && dateLiv) {
        const paramsProd = paramsCustom || this.getParametres();
        dateLiv = this.ajouterJoursOuvres(dateLiv, joursInterruptionOF, paramsProd.joursOuvres);
      }

      let texteAffiche = targetOF.dateLivraisonPrevisionnelle.startsWith('⚡') || targetOF.dateLivraisonPrevisionnelle.includes('PRIORITAIRE')
        ? targetOF.dateLivraisonPrevisionnelle
        : targetOF.estPrioritaire
        ? `⚡ PRIORITAIRE : ${targetOF.dateLivraisonPrevisionnelle.replace(/^LIVRAISON\s*:\s*/i, '')}`
        : targetOF.dateLivraisonPrevisionnelle;

      if (estEnPauseOF) {
        texteAffiche = `⏸️ EN PAUSE : ${targetOF.motifPause || 'Rupture'}`;
      } else if (joursInterruptionOF > 0 && dateLiv) {
        texteAffiche = this.formaterDateLivraison(dateLiv);
      }

      return {
        dateLivraison: dateLiv,
        texteFormatte: texteAffiche,
        dateLivraisonISO: this.toISODateString(dateLiv),
        joursOuvresRequis: (targetOF.delaiPrevisionnelJours || (targetOF.estPrioritaire ? 1 : 2)) + joursInterruptionOF
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
    // Si l'OF est prioritaire, il ne subit pas la file d'attente des commandes ordinaires
    if (!targetOF.estPrioritaire) {
      allSuivisOF.forEach(of => {
        // Ne considérer que les OFs encore en cours de fabrication
        if (of.id === targetOF.id) return;
        if (of.statut !== 'EMIS' && of.statut !== 'RETOUR_EN_ATTENTE') return;
        // Les OFs mis en pause (rupture...) ne bloquent pas les machines pour les autres commandes actives
        if (of.estEnPause) return;

        const ofFam = (of.famille as string) === 'SOUS_FACE' ? 'CAISSON' : of.famille;
        if (ofFam === famKey) {
          const otherSeq = of.numeroEmission || 0;
          // Si l'autre OF est prioritaire ou antérieur dans la file FIFO
          if (of.estPrioritaire || otherSeq < targetSeq) {
            piecesEnFileAttente += this.compterPiecesOF(of);
          }
        }
      });
    }

    const piecesTarget = this.compterPiecesOF(targetOF);
    const capaciteJour = configFam.capaciteJournalierePieces || 120;

    // Calcul du délai requis en jours ouvrés basé sur le volume et la cadence journalière de la famille
    const totalChargePieces = targetOF.estPrioritaire ? piecesTarget : (piecesEnFileAttente + piecesTarget);
    const joursProduction = Math.max(1, Math.ceil(totalChargePieces / capaciteJour));
    const joursRequis = joursProduction + (configFam.delaiFixeJours || 0) + joursInterruptionOF;

    const dateLivraison = this.ajouterJoursOuvres(ofDateRef, joursRequis, params.joursOuvres);
    const texteDate = this.formaterDateLivraison(dateLivraison);
    let texteFinal = targetOF.estPrioritaire ? `⚡ PRIORITAIRE : ${texteDate.replace(/^LIVRAISON\s*:\s*/i, '')}` : texteDate;
    if (estEnPauseOF) {
      texteFinal = `⏸️ EN PAUSE : ${targetOF.motifPause || 'Rupture'}`;
    }

    return {
      dateLivraison,
      texteFormatte: texteFinal,
      dateLivraisonISO: this.toISODateString(dateLivraison),
      joursOuvresRequis: targetOF.estPrioritaire ? Math.max(1, Math.ceil(piecesTarget / capaciteJour)) : joursRequis
    };
  }

  /**
   * Calcul complet de la date prévisionnelle de livraison d'un Dossier Commande
   * - Prend en compte la cadence journalière et la charge de chaque famille active
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
        hasPieces: true,
        dateMaximale: dLivre,
        dateLivraisonFormattee: `LIVRÉ LE : ${dossier.dateLivraison}`,
        dateLivraisonISO: this.toISODateString(dLivre),
        joursOuvresMax: 0,
        detailsParFamille: {}
      };
    }

    // Si le dossier est en pause / interrompu pour rupture de stock ou attente
    const estEnPauseDossier = dossier.statut === 'EN_PAUSE' || dossier.estEnPause;
    let joursInterruptionDossier = dossier.dureePauseJours || 0;
    if (estEnPauseDossier && dossier.datePause) {
      const dPause = this.parseDateString(dossier.datePause);
      const now = new Date();
      const diffJours = Math.max(0, Math.floor((now.getTime() - dPause.getTime()) / (1000 * 60 * 60 * 24)));
      joursInterruptionDossier = Math.max(joursInterruptionDossier, diffJours);
    }

    const params = paramsCustom || this.getParametres();
    
    // Détermination de la date de départ atelier :
    // La fabrication et la file d'attente s'exécutent à partir d'aujourd'hui (au plus tôt)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dCmd = this.parseDateString(dossier.dateCommande);
    dCmd.setHours(0, 0, 0, 0);

    // Si la commande a été saisie dans le passé, l'atelier ne peut commencer qu'aujourd'hui
    const dateDepart = dCmd.getTime() > today.getTime() ? dCmd : today;

    const piecesParFamille = this.compterPiecesDossierParFamille(dossier);

    const detailsParFamille: Record<string, EstimationDelaiDetail> = {};
    let dateMax = new Date(dateDepart);
    let joursMax = 0;
    let auMoinsUneFamille = false;
    let familleGoulot: FamilleProduit | undefined = undefined;
    let maxTime = -1;

    const famillesToCheck: FamilleProduit[] = ['CAISSON', 'PRECADRE', 'MOUSTIQUAIRE', 'TABLIER'];

    famillesToCheck.forEach(fam => {
      const nbPieces = piecesParFamille[fam] || 0;
      if (nbPieces > 0) {
        auMoinsUneFamille = true;
      }
      const configFam = params.familles[fam] || PARAMETRES_PRODUCTION_DEFAUT.familles[fam];

      // Calculer le volume des travaux en cours de cette famille à l'atelier
      // RÈGLE : Total des commandes en cours à l'atelier pour cette famille + Volume de la commande actuelle
      let piecesEnFile = 0;
      const ofsDetailsList: { codeOF: string; numCommande: string; nomClient: string; nbPieces: number; statut: string }[] = [];

      const cmdActuelle = (dossier.refCommande || '').toLowerCase().trim();
      const dossierIdActuel = dossier.id;

      // Ensemble des ID de dossiers déjà comptabilisés via leurs OFs en cours pour cette famille
      const dossiersComptabilisesOF = new Set<string>();

      // 1. D'après les OFs en cours de cette famille (en excluant les OFs suspendus/en pause)
      const ofsEnCours = suivisOF.filter(o => {
        const st = (o.statut || '').toUpperCase();
        if (st !== 'EMIS' && st !== 'RETOUR_EN_ATTENTE' && st !== 'EN_COURS') return false;
        if (o.estEnPause) return false;
        const ofFam = (o.famille as string) === 'SOUS_FACE' ? 'CAISSON' : o.famille;
        return ofFam === fam;
      });

      ofsEnCours.forEach(o => {
        const cmdOF = (o.numCommande || '').toLowerCase().trim();
        // Exclure les OFs qui appartiennent déjà à ce même dossier uniquement si ce n'est pas un placeholder générique
        const isCurrentDossierOF = (() => {
          if (!cmdActuelle || cmdActuelle === 'cmd' || cmdActuelle === 'dossier-en-cours') return false;
          if (!cmdOF || cmdOF === 'cmd') return false;
          if (cmdActuelle === cmdOF) return true;
          if (cmdActuelle.length >= 4 && cmdOF.length >= 4 && (cmdActuelle === cmdOF || cmdOF.startsWith(cmdActuelle) || cmdActuelle.startsWith(cmdOF))) {
            return true;
          }
          return false;
        })();

        if (isCurrentDossierOF) {
          return;
        }

        const piecesOF = this.compterPiecesOF(o);
        piecesEnFile += piecesOF;
        ofsDetailsList.push({
          codeOF: o.codeOF || (o.numeroEmission ? `OF-${String(o.numeroEmission).padStart(3, '0')}` : (o.numCommande || 'OF')),
          numCommande: o.numCommande || '',
          nomClient: o.nomClient || '',
          nbPieces: piecesOF,
          statut: o.statut
        });

        // Identifier si cet OF appartient à un dossier connu pour ne pas le recompter en étape 2
        const dParent = tousDossiers.find(d => {
          if (d.id === dossierIdActuel) return false;
          const refs = [
            d.refCommande,
            d.numCommandeCaisson,
            d.numCommandeSousFace,
            d.numCommandeTablier,
            d.numCommandeMoustiquaire,
            d.numCommandePrecadre
          ].filter(Boolean).map(r => r!.toLowerCase().trim());
          return refs.some(r => r === cmdOF || (r.length >= 4 && cmdOF.length >= 4 && (r.startsWith(cmdOF) || cmdOF.startsWith(r))));
        });
        if (dParent) {
          dossiersComptabilisesOF.add(dParent.id);
        }
      });

      // 2. D'après les autres dossiers en attente ou en cours dont l'OF de cette famille n'a pas encore été émis
      tousDossiers.forEach(d => {
        if (d.id === dossierIdActuel) return;
        // Ne compter que les dossiers en cours ou en attente, non en pause
        if ((d.statut !== 'EN_COURS' && d.statut !== 'EN_ATTENTE') || d.estEnPause) return;
        // Si cette famille a déjà un OF comptabilisé à l'étape 1, éviter le double compte
        if (dossiersComptabilisesOF.has(d.id)) return;

        // Vérifier si un OF existe déjà pour ce dossier spécifiquement dans cette famille
        const refsD = [
          d.refCommande,
          d.numCommandeCaisson,
          d.numCommandeSousFace,
          d.numCommandeTablier,
          d.numCommandeMoustiquaire,
          d.numCommandePrecadre
        ].filter(Boolean).map(r => r!.toLowerCase().trim());

        const hasOFPourCetteFamille = suivisOF.some(o => {
          const ofFam = (o.famille as string) === 'SOUS_FACE' ? 'CAISSON' : o.famille;
          if (ofFam !== fam) return false;
          const cmdOF = (o.numCommande || '').toLowerCase().trim();
          return refsD.some(r => r === cmdOF || (r.length >= 4 && cmdOF.length >= 4 && (r.startsWith(cmdOF) || cmdOF.startsWith(r))));
        });

        if (!hasOFPourCetteFamille) {
          const countD = this.compterPiecesDossierParFamille(d);
          const piecesDossier = countD[fam] || 0;
          if (piecesDossier > 0) {
            piecesEnFile += piecesDossier;
            ofsDetailsList.push({
              codeOF: d.refCommande || 'CMD',
              numCommande: d.refCommande || '',
              nomClient: d.nomClientFinal || d.donneurOrdre || '',
              nbPieces: piecesDossier,
              statut: 'COMMANDE_EN_COURS'
            });
          }
        }
      });

      // Volume total à absorber par l'atelier pour cette famille
      const totalChargePieces = dossier.estPrioritaire ? nbPieces : (piecesEnFile + nbPieces);
      const cap = configFam.capaciteJournalierePieces || (fam === 'CAISSON' ? 20 : fam === 'PRECADRE' ? 20 : 15);
      
      // Jours ouvrés requis pour que l'atelier termine l'ensemble de la charge cumulée
      // Si la commande courante a des pièces, on calcule sur totalChargePieces. Sinon, sur la file d'attente de l'atelier
      const chargePourCalcul = nbPieces > 0 ? totalChargePieces : piecesEnFile;
      const joursProduction = chargePourCalcul > 0 ? Math.max(1, Math.ceil(chargePourCalcul / cap)) : 0;
      const joursRequis = joursProduction + (configFam.delaiFixeJours || 0) + (nbPieces > 0 ? joursInterruptionDossier : 0);
      
      // Date prévisionnelle à laquelle l'atelier aura achevé et pourra LIVRER la commande au client
      const dateEstimee = this.ajouterJoursOuvres(dateDepart, Math.max(1, joursRequis), params.joursOuvres);

      if (nbPieces > 0 && dateEstimee.getTime() > maxTime) {
        maxTime = dateEstimee.getTime();
        dateMax = dateEstimee;
        joursMax = joursRequis;
        familleGoulot = fam;
      }

      detailsParFamille[fam] = {
        famille: fam,
        libelleFamille: configFam.libelle,
        piecesCommande: nbPieces,
        piecesEnFileAttente: piecesEnFile,
        totalPiecesCharge: totalChargePieces,
        joursOuvresRequis: Math.max(1, joursRequis),
        dateLivraisonPrevue: dateEstimee,
        dateLivraisonFormattee: this.formaterDateLivraison(dateEstimee).replace('LIVRAISON : ', ''),
        capaciteJournaliere: cap,
        nbOfsEnCours: ofsDetailsList.length,
        ofsDetails: ofsDetailsList
      };
    });

    // Si une date personnalisée ou prioritaire a été manuellement fixée pour ce dossier
    if (dossier.dateLivraisonPrevisionnelle) {
      let dateLiv: Date | null = null;
      if (dossier.dateLivraisonPrevisionnelleISO) {
        const d = this.parseDateString(dossier.dateLivraisonPrevisionnelleISO);
        if (!isNaN(d.getTime())) dateLiv = d;
      }
      if (!dateLiv) {
        const matchDate = dossier.dateLivraisonPrevisionnelle.match(/(\d{1,2})\/(\d{1,2})/);
        if (matchDate) {
          const now = new Date();
          dateLiv = new Date(now.getFullYear(), parseInt(matchDate[2], 10) - 1, parseInt(matchDate[1], 10));
        } else {
          dateLiv = new Date();
        }
      }

      // Si le dossier a été interrompu, décaler la date de livraison personnalisée d'autant de jours ouvrés
      if (joursInterruptionDossier > 0 && dateLiv) {
        const paramsProd = paramsCustom || this.getParametres();
        dateLiv = this.ajouterJoursOuvres(dateLiv, joursInterruptionDossier, paramsProd.joursOuvres);
      }

      let texteAffiche = dossier.dateLivraisonPrevisionnelle.startsWith('⚡') || dossier.dateLivraisonPrevisionnelle.includes('PRIORITAIRE')
        ? dossier.dateLivraisonPrevisionnelle
        : dossier.estPrioritaire
        ? `⚡ PRIORITAIRE : ${dossier.dateLivraisonPrevisionnelle.replace(/^LIVRAISON\s*:\s*/i, '')}`
        : dossier.dateLivraisonPrevisionnelle;

      if (estEnPauseDossier) {
        texteAffiche = `⏸️ EN PAUSE : ${dossier.motifPause || 'Rupture'}`;
      } else if (joursInterruptionDossier > 0 && dateLiv) {
        texteAffiche = this.formaterDateLivraison(dateLiv);
      }

      return {
        hasPieces: auMoinsUneFamille,
        dateMaximale: dateLiv,
        dateLivraisonFormattee: texteAffiche,
        dateLivraisonISO: this.toISODateString(dateLiv),
        joursOuvresMax: (dossier.delaiPrevisionnelJours || (dossier.estPrioritaire ? 1 : 2)) + joursInterruptionDossier,
        familleGoulot,
        detailsParFamille
      };
    }

    if (!auMoinsUneFamille) {
      // Dossier sans pièces encore saisies : trouver la date de disponibilité au plus tôt de l'atelier
      let maxAtelierTime = -1;
      let dateDispoAtelier = dateDepart;
      let joursFileAtelierMax = 0;
      let familleAtelierGoulot: FamilleProduit | undefined = undefined;

      Object.values(detailsParFamille).forEach(det => {
        if (det.piecesEnFileAttente > 0 && det.dateLivraisonPrevue.getTime() > maxAtelierTime) {
          maxAtelierTime = det.dateLivraisonPrevue.getTime();
          dateDispoAtelier = det.dateLivraisonPrevue;
          joursFileAtelierMax = det.joursOuvresRequis;
          familleAtelierGoulot = det.famille;
        }
      });

      return {
        hasPieces: false,
        dateMaximale: dateDispoAtelier,
        dateLivraisonFormattee: joursFileAtelierMax > 0
          ? `Disponibilité atelier : ${this.formaterDateLivraison(dateDispoAtelier).replace('LIVRAISON : ', '')}`
          : 'Atelier disponible immédiatement',
        dateLivraisonISO: this.toISODateString(dateDispoAtelier),
        joursOuvresMax: joursFileAtelierMax,
        familleGoulot: familleAtelierGoulot,
        detailsParFamille
      };
    }

    const texteDateDossier = this.formaterDateLivraison(dateMax);
    const texteFinalDossier = estEnPauseDossier
      ? `⏸️ EN PAUSE : ${dossier.motifPause || 'Rupture'}`
      : texteDateDossier;

    return {
      hasPieces: true,
      dateMaximale: dateMax,
      dateLivraisonFormattee: texteFinalDossier,
      dateLivraisonISO: this.toISODateString(dateMax),
      joursOuvresMax: joursMax,
      familleGoulot,
      detailsParFamille
    };
  }
}
