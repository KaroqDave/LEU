import type { Program } from '../../contracts/bridge';

const colors = ['blue', 'purple', 'orange', 'slate', 'gray', 'green'] as const;

// Renderer-only placeholders until the inventory provider supports real app icons.
export function AppIcon({ program, large = false }: { program: Program; large?: boolean }) {
  const words = program.name.trim().split(/\s+/u);
  const initials =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => Array.from(word)[0] ?? '')
          .join('')
      : Array.from(words[0] ?? '')
          .slice(0, 2)
          .join('');
  let colorIndex = 0;
  for (const character of program.name) {
    colorIndex = (colorIndex * 31 + (character.codePointAt(0) ?? 0)) % colors.length;
  }
  return (
    <span aria-hidden="true" className={`app-icon ${colors[colorIndex]} ${large ? 'large' : ''}`}>
      {initials.toLocaleUpperCase() || '?'}
    </span>
  );
}
