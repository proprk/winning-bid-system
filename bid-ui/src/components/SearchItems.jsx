import { useState } from 'react';
import {
    TextField,
    Button,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Typography,
    CircularProgress
} from '@mui/material';

function SearchItems() {
    const [q, setQ] = useState('');
    const [vendor, setVendor] = useState('');
    const [size, setSize] = useState('');
    const [material, setMaterial] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [error, setError] = useState(null);

    const handleSearch = async () => {
        if (!q) {
            setError('Please enter a search term');
            return;
        }

        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
            q,
            ...(vendor && { vendor }),
            ...(size && { size }),
            ...(material && { material })
        });

        try {
            const response = await fetch(
                `http://localhost:3000/api/items/search?${params.toString()}`
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Search failed');
            }

            setResults(data.results || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: 40 }}>
            <Typography variant="h5" gutterBottom>
                Search Items
            </Typography>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <TextField
                    label="Search Item"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />

                <TextField
                    label="Vendor"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                />

                <TextField
                    label="Size"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                />

                <TextField
                    label="Material"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                />

                <Button
                    variant="contained"
                    onClick={handleSearch}
                    disabled={loading}
                >
                    Search
                </Button>
            </div>

            {error && (
                <Typography color="error" style={{ marginBottom: 20 }}>
                    {error}
                </Typography>
            )}

            {loading && <CircularProgress />}

            {/* Results */}
            {results.length > 0 && (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell><b>Group</b></TableCell>
                            <TableCell><b>Item</b></TableCell>
                            <TableCell><b>Size</b></TableCell>
                            <TableCell><b>Material</b></TableCell>
                            <TableCell><b>Unit Price</b></TableCell>
                            <TableCell><b>Quantity <br /> (Distro + Overage)</b></TableCell>
                            <TableCell><b>Total Price</b></TableCell>
                            <TableCell><b>Vendor</b></TableCell>
                            <TableCell><b>Project</b></TableCell>
                            <TableCell><b>Project Date</b></TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {results.map((row, idx) => (
                            <TableRow key={idx}>
                                <TableCell>{row.group_name}</TableCell>
                                <TableCell>{row.item_description}</TableCell>
                                <TableCell>{row.size}</TableCell>
                                <TableCell>{row.material}</TableCell>
                                <TableCell>${row.price_point}</TableCell>
                                <TableCell>{row.total_print_quantity}</TableCell>
                                <TableCell>${row.total_price}</TableCell>
                                <TableCell>{row.vendor_name}</TableCell>
                                <TableCell>{row.project_name}</TableCell>
                                <TableCell>{row.project_date}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {!loading && results.length === 0 && (
                <Typography>No results found</Typography>
            )}
        </div>
    );
}

export default SearchItems;