import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/index.css";

const root = document.getElementById("root");
if (root) {
  // Trang thử thành phần /__gallery chỉ có ở dev server: ở bản build import.meta.env.DEV là false nên Vite bỏ cả nhánh này
  // và tệp src/dev/Gallery.tsx (src/dev/gallery-build.test.ts kiểm dist/ không chứa nó).
  if (import.meta.env.DEV && window.location.pathname === "/__gallery") {
    void import("./dev/Gallery").then(({ Gallery }) =>
      createRoot(root).render(
        <StrictMode>
          <Gallery />
        </StrictMode>,
      ),
    );
  } else {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}
