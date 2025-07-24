import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import {getColumnLetter} from "./utils.js";
import {SheetBase} from "./base.js";

const CellAction = {
    editCell: 'editCell',
    insertLeftColumn: 'insertLeftColumn',
    insertRightColumn: 'insertRightColumn',
    insertUpRow: 'insertUpRow',
    insertDownRow: 'insertDownRow',
    deleteSelfColumn: 'deleteSelfColumn',
    deleteSelfRow: 'deleteSelfRow',
    clearSheet: 'clearSheet',
}
const CellType = {
    sheet_origin: 'sheet_origin',
    column_header: 'column_header',
    row_header: 'row_header',
    cell: 'cell',
}

/**
 * Cell class, used to manage cell data in a table
 * @description The cell class is used to manage cell data in a table, including the cell's position, value, status, type, etc.
 * @description The cell class also provides operations on cells, including editing, inserting, deleting, etc.
 * @description The cell class is a subclass of the Sheet class, used to manage cell data in a Sheet
 */
export class Cell {
    static CellType = CellType;
    static CellAction = CellAction;

    constructor(parent, target = null) {
        this.uid = undefined;
        this.parent = parent;

        this.type = '';
        this.status = '';
        this.coordUid = undefined; // Used to store the coordinate uid of the cell
        // this.targetUid = undefined;
        this.element = null;
        this.data = new Proxy({}, {
            get: (target, prop) => {
                return target[prop];
            },
            set: (target, prop, value) => {
                this.editCellData({ prop, value });
                return true;
            },
        });

        this.customEventListeners = {}; // Store custom event listeners, key is the event name (CellAction or ''), value is the callback function
        this.#init(target);
    }

    get position() {
        return this.#positionInParentCellSheet();
    }
    get headerX() {
        const p = this.#positionInParentCellSheet();
        const targetUid = this.parent.hashSheet[p[0]][0];   // Get the uid of the first cell in the current cell's row
        return this.parent.cells.get(targetUid);
    }
    get headerY() {
        const p = this.#positionInParentCellSheet();
        const targetUid = this.parent.hashSheet[0][p[1]];   // Get the uid of the first cell in the current cell's column
        return this.parent.cells.get(targetUid);
    }

