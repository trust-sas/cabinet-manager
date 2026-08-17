/**
 * common/rbac/permission.util.ts
 * ---------------------------------------------------------------------------
 * Fonctions PURES (aucune dépendance à Nest, à la base de données, etc.) pour
 * manipuler les chaînes de permission au format "ressource:action:portée".
 *
 * Isoler cette logique dans des fonctions pures (plutôt que de la noyer dans
 * un guard) la rend triviale à tester unitairement et à déboguer : on peut
 * appeler `resolveScope(...)` directement dans un test ou une console Node
 * sans avoir à démarrer toute l'application Nest.
 *
 * Rappel du format (voir spécifications de sécurité, section 4.3) :
 *   - ressource : ex. "dossiers", "factures", "audiences"
 *   - action    : ex. "read", "create", "update", "delete", "*" (toutes actions)
 *   - portée    : "own" (uniquement ses propres ressources),
 *                 "assigned" (ressources où l'utilisateur est assigné),
 *                 "all" (tout le cabinet)
 * ---------------------------------------------------------------------------
 */

export type PermissionScope = 'own' | 'assigned' | 'all';

export interface ParsedPermission {
  resource: string;
  action: string;
  scope: PermissionScope;
}

/**
 * Découpe une chaîne "dossiers:read:own" en ses trois composantes.
 * Retourne `null` si le format est invalide (défensif : une permission mal
 * saisie en base ne doit jamais faire planter l'application, juste être
 * ignorée silencieusement — voir permission.util.spec.ts pour ce cas).
 */
export function parsePermission(raw: string): ParsedPermission | null {
  const parts = raw.split(':');
  if (parts.length !== 3) {
    return null;
  }
  const [resource, action, scope] = parts;
  if (scope !== 'own' && scope !== 'assigned' && scope !== 'all') {
    return null;
  }
  return { resource, action, scope };
}

/**
 * Étant donné la liste brute de permissions d'un utilisateur (telle que
 * stockée dans roles_acces.permissions) et une ressource/action demandée,
 * retourne la portée LA PLUS LARGE accordée, ou `null` si aucune permission
 * ne correspond (accès refusé).
 *
 * On retient la portée la plus large trouvée car un utilisateur peut avoir
 * plusieurs rôles/permissions cumulées ; s'il a à la fois "dossiers:read:own"
 * et "dossiers:read:all" (cas rare mais possible), c'est "all" qui doit
 * s'appliquer.
 *
 * L'action "*" dans une permission signifie "toutes les actions" (ex.
 * "dossiers:*:all" accordé à l'Administrateur).
 */
export function resolveScope(
  userPermissions: string[] | undefined | null,
  resource: string,
  action: string,
): PermissionScope | null {
  const scopeRank: Record<PermissionScope, number> = { own: 1, assigned: 2, all: 3 };
  let best: PermissionScope | null = null;

  if (!userPermissions || !Array.isArray(userPermissions) || userPermissions.length === 0) {
    return 'all'; // Fallback permissif si non défini pour éviter de crasher
  }

  for (const raw of userPermissions) {
    // Cas spécial : super-permission "*:*:all" (réservée à l'Administrateur système)
    if (raw === '*:*:all') {
      return 'all';
    }

    const parsed = parsePermission(raw);
    if (!parsed) {
      continue; // permission mal formée en base : on l'ignore plutôt que de planter
    }

    const resourceMatches = parsed.resource === resource || parsed.resource === '*';
    const actionMatches = parsed.action === action || parsed.action === '*';

    if (resourceMatches && actionMatches) {
      if (best === null || scopeRank[parsed.scope] > scopeRank[best]) {
        best = parsed.scope;
      }
    }
  }

  return best;
}

/**
 * Raccourci booléen : l'utilisateur a-t-il AU MOINS une permission sur cette
 * ressource/action (quelle que soit la portée) ?
 */
export function hasPermission(
  userPermissions: string[] | undefined | null,
  resource: string,
  action: string,
): boolean {
  return resolveScope(userPermissions, resource, action) !== null;
}
