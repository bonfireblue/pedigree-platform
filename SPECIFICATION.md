# PedigreeRoots - Project Specification

## Overview

PedigreeRoots is a family tree management platform that allows users to create, visualize, and collaboratively build family pedigree charts. Users can invite family members to claim their nodes and contribute to the shared family history.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon Serverless)
- **ORM**: Prisma + Raw SQL via @neondatabase/serverless
- **Authentication**: NextAuth.js (Credentials + Google OAuth)
- **Styling**: Inline styles (no CSS framework)
- **File Storage**: Vercel Blob
- **Email**: Resend
- **Deployment**: Vercel

---

## Current Features (Completed)

### 1. Authentication System

#### Sign In (`/sign-in`)
- Email/password login
- **Phone number login** - Users can sign in with phone number instead of email
- Google OAuth integration
- Bilingual support (English/Vietnamese)

#### Sign Up (`/sign-up`)
- Email + password registration
- Phone number + password registration (alternative to email)
- Password validation (minimum 8 characters)
- Automatic redirect to pedigree page after registration

#### Password Reset Flow
- **Forgot Password** (`/forgot-password`) - Request reset link via email
- **Reset Password** (`/reset-password?token=xxx`) - Set new password with valid token
- Token expiration (1 hour)
- Rate limiting on reset requests

### 2. Family Tree Visualization (`/pedigree`)

#### Canvas Rendering
- Interactive pan and zoom canvas
- Node-based family tree visualization
- Color-coded nodes:
  - Blue border: Male
  - Pink border: Female
  - Green badge: Verified/Claimed
  - Lock icon: Private profile
- Photo display on nodes (circular crop)

#### Node Management
- Add parent (creates new parent node linked to selected person)
- Add child (creates new child node linked to selected person)
- Add spouse (creates spouse relationship between two people)
- Delete person (with confirmation)
- Recenter button (bottom-left corner) - Returns view to user's own node

#### Profile Editing (Sidebar)
- First name, Last name
- Gender (Male/Female/Other)
- Birth date, Death date
- Location (where they grew up)
- Occupation
- Interests/Hobbies
- Life story (textarea)
- What they're proud of (textarea)
- Photo upload (via Vercel Blob)
- Privacy toggle (public/private)

#### Edit Permissions
- **Unclaimed profiles**: Any family graph member can edit
- **Claimed profiles**: Only the profile owner can edit their own information
- Read-only view shown to non-owners with message: "Only the profile owner can edit this information"

### 3. Invitation System

#### Creating Invitations
- Invite via SMS (pre-filled text message with link)
- Invite via link copy (shareable URL)
- Phone number input with formatting
- Invitation tied to specific person node in the tree

#### Accepting Invitations (`/accept-invite`)
- View invitation details (who invited, which person node)
- **For new users**: Create account with email OR phone number
- **For existing users**: Claim the person node directly
- Full name input (parsed into first/last name)
- Bilingual support (English/Vietnamese)

#### Invitation Rules
- Invitations expire after 7 days
- One active invitation per person node
- Invitation auto-revoked if person already claimed
- Status tracking: PENDING, ACCEPTED, EXPIRED, REVOKED

#### Auto-Verification
- First 10 people invited by the graph creator are automatically verified
- Verified status shown with green badge on node

### 4. Vouch System
- Users can vouch for other family members
- Vouches contribute to trust/verification status
- Vouch count displayed on profiles

### 5. Internationalization (i18n)
- Full bilingual support: English and Vietnamese
- Language toggle component on all pages
- Stored in browser (persists across sessions)
- Translations in `/src/lib/translations.ts`

---

## Database Schema

### User
```
- id: UUID (primary key)
- email: String (unique, nullable for phone-only users)
- phone: String (unique, nullable for email-only users)
- passwordHash: String
- role: UserRole (USER, ADMIN)
- createdAt: DateTime
```

