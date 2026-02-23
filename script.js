// State management - New hierarchical structure
let items = [];
try {
    const stored = localStorage.getItem('quickLinks');
    if (stored) {
        const parsed = JSON.parse(stored);
        items = Array.isArray(parsed) ? parsed : [];
    }
} catch (e) {
    console.error('Error loading from localStorage:', e);
    items = [];
}
let deleteIndex = null;
let deleteItemId = null;
let currentParentId = null; // For creating subgroups
let itemToMove = null; // For moving items between groups
let toastTimeout = null; // Track toast timeout to prevent overlap

// Migration from old flat structure to new hierarchical structure
function migrateOldData() {
    const oldLinks = JSON.parse(localStorage.getItem('quickLinks')) || [];
    // Check if any items lack the 'type' property (old format detection)
    const needsMigration = oldLinks.length > 0 && oldLinks.some(item => !item.type);
    
    if (needsMigration) {
        // Old format detected - convert to new format
        const migrated = oldLinks.map(item => ({
            ...item,
            type: item.type || 'link', // Default to link if no type
            parentId: item.parentId !== undefined ? item.parentId : null, // Ensure parentId exists
            name: item.name || item.title || 'Untitled' // Ensure name exists for groups
        }));
        items = migrated;
        saveItems();
        console.log('Migrated to new hierarchical format:', items.length, 'items');
    } else if (oldLinks.length > 0) {
        // Ensure items array is loaded with current data
        items = oldLinks;
    }
}

// Initialize - Single entry point
document.addEventListener('DOMContentLoaded', () => {
    migrateOldData();
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
    document.getElementById('groupNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveGroup();
    });
});

// Validation and formatting
function isValidURL(string) {
    try {
        const url = new URL(string);
        // Prevent javascript: and data: protocols for security
        const allowedProtocols = ['http:', 'https:'];
        if (!allowedProtocols.includes(url.protocol)) {
            return false;
        }
        return true;
    } catch (_) {
        return false;
    }
}

// HTML escape utility to prevent XSS
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape for use in JavaScript strings within HTML attributes
function escapeJsString(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
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

// Helper functions for hierarchical data
function getChildren(parentId) {
    // Handle both null and undefined parentId as root level
    if (parentId === null || parentId === undefined) {
        return items.filter(item => item.parentId === null || item.parentId === undefined);
    }
    return items.filter(item => item.parentId === parentId);
}

function getAllDescendants(parentId, visited = new Set()) {
    // Prevent infinite recursion from circular references
    if (visited.has(parentId)) return [];
    visited.add(parentId);
    
    const descendants = [];
    const children = getChildren(parentId);
    descendants.push(...children);
    children.forEach(child => {
        if (child.type === 'group') {
            descendants.push(...getAllDescendants(child.id, visited));
        }
    });
    return descendants;
}

// Helper to get item level in hierarchy (for indentation)
function getItemLevel(id) {
    let level = 0;
    let current = getItemById(id);
    while (current && current.parentId !== null && current.parentId !== undefined) {
        level++;
        current = getItemById(current.parentId);
        if (level > 10) break; // Safety break for circular references
    }
    return level;
}

function getItemById(id) {
    return items.find(item => item.id === id);
}

function getGroupLevel(id) {
    let level = 0;
    let current = getItemById(id);
    while (current && current.parentId) {
        level++;
        current = getItemById(current.parentId);
    }
    return level;
}

function getAllGroups() {
    return items.filter(item => item.type === 'group');
}

// Core functions
function addLink() {
    const input = document.getElementById('linkInput');
    const titleInput = document.getElementById('titleInput');
    let url = input.value.trim();
    let title = titleInput.value.trim();

    if (!url) {
        showError('Please enter a URL');
        return;
    }

    // Format and validate
    const formattedURL = formatURL(url);
    
    if (!isValidURL(formattedURL)) {
        showError('Please enter a valid URL (e.g., https://example.com)');
        return;
    }

    // Check for duplicates at root level only (simplification)
    const existing = items.find(item => item.type === 'link' && item.url === formattedURL);
    if (existing) {
        showError('This link already exists!');
        return;
    }

    // If no title provided, use domain as default
    if (!title) {
        title = getDomainFromURL(formattedURL);
    }

    // Add to array at root level (parentId: null)
    const newLink = {
        id: Date.now(),
        type: 'link',
        url: formattedURL,
        title: title,
        parentId: null,
        createdAt: new Date().toISOString()
    };

    items.unshift(newLink);
    saveItems();
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

function createNewGroup(parentId = null) {
    currentParentId = parentId;
    const modal = document.getElementById('groupModal');
    const modalContent = document.getElementById('groupModalContent');
    const title = document.getElementById('groupModalTitle');
    const subtitle = document.getElementById('groupModalSubtitle');
    
    title.textContent = parentId ? 'New Subgroup' : 'New Group';
    subtitle.classList.toggle('hidden', !parentId);
    
    document.getElementById('groupNameInput').value = '';
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
        document.getElementById('groupNameInput').focus();
    }, 10);
}

