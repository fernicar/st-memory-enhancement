import { APP, BASE, DERIVED, EDITOR, SYSTEM, USER } from './core/manager.js';
import { openTableRendererPopup, updateSystemMessageTableStatus } from "./scripts/renderer/tablePushToChat.js";
import { loadSettings } from "./scripts/settings/userExtensionSetting.js";
import { ext_getAllTables, ext_exportAllTablesAsJson } from './scripts/settings/standaloneAPI.js';
import { openTableDebugLogPopup } from "./scripts/settings/devConsole.js";
import { TableTwoStepSummary } from "./scripts/runtime/separateTableUpdate.js";
import { initTest } from "./components/_fotTest.js";
import { initAppHeaderTableDrawer, openAppHeaderTableDrawer } from "./scripts/renderer/appHeaderTableBaseDrawer.js";
import { initRefreshTypeSelector } from './scripts/runtime/absoluteRefresh.js';
import {refreshTempView, updateTableContainerPosition} from "./scripts/editor/tableTemplateEditView.js";
import { functionToBeRegistered } from "./services/debugs.js";
import { parseLooseDict, replaceUserTag } from "./utils/stringUtil.js";
import {executeTranslation} from "./services/translate.js";
import applicationFunctionManager from "./services/appFuncManager.js"
import {SheetBase} from "./core/table/base.js";
import { Cell } from "./core/table/cell.js";


console.log("______________________Memory Plugin: Start Loading______________________")

const VERSION = '2.2.0'

const editErrorInfo = {
    forgotCommentTag: false,
    functionNameError: false,
}

/**
 * Fix incorrect escaped single quotes in the value
 * @param {*} value
 * @returns
 */
function fixUnescapedSingleQuotes(value) {
    if (typeof value === 'string') {
        return value.replace(/\\'/g, "'");
    }
    if (typeof value === 'object' && value !== null) {
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                value[key] = fixUnescapedSingleQuotes(value[key]);
            }
        }
    }
    return value;
}

/**
 * Find table structure by table index
 * @param {number} index Table index
 * @returns The table structure for this index
 */
export function findTableStructureByIndex(index) {
    return USER.tableBaseSetting.tableStructure[index];
}

/**
 * Check if the data is a Sheet instance, if not, convert it to a new Sheet instance
 * @param {Object[]} dataTable Array of all table objects
 */
function checkPrototype(dataTable) {
    // The old Table instance checking logic has been removed
    // Now using the new Sheet class to process table data
    // This function is kept for compatibility with old code calls, but the internal logic has been updated
    return dataTable;
}

export function buildSheetsByTemplates(targetPiece) {
    BASE.sheetsData.context = [];
    // USER.getChatPiece().hash_sheets = {};
    const templates = BASE.templates
    templates.forEach(template => {
        if(template.enable === false) return

        // Check template structure
        if (!template || !template.hashSheet || !Array.isArray(template.hashSheet) || template.hashSheet.length === 0 || !Array.isArray(template.hashSheet[0]) || !template.cellHistory || !Array.isArray(template.cellHistory)) {
            console.error(`[Memory Enhancement] Encountered invalid template structure in buildSheetsByTemplates (missing hashSheet or cellHistory). Skipping template:`, template);
            return; // Skip processing this template
        }
        try {
            const newSheet = BASE.createChatSheetByTemp(template);
            newSheet.save(targetPiece);
        } catch (error) {
            EDITOR.error(`[Memory Enhancement] Error creating or saving sheet from template:`, error.message, error);
        }
    })
    BASE.updateSelectBySheetStatus()
    USER.saveChat()
}

/**
 * Convert old tables to sheets
 * @param {DERIVED.Table[]} oldTableList Old table data
 */
