import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { findNextChatWhitTableData,undoSheets } from "../../index.js";
import { rebuildSheets } from "../runtime/absoluteRefresh.js";
import { openTableHistoryPopup } from "./tableHistory.js";
import { PopupMenu } from "../../components/popupMenu.js";
import { openTableStatisticsPopup } from "./tableStatistics.js";
import { openCellHistoryPopup } from "./cellHistory.js";
import { openSheetStyleRendererPopup } from "./sheetStyleEditor.js";
import { Cell } from "../../core/table/cell.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
let editModeSelectedRows = []
let viewSheetsContainer = null
let lastCellsHashSheet = null
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}

/**
 * Copy table
 * @param {*} tables All table data
 */
export async function copyTable() {
    copyTableData = JSON.stringify(getTableJson({type:'chatSheets', version: 1}))
    if(!copyTableData) return
    $('#table_drawer_icon').click()

    EDITOR.confirm(`Copying table data (#${SYSTEM.generateRandomString(4)})`, 'Cancel', 'Paste to current conversation').then(async (r) => {
        if (r) {
            await pasteTable()
        }
        if ($('#table_drawer_icon').hasClass('closedIcon')) {
            $('#table_drawer_icon').click()
        }
    })
}

/**
 * Paste table
 * @param {number} mesId The message id to paste to
 * @param {Element} viewSheetsContainer The table container DOM
 */
async function pasteTable() {
    if (USER.getContext().chat.length === 0) {
        EDITOR.error("No record carrier, the table is saved in the chat history, please try again after at least one round of chat")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('Pasting will clear the original table data, continue?', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Continue", cancelButton: "Cancel" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            if(!tables.mate === 'chatSheets')  return EDITOR.error("Import failed: incorrect file format")
            BASE.applyJsonToChatSheets(tables)
            await renderSheetsDOM()
            EDITOR.success('Pasted successfully')
        } else {
            EDITOR.error("Paste failed: no table data on clipboard")
        }
    }
}

/**
 * Import table
 * @param {number} mesId The message id to import the table to
 */
