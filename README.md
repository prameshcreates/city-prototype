# City Prototype

A small open-world city you can explore on foot or by car, built in the browser with three.js and Rapier physics. The city, character and cars are all generated in code, with no downloaded models. You can drive any of the parked cars, crash them into buildings and knock over street props.

## Controls

| Input | On foot | Driving |
|---|---|---|
| W A S D | move | throttle / brake-reverse / steer |
| Shift | sprint | |
| Space | jump | handbrake |
| Mouse | look (click to lock the pointer, Esc to release; drag also works) | look around |
| E | enter a nearby car | exit the car |

## Build

```
npm install
npm run build
```

This bundles `src/` into a single self-contained `index.html`. `npm run verify` runs the headless checks. It needs a local Chrome.

## Play

Open `index.html` in a desktop browser.
