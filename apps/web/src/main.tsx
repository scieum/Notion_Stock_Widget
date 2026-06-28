import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App.js";
import { DataProvider } from "./data/DataProvider.js";
import { Home } from "./pages/Home.js";
import { Editor } from "./pages/Editor.js";
import { Embed } from "./pages/Embed.js";
import { Connect } from "./pages/Connect.js";
import "./theme.css";

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/connect", element: <Connect /> },
      { path: "/edit/:id", element: <Editor /> },
    ],
  },
  { path: "/embed/:type", element: <Embed /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  </StrictMode>,
);
