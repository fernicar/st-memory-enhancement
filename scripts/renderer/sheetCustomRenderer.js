import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
let sheet = null;
let config = {};
let selectedCustomStyle = null;

function staticPipeline(target) {
    console.log("Entering static rendering table");
    let regexReplace = selectedCustomStyle.replace || '';
    if (!regexReplace || regexReplace === '') return target?.element || '<div>Table data not loaded</div>';
    if (!target) return regexReplace;

    // New: Handle {{GET::...}} macro
    regexReplace = regexReplace.replace(/{{GET::\s*([^:]+?)\s*:\s*([A-Z]+\d+)\s*}}/g, (match, tableName, cellAddress) => {
        const sheets = BASE.getChatSheets();
        const sheet = sheets.find(s => s.name === tableName);
        if (!sheet) {
            return `<span style="color: red">[GET: Table not found "${tableName}"]</span>`;
        }

        try {
            const cell = sheet.getCellFromAddress(cellAddress);
            const cellValue = cell ? cell.data.value : undefined;
            return cellValue !== undefined ? cellValue : `<span style="color: orange">[GET: Cell not found in "${tableName}" at "${cellAddress}"]</span>`;
        } catch (error) {
            console.error(`Error resolving GET macro for ${tableName}:${cellAddress}`, error);
            return `<span style="color: red">[GET: Error during processing]</span>`;
        }
    });

    // Compatible with old ##...## syntax
    regexReplace = regexReplace.replace(/##([^:]+):([A-Z]+\d+)##/g, (match, tableName, cellAddress) => {
        const sheets = BASE.getChatSheets();
        const sheet = sheets.find(s => s.name === tableName);
        if (!sheet) {
            return `<span style="color: red">Table not found: ${tableName}</span>`;
        }
        
        const cell = sheet.getCellFromAddress(cellAddress);
        return cell ? (cell.data.value || `?`) :
            `<span style="color: red">No cell: ${cellAddress}</span>`;
    });

    // Original processing logic
    return regexReplace.replace(/\$(\w)(\d+)/g, (match, colLetter, rowNumber) => {
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        const rowIndex = parseInt(rowNumber);
        console.log("Static rendering row:", rowIndex, "Static rendering column:", colIndex);
        const c = target.findCellByPosition(rowIndex, colIndex);
        console.log("Get cell position:", c, '\nGet cell content:', c.data.value);
        return c ? (c.data.value || `<span style="color: red">?</span>`) :
            `<span style="color: red">No cell</span>`;
    });
}
/** Extract data values from a table instance
 *
 * @param {*} instance - The table instance object
 * @returns - A two-dimensional array of table data
 */
export function loadValueSheetBySheetHashSheet(instance) {
    if (!instance) return;
    return instance.hashSheet.map(row => row.map(hash => {
        const cell = instance.cells.get(hash);
        return cell ? cell.data.value : '';
    }));
}

function toArray(valueSheet, skipTop) {
    return skipTop ? valueSheet.slice(1) : valueSheet; // New: determine whether to skip the header
}

// Improve compatibility, can handle non-two-dimensional arrays
/**
 *
 * @param {*table} valueSheet - Data-based data table
 * @param {*boolean} skipTop - Whether to skip the header
 * @returns html format text
 */
function toHtml(valueSheet, skipTop = false) {
    if (!Array.isArray(valueSheet)) {
        return "<table></table>"; // Return an empty table
    }

    let html = '<table>';
    let isFirstRow = true;

    for (const row of valueSheet) {
        if (!Array.isArray(row)) {
            continue; // Skip non-array rows
        }

        // If skipTop is true and it's the first row, skip it
        if (skipTop && isFirstRow) {
            isFirstRow = false;
            continue;
        }

        html += '<tr>';
        for (const cell of row) {
            html += `<td>${cell ?? ""}</td>`; // Handle possible undefined/null
        }
        html += '</tr>';

        isFirstRow = false;
    }
    html += '</table>';
    return html;
}
/**
 *
 * @param {*table} valueSheet - Data-based data table
 * @param {*boolean} skipTop - Whether to skip the header
 * @returns cvs format text
 */
function toCSV(valueSheet, skipTop = false) {

    return skipTop ? valueSheet.slice(1).map(row => row.join(',')).join('\n') : valueSheet.map(row => row.join(',')).join('\n');
}

function toMarkdown(valueSheet) {
    // Convert valueSheet to Markdown table
    let markdown = '| ' + valueSheet[0].join(' | ') + ' |\n';
    markdown += '| ' + valueSheet[0].map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < valueSheet.length; i++) {
        markdown += '| ' + valueSheet[i].join(' | ') + ' |\n';
    }
    return markdown;
}

