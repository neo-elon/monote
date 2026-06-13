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
let hideManual = false;
let activeRankingTab = 'daily';

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
    if (!supabaseClient || !currentUser) return;
    if (proj.id === "monote-manual-guide") return; // Protect global user manual from overwrite
    const { error } = await supabaseClient
        .from('open_projects')
        .upsert({
            id: proj.id,
            title: proj.title,
            synopsis: proj.synopsis || '',
            ideas: proj.ideas || '',
            chapters: proj.chapters || [],
            cover_color: `${proj.coverColor || 'charcoal'}:${proj.isPrivate ? 'private' : 'public'}`,
            updated_at: proj.updatedAt || new Date().toISOString(),
            created_at: proj.createdAt || new Date().toISOString(),
            user_id: currentUser.id
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

// Community Elements
const communityScreen = document.getElementById('community-screen');
const communityMenuItem = document.getElementById('community-menu-item');
const tabRankingBtn = document.getElementById('tab-ranking-btn');
const tabLoungeBtn = document.getElementById('tab-lounge-btn');
const rankingTabContent = document.getElementById('ranking-tab-content');
const loungeTabContent = document.getElementById('lounge-tab-content');
const rankingContainer = document.getElementById('ranking-container');
const loungeFeed = document.getElementById('lounge-feed');
const writePostBtn = document.getElementById('write-post-btn');
const newPostDialog = document.getElementById('new-post-dialog');
const previewBookDialog = document.getElementById('preview-book-dialog');
const previewChapterDialog = document.getElementById('preview-chapter-dialog');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    loadTheme();
    hideManual = storage.getItem('monote-hide-manual') === 'true';
    updateManualToggleUI();
    
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
    let localProjects = [];
    if (savedProjects) {
        try {
            localProjects = JSON.parse(savedProjects);
        } catch (e) {
            console.error("Failed to parse projects data:", e);
        }
    }

    if (currentUser) {
        if (hideManual) {
            // Logged in & hideManual true: Hide the public user manual!
            projects = localProjects.filter(p => (!p.user_id && p.id !== "monote-manual-guide") || p.user_id === currentUser.id);
        } else {
            // Logged in & hideManual false: Keep the public user manual!
            projects = localProjects.filter(p => !p.user_id || p.user_id === currentUser.id || p.id === "monote-manual-guide");
        }
    } else {
        // Offline mode: keep offline projects (no user_id) AND the public user manual
        projects = localProjects.filter(p => !p.user_id || p.id === "monote-manual-guide");
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
                if (currentUser) {
                    migrated.user_id = currentUser.id;
                }
                projects.push(migrated);
                storage.setItem('monote-projects', JSON.stringify(projects));
            }
        } catch (e) {
            console.error("Failed to migrate old project:", e);
        }
        // Remove old key so we don't migrate again
        storage.removeItem('monote-project');
    }

    sortProjectsByOrder();
    renderBookshelf();

    // Fetch from Supabase (fetch manual for offline, or user projects only for logged in)
    if (supabaseClient) {
        updateSyncStatus('syncing', '불러오는 중...');
        try {
            let query = supabaseClient.from('open_projects').select('*');
            if (currentUser) {
                if (hideManual) {
                    // Logged in & hideManual true: Fetch only user projects (hiding manual)
                    query = query.eq('user_id', currentUser.id);
                } else {
                    // Logged in & hideManual false: Fetch user projects + manual
                    query = query.or(`user_id.eq.${currentUser.id},id.eq.monote-manual-guide`);
                }
            } else {
                // Offline mode: Fetch only the public manual
                query = query.eq('id', 'monote-manual-guide');
            }
            const { data, error } = await query.order('updated_at', { ascending: false });

            if (error) throw error;

            const dbProjects = data ? data.map(dbProj => {
                const dbColor = dbProj.cover_color || 'charcoal';
                const colorParts = dbColor.split(':');
                const coverColor = colorParts[0];
                const isPrivate = colorParts[1] === 'private';
                return {
                    id: dbProj.id,
                    title: dbProj.title,
                    synopsis: dbProj.synopsis || '',
                    ideas: dbProj.ideas || '',
                    chapters: typeof dbProj.chapters === 'string' ? JSON.parse(dbProj.chapters) : (dbProj.chapters || []),
                    coverColor: coverColor,
                    isPrivate: isPrivate,
                    createdAt: dbProj.created_at,
                    updatedAt: dbProj.updated_at,
                    user_id: dbProj.user_id
                };
            }) : [];

            // Merge local offline projects into account projects
            const mergedProjects = [...dbProjects];
            const offlineProjects = projects.filter(p => !p.user_id && p.id !== "monote-manual-guide");

            for (const localProj of offlineProjects) {
                // Check for duplicates
                if (!mergedProjects.some(dbP => dbP.id === localProj.id)) {
                    if (currentUser) {
                        localProj.user_id = currentUser.id;
                        await saveProjectToCloud(localProj);
                    }
                    mergedProjects.push(localProj);
                }
            }

            projects = mergedProjects;
            sortProjectsByOrder();
            storage.setItem('monote-projects', JSON.stringify(projects));
            renderBookshelf();
            updateSyncStatus('success', '동기화 완료');
        } catch (err) {
            console.error('Failed to sync with Supabase:', err);
            updateSyncStatus('error', '동기화 실패');
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
            if (currentUser) {
                project.user_id = currentUser.id;
            }
            projects[idx] = project;
            storage.setItem('monote-projects', JSON.stringify(projects));
        }
        saveStatus.textContent = "저장 완료";
        
        // Sync to Supabase
        if (supabaseClient && currentUser) {
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
                const oldContent = ch.content || '';
                const newContent = e.target.value;
                ch.content = newContent;
                updateEditorCounts(newContent);
                triggerSave();
                trackWritingProgress(oldContent, newContent);
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
    
    const createProjBtn = document.getElementById('create-project-btn');
    if (createProjBtn) {
        createProjBtn.addEventListener('click', showNewBookDialog);
    }
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

    // Edit Project Settings Listeners
    const editProjSettingsBtn = document.getElementById('edit-project-settings-btn');
    if (editProjSettingsBtn) {
        editProjSettingsBtn.addEventListener('click', showEditBookDialog);
    }
    const cancelEditBookBtn = document.getElementById('cancel-edit-book');
    if (cancelEditBookBtn) {
        cancelEditBookBtn.addEventListener('click', hideEditBookDialog);
    }
    const confirmEditBookBtn = document.getElementById('confirm-edit-book');
    if (confirmEditBookBtn) {
        confirmEditBookBtn.addEventListener('click', saveEditBookSettings);
    }

    // Color picker active state toggle for edit dialog
    document.querySelectorAll('.cover-color-picker input[name="edit-cover-color"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const picker = e.target.closest('.cover-color-picker');
            picker.querySelectorAll('.color-option').forEach(opt => {
                opt.classList.remove('active');
            });
            e.target.closest('.color-option').classList.add('active');
        });
    });

    // Toggle manual visibility listener
    const toggleManualItem = document.getElementById('toggle-manual-item');
    if (toggleManualItem) {
        toggleManualItem.addEventListener('click', () => {
            hideManual = !hideManual;
            storage.setItem('monote-hide-manual', hideManual ? 'true' : 'false');
            updateManualToggleUI();
            loadProjects(); // Reload and refresh bookshelf
        });
    }

    // Community Event Listeners
    if (communityMenuItem) {
        communityMenuItem.addEventListener('click', showCommunityScreen);
    }
    const bookshelfCommunityBtn = document.getElementById('bookshelf-community-btn');
    if (bookshelfCommunityBtn) {
        bookshelfCommunityBtn.addEventListener('click', showCommunityScreen);
    }
    if (tabRankingBtn) {
        tabRankingBtn.addEventListener('click', () => switchCommunityTab('ranking'));
    }
    if (tabLoungeBtn) {
        tabLoungeBtn.addEventListener('click', () => switchCommunityTab('lounge'));
    }
    if (writePostBtn) {
        writePostBtn.addEventListener('click', showNewPostDialogBox);
    }
    const cancelNewPostBtn = document.getElementById('cancel-new-post');
    if (cancelNewPostBtn) {
        cancelNewPostBtn.addEventListener('click', hideNewPostDialogBox);
    }
    const confirmNewPostBtn = document.getElementById('confirm-new-post');
    if (confirmNewPostBtn) {
        confirmNewPostBtn.addEventListener('click', createNewPost);
    }
    const closePreviewBookBtn = document.getElementById('close-preview-book');
    if (closePreviewBookBtn) {
        closePreviewBookBtn.addEventListener('click', hidePreviewBookDialog);
    }
    const closePreviewChapterBtn = document.getElementById('close-preview-chapter');
    if (closePreviewChapterBtn) {
        closePreviewChapterBtn.addEventListener('click', hidePreviewChapterDialog);
    }
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
    if (communityScreen) communityScreen.classList.remove('active');
    setTimeout(() => {
        overviewScreen.style.display = 'none';
        bookshelfScreen.style.display = 'none';
        if (communityScreen) communityScreen.style.display = 'none';
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
    if (communityScreen) communityScreen.classList.remove('active');
    setTimeout(() => {
        writingScreen.style.display = 'none';
        bookshelfScreen.style.display = 'none';
        if (communityScreen) communityScreen.style.display = 'none';
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
    if (communityScreen) communityScreen.classList.remove('active');
    setTimeout(() => {
        overviewScreen.style.display = 'none';
        writingScreen.style.display = 'none';
        if (communityScreen) communityScreen.style.display = 'none';
        bookshelfScreen.style.display = 'block';
        setTimeout(() => {
            bookshelfScreen.classList.add('active');
            renderBookshelf();
        }, 50);
    }, 300);
}

function showCommunityScreen() {
    activeProjectId = null;
    project = null;
    storage.removeItem('monote-active-project-id');
    storage.removeItem('monote-active-chapter-id');
    
    // In community screen: hide JSON import/export, hide txt export
    if (importProjectTrigger) importProjectTrigger.style.display = 'none';
    if (exportProjectBtn) exportProjectBtn.style.display = 'none';
    if (exportProjectTxtBtn) exportProjectTxtBtn.style.display = 'none';
    
    // Move chapters-panel back to overview grid (just in case)
    const chaptersPanel = document.getElementById('chapters-panel');
    const overviewGrid = document.querySelector('.overview-grid');
    if (chaptersPanel && overviewGrid) {
        overviewGrid.appendChild(chaptersPanel);
    }
    
    overviewScreen.classList.remove('active');
    writingScreen.classList.remove('active');
    bookshelfScreen.classList.remove('active');
    
    if (communityScreen) {
        setTimeout(() => {
            overviewScreen.style.display = 'none';
            writingScreen.style.display = 'none';
            bookshelfScreen.style.display = 'none';
            communityScreen.style.display = 'block';
            setTimeout(() => {
                communityScreen.classList.add('active');
                switchCommunityTab('ranking');
            }, 50);
        }, 300);
    }
}

function switchCommunityTab(tab) {
    if (tab === 'ranking') {
        tabRankingBtn.classList.add('active');
        tabLoungeBtn.classList.remove('active');
        tabRankingBtn.style.borderBottomColor = 'var(--text-primary)';
        tabRankingBtn.style.color = 'var(--text-primary)';
        tabLoungeBtn.style.borderBottomColor = 'transparent';
        tabLoungeBtn.style.color = 'var(--text-secondary)';
        
        rankingTabContent.style.display = 'block';
        loungeTabContent.style.display = 'none';
        writePostBtn.style.display = 'none';
        
        renderRanking();
    } else {
        tabRankingBtn.classList.remove('active');
        tabLoungeBtn.classList.add('active');
        tabRankingBtn.style.borderBottomColor = 'transparent';
        tabRankingBtn.style.color = 'var(--text-secondary)';
        tabLoungeBtn.style.borderBottomColor = 'var(--text-primary)';
        tabLoungeBtn.style.color = 'var(--text-primary)';
        
        rankingTabContent.style.display = 'none';
        loungeTabContent.style.display = 'block';
        writePostBtn.style.display = 'block';
        
        renderLoungeFeed();
    }
}

function getUserWritingTier(totalChars) {
    if (totalChars <= 5000) {
        return { name: "새싹 작가 🌱", next: 5000, nextName: "동네 작가", prev: 0, icon: "🌱" };
    } else if (totalChars <= 15000) {
        return { name: "동네 작가 ✒️", next: 15000, nextName: "프로 작가", prev: 5000, icon: "✒️" };
    } else if (totalChars <= 50000) {
        return { name: "프로 작가 🪶", next: 50000, nextName: "거장 작가", prev: 15000, icon: "🪶" };
    } else {
        return { name: "거장 작가 👑", next: Infinity, nextName: "", prev: 50000, icon: "👑" };
    }
}

function renderRanking() {
    if (!rankingContainer) return;
    rankingContainer.innerHTML = '';

    // Calculate user stats
    const userDailyChars = getUserDailyWritingCount();
    const userWeeklyChars = getUserWeeklyWritingCount();
    const userStreak = getUserStreak();
    
    const userTotalCumulative = projects.reduce((total, proj) => {
        return total + (proj.chapters || []).reduce((sum, ch) => sum + (ch.content ? ch.content.length : 0), 0);
    }, 0);

    const tier = getUserWritingTier(userTotalCumulative);

    // 1. Render Writer Tier Card
    const tierCard = document.createElement('div');
    tierCard.style.cssText = `
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 1.25rem;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        box-shadow: var(--shadow-sm);
    `;

    let progressText = "";
    let progressPercent = 100;
    if (tier.next !== Infinity) {
        const nextDiff = tier.next - userTotalCumulative;
        progressText = `다음 등급인 [${tier.nextName}]까지 <strong>${nextDiff.toLocaleString()}자</strong> 남음`;
        const totalTierRange = tier.next - tier.prev;
        const currentTierProgress = userTotalCumulative - tier.prev;
        progressPercent = Math.min(100, Math.max(0, (currentTierProgress / totalTierRange) * 100));
    } else {
        progressText = "축하합니다! 최고 등급에 도달했습니다.";
    }

    tierCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
                <span style="font-size: 1.5rem;">${tier.icon}</span>
                <div>
                    <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">나의 작가 등급</div>
                    <div style="font-family: var(--font-serif); font-size: 1rem; font-weight: 700; color: var(--text-primary);">${tier.name}</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.7rem; color: var(--text-secondary);">총 집필량</div>
                <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary);">${userTotalCumulative.toLocaleString()}자</div>
            </div>
        </div>
        
        <div>
            <div style="height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden; margin-bottom: 0.4rem;">
                <div style="height: 100%; width: ${progressPercent}%; background: var(--text-primary); opacity: 0.4; border-radius: 3px; transition: width 0.5s ease;"></div>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${progressText}</div>
        </div>
    `;
    rankingContainer.appendChild(tierCard);

    // 2. Render Mini Stats Dashboard Row
    const statsRow = document.createElement('div');
    statsRow.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.75rem;
    `;
    statsRow.innerHTML = `
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 6px; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.65rem; color: var(--text-secondary); margin-bottom: 0.2rem; font-weight: 500;">오늘 집필</div>
            <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">${userDailyChars.toLocaleString()}자</div>
        </div>
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 6px; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.65rem; color: var(--text-secondary); margin-bottom: 0.2rem; font-weight: 500;">주간 누적</div>
            <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">${userWeeklyChars.toLocaleString()}자</div>
        </div>
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 6px; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.65rem; color: var(--text-secondary); margin-bottom: 0.2rem; font-weight: 500;">연속 집필</div>
            <div style="font-size: 0.9rem; font-weight: 600; color: var(--accent-color);">${userStreak}일 🔥</div>
        </div>
    `;
    rankingContainer.appendChild(statsRow);

    // 2.5. Render Badges Section
    const badgesSection = document.createElement('div');
    badgesSection.style.cssText = `
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 1.25rem;
        border-radius: 8px;
        box-shadow: var(--shadow-sm);
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    `;
    
    // Check achievements
    const activeProjects = projects.filter(p => p.id !== "monote-manual-guide");
    const hasProject = activeProjects.length > 0;
    const hasStreak3 = userStreak >= 3;
    const hasDaily1000 = userDailyChars >= 1000;
    const hasLongChapter = activeProjects.some(p => (p.chapters || []).some(ch => (ch.content || '').length >= 3000));
    const hasCumulative10k = userTotalCumulative >= 10000;
    const hasCumulative50k = userTotalCumulative >= 50000;

    const badges = [
        { id: 'start', name: '새싹의 시작', icon: '🌱', desc: '첫 작품 쓰기 시작', unlocked: hasProject },
        { id: 'streak', name: '꾸준한 펜 끝', icon: '🔥', desc: '연속 집필 3일 달성', unlocked: hasStreak3 },
        { id: 'daily', name: '열정의 폭주', icon: '⚡', desc: '하루 1,000자 집필', unlocked: hasDaily1000 },
        { id: 'chapter', name: '첫 장 완성', icon: '📖', desc: '한 챕터 3,000자 작성', unlocked: hasLongChapter },
        { id: 'writer', name: '단편 소설가', icon: '✒️', desc: '누적 10,000자 달성', unlocked: hasCumulative10k },
        { id: 'master', name: '창작의 거장', icon: '👑', desc: '누적 50,000자 달성', unlocked: hasCumulative50k }
    ];

    const unlockedCount = badges.filter(b => b.unlocked).length;
    
    let badgesHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 0.6rem; margin-bottom: 0.4rem;">
            <div style="font-family: var(--font-serif); font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">나의 집필 뱃지 (${unlockedCount}/${badges.length})</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">집필을 통해 뱃지를 획득하세요</div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
    `;

    badges.forEach(b => {
        const opacity = b.unlocked ? '1' : '0.4';
        const filter = b.unlocked ? 'none' : 'grayscale(100%)';
        const border = b.unlocked ? '1px solid var(--text-primary)' : '1px solid var(--border-color)';
        const bg = b.unlocked ? 'var(--bg-secondary)' : 'transparent';
        
        badgesHtml += `
            <div title="${b.desc}" style="background: ${bg}; border: ${border}; opacity: ${opacity}; filter: ${filter}; border-radius: 6px; padding: 0.6rem 0.4rem; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.3rem; transition: all 0.3s ease; position: relative;">
                <span style="font-size: 1.5rem; line-height: 1;">${b.icon}</span>
                <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${b.name}</span>
                <span style="font-size: 0.6rem; color: var(--text-secondary); line-height: 1.2; display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.desc}</span>
                ${!b.unlocked ? '<span style="position: absolute; top: 4px; right: 4px; font-size: 0.65rem; opacity: 0.8;">🔒</span>' : ''}
            </div>
        `;
    });

    badgesHtml += `</div>`;
    badgesSection.innerHTML = badgesHtml;
    rankingContainer.appendChild(badgesSection);

    // 3. Render Sub-tabs
    const subTabsEl = document.createElement('div');
    subTabsEl.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 0.35rem;
        background: var(--bg-secondary);
        padding: 0.25rem;
        border-radius: 20px;
        border: 1px solid var(--border-color);
    `;

    const subTabConfigs = [
        { key: 'daily', label: '일간 집필량' },
        { key: 'weekly', label: '주간' },
        { key: 'cumulative', label: '누적' },
        { key: 'streak', label: '연속 집필일' }
    ];

    subTabConfigs.forEach(config => {
        const btn = document.createElement('button');
        const isActive = activeRankingTab === config.key;
        btn.style.cssText = `
            flex: 1;
            background: ${isActive ? 'var(--bg-primary)' : 'transparent'};
            color: ${isActive ? 'var(--text-primary)' : 'var(--text-secondary)'};
            border: none;
            padding: 0.4rem 0.5rem;
            border-radius: 15px;
            font-size: 0.75rem;
            font-weight: ${isActive ? '600' : '400'};
            cursor: pointer;
            transition: all var(--transition-speed);
            box-shadow: ${isActive ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'};
            white-space: nowrap;
        `;
        btn.textContent = config.label;
        btn.onclick = () => {
            activeRankingTab = config.key;
            renderRanking();
        };
        subTabsEl.appendChild(btn);
    });
    rankingContainer.appendChild(subTabsEl);

    // 4. Leaderboard Container
    const leaderboardEl = document.createElement('div');
    leaderboardEl.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    `;
    rankingContainer.appendChild(leaderboardEl);

    const userAuthorName = currentUser?.user_metadata?.pen_name || "나 (작가)";

    if (activeRankingTab === 'daily') {
        const dailyRankingList = [
            { author: userAuthorName, value: userDailyChars, isMe: true },
            { author: "백석", value: 2450 },
            { author: "윤동주", value: 1850 },
            { author: "이상", value: 920 },
            { author: "김유정", value: 450 }
        ].sort((a, b) => b.value - a.value);

        renderEnhancedLeaderboard(leaderboardEl, "✍️ 오늘 하루 집필량 랭킹", dailyRankingList, "자", true);
        
    } else if (activeRankingTab === 'weekly') {
        const weeklyRankingList = [
            { author: userAuthorName, value: userWeeklyChars, isMe: true },
            { author: "윤동주", value: 14850 },
            { author: "백석", value: 12400 },
            { author: "이상", value: 8750 },
            { author: "김유정", value: 5200 }
        ].sort((a, b) => b.value - a.value);

        renderEnhancedLeaderboard(leaderboardEl, "📅 이번 주 집필량 랭킹 (7일 합산)", weeklyRankingList, "자", true);
        
    } else if (activeRankingTab === 'cumulative') {
        const userBooks = projects.map(proj => {
            const charCount = (proj.chapters || []).reduce((sum, ch) => sum + (ch.content ? ch.content.length : 0), 0);
            return {
                title: proj.title || '제목 없음',
                author: userAuthorName,
                value: charCount,
                isMe: true
            };
        });

        const classicBooks = [
            { title: "1984 (새벽의 기록)", author: "조지 오웰", value: 78420 },
            { title: "자기만의 방", author: "버지니아 울프", value: 42150 },
            { title: "노인과 바다 (낭독 에디션)", author: "어니스트 헤밍웨이", value: 35890 },
            { title: "날개 (초판본)", author: "이상", value: 12450 }
        ];

        const allBooks = [...userBooks, ...classicBooks]
            .filter(b => b.value > 0)
            .sort((a, b) => b.value - a.value);

        renderBookLeaderboardSection(leaderboardEl, "🏆 명예의 전당 (누적 글자수 랭킹)", allBooks);
        
    } else if (activeRankingTab === 'streak') {
        const streakRankingList = [
            { author: userAuthorName, value: userStreak, isMe: true },
            { author: "윤동주", value: 18 },
            { author: "백석", value: 11 },
            { author: "김유정", value: 6 },
            { author: "이상", value: 3 }
        ].sort((a, b) => b.value - a.value);

        renderEnhancedLeaderboard(leaderboardEl, "🔥 연속 집필 스트릭 랭킹", streakRankingList, "일 연속", false);
    }
}

function renderEnhancedLeaderboard(container, title, list, unit, showBar) {
    const section = document.createElement('div');
    section.style.cssText = `
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 1.5rem;
        border-radius: 6px;
        box-shadow: var(--shadow-sm);
    `;

    // 1. Render Top 3 Podium
    let podiumHtml = '';
    if (list.length >= 3) {
        const gold = list[0];
        const silver = list[1];
        const bronze = list[2];

        podiumHtml = `
            <div style="display: flex; justify-content: center; align-items: flex-end; gap: 0.5rem; margin-bottom: 2rem; padding: 1rem 0; border-bottom: 1px dashed var(--border-color);">
                <!-- 2nd Place (Silver) -->
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
                    <span style="font-size: 1.3rem;">🥈</span>
                    <span style="font-size: 0.8rem; font-weight: ${silver.isMe ? '700' : '500'}; color: var(--text-primary); text-align: center; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${silver.author}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">${silver.value.toLocaleString()}${unit}</span>
                    <div style="width: 100%; height: 45px; background: var(--bg-secondary); border-radius: 4px 4px 0 0; border: 1px solid var(--border-color); border-bottom: none; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">2</div>
                </div>
                
                <!-- 1st Place (Gold) -->
                <div style="flex: 1.2; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; transform: translateY(-8px);">
                    <span style="font-size: 1.8rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));">👑</span>
                    <span style="font-size: 0.85rem; font-weight: ${gold.isMe ? '700' : '600'}; color: var(--text-primary); text-align: center; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${gold.author}</span>
                    <span style="font-size: 0.8rem; color: var(--accent-color); font-weight: 600;">${gold.value.toLocaleString()}${unit}</span>
                    <div style="width: 100%; height: 65px; background: var(--text-primary); opacity: 0.9; border-radius: 4px 4px 0 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 800; color: var(--bg-primary);">1</div>
                </div>
                
                <!-- 3rd Place (Bronze) -->
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
                    <span style="font-size: 1.3rem;">🥉</span>
                    <span style="font-size: 0.8rem; font-weight: ${bronze.isMe ? '700' : '500'}; color: var(--text-primary); text-align: center; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${bronze.author}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">${bronze.value.toLocaleString()}${unit}</span>
                    <div style="width: 100%; height: 35px; background: var(--bg-secondary); border-radius: 4px 4px 0 0; border: 1px solid var(--border-color); border-bottom: none; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">3</div>
                </div>
            </div>
        `;
    }

    let listHtml = '';
    const startIdx = list.length >= 3 ? 3 : 0;
    const maxValue = list.length > 0 ? list[0].value : 0;

    for (let i = startIdx; i < list.length; i++) {
        const item = list[i];
        const itemBg = item.isMe ? 'rgba(0,0,0,0.02)' : 'transparent';
        const borderStyle = item.isMe ? '1px dashed var(--border-color)' : 'none';
        const paddingStyle = item.isMe ? '0.4rem 0.5rem' : '0';
        const borderRadiusStyle = item.isMe ? '4px' : '0';

        let itemBarHtml = '';
        if (showBar && maxValue > 0) {
            const percentage = (item.value / maxValue) * 100;
            itemBarHtml = `
                <div style="height: 5px; background: var(--bg-secondary); border-radius: 2.5px; overflow: hidden; margin-left: 30px;">
                    <div style="height: 100%; width: ${percentage}%; background: var(--text-primary); opacity: 0.25; border-radius: 2.5px;"></div>
                </div>
            `;
        }

        listHtml += `
            <div style="display: flex; flex-direction: column; gap: 0.35rem; background: ${itemBg}; border: ${borderStyle}; padding: ${paddingStyle}; border-radius: ${borderRadiusStyle};">
                <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <span style="font-weight: 700; width: 24px; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${i + 1}</span>
                        <span style="font-size: 0.9rem; font-weight: ${item.isMe ? '700' : '600'}; color: var(--text-primary);">${item.author} ${item.isMe ? '<span style="font-size: 0.7rem; font-weight:normal; color:var(--text-secondary);">(나)</span>' : ''}</span>
                    </div>
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">
                        ${item.value.toLocaleString()}${unit}
                    </div>
                </div>
                ${itemBarHtml}
            </div>
        `;
    }

    section.innerHTML = `
        <h3 style="font-family: var(--font-serif); font-size: 1rem; font-weight: 700; margin: 0 0 1.2rem 0; color: var(--text-primary);">
            ${title}
        </h3>
        ${podiumHtml}
        <div style="display: flex; flex-direction: column; gap: 0.9rem;">
            ${listHtml || `<div style="text-align: center; font-size: 0.8rem; color: var(--text-secondary); font-style: italic; padding: 0.5rem 0;">4위 이하 순위가 없습니다.</div>`}
        </div>
    `;
    container.appendChild(section);
}

function renderLeaderboardSection(container, title, list, unit, showBar) {
    const section = document.createElement('div');
    section.style.cssText = `
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 1.5rem;
        border-radius: 6px;
        box-shadow: var(--shadow-sm);
    `;

    let html = `
        <h3 style="font-family: var(--font-serif); font-size: 1rem; font-weight: 700; margin: 0 0 1.2rem 0; color: var(--text-primary);">
            ${title}
        </h3>
        <div style="display: flex; flex-direction: column; gap: 0.9rem;">
    `;

    const maxValue = list.length > 0 ? list[0].value : 0;

    list.forEach((item, index) => {
        let badge = `<span style="font-weight: 700; width: 24px; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${index + 1}</span>`;
        if (index === 0) badge = `<span style="font-size: 1.15rem; width: 24px; text-align: center;">🥇</span>`;
        else if (index === 1) badge = `<span style="font-size: 1.15rem; width: 24px; text-align: center;">🥈</span>`;
        else if (index === 2) badge = `<span style="font-size: 1.15rem; width: 24px; text-align: center;">🥉</span>`;

        const itemBg = item.isMe ? 'rgba(0,0,0,0.02)' : 'transparent';
        const borderStyle = item.isMe ? '1px dashed var(--border-color)' : 'none';
        const paddingStyle = item.isMe ? '0.4rem 0.5rem' : '0';
        const borderRadiusStyle = item.isMe ? '4px' : '0';

        html += `
            <div style="display: flex; flex-direction: column; gap: 0.35rem; background: ${itemBg}; border: ${borderStyle}; padding: ${paddingStyle}; border-radius: ${borderRadiusStyle};">
                <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        ${badge}
                        <span style="font-size: 0.9rem; font-weight: ${item.isMe ? '700' : '600'}; color: var(--text-primary);">${item.author} ${item.isMe ? '<span style="font-size: 0.7rem; font-weight:normal; color:var(--text-secondary);">(나)</span>' : ''}</span>
                    </div>
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">
                        ${item.value.toLocaleString()}${unit}
                    </div>
                </div>
        `;

        if (showBar && maxValue > 0) {
            const percentage = (item.value / maxValue) * 100;
            html += `
                <div style="height: 5px; background: var(--bg-secondary); border-radius: 2.5px; overflow: hidden; margin-left: 30px;">
                    <div style="height: 100%; width: ${percentage}%; background: var(--text-primary); opacity: 0.25; border-radius: 2.5px;"></div>
                </div>
            `;
        }

        html += `</div>`;
    });

    html += `</div>`;
    section.innerHTML = html;
    container.appendChild(section);
}

