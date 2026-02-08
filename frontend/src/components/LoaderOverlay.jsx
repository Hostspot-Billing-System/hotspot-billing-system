import { Backdrop, Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useMemo } from 'react';

function buildSixSegmentGradient() {
  // 6 segments, each 60deg. We reserve a small gap per segment.
  const segmentDeg = 52;

  const stops = [];
  for (let i = 0; i < 6; i += 1) {
    const start = i * 60;
    const end = start + segmentDeg;
    const gapEnd = start + 60;
    const colorVar = i % 2 === 0 ? 'var(--loader-main)' : 'var(--loader-lite)';
    stops.push(`${colorVar} ${start}deg ${end}deg`, `transparent ${end}deg ${gapEnd}deg`);
  }

  return `conic-gradient(from -90deg, ${stops.join(', ')})`;
}

export default function LoaderOverlay({ open }) {
  const theme = useTheme();

  const gradient = useMemo(() => buildSixSegmentGradient(), []);

  const loaderMain = theme.palette.success.main;
  const loaderLite = alpha(theme.palette.success.main, 0.35);
  const innerRingBg = theme.palette.background.paper;
  const centerFill = alpha(theme.palette.success.main, 0.45);

  return (
    <Backdrop
      open={Boolean(open)}
      sx={{
        zIndex: (t) => t.zIndex.modal + 1000,
        backgroundColor: alpha(theme.palette.common.black, 0.15),
      }}
    >
      <Box
        aria-label="Loading"
        role="status"
        sx={{
          '--loader-main': loaderMain,
          '--loader-lite': loaderLite,
          width: { xs: 220, sm: 260 },
          height: { xs: 220, sm: 260 },
          borderRadius: '50%',
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          '@keyframes loaderSpin': {
            from: { transform: 'rotate(0deg)' },
            to: { transform: 'rotate(360deg)' },
          },
        }}
      >
        {/* Spinning segmented ring */}
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            backgroundImage: gradient,
            animation: 'loaderSpin 1.05s linear infinite',
            willChange: 'transform',
          }}
        />

        {/* Inner white ring */}
        <Box
          sx={{
            position: 'absolute',
            inset: '18%',
            borderRadius: '50%',
            backgroundColor: innerRingBg,
          }}
        />

        {/* Center fill */}
        <Box
          sx={{
            position: 'absolute',
            inset: '30%',
            borderRadius: '50%',
            backgroundColor: centerFill,
          }}
        />
      </Box>
    </Backdrop>
  );
}