export function convertOldTablesToNewSheets(oldTableList, targetPiece) {
    //USER.getChatPiece().hash_sheets = {};
    const sheets = []
    for (const oldTable of oldTableList) {
        const valueSheet = [oldTable.columns, ...oldTable.content].map(row => ['', ...row])
        const cols = valueSheet[0].length
        const rows = valueSheet.length
        const targetSheetUid = BASE.sheetsData.context.find(sheet => sheet.name === oldTable.tableName)?.uid
        if (targetSheetUid) {
            // If the table already exists, update the table data
            const targetSheet = BASE.getChatSheet(targetSheetUid)
            console.log("Table already exists, updating table data", targetSheet)
            targetSheet.rebuildHashSheetByValueSheet(valueSheet)
            targetSheet.save(targetPiece)
            addOldTablePrompt(targetSheet)
            sheets.push(targetSheet)
            continue
        }
        // If the table does not exist, create a new table
        const newSheet = BASE.createChatSheet(cols, rows);
        newSheet.name = oldTable.tableName
        newSheet.domain = SheetBase.SheetDomain.chat
        newSheet.type = newSheet.SheetType.dynamic
        newSheet.enable = oldTable.enable
        newSheet.required = oldTable.Required
        newSheet.tochat = true
        newSheet.triggerSend = false
        newSheet.triggerSendDeep = 1

        addOldTablePrompt(newSheet)
        newSheet.data.description = `${oldTable.note}\n${oldTable.initNode}\n${oldTable.insertNode}\n${oldTable.updateNode}\n${oldTable.deleteNode}`

        valueSheet.forEach((row, rowIndex) => {
            row.forEach((value, colIndex) => {
                const cell = newSheet.findCellByPosition(rowIndex, colIndex)
                cell.data.value = value
            })
        })

        newSheet.save(targetPiece)
        sheets.push(newSheet)
    }
    // USER.saveChat()
    console.log("Converting old table data to new table data", sheets)
    return sheets
}

/**
 * Add prompts from the old table structure to the new table
 * @param {*} sheet Table object
 */
function addOldTablePrompt(sheet) {
    const tableStructure = USER.tableBaseSetting.tableStructure.find(table => table.tableName === sheet.name)
    console.log("Adding old table prompts", tableStructure, USER.tableBaseSetting.tableStructure, sheet.name)
    if (!tableStructure) return false
    const source = sheet.source
    source.required = tableStructure.Required
    source.data.initNode = tableStructure.initNode
    source.data.insertNode = tableStructure.insertNode
    source.data.updateNode = tableStructure.updateNode
    source.data.deleteNode = tableStructure.deleteNode
    source.data.note = tableStructure.note
}

/**
 * Find the next message containing table data, return null if not found
 * @param startIndex The starting index for the search
 * @param isIncludeStartIndex Whether to include the start index
 * @returns The found message data
 */
export function findNextChatWhitTableData(startIndex, isIncludeStartIndex = false) {
    if (startIndex === -1) return { index: - 1, chat: null }
    const chat = USER.getContext().chat
    for (let i = isIncludeStartIndex ? startIndex : startIndex + 1; i < chat.length; i++) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { index: i, chat: chat[i] }
        }
    }
    return { index: - 1, chat: null }
}

/**
 * Search for the last message containing table data and generate a prompt
 * @returns The complete generated prompt
 */
export function initTableData(eventData) {
    const allPrompt = USER.tableBaseSetting.message_template.replace('{{tableData}}', getTablePrompt(eventData))
    const promptContent = replaceUserTag(allPrompt)  // Replace all <user> tags
    console.log("Complete prompt", promptContent)
    return promptContent
}

/**
 * Get table-related prompts
 * @returns {string} Table-related prompts
 */
export function getTablePrompt(eventData, isPureData = false) {
    const lastSheetsPiece = BASE.getReferencePiece()
    if(!lastSheetsPiece) return ''
    console.log("Retrieved reference table data", lastSheetsPiece)
    return getTablePromptByPiece(lastSheetsPiece, isPureData)
}

/**
 * Get table-related prompts from a piece
 * @param {Object} piece Chat piece
 * @returns {string} Table-related prompts
 */
export function getTablePromptByPiece(piece, isPureData = false) {
    const {hash_sheets} = piece
    const sheets = BASE.hashSheetsToSheets(hash_sheets)
        .filter(sheet => sheet.enable)
        .filter(sheet => sheet.sendToContext !== false);
    console.log("Information while building prompt (filtered)", hash_sheets, sheets)
    const customParts = isPureData ? ['title', 'headers', 'rows'] : ['title', 'node', 'headers', 'rows', 'editRules'];
    const sheetDataPrompt = sheets.map((sheet, index) => sheet.getTableText(index, customParts, piece)).join('\n')
    return sheetDataPrompt
}

