import applicationFunctionManager from "./appFuncManager.js";

let _lang = undefined;
let _translations = undefined;

/**
 * Asynchronously get translation files
 * @param {string} locale - Language identifier (e.g., 'en', 'zh-cn')
 * @returns {Promise<Object>} - Translation object
 */
async function fetchTranslations(locale) {
    try {
        const response = await fetch(`/scripts/extensions/third-party/st-memory-enhancement/assets/locales/${locale}.json`);
        if (!response.ok) {
            console.warn(`Could not load translations for ${locale}, falling back to zh-cn`);
            // Fallback to Chinese if requested locale is not available
            if (locale !== 'zh-cn') {
                return await fetchTranslations('zh-cn');
            }
            return {};
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        return {};
    }
}

async function getTranslationsConfig() {
    if (_lang === undefined) {
        _lang = applicationFunctionManager.getCurrentLocale();
    }
    if (_lang === undefined) {
        _lang = 'zh-cn';
        return { translations: {}, lang: _lang };
    }
    if (_translations === undefined) {
        _translations = await fetchTranslations(_lang)
    }
    return { translations: _translations, lang: _lang };
}

/**
 * Apply translations to DOM elements
 * @param {Object} translations - Translation object
 */
function applyTranslations(translations) {
    console.log("Applying translations", translations);
    // Iterate over all elements with the data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            // If the element has a title attribute, translate the title attribute
            if (element.hasAttribute('title')) {
                element.setAttribute('title', translations[key]);
            } else {
                // Otherwise, translate the text content of the element
                element.textContent = translations[key];
            }
        }
    });

    // Translate other elements via CSS selectors
    translateElementsBySelector(translations, '#table_clear_up a', "Reorganize tables now");
    translateElementsBySelector(translations, '#dataTable_to_chat_button a', "Edit style of tables rendered in conversation");
}

/**
 * Translate elements using CSS selectors
 * @param {Object} translations - Translation object
 * @param {string} selector - CSS selector
 * @param {string} key - Translation key
 */
function translateElementsBySelector(translations, selector, key) {
    if (translations[key]) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.textContent = translations[key];
        });
    }
}

/**
 * Translate objects within a specified scope
 * @param targetScope
 * @param source
 * @returns {Promise<*|Object|Array|string>}
 */
export async function translating(targetScope, source) {
    let { translations, lang } = await getTranslationsConfig();
    if (lang === 'zh-cn') {
        return source;
    }

    translations = translations[targetScope];
    /**
     * Recursively translate all strings in an object
     * @param {Object|Array|string} obj - The object or value to be translated
     * @returns {Object|Array|string} - The translated object or value
     */
    function translateRecursively(obj) {
        // If it is a string, try to translate it
        if (typeof obj === 'string') {
            return translations[obj] || obj;
        }

        // If it is an array, iterate through the array elements and translate them recursively
        if (Array.isArray(obj)) {
            return obj.map(item => translateRecursively(item));
        }

        // If it is an object, iterate through the object properties and translate them recursively
        if (obj !== null && typeof obj === 'object') {
            const result = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    result[key] = translateRecursively(obj[key]);
                }
            }
            return result;
        }

        // Other types of values remain unchanged
        return obj;
    }

    // If the translation dictionary is empty, return the original object directly
    if (!translations || Object.keys(translations).length === 0) {
        console.warn("No translations available for locale:", lang);
        return source;
    }

    // Recursively translate the target object
    if (source !== null && typeof source === 'object') {
        return translateRecursively(source);
    }

    return source;
}

/**
 * Switch language for variables
 * @param targetScope
 * @param source
 */
export async function switchLanguage(targetScope, source) {
    const { translations, lang } = await getTranslationsConfig()
    if (lang === 'zh-cn') {
        return source;
    }

    return {...source, ...translations[targetScope] || {}};
}

/**
 * The main function for applying translations and localizations to the initially loaded html
 */
export async function executeTranslation() {
    const { translations, lang } = await getTranslationsConfig();
    if (lang === 'zh-cn') {
        return;
    }

    console.log("Current Locale: ", lang);
    // Get the translated JSON file
    if (Object.keys(translations).length === 0) {
        console.warn("No translations found for locale:", lang);
        return;
    }

    // Apply translations
    applyTranslations(translations);

    console.log("Translation completed for locale:", lang);
}
