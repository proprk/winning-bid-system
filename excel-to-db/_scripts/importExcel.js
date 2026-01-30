// ---------- Imports ----------
const ExcelJS = require('exceljs');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// ---------- Database Connection ----------
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bidding_system'
});

// ---------- Vendor Master List ----------
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

// ---------- Vendor Detection Logic ----------
function extractVendorName(filename) {
    const normalizedFilename = filename.toLowerCase();

    for (const vendor of VENDORS) {
        if (normalizedFilename.includes(vendor.toLowerCase())) {
            return vendor;
        }
    }

    return null;
}

// ---------- Extract Value After Colon ----------

function extractValueAfterColon(text) {
    if (!text) return null;

    const str = text.toString();
    const parts = str.split(':');

    if (parts.length < 2) return str.trim();
    return parts.slice(1).join(':').trim();
}


// ---------- Excel File ----------
const fileName =
    'SGO 24-001 Quad_SGO 24-001 Polar & Addt_l Pair Tiered Offer v2 - Pricing 01.23.24.xlsx';

const filePath = path.join(__dirname, fileName);

// ---------- Vendor Detection ----------
const vendorName = extractVendorName(fileName);

if (!vendorName) {
    throw new Error('Vendor name not found in filename');
}

console.log('Detected Vendor:', vendorName);

// ---------- DB Helper ----------
async function getOrCreateVendor(vendorName) {
    const [rows] = await db.query(
        'SELECT id FROM vendors WHERE vendor_name = ?',
        [vendorName]
    );

    if (rows.length > 0) {
        return rows[0].id;
    }

    const [result] = await db.query(
        'INSERT INTO vendors (vendor_name) VALUES (?)',
        [vendorName]
    );

    return result.insertId;
}

if (!fs.existsSync(filePath)) {
    throw new Error('Excel file does not exist at path: ' + filePath);
}


async function readProjectDetails(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheet = workbook.worksheets[0];

    const graphicNotes = [
        sheet.getCell('B3').value,
        sheet.getCell('B4').value,
        sheet.getCell('B5').value,
        sheet.getCell('B6').value,
        sheet.getCell('B7').value,
        sheet.getCell('B8').value,
        sheet.getCell('B9').value,
        sheet.getCell('B10').value
    ]
        .filter(Boolean)
        .map(v => v.toString().trim())
        .join('\n');

    return {
        project_name: sheet.getCell('A1').value?.toString() || null,

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

async function createProject(vendorId, projectData) {
    const [result] = await db.query(
        `
    INSERT INTO projects (
      vendor_id,
      project_name,
      graphic_notes,
      ship_date,
      arrival_date,
      ship_method,
      live_date,
      down_date,
      discard_date,
      overage_ship_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
            vendorId,
            projectData.project_name,
            projectData.graphic_notes,
            projectData.ship_date,
            projectData.arrival_date,
            projectData.ship_method,
            projectData.live_date,
            projectData.down_date,
            projectData.discard_date,
            projectData.overage_ship_date
        ]
    );

    return result.insertId;
}

// ---------- Detect GROUP ROWS ----------

// STEP 8.1 — Read Sheet Rows Safely
function isEffectivelyEmpty(cellValue) {
    if (cellValue === null || cellValue === undefined) return true;

    // If cell is rich text
    if (typeof cellValue === 'object' && cellValue.richText) return false;

    const text = cellValue.toString().trim();
    return text === '';
}


// STEP 8.2 — Detect Group Rows
async function extractItemGroups(filePath, projectId) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const groupIds = {};
    let currentGroupId = null;

    // Start after header row (Row 11)
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber < 12) return;

        const cellA = row.getCell(1).value;
        if (!cellA) return;

        // Check if rest of the row is empty
        let isGroupRow = true;
        for (let col = 2; col <= 22; col++) {
            if (!isEffectivelyEmpty(row.getCell(col).value)) {
                isGroupRow = false;
                break;
            }
        }

        console.log(
            `Row ${rowNumber} | A: "${cellA}" | isGroupRow = ${isGroupRow}`
        );

        if (isGroupRow) {
            const groupName = cellA.toString().trim();
            groupIds[rowNumber] = {
                name: groupName,
                id: null
            };
        }
    });

    return groupIds;
}

// STEP 8.3 — Insert Groups into Database
async function insertGroups(groupMap, projectId) {
    for (const rowNumber in groupMap) {
        const groupName = groupMap[rowNumber].name;

        const [result] = await db.query(
            'INSERT INTO item_groups (project_id, group_name) VALUES (?, ?)',
            [projectId, groupName]
        );

        groupMap[rowNumber].id = result.insertId;
    }

    return groupMap;
}

// STEP 9.3 — Helper: Safe Cell Value Reader

function getCellText(cell) {
    if (cell === null || cell === undefined) return null;
    return cell.toString().trim() || null;
}


// STEP 9.4 — Insert Item into DB

async function insertItem({
    vendorId,
    projectId,
    groupId,
    row
}) {
    const values = [
        vendorId,
        projectId,
        groupId,

        getCellText(row.getCell(1).value),
        getCellText(row.getCell(2).value),
        getCellText(row.getCell(3).value),
        getCellText(row.getCell(4).value),
        getCellText(row.getCell(5).value),

        Number(row.getCell(6).value) || 0,
        Number(row.getCell(7).value) || 0,
        Number(row.getCell(8).value) || 0,

        Number(row.getCell(9).value?.toString().replace('$', '')) || 0,
        Number(row.getCell(10).value?.toString().replace('$', '')) || 0,

        getCellText(row.getCell(11).value),
        Number(row.getCell(12).value) || 0,
        Number(row.getCell(13).value) || 0,
        Number(row.getCell(14).value) || 0,

        getCellText(row.getCell(15).value),
        getCellText(row.getCell(16).value),
        getCellText(row.getCell(17).value),
        getCellText(row.getCell(18).value),
        getCellText(row.getCell(19).value),

        getCellText(row.getCell(20).value),
        getCellText(row.getCell(21).value),
        getCellText(row.getCell(22).value)
    ];

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
        values
    );
}


// STEP 9.5 — Process All Rows (Main Logic)

async function extractAndInsertItems({
    filePath,
    vendorId,
    projectId,
    groupsMap
}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    let currentGroupId = null;

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber < 12) return;

        // Check if this row is a group row
        if (groupsMap[rowNumber]) {
            currentGroupId = groupsMap[rowNumber].id;
            return;
        }

        if (!currentGroupId) return;

        const description = getCellText(row.getCell(1).value);
        const size = getCellText(row.getCell(2).value);

        if (!description || !size) return;

        insertItem({
            vendorId,
            projectId,
            groupId: currentGroupId,
            row
        });
    });
}











// ---------- Test Runner ----------
(async () => {
    const vendorId = await getOrCreateVendor(vendorName);
    const projectData = await readProjectDetails(filePath);
    const projectId = await createProject(vendorId, projectData);

    const groupMap = await extractItemGroups(filePath, projectId);
    const groupsWithIds = await insertGroups(groupMap, projectId);

    await extractAndInsertItems({
        filePath,
        vendorId,
        projectId,
        groupsMap: groupsWithIds
    });

    console.log('Items inserted successfully');
})();