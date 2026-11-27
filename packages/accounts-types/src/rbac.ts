import { z } from 'zod';

export const ROLE_SLUGS = ['super-admin', 'admin', 'moderator', 'content-manager', 'business-manager', 'support', 'business-owner', 'user'] as const;
export const RoleSchema = z.enum(ROLE_SLUGS);
export type Role = z.infer<typeof RoleSchema>;
export const ADMIN_ROLES: readonly Role[] = ['super-admin', 'admin', 'moderator', 'content-manager', 'business-manager', 'support'];
export const PERMISSIONS = ['organizations:read', 'organizations:propose', 'categories:read', 'cities:read', 'content:read', 'content:write', 'content:publish', 'moderation:read', 'moderation:decide', 'claims:read', 'claims:decide', 'sources:read', 'imports:read', 'users:read', 'users:suspend', 'users:roles', 'audit:read', 'stats:read', 'settings:read', 'settings:write', 'settings:publish'] as const;
export const ADMIN_RESOURCE_PERMISSIONS = ['catalog:write', 'catalog:publish', 'catalog:archive', 'owners:read', 'owners:write', 'owners:phone-write', 'owners:phone-reveal', 'reviews:correct', 'media:read', 'media:write'] as const;
export const PermissionSchema = z.enum([...PERMISSIONS, 'listing:quote', 'listing:payment-confirm', ...ADMIN_RESOURCE_PERMISSIONS]);
export type Permission = z.infer<typeof PermissionSchema>;
const catalogRead: Permission[] = ['organizations:read', 'categories:read', 'cities:read'];
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  'super-admin': [...PERMISSIONS, 'listing:quote', 'listing:payment-confirm', ...ADMIN_RESOURCE_PERMISSIONS],
  admin: [...PERMISSIONS.filter(p => p !== 'users:roles'), 'listing:quote', 'listing:payment-confirm', ...ADMIN_RESOURCE_PERMISSIONS],
  moderator: [...catalogRead, 'moderation:read', 'moderation:decide', 'reviews:correct'],
  'content-manager': ['content:read', 'content:write', 'content:publish', 'media:read', 'media:write'],
  'business-manager': [...catalogRead, 'organizations:propose', 'claims:read', 'claims:decide', 'listing:quote', 'catalog:write', 'owners:read', 'owners:write', 'owners:phone-write', 'owners:phone-reveal', 'media:read', 'media:write'],
  support: [...catalogRead, 'users:read'],
  'business-owner': [],
  user: []
});
// These helpers describe policy; API must load roles from DB and also check assurance and ownership.
export function hasPermission(roles: readonly string[], permission: string): boolean {
  if (!PermissionSchema.safeParse(permission).success || roles.length === 0 || roles.some(r => !RoleSchema.safeParse(r).success)) return false;
  return roles.some(role => ROLE_PERMISSIONS[role as Role].includes(permission as Permission));
}
export function requiresAdminMfa(roles: readonly string[]): boolean { return roles.some(role => ADMIN_ROLES.includes(role as Role)); }
export const RoleListSchema = z.array(RoleSchema).min(1).max(8).refine(v => new Set(v).size === v.length, 'Duplicate roles');
