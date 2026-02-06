import { Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

function LoaderGlyph({ delayMs = 0 }) {
  const theme = useTheme();
  const stroke = alpha(theme.palette.common.white, 0.75);
  const dot = theme.palette.common.white;

  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 56,
        height: 56,
        '@keyframes loaderPulse': {
          '0%, 100%': { transform: 'scale(0.92)', opacity: 0.7 },
          '50%': { transform: 'scale(1)', opacity: 1 },
        },
        animation: 'loaderPulse 900ms ease-in-out infinite',
        animationDelay: `${delayMs}ms`,
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 44 44"
        sx={{ width: '100%', height: '100%', display: 'block' }}
      >
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={stroke}
          strokeWidth="3"
        />
        <circle cx="22" cy="22" r="4" fill={dot} />
      </Box>
    </Box>
  );
}

export default function FullPageLoader() {
  const theme = useTheme();

  return (
    <Box
      role="status"
      aria-label="Loading"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        backgroundColor: theme.palette.primary.main,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.25 }}>
        <LoaderGlyph delayMs={0} />
        <LoaderGlyph delayMs={150} />
        <LoaderGlyph delayMs={300} />
      </Box>
    </Box>
  );
}
