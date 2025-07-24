// absoluteRefresh.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import {  convertOldTablesToNewSheets, executeTableEditActions, getTableEditTag } from "../../index.js";
import JSON5 from '../../utils/json5.min.mjs'
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { TableTwoStepSummary } from "./separateTableUpdate.js";
import { estimateTokenCount, handleCustomAPIRequest, handleMainAPIRequest } from "../settings/standaloneAPI.js";
import { profile_prompts } from "../../data/profile_prompts.js";
import { Form } from '../../components/formManager.js';
import { refreshRebuildTemplate } from "../settings/userExtensionSetting.js"
import { safeParse } from '../../utils/stringUtil.js';

// Add validation after parsing the response
function validateActions(actions) {
    if (!Array.isArray(actions)) {
        console.error('The action list must be an array');
        return false;
    }
    return actions.every(action => {
        // Check for required fields
        if (!action.action || !['insert', 'update', 'delete'].includes(action.action.toLowerCase())) {
            console.error(`Invalid action type: ${action.action}`);
            return false;
        }
        if (typeof action.tableIndex !== 'number') {
            console.error(`tableIndex must be a number: ${action.tableIndex}`);
            return false;
        }
        if (action.action !== 'insert' && typeof action.rowIndex !== 'number') {
            console.error(`rowIndex must be a number: ${action.rowIndex}`);
            return false;
        }
        // Check the data field
        if (action.data && typeof action.data === 'object') {
            const invalidKeys = Object.keys(action.data).filter(k => !/^\d+$/.test(k));
            if (invalidKeys.length > 0) {
                console.error(`Found non-numeric keys: ${invalidKeys.join(', ')}`);
                return false;
            }
        }
        return true;
    });
}

function confirmTheOperationPerformed(content) {
    console.log('content:', content);
    return `
<div class="wide100p padding5 dataBankAttachments">
    <div class="refresh-title-bar">
        <h2 class="refresh-title"> Please confirm the following operations </h2>
        <div>

        </div>
    </div>
    <div id="tableRefresh" class="refresh-scroll-content">
        <div>
            <div class="operation-list-container"> ${content.map(table => {
        return `
<h3 class="operation-list-title">${table.tableName}</h3>
<div class="operation-list">
    <table class="tableDom sheet-table">
        <thead>
            <tr>
                ${table.columns.map(column => `<th>${column}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${table.content.map(row => `
            <tr>
                ${row.map(cell => `<td>${cell}</td>`).join('')}
            </tr>
            `).join('')}
        </tbody>
    </table>
</div>
<hr>
`;
    }).join('')}
            </div>
        </div>
    </div>
</div>

<style>
    .operation-list-title {
        text-align: left;
        margin-top: 10px;
    }
    .operation-list-container {
        display: flex;
        flex-wrap: wrap;
    }
    .operation-list {
        width: 100%;
        max-width: 100%;
        overflow: auto;
    }
