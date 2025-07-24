// standaloneAPI.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import LLMApiService from "../../services/llmApi.js";
import {PopupConfirm} from "../../components/popupConfirm.js";

let loadingToast = null;
let currentApiKeyIndex = 0;// Used to record the index of the currently used API Key


/**
 * Encrypt
 * @param {*} rawKey - The original key
 * @param {*} deviceId - The device ID
 * @returns {string} The encrypted string
 */
export function encryptXor(rawKey, deviceId) {
    // Handle multiple comma-separated API Keys
    const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
    const uniqueKeys = [...new Set(keys)];
    const uniqueKeyString = uniqueKeys.join(',');

    // If there are duplicate keys, return the number of duplicates removed and the encrypted key
    if (keys.length !== uniqueKeys.length) {
        return {
            encrypted: Array.from(uniqueKeyString).map((c, i) =>
                c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
            ).map(c => c.toString(16).padStart(2, '0')).join(''),
            duplicatesRemoved: keys.length - uniqueKeys.length
        };
    }

    // Return the encrypted result directly when there are no duplicate keys
    return Array.from(uniqueKeyString).map((c, i) =>
        c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
    ).map(c => c.toString(16).padStart(2, '0')).join('');
}

export function processApiKey(rawKey, deviceId) {
    try {
        const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
        const invalidKeysCount = rawKey.split(',').length - keys.length; // Calculate the number of invalid keys
        const encryptedResult = encryptXor(rawKey, deviceId);
        const totalKeys = rawKey.split(',').length;
        const remainingKeys = totalKeys - (encryptedResult.duplicatesRemoved || 0); // The number of remaining keys after removing invalid and duplicate keys

        let message = `API Key updated, ${remainingKeys} keys in total`;
        if(totalKeys - remainingKeys > 0 || invalidKeysCount > 0){
            const removedParts = [];
            if (totalKeys - remainingKeys > 0) removedParts.push(`${totalKeys - remainingKeys} duplicate keys`);
            if (invalidKeysCount > 0) removedParts.push(`${invalidKeysCount} empty values`);
            message += ` (removed ${removedParts.join(', ')})`;
        }
        return {
            encryptedResult,
            encrypted: encryptedResult.encrypted,
            duplicatesRemoved: encryptedResult.duplicatesRemoved,
            invalidKeysCount: invalidKeysCount,
            remainingKeys: remainingKeys,
            totalKeys: totalKeys,
            message: message,
        }
    } catch (error) {
        console.error('API Key processing failed:', error);
        throw error;
    }
}


/**
 * API KEY decryption
 * @returns {Promise<string|null>} The decrypted API key
 */
export async function getDecryptedApiKey() { // Export this function
    try {
        const encrypted = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key;
        const deviceId = localStorage.getItem('st_device_id');
        if (!encrypted || !deviceId) return null;

        return await decryptXor(encrypted, deviceId);
    } catch (error) {
        console.error('API Key decryption failed:', error);
        return null;
    }
}

/**
 * Decrypt
 * @param {string} encrypted - The encrypted string
 * @param {string} deviceId - The device ID
 * @returns {string|null} The decrypted string, or null if decryption fails
 */
async function decryptXor(encrypted, deviceId) {
    try {
        const bytes = encrypted.match(/.{1,2}/g).map(b =>
            parseInt(b, 16)
        );
        return String.fromCharCode(...bytes.map((b, i) =>
            b ^ deviceId.charCodeAt(i % deviceId.length)
        ));
    } catch(e) {
        console.error('Decryption failed:', e);
        return null;
    }
}

async function createLoadingToast(isUseMainAPI = true, isSilent = false) {
    if (isSilent) {
        // In silent mode, do not display the popup, directly simulate "Continue in background"
        // Returns false, because the "Continue in background" button (cancelBtn) in PopupConfirm returns false
        return Promise.resolve(false);
    }
    loadingToast?.close()
    loadingToast = new PopupConfirm();
    return await loadingToast.show(
        isUseMainAPI
            ? 'Regenerating the entire table using [Main API]...'
            : 'Regenerating the entire table using [Custom API]...',
        'Continue in background',
        'Abort execution',
    )
}

/**Main API call
 * @param {string|Array<object>} systemPrompt - The system prompt or message array
 * @param {string} [userPrompt] - The user prompt (this parameter is ignored if the first parameter is a message array)
 * @param {boolean} [isSilent=false] - Whether to run in silent mode, without displaying a loading prompt
 * @returns {Promise<string>} The generated response content
 */
