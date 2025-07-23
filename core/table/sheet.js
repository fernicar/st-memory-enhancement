import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { SheetBase } from "./base.js";
import { cellStyle, filterSavingData } from "./utils.js";
import { Cell } from "./cell.js";
/**
 * Table class, used to manage table data
 * @description The table class is used to manage table data, including the table's name, domain, type, cell data, etc.
 * @description The table class also provides operations on the table, including creating, saving, deleting, rendering, etc.
 */
export class Sheet extends SheetBase {
    constructor(target = null) {
        super(target);

        this.currentPopupMenu = null;           // Used to track the currently popped-up menu - move to Sheet (if PopupMenu still needs to be managed in Sheet)
        this.element = null;                    // Used to store the rendered table element
        this.lastCellEventHandler = null;       // Save the last used cellEventHandler
        this.template = null;       // Used to store the template
        this.#load(target);
    }

    /**
     * Render the table
     * @description Accepts the cellEventHandler parameter, provides a `Cell` object as a callback function parameter, used to handle cell events
     * @description You can get the Sheet object through `cell.parent`, so you no longer need to pass the Sheet object
     * @description If the cellEventHandler parameter is not passed, the last cellEventHandler is used
     * @param {Function} cellEventHandler
     * @param targetHashSheet
     * */
    renderSheet(cellEventHandler = this.lastCellEventHandler, targetHashSheet = this.hashSheet) {
        this.lastCellEventHandler = cellEventHandler;

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

        const tbody = document.createElement('tbody');
        this.element.appendChild(tbody);
        // Clear the content of tbody
        tbody.innerHTML = '';

        // Iterate through hashSheet to render each cell
        targetHashSheet.forEach((rowUids, rowIndex) => {
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                let cell = this.cells.get(cellUid)
                if (!cell) {
                    console.warn(`Cell not found: ${cellUid}`);
                    cell = new Cell(this); // If the corresponding cell is not found, create a new Cell instance
                    cell.uid = cellUid; // Set uid
                    cell.data = { value: '' }; // Initialize data
                    this.cells.set(cellUid, cell); // Add the newly created cell to cells
                }
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

    /**
     * Save table data
     * @returns {Sheet|boolean}
     */
    save(targetPiece = USER.getChatPiece()?.piece, manualSave = false) {
        const sheetDataToSave = this.filterSavingData()
        sheetDataToSave.template = this.template?.uid;

        let sheets = BASE.sheetsData.context ?? [];
        try {
            if (sheets.some(t => t.uid === sheetDataToSave.uid)) {
                sheets = sheets.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                sheets.push(sheetDataToSave);
            }
            BASE.sheetsData.context = sheets;
            if (!targetPiece) {
                console.log("No message can carry hash_sheets data, not saved")
                return this
            }
            if (!targetPiece.hash_sheets) targetPiece.hash_sheets = {};
            targetPiece.hash_sheets[this.uid] = this.hashSheet?.map(row => row.map(hash => hash));
            console.log('Save table data', targetPiece, this.hashSheet);
            if (!manualSave) USER.saveChat();

            return this;
        } catch (e) {
            EDITOR.error(`Failed to save template`, e.message, e);
            return false;
        }
    }

    /**
     * Create a new Sheet instance
     * @returns {Sheet} - Returns the new Sheet instance
     */
    createNewSheet(column = 2, row = 2, isSave = true) {
        this.init(column, row);     // Initialize the basic data structure
        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
        this.name = `New Table_${this.uid.slice(-4)}`;
        if (isSave) this.save();    // Save the newly created Sheet
        return this;                // Return the Sheet instance itself
    }

    /**
     * Get the prompt for the table content, you can specify parts of ['title', 'node', 'headers', 'rows', 'editRules'] to get only part of the content
     * @returns Table content prompt
     */
    getTableText(index, customParts = ['title', 'node', 'headers', 'rows', 'editRules']) {
        console.log('Get table content prompt', this)
        if (this.triggerSend && this.triggerSendDeep < 1) return ''; // If the trigger depth is 0, it will not be sent, and can be used as an information overview table
        const title = `* ${index}:${this.name}\n`;
        const node = this.source.data.note && this.source.data.note !== '' ? '【Description】' + this.source.data.note + '\n' : '';
        const headers = "rowIndex," + this.getCellsByRowIndex(0).slice(1).map((cell, index) => index + ':' + cell.data.value).join(',') + '\n';
        let rows = this.getSheetCSV()
        const editRules = this.#getTableEditRules() + '\n';
        // Add triggered table content sending, retrieve the character name in the chat content


        if (rows && this.triggerSend) {
            const chats = USER.getContext().chat;
            console.log("Enter trigger sending mode, test get chats", chats)
            // Extract the content value in all chat content
            const chat_content = getLatestChatHistory(chats, this.triggerSendDeep)
            console.log('Get chat content: ', chat_content)
            console.log("Chat content type:", typeof (chat_content))
            const rowsArray = rows.split('\n').filter(line => {
                line = line.trim();
                if (!line) return false;
                const parts = line.split(',');
                const str1 = parts?.[1] ?? ""; // string 1 corresponds to index 1
                return chat_content.includes(str1);
            });
            rows = rowsArray.join('\n');
        }
        let result = '';
        console.log('Test get table content prompt', customParts, result, this);
        if (customParts.includes('title')) {
            result += title;
        }
        if (customParts.includes('node')) {
            result += node;
        }
        if (customParts.includes('headers')) {
            result += '【Table Content】\n' + headers;
        }
        if (customParts.includes('rows')) {
            result += rows;
        }
        if (customParts.includes('editRules')) {
            result += editRules;
        }
        return result;
    }


    /**
     * Get the content data of the table (compatible with the old version)
     * @returns {string[][]} - Returns the content data of the table
     */
    getContent(withHead = false) {
        if (!withHead && this.isEmpty()) return [];
        const content = this.hashSheet.map((row) =>
            row.map((cellUid) => {
                const cell = this.cells.get(cellUid);
                if (!cell) return "";
                return cell.data.value;
            })
        );

        // Remove the first element of each row
        const trimmedContent = content.map(row => row.slice(1));
        if (!withHead) return trimmedContent.slice(1);
        return content;
    }

    getJson() {
        const sheetDataToSave = this.filterSavingData(["uid", "name", "domain", "type", "enable", "required", "tochat", "triggerSend", "triggerSendDeep", "config", "sourceData", "content"])
        delete sheetDataToSave.cellHistory
        delete sheetDataToSave.hashSheet
        sheetDataToSave.sourceData = this.source.data
        sheetDataToSave.content = this.getContent(true)
        return sheetDataToSave
    }

    getReadableJson() {
        return{
            tableName: this.name,
            tableUid: this.uid,
            columns: this.getHeader(),
            content: this.getContent()
        }
    }
    /** _______________________________________ The following functions are not called externally _______________________________________ */

    #load(target) {
        if (target == null) {
            return this;
        }
        if (typeof target === 'string') {
            let targetSheetData = BASE.sheetsData.context?.find(t => t.uid === target);
            if (targetSheetData?.uid) {
                this.loadJson(targetSheetData)
                return this;
            }
            throw new Error('Could not find corresponding template');
        }
        if (typeof target === 'object') {
            if (target.domain === SheetBase.SheetDomain.global) {
                console.log('Converting table from template', target, this);
                this.loadJson(target)
                this.domain = 'chat'
                this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
                this.name = this.name.replace('Template', 'Table');
                this.template = target;
                return this
            } else {
                this.loadJson(target)
                return this;
            }
        }
    }
    /**
     * Get table editing rule prompt
     * @returns
     */
    #getTableEditRules() {
        const source = this.source;
        if (this.required && this.isEmpty()) return '【Trigger Conditions for Add/Delete/Modify】\nInsert:' + source.data.initNode + '\n'
        else {
            let editRules = '【Trigger Conditions for Add/Delete/Modify】\n'
            if (source.data.insertNode) editRules += ('Insert:' + source.data.insertNode + '\n')
            if (source.data.updateNode) editRules += ('Update:' + source.data.updateNode + '\n')
            if (source.data.deleteNode) editRules += ('Delete:' + source.data.deleteNode + '\n')
            return editRules
        }
    }

    /**
     * Initialize hashSheet, only keep the header
     */
    initHashSheet() {
        this.hashSheet = [this.hashSheet[0].map(uid => uid)];
        this.markPositionCacheDirty();
    }

    /**
     * Get a cell from an address in "A1" format
     * @param {string} address - e.g. "A1", "B2"
     * @returns {Cell|null}
     */
    getCellFromAddress(address) {
        if (typeof address !== 'string' || !/^[A-Z]+\d+$/.test(address)) {
            return null;
        }

        const colStr = address.match(/^[A-Z]+/)[0];
        const rowStr = address.match(/\d+$/)[0];

        const row = parseInt(rowStr, 10) - 1;

        let col = 0;
        for (let i = 0; i < colStr.length; i++) {
            col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        }
        col -= 1;

        if (row < 0 || col < 0) return null;

        const cellUid = this.hashSheet?.[row]?.[col];
        return cellUid ? this.cells.get(cellUid) : null;
    }
}

/**
 * Get the chat history content of the specified depth
 * @param {Current chat file} chat
 * @param {Scan depth} deep
 * @returns string
 */
function getLatestChatHistory(chat, deep) {
    let filteredChat = chat;

    let collected = "";
    const floors = filteredChat.length
    // Traverse in reverse order from the latest record, the maximum does not exceed the maximum floor of the chat record
    for (let i = 0; i < Math.min(deep, floors); i++) {
        // Format the message and clean up the tags
        const currentStr = `${filteredChat[floors - i - 1].mes}`
            .replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
        collected += currentStr;
    }
    return collected;
}