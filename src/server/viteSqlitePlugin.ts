import type { Plugin, ViteDevServer } from 'vite';
import { atelierDb } from './db';
import fs from 'fs';

// Ensemble des clients connectés au flux temps réel SSE (Server-Sent Events)
const sseClients = new Set<any>();
let heartbeatTimer: NodeJS.Timeout | null = null;

function ensureHeartbeat() {
  if (!heartbeatTimer && sseClients.size > 0) {
    heartbeatTimer = setInterval(() => {
      if (sseClients.size === 0) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        return;
      }
      for (const client of sseClients) {
        try {
          client.write(': ping\n\n');
        } catch {
          sseClients.delete(client);
        }
      }
    }, 20000);
    // unref() empêche ce timer d'empêcher le process Node de se terminer proprement lors du build Vite
    if (heartbeatTimer.unref) {
      heartbeatTimer.unref();
    }
  }
}

// Diffuseur d'événements temps réel à tous les clients connectés (écrans d'atelier, bureau d'études, etc.)
export function broadcastEvent(event: { type: string; target?: string; timestamp?: number; [key: string]: any }) {
  const payload = JSON.stringify({
    ...event,
    timestamp: event.timestamp || Date.now()
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Helper pour lire le corps JSON d'une requête HTTP native Node
function parseBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Corps de requête trop volumineux'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', (err: any) => reject(err));
  });
}

// Helper pour envoyer une réponse JSON
function sendJson(res: any, data: any, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.end(JSON.stringify(data));
}

