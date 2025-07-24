import { saveSettingsDebounced, saveSettings, getSlideToggleOptions, generateRaw, saveChat, eventSource, event_types, getRequestHeaders } from '/script.js';
import { DOMPurify, Bowser, slideToggle } from '/lib.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '/scripts/popup.js';
import { power_user, applyPowerUserSettings, getContextSettings, loadPowerUserSettings } from "/scripts/power-user.js";
import { LoadLocal, SaveLocal, LoadLocalBool } from '/scripts/f-localStorage.js';
import { getCurrentLocale } from '/scripts/i18n.js';



/**
 * appManager object, used to centrally manage and expose commonly used application functions and libraries.
 * Convenient for unified access and use of these functions in different modules of the application.
 */
const applicationFunctionManager = {
    // script.js module
    saveSettingsDebounced,
    saveSettings,
    getSlideToggleOptions,
    generateRaw,
    saveChat,
    eventSource,
    event_types,
    getRequestHeaders,

    // lib.js module
    DOMPurify,
    Bowser,
    slideToggle,

    // scripts/extensions.js module
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,

    // scripts/popup.js module
    POPUP_TYPE,
    Popup,
    callGenericPopup,

    // scripts/power-user.js module
    power_user,
    applyPowerUserSettings,
    getContextSettings,
    loadPowerUserSettings,

    // scripts/f-localStorage.js module
    LoadLocal,
    SaveLocal,
    LoadLocalBool,

    // scripts/i18n.js module
    getCurrentLocale,

    // null on initialization
    doNavbarIconClick: null,

    // initialization method
    async init() {
        try {
            const { doNavbarIconClick } = await import('/script.js');
            this.doNavbarIconClick = doNavbarIconClick || null;
        } catch (error) {
            console.warn('Failed to import doNavbarIconClick:', error);
            this.doNavbarIconClick = () => {
                console.warn('doNavbarIconClick is not available');
            };
        }
    }
};

// Initialize before exporting
applicationFunctionManager.init();

export default applicationFunctionManager;
