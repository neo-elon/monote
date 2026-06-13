// Safe localStorage wrapper for environments where localStorage is restricted (e.g., in-app browsers, private modes)
const storage = {
    _data: {},
    getItem(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            console.warn(`localStorage.getItem failed for "${key}":`, e);
            return this._data[key] || null;
        }
    },
    setItem(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {
            console.warn(`localStorage.setItem failed for "${key}":`, e);
            this._data[key] = String(value);
        }
    },
    removeItem(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (e) {
            console.warn(`localStorage.removeItem failed for "${key}":`, e);
            delete this._data[key];
        }
    }
};

// State Management
let projects = [];
let activeProjectId = null;
let project = null; // Active project reference
let activeChapterId = null;
let saveTimeout = null;
let currentUser = null;

// Supabase Config & Initialization
const supabaseUrl = 'https://opucvfqiavvcujtzwzvz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdWN2ZnFpYXZ2Y3VqdHp3enZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODE3NzksImV4cCI6MjA5Njg1Nzc3OX0.-zLSHjeHvaW5eHRTH9eC7CcFWnwlWBKbgzlc-9Fzceg';
let supabaseClient = null;

if (typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// Sync Status UI helper
function updateSyncStatus(status, message) {
    const badge = document.getElementById('cloud-sync-status');
    if (!badge) return;
    const text = badge.querySelector('.sync-text');
    if (!text) return;
    
    badge.className = 'sync-status ' + status; // success, syncing, error
    text.textContent = message;
}

async function saveProjectToCloud(proj) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient
        .from('open_projects')
        .upsert({
            id: proj.id,
            title: proj.title,
            synopsis: proj.synopsis || '',
            ideas: proj.ideas || '',
            chapters: proj.chapters || [],
            cover_color: proj.coverColor || 'charcoal',
            updated_at: proj.updatedAt || new Date().toISOString(),
            created_at: proj.createdAt || new Date().toISOString()
        });
    if (error) throw error;
}

// DOM Elements
const bookshelfScreen = document.getElementById('bookshelf-screen');
const overviewScreen = document.getElementById('overview-screen');
const writingScreen = document.getElementById('writing-screen');
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.querySelector('.sun-icon');
const moonIcon = document.querySelector('.moon-icon');
const exportProjectBtn = document.getElementById('export-project');
const exportProjectTxtBtn = document.getElementById('export-project-txt');
const importProjectTrigger = document.getElementById('import-project-trigger');
const importProjectFile = document.getElementById('import-project-file');
const goToBookshelfBtn = document.getElementById('logo-area');

// Overview Elements
const projectTitleInput = document.getElementById('project-title');
const projectSynopsisTextarea = document.getElementById('project-synopsis');
const synopsisWordCount = document.getElementById('synopsis-word-count');
const projectIdeasTextarea = document.getElementById('project-ideas');
const ideasWordCount = document.getElementById('ideas-word-count');
const addChapterBtn = document.getElementById('add-chapter-btn');
const chaptersList = document.getElementById('chapters-list');

// Editor Elements
const backToOverviewBtn = document.getElementById('back-to-overview');
const spellCheckBtn = document.getElementById('spell-check-btn');
const exportChapterBtn = document.getElementById('export-chapter');
const deleteChapterBtn = document.getElementById('delete-chapter');
const chapterTitleInput = document.getElementById('chapter-title');
const chapterNumberBadge = document.getElementById('chapter-number-badge');
const chapterContentTextarea = document.getElementById('chapter-content');
const charCountWithSpaces = document.getElementById('char-count-with-spaces');
const charCountNoSpaces = document.getElementById('char-count-no-spaces');
const wordCountElement = document.getElementById('word-count');
const saveStatus = document.getElementById('save-status');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    loadTheme();
    if (supabaseClient) {
        await checkAuthState();
    }
    await loadProjects();
    setupEventListeners();
    renderBookshelf();
    // Initially in bookshelf mode: show import/export, hide txt export
    if (importProjectTrigger) importProjectTrigger.style.display = '';
    if (exportProjectBtn) exportProjectBtn.style.display = '';
    if (exportProjectTxtBtn) exportProjectTxtBtn.style.display = 'none';
    
    // Restore previous active project/chapter state
    restoreActiveState();
});

// Load Theme from LocalStorage
function loadTheme() {
    const savedTheme = storage.getItem('monote-theme') || 'light-mode';
    document.body.className = savedTheme;
    updateThemeIcons(savedTheme);
}

// Update Theme Icons
function updateThemeIcons(theme) {
    if (theme === 'dark-mode') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
}

