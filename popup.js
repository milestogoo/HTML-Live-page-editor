// popup.js
document.addEventListener('DOMContentLoaded', function() {
    const enableEditingBtn = document.getElementById('enableEditing');
    const disableEditingBtn = document.getElementById('disableEditing');
    const highlightEditableCheckbox = document.getElementById('highlightEditable');
    const saveChangesCheckbox = document.getElementById('saveChanges');
  
    // Load saved options
    chrome.storage.sync.get(['highlightEditable', 'saveChanges'], function(result) {
      highlightEditableCheckbox.checked = result.highlightEditable !== false;
      saveChangesCheckbox.checked = result.saveChanges !== false;
    });
  
    // Save options when changed
    highlightEditableCheckbox.addEventListener('change', function() {
      chrome.storage.sync.set({ highlightEditable: this.checked });
      sendMessageToContentScript({ 
        action: 'updateOptions', 
        highlightEditable: this.checked 
      });
    });
  
    saveChangesCheckbox.addEventListener('change', function() {
      chrome.storage.sync.set({ saveChanges: this.checked });
      sendMessageToContentScript({ 
        action: 'updateOptions', 
        saveChanges: this.checked 
      });
    });
  
    // Enable editing
    enableEditingBtn.addEventListener('click', function() {
      sendMessageToContentScript({ 
        action: 'enableEditing',
        highlightEditable: highlightEditableCheckbox.checked,
        saveChanges: saveChangesCheckbox.checked
      });
    });
  
    // Disable editing
    disableEditingBtn.addEventListener('click', function() {
      sendMessageToContentScript({ action: 'disableEditing' });
    });
  
    function sendMessageToContentScript(message) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      });
    }
  });