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
let currentUser = null; // Firebase user
let authMode = 'login'; // 'login' or 'register'
let isOnline = navigator.onLine;

// Firebase configuration - replace with your own Firebase project config
// Get this from Firebase Console > Project Settings > General > Your apps > Web app
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase if config is provided
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

function initFirebase() {
    // Check if Firebase config is set (not default placeholder)
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn('Firebase not configured. Please add your Firebase config to enable cloud sync.');
        updateSyncStatus('local');
        return false;
    }
    
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        firebaseAuth = firebase.auth();
        firebaseDb = firebase.firestore();
        
        // Auth state listener
        firebaseAuth.onAuthStateChanged(handleAuthStateChange);
        
        return true;
    } catch (e) {
        console.error('Firebase initialization failed:', e);
        updateSyncStatus('local');
        return false;
    }
}

function handleAuthStateChange(user) {
    currentUser = user;
    
    // Get all instances of auth buttons (there may be duplicates in the DOM)
    const authButtonsList = document.querySelectorAll('#authButtons');
    const userInfoList = document.querySelectorAll('#userInfo');
    const userEmailList = document.querySelectorAll('#userEmail');
    
    if (user) {
        // User is signed in
        authButtonsList.forEach(el => el.classList.add('hidden'));
        userInfoList.forEach(el => el.classList.remove('hidden'));
        userEmailList.forEach(el => el.textContent = user.email);
        updateSyncStatus('syncing');
        
        // Load from cloud
        loadFromCloud(user.uid);
        
        // Setup real-time sync
        setupCloudSync(user.uid);
    } else {
        // User is signed out
        authButtonsList.forEach(el => el.classList.remove('hidden'));
        userInfoList.forEach(el => el.classList.add('hidden'));
        userEmailList.forEach(el => el.textContent = '');
        updateSyncStatus('local');
        
        // Load from localStorage
        items = [];
        try {
            const stored = localStorage.getItem('quickLinks');
            if (stored) {
                const parsed = JSON.parse(stored);
                items = Array.isArray(parsed) ? parsed : [];
            }
        } catch (e) {
            items = [];
        }
        migrateOldData();
        renderLinks();
    }
}

function updateSyncStatus(status) {
    const syncStatus = document.getElementById('syncStatus');
    if (!syncStatus) return;
    
    if (status === 'local') {
        syncStatus.textContent = 'Local only';
        syncStatus.className = 'text-slate-500 text-xs';
    } else if (status === 'syncing') {
        syncStatus.textContent = 'Syncing...';
        syncStatus.className = 'text-yellow-400 text-xs';
    } else if (status === 'synced') {
        syncStatus.textContent = 'Synced to cloud';
        syncStatus.className = 'text-emerald-400 text-xs';
    } else if (status === 'offline') {
        syncStatus.textContent = 'Offline (local)';
        syncStatus.className = 'text-orange-400 text-xs';
    } else if (status === 'error') {
        syncStatus.textContent = 'Sync error';
        syncStatus.className = 'text-red-400 text-xs';
    }
}

async function loadFromCloud(userId) {
    if (!firebaseDb || !userId) return;
    
    try {
        const doc = await firebaseDb.collection('users').doc(userId).get();
        
        if (doc.exists) {
            const data = doc.data();
            if (data.items && Array.isArray(data.items)) {
                items = data.items;
                normalizeData();
                renderLinks();
                updateSyncStatus('synced');
            }
        } else {
            // No cloud data yet, save local data to cloud
            await saveToCloud();
            updateSyncStatus('synced');
        }
    } catch (e) {
        console.error('Error loading from cloud:', e);
        updateSyncStatus('error');
    }
}

function setupCloudSync(userId) {
    if (!firebaseDb || !userId) return;
    
    // Listen for online/offline status
    window.addEventListener('online', () => {
        isOnline = true;
        updateSyncStatus('synced');
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        updateSyncStatus('offline');
    });
}

