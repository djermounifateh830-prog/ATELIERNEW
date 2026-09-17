import React, { useState, useEffect } from 'react';
import { X, UserCheck, Shield, Wrench, Briefcase, Plus, Check, Edit2, Trash2, Sparkles, AlertCircle } from 'lucide-react';
import { UserProfile, UserRole } from '../../types';
import { userService, ROLE_CONFIG } from '../../services/userService';

interface OperatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOperatorChanged?: (op: UserProfile) => void;
}

export const OperatorModal: React.FC<OperatorModalProps> = ({
  isOpen,
  onClose,
  onOperatorChanged
}) => {
  const [operators, setOperators] = useState<UserProfile[]>([]);
  const [activeOperator, setActiveOperator] = useState<UserProfile>(userService.getActiveOperator());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ATELIER');
  const [editPoste, setEditPoste] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ATELIER');
  const [newPoste, setNewPoste] = useState('');

  useEffect(() => {
    if (isOpen) {
      setOperators(userService.getOperators());
      setActiveOperator(userService.getActiveOperator());
      setIsAddingNew(false);
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectOperator = (id: string) => {
    const updated = userService.setActiveOperator(id);
    setActiveOperator(updated);
    setOperators(userService.getOperators());
    if (onOperatorChanged) onOperatorChanged(updated);
  };

  const handleStartEdit = (op: UserProfile) => {
    setEditingId(op.id);
    setEditNom(op.nom);
    setEditRole(op.role);
    setEditPoste(op.poste);
  };

  const handleSaveEdit = (id: string) => {
    if (!editNom.trim()) return;
    const updated = userService.updateOperator(id, {
      nom: editNom.trim(),
      role: editRole,
      poste: editPoste.trim()
    });
    if (updated) {
      setOperators(userService.getOperators());
      if (activeOperator.id === id) {
        setActiveOperator(updated);
        if (onOperatorChanged) onOperatorChanged(updated);
      }
    }
    setEditingId(null);
  };

  const handleCreateOperator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNom.trim()) return;
    const created = userService.addOperator(newNom, newRole, newPoste);
    userService.setActiveOperator(created.id);
    setActiveOperator(created);
    setOperators(userService.getOperators());
    if (onOperatorChanged) onOperatorChanged(created);
    setNewNom('');
    setNewPoste('');
    setIsAddingNew(false);
  };

  const handleDeleteOperator = (id: string) => {
    if (confirm('Voulez-vous vraiment retirer ce profil opérateur ?')) {
      userService.deleteOperator(id);
      setOperators(userService.getOperators());
      setActiveOperator(userService.getActiveOperator());
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'RESPONSABLE':
        return <Shield className="w-4 h-4 text-purple-400" />;
      case 'ATELIER':
        return <Wrench className="w-4 h-4 text-amber-400" />;
      case 'COMMERCIAL':
        return <Briefcase className="w-4 h-4 text-sky-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-lg font-bold text-white">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Profils &amp; Opérateurs Connectés
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-amber-500/30 font-medium">
                  Atelier 3M
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Sélectionnez votre rôle pour adapter la session de travail et signer les actions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Opérateur Actif Highlight */}
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-850/80 border border-slate-700/80 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activeOperator.avatarColor} flex items-center justify-center text-white font-black text-lg shadow-md border border-white/20`}>
                {activeOperator.initiales}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Opérateur actif en cours :</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${ROLE_CONFIG[activeOperator.role].badgeClasses}`}>
                    {ROLE_CONFIG[activeOperator.role].badgeLabel}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">{activeOperator.nom}</h3>
                <p className="text-xs text-slate-300">{activeOperator.poste}</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-2.5 py-1 bg-emerald-950/40 border border-emerald-500/30 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Session Active
              </span>
            </div>
          </div>

          {/* Guide des Rôles Atelier */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['RESPONSABLE', 'ATELIER', 'COMMERCIAL'] as UserRole[]).map((role) => {
              const cfg = ROLE_CONFIG[role];
              const isCurrent = activeOperator.role === role;
              return (
                <div
                  key={role}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-slate-800/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-base">{cfg.emoji}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.badgeClasses}`}>
                      {role}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-1">{cfg.label}</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{cfg.description}</p>
                </div>
              );
            })}
          </div>

          {/* Liste des Opérateurs Configurés */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                Changer d'Opérateur ({operators.length})
              </h4>
              {!isAddingNew && (
                <button
                  onClick={() => setIsAddingNew(true)}
                  className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 rounded-lg flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter un opérateur</span>
                </button>
              )}
            </div>

            {/* Formulaire Nouvel Opérateur */}
            {isAddingNew && (
              <form onSubmit={handleCreateOperator} className="p-4 bg-slate-950/80 border border-amber-500/40 rounded-xl mb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Créer un nouveau profil opérateur
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    Annuler
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Nom &amp; Prénom *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Yacine M."
                      value={newNom}
                      onChange={e => setNewNom(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Rôle Principal</label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as UserRole)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 focus:outline-none"
                    >
                      <option value="RESPONSABLE">👑 Responsable</option>
                      <option value="ATELIER">⚙️ Atelier / Découpe</option>
                      <option value="COMMERCIAL">💼 Commercial</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Poste / Fonction</label>
                    <input
                      type="text"
                      placeholder="Ex: Opérateur Découpe"
                      value={newPoste}
                      onChange={e => setNewPoste(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Enregistrer et Activer
                  </button>
                </div>
              </form>
            )}

            {/* Liste Cards Opérateurs */}
            <div className="space-y-2">
              {operators.map((op) => {
                const isActive = activeOperator.id === op.id;
                const isEditing = editingId === op.id;

                if (isEditing) {
                  return (
                    <div key={op.id} className="p-3 bg-slate-950 border border-sky-500/50 rounded-xl space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={editNom}
                          onChange={e => setEditNom(e.target.value)}
                          placeholder="Nom opérateur"
                          className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        />
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as UserRole)}
                          className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        >
                          <option value="RESPONSABLE">👑 Responsable</option>
                          <option value="ATELIER">⚙️ Atelier</option>
                          <option value="COMMERCIAL">💼 Commercial</option>
                        </select>
                        <input
                          type="text"
                          value={editPoste}
                          onChange={e => setEditPoste(e.target.value)}
                          placeholder="Poste"
                          className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(op.id)}
                          className="px-3 py-1 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={op.id}
                    onClick={() => handleSelectOperator(op.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                        : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${op.avatarColor} flex items-center justify-center text-white font-bold text-sm shadow`}>
                        {op.initiales}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-xs sm:text-sm">{op.nom}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border flex items-center gap-1 ${ROLE_CONFIG[op.role].badgeClasses}`}>
                            {getRoleIcon(op.role)}
                            {op.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{op.poste}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {isActive && (
                        <span className="text-[11px] font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-md border border-amber-400/30 flex items-center gap-1 mr-1">
                          <Check className="w-3.5 h-3.5" />
                          Connecté
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(op)}
                        title="Modifier ce profil"
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {operators.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteOperator(op.id)}
                          title="Supprimer ce profil"
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>Toutes les fiches et clôtures d'OF porteront le nom de l'opérateur connecté.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded-lg transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
