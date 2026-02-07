import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Typography,
    Grid,
    Paper,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    CircularProgress
} from '@mui/material';

function ProjectDetails() {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');

        Promise.all([
            fetch(`http://localhost:3000/api/projects/${projectId}`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                if (!res.ok) throw new Error('Unauthorized');
                return res.json();
            }),

            fetch(`http://localhost:3000/api/projects/${projectId}/items`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                if (!res.ok) throw new Error('Unauthorized');
                return res.json();
            })
        ])
            .then(([projectData, itemsData]) => {
                setProject(projectData);
                setItems(itemsData.results || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [projectId]);


    if (loading) return <CircularProgress />;

    if (!project) {
        return (
            <Typography color="error">
                Project not found or access denied.
            </Typography>
        );
    }


    return (
        <div>
            {/* Page Title */}
            <Typography variant="h4" gutterBottom>
                {project.project_name}
            </Typography>

            <Typography color="text.secondary" gutterBottom>
                Project Date: {project.live_date || '-'}
            </Typography>

            {/* Info Boxes */}
            <Grid container spacing={3} marginBottom={4}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ padding: 2 }}>
                        <Typography variant="h6">Shipping Details</Typography>
                        <p>Ship Date: {project.ship_date}</p>
                        <p>Arrival Date: {project.arrival_date}</p>
                        <p>Ship Method: {project.ship_method}</p>
                        <p>Live Date: {project.live_date}</p>
                        <p>Down Date: {project.down_date}</p>
                        <p>Discard Date: {project.discard_date}</p>
                        <p>Overage Ship Date: {project.overage_ship_date}</p>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ padding: 2 }}>
                        <Typography variant="h6">Graphic Notes</Typography>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                            {project.graphic_notes || '-'}
                        </pre>
                    </Paper>
                </Grid>
            </Grid>

            {/* Items Table */}
            <Typography variant="h6" gutterBottom>
                Items : (count = {items.length})
            </Typography>

            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell><b>Item</b></TableCell>
                        <TableCell><b>Size</b></TableCell>
                        <TableCell><b>Material</b></TableCell>
                        <TableCell><b>Unit Price</b></TableCell>
                        <TableCell><b>Quantity</b></TableCell>
                        <TableCell><b>Total Price</b></TableCell>
                    </TableRow>
                </TableHead>

                <TableBody>
                    {items.map((item, idx) => (
                        <TableRow key={idx}>
                            <TableCell>{item.item_description}</TableCell>
                            <TableCell>{item.size}</TableCell>
                            <TableCell>{item.material}</TableCell>
                            <TableCell>${item.price_point}</TableCell>
                            <TableCell>{item.total_print_quantity}</TableCell>
                            <TableCell>${item.total_price}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default ProjectDetails;
