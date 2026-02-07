// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute';
import Login from './auth/Login';

import Dashboard from './pages/Dashboard';
import UploadExcel from './pages/UploadExcel';
import UploadHistory from './pages/UploadHistory';
import SearchItems from './pages/SearchItems';
import ProjectDetails from './pages/ProjectDetails';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="upload" />} />
        <Route path="dashboard" element={<div>Welcome</div>} />
        <Route path="upload" element={<UploadExcel />} />
        <Route path="history" element={<UploadHistory />} />
        <Route path="search" element={<SearchItems />} />
        <Route path="projects/:projectId" element={<ProjectDetails />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;