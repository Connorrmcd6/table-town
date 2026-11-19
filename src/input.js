const keys = new Set();
const pressed = new Set();

const isTyping = (e) => e.target instanceof HTMLInputElement;

window.addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Backquote'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) return;
  const code = `Mouse${e.button}`;
  if (!keys.has(code)) pressed.add(code);
  keys.add(code);
});
window.addEventListener('mouseup', (e) => keys.delete(`Mouse${e.button}`));
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => {
  if (document.pointerLockElement) pressed.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
});

const mouse = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  mouse.x += e.movementX;
  mouse.y += e.movementY;
});

// Mouse movement since the last call (pointer-locked only).
export function takeMouse() {
  const out = { x: mouse.x, y: mouse.y };
  mouse.x = mouse.y = 0;
  return out;
}

export function isDown(code) {
  return keys.has(code);
}

export function readDriving() {
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  return {
    throttle: keys.has('KeyW') || keys.has('ArrowUp'),
    brake: keys.has('KeyS') || keys.has('ArrowDown'),
    steer: (left ? 1 : 0) - (right ? 1 : 0),
    handbrake: keys.has('Space'),
  };
}

export function wasPressed(code) {
  return pressed.has(code);
}

export function releaseAll() {
  keys.clear();
  pressed.clear();
}

export function endFrame() {
  pressed.clear();
}
