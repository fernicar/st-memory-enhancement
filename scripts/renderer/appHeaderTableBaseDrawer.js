import {DERIVED, EDITOR, SYSTEM, USER} from "../../core/manager.js";
import {getChatSheetsView} from "../editor/chatSheetsDataView.js";
import {getEditView, updateTableContainerPosition} from "../editor/tableTemplateEditView.js";

// Global variable definitions (unchanged)
let tableDrawer = null;
let tableDrawerIcon = null;
let tableDrawerContent = null;
let appHeaderTableContainer = null;
let databaseButton = null;
let editorButton = null;
let settingButton = null;
let inlineDrawerHeaderContent = null;
let tableDrawerContentHeader = null;

let tableViewDom = null;
let tableEditDom = null;
let settingContainer = null;

// New: Cache the jQuery object of the content container
let databaseContentDiv = null;
let editorContentDiv = null;
let settingContentDiv = null;

const timeOut = 200;
const easing = 'easeInOutCubic';

let isEventListenersBound = false;
let currentActiveButton = null; // Track currently active button

/**
 * Update button selection state (unchanged)
 * @param {jQuery} selectedButton The currently selected button
 */
function updateButtonStates(selectedButton) {
    if (currentActiveButton && currentActiveButton.is(selectedButton)) {
        return false;
    }
    databaseButton.css('opacity', '0.5');
    editorButton.css('opacity', '0.5');
    settingButton.css('opacity', '0.5');
    selectedButton.css('opacity', '1');
    currentActiveButton = selectedButton;
    return true;
}

/**
 * Initialize the application header table drawer (called only once)
 */
export async function initAppHeaderTableDrawer() {
    if (isEventListenersBound) {
        return;
    }

    // DOM element selection (executed only once)
    tableDrawer = $('#table_database_settings_drawer');
    tableDrawerIcon = $('#table_drawer_icon');
    tableDrawerContent = $('#table_drawer_content');
    appHeaderTableContainer = $('#app_header_table_container');
    databaseButton = $('#database_button');
    editorButton = $('#editor_button');
    settingButton = $('#setting_button');
    inlineDrawerHeaderContent = $('#inline_drawer_header_content');
    tableDrawerContentHeader = $('#table_drawer_content_header');

    // DOM modification (executed only once)
    $('.fa-panorama').removeClass('fa-panorama').addClass('fa-image');
    $('.fa-user-cog').removeClass('fa-user-cog').addClass('fa-user');

    // Asynchronously get content (executed only once)
    if (tableViewDom === null) {
        tableViewDom = await getChatSheetsView(-1);
    }
    if (tableEditDom === null) {
        tableEditDom = $(`<div style=""></div>`);
        tableEditDom.append(await getEditView(-1));
    }
    if (settingContainer === null) {
        const header = $(`<div></div>`).append($(`<div style="margin: 10px 0;"></div>`).append(inlineDrawerHeaderContent));
        settingContainer = header.append($('.memory_enhancement_container').find('#memory_enhancement_settings_inline_drawer_content'));
    }

    // Create a container div and wrap the content in it (executed only once)
    // **** Modification point: cache the jQuery object when creating it ****
    databaseContentDiv = $(`<div id="database-content" style="width: 100%; height: 100%; overflow: hidden;"></div>`).append(tableViewDom);
    editorContentDiv = $(`<div id="editor-content" style="width: 100%; height: 100%; display: none; overflow: hidden;"></div>`).append(tableEditDom);
    settingContentDiv = $(`<div id="setting-content" style="width: 100%; height: 100%; display: none; overflow: hidden;"></div>`).append(settingContainer);

    // Add all content containers to appHeaderTableContainer (executed only once)
    appHeaderTableContainer.append(databaseContentDiv);
    appHeaderTableContainer.append(editorContentDiv);
    appHeaderTableContainer.append(settingContentDiv);

    // Initialize button state (executed only once)
    updateButtonStates(databaseButton);

    $('#tableUpdateTag').click(function() {
        $('#extensions_details').trigger('click');
    });

    // **** Modification point: button click event calls the new switchContent function ****
    databaseButton.on('click', function() {
        if (updateButtonStates(databaseButton)) {
            switchContent(databaseContentDiv); // Pass the cached jQuery object
        }
    });

    editorButton.on('click', function() {
        if (updateButtonStates(editorButton)) {
            switchContent(editorContentDiv); // Pass the cached jQuery object
            // updateTableContainerPosition();
        }
    });

    settingButton.on('click', function() {
        if (updateButtonStates(settingButton)) {
            switchContent(settingContentDiv); // Pass the cached jQuery object
        }
    });

    isEventListenersBound = true;

    // Remove old version elements (executed only once)
    $('.memory_enhancement_container').remove();
}

/**
 * Open/close the application header table drawer (unchanged)
 */
export async function openAppHeaderTableDrawer(target = undefined) {
    if (!isEventListenersBound) {
        await initAppHeaderTableDrawer();
    }

    // If the target is the settings button, open the settings drawer directly
    if (tableDrawerIcon.hasClass('closedIcon')) {
        // Close other drawers
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
        $('.openIcon').not('#table_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

        // Open the current drawer
        tableDrawerIcon.toggleClass('closedIcon openIcon');
        tableDrawerContent.toggleClass('closedDrawer openDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });

        if (target) {
            // If the target is the settings button, open the settings drawer directly
            if (target === 'database') {
                databaseButton.trigger('click');
            } else if (target === 'setting') {
                settingButton.trigger('click');
            } else if (target === 'editor') {
                editorButton.trigger('click');
            }
        }
    } else {
        // Close the current drawer
        tableDrawerIcon.toggleClass('openIcon closedIcon');
        tableDrawerContent.toggleClass('openDrawer closedDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
    }
}

/**
 * **** New: Generic content switching function ****
 * @param {jQuery} targetContent The jQuery object of the target content to be displayed
 */
async function switchContent(targetContent) {
    // **** Modification point: directly use the :visible pseudo-class, or maintain a variable to record the currently displayed element ****
    // Using :visible still requires a query, but it is better than finding all child elements and then filtering
    // Alternatively, you can introduce a variable to track the currently displayed div to avoid DOM queries
    const currentContent = appHeaderTableContainer.children(':visible');

    // If the target content is the current content, do nothing (theoretically, updateButtonStates has already handled this, but add a layer of insurance)
    if (currentContent.is(targetContent)) {
        return;
    }

    // Stop the currently ongoing animation (in case the user clicks quickly)
    currentContent.stop(true, false); // Clear the animation queue, do not jump to the end of the animation
    targetContent.stop(true, false);  // Clear the animation queue, do not jump to the end of the animation

    if (currentContent.length > 0) {
        // **** Modification point: simplify the animation chain, remove .delay().hide(0) ****
        // slideUp will automatically set display: none after the animation ends
        currentContent.slideUp({
            duration: timeOut,
            easing: easing,
            // queue: false // If you don't want the animation to queue, you can consider this, but it may cause visual overlapping
        });
    }

    // Use slideDown to display the target content
    targetContent.slideDown({
        duration: timeOut,
        easing: easing,
        // queue: false
    });
}