async function importTable(mesId, viewSheetsContainer) {
    if (mesId === -1) {
        EDITOR.error("No record carrier, the table is saved in the chat history, please try again after at least one round of chat")
        return
    }

    // 1. Create an input element of type 'file' for file selection
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // Set the accept attribute to restrict to JSON files only, improving user experience
    fileInput.accept = '.json';

    // 2. Add an event listener to listen for changes in file selection (change event)
    fileInput.addEventListener('change', function (event) {
        // Get the list of files selected by the user (FileList object)
        const files = event.target.files;

        // Check if a file was selected
        if (files && files.length > 0) {
            // Get the first file selected by the user (assuming only one JSON file is selected here)
            const file = files[0];

            // 3. Create a FileReader object to read the file content
            const reader = new FileReader();

            // 4. Define the onload event handler for the FileReader
            // When the file is read successfully, the onload event will be triggered
            reader.onload = async function (loadEvent) {
                const button = { text: 'Import template and data', result: 3 }
                const popup = new EDITOR.Popup("Please select the part to import", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Import template and data", cancelButton: "Cancel"});
                const result = await popup.show()
                if (result) {
                        const tables = JSON.parse(loadEvent.target.result)
                        console.log("Import content", tables, tables.mate, !(tables.mate === 'chatSheets'))
                        if(!(tables.mate?.type === 'chatSheets'))  return EDITOR.error("Import failed: incorrect file format", "Please check if you are importing table data")
                        if(result === 3)
                            BASE.applyJsonToChatSheets(tables, "data")
                        else
                            BASE.applyJsonToChatSheets(tables)
                        await renderSheetsDOM()
                        EDITOR.success('Imported successfully')
                }
            };
            reader.readAsText(file, 'UTF-8'); // It is recommended to specify UTF-8 encoding to ensure that Chinese and other characters are read correctly
        }
    });
    fileInput.click();
}

/**
 * Export table
 * @param {Array} tables All table data
 */
async function exportTable() {
    const jsonTables = getTableJson({type:'chatSheets', version: 1})
    if(!jsonTables) return
    const bom = '\uFEFF';
    const blob = new Blob([bom + JSON.stringify(jsonTables)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'table_data.json'; // Default file name
    document.body.appendChild(downloadLink); // Must be added to the DOM to trigger the download
    downloadLink.click();
    document.body.removeChild(downloadLink); // Remove after download is complete

    URL.revokeObjectURL(url); // Release the URL object

    EDITOR.success('Exported');
}

/**
 * Get table Json data
 */
function getTableJson(mate) {
    if (!DERIVED.any.renderingSheets || DERIVED.any.renderingSheets.length === 0) {
        EDITOR.warning('There is no data in the current table and it cannot be exported');
        return;
    }
    const sheets = DERIVED.any.renderingSheets.filter(sheet => sheet.enable)
    // const csvTables = sheets.map(sheet => "SHEET-START" + sheet.uid + "\n" + sheet.getSheetCSV(false) + "SHEET-END").join('\n')
    const jsonTables = {}
    sheets.forEach(sheet => {
        jsonTables[sheet.uid] = sheet.getJson()
    })
    jsonTables.mate = mate
    return jsonTables
}

/**
 * Clear table
 * @param {number} mesId The message id of the table to be cleared
 * @param {Element} viewSheetsContainer The table container DOM
 */
async function clearTable(mesId, viewSheetsContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('Clear all table data in the current conversation and reset the history. This operation cannot be undone. Continue?', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Continue", cancelButton: "Cancel" });
    if (confirmation) {
        await USER.getContext().chat.forEach((piece => {
            if (piece.hash_sheets) {
                delete piece.hash_sheets
            }
            if (piece.dataTable) delete piece.dataTable
        }))
        setTimeout(() => {
            USER.saveSettings()
            USER.saveChat();
            refreshContextView()
            EDITOR.success("Table data cleared successfully")
            console.log("Table data cleared")
        }, 100)
    }
}

/**
 * Set table editing tips
 * @param {Element} tableEditTips The table editing tips DOM
 */
function setTableEditTips(tableEditTips) {
    /* if (!tableEditTips || tableEditTips.length === 0) {
        console.error('tableEditTips is null or empty jQuery object');
        return;
    }
    const tips = $(tableEditTips); // Make sure tableEditTips is a jQuery object
    tips.empty();
    if (USER.tableBaseSetting.isExtensionAble === false) {
        tips.append('The plugin is currently disabled and will not ask the AI to update the table.');
        tips.css("color", "rgb(211 39 39)");
    } else if (userTableEditInfo.editAble) {
        tips.append('Click on a cell to select an editing operation. Green cells are inserted in this round, and blue cells are modified in this round.');
        tips.css("color", "lightgreen");
    } else {
        tips.append('This table is an intermediate table and cannot be edited or pasted to avoid confusion. You can open the table in the latest message to edit it.');
        tips.css("color", "lightyellow");
    } */
}

async function cellDataEdit(cell) {
    const result = await EDITOR.callGenericPopup("Edit Cell", EDITOR.POPUP_TYPE.INPUT, cell.data.value, { rows: 3 })
    if (result) {
        cell.editCellData({ value: result })
        refreshContextView();
        if(cell.type === Cell.CellType.column_header) BASE.refreshTempView(true)
    }
}


async function columnDataEdit(cell) {
    const columnEditor = `
<div class="column-editor">
    <div class="column-editor-header">
        <h3>Edit Column Data</h3>
    </div>
    <div class="column-editor-body">
        <div class="column-editor-content">
            <label for="column-editor-input">Column Data:</label>
            <textarea id="column-editor-input" rows="5"></textarea>
        </div>
    </div>
</div>
`
    const columnCellDataPopup = new EDITOR.Popup(columnEditor, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Apply Changes", cancelButton: "Cancel" });
    const historyContainer = $(columnCellDataPopup.dlg)[0];

    await columnCellDataPopup.show();

    if (columnCellDataPopup.result) {
        // cell.editCellData({ value: result })
        refreshContextView();
    }
}

function batchEditMode(cell) {
    DERIVED.any.batchEditMode = true;
    DERIVED.any.batchEditModeSheet = cell.parent;
    EDITOR.confirm(`Editing rows in #${cell.parent.name}`, 'Cancel', 'Done').then((r) => {
        DERIVED.any.batchEditMode = false;
        DERIVED.any.batchEditModeSheet = null;
        renderSheetsDOM();
    })
    renderSheetsDOM();
}

// New event handler
export function cellClickEditModeEvent(cell) {
    cell.element.style.cursor = 'pointer'
    if (cell.type === Cell.CellType.row_header) {
        cell.element.textContent = ''

        // Add three divs to cell.element, one for sorting, one for lock button, and one for delete button
        const containerDiv = $(`<div class="flex-container" style="display: flex; flex-direction: row; justify-content: space-between; width: 100%;"></div>`)
        const rightDiv = $(`<div class="flex-container" style="margin-right: 3px"></div>`)
        const indexDiv = $(`<span class="menu_button_icon interactable" style="margin: 0; padding: 0 6px; cursor: move; color: var(--SmartThemeBodyColor)">${cell.position[0]}</span>`)
        const lockDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-lock" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)
        const deleteDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-xmark redWarningBG" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)

        $(lockDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (cell._pre_deletion) return

            cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target.locked = !target.locked
                        target.element.style.backgroundColor = target.locked ? '#00ff0022' : ''
                    })
                }
            })
        })
        $(deleteDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleAction(cell, Cell.CellAction.deleteSelfRow)
            //if (cell.locked) return

            /* cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target._pre_deletion = !target._pre_deletion
                        target.element.style.backgroundColor = target._pre_deletion ? '#ff000044' : ''
                    })
                }
            }) */
        })

        $(rightDiv).append(deleteDiv)
        $(containerDiv).append(indexDiv).append(rightDiv)
        $(cell.element).append(containerDiv)

    } else if (cell.type === Cell.CellType.cell) {
        cell.element.style.cursor = 'text'
        cell.element.contentEditable = true
        cell.element.focus()
        cell.element.addEventListener('blur', (e) => {
            e.stopPropagation();
            e.preventDefault();
            cell.data.value = cell.element.textContent.trim()
        })
    }

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();
    })
}

