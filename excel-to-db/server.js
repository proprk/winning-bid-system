// ================= IMPORTS =================
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');


const JWT_SECRET = 'super-secret-internal-key';

// ================= APP SETUP =================
const app = express();
const PORT = 3000;

app.use(express.json());


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
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
    );
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,DELETE,OPTIONS'
    );
    if (req.method === 'OPTIONS') return res.sendStatus(200);
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

function getNumericValue(cellValue, row, colIndex) {
    // 🔁 If empty → try walking UP to find merged value
    if (cellValue === null || cellValue === undefined) {
        if (!row || !colIndex) return 0;

        let r = row.number - 1;
        while (r >= 1) {
            const above = row.worksheet.getRow(r).getCell(colIndex).value;
            if (above !== null && above !== undefined && above !== '') {
                return getNumericValue(above);
            }
            r--;
        }
        return 0;
    }

    // Direct number
    if (typeof cellValue === 'number') return cellValue;

    // Formula cell
    if (typeof cellValue === 'object') {
        if (typeof cellValue.result === 'number') {
            return cellValue.result;
        }

        if (typeof cellValue.text === 'string') {
            return parseFloat(
                cellValue.text.replace(/[^\d.-]/g, '')
            ) || 0;
        }
    }

    // Currency / numeric string
    if (typeof cellValue === 'string') {
        return parseFloat(
            cellValue.replace(/[^\d.-]/g, '')
        ) || 0;
    }

    return 0;
}


function normalizeHeader(text) {
    return text
        .toString()
        .replace(/\s+/g, ' ')
        .replace(/\n/g, ' ')
        .trim()
        .toUpperCase();
}

function getHeaderMap(sheet) {
    const headerRow = sheet.getRow(11);
    const headerMap = {};

    headerRow.eachCell((cell, colNumber) => {
        if (!cell.value) return;

        const normalized = normalizeHeader(cell.value);
        headerMap[normalized] = colNumber;
    });

    return headerMap;
}

function getSafeCell(row, headerMap, headerName) {
    const col = headerMap[headerName];
    if (!col) return null; // header missing → safe ignore
    return row.getCell(col)?.value ?? null;
}

function resolveHeader(headerMap, possibleNames) {
    for (const name of possibleNames) {
        if (headerMap[name]) return headerMap[name];
    }
    return null;
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

    function isGroupLikeRow(row) {
        const firstCell = row.getCell(1).value;
        if (!firstCell) return false;

        for (let c = 2; c <= 22; c++) {
            if (!isEffectivelyEmpty(row.getCell(c).value)) {
                return false;
            }
        }
        return true;
    }

    function isItemRow(row) {
        // Item rows must have Item Description + Size
        const desc = row.getCell(1).value;
        const size = row.getCell(2).value;
        return !!(desc && size);
    }

    for (let rowNumber = 12; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);

        if (!isGroupLikeRow(row)) continue;

        // 🔍 Look ahead to find the next meaningful row
        let nextRowNumber = rowNumber + 1;
        let nextRow = null;

        while (nextRowNumber <= sheet.rowCount) {
            const candidate = sheet.getRow(nextRowNumber);

            const hasAnyValue = candidate.values.some(
                v => v !== null && v !== undefined && v !== ''
            );

            if (hasAnyValue) {
                nextRow = candidate;
                break;
            }
            nextRowNumber++;
        }

        // ❌ No next meaningful row → ignore
        if (!nextRow) continue;

        // ❌ If next meaningful row is ALSO group-like → SUPER GROUP → IGNORE
        if (isGroupLikeRow(nextRow)) {
            continue;
        }

        // ✅ If next meaningful row is item → REAL GROUP
        if (isItemRow(nextRow)) {
            groups[rowNumber] = {
                name: row.getCell(1).value.toString().trim(),
                id: null
            };
        }
    }

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
async function insertItem({ vendorId, projectId, groupId, row, headerMap }) {
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
            vendorId,
            projectId,
            groupId,

            getCellText(getSafeCell(row, headerMap, 'ITEM DESCRIPTION')),
            getCellText(
                row.getCell(
                    resolveHeader(headerMap, [
                        'SIZE',
                        'SIZE (W X H)',
                        'SIZE(W X H)'
                    ])
                )?.value
            ),

            getCellText(getSafeCell(row, headerMap, 'MATERIAL')),
            getCellText(getSafeCell(row, headerMap, 'LANG')),
            getCellText(getSafeCell(row, headerMap, 'CODE #')),

            getNumericValue(getSafeCell(row, headerMap, 'DISTRO QUANTITY')),
            getNumericValue(getSafeCell(row, headerMap, 'OVERAGE QUANTITY')),
            getNumericValue(getSafeCell(row, headerMap, 'TOTAL PRINT QUANTITY')),
            getNumericValue(
                getSafeCell(row, headerMap, 'PRICE POINT ENTERED ON MASTER'),
                row,
                headerMap['PRICE POINT ENTERED ON MASTER']
            ),

            getNumericValue(getSafeCell(row, headerMap, 'TOTAL PRICE'), row, headerMap['TOTAL PRICE']),

            getCellText(getSafeCell(row, headerMap, 'CATEGORY')),
            getNumericValue(getSafeCell(row, headerMap, 'MAX ORDER QUANTITY')),
            getNumericValue(getSafeCell(row, headerMap, 'REORDER TRIGGER')),
            getNumericValue(getSafeCell(row, headerMap, 'REPRINT QUANTITY')),

            getCellText(getSafeCell(row, headerMap, 'COLOR')),
            getCellText(getSafeCell(row, headerMap, 'PANTONE')),
            getCellText(getSafeCell(row, headerMap, 'BLOCKOUT')),
            getCellText(getSafeCell(row, headerMap, 'DOUBLE SIDED')),
            getCellText(getSafeCell(row, headerMap, 'SAME OR DIFFERENT')),

            getCellText(getSafeCell(row, headerMap, 'FINISHING')),
            getCellText(getSafeCell(row, headerMap, 'PRINT METHOD')),
            getCellText(getSafeCell(row, headerMap, 'COMMENTS'))
        ]
    );
}