/**
 * Convert the matched whole string into an array of single statements
 * @param {string[]} matches The matched whole string
 * @returns Array of single execution statements
 */
function handleTableEditTag(matches) {
    const functionRegex = /(updateRow|insertRow|deleteRow)\(/g;
    let A = [];
    let match;
    let positions = [];
    matches.forEach(input => {
        while ((match = functionRegex.exec(input)) !== null) {
            positions.push({
                index: match.index,
                name: match[1].replace("Row", "") // Convert to update/insert/delete
            });
        }

        // Merge function fragments and positions
        for (let i = 0; i < positions.length; i++) {
            const start = positions[i].index;
            const end = i + 1 < positions.length ? positions[i + 1].index : input.length;
            const fullCall = input.slice(start, end);
            const lastParenIndex = fullCall.lastIndexOf(")");

            if (lastParenIndex !== -1) {
                const sliced = fullCall.slice(0, lastParenIndex); // Remove the last )
                const argsPart = sliced.slice(sliced.indexOf("(") + 1);
                const args = argsPart.match(/("[^"]*"|\{.*\}|[0-9]+)/g)?.map(s => s.trim());
                if(!args) continue
                A.push({
                    type: positions[i].name,
                    param: args,
                    index: positions[i].index,
                    length: end - start
                });
            }
        }
    });
    return A;
}

/**
 * Check if the table edit string has changed
 * @param {Chat} chat Single chat object
 * @param {string[]} matches New matched object
 * @returns
 */
function isTableEditStrChanged(chat, matches) {
    if (chat.tableEditMatches != null && chat.tableEditMatches.join('') === matches.join('')) {
        return false
    }
    chat.tableEditMatches = matches
    return true
}

/**
 * Clear all empty rows in the table
 */
function clearEmpty() {
    DERIVED.any.waitingTable.forEach(table => {
        table.clearEmpty()
    })
}



/**
 * Handle table edit events within the text
 * @param {Chat} chat Single chat object
 * @param {number} mesIndex Index of the message to be modified
 * @param {boolean} ignoreCheck Whether to skip the duplicity check
 * @returns
 */
export function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    parseTableEditTag(chat, mesIndex, ignoreCheck)
    updateSystemMessageTableStatus();   // New code, update the table data status to the system message
    //executeTableEditTag(chat, mesIndex)
}

/**
 * Parse table edit tags in the reply
 * @param {*} piece Single chat object
 * @param {number} mesIndex Index of the message to be modified
 * @param {boolean} ignoreCheck Whether to skip the duplicity check
 */
export function parseTableEditTag(piece, mesIndex = -1, ignoreCheck = false) {
    const { matches } = getTableEditTag(piece.mes)
    if (!ignoreCheck && !isTableEditStrChanged(piece, matches)) return false
    const tableEditActions = handleTableEditTag(matches)
    tableEditActions.forEach((action, index) => tableEditActions[index].action = classifyParams(formatParams(action.param)))
    console.log("Parsed table edit commands", tableEditActions)

    // Get the previous table data
    const { piece: prePiece } = mesIndex === -1 ? BASE.getLastSheetsPiece(1) : BASE.getLastSheetsPiece(mesIndex - 1, 1000, false)
    const sheets = BASE.hashSheetsToSheets(prePiece.hash_sheets).filter(sheet => sheet.enable)
    console.log("Information when executing commands", sheets)
    for (const EditAction of sortActions(tableEditActions)) {
        executeAction(EditAction, sheets)
    }
    sheets.forEach(sheet => sheet.save(piece, true))
    console.log("Chat template:", BASE.sheetsData.context)
    console.log("Retrieved table data", prePiece)
    console.log("Test total chat", USER.getContext().chat)
    return true
}

/**
 * Execute operations directly through edit command strings
 * @param {string[]} matches Edit command strings
 */
export function executeTableEditActions(matches, referencePiece) {
    const tableEditActions = handleTableEditTag(matches)
    tableEditActions.forEach((action, index) => tableEditActions[index].action = classifyParams(formatParams(action.param)))
    console.log("Parsed table edit commands", tableEditActions)

    // Core fix: No longer trust the incoming referencePiece.hash_sheets, but directly get the currently active, unique Sheet instance from BASE.
    const sheets = BASE.getChatSheets().filter(sheet => sheet.enable)
    if (!sheets || sheets.length === 0) {
        console.error("executeTableEditActions: No enabled table instances found, operation aborted.");
        return false;
    }

    console.log("Information during command execution (from BASE.getChatSheets)", sheets)
    for (const EditAction of sortActions(tableEditActions)) {
        executeAction(EditAction, sheets)
    }
    
    // Core fix: Ensure modifications are saved to the latest chat piece.
    const { piece: currentPiece } = USER.getChatPiece();
    if (!currentPiece) {
        console.error("executeTableEditActions: Unable to get current chat piece, save operation failed.");
        return false;
    }
    sheets.forEach(sheet => sheet.save(currentPiece, true))

    console.log("Chat template:", BASE.sheetsData.context)
    console.log("Test total chat", USER.getContext().chat)
    return true // Return true to indicate success
}

/**
 * Execute a single action command
 */
function executeAction(EditAction, sheets) {
    const action = EditAction.action
    const sheet = sheets[action.tableIndex]
    if (!sheet) {
        console.error("Table does not exist, cannot perform edit operation", EditAction);
        return -1;
    }

    // Deep clean action.data before all operations
    if (action.data) {
        action.data = fixUnescapedSingleQuotes(action.data);
    }
    switch (EditAction.type) {
        case 'update':
            // Execute update operation
            const rowIndex = action.rowIndex ? parseInt(action.rowIndex):0
            if(rowIndex >= sheet.getRowCount()-1) return executeAction({...EditAction, type:'insert'}, sheets)
            if(!action?.data) return
            Object.entries(action.data).forEach(([key, value]) => {
                const cell = sheet.findCellByPosition(rowIndex + 1, parseInt(key) + 1)
                if (!cell) return -1
                cell.newAction(Cell.CellAction.editCell, { value }, false)
            })
            break
        case 'insert': {
            // Execute insert operation
            const cell = sheet.findCellByPosition(sheet.getRowCount() - 1, 0)
            if (!cell) return -1
            cell.newAction(Cell.CellAction.insertDownRow, {}, false)
            const lastestRow = sheet.getRowCount() - 1
            const cells = sheet.getCellsByRowIndex(lastestRow)
            if(!cells || !action.data) return
            cells.forEach((cell, index) => {
                if (index === 0) return 
                cell.data.value = action.data[index - 1]
            })
        }
            break
        case 'delete':
            // Execute delete operation
            const deleteRow = parseInt(action.rowIndex) + 1
            const cell = sheet.findCellByPosition(deleteRow, 0)
            if (!cell) return -1
            cell.newAction(Cell.CellAction.deleteSelfRow, {}, false)
            break
    }
    console.log("Executing table edit operation", EditAction)
    return 1
}


/**
 * Sort actions
 * @param {Object[]} actions Actions to be sorted
 * @returns Sorted actions
 */
function sortActions(actions) {
    // Define sort priority
    const priority = {
        update: 0,
        insert: 1,
        delete: 2
    };
    return actions.sort((a, b) => (priority[a.type] === 2 && priority[b.type] === 2) ? (b.action.rowIndex - a.action.rowIndex) : (priority[a.type] - priority[b.type]));
}

/**
 * Format parameters
 * @description Converts strings in the parameter array to numbers or objects
 * @param {string[]} paramArray
 * @returns
 */
function formatParams(paramArray) {
    return paramArray.map(item => {
        const trimmed = item.trim();
        if (!isNaN(trimmed) && trimmed !== "") {
            return Number(trimmed);
        }
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const parsed = parseLooseDict(trimmed);
            if (typeof parsed === 'object' && parsed !== null) {
                Object.keys(parsed).forEach(key => {
                    if (!/^\d+$/.test(key)) {
                        delete parsed[key];
                    }
                });
            }
            return parsed;
        }

        // Return a string in all other cases
        return trimmed;
    });
}

