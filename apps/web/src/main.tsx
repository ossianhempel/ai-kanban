import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/require-auth";
import { ProjectProvider } from "@/lib/project-context";
import { BoardPage } from "@/pages/board-page";
import { LoginPage } from "@/pages/login-page";
import { RepositoriesPage } from "@/pages/repositories-page";
import { SettingsPage } from "@/pages/settings-page";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ProjectProvider>
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route
          path="/repositories"
          element={
            <RequireAuth>
              <RepositoriesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<LoginPage />} />
      </Routes>
      </ProjectProvider>
    </BrowserRouter>
  </StrictMode>,
);
