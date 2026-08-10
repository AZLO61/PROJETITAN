import React from "react";
import { createRoot } from "react-dom/client";
import BoardGenerator from "./BoardGenerator.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <BoardGenerator />
  </ErrorBoundary>
);
