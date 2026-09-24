import type { SVGProps } from 'react';

/** Inline SVG icon set — no external asset or icon dependency. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function SelectIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l7 16 2-6 6-2z" />
    </Svg>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2v20M2 12h20" />
      <path d="M7 7l-5 5 5 5M17 7l5 5-5 5" />
    </Svg>
  );
}

export function RotateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function ScaleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 21L21 3" />
      <path d="M9 3h12v12" />
    </Svg>
  );
}

export function PivotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a17.8 17.8 0 0 1-3.2 3.9M6.6 6.6A17.6 17.6 0 0 0 2 12s4 7 10 7a10.6 10.6 0 0 0 4.4-.9" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function UnlockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.7-1.4" />
    </Svg>
  );
}

export function ChevronIcon(props: IconProps & { open?: boolean }) {
  const { open, ...rest } = props;
  return (
    <Svg {...rest}>
      {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
    </Svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5-11 11" />
    </Svg>
  );
}

export function AudioIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Svg>
  );
}

export function FontIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20L10 4h4l6 16" />
      <path d="M7 13h10" />
    </Svg>
  );
}

export function JsonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 4a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2" />
      <path d="M16 4a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2" />
    </Svg>
  );
}

export function SceneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18" />
    </Svg>
  );
}

export function PrefabIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2l9 5-9 5-9-5z" />
      <path d="M3 12l9 5 9-5M3 17l9 5 9-5" />
    </Svg>
  );
}