/**
 * Classify parameters
 * @param {string[]} param Parameters
 * @returns {Object} Classified parameter object
 */
function classifyParams(param) {
    const action = {};
    for (const key in param) {
        if (typeof param[key] === 'number') {
            if (key === '0') action.tableIndex = param[key]
            else if (key === '1') action.rowIndex = param[key]
        } else if (typeof param[key] === 'object') {
            action.data = param[key]
        }
    }
    return action
}

/**
 * Execute the edit tag in the reply
 * @param {Chat} chat Single chat object
 * @param {number} mesIndex Index of the message to be modified
 */
function executeTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {

    // If it is not the latest message, update the following tables
    if (mesIndex !== -1) {
        const { index, chat: nextChat } = findNextChatWhitTableData(mesIndex)
        if (index !== -1) handleEditStrInMessage(nextChat, index, true)
    }
}

/**
 * Dry run to get the insertion position of the insert action and the content of the table insertion update
 */
function dryRunExecuteTableEditTag() {
    // TODO Use the new Sheet system to handle table editing
}

/**
 * Get the generated operation function string
 * @returns The generated operation function string
 */
export function getTableEditActionsStr() {
    const tableEditActionsStr = DERIVED.any.tableEditActions.filter(action => action.able && action.type !== 'Comment').map(tableEditAction => tableEditAction.format()).join('\n')
    return "\n<!--\n" + (tableEditActionsStr === '' ? '' : (tableEditActionsStr + '\n')) + '-->\n'
}

