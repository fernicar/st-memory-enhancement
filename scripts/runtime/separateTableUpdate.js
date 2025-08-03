import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { executeIncrementalUpdateFromSummary } from "./absoluteRefresh.js";
import { newPopupConfirm } from '../../components/popupConfirm.js';
import { reloadCurrentChat } from "/script.js"
import {getTablePrompt,initTableData, undoSheets} from "../../index.js"

let toBeExecuted = [];

/**
 * Initialize the data required for the two-step summary
 * @param chat
 * */
function InitChatForTableTwoStepSummary(chat) {
    // If currentPiece.uid is undefined, initialize it as a random string
    if (chat.uid === undefined) {
        chat.uid = SYSTEM.generateRandomString(22);
    }
    // If currentPiece.uid_that_references_table_step_update is undefined, initialize it as {}
    if (chat.two_step_links === undefined) {
        chat.two_step_links = {};
    }
    // If currentPiece.uid_that_references_table_step_update is undefined, initialize it as {}
    if (chat.two_step_waiting === undefined) {
        chat.two_step_waiting = {};
    }
}

/**
 * Get the unique identifier of the current swipe conversation
 * @param chat
 * @returns {string}
 */
function getSwipeUid(chat) {
    // Initialize chat
    InitChatForTableTwoStepSummary(chat);
    // Get the unique identifier of the current swipe
    const swipeUid = `${chat.uid}_${chat.swipe_id}`;
    // Check if the necessary data structure already exists for the current swipe
    if (!(swipeUid in chat.two_step_links)) chat.two_step_links[swipeUid] = [];
    if (!(swipeUid in chat.two_step_waiting)) chat.two_step_waiting[swipeUid] = true;
    return swipeUid;
}

/**
 * Check if the current chat has been executed by the parent chat
 * @param chat
 * @param targetSwipeUid
 * @returns {*}
 */
function checkIfChatIsExecuted(chat, targetSwipeUid) {
    const chatSwipeUid = getSwipeUid(chat); // Get the unique identifier of the current chat
    const chatExecutedSwipes = chat.two_step_links[chatSwipeUid]; // Get the parent chats that have already been executed by the current chat
    return chatExecutedSwipes.includes(targetSwipeUid);   // Check if the current chat has been executed by the target chat
}

/**
 * Handle identifiers in conversations
 * @param string
 * @returns {string}
 */
function handleMessages(string) {
    let r = string.replace(/<(tableEdit|think|thinking)>[\s\S]*?<\/\1>/g, '');

    return r;
}

function MarkChatAsWaiting(chat, swipeUid) {
    console.log(USER.getContext().chat);
    console.log('chat.two_step_links:',chat.two_step_links);
    console.log('chat.two_step_waiting:',chat.two_step_waiting);
    chat.two_step_waiting[swipeUid] = true;
}

/**
 * Execute two-step summary
 * */
export async function TableTwoStepSummary(mode) {
    if (mode!=="manual" && (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === false)) return

    // Get the two-step summary to be executed
    const {piece: todoPiece} = USER.getChatPiece()

    if (todoPiece === undefined) {
        console.log('No chat snippet to be filled found');
        EDITOR.error('No chat snippet to be filled found, please check if the current conversation is correct.');
        return;
    }
    let todoChats = todoPiece.mes;

    console.log('Chat snippet to be filled:', todoChats);

    // Check if confirmation is required before execution
    const popupContentHtml = `A total of ${todoChats.length} characters of text, start independent table filling?`;
    // Removed HTML and logic related to template selection

    const popupId = 'stepwiseSummaryConfirm';
    const confirmResult = await newPopupConfirm(
        popupContentHtml,
        "Cancel",
        "Fill Table",
        popupId,
        "Don't Remind Me Again", // dontRemindText: Permanently disables the popup
        "Always Yes"  // alwaysConfirmText: Confirms for the session
    );

    console.log('newPopupConfirm result for stepwise summary:', confirmResult);

    if (confirmResult === false) {
        console.log('User canceled independent table filling: ', `(${todoChats.length}) `, toBeExecuted);
        MarkChatAsWaiting(currentPiece, swipeUid);
    } else {
        // This block executes if confirmResult is true OR 'dont_remind_active'
        if (confirmResult === 'dont_remind_active') {
            console.log('Independent table filling popup has been disabled, executing automatically.');
            EDITOR.info('You have selected "Always Yes", the operation will be executed automatically in the background...'); // <--- Add background execution prompt
        } else { // confirmResult === true
            console.log('User confirmed independent table filling (or selected "Always Yes" for the first time and confirmed)');
        }
        manualSummaryChat(todoChats, confirmResult);
    }
}

