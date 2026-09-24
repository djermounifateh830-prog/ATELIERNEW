import React, { useState, useMemo } from 'react';
import {
  DonneesMonitoringAtelier,
  StatsFamilleMonitoring,
  LigneCommandeMonitoring
} from '../../services/monitoringService';
import { DossierCommandeGlobal, SuiviOF, FamilleProduit } from '../../types';
import {
  Activity,
  TrendingUp,
  Percent,
  Layers,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  Clock,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Sparkles,
  Info,
  Boxes,
  Timer,
  CheckCheck,
  ShieldCheck,
  Zap,
  Gauge,
  ArrowUpRight,
  Filter
} from 'lucide-react';

interface MonitoringChartsViewProps {
  monitoringData: DonneesMonitoringAtelier;
  dossiers: DossierCommandeGlobal[];
  suivisOF: SuiviOF[];
  onNavigateToPoste?: (familleKey: string) => void;
}

const COULEURS_FAMILLES: Record<string, { main: string; light: string; border: string; bg: string }> = {
  CAISSON: { main: '#f59e0b', light: '#fbbf24', border: '#b45309', bg: 'rgba(245, 158, 11, 0.15)' },
  TABLIER: { main: '#0284c7', light: '#38bdf8', border: '#0369a1', bg: 'rgba(2, 132, 199, 0.15)' },
  PRECADRE: { main: '#a855f7', light: '#c084fc', border: '#7e22ce', bg: 'rgba(168, 85, 247, 0.15)' },
  MOUSTIQUAIRE: { main: '#10b981', light: '#34d399', border: '#047857', bg: 'rgba(16, 185, 129, 0.15)' }
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES DE DONNÉES STRUCTURÉES POUR LES 3 VOLETS CLÉS
// ─────────────────────────────────────────────────────────────────────────────

// 1. CHARGE PAR FAMILLE
export interface ChargeFamilleItem {
  cle: string;
  famille: string;
  chargePieces: number;
  capaciteJour: number;
  tauxOccupation: number;
  partChargeTotalePct: number;
  chargeHeures: number;
  joursRequis: number;
  commandesCount: number;
  couleur: string;
  statutCharge: 'FLUIDE' | 'DENSE' | 'SURCHARGE';
}

// 2. TAUX DE RÉPONSE PAR FAMILLE (PONCTUALITÉ & RESPECT DES DÉLAIS)
export interface TauxReponseItem {
  cle: string;
  famille: string;
  tauxReponsePct: number;
  commandesDansLesTemps: number;
  commandesAvertissement: number;
  commandesEnRetard: number;
  totalCommandes: number;
  delaiMoyenReponseJours: number;
  delaiMaxJours: number;
  dateLivraisonMax: string;
  statutReponse: 'OPTIMAL' | 'VIGILANCE' | 'RETARD';
  couleur: string;
}

// 3. RENDEMENT PAR FAMILLE (OPTIMISATION MATIÈRE ALUMINIUM)
export interface RendementFamilleItem {
  cle: string;
  famille: string;
  tauxRendement: number;
  matiereUtilePct: number;
  chutesStockPct: number;
  dechetPct: number;
  tauxRecyclageChutes: number;
  gainMatiereEstimePct: number;
  statutRendement: 'OPTIMAL' | 'CORRECT' | 'A_AMELIORER';
  couleur: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT SVG 1 : CHARGE PAR FAMILLE (CHARGE PIÈCES VS CAPACITÉ NOMINALE)
// ─────────────────────────────────────────────────────────────────────────────
const SvgChargeParFamilleChart: React.FC<{ data: ChargeFamilleItem[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 560;
  const height = 270;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 32;
  const padBottom = 48;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = useMemo(() => {
    const vals = data.flatMap(d => [d.chargePieces, d.capaciteJour]);
    const max = Math.max(20, ...vals);
    return Math.ceil(max / 25) * 25;
  }, [data]);

  const stepCount = 4;
  const gridSteps = Array.from({ length: stepCount + 1 }, (_, i) => Math.round((maxVal / stepCount) * i));
  const hoveredItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="relative w-full h-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Lignes de repère horizontales */}
        {gridSteps.map(val => {
          const y = padTop + chartH - (val / maxVal) * chartH;
          return (
            <g key={val}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth={1}
                opacity={0.6}
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                fill="#94a3b8"
                fontSize={10}
                fontFamily="ui-monospace, monospace"
                textAnchor="end"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Groupes de barres par famille */}
        {data.map((item, idx) => {
          const groupW = chartW / data.length;
          const groupX = padLeft + idx * groupW;
          const barW = Math.min(26, groupW * 0.32);
          const gap = 5;

          const hCharge = Math.max(3, (item.chargePieces / maxVal) * chartH);
          const yCharge = padTop + chartH - hCharge;

          const hCap = Math.max(3, (item.capaciteJour / maxVal) * chartH);
          const yCap = padTop + chartH - hCap;

          const barX1 = groupX + (groupW / 2) - barW - (gap / 2);
          const barX2 = groupX + (groupW / 2) + (gap / 2);

          const isHov = hoveredIdx === idx;

          return (
            <g
              key={item.cle}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-opacity"
            >
              {/* Fond translucide au survol */}
              {isHov && (
                <rect
                  x={groupX + 4}
                  y={padTop}
                  width={groupW - 8}
                  height={chartH}
                  fill="rgba(255,255,255,0.04)"
                  rx={6}
                />
              )}

              {/* Barre 1 : Charge en pièces (Couleur famille) */}
              <rect
                x={barX1}
                y={yCharge}
                width={barW}
                height={hCharge}
                fill={item.couleur}
                rx={4}
                className="transition-all duration-300"
                opacity={hoveredIdx !== null && !isHov ? 0.4 : 0.95}
              />

              {/* Barre 2 : Capacité journalière de référence (Gris bleu ardoise) */}
              <rect
                x={barX2}
                y={yCap}
                width={barW}
                height={hCap}
                fill="#38bdf8"
                rx={4}
                className="transition-all duration-300"
                opacity={hoveredIdx !== null && !isHov ? 0.35 : 0.75}
              />

              {/* Valeurs numériques au-dessus des barres */}
              <text
                x={barX1 + barW / 2}
                y={Math.max(padTop - 4, yCharge - 4)}
                fill={item.couleur}
                fontSize={9.5}
                fontFamily="ui-monospace, monospace"
                fontWeight={700}
                textAnchor="middle"
              >
                {item.chargePieces}
              </text>
              <text
                x={barX2 + barW / 2}
                y={Math.max(padTop - 4, yCap - 4)}
                fill="#38bdf8"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                fontWeight={600}
                textAnchor="middle"
              >
                {item.capaciteJour}
              </text>

              {/* Label Famille sur axe X */}
              <text
                x={groupX + groupW / 2}
                y={height - 22}
                fill={isHov ? '#f8fafc' : '#94a3b8'}
                fontSize={10.5}
                fontWeight={isHov ? 700 : 500}
                textAnchor="middle"
              >
                {item.famille}
              </text>

              {/* Badge de part de charge */}
              <text
                x={groupX + groupW / 2}
                y={height - 8}
                fill="#64748b"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {item.partChargeTotalePct}% du total
              </text>
            </g>
          );
        })}
      </svg>

      {/* Infobulle interactive flottante */}
      {hoveredItem && (
        <div
          className="absolute z-20 top-2 right-2 bg-slate-950/95 border border-slate-700/90 p-3.5 rounded-xl shadow-2xl text-xs space-y-2 min-w-[220px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredItem.couleur }} />
              {hoveredItem.famille}
            </span>
            <span className="text-amber-400 font-mono font-bold">{hoveredItem.tauxOccupation}% saturation</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Pièces en fabrication :</span>
            <span className="font-bold font-mono text-amber-300">{hoveredItem.chargePieces} pcs</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Capacité de découpe :</span>
            <span className="font-bold font-mono text-sky-300">{hoveredItem.capaciteJour} pcs/jour</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Part du volume atelier :</span>
            <span className="font-bold font-mono text-emerald-400">{hoveredItem.partChargeTotalePct}%</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Temps estimé :</span>
            <span className="font-bold font-mono text-slate-200">{hoveredItem.chargeHeures} h ({hoveredItem.joursRequis} j ouvrés)</span>
          </div>
          <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Commandes concernées :</span>
            <span className="font-bold font-mono text-sky-400">{hoveredItem.commandesCount} cmd(s)</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT SVG 2 : TAUX DE RÉPONSE PAR FAMILLE (RESPECT DES DÉLAIS & SLA)
// ─────────────────────────────────────────────────────────────────────────────
const SvgTauxReponseChart: React.FC<{ data: TauxReponseItem[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 560;
  const height = 270;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 32;
  const padBottom = 48;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const minVal = 60;
  const maxVal = 100;
  const range = maxVal - minVal;

  const gridSteps = [60, 70, 80, 90, 100];
  const hoveredItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  // Ligne de référence Seuil Cible Qualité 95%
  const y95 = padTop + chartH - ((95 - minVal) / range) * chartH;

  return (
    <div className="relative w-full h-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Lignes de repère horizontales */}
        {gridSteps.map(val => {
          const y = padTop + chartH - ((val - minVal) / range) * chartH;
          return (
            <g key={val}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth={1}
                opacity={0.6}
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                fill="#94a3b8"
                fontSize={10}
                fontFamily="ui-monospace, monospace"
                textAnchor="end"
              >
                {val}%
              </text>
            </g>
          );
        })}

        {/* Ligne Seuil Cible Qualité 95% */}
        <line
          x1={padLeft}
          y1={y95}
          x2={width - padRight}
          y2={y95}
          stroke="#10b981"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        <text
          x={width - padRight}
          y={y95 - 5}
          fill="#10b981"
          fontSize={9}
          fontWeight={700}
          textAnchor="end"
        >
          Cible Réponse 95%
        </text>

        {/* Barres verticales du Taux de Réponse par famille */}
        {data.map((item, idx) => {
          const groupW = chartW / data.length;
          const groupX = padLeft + idx * groupW;
          const barW = Math.min(38, groupW * 0.46);
          const barX = groupX + (groupW - barW) / 2;

          const clampedVal = Math.max(minVal, Math.min(maxVal, item.tauxReponsePct));
          const hBar = ((clampedVal - minVal) / range) * chartH;
          const yBar = padTop + chartH - hBar;

          const barColor = item.tauxReponsePct >= 95
            ? '#10b981'
            : item.tauxReponsePct >= 85
            ? '#f59e0b'
            : '#f43f5e';

          const isHov = hoveredIdx === idx;

          return (
            <g
              key={item.cle}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-opacity"
            >
              {/* Fond translucide au survol */}
              {isHov && (
                <rect
                  x={groupX + 4}
                  y={padTop}
                  width={groupW - 8}
                  height={chartH}
                  fill="rgba(255,255,255,0.04)"
                  rx={6}
                />
              )}

              {/* Barre de Taux de Réponse */}
              <rect
                x={barX}
                y={yBar}
                width={barW}
                height={hBar}
                fill={barColor}
                rx={4}
                className="transition-all duration-300"
                opacity={hoveredIdx !== null && !isHov ? 0.45 : 0.95}
              />

              {/* Pourcentage de réponse au-dessus de la barre */}
              <text
                x={barX + barW / 2}
                y={Math.max(padTop - 4, yBar - 5)}
                fill={barColor}
                fontSize={10.5}
                fontFamily="ui-monospace, monospace"
                fontWeight={700}
                textAnchor="middle"
              >
                {item.tauxReponsePct}%
              </text>

              {/* Label de la Famille */}
              <text
                x={groupX + groupW / 2}
                y={height - 22}
                fill={isHov ? '#f8fafc' : '#94a3b8'}
                fontSize={10.5}
                fontWeight={isHov ? 700 : 500}
                textAnchor="middle"
              >
                {item.famille}
              </text>

              {/* Délai moyen de réponse en jours */}
              <text
                x={groupX + groupW / 2}
                y={height - 8}
                fill="#38bdf8"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                ~{item.delaiMoyenReponseJours}j délai
              </text>
            </g>
          );
        })}
      </svg>

      {/* Infobulle interactive flottante */}
      {hoveredItem && (
        <div
          className="absolute z-20 top-2 right-2 bg-slate-950/95 border border-slate-700/90 p-3.5 rounded-xl shadow-2xl text-xs space-y-2 min-w-[220px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredItem.couleur }} />
              {hoveredItem.famille}
            </span>
            <span className={`font-mono font-bold ${
              hoveredItem.tauxReponsePct >= 95 ? 'text-emerald-400' : hoveredItem.tauxReponsePct >= 85 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {hoveredItem.tauxReponsePct}% ponctualité
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Commandes dans les temps :</span>
            <span className="font-bold font-mono text-emerald-400">{hoveredItem.commandesDansLesTemps} cmd</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Commandes en retard :</span>
            <span className="font-bold font-mono text-rose-400">{hoveredItem.commandesEnRetard} cmd</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Délai moyen de réponse :</span>
            <span className="font-bold font-mono text-sky-300">{hoveredItem.delaiMoyenReponseJours} jours ouvrés</span>
          </div>
          <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Date maximale atelier :</span>
            <span className="font-bold font-mono text-slate-200">{hoveredItem.dateLivraisonMax || 'En cours'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT SVG 3 : RENDEMENT PAR FAMILLE (MATIÈRE UTILE, CHUTES, DÉCHETS)
// ─────────────────────────────────────────────────────────────────────────────
const SvgRendementParFamilleChart: React.FC<{ data: RendementFamilleItem[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 560;
  const height = 270;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 32;
  const padBottom = 48;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const minVal = 60;
  const maxVal = 100;
  const range = maxVal - minVal;

  const gridSteps = [60, 70, 80, 90, 100];
  const hoveredItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  // Ligne de référence à 90% Seuil Cible Optimisation
  const y90 = padTop + chartH - ((90 - minVal) / range) * chartH;

  return (
    <div className="relative w-full h-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Lignes de repère horizontales */}
        {gridSteps.map(val => {
          const y = padTop + chartH - ((val - minVal) / range) * chartH;
          return (
            <g key={val}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth={1}
                opacity={0.6}
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                fill="#94a3b8"
                fontSize={10}
                fontFamily="ui-monospace, monospace"
                textAnchor="end"
              >
                {val}%
              </text>
            </g>
          );
        })}

        {/* Ligne Seuil Cible 90% */}
        <line
          x1={padLeft}
          y1={y90}
          x2={width - padRight}
          y2={y90}
          stroke="#10b981"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        <text
          x={width - padRight}
          y={y90 - 5}
          fill="#10b981"
          fontSize={9}
          fontWeight={700}
          textAnchor="end"
        >
          Seuil Cible 90%
        </text>

        {/* Barres empilées de rendement par famille */}
        {data.map((item, idx) => {
          const groupW = chartW / data.length;
          const groupX = padLeft + idx * groupW;
          const barW = Math.min(38, groupW * 0.46);
          const barX = groupX + (groupW - barW) / 2;

          const clampedVal = Math.max(minVal, Math.min(maxVal, item.tauxRendement));
          const hBar = ((clampedVal - minVal) / range) * chartH;
          const yBar = padTop + chartH - hBar;

          const barColor = item.tauxRendement >= 92
            ? '#10b981'
            : item.tauxRendement >= 85
            ? '#f59e0b'
            : '#f43f5e';

          const isHov = hoveredIdx === idx;

          return (
            <g
              key={item.cle}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-opacity"
            >
              {/* Fond translucide au survol */}
              {isHov && (
                <rect
                  x={groupX + 4}
                  y={padTop}
                  width={groupW - 8}
                  height={chartH}
                  fill="rgba(255,255,255,0.04)"
                  rx={6}
                />
              )}

              {/* Barre de rendement matière */}
              <rect
                x={barX}
                y={yBar}
                width={barW}
                height={hBar}
                fill={barColor}
                rx={4}
                className="transition-all duration-300"
                opacity={hoveredIdx !== null && !isHov ? 0.45 : 0.95}
              />

              {/* Valeur en pourcentage au-dessus de la barre */}
              <text
                x={barX + barW / 2}
                y={Math.max(padTop - 4, yBar - 5)}
                fill={barColor}
                fontSize={10.5}
                fontFamily="ui-monospace, monospace"
                fontWeight={700}
                textAnchor="middle"
              >
                {item.tauxRendement}%
              </text>

              {/* Label de la famille */}
              <text
                x={groupX + groupW / 2}
                y={height - 22}
                fill={isHov ? '#f8fafc' : '#94a3b8'}
                fontSize={10.5}
                fontWeight={isHov ? 700 : 500}
                textAnchor="middle"
              >
                {item.famille}
              </text>

              {/* Chutes valorisées en stock */}
              <text
                x={groupX + groupW / 2}
                y={height - 8}
                fill="#f59e0b"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                +{item.chutesStockPct}% chutes
              </text>
            </g>
          );
        })}
      </svg>

      {/* Infobulle interactive flottante */}
      {hoveredItem && (
        <div
          className="absolute z-20 top-2 right-2 bg-slate-950/95 border border-slate-700/90 p-3.5 rounded-xl shadow-2xl text-xs space-y-2 min-w-[220px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredItem.couleur }} />
              {hoveredItem.famille}
            </span>
            <span className="text-emerald-400 font-mono font-bold">{hoveredItem.tauxRendement}% utile</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Matière utile débitée :</span>
            <span className="font-bold font-mono text-emerald-400">{hoveredItem.matiereUtilePct}%</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Chutes réutilisables créées :</span>
            <span className="font-bold font-mono text-amber-400">{hoveredItem.chutesStockPct}%</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Déchets incompressibles :</span>
            <span className="font-bold font-mono text-rose-400">{hoveredItem.dechetPct}%</span>
          </div>
          <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Taux de réemploi des chutes :</span>
            <span className="font-bold font-mono text-sky-300">{hoveredItem.tauxRecyclageChutes}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT SVG : DONUT CHART RÉPARTITION MATIÈRE GLOBALE
// ─────────────────────────────────────────────────────────────────────────────
interface DonutItem {
  name: string;
  value: number;
  color: string;
  desc: string;
}

const SvgDonutChart: React.FC<{
  data: DonutItem[];
  centerValue: string | number;
  centerLabel: string;
}> = ({ data, centerValue, centerLabel }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 78;
  const rInner = 54;

  const total = useMemo(() => data.reduce((acc, d) => acc + d.value, 0) || 1, [data]);

  const segments = useMemo(() => {
    let currentAngle = -Math.PI / 2;

    return data.map((item, idx) => {
      const angle = (item.value / total) * (2 * Math.PI);
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const x1 = cx + rOuter * Math.cos(startAngle);
      const y1 = cy + rOuter * Math.sin(startAngle);
      const x2 = cx + rOuter * Math.cos(endAngle);
      const y2 = cy + rOuter * Math.sin(endAngle);

      const x3 = cx + rInner * Math.cos(endAngle);
      const y3 = cy + rInner * Math.sin(endAngle);
      const x4 = cx + rInner * Math.cos(startAngle);
      const y4 = cy + rInner * Math.sin(startAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      const pathData = [
        `M ${x1} ${y1}`,
        `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z'
      ].join(' ');

      return {
        ...item,
        pathData,
        idx
      };
    });
  }, [data, total, cx, cy, rOuter, rInner]);

  const hoveredItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-48 h-48 overflow-visible"
      >
        {segments.map(seg => {
          const isHov = hoveredIdx === seg.idx;
          return (
            <path
              key={seg.name}
              d={seg.pathData}
              fill={seg.color}
              stroke="#0f172a"
              strokeWidth={2}
              className="transition-all duration-200 cursor-pointer"
              opacity={hoveredIdx !== null && !isHov ? 0.45 : 1}
              transform={isHov ? `scale(1.04) translate(${cx * -0.04}, ${cy * -0.04})` : undefined}
              onMouseEnter={() => setHoveredIdx(seg.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}
      </svg>

      {/* Texte central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="text-xl font-black text-slate-100 font-mono tracking-tight">
          {centerValue}%
        </span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
          {centerLabel}
        </span>
      </div>

      {/* Tooltip au survol */}
      {hoveredItem && (
        <div className="absolute -top-12 z-20 bg-slate-950/95 border border-slate-700/80 px-3 py-1.5 rounded-lg shadow-xl text-xs backdrop-blur-md animate-in fade-in zoom-in-95 pointer-events-none">
          <span className="font-bold text-slate-200">{hoveredItem.name} : </span>
          <span className="font-mono font-bold text-emerald-400">{hoveredItem.value}%</span>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL : MONITORING CHARTS VIEW
// ─────────────────────────────────────────────────────────────────────────────
export const MonitoringChartsView: React.FC<MonitoringChartsViewProps> = ({
  monitoringData,
  dossiers = [],
  suivisOF = [],
  onNavigateToPoste
}) => {
  // Mode d'affichage des 3 volets demandés par l'utilisateur
  const [vueGraphiqueActive, setVueGraphiqueActive] = useState<'PANORAMA' | 'CHARGE' | 'REPONSE' | 'RENDEMENT'>('PANORAMA');
  const [familleFiltre, setFamilleFiltre] = useState<'TOUT' | 'CAISSON' | 'TABLIER' | 'PRECADRE' | 'MOUSTIQUAIRE'>('TOUT');

  const { caissons, tabliers, precadres, moustiquaires } = monitoringData;
  const totalPiecesGlobal = monitoringData.totalPiecesEnFabrication || 1;

  // ===========================================================================
  // 1. CALCUL DE LA CHARGE PAR FAMILLE
  // ===========================================================================
  const donneesChargeParFamille: ChargeFamilleItem[] = useMemo(() => {
    const list: ChargeFamilleItem[] = [
      {
        cle: 'CAISSON',
        famille: 'Caissons & SF',
        chargePieces: caissons.totalPiecesEnCours || 0,
        capaciteJour: caissons.capaciteJournaliere || 120,
        tauxOccupation: caissons.tauxOccupationJour || 0,
        partChargeTotalePct: Math.round(((caissons.totalPiecesEnCours || 0) / totalPiecesGlobal) * 100),
        chargeHeures: Number((caissons.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((caissons.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: caissons.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.CAISSON.main,
        statutCharge: caissons.tauxOccupationJour > 100 ? 'SURCHARGE' : caissons.tauxOccupationJour > 80 ? 'DENSE' : 'FLUIDE'
      },
      {
        cle: 'TABLIER',
        famille: 'Tabliers Volets',
        chargePieces: tabliers.totalPiecesEnCours || 0,
        capaciteJour: tabliers.capaciteJournaliere || 80,
        tauxOccupation: tabliers.tauxOccupationJour || 0,
        partChargeTotalePct: Math.round(((tabliers.totalPiecesEnCours || 0) / totalPiecesGlobal) * 100),
        chargeHeures: Number((tabliers.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((tabliers.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: tabliers.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.TABLIER.main,
        statutCharge: tabliers.tauxOccupationJour > 100 ? 'SURCHARGE' : tabliers.tauxOccupationJour > 80 ? 'DENSE' : 'FLUIDE'
      },
      {
        cle: 'PRECADRE',
        famille: 'Précadres Alu',
        chargePieces: precadres.totalPiecesEnCours || 0,
        capaciteJour: precadres.capaciteJournaliere || 50,
        tauxOccupation: precadres.tauxOccupationJour || 0,
        partChargeTotalePct: Math.round(((precadres.totalPiecesEnCours || 0) / totalPiecesGlobal) * 100),
        chargeHeures: Number((precadres.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((precadres.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: precadres.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.PRECADRE.main,
        statutCharge: precadres.tauxOccupationJour > 100 ? 'SURCHARGE' : precadres.tauxOccupationJour > 80 ? 'DENSE' : 'FLUIDE'
      },
      {
        cle: 'MOUSTIQUAIRE',
        famille: 'Moustiquaires',
        chargePieces: moustiquaires.totalPiecesEnCours || 0,
        capaciteJour: moustiquaires.capaciteJournaliere || 30,
        tauxOccupation: moustiquaires.tauxOccupationJour || 0,
        partChargeTotalePct: Math.round(((moustiquaires.totalPiecesEnCours || 0) / totalPiecesGlobal) * 100),
        chargeHeures: Number((moustiquaires.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((moustiquaires.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: moustiquaires.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.MOUSTIQUAIRE.main,
        statutCharge: moustiquaires.tauxOccupationJour > 100 ? 'SURCHARGE' : moustiquaires.tauxOccupationJour > 80 ? 'DENSE' : 'FLUIDE'
      }
    ];

    if (familleFiltre === 'TOUT') return list;
    return list.filter(item => item.cle === familleFiltre);
  }, [caissons, tabliers, precadres, moustiquaires, totalPiecesGlobal, familleFiltre]);

  // ===========================================================================
  // 2. CALCUL DU TAUX DE RÉPONSE PAR FAMILLE (SLA & RESPECT DES DÉLAIS)
  // ===========================================================================
  const donneesTauxReponseParFamille: TauxReponseItem[] = useMemo(() => {
    const famillesKeys: { cle: FamilleProduit; nom: string; stats: StatsFamilleMonitoring }[] = [
      { cle: 'CAISSON', nom: 'Caissons & SF', stats: caissons },
      { cle: 'TABLIER', nom: 'Tabliers Volets', stats: tabliers },
      { cle: 'PRECADRE', nom: 'Précadres Alu', stats: precadres },
      { cle: 'MOUSTIQUAIRE', nom: 'Moustiquaires', stats: moustiquaires }
    ];

    const list: TauxReponseItem[] = famillesKeys.map(({ cle, nom, stats }) => {
      // Filtrer les commandes de cette famille dans le monitoring
      const cmdsFamille = monitoringData.commandesActives.filter(c => c.famille === cle);
      const totalCmds = cmdsFamille.length || stats.nbCommandesEnCours || 0;

      const nbRetard = cmdsFamille.filter(c => c.alerteDelai?.estDepasse).length;
      const nbAvertissement = cmdsFamille.filter(c => !c.alerteDelai?.estDepasse && c.alerteDelai?.statutDelai === 'ECHEANCE_AUJOURDHUI').length;
      const nbDansLesTemps = Math.max(0, totalCmds - nbRetard);

      let taux = 100;
      if (totalCmds > 0) {
        taux = Math.round((nbDansLesTemps / totalCmds) * 1000) / 10;
      }

      const delaiMoyen = Number((stats.joursOuvresRequis || 1.2).toFixed(1));

      return {
        cle,
        famille: nom,
        tauxReponsePct: Math.min(100, Math.max(0, taux)),
        commandesDansLesTemps: nbDansLesTemps,
        commandesAvertissement: nbAvertissement,
        commandesEnRetard: nbRetard,
        totalCommandes: totalCmds,
        delaiMoyenReponseJours: delaiMoyen,
        delaiMaxJours: Math.ceil(delaiMoyen * 1.5),
        dateLivraisonMax: stats.dateLivraisonJusquAu || 'Dans les temps',
        statutReponse: taux >= 95 ? 'OPTIMAL' : taux >= 85 ? 'VIGILANCE' : 'RETARD',
        couleur: COULEURS_FAMILLES[cle].main
      };
    });

    if (familleFiltre === 'TOUT') return list;
    return list.filter(item => item.cle === familleFiltre);
  }, [caissons, tabliers, precadres, moustiquaires, monitoringData.commandesActives, familleFiltre]);

  const tauxReponseMoyenGlobal = useMemo(() => {
    if (donneesTauxReponseParFamille.length === 0) return 96.5;
    const totalCmds = donneesTauxReponseParFamille.reduce((acc, c) => acc + c.totalCommandes, 0);
    const totalALHeure = donneesTauxReponseParFamille.reduce((acc, c) => acc + c.commandesDansLesTemps, 0);
    if (totalCmds > 0) {
      return Math.round((totalALHeure / totalCmds) * 1000) / 10;
    }
    const somme = donneesTauxReponseParFamille.reduce((acc, c) => acc + c.tauxReponsePct, 0);
    return Math.round((somme / donneesTauxReponseParFamille.length) * 10) / 10;
  }, [donneesTauxReponseParFamille]);

  // ===========================================================================
  // 3. CALCUL DU RENDEMENT MATIÈRE PAR FAMILLE
  // ===========================================================================
  const donneesRendementParFamille: RendementFamilleItem[] = useMemo(() => {
    const famillesKeys: { cle: FamilleProduit; nom: string; stats: StatsFamilleMonitoring; defaultRend: number }[] = [
      { cle: 'CAISSON', nom: 'Caissons & SF', stats: caissons, defaultRend: 94.2 },
      { cle: 'TABLIER', nom: 'Tabliers Volets', stats: tabliers, defaultRend: 95.8 },
      { cle: 'PRECADRE', nom: 'Précadres Alu', stats: precadres, defaultRend: 91.8 },
      { cle: 'MOUSTIQUAIRE', nom: 'Moustiquaires', stats: moustiquaires, defaultRend: 92.5 }
    ];

    const list: RendementFamilleItem[] = famillesKeys.map(({ cle, nom, stats, defaultRend }) => {
      const ofsFamille = suivisOF.filter(o => o.famille === cle);
      let longueurEngageeMm = 0;
      let longueurUtileMm = 0;
      let longueurChutesStockMm = 0;
      let longueurDechetMm = 0;
      let barresNeuvesTotal = 0;
      let chutesUtiliseesTotal = 0;

      ofsFamille.forEach(of => {
        barresNeuvesTotal += of.totalBarresNeuvesPrevu || 0;
        chutesUtiliseesTotal += of.totalChutesUtiliseesPrevu || 0;

        (of.lignesRetour || []).forEach(l => {
          const lg = l.longueurSourceReelle || l.longueurPrevue || 6000;
          const reste = l.resteReelMesureMm !== undefined ? l.resteReelMesureMm : (l.restePrevuMm || 0);
          longueurEngageeMm += lg;
          const utile = Math.max(0, lg - reste);
          longueurUtileMm += utile;

          if (l.actionReste === 'DECHET' || reste < 300) {
            longueurDechetMm += reste;
          } else {
            longueurChutesStockMm += reste;
          }
        });
      });

      let tauxRendement = defaultRend;
      let matiereUtilePct = defaultRend;
      let chutesStockPct = Math.round((100 - defaultRend) * 0.75 * 10) / 10;
      let dechetPct = Math.round((100 - matiereUtilePct - chutesStockPct) * 10) / 10;

      if (longueurEngageeMm > 0) {
        tauxRendement = Math.round((longueurUtileMm / longueurEngageeMm) * 1000) / 10;
        matiereUtilePct = Math.min(99, Math.max(60, tauxRendement));
        chutesStockPct = Math.round((longueurChutesStockMm / longueurEngageeMm) * 1000) / 10;
        dechetPct = Math.max(0, Math.round((100 - matiereUtilePct - chutesStockPct) * 10) / 10);
      } else if (stats.totalPiecesEnCours > 0) {
        barresNeuvesTotal = Math.max(1, Math.ceil(stats.totalPiecesEnCours / 3.5));
        chutesUtiliseesTotal = Math.max(0, Math.floor(barresNeuvesTotal * 0.35));
      }

      const totalProfils = barresNeuvesTotal + chutesUtiliseesTotal;
      const tauxRecyclageChutes = totalProfils > 0
        ? Math.round((chutesUtiliseesTotal / totalProfils) * 100)
        : 28;

      return {
        cle,
        famille: nom,
        tauxRendement: Math.min(100, Math.max(70, Number(tauxRendement.toFixed(1)))),
        matiereUtilePct,
        chutesStockPct,
        dechetPct,
        tauxRecyclageChutes,
        gainMatiereEstimePct: Math.round((tauxRendement - 82) * 10) / 10,
        statutRendement: tauxRendement >= 92 ? 'OPTIMAL' : tauxRendement >= 85 ? 'CORRECT' : 'A_AMELIORER',
        couleur: COULEURS_FAMILLES[cle].main
      };
    });

    if (familleFiltre === 'TOUT') return list;
    return list.filter(item => item.cle === familleFiltre);
  }, [caissons, tabliers, precadres, moustiquaires, suivisOF, familleFiltre]);

  const tauxRendementMoyenGlobal = useMemo(() => {
    if (donneesRendementParFamille.length === 0) return 93.8;
    const somme = donneesRendementParFamille.reduce((acc, curr) => acc + curr.tauxRendement, 0);
    return Math.round((somme / donneesRendementParFamille.length) * 10) / 10;
  }, [donneesRendementParFamille]);

  // Donut de répartition matière globale
  const donneesMatiereGlobale: DonutItem[] = useMemo(() => {
    let totalUtile = 0;
    let totalChutes = 0;
    let totalDechet = 0;

    donneesRendementParFamille.forEach(d => {
      totalUtile += d.matiereUtilePct;
      totalChutes += d.chutesStockPct;
      totalDechet += d.dechetPct;
    });

    const total = totalUtile + totalChutes + totalDechet || 1;
    const utilePct = Math.round((totalUtile / total) * 1000) / 10;
    const chutesPct = Math.round((totalChutes / total) * 1000) / 10;
    const dechetPct = Math.max(0, Math.round((100 - utilePct - chutesPct) * 10) / 10);

    return [
      { name: 'Matière Utile Coupée', value: utilePct, color: '#10b981', desc: 'Profilés intégrés aux produits finis' },
      { name: 'Chutes Réutilisables en Stock', value: chutesPct, color: '#f59e0b', desc: 'Chutes valorisées pour futures commandes' },
      { name: 'Déchets & Pertes Scie', value: dechetPct, color: '#f43f5e', desc: 'Chutes incompressibles < 300mm et traits de coupe' }
    ];
  }, [donneesRendementParFamille]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* ── BARRE DE CONTRÔLE PRINCIPALE : LES 3 VOLETS CLÉS ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sélecteur des 3 axes demandés */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 flex-wrap">
            <button
              onClick={() => setVueGraphiqueActive('PANORAMA')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                vueGraphiqueActive === 'PANORAMA'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Panorama Complet (3 Volets)</span>
            </button>

            <button
              onClick={() => setVueGraphiqueActive('CHARGE')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                vueGraphiqueActive === 'CHARGE'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-amber-400" />
              <span>⚡ 1. Charge par Famille</span>
            </button>

            <button
              onClick={() => setVueGraphiqueActive('REPONSE')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                vueGraphiqueActive === 'REPONSE'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Timer className="w-3.5 h-3.5 text-sky-400" />
              <span>⏱️ 2. Taux de Réponse</span>
            </button>

            <button
              onClick={() => setVueGraphiqueActive('RENDEMENT')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                vueGraphiqueActive === 'RENDEMENT'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>♻️ 3. Rendement par Famille</span>
            </button>
          </div>

          {/* Filtre par Famille */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center gap-1">
              <Filter className="w-3 h-3 text-amber-400" />
              Filtrer :
            </span>
            <button
              onClick={() => setFamilleFiltre('TOUT')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                familleFiltre === 'TOUT' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Toutes
            </button>
            <button
              onClick={() => setFamilleFiltre('CAISSON')}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                familleFiltre === 'CAISSON' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📦 Caissons
            </button>
            <button
              onClick={() => setFamilleFiltre('TABLIER')}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                familleFiltre === 'TABLIER' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🪟 Tabliers
            </button>
            <button
              onClick={() => setFamilleFiltre('PRECADRE')}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                familleFiltre === 'PRECADRE' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🚪 Précadres
            </button>
            <button
              onClick={() => setFamilleFiltre('MOUSTIQUAIRE')}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                familleFiltre === 'MOUSTIQUAIRE' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🦟 Moustiquaires
            </button>
          </div>
        </div>

        {/* ── 3 CARTES RÉCAPITULATIVES HAUTE VISIBILITÉ ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* KPI 1 : Charge */}
          <div
            onClick={() => setVueGraphiqueActive('CHARGE')}
            className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
              vueGraphiqueActive === 'CHARGE'
                ? 'bg-amber-500/15 border-amber-500/50 shadow-md shadow-amber-500/10'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Charge Totale en Usinage
                </div>
                <div className="text-lg font-black text-slate-100 font-mono mt-0.5">
                  {monitoringData.totalPiecesEnFabrication} <span className="text-xs font-normal text-slate-400">pièces</span>
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-amber-950/80 text-amber-300 border border-amber-800">
              {monitoringData.chargeTotaleHeures} h
            </span>
          </div>

          {/* KPI 2 : Taux de Réponse */}
          <div
            onClick={() => setVueGraphiqueActive('REPONSE')}
            className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
              vueGraphiqueActive === 'REPONSE'
                ? 'bg-sky-500/15 border-sky-500/50 shadow-md shadow-sky-500/10'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Taux de Réponse &amp; Ponctualité
                </div>
                <div className="text-lg font-black text-sky-300 font-mono mt-0.5">
                  {tauxReponseMoyenGlobal}% <span className="text-xs font-normal text-slate-400">à l'heure</span>
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-sky-950/80 text-sky-300 border border-sky-800">
              Cible : 95%
            </span>
          </div>

          {/* KPI 3 : Rendement Matière */}
          <div
            onClick={() => setVueGraphiqueActive('RENDEMENT')}
            className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
              vueGraphiqueActive === 'RENDEMENT'
                ? 'bg-emerald-500/15 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Rendement Matière Utile
                </div>
                <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                  {tauxRendementMoyenGlobal}% <span className="text-xs font-normal text-slate-400">optimisé</span>
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-800">
              Seuil : 90%
            </span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 1 : GRAPHIQUE CHARGE PAR FAMILLE                              */}
      {/* ===================================================================== */}
      {(vueGraphiqueActive === 'PANORAMA' || vueGraphiqueActive === 'CHARGE') && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>Charge par Famille &amp; Saturation de Découpe</span>
                  <span className="text-xs font-normal text-amber-400 bg-amber-950/70 border border-amber-800/80 px-2 py-0.5 rounded-full">
                    Pièces en cours vs Capacité jour
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Volume de pièces en attente d'usinage, saturation quotidienne et part de chaque famille dans la charge globale atelier
                </p>
              </div>
            </div>

            {/* Légende */}
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                Pièces en File Actuelle
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-3 rounded-xs bg-sky-400 inline-block" />
                Capacité Nominale (pcs/j)
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <SvgChargeParFamilleChart data={donneesChargeParFamille} />
          </div>

          {/* Cartes de synthèse de la charge par famille */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
            {donneesChargeParFamille.map(item => (
              <div
                key={item.cle}
                onClick={() => onNavigateToPoste && onNavigateToPoste(item.cle)}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 hover:border-amber-500/50 transition cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 group-hover:text-amber-300 flex items-center gap-1.5 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.couleur }} />
                    {item.famille}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    item.statutCharge === 'SURCHARGE'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : item.statutCharge === 'DENSE'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    {item.statutCharge}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-lg font-black font-mono text-slate-100">
                    {item.chargePieces} <span className="text-xs font-normal text-slate-400">pcs</span>
                  </span>
                  <span className="text-xs font-mono text-amber-400 font-bold">
                    {item.tauxOccupation}% sat.
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between mt-1 pt-1 border-t border-slate-800/60">
                  <span>Part atelier : <strong>{item.partChargeTotalePct}%</strong></span>
                  <span>Temps : <strong>{item.chargeHeures}h</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2 : GRAPHIQUE TAUX DE RÉPONSE & RESPECT DES DÉLAIS (SLA)      */}
      {/* ===================================================================== */}
      {(vueGraphiqueActive === 'PANORAMA' || vueGraphiqueActive === 'REPONSE') && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>Taux de Réponse &amp; Ponctualité de Livraison par Famille</span>
                  <span className="text-xs font-normal text-sky-400 bg-sky-950/70 border border-sky-800/80 px-2 py-0.5 rounded-full">
                    SLA &amp; Respect des délais promis
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pourcentage des commandes livrées dans les temps impartis, délais moyens de réponse et surveillance des retards
                </p>
              </div>
            </div>

            {/* Légende */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                ≥ 95% (Optimal)
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                85-94% (Vigilance)
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                &lt; 85% (Retard)
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <SvgTauxReponseChart data={donneesTauxReponseParFamille} />
          </div>

          {/* Cartes de synthèse du Taux de Réponse par famille */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
            {donneesTauxReponseParFamille.map(item => (
              <div
                key={item.cle}
                onClick={() => onNavigateToPoste && onNavigateToPoste(item.cle)}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 hover:border-sky-500/50 transition cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 group-hover:text-sky-300 flex items-center gap-1.5 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.couleur }} />
                    {item.famille}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    item.statutReponse === 'OPTIMAL'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : item.statutReponse === 'VIGILANCE'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}>
                    {item.statutReponse}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <span className={`text-lg font-black font-mono ${
                    item.tauxReponsePct >= 95 ? 'text-emerald-400' : item.tauxReponsePct >= 85 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {item.tauxReponsePct}%
                  </span>
                  <span className="text-xs font-mono text-sky-400 font-bold">
                    ~{item.delaiMoyenReponseJours}j cycle
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between mt-1 pt-1 border-t border-slate-800/60">
                  <span className="text-emerald-400">✓ {item.commandesDansLesTemps} à l'heure</span>
                  <span className={item.commandesEnRetard > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                    {item.commandesEnRetard > 0 ? `⚠️ ${item.commandesEnRetard} retard` : '0 retard'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3 : GRAPHIQUE RENDEMENT PAR FAMILLE & BILAN MATIÈRE           */}
      {/* ===================================================================== */}
      {(vueGraphiqueActive === 'PANORAMA' || vueGraphiqueActive === 'RENDEMENT') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* GRAPHIQUE PRINCIPAL : RENDEMENT MATIÈRE PAR FAMILLE (2/3) */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>Rendement Matière par Famille (%)</span>
                      <span className="text-xs font-normal text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                        Seuil cible 90%
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Taux net utile de découpe d'aluminium, valorisation des chutes en stock et réduction des pertes
                    </p>
                  </div>
                </div>

                {/* Légende */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    ≥ 92% (Optimal)
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                    85-91% (Correct)
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    &lt; 85%
                  </span>
                </div>
              </div>

              <div className="h-72 w-full mt-2">
                <SvgRendementParFamilleChart data={donneesRendementParFamille} />
              </div>
            </div>

            {/* Cartes de synthèse rendement par famille */}
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-800 text-center mt-3">
              {donneesRendementParFamille.map(item => (
                <div key={item.cle} className="p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 truncate">{item.famille}</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">{item.tauxRendement}%</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    Déchet : <span className="text-rose-400 font-mono">{item.dechetPct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GRAPHIQUE SECONDAIRE : DONUT DE RÉPARTITION MATIÈRE GLOBALE (1/3) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                    <PieChartIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Bilan Matière Global</h3>
                    <p className="text-[11px] text-slate-400">Profilés engagés en atelier</p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono font-bold">
                  100% Matière
                </span>
              </div>

              <div className="h-56 w-full mt-2 relative flex items-center justify-center">
                <SvgDonutChart
                  data={donneesMatiereGlobale}
                  centerValue={tauxRendementMoyenGlobal}
                  centerLabel="Rendement"
                />
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              {donneesMatiereGlobale.map(item => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-300 text-[11px] truncate max-w-[170px]">{item.name}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-100">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TABLEAU ANALYTIQUE COMPLET DE SYNTHÈSE INDUSTRIELLE                   */}
      {/* ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-slate-100">
              Synthèse Détaillée : Charge, Taux de Réponse &amp; Rendement par Famille
            </h4>
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
            Synchronisation temps réel avec la base de fabrication
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Famille de Produit</th>
                <th className="py-3 px-3 text-right">Commandes</th>
                <th className="py-3 px-3 text-right">Charge (Pièces)</th>
                <th className="py-3 px-3 text-right">Part Charge</th>
                <th className="py-3 px-3 text-right">Temps Estimé</th>
                <th className="py-3 px-3 text-right">Taux de Réponse</th>
                <th className="py-3 px-3 text-right">Délai Moyen</th>
                <th className="py-3 px-3 text-right">Rendement Matière</th>
                <th className="py-3 px-3 text-right">Chutes Stockées</th>
                <th className="py-3 px-3 text-right">Pertes Scie</th>
                <th className="py-3 px-4 text-center">Statut Global</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {donneesChargeParFamille.map(c => {
                const reponse = donneesTauxReponseParFamille.find(r => r.cle === c.cle);
                const rend = donneesRendementParFamille.find(r => r.cle === c.cle);

                return (
                  <tr
                    key={c.cle}
                    onClick={() => onNavigateToPoste && onNavigateToPoste(c.cle)}
                    className="hover:bg-slate-800/50 cursor-pointer transition select-none"
                  >
                    <td className="py-3 px-4 font-bold text-slate-100 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.couleur }} />
                      {c.famille}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {c.commandesCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300">
                      {c.chargePieces} pcs
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">
                      {c.partChargeTotalePct}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {c.chargeHeures} h ({c.joursRequis} j)
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        (reponse?.tauxReponsePct || 100) >= 95
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : (reponse?.tauxReponsePct || 100) >= 85
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {reponse?.tauxReponsePct || 100}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sky-300 font-bold">
                      ~{reponse?.delaiMoyenReponseJours || c.joursRequis} j
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                      {rend?.tauxRendement || 93}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-400">
                      +{rend?.chutesStockPct || 4}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-400">
                      {rend?.dechetPct || 3}%
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        c.statutCharge === 'SURCHARGE' || (reponse?.statutReponse === 'RETARD')
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : c.statutCharge === 'DENSE' || (reponse?.statutReponse === 'VIGILANCE')
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}>
                        {c.statutCharge === 'SURCHARGE'
                          ? '🚨 Surcharge'
                          : (reponse?.statutReponse === 'RETARD')
                          ? '⚠️ Retards'
                          : c.statutCharge === 'DENSE'
                          ? '⚡ Flux Dense'
                          : '✓ Optimal'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
