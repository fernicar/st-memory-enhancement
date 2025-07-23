import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import {SheetBase} from "./base.js";
import {cellStyle} from "./utils.js";

export class SheetTemplate extends SheetBase {
    constructor(target = null) {
        super();
        this.domain = SheetBase.SheetDomain.global
        this.currentPopupMenu = null;           // Used to track the currently popped-up menu - move to Sheet (if PopupMenu still needs to be managed in Sheet)
        this.element = null;                    // Used to store the rendered table element
        this.lastCellEventHandler = null;       // Save the last used cellEventHandler

        this.#load(target);
    }

    /**
     * Render the table
     * @description Accepts the cellEventHandler parameter, provides a `Cell` object as a callback function parameter, used to handle cell events
     * @description You can get the Sheet object through `cell.parent`, so you no longer need to pass the Sheet object
     * @description If the cellEventHandler parameter is not passed, the last cellEventHandler is used
     * @param {Function} cellEventHandler
     * */
    renderSheet(cellEventHandler = this.lastCellEventHandler) {
        this.lastCellEventHandler = cellEventHandler;

        if (!this.element) {
            this.element = document.createElement('table');
            this.element.classList.add('sheet-table', 'tableDom');
            this.element.style.position = 'relative';
            this.element.style.display = 'flex';
            this.element.style.flexDirection = 'column';
            this.element.style.flexGrow = '0';
            this.element.style.flexShrink = '1';

            const styleElement = document.createElement('style');
            styleElement.textContent = cellStyle;
            this.element.appendChild(styleElement);
        }

        // Make sure there is a tbody in the element, if not, create one
        let tbody = this.element.querySelector('tbody');
        if (!tbody) {
            tbody = document.createElement('tbody');
            this.element.appendChild(tbody);
        }
        // Clear the content of tbody
        tbody.innerHTML = '';

        // Iterate through hashSheet to render each cell
        this.hashSheet.forEach((rowUids, rowIndex) => {
            if (rowIndex > 0) return;
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                const cell = this.cells.get(cellUid)
                const cellElement = cell.initCellRender(rowIndex, colIndex);
                rowElement.appendChild(cellElement);    // Call the initCellRender method of Cell, still need to pass rowIndex, colIndex to render the cell content
                if (cellEventHandler) {
                    cellEventHandler(cell);
                }
            });
            tbody.appendChild(rowElement); // Add rowElement to tbody
        });
        return this.element;
    }

    createNewTemplate(column = 2, row = 2, isSave = true) {
        this.init(column, row); // Initialize the basic data structure
        this.uid = `template_${SYSTEM.generateRandomString(8)}`;
        this.name = `New Template_${this.uid.slice(-4)}`;
        this.loadCells();
        isSave && this.save(); // Save the newly created Sheet
        return this; // Return the Sheet instance itself
    }

    /**
     * Save table data
     * @returns {SheetTemplate}
     */
    save(manualSave = false) {
        let templates = BASE.templates;
        if (!templates) templates = [];
        try {
            const sheetDataToSave = this.filterSavingData();
            if (templates.some(t => t.uid === sheetDataToSave.uid)) {
                templates = templates.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                templates.push(sheetDataToSave);
            }
            console.log("Saving template data", templates)
            USER.getSettings().table_database_templates = templates;
            if(!manualSave) USER.saveSettings();
            return this;
        } catch (e) {
            EDITOR.error(`Failed to save template`, e.message, e);
            return null;
        }
    }
    /**
     * Delete table data, the deletion position is determined by the domain
     * @returns {*}
     */
    delete() {
        let templates = BASE.templates;
        USER.getSettings().table_database_templates = templates.filter(t => t.uid !== this.uid);
        USER.saveSettings();
        return templates;
    }

    /** _______________________________________ The following functions are not called externally _______________________________________ */

    #load(target) {
        if (target === null) {
            // Create a new empty Sheet
            this.init();
            return this;
        }
        // Load from template library
        let targetUid = target?.uid || target;
        let targetSheetData = BASE.templates?.find(t => t.uid === targetUid);
        if (targetSheetData?.uid) {
            Object.assign(this, targetSheetData);
            this.loadCells();
            this.markPositionCacheDirty();
            return this;
        }

        throw new Error('Could not find corresponding template');
        // if (target instanceof Sheet) {
        //     // Templatize from Sheet instance
        //     this.uid = `template_${SYSTEM.generateRandomString(8)}`;
        //     this.name = target.name.replace('Table', 'Template');
        //     this.hashSheet = [target.hashSheet[0]];
        //     this.cellHistory = target.cellHistory.filter(c => this.hashSheet[0].includes(c.uid));
        //     this.loadCells();
        //     this.markPositionCacheDirty();
        //     return this;
        // } else {
        //     // Load from template library
        //     let targetUid = target?.uid || target;
        //     let targetSheetData = BASE.templates?.find(t => t.uid === targetUid);
        //     if (targetSheetData?.uid) {
        //         Object.assign(this, targetSheetData);
        //         this.loadCells();
        //         this.markPositionCacheDirty();
        //         return this;
        //     }
        //
        //     throw new Error('Could not find corresponding template');
        // }
    }

}
