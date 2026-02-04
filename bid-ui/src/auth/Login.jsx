// src/auth/Login.jsx
import { useState } from 'react';
import { TextField, Button, Typography } from '@mui/material';
import { setToken } from './auth';
import { useNavigate } from 'react-router-dom';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const handleLogin = async () => {
        setError(null);

        try {
            const res = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Login failed');
            }

            setToken(data.token);
            navigate('/app/dashboard');
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div style={{ padding: 40, maxWidth: 400, margin: 'auto' }}>
            <Typography variant="h5" gutterBottom>
                Internal Login
            </Typography>

            <TextField
                fullWidth
                label="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                margin="normal"
            />

            <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                margin="normal"
            />

            {error && (
                <Typography color="error" style={{ marginTop: 10 }}>
                    {error}
                </Typography>
            )}

            <Button
                fullWidth
                variant="contained"
                style={{ marginTop: 20 }}
                onClick={handleLogin}
            >
                Login
            </Button>
        </div>
    );
}

export default Login;