export async function handleMainAPIRequest(systemPrompt, userPrompt, isSilent = false) {
    let finalSystemPrompt = '';
    let finalUserPrompt = '';
    let suspended = false; // Define suspended outside the blocks

    if (Array.isArray(systemPrompt)) {
        // --- Start: Processing for array input ---
        const messages = systemPrompt; // messages is defined here now

        // Loading toast logic
        createLoadingToast(true, isSilent).then((r) => {
            if (loadingToast) loadingToast.close();
            suspended = r; // Assign to the outer suspended variable
        });

        let startTime = Date.now();
        if (loadingToast) {
            loadingToast.frameUpdate(() => {
                if (loadingToast) {
                    loadingToast.text = `Regenerating the entire table using [Main API] (multiple messages): ${((Date.now() - startTime) / 1000).toFixed(1)} seconds`;
                }
            });
        }

        console.log('Main API request multi-message array:', messages); // Log the actual array
        // Use TavernHelper.generateRaw with the array, enabling streaming

        if(!TavernHelper) throw new Error("Tavern Helper is not installed, the summary function depends on the Tavern Helper plugin, please install it and refresh");

        const response = await TavernHelper.generateRaw({
            ordered_prompts: messages, // Pass the array directly
            should_stream: true,      // Re-enable streaming
        });
        loadingToast.close();
        return suspended ? 'suspended' : response;
        // --- End: Processing for array input ---

    } else { // Correctly placed ELSE block
        // --- Start: Original logic for non-array input ---
        finalSystemPrompt = systemPrompt;
        finalUserPrompt = userPrompt;

        createLoadingToast(true, isSilent).then((r) => {
            if (loadingToast) loadingToast.close();
            suspended = r; // Assign to the outer suspended variable
        });

        let startTime = Date.now();
        if (loadingToast) {
            loadingToast.frameUpdate(() => {
                if (loadingToast) {
                    loadingToast.text = `Regenerating the entire table using [Main API]: ${((Date.now() - startTime) / 1000).toFixed(1)} seconds`;
                }
            });
        }

        // Use EDITOR.generateRaw for non-array input
        const response = await EDITOR.generateRaw(
            finalUserPrompt,
            '',
            false,
            false,
            finalSystemPrompt,
        );
        loadingToast.close();
        return suspended ? 'suspended' : response;
        // --- End: Original logic ---
    }
} // Correct closing brace for the function

/**
 * Handle API test requests, including getting input, decrypting keys, calling test functions, and returning results.
 * @param {string} apiUrl - The API URL.
 * @param {string} encryptedApiKeys - The encrypted API key string.
 * @param {string} modelName - The model name.
 * @returns {Promise<Array<{keyIndex: number, success: boolean, error?: string}>>} An array of test results.
 */
