import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource-variable/archivo/wdth.css"; // served by the app itself: no request to Google Fonts
import "./styles.css";

// For whoever opens the console
console.log(
  "%cPlan precedents%c  team 6 · IAAC 2026\n\nThe page is React, the API is one Worker (03_app/worker/index.ts) and the model runs on Render:\nhttps://hackathon-team6-cubicasa.onrender.com\n\nWho made it: /humans.txt",
  "font: 650 14px Archivo, sans-serif; color: #c93b1b",
  "font: 12px Archivo, sans-serif; color: #46505c",
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
