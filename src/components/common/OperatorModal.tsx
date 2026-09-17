import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  Shield,
  Wrench,
  Briefcase,
  Plus,
  Check,
  Edit2,
  Trash2,
  Sparkles,
  AlertCircle,
  Lock,
  Unlock,
  KeyRound,
  CheckSquare,
  Square,
  RotateCcw,
  Sliders
} from 'lucide-react';
import { UserProfile, UserRole, UserPermissions } from '../../types';
import { userService, ROLE_CONFIG, DEFAULT_PERMISSIONS_BY_ROLE } from '../../services/userService';

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
  const [activeTab, setActiveTab] = useState<'profils' | 'permissions'>('profils');
  const [operators, setOperators] = useState<UserProfile[]>([]);
  const [activeOperator, setActiveOperator] = useState<UserProfile>(userService.getActiveOperator());
  
  // Édition profil
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ATELIER');
  const [editPoste, setEditPoste] = useState('');
  
  // Nouvel opérateur
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ATELIER');
  const [newPoste, setNewPoste] = useState('');

  // Gestion Permissions (Checkboxes)
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<string>('');
  const [currentPerms, setCurrentPerms] = useState<UserPermissions>(userService.getUserPermissions());
  const [currentPin, setCurrentPin] = useState<string>('');
  const [isPinSecurityEnabled, setIsPinSecurityEnabled] = useState<boolean>(userService.isSecurityPinEnabled());
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const ops = userService.getOperators();
      const active = userService.getActiveOperator();
      setOperators(ops);
      setActiveOperator(active);
      setSelectedUserForPerms(active.id);
      setCurrentPerms(userService.getUserPermissions(active));
      setCurrentPin(active.pinCode || '0000');
      setIsPinSecurityEnabled(userService.isSecurityPinEnabled());
      setIsAddingNew(false);
      setEditingId(null);
      setSaveSuccessMsg(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedUserForPerms) {
      const user = operators.find(o => o.id === selectedUserForPerms);
      if (user) {
        setCurrentPerms(userService.getUserPermissions(user));
        setCurrentPin(user.pinCode || '0000');
        setSaveSuccessMsg(null);
      }
    }
  }, [selectedUserForPerms, operators]);

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

  const handleTogglePermission = (key: keyof UserPermissions) => {
    setCurrentPerms(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    setSaveSuccessMsg(null);
  };

  const handleSavePermissions = () => {
    if (!selectedUserForPerms) return;
    userService.updatePermissions(selectedUserForPerms, currentPerms);
    if (currentPin) {
      userService.setUserPin(selectedUserForPerms, currentPin);
    }
    setOperators(userService.getOperators());
    setSaveSuccessMsg('Autorisations enregistrées avec succès !');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleResetToRole = () => {
    if (!selectedUserForPerms) return;
    const user = operators.find(o => o.id === selectedUserForPerms);
    if (!user) return;
    const defaults = DEFAULT_PERMISSIONS_BY_ROLE[user.role] || DEFAULT_PERMISSIONS_BY_ROLE.ATELIER;
    setCurrentPerms({ ...defaults });
    setSaveSuccessMsg('Permissions réinitialisées selon le rôle d\'origine.');
  };

  const handleToggleAll = (val: boolean) => {
    const keys: (keyof UserPermissions)[] = [
      'tabMonitoring', 'tabEcosysteme', 'tabEncours', 'tabHistorique', 'tabStock', 'tabDevis', 'tabDocumentation',
      'canCloseOF', 'canCancelOF', 'canModifyStock', 'canManageChutes', 'canImportExport', 'canManageUsers'
    ];
    const updated = { ...currentPerms };
    keys.forEach(k => { updated[k] = val; });
    setCurrentPerms(updated);
  };

  const handleToggleSecurityLock = (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setIsPinSecurityEnabled(enabled);
    userService.setSecurityPinEnabled(enabled);
  };

  const handleLockSessionNow = () => {
    userService.lockSession();
    onClose();
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

  const selectedUserObj = operators.find(o => o.id === selectedUserForPerms) || activeOperator;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-lg font-bold text-white">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Profils &amp; Sécurité d'Accès</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-amber-500/30 font-medium">
                  3M Atelier
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Gérez les sessions d'opérateurs, les codes PIN et les autorisations via cases à cocher
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="px-6 pt-3 pb-0 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('profils')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-2 border-b-2 ${
                activeTab === 'profils'
                  ? 'bg-slate-900 text-amber-400 border-amber-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/50 border-transparent'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Opérateurs &amp; Sessions ({operators.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-2 border-b-2 ${
                activeTab === 'permissions'
                  ? 'bg-slate-900 text-amber-400 border-amber-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/50 border-transparent'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Autorisations par Cases à Cocher</span>
            </button>
          </div>

          <button
            onClick={handleLockSessionNow}
            className="px-3 py-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-700/60 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer mb-1 shadow-sm"
            title="Verrouiller immédiatement l'écran de l'application"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Verrouiller session</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm custom-scrollbar">
          {/* TAB 1 : PROFILS */}
          {activeTab === 'profils' && (
            <div className="space-y-5">
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

              {/* Liste des Opérateurs */}
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
                        className="text-slate-400 hover:text-white text-xs cursor-pointer"
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
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {operators.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOperator(op.id)}
                              title="Supprimer ce profil"
                              className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition cursor-pointer"
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
          )}

          {/* TAB 2 : GESTION DES AUTORISATIONS PAR CHECKBOXES */}
          {activeTab === 'permissions' && (
            <div className="space-y-5">
              {/* Sélecteur de l'Opérateur à Configurer */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-300">Profil à paramétrer :</span>
                  <select
                    value={selectedUserForPerms}
                    onChange={e => setSelectedUserForPerms(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400"
                  >
                    {operators.map(op => (
                      <option key={op.id} value={op.id}>
                        {op.nom} ({op.role}) — {op.poste}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleAll(true)}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer"
                  >
                    Tout cocher
                  </button>
                  <button
                    onClick={() => handleToggleAll(false)}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer"
                  >
                    Tout décocher
                  </button>
                  <button
                    onClick={handleResetToRole}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-400 rounded border border-amber-500/30 flex items-center gap-1 transition cursor-pointer"
                    title="Rétablir les permissions standard du rôle"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Défaut rôle</span>
                  </button>
                </div>
              </div>

              {/* Matrice des Checkboxes : Onglets de navigation */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                    <span>1. Onglets et Modules Accessibles</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Cochez pour autoriser l'affichage</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { key: 'tabMonitoring' as const, label: '📊 Monitoring Atelier & Alertes Retards', desc: 'Supervision des flux et cadences' },
                    { key: 'tabEcosysteme' as const, label: '📁 Écosystème & Dossiers Commandes', desc: 'Arborescence des commandes globales' },
                    { key: 'tabEncours' as const, label: '📋 Ordres en Cours (OF)', desc: 'Suivi de découpe et Cockpit Clôture' },
                    { key: 'tabHistorique' as const, label: '📜 Historique Commandes', desc: 'Archive globale et recherche avancée' },
                    { key: 'tabStock' as const, label: '📦 Gestion Stock Articles & Chutes', desc: 'Inventaire, chutes et liaisons' },
                    { key: 'tabDevis' as const, label: '💰 Devis & Calculatrice de Coûts', desc: 'Tarifs matières et chiffrage' },
                    { key: 'tabDocumentation' as const, label: '📘 Règles Métier & Documentation', desc: 'Normes de débit et tolérances' }
                  ].map(item => {
                    const checked = Boolean(currentPerms[item.key]);
                    return (
                      <label
                        key={item.key}
                        onClick={() => handleTogglePermission(item.key)}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer select-none ${
                          checked
                            ? 'bg-sky-950/30 border-sky-600/50 text-white'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}} // géré par le parent
                          className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className="text-[11px] text-slate-400">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Matrice des Checkboxes : Actions Opérationnelles Sensibles */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                    <span>2. Actions Opérationnelles &amp; Droits Sensibles</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Contrôle des modifications d'atelier</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { key: 'canCloseOF' as const, label: '✂️ Clôturer un Ordre de Fabrication (OF)', desc: 'Déduction stock et génération des chutes' },
                    { key: 'canCancelOF' as const, label: '🔄 Annuler / Réouvrir un Ordre clôturé', desc: 'Restitution des stocks et annulation' },
                    { key: 'canModifyStock' as const, label: '📦 Mouvements de Stock Manuel & Inventaire', desc: 'Entrées, sorties et ajustements' },
                    { key: 'canManageChutes' as const, label: '🗂️ Création / Suppression Familles Chutes', desc: 'Modification de la base des chutes' },
                    { key: 'canImportExport' as const, label: '📥 Import / Export Fichiers Excel', desc: 'Intégration de catalogues externes' },
                    { key: 'canManageUsers' as const, label: '🛡️ Gestion Opérateurs & Sécurité', desc: 'Paramétrage des autorisations et PINs' }
                  ].map(item => {
                    const checked = Boolean(currentPerms[item.key]);
                    return (
                      <label
                        key={item.key}
                        onClick={() => handleTogglePermission(item.key)}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer select-none ${
                          checked
                            ? 'bg-amber-950/30 border-amber-600/50 text-white'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className="text-[11px] text-slate-400">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Code PIN & Verrouillage de Session */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-200 block">
                      Code PIN de déverrouillage pour {selectedUserObj.nom} :
                    </label>
                    <span className="text-[11px] text-slate-400">Code à 4 chiffres (ex: 1234, 0000)</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="password"
                    maxLength={8}
                    value={currentPin}
                    onChange={e => {
                      setCurrentPin(e.target.value.replace(/\D/g, ''));
                      setSaveSuccessMsg(null);
                    }}
                    placeholder="PIN"
                    className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-center font-mono font-bold text-sm text-amber-300 focus:border-amber-400 focus:outline-none"
                  />
                  
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPinSecurityEnabled}
                      onChange={handleToggleSecurityLock}
                      className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Exiger code PIN pour déverrouiller</span>
                  </label>
                </div>
              </div>

              {/* Feedback et Bouton Enregistrer */}
              <div className="flex items-center justify-between pt-2">
                {saveSuccessMsg ? (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-800 px-3 py-1.5 rounded-lg">
                    <Check className="w-3.5 h-3.5" />
                    {saveSuccessMsg}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    Les modifications prendront effet immédiatement pour l'opérateur sélectionné.
                  </span>
                )}

                <button
                  onClick={handleSavePermissions}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer les Autorisations</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>Toutes les signatures d'OF et mouvements d'atelier sont sécurisés et tracés.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded-lg transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
