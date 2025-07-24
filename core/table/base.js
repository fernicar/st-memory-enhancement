import {Cell} from "./cell.js";
import {filterSavingData} from "./utils.js";

const SheetDomain = {
    global: 'global',
    role: 'role',
    chat: 'chat',
}
const SheetType = {
    free: 'free',
    dynamic: 'dynamic',
    fixed: 'fixed',
    static: 'static',
}
const customStyleConfig = {
    mode: 'regex',
    basedOn: 'html',
    regex: '/(^[\\s\\S]*$)/g',
    replace: `$1`,
    replaceDivide: '',  // Used to temporarily store the separated CSS code
}

export class SheetBase {
    static SheetDomain = SheetDomain;
    static SheetType = SheetType;

    constructor() {
        // The following are basic properties
        this.uid = '';
        this.name = '';
        this.domain = '';
        this.type = SheetType.dynamic;
        this.enable = true;                     // Used to mark whether it is enabled
        this.required = false;                  // Used to mark whether it is required
        this.tochat = true;                     // Used to mark whether to send to chat
        this.triggerSend = false;               // Used to mark whether to trigger sending to AI
        this.triggerSendDeep = 1;               // Used to record the depth of the trigger sending

        // The following is persistent data
        this.cellHistory = [];                  // cellHistory is permanently maintained, only increasing
        this.hashSheet = [];                    // The hashSheet structure of each round, used to render the table

        this.config = {
            // The following are other properties
            toChat: true,                     // Used to mark whether to send to chat
            useCustomStyle: false,            // Used to mark whether to use custom styles
            triggerSendToChat: false,            // Used to mark whether to trigger sending to chat
            alternateTable: false,            // Used to mark whether the table participates in the alternating mode, and the original set level can be exposed at the same time
            insertTable: false,                  // Used to mark whether to insert a table, the default is false, do not insert a table
            alternateLevel: 0,                     // Used to mark whether to alternate and merge together, 0 means no alternation, greater than 0 means alternation at the same level
            skipTop: false,                     // Used to mark whether to skip the header
            selectedCustomStyleKey: '',       // Used to store the selected custom style. When selectedCustomStyleUid has no value, the default style is used
            customStyles: {'Custom Style': {...customStyleConfig}},                 // Used to store custom styles
        }

        // Temporary properties
        this.tableSheet = [];                        // Used to store table data for merging and alternating

        // The following is derived data
        this.cells = new Map();                 // cells are loaded from cellHistory every time Sheet is initialized
        this.data = new Proxy({}, {     // Used to store user-defined table data
            get: (target, prop) => {
                return this.source.data[prop];
            },
            set: (target, prop, value) => {
                this.source.data[prop] = value;
                return true;
            },
        });
        this._cellPositionCacheDirty = true;    // Used to mark whether sheetCellPosition needs to be recalculated
        this.positionCache = new Proxy(new Map(), {
            get: (map, uid) => {
                if (this._cellPositionCacheDirty || !map.has(uid)) {
                    map.clear();
                    this.hashSheet.forEach((row, rowIndex) => {
                        row.forEach((cellUid, colIndex) => {
                            map.set(cellUid, [rowIndex, colIndex]);
                        });
                    });
                    this._cellPositionCacheDirty = false;   // Update completed, mark as clean
                    console.log('Recalculate positionCache: ', map);
                }
                return map.get(uid);
            },
        });
    }
    get source() {
        return this.cells.get(this.hashSheet[0][0]);
    }

    markPositionCacheDirty() {
        this._cellPositionCacheDirty = true;
        // console.log(`Mark the positionCache of Sheet: ${this.name} (${this.uid}) as dirty`);
    }

    init(column = 2, row = 2) {
        this.cells = new Map();
        this.cellHistory = [];
        this.hashSheet = [];

        // Initialize hashSheet structure
        const r = Array.from({ length: row }, (_, i) => Array.from({ length: column }, (_, j) => {
            let cell = new Cell(this);
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);
            if (i === 0 && j === 0) {
                cell.type = Cell.CellType.sheet_origin;
            } else if (i === 0) {
                cell.type = Cell.CellType.column_header;
            } else if (j === 0) {
                cell.type = Cell.CellType.row_header;
            }
            return cell.uid;
        }));
        this.hashSheet = r;

