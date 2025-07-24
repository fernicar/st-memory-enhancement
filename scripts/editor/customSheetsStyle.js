import {BASE, EDITOR, USER} from "../../core/manager.js";
import {updateSystemMessageTableStatus} from "../renderer/tablePushToChat.js";

export async function customSheetsStylePopup() {
    const customStyleEditor = `
<div class="column-editor">
    <div class="popup-content">
        Customize the wrapper style of the table pushed to the conversation, supporting HTML and CSS. Use $0 to represent the insertion position of the entire table.
    </div>
    <div class="column-editor-body">
        <textarea id="customStyleEditor" class="column-editor-textarea" rows="30" placeholder="Please enter custom styles"></textarea>
    </div>
</div>
`
    const customStylePopup = new EDITOR.Popup(customStyleEditor, EDITOR.POPUP_TYPE.CONFIRM, '', { large: true, okButton: "Apply Changes", cancelButton: "Cancel" });
    const styleContainer = $(customStylePopup.dlg)[0];
    const resultDataContainer = styleContainer.querySelector("#customStyleEditor");
    resultDataContainer.style.display = "flex";
    resultDataContainer.style.flexDirection = "column";
    resultDataContainer.style.flexGrow = "1";
    resultDataContainer.style.width = "100%";
    resultDataContainer.style.height = "100%";

    // Get the resultData from resultDataContainer
    let resultData = USER.tableBaseSetting.to_chat_container;
    // If there is no resultData, use the default value
    if (!resultData) {
        resultData = `<div class="table-container"><div class="table-content">$0</div></div>`;
    }
    // Set the value of resultDataContainer
    resultDataContainer.value = resultData;

    await customStylePopup.show();
    if (customStylePopup.result) {
        USER.tableBaseSetting.to_chat_container = resultDataContainer.value;
        updateSystemMessageTableStatus()
    }
    // console.log(resultDataContainer.value)
}
