import {
  FamilleProduit,
  ParametresProductionAtelier,
  DossierCommandeGlobal,
  SuiviOF,
  EstimationLivraisonDossier,
  EstimationDelaiDetail,
  InfoStatutDelai,
  StatutRespectDelai,
  PropositionHeuresSup,
  ResultatPlanningItem
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
      tempsUnitaireMinutes: 5, // 5 min par caisson/sous-face (soit 120 pcs/jour sur base 8h)
      capaciteJournalierePieces: 120, // 120 caissons / jour
      delaiFixeJours: 0
    },
    PRECADRE: {
      famille: 'PRECADRE',
      libelle: 'Précadres',
      tempsUnitaireMinutes: 6, // 6 min par précadre (soit 80 pcs/jour sur base 8h)
      capaciteJournalierePieces: 80, // 80 précadres / jour
      delaiFixeJours: 0
    },
    MOUSTIQUAIRE: {
      famille: 'MOUSTIQUAIRE',
      libelle: 'Moustiquaires plissées',
      tempsUnitaireMinutes: 10, // 10 min par moustiquaire (soit 50 pcs/jour sur base 8h)
      capaciteJournalierePieces: 50, // 50 moustiquaires / jour
      delaiFixeJours: 0
    },
    TABLIER: {
      famille: 'TABLIER',
      libelle: 'Tabliers de volet',
      tempsUnitaireMinutes: 15, // 15 min par tablier (soit 35 pcs/jour sur base 8h)
      capaciteJournalierePieces: 35, // 35 tabliers / jour
      delaiFixeJours: 0
    }
  }
};