async function confirmAction(event, text = 'Are you sure you want to continue with this operation?') {
    const confirmation = new EDITOR.Popup(text, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Continue", cancelButton: "Cancel" });

    await confirmation.show();
    if (!confirmation.result) return { filterData: null, confirmation: false };
    event()
}

/**
 * Cell highlight
 */
export function cellHighlight(sheet) {
    if(!lastCellsHashSheet) return;
    const lastHashSheet = lastCellsHashSheet[sheet.uid] || []
    if ((sheet.hashSheet.length < 2) && (lastHashSheet.length < 2)) return;    // When the table content is empty, do not execute the subsequent functions to improve robustness
    const hashSheetFlat = sheet.hashSheet.flat()
    const lastHashSheetFlat = lastHashSheet.flat()
    let deleteRow = []
    lastHashSheet.forEach((row, index) => {
        if (!hashSheetFlat.includes(row[0])) {
            deleteRow.push(row[0])
            sheet.hashSheet.splice(index,0,lastHashSheet[index])
        }
    })

    const changeSheet = sheet.hashSheet.map((row) => {
        const isNewRow = !lastHashSheetFlat.includes(row[0])
        const isDeletedRow = deleteRow.includes(row[0])
        return row.map((hash) => {
            if (isNewRow) return { hash, type: "newRow" }
            if (isDeletedRow) return { hash, type: "deletedRow" }
            if (!lastHashSheetFlat.includes(hash)) return { hash, type: "update" }
            return { hash, type: "keep" }
        })
    })
    changeSheet.forEach((row, index) => {
        if (index === 0)
            return
        let isKeepAll = true
        row.forEach((cell) => {
            let sheetCell = sheet.cells.get(cell.hash)
            const cellElement = sheetCell.element
            if (cell.type === "newRow") {
                cellElement.classList.add('insert-item')
                isKeepAll = false
            } else if (cell.type === "update") {
                cellElement.classList.add('update-item')
                isKeepAll = false
            } else if (cell.type === "deletedRow") {
                sheetCell.isDeleted = true
                cellElement.classList.add('delete-item')
                isKeepAll = false
            } else if (sheetCell.isDeleted === true) {
                cellElement.classList.add('delete-item')
                isKeepAll = false
            } else {
                cellElement.classList.add('keep-item')
            }
        })
        if (isKeepAll) {
            row.forEach((cell) => {
                const cellElement = sheet.cells.get(cell.hash).element
                cellElement.classList.add('keep-all-item')
            })
        }
    })
}

async function cellHistoryView(cell) {
    await openCellHistoryPopup(cell)
}

/**
 * Custom table style event
 * @param {*} cell
 */
async function customSheetStyle(cell) {
    await openSheetStyleRendererPopup(cell.parent)
    await refreshContextView();
}

function cellClickEvent(cell) {
    cell.element.style.cursor = 'pointer'

    // Determine whether to highlight based on historical data
    /* const lastCellUid = lastCellsHashSheet.has(cell.uid)
    if (!lastCellUid) {
        cell.element.style.backgroundColor = '#00ff0011'
    }
    else if (cell.parent.cells.get(lastCellUid).data.value !== cell.data.value) {
        cell.element.style.backgroundColor = '#0000ff11'
    } */

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        // Re-acquire hash
        BASE.getLastestSheets()

        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const menu = cell.parent.currentPopupMenu;
        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        if (rowIndex === 0 && colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> Batch Edit Rows', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-right"></i> Insert Column to the Right', () => handleAction(cell, Cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-arrow-down"></i> Insert Row Below', () => handleAction(cell, Cell.CellAction.insertDownRow));
            menu.add('<i class="fa-solid fa-wand-magic-sparkles"></i> Custom Table Style', async () => customSheetStyle(cell));
        } else if (colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> Batch Edit Rows', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-up"></i> Insert Row Above', () => handleAction(cell, Cell.CellAction.insertUpRow));
            menu.add('<i class="fa fa-arrow-down"></i> Insert Row Below', () => handleAction(cell, Cell.CellAction.insertDownRow));
            menu.add('<i class="fa fa-trash-alt"></i> Delete Row', () => handleAction(cell, Cell.CellAction.deleteSelfRow), menu.ItemType.warning)
        } else if (rowIndex === 0) {
            menu.add('<i class="fa fa-i-cursor"></i> Edit This Column', async () => await cellDataEdit(cell));
            menu.add('<i class="fa fa-arrow-left"></i> Insert Column to the Left', () => handleAction(cell, Cell.CellAction.insertLeftColumn));
            menu.add('<i class="fa fa-arrow-right"></i> Insert Column to the Right', () => handleAction(cell, Cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-trash-alt"></i> Delete Column', () => confirmAction(() => { handleAction(cell, Cell.CellAction.deleteSelfColumn) }, 'Are you sure you want to delete the column?'), menu.ItemType.warning);
        } else {
            menu.add('<i class="fa fa-i-cursor"></i> Edit This Cell', async () => await cellDataEdit(cell));
            menu.add('<i class="fa-solid fa-clock-rotate-left"></i> Cell History', async () => await cellHistoryView(cell));
        }

        // Set some non-functional derivative operations after the pop-up menu, here you must use setTimeout, otherwise the menu will not be displayed normally
        setTimeout(() => {

        }, 0)

        const element = event.target

        // Back up the style of the current cell so that it can be restored when the menu is closed
        const style = element.style.cssText;

        // Get cell position
        const rect = element.getBoundingClientRect();
        const tableRect = viewSheetsContainer.getBoundingClientRect();

        // Calculate menu position (relative to the table container)
        const menuLeft = rect.left - tableRect.left;
        const menuTop = rect.bottom - tableRect.top;
        const menuElement = menu.renderMenu();
        $(viewSheetsContainer).append(menuElement);

        // Highlight cell
        element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        element.style.color = 'var(--SmartThemeQuoteColor)';
        element.style.outline = '1px solid var(--SmartThemeQuoteColor)';
        element.style.zIndex = '999';

        menu.show(menuLeft, menuTop).then(() => {
            element.style.cssText = style;
        })
        menu.frameUpdate((menu) => {
            // Reposition the menu
            const rect = element.getBoundingClientRect();
            const tableRect = viewSheetsContainer.getBoundingClientRect();

            // Calculate menu position (relative to the table container)
            const menuLeft = rect.left - tableRect.left;
            const menuTop = rect.bottom - tableRect.top;
            menu.popupContainer.style.left = `${menuLeft}px`;
            menu.popupContainer.style.top = `${menuTop + 3}px`;
        })
    })
    cell.on('', () => {
        console.log('Cell has changed:', cell)
    })
}

function handleAction(cell, action) {
    cell.newAction(action)
    refreshContextView();
    if(cell.type === Cell.CellType.column_header) BASE.refreshTempView(true)
}

export async function renderEditableSheetsDOM(_sheets, _viewSheetsContainer, _cellClickEvent = cellClickEvent) {
    for (let [index, sheet] of _sheets.entries()) {
        if (!sheet.enable) continue
        const instance = sheet
        console.log("Render:", instance)
        const sheetContainer = document.createElement('div')
        const sheetTitleText = document.createElement('h3')
        sheetContainer.style.overflowX = 'none'
        sheetContainer.style.overflowY = 'auto'
        sheetTitleText.innerText = `#${index} ${sheet.name}`

        let sheetElement = null

        if (DERIVED.any.batchEditMode === true) {
            if (DERIVED.any.batchEditModeSheet?.name === instance.name) {
                sheetElement = await instance.renderSheet(cellClickEditModeEvent)
            } else {
                sheetElement = await instance.renderSheet((cell) => {
                    cell.element.style.cursor = 'default'
                })
                sheetElement.style.cursor = 'default'
                sheetElement.style.opacity = '0.5'
                sheetTitleText.style.opacity = '0.5'
            }
        } else {
            sheetElement = await instance.renderSheet(_cellClickEvent)
        }
        cellHighlight(instance)
        console.log("Render table:", sheetElement)
        $(sheetContainer).append(sheetElement)

        $(_viewSheetsContainer).append(sheetTitleText)
        $(_viewSheetsContainer).append(sheetContainer)
        $(_viewSheetsContainer).append(`<hr>`)
    }
}

/**
 * Restore table
 * @param {number} mesId The message id of the table to be cleared
 * @param {Element} tableContainer The table container DOM
 */
async function undoTable(mesId, tableContainer) {
    if (mesId === -1) return
    //const button = { text: 'Undo 10 rounds', result: 3 }
    const popup = new EDITOR.Popup("Undo all manual modifications and re-organization data within the specified number of rounds, and restore the table", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Undo this round", cancelButton: "Cancel" });
    const result = await popup.show()
    if (result) {
        await undoSheets(0)
        EDITOR.success('Restored successfully')
    }
}


async function renderSheetsDOM(mesId = -1) {
    const task = new SYSTEM.taskTiming('renderSheetsDOM_task')
    DERIVED.any.renderingMesId = mesId
    updateSystemMessageTableStatus();
    task.log()
    const {deep: lastestDeep, piece: lastestPiece} = BASE.getLastSheetsPiece()
    const { piece, deep } = mesId === -1 ? {piece:lastestPiece, deep: lastestDeep} : {piece:USER.getContext().chat[mesId], deep: mesId}
    if (!piece || !piece.hash_sheets) return;

    if( deep === lastestDeep) DERIVED.any.isRenderLastest = true;
    else DERIVED.any.isRenderLastest = false;
    DERIVED.any.renderDeep = deep;

    const sheets = BASE.hashSheetsToSheets(piece.hash_sheets);
    sheets.forEach((sheet) => {
        sheet.hashSheet = sheet.hashSheet.filter((row) => {
            return (sheet.cells.get(row[0]).isDeleted !== true);
        })
        sheet.cells.forEach((cell) => {
            cell.isDeleted = false;
        })
    })
    console.log('renderSheetsDOM:', piece, sheets)
    DERIVED.any.renderingSheets = sheets
    task.log()
    // Used to record the last hash_sheets, and highlight according to the last hash_sheets when rendering
    if(deep != 0) {
        lastCellsHashSheet = BASE.getLastSheetsPiece(deep - 1, 3, false)?.piece.hash_sheets;
        if (lastCellsHashSheet) {
            lastCellsHashSheet = BASE.copyHashSheets(lastCellsHashSheet)
        }
    }
    
    task.log()
    $(viewSheetsContainer).empty()
    viewSheetsContainer.style.paddingBottom = '150px'
    renderEditableSheetsDOM(sheets, viewSheetsContainer,DERIVED.any.isRenderLastest?undefined:()=>{})
    $("#table_indicator").text(DERIVED.any.isRenderLastest ? "This is the active table that can be modified" : `This is the old table in the ${deep}th round of conversation and cannot be changed`)
    task.log()
}

let initializedTableView = null
async function initTableView(mesId) {
    initializedTableView = $(await SYSTEM.getTemplate('manager')).get(0);
    viewSheetsContainer = initializedTableView.querySelector('#tableContainer');
    // setTableEditTips($(initializedTableView).find('#tableEditTips'));    // Make sure to find tableEditTips when table_manager_container exists

    // Set editing tips
    // Click to open and view table data statistics
    $(document).on('click', '#table_data_statistics_button', function () {
        EDITOR.tryBlock(openTableStatisticsPopup, "Failed to open table statistics")
    })
    // Click to open and view table history button
    $(document).on('click', '#dataTable_history_button', function () {
        EDITOR.tryBlock(openTableHistoryPopup, "Failed to open table history")
    })
    // Click to clear table button
    $(document).on('click', '#clear_table_button', function () {
        EDITOR.tryBlock(clearTable, "Failed to clear table", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    $(document).on('click', '#table_rebuild_button', function () {
        EDITOR.tryBlock(rebuildSheets, "Failed to rebuild table");
    })
    // Click to edit table button
    $(document).on('click', '#table_edit_mode_button', function () {
        // openTableEditorPopup();
    })
    // Click to restore table button
    $(document).on('click', '#table_undo', function () {
        EDITOR.tryBlock(undoTable, "Failed to restore table");
    })
    // Click to copy table button
    $(document).on('click', '#copy_table_button', function () {
        EDITOR.tryBlock(copyTable, "Failed to copy table");
    })
    // Click to import table button
    $(document).on('click', '#import_table_button', function () {
        EDITOR.tryBlock(importTable, "Failed to import table", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    // Click to export table button
    $(document).on('click', '#export_table_button', function () {
        EDITOR.tryBlock(exportTable, "Failed to export table");
    })
    // Click to previous table button
    $(document).on('click', '#table_prev_button', function () {
        const deep = DERIVED.any.renderDeep;
        const { deep: prevDeep }  = BASE.getLastSheetsPiece(deep - 1, 20, false);
        if (prevDeep === -1) {
            EDITOR.error("No more table data")
            return
        }
        renderSheetsDOM(prevDeep);
    })

    // Click to next table button
    $(document).on('click', '#table_next_button', function () {
        const deep = DERIVED.any.renderDeep;
        console.log("Current depth:", deep)
        const { deep: nextDeep }  = BASE.getLastSheetsPiece(deep + 1, 20, false, "down");
        if (nextDeep === -1) {
            EDITOR.error("No more table data")
            return
        }
        renderSheetsDOM(nextDeep);
    })

    return initializedTableView;
}

export async function refreshContextView(mesId = -1) {
    if(BASE.contextViewRefreshing) return
    BASE.contextViewRefreshing = true
    await renderSheetsDOM(mesId);
    console.log("Refresh table view")
    BASE.contextViewRefreshing = false
}

export async function getChatSheetsView(mesId = -1) {
    // If it has been initialized, return the cached container directly to avoid repeated creation
    if (initializedTableView) {
        // Update table content, but do not recreate the entire container
        await renderSheetsDOM();
        return initializedTableView;
    }
    return await initTableView(mesId);
}