function closeGroupModal() {
    const modal = document.getElementById('groupModal');
    const modalContent = document.getElementById('groupModalContent');
    
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        currentParentId = null;
    }, 200);
}

function saveGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    
    const newGroup = {
        id: Date.now(),
        type: 'group',
        name: name || 'Untitled Group',
        parentId: currentParentId,
        isExpanded: true,
        createdAt: new Date().toISOString()
    };
    
    items.push(newGroup);
    saveItems();
    renderLinks();
    closeGroupModal();
}

function toggleGroup(groupId) {
    const group = getItemById(groupId);
    if (group) {
        group.isExpanded = !group.isExpanded;
        saveItems();
        renderLinks();
    }
}

function moveItemToGroup(itemId, targetParentId) {
    const item = getItemById(itemId);
    if (!item) {
        closeMoveModal();
        return;
    }
    
    // Prevent moving a group into itself
    if (item.type === 'group' && itemId === targetParentId) {
        showToast('Cannot move a group into itself!', 'error');
        closeMoveModal();
        return;
    }
    
    // Prevent moving a group into its descendants
    if (item.type === 'group' && targetParentId !== null && targetParentId !== undefined) {
        const descendants = getAllDescendants(itemId);
        if (descendants.some(d => d.id === targetParentId)) {
            showToast('Cannot move a group into itself!', 'error');
            closeMoveModal();
            return;
        }
    }
    
    item.parentId = targetParentId;
    saveItems();
    renderLinks();
    closeMoveModal();
}

function openMoveModal(itemId) {
    itemToMove = itemId;
    const modal = document.getElementById('moveModal');
    const modalContent = document.getElementById('moveModalContent');
    const list = document.getElementById('moveGroupList');
    
    const item = getItemById(itemId);
    const groups = getAllGroups().filter(g => g.id !== itemId); // Can't move into self
    
    // Build group options with indentation
    let html = `
        <div class="space-y-1">
            <button onclick="moveItemToGroup(${itemId}, null)" 
                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors ${item.parentId === null ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-300'}">
                <i data-lucide="home" class="w-4 h-4 inline mr-2"></i>
                Root (no group)
            </button>
    `;
    
    function renderGroupOption(group, level) {
        const indent = '  '.repeat(level);
        const isCurrentParent = item.parentId === group.id;
        const safeName = escapeHtml(group.name);
        return `
            <button onclick="moveItemToGroup(${itemId}, ${group.id})" 
                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors ${isCurrentParent ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-300'}">
                <span class="inline-block text-slate-500">${indent}</span>
                <i data-lucide="folder" class="w-4 h-4 inline mr-2 text-indigo-400"></i>
                ${safeName}
            </button>
        `;
    }
    
    // Render groups recursively
    function addGroups(parentId, level) {
        const children = groups.filter(g => g.parentId === parentId);
        children.forEach(child => {
            html += renderGroupOption(child, level);
            addGroups(child.id, level + 1);
        });
    }
    
    addGroups(null, 0);
    html += '</div>';
    
    list.innerHTML = html;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
        lucide.createIcons();
    }, 10);
}

function closeMoveModal() {
    const modal = document.getElementById('moveModal');
    const modalContent = document.getElementById('moveModalContent');
    
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        itemToMove = null;
    }, 200);
}

function editTitle(id, newTitle) {
    const item = getItemById(id);
    if (item && item.type === 'link') {
        item.title = newTitle.trim() || getDomainFromURL(item.url);
        saveItems();
        renderLinks();
    }
}

function editGroupName(id, newName) {
    const group = getItemById(id);
    if (group && group.type === 'group') {
        group.name = newName.trim() || 'Untitled Group';
        saveItems();
        renderLinks();
    }
}

