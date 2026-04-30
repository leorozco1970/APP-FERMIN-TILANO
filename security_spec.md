# Security Specification for Firestore

## Data Invariants
1. **Reportes**: A report must be associated with a valid teacher, grade, area, and period. Identity integrity: `authorUid` must match the authenticated user.
2. **Matriculas**: Grade-level enrollment data. Must be non-negative numbers.
3. **Actas de Convivencia**: Relational data linking students to behavioral incidents.
4. **Proyectos**: Must have responsible instructors and valid dates.
5. **Config/Settings**: Critical app settings including master password and custom lists.

## The "Dirty Dozen" Payloads (Attack Vectors)

| ID | Collection | Attack Description | Payload Example | Expected Result |
|----|------------|--------------------|-----------------|-----------------|
| 1 | `reportes` | Identity Spoofing | `{ "authorUid": "someone_else", ... }` | PERMISSION_DENIED |
| 2 | `reportes` | Immutable Field Modification | `update({ "createdAt": "2020-01-01" })` | PERMISSION_DENIED |
| 3 | `reportes` | Resource Poisoning (Giant String) | `{ "docente": "A".repeat(1000000) }` | PERMISSION_DENIED |
| 4 | `reportes` | Shadow Update (Ghost Fields) | `{ "adminPrivilege": true, ... }` | PERMISSION_DENIED |
| 5 | `settings` | Self-Elevation | `match /settings/auth { update({ "appPassword": "NEW" }) }` | PERMISSION_DENIED (except Admin) |
| 6 | `matriculas` | Invalid Type Poisoning | `{ "totalEstudiantes": "not_a_number" }` | PERMISSION_DENIED |
| 7 | `reportes` | Unauthenticated Write | `create(...)` without auth | PERMISSION_DENIED |
| 8 | `reportes` | Unauthorized Delete | `delete(...)` as non-owner | PERMISSION_DENIED |
| 9 | `reportes` | Incomplete Data Creation | `{ "periodo": "I" }` (missing fields) | PERMISSION_DENIED |
| 10 | `config` | List Type Poisoning | `{ "docentes": "not_a_list" }` | PERMISSION_DENIED |
| 11 | `proyectos` | Future Timestamp Injection | `{ "createdAt": "2099-01-01" }` | PERMISSION_DENIED (enforce request.time) |
| 12 | `reportes` | Path ID Poisoning | `match /reportes/{reporteId}` where ID is 2KB junk | PERMISSION_DENIED (via isValidId helper) |

## Implementation Plan
- Use `rules_version = '2'`.
- Default deny all: `match /{document=**} { allow read, write: if false; }`.
- Helper functions for auth, ownership, and admin roles.
- `isValidId(id)` pattern to prevent ID poisoning.
- `isValid[Entity]` validation helpers for every write operation.
- Use `request.time` for all timestamp validations.
- Explicitly check `resource.data` in `list` operations.
- Enforce `affectedKeys().hasOnly()` for updates to prevent shadow updates.