// Load Projects and handle Migration
async function loadProjects() {
    const savedProjects = storage.getItem('monote-projects');
    if (savedProjects) {
        try {
            projects = JSON.parse(savedProjects);
        } catch (e) {
            console.error("Failed to parse projects data:", e);
            projects = [];
        }
    } else {
        projects = [];
    }

    // Migration from old single-project structure
    const savedOldProject = storage.getItem('monote-project');
    if (savedOldProject) {
        try {
            const oldProject = JSON.parse(savedOldProject);
            if (oldProject && (oldProject.title || (oldProject.chapters && oldProject.chapters.length > 0))) {
                // Migrate to new structure
                const migrated = {
                    id: Date.now().toString(),
                    title: oldProject.title || '임시 작품',
                    synopsis: oldProject.synopsis || '',
                    ideas: oldProject.ideas || '',
                    chapters: oldProject.chapters || [],
                    coverColor: 'charcoal',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                projects.push(migrated);
                storage.setItem('monote-projects', JSON.stringify(projects));
            }
        } catch (e) {
            console.error("Failed to migrate old project:", e);
        }
        // Remove old key so we don't migrate again
        storage.removeItem('monote-project');
    }

    renderBookshelf();

    // Fetch from Supabase
    if (supabaseClient) {
        updateSyncStatus('syncing', '불러오는 중...');
        try {
            const { data, error } = await supabaseClient
                .from('open_projects')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                projects = data.map(dbProj => ({
                    id: dbProj.id,
                    title: dbProj.title,
                    synopsis: dbProj.synopsis || '',
                    ideas: dbProj.ideas || '',
                    chapters: typeof dbProj.chapters === 'string' ? JSON.parse(dbProj.chapters) : (dbProj.chapters || []),
                    coverColor: dbProj.cover_color || 'charcoal',
                    createdAt: dbProj.created_at,
                    updatedAt: dbProj.updated_at
                }));
                storage.setItem('monote-projects', JSON.stringify(projects));
                renderBookshelf();
                updateSyncStatus('success', '동기화 완료');
            } else {
                // Cloud is empty, if we have local projects, push them to cloud
                if (projects.length > 0) {
                    updateSyncStatus('syncing', '동기화 중...');
                    for (const proj of projects) {
                        await saveProjectToCloud(proj);
                    }
                }
                updateSyncStatus('success', '동기화 완료');
            }
        } catch (err) {
            console.error('Failed to sync with Supabase:', err);
            updateSyncStatus('error', '로컬 모드');
        }
    } else {
        updateSyncStatus('error', '로컬 모드');
    }
}

// Save Data to LocalStorage with Debounce
function triggerSave() {
    if (!activeProjectId) return;
    
    saveStatus.textContent = "저장 중...";
    saveStatus.style.opacity = "1";
    
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(async () => {
        // Find index of current project
        const idx = projects.findIndex(p => p.id === activeProjectId);
        if (idx !== -1) {
            project.updatedAt = new Date().toISOString();
            projects[idx] = project;
            storage.setItem('monote-projects', JSON.stringify(projects));
        }
        saveStatus.textContent = "저장 완료";
        
        // Sync to Supabase
        if (supabaseClient) {
            updateSyncStatus('syncing', '동기화 중...');
            try {
                await saveProjectToCloud(project);
                updateSyncStatus('success', '동기화 완료');
            } catch (err) {
                console.error('Failed to save to cloud:', err);
                updateSyncStatus('error', '동기화 실패');
            }
        }
        
        setTimeout(() => {
            saveStatus.style.opacity = "0.7";
        }, 1000);
    }, 500);
}

// Set up UI Event Listeners
function setupEventListeners() {
    // Menu Dropdown Logic
    const menuBtn = document.getElementById('menu-btn');
    const menuDropdown = document.getElementById('menu-dropdown');
    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-dropdown-container')) {
                menuDropdown.classList.remove('show');
            }
        });

        menuDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                menuDropdown.classList.remove('show');
            });
        });
    }

    // Theme Toggle
    themeToggle.addEventListener('click', () => {
        if (document.body.classList.contains('light-mode')) {
            document.body.classList.replace('light-mode', 'dark-mode');
            storage.setItem('monote-theme', 'dark-mode');
            updateThemeIcons('dark-mode');
        } else {
            document.body.classList.replace('dark-mode', 'light-mode');
            storage.setItem('monote-theme', 'light-mode');
            updateThemeIcons('light-mode');
        }
    });

    // Project Info Listeners
    projectTitleInput.addEventListener('input', (e) => {
        project.title = e.target.value;
        triggerSave();
    });

    projectSynopsisTextarea.addEventListener('input', (e) => {
        project.synopsis = e.target.value;
        updateSynopsisCount();
        triggerSave();
    });

    projectIdeasTextarea.addEventListener('input', (e) => {
        project.ideas = e.target.value;
        updateIdeasCount();
        triggerSave();
    });

    // Chapter Management Listeners
    addChapterBtn.addEventListener('click', addNewChapter);
    backToOverviewBtn.addEventListener('click', showOverviewScreen);
    
    // Editor Listeners
    chapterTitleInput.addEventListener('input', (e) => {
        if (activeChapterId !== null) {
            const ch = project.chapters.find(c => c.id === activeChapterId);
            if (ch) {
                ch.title = e.target.value;
                triggerSave();
            }
        }
        adjustTitleHeight();
    });

    chapterContentTextarea.addEventListener('input', (e) => {
        if (activeChapterId !== null) {
            const ch = project.chapters.find(c => c.id === activeChapterId);
            if (ch) {
                ch.content = e.target.value;
                updateEditorCounts(e.target.value);
                triggerSave();
            }
        }
    });

    exportChapterBtn.addEventListener('click', () => {
        if (activeChapterId !== null) {
            exportChapter(activeChapterId);
        }
    });

    spellCheckBtn.addEventListener('click', () => {
        if (activeChapterId !== null) {
            const ch = project.chapters.find(c => c.id === activeChapterId);
            if (ch) {
                runSpellCheck(ch.content || '');
            }
        }
    });

    deleteChapterBtn.addEventListener('click', () => {
        if (activeChapterId !== null) {
            if (confirm("이 챕터를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.")) {
                deleteChapter(activeChapterId);
            }
        }
    });

    // Project Backup & Restore Listeners
    exportProjectBtn.addEventListener('click', exportProject);
    document.getElementById('export-project-txt').addEventListener('click', exportProjectTxt);
    importProjectTrigger.addEventListener('click', () => {
        importProjectFile.click();
    });
    importProjectFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importProject(e.target.files[0]);
        }
    });

    // Bookshelf Navigation & Event Listeners
    goToBookshelfBtn.addEventListener('click', showBookshelfScreen);
    
    document.getElementById('create-project-btn').addEventListener('click', showNewBookDialog);
    document.getElementById('cancel-new-book').addEventListener('click', hideNewBookDialog);
    document.getElementById('confirm-new-book').addEventListener('click', createNewProject);
    
    // Color picker active state toggle
    document.querySelectorAll('.cover-color-picker input[name="cover-color"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.cover-color-picker .color-option').forEach(opt => {
                opt.classList.remove('active');
            });
            e.target.closest('.color-option').classList.add('active');
        });
    });
}