function renderBookLeaderboardSection(container, title, list) {
    const section = document.createElement('div');
    section.style.cssText = `
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 1.5rem;
        border-radius: 6px;
        box-shadow: var(--shadow-sm);
    `;

    let html = `
        <h3 style="font-family: var(--font-serif); font-size: 1rem; font-weight: 700; margin: 0 0 1.2rem 0; color: var(--text-primary);">
            ${title}
        </h3>
        <div style="display: flex; flex-direction: column; gap: 1.2rem;">
    `;

    const maxValue = list.length > 0 ? list[0].value : 0;

    list.forEach((book, index) => {
        let badge = `<span style="font-weight: 700; width: 24px; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${index + 1}</span>`;
        if (index === 0) badge = `<span style="font-size: 1.15rem; width: 24px; text-align: center;">🥇</span>`;
        else if (index === 1) badge = `<span style="font-size: 1.15rem; width: 24px; text-align: center;">🥈</span>`;
        else if (index === 2) badge = `<span style="font-size: 1.15rem; width: 24px; text-align: center;">🥉</span>`;

        const percentage = maxValue > 0 ? (book.value / maxValue) * 100 : 0;
        const itemBg = book.isMe ? 'rgba(0,0,0,0.02)' : 'transparent';
        const borderStyle = book.isMe ? '1px dashed var(--border-color)' : 'none';
        const paddingStyle = book.isMe ? '0.4rem 0.5rem' : '0';
        const borderRadiusStyle = book.isMe ? '4px' : '0';

        html += `
            <div style="display: flex; flex-direction: column; gap: 0.4rem; background: ${itemBg}; border: ${borderStyle}; padding: ${paddingStyle}; border-radius: ${borderRadiusStyle};">
                <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 0.6rem; min-width: 0; flex: 1;">
                        ${badge}
                        <div style="min-width: 0; flex: 1;">
                            <div style="font-family: var(--font-serif); font-size: 0.9rem; font-weight: ${book.isMe ? '700' : '600'}; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${book.title}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.05rem;">${book.author} ${book.isMe ? '<span style="font-size: 0.7rem; color:var(--text-secondary); font-weight:normal;">(나)</span>' : ''}</div>
                        </div>
                    </div>
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap;">
                        ${book.value.toLocaleString()}자
                    </div>
                </div>
                <div style="height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden; margin-left: 30px;">
                    <div style="height: 100%; width: ${percentage}%; background: var(--text-primary); opacity: 0.25; border-radius: 3px;"></div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    section.innerHTML = html;
    container.appendChild(section);
}

function trackWritingProgress(oldVal, newVal) {
    const oldLen = oldVal ? oldVal.length : 0;
    const newLen = newVal ? newVal.length : 0;
    if (newLen <= oldLen) return;

    const addedChars = newLen - oldLen;
    const todayStr = new Date().toISOString().split('T')[0];
    
    let stats = {
        dailyLogs: {},
        lastWrittenDate: "",
        currentStreak: 0
    };
    
    const saved = storage.getItem('monote-writing-stats');
    if (saved) {
        try {
            stats = JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse writing stats:", e);
        }
    }
    if (!stats.dailyLogs) stats.dailyLogs = {};
    
    stats.dailyLogs[todayStr] = (stats.dailyLogs[todayStr] || 0) + addedChars;
    
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (stats.lastWrittenDate !== todayStr) {
        if (stats.lastWrittenDate === yesterdayStr) {
            stats.currentStreak = (stats.currentStreak || 0) + 1;
        } else {
            stats.currentStreak = 1;
        }
        stats.lastWrittenDate = todayStr;
    }
    
    storage.setItem('monote-writing-stats', JSON.stringify(stats));
}

function getUserDailyWritingCount() {
    const todayStr = new Date().toISOString().split('T')[0];
    const saved = storage.getItem('monote-writing-stats');
    if (!saved) return 0;
    try {
        const stats = JSON.parse(saved);
        return (stats.dailyLogs || {})[todayStr] || 0;
    } catch (e) {
        return 0;
    }
}

function getUserWeeklyWritingCount() {
    const saved = storage.getItem('monote-writing-stats');
    if (!saved) return 0;
    try {
        const stats = JSON.parse(saved);
        const dailyLogs = stats.dailyLogs || {};
        let weeklySum = 0;
        
        for (let i = 0; i < 7; i++) {
            const dateStr = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            weeklySum += (dailyLogs[dateStr] || 0);
        }
        return weeklySum;
    } catch (e) {
        return 0;
    }
}

function getUserStreak() {
    const saved = storage.getItem('monote-writing-stats');
    if (!saved) return 0;
    try {
        const stats = JSON.parse(saved);
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        if (stats.lastWrittenDate !== todayStr && stats.lastWrittenDate !== yesterdayStr) {
            stats.currentStreak = 0;
            storage.setItem('monote-writing-stats', JSON.stringify(stats));
        }
        return stats.currentStreak || 0;
    } catch (e) {
        return 0;
    }
}

const defaultLoungePosts = [
    {
        id: "post-1",
        author: "이상",
        content: "박제가 되어버린 천재를 아시오? 나는 유쾌하오. 이런 때 연애까지가 유쾌하오.",
        timestamp: Date.now() - 1000 * 60 * 45,
        likes: 12,
        likedByMe: false,
        comments: [
            { author: "김유정", content: "표현이 깊이 남네요.", timestamp: Date.now() - 1000 * 60 * 30 }
        ]
    },
    {
        id: "post-2",
        author: "윤동주",
        content: "계절이 지나가는 하늘에는 가을로 가득 차 있습니다. 나는 아무 걱정도 없이 가을 속의 별들을 다 헤일 듯합니다...",
        timestamp: Date.now() - 1000 * 60 * 180,
        likes: 24,
        likedByMe: true,
        comments: []
    }
];

function getLoungePosts() {
    const saved = storage.getItem('monote-lounge-posts');
    if (!saved) {
        storage.setItem('monote-lounge-posts', JSON.stringify(defaultLoungePosts));
        return defaultLoungePosts;
    }
    try {
        return JSON.parse(saved);
    } catch (e) {
        return defaultLoungePosts;
    }
}

function saveLoungePosts(posts) {
    storage.setItem('monote-lounge-posts', JSON.stringify(posts));
}

function formatTimeElapsed(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 0) return '방금 전';
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return `${days}일 전`;
}

function renderLoungeFeed() {
    if (!loungeFeed) return;
    const posts = getLoungePosts();
    loungeFeed.innerHTML = '';
    
    if (posts.length === 0) {
        loungeFeed.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary); font-style: italic;">라운지에 첫 글을 작성해 보세요.</div>';
        return;
    }
    
    posts.forEach(post => {
        const postEl = document.createElement('div');
        postEl.className = 'lounge-post-card';
        postEl.style.cssText = `
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            padding: 1.2rem;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.02);
            transition: all var(--transition-speed);
        `;
        
        const timeString = formatTimeElapsed(post.timestamp);
        const likeIconColor = post.likedByMe ? 'var(--accent-color)' : 'currentColor';
        const likeIconFill = post.likedByMe ? 'var(--accent-color)' : 'none';
        
        let commentsHtml = '';
        if (post.comments && post.comments.length > 0) {
            commentsHtml = `
                <div class="comments-section" style="border-top: 1px dashed var(--border-color); padding-top: 0.75rem; margin-top: 0.25rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    ${post.comments.map(c => `
                        <div style="font-size: 0.8rem; line-height: 1.4;">
                            <strong style="color: var(--text-primary); font-weight: 600; margin-right: 0.4rem;">${c.author}</strong>
                            <span style="color: var(--text-secondary); font-weight: 300;">${c.content}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        postEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-family: var(--font-serif); font-weight: 700; font-size: 0.9rem; color: var(--text-primary);">${post.author}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 300;">${timeString}</span>
            </div>
            <div style="font-size: 0.85rem; line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; word-break: break-all;">${post.content}</div>
            
            <div style="display: flex; align-items: center; gap: 1.2rem; font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                <button class="like-btn" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 0.3rem; color: ${likeIconColor}; padding: 0;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="${likeIconFill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>좋아요 ${post.likes || 0}</span>
                </button>
                <button class="comment-trigger-btn" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 0.3rem; color: var(--text-secondary); padding: 0;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>댓글 달기</span>
                </button>
            </div>
            
            <div class="comment-input-area" style="display: none; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                <input type="text" class="comment-input" placeholder="댓글을 입력하세요..." style="flex: 1; font-size: 0.8rem; padding: 0.4rem 0.6rem; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px;" />
                <button class="btn-flat btn-sm submit-comment-btn" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;">등록</button>
            </div>
            
            ${commentsHtml}
        `;
        
        postEl.querySelector('.like-btn').onclick = () => {
            post.likedByMe = !post.likedByMe;
            post.likes = post.likedByMe ? (post.likes || 0) + 1 : Math.max(0, (post.likes || 1) - 1);
            saveLoungePosts(posts);
            renderLoungeFeed();
        };
        
        const commentArea = postEl.querySelector('.comment-input-area');
        postEl.querySelector('.comment-trigger-btn').onclick = () => {
            commentArea.style.display = commentArea.style.display === 'none' ? 'flex' : 'none';
            if (commentArea.style.display === 'flex') {
                commentArea.querySelector('.comment-input').focus();
            }
        };
        
        const submitComment = () => {
            const input = commentArea.querySelector('.comment-input');
            const val = input.value.trim();
            if (!val) return;
            
            const author = currentUser?.user_metadata?.pen_name || currentUser?.email?.split('@')[0] || "익명의 작가";
            if (!post.comments) post.comments = [];
            post.comments.push({
                author: author,
                content: val,
                timestamp: Date.now()
            });
            saveLoungePosts(posts);
            renderLoungeFeed();
        };
        
        commentArea.querySelector('.submit-comment-btn').onclick = submitComment;
        commentArea.querySelector('.comment-input').onkeydown = (e) => {
            if (e.key === 'Enter') submitComment();
        };
        
        loungeFeed.appendChild(postEl);
    });
}

function showNewPostDialogBox() {
    if (newPostDialog) {
        const contentArea = document.getElementById('new-post-content');
        if (contentArea) contentArea.value = '';
        newPostDialog.style.display = 'flex';
        setTimeout(() => {
            contentArea.focus();
        }, 100);
    }
}

function hideNewPostDialogBox() {
    if (newPostDialog) newPostDialog.style.display = 'none';
}

function createNewPost() {
    const contentArea = document.getElementById('new-post-content');
    if (!contentArea) return;
    const content = contentArea.value.trim();
    if (!content) {
        alert("글 내용을 입력해 주세요.");
        contentArea.focus();
        return;
    }
    
    const author = currentUser?.user_metadata?.pen_name || currentUser?.email?.split('@')[0] || "익명의 작가";
    const posts = getLoungePosts();
    posts.unshift({
        id: "post-" + Date.now(),
        author: author,
        content: content,
        timestamp: Date.now(),
        likes: 0,
        likedByMe: false,
        comments: []
    });
    
    saveLoungePosts(posts);
    hideNewPostDialogBox();
    renderLoungeFeed();
}

function showPreviewBookDialog(book) {
    if (!previewBookDialog) return;
    
    const titleEl = document.getElementById('preview-book-title');
    const authorEl = document.getElementById('preview-book-author');
    const synopsisEl = document.getElementById('preview-book-synopsis');
    const chaptersEl = document.getElementById('preview-book-chapters');
    
    if (titleEl) titleEl.textContent = book.title || '제목 없음';
    if (authorEl) authorEl.textContent = `${book.authorName || '작가 미상'} 작가`;
    if (synopsisEl) synopsisEl.textContent = book.synopsis || '등록된 시놉시스가 없습니다.';
    
    if (chaptersEl) {
        chaptersEl.innerHTML = '';
        if (!book.chapters || book.chapters.length === 0) {
            chaptersEl.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-secondary); font-style: italic; padding: 0.5rem 0;">등록된 챕터가 없습니다.</div>';
        } else {
            book.chapters.forEach((ch) => {
                const item = document.createElement('div');
                item.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.5rem 0.75rem;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    background: var(--bg-secondary);
                    cursor: pointer;
                    transition: all var(--transition-speed);
                `;
                item.innerHTML = `
                    <span style="font-size: 0.85rem; font-family: var(--font-serif); color: var(--text-primary); font-weight: 500;">${ch.title || '제목 없음'}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">${ch.content ? ch.content.length.toLocaleString() : 0}자</span>
                `;
                item.addEventListener('click', () => {
                    showPreviewChapterDialog(ch);
                });
                
                item.onmouseenter = () => {
                    item.style.borderColor = 'var(--text-primary)';
                };
                item.onmouseleave = () => {
                    item.style.borderColor = 'var(--border-color)';
                };
                
                chaptersEl.appendChild(item);
            });
        }
    }
    
    previewBookDialog.style.display = 'flex';
}

