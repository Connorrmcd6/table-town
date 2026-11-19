# Table Town

A browser-based, PS2-era open-world caper set in a parody of Cape Town. Built with three.js and Vite, everything procedural, no asset files.

## Run

- `npm install` - install deps
- `npm run dev` - start the dev server
- `npm run build` - production build to `dist/` (deploy as static files, e.g. Vercel)

## Controls

- `W A S D` / arrows - drive or run, `Space` - handbrake in a car, jump on foot, or climb when facing a wall or car
- Click - punch or shoot, right-click - aim, `Q` / mouse wheel - switch between fists and pistol
- Heal by grabbing spinning vetkoek on the pavements (+25), resting (slowly back to 50%), or the red-cross marker at Groote Schuur (full health, R200)
- `F` - get in, jack a car, or bail out (works at speed, but it hurts)
- `H` hooter, `G` gaartjie, `C` camera, `R` unstick car, `M` mute
- Mouse - look around (click to capture, `Esc` to release)
- `` ` `` or `/` - open the cheat prompt

## Plan

See [docs/PLAN.md](docs/PLAN.md) for the design decisions, content ideas and phase roadmap.

## Credits

3D models from Sketchfab, in `public/models/`:

- [Toyota Hiace Passenger Van](https://sketchfab.com/3d-models/toyota-hiace-passenger-van-19f82e92a8e04400baaa185b52995356) by ROH3D
- [1976 Volkswagen Golf GTI Mk1](https://sketchfab.com/3d-models/1976-volkswagen-golf-gti-mk1-1fc46cb37bd748e3bb9355fcedaf3817) by Ddiaz Design - CC-BY-NC-SA-4.0
- [Checkers Sixty60 Bike](https://sketchfab.com/3d-models/checkers-sixty60-bike-4aabf2a85abd43f98fc4e5f2a5ae62f1) by Caitlin Pillay - CC-BY-4.0
- [2019 Ford Ranger Raptor](https://sketchfab.com/3d-models/2019-ford-ranger-raptor-civil-cities-skylines-c2d4113e6acd401cb1999f81bb318325) by TSB3DMODELS - CC-BY-4.0

- [DucatiV4R](https://sketchfab.com/3d-models/ducativ4r-3f1067a86c4c4c3bbfddf61ec0232446) by IrfanMuaz - CC-BY-4.0
- [Ford Focus British Police Car](https://sketchfab.com/3d-models/ford-focus-british-police-car-uk-9936a4c775f442549005a6cf83d1de21) by David_Holiday - CC-BY-4.0

Heavy models are simplified with `node scripts/optimize-model.mjs <in.glb> <out.glb> [ratio] [error]`, then `npx gltf-transform resize` for textures.
