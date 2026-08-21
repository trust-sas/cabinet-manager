/**
 * src/hooks/useFactures.ts
 * Hook React pour charger les factures et encaissements depuis le backend.
 */
import { extractErrorMessage } from '@/lib/api';
import {
  Facture, CreateFactureDto, UpdateFactureDto, QueryFactures,
  CreateEncaissementDto, Encaissement,
  addEncaissement, createFacture, deleteFacture, envoyerFacture, getEncaissements,
  getFacture, getFactures, updateFacture,
} from '@/services/facturation.service';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFacturesOptions extends QueryFactures {
  lazy?: boolean;
}

interface UseFacturesResult {
  factures: Facture[];
  isLoading: boolean;
  error: string | null;
  total: number;
  totalFacture: number;
  totalEncaisse: number;
  totalImpaye: number;
  tauxRecouvrement: number;
  refetch: () => Promise<void>;
  create: (dto: CreateFactureDto) => Promise<Facture>;
  update: (id: number, dto: UpdateFactureDto) => Promise<Facture>;
  envoyer: (id: number) => Promise<Facture>;
  encaisser: (factureId: number, dto: CreateEncaissementDto) => Promise<Facture>;
  supprimer: (id: number) => Promise<void>;
}

export function useFactures(options: UseFacturesOptions = {}): UseFacturesResult {
  const { lazy = false, ...query } = options;
  const [factures, setFactures] = useState<Facture[]>([]);
  const [isLoading, setIsLoading] = useState(!lazy);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getFactures(query);
      setFactures(result.data);
      setTotal(result.total);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [query.dossierId, query.clientId, query.statut]);

  useEffect(() => {
    if (!lazy) load();
  }, [lazy, load]);

  // KPIs agrégés depuis les données chargées
  const totalFacture  = factures.reduce((s, f) => s + Number(f.montantTtc), 0);
  const totalEncaisse = factures.reduce((s, f) => s + Number(f.montantEncaisse), 0);
  const totalImpaye   = totalFacture - totalEncaisse;
  const tauxRecouvrement = totalFacture > 0
    ? Math.round((totalEncaisse / totalFacture) * 100)
    : 0;

  const create = useCallback(async (dto: CreateFactureDto): Promise<Facture> => {
    const f = await createFacture(dto);
    setFactures(prev => [f, ...prev]);
    setTotal(t => t + 1);
    return f;
  }, []);

  const update = useCallback(async (id: number, dto: UpdateFactureDto): Promise<Facture> => {
    const updated = await updateFacture(id, dto);
    setFactures(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  }, []);

  const envoyer = useCallback(async (id: number): Promise<Facture> => {
    const updated = await envoyerFacture(id);
    setFactures(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  }, []);

  const encaisser = useCallback(async (factureId: number, dto: CreateEncaissementDto): Promise<Facture> => {
    const updated = await addEncaissement(factureId, dto);
    setFactures(prev => prev.map(f => f.id === factureId ? updated : f));
    return updated;
  }, []);

  const supprimer = useCallback(async (id: number): Promise<void> => {
    await deleteFacture(id);
    setFactures(prev => prev.filter(f => f.id !== id));
    setTotal(t => Math.max(0, t - 1));
  }, []);

  return {
    factures, isLoading, error, total,
    totalFacture, totalEncaisse, totalImpaye, tauxRecouvrement,
    refetch: load, create, update, envoyer, encaisser, supprimer,
  };
}

// ── Hook pour un seul dossier avec ses encaissements ─────────────────────────

interface UseFactureResult {
  facture: Facture | null;
  encaissements: Encaissement[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFacture(id: number): UseFactureResult {
  const [facture, setFacture] = useState<Facture | null>(null);
  const [encaissements, setEncaissements] = useState<Encaissement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [f, enc] = await Promise.all([getFacture(id), getEncaissements(id)]);
      setFacture(f);
      setEncaissements(enc);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  return { facture, encaissements, isLoading, error, refetch: fetch };
}