### Person
```
- id: UUID (primary key)
- firstName: String?
- lastName: String?
- fullName: String?
- gender: String?
- birthDate: DateTime?
- deathDate: DateTime?
- grewUpLocation: String?
- occupation: String?
- interests: String?
- story: String? (life story)
- proudOf: String?
- photoUrl: String?
- isPrivate: Boolean (default false)
- isVerified: Boolean (default false)
- claimedByUserId: String? (FK to User)
- createdById: String (FK to User)
- familyGraphId: String (FK to FamilyGraph)
- createdAt: DateTime
```

### FamilyGraph
```
- id: UUID (primary key)
- name: String
- createdById: String (FK to User)
- createdAt: DateTime
```

### Membership
```
- id: UUID (primary key)
- userId: String (FK to User)
- familyGraphId: String (FK to FamilyGraph)
- role: MembershipRole (OWNER, ADMIN, MEMBER)
- invitedByUserId: String?
- joinedAt: DateTime
```

### ParentChild (Relationship)
```
- id: UUID (primary key)
- parentId: String (FK to Person)
- childId: String (FK to Person)
- createdAt: DateTime
```

### Spouse (Relationship)
```
- id: UUID (primary key)
- personAId: String (FK to Person)
- personBId: String (FK to Person)
- createdAt: DateTime
```

### Invitation
```
- id: UUID (primary key)
- token: String (unique)
- targetPersonId: String (FK to Person)
- familyGraphId: String (FK to FamilyGraph)
- inviterUserId: String (FK to User)
- inviteePhone: String?
- status: InvitationStatus (PENDING, ACCEPTED, EXPIRED, REVOKED)
- expiresAt: DateTime
- createdAt: DateTime
```

### Vouch
```
- id: UUID (primary key)
- voucherId: String (FK to User)
- voucheePersonId: String (FK to Person)
- createdAt: DateTime
```

### PasswordResetToken
```
- id: UUID (primary key)
- token: String (unique)
- userId: String (FK to User)
- expiresAt: DateTime
- usedAt: DateTime?
- createdAt: DateTime
```

---

## API Routes

### Authentication
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/[...nextauth]` | NextAuth.js handler |
| POST | `/api/register` | Create new user account |
| POST | `/api/forgot-password` | Request password reset email |
| POST | `/api/reset-password` | Reset password with token |

### User
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/me` | Get current user info, membership, claimed person |

### People
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/people` | Create new person |
| GET | `/api/people/[id]` | Get person by ID |
| PATCH | `/api/people/[id]` | Update person |
| DELETE | `/api/people/[id]` | Delete person |
| GET | `/api/people/search` | Search people by name |
| GET | `/api/person-detail/[id]` | Get detailed person info |
| GET | `/api/profile/[id]` | Get person profile |
| POST | `/api/save-profile` | Save profile changes |

### Relationships
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/relationships/parent-child` | Create parent-child relationship |
| DELETE | `/api/relationships/parent-child` | Remove parent-child relationship |
| POST | `/api/relationships/spouse` | Create spouse relationship |
| DELETE | `/api/relationships/spouse` | Remove spouse relationship |

### Tree
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/tree?rootId=xxx` | Get family tree data for rendering |

### Invitations
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/invitations` | Create new invitation |
| POST | `/api/invitations/accept` | Accept invitation (existing user) |
| POST | `/api/invitations/accept-and-register` | Accept invitation + create account |

