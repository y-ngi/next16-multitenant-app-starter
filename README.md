# Next 16 Multitenant App Starter

Next.js 16 starter for building multi-tenant SaaS applications with the App
Router, Better Auth, Drizzle ORM, PostgreSQL, Tailwind CSS, and shadcn/ui.

## Development

The recommended environment is the included Dev Container. Open the project in
VS Code or Cursor and run **Dev Containers: Reopen in Container**.

```sh
pnpm install
pnpm dev
```

The application is available at http://localhost:3000. Mailpit is available at
http://localhost:8025 and PostgreSQL at localhost:5432.

## Database

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Copy `.env.example` to `.env.local` when running outside the Dev Container.
Never commit environment files containing secrets.

## Architecture

`src/db/schema.ts` contains independent admin and general user accounts,
organizers (tenants), memberships, and user favorites. Authentication is kept
in `src/lib/auth.ts`, while authorization decisions are centralized in
`src/lib/access.ts` so the business layer can later be moved behind an API.