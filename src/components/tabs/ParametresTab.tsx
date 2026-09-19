import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings,
  Users,
  Clock,
  Building2,
  Link,
  Unlink,
  Database,
  SlidersHorizontal,
  HardDriveDownload,
  UploadCloud,
  Trash2,
  Save,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Check,
  Plus,
  Edit2,
  KeyRound,
  Shield,
  Layers,
  Info,
  Calendar,
  Eye,
  RefreshCw,
  FolderOpen,
  Terminal
} from 'lucide-react';
import { SystemLogsViewer } from '../common/SystemLogsViewer';
import {
  Article,
  ChuteItem,
  ChuteMaille,
  MappingChutes,
  ClientCodification,
  UserProfile,
  UserRole,
  UserPermissions,
  ParametresProductionAtelier,
  FamilleProduit
} from '../../types';
import { StorageService } from '../../services/storage';
import { userService, ROLE_CONFIG, DEFAULT_PERMISSIONS_BY_ROLE } from '../../services/userService';
import {
  DelaisProductionService,
  PARAMETRES_PRODUCTION_DEFAUT,
  NOMS_JOURS_SEMAINE
} from '../../services/delaisProductionService';
import { columnConfigService, TABLE_COLUMNS_DEFINITIONS, TableId } from '../../services/columnConfigService';
import { autoBackupService, BackupSettings } from '../../services/autoBackupService';
import { genererRepereCaissonSousFace } from '../../services/codificationService';
import { INITIAL_CLIENT_CODIFICATIONS } from '../../data/initialCodifications';
import { logger } from '../../services/logger';

interface ParametresTabProps {
  articles: Article[];
  chutesBarres: Record<string, ChuteItem[]>;
  chutesMaille: ChuteMaille[];
  mapping: MappingChutes;
  clientCodifications: ClientCodification[];
  onRefreshData: () => void;
}

type ParamSubTab =
  | 'utilisateurs'
  | 'cadences'
  | 'codification'
  | 'mappage'
  | 'colonnes'
  | 'sauvegarde'
  | 'restauration'
  | 'logs'
  | 'vidage';