/**
 * Replace the content within the TableEdit tag in the chat
 * @param {*} chat Chat object
 */
export function replaceTableEditTag(chat, newContent) {
    // Process mes
    if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.mes)) {
        chat.mes = chat.mes.replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>${newContent}</tableEdit>`);
    } else {
        chat.mes += `\n<tableEdit>${newContent}</tableEdit>`;
    }
    // Process swipes
    if (chat.swipes != null && chat.swipe_id != null)
        if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.swipes[chat.swipe_id])) {
            chat.swipes[chat.swipe_id] = chat.swipes[chat.swipe_id].replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>\n${newContent}\n</tableEdit>`);
        } else {
            chat.swipes[chat.swipe_id] += `\n<tableEdit>${newContent}</tableEdit>`;
        }
    USER.getContext().saveChat();
}

/**
 * Read the injected role from the settings
 * @returns Injected role
 */
function getMesRole() {
    switch (USER.tableBaseSetting.injection_mode) {
        case 'deep_system':
            return 'system'
        case 'deep_user':
            return 'user'
        case 'deep_assistant':
            return 'assistant'
    }
}

/**
 * Inject overall table prompt
 * @param {*} eventData
 * @returns
 */
async function onChatCompletionPromptReady(eventData) {
    try {
        // Prioritize handling the step-by-step form filling mode
        if (USER.tableBaseSetting.step_by_step === true) {
            // Inject only when the plugin and AI table reading function are enabled
            if (USER.tableBaseSetting.isExtensionAble === true && USER.tableBaseSetting.isAiReadTable === true) {
                const tableData = getTablePrompt(eventData, true); // Get pure data
                if (tableData) { // Ensure there is content to inject
                    const finalPrompt = `The following is the current scene information and historical record information recorded through the table, you need to use this as a reference for your thinking:\n${tableData}`;
                    if (USER.tableBaseSetting.deep === 0) {
                        eventData.chat.push({ role: getMesRole(), content: finalPrompt });
                    } else {
                        eventData.chat.splice(-USER.tableBaseSetting.deep, 0, { role: getMesRole(), content: finalPrompt });
                    }
                    console.log("Step-by-step form filling mode: Injecting read-only table data", eventData.chat);
                }
            }
            return; // Exit directly after processing the step-by-step mode, do not perform subsequent regular injection
        }

        // Injection logic for normal mode
        if (eventData.dryRun === true ||
            USER.tableBaseSetting.isExtensionAble === false ||
            USER.tableBaseSetting.isAiReadTable === false ||
            USER.tableBaseSetting.injection_mode === "injection_off") {
            return;
        }

        console.log("Before generating prompt", USER.getContext().chat)
        const promptContent = initTableData(eventData)
        if (USER.tableBaseSetting.deep === 0)
            eventData.chat.push({ role: getMesRole(), content: promptContent })
        else
            eventData.chat.splice(-USER.tableBaseSetting.deep, 0, { role: getMesRole(), content: promptContent })

        updateSheetsView()
    } catch (error) {
        EDITOR.error(`Memory plugin: Table data injection failed\nReason: `,error.message, error);
    }
    console.log("Injecting overall table prompt", eventData.chat)
}

