import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import {updateSystemMessageTableStatus, updateAlternateTable} from "../renderer/tablePushToChat.js";
import {rebuildSheets , modifyRebuildTemplate, newRebuildTemplate, deleteRebuildTemplate, exportRebuildTemplate, importRebuildTemplate, triggerStepByStepNow} from "../runtime/absoluteRefresh.js";
import {generateDeviceId} from "../../utils/utility.js";
import {updateModelList, handleApiTestRequest ,processApiKey} from "./standaloneAPI.js";
import {filterTableDataPopup} from "../../data/pluginSetting.js";
import {initRefreshTypeSelector} from "../runtime/absoluteRefresh.js";
import {rollbackVersion} from "../../services/debugs.js";
import {customSheetsStylePopup} from "../editor/customSheetsStyle.js";
import {openAppHeaderTableDrawer} from "../renderer/appHeaderTableBaseDrawer.js";

/**
 * Format depth settings
 */
function formatDeep() {
    USER.tableBaseSetting.deep = Math.abs(USER.tableBaseSetting.deep)
}

/**
 * Update the switch status in the settings
 */
function updateSwitch(selector, switchValue) {
    if (switchValue) {
        $(selector).prop('checked', true);
    } else {
        $(selector).prop('checked', false);
    }
}

/**
 * Update the table structure DOM in the settings
 */
function updateTableView() {
    const show_drawer_in_extension_list = USER.tableBaseSetting.show_drawer_in_extension_list;
    const extensionsMenu = document.querySelector('#extensionsMenu');
    const show_settings_in_extension_menu = USER.tableBaseSetting.show_settings_in_extension_menu;
    const alternate_switch = USER.tableBaseSetting.alternate_switch;
    const extensions_settings = document.querySelector('#extensions_settings');

    if (show_drawer_in_extension_list === true) {
        // If it doesn't exist, create it
        if (document.querySelector('#drawer_in_extension_list_button')) return
        $(extensionsMenu).append(`
<div id="drawer_in_extension_list_button" class="list-group-item flex-container flexGap5 interactable">
    <div class="fa-solid fa-table extensionsMenuExtensionButton"></div>
    <span>Enhanced Memory Table</span>
</div>
`);
        // Set click event
        $('#drawer_in_extension_list_button').on('click', () => {
            // $('#table_drawer_icon').click()
            openAppHeaderTableDrawer('database');
        });
    } else {
        document.querySelector('#drawer_in_extension_list_button')?.remove();
    }

//     if (show_drawer_in_extension_list === true) {
//         // If it doesn't exist, create it
//         if (document.querySelector('#drawer_in_extension_list_button')) return
//         $(extensions_settings).append(`
// <div id="drawer_in_extension_list_button" class="list-group-item flex-container flexGap5 interactable">
// </div>
// `);
//     } else {
//
//     }
}

function getSheetsCellStyle() {
    const style = document.createElement('style');  // Add a style to the content of sheetContainer
    // Get the sheetContainer element
    const cellWidth = USER.tableBaseSetting.table_cell_width_mode
    let sheet_cell_style_container = document.querySelector('#sheet_cell_style_container');
    if (sheet_cell_style_container) {
        // Clear existing styles
        sheet_cell_style_container.innerHTML = '';
    } else {
        // Create a new sheet_cell_style_container element
        sheet_cell_style_container = document.createElement('div');
        sheet_cell_style_container.id = 'sheet_cell_style_container';
        document.body.appendChild(sheet_cell_style_container);
    }
    switch (cellWidth) {
        case 'single_line':
            style.innerHTML = ``;
            break;
        case 'wide1_cell':
            style.innerHTML = ` tr .sheet-cell { max-width: 800px !important; white-space: normal !important; } `;
            break;
        case 'wide1_2_cell':
            style.innerHTML = ` tr .sheet-cell { max-width: 400px !important; white-space: normal !important; } `;
            break;
        case 'wide1_4_cell':
            style.innerHTML = ` tr .sheet-cell { max-width: 200px !important; white-space: normal !important; } `;
            break;
    }
    sheet_cell_style_container.appendChild(style);
}