async function saveToCloud() {
    if (!firebaseDb || !currentUser || !isOnline) {
        // Save to localStorage as fallback
        localStorage.setItem('quickLinks', JSON.stringify(items));
        return;
    }
    
    try {
        updateSyncStatus('syncing');
        await firebaseDb.collection('users').doc(currentUser.uid).set({
            items: items,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateSyncStatus('synced');
    } catch (e) {
        console.error('Error saving to cloud:', e);
        // Save to localStorage as backup
        localStorage.setItem('quickLinks', JSON.stringify(items));
        updateSyncStatus('error');
    }
}

// Auth functions
function showAuthModal() {
    const modal = document.getElementById('authModal');
    const modalContent = document.getElementById('authModalContent');
    
    // Reset form
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    hideAuthError();
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
        document.getElementById('authEmail').focus();
    }, 10);
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    const modalContent = document.getElementById('authModalContent');
    
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    
    const title = document.getElementById('authModalTitle');
    const actionBtn = document.getElementById('authActionBtn');
    const toggleBtn = document.getElementById('authToggleBtn');
    
    if (authMode === 'login') {
        title.textContent = 'Login';
        actionBtn.textContent = 'Login';
        toggleBtn.textContent = "Don't have an account? Register";
    } else {
        title.textContent = 'Register';
        actionBtn.textContent = 'Register';
        toggleBtn.textContent = 'Already have an account? Login';
    }
    
    hideAuthError();
}

function showAuthError(message) {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function hideAuthError() {
    const errorEl = document.getElementById('authError');
    errorEl.classList.add('hidden');
}

async function handleAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    
    if (!email || !password) {
        showAuthError('Please enter both email and password');
        return;
    }
    
    if (!firebaseAuth) {
        showAuthError('Authentication not available. Please configure Firebase.');
        return;
    }
    
    const actionBtn = document.getElementById('authActionBtn');
    const originalText = actionBtn.textContent;
    actionBtn.textContent = authMode === 'login' ? 'Logging in...' : 'Registering...';
    actionBtn.disabled = true;
    
    try {
        if (authMode === 'login') {
            await firebaseAuth.signInWithEmailAndPassword(email, password);
        } else {
            const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            // For new users, migrate their local data to cloud
            if (items.length > 0) {
                await saveToCloud();
            }
        }
        closeAuthModal();
    } catch (e) {
        console.error('Auth error:', e);
        showAuthError(e.message || 'Authentication failed');
    } finally {
        actionBtn.textContent = originalText;
        actionBtn.disabled = false;
    }
}

async function logout() {
    if (!firebaseAuth) return;
    
    try {
        await firebaseAuth.signOut();
        // Clear items to force reload from localStorage
        items = [];
        renderLinks();
    } catch (e) {
        console.error('Logout error:', e);
        showToast('Failed to logout', 'error');
    }
}

// Network status monitoring
window.addEventListener('online', () => {
    isOnline = true;
    if (currentUser) {
        updateSyncStatus('synced');
        // Sync any pending changes
        saveToCloud();
    }
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncStatus('offline');
});

