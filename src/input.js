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

export function readDriving() {
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  return {
    throttle: keys.has('KeyW') || keys.has('ArrowUp'),
    brake: keys.has('KeyS') || keys.has('ArrowDown'),
    steer: (left ? 1 : 0) - (right ? 1 : 0),
    handbrake: keys.has('Space'),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
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
