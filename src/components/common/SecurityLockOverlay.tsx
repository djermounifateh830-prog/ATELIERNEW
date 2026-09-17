import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Unlock, KeyRound, UserCheck, AlertTriangle, Delete, ArrowRight } from 'lucide-react';
import { userService, ROLE_CONFIG } from '../../services/userService';
import { UserProfile } from '../../types';

interface SecurityLockOverlayProps {
  isOpen?: boolean;
  onUnlocked?: () => void;
  onUnlock?: () => void;
}

export const SecurityLockOverlay: React.FC<SecurityLockOverlayProps> = ({ isOpen, onUnlocked, onUnlock }) => {
  const [activeOp, setActiveOp] = useState<UserProfile>(userService.getActiveOperator());
  const [operators, setOperators] = useState<UserProfile[]>(userService.getOperators());
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState<boolean>(false);

  useEffect(() => {
    setActiveOp(userService.getActiveOperator());
    setOperators(userService.getOperators());
    setPin('');
    setErrorMsg(null);
  }, []);

  const handleKeyPress = (digit: string) => {
    if (pin.length < 8) {
      const next = pin + digit;
      setPin(next);
      setErrorMsg(null);
      if (next.length === 4) {
        verify(next);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg(null);
  };

  const verify = (codeToTest?: string) => {
    const code = codeToTest || pin;
    if (!code) {
      setErrorMsg('Veuillez composer votre code PIN.');
      return;
    }

    const res = userService.unlockSession(code);
    if (res.success) {
      setErrorMsg(null);
      if (onUnlocked) onUnlocked();
      if (onUnlock) onUnlock();
    } else {
      setErrorMsg(res.message || 'Code PIN incorrect.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin('');
    }
  };

  const handleSwitchOperator = (op: UserProfile) => {
    userService.setActiveOperator(op.id);
    setActiveOp(op);
    setPin('');
    setErrorMsg(null);
  };

  if (isOpen === false) {
    return null;
  }

  const roleMeta = ROLE_CONFIG[activeOp.role] || ROLE_CONFIG.ATELIER;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none">
      <div className={`w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-transform ${shake ? 'translate-x-[-10px]' : ''}`}>
        
        {/* Header Sécurisé */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-6 border-b border-slate-800 text-center relative">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 shadow-inner">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-black text-slate-100 tracking-wide uppercase">
            3M ATELIER — ACCÈS SÉCURISÉ
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Veuillez saisir votre code PIN pour déverrouiller la session
          </p>
        </div>

        {/* Profil actif & Sélecteur d'opérateur */}
        <div className="p-6 flex flex-col items-center gap-4 bg-slate-900/50">
          <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-2xl w-full justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${activeOp.avatarColor || 'from-amber-500 to-orange-600'} flex items-center justify-center font-bold text-white shadow text-sm shrink-0`}>
                {activeOp.initiales}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-200 truncate">{activeOp.nom}</div>
                <div className="text-[11px] text-slate-400 truncate">{activeOp.poste || roleMeta.label}</div>
              </div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${roleMeta.badgeClasses}`}>
              {roleMeta.badgeLabel}
            </span>
          </div>

          {/* Choix d'un autre profil en 1 clic */}
          {operators.length > 1 && (
            <div className="w-full flex items-center justify-center gap-1.5 overflow-x-auto py-1">
              <span className="text-[11px] text-slate-500 mr-1">Changer :</span>
              {operators.map(op => (
                <button
                  key={op.id}
                  onClick={() => handleSwitchOperator(op)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 border ${
                    op.id === activeOp.id
                      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
                  }`}
                >
                  <span>{op.nom.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}

          {/* Indicateur de saisie PIN (Dots) */}
          <div className="flex items-center justify-center gap-3 my-2">
            {[0, 1, 2, 3].map(idx => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  pin.length > idx
                    ? 'bg-amber-400 border-amber-400 scale-110 shadow-lg shadow-amber-400/50'
                    : 'border-slate-600 bg-slate-950'
                }`}
              />
            ))}
          </div>

          {/* Message d'erreur éventuel */}
          {errorMsg && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 px-3 py-1.5 rounded-lg animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Pavé Numérique Tactile */}
          <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
              <button
                key={d}
                onClick={() => handleKeyPress(d)}
                className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-lg font-mono font-bold text-slate-100 border border-slate-700/60 transition shadow flex items-center justify-center cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="h-12 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-xs font-bold text-slate-400 border border-slate-700/40 transition flex items-center justify-center cursor-pointer"
              title="Effacer tout"
            >
              C
            </button>
            <button
              onClick={() => handleKeyPress('0')}
              className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-lg font-mono font-bold text-slate-100 border border-slate-700/60 transition shadow flex items-center justify-center cursor-pointer"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="h-12 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 border border-slate-700/40 transition flex items-center justify-center cursor-pointer"
              title="Supprimer dernier chiffre"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Bouton de validation manuelle ou hint */}
          <div className="w-full flex flex-col items-center gap-2 mt-2">
            <button
              onClick={() => verify()}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>DÉVERROUILLER L'APPLICATION</span>
            </button>

            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <span>Code par défaut :</span>
              <code className="text-amber-400/80 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                {activeOp.role === 'RESPONSABLE' ? '1234' : '0000'}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