// Render Overview View
function renderOverview() {
    projectTitleInput.value = project.title || '';
    projectSynopsisTextarea.value = project.synopsis || '';
    projectIdeasTextarea.value = project.ideas || '';
    updateSynopsisCount();
    updateIdeasCount();
    renderChapterList();
}

// Update Synopsis Character Count
function updateSynopsisCount() {
    const len = project.synopsis ? project.synopsis.length : 0;
    synopsisWordCount.textContent = `${len.toLocaleString()}자`;
}

// Update Ideas Character Count
function updateIdeasCount() {
    const len = project.ideas ? project.ideas.length : 0;
    ideasWordCount.textContent = `${len.toLocaleString()}자`;
}

// Helper to get prefix dynamically for any chapter based on its level
function getChapterPrefix(chapterId) {
    let partCount = 0;
    let chapterCount = 0;
    let sceneCount = 0;
    
    for (let i = 0; i < (project.chapters || []).length; i++) {
        const ch = project.chapters[i];
        const lvl = ch.level || 0;
        
        let prefix = '';
        if (lvl === 0) {
            partCount++;
            chapterCount = 0; sceneCount = 0;
            prefix = `${partCount}`;
        } else if (lvl === 1) {
            chapterCount++;
            sceneCount = 0;
            prefix = `${Math.max(1, partCount)}.${chapterCount}`;
        } else if (lvl === 2) {
            sceneCount++;
            prefix = `${Math.max(1, partCount)}.${Math.max(1, chapterCount)}.${sceneCount}`;
        }
        
        if (ch.id === chapterId) {
            return prefix;
        }
    }
    return '';
}

