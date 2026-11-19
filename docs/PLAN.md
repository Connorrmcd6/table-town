# Table Town - plan and phases

## Context

A browser-based, PS2-era open-world caper set in a parody of Cape Town: minibus taxis, delivery scooters, Lion's Head, Table Mountain, the cable car, Bo-Kaap and the rest of the Mother City. Inspired by the compactness of single-file browser games, it is built with three.js and Vite with everything generated in code: no model or texture files.

Audience is the author and friends, so it ships as a static site.

## Hosting and feasibility

- All rendering, physics, traffic and AI run in the player's browser; the host only serves static files.
- Single player deploys to Vercel's free tier (or GitHub Pages). `npm run build` outputs `dist/`.
- Multiplayer, if it ever happens, needs a WebSocket server Vercel can't host: a small Node server on a Raspberry Pi behind Cloudflare Tunnel or Tailscale, or PartyKit / Cloudflare Durable Objects.
- The real cost is content and the player's GPU, not servers. Current frame time is about 3-6 ms on an M1.

## Decisions

- Single player first; multiplayer is a later, optional phase.
- Working title "Table Town". No "GTA" in the name, logo, font or HUD; the genre and satire are fair game.
- Satire uses fictional parody characters, factions and brands only: no real politicians, parties or real gangsters.
- No real music. Sound effects and any radio are synthesized with Web Audio.
- The map is condensed (`WORLD_SCALE` in `src/world/heightmap.js`) so trips are short; vehicles and buildings stay real size.

## Visual target

PS2-era geometry with modern lighting: warm golden-hour sky, haze, flat colours and small canvas textures. Set-piece views:

- Table Mountain across the bay from Blouberg beach
- Camps Bay promenade with palms and the Twelve Apostles
- Kitesurfers at Blouberg with Lion's Head on the skyline
- City and harbour cranes from Lion's Head / Signal Hill
- Bo-Kaap coloured houses on cobbled streets with Signal Hill behind

## Content ideas

- **Factions:** Cape Flats gangs and numbers gangs, taxi associations in turf wars, bribe-hungry cops, tenderpreneurs, construction and nightclub mafia, the Stellenbosch wine-estate elite, foreign cartels, Uber scammers.
- **Characters:** protagonist Gershwin "Tandjies" Samuels with crew Kop, Miley and Waanie; a Russian arms dealer in a Camps Bay mansion; optional character switching between a Xhosa guy, a laanie and a coloured ou.
- **Humour:** car-jacked drivers swearing at you, Afrikaans/Kaaps one-liners, satire aimed at everyone, every advert criminal is a white guy in a balaclava.
- **Vehicles:** Quantum minibus taxi with gaartjie, Sixty-ish delivery scooter, Citi Golf, bakkie, SAPS bakkie, superbike, sports car, cable car, kitesurf board.
- **Radio (later, synthesized):** gqom/amapiano, Cape jazz, goema, talk-radio parody.

## Phases

### Phase 1 - vertical slice: done

- Procedural terrain: Table Mountain, Lion's Head (dome on a ridge to Signal Hill), Signal Hill, Devil's Peak, Kloof Nek saddle, sea and harbour.
- CBD grid with named streets, a compact Bo-Kaap, suburbs climbing the lower slopes, Disa Park towers, minaret, Noon Gun, cable car.
- Iconic roads: Kloof Street, Kloof Nek Road, Kloof Road, Tafelberg Road, Signal Hill Road, Helen Suzman Blvd.
- Drivable minibus taxi with arcade physics, brake lights, headlight.
- 90 AI cars on a road graph covering the city, suburbs and main roads, with junction reservations and traffic lights ("robots") they obey.
- Continuous day/night cycle with a moving sun, lit windows, streetlights and night light pools.
- HUD: money, clock, radar, district and street names. Cheats via a prompt (`` ` `` or `/`).

### Phase 2 - on foot and street life: done

- Player on foot: sprint, jump, wall-aware free camera with mouse look.
- Enter, exit and jack any vehicle; bail out at speed (it hurts).
- Pedestrians with jointed models, faces and varied clothing; they dodge and get knocked down.
- Wanted level (five stars) from crimes, SAPS pursuit through the street graph, sirens, busted and wasted respawns, health.
- New vehicles: Sixty-ish delivery scooter, superbikes (about 255-290 km/h) and sports cars, with bike lean and seated riders.

### Phase 3 - landmark set pieces: next

- Ride the cable car to the top of Table Mountain.
- Camps Bay and the Atlantic seaboard (Clifton, Sea Point promenade).
- Blouberg beach across the bay with the classic Table Mountain view and kitesurfers.
- V&A Waterfront with the Clock Tower and harbour.
- Signal Hill and Lion's Head lookouts.

### Phase 4 - missions, factions and cheats

- Mission system with taxi fares, deliveries and faction jobs.
- Parody factions and characters from the content ideas above.
- Expanded cheat list and secrets.
- Synthesized radio stations.

### Phase 5 - multiplayer (optional)

- Shared sessions for friends via a small WebSocket server (Raspberry Pi) or a managed service.

## Known rough edges

- AI traffic drives through cars you've left parked.
- AI cars can briefly overlap at junctions.
- Weapons (fists, bat, pistol, machine gun, C4) are all carried from the start; no pickups or shops yet.
- Bo-Kaap houses sit right on the pavement, so it has no low walls to vault; the suburbs, CBD and parks do.
- The hospital marker has no radar blip yet.
- Cops on foot don't climb, so a rooftop is a decent (if temporary) hiding spot.
- Some cop cars stall in Bo-Kaap's narrow streets; their officers then finish the chase on foot.
