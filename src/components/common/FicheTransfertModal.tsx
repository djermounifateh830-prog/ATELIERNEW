import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Truck,
  Plus,
  Trash2,
  Printer,
  CheckCircle,
  Clock,
  FileText,
  User,
  Calendar,
  Save,
  Phone,
  Car,
  Package,
  Layers
} from 'lucide-react';
import {
  FicheTransfert,
  LigneFicheTransfert,
  DossierCommandeGlobal,
  SuiviOF,
  ClientCodification,
  FamilleProduit
} from '../../types';
import { StorageService } from '../../services/storage';

interface FicheTransfertModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossiers: DossierCommandeGlobal[];
  suivisOF: SuiviOF[];
  clientCodifications: ClientCodification[];
  onSaved: () => void;
  ficheToView: FicheTransfert | null;
}

export const FicheTransfertModal: React.FC<FicheTransfertModalProps> = ({
  isOpen,
  onClose,
  dossiers = [],
  suivisOF = [],
  clientCodifications = [],
  onSaved,
  ficheToView = null
}) => {
  const isViewMode = Boolean(ficheToView);

  // Form State
  const [numeroFiche, setNumeroFiche] = useState<string>('');
  const [monClient, setMonClient] = useState<string>('');
  const [nomChauffeur, setNomChauffeur] = useState<string>('');
  const [matriculeVehicule, setMatriculeVehicule] = useState<string>('');
  const [telephoneChauffeur, setTelephoneChauffeur] = useState<string>('');
  const [dateLivraison, setDateLivraison] = useState<string>('');
  const [statut, setStatut] = useState<'VALIDEE' | 'EN_PREPARATION'>('VALIDEE');
  const [notes, setNotes] = useState<string>('');
  const [lignes, setLignes] = useState<LigneFicheTransfert[]>([]);
  const [visaChauffeur, setVisaChauffeur] = useState<string>('');
  const [visaAtelier, setVisaAtelier] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selector helper for pending OFs
  const [showOfSelector, setShowOfSelector] = useState<boolean>(false);
  const [searchOfQuery, setSearchOfQuery] = useState<string>('');

  const todayStr = useMemo(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  // Initialize or reset form
  useEffect(() => {
    if (!isOpen) return;

    if (ficheToView) {
      setNumeroFiche(ficheToView.numeroFiche || '');
      setMonClient(ficheToView.monClient || '');
      setNomChauffeur(ficheToView.nomChauffeurPrincipal || '');
      setMatriculeVehicule(ficheToView.matriculeVehicule || '');
      setTelephoneChauffeur(ficheToView.telephoneChauffeur || '');
      setDateLivraison(ficheToView.dateLivraison || todayStr);
      setStatut(ficheToView.statut === 'ANNULEE' ? 'VALIDEE' : (ficheToView.statut || 'VALIDEE'));
      setNotes(ficheToView.notes || '');
      setLignes(ficheToView.lignes || []);
      setVisaChauffeur(ficheToView.visaChauffeur || '');
      setVisaAtelier(ficheToView.visaAtelier || '');
      setErrorMsg(null);
    } else {
      const generatedNum = `FT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      setNumeroFiche(generatedNum);
      setMonClient(clientCodifications[0]?.nom || '');
      setNomChauffeur('');
      setMatriculeVehicule('');
      setTelephoneChauffeur('');
      setDateLivraison(todayStr);
      setStatut('VALIDEE');
      setNotes('');
      setLignes([]);
      setVisaChauffeur('');
      setVisaAtelier('Atelier 3M');
      setErrorMsg(null);
    }
  }, [isOpen, ficheToView, todayStr, clientCodifications]);

  // Available OFs that can be added to the transfer sheet
  const availableOFs = useMemo(() => {
    return suivisOF.filter(of => {
      // Exclure ceux déjà annulés
      if (of.statut === 'ANNULE') return false;
      // Ne pas lister ceux déjà présents dans la fiche courante
      if (lignes.some(l => l.ofId === of.id)) return false;
      if (!searchOfQuery.trim()) return true;
      const q = searchOfQuery.toLowerCase().trim();
      return (
        (of.numCommande || '').toLowerCase().includes(q) ||
        (of.nomClient || '').toLowerCase().includes(q) ||
        (of.codeOF || '').toLowerCase().includes(q) ||
        (of.donneurOrdre || '').toLowerCase().includes(q) ||
        (of.titreSection || '').toLowerCase().includes(q)
      );
    });
  }, [suivisOF, lignes, searchOfQuery]);

  const handleAddOfToLignes = (of: SuiviOF) => {
    const newLine: LigneFicheTransfert = {
      id: `l-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      dossierId: of.dossierId,
      ofId: of.id,
      nomChauffeur: nomChauffeur || of.nomChauffeur || '',
      numCommande: of.numCommande || of.codeOF || 'CMD',
      clientDeMonClient: of.nomClient || 'Client',
      familleProduit: of.famille,
      quantiteArticles: of.nombrePieces || 1,
      designationDetail: of.titreSection || `${of.famille} - ${of.numCommande}`,
      remarques: of.notes || ''
    };

    setLignes(prev => [...prev, newLine]);
    // Synchroniser le donneur d'ordre si non défini
    if (!monClient && of.donneurOrdre) {
      setMonClient(of.donneurOrdre);
    }
  };

  const handleAddManualLine = () => {
    const newLine: LigneFicheTransfert = {
      id: `l-man-${Date.now()}`,
      nomChauffeur: nomChauffeur || '',
      numCommande: '',
      clientDeMonClient: '',
      familleProduit: 'CAISSON' as FamilleProduit,
      quantiteArticles: 1,
      designationDetail: '',
      remarques: ''
    };
    setLignes(prev => [...prev, newLine]);
  };

  const handleUpdateLine = (index: number, field: keyof LigneFicheTransfert, value: any) => {
    setLignes(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveLine = (index: number) => {
    setLignes(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveFiche = async () => {
    if (!numeroFiche.trim()) {
      setErrorMsg('Veuillez renseigner un numéro de fiche de transfert.');
      return;
    }
    if (!monClient.trim()) {
      setErrorMsg('Veuillez renseigner ou sélectionner le client (donneur d\'ordre).');
      return;
    }
    if (!nomChauffeur.trim()) {
      setErrorMsg('Veuillez renseigner le nom du transporteur ou chauffeur.');
      return;
    }
    if (lignes.length === 0) {
      setErrorMsg('Veuillez ajouter au moins une ligne de livraison.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const ficheId = ficheToView?.id || `ft-${Date.now()}`;
    const newFiche: FicheTransfert = {
      id: ficheId,
      numeroFiche: numeroFiche.trim(),
      monClient: monClient.trim(),
      nomChauffeurPrincipal: nomChauffeur.trim(),
      matriculeVehicule: matriculeVehicule.trim(),
      telephoneChauffeur: telephoneChauffeur.trim(),
      dateLivraison: dateLivraison || todayStr,
      lignes: lignes.map(l => ({ ...l, nomChauffeur: nomChauffeur.trim() })),
      visaChauffeur: visaChauffeur.trim() || nomChauffeur.trim(),
      visaAtelier: visaAtelier.trim() || 'Atelier 3M',
      statut,
      notes: notes.trim(),
      createdAt: ficheToView?.createdAt || new Date().toISOString()
    };

    try {
      // 1. Sauvegarder la fiche de transfert
      await StorageService.upsertFicheTransfert(newFiche);

      // 2. Mettre à jour les OFs concernés : marquer comme LIVRE et lier l'ID de la fiche
      for (const ligne of lignes) {
        if (ligne.ofId) {
          const of = suivisOF.find(o => o.id === ligne.ofId);
          if (of) {
            const updatedOF: SuiviOF = {
              ...of,
              ficheTransfertId: newFiche.id,
              statut: 'LIVRE',
              dateLivraison: newFiche.dateLivraison,
              nomChauffeur: newFiche.nomChauffeurPrincipal
            };
            await StorageService.upsertSuiviOF(updatedOF);
          }
        }
      }

      // 3. Mettre à jour les dossiers correspondants si applicable
      try {
        const freshDossiers = await StorageService.getDossiers();
        let anyDossierUpdated = false;

        const updatedDossiers = freshDossiers.map(d => {
          const isConcerned = lignes.some(l => {
            if (l.dossierId && l.dossierId === d.id) return true;
            const cmd = (l.numCommande || '').trim().toLowerCase();
            if (!cmd) return false;
            return (
              (d.refCommande || '').toLowerCase() === cmd ||
              (d.numCommandeCaisson || '').toLowerCase() === cmd ||
              (d.numCommandeTablier || '').toLowerCase() === cmd ||
              (d.numCommandeMoustiquaire || '').toLowerCase() === cmd ||
              (d.numCommandePrecadre || '').toLowerCase() === cmd
            );
          });

          if (isConcerned) {
            anyDossierUpdated = true;
            return {
              ...d,
              statut: 'LIVRE' as const,
              ficheTransfertId: newFiche.id,
              dateLivraison: newFiche.dateLivraison,
              nomChauffeur: newFiche.nomChauffeurPrincipal
            };
          }
          return d;
        });

        if (anyDossierUpdated) {
          await StorageService.saveDossiers(updatedDossiers);
        }
      } catch (errD) {
        console.warn('Erreur mise à jour statuts dossiers rattachés:', errD);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la sauvegarde de la fiche.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const totalColis = lignes.reduce((acc, l) => acc + (Number(l.quantiteArticles) || 0), 0);

  return (
    <div
      id="fiche-transfert-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
    >
      <div
        id="fiche-transfert-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
      >
        {/* Entête Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  {isViewMode ? `Fiche de Transfert : ${numeroFiche}` : 'Créer une Fiche de Transfert Transporteur'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    statut === 'VALIDEE'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {statut === 'VALIDEE' ? 'Validée / Expédiée' : 'En Préparation'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Bon de livraison et de chargement transporteur avec visa chauffeur et responsable atelier.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
              title="Imprimer le bon de livraison"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Imprimer Bon</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corps du Formulaire */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm">
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1 : Informations Générales de Transfert */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              <span>Coordonnées &amp; Informations Transport</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  N° de Fiche / Bon
                </label>
                <input
                  type="text"
                  value={numeroFiche}
                  onChange={e => setNumeroFiche(e.target.value)}
                  disabled={isViewMode}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none disabled:opacity-70"
                  placeholder="FT-2026-XXXX"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Donneur d'Ordre (Mon Client) *
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={monClient}
                    onChange={e => setMonClient(e.target.value)}
                    disabled={isViewMode}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-semibold focus:border-amber-500 focus:outline-none disabled:opacity-70"
                    placeholder="ex: SOMADAL Alger, CRISTAL Oran..."
                  />
                  {!isViewMode && clientCodifications.length > 0 && (
                    <select
                      onChange={e => {
                        if (e.target.value) setMonClient(e.target.value);
                      }}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 text-xs text-slate-300 cursor-pointer"
                      title="Sélectionner une agence ou client habituel"
                      defaultValue=""
                    >
                      <option value="" disabled>Choisir...</option>
                      {clientCodifications.map(c => (
                        <option key={c.id} value={c.nom}>{c.nom}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Date de Livraison
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={dateLivraison}
                    onChange={e => setDateLivraison(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70 font-mono"
                    placeholder="DD/MM/YYYY"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Nom du Chauffeur / Transporteur *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={nomChauffeur}
                    onChange={e => setNomChauffeur(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70"
                    placeholder="Nom et prénom du chauffeur"
                  />
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Matricule Véhicule
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={matriculeVehicule}
                    onChange={e => setMatriculeVehicule(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70 font-mono"
                    placeholder="ex: 01452-120-16"
                  />
                  <Car className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Téléphone Chauffeur
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={telephoneChauffeur}
                    onChange={e => setTelephoneChauffeur(e.target.value)}
                    disabled={isViewMode}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-70 font-mono"
                    placeholder="05 XX XX XX XX"
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 : Tableau des Colis & Articles à Transférer */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-3.5 h-3.5" />
                <span>Colis &amp; Commandes Livrées ({lignes.length} lignes, {totalColis} pièces au total)</span>
              </div>

              {!isViewMode && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOfSelector(!showOfSelector)}
                    className="px-2.5 py-1 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{showOfSelector ? 'Fermer Sélecteur' : 'Ajouter depuis les OFs'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddManualLine}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ligne Manuelle</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sélecteur rapide d'OFs disponibles */}
            {showOfSelector && !isViewMode && (
              <div className="p-3 bg-slate-900 border border-blue-900/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-blue-300">
                    Sélectionner un OF prêt ou en cours pour l'insérer dans la fiche :
                  </span>
                  <input
                    type="text"
                    value={searchOfQuery}
                    onChange={e => setSearchOfQuery(e.target.value)}
                    placeholder="Filtrer commande, client..."
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-slate-800">
                  {availableOFs.length === 0 ? (
                    <div className="text-xs text-slate-500 py-2 text-center">
                      Aucun OF disponible à associer (ou tous déjà ajoutés).
                    </div>
                  ) : (
                    availableOFs.map(of => (
                      <div
                        key={of.id}
                        className="pt-1.5 pb-1 flex items-center justify-between text-xs hover:bg-slate-800/60 px-2 rounded cursor-pointer transition"
                        onClick={() => handleAddOfToLignes(of)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400">{of.numCommande || of.codeOF}</span>
                          <span className="text-slate-300 font-semibold">{of.nomClient}</span>
                          <span className="text-slate-500 font-mono text-[11px]">({of.donneurOrdre})</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-bold">
                            {of.famille}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px] font-mono">{of.nombrePieces || 1} pièce(s)</span>
                          <span className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-[10px]">
                            + Ajouter
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tableau des Lignes */}
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-2.5">N° Commande</th>
                    <th className="py-2 px-2.5">Client Final</th>
                    <th className="py-2 px-2.5">Famille</th>
                    <th className="py-2 px-2 text-center">Qté</th>
                    <th className="py-2 px-2.5">Désignation / Détail</th>
                    <th className="py-2 px-2.5">Remarques</th>
                    {!isViewMode && <th className="py-2 px-2 text-center w-10">Suppr</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {lignes.length === 0 ? (
                    <tr>
                      <td colSpan={isViewMode ? 6 : 7} className="py-6 text-center text-slate-500">
                        Aucune commande n'a encore été ajoutée à ce bon de transfert.
                      </td>
                    </tr>
                  ) : (
                    lignes.map((ligne, idx) => (
                      <tr key={ligne.id || idx} className="hover:bg-slate-900/50">
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="font-mono font-bold text-amber-300">{ligne.numCommande}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.numCommande}
                              onChange={e => handleUpdateLine(idx, 'numCommande', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono font-bold text-amber-300 focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="font-medium text-slate-200">{ligne.clientDeMonClient}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.clientDeMonClient}
                              onChange={e => handleUpdateLine(idx, 'clientDeMonClient', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none"
                              placeholder="Client final"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-bold">
                              {ligne.familleProduit}
                            </span>
                          ) : (
                            <select
                              value={ligne.familleProduit}
                              onChange={e => handleUpdateLine(idx, 'familleProduit', e.target.value)}
                              className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
                            >
                              <option value="CAISSON">CAISSON</option>
                              <option value="TABLIER">TABLIER</option>
                              <option value="MOUSTIQUAIRE">MOUSTIQUAIRE</option>
                              <option value="PRECADRE">PRECADRE</option>
                            </select>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {isViewMode ? (
                            <span className="font-mono font-bold text-slate-100">{ligne.quantiteArticles}</span>
                          ) : (
                            <input
                              type="number"
                              min={1}
                              value={ligne.quantiteArticles}
                              onChange={e => handleUpdateLine(idx, 'quantiteArticles', Number(e.target.value) || 1)}
                              className="w-14 text-center bg-slate-900 border border-slate-800 rounded px-1.5 py-1 font-mono font-bold text-slate-100 focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="text-slate-300 text-xs">{ligne.designationDetail || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.designationDetail || ''}
                              onChange={e => handleUpdateLine(idx, 'designationDetail', e.target.value)}
                              placeholder="ex: 2 Caissons 25 + 2 Sous-faces"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isViewMode ? (
                            <span className="text-slate-400 text-xs">{ligne.remarques || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={ligne.remarques || ''}
                              onChange={e => handleUpdateLine(idx, 'remarques', e.target.value)}
                              placeholder="Remarque"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-400 text-xs focus:outline-none"
                            />
                          )}
                        </td>
                        {!isViewMode && (
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                              title="Retirer cette ligne"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3 : Notes & Visas Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 border border-slate-800 rounded-xl p-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Remarques &amp; Consignes Particulières
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={isViewMode}
                rows={3}
                placeholder="Consignes de livraison, contact sur site, fragilité..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-70"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Visa / Nom Chauffeur Transporteur
                </label>
                <input
                  type="text"
                  value={visaChauffeur}
                  onChange={e => setVisaChauffeur(e.target.value)}
                  disabled={isViewMode}
                  placeholder="Nom et signature chauffeur"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-70"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Visa Responsable Atelier Expédition
                </label>
                <input
                  type="text"
                  value={visaAtelier}
                  onChange={e => setVisaAtelier(e.target.value)}
                  disabled={isViewMode}
                  placeholder="Atelier 3M"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-70"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pied de Page Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono">
            Total : <span className="font-bold text-amber-400">{lignes.length}</span> ligne(s) •{' '}
            <span className="font-bold text-amber-400">{totalColis}</span> article(s)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              Fermer
            </button>

            {!isViewMode && (
              <button
                type="button"
                onClick={handleSaveFiche}
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-lg flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Enregistrement...' : 'Valider &amp; Expédier'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
