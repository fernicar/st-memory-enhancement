import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../core/manager.js';

/**
 * @description Helper function to recursively create a Proxy
 * @param {Object} obj - The object to be proxied
 * @returns {Object} - The created Proxy object
 */
export const createProxy = (obj) => {
    return new Proxy(obj, {
        get(target, prop) {
            return target[prop];
        },
        set(target, prop, newValue) {
            target[prop] = newValue; // Directly modify the original props object
            return true;
        },
    });
}

export const createProxyWithUserSetting = (target, allowEmpty = false) => {
    return new Proxy({}, {
        get: (_, property) => {
            // console.log(`Creating proxy object ${target}`, property)
            // Get from user settings data with the highest priority
            if (USER.getSettings()[target] && property in USER.getSettings()[target]) {
                // console.log(`Variable ${property} has been obtained from user settings`)
                return USER.getSettings()[target][property];
            }
            // Try to get from the old version of the data location USER.getExtensionSettings().muyoo_dataTable
            if (USER.getExtensionSettings()[target] && property in USER.getExtensionSettings()[target]) {
                console.log(`Variable ${property} was not found in the user configuration, it has been obtained from the old version of the data`)
                const value = USER.getExtensionSettings()[target][property];
                if (!USER.getSettings()[target]) {
                    USER.getSettings()[target] = {}; // Initialize if it does not exist
                }
                USER.getSettings()[target][property] = value;
                return value;
            }
            // If it does not exist in USER.getExtensionSettings().muyoo_dataTable, get it from defaultSettings
            if (USER.tableBaseDefaultSettings && property in USER.tableBaseDefaultSettings) {
                console.log(`Variable ${property} was not found, it has been obtained from the default settings`)
                return USER.tableBaseDefaultSettings[property];
            }
            // If it does not exist in defaultSettings, check if it is allowed to be empty
            if (allowEmpty) {
                return undefined;
            }
            // If it does not exist in defaultSettings, report an error
            EDITOR.error(`Variable ${property} was not found in the default settings, please check the code`)
            return undefined;
        },
        set: (_, property, value) => {
            console.log(`Setting variable ${property} to ${value}`)
            if (!USER.getSettings()[target]) {
                USER.getSettings()[target] = {}; // Initialize if it does not exist
            }
            USER.getSettings()[target][property] = value;
            USER.saveSettings();
            return true;
        },
    })
}