/**
  * Macro to get prompt
  */
function getMacroPrompt() {
    try {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiReadTable === false) return ""
        if (USER.tableBaseSetting.step_by_step === true) {
            const promptContent = replaceUserTag(getTablePrompt(undefined, true))
            return `The following is the current scene information and historical record information recorded through the table, you need to use this as a reference for your thinking:\n${promptContent}`
        }
        const promptContent = initTableData()
        return promptContent
    }catch (error) {
        EDITOR.error(`Memory plugin: Macro prompt injection failed\nReason: `, error.message, error);
        return ""
    }
}

/**
  * Macro to get table prompt
  */
function getMacroTablePrompt() {
    try {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiReadTable === false) return ""
        if(USER.tableBaseSetting.step_by_step === true){
            const promptContent = replaceUserTag(getTablePrompt(undefined, true))
            return promptContent
        }
        const promptContent = replaceUserTag(getTablePrompt())
        return promptContent
    }catch (error) {
        EDITOR.error(`Memory plugin: Macro prompt injection failed\nReason: `, error.message, error);
        return ""
    }
}

/**
 * Remove spaces and comment tags from both ends of the edit command string
 * @param {string} str The input edit command string
 * @returns
 */
function trimString(str) {
    const str1 = str.trim()
    if (!str1.startsWith("<!--") || !str1.endsWith("-->")) {
        editErrorInfo.forgotCommentTag = true
    }
    return str1
        .replace(/^\s*<!--|-->?\s*$/g, "")
        .trim()
}

/**
 * Get the content within the tableEdit tag of the table
 * @param {string} mes Message body string
 * @returns {matches} Array of matched content
 */

export function getTableEditTag(mes) {
    const regex = /<tableEdit>(.*?)<\/tableEdit>/gs;
    const matches = [];
    let match;
    while ((match = regex.exec(mes)) !== null) {
        matches.push(match[1]);
    }
    const updatedText = mes.replace(regex, "");
    return { matches }
}

/**
 * Triggered when a message is edited
 * @param this_edit_mes_id The ID of this message
 */
async function onMessageEdited(this_edit_mes_id) {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === true) return
    const chat = USER.getContext().chat[this_edit_mes_id]
    if (chat.is_user === true || USER.tableBaseSetting.isAiWriteTable === false) return
    try {
        handleEditStrInMessage(chat, parseInt(this_edit_mes_id))
    } catch (error) {
        EDITOR.error("Memory plugin: Table editing failed\nReason: ", error.message, error)
    }
    updateSheetsView()
}

/**
 * Triggered when a message is received
 * @param {number} chat_id The ID of this message
 */
async function onMessageReceived(chat_id) {
    if (USER.tableBaseSetting.isExtensionAble === false) return
    if (USER.tableBaseSetting.step_by_step === true && USER.getContext().chat.length > 2) {
        TableTwoStepSummary("auto");  // Do not use await, otherwise it will cause a chain of bugs due to main process blocking
    } else {
        if (USER.tableBaseSetting.isAiWriteTable === false) return
        const chat = USER.getContext().chat[chat_id];
        console.log("Received message", chat_id)
        try {
            handleEditStrInMessage(chat)
        } catch (error) {
            EDITOR.error("Memory plugin: Automatic table change failed\nReason: ", error.message, error)
        }
    }

    updateSheetsView()
}