    newAction(actionName, props, isSave = true) {
        this.#event(actionName, props, isSave);
    }
    /* newActions(actionList) {
        for (const action of actionList) {
            this.#event(action.type, { value: action.value }, [action.rowIndex, action.colIndex], false);
        }
        this.parent.renderSheet(this.parent.lastCellEventHandler);
        this.parent.save();
    } */
    editCellData(props) {
        this.#event(CellAction.editCell, props);
    }
    initCellRender(rowIndex = -1, colIndex = -1) {
        this.element = document.createElement('td');
        this.element.className = 'sheet-cell';
        this.renderCell(rowIndex, colIndex);

        return this.element;
    }
    // renderCell(rowIndex, colIndex) {
    //     return renderCell(this, rowIndex, colIndex)
    // }
    renderCell(rowIndex = -1, colIndex = -1) {
        if (rowIndex === -1 && colIndex === -1) {
            [rowIndex, colIndex] = this.#positionInParentCellSheet();
        }

        // Use instanceof to get whether this.parent is a Sheet class or a SheetTemplate class
        if (this.parent?.constructor?.name === 'SheetTemplate') {
            if (rowIndex === 0 && colIndex === 0) {
                this.element.classList.add('sheet-cell-origin');
            } else if (rowIndex === 0) {
                this.element.textContent = this.data.value || getColumnLetter(colIndex - 1); // Column headers (A, B, C...)
                this.element.classList.add('sheet-header-cell-top');
            } else if (colIndex === 0) {
                if (this.parent.type === SheetBase.SheetType.dynamic || this.parent.type === SheetBase.SheetType.fixed) {
                    this.element.textContent = 'i'
                } else {
                    this.element.textContent = this.data.value || rowIndex; // Row headers (1, 2, 3...)
                }
                this.element.classList.add('sheet-header-cell-left');
            } else {
                if (this.parent.type === SheetBase.SheetType.static) {
                    const pos = [getColumnLetter(colIndex - 1), rowIndex].join(''); // Cell position (A1, B2, C3...)
                    this.element.textContent = this.data.value || pos; // Display cell value, default is position
                    this.element.style.fontSize = '0.8rem';
                    this.element.style.fontWeight = 'normal';
                    this.element.style.color = 'var(--SmartThemeEmColor)'
                } else {
                    this.element.style.cursor = 'not-allowed';
                }
                this.element.classList.add('sheet-cell-other');
            }
        } else if (this.parent?.constructor?.name === 'Sheet') {
            if (rowIndex === 0 && colIndex === 0) {
                // this.element.textContent = 0;
                this.element.classList.add('sheet-cell-origin');
                // this.element.style.border = 'none';
                // this.element.style.outline = 'none';
                this.element.style.color = 'var(--SmartThemeEmColor)';
                this.element.style.fontWeight = 'normal';
            } else if (rowIndex === 0) {
                this.element.textContent = this.data.value || ''; // Column headers (A, B, C...)
                this.element.classList.add('sheet-header-cell-top');
            } else if (colIndex === 0) {
                this.element.textContent = this.data.value || rowIndex; // Row headers (1, 2, 3...)
                this.element.classList.add('sheet-header-cell-left');
                // this.element.style.border = 'none';
                // this.element.style.outline = 'none';
                this.element.style.color = 'var(--SmartThemeEmColor)';
                this.element.style.fontWeight = 'normal';
            } else {
                this.element.textContent = this.data.value || '';
                this.element.classList.add('sheet-cell-other');
                this.element.style.color = 'var(--SmartThemeEmColor)';
            }
        }
    }
    /**
     * Listen for events
     * @description Listen for events, support listening for all events, specific CellAction events, and native DOM events
     * @description If event is an `''` string, listen for all events
     * @description If event is a `CellAction` event, listen for a specific CellAction event
     * @description If event is a native `DOM` event, listen for a native DOM event
     * @param event
     * @param callback
     */
    on(event, callback) {
        if (typeof callback !== 'function') throw new Error('Callback must be a function');
        if (event === '') {
            if (!this.customEventListeners['']) {
                this.customEventListeners[''] = []; // Initialize as an array
            }
            this.customEventListeners[''].push(callback);           // Listen for all #event events
        } else if (CellAction[event]) {
            if (!this.customEventListeners[event]) {
                this.customEventListeners[event] = []; // Initialize as an array
            }
            this.customEventListeners[event].push(callback);        // Listen for specific CellAction events
        } else {
            try {
                this.element.addEventListener(event, callback); // Listen for native DOM events
            } catch (e) {
                throw new Error(`Cannot listen for event: ${event}`);
            }
        }
    }

    /** _______________________________________ The following functions are not called externally _______________________________________ */
    /** _______________________________________ The following functions are not called externally _______________________________________ */
    /** _______________________________________ The following functions are not called externally _______________________________________ */

