import React, { useState, useMemo, useEffect } from 'react';
import {
  FicheTransfert,
  LigneFicheTransfert,
  DossierCommandeGlobal,
  SuiviOF,
  ClientCodification
} from '../../types';
import { StorageService } from '../../services/storage';
import {
  Truck,
  Printer,
  X,
  Calendar,
  User,
  Building2,
  Trash2,
  Plus,
  Check,
  Edit3,
  FileCheck,
  Save
} from 'lucide-react';

interface FicheTransfertModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossiers: DossierCommandeGlobal[];
  suivisOF: SuiviOF[];
  clientCodifications: ClientCodification[];
  onFicheCreated?: () => void;
  onSaved?: () => void;
  ficheToView?: FicheTransfert | null;
}

export const FicheTransfertModal: React.FC<FicheTransfertModalProps> = ({
  isOpen,
  onClose,
  dossiers = [],
  suivisOF = [],
  clientCodifications = [],
  onFicheCreated,
  onSaved,
  ficheToView = null
}) => {
  // Liste des agences / donneurs d'ordre disponibles
  const agencesDisponibles = useMemo(() => {
    const list = clientCodifications.map(c => c.nom);
    const set = new Set(list);
    dossiers.forEach(d => {
      if (d.donneurOrdre) set.add(d.donneurOrdre);
    });
    return Array.from(set);
  }, [clientCodifications, dossiers]);

  // Génération automatique d'un numéro officiel propre sans mention "PROV"
  const getNumeroFicheParDefaut = (dateStr: string) => {
    const cleanDate = dateStr.replace(/[\/\s]/g, '');
    const rand = Math.floor(10 + Math.random() * 90);
    return `FT-${cleanDate}-${rand}`;
  };

  // Form State
  const [monClient, setMonClient] = useState<string>(() => {
    return agencesDisponibles[0] || 'SOMODAL Oran';
  });
  const [nomChauffeur, setNomChauffeur] = useState<string>('');
  const [dateLivraison, setDateLivraison] = useState<string>('02/09/2026');
  const [numeroFiche, setNumeroFiche] = useState<string>('FT-02092026-01');
  const [remarquesFiche, setRemarquesFiche] = useState<string>('');

  // Commandes / Dossiers prêts (Clôturés / Fabriqués)
  const dossiersEligibles = useMemo(() => {
    return dossiers.filter(d => {
      const matchClient = !monClient || d.donneurOrdre.toLowerCase().trim() === monClient.toLowerCase().trim();
      const isPret = d.statut === 'FABRIQUE' || d.statut === 'OPTIMISE' || (d.statut as string) === 'TERMINE';
      const nonLivre = d.statut !== 'LIVRE';
      return matchClient && (isPret || nonLivre);
    });
  }, [dossiers, monClient]);

  // OFs éligibles clôturés
  const ofsEligibles = useMemo(() => {
    return suivisOF.filter(of => {
      const matchClient = !monClient || (of.donneurOrdre && of.donneurOrdre.toLowerCase().trim() === monClient.toLowerCase().trim());
      return of.statut === 'CLOTURE' && matchClient;
    });
  }, [suivisOF, monClient]);

  // Lignes de transfert
  const [lignes, setLignes] = useState<LigneFicheTransfert[]>([]);
  const [isGenerated, setIsGenerated] = useState<boolean>(false);
  const [currentFiche, setCurrentFiche] = useState<FicheTransfert | null>(null);

  // Initialisation si on consulte une fiche existante ou ouverture
  useEffect(() => {
    if (ficheToView) {
      setCurrentFiche(ficheToView);
      setMonClient(ficheToView.monClient);
      setNomChauffeur(ficheToView.nomChauffeurPrincipal || '');
      setDateLivraison(ficheToView.dateLivraison || '02/09/2026');
      setNumeroFiche(ficheToView.numeroFiche);
      setRemarquesFiche(ficheToView.notes || '');
      setLignes(ficheToView.lignes || []);
      setIsGenerated(true);
    } else {
      setCurrentFiche(null);
      setIsGenerated(false);
      const initialNum = getNumeroFicheParDefaut('02/09/2026');
      setNumeroFiche(initialNum);

      // Auto-remplissage des lignes avec les commandes clôturées
      const initialLignes: LigneFicheTransfert[] = [];

      dossiersEligibles.forEach(d => {
        const nbPrecadre = (d.articlesPrecadres || []).reduce((sum, p) => sum + (p.quantite || 1), 0);
        const nbMstq = (d.articlesMoustiquaires || []).reduce((sum, m) => sum + (m.quantite || 1), 0);
        const nbCaisson = (d.articlesCaissons || []).reduce((sum, c) => sum + (c.quantite || 1), 0);
        const nbTablier = (d.articlesTabliers || []).reduce((sum, t) => sum + (t.quantite || 1), 0);

        if (nbPrecadre > 0) {
          initialLignes.push({
            id: `l-${d.id}-prc`,
            dossierId: d.id,
            nomChauffeur: nomChauffeur,
            numCommande: d.numCommandePrecadre || d.refCommande,
            clientDeMonClient: d.nomClientFinal,
            familleProduit: 'PRÉCADRE',
            quantiteArticles: nbPrecadre,
            designationDetail: ''
          });
        }
        if (nbMstq > 0) {
          initialLignes.push({
            id: `l-${d.id}-mstq`,
            dossierId: d.id,
            nomChauffeur: nomChauffeur,
            numCommande: d.numCommandeMoustiquaire || d.refCommande,
            clientDeMonClient: d.nomClientFinal,
            familleProduit: 'MOUSTIQUAIRE',
            quantiteArticles: nbMstq,
            designationDetail: ''
          });
        }
        if (nbCaisson > 0) {
          initialLignes.push({
            id: `l-${d.id}-csn`,
            dossierId: d.id,
            nomChauffeur: nomChauffeur,
            numCommande: d.numCommandeCaisson || d.refCommande,
            clientDeMonClient: d.nomClientFinal,
            familleProduit: 'CAISSON',
            quantiteArticles: nbCaisson,
            designationDetail: ''
          });
        }
        if (nbTablier > 0) {
          initialLignes.push({
            id: `l-${d.id}-tbl`,
            dossierId: d.id,
            nomChauffeur: nomChauffeur,
            numCommande: d.numCommandeTablier || d.refCommande,
            clientDeMonClient: d.nomClientFinal,
            familleProduit: 'TABLIER',
            quantiteArticles: nbTablier,
            designationDetail: ''
          });
        }
      });

      if (initialLignes.length === 0) {
        ofsEligibles.forEach(of => {
          initialLignes.push({
            id: `l-of-${of.id}`,
            ofId: of.id,
            nomChauffeur: nomChauffeur,
            numCommande: of.numCommande,
            clientDeMonClient: of.nomClient,
            familleProduit: of.famille,
            quantiteArticles: of.lignesRetour?.length || 1,
            designationDetail: ''
          });
        });
      }

      setLignes(initialLignes);
    }
  }, [ficheToView, monClient, dossiersEligibles, ofsEligibles]);

  // Ajouter une ligne manuelle
  const handleAjouterLigne = () => {
    const nouvelleLigne: LigneFicheTransfert = {
      id: `l-manuelle-${Date.now()}`,
      nomChauffeur: nomChauffeur,
      numCommande: '',
      clientDeMonClient: '',
      familleProduit: 'PRÉCADRE',
      quantiteArticles: 1,
      designationDetail: ''
    };
    setLignes(prev => [...prev, nouvelleLigne]);
  };

  // Modifier une ligne
  const handleModifierLigne = (id: string, field: keyof LigneFicheTransfert, value: any) => {
    setLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Supprimer une ligne
  const handleSupprimerLigne = (id: string) => {
    setLignes(prev => prev.filter(l => l.id !== id));
  };

  // Validation & Enregistrement dans SQLite
  const handleValiderEtLivrer = async () => {
    if (!monClient) {
      alert('Veuillez sélectionner le nom de votre client.');
      return;
    }
    if (!nomChauffeur.trim()) {
      alert('Veuillez renseigner le nom du transporteur.');
      return;
    }
    if (lignes.length === 0) {
      alert('Veuillez ajouter au moins une commande dans le tableau de la fiche de transfert.');
      return;
    }

    const lignesCompletes = lignes.map(l => ({
      ...l,
      nomChauffeur: l.nomChauffeur || nomChauffeur
    }));

    const numFinal = numeroFiche.trim() || getNumeroFicheParDefaut(dateLivraison);

    const nouvelleFiche: FicheTransfert = {
      id: currentFiche?.id || `ft-${Date.now()}`,
      numeroFiche: numFinal,
      monClient,
      nomChauffeurPrincipal: nomChauffeur,
      dateLivraison,
      lignes: lignesCompletes,
      visaChauffeur: `Visa Transporteur (${nomChauffeur})`,
      visaAtelier: 'Visa Atelier 3M',
      statut: 'VALIDEE',
      notes: remarquesFiche,
      createdAt: currentFiche?.createdAt || new Date().toISOString()
    };

    try {
      await StorageService.upsertFicheTransfert(nouvelleFiche);
      setCurrentFiche(nouvelleFiche);
      setIsGenerated(true);
      if (onFicheCreated) onFicheCreated();
      if (onSaved) onSaved();
    } catch (err: any) {
      alert('Erreur lors de la validation de la fiche de transfert: ' + err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  // Calcul du total des pièces
  const totalQuantite = lignes.reduce((sum, l) => sum + (Number(l.quantiteArticles) || 0), 0);

  // Rendu de la fiche de transfert (format papier épuré et propre)
  const renderDocumentFiche = () => {
    return (
      <div className="bg-white text-slate-950 p-6 sm:p-8 rounded-xl shadow-lg border border-slate-300 print:shadow-none print:border-none print:p-0 print:rounded-none">
        
        {/* En-tête de la fiche de transfert */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-950 text-amber-400 font-black text-xl rounded-lg flex items-center justify-center border border-slate-800">
              3M
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                FICHE DE TRANSFERT DE MARCHANDISE
              </h1>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                ATELIER 3M — BON DE REMISE TRANSPORTEUR
              </p>
            </div>
          </div>

          <div className="text-right">
            {/* Espace libre conformément à la demande */}
          </div>
        </div>

        {/* En-tête : Nom de mon client & Date de livraison & Transporteur */}
        <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-300 p-3.5 rounded-lg mb-4 text-xs">
          <div>
            <span className="text-slate-500 font-bold uppercase text-[10px] block">Nom de mon Client :</span>
            <strong className="text-sm font-black text-slate-900">{monClient}</strong>
          </div>
          <div className="text-right">
            <span className="text-slate-500 font-bold uppercase text-[10px] block">Date de Livraison :</span>
            <strong className="text-sm font-mono font-black text-slate-900">{dateLivraison}</strong>
            <div className="text-slate-700 mt-1 font-semibold">
              Transporteur : <span className="font-bold text-slate-900">{nomChauffeur || '—'}</span>
            </div>
          </div>
        </div>

        {/* ── Tableau Officiel avec les colonnes :
            COMMANDE | CLIENT | PRODUIT | QUANTITÉ
        ── */}
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-left text-xs border-collapse border border-slate-400">
            <thead className="bg-slate-200 text-slate-950 font-black border-b-2 border-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-400 w-44">COMMANDE</th>
                <th className="py-2.5 px-3 border-r border-slate-400">CLIENT</th>
                <th className="py-2.5 px-3 border-r border-slate-400 w-36 text-center">PRODUIT</th>
                <th className="py-2.5 px-3 border-r border-slate-400 text-center w-28">QUANTITÉ</th>
                <th className="py-2.5 px-2 text-center w-12 print:hidden">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 text-slate-900 font-medium">
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic font-medium">
                    Aucune commande dans le tableau. Cliquez sur "Ajouter une commande" ci-dessous.
                  </td>
                </tr>
              ) : (
                lignes.map((ligne, idx) => {
                  return (
                    <tr key={ligne.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      {/* 1. COMMANDE */}
                      <td className="py-2 px-3 border-r border-slate-300 font-mono font-bold text-slate-950">
                        <input
                          type="text"
                          value={ligne.numCommande || ''}
                          onChange={e => handleModifierLigne(ligne.id, 'numCommande', e.target.value)}
                          placeholder="Ex: S-A26736"
                          className="w-full bg-transparent border-0 border-b border-dashed border-slate-300 focus:border-amber-500 focus:bg-amber-50/50 rounded-none px-1 py-0.5 text-xs font-mono font-bold text-slate-950 focus:outline-none"
                        />
                      </td>

                      {/* 2. CLIENT */}
                      <td className="py-2 px-3 border-r border-slate-300 font-bold">
                        <input
                          type="text"
                          value={ligne.clientDeMonClient || ''}
                          onChange={e => handleModifierLigne(ligne.id, 'clientDeMonClient', e.target.value)}
                          placeholder="Nom Client"
                          className="w-full bg-transparent border-0 border-b border-dashed border-slate-300 focus:border-amber-500 focus:bg-amber-50/50 rounded-none px-1 py-0.5 text-xs font-bold text-slate-900 focus:outline-none"
                        />
                      </td>

                      {/* 3. PRODUIT */}
                      <td className="py-2 px-3 border-r border-slate-300 text-center">
                        <select
                          value={ligne.familleProduit}
                          onChange={e => handleModifierLigne(ligne.id, 'familleProduit', e.target.value)}
                          className="w-full bg-transparent border-0 border-b border-dashed border-slate-300 focus:border-amber-500 rounded-none px-1 py-0.5 text-xs font-bold uppercase text-slate-900 focus:outline-none text-center cursor-pointer"
                        >
                          <option value="PRÉCADRE">PRÉCADRE</option>
                          <option value="MOUSTIQUAIRE">MOUSTIQUAIRE</option>
                          <option value="CAISSON">CAISSON</option>
                          <option value="TABLIER">TABLIER</option>
                        </select>
                      </td>

                      {/* 4. QUANTITÉ */}
                      <td className="py-2 px-3 border-r border-slate-300 text-center font-mono font-bold">
                        <input
                          type="number"
                          min="1"
                          value={ligne.quantiteArticles ?? 1}
                          onChange={e => handleModifierLigne(ligne.id, 'quantiteArticles', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 text-center bg-transparent border-0 border-b border-dashed border-slate-300 focus:border-amber-500 focus:bg-amber-50/50 rounded-none px-1 py-0.5 text-xs font-mono font-black text-slate-950 focus:outline-none mx-auto block"
                        />
                      </td>

                      {/* Action Suppression */}
                      <td className="py-2 px-2 text-center print:hidden">
                        <button
                          type="button"
                          onClick={() => handleSupprimerLigne(ligne.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                          title="Supprimer la ligne"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Footer */}
            {lignes.length > 0 && (
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-400 text-xs">
                <tr>
                  <td colSpan={3} className="py-2.5 px-3 text-right uppercase tracking-wider text-slate-800 font-black">
                    TOTAL QUANTITÉ :
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-950 text-sm">
                    {totalQuantite}
                  </td>
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── Bas de Page : VISA TRANSPORTEUR & VISA ATELIER ── */}
        <div className="grid grid-cols-2 gap-6 pt-4 border-t-2 border-slate-900 mt-6 text-xs">
          <div className="border-2 border-slate-400 rounded-lg p-3.5 h-32 flex flex-col justify-between bg-slate-50">
            <div className="font-black text-slate-950 uppercase flex items-center justify-between border-b border-slate-300 pb-1">
              <span>VISA TRANSPORTEUR</span>
              <span className="text-[10px] text-slate-600 font-bold">Signature &amp; Date</span>
            </div>
            <div className="text-[11px] text-slate-700 italic">
              {nomChauffeur ? `Nom : ${nomChauffeur}` : ''}
              <span className="block text-[10px] text-slate-500 mt-0.5">Mention manuscrite "Reçu conforme" :</span>
            </div>
          </div>

          <div className="border-2 border-slate-400 rounded-lg p-3.5 h-32 flex flex-col justify-between bg-slate-50">
            <div className="font-black text-slate-950 uppercase flex items-center justify-between border-b border-slate-300 pb-1">
              <span>VISA ATELIER</span>
              <span className="text-[10px] text-slate-600 font-bold">Responsable Expédition</span>
            </div>
            <div className="text-[11px] text-slate-700 italic">
              Pour l'Atelier 3M — Contrôlé &amp; Remis le <span className="font-bold">{dateLivraison}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">Cachet &amp; Visa Atelier :</span>
            </div>
          </div>
        </div>

        {/* Mention légale de clôture */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-5 pt-2 border-t border-slate-200">
          <span className="font-semibold text-slate-600">Système 3M Atelier</span>
          <span className="font-semibold text-slate-600">Fiche de Transfert — {dateLivraison}</span>
        </div>

      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl shadow-2xl text-slate-100 flex flex-col max-h-[94vh] print:max-h-none print:h-auto print:border-none print:shadow-none print:bg-white print:text-black">
        
        {/* ── Modal Header (Masqué à l'impression) ── */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-4 print:hidden bg-slate-950/70 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Fiche de Transfert &amp; Bon de Remise Transporteur</span>
                {currentFiche && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                    {currentFiche.numeroFiche} • LIVRÉE
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Édition et impression de la fiche de transfert papier.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-xl flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer (Format Papier)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Barre de Contrôle & Paramètres de la Fiche (Masqué à l'impression) ── */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/60 space-y-4 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Nom de mon client */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Nom de mon client *</span>
              </label>
              <select
                value={monClient}
                onChange={e => setMonClient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-500"
              >
                {agencesDisponibles.map(nom => (
                  <option key={nom} value={nom}>{nom}</option>
                ))}
              </select>
            </div>

            {/* Date de livraison */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                <span>Date de livraison *</span>
              </label>
              <input
                type="text"
                value={dateLivraison}
                onChange={e => setDateLivraison(e.target.value)}
                placeholder="02/09/2026"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Transporteur */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nom du Transporteur *</span>
              </label>
              <input
                type="text"
                value={nomChauffeur}
                onChange={e => {
                  const val = e.target.value;
                  setNomChauffeur(val);
                  // Reporter automatiquement sur les lignes qui ont le même transporteur
                  setLignes(prev => prev.map(l => ({ ...l, nomChauffeur: l.nomChauffeur || val })));
                }}
                placeholder="Ex: Transporteur / Chauffeur"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* N° Fiche */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                <FileCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>N° de Fiche (Éditable)</span>
              </label>
              <input
                type="text"
                value={numeroFiche}
                onChange={e => setNumeroFiche(e.target.value)}
                placeholder="FT-02092026-01"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAjouterLigne}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter une ligne</span>
              </button>
              <button
                type="button"
                onClick={handleValiderEtLivrer}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Enregistrer &amp; Marquer LIVRÉE</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Document Officiel de la Fiche de Transfert (Visualisation & Impression) ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 print:p-0 print:overflow-visible print:text-black">
          {renderDocumentFiche()}
        </div>

        {/* ── Footer Actions (Masqué à l'impression) ── */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 print:hidden rounded-b-2xl">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Les cellules du tableau sont <strong>directement éditables</strong>. Définissez le nombre de copies souhaité dans votre gestionnaire d'impression.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-xl flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer la Fiche Papier</span>
            </button>
            <button
              type="button"
              onClick={handleValiderEtLivrer}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Valider &amp; Marquer LIVRÉE</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
