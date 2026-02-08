import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { createTheme, ThemeProvider, lighten } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import App from "./App";
import "./index.css";

import { ColorModeContext, readStoredThemePreference, writeStoredThemePreference } from './theme/colorMode.js';

import '@fontsource/nunito/400.css';
import '@fontsource/nunito/300.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';

function buildTheme({ mode }) {
  const darkBg = '#131a2a';

  return createTheme({
    breakpoints: {
      values: {
        xs: 0,
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280,
      },
    },
    typography: {
      fontFamily: [
        'Nunito',
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI',
        'Roboto',
        'Arial',
        'sans-serif',
      ].join(','),
    },
    palette: {
      mode,
      ...(mode === 'dark'
        ? {
            background: {
              default: darkBg,
              paper: lighten(darkBg, 0.04),
            },
            divider: 'rgba(255,255,255,0.10)',
          }
        : null),
    },

    // Global UI behavior: center all popup dialogs.
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          container: {
            // Works for both scroll="paper" and scroll="body".
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          },
        },
      },
    },
  });
}

// eslint-disable-next-line react-refresh/only-export-components
function ThemeRoot() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [themePreference, setThemePreference] = useState(() => readStoredThemePreference());

  useEffect(() => {
    writeStoredThemePreference(themePreference);
  }, [themePreference]);

  const mode = themePreference === 'system' ? (prefersDark ? 'dark' : 'light') : themePreference;

  const theme = useMemo(() => buildTheme({ mode }), [mode]);

  const colorModeValue = useMemo(
    () => ({
      themePreference,
      mode,
      setThemePreference,
      toggleDarkMode: () => {
        const next = mode === 'dark' ? 'light' : 'dark';
        setThemePreference(next);
      },
    }),
    [mode, themePreference]
  );

  return (
    <ColorModeContext.Provider value={colorModeValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeRoot />
  </React.StrictMode>
);

