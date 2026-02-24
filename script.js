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

// State variables
let deleteIndex = null;
let deleteItemId = null;
let currentParentId = null;
let itemToMove = null;
let toastTimeout = null;
let currentUser = null;
let authMode = 'login';
let isOnline = navigator.onLine;

// Drag and Drop State
let draggedItem = null;

// Firebase configuration - replace with your own Firebase project config
// Get this from Firebase Console > Project Settings > General > Your apps > Web app
const firebaseConfig = {
    apiKey: "AIzaSyBkgua27JXdyJQaOxflB4QuVbjX1zRDuag",
    authDomain: "links-25539.firebaseapp.com",
    projectId: "links-25539",
    storageBucket: "links-25539.firebasestorage.app",
    messagingSenderId: "263012790691",
    appId: "1:263012790691:web:752314c03c0d6eafc36a16",
    measurementId: "G-TM7S5967ML"
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
    
    if (user) {
        // User is signed in
        document.getElementById('authButtons').classList.add('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('userEmail').textContent = sanitizeString(user.email);
        updateSyncStatus('syncing');
        
        // Load from cloud
        loadFromCloud(user.uid);
        
        // Setup real-time sync
        setupCloudSync(user.uid);
    } else {
        // User is signed out
        document.getElementById('authButtons').classList.remove('hidden');
        document.getElementById('userInfo').classList.add('hidden');
        document.getElementById('userEmail').textContent = '';
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
        syncStatus.textContent = 'Local';
        syncStatus.className = 'text-neutral-400 text-xs';
    } else if (status === 'syncing') {
        syncStatus.textContent = 'Syncing...';
        syncStatus.className = 'text-neutral-600 text-xs';
    } else if (status === 'synced') {
        syncStatus.textContent = 'Synced';
        syncStatus.className = 'text-neutral-900 text-xs';
    } else if (status === 'offline') {
        syncStatus.textContent = 'Offline';
        syncStatus.className = 'text-neutral-500 text-xs';
    } else if (status === 'error') {
        syncStatus.textContent = 'Error';
        syncStatus.className = 'text-red-500 text-xs';
    }
}

async function loadFromCloud(userId) {
    if (!firebaseDb || !userId) return;
    
    try {
        const doc = await firebaseDb.collection('users').doc(userId).get();
        
        if (doc.exists) {
            const data = doc.data();
            if (data.items && Array.isArray(data.items)) {
                // Sanitize all loaded items to prevent corruption
                items = data.items.map(item => ({
                    ...item,
                    title: sanitizeString(item.title, 'Untitled'),
                    name: sanitizeString(item.name, 'Untitled Group'),
                    url: sanitizeURL(item.url || '')
                }));
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
        showToast('Failed to sync from cloud', 'error');
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
        title.textContent = 'log/n';
        actionBtn.textContent = 'log/n';
        toggleBtn.textContent = "don't have an account? reg/ster";
    } else {
        title.textContent = 'reg/ster';
        actionBtn.textContent = 'reg/ster';
        toggleBtn.textContent = 'already have an account? log/n';
    }
    
    hideAuthError();
}

function showAuthError(message) {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = sanitizeString(message);
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
        
        // Sanitize name for groups
        let name = sanitizeString(item.name, 'Untitled Group');
        if (name !== item.name) hasChanges = true;
        
        // Sanitize title for links
        let title = sanitizeString(item.title, 'Untitled');
        if (title !== item.title) hasChanges = true;
        
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
        
        // Sanitize URL for links
        let url = item.url;
        if (type === 'link' && url) {
            url = sanitizeURL(url);
            if (url !== item.url) hasChanges = true;
        }
        
        return {
            ...item,
            id,
            type,
            name,
            title,
            url,
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

// String sanitizer to prevent undefined/null corruption
function sanitizeString(str, defaultValue = '') {
    // Handle non-string input
    if (str === null || str === undefined) {
        return defaultValue;
    }
    
    if (typeof str !== 'string') {
        // Convert to string, but check for object types that might be problematic
        try {
            str = String(str);
        } catch (e) {
            return defaultValue;
        }
    }
    
    // Trim whitespace
    str = str.trim();
    
    // Check for empty, null, undefined strings and their combinations (case-insensitive)
    const lowerStr = str.toLowerCase();
    const corruptionPatterns = [
        'undefined', 'null', 'undefinednull', 'nullundefined',
        'undefined null', 'null undefined', '""', "''", '""null',
        'null""', 'nan', '[object object]', 'undefinedundefined',
        'nullnull', 'null undefined null', 'undefined null undefined'
    ];
    
    if (!str || corruptionPatterns.includes(lowerStr)) {
        return defaultValue;
    }
    
    // Clean up mixed corruption patterns (case-insensitive)
    let cleaned = str;
    
    // Aggressively remove corruption patterns
    cleaned = cleaned.replace(/undefined/gi, '');
    cleaned = cleaned.replace(/null/gi, '');
    cleaned = cleaned.replace(/""/g, '');
    cleaned = cleaned.replace(/''/g, '');
    cleaned = cleaned.replace(/\[object object\]/gi, '');
    
    // Clean up any resulting double spaces or remaining artifacts
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Check if we ended up with nothing or just whitespace
    if (!cleaned) {
        return defaultValue;
    }
    
    // Final verification check
    const finalCheck = cleaned.toLowerCase();
    if (corruptionPatterns.includes(finalCheck)) {
        return defaultValue;
    }
    
    // Check for partial corruption (contains undefined or null as substring)
    if (finalCheck.includes('undefined') || finalCheck.includes('null')) {
        // Try one more aggressive cleanup
        cleaned = cleaned.replace(/undefined/gi, '').replace(/null/gi, '').trim();
        if (!cleaned) return defaultValue;
    }
    
    return cleaned;
}

// URL sanitizer with tracking parameter removal
function sanitizeURL(url) {
    if (typeof url !== 'string') return '';
    let cleaned = sanitizeString(url);
    if (!cleaned) return '';
    
    // Ensure protocol is present
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        cleaned = 'https://' + cleaned;
    }
    
    try {
        const urlObj = new URL(cleaned);
        // Only allow http and https protocols
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            return '';
        }
        
        // Remove tracking parameters
        const trackingParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
            'fbclid', 'gclid', 'gclsrc', 'dclid', 'wbraid', 'gbraid', 'ttclid',
            'twclid', 'msclkid', 'li_fat_id', 'mc_cid', 'mc_eid', 'ml_subscriber',
            'ml_subscriber_hash', 'ref', 'referrer', 'source', 'aff_id', 'affiliate',
            'click_id', 'sub_id', 'pid', 'cid', 'sid', 'rid', 'uid', 'vid',
            'fb_source', 'fb_action_ids', 'fb_comment_id', 'utm_place', 'rd_cid',
            'epik', 'sck', 'snr', 'si', 'feature', 'ab_channel', 'gad_source',
            'gclid', 'dclid', 'zanpid', 'wickedid', 'vmcid', 'vmid', 'sb_referer_host',
            'mkwid', 'pcrid', 'ef_id', 's_kwcid', 'dm_i', 'pd_rd', 'trk_contact',
            'trk_msg', 'trk_module', 'trk_sid', 'ncid', 'n_cid', 'ssp_iab', 'ssp_iab',
            'vero_id', 'vgo_ee', 'hsCtaTracking', 'ttclid', 'irclickid', 'irgwc',
            'wbraid', 'gbraid', 'wickedid', 'oly_anon_id', 'oly_enc_id', 'itm_source',
            'itm_medium', 'itm_campaign', 'itm_term', 'itm_content', 'pk_campaign',
            'pk_kwd', 'pk_keyword', 'pk_source', 'pk_medium', 'pk_content', 'pk_cid',
            'piwik_campaign', 'piwik_kwd', 'piwik_keyword', 'matomo_campaign',
            'matomo_kwd', 'matomo_keyword', 'mtm_source', 'mtm_medium', 'mtm_campaign',
            'mtm_keyword', 'mtm_content', 'mtm_cid', 'mtm_group', 'mtm_placement',
            'utm_expid', 'utm_referrer', 'hsa_cam', 'hsa_grp', 'hsa_mt', 'hsa_src',
            'hsa_ad', 'hsa_acc', 'hsa_net', 'hsa_kw', 'hsa_tgt', 'hsa_la', 'hsa_ol',
            'hsa_ver', '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp'
        ];
        
        trackingParams.forEach(param => {
            urlObj.searchParams.delete(param);
        });
        
        // Remove empty search params
        if (!urlObj.search || urlObj.search === '?') {
            urlObj.search = '';
        }
        
        return urlObj.toString();
    } catch (e) {
        return cleaned;
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

    // Sanitize URL and remove trackers
    let formattedURL = sanitizeURL(url);
    
    if (!formattedURL || !isValidURL(formattedURL)) {
        showError('Please enter a valid URL (e.g., https://example.com)');
        return;
    }

    // Check for duplicates at root level only (simplification)
    const existing = items.find(item => item.type === 'link' && item.url === formattedURL);
    if (existing) {
        showError('This link already exists!');
        return;
    }

    // Sanitize title
    title = sanitizeString(title);
    
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
    const rawName = document.getElementById('groupNameInput').value;
    const name = sanitizeString(rawName, 'Untitled Group');
    
    const newGroup = {
        id: Date.now(),
        type: 'group',
        name: name,
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
                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors ${(item.parentId === null || item.parentId === undefined) ? 'bg-white/10 text-white' : 'text-gray-300'}">
                <i data-lucide="home" class="w-4 h-4 inline mr-2"></i>
                Root (no group)
            </button>
    `;
    
    // Render all groups at same level (no indentation needed)
    groups.forEach(group => {
        const isCurrentParent = item.parentId === group.id;
        // Use sanitizeString to ensure group name is clean
        const groupName = sanitizeString(group.name, 'Untitled Group');
        const safeName = escapeHtml(groupName);
        html += `
            <button onclick="moveItemToGroup(${itemId}, ${group.id})" 
                    class="w-full text-left px-3 py-2 rounded-sm hover:bg-white/10 transition-colors ${isCurrentParent ? 'bg-white/10 text-white' : 'text-gray-300'}">
                <i data-lucide="folder" class="w-4 h-4 inline mr-2 text-gray-400 ml-2"></i>
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
        item.title = sanitizeString(newTitle, getDomainFromURL(item.url));
        saveItems();
        renderLinks();
    }
}

function editGroupName(id, newName) {
    const group = getItemById(id);
    if (group && group.type === 'group') {
        group.name = sanitizeString(newName, 'Untitled Group');
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
        // Use sanitizeString to ensure name is clean
        const displayName = sanitizeString(item.name, 'Untitled Group');
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
        } else {
            // Delete single item by ID instead of index to avoid index mismatch issues
            items = items.filter(i => i.id !== deleteItemId);
        }
        
        // Sanitize all remaining items to ensure no corruption from deletion
        items = items.map(item => ({
            ...item,
            title: sanitizeString(item.title, item.type === 'link' ? 'Untitled' : 'Untitled Group'),
            name: sanitizeString(item.name, 'Untitled Group'),
            url: item.type === 'link' ? sanitizeURL(item.url || '') : undefined
        }));
        
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
        
        // Visual feedback on button - artistic style
        button.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-500"></i>`;
        button.classList.remove('text-neutral-400', 'hover:text-neutral-700', 'hover:bg-neutral-100');
        button.classList.add('text-emerald-600', 'bg-emerald-50', 'scale-110');
        lucide.createIcons();
        
        // Show toast
        showToast();
        
        // Reset button after 2 seconds
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('text-emerald-600', 'bg-emerald-50', 'scale-110');
            button.classList.add('text-neutral-400', 'hover:text-neutral-700', 'hover:bg-neutral-100');
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

// Additional drag state
let dragOverItem = null;
let dragOverPosition = null;

function renderLinks() {
    const container = document.getElementById('linksContainer');
    const linkCount = document.getElementById('linkCount');
    const groupCount = document.getElementById('groupCount');
    const clearBtn = document.getElementById('clearAllBtn');
    const newGroupBtn = document.getElementById('newGroupBtn');
    
    // Ensure items is an array and sanitize all items before rendering
    if (!Array.isArray(items)) {
        items = [];
    }
    
    // Extra safety: sanitize all items before rendering to catch any corruption
    items = items.map(item => ({
        ...item,
        title: sanitizeString(item.title, 'Untitled'),
        name: sanitizeString(item.name, 'Untitled Group'),
        url: sanitizeURL(item.url || '')
    }));
    
    const links = items.filter(i => i.type === 'link');
    const groups = items.filter(i => i.type === 'group');
    
    // Update stats
    linkCount.textContent = links.length;
    groupCount.textContent = groups.length;
    
    if (items.length === 0) {
        // Always clear and recreate empty state fresh to prevent any corruption or styling issues
        container.innerHTML = '';
        
        const emptyState = document.createElement('div');
        emptyState.id = 'emptyState';
        emptyState.className = 'text-center py-24 bg-[#0a0a0a]/40 rounded-sm border border-dashed border-white/10 hover:border-white/20 transition-all duration-700';
        emptyState.innerHTML = `
            <div class="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#262626]/50 to-[#171717]/50 rounded-sm mb-8 border border-white/5">
                <i data-lucide="link" class="w-6 h-6 text-gray-500 opacity-50"></i>
            </div>
            <p class="text-gray-300 font-light text-sm tracking-widest uppercase">empty</p>
        `;
        
        container.appendChild(emptyState);
        clearBtn.classList.add('hidden');
        newGroupBtn.classList.add('hidden');
        lucide.createIcons();
        return;
    }
    
    clearBtn.classList.remove('hidden');
    newGroupBtn.classList.remove('hidden');
    
    // Render hierarchical structure
    const rootItems = items.filter(item => item.parentId === null || item.parentId === undefined);
    
    let html = '';
    if (rootItems.length === 0 && items.length > 0) {
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
    
    lucide.createIcons();
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
    // Double-sanitize to ensure no corruption gets through
    const groupName = sanitizeString(group.name, 'Untitled Collection');
    const safeName = escapeHtml(groupName);
    const safeJsName = escapeJsString(groupName);
    
    const expandButton = hasChildren ? `
        <button onclick="toggleGroup(${group.id})" 
                class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-sm hover:bg-white/10 transition-all duration-500 text-gray-400 hover:text-white"
                title="${group.isExpanded ? 'Collapse' : 'Expand'}">
            <i data-lucide="${expandIcon}" class="w-4 h-4 opacity-60"></i>
        </button>
    ` : '<div class="w-8"></div>';
    
    return `
        <div class="group-item ${indentClass} animate-emerge hover-lift" data-id="${group.id}" data-type="group" draggable="true" style="animation-delay: ${index * 0.1}s;">
            <div class="bg-[#0a0a0a]/60 backdrop-blur-sm rounded-sm border border-white/10 hover:border-white/20 transition-all duration-700 overflow-hidden">
                <!-- Group Header -->
                <div class="flex items-center gap-3 p-4 bg-gradient-to-r from-[#141414]/80 to-[#0a0a0a]/60">
                    <!-- Drag Handle -->
                    <div class="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 p-2 rounded-sm hover:bg-white/5 transition-all duration-500" data-drag-handle>
                        <i data-lucide="grip-vertical" class="w-4 h-4 opacity-50"></i>
                    </div>
                    
                    ${expandButton}
                    
                    <!-- Icon -->
                    <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-[#262626]/60 to-[#171717]/50 rounded-sm flex items-center justify-center text-white shadow-sm opacity-80 border border-white/5">
                        <i data-lucide="folder" class="w-4 h-4 opacity-70"></i>
                    </div>
                    
                    <!-- Name -->
                    <div class="flex-1 min-w-0" id="title-container-${group.id}">
                        <div class="flex items-center gap-3">
                            <h3 class="text-white font-light truncate text-sm tracking-wide" title="${safeName}">${safeName}</h3>
                            <span class="text-xs text-gray-500 bg-white/5 px-2.5 py-1 rounded-sm font-light">${getAllDescendants(group.id).length}</span>
                            <button onclick="startEditingTitle(${group.id}, '${safeJsName}')" 
                                    class="opacity-0 group-hover:opacity-100 transition-all duration-500 p-2 rounded-sm hover:bg-white/10 text-gray-400 hover:text-white"
                                    title="Rename">
                                <i data-lucide="pencil" class="w-3.5 h-3.5 opacity-60"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Actions -->
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-500">
                        <button onclick="deleteItem(${group.id})" 
                                class="p-2 rounded-sm hover:bg-white/10 text-gray-400 hover:text-red-400 transition-all duration-500"
                                title="Remove">
                            <i data-lucide="trash-2" class="w-4 h-4 opacity-60"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Children Container -->
                <div class="group-children ${childrenClass} bg-black/20 border-t border-white/5">
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
    
    // Double-sanitize to ensure no corruption gets through
    const title = sanitizeString(link.title, sanitizeString(domain, 'Untitled'));
    
    const safeTitle = escapeHtml(title);
    const safeUrl = escapeHtml(sanitizeString(link.url, ''));
    const safeDisplayUrl = escapeHtml(sanitizeString(displayUrl, ''));
    const safeJsTitle = escapeJsString(title);
    const safeJsUrl = escapeJsString(sanitizeString(link.url, ''));
    
    return `
        <div class="link-item ${indentClass} bg-[#0a0a0a]/60 backdrop-blur-sm rounded-sm border border-white/10 hover:border-white/20 transition-all duration-700 overflow-hidden group animate-emerge hover-lift" 
             data-id="${link.id}" data-type="link" draggable="true" style="animation-delay: ${index * 0.1}s;">
            <div class="flex items-center gap-3 p-4 bg-gradient-to-r from-[#141414]/60 to-[#0a0a0a]/40">
                <!-- Drag Handle -->
                <div class="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 p-2 rounded-sm hover:bg-white/5 transition-all duration-500" data-drag-handle>
                    <i data-lucide="grip-vertical" class="w-4 h-4 opacity-50"></i>
                </div>
                
                <!-- Favicon -->
                <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-[#262626]/60 to-[#171717]/50 rounded-sm flex items-center justify-center text-gray-400 shadow-sm border border-white/5">
                    <i data-lucide="link" class="w-4 h-4 opacity-70"></i>
                </div>
                
                <!-- Link Info -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3" id="title-container-${link.id}">
                        <h3 class="text-white font-light truncate text-sm tracking-wide" title="${safeTitle}">${safeTitle}</h3>
                        <button onclick="startEditingTitle(${link.id}, '${safeJsTitle}')" 
                                class="opacity-0 group-hover:opacity-100 transition-all duration-500 p-2 rounded-sm hover:bg-white/10 text-gray-400 hover:text-white"
                                title="Edit title">
                            <i data-lucide="pencil" class="w-3.5 h-3.5 opacity-60"></i>
                        </button>
                    </div>
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" 
                       class="block text-gray-500 text-xs truncate hover:text-gray-300 transition-colors duration-500 font-light mt-0.5" 
                       title="${safeUrl}">
                        ${safeDisplayUrl}
                    </a>
                </div>
                
                <!-- Actions -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-500">
                    <button onclick="copyToClipboard('${safeJsUrl}', this)" 
                            class="p-2 rounded-sm hover:bg-white/10 text-gray-400 hover:text-white transition-all duration-500"
                            title="Copy to clipboard">
                        <i data-lucide="copy" class="w-4 h-4 opacity-60"></i>
                    </button>
                    <button onclick="openMoveModal(${link.id})" 
                            class="p-2 rounded-sm hover:bg-white/10 text-gray-400 hover:text-white transition-all duration-500"
                            title="Move to group">
                        <i data-lucide="folder-input" class="w-4 h-4 opacity-60"></i>
                    </button>
                    <button onclick="deleteItem(${link.id})" 
                            class="p-2 rounded-sm hover:bg-white/10 text-gray-400 hover:text-red-400 transition-all duration-500"
                            title="Delete link">
                        <i data-lucide="trash-2" class="w-4 h-4 opacity-60"></i>
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
    
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    text.textContent = message;
    
    toast.classList.remove('bg-neutral-900', 'bg-red-600', 'bg-blue-600');
    
    if (type === 'error') {
        toast.classList.add('bg-red-600');
        icon.setAttribute('data-lucide', 'x-circle');
    } else if (type === 'info') {
        toast.classList.add('bg-blue-600');
        icon.setAttribute('data-lucide', 'info');
    } else {
        toast.classList.add('bg-neutral-900');
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
    
    const input = document.getElementById('linkInput');
    input.classList.add('border-red-500', 'ring-2', 'ring-red-100');
    
    setTimeout(() => {
        input.classList.remove('border-red-500', 'ring-2', 'ring-red-100');
    }, 2000);
}

function hideError() {
    const errorMsg = document.getElementById('errorMsg');
    errorMsg.classList.add('hidden');
}

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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDeleteModal();
        closeGroupModal();
        closeMoveModal();
        closeAuthModal();
    }
});
