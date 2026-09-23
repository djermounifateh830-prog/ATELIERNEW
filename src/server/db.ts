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
    // Initialisation sécurisée de la connexion SQLite avec auto-guérison intelligente
    try {
      this.db = new DatabaseSync(DB_PATH);
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA wal_autocheckpoint = 20;');
      const check = this.db.prepare('PRAGMA quick_check;').all() as any[];
      if (check.some((r: any) => r.quick_check && r.quick_check !== 'ok')) {
        throw new Error('SQLite quick_check failed');
      }
    } catch (err) {
      console.warn('⚠️ [SQLite] Anomalie intégrité fichier détectée, régénération automatique...', err);
      try {
        if (fs.existsSync(DB_PATH)) {
          fs.renameSync(DB_PATH, `${DB_PATH}.corrupted.${Date.now()}`);
        }
        if (fs.existsSync(`${DB_PATH}-wal`)) {
          try { fs.unlinkSync(`${DB_PATH}-wal`); } catch {}
        }
        if (fs.existsSync(`${DB_PATH}-shm`)) {
          try { fs.unlinkSync(`${DB_PATH}-shm`); } catch {}
        }
      } catch {}
      this.db = new DatabaseSync(DB_PATH);
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA wal_autocheckpoint = 20;');
    }
    this.initTables();
    this.cleanCorruptedDesignations();
    this.autoRecoverIfEmpty();
    this.seedIfEmpty();
    this.rebuildReservationsIfEmpty();
    this.reparerFamillesOF();
    this.synchroniserStatutsDossiersOF();
    this.checkpointWal();
  }

  /**
   * Restaure automatiquement les données depuis une sauvegarde valide si la base actuelle est vide
   */
  private autoRecoverIfEmpty() {
    try {
      const row = this.db.prepare('SELECT count(*) as c FROM dossiers').get() as any;
      if (row && row.c > 0) return; // Base déjà peuplée

      const dir = process.cwd();
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('3m_atelier.db.corrupted.') || f.startsWith('3m_atelier.db.backup.'))
        .sort().reverse();

      for (const f of files) {
        const fullPath = path.resolve(dir, f);
        try {
          const testDb = new DatabaseSync(fullPath);
          const check = testDb.prepare('PRAGMA quick_check;').all() as any[];
          if (check.some((r: any) => r.quick_check && r.quick_check !== 'ok')) continue;
          const countDossiers = (testDb.prepare('SELECT count(*) as c FROM dossiers').get() as any)?.c || 0;
          if (countDossiers > 0) {
            console.log(`[AtelierDB] Restauration automatique de ${countDossiers} dossiers depuis ${f}...`);
            const allD = testDb.prepare('SELECT * FROM dossiers').all() as any[];
            for (const d of allD) {
              this.db.prepare('INSERT OR REPLACE INTO dossiers (id, ref_commande, nom_client_final, statut, json_data) VALUES (?, ?, ?, ?, ?)').run(d.id, d.ref_commande, d.nom_client_final, d.statut, d.json_data);
            }
            const allOF = testDb.prepare('SELECT * FROM suivis_of').all() as any[];
            for (const o of allOF) {
              this.db.prepare('INSERT OR REPLACE INTO suivis_of (id, numero_emission, code_of, num_commande, nom_client, famille, statut, json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(o.id, o.numero_emission, o.code_of, o.num_commande, o.nom_client, o.famille, o.statut, o.json_data);
            }
            const allM = testDb.prepare('SELECT * FROM mouvements_stock').all() as any[];
            for (const m of allM) {
              this.db.prepare('INSERT OR REPLACE INTO mouvements_stock (id, timestamp, date, article_code, article_designation, type_mouvement, quantite, commentaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(m.id, m.timestamp, m.date, m.article_code, m.article_designation, m.type_mouvement, m.quantite, m.commentaire);
            }
            console.log(`[AtelierDB] Restauration réussie (${allD.length} dossiers, ${allOF.length} OFs).`);
            break;
          }
        } catch (eRecovery) {
          console.warn(`[AtelierDB] Échec analyse sauvegarde ${f}:`, eRecovery);
        }
      }
    } catch (e) {
      console.warn('[AtelierDB] Erreur autoRecoverIfEmpty:', e);
    }
  }

  checkpointWal() {
    try {
      this.db.exec('PRAGMA wal_checkpoint(PASSIVE);');
    } catch {}
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

      -- Table Paramètres de Production & Délais
      CREATE TABLE IF NOT EXISTS parametres_production (
        id TEXT PRIMARY KEY,
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
    try {
      this.db.exec('ALTER TABLE suivis_of ADD COLUMN numero_emission INTEGER;');
    } catch {}
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_of_numero_emission ON suivis_of(numero_emission);');
    } catch {}

    // Migration douce pour numéroter séquentiellement les OFs existants s'ils n'ont pas encore de numéro d'émission
    try {
      const ofRows = this.db.prepare("SELECT id, date_emission, updated_at, json_data, numero_emission FROM suivis_of ORDER BY date_emission ASC, updated_at ASC, id ASC").all() as any[];
      let seqNum = 1;
      const updateOFStmt = this.db.prepare("UPDATE suivis_of SET numero_emission = ?, json_data = ? WHERE id = ?");
      for (const row of ofRows) {
        let data: any = {};
        try { data = JSON.parse(row.json_data); } catch {}
        if (!row.numero_emission || !data.numeroEmission) {
          const num = row.numero_emission || seqNum;
          data.numeroEmission = num;
          data.codeOF = data.codeOF || `OF-${String(num).padStart(3, '0')}`;
          updateOFStmt.run(num, JSON.stringify(data), row.id);
        }
        const currentVal = row.numero_emission || data.numeroEmission || seqNum;
        seqNum = Math.max(seqNum, currentVal + 1);
      }
    } catch (e) {
      console.warn('[AtelierDB] Note migration numero_emission:', e);
    }

    // Création des vues SQL pour afficher directement toutes les lignes de commande dans n'importe quel visualiseur SQLite
    try {
      this.db.exec(`
        DROP VIEW IF EXISTS v_lignes_commandes_caissons;
        CREATE VIEW v_lignes_commandes_caissons AS
        SELECT 
          d.id AS dossier_id,
          COALESCE(json_extract(d.json_data, '$.numCommandeCaisson'), d.ref_commande) AS ref_commande,
          d.donneur_ordre,
          d.nom_client_final,
          d.date_commande,
          d.statut AS statut_dossier,
          json_extract(c.value, '$.id') AS ligne_id,
          json_extract(c.value, '$.repere') AS repere,
          'CAISSON' AS famille,
          json_extract(c.value, '$.longueur') AS longueur_mm,
          NULL AS hauteur_mm,
          json_extract(c.value, '$.quantite') AS quantite,
          json_extract(c.value, '$.articleCode') AS article_code,
          json_extract(c.value, '$.articleDesignation') AS designation_caisson,
          json_extract(c.value, '$.sfArticleDesignation') AS designation_sous_face,
          json_extract(c.value, '$.typeCaisson') AS type_caisson,
          json_extract(c.value, '$.montageSousFace') AS montage_sous_face,
          json_extract(c.value, '$.avecPeinture') AS avec_peinture
        FROM dossiers d, json_each(CASE WHEN json_valid(d.json_data) AND json_type(d.json_data, '$.articlesCaissons') = 'array' THEN json_extract(d.json_data, '$.articlesCaissons') ELSE '[]' END) c;

        DROP VIEW IF EXISTS v_lignes_commandes_tabliers;
        CREATE VIEW v_lignes_commandes_tabliers AS
        SELECT 
          d.id AS dossier_id,
          COALESCE(json_extract(d.json_data, '$.numCommandeTablier'), d.ref_commande) AS ref_commande,
          d.donneur_ordre,
          d.nom_client_final,
          d.date_commande,
          d.statut AS statut_dossier,
          json_extract(t.value, '$.id') AS ligne_id,
          json_extract(t.value, '$.repere') AS repere,
          'TABLIER' AS famille,
          json_extract(t.value, '$.largeur') AS longueur_mm,
          json_extract(t.value, '$.hauteur') AS hauteur_mm,
          json_extract(t.value, '$.hauteur_lame_tablier') AS hauteur_lame,
          json_extract(t.value, '$.quantite') AS quantite,
          json_extract(t.value, '$.articleCode') AS article_code,
          json_extract(t.value, '$.articleDesignation') AS designation_lame,
          json_extract(t.value, '$.lfArticleDesignation') AS designation_lame_finale,
          json_extract(t.value, '$.typeFabrication') AS type_fabrication,
          json_extract(t.value, '$.avecLameFinale') AS avec_lame_finale,
          json_extract(t.value, '$.avecCoulisses') AS avec_coulisses
        FROM dossiers d, json_each(CASE WHEN json_valid(d.json_data) AND json_type(d.json_data, '$.articlesTabliers') = 'array' THEN json_extract(d.json_data, '$.articlesTabliers') ELSE '[]' END) t;

        DROP VIEW IF EXISTS v_lignes_commandes_moustiquaires;
        CREATE VIEW v_lignes_commandes_moustiquaires AS
        SELECT 
          d.id AS dossier_id,
          COALESCE(json_extract(d.json_data, '$.numCommandeMoustiquaire'), d.ref_commande) AS ref_commande,
          d.donneur_ordre,
          d.nom_client_final,
          d.date_commande,
          d.statut AS statut_dossier,
          json_extract(m.value, '$.id') AS ligne_id,
          json_extract(m.value, '$.repere') AS repere,
          'MOUSTIQUAIRE' AS famille,
          json_extract(m.value, '$.largeur') AS longueur_mm,
          json_extract(m.value, '$.hauteur') AS hauteur_mm,
          json_extract(m.value, '$.quantite') AS quantite,
          json_extract(m.value, '$.modele') AS modele,
          json_extract(m.value, '$.typeOuverture') AS type_ouverture,
          json_extract(m.value, '$.typeFabrication') AS type_fabrication,
          json_extract(m.value, '$.articleDesignationCadre') AS designation_cadre,
          json_extract(m.value, '$.articleDesignationMaille') AS designation_maille
        FROM dossiers d, json_each(CASE WHEN json_valid(d.json_data) AND json_type(d.json_data, '$.articlesMoustiquaires') = 'array' THEN json_extract(d.json_data, '$.articlesMoustiquaires') ELSE '[]' END) m;

        DROP VIEW IF EXISTS v_lignes_commandes_precadres;
        CREATE VIEW v_lignes_commandes_precadres AS
        SELECT 
          d.id AS dossier_id,
          COALESCE(json_extract(d.json_data, '$.numCommandePrecadre'), d.ref_commande) AS ref_commande,
          d.donneur_ordre,
          d.nom_client_final,
          d.date_commande,
          d.statut AS statut_dossier,
          json_extract(p.value, '$.id') AS ligne_id,
          json_extract(p.value, '$.repere') AS repere,
          'PRECADRE' AS famille,
          json_extract(p.value, '$.largeur') AS longueur_mm,
          json_extract(p.value, '$.hauteur') AS hauteur_mm,
          json_extract(p.value, '$.quantite') AS quantite,
          json_extract(p.value, '$.articleCode') AS article_code,
          json_extract(p.value, '$.articleDesignation') AS designation_precadre,
          json_extract(p.value, '$.figure') AS figure,
          json_extract(p.value, '$.modeDebordement') AS mode_debordement
        FROM dossiers d, json_each(CASE WHEN json_valid(d.json_data) AND json_type(d.json_data, '$.articlesPrecadres') = 'array' THEN json_extract(d.json_data, '$.articlesPrecadres') ELSE '[]' END) p;

        DROP VIEW IF EXISTS v_toutes_les_lignes_commandes;
        CREATE VIEW v_toutes_les_lignes_commandes AS
        SELECT dossier_id, ref_commande, donneur_ordre, nom_client_final, date_commande, statut_dossier, ligne_id, repere, famille, longueur_mm AS dimension_L, hauteur_mm AS dimension_H, quantite, designation_caisson AS designation_principale FROM v_lignes_commandes_caissons
        UNION ALL
        SELECT dossier_id, ref_commande, donneur_ordre, nom_client_final, date_commande, statut_dossier, ligne_id, repere, famille, longueur_mm AS dimension_L, hauteur_mm AS dimension_H, quantite, designation_lame AS designation_principale FROM v_lignes_commandes_tabliers
        UNION ALL
        SELECT dossier_id, ref_commande, donneur_ordre, nom_client_final, date_commande, statut_dossier, ligne_id, repere, famille, longueur_mm AS dimension_L, hauteur_mm AS dimension_H, quantite, designation_cadre AS designation_principale FROM v_lignes_commandes_moustiquaires
        UNION ALL
        SELECT dossier_id, ref_commande, donneur_ordre, nom_client_final, date_commande, statut_dossier, ligne_id, repere, famille, longueur_mm AS dimension_L, hauteur_mm AS dimension_H, quantite, designation_precadre AS designation_principale FROM v_lignes_commandes_precadres;
      `);
    } catch (e) {
      console.warn('[AtelierDB] Note creation vues lignes commandes:', e);
    }
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

    // Auto-consolidation : S'assurer que tous les Donneurs d'Ordre présents dans l'historique des dossiers sont codifiés
    try {
      const distinctDonneurs = this.db.prepare("SELECT DISTINCT donneur_ordre FROM dossiers WHERE donneur_ordre IS NOT NULL AND trim(donneur_ordre) != ''").all() as any[];
      for (const d of distinctDonneurs) {
        const nom = String(d.donneur_ordre).trim();
        if (!nom) continue;
        const exists = this.db.prepare("SELECT count(*) as c FROM client_codifications WHERE lower(trim(nom)) = lower(?)").get(nom) as any;
        if (exists?.c === 0) {
          const id = 'codif-' + nom.toUpperCase().replace(/[^A-Z0-9]/g, '-');
          const code = nom.toUpperCase().replace(/\s+/g, '-');
          let prefix = nom.substring(0, 2).toUpperCase() + '-';
          let type = 'AUTRE';
          const nomUp = nom.toUpperCase();
          if (nomUp.includes('SOMODAL') || nomUp.includes('SOMADAL')) {
            type = 'SOMADAL';
            prefix = nomUp.includes('ORAN') ? 'SO-' : nomUp.includes('CONST') ? 'SC-' : 'SA-';
          } else if (nomUp.includes('CRISTAL')) {
            type = 'CRISTAL';
            prefix = nomUp.includes('ORAN') ? 'O-' : nomUp.includes('CONST') ? 'D-' : 'A-';
          } else if (nomUp.includes('ATELIER')) {
            type = 'ATELIER';
            prefix = nomUp.includes('ORAN') ? 'AO-' : nomUp.includes('CONST') ? 'Y-' : 'AA-';
          }
          this.upsertClientCodification({
            id,
            code,
            nom,
            prefixeCommande: prefix,
            type: type as any,
            badgeColor: type === 'CRISTAL' ? 'text-purple-300' : type === 'SOMADAL' ? 'text-sky-300' : 'text-amber-300',
            badgeBg: type === 'CRISTAL' ? 'bg-purple-500/20 border-purple-500/30' : type === 'SOMADAL' ? 'bg-sky-500/20 border-sky-500/30' : 'bg-amber-500/20 border-amber-500/30',
            actif: true,
            ordre: 99,
            peintureParDefaut: false,
            montageSousFaceParDefaut: true,
            avecPlaqueParDefaut: false
          });
          console.log(`📦 [SQLite] Auto-consolidation du client existant "${nom}" dans les codifications.`);
        }
      }
    } catch (e) {
      console.warn('[AtelierDB] Note auto-consolidation donneurs:', e);
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
        stmtJ.run('ART0070', 'PRÉCADRE TYPE 36', 'NORMAL', 36, 6000, 4.0, 0, 300, 1200, 55, 0, 2350, 10);
        stmtJ.run('ART0071', 'PRÉCADRE TYPE 50', 'NORMAL', 50, 6000, 4.0, 0, 300, 1200, 48, 0, 2750, 10);
        stmtJ.run('ART0072', 'BOUCHON PRECADRE 36', 'NORMAL', 36, 6000, 4.0, -10, 200, 1000, 250, 0, 140, 50);
        stmtJ.run('ART0073', 'BOUCHON PRECADRE 50', 'NORMAL', 50, 6000, 4.0, -10, 200, 1000, 250, 0, 160, 50);
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
        const stockPhys = a.stock_physique ?? 0;
        const stockMin = a.stock_min ?? 5;
        const statut = stockPhys <= stockMin ? 'ALERTE' : (a.statut || 'NORMAL');
        stmt.run(
          a.code_art, a.designation, statut, a.hauteur || 0,
          a.longeur ?? 6000, a.lame ?? 4.5, a.debordement ?? 0,
          a.refus_min ?? 300, a.refus_max ?? 1200, stockPhys,
          a.quantite_reservee ?? 0, a.prix_unitaire ?? 0, stockMin
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
    const stockPhys = art.stock_physique ?? 0;
    const stockMin = art.stock_min ?? 5;
    const statut = stockPhys <= stockMin ? 'ALERTE' : (art.statut || 'NORMAL');
    stmt.run(
      art.code_art, art.designation, statut, art.hauteur ?? 0,
      art.longeur ?? 6000, art.lame ?? 4.5, art.debordement ?? 0,
      art.refus_min ?? 300, art.refus_max ?? 1200, stockPhys,
      art.quantite_reservee ?? 0, art.prix_unitaire ?? 0, stockMin
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

    // Consolider pour garantir 1 seule ligne par longueur au sein de chaque famille
    const consolidatedMap: Record<string, ChuteItem[]> = {};
    for (const [sheet, items] of Object.entries(map)) {
      const byLg = new Map<number, ChuteItem>();
      for (const item of items) {
        const lg = Math.round(Number(item.longueur) * 10) / 10;
        if (lg <= 0) continue;
        if (byLg.has(lg)) {
          const ex = byLg.get(lg)!;
          ex.quantite = (ex.quantite || 0) + (item.quantite || 0);
          ex.quantitePhysique = (ex.quantitePhysique || 0) + (item.quantitePhysique || 0);
          ex.reserve = (ex.reserve || 0) + (item.reserve || 0);
        } else {
          byLg.set(lg, {
            ...item,
            longueur: lg,
            quantite: item.quantite || 0,
            quantitePhysique: item.quantitePhysique || 0,
            reserve: item.reserve || 0
          });
        }
      }
      consolidatedMap[sheet] = Array.from(byLg.values()).sort((a, b) => b.longueur - a.longueur);
    }

    return consolidatedMap;
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
          // Consolidation des chutes : aucune mesure en doublon, cumul de la quantité totale par longueur
          const consolidatedByLg = new Map<number, { id: string; longueur: number; quantite: number }>();

          for (const item of items) {
            const lg = Math.round((Number(item.longueur) || 0) * 10) / 10;
            if (lg <= 0) continue;

            const rawQte = (item as any).quantitePhysique ?? item.quantite;
            const qteVal = Math.max(0, Math.round(Number(rawQte) || 0));
            if (qteVal <= 0) continue;

            if (consolidatedByLg.has(lg)) {
              const existing = consolidatedByLg.get(lg)!;
              existing.quantite += qteVal;
            } else {
              let chuteId = item.id ? String(item.id).trim() : '';
              if (!chuteId || usedIds.has(chuteId)) {
                chuteId = `c-${safeSheet}-${timestamp}-${counter++}-${Math.random().toString(36).substring(2, 7)}`;
              }
              usedIds.add(chuteId);
              consolidatedByLg.set(lg, {
                id: chuteId,
                longueur: lg,
                quantite: qteVal
              });
            }
          }

          for (const c of consolidatedByLg.values()) {
            stmt.run(
              c.id,
              cleanSheet,
              c.longueur,
              c.quantite
            );
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
    const rawList: ChuteMaille[] = rows.map(r => {
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

    // Consolidation des chutes maille : 1 seule entrée par dimension fixe avec cumul des plis
    const byDim = new Map<number, ChuteMaille>();
    for (const item of rawList) {
      const dim = Math.round(Number(item.dimension_fixe) * 10) / 10;
      if (dim <= 0) continue;
      if (byDim.has(dim)) {
        const ex = byDim.get(dim)!;
        ex.plis = (ex.plis || 0) + (item.plis || 0);
        ex.plisPhysique = (ex.plisPhysique || 0) + (item.plisPhysique || 0);
        ex.plisReserve = (ex.plisReserve || 0) + (item.plisReserve || 0);
      } else {
        byDim.set(dim, {
          ...item,
          dimension_fixe: dim,
          plis: item.plis || 0,
          plisPhysique: item.plisPhysique || 0,
          plisReserve: item.plisReserve || 0
        });
      }
    }
    return Array.from(byDim.values()).sort((a, b) => b.dimension_fixe - a.dimension_fixe);
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

      // Consolidation : aucune dimension en doublon, cumul des plis
      const consolidatedMaille = new Map<number, { id: string; dimension_fixe: number; plis: number }>();

      for (const m of mailleList) {
        const dim = Math.round((Number(m.dimension_fixe) || 0) * 10) / 10;
        if (dim <= 0) continue;

        const rawPlis = (m as any).plisPhysique ?? m.plis;
        const plisVal = Math.max(0, Math.round(Number(rawPlis) || 0));
        if (plisVal <= 0) continue;

        if (consolidatedMaille.has(dim)) {
          const ex = consolidatedMaille.get(dim)!;
          ex.plis += plisVal;
        } else {
          let mailleId = m.id ? String(m.id).trim() : '';
          if (!mailleId || usedMailleIds.has(mailleId)) {
            mailleId = `m-${timestamp}-${counter++}-${Math.random().toString(36).substring(2, 7)}`;
          }
          usedMailleIds.add(mailleId);
          consolidatedMaille.set(dim, {
            id: mailleId,
            dimension_fixe: dim,
            plis: plisVal
          });
        }
      }

      for (const m of consolidatedMaille.values()) {
        stmt.run(m.id, m.dimension_fixe, m.plis);
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
  // PARAMÈTRES DE PRODUCTION & DÉLAIS
  // ==========================================
  getParametresProduction(): any {
    const DEFAULT_PARAMS = {
      joursOuvres: [0, 1, 2, 3, 4],
      heuresTravailParJour: 8,
      familles: {
        CAISSON: {
          famille: 'CAISSON',
          libelle: 'Caissons & Sous-faces',
          tempsUnitaireMinutes: 5,
          capaciteJournalierePieces: 120,
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

    try {
      const row = this.db.prepare('SELECT json_data FROM parametres_production WHERE id = ?').get('default') as any;
      if (row?.json_data) {
        const parsed = JSON.parse(row.json_data);
        // Si la base contient encore l'ancienne valeur temporaire de 20 caissons au lieu de 120, migrer automatiquement vers la cadence réelle
        if (parsed?.familles?.CAISSON?.capaciteJournalierePieces === 20) {
          this.saveParametresProduction(DEFAULT_PARAMS);
          return DEFAULT_PARAMS;
        }
        return parsed;
      } else {
        // Initialiser avec les cadences réelles d'usine si vide
        this.saveParametresProduction(DEFAULT_PARAMS);
        return DEFAULT_PARAMS;
      }
    } catch (e) {
      console.warn('Erreur lecture parametres_production:', e);
    }
    return DEFAULT_PARAMS;
  }

  saveParametresProduction(params: any) {
    const stmt = this.db.prepare(`
      INSERT INTO parametres_production (id, json_data, updated_at)
      VALUES ('default', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET json_data = excluded.json_data, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(JSON.stringify(params));
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

    // Auto-réconciliation bidirectionnelle stricte avec les OFs réels actifs
    try {
      const ofs = this.getSuivisOF();
      const activeEmittedOfs = ofs.filter(o => o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE');
      const allActiveOfs = ofs.filter(o => o.statut !== 'ANNULE');

      for (const dossier of list) {
        if (dossier.statut === 'LIVRE') continue;

        const dossierRef = (dossier.refCommande || '').trim().toLowerCase();
        const subRefs = [
          dossier.numCommandeCaisson,
          dossier.numCommandeSousFace,
          dossier.numCommandeTablier,
          dossier.numCommandeMoustiquaire,
          dossier.numCommandePrecadre,
          ...(dossier.commandesConfirmees || [])
        ].filter(Boolean).map(sr => sr!.trim().toLowerCase());

        const hasActiveEmittedOf = activeEmittedOfs.some(o => {
          if (o.dossierId && o.dossierId === dossier.id) return true;
          const cmdRefs = (o.numCommande || '').split(/[\s,+/]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
          const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
          const matchesSub = subRefs.some(sr => cmdRefs.some(ref => sr.includes(ref) || ref.includes(sr)));
          const matchesClient = o.nomClient && dossier.nomClientFinal &&
            dossier.nomClientFinal.trim().toLowerCase() === o.nomClient.trim().toLowerCase();
          return matchesCmd || matchesSub || (matchesClient && !dossierRef);
        });

        const hasAnyActiveOf = allActiveOfs.some(o => {
          if (o.dossierId && o.dossierId === dossier.id) return true;
          const cmdRefs = (o.numCommande || '').split(/[\s,+/]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
          const matchesCmd = cmdRefs.some(ref => ref && (dossierRef.includes(ref) || ref.includes(dossierRef)));
          const matchesSub = subRefs.some(sr => cmdRefs.some(ref => sr.includes(ref) || ref.includes(sr)));
          const matchesClient = o.nomClient && dossier.nomClientFinal &&
            dossier.nomClientFinal.trim().toLowerCase() === o.nomClient.trim().toLowerCase();
          return matchesCmd || matchesSub || (matchesClient && !dossierRef);
        });

        // 1. Si un OF émis actif existe et dossier en attente -> passer en cours
        if (hasActiveEmittedOf && (dossier.statut === 'EN_ATTENTE' || dossier.statut === 'BROUILLON' || !dossier.statut)) {
          dossier.statut = 'EN_COURS';
          this.upsertDossier(dossier);
        }
        // 2. Si AUCUN OF actif n'existe (annulé ou supprimé) et dossier noté EN_COURS -> repasser en attente
        else if (!hasAnyActiveOf && (dossier.statut === 'EN_COURS' || (dossier.commandesConfirmees && dossier.commandesConfirmees.length > 0))) {
          if (!dossier.estEnPause && dossier.statut !== 'EN_PAUSE') {
            dossier.statut = 'EN_ATTENTE';
          }
          dossier.commandesConfirmees = [];
          this.upsertDossier(dossier);
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
      this.checkpointWal();
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

    // Synchronisation automatique bidirectionnelle de la pause avec les OFs associés
    try {
      const dRefs = [d.id, d.refCommande, d.numCommandeCaisson, d.numCommandeSousFace, d.numCommandeTablier, d.numCommandeMoustiquaire, d.numCommandePrecadre]
        .filter(Boolean).map(r => r!.trim().toLowerCase());

      if (d.estEnPause || d.statut === 'EN_PAUSE') {
        const ofRows = this.db.prepare('SELECT id, json_data FROM suivis_of').all() as any[];
        const updateOfStmt = this.db.prepare(`
          UPDATE suivis_of SET statut = 'EN_PAUSE', json_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `);
        for (const row of ofRows) {
          if (!row.json_data) continue;
          try {
            const of: SuiviOF = JSON.parse(row.json_data);
            if (of.statut === 'CLOTURE' || of.statut === 'LIVRE' || of.statut === 'ANNULE') continue;
            const ofCmd = (of.numCommande || '').trim().toLowerCase();
            const matches = (of.dossierId && of.dossierId === d.id) ||
              dRefs.some(r => r && (r === ofCmd || (r.length >= 3 && ofCmd.length >= 3 && (r.startsWith(ofCmd) || ofCmd.startsWith(r)))));
            if (matches && (of.statut !== 'EN_PAUSE' || !of.estEnPause)) {
              of.statut = 'EN_PAUSE';
              of.estEnPause = true;
              of.datePause = d.datePause || of.datePause || new Date().toISOString();
              of.motifPause = d.motifPause || of.motifPause || 'Dossier commande mis en pause';
              updateOfStmt.run(JSON.stringify(of), of.id);
            }
          } catch (eOF) {
            console.warn('Erreur sync pause OF depuis dossier:', eOF);
          }
        }
      } else if (!d.estEnPause) {
        const ofRows = this.db.prepare("SELECT id, json_data FROM suivis_of WHERE statut = 'EN_PAUSE'").all() as any[];
        const updateOfStmt = this.db.prepare(`
          UPDATE suivis_of SET statut = ?, json_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `);
        for (const row of ofRows) {
          if (!row.json_data) continue;
          try {
            const of: SuiviOF = JSON.parse(row.json_data);
            const ofCmd = (of.numCommande || '').trim().toLowerCase();
            const matches = (of.dossierId && of.dossierId === d.id) ||
              dRefs.some(r => r && (r === ofCmd || (r.length >= 3 && ofCmd.length >= 3 && (r.startsWith(ofCmd) || ofCmd.startsWith(r)))));
            if (matches) {
              const newStatut = (of.lignesRetour && of.lignesRetour.length > 0) ? 'RETOUR_EN_ATTENTE' : 'EMIS';
              of.statut = newStatut;
              of.estEnPause = false;
              of.datePause = undefined;
              updateOfStmt.run(newStatut, JSON.stringify(of), of.id);
            }
          } catch (eOF) {
            console.warn('Erreur sync reprise OF depuis dossier:', eOF);
          }
        }
      }
    } catch (errSync) {
      console.warn('Erreur synchronisation pause dossier vers OFs:', errSync);
    }

    this.checkpointWal();
  }

  deleteDossier(id: string) {
    this.db.prepare('DELETE FROM dossiers WHERE id = ?').run(id);
    this.checkpointWal();
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

        // 0. Vérification prioritaire et immédiate sur le titre de section et le numéro de commande
        const cmdUpper = (ofObj.numCommande || r.num_commande || '').toUpperCase();
        const titreUpper = (ofObj.titreSection || r.titre_section || '').toUpperCase();

        if (titreUpper.includes('CAISSON') || titreUpper.includes('SOUS-FACE') || cmdUpper.includes('CAISSON')) {
          vraieFamille = 'CAISSON';
        } else if (cmdUpper.includes('PRC') || cmdUpper.includes('PRECADRE') || cmdUpper.includes('PRÉCADRE') || cmdUpper.startsWith('1R') || titreUpper.includes('PRÉCADRE') || titreUpper.includes('PRECADRE') || titreUpper.includes('PRC')) {
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

            const hasTab = (dossierAssocie.articlesTabliers || []).length > 0;
            const hasMstq = (dossierAssocie.articlesMoustiquaires || []).length > 0;
            const hasPrc = (dossierAssocie.articlesPrecadres || []).length > 0;
            const hasCais = (dossierAssocie.articlesCaissons || []).length > 0;

            // Vérifier d'abord la correspondance spécifique du sous-numéro AVEC présence effective d'articles
            if (numCmdClean && dNumCais && (numCmdClean === dNumCais || numCmdClean.includes(dNumCais) || dNumCais.includes(numCmdClean)) && hasCais) {
              vraieFamille = 'CAISSON';
            } else if (numCmdClean && dNumTab && (numCmdClean === dNumTab || numCmdClean.includes(dNumTab) || dNumTab.includes(numCmdClean)) && hasTab) {
              vraieFamille = 'TABLIER';
            } else if (numCmdClean && dNumMstq && (numCmdClean === dNumMstq || numCmdClean.includes(dNumMstq) || dNumMstq.includes(numCmdClean)) && hasMstq) {
              vraieFamille = 'MOUSTIQUAIRE';
            } else if (numCmdClean && dNumPrc && (numCmdClean === dNumPrc || numCmdClean.includes(dNumPrc) || dNumPrc.includes(numCmdClean)) && hasPrc) {
              vraieFamille = 'PRECADRE';
            } else {
              // Si une seule famille possède des articles dans le dossier
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
          const hasCAIS = lignes.some((l: any) => {
            const code = (l.articleCode || '').toUpperCase();
            const des = (l.piecesInfoStr || l.designation || l.articleDesignation || '').toUpperCase();
            const label = (l.repere || l.labelPiece || '').toUpperCase();
            return (
              code.includes('ART0009') ||
              code.includes('ART0016') ||
              des.includes('CT SOMO') ||
              des.includes('CAISSON') ||
              des.includes('SOUS-FACE') ||
              des.includes('SF KERNOU') ||
              des.includes('SF ') ||
              label.startsWith('CT-') ||
              label.startsWith('SF-')
            );
          });

          const hasPRC = lignes.some((l: any) => {
            const code = (l.articleCode || '').toUpperCase();
            const des = (l.piecesInfoStr || l.designation || l.articleDesignation || '').toUpperCase();
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
            const des = (l.piecesInfoStr || l.designation || l.articleDesignation || '').toUpperCase();
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
            const des = (l.piecesInfoStr || l.designation || l.articleDesignation || '').toUpperCase();
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

          if (hasCAIS && !hasTBL && !hasMSTQ && !hasPRC) vraieFamille = 'CAISSON';
          else if (hasPRC && !hasTBL && !hasMSTQ && !hasCAIS) vraieFamille = 'PRECADRE';
          else if (hasTBL && !hasMSTQ && !hasPRC && !hasCAIS) vraieFamille = 'TABLIER';
          else if (hasMSTQ && !hasTBL && !hasPRC && !hasCAIS) vraieFamille = 'MOUSTIQUAIRE';
        }

        // 3. Si toujours pas résolu, inspecter les titres et les préfixes de codification
        if (!vraieFamille) {
          if (cmdUpper.startsWith('CT-') || cmdUpper.startsWith('A-') || titreUpper.includes('CAISSON') || titreUpper.includes('SOUS-FACE')) {
            vraieFamille = 'CAISSON';
          } else if (cmdUpper.startsWith('SA-') || titreUpper.includes('TABLIER') || titreUpper.includes('VOLET') || titreUpper.includes('LAME')) {
            vraieFamille = 'TABLIER';
          } else if (cmdUpper.startsWith('SC-') || cmdUpper.startsWith('D-') || titreUpper.includes('MOUSTIQUAIRE') || titreUpper.includes('MSTQ')) {
            vraieFamille = 'MOUSTIQUAIRE';
          } else if (cmdUpper.startsWith('1R') || titreUpper.includes('PRÉCADRE') || titreUpper.includes('PRECADRE') || titreUpper.includes('PRC')) {
            vraieFamille = 'PRECADRE';
          }
        }

        // 4. Si une vraie famille différente de la famille stockée est détectée
        if (vraieFamille && vraieFamille !== familleActuelle) {
          ofObj.famille = vraieFamille;
          updateStmt.run(vraieFamille, JSON.stringify(ofObj), r.id);
          repares++;
        }
      }

      if (repares > 0) {
        console.log(`[AtelierDB] ${repares} ordre(s) de fabrication réparé(s) automatiquement vers leur véritable famille de produit.`);
      }

      // Synchroniser immédiatement les statuts des dossiers en cohérence
      this.synchroniserStatutsDossiersOF();
    } catch (err) {
      console.warn('[AtelierDB] Warning lors de la réparation des familles OF:', err);
    }
    return { repares };
  }

  /**
   * Synchronise l'état de fabrication de chaque dossier de commande
   * en fonction des Ordres de Fabrication (OF) réellement émis et clôturés.
   */
  synchroniserStatutsDossiersOF(): { misAJour: number } {
    let misAJour = 0;
    try {
      const dossiers = this.getDossiers();
      const allOFs = this.getSuivisOF();

      for (const d of dossiers) {
        if (d.statut === 'LIVRE') continue; // Ne pas toucher aux dossiers déjà livrés au client

        const dRef = (d.refCommande || '').trim().toLowerCase();
        const dClient = (d.nomClientFinal || '').trim().toLowerCase();
        const subRefs = [
          d.numCommandeCaisson,
          d.numCommandeSousFace,
          d.numCommandeTablier,
          d.numCommandeMoustiquaire,
          d.numCommandePrecadre,
          ...(d.commandesConfirmees || [])
        ].filter(Boolean).map(r => r.trim().toLowerCase());

        const relatedOFs = allOFs.filter(o => {
          if (o.dossierId && o.dossierId === d.id) return true;
          const oCmd = (o.numCommande || '').trim().toLowerCase();
          const oClient = (o.nomClient || '').trim().toLowerCase();
          const matchesRef = (dRef && (oCmd === dRef || oCmd.includes(dRef) || dRef.includes(oCmd))) ||
            subRefs.some(sr => sr && (oCmd === sr || oCmd.includes(sr) || sr.includes(oCmd)));
          const matchesClient = dClient && oClient && (dClient === oClient);
          return matchesRef || (matchesClient && !dRef);
        });

        // Filtrer strictement les OFs actifs (exclure les OFs annulés)
        const activeRelatedOFs = relatedOFs.filter(o => o.statut !== 'ANNULE');

        if (activeRelatedOFs.length === 0) {
          // Aucun OF actif émis pour cette commande : elle doit repasser en "EN_ATTENTE" et ses commandes confirmées être libérées
          let modified = false;
          if (d.statut === 'EN_COURS' && !d.estEnPause) {
            d.statut = 'EN_ATTENTE';
            modified = true;
          }
          if (Array.isArray(d.commandesConfirmees) && d.commandesConfirmees.length > 0) {
            d.commandesConfirmees = [];
            modified = true;
          }
          if (modified) {
            this.upsertDossier(d);
            misAJour++;
          }
        } else {
          const hasEmis = activeRelatedOFs.some(o => o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE');
          const allClosed = activeRelatedOFs.every(o => o.statut === 'CLOTURE');

          let targetStatut = d.statut;
          if (allClosed) {
            targetStatut = 'FABRIQUE';
          } else if (hasEmis) {
            targetStatut = d.estEnPause ? 'EN_PAUSE' : 'EN_COURS';
          } else {
            targetStatut = d.estEnPause ? 'EN_PAUSE' : 'EN_ATTENTE';
          }

          // Nettoyer les commandesConfirmees pour ne garder que celles qui ont un OF actif
          const activeRefsTokens = new Set<string>();
          activeRelatedOFs.forEach(o => {
            const raw = (o.numCommande || '').toLowerCase();
            raw.split(/[\s,+/]+/).forEach(token => {
              if (token.trim()) activeRefsTokens.add(token.trim());
            });
            activeRefsTokens.add(raw.trim());
          });

          const currentConfirmees = d.commandesConfirmees || [];
          const newConfirmees = currentConfirmees.filter(c => {
            const cLower = c.toLowerCase().trim();
            return activeRefsTokens.has(cLower) || Array.from(activeRefsTokens).some(t => t.includes(cLower) || cLower.includes(t));
          });

          let modified = false;
          if (d.statut !== targetStatut) {
            d.statut = targetStatut;
            modified = true;
          }
          if (JSON.stringify(currentConfirmees) !== JSON.stringify(newConfirmees)) {
            d.commandesConfirmees = newConfirmees;
            modified = true;
          }

          if (modified) {
            this.upsertDossier(d);
            misAJour++;
          }
        }
      }

      if (misAJour > 0) {
        console.log(`[AtelierDB] ${misAJour} dossier(s) synchronisé(s) avec le statut réel de leurs OF.`);
      }
    } catch (err) {
      console.warn('[AtelierDB] Warning lors de la synchronisation des statuts dossiers:', err);
    }
    return { misAJour };
  }

  getSuivisOF(): SuiviOF[] {
    const rows = this.db.prepare('SELECT json_data, numero_emission FROM suivis_of ORDER BY COALESCE(numero_emission, 999999) DESC, updated_at DESC').all() as any[];
    return rows.map(r => {
      try {
        const obj = JSON.parse(r.json_data);
        if (r.numero_emission && !obj.numeroEmission) {
          obj.numeroEmission = r.numero_emission;
        }
        if (obj.numeroEmission && !obj.codeOF) {
          obj.codeOF = `OF-${String(obj.numeroEmission).padStart(3, '0')}`;
        }
        return obj;
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
          famille, titre_section, statut, date_emission, date_retour, numero_emission, json_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let seq = 1;
      for (const s of suivis) {
        if (!s.numeroEmission || s.numeroEmission <= 0) {
          s.numeroEmission = seq;
        }
        if (!s.codeOF) {
          s.codeOF = `OF-${String(s.numeroEmission).padStart(3, '0')}`;
        }
        seq = Math.max(seq, s.numeroEmission + 1);

        stmt.run(
          s.id, s.numCommande, s.nomClient, s.donneurOrdre,
          s.famille, s.titreSection, s.statut, s.dateEmission,
          s.dateRetour || null, s.numeroEmission, JSON.stringify(s)
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
    if (!s.numeroEmission || s.numeroEmission <= 0) {
      const existing = this.db.prepare('SELECT numero_emission, json_data FROM suivis_of WHERE id = ?').get(s.id) as any;
      if (existing?.numero_emission) {
        s.numeroEmission = existing.numero_emission;
      } else {
        const maxRow = this.db.prepare('SELECT MAX(numero_emission) as max_num FROM suivis_of').get() as any;
        const nextNum = (Number(maxRow?.max_num) || 0) + 1;
        s.numeroEmission = nextNum;
      }
    }
    if (!s.codeOF) {
      s.codeOF = `OF-${String(s.numeroEmission).padStart(3, '0')}`;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO suivis_of (
        id, num_commande, nom_client, donneur_ordre,
        famille, titre_section, statut, date_emission, date_retour, numero_emission, json_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      s.id, s.numCommande, s.nomClient, s.donneurOrdre,
      s.famille, s.titreSection, s.statut, s.dateEmission,
      s.dateRetour || null, s.numeroEmission, JSON.stringify(s)
    );

    // Gestion stricte des réservations de chutes et de barres dès émission
    this.db.prepare('DELETE FROM reservations_chutes WHERE of_id = ?').run(s.id);
    this.db.prepare('DELETE FROM reservations_barres WHERE of_id = ?').run(s.id);
    this.db.prepare('DELETE FROM reservations_maille WHERE of_id = ?').run(s.id);

    if (s.statut === 'EMIS' || s.statut === 'RETOUR_EN_ATTENTE' || s.statut === 'EN_COURS' || s.statut === 'EN_PAUSE') {
      this.saveReservationsForOF(s);
    }
    this.syncArticlesQuantiteReservee();

    // Synchronisation automatique de statut avec les Dossiers de Commande
    const cmdRefs = (s.numCommande || '')
      .split(/[\s,+/]+/)
      .map(c => c.trim().toLowerCase())
      .filter(Boolean);

    const allDossiers = this.getDossiers();

    if (s.statut === 'EN_PAUSE' || s.estEnPause) {
      // 1. Mise en pause du dossier lié si l'OF est mis en pause
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
        const matchesId = s.dossierId && s.dossierId === dossier.id;

        if (matchesId || matchesCmd || matchesSub) {
          if (!dossier.estEnPause || dossier.statut !== 'EN_PAUSE') {
            dossier.estEnPause = true;
            dossier.statut = 'EN_PAUSE';
            dossier.datePause = s.datePause || new Date().toISOString();
            dossier.motifPause = s.motifPause || 'Ordre de fabrication mis en pause';
            const stmt = this.db.prepare(`
              UPDATE dossiers SET statut = 'EN_PAUSE', json_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `);
            stmt.run(JSON.stringify(dossier), dossier.id);
          }
        }
      }
    } else if (s.statut === 'EMIS' || s.statut === 'RETOUR_EN_ATTENTE') {
      // 2. Émission ou Reprise : dossier passe à 'EN_COURS' si tous ses OFs sont actifs
      const allOfs = this.getSuivisOF();
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
        const matchesId = s.dossierId && s.dossierId === dossier.id;

        if (matchesId || matchesCmd || matchesSub || (matchesClient && (dossier.statut === 'EN_ATTENTE' || dossier.statut === 'BROUILLON' || !dossier.statut))) {
          const otherPaused = allOfs.some(o => o.id !== s.id && (o.dossierId === dossier.id || cmdRefs.some(ref => (o.numCommande || '').toLowerCase().includes(ref))) && (o.statut === 'EN_PAUSE' || o.estEnPause));
          if (!otherPaused && (dossier.statut !== 'EN_COURS' && dossier.statut !== 'CLOTURE' && dossier.statut !== 'FABRIQUE' && dossier.statut !== 'LIVRE')) {
            dossier.statut = 'EN_COURS';
            dossier.estEnPause = false;
            dossier.datePause = undefined;
            const stmt = this.db.prepare(`
              UPDATE dossiers SET statut = 'EN_COURS', json_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `);
            stmt.run(JSON.stringify(dossier), dossier.id);
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
      // 1. Restituer les barres neuves et accessoires consommés + mise à jour statut article
      if ((m.type === 'SORTIE_BARRE_NEUVE' || m.type === 'SORTIE_ACCESSOIRE' || m.type === 'SORTIE_ARTICLE') && m.article_code) {
        const qte = m.quantite || 1;
        this.db.prepare(`
          UPDATE articles 
          SET stock_physique = stock_physique + ?,
              statut = CASE WHEN (stock_physique + ?) <= stock_min THEN 'ALERTE' ELSE 'NORMAL' END
          WHERE code_art = ?
        `).run(qte, qte, m.article_code);
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
              // Récupérer les métadonnées exactes de la maille débitée si sauvegardées dans la remarque [MAILLEDATA:dim:plis:id]
              let dim = m.longueur_mm;
              let plis = 0;
              let originalChuteId = m.chute_id;

              const matchData = m.remarque?.match(/\[MAILLEDATA:([\d.]+):(\d+)(?::([^\]]+))?\]/);
              if (matchData) {
                dim = parseFloat(matchData[1]) || m.longueur_mm;
                plis = parseInt(matchData[2], 10) || 0;
                if (matchData[3]) originalChuteId = matchData[3];
              }
              if (plis <= 0) {
                plis = Math.max(1, Math.round(dim / 20));
              }
              this.db.prepare(
                'INSERT INTO chutes_maille (id, dimension_fixe, plis) VALUES (?, ?, ?)'
              ).run(originalChuteId || `cht-m-rst-${Date.now()}-${Math.floor(Math.random() * 1000)}`, dim, plis);
            } else if (m.type === 'ENTREE_CHUTE') {
              // Annuler l'entrée de chute générée lors de la clôture
              let deleted = false;
              const matchCreatedId = m.remarque?.match(/\[CREATED_CHUTE_ID:([^\]]+)\]/);
              if (matchCreatedId && matchCreatedId[1]) {
                const info = this.db.prepare('DELETE FROM chutes_maille WHERE id = ?').run(matchCreatedId[1]);
                if (info.changes > 0) deleted = true;
              }
              if (!deleted) {
                const matchedMaille = this.db.prepare(
                  'SELECT id FROM chutes_maille WHERE ABS(dimension_fixe - ?) <= 1.0 ORDER BY ABS(dimension_fixe - ?) ASC LIMIT 1'
                ).get(m.longueur_mm, m.longueur_mm) as any;
                if (matchedMaille?.id) {
                  this.db.prepare('DELETE FROM chutes_maille WHERE id = ?').run(matchedMaille.id);
                }
              }
            }
          } else {
            // Profilés barres alu
            if (m.type === 'SORTIE_CHUTE') {
              // Récupérer l'identifiant exact de la chute débitée sauvegardé lors de closeOF
              let chuteIdToRestore = m.chute_id;
              const matchChute = m.remarque?.match(/\[CHUTEDATA:([^:]+):([\d.]+)\]/);
              if (matchChute && matchChute[1]) {
                chuteIdToRestore = matchChute[1];
              }

              let reinserted = false;
              if (chuteIdToRestore) {
                const existingById = this.db.prepare('SELECT id, quantite FROM chutes_barres WHERE id = ?').get(chuteIdToRestore) as any;
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
                  ).run(chuteIdToRestore || `cht-rst-${Date.now()}-${Math.floor(Math.random() * 1000)}`, sheetName, m.longueur_mm, quantite);
                }
              }
            } else if (m.type === 'ENTREE_CHUTE') {
              // Annuler l'entrée de nouvelle chute : cibler la chute créée via son ID ou par correspondance précise
              let deleted = false;
              const matchCreatedId = m.remarque?.match(/\[CREATED_CHUTE_ID:([^\]]+)\]/);
              if (matchCreatedId && matchCreatedId[1]) {
                const existing = this.db.prepare('SELECT rowid, id, quantite FROM chutes_barres WHERE id = ?').get(matchCreatedId[1]) as any;
                if (existing?.rowid) {
                  if (existing.quantite <= quantite) {
                    this.db.prepare('DELETE FROM chutes_barres WHERE rowid = ?').run(existing.rowid);
                  } else {
                    this.db.prepare('UPDATE chutes_barres SET quantite = quantite - ? WHERE rowid = ?').run(quantite, existing.rowid);
                  }
                  deleted = true;
                }
              }

              if (!deleted) {
                const matched = this.db.prepare(
                  'SELECT rowid, id, quantite FROM chutes_barres WHERE sheet_name = ? AND ABS(longueur - ?) <= 1.0 AND quantite > 0 ORDER BY ABS(longueur - ?) ASC LIMIT 1'
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

        // 1. Décompte des barres neuves et accessoires (Joues, bouchons, articles magasin) + mise à jour statut article
        if ((m.type === 'SORTIE_BARRE_NEUVE' || m.type === 'SORTIE_ACCESSOIRE' || m.type === 'SORTIE_ARTICLE') && m.articleCode) {
          const quantite = m.quantite || 1;
          this.db.prepare(`
            UPDATE articles 
            SET stock_physique = stock_physique - ?,
                statut = CASE WHEN (stock_physique - ?) <= stock_min THEN 'ALERTE' ELSE 'NORMAL' END
            WHERE code_art = ?
          `).run(quantite, quantite, m.articleCode);
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
                let matchedMaille: { id?: string; dimension_fixe?: number; plis?: number } | undefined;
                if (m.chuteId) {
                  matchedMaille = this.db.prepare(
                    'SELECT id, dimension_fixe, plis FROM chutes_maille WHERE id = ?'
                  ).get(m.chuteId) as { id?: string; dimension_fixe?: number; plis?: number } | undefined;
                }
                if (!matchedMaille) {
                  matchedMaille = this.db.prepare(
                    'SELECT id, dimension_fixe, plis FROM chutes_maille ORDER BY ABS(dimension_fixe - ?) ASC LIMIT 1'
                  ).get(m.longueurMm) as { id?: string; dimension_fixe?: number; plis?: number } | undefined;
                }

                if (matchedMaille?.id) {
                  const savedDim = matchedMaille.dimension_fixe || m.longueurMm;
                  const savedPlis = matchedMaille.plis || 0;
                  this.db.prepare(
                    "UPDATE mouvements_stock SET remarque = coalesce(remarque, '') || ' [MAILLEDATA:' || ? || ':' || ? || ':' || ? || ']' WHERE id = ?"
                  ).run(savedDim, savedPlis, matchedMaille.id, m.id);
                  this.db.prepare('DELETE FROM chutes_maille WHERE id = ?').run(matchedMaille.id);
                }
              } else if (m.type === 'ENTREE_CHUTE' && m.longueurMm > 0) {
                let plis = 0;
                const matchPlis = m.remarque?.match(/\[PLIS:(\d+)\]/);
                if (matchPlis) {
                  plis = parseInt(matchPlis[1], 10);
                }
                if (plis <= 0) {
                  plis = Math.max(1, Math.round(m.longueurMm / 20));
                }
                const newMailleId = `cht-m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                this.db.prepare(
                  'INSERT INTO chutes_maille (id, dimension_fixe, plis) VALUES (?, ?, ?)'
                ).run(newMailleId, m.longueurMm, plis);
                this.db.prepare(
                  "UPDATE mouvements_stock SET remarque = coalesce(remarque, '') || ' [CREATED_CHUTE_ID:' || ? || ']' WHERE id = ?"
                ).run(newMailleId, m.id);
              }
            } else {
              // Profilés Barres Aluminium
              if (m.type === 'SORTIE_CHUTE') {
                let matched: { rowid?: number; id?: string; quantite?: number; longueur?: number } | undefined;

                // 1. Recherche prioritaire par identifiant unique de chute
                if (m.chuteId) {
                  matched = this.db.prepare(
                    'SELECT rowid, id, quantite, longueur FROM chutes_barres WHERE id = ? AND quantite > 0'
                  ).get(m.chuteId) as { rowid?: number; id?: string; quantite?: number; longueur?: number } | undefined;
                }

                // 2. Recherche par longueur exacte (+/- 1.0mm)
                if (!matched) {
                  matched = this.db.prepare(
                    'SELECT rowid, id, quantite, longueur FROM chutes_barres WHERE sheet_name = ? AND ABS(longueur - ?) <= 1.0 AND quantite > 0 ORDER BY ABS(longueur - ?) ASC LIMIT 1'
                  ).get(sheetName, m.longueurMm, m.longueurMm) as { rowid?: number; id?: string; quantite?: number; longueur?: number } | undefined;
                }

                // 3. Recherche de tolérance de proximité (+/- 10mm)
                if (!matched) {
                  matched = this.db.prepare(
                    'SELECT rowid, id, quantite, longueur FROM chutes_barres WHERE sheet_name = ? AND ABS(longueur - ?) <= 10.0 AND quantite > 0 ORDER BY ABS(longueur - ?) ASC LIMIT 1'
                  ).get(sheetName, m.longueurMm, m.longueurMm) as { rowid?: number; id?: string; quantite?: number; longueur?: number } | undefined;
                }

                if (matched?.rowid) {
                  if (matched.id) {
                    this.db.prepare(
                      "UPDATE mouvements_stock SET remarque = coalesce(remarque, '') || ' [CHUTEDATA:' || ? || ':' || ? || ']' WHERE id = ?"
                    ).run(matched.id, matched.longueur || m.longueurMm, m.id);
                  }
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
                  this.db.prepare(
                    "UPDATE mouvements_stock SET remarque = coalesce(remarque, '') || ' [CREATED_CHUTE_ID:' || ? || ']' WHERE id = ?"
                  ).run(existingSameLg.id, m.id);
                } else {
                  const newChuteId = `cht-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                  this.db.prepare(
                    'INSERT INTO chutes_barres (id, sheet_name, longueur, quantite) VALUES (?, ?, ?, ?)'
                  ).run(newChuteId, sheetName, m.longueurMm, quantite);
                  this.db.prepare(
                    "UPDATE mouvements_stock SET remarque = coalesce(remarque, '') || ' [CREATED_CHUTE_ID:' || ? || ']' WHERE id = ?"
                  ).run(newChuteId, m.id);
                }
              }
            }
          }
        }
      }

      // Mise à jour de l'OF en statut CLOTURE
      this.internalUpsertSuiviOF(s);

      // Synchronisation intelligente et exhaustive des Dossiers de Commande
      this.synchroniserStatutsDossiersOF();

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
      // Synchronisation intelligente et exhaustive des Dossiers de Commande
      this.synchroniserStatutsDossiersOF();

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

      // Synchronisation des statuts dossiers
      this.synchroniserStatutsDossiersOF();

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

      // Synchronisation des statuts dossiers
      this.synchroniserStatutsDossiersOF();

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
      this.checkpointWal();
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
    this.checkpointWal();
  }

  deleteClientCodification(id: string) {
    this.db.prepare('DELETE FROM client_codifications WHERE id = ?').run(id);
    this.checkpointWal();
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

  createSilentBackup(customDir?: string, prefix?: string): {
    success: boolean;
    filename: string;
    fullPath: string;
    sizeBytes: number;
    timestamp: string;
    date: string;
    time: string;
  } {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (e) {
      console.warn('Checkpoint WAL avant sauvegarde:', e);
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const timeStr = `${hh}h${min}m${ss}`;

    const sanitizedPrefix = (prefix || '3m_atelier_backup').replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseFilename = `${sanitizedPrefix}_${dateStr}_${timeStr}.db`;

    const targetDir = customDir && customDir.trim().length > 0
      ? path.resolve(process.cwd(), customDir.trim())
      : path.resolve(process.cwd(), 'Sauvegardes_3M_Atelier');

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let finalFilename = baseFilename;
    let targetPath = path.join(targetDir, finalFilename);
    let counter = 1;
    while (fs.existsSync(targetPath)) {
      finalFilename = `${sanitizedPrefix}_${dateStr}_${timeStr}_${counter}.db`;
      targetPath = path.join(targetDir, finalFilename);
      counter++;
    }

    fs.copyFileSync(DB_PATH, targetPath);

    const stats = fs.statSync(targetPath);
    return {
      success: true,
      filename: finalFilename,
      fullPath: targetPath,
      sizeBytes: stats.size,
      timestamp: `${dateStr} ${hh}:${min}:${ss}`,
      date: dateStr,
      time: `${hh}:${min}:${ss}`
    };
  }

  listBackups(customDir?: string) {
    const targetDir = customDir && customDir.trim().length > 0
      ? path.resolve(process.cwd(), customDir.trim())
      : path.resolve(process.cwd(), 'Sauvegardes_3M_Atelier');

    if (!fs.existsSync(targetDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(targetDir);
      return files
        .filter(f => f.endsWith('.db') || f.endsWith('.json'))
        .map(f => {
          const fp = path.join(targetDir, f);
          const st = fs.statSync(fp);
          return {
            filename: f,
            fullPath: fp,
            sizeBytes: st.size,
            modifiedAt: st.mtime.toISOString(),
            isAuto: f.includes('backup')
          };
        })
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    } catch {
      return [];
    }
  }

  restoreRawDatabase(buffer: Buffer) {
    try {
      this.db.close();
    } catch (e) {
      console.warn('Fermeture préalable db:', e);
    }
    if (fs.existsSync(`${DB_PATH}-wal`)) {
      try { fs.unlinkSync(`${DB_PATH}-wal`); } catch {}
    }
    if (fs.existsSync(`${DB_PATH}-shm`)) {
      try { fs.unlinkSync(`${DB_PATH}-shm`); } catch {}
    }
    fs.writeFileSync(DB_PATH, buffer);
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA wal_autocheckpoint = 20;');
    this.initTables();
  }
}

// Instance Singleton
export const atelierDb = new AtelierDatabase();
