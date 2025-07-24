import {EDITOR, SYSTEM, USER, BASE} from '../../core/manager.js';
import JSON5 from '../../utils/json5.min.mjs'

let isPopupOpening = false; // Prevent pushing logs when the popup is open, which would cause a loop
let debugEventHistory = [];

function updateTableDebugLog(type, message, detail = "", timeout, stack) {
    const newLog = {
        time: new Date().toLocaleTimeString(),
        type: type,
        message: message || '',
        stack,
    };
    switch (type) {
        case 'info':
            toastr.info(message, detail, { timeOut: timeout });
            break;
        case 'success':
            toastr.success(message, detail, { timeOut: timeout });
            break;
        case 'warning':
            console.warn(message, detail);
            toastr.warning(message, detail, { timeOut: timeout });
            break;
        case 'error':
            console.error(message, detail);
            // Assuming 'detail' is intended as the title for toastr.
            // If detail is an empty string, toastr might not show a title, which is fine.
            toastr.error(message, detail, { timeOut: timeout });
            if (isPopupOpening) break;
            if (USER.tableBaseSetting.tableDebugModeAble) {
                setTimeout(() => {
                    openTableDebugLogPopup().then(r => {});
                }, 0);
            }
            break;
        case 'clear':
            toastr.clear();
            break;
        default:
            break;
    }

    if (isPopupOpening) return;
    debugEventHistory = debugEventHistory || [];
    debugEventHistory.unshift(newLog);
}

const copyButtonStyle = `
<div class="menu_button log-copy-button">
    <i class="fa-solid fa-copy"></i>
</div>
`

async function copyPopup(log) {
    const logDetails = `Time: ${log.time}\nType: ${log.type}\nMessage: ${log.message}${log.stack ? `\nStack:\n${log.stack}` : ''}`;
    const textarea = $('<textarea class="log-copy-textarea" style="height: 100%"></textarea>').val(logDetails);
    const manager = await SYSTEM.getTemplate('popup');
    const copyPopupInstance = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const container = copyPopupInstance.dlg.querySelector('#popup_content');
    container.append(textarea[0]);

    textarea.focus();
    textarea.select();
    await copyPopupInstance.show();
}

/**
 * Render Debug logs to the container
 * @param $container jQuery object, the log container
 * @param logs The log array
 * @param onlyError Whether to only display error logs
 */
function renderDebugLogs($container, logs, onlyError) {
    $container.empty(); // Clear the container

    if (!logs || logs.length === 0) {
        $container.append('<div class="debug-log-item">No debug log found.</div>');
        return;
    }

    // Used to match stack information lines, and capture function names, URLs, and line and column numbers
    const stackLineRegex = /at\s+([^\s]*?)\s+\((https?:\/\/[^\s:]+(?::\d+)?(?:[^\s:]+)*)(?::(\d+):(\d+))?\)/g;
    logs.forEach(log => {
        if (onlyError && log.type !== 'error') {
            return; // If only error logs are displayed and the current log is not of type error, skip it
        }

        const logElement = $('<div class="debug-log-item"></div>'); // Create a div element to display each log
        const timeSpan = $('<span class="log-time"></span>').text(`[${log.time}]`);
        const typeSpan = $('<span class="log-type"></span>').addClass(`log-type-${log.type}`).text(`[${log.type}]`);
        const messageSpan = $('<span class="log-message"></span>').text(log.message);
        const copyButton = $(`${copyButtonStyle}`);

        logElement.append(timeSpan).append(' ').append(typeSpan).append(': ').append(messageSpan).append(' ').append(copyButton); // Add a copy button

        copyButton.on('click', () => {
            copyPopup(log);
        })

        if (log.stack) {
            // Use regular expressions to replace stack information lines, and highlight function names, URLs can be clicked
            const formattedStack = log.stack.replace(stackLineRegex, (match, functionName, urlBase, lineNumber, columnNumber) => {
                // functionName is the function name (e.g. getPromptAndRebuildTable, dispatch)
                // urlBase is the base part of the link
                // lineNumber is the line number (if it exists)
                // columnNumber is the column number (if it exists)

                let functionNameHtml = '';
                if (functionName) {
                    functionNameHtml = `<span style="color: #bbb">${functionName}</span> `;
                }
                let linkHtml = `<a href="${urlBase}" target="_blank" style="color: rgb(98, 145, 179)">${urlBase}</a>`;
                let locationHtml = '';
                if (lineNumber && columnNumber) {
                    locationHtml = `<span style="color: rgb(98, 145, 179)">:${lineNumber}:${columnNumber}</span>`;
                }
                return `at ${functionNameHtml}(${linkHtml}${locationHtml})`; // Reconstruct the stack information line
            });
            const stackPre = $('<pre class="log-stack"></pre>').html(formattedStack);
            logElement.append(stackPre);
        }

        $container.append(logElement);
    });
}