function hidePreviewBookDialog() {
    if (previewBookDialog) previewBookDialog.style.display = 'none';
}

function showPreviewChapterDialog(chapter) {
    if (!previewChapterDialog) return;
    
    const titleEl = document.getElementById('preview-chapter-title');
    const contentEl = document.getElementById('preview-chapter-content');
    
    if (titleEl) titleEl.textContent = chapter.title || '제목 없음';
    if (contentEl) contentEl.textContent = chapter.content || '내용이 없습니다.';
    
    previewChapterDialog.style.display = 'flex';
}

function hidePreviewChapterDialog() {
    if (previewChapterDialog) previewChapterDialog.style.display = 'none';
}

// Render the Bookshelf View
function renderBookshelf() {
    const booksGrid = document.getElementById('books-grid');
    if (!booksGrid) return;
    
    booksGrid.innerHTML = '';
    
    // Update bookshelf title dynamically with user's pen name
    const bookshelfTitleEl = document.getElementById('bookshelf-title');
    if (bookshelfTitleEl) {
        const authorName = currentUser?.user_metadata?.pen_name || currentUser?.user_metadata?.full_name || currentUser?.email || '';
        if (authorName) {
            bookshelfTitleEl.innerHTML = `작가 ${authorName}<span class="bookshelf-title-sub">님의 책장</span>`;
        } else {
            bookshelfTitleEl.textContent = '내 책장';
        }
    }
    
    // Add new project card
    const addCard = document.createElement('div');
    addCard.className = 'book-card';
    addCard.innerHTML = `
        <div class="book-cover cover-add">
            <div style="font-size: 2rem; font-weight: 300; line-height: 1;">+</div>
            <div style="font-size: 0.8rem; margin-top: 0.25rem;">새 작품 쓰기</div>
        </div>
        <div class="book-card-title-under" style="color: var(--text-secondary);">새 작품 추가</div>
        <div class="book-card-date-under" style="font-size: 0.75rem; color: transparent; margin-top: 0.15rem; font-weight: 300; user-select: none;">&nbsp;</div>
    `;
    addCard.addEventListener('click', () => {
        showNewBookDialog();
    });
    booksGrid.appendChild(addCard);
    
    // Make the add card accept drops (so items can be dropped back to the first spot)
    addCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingCard = document.querySelector('.book-card.dragging');
        if (!draggingCard) return;
        // Keep the addCard as the first element
        booksGrid.insertBefore(draggingCard, addCard.nextSibling);
    });
    
    const authorName = currentUser?.user_metadata?.pen_name || 'Monote';
    
    projects.forEach((proj) => {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        bookCard.dataset.id = proj.id;
        bookCard.setAttribute('draggable', 'true');
        
        const coverColor = proj.coverColor || 'charcoal';
        
        const deleteBtnHtml = proj.id === "monote-manual-guide"
            ? ""
            : `<button class="delete-book-btn" title="작품 삭제">×</button>`;

        const visibilityIconHtml = proj.id === "monote-manual-guide"
            ? ""
            : (proj.isPrivate 
                ? `<div class="book-visibility-icon private" title="비공개 (로컬 저장)">🔒</div>`
                : "");

        const totalCharCount = (proj.chapters || []).reduce((sum, ch) => sum + (ch.content ? ch.content.length : 0), 0);
        const dateObj = new Date(proj.updatedAt || proj.createdAt || Date.now());
        const formattedDate = `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')}`;

        bookCard.innerHTML = `
            ${deleteBtnHtml}
            <div class="book-cover cover-${coverColor}">
                ${visibilityIconHtml}
                <div class="book-cover-title">${proj.title || '제목 없음'}</div>
                <div class="book-cover-footer-group">
                    <div class="book-cover-charcount">${totalCharCount.toLocaleString()}자</div>
                    <div class="book-cover-author">${authorName}</div>
                </div>
            </div>
            <div class="book-card-title-under">${proj.title || '제목 없음'}</div>
            <div class="book-card-date-under" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem; font-weight: 300;">마지막 집필: ${formattedDate}</div>
        `;
        
        let isDragging = false;

        // Open project on click
        bookCard.addEventListener('click', (e) => {
            if (isDragging) return;
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

        // Desktop Drag & Drop Events
        bookCard.addEventListener('dragstart', (e) => {
            isDragging = true;
            bookCard.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', proj.id);
        });

        bookCard.addEventListener('dragend', (e) => {
            bookCard.classList.remove('dragging');
            saveAndRefreshBooksOrder();
            setTimeout(() => {
                isDragging = false;
            }, 100);
        });

        bookCard.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingCard = document.querySelector('.book-card.dragging');
            if (!draggingCard || draggingCard === bookCard) return;

            const rect = bookCard.getBoundingClientRect();
            // Determine drop placement based on center coordinates of target
            const isAfter = (e.clientX - rect.left) / (rect.right - rect.left) > 0.5 || 
                            (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;

            booksGrid.insertBefore(draggingCard, isAfter ? bookCard.nextSibling : bookCard);
        });

        // Mobile Touch Drag & Drop Events
        let touchStartCard = null;
        let dragStartX = 0;
        let dragStartY = 0;
        let hasMovedThreshold = false;
        let touchTimeout = null;
        let isLongPress = false;

        bookCard.addEventListener('touchstart', (e) => {
            touchStartCard = bookCard;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            hasMovedThreshold = false;
            isDragging = false;
            isLongPress = false;

            window.getSelection().removeAllRanges();

            if (touchTimeout) clearTimeout(touchTimeout);
            touchTimeout = setTimeout(() => {
                isLongPress = true;
                isDragging = true;
                bookCard.classList.add('dragging');
                if (navigator.vibrate) {
                    navigator.vibrate(40);
                }
            }, 500);
        }, { passive: true });

        bookCard.addEventListener('touchmove', (e) => {
            if (!touchStartCard) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - dragStartY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (distance > 8) {
                hasMovedThreshold = true;
                if (!isLongPress && touchTimeout) {
                    clearTimeout(touchTimeout);
                    touchTimeout = null;
                }
            }

            if (isLongPress && isDragging) {
                if (e.cancelable) e.preventDefault();
                window.getSelection().removeAllRanges();

                const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elementUnder) {
                    const targetCard = elementUnder.closest('.book-card');
                    if (targetCard && targetCard !== bookCard) {
                        if (targetCard === addCard) {
                            booksGrid.insertBefore(bookCard, addCard.nextSibling);
                        } else {
                            const rect = targetCard.getBoundingClientRect();
                            const isAfter = (touch.clientX - rect.left) / (rect.right - rect.left) > 0.5 || 
                                            (touch.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
                            booksGrid.insertBefore(bookCard, isAfter ? targetCard.nextSibling : targetCard);
                        }
                    }
                }
            }
        }, { passive: false });

        bookCard.addEventListener('touchend', (e) => {
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }

            if (!touchStartCard) return;

            bookCard.classList.remove('dragging');
            touchStartCard = null;

            if (isLongPress && isDragging) {
                e.preventDefault();
                saveAndRefreshBooksOrder();
                setTimeout(() => {
                    isDragging = false;
                    isLongPress = false;
                }, 100);
            }
        });

        bookCard.addEventListener('touchcancel', () => {
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }
            bookCard.classList.remove('dragging');
            touchStartCard = null;
            isDragging = false;
            isLongPress = false;
        });
        
        booksGrid.appendChild(bookCard);
    });
}

