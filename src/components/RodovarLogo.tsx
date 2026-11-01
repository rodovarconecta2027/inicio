import React from 'react';

interface RodovarLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'dark' | 'light';
  showConecta?: boolean;
  onClick?: () => void;
}

/**
 * Official RODOVAR Logo with custom vector geometry:
 * - Slanted bold geometric "RODOVAR"
 * - Both "O" letters in "RODO" cut diagonally through the middle (matching RODOVAR-LOGO_310056c8.png)
 * - Stylized chevron "A" in "VAR"
 * - Optional "C O N E C T A" institutional subtitle
 */
export const RodovarLogo: React.FC<RodovarLogoProps> = ({
  size = 'lg',
  variant = 'dark',
  showConecta = true,
  onClick,
}) => {
  const uid = React.useId().replace(/:/g, '');

  const dimensions = {
    sm: { width: 132, height: 28, conectaText: 'text-[7.5px] tracking-[0.52em] mt-0.5' },
    md: { width: 176, height: 36, conectaText: 'text-[9.5px] tracking-[0.56em] mt-1' },
    lg: { width: 224, height: 46, conectaText: 'text-[11.5px] tracking-[0.62em] mt-1' },
    xl: { width: 276, height: 56, conectaText: 'text-[13px] tracking-[0.65em] mt-1.5' },
  }[size];

  const varFill = variant === 'dark' ? '#FFFFFF' : '#080B0D';
  const conectaColor = variant === 'dark' ? 'text-white/95' : 'text-[#080B0D]';

  // Renders an "O" letter with a diagonal cut right through the center (bottom-left to top-right)
  const renderSlashedO = (cx: number, cy: number, maskId: string) => (
    <g key={maskId}>
      <defs>
        <mask id={maskId}>
          <rect x={cx - 40} y={cy - 40} width="80" height="80" fill="white" />
          {/* Diagonal slash cutting the O in half from bottom-left to top-right */}
          <rect
            x={cx - 34}
            y={cy - 4.2}
            width="68"
            height="8.4"
            fill="black"
            transform={`rotate(-44 ${cx} ${cy})`}
          />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`} transform={`skewX(-11)`}>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={`
            M ${cx} ${cy - 22}
            C ${cx + 13.5} ${cy - 22}, ${cx + 21.5} ${cy - 13}, ${cx + 21.5} ${cy}
            C ${cx + 21.5} ${cy + 13}, ${cx + 13.5} ${cy + 22}, ${cx} ${cy + 22}
            C ${cx - 13.5} ${cy + 22}, ${cx - 21.5} ${cy + 13}, ${cx - 21.5} ${cy}
            C ${cx - 21.5} ${cy - 13}, ${cx - 13.5} ${cy - 22}, ${cx} ${cy - 22}
            Z
            M ${cx} ${cy - 11.2}
            C ${cx - 6.2} ${cy - 11.2}, ${cx - 9.8} ${cy - 6.6}, ${cx - 9.8} ${cy}
            C ${cx - 9.8} ${cy + 6.6}, ${cx - 6.2} ${cy + 11.2}, ${cx} ${cy + 11.2}
            C ${cx + 6.2} ${cy + 11.2}, ${cx + 9.8} ${cy + 6.6}, ${cx + 9.8} ${cy}
            C ${cx + 9.8} ${cy - 6.6}, ${cx + 6.2} ${cy - 11.2}, ${cx} ${cy - 11.2}
            Z
          `}
          fill="#F5B800"
        />
      </g>
    </g>
  );

  return (
    <div
      onClick={onClick}
      className={`inline-flex flex-col items-start select-none ${onClick ? 'cursor-pointer' : ''}`}
    >
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 356 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
        aria-label="RODOVAR"
      >
        {/* R (Yellow) */}
        <g transform="skewX(-11)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M14 6H36.5C45.5 6 51 11 51 19C51 25.2 47.4 29.8 41.2 31.4L50.5 49H37.8L29.8 32.8H25.5V49H14V6ZM25.5 15.2V24.2H34.8C38.2 24.2 39.8 22.4 39.8 19.6C39.8 16.8 38.2 15.2 34.8 15.2H25.5Z"
            fill="#F5B800"
          />
        </g>

        {/* First O — Diagonally Slashed in Half */}
        {renderSlashedO(79, 27.5, `slash-o1-${uid}`)}

        {/* D (Yellow) */}
        <g transform="skewX(-11)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M108 6H128.5C142.5 6 151.5 14.5 151.5 27.5C151.5 40.5 142.5 49 128.5 49H108V6ZM119.5 16V39H127.5C135.2 39 139.8 34.6 139.8 27.5C139.8 20.4 135.2 16 127.5 16H119.5Z"
            fill="#F5B800"
          />
        </g>

        {/* Second O — Diagonally Slashed in Half */}
        {renderSlashedO(180, 27.5, `slash-o2-${uid}`)}

        {/* V (White on dark / Black on light) */}
        <g transform="skewX(-11)">
          <path
            d="M206 6H218.5L227.5 35.2L239.5 6H252L232.5 49H220.5L206 6Z"
            fill={varFill}
          />
        </g>

        {/* A — Stylized Chevron without crossbar (matching RODOVAR official logo) */}
        <g transform="skewX(-11)">
          <path
            d="M268.5 6H281L296.5 49H284L274.2 19.5L262.5 49H250L268.5 6Z"
            fill={varFill}
          />
        </g>

        {/* R (White on dark / Black on light) */}
        <g transform="skewX(-11)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M303 6H325.5C334.5 6 340 11 340 19C340 25.2 336.4 29.8 330.2 31.4L339.5 49H326.8L318.8 32.8H314.5V49H303V6ZM314.5 15.2V24.2H323.8C327.2 24.2 328.8 22.4 328.8 19.6C328.8 16.8 327.2 15.2 323.8 15.2H314.5Z"
            fill={varFill}
          />
        </g>
      </svg>

      {showConecta && (
        <div
          className={`w-full flex justify-between font-bold uppercase ${dimensions.conectaText} ${conectaColor} pl-0.5 pr-1`}
        >
          <span>C</span>
          <span>O</span>
          <span>N</span>
          <span>E</span>
          <span>C</span>
          <span>T</span>
          <span>A</span>
        </div>
      )}
    </div>
  );
};
