import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Maximize2,
  RefreshCw,
  Info
} from 'lucide-react';
import { ChassisVisionService, ResultatAnalyseVisionChassis } from '../../services/chassisVisionService';
import { ModeDebordementPrecadre } from '../../types';

interface InspecteurVisionChassisModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageInitialeDataUrl?: string;
  onAppliquerResultat?: (mode: ModeDebordementPrecadre, debSup: number, debInf: number) => void;
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
  const [margePx, setMargePx] = useState<number>(8);
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

        // Dessiner sur le canevas de prévisualisation
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Dessin image originale
            ctx.drawImage(img, 0, 0);

            // Traverse haute repère jaune
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = Math.max(1, Math.floor(img.height * 0.015));
            ctx.beginPath();
            ctx.moveTo(0, res.yTraverseHaute);
            ctx.lineTo(img.width, res.yTraverseHaute);
            ctx.stroke();

            // Traverse basse repère jaune
            ctx.beginPath();
            ctx.moveTo(0, res.yTraverseBasse);
            ctx.lineTo(img.width, res.yTraverseBasse);
            ctx.stroke();

            // Montants verticaux en rouge
            const leftX = Math.floor(img.width * 0.10);
            const rightX = Math.floor(img.width * 0.90);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = Math.max(2, Math.floor(img.width * 0.02));
            ctx.beginPath();
            ctx.moveTo(leftX, 0);
            ctx.lineTo(leftX, img.height);
            ctx.moveTo(rightX, 0);
            ctx.lineTo(rightX, img.height);
            ctx.stroke();
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

  const handleChargerExemple = (type: 'FERME' | 'HAUT_SEUL' | 'BAS_SEUL' | 'HAUT_BAS') => {
    const w = 180;
    const h = 220;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fond blanc
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Dessin d'un précadre selon le cas demandé
    const hasTop = type === 'HAUT_SEUL' || type === 'HAUT_BAS';
    const hasBot = type === 'BAS_SEUL' || type === 'HAUT_BAS';

    const yTraverseTop = hasTop ? 55 : 20;
    const yTraverseBot = hasBot ? 165 : 200;

    const xLeft = 30;
    const xRight = 150;
    const montantTop = hasTop ? 15 : yTraverseTop;
    const montantBot = hasBot ? 205 : yTraverseBot;

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

    // Traverse haute
    ctx.beginPath();
    ctx.moveTo(xLeft, yTraverseTop);
    ctx.lineTo(xRight, yTraverseTop);
    ctx.stroke();

    // Traverse basse
    ctx.beginPath();
    ctx.moveTo(xLeft, yTraverseBot);
    ctx.lineTo(xRight, yTraverseBot);
    ctx.stroke();

    // Renfort intermédiaire si haut et bas
    if (type === 'HAUT_BAS') {
      ctx.beginPath();
      ctx.moveTo(Math.floor((xLeft + xRight) / 2), yTraverseTop);
      ctx.lineTo(Math.floor((xLeft + xRight) / 2), yTraverseBot);
      ctx.stroke();
    }

    setImageSrc(canvas.toDataURL());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Inspecteur Visuel de Débordement des Montants
                {titreLigne && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                    {titreLigne}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Détection géométrique déterministe (Traverses horizontales vs prolongement des montants verticaux)
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
              className="md:col-span-2 border-2 border-dashed border-slate-700 hover:border-amber-500/80 bg-slate-950/50 hover:bg-slate-950/90 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition text-center group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-slate-400 group-hover:text-amber-400 mb-2 transition" />
              <p className="text-xs font-bold text-slate-200">
                Glissez-déposez une photo / croquis ou <span className="text-amber-400 underline">parcourez vos fichiers</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Formats acceptés : JPG, PNG, WEBP, capture d'écran, croquis scanné
              </p>
            </div>

            {/* Boutons d'exemples types pour étalonnage immédiat */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  🧪 Tester un cas d'atelier :
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleChargerExemple('FERME')}
                    className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold text-left transition"
                  >
                    ⏹️ 1. Fermé (0/0)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChargerExemple('HAUT_SEUL')}
                    className="px-2 py-1.5 rounded bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-xs font-semibold text-left transition border border-amber-900/40"
                  >
                    ⬆️ 2. Haut seul
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChargerExemple('BAS_SEUL')}
                    className="px-2 py-1.5 rounded bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 text-xs font-semibold text-left transition border border-sky-900/40"
                  >
                    ⬇️ 3. Bas seul
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChargerExemple('HAUT_BAS')}
                    className="px-2 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 text-xs font-semibold text-left transition border border-emerald-900/40"
                  >
                    ⬆️⬇️ 4. Haut & Bas
                  </button>
                </div>
              </div>

              {/* Curseur de Marge (équivalent paramètre --marge) */}
              <div className="mt-3 pt-3 border-t border-slate-800/80">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    Tolérance / Marge :
                  </span>
                  <span className="font-bold text-amber-400 font-mono">{margePx} px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="1"
                  value={margePx}
                  onChange={e => setMargePx(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Filtre le bruit et les traits de cotes parasites
                </span>
              </div>
            </div>
          </div>

          {/* Zone de visualisation et résultat */}
          {imageSrc && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              
              {/* Image annotée */}
              <div className="flex flex-col items-center justify-center">
                <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-2 self-start">
                  <span>Image analysée & tracé de repérage :</span>
                  <span className="text-[10px] text-yellow-400 font-mono">── Traverses (Jaune)</span>
                  <span className="text-[10px] text-red-400 font-mono">│ Montants (Rouge)</span>
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
                <div>
                  <span className="text-xs font-semibold text-slate-400 block mb-1">
                    Verdict géométrique formel :
                  </span>
                  {resultat && (
                    <div
                      className={`p-4 rounded-xl border flex items-start gap-3 ${
                        resultat.modeDetecte === 'SUPERIEUR_INFERIEUR'
                          ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200'
                          : resultat.modeDetecte === 'INFERIEUR_SEUL'
                          ? 'bg-sky-950/70 border-sky-500 text-sky-200'
                          : resultat.modeDetecte === 'SUPERIEUR_SEUL'
                          ? 'bg-amber-950/70 border-amber-500 text-amber-200'
                          : 'bg-slate-800/80 border-slate-600 text-slate-200'
                      }`}
                    >
                      <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-base font-black tracking-wide">
                          {resultat.verdict}
                        </div>
                        <div className="text-xs font-mono font-bold mt-1 opacity-90">
                          Haut : +{resultat.debordementSuperieur} mm | Bas : +{resultat.debordementInferieur} mm
                        </div>
                        <p className="text-xs mt-1.5 opacity-80 leading-relaxed font-sans">
                          {resultat.details}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mesures chiffrées en pixels */}
                {resultat && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs space-y-2 font-mono">
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
                    <div className="flex justify-between items-center text-slate-400 pt-2 border-t border-slate-800 text-[11px]">
                      <span>Seuil d'exclusion du bruit :</span>
                      <span>{resultat.seuilDetectionPx} px</span>
                    </div>
                  </div>
                )}

                {/* Explication technique */}
                <div className="flex items-start gap-2 bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    La détection isole les deux traverses horizontales principales du cadre (jaune). Tout prolongement des montants verticaux (rouge) au-delà des traverses avec vide central est formellement qualifié de débordement.
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
                Résultat qualifié : <strong className="text-slate-200">{resultat.verdict}</strong>
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
                    resultat.debordementInferieur
                  );
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Appliquer ce débordement ({resultat.debordementSuperieur}/{resultat.debordementInferieur} mm)
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
