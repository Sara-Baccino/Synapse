import { createBrowserRouter, Navigate } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { DatasetGuard } from "./components/workspace/DatasetGuard";
import { RunGuard } from "./components/workspace/RunGuard";

import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ModuleInfoPage } from "./pages/ModuleInfoPage";
import { DemoPage } from "./pages/demo/DemoPage";
import { DatasetPage } from "./pages/workspace/DatasetPage";
import { ModuleSelectionPage } from "./pages/workspace/ModuleSelectionPage";
import { ModuleWorkspaceLayout } from "./pages/workspace/module/ModuleWorkspaceLayout";
import { ConfigSection } from "./pages/workspace/module/ConfigSection";
import { PipelineSection } from "./pages/workspace/module/PipelineSection";
import { ResultsSection } from "./pages/workspace/module/ResultsSection";
import { ExportSection } from "./pages/workspace/module/ExportSection";

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/modules/:moduleId", element: <ModuleInfoPage /> },
  { path: "/demo", element: <DemoPage /> },

  { path: "/workspace", element: <Navigate to="/workspace/dataset" replace /> },
  {
    path: "/workspace/dataset",
    element: (
      <ProtectedRoute>
        <DatasetPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/workspace/modules",
    element: (
      <ProtectedRoute>
        <ModuleSelectionPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/workspace/modules/:moduleId",
    element: (
      <ProtectedRoute>
        <ModuleWorkspaceLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: "config", element: <DatasetGuard><ConfigSection /></DatasetGuard> },
      { path: "pipeline", element: <DatasetGuard><PipelineSection /></DatasetGuard> },
      { path: "results", element: <DatasetGuard><RunGuard><ResultsSection /></RunGuard></DatasetGuard> },
      { path: "export", element: <DatasetGuard><RunGuard><ExportSection /></RunGuard></DatasetGuard> },
    ],
  },
]);