// Normalize data to fix common corruption issues
function normalizeData() {
    if (!Array.isArray(items)) {
        items = [];
        return;
    }
    
    let hasChanges = false;
    
    items = items.map(item => {
        // Fix parentId: ensure it's either a valid number ID or null (not string "null"/"undefined")
        let parentId = item.parentId;
        if (parentId === 'null' || parentId === 'undefined' || parentId === undefined) {
            parentId = null;
            hasChanges = true;
        }
        
        // Ensure name/title are strings and never undefined
        let name = item.name;
        if (typeof name !== 'string') {
            name = String(name || '');
            hasChanges = true;
        }
        // Clean up corrupted values like "undefined", "null", "undefinednull", etc.
        const isCorruptedName = (val) => !val || val === 'undefined' || val === 'null' || val === 'undefinednull' || val === 'nullundefined' || val === 'undefined null' || val === 'null undefined';
        
        if (isCorruptedName(name)) {
            name = (title && !isCorruptedName(title)) ? title : 'Untitled Group';
            hasChanges = true;
        }
        
        let title = item.title;
        if (typeof title !== 'string') {
            title = String(title || '');
            hasChanges = true;
        }
        // Clean up corrupted values
        if (isCorruptedName(title)) {
            title = (name && !isCorruptedName(name)) ? name : 'Untitled';
            hasChanges = true;
        }
        
        // Ensure type is valid
        let type = item.type;
        if (type !== 'link' && type !== 'group') {
            type = item.url ? 'link' : 'group';
            hasChanges = true;
        }
        
        // Ensure id is a number
        let id = item.id;
        if (typeof id === 'string') {
            id = parseInt(id) || Date.now();
            hasChanges = true;
        }
        
        return {
            ...item,
            id,
            type,
            name,
            title,
            parentId
        };
    });
    
    if (hasChanges) {
        console.log('Data normalized - fixed corrupted values');
        saveItems();
    }
}

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
            parentId: item.parentId !== undefined && item.parentId !== 'undefined' && item.parentId !== 'null' ? item.parentId : null, // Ensure parentId exists
            name: item.name || item.title || 'Untitled Group', // Ensure name exists for groups
            title: item.title || item.name || 'Untitled' // Ensure title exists for links
        }));
        items = migrated;
        saveItems();
        console.log('Migrated to new hierarchical format:', items.length, 'items');
    } else if (oldLinks.length > 0) {
        // Ensure items array is loaded with current data
        items = oldLinks;
    }
    
    // Always run normalization to fix any data corruption
    normalizeData();
}