/**
 * Convert table structure to settings DOM
 * @param {object} tableStructure The table structure
 * @returns The settings DOM
 */
function tableStructureToSettingDOM(tableStructure) {
    const tableIndex = tableStructure.tableIndex;
    const $item = $('<div>', { class: 'dataTable_tableEditor_item' });
    const $index = $('<div>').text(`#${tableIndex}`); // Number
    const $input = $('<div>', {
        class: 'tableName_pole margin0',
    });
    $input.text(tableStructure.tableName);
    const $checkboxLabel = $('<label>', { class: 'checkbox' });
    const $checkbox = $('<input>', { type: 'checkbox', 'data-index': tableIndex, checked: tableStructure.enable, class: 'tableEditor_switch' });
    $checkboxLabel.append($checkbox, 'Enable');
    const $editButton = $('<div>', {
        class: 'menu_button menu_button_icon fa-solid fa-pencil tableEditor_editButton',
        title: 'Edit',
        'data-index': tableIndex, // Bind index
    }).text('Edit');
    $item.append($index, $input, $checkboxLabel, $editButton);
    return $item;
}

/**
 * Import plugin settings
 */
async function importTableSet() {
    // Create an input element to select a file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json'; // Restrict file type to JSON

    // Listen for the change event of the input element, which is triggered when the user selects a file
    input.addEventListener('change', async (event) => {
        const file = event.target.files[0]; // Get the file selected by the user

        if (!file) {
            return; // The user did not select a file, return directly
        }

        const reader = new FileReader(); // Create a FileReader object to read the file content

        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result); // Parse the JSON file content

                // Get the first-level keys of the imported JSON
                const firstLevelKeys = Object.keys(importedData);

                // Build the HTML structure to display the first-level keys
                let keyListHTML = '<ul>';
                firstLevelKeys.forEach(key => {
                    keyListHTML += `<li>${key}</li>`;
                });
                keyListHTML += '</ul>';

                const tableInitPopup = $(`<div>
                    <p>Settings to be imported (first level):</p>
                    ${keyListHTML}
                    <p>Do you want to continue importing and reset these settings?</p>
                </div>`);

                const confirmation = await EDITOR.callGenericPopup(tableInitPopup, EDITOR.POPUP_TYPE.CONFIRM, 'Import Settings Confirmation', { okButton: "Continue Import", cancelButton: "Cancel" });
                if (!confirmation) return; // User canceled the import

                // After the user confirms the import, apply the data
                // Note: Here it is assumed that you need to merge all the content of importedData into USER.tableBaseSetting
                // You may need to adjust the data merging logic according to your actual needs, for example, only merge the data corresponding to the first-level keys, or perform a more fine-grained merge
                for (let key in importedData) {
                    USER.tableBaseSetting[key] = importedData[key];
                }

                renderSetting(); // Re-render the settings interface to apply the new settings
                // Re-convert the template
                initTableStructureToTemplate()
                BASE.refreshTempView(true) // Refresh the template view
                EDITOR.success('Imported successfully and reset selected settings'); // Prompt the user that the import was successful

            } catch (error) {
                EDITOR.error('JSON file parsing failed, please check if the file format is correct.', error.message, error); // Prompt that JSON parsing failed
                console.error("File reading or parsing error:", error); // Print detailed error information to the console
            }
        };

        reader.onerror = (error) => {
            EDITOR.error(`File reading failed`, error.message, error); // Prompt that file reading failed
        };

        reader.readAsText(file); // Read the file content as text
    });

    input.click(); // Simulate clicking the input element to pop up the file selection box
}

/**
 * Export plugin settings
 */