/**
 * Manually summarize chat (fill table now)
 * Refactoring logic:
 * 1. Restore: First call the built-in `undoSheets` function to restore the table state to the previous version.
 * 2. Execute: Based on the restored clean state, call the standard incremental update process to request new operations from the AI and execute them.
 * @param {Array} todoChats - The chat records to be used for table filling.
 * @param {string|boolean} confirmResult - The user's confirmation result.
 */
export async function manualSummaryChat(todoChats, confirmResult) {
    // Step 1: Check if the "Undo" operation needs to be performed
    // First get the current chat snippet to determine the table state
    const { piece: initialPiece } = USER.getChatPiece();
    if (!initialPiece) {
        EDITOR.error("Cannot get the current chat snippet, operation aborted.");
        return;
    }

    // Only perform "Undo and Redo" when there is already content in the table
    if (initialPiece.hash_sheets && Object.keys(initialPiece.hash_sheets).length > 0) {
        console.log('[Memory Enhancement] Fill now: Detected data in the table, performing restore operation...');
        try {
            await undoSheets(0);
            EDITOR.success('The table has been restored to the previous version.');
            console.log('[Memory Enhancement] Table restored successfully, preparing to fill the table.');
        } catch (e) {
            EDITOR.error('Failed to restore the table, operation aborted.', e.message, e);
            console.error('[Memory Enhancement] Failed to call undoSheets:', e);
            return;
        }
    } else {
        console.log('[Memory Enhancement] Fill now: Detected an empty table, skipping the restore step and filling the table directly.');
    }

    // Step 2: Continue to fill the table based on the current state (possibly restored)
    // Re-acquire the piece to ensure we are using the latest state (either the original state or the restored state)
    const { piece: referencePiece } = USER.getChatPiece();
    if (!referencePiece) {
        EDITOR.error("Cannot get the chat snippet for the operation, operation aborted.");
        return;
    }

    // Table data
    const originText = getTablePrompt(referencePiece);

    // Overall table prompt
    const finalPrompt = initTableData(); // Get table-related prompts

    // Settings
    const useMainApiForStepByStep = USER.tableBaseSetting.step_by_step_use_main_api ?? true;
    const isSilentMode = confirmResult === 'dont_remind_active';

    const r = await executeIncrementalUpdateFromSummary(
        todoChats,
        originText,
        finalPrompt,
        referencePiece, // Pass the original piece object reference directly
        useMainApiForStepByStep, // API choice for step-by-step
        USER.tableBaseSetting.bool_silent_refresh, // isSilentUpdate
        isSilentMode // Pass silent mode flag
    );

    console.log('Result of executing independent table filling (incremental update):', r);
    if (r === 'success') {
        // Since the operation is performed directly on the referencePiece reference, the modification has been automatically synchronized, and there is no need to manually write back hash_sheets.
        toBeExecuted.forEach(chat => {
            const chatSwipeUid = getSwipeUid(chat);
            chat.two_step_links[chatSwipeUid].push(swipeUid);   // Mark the executed two-step summary
        });
        toBeExecuted = [];

        // Save and refresh the UI
        await USER.saveChat();
        // According to the user's request, use a full page refresh to ensure that all data including macros are updated.
        reloadCurrentChat();
        return true;
    } else if (r === 'suspended' || r === 'error' || !r) {
        console.log('Failed or canceled to execute incremental independent table filling: ', `(${todoChats.length}) `, toBeExecuted);
        return false;
    }

}
