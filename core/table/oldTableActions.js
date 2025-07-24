import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * Replace commas in a cell with /
 * @param {string | number} cell
 * @returns The processed cell value
 */
function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

/**
 * Insert a row at the end of the table
 * @deprecated
 * @param {number} tableIndex - The index of the table
 * @param {object} data - The data to insert
 * @returns The index of the newly inserted row
 */
export function insertRow(tableIndex, data) {
    if (tableIndex == null) return EDITOR.error('insert function, tableIndex is empty');
    if (data == null) return EDITOR.error('insert function, data is empty');

    // Get the table object, supporting both old and new systems
    const table = DERIVED.any.waitingTable[tableIndex];

    // Check if it is a new system Sheet object
    if (table.uid && table.hashSheet) {
        // New system: use Sheet class API
        try {
            // Get the current number of rows (excluding the header)
            const rowCount = table.hashSheet.length - 1;

            // Insert a new row after the last row
            const cell = table.findCellByPosition(0, 0); // Get the table source cell
            cell.newAction('insertDownRow'); // Insert a new row after the last row

            // Fill in the data
            Object.entries(data).forEach(([key, value]) => {
                const colIndex = parseInt(key) + 1; // +1 because the first column is the row index
                if (colIndex < table.hashSheet[0].length) {
                    const cell = table.findCellByPosition(rowCount + 1, colIndex);
                    if (cell) {
                        cell.data.value = handleCellValue(value);
                    }
                }
            });

            console.log(`Insertion successful: table ${tableIndex}, row ${rowCount + 1}`);
            return rowCount + 1;
        } catch (error) {
            console.error('Failed to insert row:', error);
            return -1;
        }
    } else {
        // Old system: keep the original logic
        const newRowArray = new Array(table.columns.length).fill("");
        Object.entries(data).forEach(([key, value]) => {
            newRowArray[parseInt(key)] = handleCellValue(value);
        });

        const dataStr = JSON.stringify(newRowArray);
        // Check if the same row already exists
        if (table.content.some(row => JSON.stringify(row) === dataStr)) {
            console.log(`Skipping duplicate insertion: table ${tableIndex}, data ${dataStr}`);
            return -1; // Return -1 to indicate that no insertion was made
        }
        table.content.push(newRowArray);
        const newRowIndex = table.content.length - 1;
        console.log(`Insertion successful (old system): table ${tableIndex}, row ${newRowIndex}`);
        return newRowIndex;
    }
}

/**
 * Delete a row
 * @deprecated
 * @param {number} tableIndex - The index of the table
 * @param {number} rowIndex - The index of the row
 */
export function deleteRow(tableIndex, rowIndex) {
    if (tableIndex == null) return EDITOR.error('delete function, tableIndex is empty');
    if (rowIndex == null) return EDITOR.error('delete function, rowIndex is empty');

    // Get the table object, supporting both old and new systems
    const table = DERIVED.any.waitingTable[tableIndex];

    // Check if it is a new system Sheet object
    if (table.uid && table.hashSheet) {
        // New system: use Sheet class API
        try {
            // Make sure the row index is valid (considering the header row)
            const actualRowIndex = rowIndex + 1; // +1 because the first row is the header

            // Check if the row index is valid
            if (actualRowIndex >= table.hashSheet.length || actualRowIndex <= 0) {
                console.error(`Invalid row index: ${rowIndex}`);
                return;
            }

            // Get the cell of the row to be deleted and trigger the delete operation
            const cell = table.findCellByPosition(actualRowIndex, 0);
            if (cell) {
                cell.newAction('deleteSelfRow');
                console.log(`Deletion successful: table ${tableIndex}, row ${rowIndex}`);
            } else {
                console.error(`Row not found: ${rowIndex}`);
            }
        } catch (error) {
            console.error('Failed to delete row:', error);
        }
    } else {
        // Old system: keep the original logic
        if (table.content && rowIndex >= 0 && rowIndex < table.content.length) {
            table.content.splice(rowIndex, 1);
            console.log(`Deletion successful (old system): table ${tableIndex}, row ${rowIndex}`);
        } else {
            console.error(`Deletion failed (old system): table ${tableIndex}, invalid row index ${rowIndex} or content does not exist`);
        }
    }
}

/**
 * Update a single row of information
 * @deprecated
 * @param {number} tableIndex - The index of the table
 * @param {number} rowIndex - The index of the row
 * @param {object} data - The data to update
 */
export function updateRow(tableIndex, rowIndex, data) {
    if (tableIndex == null) return EDITOR.error('update function, tableIndex is empty');
    if (rowIndex == null) return EDITOR.error('update function, rowIndex is empty');
    if (data == null) return EDITOR.error('update function, data is empty');

    // Get the table object, supporting both old and new systems
    const table = DERIVED.any.waitingTable[tableIndex];

    // Check if it is a new system Sheet object
    if (table.uid && table.hashSheet) {
        // New system: use Sheet class API
        try {
            // Make sure the row index is valid (considering the header row)
            const actualRowIndex = rowIndex + 1; // +1 because the first row is the header

            // Check if the row index is valid
            if (actualRowIndex >= table.hashSheet.length || actualRowIndex <= 0) {
                console.error(`Invalid row index: ${rowIndex}`);
                return;
            }

            // Update row data
            Object.entries(data).forEach(([key, value]) => {
                const colIndex = parseInt(key) + 1; // +1 because the first column is the row index
                if (colIndex < table.hashSheet[0].length) {
                    const cell = table.findCellByPosition(actualRowIndex, colIndex);
                    if (cell) {
                        cell.data.value = handleCellValue(value);
                    }
                }
            });

            // Save changes
            table.save();
            console.log(`Update successful: table ${tableIndex}, row ${rowIndex}`);
        } catch (error) {
            console.error('Failed to update row:', error);
        }
    } else {
        // Old system: keep the original logic
        if (table.content && table.content[rowIndex]) {
            Object.entries(data).forEach(([key, value]) => {
                table.content[rowIndex][parseInt(key)] = handleCellValue(value);
            });
            console.log(`Update successful (old system): table ${tableIndex}, row ${rowIndex}`);
        } else {
            console.error(`Update failed (old system): table ${tableIndex}, row ${rowIndex} does not exist or content does not exist`);
        }
    }
}
