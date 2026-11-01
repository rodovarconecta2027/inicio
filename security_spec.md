# Security Specification — RODOVAR CONECTA

## 1. Data Invariants
1. **Default-Deny Catch-All**: No collection or document is readable or writable unless explicitly matched and validated.
2. **PII Isolation**: User email addresses are stored exclusively in `/users/{userId}/private/{infoId}` and are accessible only to `isOwner(userId)` or `isAdmin()`. Public directory profiles live in `/users/{userId}/public/{profileId}`.
3. **RBAC Privilege Integrity**: Standard employees (`FUNCIONARIO`) cannot publish official `announcements`, `events`, `documents`, or `invites`, nor can they self-assign `ADMINISTRADOR` or `DIRETORIA` roles.
4. **Mandatory Read Confirmation Authenticity**: An employee can only create an `AnnouncementRead` document at `/announcements/{announcementId}/reads/{userId}` where `{userId} == request.auth.uid`, `incoming().userId == request.auth.uid`, and the parent `/announcements/{announcementId}` exists.
5. **Immutable Original 48-Hour SLA**: In `/requests/{requestId}`, `originalDueAtIso`, `protocol`, `requesterId`, and `createdAt` are strictly immutable once created (`incoming().originalDueAtIso == existing().originalDueAtIso`).
6. **Terminal State Locking**: Once a request in `/requests/{requestId}` reaches `Concluída` or `Cancelada`, non-admin users cannot mutate it further.
7. **Temporal Integrity**: Every `createdAt` or `updatedAt` timestamp must equal `request.time`.
8. **Freight Record Integrity & Immutability**: In `/fretes_financeiro/{freightId}`, the operational identifier `code` and `createdAtIso` are immutable (`incoming().code == existing().code && incoming().createdAtIso == existing().createdAtIso`), and only verified users can create or modify records with strict boundary and schema validation.

## 2. The Adversarial Payloads ("Dirty Dozen + 2")

1. **Shadow Field Injection on Announcement**:
   `{ "title": "TESTE", "isSuperVerified": true, ... }` -> Rejected by `hasOnly()`.
2. **Self-Privilege Escalation in Public Profile**:
   Non-admin user sets `accessLevel: "DIRETORIA"` on `/users/{uid}/public/profile` -> Rejected by `!isAdmin() => incoming().accessLevel == 'FUNCIONARIO'`.
3. **Spoofed Read Confirmation for Another User**:
   User A writes to `/announcements/ann-1/reads/user-B` -> Rejected by `userId == request.auth.uid && incoming().userId == request.auth.uid`.
4. **Orphaned Comment on Non-Existent Announcement**:
   Comment created at `/announcements/ghost-id/comments/c-1` -> Rejected by `exists(/databases/$(database)/documents/announcements/$(announcementId))`.
5. **SLA Original Deadline Tampering**:
   Update on `/requests/req-1` changing `originalDueAtIso` -> Rejected by immutability gate `incoming().originalDueAtIso == existing().originalDueAtIso`.
6. **Terminal Request Re-Opening by Employee**:
   Update on `/requests/req-1` when `existing().status == 'Concluída'` -> Rejected by terminal state lock.
7. **Unverified Admin Email Spoof**:
   Token has `email == 'indicabrasiloficiall@gmail.com'` but `email_verified == false` -> Rejected by `request.auth.token.email_verified == true`.
8. **Cross-User PII Scraping**:
   Authenticated User A attempts `get` on `/users/user-B/private/info` -> Rejected by `isOwner(userId) || isAdmin()`.
9. **ID Poisoning Attack (2KB Junk Document ID)**:
   Create document with 2048-char ID -> Rejected by `isValidId(id)` (`id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
10. **Value Poisoning (1MB String in Request Subject)**:
    Create request with `subject.size() > 200` -> Rejected by `isValidInternalRequest()` boundary check.
11. **Forged Backdated Timestamp**:
    Create announcement or request with `createdAt != request.time` -> Rejected by `incoming().createdAt == request.time`.
12. **Unauthorized Employee Publishing Official Announcement**:
    Standard employee attempts `create` on `/announcements/ann-99` -> Rejected by `isAdmin()`.
13. **Unverified User Writing Freight Financial Record**:
    Unverified user writes to `/fretes_financeiro/frete-1` -> Rejected by `isVerifiedUser()`.
14. **Shadow Field Injection on Freight Record**:
    Payload with unexpected key `{ ghostKey: true }` -> Rejected by `isValidFreightFinancialRecord` `keys().hasOnly()`.
