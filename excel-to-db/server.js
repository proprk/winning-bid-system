// ================= IMPORTS =================
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// ================= APP SETUP =================
const app = express();
const PORT = 3000;

// ================= DB CONNECTION =================
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bidding_system'
});

// ================= CORS (DEV ONLY) =================
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    next();
});

// ================= FILE UPLOAD =================
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ================= VENDOR MASTER =================
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

function extractVendorName(filename) {
    const lower = filename.toLowerCase();
    for (const vendor of VENDORS) {
        if (lower.includes(vendor.toLowerCase())) {
            return vendor;
        }
    }
    return null;
}

// ================= HELPERS =================
function extractValueAfterColon(value) {
    if (!value) return null;
    const str = value.toString();
    const parts = str.split(':');
    return parts.length > 1 ? parts.slice(1).join(':').trim() : str.trim();
}

function getCellText(cell) {
    if (!cell) return null;
    return cell.toString().trim() || null;
}

function isEffectivelyEmpty(value) {
    if (value === null || value === undefined) return true;
    return value.toString().trim() === '';
}

async function isDuplicateProject(vendorId, projectName) {
    const [rows] = await db.query(
        `
    SELECT id
    FROM projects
    WHERE vendor_id = ?
      AND project_name = ?
    LIMIT 1
    `,
        [vendorId, projectName]
    );

    return rows.length > 0;
}

function getNumericValue(cellValue) {
    if (cellValue === null || cellValue === undefined) return 0;

    // If ExcelJS gives a number directly
    if (typeof cellValue === 'number') return cellValue;

    // If it's an object (formula, rich text, etc.)
    if (typeof cellValue === 'object') {
        if (typeof cellValue.result === 'number') {
            return cellValue.result;
        }
        if (typeof cellValue.value === 'number') {
            return cellValue.value;
        }
        if (typeof cellValue.text === 'string') {
            return parseFloat(cellValue.text.replace(/[^0-9.-]/g, '')) || 0;
        }
    }

    // If it's a string
    if (typeof cellValue === 'string') {
        return parseFloat(cellValue.replace(/[^0-9.-]/g, '')) || 0;
    }

    return 0;
}

// ================= DB HELPERS =================
async function getOrCreateVendor(vendorName) {
    const [rows] = await db.query(
        'SELECT id FROM vendors WHERE vendor_name = ?',
        [vendorName]
    );
    if (rows.length) return rows[0].id;

    const [result] = await db.query(
        'INSERT INTO vendors (vendor_name) VALUES (?)',
        [vendorName]
    );
    return result.insertId;
}

// ================= PROJECT =================
async function readProjectDetails(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const graphicNotes = [
        'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'
    ]
        .map(c => sheet.getCell(c).value)
        .filter(Boolean)
        .map(v => v.toString().trim())
        .join('\n');

    return {
        project_name: getCellText(sheet.getCell('A1').value),
        ship_date: extractValueAfterColon(sheet.getCell('A4').value),
        arrival_date: extractValueAfterColon(sheet.getCell('A5').value),
        ship_method: extractValueAfterColon(sheet.getCell('A6').value),
        live_date: extractValueAfterColon(sheet.getCell('A7').value),
        down_date: extractValueAfterColon(sheet.getCell('A8').value),
        discard_date: extractValueAfterColon(sheet.getCell('A9').value),
        overage_ship_date: extractValueAfterColon(sheet.getCell('A10').value),
        graphic_notes: graphicNotes
    };
}

async function createProject(vendorId, data) {
    const [res] = await db.query(
        `
    INSERT INTO projects (
      vendor_id, project_name, graphic_notes,
      ship_date, arrival_date, ship_method,
      live_date, down_date, discard_date, overage_ship_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
            vendorId,
            data.project_name,
            data.graphic_notes,
            data.ship_date,
            data.arrival_date,
            data.ship_method,
            data.live_date,
            data.down_date,
            data.discard_date,
            data.overage_ship_date
        ]
    );
    return res.insertId;
}

// ================= GROUPS =================
async function extractItemGroups(filePath, projectId) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const groups = {};

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber < 12) return;

        const a = row.getCell(1).value;
        if (!a) return;

        let isGroup = true;
        for (let c = 2; c <= 22; c++) {
            if (!isEffectivelyEmpty(row.getCell(c).value)) {
                isGroup = false;
                break;
            }
        }

        if (isGroup) {
            groups[rowNumber] = { name: a.toString().trim(), id: null };
        }
    });

    return groups;
}

async function insertGroups(groups, projectId) {
    for (const row in groups) {
        const [res] = await db.query(
            'INSERT INTO item_groups (project_id, group_name) VALUES (?, ?)',
            [projectId, groups[row].name]
        );
        groups[row].id = res.insertId;
    }
    return groups;
}

// ================= ITEMS =================
async function insertItem({ vendorId, projectId, groupId, row }) {
    await db.query(
        `
    INSERT INTO items (
      vendor_id, project_id, group_id,
      item_description, size, material, language, code_number,
      distro_quantity, overage_quantity, total_print_quantity,
      price_point, total_price,
      category, max_order_quantity, reorder_trigger, reprint_quantity,
      color, pantone, blockout, double_sided, same_or_different,
      finishing, print_method, comments
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
            vendorId, projectId, groupId,

            getCellText(row.getCell(1).value),
            getCellText(row.getCell(2).value),
            getCellText(row.getCell(3).value),
            getCellText(row.getCell(4).value),
            getCellText(row.getCell(5).value),

            getNumericValue(row.getCell(6).value),   // distro_quantity
            getNumericValue(row.getCell(7).value),   // overage_quantity
            getNumericValue(row.getCell(8).value),   // total_print_quantity
            getNumericValue(row.getCell(9).value),   // price_point
            getNumericValue(row.getCell(10).value),  // total_price

            getCellText(row.getCell(11).value),
            getNumericValue(row.getCell(12).value),
            getNumericValue(row.getCell(13).value),
            getNumericValue(row.getCell(14).value),

            getCellText(row.getCell(15).value),
            getCellText(row.getCell(16).value),
            getCellText(row.getCell(17).value),
            getCellText(row.getCell(18).value),
            getCellText(row.getCell(19).value),

            getCellText(row.getCell(20).value),
            getCellText(row.getCell(21).value),
            getCellText(row.getCell(22).value)
        ]
    );
}

