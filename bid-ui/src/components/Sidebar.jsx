// src/components/Sidebar.jsx
import { List, ListItemButton, ListItemText, Divider } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../auth/auth';

function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const menu = [
        { label: 'Dashboard', path: '/app/dashboard' },
        { label: 'Upload Excel', path: '/app/upload' },
        { label: 'Upload History', path: '/app/history' },
        { label: 'Search Items', path: '/app/search' }
    ];

    return (
        <div
            style={{
                width: 220,
                height: '100vh',
                borderRight: '1px solid #ddd',
                paddingTop: 20,
                backgroundColor: '#f5f5f5'
            }}
        >
            <List>
                {menu.map(item => (
                    <ListItemButton
                        key={item.path}
                        selected={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                    >
                        <ListItemText primary={item.label} />
                    </ListItemButton>
                ))}
            </List>

            <Divider />

            <List>
                <ListItemButton
                    onClick={() => {
                        logout();
                        navigate('/login');
                    }}
                >
                    <ListItemText primary="Logout" />
                </ListItemButton>
            </List>
        </div>
    );
}

export default Sidebar;