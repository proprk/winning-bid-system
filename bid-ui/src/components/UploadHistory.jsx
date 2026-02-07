import { useEffect, useState } from 'react';
import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Typography,
    CircularProgress,
    Button,
} from '@mui/material';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router-dom';


function UploadHistory() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetch('http://localhost:3000/api/upload-history', {
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            }
        })
            .then(res => res.json())
            .then(data => {
                setRows(data.results || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return <CircularProgress />;
    }

    // Delete Project
    const handleDelete = async (projectName, projectId) => {
        const confirmDelete = window.confirm(
            `Are you sure you want to delete this project?\n\nProject: ${projectName}\n\nThis action cannot be undone.`
        );

        if (!confirmDelete) return;

        try {
            const res = await fetch(
                `http://localhost:3000/api/projects/${projectId}`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Delete failed');
            }

            setRows(prev => prev.filter(r => r.id !== projectId));
        } catch (err) {
            alert(err.message);
        }
    };


    return (
        <div style={{ padding: 40 }}>
            <Typography variant="h5" gutterBottom>
                Upload History
            </Typography>

            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell><b>Vendor</b></TableCell>
                        <TableCell><b>Project Name</b></TableCell>
                        <TableCell><b>Project Date</b></TableCell>
                        <TableCell><b>Uploaded At</b></TableCell>
                        <TableCell><b>Action</b></TableCell>
                    </TableRow>
                </TableHead>

                <TableBody>
                    {rows.map(row => (
                        <TableRow key={row.id}>
                            <TableCell>{row.vendor_name}</TableCell>
                            <TableCell>{row.project_name}</TableCell>
                            <TableCell>{row.project_date || '-'}</TableCell>
                            <TableCell>
                                {new Date(row.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                                <Button
                                    onClick={() => navigate(`/app/projects/${row.id}`)}
                                >
                                    <VisibilityIcon />
                                </Button>
                                <Button onClick={() => handleDelete(row.project_name, row.id)}>
                                    <DeleteForeverIcon
                                        sx={{
                                            color: 'black',
                                            '&:hover': {
                                                color: 'red',
                                            },
                                        }}
                                    />
                                </Button>

                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default UploadHistory;