</style>
`;
}



/**
 * Initialize the table refresh type selector
 * Dynamically generate dropdown selector options based on the profile_prompts object
 */
export function initRefreshTypeSelector() {
    const $selector = $('#table_refresh_type_selector');
    if (!$selector.length) return;

    // Clear and re-add options
    $selector.empty();

    // Iterate through the profile_prompts object and add options
    Object.entries(profile_prompts).forEach(([key, value]) => {
        const option = $('<option></option>')
            .attr('value', key)
            .text((() => {
                switch (value.type) {
                    case 'refresh':
                        return '**Old** ' + (value.name || key);
                    case 'third_party':
                        return '**Third-party author** ' + (value.name || key);
                    default:
                        return value.name || key;
                }
            })());
        $selector.append(option);
    });

    // If there are no options, add a default option
    if ($selector.children().length === 0) {
        $selector.append($('<option></option>').attr('value', 'rebuild_base').text('~~~Something went wrong if you see this option~~~~'));
    }

    console.log('Table refresh type selector updated');

    // // Check if existing options are consistent with profile_prompts
    // let needsUpdate = false;
    // const currentOptions = $selector.find('option').map(function() {
    //     return {
    //         value: $(this).val(),
    //         text: $(this).text()
    //     };
    // }).get();

    // // Check if the number of options is consistent
    // if (currentOptions.length !== Object.keys(profile_prompts).length) {
    //     needsUpdate = true;
    // } else {
    //     // Check if the value and text of each option are consistent
    //     Object.entries(profile_prompts).forEach(([key, value]) => {
    //         const currentOption = currentOptions.find(opt => opt.value === key);
    //         if (!currentOption ||
    //             currentOption.text !== ((value.type=='refresh'? '**Old** ':'')+value.name|| key)) {
    //             needsUpdate = true;
    //         }
    //     });
    // }

    // // Clear and re-add options if they don't match
    // if (needsUpdate) {
    //     $selector.empty();

    //     // Iterate through the profile_prompts object and add options
    //     Object.entries(profile_prompts).forEach(([key, value]) => {
    //         const option = $('<option></option>')
    //             .attr('value', key)
    //             .text((value.type=='refresh'? '**Old** ':'')+value.name|| key);
    //         $selector.append(option);
    //     });

    //     // If there are no options, add a default option
    //     if ($selector.children().length === 0) {
    //         $selector.append($('<option></option>').attr('value', 'rebuild_base').text('~~~Something went wrong if you see this option~~~~'));
    //     }

    //     console.log('Table refresh type selector updated');
}



/**
 * Get the corresponding prompt template according to the selected refresh type and call rebuildTableActions
 * @param {string} templateName - The name of the prompt template
 * @param {string} additionalPrompt - Additional prompt content
 * @param {boolean} force - Whether to force refresh, do not display confirmation dialog
 * @param {boolean} isSilentUpdate - Whether to update silently, do not display operation confirmation
 * @param {string} chatToBeUsed - The chat history to be used, if it is empty, the recent chat history will be used
 * @returns {Promise<void>}
 */
export async function getPromptAndRebuildTable(templateName = '', additionalPrompt, force, isSilentUpdate = USER.tableBaseSetting.bool_silent_refresh, chatToBeUsed = '') {
    let r = '';
    try {
        r = await rebuildTableActions(force || true, isSilentUpdate, chatToBeUsed);
        return r;
    } catch (error) {
        console.error('Summary failed:', error);
        EDITOR.error(`Summary failed: ${error.message}`);
    }
}

/**
 * Regenerate the entire table
 * @param {*} force - Whether to force a refresh
 * @param {*} silentUpdate - Whether to update silently
 * @param chatToBeUsed
 * @returns
 */
export async function rebuildTableActions(force = false, silentUpdate = USER.tableBaseSetting.bool_silent_refresh, chatToBeUsed = '') {
    // #region Execute table summary
    let r = '';
    if (!SYSTEM.lazy('rebuildTableActions', 1000)) return;

    console.log('Starting to regenerate the entire table');
    const isUseMainAPI = $('#use_main_api').prop('checked');
    try {
        const { piece } = BASE.getLastSheetsPiece();
        if (!piece) {
            throw new Error('findLastestTableData did not return valid table data');
        }
        const latestTables = BASE.hashSheetsToSheets(piece.hash_sheets).filter(sheet => sheet.enable);
        DERIVED.any.waitingTable = latestTables;
        DERIVED.any.waitingTableIdMap = latestTables.map(table => table.uid);

        const tableJson = latestTables.map((table, index) => ({...table.getReadableJson(), tableIndex: index}));
        const tableJsonText = JSON.stringify(tableJson);

        // Extract header information
        const tableHeaders = latestTables.map(table => {
            return {
                tableId: table.uid,
                headers: table.getHeader()
            };
        });
        const tableHeadersText = JSON.stringify(tableHeaders);

        console.log('Header data (JSON):', tableHeadersText);
        console.log('Reorganizing - latest table data:', tableJsonText);

        // Get the latest clear_up_stairs chat records
        const chat = USER.getContext().chat;
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat,
            USER.tableBaseSetting.clear_up_stairs,
            USER.tableBaseSetting.ignore_user_sent,
            USER.tableBaseSetting.rebuild_token_limit_value
        ) : chatToBeUsed;

        // Build AI prompt
        const select = USER.tableBaseSetting.lastSelectedTemplate ?? "rebuild_base"
        const template = select === "rebuild_base" ? {
            name: "rebuild_base",
            system_prompt: USER.tableBaseSetting.rebuild_default_system_message_template,
            user_prompt_begin: USER.tableBaseSetting.rebuild_default_message_template,
        } : USER.tableBaseSetting.rebuild_message_template_list[select]
        if (!template) {
            console.error('Could not find the corresponding prompt template, please check the configuration', select, template);
            EDITOR.error('Could not find the corresponding prompt template, please check the configuration');
            return;
        }
        let systemPrompt = template.system_prompt
        let userPrompt = template.user_prompt_begin;

        let parsedSystemPrompt

        try {
            parsedSystemPrompt = JSON5.parse(systemPrompt)
            console.log('Parsed systemPrompt:', parsedSystemPrompt);
        } catch (error) {
            console.log("Failed to parse", error)
            parsedSystemPrompt = systemPrompt
        }

        const replacePrompt = (input) => {
            let output = input
            output = output.replace(/\$0/g, tableJsonText);
            output = output.replace(/\$1/g, lastChats);
            output = output.replace(/\$2/g, tableHeadersText);
            output = output.replace(/\$3/g, DERIVED.any.additionalPrompt ?? '');
            return output
        }

        if (typeof parsedSystemPrompt === 'string') {
            // Search for the $0 and $1 fields in systemPrompt, replace $0 with originText, and replace $1 with lastChats
            parsedSystemPrompt = replacePrompt(parsedSystemPrompt);
        } else {
            parsedSystemPrompt = parsedSystemPrompt.map(mes => ({ ...mes, content: replacePrompt(mes.content) }))
        }


        // Search for the $0 and $1 fields in userPrompt, replace $0 with originText, replace $1 with lastChats, and replace $2 with an empty header
        userPrompt = userPrompt.replace(/\$0/g, tableJsonText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);
        userPrompt = userPrompt.replace(/\$2/g, tableHeadersText);
        userPrompt = userPrompt.replace(/\$3/g, DERIVED.any.additionalPrompt ?? '');

        console.log('systemPrompt:', parsedSystemPrompt);
        // console.log('userPrompt:', userPrompt);

        // Generate response content
        let rawContent;
        if (isUseMainAPI) {
            try {
                rawContent = await handleMainAPIRequest(parsedSystemPrompt, userPrompt);
                if (rawContent === 'suspended') {
                    EDITOR.info('Operation cancelled');
                    return
                }
            } catch (error) {
                EDITOR.clear();
                EDITOR.error('Main API request error: ' , error.message, error);
                console.error('Main API request error:', error);
            }
        }
        else {
            try {
                rawContent = await handleCustomAPIRequest(parsedSystemPrompt, userPrompt);
                if (rawContent === 'suspended') {
                    EDITOR.clear();
                    EDITOR.info('Operation cancelled');
                    return
                }
            } catch (error) {
                EDITOR.clear();
                EDITOR.error('Custom API request error: ' , error.message, error);
            }
        }
        console.log('rawContent:', rawContent);

        // Check if rawContent is valid
        if (typeof rawContent !== 'string') {
            EDITOR.clear();
            EDITOR.error('Invalid API response content, cannot continue processing the table.');
            console.error('Invalid API response content, rawContent:', rawContent);
            return;
        }

        if (!rawContent.trim()) {
            EDITOR.clear();
            EDITOR.error('API response content is empty, an empty reply is usually a jailbreak issue');
            console.error('API response content is empty, rawContent:', rawContent);
            return;
        }

        const temp = USER.tableBaseSetting.rebuild_message_template_list[USER.tableBaseSetting.lastSelectedTemplate];
        if (temp && temp.parseType === 'text') {
            showTextPreview(rawContent);
        }

        console.log('Response content is as follows:', rawContent);
        let cleanContentTable = null;
        try{
            const parsed = safeParse(rawContent);
            cleanContentTable = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
        }catch (error) {
            console.error('Failed to parse response content:', error);
            EDITOR.clear();
            EDITOR.error('Failed to parse response content, please check if the API returned content is in the expected format.', error.message, error);
            showErrorTextPreview(rawContent);
            return;
        }
        
        console.log('cleanContent:', cleanContentTable);

        // Save the table back
        if (cleanContentTable) {
            try {
                // Validate data format
                if (!Array.isArray(cleanContentTable)) {
                    throw new Error("The generated new table data is not an array");
                }

                // If not silent update, show operation confirmation
                if (!silentUpdate) {
                    // Push the uniqueActions content to the user for confirmation to continue
                    const confirmContent = confirmTheOperationPerformed(cleanContentTable);
                    const tableRefreshPopup = new EDITOR.Popup(confirmContent, EDITOR.POPUP_TYPE.TEXT, '', { okButton: "Continue", cancelButton: "Cancel" });
                    EDITOR.clear();
                    await tableRefreshPopup.show();
                    if (!tableRefreshPopup.result) {
                        EDITOR.info('Operation cancelled');
                        return;
                    }
                }

                // Update chat history
                const { piece } = USER.getChatPiece()
                if (piece) {
                    for (const index in cleanContentTable) {
                        let sheet;
                        const table = cleanContentTable[index];
                        if (table.tableUid){
                            sheet = BASE.getChatSheet(table.tableUid)
                        }else if(table.tableIndex !== undefined) {
                            const uid = DERIVED.any.waitingTableIdMap[table.tableIndex]
                            sheet = BASE.getChatSheet(uid)
                        }else{
                            const uid = DERIVED.any.waitingTableIdMap[index]
                            sheet = BASE.getChatSheet(uid)
                        }
                        if(!sheet) {
                            console.error(`Could not find the sheet corresponding to table ${table.tableName}`);
                            continue;
                        }
                        const valueSheet = [table.columns, ...table.content].map(row => ['', ...row])
                        sheet.rebuildHashSheetByValueSheet(valueSheet);
                        sheet.save(piece, true)
                    }
                    await USER.getContext().saveChat(); // Wait for saving to complete
                } else {
                    throw new Error("Chat history is empty, please have at least one chat record before summarizing");
                }

                BASE.refreshContextView();
                updateSystemMessageTableStatus();
                EDITOR.success('Table generated successfully!');
            } catch (error) {
                console.error('Error saving table:', error);
                EDITOR.error(`Failed to generate table`, error.message, error);
            }
        } else {
            EDITOR.error("Failed to save generated table: content is empty");
            true
        }

    } catch (e) {
        console.error('Error in rebuildTableActions:', e);
        return;
    } finally {

    }
    // #endregion
}

async function showTextPreview(text) {
    const previewHtml = `
        <div>
            <span style="margin-right: 10px;">The returned summary result, please copy and use</span>
        </div>
        <textarea rows="10" style="width: 100%">${text}</textarea>
    `;

    const popup = new EDITOR.Popup(previewHtml, EDITOR.POPUP_TYPE.TEXT, '', { wide: true });
    await popup.show();
}

async function showErrorTextPreview(text) {
    const previewHtml = `
        <div>
            <span style="margin-right: 10px;">This is the information returned by the AI, which cannot be parsed by the script and has stopped</span>
        </div>
        <textarea rows="10" style="width: 100%">${text}</textarea>
    `;

    const popup = new EDITOR.Popup(previewHtml, EDITOR.POPUP_TYPE.TEXT, '', { wide: true });
    await popup.show();
}

export async function rebuildSheets() {
    const container = document.createElement('div');
    console.log('Test start');


    const style = document.createElement('style');
    style.innerHTML = `
        .rebuild-preview-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .rebuild-preview-text {
            display: flex;
            justify-content: left
        }
    `;
    container.appendChild(style);

    // Replace jQuery append with standard DOM methods
    const h3Element = document.createElement('h3');
    h3Element.textContent = 'Rebuild table data';
    container.appendChild(h3Element);

    const previewDiv1 = document.createElement('div');
    previewDiv1.className = 'rebuild-preview-item';
    previewDiv1.innerHTML = `<span>Confirm after execution?:</span>${USER.tableBaseSetting.bool_silent_refresh ? 'No' : 'Yes'}`;
    container.appendChild(previewDiv1);

    const previewDiv2 = document.createElement('div');
    previewDiv2.className = 'rebuild-preview-item';
    previewDiv2.innerHTML = `<span>API:</span>${USER.tableBaseSetting.use_main_api ? 'Use main API' : 'Use alternate API'}`;
    container.appendChild(previewDiv2);

    const hr = document.createElement('hr');
    container.appendChild(hr);

    // Create selector container
    const selectorContainer = document.createElement('div');
    container.appendChild(selectorContainer);

    // Add prompt template selector
    const selectorContent = document.createElement('div');
    selectorContent.innerHTML = `
        <span class="rebuild-preview-text" style="margin-top: 10px">Prompt template:</span>
        <select id="rebuild_template_selector" class="rebuild-preview-text text_pole" style="width: 100%">
            <option value="">Loading...</option>
        </select>
        <span class="rebuild-preview-text" style="margin-top: 10px">Template information:</span>
        <div id="rebuild_template_info" class="rebuild-preview-text" style="margin-top: 10px"></div>
        <span class="rebuild-preview-text" style="margin-top: 10px">Other requirements:</span>
        <textarea id="rebuild_additional_prompt" class="rebuild-preview-text text_pole" style="width: 100%; height: 80px;"></textarea>
    `;
    selectorContainer.appendChild(selectorContent);

    // Initialize selector options
    const $selector = $(selectorContent.querySelector('#rebuild_template_selector'))
    const $templateInfo = $(selectorContent.querySelector('#rebuild_template_info'))
    const $additionalPrompt = $(selectorContent.querySelector('#rebuild_additional_prompt'))
    $selector.empty(); // Clear loading state

    const temps = USER.tableBaseSetting.rebuild_message_template_list
    // Add options
    Object.entries(temps).forEach(([key, prompt]) => {

        $selector.append(
            $('<option></option>')
                .val(key)
                .text(prompt.name || key)
        );
    });

    // Set default selected item
    // Read the last selected option from USER, if not, use the default value
    const defaultTemplate = USER.tableBaseSetting?.lastSelectedTemplate || 'rebuild_base';
    $selector.val(defaultTemplate);
    // Update template information display
    if (defaultTemplate === 'rebuild_base') {
        $templateInfo.text("Default template, suitable for Gemini, Grok, DeepSeek, uses chat history and table information to rebuild the table, applied to initial table filling, table optimization and other scenarios. Jailbreak comes from TT teacher.");
    } else {
        const templateInfo = temps[defaultTemplate]?.info || 'No template information';
        $templateInfo.text(templateInfo);
    }


    // Listen for selector changes
    $selector.on('change', function () {
        const selectedTemplate = $(this).val();
        const template = temps[selectedTemplate];
        $templateInfo.text(template.info || 'No template information');
    })



    const confirmation = new EDITOR.Popup(container, EDITOR.POPUP_TYPE.CONFIRM, '', {
        okButton: "Continue",
        cancelButton: "Cancel"
    });

    await confirmation.show();
    if (confirmation.result) {
        const selectedTemplate = $selector.val();
        const additionalPrompt = $additionalPrompt.val();
        USER.tableBaseSetting.lastSelectedTemplate = selectedTemplate; // Save user-selected template
        DERIVED.any.additionalPrompt = additionalPrompt; // Save additional prompt content
        getPromptAndRebuildTable();
    }
}

// Parse tablesData back to a Table array
function tableDataToTables(tablesData) {
    return tablesData.map(item => {
        // Forcefully ensure that columns is an array and its elements are strings
        const columns = Array.isArray(item.columns)
            ? item.columns.map(col => String(col)) // Forcefully convert to a string
            : inferColumnsFromContent(item.content); // Infer from content
        return {
            tableName: item.tableName || 'Unnamed Table',
            columns,
            content: item.content || [],
            insertedRows: item.insertedRows || [],
            updatedRows: item.updatedRows || []
        }
    });
}

function inferColumnsFromContent(content) {
    if (!content || content.length === 0) return [];
    const firstRow = content[0];
    return firstRow.map((_, index) => `Column ${index + 1}`);
}

/**
* Extract chat history acquisition function
* Extract the latest chatStairs chat records
* @param {Array} chat - The chat history array
* @param {number} chatStairs - The number of chat records to extract
* @param {boolean} ignoreUserSent - Whether to ignore messages sent by the user
* @param {number|null} tokenLimit - The maximum token limit, null means no limit, has higher priority than chatStairs
* @returns {string} The extracted chat history string
*/
async function getRecentChatHistory(chat, chatStairs, ignoreUserSent = false, tokenLimit = 0) {
    let filteredChat = chat;

    // Handle ignoring messages sent by the user
    if (ignoreUserSent && chat.length > 0) {
        filteredChat = chat.filter(c => c.is_user === false);
    }

    // Valid record prompt
    if (filteredChat.length < chatStairs && tokenLimit === 0) {
        EDITOR.success(`There are currently ${filteredChat.length} valid records, which is less than the set ${chatStairs}`);
    }

    const collected = [];
    let totalTokens = 0;

    // Traverse in reverse order from the latest record
    for (let i = filteredChat.length - 1; i >= 0; i--) {
        // Format the message and clean up the tags
        const currentStr = `${filteredChat[i].name}: ${filteredChat[i].mes}`
            .replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');

        // Calculate tokens
        const tokens = await estimateTokenCount(currentStr);

        // If it is the first message and the number of tokens exceeds the limit, add the message directly
        if (i === filteredChat.length - 1 && tokenLimit !== 0 && tokens > tokenLimit) {
            totalTokens = tokens;
            EDITOR.success(`The number of tokens in the latest chat record is ${tokens}, which exceeds the set limit of ${tokenLimit}. This chat record will be used directly.`);
            console.log(`The number of tokens in the latest chat record is ${tokens}, which exceeds the set limit of ${tokenLimit}. This chat record will be used directly.`);
            collected.push(currentStr);
            break;
        }

        // Token limit check
        if (tokenLimit !== 0 && (totalTokens + tokens) > tokenLimit) {
            EDITOR.success(`The number of tokens sent in this chat record is approximately ${totalTokens}, for a total of ${collected.length} messages.`);
            console.log(`The number of tokens sent in this chat record is approximately ${totalTokens}, for a total of ${collected.length} messages.`);
            break;
        }

        // Update count
        totalTokens += tokens;
        collected.push(currentStr);

        // When tokenLimit is 0, check the number of chat records
        if (tokenLimit === 0 && collected.length >= chatStairs) {
            break;
        }
    }

    // Arrange in chronological order and concatenate
    const chatHistory = collected.reverse().join('\n');
    return chatHistory;
}

/**
 * Fix table format
 * @param {string} inputText - The input text
 * @returns {string} The fixed text
 * */
function fixTableFormat(inputText) {
    try {
        return safeParse(inputText);
    } catch (error) {
        console.error("Fix failed:", error);
        const popup = new EDITOR.Popup(`The script cannot parse the returned data. It may be a jailbreak issue or an output format issue. Here is the returned data:<div>${inputText}</div>`, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "OK" });
        popup.show();
        throw new Error('Cannot parse table data');
    }
}

window.fixTableFormat = fixTableFormat; // Expose to global

/**
 * Modify reorganization template
 */
export async function modifyRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    const sheetConfig = {
        formTitle: "Edit Table Summary Template",
        formDescription: "Set the prompt structure for summarization, $0 is the current table data, $1 is the context chat history, $2 is the table template [header] data, and $3 is the additional prompt entered by the user",
        fields: [
            { label: 'Template Name:', type: 'label', text: selectedTemplate },
            { label: 'System Prompt', type: 'textarea', rows: 6, dataKey: 'system_prompt', description: '(Fill in the jailbreak, or directly fill in the overall json structure of the prompt. If you fill in the structure, the organization rules will be overridden)' },
            { label: 'Summary Rules', type: 'textarea', rows: 6, dataKey: 'user_prompt_begin', description: '(Used to explain to the AI how to reorganize)' },
        ],
    }
    let initialData = null
    if (selectedTemplate === 'rebuild_base')
        return EDITOR.warning('The default template cannot be modified, please create a new template');
    else
        initialData = USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate]
    const formInstance = new Form(sheetConfig, initialData);
    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Save", allowVerticalScrolling: true, cancelButton: "Cancel" });
    await popup.show();
    if (popup.result) {
        const result = formInstance.result();
        USER.tableBaseSetting.rebuild_message_template_list = {
            ...USER.tableBaseSetting.rebuild_message_template_list,
            [selectedTemplate]: {
                ...result,
                name: selectedTemplate,
            }
        }
        EDITOR.success(`Template "${selectedTemplate}" modified successfully`);
    }
}
/*         

/**
 * Create a new reorganization template
 */
export async function newRebuildTemplate() {
    const sheetConfig = {
        formTitle: "New Table Summary Template",
        formDescription: "Set the prompt structure for table summarization, $0 is the current table data, $1 is the context chat history, $2 is the table template [header] data, and $3 is the additional prompt entered by the user",
        fields: [
            { label: 'Template Name', type: 'text', dataKey: 'name' },
            { label: 'System Prompt', type: 'textarea', rows: 6, dataKey: 'system_prompt', description: '(Fill in the jailbreak, or directly fill in the overall json structure of the prompt. If you fill in the structure, the organization rules will be overridden)' },
            { label: 'Organization Rules', type: 'textarea', rows: 6, dataKey: 'user_prompt_begin', description: '(Used to explain to the AI how to reorganize)' },
        ],
    }
    const initialData = {
        name: "New Table Summary Template",
        system_prompt: USER.tableBaseSetting.rebuild_default_system_message_template,
        user_prompt_begin: USER.tableBaseSetting.rebuild_default_message_template,
    };
    const formInstance = new Form(sheetConfig, initialData);
    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Save", allowVerticalScrolling: true, cancelButton: "Cancel" });
    await popup.show();
    if (popup.result) {
        const result = formInstance.result();
        const name = createUniqueName(result.name)
        result.name = name;
        USER.tableBaseSetting.rebuild_message_template_list = {
            ...USER.tableBaseSetting.rebuild_message_template_list,
            [name]: result
        }
        USER.tableBaseSetting.lastSelectedTemplate = name;
        refreshRebuildTemplate()
        EDITOR.success(`New template "${name}" created successfully`);
    }
}

/**
 * Create a unique name
 * @param {string} baseName - The base name
 */
function createUniqueName(baseName) {
    let name = baseName;
    let counter = 1;
    while (USER.tableBaseSetting.rebuild_message_template_list[name]) {
        name = `${baseName} (${counter})`;
        counter++;
    }
    return name;
}

/**
 * Delete reorganization template
 */
export async function deleteRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    if (selectedTemplate === 'rebuild_base') {
        return EDITOR.warning('The default template cannot be deleted');
    }
    const confirmation = await EDITOR.callGenericPopup('Are you sure you want to delete this template?', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Continue", cancelButton: "Cancel" });
    if (confirmation) {
        const newTemplates = {};
        Object.values(USER.tableBaseSetting.rebuild_message_template_list).forEach((template) => {
            if (template.name !== selectedTemplate) {
                newTemplates[template.name] = template;
            }
        });
        USER.tableBaseSetting.rebuild_message_template_list = newTemplates;
        USER.tableBaseSetting.lastSelectedTemplate = 'rebuild_base';
        refreshRebuildTemplate();
        EDITOR.success(`Template "${selectedTemplate}" deleted successfully`);
    }
}

/**
 * Export reorganization template
 */
export async function exportRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    if (selectedTemplate === 'rebuild_base') {
        return EDITOR.warning('The default template cannot be exported');
    }
    const template = USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate];
    if (!template) {
        return EDITOR.error(`Template "${selectedTemplate}" not found`);
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    EDITOR.success(`Template "${selectedTemplate}" exported successfully`);
}

/**
 * Import reorganization template
 */
export async function importRebuildTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            EDITOR.error('No file selected');
            return;
        }
        try {
            const text = await file.text();
            const template = JSON.parse(text);
            if (!template.name || !template.system_prompt || !template.user_prompt_begin) {
                throw new Error('Invalid template format');
            }
            const name = createUniqueName(template.name);
            template.name = name;
            USER.tableBaseSetting.rebuild_message_template_list = {
                ...USER.tableBaseSetting.rebuild_message_template_list,
                [name]: template
            };
            USER.tableBaseSetting.lastSelectedTemplate = name;
            refreshRebuildTemplate();
            EDITOR.success(`Template "${name}" imported successfully`);
        } catch (error) {
            EDITOR.error(`Import failed`, error.message, error);
        } finally {
            document.body.removeChild(input);
        }
    });

    input.click();
}

/**
 * Manually trigger a step-by-step table filling
 */
export async function triggerStepByStepNow() {
    console.log('[Memory Enhancement] Manually triggering step-by-step update...');
    TableTwoStepSummary("manual")
}

/**
 * Execute incremental update (can be used for normal refresh and step-by-step summary)
 * @param {string} chatToBeUsed - The chat history to be used, if empty, the latest chat history will be used
 * @param {string} originTableText - The text representation of the current table
 * @param {Array} referencePiece - The reference piece to use
 * @param {boolean} useMainAPI - Whether to use the main API
 * @param {boolean} silentUpdate - Whether to update silently, without displaying operation confirmation
 * @param {boolean} [isSilentMode=false] - Whether to run the API call in silent mode (without displaying a loading prompt)
 * @returns {Promise<string>} 'success', 'suspended', 'error', or empty
 */
export async function executeIncrementalUpdateFromSummary(
    chatToBeUsed = '',
    originTableText,
    finalPrompt,
    referencePiece,
    useMainAPI,
    silentUpdate = USER.tableBaseSetting.bool_silent_refresh,
    isSilentMode = false
) {
    if (!SYSTEM.lazy('executeIncrementalUpdate', 1000)) return '';

    try {
        DERIVED.any.waitingPiece = referencePiece;
        const separateReadContextLayers = Number($('#separateReadContextLayers').val());
        const contextChats = await getRecentChatHistory(USER.getContext().chat, separateReadContextLayers, true);
        const summaryChats = chatToBeUsed;

        // Get character world book content
        let lorebookContent = '';
        if (USER.tableBaseSetting.separateReadLorebook && window.TavernHelper) {
            try {
                const charLorebooks = await window.TavernHelper.getCharLorebooks({ type: 'all' });
                const bookNames = [];
                if (charLorebooks.primary) {
                    bookNames.push(charLorebooks.primary);
                }
                if (charLorebooks.additional && charLorebooks.additional.length > 0) {
                    bookNames.push(...charLorebooks.additional);
                }

                for (const bookName of bookNames) {
                    if (bookName) {
                        const entries = await window.TavernHelper.getLorebookEntries(bookName);
                        if (entries && entries.length > 0) {
                            lorebookContent += entries.map(entry => entry.content).join('\n');
                        }
                    }
                }
            } catch (e) {
                console.error('[Memory Enhancement] Error fetching lorebook content:', e);
            }
        }

        let systemPromptForApi;
        let userPromptForApi;

        console.log("[Memory Enhancement] Step-by-step summary: Parsing and using multi-message template string.");
        const stepByStepPromptString = USER.tableBaseSetting.step_by_step_user_prompt;
        let promptMessages;

        try {
            promptMessages = JSON5.parse(stepByStepPromptString);
            if (!Array.isArray(promptMessages) || promptMessages.length === 0) {
                throw new Error("Parsed prompt is not a valid non-empty array.");
            }
        } catch (e) {
            console.error("Error parsing step_by_step_user_prompt string:", e, "Raw string:", stepByStepPromptString);
            EDITOR.error("Independent table filling prompt format error, cannot parse. Please check the plugin settings.", e.message, e);
            return 'error';
        }

        const replacePlaceholders = (text) => {
            if (typeof text !== 'string') return '';
            text = text.replace(/(?<!\\)\$0/g, () => originTableText);
            text = text.replace(/(?<!\\)\$1/g, () => contextChats);
            text = text.replace(/(?<!\\)\$2/g, () => summaryChats);
            text = text.replace(/(?<!\\)\$3/g, () => finalPrompt);
            text = text.replace(/(?<!\\)\$4/g, () => lorebookContent);
            return text;
        };

        // Fully process the message array, replacing placeholders in each message
        const processedMessages = promptMessages.map(msg => ({
            ...msg,
            content: replacePlaceholders(msg.content)
        }));

        // Pass the processed full message array to the API request processing function
        systemPromptForApi = processedMessages;
        userPromptForApi = null; // In this case, userPromptForApi is no longer needed

        console.log("Step-by-step: Prompts constructed from parsed multi-message template and sent as an array.");

        // Print the final data to be sent to the API
        if (Array.isArray(systemPromptForApi)) {
            console.log('API-bound data (as message array):', systemPromptForApi);
            const totalContent = systemPromptForApi.map(m => m.content).join('');
            console.log('Estimated token count:', estimateTokenCount(totalContent));
        } else {
            console.log('System Prompt for API:', systemPromptForApi);
            console.log('User Prompt for API:', userPromptForApi);
            console.log('Estimated token count:', estimateTokenCount(systemPromptForApi + (userPromptForApi || '')));
        }

        let rawContent;
        if (useMainAPI) { // Using Main API
            try {
                // If it's step-by-step summary, systemPromptForApi is already the message array
                // Pass the array as the first arg and null/empty as the second for multi-message format
                // Otherwise, pass the separate system and user prompts for normal refresh
                rawContent = await handleMainAPIRequest(
                    systemPromptForApi,
                    null,
                    isSilentMode
                );
                if (rawContent === 'suspended') {
                    EDITOR.info('Operation cancelled (Main API)');
                    return 'suspended';
                }
            } catch (error) {
                console.error('Main API request error:', error);
                EDITOR.error('Main API request error: ' , error.message, error);
                return 'error';
            }
        } else { // Using Custom API
            try {
                rawContent = await handleCustomAPIRequest(systemPromptForApi, userPromptForApi, true, isSilentMode);
                if (rawContent === 'suspended') {
                    EDITOR.info('Operation cancelled (Custom API)');
                    return 'suspended';
                }
            } catch (error) {
                EDITOR.error('Custom API request error: ' , error.message, error);
                return 'error';
            }
        }

        if (typeof rawContent !== 'string' || !rawContent.trim()) {
            EDITOR.error('Invalid or empty API response content.');
            return 'error';
        }

        // **Core fix**: Use the same getTableEditTag function as for regular table filling to extract instructions
        const { matches } = getTableEditTag(rawContent);

        if (!matches || matches.length === 0) {
            EDITOR.info("AI did not return any valid <tableEdit> operation instructions, the table content has not changed.");
            return 'success';
        }

        try {
            // Pass the extracted, unmodified original instruction array to the executor
            executeTableEditActions(matches, referencePiece)
        } catch (e) {
            EDITOR.error("Error executing table operation instructions: ", e.message, e);
            console.error("Original error text: ", matches.join('\n'));
        }
        USER.saveChat()
        BASE.refreshContextView();
        updateSystemMessageTableStatus();
        EDITOR.success('Independent table filling completed!');
        return 'success';

    } catch (error) {
        console.error('Error executing incremental update:', error);
        EDITOR.error(`Failed to execute incremental update`, error.message, error);
        console.log('[Memory Enhancement Plugin] Error context:', {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
        });
        return 'error';
    }
}