export async function handleApiTestRequest(apiUrl, encryptedApiKeys, modelName) {
    if (!apiUrl || !encryptedApiKeys) {
        EDITOR.error('Please fill in the API URL and API Key first.');
        return []; // Return an empty array on initial validation failure
    }

    const decryptedApiKeysString = await getDecryptedApiKey(); // Use imported function
    if (!decryptedApiKeysString) {
        EDITOR.error('API Key decryption failed or not set!');
        return []; // Return an empty array on decryption failure
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (apiKeys.length === 0) {
        EDITOR.error('No valid API Key found.');
        return []; // Return an empty array if no valid keys are found
    }
    const testAll = await EDITOR.callGenericPopup(`Detected ${apiKeys.length} API Keys.\nNote: The test method is the same as the one that comes with the tavern. A message will be sent once (the number of tokens is very small), but if you are using a pay-per-use API, please pay attention to the consumption.`, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Test the first key", cancelButton: "Cancel" });
    let keysToTest = [];
    if (testAll === null) return []; // User canceled the popup, return an empty array

    if (testAll) {
        keysToTest = [apiKeys[0]];
        EDITOR.info(`Start testing the ${keysToTest.length}th API Key...`);
    } else {
        return []; // User clicked cancel, return an empty array
    }
    //!!~~~Keep the function of testing multiple keys, temporarily only test the first key~~~!!
    try {
        // Call the test function
        const results = await testApiConnection(apiUrl, keysToTest, modelName);

        // Process the results and display a prompt message
        if (results && results.length > 0) {
            EDITOR.clear(); // Clear the previously displayed 'Start testing the xth API Key...' prompt
            let successCount = 0;
            let failureCount = 0;
            results.forEach(result => {
                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                    // Record detailed errors, use the original key index if available
                    console.error(`Key ${result.keyIndex !== undefined ? result.keyIndex + 1 : '?'} test failed: ${result.error}`);
                }
            });

            if (failureCount > 0) {
                EDITOR.error(`${failureCount} Keys failed the test. Please check the console for details.`);
                EDITOR.error(`API endpoint: ${apiUrl}`);
                EDITOR.error(`Error details: ${results.find(r => !r.success)?.error || 'Unknown error'}`);
            }
            if (successCount > 0) {
                EDITOR.success(`${successCount} Keys passed the test!`);
            }
        } else if (results) {
            // Handle the case where testApiConnection may return an empty array (e.g., user cancels)
        }

        return results; // Return the results array
    } catch (error) {
        EDITOR.error(`An error occurred during the API test`, error.message, error);
        console.error("API Test Error:", error);
        // Return an array indicating that all test keys have failed when a general error occurs
        return keysToTest.map((_, index) => ({
            keyIndex: apiKeys.indexOf(keysToTest[index]), // Find the original index if needed
            success: false,
            error: `An error occurred during the test: ${error.message}`
        }));
    }
}

/**
 * Test API connection
 * @param {string} apiUrl - The API URL
 * @param {string[]} apiKeys - The API key array
 * @param {string} modelName - The model name
 * @returns {Promise<Array<{keyIndex: number, success: boolean, error?: string}>>} An array of test results
 */
export async function testApiConnection(apiUrl, apiKeys, modelName) {
    const results = [];
    const testPrompt = "Say 'test'"; // Test case

    for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[i];
        console.log(`Testing API Key index: ${i}`);
        try {
            const llmService = new LLMApiService({
                api_url: apiUrl,
                api_key: apiKey,
                model_name: modelName || 'gpt-3.5-turbo', // Use the model name set by the user
                system_prompt: 'You are a test assistant.',
                temperature: 0.1 // Use the temperature set by the user
            });

            // Call the API
            const response = await llmService.callLLM(testPrompt);

            if (response && typeof response === 'string') {
                console.log(`API Key index ${i} test successful. Response: ${response}`);
                results.push({ keyIndex: i, success: true });
            } else {
                throw new Error('Invalid or empty response received.');
            }
        } catch (error) {
            console.error(`API Key index ${i} test failed (raw error object):`, error); // Log the raw error object
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error.toString === 'function') {
                errorMessage = error.toString();
            }
            results.push({ keyIndex: i, success: false, error: errorMessage });
        }
    }
    return results;
}

/**Custom API call
 * @param {string|Array<object>} systemPrompt - The system prompt or message array
 * @param {string} [userPrompt] - The user prompt (this parameter is ignored if the first parameter is a message array)
 * @param {boolean} [isStepByStepSummary=false] - Whether it is in step-by-step summary mode, used to control streaming
 * @param {boolean} [isSilent=false] - Whether to run in silent mode, without displaying a loading prompt
 * @returns {Promise<string>} The generated response content
 */
