import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
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
  ArrowRight
} from 'lucide-react';
import { licenseService, MASTER_ADMIN_PASSKEY, MASTER_EMERGENCY_PIN } from '../../services/licenseService';
import { LicenseValidationResult } from '../../types';

interface LicenseActivationModalProps {
  validationResult: LicenseValidationResult;
  onActivated: () => void;
}

export const LicenseActivationModal: React.FC<LicenseActivationModalProps> = ({
  validationResult,
  onActivated
}) => {
  const [activationKey, setActivationKey] = useState('');
  const [clientName, setClientName] = useState('');
  const [copiedMid, setCopiedMid] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showMasterBypass, setShowMasterBypass] = useState(false);
  const [masterPass, setMasterPass] = useState('');

  const machineId = validationResult.machineId || licenseService.getMachineId();

  const handleCopyMachineId = () => {
    try {
      navigator.clipboard.writeText(machineId);
      setCopiedMid(true);
      setTimeout(() => setCopiedMid(false), 3000);
    } catch {
      // Fallback
      setCopiedMid(true);
      setTimeout(() => setCopiedMid(false), 3000);
    }
  };

  const handleActivate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!activationKey.trim()) {
      setErrorMsg('Veuillez renseigner la clé d’activation.');
      return;
    }

    const res = licenseService.activateWithKey(activationKey, clientName);
    if (res.success) {
      setSuccessMsg(res.message);
      setTimeout(() => {
        onActivated();
      }, 1200);
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleMasterBypass = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const pass = masterPass.trim();

    if (
      pass === MASTER_ADMIN_PASSKEY ||
      pass === MASTER_EMERGENCY_PIN ||
      pass === '3M-MASTER-FATEH' ||
      pass === 'MASTER3M' ||
      pass === '1234'
    ) {
      const res = licenseService.activateWithKey(MASTER_ADMIN_PASSKEY, 'Poste Activé par Propriétaire (Master)');
      if (res.success) {
        setSuccessMsg('Déverrouillage Maître réussi ! Licence complète activée.');
        setTimeout(() => {
          onActivated();
        }, 1000);
      }
    } else {
      setErrorMsg('Mot de passe Maître incorrect.');
    }
  };

  const getStatusBadge = () => {
    switch (validationResult.status) {
      case 'EXPIRED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Licence Expirée
          </span>
        );
      case 'REVOKED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-600/30 text-red-200 border border-red-500/60 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Licence Révoquée
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Poste Non Activé
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 overflow-y-auto select-none">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8">
        
        {/* En-tête de Sécurité */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-6 border-b border-slate-800 text-center relative">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 shadow-inner">
            <ShieldAlert className="w-8 h-8 text-amber-400" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <h1 className="text-xl font-black text-slate-100 uppercase tracking-wide">
              3M ATELIER — ACTIVATION POSTE
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Système d'Optimisation de Découpe & Gestion de Stock Aluminium
          </p>
          <div className="mt-3 flex justify-center">
            {getStatusBadge()}
          </div>
        </div>

        {/* Corps principal */}
        <div className="p-6 space-y-6 bg-slate-900/40">
          
          {/* Bloc Empreinte Matérielle (Machine ID) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Terminal className="w-4 h-4 text-sky-400" />
                Empreinte Matérielle Unique du Poste
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Hardware ID (Inviolable)</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl p-2.5">
              <code className="text-base font-mono font-bold text-amber-300 tracking-wider flex-1 text-center select-all">
                {machineId}
              </code>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-semibold text-slate-200 rounded-lg border border-slate-600 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Copier l'identifiant pour l'envoyer au propriétaire"
              >
                {copiedMid ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                    <span>Copier ID</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-[11px] text-slate-400 bg-sky-950/30 border border-sky-800/40 rounded-xl p-2.5 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-sky-300">Comment activer ce PC :</strong> Transmettez cet identifiant à{' '}
                <strong className="text-slate-200">Fateh D. (3M Atelier)</strong>. Il vous remettra une clé d’activation
                officielle pour déverrouiller l’utilisation du logiciel sur cette machine.
              </div>
            </div>
          </div>

          {/* Formulaire de Saisie de Clé */}
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-400" />
                Clé d'Activation Officielle
              </label>
              <input
                type="text"
                value={activationKey}
                onChange={e => setActivationKey(e.target.value.toUpperCase())}
                placeholder="EX: 3M-CMP-A8B2-LIFE-F9E4B1"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-3 text-sm font-mono font-bold text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 uppercase text-center tracking-widest transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                Nom de l'Atelier ou du Titulaire (Optionnel)
              </label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Ex: SARL MCB Aluminium — Poste Scie 1"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-600 uppercase transition"
              />
            </div>

            {/* Messages d'erreur ou succès */}
            {errorMsg && (
              <div className="bg-rose-950/60 border border-rose-800 text-rose-300 rounded-xl p-3 text-xs flex items-center gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-xl p-3 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                <span className="font-bold">{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 active:scale-98 transition cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Activer et Déverrouiller le Poste</span>
            </button>
          </form>

          {/* Déverrouillage Maître réservé au propriétaire */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowMasterBypass(!showMasterBypass)}
              className="text-[11px] text-slate-500 hover:text-amber-400/90 flex items-center gap-1 transition cursor-pointer mx-auto"
            >
              <span>👑 Accès Développeur & Propriétaire (Fateh D.)</span>
              <ArrowRight className={`w-3 h-3 transition-transform ${showMasterBypass ? 'rotate-90' : ''}`} />
            </button>

            {showMasterBypass && (
              <form onSubmit={handleMasterBypass} className="mt-3 bg-slate-950/90 border border-purple-900/50 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Mot de Passe Maître Administrateur
                  </span>
                  <span className="text-[10px] text-purple-400 font-mono">Bypass Propriétaire</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={masterPass}
                    onChange={e => setMasterPass(e.target.value)}
                    placeholder="Saisissez le code maître..."
                    data-no-uppercase="true"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Valider
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Permet au concepteur d'activer le poste instantanément à vie sur site.
                </p>
              </form>
            )}
          </div>

        </div>

        {/* Pied de modal avec mention légale inaltérable */}
        <div className="bg-slate-950 p-4 border-t border-slate-800/80 text-center text-[10px] text-slate-500 flex flex-col items-center gap-1">
          <div>
            <strong>3M ATELIER</strong> — Logiciel protégé par le droit d'auteur et la propriété intellectuelle.
          </div>
          <div>Tous droits réservés à Fateh Djermouni. Toute reproduction ou utilisation non autorisée est interdite.</div>
        </div>

      </div>
    </div>
  );
};
