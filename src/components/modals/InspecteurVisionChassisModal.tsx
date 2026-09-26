import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  CheckCircle2,
  Sliders,
  Info,
  Layers,
  Sparkles
} from 'lucide-react';
import { ChassisVisionService, ResultatAnalyseVisionChassis } from '../../services/chassisVisionService';
import { FigurePrecadre, ModeDebordementPrecadre } from '../../types';

interface InspecteurVisionChassisModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageInitialeDataUrl?: string;
  onAppliquerResultat?: (
    mode: ModeDebordementPrecadre,
    debSup: number,
    debInf: number,
    figure?: FigurePrecadre
  ) => void;
  titreLigne?: string;
}

export const InspecteurVisionChassisModal: React.FC<InspecteurVisionChassisModalProps> = ({
  isOpen,
  onClose,
  imageInitialeDataUrl,
  onAppliquerResultat,
  titreLigne
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(imageInitialeDataUrl || null);
  const [margePx, setMargePx] = useState<number>(3);
  const [resultat, setResultat] = useState<ResultatAnalyseVisionChassis | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Synchroniser avec l'image initiale fournie
  useEffect(() => {
    if (imageInitialeDataUrl) {
      setImageSrc(imageInitialeDataUrl);
    }
  }, [imageInitialeDataUrl]);

  // Recalculer l'analyse dès que l'image ou la marge change
  useEffect(() => {
    if (!imageSrc) return;
    analyserImageSource(imageSrc, margePx);
  }, [imageSrc, margePx]);

  const analyserImageSource = (src: string, marge: number) => {
    setIsProcessing(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const res = ChassisVisionService.analyserImageElement(img, { margePx: marge, annoter: true });
        setResultat(res);

        // Dessiner sur le canevas de prévisualisation avec les repères visuels d'atelier
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Dessin image originale
            ctx.drawImage(img, 0, 0);

            // 1. Traverses haute et basse en jaune éclatant (strictement entre les 2 montants)
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = Math.max(2, Math.floor(img.height * 0.022));
            ctx.beginPath();
            ctx.moveTo(res.xMontantGauche, res.yTraverseHaute);
            ctx.lineTo(res.xMontantDroit, res.yTraverseHaute);
            ctx.moveTo(res.xMontantGauche, res.yTraverseBasse);
            ctx.lineTo(res.xMontantDroit, res.yTraverseBasse);
            ctx.stroke();

            // 2. Montants verticaux réels en rouge vif
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = Math.max(2, Math.floor(img.width * 0.022));
            ctx.beginPath();
            ctx.moveTo(res.xMontantGauche, res.yTraverseHaute - (res.hasTopStubs ? res.maxTopStubPx : 0));
            ctx.lineTo(res.xMontantGauche, res.yTraverseBasse + (res.hasBottomStubs ? res.maxBottomStubPx : 0));
            ctx.moveTo(res.xMontantDroit, res.yTraverseHaute - (res.hasTopStubs ? res.maxTopStubPx : 0));
            ctx.lineTo(res.xMontantDroit, res.yTraverseBasse + (res.hasBottomStubs ? res.maxBottomStubPx : 0));
            ctx.stroke();

            // 3. Renforts verticaux intérieurs H1 (Meneaux) en bleu cyan éclatant
            if (res.hasInternalV && res.montants && res.montants.length >= 3) {
              ctx.strokeStyle = '#06b6d4';
              ctx.lineWidth = Math.max(2, Math.floor(img.width * 0.022));
              for (let i = 1; i < res.montants.length - 1; i++) {
                ctx.beginPath();
                ctx.moveTo(res.montants[i], res.yTraverseHaute);
                ctx.lineTo(res.montants[i], res.yTraverseBasse);
                ctx.stroke();
              }
            } else if (res.hasInternalV && res.xRenfortV !== undefined) {
              ctx.strokeStyle = '#06b6d4';
              ctx.lineWidth = Math.max(2, Math.floor(img.width * 0.022));
              ctx.beginPath();
              ctx.moveTo(res.xRenfortV, res.yTraverseHaute);
              ctx.lineTo(res.xRenfortV, res.yTraverseBasse);
              ctx.stroke();
            }

            // 4. Renforts horizontaux intérieurs L1 (Traverses intermédiaires) en violet améthyste éclatant
            if (res.hasInternalH && res.traverses && res.traverses.length >= 3) {
              ctx.strokeStyle = '#a855f7';
              ctx.lineWidth = Math.max(2, Math.floor(img.height * 0.022));
              for (let i = 1; i < res.traverses.length - 1; i++) {
                ctx.beginPath();
                ctx.moveTo(res.xMontantGauche, res.traverses[i]);
                ctx.lineTo(res.xMontantDroit, res.traverses[i]);
                ctx.stroke();
              }
            } else if (res.hasInternalH && res.yRenfortH !== undefined) {
              ctx.strokeStyle = '#a855f7';
              ctx.lineWidth = Math.max(2, Math.floor(img.height * 0.022));
              ctx.beginPath();
              ctx.moveTo(res.xMontantGauche, res.yRenfortH);
              ctx.lineTo(res.xMontantDroit, res.yRenfortH);
              ctx.stroke();
            }

            // 5. Débordements confirmés en vert émeraude (Cornes en haut)
            if (res.hasTopStubs) {
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = Math.max(3, Math.floor(img.width * 0.03));
              ctx.beginPath();
              ctx.moveTo(res.xMontantGauche, res.yTraverseHaute - res.maxTopStubPx);
              ctx.lineTo(res.xMontantGauche, res.yTraverseHaute);
              ctx.moveTo(res.xMontantDroit, res.yTraverseHaute - res.maxTopStubPx);
              ctx.lineTo(res.xMontantDroit, res.yTraverseHaute);
              ctx.stroke();
            }

            // 6. Débordements confirmés en vert émeraude (Pieds en bas)
            if (res.hasBottomStubs) {
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = Math.max(3, Math.floor(img.width * 0.03));
              ctx.beginPath();
              ctx.moveTo(res.xMontantGauche, res.yTraverseBasse);
              ctx.lineTo(res.xMontantGauche, res.yTraverseBasse + res.maxBottomStubPx);
              ctx.moveTo(res.xMontantDroit, res.yTraverseBasse);
              ctx.lineTo(res.xMontantDroit, res.yTraverseBasse + res.maxBottomStubPx);
              ctx.stroke();
            }
          }
        }
      } catch (err) {
        console.error('Erreur analyse image:', err);
      } finally {
        setIsProcessing(false);
      }
    };
    img.onerror = () => {
      setIsProcessing(false);
    };
    img.src = src;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      if (typeof event.target?.result === 'string') {
        setImageSrc(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = event => {
        if (typeof event.target?.result === 'string') {
          setImageSrc(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * Générateur de croquis d'atelier pour étalonnage immédiat en direct
   */
  const handleChargerExemple = (
    type: 'VIDE' | 'RENFORT_H1' | 'RENFORT_L1' | 'RENFORT_CROISE' | 'HAUT_SEUL' | 'BAS_SEUL' | 'HAUT_BAS_CROISE'
  ) => {
    const w = 180;
    const h = 220;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fond blanc propre
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const hasTopDeb = type === 'HAUT_SEUL' || type === 'HAUT_BAS_CROISE';
    const hasBotDeb = type === 'BAS_SEUL' || type === 'HAUT_BAS_CROISE';

    const yTraverseTop = hasTopDeb ? 55 : 25;
    const yTraverseBot = hasBotDeb ? 165 : 195;

    const xLeft = 32;
    const xRight = 148;
    const montantTop = hasTopDeb ? 15 : yTraverseTop;
    const montantBot = hasBotDeb ? 205 : yTraverseBot;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;

    // Montant gauche
    ctx.beginPath();
    ctx.moveTo(xLeft, montantTop);
    ctx.lineTo(xLeft, montantBot);
    ctx.stroke();

    // Montant droit
    ctx.beginPath();
    ctx.moveTo(xRight, montantTop);
    ctx.lineTo(xRight, montantBot);
    ctx.stroke();

    // Traverse haute de fermeture
    ctx.beginPath();
    ctx.moveTo(xLeft, yTraverseTop);
    ctx.lineTo(xRight, yTraverseTop);
    ctx.stroke();

    // Traverse basse de fermeture
    ctx.beginPath();
    ctx.moveTo(xLeft, yTraverseBot);
    ctx.lineTo(xRight, yTraverseBot);
    ctx.stroke();

    // Renfort vertical H1
    if (type === 'RENFORT_H1' || type === 'RENFORT_CROISE' || type === 'HAUT_BAS_CROISE') {
      const xMid = Math.floor((xLeft + xRight) / 2);
      ctx.beginPath();
      ctx.moveTo(xMid, yTraverseTop);
      ctx.lineTo(xMid, yTraverseBot);
      ctx.stroke();
    }

    // Renfort horizontal L1
    if (type === 'RENFORT_L1' || type === 'RENFORT_CROISE' || type === 'HAUT_BAS_CROISE') {
      const yMid = Math.floor((yTraverseTop + yTraverseBot) / 2);
      ctx.beginPath();
      ctx.moveTo(xLeft, yMid);
      ctx.lineTo(xRight, yMid);
      ctx.stroke();
    }

    setImageSrc(canvas.toDataURL());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Inspecteur Visuel de Châssis (Débordements & Renforts Intérieurs)
                {titreLigne && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                    {titreLigne}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Détection géométrique déterministe : Cornes/Pieds & Renforts intérieurs (Vide, Vertical H1, Horizontal L1, Croisé)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps modal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Zone d'importation et exemples rapides */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Boîte drop image */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="md:col-span-1 border-2 border-dashed border-slate-700 hover:border-amber-500/80 bg-slate-950/50 hover:bg-slate-950/90 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition text-center group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-7 h-7 text-slate-400 group-hover:text-amber-400 mb-2 transition" />
              <p className="text-xs font-bold text-slate-200">
                Glissez-déposez une photo / croquis ou <span className="text-amber-400 underline">parcourez</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                JPG, PNG, WEBP, capture d'écran, croquis scanné
              </p>
            </div>

            {/* Boutons d'exemples types pour étalonnage immédiat */}
            <div className="md:col-span-2 bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  🧪 Étalonnage immédiat en direct (Tester les modèles types) :
                </span>
                
                {/* Ligne 1 : Les 4 Renforts intérieurs */}
                <div className="mb-2">
                  <span className="text-[10px] text-slate-400 font-semibold mb-1 block">
                    Modèles de Renfort Intérieur :
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleChargerExemple('VIDE')}
                      className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold text-left transition border border-slate-700/60"
                    >
                      ⏹️ 1. Vide
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChargerExemple('RENFORT_H1')}
                      className="px-2 py-1.5 rounded bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 text-xs font-semibold text-left transition border border-cyan-800/50"
                    >
                      ⏸️ 2. Vertical H1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChargerExemple('RENFORT_L1')}
                      className="px-2 py-1.5 rounded bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 text-xs font-semibold text-left transition border border-purple-800/50"
                    >
                      ⏥ 3. Horizontal L1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChargerExemple('RENFORT_CROISE')}
                      className="px-2 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 text-xs font-semibold text-left transition border border-emerald-800/50"
                    >
                      ➕ 4. Croisé
                    </button>
                  </div>
                </div>

                {/* Ligne 2 : Cas de Débordements */}
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold mb-1 block">
                    Modèles avec Débordements verticaux :
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleChargerExemple('HAUT_SEUL')}
                      className="px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-[11px] font-semibold text-left transition border border-amber-900/40"
                    >
                      ⬆️ Haut seul (+100)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChargerExemple('BAS_SEUL')}
                      className="px-2 py-1 rounded bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 text-[11px] font-semibold text-left transition border border-sky-900/40"
                    >
                      ⬇️ Bas seul (+300)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChargerExemple('HAUT_BAS_CROISE')}
                      className="px-2 py-1 rounded bg-teal-950/60 hover:bg-teal-900/80 text-teal-300 text-[11px] font-semibold text-left transition border border-teal-900/40"
                    >
                      ⬆️⬇️➕ Haut/Bas + Croisé
                    </button>
                  </div>
                </div>
              </div>

              {/* Curseur de Tolérance Marge */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tolérance Débordement :</span>
                  <span className="font-bold text-amber-400 font-mono">{margePx} px</span>
                  <span className="text-[10px] text-slate-500">(Dépassement &gt; {margePx}px sans traverse après)</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="15"
                  step="1"
                  value={margePx}
                  onChange={e => setMargePx(parseInt(e.target.value, 10))}
                  className="w-36 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Zone de visualisation et résultat */}
          {imageSrc && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              
              {/* Image annotée */}
              <div className="flex flex-col items-center justify-center">
                <div className="text-[11px] font-semibold text-slate-400 mb-2 flex flex-wrap items-center gap-2 self-start">
                  <span>Tracé de repérage :</span>
                  <span className="text-[10px] text-yellow-400 font-mono">── Traverses (Jaune)</span>
                  <span className="text-[10px] text-red-400 font-mono">│ Montants (Rouge)</span>
                  <span className="text-[10px] text-cyan-400 font-mono">│ Renfort V (Cyan)</span>
                  <span className="text-[10px] text-purple-400 font-mono">── Renfort H (Violet)</span>
                  <span className="text-[10px] text-emerald-400 font-mono">║ Débordements (Vert)</span>
                </div>
                <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center max-h-[320px] max-w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="max-h-[300px] max-w-full object-contain rounded"
                  />
                </div>
              </div>

              {/* Verdict et mesures exactes */}
              <div className="space-y-4">
                
                {/* 1. Résultat Renfort Intérieur (Figure) */}
                <div>
                  <span className="text-xs font-semibold text-slate-400 block mb-1">
                    Figure de Renfort Intérieur identifiée :
                  </span>
                  {resultat && (
                    <div
                      className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                        resultat.figureDetectee === 'RENFORT_CROISE'
                          ? 'bg-purple-950/70 border-purple-500 text-purple-200'
                          : resultat.figureDetectee === 'RENFORT_H1'
                          ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200'
                          : resultat.figureDetectee === 'RENFORT_L1'
                          ? 'bg-violet-950/70 border-violet-500 text-violet-200'
                          : 'bg-slate-800/80 border-slate-600 text-slate-200'
                      }`}
                    >
                      <Layers className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-black tracking-wide flex items-center gap-2">
                          <span>
                            {resultat.figureDetectee === 'VIDE' && '⏹️ Cadre Vide (aucun renfort)'}
                            {resultat.figureDetectee === 'RENFORT_H1' && '⏸️ Renfort Vertical H1 (3 montants verticaux)'}
                            {resultat.figureDetectee === 'RENFORT_L1' && '⏥ Renfort Horizontal L1 (3 traverses horizontales)'}
                            {resultat.figureDetectee === 'RENFORT_CROISE' && '➕ Renforts Croisés (3 traverses + 3 montants)'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono mt-1 opacity-90 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>Traverses : <strong>{resultat.nbTraverses ?? 2}</strong> {resultat.hasInternalH ? `(L1 à Y=${resultat.yRenfortH}px)` : '(Haut & Bas)'}</span>
                          <span>•</span>
                          <span>Montants : <strong>{resultat.nbMontants ?? 2}</strong> {resultat.hasInternalV ? `(H1 à X=${resultat.xRenfortV}px)` : '(Gauche & Droit)'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Résultat Débordements */}
                <div>
                  <span className="text-xs font-semibold text-slate-400 block mb-1">
                    Débordements verticaux des montants :
                  </span>
                  {resultat && (
                    <div
                      className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                        resultat.modeDetecte === 'SUPERIEUR_INFERIEUR'
                          ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200'
                          : resultat.modeDetecte === 'INFERIEUR_SEUL'
                          ? 'bg-sky-950/70 border-sky-500 text-sky-200'
                          : resultat.modeDetecte === 'SUPERIEUR_SEUL'
                          ? 'bg-amber-950/70 border-amber-500 text-amber-200'
                          : 'bg-slate-800/80 border-slate-600 text-slate-200'
                      }`}
                    >
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-black tracking-wide">
                          {resultat.verdict}
                        </div>
                        <div className="text-xs font-mono font-bold mt-1 opacity-90">
                          Haut : +{resultat.debordementSuperieur} mm | Bas : +{resultat.debordementInferieur} mm
                        </div>
                        <p className="text-[11px] mt-1 opacity-80 leading-relaxed font-sans">
                          {resultat.details}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mesures chiffrées en pixels */}
                {resultat && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Dépassement haut (cornes) :</span>
                      <span className={resultat.hasTopStubs ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                        {resultat.maxTopStubPx} px {resultat.hasTopStubs ? '(Détecté ✓)' : '(Aucun)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Dépassement bas (pieds) :</span>
                      <span className={resultat.hasBottomStubs ? 'text-sky-400 font-bold' : 'text-slate-500'}>
                        {resultat.maxBottomStubPx} px {resultat.hasBottomStubs ? '(Détecté ✓)' : '(Aucun)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400 pt-1.5 border-t border-slate-800 text-[11px]">
                      <span>Règle d'or de l'atelier :</span>
                      <span>Dépassement &gt; 3px ET sans traverse après</span>
                    </div>
                  </div>
                )}

                {/* Explication technique */}
                <div className="flex items-start gap-2 bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Logique de comptage d'atelier :</strong> Si le cadre possède <strong>3 traverses</strong> = renfort horizontal (Traverse L1 violette). Si le cadre possède <strong>3 montants verticaux</strong> = renfort vertical (Meneau H1 cyan). Si les deux conditions sont réunies = <strong>Renforts Croisés</strong>. Si aucune = <strong>Cadre Vide</strong> (2 traverses et 2 montants).
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <div className="text-xs text-slate-400">
            {resultat ? (
              <span>
                Figure : <strong className="text-slate-200">{resultat.figureLabel}</strong> • Débordement : <strong className="text-slate-200">{resultat.verdict}</strong>
              </span>
            ) : (
              <span>Chargez une photo pour démarrer l'analyse</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
            >
              Fermer
            </button>
            {onAppliquerResultat && resultat && (
              <button
                type="button"
                onClick={() => {
                  onAppliquerResultat(
                    resultat.modeDetecte,
                    resultat.debordementSuperieur,
                    resultat.debordementInferieur,
                    resultat.figureDetectee
                  );
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Appliquer ce réglage (+{resultat.debordementSuperieur}/+{resultat.debordementInferieur} mm • {resultat.figureDetectee})
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