// Render the Chapter List Cards
function renderChapterList() {
    chaptersList.innerHTML = '';
    
    if (!project.chapters || project.chapters.length === 0) {
        chaptersList.innerHTML = `
            <div class="empty-chapters">
                아직 생성된 챕터가 없습니다. 오른쪽 상단의 '+ 챕터 추가' 버튼을 눌러 첫 글을 시작해 보세요.
            </div>
        `;
        return;
    }

    project.chapters.forEach((chapter, index) => {
        const card = document.createElement('div');
        // Fallback for missing level
        if (chapter.level === undefined) {
            chapter.level = 0;
        }
        // Force clamp to max level 2 (3 steps: 0, 1, 2)
        if (chapter.level > 2) {
            chapter.level = 2;
        }
        
        card.className = `chapter-card level-${chapter.level}`;
        card.dataset.id = chapter.id;
        card.setAttribute('draggable', 'true');
        
        // Calculate length details
        const charCount = chapter.content ? chapter.content.length : 0;
        const prefix = getChapterPrefix(chapter.id);
        
        // Generate tree dotted guide lines
        let treeLinesHtml = '<div class="tree-lines">';
        for (let l = 1; l <= chapter.level; l++) {
            const isConnector = (l === chapter.level);
            
            // Check if there is another chapter of level >= l below
            let hasSiblingBelow = false;
            for (let j = index + 1; j < project.chapters.length; j++) {
                const nextCh = project.chapters[j];
                if (nextCh.level < l) {
                    break;
                }
                if (nextCh.level >= l) {
                    hasSiblingBelow = true;
                    break;
                }
            }
            
            if (isConnector) {
                const connClass = hasSiblingBelow ? 'tree-line-branch' : 'tree-line-corner';
                treeLinesHtml += `<div class="tree-line ${connClass}"></div>`;
            } else {
                let needLine = false;
                for (let j = index + 1; j < project.chapters.length; j++) {
                    const nextCh = project.chapters[j];
                    if (nextCh.level < l) {
                        break;
                    }
                    if (nextCh.level >= l) {
                        needLine = true;
                        break;
                    }
                }
                if (needLine) {
                    treeLinesHtml += `<div class="tree-line tree-line-vertical"></div>`;
                } else {
                    treeLinesHtml += `<div class="tree-line tree-line-empty"></div>`;
                }
            }
        }
        treeLinesHtml += '</div>';
        
        card.innerHTML = `
            <div class="tree-indent-wrapper">
                ${treeLinesHtml}
                <span class="chapter-num-badge">${prefix}</span>
                <span class="chapter-card-title">${chapter.title || '제목 없음'}</span>
                <div class="tree-controls">
                    <button class="btn-tree-lvl rename-btn" title="이름 변경">✎</button>
                </div>
            </div>
            <span class="char-counter">${charCount.toLocaleString()}자</span>
        `;
        
        let isDragging = false;
        let touchStartCard = null;
        let touchStartIndex = index;
        let dragStartX = 0;
        let dragStartLevel = chapter.level || 0;
        let lastTouchX = 0;

        // Click to open editor (only if not dragging)
        card.addEventListener('click', (e) => {
            if (isDragging) return;
            openChapterEditor(chapter.id);
        });

        // Rename Button Event Listener
        const renameBtn = card.querySelector('.rename-btn');

        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            const newTitle = prompt("챕터 제목을 변경하시겠습니까?", chapter.title || '');
            if (newTitle !== null) {
                const trimmed = newTitle.trim();
                chapter.title = trimmed || '제목 없음';
                
                // If this chapter is currently active in the editor, update the editor's title input too
                if (activeChapterId === chapter.id) {
                    const chapterTitleInput = document.getElementById('chapter-title');
                    if (chapterTitleInput) {
                        chapterTitleInput.value = chapter.title;
                    }
                }
                
                triggerSave();
                renderChapterList();
            }
        });

        // Drag & Drop event handlers (Mouse / Desktop)
        card.addEventListener('dragstart', (e) => {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartLevel = chapter.level || 0;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', chapter.id);
        });

        card.addEventListener('drag', (e) => {
            if (e.clientX === 0) return; // Ignore dragend boundary coordinate
            const deltaX = e.clientX - dragStartX;
            let levelShift = Math.round(deltaX / 24);
            if (levelShift > 1) levelShift = 1;
            if (levelShift < -1) levelShift = -1;
            const tempLevel = Math.max(0, Math.min(2, dragStartLevel + levelShift));
            
            // Instantly update UI class to show dynamic indent and numbering styling
            card.className = `chapter-card level-${tempLevel} dragging`;
            const tempPrefix = getChapterPrefixForLvl(chapter.id, tempLevel);
            const badge = card.querySelector('.chapter-num-badge');
            if (badge) badge.textContent = tempPrefix;
        });

        card.addEventListener('dragend', (e) => {
            card.classList.remove('dragging');
            
            // Save final level shift based on end coordinate
            if (e.clientX !== 0) {
                const deltaX = e.clientX - dragStartX;
                let levelShift = Math.round(deltaX / 24);
                if (levelShift > 1) levelShift = 1;
                if (levelShift < -1) levelShift = -1;
                chapter.level = Math.max(0, Math.min(2, dragStartLevel + levelShift));
            }
            
            saveAndRefreshOrder();
            
            setTimeout(() => {
                isDragging = false;
            }, 100);
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingCard = document.querySelector('.dragging');
            if (!draggingCard || draggingCard === card) return;
            
            // Determine vertical position
            const rect = card.getBoundingClientRect();
            const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
            
            // Insert visual preview
            chaptersList.insertBefore(draggingCard, next ? card.nextSibling : card);
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
        });

        let touchStartY = 0;
        let hasMovedThreshold = false;
        let touchTimeout = null;
        let isLongPress = false;

        // Touch Drag & Drop event handlers (Mobile / Finger)
        card.addEventListener('touchstart', (e) => {
            touchStartCard = card;
            dragStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            lastTouchX = e.touches[0].clientX;
            dragStartLevel = chapter.level || 0;
            touchStartIndex = Array.from(chaptersList.children).indexOf(card);
            hasMovedThreshold = false;
            isDragging = false;
            isLongPress = false;
            
            // Clear text selection
            window.getSelection().removeAllRanges();

            // Start long press timeout (500ms)
            if (touchTimeout) clearTimeout(touchTimeout);
            touchTimeout = setTimeout(() => {
                isLongPress = true;
                isDragging = true;
                card.classList.add('dragging');
                if (navigator.vibrate) {
                    navigator.vibrate(40); // Subtle haptic feedback
                }
            }, 500);
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            if (!touchStartCard) return;
            
            const touch = e.touches[0];
            const currentY = touch.clientY;
            lastTouchX = touch.clientX;
            
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - touchStartY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // If user moves finger significantly before long press, cancel it (they are scrolling)
            if (distance > 8) {
                hasMovedThreshold = true;
                if (!isLongPress && touchTimeout) {
                    clearTimeout(touchTimeout);
                    touchTimeout = null;
                }
            }
            
            if (isLongPress && isDragging) {
                // Prevent standard screen scroll while reordering
                if (e.cancelable) e.preventDefault();
                
                // Prevent text selection highlight on move
                window.getSelection().removeAllRanges();
                
                // Horizontal shift calculation for live touch feedback
                let levelShift = Math.round(deltaX / 24);
                if (levelShift > 1) levelShift = 1;
                if (levelShift < -1) levelShift = -1;
                const tempLevel = Math.max(0, Math.min(2, dragStartLevel + levelShift));
                card.className = `chapter-card level-${tempLevel} dragging`;
                
                // Find element under current finger position
                const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elementUnder) {
                    const targetCard = elementUnder.closest('.chapter-card');
                    if (targetCard && targetCard !== card) {
                        const rect = targetCard.getBoundingClientRect();
                        const next = (currentY - rect.top) / (rect.bottom - rect.top) > 0.5;
                        
                        chaptersList.insertBefore(card, next ? targetCard.nextSibling : targetCard);
                    }
                }
            }
        }, { passive: false });

        card.addEventListener('touchend', (e) => {
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }
            
            if (!touchStartCard) return;
            
            card.classList.remove('dragging');
            touchStartCard = null;
            
            // Check if the user tapped inside the card controls (like the rename button)
            if (e.target.closest('.tree-controls')) {
                isDragging = false;
                isLongPress = false;
                return;
            }
            
            if (isLongPress && isDragging) {
                e.preventDefault(); // Prevent synthetic mouse/click events
                
                // Save final touch level shift
                const deltaX = lastTouchX - dragStartX;
                let levelShift = Math.round(deltaX / 24);
                if (levelShift > 1) levelShift = 1;
                if (levelShift < -1) levelShift = -1;
                chapter.level = Math.max(0, Math.min(2, dragStartLevel + levelShift));
                
                saveAndRefreshOrder();
                
                setTimeout(() => {
                    isDragging = false;
                    isLongPress = false;
                }, 100);
            } else if (!hasMovedThreshold) {
                // It was a simple tap, open the editor immediately
                openChapterEditor(chapter.id);
            }
        });

        card.addEventListener('touchcancel', (e) => {
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }
            card.classList.remove('dragging');
            touchStartCard = null;
            isDragging = false;
            isLongPress = false;
        });
        
        chaptersList.appendChild(card);
    });
}

