import {profile_prompts} from "../../data/profile_prompts.js";

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
                switch(value.type) {
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
    
    console.log('Table refresh type selector has been updated');

    // // Check if the existing options are consistent with profile_prompts
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

    // // Clear and re-add options when they don't match
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
        
    //     console.log('Table refresh type selector has been updated');
}