function toJSON(valueSheet) {
    // Convert valueSheet to JSON format
    const columns = valueSheet[0];
    const content = valueSheet.slice(1);
    const json = content.map(row => {
        const obj = {};
        for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = row[i];
        }
        return obj;
    });
    return JSON.stringify(json, null, 2);
}
/**
 * Use regex to parse table rendering styles
 * @param {Object} instance - The table object
 * @param {Object} rendererConfig - The rendering configuration
 * @returns {string} - The rendered HTML
 */
function regexReplacePipeline(text) {
    if (!text || text === '') return text;
    if (!selectedCustomStyle) return text;

    // Get regex and replace strings from the configuration
    const regexString = selectedCustomStyle.regex || '';
    const replaceString = selectedCustomStyle.replaceDivide || '';
    // console.log("Separated replacement text:", replaceString)
    // If either regex or replace is empty, return the original text
    if (!regexString || regexString === '') return text;

    try {
        // Extract regex pattern and flags
        let regexPattern = regexString;
        let regexFlags = '';

        // Check if the regex string is in format /pattern/flags
        const regexParts = regexString.match(/^\/(.*?)\/([gimuy]*)$/);
        if (regexParts) {
            regexPattern = regexParts[1];
            regexFlags = regexParts[2];
        }

        // Create a new RegExp object
        const regex = new RegExp(regexPattern, regexFlags);

        // Process the replacement string to handle escape sequences
        let processedReplaceString = replaceString
            .replace(/\\n/g, '\n')   // Convert \n to actual newlines
            .replace(/\\t/g, '\t')   // Convert \t to actual tabs
            .replace(/\\r/g, '\r')   // Convert \r to actual carriage returns
            .replace(/\\b/g, '\b')   // Convert \b to actual backspace
            .replace(/\\f/g, '\f')   // Convert \f to actual form feed
            .replace(/\\v/g, '\v')   // Convert \v to actual vertical tab
            .replace(/\\\\/g, '\\'); // Convert \\ to actual backslash
        // Apply the regex replacement first, add the function of circular replacement wrapped by specific tags
        let result = "";
        let cycleReplace = processedReplaceString.match(/<cycleDivide>([\s\S]*?)<\/cycleDivide>/);  //Get the circular replacement string

        if (cycleReplace) {
            let cycleReplaceString = cycleReplace[1]; //Without the cycleDivide tag
            const cycleReplaceRegex = cycleReplace[0]; //With the cycleDivide tag
            // console.log("Entering circular replacement, the obtained circular replacement string:", 'Type:', typeof cycleReplaceString, 'Content:', cycleReplaceString);
            processedReplaceString = processedReplaceString.replace(cycleReplaceRegex, "regexTemporaryString"); //Temporarily replace the circular replacement string
            cycleReplaceString = text.replace(regex, cycleReplaceString); //Replace the circular string code according to the regex
            // console.log("The string after circular replacement:", cycleReplaceString);
            result = processedReplaceString.replace("regexTemporaryString", cycleReplaceString);
        } else {
            result = text.replace(regex, processedReplaceString);
            // }
            // Now convert newlines to HTML <br> tags to ensure they display properly in HTML
            if (selectedCustomStyle.basedOn !== 'html' && selectedCustomStyle.basedOn !== 'csv') {  //Add the condition that it is not a CSV format text, currently it is tested that CSV will have rendering errors with this code
                result = result.replace(/\n/g, '<br>');
            }
        }
        return result;

    } catch (error) {
        console.error('Error in regex replacement:', error);
        return text; // Return original text on error
    }
}
/**
 * Get the latest plot content
 * @returns {string} - Get the latest plot content, regex out the thought chain
 */