function startEditingTitle(id, currentTitle) {
    const container = document.getElementById(`title-container-${id}`);
    const item = getItemById(id);
    
    if (!container || !item) return;
    
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
    
    let saved = false;
    
    // Save on blur or enter
    const saveEdit = () => {
        if (saved) return;
        saved = true;
        if (item.type === 'group') {
            editGroupName(id, input.value);
        } else {
            editTitle(id, input.value);
        }
    };
    
    const cancelEdit = () => {
        saved = true; // Prevent blur from saving
        renderLinks();
    };
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        }
        if (e.key === 'Escape') {
            e.preventDefault(); // Prevent blur from firing immediately
            cancelEdit();
        }
    });
}

function deleteItem(id) {
    const item = getItemById(id);
    if (!item) return;
    
    deleteItemId = id;
    deleteIndex = items.findIndex(i => i.id === id);
    
    const modal = document.getElementById('deleteModal');
    const modalContent = document.getElementById('deleteModalContent');
    const typeSpan = document.getElementById('deleteItemType');
    const textP = document.getElementById('deleteModalText');
    
    if (item.type === 'group') {
        typeSpan.textContent = 'Group';
        const childCount = getAllDescendants(id).length;
        textP.textContent = `Delete "${item.name}" and all ${childCount} items inside? This action cannot be undone.`;
    } else {
        typeSpan.textContent = 'Link';
        textP.textContent = 'Are you sure you want to remove this link? This action cannot be undone.';
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
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
        deleteItemId = null;
    }, 200);
}

function confirmDelete() {
    if (deleteItemId !== null && deleteItemId !== undefined) {
        const item = getItemById(deleteItemId);
        if (item && item.type === 'group') {
            // Delete all descendants too
            const descendants = getAllDescendants(deleteItemId);
            const idsToDelete = [deleteItemId, ...descendants.map(d => d.id)];
            items = items.filter(i => !idsToDelete.includes(i.id));
        } else if (deleteIndex >= 0 && deleteIndex < items.length) {
            // Safety check: only delete if index is valid
            items.splice(deleteIndex, 1);
        } else {
            console.error('Delete failed: invalid index or item not found');
        }
        saveItems();
        renderLinks();
        closeDeleteModal();
    }
}

function createSubgroup(parentId) {
    createNewGroup(parentId);
}

function clearAll() {
    if (confirm('Are you sure you want to delete all links and groups?')) {
        items = [];
        saveItems();
        renderLinks();
    }
}

async function copyToClipboard(url, button) {
    let originalHTML = button.innerHTML;
    try {
        await navigator.clipboard.writeText(url);
        
        // Visual feedback on button
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
        try {
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast();
        } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
            showToast('Failed to copy', 'error');
        }
    }
}

// Drag and Drop State
let draggedItem = null;
let dragOverItem = null;
let dragOverPosition = null; // 'before' or 'after'

function renderLinks() {
    const container = document.getElementById('linksContainer');
    let emptyState = document.getElementById('emptyState');
    const linkCount = document.getElementById('linkCount');
    const groupCount = document.getElementById('groupCount');
    const clearBtn = document.getElementById('clearAllBtn');
    const newGroupBtn = document.getElementById('newGroupBtn');
    
    // Ensure items is an array
    if (!Array.isArray(items)) {
        items = [];
    }
    
    const links = items.filter(i => i.type === 'link');
    const groups = items.filter(i => i.type === 'group');
    
    // Update stats
    linkCount.textContent = links.length;
    groupCount.textContent = groups.length;
    
    if (items.length === 0) {
        container.innerHTML = '';
        // If emptyState was destroyed by previous innerHTML, recreate it
        if (!emptyState) {
            emptyState = document.createElement('div');
            emptyState.id = 'emptyState';
            emptyState.className = 'text-center py-16 bg-slate-800/50 backdrop-blur rounded-2xl border-2 border-dashed border-slate-700';
            emptyState.innerHTML = `
                <div class="inline-flex items-center justify-center w-12 h-12 bg-slate-700 rounded-full mb-3">
                    <i data-lucide="link" class="w-6 h-6 text-slate-500"></i>
                </div>
                <p class="text-slate-400 font-medium">No links added yet</p>
                <p class="text-slate-500 text-sm mt-1">Add your first link above to get started</p>
            `;
        }
        container.appendChild(emptyState);
        emptyState.classList.remove('hidden');
        clearBtn.classList.add('hidden');
        newGroupBtn.classList.add('hidden');
        lucide.createIcons();
        return;
    }
    
    clearBtn.classList.remove('hidden');
    newGroupBtn.classList.remove('hidden');
    if (emptyState) {
        emptyState.classList.add('hidden');
    }
    
    // Render hierarchical structure - get root items (null or undefined parentId)
    const rootItems = items.filter(item => item.parentId === null || item.parentId === undefined);
    
    // If no root items but items exist, they might be orphaned - show them at root
    let html = '';
    if (rootItems.length === 0 && items.length > 0) {
        // Fallback: render all items at root level to prevent disappearing
        items.forEach((item, index) => {
            if (item.type === 'group') {
                html += renderGroup(item, 0, index, items.length);
            } else {
                html += renderLink(item, 0, index, items.length);
            }
        });
    } else {
        html = renderItemsRecursive(null, 0);
    }
    
    container.innerHTML = html || renderItemsRecursive(null, 0);
    
    // Re-initialize icons
    lucide.createIcons();
    
    // Initialize drag and drop
    initializeDragAndDrop();
}