        return this;
    };

    rebuildHashSheetByValueSheet(valueSheet) {
        const cols = valueSheet[0].length
        const rows = valueSheet.length
        const newHashSheet = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => {
            const cell = new Cell(this);
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);
            cell.data.value = valueSheet[i][j] || ''; // Set the value of the cell
            if (i === 0 && j === 0) {
                cell.type = Cell.CellType.sheet_origin;
            } else if (i === 0) {
                cell.type = Cell.CellType.column_header;
            } else if (j === 0) {
                cell.type = Cell.CellType.row_header;
            }
            return cell.uid;
        }));
        this.hashSheet = newHashSheet
        return this
    }

    loadJson(json) {
        Object.assign(this, JSON.parse(JSON.stringify(json)));
        if(this.cellHistory.length > 0) this.loadCells()
        if(this.content) this.rebuildHashSheetByValueSheet(this.content)
        if(this.sourceData) this.source.data = this.sourceData

        this.markPositionCacheDirty();
    }

    getCellTypeByPosition(rowIndex, colIndex) {
        if (rowIndex === 0 && colIndex === 0) {
            return Cell.CellType.sheet_origin;
        }
        if (rowIndex === 0) {
            return Cell.CellType.column_header;
        }
        if (colIndex === 0) {
            return Cell.CellType.row_header;
        }
        return Cell.CellType.cell;
    }

    loadCells() {
        // Traverse and load Cell objects from cellHistory
        try {
            this.cells = new Map(); // Initialize cells Map
            this.cellHistory?.forEach(c => { // Load Cell objects from cellHistory
                const cell = new Cell(this);
                Object.assign(cell, c);
                this.cells.set(cell.uid, cell);
            });
        } catch (e) {
            console.error(`Failed to load: ${e}`);
            return false;
        }

        // Re-mark cell types
        try {
            if (this.hashSheet && this.hashSheet.length > 0) {
                this.hashSheet.forEach((rowUids, rowIndex) => {
                    rowUids.forEach((cellUid, colIndex) => {
                        let cell = this.cells.get(cellUid);
                        if (!cell) {
                            cell = new Cell(this);
                            cell.uid = cellUid;
                            cell.data.value = 'Empty data'
                            this.cells.set(cell.uid, cell);
                        }
                        if (rowIndex === 0 && colIndex === 0) {
                            cell.type = Cell.CellType.sheet_origin;
                        } else if (rowIndex === 0) {
                            cell.type = Cell.CellType.column_header;
                        } else if (colIndex === 0) {
                            cell.type = Cell.CellType.row_header;
                        } else {
                            cell.type = Cell.CellType.cell;
                        }
                    });
                });
            }
        } catch (e) {
            console.error(`Failed to load: ${e}`);
            return false;
        }
    }

    findCellByValue(value, cellType = null) {
        const cell = this.cellHistory.find(cell => cell.data.value === value && (cellType === null || cell.type === cellType));
        if (!cell) {
            return null;
        }
        return cell;
    }

    findCellByPosition(rowIndex, colIndex) {
        if (rowIndex < 0 || colIndex < 0 || rowIndex >= this.hashSheet.length || colIndex >= this.hashSheet[0].length) {
            console.warn('Invalid row or column index');
            return null;
        }
        const hash = this.hashSheet[rowIndex][colIndex]
        const target = this.cells.get(hash) || null;
        if (!target) {
            const cell = new Cell(this);
            cell.data.value = 'Empty data';
            cell.type = colIndex === 0 ? Cell.CellType.row_header : rowIndex === 0 ? Cell.CellType.column_header : Cell.CellType.cell;
            cell.uid = hash;
            this.cells.set(cell.uid, cell);
            return cell;
        }
        console.log('Found cell',target);
        return target;
    }
    /**
     * Get all cells in a row by row number
     * @param {number} rowIndex
     * @returns cell[]
     */
    getCellsByRowIndex(rowIndex) {
        if (rowIndex < 0 || rowIndex >= this.hashSheet.length) {
            console.warn('Invalid row index');
            return null;
        }
        return this.hashSheet[rowIndex].map(uid => this.cells.get(uid));
    }
    /**
     * Get the content of the table in csv format
     * @returns
     */
    getSheetCSV( removeHeader = true,key = 'value') {
        if (this.isEmpty()) return '(This table is currently empty)\n'
        console.log("Test get map", this.cells)
        const content = this.hashSheet.slice(removeHeader?1:0).map((row, index) => row.map(cellUid => {
            const cell = this.cells.get(cellUid)
            if (!cell) return ""
            return cell.type === Cell.CellType.row_header ? index : cell.data[key]
        }).join(',')).join('\n');
        return content + "\n";
    }
    /**
     * Is the table empty?
     * @returns Is it empty?
     */
    isEmpty() {
        return this.hashSheet.length <= 1;
    }

    filterSavingData(key, withHead = false) {
        return filterSavingData(this, key, withHead)
    }

    getRowCount() {
        return this.hashSheet.length;
    }

    /**
     * Get the header array (compatible with old data)
     * @returns {string[]} Header array
     */
    getHeader() {
        const header = this.hashSheet[0].slice(1).map(cellUid => {
            const cell = this.cells.get(cellUid);
            return cell ? cell.data.value : '';
        });
        return header;
    }
}