export const ParametresTab: React.FC<ParametresTabProps> = ({
  articles = [],
  chutesBarres = {},
  chutesMaille = [],
  mapping = {},
  clientCodifications = [],
  onRefreshData
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ParamSubTab>('sauvegarde');

  // =========================================================================
  // 1. ÉTAT GESTION UTILISATEURS & PERMISSIONS
  // =========================================================================
  const [operators, setOperators] = useState<UserProfile[]>([]);
  const [activeOperator, setActiveOperator] = useState<UserProfile>(userService.getActiveOperator());
  const [userTabMode, setUserTabMode] = useState<'profils' | 'permissions'>('profils');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserNom, setEditUserNom] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('ATELIER');
  const [editUserPoste, setEditUserPoste] = useState('');

  const [isAddingNewUser, setIsAddingNewUser] = useState(false);
  const [newUserNom, setNewUserNom] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('ATELIER');
  const [newUserPoste, setNewUserPoste] = useState('');

  const [selectedUserForPerms, setSelectedUserForPerms] = useState<string>('');
  const [currentPerms, setCurrentPerms] = useState<UserPermissions>(userService.getUserPermissions());
  const [currentPin, setCurrentPin] = useState<string>('');
  const [isPinSecurityEnabled, setIsPinSecurityEnabled] = useState<boolean>(userService.isSecurityPinEnabled());
  const [userNotification, setUserNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const refreshOperatorsList = () => {
    const list = userService.getOperators();
    setOperators(list);
    const active = userService.getActiveOperator();
    setActiveOperator(active);
    if (!selectedUserForPerms && list.length > 0) {
      setSelectedUserForPerms(active.id);
      setCurrentPerms(userService.getUserPermissions(active));
      setCurrentPin(active.pinCode || '');
    }
  };

  useEffect(() => {
    refreshOperatorsList();
    const unsub = userService.onOperatorChange(() => {
      refreshOperatorsList();
    });
    return unsub;
  }, []);

  const handleSelectUserForPerms = (userId: string) => {
    setSelectedUserForPerms(userId);
    const u = operators.find(o => o.id === userId);
    if (u) {
      setCurrentPerms(userService.getUserPermissions(u));
      setCurrentPin(u.pinCode || '');
    }
  };

  const handleSavePermissions = () => {
    if (!selectedUserForPerms) return;
    userService.updatePermissions(selectedUserForPerms, currentPerms);
    if (currentPin) {
      userService.setUserPin(selectedUserForPerms, currentPin);
    }
    setUserNotification({ type: 'success', message: 'Permissions et code PIN enregistrés avec succès !' });
    setTimeout(() => setUserNotification(null), 3000);
    refreshOperatorsList();
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserNom.trim()) return;
    userService.addOperator(newUserNom, newUserRole, newUserPoste);
    setNewUserNom('');
    setNewUserPoste('');
    setIsAddingNewUser(false);
    refreshOperatorsList();
    setUserNotification({ type: 'success', message: 'Nouvel opérateur créé avec succès !' });
    setTimeout(() => setUserNotification(null), 3000);
  };

  const handleSaveEditUser = (userId: string) => {
    userService.updateOperator(userId, {
      nom: editUserNom,
      role: editUserRole,
      poste: editUserPoste
    });
    setEditingUserId(null);
    refreshOperatorsList();
  };

  const handleDeleteUser = (userId: string) => {
    if (operators.length <= 1) {
      setUserNotification({ type: 'error', message: 'Impossible de supprimer le dernier opérateur du système.' });
      return;
    }
    userService.deleteOperator(userId);
    refreshOperatorsList();
  };

  // =========================================================================
  // 2. ÉTAT CADENCES & DÉLAIS DE PRODUCTION
  // =========================================================================
  const [prodParams, setProdParams] = useState<ParametresProductionAtelier>(() =>
    DelaisProductionService.getParametres()
  );
  const [isSavingProdParams, setIsSavingProdParams] = useState<boolean>(false);
  const [prodParamsSuccess, setProdParamsSuccess] = useState<boolean>(false);

  useEffect(() => {
    DelaisProductionService.loadParametresFromDb().then(p => {
      setProdParams(p);
    });
  }, []);

  const handleSaveProdParams = async () => {
    setIsSavingProdParams(true);
    setProdParamsSuccess(false);
    try {
      await DelaisProductionService.saveParametres(prodParams);
      setProdParamsSuccess(true);
      setTimeout(() => setProdParamsSuccess(false), 3000);
      onRefreshData();
    } catch (e: any) {
      alert('Erreur lors de la sauvegarde : ' + e.message);
    } finally {
      setIsSavingProdParams(false);
    }
  };

  const toggleJourOuvre = (jourIndex: number) => {
    setProdParams(prev => {
      const exists = prev.joursOuvres.includes(jourIndex);
      let updated: number[];
      if (exists) {
        if (prev.joursOuvres.length <= 1) return prev;
        updated = prev.joursOuvres.filter(j => j !== jourIndex);
      } else {
        updated = [...prev.joursOuvres, jourIndex].sort((a, b) => a - b);
      }
      return { ...prev, joursOuvres: updated };
    });
  };

  // =========================================================================
  // 3. ÉTAT CODIFICATION CLIENTS & AGENCES
  // =========================================================================
  const [codifs, setCodifs] = useState<ClientCodification[]>(clientCodifications);
  const [editingCodifId, setEditingCodifId] = useState<string | null>(null);
  const [editCodifForm, setEditCodifForm] = useState<Partial<ClientCodification>>({});
  const [isAddingNewCodif, setIsAddingNewCodif] = useState<boolean>(false);
  const [newCodifForm, setNewCodifForm] = useState<Partial<ClientCodification>>({
    nom: '',
    code: '',
    prefixeCommande: '',
    prefixeRepereSpecial: '',
    type: 'AUTRE',
    description: '',
    actif: true,
    peintureParDefaut: false,
    montageSousFaceParDefaut: true,
    avecPlaqueParDefaut: false
  });
  const [testClientNom, setTestClientNom] = useState<string>('SARL MCB ALUMINIUM');
  const [testAgence, setTestAgence] = useState<string>(codifs[0]?.nom || 'SOMODAL Alger');

  useEffect(() => {
    setCodifs(clientCodifications);
  }, [clientCodifications]);

  const handleSaveCodif = async (c: ClientCodification) => {
    try {
      await StorageService.upsertClientCodification(c);
      setEditingCodifId(null);
      onRefreshData();
    } catch (e: any) {
      alert('Erreur: ' + e.message);
    }
  };

  const handleCreateCodif = async () => {
    if (!newCodifForm.nom?.trim() || !newCodifForm.code?.trim()) {
      alert('Le nom et le code agence sont obligatoires.');
      return;
    }
    const created: ClientCodification = {
      id: `codif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nom: newCodifForm.nom.trim(),
      code: newCodifForm.code.trim().toUpperCase(),
      prefixeCommande: (newCodifForm.prefixeCommande || newCodifForm.code).trim().toUpperCase(),
      prefixeRepereSpecial: newCodifForm.prefixeRepereSpecial?.trim().toUpperCase() || '',
      type: (newCodifForm.type || 'AUTRE') as any,
      description: newCodifForm.description?.trim() || '',
      actif: newCodifForm.actif ?? true,
      peintureParDefaut: newCodifForm.peintureParDefaut ?? false,
      montageSousFaceParDefaut: newCodifForm.montageSousFaceParDefaut ?? true,
      avecPlaqueParDefaut: newCodifForm.avecPlaqueParDefaut ?? false
    };

    try {
      await StorageService.upsertClientCodification(created);
      setIsAddingNewCodif(false);
      setNewCodifForm({
        nom: '',
        code: '',
        prefixeCommande: '',
        prefixeRepereSpecial: '',
        type: 'AUTRE',
        description: '',
        actif: true,
        peintureParDefaut: false,
        montageSousFaceParDefaut: true,
        avecPlaqueParDefaut: false
      });
      onRefreshData();
    } catch (e: any) {
      alert('Erreur création: ' + e.message);
    }
  };

  const handleDeleteCodif = async (id: string) => {
    if (confirm('Supprimer cette codification client ?')) {
      try {
        await StorageService.deleteClientCodification(id);
        onRefreshData();
      } catch (e: any) {
        alert('Erreur suppression: ' + e.message);
      }
    }
  };

  const handleResetDefaultCodifs = async () => {
    if (confirm('Restaurer les agences officielles par défaut (SOMODAL, CRISTAL, ATELIER) ?')) {
      try {
        await StorageService.saveClientCodifications(INITIAL_CLIENT_CODIFICATIONS);
        onRefreshData();
      } catch (e: any) {
        alert('Erreur: ' + e.message);
      }
    }
  };

  // =========================================================================
  // 4. ÉTAT MAPPAGE CHUTES & PROFILÉS
  // =========================================================================
  const allSheets = useMemo(() => {
    return Object.keys(chutesBarres);
  }, [chutesBarres]);

  const mappingBySheet = useMemo(() => {
    const rev: Record<string, string> = {};
    for (const [codeArt, sheet] of Object.entries(mapping)) {
      rev[sheet] = codeArt;
    }
    return rev;
  }, [mapping]);

  const [selectedArtForMapping, setSelectedArtForMapping] = useState<string>(articles[0]?.code_art || '');
  const [selectedSheetForMapping, setSelectedSheetForMapping] = useState<string>(allSheets[0] || '');
  const [mappingSearchFilter, setMappingSearchFilter] = useState('');
  const [mappingNotification, setMappingNotification] = useState<string | null>(null);

  const handleLinkArticleToSheet = async (codeArt: string, sheetName: string) => {
    if (!codeArt || !sheetName) return;
    const newMapping: MappingChutes = { ...mapping };
    // Si la feuille était déjà liée à un autre article, la libérer
    for (const [art, s] of Object.entries(newMapping)) {
      if (s === sheetName) {
        delete newMapping[art];
      }
    }
    newMapping[codeArt] = sheetName;
    await StorageService.saveMapping(newMapping);
    setMappingNotification(`Liaison enregistrée : [${codeArt}] ↔ "${sheetName}"`);
    setTimeout(() => setMappingNotification(null), 3000);
    onRefreshData();
  };

  const handleUnlinkArticle = async (codeArt: string) => {
    const newMapping: MappingChutes = { ...mapping };
    delete newMapping[codeArt];
    await StorageService.saveMapping(newMapping);
    setMappingNotification(`Article ${codeArt} délié.`);
    setTimeout(() => setMappingNotification(null), 3000);
    onRefreshData();
  };

  const handleAutoMapping = async () => {
    const newMapping: MappingChutes = { ...mapping };
    let linked = 0;

    for (const art of articles) {
      if (newMapping[art.code_art]) continue;
      const desig = art.designation.toUpperCase();

      const matchedSheet = allSheets.find(s => {
        const sClean = s.toUpperCase();
        return (
          desig.includes(sClean) ||
          sClean.includes(desig) ||
          (sClean.includes('LAME') && desig.includes('LAME')) ||
          (sClean.includes('COULISSE') && desig.includes('COULISSE'))
        );
      });

      if (matchedSheet && !Object.values(newMapping).includes(matchedSheet)) {
        newMapping[art.code_art] = matchedSheet;
        linked++;
      }
    }

    await StorageService.saveMapping(newMapping);
    setMappingNotification(`Auto-liaison terminée : ${linked} profilé(s) associé(s) intelligemment.`);
    setTimeout(() => setMappingNotification(null), 4000);
    onRefreshData();
  };

  const handleClearAllMappings = async () => {
    if (confirm('Voulez-vous supprimer toutes les liaisons articles ↔ chutes ?')) {
      await StorageService.saveMapping({});
      onRefreshData();
    }
  };

  // =========================================================================
  // 5. ÉTAT PERSONNALISATION DES COLONNES DES BROWSERS
  // =========================================================================
  const [, setColumnsTick] = useState(0);

  useEffect(() => {
    const unsub = columnConfigService.subscribe(() => {
      setColumnsTick(t => t + 1);
    });
    return unsub;
  }, []);

  const [selectedBrowserTable, setSelectedBrowserTable] = useState<TableId>('articles');

  // =========================================================================
  // 6. ÉTAT SAUVEGARDE, PROGRAMMATION & RESTAURATION
  // =========================================================================
  const [backupSettings, setBackupSettings] = useState<BackupSettings>(() =>
    autoBackupService.getSettings()
  );
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);
  const [isBackupRunning, setIsBackupRunning] = useState(false);

  useEffect(() => {
    const unsub = autoBackupService.subscribe(newSettings => {
      setBackupSettings(newSettings);
    });
    return unsub;
  }, []);

  const handleTriggerManualBackup = async (format: 'db' | 'json') => {
    setIsBackupRunning(true);
    setBackupStatusMessage(null);
    try {
      autoBackupService.updateSettings({ backupFormat: format });
      await autoBackupService.executeBackup(false);
      setBackupStatusMessage(`Sauvegarde ${format.toUpperCase()} téléchargée avec succès.`);
      setTimeout(() => setBackupStatusMessage(null), 4000);
    } catch (e: any) {
      setBackupStatusMessage(`Erreur sauvegarde : ${e.message}`);
    } finally {
      setIsBackupRunning(false);
    }
  };

  // Restauration
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setRestoreFile(f);
      setRestoreStatus(null);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreFile) return;

    const isRaw = restoreFile.name.endsWith('.db');
    const isJson = restoreFile.name.endsWith('.json');

    if (!isRaw && !isJson) {
      alert('Format non pris en charge. Veuillez sélectionner un fichier .db SQLite ou .json.');
      return;
    }

    if (!confirm(`⚠️ ATTENTION : La restauration remplacera toutes les données actuelles de l'application par celles du fichier "${restoreFile.name}". Continuer ?`)) {
      return;
    }

    setIsRestoring(true);
    setRestoreStatus('Restauration en cours dans la base SQLite...');

    try {
      if (isRaw) {
        await StorageService.restoreDatabaseFromRawFile(restoreFile);
      } else {
        await StorageService.restoreDatabaseFromJsonFile(restoreFile);
      }
      setRestoreStatus('✅ Restauration effectuée avec succès ! Les données ont été actualisées.');
      setRestoreFile(null);
      setTimeout(() => {
        onRefreshData();
      }, 1000);
    } catch (e: any) {
      console.error(e);
      setRestoreStatus('❌ Échec de la restauration : ' + e.message);
    } finally {
      setIsRestoring(false);
    }
  };

  // Vidage Base
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [wipeStatus, setWipeStatus] = useState<string | null>(null);

  const handleWipeDatabase = async () => {
    if (wipeConfirmText !== 'VIDER LA BASE') {
      alert('Veuillez saisir exactement "VIDER LA BASE" pour confirmer.');
      return;
    }

    setIsWiping(true);
    setWipeStatus(null);

    try {
      await StorageService.wipeDatabase();
      setWipeStatus('Base SQLite vidée avec succès. Toutes les tables sont réinitialisées.');
      setWipeConfirmText('');
      setTimeout(() => {
        onRefreshData();
      }, 1000);
    } catch (e: any) {
      setWipeStatus('Erreur vidage : ' + e.message);
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Paramètres & Navigation Subtabs */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-100 flex items-center gap-2">
                <span>Centre de Configuration & Paramètres</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  SQLite Central
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Regroupement centralisé de tous les paramètres de l'atelier pour libérer l'espace des écrans de production.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Opérateur actif :</span>
            <span className="font-bold text-amber-300 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
              {activeOperator.nom} ({activeOperator.role})
            </span>
          </div>
        </div>

        {/* Barre de navigation des sous-onglets */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setActiveSubTab('sauvegarde')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'sauvegarde'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <HardDriveDownload className="w-3.5 h-3.5" />
            <span>💾 Sauvegarde & Auto (16h30)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('restauration')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'restauration'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>🔄 Restauration Sauvegarde</span>
          </button>

          <button
            onClick={() => setActiveSubTab('colonnes')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'colonnes'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>🎛️ Colonnes des Tableaux</span>
          </button>

          <button
            onClick={() => setActiveSubTab('utilisateurs')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'utilisateurs'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>👥 Utilisateurs & PIN</span>
          </button>

          <button
            onClick={() => setActiveSubTab('cadences')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'cadences'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>⏱️ Cadences & Délais</span>
          </button>

          <button
            onClick={() => setActiveSubTab('codification')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'codification'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>🏢 Codification Clients</span>
          </button>

          <button
            onClick={() => setActiveSubTab('mappage')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'mappage'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>🔗 Mappage Chutes</span>
          </button>

          <button
            onClick={() => setActiveSubTab('logs')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'logs'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>📜 Logs &amp; Traçabilité</span>
          </button>

          <button
            onClick={() => setActiveSubTab('vidage')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer ${
              activeSubTab === 'vidage'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'bg-slate-950 text-rose-300 hover:text-white border border-rose-900/50 hover:border-rose-700'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>⚠️ Vidage Base</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 1. SECTION SAUVEGARDE & PROGRAMMATION AUTO JOURNALIÈRE (16h30)      */}
      {/* =================================================================== */}
      {activeSubTab === 'sauvegarde' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Card Configuration Programmation Automatique */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Programmation de la Sauvegarde Automatique Journalière</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Planifiez l'export automatique quotidien de la base de données (ex : chaque jour à 16h30).
              </p>
            </div>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800 bg-slate-950 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-200">Activer la sauvegarde automatique</div>
                  <div className="text-[11px] text-slate-400">
                    Déclenche la sauvegarde automatiquement sans intervention de l'opérateur
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={backupSettings.enabled}
                  onChange={(e) => autoBackupService.updateSettings({ enabled: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Heure programmée :
                  </label>
                  <input
                    type="time"
                    value={backupSettings.scheduledTime}
                    onChange={(e) => autoBackupService.updateSettings({ scheduledTime: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-mono font-bold focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Par défaut : 16:30 (fin de shift)
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Format de sauvegarde :
                  </label>
                  <select
                    value={backupSettings.backupFormat}
                    onChange={(e) => autoBackupService.updateSettings({ backupFormat: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="db">Fichier SQLite Brut (.db) — Recommandé</option>
                    <option value="json">Format JSON Complet (.json)</option>
                  </select>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Compatible avec la restauration directe
                  </span>
                </div>
              </div>

              {/* Chemin par défaut */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dossier / Chemin de sauvegarde par défaut :</span>
                </label>
                <input
                  type="text"
                  value={backupSettings.defaultPath}
                  onChange={(e) => autoBackupService.updateSettings({ defaultPath: e.target.value })}
                  placeholder="ex : D:\Sauvegardes_3M_Atelier\"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Nom du dossier ou étiquette locale pour le classement des archives de production.
                </p>
              </div>

              {/* État de la dernière sauvegarde */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Statut de la planification quotidienne :</span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  {backupSettings.lastBackupDate ? (
                    <>
                      Dernière sauvegarde automatique effectuée le{' '}
                      <span className="font-mono font-bold text-amber-300">{backupSettings.lastBackupDate}</span> à{' '}
                      <span className="font-mono font-bold text-amber-300">{backupSettings.lastBackupTime || '16:30'}</span>.
                    </>
                  ) : (
                    'Aucune sauvegarde automatique enregistrée aujourd\'hui.'
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  Prochaine exécution automatique prévue : Aujourd'hui à {backupSettings.scheduledTime}.
                </div>
              </div>
            </div>
          </div>

          {/* Card Sauvegarde Manuelle Immédiate */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <HardDriveDownload className="w-4 h-4 text-emerald-400" />
                  <span>Sauvegarde Manuelle Immédiate</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Exportez instantanément l'intégralité de la base de données sans attendre l'heure programmée.
                </p>
              </div>

              {backupStatusMessage && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{backupStatusMessage}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-100">Fichier physique SQLite (.db)</div>
                    <div className="text-[11px] text-slate-400">
                      Télécharge le fichier <code>3m_atelier.db</code> réel contenant toutes les tables.
                    </div>
                  </div>
                  <button
                    onClick={() => handleTriggerManualBackup('db')}
                    disabled={isBackupRunning}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {isBackupRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <HardDriveDownload className="w-3.5 h-3.5" />}
                    <span>Télécharger .DB</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-100">Export JSON Structuré (.json)</div>
                    <div className="text-[11px] text-slate-400">
                      Archive complète au format JSON lisible (articles, chutes, dossiers, OFs).
                    </div>
                  </div>
                  <button
                    onClick={() => handleTriggerManualBackup('json')}
                    disabled={isBackupRunning}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                    <span>Exporter JSON</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400">
              💡 <strong>Astuce sécurité :</strong> Il est recommandé de stocker les fichiers de sauvegarde sur une clé USB ou un disque réseau distinct du poste atelier.
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. SECTION RESTAURATION D'UNE SAUVEGARDE                            */}
      {/* =================================================================== */}
      {activeSubTab === 'restauration' && (
        <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-amber-400" />
              <span>Restauration de la Base de Données</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Restaurez toutes vos données d'atelier à partir d'un fichier de sauvegarde physique (<code>.db</code>) ou d'une archive JSON (<code>.json</code>).
            </p>
          </div>

          <input
            ref={restoreInputRef}
            type="file"
            accept=".db,.json"
            onChange={handleRestoreFileSelected}
            style={{ display: 'none' }}
          />

          {!restoreFile && (
            <div
              onClick={() => restoreInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-2xl p-10 text-center bg-slate-950/40 cursor-pointer transition space-y-3"
            >
              <UploadCloud className="w-12 h-12 text-amber-400/60 mx-auto" />
              <div className="text-xs font-bold text-slate-200">
                Cliquez pour sélectionner le fichier de sauvegarde (<code>3m_atelier.db</code> ou <code>.json</code>)
              </div>
              <p className="text-[11px] text-slate-500">
                Formats acceptés : SQLite Database (<code>.db</code>) et Exports JSON 3M Atelier (<code>.json</code>)
              </p>
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                Parcourir mes sauvegardes
              </button>
            </div>
          )}

          {restoreFile && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-amber-300 font-mono">{restoreFile.name}</div>
                  <div className="text-[11px] text-slate-400">
                    Taille : {(restoreFile.size / 1024).toFixed(1)} Ko • Type : {restoreFile.name.endsWith('.db') ? 'Base SQLite Physique' : 'Archive JSON'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRestoreFile(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Changer de fichier
                </button>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Avertissement important</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Cette opération va écraser les données actuelles de la base SQLite et recharger la configuration à partir du fichier sélectionné.
                </p>
              </div>

              {restoreStatus && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold text-slate-200">
                  {restoreStatus}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRestoreFile(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={isRestoring}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {isRestoring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  <span>Restaurer Maintenant</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. SECTION PERSONNALISATION DES COLONNES DES BROWSERS               */}
      {/* =================================================================== */}
      {activeSubTab === 'colonnes' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span>Personnalisation des Colonnes de Consultation (Browsers)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Choisissez précisément les colonnes visibles sur chaque tableau de l'application selon vos préférences d'affichage.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  columnConfigService.resetAll();
                  setColumnsTick(t => t + 1);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Tout réinitialiser par défaut</span>
              </button>
            </div>
          </div>

          {/* Choix du tableau à configurer */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TABLE_COLUMNS_DEFINITIONS) as TableId[]).map(tId => {
              const def = TABLE_COLUMNS_DEFINITIONS[tId];
              const isSelected = selectedBrowserTable === tId;
              const visible = def.columns.filter(c => columnConfigService.isColumnVisible(tId, c.id)).length;

              return (
                <button
                  key={tId}
                  onClick={() => setSelectedBrowserTable(tId)}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{def.title.replace('Tableau des ', '')}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {visible}/{def.columns.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Grille des colonnes du tableau sélectionné */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                <span>Colonnes configurables pour : {TABLE_COLUMNS_DEFINITIONS[selectedBrowserTable]?.title}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-normal text-slate-400">
                <button
                  onClick={() => columnConfigService.setAllColumns(selectedBrowserTable, true)}
                  className="hover:text-amber-300 underline cursor-pointer"
                >
                  Tout cocher
                </button>
                <span>•</span>
                <button
                  onClick={() => columnConfigService.resetTable(selectedBrowserTable)}
                  className="hover:text-amber-300 underline cursor-pointer"
                >
                  Rétablir défaut
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
              {TABLE_COLUMNS_DEFINITIONS[selectedBrowserTable]?.columns.map(col => {
                const isVisible = columnConfigService.isColumnVisible(selectedBrowserTable, col.id);
                const isAction = col.id === 'actions';

                return (
                  <label
                    key={col.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none text-xs ${
                      isVisible
                        ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800/60 text-slate-500'
                    } ${isAction ? 'opacity-70 cursor-not-allowed' : 'hover:border-amber-500/50'}`}
                  >
                    <span className="font-semibold truncate pr-2">{col.label}</span>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      disabled={isAction}
                      onChange={() => {
                        if (!isAction) {
                          columnConfigService.toggleColumn(selectedBrowserTable, col.id);
                        }
                      }}
                      className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. SECTION UTILISATEURS & PERMISSIONS                               */}
      {/* =================================================================== */}
      {activeSubTab === 'utilisateurs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <span>Gestion des Profils Opérateurs & Sécurité PIN</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configurez les rôles (Responsable, Atelier, Commercial), les codes secrets PIN et les autorisations d'onglets.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setUserTabMode('profils')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  userTabMode === 'profils' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Profils ({operators.length})
              </button>
              <button
                onClick={() => setUserTabMode('permissions')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  userTabMode === 'permissions' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Permissions & PIN
              </button>
            </div>
          </div>

          {userNotification && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              userNotification.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/60 border border-rose-500/50 text-rose-200'
            }`}>
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>{userNotification.message}</span>
            </div>
          )}

          {userTabMode === 'profils' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {operators.map(op => {
                  const roleCfg = ROLE_CONFIG[op.role];
                  const isActive = activeOperator.id === op.id;

                  return (
                    <div
                      key={op.id}
                      className={`p-4 rounded-xl border bg-slate-950 transition relative space-y-3 ${
                        isActive ? 'border-purple-500 shadow-md shadow-purple-500/10' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${op.avatarColor || 'from-slate-700 to-slate-900'} flex items-center justify-center font-bold text-xs text-white shadow`}>
                            {op.initiales}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{op.nom}</span>
                              {isActive && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  Actif
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">{op.poste}</div>
                          </div>
                        </div>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleCfg.badgeClasses}`}>
                          {roleCfg.badgeLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-900">
                        <span className="text-slate-500 font-mono">PIN : {op.pinCode ? '••••' : 'Non défini'}</span>
                        <div className="flex items-center gap-1">
                          {!isActive && (
                            <button
                              onClick={() => {
                                userService.setActiveOperator(op.id);
                                refreshOperatorsList();
                              }}
                              className="px-2 py-1 text-[10px] font-bold bg-slate-800 hover:bg-purple-600 text-slate-200 hover:text-white rounded cursor-pointer transition"
                            >
                              Activer
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedUserForPerms(op.id);
                              setCurrentPerms(userService.getUserPermissions(op));
                              setCurrentPin(op.pinCode || '');
                              setUserTabMode('permissions');
                            }}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
                            title="Configurer permissions"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {operators.length > 1 && (
                            <button
                              onClick={() => handleDeleteUser(op.id)}
                              className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded cursor-pointer"
                              title="Supprimer cet opérateur"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Formulaire ajout opérateur */}
              {!isAddingNewUser ? (
                <button
                  onClick={() => setIsAddingNewUser(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-purple-400" />
                  <span>Ajouter un opérateur</span>
                </button>
              ) : (
                <form onSubmit={handleCreateUser} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-slate-200">Créer un nouvel opérateur :</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Nom complet :</label>
                      <input
                        type="text"
                        required
                        value={newUserNom}
                        onChange={e => setNewUserNom(e.target.value)}
                        placeholder="ex : Amine S."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Rôle atelier :</label>
                      <select
                        value={newUserRole}
                        onChange={e => setNewUserRole(e.target.value as UserRole)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                      >
                        <option value="RESPONSABLE">Responsable Atelier / Admin</option>
                        <option value="ATELIER">Opérateur Atelier / Découpe</option>
                        <option value="COMMERCIAL">Commercial / Bureau d'Études</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Poste :</label>
                      <input
                        type="text"
                        value={newUserPoste}
                        onChange={e => setNewUserPoste(e.target.value)}
                        placeholder="ex : Scie & Tronçonneuse"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingNewUser(false)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Créer l'opérateur
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Permissions & PIN */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">Choisir l'opérateur à configurer :</span>
                {operators.map(o => (
                  <button
                    key={o.id}
                    onClick={() => handleSelectUserForPerms(o.id)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition ${
                      selectedUserForPerms === o.id
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {o.nom}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Checkboxes des onglets autorisés */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-purple-400" />
                    <span>Onglets autorisés pour cet utilisateur</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {[
                      { key: 'tabMonitoring', label: '📊 Monitoring Atelier' },
                      { key: 'tabEcosysteme', label: '📁 Écosystème & Commandes' },
                      { key: 'tabEncours', label: '📋 Ordres en Cours (OF)' },
                      { key: 'tabHistorique', label: '📜 Historique Commandes' },
                      { key: 'tabStock', label: '📦 Gestion Stock & Chutes' },
                      { key: 'tabDevis', label: '💰 Devis & Coûts' },
                      { key: 'tabDocumentation', label: '📘 Règles Métier' },
                      { key: 'tabParametres', label: '⚙️ Paramètres de l\'Atelier' }
                    ].map(tab => (
                      <label key={tab.key} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                        <span className="text-slate-200">{tab.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean((currentPerms as any)[tab.key])}
                          onChange={e => setCurrentPerms(prev => ({ ...prev, [tab.key]: e.target.checked }))}
                          className="rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-0 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Actions sensibles & Code PIN */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                  <div>
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-2">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>Code secret PIN de l'opérateur</span>
                    </div>
                    <input
                      type="text"
                      maxLength={8}
                      value={currentPin}
                      onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="ex : 1234"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-amber-300 focus:border-purple-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Code à 4 chiffres utilisé pour déverrouiller la session ou valider des clôtures d'OF.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-900 space-y-2">
                    <div className="text-xs font-bold text-slate-200">Droits opérationnels spécifiques :</div>
                    {[
                      { key: 'canCloseOF', label: 'Clôture et validation des OFs' },
                      { key: 'canModifyStock', label: 'Mouvements d\'inventaire stock' },
                      { key: 'canManageChutes', label: 'Gestion et suppression des chutes' },
                      { key: 'canManageUsers', label: 'Administration des utilisateurs' }
                    ].map(act => (
                      <label key={act.key} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer text-xs">
                        <span className="text-slate-300">{act.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean((currentPerms as any)[act.key])}
                          onChange={e => setCurrentPerms(prev => ({ ...prev, [act.key]: e.target.checked }))}
                          className="rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-0 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleSavePermissions}
                      className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Enregistrer les permissions</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. SECTION CADENCES & DÉLAIS DE PRODUCTION                          */}
      {/* =================================================================== */}
      {activeSubTab === 'cadences' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Paramétrage des Cadences & Délais de Production</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Ajustez les cadences journalières de l'atelier pour le calcul automatique des délais de livraison.
              </p>
            </div>

            <button
              onClick={handleSaveProdParams}
              disabled={isSavingProdParams}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSavingProdParams ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Enregistrer les Cadences</span>
            </button>
          </div>

          {prodParamsSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Paramètres de production enregistrés avec succès dans SQLite !</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Cadences par famille */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-900 pb-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span>Cadences maximales par jour (Unités / Jour) :</span>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'CAISSON' as const, label: 'Caissons & Sous-Faces', unit: 'caissons / jour' },
                  { key: 'TABLIER' as const, label: 'Tabliers Volets Roulants', unit: 'tabliers / jour' },
                  { key: 'MOUSTIQUAIRE' as const, label: 'Moustiquaires', unit: 'moustiquaires / jour' },
                  { key: 'PRECADRE' as const, label: 'Précadres Aluminium', unit: 'précadres / jour' }
                ].map(item => {
                  const fam = prodParams.familles?.[item.key] || PARAMETRES_PRODUCTION_DEFAUT.familles[item.key];
                  return (
                    <div key={item.key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={fam.capaciteJournalierePieces || 10}
                          onChange={e => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            const totalMin = (prodParams.heuresTravailParJour || 8) * 60;
                            const tps = Math.max(1, Math.round(totalMin / val));
                            setProdParams(prev => ({
                              ...prev,
                              familles: {
                                ...prev.familles,
                                [item.key]: {
                                  ...fam,
                                  capaciteJournalierePieces: val,
                                  tempsUnitaireMinutes: tps
                                }
                              }
                            }));
                          }}
                          className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-mono text-center font-bold"
                        />
                        <span className="text-[11px] text-slate-500 w-28">{item.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Jours ouvrés & Heures de travail */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-900 pb-2">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Jours ouvrés de l'Atelier (Semaine de travail) :</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {NOMS_JOURS_SEMAINE.map((nom, idx) => {
                  const isOuvre = prodParams.joursOuvres.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleJourOuvre(idx)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                        isOuvre
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {nom}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <label className="block text-[11px] text-slate-400 mb-1">Heures de travail effectives par jour :</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={prodParams.heuresTravailParJour || 8}
                    onChange={e => {
                      const val = Math.max(1, Math.min(24, parseInt(e.target.value) || 8));
                      setProdParams(prev => ({ ...prev, heuresTravailParJour: val }));
                    }}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono text-center font-bold"
                  />
                  <span className="text-xs text-slate-500">heures / jour ouvré</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 6. SECTION CODIFICATION CLIENTS & AGENCES                           */}
      {/* =================================================================== */}
      {activeSubTab === 'codification' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-400" />
                <span>Codification Clients, Agences & Règles de Repères</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configurez les préfixes de commandes et de repères (SOMODAL, CRISTAL, ATELIER) pour la numérotation automatique.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetDefaultCodifs}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Rétablir défaut</span>
              </button>
              <button
                onClick={() => setIsAddingNewCodif(true)}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nouvelle agence</span>
              </button>
            </div>
          </div>

          {/* Simulateur interactif de repère */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Simulateur de génération de repères :</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">Agence / Donneur d'ordre :</label>
                <select
                  value={testAgence}
                  onChange={e => setTestAgence(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                >
                  {codifs.map(c => (
                    <option key={c.id} value={c.nom}>{c.nom} ({c.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">Nom Client Final :</label>
                <input
                  type="text"
                  value={testClientNom}
                  onChange={e => setTestClientNom(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                />
              </div>
            </div>
            <div className="pt-1 text-[11px] text-slate-400 flex items-center gap-2">
              <span>Repère généré :</span>
              <span className="font-mono font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800/60">
                {genererRepereCaissonSousFace({
                  donneurOrdreNom: testAgence,
                  nomClientFinal: testClientNom,
                  indexLigne: 1,
                  codifications: codifs
                })}
              </span>
            </div>
          </div>

          {/* Liste des agences configurées */}
          <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
            {codifs.map(c => {
              const isEditing = editingCodifId === c.id;

              return (
                <div key={c.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  {!isEditing ? (
                    <>
                      <div>
                        <div className="font-bold text-slate-200 flex items-center gap-2">
                          <span>{c.nom}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            {c.code}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Préf. Cmd : {c.prefixeCommande}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {c.description || 'Agence partenaire standard'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingCodifId(c.id);
                            setEditCodifForm(c);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCodif(c.id)}
                          className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={editCodifForm.nom || ''}
                          onChange={e => setEditCodifForm(prev => ({ ...prev, nom: e.target.value }))}
                          placeholder="Nom Agence"
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                        />
                        <input
                          type="text"
                          value={editCodifForm.code || ''}
                          onChange={e => setEditCodifForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                          placeholder="Code (ex: SOMODAL)"
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 uppercase"
                        />
                        <input
                          type="text"
                          value={editCodifForm.prefixeCommande || ''}
                          onChange={e => setEditCodifForm(prev => ({ ...prev, prefixeCommande: e.target.value.toUpperCase() }))}
                          placeholder="Préfixe Commande"
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 uppercase"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingCodifId(null)}
                          className="px-3 py-1 bg-slate-800 text-slate-300 text-xs rounded-lg cursor-pointer"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => handleSaveCodif({ ...c, ...editCodifForm } as ClientCodification)}
                          className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Formulaire ajout agence */}
          {isAddingNewCodif && (
            <div className="p-4 bg-slate-950 rounded-xl border border-sky-500/40 space-y-3">
              <div className="text-xs font-bold text-slate-200">Ajouter une nouvelle codification agence :</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Nom Agence / Donneur :</label>
                  <input
                    type="text"
                    value={newCodifForm.nom || ''}
                    onChange={e => setNewCodifForm(prev => ({ ...prev, nom: e.target.value }))}
                    placeholder="ex : SOMODAL Oran"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Code Agence (Sigle) :</label>
                  <input
                    type="text"
                    value={newCodifForm.code || ''}
                    onChange={e => setNewCodifForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="ex : SOMO-ORAN"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Préfixe Commande :</label>
                  <input
                    type="text"
                    value={newCodifForm.prefixeCommande || ''}
                    onChange={e => setNewCodifForm(prev => ({ ...prev, prefixeCommande: e.target.value.toUpperCase() }))}
                    placeholder="ex : SO-"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 uppercase"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsAddingNewCodif(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateCodif}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Créer l'agence
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 7. SECTION MAPPAGE CHUTES & ARTICLES                                */}
      {/* =================================================================== */}
      {activeSubTab === 'mappage' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Link className="w-4 h-4 text-emerald-400" />
                <span>Correspondance Articles ↔ Familles de Chutes</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {Object.keys(mapping).length} liaisons actives
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Associez chaque profilé à sa famille de chutes pour la réutilisation automatique lors des calculs de débit.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoMapping}
                className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Auto-Liaison Intelligente</span>
              </button>
              <button
                onClick={handleClearAllMappings}
                className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-xl border border-rose-800/60 transition cursor-pointer flex items-center gap-1"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Tout Délier</span>
              </button>
            </div>
          </div>

          {mappingNotification && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{mappingNotification}</span>
            </div>
          )}

          {/* Formulaire d'association rapide */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-slate-200">Créer ou modifier une liaison :</div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-[11px] text-slate-400 mb-1">Article du Catalogue :</label>
                <select
                  value={selectedArtForMapping}
                  onChange={e => setSelectedArtForMapping(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {articles.map(a => (
                    <option key={a.code_art} value={a.code_art}>
                      {a.code_art} — {a.designation}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] text-slate-400 mb-1">Famille / Onglet Chute :</label>
                <select
                  value={selectedSheetForMapping}
                  onChange={e => setSelectedSheetForMapping(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {allSheets.map(s => (
                    <option key={s} value={s}>
                      {s} ({chutesBarres[s]?.length || 0} chutes en stock)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <button
                  onClick={() => handleLinkArticleToSheet(selectedArtForMapping, selectedSheetForMapping)}
                  className="w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow cursor-pointer transition flex items-center justify-center gap-1"
                >
                  <Link className="w-3.5 h-3.5" />
                  <span>Lier</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tableau des liaisons existantes */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-80 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Code Article</th>
                  <th className="py-2.5 px-3">Désignation</th>
                  <th className="py-2.5 px-3">Famille de Chute Associée</th>
                  <th className="py-2.5 px-3 text-center">Stock Chutes</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {articles.map(art => {
                  const mappedSheet = mapping[art.code_art];
                  const chuteCount = mappedSheet ? (chutesBarres[mappedSheet]?.length || 0) : 0;

                  return (
                    <tr key={art.code_art} className="hover:bg-slate-900/60 transition">
                      <td className="py-2 px-3 font-bold text-amber-300">{art.code_art}</td>
                      <td className="py-2 px-3 font-sans text-slate-200">{art.designation}</td>
                      <td className="py-2 px-3">
                        {mappedSheet ? (
                          <span className="px-2 py-0.5 rounded font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                            {mappedSheet}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Non liée</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {mappedSheet ? (
                          <span className="text-slate-300">{chuteCount} pcs</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {mappedSheet && (
                          <button
                            onClick={() => handleUnlinkArticle(art.code_art)}
                            className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded cursor-pointer"
                            title="Délier cet article"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 8. SECTION VIDAGE DE LA BASE SQLITE                                 */}
      {/* =================================================================== */}
      {activeSubTab === 'vidage' && (
        <div className="max-w-2xl mx-auto bg-slate-900 border border-rose-900/50 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="border-b border-rose-900/40 pb-3">
            <h2 className="text-base font-bold text-rose-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              <span>Zone Critique : Réinitialisation & Vidage de la Base SQLite</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Cette action irréversible supprime l'ensemble des articles, chutes, ordres de fabrication et historiques enregistrés dans <code>3m_atelier.db</code>.
            </p>
          </div>

          <div className="p-4 bg-rose-950/30 border border-rose-800/40 rounded-xl space-y-2 text-xs text-rose-200">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Précautions obligatoires avant le vidage :</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-300 text-[11px]">
              <li>Téléchargez impérativement une sauvegarde complète dans l'onglet "💾 Sauvegarde".</li>
              <li>Toutes les tables (articles, chutes, OF, commandes, mouvements) seront réinitialisées à vide.</li>
            </ul>
          </div>

          {wipeStatus && (
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold text-amber-300">
              {wipeStatus}
            </div>
          )}

          <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs text-slate-300 font-semibold">
              Pour confirmer le vidage, tapez exactement : <span className="font-mono text-rose-400 font-bold">VIDER LA BASE</span>
            </label>
            <input
              type="text"
              value={wipeConfirmText}
              onChange={e => setWipeConfirmText(e.target.value)}
              placeholder="VIDER LA BASE"
              className="w-full bg-slate-900 border border-rose-900/60 rounded-xl px-3 py-2 text-xs font-mono font-bold text-rose-300 focus:border-rose-500 focus:outline-none"
            />

            <button
              onClick={handleWipeDatabase}
              disabled={wipeConfirmText !== 'VIDER LA BASE' || isWiping}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {isWiping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>Confirmer le Vidage Définitif de SQLite</span>
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 9. SECTION LOGS & TRAÇABILITÉ COMPLÈTE DE L'ATELIER                */}
      {/* =================================================================== */}
      {activeSubTab === 'logs' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 text-amber-400">
                <Terminal className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-100">
                    Journal d'Audit &amp; Traçabilité Complète de l'Atelier
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    En direct SQLite
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Historique détaillé et temps réel de toutes les opérations de l'atelier : saisies de commandes, calculs de débit, réutilisation de chutes, requêtes SQLite et alertes.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Opérateur actif :</span>
              <span className="font-bold text-amber-300 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                {activeOperator.nom} ({activeOperator.role})
              </span>
            </div>
          </div>

          <SystemLogsViewer
            embedded={true}
            extraSystemInfo={{
              operateurActif: activeOperator.nom,
              roleOperateur: activeOperator.role,
              articlesActifs: articles.length,
              famillesChutes: Object.keys(chutesBarres).length,
              chutesMailleCount: chutesMaille.length,
              clientsCodifies: clientCodifications.length
            }}
          />
        </div>
      )}
    </div>
  );
};
