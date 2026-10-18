import paths from '../../assets/branding/ui-icons.json';
import brandIcon from '../../assets/branding/leu-icon.svg';

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function Logo({ size = 42 }: { size?: number }) {
  return <img aria-hidden="true" src={brandIcon} alt="" width={size} height={size} />;
}
