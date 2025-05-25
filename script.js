// Add status message - Move this outside the DOMContentLoaded event
function addStatusMessage(message, type) {
    const statusList = document.getElementById('statusList');
    if (!statusList) return; // Guard clause if statusList doesn't exist
    
    const statusItem = document.createElement('div');
    statusItem.className = `status-item status-${type}`;
    statusItem.innerHTML = message;
    statusList.prepend(statusItem);
}

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const preview = document.getElementById('preview');
    const previewText = document.getElementById('previewText');
    const captionInput = document.getElementById('caption');
    const listTypeSelect = document.getElementById('listType');
    const selectedListInfo = document.getElementById('selectedListInfo');
    const sendBtn = document.getElementById('sendBtn');
    const progressCard = document.getElementById('progressCard');
    const progressBar = document.querySelector('.progress-bar');
    const sentCountEl = document.getElementById('sentCount');
    const totalCountEl = document.getElementById('totalCount');
    const statusList = document.getElementById('statusList');
    
    // Connection status elements
    const connectionDot = document.querySelector('.connection-dot');
    const connectionText = document.querySelector('.connection-text');
    const connectBtn = document.querySelector('.connect-btn');
    const disconnectBtn = document.querySelector('.disconnect-btn');
    
    // Excel import elements
    const excelListTypeSelect = document.getElementById('excelListType');
    const newListNameContainer = document.getElementById('newListNameContainer');
    const newListNameInput = document.getElementById('newListName');
    const sheetNameInput = document.getElementById('sheetName');
    const excelFileInput = document.getElementById('excelFileInput');
    const importExcelBtn = document.getElementById('importExcelBtn');
    const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
    
    // Contact management elements
    const viewListTypeSelect = document.getElementById('viewListType');
    const contactsTableBody = document.getElementById('contactsTableBody');
    const deleteListBtn = document.getElementById('deleteListBtn');
    const exportListBtn = document.getElementById('exportListBtn');
    const fetchGroupDetailsBtn = document.getElementById('fetchGroupDetailsBtn');
    
    // Modals
    const groupDetailsModal = new bootstrap.Modal(document.getElementById('groupDetailsModal'));
    const groupDetailsContent = document.getElementById('groupDetailsContent');
    const confirmationModal = new bootstrap.Modal(document.getElementById('confirmationModal'));
    const confirmationModalBody = document.getElementById('confirmationModalBody');
    const confirmActionBtn = document.getElementById('confirmActionBtn');
    
    // Variables
    let selectedFile = null;
    let selectedGroups = [];
    let currentGroupDetails = null;
    let currentAction = null;
    let currentPageContacts = [];
    let currentPage = 1;
    const pageSize = 10;
    
    // Event listeners for drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.classList.add('active');
    }
    
    function unhighlight() {
        dropArea.classList.remove('active');
    }
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            handleFiles(files[0]);
        }
    }
    
    // Click to select file
    selectFileBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    dropArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files[0]);
        }
    });
    
    // Handle selected files
    function handleFiles(file) {
        selectedFile = file;
        displayPreview(file);
        validateForm();
        
        // Show file info with toast notification
        const fileSize = formatFileSize(file.size);
        let fileType = file.type.split('/')[0];
        if (fileType !== 'image' && fileType !== 'video') fileType = 'document';
        addStatusMessage(`Selected ${fileType}: ${file.name} (${fileSize})`, 'info');
    }
    
    // Display preview of the selected file
    function displayPreview(file) {
        previewText.style.display = 'none';
        preview.innerHTML = '';
        
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = function() {
                URL.revokeObjectURL(this.src);
            }
            preview.appendChild(img);
            addRemoveButton();
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.controls = true;
            video.onloadedmetadata = function() {
                URL.revokeObjectURL(this.src);
            }
            preview.appendChild(video);
            addRemoveButton();
        } else {
            // Document preview: show icon and file name
            const docDiv = document.createElement('div');
            docDiv.className = 'document-preview d-flex align-items-center gap-2';
            docDiv.innerHTML = `
                <i class="fas fa-file-alt fa-2x text-primary"></i>
                <span>${file.name}</span>
            `;
            preview.appendChild(docDiv);
            addRemoveButton();
        }
    }
    
    // Function to add a remove button to the preview
    function addRemoveButton() {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-danger remove-media-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i> Remove';
        removeBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Clear the preview
            preview.innerHTML = '';
            previewText.style.display = 'block';
            
            // Clear the selected file
            selectedFile = null;
            fileInput.value = '';
            
            // Revalidate the form
            validateForm();
        };
        
        preview.appendChild(removeBtn);
    }
    
    // Helper function to format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Fetch groups list when list type is selected
    listTypeSelect.addEventListener('change', async function() {
        const listType = this.value;
        selectedListInfo.innerHTML = '';
        
        if (listType) {
            try {
                addStatusMessage(`Loading ${listType} list...`, 'info');
                
                const response = await fetch('groups_lists.json');
                const data = await response.json();
                
                if (data[listType]) {
                    selectedGroups = data[listType];
                    
                    // Display list information
                    const count = selectedGroups.length;
                    selectedListInfo.innerHTML = `
                        <div class="recipients-count">
                            <i class="fas fa-users"></i> ${count} recipients
                        </div>
                    `;
                    
                    console.log(`Selected ${selectedGroups.length} groups/contacts from ${listType} list`);
                    validateForm();
                    
                    addStatusMessage(`Loaded ${count} recipients from ${listType} list`, 'success');
                } else {
                    addStatusMessage(`Error: List "${listType}" not found in data`, 'error');
                }
            } catch (error) {
                console.error('Error loading groups list:', error);
                addStatusMessage(`Error loading groups: ${error.message}`, 'error');
            }
        }
    });
    
    // Listen for changes in the caption to validate the form
    captionInput.addEventListener('input', validateForm);
    
    // Form validation
    function validateForm() {
        // Allow sending if either there's a caption or a file, AND there are recipients
        if (selectedGroups.length > 0 && (selectedFile || captionInput.value.trim())) {
            sendBtn.disabled = false;
            // Update button text based on what we're sending
            if (selectedFile) {
                if (selectedFile.type.startsWith('image/')) {
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Media & Text';
                } else if (selectedFile.type.startsWith('video/')) {
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Media & Text';
                } else {
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Document & Text';
                }
            } else if (captionInput.value.trim()) {
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Text Only';
            }
        } else {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send to All';
        }
    }
    
    // Handle send button click
    sendBtn.addEventListener('click', async function() {
        if (!(selectedFile || captionInput.value.trim()) || selectedGroups.length === 0) {
            return;
        }
        
        // Show progress container
        progressCard.style.display = 'block';
        totalCountEl.textContent = selectedGroups.length;
        sentCountEl.textContent = '0';
        progressBar.style.width = '0%';
        
        // Clear previous status
        statusList.innerHTML = '';
        
        // Disable form while sending
        sendBtn.disabled = true;
        listTypeSelect.disabled = true;
        
        // Determine if we're sending text-only or media
        const isTextOnly = !selectedFile && captionInput.value.trim();
        
        addStatusMessage(`Preparing to send ${isTextOnly ? 'text message' : 'media'} to ${selectedGroups.length} recipients...`, 'info');
        
        // Check if WhatsApp is connected first
        const connResponse = await fetch('/connection-status');
        const connStatus = await connResponse.json();
        
        if (!connStatus.connected) {
            addStatusMessage('WhatsApp is not connected. Attempting to connect...', 'warning');
            
            try {
                const connectResponse = await fetch('/connect-whatsapp', {
                    method: 'POST'
                });
                
                const connectData = await connectResponse.json();
                
                if (!connectData.success) {
                    addStatusMessage(`Failed to connect to WhatsApp: ${connectData.message}`, 'error');
                    sendBtn.disabled = false;
                    listTypeSelect.disabled = false;
                    return;
                }
                
                // Update connection UI
                updateConnectionUI(true);
                addStatusMessage('WhatsApp connected successfully, proceeding with send', 'success');
            } catch (error) {
                console.error('Error connecting to WhatsApp:', error);
                addStatusMessage(`Error connecting to WhatsApp: ${error.message}`, 'error');
                sendBtn.disabled = false;
                listTypeSelect.disabled = false;
                return;
            }
        }
        
        // Prepare form data
        const formData = new FormData();
        if (selectedFile) {
        formData.append('media', selectedFile);
        }
        formData.append('caption', captionInput.value);
        formData.append('groups', JSON.stringify(selectedGroups));
        formData.append('isTextOnly', isTextOnly ? 'true' : 'false');
        
        console.log('Sending with isTextOnly:', isTextOnly);
        
        try {
            // Send the request to our backend API
            const response = await fetch('/send-media', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Show appropriate success message based on message type
                const successMsg = isTextOnly 
                    ? `<i class="fas fa-check-circle status-icon"></i> Text message sending started. Process ID: ${result.processId}` 
                    : `<i class="fas fa-check-circle status-icon"></i> Media upload successful. Process ID: ${result.processId}`;
                    
                addStatusMessage(successMsg, 'success');
                
                // Start polling for real status updates
                pollProcessStatus(result.processId);
            } else {
                addStatusMessage(`<i class="fas fa-exclamation-triangle status-icon"></i> Error: ${result.message}`, 'error');
                sendBtn.disabled = false;
                listTypeSelect.disabled = false;
            }
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMsg = isTextOnly 
                ? `<i class="fas fa-exclamation-circle status-icon"></i> Error sending text message: ${error.message}` 
                : `<i class="fas fa-exclamation-circle status-icon"></i> Error sending media: ${error.message}`;
            
            addStatusMessage(errorMsg, 'error');
            sendBtn.disabled = false;
            listTypeSelect.disabled = false;
        }
    });
    
    // Poll the server for status updates on the sending process
    function pollProcessStatus(processId) {
        const pollInterval = 1000; // Poll every second
        let pollTimer;
        
        // Function to fetch status
        async function fetchStatus() {
            try {
                const response = await fetch(`/status/${processId}`);
                
                if (!response.ok) {
                    // If response is not OK, stop polling and show error
                    clearInterval(pollTimer);
                    const errorData = await response.json();
                    addStatusMessage(`<i class="fas fa-exclamation-triangle status-icon"></i> Error: ${errorData.message || 'Failed to fetch status'}`, 'error');
                    sendBtn.disabled = false;
                    listTypeSelect.disabled = false;
                    return;
                }
                
                const statusData = await response.json();
                
                // Update progress
                updateProgress(statusData.successCount + statusData.failureCount, statusData.total);
                
                // Display WhatsApp-specific errors if present
                if (statusData.errors && statusData.errors.length > 0) {
                    // Create a unique ID for each error to avoid duplicates
                    const errorKey = `whatsapp-errors-${processId}`;
                    const existingErrorMsg = document.getElementById(errorKey);
                    
                    if (!existingErrorMsg) {
                        // Create a warning message with all errors
                        const errorListItems = statusData.errors.map(err => 
                            `<li>${err}</li>`
                        ).join('');
                        
                        const errorHTML = `
                            <i class="fas fa-exclamation-triangle status-icon"></i>
                            <div>
                                <strong>WhatsApp Connection Issues:</strong>
                                <ul class="mb-0 mt-1">${errorListItems}</ul>
                                <small>These errors may affect message delivery.</small>
                                <button class="btn btn-sm btn-warning mt-2 reset-connection-btn">
                                    <i class="fas fa-sync-alt"></i> Reset WhatsApp Connection
                                </button>
                            </div>
                        `;
                        
                        const errorItem = document.createElement('div');
                        errorItem.className = 'status-item status-warning';
                        errorItem.id = errorKey;
                        errorItem.innerHTML = errorHTML;
                        statusList.prepend(errorItem);
                        
                        // Add event listener to the reset button
                        const resetBtn = errorItem.querySelector('.reset-connection-btn');
                        resetBtn.addEventListener('click', async () => {
                            try {
                                resetBtn.disabled = true;
                                resetBtn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Resetting...';
                                
                                const response = await fetch('/reset-connection', {
                                    method: 'POST'
                                });
                                
                                const result = await response.json();
                                
                                if (result.success) {
                                    addStatusMessage(`<i class="fas fa-info-circle status-icon"></i> ${result.message}`, 'info');
                                    // Remove the error message
                                    errorItem.remove();
                                } else {
                                    addStatusMessage(`<i class="fas fa-exclamation-circle status-icon"></i> Failed to reset: ${result.message}`, 'error');
                                    resetBtn.disabled = false;
                                    resetBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Reset WhatsApp Connection';
                                }
                            } catch (error) {
                                console.error('Error resetting connection:', error);
                                addStatusMessage(`<i class="fas fa-exclamation-circle status-icon"></i> Error resetting connection: ${error.message}`, 'error');
                                resetBtn.disabled = false;
                                resetBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Reset WhatsApp Connection';
                            }
                        });
                    }
                }
                
                // Handle fatal error
                if (statusData.error) {
                    const errorId = `error-fatal-${processId}`;
                    if (!document.getElementById(errorId)) {
                        addStatusMessage(`<i class="fas fa-times-circle status-icon"></i> Fatal Error: ${statusData.error}`, 'error');
                    }
                }
                
                // Add status messages for newly completed items
                if (statusData.successful && statusData.successful.length > 0) {
                    // Get the IDs of recipients we've already logged
                    const existingStatusItems = statusList.querySelectorAll('.status-success, .status-error');
                    const processedIds = new Set();
                    
                    existingStatusItems.forEach(item => {
                        const idMatch = item.innerHTML.match(/data-id="([^"]+)"/);
                        if (idMatch && idMatch[1]) {
                            processedIds.add(idMatch[1]);
                        }
                    });
                    
                    // Add messages for new successful sends
                    statusData.successful.forEach(recipient => {
                        if (!processedIds.has(recipient.id)) {
                            addStatusMessage(`<i class="fas fa-check status-icon"></i> <span data-id="${recipient.id}">Sent to ${recipient.name || recipient.id}</span>`, 'success');
                            processedIds.add(recipient.id);
                        }
                    });
                    
                    // Add messages for new failed sends
                    statusData.failed.forEach(recipient => {
                        if (!processedIds.has(recipient.id)) {
                            addStatusMessage(`<i class="fas fa-times status-icon"></i> <span data-id="${recipient.id}">Failed to send to ${recipient.name || recipient.id}</span>: ${recipient.error || 'Unknown error'}`, 'error');
                            processedIds.add(recipient.id);
                        }
                    });
                }
                
                // If process is complete, stop polling and show completion message
                if (statusData.completed) {
                    clearInterval(pollTimer);
                    addStatusMessage(`<i class="fas fa-info-circle status-icon"></i> Completed sending to all recipients: ${statusData.successCount} successful, ${statusData.failureCount} failed`, 'info');
                    sendBtn.disabled = false;
                    listTypeSelect.disabled = false;
                    
                    // Scroll to the bottom to show the completion message
                    const statusSection = document.querySelector('.status-section');
                    statusSection.scrollTop = statusSection.scrollHeight;
                }
            } catch (error) {
                console.error('Error fetching status:', error);
                addStatusMessage(`<i class="fas fa-exclamation-circle status-icon"></i> Error fetching status: ${error.message}`, 'error');
            }
        }
        
        // Initial status fetch
        fetchStatus();
        
        // Start the polling interval
        pollTimer = setInterval(fetchStatus, pollInterval);
    }
    
    // Simulate progress updates (in a real app, this would poll the server for status)
    function startSimulatedProgress(groups, processId) {
        let sent = 0;
        const total = groups.length;
        
        // Simulate sending with delays to show progress
        groups.forEach((group, index) => {
            setTimeout(() => {
                // Simulate success/failure (90% success rate)
                const success = Math.random() > 0.1;
                
                sent++;
                updateProgress(sent, total);
                
                if (success) {
                    addStatusMessage(`<i class="fas fa-check status-icon"></i> Sent to ${group.name || group.id}`, 'success');
                } else {
                    addStatusMessage(`<i class="fas fa-times status-icon"></i> Failed to send to ${group.name || group.id}`, 'error');
                }
                
                // When all done
                if (sent === total) {
                    addStatusMessage(`<i class="fas fa-info-circle status-icon"></i> Completed sending to all recipients`, 'info');
                    sendBtn.disabled = false;
                    listTypeSelect.disabled = false;
                    
                    // Scroll to the bottom to show the completion message
                    const statusSection = document.querySelector('.status-section');
                    statusSection.scrollTop = statusSection.scrollHeight;
                }
            }, 500 * (index + 1)); // Stagger the sends for demo
        });
    }
    
    // Update progress bar
    function updateProgress(sent, total) {
        const percentage = (sent / total) * 100;
        progressBar.style.width = `${percentage}%`;
        sentCountEl.textContent = sent;
    }
    
    // ---------------------------------------------------------
    // Excel Import Functions
    // ---------------------------------------------------------
    
    // Toggle new list name input based on selection
    if (excelListTypeSelect) {
        excelListTypeSelect.addEventListener('change', function() {
            if (this.value === 'new') {
                newListNameContainer.classList.remove('d-none');
                newListNameInput.required = true;
            } else {
                newListNameContainer.classList.add('d-none');
                newListNameInput.required = false;
            }
        });
    }
    
    // Enable import button when Excel file is selected
    if (excelFileInput) {
        excelFileInput.addEventListener('change', function() {
            importExcelBtn.disabled = !this.files.length;
        });
    }
    
    // Handle Excel import
    if (importExcelBtn) {
        importExcelBtn.addEventListener('click', async function() {
            if (!excelFileInput.files.length) {
                addStatusMessage('Please select an Excel file to import', 'error');
                return;
            }
            
            let listName;
            const createNewList = excelListTypeSelect.value === 'new';
            
            if (createNewList) {
                if (!newListNameInput.value.trim()) {
                    addStatusMessage('Please enter a name for the new list', 'error');
                    return;
                }
                listName = newListNameInput.value.trim();
            } else {
                if (!excelListTypeSelect.value) {
                    addStatusMessage('Please select a target list', 'error');
                    return;
                }
                listName = excelListTypeSelect.value;
            }
            
            const formData = new FormData();
            formData.append('excelFile', excelFileInput.files[0]);
            formData.append('listName', listName);
            formData.append('createNewList', createNewList);
            formData.append('sheetName', sheetNameInput.value || 'Data sheet');
            
            try {
                importExcelBtn.disabled = true;
                importExcelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
                
                const response = await fetch('/import-excel', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    addStatusMessage(`<i class="fas fa-check-circle"></i> ${result.message}`, 'success');
                    
                    // Clear the form
                    excelFileInput.value = '';
                    if (createNewList) {
                        newListNameInput.value = '';
                    }
                    
                    // Update the view list dropdown
                    await loadContactLists();
                    
                    // Select the imported list in the view dropdown
                    viewListTypeSelect.value = listName;
                    viewListTypeSelect.dispatchEvent(new Event('change'));
                } else {
                    addStatusMessage(`<i class="fas fa-exclamation-triangle"></i> ${result.message}`, 'error');
                }
            } catch (error) {
                console.error('Error importing Excel:', error);
                addStatusMessage(`<i class="fas fa-exclamation-circle"></i> Error importing Excel: ${error.message}`, 'error');
            } finally {
                importExcelBtn.disabled = false;
                importExcelBtn.innerHTML = '<i class="fas fa-file-import"></i> Import Data';
            }
        });
    }
    
    // Handle download template button
    if (downloadTemplateBtn) {
        downloadTemplateBtn.addEventListener('click', function() {
            downloadExcelTemplate();
        });
    }
    
    // Function to download an Excel template
    function downloadExcelTemplate() {
        try {
            // Create sample data with the exact columns from the user's format
            const templateData = [
                {
                    'PARTY CODE': 'AA-123',
                    'PARTY GROUP NAME': 'Sample Group Name',
                    'GROUP ID/ PHONE NUMBER': '1234567890',
                    'TYPE': 'GROUP',
                    'TIER': 'AAGNA'
                },
                {
                    'PARTY CODE': 'AA-124',
                    'PARTY GROUP NAME': 'Sample Personal Contact',
                    'GROUP ID/ PHONE NUMBER': '9876543210',
                    'TYPE': 'PERSONAL',
                    'TIER': 'TRIONE'
                },
                {
                    'PARTY CODE': 'AA-125',
                    'PARTY GROUP NAME': 'OEM Example',
                    'GROUP ID/ PHONE NUMBER': '5555555555',
                    'TYPE': 'GROUP',
                    'TIER': 'OEM'
                },
                {
                    'PARTY CODE': 'AA-126',
                    'PARTY GROUP NAME': 'Management Contact',
                    'GROUP ID/ PHONE NUMBER': '6666666666',
                    'TYPE': 'PERSONAL',
                    'TIER': 'MANAGEMENT'
                }
            ];
            
            // Create a worksheet with the template data
            const worksheet = xlsx.utils.json_to_sheet(templateData);
            
            // Set column widths for better readability
            const colWidths = [
                { wch: 12 }, // PARTY CODE
                { wch: 30 }, // PARTY GROUP NAME
                { wch: 20 }, // GROUP ID/ PHONE NUMBER
                { wch: 10 }, // TYPE
                { wch: 15 }  // TIER
            ];
            
            worksheet['!cols'] = colWidths;
            
            // Add notes about the format in cell A6
            xlsx.utils.sheet_add_aoa(worksheet, [
                ['NOTES:'],
                ['- GROUP ID/ PHONE NUMBER: For group contacts, use the group ID; for personal contacts, use the phone number'],
                ['- TYPE: Must be either "GROUP" or "PERSONAL"'],
                ['- TIER: Should be one of: "AAGNA", "TRIONE", "OEM", or "MANAGEMENT"']
            ], { origin: 'A6' });
            
            // Create a new workbook and append the worksheet
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Data sheet');
            
            // Generate Excel file
            const excelData = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
            
            // Create a Blob and download the file
            const blob = new Blob([excelData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'whatsapp-contacts-template.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            addStatusMessage('Excel template downloaded', 'success');
        } catch (error) {
            console.error('Error creating template:', error);
            addStatusMessage(`Error creating template: ${error.message}`, 'error');
        }
    }
    
    // ---------------------------------------------------------
    // Contact Management Functions
    // ---------------------------------------------------------
    
    // Load all contact lists for the dropdowns
    async function loadContactLists() {
        try {
            // Check if last update was less than 5 seconds ago, if so skip this update
            const now = Date.now();
            const lastListsCheck = window.lastListsCheck || 0;
            
            if (now - lastListsCheck < 5000) {
                console.log('Skipping contact lists check - too frequent');
                return;
            }
            
            window.lastListsCheck = now;
            
            const response = await fetch('/contact-lists');
            
            if (response.status === 429) {
                console.log('Rate limit hit, will retry contact lists check later');
                // Schedule a retry after 10 seconds
                setTimeout(loadContactLists, 10000);
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Update both list dropdowns
                updateListDropdowns(data.lists);
            } else {
                console.error('Error loading contact lists:', data.message);
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Error loading contact lists:', error);
            // Don't show UI error for rate limit errors
            if (!error.message.includes('429') && !error.message.includes('Rate limit')) {
                addStatusMessage(`Error loading contact lists: ${error.message}`, 'error');
            }
        }
    }
    
    // Update the dropdowns with list names
    function updateListDropdowns(lists) {
        // Options to keep at the top
        const defaultSendOptions = `
            <option value="" disabled selected>Choose a recipient list...</option>
        `;
        
        const defaultExcelOptions = `
            <option value="" disabled selected>Select a list to import to...</option>
            <option value="new">Create New List</option>
        `;
        
        const defaultViewOptions = `
            <option value="" disabled selected>Select a list to view...</option>
        `;
        
        // Create the list options
        let listOptions = '';
        for (const [name, count] of Object.entries(lists)) {
            listOptions += `<option value="${name}">${name} (${count})</option>`;
        }
        
        // Update the dropdowns
        if (listTypeSelect) {
            listTypeSelect.innerHTML = defaultSendOptions + listOptions;
        }
        
        if (excelListTypeSelect) {
            excelListTypeSelect.innerHTML = defaultExcelOptions + listOptions;
        }
        
        if (viewListTypeSelect) {
            viewListTypeSelect.innerHTML = defaultViewOptions + listOptions;
        }
    }
    
    // Handle contact list selection for viewing
    if (viewListTypeSelect) {
        viewListTypeSelect.addEventListener('change', async function() {
            const listName = this.value;
            
            // Toggle action buttons
            deleteListBtn.disabled = !listName;
            exportListBtn.disabled = !listName;
            fetchGroupDetailsBtn.disabled = !listName;
            
            if (!listName) {
                showEmptyContactList('Select a list to view contacts');
                return;
            }
            
            try {
                // Show loading state
                contactsTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center">
                            <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            Loading contacts...
                        </td>
                    </tr>
                `;
                
                const response = await fetch(`/contact-lists/${listName}`);
                const data = await response.json();
                
                if (data.success) {
                    if (data.contacts && data.contacts.length > 0) {
                        // Store the contacts and render the first page
                        currentPageContacts = data.contacts;
                        currentPage = 1;
                        renderContactsPage();
                    } else {
                        showEmptyContactList('No contacts found in this list');
                    }
                } else {
                    showEmptyContactList(`Error: ${data.message}`);
                }
            } catch (error) {
                console.error('Error loading contact list:', error);
                showEmptyContactList(`Error loading contacts: ${error.message}`);
            }
        });
    }
    
    // Function to render contacts page
    function renderContactsPage() {
        if (!currentPageContacts.length) {
            showEmptyContactList('No contacts found');
            return;
        }
        
        // Calculate pagination
        const totalPages = Math.ceil(currentPageContacts.length / pageSize);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, currentPageContacts.length);
        const pageContacts = currentPageContacts.slice(startIndex, endIndex);
        
        // Clear the table
        contactsTableBody.innerHTML = '';
        
        // Add contacts to the table
        pageContacts.forEach(contact => {
            const row = document.createElement('tr');
            
            // Determine badge colors based on tier
            let tierBadgeClass = 'bg-secondary';
            switch (contact.tier?.toUpperCase()) {
                case 'AAGNA':
                    tierBadgeClass = 'bg-success';
                    break;
                case 'TRIONE':
                    tierBadgeClass = 'bg-primary';
                    break;
                case 'OEM':
                    tierBadgeClass = 'bg-info';
                    break;
                case 'MANAGEMENT':
                    tierBadgeClass = 'bg-warning';
                    break;
            }
            
            // Format ID for display
            const displayId = String(contact.id || '')
                .replace('@g.us', '')
                .replace('@s.whatsapp.net', '');
            
            row.innerHTML = `
                <td>${contact.code || '-'}</td>
                <td>${contact.name}</td>
                <td><code>${displayId}</code></td>
                <td><span class="badge bg-${contact.type === 'GROUP' ? 'primary' : 'secondary'}">${contact.type}</span></td>
                <td><span class="badge ${tierBadgeClass}">${contact.tier || '-'}</span></td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-primary btn-action view-details-btn" data-id="${contact.id}" data-name="${contact.name}" data-type="${contact.type}">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </td>
            `;
            
            contactsTableBody.appendChild(row);
        });
        
        // Add event listeners to the view details buttons
        document.querySelectorAll('.view-details-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const name = this.dataset.name;
                const type = this.dataset.type;
                
                if (type === 'GROUP') {
                    showGroupDetails(id, name);
                } else {
                    showContactDetails(id, name);
                }
            });
        });
        
        // Update pagination info
        document.getElementById('paginationStart').textContent = startIndex + 1;
        document.getElementById('paginationEnd').textContent = endIndex;
        document.getElementById('paginationTotal').textContent = currentPageContacts.length;
        
        // Update pagination controls
        updatePaginationControls(totalPages);
    }
    
    // Function to update pagination controls
    function updatePaginationControls(totalPages) {
        const controls = document.getElementById('paginationControls');
        controls.innerHTML = '';
        
        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<button class="page-link" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
        if (currentPage > 1) {
            prevLi.querySelector('button').addEventListener('click', () => {
                currentPage--;
                renderContactsPage();
            });
        }
        controls.appendChild(prevLi);
        
        // Page buttons
        const maxPages = 5;
        const startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
        const endPage = Math.min(totalPages, startPage + maxPages - 1);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
            pageLi.innerHTML = `<button class="page-link">${i}</button>`;
            
            if (i !== currentPage) {
                pageLi.querySelector('button').addEventListener('click', () => {
                    currentPage = i;
                    renderContactsPage();
                });
            }
            
            controls.appendChild(pageLi);
        }
        
        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<button class="page-link" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
        if (currentPage < totalPages) {
            nextLi.querySelector('button').addEventListener('click', () => {
                currentPage++;
                renderContactsPage();
            });
        }
        controls.appendChild(nextLi);
    }
    
    // Function to show empty contact list
    function showEmptyContactList(message) {
        contactsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">${message}</td>
            </tr>
        `;
        
        // Reset pagination
        document.getElementById('paginationStart').textContent = '0';
        document.getElementById('paginationEnd').textContent = '0';
        document.getElementById('paginationTotal').textContent = '0';
        document.getElementById('paginationControls').innerHTML = '';
    }
    
    // Function to show group details
    async function showGroupDetails(groupId, groupName) {
        // Ensure groupId is a string
        groupId = String(groupId || '');
        
        groupDetailsContent.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Fetching group details for "${groupName}"...</p>
            </div>
        `;
        
        document.getElementById('groupDetailsModalLabel').textContent = `Group: ${groupName}`;
        groupDetailsModal.show();
        
        try {
            const response = await fetch(`/group-details/${groupId}`);
            const data = await response.json();
            
            if (data.success) {
                const group = data.group;
                currentGroupDetails = group;
                
                // Generate a fallback profile image if not available
                const avatarUrl = group.profilePictureUrl || 
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(group.subject)}&background=128C7E&color=fff&size=120`;
                
                // Format creation date
                const creationDate = group.creation ? new Date(group.creation * 1000).toLocaleString() : 'Unknown';
                
                groupDetailsContent.innerHTML = `
                    <div class="group-details-container">
                        <div class="group-avatar-container">
                            <img src="${avatarUrl}" alt="${group.subject}" class="group-avatar" 
                                onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(group.subject)}&background=128C7E&color=fff&size=120';">
                            <span class="group-type-badge">GROUP</span>
                        </div>
                        
                        <div class="group-info">
                            <h3 class="group-name">${group.subject}</h3>
                            <div class="group-id">${group.id}</div>
                            
                            <div class="group-meta mb-3">
                                <div><strong>Created:</strong> ${creationDate}</div>
                                <div><strong>Participants:</strong> ${group.participants.length}</div>
                                ${group.description ? `<div class="mt-2"><strong>Description:</strong> ${group.description}</div>` : ''}
                            </div>
                        </div>
                        
                        <div class="group-details-tabs">
                            <ul class="nav nav-tabs" role="tablist">
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link active" id="participants-tab" data-bs-toggle="tab" data-bs-target="#participants-tab-pane" type="button" role="tab">
                                        Participants (${group.participants.length})
                                    </button>
                                </li>
                            </ul>
                            
                            <div class="tab-content group-details-tab-content">
                                <div class="tab-pane fade show active" id="participants-tab-pane" role="tabpanel" tabindex="0">
                                    <div class="participants-list">
                                        ${renderParticipantsList(group.participants)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                groupDetailsContent.innerHTML = `
                    <div class="alert alert-danger" role="alert">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        ${data.message}
                    </div>
                    <p class="text-center">Make sure you are a member of this group and the group ID is correct.</p>
                `;
            }
        } catch (error) {
            console.error('Error fetching group details:', error);
            groupDetailsContent.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Error fetching group details: ${error.message}
                </div>
            `;
        }
    }
    
    // Function to render participants list
    function renderParticipantsList(participants) {
        if (!participants || participants.length === 0) {
            return '<p class="text-center">No participants found</p>';
        }
        
        // Sort participants by admin status (admins first)
        participants.sort((a, b) => {
            if (a.isAdmin && !b.isAdmin) return -1;
            if (!a.isAdmin && b.isAdmin) return 1;
            return 0;
        });
        
        let html = '';
        
        participants.forEach(participant => {
            const name = participant.id.split('@')[0];
            const avatarUrl = `https://ui-avatars.com/api/?name=${name}&background=075E54&color=fff&size=64`;
            
            html += `
                <div class="member-item">
                    <img src="${avatarUrl}" alt="${name}" class="member-avatar">
                    <div class="member-info">
                        <div class="member-name">${name}</div>
                        <div class="member-phone">${participant.id}</div>
                    </div>
                    ${participant.isAdmin ? '<span class="member-role">Admin</span>' : ''}
                </div>
            `;
        });
        
        return html;
    }
    
    // Function to show contact details
    function showContactDetails(contactId, contactName) {
        // Ensure contactId is a string
        contactId = String(contactId || '');
        
        // Set up the modal
        const detailsModal = document.getElementById('groupDetailsModal');
        const modalTitle = document.getElementById('groupDetailsModalLabel');
        const modalContent = document.getElementById('groupDetailsContent');
        
        // Update modal title and show loading state
        modalTitle.textContent = `Contact Details: ${contactName}`;
        modalContent.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Fetching contact details...</p>
            </div>
        `;
        
        // Show the modal
        const modal = bootstrap.Modal.getInstance(detailsModal) || new bootstrap.Modal(detailsModal);
        modal.show();
        
        // Check if the contact ID is valid
        if (!contactId || !contactId.includes('@')) {
            modalContent.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Invalid contact ID format. The ID should include @s.whatsapp.net
                </div>
                <p>Contact ID: <code>${contactId}</code></p>
                <p>Please make sure the contact has a valid WhatsApp ID.</p>
            `;
            return;
        }
        
        // Fetch contact details from the API
        fetch(`/contact-details/${encodeURIComponent(contactId)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.contact) {
                    const contact = data.contact;
                    
                    // Prepare the profile picture with fallback
                    const profilePicHtml = contact.profilePictureUrl
                        ? `<img src="${contact.profilePictureUrl}" class="img-fluid rounded contact-profile-pic" alt="${contactName}" 
                            onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(contactName)}&background=075E54&color=fff&size=120';">`
                        : `<div class="contact-profile-placeholder">
                              <i class="fas fa-user fa-4x"></i>
                           </div>`;
                    
                    // Format the phone number for display
                    const phoneNumber = contactId.split('@')[0];
                    
                    // Build the contact details HTML
                    modalContent.innerHTML = `
                        <div class="contact-details-container">
                            <div class="contact-header d-flex align-items-center mb-4">
                                <div class="contact-pic-container me-3">
                                    ${profilePicHtml}
                                </div>
                                <div class="contact-header-info flex-grow-1">
                                    <h3 class="mb-1">${contactName}</h3>
                                    <p class="text-muted mb-0">
                                        <i class="fas fa-phone me-1"></i> 
                                        ${phoneNumber}
                                    </p>
                                    ${contact.status ? `<p class="text-muted mb-0"><small>Status: ${contact.status}</small></p>` : ''}
                                </div>
                            </div>
                            
                            <div class="contact-actions mb-4">
                                <a href="https://wa.me/${phoneNumber}" class="btn btn-success btn-sm" target="_blank">
                                    <i class="fab fa-whatsapp me-1"></i> Open in WhatsApp
                                </a>
                            </div>
                            
                            <div class="contact-section">
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <strong>Phone:</strong> 
                                            <a href="tel:${phoneNumber}">${phoneNumber}</a>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <strong>WhatsApp ID:</strong> 
                                            <code>${contactId}</code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    modalContent.innerHTML = `
                        <div class="alert alert-warning">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            ${data.message || "Could not fetch contact details"}
                        </div>
                        <p>Contact ID: <code>${contactId}</code></p>
                        <p>The contact may not be available or you may not have access to view their details.</p>
                    `;
                }
            })
            .catch(error => {
                console.error('Error fetching contact details:', error);
                modalContent.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Error fetching contact details
                    </div>
                    <p>Error details: ${error.message}</p>
                    <p>Please try again later or check the server logs for more information.</p>
                `;
            });
    }
    
    // Handle fetch group details button
    if (fetchGroupDetailsBtn) {
        fetchGroupDetailsBtn.addEventListener('click', function() {
            const listName = viewListTypeSelect.value;
            
            if (!listName) {
                addStatusMessage('Please select a list first', 'error');
                return;
            }
            
            // Check if we have any groups selected
            if (currentPageContacts.length === 0) {
                addStatusMessage('No contacts found in this list', 'error');
                return;
            }
            
            // Count the number of groups
            const groupCount = currentPageContacts.filter(contact => contact.type === 'GROUP').length;
            
            if (groupCount === 0) {
                addStatusMessage('No WhatsApp groups found in this list', 'error');
                return;
            }
            
            // Confirmation for batch fetching group details
            confirmationModalBody.innerHTML = `
                <p>This will fetch details for all ${groupCount} WhatsApp groups in this list.</p>
                <p>You need to be a member of each group to fetch its details.</p>
                <p>Do you want to continue?</p>
            `;
            
            currentAction = 'fetchGroupDetails';
            confirmationModal.show();
        });
    }
    
    // Handle delete list button
    if (deleteListBtn) {
        deleteListBtn.addEventListener('click', function() {
            const listName = viewListTypeSelect.value;
            
            if (!listName) {
                addStatusMessage('Please select a list first', 'error');
                return;
            }
            
            // Confirmation for deleting a list
            confirmationModalBody.innerHTML = `
                <p>Are you sure you want to delete the list <strong>"${listName}"</strong>?</p>
                <p class="text-danger">This action cannot be undone.</p>
            `;
            
            currentAction = 'deleteList';
            confirmationModal.show();
        });
    }
    
    // Handle export list button
    if (exportListBtn) {
        exportListBtn.addEventListener('click', function() {
            const listName = viewListTypeSelect.value;
            
            if (!listName) {
                addStatusMessage('Please select a list first', 'error');
                return;
            }
            
            // Export the list to Excel
            exportListToExcel(listName);
        });
    }
    
    // Function to export a list to Excel
    async function exportListToExcel(listName) {
        try {
            const response = await fetch(`/contact-lists/${listName}`);
            const data = await response.json();
            
            if (!data.success || !data.contacts || data.contacts.length === 0) {
                addStatusMessage(`No contacts found in list "${listName}"`, 'error');
                return;
            }
            
            // Format the data for Excel
            const exportData = data.contacts.map(contact => {
                // Format IDs properly for Excel - ensure it's a string
                const exportId = String(contact.id || '')
                    .replace('@g.us', '')
                    .replace('@s.whatsapp.net', '');
                
                return {
                    'PARTY CODE': contact.code || '',
                    'PARTY GROUP NAME': contact.name,
                    'GROUP ID/ PHONE NUMBER': exportId,
                    'TYPE': contact.type,
                    'TIER': contact.tier || ''
                };
            });
            
            // Create a workbook
            const worksheet = xlsx.utils.json_to_sheet(exportData);
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Contacts');
            
            // Set column widths for better readability
            const colWidths = [
                { wch: 12 }, // PARTY CODE
                { wch: 30 }, // PARTY GROUP NAME
                { wch: 20 }, // GROUP ID/ PHONE NUMBER
                { wch: 10 }, // TYPE
                { wch: 15 }  // TIER
            ];
            
            worksheet['!cols'] = colWidths;
            
            // Generate Excel file
            const excelData = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
            
            // Create a Blob and download the file
            const blob = new Blob([excelData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${listName}-contacts.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            addStatusMessage(`Exported list "${listName}" to Excel`, 'success');
        } catch (error) {
            console.error('Error exporting list:', error);
            addStatusMessage(`Error exporting list: ${error.message}`, 'error');
        }
    }
    
    // Handle confirmation modal actions
    if (confirmActionBtn) {
        confirmActionBtn.addEventListener('click', async function() {
            const listName = viewListTypeSelect.value;
            
            // Hide the modal
            confirmationModal.hide();
            
            if (currentAction === 'deleteList') {
                // Delete the list
                await deleteContactList(listName);
            } else if (currentAction === 'fetchGroupDetails') {
                // Fetch group details
                // This would be a complex operation that's beyond the scope
                addStatusMessage('Group details fetching not implemented in this version', 'info');
            }
        });
    }
    
    // Function to delete a contact list
    async function deleteContactList(listName) {
        try {
            const response = await fetch(`/contact-lists/${listName}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                addStatusMessage(`List "${listName}" deleted successfully`, 'success');
                
                // Update the dropdowns
                await loadContactLists();
                
                // Clear the table
                viewListTypeSelect.value = '';
                showEmptyContactList('Select a list to view contacts');
                
                // Disable action buttons
                deleteListBtn.disabled = true;
                exportListBtn.disabled = true;
                fetchGroupDetailsBtn.disabled = true;
            } else {
                addStatusMessage(`Error deleting list: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting list:', error);
            addStatusMessage(`Error deleting list: ${error.message}`, 'error');
        }
    }
    
    // Check connection status on page load and setup polling
    updateConnectionStatus();
    
    // Set up polling for connection status every 10 seconds instead of every 5
    setInterval(updateConnectionStatus, 10000);
    
    // Add event listeners for connect/disconnect buttons
    if (connectBtn) {
        connectBtn.addEventListener('click', connectWhatsApp);
    }
    
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectWhatsApp);
    }
    
    // Load contact lists on page load
    loadContactLists();

    // Reset connection button
    const resetConnectionBtn = document.getElementById('resetConnectionBtn');
    if (resetConnectionBtn) {
        resetConnectionBtn.addEventListener('click', resetWhatsAppConnection);
    }
});

// Add these CSS styles in the head
(function() {
    const style = document.createElement('style');
    style.textContent = `
        .connection-status-container {
            margin-bottom: 15px;
        }
        .connection-dot {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 6px;
        }
        .connection-dot.connected {
            background-color: #28a745;
        }
        .connection-dot.disconnected {
            background-color: #dc3545;
        }
        .connection-dot.connecting {
            background-color: #ffc107;
            animation: pulse 1s infinite;
        }
        @keyframes pulse {
            0% { opacity: 0.5; }
            50% { opacity: 1; }
            100% { opacity: 0.5; }
        }
        .connection-text {
            font-size: 14px;
            font-weight: 500;
        }
        .connection-actions {
            display: flex;
            gap: 8px;
        }
    `;
    document.head.appendChild(style);
})();

// Function to update connection status indicator
function updateConnectionStatus() {
    // Check if last update was less than 3 seconds ago, if so skip this update
    const now = Date.now();
    const lastUpdate = window.lastConnectionCheck || 0;
    
    if (now - lastUpdate < 3000) {
        console.log('Skipping connection check - too frequent');
        return;
    }
    
    window.lastConnectionCheck = now;
    
    fetch('/connection-status')
        .then(response => {
            if (response.status === 429) {
                console.log('Rate limit hit, will retry connection check later');
                return null;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return; // Skip if rate limited
            
            // Get the connection status elements
            const statusDot = document.querySelector('.connection-dot');
            const statusText = document.querySelector('.connection-text');
            const connectBtn = document.querySelector('.connect-btn');
            const disconnectBtn = document.querySelector('.disconnect-btn');
            
            // Check if QR container exists, create if not
            let qrContainer = document.getElementById('qr-code-container');
            if (!qrContainer) {
                qrContainer = document.createElement('div');
                qrContainer.id = 'qr-code-container';
                qrContainer.className = 'qr-code-container';
                
                // Find appropriate container to add it to
                const connectionSection = document.getElementById('connection-status-section');
                if (connectionSection) {
                    connectionSection.querySelector('.card-body').appendChild(qrContainer);
                } else {
                    // Fallback to first card-body if connection section not found
                    document.querySelector('.card-body').appendChild(qrContainer);
                }
            }
            
            if (data.connected) {
                if (statusDot) statusDot.className = 'connection-dot connected';
                if (statusText) statusText.textContent = 'WhatsApp: Connected';
                if (connectBtn) connectBtn.disabled = true;
                if (disconnectBtn) disconnectBtn.disabled = false;
                
                // Hide QR code if shown
                qrContainer.style.display = 'none';
            } else {
                if (statusDot) statusDot.className = 'connection-dot disconnected';
                if (statusText) statusText.textContent = 'WhatsApp: Disconnected';
                if (connectBtn) connectBtn.disabled = false;
                if (disconnectBtn) disconnectBtn.disabled = true;
                
                // Check if we need to show QR code
                checkAndShowQRCode();
            }
        })
        .catch(error => {
            console.error('Error checking connection status:', error);
        });
}

// Function to check for and display QR code
function checkAndShowQRCode() {
    // Check if last update was less than 3 seconds ago, if so skip this update
    const now = Date.now();
    const lastQrCheck = window.lastQrCheck || 0;
    
    if (now - lastQrCheck < 3000) {
        console.log('Skipping QR code check - too frequent');
        return;
    }
    
    window.lastQrCheck = now;
    
    fetch('/get-qr-code')
        .then(response => {
            if (response.status === 429) {
                console.log('Rate limit hit, will retry QR check later');
                // Try again after delay with increased backoff
                setTimeout(checkAndShowQRCode, 5000);
                return null;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return; // Skip if rate limited
            
            // Get the QR container or create if it doesn't exist
            let qrContainer = document.getElementById('qr-code-container');
            if (!qrContainer) {
                console.log("QR container not found, cannot display QR code");
                return;
            }
            
            if (data.success && data.qrCode) {
                // Show QR code
                console.log("Received QR code, displaying it");
                qrContainer.innerHTML = `
                    <div class="qr-header mb-3">Scan this QR code with WhatsApp to connect</div>
                    <div id="qr-code" class="d-inline-block"></div>
                `;
                
                // Generate QR code image
                try {
                    new QRCode(document.getElementById("qr-code"), {
                        text: data.qrCode,
                        width: 256,
                        height: 256,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                    
                    qrContainer.style.display = 'block';
                } catch (err) {
                    console.error("Error generating QR code:", err);
                    qrContainer.innerHTML = `
                        <div class="alert alert-danger">
                            Error generating QR code: ${err.message}
                        </div>
                    `;
                }
            } else {
                // No QR code available yet, show loading message
                if (!qrContainer.querySelector('.qr-loading')) {
                    qrContainer.innerHTML = `
                        <div class="qr-loading">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <div class="mt-2">Waiting for QR code...</div>
                            <div class="mt-1 small text-muted">Please wait a moment while we connect to WhatsApp</div>
                        </div>
                    `;
                    qrContainer.style.display = 'block';
                }
                
                // If we got an error or no QR yet, poll again with a longer delay
                if (!data.success) {
                    // Try again in 5 seconds instead of 2
                    setTimeout(checkAndShowQRCode, 5000);
                }
            }
        })
        .catch(error => {
            console.error('Error getting QR code:', error);
            // Try again in 10 seconds on error (increased from 5)
            setTimeout(checkAndShowQRCode, 10000);
        });
}

// Updated connect function to ensure we get QR when needed
function connectWhatsApp() {
    // Show loading indicator
    const connectBtn = document.querySelector('.connect-btn');
    const statusDot = document.querySelector('.connection-dot');
    const statusText = document.querySelector('.connection-text');
    
    if (!connectBtn) return;
    
    // Update UI to show connecting state
    if (statusDot) statusDot.className = 'connection-dot connecting';
    if (statusText) statusText.textContent = 'WhatsApp: Connecting...';
    
    const originalText = connectBtn.textContent;
    connectBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Connecting...';
    connectBtn.disabled = true;
    
    // Start checking for QR code immediately
    checkAndShowQRCode();
    
    // Call API to connect
    fetch('/connect-whatsapp', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Connection initiated, show alert
                addStatusMessage('Connection initiated. Please scan the QR code if prompted.', 'info');
                
                // Make sure we have the current connection status
                updateConnectionStatus();
            } else {
                // Show error
                addStatusMessage('Failed to initiate connection: ' + data.message, 'error');
                connectBtn.textContent = originalText;
                connectBtn.disabled = false;
                
                // Revert status to disconnected
                if (statusDot) statusDot.className = 'connection-dot disconnected';
                if (statusText) statusText.textContent = 'WhatsApp: Disconnected';
            }
        })
        .catch(error => {
            console.error('Error connecting to WhatsApp:', error);
            addStatusMessage('Error connecting to WhatsApp: ' + error.message, 'error');
            connectBtn.textContent = originalText;
            connectBtn.disabled = false;
            
            // Revert status to disconnected
            if (statusDot) statusDot.className = 'connection-dot disconnected';
            if (statusText) statusText.textContent = 'WhatsApp: Disconnected';
        });
}

// Function to handle disconnection button click
function disconnectWhatsApp() {
    // Show loading indicator
    const disconnectBtn = document.querySelector('.disconnect-btn');
    if (!disconnectBtn) return;
    
    const originalText = disconnectBtn.textContent;
    disconnectBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Disconnecting...';
    disconnectBtn.disabled = true;
    
    // Call API to disconnect
    fetch('/disconnect-whatsapp', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Connection terminated
                addStatusMessage('WhatsApp connection paused successfully.', 'success');
                // Update status
                updateConnectionStatus();
            } else {
                // Show error
                addStatusMessage('Failed to pause connection: ' + data.message, 'error');
            }
            disconnectBtn.textContent = originalText;
            disconnectBtn.disabled = false;
        })
        .catch(error => {
            console.error('Error pausing WhatsApp connection:', error);
            addStatusMessage('Error pausing WhatsApp connection: ' + error.message, 'error');
            disconnectBtn.textContent = originalText;
            disconnectBtn.disabled = false;
        });
}

// Function to reset the WhatsApp connection
function resetWhatsAppConnection() {
    const resetBtn = document.getElementById('resetConnectionBtn');
    if (!resetBtn) return;
    
    const originalText = resetBtn.textContent;
    resetBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Resetting...';
    resetBtn.disabled = true;
    
    fetch('/reset-connection', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addStatusMessage('WhatsApp connection reset successfully. Please connect again.', 'info');
                
                // Update connection status
                updateConnectionStatus();
            } else {
                addStatusMessage('Failed to reset connection: ' + data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error resetting connection:', error);
            addStatusMessage('Error resetting connection: ' + error.message, 'error');
        })
        .finally(() => {
            resetBtn.textContent = originalText;
            resetBtn.disabled = false;
        });
} 