export async function handleCustomAPIRequest(systemPrompt, userPrompt, isStepByStepSummary = false, isSilent = false) {
    const USER_API_URL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const decryptedApiKeysString = await getDecryptedApiKey(); // Get the comma-separated key string
    const USER_API_MODEL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
    // const MAX_RETRIES = USER.tableBaseSetting.custom_api_retries ?? 0; // Get the number of retries from the settings, default is 0
    const MAX_RETRIES = 0; // Get the number of retries from the settings, default is 0

    if (!USER_API_URL || !USER_API_MODEL) {
        EDITOR.error('Please fill in the complete custom API configuration (URL and model)');
        return;
    }

    if (!decryptedApiKeysString) {
        EDITOR.error('API key decryption failed or not set, please check the API key settings!');
        return;
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
        EDITOR.error('No valid API Key found, please check the input.');
        return;
    }

    let suspended = false;
    createLoadingToast(false, isSilent).then((r) => {
        if (loadingToast) loadingToast.close();
        suspended = r;
    })

    const totalKeys = apiKeys.length;
    const attempts = MAX_RETRIES === 0 ? totalKeys : Math.min(MAX_RETRIES, totalKeys);
    let lastError = null;

    for (let i = 0; i < attempts; i++) {
        if (suspended) break; // Check if the user has aborted the operation

        const keyIndexToTry = currentApiKeyIndex % totalKeys;
        const currentApiKey = apiKeys[keyIndexToTry];
        currentApiKeyIndex++; // Move to the next key for the next overall request

        console.log(`Attempting API call with API key index: ${keyIndexToTry}`);
        if (loadingToast) {
            loadingToast.text = `Attempting to use the ${keyIndexToTry + 1}/${totalKeys}th custom API Key...`;
        }

        try { // Outer try for the whole attempt with the current key
            const promptData = Array.isArray(systemPrompt) ? systemPrompt : userPrompt;
            let response; // Declare response variable

            // --- ALWAYS Use llmService ---
            console.log(`Custom API: Using llmService.callLLM (input type: ${Array.isArray(promptData) ? 'multi-message array' : 'single message'})`);
            if (loadingToast) {
                loadingToast.text = `Using the ${keyIndexToTry + 1}/${totalKeys}th custom API Key (llmService)...`;
            }

            const llmService = new LLMApiService({
                api_url: USER_API_URL,
                api_key: currentApiKey,
                model_name: USER_API_MODEL,
                // Pass empty system_prompt if promptData is array, otherwise pass the original systemPrompt string
                system_prompt: Array.isArray(promptData) ? "" : systemPrompt,
                temperature: USER.tableBaseSetting.custom_temperature,
                table_proxy_address: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address,
                table_proxy_key: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key
            });

            const streamCallback = (chunk) => {
                if (loadingToast) {
                    const modeText = isStepByStepSummary ? "(Step-by-step)" : ""; // isStepByStepSummary might be useful here still
                    loadingToast.text = `Generating with the ${keyIndexToTry + 1}th Key${modeText}: ${chunk}`;
                }
            };

            try {
                // Pass promptData (which could be string or array) to callLLM
                response = await llmService.callLLM(promptData, streamCallback);
                console.log(`Request successful (llmService, key index: ${keyIndexToTry}):`, response);
                loadingToast?.close();
                return suspended ? 'suspended' : response; // Success, return immediately
            } catch (llmServiceError) {
                // llmService failed, log error and continue loop
                console.error(`API call failed (llmService), key index ${keyIndexToTry}:`, llmServiceError);
                lastError = llmServiceError;
                EDITOR.error(`Failed to call with the ${keyIndexToTry + 1}th Key (llmService): ${llmServiceError.message || 'Unknown error'}`);
                // Let the loop continue to the next key
            }
            // If code reaches here, the llmService call failed for this key

        } catch (error) { // This catch should ideally not be reached due to inner try/catch
            console.error(`An unexpected error occurred while processing key index ${keyIndexToTry}:`, error);
            lastError = error;
            EDITOR.error(`An unexpected error occurred while processing the ${keyIndexToTry + 1}th Key`, error.message || 'Unknown error', error);
        }
    }

    // All attempts failed
    loadingToast?.close();
    if (suspended) {
        EDITOR.warning('Operation aborted by user.');
        return 'suspended';
    }

    const errorMessage = `All ${attempts} attempts failed. Last error: ${lastError?.message || 'Unknown error'}`;
    EDITOR.error(errorMessage, "", lastError);
    console.error('All API call attempts failed.', lastError);
    return `Error: ${errorMessage}`; // Return a clear error string

    // // Public request configuration (Commented out original code remains unchanged)
    // const requestConfig = {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': `Bearer ${USER_API_KEY}`
    //     },
    //     body: JSON.stringify({
    //         model: USER_API_MODEL,
    //         messages: [
    //             { role: "system", content: systemPrompt },
    //             { role: "user", content: userPrompt }
    //         ],
    //         temperature: USER.tableBaseSetting.custom_temperature
    //     })
    // };
    //
    // // Generic request function
    // const makeRequest = async (url) => {
    //     const response = await fetch(url, requestConfig);
    //     if (!response.ok) {
    //         const errorBody = await response.text();
    //         throw { status: response.status, message: errorBody };
    //     }
    //     return response.json();
    // };
    // let firstError;
    // try {
    //     // First attempt to complete /chat/completions
    //     const modifiedUrl = new URL(USER_API_URL);
    //     modifiedUrl.pathname = modifiedUrl.pathname.replace(/\/$/, '') + '/chat/completions';
    //     const result = await makeRequest(modifiedUrl.href);
    //     if (result?.choices?.[0]?.message?.content) {
    //         console.log('Request successful:', result.choices[0].message.content)
    //         return result.choices[0].message.content;
    //     }
    // } catch (error) {
    //     firstError = error;
    // }
    //
    // try {
    //     // Second attempt at the original URL
    //     const result = await makeRequest(USER_API_URL);
    //     return result.choices[0].message.content;
    // } catch (secondError) {
    //     const combinedError = new Error('API request failed');
    //     combinedError.details = {
    //         firstAttempt: firstError?.message || 'No error message on first request',
    //         secondAttempt: secondError.message
    //     };
    //     throw combinedError;
    // }
}

