/**
 * Tab manager for switching between Heightmap and 3D view
 */
export class TabManager {
    constructor(options = {}) {
        this.tabs = new Map();
        this.activeTabId = null;
        this._listeners = new Set();

        // DOM elements
        this.tabBarElement = options.tabBarElement || null;
        this.contentElement = options.contentElement || null;
    }

    /**
     * Register a tab
     * @param {string} id - Tab identifier
     * @param {object} config - Tab configuration
     * @param {string} config.label - Display label
     * @param {HTMLElement} config.content - Content element
     * @param {function} config.onActivate - Called when tab is activated
     * @param {function} config.onDeactivate - Called when tab is deactivated
     */
    registerTab(id, config) {
        this.tabs.set(id, {
            id,
            label: config.label || id,
            content: config.content,
            onActivate: config.onActivate || (() => {}),
            onDeactivate: config.onDeactivate || (() => {}),
            button: null
        });

        // Create tab button if tab bar exists
        if (this.tabBarElement) {
            this._createTabButton(id);
        }
    }

    /**
     * Create a tab button in the tab bar
     */
    _createTabButton(id) {
        const tab = this.tabs.get(id);
        if (!tab) return;

        const button = document.createElement('button');
        button.className = 'tab-btn';
        button.textContent = tab.label;
        button.dataset.tabId = id;
        button.addEventListener('click', () => this.activateTab(id));

        tab.button = button;
        this.tabBarElement.appendChild(button);
    }

    /**
     * Activate a tab by ID
     */
    activateTab(id) {
        if (this.activeTabId === id) return;

        const newTab = this.tabs.get(id);
        if (!newTab) {
            console.warn(`Tab "${id}" not found`);
            return;
        }

        // Deactivate current tab
        if (this.activeTabId) {
            const currentTab = this.tabs.get(this.activeTabId);
            if (currentTab) {
                currentTab.onDeactivate();
                if (currentTab.content) {
                    currentTab.content.classList.remove('active');
                    currentTab.content.style.display = 'none';
                }
                if (currentTab.button) {
                    currentTab.button.classList.remove('active');
                }
            }
        }

        // Activate new tab
        const previousTabId = this.activeTabId;
        this.activeTabId = id;

        newTab.onActivate();
        if (newTab.content) {
            newTab.content.classList.add('active');
            newTab.content.style.display = '';
        }
        if (newTab.button) {
            newTab.button.classList.add('active');
        }

        // Notify listeners
        this._notifyListeners(id, previousTabId);
    }

    /**
     * Get the active tab ID
     */
    getActiveTabId() {
        return this.activeTabId;
    }

    /**
     * Add a listener for tab changes
     */
    addListener(callback) {
        this._listeners.add(callback);
    }

    /**
     * Remove a listener
     */
    removeListener(callback) {
        this._listeners.delete(callback);
    }

    _notifyListeners(newTabId, previousTabId) {
        for (const listener of this._listeners) {
            listener(newTabId, previousTabId);
        }
    }

    /**
     * Initialize the tab manager with DOM elements
     */
    init(tabBarSelector, contentSelector) {
        this.tabBarElement = document.querySelector(tabBarSelector);
        this.contentElement = document.querySelector(contentSelector);

        // Create buttons for already registered tabs
        for (const [id] of this.tabs) {
            this._createTabButton(id);
        }
    }
}
