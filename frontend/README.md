# BusBuddy Frontend

This is the Next.js frontend for the BusBuddy application. It is built using a mobile-first philosophy with modern React patterns, Tailwind CSS for styling, and is structurally ready for NextAuth and Longdo Map integration.

## Design
- **Theme**: ViaBus-inspired bright orange (`#F26F22`).
- **Layout**: Mobile-first centered on desktop.
- **Components**: Designed for rapid integration. Look in `components/ui/` for generics, `components/stops/` for domain-specific UI.

## Getting Started

### 1. Install Dependencies
Make sure you are in the `/frontend` directory, then run:

```bash
npm install
```

### 2. Configure Environment
Create a `.env.local` file in the `frontend` folder:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_LONGDOMAP_KEY=your_key_here
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Map Integration
The app currently uses a `MapView.tsx` mock placeholder. When you are ready to add the real Longdo map, update `components/map/MapView.tsx` and inject the script or use the `@longdo-map/react-longdo-map` package.

## Auth Integration
A mock `AuthContext.tsx` is provided in `lib/auth/AuthContext.tsx` emitting a guest user. To add real mapping:
1. Install `next-auth`.
2. Wrap `AuthContext.tsx` with `<SessionProvider>`.
3. Read the token inside `lib/api-client.ts`.
