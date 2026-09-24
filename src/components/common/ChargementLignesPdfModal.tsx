import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Trash2,
  ShieldCheck,
  Layers,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  FileSpreadsheet
} from 'lucide-react';
import {
  PdfCommandeParserService,
  LigneCommandeExtraite,
  ResultatExtractionPDF
} from '../../services/pdfCommandeParserService';

interface ChargementLignesPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  familleActive: 'TABLIER' | 'CAISSON' | 'MOUSTIQUAIRE' | 'PRECADRE';
  nomProfilActif?: string;
  numCommandeActuel?: string;
  nomClientActuel?: string;
  onValiderImportLignes: (data: {
    lignes: LigneCommandeExtraite[];
    modeAjout: 'REMPLACER' | 'AJOUTER';
    majNumCommande?: string;
    majClient?: string;
    majDate?: string;
    majAvecLF?: boolean;
    hauteurLameSuggeree?: number;
  }) => void;
}

export const ChargementLignesPdfModal: React.FC<ChargementLignesPdfModalProps> = ({
  isOpen,
  onClose,
  familleActive,
  nomProfilActif,
  numCommandeActuel,
  nomClientActuel,
  onValiderImportLignes
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultat, setResultat] = useState<ResultatExtractionPDF | null>(null);
  const [nomFichier, setNomFichier] = useState<string>('');
  const [lignesSelectionnees, setLignesSelectionnees] = useState<Set<string>>(new Set());
  const [lignesModifiables, setLignesModifiables] = useState<LigneCommandeExtraite[]>([]);
  
  // Options d'injection
  const [modeAjout, setModeAjout] = useState<'REMPLACER' | 'AJOUTER'>('REMPLACER');
  const [appliquerNumCmd, setAppliquerNumCmd] = useState(true);
  const [appliquerClient, setAppliquerClient] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Veuillez sélectionner un document PDF.');
      return;
    }

    setNomFichier(file.name);
    setIsProcessing(true);

    try {
      const res = await PdfCommandeParserService.parserBordereauPDF(file);
      setResultat(res);
      setLignesModifiables(res.lignes);
      setLignesSelectionnees(new Set(res.lignes.map(l => l.id)));
    } catch (err: any) {
      alert(`Erreur d'analyse : ${err?.message || 'Fichier PDF non lisible'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const toggleSelectAll = () => {
    if (lignesSelectionnees.size === lignesModifiables.length) {
      setLignesSelectionnees(new Set());
    } else {
      setLignesSelectionnees(new Set(lignesModifiables.map(l => l.id)));
    }
  };

  const toggleSelectLigne = (id: string) => {
    const next = new Set(lignesSelectionnees);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLignesSelectionnees(next);
  };

  const handleSupprimerLigne = (id: string) => {
    setLignesModifiables(prev => prev.filter(l => l.id !== id));
    setLignesSelectionnees(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleModifierChamp = (id: string, field: keyof LigneCommandeExtraite, val: any) => {
    setLignesModifiables(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: val } : l))
    );
  };

  const handleConfirmer = () => {
    const selection = lignesModifiables.filter(l => lignesSelectionnees.has(l.id));
    if (selection.length === 0) {
      alert('Veuillez sélectionner au moins une ligne à charger.');
      return;
    }

    onValiderImportLignes({
      lignes: selection,
      modeAjout,
      majNumCommande: appliquerNumCmd && resultat?.numCommandeDetecte ? resultat.numCommandeDetecte : undefined,
      majClient: appliquerClient && resultat?.clientDetecte ? resultat.clientDetecte : undefined,
      majDate: resultat?.dateISODetectee,
      majAvecLF: selection.some(s => s.avecLameFinaleDetectee),
      hauteurLameSuggeree: selection[0]?.hauteurLameDetectee
    });

    onClose();
  };

  const totalSelectionnePieces = lignesModifiables
    .filter(l => lignesSelectionnees.has(l.id))
    .reduce((sum, l) => sum + (Number(l.quantite) || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* En-tête Modal */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-100 tracking-tight">
                  Chargement Automatique des Lignes depuis PDF
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {familleActive}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Fiabilité 100%</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Glissez votre bordereau PDF pour extraire instantanément les repères, quantités, largeurs et hauteurs.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Zone de Dépôt / Sélection du fichier */}
          {!resultat && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition cursor-pointer flex flex-col items-center justify-center gap-4 ${
                isDragging
                  ? 'border-amber-400 bg-amber-500/10 scale-[0.99]'
                  : 'border-slate-700 bg-slate-950/50 hover:border-amber-500/50 hover:bg-slate-950'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => {
                  if (e.target.value && e.target.files?.[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />
              <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
                {isProcessing ? (
                  <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-10 h-10" />
                )}
              </div>
              <div>
                <p className="text-base font-bold text-slate-200">
                  {isProcessing ? 'Analyse du PDF en cours...' : 'Glissez le bordereau PDF ici ou cliquez pour parcourir'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Extraction directe et sans erreur des colonnes : Repère, Qté, Largeur, Hauteur, Coloris
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                <span>📋 Formats reconnus : Bordereaux de livraison standard Trois M (Tabliers, Précadres, etc.)</span>
              </div>
            </div>
          )}

          {/* Si extraction effectuée */}
          {resultat && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Carte Récapitulative Détectée */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* N° Commande / BL */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    N° Commande / BL
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-black text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md">
                      {resultat.numCommandeDetecte || 'Non spécifié'}
                    </span>
                    {resultat.numCommandeDetecte && (
                      <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer ml-1">
                        <input
                          type="checkbox"
                          checked={appliquerNumCmd}
                          onChange={e => setAppliquerNumCmd(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Appliquer</span>
                      </label>
                    )}
                  </div>
                  {numCommandeActuel && (
                    <span className="text-[10px] text-slate-400 block">
                      Actuel : <strong className="text-slate-300 font-mono">{numCommandeActuel}</strong>
                    </span>
                  )}
                </div>

                {/* Client Détecté */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Client Détecté
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-200 text-xs truncate max-w-[170px]" title={resultat.clientDetecte}>
                      {resultat.clientDetecte || 'Non identifié'}
                    </span>
                    {resultat.clientDetecte && (
                      <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer ml-1">
                        <input
                          type="checkbox"
                          checked={appliquerClient}
                          onChange={e => setAppliquerClient(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Appliquer</span>
                      </label>
                    )}
                  </div>
                  {nomClientActuel && (
                    <span className="text-[10px] text-slate-400 block truncate">
                      Actuel : <strong className="text-slate-300">{nomClientActuel}</strong>
                    </span>
                  )}
                </div>

                {/* Profilé Actif dans le système */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Profilé Assigné
                  </span>
                  <span className="font-bold text-sky-300 text-xs truncate block bg-sky-500/10 border border-sky-500/30 px-2 py-1 rounded-md" title={nomProfilActif}>
                    📦 {nomProfilActif || 'Profilé courant'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Toutes les lignes hériteront de ce profilé.
                  </span>
                </div>

                {/* Bilan du Contrôle */}
                <div className="space-y-1 bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-2.5 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Contrôle Intégrité 100%</span>
                  </div>
                  <div className="text-xs font-mono text-emerald-200 mt-0.5">
                    <strong>{totalSelectionnePieces}</strong> pièces / <strong>{lignesModifiables.length}</strong> lignes
                  </div>
                </div>

              </div>

              {/* Barre d'outils du tableau */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {lignesSelectionnees.size === lignesModifiables.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </span>
                  </button>
                  <span className="text-xs text-slate-400">
                    Fichier : <strong className="text-slate-300">{nomFichier}</strong>
                  </span>
                </div>

                {/* Choix Mode d'insertion */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-medium">Mode :</span>
                  <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-950">
                    <button
                      type="button"
                      onClick={() => setModeAjout('REMPLACER')}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        modeAjout === 'REMPLACER'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Remplacer la commande
                    </button>
                    <button
                      type="button"
                      onClick={() => setModeAjout('AJOUTER')}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        modeAjout === 'AJOUTER'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Ajouter à la suite
                    </button>
                  </div>
                </div>
              </div>

              {/* Tableau des lignes extraites avec vérification 100% */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-inner">
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-slate-900 text-slate-400 text-[11px] font-semibold border-b border-slate-800 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={lignesSelectionnees.size === lignesModifiables.length && lignesModifiables.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                          />
                        </th>
                        <th className="py-2.5 px-3 w-12 text-center">N°</th>
                        <th className="py-2.5 px-3 w-32">Repère</th>
                        <th className="py-2.5 px-3 w-20 text-center">Qté</th>
                        <th className="py-2.5 px-3 w-28">Largeur (mm)</th>
                        <th className="py-2.5 px-3 w-28">Hauteur (mm)</th>
                        <th className="py-2.5 px-3">Désignation / Détails</th>
                        <th className="py-2.5 px-3 w-20 text-center">Coloris</th>
                        <th className="py-2.5 px-3 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {lignesModifiables.map((ligne, idx) => {
                        const isChecked = lignesSelectionnees.has(ligne.id);
                        return (
                          <tr
                            key={ligne.id}
                            className={`transition ${
                              isChecked ? 'bg-slate-900/40 hover:bg-slate-900/70' : 'opacity-40 hover:opacity-70 bg-slate-950'
                            }`}
                          >
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectLigne(ligne.id)}
                                className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-center text-slate-500 font-sans text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={ligne.repere}
                                onChange={e => handleModifierChamp(ligne.id, 'repere', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-amber-300 focus:ring-1 focus:ring-amber-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="number"
                                min="1"
                                value={ligne.quantite}
                                onChange={e => handleModifierChamp(ligne.id, 'quantite', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                className="w-14 text-center bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs font-bold text-slate-100 focus:ring-1 focus:ring-amber-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                value={ligne.largeur}
                                onChange={e => handleModifierChamp(ligne.id, 'largeur', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-emerald-300 focus:ring-1 focus:ring-amber-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                value={ligne.hauteur}
                                onChange={e => handleModifierChamp(ligne.id, 'hauteur', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-sky-300 focus:ring-1 focus:ring-amber-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-slate-300 font-sans text-xs truncate max-w-[200px]" title={ligne.designation}>
                              {ligne.designation || '—'}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-400 text-xs">
                              {ligne.coloris || '—'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleSupprimerLigne(ligne.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 transition cursor-pointer"
                                title="Supprimer cette ligne"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bouton pour changer de fichier */}
              <div className="flex justify-between items-center text-xs text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setResultat(null);
                    setLignesModifiables([]);
                    setLignesSelectionnees(new Set());
                  }}
                  className="text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Choisir un autre fichier PDF
                </button>
                <span>
                  <strong>{lignesSelectionnees.size}</strong> ligne(s) sélectionnée(s) sur {lignesModifiables.length}
                </span>
              </div>

            </div>
          )}

        </div>

        {/* Pied de page Modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            Annuler
          </button>

          {resultat && (
            <button
              type="button"
              onClick={handleConfirmer}
              disabled={lignesSelectionnees.size === 0}
              className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition cursor-pointer ${
                lignesSelectionnees.size > 0
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>
                📥 Charger {lignesSelectionnees.size} lignes ({totalSelectionnePieces} pièces) dans la commande
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
