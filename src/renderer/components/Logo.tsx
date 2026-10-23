import brandIcon from '../../../assets/branding/leu-icon.svg';

export function Logo({ size = 42 }: { size?: number }) {
  return <img aria-hidden="true" src={brandIcon} alt="" width={size} height={size} />;
}
