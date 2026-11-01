/**
 * Firestore Security Rules Test Specification — Dirty Dozen Verification
 * Ensures all 12 adversarial payloads result in PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Reject Shadow Field Injection on Announcement',
    collectionPath: '/announcements/ann-1',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Reject Self-Privilege Escalation to DIRETORIA',
    collectionPath: '/users/user-1/public/main',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Reject Spoofed Read Confirmation for Another Employee',
    collectionPath: '/announcements/ann-1/reads/user-2',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Reject Orphaned Comment on Non-Existent Announcement',
    collectionPath: '/announcements/non-existent/comments/c-1',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Reject SLA Original Deadline Tampering',
    collectionPath: '/requests/req-1025',
    operation: 'update',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Reject Terminal Request Mutation once Concluída',
    collectionPath: '/requests/req-1019',
    operation: 'update',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Reject Unverified Admin Email Spoof',
    collectionPath: '/announcements/ann-2',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Reject Cross-User PII Read on /users/{userId}/private/info',
    collectionPath: '/users/user-2/private/info',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Reject ID Poisoning Attack (> 128 chars)',
    collectionPath: '/requests/invalid_id_exceeding_limit',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Reject Value Poisoning (Oversized Subject)',
    collectionPath: '/requests/req-9999',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Reject Forged Backdated Client Timestamp',
    collectionPath: '/requests/req-8888',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Reject Non-Admin Publishing Official Announcement',
    collectionPath: '/announcements/ann-unauth',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    name: 'Reject Unverified User Writing to Freight Financial Record',
    collectionPath: '/fretes_financeiro/frete-0842',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 14,
    name: 'Reject Shadow Field Injection on Freight Record',
    collectionPath: '/fretes_financeiro/frete-0842',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
  },
];

