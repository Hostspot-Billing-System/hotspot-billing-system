import React from "react";
import ReactDOM from "react-dom/client";
import { createTheme, ThemeProvider } from '@mui/material/styles';
import App from "./App";
import "./index.css";

import '@fontsource/nunito/400.css';
import '@fontsource/nunito/300.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';

const theme = createTheme({
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
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