const STORAGE_KEY = '3m_parametres_production_v3';
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
    // Si la commande est déjà livrée, fabriquée ou clôturée, aucun retard d'atelier
    if (statut === 'LIVRE' || statut === 'CLOTURE' || statut === 'FABRIQUE' || statut === 'TERMINE') {
      return {
        statutDelai: 'LIVRE',
        joursDeRetard: 0,
        estDepasse: false,
        estRetardCritique: false,
        texteAlerte: statut === 'LIVRE' ? 'Commande livrée' : 'Commande fabriquée / clôturée',
        badgeLabel: statut === 'LIVRE' ? '✓ Livré' : '✓ Fabriqué (Clôturé)',
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
   * Détermine le nombre réel de pièces à usiner/fabriquer associées à un OF (quantité réelle de pièces, non de lignes)
   */
  static compterPiecesOF(of: SuiviOF, dossiers?: DossierCommandeGlobal[]): number {
    // 1. Si déjà explicitement compté ou enregistré dans l'OF
    if ((of as any).nombrePieces && Number((of as any).nombrePieces) > 0) {
      return Number((of as any).nombrePieces);
    }
    if ((of as any).totalPieces && Number((of as any).totalPieces) > 0) {
      return Number((of as any).totalPieces);
    }

    // 2. Recherche dans le dossier parent si disponible (source de vérité absolue des quantités)
    if (dossiers && dossiers.length > 0 && of.numCommande) {
      const ofCmd = of.numCommande.toLowerCase().trim();
      const parent = dossiers.find(d => {
        const refs = [d.refCommande, d.numCommandeCaisson, d.numCommandeTablier, d.numCommandeMoustiquaire, d.numCommandePrecadre]
          .filter(Boolean).map(r => r!.toLowerCase().trim());
        return refs.some(r => r === ofCmd || (r.length >= 3 && ofCmd.length >= 3 && (r.startsWith(ofCmd) || ofCmd.startsWith(r))));
      });
      if (parent) {
        const famCounts = this.compterPiecesDossierParFamille(parent);
        const famKey = ((of.famille as string) === 'SOUS_FACE' ? 'CAISSON' : of.famille) as FamilleProduit;
        if (famCounts[famKey] && famCounts[famKey] > 0) {
          return famCounts[famKey];
        }
      }
    }

    // 3. D'après les lignes de retour (source principale après optimisation)
    if (of.lignesRetour && of.lignesRetour.length > 0) {
      let count = 0;
      of.lignesRetour.forEach(lr => {
        const rep = (lr.repere || '').toUpperCase().trim();
        const isAccessoire = rep.startsWith('ACCESSOIRE') || rep.startsWith('JOUE') || rep.startsWith('BOUCHON');
        if (!isAccessoire) {
          if ((lr as any).quantite && Number((lr as any).quantite) > 0) {
            count += Number((lr as any).quantite);
          } else if (lr.repere) {
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
      return of.lignesRetour.length;
    }

    // 4. Extraction depuis le titre ou la section si mentionné (ex: "15 caissons")
    const matchTitre = (of.titreSection || '').match(/(\d+)\s*(?:pcs?|pi[eè]ces?|caissons?|tabliers?|pr[eé]cadres?|moustiquaires?)/i);
    if (matchTitre && parseInt(matchTitre[1], 10) > 0) {
      return parseInt(matchTitre[1], 10);
    }

    // 5. Fallback d'après le nombre de barres neuves
    if (of.totalBarresNeuvesPrevu && of.totalBarresNeuvesPrevu > 0) {
      return Math.max(1, of.totalBarresNeuvesPrevu);
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
    const cadenceMin = configFam.tempsUnitaireMinutes || (famKey === 'CAISSON' ? 5 : famKey === 'PRECADRE' ? 6 : famKey === 'MOUSTIQUAIRE' ? 10 : 15);
    const heuresJour = params.heuresTravailParJour || 8;
    const minutesJour = heuresJour * 60;
    const capaciteJour = Math.max(1, Math.floor(minutesJour / cadenceMin));

    // Calcul du délai requis en minutes puis conversion en jours ouvrés
    const totalChargePieces = targetOF.estPrioritaire ? piecesTarget : (piecesEnFileAttente + piecesTarget);
    const totalMinutesCharge = totalChargePieces * cadenceMin;
    const joursProduction = Math.max(1, Math.ceil(totalMinutesCharge / minutesJour));
    const joursRequis = joursProduction + (configFam.delaiFixeJours || 0) + joursInterruptionOF;

    // Si 1 jour de travail : achèvement le jour ouvré de démarrage lui-même (0 jour ouvré ajouté)
    // Si N jours de travail : achèvement à (N - 1) jours ouvrés après le jour de démarrage
    const joursAjoutes = Math.max(0, joursProduction - 1) + (configFam.delaiFixeJours || 0) + joursInterruptionOF;
    const dateLivraison = this.ajouterJoursOuvres(ofDateRef, joursAjoutes, params.joursOuvres);
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
      const cap = configFam.capaciteJournalierePieces || (fam === 'CAISSON' ? 120 : fam === 'PRECADRE' ? 80 : fam === 'MOUSTIQUAIRE' ? 50 : 35);
      const tempsUnit = configFam.tempsUnitaireMinutes || (fam === 'CAISSON' ? 5 : fam === 'PRECADRE' ? 6 : fam === 'MOUSTIQUAIRE' ? 10 : 15);

      let joursOuvresFamille = 0;
      let dateEstimeeFamille = dateDepart;
      let dateLivraisonFormatteeFamille = 'Disponible (0 pc)';

      if (nbPieces > 0) {
        // La commande comporte des pièces à fabriquer pour cette famille
        const chargeEffective = dossier.estPrioritaire ? nbPieces : totalChargePieces;
        const joursProduction = Math.max(1, Math.ceil(chargeEffective / cap));
        const joursRequis = joursProduction + (configFam.delaiFixeJours || 0) + joursInterruptionDossier;

        // Si 1 journée de travail requise : achèvement le jour ouvré de démarrage lui-même (0 jour ouvré ajouté)
        // Si N journées requises : achèvement à (N - 1) jours ouvrés après le jour de démarrage
        const joursAjoutes = Math.max(0, joursProduction - 1) + (configFam.delaiFixeJours || 0) + joursInterruptionDossier;
        const dateEstimee = this.ajouterJoursOuvres(dateDepart, joursAjoutes, params.joursOuvres);

        joursOuvresFamille = joursRequis;
        dateEstimeeFamille = dateEstimee;
        dateLivraisonFormatteeFamille = this.formaterDateLivraison(dateEstimee).replace('LIVRAISON : ', '');

        if (dateEstimee.getTime() > maxTime) {
          maxTime = dateEstimee.getTime();
          dateMax = dateEstimee;
          joursMax = joursRequis;
          familleGoulot = fam;
        }
      } else if (piecesEnFile > 0) {
        // La commande n'a pas de pièce dans cette famille, mais l'atelier a une file en cours
        const joursFile = Math.max(1, Math.ceil(piecesEnFile / cap));
        const joursAjoutesFile = Math.max(0, joursFile - 1);
        const dateFinFile = this.ajouterJoursOuvres(dateDepart, joursAjoutesFile, params.joursOuvres);
        joursOuvresFamille = 0; // Ne retarde pas cette commande
        dateEstimeeFamille = dateFinFile;
        dateLivraisonFormatteeFamille = `File atelier : ${piecesEnFile} pcs (~${joursFile}j)`;
      } else {
        // 0 pièce dans la commande, 0 pièce en file
        joursOuvresFamille = 0;
        dateEstimeeFamille = dateDepart;
        dateLivraisonFormatteeFamille = 'Disponible (0 pc)';
      }

      detailsParFamille[fam] = {
        famille: fam,
        libelleFamille: configFam.libelle,
        piecesCommande: nbPieces,
        piecesEnFileAttente: piecesEnFile,
        totalPiecesCharge: totalChargePieces,
        joursOuvresRequis: joursOuvresFamille,
        dateLivraisonPrevue: dateEstimeeFamille,
        dateLivraisonFormattee: dateLivraisonFormatteeFamille,
        capaciteJournaliere: cap,
        tempsUnitaireMinutes: tempsUnit,
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

  /**
   * Moteur de file d'attente et ordonnancement par famille
   * - Équipes 100% dédiées et indépendantes par famille
   * - Cadences réelles en minutes et heures
   * - Remplissage de la journée (ex: 8h = 480 min) puis bascule automatique vers le jour ouvré suivant
   * - Si commande 1 caisson (5 min) => finalisée dans la journée (l'équipe produit plusieurs commandes par jour)
   * - Si commande 200 caissons (1000 min) => étalée sur 2+ jours ouvrés
   * - Les commandes en pause libèrent immédiatement leur créneau machine : toutes les commandes suivantes avancent !
   * - Calcul automatique de proposition d'heures supplémentaires (+2h / 120 min) pour absorber les retards ou commandes prioritaires
   */
  static simulerPlanningFamille(
    famille: FamilleProduit,
    items: PlanningItemSimulation[],
    paramsCustom?: ParametresProductionAtelier,
    bonusMinutesAujourdhui: number = 0,
    dateDepart?: Date
  ): ResultatSimulationPlanningFamille {
    const params = paramsCustom || this.getParametres();
    const configFam = params.familles[famille] || params.familles.CAISSON;
    const cadence = configFam.tempsUnitaireMinutes || (famille === 'CAISSON' ? 5 : famille === 'PRECADRE' ? 6 : famille === 'MOUSTIQUAIRE' ? 10 : 15);
    const heuresStandard = params.heuresTravailParJour || 8;
    const minutesStandard = heuresStandard * 60; // ex: 480 min pour 8h

    const today = dateDepart ? new Date(dateDepart) : new Date();
    today.setHours(8, 0, 0, 0); // Début atelier 08h00

    let currentBaseDate = new Date(today);
    if (!params.joursOuvres.includes(currentBaseDate.getDay())) {
      currentBaseDate = this.ajouterJoursOuvres(currentBaseDate, 1, params.joursOuvres);
      currentBaseDate.setHours(8, 0, 0, 0);
    }

    const enPauseItems: ResultatPlanningItem[] = [];
    const actives: PlanningItemSimulation[] = [];

    items.forEach(it => {
      if (it.estEnPause) {
        enPauseItems.push({
          id: it.id,
          refCommande: it.refCommande,
          nomClient: it.nomClient,
          nbPieces: it.nbPieces,
          estPrioritaire: !!it.estPrioritaire,
          estEnPause: true,
          motifPause: it.motifPause || 'En pause atelier / rupture',
          dateLivraisonEstimee: new Date(currentBaseDate),
          dateLivraisonISO: this.toISODateString(currentBaseDate),
          texteLivraison: `⏸️ EN PAUSE : ${it.motifPause || 'Rupture matière'}`,
          joursOuvresRequis: 0,
          minutesProduction: 0,
          jourIndex: -1,
          heureFinEstimee: '—'
        });
      } else {
        actives.push(it);
      }
    });

    // Ordonnancement de la file active :
    // 1. Commandes prioritaires en tête
    // 2. FIFO (date d'émission la plus ancienne en premier)
    actives.sort((a, b) => {
      if (a.estPrioritaire && !b.estPrioritaire) return -1;
      if (!a.estPrioritaire && b.estPrioritaire) return 1;
      const dateA = a.dateEmission ? this.parseDateString(a.dateEmission).getTime() : 0;
      const dateB = b.dateEmission ? this.parseDateString(b.dateEmission).getTime() : 0;
      return dateA - dateB;
    });

    let currentDayOffset = 0;
    let usedMinutesInDay = 0;
    const planifiees: ResultatPlanningItem[] = [];

    let totalPiecesActives = 0;
    let totalMinutesActives = 0;

    actives.forEach(it => {
      const nbPieces = Math.max(1, it.nbPieces);
      totalPiecesActives += nbPieces;
      let neededMinutes = nbPieces * cadence;
      totalMinutesActives += neededMinutes;

      let orderFinishDay = currentDayOffset;
      let orderFinishMinutesOfDay = 0;

      while (neededMinutes > 0) {
        const capacityThisDay = (currentDayOffset === 0)
          ? (minutesStandard + bonusMinutesAujourdhui)
          : minutesStandard;
        const availableThisDay = Math.max(0, capacityThisDay - usedMinutesInDay);

        if (neededMinutes <= availableThisDay) {
          usedMinutesInDay += neededMinutes;
          orderFinishDay = currentDayOffset;
          orderFinishMinutesOfDay = 8 * 60 + usedMinutesInDay;
          neededMinutes = 0;
        } else {
          neededMinutes -= availableThisDay;
          currentDayOffset += 1;
          usedMinutesInDay = 0;
        }
      }

      const dateLivraison = this.ajouterJoursOuvres(currentBaseDate, orderFinishDay, params.joursOuvres);
      const finHour = Math.floor(orderFinishMinutesOfDay / 60);
      const finMin = Math.floor(orderFinishMinutesOfDay % 60);
      const heureFinStr = `${String(finHour).padStart(2, '0')}:${String(finMin).padStart(2, '0')}`;

      let texteLiv = '';
      if (orderFinishDay === 0) {
        texteLiv = `AUJOURD'HUI (${heureFinStr})`;
      } else if (orderFinishDay === 1) {
        texteLiv = `DEMAIN (${this.formaterDateLivraison(dateLivraison).replace('LIVRAISON : ', '')} ${heureFinStr})`;
      } else {
        texteLiv = `${this.formaterDateLivraison(dateLivraison).replace('LIVRAISON : ', '')} (~${heureFinStr})`;
      }

      if (it.estPrioritaire) {
        texteLiv = `⚡ PRIORITAIRE : ${texteLiv}`;
      }

      planifiees.push({
        id: it.id,
        refCommande: it.refCommande,
        nomClient: it.nomClient,
        nbPieces,
        estPrioritaire: !!it.estPrioritaire,
        estEnPause: false,
        dateLivraisonEstimee: dateLivraison,
        dateLivraisonISO: this.toISODateString(dateLivraison),
        texteLivraison: texteLiv,
        joursOuvresRequis: orderFinishDay + 1,
        minutesProduction: nbPieces * cadence,
        jourIndex: orderFinishDay,
        heureFinEstimee: heureFinStr
      });
    });

    const dateFinGlobale = planifiees.length > 0
      ? planifiees[planifiees.length - 1].dateLivraisonEstimee
      : currentBaseDate;

    // Simulation avec 2 heures supplémentaires (120 minutes) pour évaluer si c'est souhaitable
    let propHS: PropositionHeuresSup = {
      famille,
      libelleFamille: configFam.libelle,
      heuresSupMinutes: 120,
      piecesSupPossibles: Math.floor(120 / cadence),
      estSouhaitable: false,
      motif: '',
      commandesAvanceesAujourdhui: []
    };

    if (actives.length > 0 && bonusMinutesAujourdhui === 0) {
      // Exécuter la simulation avec +120 minutes aujourd'hui
      const simHS = this.simulerPlanningFamille(famille, items, params, 120, dateDepart);
      const commandesGagneesAujourdhui: string[] = [];
      planifiees.forEach(cmdStd => {
        if (cmdStd.jourIndex > 0) {
          const matchHS = simHS.commandesPlanifiees.find(c => c.id === cmdStd.id);
          if (matchHS && matchHS.jourIndex === 0) {
            commandesGagneesAujourdhui.push(cmdStd.refCommande);
          }
        }
      });

      const piecesSup = Math.floor(120 / cadence);
      const hasPrioritairesOuRetard = actives.some(a => a.estPrioritaire);

      if (commandesGagneesAujourdhui.length > 0 || hasPrioritairesOuRetard) {
        const gainCount = commandesGagneesAujourdhui.length;
        propHS.estSouhaitable = true;
        propHS.commandesAvanceesAujourdhui = commandesGagneesAujourdhui;
        propHS.motif = gainCount > 0
          ? `+2h sup (+120 min) permet de produire ${piecesSup} pièces de plus et de finaliser ${gainCount} commande(s) (${commandesGagneesAujourdhui.slice(0, 3).join(', ')}${gainCount > 3 ? '...' : ''}) AUJOURD'HUI même au lieu de demain.`
          : `+2h sup (+120 min) permet d'absorber ${piecesSup} pièces de plus aujourd'hui et de sécuriser les délais des commandes prioritaires de l'atelier.`;
      }
    }

    return {
      famille,
      libelleFamille: configFam.libelle,
      capaciteJourMinutes: minutesStandard,
      cadenceUnitaireMinutes: cadence,
      totalPiecesActives,
      totalMinutesActives,
      chargeHeuresTotale: Math.round((totalMinutesActives / 60) * 10) / 10,
      chargeJoursTotal: Math.max(1, Math.ceil(totalMinutesActives / minutesStandard)),
      dateFinGlobale,
      dateFinGlobaleFormattee: this.formaterDateLivraison(dateFinGlobale),
      commandesPlanifiees: planifiees,
      commandesEnPause: enPauseItems,
      propositionHeuresSup: propHS
    };
  }
}

export interface PlanningItemSimulation {
  id: string;
  refCommande: string;
  nomClient: string;
  nbPieces: number;
  estPrioritaire?: boolean;
  estEnPause?: boolean;
  motifPause?: string;
  dateEmission?: string;
  statutOF?: string;
  dossierId?: string;
}

export interface ResultatSimulationPlanningFamille {
  famille: FamilleProduit;
  libelleFamille: string;
  capaciteJourMinutes: number;
  cadenceUnitaireMinutes: number;
  totalPiecesActives: number;
  totalMinutesActives: number;
  chargeHeuresTotale: number;
  chargeJoursTotal: number;
  dateFinGlobale: Date;
  dateFinGlobaleFormattee: string;
  commandesPlanifiees: ResultatPlanningItem[];
  commandesEnPause: ResultatPlanningItem[];
  propositionHeuresSup: PropositionHeuresSup;
}
