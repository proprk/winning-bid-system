import React from 'react'
import { isAuthenticated } from './auth'
import { useNavigate } from 'react-router-dom';

function ProtectedRoute({ children }) {

    const Navigate = useNavigate();

    if (!isAuthenticated) {
        return <Navigate to='login' replace />;
    }
    return children;
}

export default ProtectedRoute;