import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Placeholder } from "@/pages/Placeholder";

// Route-level code splitting: charting code only loads with the pages that use it.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Dashboard = named(() => import("@/pages/Dashboard"), "Dashboard");
const CreateBusiness = named(() => import("@/pages/CreateBusiness"), "CreateBusiness");
const BusinessWorkspace = named(() => import("@/pages/BusinessWorkspace"), "BusinessWorkspace");
const ReportPage = named(() => import("@/pages/ReportPage"), "ReportPage");
const ResearchIndex = named(() => import("@/pages/ResearchIndex"), "ResearchIndex");
const ResearchHistory = named(() => import("@/pages/ResearchHistory"), "ResearchHistory");

// /businesses/:id has no page of its own: send it to that business's workspace.
const ToWorkspace = () => <Navigate to={`/businesses/${encodeURIComponent(useParams().businessId)}/research`} replace />;

const Loading = () => <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />;
const page = (el) => <Suspense fallback={<Loading />}>{el}</Suspense>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={page(<Dashboard />)} />
          <Route path="businesses" element={<Navigate to="/research" replace />} />
          <Route path="businesses/new" element={page(<CreateBusiness />)} />
          <Route path="businesses/:businessId" element={<ToWorkspace />} />
          <Route path="businesses/:businessId/research" element={page(<BusinessWorkspace />)} />
          <Route path="research" element={page(<ResearchIndex />)} />
          <Route path="research/:reportId" element={page(<ReportPage />)} />
          <Route path="history" element={page(<ResearchHistory />)} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
