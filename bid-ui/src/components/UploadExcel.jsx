import { useState, useRef } from 'react'
import { Button, Typography } from '@mui/material'

const VENDORS = [
    'Chromatic Aura',
    'Duggal',
    'Graphic Systems',
    'Quad',
    'Sandy Alexander',
    'Innomark',
    'Geoff Howell Inc',
    'Image Options',
    'Screaming Colors',
    'Seven',
    'Taylor',
    'Vitrina'
];

function UploadExcel() {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const [disabled, setDisabled] = useState(false);

    const inputFileRef = useRef(null);

    const handleChange = (e) => {
        const selectedFile = e.target.files[0];

        if (!selectedFile) {
            setFile(null);
            setDisabled(true);
            setStatus(null);
            return
        }

        setFile(selectedFile);

        const lower = selectedFile.name.toLowerCase();

        const vendorFound = VENDORS.find(vendor => (
            lower.includes(vendor.toLowerCase())
        ))

        if (vendorFound) {
            setDisabled(false);
            setStatus(null);
        } else {
            setStatus("Error: Couldn't find Vendor name in file name")
            setDisabled(true)
        }

    }

    const handleUpload = async () => {

        if (!file) {
            setStatus('Error: No file selected');
            return;
        }

        setLoading(true);

        const formData = new FormData();
        formData.append('file', file);


        try {
            const response = await fetch('http://localhost:3000/api/upload-excel', {
                method: 'POST',
                body: formData,
            })

            const data = await response.json();
            console.log('data :', data)

            if (!response.ok) {
                if (response.status === 409) {
                    throw new Error('⚠️ This project was already uploaded. Duplicate uploads are not allowed.');
                }
                throw new Error(data.error || 'Upload Failed');
            }
            setStatus(`Success: ${data.message}`)
            setFile(null);
            inputFileRef.current.value = '';
            setDisabled(true);
        } catch (err) {
            setStatus(`Error: ${err.message}`)
        } finally {
            setLoading(false);
        }

    }


    return (
        <>
            <h2>Upload Excel</h2>

            <Button component='label' color='primary'>
                <input
                    type="file"
                    hidden accept='.xlsx, .xls'
                    onChange={handleChange}
                    ref={inputFileRef}
                    cursor='pointer' />
                Upload File
            </Button>

            <Button variant='contained' color='primary' disabled={loading || disabled || !file} onClick={handleUpload}>
                {loading ? 'Uploading..' : 'Upload File'}
            </Button>

            <Typography variant='body1'>
                {status && <p>{status}</p>}
            </Typography>

        </>

    )
}

export default UploadExcel