// Helper to save order and refresh
function saveAndRefreshOrder() {
    const newChaptersOrder = [];
    const seenIds = new Set();
    const renderedCards = chaptersList.querySelectorAll('.chapter-card');
    renderedCards.forEach(cardEl => {
        const id = cardEl.dataset.id;
        if (id && !seenIds.has(id)) {
            const ch = project.chapters.find(c => c.id === id);
            if (ch) {
                newChaptersOrder.push(ch);
                seenIds.add(id);
            }
        }
    });
    project.chapters = newChaptersOrder;
    triggerSave();
    renderChapterList();
}

// Temporary prefix helper for live drag preview
function getChapterPrefixForLvl(chapterId, tempLevel) {
    let partCount = 0;
    let chapterCount = 0;
    let sceneCount = 0;
    
    for (let i = 0; i < (project.chapters || []).length; i++) {
        const ch = project.chapters[i];
        const lvl = ch.id === chapterId ? tempLevel : (ch.level || 0);
        
        let prefix = '';
        if (lvl === 0) {
            partCount++;
            chapterCount = 0; sceneCount = 0;
            prefix = `${partCount}`;
        } else if (lvl === 1) {
            chapterCount++;
            sceneCount = 0;
            prefix = `${Math.max(1, partCount)}.${chapterCount}`;
        } else if (lvl === 2) {
            sceneCount++;
            prefix = `${Math.max(1, partCount)}.${Math.max(1, chapterCount)}.${sceneCount}`;
        }
        
        if (ch.id === chapterId) {
            return prefix;
        }
    }
    return '';
}

// Add New Chapter
function addNewChapter() {
    const title = prompt("새 챕터의 제목을 입력하세요:", "");
    if (title === null) return; // Cancelled
    
    const newId = Date.now().toString();
    const newChapter = {
        id: newId,
        title: title.trim() || '제목 없음',
        content: '',
        level: 0
    };
    
    if (!project.chapters) {
        project.chapters = [];
    }
    
    project.chapters.push(newChapter);
    triggerSave();
    
    // Refresh the list to display the new card
    renderChapterList();
}

// Open Chapter Editor
function openChapterEditor(chapterId) {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    activeChapterId = chapterId;
    storage.setItem('monote-active-chapter-id', chapterId);
    
    // Set UI Values
    chapterNumberBadge.textContent = getChapterPrefix(chapterId);
    chapterTitleInput.value = chapter.title || '';
    chapterContentTextarea.value = chapter.content || '';
    
    // Update Character & Word Counts
    updateEditorCounts(chapter.content || '');
    // Switch Screen View
    showWritingScreen();

    // Adjust title height
    adjustTitleHeight();

    // Focus on the chapter title input so user can type immediately
    setTimeout(() => {
        chapterTitleInput.focus();
    }, 350);
}

// Update Editor Counts (With Space, No Space, Word Count)
function updateEditorCounts(text) {
    const lenWithSpaces = text.length;
    const lenNoSpaces = text.replace(/\s/g, '').length;
    
    // Calculate Word Count (using standard regex matching words/syllables)
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    
    charCountWithSpaces.textContent = `${lenWithSpaces.toLocaleString()}자`;
    charCountNoSpaces.textContent = `${lenNoSpaces.toLocaleString()}자`;
    wordCountElement.textContent = words.toLocaleString();
}

// Adjust chapter title textarea height dynamically to prevent scrollbars
function adjustTitleHeight() {
    if (chapterTitleInput) {
        chapterTitleInput.style.height = 'auto';
        // Add 4px buffer to prevent vertical clipping of serif fonts
        chapterTitleInput.style.height = (chapterTitleInput.scrollHeight + 4) + 'px';
    }
}

// View Switches
function showWritingScreen() {
    // Hide JSON import/export in project screens, show TXT export
    if (importProjectTrigger) importProjectTrigger.style.display = 'none';
    if (exportProjectBtn) exportProjectBtn.style.display = 'none';
    if (exportProjectTxtBtn) exportProjectTxtBtn.style.display = '';

    // Move chapters-panel to editor sidebar
    const chaptersPanel = document.getElementById('chapters-panel');
    const editorSidebar = document.getElementById('editor-sidebar');
    if (chaptersPanel && editorSidebar) {
        editorSidebar.appendChild(chaptersPanel);
    }

    overviewScreen.classList.remove('active');
    bookshelfScreen.classList.remove('active');
    setTimeout(() => {
        overviewScreen.style.display = 'none';
        bookshelfScreen.style.display = 'none';
        writingScreen.style.display = 'block';
        
        // Recalculate title height now that the editor view is visible
        adjustTitleHeight();
        
        setTimeout(() => {
            writingScreen.classList.add('active');
        }, 50);
    }, 300);
}