// Initialize - Single entry point
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase first
    initFirebase();
    
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
    document.getElementById('authEmail').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('authPassword').focus();
    });
    document.getElementById('authPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
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
    // Ensure input is a string
    if (typeof str !== 'string') {
        str = String(str || '');
    }
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
    // Also handle string "null" and "undefined" that might be in corrupted data
    const isRootLevel = parentId === null || parentId === undefined;
    if (isRootLevel) {
        return items.filter(item => {
            const itemParent = item.parentId;
            return itemParent === null || itemParent === undefined;
        });
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
    
    // Groups can only be at root level
    if (item.type === 'group' && targetParentId !== null && targetParentId !== undefined) {
        showToast('Groups can only exist at root level', 'error');
        closeMoveModal();
        return;
    }
    
    // Only links can be moved into groups
    if (item.type === 'link' && targetParentId !== null && targetParentId !== undefined) {
        const targetGroup = getItemById(targetParentId);
        if (!targetGroup || targetGroup.type !== 'group') {
            showToast('Can only move links into groups', 'error');
            closeMoveModal();
            return;
        }
    }
    
    // Don't move if already there
    if (item.parentId === targetParentId) {
        showToast('Item is already in this location', 'info');
        closeMoveModal();
        return;
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
    if (!item) {
        closeMoveModal();
        return;
    }
    
    // Groups can only be at root level, so they don't get move options
    if (item.type === 'group') {
        showToast('Groups can only exist at root level', 'error');
        closeMoveModal();
        return;
    }
    
    const groups = getAllGroups(); // All groups are root level now
    
    // Build group options - flat list since no subgroups
    let html = `
        <div class="space-y-1">
            <button onclick="moveItemToGroup(${itemId}, null)" 
                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors ${(item.parentId === null || item.parentId === undefined) ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-300'}">
                <i data-lucide="home" class="w-4 h-4 inline mr-2"></i>
                Root (no group)
            </button>
    `;
    
    // Render all groups at same level (no indentation needed)
    groups.forEach(group => {
        const isCurrentParent = item.parentId === group.id;
        // Ensure group name is valid
        const groupName = (group.name && typeof group.name === 'string' && group.name !== 'undefined' && group.name !== 'null')
            ? group.name 
            : 'Untitled Group';
        const safeName = escapeHtml(groupName);
        html += `
            <button onclick="moveItemToGroup(${itemId}, ${group.id})" 
                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors ${isCurrentParent ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-300'}">
                <i data-lucide="folder" class="w-4 h-4 inline mr-2 text-indigo-400 ml-2"></i>
                ${safeName}
            </button>
        `;
    });
    
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
        // Ensure name is valid for display - handle all corruption cases
        let displayName = 'Untitled Group';
        if (item.name && typeof item.name === 'string') {
            const cleanName = item.name.trim();
            if (cleanName && cleanName !== 'undefined' && cleanName !== 'null' && cleanName !== 'undefinednull') {
                displayName = cleanName;
            }
        }
        textP.textContent = `Delete "${displayName}" and all ${childCount} items inside? This action cannot be undone.`;
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

// Subgroup functionality removed - groups can only exist at root level

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
    // At root level (parentId is null/undefined), render both groups and links
    // Inside groups, only render links (no subgroups)
    const isRoot = parentId === null || parentId === undefined;
    
    const children = items.filter(item => {
        if (isRoot) {
            return item.parentId === null || item.parentId === undefined;
        }
        return item.parentId === parentId;
    });
    
    if (children.length === 0) return '';
    
    let html = '';
    
    children.forEach((item, index) => {
        if (item.type === 'group') {
            // Only render groups at root level
            if (isRoot) {
                html += renderGroup(item, level, index, children.length);
            }
            // Skip subgroups - they shouldn't exist but ignore them if they do
        } else {
            html += renderLink(item, level, index, children.length);
        }
    });
    
    return html;
}

// Render only links inside groups (no subgroups allowed)
function renderGroupChildren(groupId) {
    const children = items.filter(item => item.parentId === groupId && item.type === 'link');
    
    if (children.length === 0) {
        return '<div class="text-center py-4 text-slate-500 text-sm italic">Drop links here</div>';
    }
    
    let html = '';
    children.forEach((item, index) => {
        html += renderLink(item, 1, index, children.length);
    });
    
    return html;
}

function renderGroup(group, level, index, totalSiblings) {
    const indentClass = `indent-level-${Math.min(level, 5)}`;
    const children = getChildren(group.id);
    const hasChildren = children.length > 0;
    const expandIcon = group.isExpanded ? 'chevron-down' : 'chevron-right';
    const childrenClass = group.isExpanded ? 'expanded' : 'collapsed';
    // Ensure group.name is a valid string - handle all corruption cases including "undefinednull"
    let groupName = group.name;
    if (typeof groupName !== 'string') {
        groupName = String(groupName || '');
    }
    if (!groupName || groupName === 'undefined' || groupName === 'null' || groupName === 'undefinednull' || groupName === 'nullundefined' || !groupName.trim()) {
        groupName = 'Untitled Group';
    }
    const safeName = escapeHtml(groupName);
    const safeJsName = escapeJsString(groupName);
    
    // Only show expand/collapse if group has children
    const expandButton = hasChildren ? `
        <button onclick="toggleGroup(${group.id})" 
                class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-600 transition-colors text-slate-400 hover:text-white"
                title="${group.isExpanded ? 'Collapse' : 'Expand'}">
            <i data-lucide="${expandIcon}" class="w-4 h-4"></i>
        </button>
    ` : '<div class="w-6"></div>';
    
    return `
        <div class="group-item ${indentClass}" data-id="${group.id}" data-type="group" draggable="true">
            <div class="bg-slate-800/90 rounded-xl border border-slate-700 hover:border-indigo-500/50 transition-all duration-200 overflow-hidden">
                <!-- Group Header -->
                <div class="flex items-center gap-3 p-3 bg-slate-700/30">
                    <!-- Drag Handle -->
                    <div class="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-700" data-drag-handle>
                        <i data-lucide="grip-vertical" class="w-4 h-4"></i>
                    </div>
                    
                    ${expandButton}
                    
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
                        <button onclick="deleteItem(${group.id})" 
                                class="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                title="Delete group">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Children Container - Only links allowed inside, no subgroups -->
                <div class="group-children ${childrenClass} bg-slate-800/30">
                    ${renderGroupChildren(group.id)}
                </div>
            </div>
        </div>
    `;
}

function renderLink(link, level, index, totalSiblings) {
    const indentClass = `indent-level-${Math.min(level, 5)}`;
    const domain = getDomainFromURL(link.url) || 'Unknown';
    const isLong = link.url && link.url.length > 50;
    const displayUrl = isLong ? link.url.substring(0, 50) + '...' : (link.url || '');
    
    // Ensure title is a valid string - handle all corruption cases
    let title = link.title;
    if (typeof title !== 'string') title = String(title || '');
    if (title === 'undefined' || title === 'null' || title === 'undefinednull' || title === 'nullundefined' || !title.trim()) {
        title = domain || 'Untitled';
    }
    
    const safeTitle = escapeHtml(title);
    const safeUrl = escapeHtml(link.url || '');
    const safeDisplayUrl = escapeHtml(displayUrl);
    const safeJsTitle = escapeJsString(title);
    const safeJsUrl = escapeJsString(link.url || '');
    
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
                
                <!-- Actions - Always visible on mobile, hover on desktop -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity action-buttons">
                    <button onclick="copyToClipboard('${safeJsUrl}', this)" 
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
    
    // Allow dropping on group headers to move links into that group
    // Note: Groups themselves can be dragged (for reordering at root level),
    // but can only be dropped on the root container, not on other groups
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
    const isValidTarget = targetParentId !== null && targetParentId !== undefined;
    if (draggedItemData.type === 'group' && isValidTarget) {
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
    
    const draggedId = parseInt(draggedItem.dataset.id);
    const targetGroupId = parseInt(this.dataset.id);
    const draggedItemData = getItemById(draggedId);
    
    if (!draggedItemData) return;
    
    // Don't allow dropping a group onto itself or onto another group (no subgroups)
    if (draggedId === targetGroupId) return;
    
    // Don't allow dropping groups into groups (no subgroups allowed)
    if (draggedItemData.type === 'group') {
        // Groups can't be dropped onto other groups - they must stay at root level
        // Only allow reordering at root level via the container, not via group headers
        return;
    }
    
    // For links, don't allow dropping if already in this group
    if (draggedItemData.parentId === targetGroupId) {
        return;
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
    
    // Don't allow dropping groups onto group headers - groups must stay at root level
    // Groups should only be reordered by dropping on the root container, not on other groups
    if (draggedItemData.type === 'group') {
        return; // Silently ignore - groups can't be dropped onto other groups
    }
    
    // Only links can be dropped into groups
    if (draggedItemData.type !== 'link') {
        return;
    }
    
    // Don't allow dropping if item is already in this group
    if (draggedItemData.parentId === targetGroupId) {
        showToast('Link is already in this group', 'info');
        return;
    }
    
    // Move item to the target group
    draggedItemData.parentId = targetGroupId;
    
    // Remove from current position and add to end
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
    showToast('Link moved to group');
}

function saveItems() {
    // Always save to localStorage as backup
    localStorage.setItem('quickLinks', JSON.stringify(items));
    
    // Also save to cloud if user is logged in
    if (currentUser && firebaseDb) {
        saveToCloud();
    }
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
    
    // Reset classes
    toast.classList.remove('bg-emerald-500', 'bg-red-500', 'bg-blue-500');
    
    if (type === 'error') {
        toast.classList.add('bg-red-500');
        icon.setAttribute('data-lucide', 'x-circle');
    } else if (type === 'info') {
        toast.classList.add('bg-blue-500');
        icon.setAttribute('data-lucide', 'info');
    } else {
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
document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
});
