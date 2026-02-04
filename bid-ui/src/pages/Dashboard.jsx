// src/pages/Dashboard.jsx
import Sidebar from '../components/Sidebar';
import { Outlet } from 'react-router-dom';

function Dashboard() {
    return (
        <div style={{ display: 'flex' }}>
            <Sidebar />

            <div style={{ flex: 1, padding: 40 }}>
                <Outlet />
            </div>
        </div>
    );
}

export default Dashboard;