function renderItemsRecursive(parentId, level) {
    // Handle both null and undefined as root identifiers
    const children = items.filter(item => {
        if (parentId === null || parentId === undefined) {
            return item.parentId === null || item.parentId === undefined;
        }
        return item.parentId === parentId;
    });
    
    if (children.length === 0) return '';
    
    let html = '';
    
    children.forEach((item, index) => {
        const indentClass = `indent-level-${Math.min(level, 5)}`;
        
        if (item.type === 'group') {
            html += renderGroup(item, level, index, children.length);
        } else {
            html += renderLink(item, level, index, children.length);
        }
    });
    
    return html;
}

function renderGroup(group, level, index, totalSiblings) {
    const indentClass = `indent-level-${Math.min(level, 5)}`;
    const children = getChildren(group.id);
    const hasChildren = children.length > 0;
    const expandIcon = group.isExpanded ? 'chevron-down' : 'chevron-right';
    const childrenClass = group.isExpanded ? 'expanded' : 'collapsed';
    const safeName = escapeHtml(group.name);
    const safeJsName = escapeJsString(group.name);
    
    return `
        <div class="group-item ${indentClass}" data-id="${group.id}" data-type="group" draggable="true">
            <div class="bg-slate-800/90 rounded-xl border border-slate-700 hover:border-indigo-500/50 transition-all duration-200 overflow-hidden">
                <!-- Group Header -->
                <div class="flex items-center gap-3 p-3 bg-slate-700/30">
                    <!-- Drag Handle -->
                    <div class="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-700" data-drag-handle>
                        <i data-lucide="grip-vertical" class="w-4 h-4"></i>
                    </div>
                    
                    <!-- Expand/Collapse -->
                    <button onclick="toggleGroup(${group.id})" 
                            class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-600 transition-colors text-slate-400 hover:text-white"
                            title="${group.isExpanded ? 'Collapse' : 'Expand'}">
                        <i data-lucide="${expandIcon}" class="w-4 h-4"></i>
                    </button>
                    
                    <!-- Icon -->
                    <div class="flex-shrink-0 w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
                        <i data-lucide="folder" class="w-4 h-4"></i>
                    </div>
                    
                    <!-- Name -->
                    <div class="flex-1 min-w-0" id="title-container-${group.id}">
                        <div class="flex items-center gap-2">
                            <h3 class="text-white font-semibold truncate" title="${safeName}">${safeName}</h3>
                            <span class="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">${getAllDescendants(group.id).length} items</span>
                            <button onclick="startEditingTitle(${group.id}, '${safeJsName}')" 
                                    class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-400"
                                    title="Rename group">
                                <i data-lucide="pencil" class="w-3 h-3"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Actions -->
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="createSubgroup(${group.id})" 
                                class="p-1.5 rounded hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-colors"
                                title="Add subgroup">
                            <i data-lucide="folder-plus" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openMoveModal(${group.id})" 
                                class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-400 transition-colors"
                                title="Move to group">
                            <i data-lucide="folder-input" class="w-4 h-4"></i>
                        </button>
                        <button onclick="deleteItem(${group.id})" 
                                class="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                title="Delete group">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Children Container -->
                <div class="group-children ${childrenClass} bg-slate-800/30">
                    ${renderItemsRecursive(group.id, level + 1)}
                </div>
            </div>
        </div>
    `;
}