function showOverviewScreen() {
    // Hide JSON import/export in project screens, show TXT export
    if (importProjectTrigger) importProjectTrigger.style.display = 'none';
    if (exportProjectBtn) exportProjectBtn.style.display = 'none';
    if (exportProjectTxtBtn) exportProjectTxtBtn.style.display = '';

    // Move chapters-panel back to overview grid
    const chaptersPanel = document.getElementById('chapters-panel');
    const overviewGrid = document.querySelector('.overview-grid');
    if (chaptersPanel && overviewGrid) {
        overviewGrid.appendChild(chaptersPanel);
    }

    activeChapterId = null;
    storage.removeItem('monote-active-chapter-id');
    renderOverview();
    
    writingScreen.classList.remove('active');
    bookshelfScreen.classList.remove('active');
    setTimeout(() => {
        writingScreen.style.display = 'none';
        bookshelfScreen.style.display = 'none';
        overviewScreen.style.display = 'block';
        setTimeout(() => {
            overviewScreen.classList.add('active');
        }, 50);
    }, 300);
}

function showBookshelfScreen() {
    activeProjectId = null;
    project = null;
    storage.removeItem('monote-active-project-id');
    storage.removeItem('monote-active-chapter-id');
    
    // In bookshelf screen: show JSON import/export, hide txt export
    if (importProjectTrigger) importProjectTrigger.style.display = '';
    if (exportProjectBtn) exportProjectBtn.style.display = '';
    if (exportProjectTxtBtn) exportProjectTxtBtn.style.display = 'none';
    
    overviewScreen.classList.remove('active');
    writingScreen.classList.remove('active');
    setTimeout(() => {
        overviewScreen.style.display = 'none';
        writingScreen.style.display = 'none';
        bookshelfScreen.style.display = 'block';
        setTimeout(() => {
            bookshelfScreen.classList.add('active');
            renderBookshelf();
        }, 50);
    }, 300);
}

// Render the Bookshelf View
function renderBookshelf() {
    const booksGrid = document.getElementById('books-grid');
    if (!booksGrid) return;
    
    booksGrid.innerHTML = '';
    
    // Add new project card
    const addCard = document.createElement('div');
    addCard.className = 'book-card';
    addCard.innerHTML = `
        <div class="book-cover" style="background: var(--bg-secondary); border: 1.5px dashed var(--border-color); display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-secondary); box-shadow: none;">
            <div style="font-size: 2rem; font-weight: 300;">+</div>
            <div style="font-size: 0.8rem; margin-top: 0.5rem;">새 작품 쓰기</div>
        </div>
        <div class="book-card-title-under" style="color: var(--text-secondary);">새 작품 추가</div>
    `;
    addCard.addEventListener('click', () => {
        showNewBookDialog();
    });
    booksGrid.appendChild(addCard);
    
    projects.forEach((proj) => {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        bookCard.dataset.id = proj.id;
        
        const coverColor = proj.coverColor || 'charcoal';
        
        bookCard.innerHTML = `
            <button class="delete-book-btn" title="작품 삭제">×</button>
            <div class="book-cover cover-${coverColor}">
                <div class="book-cover-title">${proj.title || '제목 없음'}</div>
                <div class="book-cover-author">Monote</div>
            </div>
            <div class="book-card-title-under">${proj.title || '제목 없음'}</div>
        `;
        
        // Open project on click
        bookCard.addEventListener('click', (e) => {
            // If click was on delete button, do not open
            if (e.target.classList.contains('delete-book-btn')) {
                e.stopPropagation();
                if (confirm(`"${proj.title || '제목 없음'}" 작품을 완전히 삭제하시겠습니까?\n작성한 원고가 모두 삭제되며 되돌릴 수 없습니다.`)) {
                    deleteProject(proj.id);
                }
                return;
            }
            openProject(proj.id);
        });
        
        booksGrid.appendChild(bookCard);
    });
}

// Dialog elements references helper
const newBookDialog = document.getElementById('new-book-dialog');
const newBookTitleInput = document.getElementById('new-book-title');

// Show dialog
function showNewBookDialog() {
    newBookTitleInput.value = '';
    
    // Reset color option active class
    document.querySelectorAll('.cover-color-picker .color-option').forEach(opt => {
        opt.classList.remove('active');
    });
    const charcoalOpt = document.querySelector('.cover-color-picker .color-option.charcoal');
    if (charcoalOpt) charcoalOpt.classList.add('active');
    
    const defaultRadio = document.querySelector('input[name="cover-color"][value="charcoal"]');
    if (defaultRadio) defaultRadio.checked = true;

    newBookDialog.style.display = 'flex';
    setTimeout(() => {
        newBookTitleInput.focus();
    }, 100);
}

// Hide dialog
function hideNewBookDialog() {
    newBookDialog.style.display = 'none';
}

