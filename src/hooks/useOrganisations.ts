import { useCallback, useEffect, useState } from 'react';
import {
  mesMemberships,
  listerOrganisations,
  Organisation,
  creerOrganisation,
} from '@/services/organisations.service';
import { extractErrorMessage } from '@/lib/api';

export function useOrganisations() {
  const [mesOrgs, setMesOrgs] = useState<Organisation[]>([]);
  const [toutesOrgs, setToutesOrgs] = useState<Organisation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMesOrgs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await mesMemberships();
      setMesOrgs(data);
    } catch (e: any) {
      setError(extractErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchToutesOrgs = useCallback(async () => {
    try {
      const data = await listerOrganisations();
      setToutesOrgs(data);
    } catch {
      // silencieux
    }
  }, []);

  const creer = useCallback(async (nom: string, description?: string): Promise<Organisation | null> => {
    try {
      const org = await creerOrganisation({ nom, description });
      await fetchMesOrgs();
      return org;
    } catch (e: any) {
      throw e;
    }
  }, [fetchMesOrgs]);

  useEffect(() => {
    fetchMesOrgs();
  }, [fetchMesOrgs]);

  return {
    mesOrgs,
    toutesOrgs,
    isLoading,
    error,
    refetch: fetchMesOrgs,
    fetchToutesOrgs,
    creer,
  };
}