export const consoleMessageToEditor = {
    info: (message, detail, timeout) => updateTableDebugLog('info', message, detail, timeout),
    success: (message, detail, timeout) => updateTableDebugLog('success', message, detail, timeout),
    warning: (message, detail, timeout) => updateTableDebugLog('warning', message, detail, timeout),
    // If the error parameter is a real Error object, you can attach error.message or error.name.
    // But if the caller only passes a string, the error parameter will be undefined.
    // Assume that the main error message is already in message or detail.
    // If you need to display the stack, the error parameter should be an Error object.
    error: (message, detail, errorObj, timeout) => {
        let fullMessage = message;
        // If detail exists, you can consider how to merge it, or assume that it is already included in message.
        // For now, let's assume 'message' contains the primary string and 'detail' is secondary.
        // The 'errorObj' is specifically for stack trace.
        updateTableDebugLog('error', fullMessage, detail, timeout, errorObj?.stack);
    },
    clear: () => updateTableDebugLog('clear', ''),
}

/**
 * +. New code, open the custom table push renderer popup
 * @returns {Promise<void>}
 */
export async function openTableDebugLogPopup() {
    if (!SYSTEM.lazy('openTableDebugLogPopup')) return;

    isPopupOpening = true;
    const manager = await SYSTEM.getTemplate('debugLog');
    const tableDebugLogPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const $dlg = $(tableDebugLogPopup.dlg);
    const $debugLogContainer = $dlg.find('#debugLogContainer');
    const $onlyErrorLogCheckbox = $dlg.find('#only_error_log'); // Get the checkbox
    const $exportButton = $dlg.find('#table_debug_log_export_button'); // Get the export button
    const $exportInfoButton = $dlg.find('#table_debug_info_export_button'); // Get the export debug information button
    const $importInfoButton = $dlg.find('#table_debug_info_import_button'); // Get the import debug information button

    $debugLogContainer.empty(); // Clear the container to avoid repeatedly displaying old logs
    toastr.clear()

    // Initialize rendering logs, and decide whether to only display errors based on the checkbox status
    renderDebugLogs($debugLogContainer, debugEventHistory, $onlyErrorLogCheckbox.is(':checked'));

    $onlyErrorLogCheckbox.off('change').on('change', function () { // Remove the previous event listener to avoid repeated binding
        const onlyError = $(this).is(':checked'); // Get the checked status of the checkbox
        renderDebugLogs($debugLogContainer, debugEventHistory, onlyError); // Re-render the logs
    });
    $exportButton.on('click', () => {
        const logData = debugEventHistory.map(log => {
            return {
                time: log.time,
                type: log.type,
                message: log.message,
                stack: log.stack
            }
        });
        const logDataString = JSON5.stringify(logData, null, 2);
        const blob = new Blob([logDataString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'table_debug_log.json';
        a.click();
        URL.revokeObjectURL(url);
    })

    $exportInfoButton.on('click', () => {
        const infoData = {
            chatMate: BASE.sheetsData.context,
            lastestSheet: BASE.getLastSheetsPiece(),
            allHash: USER.getContext().chat.map(chat => chat.hash_sheets ?? null),
        };
        const infoDataString = JSON.stringify(infoData, null, 2);
        const blob = new Blob([infoDataString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'table_debug_info.json';
        a.click();
        URL.revokeObjectURL(url);
    })

    $importInfoButton.on('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    BASE.sheetsData.context = json.chatMate;
                    const lastestPiece = USER.getChatPiece().piece
                    lastestPiece.hash_sheets = json.lastestSheet.piece.hash_sheets;
                    console.log('Imported debug information:', json);
                    USER.saveChat()
                } catch (error) {
                    console.error('Import failed:', error);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    await tableDebugLogPopup.show();
    isPopupOpening = false;
}