// Create new project
async function createNewProject() {
    const title = newBookTitleInput.value.trim();
    if (!title) {
        alert("작품 제목을 입력해 주세요.");
        newBookTitleInput.focus();
        return;
    }
    
    const selectedColorRadio = document.querySelector('input[name="cover-color"]:checked');
    const coverColor = selectedColorRadio ? selectedColorRadio.value : 'charcoal';
    
    const newProj = {
        id: Date.now().toString(),
        title: title,
        synopsis: '',
        ideas: '',
        chapters: [],
        coverColor: coverColor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    projects.push(newProj);
    storage.setItem('monote-projects', JSON.stringify(projects));
    hideNewBookDialog();
    renderBookshelf();
    
    // Open immediately
    openProject(newProj.id);

    // Sync to Supabase
    if (supabaseClient) {
        updateSyncStatus('syncing', '동기화 중...');
        try {
            await saveProjectToCloud(newProj);
            updateSyncStatus('success', '동기화 완료');
        } catch (err) {
            console.error('Failed to sync new project to cloud:', err);
            updateSyncStatus('error', '동기화 실패');
        }
    }
}

// Open selected project
function openProject(projectId) {
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    
    activeProjectId = projectId;
    storage.setItem('monote-active-project-id', projectId);
    project = JSON.parse(JSON.stringify(proj)); // Deep copy to edit
    activeChapterId = null;
    storage.removeItem('monote-active-chapter-id');
    
    
    
    // Render and switch to Overview
    renderOverview();
    showOverviewScreen();
}

// Delete project
async function deleteProject(projectId) {
    projects = projects.filter(p => p.id !== projectId);
    storage.setItem('monote-projects', JSON.stringify(projects));
    
    if (activeProjectId === projectId) {
        activeProjectId = null;
        project = null;
        
        showBookshelfScreen();
    } else {
        renderBookshelf();
    }

    // Delete from Supabase
    if (supabaseClient) {
        updateSyncStatus('syncing', '동기화 중...');
        try {
            const { error } = await supabaseClient
                .from('open_projects')
                .delete()
                .eq('id', projectId);
            if (error) throw error;
            updateSyncStatus('success', '동기화 완료');
        } catch (err) {
            console.error('Failed to delete project from cloud:', err);
            updateSyncStatus('error', '동기화 실패');
        }
    }
}

// Export Chapter to text file
function exportChapter(chapterId) {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    const fileContent = `${chapter.title || '제목 없음'}\n\n${chapter.content || ''}`;
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chapter.title || 'untitled-chapter'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Delete Chapter
function deleteChapter(chapterId) {
    project.chapters = project.chapters.filter(c => c.id !== chapterId);
    triggerSave();
    showOverviewScreen();
}

// Export entire project or all projects to JSON backup file
function exportProject() {
    const isSingleProject = project !== null;
    const filename = isSingleProject 
        ? `${project.title || 'monote-backup'}-${new Date().toISOString().slice(0,10)}.json`
        : `monote-all-projects-${new Date().toISOString().slice(0,10)}.json`;
        
    const dataToExport = isSingleProject ? project : projects;
    const jsonStr = JSON.stringify(dataToExport, null, 4);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Export entire project to single TXT file (all chapters compiled)
function exportProjectTxt() {
    if (!project || !project.chapters || project.chapters.length === 0) {
        alert("내보낼 챕터가 없습니다.");
        return;
    }
    
    let fullText = '';
    
    // Add Project Title & Synopsis at the top
    fullText += `${project.title || '제목 없음'}\n\n`;
    if (project.synopsis) {
        fullText += `시놉시스:\n${project.synopsis}\n\n`;
    }
    fullText += `\n`;
    
    // Iterate through chapters in order
    project.chapters.forEach((chapter) => {
        const prefix = getChapterPrefix(chapter.id);
        const titleText = chapter.title || '제목 없음';
        
        // Add chapter header without decorators
        fullText += `${prefix} ${titleText}\n\n`;
        fullText += `${chapter.content || ''}\n\n\n`;
    });
    
    const filename = `${project.title || 'untitled-story'}-${new Date().toISOString().slice(0,10)}.txt`;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Import project or all projects from JSON backup file
function importProject(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                // It's all projects backup
                if (confirm("모든 작품 백업 파일을 불러오시겠습니까? 현재 책장의 모든 작품이 백업 파일의 내용으로 대체됩니다. (기존 작품은 덮어써집니다)")) {
                    projects = importedData;
                    storage.setItem('monote-projects', JSON.stringify(projects));
                    renderBookshelf();
                    
                    // Sync all to Supabase if client is initialized
                    if (supabaseClient) {
                        updateSyncStatus('syncing', '동기화 중...');
                        (async () => {
                            try {
                                for (const proj of projects) {
                                    await saveProjectToCloud(proj);
                                }
                                updateSyncStatus('success', '동기화 완료');
                            } catch (err) {
                                console.error('Failed to sync imported projects to cloud:', err);
                                updateSyncStatus('error', '동기화 실패');
                            }
                        })();
                    }
                    alert("성공적으로 모든 작품 데이터를 불러왔습니다.");
                }
            } else if (importedData && typeof importedData === 'object' && ('title' in importedData || 'chapters' in importedData)) {
                // It's a single project backup
                if (confirm("작품 백업 파일을 책장에 추가하시겠습니까?")) {
                    const idx = projects.findIndex(p => p.id === importedData.id);
                    if (idx !== -1) {
                        if (confirm(`"${importedData.title || '제목 없음'}" 작품이 이미 책장에 존재합니다. 덮어쓰시겠습니까?`)) {
                            projects[idx] = importedData;
                        }
                    } else {
                        projects.push(importedData);
                    }
                    storage.setItem('monote-projects', JSON.stringify(projects));
                    renderBookshelf();
                    if (supabaseClient) {
                        saveProjectToCloud(importedData).catch(console.error);
                    }
                    alert("성공적으로 작품을 불러왔습니다.");
                }
            } else {
                alert("올바른 Monote 백업 파일(.json)이 아닙니다.");
            }
        } catch (err) {
            console.error("Failed to parse imported file:", err);
            alert("파일 읽기에 실패했습니다. 올바른 형식의 백업 파일인지 확인해 주세요.");
        }
        // Reset input file value
        importProjectFile.value = '';
    };
    reader.readAsText(file);
}

// Copy content to clipboard and open external spellchecker (Daum Grammar Checker)
function runSpellCheck(text) {
    if (!text.trim()) {
        alert("검사할 본문 내용이 없습니다.");
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        alert("본문 내용이 클립보드에 복사되었습니다!\n\n확인 버튼을 누르면 맞춤법 검사기 페이지로 이동합니다. 입력창에 붙여넣기(Ctrl + V)하여 검사해 보세요.");
        window.open('https://dic.daum.net/grammar_checker.do', '_blank');
    }).catch(err => {
        console.error("Failed to copy text: ", err);
        // Fallback if clipboard API fails
        alert("맞춤법 검사기 페이지로 이동합니다. 본문을 직접 복사(Ctrl + C)하여 검사기 창에 붙여넣기(Ctrl + V) 하세요.");
        window.open('https://dic.daum.net/grammar_checker.do', '_blank');
    });
}

