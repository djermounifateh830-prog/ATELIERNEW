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
  Boxes
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
// COMPOSANT SVG : BAR CHART GROUPÉ (CADENCE VS CAPACITÉ NOMINALE)
// ─────────────────────────────────────────────────────────────────────────────
interface CadenceItem {
  cle: string;
  famille: string;
  chargePieces: number;
  capaciteJour: number;
  tauxOccupation: number;
  chargeHeures: number;
  joursRequis: number;
  commandesCount: number;
  couleur: string;
}

const SvgCadenceBarChart: React.FC<{ data: CadenceItem[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 520;
  const height = 260;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 45;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = useMemo(() => {
    const vals = data.flatMap(d => [d.chargePieces, d.capaciteJour]);
    const max = Math.max(10, ...vals);
    return Math.ceil(max / 20) * 20;
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
          const barW = Math.min(22, groupW * 0.28);
          const gap = 4;

          const hCharge = Math.max(2, (item.chargePieces / maxVal) * chartH);
          const yCharge = padTop + chartH - hCharge;

          const hCap = Math.max(2, (item.capaciteJour / maxVal) * chartH);
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

              {/* Barre 1 : Pièces en charge (Amber) */}
              <rect
                x={barX1}
                y={yCharge}
                width={barW}
                height={hCharge}
                fill="#f59e0b"
                rx={4}
                className="transition-all duration-300"
                opacity={hoveredIdx !== null && !isHov ? 0.45 : 0.95}
              />

              {/* Barre 2 : Capacité jour (Sky) */}
              <rect
                x={barX2}
                y={yCap}
                width={barW}
                height={hCap}
                fill="#0284c7"
                rx={4}
                className="transition-all duration-300"
                opacity={hoveredIdx !== null && !isHov ? 0.45 : 0.95}
              />

              {/* Label de l'axe X */}
              <text
                x={groupX + groupW / 2}
                y={height - 18}
                fill={isHov ? '#f8fafc' : '#94a3b8'}
                fontSize={10.5}
                fontWeight={isHov ? 700 : 500}
                textAnchor="middle"
              >
                {item.famille}
              </text>

              {/* Valeurs rapides au-dessus des barres */}
              <text
                x={barX1 + barW / 2}
                y={Math.max(padTop - 4, yCharge - 4)}
                fill="#f59e0b"
                fontSize={9}
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
            </g>
          );
        })}
      </svg>

      {/* Infobulle interactive flottante */}
      {hoveredItem && (
        <div
          className="absolute z-20 top-2 right-2 bg-slate-950/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[210px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>{hoveredItem.famille}</span>
            <span className="text-amber-400 font-mono font-bold">{hoveredItem.tauxOccupation}% saturation</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Charge en cours :</span>
            <span className="font-bold font-mono text-amber-300">{hoveredItem.chargePieces} pcs</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Capacité nominale :</span>
            <span className="font-bold font-mono text-sky-300">{hoveredItem.capaciteJour} pcs/j</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Temps estimé :</span>
            <span className="font-bold font-mono text-emerald-300">{hoveredItem.chargeHeures} h ({hoveredItem.joursRequis} j)</span>
          </div>
          <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Commandes en file :</span>
            <span className="font-bold font-mono text-slate-200">{hoveredItem.commandesCount} cmd(s)</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT SVG : BAR CHART RENDEMENT MATIÈRE (%) AVEC SEUIL CIBLE 90%
// ─────────────────────────────────────────────────────────────────────────────
interface RendementItem {
  cle: string;
  famille: string;
  tauxRendement: number;
  matiereUtilePct: number;
  chutesStockPct: number;
  dechetPct: number;
  tauxRecyclageChutes: number;
}

const SvgRendementBarChart: React.FC<{ data: RendementItem[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 520;
  const height = 260;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 45;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const minVal = 60;
  const maxVal = 100;
  const range = maxVal - minVal;

  const gridSteps = [60, 70, 80, 90, 100];
  const hoveredItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  // Ligne de référence à 90%
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
          y={y90 - 4}
          fill="#10b981"
          fontSize={9.5}
          fontWeight={700}
          textAnchor="end"
        >
          Seuil Cible 90%
        </text>

        {/* Barres par famille */}
        {data.map((item, idx) => {
          const groupW = chartW / data.length;
          const groupX = padLeft + idx * groupW;
          const barW = Math.min(36, groupW * 0.45);
          const barX = groupX + (groupW - barW) / 2;

          const clampedVal = Math.max(minVal, Math.min(maxVal, item.tauxRendement));
          const hBar = ((clampedVal - minVal) / range) * chartH;
          const yBar = padTop + chartH - hBar;

          const barColor = item.tauxRendement >= 92 ? '#10b981' : item.tauxRendement >= 85 ? '#f59e0b' : '#f43f5e';
          const isHov = hoveredIdx === idx;

          return (
            <g
              key={item.cle}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-opacity"
            >
              {/* Fond au survol */}
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

              {/* Barre de rendement */}
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
                fontSize={10}
                fontFamily="ui-monospace, monospace"
                fontWeight={700}
                textAnchor="middle"
              >
                {item.tauxRendement}%
              </text>

              {/* Label axe X */}
              <text
                x={groupX + groupW / 2}
                y={height - 18}
                fill={isHov ? '#f8fafc' : '#94a3b8'}
                fontSize={10.5}
                fontWeight={isHov ? 700 : 500}
                textAnchor="middle"
              >
                {item.famille}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Infobulle interactive */}
      {hoveredItem && (
        <div
          className="absolute z-20 top-2 right-2 bg-slate-950/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[210px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>{hoveredItem.famille}</span>
            <span className="text-emerald-400 font-mono font-bold">{hoveredItem.tauxRendement}% utile</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Matière utile coupée :</span>
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
            <span className="text-slate-400">Taux circularité (chutes réemployées) :</span>
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

  // Calcul des chemins SVG en arcs pour chaque part
  const segments = useMemo(() => {
    let currentAngle = -Math.PI / 2; // Démarrer en haut (12h)

    return data.map((item, idx) => {
      const angle = (item.value / total) * (2 * Math.PI);
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      // Coordonnées pour l'arc extérieur et intérieur
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
// COMPOSANT SVG : PROJECTION DE CADENCE PAR JOURS (AREA CHART AVEC GRADIENTS)
// ─────────────────────────────────────────────────────────────────────────────
interface TimelineDay {
  jour: string;
  Caissons: number;
  Tabliers: number;
  Precadres: number;
  Moustiquaires: number;
  TotalJour: number;
  CapaciteCibleAtelier: number;
}

const SvgTimelineAreaChart: React.FC<{ data: TimelineDay[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 560;
  const height = 240;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = useMemo(() => {
    const totals = data.map(d => d.TotalJour);
    const max = Math.max(60, ...totals);
    return Math.ceil(max / 25) * 25;
  }, [data]);

  const stepCount = 4;
  const gridSteps = Array.from({ length: stepCount + 1 }, (_, i) => Math.round((maxVal / stepCount) * i));

  // Calcul des coordonnées X et Y pour la courbe Total
  const points = useMemo(() => {
    return data.map((d, i) => {
      const x = padLeft + (i / Math.max(1, data.length - 1)) * chartW;
      const y = padTop + chartH - (d.TotalJour / maxVal) * chartH;
      return { x, y, data: d };
    });
  }, [data, chartW, chartH, maxVal, padLeft, padTop]);

  // Construction du chemin SVG (courbe + aire sous la courbe)
  const { linePath, areaPath } = useMemo(() => {
    if (points.length === 0) return { linePath: '', areaPath: '' };

    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      // Courbe douce Bézier cubique
      const prev = points[i - 1];
      const curr = points[i];
      const cpX1 = prev.x + (curr.x - prev.x) / 2;
      const cpX2 = cpX1;
      line += ` C ${cpX1} ${prev.y}, ${cpX2} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const bottomY = padTop + chartH;
    const area = `${line} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

    return { linePath: line, areaPath: area };
  }, [points, padTop, chartH]);

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="relative w-full h-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="svgTimelineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0284c7" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
          </linearGradient>
        </defs>

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

        {/* Aire remplie sous la courbe */}
        {areaPath && (
          <path d={areaPath} fill="url(#svgTimelineGradient)" />
        )}

        {/* Ligne principale */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}

        {/* Points et zones d'interaction */}
        {points.map((pt, idx) => {
          const isHov = hoveredIdx === idx;
          return (
            <g
              key={pt.data.jour}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              {/* Ligne verticale au survol */}
              {isHov && (
                <line
                  x1={pt.x}
                  y1={padTop}
                  x2={pt.x}
                  y2={padTop + chartH}
                  stroke="#38bdf8"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                />
              )}

              {/* Point sur la courbe */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHov ? 6 : 4}
                fill={isHov ? '#ffffff' : '#0284c7'}
                stroke="#38bdf8"
                strokeWidth={2}
                className="transition-all duration-150"
              />

              {/* Label jour sur axe X */}
              <text
                x={pt.x}
                y={height - 12}
                fill={isHov ? '#f8fafc' : '#94a3b8'}
                fontSize={10}
                fontWeight={isHov ? 700 : 500}
                textAnchor="middle"
              >
                {pt.data.jour}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Infobulle interactive flottante */}
      {hoveredPoint && (
        <div
          className="absolute z-20 top-2 right-2 bg-slate-950/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[200px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1">
            {hoveredPoint.data.jour}
          </div>
          <div className="flex justify-between text-amber-300">
            <span>Caissons :</span>
            <span className="font-mono font-bold">{hoveredPoint.data.Caissons} pcs</span>
          </div>
          <div className="flex justify-between text-sky-300">
            <span>Tabliers :</span>
            <span className="font-mono font-bold">{hoveredPoint.data.Tabliers} pcs</span>
          </div>
          <div className="flex justify-between text-purple-300">
            <span>Précadres :</span>
            <span className="font-mono font-bold">{hoveredPoint.data.Precadres} pcs</span>
          </div>
          <div className="flex justify-between text-emerald-300">
            <span>Moustiquaires :</span>
            <span className="font-mono font-bold">{hoveredPoint.data.Moustiquaires} pcs</span>
          </div>
          <div className="flex justify-between text-slate-100 font-bold pt-1.5 border-t border-slate-800">
            <span>Total Usiné Jour :</span>
            <span className="font-mono text-cyan-300">{hoveredPoint.data.TotalJour} pcs</span>
          </div>
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
  const [periodeFiltre, setPeriodeFiltre] = useState<'TOUT' | 'CAISSON' | 'TABLIER' | 'PRECADRE' | 'MOUSTIQUAIRE'>('TOUT');

  const { caissons, tabliers, precadres, moustiquaires } = monitoringData;

  // 1. DONNÉES DE CADENCE & CHARGE PAR FAMILLE
  const donneesCadences: CadenceItem[] = useMemo(() => {
    const list: CadenceItem[] = [
      {
        cle: 'CAISSON',
        famille: 'Caissons & SF',
        chargePieces: caissons.totalPiecesEnCours || 0,
        capaciteJour: caissons.capaciteJournaliere || 120,
        tauxOccupation: caissons.tauxOccupationJour || 0,
        chargeHeures: Number((caissons.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((caissons.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: caissons.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.CAISSON.main
      },
      {
        cle: 'TABLIER',
        famille: 'Tabliers Volets',
        chargePieces: tabliers.totalPiecesEnCours || 0,
        capaciteJour: tabliers.capaciteJournaliere || 80,
        tauxOccupation: tabliers.tauxOccupationJour || 0,
        chargeHeures: Number((tabliers.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((tabliers.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: tabliers.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.TABLIER.main
      },
      {
        cle: 'PRECADRE',
        famille: 'Précadres Alu',
        chargePieces: precadres.totalPiecesEnCours || 0,
        capaciteJour: precadres.capaciteJournaliere || 50,
        tauxOccupation: precadres.tauxOccupationJour || 0,
        chargeHeures: Number((precadres.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((precadres.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: precadres.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.PRECADRE.main
      },
      {
        cle: 'MOUSTIQUAIRE',
        famille: 'Moustiquaires',
        chargePieces: moustiquaires.totalPiecesEnCours || 0,
        capaciteJour: moustiquaires.capaciteJournaliere || 30,
        tauxOccupation: moustiquaires.tauxOccupationJour || 0,
        chargeHeures: Number((moustiquaires.chargeHeuresEstimee || 0).toFixed(1)),
        joursRequis: Number((moustiquaires.joursOuvresRequis || 0).toFixed(1)),
        commandesCount: moustiquaires.nbCommandesEnCours || 0,
        couleur: COULEURS_FAMILLES.MOUSTIQUAIRE.main
      }
    ];

    if (periodeFiltre === 'TOUT') return list;
    return list.filter(item => item.cle === periodeFiltre);
  }, [caissons, tabliers, precadres, moustiquaires, periodeFiltre]);

  // 2. DONNÉES DU TAUX D'UTILISATION MATIÈRE
  const donneesRendementMatiere: RendementItem[] = useMemo(() => {
    const famillesKeys: FamilleProduit[] = ['CAISSON', 'TABLIER', 'PRECADRE', 'MOUSTIQUAIRE'];

    const statsParFamille = famillesKeys.map(famKey => {
      const ofsFamille = suivisOF.filter(o => o.famille === famKey);
      let barresNeuvesTotal = 0;
      let chutesUtiliseesTotal = 0;
      let longueurEngageeMm = 0;
      let longueurUtileMm = 0;
      let longueurChutesStockMm = 0;
      let longueurDechetMm = 0;

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

      let pieces = 0;
      let tauxBaseTheorique = 93.5;
      let nomFamille = 'Caissons';

      if (famKey === 'CAISSON') {
        pieces = caissons.totalPiecesEnCours || 0;
        tauxBaseTheorique = 94.2;
        nomFamille = 'Caissons & SF';
      } else if (famKey === 'TABLIER') {
        pieces = tabliers.totalPiecesEnCours || 0;
        tauxBaseTheorique = 95.8;
        nomFamille = 'Tabliers Volets';
      } else if (famKey === 'PRECADRE') {
        pieces = precadres.totalPiecesEnCours || 0;
        tauxBaseTheorique = 91.8;
        nomFamille = 'Précadres';
      } else {
        pieces = moustiquaires.totalPiecesEnCours || 0;
        tauxBaseTheorique = 92.5;
        nomFamille = 'Moustiquaires';
      }

      let tauxRendement = tauxBaseTheorique;
      let matiereUtilePct = tauxBaseTheorique;
      let chutesStockPct = Math.round((100 - tauxBaseTheorique) * 0.75 * 10) / 10;
      let dechetPct = Math.round((100 - matiereUtilePct - chutesStockPct) * 10) / 10;

      if (longueurEngageeMm > 0) {
        tauxRendement = Math.round((longueurUtileMm / longueurEngageeMm) * 1000) / 10;
        matiereUtilePct = Math.min(99, Math.max(60, tauxRendement));
        chutesStockPct = Math.round((longueurChutesStockMm / longueurEngageeMm) * 1000) / 10;
        dechetPct = Math.max(0, Math.round((100 - matiereUtilePct - chutesStockPct) * 10) / 10);
      } else if (pieces > 0) {
        barresNeuvesTotal = Math.max(1, Math.ceil(pieces / 3.5));
        chutesUtiliseesTotal = Math.max(0, Math.floor(barresNeuvesTotal * 0.35));
      }

      const totalProfils = barresNeuvesTotal + chutesUtiliseesTotal;
      const tauxRecyclageChutes = totalProfils > 0
        ? Math.round((chutesUtiliseesTotal / totalProfils) * 100)
        : 28;

      return {
        cle: famKey,
        famille: nomFamille,
        tauxRendement: Math.min(100, Math.max(70, Number(tauxRendement.toFixed(1)))),
        matiereUtilePct,
        chutesStockPct,
        dechetPct,
        tauxRecyclageChutes
      };
    });

    if (periodeFiltre === 'TOUT') return statsParFamille;
    return statsParFamille.filter(s => s.cle === periodeFiltre);
  }, [suivisOF, caissons, tabliers, precadres, moustiquaires, periodeFiltre]);

  // 3. RÉPARTITION GLOBALE DE LA MATIÈRE ENGAGÉE (DONUT)
  const donneesMatiereGlobale: DonutItem[] = useMemo(() => {
    let totalUtile = 0;
    let totalChutes = 0;
    let totalDechet = 0;

    donneesRendementMatiere.forEach(d => {
      totalUtile += d.matiereUtilePct;
      totalChutes += d.chutesStockPct;
      totalDechet += d.dechetPct;
    });

    const total = totalUtile + totalChutes + totalDechet || 1;
    const utilePct = Math.round((totalUtile / total) * 1000) / 10;
    const chutesPct = Math.round((totalChutes / total) * 1000) / 10;
    const dechetPct = Math.max(0, Math.round((100 - utilePct - chutesPct) * 10) / 10);

    return [
      { name: 'Matière Utile Découpée', value: utilePct, color: '#10b981', desc: 'Intégrée aux produits finis' },
      { name: 'Chutes Réutilisables en Stock', value: chutesPct, color: '#f59e0b', desc: 'Sauvegardées pour futures coupes' },
      { name: 'Déchets / Retailles Incompressibles', value: dechetPct, color: '#f43f5e', desc: 'Chutes < 300mm et pertes scies' }
    ];
  }, [donneesRendementMatiere]);

  const tauxMatiereMoyen = useMemo(() => {
    if (donneesRendementMatiere.length === 0) return 93.8;
    const somme = donneesRendementMatiere.reduce((acc, curr) => acc + curr.tauxRendement, 0);
    return Math.round((somme / donneesRendementMatiere.length) * 10) / 10;
  }, [donneesRendementMatiere]);

  // 4. CHRONOLOGIE DES CADENCES PRÉVISIONNELLES
  const timelineCadencesJours: TimelineDay[] = useMemo(() => {
    const joursLabels = ['Aujourd\'hui (J)', 'J+1 (Demain)', 'J+2', 'J+3', 'J+4', 'J+5'];

    return joursLabels.map((jour, idx) => {
      const coefCaiss = idx === 0 ? 0.35 : idx === 1 ? 0.30 : idx === 2 ? 0.20 : 0.15;
      const coefTabl = idx === 0 ? 0.30 : idx === 1 ? 0.35 : idx === 2 ? 0.20 : 0.15;
      const coefPrec = idx === 0 ? 0.40 : idx === 1 ? 0.30 : idx === 2 ? 0.20 : 0.10;
      const coefMstq = idx === 0 ? 0.35 : idx === 1 ? 0.30 : idx === 2 ? 0.25 : 0.10;

      const pCaiss = Math.round((caissons.totalPiecesEnCours || 0) * (coefCaiss / 1.5));
      const pTabl = Math.round((tabliers.totalPiecesEnCours || 0) * (coefTabl / 1.5));
      const pPrec = Math.round((precadres.totalPiecesEnCours || 0) * (coefPrec / 1.5));
      const pMstq = Math.round((moustiquaires.totalPiecesEnCours || 0) * (coefMstq / 1.5));

      return {
        jour,
        Caissons: pCaiss,
        Tabliers: pTabl,
        Precadres: pPrec,
        Moustiquaires: pMstq,
        TotalJour: pCaiss + pTabl + pPrec + pMstq,
        CapaciteCibleAtelier: 150
      };
    });
  }, [caissons, tabliers, precadres, moustiquaires]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* ── BARRE DE FILTRAGE DES GRAPHIQUES ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Analyse Graphique Cadences &amp; Rendement :
          </span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setPeriodeFiltre('TOUT')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                periodeFiltre === 'TOUT'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tous les Postes
            </button>
            <button
              onClick={() => setPeriodeFiltre('CAISSON')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                periodeFiltre === 'CAISSON'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📦 Caissons
            </button>
            <button
              onClick={() => setPeriodeFiltre('TABLIER')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                periodeFiltre === 'TABLIER'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🪟 Tabliers
            </button>
            <button
              onClick={() => setPeriodeFiltre('PRECADRE')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                periodeFiltre === 'PRECADRE'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🚪 Précadres
            </button>
            <button
              onClick={() => setPeriodeFiltre('MOUSTIQUAIRE')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                periodeFiltre === 'MOUSTIQUAIRE'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🦟 Moustiquaires
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 font-mono font-bold">
            <Percent className="w-3.5 h-3.5" /> Rendement Global : {tauxMatiereMoyen}%
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-950/60 border border-sky-800/80 text-sky-300 font-mono font-bold">
            <Clock className="w-3.5 h-3.5" /> Charge Totale : {monitoringData.chargeTotaleHeures} h
          </span>
        </div>
      </div>

      {/* ── LIGNE 1 : LES 2 GRAPHIQUES MAJEURS (CADENCE & RENDEMENT) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GRAPHIQUE 1 : CADENCE & CHARGE PAR POSTE */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>Cadence de Production vs Capacité Journalière</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pièces en cours vs Capacité nominale d'usinage par poste
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Pcs / Jour
              </span>
            </div>

            {/* Légende */}
            <div className="flex items-center justify-end gap-4 mt-3 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                Pièces en File Actuelle
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-3 rounded-xs bg-sky-600 inline-block" />
                Capacité Journalière (pcs/j)
              </span>
            </div>

            <div className="h-72 w-full mt-2">
              <SvgCadenceBarChart data={donneesCadences} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-800 text-center">
            {donneesCadences.map(item => (
              <div key={item.cle} className="p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-400 truncate">{item.famille}</div>
                <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">{item.tauxOccupation}%</div>
                <div className={`text-[10px] font-semibold mt-0.5 ${
                  item.tauxOccupation > 100
                    ? 'text-rose-400'
                    : item.tauxOccupation > 80
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}>
                  {item.tauxOccupation > 100 ? 'Surcharge' : item.tauxOccupation > 80 ? 'Dense' : 'Fluide'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GRAPHIQUE 2 : RENDEMENT & UTILISATION MATIÈRE PAR POSTE */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>Taux d'Utilisation Matière Aluminium (%)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Rendement net utile de coupe avec seuil optimal atelier (90%)
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                Moyenne : {tauxMatiereMoyen}%
              </span>
            </div>

            {/* Légende */}
            <div className="flex items-center justify-end gap-3 mt-3 text-xs">
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

            <div className="h-72 w-full mt-2">
              <SvgRendementBarChart data={donneesRendementMatiere} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-800 text-center">
            {donneesRendementMatiere.map(item => (
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
      </div>

      {/* ── LIGNE 2 : RÉPARTITION MATIÈRE (DONUT) & CADENCE PRÉVISIONNELLE (AREA) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* GRAPHIQUE 3 : DONUT DE RÉPARTITION MATIÈRE ALUMINIUM */}
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
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                100% Matière
              </span>
            </div>

            <div className="h-56 w-full mt-2 relative flex items-center justify-center">
              <SvgDonutChart
                data={donneesMatiereGlobale}
                centerValue={tauxMatiereMoyen}
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

        {/* GRAPHIQUE 4 : CADENCE PRÉVISIONNELLE SUR LES PROCHAINS JOURS (AREA CHART) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Projection de la Cadence de Production (Jours Ouvrés)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Planification des flux et décongestionnement atelier sur les prochains jours
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-sky-300 bg-sky-950 px-2.5 py-1 rounded-lg border border-sky-800">
                {monitoringData.dateLivraisonGlobaleJusquAu}
              </span>
            </div>

            <div className="h-64 w-full mt-4">
              <SvgTimelineAreaChart data={timelineCadencesJours} />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Lissage dynamique basé sur les cadences journalières configurées
            </span>
            <span className="text-slate-300 font-mono">
              Capacité cumulée : <strong className="text-emerald-400">{caissons.capaciteJournaliere + tabliers.capaciteJournaliere + precadres.capaciteJournaliere + moustiquaires.capaciteJournaliere} pcs/j</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── TABLEAU ANALYTIQUE DE SYNTHÈSE INDUSTRIELLE ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-slate-100">
              Synthèse Détaillée : Cadences &amp; Rendement Matière par Poste
            </h4>
          </div>
          <span className="text-xs text-slate-400">
            Mise à jour temps réel liée à la base de données
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Poste de Découpe</th>
                <th className="py-3 px-3 text-right">Commandes</th>
                <th className="py-3 px-3 text-right">Pièces à Fabriquer</th>
                <th className="py-3 px-3 text-right">Cadence Journalière</th>
                <th className="py-3 px-3 text-right">Taux d'Occupation</th>
                <th className="py-3 px-3 text-right">Charge Estimée</th>
                <th className="py-3 px-3 text-right">Taux Utilisation Matière</th>
                <th className="py-3 px-3 text-right">Pertes / Déchet</th>
                <th className="py-3 px-4 text-center">Statut Cadence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {donneesCadences.map(c => {
                const rend = donneesRendementMatiere.find(r => r.cle === c.cle);
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
                    <td className="py-3 px-3 text-right font-mono text-sky-300">
                      {c.capaciteJour} pcs/j
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        c.tauxOccupation > 100
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : c.tauxOccupation > 80
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {c.tauxOccupation}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {c.chargeHeures} h ({c.joursRequis} j)
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                      {rend?.tauxRendement || 93}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-400">
                      {rend?.dechetPct || 2.5}%
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        c.tauxOccupation > 100
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : c.tauxOccupation > 80
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}>
                        {c.tauxOccupation > 100 ? '🚨 Surcharge' : c.tauxOccupation > 80 ? '⚠️ Dense' : '✓ Fluide'}
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