/**
 * Resolve all {{GET::...}} macros in a string
 * @param {string} text - The text to parse
 * @returns {string} - The text after resolving and replacing macros
 */
function resolveTableMacros(text) {
    if (typeof text !== 'string' || !text.includes('{{GET::')) {
        return text;
    }

    return text.replace(/{{GET::\s*([^:]+?)\s*:\s*([A-Z]+\d+)\s*}}/g, (match, tableName, cellAddress) => {
        const sheets = BASE.getChatSheets();
        const targetTable = sheets.find(t => t.name.trim() === tableName.trim());

        if (!targetTable) {
            return `<span style="color: red">[GET: Table not found "${tableName}"]</span>`;
        }

        try {
            const cell = targetTable.getCellFromAddress(cellAddress);
            const cellValue = cell ? cell.data.value : undefined;
            return cellValue !== undefined ? cellValue : `<span style="color: orange">[GET: Cell not found "${cellAddress}" in "${tableName}"]</span>`;
        } catch (error) {
            console.error(`Error resolving GET macro for ${tableName}:${cellAddress}`, error);
            return `<span style="color: red">[GET: Error during processing]</span>`;
        }
    });
}

/**
 * Triggered when the chat changes
 */
async function onChatChanged() {
    try {
        // Update table view
        updateSheetsView();

        // Render macros in chat messages
        document.querySelectorAll('.mes_text').forEach(mes => {
            if (mes.dataset.macroProcessed) return;

            const originalHtml = mes.innerHTML;
            const newHtml = resolveTableMacros(originalHtml);

            if (originalHtml !== newHtml) {
                mes.innerHTML = newHtml;
                mes.dataset.macroProcessed = true;
            }
        });

    } catch (error) {
        EDITOR.error("Memory plugin: Failed to process chat change\nReason: ", error.message, error)
    }
}


/**
 * Swipe message event
 */
async function onMessageSwiped(chat_id) {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiWriteTable === false) return
    const chat = USER.getContext().chat[chat_id];
    console.log("Swiping message", chat)
    if (!chat.swipe_info[chat.swipe_id]) return
    try {
        handleEditStrInMessage(chat)
    } catch (error) {
        EDITOR.error("Memory plugin: swipe toggle failed\nReason: ", error.message, error)
    }

    updateSheetsView()
}

/**
 * Restore the specified number of layers of the table
 */
export async function undoSheets(deep) {
    const {piece, deep:findDeep} = BASE.getLastSheetsPiece(deep)
    if(findDeep === -1) return 
    console.log("Reverting table data", piece, findDeep)
    handleEditStrInMessage(piece, findDeep, true)
    updateSheetsView()
}

/**
 * Update the new table view
 * @description Updates the table view using the new Sheet system
 * @returns {Promise<*[]>}
 */
async function updateSheetsView(mesId) {
    try{
       // Refresh the table view
        console.log("========================================\nUpdating table view")
        refreshTempView(true)
        console.log("========================================\nUpdating table content view")
        BASE.refreshContextView(mesId)

        // Update the table status in the system message
        updateSystemMessageTableStatus(); 
    }catch (error) {
        EDITOR.error("Memory plugin: Failed to update table view\nReason: ", error.message, error)
    }
}

/**
 * Open table drawer
 */
export function openDrawer() {
    const drawer = $('#table_database_settings_drawer .drawer-toggle')
    if (isDrawerNewVersion()) {
        applicationFunctionManager.doNavbarIconClick.call(drawer)
    }else{
        return openAppHeaderTableDrawer()
    }
}

/**
 * Get whether it is a new or old version of the drawer
 */
export function isDrawerNewVersion() {
    return !!applicationFunctionManager.doNavbarIconClick
}