// Restore state from localStorage on page load/refresh
function restoreActiveState() {
    const savedProjectId = storage.getItem('monote-active-project-id');
    const savedChapterId = storage.getItem('monote-active-chapter-id');
    
    if (savedProjectId) {
        const proj = projects.find(p => p.id === savedProjectId);
        if (proj) {
            activeProjectId = savedProjectId;
            project = JSON.parse(JSON.stringify(proj));
            
            renderOverview();
            
            if (savedChapterId) {
                const chapter = project.chapters.find(c => c.id === savedChapterId);
                if (chapter) {
                    activeChapterId = savedChapterId;
                    
                    // Directly load values
                    chapterNumberBadge.textContent = getChapterPrefix(savedChapterId);
                    chapterTitleInput.value = chapter.title || '';
                    chapterContentTextarea.value = chapter.content || '';
                    updateEditorCounts(chapter.content || '');
                    
                    // Instant screen switch (avoiding sliding animation flicker on refresh)
                    overviewScreen.style.display = 'none';
                    bookshelfScreen.style.display = 'none';
                    writingScreen.style.display = 'block';
                    writingScreen.classList.add('active');
                    
                    // Adjust title height
                    adjustTitleHeight();
                    
                    // Move chapters-panel to editor sidebar
                    const chaptersPanel = document.getElementById('chapters-panel');
                    const editorSidebar = document.getElementById('editor-sidebar');
                    if (chaptersPanel && editorSidebar) {
                        editorSidebar.appendChild(chaptersPanel);
                    }
                    
                    // Set menu actions
                    if (importProjectTrigger) importProjectTrigger.style.display = 'none';
                    if (exportProjectBtn) exportProjectBtn.style.display = 'none';
                    if (exportProjectTxtBtn) exportProjectTxtBtn.style.display = '';
                } else {
                    showOverviewScreen();
                }
            } else {
                showOverviewScreen();
            }
        }
    }
}

// Google Auth State Management
async function checkAuthState() {
    if (!supabaseClient) return;

    try {
        // Get initial session
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        
        updateAuthUI(session ? session.user : null);

        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            const user = session ? session.user : null;
            updateAuthUI(user);
            
            if (event === 'SIGNED_IN') {
                await loadProjects();
            } else if (event === 'SIGNED_OUT') {
                await loadProjects();
            }
        });
    } catch (err) {
        console.error('Error checking auth state:', err);
    }
}

function updateAuthUI(user) {
    currentUser = user;
    const authContainer = document.getElementById('auth-container');
    if (!authContainer) return;

    const logoutMenuItem = document.getElementById('logout-menu-item');

    if (user) {
        // User logged in
        const name = user.user_metadata?.full_name || user.email || '사용자';
        const avatarUrl = user.user_metadata?.avatar_url;

        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<img src="${avatarUrl}" alt="${name}" class="user-avatar" />`;
        } else {
            avatarHtml = `<div class="user-avatar-placeholder">${name.charAt(0)}</div>`;
        }

        authContainer.innerHTML = `
            <div class="user-profile" title="${name}">
                ${avatarHtml}
            </div>
        `;

        if (logoutMenuItem) {
            logoutMenuItem.style.display = 'flex';
            logoutMenuItem.onclick = (e) => {
                e.preventDefault();
                if (confirm("로그아웃 하시겠습니까?")) {
                    handleLogout();
                }
            };
        }
    } else {
        // User logged out
        authContainer.innerHTML = `
            <button id="google-login-btn" class="btn-flat btn-sm google-login-btn" title="구글 로그인">
                <svg class="google-icon" viewBox="0 0 24 24" width="16" height="16">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
            </button>
        `;

        if (logoutMenuItem) {
            logoutMenuItem.style.display = 'none';
            logoutMenuItem.onclick = null;
        }

        const loginBtn = document.getElementById('google-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', handleGoogleLogin);
        }
    }
}

async function handleGoogleLogin() {
    if (!supabaseClient) {
        alert("Supabase Client가 초기화되지 않았습니다.");
        return;
    }
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
    } catch (err) {
        console.error("Login failed:", err);
        alert(`로그인에 실패했습니다: ${err.message || err}`);
    }
}

async function handleLogout() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    } catch (err) {
        console.error("Logout failed:", err);
        alert(`로그아웃에 실패했습니다: ${err.message || err}`);
    }
}
