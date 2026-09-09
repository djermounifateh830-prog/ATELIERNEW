import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import {
  Article,
  ChuteItem,
  ChuteMaille,
  MappingChutes,
  DossierCommandeGlobal,
  SuiviOF,
  MouvementStock,
  ClientCodification,
  FicheTransfert,
  FamilleProduit
} from '../types/index';
import {
  INITIAL_ARTICLES,
  INITIAL_CHUTES_STOCK,
  INITIAL_MAILLE_CHUTES,
  INITIAL_MAPPING
} from '../data/initialData';
import { INITIAL_CLIENT_CODIFICATIONS } from '../data/initialCodifications';


// Chemin du fichier de base de données physique à la racine du projet
const DB_PATH = path.resolve(process.cwd(), '3m_atelier.db');

class AtelierDatabase {
  private db: DatabaseSync;

  constructor() {
    // Initialisation de la connexion SQLite
    this.db = new DatabaseSync(DB_PATH);
    // Activer le mode WAL (Write-Ahead Logging) pour des performances et une concurrence optimales
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initTables();
    this.cleanCorruptedDesignations();
    this.seedIfEmpty();
    this.rebuildReservationsIfEmpty();
    this.reparerFamillesOF();
  }

  private cleanCorruptedDesignations() {
    try {
      const cleanups: [string, string][] = [
        ['SF 200 (SOUS-FACE 200MM)', 'SF 200'],
        ['SF 250 (SOUS-FACE 250MM)', 'SF 250'],
        ['SF 300 (SOUS-FACE 300MM)', 'SF 300'],
        ['SF 200 7024 (SOUS-FACE 200MM GRIS)', 'SF 200 7024'],
        ['SF 250 7024 (SOUS-FACE 250MM GRIS)', 'SF 250 7024'],
        ['SF 300 7024 (SOUS-FACE 300MM GRIS)', 'SF 300 7024'],
        ['SF 200 (SOUS-FACE 200MM BLANC)', 'SF 200'],
        ['SF 250 (SOUS-FACE 250MM BLANC)', 'SF 250'],
        ['SF 300 (SOUS-FACE 300MM BLANC)', 'SF 300'],
        ['TBL 43 BL (LAME TABLIER 43MM)', 'TBL 43 BL'],
        ['TAB 55 7024 (LAME TABLIER 55MM GRIS)', 'TAB 55 7024'],
        ['LAME FINALE 43 (LAME DE SEUIL 43MM)', 'LAME FINALE 43'],
        ['LAME FINALE 55 ALU 7024 (LAME DE SEUIL 55MM GRIS)', 'LAME FINALE 55 ALU 7024'],
        ['COULISSE 43 9007 (GRIS METAL)', 'COULISSE 43 9007'],
        ['MSTQ MAILLE PLISSÉE 20mm (TOILE MOUSTIQUAIRE)', 'MSTQ MAILLE PLISSÉE 20mm'],
        ['CADRE MSTQ 7024 (PROFILÉ CADRE MOUSTIQUAIRE)', 'CADRE MSTQ 7024'],
        ['BARRE COULISSE MSTQ 7024 (COULISSE DE TIRAGE MOUSTIQUAIRE)', 'BARRE COULISSE MSTQ 7024'],
        ['BARRE INFERIEURE MSTQ 7024 (BARRE INFÉRIEURE MOUSTIQUAIRE)', 'BARRE INFERIEURE MSTQ 7024'],
        ['PRÉCADRE PRC 43 (PROFILÉ DORMANT 43MM)', 'PRÉCADRE PRC 43'],
        ['PRÉCADRE PRC 55 (PROFILÉ DORMANT 55MM)', 'PRÉCADRE PRC 55'],
        ['BOUCHON PRECADRE 43 (Bouchon 90° Plastique)', 'BOUCHON PRECADRE 43'],
        ['BOUCHON PRECADRE 55 (Bouchon 90° Plastique)', 'BOUCHON PRECADRE 55']
      ];

      this.db.exec('BEGIN TRANSACTION');
      for (const [oldName, newName] of cleanups) {
        this.db.prepare('UPDATE OR IGNORE chute_families SET name = ? WHERE name = ?').run(newName, oldName);
        this.db.prepare('DELETE FROM chute_families WHERE name = ?').run(oldName);
        this.db.prepare('UPDATE chutes_barres SET sheet_name = ? WHERE sheet_name = ?').run(newName, oldName);
        this.db.prepare('UPDATE mapping_chutes SET sheet_name = ? WHERE sheet_name = ?').run(newName, oldName);
        this.db.prepare('UPDATE articles SET designation = ? WHERE designation = ?').run(newName, oldName);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch {}
      console.warn('Designations cleanup warning:', e);
    }
  }

  private initTables() {
    this.db.exec(`
      -- Table Articles
      CREATE TABLE IF NOT EXISTS articles (
        code_art TEXT PRIMARY KEY,
        designation TEXT NOT NULL,
        statut TEXT DEFAULT 'NORMAL',
        hauteur REAL DEFAULT 0,
        longeur REAL DEFAULT 6000,
        lame REAL DEFAULT 4.5,
        debordement REAL DEFAULT 0,
        refus_min REAL DEFAULT 300,
        refus_max REAL DEFAULT 1200,
        stock_physique REAL DEFAULT 0,
        quantite_reservee REAL DEFAULT 0,
        prix_unitaire REAL DEFAULT 0,
        stock_min REAL DEFAULT 5
      );

      -- Table Chutes Barres
      CREATE TABLE IF NOT EXISTS chutes_barres (
        id TEXT PRIMARY KEY,
        sheet_name TEXT NOT NULL,
        longueur REAL NOT NULL,
        quantite INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chutes_sheet ON chutes_barres(sheet_name);

      -- Table Familles de Chutes (pour préserver les familles même avec 0 chutes)
      CREATE TABLE IF NOT EXISTS chute_families (
        name TEXT PRIMARY KEY
      );

      -- Table Chutes Maille
      CREATE TABLE IF NOT EXISTS chutes_maille (
        id TEXT PRIMARY KEY,
        dimension_fixe REAL NOT NULL,
        plis INTEGER NOT NULL
      );

      -- Table Mapping Chutes
      CREATE TABLE IF NOT EXISTS mapping_chutes (
        code_art TEXT PRIMARY KEY,
        sheet_name TEXT NOT NULL
      );

      -- Table Dossiers de Commande
      CREATE TABLE IF NOT EXISTS dossiers (
        id TEXT PRIMARY KEY,
        donneur_ordre TEXT,
        nom_client_final TEXT,
        date_commande TEXT,
        ref_commande TEXT,
        statut TEXT,
        json_data TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Table Suivis Ordres de Fabrication
      CREATE TABLE IF NOT EXISTS suivis_of (
        id TEXT PRIMARY KEY,
        num_commande TEXT NOT NULL,
        nom_client TEXT,
        donneur_ordre TEXT,
        famille TEXT,
        titre_section TEXT,
        statut TEXT NOT NULL,
        date_emission TEXT,
        date_retour TEXT,
        json_data TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Table Mouvements de Stock
      CREATE TABLE IF NOT EXISTS mouvements_stock (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        of_id TEXT REFERENCES suivis_of(id) ON DELETE SET NULL,
        num_commande TEXT,
        nom_client TEXT,
        article_code TEXT,
        designation TEXT,
        longueur_mm REAL,
        quantite INTEGER,
        remarque TEXT,
        chute_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mvt_date ON mouvements_stock(date);
      CREATE INDEX IF NOT EXISTS idx_mvt_of ON mouvements_stock(of_id);

      -- Table Fiches de Transfert & Bons de Livraison Transporteur
      CREATE TABLE IF NOT EXISTS fiches_transfert (
        id TEXT PRIMARY KEY,
        numero_fiche TEXT NOT NULL,
        mon_client TEXT NOT NULL,
        nom_chauffeur TEXT,
        date_livraison TEXT NOT NULL,
        statut TEXT NOT NULL DEFAULT 'VALIDEE',
        json_data TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_fiche_date ON fiches_transfert(date_livraison);
      CREATE INDEX IF NOT EXISTS idx_fiche_client ON fiches_transfert(mon_client);

      -- Table Codification Clients & Agences (Préfixes automatiques et Repères)
      CREATE TABLE IF NOT EXISTS client_codifications (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        nom TEXT NOT NULL,
        prefixe_commande TEXT NOT NULL,
        prefixe_repere_special TEXT,
        type TEXT NOT NULL,
        badge_color TEXT,
        badge_bg TEXT,
        description TEXT,
        actif INTEGER NOT NULL DEFAULT 1,
        ordre INTEGER DEFAULT 0,
        peinture_par_defaut INTEGER DEFAULT 0,
        montage_sous_face_par_defaut INTEGER DEFAULT 1,
        avec_plaque_par_defaut INTEGER DEFAULT 0
      );

      -- Table Métadonnées Système
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Table Réservations Chutes Barres (OFs en cours de fabrication)
      CREATE TABLE IF NOT EXISTS reservations_chutes (
        id TEXT PRIMARY KEY,
        of_id TEXT NOT NULL REFERENCES suivis_of(id) ON DELETE CASCADE,
        num_commande TEXT,
        chute_id TEXT,
        sheet_name TEXT NOT NULL,
        longueur REAL NOT NULL,
        quantite INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_res_chutes_of ON reservations_chutes(of_id);
      CREATE INDEX IF NOT EXISTS idx_res_chutes_sheet ON reservations_chutes(sheet_name);

      -- Table Réservations Barres Neuves (Articles alu réservés sur OFs en cours)
      CREATE TABLE IF NOT EXISTS reservations_barres (
        id TEXT PRIMARY KEY,
        of_id TEXT NOT NULL REFERENCES suivis_of(id) ON DELETE CASCADE,
        num_commande TEXT,
        code_art TEXT NOT NULL REFERENCES articles(code_art) ON DELETE CASCADE,
        quantite INTEGER NOT NULL,
        longueur REAL DEFAULT 6000,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_res_barres_of ON reservations_barres(of_id);
      CREATE INDEX IF NOT EXISTS idx_res_barres_art ON reservations_barres(code_art);

      -- Table Réservations Chutes Toile Maille Moustiquaire
      CREATE TABLE IF NOT EXISTS reservations_maille (
        id TEXT PRIMARY KEY,
        of_id TEXT NOT NULL REFERENCES suivis_of(id) ON DELETE CASCADE,
        num_commande TEXT,
        chute_id TEXT,
        dimension_fixe REAL NOT NULL,
        plis INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_res_maille_of ON reservations_maille(of_id);
    `);

    // Migrations pour tables existantes déjà initialisées sur disque
    try {
      this.db.exec('ALTER TABLE reservations_chutes ADD COLUMN chute_id TEXT;');
    } catch {}
    try {
      this.db.exec('ALTER TABLE mouvements_stock ADD COLUMN chute_id TEXT;');
    } catch {}
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_res_chutes_cid ON reservations_chutes(chute_id);');
    } catch {}
    try {
      this.db.exec('ALTER TABLE client_codifications ADD COLUMN peinture_par_defaut INTEGER DEFAULT 0;');
    } catch {}
    try {
      this.db.exec('ALTER TABLE client_codifications ADD COLUMN montage_sous_face_par_defaut INTEGER DEFAULT 1;');
    } catch {}
    try {
      this.db.exec('ALTER TABLE client_codifications ADD COLUMN avec_plaque_par_defaut INTEGER DEFAULT 0;');
    } catch {}
  }