jQuery(async () => {
    // Register API
    window.stMemoryEnhancement = {
        ext_getAllTables,
        ext_exportAllTablesAsJson,
        VERSION,
    };

    // Version check
    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: VERSION, user: USER.getContext().name1 })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) {
                $("#tableUpdateTag").show()
                $("#setting_button_new_tag").show() // Show the New tag for the settings button
            }
            if (res.toastr) EDITOR.warning(res.toastrText)
            if (res.message) $("#table_message_tip").html(res.message)
        }
    })

    $('.extraMesButtons').append('<div title="View Table" class="mes_button open_table_by_id">Table</div>');

    // Separate mobile and desktop events
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        console.log("Mobile")
        // Mobile events
    } else {
        console.log("Desktop")
        // Desktop events
        initTest();
    }

    // Start adding the root DOM for each part
    // Add table editing toolbar
    $('#translation_container').after(await SYSTEM.getTemplate('index'));
    // Add top table management tool pop-up
    $('#extensions-settings-button').after(await SYSTEM.getTemplate('appHeaderTableDrawer'));

    // Load settings on application startup
    loadSettings();

    // Table pop-up window
    $(document).on('click', '.open_table_by_id', function () {
        const messageId = parseInt($(this).closest('.mes').attr('mesid'))
        if (USER.getContext().chat[messageId].is_user === true) {
            toastr.warning('User messages do not support table editing')
            return
        }
        BASE.refreshContextView(messageId)
        openDrawer()
    })

    // Register macro
    USER.getContext().registerMacro("tablePrompt", () =>getMacroPrompt())
    USER.getContext().registerMacro("tableData", () =>getMacroTablePrompt())
    USER.getContext().registerMacro("GET_ALL_TABLES_JSON", () => {
        try {
            const jsonData = ext_exportAllTablesAsJson();
            if (Object.keys(jsonData).length === 0) {
                return "{}"; // If there is no data, return an empty JSON object
            }
            // Return the JSON string without extra formatting for direct use in code
            return JSON.stringify(jsonData);
        } catch (error) {
            console.error("GET_ALL_TABLES_JSON macro execution error:", error);
            EDITOR.error("Error exporting all table data.","",error);
            return "{}"; // Return an empty JSON object on error
        }
    });

    // Set table edit button
    console.log("Set table edit button", applicationFunctionManager.doNavbarIconClick)
    if (isDrawerNewVersion()) {
        $('#table_database_settings_drawer .drawer-toggle').on('click', applicationFunctionManager.doNavbarIconClick);
    }else{
        $('#table_drawer_content').attr('data-slide-toggle', 'hidden').css('display', 'none');
        $('#table_database_settings_drawer .drawer-toggle').on('click', openAppHeaderTableDrawer);
    }
    // // Set table edit button
    // $(document).on('click', '.tableEditor_editButton', function () {
    //     let index = $(this).data('index'); // Get the index of the currently clicked item
    //     openTableSettingPopup(index);
    // })
    // Click the table render style settings button
    $(document).on('click', '.tableEditor_renderButton', function () {
        openTableRendererPopup();
    })
    // Click to open the view table log button
    $(document).on('click', '#table_debug_log_button', function () {
        openTableDebugLogPopup();
    })
    // Dialogue data table pop-up window
    $(document).on('click', '.open_table_by_id', function () {
        const messageId = $(this).closest('.mes').attr('mesid');
        initRefreshTypeSelector();
    })
    // Set table enable switch
    $(document).on('change', '.tableEditor_switch', function () {
        let index = $(this).data('index'); // Get the index of the currently clicked item
        const tableStructure = findTableStructureByIndex(index);
        tableStructure.enable = $(this).prop('checked');
    })

    initAppHeaderTableDrawer().then();  // Initialize table editor
    functionToBeRegistered()    // Register various functions for debugging

    executeTranslation(); // Execute translation function

    // Listen for main program events
    APP.eventSource.on(APP.event_types.MESSAGE_RECEIVED, onMessageReceived);
    APP.eventSource.on(APP.event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    APP.eventSource.on(APP.event_types.CHAT_CHANGED, onChatChanged);
    APP.eventSource.on(APP.event_types.MESSAGE_EDITED, onMessageEdited);
    APP.eventSource.on(APP.event_types.MESSAGE_SWIPED, onMessageSwiped);
    APP.eventSource.on(APP.event_types.MESSAGE_DELETED, onChatChanged);

    
    console.log("______________________Memory Plugin: Loading Complete______________________")
});