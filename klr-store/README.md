# KLR | ROCKSTAR EDITOR

Arabic RTL storefront and Discord bot for KLR Rockstar Editor services.

## Quick start (Windows)
1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set a strong `SESSION_SECRET`, admin credentials, and optional Discord variables.
4. Run `npm start` to start the website and (when `DISCORD_TOKEN` is present) the Discord bot together.
5. Open `http://localhost:3000`.

For local separate processes, use `npm run start:web` and `npm run bot`.

## Deployment
See `DEPLOY_FREE_AR.md` for the free Railway setup, persistence requirements, limits, and backup warnings. This release must run as one service with one persistent volume because the website and bot share a local SQLite database and receipt directory.

## Safety
Payment is disabled by default. Never publish bank details or a phone number without the account holder's permission. An uploaded receipt is not proof of settled funds; an administrator must verify receipt of the actual transfer.
