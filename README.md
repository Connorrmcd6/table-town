# Table Town

A browser-based, PS2-era open-world caper set in a parody of Cape Town. Built with three.js and Vite, everything procedural, no asset files.

## Run

- `npm install` - install deps
- `npm run dev` - start the dev server
- `npm run build` - production build to `dist/` (deploy as static files, e.g. Vercel)

## Controls

- `W A S D` / arrows - drive or run, `Space` - handbrake in a car, jump on foot
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

The Golf and Sixty60 meshes are simplified with `npx gltf-transform weld`, `simplify`, `resize --width 512 --height 512` and `prune`.
