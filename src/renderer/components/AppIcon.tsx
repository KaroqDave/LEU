import type { Program } from '../../contracts/bridge';
import { useProgramIcon } from '../program-icons';

const colors = ['blue', 'purple', 'orange', 'slate', 'gray', 'green'] as const;

// Shows the registered icon once loaded; programs without one keep a placeholder from their name.
export function AppIcon({ program, large = false }: { program: Program; large?: boolean }) {
  const { ref, icon } = useProgramIcon(program.id);
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
    <span
      ref={ref}
      aria-hidden="true"
      className={`app-icon ${icon ? 'has-image' : colors[colorIndex]} ${large ? 'large' : ''}`}
    >
      {icon ? <img src={icon} alt="" draggable={false} /> : initials.toLocaleUpperCase() || '?'}
    </span>
  );
}
