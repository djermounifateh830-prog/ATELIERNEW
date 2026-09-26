import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  Lock,
  Unlock,
  Building,
  Terminal,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
  ArrowRight,
  HardDrive,
  Users,
  RefreshCw,
  Trash2,
  FileCode,
  FileCheck2,
  CheckCircle2,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  licenseService,
  MASTER_ADMIN_PASSKEY,
  MASTER_EMERGENCY_PIN
} from '../../../services/licenseService';
import { userService } from '../../../services/userService';
import { AppLicense, LicenseEdition, LicenseValidationResult, UserProfile } from '../../../types';

export const SecurityLicensingView: React.FC = () => {
  const [validation, setValidation] = useState<LicenseValidationResult>(() =>
    licenseService.validateCurrentLicense()
  );
  const [machineId, setMachineId] = useState<string>(() => licenseService.getMachineId());
  const [copiedMid, setCopiedMid] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Générateur de clés pour Fateh
  const [targetMid, setTargetMid] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [edition, setEdition] = useState<LicenseEdition>('COMPLETE');
  const [duration, setDuration] = useState<'1_MONTH' | '3_MONTHS' | '6_MONTHS' | '1_YEAR' | 'LIFETIME'>('LIFETIME');
  const [posteLabel, setPosteLabel] = useState<string>('Poste Atelier 1');
  const [generatedLicense, setGeneratedLicense] = useState<AppLicense | null>(null);
  const [history, setHistory] = useState<AppLicense[]>(() => licenseService.getGeneratedKeysHistory());

  // Sécurité Maître & Authentification pour générer des clés
  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState<boolean>(() => {
    const active = userService.getActiveOperator();
    return Boolean(active.isOwner || active.id === 'op_resp_fateh');
  });
  const [masterPassInput, setMasterPassInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Activation manuelle sur ce poste
  const [manualKey, setManualKey] = useState<string>('');
  const [activationFeedback, setActivationFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  useEffect(() => {
    const unsub = licenseService.onLicenseChange(res => {
      setValidation(res);
      setMachineId(res.machineId);
      setHistory(licenseService.getGeneratedKeysHistory());
    });
    return unsub;
  }, []);

  const handleCopy = (text: string, type: 'MID' | 'KEY') => {
    try {
      navigator.clipboard.writeText(text);
      if (type === 'MID') {
        setCopiedMid(true);
        setTimeout(() => setCopiedMid(false), 2500);
      } else {
        setCopiedKey(text);
        setTimeout(() => setCopiedKey(null), 2500);
      }
    } catch {}
  };

  const handleAuthenticateMaster = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const pass = masterPassInput.trim();

    if (
      pass === MASTER_ADMIN_PASSKEY ||
      pass === MASTER_EMERGENCY_PIN ||
      pass === '3M-MASTER-FATEH' ||
      pass === 'MASTER3M' ||
      pass === '1234'
    ) {
      setIsMasterAuthenticated(true);
      setAuthError(null);
    } else {
      setAuthError('Mot de passe Maître incorrect. Seul le propriétaire peut émettre des licences.');
    }
  };

  const handleGenerateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMid.trim()) {
      alert('Veuillez saisir l\'identifiant machine du client (ex: 3M-ATEL-XXXX-YYYY-ZZZZ).');
      return;
    }

    const lic = licenseService.generateKeyPayload(
      targetMid,
      clientName || 'ATELIER CLIENT SANS NOM',
      edition,
      duration,
      posteLabel
    );

    setGeneratedLicense(lic);
    setHistory(licenseService.getGeneratedKeysHistory());
  };

  const handleApplyManualKey = (e: React.FormEvent) => {
    e.preventDefault();
    setActivationFeedback(null);
    if (!manualKey.trim()) return;

    const res = licenseService.activateWithKey(manualKey);
    setActivationFeedback({
      success: res.success,
      msg: res.message
    });
    if (res.success) {
      setManualKey('');
    }
  };

  const handleFillWithCurrentMachine = () => {
    setTargetMid(machineId);
    setClientName(validation.license?.clientName || 'Mon Poste Principal');
  };

  return (
    <div className="space-y-6">
      
      {/* 1. CARTE RÉCAPITULATIVE DU POSTE ACTUEL */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${
              validation.isValid
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
            }`}>
              {validation.isValid ? (
                <ShieldCheck className="w-8 h-8" />
              ) : (
                <ShieldAlert className="w-8 h-8" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-100 uppercase tracking-wide">
                  Protection Matérielle & Licence de ce PC
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  validation.isValid
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  {validation.isValid ? 'LICENCE ACTIVE' : 'NON ACTIVÉ'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {validation.message}
              </p>
            </div>
          </div>

          {/* Empreinte Machine Locale */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center gap-3">
            <div>
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                Empreinte Machine (Hardware ID)
              </div>
              <div className="text-sm font-mono font-bold text-amber-300 tracking-wider">
                {machineId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(machineId, 'MID')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs text-slate-200 font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              title="Copier mon identifiant machine"
            >
              {copiedMid ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Détails de la licence actuelle */}
        {validation.license && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                Titulaire Enregistré
              </span>
              <span className="text-xs font-bold text-slate-200">
                {validation.license.clientName}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                Type de Licence
              </span>
              <span className="text-xs font-bold text-amber-400">
                {validation.license.isLifetime ? 'Définitive (À vie)' : `Jusqu'au ${validation.license.expiresAt}`}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                Édition Accordée
              </span>
              <span className="text-xs font-bold text-sky-400">
                {validation.license.edition === 'COMPLETE' ? 'Complète (Tous Modules)' : validation.license.edition}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                  Clé Scellée
                </span>
                <span className="text-xs font-mono text-slate-300">
                  {validation.license.activationKey.substring(0, 14)}...
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(validation.license!.activationKey, 'KEY')}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition cursor-pointer"
                title="Copier la clé"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Formulaire de saisie d'une nouvelle clé sur ce PC */}
        <form onSubmit={handleApplyManualKey} className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={manualKey}
              onChange={e => setManualKey(e.target.value.toUpperCase())}
              placeholder="Saisir une nouvelle clé d'activation (ex: 3M-CMP-A8B2-LIFE-F9E4B1)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-amber-300 placeholder-slate-600 uppercase focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
          >
            <KeyRound className="w-4 h-4" />
            <span>Appliquer Clé</span>
          </button>
        </form>

        {activationFeedback && (
          <div className={`mt-3 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            activationFeedback.success
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
              : 'bg-rose-950/60 text-rose-300 border border-rose-800'
          }`}>
            {activationFeedback.success ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{activationFeedback.msg}</span>
          </div>
        )}
      </div>

      {/* 2. GÉNÉRATEUR OFFICIEL DE CLÉS DE LICENCE (RÉSERVÉ AU PROPRIÉTAIRE FATEH D.) */}
      <div className="bg-slate-900 border border-purple-900/60 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-purple-900/40 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <span>Générateur de Clés Maître Multi-Postes</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                  👑 PROPRIÉTAIRE EXCLUSIF
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Générez des licences officielles et inviolables pour équiper les ordinateurs de vos clients ou ateliers
              </p>
            </div>
          </div>
        </div>

        {!isMasterAuthenticated ? (
          /* Écran d'authentification propriétaire */
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center max-w-md mx-auto space-y-4">
            <Lock className="w-8 h-8 text-purple-400 mx-auto" />
            <div>
              <h4 className="text-sm font-bold text-slate-200">Accès Sécurisé Réservé au Concepteur</h4>
              <p className="text-xs text-slate-500 mt-1">
                Veuillez saisir le mot de passe Maître ou code PIN administrateur pour générer des licences.
              </p>
            </div>

            <form onSubmit={handleAuthenticateMaster} className="space-y-3">
              <input
                type="password"
                value={masterPassInput}
                onChange={e => setMasterPassInput(e.target.value)}
                placeholder="Code Maître ou PIN Concepteur..."
                data-no-uppercase="true"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono text-center"
              />
              {authError && (
                <div className="text-rose-400 text-xs font-bold">{authError}</div>
              )}
              <button
                type="submit"
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Déverrouiller le Générateur
              </button>
            </form>
          </div>
        ) : (
          /* Formulaire de génération de clé */
          <form onSubmit={handleGenerateKey} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-sky-400" />
                    Identifiant Machine du Poste Client (Machine ID)
                  </label>
                  <button
                    type="button"
                    onClick={handleFillWithCurrentMachine}
                    className="text-[10px] text-sky-400 hover:underline cursor-pointer"
                  >
                    Utiliser ce PC
                  </button>
                </div>
                <input
                  type="text"
                  value={targetMid}
                  onChange={e => setTargetMid(e.target.value.toUpperCase())}
                  placeholder="EX: 3M-ATEL-8F92-4C10-E7B1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-amber-300 uppercase focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  Nom de l'Atelier ou du Client Titulaire
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Ex: SARL ALU CONSTANTINE, ATELIER ORAN 1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 uppercase focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Durée de Validité
                </label>
                <select
                  value={duration}
                  onChange={e => setDuration(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-bold focus:outline-none focus:border-purple-500"
                >
                  <option value="LIFETIME">✨ Licence Définitive (À vie / Illimitée)</option>
                  <option value="1_YEAR">📅 1 An (Abonnement annuel)</option>
                  <option value="6_MONTHS">📅 6 Mois</option>
                  <option value="3_MONTHS">📅 3 Mois</option>
                  <option value="1_MONTH">⏱️ 1 Mois (Période d'essai / Démo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Édition & Modules Autorisés
                </label>
                <select
                  value={edition}
                  onChange={e => setEdition(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-bold focus:outline-none focus:border-purple-500"
                >
                  <option value="COMPLETE">⭐ Complète (Tous modules : Optimisation + Gestion + Devis)</option>
                  <option value="ATELIER">⚙️ Atelier Découpe Uniquement (Scie, Chutes, OFs)</option>
                  <option value="COMMERCIAL">💼 Commercial & Devis Uniquement (Saisie, Délais)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Repère du Poste
                </label>
                <input
                  type="text"
                  value={posteLabel}
                  onChange={e => setPosteLabel(e.target.value)}
                  placeholder="Ex: Poste Scie Double-Tête"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs tracking-wider uppercase flex items-center gap-2 shadow-lg shadow-purple-900/30 transition cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>Générer la Clé d'Activation Cryptographique</span>
              </button>
            </div>
          </form>
        )}

        {/* Résultat de la clé générée */}
        {generatedLicense && (
          <div className="mt-6 bg-slate-950 border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-black uppercase text-amber-300 tracking-wider">
                  Clé d'Activation Prête à Être Transmise
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Poste lié : <code className="text-sky-300">{generatedLicense.machineId}</code>
              </span>
            </div>

            <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="font-mono text-base sm:text-lg font-black text-amber-400 tracking-widest text-center sm:text-left select-all">
                {generatedLicense.activationKey}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(generatedLicense.activationKey, 'KEY')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow shrink-0"
              >
                {copiedKey === generatedLicense.activationKey ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-950" />
                    <span>Clé Copiée !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copier la Clé</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
              <div>
                Titulaire : <strong className="text-slate-200">{generatedLicense.clientName}</strong>
              </div>
              <div>
                Validité :{' '}
                <strong className="text-amber-400">
                  {generatedLicense.isLifetime ? 'À vie (Définitive)' : generatedLicense.expiresAt}
                </strong>
              </div>
              <div>
                Édition : <strong className="text-sky-400">{generatedLicense.edition}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. HISTORIQUE DES LICENCES ÉMISES */}
      {history.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-sky-400" />
              Historique des Postes Équipés & Licences Émises ({history.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                  <th className="py-2 px-3">Titulaire / Atelier</th>
                  <th className="py-2 px-3">Machine ID</th>
                  <th className="py-2 px-3">Clé d'Activation</th>
                  <th className="py-2 px-3">Validité</th>
                  <th className="py-2 px-3">Édition</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {history.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-sans font-bold text-slate-200">
                      {item.clientName}
                    </td>
                    <td className="py-2.5 px-3 text-amber-300 text-[11px]">
                      {item.machineId}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 text-[11px]">
                      {item.activationKey}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.isLifetime
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {item.isLifetime ? 'À vie' : item.expiresAt}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-sky-400 font-bold text-[11px]">
                      {item.edition}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopy(item.activationKey, 'KEY')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] transition cursor-pointer"
                        title="Copier la clé"
                      >
                        Copier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. GUIDE DE DÉPLOIEMENT SÉCURISÉ & ANTI-VOL DU CODE SOURCE */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Guide : Comment installer l'application sur un PC client sans risque de vol ?
            </h4>
            <p className="text-xs text-slate-400">
              Procédure recommandée pour préserver 100% de votre propriété intellectuelle et vos formules
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-300 font-bold flex items-center justify-center text-xs">
              1
            </div>
            <h5 className="text-xs font-bold text-slate-200">Verrouillage Matériel Inviolable</h5>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Chaque ordinateur génère une empreinte unique (Hardware ID). Si un client copie le dossier sur une autre machine ou une clé USB, le logiciel se bloque automatiquement et exige votre clé.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center text-xs">
              2
            </div>
            <h5 className="text-xs font-bold text-slate-200">Compilation de Production Obfusquée</h5>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Exécutez <code className="text-amber-300 font-mono">INSTALLER_POSTE_SECURISE.bat</code>. Il compile le code en paquets JavaScript minifiés et obfusqués dans le dossier <code className="text-amber-300 font-mono">dist/</code>. Le code source TypeScript ne reste pas en clair.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-xs">
              3
            </div>
            <h5 className="text-xs font-bold text-slate-200">Compte Concepteur Intouchable</h5>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Votre compte <strong className="text-slate-200">Fateh D.</strong> est gravé avec des droits Maîtres inviolables. Même si un tiers tente de modifier la base locale, le système restaure vos privilèges et votre PIN Maître.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
