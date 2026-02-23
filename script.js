// State management
let links = JSON.parse(localStorage.getItem('quickLinks')) || [];
let deleteIndex = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderLinks();
    document.getElementById('linkInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('titleInput').focus();
        }
    });
    document.getElementById('titleInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addLink();
    });
});

// Validation and formatting
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function formatURL(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return 'https://' + url;
    }
    return url;
}

function getDomainFromURL(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch (_) {
        return url;
    }
}

// Core functions
function addLink() {
    const input = document.getElementById('linkInput');
    const titleInput = document.getElementById('titleInput');
    const errorMsg = document.getElementById('errorMsg');
    let url = input.value.trim();
    let title = titleInput.value.trim();

    if (!url) {
        showError('Please enter a URL');
        return;
    }

    // Check for duplicates
    if (links.some(link => link.url === url || link.url === formatURL(url))) {
        showError('This link already exists!');
        return;
    }

    // Format and validate
    const formattedURL = formatURL(url);
    
    if (!isValidURL(formattedURL)) {
        showError('Please enter a valid URL (e.g., https://example.com)');
        return;
    }

    // If no title provided, use domain as default
    if (!title) {
        title = getDomainFromURL(formattedURL);
    }

    // Add to array
    const newLink = {
        id: Date.now(),
        url: formattedURL,
        title: title,
        createdAt: new Date().toISOString()
    };

    links.unshift(newLink); // Add to top
    saveLinks();
    renderLinks();
    
    // Reset inputs
    input.value = '';
    titleInput.value = '';
    input.focus();
    hideError();
    
    // Animation feedback on button
    const btn = document.getElementById('addBtn');
    btn.classList.add('copied-animation');
    setTimeout(() => btn.classList.remove('copied-animation'), 200);
}

function editTitle(id, newTitle) {
    const link = links.find(l => l.id === id);
    if (link) {
        link.title = newTitle.trim() || getDomainFromURL(link.url);
        saveLinks();
        renderLinks();
    }
}

function startEditingTitle(id, currentTitle) {
    const titleElement = document.getElementById(`title-${id}`);
    const container = document.getElementById(`title-container-${id}`);
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'flex-1 bg-slate-700 border border-indigo-500 rounded px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500';
    input.id = `edit-input-${id}`;
    
    // Replace title with input
    container.innerHTML = '';
    container.appendChild(input);
    input.focus();
    input.select();
    
    // Save on blur or enter
    const saveEdit = () => {
        editTitle(id, input.value);
    };
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        }
        if (e.key === 'Escape') {
            renderLinks(); // Cancel edit
        }
    });
}

function deleteLink(index) {
    deleteIndex = index;
    const modal = document.getElementById('deleteModal');
    const modalContent = document.getElementById('deleteModalContent');
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Trigger animation
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
    }, 10);
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    const modalContent = document.getElementById('deleteModalContent');
    
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        deleteIndex = null;
    }, 200);
}

function confirmDelete() {
    if (deleteIndex !== null) {
        links.splice(deleteIndex, 1);
        saveLinks();
        renderLinks();
        closeDeleteModal();
    }
}

function moveLink(index, direction) {
    if (direction === -1 && index > 0) {
        // Move up
        [links[index], links[index - 1]] = [links[index - 1], links[index]];
    } else if (direction === 1 && index < links.length - 1) {
        // Move down
        [links[index], links[index + 1]] = [links[index + 1], links[index]];
    }
    saveLinks();
    renderLinks();
}

function clearAll() {
    if (confirm('Are you sure you want to delete all links?')) {
        links = [];
        saveLinks();
        renderLinks();
    }
}