    bridge = {

    }
    #init(target) {
        let targetUid = target?.uid || target;
        let targetCell = {};
        if (targetUid) {
            if (target.uid === targetUid) {
                targetCell = target;
            }
            else {
                targetCell = this.parent.cells.get(targetUid);
            }
            if (!targetCell) {
                throw new Error(`Cell not found, UID: ${targetUid}`);
            }
        }
        this.uid = targetCell.uid || `cell_${this.parent.uid.split('_')[1]}_${SYSTEM.generateRandomString(16)}`;
        this.coordUid = targetCell.coordUid || `coo_${SYSTEM.generateRandomString(15)}`;
        this.type = targetCell.type || CellType.cell;
        this.status = targetCell.status || '';
        this.element = targetCell.element || null;
        this.targetUid = targetCell.targetUid || '';
        this.data = targetCell.data || {};
        this.element = document.createElement('td');
    }
    #positionInParentCellSheet() {
        return this.parent.positionCache[this.uid] || [-1, -1];
    }

    #event(actionName, props = {}, isSave = true) {
        const [rowIndex, colIndex] = this.#positionInParentCellSheet();
        switch (actionName) {
            case CellAction.editCell:
                this.#handleEditCell(props);
                break;
            case CellAction.insertLeftColumn:
                if (colIndex <= 0) return;
                this.#insertColumn(colIndex - 1);
                break;
            case CellAction.insertRightColumn:
                this.#insertColumn(colIndex);
                break;
            case CellAction.insertUpRow:
                if (rowIndex <= 0) return;
                this.#insertRow(rowIndex - 1);
                break;
            case CellAction.insertDownRow:
                this.#insertRow(rowIndex);
                break;
            case CellAction.deleteSelfColumn:
                if (colIndex <= 0) return;
                this.#deleteColumn(colIndex);
                break;
            case CellAction.deleteSelfRow:
                if (rowIndex <= 0) return;
                this.#deleteRow(rowIndex);
                break;
            case CellAction.clearSheet:
                this.#clearSheet();
                break;
            default:
                console.warn(`Unhandled cell operation: ${actionName}`);
        }

        // Trigger custom event listeners
        if (this.customEventListeners[actionName]) {
            this.customEventListeners[actionName].forEach(callback => { // Iterate through and execute the callback functions in the array
                callback(this, actionName, props); // Pass the cell instance, actionName, and props
            });
        }
        if (this.customEventListeners['']) {
            this.customEventListeners[''].forEach(callback => { // Iterate through and execute the callback functions in the array
                callback(this, actionName, props); // Listen for all event listeners
            });
        }
        if (isSave) {
            this.parent.save();
        }

        console.log(`Cell operation: ${actionName} Position: ${[rowIndex, colIndex]}`);
    }
    #handleEditCell(props = {}) {
        if (!props || Object.keys(props).length === 0) {
            console.warn('No properties provided to modify');
            return;
        }
        let cell = new Cell(this.parent);
        cell.coordUid = this.coordUid;
        cell.data = { ...this.data, ...props };
        const [rowIndex, colIndex] = this.#positionInParentCellSheet()
        this.parent.cells.set(cell.uid, cell);
        console.log("cell before saving", this.parent.cellHistory);
        this.parent.cellHistory.push(cell);
        this.parent.hashSheet[rowIndex][colIndex] = cell.uid;
        this.parent.markPositionCacheDirty();
    }

    #insertRow(targetRowIndex) {
        // Use the Array.from() method to insert a new row at the targetRowIndex + 1 position in the hashSheet
        const newRow = Array.from({ length: this.parent.hashSheet[0].length }, (_, j) => {
            let cell = new Cell(this.parent); // Create a new cell
            if (j === 0) {
                // If it is the first cell of the new row (row header), set the type to row_header
                cell.type = CellType.row_header;
            }
            this.parent.cells.set(cell.uid, cell);
            this.parent.cellHistory.push(cell);
            return cell.uid;
        });
        this.parent.hashSheet.splice(targetRowIndex + 1, 0, newRow);
        this.parent.markPositionCacheDirty();
    }
    #insertColumn(colIndex) {
        // Iterate through each row and insert a new cell UID at the specified colIndex position
        this.parent.hashSheet = this.parent.hashSheet.map(row => {
            const newCell = new Cell(this.parent);
            this.parent.cells.set(newCell.uid, newCell);
            this.parent.cellHistory.push(newCell);
            row.splice(colIndex + 1, 0, newCell.uid);
            return row;
        });
        this.parent.markPositionCacheDirty();
    }
    #deleteRow(rowIndex) {
        console.log("Delete row", rowIndex, this.parent.hashSheet.length)
        if (rowIndex === 0) return;
        if (this.parent.hashSheet.length < 2) return;
        this.parent.hashSheet.splice(rowIndex, 1);
        this.parent.markPositionCacheDirty();
    }
    #deleteColumn(colIndex) {
        if (colIndex === 0) return;
        if (this.parent.hashSheet[0].length <= 2) return;
        this.parent.hashSheet = this.parent.hashSheet.map(row => {
            row.splice(colIndex, 1);
            return row;
        });
        this.parent.markPositionCacheDirty();
    }
    #clearSheet() {
        throw new Error('Method not implemented');
    }
}
