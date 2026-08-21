/**
 * src/hooks/useAdminUsers.ts
 * Hook React pour charger et gérer la liste des utilisateurs du cabinet en temps réel.
 */

import { extractErrorMessage } from '@/lib/api';
import { activerUser, desactiverUser, deleteUser, getUsers, UserProfile } from '@/services/users.service';
import { useCallback, useEffect, useState } from 'react';

interface UseAdminUsersResult {
  users: UserProfile[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  toggleActivation: (id: number, currentActif: boolean) => Promise<void>;
  deleteAccount: (id: number) => Promise<void>;
}

export function useAdminUsers(): UseAdminUsersResult {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActivation = useCallback(async (id: number, currentActif: boolean) => {
    try {
      const updated = currentActif ? await desactiverUser(id) : await activerUser(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (e) {
      throw e;
    }
  }, []);

  const deleteAccount = useCallback(async (id: number) => {
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      throw e;
    }
  }, []);

  return {
    users,
    isLoading,
    error,
    refetch: load,
    toggleActivation,
    deleteAccount,
  };
}
