import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { EcosystemeCommandesTab } from './components/tabs/EcosystemeCommandesTab';
import { CaissonSousFaceTab } from './components/tabs/CaissonSousFaceTab';
import { TablierTab } from './components/tabs/TablierTab';
import { PrecadreTab } from './components/tabs/PrecadreTab';
import { MoustiquaireTab } from './components/tabs/MoustiquaireTab';
import { GestionStockTab } from './components/tabs/GestionStockTab';
import { DevisTab } from './components/tabs/DevisTab';
import { DocumentationTab } from './components/tabs/DocumentationTab';
import { HistoriqueTab } from './components/tabs/HistoriqueTab';
import { OrdresEnCoursTab } from './components/tabs/OrdresEnCoursTab';
import { ClotureCockpitTab } from './components/tabs/ClotureCockpitTab';
import { MonitoringAtelierTab } from './components/tabs/MonitoringAtelierTab';
import { ParametresTab } from './components/tabs/ParametresTab';
import { SecurityLockOverlay } from './components/common/SecurityLockOverlay';
import { LicenseActivationModal } from './components/common/LicenseActivationModal';
import { StorageService } from './services/storage';
import { userService } from './services/userService';
import { licenseService } from './services/licenseService';
import { realtimeSync } from './services/realtimeSync';
import { DelaisProductionService } from './services/delaisProductionService';
import { Article, ChuteItem, ChuteMaille, MappingChutes, DossierCommandeGlobal, SuiviOF, MouvementStock, ClientCodification, FicheTransfert, FamilleProduit, LicenseValidationResult } from './types';

