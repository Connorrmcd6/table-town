export const CHEATS = [
  { code: 'LOADSHEDDING', label: 'Stage 6 loadshedding' },
  { code: 'SOUTHEASTER', label: 'Cape Doctor is blowing' },
  { code: 'NOWNOW', label: 'Slow motion' },
  { code: 'JUSTNOW', label: 'Traffic frozen' },
  { code: 'SIXTYMINUTES', label: 'Turbo taxi' },
  { code: 'SUNDOWNER', label: 'Time skip' },
  { code: 'LEKKER', label: 'R250 000 in the cubbyhole' },
  { code: 'BRIBE', label: 'Cooldrink for the officer. Wanted level cleared' },
  { code: 'VETKOEK', label: 'Full health' },
  { code: 'TROUBLE', label: 'The cops want a word' },
  { code: 'TSOTSI', label: 'Ammo for every gun, plus more C4' },
];

export function findCheat(text) {
  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CHEATS.find((c) => c.code === code) || null;
}

export function createCheatPrompt({ onCheat, onMiss, onToggle }) {
  const box = document.getElementById('cheatbox');
  const input = document.getElementById('cheatinput');
  let open = false;

  const setOpen = (v) => {
    open = v;
    box.classList.toggle('show', v);
    onToggle(v);
    if (v) {
      input.value = '';
      input.focus();
    } else input.blur();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === '`') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Enter') {
      const cheat = findCheat(input.value);
      setOpen(false);
      if (cheat) onCheat(cheat);
      else if (input.value.trim()) onMiss(input.value.trim());
    }
  });
  input.addEventListener('blur', () => open && setOpen(false));

  return {
    get open() {
      return open;
    },
    toggle: () => setOpen(!open),
  };
}
