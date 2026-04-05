interface WinePhotoProps {
  src: string;
  alt?: string;
  className?: string;
}

/**
 * Smart wine photo display:
 * - Wide photos: center-cropped (blurred sides fill the gaps)
 * - Narrow photos: centered with blurred version as background fill
 * - Perfect fit: no blur visible
 */
export function WinePhoto({ src, alt = '', className = '' }: WinePhotoProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Blurred background fill */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60"
      />
      {/* Sharp centered image */}
      <img
        src={src}
        alt={alt}
        className="relative w-full h-full object-contain"
      />
    </div>
  );
}