// ================= EXTRACT & INSERT ITEMS =================
async function extractAndInsertItems({ filePath, vendorId, projectId, groups }) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const headerMap = getHeaderMap(sheet);
    console.log("headerMap: ", headerMap);
    let currentGroupId = null;

    for (let rowNumber = 12; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);

        // If this row is a real group
        if (groups[rowNumber]) {
            currentGroupId = groups[rowNumber].id;
            continue;
        }

        if (!currentGroupId) continue;

        const desc = getCellText(
            getSafeCell(row, headerMap, 'ITEM DESCRIPTION')
        );

        const size = getCellText(
            row.getCell(
                resolveHeader(headerMap, [
                    'SIZE',
                    'SIZE (W X H)',
                    'SIZE(W X H)'
                ])
            )?.value
        );

        // Skip empty / separator rows
        if (!desc || !size) continue;

        // ✅ THIS IS THE IMPORTANT PART
        await insertItem({
            vendorId,
            projectId,
            groupId: currentGroupId,
            row,
            headerMap
        });
    }
}


// ================= AUTH with JWT=================

function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token missing' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, role }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// ================= ROUTES =================

// ================= Upload Excel =================
app.post('/api/upload-excel', authenticateJWT, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file received. Please upload a valid Excel file.'
            });
        }

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
app.get('/api/upload-history', authenticateJWT, async (req, res) => {
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

// ================= Delete Project =================
app.delete('/api/projects/:projectId', authenticateJWT,
    async (req, res) => {
        const { projectId } = req.params;

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // 1. Delete items
            await conn.query(
                'DELETE FROM items WHERE project_id = ?',
                [projectId]
            );

            // 2. Delete groups
            await conn.query(
                'DELETE FROM item_groups WHERE project_id = ?',
                [projectId]
            );

            // 3. Delete project
            const [result] = await conn.query(
                'DELETE FROM projects WHERE id = ?',
                [projectId]
            );

            await conn.commit();

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Project not found' });
            }

            res.json({ message: 'Project deleted successfully' });

        } catch (err) {
            await conn.rollback();
            console.error(err);
            res.status(500).json({ error: 'Failed to delete project' });
        } finally {
            conn.release();
        }
    }
);

// ================= Get Project Details =================
app.get(
    '/api/projects/:projectId',
    authenticateJWT,
    async (req, res) => {
        const { projectId } = req.params;

        try {
            const [rows] = await db.query(
                `
        SELECT
          project_name,
          ship_date,
          arrival_date,
          ship_method,
          live_date,
          down_date,
          discard_date,
          overage_ship_date,
          graphic_notes
        FROM projects
        WHERE id = ?
        `,
                [projectId]
            );

            if (!rows.length) {
                return res.status(404).json({ error: 'Project not found' });
            }

            res.json(rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch project details' });
        }
    }
);

// ================= Project Items =================
app.get(
    '/api/projects/:projectId/items',
    authenticateJWT,
    async (req, res) => {
        const { projectId } = req.params;

        try {
            const [rows] = await db.query(
                `
        SELECT
          item_description,
          size,
          material,
          price_point,
          total_print_quantity,
          total_price
        FROM items
        WHERE project_id = ?
        ORDER BY item_description
        `,
                [projectId]
            );

            res.json({
                count: rows.length,
                results: rows
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch project items' });
        }
    }
);



// ================= Search Items =================
app.get('/api/items/search', authenticateJWT, async (req, res) => {
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


// ================= AUTH Login =================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE email = ? AND is_active = true',
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});


// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});