async function copyToClipboard(url, button) {
    try {
        await navigator.clipboard.writeText(url);
        
        // Visual feedback on button
        const originalHTML = button.innerHTML;
        button.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span class="text-sm font-medium">Copied!</span>`;
        button.classList.remove('text-slate-400', 'hover:text-indigo-400', 'hover:bg-indigo-500/10');
        button.classList.add('text-emerald-400', 'bg-emerald-500/10', 'copied-animation');
        lucide.createIcons();
        
        // Show toast
        showToast();
        
        // Reset button after 2 seconds
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('text-emerald-400', 'bg-emerald-500/10', 'copied-animation');
            button.classList.add('text-slate-400', 'hover:text-indigo-400', 'hover:bg-indigo-500/10');
            lucide.createIcons();
        }, 2000);
        
    } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast();
    }
}

// UI Functions
function renderLinks() {
    const container = document.getElementById('linksContainer');
    const emptyState = document.getElementById('emptyState');
    const countElement = document.getElementById('linkCount');
    const clearBtn = document.getElementById('clearAllBtn');
    
    // Update stats
    countElement.textContent = links.length;
    
    if (links.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.classList.remove('hidden');
        clearBtn.classList.add('hidden');
        return;
    }
    
    clearBtn.classList.remove('hidden');
    emptyState.classList.add('hidden');
    
    // Render list
    container.innerHTML = links.map((link, index) => {
        const domain = getDomainFromURL(link.url);
        const isLong = link.url.length > 50;
        const displayUrl = isLong ? link.url.substring(0, 50) + '...' : link.url;
        const title = link.title || domain;
        
        return `
            <div class="link-item bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-700 hover:shadow-md hover:border-slate-600 transition-all duration-200 group">
                <div class="flex items-center gap-4">
                    <!-- Favicon Placeholder -->
                    <div class="flex-shrink-0 w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-indigo-400">
                        <i data-lucide="link" class="w-5 h-5"></i>
                    </div>
                    
                    <!-- Link Info -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1" id="title-container-${link.id}">
                            <h3 id="title-${link.id}" class="text-white font-semibold truncate" title="${title}">${title}</h3>
                            <button onclick="startEditingTitle(${link.id}, '${title.replace(/'/g, "\\'")}')" 
                                    class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-400"
                                    title="Edit title">
                                <i data-lucide="pencil" class="w-3 h-3"></i>
                            </button>
                        </div>
                        <a href="${link.url}" target="_blank" rel="noopener noreferrer" 
                           class="block text-slate-400 text-sm truncate hover:text-indigo-400 transition-colors" 
                           title="${link.url}">
                            ${displayUrl}
                        </a>
                    </div>
                    
                    <!-- Actions -->
                    <div class="flex items-center gap-2">
                        <!-- Reorder Buttons -->
                        <div class="flex flex-col gap-0.5 mr-1">
                            <button onclick="moveLink(${index}, -1)" 
                                    class="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}"
                                    ${index === 0 ? 'disabled' : ''}
                                    title="Move up">
                                <i data-lucide="chevron-up" class="w-3 h-3"></i>
                            </button>
                            <button onclick="moveLink(${index}, 1)" 
                                    class="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors ${index === links.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}"
                                    ${index === links.length - 1 ? 'disabled' : ''}
                                    title="Move down">
                                <i data-lucide="chevron-down" class="w-3 h-3"></i>
                            </button>
                        </div>
                        
                        <button onclick="copyToClipboard('${link.url}', this)" 
                                class="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all duration-200"
                                title="Copy to clipboard">
                            <i data-lucide="copy" class="w-4 h-4"></i>
                            <span class="text-sm font-medium hidden sm:inline">Copy</span>
                        </button>
                        
                        <button onclick="deleteLink(${index})" 
                                class="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 opacity-0 group-hover:opacity-100 sm:opacity-100"
                                title="Delete link">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Re-initialize icons
    lucide.createIcons();
}

function saveLinks() {
    localStorage.setItem('quickLinks', JSON.stringify(links));
}

function showToast() {
    const toast = document.getElementById('toast');
    toast.classList.remove('translate-y-20', 'opacity-0');
    
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2000);
}

function showError(message) {
    const errorMsg = document.getElementById('errorMsg');
    errorMsg.querySelector('span').textContent = message;
    errorMsg.classList.remove('hidden');
    
    // Shake animation on input
    const input = document.getElementById('linkInput');
    input.classList.add('border-red-500', 'ring-2', 'ring-red-200');
    
    setTimeout(() => {
        input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
    }, 2000);
}

function hideError() {
    const errorMsg = document.getElementById('errorMsg');
    errorMsg.classList.add('hidden');
}

// Close modal on outside click
document.getElementById('deleteModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeDeleteModal();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDeleteModal();
    }
});