/**
 * Request model list
 * @returns {Promise<void>}
 */
/**
 * Format API Key for error messages
 * @param {string} key - The API Key
 * @returns {string} The formatted Key string
 */
function maskApiKey(key) {
    const len = key.length;
    if (len === 0) return "[Empty Key]";
    if (len <= 8) {
        const visibleCount = Math.ceil(len / 2);
        return key.substring(0, visibleCount) + '...';
    } else {
        return key.substring(0, 4) + '...' + key.substring(len - 4);
    }
}

/**Request model list
 * @returns {Promise<void>}
 */
export async function updateModelList() {
    const apiUrl = $('#custom_api_url').val().trim();
    const decryptedApiKeysString = await getDecryptedApiKey(); // Use getDecryptedApiKey function to decrypt

    if (!decryptedApiKeysString) {
        EDITOR.error('API key decryption failed or not set, please check the API key settings!');
        return;
    }
    if (!apiUrl) {
        EDITOR.error('Please enter the API URL');
        return;
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
        EDITOR.error('No valid API Key found, please check the input.');
        return;
    }

    let foundValidKey = false;
    const invalidKeysInfo = [];
    let modelCount = 0; // Used to record the number of models obtained
    const $selector = $('#model_selector');

    // Normalize URL path
    let modelsUrl;
    try {
        const normalizedUrl = new URL(apiUrl);
        normalizedUrl.pathname = normalizedUrl.pathname.replace(/\/$/, '') + '/models';
        modelsUrl = normalizedUrl.href;
    } catch (e) {
        EDITOR.error(`Invalid API URL: ${apiUrl}`, "", e);
        console.error('URL parsing failed:', e);
        return;
    }

    for (let i = 0; i < apiKeys.length; i++) {
        const currentApiKey = apiKeys[i];
        try {
            const response = await fetch(modelsUrl, {
                headers: {
                    'Authorization': `Bearer ${currentApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                let errorMsg = `Request failed: ${response.status}`;
                try {
                    const errorBody = await response.text();
                    errorMsg += ` - ${errorBody}`;
                } catch {}
                throw new Error(errorMsg);
            }

            const data = await response.json();

            // Only update the dropdown box when the first successful acquisition is made
            if (!foundValidKey && data?.data?.length > 0) {
                $selector.empty(); // Clear existing options
                const customModelName = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
                let hasMatchedModel = false;

                data.data.forEach(model => {
                    $selector.append($('<option>', {
                        value: model.id,
                        text: model.id
                    }));

                    // Check if there is a model name that matches custom_model_name
                    if (model.id === customModelName) {
                        hasMatchedModel = true;
                    }
                });

                // If there is a matching model, select it
                if (hasMatchedModel) {
                    $selector.val(customModelName);
                }

                foundValidKey = true;
                modelCount = data.data.length; // Record the number of models
                // Do not display success message here, handle it uniformly at the end
            } else if (!foundValidKey && (!data?.data || data.data.length === 0)) {
                 // Even if the request is successful, but there is no model data, it is also regarded as a failure case and recorded
                 throw new Error('Request successful but no valid model list returned');
            }
            // If a valid key has been found and the list has been updated, subsequent keys will only be checked for validity and the UI will no longer be updated

        } catch (error) {
            console.error(`Failed to get models using the ${i + 1}th Key:`, error);
            invalidKeysInfo.push({ index: i + 1, key: currentApiKey, error: error.message });
        }
    }

    // Handle final results and error prompts
    if (foundValidKey) {
        EDITOR.success(`Successfully obtained ${modelCount} models and updated the list (a total of ${apiKeys.length} Keys were checked)`);
    } else {
        EDITOR.error('Failed to get the model list using any of the provided API Keys');
        $selector.empty(); // Make sure to clear the list when all keys are invalid
        $selector.append($('<option>', { value: '', text: 'Failed to get model list' }));
    }

    if (invalidKeysInfo.length > 0) {
        const errorDetails = invalidKeysInfo.map(item =>
            `The ${item.index}th Key (${maskApiKey(item.key)}) is invalid: ${item.error}`
        ).join('\n');
        EDITOR.error(`The following API Keys are invalid:\n${errorDetails}`);
    }
}
/**
 * Estimate Token Count
 * @param {string} text - The text for which to estimate the token count
 * @returns {number} The estimated token count
 */
export function estimateTokenCount(text) {
    // Count the number of Chinese characters
    let chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;

    // Count the number of English words
    let englishWords = text.match(/\b\w+\b/g) || [];
    let englishCount = englishWords.length;

    // Estimate the number of tokens
    let estimatedTokenCount = chineseCount + Math.floor(englishCount * 1.2);
    return estimatedTokenCount;
}
/**
 * @description
 * - **Function**: Export all table data for other plugins to call.
 * - **Use case**: When other plugins need to access or process the table data managed by the current plugin, they can use this function to get it.
 * - **Return value**: Returns an array containing all table data, each table object contains:
 *   - `name`: The name of the table.
 *   - `data`: A two-dimensional array representing the complete data of the table (including the header and all rows).
 *
 * @returns {Array<Object<{name: string, data: Array<Array<string>>}>>}
 */
export function ext_getAllTables() {
    // Core refactoring: Consistent with ext_exportAllTablesAsJson, ensure that the data source is the latest persistent state.
    
    // 1. Get the latest piece
    const { piece } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) {
        console.warn("[Memory Enhancement] ext_getAllTables: No valid table data found.");
        return [];
    }

    // 2. Create/update Sheet instances based on the latest hash_sheets
    const tables = BASE.hashSheetsToSheets(piece.hash_sheets);
    if (!tables || tables.length === 0) {
        return [];
    }
    
    // 3. Iterate through the latest instances to build data
    const allData = tables.map(table => {
        if (!table.enable) return null; // Skip disabled tables
        const header = table.getHeader();
        const body = table.getBody();
        const fullData = [header, ...body];

        return {
            name: table.name,
            data: fullData,
        };
    }).filter(Boolean); // Filter out null (disabled tables)

    return allData;
}

/**
 * @description
 * - **Function**: Export all tables as a JSON object, the format is similar to 'Sample Table.json'.
 * - **Use case**: Used to export the state and data of all current tables into a single JSON file.
 * - **Return value**: Returns a JSON object, the key is the UID of the table, and the value is the complete configuration and data of the table.
 *
 * @returns {Object}
 */
export function ext_exportAllTablesAsJson() {
    // The final and most stable solution: ensure that the data input to JSON.stringify is pure.

    const { piece } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) {
        console.warn("[Memory Enhancement] ext_exportAllTablesAsJson: No valid table data found.");
        return {};
    }

    const tables = BASE.hashSheetsToSheets(piece.hash_sheets);
    if (!tables || tables.length === 0) {
        return {};
    }

    const exportData = {};
    tables.forEach(table => {
        if (!table.enable) return; // Skip disabled tables

        try {
            const rawContent = table.getContent(true) || [];

            // Deep cleaning to ensure that all cells are of string type.
            // This is the key to prevent JSON.stringify from behaving abnormally due to undefined, null, or other non-string types.
            const sanitizedContent = rawContent.map(row =>
                Array.isArray(row) ? row.map(cell =>
                    String(cell ?? '') // Convert null and undefined to empty strings, and force other types to strings
                ) : []
            );

            exportData[table.uid] = {
                uid: table.uid,
                name: table.name,
                content: sanitizedContent
            };
        } catch (error) {
            console.error(`[Memory Enhancement] Error exporting table ${table.name} (UID: ${table.uid}):`, error);
        }
    });

    // Directly serialize the entire cleaned object.
    // If there is still an error here, it means that the problem is more complicated than expected, but in theory this is the most standard practice in JS.
    try {
        // To avoid parsing failure of the outer macro, we directly return a string and let the macro parse it by itself.
        return exportData;
    } catch (e) {
        console.error("[Memory Enhancement] Final JSON serialization failed:", e);
        return {}; // Return an empty object in case of an accident
    }
}
