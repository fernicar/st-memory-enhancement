// formManager.js
import { BASE } from '../core/manager.js';
import { PopupMenu } from './popupMenu.js';

class Form {
    constructor(formConfig, initialData, updateCallback) {
        this.formConfig = formConfig;
        // Create a copy of the data
        this.formData = { ...initialData };
        this.eventHandlers = {}; // Used to store externally passed event handler functions
        this.updateCallback = updateCallback; // Callback function for real-time updates of external data
    }

    /**
     * Register an event handler
     * @param {string} eventName - The name of the event, e.g., a button's id or action
     * @param {function} handler - The event handler function
     */
    on(eventName, handler) {
        this.eventHandlers[eventName] = handler;
    }


    /**
     * Render the form HTML string
     * @returns {string} - The form HTML string
     */
    renderForm() {
        const config = this.formConfig;

        if (!config) {
            return `<div>Unknown form configuration, cannot generate editing content.</div>`;
        }

        // Build the form HTML string
        let contentHTML = `
            <div class="wide100p padding5 dataBankAttachments">
                <h2 class="marginBot5"><span>${config.formTitle}</span></h2>
                <div>${config.formDescription}</div>
                <div class="dataTable_tablePrompt_list">
        `;

        // Iterate through the field configuration to generate form items
        for (const field of config.fields) {
            field.id = field.id || field.dataKey; // If no id is specified, use dataKey as the id
            if (field.type === 'button') {
                contentHTML += `
                    <div class="form-buttons">
                        <i class="menu_button menu_button_icon ${field.iconClass}" id="${field.id}">
                            <a>${field.text}</a>
                        </i>
                    </div>
                `;
            } else {
                if (field.type === 'checkbox') {
                    contentHTML += `
                        <div class="checkbox-container" style="display: flex; align-items: center; margin-bottom: 10px;">
                            <input type="checkbox" id="${field.id}" data-key="${field.dataKey}">
                            <label for="${field.id}" style="margin-left: 5px;">${field.label}</label>
                        </div>
                    `;
                } else if (field.type === 'number') {
                    contentHTML += `
                        <div class="number-container" style="display: flex; align-items: center; margin-bottom: 10px;">
                            <label for="${field.id}" style="margin-right: 5px;">${field.label}</label>
                            <input type="number" id="${field.id}" class="text_pole wideMax100px margin0">
                        </div>
                    `;
                } else if (field.type === 'label') {
                    contentHTML += `
                        <div class="number-container" style="display: flex; align-items: center; margin-bottom: 10px;">
                            <label for="${field.id}" style="margin-right: 5px;">${field.label}</label>
                            <div>${field.text}</div>
                        </div>
                    `;
                } else {
                    contentHTML += `
                    <label>${field.label}</label>
                `;
                    if (field.description) {
                        contentHTML += `<small> ${field.description}</small>`;
                    }
                    if (field.type === 'text') {
                        contentHTML += `<input type="text" id="${field.id}" class="margin0 text_pole" style=" margin-bottom: 20px;"/>`;
                    } else if (field.type === 'textarea') {
                        contentHTML += `<textarea id="${field.id}" class="wide100p" rows="${field.rows || 2}"></textarea>`;
                    } else if (field.type === 'select') {
                        contentHTML += `
                        <select id="${field.id}">`;
                        if (Array.isArray(field.options)) {
                            field.options.forEach(option => {
                                contentHTML += `<option value="${option.value}">${option.text || option.value || option}</option>`;
                            });
                        }
                        contentHTML += `
                        </select>
                    `;
                    }
                }
            }
        }


        contentHTML += `
                </div>
            </div>
        `;

        const self = this; // Cache the this context for use in setTimeout

        // Add event listeners and initialize popup content
        setTimeout(() => { // Ensure DOM elements are rendered
            for (const field of config.fields) {
                const inputElement = document.getElementById(field.id);
                if (!inputElement) continue; // The element may not exist

                if (field.type === 'button') {
                    // Add click event for the button
                    inputElement.addEventListener('click', () => {
                        if (field.event && typeof field.event === 'string' && self.eventHandlers[field.event]) {
                            self.eventHandlers[field.event](self.formData); // Execute the externally passed event handler and pass formData
                        } else if (field.event && typeof field.event === 'function') {
                            field.event(self.formData); // Or directly execute the function in the configuration (if event is a function)
                        }
                    });
                } else {
                    // Initialize value, read from formData
                    if (self.formData[field.dataKey] !== undefined) {
                        if (field.type === 'checkbox') {
                            inputElement.checked = self.formData[field.dataKey] === true;
                        } else {
                            inputElement.value = self.formData[field.dataKey] || '';
                        }
                    }

                    // Add event listener to modify formData
                    if (field.type === 'checkbox') {
                        inputElement.addEventListener('change', (e) => {
                            const newValue = e.target.checked;
                            self.formData[field.dataKey] = newValue;
                            if (self.updateCallback && typeof self.updateCallback === 'function') {
                                self.updateCallback(field.dataKey, newValue);
                            }
                        });
                    } else {
                        inputElement.addEventListener('input', (e) => {
                            const newValue = e.target.value;
                            self.formData[field.dataKey] = newValue;
                            if (self.updateCallback && typeof self.updateCallback === 'function') {
                                self.updateCallback(field.dataKey, newValue);
                            }

                            // New: ## Autocomplete feature
                            if (field.type === 'textarea' && e.target.value.slice(-2) === '##') {
                                const popupMenu = new PopupMenu();
                                const sheets = BASE.getChatSheets();

                                if (sheets.length > 0) {
                                    sheets.forEach(sheet => {
                                        popupMenu.add(`${sheet.name}`, () => {
                                            const currentValue = e.target.value;
                                            const newValue = currentValue.substring(0, currentValue.length - 2) + `##${sheet.name}:`;
                                            e.target.value = newValue;
                                            self.formData[field.dataKey] = newValue;
                                            e.target.focus();
                                        });
                                    });
                                } else {
                                    popupMenu.add('No available tables', () => {});
                                }
                                
                                const rect = e.target.getBoundingClientRect();
                                popupMenu.show(rect.left, rect.bottom);
                            }
                        });
                    }
                }
            }
        }, 0);

        return contentHTML;
    }

    /**
     * Get a copy of the form data after modification
     * @returns {object} - A copy of the modified data
     */
    result() {
        return this.formData;
    }
}

export { Form };
