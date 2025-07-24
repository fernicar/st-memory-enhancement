// tablePushToChat.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { parseSheetRender, loadValueSheetBySheetHashSheet } from "./sheetCustomRenderer.js";
import { cellClickEditModeEvent, cellHighlight } from "../editor/chatSheetsDataView.js";
import { replaceUserTag } from "../../utils/stringUtil.js";


/**
 * Replace custom styles with styles that conform to HTML format
 * @param {string} replace - Custom style string
 * @param {string} _viewSheetsContainer - DOM element, as a container for the worksheet
 * @returns {string} - The replaced style string
 */
function divideCumstomReplace(replace, _viewSheetsContainer) {
    let viewSheetsContainer = '';
    const replaceContent = replace;

    // 1. Extract the complete <style> and <script> tags
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;

    viewSheetsContainer += (replaceContent.match(styleRegex) || []).join('');
    viewSheetsContainer += (replaceContent.match(scriptRegex) || []).join('');

    // 2. Clear tags (including <style> and <script>)
    let dividedContent = replaceContent
        .replace(/<!DOCTYPE html[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '')
        .replace(/<\/html>/gi, '')
        .replace(/<head[^>]*>/gi, '')
        .replace(/<\/head>/gi, '')
        .replace(styleRegex, '')  // New: Remove <style> tags
        .replace(scriptRegex, ''); // New: Remove <script> tags

    // 3. Append styles and scripts to the container
    $(_viewSheetsContainer).append(viewSheetsContainer);
    // console.log('Style data in the separated function:', dividedContent);
    return dividedContent;
}

/**
 *  Alternating and embedded rendering
 * @param {@table} tableRole - Nested array extracted by the same name row
 * @param {Array} insertMark - Mark whether to embed
 * @param {Array} indexForTableRole - Index corresponding to the nested array element
 * @param {Array} _sheets - Table
 * @param {HTMLElement} _viewSheetsContainer - DOM element, as a container for the worksheet
 */
function insertCustomRender(tableRole, insertMark, cycleMark, indexForTableRole, _sheets, _viewSheetsContainer) {
    let customStyle = '';
    let index = 0;
    for (let i = 0; i < tableRole.length; i++) {
        index = indexForTableRole[i]
        // console.log("Alternating and embedded rendering table role index:" + index);
        // console.log(_sheets[index].name, "Alternating and embedded rendering table role:" + tableRole[i]);
        _sheets[index].tableSheet = tableRole[i];
        // console.log("Alternating and embedded rendering table role assigned to sheet:", _sheets[index].name, _sheets[index].tableSheet);
        const customContent = parseSheetRender(_sheets[index]);
        // console.log("Alternating and embedded rendering table returns text customContentt:" + customContent);
        const placeholderPattern = `<replaceHolder${index}([^>]*)><\\/replaceHolder${index}>`;
        const placeholderRegex = new RegExp(placeholderPattern, 'g');

        if (insertMark[i] && customStyle.match(placeholderRegex)) {
            customStyle = customStyle.replace(placeholderRegex, customContent);
        } else {
            customStyle += customContent;
        }
    }
    // console.log("Alternating and embedded final returned text customStyle:" + customStyle);
    const sheetContainer = document.createElement('div')    //DOM element, as a container for the worksheet
    sheetContainer.innerHTML = replaceUserTag(customStyle) //Replace the <user> tag in the custom style
    $(_viewSheetsContainer).append(sheetContainer)
}


/**
 * Render worksheet with custom styles
 * @param {@table} sheet - Worksheet data
 * @param {HTMLElement} _viewSheetsContainer - DOM element, as a container for the worksheet
 */
function ordinarycustomStyleRender(sheet, _viewSheetsContainer) {
    // console.log('Normal table data:', sheet.tableSheet);
    const customStyle = parseSheetRender(sheet)             //Use parseSheetRender to parse the worksheet
    const sheetContainer = document.createElement('div')    //DOM element, as a container for the worksheet
    sheetContainer.innerHTML = replaceUserTag(customStyle) //Replace the <user> tag in the custom style
    $(_viewSheetsContainer).append(sheetContainer)
}

/**
 * Render worksheet with default style
 * @param {*} index - Worksheet index
 * @param {*} sheet - Worksheet data
 * @param {*} _viewSheetsContainer - DOM element, as a container for the worksheet
 */
function defaultStyleRender(index, sheet, _viewSheetsContainer) {
    const instance = sheet
    const sheetContainer = document.createElement('div')
    const sheetTitleText = document.createElement('h3')
    sheetContainer.style.overflowX = 'none'
    sheetContainer.style.overflowY = 'auto'
    sheetTitleText.innerText = `#${index} ${sheet.name}`

    let sheetElement = null
    sheetElement = instance.renderSheet(cell => cell.element.style.cursor = 'default')
    cellHighlight(instance)
    $(sheetContainer).append(sheetElement)

    $(_viewSheetsContainer).append(sheetTitleText)
    $(_viewSheetsContainer).append(sheetContainer)
    $(_viewSheetsContainer).append(`<hr>`)
}
/** Auxiliary function to determine whether the current i-th row and the i+1-th row of the sorted array are the same table's loop rows. If so, return true, otherwise return false.
 * @param {*} cycleDivideMark - Loop mark
 * @param {*} indexForRowAlternate - Index corresponding to the original table
 * @param {*} i - Row number
 * @returns - True or false
 */
function cycleJudge(cycleDivideMark, indexForRowAlternate, i) {
    if (i < 0) return false;
    return cycleDivideMark[indexForRowAlternate[i]] === true && cycleDivideMark[indexForRowAlternate[i + 1]] === true && indexForRowAlternate[i] === indexForRowAlternate[i + 1];
}
/**Render multiple worksheets to the specified DOM container according to the worksheet configuration (whether to use custom styles), supporting two rendering methods: custom style rendering and default style rendering, and custom styles are divided into normal rendering and alternating rendering
 *
 * @param {*table} _sheets - Worksheet array, containing multiple worksheet data
 * @param {*} _viewSheetsContainer - DOM element, as a container for the worksheet
 */
async function renderEditableSheetsDOM(_sheets, _viewSheetsContainer) {
    let sumAlternateLevel = 0;          // Counter, counting the number of tables that need to be alternated
    let levelIndexAlternate = [];       // Statistics of the level index that needs to be alternated
    let indexOriginary = [];      // Record the index of the table using ordinary custom styles
    let cycleDivideMark = [];       // Whether there is a mark for circular output in the table
    console.log("Is alternating mode enabled:" + USER.tableBaseSetting.alternate_switch)
    if (USER.tableBaseSetting.alternate_switch) {    //First determine whether the alternating mode is enabled, and then see if it is necessary to enter the alternating model
        for (let [index, sheet] of _sheets.entries()) {
            if (sheet.config.useCustomStyle === true) {
                _sheets[index].config.customStyles[sheet.config.selectedCustomStyleKey].replaceDivide = divideCumstomReplace(sheet.config.customStyles[sheet.config.selectedCustomStyleKey].replace, _viewSheetsContainer); //Organize the CSS code to make the final text more in line with the html format
            }
            if (sheet.config.toChat === true && sheet.config.useCustomStyle === true && sheet.config.alternateTable === true && sheet.config.alternateLevel > 0) {
                sumAlternateLevel++;        // The counter that meets the conditions increases
                levelIndexAlternate.push([Number(sheet.config.alternateLevel), index]); // Level and index corresponding array, forced to be converted to a number type to improve robustness
                sheet.config.skipTop = false;  //Alternating mode only renders the table content, and does not need to skip the header row
                cycleDivideMark[index] = sheet.config.customStyles[sheet.config.selectedCustomStyleKey].replace.includes('<cycleDivide>');
            }
            else if (sheet.config.toChat === true) {
                indexOriginary.push(index); // Add ordinary custom style table index
            }
        }
    }
    if (sumAlternateLevel > 0) {
        // console.log('Alternating mode');
        let tableAlternate = [];  // Used to store tables that need to be alternated
        let indexForRowAlternate = [];  // Used to record the row of the sorted table corresponding to the original table index
        // console.log('Initial level index correspondence:', levelIndexAlternate);
        levelIndexAlternate.sort((a, b) => {  // Ensure stable sorting
            if (a[0] !== b[0]) {
                return a[0] - b[0]; // Different levels, sort by level
            } else {
                return a[1] - b[1]; // Same level, sort by original index (to ensure stability)
            }
        });
        // Get the tables to be sorted and record the original index
        for (const [level, index] of levelIndexAlternate) {
            const sheetData = loadValueSheetBySheetHashSheet(_sheets[index]).slice(1);
            // Tile all rows of each table into tableAlternate
            sheetData.forEach(row => {
                tableAlternate.push(row);
                indexForRowAlternate.push(index); // Record the original table index
            });
        }


        // Create an array of objects containing row data, original table index, and current index
        const indexedTable = tableAlternate.map((row, currentIndex) => ({
            row,
            originalIndex: indexForRowAlternate[currentIndex],
            currentIndex
        }));

        // Sort (by the 2nd column role name)
        indexedTable.sort((a, b) => {
            const clean = (str) => String(str).trim().replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
            const roleA = clean(a.row[1]) || "";
            const roleB = clean(b.row[1]) || "";

            // Create a mapping of the first appearance index of the role
            const firstAppearance = new Map();
            indexedTable.forEach((item, idx) => {
                const role = clean(item.row[1]);
                if (!firstAppearance.has(role)) {
                    firstAppearance.set(role, idx);
                }
            });

            // Role group sorting
            if (roleA !== roleB) {
                return firstAppearance.get(roleA) - firstAppearance.get(roleB);
            }
        });

        // Extract the sorted rows and corresponding original table indexes
        tableAlternate = indexedTable.map(item => item.row);
        indexForRowAlternate = indexedTable.map(item => item.originalIndex);
        let tableRole = [];     //Temporary auxiliary array for rendering by grouping by the same name
        let insertMark = [];    //Mark whether to embed rendering
        let cycleMark = [];     //Temporary auxiliary array for temporary marking
        let indexForTableRole = [];
        let j = 0;              //Marking variable
        // console.log("Sorted table:", tableAlternate);
        // Rendering of alternating + merged tables
        for (let i = 0; i < tableAlternate.length; i++) {
            // console.log('Current row:', i, tableAlternate[i][1])
            if (i === tableAlternate.length - 1) {
                if (cycleJudge(cycleDivideMark, indexForRowAlternate, i - 1) || cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {
                    tableRole[j].push(tableAlternate[i]);
                } else {
                    tableRole.push([tableAlternate[i]]);
                    indexForTableRole[j] = indexForRowAlternate[i];
                    insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                    cycleMark[j] = false;
                }
                // console.log('Extraction of the last row ends:', j, tableAlternate[i][1])
                // console.log('tableRole at the end of extraction of the last row', tableRole);
                insertCustomRender(tableRole, insertMark, cycleMark, indexForTableRole, _sheets, _viewSheetsContainer)
            } else if (tableAlternate[i][1] === tableAlternate[i + 1][1]) {
                if (cycleJudge(cycleDivideMark, indexForRowAlternate, i - 1) || cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {  //Mark the loop row input to the same nested array
                    if (!tableRole[j]) {   //Determine whether to mark the start of the loop
                        tableRole[j] = [];
                        indexForTableRole[j] = indexForRowAlternate[i];
                        insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                        cycleMark[j] = true;
                        // console.log('Loop mark starts', j, i);
                        // console.log('tableRole at the start of loop mark:', tableRole);
                    }
                    tableRole[j].push(tableAlternate[i]);
                    if (!cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {  //Determine whether the mark loop ends
                        j++;
                        // console.log('Loop mark ends', j, i);
                    }
                } else {                                                        //Non-loop marked rows are input into separate nested arrays
                    tableRole.push([tableAlternate[i]]);
                    indexForTableRole[j] = indexForRowAlternate[i];
                    insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                    cycleMark[j] = false;
                    // console.log('Non-loop input extraction:', _sheets[indexForRowAlternate[i]].name, j, i);
                    j++;
                }

            } else {
                if (cycleJudge(cycleDivideMark, indexForRowAlternate, i - 1) || cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {
                    tableRole[j].push(tableAlternate[i]);
                    if (!cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {  //Determine whether the mark loop ends
                        j++;
                        // console.log('Loop mark ends', j, i);
                    }
                } else {
                    tableRole.push([tableAlternate[i]]);
                    indexForTableRole[j] = indexForRowAlternate[i];
                    insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                }
                // console.log('Extraction of same-name rows ends:', j, tableAlternate[i][1])
                // console.log('tableRole at the end of extraction of same-name rows', tableRole);
                insertCustomRender(tableRole, insertMark, cycleMark, indexForTableRole, _sheets, _viewSheetsContainer)
                tableRole = [];
                j = 0;
            }
        }

        // Render the ordinary table
        // console.log('Index of ordinary table:', indexOriginary, 'Length of ordinary table', indexOriginary.length);
        for (let i = 0; i < indexOriginary.length; i++) {
            let sheet = _sheets[indexOriginary[i]];
            sheet.tableSheet = loadValueSheetBySheetHashSheet(sheet);
            // console.log('Current ordinary table content for ordinary rendering:',sheet.tableSheet);
            if (sheet.config.toChat === false) continue; // If it does not need to be pushed to the chat, skip it
            if (sheet.config.useCustomStyle === true) {
                // Make sure customStyles exists and the selected style has a replace attribute
                if (sheet.config.customStyles &&
                    sheet.config.selectedCustomStyleKey &&
                    sheet.config.customStyles[sheet.config.selectedCustomStyleKey]?.replace) {
                    sheet.tableSheet = loadValueSheetBySheetHashSheet(sheet);
                    ordinarycustomStyleRender(sheet, _viewSheetsContainer);
                    continue; // Skip default rendering after processing
                }
            }
            defaultStyleRender(indexOriginary[i], sheet, _viewSheetsContainer);

        }
    }
    else {
        // console.log('Entering normal rendering mode');
        for (let [index, sheet] of _sheets.entries()) {
            // If it does not need to be pushed to the chat, skip it
            if (sheet.config.toChat === false) continue;

            // Check if custom styles are used and meet the conditions
            if (sheet.config.useCustomStyle === true) {
                // Make sure customStyles exists and the selected style has a replace attribute
                if (sheet.config.customStyles &&
                    sheet.config.selectedCustomStyleKey &&
                    sheet.config.customStyles[sheet.config.selectedCustomStyleKey]?.replace) {

                    sheet.tableSheet = loadValueSheetBySheetHashSheet(sheet);
                    ordinarycustomStyleRender(sheet, _viewSheetsContainer);
                    continue; // Skip default rendering after processing
                }
            }

            // Default style rendering (including cases where useCustomStyle=false or customStyles do not meet the conditions)
            defaultStyleRender(index, sheet, _viewSheetsContainer);
        }
    }
}

/**
 * Push table data to be displayed in the chat content
 * @param sheets
 */
function replaceTableToStatusTag(sheets) {
    let chatContainer
    if (USER.tableBaseSetting.table_to_chat_mode === 'context_bottom') {
        chatContainer = window.document.querySelector('#chat');
    } else if (USER.tableBaseSetting.table_to_chat_mode === 'last_message') {
        chatContainer = window.document.querySelector('.last_mes')?.querySelector('.mes_text'); // Get the container of the last message
    } else if (USER.tableBaseSetting.table_to_chat_mode === 'macro') {
        // Find the position of {{sheetsView}} in the document

    }

    // Define named event listener functions
    const touchstartHandler = function (event) {
        event.stopPropagation();
    };
    const touchmoveHandler = function (event) {
        event.stopPropagation();
    };
    const touchendHandler = function (event) {
        event.stopPropagation();
    };

    setTimeout(async () => {
        // Note the race condition here, the previous tableStatusContainer may not have been added before setTimeout is executed
        const currentTableStatusContainer = document.querySelector('#tableStatusContainer');
        if (currentTableStatusContainer) {
            // Remove previous event listeners to prevent repeated additions (although it is unlikely to be added repeatedly in this scenario)
            currentTableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            currentTableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            currentTableStatusContainer.removeEventListener('touchend', touchendHandler);
            currentTableStatusContainer?.remove(); // Remove the old tableStatusContainer
        }

        // Add the new tableStatusContainer here
        const r = USER.tableBaseSetting.to_chat_container.replace(/\$0/g, `<tableStatus id="table_push_to_chat_sheets"></tableStatus>`);
        $(chatContainer).append(`<div class="wide100p" id="tableStatusContainer">${r}</div>`); // Add the new tableStatusContainer
        const tableStatusContainer = chatContainer?.querySelector('#table_push_to_chat_sheets');
        renderEditableSheetsDOM(sheets, tableStatusContainer);

        // Get the newly created tableStatusContainer
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (newTableStatusContainer) {
            // Add event listeners using named functions
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchend', touchendHandler, { passive: false });
        }
        // console.log('tableStatusContainer:', newTableStatusContainer);
    }, 0);
}

/**
 * Update the content of the <tableStatus> tag in the last System message
 */
export function updateSystemMessageTableStatus(force = false) {
    console.log("Update the content of the <tableStatus> tag in the last System message", USER.tableBaseSetting.isTableToChat)
    if (force === false) {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isTableToChat === false) {
            window.document.querySelector('#tableStatusContainer')?.remove();
            return;
        }
    }
    // console.log("Update last System ")
    const sheets = BASE.hashSheetsToSheets(BASE.getLastSheetsPiece()?.piece.hash_sheets);

    replaceTableToStatusTag(sheets);
}
/**
 * Trigger alternating mode
 */
export function updateAlternateTable() {

    const sheets = BASE.hashSheetsToSheets(BASE.getLastSheetsPiece()?.piece.hash_sheets);

    replaceTableToStatusTag(sheets);
}

/**
 * New code, open custom table push renderer popup
 * @returns {Promise<void>}
 */
export async function openTableRendererPopup() {
    const manager = await SYSTEM.getTemplate('customSheetStyle');
    const tableRendererPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const sheetsData = BASE.getLastSheetsPiece()?.piece.hash_sheets;
    if (!sheetsData) {
        // console.warn("openTableRendererPopup: Failed to get a valid table object.");
        return;
    }
    const sheets = BASE.hashSheetsToSheets(sheetsData)[0];
    let sheetElements = '';
    for (let sheet of sheets) {
        if (!sheet.tochat) continue;
        if (!sheet.data.customStyle || sheet.data.customStyle === '') {
            sheetElements += sheet.renderSheet().outerHTML;
            continue;
        }
        // parseTableRender()
    }

    const $dlg = $(tableRendererPopup.dlg);
    const $htmlEditor = $dlg.find('#htmlEditor');
    const $tableRendererDisplay = $dlg.find('#tableRendererDisplay');

    // Real-time rendering during modification
    console.log("openTableRendererPopup-elements.rendererDisplay exists:", !!elements.rendererDisplay);
    console.log("jQuery object length:", elements.rendererDisplay?.length || 0);
    const renderHTML = () => {
        $tableRendererDisplay.html(sheetElements);
    };

    renderHTML();
    $htmlEditor.on('input', renderHTML); // Listen for input events for real-time rendering

    await tableRendererPopup.show();
}
