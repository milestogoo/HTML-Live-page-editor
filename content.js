// content.js
(function() {
    let isEditingEnabled = false;
    let highlightEditable = true;
    let saveChanges = true;
    let editableElements = [];
    let currentEditor = null;
    let savedChanges = {};
  
    // Load saved changes from storage
    chrome.storage.local.get(['savedChanges'], function(result) {
      if (result.savedChanges && result.savedChanges[window.location.hostname]) {
        savedChanges = result.savedChanges[window.location.hostname];
        applyStoredChanges();
      }
    });
  
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      switch (message.action) {
        case 'enableEditing':
          isEditingEnabled = true;
          highlightEditable = message.highlightEditable;
          saveChanges = message.saveChanges;
          enableTextEditing();
          break;
        case 'disableEditing':
          isEditingEnabled = false;
          disableTextEditing();
          break;
        case 'updateOptions':
          if (message.hasOwnProperty('highlightEditable')) {
            highlightEditable = message.highlightEditable;
            updateHighlighting();
          }
          if (message.hasOwnProperty('saveChanges')) {
            saveChanges = message.saveChanges;
          }
          break;
      }
    });
  
    function applyStoredChanges() {
      for (const selector in savedChanges) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            if (savedChanges[selector].textContent) {
              element.textContent = savedChanges[selector].textContent;
            }
            if (savedChanges[selector].innerHTML) {
              element.innerHTML = savedChanges[selector].innerHTML;
            }
          });
        } catch (e) {
          console.error('Error applying saved changes:', e);
        }
      }
    }
  
    function getUniqueSelector(element) {
      if (element.id) {
        return `#${element.id}`;
      }
      
      let path = [];
      while (element) {
        let selector = element.tagName.toLowerCase();
        
        if (element.className) {
          const classes = Array.from(element.classList).join('.');
          if (classes) {
            selector += `.${classes}`;
          }
        }
        
        // Add position if needed
        let siblings = element.parentNode ? Array.from(element.parentNode.children) : [];
        if (siblings.length > 1) {
          const index = siblings.indexOf(element) + 1;
          selector += `:nth-child(${index})`;
        }
        
        path.unshift(selector);
        
        // No need for a very long path
        if (path.length > 3) {
          break;
        }
        
        element = element.parentNode;
        if (!element || element === document.body || element === document.documentElement) {
          break;
        }
      }
      
      return path.join(' > ');
    }
  
    function saveChange(element, newText) {
      if (!saveChanges) return;
      
      const selector = getUniqueSelector(element);
      const hostname = window.location.hostname;
      
      chrome.storage.local.get(['savedChanges'], function(result) {
        const allSavedChanges = result.savedChanges || {};
        
        if (!allSavedChanges[hostname]) {
          allSavedChanges[hostname] = {};
        }
        
        allSavedChanges[hostname][selector] = {
          textContent: newText,
          timestamp: Date.now()
        };
        
        chrome.storage.local.set({ savedChanges: allSavedChanges });
        savedChanges = allSavedChanges[hostname];
      });
    }
  
    function enableTextEditing() {
      // Find all text nodes in the document
      const textElements = findEditableElements();
      editableElements = textElements;
      
      // Make them editable
      textElements.forEach(element => {
        element.addEventListener('click', handleElementClick);
        if (highlightEditable) {
          element.classList.add('lte-editable');
        }
      });
    }
  
    function disableTextEditing() {
      // Remove event listeners and highlighting
      editableElements.forEach(element => {
        element.removeEventListener('click', handleElementClick);
        element.classList.remove('lte-editable', 'lte-editing');
      });
      
      // Close any open editors
      if (currentEditor) {
        document.body.removeChild(currentEditor);
        currentEditor = null;
      }
      
      editableElements = [];
    }
  
    function updateHighlighting() {
      if (isEditingEnabled) {
        editableElements.forEach(element => {
          if (highlightEditable) {
            element.classList.add('lte-editable');
          } else {
            element.classList.remove('lte-editable');
          }
        });
      }
    }
  
    function findEditableElements() {
      const allElements = document.body.getElementsByTagName('*');
      const editableElements = [];
      
      for (let i = 0; i < allElements.length; i++) {
        const element = allElements[i];
        
        // Skip certain elements
        if (elementShouldBeSkipped(element)) {
          continue;
        }
        
        // Check if the element has visible text
        if (hasVisibleText(element)) {
          editableElements.push(element);
        }
      }
      
      return editableElements;
    }
  
    function elementShouldBeSkipped(element) {
      const tagName = element.tagName.toLowerCase();
      const skipTags = ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio', 'input', 'textarea', 'select', 'option', 'button'];
      
      // Skip elements with these tags
      if (skipTags.includes(tagName)) {
        return true;
      }
      
      // Skip hidden elements
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
      }
      
      // Skip elements with zero dimensions
      if (element.offsetWidth === 0 || element.offsetHeight === 0) {
        return true;
      }
      
      return false;
    }
  
    function hasVisibleText(element) {
      // Check if the element has text nodes as direct children
      for (let i = 0; i < element.childNodes.length; i++) {
        const node = element.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
          return true;
        }
      }
      
      // If the element has only text content (no HTML)
      if (element.childNodes.length === 0 && element.textContent.trim().length > 0) {
        return true;
      }
      
      return false;
    }
  
    function handleElementClick(event) {
      if (!isEditingEnabled) return;
      
      // Prevent the click from doing anything else
      event.preventDefault();
      event.stopPropagation();
      
      const element = event.currentTarget;
      
      // Create editor
      createEditor(element);
      
      // Highlight the element being edited
      element.classList.add('lte-editing');
    }
  
    function createEditor(element) {
      // Remove any existing editor
      if (currentEditor) {
        document.body.removeChild(currentEditor);
      }
      
      // Create editor container
      const editor = document.createElement('div');
      editor.className = 'lte-editor';
      
      // Create textarea
      const textarea = document.createElement('textarea');
      textarea.value = element.innerHTML; // Use innerHTML to preserve formatting
      
      // Create buttons
      const buttonsContainer = document.createElement('div');
      buttonsContainer.className = 'lte-editor-buttons';
      
      const saveButton = document.createElement('button');
      saveButton.textContent = 'Save';
      saveButton.className = 'lte-save-btn';
      saveButton.addEventListener('click', () => {
        element.innerHTML = textarea.value;
        saveChange(element, textarea.value);
        closeEditor(element);
      });
      
      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.className = 'lte-cancel-btn';
      cancelButton.addEventListener('click', () => {
        closeEditor(element);
      });
      
      // Add elements to DOM
      buttonsContainer.appendChild(cancelButton);
      buttonsContainer.appendChild(saveButton);
      editor.appendChild(textarea);
      editor.appendChild(buttonsContainer);
      document.body.appendChild(editor);
      
      // Position the editor near the element
      positionEditor(editor, element);
      
      // Focus the textarea
      textarea.focus();
      
      // Store reference to current editor
      currentEditor = editor;
    }
  
    function closeEditor(element) {
      if (currentEditor) {
        document.body.removeChild(currentEditor);
        currentEditor = null;
      }
      
      element.classList.remove('lte-editing');
    }
  
    function positionEditor(editor, element) {
      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      // Position below the element
      let top = rect.bottom + scrollTop + 10;
      let left = rect.left + scrollLeft;
      
      // Check if the editor would go off-screen to the right
      if (left + editor.offsetWidth > window.innerWidth) {
        left = window.innerWidth - editor.offsetWidth - 20;
      }
      
      // Make sure the editor is not positioned off-screen
      left = Math.max(10, left);
      
      editor.style.top = `${top}px`;
      editor.style.left = `${left}px`;
    }
  })();