async function extractAndInsertItems({ filePath, vendorId, projectId, groups }) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    let currentGroupId = null;

    sheet.eachRow((row, rowNumber) => {
        if (groups[rowNumber]) {
            currentGroupId = groups[rowNumber].id;
            return;
        }
        if (!currentGroupId || rowNumber < 12) return;

        const desc = getCellText(row.getCell(1).value);
        const size = getCellText(row.getCell(2).value);
        if (!desc || !size) return;

        insertItem({ vendorId, projectId, groupId: currentGroupId, row });
    });
}

// ================= ROUTES =================

// ================= Upload Excel =================
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file received. Please upload a valid Excel file.'
            });
        }

        console.log('req.file:', req.file);
        console.log('req.body:', req.body);

        const filePath = req.file.path;
        const originalName = req.file.originalname;

        const vendorName = extractVendorName(originalName);
        if (!vendorName) {
            return res.status(400).json({
                error: 'Vendor not detected in filename'
            });
        }

        const vendorId = await getOrCreateVendor(vendorName);
        const projectData = await readProjectDetails(filePath);

        // ✅ DUPLICATE CHECK
        const duplicate = await isDuplicateProject(
            vendorId,
            projectData.project_name
        );

        if (duplicate) {
            return res.status(409).json({
                error: 'This project has already been uploaded for this vendor.'
            });
        }

        const projectId = await createProject(vendorId, projectData);

        const groups = await insertGroups(
            await extractItemGroups(filePath, projectId),
            projectId
        );

        await extractAndInsertItems({
            filePath,
            vendorId,
            projectId,
            groups
        });

        return res.json({
            message: 'Excel processed successfully',
            projectId
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Excel processing failed' });
    }
});

// ================= Upload Hiatory =================
app.get('/api/upload-history', async (req, res) => {
    try {
        const [rows] = await db.query(
            `
      SELECT
        projects.id,
        projects.project_name,
        projects.live_date AS project_date,
        projects.created_at,
        vendors.vendor_name
      FROM projects
      JOIN vendors ON vendors.id = projects.vendor_id
      ORDER BY projects.created_at DESC
      `
        );

        res.json({
            count: rows.length,
            results: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch upload history' });
    }
});

// ================= Search Items =================

app.get('/api/items/search', async (req, res) => {
    const {
        q,
        size,
        material,
        code,
        vendor,
        group,
        page = 1
    } = req.query;

    if (!q) {
        return res.status(400).json({
            error: 'Search query (q) is required'
        });
    }

    const limit = 20;
    const offset = (Number(page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    whereClauses.push('items.item_description LIKE ?');
    params.push(`%${q}%`);

    if (size) {
        whereClauses.push('items.size = ?');
        params.push(size);
    }

    if (material) {
        whereClauses.push('items.material LIKE ?');
        params.push(`%${material}%`);
    }

    if (code) {
        whereClauses.push('items.code_number = ?');
        params.push(code);
    }

    if (vendor) {
        whereClauses.push('vendors.vendor_name = ?');
        params.push(vendor);
    }

    if (group) {
        whereClauses.push('item_groups.group_name = ?');
        params.push(group);
    }

    const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

    try {
        const [rows] = await db.query(
            `
      SELECT
        items.item_description,
        items.size,
        items.material,
        items.language,
        items.code_number,
        items.total_price,
        vendors.vendor_name,
        projects.project_name,
        item_groups.group_name,
        items.distro_quantity,
        items.overage_quantity,
        items.total_print_quantity,
        items.price_point,
        items.total_price,
        items.category,
        items.max_order_quantity,
        items.reorder_trigger,
        items.reprint_quantity,
        items.color,
        items.pantone,
        items.blockout,
        items.double_sided,
        items.same_or_different,
        items.finishing,
        projects.live_date AS project_date
        
      FROM items
      JOIN vendors ON vendors.id = items.vendor_id
      JOIN projects ON projects.id = items.project_id
      JOIN item_groups ON item_groups.id = items.group_id
      ${whereSQL}
      ORDER BY items.total_price ASC
      LIMIT ? OFFSET ?
      `,
            [...params, limit, offset]
        );

        res.json({
            count: rows.length,
            results: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Search failed' });
    }
});


// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});