async function exportTableSet() {
    templateToTableStructure()
    const { filterData, confirmation } = await filterTableDataPopup(USER.tableBaseSetting,"Please select the data to export","")
    if (!confirmation) return;

    try {
        const blob = new Blob([JSON.stringify(filterData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a')
        a.href = url;
        a.download = `tableCustomConfig-${SYSTEM.generateRandomString(8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        EDITOR.success('Exported successfully');
    } catch (error) {
        EDITOR.error(`Export failed`, error.message, error);
    }
}

/**
 * Reset settings
 */
async function resetSettings() {
    const { filterData, confirmation } = await filterTableDataPopup(USER.tableBaseDefaultSettings, "Please select the data to reset","It is recommended to back up the data before resetting")
    if (!confirmation) return;

    try {
        for (let key in filterData) {
            USER.tableBaseSetting[key] = filterData[key]
        }
        renderSetting()
        if('tableStructure' in filterData){
            initTableStructureToTemplate()
            BASE.refreshTempView(true)
        }
        EDITOR.success('Selected settings have been reset');
    } catch (error) {
        EDITOR.error(`Failed to reset settings`, error.message, error);
    }
}

function InitBinging() {
    console.log('Initializing binding')
    // Start binding events
    // Import presets
    $('#table-set-import').on('click', () => importTableSet());
    // Export
    $("#table-set-export").on('click', () => exportTableSet());
    // Reset settings
    $("#table-reset").on('click', () => resetSettings());
    // Rollback table from 2.0 to 1.0
    $("#table-init-from-2-to-1").on('click', async () => {
        if (await rollbackVersion() === true) {
            window.location.reload()
        }
    });
    // Plugin master switch
    $('#table_switch').change(function () {
        USER.tableBaseSetting.isExtensionAble = this.checked;
        EDITOR.success(this.checked ? 'Plugin enabled' : 'Plugin disabled, you can open and manually edit the table but the AI will not read or generate it');
        updateSystemMessageTableStatus();   // Update the table data status to the system message
    });
    // Debug mode switch
    $('#table_switch_debug_mode').change(function () {
        USER.tableBaseSetting.tableDebugModeAble = this.checked;
        EDITOR.success(this.checked ? 'Debug mode enabled' : 'Debug mode disabled');
    });
    // Plugin read table switch
    $('#table_read_switch').change(function () {
        USER.tableBaseSetting.isAiReadTable = this.checked;
        EDITOR.success(this.checked ? 'AI will now read the table' : 'AI will now not read the table');
    });
    // Plugin write table switch
    $('#table_edit_switch').change(function () {
        USER.tableBaseSetting.isAiWriteTable = this.checked;
        EDITOR.success(this.checked ? 'AI changes will now be written to the table' : 'AI changes will now not be written to the table');
    });

    // Table insertion mode
    $('#dataTable_injection_mode').change(function (event) {
        USER.tableBaseSetting.injection_mode = event.target.value;
    });
    $("#fill_table_time").change(function() {
        const value = $(this).val();
        const step_by_step = value === 'after'
        $('#reply_options').toggle(!step_by_step);
        $('#step_by_step_options').toggle(step_by_step);
        USER.tableBaseSetting.step_by_step = step_by_step;
    })
    // Confirm execution
    $('#confirm_before_execution').change(function() {
        USER.tableBaseSetting.confirm_before_execution = $(this).prop('checked');
    })
    // //Advanced settings related to organizing tables
    // $('#advanced_settings').change(function() {
    //     $('#advanced_options').toggle(this.checked);
    //     USER.tableBaseSetting.advanced_settings = this.checked;
    // });
    // Ignore deletion
    $('#ignore_del').change(function() {
        USER.tableBaseSetting.bool_ignore_del = $(this).prop('checked');
    });
    // Ignore user replies
    $('#ignore_user_sent').change(function() {
        USER.tableBaseSetting.ignore_user_sent = $(this).prop('checked');
    });
    // // Force refresh
    // $('#bool_force_refresh').change(function() {
    //     USER.tableBaseSetting.bool_force_refresh = $(this).prop('checked');
    // });
    // Silent refresh
    $('#bool_silent_refresh').change(function() {
        USER.tableBaseSetting.bool_silent_refresh = $(this).prop('checked');
    });
    //Token limit instead of floor limit
    $('#use_token_limit').change(function() {
        $('#token_limit_container').toggle(this.checked);
        $('#clear_up_stairs_container').toggle(!this.checked);
        USER.tableBaseSetting.use_token_limit = this.checked;
    });
    // Initialize API settings display status
    $('#use_main_api').change(function() {
        USER.tableBaseSetting.use_main_api = this.checked;
    });
    // Initialize API settings display status
    $('#step_by_step_use_main_api').change(function() {
        USER.tableBaseSetting.step_by_step_use_main_api = this.checked;
    });
    // Update custom model name based on the model selected in the dropdown list
    $('#model_selector').change(function(event) {
        $('#custom_model_name').val(event.target.value);
        USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = event.target.value;
        USER.saveSettings && USER.saveSettings(); // Save settings
    });
    // Table push to conversation switch
    $('#table_to_chat').change(function () {
        USER.tableBaseSetting.isTableToChat = this.checked;
        EDITOR.success(this.checked ? 'Table will be pushed to the conversation' : 'Turn off table push to conversation');
        $('#table_to_chat_options').toggle(this.checked);
        updateSystemMessageTableStatus();   // Update the table data status to the system message
    });
    // Show table settings in the extension menu switch
    $('#show_settings_in_extension_menu').change(function () {
        USER.tableBaseSetting.show_settings_in_extension_menu = this.checked;
        updateTableView();
    });
    // Show alternating model settings in the extension menu switch
    $('#alternate_switch').change(function () {
        USER.tableBaseSetting.alternate_switch = this.checked;
        EDITOR.success(this.checked ? 'Enable table rendering alternating mode' : 'Disable table rendering alternating mode');
        updateTableView();
        updateAlternateTable();
    });
    // Show table settings in the extension list
    $('#show_drawer_in_extension_list').change(function () {
        USER.tableBaseSetting.show_drawer_in_extension_list = this.checked;
        updateTableView();
    });
    // Table data pushed to the front end can be edited
    $('#table_to_chat_can_edit').change(function () {
        USER.tableBaseSetting.table_to_chat_can_edit = this.checked;
        updateSystemMessageTableStatus();   // Update the table data status to the system message
    });
    // Select table push position according to the dropdown list
    $('#table_to_chat_mode').change(function(event) {
        USER.tableBaseSetting.table_to_chat_mode = event.target.value;
        $('#table_to_chat_is_micro_d').toggle(event.target.value === 'macro');
        updateSystemMessageTableStatus();   // Update the table data status to the system message
    });

    // Select table push position according to the dropdown list
    $('#table_cell_width_mode').change(function(event) {
        USER.tableBaseSetting.table_cell_width_mode = event.target.value;
        getSheetsCellStyle()
    });


    // API URL
    $('#custom_api_url').on('input', function() {
        USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url = $(this).val();
        USER.saveSettings && USER.saveSettings(); // Save settings
    });
    // API KEY
    let apiKeyDebounceTimer;
    $('#custom_api_key').on('input', function () {
        clearTimeout(apiKeyDebounceTimer);
        apiKeyDebounceTimer = setTimeout(async () => {
            try {
                const rawKey = $(this).val();
                const result = processApiKey(rawKey, generateDeviceId());
                USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key = result.encryptedResult.encrypted || result.encryptedResult;
                USER.saveSettings && USER.saveSettings(); // Save settings
                EDITOR.success(result.message);
            } catch (error) {
                console.error('API Key processing failed:', error);
                EDITOR.error('Failed to get API KEY, please re-enter~', error.message, error);
            }
        }, 500); // 500ms debounce delay
    })
    // Model name
    $('#custom_model_name').on('input', function() {
        USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = $(this).val();
        USER.saveSettings && USER.saveSettings(); // Save settings
    });
    // Table message template
    $('#dataTable_message_template').on("input", function () {
        const value = $(this).val();
        USER.tableBaseSetting.message_template = value;
    })
    // Table depth
    $('#dataTable_deep').on("input", function () {
        const value = $(this).val();
        USER.tableBaseSetting.deep = Math.abs(value);
    })
    // Step-by-step table filling prompt
    $('#step_by_step_user_prompt').on('input', function() {
        USER.tableBaseSetting.step_by_step_user_prompt = $(this).val();
    });
    // Number of context layers read for step-by-step table filling
    $('#separateReadContextLayers').on('input', function() {
        USER.tableBaseSetting.separateReadContextLayers = Number($(this).val());
    });
    // Whether to read the world book for step-by-step table filling
    $('#separateReadLorebook').change(function() {
        USER.tableBaseSetting.separateReadLorebook = this.checked;
        USER.saveSettings && USER.saveSettings();
    });
    // Reset the step-by-step table filling prompt to the default value
    $('#reset_step_by_step_user_prompt').on('click', function() {
        const defaultValue = USER.tableBaseDefaultSettings.step_by_step_user_prompt;
        $('#step_by_step_user_prompt').val(defaultValue);
        // Also update the settings in memory
        USER.tableBaseSetting.step_by_step_user_prompt = defaultValue;
        EDITOR.success('The step-by-step table filling prompt has been reset to the default value.');
    });
    // Clean up chat history floors
    $('#clear_up_stairs').on('input', function() {
        const value = $(this).val();
        $('#clear_up_stairs_value').text(value);
        USER.tableBaseSetting.clear_up_stairs = Number(value);
    });
    // token limit
    $('#rebuild_token_limit').on('input', function() {
        const value = $(this).val();
        $('#rebuild_token_limit_value').text(value);
        USER.tableBaseSetting.rebuild_token_limit_value = Number(value);
    });
    // Model temperature setting
    $('#custom_temperature').on('input', function() {
        const value = $(this).val();
        $('#custom_temperature_value').text(value);
        USER.tableBaseSetting.custom_temperature = Number(value);
    });

    // Proxy address
    $('#table_proxy_address').on('input', function() {
        USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address = $(this).val();
        USER.saveSettings && USER.saveSettings(); // Save settings
    });
    // Proxy key
    $('#table_proxy_key').on('input', function() {
        USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key = $(this).val();
        USER.saveSettings && USER.saveSettings(); // Save settings
    });

    // Get model list
    $('#fetch_models_button').on('click', updateModelList);

    // Test API
    $(document).on('click', '#table_test_api_button',async () => {
        const apiUrl = $('#custom_api_url').val();
        const modelName = $('#custom_model_name').val();
        const encryptedApiKeys = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key;
        const results = await handleApiTestRequest(apiUrl, encryptedApiKeys, modelName);
    });

    // Start organizing the table
    $("#table_clear_up").on('click', () => {
        rebuildSheets()
    });

    // Completely rebuild the table (merged into the dropdown box above)
    // $('#rebuild_table').on('click', () => rebuildTableActions(USER.tableBaseSetting.bool_force_refresh, USER.tableBaseSetting.bool_silent_refresh));

    // Push table to conversation
    $("#dataTable_to_chat_button").on("click", async function () {
        customSheetsStylePopup()
    })

    // Reorganize template editing
    $("#rebuild--set-rename").on("click", modifyRebuildTemplate)
    $("#rebuild--set-new").on("click", newRebuildTemplate)
    $("#rebuild--set-delete").on("click", deleteRebuildTemplate)
    $("#rebuild--set-export").on("click", exportRebuildTemplate)
    $("#rebuild--set-import").on("click", importRebuildTemplate)
    $('#rebuild--select').on('change', function() {
        USER.tableBaseSetting.lastSelectedTemplate = $(this).val();
        USER.saveSettings && USER.saveSettings();
    });

    // Manually trigger step-by-step table filling
    $(document).on('click', '#trigger_step_by_step_button', () => {
        triggerStepByStepNow();
    });

}

/**
 * Render settings
 */
export function renderSetting() {
    // Initialize values
    $(`#dataTable_injection_mode option[value="${USER.tableBaseSetting.injection_mode}"]`).prop('selected', true);
    $(`#table_to_chat_mode option[value="${USER.tableBaseSetting.table_to_chat_mode}"]`).prop('selected', true);
    $(`#table_cell_width_mode option[value="${USER.tableBaseSetting.table_cell_width_mode}"]`).prop('selected', true);
    $('#dataTable_message_template').val(USER.tableBaseSetting.message_template);
    $('#dataTable_deep').val(USER.tableBaseSetting.deep);
    $('#clear_up_stairs').val(USER.tableBaseSetting.clear_up_stairs);
    $('#clear_up_stairs_value').text(USER.tableBaseSetting.clear_up_stairs);
    $('#rebuild_token_limit').val(USER.tableBaseSetting.rebuild_token_limit_value);
    $('#rebuild_token_limit_value').text(USER.tableBaseSetting.rebuild_token_limit_value);
    $('#custom_temperature').val(USER.tableBaseSetting.custom_temperature);
    $('#custom_temperature_value').text(USER.tableBaseSetting.custom_temperature);
    // Load step-by-step user prompt
    $('#step_by_step_user_prompt').val(USER.tableBaseSetting.step_by_step_user_prompt || '');
    // Number of context layers read for step-by-step table filling
    $('#separateReadContextLayers').val(USER.tableBaseSetting.separateReadContextLayers);
    // Whether to read the world book for step-by-step table filling
    updateSwitch('#separateReadLorebook', USER.tableBaseSetting.separateReadLorebook);
    $("#fill_table_time").val(USER.tableBaseSetting.step_by_step ? 'after' : 'chat');
    refreshRebuildTemplate()

    // private data
    $('#custom_api_url').val(USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url || '');
    $('#custom_api_key').val(USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key || '');
    $('#custom_model_name').val(USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name || '');
    $('#table_proxy_address').val(USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address || '');
    $('#table_proxy_key').val(USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key || '');

    // Initialize switch status
    updateSwitch('#table_switch', USER.tableBaseSetting.isExtensionAble);
    updateSwitch('#table_switch_debug_mode', USER.tableBaseSetting.tableDebugModeAble);
    updateSwitch('#table_read_switch', USER.tableBaseSetting.isAiReadTable);
    updateSwitch('#table_edit_switch', USER.tableBaseSetting.isAiWriteTable);
    updateSwitch('#table_to_chat', USER.tableBaseSetting.isTableToChat);
    // updateSwitch('#advanced_settings', USER.tableBaseSetting.advanced_settings);
    updateSwitch('#confirm_before_execution', USER.tableBaseSetting.confirm_before_execution);
    updateSwitch('#use_main_api', USER.tableBaseSetting.use_main_api);
    updateSwitch('#step_by_step_use_main_api', USER.tableBaseSetting.step_by_step_use_main_api);
    updateSwitch('#ignore_del', USER.tableBaseSetting.bool_ignore_del);
    // updateSwitch('#bool_force_refresh', USER.tableBaseSetting.bool_force_refresh);
    updateSwitch('#bool_silent_refresh', USER.tableBaseSetting.bool_silent_refresh);
    // updateSwitch('#use_token_limit', USER.tableBaseSetting.use_token_limit);
    updateSwitch('#ignore_user_sent', USER.tableBaseSetting.ignore_user_sent);
    updateSwitch('#show_settings_in_extension_menu', USER.tableBaseSetting.show_settings_in_extension_menu);
    updateSwitch('#alternate_switch', USER.tableBaseSetting.alternate_switch);
    updateSwitch('#show_drawer_in_extension_list', USER.tableBaseSetting.show_drawer_in_extension_list);
    updateSwitch('#table_to_chat_can_edit', USER.tableBaseSetting.table_to_chat_can_edit);
    $('#reply_options').toggle(!USER.tableBaseSetting.step_by_step);
    $('#step_by_step_options').toggle(USER.tableBaseSetting.step_by_step);
    $('#table_to_chat_options').toggle(USER.tableBaseSetting.isTableToChat);
    $('#table_to_chat_is_micro_d').toggle(USER.tableBaseSetting.table_to_chat_mode === 'macro');

    // No longer display the table structure in the settings
    // updateTableStructureDOM()
    console.log("Settings have been rendered")
}

/**
 * Load settings
 */
export function loadSettings() {
    USER.IMPORTANT_USER_PRIVACY_DATA = USER.IMPORTANT_USER_PRIVACY_DATA || {};

    // Compatibility for old version prompt changes
    if (USER.tableBaseSetting.updateIndex < 3) {
        USER.getSettings().message_template = USER.tableBaseDefaultSettings.message_template
        USER.tableBaseSetting.to_chat_container = USER.tableBaseDefaultSettings.to_chat_container
        // USER.tableBaseSetting.tableStructure = USER.tableBaseDefaultSettings.tableStructure
        USER.tableBaseSetting.updateIndex = 3
    }

    // Compatibility for version 2 table structure
    console.log("updateIndex", USER.tableBaseSetting.updateIndex)
    if (USER.tableBaseSetting.updateIndex < 4) {
        // tableStructureToTemplate(USER.tableBaseSetting.tableStructure)
        initTableStructureToTemplate()
        USER.tableBaseSetting.updateIndex = 4
    }
    if (USER.tableBaseSetting.deep < 0) formatDeep()

    renderSetting();
    InitBinging();
    initRefreshTypeSelector(); // Initialize table refresh type selector
    updateTableView(); // Update table view
    getSheetsCellStyle()
}

export function initTableStructureToTemplate() {
    const sheetDefaultTemplates = USER.tableBaseSetting.tableStructure
    USER.getSettings().table_selected_sheets = []
    USER.getSettings().table_database_templates = [];
    for (let defaultTemplate of sheetDefaultTemplates) {
        const newTemplate = new BASE.SheetTemplate()
        newTemplate.domain = 'global'
        newTemplate.createNewTemplate(defaultTemplate.columns.length + 1, 1, false)
        newTemplate.name = defaultTemplate.tableName
        defaultTemplate.columns.forEach((column, index) => {
            newTemplate.findCellByPosition(0, index + 1).data.value = column
        })
        newTemplate.enable = defaultTemplate.enable
        newTemplate.tochat = defaultTemplate.tochat
        newTemplate.required = defaultTemplate.Required
        newTemplate.triggerSend = defaultTemplate.triggerSend
        newTemplate.triggerSendDeep = defaultTemplate.triggerSendDeep
        if(defaultTemplate.config)
            newTemplate.config = JSON.parse(JSON.stringify(defaultTemplate.config))
        newTemplate.source.data.note = defaultTemplate.note
        newTemplate.source.data.initNode = defaultTemplate.initNode
        newTemplate.source.data.deleteNode = defaultTemplate.deleteNode
        newTemplate.source.data.updateNode = defaultTemplate.updateNode
        newTemplate.source.data.insertNode = defaultTemplate.insertNode
        USER.getSettings().table_selected_sheets.push(newTemplate.uid)
        newTemplate.save()
    }
    USER.saveSettings()
}

function templateToTableStructure() {
    const tableTemplates = BASE.templates.map((templateData, index) => {
        const template = new BASE.SheetTemplate(templateData.uid)
        return {
            tableIndex: index,
            tableName: template.name,
            columns: template.hashSheet[0].slice(1).map(cellUid => template.cells.get(cellUid).data.value),
            note: template.data.note,
            initNode: template.data.initNode,
            deleteNode: template.data.deleteNode,
            updateNode: template.data.updateNode,
            insertNode: template.data.insertNode,
            config: JSON.parse(JSON.stringify(template.config)),
            Required: template.required,
            tochat: template.tochat,
            enable: template.enable,
            triggerSend: template.triggerSend,
            triggerSendDeep: template.triggerSendDeep,
        }
    })
    USER.tableBaseSetting.tableStructure = tableTemplates
    USER.saveSettings()
}

/**
 * Refresh reorganization template
 */
export function refreshRebuildTemplate() {
    const templateSelect = $('#rebuild--select');
    templateSelect.empty(); // Clear existing options
    const defaultOption = $('<option>', {
        value: "rebuild_base",
        text: "Default",
    });
    templateSelect.append(defaultOption);
    Object.keys(USER.tableBaseSetting.rebuild_message_template_list).forEach(key => {
        const option = $('<option>', {
            value: key,
            text: key
        });
        templateSelect.append(option);
    });
    // Set default selected item
    if (USER.tableBaseSetting.lastSelectedTemplate) {
        console.log("Default", USER.tableBaseSetting.lastSelectedTemplate)
        $('#rebuild--select').val(USER.tableBaseSetting.lastSelectedTemplate);
    }
}
