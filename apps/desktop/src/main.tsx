import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./App";
import "./styles/app.css";

const windowLabel = "__TAURI_INTERNALS__" in window ? getCurrentWindow().label : "main";
document.body.dataset.window = windowLabel;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App windowLabel={windowLabel} />
  </StrictMode>
);