const getInitialTab = (): string => {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam) return tabParam;
    const hashParam = window.location.hash.replace('#', '');
    if (hashParam) return hashParam;
  } catch (e) {}
  return 'ecosysteme';
};

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(getInitialTab);
  const [selectedDossierToLoad, setSelectedDossierToLoad] = useState<DossierCommandeGlobal | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState<boolean>(() => userService.isSessionLocked());
  const [licenseValidation, setLicenseValidation] = useState<LicenseValidationResult>(() =>
    licenseService.validateCurrentLicense()
  );

  // Application Data States (Pure SQLite — Source Unique de Vérité)
  const [articles, setArticles] = useState<Article[]>([]);
  const [chutesBarres, setChutesBarres] = useState<Record<string, ChuteItem[]>>({});
  const [chutesMaille, setChutesMaille] = useState<ChuteMaille[]>([]);
  const [mapping, setMapping] = useState<MappingChutes>({});
  const [dossiers, setDossiers] = useState<DossierCommandeGlobal[]>([]);
  const [suivisOF, setSuivisOF] = useState<SuiviOF[]>([]);
  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);
  const [clientCodifications, setClientCodifications] = useState<ClientCodification[]>([]);
  const [fichesTransfert, setFichesTransfert] = useState<FicheTransfert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Chargement direct depuis SQLite
  const loadData = useCallback(async () => {
    try {
      const data = await StorageService.initSqlite();
      // Charger les paramètres d'atelier pour que les cadences et jours ouvrés soient à jour dès l'ouverture
      DelaisProductionService.loadParametresFromDb().catch(() => {});
      setArticles(data.articles);
      setChutesBarres(data.chutesBarres);
      setChutesMaille(data.chutesMaille);
      setMapping(data.mapping);
      setDossiers(data.dossiers);
      setSuivisOF(data.suivisOF);
      setMouvements(data.mouvements);
      setClientCodifications(data.clientCodifications);
      setFichesTransfert(data.fichesTransfert);
    } catch (err) {
      console.error('Erreur chargement SQLite:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSetActiveTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabId);
      window.history.pushState({ tab: tabId }, '', url.toString());
    } catch (e) {}
    // Synchroniser silencieusement les données pour assurer la cohérence multi-modules (OFs, stocks, dossiers)
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Synchronisation temps réel automatique (SSE & Polling configurables multi-écrans)
  useEffect(() => {
    const unsubscribe = realtimeSync.onSync(() => {
      // Rechargement transparent en arrière-plan sans flash
      loadData();
    });
    return unsubscribe;
  }, [loadData]);

  // Surveillance du verrouillage de session et des autorisations d'onglets
  useEffect(() => {
    const unsub = userService.onOperatorChange((op) => {
      setIsSessionLocked(userService.isSessionLocked());
      // Vérifier si l'onglet actif est toujours autorisé pour l'opérateur
      if (!userService.hasTabAccess(activeTab, op)) {
        // Rediriger vers le premier onglet autorisé
        const authorized = ['monitoring', 'ecosysteme', 'encours', 'historique', 'stock', 'devis', 'documentation']
          .find(tabId => userService.hasTabAccess(tabId, op));
        if (authorized) {
          handleSetActiveTab(authorized);
        }
      }
    });
    return unsub;
  }, [activeTab, handleSetActiveTab]);

  // Surveillance en temps réel de la licence et de la protection matérielle
  useEffect(() => {
    const unsub = licenseService.onLicenseChange((val) => {
      setLicenseValidation(val);
    });
    return unsub;
  }, []);

  const handleLoadDossierFromHistorique = useCallback((dossier: DossierCommandeGlobal, targetFamille?: FamilleProduit) => {
    try {
      localStorage.setItem('3m_dossier_to_load', JSON.stringify({ dossier, targetFamille }));
    } catch (e) {
      console.warn('Erreur stockage bridge dossier localStorage:', e);
    }
    setSelectedDossierToLoad(dossier);
    handleSetActiveTab('ecosysteme');
  }, [handleSetActiveTab]);

  const handleClearSelectedDossier = useCallback(() => {
    setSelectedDossierToLoad(null);
  }, []);

  const chutesSheetsCount = Object.keys(chutesBarres).length + (chutesMaille.length > 0 ? 1 : 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-lg font-bold">3M ATELIER — OPTIMISATION DE DÉCOUPE</div>
        <p className="text-xs text-slate-500 mt-1">Connexion à la base de données SQLite 3m_atelier.db...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        articles={articles}
        chutesBarres={chutesBarres}
        chutesMaille={chutesMaille}
        suivisOF={suivisOF}
        dossiers={dossiers}
        articlesCount={articles.length}
        chutesSheetsCount={chutesSheetsCount}
        onRefreshData={loadData}
      />

      {/* Main Content Body (Full screen width exploited) */}
      <main className="flex-1 w-full px-2 sm:px-3 lg:px-4 py-3 sm:py-4">
        {activeTab === 'monitoring' && (
          <MonitoringAtelierTab
            dossiers={dossiers}
            suivisOF={suivisOF}
            articles={articles}
            onRefreshData={loadData}
            onNavigateToTab={(tabId) => handleSetActiveTab(tabId)}
            onLoadDossierInEcosysteme={handleLoadDossierFromHistorique}
          />
        )}

        {activeTab === 'ecosysteme' && (
          <EcosystemeCommandesTab
            articles={articles}
            chutesBarres={chutesBarres}
            chutesMaille={chutesMaille}
            mapping={mapping}
            dossiers={dossiers}
            suivisOF={suivisOF}
            clientCodifications={clientCodifications}
            onDossiersUpdated={loadData}
            onNavigateToTab={(tabId) => handleSetActiveTab(tabId)}
            selectedDossierToLoad={selectedDossierToLoad}
            onClearSelectedDossier={handleClearSelectedDossier}
          />
        )}

        {activeTab === 'encours' && (
          <OrdresEnCoursTab
            suivisOF={suivisOF}
            dossiers={dossiers}
            clientCodifications={clientCodifications}
            fichesTransfert={fichesTransfert}
            onRefreshData={loadData}
            onNavigateToTab={(tabId) => handleSetActiveTab(tabId)}
            onLoadDossierInEcosysteme={handleLoadDossierFromHistorique}
            articles={articles}
            chutesBarres={chutesBarres}
            mapping={mapping}
          />
        )}

        {activeTab === 'cockpit-cloture' && (
          <ClotureCockpitTab
            suivisOF={suivisOF}
            dossiers={dossiers}
            articles={articles}
            chutesBarres={chutesBarres}
            mapping={mapping}
            onRefreshData={loadData}
            onNavigateToTab={(tabId) => handleSetActiveTab(tabId)}
          />
        )}

        {activeTab === 'tablier' && (
          <TablierTab
            articles={articles}
            chutesBarres={chutesBarres}
            mapping={mapping}
            onStockUpdated={loadData}
          />
        )}

        {activeTab === 'moustiquaire' && (
          <MoustiquaireTab
            articles={articles}
            chutesBarres={chutesBarres}
            chutesMaille={chutesMaille}
            mapping={mapping}
            onStockUpdated={loadData}
          />
        )}

        {activeTab === 'caisson' && (
          <CaissonSousFaceTab
            articles={articles}
            chutesBarres={chutesBarres}
            mapping={mapping}
            onStockUpdated={loadData}
          />
        )}

        {activeTab === 'precadre' && (
          <PrecadreTab
            articles={articles}
            chutesBarres={chutesBarres}
            mapping={mapping}
            onStockUpdated={loadData}
          />
        )}

        {activeTab === 'historique' && (
          <HistoriqueTab
            dossiers={dossiers}
            onLoadDossierInEcosysteme={handleLoadDossierFromHistorique}
            onRefreshData={loadData}
          />
        )}

        {activeTab === 'stock' && (
          <GestionStockTab
            articles={articles}
            chutesBarres={chutesBarres}
            chutesMaille={chutesMaille}
            mapping={mapping}
            suivisOF={suivisOF}
            dossiers={dossiers}
            mouvements={mouvements}
            onStockUpdated={loadData}
          />
        )}

        {activeTab === 'devis' && <DevisTab articles={articles} />}

        {activeTab === 'documentation' && <DocumentationTab />}

        {activeTab === 'parametres' && (
          <ParametresTab
            articles={articles}
            chutesBarres={chutesBarres}
            chutesMaille={chutesMaille}
            mapping={mapping}
            clientCodifications={clientCodifications}
            onRefreshData={loadData}
          />
        )}
      </main>

      {/* Footer avec Filigrane de Propriété et État de Licence */}
      <footer className="bg-slate-950 border-t border-slate-900 py-3.5 text-center text-xs text-slate-500">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">3M Atelier</span>
            <span>— Système d'Optimisation de Découpe & Gestion de Stock (SQLite 3m_atelier.db)</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600">ID Machine : {licenseValidation.machineId}</span>
            <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
              licenseValidation.isValid
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              {licenseValidation.isValid ? '🛡️ LICENCE CERTIFIÉE' : '🔒 NON ACTIVÉ'}
            </span>
          </div>
        </div>
      </footer>

      {/* Écran de Sécurité / Verrouillage par Code PIN */}
      <SecurityLockOverlay
        isOpen={isSessionLocked}
        onUnlock={() => setIsSessionLocked(false)}
      />

      {/* Écran d'Activation Obligatoire si le poste n'a pas de licence valide */}
      {!licenseValidation.isValid && (
        <LicenseActivationModal
          validationResult={licenseValidation}
          onActivated={() => {
            const nextVal = licenseService.validateCurrentLicense();
            setLicenseValidation(nextVal);
            loadData();
          }}
        />
      )}
    </div>
  );
}
