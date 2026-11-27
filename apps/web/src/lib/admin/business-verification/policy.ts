import { z } from 'zod';
import { AdminClaimSchema, ClaimDecisionRequestSchema, type AdminListingLookup } from '@ryadom/accounts-types';

export type AdminClaim = z.infer<typeof AdminClaimSchema>;
export type ClaimDecision = z.infer<typeof ClaimDecisionRequestSchema>;
export const claimStatuses = { pending: 'Ожидает проверки', verified: 'Права подтверждены', rejected: 'Отклонена', withdrawn: 'Отозвана', revoked: 'Права отозваны' };
export const verificationMethods = {
  independent_registry: 'Независимый реестр',
  existing_verified_contact: 'Ранее подтверждённый независимый контакт',
  in_person: 'Очная проверка',
  insufficient_evidence: 'Недостаточно доказательств',
};

// Convenience only: live permissions, evidence and transitions are enforced in DB/API.
export function claimDecisions(item: AdminClaim, actorId: string): ClaimDecision['decision'][] {
  if (item.applicantId === actorId || !actorId) return [];
  return item.claim.status === 'pending' ? ['verify', 'reject'] : item.claim.status === 'verified' ? ['revoke'] : [];
}

export function listingApprovalGaps(item: AdminListingLookup): string[] {
  const gaps: string[] = [];
  if (item.listing.placementState !== 'pending-review') gaps.push('Анкета ещё не находится на финальной проверке.');
  if (item.listing.ownershipState !== 'verified') gaps.push('Права владельца не подтверждены.');
  if (!item.currentQuote || !item.currentAgreement) gaps.push('Принятие текущих месячных условий не зарегистрировано.');
  if (item.listing.paymentState !== 'manually-confirmed') gaps.push('Фактическое поступление средств не подтверждено.');
  return gaps;
}
