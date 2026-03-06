import React from "react";
import ReactDOM from "react-dom/client";

import App from "./app/App";
import "./styles/tokens.css";
import "./styles/base.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element '#root' was not found.");
}

rootElement.classList.add("sequence-root");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
