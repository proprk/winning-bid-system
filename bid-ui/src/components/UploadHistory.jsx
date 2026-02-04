import { useEffect, useState } from 'react';
import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Typography,
    CircularProgress
} from '@mui/material';

function UploadHistory() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

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
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default UploadHistory;