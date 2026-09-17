import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../../types';
import { userService, ROLE_CONFIG } from '../../services/userService';
import { ChevronDown, Shield, Wrench, Briefcase } from 'lucide-react';

interface OperatorBadgeProps {
  onClick?: () => void;
}

export const OperatorBadge: React.FC<OperatorBadgeProps> = ({ onClick }) => {
  const [operator, setOperator] = useState<UserProfile>(userService.getActiveOperator());

  useEffect(() => {
    const unsub = userService.onOperatorChange((newOp) => {
      setOperator(newOp);
    });
    return unsub;
  }, []);

  const roleConfig = ROLE_CONFIG[operator.role] || ROLE_CONFIG.ATELIER;

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'RESPONSABLE':
        return <Shield className="w-3 h-3 text-purple-400" />;
      case 'ATELIER':
        return <Wrench className="w-3 h-3 text-amber-400" />;
      case 'COMMERCIAL':
        return <Briefcase className="w-3 h-3 text-sky-400" />;
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Opérateur connecté : ${operator.nom} (${operator.poste}) — Cliquer pour changer de profil`}
      className="flex items-center gap-2 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-950/70 hover:bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 shadow-sm transition text-left cursor-pointer group"
    >
      {/* Avatar avec initiales */}
      <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${operator.avatarColor} flex items-center justify-center text-white font-bold text-xs shadow ring-1 ring-white/20 shrink-0`}>
        {operator.initiales}
      </div>

      {/* Détails Opérateur */}
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white group-hover:text-amber-300 transition line-clamp-1 max-w-[110px] sm:max-w-[140px]">
            {operator.nom}
          </span>
          <span className={`hidden md:inline-flex text-[9px] font-bold px-1.5 py-0.2 rounded border items-center gap-0.5 ${roleConfig.badgeClasses}`}>
            {getRoleIcon(operator.role)}
            {operator.role}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 line-clamp-1 max-w-[110px] sm:max-w-[140px] leading-tight">
          {operator.poste}
        </span>
      </div>

      <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-white transition shrink-0 ml-0.5" />
    </button>
  );
};
