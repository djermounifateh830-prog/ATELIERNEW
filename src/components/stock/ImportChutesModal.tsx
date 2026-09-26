import React, { useState, useEffect, useRef } from 'react';
import { ChuteItem, ChuteMaille } from '../../types';
import { StorageService } from '../../services/storage';
import {
  X,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Info
} from 'lucide-react';

interface ImportChutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  chutesBarresExistantes: Record<string, ChuteItem[]>;
  chutesMailleExistantes: ChuteMaille[];
  onImportComplete: () => void;
  initialFile?: File | null;
}

export type StrategieImportChute = 'REPLACE_SELECTED' | 'MERGE_ADD' | 'REPLACE_ALL';

interface SheetInfo {
  name: string;
  count: number;
  isMaille: boolean;
  selected: boolean;
  alreadyExists: boolean;
  existingCount: number;
}

export const ImportChutesModal: React.FC<ImportChutesModalProps> = ({
  isOpen,
  onClose,
  chutesBarresExistantes,
  chutesMailleExistantes,
  onImportComplete,
  initialFile = null
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [strategie, setStrategie] = useState<StrategieImportChute>('REPLACE_SELECTED');
  const [sheetsDetected, setSheetsDetected] = useState<SheetInfo[]>([]);
  const [parsedData, setParsedData] = useState<{
    chutesBarres: Record<string, ChuteItem[]>;
    chutesMaille: ChuteMaille[];
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Traiter un fichier initial si fourni lors de l'ouverture
  useEffect(() => {
    if (isOpen && initialFile && !file) {
      processFile(initialFile);
    }
  }, [isOpen, initialFile]);

  // Réinitialiser les états à l'ouverture
  useEffect(() => {
    if (isOpen && !initialFile) {
      setFile(null);
      setSheetsDetected([]);
      setParsedData(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await StorageService.parseChutesExcelFile(selectedFile);
      setParsedData({
        chutesBarres: res.chutesBarres,
        chutesMaille: res.chutesMaille
      });

      const sheetsInfo: SheetInfo[] = res.sheetNames.map(sheetName => {
        const isMaille = sheetName.toUpperCase() === 'MAILLE MSTQ';
        let count = 0;
        let alreadyExists = false;
        let existingCount = 0;

        if (isMaille) {
          count = res.chutesMaille.length;
          alreadyExists = chutesMailleExistantes.length > 0;
          existingCount = chutesMailleExistantes.length;
        } else {
          count = (res.chutesBarres[sheetName] || []).length;
          alreadyExists = chutesBarresExistantes[sheetName] !== undefined;
          existingCount = (chutesBarresExistantes[sheetName] || []).length;
        }

        return {
          name: sheetName,
          count,
          isMaille,
          selected: true, // Sélectionné par défaut
          alreadyExists,
          existingCount
        };
      });

      setSheetsDetected(sheetsInfo);
    } catch (err: any) {
      setErrorMessage('Erreur lors de la lecture du fichier Excel de chutes : ' + (err.message || 'Fichier non lisible.'));
      setFile(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
    // Permettre de ré-importer le même fichier si besoin
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleToggleSheet = (sheetName: string) => {
    setSheetsDetected(prev =>
      prev.map(s => (s.name === sheetName ? { ...s, selected: !s.selected } : s))
    );
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSheetsDetected(prev => prev.map(s => ({ ...s, selected: checked })));
  };

  const handleApplyImport = async () => {
    if (!parsedData) return;

    const selectedSheets = sheetsDetected.filter(s => s.selected);
    if (selectedSheets.length === 0) {
      setErrorMessage('Veuillez cocher au moins un onglet à importer.');
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);

    try {
      if (strategie === 'REPLACE_ALL') {
        const newChutesBarres: Record<string, ChuteItem[]> = {};
        let newChutesMaille: ChuteMaille[] = [];

        selectedSheets.forEach(s => {
          if (s.isMaille) {
            newChutesMaille = parsedData.chutesMaille;
          } else {
            newChutesBarres[s.name] = parsedData.chutesBarres[s.name] || [];
          }
        });

        await StorageService.saveChutesBarres(newChutesBarres);
        await StorageService.saveChutesMaille(newChutesMaille);
      } else if (strategie === 'REPLACE_SELECTED') {
        const updatedBarres: Record<string, ChuteItem[]> = { ...chutesBarresExistantes };
        let updatedMaille: ChuteMaille[] = [...chutesMailleExistantes];

        selectedSheets.forEach(s => {
          if (s.isMaille) {
            updatedMaille = parsedData.chutesMaille;
          } else {
            updatedBarres[s.name] = parsedData.chutesBarres[s.name] || [];
          }
        });

        await StorageService.saveChutesBarres(updatedBarres);
        await StorageService.saveChutesMaille(updatedMaille);
      } else if (strategie === 'MERGE_ADD') {
        const updatedBarres: Record<string, ChuteItem[]> = { ...chutesBarresExistantes };
        let updatedMaille: ChuteMaille[] = [...chutesMailleExistantes];

        selectedSheets.forEach(s => {
          if (s.isMaille) {
            const existingMailleIds = new Set(updatedMaille.map(m => m.id));
            const importedMaille = (parsedData.chutesMaille || []).map((m, idx) => {
              const uniqueId = (!m.id || existingMailleIds.has(m.id))
                ? `m-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`
                : m.id;
              existingMailleIds.add(uniqueId);
              return { ...m, id: uniqueId };
            });
            updatedMaille = [...updatedMaille, ...importedMaille];
          } else {
            const currentItems = updatedBarres[s.name] || [];
            const existingIds = new Set(currentItems.map(c => c.id));
            const importedItems = (parsedData.chutesBarres[s.name] || []).map((c, idx) => {
              const safeName = s.name.replace(/[^a-zA-Z0-9]/g, '_');
              const uniqueId = (!c.id || existingIds.has(c.id))
                ? `c-${safeName}-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`
                : c.id;
              existingIds.add(uniqueId);
              return { ...c, id: uniqueId };
            });
            updatedBarres[s.name] = [...currentItems, ...importedItems];
          }
        });

        await StorageService.saveChutesBarres(updatedBarres);
        await StorageService.saveChutesMaille(updatedMaille);
      }

      setSuccessMessage(`Import réussi ! (${selectedSheets.length} onglet(s) importé(s) dans la base SQLite)`);
      setTimeout(() => {
        onImportComplete();
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Erreur lors de l\'import des chutes:', err);
      setErrorMessage('Erreur lors de l\'import : ' + (err.message || 'Une erreur est survenue lors de l\'enregistrement des chutes.'));
    } finally {
      setIsApplying(false);
    }
  };

  const countSelectionnes = sheetsDetected.filter(s => s.selected).length;
  const totalChutesSelectionnees = sheetsDetected
    .filter(s => s.selected)
    .reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[96vw] max-w-5xl max-h-[96vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-slate-950 font-black text-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Importation Intelligente des Chutes</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Excel (.xlsx) Multi-Onglets
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Détection automatique des onglets, profilés de barres et toiles moustiquaires.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message d'erreur ou succès */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-red-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mx-5 mt-4 p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Corps modal */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Étape 1 : Sélection Fichier */}
          {!file && (
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`block border-2 border-dashed rounded-2xl p-10 text-center transition cursor-pointer ${
                isDragging
                  ? 'border-sky-400 bg-sky-950/30'
                  : 'border-slate-700 hover:border-sky-500/50 bg-slate-950/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="sr-only"
              />
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-sky-400/60" />
              <h3 className="text-sm font-bold text-slate-200 mb-1">
                Cliquez ici ou déposez votre classeur de chutes (<code>stok_chutes.xlsx</code>)
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Tous les onglets du fichier seront analysés et vous pourrez choisir exactement quoi importer.
              </p>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs rounded-xl cursor-pointer shadow-lg shadow-sky-500/20 transition"
              >
                <Upload className="w-4 h-4" />
                <span>Parcourir le fichier Excel</span>
              </span>
            </label>
          )}

          {isAnalyzing && (
            <div className="p-8 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-sky-400" />
              <p className="text-xs font-bold">Lecture des onglets et inventaire des chutes en cours...</p>
            </div>
          )}

          {/* Étape 2 : Onglets détectés & Options */}
          {file && !isAnalyzing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-slate-200">{file.name}</span>
                  <span className="text-[10px] text-slate-500">
                    ({(file.size / 1024).toFixed(1)} Ko)
                  </span>
                </div>
                <div className="text-xs font-bold text-sky-400">
                  {sheetsDetected.length} onglet(s) détecté(s)
                </div>
              </div>

              {/* Choix de la stratégie */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-sky-400" />
                  <span>Mode d'application pour les onglets sélectionnés :</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                      strategie === 'REPLACE_SELECTED'
                        ? 'bg-sky-950/40 border-sky-500/60 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategie"
                      checked={strategie === 'REPLACE_SELECTED'}
                      onChange={() => setStrategie('REPLACE_SELECTED')}
                      className="mt-0.5 text-sky-500"
                    />
                    <div>
                      <div className="font-bold text-slate-200">Remplacer onglets choisis</div>
                      <div className="text-[11px] text-slate-400">
                        Écrase le stock uniquement pour les onglets cochés. Les autres onglets existants restent intacts.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                      strategie === 'MERGE_ADD'
                        ? 'bg-sky-950/40 border-sky-500/60 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategie"
                      checked={strategie === 'MERGE_ADD'}
                      onChange={() => setStrategie('MERGE_ADD')}
                      className="mt-0.5 text-sky-500"
                    />
                    <div>
                      <div className="font-bold text-slate-200">Ajouter / Cumuler (Fusion)</div>
                      <div className="text-[11px] text-slate-400">
                        Ajoute les chutes du fichier à celles déjà présentes dans la base SQLite.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                      strategie === 'REPLACE_ALL'
                        ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategie"
                      checked={strategie === 'REPLACE_ALL'}
                      onChange={() => setStrategie('REPLACE_ALL')}
                      className="mt-0.5 text-amber-500"
                    />
                    <div>
                      <div className="font-bold text-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Remplacement Total</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Supprime tout l'ancien stock de chutes et ne conserve que le nouveau classeur.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sélection des onglets */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={countSelectionnes === sheetsDetected.length && sheetsDetected.length > 0}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      id="selectAllSheets"
                      className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="selectAllSheets" className="text-xs font-bold text-slate-200 cursor-pointer select-none">
                      Tout sélectionner ({sheetsDetected.length} onglets)
                    </label>
                  </div>
                  <div className="text-xs text-slate-400">
                    <span className="font-bold text-sky-400">{countSelectionnes}</span> sélectionnés •{' '}
                    <span className="font-bold text-emerald-400">{totalChutesSelectionnees}</span> chutes au total
                  </div>
                </div>

                <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
                  {sheetsDetected.map(sheet => (
                    <div
                      key={sheet.name}
                      onClick={() => handleToggleSheet(sheet.name)}
                      className={`px-4 py-2.5 flex items-center justify-between hover:bg-slate-900/60 cursor-pointer transition select-none ${
                        sheet.selected ? 'bg-sky-950/20' : 'opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={sheet.selected}
                          onChange={() => {}}
                          className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                            <span>{sheet.name}</span>
                            {sheet.isMaille && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                Toile Moustiquaire
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>{sheet.count} chutes trouvées</span>
                            {sheet.alreadyExists && (
                              <span className="text-amber-400/80">
                                • {sheet.existingCount} existante(s) en base
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${
                          sheet.count > 0 ? 'bg-sky-500/10 text-sky-300' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {sheet.count} pcs
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            {file && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setSheetsDetected([]);
                  setParsedData(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                Changer de fichier Excel
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              Annuler
            </button>
            {file && (
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={isApplying || countSelectionnes === 0}
                className="px-5 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs rounded-lg flex items-center gap-1.5 transition shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
              >
                {isApplying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Confirmer l'Import ({countSelectionnes} onglets)</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
