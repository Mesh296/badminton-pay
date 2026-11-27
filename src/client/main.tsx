import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted font (no third-party request); only the weights the UI uses.
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./styles.css";
import App from "./app.tsx";

// Turn on lens refraction where it works. An SVG filter inside backdrop-filter
// renders only in Chromium; Safari parses it and then draws nothing at all, so
// CSS feature queries cannot be trusted here. userAgentData exists only in Chromium.
const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
if (brands?.some((entry) => entry.brand === "Chromium")) document.documentElement.dataset.refract = "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