// Save order of books in localStorage
function saveAndRefreshBooksOrder() {
    const booksGrid = document.getElementById('books-grid');
    if (!booksGrid) return;

    const newProjectsOrder = [];
    const seenIds = new Set();
    const renderedCards = booksGrid.querySelectorAll('.book-card');
    renderedCards.forEach(cardEl => {
        const id = cardEl.dataset.id;
        if (id && !seenIds.has(id)) {
            const proj = projects.find(p => p.id === id);
            if (proj) {
                newProjectsOrder.push(proj);
                seenIds.add(id);
            }
        }
    });

    projects = newProjectsOrder;
    storage.setItem('monote-projects', JSON.stringify(projects));

    // Save order IDs list
    const orderList = projects.map(p => p.id);
    storage.setItem('monote-books-order', JSON.stringify(orderList));
}

// Sort projects globally using custom order list
function sortProjectsByOrder() {
    const orderList = JSON.parse(storage.getItem('monote-books-order') || '[]');
    if (orderList.length > 0) {
        projects.sort((a, b) => {
            const idxA = orderList.indexOf(a.id);
            const idxB = orderList.indexOf(b.id);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    }
}

// Dialog elements references helper
const newBookDialog = document.getElementById('new-book-dialog');
const newBookTitleInput = document.getElementById('new-book-title');
const editBookDialog = document.getElementById('edit-book-dialog');
const editBookTitleInput = document.getElementById('edit-book-title');

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

    const defaultVisibilityRadio = document.querySelector('input[name="book-visibility"][value="public"]');
    if (defaultVisibilityRadio) defaultVisibilityRadio.checked = true;

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
    
    const visibilityRadio = document.querySelector('input[name="book-visibility"]:checked');
    const isPrivate = visibilityRadio ? (visibilityRadio.value === 'private') : false;
    
    const newProj = {
        id: Date.now().toString(),
        title: title,
        synopsis: '',
        ideas: '',
        chapters: [],
        coverColor: coverColor,
        isPrivate: isPrivate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    if (currentUser) {
        newProj.user_id = currentUser.id;
    }
    
    projects.push(newProj);
    storage.setItem('monote-projects', JSON.stringify(projects));
    hideNewBookDialog();
    renderBookshelf();
    
    // Open immediately
    openProject(newProj.id);

    // Sync to Supabase
    if (supabaseClient && currentUser) {
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
    if (supabaseClient && currentUser) {
        updateSyncStatus('syncing', '동기화 중...');
        try {
            const { error } = await supabaseClient
                .from('open_projects')
                .delete()
                .eq('id', projectId)
                .eq('user_id', currentUser.id);
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
    const toggleManualItem = document.getElementById('toggle-manual-item');
    const editPennameItem = document.getElementById('edit-penname-item');

    if (user) {
        // Run check to prompt for pen name if not set
        checkPenName(user);

        // Remove the profile icon completely
        authContainer.innerHTML = '';
        authContainer.style.display = 'none';

        if (editPennameItem) {
            editPennameItem.style.display = 'flex';
            editPennameItem.onclick = () => {
                const currentPenName = user.user_metadata?.pen_name || '';
                const newPenName = prompt("작가 필명을 수정하시겠습니까?", currentPenName);
                if (newPenName === null) return; // Cancelled
                const trimmed = newPenName.trim();
                if (!trimmed) {
                    alert("사용할 필명을 입력해 주세요.");
                    return;
                }
                updateUserPenName(trimmed);
            };
        }

        if (toggleManualItem) {
            toggleManualItem.style.display = 'flex';
        }

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
        authContainer.style.display = '';
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

        if (editPennameItem) {
            editPennameItem.style.display = 'none';
            editPennameItem.onclick = null;
        }

        if (toggleManualItem) {
            toggleManualItem.style.display = 'none';
        }

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

// Prompt user to enter their Pen name if not set in metadata
function checkPenName(user) {
    if (!user) return;
    const penName = user.user_metadata?.pen_name;
    if (!penName) {
        const dialog = document.getElementById('penname-dialog');
        const input = document.getElementById('new-penname');
        const confirmBtn = document.getElementById('confirm-penname');

        if (dialog && input && confirmBtn) {
            dialog.style.display = 'flex';
            input.value = '';
            input.focus();

            confirmBtn.onclick = async () => {
                const value = input.value.trim();
                if (!value) {
                    alert("사용할 필명을 입력해 주세요.");
                    return;
                }

                try {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = "설정 중...";

                    const { data, error } = await supabaseClient.auth.updateUser({
                        data: { pen_name: value }
                    });

                    if (error) throw error;

                    dialog.style.display = 'none';
                    updateAuthUI(data.user);
                    renderBookshelf(); // Refresh book covers with the new pen name
                } catch (err) {
                    console.error("Failed to update pen name:", err);
                    alert(`필명 등록에 실패했습니다: ${err.message || err}`);
                } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = "설정 완료";
                }
            };
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
        
        // Filter out logged-in user's projects and keep only offline local projects (no user_id)
        const savedProjects = storage.getItem('monote-projects');
        let offlineProjects = [];
        if (savedProjects) {
            try {
                offlineProjects = JSON.parse(savedProjects).filter(p => !p.user_id || p.id === "monote-manual-guide");
            } catch (e) {
                console.error("Failed to parse projects during logout:", e);
            }
        }
        
        // Save only offline projects back to local storage
        storage.setItem('monote-projects', JSON.stringify(offlineProjects));
        storage.removeItem('monote-active-project-id');
        storage.removeItem('monote-active-chapter-id');
        
        projects = offlineProjects;
        activeProjectId = null;
        activeChapterId = null;
        project = null;
        
        showBookshelfScreen();
        renderBookshelf();
    } catch (err) {
        console.error("Logout failed:", err);
        alert(`로그아웃에 실패했습니다: ${err.message || err}`);
    }
}

async function updateUserPenName(newVal) {
    if (!supabaseClient) return;
    try {
        updateSyncStatus('syncing', '필명 업데이트 중...');
        const { data, error } = await supabaseClient.auth.updateUser({
            data: { pen_name: newVal }
        });
        if (error) throw error;
        
        updateAuthUI(data.user);
        renderBookshelf(); // Refresh book covers with the new pen name
        updateSyncStatus('success', '필명 업데이트 완료');
        alert(`필명이 "${newVal}"(으)로 변경되었습니다.`);
    } catch (err) {
        console.error("Failed to update pen name:", err);
        alert(`필명 변경에 실패했습니다: ${err.message || err}`);
        updateSyncStatus('error', '업데이트 실패');
    }
}

function updateManualToggleUI() {
    const textSpan = document.getElementById('toggle-manual-text');
    if (textSpan) {
        textSpan.textContent = hideManual ? '설명서 보이기' : '설명서 숨기기';
    }
}

// Show edit book dialog
function showEditBookDialog() {
    if (!project) return;
    editBookTitleInput.value = project.title || '';

    // Reset color option active class in edit color picker
    document.querySelectorAll('#edit-book-dialog .cover-color-picker .color-option').forEach(opt => {
        opt.classList.remove('active');
    });

    const activeColor = project.coverColor || 'charcoal';
    const targetOpt = document.querySelector(`#edit-book-dialog .cover-color-picker .color-option.${activeColor}`);
    if (targetOpt) targetOpt.classList.add('active');

    const colorRadio = document.querySelector(`#edit-book-dialog input[name="edit-cover-color"][value="${activeColor}"]`);
    if (colorRadio) colorRadio.checked = true;

    const activeVisibility = project.isPrivate ? 'private' : 'public';
    const visibilityRadio = document.querySelector(`#edit-book-dialog input[name="edit-book-visibility"][value="${activeVisibility}"]`);
    if (visibilityRadio) visibilityRadio.checked = true;

    editBookDialog.style.display = 'flex';
    setTimeout(() => {
        editBookTitleInput.focus();
    }, 100);
}

// Hide edit book dialog
function hideEditBookDialog() {
    editBookDialog.style.display = 'none';
}

// Save edited project settings
async function saveEditBookSettings() {
    const title = editBookTitleInput.value.trim();
    if (!title) {
        alert("작품 제목을 입력해 주세요.");
        editBookTitleInput.focus();
        return;
    }

    const selectedColorRadio = document.querySelector('#edit-book-dialog input[name="edit-cover-color"]:checked');
    const coverColor = selectedColorRadio ? selectedColorRadio.value : 'charcoal';

    const visibilityRadio = document.querySelector('#edit-book-dialog input[name="edit-book-visibility"]:checked');
    const isPrivate = visibilityRadio ? (visibilityRadio.value === 'private') : false;

    // Update active project copy
    project.title = title;
    project.coverColor = coverColor;
    project.isPrivate = isPrivate;
    project.updatedAt = new Date().toISOString();

    // Sync back to projects list
    const idx = projects.findIndex(p => p.id === activeProjectId);
    if (idx !== -1) {
        projects[idx].title = title;
        projects[idx].coverColor = coverColor;
        projects[idx].isPrivate = isPrivate;
        projects[idx].updatedAt = project.updatedAt;
        if (currentUser) {
            projects[idx].user_id = currentUser.id;
        }
        storage.setItem('monote-projects', JSON.stringify(projects));
    }

    // Update Overview screen inputs
    projectTitleInput.value = title;

    hideEditBookDialog();
    renderOverview();
    renderBookshelf();

    // Sync to Supabase
    if (supabaseClient && currentUser) {
        updateSyncStatus('syncing', '동기화 중...');
        try {
            await saveProjectToCloud(project);
            updateSyncStatus('success', '동기화 완료');
        } catch (err) {
            console.error('Failed to sync project settings to cloud:', err);
            updateSyncStatus('error', '동기화 실패');
        }
    }
}