export function sqlitePlugin(): Plugin {
  const handleApi = (server: ViteDevServer) => {
    server.middlewares.use(async (req, res, next) => {
      const rawUrl = req.url || '';
      const [pathname] = rawUrl.split('?');
      const url = pathname.replace(/\/+$/, '') || '/';
      const method = req.method || 'GET';

      // Intercepter uniquement les routes /api/*
      if (!url.startsWith('/api')) {
        return next();
      }

      // Configuration universelle des headers CORS pour tous les appels /api/* (y compris iframe AI Studio)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');

      if (method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      try {
        // --- 0. FLUX TEMPS RÉEL (SSE - SERVER-SENT EVENTS) ---
        if (url === '/api/events' && method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
          });
          res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now(), message: 'Flux temps réel 3M Atelier connecté' })}\n\n`);
          sseClients.add(res);
          ensureHeartbeat();
          req.on('close', () => {
            sseClients.delete(res);
          });
          return;
        }

        if (url === '/api/events/broadcast' && method === 'POST') {
          const body = await parseBody(req);
          broadcastEvent(body || { type: 'data_changed', target: 'all', timestamp: Date.now() });
          return sendJson(res, { success: true, clientsCount: sseClients.size });
        }

        // --- 1. TOUTES LES DONNÉES EN 1 APPEL RAPIDE ---
        if (url === '/api/data' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getAllData() });
        }

        // --- 2. SYNCHRONISATION / MIGRATION INITIALE ---
        if (url === '/api/sync/initial' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.fullSyncFromFrontend(body);
          broadcastEvent({ type: 'sync_initial', target: 'all' });
          return sendJson(res, { success: true, message: 'Données synchronisées avec succès dans SQLite' });
        }

        // --- 3. ARTICLES ---
        if (url === '/api/articles' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getArticles() });
        }
        if (url === '/api/articles' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveArticles(Array.isArray(body) ? body : body.articles || []);
          broadcastEvent({ type: 'articles_updated', target: 'articles' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/articles' && method === 'PUT') {
          const body = await parseBody(req);
          atelierDb.upsertArticle(body);
          broadcastEvent({ type: 'articles_updated', target: 'articles' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/articles/') && method === 'DELETE') {
          const code = decodeURIComponent(url.replace('/api/articles/', ''));
          atelierDb.deleteArticle(code);
          broadcastEvent({ type: 'articles_updated', target: 'articles' });
          return sendJson(res, { success: true });
        }

        // --- 4. CHUTES ---
        if (url === '/api/chutes/barres' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveChutesBarres(body);
          broadcastEvent({ type: 'chutes_updated', target: 'chutes' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/chutes/maille' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveChutesMaille(Array.isArray(body) ? body : []);
          broadcastEvent({ type: 'chutes_updated', target: 'chutes' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/chutes/create-family' && method === 'POST') {
          const body = await parseBody(req);
          if (!body?.name) {
            return sendJson(res, { error: 'Nom de famille requis' }, 400);
          }
          atelierDb.createChuteFamily(body.name);
          broadcastEvent({ type: 'chutes_updated', target: 'chutes' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/chutes/rename-sheet' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.renameChuteSheet(body.oldName, body.newName);
          broadcastEvent({ type: 'chutes_updated', target: 'chutes' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/chutes/sheet/') && method === 'DELETE') {
          const sheetName = decodeURIComponent(url.replace('/api/chutes/sheet/', ''));
          atelierDb.deleteChuteSheet(sheetName);
          broadcastEvent({ type: 'chutes_updated', target: 'chutes' });
          return sendJson(res, { success: true });
        }

        // --- 5. MAPPING ---
        if (url === '/api/mapping' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getMapping() });
        }
        if (url === '/api/mapping' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveMapping(body);
          broadcastEvent({ type: 'mapping_updated', target: 'mapping' });
          return sendJson(res, { success: true });
        }

        // --- 5b. PARAMÈTRES PRODUCTION & DÉLAIS ---
        if (url === '/api/settings/production' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getParametresProduction() });
        }
        if (url === '/api/settings/production' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveParametresProduction(body);
          broadcastEvent({ type: 'settings_updated', target: 'settings' });
          return sendJson(res, { success: true });
        }

        // --- 6. DOSSIERS ---
        if (url === '/api/dossiers' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getDossiers() });
        }
        if (url === '/api/dossiers' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveDossiers(Array.isArray(body) ? body : []);
          broadcastEvent({ type: 'dossiers_updated', target: 'dossiers' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/dossiers' && method === 'PUT') {
          const body = await parseBody(req);
          atelierDb.upsertDossier(body);
          broadcastEvent({ type: 'dossiers_updated', target: 'dossiers' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/dossiers/') && method === 'DELETE') {
          const id = decodeURIComponent(url.replace('/api/dossiers/', ''));
          atelierDb.deleteDossier(id);
          broadcastEvent({ type: 'dossiers_updated', target: 'dossiers' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/dossiers/synchroniser-statuts' && method === 'POST') {
          const resSync = atelierDb.synchroniserStatutsDossiersOF();
          broadcastEvent({ type: 'dossiers_updated', target: 'dossiers' });
          broadcastEvent({ type: 'of_updated', target: 'of' });
          return sendJson(res, { success: true, misAJour: resSync.misAJour, dossiers: atelierDb.getDossiers() });
        }

        // --- 7. SUIVIS OF ---
        if (url === '/api/of/reparer-familles' && method === 'POST') {
          const resReparation = atelierDb.reparerFamillesOF();
          broadcastEvent({ type: 'of_updated', target: 'of' });
          broadcastEvent({ type: 'dossiers_updated', target: 'dossiers' });
          return sendJson(res, { success: true, repares: resReparation.repares, data: atelierDb.getSuivisOF(), dossiers: atelierDb.getDossiers() });
        }
        if (url === '/api/of' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getSuivisOF() });
        }
        if (url === '/api/of' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveSuivisOF(Array.isArray(body) ? body : []);
          broadcastEvent({ type: 'of_updated', target: 'of' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/of' && method === 'PUT') {
          const body = await parseBody(req);
          atelierDb.upsertSuiviOF(body);
          broadcastEvent({ type: 'of_updated', target: 'of' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/of/close' && method === 'POST') {
          const body = await parseBody(req);
          if (!body?.suivi || !Array.isArray(body.mouvements)) {
            return sendJson(res, { error: 'Données de clôture OF invalides' }, 400);
          }
          atelierDb.closeOF(body.suivi, body.mouvements);
          broadcastEvent({ type: 'of_updated', target: 'of' });
          broadcastEvent({ type: 'stock_updated', target: 'stock' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/of/') && url.endsWith('/rollback-cloture') && method === 'POST') {
          const id = decodeURIComponent(url.replace('/api/of/', '').replace('/rollback-cloture', ''));
          atelierDb.rollbackClotureOF(id);
          broadcastEvent({ type: 'of_updated', target: 'of' });
          broadcastEvent({ type: 'stock_updated', target: 'stock' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/of/') && url.endsWith('/annuler') && method === 'POST') {
          const id = decodeURIComponent(url.replace('/api/of/', '').replace('/annuler', ''));
          atelierDb.annulerOF(id);
          broadcastEvent({ type: 'of_updated', target: 'of' });
          broadcastEvent({ type: 'stock_updated', target: 'stock' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/of/') && method === 'DELETE') {
          const id = decodeURIComponent(url.replace('/api/of/', ''));
          atelierDb.deleteSuiviOF(id);
          broadcastEvent({ type: 'of_updated', target: 'of' });
          return sendJson(res, { success: true });
        }

        // --- 8. MOUVEMENTS ---
        if (url === '/api/mouvements' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getMouvements() });
        }
        if (url === '/api/mouvements' && method === 'POST') {
          const body = await parseBody(req);
          if (Array.isArray(body)) {
            atelierDb.addMouvements(body);
          } else {
            atelierDb.addMouvement(body);
          }
          broadcastEvent({ type: 'stock_updated', target: 'stock' });
          return sendJson(res, { success: true });
        }

        // --- 9. CODIFICATIONS CLIENTS & PRÉFIXES ---
        if (url === '/api/codifications' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getClientCodifications() });
        }
        if (url === '/api/codifications' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveClientCodifications(Array.isArray(body) ? body : []);
          broadcastEvent({ type: 'codifications_updated', target: 'codifications' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/codifications' && method === 'PUT') {
          const body = await parseBody(req);
          atelierDb.upsertClientCodification(body);
          broadcastEvent({ type: 'codifications_updated', target: 'codifications' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/codifications/') && method === 'DELETE') {
          const id = decodeURIComponent(url.replace('/api/codifications/', ''));
          atelierDb.deleteClientCodification(id);
          broadcastEvent({ type: 'codifications_updated', target: 'codifications' });
          return sendJson(res, { success: true });
        }

        // --- 10. FICHES DE TRANSFERT & BONS DE LIVRAISON ---
        if (url === '/api/fiches-transfert' && method === 'GET') {
          return sendJson(res, { success: true, data: atelierDb.getFichesTransfert() });
        }
        if (url === '/api/fiches-transfert' && method === 'POST') {
          const body = await parseBody(req);
          atelierDb.saveFichesTransfert(Array.isArray(body) ? body : []);
          broadcastEvent({ type: 'fiches_updated', target: 'fiches' });
          return sendJson(res, { success: true });
        }
        if (url === '/api/fiches-transfert' && method === 'PUT') {
          const body = await parseBody(req);
          atelierDb.upsertFicheTransfert(body);
          broadcastEvent({ type: 'fiches_updated', target: 'fiches' });
          return sendJson(res, { success: true });
        }
        if (url.startsWith('/api/fiches-transfert/') && method === 'DELETE') {
          const id = decodeURIComponent(url.replace('/api/fiches-transfert/', ''));
          atelierDb.deleteFicheTransfert(id);
          broadcastEvent({ type: 'fiches_updated', target: 'fiches' });
          return sendJson(res, { success: true });
        }

        // --- 11. TÉLÉCHARGER LE FICHIER .DB PHYSIQUE ---
        if (url === '/api/db/download' && method === 'GET') {
          const dbPath = atelierDb.getDbFilePath();
          if (fs.existsSync(dbPath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'attachment; filename="3m_atelier.db"');
            const fileStream = fs.createReadStream(dbPath);
            return fileStream.pipe(res);
          } else {
            return sendJson(res, { error: 'Fichier base de données introuvable' }, 404);
          }
        }

        // --- 11 bis. SAUVEGARDE SILENCIEUSE SUR DISQUE SANS CONFIRMATION NI ÉCRASEMENT ---
        if (url === '/api/db/backup-silent' && method === 'POST') {
          const body = await parseBody(req);
          const backupInfo = atelierDb.createSilentBackup(body?.defaultPath, body?.prefix);
          broadcastEvent({ type: 'backup_created', target: 'all', data: backupInfo });
          return sendJson(res, backupInfo);
        }

        // --- 11 ter. LISTE DES SAUVEGARDES DISPONIBLES ---
        if (url === '/api/db/backups' && method === 'GET') {
          const list = atelierDb.listBackups();
          return sendJson(res, { success: true, backups: list });
        }

        // --- 12. VIDER COMPLÈTEMENT LA BASE SQLITE ---
        if (url === '/api/db/wipe' && method === 'POST') {
          atelierDb.wipeAllData();
          broadcastEvent({ type: 'database_wiped', target: 'all' });
          return sendJson(res, { success: true, message: 'Base de données SQLite vidée avec succès' });
        }

        // --- 13. RESTAURER UNE SAUVEGARDE SQLITE OU JSON ---
        if (url === '/api/db/restore' && method === 'POST') {
          const body = await parseBody(req);
          if (body?.format === 'raw' && body?.base64) {
            const buffer = Buffer.from(body.base64, 'base64');
            atelierDb.restoreRawDatabase(buffer);
            broadcastEvent({ type: 'database_restored', target: 'all' });
            return sendJson(res, { success: true, message: 'Base de données SQLite restaurée avec succès depuis le fichier .db' });
          } else if (body?.data || body?.articles) {
            const dataToSync = body.data || body;
            atelierDb.fullSyncFromFrontend(dataToSync);
            broadcastEvent({ type: 'sync_initial', target: 'all' });
            return sendJson(res, { success: true, message: 'Données restaurées avec succès depuis la sauvegarde JSON' });
          } else {
            return sendJson(res, { error: 'Format de sauvegarde non reconnu' }, 400);
          }
        }


        // Si aucune route ne correspond
        return sendJson(res, { error: 'Route API non trouvée' }, 404);
      } catch (err: any) {
        console.error('❌ [API SQLite Error]', err);
        return sendJson(res, { error: err.message || 'Erreur serveur SQLite' }, 500);
      }
    });
  };

  return {
    name: 'vite-plugin-sqlite',
    configureServer(server) {
      handleApi(server);
    },
    configurePreviewServer(server: any) {
      handleApi(server);
    }
  };
}