function renderLink(link, level, index, totalSiblings) {
    const indentClass = `indent-level-${Math.min(level, 5)}`;
    const domain = getDomainFromURL(link.url);
    const isLong = link.url.length > 50;
    const displayUrl = isLong ? link.url.substring(0, 50) + '...' : link.url;
    const title = link.title || domain;
    const safeTitle = escapeHtml(title);
    const safeUrl = escapeHtml(link.url);
    const safeDisplayUrl = escapeHtml(displayUrl);
    const safeJsTitle = escapeJsString(title);
    
    return `
        <div class="link-item ${indentClass} bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-700 hover:shadow-md hover:border-slate-600 transition-all duration-200 group" 
             data-id="${link.id}" data-type="link" draggable="true">
            <div class="flex items-center gap-3">
                <!-- Drag Handle -->
                <div class="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-700 flex-shrink-0" data-drag-handle>
                    <i data-lucide="grip-vertical" class="w-4 h-4"></i>
                </div>
                
                <!-- Favicon -->
                <div class="flex-shrink-0 w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-indigo-400">
                    <i data-lucide="link" class="w-4 h-4"></i>
                </div>
                
                <!-- Link Info -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2" id="title-container-${link.id}">
                        <h3 class="text-white font-semibold truncate text-sm" title="${safeTitle}">${safeTitle}</h3>
                        <button onclick="startEditingTitle(${link.id}, '${safeJsTitle}')" 
                                class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-400"
                                title="Edit title">
                            <i data-lucide="pencil" class="w-3 h-3"></i>
                        </button>
                    </div>
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" 
                       class="block text-slate-400 text-xs truncate hover:text-indigo-400 transition-colors" 
                       title="${safeUrl}">
                        ${safeDisplayUrl}
                    </a>
                </div>
                
                <!-- Actions -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="copyToClipboard('${escapeJsString(link.url)}', this)" 
                            class="p-1.5 rounded hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-colors"
                            title="Copy to clipboard">
                        <i data-lucide="copy" class="w-4 h-4"></i>
                    </button>
                    <button onclick="openMoveModal(${link.id})" 
                            class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-400 transition-colors"
                            title="Move to group">
                        <i data-lucide="folder-input" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteItem(${link.id})" 
                            class="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete link">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Drag and Drop Implementation
function initializeDragAndDrop() {
    const draggables = document.querySelectorAll('[draggable="true"]');
    const containers = document.querySelectorAll('#linksContainer, .group-children');
    const groupHeaders = document.querySelectorAll('.group-item');
    
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', handleDragStart);
        draggable.addEventListener('dragend', handleDragEnd);
    });
    
    containers.forEach(container => {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('dragleave', handleDragLeave);
        container.addEventListener('drop', handleDrop);
    });
    
    // Allow dropping on group headers to move items into that group
    groupHeaders.forEach(group => {
        group.addEventListener('dragover', handleGroupDragOver);
        group.addEventListener('dragleave', handleGroupDragLeave);
        group.addEventListener('drop', handleGroupDrop);
    });
}

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedItem = null;
    
    // Remove all drag-over classes
    document.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedItem) return;
    
    const afterElement = getDragAfterElement(this, e.clientY);
    
    // Clear previous indicators
    this.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    
    if (afterElement == null) {
        // Dropping at the end
        const lastChild = this.lastElementChild;
        if (lastChild && lastChild !== draggedItem) {
            lastChild.classList.add('drag-over-bottom');
        }
    } else {
        // Dropping before afterElement
        afterElement.classList.add('drag-over-top');
    }
}

function handleDragLeave(e) {
    // Remove indicators when leaving container
    if (e.target.classList.contains('group-children') || e.target.id === 'linksContainer') {
        e.target.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
    }
}

function handleDrop(e) {
    e.preventDefault();
    
    if (!draggedItem) return;
    
    const draggedId = parseInt(draggedItem.dataset.id);
    const draggedItemData = getItemById(draggedId);
    
    if (!draggedItemData) return;
    
    // Get the drop target container's parent group ID
    let targetParentId = null;
    if (this.classList.contains('group-children')) {
        const groupEl = this.closest('[data-type="group"]');
        if (groupEl) {
            targetParentId = parseInt(groupEl.dataset.id);
        }
    }
    
    // Check if dropping a group into itself or its descendants
    // Use explicit null/undefined checks since 0 is a valid ID (though unlikely with Date.now)
    if (draggedItemData.type === 'group' && targetParentId !== null && targetParentId !== undefined) {
        if (draggedId === targetParentId) {
            showToast('Cannot move a group into itself!', 'error');
            return;
        }
        const descendants = getAllDescendants(draggedId);
        if (descendants.some(d => d.id === targetParentId)) {
            showToast('Cannot move a group into itself!', 'error');
            return;
        }
    }
    
    // Find position
    const afterElement = getDragAfterElement(this, e.clientY);
    
    // Update parent - explicitly set to null if root, otherwise to target group id
    draggedItemData.parentId = targetParentId;
    
    // Remove from current position first
    const currentIndex = items.findIndex(i => i.id === draggedId);
    if (currentIndex > -1) {
        items.splice(currentIndex, 1);
    }
    
    // Insert at new position
    if (afterElement) {
        const afterId = parseInt(afterElement.dataset.id);
        const newIndex = items.findIndex(i => i.id === afterId);
        if (newIndex > -1) {
            items.splice(newIndex, 0, draggedItemData);
        } else {
            items.push(draggedItemData);
        }
    } else {
        // Move to end of array
        items.push(draggedItemData);
    }
    
    saveItems();
    renderLinks();
    showToast('Moved successfully');
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('[draggable="true"]:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Group-specific drag handlers for dropping onto group headers
function handleGroupDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    // Don't allow dropping a group onto itself
    const draggedId = parseInt(draggedItem.dataset.id);
    const targetGroupId = parseInt(this.dataset.id);
    
    if (draggedId === targetGroupId) return;
    
    // Don't allow dropping a parent group onto its child
    const draggedItemData = getItemById(draggedId);
    if (draggedItemData && draggedItemData.type === 'group') {
        const descendants = getAllDescendants(draggedId);
        if (descendants.some(d => d.id === targetGroupId)) {
            return;
        }
    }
    
    // Add visual indicator that this is a drop target
    this.classList.add('drag-over-group');
    e.dataTransfer.dropEffect = 'move';
}

function handleGroupDragLeave(e) {
    this.classList.remove('drag-over-group');
}

function handleGroupDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    this.classList.remove('drag-over-group');
    
    if (!draggedItem) return;
    
    const draggedId = parseInt(draggedItem.dataset.id);
    const targetGroupId = parseInt(this.dataset.id);
    const draggedItemData = getItemById(draggedId);
    
    if (!draggedItemData) return;
    
    // Don't allow dropping onto itself
    if (draggedId === targetGroupId) {
        showToast('Cannot move an item into itself!', 'error');
        return;
    }
    
    // Don't allow dropping a parent group into its child
    if (draggedItemData.type === 'group') {
        const descendants = getAllDescendants(draggedId);
        if (descendants.some(d => d.id === targetGroupId)) {
            showToast('Cannot move a group into itself!', 'error');
            return;
        }
    }
    
    // Move item to the target group
    draggedItemData.parentId = targetGroupId;
    
    // Remove from current position and add to end of items array (it will be rendered at the end of the group)
    const currentIndex = items.findIndex(i => i.id === draggedId);
    if (currentIndex > -1) {
        items.splice(currentIndex, 1);
    }
    items.push(draggedItemData);
    
    // Expand the target group to show the new item
    const targetGroup = getItemById(targetGroupId);
    if (targetGroup) {
        targetGroup.isExpanded = true;
    }
    
    saveItems();
    renderLinks();
    showToast(draggedItemData.type === 'group' ? 'Group moved successfully' : 'Link moved to group');
}

function saveItems() {
    localStorage.setItem('quickLinks', JSON.stringify(items));
}

function showToast(message = 'Copied to clipboard!', type = 'success') {
    const toast = document.getElementById('toast');
    const icon = toast.querySelector('i');
    const text = toast.querySelector('span');
    
    // Clear previous timeout to prevent early dismissal
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    text.textContent = message;
    
    if (type === 'error') {
        toast.classList.remove('bg-emerald-500');
        toast.classList.add('bg-red-500');
        icon.setAttribute('data-lucide', 'x-circle');
    } else {
        toast.classList.remove('bg-red-500');
        toast.classList.add('bg-emerald-500');
        icon.setAttribute('data-lucide', 'check-circle');
    }
    lucide.createIcons();
    
    toast.classList.remove('translate-y-20', 'opacity-0');
    
    toastTimeout = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        toastTimeout = null;
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
        closeGroupModal();
        closeMoveModal();
    }
});

// Close modals on outside click
document.getElementById('deleteModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
});
document.getElementById('groupModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeGroupModal();
});
document.getElementById('moveModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeMoveModal();
});
