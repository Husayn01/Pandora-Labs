/**
 * PandoraLogo Component
 * ──────────────────────────
 * Renders the actual Pandora Labs "P" logo from the brand asset.
 */

interface PlaceholderLogoProps {
  className?: string;
  size?: number;
}

export function PlaceholderLogo({ className = '', size = 32 }: PlaceholderLogoProps) {
  return (
    <img
      src="/pandora-logo.png"
      alt="Pandora Labs"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
      draggable={false}
    />
  );
}