  private seedIfEmpty() {
    // Vérifier si la table des codifications est vide, même si app_meta existe déjà (migration douce)
    const countCodif = (this.db.prepare("SELECT count(*) as c FROM client_codifications").get() as any)?.c || 0;
    if (countCodif === 0) {
      console.log('📦 [SQLite] Ensemencement des codifications clients...');
      this.saveClientCodifications(INITIAL_CLIENT_CODIFICATIONS);
    } else {
      // S'assurer que les valeurs par défaut de Caisson existent pour les codifications existantes
      try {
        for (const initC of INITIAL_CLIENT_CODIFICATIONS) {
          this.db.prepare(`
            UPDATE client_codifications
            SET peinture_par_defaut = COALESCE(peinture_par_defaut, ?),
                montage_sous_face_par_defaut = COALESCE(montage_sous_face_par_defaut, ?),
                avec_plaque_par_defaut = COALESCE(avec_plaque_par_defaut, ?)
            WHERE id = ? AND (peinture_par_defaut IS NULL OR montage_sous_face_par_defaut IS NULL OR avec_plaque_par_defaut IS NULL)
          `).run(
            initC.peintureParDefaut ? 1 : 0,
            initC.montageSousFaceParDefaut !== false ? 1 : 0,
            initC.avecPlaqueParDefaut ? 1 : 0,
            initC.id
          );
        }
      } catch {}
    }

    // Vérifier si la base a déjà été initialisée
    const isInit = (this.db.prepare("SELECT value FROM app_meta WHERE key = 'db_initialized'").get() as any)?.value;
    if (isInit) {
      // Migration douce : s'assurer que les articles Joues existent même si la base était déjà initialisée
      const hasJoues = (this.db.prepare("SELECT count(*) as c FROM articles WHERE designation LIKE '%JOUE%'").get() as any)?.c || 0;
      if (hasJoues === 0) {
        console.log('📦 [SQLite] Ensemencement des articles Joues (CT JOUE 25, 30, 35, 40)...');
        const stmtJ = this.db.prepare(`
          INSERT OR IGNORE INTO articles (
            code_art, designation, statut, hauteur, longeur, lame,
            debordement, refus_min, refus_max, stock_physique,
            quantite_reservee, prix_unitaire, stock_min
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmtJ.run('ART0063', 'CT JOUE 25', 'NORMAL', 0, 0, 0, 0, 0, 0, 550, 0, 250, 50);
        stmtJ.run('ART0064', 'CT JOUE 30', 'NORMAL', 0, 0, 0, 0, 0, 0, 350, 0, 300, 50);
        stmtJ.run('ART0067', 'CT JOUE 35', 'NORMAL', 0, 0, 0, 0, 0, 0, 150, 0, 350, 30);
        stmtJ.run('ART0068', 'CT JOUE 40', 'NORMAL', 0, 0, 0, 0, 0, 0, 100, 0, 400, 20);
      }
      return; // Ne jamais ré-écraser les choix de l'utilisateur une fois initialisé
    }

    // Première initialisation seulement :
    console.log('📦 [SQLite] Ensemencement initial de la base de données...');
    this.saveArticles(INITIAL_ARTICLES);
    this.saveChutesBarres(INITIAL_CHUTES_STOCK);
    this.saveChutesMaille(INITIAL_MAILLE_CHUTES);
    this.saveMapping(INITIAL_MAPPING);

    this.db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('db_initialized', 'true')").run();
  }


  // ==========================================
  // ARTICLES
  // ==========================================
  getArticles(): Article[] {
    const rows = this.db.prepare('SELECT * FROM articles ORDER BY code_art ASC').all() as any[];
    return rows.map(r => ({
      code_art: r.code_art,
      designation: r.designation,
      statut: r.statut,
      hauteur: Number(r.hauteur),
      longeur: Number(r.longeur),
      lame: Number(r.lame),
      debordement: Number(r.debordement),
      refus_min: Number(r.refus_min),
      refus_max: Number(r.refus_max),
      stock_physique: Number(r.stock_physique),
      quantite_reservee: Number(r.quantite_reservee),
      prix_unitaire: Number(r.prix_unitaire),
      stock_min: Number(r.stock_min)
    }));
  }

  saveArticles(articles: Article[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM articles');
      const stmt = this.db.prepare(`
        INSERT INTO articles (
          code_art, designation, statut, hauteur, longeur, lame,
          debordement, refus_min, refus_max, stock_physique,
          quantite_reservee, prix_unitaire, stock_min
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of articles) {
        stmt.run(
          a.code_art, a.designation, a.statut || 'NORMAL', a.hauteur || 0,
          a.longeur ?? 6000, a.lame ?? 4.5, a.debordement ?? 0,
          a.refus_min ?? 300, a.refus_max ?? 1200, a.stock_physique ?? 0,
          a.quantite_reservee ?? 0, a.prix_unitaire ?? 0, a.stock_min ?? 5
        );
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  upsertArticle(art: Article) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO articles (
        code_art, designation, statut, hauteur, longeur, lame,
        debordement, refus_min, refus_max, stock_physique,
        quantite_reservee, prix_unitaire, stock_min
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      art.code_art, art.designation, art.statut || 'NORMAL', art.hauteur ?? 0,
      art.longeur ?? 6000, art.lame ?? 4.5, art.debordement ?? 0,
      art.refus_min ?? 300, art.refus_max ?? 1200, art.stock_physique ?? 0,
      art.quantite_reservee ?? 0, art.prix_unitaire ?? 0, art.stock_min ?? 5
    );
  }

  deleteArticle(code: string) {
    // Vérifier si l'article est actuellement réservé sur un OF en cours
    const activeRes = (this.db.prepare(`
      SELECT rb.num_commande, COUNT(*) as count
      FROM reservations_barres rb
      JOIN suivis_of s ON rb.of_id = s.id
      WHERE rb.code_art = ? AND s.statut IN ('EMIS', 'RETOUR_EN_ATTENTE', 'EN_COURS')
      GROUP BY rb.num_commande
    `).all(code) as any[]);

    if (activeRes && activeRes.length > 0) {
      const ofList = activeRes.map((r: any) => r.num_commande || 'Inconnu').join(', ');
      throw new Error(`Impossible de supprimer l'article "${code}" : il est actuellement réservé sur un ou plusieurs Ordres de Fabrication en cours (${ofList}). Clôturez ou annulez d'abord ces OFs.`);
    }

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare('DELETE FROM mapping_chutes WHERE code_art = ?').run(code);
      this.db.prepare('DELETE FROM reservations_barres WHERE code_art = ?').run(code);
      this.db.prepare('DELETE FROM articles WHERE code_art = ?').run(code);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==========================================
  // CHUTES BARRES & FAMILLES
  // ==========================================
  getChutesBarres(): Record<string, ChuteItem[]> {
    // 1. Récupérer d'abord toutes les familles enregistrées
    const famRows = this.db.prepare('SELECT name FROM chute_families ORDER BY name ASC').all() as any[];
    const map: Record<string, ChuteItem[]> = {};
    for (const f of famRows) {
      if (f.name) map[f.name] = [];
    }

    // Récupérer les réservations actives d'OFs en cours (EMIS, RETOUR_EN_ATTENTE, EN_COURS)
    const activeRes = this.db.prepare(`
      SELECT rc.chute_id, rc.sheet_name, rc.longueur, SUM(rc.quantite) as total_reserve
      FROM reservations_chutes rc
      JOIN suivis_of s ON rc.of_id = s.id
      WHERE s.statut IN ('EMIS', 'RETOUR_EN_ATTENTE', 'EN_COURS')
      GROUP BY rc.chute_id, rc.sheet_name, rc.longueur
    `).all() as any[];

    // 1. Map des réservations par ID précis (Point 3.7 : traçabilité absolue)
    const idResMap = new Map<string, number>();
    // 2. Map des réservations par profilé / longueur (pour compatibilité ou réservations non spécifiées par ID)
    const legacyResMap = new Map<string, number>();

    for (const ar of activeRes) {
      const qte = Number(ar.total_reserve) || 0;
      if (ar.chute_id) {
        idResMap.set(ar.chute_id, (idResMap.get(ar.chute_id) || 0) + qte);
      } else {
        const sheet = (ar.sheet_name || '').trim().toUpperCase();
        const lg = Math.round(Number(ar.longueur) || 0);
        const key = `${sheet}__${lg}`;
        legacyResMap.set(key, (legacyResMap.get(key) || 0) + qte);
      }
    }

    // 2. Charger les chutes physiques existantes et déduire les réservations pour les optimisations futures
    const rows = this.db.prepare('SELECT * FROM chutes_barres ORDER BY longueur DESC').all() as any[];
    for (const r of rows) {
      if (!map[r.sheet_name]) map[r.sheet_name] = [];
      const physicalQte = Number(r.quantite) || 0;
      const sheet = (r.sheet_name || '').trim().toUpperCase();
      const lg = Math.round(Number(r.longueur) || 0);
      const key = `${sheet}__${lg}`;

      // a. Déduction prioritaire par ID unique
      let usedReserve = 0;
      let availablePhysical = physicalQte;
      if (r.id && idResMap.has(r.id)) {
        const reservedById = idResMap.get(r.id)!;
        const matchedQte = Math.min(availablePhysical, reservedById);
        usedReserve += matchedQte;
        availablePhysical -= matchedQte;
        idResMap.set(r.id, reservedById - matchedQte);
      }

      // b. Déduction secondaire par profilé et longueur pour le reste disponible
      if (availablePhysical > 0) {
        let reservedForLg = legacyResMap.get(key) || 0;
        let matchedKey = key;
        if (reservedForLg === 0) {
          // Tolérance 5mm si pas d'égalité stricte
          for (const [k, count] of legacyResMap.entries()) {
            if (count > 0 && k.startsWith(`${sheet}__`)) {
              const otherLg = parseInt(k.split('__')[1], 10);
              if (Math.abs(otherLg - lg) <= 5) {
                reservedForLg = count;
                matchedKey = k;
                break;
              }
            }
          }
        }
        if (reservedForLg > 0) {
          const matchedLegacy = Math.min(availablePhysical, reservedForLg);
          usedReserve += matchedLegacy;
          availablePhysical -= matchedLegacy;
          legacyResMap.set(matchedKey, reservedForLg - matchedLegacy);
        }
      }

      const dispoQte = Math.max(0, physicalQte - usedReserve);

      map[r.sheet_name].push({
        id: r.id,
        longueur: Number(r.longueur),
        quantite: dispoQte, // Pour que les algorithmes d'optimisation ne prennent jamais une chute déjà engagée (1 - 1 = 0)
        quantitePhysique: physicalQte, // Stock physique réel dans l'atelier
        reserve: usedReserve // Quantité préaffectée / réservée sur un OF en cours
      });
    }
    return map;
  }

  saveChutesBarres(chutesMap: Record<string, ChuteItem[]>, replaceEntireDb: boolean = false) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      if (replaceEntireDb) {
        this.db.exec('DELETE FROM chutes_barres');
      }
      
      const insertFam = this.db.prepare('INSERT OR IGNORE INTO chute_families (name) VALUES (?)');
      const deleteSheet = this.db.prepare('DELETE FROM chutes_barres WHERE sheet_name = ?');
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO chutes_barres (id, sheet_name, longueur, quantite)
        VALUES (?, ?, ?, ?)
      `);

      let counter = 1;
      const usedIds = new Set<string>();
      const timestamp = Date.now();

      for (const [sheetName, items] of Object.entries(chutesMap)) {
        if (!sheetName || sheetName.trim() === '') continue;
        const cleanSheet = sheetName.trim();
        insertFam.run(cleanSheet);
        if (!replaceEntireDb) {
          deleteSheet.run(cleanSheet);
        }
        const safeSheet = cleanSheet.replace(/[^a-zA-Z0-9]/g, '_');

        if (Array.isArray(items)) {
          for (const item of items) {
            let chuteId = item.id ? String(item.id).trim() : '';
            // Si pas d'ID, ou si l'ID a déjà été utilisé dans cette sauvegarde, générer un ID unique garanti
            if (!chuteId || usedIds.has(chuteId)) {
              chuteId = `c-${safeSheet}-${timestamp}-${counter++}-${Math.random().toString(36).substring(2, 7)}`;
            }
            usedIds.add(chuteId);

            // Toujours persister le stock physique réel
            const rawQte = (item as any).quantitePhysique ?? item.quantite;
            const qteVal = Math.max(0, Math.round(Number(rawQte) || 0));
            if (qteVal > 0) {
              stmt.run(
                chuteId,
                cleanSheet,
                Number(item.longueur) || 0,
                qteVal
              );
            }
          }
        }
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  createChuteFamily(name: string) {
    const clean = name.trim();
    if (!clean) throw new Error('Nom de famille requis');
    this.db.prepare('INSERT OR IGNORE INTO chute_families (name) VALUES (?)').run(clean);
  }

  renameChuteSheet(oldName: string, newName: string) {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew) throw new Error('Ancien et nouveau nom requis');
    
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare('INSERT OR IGNORE INTO chute_families (name) VALUES (?)').run(cleanNew);
      this.db.prepare('UPDATE chutes_barres SET sheet_name = ? WHERE sheet_name = ?').run(cleanNew, cleanOld);
      this.db.prepare('UPDATE mapping_chutes SET sheet_name = ? WHERE sheet_name = ?').run(cleanNew, cleanOld);
      this.db.prepare('DELETE FROM chute_families WHERE name = ?').run(cleanOld);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  deleteChuteSheet(sheetName: string) {
    const clean = sheetName.trim();
    // Vérifier si des chutes de cette famille sont actuellement réservées sur des OFs en cours
    const activeRes = (this.db.prepare(`
      SELECT rc.num_commande, COUNT(*) as count
      FROM reservations_chutes rc
      JOIN suivis_of s ON rc.of_id = s.id
      WHERE rc.sheet_name = ? AND s.statut IN ('EMIS', 'RETOUR_EN_ATTENTE', 'EN_COURS')
      GROUP BY rc.num_commande
    `).all(clean) as any[]);

    if (activeRes && activeRes.length > 0) {
      const ofList = activeRes.map((r: any) => r.num_commande || 'Inconnu').join(', ');
      throw new Error(`Impossible de supprimer la famille de chutes "${clean}" : elle contient des chutes réservées sur des Ordres de Fabrication en cours (${ofList}). Clôturez ou annulez d'abord ces OFs.`);
    }

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare('DELETE FROM chute_families WHERE name = ?').run(clean);
      this.db.prepare('DELETE FROM chutes_barres WHERE sheet_name = ?').run(clean);
      this.db.prepare('DELETE FROM mapping_chutes WHERE sheet_name = ?').run(clean);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==========================================
  // CHUTES MAILLE
  // ==========================================
  getChutesMaille(): ChuteMaille[] {
    const activeRes = this.db.prepare(`
      SELECT rm.chute_id, rm.dimension_fixe, SUM(rm.plis) as total_plis_reserve
      FROM reservations_maille rm
      JOIN suivis_of s ON rm.of_id = s.id
      WHERE s.statut IN ('EMIS', 'RETOUR_EN_ATTENTE', 'EN_COURS')
      GROUP BY rm.chute_id, rm.dimension_fixe
    `).all() as any[];

    const resMap = new Map<string, number>();
    for (const ar of activeRes) {
      if (ar.chute_id) {
        resMap.set(`id_${ar.chute_id}`, (resMap.get(`id_${ar.chute_id}`) || 0) + Number(ar.total_plis_reserve));
      }
      const dimKey = `dim_${Math.round(Number(ar.dimension_fixe))}`;
      resMap.set(dimKey, (resMap.get(dimKey) || 0) + Number(ar.total_plis_reserve));
    }

    const rows = this.db.prepare('SELECT * FROM chutes_maille ORDER BY dimension_fixe DESC').all() as any[];
    return rows.map(r => {
      const physicalPlis = Number(r.plis) || 0;
      let reservedPlis = 0;
      if (r.id && resMap.has(`id_${r.id}`)) {
        reservedPlis = resMap.get(`id_${r.id}`) || 0;
      } else {
        const dimKey = `dim_${Math.round(Number(r.dimension_fixe))}`;
        const availRes = resMap.get(dimKey) || 0;
        reservedPlis = Math.min(physicalPlis, availRes);
        resMap.set(dimKey, availRes - reservedPlis);
      }
      const dispoPlis = Math.max(0, physicalPlis - reservedPlis);

      return {
        id: r.id,
        dimension_fixe: Number(r.dimension_fixe),
        plis: dispoPlis,
        plisPhysique: physicalPlis,
        plisReserve: reservedPlis
      };
    });
  }

  saveChutesMaille(mailleList: ChuteMaille[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM chutes_maille');
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO chutes_maille (id, dimension_fixe, plis)
        VALUES (?, ?, ?)
      `);
      let counter = 1;
      const usedMailleIds = new Set<string>();
      const timestamp = Date.now();

      for (const m of mailleList) {
        let mailleId = m.id ? String(m.id).trim() : '';
        if (!mailleId || usedMailleIds.has(mailleId)) {
          mailleId = `m-${timestamp}-${counter++}-${Math.random().toString(36).substring(2, 7)}`;
        }
        usedMailleIds.add(mailleId);

        const rawPlis = (m as any).plisPhysique ?? m.plis;
        const plisVal = Math.max(0, Math.round(Number(rawPlis) || 0));
        if (plisVal > 0) {
          stmt.run(
            mailleId,
            Number(m.dimension_fixe) || 0,
            plisVal
          );
        }
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==========================================
  // MAPPING
  // ==========================================
  getMapping(): MappingChutes {
    const rows = this.db.prepare('SELECT * FROM mapping_chutes').all() as any[];
    const map: MappingChutes = {};
    for (const r of rows) {
      map[r.code_art] = r.sheet_name;
    }
    return map;
  }

  saveMapping(mapping: MappingChutes) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM mapping_chutes');
      const stmt = this.db.prepare('INSERT INTO mapping_chutes (code_art, sheet_name) VALUES (?, ?)');
      for (const [code, sheet] of Object.entries(mapping || {})) {
        if (code && sheet && String(sheet).trim()) {
          stmt.run(code.trim(), String(sheet).trim());
        }
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==========================================
  // DOSSIERS
  // ==========================================
  getDossiers(): DossierCommandeGlobal[] {
    const rows = this.db.prepare('SELECT json_data FROM dossiers ORDER BY updated_at DESC').all() as any[];
    const list: DossierCommandeGlobal[] = rows.map(r => {
      try {
        return JSON.parse(r.json_data);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Auto-réconciliation : si un dossier est encore 'EN_ATTENTE' ou 'BROUILLON' alors qu'un OF émis existe pour lui, le passer à 'EN_COURS'
    try {
      const ofs = this.getSuivisOF();
      const emittedOfs = ofs.filter(o => o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE');
      if (emittedOfs.length > 0) {
        for (const dossier of list) {
          if (dossier.statut === 'EN_ATTENTE' || dossier.statut === 'BROUILLON' || !dossier.statut) {
            const dossierRef = (dossier.refCommande || '').trim().toLowerCase();
            const subRefs = [
              dossier.numCommandeCaisson,
              dossier.numCommandeSousFace,
              dossier.numCommandeTablier,
              dossier.numCommandeMoustiquaire,
              dossier.numCommandePrecadre
            ].filter(Boolean).map(sr => sr!.trim().toLowerCase());

            const hasEmittedOf = emittedOfs.some(o => {
              const cmdRefs = (o.numCommande || '').split(/[\s,+/]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
              const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
              const matchesSub = subRefs.some(sr => cmdRefs.some(ref => sr.includes(ref) || ref.includes(sr)));
              const matchesClient = o.nomClient && dossier.nomClientFinal &&
                dossier.nomClientFinal.trim().toLowerCase() === o.nomClient.trim().toLowerCase();
              return matchesCmd || matchesSub || matchesClient;
            });

            if (hasEmittedOf) {
              dossier.statut = 'EN_COURS';
              this.upsertDossier(dossier);
            }
          }
        }
      }
    } catch {
      // Tolérance aux erreurs non-bloquantes
    }

    return list;
  }

  saveDossiers(dossiers: DossierCommandeGlobal[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM dossiers');
      const stmt = this.db.prepare(`
        INSERT INTO dossiers (
          id, donneur_ordre, nom_client_final, date_commande,
          ref_commande, statut, json_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const d of dossiers) {
        stmt.run(
          d.id, d.donneurOrdre, d.nomClientFinal, d.dateCommande,
          d.refCommande, d.statut, JSON.stringify(d)
        );
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  upsertDossier(d: DossierCommandeGlobal) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO dossiers (
        id, donneur_ordre, nom_client_final, date_commande,
        ref_commande, statut, json_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      d.id, d.donneurOrdre, d.nomClientFinal, d.dateCommande,
      d.refCommande, d.statut, JSON.stringify(d)
    );
  }

  deleteDossier(id: string) {
    this.db.prepare('DELETE FROM dossiers WHERE id = ?').run(id);
  }

  // ==========================================
  // SUIVIS OF
  // ==========================================

  /**
   * Réparation automatique et intelligente des familles de produits pour les Ordres de Fabrication.
   * Corrige les OF qui ont été enregistrés par défaut avec la famille 'CAISSON' alors qu'ils
   * concernent des Tabliers/Volets, Moustiquaires ou Précadres.
   */
  reparerFamillesOF(): { repares: number } {
    let repares = 0;
    try {
      const dossiers = this.getDossiers();
      const rows = this.db.prepare('SELECT id, num_commande, nom_client, famille, titre_section, json_data FROM suivis_of').all() as any[];
      if (!rows || rows.length === 0) return { repares: 0 };

      const updateStmt = this.db.prepare(`
        UPDATE suivis_of
        SET famille = ?, json_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      for (const r of rows) {
        let ofObj: SuiviOF;
        try {
          ofObj = JSON.parse(r.json_data);
        } catch {
          continue;
        }

        const familleActuelle: FamilleProduit = ofObj.famille || r.famille;
        let vraieFamille: FamilleProduit | null = null;

        const numCmdClean = (ofObj.numCommande || r.num_commande || '').trim().toLowerCase();
        const clientClean = (ofObj.nomClient || r.nom_client || '').trim().toLowerCase();

        // 0. Vérification immédiate sur le numéro de commande et le titre de section
        const cmdUpper = (ofObj.numCommande || r.num_commande || '').toUpperCase();
        const titreUpper = (ofObj.titreSection || r.titre_section || '').toUpperCase();

        if (cmdUpper.includes('PRC') || cmdUpper.includes('PRECADRE') || cmdUpper.includes('PRÉCADRE') || cmdUpper.startsWith('1R') || titreUpper.includes('PRÉCADRE') || titreUpper.includes('PRECADRE') || titreUpper.includes('PRC')) {
          vraieFamille = 'PRECADRE';
        } else if (cmdUpper.includes('MSTQ') || cmdUpper.includes('MOUSTIQUAIRE') || titreUpper.includes('MOUSTIQUAIRE') || titreUpper.includes('MSTQ') || titreUpper.includes('MAILLE')) {
          vraieFamille = 'MOUSTIQUAIRE';
        } else if (cmdUpper.includes('TABLIER') || cmdUpper.includes('VOLET') || titreUpper.includes('TABLIER') || titreUpper.includes('VOLET') || titreUpper.includes('LAME')) {
          vraieFamille = 'TABLIER';
        }

        // 1. Croisement prioritaire avec le dossier de commande correspondant
        if (!vraieFamille) {
          const dossierAssocie = dossiers.find(d => {
            const dRef = (d.refCommande || '').trim().toLowerCase();
            const dNumTab = (d.numCommandeTablier || '').trim().toLowerCase();
            const dNumMstq = (d.numCommandeMoustiquaire || '').trim().toLowerCase();
            const dNumCais = (d.numCommandeCaisson || '').trim().toLowerCase();
            const dNumPrc = (d.numCommandePrecadre || '').trim().toLowerCase();
            const dClient = (d.nomClientFinal || '').trim().toLowerCase();

            const matchesRef = numCmdClean && (
              dRef === numCmdClean ||
              dNumTab === numCmdClean ||
              dNumMstq === numCmdClean ||
              dNumCais === numCmdClean ||
              dNumPrc === numCmdClean ||
              (dRef.length > 2 && numCmdClean.includes(dRef)) ||
              (numCmdClean.length > 2 && dRef.includes(numCmdClean))
            );

            const matchesClient = clientClean && dClient && (
              dClient === clientClean ||
              dClient.includes(clientClean) ||
              clientClean.includes(dClient)
            );

            return matchesRef || matchesClient;
          });

          if (dossierAssocie) {
            const dNumTab = (dossierAssocie.numCommandeTablier || '').trim().toLowerCase();
            const dNumMstq = (dossierAssocie.numCommandeMoustiquaire || '').trim().toLowerCase();
            const dNumPrc = (dossierAssocie.numCommandePrecadre || '').trim().toLowerCase();
            const dNumCais = (dossierAssocie.numCommandeCaisson || '').trim().toLowerCase();

            if (numCmdClean && dNumPrc && (numCmdClean === dNumPrc || numCmdClean.includes(dNumPrc) || dNumPrc.includes(numCmdClean))) {
              vraieFamille = 'PRECADRE';
            } else if (numCmdClean && dNumMstq && (numCmdClean === dNumMstq || numCmdClean.includes(dNumMstq) || dNumMstq.includes(numCmdClean))) {
              vraieFamille = 'MOUSTIQUAIRE';
            } else if (numCmdClean && dNumTab && (numCmdClean === dNumTab || numCmdClean.includes(dNumTab) || dNumTab.includes(numCmdClean))) {
              vraieFamille = 'TABLIER';
            } else if (numCmdClean && dNumCais && (numCmdClean === dNumCais || numCmdClean.includes(dNumCais) || dNumCais.includes(numCmdClean))) {
              vraieFamille = 'CAISSON';
            } else {
              const hasTab = (dossierAssocie.articlesTabliers || []).length > 0;
              const hasMstq = (dossierAssocie.articlesMoustiquaires || []).length > 0;
              const hasPrc = (dossierAssocie.articlesPrecadres || []).length > 0;
              const hasCais = (dossierAssocie.articlesCaissons || []).length > 0;

              if (hasTab && !hasCais && !hasMstq && !hasPrc) {
                vraieFamille = 'TABLIER';
              } else if (hasMstq && !hasCais && !hasTab && !hasPrc) {
                vraieFamille = 'MOUSTIQUAIRE';
              } else if (hasPrc && !hasCais && !hasTab && !hasMstq) {
                vraieFamille = 'PRECADRE';
              } else if (hasCais && !hasTab && !hasMstq && !hasPrc) {
                vraieFamille = 'CAISSON';
              }
            }
          }
        }

        // 2. Si pas déduit par le dossier, inspecter les lignes de coupe débit (lignesRetour)
        if (!vraieFamille) {
          const lignes = ofObj.lignesRetour || [];
          const hasPRC = lignes.some((l: any) => {
            const code = (l.articleCode || '').toUpperCase();
            const des = (l.piecesInfoStr || l.designation || '').toUpperCase();
            const label = (l.repere || l.labelPiece || '').toUpperCase();
            return (
              code.includes('ART007') ||
              des.includes('PRC') ||
              des.includes('PRÉCADRE') ||
              des.includes('PRECADRE') ||
              label.includes('PRC') ||
              label.includes('PRECADRE') ||
              label.startsWith('1R')
            );
          });

          const hasTBL = lignes.some((l: any) => {
            const code = (l.articleCode || '').toUpperCase();
            const des = (l.piecesInfoStr || l.designation || '').toUpperCase();
            const label = (l.repere || l.labelPiece || '').toUpperCase();
            return (
              code.includes('ART004') ||
              des.includes('TBL') ||
              des.includes('LAME') ||
              des.includes('TABLIER') ||
              des.includes('VOLET') ||
              des.includes('COULISSE') ||
              label.startsWith('SA-') ||
              label.startsWith('LF-') ||
              label.startsWith('TAB-') ||
              label.includes('LAME')
            );
          });

          const hasMSTQ = lignes.some((l: any) => {
            const code = (l.articleCode || '').toUpperCase();
            const des = (l.piecesInfoStr || l.designation || '').toUpperCase();
            const label = (l.repere || l.labelPiece || '').toUpperCase();
            return (
              code.includes('ART005') ||
              des.includes('MSTQ') ||
              des.includes('MAILLE') ||
              des.includes('MOUSTIQUAIRE') ||
              des.includes('CADRE MSTQ') ||
              des.includes('PLISSÉE') ||
              label.startsWith('MSTQ') ||
              label.startsWith('BI-')
            );
          }) || (ofObj.chutesMailleReservees && ofObj.chutesMailleReservees.length > 0);

          const hasCAIS = lignes.some((l: any) => {
            const des = (l.piecesInfoStr || l.designation || '').toUpperCase();
            const label = (l.repere || l.labelPiece || '').toUpperCase();
            return (
              des.includes('CT SOMO') ||
              des.includes('CAISSON') ||
              des.includes('SOUS-FACE') ||
              des.includes('SF ') ||
              label.startsWith('CT-') ||
              label.startsWith('SF-')
            );
          });

          if (hasPRC && !hasTBL && !hasMSTQ && !hasCAIS) vraieFamille = 'PRECADRE';
          else if (hasTBL && !hasMSTQ && !hasPRC && !hasCAIS) vraieFamille = 'TABLIER';
          else if (hasMSTQ && !hasTBL && !hasPRC && !hasCAIS) vraieFamille = 'MOUSTIQUAIRE';
          else if (hasCAIS && !hasTBL && !hasMSTQ && !hasPRC) vraieFamille = 'CAISSON';
        }

        // 3. Si toujours pas résolu, inspecter les titres et les préfixes de codification
        if (!vraieFamille) {
          if (cmdUpper.startsWith('SA-') || titreUpper.includes('TABLIER') || titreUpper.includes('VOLET') || titreUpper.includes('LAME')) {
            vraieFamille = 'TABLIER';
          } else if (cmdUpper.startsWith('SC-') || cmdUpper.startsWith('D-') || titreUpper.includes('MOUSTIQUAIRE') || titreUpper.includes('MSTQ')) {
            vraieFamille = 'MOUSTIQUAIRE';
          } else if (cmdUpper.startsWith('1R') || titreUpper.includes('PRÉCADRE') || titreUpper.includes('PRECADRE') || titreUpper.includes('PRC')) {
            vraieFamille = 'PRECADRE';
          } else if (cmdUpper.startsWith('CT-') || cmdUpper.startsWith('A-') || titreUpper.includes('CAISSON') || titreUpper.includes('SOUS-FACE')) {
            vraieFamille = 'CAISSON';
          }
        }

        // 4. Si une vraie famille différente de 'CAISSON' (ou différente de la famille stockée) est détectée
        if (vraieFamille && vraieFamille !== familleActuelle) {
          ofObj.famille = vraieFamille;
          updateStmt.run(vraieFamille, JSON.stringify(ofObj), r.id);
          repares++;
        }
      }

      if (repares > 0) {
        console.log(`[AtelierDB] ${repares} ordre(s) de fabrication réparé(s) automatiquement vers leur véritable famille de produit.`);
      }
    } catch (err) {
      console.warn('[AtelierDB] Warning lors de la réparation des familles OF:', err);
    }
    return { repares };
  }

  getSuivisOF(): SuiviOF[] {
    const rows = this.db.prepare('SELECT json_data FROM suivis_of ORDER BY updated_at DESC').all() as any[];
    return rows.map(r => {
      try {
        return JSON.parse(r.json_data);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  saveSuivisOF(suivis: SuiviOF[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM suivis_of');
      this.db.exec('DELETE FROM reservations_chutes');
      this.db.exec('DELETE FROM reservations_barres');
      this.db.exec('DELETE FROM reservations_maille');

      const stmt = this.db.prepare(`
        INSERT INTO suivis_of (
          id, num_commande, nom_client, donneur_ordre,
          famille, titre_section, statut, date_emission, date_retour, json_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of suivis) {
        stmt.run(
          s.id, s.numCommande, s.nomClient, s.donneurOrdre,
          s.famille, s.titreSection, s.statut, s.dateEmission,
          s.dateRetour || null, JSON.stringify(s)
        );
        if (s.statut === 'EMIS' || s.statut === 'RETOUR_EN_ATTENTE' || s.statut === 'EN_COURS') {
          this.saveReservationsForOF(s);
        }
      }
      this.syncArticlesQuantiteReservee();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  private internalUpsertSuiviOF(s: SuiviOF) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO suivis_of (
        id, num_commande, nom_client, donneur_ordre,
        famille, titre_section, statut, date_emission, date_retour, json_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      s.id, s.numCommande, s.nomClient, s.donneurOrdre,
      s.famille, s.titreSection, s.statut, s.dateEmission,
      s.dateRetour || null, JSON.stringify(s)
    );

    // Gestion stricte des réservations de chutes et de barres dès émission
    this.db.prepare('DELETE FROM reservations_chutes WHERE of_id = ?').run(s.id);
    this.db.prepare('DELETE FROM reservations_barres WHERE of_id = ?').run(s.id);
    this.db.prepare('DELETE FROM reservations_maille WHERE of_id = ?').run(s.id);

    if (s.statut === 'EMIS' || s.statut === 'RETOUR_EN_ATTENTE' || s.statut === 'EN_COURS') {
      this.saveReservationsForOF(s);
    }
    this.syncArticlesQuantiteReservee();

    // Synchronisation automatique avec les Dossiers de Commande (Statut passe à 'EN_COURS' dès l'émission de l'OF)
    if (s.statut === 'EMIS' || s.statut === 'RETOUR_EN_ATTENTE') {
      const cmdRefs = (s.numCommande || '')
        .split(/[\s,+/]+/)
        .map(c => c.trim().toLowerCase())
        .filter(Boolean);

      const allDossiers = this.getDossiers();
      for (const dossier of allDossiers) {
        const dossierRef = (dossier.refCommande || '').trim().toLowerCase();
        const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
        const subRefs = [
          dossier.numCommandeCaisson,
          dossier.numCommandeSousFace,
          dossier.numCommandeTablier,
          dossier.numCommandeMoustiquaire,
          dossier.numCommandePrecadre
        ].filter(Boolean).map(sr => sr!.trim().toLowerCase());
        const matchesSub = subRefs.some(sr => cmdRefs.some(ref => sr.includes(ref) || ref.includes(sr)));
        const matchesClient = s.nomClient && dossier.nomClientFinal &&
          dossier.nomClientFinal.trim().toLowerCase() === s.nomClient.trim().toLowerCase();

        if (matchesCmd || matchesSub || (matchesClient && (dossier.statut === 'EN_ATTENTE' || dossier.statut === 'BROUILLON' || !dossier.statut))) {
          if (dossier.statut !== 'EN_COURS' && dossier.statut !== 'CLOTURE' && dossier.statut !== 'FABRIQUE' && dossier.statut !== 'LIVRE') {
            dossier.statut = 'EN_COURS';
            this.upsertDossier(dossier);
          }
        }
      }
    }
  }

  upsertSuiviOF(s: SuiviOF) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.internalUpsertSuiviOF(s);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  private saveReservationsForOF(s: SuiviOF) {
    const insertChuteRes = this.db.prepare(`
      INSERT INTO reservations_chutes (id, of_id, num_commande, chute_id, sheet_name, longueur, quantite)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBarreRes = this.db.prepare(`
      INSERT INTO reservations_barres (id, of_id, num_commande, code_art, quantite, longueur)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMailleRes = this.db.prepare(`
      INSERT INTO reservations_maille (id, of_id, num_commande, chute_id, dimension_fixe, plis)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let resCounter = 1;
    const makeResId = (prefix: string) => `res-${prefix}-${s.id}-${resCounter++}`;

    // 1. Chutes Barres (Point 3.7 : traçabilité absolue avec chuteId)
    if (Array.isArray(s.chutesReservees) && s.chutesReservees.length > 0) {
      for (const cr of s.chutesReservees) {
        if (!cr.sheetName || !cr.longueur || !cr.quantite) continue;
        insertChuteRes.run(
          makeResId('c'),
          s.id,
          s.numCommande,
          cr.chuteId || null,
          cr.sheetName.trim(),
          Math.round(Number(cr.longueur)),
          Math.max(1, Math.round(Number(cr.quantite)))
        );
      }
    } else if (Array.isArray(s.lignesRetour)) {
      const mapLignesChutes = new Map<string, { sheetName: string; longueur: number; quantite: number; chuteId?: string }>();
      for (const lr of s.lignesRetour) {
        if (lr.typeSupport === 'CHUTE_BARRE' && lr.longueurPrevue) {
          let sheetName = '';
          if (lr.articleCode) {
            const mapped = this.db.prepare('SELECT sheet_name FROM mapping_chutes WHERE code_art = ?').get(lr.articleCode) as { sheet_name?: string } | undefined;
            if (mapped?.sheet_name) {
              sheetName = mapped.sheet_name;
            } else {
              const art = this.db.prepare('SELECT designation FROM articles WHERE code_art = ?').get(lr.articleCode) as { designation?: string } | undefined;
              sheetName = art?.designation || '';
            }
          }
          if (!sheetName && s.titreSection) {
            sheetName = s.titreSection.replace(/\s*\([^)]*\)/g, '').trim();
          }
          const lg = Math.round(Number(lr.longueurPrevue));
          if (sheetName && lg > 0) {
            const key = lr.chuteId ? `CID__${lr.chuteId}` : `${sheetName}__${lg}`;
            if (!mapLignesChutes.has(key)) {
              mapLignesChutes.set(key, { sheetName, longueur: lg, quantite: 0, chuteId: lr.chuteId });
            }
            mapLignesChutes.get(key)!.quantite += 1;
          }
        }
      }
      for (const item of mapLignesChutes.values()) {
        insertChuteRes.run(
          makeResId('c'),
          s.id,
          s.numCommande,
          item.chuteId || null,
          item.sheetName,
          item.longueur,
          item.quantite
        );
      }
    }

    // 2. Barres Neuves
    if (Array.isArray(s.barresReservees) && s.barresReservees.length > 0) {
      for (const br of s.barresReservees) {
        if (!br.codeArt || !br.quantite) continue;
        insertBarreRes.run(
          makeResId('b'),
          s.id,
          s.numCommande,
          br.codeArt,
          Math.max(1, Math.round(Number(br.quantite))),
          Number(br.longueur) || 6000
        );
      }
    } else if (Array.isArray(s.lignesRetour)) {
      const mapLignesBarres = new Map<string, { codeArt: string; quantite: number; longueur: number }>();
      for (const lr of s.lignesRetour) {
        if (lr.typeSupport === 'BARRE_NEUVE' && lr.articleCode && !lr.repere?.startsWith('ACCESSOIRE') && lr.longueurPrevue > 0) {
          const code = lr.articleCode;
          if (!mapLignesBarres.has(code)) {
            mapLignesBarres.set(code, { codeArt: code, quantite: 0, longueur: Number(lr.longueurPrevue) || 6000 });
          }
          mapLignesBarres.get(code)!.quantite += 1;
        }
      }
      for (const item of mapLignesBarres.values()) {
        insertBarreRes.run(
          makeResId('b'),
          s.id,
          s.numCommande,
          item.codeArt,
          item.quantite,
          item.longueur
        );
      }
    }

    // 3. Chutes Maille
    if (Array.isArray(s.chutesMailleReservees) && s.chutesMailleReservees.length > 0) {
      for (const mr of s.chutesMailleReservees) {
        insertMailleRes.run(
          makeResId('m'),
          s.id,
          s.numCommande,
          mr.id || null,
          Number(mr.dimension_fixe) || 0,
          Math.max(1, Math.round(Number(mr.plis) || 1))
        );
      }
    }
  }

  private syncArticlesQuantiteReservee() {
    try {
      this.db.prepare(`
        UPDATE articles SET quantite_reservee = COALESCE(
          (SELECT SUM(rb.quantite)
           FROM reservations_barres rb
           JOIN suivis_of s ON rb.of_id = s.id
           WHERE rb.code_art = articles.code_art
             AND s.statut IN ('EMIS', 'RETOUR_EN_ATTENTE', 'EN_COURS')),
          0
        )
      `).run();
    } catch (err) {
      console.warn('Erreur syncArticlesQuantiteReservee:', err);
    }
  }

  private rebuildReservationsIfEmpty() {
    try {
      const countRes = this.db.prepare('SELECT count(*) as count FROM reservations_chutes').get() as { count?: number } | undefined;
      if (!countRes || countRes.count === 0) {
        const activeOFs = this.db.prepare(`
          SELECT json_data FROM suivis_of
          WHERE statut IN ('EMIS', 'RETOUR_EN_ATTENTE', 'EN_COURS')
        `).all() as { json_data?: string }[];

        for (const row of activeOFs) {
          if (row.json_data) {
            try {
              const ofObj: SuiviOF = JSON.parse(row.json_data);
              this.saveReservationsForOF(ofObj);
            } catch (err) {
              console.warn('Erreur reconstruction réservation OF:', err);
            }
          }
        }
        this.syncArticlesQuantiteReservee();
      }
    } catch (e) {
      console.warn('Erreur rebuildReservationsIfEmpty:', e);
    }
  }

  /**
   * Restaure intégralement et physiquement le stock pour un OF clôturé ou annulé (Point 3.3 de l'audit)
   */
  private rollbackStockForClosedOF(ofId: string) {
    const mvts = this.db.prepare('SELECT * FROM mouvements_stock WHERE of_id = ?').all() as any[];

    for (const m of mvts) {
      // 1. Restituer les barres neuves et accessoires consommés
      if ((m.type === 'SORTIE_BARRE_NEUVE' || m.type === 'SORTIE_ACCESSOIRE' || m.type === 'SORTIE_ARTICLE') && m.article_code) {
        const qte = m.quantite || 1;
        this.db.prepare(
          'UPDATE articles SET stock_physique = stock_physique + ? WHERE code_art = ?'
        ).run(qte, m.article_code);
      }

      // 2. Traiter les chutes
      if ((m.type === 'SORTIE_CHUTE' || m.type === 'ENTREE_CHUTE') && m.article_code && m.longueur_mm) {
        let sheetName = '';
        const mappedSheet = this.db.prepare('SELECT sheet_name FROM mapping_chutes WHERE code_art = ?').get(m.article_code) as any;
        if (mappedSheet?.sheet_name) {
          sheetName = mappedSheet.sheet_name;
        } else {
          const artRow = this.db.prepare('SELECT designation FROM articles WHERE code_art = ?').get(m.article_code) as any;
          sheetName = artRow?.designation ? artRow.designation.trim() : '';
        }

        if (sheetName) {
          const quantite = m.quantite || 1;
          const isMaille = sheetName.toUpperCase() === 'MAILLE MSTQ' || sheetName.toUpperCase().includes('MAILLE') || (m.designation && m.designation.toUpperCase().includes('MAILLE'));

          if (isMaille) {
            if (m.type === 'SORTIE_CHUTE') {
              const plis = Math.max(1, Math.round(m.longueur_mm / 20));
              this.db.prepare(
                'INSERT INTO chutes_maille (id, dimension_fixe, plis) VALUES (?, ?, ?)'
              ).run(m.chute_id || `cht-m-rst-${Date.now()}-${Math.floor(Math.random() * 1000)}`, m.longueur_mm, plis);
            } else if (m.type === 'ENTREE_CHUTE') {
              const matchedMaille = this.db.prepare(
                'SELECT id FROM chutes_maille ORDER BY ABS(dimension_fixe - ?) ASC LIMIT 1'
              ).get(m.longueur_mm) as any;
              if (matchedMaille?.id) {
                this.db.prepare('DELETE FROM chutes_maille WHERE id = ?').run(matchedMaille.id);
              }
            }
          } else {
            // Profilés barres alu
            if (m.type === 'SORTIE_CHUTE') {
              let reinserted = false;
              if (m.chute_id) {
                const existingById = this.db.prepare('SELECT id, quantite FROM chutes_barres WHERE id = ?').get(m.chute_id) as any;
                if (existingById?.id) {
                  this.db.prepare('UPDATE chutes_barres SET quantite = quantite + ? WHERE id = ?').run(quantite, existingById.id);
                  reinserted = true;
                }
              }
              if (!reinserted) {
                const existingSameLg = this.db.prepare(
                  'SELECT id, quantite FROM chutes_barres WHERE sheet_name = ? AND ABS(longueur - ?) <= 1.0 LIMIT 1'
                ).get(sheetName, m.longueur_mm) as any;
                if (existingSameLg?.id) {
                  this.db.prepare('UPDATE chutes_barres SET quantite = quantite + ? WHERE id = ?').run(quantite, existingSameLg.id);
                } else {
                  this.db.prepare(
                    'INSERT INTO chutes_barres (id, sheet_name, longueur, quantite) VALUES (?, ?, ?, ?)'
                  ).run(m.chute_id || `cht-rst-${Date.now()}-${Math.floor(Math.random() * 1000)}`, sheetName, m.longueur_mm, quantite);
                }
              }
            } else if (m.type === 'ENTREE_CHUTE') {
              const matched = this.db.prepare(
                'SELECT rowid, id, quantite FROM chutes_barres WHERE sheet_name = ? AND ABS(longueur - ?) <= 2.0 AND quantite > 0 ORDER BY ABS(longueur - ?) ASC LIMIT 1'
              ).get(sheetName, m.longueur_mm, m.longueur_mm) as any;

              if (matched?.rowid) {
                if (matched.quantite <= quantite) {
                  this.db.prepare('DELETE FROM chutes_barres WHERE rowid = ?').run(matched.rowid);
                } else {
                  this.db.prepare('UPDATE chutes_barres SET quantite = quantite - ? WHERE rowid = ?').run(quantite, matched.rowid);
                }
              }
            }
          }
        }
      }
    }

    // Supprimer tous les mouvements de stock enregistrés pour cet OF
    this.db.prepare('DELETE FROM mouvements_stock WHERE of_id = ?').run(ofId);
  }

  closeOF(s: SuiviOF, mvts: MouvementStock[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const existing = this.db.prepare('SELECT statut FROM suivis_of WHERE id = ?').get(s.id) as { statut?: string } | undefined;
      if (existing?.statut === 'CLOTURE') {
        throw new Error(`L'OF ${s.numCommande} est déjà clôturé`);
      }

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO mouvements_stock (
          id, date, type, of_id, num_commande, nom_client,
          article_code, designation, longueur_mm, quantite, remarque, chute_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of mvts) {
        stmt.run(
          m.id, m.date, m.type, m.ofId || null, m.numCommande || null,
          m.nomClient || null, m.articleCode || null, m.designation || null,
          m.longueurMm || null, m.quantite || null, m.remarque || null,
          m.chuteId || null
        );

        // 1. Décompte des barres neuves et accessoires (Joues, bouchons, articles magasin)
        if ((m.type === 'SORTIE_BARRE_NEUVE' || m.type === 'SORTIE_ACCESSOIRE' || m.type === 'SORTIE_ARTICLE') && m.articleCode) {
          const quantite = m.quantite || 1;
          this.db.prepare(
            'UPDATE articles SET stock_physique = stock_physique - ? WHERE code_art = ?'
          ).run(quantite, m.articleCode);
        }

        // 2. Traitement des chutes (Profilés alu ou Toiles moustiquaires)
        if ((m.type === 'SORTIE_CHUTE' || m.type === 'ENTREE_CHUTE') && m.articleCode && m.longueurMm) {
          let sheetName: string | undefined;
          const mappedSheet = this.db.prepare('SELECT sheet_name FROM mapping_chutes WHERE code_art = ?').get(m.articleCode) as { sheet_name?: string } | undefined;
          if (mappedSheet?.sheet_name) {
            sheetName = mappedSheet.sheet_name;
          } else {
            const artRow = this.db.prepare('SELECT designation FROM articles WHERE code_art = ?').get(m.articleCode) as { designation?: string } | undefined;
            if (artRow?.designation) {
              sheetName = artRow.designation.trim();
              this.db.prepare('INSERT OR IGNORE INTO chute_families (name) VALUES (?)').run(sheetName);
              this.db.prepare('INSERT OR REPLACE INTO mapping_chutes (code_art, sheet_name) VALUES (?, ?)').run(m.articleCode, sheetName);
            }
          }

          if (sheetName) {
            const quantite = m.quantite || 1;
            const isMaille = sheetName.toUpperCase() === 'MAILLE MSTQ' || sheetName.toUpperCase().includes('MAILLE') || (m.designation && m.designation.toUpperCase().includes('MAILLE'));

            if (isMaille) {
              if (m.type === 'SORTIE_CHUTE') {
                const matchedMaille = this.db.prepare(
                  'SELECT id, dimension_fixe, plis FROM chutes_maille ORDER BY ABS(dimension_fixe - ?) ASC LIMIT 1'
                ).get(m.longueurMm) as { id?: string; dimension_fixe?: number; plis?: number } | undefined;
                if (matchedMaille?.id) {
                  this.db.prepare('DELETE FROM chutes_maille WHERE id = ?').run(matchedMaille.id);
                }
              } else if (m.type === 'ENTREE_CHUTE' && m.longueurMm > 0) {
                const plis = Math.max(1, Math.round(m.longueurMm / 20));
                this.db.prepare(
                  'INSERT INTO chutes_maille (id, dimension_fixe, plis) VALUES (?, ?, ?)'
                ).run(`cht-m-${Date.now()}-${Math.floor(Math.random() * 1000)}`, m.longueurMm, plis);
              }
            } else {
              // Profilés Barres Aluminium
              if (m.type === 'SORTIE_CHUTE') {
                let matched: { rowid?: number; id?: string; quantite?: number; longueur?: number } | undefined;

                // Point 3.7 : Recherche prioritaire par identifiant unique de chute
                if (m.chuteId) {
                  matched = this.db.prepare(
                    'SELECT rowid, id, quantite, longueur FROM chutes_barres WHERE id = ? AND quantite > 0'
                  ).get(m.chuteId) as { rowid?: number; id?: string; quantite?: number; longueur?: number } | undefined;
                }

                if (!matched) {
                  // Tolérance stricte +/- 10mm
                  matched = this.db.prepare(
                    'SELECT rowid, id, quantite, longueur FROM chutes_barres WHERE sheet_name = ? AND ABS(longueur - ?) <= 10.0 AND quantite > 0 ORDER BY ABS(longueur - ?) ASC LIMIT 1'
                  ).get(sheetName, m.longueurMm, m.longueurMm) as { rowid?: number; id?: string; quantite?: number; longueur?: number } | undefined;
                }

                if (!matched) {
                  // Chute de longueur supérieure
                  matched = this.db.prepare(
                    'SELECT rowid, quantite, longueur FROM chutes_barres WHERE sheet_name = ? AND longueur >= ? - 10.0 AND quantite > 0 ORDER BY longueur ASC LIMIT 1'
                  ).get(sheetName, m.longueurMm) as { rowid?: number; quantite?: number; longueur?: number } | undefined;
                }

                if (matched?.rowid) {
                  this.db.prepare(
                    'UPDATE chutes_barres SET quantite = quantite - ? WHERE rowid = ?'
                  ).run(quantite, matched.rowid);
                  this.db.prepare('DELETE FROM chutes_barres WHERE quantite <= 0').run();
                } else {
                  console.warn(`[Stock] Sortie chute ${m.longueurMm}mm pour ${sheetName} non trouvée en inventaire physique.`);
                }
              } else if (m.type === 'ENTREE_CHUTE' && m.longueurMm > 0) {
                const existingSameLg = this.db.prepare(
                  'SELECT id, quantite FROM chutes_barres WHERE sheet_name = ? AND ABS(longueur - ?) <= 1.0 LIMIT 1'
                ).get(sheetName, m.longueurMm) as { id?: string; quantite?: number } | undefined;

                if (existingSameLg?.id) {
                  this.db.prepare('UPDATE chutes_barres SET quantite = quantite + ? WHERE id = ?').run(quantite, existingSameLg.id);
                } else {
                  this.db.prepare(
                    'INSERT INTO chutes_barres (id, sheet_name, longueur, quantite) VALUES (?, ?, ?, ?)'
                  ).run(`cht-${Date.now()}-${Math.floor(Math.random() * 1000)}`, sheetName, m.longueurMm, quantite);
                }
              }
            }
          }
        }
      }

      // Mise à jour de l'OF en statut CLOTURE
      this.internalUpsertSuiviOF(s);

      // Synchronisation intelligente avec les Dossiers de Commande
      const cmdRefs = (s.numCommande || '')
        .split(/[\s,+/]+/)
        .map(c => c.trim().toLowerCase())
        .filter(Boolean);

      const allDossiers = this.getDossiers();
      for (const dossier of allDossiers) {
        const dossierRef = (dossier.refCommande || '').trim().toLowerCase();
        const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
        const matchesClient = s.nomClient && dossier.nomClientFinal &&
          dossier.nomClientFinal.trim().toLowerCase() === s.nomClient.trim().toLowerCase();

        if (matchesCmd || (matchesClient && dossier.statut !== 'FABRIQUE')) {
          const relatedOFs = (this.getSuivisOF() || []).filter(o => {
            const oCmds = (o.numCommande || '').toLowerCase();
            return cmdRefs.some(ref => oCmds.includes(ref)) ||
              (o.nomClient && dossier.nomClientFinal && o.nomClient.toLowerCase() === dossier.nomClientFinal.toLowerCase());
          });

          const allClosed = relatedOFs.length > 0 && relatedOFs.every(o => o.id === s.id || o.statut === 'CLOTURE');
          const newStatut = allClosed ? 'FABRIQUE' : 'EN_COURS';

          if (dossier.statut !== newStatut) {
            dossier.statut = newStatut;
            this.upsertDossier(dossier);
          }
        }
      }

      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Rétablit le stock et repasse un OF clôturé en attente de retour (Point 3.3 de l'audit)
   */
  rollbackClotureOF(id: string) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const row = this.db.prepare('SELECT json_data, statut FROM suivis_of WHERE id = ?').get(id) as { json_data?: string; statut?: string } | undefined;
      if (!row) throw new Error(`OF ${id} introuvable`);
      const s: SuiviOF = JSON.parse(row.json_data || '{}');

      // Restaurer le stock physique décompté
      this.rollbackStockForClosedOF(id);

      // Repasser l'OF en statut RETOUR_EN_ATTENTE
      s.statut = 'RETOUR_EN_ATTENTE';
      delete s.dateRetour;
      delete s.dateLivraison;
      delete s.nomChauffeur;
      delete s.ficheTransfertId;

      this.internalUpsertSuiviOF(s);

      // Mettre à jour les dossiers de commande correspondants vers EN_COURS
      const cmdRefs = (s.numCommande || '')
        .split(/[\s,+/]+/)
        .map(c => c.trim().toLowerCase())
        .filter(Boolean);

      const allDossiers = this.getDossiers();
      for (const dossier of allDossiers) {
        const dossierRef = (dossier.refCommande || '').trim().toLowerCase();
        const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
        const matchesClient = s.nomClient && dossier.nomClientFinal &&
          dossier.nomClientFinal.trim().toLowerCase() === s.nomClient.trim().toLowerCase();

        if (matchesCmd || matchesClient) {
          if (dossier.statut === 'FABRIQUE' || dossier.statut === 'CLOTURE') {
            dossier.statut = 'EN_COURS';
            this.upsertDossier(dossier);
          }
        }
      }

      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Annule un OF émis ou en attente et libère ses réservations (Option annulation fiable)
   */
  annulerOF(id: string) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const row = this.db.prepare('SELECT json_data, statut FROM suivis_of WHERE id = ?').get(id) as { json_data?: string; statut?: string } | undefined;
      if (!row) throw new Error(`OF ${id} introuvable`);
      const s: SuiviOF = JSON.parse(row.json_data || '{}');

      // Si l'OF était clôturé ou livré, restaurer d'abord son stock
      if (s.statut === 'CLOTURE' || s.statut === 'LIVRE') {
        this.rollbackStockForClosedOF(id);
      }

      // Libérer toutes les réservations
      this.db.prepare('DELETE FROM reservations_chutes WHERE of_id = ?').run(id);
      this.db.prepare('DELETE FROM reservations_barres WHERE of_id = ?').run(id);
      this.db.prepare('DELETE FROM reservations_maille WHERE of_id = ?').run(id);

      s.statut = 'ANNULE';
      const updateStmt = this.db.prepare(`
        UPDATE suivis_of SET
          statut = 'ANNULE', json_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(JSON.stringify(s), id);

      // Mettre à jour les dossiers de commande correspondants vers EN_ATTENTE si aucun autre OF n'est actif
      try {
        const cmdRefs = (s.numCommande || '')
          .split(/[\s,+/]+/)
          .map(c => c.trim().toLowerCase())
          .filter(Boolean);

        const allDossiers = this.getDossiers();
        for (const dossier of allDossiers) {
          const dossierRef = (dossier.refCommande || '').trim().toLowerCase();
          const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
          const matchesClient = s.nomClient && dossier.nomClientFinal &&
            dossier.nomClientFinal.trim().toLowerCase() === s.nomClient.trim().toLowerCase();

          if (matchesCmd || matchesClient) {
            if (dossier.statut === 'EN_COURS') {
              dossier.statut = 'EN_ATTENTE';
              this.upsertDossier(dossier);
            }
          }
        }
      } catch (errD) {
        console.warn('Erreur mise à jour statut dossier après annulation OF:', errD);
      }

      this.syncArticlesQuantiteReservee();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Supprime un OF en restaurant automatiquement et fidèlement le stock s'il était clôturé (Point 3.3 de l'audit)
   */
  deleteSuiviOF(id: string) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const row = this.db.prepare('SELECT statut, num_commande, nom_client FROM suivis_of WHERE id = ?').get(id) as { statut?: string; num_commande?: string; nom_client?: string } | undefined;
      if (row?.statut === 'CLOTURE' || row?.statut === 'LIVRE') {
        // Restaurer automatiquement et rigoureusement le stock physique pour éviter les barres/chutes fantômes
        this.rollbackStockForClosedOF(id);
      }

      this.db.prepare('DELETE FROM reservations_chutes WHERE of_id = ?').run(id);
      this.db.prepare('DELETE FROM reservations_barres WHERE of_id = ?').run(id);
      this.db.prepare('DELETE FROM reservations_maille WHERE of_id = ?').run(id);
      this.db.prepare('DELETE FROM mouvements_stock WHERE of_id = ?').run(id);
      this.db.prepare('DELETE FROM suivis_of WHERE id = ?').run(id);

      // Si l'OF supprimé était associé à un dossier, vérifier si le dossier doit repasser à EN_ATTENTE
      if (row) {
        try {
          const cmdRefs = (row.num_commande || '')
            .split(/[\s,+/]+/)
            .map(c => c.trim().toLowerCase())
            .filter(Boolean);

          const allDossiers = this.getDossiers();
          const remainingOFs = this.getSuivisOF() || [];
          for (const dossier of allDossiers) {
            const dossierRef = (dossier.refCommande || '').trim().toLowerCase();
            const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
            const matchesClient = row.nom_client && dossier.nomClientFinal &&
              dossier.nomClientFinal.trim().toLowerCase() === row.nom_client.trim().toLowerCase();

            if (matchesCmd || matchesClient) {
              const hasActiveOF = remainingOFs.some(o => {
                if (o.id === id) return false;
                if (o.statut === 'ANNULE') return false;
                const oCmds = (o.numCommande || '').toLowerCase();
                return cmdRefs.some(ref => oCmds.includes(ref)) ||
                  (o.nomClient && dossier.nomClientFinal && o.nomClient.toLowerCase() === dossier.nomClientFinal.toLowerCase());
              });
              if (!hasActiveOF && (dossier.statut === 'EN_COURS' || dossier.statut === 'FABRIQUE')) {
                dossier.statut = 'EN_ATTENTE';
                this.upsertDossier(dossier);
              }
            }
          }
        } catch (errD) {
          console.warn('Erreur mise à jour statut dossier après suppression OF:', errD);
        }
      }

      this.syncArticlesQuantiteReservee();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==========================================
  // MOUVEMENTS DE STOCK
  // ==========================================
  getMouvements(): MouvementStock[] {
    const rows = this.db.prepare('SELECT * FROM mouvements_stock ORDER BY rowid DESC LIMIT 1000').all() as any[];
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      type: r.type,
      ofId: r.of_id || undefined,
      numCommande: r.num_commande || undefined,
      nomClient: r.nom_client || undefined,
      articleCode: r.article_code || undefined,
      designation: r.designation || undefined,
      longueurMm: r.longueur_mm ? Number(r.longueur_mm) : undefined,
      quantite: r.quantite ? Number(r.quantite) : undefined,
      remarque: r.remarque || undefined
    }));
  }

  addMouvement(m: MouvementStock) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO mouvements_stock (
        id, date, type, of_id, num_commande, nom_client,
        article_code, designation, longueur_mm, quantite, remarque
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      m.id, m.date, m.type, m.ofId || null, m.numCommande || null,
      m.nomClient || null, m.articleCode || null, m.designation || null,
      m.longueurMm || null, m.quantite || null, m.remarque || null
    );
  }

  addMouvements(mvts: MouvementStock[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO mouvements_stock (
          id, date, type, of_id, num_commande, nom_client,
          article_code, designation, longueur_mm, quantite, remarque
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of mvts) {
        stmt.run(
          m.id, m.date, m.type, m.ofId || null, m.numCommande || null,
          m.nomClient || null, m.articleCode || null, m.designation || null,
          m.longueurMm || null, m.quantite || null, m.remarque || null
        );
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==========================================
  // CODIFICATIONS CLIENTS
  // ==========================================
  getClientCodifications(): ClientCodification[] {
    const rows = this.db.prepare('SELECT * FROM client_codifications ORDER BY ordre ASC, nom ASC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      code: r.code,
      nom: r.nom,
      prefixeCommande: r.prefixe_commande,
      prefixeRepereSpecial: r.prefixe_repere_special || undefined,
      type: r.type,
      badgeColor: r.badge_color || undefined,
      badgeBg: r.badge_bg || undefined,
      description: r.description || undefined,
      actif: Boolean(r.actif),
      ordre: Number(r.ordre || 0),
      peintureParDefaut: Boolean(r.peinture_par_defaut),
      montageSousFaceParDefaut: r.montage_sous_face_par_defaut !== null && r.montage_sous_face_par_defaut !== undefined ? Boolean(r.montage_sous_face_par_defaut) : true,
      avecPlaqueParDefaut: Boolean(r.avec_plaque_par_defaut)
    }));
  }

  saveClientCodifications(codifs: ClientCodification[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM client_codifications');
      const stmt = this.db.prepare(`
        INSERT INTO client_codifications (
          id, code, nom, prefixe_commande, prefixe_repere_special,
          type, badge_color, badge_bg, description, actif, ordre,
          peinture_par_defaut, montage_sous_face_par_defaut, avec_plaque_par_defaut
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of codifs) {
        stmt.run(
          c.id, c.code, c.nom, c.prefixeCommande, c.prefixeRepereSpecial || null,
          c.type, c.badgeColor || null, c.badgeBg || null, c.description || null,
          c.actif ? 1 : 0, c.ordre || 0,
          c.peintureParDefaut ? 1 : 0,
          c.montageSousFaceParDefaut !== false ? 1 : 0,
          c.avecPlaqueParDefaut ? 1 : 0
        );
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  upsertClientCodification(c: ClientCodification) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO client_codifications (
        id, code, nom, prefixe_commande, prefixe_repere_special,
        type, badge_color, badge_bg, description, actif, ordre,
        peinture_par_defaut, montage_sous_face_par_defaut, avec_plaque_par_defaut
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      c.id, c.code, c.nom, c.prefixeCommande, c.prefixeRepereSpecial || null,
      c.type, c.badgeColor || null, c.badgeBg || null, c.description || null,
      c.actif ? 1 : 0, c.ordre || 0,
      c.peintureParDefaut ? 1 : 0,
      c.montageSousFaceParDefaut !== false ? 1 : 0,
      c.avecPlaqueParDefaut ? 1 : 0
    );
  }

  deleteClientCodification(id: string) {
    this.db.prepare('DELETE FROM client_codifications WHERE id = ?').run(id);
  }

  // ==========================================
  // FICHES DE TRANSFERT & BONS DE LIVRAISON
  // ==========================================
  getFichesTransfert(): FicheTransfert[] {
    const rows = this.db.prepare('SELECT json_data FROM fiches_transfert ORDER BY updated_at DESC').all() as any[];
    return rows.map(r => {
      try {
        return JSON.parse(r.json_data);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  saveFichesTransfert(fiches: FicheTransfert[]) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM fiches_transfert');
      const stmt = this.db.prepare(`
        INSERT INTO fiches_transfert (
          id, numero_fiche, mon_client, nom_chauffeur,
          date_livraison, statut, json_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const f of fiches) {
        stmt.run(
          f.id, f.numeroFiche, f.monClient, f.nomChauffeurPrincipal || null,
          f.dateLivraison, f.statut || 'VALIDEE', JSON.stringify(f)
        );
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  upsertFicheTransfert(fiche: FicheTransfert) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO fiches_transfert (
          id, numero_fiche, mon_client, nom_chauffeur,
          date_livraison, statut, json_data, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      stmt.run(
        fiche.id, fiche.numeroFiche, fiche.monClient, fiche.nomChauffeurPrincipal || null,
        fiche.dateLivraison, fiche.statut || 'VALIDEE', JSON.stringify(fiche)
      );

      // Mettre à jour les dossiers et OFs de commande associés pour les marquer comme 'LIVRE'
      if (Array.isArray(fiche.lignes)) {
        for (const ligne of fiche.lignes) {
          // 1. Dossier de commande
          if (ligne.dossierId) {
            const row = this.db.prepare('SELECT json_data FROM dossiers WHERE id = ?').get(ligne.dossierId) as { json_data?: string } | undefined;
            if (row?.json_data) {
              try {
                const dossier: DossierCommandeGlobal = JSON.parse(row.json_data);
                dossier.statut = 'LIVRE';
                dossier.ficheTransfertId = fiche.id;
                dossier.dateLivraison = fiche.dateLivraison;
                dossier.nomChauffeur = ligne.nomChauffeur || fiche.nomChauffeurPrincipal;
                this.upsertDossier(dossier);
              } catch (err) {
                console.error('Erreur mise à jour statut dossier lors création fiche transfert:', err);
              }
            }
          }

          // 2. Suivi OF direct ou par numéro de commande
          if (ligne.ofId) {
            const ofRow = this.db.prepare('SELECT json_data FROM suivis_of WHERE id = ?').get(ligne.ofId) as { json_data?: string } | undefined;
            if (ofRow?.json_data) {
              try {
                const of: SuiviOF = JSON.parse(ofRow.json_data);
                of.statut = 'LIVRE';
                of.ficheTransfertId = fiche.id;
                of.dateLivraison = fiche.dateLivraison;
                of.nomChauffeur = ligne.nomChauffeur || fiche.nomChauffeurPrincipal;
                this.upsertSuiviOF(of);
              } catch (err) {
                console.error('Erreur mise à jour statut OF lors création fiche transfert:', err);
              }
            }
          } else if (ligne.numCommande) {
            const cleanNum = ligne.numCommande.trim().toLowerCase();
            const allOfs = this.getSuivisOF();
            for (const of of allOfs) {
              const ofCmd = (of.numCommande || '').toLowerCase();
              if (ofCmd && (ofCmd.includes(cleanNum) || cleanNum.includes(ofCmd))) {
                of.statut = 'LIVRE';
                of.ficheTransfertId = fiche.id;
                of.dateLivraison = fiche.dateLivraison;
                of.nomChauffeur = ligne.nomChauffeur || fiche.nomChauffeurPrincipal;
                this.upsertSuiviOF(of);
              }
            }
          }
        }
      }

      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  deleteFicheTransfert(id: string) {
    this.db.prepare('DELETE FROM fiches_transfert WHERE id = ?').run(id);
  }

  // ==========================================
  // SYNC / MIGRATION TOTALE INITIALE
  // ==========================================
  fullSyncFromFrontend(data: {
    articles?: Article[];
    chutesBarres?: Record<string, ChuteItem[]>;
    chutesMaille?: ChuteMaille[];
    mapping?: MappingChutes;
    dossiers?: DossierCommandeGlobal[];
    suivisOF?: SuiviOF[];
    mouvements?: MouvementStock[];
    clientCodifications?: ClientCodification[];
    fichesTransfert?: FicheTransfert[];
  }) {
    if (data.articles !== undefined) this.saveArticles(data.articles);
    if (data.chutesBarres !== undefined) this.saveChutesBarres(data.chutesBarres, true);
    if (data.chutesMaille !== undefined) this.saveChutesMaille(data.chutesMaille);
    if (data.mapping !== undefined) this.saveMapping(data.mapping);
    if (data.dossiers !== undefined) this.saveDossiers(data.dossiers);
    if (data.suivisOF !== undefined) this.saveSuivisOF(data.suivisOF);
    if (data.clientCodifications !== undefined) this.saveClientCodifications(data.clientCodifications);
    if (data.fichesTransfert !== undefined) this.saveFichesTransfert(data.fichesTransfert);
    if (data.mouvements !== undefined) {
      this.db.exec('DELETE FROM mouvements_stock');
      if (data.mouvements.length > 0) this.addMouvements(data.mouvements);
    }
  }

  getAllData() {
    return {
      articles: this.getArticles(),
      chutesBarres: this.getChutesBarres(),
      chutesMaille: this.getChutesMaille(),
      mapping: this.getMapping(),
      dossiers: this.getDossiers(),
      suivisOF: this.getSuivisOF(),
      mouvements: this.getMouvements(),
      clientCodifications: this.getClientCodifications(),
      fichesTransfert: this.getFichesTransfert()
    };
  }

  wipeAllData() {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec('DELETE FROM articles');
      this.db.exec('DELETE FROM chutes_barres');
      this.db.exec('DELETE FROM chutes_maille');
      this.db.exec('DELETE FROM mapping_chutes');
      this.db.exec('DELETE FROM dossiers');
      this.db.exec('DELETE FROM suivis_of');
      this.db.exec('DELETE FROM mouvements_stock');
      this.db.exec('DELETE FROM client_codifications');
      this.db.exec('DELETE FROM fiches_transfert');
      this.db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('db_initialized', ?)").run(new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }


  getDbFilePath(): string {
    return DB_PATH;
  }
}

// Instance Singleton
export const atelierDb = new AtelierDatabase();