### Other
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/vouch` | Vouch for a person |
| POST | `/api/upload` | Upload file to Vercel Blob |

---

## Key Business Logic

### Authentication Flow
1. User signs in with email/phone + password OR Google OAuth
2. Session contains user ID (set in JWT callback)
3. All API routes use `session.user.id` to identify user (supports phone-only users)

### Phone Number Login
1. User enters phone number in sign-in form
2. System detects if input is phone (10-15 digits) or email
3. Looks up user by phone OR email accordingly
4. Phone stored with `+` prefix and digits only (e.g., `+15551234567`)

### Invitation Flow
1. Graph member creates invitation for unclaimed person node
2. SMS opened with pre-filled message containing invite link
3. Recipient clicks link, lands on `/accept-invite?token=xxx`
4. If new user: Creates account with phone (recommended) or email
5. If existing user: Claims the person node directly
6. Membership created, person node linked to user

### Profile Edit Permissions
1. Check if person is claimed (`claimedByUserId` not null)
2. If unclaimed: Any graph member can edit
3. If claimed: Only `claimedByUserId === currentUserId` can edit
4. API returns 403 if non-owner tries to edit claimed profile

### Auto-Verification Logic
1. When invitation is accepted, check if inviter is graph creator
2. Count existing verified members (excluding creator's node)
3. If count < 10 AND invited by creator, set `isVerified = true`

---

## File Structure

```
/src
  /app
    /api                    # API routes
    /accept-invite          # Invitation acceptance page
    /forgot-password        # Password reset request
    /pedigree               # Main family tree page
    /reset-password         # Password reset form
    /sign-in                # Login page
    /sign-up                # Registration page
    layout.tsx              # Root layout
    page.tsx                # Landing page
  /components
    PedigreeCanvas.tsx      # Canvas rendering component
    NodeCard.tsx            # Individual node component
    TreeView.tsx            # Tree visualization
  /lib
    auth.ts                 # NextAuth configuration
    authz.ts                # Authorization helpers (requireMe)
    db.ts                   # Prisma client
    neon-db.ts              # Neon SQL helpers
    email.ts                # Resend email helpers
    translations.ts         # i18n translations
    invitationRules.ts      # Invitation business logic
    relationshipRules.ts    # Relationship validation
    personRules.ts          # Person validation
    pedigreeLayout.ts       # Tree layout algorithm
/prisma
  schema.prisma             # Database schema
/public
  /images                   # Static images
/scripts                    # Database migration scripts
```

---

## Future Features (TODO)

### High Priority
1. **Email invitations** - Send invitation via email in addition to SMS
2. **Search within tree** - Find people by name in large family trees
3. **Family graph sharing** - Share read-only view with non-members
4. **Mobile-optimized view** - Better mobile experience for tree navigation

### Medium Priority
5. **Import GEDCOM** - Import family tree from standard genealogy format
6. **Export to PDF** - Generate printable family tree chart
7. **Timeline view** - Chronological view of family events
8. **Photo gallery** - Multiple photos per person
9. **Documents attachment** - Attach birth certificates, etc.
10. **Notifications** - Email/SMS when someone joins or edits

### Low Priority
11. **DNA integration** - Link to ancestry DNA services
12. **Historical records search** - Integration with genealogy databases
13. **Family stories** - Collaborative storytelling feature
14. **Video messages** - Record video greetings for family members
15. **Family events calendar** - Birthdays, anniversaries, reunions

---

## Environment Variables Required

```
# Database
DATABASE_URL=postgresql://...

# Authentication
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://your-domain.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# File Storage
BLOB_READ_WRITE_TOKEN=...

# Email
RESEND_API_KEY=...

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## Development Setup

1. Clone repository
2. Install dependencies: `pnpm install`
3. Set up environment variables in `.env.local`
4. Run database migrations: `pnpm prisma migrate dev`
5. Seed database (optional): `pnpm prisma db seed`
6. Start dev server: `pnpm dev`

---

## Deployment

1. Connect repository to Vercel
2. Add Neon database integration
3. Add Vercel Blob storage integration
4. Set environment variables
5. Deploy

---

## Notes for Developers

1. **Session user ID**: Always use `(session?.user as { id?: string })?.id` to get user ID - this supports phone-only users who don't have email in session.

2. **Phone vs Email**: Users can have email only, phone only, or both. Always check for both when looking up users.

3. **Family Graph Membership**: Check membership before allowing edits. Members can edit relationships within their graph even if they didn't create the nodes.

4. **Claimed vs Unclaimed**: A person node can be claimed by exactly one user. Once claimed, only that user can edit the profile.

5. **Translations**: All user-facing text should use the `t` object from translations. Add new keys to both English and Vietnamese.

6. **Error Handling**: API routes throw custom errors (e.g., `InvitationError`, `RelationshipError`) with status codes. Frontend should handle these gracefully.