function getLastPlot() {
    const chat = USER.getContext().chat;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].mes != "" && chat[i].is_user == false) {
            const regex1 = "<thinking>[\\s\\S]*?<\/thinking>";
            const regex2 = "Temporarily disable<tableEdit>[\\s\\S]*?<\/tableEdit>";  //Temporarily do not regex out the tableEdit content to see the effect
            const regex = new RegExp(`${regex1}|${regex2}`, "g")
            return chat[i].mes.replace(regex, '');
        }

    }
}
function triggerValueSheet(valueSheet = [], skipTop, alternateTable) {
    if (!Array.isArray(valueSheet)) {
        return Promise.reject(new Error("valueSheet must be an array type!"));
    }
    const lastchat = getLastPlot();
    let triggerArray = [];
    let i = 0;
    // console.log("Last chat content lastchat:", lastchat);
    // console.log("valueSheet is:", valueSheet);
    // console.log("valueSheet first row is:", valueSheet[0]);
    // console.log("Before determination, triggerArray is:", triggerArray);
    if (!alternateTable && !skipTop) {
        i = 1;
    }
    // console.log("Trigger array triggerArray is:", triggerArray, "\ni is:",i);
    for (i; i < valueSheet.length; i++) {
        // console.log("The trigger word is:", valueSheet[i][1], "The type is:", typeof valueSheet[i][1]);
        if (lastchat.includes(valueSheet[i][1])) {
            triggerArray.push(valueSheet[i]);
        }
    }
    return triggerArray;
}
/** A function for initializing text data, which converts table data into text in a specified format according to different format requirements.
 *
 * @param {*table} target - A single table object
 * @param {*string} selectedStyle - The format configuration object
 * @returns {*string} - The processed text of the table
 */
export function initializeText(target, selectedStyle) {
    let initialize = '';
    // console.log("Let's see what target is:"+target.config.triggerSendToChat); //For debugging, normally not enabled
    let valueSheet = target.tableSheet;  // Get table data, two-dimensional array
    // console.log(target.name,"Initialize text table:" , valueSheet);
    // New, determine whether to trigger sendToChat
    if (target.config.triggerSendToChat) {
        // console.log(target.name + "Enable trigger push" + valueSheet);
        valueSheet = triggerValueSheet(valueSheet, target.config.skipTop, target.config.alternateTable);
        // console.log(target.name + "Is valueSheet an array after retrieval:" + Array.isArray(valueSheet) + "\nWhat is valueSheet after retrieval:" + valueSheet);
    }
    const method = selectedStyle.basedOn || 'array';
    switch (method) {
        case 'array':
            initialize = toArray(valueSheet, target.config.skipTop);
            break;
        case 'html':
            initialize = toHtml(valueSheet, target.config.skipTop);
            break;
        case 'csv':
            initialize = toCSV(valueSheet, target.config.skipTop);
            break;
        case 'markdown':
            initialize = toMarkdown(valueSheet);
            break;
        case 'json':
            initialize = toJSON(valueSheet);
            break;
        default:
            console.error('Unsupported format:', method);
    }
    // console.log('Initialize value:', method, initialize);
    return initialize;
}

/**A pipeline function for processing regular expression replacement processes
 *
 * @param {Object} target - A single table object
 * @param {Object} rendererConfig - The rendering configuration
 * @returns {string} - The rendered HTML
 */
function regexPipeline(target, selectedStyle = selectedCustomStyle) {
    const initText = initializeText(target, selectedStyle);  //Initialize text
    // console.log(target.name,"Initialize text:", initText);
    let result = selectedStyle.replace || '';
    // console.log("The length of the initialized text", result.length);
    const r = result ? regexReplacePipeline(initText) : initText;  //If there is no replacement content, display the initialized content, otherwise perform regular expression replacement
    // console.log("The result after replacement:",r)
    return r
}
/** A function that renders the target element according to different custom style modes
 *
 * @param {*table} target - A single table, the target object to be rendered, containing the elements to be rendered
 * @returns {*Html} - The processed HTML string
 */
function executeRendering(target) {
    let resultHtml = target?.element || '<div>Table data not loaded</div>';
    if (config.useCustomStyle === false) {
        // resultHtml = target?.element || '<div>Table data not loaded</div>';
        throw new Error('Custom styles are not enabled, you need to exclude the case where config.useCustomStyle === false outside of parseSheetRender');
    }
    if (selectedCustomStyle.mode === 'regex') {
        resultHtml = regexPipeline(target);
    } else if (selectedCustomStyle.mode === 'simple') {
        resultHtml = staticPipeline(target);
    }
    return resultHtml;
}

/**
 * Parse table rendering styles
 * @param {Object} instance - The table object
 * @param {Object} rendererConfig - The rendering configuration
 * @returns {string} - The rendered HTML
 */
export function parseSheetRender(instance, rendererConfig = undefined) {
    let config;
    if (rendererConfig !== undefined) {
        config = rendererConfig;
    } else {
        // Use the config of the instance directly
        config = instance.config || {};  // Modify here
    }

    // Add defensive programming
    if (!config.customStyles) {
        config.customStyles = {};
    }
    if (!config.selectedCustomStyleKey) {
        config.selectedCustomStyleKey = 'default'; // Use default custom style
    }

    selectedCustomStyle = config.customStyles[config.selectedCustomStyleKey] || {};

    const r = executeRendering(instance);
    return r;
}
