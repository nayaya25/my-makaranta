/**
 * myMakaranta logomark — a minimal open book (learning; "Makaranta" = "school" in Hausa).
 * Two pages in forest tones with a cream spine. Inherits size from className.
 */
export function Logomark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path
        d="M16 9.2C11.2 6.4 7 6.4 3.6 8.2V23.2C7 21.4 11.2 21.4 16 24.2V9.2Z"
        fill="#465F5C"
      />
      <path
        d="M16 9.2C20.8 6.4 25 6.4 28.4 8.2V23.2C25 21.4 20.8 21.4 16 24.2V9.2Z"
        fill="#5E7B77"
      />
      <path d="M16 9.2V24.2" stroke="#F0ECE6" strokeWidth="0.85" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
